import express from 'express';
import cors from 'cors';
import dgram from 'dgram';
import os from 'os';
import path from 'path';
import axios from 'axios';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Determine static files path:
// 1. DIST_PATH env var (set by Electron app)
// 2. Production default: /app/dist (Docker)
// 3. Development: ../dist relative to server
const distPath = process.env.DIST_PATH
  || (process.env.NODE_ENV === 'production' ? '/app/dist' : path.join(__dirname, '..', 'dist'));

// Discovery keyword
const DISCOVERY_KEYWORD = Buffer.from('FF010102', 'hex');
const DISCOVERY_PORT = 1901;
const DISCOVERY_TIMEOUT = 3000;
const HTTP_TIMEOUT = 3000; // 3 second timeout for HTTP requests

// UDP Configuration commands (from MXX.exe protocol analysis)
const UDP_CMD_SAVE_REBOOT = 0x04;   // FF 13 04 - Save and reboot

// Create axios instance with timeout
const httpClient = axios.create({
  timeout: HTTP_TIMEOUT,
  validateStatus: () => true, // Don't throw on any status code
});

// N720 Reporting Fields by Meter Type
// These are the fields that get included in the report template JSON
const N720_REPORTING_FIELDS = {
  'XMC34F': [
    'v_l1', 'v_l2', 'v_l3', 'i_l1', 'i_l2', 'i_l3',
    'p_l1', 'p_l2', 'p_l3', 'freq', 'q_l1', 'q_l2', 'q_l3',
    'p_tot', 'q_tot', 's_tot', 'pf_tot', 'e_tot', 'e_q_tot',
    'pf_sgn_tot', 'p_sgn_tot', 'q_sgn_tot',
    'p_sgn_l1', 'p_sgn_l2', 'p_sgn_l3',
    'q_sgn_l1', 'q_sgn_l2', 'q_sgn_l3',
    'ktv', 'kta'
  ],
  'EM4371': [
    'v_l1', 'v_l2', 'v_l3', 'v_l1_l2', 'v_l3_l2', 'v_l1_l3',
    'i_l1', 'i_l2', 'i_l3',
    'p_l1', 'p_l2', 'p_l3',
    'pf_l1', 'pf_l2', 'pf_l3',
    'freq', 'q_l1', 'q_l2', 'q_l3',
    's_l1', 's_l2', 's_l3',
    'e_tot', 'ct_ratio', 'pt_ratio', 'wiring_mode'
  ],
  'Sfere720': [
    'v_l1', 'v_l2', 'v_l3', 'i_l1', 'i_l2', 'i_l3', 'i_tot',
    'p_l1', 'p_l2', 'p_l3', 'p_tot', 'freq',
    'q_l1', 'q_l2', 'q_l3', 'q_tot',
    's_l1', 's_l2', 's_l3', 's_tot',
    'pf_l1', 'pf_l2', 'pf_l3', 'pf_tot',
    'e_l1', 'e_l2', 'e_l3', 'e_tot', 'e_q_tot',
    'thd_v_l1', 'thd_v_l2', 'thd_v_l3',
    'thd_i_l1', 'thd_i_l2', 'thd_i_l3'
  ],
  'EnergyNG9': [
    'v_l1', 'v_l2', 'v_l3',
    'i_l1', 'i_l2', 'i_l3', 'i_l4', 'i_l5', 'i_l6', 'i_l7', 'i_l8', 'i_l9', 'i_tot',
    's_l1', 's_l2', 's_l3', 's_l4', 's_l5', 's_l6', 's_l7', 's_l8', 's_l9', 's_tot',
    'p_l1', 'p_l2', 'p_l3', 'p_l4', 'p_l5', 'p_l6', 'p_l7', 'p_l8', 'p_l9', 'p_tot',
    'q_l1', 'q_l2', 'q_l3',
    'pf_l1', 'pf_l2', 'pf_l3',
    'freq',
    'e_l1', 'e_l2', 'e_l3', 'e_tot', 'e_neg_tot'
  ],
  'TAC4300': [
    'v_l1', 'v_l2', 'v_l3', 'i_l1', 'i_l2', 'i_l3', 'i_tot',
    'p_l1', 'p_l2', 'p_l3', 'p_tot', 'freq',
    'q_l1', 'q_l2', 'q_l3',
    's_l1', 's_l2', 's_l3', 's_tot',
    'pf_l1', 'pf_l2', 'pf_l3',
    'e_l1', 'e_l2', 'e_l3', 'e_tot', 'e_neg_tot',
    'i_max_l1', 'i_max_l2', 'i_max_l3',
    'thd_v_l1', 'thd_v_l2', 'thd_v_l3',
    'thd_i_l1', 'thd_i_l2', 'thd_i_l3'
  ]
};

// Helper function to get reporting fields for a meter type
function getN720ReportingFields(meterType) {
  return N720_REPORTING_FIELDS[meterType] || N720_REPORTING_FIELDS['XMC34F'];
}

// Helper function to check if an IP is reachable from local network
function isIpReachable(gatewayIp, localInterfaces) {
  const gatewayParts = gatewayIp.split('.').map(Number);

  for (const iface of localInterfaces) {
    const localParts = iface.address.split('.').map(Number);
    const maskParts = iface.netmask.split('.').map(Number);

    // Check if gateway is in the same subnet as this interface
    const localNetwork = localParts.map((p, i) => p & maskParts[i]);
    const gatewayNetwork = gatewayParts.map((p, i) => p & maskParts[i]);

    if (localNetwork.every((n, i) => n === gatewayNetwork[i])) {
      return true;
    }
  }
  return false;
}

// Get all local IPv4 interfaces
function getLocalInterfaces() {
  const interfaces = os.networkInterfaces();
  const result = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        result.push(iface);
      }
    }
  }
  return result;
}

// Helper function to make HTTP requests with axios (proper timeout)
async function makeRequest(url, options = {}) {
  const config = {
    url,
    method: options.method || 'GET',
    headers: options.headers || {},
    timeout: HTTP_TIMEOUT,
  };

  if (options.body) {
    config.data = options.body;
  }

  return httpClient.request(config);
}

// Special function for port$.cgi requests - uses raw HTTP with minimal headers
// The gateway has non-standard HTTP behavior that causes issues with axios
function makePortConfigRequest(host, queryString) {
  return new Promise((resolve, reject) => {
    const fullPath = `/port$.cgi?${queryString}`;
    console.log(`  -> Raw HTTP request to: http://${host}${fullPath}`);

    const options = {
      hostname: host,
      port: 80,
      path: fullPath,
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
        'Connection': 'close',
      },
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`  -> Port config response: ${res.statusCode} - ${data.substring(0, 100)}`);
        resolve({ success: true, status: res.statusCode, data });
      });
    });

    req.on('error', (err) => {
      // For port$.cgi, the gateway often closes the connection immediately
      // but still processes the request. Treat certain errors as success.
      if (err.code === 'ECONNRESET' || err.message.includes('socket hang up')) {
        console.log(`  -> Port config connection closed (may still have worked)`);
        resolve({ success: true, connectionClosed: true });
      } else {
        console.log(`  -> Port config error: ${err.message}`);
        reject(err);
      }
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

// Parse discovery response
function parseDiscoveryResponse(data, remoteIp) {
  try {
    if (data.length < 20) return null;

    const header = data.slice(0, 2).toString('hex').toUpperCase();
    if (header !== 'FF24' && header !== 'FF01') return null;

    if (data.toString('hex').toUpperCase() === 'FF010102') return null;

    // Always log for debugging
    const hexStr = data.toString('hex');
    console.log('Discovery response hex:', hexStr);
    console.log('Discovery response length:', data.length);
    console.log('Discovery remoteIp (source):', remoteIp);

    const ipBytes = data.slice(5, 9);
    let ip = `${ipBytes[0]}.${ipBytes[1]}.${ipBytes[2]}.${ipBytes[3]}`;

    const macBytes = data.slice(9, 15);
    const mac = Array.from(macBytes)
      .map(b => b.toString(16).padStart(2, '0').toUpperCase())
      .join('-');

    let firmware = '';
    let model = '';

    // Try to extract from ASCII portion starting at byte 15
    const dataStr = data.toString('ascii', 15);
    // Filter out non-printable characters for better matching
    const cleanStr = dataStr.replace(/[^\x20-\x7E]/g, ' ');
    console.log('Discovery ASCII (cleaned):', cleanStr);

    // Look for version pattern (e.g., V2.0.19 or 2.0.19)
    const versionMatch = cleanStr.match(/V?(\d+\.\d+\.\d+)/);
    if (versionMatch) {
      firmware = versionMatch[0];
    }

    // Look for model pattern (e.g., USR-N510 or N510 or N720)
    const modelMatch = cleanStr.match(/(USR-)?N\d{3}/i);
    if (modelMatch) {
      model = modelMatch[0];
    }

    // If still no firmware, try looking at specific byte positions
    // Some firmware versions store it at fixed offsets
    if (!firmware && data.length >= 30) {
      // Try bytes 20-30 for version info
      const versionSection = data.slice(15, 40).toString('ascii').replace(/[^\x20-\x7E]/g, '');
      const altVersionMatch = versionSection.match(/V?(\d+\.\d+\.\d+)/);
      if (altVersionMatch) {
        firmware = altVersionMatch[0];
      }
    }

    // If still no firmware, try the entire buffer
    if (!firmware) {
      const fullStr = data.toString('ascii').replace(/[^\x20-\x7E]/g, '');
      const fullVersionMatch = fullStr.match(/V?(\d+\.\d+\.\d+)/);
      if (fullVersionMatch) {
        firmware = fullVersionMatch[0];
      }
    }

    // CRITICAL: ALWAYS use remoteIp from UDP packet source as the actual gateway IP
    // The IP embedded in the discovery packet is the gateway's CONFIGURED IP, which may be:
    // - The factory default (192.168.0.7) even after DHCP assigns a new IP
    // - An old static IP that no longer matches the actual IP
    // The remoteIp is the ACTUAL IP the gateway is responding from
    if (ip !== remoteIp) {
      console.log(`Using remoteIp ${remoteIp} instead of packet IP ${ip} (packet IP may be stale)`);
      ip = remoteIp;
    }

    // Log warning for invalid IPs like 0.0.0.0 (gateway in transition/reset state)
    // We still return the gateway so the client can track it by MAC and wait for valid IP
    if (ip === '0.0.0.0' || ip === '255.255.255.255') {
      console.log(`Gateway with invalid IP ${ip} (MAC: ${mac}) - may be rebooting or getting DHCP`);
    }

    console.log('Parsed - IP:', ip, 'MAC:', mac, 'Model:', model || 'USR Gateway', 'Firmware:', firmware || '-');

    return {
      ip: ip,
      mac: mac || 'Unknown',
      model: model || 'USR Gateway',
      firmware: firmware || '-'
    };
  } catch (error) {
    console.error('Error parsing discovery response:', error);
    return null;
  }
}

// UDP Gateway Discovery endpoint
app.get('/api/discover', async (req, res) => {
  const gateways = [];
  const localInterfaces = getLocalInterfaces();

  const socket = dgram.createSocket('udp4');

  socket.on('error', (err) => {
    console.error('Socket error:', err);
    socket.close();
  });

  socket.on('message', (msg, rinfo) => {
    console.log(`Received response from ${rinfo.address}:${rinfo.port}`);
    const gateway = parseDiscoveryResponse(msg, rinfo.address);
    if (gateway) {
      const isValidIp = gateway.ip !== '0.0.0.0' && gateway.ip !== '255.255.255.255';

      // Check if we already have this MAC
      const existingIndex = gateways.findIndex(g => g.mac === gateway.mac);

      if (existingIndex >= 0) {
        // We already have this MAC - update only if new IP is valid and old was invalid
        const existing = gateways[existingIndex];
        const existingIsValid = existing.ip !== '0.0.0.0' && existing.ip !== '255.255.255.255';

        if (isValidIp && !existingIsValid) {
          // Replace invalid IP with valid one
          console.log(`Updating gateway ${gateway.mac}: ${existing.ip} -> ${gateway.ip}`);
          const sameSubnet = isIpReachable(gateway.ip, localInterfaces);
          gateway.sameSubnet = sameSubnet;
          gateways[existingIndex] = gateway;
        }
      } else {
        // New MAC - add it (even with invalid IP, so we track it)
        const sameSubnet = isIpReachable(gateway.ip, localInterfaces);
        gateway.sameSubnet = sameSubnet;
        gateways.push(gateway);
        console.log('Discovered gateway:', gateway, sameSubnet ? '(same subnet)' : '(different subnet - may need direct connection)');
      }
    }
  });

  socket.bind(() => {
    socket.setBroadcast(true);

    socket.send(DISCOVERY_KEYWORD, DISCOVERY_PORT, '255.255.255.255', (err) => {
      if (err) {
        console.error('Error sending broadcast:', err);
      } else {
        console.log('Sent discovery broadcast');
      }
    });

    for (const iface of localInterfaces) {
      const ipParts = iface.address.split('.').map(Number);
      const maskParts = iface.netmask.split('.').map(Number);
      const broadcastParts = ipParts.map((ip, i) => (ip | (~maskParts[i] & 255)));
      const broadcast = broadcastParts.join('.');

      console.log(`Sending to broadcast: ${broadcast}`);
      socket.send(DISCOVERY_KEYWORD, DISCOVERY_PORT, broadcast, (err) => {
        if (err) console.error(`Error sending to ${broadcast}:`, err);
      });
    }
  });

  setTimeout(async () => {
    socket.close();

    // Only probe known IPs if UDP discovery found nothing
    // This avoids adding delay when UDP discovery is working fine
    if (gateways.length === 0) {
      console.log('No gateways found via UDP, probing known IPs via HTTP...');
      const KNOWN_GATEWAY_IPS = ['192.168.0.7', '192.168.1.200'];

      // Helper function to probe a single IP with short timeout
      const probeGatewayIp = async (probeIp) => {
        const headers = {
          'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
        };

        // Try N510 endpoint first
        try {
          const url = `http://${probeIp}/define.json`;
          console.log(`Probing N510 at ${probeIp}...`);
          const response = await httpClient.get(url, { timeout: 1500, headers });
          if (response.status === 200 && response.data) {
            const define = response.data;
            const gateway = {
              ip: probeIp,
              mac: define.usermac || 'Unknown',
              firmware: define.ver || '-',
              model: define.modename || 'USR-N510',
              gatewayType: 'N510',
              sameSubnet: isIpReachable(probeIp, localInterfaces),
            };
            console.log(`Found N510 gateway at ${probeIp}:`, gateway);
            return gateway;
          }
        } catch (err) {
          // Silent fail - don't log timeout errors for unreachable IPs
        }

        // Try N720 endpoint
        try {
          const url = `http://${probeIp}/download_flex.cgi?name=status`;
          console.log(`Probing N720 at ${probeIp}...`);
          const response = await httpClient.get(url, { timeout: 1500, headers });
          if (response.status === 200 && response.data && response.data.soft_ver) {
            const status = response.data;
            let mac = status.mac || 'Unknown';
            if (mac && !mac.includes('-') && !mac.includes(':')) {
              mac = mac.match(/.{2}/g)?.join('-') || mac;
            }
            const gateway = {
              ip: probeIp,
              mac: mac,
              firmware: status.soft_ver,
              model: 'N720',
              gatewayType: 'N720',
              sameSubnet: isIpReachable(probeIp, localInterfaces),
            };
            console.log(`Found N720 gateway at ${probeIp}:`, gateway);
            return gateway;
          }
        } catch (err) {
          // Silent fail
        }

        return null;
      };

      // Probe all known IPs in parallel
      const probeResults = await Promise.all(KNOWN_GATEWAY_IPS.map(probeGatewayIp));

      for (const gateway of probeResults) {
        if (gateway) {
          gateways.push(gateway);
        }
      }
    }

    // Enrich gateway info by fetching device info from each discovered gateway
    // Try N510 endpoint first (define.json), then N720 endpoint (download_flex.cgi?name=status)
    const enrichedGateways = await Promise.all(
      gateways.map(async (gateway) => {
        const headers = {
          'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
        };

        // Try N510 endpoint first (define.json)
        try {
          const url = `http://${gateway.ip}/define.json`;
          const response = await httpClient.get(url, { timeout: 2000, headers });
          if (response.status === 200 && response.data) {
            const define = response.data;
            if (define.ver) gateway.firmware = define.ver;
            if (define.modename) gateway.model = define.modename;
            gateway.gatewayType = 'N510';
            console.log(`Enriched N510 gateway ${gateway.ip}: firmware=${gateway.firmware}, model=${gateway.model}, mac=${gateway.mac}`);
            return gateway;
          }
        } catch (err) {
          console.log(`Could not fetch define.json from ${gateway.ip}: ${err.message}`);
        }

        // Try N720 endpoint (download_flex.cgi?name=status)
        try {
          const url = `http://${gateway.ip}/download_flex.cgi?name=status`;
          const response = await httpClient.get(url, { timeout: 2000, headers });
          if (response.status === 200 && response.data && response.data.soft_ver) {
            const status = response.data;
            gateway.firmware = status.soft_ver;
            gateway.model = 'N720';
            gateway.gatewayType = 'N720';
            // Format MAC from N720 format (no separators) to standard format
            if (status.mac && !status.mac.includes('-') && !status.mac.includes(':')) {
              gateway.mac = status.mac.match(/.{2}/g)?.join('-') || status.mac;
            }
            console.log(`Enriched N720 gateway ${gateway.ip}: firmware=${gateway.firmware}, model=${gateway.model}, mac=${gateway.mac}`);
            return gateway;
          }
        } catch (err) {
          console.log(`Could not fetch N720 status from ${gateway.ip}: ${err.message}`);
        }

        // Unknown gateway type
        gateway.gatewayType = 'unknown';
        return gateway;
      })
    );

    res.json({ gateways: enrichedGateways });
  }, DISCOVERY_TIMEOUT);
});

// Direct HTTP probe for a specific gateway IP
// Used when UDP discovery fails but we want to check if a gateway is at a known IP
app.get('/api/probe-gateway', async (req, res) => {
  const ip = req.query.ip;

  if (!ip) {
    return res.status(400).json({ found: false, error: 'Missing ip parameter' });
  }

  console.log(`\n=== PROBING GATEWAY at ${ip} ===`);

  const headers = {
    'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
  };

  const localInterfaces = getLocalInterfaces();

  // Try N510 endpoint first
  try {
    const url = `http://${ip}/define.json`;
    console.log(`Probing N510 at ${ip}...`);
    const response = await httpClient.get(url, { timeout: 3000, headers });
    if (response.status === 200 && response.data) {
      const define = response.data;
      const gateway = {
        ip: ip,
        mac: define.usermac || 'Unknown',
        firmware: define.ver || '-',
        model: define.modename || 'USR-N510',
        gatewayType: 'N510',
        sameSubnet: isIpReachable(ip, localInterfaces),
      };
      console.log(`Found N510 gateway at ${ip}:`, gateway);
      return res.json({ found: true, gateway });
    }
  } catch (err) {
    console.log(`No N510 at ${ip}: ${err.message}`);
  }

  // Try N720 endpoint
  try {
    const url = `http://${ip}/download_flex.cgi?name=status`;
    console.log(`Probing N720 at ${ip}...`);
    const response = await httpClient.get(url, { timeout: 3000, headers });
    if (response.status === 200 && response.data && response.data.soft_ver) {
      const status = response.data;
      let mac = status.mac || 'Unknown';
      // Format MAC from N720 format (no separators) to standard format
      if (mac && !mac.includes('-') && !mac.includes(':')) {
        mac = mac.match(/.{2}/g)?.join('-') || mac;
      }
      const gateway = {
        ip: ip,
        mac: mac,
        firmware: status.soft_ver,
        model: 'N720',
        gatewayType: 'N720',
        sameSubnet: isIpReachable(ip, localInterfaces),
      };
      console.log(`Found N720 gateway at ${ip}:`, gateway);
      return res.json({ found: true, gateway });
    }
  } catch (err) {
    console.log(`No N720 at ${ip}: ${err.message}`);
  }

  console.log(`No gateway found at ${ip}`);
  res.json({ found: false });
});

// Special endpoint for port configuration using raw TCP socket
// The gateway's port$.cgi has broken HTTP that causes issues with most HTTP clients
// Using raw TCP socket gives us full control and ignores malformed responses
app.get('/api/configure-port', async (req, res) => {
  const host = req.query.host;

  if (!host) {
    return res.status(400).json({ error: 'Missing host parameter' });
  }

  console.log(`\n=== PORT CONFIGURATION via raw TCP socket for ${host} ===`);

  const net = await import('net');

  const queryString = 'buad=9600&serialmode=3&runserialmode=1';
  const path = `/port$.cgi?${queryString}`;
  const authHeader = 'Basic ' + Buffer.from('admin:admin').toString('base64');

  console.log('Path:', path);

  // Build raw HTTP request - use HTTP/1.1 format like a browser would
  const httpRequest = [
    `GET ${path} HTTP/1.1`,
    `Host: ${host}`,
    `Authorization: ${authHeader}`,
    `User-Agent: Mozilla/5.0`,
    `Accept: */*`,
    `Connection: close`,
    ``,
    ``
  ].join('\r\n');

  console.log('Sending raw HTTP request via TCP socket...');
  console.log('Request:', httpRequest.replace(/\r\n/g, '\\r\\n '));

  const configPromise = new Promise((resolve) => {
    const socket = new net.default.Socket();
    let responseData = '';
    let resolved = false;

    const cleanup = (reason) => {
      if (!resolved) {
        resolved = true;
        console.log(`Cleanup called: ${reason}, received ${responseData.length} bytes`);
        socket.destroy();
        resolve({ status: 200, data: responseData || 'Request sent' });
      }
    };

    socket.setTimeout(10000); // Longer timeout

    socket.on('connect', () => {
      console.log('TCP socket connected, sending request...');
      socket.write(httpRequest, () => {
        console.log('Request written to socket');
      });
    });

    socket.on('data', (data) => {
      responseData += data.toString();
      console.log('Received data:', data.toString().substring(0, 200));
    });

    socket.on('close', () => {
      cleanup('socket closed');
    });

    socket.on('end', () => {
      console.log('Socket end event');
      cleanup('socket end');
    });

    socket.on('timeout', () => {
      cleanup('timeout');
    });

    socket.on('error', (err) => {
      console.log('Socket error:', err.code, err.message);
      cleanup(`error: ${err.code}`);
    });

    socket.connect(80, host);
  });

  try {
    const result = await configPromise;
    console.log('Config request completed with status:', result.status);
    console.log('Response data:', result.data?.substring?.(0, 200) || result.data);

    // Try sending the request again after a short delay (some devices need this)
    console.log('Waiting 2 seconds then sending config again...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Second attempt with same TCP socket approach
    const secondAttempt = await new Promise((resolve) => {
      const socket = new net.default.Socket();
      let responseData = '';
      let resolved = false;
      const cleanup = (reason) => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve({ data: responseData, reason });
        }
      };
      socket.setTimeout(5000);
      socket.on('connect', () => {
        socket.write(httpRequest);
      });
      socket.on('data', (data) => {
        responseData += data.toString();
      });
      socket.on('close', () => cleanup('close'));
      socket.on('end', () => cleanup('end'));
      socket.on('timeout', () => cleanup('timeout'));
      socket.on('error', (err) => cleanup(err.code));
      socket.connect(80, host);
    });
    console.log('Second attempt result:', secondAttempt.reason, secondAttempt.data?.substring?.(0, 100));

    // Reboot gateway to apply port settings
    console.log('Rebooting gateway to apply port settings...');
    try {
      await makeRequest(`http://${host}/misc.cgi?reboot=1`, {
        headers: { 'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64') }
      });
    } catch (rebootErr) {
      // Reboot may close connection - that's expected
      console.log('Reboot request sent (connection may have closed)');
    }

    // Wait for gateway to restart
    console.log('Waiting 15 seconds for gateway to restart...');
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Verify the configuration
    let verified = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`Verification attempt ${attempt}...`);
        const verifyPromise = new Promise((resolve, reject) => {
          const verifyReq = http.request({
            hostname: host,
            port: 80,
            path: '/port0.json',
            method: 'GET',
            headers: {
              'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
              'Connection': 'close',
            },
            timeout: 5000,
          }, (response) => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
              try {
                resolve(JSON.parse(data));
              } catch (e) {
                reject(new Error('Failed to parse verification'));
              }
            });
          });
          verifyReq.on('error', reject);
          verifyReq.on('timeout', () => reject(new Error('Verify timeout')));
          verifyReq.end();
        });

        const verifyConfig = await verifyPromise;
        console.log('Verification: buad=', verifyConfig.buad, 'serialmode=', verifyConfig.serialmode);

        if (verifyConfig.buad === '9600' && verifyConfig.serialmode === '3') {
          verified = true;
          console.log('PORT CONFIGURATION VERIFIED SUCCESSFULLY!');
          break;
        } else {
          console.log('Port config NOT applied yet. Current values:', verifyConfig.buad, verifyConfig.serialmode);
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      } catch (verifyErr) {
        console.log(`Verification attempt ${attempt} failed:`, verifyErr.message);
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    res.json({ success: verified, status: result.status });
  } catch (err) {
    console.log('Port configuration failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Proxy GET requests to gateway
app.get('/api/proxy', async (req, res) => {
  // Disable caching for all proxy requests
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  const host = req.query.host;
  let path = req.query.path;

  if (!host || !path) {
    return res.status(400).json({ error: 'Missing host or path query parameter' });
  }

  // Remove leading slash if present to avoid double slashes
  if (path.startsWith('/')) {
    path = path.substring(1);
  }

  // Decode the path - may be encoded multiple times by the client
  // Keep decoding until it stops changing
  let decodedPath = path;
  let prevPath;
  do {
    prevPath = decodedPath;
    try {
      decodedPath = decodeURIComponent(decodedPath);
    } catch (e) {
      break; // Stop if decoding fails (invalid encoding)
    }
  } while (decodedPath !== prevPath);
  path = decodedPath;

  console.log(`  Decoded path: ${path}`);

  const protocol = host.includes('ngrok') ? 'https' : 'http';

  // Check if path already contains query string (e.g., port$.cgi?buad=9600&...)
  // If so, don't append additional query params
  let url;
  if (path.includes('?')) {
    // Path already has query string, use it directly
    url = `${protocol}://${host}/${path}`;
  } else {
    // No query string in path, append any additional query params
    const queryParams = { ...req.query };
    delete queryParams.host;
    delete queryParams.path;
    const queryString = new URLSearchParams(queryParams).toString();
    url = `${protocol}://${host}/${path}${queryString ? '?' + queryString : ''}`;
  }

  console.log(`Proxying GET to: ${url}`);
  const startTime = Date.now();

  // Special handling for port$.cgi
  // The gateway's port$.cgi returns non-standard HTTP responses that may cause
  // connection resets or socket hang ups. Use raw HTTP module for better control.
  if (path.includes('port$.cgi')) {
    console.log('  -> port$.cgi detected, using raw HTTP request');

    // Re-encode the path to ensure special characters are properly escaped
    // Split path into base and query string, then re-encode query string values
    let encodedPath = '/' + path;
    if (path.includes('?')) {
      const [basePath, queryString] = path.split('?');
      const params = new URLSearchParams(queryString);
      // URLSearchParams will properly encode values
      encodedPath = '/' + basePath + '?' + params.toString();
    }

    // Use raw http module like a browser would - this seems to work better
    // than axios for this quirky endpoint
    const httpOptions = {
      hostname: host,
      port: 80,
      path: encodedPath,
      method: 'GET',
      headers: {
        'Host': host,
        'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Referer': `http://${host}/ser2net1.html`,
      },
      timeout: 5000,
    };

    console.log(`  -> Raw HTTP to: http://${host}${encodedPath.substring(0, 200)}...`);

    const httpReq = http.request(httpOptions, (httpRes) => {
      let data = '';
      httpRes.on('data', chunk => data += chunk);
      httpRes.on('end', () => {
        console.log(`  -> port$.cgi response: ${httpRes.statusCode} - ${data.substring(0, 100)}`);
        res.send(data || '<html><head><title>ok</title></head></html>');
      });
    });

    httpReq.on('error', (err) => {
      // Connection reset is common but the request may still have been processed
      console.log(`  -> port$.cgi error: ${err.code || err.message}`);
      res.send('<html><head><title>ok</title></head></html>');
    });

    httpReq.on('timeout', () => {
      console.log('  -> port$.cgi timeout');
      httpReq.destroy();
      res.send('<html><head><title>ok</title></head></html>');
    });

    httpReq.end();
    return;
  }

  const headers = {
    'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
  };

  if (host.includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }

  // Retry logic for transient connection errors (ECONNRESET, etc.)
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await makeRequest(url, { headers });
      console.log(`  -> Response in ${Date.now() - startTime}ms: ${response.status}`);
      const contentType = response.headers['content-type'] || '';

      // Check for 404 responses (gateway returns 404 for non-existent endpoints)
      if (response.status === 404) {
        console.log(`  -> 404 Not Found: ${path}`);
        return res.status(404).json({ error: 'Not Found', path });
      }

      // Special handling for N720 edge_report endpoint
      // The response may have:
      // 1. A 4-byte binary header (from /upload/nv1 format) before the JSON
      // 2. Truncated JSON (starts with 'oup":[' instead of '{"group":[')
      if (path.includes('download_nv.cgi') && path.includes('edge_report')) {
        let rawData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        console.log(`  -> edge_report raw response: ${rawData.substring(0, 80)}...`);
        console.log(`  -> edge_report first 10 bytes hex: ${[...rawData.substring(0, 10)].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ')}`);

        // Case 1: Strip binary header by finding the first '{' character
        // The header bytes are binary data (4 bytes) before the JSON starts
        const jsonStart = rawData.indexOf('{');
        if (jsonStart > 0) {
          console.log(`  -> Found JSON start at position ${jsonStart}, stripping header`);
          rawData = rawData.substring(jsonStart);
        }

        // Case 2: Check if response is truncated (starts with 'oup":[')
        if (rawData.startsWith('oup":[')) {
          rawData = '{"gr' + rawData;
          console.log('  -> Fixed truncated edge_report response');
        }

        try {
          const parsed = JSON.parse(rawData);
          console.log(`  -> Parsed edge_report successfully: ${parsed.group?.length || 0} groups`);
          return res.json(parsed);
        } catch (parseErr) {
          console.log('  -> Failed to parse edge_report:', parseErr.message);
          console.log('  -> Data after processing: ${rawData.substring(0, 100)}');
          // Return empty config if parsing fails
          return res.json({ group: [] });
        }
      }

      if (contentType.includes('application/json') || path.endsWith('.json')) {
        return res.json(response.data);
      } else {
        // Log CGI responses for debugging
        if (path.includes('.cgi')) {
          console.log(`CGI response from ${path}: ${String(response.data).substring(0, 200)}`);
        }
        return res.type(contentType).send(response.data);
      }
    } catch (error) {
      lastError = error;
      const errorMsg = error.code === 'ECONNABORTED' ? 'Connection timeout' :
                       error.code === 'ECONNREFUSED' ? 'Connection refused' :
                       error.message || String(error);

      // Special handling for port$.cgi - the gateway has non-standard HTTP behavior
      // that causes "socket hang up" errors, but the request is still processed
      if (path.includes('port$.cgi') && (errorMsg.includes('socket hang up') || errorMsg.includes('ECONNRESET'))) {
        console.log(`  -> port$.cgi socket closed (expected behavior) - treating as success`);
        return res.send('<html><head><title>hello</title></head></html>');
      }

      // Retry on ECONNRESET errors (connection reset by peer)
      if (errorMsg.includes('ECONNRESET') && attempt < maxRetries) {
        console.log(`  -> ECONNRESET on attempt ${attempt}, retrying in 500ms...`);
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }

      // Don't retry other errors
      break;
    }
  }

  // All retries failed
  const elapsed = Date.now() - startTime;
  const errorMsg = lastError?.code === 'ECONNABORTED' ? 'Connection timeout' :
                   lastError?.code === 'ECONNREFUSED' ? 'Connection refused' :
                   lastError?.message || String(lastError);
  console.error(`Proxy error after ${elapsed}ms (${maxRetries} attempts):`, errorMsg);
  res.status(500).json({ error: 'Failed to connect to gateway', details: errorMsg, elapsed });
});

// Proxy POST requests
app.post('/api/proxy', async (req, res) => {
  const host = req.query.host;
  let path = req.query.path;

  if (!host || !path) {
    return res.status(400).json({ error: 'Missing host or path query parameter' });
  }

  // Remove leading slash if present to avoid double slashes
  if (path.startsWith('/')) {
    path = path.substring(1);
  }

  // Decode the path to handle special characters like $ in port$.cgi
  path = decodeURIComponent(path);

  const protocol = host.includes('ngrok') ? 'https' : 'http';
  const url = `${protocol}://${host}/${path}`;

  console.log(`Proxying POST to: ${url}`);
  const startTime = Date.now();

  try {
    const headers = {
      'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
      'Content-Type': 'application/json',
    };

    if (host.includes('ngrok')) {
      headers['ngrok-skip-browser-warning'] = 'true';
    }

    const response = await makeRequest(url, {
      method: 'POST',
      headers,
      body: req.body,
    });

    console.log(`  -> Response in ${Date.now() - startTime}ms: ${response.status}`);

    if (typeof response.data === 'object') {
      res.json(response.data);
    } else {
      try {
        res.json(JSON.parse(response.data));
      } catch {
        res.send(response.data);
      }
    }
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const errorMsg = error.code === 'ECONNABORTED' ? 'Connection timeout' :
                     error.code === 'ECONNREFUSED' ? 'Connection refused' :
                     error.message || String(error);
    console.error(`Proxy POST error after ${elapsed}ms:`, errorMsg);
    res.status(500).json({ error: 'Failed to connect to gateway', details: errorMsg, elapsed });
  }
});

// Upload edge config to gateway (multipart/form-data)
app.post('/api/upload-edge', async (req, res) => {
  const host = req.query.host;

  if (!host) {
    return res.status(400).json({ error: 'Missing host query parameter' });
  }

  const protocol = host.includes('ngrok') ? 'https' : 'http';

  console.log(`Trying multiple upload endpoints...`);

  const headers = {
    'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
  };

  if (host.includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }

  try {
    // Use minified JSON (no whitespace) for upload
    const jsonData = JSON.stringify(req.body);
    const jsonSize = Buffer.byteLength(jsonData, 'utf8');
    console.log('=== FULL EDGE CONFIG TO UPLOAD ===');
    console.log(JSON.stringify(req.body, null, 2));
    console.log('=== END FULL CONFIG ===');
    console.log('Config JSON size (minified):', jsonSize, 'bytes');
    console.log('Config ctable entries:', req.body.ctable?.length || 0);
    if (req.body.ctable && req.body.ctable.length > 0) {
      req.body.ctable.forEach((entry, i) => {
        const entrySize = JSON.stringify(entry).length;
        const dataPointCount = entry.datas?.length || 0;
        console.log(`  ctable[${i}]: name=${entry.name}, datas=${dataPointCount} points, size=${entrySize} bytes`);
      });
    }
    // Log template entries
    const template = req.body.rtable?.format?.[0]?.template;
    if (template) {
      console.log('Template entries:', Object.keys(template));
    } else {
      console.log('WARNING: No template found in config!');
    }
    // Log rtable.datas count
    const rtableDatas = req.body.rtable?.datas;
    if (rtableDatas) {
      console.log('rtable.datas count:', rtableDatas.length);
    }
    // Log rules
    const rules = req.body.rtable?.rules;
    if (rules) {
      console.log('rtable.rules:', JSON.stringify(rules));
    }

    // First, fetch the current edge.json to compare structures
    console.log('=== FETCHING CURRENT EDGE CONFIG FOR COMPARISON ===');
    try {
      const currentEdgeUrl = `${protocol}://${host}/edge.json`;
      const currentEdgeResponse = await makeRequest(currentEdgeUrl, { headers });
      if (currentEdgeResponse.status >= 200 && currentEdgeResponse.status < 300) {
        console.log('Current edge.json on gateway:');
        console.log(JSON.stringify(currentEdgeResponse.data, null, 2));
      }
    } catch (e) {
      console.log('Could not fetch current edge.json:', e.message);
    }
    console.log('=== END CURRENT CONFIG ===');

    // The gateway may use different endpoints for uploading edge.json
    const uploadEndpoints = [
      '/edge_model',      // Primary endpoint for edge config upload
      '/edge.cgi',        // Alternative CGI endpoint
      '/edge.json',       // Direct JSON endpoint (some gateways support PUT)
    ];

    let uploadSuccess = false;
    let uploadResponseText = '';

    // First, try a test upload with just the current config to verify upload mechanism works
    console.log('=== TESTING UPLOAD WITH MINIMAL CHANGE ===');
    try {
      // Fetch current config and make a tiny change (just update stamp)
      const testConfigUrl = `${protocol}://${host}/edge.json`;
      const testConfigResponse = await makeRequest(testConfigUrl, { headers });
      if (testConfigResponse.status === 200) {
        const testConfig = testConfigResponse.data;
        testConfig.stamp = Date.now();
        const testJsonData = JSON.stringify(testConfig);
        console.log('Test config size:', Buffer.byteLength(testJsonData), 'bytes');

        // Try the test upload with multipart (using blob filename)
        const FormDataNode = (await import('form-data')).default;
        const testFormData = new FormDataNode();
        testFormData.append('file', Buffer.from(testJsonData), {
          filename: 'blob',  // KEY: Must be "blob", not "edge.json"!
          contentType: 'application/octet-stream'
        });

        try {
          const testUploadResponse = await httpClient.post(`${protocol}://${host}/edge_model`, testFormData, {
            headers: { ...headers, ...testFormData.getHeaders() },
            timeout: 30000,
          });
          console.log('Test upload response:', testUploadResponse.status, String(testUploadResponse.data).substring(0, 100));
        } catch (testErr) {
          console.log('Test upload failed:', testErr.message);
          if (testErr.code) console.log('  Error code:', testErr.code);
        }
      }
    } catch (e) {
      console.log('Could not perform test upload:', e.message);
    }
    console.log('=== END TEST UPLOAD ===');

    // Try multiple upload methods
    // KEY FIX: The gateway expects filename="blob" and content-type="application/octet-stream"
    // Using filename="edge.json" causes the gateway to silently discard the upload!
    const uploadMethods = [
      {
        name: 'multipart-blob',  // Mimics browser's Blob upload
        upload: async (url) => {
          const FormDataNode = (await import('form-data')).default;
          const formData = new FormDataNode();
          formData.append('file', Buffer.from(jsonData), {
            filename: 'blob',  // KEY: Must be "blob", not "edge.json"!
            contentType: 'application/octet-stream'
          });
          return httpClient.post(url, formData, {
            headers: { ...headers, ...formData.getHeaders() },
            timeout: 30000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          });
        }
      },
      {
        name: 'raw-json-post',
        upload: async (url) => {
          return httpClient.post(url, jsonData, {
            headers: {
              ...headers,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          });
        }
      },
      {
        name: 'urlencoded-data',
        upload: async (url) => {
          const params = new URLSearchParams();
          params.append('data', jsonData);
          return httpClient.post(url, params.toString(), {
            headers: {
              ...headers,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout: 30000,
          });
        }
      },
      {
        name: 'put-json',
        upload: async (url) => {
          return httpClient.put(url, jsonData, {
            headers: {
              ...headers,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          });
        }
      },
      {
        // Native http module - sometimes works better with embedded devices
        name: 'native-multipart',
        upload: async (url) => {
          const http = require('http');
          const urlObj = new URL(url);
          const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);

          const body = [
            `--${boundary}`,
            'Content-Disposition: form-data; name="file"; filename="blob"',
            'Content-Type: application/octet-stream',
            '',
            jsonData,
            `--${boundary}--`,
            ''
          ].join('\r\n');

          return new Promise((resolve, reject) => {
            const req = http.request({
              hostname: urlObj.hostname,
              port: urlObj.port || 80,
              path: urlObj.pathname,
              method: 'POST',
              headers: {
                ...headers,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': Buffer.byteLength(body),
              },
              timeout: 30000,
            }, (res) => {
              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => resolve({ status: res.statusCode, data }));
            });

            req.on('error', reject);
            req.on('timeout', () => reject(new Error('Request timeout')));
            req.write(body);
            req.end();
          });
        }
      },
      {
        // Try with octet-stream (raw file upload)
        name: 'octet-stream',
        upload: async (url) => {
          return httpClient.post(url, jsonData, {
            headers: {
              ...headers,
              'Content-Type': 'application/octet-stream',
              'Content-Disposition': 'attachment; filename="blob"',
            },
            timeout: 30000,
          });
        }
      },
      {
        // Try GET with data parameter (some embedded devices use this)
        name: 'get-with-data',
        upload: async (url) => {
          const encodedData = encodeURIComponent(jsonData);
          return httpClient.get(`${url}?data=${encodedData}`, {
            headers,
            timeout: 30000,
          });
        }
      },
      {
        // Try multipart with 'edge' field name instead of 'file'
        name: 'multipart-edge-field',
        upload: async (url) => {
          const FormDataNode = (await import('form-data')).default;
          const formData = new FormDataNode();
          formData.append('edge', Buffer.from(jsonData), {
            filename: 'blob',
            contentType: 'application/octet-stream'
          });
          return httpClient.post(url, formData, {
            headers: { ...headers, ...formData.getHeaders() },
            timeout: 30000,
          });
        }
      }
    ];

    for (const endpoint of uploadEndpoints) {
      const uploadUrl = `${protocol}://${host}${endpoint}`;

      for (const method of uploadMethods) {
        console.log(`Trying upload endpoint: ${uploadUrl} with method: ${method.name}`);

        try {
          const uploadResponse = await method.upload(uploadUrl);

          uploadResponseText = String(uploadResponse.data);
          console.log(`Response from ${endpoint} (${method.name}): ${uploadResponse.status} - ${uploadResponseText.substring(0, 200)}`);

          // Check if this looks like a successful upload
          if (uploadResponse.status >= 200 && uploadResponse.status < 300 &&
              (uploadResponseText.includes('<title>Upload OK') || uploadResponseText.includes('Upload OK'))) {
            uploadSuccess = true;
            console.log(`Upload succeeded via ${endpoint} using ${method.name}`);
            break;
          }
        } catch (e) {
          console.log(`Endpoint ${endpoint} (${method.name}) failed: ${e.message}`);
          if (e.code) console.log(`  Error code: ${e.code}`);
        }
      }

      if (uploadSuccess) break;
    }

    // Wait a moment for gateway to process the upload
    console.log('Waiting 500ms for gateway to process upload...');
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify the upload by fetching edge.json back
    console.log('Verifying upload by fetching edge.json...');
    const verifyUrl = `${protocol}://${host}/edge.json`;
    let verificationPassed = false;
    try {
      const verifyResponse = await makeRequest(verifyUrl, { headers });
      if (verifyResponse.status >= 200 && verifyResponse.status < 300) {
        const verifyData = verifyResponse.data;
        const expectedCtable = req.body.ctable?.length || 0;
        const actualCtable = verifyData.ctable?.length || 0;
        const expectedTemplate = Object.keys(template || {}).length;
        const actualTemplate = Object.keys(verifyData.rtable?.format?.[0]?.template || {}).length;
        const expectedRtableDatas = req.body.rtable?.datas?.length || 0;
        const actualRtableDatas = verifyData.rtable?.datas?.length || 0;

        console.log(`Verification - ctable: expected ${expectedCtable}, got ${actualCtable}`);
        console.log(`Verification - template: expected ${expectedTemplate}, got ${actualTemplate}`);
        console.log(`Verification - rtable.datas: expected ${expectedRtableDatas}, got ${actualRtableDatas}`);
        console.log('Verification - template keys:', Object.keys(verifyData.rtable?.format?.[0]?.template || {}));
        console.log('Verification - ctable names:', verifyData.ctable?.map(e => e.name) || []);

        // Log data point counts for each verified ctable entry
        if (verifyData.ctable && verifyData.ctable.length > 0) {
          verifyData.ctable.forEach((entry, i) => {
            console.log(`  verified ctable[${i}]: name=${entry.name}, datas=${entry.datas?.length || 0} points`);
          });
        }

        if (actualCtable >= expectedCtable && actualTemplate >= expectedTemplate) {
          verificationPassed = true;
          console.log('Verification PASSED!');
        } else {
          console.log('Verification FAILED - data not saved. Possible causes:');
          console.log('  - Gateway may have a limit on ctable entries or data points');
          console.log('  - edge.json may be too large');
          console.log('  - Data point configuration may be invalid');
        }
      }
    } catch (e) {
      console.log('Could not verify upload:', e.message);
    }

    // Call econfig.cgi to trigger save to flash and ENABLE Edge Computing
    const econfigUrl = `${protocol}://${host}/econfig.json`;
    // Always enable Edge Computing (edgeen=1) when saving edge config
    let edgeen = 1;
    let inqu_en = 0;
    let inqu_m = 0;
    let inqu_t = '/QueryTopic';
    let inqu_qos = 0;

    try {
      const econfigResponse = await makeRequest(econfigUrl, { headers });
      if (econfigResponse.status >= 200 && econfigResponse.status < 300) {
        const econfig = econfigResponse.data;
        // Keep edgeen=1 to enable Edge Computing (don't read from current config)
        inqu_en = econfig.inqu_en ?? 0;
        inqu_m = econfig.inqu_m ?? 0;
        inqu_t = econfig.inqu_t ?? '/QueryTopic';
        inqu_qos = econfig.inqu_qos ?? 0;
      }
    } catch (e) {
      console.log('Could not fetch econfig, using defaults');
    }

    const saveUrl = `${protocol}://${host}/econfig.cgi?edgeen=${edgeen}&inqu_en=${inqu_en}&inqu_m=${inqu_m}&inqu_t=${encodeURIComponent(inqu_t)}&inqu_qos=${inqu_qos}`;
    console.log(`Triggering save via: ${saveUrl} (Edge Computing will be ENABLED)`);

    try {
      const saveResponse = await makeRequest(saveUrl, { headers });
      const saveResponseText = String(saveResponse.data);
      console.log('econfig.cgi response:', saveResponse.status, saveResponseText.substring(0, 200));
    } catch (e) {
      // Socket hang up is expected if gateway reboots after config change
      if (e.code === 'ECONNRESET' || e.message?.includes('socket hang up')) {
        console.log('Gateway connection reset (expected - gateway may be applying config)');
      } else {
        console.log('econfig.cgi error:', e.message);
      }
    }

    // Wait for gateway to apply config
    console.log('Waiting 1s for gateway to apply config...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Final verification after save (with retry)
    console.log('Final verification after econfig.cgi...');
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const verifyResponse2 = await makeRequest(verifyUrl, { headers });
        if (verifyResponse2.status >= 200 && verifyResponse2.status < 300) {
          const verifyData2 = verifyResponse2.data;
          const finalCtable = verifyData2.ctable?.length || 0;
          const finalTemplate = Object.keys(verifyData2.rtable?.format?.[0]?.template || {}).length;
          const finalDatas = verifyData2.rtable?.datas?.length || 0;

          console.log(`Final verification (attempt ${attempt}):`, {
            ctableEntries: finalCtable,
            templateKeys: Object.keys(verifyData2.rtable?.format?.[0]?.template || {}),
            rtableDatas: finalDatas,
            rules: verifyData2.rtable?.rules,
          });

          // Check if all data was saved
          const expectedCtable = req.body.ctable?.length || 0;
          const expectedTemplate = Object.keys(template || {}).length;

          if (finalCtable >= expectedCtable && finalTemplate >= expectedTemplate) {
            verificationPassed = true;
            console.log('Final verification PASSED!');
            break;
          } else {
            console.log(`Final verification FAILED on attempt ${attempt}`);
            if (attempt < 3) {
              console.log('Waiting 500ms before retry...');
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
        }
      } catch (e) {
        console.log(`Could not verify after save (attempt ${attempt}):`, e.message);
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }

    // Consider successful if either verification passed OR upload returned success
    // (verification may fail if gateway reboots after config change)
    if (verificationPassed || uploadSuccess) {
      console.log(`Upload result: success (verified: ${verificationPassed}, upload response: ${uploadSuccess})`);
      res.json({
        success: true,
        verified: verificationPassed,
        uploadResponse: uploadSuccess,
      });
    } else {
      res.json({
        success: false,
        message: 'Upload attempted but verification failed. The gateway may not support this upload method.',
        verified: false,
        uploadResponse: uploadSuccess,
      });
    }
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload edge config', details: String(error) });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get network info for initial setup (auto-fill subnet info)
app.get('/api/network-info', (req, res) => {
  const interfaces = getLocalInterfaces();

  // Find the best interface (prefer non-virtual, non-docker interfaces)
  let bestInterface = interfaces[0];
  for (const iface of interfaces) {
    // Skip Docker, VirtualBox, VMware interfaces
    if (iface.address.startsWith('172.17.') || // Docker
        iface.address.startsWith('192.168.56.') || // VirtualBox
        iface.address.startsWith('192.168.99.')) { // Docker Machine
      continue;
    }
    bestInterface = iface;
    break;
  }

  if (!bestInterface) {
    return res.status(500).json({ error: 'No network interfaces found' });
  }

  // Calculate a suggested static IP (use .200 in the same subnet)
  const ipParts = bestInterface.address.split('.').map(Number);
  const suggestedStaticIp = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.200`;

  // Default gateway is usually .1 in the subnet
  const suggestedGateway = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.1`;

  res.json({
    localIp: bestInterface.address,
    netmask: bestInterface.netmask,
    suggestedStaticIp,
    suggestedGateway,
    allInterfaces: interfaces.map(i => ({
      address: i.address,
      netmask: i.netmask,
    })),
  });
});

// UDP-based configuration endpoint (works across subnets like MXX.exe)
// This uses the USR IOT UDP protocol to configure gateways even on different subnets
// Can set static IP, gateway, subnet mask, and DHCP mode
app.post('/api/udp-config', async (req, res) => {
  const { mac, enableDhcp, staticIp, gateway, subnetMask, username = 'admin', password = 'admin', model = 'USR-N510' } = req.body;

  if (!mac) {
    return res.status(400).json({ error: 'Missing mac address' });
  }

  console.log(`UDP Config request - MAC: ${mac}, enableDhcp: ${enableDhcp}, staticIp: ${staticIp}, gateway: ${gateway}`);

  // Parse MAC address (accept formats: D4-AD-20-C0-0C-5E or D4:AD:20:C0:0C:5E or D4AD20C00C5E)
  const macBytes = Buffer.from(mac.replace(/[-:]/g, ''), 'hex');
  if (macBytes.length !== 6) {
    return res.status(400).json({ error: 'Invalid MAC address format' });
  }

  const socket = dgram.createSocket('udp4');
  let setConfigAck = false;
  let saveRebootAck = false;

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve(); // Don't reject on timeout, we'll check acks
      }, 3000);

      socket.on('error', (err) => {
        clearTimeout(timeout);
        console.error('UDP Socket error:', err);
        reject(err);
      });

      socket.on('message', (msg, rinfo) => {
        const hex = msg.toString('hex').toUpperCase();
        console.log(`UDP response from ${rinfo.address}: ${hex}`);

        // Acknowledgments
        if (hex === 'FF01054B') {
          console.log('Config set acknowledged!');
          setConfigAck = true;
        }
        else if (hex === 'FF01044B') {
          console.log('Save & reboot acknowledged!');
          saveRebootAck = true;
          clearTimeout(timeout);
          resolve();
        }
        // Echo of our own packet (ignore)
        else if (hex.startsWith('FF1303') || hex.startsWith('FF5605') || hex.startsWith('FF1304')) {
          console.log('Received echo of our packet, ignoring');
        }
      });

      socket.bind(() => {
        socket.setBroadcast(true);

        // Build the set config packet from scratch (like MXX.exe does)
        // Don't read config first - build it with known good structure
        const setConfigPacket = buildSetConfigPacketFromScratch(macBytes, username, password, {
          enableDhcp: enableDhcp !== false, // Default to DHCP enabled
          staticIp: staticIp || '192.168.1.200',
          gateway: gateway || '192.168.1.1',
          subnetMask: subnetMask || '255.255.255.0',
          model: model,
        });

        console.log(`Sending set config packet (${setConfigPacket.length} bytes): ${setConfigPacket.toString('hex')}`);
        console.log(`Setting - DHCP: ${enableDhcp !== false}, Static IP: ${staticIp || '192.168.1.200'}, Gateway: ${gateway || '192.168.1.1'}`);

        socket.send(setConfigPacket, DISCOVERY_PORT, '255.255.255.255', (err) => {
          if (err) {
            console.error('Error sending set config:', err);
          } else {
            console.log('Set config packet sent');
          }
        });

        // Send save & reboot after a short delay
        setTimeout(() => {
          const saveRebootPacket = buildSaveRebootPacket(macBytes, username, password);
          console.log(`Sending save & reboot packet: ${saveRebootPacket.toString('hex')}`);

          socket.send(saveRebootPacket, DISCOVERY_PORT, '255.255.255.255', (err) => {
            if (err) console.error('Error sending save/reboot:', err);
          });
        }, 500);
      });
    });

    socket.close();

    if (setConfigAck && saveRebootAck) {
      res.json({ success: true, message: 'Configuration saved. Gateway is rebooting with new settings.' });
    } else if (saveRebootAck) {
      res.json({ success: true, message: 'Gateway is rebooting. Configuration may have been applied.' });
    } else {
      res.json({ success: false, message: 'No acknowledgment received from gateway. It may not have processed the command.' });
    }
  } catch (error) {
    try { socket.close(); } catch (e) { /* ignore */ }
    console.error('UDP config error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper: Build set config packet FROM SCRATCH (like MXX.exe does)
// This builds the exact packet structure that works with USR gateways
// Packet structure (89 bytes total):
//   FF 56 05                          - Command header (3 bytes)
//   [MAC 6 bytes]                     - Target MAC address
//   [username\0 6 bytes]              - "admin\0" (fixed 6 bytes)
//   [password\0 6 bytes]              - "admin\0" (fixed 6 bytes)
//   08 59 03                          - Config header (3 bytes)
//   [DHCP flag 1 byte]                - 0x80 = DHCP, 0x00 = static
//   20 19 50 00 00                    - Fixed bytes (5 bytes)
//   [IP 4 bytes]                      - Static IP (little-endian)
//   [Gateway 4 bytes]                 - Gateway IP (little-endian)
//   00 FF FF FF                       - Subnet mask (little-endian)
//   [Model 16 bytes]                  - Model name null-padded
//   [web_user\0 6 bytes]              - Web username
//   [web_pass\0 6 bytes]              - Web password
//   02 01 00 00                       - Fixed bytes (4 bytes)
//   [MAC 6 bytes]                     - MAC again
//   00 00 00 00 00 00 00 00           - Padding (8 bytes)
//   [checksum 1 byte]                 - Sum of bytes 1 to end-1
function buildSetConfigPacketFromScratch(macBytes, username, password, options = {}) {
  const { enableDhcp = true, staticIp = '192.168.1.200', gateway = '192.168.1.1', subnetMask = '255.255.255.0', model = 'USR-N510' } = options;

  // Total packet size: 89 bytes
  const packet = Buffer.alloc(89);
  let offset = 0;

  // Command header: FF 56 05
  packet[offset++] = 0xFF;
  packet[offset++] = 0x56;
  packet[offset++] = 0x05;

  // MAC address (6 bytes)
  macBytes.copy(packet, offset);
  offset += 6;

  // Username null-terminated, padded to 6 bytes
  const userBuf = Buffer.alloc(6, 0);
  Buffer.from(username).copy(userBuf);
  userBuf.copy(packet, offset);
  offset += 6;

  // Password null-terminated, padded to 6 bytes
  const passBuf = Buffer.alloc(6, 0);
  Buffer.from(password).copy(passBuf);
  passBuf.copy(packet, offset);
  offset += 6;

  // Config header: 08 59 03
  packet[offset++] = 0x08;
  packet[offset++] = 0x59;
  packet[offset++] = 0x03;

  // DHCP flag
  packet[offset++] = enableDhcp ? 0x80 : 0x00;

  // Fixed bytes: 20 19 50 00 00
  packet[offset++] = 0x20;
  packet[offset++] = 0x19;
  packet[offset++] = 0x50;
  packet[offset++] = 0x00;
  packet[offset++] = 0x00;

  // Static IP (little-endian: last octet first)
  // e.g., 192.168.1.236 -> EC 01 A8 C0
  const ipParts = staticIp.split('.').map(Number);
  packet[offset++] = ipParts[3]; // .236
  packet[offset++] = ipParts[2]; // .1
  packet[offset++] = ipParts[1]; // .168
  packet[offset++] = ipParts[0]; // 192

  // Gateway IP (little-endian: last octet first)
  // e.g., 192.168.1.1 -> 01 01 A8 C0
  const gwParts = gateway.split('.').map(Number);
  packet[offset++] = gwParts[3]; // .1
  packet[offset++] = gwParts[2]; // .1
  packet[offset++] = gwParts[1]; // .168
  packet[offset++] = gwParts[0]; // 192

  // Subnet mask (little-endian: last octet first)
  // e.g., 255.255.255.0 -> 00 FF FF FF
  const maskParts = subnetMask.split('.').map(Number);
  packet[offset++] = maskParts[3]; // .0
  packet[offset++] = maskParts[2]; // .255
  packet[offset++] = maskParts[1]; // .255
  packet[offset++] = maskParts[0]; // 255

  // Model name (16 bytes, null-padded)
  const modelBuf = Buffer.alloc(16, 0);
  Buffer.from(model).copy(modelBuf);
  modelBuf.copy(packet, offset);
  offset += 16;

  // Web username (6 bytes)
  userBuf.copy(packet, offset);
  offset += 6;

  // Web password (6 bytes)
  passBuf.copy(packet, offset);
  offset += 6;

  // Fixed bytes: 02 01 00 00
  packet[offset++] = 0x02;
  packet[offset++] = 0x01;
  packet[offset++] = 0x00;
  packet[offset++] = 0x00;

  // MAC address again (6 bytes)
  macBytes.copy(packet, offset);
  offset += 6;

  // Padding (8 bytes of 0x00) - already zeroed from Buffer.alloc
  offset += 8;

  // Checksum: sum of bytes 1 through 87 (before checksum), mod 256
  let checksum = 0;
  for (let i = 1; i < 88; i++) {
    checksum = (checksum + packet[i]) & 0xFF;
  }
  packet[88] = checksum;

  return packet;
}

// Helper: Build save & reboot packet (FF 13 04 + MAC + user\0 + pass\0 + checksum)
function buildSaveRebootPacket(macBytes, username, password) {
  const userBytes = Buffer.from(username + '\0');
  const passBytes = Buffer.from(password + '\0');

  const packet = Buffer.alloc(3 + 6 + userBytes.length + passBytes.length + 1);
  packet[0] = 0xFF;
  packet[1] = 0x13;
  packet[2] = UDP_CMD_SAVE_REBOOT; // 0x04

  macBytes.copy(packet, 3);
  userBytes.copy(packet, 9);
  passBytes.copy(packet, 9 + userBytes.length);

  // Checksum: SUM of bytes 1 through end-1, mod 256
  let checksum = 0;
  for (let i = 1; i < packet.length - 1; i++) {
    checksum = (checksum + packet[i]) & 0xFF;
  }
  packet[packet.length - 1] = checksum;

  return packet;
}

// Network diagnostic endpoint - test connectivity to a specific IP
app.get('/api/test-connection', async (req, res) => {
  const host = req.query.host;
  if (!host) {
    return res.status(400).json({ error: 'Missing host parameter' });
  }

  const results = {
    host,
    timestamp: new Date().toISOString(),
    localInterfaces: getLocalInterfaces().map(i => ({ address: i.address, netmask: i.netmask })),
    tests: []
  };

  // Test 1: Simple HTTP GET with axios
  const testUrl = `http://${host}/define.json`;
  console.log(`Testing connection to: ${testUrl}`);
  const startTime = Date.now();

  try {
    const response = await httpClient.get(testUrl, {
      timeout: HTTP_TIMEOUT,
      headers: {
        'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
      },
    });
    results.tests.push({
      test: 'HTTP GET',
      url: testUrl,
      success: true,
      status: response.status,
      elapsed: Date.now() - startTime,
      dataPreview: JSON.stringify(response.data).substring(0, 100),
    });
  } catch (error) {
    results.tests.push({
      test: 'HTTP GET',
      url: testUrl,
      success: false,
      elapsed: Date.now() - startTime,
      error: error.code || error.message,
      errorDetails: String(error),
    });
  }

  // Test 2: Raw TCP connection using net module
  const net = await import('net');
  await new Promise((resolve) => {
    const tcpStart = Date.now();
    const socket = new net.default.Socket();
    socket.setTimeout(HTTP_TIMEOUT);

    socket.on('connect', () => {
      results.tests.push({
        test: 'TCP Connect',
        host,
        port: 80,
        success: true,
        elapsed: Date.now() - tcpStart,
      });
      socket.destroy();
      resolve();
    });

    socket.on('timeout', () => {
      results.tests.push({
        test: 'TCP Connect',
        host,
        port: 80,
        success: false,
        elapsed: Date.now() - tcpStart,
        error: 'TIMEOUT',
      });
      socket.destroy();
      resolve();
    });

    socket.on('error', (err) => {
      results.tests.push({
        test: 'TCP Connect',
        host,
        port: 80,
        success: false,
        elapsed: Date.now() - tcpStart,
        error: err.code || err.message,
      });
      socket.destroy();
      resolve();
    });

    socket.connect(80, host);
  });

  console.log('Connection test results:', JSON.stringify(results, null, 2));
  res.json(results);
});

// Discover available CGI endpoints on gateway
app.get('/api/discover-endpoints', async (req, res) => {
  const host = req.query.host;
  if (!host) {
    return res.status(400).json({ error: 'Missing host query parameter' });
  }

  const protocol = host.includes('ngrok') ? 'https' : 'http';
  const headers = {
    'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
  };

  // Common CGI endpoints to probe
  const cgiEndpoints = [
    // Port/Serial configuration
    'port0.cgi', 'port1.cgi', 'uart0.cgi', 'uart1.cgi', 'serial0.cgi', 'serial1.cgi',
    'rs485.cgi', 'com0.cgi', 'com1.cgi',
    // MQTT configuration
    'mqtt.cgi', 'mqttbase.cgi', 'mqttcfg.cgi',
    // Network configuration
    'ipconfig.cgi', 'network.cgi', 'lan.cgi', 'eth.cgi',
    // Edge computing
    'econfig.cgi', 'edge.cgi', 'edgecfg.cgi',
    // System
    'reboot.cgi', 'reset.cgi', 'restart.cgi', 'system.cgi', 'misc.cgi',
    // Other
    'save.cgi', 'apply.cgi', 'config.cgi', 'settings.cgi',
  ];

  // JSON endpoints to check
  const jsonEndpoints = [
    'define.json', 'temp.json', 'misc.json', 'ipconfig.json',
    'mqttbase.json', 'econfig.json', 'edge.json',
    'port0.json', 'port1.json', 'uart0.json', 'uart1.json',
    'serial.json', 'rs485.json',
  ];

  const results = {
    host,
    timestamp: new Date().toISOString(),
    cgi: [],
    json: [],
  };

  console.log(`\n=== Discovering endpoints on ${host} ===`);

  // Check CGI endpoints
  for (const endpoint of cgiEndpoints) {
    try {
      const url = `${protocol}://${host}/${endpoint}`;
      const response = await makeRequest(url, { headers });
      const exists = response.status !== 404;
      results.cgi.push({
        endpoint,
        exists,
        status: response.status,
        preview: exists ? String(response.data).substring(0, 100) : null,
      });
      if (exists) {
        console.log(`  ✓ ${endpoint} - ${response.status}`);
      }
    } catch (e) {
      results.cgi.push({ endpoint, exists: false, error: e.message });
    }
  }

  // Check JSON endpoints
  for (const endpoint of jsonEndpoints) {
    try {
      const url = `${protocol}://${host}/${endpoint}`;
      const response = await makeRequest(url, { headers });
      const exists = response.status !== 404;
      results.json.push({
        endpoint,
        exists,
        status: response.status,
        keys: exists && typeof response.data === 'object' ? Object.keys(response.data) : null,
      });
      if (exists) {
        console.log(`  ✓ ${endpoint} - ${response.status} - keys: ${Object.keys(response.data || {}).join(', ')}`);
      }
    } catch (e) {
      results.json.push({ endpoint, exists: false, error: e.message });
    }
  }

  // Summary
  const availableCgi = results.cgi.filter(e => e.exists).map(e => e.endpoint);
  const availableJson = results.json.filter(e => e.exists).map(e => e.endpoint);

  console.log(`\n=== Summary ===`);
  console.log(`Available CGI endpoints: ${availableCgi.join(', ') || 'none'}`);
  console.log(`Available JSON endpoints: ${availableJson.join(', ') || 'none'}`);

  res.json({
    ...results,
    summary: {
      availableCgi,
      availableJson,
    },
  });
});

// Upload CSV edge config to N720 gateway (multipart/form-data)
// N720 uses a different format than N510 - CSV file instead of JSON
app.post('/api/upload-edge-csv', async (req, res) => {
  const { host, csvContent, filename = 'edge.csv' } = req.body;

  if (!host) {
    return res.status(400).json({ error: 'Missing host parameter' });
  }

  if (!csvContent) {
    return res.status(400).json({ error: 'Missing csvContent parameter' });
  }

  console.log(`\n=== Uploading CSV edge config to N720 at ${host} ===`);
  console.log(`CSV length: ${csvContent.length} bytes`);
  console.log(`Filename: ${filename}`);
  console.log('CSV preview:');
  console.log(csvContent.substring(0, 500));

  const headers = {
    'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
  };

  try {
    // Ensure CSV content uses CRLF line endings
    const normalizedCsv = csvContent.replace(/\r?\n/g, '\r\n');

    // Log first few bytes to verify CRLF
    const csvBuffer = Buffer.from(normalizedCsv, 'utf8');
    console.log('CSV first 100 bytes hex:', csvBuffer.slice(0, 100).toString('hex'));

    const uploadUrl = `http://${host}/upload/edge`;
    console.log(`Uploading to: ${uploadUrl}`);

    // Use form-data library - N720 expects field name "c" and filename "conf"
    // (discovered by capturing browser upload request)
    const FormDataNode = (await import('form-data')).default;
    const formData = new FormDataNode();
    formData.append('c', csvBuffer, {
      filename: 'conf',  // N720 expects filename "conf"
      contentType: 'application/octet-stream'
    });

    console.log(`Total body size: ~${csvBuffer.length} bytes (CSV content)`);

    const response = await httpClient.post(uploadUrl, formData, {
      headers: {
        ...headers,
        ...formData.getHeaders()
      },
      timeout: 30000, // 30 second timeout for upload
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    console.log(`Upload response status: ${response.status}`);
    console.log(`Upload response data:`, response.data);

    // Check for gateway error response (err: 0 means success, err: 1+ means error)
    // N720 gateway may also return err_info and err_message with details
    const hasError = response.data && typeof response.data === 'object' && response.data.err !== 0;
    const errInfo = response.data?.err_info || response.data?.errInfo;
    const errMessage = response.data?.err_message || response.data?.errMessage || response.data?.message;

    if (response.status === 200 && !hasError) {
      res.json({
        success: true,
        message: 'CSV uploaded successfully',
        response: response.data,
      });
    } else if (response.status === 200 && hasError) {
      // Build detailed error message including err_info and err_message if present
      let detailedError = `Gateway rejected CSV (err: ${response.data.err})`;
      if (errInfo) {
        detailedError += ` - Info: ${errInfo}`;
      }
      if (errMessage) {
        detailedError += ` - Message: ${errMessage}`;
      }
      console.error('Gateway CSV rejection details:', { err: response.data.err, errInfo, errMessage });

      res.json({
        success: false,
        message: detailedError,
        error: `Gateway error code: ${response.data.err}`,
        errInfo,
        errMessage,
        response: response.data,
      });
    } else {
      res.json({
        success: false,
        message: `Upload failed with status ${response.status}`,
        response: response.data,
      });
    }
  } catch (error) {
    console.error('CSV upload error:', error);
    res.status(500).json({
      error: 'Failed to upload CSV edge config',
      details: String(error),
    });
  }
});

// Test endpoint: Upload a known-working CSV file to verify the upload mechanism
app.post('/api/test-upload-working-csv', async (req, res) => {
  const { host } = req.body;

  if (!host) {
    return res.status(400).json({ error: 'Missing host parameter' });
  }

  console.log(`\n=== Testing upload with known-working EM4371 CSV to ${host} ===`);

  // Read the known-working CSV file
  // The configurations folder is at the project root, not inside gateway-configurator
  const fs = await import('fs');

  // Try multiple possible paths
  const possiblePaths = [
    path.join(__dirname, '..', '..', 'configurations', 'edge-N720 - EM4371.csv'),
    path.join(__dirname, '..', 'configurations', 'edge-N720 - EM4371.csv'),
    'C:\\Users\\PowerMeter\\PWE\\gateway-configurator\\configurations\\edge-N720 - EM4371.csv',
    'C:\\Users\\PowerMeter\\PWE\\configurations\\edge-N720 - EM4371.csv',
  ];

  console.log(`__dirname = ${__dirname}`);

  let csvContent;
  let workingCsvPath;

  for (const testPath of possiblePaths) {
    console.log(`Trying path: ${testPath}`);
    try {
      if (fs.existsSync(testPath)) {
        csvContent = fs.readFileSync(testPath);
        workingCsvPath = testPath;
        console.log(`Found working CSV file: ${workingCsvPath}`);
        console.log(`File size: ${csvContent.length} bytes`);
        console.log(`First 200 bytes hex: ${csvContent.slice(0, 200).toString('hex')}`);
        break;
      }
    } catch (err) {
      console.log(`Path ${testPath} failed: ${err}`);
    }
  }

  if (!csvContent) {
    return res.status(500).json({
      error: 'Could not find working CSV file',
      triedPaths: possiblePaths
    });
  }

  const headers = {
    'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
  };

  try {
    const uploadUrl = `http://${host}/upload/edge`;
    console.log(`Uploading to: ${uploadUrl}`);

    // Use form-data library like N510 does
    const FormDataNode = (await import('form-data')).default;
    const formData = new FormDataNode();
    formData.append('file', csvContent, {
      filename: 'blob',
      contentType: 'application/octet-stream'
    });

    const response = await httpClient.post(uploadUrl, formData, {
      headers: {
        ...headers,
        ...formData.getHeaders()
      },
      timeout: 30000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    console.log(`Upload response status: ${response.status}`);
    console.log(`Upload response data:`, response.data);

    res.json({
      success: response.data?.err === 0,
      message: response.data?.err === 0 ? 'Working CSV uploaded successfully!' : `Upload failed with err: ${response.data?.err}`,
      response: response.data,
    });
  } catch (error) {
    console.error('Test upload error:', error);
    res.status(500).json({ error: 'Failed to upload working CSV', details: String(error) });
  }
});

// Upload N720 configuration to flash storage (nv1 and nv2)
// N720 requires configs to be uploaded to both /upload/nv1 AND /upload/nv2 to persist
// The config type is determined by the filename (e.g., "edge_report", "link", "edge_link_ctrl")
app.post('/api/upload-nv-config', async (req, res) => {
  const { host, configName, configContent } = req.body;

  if (!host || !configName || !configContent) {
    return res.status(400).json({ error: 'Missing host, configName, or configContent parameter' });
  }

  console.log(`\n=== Uploading ${configName} config to N720 flash at ${host} ===`);
  console.log(`Config content length: ${configContent.length} bytes`);
  console.log('Config preview:', configContent.substring(0, 200));

  const headers = {
    'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
  };

  // Add ngrok header if needed
  if (host.includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }

  try {
    // Ensure content uses CRLF line endings (N720 expects Windows-style line endings)
    const normalizedContent = configContent.replace(/\r?\n/g, '\r\n');
    const contentBuffer = Buffer.from(normalizedContent, 'utf8');

    // N720 expects both nv1 and nv2 uploads for redundancy
    const endpoints = ['/upload/nv1', '/upload/nv2'];
    let success = true;
    const results = [];

    // Use HTTPS for ngrok URLs
    const protocol = host.includes('ngrok') ? 'https' : 'http';

    for (const endpoint of endpoints) {
      const uploadUrl = `${protocol}://${host}${endpoint}`;
      // For edge CSV, use filename 'conf' to match /upload/edge behavior
      const actualFilename = configName === 'edge' ? 'conf' : configName;
      console.log(`Uploading to: ${uploadUrl} (filename: ${actualFilename})`);

      // Use form-data library - N720 expects field name "c"
      const FormDataNode = (await import('form-data')).default;
      const formData = new FormDataNode();
      formData.append('c', contentBuffer, {
        filename: actualFilename,
        contentType: 'application/octet-stream'
      });

      try {
        const response = await httpClient.post(uploadUrl, formData, {
          headers: {
            ...headers,
            ...formData.getHeaders()
          },
          timeout: 30000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });

        console.log(`${endpoint} response status: ${response.status}`);
        console.log(`${endpoint} response data:`, response.data);

        // N720 returns {err: 0} for success
        const endpointSuccess = response.status === 200 && (!response.data || response.data.err === 0 || response.data.err === undefined);
        results.push({ endpoint, success: endpointSuccess, status: response.status, data: response.data });

        if (!endpointSuccess) {
          success = false;
        }
      } catch (error) {
        console.error(`${endpoint} upload error:`, error.message);
        results.push({ endpoint, success: false, error: error.message });
        success = false;
      }
    }

    res.json({
      success,
      message: success ? `${configName} saved to flash successfully` : `Failed to save ${configName} to flash`,
      results,
    });
  } catch (error) {
    console.error('NV config upload error:', error);
    res.status(500).json({
      error: 'Failed to upload config to flash',
      details: String(error),
    });
  }
});

// Upload to /upload/template endpoint (matches native UI Save Current flow)
app.post('/api/upload-template', async (req, res) => {
  const { host, content } = req.body;

  if (!host) {
    return res.status(400).json({ error: 'Missing host parameter' });
  }

  console.log(`\n=== Uploading to /upload/template at ${host} ===`);

  const headers = {
    'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
  };

  if (host.includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }

  try {
    const protocol = host.includes('ngrok') ? 'https' : 'http';
    const uploadUrl = `${protocol}://${host}/upload/template`;

    const FormDataNode = (await import('form-data')).default;
    const formData = new FormDataNode();

    // Native UI sends empty content or minimal content
    const contentBuffer = Buffer.from(content || '', 'utf8');
    formData.append('c', contentBuffer, {
      filename: 'template',
      contentType: 'application/octet-stream'
    });

    const response = await httpClient.post(uploadUrl, formData, {
      headers: {
        ...headers,
        ...formData.getHeaders()
      },
      timeout: 30000,
    });

    console.log('Template upload response:', response.status, response.data);
    res.json({ success: response.status === 200, data: response.data });
  } catch (error) {
    console.error('Template upload error:', error.message);
    res.status(500).json({ error: 'Template upload failed', details: error.message });
  }
});

// Upload to /upload/conver_csv endpoint (finalizes Save Current flow)
app.post('/api/upload-conver-csv', async (req, res) => {
  const { host } = req.body;

  if (!host) {
    return res.status(400).json({ error: 'Missing host parameter' });
  }

  console.log(`\n=== Uploading to /upload/conver_csv at ${host} ===`);

  const headers = {
    'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
  };

  if (host.includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }

  try {
    const protocol = host.includes('ngrok') ? 'https' : 'http';
    const uploadUrl = `${protocol}://${host}/upload/conver_csv`;

    const FormDataNode = (await import('form-data')).default;
    const formData = new FormDataNode();

    // Native UI sends empty form data
    formData.append('c', Buffer.from(''), {
      filename: 'conver_csv',
      contentType: 'application/octet-stream'
    });

    const response = await httpClient.post(uploadUrl, formData, {
      headers: {
        ...headers,
        ...formData.getHeaders()
      },
      timeout: 30000,
    });

    console.log('Conver_csv upload response:', response.status, response.data);
    res.json({ success: response.status === 200, data: response.data });
  } catch (error) {
    console.error('Conver_csv upload error:', error.message);
    res.status(500).json({ error: 'Conver_csv upload failed', details: error.message });
  }
});

// Complete N720 Save Current sequence - EXACT native UI replication
// Sequence from native UI capture (with report group):
// 1. POST /upload/edge (CSV with filename="conf")
// 2. POST /upload/nv1 (link with prefix 80 a4 d0 09 + {"tcpc":[]})
// 3. POST /upload/nv2 (link with same content)
// Simple CSV-only upload endpoint
// User will click "Save Current + Restart" in native UI to complete the process
app.post('/api/upload-edge-csv', async (req, res) => {
  const { host, csvContent } = req.body;

  if (!host || !csvContent) {
    return res.status(400).json({ success: false, error: 'Missing host or csvContent' });
  }

  console.log(`\n=== UPLOAD EDGE CSV to ${host} ===`);
  console.log(`CSV length: ${csvContent.length} bytes`);

  const headers = {
    'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
  };

  if (host.includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }

  const protocol = host.includes('ngrok') ? 'https' : 'http';

  try {
    // Create multipart form data - exact format from native UI
    const boundaryId = 'WebKitFormBoundary' + Math.random().toString(36).substring(2, 15);
    const boundary = `----${boundaryId}`;

    const csvBuffer = Buffer.from(csvContent, 'utf8');
    const bodyStart = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="c"; filename="conf"\r\n` +
      `Content-Type: application/octet-stream\r\n` +
      `\r\n`
    );
    const bodyEnd = Buffer.from(`\r\n\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([bodyStart, csvBuffer, bodyEnd]);

    console.log(`Uploading CSV to /upload/edge...`);
    console.log(`Boundary: ${boundary}`);
    console.log(`Body length: ${body.length}`);

    const response = await httpClient.post(`${protocol}://${host}/upload/edge`, body, {
      headers: {
        ...headers,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
      timeout: 30000,
    });

    console.log(`Upload response: ${response.status}`);

    if (response.status === 200) {
      res.json({ success: true });
    } else {
      res.json({ success: false, error: `Upload failed with status ${response.status}` });
    }
  } catch (error) {
    console.error('Upload CSV error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// N720 Save Current - SINGLE PHASE with ONE restart
// All uploads (CSV, link, template, edge_report) done first, then ONE restart
// This matches the working pattern from direct testing
app.post('/api/n720-save-current', async (req, res) => {
  console.log('\n=== N720 SAVE CURRENT (Single Phase: All uploads, then ONE restart) ===');

  const { host, csvContent, restart, meters, reportTopic, reportingInterval } = req.body;

  if (!host) {
    return res.status(400).json({ error: 'Missing host parameter' });
  }

  console.log(`\n=== N720 SAVE CURRENT at ${host} ===`);
  console.log(`Meters: ${meters?.length || 0}, Topic: ${reportTopic || 'UploadTopic'}, Interval: ${reportingInterval || 60}s`);
  console.log('Meter details:', JSON.stringify(meters, null, 2));

  const headers = {
    'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
  };

  if (host.includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }

  const protocol = host.includes('ngrok') ? 'https' : 'http';
  const results = [];

  // Helper to upload multipart form data with retry logic
  const uploadMultipart = async (endpoint, filename, data, stepNum, maxRetries = 3) => {
    const boundaryId = 'WebKitFormBoundary' + Math.random().toString(36).substring(2, 15);
    const boundary = `----${boundaryId}`;
    let body;

    if (Buffer.isBuffer(data)) {
      const bodyStart = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="c"; filename="${filename}"\r\n` +
        `Content-Type: application/octet-stream\r\n` +
        `\r\n`
      );
      const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`);
      body = Buffer.concat([bodyStart, data, bodyEnd]);
      console.log(`  -> Upload ${filename} to ${endpoint} (binary, ${data.length} bytes)`);
    } else {
      const dataBuffer = Buffer.from(data, 'utf8');
      const bodyStart = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="c"; filename="${filename}"\r\n` +
        `Content-Type: application/octet-stream\r\n` +
        `\r\n`
      );
      const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`);
      body = Buffer.concat([bodyStart, dataBuffer, bodyEnd]);
      console.log(`  -> Upload ${filename} to ${endpoint} (text, ${dataBuffer.length} bytes)`);
    }

    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await httpClient.post(`${protocol}://${host}${endpoint}`, body, {
          headers: {
            ...headers,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length,
          },
          timeout: 60000,
          maxBodyLength: Infinity,
        });

        console.log(`Step ${stepNum} response:`, response.status, '- Body:', JSON.stringify(response.data));
        results.push({ step: stepNum, endpoint, status: response.status, data: response.data });
        return response;
      } catch (err) {
        lastError = err;
        console.log(`  -> Attempt ${attempt}/${maxRetries} failed: ${err.message}`);
        if (attempt < maxRetries) {
          console.log(`  -> Waiting 3 seconds before retry...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }
    throw lastError;
  };

  try {
    // ============================================
    // CORRECT SEQUENCE (per user advice):
    // Phase 1: Save Data Acquisition FIRST
    //   1. POST /upload/edge (CSV)
    //   2. GET /download_flex.cgi
    //   3. POST /upload/nv1 (link)
    //   4. POST /upload/nv2 (link)
    //   5. GET /download_flex.cgi
    //   6. POST /upload/conver_csv
    //   7. GET /action_restart.cgi
    //   8. Wait 30 seconds for restart
    //
    // Phase 2: Save Report Groups
    //   9. POST /upload/template
    //   10. POST /upload/nv1 (edge_report)
    //   11. POST /upload/nv2 (edge_report)
    //   12. GET /action_restart.cgi
    // ============================================

    const csvLines = csvContent.split('\n');
    let deviceName = 'System_Slave';
    for (const line of csvLines) {
      if (line.startsWith('SC,') && !line.includes('System_Slave')) {
        const parts = line.split(',');
        if (parts[1]) {
          deviceName = parts[1];
          break;
        }
      }
    }

    // Build template and edge_report data upfront
    const topic = reportTopic || 'UploadTopic';
    const period = reportingInterval || 60;
    let templateContent = '';
    let edgeReportData = null;
    let groups = [];

    // Check if using ThingsBoard gateway topic format
    const isGatewayTopic = topic === 'v1/gateway/telemetry' || topic === '/v1/gateway/telemetry';

    if (meters && meters.length > 0) {
      // WORKING APPROACH: Use tmpl_file with /upload/template + /upload/nv1 with binary prefix
      // This is exactly what the native UI does (verified from HAR)
      const templateLines = [];

      console.log('DEBUG: Meters received from frontend:', JSON.stringify(meters, null, 2));

      for (let i = 0; i < meters.length; i++) {
        const meter = meters[i];
        // Use the meter's meterIndex if provided, otherwise calculate from array position (1-based)
        // This ensures each meter gets a unique index even if meterIndex wasn't explicitly set
        const meterIndex = meter.meterIndex ?? (i + 1);
        console.log(`DEBUG: Meter ${i} name: "${meter.name}", meterType: "${meter.meterType}", meterIndex: ${meterIndex} (from meter: ${meter.meterIndex})`);
        const reportingFields = getN720ReportingFields(meter.meterType);
        console.log(`DEBUG: Meter ${i} reportingFields (${reportingFields.length} fields):`, reportingFields);

        // Build field mappings
        // Key = base field name (e.g., "v_l1"), Value = field with meter index suffix (e.g., "v_l1_2")
        const fieldsObj = {};
        for (const field of reportingFields) {
          const fieldWithIndex = `${field}_${meterIndex}`;
          fieldsObj[field] = fieldWithIndex;  // Key without suffix, value with suffix
        }
        console.log(`DEBUG: Meter ${i} fieldsObj:`, JSON.stringify(fieldsObj));

        let templateObj;
        if (isGatewayTopic) {
          // ThingsBoard gateway format: {"Device":[{"ts":"sys_timestamp_ms","values":{...}}]}
          // Includes device name wrapper for multi-device support
          templateObj = {};
          templateObj[meter.name] = [{
            ts: 'sys_timestamp_ms',
            values: fieldsObj
          }];
        } else {
          // Non-gateway topic format: {"ts":"sys_timestamp_ms","values":{...}}
          // Includes ts and values, but NO device name wrapper
          templateObj = {
            ts: 'sys_timestamp_ms',
            values: fieldsObj
          };
        }
        templateLines.push(`Report${i}:${JSON.stringify(templateObj)}`);

        // Create report group referencing template file
        // Note: Topic should NOT have leading slash
        // Sanitize name: only a-z, A-Z, 0-9, _ allowed, max 20 chars
        const sanitizedName = meter.name.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 20);
        groups.push({
          enable: 1,  // IMPORTANT: Report group must be enabled to show up in UI
          name: sanitizedName,
          link: 'MQTT1',
          topic: topic.startsWith('/') ? topic.substring(1) : topic,
          qos: 1,
          retention: 0,
          cond: {
            period: period,
            timed: { type: 0, hh: 0, mm: 0 }
          },
          data_report_type: 0,
          change_report_type: 0,
          err_enable: 0,
          err_info: 'error',
          tmpl_file: `/template/Report${i}.json`,
          fkey_md5: '00000000000000000000000000000000',
          ucld_node: []
        });
      }

      templateContent = templateLines.join('\n') + '\n';
      console.log('Template content:', templateContent);

      // CRC32 implementation (standard polynomial 0xEDB88320)
      function crc32(buffer) {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < buffer.length; i++) {
          crc ^= buffer[i];
          for (let j = 0; j < 8; j++) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
          }
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
      }

      // Build edge_report with CRC32 prefix (discovered from HAR analysis!)
      // The prefix is the CRC32 checksum of the JSON content in LITTLE-ENDIAN byte order
      // NOTE: Templates do NOT need CRC32 prefix - only edge_report does
      const edgeReportJson = JSON.stringify({ group: groups });
      const jsonBuffer = Buffer.from(edgeReportJson);
      const crc = crc32(jsonBuffer);
      const edgeReportPrefix = Buffer.alloc(4);
      edgeReportPrefix.writeUInt32LE(crc, 0);
      console.log(`CRC32 of edge_report JSON: 0x${crc.toString(16)} -> prefix: ${edgeReportPrefix.toString('hex')}`);
      edgeReportData = Buffer.concat([edgeReportPrefix, jsonBuffer]);
      console.log('edge_report JSON:', edgeReportJson);
    }

    // ============ SIMPLIFIED SEQUENCE WITH CRC32 PREFIX ============
    // Now that we have the correct CRC32 prefix calculation, use simpler sequence:
    // 1. Upload CSV for data acquisition
    // 2. Upload template + edge_report (with CRC32 prefix)
    // 3. Restart ONCE

    let stepNum = 1;

    console.log('\n=== SAVING ALL CONFIGURATION ===');

    // Step 1: Upload CSV for data acquisition
    console.log(`Step ${stepNum}: POST /upload/edge (CSV)...`);
    await uploadMultipart('/upload/edge', 'conf', csvContent, stepNum++);

    // Step 2: GET download_flex.cgi
    console.log(`Step ${stepNum}: GET /download_flex.cgi?name=edge&ext=${deviceName}...`);
    try {
      await httpClient.get(`${protocol}://${host}/download_flex.cgi?name=edge&ext=${deviceName}`, { headers, timeout: 10000 });
      results.push({ step: stepNum++, endpoint: '/download_flex.cgi', status: 200 });
    } catch (e) {
      console.log(`Step ${stepNum} warning:`, e.message);
      stepNum++;
    }

    // Step 3: Upload link to nv1
    console.log(`Step ${stepNum}: POST /upload/nv1 (link)...`);
    const linkPrefix = Buffer.from([0x80, 0xa4, 0xd0, 0x09]);
    const linkJson = '{"tcpc":[]}';
    const linkData = Buffer.concat([linkPrefix, Buffer.from(linkJson)]);
    await uploadMultipart('/upload/nv1', 'link', linkData, stepNum++);

    // Step 4: Upload link to nv2
    console.log(`Step ${stepNum}: POST /upload/nv2 (link)...`);
    await uploadMultipart('/upload/nv2', 'link', linkData, stepNum++);

    // Step 5: GET download_flex.cgi
    console.log(`Step ${stepNum}: GET /download_flex.cgi?name=edge&ext=${deviceName}...`);
    try {
      await httpClient.get(`${protocol}://${host}/download_flex.cgi?name=edge&ext=${deviceName}`, { headers, timeout: 10000 });
      results.push({ step: stepNum++, endpoint: '/download_flex.cgi', status: 200 });
    } catch (e) {
      console.log(`Step ${stepNum} warning:`, e.message);
      stepNum++;
    }

    // Step 6: Upload conver_csv
    console.log(`Step ${stepNum}: POST /upload/conver_csv...`);
    const converCsvContent = 'S,1,6,10,JSON\r\n';
    await uploadMultipart('/upload/conver_csv', 'conver_csv', converCsvContent, stepNum++);

    // Step 7-10: Upload template + edge_report
    // Templates: /upload/template with filename "report", NO CRC32 prefix (native UI format)
    // Edge report: /upload/nv1 and /upload/nv2 with CRC32 prefix
    if (meters && meters.length > 0 && edgeReportData) {
      // Upload templates to /upload/template with filename "report" (no CRC prefix!)
      // Format: "Report0:{json}\nReport1:{json}\n"
      console.log(`Step ${stepNum}: POST /upload/template (filename: report, no CRC prefix)...`);
      await uploadMultipart('/upload/template', 'report', templateContent, stepNum++);

      console.log(`Step ${stepNum}: POST /upload/nv1 (edge_report with CRC32 prefix)...`);
      await uploadMultipart('/upload/nv1', 'edge_report', edgeReportData, stepNum++);

      console.log(`Step ${stepNum}: POST /upload/nv2 (edge_report with CRC32 prefix)...`);
      await uploadMultipart('/upload/nv2', 'edge_report', edgeReportData, stepNum++);
    }

    // Step 10: RESTART
    console.log(`Step ${stepNum}: RESTART...`);
    try {
      await httpClient.get(`${protocol}://${host}/action_restart.cgi`, { headers, timeout: 5000 });
    } catch (e) { /* Expected - connection drops */ }
    results.push({ step: stepNum++, endpoint: '/action_restart.cgi', status: 200 });
    console.log('RESTART command sent, waiting for gateway to restart...');

    // Wait for gateway to restart and come back online
    // Poll /action_tf.cgi?act=getinfo like the native UI does
    console.log('Polling gateway to check when it comes back online...');
    const maxWaitTime = 60000; // 60 seconds max
    const pollInterval = 3000; // Poll every 3 seconds
    const startTime = Date.now();
    let gatewayOnline = false;

    // Initial wait before first poll (gateway needs time to start rebooting)
    await new Promise(resolve => setTimeout(resolve, 5000));

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const pollResponse = await httpClient.get(`${protocol}://${host}/action_tf.cgi?act=getinfo`, {
          headers,
          timeout: 5000,
        });
        if (pollResponse.status === 200) {
          console.log('Gateway is back online!');
          console.log('TF Card status:', pollResponse.data);
          gatewayOnline = true;
          results.push({ step: stepNum, endpoint: '/action_tf.cgi?act=getinfo', status: 200, data: pollResponse.data });
          break;
        }
      } catch (pollErr) {
        console.log(`Gateway not ready yet (${Math.round((Date.now() - startTime) / 1000)}s elapsed)...`);
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    if (!gatewayOnline) {
      console.log('Warning: Gateway did not respond within timeout, but restart was initiated');
    }

    // Extra restart to fully activate MQTT (30 seconds after first restart)
    if (gatewayOnline) {
      console.log('\n=== Waiting 30 seconds before extra restart ===');
      await new Promise(resolve => setTimeout(resolve, 30000));

      console.log('\n=== EXTRA RESTART (to activate MQTT) ===');
      console.log(`Step ${stepNum}: EXTRA RESTART...`);
      try {
        await httpClient.get(`${protocol}://${host}/action_restart.cgi`, { headers, timeout: 5000 });
      } catch (e) { /* Expected - connection drops */ }
      results.push({ step: stepNum++, endpoint: '/action_restart.cgi (extra)', status: 200 });

      // Wait for gateway to come back online
      await new Promise(resolve => setTimeout(resolve, 5000));

      const startTime2 = Date.now();
      let finalOnline = false;

      while (Date.now() - startTime2 < maxWaitTime) {
        try {
          const pollResponse = await httpClient.get(`${protocol}://${host}/action_tf.cgi?act=getinfo`, {
            headers,
            timeout: 5000,
          });
          if (pollResponse.status === 200) {
            console.log('Gateway is back online after extra restart!');
            finalOnline = true;
            break;
          }
        } catch (pollErr) {
          console.log(`Gateway not ready yet (${Math.round((Date.now() - startTime2) / 1000)}s elapsed)...`);
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

      if (!finalOnline) {
        console.log('Warning: Gateway did not respond after extra restart');
      }
    }

    console.log('\n=== SAVE COMPLETE ===');
    res.json({
      success: true,
      message: 'Configuration saved successfully.',
      results,
      restarted: true,
      gatewayOnline,
    });
  } catch (error) {
    console.error('Save Current error:', error.message);
    console.error('Full error:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      error: 'Save Current failed',
      details: error.message,
      stack: error.stack,
      results,
    });
  }
});

// Download CSV edge config from N720 gateway
// N720 uses download_flex.cgi?name=edge&ext=System_Slave to download the edge CSV
// (discovered by capturing browser request)
app.get('/api/download-edge-csv', async (req, res) => {
  const host = req.query.host;

  if (!host) {
    return res.status(400).json({ error: 'Missing host parameter' });
  }

  console.log(`\n=== Downloading CSV edge config from N720 at ${host} ===`);

  const headers = {
    'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
  };

  // Add ngrok header if needed
  if (host.includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }

  try {
    // N720 uses download_file.cgi endpoint to get the full CSV configuration
    // download_flex.cgi only returns data point names/values, not the full config
    const protocol = host.includes('ngrok') ? 'https' : 'http';
    const downloadUrl = `${protocol}://${host}/download_file.cgi?name=edge`;
    console.log(`Downloading from: ${downloadUrl}`);

    const response = await httpClient.get(downloadUrl, {
      headers,
      timeout: 10000,
      responseType: 'text',
    });

    console.log(`Download response status: ${response.status}`);

    if (response.status === 200 && response.data) {
      const csvContent = String(response.data);
      console.log(`Downloaded CSV length: ${csvContent.length} bytes`);
      console.log('CSV preview:');
      console.log(csvContent.substring(0, 500));

      res.json({
        success: true,
        csvContent,
      });
    } else {
      res.json({
        success: false,
        error: `Download failed with status ${response.status}`,
      });
    }
  } catch (error) {
    console.error('CSV download error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download CSV edge config',
      details: String(error),
    });
  }
});

// Download template files from N720 gateway
// Templates are stored at /template/Report0.json, /template/Report1.json, etc.
// These contain the original meter names in the template content
app.get('/api/download-n720-templates', async (req, res) => {
  const host = req.query.host;
  const count = parseInt(req.query.count) || 10; // Max templates to try

  if (!host) {
    return res.status(400).json({ error: 'Missing host parameter' });
  }

  console.log(`\n=== Downloading N720 templates from ${host} ===`);

  const headers = {
    'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
  };

  if (host.includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }

  const protocol = host.includes('ngrok') ? 'https' : 'http';
  const templates = [];

  // First, try to download the entire template file at once
  // Templates are uploaded as "Report0:{json}\nReport1:{json}\n" format
  // Try multiple possible endpoint names
  const bulkEndpoints = [
    '/download_file.cgi?name=template',
    '/download_file.cgi?name=report',
    '/download_nv.cgi?name=template',
    '/download_nv.cgi?name=report',
  ];

  for (const endpoint of bulkEndpoints) {
    if (templates.length > 0) break;

    try {
      const bulkUrl = `${protocol}://${host}${endpoint}`;
      console.log(`Trying bulk template download: ${bulkUrl}`);

    const bulkResponse = await httpClient.get(bulkUrl, {
      headers,
      timeout: 10000,
      responseType: 'text',
    });

    if (bulkResponse.status === 200 && bulkResponse.data) {
      const content = String(bulkResponse.data);
      console.log(`Bulk template download: ${content.length} bytes`);
      console.log(`First 200 chars: ${content.substring(0, 200)}`);

      // Parse the format: "Report0:{json}\nReport1:{json}\n"
      const lines = content.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const reportName = line.substring(0, colonIndex).trim();
          const jsonContent = line.substring(colonIndex + 1).trim();

          const match = reportName.match(/Report(\d+)/);
          if (match) {
            const index = parseInt(match[1], 10);
            try {
              const template = JSON.parse(jsonContent);
              const meterNames = Object.keys(template).filter(
                key => !key.startsWith('sys_') && key !== 'time'
              );
              if (meterNames.length > 0) {
                templates.push({
                  index,
                  name: meterNames[0],
                  template,
                });
                console.log(`${reportName}: Found meter name = "${meterNames[0]}"`);
              }
            } catch (parseErr) {
              console.log(`${reportName}: Failed to parse JSON - ${parseErr.message}`);
            }
          }
        }
      }

      if (templates.length > 0) {
        console.log(`Found ${templates.length} templates from bulk download via ${endpoint}`);
      }
    }
  } catch (bulkErr) {
    console.log(`Bulk template download via ${endpoint} failed: ${bulkErr.message}`);
  }
  }

  // If bulk download worked, return results
  if (templates.length > 0) {
    return res.json({ success: true, templates });
  }

  // Fallback: Try to download template files individually (Report0.json, Report1.json, etc.)
  // Try multiple path formats as the gateway may serve them differently
  const pathFormats = [
    (i) => `/template/Report${i}.json`,      // Standard path from tmpl_file
    (i) => `/Report${i}.json`,               // Root path
    (i) => `/download_file.cgi?name=template/Report${i}`,  // Via download_file.cgi
  ];

  for (let i = 0; i < count; i++) {
    let found = false;

    for (const pathFormat of pathFormats) {
      if (found) break;

      try {
        const path = pathFormat(i);
        const templateUrl = `${protocol}://${host}${path}`;
        console.log(`Trying: ${templateUrl}`);

        const response = await httpClient.get(templateUrl, {
          headers,
          timeout: 5000,
          responseType: 'text',
        });

        if (response.status === 200 && response.data) {
          const content = String(response.data).trim();
          console.log(`Report${i}.json from ${path}: ${content.substring(0, 100)}`);

          // Skip HTML responses (likely 404 page)
          if (content.startsWith('<') || content.startsWith('<!')) {
            console.log(`Report${i}.json: Got HTML response, skipping`);
            continue;
          }

          // Parse the JSON template to extract meter name
          try {
            const template = JSON.parse(content);
            // Template format: { "MeterName": [{ "ts": "...", "values": {...} }] }
            const meterNames = Object.keys(template).filter(
              key => !key.startsWith('sys_') && key !== 'time'
            );
            if (meterNames.length > 0) {
              templates.push({
                index: i,
                name: meterNames[0],
                template: template,
              });
              console.log(`Report${i}.json: Found meter name = "${meterNames[0]}"`);
              found = true;
            }
          } catch (parseErr) {
            console.log(`Report${i}.json: Failed to parse - ${parseErr.message}`);
          }
        }
      } catch (error) {
        // Try next path format
        console.log(`Report${i}.json via ${pathFormats.indexOf(pathFormat)}: ${error.message}`);
      }
    }

    // If we didn't find this template with any path format, stop
    if (!found && i > 0) {
      console.log(`Report${i}.json: Not found with any path format, stopping`);
      break;
    }
  }

  console.log(`Found ${templates.length} templates`);
  res.json({
    success: true,
    templates,
  });
});

// Debug endpoint: Download various N720 configs to inspect their format
app.get('/api/debug-n720-configs', async (req, res) => {
  const host = req.query.host;

  if (!host) {
    return res.status(400).json({ error: 'Missing host parameter' });
  }

  console.log(`\n=== Debugging N720 configs at ${host} ===`);

  const headers = {
    'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
  };

  const configs = {};
  const configNames = ['link', 'uart', 'edge', 'edge_report', 'edge_link_ctrl', 'edge_access', 'comm_tunnel'];

  for (const name of configNames) {
    try {
      const url = `http://${host}/download_nv.cgi?name=${name}`;
      console.log(`Fetching: ${url}`);
      const response = await httpClient.get(url, {
        headers,
        timeout: 5000,
      });
      configs[name] = response.data;
      console.log(`${name}:`, JSON.stringify(response.data, null, 2).substring(0, 500));
    } catch (error) {
      console.log(`${name}: Failed - ${error.message}`);
      configs[name] = { error: error.message };
    }
  }

  res.json({ host, configs });
});

// Import edge_report JSON to N720 gateway using the native import API
// This mimics what the browser's Import button does in the Data Report page
// The gateway's import function uses /upload/edge_report endpoint with specific format
app.post('/api/import-edge-report', async (req, res) => {
  const { host, reportJson } = req.body;

  if (!host) {
    return res.status(400).json({ error: 'Missing host parameter' });
  }

  if (!reportJson) {
    return res.status(400).json({ error: 'Missing reportJson parameter' });
  }

  console.log(`\n=== Importing edge_report JSON to N720 at ${host} ===`);
  console.log(`Report JSON length: ${reportJson.length} bytes`);
  console.log('Report JSON preview:', reportJson.substring(0, 300));

  const headers = {
    'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
  };

  // Add ngrok header if needed
  if (host.includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }

  try {
    // Parse the JSON to validate it
    let parsedJson;
    try {
      parsedJson = JSON.parse(reportJson);
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid JSON format',
        details: parseError.message
      });
    }

    // Validate structure - must have 'group' array
    if (!parsedJson.group || !Array.isArray(parsedJson.group)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid edge_report structure: missing "group" array'
      });
    }

    // Use HTTPS for ngrok URLs
    const protocol = host.includes('ngrok') ? 'https' : 'http';

    // N720 import uses /upload/edge_report endpoint with multipart form
    // Field name is 'c' and filename should be 'edge_report'
    const uploadUrl = `${protocol}://${host}/upload/edge_report`;
    console.log(`Uploading to: ${uploadUrl}`);

    const FormDataNode = (await import('form-data')).default;
    const formData = new FormDataNode();

    // Important: N720 expects the content without extra line endings
    const jsonBuffer = Buffer.from(reportJson, 'utf8');
    formData.append('c', jsonBuffer, {
      filename: 'edge_report',
      contentType: 'application/json'
    });

    const response = await httpClient.post(uploadUrl, formData, {
      headers: {
        ...headers,
        ...formData.getHeaders()
      },
      timeout: 30000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    console.log(`Import response status: ${response.status}`);
    console.log(`Import response data:`, response.data);

    // Check for success (N720 returns {err: 0} for success)
    const hasError = response.data && typeof response.data === 'object' && response.data.err !== 0;

    if (response.status === 200 && !hasError) {
      res.json({
        success: true,
        message: 'edge_report imported successfully',
        response: response.data,
      });
    } else {
      res.json({
        success: false,
        message: `Import failed: err=${response.data?.err}`,
        error: response.data?.err_info || response.data?.message || 'Unknown error',
        response: response.data,
      });
    }
  } catch (error) {
    console.error('Import edge_report error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import edge_report',
      details: String(error),
    });
  }
});

// Upload file to N720 gateway using /upload/nv1, /upload/nv2, or /upload/template endpoints
// This is the working API for N720 firmware V1.0.13 (discovered by analyzing native UI JavaScript)
//
// KEY DISCOVERY: The native UI uses FormData field name "c" (not "file"):
//   formData.append("c", new File([content], filename))
//
// For templates (/upload/template):
//   - Filename: "report" (not individual template names!)
//   - Content format: "Report0:{json}\nReport1:{json}\n"
//   - No padding required
//
// For edge_report (/upload/nv1, /upload/nv2):
//   - Filename: "edge_report"
//   - Content: JSON with 4-byte "XXXX" prefix padding
//   - Uses tmpl_file references like "/template/Report0.json"
app.post('/api/upload-file', async (req, res) => {
  const { host, path: uploadPath, filename, content } = req.body;

  if (!host) {
    return res.status(400).json({ error: 'Missing host parameter' });
  }

  if (!filename) {
    return res.status(400).json({ error: 'Missing filename parameter' });
  }

  if (!content) {
    return res.status(400).json({ error: 'Missing content parameter' });
  }

  // Default to /upload/nv1 if no path specified
  const actualPath = uploadPath || 'upload/nv1';

  console.log(`\n=== Uploading file to N720 at ${host}/${actualPath} ===`);
  console.log(`Filename: ${filename}`);
  console.log(`Content length: ${content.length} bytes`);
  console.log('Content preview:', content.substring(0, 200));

  const headers = {
    'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
  };

  // Add ngrok header if needed
  if (host.includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }

  try {
    // Use HTTPS for ngrok URLs
    const protocol = host.includes('ngrok') ? 'https' : 'http';
    const uploadUrl = `${protocol}://${host}/${actualPath}`;
    console.log(`Uploading to: ${uploadUrl}`);

    const FormDataNode = (await import('form-data')).default;
    const formData = new FormDataNode();

    // The N720 expects field name 'c' (discovered from native UI JavaScript)
    // Native UI uses: formData.append("c", new File([content], filename))
    // IMPORTANT: Use 'latin1' encoding to preserve binary header bytes (0x49 0x2F 0x21 0xA8)
    // UTF-8 encoding corrupts bytes > 0x7F like 0xA8
    const contentBuffer = Buffer.from(content, 'latin1');

    // Log the first few bytes to verify the header is correct
    console.log(`Content buffer first 10 bytes: ${[...contentBuffer.slice(0, 10)].map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

    formData.append('c', contentBuffer, {
      filename: filename,  // e.g., 'edge_report' or 'report' for templates
      contentType: 'application/octet-stream'  // Native UI doesn't specify content-type
    });

    const response = await httpClient.post(uploadUrl, formData, {
      headers: {
        ...headers,
        ...formData.getHeaders()
      },
      timeout: 30000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    console.log(`Upload response status: ${response.status}`);
    console.log(`Upload response data:`, response.data);

    // Check for success (N720 returns {err: 0} for success)
    if (response.status === 200 && response.data && response.data.err === 0) {
      res.json({
        success: true,
        err: 0,
        message: 'File uploaded successfully',
        response: response.data,
      });
    } else {
      res.json({
        success: false,
        err: response.data?.err || 1,
        message: `Upload failed: err=${response.data?.err}`,
        error: response.data?.err_info || response.data?.message || 'Unknown error',
        response: response.data,
      });
    }
  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({
      success: false,
      err: 1,
      error: 'Failed to upload file',
      details: String(error),
    });
  }
});

// Serve static frontend files in production (after API routes)
console.log('Serving static files from:', distPath);
app.use(express.static(distPath));

// Serve frontend for all other routes (SPA support)
app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  console.log('Serving index.html from:', indexPath);
  res.sendFile(indexPath);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Gateway Configurator running on http://localhost:${PORT}`);
  console.log('API Endpoints:');
  console.log('  GET  /api/discover                  - Scan for gateways');
  console.log('  GET  /api/proxy?host=X&path=Y       - Proxy GET to gateway');
  console.log('  POST /api/proxy?host=X&path=Y       - Proxy POST to gateway');
  console.log('  GET  /api/health                    - Health check');
});

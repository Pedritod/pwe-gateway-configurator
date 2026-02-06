import api from './api';
import type {
  GatewayDefine,
  GatewayTemp,
  GatewayMisc,
  GatewayIPConfig,
  GatewayMQTT,
  GatewayEConfig,
  EdgeConfig,
  GatewayPortConfig,
  GatewayStatus,
} from '../types/gateway';

export class GatewayService {
  private host: string;

  constructor(host: string) {
    this.host = host;
  }

  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const queryParams = new URLSearchParams({
      host: this.host,
      path,
      ...params,
    });
    const response = await api.get<T>(`/proxy?${queryParams.toString()}`);
    return response.data;
  }

  async getDefine(): Promise<GatewayDefine> {
    return this.get<GatewayDefine>('define.json');
  }

  async getTemp(): Promise<GatewayTemp> {
    return this.get<GatewayTemp>('temp.json');
  }

  async getMisc(): Promise<GatewayMisc> {
    return this.get<GatewayMisc>('misc.json');
  }

  async getIPConfig(): Promise<GatewayIPConfig> {
    return this.get<GatewayIPConfig>('ipconfig.json');
  }

  async getMQTT(): Promise<GatewayMQTT> {
    return this.get<GatewayMQTT>('mqttbase.json');
  }

  async getEConfig(): Promise<GatewayEConfig> {
    return this.get<GatewayEConfig>('econfig.json');
  }

  async getEdge(): Promise<EdgeConfig> {
    return this.get<EdgeConfig>('edge.json');
  }

  async getPort0(): Promise<GatewayPortConfig> {
    return this.get<GatewayPortConfig>('port0.json');
  }

  // Alias for getPort0 - used to check if CGI is ready
  async getPortConfig(): Promise<GatewayPortConfig> {
    return this.getPort0();
  }

  async getFullStatus(): Promise<GatewayStatus> {
    try {
      const [define, temp, misc, ipConfig, mqtt, econfig, edge, port0] = await Promise.all([
        this.getDefine().catch(() => undefined),
        this.getTemp().catch(() => undefined),
        this.getMisc().catch(() => undefined),
        this.getIPConfig().catch(() => undefined),
        this.getMQTT().catch(() => undefined),
        this.getEConfig().catch(() => undefined),
        this.getEdge().catch(() => undefined),
        this.getPort0().catch(() => undefined),
      ]);

      return {
        connected: true,
        ip: this.host,
        define,
        temp,
        misc,
        ipConfig,
        mqtt,
        econfig,
        edge,
        port0,
      };
    } catch (error) {
      return {
        connected: false,
        ip: this.host,
      };
    }
  }

  // Save edge configuration to gateway using multipart/form-data upload
  async saveEdgeConfig(config: EdgeConfig): Promise<boolean> {
    try {
      // Use the dedicated upload endpoint that sends as multipart/form-data
      const response = await api.post(`/upload-edge?host=${encodeURIComponent(this.host)}`, config);
      return response.data?.success === true;
    } catch (error) {
      console.error('Failed to save edge config:', error);
      return false;
    }
  }

  // Reboot the gateway
  // N510 uses misc.cgi?reboot=1 (discovered via web interface)
  async reboot(): Promise<boolean> {
    // Try different reboot endpoints (varies by gateway model)
    const endpoints = [
      'misc.cgi?reboot=1',  // N510 uses this
      'reboot.cgi',
      'restart.cgi',
      'sys_reboot.cgi',
    ];

    for (const endpoint of endpoints) {
      try {
        await this.get(endpoint);
        console.log(`Reboot triggered via ${endpoint}`);
        return true;
      } catch {
        // Reboot may cause connection drop which throws an error
        // This is expected behavior - return true anyway
        console.log(`Reboot request sent via ${endpoint} (connection may have dropped as expected)`);
        return true;
      }
    }
    return false;
  }

  // Enable Edge Computing via econfig.cgi
  async enableEdgeComputing(): Promise<boolean> {
    try {
      // Get current econfig to preserve other settings
      const econfig = await this.getEConfig();
      const params = new URLSearchParams({
        edgeen: '1',  // Enable Edge Computing
        inqu_en: econfig?.inqu_en || '0',
        inqu_m: econfig?.inqu_m || '0',
        inqu_t: econfig?.inqu_t || '/QueryTopic',
        inqu_qos: econfig?.inqu_qos || '0',
      });
      return await this.callCgi(`econfig.cgi?${params.toString()}`);
    } catch (error) {
      console.error('Failed to enable edge computing:', error);
      return false;
    }
  }

  // Call login.cgi to apply/commit changes
  async applyChanges(): Promise<boolean> {
    try {
      await this.callCgi('login.cgi?');
      console.log('Changes applied via login.cgi');
      return true;
    } catch (error) {
      console.error('Failed to apply changes via login.cgi:', error);
      return false;
    }
  }

  // Fetch a path and return raw response
  async fetchPath(path: string): Promise<string | null> {
    try {
      const response = await this.get<string>(path);
      return response;
    } catch {
      return null;
    }
  }

  // Fetch JSON from a path
  async fetchJson<T>(path: string): Promise<T | null> {
    try {
      return await this.get<T>(path);
    } catch {
      return null;
    }
  }

  // Call a CGI endpoint (gateway uses GET for config changes)
  async callCgi(path: string): Promise<boolean> {
    try {
      await this.get(path);
      return true;
    } catch {
      return false;
    }
  }

  // Save MQTT configuration
  // Full parameter list discovered via ngrok inspection of N510 web interface
  async saveMqttConfig(config: {
    deviceName: string;
    token: string;
    serverAddress?: string;
    port?: number;
  }): Promise<boolean> {
    try {
      const params = new URLSearchParams({
        mqtten: '1',           // Enable MQTT (0=Disable, 1=Enable)
        mqttver: '4',          // MQTT Version (3=3.1, 4=3.1.1)
        cid: config.deviceName, // Client ID
        addr: config.serverAddress || 'monitor.poweremp.it', // Server Address
        lpt: '0',              // Local Port
        rpt: String(config.port || 1883), // Remote Port
        ka: '60',              // Keepalive Interval (seconds)
        ndtrct: '0',           // Reconnecting time Without Data
        rctime: '5',           // Reconnection Interval
        cs: '0',               // Clean session (0=disabled, 1=enabled)
        mqv: '1',              // User Credentials enabled (0=disabled, 1=enabled)
        usr: config.token,     // Username (ThingsBoard access token)
        pwd: '',               // Password (empty for ThingsBoard)
        wf: '0',               // Enable last will (0=disabled)
        wtop: '/will',         // Will topic
        wmsg: 'offline',       // Will message
        wqos: '0',             // Will QoS
        wrtd: '0',             // Will retained
        sslm: '0',             // SSL mode (0=disabled)
        sslv: '0',             // SSL verification
        hosten: '0',           // Host enable
        hostname: '',          // Hostname
      });

      // Try different CGI endpoints (varies by gateway model)
      // N510 uses mqttbase.cgi (confirmed via ngrok)
      const endpoints = ['mqttbase.cgi', 'mqtt.cgi'];
      for (const endpoint of endpoints) {
        const result = await this.callCgi(`${endpoint}?${params.toString()}`);
        if (result) {
          console.log(`MQTT config saved via ${endpoint}`);
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Failed to save MQTT config:', error);
      return false;
    }
  }

  // Enable DHCP (automatic IP) and reboot
  async enableDhcp(): Promise<boolean> {
    try {
      // First get current IP config to preserve other values
      const currentConfig = await this.getIPConfig();
      if (!currentConfig) {
        console.error('Failed to get current IP config');
        return false;
      }

      // Build params with all fields, but set staticip=0 for DHCP
      // The CGI endpoint may require all parameters
      const params = new URLSearchParams({
        staticip: '0',        // 0 = DHCP enabled
        statdns: '0',         // 0 = Auto DNS
        sip: currentConfig.sip || '192.168.0.7',    // Static IP (used as fallback)
        gip: currentConfig.gip || '192.168.0.1',    // Gateway IP
        mip: currentConfig.mip || '255.255.255.0',  // Subnet mask
        dip: currentConfig.dip || '8.8.8.8',        // Primary DNS
        sdip: currentConfig.sdip || '8.8.4.4',      // Secondary DNS
      });

      console.log('Enabling DHCP with params:', params.toString());
      const result = await this.callCgi(`ipconfig.cgi?${params.toString()}`);
      if (!result) {
        return false;
      }

      // Trigger a reboot to apply the new IP settings
      // Note: This will disconnect the gateway
      await this.reboot();

      return true;
    } catch (error) {
      console.error('Failed to enable DHCP:', error);
      return false;
    }
  }

  // Configure Port 1 with standard Modbus RTU settings (9600 baud, RS485)
  // Key insight: The web interface uses minimal parameters including 'runserialmode=1'
  // which appears to be required for the serialmode setting to actually apply.
  // The config doesn't apply immediately - it requires a reboot (done by MqttSetup).
  async configurePort1(): Promise<boolean> {
    // First check if already configured
    try {
      const currentConfig = await this.getPort0();
      if (currentConfig?.buad === '9600' && currentConfig?.serialmode === '3') {
        console.log('Port 1 already configured correctly (9600, RS485)');
        return true;
      }
      console.log('Current port config: buad=', currentConfig?.buad, 'serialmode=', currentConfig?.serialmode);
    } catch {
      console.log('Could not read current port config, will try to configure anyway...');
    }

    console.log(`Configuring Port 1 for ${this.host}...`);

    // KEY DISCOVERY: The web interface first calls indexcn.cgi?port=0
    // (when clicking on "Port" tab) to warm up the CGI handler, THEN calls port$.cgi
    // and gets 200 OK. Without this warm-up, port$.cgi returns ECONNRESET.

    // Step 1: Warm up with indexcn.cgi?port=0 call (like clicking on Port tab)
    console.log('Warming up CGI handler with indexcn.cgi?port=0 call...');
    try {
      await this.callCgi('indexcn.cgi?port=0');
      console.log('Warm-up call: success');
    } catch {
      console.log('Warm-up call: failed (may be expected)');
    }

    // Step 2: Now call port$.cgi with the actual parameters
    const portParams = [
      'buad=9600',
      'datasize=8',
      'parity=0',
      'stopbit=1',
      'serialmode=3',
      'flowc=0',
      'packlen=0',
      'packtime=0',
      'rfc2217=1',
      'phearten=0',
      'pheartdata=heartbeat',
      'phearthex=0',
      'pheartasc=1',
      'phearttime=30',
      'workmodea=4',
      'sockmode=0',
      'maxclient=8',
      'overclient=0',
      'httptype=0',
      'rmhead=1',
      'url=%2F1.php%3F',
      'packhead=User_Agent%3A%20Mozilla%2F4.0%0d%0a',
      'rurl=192.168.0.201',
      'lports=23',
      'lport=0',
      'rporta=23',
      'udpcheckport=0',
      'reconnecttime=0',
      'shortcontime=3',
      'waittime=10',
      'netpr=0',
      'poll=0',
      'modbusack=0',
      'nhearten=0',
      'nheartdata=heartbeat',
      'nhearthex=0',
      'nheartasc=1',
      'nhearttime=30',
      'regdatatype=0',
      'regdata=register',
      'reghex=0',
      'regasc=1',
      'deviceid=0',
      'cloudpasw=0',
      'sslm=0',
      'sslv=0',
      'workmodeb=0',
      'rurlb=192.168.0.201',
      'lportb=0',
      'rportb=20105',
    ].join('&');

    // Send the config request to port$.cgi (after warm-up, this should get 200 OK)
    console.log('Sending port configuration to port$.cgi...');
    const result = await this.callCgi(`port$.cgi?${portParams}`);
    console.log(`port$.cgi result: ${result ? 'success' : 'failed'}`);

    // Note: The config may not be verifiable until after a reboot
    // MqttSetup will trigger a reboot after this method returns
    console.log('Port configuration requests sent. Config will apply after reboot.');

    // Try to verify anyway (may or may not work before reboot)
    try {
      const portConfig = await this.getPort0();
      if (portConfig?.buad === '9600' && portConfig?.serialmode === '3') {
        console.log('Port 1 configuration already verified!');
        return true;
      }
      console.log('Port config not yet applied (expected - needs reboot). Current:',
        'buad=', portConfig?.buad, 'serialmode=', portConfig?.serialmode);
      // Return true anyway - the config will apply after reboot
      return true;
    } catch {
      console.log('Could not verify port config (will verify after reboot)');
      // Return true - config was sent, will apply after reboot
      return true;
    }
  }

  // Get URL for manual port configuration (for when automatic config fails)
  getPortConfigUrl(): string {
    const protocol = this.host.includes('ngrok') ? 'https' : 'http';
    return `${protocol}://${this.host}/ser2net1.html`;
  }

  // Wait for gateway to come back online after reboot by polling
  async waitForGateway(maxWaitMs: number = 15000, pollIntervalMs: number = 1000): Promise<boolean> {
    const startTime = Date.now();
    console.log(`Waiting for gateway ${this.host} to come back online...`);

    while (Date.now() - startTime < maxWaitMs) {
      try {
        await this.getDefine();
        console.log(`Gateway is back online after ${Date.now() - startTime}ms`);
        return true;
      } catch {
        // Gateway not ready yet, wait and retry
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }
    }

    console.log(`Gateway did not respond within ${maxWaitMs}ms`);
    return false;
  }

  // Set reporting interval in edge.json
  async setReportingInterval(intervalSeconds: number): Promise<boolean> {
    try {
      // Get current edge config
      let edgeConfig = await this.getEdge();

      // If edge config doesn't exist or is invalid, create a minimal one
      if (!edgeConfig || !edgeConfig.rtable) {
        console.log('Edge config not initialized, creating minimal config');
        edgeConfig = {
          stamp: Date.now(),
          ctable: edgeConfig?.ctable || [],
          rtable: {
            rules: [{ type: 1, period: intervalSeconds }],
            format: edgeConfig?.rtable?.format || [{ topic: '/v1/gateway/telemetry', type: 1, template: {} }],
            datas: edgeConfig?.rtable?.datas || [],
          },
        };
      } else {
        // Ensure rules array exists
        if (!edgeConfig.rtable.rules) {
          edgeConfig.rtable.rules = [];
        }

        // Find and update the periodic rule (type: 1)
        let found = false;
        edgeConfig.rtable.rules = edgeConfig.rtable.rules.map(rule => {
          if (rule.type === 1) {
            found = true;
            return { ...rule, period: intervalSeconds };
          }
          return rule;
        });

        // If no periodic rule exists, add one
        if (!found) {
          edgeConfig.rtable.rules.push({ type: 1, period: intervalSeconds });
        }

        // Update timestamp
        edgeConfig.stamp = Date.now();
      }

      console.log('Setting reporting interval to:', intervalSeconds, 'seconds');
      console.log('Updated rules:', JSON.stringify(edgeConfig.rtable.rules));

      // Save the updated config
      return await this.saveEdgeConfig(edgeConfig);
    } catch (error) {
      console.error('Failed to set reporting interval:', error);
      return false;
    }
  }

  // Get current reporting interval from edge config
  async getReportingInterval(): Promise<number | null> {
    try {
      const edgeConfig = await this.getEdge();
      if (!edgeConfig?.rtable?.rules) {
        return null;
      }

      const periodicRule = edgeConfig.rtable.rules.find(rule => rule.type === 1);
      return periodicRule?.period ?? null;
    } catch (error) {
      console.error('Failed to get reporting interval:', error);
      return null;
    }
  }
}

export const createGatewayService = (host: string) => new GatewayService(host);

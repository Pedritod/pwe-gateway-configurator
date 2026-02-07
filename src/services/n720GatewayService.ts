import api from './api';

// CRC32 lookup table (standard polynomial 0xEDB88320)
const CRC32_TABLE: number[] = [];
for (let i = 0; i < 256; i++) {
  let crc = i;
  for (let j = 0; j < 8; j++) {
    crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  CRC32_TABLE[i] = crc >>> 0;
}

// Compute CRC32 checksum of a string (returns 4-byte little-endian header)
// Exported so it can be used by EnergyMeterList.tsx for edge CSV uploads
export function computeCrc32Header(str: string): string {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < str.length; i++) {
    const byte = str.charCodeAt(i) & 0xFF;
    crc = CRC32_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  }
  crc = (crc ^ 0xFFFFFFFF) >>> 0;
  // Return as 4-byte little-endian string
  return String.fromCharCode(
    crc & 0xFF,
    (crc >>> 8) & 0xFF,
    (crc >>> 16) & 0xFF,
    (crc >>> 24) & 0xFF
  );
}

// N720 Status response from download_flex.cgi?name=status
export interface N720Status {
  systime: number;
  runtime: number;
  cloud_sta: number;
  socketa_sta: number;
  socketb_sta: number;
  mqtt1_sta: number;
  mqtt2_sta: number;
  soft_ver: string;
  mac: string;
  sn: string;
  user_sn?: string;
}

// N720 Network response from download_flex.cgi?name=network
export interface N720Network {
  netdev: string;
  eth: {
    link_sta: number;
    ip_mode: number;
    ip: string;
    dns: string;
    sdns: string;
    netmask: string;
  };
}

// N720 Misc response from download_nv.cgi?name=misc
export interface N720Misc {
  web_lang: number;
  host_name: string;
  websock_port: number;
  websocket_point: number;
  web_port: number;
  web_user: string;
  web_psw: string;
  port_max: number;
  port_view: number;
  // ... other fields
}

// N720 MQTT channel configuration
export interface N720MQTTChannel {
  enable: number;
  name: string;
  mqtt_ver: number;
  server_ip: string;
  ssl_mode: number;
  ssl_verify: number;
  ssl_server_name: string;
  ssl_client_name: string;
  ssl_client_key: string;
  loacl_port: number; // Note: typo in gateway API
  server_port: number;
  keepalive: number;
  reconn_space: number;
  clean_session: number;
  client_id: string;
  conn_verify: number;
  conn_user_name: string;
  conn_user_password: string;
  will_flag: number;
  will: {
    topic: string;
    msg: string;
    qos: number;
    retention: number;
  };
}

// N720 Communication tunnel (Socket + MQTT)
export interface N720CommTunnel {
  SOCK: Array<{
    enable: number;
    name: string;
    mode: number;
    tcpc: Record<string, unknown>;
    tcps: Record<string, unknown>;
    udpc: Record<string, unknown>;
    httpc: Record<string, unknown>;
  }>;
  MQTT: N720MQTTChannel[];
  UCLOUD: {
    enable: number;
    name: string;
    pvt_deploy_enable: number;
    server_ip: string;
    server_port: number;
  };
}

// N720 Edge basic settings
export interface N720EdgeSettings {
  all_en: number;
  refresh_frequency: number;
  calc_period: number;
  poll_interval: number;
}

// N720 Edge access group
export interface N720EdgeAccessGroup {
  enable: number;
  name: string;
  proto: number;
  up: {
    link: string;
    topic: string;
    qos: number;
    retention: number;
  };
  down: {
    link: string;
    topic: string;
    qos: number;
  };
}

// N720 Edge access configuration
export interface N720EdgeAccess {
  group: N720EdgeAccessGroup[];
}

// N720 Edge Report Group
// Note: Period is nested in `cond` object in the JSON format used by edge_report import/export
export interface N720EdgeReportGroup {
  enable?: number;
  name?: string;
  link?: string;        // MQTT1, MQTT2, SOCKA, SOCKB, Cloud
  topic?: string;       // Report topic (without leading /)
  qos?: number;         // 0, 1, or 2
  retention?: number;   // Retain message
  period_en?: number;   // Enable periodic reporting (legacy format)
  period?: number;      // Period in seconds (legacy flat format)
  timer_en?: number;    // Enable timer reporting
  data_fmt?: number;    // Data format: 0 = Primate Type, 1 = To String
  err_fill?: number;    // Error fill
  template?: string;    // JSON template string (legacy format)
  // Import/export format uses nested cond object
  cond?: {
    period?: number;    // Reporting period in seconds
    timed?: {
      type?: number;
      hh?: number;
      mm?: number;
    };
  };
  tmpl_cont?: Record<string, unknown>;  // Template content object
}

// N720 Edge report configuration
export interface N720EdgeReport {
  group: N720EdgeReportGroup[];
}

// N720 Edge Node (Data Acquisition device)
export interface N720EdgeNodePoint {
  name: string;
  dtype: number;      // Data type
  reg: string;        // Register address
  rw: number;         // Read/Write: 0=Read, 1=Write
}

export interface N720EdgeNode {
  enable: number;
  name: string;
  proto: number;      // Protocol: 1=Modbus RTU, 2=Modbus TCP, etc.
  port: string;       // UART1, UART2, etc.
  slave_addr: number;
  points: N720EdgeNodePoint[];
}

// N720 Edge Node configuration
export interface N720EdgeNodeConfig {
  node: N720EdgeNode[];
}

// N720 UART channel configuration
export interface N720UartChannel {
  enable: number;
  name: string;
  work_mode: number;  // 1=RS232, 2=RS485
  baud_rate: number;
  data_bit: number;   // 7 or 8
  stop_bit: number;   // 1 or 2
  parity: number;     // 0=None, 1=Odd, 2=Even
  pack_len: number;
  pack_time: number;
  func?: number;      // Only for Uart1
  select?: number;    // Only for Uart2/3
}

// N720 UART configuration
export interface N720UartConfig {
  UART: N720UartChannel[];
}

// Simple cache to prevent duplicate requests to the same endpoint
// The N720 gateway can't handle multiple rapid requests and returns ECONNRESET
const requestCache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5000; // 5 seconds

function getCached<T>(key: string): T | null {
  const cached = requestCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`N720 cache hit for: ${key}`);
    return cached.data as T;
  }
  return null;
}

function setCache(key: string, data: unknown): void {
  requestCache.set(key, { data, timestamp: Date.now() });
}

/**
 * N720 Gateway Service
 * Handles communication with USR-N720 gateways which have a different API than N510
 */
export class N720GatewayService {
  private host: string;

  constructor(host: string) {
    this.host = host;
  }

  private async get<T>(path: string, retries = 2): Promise<T> {
    const cacheKey = `${this.host}:${path}`;

    // Check cache first
    const cached = getCached<T>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const queryParams = new URLSearchParams({
      host: this.host,
      path,
    });

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await api.get<T>(`/proxy?${queryParams.toString()}`);
        // Cache successful response
        setCache(cacheKey, response.data);
        return response.data;
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        // Retry on connection reset errors
        if ((errorMsg.includes('ECONNRESET') || errorMsg.includes('500')) && attempt < retries) {
          console.log(`N720 request failed (${errorMsg}), retrying in 500ms... (attempt ${attempt + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }
        throw error;
      }
    }
    throw new Error('Request failed after retries');
  }

  // Fetch status (equivalent to N510's define.json + temp.json)
  async getStatus(): Promise<N720Status> {
    return this.get<N720Status>('download_flex.cgi?name=status');
  }

  // Fetch network configuration
  async getNetwork(): Promise<N720Network> {
    return this.get<N720Network>('download_flex.cgi?name=network');
  }

  // Fetch misc settings (device name, ports, etc.)
  async getMisc(): Promise<N720Misc> {
    return this.get<N720Misc>('download_nv.cgi?name=misc');
  }

  // Fetch communication tunnel (Socket + MQTT settings)
  async getCommTunnel(): Promise<N720CommTunnel> {
    return this.get<N720CommTunnel>('download_nv.cgi?name=comm_tunnel');
  }

  // Fetch edge basic settings
  async getEdgeSettings(): Promise<N720EdgeSettings> {
    return this.get<N720EdgeSettings>('download_nv.cgi?name=edge');
  }

  // Fetch edge access configuration
  async getEdgeAccess(): Promise<N720EdgeAccess> {
    return this.get<N720EdgeAccess>('download_nv.cgi?name=edge_access');
  }

  // Fetch edge report configuration
  // The endpoint name may vary by firmware version
  // Note: N720 firmware has a bug where download_nv.cgi truncates the first ~5 characters
  // of the response, so we need to handle that by requesting raw text and fixing it
  async getEdgeReport(): Promise<N720EdgeReport> {
    // Try different possible endpoint names
    const endpoints = [
      'download_nv.cgi?name=edge_report',
      'download_nv.cgi?name=edgereport',
      'download_nv.cgi?name=edge_rpt',
    ];

    for (const endpoint of endpoints) {
      try {
        const result = await this.get<N720EdgeReport>(endpoint);
        if (result && (result.group || Array.isArray(result))) {
          console.log(`N720 edge report loaded from: ${endpoint}`);
          return result;
        }
      } catch (err) {
        console.log(`N720 endpoint ${endpoint} failed:`, err);
        // Try next endpoint
      }
    }

    // Fallback: Try to get raw response and fix truncation bug
    // The N720 firmware truncates the first ~5 characters of the response
    // Response starts with 'oup":[{' instead of '{"group":[{'
    try {
      const queryParams = new URLSearchParams({
        host: this.host,
        path: 'download_nv.cgi?name=edge_report',
        raw: 'true',  // Request raw text response
      });

      const response = await api.get<string>(`/proxy?${queryParams.toString()}`, {
        transformResponse: [(data) => data],  // Don't parse as JSON
      });

      let rawText = response.data;
      console.log('N720 edge_report raw response:', rawText?.substring(0, 100));

      // Handle different response formats
      if (rawText && typeof rawText === 'string') {
        // Case 1: Response starts with 4-byte padding header (from /upload/nv1 format)
        // The padding bytes are 0x49 0x2F 0x21 0xA8 or similar binary data before JSON
        // Find the start of JSON by looking for '{"group"' pattern
        const jsonStart = rawText.indexOf('{"group"');
        if (jsonStart > 0) {
          rawText = rawText.substring(jsonStart);
          console.log('N720 edge_report: Stripped', jsonStart, 'byte header');
        }

        // Case 2: Response is truncated (starts with 'oup":[' instead of '{"group":[')
        if (rawText.startsWith('oup":[')) {
          // Fix truncation: prepend '{"gr' to make valid JSON
          rawText = '{"gr' + rawText;
          console.log('N720 edge_report: Fixed truncated response');
        }

        try {
          const parsed = JSON.parse(rawText) as N720EdgeReport;
          if (parsed && parsed.group) {
            console.log(`N720 edge_report parsed successfully: ${parsed.group.length} groups`);
            return parsed;
          }
        } catch (parseErr) {
          console.log('N720 edge_report: Failed to parse response:', parseErr);
        }
      }
    } catch (rawErr) {
      console.log('N720 edge_report: Raw fetch failed:', rawErr);
    }

    // Return empty config if nothing works
    console.log('N720: No edge report endpoint available');
    return { group: [] };
  }

  // Fetch edge node configuration (Data Acquisition devices)
  // The endpoint name may vary by firmware version
  async getEdgeNodes(): Promise<N720EdgeNodeConfig> {
    // Try different possible endpoint names
    const endpoints = [
      'download_nv.cgi?name=edge_node',
      'download_nv.cgi?name=edgenode',
      'download_nv.cgi?name=edge_dev',
      'download_nv.cgi?name=edge_device',
    ];

    for (const endpoint of endpoints) {
      try {
        const result = await this.get<N720EdgeNodeConfig>(endpoint);
        if (result && (result.node || Array.isArray(result))) {
          console.log(`N720 edge nodes loaded from: ${endpoint}`);
          return result;
        }
      } catch (err) {
        console.log(`N720 endpoint ${endpoint} failed:`, err);
        // Try next endpoint
      }
    }

    // Return empty config if none of the endpoints work
    console.log('N720: No edge node endpoint available');
    return { node: [] };
  }

  // Save edge node configuration (add/update a device)
  async saveEdgeNode(nodeIndex: number, node: {
    name: string;
    slaveAddress: number;
    points: Array<{ name: string; register: string; dataType: number }>;
  }): Promise<boolean> {
    try {
      const params = new URLSearchParams();
      params.set('file', 'edge_node');

      // Node settings
      params.set(`n_node[${nodeIndex}].enable`, '1');
      params.set(`n_node[${nodeIndex}].name`, node.name);
      params.set(`n_node[${nodeIndex}].proto`, '1');  // 1 = Modbus RTU
      params.set(`n_node[${nodeIndex}].port`, 'UART1');
      params.set(`n_node[${nodeIndex}].slave_addr`, String(node.slaveAddress));

      // Add data points
      node.points.forEach((point, pointIndex) => {
        params.set(`n_node[${nodeIndex}].n_points[${pointIndex}].name`, point.name);
        params.set(`n_node[${nodeIndex}].n_points[${pointIndex}].dtype`, String(point.dataType));
        params.set(`n_node[${nodeIndex}].n_points[${pointIndex}].reg`, point.register);
        params.set(`n_node[${nodeIndex}].n_points[${pointIndex}].rw`, '0');  // Read only
      });

      await this.get(`update_nv.cgi?${params.toString()}`);
      return true;
    } catch (error) {
      console.error('Failed to save edge node:', error);
      return false;
    }
  }

  // Save edge report group (one group per device)
  async saveEdgeReportGroup(groupIndex: number, group: {
    name: string;
    topic: string;
    period: number;
    template: Record<string, unknown>;
  }): Promise<boolean> {
    try {
      const params = new URLSearchParams();
      params.set('file', 'edge_report');

      // Group settings
      params.set(`n_group[${groupIndex}].enable`, '1');
      params.set(`n_group[${groupIndex}].name`, group.name);
      params.set(`n_group[${groupIndex}].link`, 'MQTT1');
      params.set(`n_group[${groupIndex}].topic`, group.topic);  // No leading slash
      params.set(`n_group[${groupIndex}].qos`, '1');  // QoS 1
      params.set(`n_group[${groupIndex}].retention`, '0');
      params.set(`n_group[${groupIndex}].period_en`, '1');  // Enable periodic reporting
      params.set(`n_group[${groupIndex}].period`, String(group.period));
      params.set(`n_group[${groupIndex}].timer_en`, '0');
      params.set(`n_group[${groupIndex}].data_fmt`, '0');  // Primate Type
      params.set(`n_group[${groupIndex}].err_fill`, '0');
      params.set(`n_group[${groupIndex}].template`, JSON.stringify(group.template));

      await this.get(`update_nv.cgi?${params.toString()}`);
      return true;
    } catch (error) {
      console.error('Failed to save edge report group:', error);
      return false;
    }
  }

  // Add a complete meter (node + report group) for N720
  // Each meter gets its own report group with only that device in the template
  async addMeter(meterIndex: number, config: {
    name: string;
    slaveAddress: number;
    topic: string;
    period: number;
    points: Array<{ name: string; register: string; dataType: number }>;
  }): Promise<boolean> {
    try {
      // Step 1: Save the node (device)
      const nodeSaved = await this.saveEdgeNode(meterIndex, {
        name: config.name,
        slaveAddress: config.slaveAddress,
        points: config.points,
      });

      if (!nodeSaved) {
        console.error('Failed to save edge node');
        return false;
      }

      // Step 2: Create the report template with only this device
      // Template format: { "MeterName": { "point1": "point1", "point2": "point2" }, "time": "sys_local_time" }
      const pointsTemplate: Record<string, string> = {};
      config.points.forEach(point => {
        pointsTemplate[point.name] = point.name;
      });

      const template: Record<string, unknown> = {
        [config.name]: pointsTemplate,
        time: 'sys_local_time',
      };

      // Step 3: Save the report group
      const reportSaved = await this.saveEdgeReportGroup(meterIndex, {
        name: `Report_${config.name}`,
        topic: config.topic,
        period: config.period,
        template,
      });

      if (!reportSaved) {
        console.error('Failed to save edge report group');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Failed to add meter:', error);
      return false;
    }
  }

  // Enable Edge Gateway functionality
  async enableEdgeGateway(): Promise<boolean> {
    try {
      const params = new URLSearchParams();
      params.set('file', 'edge');
      params.set('all_en', '1');
      params.set('refresh_frequency', '100');
      params.set('calc_period', '100');
      params.set('poll_interval', '100');

      await this.get(`update_nv.cgi?${params.toString()}`);
      return true;
    } catch (error) {
      console.error('Failed to enable edge gateway:', error);
      return false;
    }
  }

  // Get device info (model, firmware, MAC)
  async getDeviceInfo(): Promise<{
    model: string;
    firmware: string;
    mac: string;
    deviceName: string;
  }> {
    const [status, misc] = await Promise.all([
      this.getStatus(),
      this.getMisc(),
    ]);

    // Format MAC address with colons
    const macFormatted = status.mac.match(/.{2}/g)?.join(':') || status.mac;

    return {
      model: 'N720',
      firmware: status.soft_ver,
      mac: macFormatted,
      deviceName: misc.host_name,
    };
  }

  // Get MQTT configuration for a specific channel (1 or 2)
  async getMQTTConfig(channel: 1 | 2 = 1): Promise<N720MQTTChannel | null> {
    try {
      const commTunnel = await this.getCommTunnel();
      const mqttIndex = channel - 1;
      return commTunnel.MQTT[mqttIndex] || null;
    } catch {
      return null;
    }
  }

  // Check if gateway is N720 by trying to fetch status
  async isN720(): Promise<boolean> {
    try {
      const status = await this.getStatus();
      return !!status.soft_ver && status.soft_ver.includes('V1.');
    } catch {
      return false;
    }
  }

  // Save MQTT configuration using query string parameters (like UART config)
  // This configures MQTT1 (index 0) with the same settings as N510
  // N720 API uses n_ prefix for numeric values, s_ prefix for string values
  async saveMQTTConfig(channel: 1 | 2, config: {
    serverAddress: string;
    port: number;
    deviceName: string;  // client_id
    token: string;       // conn_user_name (ThingsBoard access token)
  }): Promise<boolean> {
    try {
      const mqttIndex = channel - 1;
      const otherIndex = mqttIndex === 0 ? 1 : 0;

      // Build query string with MQTT parameters
      // Format: update_nv.cgi?file=comm_tunnel&n_MQTT[index].param=value (numeric) or s_MQTT[index].param=value (string)
      // N720 requires ALL parameters for BOTH MQTT channels to be sent together
      const params = new URLSearchParams();
      params.set('file', 'comm_tunnel');

      // === MQTT channel being configured ===
      // Enable MQTT
      params.set(`n_MQTT[${mqttIndex}].enable`, '1');
      // MQTT version: 4 = MQTT 3.1.1
      params.set(`n_MQTT[${mqttIndex}].mqtt_ver`, '4');
      // Server settings (string values use s_ prefix)
      params.set(`s_MQTT[${mqttIndex}].server_ip`, config.serverAddress);
      params.set(`n_MQTT[${mqttIndex}].loacl_port`, '0');
      params.set(`n_MQTT[${mqttIndex}].server_port`, String(config.port));
      // Connection settings
      params.set(`n_MQTT[${mqttIndex}].keepalive`, '60');
      params.set(`n_MQTT[${mqttIndex}].reconn_space`, '5');
      params.set(`n_MQTT[${mqttIndex}].clean_session`, '0');
      // Client ID (device name) - STRING, use s_ prefix
      params.set(`s_MQTT[${mqttIndex}].client_id`, config.deviceName);
      // Authentication: conn_verify=1 enables username/password
      params.set(`n_MQTT[${mqttIndex}].conn_verify`, '1');
      params.set(`s_MQTT[${mqttIndex}].conn_user_name`, config.token);
      params.set(`s_MQTT[${mqttIndex}].conn_user_password`, '');  // ThingsBoard doesn't use password
      // Last Will settings
      params.set(`n_MQTT[${mqttIndex}].will_flag`, '0');
      params.set(`s_MQTT[${mqttIndex}].will.topic`, '/will');
      params.set(`s_MQTT[${mqttIndex}].will.msg`, 'offline');
      params.set(`n_MQTT[${mqttIndex}].will.qos`, '0');
      params.set(`n_MQTT[${mqttIndex}].will.retention`, '0');
      // SSL settings
      params.set(`n_MQTT[${mqttIndex}].ssl_mode`, '0');
      params.set(`n_MQTT[${mqttIndex}].ssl_verify`, '0');

      // === Other MQTT channel (keep disabled with defaults) ===
      params.set(`n_MQTT[${otherIndex}].enable`, '0');
      params.set(`n_MQTT[${otherIndex}].mqtt_ver`, '4');
      params.set(`s_MQTT[${otherIndex}].server_ip`, '192.168.0.201');
      params.set(`n_MQTT[${otherIndex}].loacl_port`, '0');
      params.set(`n_MQTT[${otherIndex}].server_port`, '1883');
      params.set(`n_MQTT[${otherIndex}].keepalive`, '60');
      params.set(`n_MQTT[${otherIndex}].reconn_space`, '5');
      params.set(`n_MQTT[${otherIndex}].clean_session`, '0');
      params.set(`s_MQTT[${otherIndex}].client_id`, '');
      params.set(`n_MQTT[${otherIndex}].conn_verify`, '0');
      params.set(`s_MQTT[${otherIndex}].conn_user_name`, '');
      params.set(`s_MQTT[${otherIndex}].conn_user_password`, '');
      params.set(`n_MQTT[${otherIndex}].will_flag`, '0');
      params.set(`s_MQTT[${otherIndex}].will.topic`, '/will');
      params.set(`s_MQTT[${otherIndex}].will.msg`, 'offline');
      params.set(`n_MQTT[${otherIndex}].will.qos`, '0');
      params.set(`n_MQTT[${otherIndex}].will.retention`, '0');
      params.set(`n_MQTT[${otherIndex}].ssl_mode`, '0');
      params.set(`n_MQTT[${otherIndex}].ssl_verify`, '0');

      const response = await this.get(`update_nv.cgi?${params.toString()}`);
      console.log('MQTT configuration response:', response);

      // Also configure offline cache for the MQTT channel
      // tunnel[2] = MQTT1, tunnel[3] = MQTT2
      const cacheParams = new URLSearchParams();
      cacheParams.set('file', 'offline_cache');
      cacheParams.set(`n_tunnel[${mqttIndex + 2}].enable`, '1');  // Enable offline cache for our channel
      cacheParams.set(`n_tunnel[${otherIndex + 2}].enable`, '0'); // Disable for other channel
      await this.get(`update_nv.cgi?${cacheParams.toString()}`);
      console.log('Offline cache configured');

      return true;
    } catch (error) {
      console.error('Failed to save MQTT config:', error);
      return false;
    }
  }

  // Save current configuration to flash (persists settings across reboots)
  // This is what the native UI does when you click "Save Current"
  // Without this step, changes made via update_nv.cgi are only in RAM
  async saveCurrentToFlash(): Promise<boolean> {
    // Try multiple possible endpoints for saving to flash
    const saveEndpoints = [
      'action_restart.cgi?act=save',  // Possible save endpoint
      'save_config.cgi',              // Alternative save endpoint
      'update_nv.cgi?file=save',      // Another possible endpoint
      'action_save.cgi',              // Yet another possibility
    ];

    for (const endpoint of saveEndpoints) {
      try {
        console.log(`Trying save endpoint: ${endpoint}`);
        const response = await this.get<{ err?: number }>(endpoint);
        console.log(`Save response from ${endpoint}:`, response);
        if (response?.err === 0 || response?.err === undefined) {
          console.log(`Successfully saved to flash via ${endpoint}`);
          return true;
        }
      } catch (error) {
        console.log(`Endpoint ${endpoint} failed:`, error);
        // Continue to next endpoint
      }
    }

    console.warn('All save endpoints failed - settings may not persist');
    return false;
  }

  // Reboot gateway using the native UI endpoint
  async reboot(): Promise<boolean> {
    try {
      // Native UI uses action_restart.cgi for restart (not update_nv.cgi?file=reboot)
      console.log('Rebooting gateway via action_restart.cgi...');
      await this.get('action_restart.cgi');
      return true;
    } catch {
      // Reboot may cause connection to drop - that's expected
      return true;
    }
  }

  // Save and reboot - the proper sequence that the native UI uses
  async saveAndReboot(): Promise<boolean> {
    try {
      // Step 1: Save current config to flash
      const saved = await this.saveCurrentToFlash();
      if (!saved) {
        console.warn('Save to flash may have failed, proceeding with reboot anyway');
      }

      // Step 2: Wait a moment for the save to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 3: Reboot the gateway
      return await this.reboot();
    } catch (error) {
      console.error('Save and reboot failed:', error);
      return false;
    }
  }

  // Fetch UART configuration
  async getUartConfig(): Promise<N720UartConfig> {
    return this.get<N720UartConfig>('download_nv.cgi?name=uart');
  }

  // Fetch link configuration (maps serial ports to edge computing)
  // This is needed to understand what format N720 expects for the "link" file
  async getLinkConfig(): Promise<unknown> {
    try {
      return await this.get<unknown>('download_nv.cgi?name=link');
    } catch (error) {
      console.log('Failed to get link config (may not exist yet):', error);
      return null;
    }
  }

  // Configure UART1 for RS485 (same settings as N510 port1)
  // Settings: 9600 baud, 8 data bits, no parity, 1 stop bit, RS485 mode
  async configureUart1(): Promise<boolean> {
    try {
      // First get current config to preserve Uart2 settings
      const currentConfig = await this.getUartConfig();

      // Build the query string with Uart1 configured for RS485
      // and preserve Uart2 settings
      const params = new URLSearchParams();
      params.set('file', 'uart');

      // Uart1 (index 0) - configure for RS485
      params.set('n_UART[0].baud_rate', '9600');
      params.set('n_UART[0].data_bit', '8');
      params.set('n_UART[0].parity', '0');      // 0 = None
      params.set('n_UART[0].stop_bit', '1');
      params.set('n_UART[0].work_mode', '2');   // 2 = RS485
      params.set('n_UART[0].func', '1');        // Edge computing function

      // Uart2 (index 1) - preserve current settings
      if (currentConfig.UART[1]) {
        params.set('n_UART[1].baud_rate', String(currentConfig.UART[1].baud_rate));
        params.set('n_UART[1].data_bit', String(currentConfig.UART[1].data_bit));
        params.set('n_UART[1].parity', String(currentConfig.UART[1].parity));
        params.set('n_UART[1].stop_bit', String(currentConfig.UART[1].stop_bit));
        params.set('n_UART[1].work_mode', String(currentConfig.UART[1].work_mode));
      } else {
        // Default Uart2 settings
        params.set('n_UART[1].baud_rate', '9600');
        params.set('n_UART[1].data_bit', '8');
        params.set('n_UART[1].parity', '0');
        params.set('n_UART[1].stop_bit', '1');
        params.set('n_UART[1].work_mode', '2');
      }

      const response = await this.get(`update_nv.cgi?${params.toString()}`);
      console.log('Uart1 configuration response:', response);
      return true;
    } catch (error) {
      console.error('Failed to configure Uart1:', error);
      return false;
    }
  }

  // Wait for gateway to be responsive after reboot
  async waitForGateway(maxWaitMs: number = 15000, pollIntervalMs: number = 1000): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      try {
        await this.getStatus();
        return true;
      } catch {
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }
    }
    return false;
  }

  // Get TF Card (SD Card) status
  // Uses action_tf.cgi?act=getinfo endpoint
  // Response: { totle: number, free: number, status: number, err: number }
  // status: 0 = identified (card present and readable)
  // status: 1 = unidentified (no card or unreadable)
  async getTFCardStatus(): Promise<'identified' | 'unidentified' | 'unknown'> {
    try {
      const response = await this.get<{ totle: number; free: number; status: number; err: number }>('action_tf.cgi?act=getinfo');
      console.log('TF Card status response:', response);

      if (response.err !== 0) {
        console.log('TF Card endpoint returned error:', response.err);
        return 'unknown';
      }

      // status 0 means identified (card present)
      // status 1 or other means unidentified (no card)
      if (response.status === 0) {
        console.log(`TF Card identified: ${response.free}/${response.totle} free`);
        return 'identified';
      } else {
        console.log('TF Card not identified (status:', response.status, ')');
        return 'unidentified';
      }
    } catch (error) {
      console.error('Failed to get TF Card status:', error);
      return 'unknown';
    }
  }

  // Format TF Card (SD Card)
  // Only call this if getTFCardStatus() returns 'identified'
  // Uses action_tf.cgi?act=format endpoint
  async formatTFCard(): Promise<boolean> {
    try {
      // Format the TF Card - this may take some time
      const response = await this.get<{ err: number }>('action_tf.cgi?act=format');
      console.log('TF Card format response:', response);
      return response.err === 0;
    } catch (error) {
      console.error('Failed to format TF Card:', error);
      return false;
    }
  }

  // Save report groups using native UI format for full compatibility
  // Native UI format discovered by analyzing gateway JavaScript:
  // - Templates are uploaded as: "Report0:{json}\nReport1:{json}\n" to /upload/template with filename "report"
  // - edge_report uses tmpl_file: "/template/Report0.json" references
  // - Both use FormData field name "c" (not "file")
  async saveAllReportGroups(groups: Array<{
    name: string;
    topic: string;
    period: number;
    tmplCont: Record<string, unknown>;  // { "MeterName": { "field": "field_slaveAddr", ... }, "time": "sys_local_time" }
  }>): Promise<boolean> {
    try {
      console.log('Uploading report groups with', groups.length, 'meters using native UI format');

      // Step 1: Build the template content string in native UI format
      // Native UI format: "Report0:{json}\nReport1:{json}\n"
      // Each line is "ReportN:" followed by JSON, ending with newline
      const templateLines: string[] = [];
      groups.forEach((group, index) => {
        const templateJson = JSON.stringify(group.tmplCont);
        templateLines.push(`Report${index}:${templateJson}`);
      });
      const templateContent = templateLines.join('\n') + '\n';

      console.log('Template content:', templateContent.substring(0, 500) + '...');

      // Step 2: Upload all templates in one request to /upload/template
      // Native UI uses filename "report" for all templates
      if (templateLines.length > 0) {
        const templateSuccess = await this.uploadTemplateNativeFormat(templateContent);
        if (!templateSuccess) {
          console.error('Failed to upload templates');
          return false;
        }
      }

      // Step 3: Build edge_report with tmpl_file references
      // IMPORTANT: Do NOT include 'enable' field - native UI doesn't use it and including it
      // causes the firmware to reject the config on restart
      const edgeReport = {
        group: groups.map((group, index) => ({
          name: group.name,
          link: 'MQTT1',
          topic: group.topic.startsWith('/') ? group.topic.substring(1) : group.topic,
          qos: 1,
          retention: 0,
          cond: {
            period: group.period,
            timed: {
              type: 0,
              hh: 0,
              mm: 0,
            },
          },
          data_report_type: 0,
          change_report_type: 0,
          err_enable: 0,
          err_info: 'error',
          tmpl_file: `/template/Report${index}.json`,  // File reference for native UI compatibility
          fkey_md5: '00000000000000000000000000000000',
          ucld_node: [],
        })),
      };

      // Step 4: Upload edge_report to /upload/nv1 (primary)
      const nv1Success = await this.uploadEdgeReportNativeFormat(edgeReport, 'upload/nv1');
      if (!nv1Success) {
        console.error('Failed to upload edge_report to nv1');
        return false;
      }

      // Step 5: Upload edge_report to /upload/nv2 (backup)
      const nv2Success = await this.uploadEdgeReportNativeFormat(edgeReport, 'upload/nv2');
      if (!nv2Success) {
        console.warn('Failed to upload edge_report to nv2 (backup), continuing...');
        // Don't fail if backup fails
      }

      console.log('All report groups saved successfully using native UI format');
      return true;
    } catch (error) {
      console.error('Failed to save report groups:', error);
      return false;
    }
  }

  // Upload templates in native UI format
  // Upload CSV to /upload/edge endpoint
  // This uploads the CSV configuration file
  async uploadEdgeCsv(csvContent: string): Promise<boolean> {
    try {
      console.log('Uploading CSV to /upload/edge...');
      const response = await api.post('/upload-file', {
        host: this.host,
        path: 'upload/edge',
        filename: 'conf',
        content: csvContent,
      });

      if (response.data && response.data.err === 0) {
        console.log('CSV uploaded successfully');
        return true;
      } else {
        console.error('CSV upload failed:', response.data);
        return false;
      }
    } catch (error) {
      console.error('Failed to upload CSV:', error);
      return false;
    }
  }

  // Native UI uploads all templates as one file with format: "Report0:{json}\nReport1:{json}\n"
  // - Endpoint: /upload/template
  // - FormData field name: "c"
  // - Filename: "report"
  async uploadTemplateNativeFormat(content: string): Promise<boolean> {
    try {
      console.log('Uploading templates in native UI format');

      const response = await api.post('/upload-file', {
        host: this.host,
        path: 'upload/template',
        filename: 'report',  // Native UI uses "report" as filename
        content: content,     // No padding for templates
      });

      if (response.data && response.data.err === 0) {
        console.log('Templates uploaded successfully');
        return true;
      } else {
        console.error('Template upload failed:', response.data);
        return false;
      }
    } catch (error) {
      console.error('Failed to upload templates:', error);
      return false;
    }
  }

  // Upload edge_report in native UI format
  // - FormData field name: "c"
  // - Filename: "edge_report"
  // - Content: JSON with 4-byte padding
  async uploadEdgeReportNativeFormat(edgeReport: {
    group: Array<{
      name: string;
      link: string;
      topic: string;
      qos: number;
      retention: number;
      cond: {
        period: number;
        timed: {
          type: number;
          hh: number;
          mm: number;
        };
      };
      data_report_type: number;
      change_report_type: number;
      err_enable: number;
      err_info: string;
      tmpl_file: string;  // File reference like "/template/Report0.json"
      fkey_md5: string;
      ucld_node: string[];
    }>;
  }, uploadPath: string = 'upload/nv1'): Promise<boolean> {
    try {
      const jsonContent = JSON.stringify(edgeReport);
      // CRITICAL: N720 firmware requires a 4-byte CRC32 header prefix for edge_report uploads
      // The native UI computes CRC32 of the JSON content and prepends it as a little-endian 4-byte header.
      // The firmware validates this CRC32 on restart - if it doesn't match, the config is rejected.
      // When reading via download_nv.cgi, the firmware strips these 4 bytes.
      const crcHeader = computeCrc32Header(jsonContent);
      const paddedContent = crcHeader + jsonContent;

      console.log(`Uploading edge_report to ${uploadPath}:`, jsonContent.substring(0, 300) + '...');

      const response = await api.post('/upload-file', {
        host: this.host,
        path: uploadPath,
        filename: 'edge_report',
        content: paddedContent,
      });

      console.log('Upload response:', response.data);

      if (response.data && response.data.err === 0) {
        console.log(`edge_report uploaded to ${uploadPath} successfully`);
        return true;
      } else {
        console.error(`edge_report upload to ${uploadPath} failed:`, response.data);
        return false;
      }
    } catch (error) {
      console.error(`Failed to upload edge_report to ${uploadPath}:`, error);
      return false;
    }
  }

  // Legacy method kept for backward compatibility - use saveAllReportGroups instead
  // This method uses the old inline template format which doesn't show in native UI
  async uploadEdgeReport(edgeReport: {
    group: Array<{
      name: string;
      link: string;
      topic: string;
      qos: number;
      retention: number;
      cond: {
        period: number;
        timed: {
          type: number;
          hh: number;
          mm: number;
        };
      };
      data_report_type: number;
      change_report_type: number;
      err_enable: number;
      err_info: string;
      tmpl_cont?: Record<string, unknown>;
      tmpl_file?: string;
      fkey_md5: string;
      ucld_node: string[];
    }>;
  }, uploadPath: string = 'upload/nv1'): Promise<boolean> {
    try {
      const jsonContent = JSON.stringify(edgeReport);
      // CRITICAL: N720 firmware requires a 4-byte CRC32 header prefix for edge_report uploads
      // The firmware validates this CRC32 on restart - if it doesn't match, the config is rejected.
      const crcHeader = computeCrc32Header(jsonContent);
      const paddedContent = crcHeader + jsonContent;

      console.log(`Uploading edge_report to ${uploadPath}:`, jsonContent.substring(0, 200) + '...');

      const response = await api.post('/upload-file', {
        host: this.host,
        path: uploadPath,
        filename: 'edge_report',
        content: paddedContent,
      });

      console.log('Upload response:', response.data);

      if (response.data && response.data.err === 0) {
        console.log(`edge_report uploaded to ${uploadPath} successfully`);
        return true;
      } else {
        console.error(`edge_report upload to ${uploadPath} failed:`, response.data);
        return false;
      }
    } catch (error) {
      console.error(`Failed to upload edge_report to ${uploadPath}:`, error);
      return false;
    }
  }

  // Configure NTP time settings
  // Sets timezone to UTC+1 and NTP servers to ntp1.inrim.it
  async configureNTP(): Promise<boolean> {
    try {
      const params = new URLSearchParams();
      params.set('file', 'misc');

      // Time zone: UTC+1 (the value is the UTC offset number)
      // UTC+1 = 1, UTC+2 = 2, UTC-5 = -5, etc.
      params.set('n_ntp_utc', '1');  // UTC+1

      // Enable NTP sync
      params.set('n_ntp_sync_en', '1');

      // NTP Server 1
      params.set('s_ntp_url[0]', 'ntp1.inrim.it');

      // NTP Server 2
      params.set('s_ntp_url[1]', 'ntp1.inrim.it');

      await this.get(`update_nv.cgi?${params.toString()}`);
      console.log('NTP configuration saved');
      return true;
    } catch (error) {
      console.error('Failed to configure NTP:', error);
      return false;
    }
  }
}

/**
 * Detect gateway type (N510 or N720) by trying different endpoints
 */
export async function detectGatewayType(host: string): Promise<'N510' | 'N720' | 'unknown'> {
  console.log('detectGatewayType: Checking host', host);

  // Try N720 first (download_flex.cgi?name=status)
  try {
    const n720Service = new N720GatewayService(host);
    const status = await n720Service.getStatus();
    console.log('detectGatewayType: N720 status response:', status);
    if (status.soft_ver) {
      console.log('detectGatewayType: Detected as N720 (soft_ver:', status.soft_ver, ')');
      return 'N720';
    }
  } catch (err) {
    console.log('detectGatewayType: N720 check failed:', err);
    // Not N720, try N510
  }

  // Try N510 (define.json)
  try {
    const queryParams = new URLSearchParams({
      host,
      path: 'define.json',
    });
    const response = await api.get(`/proxy?${queryParams.toString()}`);
    console.log('detectGatewayType: N510 define.json response:', response.data);
    if (response.data?.modename) {
      console.log('detectGatewayType: Detected as N510 (modename:', response.data.modename, ')');
      return 'N510';
    }
  } catch (err) {
    console.log('detectGatewayType: N510 check failed:', err);
    // Not N510 either
  }

  console.log('detectGatewayType: Could not detect gateway type, returning unknown');
  return 'unknown';
}

export function createN720GatewayService(host: string): N720GatewayService {
  return new N720GatewayService(host);
}

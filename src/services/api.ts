import axios from 'axios';
import type { DiscoveredGateway } from '../types/gateway';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

// Upload JSON config to nv1 and nv2 flash storage
// This is used for "link" and "edge_report" configs in native UI Save Current flow
export interface UploadNvJsonResponse {
  success: boolean;
  message?: string;
  error?: string;
  results?: Array<{ endpoint: string; success: boolean; status?: number; data?: unknown; error?: string }>;
}

export const uploadNvJson = async (host: string, filename: string, jsonContent: string): Promise<UploadNvJsonResponse> => {
  try {
    const response = await api.post<UploadNvJsonResponse>('/upload-nv-config', {
      host,
      configName: filename,
      configContent: jsonContent,
    });
    return response.data;
  } catch (error) {
    console.error('Upload NV JSON error:', error);
    return { success: false, error: String(error) };
  }
};

export interface DiscoverResponse {
  gateways: DiscoveredGateway[];
}

export const discoverGateways = async (): Promise<DiscoveredGateway[]> => {
  const response = await api.get<DiscoverResponse>('/discover');
  return response.data.gateways;
};

export const healthCheck = async (): Promise<boolean> => {
  try {
    await api.get('/health');
    return true;
  } catch {
    return false;
  }
};

// UDP-based configuration (works across subnets like MXX.exe)
export interface UdpConfigRequest {
  mac: string;
  enableDhcp?: boolean;
  staticIp?: string;      // Set static IP (e.g., "192.168.1.100")
  gateway?: string;       // Set gateway (e.g., "192.168.1.1")
  subnetMask?: string;    // Set subnet mask (e.g., "255.255.255.0")
  username?: string;
  password?: string;
}

export interface UdpConfigResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export const sendUdpConfig = async (config: UdpConfigRequest): Promise<UdpConfigResponse> => {
  try {
    const response = await api.post<UdpConfigResponse>('/udp-config', config);
    return response.data;
  } catch (error) {
    console.error('UDP config error:', error);
    return { success: false, error: String(error) };
  }
};

// Get network info for initial setup
export interface NetworkInfo {
  localIp: string;
  netmask: string;
  suggestedStaticIp: string;
  suggestedGateway: string;
}

export const getNetworkInfo = async (): Promise<NetworkInfo | null> => {
  try {
    const response = await api.get<NetworkInfo>('/network-info');
    return response.data;
  } catch (error) {
    console.error('Failed to get network info:', error);
    return null;
  }
};

// Upload CSV edge config to N720 gateway
export interface UploadCsvResponse {
  success: boolean;
  message?: string;
  error?: string;
  errInfo?: string;      // N720 gateway error info
  errMessage?: string;   // N720 gateway error message
  response?: unknown;
}

export const uploadEdgeCsv = async (host: string, csvContent: string, filename?: string): Promise<UploadCsvResponse> => {
  try {
    const response = await api.post<UploadCsvResponse>('/upload-edge-csv', {
      host,
      csvContent,
      filename,
    });
    return response.data;
  } catch (error) {
    console.error('Upload CSV error:', error);
    return { success: false, error: String(error) };
  }
};

// Download CSV edge config from N720 gateway
export interface DownloadCsvResponse {
  success: boolean;
  csvContent?: string;
  error?: string;
}

export const downloadEdgeCsv = async (host: string): Promise<DownloadCsvResponse> => {
  try {
    const response = await api.get<DownloadCsvResponse>('/download-edge-csv', {
      params: { host },
    });
    return response.data;
  } catch (error) {
    console.error('Download CSV error:', error);
    return { success: false, error: String(error) };
  }
};

// Upload N720 configuration to flash storage (nv1 and nv2)
// This is required for configs to persist after reboot
export interface UploadNvConfigResponse {
  success: boolean;
  message?: string;
  error?: string;
  results?: Array<{ endpoint: string; success: boolean; status?: number; data?: unknown; error?: string }>;
}

export const uploadNvConfig = async (host: string, configName: string, configContent: string): Promise<UploadNvConfigResponse> => {
  try {
    const response = await api.post<UploadNvConfigResponse>('/upload-nv-config', {
      host,
      configName,
      configContent,
    });
    return response.data;
  } catch (error) {
    console.error('Upload NV config error:', error);
    return { success: false, error: String(error) };
  }
};

// Upload to /upload/template endpoint (part of native UI Save Current flow)
export const uploadTemplate = async (host: string, content: string = ''): Promise<{ success: boolean; error?: string }> => {
  try {
    const response = await api.post('/upload-template', { host, content });
    return response.data;
  } catch (error) {
    console.error('Upload template error:', error);
    return { success: false, error: String(error) };
  }
};

// Upload to /upload/conver_csv endpoint (finalizes native UI Save Current flow)
export const uploadConverCsv = async (host: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const response = await api.post('/upload-conver-csv', { host });
    return response.data;
  } catch (error) {
    console.error('Upload conver_csv error:', error);
    return { success: false, error: String(error) };
  }
};

// Upload CSV to N720 gateway only (no save/restart)
// User will click "Save Current + Restart" in native UI to complete
export interface UploadEdgeCsvResponse {
  success: boolean;
  error?: string;
}

export const uploadEdgeCsvOnly = async (host: string, csvContent: string): Promise<UploadEdgeCsvResponse> => {
  try {
    const response = await api.post<UploadEdgeCsvResponse>('/upload-edge-csv', {
      host,
      csvContent,
    }, {
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    console.error('Upload edge CSV error:', error);
    return { success: false, error: String(error) };
  }
};

// Complete N720 Save Current sequence - replicates EXACT native UI behavior
// This performs the full save sequence with exact binary data captured from native UI
export interface N720SaveCurrentResponse {
  success: boolean;
  message?: string;
  error?: string;
  results?: Array<{ step: number; endpoint: string; status: number; data?: unknown }>;
  restarted?: boolean;
}

export interface N720MeterForSave {
  name: string;
  slaveAddress: number;
  meterType: string;
  meterIndex: number;  // 1-based index for data point suffix (e.g., v_l1_1, v_l1_2)
}

export const n720SaveCurrent = async (
  host: string,
  csvContent?: string,
  restart?: boolean,
  reportTopic?: string,
  reportingInterval?: number,
  meters?: N720MeterForSave[]
): Promise<N720SaveCurrentResponse> => {
  try {
    const response = await api.post<N720SaveCurrentResponse>('/n720-save-current', {
      host,
      csvContent,
      restart,
      reportTopic,
      reportingInterval,
      meters,
    }, {
      timeout: 60000, // 60 second timeout for full sequence
    });
    return response.data;
  } catch (error) {
    console.error('N720 Save Current error:', error);
    return { success: false, error: String(error) };
  }
};

// Import edge_report JSON to N720 gateway using native import API
// This uses the same endpoint as the browser's Import button in Data Report page
export interface ImportEdgeReportResponse {
  success: boolean;
  message?: string;
  error?: string;
  response?: unknown;
}

export const importEdgeReport = async (host: string, reportJson: string): Promise<ImportEdgeReportResponse> => {
  try {
    const response = await api.post<ImportEdgeReportResponse>('/import-edge-report', {
      host,
      reportJson,
    }, {
      timeout: 30000, // 30 second timeout for import
    });
    return response.data;
  } catch (error) {
    console.error('Import edge_report error:', error);
    return { success: false, error: String(error) };
  }
};

// Probe a specific IP directly via HTTP to check if a gateway is present
// This is useful when UDP discovery fails but the gateway is reachable via HTTP
export interface ProbeGatewayResponse {
  found: boolean;
  gateway?: DiscoveredGateway;
  error?: string;
}

export const probeGatewayIp = async (ip: string): Promise<ProbeGatewayResponse> => {
  try {
    const response = await api.get<ProbeGatewayResponse>('/probe-gateway', {
      params: { ip },
      timeout: 5000, // 5 second timeout for probe
    });
    return response.data;
  } catch (error) {
    console.error('Probe gateway error:', error);
    return { found: false, error: String(error) };
  }
};

// Download N720 template files to get original meter names
// Templates are stored at /template/Report0.json, /template/Report1.json, etc.
export interface N720TemplateInfo {
  index: number;
  name: string;  // Original meter name from template
  template: Record<string, unknown>;
}

export interface DownloadN720TemplatesResponse {
  success: boolean;
  templates: N720TemplateInfo[];
  error?: string;
}

export const downloadN720Templates = async (host: string, count?: number): Promise<DownloadN720TemplatesResponse> => {
  try {
    const response = await api.get<DownloadN720TemplatesResponse>('/download-n720-templates', {
      params: { host, count: count || 10 },
      timeout: 30000, // 30 second timeout for multiple downloads
    });
    return response.data;
  } catch (error) {
    console.error('Download N720 templates error:', error);
    return { success: false, templates: [], error: String(error) };
  }
};

export default api;

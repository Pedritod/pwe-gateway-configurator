import axios from 'axios';
import type { DiscoveredGateway } from '../types/gateway';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

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

export default api;

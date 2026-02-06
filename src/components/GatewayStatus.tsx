import { useEffect, useState } from 'react';
import { Activity, Server, Network, Clock, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { createGatewayService } from '../services/gatewayService';
import { N720GatewayService, detectGatewayType } from '../services/n720GatewayService';
import type { GatewayStatus as GatewayStatusType } from '../types/gateway';

interface GatewayStatusProps {
  ip: string;
  onStatusChange?: (status: GatewayStatusType) => void;
}

// N720 status info
interface N720StatusInfo {
  model: string;
  firmware: string;
  mac: string;
  systemTime: string;
  runtime: string;
  mqttStatus: string;
  networkType: string;
  localIp: string;
}

export function GatewayStatus({ ip, onStatusChange }: GatewayStatusProps) {
  const [status, setStatus] = useState<GatewayStatusType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gatewayType, setGatewayType] = useState<'N510' | 'N720' | 'unknown'>('unknown');
  const [n720Status, setN720Status] = useState<N720StatusInfo | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      // Detect gateway type first
      const detectedType = await detectGatewayType(ip);
      setGatewayType(detectedType);

      if (detectedType === 'N720') {
        // Fetch N720 status
        const n720Service = new N720GatewayService(ip);
        const [statusData, networkData] = await Promise.all([
          n720Service.getStatus(),
          n720Service.getNetwork(),
        ]);

        const n720Info: N720StatusInfo = {
          model: 'N720',
          firmware: statusData.soft_ver || '-',
          mac: statusData.mac?.match(/.{2}/g)?.join(':') || statusData.mac || '-',
          systemTime: statusData.systime ? new Date(statusData.systime * 1000).toLocaleString() : '-',
          runtime: statusData.runtime ? `${Math.floor(statusData.runtime / 3600)}h ${Math.floor((statusData.runtime % 3600) / 60)}m` : '-',
          mqttStatus: statusData.mqtt1_sta === 1 ? 'CONNECTED' : 'Disconnected',
          networkType: networkData?.eth?.ip_mode === 1 ? 'DHCP' : 'Static',
          localIp: networkData?.eth?.ip || ip,
        };
        setN720Status(n720Info);

        // Create a compatible status object for onStatusChange
        const compatStatus: GatewayStatusType = {
          connected: true,
          ip,
        };
        setStatus(compatStatus);
        onStatusChange?.(compatStatus);
      } else {
        // Fetch N510 status (existing code)
        const service = createGatewayService(ip);
        const newStatus = await service.getFullStatus();
        setStatus(newStatus);
        onStatusChange?.(newStatus);
      }
    } catch (err) {
      setError('Failed to connect to gateway');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [ip]);

  if (loading && !status) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2 text-gray-500">
            <RefreshCw className="h-5 w-5 animate-spin" />
            Connecting to gateway...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && !status) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="text-center text-red-600">{error}</div>
          <div className="mt-4 text-center">
            <Button onClick={fetchStatus} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status) return null;

  const { define, temp, mqtt, econfig } = status;

  // Determine model name based on gateway type
  const modelName = gatewayType === 'N720'
    ? n720Status?.model || 'N720'
    : define?.modename || 'Unknown Gateway';

  // For N720, show simplified status
  if (gatewayType === 'N720' && n720Status) {
    return (
      <div className="space-y-4">
        {/* Connection Status Bar */}
        <div className="flex items-center justify-between rounded-lg bg-white p-4 shadow-sm border">
          <div className="flex items-center gap-3">
            <Wifi className="h-5 w-5 text-green-600" />
            <div>
              <div className="font-medium">{n720Status.model}</div>
              <div className="text-sm text-gray-500">{ip}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success">Connected</Badge>
            <Badge variant="default" className="bg-purple-100 text-purple-700">N720</Badge>
            <Button onClick={fetchStatus} variant="ghost" size="sm">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Device Info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Server className="h-4 w-4" />
                Device Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Model</span>
                <span className="font-medium">{n720Status.model}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Firmware</span>
                <span className="font-mono text-xs">{n720Status.firmware}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">MAC</span>
                <span className="font-mono text-xs">{n720Status.mac}</span>
              </div>
            </CardContent>
          </Card>

          {/* Network Info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Network className="h-4 w-4" />
                Network
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Type</span>
                <Badge variant={n720Status.networkType === 'DHCP' ? 'success' : 'default'}>
                  {n720Status.networkType}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">IP Address</span>
                <span className="font-mono text-xs">{n720Status.localIp}</span>
              </div>
            </CardContent>
          </Card>

          {/* MQTT Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4" />
                MQTT Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">MQTT1</span>
                <Badge variant={n720Status.mqttStatus === 'CONNECTED' ? 'success' : 'warning'}>
                  {n720Status.mqttStatus}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Runtime</span>
                <span>{n720Status.runtime}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // N510 status display (existing code)
  return (
    <div className="space-y-4">
      {/* Connection Status Bar */}
      <div className="flex items-center justify-between rounded-lg bg-white p-4 shadow-sm border">
        <div className="flex items-center gap-3">
          {status.connected ? (
            <Wifi className="h-5 w-5 text-green-600" />
          ) : (
            <WifiOff className="h-5 w-5 text-red-600" />
          )}
          <div>
            <div className="font-medium">{modelName}</div>
            <div className="text-sm text-gray-500">{ip}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={status.connected ? 'success' : 'error'}>
            {status.connected ? 'Connected' : 'Disconnected'}
          </Badge>
          <Button onClick={fetchStatus} variant="ghost" size="sm">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Device Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4" />
              Device Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Model</span>
              <span className="font-medium">{define?.modename || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Firmware</span>
              <span className="font-medium">{define?.ver || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Type</span>
              <span className="font-medium">{define?.devicetype || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">MAC</span>
              <span className="font-mono text-xs">{temp?.usermac || '-'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Network Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Network className="h-4 w-4" />
              Network
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">IP Address</span>
              <span className="font-mono">{temp?.curripcn || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Gateway</span>
              <span className="font-mono">{temp?.currgip || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">DNS</span>
              <span className="font-mono">{temp?.dnsmain || '-'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Runtime Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" />
              Runtime
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Uptime</span>
              <span className="font-medium">{temp?.runtime || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Socket A</span>
              <Badge variant={temp?.constatea === 'LISTEN' ? 'success' : 'default'} className="text-xs">
                {temp?.constatea || '-'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Socket B</span>
              <Badge variant={temp?.constateb === 'LISTEN' ? 'success' : 'default'} className="text-xs">
                {temp?.constateb || '-'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* MQTT Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              MQTT Gateway
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Enabled</span>
              <Badge variant={mqtt?.mqtten === '1' ? 'success' : 'default'}>
                {mqtt?.mqtten === '1' ? 'Yes' : 'No'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <Badge variant={temp?.mqttconns?.includes('CONNECTED') ? 'success' : 'warning'}>
                {temp?.mqttconns?.trim() || 'Unknown'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Broker</span>
              <span className="font-mono text-xs truncate max-w-32">{mqtt?.addr || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Client ID</span>
              <span className="truncate max-w-32 text-xs">{mqtt?.cid || '-'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Edge Computing Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Edge Computing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Enabled</span>
              <Badge variant={econfig?.edgeen === '1' ? 'success' : 'default'}>
                {econfig?.edgeen === '1' ? 'Yes' : 'No'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <Badge variant={temp?.edgeconns?.includes('CONNECTED') ? 'success' : 'warning'}>
                {temp?.edgeconns?.trim() || 'Unknown'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Data Query</span>
              <Badge variant={econfig?.inqu_en === '1' ? 'success' : 'default'}>
                {econfig?.inqu_en === '1' ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { FileJson, Download, RefreshCw, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { createGatewayService } from '../services/gatewayService';
import type { GatewayStatus } from '../types/gateway';

interface ConfigSnapshotProps {
  ip: string;
}

interface ConfigSection {
  name: string;
  key: keyof GatewayStatus;
  description: string;
}

const CONFIG_SECTIONS: ConfigSection[] = [
  { name: 'Device Info', key: 'define', description: 'Device identity and firmware' },
  { name: 'Runtime Status', key: 'temp', description: 'Current runtime information' },
  { name: 'System Settings', key: 'misc', description: 'System configuration' },
  { name: 'IP Configuration', key: 'ipConfig', description: 'Network settings' },
  { name: 'MQTT Configuration', key: 'mqtt', description: 'MQTT broker settings' },
  { name: 'Edge Computing', key: 'econfig', description: 'Edge computing settings' },
  { name: 'Edge Data Model', key: 'edge', description: 'Full edge configuration with JSON template' },
  { name: 'Port Configuration', key: 'port0', description: 'Serial port settings' },
];

export function ConfigSnapshot({ ip }: ConfigSnapshotProps) {
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const service = createGatewayService(ip);
      const fullStatus = await service.getFullStatus();
      setStatus(fullStatus);
    } catch (err) {
      setError('Failed to load configuration');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, [ip]);

  const toggleSection = (key: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedSections(newExpanded);
  };

  const copySection = async (key: string, data: unknown) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopiedSection(key);
      setTimeout(() => setCopiedSection(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const exportAll = () => {
    if (!status) return;

    const exportData = {
      exportedAt: new Date().toISOString(),
      gatewayIp: ip,
      configuration: status,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gateway-config-${ip.replace(/\./g, '-')}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2 text-gray-500">
            <RefreshCw className="h-5 w-5 animate-spin" />
            Loading configuration...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="text-center text-red-600">{error}</div>
          <div className="mt-4 text-center">
            <Button onClick={fetchConfig} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5" />
              Configuration Snapshot
            </CardTitle>
            <CardDescription>
              View and export the complete gateway configuration
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={fetchConfig} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={exportAll}>
              <Download className="mr-2 h-4 w-4" />
              Export All
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {CONFIG_SECTIONS.map((section) => {
            const data = status?.[section.key];
            const isExpanded = expandedSections.has(section.key);
            const hasData = data !== undefined && data !== null;

            return (
              <div key={section.key} className="rounded-lg border">
                <button
                  className="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50"
                  onClick={() => toggleSection(section.key)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-gray-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-500" />
                    )}
                    <div>
                      <div className="font-medium">{section.name}</div>
                      <div className="text-sm text-gray-500">{section.description}</div>
                    </div>
                  </div>
                  {hasData && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        copySection(section.key, data);
                      }}
                    >
                      {copiedSection === section.key ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </button>
                {isExpanded && (
                  <div className="border-t bg-gray-50 p-4">
                    {hasData ? (
                      <pre className="max-h-96 overflow-auto rounded bg-gray-900 p-4 text-xs text-gray-100">
                        {JSON.stringify(data, null, 2)}
                      </pre>
                    ) : (
                      <div className="text-center text-gray-500">
                        No data available
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

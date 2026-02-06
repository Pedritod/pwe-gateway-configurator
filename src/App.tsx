import { useState } from 'react';
import { Settings, Zap, FileJson, ArrowLeft, Wifi } from 'lucide-react';
import { GatewayScanner } from './components/GatewayScanner';
import { GatewayStatus } from './components/GatewayStatus';
import { EnergyMeterList } from './components/EnergyMeterList';
import { ConfigSnapshot } from './components/ConfigSnapshot';
import { MqttSetup } from './components/MqttSetup';
import { Button } from './components/ui/Button';
import type { GatewayStatus as GatewayStatusType, DiscoveredGateway } from './types/gateway';

type Tab = 'status' | 'mqtt' | 'meters' | 'config';

function App() {
  const [connectedGateway, setConnectedGateway] = useState<DiscoveredGateway | null>(null);
  const [_gatewayStatus, setGatewayStatus] = useState<GatewayStatusType | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('status');

  const handleSelectGateway = (gateway: DiscoveredGateway) => {
    setConnectedGateway(gateway);
    setActiveTab('status');
  };

  const handleDisconnect = () => {
    setConnectedGateway(null);
    setGatewayStatus(null);
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'status', label: 'Status', icon: <Settings className="h-4 w-4" /> },
    { id: 'mqtt', label: 'Gateway Setup', icon: <Wifi className="h-4 w-4" /> },
    { id: 'meters', label: 'Energy Meters', icon: <Zap className="h-4 w-4" /> },
    { id: 'config', label: 'Raw Config', icon: <FileJson className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="border-b bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img src="/pwe_logo.png" alt="PME - Power Under Control" className="h-10" />
              <div className="border-l border-gray-300 pl-4">
                <h1 className="text-xl font-bold text-gray-900">Gateway Configurator</h1>
                <p className="text-sm text-gray-500">USR IOT Gateway Management</p>
              </div>
            </div>
            {connectedGateway && (
              <Button variant="outline" onClick={handleDisconnect}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Disconnect
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {!connectedGateway ? (
          <GatewayScanner onSelectGateway={handleSelectGateway} />
        ) : (
          <div className="space-y-6">
            {/* Tabs */}
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      flex items-center gap-2 border-b-2 px-1 py-4 text-sm font-medium
                      ${
                        activeTab === tab.id
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                      }
                    `}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab Content */}
            {activeTab === 'status' && (
              <GatewayStatus
                ip={connectedGateway.ip}
                onStatusChange={setGatewayStatus}
              />
            )}

            {activeTab === 'mqtt' && (
              <MqttSetup ip={connectedGateway.ip} mac={connectedGateway.mac} gatewayType={connectedGateway.gatewayType} />
            )}

            {activeTab === 'meters' && (
              <EnergyMeterList ip={connectedGateway.ip} />
            )}

            {activeTab === 'config' && (
              <ConfigSnapshot ip={connectedGateway.ip} />
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t bg-white py-4">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-gray-500 sm:px-6 lg:px-8">
          Gateway Configurator v1.0 • PME - Power Under Control • For USR IOT Gateways (N510, N720)
        </div>
      </footer>
    </div>
  );
}

export default App;

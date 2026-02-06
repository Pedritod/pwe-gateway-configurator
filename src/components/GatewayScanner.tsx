import { useState } from 'react';
import { Search, Wifi, Plus, Loader2, Settings, AlertTriangle } from 'lucide-react';
import { Button } from './ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/Card';
import { Input } from './ui/Input';
import { Badge } from './ui/Badge';
import { discoverGateways, sendUdpConfig } from '../services/api';
import { GatewayService } from '../services/gatewayService';
import { N720GatewayService, detectGatewayType } from '../services/n720GatewayService';
import type { DiscoveredGateway } from '../types/gateway';

const FACTORY_DEFAULT_IP = '192.168.0.7';

interface GatewayScannerProps {
  onSelectGateway: (gateway: DiscoveredGateway) => void;
}

export function GatewayScanner({ onSelectGateway }: GatewayScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [gateways, setGateways] = useState<DiscoveredGateway[]>([]);
  const [manualIp, setManualIp] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Initial setup state
  const [setupGateway, setSetupGateway] = useState<DiscoveredGateway | null>(null);
  const [setupStep, setSetupStep] = useState<'idle' | 'running'>('idle');
  const [setupStatus, setSetupStatus] = useState<string>('');
  const [setupError, setSetupError] = useState<string | null>(null);

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    try {
      const discovered = await discoverGateways();
      setGateways(discovered);
      if (discovered.length === 0) {
        setError('No gateways found via UDP discovery. If running in Docker on Windows, UDP broadcast is not supported. Please enter the gateway IP manually below.');
      }
    } catch (err) {
      setError('Failed to scan for gateways. Is the backend server running?');
      console.error(err);
    } finally {
      setScanning(false);
    }
  };

  const [connecting, setConnecting] = useState(false);

  const handleManualConnect = async () => {
    if (manualIp.trim()) {
      setConnecting(true);
      setError(null);

      try {
        // Try to fetch device info to get model and firmware
        const service = new GatewayService(manualIp.trim());
        const define = await service.getDefine();

        onSelectGateway({
          ip: manualIp.trim(),
          mac: define?.usermac || 'Unknown',
          model: define?.modename || 'USR Gateway',
          firmware: define?.ver || '-',
        });
      } catch (err) {
        // If we can't fetch define.json, still connect with minimal info
        console.log('Could not fetch gateway info, connecting with defaults:', err);
        onSelectGateway({
          ip: manualIp.trim(),
          mac: 'Unknown',
          model: 'USR Gateway',
          firmware: '-',
        });
      } finally {
        setConnecting(false);
      }
    }
  };

  const isFactoryDefault = (gateway: DiscoveredGateway) => {
    return gateway.ip === FACTORY_DEFAULT_IP;
  };

  const isInvalidIp = (gateway: DiscoveredGateway) => {
    return gateway.ip === '0.0.0.0' || gateway.ip === '255.255.255.255';
  };

  // Filter out gateways with invalid IPs (still booting/getting DHCP)
  const validGateways = gateways.filter(g => !isInvalidIp(g));

  const handleCancelSetup = () => {
    setSetupGateway(null);
    setSetupStep('idle');
    setSetupError(null);
    setSetupStatus('');
  };

  const handleInitialSetup = async (gateway: DiscoveredGateway) => {
    setSetupGateway(gateway);
    setSetupStep('running');
    setSetupError(null);

    const staticIp = '192.168.1.200';
    const targetMac = gateway.mac;

    try {
      // Step 1: Set static IP via UDP (to move gateway to our subnet)
      setSetupStatus('Step 1/2: Setting static IP (192.168.1.200)...');
      const staticResult = await sendUdpConfig({
        mac: gateway.mac,
        enableDhcp: false,
        staticIp: staticIp,
        gateway: '192.168.1.1',
        subnetMask: '255.255.255.0',
        username: 'admin',
        password: 'admin',
      });

      if (!staticResult.success) {
        throw new Error(staticResult.error || staticResult.message || 'Failed to set static IP');
      }

      setSetupStatus('Static IP configured! Waiting for gateway to restart (12s)...');
      await new Promise(resolve => setTimeout(resolve, 12000));

      // Step 2: Find the gateway by MAC address via UDP discovery
      // Gateway responds to UDP scan after 10-25 seconds, so we scan repeatedly
      setSetupStatus('Step 2/2: Finding gateway on network...');
      let actualIp: string | null = null;

      // Normalize MAC for comparison (remove dashes/colons, uppercase)
      const normalizeMac = (mac: string) => mac.replace(/[-:]/g, '').toUpperCase();
      const normalizedTargetMac = normalizeMac(targetMac);

      // Gateway responds to UDP after 10-25 seconds
      // 12s initial wait + 6 attempts * 4s = up to 36s total, covering the 10-25s response window
      for (let attempt = 1; attempt <= 6; attempt++) {
        setSetupStatus(`Scanning for gateway by MAC address (attempt ${attempt}/6)...`);

        try {
          const discovered = await discoverGateways();
          console.log(`Scan attempt ${attempt}: found ${discovered.length} gateways`);
          discovered.forEach(g => console.log(`  - ${g.ip}: MAC=${g.mac}, type=${g.gatewayType || 'unknown'}`));

          // Find our gateway by MAC address
          const found = discovered.find(g => normalizeMac(g.mac) === normalizedTargetMac);
          if (found) {
            // Skip invalid IPs: 0.0.0.0 (gateway still booting), factory default
            if (found.ip !== '192.168.0.7' && found.ip !== '0.0.0.0') {
              actualIp = found.ip;
              console.log(`Found target gateway at ${actualIp} (matched by MAC: ${targetMac})`);
              break;
            } else if (found.ip === '0.0.0.0') {
              console.log('Gateway responded with 0.0.0.0 - still booting, waiting...');
            } else if (found.ip === '192.168.0.7') {
              console.log('Gateway still at factory IP - config not yet applied, waiting...');
            }
          } else {
            console.log(`Target MAC ${targetMac} not found in scan results`);
          }
        } catch (err) {
          console.error(`Scan attempt ${attempt} failed:`, err);
        }

        if (!actualIp && attempt < 6) {
          await new Promise(resolve => setTimeout(resolve, 4000));
        }
      }

      if (!actualIp) {
        throw new Error(`Could not find gateway (MAC: ${targetMac}) on network after setup. Try scanning manually or connect to ${staticIp} directly.`);
      }

      // Enable DHCP via HTTP if gateway is at static IP
      if (actualIp === staticIp) {
        setSetupStatus('Enabling DHCP via HTTP...');
        const gatewayService = new GatewayService(actualIp);
        try {
          await gatewayService.enableDhcp();
          setSetupStatus('DHCP enabled! Waiting for gateway to reboot (20s)...');
          await new Promise(resolve => setTimeout(resolve, 20000));

          // Re-scan to find gateway at its new DHCP IP using MAC address
          setSetupStatus('Finding gateway at new DHCP IP...');
          let newIp: string | null = null;
          for (let attempt = 1; attempt <= 5; attempt++) {
            setSetupStatus(`Scanning for gateway at new IP (attempt ${attempt}/5)...`);
            try {
              const discovered = await discoverGateways();
              console.log(`DHCP scan attempt ${attempt}: found ${discovered.length} gateways`);
              discovered.forEach(g => console.log(`  - ${g.ip}: MAC=${g.mac}`));

              const found = discovered.find(g => normalizeMac(g.mac) === normalizedTargetMac);
              // Skip invalid IPs: 0.0.0.0 (gateway still booting), factory default, or our static IP
              if (found && found.ip !== '0.0.0.0' && found.ip !== '192.168.0.7' && found.ip !== staticIp) {
                newIp = found.ip;
                console.log(`Found gateway at new DHCP IP: ${newIp}`);
                break;
              } else if (found && found.ip === '0.0.0.0') {
                console.log('Gateway responded with 0.0.0.0 - still getting DHCP, waiting...');
              }
            } catch (err) {
              console.error(`DHCP scan attempt ${attempt} failed:`, err);
            }
            if (!newIp && attempt < 5) {
              await new Promise(resolve => setTimeout(resolve, 4000));
            }
          }

          if (newIp) {
            actualIp = newIp;
            setSetupStatus(`Gateway found at new IP: ${actualIp}`);
          } else {
            console.log('Could not find gateway at new DHCP IP, using last known IP');
          }
        } catch {
          // DHCP enable failed, but gateway is reachable - continue
          console.log('DHCP enable via HTTP failed, but gateway is reachable');
        }
      } else {
        // Gateway already has DHCP IP - setup complete
        setSetupStatus(`Gateway found at ${actualIp} (DHCP already active)`);
      }

      // Wait for gateway to fully stabilize after reboot
      // The gateway needs time to start all its services (HTTP server, CGI handlers, etc.)
      setSetupStatus('Detecting gateway type...');

      // Detect gateway type (N510 or N720) with retry
      // Gateway may not respond immediately after reboot
      let gwType: 'N510' | 'N720' | 'unknown' = 'unknown';
      for (let attempt = 0; attempt < 5; attempt++) {
        gwType = await detectGatewayType(actualIp);
        console.log(`Detected gateway type (attempt ${attempt + 1}): ${gwType}`);
        if (gwType !== 'unknown') {
          break;
        }
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
        setSetupStatus(`Detecting gateway type... (attempt ${attempt + 2})`);
      }

      // Also check the discovered gateway's gatewayType if detection failed
      if (gwType === 'unknown' && setupGateway?.gatewayType) {
        gwType = setupGateway.gatewayType as 'N510' | 'N720';
        console.log(`Using gatewayType from discovery: ${gwType}`);
      }

      if (gwType === 'N720') {
        // N720 Gateway setup flow
        setSetupStatus('Waiting for N720 gateway to stabilize...');
        const n720Service = new N720GatewayService(actualIp);

        // Wait for N720 to be responsive
        let ready = false;
        for (let i = 0; i < 20; i++) {
          try {
            await n720Service.getStatus();
            ready = true;
            console.log(`N720 gateway ready after ${i + 1} attempts`);
            break;
          } catch {
            console.log(`Waiting for N720 gateway... attempt ${i + 1}/20`);
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }

        if (!ready) {
          console.log('N720 gateway not responding after 30s, continuing anyway...');
        }

        // Configure Uart1 for RS485 (same settings as N510)
        setSetupStatus('Configuring Uart1 for RS485...');
        try {
          const configured = await n720Service.configureUart1();
          if (configured) {
            console.log('N720 Uart1 configured for RS485');
          } else {
            console.log('Failed to configure Uart1, but continuing...');
          }
        } catch (err) {
          console.log('Could not configure Uart1:', err);
        }

      } else {
        // N510 Gateway setup flow (existing code) - also handles 'unknown' type
        const gatewayTypeLabel = gwType === 'N510' ? 'N510' : 'gateway';
        setSetupStatus(`Waiting for ${gatewayTypeLabel} to stabilize...`);
        const gatewayService = new GatewayService(actualIp);

        // Wait for port0.json to be accessible (proves CGI is ready, not just static file serving)
        let cgiReady = false;
        for (let i = 0; i < 20; i++) {
          try {
            await gatewayService.getPortConfig();
            cgiReady = true;
            console.log(`Gateway CGI ready after ${i + 1} attempts`);
            break;
          } catch {
            console.log(`Waiting for gateway CGI... attempt ${i + 1}/20`);
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }

        if (!cgiReady) {
          console.log('Gateway CGI not responding after 30s, continuing anyway...');
        }

        // Clean up default edge config (remove device01, device02, etc.)
        // Do this BEFORE port config to prove gateway is fully stable
        setSetupStatus('Cleaning up default configuration...');
        try {
          const edgeConfig = await gatewayService.getEdge();
          if (edgeConfig && edgeConfig.ctable) {
            const defaultDevicePattern = /^device\d+$/i;
            const hasDefaultDevices = edgeConfig.ctable.some(entry => defaultDevicePattern.test(entry.name));

            if (hasDefaultDevices) {
              console.log('Found default devices, cleaning up...');
              const defaultDeviceKeys = new Set<number>();

              // Remove default devices from ctable
              edgeConfig.ctable = edgeConfig.ctable.filter(entry => {
                if (defaultDevicePattern.test(entry.name)) {
                  console.log(`Removing default device: ${entry.name}`);
                  entry.datas?.forEach(d => defaultDeviceKeys.add(d.key));
                  return false;
                }
                return true;
              });

              // Remove their rtable.datas entries
              if (defaultDeviceKeys.size > 0 && edgeConfig.rtable?.datas) {
                edgeConfig.rtable.datas = edgeConfig.rtable.datas.filter(d => !defaultDeviceKeys.has(d.key));
              }

              // Remove legacy template entries (string values like "Current":"node0101")
              if (edgeConfig.rtable?.format?.[0]?.template) {
                const template = edgeConfig.rtable.format[0].template;
                for (const key of Object.keys(template)) {
                  if (typeof template[key] === 'string') {
                    console.log(`Removing legacy template entry: ${key}`);
                    delete template[key];
                  }
                }
              }

              // Update timestamp and save
              edgeConfig.stamp = Date.now();
              const saved = await gatewayService.saveEdgeConfig(edgeConfig);
              if (saved) {
                console.log('Default configuration cleaned up successfully');
              } else {
                console.log('Failed to save cleaned config, but continuing...');
              }
            }
          }
        } catch (err) {
          console.log('Could not clean up default config:', err);
          // Continue anyway - user can manually clean up later
        }
      }

      // Note: Port configuration for N510 is done in MQTT Setup where the gateway is fully stable
      // The gateway's CGI handlers are not reliable immediately after Initial Setup

      // Auto-connect to the gateway at its new IP
      // Build the gateway object with the correct IP and type
      // Use the original gateway model from discovery, or determine from gwType
      let modelName = gateway.model;
      if (!modelName || modelName === 'USR Gateway') {
        // Fallback to type-based model name
        modelName = gwType === 'N720' ? 'N720' : gwType === 'N510' ? 'USR-N510' : gateway.model || 'USR Gateway';
      }

      const configuredGateway: DiscoveredGateway = {
        ip: actualIp,
        mac: targetMac,
        model: modelName,
        firmware: gateway.firmware || '-',
        gatewayType: gwType,
      };

      console.log('Initial setup complete! Auto-connecting to gateway:', configuredGateway);
      handleCancelSetup();

      // Automatically connect to the configured gateway
      onSelectGateway(configuredGateway);

    } catch (err) {
      setSetupError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5" />
            Gateway Discovery
          </CardTitle>
          <CardDescription>
            Scan your network to find USR IOT gateways or enter an IP address manually
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={handleScan} disabled={scanning} className="flex-1">
              {scanning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Scan Network
                </>
              )}
            </Button>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-500">Or connect manually</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Enter gateway IP (e.g., 192.168.1.100)"
              value={manualIp}
              onChange={(e) => setManualIp(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !connecting && handleManualConnect()}
              disabled={connecting}
            />
            <Button onClick={handleManualConnect} variant="outline" disabled={connecting}>
              {connecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Connect
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {validGateways.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Discovered Gateways ({validGateways.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {validGateways.map((gateway) => (
                <div
                  key={gateway.mac}
                  className={`flex items-center justify-between rounded-lg border p-4 hover:bg-gray-50 ${
                    isFactoryDefault(gateway) ? 'border-orange-300 bg-orange-50' : ''
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{gateway.model}</span>
                      {isFactoryDefault(gateway) ? (
                        <Badge variant="warning" className="bg-orange-100 text-orange-700">
                          <AlertTriangle className="mr-1 h-3 w-3" />
                          Different Subnet
                        </Badge>
                      ) : (
                        <Badge variant="success">Online</Badge>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      <span className="font-mono">{gateway.ip}</span>
                      <span className="mx-2">•</span>
                      <span className="font-mono">{gateway.mac}</span>
                      <span className="mx-2">•</span>
                      <span>{gateway.firmware}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {isFactoryDefault(gateway) && (
                      <Button
                        variant="outline"
                        onClick={() => handleInitialSetup(gateway)}
                        disabled={setupStep === 'running'}
                        className="border-orange-300 text-orange-700 hover:bg-orange-100"
                      >
                        <Settings className="mr-2 h-4 w-4" />
                        Initial Setup
                      </Button>
                    )}
                    <Button onClick={() => onSelectGateway(gateway)}>
                      Connect
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Initial Setup Progress Dialog */}
      {setupGateway && setupStep === 'running' && (
        <Card className="border-orange-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-orange-600" />
              Initial Setup: {setupGateway.model}
            </CardTitle>
            <CardDescription>
              Setting static IP, then enabling DHCP via HTTP ({setupGateway.mac})
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {setupError ? (
              <div className="space-y-4">
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                  {setupError}
                </div>
                <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-700">
                  <strong>Tip:</strong> If the gateway is unreachable, try factory reset (hold reset button 5+ seconds),
                  then run Initial Setup again. You can also use MXX.exe to configure manually.
                </div>
                <Button variant="outline" onClick={handleCancelSetup}>
                  Close
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
                  <span className="font-medium">{setupStatus}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

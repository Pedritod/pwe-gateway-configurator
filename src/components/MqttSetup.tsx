import { useState, useEffect } from 'react';
import { Save, CheckCircle, AlertCircle, Loader2, Network, Settings, Wifi, HardDrive } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { GatewayService } from '../services/gatewayService';
import { N720GatewayService, detectGatewayType } from '../services/n720GatewayService';
import { sendUdpConfig } from '../services/api';

interface MqttSetupProps {
  ip: string;
  mac?: string; // MAC address for UDP-based configuration
  gatewayType?: 'N510' | 'N720' | 'unknown';
}

// Default MQTT configuration for ThingsBoard
const DEFAULT_SERVER = 'monitor.poweremp.it';
const DEFAULT_PORT = 1883;

export function MqttSetup({ ip, mac, gatewayType: initialGatewayType }: MqttSetupProps) {
  const [loading, setLoading] = useState(true);
  const [enablingDhcp, setEnablingDhcp] = useState(false);
  const [settingStaticIp, setSettingStaticIp] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [httpUnreachable, setHttpUnreachable] = useState(false); // True if gateway is on different subnet

  const [deviceName, setDeviceName] = useState('');
  const [token, setToken] = useState('');

  // Static IP configuration for gateways on different subnets
  const [newStaticIp, setNewStaticIp] = useState('');
  const [newGateway, setNewGateway] = useState('');
  const [newSubnetMask, setNewSubnetMask] = useState('255.255.255.0');

  const [currentDeviceName, setCurrentDeviceName] = useState<string | null>(null);
  const [isDhcpEnabled, setIsDhcpEnabled] = useState<boolean | null>(null);
  const [portConfigWarning, setPortConfigWarning] = useState<string | null>(null);

  // Gateway type detection
  const [detectedGatewayType, setDetectedGatewayType] = useState<'N510' | 'N720' | 'unknown'>(initialGatewayType || 'unknown');

  // SD Card (TF Card) state - only for N720
  const [formatSdCard, setFormatSdCard] = useState(false);
  const [sdCardStatus, setSdCardStatus] = useState<'identified' | 'unidentified' | 'unknown' | 'checking'>('checking');
  const [formattingSdCard, setFormattingSdCard] = useState(false);

  const gateway = new GatewayService(ip);
  const n720Gateway = new N720GatewayService(ip);

  useEffect(() => {
    loadCurrentConfig();
  }, [ip]);

  const loadCurrentConfig = async () => {
    setLoading(true);
    setError(null);
    setHttpUnreachable(false);

    try {
      // First, detect gateway type if not already known
      let gwType = detectedGatewayType;
      console.log('MqttSetup: Initial gateway type from props:', initialGatewayType, '-> detectedGatewayType:', gwType);
      if (gwType === 'unknown' || !gwType) {
        gwType = await detectGatewayType(ip);
        setDetectedGatewayType(gwType);
        console.log('MqttSetup: Detected gateway type via API:', gwType);
      } else {
        console.log('MqttSetup: Using existing gateway type:', gwType);
      }

      if (gwType === 'N720') {
        // Load N720 configuration
        let gatewayReachable = false;

        // Try to load MQTT config
        try {
          const mqttConfig = await n720Gateway.getMQTTConfig(1);
          gatewayReachable = true; // If we get here, gateway is reachable
          if (mqttConfig) {
            if (mqttConfig.client_id) {
              setCurrentDeviceName(mqttConfig.client_id);
              setDeviceName(mqttConfig.client_id);
            }
            if (mqttConfig.conn_user_name) {
              setToken(mqttConfig.conn_user_name);
            }
          }
        } catch (err) {
          console.error('Failed to load N720 MQTT config:', err);
        }

        // Try to check network config (DHCP status)
        try {
          const network = await n720Gateway.getNetwork();
          gatewayReachable = true; // If we get here, gateway is reachable
          console.log('N720 network config:', JSON.stringify(network, null, 2));
          if (network?.eth) {
            // ip_mode: 0 = static, 1 = DHCP
            const dhcpEnabled = network.eth.ip_mode === 1;
            setIsDhcpEnabled(dhcpEnabled);
            console.log('N720 ip_mode value:', network.eth.ip_mode, '-> DHCP:', dhcpEnabled ? 'enabled' : 'disabled');
          } else {
            console.log('N720 network.eth is missing or undefined');
          }
        } catch (err) {
          console.error('Failed to load N720 network config:', err);
          // Don't assume DHCP is disabled just because we couldn't read it
        }

        // Try to check SD Card status
        try {
          const tfStatus = await n720Gateway.getTFCardStatus();
          gatewayReachable = true; // If we get here, gateway is reachable
          setSdCardStatus(tfStatus);
        } catch (err) {
          console.error('Failed to check N720 TF Card status:', err);
          setSdCardStatus('unknown');
        }

        // Only mark as unreachable if ALL calls failed
        if (!gatewayReachable) {
          console.log('N720 gateway appears unreachable via HTTP');
          setHttpUnreachable(true);
          setIsDhcpEnabled(false);
        }
      } else {
        // Load N510 configuration (existing code)
        console.log('MqttSetup: Using N510 code path for gateway type:', gwType);
        try {
          const mqtt = await gateway.getMQTT();
          if (mqtt) {
            if (mqtt.cid) {
              setCurrentDeviceName(mqtt.cid);
              setDeviceName(mqtt.cid);
            }
            if (mqtt.usr) {
              setToken(mqtt.usr);
            }
          }

          // Load IP config to check DHCP status
          const ipConfig = await gateway.getIPConfig();
          console.log('N510 IP config:', ipConfig);
          if (ipConfig) {
            // staticip: "0" means DHCP, "1" means static
            setIsDhcpEnabled(ipConfig.staticip === '0');
            console.log('N510 staticip value:', ipConfig.staticip, '-> DHCP:', ipConfig.staticip === '0' ? 'enabled' : 'disabled');
          }
        } catch (err) {
          console.error('Failed to load N510 config via HTTP:', err);
          setHttpUnreachable(true);
          setIsDhcpEnabled(false);
        }
      }
    } catch (err) {
      console.error('Failed to load config:', err);
      setHttpUnreachable(true);
      setIsDhcpEnabled(false);
    } finally {
      setLoading(false);
    }
  };

  const handleEnableDhcp = async () => {
    setEnablingDhcp(true);
    setError(null);

    try {
      // First try HTTP-based method (only works on same subnet)
      if (!httpUnreachable) {
        const dhcpSaved = await gateway.enableDhcp();
        if (dhcpSaved) {
          // Success via HTTP
          alert(
            'DHCP enabled and gateway is rebooting!\n\n' +
            'The gateway will get a new IP address after reboot.\n' +
            'Please wait ~30 seconds, then:\n' +
            '1. Click "Disconnect" in the top right\n' +
            '2. Click "Scan Network" to find the gateway with its new IP\n' +
            '3. Connect to it again'
          );
          setEnablingDhcp(false);
          return;
        }
      }

      // HTTP failed or gateway unreachable - try UDP method (works across subnets)
      if (mac && mac !== 'Unknown') {
        console.log('Trying UDP-based DHCP enable for MAC:', mac);
        const udpResult = await sendUdpConfig({
          mac,
          enableDhcp: true,
        });

        if (udpResult.success) {
          alert(
            'DHCP enabled via UDP broadcast and gateway is rebooting!\n\n' +
            'The gateway will get a new IP address after reboot.\n' +
            'Please wait ~30 seconds, then:\n' +
            '1. Click "Disconnect" in the top right\n' +
            '2. Click "Scan Network" to find the gateway with its new IP\n' +
            '3. Connect to it again'
          );
          setEnablingDhcp(false);
          return;
        } else {
          setError('UDP configuration failed: ' + (udpResult.error || udpResult.message || 'Unknown error'));
        }
      } else {
        setError(
          'Gateway is not reachable via HTTP (different subnet) and MAC address is unknown.\n' +
          'Please scan the network to discover the gateway with its MAC address.'
        );
      }
    } catch (err) {
      setError('Failed to enable DHCP: ' + String(err));
    } finally {
      setEnablingDhcp(false);
    }
  };

  const handleSetStaticIp = async () => {
    if (!newStaticIp.trim()) {
      setError('Please enter a static IP address');
      return;
    }
    if (!newGateway.trim()) {
      setError('Please enter a gateway IP address');
      return;
    }
    if (!mac || mac === 'Unknown') {
      setError('MAC address is required. Please scan the network first.');
      return;
    }

    setSettingStaticIp(true);
    setError(null);

    try {
      console.log('Setting static IP via UDP:', newStaticIp);
      const udpResult = await sendUdpConfig({
        mac,
        enableDhcp: false,
        staticIp: newStaticIp.trim(),
        gateway: newGateway.trim(),
        subnetMask: newSubnetMask.trim(),
      });

      if (udpResult.success) {
        alert(
          `Static IP set to ${newStaticIp} via UDP broadcast!\n\n` +
          'The gateway is rebooting with the new IP.\n' +
          'Please wait ~30 seconds, then:\n' +
          '1. Click "Disconnect" in the top right\n' +
          '2. Click "Scan Network" to find the gateway at its new IP\n' +
          '3. Connect to it again'
        );
      } else {
        setError('UDP configuration failed: ' + (udpResult.error || udpResult.message || 'Unknown error'));
      }
    } catch (err) {
      setError('Failed to set static IP: ' + String(err));
    } finally {
      setSettingStaticIp(false);
    }
  };

  const handleConfigureGateway = async () => {
    if (!deviceName.trim()) {
      setError('Device name is required');
      return;
    }
    if (!token.trim()) {
      setError('ThingsBoard token is required');
      return;
    }

    setConfiguring(true);
    setError(null);
    setSuccess(false);

    try {
      if (detectedGatewayType === 'N720') {
        // N720 Gateway configuration flow
        console.log('Configuring N720 gateway...');

        // Step 0: Format SD Card if checkbox is selected and card is identified
        if (formatSdCard && sdCardStatus === 'identified') {
          console.log('Formatting SD Card...');
          setFormattingSdCard(true);
          try {
            const formatted = await n720Gateway.formatTFCard();
            if (formatted) {
              console.log('SD Card formatted successfully');
            } else {
              console.log('SD Card format may have failed, continuing...');
            }
          } catch (err) {
            console.log('SD Card format error (continuing):', err);
          } finally {
            setFormattingSdCard(false);
          }
        }

        // Step 1: Save MQTT1 configuration (with Offline Cache enabled)
        console.log('Saving MQTT1 configuration (with Offline Cache enabled)...');
        const mqttSaved = await n720Gateway.saveMQTTConfig(1, {
          deviceName: deviceName.trim(),
          token: token.trim(),
          serverAddress: DEFAULT_SERVER,
          port: DEFAULT_PORT,
        });

        if (!mqttSaved) {
          setError('Failed to save MQTT configuration for N720.');
          setConfiguring(false);
          return;
        }

        // Step 2: Configure UART1 for RS485
        console.log('Configuring UART1 for RS485...');
        await n720Gateway.configureUart1();

        // Step 3: Configure NTP (timezone UTC+1, NTP server ntp1.inrim.it)
        console.log('Configuring NTP settings (UTC+1, ntp1.inrim.it)...');
        await n720Gateway.configureNTP();

        // Step 4: Reboot gateway to apply all settings
        console.log('Rebooting N720 gateway to apply settings...');
        await n720Gateway.reboot();

        // Wait for gateway to come back online
        console.log('Waiting for N720 gateway to restart...');
        await n720Gateway.waitForGateway(20000, 1500);

        // Verify UART1 configuration
        console.log('Verifying UART1 configuration...');
        let uartVerified = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const uartConfig = await n720Gateway.getUartConfig();
            const uart1 = uartConfig?.UART?.[0];
            console.log(`Verification attempt ${attempt}: baud_rate=${uart1?.baud_rate}, work_mode=${uart1?.work_mode}`);
            if (uart1?.baud_rate === 9600 && uart1?.work_mode === 2) {
              uartVerified = true;
              console.log('UART1 configuration verified successfully!');
              break;
            }
          } catch (err) {
            console.log(`Verification attempt ${attempt} failed:`, err);
          }
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        if (!uartVerified) {
          console.log('UART1 configuration could not be verified');
          setPortConfigWarning(
            `UART1 configuration could not be verified. Please manually set UART1 to 9600 baud, RS485 via the gateway's web interface.`
          );
        } else {
          setPortConfigWarning(null);
        }

        // Success!
        setSuccess(true);
        setCurrentDeviceName(deviceName.trim());

      } else {
        // N510 Gateway configuration flow (existing code)
        console.log('Configuring N510 gateway...');

        // Step 1: Save MQTT configuration
        console.log('Saving MQTT configuration...');
        const mqttSaved = await gateway.saveMqttConfig({
          deviceName: deviceName.trim(),
          token: token.trim(),
          serverAddress: DEFAULT_SERVER,
          port: DEFAULT_PORT,
        });

        if (!mqttSaved) {
          setError('Failed to save MQTT configuration. Check that the gateway supports MQTT.');
          setConfiguring(false);
          return;
        }

        // Step 2: Reboot gateway to apply MQTT settings
        console.log('Rebooting gateway to apply MQTT settings...');
        await gateway.reboot();

        // Wait for gateway to come back online (poll instead of fixed wait)
        console.log('Waiting for gateway to restart...');
        await gateway.waitForGateway(15000, 1000);

        // Step 3: Configure Port 1 for Modbus RTU (9600 baud, RS485)
        // This sends the config - it will apply after the next reboot
        console.log('Configuring Port 1...');
        await gateway.configurePort1();

        // Step 4: Reboot again to apply port settings
        console.log('Rebooting gateway to apply port settings...');
        await gateway.reboot();

        // Wait for gateway to come back online (poll instead of fixed wait)
        console.log('Waiting for gateway to restart...');
        await gateway.waitForGateway(15000, 1000);

        // Step 5: Verify port configuration after reboot
        console.log('Verifying port configuration...');
        let portVerified = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const portConfig = await gateway.getPort0();
            console.log(`Verification attempt ${attempt}: buad=${portConfig?.buad}, serialmode=${portConfig?.serialmode}`);
            if (portConfig?.buad === '9600' && portConfig?.serialmode === '3') {
              portVerified = true;
              console.log('Port 1 configuration verified successfully!');
              break;
            }
          } catch (err) {
            console.log(`Verification attempt ${attempt} failed:`, err);
          }
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        if (!portVerified) {
          console.log('Port 1 configuration could not be verified');
          setPortConfigWarning(
            `Port configuration could not be verified. Please manually set Port 1 to 9600 baud, RS485 via the gateway's web interface.`
          );
        } else {
          setPortConfigWarning(null);
        }

        // Success!
        setSuccess(true);
        setCurrentDeviceName(deviceName.trim());
      }
    } catch (err) {
      setError('Failed to configure gateway: ' + String(err));
    } finally {
      setConfiguring(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading configuration...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Gateway Type Indicator */}
      {detectedGatewayType !== 'unknown' && (
        <div className={`rounded-lg p-3 ${detectedGatewayType === 'N720' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
          <span className="font-medium">Gateway Type: </span>
          <span className="font-mono">{detectedGatewayType}</span>
          <span className="ml-2 text-sm opacity-75">
            {detectedGatewayType === 'N720' ? '(Using N720 API)' : '(Using N510 API)'}
          </span>
        </div>
      )}

      {/* Step 1: DHCP Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            Step 1: Network Configuration
          </CardTitle>
          <CardDescription>
            Enable DHCP so the gateway gets an IP automatically from the network.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {httpUnreachable && (
            <div className="flex items-center gap-2 rounded-lg bg-blue-50 p-4 text-blue-700 mb-4">
              <Wifi className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-medium">Gateway on different subnet ({ip})</p>
                <p className="text-sm">
                  Cannot reach gateway via HTTP. Use UDP broadcast to configure
                  {mac && mac !== 'Unknown' ? ` (MAC: ${mac})` : ' - MAC required, please scan network first'}.
                </p>
              </div>
            </div>
          )}

          {/* Set Static IP section - only show when gateway is unreachable */}
          {httpUnreachable && mac && mac !== 'Unknown' && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 space-y-4">
              <h4 className="font-medium text-blue-900">Option 1: Set Static IP (move to your subnet)</h4>
              <p className="text-sm text-blue-700">
                Set a static IP on your subnet so you can access the gateway via HTTP, then enable DHCP.
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">New Static IP</label>
                  <Input
                    type="text"
                    placeholder="192.168.1.100"
                    value={newStaticIp}
                    onChange={(e) => setNewStaticIp(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Gateway</label>
                  <Input
                    type="text"
                    placeholder="192.168.1.1"
                    value={newGateway}
                    onChange={(e) => setNewGateway(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Subnet Mask</label>
                  <Input
                    type="text"
                    placeholder="255.255.255.0"
                    value={newSubnetMask}
                    onChange={(e) => setNewSubnetMask(e.target.value)}
                  />
                </div>
              </div>
              <Button
                onClick={handleSetStaticIp}
                disabled={settingStaticIp}
                variant="outline"
                className="w-full"
              >
                {settingStaticIp ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting Static IP via UDP...
                  </>
                ) : (
                  <>
                    <Network className="mr-2 h-4 w-4" />
                    Set Static IP (UDP Broadcast)
                  </>
                )}
              </Button>
            </div>
          )}

          {isDhcpEnabled === true ? (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 p-4 text-green-700">
              <CheckCircle className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-medium">DHCP is enabled</p>
                <p className="text-sm">The gateway is configured to get its IP automatically.</p>
              </div>
            </div>
          ) : isDhcpEnabled === null ? (
            <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-4 text-gray-700">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-medium">Could not determine DHCP status</p>
                <p className="text-sm">Unable to read network configuration. The gateway may still have DHCP enabled.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {httpUnreachable && mac && mac !== 'Unknown' && (
                <div className="rounded-lg border border-green-200 bg-green-50/50 p-4">
                  <h4 className="font-medium text-green-900 mb-2">Option 2: Enable DHCP directly</h4>
                  <p className="text-sm text-green-700 mb-3">
                    If there's a DHCP server on the gateway's current network segment, enable DHCP directly.
                  </p>
                  <Button
                    onClick={handleEnableDhcp}
                    disabled={enablingDhcp}
                    variant="outline"
                    className="w-full"
                  >
                    {enablingDhcp ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enabling DHCP via UDP...
                      </>
                    ) : (
                      <>
                        <Network className="mr-2 h-4 w-4" />
                        Enable DHCP (UDP Broadcast)
                      </>
                    )}
                  </Button>
                </div>
              )}

              {!httpUnreachable && (
                <>
                  <div className="rounded-lg bg-amber-50 p-4">
                    <p className="text-amber-800">
                      <strong>Warning:</strong> The gateway is using a static IP ({ip}).
                      Enable DHCP to allow automatic IP assignment.
                    </p>
                    <p className="mt-2 text-sm text-amber-700">
                      After enabling DHCP, the gateway will restart with a new IP address.
                      You'll need to scan the network again to find it.
                    </p>
                  </div>
                  <Button
                    onClick={handleEnableDhcp}
                    disabled={enablingDhcp}
                    variant="outline"
                    className="w-full"
                  >
                    {enablingDhcp ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enabling DHCP...
                      </>
                    ) : (
                      <>
                        <Network className="mr-2 h-4 w-4" />
                        Enable DHCP
                      </>
                    )}
                  </Button>
                </>
              )}

              {httpUnreachable && (!mac || mac === 'Unknown') && (
                <p className="text-sm text-red-600">
                  Please scan the network to discover the gateway's MAC address first.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Gateway Configuration */}
      <Card className={!isDhcpEnabled ? 'opacity-50' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Step 2: Gateway Configuration
          </CardTitle>
          <CardDescription>
            Configure Port 1 (Modbus RTU), MQTT connection to ThingsBoard, and reporting settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isDhcpEnabled && (
            <div className="rounded-lg bg-gray-100 p-4 text-center text-gray-600">
              Please enable DHCP first before configuring the gateway.
            </div>
          )}

          {isDhcpEnabled && (
            <>
              {/* Current Configuration Status */}
              {currentDeviceName && (
                <div className="rounded-lg bg-green-50 p-4">
                  <h4 className="font-medium text-green-900">Currently Configured</h4>
                  <p className="mt-1 text-sm text-green-700">
                    Device: <span className="font-mono font-semibold">{currentDeviceName}</span>
                  </p>
                </div>
              )}

              {/* Configuration Info */}
              <div className="rounded-lg bg-blue-50 p-4">
                <h4 className="font-medium text-blue-900">Configuration Details</h4>
                <div className="mt-2 text-sm text-blue-700 space-y-1">
                  <p><span className="font-medium">Port 1:</span> 9600 baud, 8N1, RS485</p>
                  <p><span className="font-medium">Server:</span> <span className="font-mono">{DEFAULT_SERVER}:{DEFAULT_PORT}</span></p>
                  <p><span className="font-medium">Gateway IP:</span> <span className="font-mono">{ip}</span></p>
                </div>
              </div>

              {/* Device Name */}
              <div className="space-y-2">
                <label htmlFor="deviceName" className="block text-sm font-medium text-gray-700">
                  Device Name (Client ID) <span className="text-red-500">*</span>
                </label>
                <Input
                  id="deviceName"
                  type="text"
                  placeholder="e.g., Baldassari Linea 2"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                />
                <p className="text-xs text-gray-500">
                  The name of this gateway/device as it appears in ThingsBoard
                </p>
              </div>

              {/* ThingsBoard Token */}
              <div className="space-y-2">
                <label htmlFor="token" className="block text-sm font-medium text-gray-700">
                  ThingsBoard Access Token <span className="text-red-500">*</span>
                </label>
                <Input
                  id="token"
                  type="text"
                  placeholder="e.g., qimtj5ps7v7yf4qqcjnv"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
                <p className="text-xs text-gray-500">
                  The access token generated when you create the device in ThingsBoard
                </p>
              </div>

              {/* SD Card Option - Only for N720 */}
              {detectedGatewayType === 'N720' && (
                <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-5 w-5 text-gray-600" />
                    <h4 className="font-medium text-gray-900">SD Card (TF Card)</h4>
                  </div>

                  {sdCardStatus === 'checking' ? (
                    <div className="flex items-center gap-2 text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Checking SD Card status...</span>
                    </div>
                  ) : sdCardStatus === 'identified' ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-green-700">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm">SD Card detected</span>
                      </div>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formatSdCard}
                          onChange={(e) => setFormatSdCard(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <span className="text-sm font-medium text-gray-700">Format SD Card</span>
                          <p className="text-xs text-gray-500">
                            Format the SD Card to use for offline message caching (recommended for new setup)
                          </p>
                        </div>
                      </label>
                      {formattingSdCard && (
                        <div className="flex items-center gap-2 text-blue-600">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm">Formatting SD Card...</span>
                        </div>
                      )}
                    </div>
                  ) : sdCardStatus === 'unidentified' ? (
                    <div className="flex items-center gap-2 text-amber-600">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm">No SD Card detected. Insert an SD Card for offline message caching.</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-gray-500">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm">Could not determine SD Card status</span>
                    </div>
                  )}
                </div>
              )}

              {/* Error/Success Messages */}
              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-red-700">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  {error}
                </div>
              )}

              {success && (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-green-700">
                  <CheckCircle className="h-5 w-5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Gateway configured successfully!</p>
                    <p className="text-sm">You can now go to the Energy Meters tab to add meters.</p>
                  </div>
                </div>
              )}

              {portConfigWarning && (
                <div className="flex items-start gap-2 rounded-lg bg-yellow-50 p-3 text-yellow-800">
                  <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Port Configuration Warning</p>
                    <p className="text-sm">{portConfigWarning}</p>
                    <a
                      href={gateway.getPortConfigUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-sm font-medium text-yellow-900 underline hover:no-underline"
                    >
                      Open Gateway Port Settings →
                    </a>
                  </div>
                </div>
              )}

              {/* Configure Button */}
              <Button onClick={handleConfigureGateway} disabled={configuring} className="w-full">
                {configuring ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Configuring Gateway...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Configure Gateway
                  </>
                )}
              </Button>

              {/* Help Text */}
              <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
                <h4 className="font-medium text-gray-900">How to get your ThingsBoard Token:</h4>
                <ol className="mt-2 list-inside list-decimal space-y-1">
                  <li>Log in to ThingsBoard</li>
                  <li>Go to Devices and create a new device (or select existing)</li>
                  <li>Click on the device to open details</li>
                  <li>Copy the Access Token from the credentials section</li>
                  <li>Paste it in the field above</li>
                </ol>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Plus, Trash2, Zap, RefreshCw, Save, AlertCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { AddMeterDialog } from './AddMeterDialog';
import { createGatewayService } from '../services/gatewayService';
import { N720GatewayService, detectGatewayType as detectN720GatewayType } from '../services/n720GatewayService';
import {
  getMetersFromConfig,
  addMeterToConfig,
  removeMeterFromConfig,
  detectGatewayType,
  adjustTemplateForTopic,
  type GatewayType,
  type MeterType
} from '../utils/meterTemplate';
import { getMeterConfig, inferMeterTypeFromDataPointCount } from '../config/meterConfigs';
import { generateN720EdgeCsv, parseN720EdgeCsv, generateN720LinkConfig, type N720MeterConfig } from '../utils/n720CsvGenerator';
import { uploadEdgeCsv, downloadEdgeCsv, uploadNvConfig } from '../services/api';
import type { EdgeConfig, GatewayDefine } from '../types/gateway';

const DEFAULT_REPORTING_INTERVAL = 60; // seconds
const DEFAULT_REPORT_TOPIC = 'v1/gateway/telemetry';
const TOPIC_OPTIONS = [
  'v1/gateway/telemetry',
  'v1/devices/gateway',
  'v1/devices/me/telemetry',
];

interface EnergyMeterListProps {
  ip: string;
}

interface Meter {
  name: string;
  index: number;
  slaveAddress: number;
  dataPointCount: number;
  meterType?: string;
}

// Extended meter info for N720 that includes the actual MeterType for CSV generation
interface N720MeterInfo {
  name: string;
  slaveAddress: number;
  meterType: MeterType;
}

export function EnergyMeterList({ ip }: EnergyMeterListProps) {
  const [meters, setMeters] = useState<Meter[]>([]);
  const [edgeConfig, setEdgeConfig] = useState<EdgeConfig | null>(null);
  const [gatewayType, setGatewayType] = useState<GatewayType>('N510');
  const [isN720, setIsN720] = useState(false);  // True if gateway is N720
  const [n720Meters, setN720Meters] = useState<N720MeterInfo[]>([]); // N720 meters pending save
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [reportingInterval, setReportingInterval] = useState<number>(DEFAULT_REPORTING_INTERVAL);
  const [savedReportingInterval, setSavedReportingInterval] = useState<number>(DEFAULT_REPORTING_INTERVAL);
  const [reportTopic, setReportTopic] = useState<string>(DEFAULT_REPORT_TOPIC);
  const [savedReportTopic, setSavedReportTopic] = useState<string>(DEFAULT_REPORT_TOPIC);
  const [selectedTopicOption, setSelectedTopicOption] = useState<string>(DEFAULT_REPORT_TOPIC);
  const [customTopic, setCustomTopic] = useState<string>('');

  const fetchEdgeConfig = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);  // Clear any previous success messages on refresh
    try {
      // First, detect if this is an N720 gateway
      const detectedGwType = await detectN720GatewayType(ip);
      const gatewayIsN720 = detectedGwType === 'N720';
      setIsN720(gatewayIsN720);

      if (gatewayIsN720) {
        // N720 Gateway - use CSV download to get existing meters
        console.log('Detected N720 gateway, using CSV download API');
        setGatewayType('N720');

        const n720Service = new N720GatewayService(ip);
        let n720Meters: Meter[] = [];

        // Try to download the existing edge CSV to get meter configuration
        try {
          const csvResult = await downloadEdgeCsv(ip);
          if (csvResult.success && csvResult.csvContent) {
            console.log('N720 edge CSV downloaded successfully');
            const parsedMeters = parseN720EdgeCsv(csvResult.csvContent);
            console.log('Parsed meters from CSV:', parsedMeters);

            n720Meters = parsedMeters.map((m, index) => ({
              name: m.name,
              index,
              slaveAddress: m.slaveAddress,
              dataPointCount: m.dataPointCount,
              meterType: inferMeterTypeFromDataPointCount('N720', m.dataPointCount) || 'Unknown',
            }));
          } else {
            console.log('N720 CSV download failed or empty, trying edge_node endpoint');
          }
        } catch (err) {
          console.log('Failed to download N720 CSV:', err);
        }

        // Fetch report configuration - this is the most reliable source on N720
        // because download_nv.cgi?name=edge_report works even when CSV download doesn't
        let edgeReport: { group: Array<{
          period?: number;
          topic?: string;
          name?: string;
          template?: string;
          enable?: number;
          cond?: { period?: number; timed?: { type?: number; hh?: number; mm?: number } };
          tmpl_cont?: Record<string, unknown>;
        }> } = { group: [] };
        try {
          edgeReport = await n720Service.getEdgeReport();
          console.log('N720 edge report loaded:', edgeReport);
        } catch (err) {
          console.log('N720 edge_report endpoint not available:', err);
        }

        // Fallback 1: try the edge_node API endpoint if CSV download didn't work
        if (n720Meters.length === 0) {
          try {
            const edgeNodes = await n720Service.getEdgeNodes();
            console.log('N720 edge nodes loaded:', edgeNodes);

            n720Meters = (edgeNodes.node || [])
              .filter(node => node && node.name)
              .map((node, index) => {
                const dataPointCount = node.points?.length || 0;
                return {
                  name: node.name,
                  index,
                  slaveAddress: node.slave_addr || 0,
                  dataPointCount,
                  meterType: inferMeterTypeFromDataPointCount('N720', dataPointCount) || 'Unknown',
                };
              });
          } catch (err) {
            console.log('N720 edge_node endpoint not available:', err);
          }
        }

        // Fallback 2: Parse meters from report group templates
        // Each report group has a template with meter names as keys
        if (n720Meters.length === 0 && edgeReport.group && edgeReport.group.length > 0) {
          console.log('Parsing meters from edge_report templates');
          edgeReport.group.forEach((group, groupIndex) => {
            if (group.enable && group.template) {
              try {
                // Template is a JSON string like: {"MeterName":[{"ts":"sys_timestamp_ms","values":{...}}]}
                const template = typeof group.template === 'string'
                  ? JSON.parse(group.template)
                  : group.template;

                // Each key in the template (except system fields) is a meter name
                const meterNames = Object.keys(template).filter(
                  key => !key.startsWith('sys_') && key !== 'time'
                );

                for (const meterName of meterNames) {
                  // Extract slave address from data point names (e.g., v_l1_2 -> slave 2)
                  const meterData = template[meterName];
                  let slaveAddress = 0;
                  let dataPointCount = 0;

                  if (Array.isArray(meterData) && meterData[0]?.values) {
                    const values = meterData[0].values;
                    dataPointCount = Object.keys(values).length;
                    // Try to extract slave address from first data point value
                    const firstValue = Object.values(values)[0] as string;
                    const match = firstValue?.match(/_(\d+)$/);
                    if (match) {
                      slaveAddress = parseInt(match[1], 10);
                    }
                  }

                  // Don't add duplicates
                  if (!n720Meters.some(m => m.name === meterName)) {
                    n720Meters.push({
                      name: meterName,
                      index: groupIndex,
                      slaveAddress,
                      dataPointCount,
                      meterType: inferMeterTypeFromDataPointCount('N720', dataPointCount) || 'Unknown',
                    });
                  }
                }
              } catch (parseErr) {
                console.log('Failed to parse report template:', parseErr);
              }
            }
          });
          console.log('Parsed meters from report templates:', n720Meters);
        }

        setMeters(n720Meters);

        // Also populate the n720Meters state for saving
        // Use the inferred meter type from the display meters, fallback to XMC34F
        const loadedN720Meters: N720MeterInfo[] = n720Meters.map(m => ({
          name: m.name,
          slaveAddress: m.slaveAddress,
          meterType: (m.meterType && m.meterType !== 'Unknown' ? m.meterType : 'XMC34F') as MeterType,
        }));
        setN720Meters(loadedN720Meters);
        console.log('Loaded N720 meters for saving:', loadedN720Meters);

        // Get reporting settings from first report group if available
        // N720 format may have period as flat field or inside cond object depending on firmware
        let loadedInterval = DEFAULT_REPORTING_INTERVAL;
        let loadedTopic = DEFAULT_REPORT_TOPIC;

        if (edgeReport.group && edgeReport.group.length > 0) {
          const firstGroup = edgeReport.group[0];
          // Try nested cond.period first (import/export format), then flat period (some firmware versions)
          if (firstGroup.cond?.period) {
            loadedInterval = firstGroup.cond.period;
          } else if (firstGroup.period) {
            loadedInterval = firstGroup.period;
          }
          if (firstGroup.topic) {
            loadedTopic = firstGroup.topic.startsWith('/') ? firstGroup.topic.substring(1) : firstGroup.topic;
          }
        }
        console.log('N720: Loaded reporting settings - interval:', loadedInterval, 'topic:', loadedTopic);

        // Set both current and saved values to the same loaded values
        // This prevents false "unsaved changes" detection
        setReportingInterval(loadedInterval);
        setSavedReportingInterval(loadedInterval);
        setReportTopic(loadedTopic);
        setSavedReportTopic(loadedTopic);

        if (TOPIC_OPTIONS.includes(loadedTopic)) {
          setSelectedTopicOption(loadedTopic);
        } else {
          setSelectedTopicOption('custom');
          setCustomTopic(loadedTopic);
        }

        // Create a minimal EdgeConfig for compatibility with existing UI
        const config: EdgeConfig = {
          stamp: Date.now(),
          ctable: [],
          rtable: {
            rules: [{ type: 1, period: loadedInterval }],
            format: [{ topic: loadedTopic, type: 1, template: {} }],
            datas: [],
          },
        };
        setEdgeConfig(config);

        // Show helpful message for N720 users
        // N720 uses a different API structure - edge_node doesn't exist on many firmware versions
        // Note: Use loadedN720Meters (local variable) not n720Meters (state) since setState is async
        if (loadedN720Meters.length === 0) {
          // No meters configured yet - this is normal for a new setup
          console.log('N720: No meters configured yet. User can add meters via the Add Meter button.');
          setHasChanges(false);
        } else if (edgeReport.group.length === 0) {
          // Meters exist but no report configuration - mark as having changes
          // This allows the user to save the report config for existing meters
          console.log('N720: Meters found but no Data Report configured. Enabling save to create report config.');
          setHasChanges(true);
        } else {
          // Both meters and report groups exist - no unsaved changes
          console.log(`N720: Loaded ${loadedN720Meters.length} meters and ${edgeReport.group.length} report groups. No unsaved changes.`);
          setHasChanges(false);
        }
        return;
      }

      // N510 Gateway - use existing N510 API
      const service = createGatewayService(ip);

      // Fetch gateway definition to detect type
      let define: GatewayDefine | undefined;
      try {
        define = await service.getDefine();
        const detectedType = detectGatewayType(define.modename);
        setGatewayType(detectedType);
      } catch (err) {
        console.error('Failed to get define.json:', err);
        // Continue with default gateway type
      }

      // Fetch edge configuration
      let config: EdgeConfig | null = null;
      try {
        config = await service.getEdge();
      } catch (err) {
        console.error('Failed to get edge.json:', err);
      }

      // Check if edge config is valid and has required structure
      if (!config || !config.ctable || !config.rtable) {
        // Create a minimal edge config structure for a fresh gateway
        config = {
          stamp: Date.now(),
          ctable: [],
          rtable: {
            rules: [{ type: 1, period: 70 }],
            format: [{ topic: '/v1/gateway/telemetry', type: 1, template: {} }],
            datas: [],
          },
        };
        setEdgeConfig(config);
        setMeters([]);
        setHasChanges(false);
        return;
      }

      setEdgeConfig(config);
      setMeters(getMetersFromConfig(config));

      // Load reporting interval from edge config
      const interval = await service.getReportingInterval();
      if (interval !== null) {
        setReportingInterval(interval);
        setSavedReportingInterval(interval);
      }

      // Load report topic from edge config
      if (config.rtable?.topics && config.rtable.topics.length > 0) {
        const topic = config.rtable.topics[0];
        // Remove leading slash if present for display
        const displayTopic = topic.startsWith('/') ? topic.substring(1) : topic;
        setReportTopic(displayTopic);
        setSavedReportTopic(displayTopic);
        // Check if it's a predefined option or custom
        if (TOPIC_OPTIONS.includes(displayTopic)) {
          setSelectedTopicOption(displayTopic);
        } else {
          setSelectedTopicOption('custom');
          setCustomTopic(displayTopic);
        }
      }

      setHasChanges(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Failed to load edge configuration: ${errorMsg}`);
      console.error('Edge config error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEdgeConfig();
  }, [ip]);

  const handleAddMeter = async (name: string, slaveAddress: number, meterType: MeterType) => {
    if (isN720) {
      // N720 Gateway - add to local state, upload all at once when user clicks Save
      // Check if meter type is supported on N720
      const meterConfig = getMeterConfig('N720', meterType);
      if (!meterConfig) {
        setError(`Meter type ${meterType} is not supported on N720 gateway`);
        return;
      }

      // Check for duplicate name or slave address
      if (n720Meters.some(m => m.name === name)) {
        setError(`A meter with name "${name}" already exists`);
        return;
      }
      if (n720Meters.some(m => m.slaveAddress === slaveAddress)) {
        setError(`A meter with slave address ${slaveAddress} already exists`);
        return;
      }

      // Add to local N720 meters list
      const newN720Meters = [...n720Meters, { name, slaveAddress, meterType }];
      setN720Meters(newN720Meters);

      // Update the display meters list
      const newMeter: Meter = {
        name,
        index: meters.length,
        slaveAddress,
        dataPointCount: meterConfig.dataPoints.length,
        meterType,
      };
      setMeters([...meters, newMeter]);

      setShowAddDialog(false);
      setHasChanges(true);
      setSuccess(`Added ${meterType} meter "${name}" (Slave ${slaveAddress}). Click "Save to Gateway" to apply changes.`);
      setTimeout(() => setSuccess(null), 5000);
      return;
    }

    // N510 Gateway - use existing logic
    if (!edgeConfig) return;

    // Check if topic allows multiple devices
    const isMultiDeviceTopic = reportTopic === DEFAULT_REPORT_TOPIC ||
                                reportTopic === `/${DEFAULT_REPORT_TOPIC}`;

    // If topic is not v1/gateway/telemetry, only 1 meter is allowed
    if (!isMultiDeviceTopic && meters.length > 0) {
      setError(`Only 1 energy meter is allowed when MQTT topic is not "${DEFAULT_REPORT_TOPIC}". Change the topic or remove the existing meter first.`);
      return;
    }

    try {
      const newConfig = addMeterToConfig(edgeConfig, name, slaveAddress, gatewayType, meterType, reportTopic);
      setEdgeConfig(newConfig);
      setMeters(getMetersFromConfig(newConfig));
      setHasChanges(true);
      setShowAddDialog(false);
      setSuccess(`Added ${meterType} meter "${name}" (Slave ${slaveAddress})`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(`Failed to add meter: ${err}`);
    }
  };

  const handleRemoveMeter = (meterName: string) => {
    if (!confirm(`Are you sure you want to remove meter "${meterName}"?`)) {
      return;
    }

    if (isN720) {
      // N720 Gateway - remove from local state
      setN720Meters(n720Meters.filter(m => m.name !== meterName));
      setMeters(meters.filter(m => m.name !== meterName));
      setHasChanges(true);
      setSuccess(`Removed meter "${meterName}". Click "Save to Gateway" to apply changes.`);
      setTimeout(() => setSuccess(null), 3000);
      return;
    }

    if (!edgeConfig) return;

    try {
      const newConfig = removeMeterFromConfig(edgeConfig, meterName);
      setEdgeConfig(newConfig);
      setMeters(getMetersFromConfig(newConfig));
      setHasChanges(true);
      setSuccess(`Removed meter "${meterName}"`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(`Failed to remove meter: ${err}`);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    // N720 Gateway - upload all meters at once
    if (isN720) {
      try {
        if (n720Meters.length === 0) {
          setError('No meters to save. Add at least one meter first.');
          setSaving(false);
          return;
        }

        const n720Service = new N720GatewayService(ip);

        // Check if topic allows multiple devices
        const isMultiDeviceTopic = reportTopic === DEFAULT_REPORT_TOPIC ||
                                    reportTopic === `/${DEFAULT_REPORT_TOPIC}`;

        // Limit to first meter only if not using multi-device topic
        const metersToSave = isMultiDeviceTopic ? n720Meters : [n720Meters[0]];
        console.log(`N720 save: isMultiDeviceTopic=${isMultiDeviceTopic}, saving ${metersToSave.length} of ${n720Meters.length} meters`);

        // Download existing CSV to preserve system entries (mac, ip, time, etc.)
        let existingCsv: string | undefined;
        try {
          const csvResult = await downloadEdgeCsv(ip);
          if (csvResult.success && csvResult.csvContent) {
            existingCsv = csvResult.csvContent;
            console.log('Downloaded existing CSV to preserve system entries');
          }
        } catch (err) {
          console.log('Could not download existing CSV, will create fresh config:', err);
        }

        // Generate CSV for meters to save, preserving system entries from existing config
        const meterConfigs: N720MeterConfig[] = metersToSave.map((m, index) => ({
          name: m.name,
          slaveAddress: m.slaveAddress,
          meterType: m.meterType,
          meterIndex: index,
        }));

        const csvContent = generateN720EdgeCsv(meterConfigs, existingCsv);
        console.log('Generated N720 CSV for all meters:', csvContent);

        // Upload CSV to gateway (configures Data Acquisition - RAM only)
        const uploadResult = await uploadEdgeCsv(ip, csvContent, 'edge.csv');

        if (!uploadResult.success) {
          // Include errInfo and errMessage if available from the gateway response
          const errorDetails = [
            uploadResult.message,
            uploadResult.error,
            uploadResult.errInfo,
            uploadResult.errMessage,
          ].filter(Boolean).join(' | ');
          setError(`Failed to upload CSV to N720 gateway: ${errorDetails || 'Unknown error'}`);
          setSaving(false);
          return;
        }

        console.log('CSV upload to /upload/edge successful (RAM)');

        // CRITICAL: Also upload the edge CSV to flash storage (nv1 and nv2)
        // Without this, the data acquisition config is lost after reboot!
        const edgeCsvFlashResult = await uploadNvConfig(ip, 'edge', csvContent);
        if (!edgeCsvFlashResult.success) {
          console.warn('Failed to upload edge CSV to flash:', edgeCsvFlashResult);
        } else {
          console.log('Edge CSV uploaded to flash (nv1/nv2) successfully');
        }

        // Enable edge gateway
        await n720Service.enableEdgeGateway();

        // Upload link configuration to map UART ports to edge computing
        // This is critical for the slave_link_info_error to be resolved
        const linkConfig = generateN720LinkConfig();
        console.log('Generated link config:', linkConfig);
        const linkUploadResult = await uploadNvConfig(ip, 'link', linkConfig);

        if (!linkUploadResult.success) {
          console.warn('Failed to upload link config to flash:', linkUploadResult);
        } else {
          console.log('link config uploaded to flash successfully');
        }

        // Create report groups for each meter using the /upload/nv1 endpoint
        // This is the working API discovered by capturing native UI traffic
        console.log('Creating report groups for meters:', metersToSave);

        const cleanTopic = reportTopic.startsWith('/') ? reportTopic.substring(1) : reportTopic;

        // Build report groups with inline template content (tmpl_cont)
        // Template format depends on MQTT topic:
        // - v1/gateway/telemetry (multi-device): { "MeterName": { "field": "field_slaveAddr" }, "time": "sys_local_time" }
        // - Other topics (single device): { "ts": "sys_timestamp_ms", "values": { "field": "field_slaveAddr" } }
        const reportGroups = metersToSave.map(meter => {
          // For report group name: sanitize and truncate (gateway requires 1-20 bytes, a-z/A-Z/0-9/_)
          const sanitizedForGateway = meter.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
          // Limit to 13 chars to allow for "_report" suffix (7 chars) = 20 total
          const truncatedName = sanitizedForGateway.substring(0, 13);

          // Get meter config to build the template content
          const meterConfig = getMeterConfig('N720', meter.meterType);
          const meterValues: Record<string, string> = {};

          if (meterConfig) {
            for (const field of meterConfig.reportingFields) {
              meterValues[field] = `${field}_${meter.slaveAddress}`;
            }
          }

          // Template format depends on topic
          let tmplCont: Record<string, unknown>;
          if (isMultiDeviceTopic) {
            // Multi-device format: { "MeterName": [{ "ts": "sys_timestamp_ms", "values": { fields } }] }
            tmplCont = {
              [meter.name]: [{
                ts: 'sys_timestamp_ms',
                values: meterValues,
              }],
            };
          } else {
            // Single-device format: { "ts": "sys_timestamp_ms", "values": { fields } }
            tmplCont = {
              ts: 'sys_timestamp_ms',
              values: meterValues,
            };
          }

          return {
            name: `${truncatedName}_report`,
            topic: cleanTopic,
            period: reportingInterval,
            tmplCont,
          };
        });

        // Save report groups using update_nv.cgi API (to RAM)
        const reportUploadSuccess = await n720Service.saveAllReportGroups(reportGroups);

        if (!reportUploadSuccess) {
          console.warn('Failed to save report groups');
        } else {
          console.log('Report groups saved successfully');
        }

        // Note: No separate "save to flash" step needed - uploads to /upload/nv1 and /upload/nv2
        // persist to flash storage directly (same as native UI behavior)

        // Check if all uploads succeeded
        const allUploadsSucceeded = edgeCsvFlashResult.success && linkUploadResult.success && reportUploadSuccess;

        setHasChanges(false);
        setSavedReportingInterval(reportingInterval);
        setSavedReportTopic(reportTopic);

        setSuccess(`Configuration saved! ${metersToSave.length} meter(s) set up with data acquisition and MQTT reporting.${allUploadsSucceeded ? ' All settings persisted to flash.' : ' Warning: Some settings may not persist after reboot.'}`);

        // Ask user if they want to reboot
        if (confirm(`Configuration saved with ${metersToSave.length} meter(s)!\n\nDo you want to reboot the gateway now for all changes to take effect?\n\nIMPORTANT: Please use this app to restart the gateway. Do not use the native gateway UI to restart, as it may overwrite the configuration.`)) {
          await n720Service.reboot();
          setSuccess('Gateway is rebooting... Please wait 30 seconds and refresh. Note: Always use this app to restart the gateway after making changes.');
        }
      } catch (err) {
        setError(`Failed to save N720 configuration: ${err}`);
      } finally {
        setSaving(false);
      }
      return;
    }

    // N510 Gateway - use existing logic
    if (!edgeConfig) return;

    try {
      const service = createGatewayService(ip);

      // Adjust template format based on current MQTT topic
      // This ensures correct format (multi-device nested vs single-device flat)
      // and includes only the active meter(s) for the current topic
      const adjustedConfig = adjustTemplateForTopic(edgeConfig, reportTopic);

      // Update all rtable settings in adjustedConfig before saving
      const configToSave = { ...adjustedConfig };
      if (configToSave.rtable) {
        // Update reporting interval (rules)
        if (!configToSave.rtable.rules) {
          configToSave.rtable.rules = [];
        }
        let found = false;
        configToSave.rtable.rules = configToSave.rtable.rules.map(rule => {
          if (rule.type === 1) {
            found = true;
            return { ...rule, period: reportingInterval };
          }
          return rule;
        });
        if (!found) {
          configToSave.rtable.rules.push({ type: 1, period: reportingInterval });
        }

        // Update report topic (without leading slash)
        const topicWithoutSlash = reportTopic.startsWith('/') ? reportTopic.substring(1) : reportTopic;
        configToSave.rtable.topics = [topicWithoutSlash];

        // QoS is always 1 (at-least-once delivery)
        configToSave.rtable.qos = 1;

        // Set sid to 12 (MQTT) for all data entries
        // sid refers to server index: 12 = mqtt in the server array
        if (configToSave.rtable.datas) {
          configToSave.rtable.datas = configToSave.rtable.datas.map(data => ({
            ...data,
            sid: 12,  // MQTT server index
          }));
        }
      }

      const success = await service.saveEdgeConfig(configToSave);
      if (success) {
        // Also explicitly enable Edge Computing
        const edgeEnabled = await service.enableEdgeComputing();
        if (!edgeEnabled) {
          console.warn('Edge config saved but failed to enable Edge Computing');
        }

        // Apply changes via login.cgi (required for gateway to commit the config)
        const applied = await service.applyChanges();
        if (!applied) {
          console.warn('Edge config saved but failed to apply changes via login.cgi');
        }

        // Verify by fetching current config from gateway
        let verificationWarning = '';
        try {
          const savedConfig = await service.getEdge();
          if (savedConfig) {
            // Use adjusted config for expected values (accounts for topic-based limiting)
            const expectedCtable = adjustedConfig.ctable?.length || 0;
            const expectedTemplateKeys = Object.keys(adjustedConfig.rtable?.format?.[0]?.template || {}).length;
            const savedTemplateKeys = Object.keys(savedConfig.rtable?.format?.[0]?.template || {}).length;
            const savedCtable = savedConfig.ctable?.length || 0;

            console.log(`Verification: expected ${expectedCtable} ctable entries, ${expectedTemplateKeys} template keys`);
            console.log(`Verification: saved ${savedCtable} ctable entries, ${savedTemplateKeys} template keys`);
            console.log(`Verification: server=${JSON.stringify(savedConfig.rtable?.server)}, topics=${JSON.stringify(savedConfig.rtable?.topics)}, qos=${savedConfig.rtable?.qos}`);

            if (savedTemplateKeys < expectedTemplateKeys || savedCtable < expectedCtable) {
              verificationWarning = `\n\nWarning: Only ${savedCtable} of ${expectedCtable} meters were saved to the gateway. The gateway may have a limit on configuration size.`;
            }
          }
        } catch (verifyErr) {
          console.warn('Could not verify saved config:', verifyErr);
        }

        setHasChanges(false);
        setSavedReportingInterval(reportingInterval);
        setSavedReportTopic(reportTopic);
        setSuccess(`Configuration saved! Reboot the gateway for changes to take effect.${verificationWarning}`);

        // Ask user if they want to reboot
        if (confirm(`Configuration saved!${verificationWarning}\n\nDo you want to reboot the gateway now for changes to take effect?`)) {
          const rebooted = await service.reboot();
          if (rebooted) {
            setSuccess('Gateway is rebooting... Please wait 30 seconds and refresh.');
          } else {
            setError('Failed to reboot gateway. Please reboot manually.');
          }
        }
      } else {
        setError('Failed to save configuration. The gateway may have rejected the configuration (too many data points or file size exceeded).');
      }
    } catch (err) {
      setError('Failed to save configuration');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2 text-gray-500">
            <RefreshCw className="h-5 w-5 animate-spin" />
            Loading energy meters...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Energy Meters
                <Badge variant="secondary">{gatewayType}</Badge>
              </CardTitle>
              <CardDescription>
                Manage energy meters configured on this gateway
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={fetchEdgeConfig} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Meter
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">
              {success}
            </div>
          )}

          {meters.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              <Zap className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-2">No energy meters configured</p>
              <p className="text-sm">Click "Add Meter" to add your first energy meter</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(() => {
                const isMultiDeviceTopic = reportTopic === DEFAULT_REPORT_TOPIC ||
                                            reportTopic === `/${DEFAULT_REPORT_TOPIC}`;
                return meters.map((meter, index) => {
                  // When not using multi-device topic, only first meter is active
                  const isDisabled = !isMultiDeviceTopic && index > 0;
                  return (
                    <div
                      key={meter.name}
                      className={`flex items-center justify-between rounded-lg border p-4 ${
                        isDisabled ? 'bg-gray-100 opacity-50' : ''
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Zap className={`h-4 w-4 ${isDisabled ? 'text-gray-400' : 'text-yellow-500'}`} />
                          <span className={`font-medium ${isDisabled ? 'text-gray-400' : ''}`}>{meter.name}</span>
                          <Badge variant={isDisabled ? 'secondary' : 'default'}>Index {meter.index}</Badge>
                          {meter.meterType && (
                            <Badge variant="secondary" className={isDisabled ? 'opacity-50' : ''}>{meter.meterType}</Badge>
                          )}
                          {isDisabled && (
                            <Badge variant="secondary" className="text-gray-400 border-gray-300">Inactive</Badge>
                          )}
                        </div>
                        <div className={`text-sm ${isDisabled ? 'text-gray-400' : 'text-gray-500'}`}>
                          {meter.meterType && (
                            <>
                              <span>Type: {meter.meterType}</span>
                              <span className="mx-2">|</span>
                            </>
                          )}
                          <span>Slave Address: {meter.slaveAddress}</span>
                          <span className="mx-2">|</span>
                          <span>{meter.dataPointCount} data points</span>
                          {isDisabled && (
                            <span className="ml-2 italic">(Not included - change topic to v1/gateway/telemetry to enable)</span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveMeter(meter.name)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {/* MQTT Settings */}
          <div className="mt-6 rounded-lg border p-4 space-y-4">
            <h4 className="text-sm font-medium text-gray-900">MQTT Reporting Settings</h4>

            {/* Reporting Interval */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-500" />
                <label htmlFor="reportingInterval" className="text-sm font-medium text-gray-700">
                  Reporting Interval
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="reportingInterval"
                  type="number"
                  min="5"
                  max="3600"
                  className="w-20 rounded-md border border-gray-300 px-3 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={reportingInterval}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || DEFAULT_REPORTING_INTERVAL;
                    setReportingInterval(value);
                    if (value !== savedReportingInterval) {
                      setHasChanges(true);
                    }
                  }}
                />
                <span className="text-sm text-gray-500">seconds</span>
              </div>
            </div>

            {/* Report Topic */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="reportTopicSelect" className="text-sm font-medium text-gray-700">
                  Report Topic
                </label>
                <select
                  id="reportTopicSelect"
                  className="w-64 rounded-md border border-gray-300 px-3 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={selectedTopicOption}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Simply change the topic - meters will be shown as disabled in the UI
                    // The template format will be adjusted when saving
                    setSelectedTopicOption(value);
                    if (value !== 'custom') {
                      setReportTopic(value);
                      if (value !== savedReportTopic) {
                        setHasChanges(true);
                      }
                    }
                  }}
                >
                  {TOPIC_OPTIONS.map((topic) => (
                    <option key={topic} value={topic}>{topic}</option>
                  ))}
                  <option value="custom">Custom...</option>
                </select>
              </div>
              {selectedTopicOption === 'custom' && (
                <div className="flex justify-end">
                  <input
                    id="customTopic"
                    type="text"
                    className="w-64 rounded-md border border-gray-300 px-3 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={customTopic}
                    onChange={(e) => {
                      const newTopic = e.target.value;
                      // Simply change the topic - meters will be shown as disabled in the UI
                      // The template format will be adjusted when saving
                      setCustomTopic(newTopic);
                      setReportTopic(newTopic);
                      if (newTopic !== savedReportTopic) {
                        setHasChanges(true);
                      }
                    }}
                    placeholder="Enter custom topic"
                  />
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500">
              Socket Type is automatically set to MQTT with QoS 1 (at-least-once delivery).
            </p>
          </div>

          {hasChanges && (
            <div className="mt-4 flex items-center justify-between rounded-lg bg-yellow-50 p-4">
              <div className="flex items-center gap-2 text-yellow-800">
                <AlertCircle className="h-4 w-4" />
                <span>You have unsaved changes</span>
              </div>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save to Gateway
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AddMeterDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onAdd={handleAddMeter}
        existingMeters={meters}
        gatewayType={gatewayType}
      />
    </>
  );
}

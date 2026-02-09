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
import { generateN720EdgeCsv, parseN720EdgeCsv, type N720MeterConfig } from '../utils/n720CsvGenerator';
import { downloadEdgeCsv, n720SaveCurrent, downloadN720Templates } from '../services/api';
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

            // Filter out System_Slave - it's a built-in gateway device, not a user-added meter
            n720Meters = parsedMeters
              .filter(m => m.name !== 'System_Slave')
              .map((m, index) => ({
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

        // Fetch report configuration - this is the PRIMARY source for original meter names
        // because the template contains the original names (e.g., "Device 1") while
        // the CSV contains sanitized names (e.g., "Device_1")
        let edgeReport: { group: Array<{
          period?: number;
          topic?: string;
          name?: string;
          template?: string;
          enable?: number;
          cond?: { period?: number; timed?: { type?: number; hh?: number; mm?: number } };
          tmpl_cont?: Record<string, unknown>;
          tmpl_file?: string;
          err_info?: string;  // We store original meter name here as "orig:Device Name"
        }> } = { group: [] };
        try {
          edgeReport = await n720Service.getEdgeReport();
          console.log('N720 edge report loaded:', edgeReport);
        } catch (err) {
          console.log('N720 edge_report endpoint not available:', err);
        }

        // Extract original meter names from the report templates
        // Template can be in:
        // 1. group.template (inline JSON string): {"Original Meter Name":[{"ts":"...","values":{...}}]}
        // 2. group.tmpl_cont (template content object): {"Original Meter Name": {...}, "time": "..."}
        // 3. group.tmpl_file (file reference): "/template/Report0.json" - need to download separately
        const originalNamesFromTemplate: Map<number, string> = new Map();
        if (edgeReport.group && edgeReport.group.length > 0) {
          edgeReport.group.forEach((group, groupIndex) => {
            // FIRST: Check err_info field for original name (stored by our save function)
            // Format: "orig:Original Meter Name"
            if (group.err_info && typeof group.err_info === 'string' && group.err_info.startsWith('orig:')) {
              const errInfo = group.err_info;
              const originalName = errInfo.substring(5); // Remove "orig:" prefix
              originalNamesFromTemplate.set(groupIndex, originalName);
              console.log(`Report group ${groupIndex}: original name from err_info = "${originalName}"`);
              return; // Found original name
            }

            // Try tmpl_cont (direct template content object)
            if (group.tmpl_cont && typeof group.tmpl_cont === 'object') {
              // tmpl_cont format: { "MeterName": { "field": "field_1", ... }, "time": "sys_local_time" }
              const meterNames = Object.keys(group.tmpl_cont).filter(
                key => !key.startsWith('sys_') && key !== 'time'
              );
              if (meterNames.length > 0) {
                originalNamesFromTemplate.set(groupIndex, meterNames[0]);
                console.log(`Report group ${groupIndex}: original name from tmpl_cont = "${meterNames[0]}"`);
                return; // Found name from tmpl_cont, no need to try template
              }
            }

            // Fallback: try template (inline JSON string)
            if (group.template) {
              try {
                const template = typeof group.template === 'string'
                  ? JSON.parse(group.template)
                  : group.template;
                // Get the meter name (first key that isn't a system field)
                const meterNames = Object.keys(template).filter(
                  key => !key.startsWith('sys_') && key !== 'time'
                );
                if (meterNames.length > 0) {
                  // Map group index to original name
                  originalNamesFromTemplate.set(groupIndex, meterNames[0]);
                  console.log(`Report group ${groupIndex}: original name from template = "${meterNames[0]}"`);
                }
              } catch (parseErr) {
                console.log('Failed to parse template for original name:', parseErr);
              }
            }
          });
        }

        // Try to download template files using tmpl_file paths from edge_report groups
        // These are the authoritative source for original meter names
        if (n720Meters.length > 0 && edgeReport.group && edgeReport.group.length > 0) {
          console.log('Trying to download template files using tmpl_file paths...');
          console.log('Edge report groups:', JSON.stringify(edgeReport.group.map(g => ({
            name: g.name,
            tmpl_file: g.tmpl_file,
            hasTemplate: !!g.template,
            hasTmplCont: !!g.tmpl_cont
          }))));

          for (let groupIndex = 0; groupIndex < edgeReport.group.length; groupIndex++) {
            const group = edgeReport.group[groupIndex];
            // Skip if we already have a name for this group
            if (originalNamesFromTemplate.has(groupIndex)) {
              console.log(`Group ${groupIndex}: Already have name "${originalNamesFromTemplate.get(groupIndex)}"`);
              continue;
            }

            // Try to download using tmpl_file path
            if (group.tmpl_file) {
              try {
                // tmpl_file is like "/template/Report0.json"
                console.log(`Group ${groupIndex}: Trying to fetch template from: ${group.tmpl_file}`);
                const response = await fetch(`/api/proxy?host=${ip}&path=${group.tmpl_file.substring(1)}`);
                if (response.ok) {
                  const text = await response.text();
                  console.log(`Template response for group ${groupIndex}: ${text.substring(0, 100)}`);
                  // Skip HTML responses
                  if (!text.startsWith('<')) {
                    const template = JSON.parse(text);
                    const meterNames = Object.keys(template).filter(
                      key => !key.startsWith('sys_') && key !== 'time'
                    );
                    if (meterNames.length > 0) {
                      originalNamesFromTemplate.set(groupIndex, meterNames[0]);
                      console.log(`Template file ${group.tmpl_file}: original name = "${meterNames[0]}"`);
                    }
                  }
                }
              } catch (fetchErr) {
                console.log(`Failed to fetch template from ${group.tmpl_file}:`, fetchErr);
              }
            }
          }
        }

        // Also try the bulk template download as a fallback
        if (n720Meters.length > 0 && originalNamesFromTemplate.size < n720Meters.length) {
          console.log('Trying bulk template download as fallback...');
          try {
            const templateResult = await downloadN720Templates(ip, n720Meters.length + 2);
            if (templateResult.success && templateResult.templates.length > 0) {
              console.log(`Downloaded ${templateResult.templates.length} template files`);
              for (const tmpl of templateResult.templates) {
                // Only use if we don't already have a name for this index
                if (!originalNamesFromTemplate.has(tmpl.index)) {
                  originalNamesFromTemplate.set(tmpl.index, tmpl.name);
                  console.log(`Bulk template Report${tmpl.index}.json: original name = "${tmpl.name}"`);
                }
              }
            } else {
              console.log('Bulk template download returned no templates');
            }
          } catch (tmplErr) {
            console.log('Failed to download bulk templates:', tmplErr);
          }
        }

        // If we got meters from CSV, try to restore original names from template
        if (n720Meters.length > 0 && originalNamesFromTemplate.size > 0) {
          console.log('Restoring original meter names from templates');
          n720Meters = n720Meters.map((meter, index) => {
            const originalName = originalNamesFromTemplate.get(index);
            if (originalName) {
              console.log(`Meter ${index}: CSV name "${meter.name}" -> original "${originalName}"`);
              return { ...meter, name: originalName };
            }
            return meter;
          });
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
        } else {
          // Meters exist - check if our n720Meters state matches what's on the gateway
          // The native UI sends empty report groups {"group":[]}, so we shouldn't
          // treat "no report groups" as "has changes"
          console.log(`N720: Loaded ${loadedN720Meters.length} meters, ${edgeReport.group.length} report groups.`);
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

        // Check if topic allows multiple devices
        const isMultiDeviceTopic = reportTopic === DEFAULT_REPORT_TOPIC ||
                                    reportTopic === `/${DEFAULT_REPORT_TOPIC}`;

        // Limit to first meter only if not using multi-device topic
        const metersToSave = isMultiDeviceTopic ? n720Meters : [n720Meters[0]];
        console.log(`N720 save: isMultiDeviceTopic=${isMultiDeviceTopic}, saving ${metersToSave.length} of ${n720Meters.length} meters`);
        console.log('DEBUG n720Meters state:', JSON.stringify(n720Meters, null, 2));
        console.log('DEBUG metersToSave:', JSON.stringify(metersToSave, null, 2));

        // Generate a fresh CSV with ONLY the meters the user wants
        // We do NOT preserve existing CSV entries because:
        // 1. When deleting meters, we want them removed from the config
        // 2. System_Slave entries are built-in to the gateway firmware and added automatically
        // 3. Preserving existing entries caused add/delete to not work properly
        //
        // Use slave address as the meterIndex for data point naming
        // This ensures unique indices (slave 3 -> v_l1_3, slave 5 -> v_l1_5)
        const meterConfigs: N720MeterConfig[] = metersToSave.map((m) => {
          const meterIndex = m.slaveAddress;  // Use slave address as index
          console.log(`Building meterConfig: name="${m.name}", slaveAddress=${m.slaveAddress}, meterIndex=${meterIndex}`);
          return {
            name: m.name,
            slaveAddress: m.slaveAddress,
            meterType: m.meterType,
            meterIndex,
          };
        });

        // Generate fresh CSV - do NOT pass existingCsv to ensure clean config
        const csvContent = generateN720EdgeCsv(meterConfigs);
        console.log('Generated N720 CSV for all meters:', csvContent);

        // ============================================
        // FULL PROGRAMMATIC SAVE (exact HAR sequence with report groups):
        // 1. POST /upload/edge (CSV)
        // 2. POST /upload/template (Report templates for each meter)
        // 3. POST /upload/nv1 (edge_report with groups)
        // 4. POST /upload/nv2 (edge_report - same content)
        // 5. GET /action_restart.cgi
        // ============================================

        console.log('Executing full N720 Save Current + Restart sequence...');
        console.log('Meters:', metersToSave.map(m => ({ name: m.name, slaveAddress: m.slaveAddress, meterType: m.meterType })));
        console.log('Report Topic:', reportTopic);
        console.log('Reporting Interval:', reportingInterval);

        // Pass meter configs with meterIndex for report group generation
        const metersForSave = meterConfigs.map(m => ({
          name: m.name,
          slaveAddress: m.slaveAddress,
          meterType: m.meterType as string,  // Ensure it's a string for JSON serialization
          meterIndex: m.meterIndex,
        }));

        console.log('DEBUG metersForSave:', JSON.stringify(metersForSave, null, 2));

        const saveResult = await n720SaveCurrent(
          ip,
          csvContent,
          true,
          reportTopic,
          reportingInterval,
          metersForSave
        );

        if (!saveResult.success) {
          const errorDetails = saveResult.message || saveResult.error || 'Unknown error';
          setError(`Failed to save configuration: ${errorDetails}`);
          console.error('Save Current failed:', saveResult);
          setSaving(false);
          return;
        }

        console.log('Save Current + Restart completed:', saveResult);

        setHasChanges(false);
        setSavedReportingInterval(reportingInterval);
        setSavedReportTopic(reportTopic);

        setSuccess(
          `✅ Configuration saved with ${metersToSave.length} meter(s)!\n` +
          `✅ Report groups created for each meter\n` +
          `✅ Topic: ${reportTopic}, Interval: ${reportingInterval}s\n` +
          `✅ Gateway is restarting...\n\n` +
          `Please wait 30 seconds and refresh this page.`
        );
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

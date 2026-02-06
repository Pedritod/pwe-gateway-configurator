import type { EdgeConfig, EdgeCtableEntry, EdgeDataPoint, EdgeRtableData, MeterTemplateEntry } from '../types/gateway';
import {
  type GatewayType,
  type MeterType,
  type MeterConfig,
  getMeterConfig,
  getN720DataTypeCode,
  inferMeterTypeFromDataPointCount,
} from '../config/meterConfigs';

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type { GatewayType, MeterType };
export { getMeterConfig, getAvailableMeterTypes, detectGatewayType } from '../config/meterConfigs';

// ============================================================================
// GATEWAY LIMITS
// ============================================================================

// N510 gateway limits (discovered from web interface)
// Note: These are soft limits shown in the UI. The gateway may accept
// configurations that approach these limits. The main constraints are:
// - Total data points across all ctable entries (nodes)
// - JSON template size for the reporting format
export const N510_LIMITS = {
  maxNodes: 126,           // Maximum total data points/nodes
  maxJsonTemplateBytes: 2048, // Maximum JSON template size (displayed in web UI)
  maxCtableEntries: 20,    // Practical max ctable entries (not a hard limit)
  // Practical capacities based on testing:
  // - 4 EM4371 meters (27 points each) = 108 nodes, ~1930 bytes template - works
  // - 10 XMC34F_Lite meters (12 points each) = 120 nodes, ~1600 bytes - should work
};

/**
 * Calculate the size of edge config components
 */
export function calculateConfigSize(config: EdgeConfig): {
  totalNodes: number;
  templateSize: number;
  ctableEntries: number;
  isWithinLimits: boolean;
  warnings: string[];
} {
  const totalNodes = config.rtable?.datas?.length || 0;
  const template = config.rtable?.format?.[0]?.template || {};
  const templateSize = JSON.stringify(template).length;
  const ctableEntries = config.ctable?.length || 0;

  const warnings: string[] = [];

  if (totalNodes > N510_LIMITS.maxNodes) {
    warnings.push(`Total nodes (${totalNodes}) exceeds N510 limit of ${N510_LIMITS.maxNodes}`);
  }

  if (templateSize > N510_LIMITS.maxJsonTemplateBytes) {
    warnings.push(`JSON template size (${templateSize} bytes) exceeds N510 limit of ${N510_LIMITS.maxJsonTemplateBytes} bytes`);
  }

  return {
    totalNodes,
    templateSize,
    ctableEntries,
    isWithinLimits: warnings.length === 0,
    warnings,
  };
}

// ============================================================================
// INDEX MANAGEMENT
// ============================================================================

/**
 * Extract existing meter indices from the edge config
 * Now simply returns indices 0 to n-1 based on ctable length
 */
export function getExistingIndices(config: EdgeConfig): number[] {
  const count = config.ctable?.length || 0;
  return Array.from({ length: count }, (_, i) => i);
}

/**
 * Get the next available index for a new meter
 * Simply returns the current ctable length (0-indexed)
 */
export function getNextIndex(config: EdgeConfig): number {
  return config.ctable?.length || 0;
}

// ============================================================================
// DATA POINT GENERATION
// ============================================================================

/**
 * Generate data points for a new meter based on meter configuration
 */
/**
 * Convert function code and register address to N510 address format.
 * N510 uses format like "40017" where:
 * - First digit is the function code prefix (3 -> 4, 4 -> 3, etc.)
 * - Remaining 4 digits are the 1-based Modbus register number
 *
 * Function code mapping (standard Modbus convention):
 * - FC 1 (coils) -> prefix 0
 * - FC 2 (discrete inputs) -> prefix 1
 * - FC 3 (holding registers) -> prefix 4
 * - FC 4 (input registers) -> prefix 3
 *
 * Standard Modbus notation uses 1-based register numbers:
 * - 40001 = first holding register (address 0)
 * - 40017 = seventeenth holding register (address 16)
 *
 * The registerAddress parameter from meterConfigs is the 0-based address.
 * We add 1 to convert to 1-based register number for the N510 JSON API format.
 */
function formatN510Address(functionCode: number, registerAddress: number): string {
  // Map function code to address prefix
  const prefixMap: Record<number, number> = {
    1: 0,  // Coils
    2: 1,  // Discrete inputs
    3: 4,  // Holding registers
    4: 3,  // Input registers
  };

  const prefix = prefixMap[functionCode] ?? 4; // Default to holding registers
  // Convert 0-based address to 1-based register number (standard Modbus notation)
  // Address 16 -> register number 17 -> "40017"
  const registerNumber = registerAddress + 1;
  return `${prefix}${registerNumber.toString().padStart(4, '0')}`;
}

function generateDataPoints(
  meterConfig: MeterConfig,
  index: number,
  _slaveAddress: number,
  baseKey: number
): EdgeDataPoint[] {
  return meterConfig.dataPoints.map((point, i) => ({
    key: baseKey + i + 1,
    name: `${point.name}_${index}`,
    type: getN720DataTypeCode(point.dataType),
    range: null,
    defv: 1,
    addr: formatN510Address(point.functionCode, point.registerAddress),
    rw: 1,
    ct: point.pollInterval,
    to: point.responseTimeout,
  }));
}

/**
 * Generate ctable entry for a new meter
 * Uses the user-provided custom name for the ctable entry
 */
function generateCtableEntry(
  _meterConfig: MeterConfig,
  _index: number,
  slaveAddress: number,
  dataPoints: EdgeDataPoint[],
  ctableKey: number,
  customName: string
): EdgeCtableEntry {
  return {
    key: ctableKey,
    name: customName,  // Use the user-provided custom name
    prot: 'mbrtu',
    port: ['uart', 1, slaveAddress],
    group: 0,
    ct: 100,
    datas: dataPoints,
  };
}

/**
 * Generate template entry for a new meter
 * Returns the field mappings for this meter
 * The suffix (_0, _1, etc.) is applied to data point references
 */
function generateTemplateEntry(
  meterConfig: MeterConfig,
  index: number
): MeterTemplateEntry {
  const entry: MeterTemplateEntry = {};

  if (meterConfig.hasTimestamp) {
    // N720 format with timestamp
    const values: Record<string, string> = {};
    meterConfig.reportingFields.forEach(field => {
      values[field] = `${field}_${index}`;
    });
    // Return as nested structure with ts and values
    return {
      ts: 'sys_timestamp_ms',
      values,
    } as unknown as MeterTemplateEntry;
  } else {
    // N510 format - field mappings (will be wrapped in array by caller)
    meterConfig.reportingFields.forEach(field => {
      entry[field] = `${field}_${index}`;
    });
  }

  return entry;
}

/**
 * Generate rtable.datas entries for a new meter
 */
function generateRtableDatas(dataPoints: EdgeDataPoint[]): EdgeRtableData[] {
  return dataPoints.map(point => ({
    key: point.key,
    name: point.name,
    rid: [1, 2],
    sid: 12,  // Server ID - 12 = MQTT (index in server array)
    tid: 1,
    fid: 1,
  }));
}

// ============================================================================
// CONFIG MODIFICATION FUNCTIONS
// ============================================================================

// The special MQTT topic that enables multi-device support with nested template format
export const MULTI_DEVICE_MQTT_TOPIC = 'v1/gateway/telemetry';

/**
 * Add a new energy meter to the edge configuration
 * @throws Error if adding the meter would exceed gateway limits
 *
 * Template format depends on MQTT topic:
 * - If topic is 'v1/gateway/telemetry': Multiple devices allowed with nested format
 *   N720: { "Device": [{ "ts": "sys_timestamp_ms", "values": { "field": "field_0" } }] }
 *   N510: { "Device": [{ "field": "field_0" }] }
 * - If topic is NOT 'v1/gateway/telemetry': Only 1 device allowed with flat format
 *   { "field1": "field1_0", "field2": "field2_0" }
 */
export function addMeterToConfig(
  config: EdgeConfig,
  meterName: string,
  slaveAddress: number,
  gatewayType: GatewayType,
  meterType: MeterType,
  mqttTopic: string = MULTI_DEVICE_MQTT_TOPIC
): EdgeConfig {
  console.log(`addMeterToConfig called with: meterName=${meterName}, slaveAddress=${slaveAddress}, gatewayType=${gatewayType}, meterType=${meterType}`);

  const meterConfig = getMeterConfig(gatewayType, meterType);
  console.log(`getMeterConfig result:`, meterConfig ? `Found config with ${meterConfig.dataPoints.length} data points` : 'NOT FOUND');

  if (!meterConfig) {
    throw new Error(`No configuration found for ${meterType} on ${gatewayType}`);
  }

  // Check current config size
  const currentSize = calculateConfigSize(config);
  const newDataPoints = meterConfig.dataPoints.length;
  const projectedNodes = currentSize.totalNodes + newDataPoints;

  // Estimate new template size
  const newTemplateEntry: Record<string, string> = {};
  meterConfig.reportingFields.forEach(field => {
    newTemplateEntry[field] = `${field}_0`; // Placeholder for size estimation
  });
  const newTemplateSize = currentSize.templateSize + JSON.stringify({ [meterName]: newTemplateEntry }).length;

  console.log(`Gateway limits check: current nodes=${currentSize.totalNodes}, adding=${newDataPoints}, projected=${projectedNodes}, limit=${N510_LIMITS.maxNodes}`);
  console.log(`Template size check: current=${currentSize.templateSize}, projected=${newTemplateSize}, limit=${N510_LIMITS.maxJsonTemplateBytes}`);

  if (projectedNodes > N510_LIMITS.maxNodes) {
    throw new Error(`Cannot add meter: would exceed N510 node limit of ${N510_LIMITS.maxNodes} (current: ${currentSize.totalNodes}, adding: ${newDataPoints})`);
  }

  if (newTemplateSize > N510_LIMITS.maxJsonTemplateBytes) {
    throw new Error(`Cannot add meter: would exceed N510 JSON template size limit of ${N510_LIMITS.maxJsonTemplateBytes} bytes (projected: ${newTemplateSize} bytes)`);
  }

  const newConfig = JSON.parse(JSON.stringify(config)) as EdgeConfig;
  const index = getNextIndex(newConfig);

  // Calculate base key for new data points
  let maxDataKey = 0;
  let maxCtableKey = 0;
  newConfig.ctable.forEach(entry => {
    if (entry.key > maxCtableKey) maxCtableKey = entry.key;
    entry.datas.forEach(d => {
      if (d.key > maxDataKey) maxDataKey = d.key;
    });
  });
  // Start fresh with key 1000 if no existing data points
  const baseKey = maxDataKey > 0 ? Math.floor(maxDataKey / 1000 + 1) * 1000 : 1000;
  const newCtableKey = maxCtableKey > 0 ? maxCtableKey + 1 : 1;

  // Generate new data points
  const dataPoints = generateDataPoints(meterConfig, index, slaveAddress, baseKey);
  console.log(`Generated ${dataPoints.length} data points for meter, baseKey=${baseKey}`);

  // Add new ctable entry with unique key (using user-provided name)
  const ctableEntry = generateCtableEntry(meterConfig, index, slaveAddress, dataPoints, newCtableKey, meterName);
  console.log(`Generated ctable entry: key=${ctableEntry.key}, name=${ctableEntry.name}, datas=${ctableEntry.datas.length}`);
  newConfig.ctable.push(ctableEntry);

  // Add template entries
  // Format depends on MQTT topic:
  // - v1/gateway/telemetry: Multiple devices with nested format { "Device": [{ fields }] }
  // - Other topics: Single device with flat format { "field1": "field1_0" }
  if (!newConfig.rtable.format[0].template) {
    newConfig.rtable.format[0].template = {};
  }

  const isMultiDeviceTopic = mqttTopic === MULTI_DEVICE_MQTT_TOPIC ||
                              mqttTopic === `/${MULTI_DEVICE_MQTT_TOPIC}`;
  const template = newConfig.rtable.format[0].template;

  // Clean up any legacy/default template entries that are just strings
  for (const key of Object.keys(template)) {
    const value = template[key];
    if (typeof value === 'string') {
      console.log(`Removing legacy template entry: "${key}": "${value}"`);
      delete template[key];
    }
  }

  // Generate template entry
  const templateEntry = generateTemplateEntry(meterConfig, index);
  console.log(`Generated template entry for meter "${meterName}" (multiDevice=${isMultiDeviceTopic}):`, JSON.stringify(templateEntry));

  if (isMultiDeviceTopic) {
    // Multi-device format: { "Device Name": [{ fields }] }
    newConfig.rtable.format[0].template[meterName] = [templateEntry];
  } else {
    // Single-device flat format: { "field1": "field1_0", "field2": "field2_0" }
    // Clear any existing template entries and use flat format
    for (const key of Object.keys(template)) {
      delete template[key];
    }
    // Copy fields directly to template (flat structure)
    for (const [fieldKey, fieldValue] of Object.entries(templateEntry)) {
      newConfig.rtable.format[0].template[fieldKey] = fieldValue;
    }
  }
  console.log(`Template after adding:`, JSON.stringify(newConfig.rtable.format[0].template));

  // Add rtable.datas entries
  const rtableDatas = generateRtableDatas(dataPoints);
  newConfig.rtable.datas.push(...rtableDatas);

  // Update stamp
  newConfig.stamp = Date.now();

  return newConfig;
}

/**
 * Remove a meter from the edge configuration by meter name.
 * The meter name is both the ctable entry name and the template key.
 */
export function removeMeterFromConfig(config: EdgeConfig, meterName: string): EdgeConfig {
  const newConfig = JSON.parse(JSON.stringify(config)) as EdgeConfig;

  // Find ctable entry by name
  const ctableIndex = newConfig.ctable.findIndex(entry => entry.name === meterName);

  if (ctableIndex === -1) {
    throw new Error(`Meter "${meterName}" not found in ctable`);
  }

  const removedEntry = newConfig.ctable[ctableIndex];
  const keysToRemove = new Set(removedEntry.datas.map(d => d.key));

  // Remove ctable entry
  newConfig.ctable.splice(ctableIndex, 1);

  // Remove corresponding rtable.datas entries
  newConfig.rtable.datas = newConfig.rtable.datas.filter(d => !keysToRemove.has(d.key));

  // Remove corresponding template entry
  // Template uses the meter name as key: { "My Meter": [{ "v_l1": "v_l1_0", ... }] }
  const template = newConfig.rtable.format[0]?.template;
  if (template && template[meterName]) {
    delete template[meterName];
  }

  // Update stamp
  newConfig.stamp = Date.now();

  return newConfig;
}

/**
 * Adjust the template format based on the MQTT topic before saving.
 * This should be called just before saving to ensure the template matches
 * the expected format for the current topic.
 *
 * @param config The edge config to adjust
 * @param mqttTopic The current MQTT topic
 * @returns A new config with the adjusted template format
 */
export function adjustTemplateForTopic(config: EdgeConfig, mqttTopic: string): EdgeConfig {
  const newConfig = JSON.parse(JSON.stringify(config)) as EdgeConfig;

  // Ensure rtable.format exists
  if (!newConfig.rtable?.format?.[0]) {
    return newConfig;
  }

  const isMultiDeviceTopic = mqttTopic === MULTI_DEVICE_MQTT_TOPIC ||
                              mqttTopic === `/${MULTI_DEVICE_MQTT_TOPIC}`;

  if (isMultiDeviceTopic) {
    // Multi-device format: ALWAYS rebuild template from ctable entries
    // This ensures we don't have stale entries from deleted meters
    const meterTemplates: Record<string, Array<Record<string, string>>> = {};

    for (const ctableEntry of newConfig.ctable || []) {
      // Build field mappings from data points
      const fields: Record<string, string> = {};
      for (const dataPoint of ctableEntry.datas || []) {
        // Data point name format: "field_index" (e.g., "v_l1_0")
        const dpMatch = dataPoint.name.match(/^(.+)_\d+$/);
        if (dpMatch) {
          const fieldName = dpMatch[1];
          fields[fieldName] = dataPoint.name;
        }
      }

      // Use the ctable name (custom meter name) as the template key
      if (Object.keys(fields).length > 0) {
        meterTemplates[ctableEntry.name] = [fields];
      }
    }

    newConfig.rtable.format[0].template = meterTemplates;
  } else {
    // Single-device format: only first meter, flat format { "field1": "field1_0" }
    // Clear template and rebuild with only first meter's fields
    const firstCtableEntry = newConfig.ctable?.[0];

    if (firstCtableEntry) {
      const flatTemplate: Record<string, string> = {};

      for (const dataPoint of firstCtableEntry.datas || []) {
        // Data point name format: "field_index" (e.g., "v_l1_0")
        const dpMatch = dataPoint.name.match(/^(.+)_\d+$/);
        if (dpMatch) {
          const fieldName = dpMatch[1];
          flatTemplate[fieldName] = dataPoint.name;
        }
      }

      newConfig.rtable.format[0].template = flatTemplate;
    } else {
      newConfig.rtable.format[0].template = {};
    }

    // Also limit ctable and rtable.datas to only first meter
    if (newConfig.ctable && newConfig.ctable.length > 1) {
      const firstEntry = newConfig.ctable[0];
      const keysToKeep = new Set(firstEntry.datas.map(d => d.key));

      newConfig.ctable = [firstEntry];
      newConfig.rtable.datas = newConfig.rtable.datas.filter(d => keysToKeep.has(d.key));
    }
  }

  return newConfig;
}

/**
 * Get list of meters from edge config
 * Uses ctable entries as the source of truth for meters.
 * Shows ALL ctable entries, including those with 0 data points.
 * The meter type is inferred from the data point count.
 */
export function getMetersFromConfig(config: EdgeConfig): Array<{
  name: string;
  index: number;
  slaveAddress: number;
  dataPointCount: number;
  meterType?: string;
}> {
  const meters: Array<{
    name: string;
    index: number;
    slaveAddress: number;
    dataPointCount: number;
    meterType?: string;
  }> = [];

  // Use ctable entries as the primary source for meters
  // Show ALL ctable entries, even those with 0 data points
  for (let i = 0; i < (config.ctable || []).length; i++) {
    const ctableEntry = config.ctable[i];
    const dataPointCount = ctableEntry.datas?.length || 0;

    // Try to infer meter type from data point count
    // Import is at runtime to avoid circular dependency
    let meterType: string | undefined;

    // Check if this is an old format entry (MeterType_index like "XMC34F_0")
    const oldFormatMatch = ctableEntry.name.match(/^(XMC34F|PR01Mod|EM4371|Sfere720|EnergyNG9|TAC4300)_(\d+)$/);
    if (oldFormatMatch) {
      meterType = oldFormatMatch[1];
    } else {
      // For custom names, infer from data point count
      meterType = inferMeterTypeFromDataPointCount('N510', dataPointCount);
    }

    meters.push({
      name: ctableEntry.name,  // Use ctable name (which is now the custom name)
      index: i,
      slaveAddress: ctableEntry.port?.[2] || 0,
      dataPointCount,
      meterType,
    });
  }

  return meters.sort((a, b) => a.index - b.index);
}

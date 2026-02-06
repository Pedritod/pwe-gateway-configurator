/**
 * N720 CSV Generator
 *
 * Generates CSV content for N720 gateway edge configuration.
 * The CSV is used to configure data acquisition (Modbus devices and registers).
 */

import { getMeterConfig, getN720DataTypeCode, type MeterType } from '../config/meterConfigs';

export interface N720MeterConfig {
  name: string;           // Meter name (used as device name)
  slaveAddress: number;   // Modbus slave address (used as data point suffix, e.g., v_l1_1 for slave 1)
  meterType: MeterType;   // Type of meter (EM4371, XMC34F, etc.)
  meterIndex: number;     // Legacy: was used for 0-based indexing, now ignored (slaveAddress used instead)
  port?: string;          // Serial port (default: Uart1)
  protocol?: number;      // 1 = Modbus RTU, 3 = Modbus TCP (default: 1)
  pollingInterval?: number; // Polling interval in ms (default: 100)
}

/**
 * Get decimal places based on data type
 */
function getDecimalPlaces(dataType: string): number {
  if (dataType.includes('float')) {
    return 2;  // Float types get 2 decimal places
  }
  return 0;  // Integer types get 0 decimal places
}

/**
 * Generate a single meter's CSV lines (SC line + C lines for data points)
 */
function generateMeterCsvLines(config: N720MeterConfig): string[] {
  const lines: string[] = [];
  const {
    name: rawName,
    slaveAddress,
    meterType,
    // meterIndex is no longer used - we use slaveAddress for data point naming
    port = 'Uart1',
    protocol = 1,
    pollingInterval = 100,
  } = config;

  // Sanitize meter name: remove spaces and special characters that might cause CSV parsing issues
  // Gateway requires: 1-20 bytes, only a-z, A-Z, 0-9, and _
  // We limit to 14 chars to allow for "_state" suffix (6 chars) = 20 total
  const sanitized = rawName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  const name = sanitized.substring(0, 14);  // Limit to 14 chars so {name}_state <= 20 chars

  // Get meter configuration from meterConfigs
  const meterConfig = getMeterConfig('N720', meterType);
  if (!meterConfig) {
    console.error(`Meter type ${meterType} not supported on N720`);
    return [];
  }

  // SC line: Slave Configuration
  // Format: SC,{SlaveName},,{Protocol},{SlaveAddr},{PollingInterval},0,0,,{Port},;
  // Note: Position 3 is protocol, Position 4 is slave address (based on working CSV analysis)
  lines.push(`SC,${name},,${protocol},${slaveAddress},${pollingInterval},0,0,,${port},;`);

  // State point (always included first)
  // Format: C,{SlaveName},{PointName},,18,0,0,0,0,0,0,,State,0,0,0,0,0,0,,;
  lines.push(`C,${name},${name}_state,,18,0,0,0,0,0,0,,State,0,0,0,0,0,0,,;`);

  // C lines: Data Point Configuration
  // Format: C,{SlaveName},{PointName},,{DataType},{DecimalPlaces},0,0,0,0,0,,{Register}',0,0,{PollingFlag},{Timeout},0,{DecimalPlaces},,;
  // Note: Data point names use the SLAVE ADDRESS as suffix (e.g., v_l1_1 for slave address 1)
  // This matches the working CSV format where XMC34F1 (slave 1) uses _1, XMC34F2 (slave 2) uses _2
  // Note: PollingFlag MUST be 1 based on working CSV files (enables polling)
  // Note: Register address MUST have trailing apostrophe (e.g., 404097') - matches working CSV format
  for (const dataPoint of meterConfig.dataPoints) {
    const pointName = `${dataPoint.name}_${slaveAddress}`;  // Use slave address, not meterIndex
    const dataTypeCode = getN720DataTypeCode(dataPoint.dataType);
    const decimalPlaces = getDecimalPlaces(dataPoint.dataType);
    const registerAddress = `${dataPoint.registerAddress}'`;  // With apostrophe!
    const pollingFlag = 1;  // Must be 1 based on working CSV files (enables polling)
    const timeout = dataPoint.responseTimeout;

    lines.push(
      `C,${name},${pointName},,${dataTypeCode},${decimalPlaces},0,0,0,0,0,,${registerAddress},0,0,${pollingFlag},${timeout},0,${decimalPlaces},,;`
    );
  }

  return lines;
}

/**
 * Generate complete N720 edge CSV content for one or more meters
 */
export function generateN720EdgeCsv(meters: N720MeterConfig[]): string {
  const lines: string[] = [];

  // Header line (required)
  lines.push('V,V1.0,N7X0,;');

  // Generate lines for each meter
  for (const meter of meters) {
    const meterLines = generateMeterCsvLines(meter);
    lines.push(...meterLines);
  }

  // N720 gateway requires CRLF line endings (Windows-style)
  return lines.join('\r\n');
}

/**
 * Generate CSV for a single meter (convenience function)
 */
export function generateSingleMeterCsv(
  name: string,
  slaveAddress: number,
  meterType: MeterType,
  meterIndex: number = 0,
  port: string = 'Uart1'
): string {
  return generateN720EdgeCsv([{
    name,
    slaveAddress,
    meterType,
    meterIndex,
    port,
  }]);
}

/**
 * Get supported meter types for N720
 */
export function getN720SupportedMeterTypes(): MeterType[] {
  return ['XMC34F', 'EM4371', 'Sfere720', 'EnergyNG9', 'TAC4300'];
}

/**
 * Parsed meter info from CSV
 */
export interface ParsedN720Meter {
  name: string;
  slaveAddress: number;
  protocol: number;
  port: string;
  pollingInterval: number;
  dataPointCount: number;
}

/**
 * Parse existing N720 CSV content to extract meter information
 * Returns the list of meters found in the CSV
 */
export function parseN720EdgeCsv(csvContent: string): ParsedN720Meter[] {
  const meters: ParsedN720Meter[] = [];
  const lines = csvContent.split('\n').filter(line => line.trim());

  for (const line of lines) {
    // Parse SC lines (Slave Configuration)
    // Format: SC,{SlaveName},,{Protocol},{SlaveAddr},{PollingInterval},0,0,,{Port},;
    // Note: Position 3 is protocol, Position 4 is slave address (based on working CSV analysis)
    if (line.startsWith('SC,')) {
      const parts = line.split(',');
      if (parts.length >= 10) {
        const name = parts[1];
        const protocol = parseInt(parts[3], 10) || 1;
        const slaveAddress = parseInt(parts[4], 10) || 1;
        const pollingInterval = parseInt(parts[5], 10) || 100;
        const port = parts[9] || 'Uart1';

        meters.push({
          name,
          slaveAddress,
          protocol,
          port,
          pollingInterval,
          dataPointCount: 0, // Will be counted from C lines
        });
      }
    }
    // Count C lines for data points
    else if (line.startsWith('C,')) {
      const parts = line.split(',');
      if (parts.length >= 2) {
        const meterName = parts[1];
        const meter = meters.find(m => m.name === meterName);
        if (meter) {
          meter.dataPointCount++;
        }
      }
    }
  }

  return meters;
}

/**
 * Append a new meter to existing CSV content
 * This preserves all existing meters and adds the new one
 */
export function appendMeterToCsv(
  existingCsv: string,
  newMeter: N720MeterConfig
): string {
  // Parse existing CSV
  const existingMeters = parseN720EdgeCsv(existingCsv);

  // Check if meter with same name already exists
  if (existingMeters.some(m => m.name === newMeter.name)) {
    console.warn(`Meter with name "${newMeter.name}" already exists. Adding with suffix.`);
    newMeter.name = `${newMeter.name}_${existingMeters.length}`;
  }

  // Generate lines for the new meter
  const newMeterLines = generateMeterCsvLines(newMeter);

  // If existing CSV is empty or invalid, create new CSV
  if (!existingCsv.trim() || !existingCsv.includes('V,V1.0,N7X0')) {
    return generateN720EdgeCsv([newMeter]);
  }

  // Append new meter lines to existing CSV
  // Handle both CRLF and LF line endings when parsing
  const lines = existingCsv.split(/\r?\n/).filter(line => line.trim());

  // Add new meter lines
  lines.push(...newMeterLines);

  // N720 gateway requires CRLF line endings (Windows-style)
  return lines.join('\r\n');
}

/**
 * Find the next available meter index from existing CSV
 */
export function getNextMeterIndex(csvContent: string): number {
  const meters = parseN720EdgeCsv(csvContent);
  return meters.length;
}

/**
 * Generate N720 report template for a meter
 * This creates the JSON template structure used in the report group
 * Format: { "MeterName": [{ "ts": "sys_timestamp_ms", "values": { "field": "field_slaveAddress", ... }}] }
 *
 * Note: The field suffix uses the Modbus slave address, NOT a 0-based index.
 * This must match the CSV data point naming (e.g., v_l1_1 for slave address 1)
 */
export function generateN720ReportTemplate(
  meterName: string,
  meterType: MeterType,
  slaveAddress: number
): Record<string, unknown> {
  const meterConfig = getMeterConfig('N720', meterType);
  if (!meterConfig) {
    console.error(`Meter type ${meterType} not supported on N720`);
    return {};
  }

  // Build the values object mapping field names to slave address suffixed variable names
  // This matches the CSV format where data points use slave address (e.g., v_l1_1 for slave 1)
  const values: Record<string, string> = {};
  for (const field of meterConfig.reportingFields) {
    values[field] = `${field}_${slaveAddress}`;
  }

  // N720 ThingsBoard format with timestamp
  return {
    [meterName]: [{
      ts: 'sys_timestamp_ms',
      values,
    }],
  };
}

/**
 * Merge multiple report templates into one
 * Used when adding a new meter to preserve existing report template
 */
export function mergeN720ReportTemplates(
  existingTemplate: Record<string, unknown>,
  newTemplate: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...existingTemplate,
    ...newTemplate,
  };
}

/**
 * Generate the edge_report JSON configuration for N720
 * This is the full configuration that needs to be uploaded to /upload/nv1 and /upload/nv2
 *
 * The format follows the N720 import/export JSON structure with tmpl_cont
 *
 * @param meters - Array of meter configurations
 * @param reportTopic - MQTT topic for reporting (without leading slash)
 * @param reportingInterval - Reporting period in seconds
 * @returns JSON string of the edge_report configuration
 */
export interface N720ReportGroupConfig {
  name: string;
  topic: string;
  period: number;
  template: Record<string, unknown>;
}

/**
 * Generate the tmpl_cont object for a meter
 * This creates the template content structure used in the report group
 * Format: { "MeterName": { "field": "field_slaveAddress", ... }, "time": "sys_local_time" }
 *
 * Note: The field suffix uses the Modbus slave address, NOT a 0-based index.
 * This must match the CSV data point naming (e.g., v_l1_1 for slave address 1)
 */
function generateN720TmplCont(
  meterName: string,
  meterType: MeterType,
  slaveAddress: number
): Record<string, unknown> {
  const meterConfig = getMeterConfig('N720', meterType);
  if (!meterConfig) {
    console.error(`Meter type ${meterType} not supported on N720`);
    return { time: 'sys_local_time' };
  }

  // Build the values object mapping field names to slave address suffixed variable names
  // This matches the CSV format where data points use slave address (e.g., v_l1_1 for slave 1)
  const meterValues: Record<string, string> = {};
  for (const field of meterConfig.reportingFields) {
    meterValues[field] = `${field}_${slaveAddress}`;
  }

  // Return the tmpl_cont structure
  return {
    [meterName]: meterValues,
    time: 'sys_local_time',
  };
}

export function generateN720EdgeReportConfig(
  meters: Array<{
    name: string;
    slaveAddress: number;
    meterType: MeterType;
  }>,
  reportTopic: string,
  reportingInterval: number = 60
): string {
  interface N720ReportGroup {
    name: string;
    link: string;
    topic: string;
    qos: number;
    retention: number;
    cond: {
      period: number;
      timed: {
        type: number;
        hh: number;
        mm: number;
      };
    };
    data_report_type: number;
    change_report_type: number;
    err_enable: number;
    err_info: string;
    tmpl_file: string;
    fkey_md5: string;
    ucld_node: string[];
    tmpl_cont: Record<string, unknown>;
  }

  const groups: N720ReportGroup[] = [];

  // Generate a report group for each meter
  for (let i = 0; i < meters.length; i++) {
    const meter = meters[i];
    // For report group name: sanitize and truncate (gateway requires 1-20 bytes, a-z/A-Z/0-9/_)
    const sanitizedForGateway = meter.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    // Limit to 13 chars to allow for "_report" suffix (7 chars) = 20 total
    const truncatedName = sanitizedForGateway.substring(0, 13);
    // Use Modbus slave address for the data point suffix (matches CSV naming convention)
    // Template content uses original meter name with spaces (MQTT payload, no restrictions)
    const tmplCont = generateN720TmplCont(meter.name, meter.meterType, meter.slaveAddress);

    // Clean topic (ensure no leading slash for this format)
    const cleanTopic = reportTopic.startsWith('/') ? reportTopic.substring(1) : reportTopic;

    groups.push({
      name: `${truncatedName}_report`,   // Group name: <MeterName>_report (max 20 chars)
      link: 'MQTT1',                      // Use MQTT1 channel
      topic: cleanTopic,                  // MQTT topic
      qos: 1,                             // QoS 1 (at-least-once)
      retention: 0,                       // No message retention
      cond: {
        period: reportingInterval,        // Reporting period in seconds
        timed: {
          type: 0,                        // Disabled
          hh: 0,
          mm: 0,
        },
      },
      data_report_type: 0,                // Primary type
      change_report_type: 0,              // No change reporting
      err_enable: 0,                      // Error reporting disabled
      err_info: 'error',                  // Error message placeholder
      tmpl_file: '',                      // No external template file
      fkey_md5: '00000000000000000000000000000000',  // Empty MD5
      ucld_node: [],                      // No cloud nodes
      tmpl_cont: tmplCont,                // Template content
    });
  }

  // The edge_report format expected by N720
  const edgeReport = {
    group: groups,
  };

  // Return as JSON string (the upload endpoint expects the raw JSON content)
  return JSON.stringify(edgeReport);
}

/**
 * Generate the link configuration for N720
 * This maps serial ports (Uart1, Uart2) to the edge computing function
 * The link config is critical - without it, the gateway returns "slave_link_info_error"
 *
 * @param ports - Array of port configurations (usually just Uart1)
 * @returns JSON string of the link configuration
 */
export function generateN720LinkConfig(
  ports: Array<{
    name: string;         // "Uart1" or "Uart2"
    proto: number;        // 1 = Modbus RTU
    baudRate: number;     // 9600
    dataBit: number;      // 8
    parity: number;       // 0 = None
    stopBit: number;      // 1
  }> = [{
    name: 'Uart1',
    proto: 1,
    baudRate: 9600,
    dataBit: 8,
    parity: 0,
    stopBit: 1,
  }]
): string {
  const links = ports.map(port => ({
    enable: 1,
    name: port.name,
    proto: port.proto,
    baud_rate: port.baudRate,
    data_bit: port.dataBit,
    parity: port.parity,
    stop_bit: port.stopBit,
    pack_len: 512,
    pack_time: 100,
  }));

  // The link format expected by N720
  const linkConfig = {
    link: links,
  };

  return JSON.stringify(linkConfig);
}

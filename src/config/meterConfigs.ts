/**
 * Power Meter Configuration Templates
 *
 * This file contains all the configurations for different power meter types
 * on different gateway types. Each meter type has:
 * - Data Acquisition config (for ctable)
 * - Reporting JSON template (for rtable.format[].template)
 */

// ============================================================================
// TYPES
// ============================================================================

export type GatewayType = 'N510' | 'N720' | 'DR134';

export type MeterType =
  | 'XMC34F'      // 3-phase meter for N510 and N720
  | 'PR01Mod'     // Single-phase meter for N510
  | 'EM4371'      // Energy meter for N510 and N720
  | 'Sfere720'    // Sfere meter for N720
  | 'EnergyNG9'   // Energy NG9 quality analyzer for N720
  | 'TAC4300';    // TAC meter for N720

export interface DataPointConfig {
  name: string;      // Base name without suffix
  functionCode: number;
  registerAddress: number;
  dataType: string;  // 'uint16', 'uint32(ABCD)', 'float32(ABCD)', etc.
  pollInterval: number;
  responseTimeout: number;
  decimals?: number;      // Decimal places at position 18 (default: 2)
  floatDecimals?: number; // Decimal places at position 5 for float types (default: 0)
}

export interface MeterConfig {
  meterType: MeterType;
  gatewayType: GatewayType;
  displayName: string;
  dataPoints: DataPointConfig[];
  reportingFields: string[];  // Fields to include in JSON reporting template
  hasTimestamp: boolean;      // Whether to include ts: sys_timestamp_ms
}

// ============================================================================
// N510 - XMC34F Configuration (CSV format)
// ============================================================================

const XMC34F_N510_DATA_POINTS: DataPointConfig[] = [
  { name: 'v_l1', functionCode: 3, registerAddress: 4096, dataType: 'uint32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'v_l2', functionCode: 3, registerAddress: 4098, dataType: 'uint32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'v_l3', functionCode: 3, registerAddress: 4100, dataType: 'uint32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'i_l1', functionCode: 3, registerAddress: 4102, dataType: 'uint32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'i_l2', functionCode: 3, registerAddress: 4104, dataType: 'uint32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'i_l3', functionCode: 3, registerAddress: 4106, dataType: 'uint32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'freq', functionCode: 3, registerAddress: 4134, dataType: 'uint16', pollInterval: 100, responseTimeout: 200 },
  { name: 'p_l1', functionCode: 3, registerAddress: 4140, dataType: 'uint32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'p_l2', functionCode: 3, registerAddress: 4142, dataType: 'uint32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'p_l3', functionCode: 3, registerAddress: 4144, dataType: 'uint32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'q_l1', functionCode: 3, registerAddress: 4149, dataType: 'uint32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'q_l2', functionCode: 3, registerAddress: 4151, dataType: 'uint32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'q_l3', functionCode: 3, registerAddress: 4153, dataType: 'uint32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'p_tot', functionCode: 3, registerAddress: 4116, dataType: 'uint32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'q_tot', functionCode: 3, registerAddress: 4118, dataType: 'uint32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 's_tot', functionCode: 3, registerAddress: 4120, dataType: 'uint32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'pf_tot', functionCode: 3, registerAddress: 4132, dataType: 'uint16', pollInterval: 100, responseTimeout: 100 },
  { name: 'e_tot', functionCode: 3, registerAddress: 4128, dataType: 'uint32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'e_q_tot', functionCode: 3, registerAddress: 4126, dataType: 'uint32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'p_sgn_tot', functionCode: 3, registerAddress: 4122, dataType: 'uint16', pollInterval: 100, responseTimeout: 100 },
  { name: 'q_sgn_tot', functionCode: 3, registerAddress: 4123, dataType: 'uint16', pollInterval: 100, responseTimeout: 100 },
  { name: 'p_sgn_l1', functionCode: 3, registerAddress: 4146, dataType: 'uint16', pollInterval: 100, responseTimeout: 100 },
  { name: 'p_sgn_l2', functionCode: 3, registerAddress: 4147, dataType: 'uint16', pollInterval: 100, responseTimeout: 100 },
  { name: 'p_sgn_l3', functionCode: 3, registerAddress: 4148, dataType: 'uint16', pollInterval: 100, responseTimeout: 100 },
  { name: 'q_sgn_l1', functionCode: 3, registerAddress: 4155, dataType: 'uint16', pollInterval: 100, responseTimeout: 100 },
  { name: 'q_sgn_l2', functionCode: 3, registerAddress: 4156, dataType: 'uint16', pollInterval: 100, responseTimeout: 100 },
  { name: 'q_sgn_l3', functionCode: 3, registerAddress: 4157, dataType: 'uint16', pollInterval: 100, responseTimeout: 100 },
  { name: 'pf_sgn_tot', functionCode: 3, registerAddress: 4133, dataType: 'uint16', pollInterval: 100, responseTimeout: 100 },
  { name: 'kta', functionCode: 3, registerAddress: 4608, dataType: 'uint16', pollInterval: 100, responseTimeout: 100 },
  { name: 'ktv', functionCode: 3, registerAddress: 4609, dataType: 'uint16', pollInterval: 100, responseTimeout: 100 },
];

const XMC34F_N510_REPORTING_FIELDS = [
  'v_l1', 'v_l2', 'v_l3', 'i_l1', 'i_l2', 'i_l3',
  'p_l1', 'p_l2', 'p_l3', 'freq', 'q_l1', 'q_l2', 'q_l3',
  'p_tot', 'q_tot', 's_tot', 'pf_tot', 'e_tot', 'e_q_tot',
  'pf_sgn_tot', 'p_sgn_tot', 'q_sgn_tot',
  'p_sgn_l1', 'p_sgn_l2', 'p_sgn_l3',
  'q_sgn_l1', 'q_sgn_l2', 'q_sgn_l3',
  'ktv', 'kta'
];

// ============================================================================
// N510 - PR01Mod Configuration (Single Phase)
// ============================================================================

const PR01MOD_N510_DATA_POINTS: DataPointConfig[] = [
  { name: 'v_l1', functionCode: 3, registerAddress: 20482, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'i_l1', functionCode: 3, registerAddress: 20492, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'freq', functionCode: 3, registerAddress: 20488, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'p_l1', functionCode: 3, registerAddress: 20498, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'q_l1', functionCode: 3, registerAddress: 20506, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 's_l1', functionCode: 3, registerAddress: 20514, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'pf_tot', functionCode: 3, registerAddress: 20522, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'e_tot', functionCode: 3, registerAddress: 24576, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'e_q_tot', functionCode: 3, registerAddress: 24612, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
];

const PR01MOD_N510_REPORTING_FIELDS = [
  'v_l1', 'i_l1', 'freq', 'p_l1', 'q_l1', 's_l1', 'pf_tot', 'e_tot', 'e_q_tot'
];

// ============================================================================
// N510 - EM4371 Configuration
// ============================================================================

const EM4371_N510_DATA_POINTS: DataPointConfig[] = [
  { name: 'v_l1_l2', functionCode: 3, registerAddress: 10, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'v_l3_l2', functionCode: 3, registerAddress: 12, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'v_l1_l3', functionCode: 3, registerAddress: 14, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'v_l1', functionCode: 3, registerAddress: 16, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'v_l2', functionCode: 3, registerAddress: 18, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'v_l3', functionCode: 3, registerAddress: 20, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'i_l1', functionCode: 3, registerAddress: 22, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'i_l2', functionCode: 3, registerAddress: 24, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'i_l3', functionCode: 3, registerAddress: 26, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'p_l1', functionCode: 3, registerAddress: 32, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'p_l2', functionCode: 3, registerAddress: 34, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'p_l3', functionCode: 3, registerAddress: 36, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'q_l1', functionCode: 3, registerAddress: 40, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'q_l2', functionCode: 3, registerAddress: 42, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'q_l3', functionCode: 3, registerAddress: 44, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 's_l1', functionCode: 3, registerAddress: 48, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 's_l2', functionCode: 3, registerAddress: 50, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 's_l3', functionCode: 3, registerAddress: 52, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'pf_l1', functionCode: 3, registerAddress: 56, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'pf_l2', functionCode: 3, registerAddress: 58, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'pf_l3', functionCode: 3, registerAddress: 60, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'e_tot', functionCode: 3, registerAddress: 352, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'pt_ratio', functionCode: 3, registerAddress: 65303, dataType: 'uint16', pollInterval: 100, responseTimeout: 100 },
  { name: 'ct_ratio', functionCode: 3, registerAddress: 65304, dataType: 'uint16', pollInterval: 100, responseTimeout: 100 },
  { name: 'freq', functionCode: 3, registerAddress: 78, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100 },
  { name: 'e_neg_tot', functionCode: 3, registerAddress: 358, dataType: 'float32(ABCD)', pollInterval: 200, responseTimeout: 100 },
  { name: 'wiring_mode', functionCode: 3, registerAddress: 65332, dataType: 'uint16', pollInterval: 100, responseTimeout: 200 },
];

const EM4371_N510_REPORTING_FIELDS = [
  'v_l1', 'v_l2', 'v_l3', 'v_l1_l2', 'v_l3_l2', 'v_l1_l3',
  'i_l1', 'i_l2', 'i_l3',
  'p_l1', 'p_l2', 'p_l3',
  'pf_l1', 'pf_l2', 'pf_l3',
  'freq', 'q_l1', 'q_l2', 'q_l3',
  's_l1', 's_l2', 's_l3',
  'e_tot', 'ct_ratio', 'pt_ratio', 'wiring_mode'
];

// ============================================================================
// N720 - XMC34F Configuration (V1.0 N7X0 format)
// ============================================================================

// N720 uses different format: SC lines for slave config, C lines for data points
// Format: C,DeviceName,FieldName,,DataType,Opt1,Opt2,...,RegisterAddr',Opt,...

const XMC34F_N720_DATA_POINTS: DataPointConfig[] = [
  // kta and ktv first (as per working CSV) - uint16 = dataType 4
  // Format: pos5=0 (floatDecimals), pos18=2 (decimals)
  { name: 'kta', functionCode: 3, registerAddress: 404609, dataType: 'uint16', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'ktv', functionCode: 3, registerAddress: 404610, dataType: 'uint16', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  // Main data points - float32(ABCD) = dataType 6, floatDecimals=0, decimals=2
  { name: 'v_l1', functionCode: 3, registerAddress: 404097, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'v_l2', functionCode: 3, registerAddress: 404099, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'v_l3', functionCode: 3, registerAddress: 404101, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'i_l1', functionCode: 3, registerAddress: 404103, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'i_l2', functionCode: 3, registerAddress: 404105, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'i_l3', functionCode: 3, registerAddress: 404107, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'freq', functionCode: 3, registerAddress: 404135, dataType: 'uint16', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'p_l1', functionCode: 3, registerAddress: 404141, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'p_l2', functionCode: 3, registerAddress: 404143, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'p_l3', functionCode: 3, registerAddress: 404145, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'q_l1', functionCode: 3, registerAddress: 404150, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'q_l2', functionCode: 3, registerAddress: 404152, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'q_l3', functionCode: 3, registerAddress: 404154, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'p_tot', functionCode: 3, registerAddress: 404117, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'q_tot', functionCode: 3, registerAddress: 404119, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 's_tot', functionCode: 3, registerAddress: 404121, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'pf_tot', functionCode: 3, registerAddress: 404133, dataType: 'uint16', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'e_tot', functionCode: 3, registerAddress: 404129, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'e_q_tot', functionCode: 3, registerAddress: 404127, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'p_sgn_tot', functionCode: 3, registerAddress: 404123, dataType: 'uint16', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'q_sgn_tot', functionCode: 3, registerAddress: 404124, dataType: 'uint16', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'p_sgn_l1', functionCode: 3, registerAddress: 404147, dataType: 'uint16', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'p_sgn_l2', functionCode: 3, registerAddress: 404148, dataType: 'uint16', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'p_sgn_l3', functionCode: 3, registerAddress: 404149, dataType: 'uint16', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'q_sgn_l1', functionCode: 3, registerAddress: 404156, dataType: 'uint16', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'q_sgn_l2', functionCode: 3, registerAddress: 404157, dataType: 'uint16', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'q_sgn_l3', functionCode: 3, registerAddress: 404158, dataType: 'uint16', pollInterval: 100, responseTimeout: 100, decimals: 2 },
  { name: 'pf_sgn_tot', functionCode: 3, registerAddress: 404134, dataType: 'uint16', pollInterval: 100, responseTimeout: 100, decimals: 2 },
];

const XMC34F_N720_REPORTING_FIELDS = [
  'kta', 'ktv',
  'v_l1', 'v_l2', 'v_l3', 'i_l1', 'i_l2', 'i_l3',
  'p_l1', 'p_l2', 'p_l3', 'freq', 'q_l1', 'q_l2', 'q_l3',
  'p_tot', 'q_tot', 's_tot', 'pf_tot', 'e_tot', 'e_q_tot',
  'pf_sgn_tot', 'p_sgn_tot', 'q_sgn_tot',
  'p_sgn_l1', 'p_sgn_l2', 'p_sgn_l3',
  'q_sgn_l1', 'q_sgn_l2', 'q_sgn_l3'
];

// ============================================================================
// N720 - EM4371 Configuration
// ============================================================================

const EM4371_N720_DATA_POINTS: DataPointConfig[] = [
  // float32 types have floatDecimals=2 at position 5, decimals=2 at position 18
  { name: 'v_l1', functionCode: 3, registerAddress: 300017, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200, decimals: 2, floatDecimals: 2 },
  { name: 'v_l2', functionCode: 3, registerAddress: 300019, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200, decimals: 2, floatDecimals: 2 },
  { name: 'v_l3', functionCode: 3, registerAddress: 300021, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200, decimals: 2, floatDecimals: 2 },
  { name: 'i_l1', functionCode: 3, registerAddress: 300023, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200, decimals: 2, floatDecimals: 2 },
  { name: 'i_l2', functionCode: 3, registerAddress: 300025, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200, decimals: 2, floatDecimals: 2 },
  { name: 'i_l3', functionCode: 3, registerAddress: 300027, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200, decimals: 2, floatDecimals: 2 },
  { name: 'p_l1', functionCode: 3, registerAddress: 300033, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200, decimals: 2, floatDecimals: 2 },
  { name: 'p_l2', functionCode: 3, registerAddress: 300035, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200, decimals: 2, floatDecimals: 2 },
  { name: 'p_l3', functionCode: 3, registerAddress: 300037, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200, decimals: 2, floatDecimals: 2 },
  { name: 'q_l1', functionCode: 3, registerAddress: 300041, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200, decimals: 2, floatDecimals: 2 },
  { name: 'q_l2', functionCode: 3, registerAddress: 300043, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200, decimals: 2, floatDecimals: 2 },
  { name: 'q_l3', functionCode: 3, registerAddress: 300045, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200, decimals: 2, floatDecimals: 2 },
  { name: 's_l1', functionCode: 3, registerAddress: 300049, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200, decimals: 2, floatDecimals: 2 },
  { name: 's_l2', functionCode: 3, registerAddress: 300051, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200, decimals: 2, floatDecimals: 2 },
  { name: 's_l3', functionCode: 3, registerAddress: 300053, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200, decimals: 2, floatDecimals: 2 },
  { name: 'pf_l1', functionCode: 3, registerAddress: 300057, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200, decimals: 2, floatDecimals: 2 },
  { name: 'pf_l2', functionCode: 3, registerAddress: 300059, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200, decimals: 2, floatDecimals: 2 },
  { name: 'pf_l3', functionCode: 3, registerAddress: 300061, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200, decimals: 2, floatDecimals: 2 },
  { name: 'freq', functionCode: 3, registerAddress: 300079, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200, decimals: 2, floatDecimals: 2 },
  { name: 'e_tot', functionCode: 3, registerAddress: 300365, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200, decimals: 2, floatDecimals: 2 },
  // uint16 types have floatDecimals=0 at position 5, decimals=2 at position 18
  { name: 'ct_ratio', functionCode: 3, registerAddress: 365305, dataType: 'uint16', pollInterval: 100, responseTimeout: 200, decimals: 2, floatDecimals: 0 },
  { name: 'pt_ratio', functionCode: 3, registerAddress: 365304, dataType: 'uint16', pollInterval: 100, responseTimeout: 200, decimals: 2, floatDecimals: 0 },
];

const EM4371_N720_REPORTING_FIELDS = [
  'v_l1', 'v_l2', 'v_l3', 'v_l1_l2', 'v_l3_l2', 'v_l1_l3',
  'i_l1', 'i_l2', 'i_l3',
  'p_l1', 'p_l2', 'p_l3',
  'pf_l1', 'pf_l2', 'pf_l3',
  'freq', 'q_l1', 'q_l2', 'q_l3',
  's_l1', 's_l2', 's_l3',
  'e_tot', 'ct_ratio', 'pt_ratio', 'wiring_mode'
];

// ============================================================================
// N720 - Sfere720 Configuration
// ============================================================================

const SFERE720_N720_DATA_POINTS: DataPointConfig[] = [
  { name: 'v_l1', functionCode: 3, registerAddress: 400007, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'v_l2', functionCode: 3, registerAddress: 400009, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'v_l3', functionCode: 3, registerAddress: 400011, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'i_l1', functionCode: 3, registerAddress: 400019, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'i_l2', functionCode: 3, registerAddress: 400021, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'i_l3', functionCode: 3, registerAddress: 400023, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'p_l1', functionCode: 3, registerAddress: 400027, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'p_l2', functionCode: 3, registerAddress: 400029, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'p_l3', functionCode: 3, registerAddress: 400031, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'p_tot', functionCode: 3, registerAddress: 400033, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'q_l1', functionCode: 3, registerAddress: 400035, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'q_l2', functionCode: 3, registerAddress: 400037, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'q_l3', functionCode: 3, registerAddress: 400039, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'q_tot', functionCode: 3, registerAddress: 400041, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 's_l1', functionCode: 3, registerAddress: 400043, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 's_l2', functionCode: 3, registerAddress: 400045, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 's_l3', functionCode: 3, registerAddress: 400047, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 's_tot', functionCode: 3, registerAddress: 400049, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'pf_l1', functionCode: 3, registerAddress: 400051, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'pf_l2', functionCode: 3, registerAddress: 400053, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'pf_l3', functionCode: 3, registerAddress: 400055, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'pf_tot', functionCode: 3, registerAddress: 400057, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'freq', functionCode: 3, registerAddress: 400059, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'e_tot', functionCode: 3, registerAddress: 400061, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'e_neg_tot', functionCode: 3, registerAddress: 400063, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'e_q_tot', functionCode: 3, registerAddress: 400065, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'e_q_neg_tot', functionCode: 3, registerAddress: 400067, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'e_l1', functionCode: 3, registerAddress: 400087, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'e_l2', functionCode: 3, registerAddress: 400089, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'e_l3', functionCode: 3, registerAddress: 400091, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'i_tot', functionCode: 3, registerAddress: 407107, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'i_max_l1', functionCode: 3, registerAddress: 407201, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'i_max_l2', functionCode: 3, registerAddress: 407203, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'i_max_l3', functionCode: 3, registerAddress: 407205, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'thd_v_l1', functionCode: 3, registerAddress: 407701, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'thd_v_l2', functionCode: 3, registerAddress: 407703, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'thd_v_l3', functionCode: 3, registerAddress: 407705, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'thd_i_l1', functionCode: 3, registerAddress: 407707, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'thd_i_l2', functionCode: 3, registerAddress: 407709, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'thd_i_l3', functionCode: 3, registerAddress: 407711, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
];

const SFERE720_N720_REPORTING_FIELDS = [
  'v_l1', 'v_l2', 'v_l3', 'i_l1', 'i_l2', 'i_l3', 'i_tot',
  'p_l1', 'p_l2', 'p_l3', 'p_tot', 'freq',
  'q_l1', 'q_l2', 'q_l3', 'q_tot',
  's_l1', 's_l2', 's_l3', 's_tot',
  'pf_l1', 'pf_l2', 'pf_l3', 'pf_tot',
  'e_l1', 'e_l2', 'e_l3', 'e_tot', 'e_q_tot',
  'thd_v_l1', 'thd_v_l2', 'thd_v_l3',
  'thd_i_l1', 'thd_i_l2', 'thd_i_l3'
];

// ============================================================================
// N720 - EnergyNG9 Configuration (9-channel quality analyzer)
// ============================================================================

const ENERGYNG9_N720_DATA_POINTS: DataPointConfig[] = [
  { name: 'v_l1', functionCode: 3, registerAddress: 407007, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'v_l2', functionCode: 3, registerAddress: 407009, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'v_l3', functionCode: 3, registerAddress: 407011, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'i_l1', functionCode: 3, registerAddress: 407013, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'i_l2', functionCode: 3, registerAddress: 407015, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'i_l3', functionCode: 3, registerAddress: 407017, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'i_l4', functionCode: 3, registerAddress: 407019, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'i_l5', functionCode: 3, registerAddress: 407021, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'i_l6', functionCode: 3, registerAddress: 407023, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'i_l7', functionCode: 3, registerAddress: 407025, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'i_l8', functionCode: 3, registerAddress: 407027, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'i_l9', functionCode: 3, registerAddress: 407029, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 's_l1', functionCode: 3, registerAddress: 407031, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 's_l2', functionCode: 3, registerAddress: 407033, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 's_l3', functionCode: 3, registerAddress: 407035, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 's_l4', functionCode: 3, registerAddress: 407037, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 's_l5', functionCode: 3, registerAddress: 407039, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 's_l6', functionCode: 3, registerAddress: 407041, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 's_l7', functionCode: 3, registerAddress: 407043, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 's_l8', functionCode: 3, registerAddress: 407045, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 's_l9', functionCode: 3, registerAddress: 407047, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'p_l1', functionCode: 3, registerAddress: 407049, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'p_l2', functionCode: 3, registerAddress: 407051, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'p_l3', functionCode: 3, registerAddress: 407053, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'p_l4', functionCode: 3, registerAddress: 407055, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'p_l5', functionCode: 3, registerAddress: 407057, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'p_l6', functionCode: 3, registerAddress: 407059, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'p_l7', functionCode: 3, registerAddress: 407061, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'p_l8', functionCode: 3, registerAddress: 407063, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'p_l9', functionCode: 3, registerAddress: 407065, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'q_l1', functionCode: 3, registerAddress: 407067, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'q_l2', functionCode: 3, registerAddress: 407069, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'q_l3', functionCode: 3, registerAddress: 407071, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'pf_l1', functionCode: 3, registerAddress: 407085, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'pf_l2', functionCode: 3, registerAddress: 407087, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'pf_l3', functionCode: 3, registerAddress: 407089, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'i_tot', functionCode: 3, registerAddress: 407107, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 's_tot', functionCode: 3, registerAddress: 407113, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'p_tot', functionCode: 3, registerAddress: 407119, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'freq', functionCode: 3, registerAddress: 407137, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'e_l1', functionCode: 3, registerAddress: 407501, dataType: 'uint32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'e_l2', functionCode: 3, registerAddress: 407513, dataType: 'uint32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'e_l3', functionCode: 3, registerAddress: 407525, dataType: 'uint32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'e_tot', functionCode: 3, registerAddress: 407609, dataType: 'uint32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'e_neg_tot', functionCode: 3, registerAddress: 407611, dataType: 'uint32(ABCD)', pollInterval: 100, responseTimeout: 200 },
];

const ENERGYNG9_N720_REPORTING_FIELDS = [
  'v_l1', 'v_l2', 'v_l3',
  'i_l1', 'i_l2', 'i_l3', 'i_l4', 'i_l5', 'i_l6', 'i_l7', 'i_l8', 'i_l9', 'i_tot',
  's_l1', 's_l2', 's_l3', 's_l4', 's_l5', 's_l6', 's_l7', 's_l8', 's_l9', 's_tot',
  'p_l1', 'p_l2', 'p_l3', 'p_l4', 'p_l5', 'p_l6', 'p_l7', 'p_l8', 'p_l9', 'p_tot',
  'q_l1', 'q_l2', 'q_l3',
  'pf_l1', 'pf_l2', 'pf_l3',
  'freq',
  'e_l1', 'e_l2', 'e_l3', 'e_tot', 'e_neg_tot'
];

// ============================================================================
// N720 - TAC4300 Configuration
// ============================================================================

const TAC4300_N720_DATA_POINTS: DataPointConfig[] = [
  { name: 'v_l1', functionCode: 3, registerAddress: 300001, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'v_l2', functionCode: 3, registerAddress: 300003, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'v_l3', functionCode: 3, registerAddress: 300005, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'i_l1', functionCode: 3, registerAddress: 300007, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'i_l2', functionCode: 3, registerAddress: 300009, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'i_l3', functionCode: 3, registerAddress: 300011, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'p_l1', functionCode: 3, registerAddress: 300013, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'p_l2', functionCode: 3, registerAddress: 300015, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'p_l3', functionCode: 3, registerAddress: 300017, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'q_l1', functionCode: 3, registerAddress: 300019, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'q_l2', functionCode: 3, registerAddress: 300021, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'q_l3', functionCode: 3, registerAddress: 300023, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 's_l1', functionCode: 3, registerAddress: 300025, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 's_l2', functionCode: 3, registerAddress: 300027, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 's_l3', functionCode: 3, registerAddress: 300029, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'pf_l1', functionCode: 3, registerAddress: 300031, dataType: 'int16', pollInterval: 100, responseTimeout: 200 },
  { name: 'pf_l2', functionCode: 3, registerAddress: 300032, dataType: 'int16', pollInterval: 100, responseTimeout: 200 },
  { name: 'pf_l3', functionCode: 3, registerAddress: 300033, dataType: 'int16', pollInterval: 100, responseTimeout: 200 },
  { name: 'freq', functionCode: 3, registerAddress: 300043, dataType: 'uint16', pollInterval: 100, responseTimeout: 200 },
  { name: 'p_tot', functionCode: 3, registerAddress: 300045, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 's_tot', functionCode: 3, registerAddress: 300049, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'i_tot', functionCode: 3, registerAddress: 300053, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'i_max_l1', functionCode: 3, registerAddress: 300131, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'i_max_l2', functionCode: 3, registerAddress: 300133, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'i_max_l3', functionCode: 3, registerAddress: 300135, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'e_l1', functionCode: 3, registerAddress: 301057, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'e_l2', functionCode: 3, registerAddress: 301059, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'e_l3', functionCode: 3, registerAddress: 301061, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'e_tot', functionCode: 3, registerAddress: 407609, dataType: 'uint32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'e_neg_tot', functionCode: 3, registerAddress: 407611, dataType: 'uint32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'thd_v_l1', functionCode: 3, registerAddress: 407701, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'thd_v_l2', functionCode: 3, registerAddress: 407703, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'thd_v_l3', functionCode: 3, registerAddress: 407705, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'thd_i_l1', functionCode: 3, registerAddress: 407707, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'thd_i_l2', functionCode: 3, registerAddress: 407709, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
  { name: 'thd_i_l3', functionCode: 3, registerAddress: 407711, dataType: 'float32(ABCD)', pollInterval: 100, responseTimeout: 200 },
];

const TAC4300_N720_REPORTING_FIELDS = [
  'v_l1', 'v_l2', 'v_l3', 'i_l1', 'i_l2', 'i_l3', 'i_tot',
  'p_l1', 'p_l2', 'p_l3', 'p_tot', 'freq',
  'q_l1', 'q_l2', 'q_l3',
  's_l1', 's_l2', 's_l3', 's_tot',
  'pf_l1', 'pf_l2', 'pf_l3',
  'e_l1', 'e_l2', 'e_l3', 'e_tot', 'e_neg_tot',
  'i_max_l1', 'i_max_l2', 'i_max_l3',
  'thd_v_l1', 'thd_v_l2', 'thd_v_l3',
  'thd_i_l1', 'thd_i_l2', 'thd_i_l3'
];

// ============================================================================
// METER CONFIGURATIONS REGISTRY
// ============================================================================

export const METER_CONFIGS: MeterConfig[] = [
  // N510 Meters
  {
    meterType: 'XMC34F',
    gatewayType: 'N510',
    displayName: 'XMC34F (3-Phase)',
    dataPoints: XMC34F_N510_DATA_POINTS,
    reportingFields: XMC34F_N510_REPORTING_FIELDS,
    hasTimestamp: false,
  },
  {
    meterType: 'PR01Mod',
    gatewayType: 'N510',
    displayName: 'PR01Mod (Single Phase)',
    dataPoints: PR01MOD_N510_DATA_POINTS,
    reportingFields: PR01MOD_N510_REPORTING_FIELDS,
    hasTimestamp: false,
  },
  {
    meterType: 'EM4371',
    gatewayType: 'N510',
    displayName: 'EM4371 (Energy Meter)',
    dataPoints: EM4371_N510_DATA_POINTS,
    reportingFields: EM4371_N510_REPORTING_FIELDS,
    hasTimestamp: false,
  },
  // N720 Meters
  {
    meterType: 'XMC34F',
    gatewayType: 'N720',
    displayName: 'XMC34F (3-Phase)',
    dataPoints: XMC34F_N720_DATA_POINTS,
    reportingFields: XMC34F_N720_REPORTING_FIELDS,
    hasTimestamp: true,
  },
  {
    meterType: 'EM4371',
    gatewayType: 'N720',
    displayName: 'EM4371 (Energy Meter)',
    dataPoints: EM4371_N720_DATA_POINTS,
    reportingFields: EM4371_N720_REPORTING_FIELDS,
    hasTimestamp: true,
  },
  {
    meterType: 'Sfere720',
    gatewayType: 'N720',
    displayName: 'Sfere720 (Quality Meter)',
    dataPoints: SFERE720_N720_DATA_POINTS,
    reportingFields: SFERE720_N720_REPORTING_FIELDS,
    hasTimestamp: true,
  },
  {
    meterType: 'EnergyNG9',
    gatewayType: 'N720',
    displayName: 'Energy-NG9 (9-Channel)',
    dataPoints: ENERGYNG9_N720_DATA_POINTS,
    reportingFields: ENERGYNG9_N720_REPORTING_FIELDS,
    hasTimestamp: false,
  },
  {
    meterType: 'TAC4300',
    gatewayType: 'N720',
    displayName: 'TAC4300',
    dataPoints: TAC4300_N720_DATA_POINTS,
    reportingFields: TAC4300_N720_REPORTING_FIELDS,
    hasTimestamp: true,
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get meter configuration for a specific gateway and meter type
 */
export function getMeterConfig(gatewayType: GatewayType, meterType: MeterType): MeterConfig | undefined {
  return METER_CONFIGS.find(
    config => config.gatewayType === gatewayType && config.meterType === meterType
  );
}

/**
 * Get all meter types available for a specific gateway type
 */
export function getAvailableMeterTypes(gatewayType: GatewayType): MeterConfig[] {
  return METER_CONFIGS.filter(config => config.gatewayType === gatewayType);
}

/**
 * Detect gateway type from model name
 */
export function detectGatewayType(modelName: string): GatewayType {
  const upperModel = modelName.toUpperCase();
  if (upperModel.includes('N720') || upperModel.includes('N7X0')) {
    return 'N720';
  }
  if (upperModel.includes('N510')) {
    return 'N510';
  }
  if (upperModel.includes('DR134')) {
    return 'DR134';
  }
  // Default to N510 if unknown
  return 'N510';
}

/**
 * Get data type code for N720 format
 * Maps our data type strings to N720's numeric codes
 *
 * N720 Data Type Codes:
 * 4 = 16 Bit Unsigned (uint16)
 * 5 = 16 Bit Signed (int16)
 * 6 = 32 Bit Float ABCD (float32)
 * 7 = 32 Bit Float CDAB
 * 8 = 32 Bit Float BADC
 * 9 = 32 Bit Float DCBA
 * 10 = 32 Bit Unsigned ABCD (uint32)
 */
export function getN720DataTypeCode(dataType: string): number {
  const typeMap: Record<string, number> = {
    'uint16': 4,
    'int16': 5,
    'float32(ABCD)': 6,
    'float32(CDAB)': 7,
    'float32(BADC)': 8,
    'float32(DCBA)': 9,
    'uint32(ABCD)': 10,
  };
  return typeMap[dataType] || 4;
}

/**
 * Format register address for N720
 * N720 uses format like 404097' (with trailing apostrophe)
 */
export function formatN720RegisterAddress(address: number): string {
  return `${address}'`;
}

/**
 * Infer meter type from data point count for a specific gateway type.
 * Returns the best matching meter type, or undefined if no match.
 * This is useful when loading existing configurations where the meter type
 * is not stored (e.g., N720 CSV format).
 */
export function inferMeterTypeFromDataPointCount(
  gatewayType: GatewayType,
  dataPointCount: number
): MeterType | undefined {
  const availableMeters = getAvailableMeterTypes(gatewayType);

  // First, try exact match
  const exactMatch = availableMeters.find(m => m.dataPoints.length === dataPointCount);
  if (exactMatch) {
    return exactMatch.meterType;
  }

  // If no exact match, find the closest match (for cases where some data points might be missing)
  let closestMatch: MeterConfig | undefined;
  let closestDiff = Infinity;

  for (const meter of availableMeters) {
    const diff = Math.abs(meter.dataPoints.length - dataPointCount);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestMatch = meter;
    }
  }

  // Only return closest match if it's reasonably close (within 5 data points)
  if (closestMatch && closestDiff <= 5) {
    return closestMatch.meterType;
  }

  return undefined;
}

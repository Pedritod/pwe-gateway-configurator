// Gateway discovery response
export interface DiscoveredGateway {
  ip: string;
  mac: string;
  model: string;
  firmware: string;
  sameSubnet?: boolean;  // Whether the gateway is on the same subnet as this computer
  gatewayType?: 'N510' | 'N720' | 'unknown';  // Type of gateway detected
}

// Device definition from define.json
export interface GatewayDefine {
  change: string;
  ver: string;
  modename: string;
  devicename: string;
  usermac: string;
  devicetype: string;
}

// Runtime status from temp.json
export interface GatewayTemp {
  currgip: string;
  curripcn: string;
  dnsmain: string;
  dnsspare: string;
  usermac: string;
  runtime: string;
  portmax: string;
  port_num: string;
  txcounta: string;
  txcountb: string;
  rxcounta: string;
  rxcountb: string;
  constatea: string;
  constateb: string;
  portview: string;
  dnsanalysis: string;
  dnsanalysisb: string;
  runserialmode: string;
  hardserialmode: string;
  listdisplay: string;
  websocketnum: string;
  mclient: string;
  min_baud: string;
  max_baud: string;
  language: string;
  socketca: string;
  mqttca: string;
  alica: string;
  awsca: string;
  webca: string;
  webjump: string;
  mqttconns: string;
  edgeconns: string;
  edgeways: string;
  edge_usr_sta: string;
  reboot_percent: string;
  maap: string;
  https_en: string;
  edge_en: string;
}

// System settings from misc.json
export interface GatewayMisc {
  change: string;
  languag: string;
  cus_ver: string;
  username: string;
  password: string;
  resettime: string;
  webport: string;
  websockport: string;
  websocklogport: string;
  websocketpoint: string;
  weblogen: string;
  portmax: string;
  portview: string;
  echo: string;
  seachport: string;
  seachkey: string;
  cachebuf: string;
  dbg_limit: string;
  log_limit: string;
  log_imm_limit: string;
  snmpen: string;
  telneten: string;
  telnetport: string;
  ntpen: string;
  ntpurl: string;
  ntputc: string;
  f485_en: string;
  f485_t: string;
  https_en: string;
  webport_ssl: string;
}

// IP configuration from ipconfig.json
export interface GatewayIPConfig {
  change: string;
  staticip: string;
  statdns: string;
  sip: string;
  gip: string;
  mip: string;
  dip: string;
  sdip: string;
}

// MQTT configuration from mqttbase.json
export interface GatewayMQTT {
  change: string;
  mqtten: string;
  mqttver: string;
  addr: string;
  sslm: string;
  sslv: string;
  lpt: string;
  rpt: string;
  ka: string;
  rctime: string;
  ndtrct: string;
  cs: string;
  cid: string;
  mqv: string;
  usr: string;
  pwd: string;
  wf: string;
  wtop: string;
  wmsg: string;
  wqos: string;
  wrtd: string;
  hosten: string;
  hostname: string;
}

// Edge computing config from econfig.json
export interface GatewayEConfig {
  change: string;
  edgeen: string;
  inqu_en: string;
  inqu_m: string;
  inqu_t: string;
  inqu_qos: string;
}

// Data point in edge.json
export interface EdgeDataPoint {
  key: number;
  name: string;
  type: number;
  range: null | number[];
  defv: number;
  addr: string;
  rw: number;
  ct: number;
  to: number;
}

// Slave/device in ctable
export interface EdgeCtableEntry {
  key: number;
  name: string;
  prot: string;
  port: [string, number, number]; // ["uart", 1, slaveAddr]
  group: number;
  ct: number;
  datas: EdgeDataPoint[];
}

// Report data entry
export interface EdgeRtableData {
  key: number;
  name: string;
  rid: number[];
  sid: number;
  tid: number;
  fid: number;
}

// Template entry - maps field name to data point reference
export interface MeterTemplateEntry {
  [fieldName: string]: string; // e.g., "v_l1": "v_l1_0"
}

// Format entry in rtable
// N510 uses a FLAT template structure: { "v_l1": "v_l1_0", "v_l2": "v_l2_0" }
// N720 may use nested structure: { "MeterName": { "ts": "...", "values": {...} } }
export interface EdgeRtableFormat {
  topic?: string;
  type: number;
  template: {
    [key: string]: string | MeterTemplateEntry | MeterTemplateEntry[];
  };
}

// Full edge.json structure
export interface EdgeConfig {
  version?: string;
  stamp: number;
  ctable: EdgeCtableEntry[];
  rtable: {
    server?: string[];
    topics?: string[];
    qos?: number;
    format: EdgeRtableFormat[];
    rules: Array<{ type: number; period?: number; nature?: string }>;
    datas: EdgeRtableData[];
  };
}

// Port configuration from port0.json
export interface GatewayPortConfig {
  change: string;
  rfc2217: string;
  presett: string;
  poll: string;
  polltime: string;
  pollinter: string;
  atecho: string;
  cachedata: string;
  typ1: string;
  mbt1: string;
  sri: string;
  echo: string;
  netpr: string;
  phearten: string;
  phearthex: string;
  pheartasc: string;
  pheartdata: string;
  phearttime: string;
  nhearten: string;
  nhearthex: string;
  nheartasc: string;
  nheartdata: string;
  nhearttime: string;
  regen: string;
  regdatatype: string;
  regsendtype: string;
  reghex: string;
  regasc: string;
  regdata: string;
  mode: string;
  buad: string;
  datasize: string;
  parity: string;
  stopbit: string;
  flowc: string;
  packtime: string;
  packlen: string;
  serialmode: string;
  workmodea: string;
  sockmode: string;
  lport: string;
  lports: string;
  rporta: string;
  rurl: string;
  rip: string;
  maxclient: string;
  overclient: string;
  shortcontime: string;
  reconnecttime: string;
  modbuscache: string;
  modbusack: string;
  udpcheckport: string;
  httptype: string;
  rmhead: string;
  url: string;
  packhead: string;
  waittime: string;
  clouden: string;
  cloudtype: string;
  deviceid: string;
  cloudpasw: string;
  cloudres: string;
  workmodeb: string;
  lportb: string;
  rportb: string;
  rurlb: string;
  ripb: string;
  sslm: string;
  sslv: string;
  hosten: string;
  hostname: string;
}

// Combined gateway status for UI display
export interface GatewayStatus {
  connected: boolean;
  ip: string;
  define?: GatewayDefine;
  temp?: GatewayTemp;
  misc?: GatewayMisc;
  ipConfig?: GatewayIPConfig;
  mqtt?: GatewayMQTT;
  econfig?: GatewayEConfig;
  edge?: EdgeConfig;
  port0?: GatewayPortConfig;
}

// Energy meter representation for UI
export interface EnergyMeter {
  name: string;
  index: number; // The _N suffix
  slaveAddress: number;
  dataPoints: string[];
}

// Add meter request
export interface AddMeterRequest {
  name: string;
  slaveAddress: number;
}

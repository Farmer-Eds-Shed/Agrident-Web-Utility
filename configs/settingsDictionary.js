// Agrident AWR250 parameter dictionary.
// Source: MobileReaders-ASCII-Protocol-2020-03-19.pdf, pages 44-47.
// Numeric values are device protocol values, not array positions.
// A missing options list means the setting needs a free-text/range editor or further documentation.
export const SETTINGS_DICTIONARY = {
  tag_download_format: { label: "Tag Download Format", command: "tagformat", options: { "0": "ISO long (default)", "1": "Short ASCII 15 (HerdApp)", "2": "Short ASCII 16", "3": "NLIS", "4": "ISO 24631", "5": "HEX" } },
  read_mode: { label: "Read Mode", gId: 5, pId: 16, options: { "3": "Single Read", "4": "Continuous Read", "5": "Auto (Single/Continuous)" } },
  single_read_time: { label: "Single Read Time (seconds)", gId: 5, pId: 1, min: 1, max: 255 },
  continuous_read_time: { label: "Continuous Read Time (seconds)", gId: 5, pId: 17, min: 1, max: 255 },
  check_doublereads: { label: "Check for Double Reads", gId: 5, pId: 19, min: 1, max: 10000 },
  transponder_types: { label: "Transponder Types", gId: 5, pId: 18, flags: { "1": "FDX-B", "2": "HDX", "4": "H4002" } },
  sync_mode: { label: "Wireless Sync", gId: 5, pId: 3, options: { "0": "Off", "1": "On" } },
  online_mode: { label: "Online Mode", gId: 6, pId: 20, options: { "0": "Off", "1": "On" } },
  online_output_format: { label: "Online Output Format", gId: 6, pId: 19, options: { "1": "ASCII", "2": "Byte structure", "3": "Compact coding", "4": "ISO 24631", "6": "Raw data", "7": "Short ASCII 15", "8": "NLIS", "9": "Custom Format", "23": "Short ASCII 16", "33": "ASCII + SCP" } },
  send_double_reads: { label: "Send Double Reads (online)", gId: 6, pId: 23, options: { "1": "Do not send", "2": "Always send", "3": "Send if different from previous tag" } },
  bt_mode: { label: "Bluetooth Mode", gId: 32, pId: 1, connectionSensitive: true, options: { "0": "Off", "1": "Master", "2": "Slave" } },
  bt_profile: { label: "Bluetooth Profile", gId: 32, pId: 21, connectionSensitive: true, options: { "0": "SPP", "1": "iAP", "2": "HID", "3": "BLE", "4": "HID smart" } },
  bt_passkey: { label: "Bluetooth Passkey", gId: 32, pId: 20, sensitive: true, minLength: 1, maxLength: 8 },
  bt_peer_address: { label: "Bluetooth Peer Address", gId: 32, pId: 22, sensitive: true, pattern: "^[0-9a-fA-F]{12}$" },
  bt_baud: { label: "Bluetooth Baud Rate", gId: 32, pId: 3, connectionSensitive: true, options: { "0": "9600", "1": "19200", "3": "38400", "4": "57600", "5": "115200" } },
  scale_type: { label: "Scale Type", gId: 33, pId: 1, options: { "0": "Tell", "1": "Iconix FX15", "2": "Tru-Test XR3000", "3": "BWT", "4": "Gallagher", "5": "Dini Argeo DFWLB", "6": "Te Pari", "7": "RHEWA 82c-2", "8": "CIMA-PTM", "9": "Gallagher W-1/TW", "10": "Tru-Test S3 (BLE)", "11": "Gallagher W-0 (BLE)" } },
  scale_interface: { label: "Scale Interface", gId: 33, pId: 2, options: { "0": "RS232", "1": "Bluetooth" } },
  scale_baud: { label: "Scale Baud Rate", gId: 33, pId: 3, options: { "0": "300", "1": "600", "2": "1200", "3": "2400", "4": "4800", "5": "9600", "6": "19200", "7": "28800", "8": "38400", "9": "57600", "10": "115200" } },
  eid_display_format: { label: "EID Display Format", gId: 7, pId: 14, options: { "0": "Numeric (3-digit country code)", "16": "HEX", "32": "Alphanumeric (2-letter country code)" } },
  non_storage_mode: { label: "Non-storage Mode", gId: 7, pId: 69, options: { "0": "Off (store readings)", "1": "On (do not store)" } },
  audio_volume: { label: "Audio Volume", gId: 7, pId: 20, options: { "0":"Mute","20":"20%","40":"40%","60":"60%","80":"80%","100":"100%" } },
  vibrator_enabled: { label: "Vibrator", gId: 7, pId: 68, options: { "0":"Off","1":"On" } },
  switch_off_time: { label: "Automatic Switch-off (seconds)", gId: 7, pId: 5, min: 5, max: 3600 },
  show_tag_time: { label: "Show Tag Time (seconds)", gId: 7, pId: 67, min: 1, max: 255 },
  display_vid_big: { label: "Display VID Large", gId: 7, pId: 7, options: { "0":"Normal VID / Large EID","1":"Large VID / Normal EID" } },
  no_animal_tag_warning: { label: "Animal Flag Warning", gId: 7, pId: 13, options: { "0":"Ignore","1":"Warn" } },
  read_if_connected: { label: "Read If Connected", gId: 7, pId: 21, options: { "0":"Always allow reading","1":"Block when online buffer full" } },
  display_language: { label: "Display Language Table", gId: 7, pId: 1, min: 0, max: 9 },
  display_codepage: { label: "Display Codepage", gId: 1, pId: 11, options: { "0":"Latin (Win1252)","1":"Greek (Win1253)","2":"Cyrillic (Win1251)","3":"Turkish (Win1254)" } },
  time_format: { label: "Time Format", gId: 7, pId: 10, options: { "0":"AM/PM","1":"24-hour" } },
  date_format: { label: "Date Format", gId: 7, pId: 11, options: { "0":"MM/DD/YY","1":"DD.MM.YY" } },
  display_colors: { label: "Display Colors", gId: 7, pId: 64, options: { "0":"Black","1":"White" } },
  iso_start_character: { label: "ISO 24631 Start Character (ASCII)", gId: 6, pId: 11, min: 0, max: 255 },
  rs232_baud: { label: "RS232 Baud Rate", gId: 6, pId: 17, options: { "0":"9600","1":"19200","2":"38400","3":"57600","4":"115200" } },
  bt_hid_suffix: { label: "Bluetooth HID Suffix", gId: 6, pId: 24, options: { "0":"None","1":"Carriage Return" } },
  printer_type: { label: "Printer Type", gId: 50, pId: 128, options: { "0":"Generic","1":"Able AP1300","2":"Extech APEX 2","3":"Extech APEX 3","4":"Extech APEX 4","5":"Zebra QL220","6":"Zebra QL320","7":"Zebra QL420","8":"Zebra QLN220","9":"Zebra QLN320","10":"Zebra QLN420","11":"Martel MCP7880","12":"MTP-3" } },
  printer_interface: { label: "Printer Interface", gId: 50, pId: 129, options: { "0":"RS232","1":"Bluetooth" } },
  printer_baud: { label: "Printer Baud Rate", gId: 50, pId: 130, options: { "0":"300","1":"600","2":"1200","3":"2400","4":"4800","5":"9600","6":"19200","7":"28800","8":"38400","9":"57600","10":"115200" } },
  printer_format_flags: { label: "Printer Format Flags", gId: 50, pId: 132, flags: { "1":"Tag counter","2":"Hex tag","4":"Country code","8":"Animal flag","16":"Tag type","32":"Time","64":"Date","128":"Extra space","256":"Indent","512":"Auto tear-off","65536":"Two-letter country" } },
  printer_separator: { label: "Printer Separator (ASCII)", gId: 50, pId: 133, min: 0, max: 255 },
  printer_line_start: { label: "Printer Line Start (ASCII)", gId: 50, pId: 134, min: 0, max: 255 },
  printer_tearoff_interval: { label: "Printer Tear-off Interval", gId: 50, pId: 135, min: 0, max: 75 },
  printer_indentation: { label: "Printer Indentation Spaces", gId: 50, pId: 136, min: 0, max: 255 },
  printer_font_size: { label: "Printer Font Size", gId: 50, pId: 137, options: { "0":"Smallest","1":"1","2":"2","3":"Largest" } },
  printer_line_width: { label: "Printer Tear-off Width", gId: 50, pId: 138, min: 8, max: 72 },
  printer_header_1: { label: "Printer Header 1", gId: 50, pId: 144 },
  printer_header_2: { label: "Printer Header 2", gId: 50, pId: 145 },
  printer_header_3: { label: "Printer Header 3", gId: 50, pId: 146 },
  printer_header_4: { label: "Printer Header 4", gId: 50, pId: 147 },
  printer_header_5: { label: "Printer Header 5", gId: 50, pId: 148 },
  printer_header_6: { label: "Printer Header 6", gId: 50, pId: 149 },
  printer_footer_1: { label: "Printer Footer 1", gId: 50, pId: 150 },
  printer_footer_2: { label: "Printer Footer 2", gId: 50, pId: 151 },
  printer_bt_address: { label: "Printer Bluetooth Address", gId: 50, pId: 159, sensitive: true, pattern: "^[0-9a-fA-F]{12}$" },
  wlan_auth: { label: "WLAN Authentication", gId: 48, pId: 2, options: { "0":"None","3":"WPA2" }, connectionSensitive: true },
  wlan_protocol: { label: "WLAN Protocol", gId: 48, pId: 3, options: { "0":"UDP","1":"TCP Server","2":"TCP Client" }, connectionSensitive: true },
  wlan_baud: { label: "WLAN Baud Rate", gId: 48, pId: 4, options: { "9600":"9600","19200":"19200","38400":"38400","57600":"57600","115200":"115200" } },
  wlan_ssid: { label: "WLAN SSID", gId: 48, pId: 21, maxLength: 32, sensitive: true, connectionSensitive: true },
  wlan_passphrase: { label: "WLAN Passphrase", gId: 48, pId: 22, maxLength: 63, sensitive: true, connectionSensitive: true },
  wlan_mode: { label: "WLAN Mode", gId: 48, pId: 128, options: { "0":"Off","1":"Station","2":"Access Point" }, connectionSensitive: true },
  wlan_local_port: { label: "WLAN Local Port", gId: 48, pId: 129, min: 0, max: 65535 },
  wlan_local_ip: { label: "WLAN Local IP", gId: 48, pId: 130, pattern: "^\\d{1,3}(\\.\\d{1,3}){3}$" },
  wlan_host_port: { label: "WLAN Host Port", gId: 48, pId: 131, min: 0, max: 65535 },
  wlan_host_ip: { label: "WLAN Host IP", gId: 48, pId: 132, pattern: "^\\d{1,3}(\\.\\d{1,3}){3}$" },
  wlan_gateway: { label: "WLAN Gateway", gId: 48, pId: 133, pattern: "^\\d{1,3}(\\.\\d{1,3}){3}$" },
  wlan_netmask: { label: "WLAN Netmask", gId: 48, pId: 135, pattern: "^\\d{1,3}(\\.\\d{1,3}){3}$" },
  wlan_dhcp: { label: "WLAN DHCP", gId: 48, pId: 138, options: { "0":"Disabled","1":"Enabled" } },
};

export function describeSettingValue(key, value) {
  const def = SETTINGS_DICTIONARY[key];
  const raw = String(value ?? "");
  if (!def) return raw;
  if (def.sensitive) return raw ? "(device-specific)" : "";
  if (def.options) return def.options[raw] ?? raw;
  if (def.flags) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) return raw;
    const knownMask = Object.keys(def.flags).reduce((m, bit) => m | Number(bit), 0);
    if ((n & ~knownMask) !== 0) return raw;
    return Object.entries(def.flags).filter(([bit]) => (n & Number(bit)) !== 0).map(([, name]) => name).join(" + ") || "None";
  }
  return raw;
}

export function validateSettingValue(key, value) {
  const def = SETTINGS_DICTIONARY[key];
  if (!def) return "Unknown setting";
  const raw = String(value ?? "").trim();
  if (!raw) return "Value is required";
  if (def.options && !Object.hasOwn(def.options, raw)) return "Unsupported value";
  if (def.min != null || def.max != null) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < (def.min ?? -Infinity) || n > (def.max ?? Infinity)) return "Outside supported range";
  }
  if (def.minLength != null && raw.length < def.minLength) return "Value too short";
  if (def.maxLength != null && raw.length > def.maxLength) return "Value too long";
  if (def.pattern && !(new RegExp(def.pattern)).test(raw)) return "Invalid format";
  if (def.flags) {
    const n = Number(raw);
    const mask = Object.keys(def.flags).reduce((m, bit) => m | Number(bit), 0);
    if (!Number.isInteger(n) || n < 0 || (n & ~mask) !== 0) return "Invalid bitmask";
  }
  return null;
}

// Agrident AWR250 parameter dictionary.
// Source: MobileReaders-ASCII-Protocol-2020-03-19.pdf, pages 44-47.
// Numeric values are device protocol values, not array positions.
// A missing options list means the setting needs a free-text/range editor or further documentation.
export const SETTINGS_DICTIONARY = {
  tag_download_format: { label: "Tag Download Format", command: "tagformat" },
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
  scale_type: { label: "Scale Type", gId: 33, pId: 1, options: { "0": "Tell", "1": "Iconix FX15", "2": "Tru-Test XR3000", "4": "BWT", "5": "Gallagher", "6": "Dini Argeo DFWLB", "7": "Te Pari" } },
  scale_interface: { label: "Scale Interface", gId: 33, pId: 2, options: { "0": "RS232", "1": "Bluetooth" } },
  scale_baud: { label: "Scale Baud Rate", gId: 33, pId: 3, options: { "0": "300", "1": "600", "2": "1200", "3": "2400", "4": "4800", "5": "9600", "6": "19200", "7": "28800", "8": "38400", "9": "57600", "10": "115200" } },
  eid_display_format: { label: "EID Display Format", gId: 7, pId: 14, options: { "0": "Numeric (3-digit country code)", "16": "HEX", "32": "Alphanumeric (2-letter country code)" } },
  non_storage_mode: { label: "Non-storage Mode", gId: 7, pId: 69, options: { "0": "Off (store readings)", "1": "On (do not store)" } }
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

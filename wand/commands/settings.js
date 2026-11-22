import { validateSettingValue } from "../../configs/settingsDictionary.js";
// wand/commands/settings.js
// IMPORTANT: XSPARV replies are seen as [XSPARVOK] in Agri-Link capture (note the V).

export const SETTINGS_HEADERS = ["Key", "Label", "Value"];

export const SETTINGS_DEFAULT_DEFS = [
  { key: "tag_download_format", label: "Tag Download Format (XSTAGFORMAT)", kind: "tagformat" },

  { key: "read_mode", label: "Read Mode", kind: "parv", gId: 5, pId: 16 },
  { key: "single_read_time", label: "Single Read Time", kind: "parv", gId: 5, pId: 1 },
  { key: "continuous_read_time", label: "Continous Read Time", kind: "parv", gId: 5, pId: 17 },
  { key: "check_doublereads", label: "Check for Doublereads", kind: "parv", gId: 5, pId: 19 },
  { key: "transponder_types", label: "Transponder Types (bitmask)", kind: "parv", gId: 5, pId: 18 },
  { key: "sync_mode", label: "Sync Mode On/Off", kind: "parv", gId: 5, pId: 3 },

  { key: "online_mode", label: "Online Mode On/Off", kind: "parv", gId: 6, pId: 20 },
  { key: "online_output_format", label: "Online Output Format", kind: "parv", gId: 6, pId: 19 },
  { key: "send_double_reads", label: "Send Double Reads (online)", kind: "parv", gId: 6, pId: 23 },

  { key: "bt_mode", label: "Bluetooth Mode", kind: "parv", gId: 32, pId: 1 },
  { key: "bt_profile", label: "Bluetooth Profile", kind: "parv", gId: 32, pId: 21 },
  { key: "bt_passkey", label: "Bluetooth Passkey", kind: "parv", gId: 32, pId: 20 },
  { key: "bt_peer_address", label: "Bluetooth Peer Address", kind: "parv", gId: 32, pId: 22 },
  { key: "bt_baud", label: "Bluetooth Baudrate", kind: "parv", gId: 32, pId: 3 },

  { key: "scale_type", label: "Scale Type", kind: "parv", gId: 33, pId: 1 },
  { key: "scale_interface", label: "Scale Interface", kind: "parv", gId: 33, pId: 2 },
  { key: "scale_baud", label: "Scale Baudrate", kind: "parv", gId: 33, pId: 3 },

  { key: "eid_display_format", label: "EID Display Format", kind: "parv", gId: 7, pId: 14 },
  { key: "non_storage_mode", label: "Non Storage Mode", kind: "parv", gId: 7, pId: 69 },

  // Printer + WLAN etc can be added later once you decide you really want to change them via web UI.
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findPlainValue(frames) {
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = String(frames[i] ?? "").trim();
    if (!f) continue;
    if (f.startsWith("[") && f.endsWith("]")) continue;
    return f;
  }
  return "";
}

async function getParv(session, gId, pId) {
  const done = await session.send(`XGPARV|${gId}|${pId}`, {
    name: `XGPARV ${gId}|${pId}`,
    okToken: "XGPARVOK",
  });
  return findPlainValue(done?.frames || []);
}

async function setParv(session, gId, pId, value) {
  const v = String(value ?? "").trim();
  if (v === "") return; // don't send blanks like [XSPARV|1|34|]
  // Agri-Link capture shows [XSPARVOK] (with V)
  await session.send(`XSPARV|${gId}|${pId}|${v}`, {
    name: `XSPARV ${gId}|${pId}`,
    okToken: "XSPARVOK",
  });
}

async function getTagFormat(session) {
  const done = await session.send("XGTAGFORMAT", { name: "XGTAGFORMAT", okToken: "XGTAGFORMATOK" });
  return findPlainValue(done?.frames || "");
}

async function setTagFormat(session, no) {
  const v = String(no ?? "").trim();
  if (v === "") return;
  await session.send(`XSTAGFORMAT|${v}`, { name: "XSTAGFORMAT", okToken: "XSTAGFORMATOK" });
}

async function getSimple(session, cmd, okToken) {
  const done = await session.send(cmd, { name: cmd, okToken });
  return findPlainValue(done?.frames || []);
}

export async function fetchDeviceInfo(session) {
  const btVer = await getSimple(session, "XGBTVER", "XGBTVEROK");
  const btAdr = await getSimple(session, "XGBTADR", "XGBTADROK");
  const wAdr = await getSimple(session, "XGWADR", "XGWADROK");
  const wVer = await getSimple(session, "XGWVER", "XGWVEROK");
  return { btVer, btAdr, wAdr, wVer };
}

export async function fetchSettings(session, defs = SETTINGS_DEFAULT_DEFS) {
  const rows = [];
  for (const def of defs) {
    if (def.kind === "tagformat") {
      rows.push({ key: def.key, label: def.label, value: await getTagFormat(session) });
      await sleep(10);
      continue;
    }
    if (def.kind === "parv") {
      rows.push({
        key: def.key,
        label: def.label,
        value: await getParv(session, def.gId, def.pId),
        gId: def.gId,
        pId: def.pId,
      });
      await sleep(10);
      continue;
    }
  }
  return rows;
}

export async function applySettings(session, rows, { onProgress, verify = false } = {}) {
  const known = new Map(SETTINGS_DEFAULT_DEFS.map(def => [def.key, def]));
  const writes = rows.filter(r => String(r.value ?? "").trim() !== "");
  // Validate everything before sending any commands; never silently skip a row.
  const prepared = writes.map(r => {
    const key = String(r.key ?? "").trim();
    const def = known.get(key);
    if (!def) throw new Error("Unknown setting: " + key);
    const value = String(r.value).trim();
    const error = validateSettingValue(key, value);
    if (error) throw new Error(key + ": " + error);
    return { key, value, def };
  });

  let i = 0;
  for (const { key, value, def } of prepared) {
    i += 1;
    onProgress?.({ i, total: prepared.length, row: { key, value } });
    if (def.kind === "tagformat") await setTagFormat(session, value);
    else if (def.kind === "parv") await setParv(session, def.gId, def.pId, value);
    else throw new Error("Unsupported setting type: " + key);
    await sleep(20);
    if (verify) {
      const [actual] = await fetchSettings(session, [def]);
      if (String(actual?.value ?? "").trim() !== value) {
        throw new Error(key + ": reader did not retain " + value + " (read back " + (actual?.value ?? "nothing") + ")");
      }
    }
  }
  return prepared.length;
}

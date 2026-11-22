// Quick Setup: safe, key-based settings profiles. Advanced draft editing stays in app.js.
import { SETTINGS_DICTIONARY, describeSettingValue, validateSettingValue } from "./settingsDictionary.js";
import { SETTINGS_DEFAULT_DEFS, fetchSettings, applySettings } from "../wand/commands/settings.js";

const defs = new Map(SETTINGS_DEFAULT_DEFS.map(d => [d.key, d]));
const byId = id => document.getElementById(id);
const profileBase = new URL("../settings-profiles/", import.meta.url);

function normalizeProfile(profile) {
  if (!profile || !Array.isArray(profile.settings) || !profile.settings.length) throw new Error("Profile has no settings.");
  const seen = new Set();
  return profile.settings.map(item => {
    const key = String(item?.key || "");
    const def = defs.get(key);
    const meta = SETTINGS_DICTIONARY[key];
    if (!def || !meta || seen.has(key)) throw new Error("Unknown or duplicate setting: " + key);
    seen.add(key);
    const value = String(item.value ?? "").trim();
    const error = validateSettingValue(key, value);
    if (error) throw new Error(key + ": " + error);
    return { key, label: meta.label, value, ...(def.kind === "parv" ? { gId: def.gId, pId: def.pId } : {}) };
  });
}

function compare(target, current) {
  const snapshot = new Map(current.map(r => [r.key, String(r.value ?? "").trim()]));
  return target.map(row => ({
    ...row,
    previous: snapshot.get(row.key) ?? "",
    state: !snapshot.has(row.key) || !snapshot.get(row.key) ? "unknown" :
      snapshot.get(row.key) === row.value ? "same" : "change"
  }));
}

export function setupSettingsProfiles({ getSession, getTransport, isBusy, onSnapshot }) {
  const select = byId("settingsProfileSelect");
  const refresh = byId("refreshSettingsProfilesBtn");
  const preview = byId("previewSettingsProfileBtn");
  const apply = byId("applySettingsProfileBtn");
  const status = byId("settingsProfileStatus");
  const table = byId("settingsProfileDiff");
  let catalogue = new Map();
  let chosen = null;
  let diff = [];
  let applying = false;

  const connected = () => !!getTransport()?.isConnected && !!getSession();
  const updateButtons = () => {
    const locked = applying || isBusy();
    select.disabled = locked || !catalogue.size;
    refresh.disabled = locked;
    preview.disabled = locked || !connected() || !chosen;
    apply.disabled = locked || !connected() || !diff.length ||
      diff.some(r => r.state === "unknown") || !diff.some(r => r.state === "change");
  };
  const say = message => { status.textContent = message; updateButtons(); };
  const clearPreview = () => { diff = []; table.replaceChildren(); updateButtons(); };

  async function loadCatalogue() {
    clearPreview();
    chosen = null;
    catalogue = new Map();
    select.replaceChildren(new Option("Choose a configuration…", ""));
    say("Loading configuration profiles…");
    try {
      const res = await fetch(new URL("manifest.json", profileBase), { cache: "no-store" });
      if (!res.ok) throw new Error("Manifest HTTP " + res.status);
      const manifest = await res.json();
      if (!Array.isArray(manifest.profiles)) throw new Error("Invalid profile manifest");
      for (const item of manifest.profiles) {
        // Manifest paths must be simple local JSON filenames.
        if (!/^[a-z0-9_-]+\.json$/i.test(item.file) || !/^[a-z0-9_-]+$/i.test(item.id)) continue;
        catalogue.set(item.id, item);
        select.add(new Option(item.name || item.id, item.id));
      }
      say(catalogue.size ? "Select a configuration, then compare it with the connected reader." : "No profiles available.");
    } catch (e) {
      say("Unable to load repository profiles: " + (e.message || e));
    }
  }

  select.addEventListener("change", () => {
    chosen = catalogue.get(select.value) || null;
    clearPreview();
    say(chosen?.description || "Select a configuration.");
  });

  preview.addEventListener("click", async () => {
    if (!chosen || !connected() || applying) return;
    clearPreview();
    preview.disabled = true;
    try {
      say("Reading current settings and preparing comparison…");
      const res = await fetch(new URL(chosen.file, profileBase), { cache: "no-store" });
      if (!res.ok) throw new Error("Profile HTTP " + res.status);
      const profile = await res.json();
      if (profile.id !== chosen.id) throw new Error("Profile identity mismatch");
      const target = normalizeProfile(profile);
      // Read the exact target settings, including XGTAGFORMAT, before making any changes.
      const current = await fetchSettings(getSession(), target.map(r => defs.get(r.key)));
      diff = compare(target, current);
      for (const row of diff) {
        const tr = document.createElement("tr");
        const previous = row.state === "unknown" ? "Not read" : row.previous + " — " + describeSettingValue(row.key, row.previous);
        const next = row.value + " — " + describeSettingValue(row.key, row.value);
        for (const cell of [row.label, previous, next, row.state === "same" ? "Already set" : row.state === "unknown" ? "Cannot compare" : "Change"]) {
          const td = document.createElement("td");
          td.textContent = cell;
          tr.append(td);
        }
        table.append(tr);
      }
      const count = diff.filter(r => r.state === "change").length;
      say(diff.some(r => r.state === "unknown") ? "Some settings could not be read. Nothing will be written." :
        count ? count + " setting(s) need changing. Review before applying." : "Reader already matches this profile.");
    } catch (e) {
      clearPreview();
      say("Comparison failed: " + (e.message || e));
    } finally { updateButtons(); }
  });

  apply.addEventListener("click", async () => {
    if (applying || !connected() || !diff.length || diff.some(r => r.state === "unknown")) return;
    const changes = diff.filter(r => r.state === "change");
    if (!changes.length) return;
    const isBle = getTransport()?.constructor?.name === "BleTransport";
    const disruptive = changes.filter(r => SETTINGS_DICTIONARY[r.key]?.connectionSensitive);
    // A BLE profile switch may disconnect before an acknowledgement can arrive.
    if (isBle && disruptive.length) {
      say("Bluetooth changes must be applied using USB Serial. Reconnect using USB to continue.");
      return;
    }
    const ordered = [...changes.filter(r => !SETTINGS_DICTIONARY[r.key]?.connectionSensitive), ...disruptive];
    const message = "Apply " + ordered.length + " changed setting(s)?\n\n" +
      ordered.map(r => r.label + ": " + r.previous + " → " + r.value).join("\n") +
      (disruptive.length ? "\n\nBluetooth settings are applied last. The reader may need reconnecting." : "");
    if (!confirm(message)) return;
    applying = true;
    updateButtons();
    try {
      for (const row of ordered) {
        say("Writing " + row.label + "…");
        await applySettings(getSession(), [row]);
        // Verify each change while still connected, especially before the last Bluetooth write.
        const actual = (await fetchSettings(getSession(), [defs.get(row.key)]))[0];
        if (String(actual?.value ?? "").trim() !== row.value) throw new Error(row.label + " did not verify. Stop and inspect the reader.");
      }
      clearPreview();
      say("Profile applied and settings verified. Compare again to refresh.");
      await onSnapshot?.();
    } catch (e) {
      clearPreview();
      say("Stopped: " + (e.message || e) + ". Some earlier settings may have been written.");
    } finally { applying = false; updateButtons(); }
  });

  refresh.addEventListener("click", loadCatalogue);
  loadCatalogue();
  return { updateButtons, clearPreview };
}

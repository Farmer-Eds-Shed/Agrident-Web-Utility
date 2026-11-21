// wand/commands/groups.js
import { formatRow } from "../../parsers/format.js";
import { verifiedDownload, bulkTimeouts } from "../verify.js";

const GROUP_HEADERS_BASE = ["Date", "Time", "Type", "EID", "VID", "Alert"];
const GROUP_HEADERS_X = [...GROUP_HEADERS_BASE, "Weight"];

function normalizeTime(timeRaw) {
  const t = String(timeRaw ?? "");
  if (t.length === 6) return `${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}`;
  return t;
}

function mapGroupRowBase(r) {
  const date = r[1] ?? "";
  const time = normalizeTime(r[2] ?? "");
  const type = r[5] ?? "";
  const eid = r[6] ?? "";
  const vid = r[7] ?? "";
  const alert = r[8] ?? "";
  return [date, time, type, eid, vid, alert];
}

function mapGroupRowX(r) {
  const base = mapGroupRowBase(r);
  const weight = r[9] ?? "";
  return [...base, weight];
}

export async function fetchGroups(session) {
  const done = await session.send("XGGROUPS", { name: "Sync groups", okToken: "XGGROUPSOK" });

  const rows = done.frames
    .filter(session.helpers.isBracketFrame)
    .filter((fr) => fr !== "[XGGROUPS]" && fr !== "[XGGROUPSOK]")
    .filter((fr) => fr.includes("|"))
    .map(session.helpers.parsePipeFrame)
    .filter((a) => a.length >= 3 && (a[1] ?? "") !== "");

  return rows.map((a) => ({
    pos: a[0] ?? "",
    id: a[1] ?? "",
    name: a[2] ?? "",
    type: a[3] ?? "",
  }));
}

// Download raw group rows, re-fetching until the result is trustworthy (see verify.js).
function downloadRawGroup(session, cmd, okToken, baseName, { verify, maxAttempts }) {
  const once = async (attempt = 1, max = 1) => {
    const name = attempt > 1 ? `${baseName} (attempt ${attempt}/${max})` : baseName;
    const done = await session.send(cmd, { name, okToken, ...bulkTimeouts() });
    return done.frames
      .filter(session.helpers.isBracketFrame)
      .filter((fr) => !session.helpers.isCmdFrame(fr, cmd.split("|")[0]))
      .filter((fr) => fr !== `[${okToken}]`)
      .filter((fr) => fr.includes("|"))
      .map(session.helpers.parsePipeFrame);
  };
  return verify ? verifiedDownload(once, { maxAttempts, session }) : once();
}

export async function fetchGroupRows(session, groupId, { preferX = true, verify = false, maxAttempts = 5 } = {}) {
  if (preferX) {
    try {
      const rawRows = await downloadRawGroup(
        session, `XGGROUPX|${groupId}`, "XGGROUPXOK", "Get group data (with weight)", { verify, maxAttempts }
      );

      const rows = rawRows
        .map(mapGroupRowX)
        .map((r) => formatRow(r, GROUP_HEADERS_X)); // ✅ date formatting etc

      return { headers: GROUP_HEADERS_X, rows, usedX: true };
    } catch {
      // fall back below
    }
  }

  const rawRows = await downloadRawGroup(
    session, `XGGROUP|${groupId}`, "XGGROUPOK", "Get group data", { verify, maxAttempts }
  );

  const rows = rawRows
    .map(mapGroupRowBase)
    .map((r) => formatRow(r, GROUP_HEADERS_BASE)); // ✅ date formatting etc

  return { headers: GROUP_HEADERS_BASE, rows, usedX: false };
}

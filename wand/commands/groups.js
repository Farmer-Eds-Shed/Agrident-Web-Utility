// wand/commands/groups.js
import { formatRow } from "../../parsers/format.js";

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

export async function fetchGroupRows(session, groupId, { preferX = true } = {}) {
  if (preferX) {
    try {
      const doneX = await session.send(`XGGROUPX|${groupId}`, {
        name: "Get group data (with weight)",
        okToken: "XGGROUPXOK",
      });

      const frames = doneX.frames
        .filter(session.helpers.isBracketFrame)
        .filter((fr) => !session.helpers.isCmdFrame(fr, "XGGROUPX"))
        .filter((fr) => fr !== "[XGGROUPXOK]")
        .filter((fr) => fr.includes("|"));

      const rawRows = frames.map(session.helpers.parsePipeFrame);

      const rows = rawRows
        .map(mapGroupRowX)
        .map((r) => formatRow(r, GROUP_HEADERS_X)); // ✅ date formatting etc

      return { headers: GROUP_HEADERS_X, rows, usedX: true };
    } catch {
      // fall back below
    }
  }

  const done = await session.send(`XGGROUP|${groupId}`, { name: "Get group data", okToken: "XGGROUPOK" });

  const frames = done.frames
    .filter(session.helpers.isBracketFrame)
    .filter((fr) => !session.helpers.isCmdFrame(fr, "XGGROUP"))
    .filter((fr) => fr !== "[XGGROUPOK]")
    .filter((fr) => fr.includes("|"));

  const rawRows = frames.map(session.helpers.parsePipeFrame);

  const rows = rawRows
    .map(mapGroupRowBase)
    .map((r) => formatRow(r, GROUP_HEADERS_BASE)); // ✅ date formatting etc

  return { headers: GROUP_HEADERS_BASE, rows, usedX: false };
}

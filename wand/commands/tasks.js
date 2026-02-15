// wand/commands/tasks.js
// Agrident task catalogue + dataset reads.

function parseTaskRow(parts) {
  return {
    idx: parts[0] ?? "",
    name: parts[1] ?? "",
    prefix: parts[2] ?? "",
    suffix: parts[3] ?? "",
    count: parts[4] ?? "",
  };
}

export async function fetchTasks(session) {
  const done = await session.send("XGTASK", { name: "Sync tasks", okToken: "XGTASKOK" });

  const rows = done.frames
    .filter(session.helpers.isBracketFrame)
    .filter((fr) => fr !== "[XGTASK]" && fr !== "[XGTASKOK]")
    .filter((fr) => fr.includes("|"))
    .map(session.helpers.parsePipeFrame)
    .filter((a) => a.length >= 2 && (a[0] ?? "") !== "");

  return rows.map(parseTaskRow);
}

/**
 * Returns header array from XSH.
 * Some devices return a single header frame like:
 *   [DATE|TIME|EID|...]
 */
export async function fetchTaskHeaders(session, idx) {
  const done = await session.send(`XSH|${idx}`, { name: "Get headers", okToken: "XSHOK" });

  const headerFrame = done.frames.find(
    (fr) =>
      session.helpers.isBracketFrame(fr) &&
      !session.helpers.isCmdFrame(fr, "XSH") &&
      fr !== "[XSHOK]" &&
      fr.includes("|")
  );

  return headerFrame ? session.helpers.parsePipeFrame(headerFrame) : [];
}

/**
 * Returns raw dataset rows from CSW.
 * Each row is an array of strings split by '|'.
 */
export async function fetchTaskRows(session, idx) {
  const done = await session.send(`CSW|${idx}`, { name: "Get data", okToken: "CSWOK" });

  const dataFrames = done.frames
    .filter(session.helpers.isBracketFrame)
    .filter((fr) => !session.helpers.isCmdFrame(fr, "CSW"))
    .filter((fr) => fr !== "[CSWOK]")
    .filter((fr) => fr.includes("|"));

  return dataFrames.map(session.helpers.parsePipeFrame);
}

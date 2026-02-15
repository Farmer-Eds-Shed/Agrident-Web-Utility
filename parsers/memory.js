// parsers/memory.js
// Parse Agrident memory dump frames from [XGMEM] ... [XGMEMOK] into headers + rows.

function isBracketFrame(s) {
  return typeof s === "string" && s.startsWith("[") && s.endsWith("]");
}

function parsePipeFrame(frameStr) {
  return frameStr.slice(1, -1).split("|");
}

export function parseXGMEM(frames) {
  const rows = [];

  for (const fr of (frames || [])) {
    if (!isBracketFrame(fr)) continue;
    if (fr === "[XGMEM]" || fr === "[XGMEMOK]") continue;
    if (fr.startsWith("[OK") || fr.startsWith("[ERROR")) continue;
    if (!fr.includes("|")) continue;

    const parts = parsePipeFrame(fr);
    if (!parts.length) continue;

    const head = String(parts[0] || "").toUpperCase();
    const payload = (head === "XGMEM" || head === "XGMEMD" || head === "XGMEMR")
      ? parts.slice(1)
      : parts;

    if (payload.length) rows.push(payload);
  }

  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const headers = Array.from({ length: maxCols }, (_, i) => `Field${i + 1}`);

  return { headers, rows, meta: { recordCount: rows.length } };
}

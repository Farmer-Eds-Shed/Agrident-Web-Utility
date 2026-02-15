// parsers/csv.js
// Keep CSV + download helpers isolated from the main UI logic.

function escCsv(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Matrix/array form (what the app uses today):
//   headers: string[]
//   rows: (string|number|null)[][]
export function toCSV(headers, rows, { lineEnding="\n" } = {}) {
  const out = [];
  if (headers?.length) out.push(headers.map(escCsv).join(","));
  for (const r of (rows || [])) out.push((r || []).map(escCsv).join(","));
  return out.join(lineEnding);
}

// Object-row form (handy later, kept for future use):
//   headers: string[]
//   rows: Record<string, any>[]
export function toCSVFromObjects(headers, rows, { lineEnding="\n" } = {}) {
  const out = [];
  if (headers?.length) out.push(headers.map(escCsv).join(","));
  for (const obj of (rows || [])) {
    out.push(headers.map(h => escCsv(obj?.[h])).join(","));
  }
  return out.join(lineEnding);
}

export function downloadText(filename, text, mime="text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Allow the click to start before we revoke.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

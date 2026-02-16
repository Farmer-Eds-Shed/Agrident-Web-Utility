// parsers/csv_import.js

function parseLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQ) {
      if (ch === '"') {
        const next = line[i + 1];
        if (next === '"') {
          cur += '"';
          i += 1;
        } else {
          inQ = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

export function parseCSV(text) {
  const norm = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = norm.split("\n").filter((l) => l.trim() !== "");

  const rows = lines.map(parseLine);

  // trim cells
  return rows.map((r) => r.map((c) => String(c ?? "").trim()));
}

// configs/tsk.js
export async function readTextFile(file) {
  return await file.text();
}

export function parseTskCommands(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const bad = lines.find(l => !(l.startsWith("[") && l.endsWith("]")));
  if (bad) throw new Error(`Invalid command line (must be like [CMD|...]): ${bad}`);
  return lines;
}

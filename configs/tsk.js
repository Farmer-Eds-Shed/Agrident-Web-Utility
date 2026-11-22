// Task definitions are command streams exported as .tsk files.
// Preserve command bytes (apart from surrounding whitespace/BOM) and upload in order.
export async function readTextFile(file) {
  return await file.text();
}

export function parseTskCommands(text) {
  const lines = String(text ?? "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) throw new Error("The task definition file is empty.");

  for (const [index, line] of lines.entries()) {
    // Never repair or guess malformed reader commands.
    if (!/^\[[^\[\]\r\n]+\]$/.test(line)) {
      throw new Error(`Invalid command on line ${index + 1}: ${line.slice(0, 90)}`);
    }
  }
  return lines;
}

export async function uploadTskCommands(session, commands, { onProgress } = {}) {
  if (!Array.isArray(commands) || !commands.length) {
    throw new Error("No task definition commands loaded.");
  }
  // A .tsk file is a sequence of raw frames, not a single command with an OK
  // token. Wait for each transport write and pace the frames, especially on BLE.
  // Successful transmission does not guarantee that the reader applied the task.
  await session.sendFrames(commands, {
    name: "Upload task definition",
    delayMs: 100,
    onProgress,
  });
}

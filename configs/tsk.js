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

// AWR250 capture: each CI*/CCD command is echoed, followed by [<CMD>OK].
// Send one at a time and wait for the specific acknowledgement before advancing.
export async function uploadTskCommands(session, commands, { onProgress } = {}) {
  if (!Array.isArray(commands) || !commands.length) {
    throw new Error("No task definition commands loaded.");
  }
  const allowed = new Set(["CCD", "CIN", "CIP", "CIH", "CIE", "CIO", "CIG", "CIC", "CIF"]);
  // Validate the *whole* file before touching the reader.
  const parsed = commands.map((frame, i) => {
    const match = /^\[([A-Z]+)(?:\|[^\[\]\r\n]*)?\]$/.exec(frame);
    if (!match || !allowed.has(match[1])) {
      throw new Error(`Unsupported task command on line ${i + 1}: ${String(frame).slice(0, 100)}`);
    }
    return { frame, cmd: match[1] };
  });

  for (let i = 0; i < parsed.length; i++) {
    const { frame, cmd } = parsed[i];
    try {
      await session.send(frame, {
        name: `Task definition ${i + 1}/${parsed.length}: ${cmd}`,
        okToken: `${cmd}OK`,
      });
    } catch (e) {
      throw new Error(`Command ${i + 1}/${parsed.length} failed (${frame}): ${e?.message || e}`);
    }
    onProgress?.({ i: i + 1, total: parsed.length, command: frame });
  }
}

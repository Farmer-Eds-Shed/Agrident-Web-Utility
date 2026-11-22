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

// TaskTool uses slots 1–20; protocol uses 0–19. Only CCD and CIN
// have been observed to carry the destination slot.
export function getTskSlot(commands) {
  const ccd = commands.find((c) => /^\[CCD\|\d+\]$/.test(c));
  const cin = commands.find((c) => /^\[CIN\|\d+\|/.test(c));
  if (!ccd || !cin) throw new Error("Task definition must contain CCD and CIN slot commands.");
  const a = Number(/^\[CCD\|(\d+)\]$/.exec(ccd)[1]);
  const b = Number(/^\[CIN\|(\d+)\|/.exec(cin)[1]);
  if (a !== b || !Number.isInteger(a) || a < 0 || a > 19) {
    throw new Error("CCD/CIN task slots disagree or are outside 0–19.");
  }
  if (commands.filter((c) => c.startsWith("[CCD|")).length !== 1 ||
      commands.filter((c) => c.startsWith("[CIN|")).length !== 1) {
    throw new Error("Expected exactly one CCD and one CIN command.");
  }
  return a + 1;
}

export function setTskSlot(commands, guiSlot) {
  const slot = Number(guiSlot);
  if (!Number.isInteger(slot) || slot < 1 || slot > 20) {
    throw new Error("Select a destination task slot between 1 and 20.");
  }
  getTskSlot(commands); // validate source before rewriting
  const idx = slot - 1;
  return commands.map((frame) => {
    if (/^\[CCD\|\d+\]$/.test(frame)) return `[CCD|${idx}]`;
    if (/^\[CIN\|\d+\|/.test(frame)) return frame.replace(/^\[CIN\|\d+\|/, `[CIN|${idx}|`);
    return frame;
  });
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

// wand/session.js
export function createWandSession({
  transport,
  setBusy,
  onCommandUIStateChange,
  maxText = 60000,
  timeoutMs = 12000,
  appendCR = false,
  appendLF = false,
  enc = new TextEncoder(),
} = {}) {
  if (!transport) throw new Error("createWandSession: transport is required");

  let rxText = "";
  let currentCommand = null;
  let cmdTimer = null;

  const writeQueue = [];
  let writing = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const isBracketFrame = (s) => s.startsWith("[") && s.endsWith("]");
  const isCmdFrame = (s, cmd) => s.startsWith("[" + cmd);
  const isOkFrame = (s, okToken) => s.includes(okToken);
  const parsePipeFrame = (frameStr) => frameStr.slice(1, -1).split("|");

  function resetRx() {
    rxText = "";
  }

  function onTextChunk(chunk) {
    rxText += chunk;
    if (rxText.length > maxText) rxText = rxText.slice(-maxText);
    consumeFrames();
  }

  function consumeFrames() {
    while (true) {
      const open = rxText.indexOf("[");
      if (open === -1) {
        if (rxText.length > 1024) rxText = rxText.slice(-256);
        return;
      }
      const close = rxText.indexOf("]", open);
      if (close === -1) return;

      const raw = rxText.slice(open, close + 1);
      rxText = rxText.slice(close + 1);

      const cleaned = raw.replace(/\r/g, "").replace(/\n/g, "");
      onFrame(cleaned);
    }
  }

  function beginCommand(name, okToken, matcher = null, timeoutOverride = null) {
    if (currentCommand) throw new Error(`Busy running ${currentCommand.name}`);

    let resolve, reject;
    const p = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });

    currentCommand = { name, okToken, matcher, frames: [], resolve, reject };
    setBusy?.(name);
    onCommandUIStateChange?.(true);

    if (cmdTimer) clearTimeout(cmdTimer);
    const tMs = typeof timeoutOverride === "number" && timeoutOverride > 0 ? timeoutOverride : timeoutMs;

    cmdTimer = setTimeout(() => {
      const done = currentCommand;
      currentCommand = null;

      setBusy?.("idle");
      onCommandUIStateChange?.(false);

      if (done) done.reject(new Error("Timeout"));
    }, tMs);

    return p;
  }

  function finishCommand(ok, err) {
    if (!currentCommand) return;
    if (cmdTimer) clearTimeout(cmdTimer);
    cmdTimer = null;

    const done = currentCommand;
    currentCommand = null;

    setBusy?.("idle");
    onCommandUIStateChange?.(false);

    if (ok) done.resolve(done);
    else done.reject(err || new Error("Command failed"));
  }

  function onFrame(f) {
    if (!currentCommand) return;

    currentCommand.frames.push(f);

    // ✅ If a predicate matcher is provided, it decides completion.
    if (typeof currentCommand.matcher === "function") {
      try {
        if (currentCommand.matcher(f)) {
          finishCommand(true);
        }
      } catch (e) {
        finishCommand(false, e);
      }
      return;
    }

    // ✅ Otherwise fall back to okToken matching (existing behaviour)
    if (currentCommand.okToken && isOkFrame(f, currentCommand.okToken)) {
      finishCommand(true);
    }
  }

  async function enqueueWrite(str) {
    writeQueue.push(str);
    pumpWrites();
  }

  async function pumpWrites() {
    if (writing) return;
    writing = true;
    try {
      while (writeQueue.length) {
        const s = writeQueue.shift();
        await transport.write(s);
        // tiny pacing to keep BLE happy
        await sleep(10);
      }
    } catch (e) {
      if (currentCommand) finishCommand(false, e);
      throw e;
    } finally {
      writing = false;
    }
  }

  async function send(cmd, structured = null) {
    if (!transport.isConnected) throw new Error("Not connected");

    let out = String(cmd).trim();
    if (!out) return null;

    if (!out.startsWith("[")) out = "[" + out;
    if (!out.endsWith("]")) out += "]";

    if (appendCR) out += "\r";
    if (appendLF) out += "\n";

    let p = null;
    if (structured) p = beginCommand(structured.name, structured.okToken);

    await enqueueWrite(out);
    if (p) return await p;
    return null;
  }

  /**
   * Send a bracket frame and wait for a fuzzy match (predicate).
   * This is ideal for tag uploads where the device echoes a frame but may normalize/truncate fields.
   */
  async function sendFrameAndWait(frame, matchFn, { name = "Send frame", timeoutMsOverride = null } = {}) {
    if (!transport.isConnected) throw new Error("Not connected");

    const clean = String(frame).trim();
    if (!clean.startsWith("[")) throw new Error("Frame must start with '['");
    if (!clean.endsWith("]")) throw new Error("Frame must end with ']'");

    let out = clean;
    if (appendCR) out += "\r";
    if (appendLF) out += "\n";

    // IMPORTANT: begin waiting BEFORE writing, to avoid missing very fast echoes
    const p = beginCommand(name, null, matchFn, timeoutMsOverride);

    await enqueueWrite(out);
    return await p;
  }

  /**
   * Backwards-compatible exact echo match (no CR/LF mismatch):
   * waits for a frame that includes the clean frame string.
   */
  async function sendFrameAndWaitEcho(frame, { name = "Send frame", timeoutMsOverride = null } = {}) {
    const clean = String(frame).trim();
    return await sendFrameAndWait(
      clean,
      (fr) => fr.includes(clean),
      { name, timeoutMsOverride }
    );
  }

  return {
    // feed this from BLE notify / serial read loops
    onTextChunk,

    // used by app logic
    send,
    sendFrameAndWait,
    sendFrameAndWaitEcho,
    resetRx,

    // expose helpers used elsewhere
    helpers: { isBracketFrame, isCmdFrame, parsePipeFrame },
  };
}

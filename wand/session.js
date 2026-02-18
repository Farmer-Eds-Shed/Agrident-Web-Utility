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
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

      // Capture any non-bracket text that appears before the next frame.
      // Some commands (e.g. XGPARV / XGTAGFORMAT) return the value as plain text
      // between frames: [XGPARV|g|p][XGPARV|g|p]3[XGPARVOK]
      if (open > 0) {
        const prefix = rxText.slice(0, open);
        rxText = rxText.slice(open);

        const cleaned = prefix.replace(/\r/g, "").replace(/\n/g, "");
        const text = cleaned.trim();
        if (text) onFrame(text);
        continue;
      }

      const close = rxText.indexOf("]", open);
      if (close === -1) return;

      const raw = rxText.slice(open, close + 1);
      rxText = rxText.slice(close + 1);

      const cleaned = raw.replace(/\r/g, "").replace(/\n/g, "");
      onFrame(cleaned);
    }
  }

  function beginCommand(name, okToken) {
    if (currentCommand) throw new Error(`Busy running ${currentCommand.name}`);

    let resolve, reject;
    const p = new Promise((res, rej) => { resolve = res; reject = rej; });

    currentCommand = { name, okToken, frames: [], resolve, reject };
    setBusy?.(name);
    onCommandUIStateChange?.(true);

    if (cmdTimer) clearTimeout(cmdTimer);
    cmdTimer = setTimeout(() => {
      const done = currentCommand;
      currentCommand = null;

      setBusy?.("idle");
      onCommandUIStateChange?.(false);

      if (done) done.reject(new Error("Timeout"));
    }, timeoutMs);

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
    if (isOkFrame(f, currentCommand.okToken)) finishCommand(true);
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

  return {
    onTextChunk,
    send,
    resetRx,
    helpers: { isBracketFrame, isCmdFrame, parsePipeFrame },
  };
}

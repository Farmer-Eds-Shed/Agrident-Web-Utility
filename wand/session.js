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

  // A lightweight “frame watcher” used by taglist/alerts uploads where
  // there is no OK token, only an echoed frame.
  let watcher = null; // { predicate, resolve, reject, timer, name }

  const writeQueue = [];
  let writing = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const isBracketFrame = (s) => s.startsWith("[") && s.endsWith("]");
  const isCmdFrame = (s, cmd) => s.startsWith("[" + cmd);
  const isOkFrame = (s, okToken) => okToken && s.includes(okToken);
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

      // Capture any non-bracket text before the next bracket frame.
      // (Needed for XGPARV / XGTAGFORMAT values like ...]3[XGPARVOK])
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

  function beginCommand(name, okToken, timeoutOverrideMs) {
    if (currentCommand) throw new Error(`Busy running ${currentCommand.name}`);
    if (watcher) throw new Error(`Busy waiting for ${watcher.name}`);

    let resolve, reject;
    const p = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });

    currentCommand = { name, okToken, frames: [], resolve, reject };

    setBusy?.(name);
    onCommandUIStateChange?.(true);

    if (cmdTimer) clearTimeout(cmdTimer);
    const t = timeoutOverrideMs ?? timeoutMs;

    cmdTimer = setTimeout(() => {
      const done = currentCommand;
      currentCommand = null;

      setBusy?.("idle");
      onCommandUIStateChange?.(false);

      if (done) done.reject(new Error("Timeout"));
    }, t);

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

  function beginWatcher(name, predicate, timeoutOverrideMs) {
    if (currentCommand) throw new Error(`Busy running ${currentCommand.name}`);
    if (watcher) throw new Error(`Busy waiting for ${watcher.name}`);

    let resolve, reject;
    const p = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const t = timeoutOverrideMs ?? timeoutMs;
    const timer = setTimeout(() => {
      const w = watcher;
      watcher = null;

      if (w) w.reject(new Error("Timeout"));
    }, t);

    watcher = { name, predicate, resolve, reject, timer };
    return p;
  }

  function finishWatcher(ok, payload, err) {
    if (!watcher) return;
    clearTimeout(watcher.timer);
    const w = watcher;
    watcher = null;

    if (ok) w.resolve(payload);
    else w.reject(err || new Error("Wait failed"));
  }

  function onFrame(f) {
    // First: watcher (used by sendFrameAndWait) – it can match ANY frame.
    if (watcher) {
      try {
        if (watcher.predicate(f)) {
          finishWatcher(true, f);
          // NOTE: do not return; still allow currentCommand to also record frame if active.
        }
      } catch (e) {
        finishWatcher(false, null, e);
      }
    }

    // Then: structured command collector
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
        // small pacing helps BLE
        await sleep(10);
      }
    } catch (e) {
      if (currentCommand) finishCommand(false, e);
      if (watcher) finishWatcher(false, null, e);
      throw e;
    } finally {
      writing = false;
    }
  }

  function normalizeFrameOrCmd(input) {
    let out = String(input).trim();
    if (!out) return "";
    if (!out.startsWith("[")) out = "[" + out;
    if (!out.endsWith("]")) out += "]";
    if (appendCR) out += "\r";
    if (appendLF) out += "\n";
    return out;
  }

  // Structured send: waits for okToken if provided
  async function send(cmd, structured = null) {
    if (!transport.isConnected) throw new Error("Not connected");

    const out = normalizeFrameOrCmd(cmd);
    if (!out) return null;

    let p = null;
    if (structured) {
      p = beginCommand(structured.name, structured.okToken, structured.timeoutMsOverride);
    }

    await enqueueWrite(out);
    if (p) return await p;
    return null;
  }

  // Raw frame send (no waiting)
  async function sendFrame(frame, opts = {}) {
    if (!transport.isConnected) throw new Error("Not connected");
    const out = normalizeFrameOrCmd(frame);
    if (!out) return;
    await enqueueWrite(out);
  }

  // Wait for a frame that matches predicate (used by tag uploads, etc.)
  async function waitForFrame(predicate, opts = {}) {
    const name = opts.name || "Wait for frame";
    const t = opts.timeoutMsOverride;
    const p = beginWatcher(name, predicate, t);
    return await p;
  }

  // Send a frame then wait for a matching frame (echo)
  async function sendFrameAndWait(frame, predicate, opts = {}) {
    // Ensure we start watching BEFORE sending (avoids race on fast echo)
    const name = opts.name || "Send frame and wait";
    const t = opts.timeoutMsOverride;

    const p = beginWatcher(name, predicate, t);
    await sendFrame(frame);
    return await p;
  }

  return {
    onTextChunk,
    send,
    sendFrame,
    waitForFrame,
    sendFrameAndWait,
    resetRx,
    helpers: { isBracketFrame, isCmdFrame, parsePipeFrame },
  };
}

// wand/session.js
export function createWandSession({
  transport,
  setBusy,
  onCommandUIStateChange,
  maxText = 60000,
  timeoutMs = 12000,          // inactivity: max silence before a command fails
  absoluteTimeoutMs = 60000,  // hard cap on total time per command, regardless of activity
  appendCR = false,
  appendLF = false,
  enc = new TextEncoder(),
} = {}) {
  if (!transport) throw new Error("createWandSession: transport is required");

  let rxText = "";
  let currentCommand = null;
  let cmdTimer = null;
  let cmdTimeoutMs = timeoutMs;
  let cmdAbsoluteMs = absoluteTimeoutMs;
  let absTimer = null;

  // Diagnostics: if droppedFragments > 0 the link lost bytes (reader/BLE side).
  const stats = { chunks: 0, frames: 0, droppedFragments: 0 };

  // A lightweight “frame watcher” used by taglist/alerts uploads where
  // there is no OK token, only an echoed frame.
  let watcher = null; // { predicate, resolve, reject, timer, name }
  let batchBusy = false;

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

  // timeoutMs is an INACTIVITY timeout: every received chunk re-arms it, so a long
  // but healthy download (slow over BLE) is not cut off mid-transfer.
  function failCommand(reason) {
    if (cmdTimer) clearTimeout(cmdTimer);
    if (absTimer) clearTimeout(absTimer);
    cmdTimer = null;
    absTimer = null;

    const done = currentCommand;
    currentCommand = null;

    setBusy?.("idle");
    onCommandUIStateChange?.(false);

    if (done) done.reject(new Error(`Timeout (${reason}, ${done.frames.length} frames received)`));
  }

  function armCmdTimer() {
    if (!currentCommand) return;
    if (cmdTimer) clearTimeout(cmdTimer);
    cmdTimer = setTimeout(() => failCommand(`no data for ${cmdTimeoutMs} ms`), cmdTimeoutMs);
  }

  function armWatcherTimer() {
    if (!watcher) return;
    clearTimeout(watcher.timer);
    watcher.timer = setTimeout(() => {
      const w = watcher;
      watcher = null;
      if (w) w.reject(new Error("Timeout"));
    }, watcher.timeoutMs);
  }

  function onTextChunk(chunk) {
    stats.chunks += 1;
    if (currentCommand) armCmdTimer();
    if (watcher) armWatcherTimer();
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

      // A second "[" before the "]" means the tail of the first frame never arrived.
      // Drop the fragment and resync on the newer frame instead of merging two rows.
      const innerOpen = rxText.indexOf("[", open + 1);
      if (innerOpen !== -1 && innerOpen < close) {
        stats.droppedFragments += 1;
        console.warn("[wand] dropped truncated frame:", rxText.slice(open, innerOpen));
        rxText = rxText.slice(innerOpen);
        continue;
      }

      const raw = rxText.slice(open, close + 1);
      rxText = rxText.slice(close + 1);

      const cleaned = raw.replace(/\r/g, "").replace(/\n/g, "");
      onFrame(cleaned);
    }
  }

  function beginCommand(name, okToken, timeoutOverrideMs, absoluteOverrideMs) {
    if (batchBusy) throw new Error("Busy uploading frames");
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

    cmdTimeoutMs = timeoutOverrideMs ?? timeoutMs;
    cmdAbsoluteMs = absoluteOverrideMs ?? absoluteTimeoutMs;
    armCmdTimer();
    if (absTimer) clearTimeout(absTimer);
    absTimer = setTimeout(() => failCommand(`exceeded ${cmdAbsoluteMs} ms total`), cmdAbsoluteMs);

    return p;
  }

  function finishCommand(ok, err) {
    if (!currentCommand) return;

    if (cmdTimer) clearTimeout(cmdTimer);
    if (absTimer) clearTimeout(absTimer);
    cmdTimer = null;
    absTimer = null;

    const done = currentCommand;
    currentCommand = null;

    setBusy?.("idle");
    onCommandUIStateChange?.(false);

    if (ok) done.resolve(done);
    else done.reject(err || new Error("Command failed"));
  }

  function beginWatcher(name, predicate, timeoutOverrideMs) {
    if (batchBusy) throw new Error("Busy uploading frames");
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

    watcher = { name, predicate, resolve, reject, timer, timeoutMs: t };
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
    stats.frames += 1;
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

  function enqueueWrite(str) {
    return new Promise((resolve, reject) => {
      writeQueue.push({ str, resolve, reject });
      void pumpWrites();
    });
  }

  async function pumpWrites() {
    if (writing) return;
    writing = true;
    try {
      while (writeQueue.length) {
        const item = writeQueue.shift();
        try {
          await transport.write(item.str);
          await sleep(10);
          item.resolve();
        } catch (e) {
          item.reject(e);
          while (writeQueue.length) writeQueue.shift().reject(e);
          if (currentCommand) finishCommand(false, e);
          if (watcher) finishWatcher(false, null, e);
          break;
        }
      }
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
    if (batchBusy) throw new Error("Busy uploading frames");
    if (!transport.isConnected) throw new Error("Not connected");

    const out = normalizeFrameOrCmd(cmd);
    if (!out) return null;

    let p = null;
    if (structured) {
      p = beginCommand(structured.name, structured.okToken, structured.timeoutMsOverride, structured.absoluteTimeoutMs);
    }

    await enqueueWrite(out);
    if (p) return await p;
    return null;
  }

  // Raw frame send (no waiting)
  async function sendFrame(frame, opts = {}) {
    if (batchBusy) throw new Error("Busy uploading frames");
    if (!transport.isConnected) throw new Error("Not connected");
    const out = normalizeFrameOrCmd(frame);
    if (!out) return;
    await enqueueWrite(out);
  }

  // A raw command stream has no documented per-frame OK; progress means written.
  async function sendFrames(frames, { name = "Send command file", delayMs = 100, onProgress } = {}) {
    if (!transport.isConnected) throw new Error("Not connected");
    if (batchBusy || currentCommand || watcher) throw new Error("Reader is busy");
    if (!Array.isArray(frames) || !frames.length) throw new Error("No frames to send");
    batchBusy = true;
    setBusy?.(name);
    onCommandUIStateChange?.(true);
    try {
      for (let i = 0; i < frames.length; i++) {
        if (!transport.isConnected) throw new Error("Reader disconnected during upload");
        const frame = normalizeFrameOrCmd(frames[i]);
        if (!frame) throw new Error(`Empty frame at position ${i + 1}`);
        await enqueueWrite(frame);
        onProgress?.({ i: i + 1, total: frames.length, command: frame });
        if (i < frames.length - 1 && delayMs > 0) await sleep(delayMs);
      }
    } finally {
      batchBusy = false;
      setBusy?.("idle");
      onCommandUIStateChange?.(false);
    }
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
    sendFrames,
    waitForFrame,
    sendFrameAndWait,
    resetRx,
    stats,
    helpers: { isBracketFrame, isCmdFrame, parsePipeFrame },
  };
}

// wand/protocol.js
// Tiny protocol helpers: frame parsing + queued command sending.
export const dec = new TextDecoder();
export const enc = new TextEncoder();

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export function u8FromDV(dv) { return new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength); }

/**
 * Create a text chunk handler that extracts bracket-frames like:
 *   [XGTASK|...]
 * from an arbitrary stream of text chunks.
 */
export function createFrameExtractor(onFrame) {
  let buf = "";
  return function onTextChunk(chunk) {
    buf += chunk;
    // Hard cap to avoid runaway memory if device spews garbage.
    if (buf.length > 200000) buf = buf.slice(-200000);

    // Extract frames greedily.
    while (true) {
      const start = buf.indexOf("[");
      if (start < 0) { buf = ""; return; }
      const end = buf.indexOf("]", start + 1);
      if (end < 0) { 
        // keep tail from '[' onward
        buf = buf.slice(start);
        return;
      }
      const frame = buf.slice(start, end + 1);
      buf = buf.slice(end + 1);
      onFrame(frame);
    }
  };
}

/**
 * Simple sequential command queue. Ensures only one in-flight send at a time.
 */
export class CommandQueue {
  constructor(sendFn, {defaultDelayMs=35} = {}) {
    this._sendFn = sendFn;
    this._delay = defaultDelayMs;
    this._busy = false;
    this._q = [];
  }
  get busy() { return this._busy; }
  enqueue(cmd, delayMs=null) {
    this._q.push({cmd, delayMs});
    this._pump();
  }
  clear() { this._q = []; }
  async _pump() {
    if (this._busy) return;
    this._busy = true;
    try {
      while (this._q.length) {
        const {cmd, delayMs} = this._q.shift();
        await this._sendFn(cmd);
        await sleep(delayMs ?? this._delay);
      }
    } finally {
      this._busy = false;
    }
  }
}

// wand/transport.js
// WebSerial + WebBluetooth transports, exposing a common shape.
import { enc, dec, u8FromDV, sleep } from "./protocol.js";

const UUID_BATT_SVC = "battery_service";
const UUID_BATT_CHR = "battery_level"; // 0x2A19

export class SerialTransport {
  constructor({ baudRate=9600, onTextChunk }) {
    this.baudRate = baudRate;
    this.onTextChunk = onTextChunk;
    this.port = null;
    this.reader = null;
    this.writer = null;
    this._reading = false;
  }

  get isConnected() { return !!this.port; }

  async connect() {
    if (!("serial" in navigator)) throw new Error("WebSerial not supported in this browser.");
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: this.baudRate });
    this.writer = this.port.writable.getWriter();
    this._startReadLoop();
  }

  async disconnect() {
    this._reading = false;
    try { await this.reader?.cancel?.(); } catch {}
    try { this.reader?.releaseLock?.(); } catch {}
    try { this.writer?.releaseLock?.(); } catch {}
    try { await this.port?.close?.(); } catch {}
    this.port = null;
    this.reader = null;
    this.writer = null;
  }

  async write(text) {
    if (!this.writer) throw new Error("Serial writer not available.");
    await this.writer.write(enc.encode(text));
  }

  async _startReadLoop() {
    this._reading = true;
    this.reader = this.port.readable.getReader();
    while (this._reading) {
      const { value, done } = await this.reader.read();
      if (done) break;
      if (value) this.onTextChunk(dec.decode(value));
    }
  }
}

export class BleTransport {
  constructor({ onTextChunk }) {
    this.onTextChunk = onTextChunk;
    this.device = null;
    this.char = null;
    this._onNotify = null;
  }

  get isConnected() { return !!this.char; }

  async connect() {
    if (!("bluetooth" in navigator)) throw new Error("WebBluetooth not supported in this browser.");
    const dev = await navigator.bluetooth.requestDevice({
      filters: [{ services: [UUID_BATT_SVC] }],
      optionalServices: [UUID_BATT_SVC, "generic_access", "device_information"],
    });
    this.device = dev;
    dev.addEventListener("gattserverdisconnected", () => this.disconnect());

    const server = await dev.gatt.connect();
    const svc = await server.getPrimaryService(UUID_BATT_SVC);
    const chr = await svc.getCharacteristic(UUID_BATT_CHR);
    this.char = chr;

    await chr.startNotifications();
    this._onNotify = (ev) => {
      const u8 = u8FromDV(ev.target.value);
      const chunk = dec.decode(u8);
      this.onTextChunk(chunk);
    };
    chr.addEventListener("characteristicvaluechanged", this._onNotify);
  }

  async disconnect() {
    try {
      if (this.char && this._onNotify) {
        this.char.removeEventListener("characteristicvaluechanged", this._onNotify);
      }
    } catch {}
    try { await this.char?.stopNotifications?.().catch(()=>{}); } catch {}
    try { await this.device?.gatt?.disconnect?.(); } catch {}
    this.device = null;
    this.char = null;
    this._onNotify = null;
  }

  async write(text) {
    if (!this.char) throw new Error("BLE characteristic missing");
    await this.char.writeValue(enc.encode(text));
    await sleep(35);
  }
}

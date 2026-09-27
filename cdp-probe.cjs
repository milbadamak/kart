/* raw CDP probe: launch headless Edge, open real page, run interaction, print JSON.
   usage: node cdp-probe.cjs <url> <js-expression-returning-promise-or-value> */
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const crypto = require('crypto');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;

function getJSON(path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, r => {
      let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

class WS {
  constructor(url) {
    const u = new URL(url);
    this.sock = net.connect(Number(u.port), u.hostname);
    this.key = crypto.randomBytes(16).toString('base64');
    this.buf = Buffer.alloc(0);
    this.handlers = new Map();
    this.msgs = [];
    this.onopen = null;
    this.sock.on('connect', () => {
      this.sock.write(`GET ${u.pathname} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${this.key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    let handshaken = false;
    this.sock.on('data', d => {
      if (!handshaken) {
        const i = d.indexOf('\r\n\r\n');
        if (i < 0) return;
        handshaken = true;
        this.buf = d.slice(i + 4);
        if (this.onopen) this.onopen();
      } else this.buf = Buffer.concat([this.buf, d]);
      this._drain();
    });
    this.sock.on('error', e => this.msgs.push({ error: String(e) }));
  }
  _drain() {
    while (true) {
      const b = this.buf;
      if (b.length < 2) return;
      const op = b[0] & 0x0f, len0 = b[1] & 0x7f;
      let off = 2, len = len0;
      if (len0 === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len0 === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (b.length < off + len) return;
      const payload = b.slice(off, off + len);
      this.buf = b.slice(off + len);
      if (op === 1) {
        const j = JSON.parse(payload.toString());
        const h = this.handlers.get(j.id);
        if (h) { this.handlers.delete(j.id); h(j); }
      }
    }
  }
  send(obj) {
    const s = JSON.stringify(obj);
    const p = Buffer.from(s);
    const mask = crypto.randomBytes(4);
    let head;
    if (p.length < 126) head = Buffer.from([0x81, 0x80 | p.length]);
    else if (p.length < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0xFE; head.writeUInt16BE(p.length, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0xFF; head.writeBigUInt64BE(BigInt(p.length), 2); }
    const m = Buffer.concat([head, mask, Buffer.from(p.map((x, i) => x ^ mask[i % 4]))]);
    this.sock.write(m);
    return obj.id;
  }
  call(method, params) {
    const id = Math.floor(Math.random() * 1e9);
    return new Promise((res, rej) => {
      this.handlers.set(id, j => j.error ? rej(new Error(JSON.stringify(j.error))) : res(j.result));
      const t = setTimeout(() => { this.handlers.delete(id); rej(new Error('timeout ' + method)); }, 60000);
      const orig = this.handlers.get(id);
      this.handlers.set(id, j => { clearTimeout(t); orig(j); });
      this.send({ id, method, params });
    });
  }
}

(async () => {
  const url = process.argv[2], expr = process.argv[3];
  const args = ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, 'about:blank'];
  if (process.env.EDGE_ARGS) args.push(...process.env.EDGE_ARGS.split(' '));
  const proc = spawn(EDGE, args, { stdio: 'ignore' });
  let ws = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      const list = await getJSON('/json/list');
      const page = list.find(t => t.type === 'page');
      if (!page) continue;
      ws = new WS(page.webSocketDebuggerUrl);
      await new Promise(r => ws.onopen = r);
      break;
    } catch (e) { /* retry */ }
  }
  if (!ws) { console.log('CDP_FAIL: could not attach'); process.exit(1); }
  await ws.call('Page.enable', {});
  await ws.call('Runtime.enable', {});
  if (process.env.BLOCK) {
    await ws.call('Network.enable', {});
    await ws.call('Network.setBlockedURLs', { urls: process.env.BLOCK.split('|') });
  }
  if (process.env.EMULATE) {
    const [w, h] = process.env.EMULATE.split('x').map(Number);
    await ws.call('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: w < 700 });
  }
  await ws.call('Page.navigate', { url });
  await sleep(6000);
  try {
    const r = await ws.call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 60000 });
    if (r.exceptionDetails) console.log('EVAL_EXC: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    else console.log(typeof r.result.value === 'string' ? r.result.value : JSON.stringify(r.result.value ?? r.result, null, 1));
  } catch (e) { console.log('EVAL_FAIL: ' + e.message); }
  proc.kill(); process.exit(0);
})();

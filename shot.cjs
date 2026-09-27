/* screenshot helper: node shot.cjs <url> <out.png> [WxH] */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const PORT = 9334;
const getJSON = path => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { exec } = require('child_process');
(async () => {
  const url = process.argv[2], out = process.argv[3], em = (process.argv[4] || '1280x800').split('x').map(Number);
  const proc = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`, `--window-size=${em[0]},${em[1]}`, 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try { const l = await getJSON('/json/list'); const p = l.find(t => t.type === 'page'); if (!p) continue;
      const net = require('net'), crypto = require('crypto');
      const u = new URL(p.webSocketDebuggerUrl);
      const sock = net.connect(Number(u.port), u.hostname);
      const key = crypto.randomBytes(16).toString('base64');
      sock.on('connect', () => sock.write(`GET ${u.pathname} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
      let buf = Buffer.alloc(0), hand = false, id = 0; const handlers = new Map(); const msgs = [];
      sock.on('data', d => {
        if (!hand) { const idx = d.indexOf('\r\n\r\n'); if (idx < 0) return; hand = true; buf = d.slice(idx + 4); onOpen(); } else buf = Buffer.concat([buf, d]);
        drain();
      });
      function drain() {
        while (buf.length >= 2) {
          const op = buf[0] & 0xf, l0 = buf[1] & 0x7f; let off = 2, len = l0;
          if (l0 === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
          else if (l0 === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
          if (buf.length < off + len) return;
          const pl = buf.slice(off, off + len); buf = buf.slice(off + len);
          if (op === 1) { const j = JSON.parse(pl.toString()); if (handlers.has(j.id)) { handlers.get(j.id)(j); handlers.delete(j.id); } else msgs.push(j); }
        }
      }
      function send(method, params) {
        return new Promise((res, rej) => {
          id++; const t = id;
          handlers.set(t, j => j.error ? rej(new Error(JSON.stringify(j.error))) : res(j.result));
          const s = JSON.stringify({ id: t, method, params });
          const p = Buffer.from(s); const mask = crypto.randomBytes(4);
          let head;
          if (p.length < 126) head = Buffer.from([0x81, 0x80 | p.length]);
          else if (p.length < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0xFE; head.writeUInt16BE(p.length, 2); }
          else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0xFF; head.writeBigUInt64BE(BigInt(p.length), 2); }
          sock.write(Buffer.concat([head, mask, Buffer.from(p.map((x, i) => x ^ mask[i % 4]))]));
          setTimeout(() => rej(new Error('timeout ' + method)), 60000);
        });
      }
      ws = { send };
      var onOpen;
      await new Promise(r => onOpen = r);
      break;
    } catch (e) { }
  }
  if (!ws) { console.log('WS_FAIL'); process.exit(1); }
  await ws.send('Page.enable', {});
  await ws.send('Emulation.setDeviceMetricsOverride', { width: em[0], height: em[1], deviceScaleFactor: 1, mobile: false });
  await ws.send('Page.navigate', { url });
  await sleep(7000);
  const shot = await ws.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('saved ' + out);
  proc.kill(); process.exit(0);
})();

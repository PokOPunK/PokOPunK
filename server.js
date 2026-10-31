/* เซิร์ฟเวอร์เล็กๆ: เสิร์ฟหน้าเว็บแอพ + ตัวกลางเรียก Gemini โดยเก็บ API key ไว้ฝั่งเซิร์ฟเวอร์
 * ตัวแปร: GEMINI_API_KEY, APP_PASSWORD (จำเป็น) / GEMINI_MODEL, PORT, GEMINI_BASE (ไม่บังคับ) ไม่ต้องมีไลบรารีเสริม (Node 18+) */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const P = require('./parser.js');

const PORT = +process.env.PORT || 3000;
const KEY = process.env.GEMINI_API_KEY || '', PASS = process.env.APP_PASSWORD || '';
const BASE = process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com/v1beta/';
let model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const MAX_BODY = 10 * 1024 * 1024;
if (require.main === module && (!KEY || PASS.length < 6)) {
  console.error('ต้องตั้ง GEMINI_API_KEY และ APP_PASSWORD (อย่างน้อย 6 ตัวอักษร)'); process.exit(1);
}

const FILES = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/parser.js': 'parser.js', '/style.css': 'style.css', '/sw.js': 'sw.js', '/manifest.json': 'manifest.json', '/icon.svg': 'icon.svg' };
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json', svg: 'image/svg+xml' };

// ---- กันเดารหัส / กันใช้เกินโควตา (ต่อ IP, ในหน่วยความจำ) ----
const fails = new Map(), hits = new Map();
const ipOf = (req) => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
function bump(map, ip, windowMs) { const now = Date.now(); const a = (map.get(ip) || []).filter((t) => now - t < windowMs); a.push(now); map.set(ip, a); return a.length; }
const count = (map, ip, windowMs) => (map.get(ip) || []).filter((t) => Date.now() - t < windowMs).length;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const passOk = (given) => crypto.timingSafeEqual(sha(given || ''), sha(PASS));

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ---- Gemini ----
async function resolveModel() {
  const r = await fetch(BASE + 'models?pageSize=200', { headers: { 'x-goog-api-key': KEY } });
  if (!r.ok) throw new Error(`GEMINI ${r.status}: ${(await r.text()).replace(/\s+/g, ' ').slice(0, 200)}`);
  const names = ((await r.json()).models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /^gemini-/.test(n) && /flash/.test(n) && !/lite|image|tts|live|audio|embed|thinking|exp|robotics|computer|learn/.test(n));
  if (!names.length) throw new Error('GEMINI: ไม่มีโมเดล flash ที่ใช้อ่านรูปได้');
  const ver = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [0, 0])[1]);
  names.sort((x, y) => (/-latest$/.test(y) - /-latest$/.test(x)) || (/preview/.test(x) - /preview/.test(y)) || ver(y) - ver(x));
  return names[0];
}
const callGemini = (b64, mime) => fetch(`${BASE}models/${encodeURIComponent(model)}:generateContent`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
  body: JSON.stringify({ contents: [{ parts: [{ text: P.AI_PROMPT }, { inline_data: { mime_type: mime, data: b64 } }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } })
});
async function readSlip(b64, mime) {
  let r = await callGemini(b64, mime);
  if (r.status === 404) { model = await resolveModel(); console.log('ใช้โมเดล', model); r = await callGemini(b64, mime); }
  if (!r.ok) throw new Error(`GEMINI ${r.status}: ${(await r.text()).replace(/\s+/g, ' ').slice(0, 200)}`);
  const j = await r.json();
  const txt = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').replace(/^\s*```(?:json)?|```\s*$/g, '').trim();
  return JSON.parse(txt);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'); const ip = ipOf(req);
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { slip: true });
    if (url.pathname === '/api/read') {
      if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
      if (count(fails, ip, 600000) >= 10) return send(res, 429, { error: 'ลองรหัสผิดบ่อยเกินไป รอ 10 นาที' });
      if (!passOk(req.headers['x-slip-pass'])) { bump(fails, ip, 600000); return send(res, 401, { error: 'รหัสผ่านไม่ถูกต้อง' }); }
      if (bump(hits, ip, 3600000) > 120) return send(res, 429, { error: 'ใช้เกินโควตาต่อชั่วโมง' });
      let body; try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, e.code === 413 ? 413 : 400, { error: e.code === 413 ? 'รูปใหญ่เกินไป' : 'JSON ไม่ถูกต้อง' }); }
      const b64 = String(body.image_b64 || '').replace(/^data:[^,]+,/, '');
      if (!/^[A-Za-z0-9+/=\s]+$/.test(b64) || b64.length < 20) return send(res, 400, { error: 'image_b64 ไม่ถูกต้อง' });
      const mime = /^image\/(jpeg|png|webp|heic|heif)$/.test(body.mime || '') ? body.mime : 'image/jpeg';
      try { const slip = await readSlip(b64.replace(/\s+/g, ''), mime); return send(res, 200, { slip, slip_json: JSON.stringify(slip), model }); } // slip_json: ให้ Shortcuts ดึงเป็นข้อความได้ตรงๆ
      catch (e) { console.error(e.message); return send(res, 502, { error: String(e.message).slice(0, 300) }); }
    }
    const f = req.method === 'GET' && FILES[url.pathname];
    if (!f) return send(res, 404, { error: 'not found' });
    const buf = fs.readFileSync(path.join(__dirname, f));
    send(res, 200, buf, TYPES[f.split('.').pop()]);
  } catch (e) { console.error(e); send(res, 500, { error: 'server error' }); }
});

if (require.main === module) server.listen(PORT, () => console.log(`สลิปเซ้นส์ พร้อมที่พอร์ต ${PORT}`));
module.exports = server;

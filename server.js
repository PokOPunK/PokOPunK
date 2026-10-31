/* สลิปเซ้นส์ – เซิร์ฟเวอร์: เสิร์ฟหน้าเว็บ, อ่านสลิปด้วย Gemini (คีย์อยู่ฝั่งเซิร์ฟเวอร์), เก็บรายการใน SQLite
 * ตัวแปร: GEMINI_API_KEY, APP_PASSWORD (จำเป็น) / GEMINI_MODEL, DB_PATH, PORT, GEMINI_BASE (ไม่บังคับ)
 * ไม่ต้องลงไลบรารีเสริม ใช้ Node 22+ (node:sqlite ในตัว) */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const P = require('./parser.js');

const PORT = +process.env.PORT || 3000;
const KEY = process.env.GEMINI_API_KEY || '', PASS = process.env.APP_PASSWORD || '';
const BASE = process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com/v1beta/';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'slips.db');
let model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const MAX_BODY = 12 * 1024 * 1024;
const CAT = Object.fromEntries(P.CATEGORIES.map((c) => [c.id, c]));

// ---------- ฐานข้อมูล ----------
function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY, date TEXT NOT NULL, time TEXT, amount REAL, merchant TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', thumb TEXT, needs_review INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS items_date ON items(date);
    CREATE TABLE IF NOT EXISTS rules (key TEXT PRIMARY KEY, category TEXT NOT NULL);
    -- รูปที่เคยส่งมาแล้ว (กันอ่านซ้ำ/บันทึกซ้ำ และประหยัดโควตา Gemini)
    CREATE TABLE IF NOT EXISTS seen (hash TEXT PRIMARY KEY, status TEXT NOT NULL, item_id TEXT, at INTEGER NOT NULL);`);
  return db;
}
let db;

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
const newId = () => Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
const rowToItem = (r) => r && ({ id: r.id, date: r.date, time: r.time, amount: r.amount, merchant: r.merchant, category: r.category,
  note: r.note, thumb: r.thumb, needsReview: !!r.needs_review, source: r.source, createdAt: r.created_at });

function isDup(it, exceptId = '') {
  if (it.amount == null) return false;
  const rows = db.prepare('SELECT id, merchant FROM items WHERE amount = ? AND date = ? AND COALESCE(time, \'\') = ? AND id <> ?')
    .all(it.amount, it.date, it.time || '', exceptId);
  return rows.some((r) => P.ruleKey(r.merchant) === P.ruleKey(it.merchant));
}
function insertItem(it) {
  const now = Date.now(), id = it.id || newId();
  db.prepare(`INSERT INTO items (id, date, time, amount, merchant, category, note, thumb, needs_review, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, it.date, it.time, it.amount, it.merchant, it.category, it.note || '',
    it.thumb || null, it.needsReview ? 1 : 0, it.source || 'manual', it.createdAt || now, now);
  return rowToItem(db.prepare('SELECT * FROM items WHERE id = ?').get(id));
}
function learn(merchant, category) {
  const k = P.ruleKey(merchant);
  if (k.length >= 3) db.prepare('INSERT INTO rules (key, category) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET category = excluded.category').run(k, category);
}
const learned = (merchant) => db.prepare('SELECT category FROM rules WHERE key = ?').get(P.ruleKey(merchant))?.category;

/** ตรวจข้อมูลที่ส่งมาจากหน้าเว็บ คืน [item, error] */
function cleanItem(b) {
  b = b || {};
  const amount = b.amount === null || b.amount === '' || b.amount === undefined ? null : Number(b.amount);
  if (amount !== null && !(amount >= 0 && amount < 1e8)) return [null, 'จำนวนเงินไม่ถูกต้อง'];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) return [null, 'วันที่ไม่ถูกต้อง'];
  if (b.time && !/^\d{2}:\d{2}$/.test(b.time)) return [null, 'เวลาไม่ถูกต้อง'];
  if (!CAT[b.category]) return [null, 'หมวดไม่ถูกต้อง'];
  const thumb = typeof b.thumb === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(b.thumb) && b.thumb.length < 60000 ? b.thumb : null;
  return [{ amount: amount === null ? null : Math.round(amount * 100) / 100, date: b.date, time: b.time || null,
    merchant: String(b.merchant || '').trim().slice(0, 80), category: b.category, note: String(b.note || '').trim().slice(0, 120), thumb }, null];
}

// ---------- Gemini ----------
const BUSY = new Set([429, 500, 502, 503, 504]); // ปัญหาชั่วคราวฝั่ง Google: ลองใหม่/สลับรุ่นได้
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let modelsCache = { at: 0, names: [] };
/** รายชื่อโมเดล flash ที่ใช้อ่านรูปได้ เรียงจากที่อยากใช้ที่สุด (รุ่น lite อยู่ท้ายสุด ใช้เป็นตัวสำรอง) */
async function listModels() {
  if (Date.now() - modelsCache.at < 3600000 && modelsCache.names.length) return modelsCache.names;
  const r = await fetch(BASE + 'models?pageSize=200', { headers: { 'x-goog-api-key': KEY }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`GEMINI ${r.status}: ${(await r.text()).replace(/\s+/g, ' ').slice(0, 200)}`);
  const ver = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [0, 0])[1]);
  const names = ((await r.json()).models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /^gemini-/.test(n) && /flash/.test(n) && !/image|tts|live|audio|embed|thinking|exp|robotics|computer|learn/.test(n))
    // ไม่ใช่ lite ก่อน, alias -latest ก่อน, รุ่นเสถียรก่อน preview, แล้วเลขเวอร์ชันสูงสุด
    .sort((x, y) => (/lite/.test(x) - /lite/.test(y)) || (/-latest$/.test(y) - /-latest$/.test(x)) || (/preview/.test(x) - /preview/.test(y)) || ver(y) - ver(x));
  if (!names.length) throw new Error('GEMINI: ไม่มีโมเดล flash ที่ใช้อ่านรูปได้');
  modelsCache = { at: Date.now(), names };
  return names;
}
async function callGemini(b64, mime, m) {
  try {
    return await fetch(`${BASE}models/${encodeURIComponent(m)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY }, signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ contents: [{ parts: [{ text: P.AI_PROMPT }, { inline_data: { mime_type: mime, data: b64 } }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 } })
    });
  } catch (e) { // หมดเวลา/เน็ตหลุด ถือเป็นปัญหาชั่วคราว
    return { ok: false, status: 504, text: async () => 'timeout: ' + e.message };
  }
}
async function readSlip(b64, mime) {
  const deadline = Date.now() + 55000; // ไม่ให้นานจน Shortcut/เบราว์เซอร์หมดเวลา
  let r = await callGemini(b64, mime, model);
  if (r.status === 404) { model = (await listModels())[0]; console.log('ใช้โมเดล', model); r = await callGemini(b64, mime, model); }
  for (const wait of [1500, 4000]) { // Google ยุ่ง -> รอแล้วลองรุ่นเดิมอีก
    if (!BUSY.has(r.status) || Date.now() + wait > deadline) break;
    await sleep(wait); r = await callGemini(b64, mime, model);
  }
  if (BUSY.has(r.status)) { // ยังยุ่ง -> ลองรุ่นอื่นชั่วคราว (ไม่เปลี่ยนรุ่นหลัก)
    let others = [];
    try { others = (await listModels()).filter((n) => n !== model).slice(0, 3); } catch { /* ใช้ error เดิม */ }
    for (const m of others) {
      if (Date.now() > deadline) break;
      const r2 = await callGemini(b64, mime, m);
      r = r2;
      if (r2.ok) { console.log('Gemini ยุ่ง ใช้รุ่นสำรอง', m); break; }
      if (!BUSY.has(r2.status) && r2.status !== 404) break;
    }
  }
  if (!r.ok) throw Object.assign(new Error(`GEMINI ${r.status}: ${(await r.text()).replace(/\s+/g, ' ').slice(0, 200)}`), { busy: BUSY.has(r.status) });
  const j = await r.json();
  const txt = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').replace(/^\s*```(?:json)?|```\s*$/g, '').trim();
  return P.normalizeAI(JSON.parse(txt));
}

/** รับรูปสลิป -> อ่าน -> บันทึก  คืน { status: saved|review|dup|notslip, item?, message } */
async function ingest({ image_b64, mime, thumb }, source) {
  const b64 = String(image_b64 || '').replace(/^data:[^,]+,/, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(b64) || b64.length < 20) throw Object.assign(new Error('image_b64 ไม่ถูกต้อง'), { http: 400 });
  const hash = crypto.createHash('sha256').update(b64).digest('hex');
  const prev = db.prepare('SELECT status FROM seen WHERE hash = ?').get(hash);
  if (prev) return { status: prev.status === 'notslip' ? 'notslip' : 'dup', message: prev.status === 'notslip' ? 'ไม่ใช่สลิป' : 'สลิปนี้บันทึกไว้แล้ว' };
  const imgMime = /^image\/(jpeg|png|webp|heic|heif)$/.test(mime || '') ? mime : 'image/jpeg';
  const r = await readSlip(b64, imgMime);
  const mark = (status, itemId) => db.prepare('INSERT OR REPLACE INTO seen (hash, status, item_id, at) VALUES (?, ?, ?, ?)').run(hash, status, itemId || null, Date.now());
  if (!r.isSlip) { mark('notslip'); return { status: 'notslip', message: 'ไม่ใช่สลิป' }; }
  const it = { amount: r.amount, date: r.date || today(), time: r.time, merchant: r.merchant,
    category: (r.merchant && learned(r.merchant)) || r.category, needsReview: !(r.amount && r.date), source,
    thumb: typeof thumb === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(thumb) && thumb.length < 60000 ? thumb : null };
  if (isDup(it)) { mark('dup'); return { status: 'dup', message: 'สลิปนี้บันทึกไว้แล้ว' }; }
  const item = insertItem(it);
  mark(item.needsReview ? 'review' : 'saved', item.id);
  const c = CAT[item.category];
  return { status: item.needsReview ? 'review' : 'saved', item,
    message: item.needsReview ? `⚠️ อ่านไม่ครบ รอตรวจในแอพ (${item.merchant || 'ไม่ทราบผู้รับ'})`
      : `✅ ฿${item.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} · ${c.name} · ${item.merchant}` };
}

// ---------- HTTP ----------
const fails = new Map(), hits = new Map();
const ipOf = (req) => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
function bump(map, ip, ms) { const now = Date.now(); const a = (map.get(ip) || []).filter((t) => now - t < ms); a.push(now); map.set(ip, a); return a.length; }
const recent = (map, ip, ms) => (map.get(ip) || []).filter((t) => Date.now() - t < ms).length;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const passOk = (given) => crypto.timingSafeEqual(sha(given || ''), sha(PASS));

function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('ข้อมูลใหญ่เกินไป'), { http: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(Object.assign(new Error('JSON ไม่ถูกต้อง'), { http: 400 })); } });
    req.on('error', reject);
  });
}
function csv() {
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = db.prepare('SELECT * FROM items ORDER BY date, time').all().map((r) =>
    [r.date, r.time || '', r.merchant, CAT[r.category]?.name || r.category, r.amount == null ? '' : r.amount.toFixed(2), r.note, r.needs_review ? 'รอตรวจ' : ''].map(q).join(','));
  return '\ufeff' + [['วันที่', 'เวลา', 'ผู้รับ/ร้านค้า', 'หมวดหมู่', 'จำนวนเงิน', 'หมายเหตุ', 'สถานะ'].map(q).join(','), ...rows].join('\n');
}

const FILES = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/parser.js': 'parser.js', '/style.css': 'style.css',
  '/sw.js': 'sw.js', '/manifest.json': 'manifest.json', '/icon.svg': 'icon.svg' };
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json', svg: 'image/svg+xml' };

async function api(req, res, url) {
  const ip = ipOf(req), p = url.pathname, m = req.method;
  if (p === '/api/health') return send(res, 200, { slip: true });
  if (recent(fails, ip, 600000) >= 10) return send(res, 429, { error: 'ลองรหัสผิดบ่อยเกินไป รอ 10 นาที' });
  if (!passOk(req.headers['x-slip-pass'])) { bump(fails, ip, 600000); return send(res, 401, { error: 'รหัสผ่านไม่ถูกต้อง' }); }

  if (p === '/api/ingest' && m === 'POST') {
    if (bump(hits, ip, 3600000) > 150) return send(res, 429, { error: 'ส่งรูปเกินโควตาต่อชั่วโมง' });
    const body = await readJson(req);
    try { return send(res, 200, await ingest(body, body.source === 'web' ? 'web' : 'shortcut')); }
    catch (e) {
      if (e.http) throw e;
      console.error(e.message);
      const msg = e.busy ? 'Gemini มีคนใช้เยอะชั่วคราว ลองใหม่อีกสักครู่' : 'อ่านสลิปไม่ได้: ' + String(e.message).slice(0, 160);
      return send(res, e.busy ? 503 : 502, { error: msg, message: '❌ ' + msg });
    }
  }
  if (p === '/api/items' && m === 'GET') {
    const month = url.searchParams.get('month');
    const rows = /^\d{4}-\d{2}$/.test(month || '') ? db.prepare('SELECT * FROM items WHERE date LIKE ? ORDER BY date DESC, time DESC').all(month + '-%')
      : db.prepare('SELECT * FROM items ORDER BY date DESC, time DESC').all();
    const review = db.prepare('SELECT id, date FROM items WHERE needs_review = 1 ORDER BY date DESC').all();
    return send(res, 200, { items: rows.map(rowToItem), review });
  }
  if (p === '/api/items' && m === 'POST') {
    const body = await readJson(req); const [it, err] = cleanItem(body.item);
    if (err) return send(res, 400, { error: err });
    if (isDup(it)) return send(res, 409, { error: 'มีรายการนี้อยู่แล้ว' });
    if (body.remember) learn(it.merchant, it.category);
    return send(res, 201, { item: insertItem(it) });
  }
  const one = p.match(/^\/api\/items\/([A-Za-z0-9]+)$/);
  if (one && m === 'PUT') {
    const cur = db.prepare('SELECT * FROM items WHERE id = ?').get(one[1]);
    if (!cur) return send(res, 404, { error: 'ไม่พบรายการ' });
    const body = await readJson(req); const [it, err] = cleanItem({ thumb: cur.thumb, ...body.item });
    if (err) return send(res, 400, { error: err });
    if (isDup(it, cur.id)) return send(res, 409, { error: 'มีรายการนี้อยู่แล้ว' });
    db.prepare('UPDATE items SET date=?, time=?, amount=?, merchant=?, category=?, note=?, thumb=?, needs_review=0, updated_at=? WHERE id=?')
      .run(it.date, it.time, it.amount, it.merchant, it.category, it.note, it.thumb, Date.now(), cur.id);
    if (body.remember) learn(it.merchant, it.category);
    return send(res, 200, { item: rowToItem(db.prepare('SELECT * FROM items WHERE id = ?').get(cur.id)) });
  }
  if (one && m === 'DELETE') { db.prepare('DELETE FROM items WHERE id = ?').run(one[1]); return send(res, 200, { ok: true }); }
  if (p === '/api/import' && m === 'POST') { // ย้ายข้อมูลเก่าจาก Safari (localStorage) ขึ้นเซิร์ฟเวอร์
    const body = await readJson(req); let added = 0, dups = 0, bad = 0;
    for (const raw of (Array.isArray(body.items) ? body.items : []).slice(0, 5000)) {
      const [it, err] = cleanItem(raw);
      if (err) bad++; else if (isDup(it)) dups++; else { insertItem({ ...it, source: 'import', createdAt: Number(raw.createdAt) || undefined }); added++; }
    }
    for (const [k, c] of Object.entries(body.rules || {})) if (CAT[c]) learn(k, c);
    return send(res, 200, { added, dups, bad });
  }
  if (p === '/api/export.csv' && m === 'GET') return send(res, 200, csv(), 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="slips-${today()}.csv"` });
  return send(res, 404, { error: 'not found' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    const f = req.method === 'GET' && FILES[url.pathname];
    if (!f) return send(res, 404, 'not found', 'text/plain');
    send(res, 200, fs.readFileSync(path.join(__dirname, f)), TYPES[f.split('.').pop()]);
  } catch (e) {
    if (e.http) return send(res, e.http, { error: e.message });
    console.error(e); send(res, 500, { error: 'server error' });
  }
});

function start(port = PORT, dbFile = DB_PATH) {
  db = openDb(dbFile);
  return new Promise((r) => server.listen(port, () => r(server)));
}
if (require.main === module) {
  if (!KEY || PASS.length < 8) { console.error('ต้องตั้ง GEMINI_API_KEY และ APP_PASSWORD (อย่างน้อย 8 ตัวอักษร)'); process.exit(1); }
  start().then(() => console.log(`สลิปเซ้นส์ พร้อมที่พอร์ต ${PORT} (ฐานข้อมูล ${DB_PATH})`));
}
module.exports = { start, server };

// ทดสอบ server.js กับ Gemini จำลอง (ไม่ใช้เน็ต):  node test/server.test.js
const http = require('http'), assert = require('assert');
let next = []; const seen = { key: null, models: [], calls: 0 };
const mock = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    seen.key = req.headers['x-goog-api-key'];
    if (req.url.startsWith('/v1beta/models?')) return res.end(JSON.stringify({ models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3-flash-preview'].map((n) => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) }));
    const m = req.url.split('/models/')[1].split(':')[0]; seen.models.push(m);
    if (m === 'gemini-flash-latest') { res.statusCode = 404; return res.end('{"error":"no model"}'); }
    seen.calls++;
    const out = next.shift() || { is_slip: false };
    if (out === 'ERR') { res.statusCode = 429; return res.end('{"error":"quota"}'); }
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify(out) + '\n```' }] } }] }));
  });
});
const img = (s) => Buffer.from(('slip-' + s).padEnd(60, '.')).toString('base64');

mock.listen(0, async () => {
  Object.assign(process.env, { GEMINI_API_KEY: 'SECRETKEY', APP_PASSWORD: 'pass12345', GEMINI_BASE: `http://127.0.0.1:${mock.address().port}/v1beta/` });
  const { start } = require('../server.js');
  const app = await start(0, ':memory:');
  const base = `http://127.0.0.1:${app.address().port}`;
  const H = { 'x-slip-pass': 'pass12345', 'Content-Type': 'application/json' };
  const call = async (method, path, body, h = H) => { const r = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j }; };

  // ไฟล์และสิทธิ์
  assert.strictEqual((await call('GET', '/api/health', undefined, {})).s, 200);
  assert.ok((await (await fetch(base + '/')).text()).includes('สลิปเซ้นส์'));
  for (const f of ['/server.js', '/.env', '/data/slips.db', '/%2e%2e/server.js', '/package.json']) assert.strictEqual((await fetch(base + f)).status, 404, f);
  assert.strictEqual((await call('GET', '/api/items', undefined, {})).s, 401);
  assert.strictEqual((await call('POST', '/api/ingest', { image_b64: img(0) }, { ...H, 'x-slip-pass': 'nope' })).s, 401);
  assert.strictEqual((await call('POST', '/api/ingest', '{bad')).s, 400);
  assert.strictEqual((await call('POST', '/api/ingest', { image_b64: '!!' })).s, 400);

  // 1) สลิปครบ -> บันทึกเลย, เลือกโมเดลเสถียรเอง
  next = [{ is_slip: true, amount: 125, date: '2026-10-31', time: '18:34', merchant: 'ร้าน อเมซอน', category: 'food' }];
  let r = await call('POST', '/api/ingest', { image_b64: img(1) });
  assert.strictEqual(r.j.status, 'saved'); assert.ok(r.j.message.includes('฿125.00'));
  assert.deepStrictEqual(seen.models.slice(0, 2), ['gemini-flash-latest', 'gemini-2.5-flash']); assert.strictEqual(seen.key, 'SECRETKEY');
  assert.ok(!JSON.stringify(r.j).includes('SECRETKEY'));
  // 2) รูปเดิมส่งซ้ำ -> dup โดยไม่เรียก Gemini
  const before = seen.calls; r = await call('POST', '/api/ingest', { image_b64: img(1) });
  assert.strictEqual(r.j.status, 'dup'); assert.strictEqual(seen.calls, before);
  // 3) รูปต่างแต่ข้อมูลซ้ำ -> dup
  next = [{ is_slip: true, amount: 125, date: '2026-10-31', time: '18:34', merchant: 'ร้านอเมซอน', category: 'food' }];
  assert.strictEqual((await call('POST', '/api/ingest', { image_b64: img(2) })).j.status, 'dup');
  // 4) ไม่ใช่สลิป
  next = [{ is_slip: false }];
  assert.strictEqual((await call('POST', '/api/ingest', { image_b64: img(3) })).j.status, 'notslip');
  // 5) อ่านไม่ครบ -> review (วันที่ใช้วันนี้ไปก่อน)
  next = [{ is_slip: true, amount: null, date: null, merchant: 'นาย ก', category: 'transfer' }];
  r = await call('POST', '/api/ingest', { image_b64: img(4) });
  assert.strictEqual(r.j.status, 'review'); const revId = r.j.item.id;
  let list = await call('GET', '/api/items');
  assert.strictEqual(list.j.review.length, 1);
  // 6) Gemini ล่ม -> 502 พร้อมข้อความ และส่งรูปเดิมใหม่ได้ภายหลัง
  next = ['ERR']; r = await call('POST', '/api/ingest', { image_b64: img(5) });
  assert.strictEqual(r.s, 502); assert.ok(r.j.message.startsWith('❌'));
  next = [{ is_slip: true, amount: 50, date: '2026-10-30', merchant: 'Grab', category: 'travel' }];
  assert.strictEqual((await call('POST', '/api/ingest', { image_b64: img(5) })).j.status, 'saved');

  // แก้ไขรายการที่รอตรวจ + จำหมวด
  r = await call('PUT', '/api/items/' + revId, { item: { amount: 300, date: '2026-10-29', merchant: 'นาย ก', category: 'food' }, remember: true });
  assert.strictEqual(r.s, 200); assert.strictEqual(r.j.item.needsReview, false);
  assert.strictEqual((await call('GET', '/api/items')).j.review.length, 0);
  next = [{ is_slip: true, amount: 80, date: '2026-10-28', merchant: 'นาย  ก', category: 'transfer' }];
  assert.strictEqual((await call('POST', '/api/ingest', { image_b64: img(6) })).j.item.category, 'food', 'ต้องใช้หมวดที่จำไว้');

  // เพิ่มเอง / ตรวจข้อมูล / ซ้ำ / ลบ
  assert.strictEqual((await call('POST', '/api/items', { item: { amount: 10, date: 'bad', category: 'food' } })).s, 400);
  assert.strictEqual((await call('POST', '/api/items', { item: { amount: 10, date: '2026-10-01', category: 'nope' } })).s, 400);
  r = await call('POST', '/api/items', { item: { amount: 3200, date: '2026-10-02', merchant: 'KTC', category: 'cc', note: 'บิล ต.ค.' } });
  assert.strictEqual(r.s, 201);
  assert.strictEqual((await call('POST', '/api/items', { item: { amount: 3200, date: '2026-10-02', merchant: 'KTC', category: 'cc' } })).s, 409);
  assert.strictEqual((await call('DELETE', '/api/items/' + r.j.item.id)).s, 200);

  // ย้ายข้อมูลเก่า
  r = await call('POST', '/api/import', { items: [{ amount: 99, date: '2026-09-01', merchant: 'Shopee', category: 'shopping' }, { amount: 125, date: '2026-10-31', time: '18:34', merchant: 'ร้าน อเมซอน', category: 'food' }, { date: 'x' }], rules: { 'shopee': 'shopping' } });
  assert.deepStrictEqual(r.j, { added: 1, dups: 1, bad: 1 });

  // รายเดือน + CSV
  list = await call('GET', '/api/items?month=2026-10');
  assert.strictEqual(list.j.items.length, 4);
  assert.ok(list.j.items.every((i) => i.date.startsWith('2026-10')));
  const c = await fetch(base + '/api/export.csv', { headers: H }); const buf = Buffer.from(await c.arrayBuffer());
  assert.ok(c.headers.get('content-type').includes('text/csv'));
  assert.deepStrictEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'ต้องมี BOM ให้ Excel อ่านไทยได้');
  assert.ok(buf.toString('utf8').includes('Shopee'));

  // เดารหัสผิดบ่อย -> ล็อก
  for (let i = 0; i < 10; i++) await call('GET', '/api/items', undefined, { 'x-slip-pass': 'bad' });
  assert.strictEqual((await call('GET', '/api/items')).s, 429);
  console.log('server ok');
  app.close(); mock.close();
});

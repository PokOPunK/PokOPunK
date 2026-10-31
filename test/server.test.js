// ทดสอบ server.js กับ Gemini จำลอง:  node test/server.test.js
const http = require('http'), assert = require('assert');
const seen = { key: null, model: [] };
const mock = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    seen.key = req.headers['x-goog-api-key'];
    if (req.url.startsWith('/v1beta/models?')) return res.end(JSON.stringify({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-2.5-flash-lite', supportedGenerationMethods: ['generateContent'] }] }));
    seen.model.push(req.url.split('/models/')[1].split(':')[0]);
    if (req.url.includes('gemini-flash-latest')) { res.statusCode = 404; return res.end('{"error":"no model"}'); }
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ is_slip: true, amount: 125, date: '2026-10-31', time: '18:34', merchant: 'Amazon', category: 'food' }) }] } }] }));
  });
});
mock.listen(0, async () => {
  process.env.GEMINI_API_KEY = 'SECRETKEY'; process.env.APP_PASSWORD = 'pass1234';
  process.env.GEMINI_BASE = `http://127.0.0.1:${mock.address().port}/v1beta/`;
  const app = require('../server.js'); await new Promise((r) => app.listen(0, r));
  const base = `http://127.0.0.1:${app.address().port}`;
  const post = (h, body) => fetch(base + '/api/read', { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const img = { image_b64: Buffer.from('x'.repeat(40)).toString('base64') };

  assert.strictEqual((await fetch(base + '/api/health')).status, 200);
  assert.ok((await (await fetch(base + '/')).text()).includes('สลิปเซ้นส์'));
  assert.strictEqual((await fetch(base + '/server.js')).status, 404, 'server.js ต้องไม่ถูกเสิร์ฟ');
  assert.strictEqual((await fetch(base + '/.env')).status, 404);
  assert.strictEqual((await fetch(base + '/%2e%2e/server.js')).status, 404);
  assert.strictEqual((await post({}, img)).status, 401);
  assert.strictEqual((await post({ 'x-slip-pass': 'wrong' }, img)).status, 401);
  assert.strictEqual((await post({ 'x-slip-pass': 'pass1234' }, '{bad')).status, 400);
  assert.strictEqual((await post({ 'x-slip-pass': 'pass1234' }, { image_b64: '!!' })).status, 400);
  const ok = await post({ 'x-slip-pass': 'pass1234' }, img); const j = await ok.json();
  assert.strictEqual(ok.status, 200); assert.strictEqual(j.slip.amount, 125); assert.strictEqual(JSON.parse(j.slip_json).amount, 125);
  assert.strictEqual(j.model, 'gemini-2.5-flash', 'ต้องเลือกรุ่นเสถียร ไม่เอา lite'); assert.strictEqual(seen.key, 'SECRETKEY');
  assert.ok(!JSON.stringify(j).includes('SECRETKEY'));
  for (let i = 0; i < 10; i++) await post({ 'x-slip-pass': 'bad' }, img); // เดารหัสผิดซ้ำ -> ถูกล็อก
  assert.strictEqual((await post({ 'x-slip-pass': 'pass1234' }, img)).status, 429, 'ต้องล็อก IP ที่เดารหัสผิดบ่อย');
  console.log('server ok', seen.model.join(' -> '));
  app.close(); mock.close();
});

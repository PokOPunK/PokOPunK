const assert = require('assert');
const P = require('../parser.js');

const cases = [
  { name: 'K+ โอนให้ร้านกาแฟ', text: `โอนเงินสำเร็จ\n31 ต.ค. 69 18:34 น.\nจาก นาย สมชาย ใจดี\nไปยัง ร้าน อเมซอน สาขา สยาม\nจำนวน: 125.00 บาท\nค่าธรรมเนียม: 0.00 บาท`,
    exp: { amount: 125, date: '2026-10-31', time: '18:34', category: 'food' } },
  { name: 'โอนให้บุคคล', text: `จำนวนเงิน 1,250.50 บาท\n5 มี.ค. 2569 09:05\nผู้รับ\nนางสาว สมหญิง รักดี`,
    exp: { amount: 1250.5, date: '2026-03-05', time: '09:05', category: 'transfer' } },
  { name: 'ค่าไฟ', text: `ชำระบิลสำเร็จ\n12/01/2569\nการไฟฟ้านครหลวง MEA\nยอดชำระ 2,340.75 THB`,
    exp: { amount: 2340.75, date: '2026-01-12', category: 'bills' } },
  { name: 'ปั๊มน้ำมัน (EN date)', text: `PTT Station\n03 Aug 2026 14:20\nTotal 1,000.00\nFee 0.00`,
    exp: { amount: 1000, date: '2026-08-03', time: '14:20', category: 'travel' } },
  { name: 'จ่ายบัตรเครดิต', text: `ชำระเงินสำเร็จ\n2 พ.ย. 2569 10:00\nบริษัท บัตรกรุงไทย KTC\nจำนวน 5,000.00 บาท`,
    exp: { amount: 5000, category: 'cc' } },
  { name: 'OCR แทรกช่องว่างในคำไทย', text: `จ ำ น ว น 89.00 บ า ท\n1 ก.ย. 69\nไปยัง เ ซ เ ว่ น`,
    exp: { amount: 89 } },
];
for (const c of cases) {
  const r = P.parseSlip(c.text);
  for (const k of Object.keys(c.exp)) assert.strictEqual(r[k], c.exp[k], `${c.name}: ${k} = ${r[k]} (want ${c.exp[k]})`);
  console.log('ok', c.name, JSON.stringify(r));
}

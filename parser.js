/* ตัวอ่านข้อความจากสลิป: จำนวนเงิน / วันที่ / ผู้รับ / หมวดหมู่
 * ใช้ได้ทั้งในเบราว์เซอร์ (window.SlipParser) และ Node (require) สำหรับเทส */
(function (root) {
  'use strict';

  const CATEGORIES = [
    { id: 'food', name: 'อาหาร/เครื่องดื่ม', icon: '🍜', color: '#f59e0b',
      kw: ['ร้านอาหาร', 'อาหาร', 'กาแฟ', 'คาเฟ่', 'cafe', 'coffee', 'starbucks', 'สตาร์บัคส์', 'อเมซอน', 'amazon', 'ชาบู', 'หมูกระทะ', 'ก๋วยเตี๋ยว', 'ข้าว', 'kfc', 'mcdonald', 'แมคโดนัลด์', 'pizza', 'พิซซ่า', 'สุกี้', 'ชานม', 'บุฟเฟ่ต์', 'เบเกอรี่', 'bakery', 'grabfood', 'lineman', 'ไลน์แมน', 'foodpanda', 'ฟู้ดแพนด้า', 'ส้มตำ', 'ปิ้งย่าง', 'ราเมน', 'sushi', 'ซูชิ', 'ไอศกรีม', 'เครื่องดื่ม', 'restaurant', 'kitchen', 'ครัว'] },
    { id: 'grocery', name: 'ของใช้/ซูเปอร์ฯ', icon: '🛒', color: '#10b981',
      kw: ['7-eleven', '7eleven', 'เซเว่น', 'seveneleven', 'lotus', 'โลตัส', 'bigc', 'บิ๊กซี', 'makro', 'แม็คโคร', 'tops', 'ท็อปส์', 'ซุปเปอร์', 'ซูเปอร์', 'supermarket', 'minimart', 'มินิมาร์ท', 'familymart', 'แฟมิลี่มาร์ท', 'cj', 'ตลาด', 'villa', 'วิลล่า'] },
    { id: 'travel', name: 'เดินทาง', icon: '🚗', color: '#3b82f6',
      kw: ['grab', 'bolt', 'taxi', 'แท็กซี่', 'bts', 'mrt', 'รถไฟ', 'น้ำมัน', 'ปตท', 'ptt', 'shell', 'เชลล์', 'บางจาก', 'bangchak', 'caltex', 'คาลเท็กซ์', 'ทางด่วน', 'easypass', 'อีซี่พาส', 'ที่จอดรถ', 'parking', 'airasia', 'แอร์เอเชีย', 'nokair', 'นกแอร์', 'สายการบิน', 'flight', 'ตั๋วเครื่องบิน', 'รถเมล์', 'วินมอเตอร์ไซค์', 'lalamove'] },
    { id: 'bills', name: 'บิล/สาธารณูปโภค', icon: '💡', color: '#8b5cf6',
      kw: ['ไฟฟ้า', 'การไฟฟ้า', 'mea', 'pea', 'ประปา', 'true', 'ทรู', 'ais', 'dtac', 'ดีแทค', 'เอไอเอส', 'อินเทอร์เน็ต', 'internet', '3bb', 'ค่าเช่า', 'ค่าน้ำ', 'ค่าไฟ', 'ประกัน', 'ผ่อน', 'กยศ', 'เติมเงิน', 'topup', 'ค่าโทรศัพท์', 'คอนโด', 'ส่วนกลาง'] },
    { id: 'shopping', name: 'ช้อปปิ้ง', icon: '🛍️', color: '#ec4899',
      kw: ['shopee', 'ช้อปปี้', 'lazada', 'ลาซาด้า', 'central', 'เซ็นทรัล', 'uniqlo', 'ยูนิโคล่', 'jib', 'banana', 'สยามพารากอน', 'เสื้อผ้า', 'เครื่องสำอาง', 'watsons', 'วัตสัน', 'ikea', 'อิเกีย', 'homepro', 'โฮมโปร', 'thaiwatsadu', 'ไทวัสดุ', 'robinson', 'โรบินสัน', 'the mall', 'เดอะมอลล์', 'tiktok', 'ออนไลน์', 'miniso', 'daiso', 'ไดโซะ', 'ซื้อของ'] },
    { id: 'health', name: 'สุขภาพ', icon: '💊', color: '#ef4444',
      kw: ['โรงพยาบาล', 'คลินิก', 'ร้านยา', 'เภสัช', 'boots', 'บู๊ทส์', 'hospital', 'clinic', 'ฟิตเนส', 'fitness', 'ทันตกรรม', 'หมอ', 'pharmacy', 'ยิม', 'spa', 'สปา', 'นวด', 'ตัดผม', 'salon'] },
    { id: 'fun', name: 'บันเทิง', icon: '🎬', color: '#06b6d4',
      kw: ['netflix', 'spotify', 'youtube', 'major', 'เมเจอร์', 'sfcinema', 'โรงหนัง', 'เกม', 'steam', 'playstation', 'disney', 'คาราโอเกะ', 'karaoke', 'concert', 'คอนเสิร์ต', 'ticketmelon', 'thaiticket', 'ท่องเที่ยว', 'โรงแรม', 'hotel', 'resort', 'รีสอร์ท', 'agoda', 'booking'] },
    { id: 'edu', name: 'การศึกษา', icon: '📚', color: '#14b8a6',
      kw: ['โรงเรียน', 'มหาวิทยาลัย', 'คอร์ส', 'course', 'ค่าเทอม', 'หนังสือ', 'ซีเอ็ด', 'se-ed', 'seed', 'kinokuniya', 'คิโนะคูนิยะ', 'tutor', 'กวดวิชา', 'udemy'] },
    { id: 'cc', name: 'ชำระบัตรเครดิต (ไม่นับรวม)', icon: '💳', color: '#a855f7', excluded: true,
      kw: ['บัตรเครดิต', 'creditcard', 'ชำระบัตร', 'ktc', 'cardx', 'การ์ดเอ็กซ์', 'firstchoice', 'เฟิร์สช้อยส์', 'ยูโอบีการ์ด', 'uobcard'] },
    { id: 'transfer', name: 'โอนให้บุคคล', icon: '👤', color: '#64748b',
      kw: ['นาย', 'นางสาว', 'น.ส.', 'นาง', 'ด.ช.', 'ด.ญ.', 'mr.', 'mrs.', 'miss', 'ms.'], weak: true },
    { id: 'other', name: 'อื่นๆ', icon: '📦', color: '#94a3b8', kw: [] }
  ];

  const MONTHS = {
    'มค': 1, 'มกราคม': 1, 'jan': 1, 'january': 1,
    'กพ': 2, 'กุมภาพันธ์': 2, 'feb': 2, 'february': 2,
    'มีค': 3, 'มีนาคม': 3, 'mar': 3, 'march': 3,
    'เมย': 4, 'เมษายน': 4, 'apr': 4, 'april': 4,
    'พค': 5, 'พฤษภาคม': 5, 'may': 5,
    'มิย': 6, 'มิถุนายน': 6, 'jun': 6, 'june': 6,
    'กค': 7, 'กรกฎาคม': 7, 'jul': 7, 'july': 7,
    'สค': 8, 'สิงหาคม': 8, 'aug': 8, 'august': 8,
    'กย': 9, 'กันยายน': 9, 'sep': 9, 'sept': 9, 'september': 9,
    'ตค': 10, 'ตุลาคม': 10, 'oct': 10, 'october': 10,
    'พย': 11, 'พฤศจิกายน': 11, 'nov': 11, 'november': 11,
    'ธค': 12, 'ธันวาคม': 12, 'dec': 12, 'december': 12
  };

  const isThai = (s) => /[฀-๿]/.test(s);
  const pad = (n) => String(n).padStart(2, '0');

  /** ลบช่องว่างที่ OCR ใส่แทรกระหว่างตัวอักษรไทยติดกัน */
  function tidy(text) {
    return String(text || '')
      .replace(/\r/g, '')
      .replace(/([฀-๿])[ \t]+(?=[฀-๿])/g, '$1')
      .replace(/[ \t]+/g, ' ')
      .split('\n').map((l) => l.trim()).join('\n');
  }

  function toNumber(str) {
    const n = parseFloat(String(str).replace(/,/g, ''));
    return isFinite(n) ? n : null;
  }

  function parseAmount(text) {
    const t = tidy(text);
    const NUM = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+\\.\\d{1,2}|\\d+)';
    const labeled = new RegExp(
      '(?:จำนวนเงิน|จำนวน|ยอดเงิน|ยอดรวม|ยอดชำระ|ชำระเงิน|รวมทั้งสิ้น|รวมเงิน|ยอดสุทธิ|สุทธิ|amount|total|net)[^\\d\\n]{0,15}' + NUM, 'i');
    let m = t.match(labeled);
    if (m) {
      const v = toNumber(m[1]);
      if (v && v > 0) return v;
    }
    // ตัวเลขที่ตามด้วย บาท / THB
    m = t.match(new RegExp(NUM + '\\s*(?:บาท|thb|baht)', 'i'));
    if (m) {
      const v = toNumber(m[1]);
      if (v && v > 0) return v;
    }
    // สำรอง: เลขทศนิยม 2 ตำแหน่งที่มากที่สุด (ไม่นับค่าธรรมเนียม/ยอดคงเหลือ)
    let best = null;
    for (const line of t.split('\n')) {
      if (/ค่าธรรมเนียม|fee|คงเหลือ|balance/i.test(line)) continue;
      const re = /(\d{1,3}(?:,\d{3})*\.\d{2})(?!\d)/g;
      let mm;
      while ((mm = re.exec(line))) {
        const v = toNumber(mm[1]);
        if (v && v < 10000000 && (best === null || v > best)) best = v;
      }
    }
    return best;
  }

  function monthFromToken(tok) {
    const k = tok.replace(/[.\s]/g, '').toLowerCase();
    if (MONTHS[k]) return MONTHS[k];
    if (/^[a-z]+$/.test(k) && MONTHS[k.slice(0, 3)]) return MONTHS[k.slice(0, 3)];
    return null;
  }

  function fixYear(y, thaiStyle) {
    if (y >= 2400) return y - 543;
    if (y >= 100) return y;
    return thaiStyle ? 1957 + y : 2000 + y; // 69 -> 2569 -> 2026
  }

  function validDate(y, m, d) {
    return y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  }

  function parseDateTime(text) {
    const t = tidy(text);
    let date = null;
    const re1 = /(\d{1,2})\s*([A-Za-z฀-๿][A-Za-z฀-๿.]{1,10})\s*(\d{2,4})/g;
    let m;
    while ((m = re1.exec(t))) {
      const mon = monthFromToken(m[2]);
      if (!mon) continue;
      const y = fixYear(+m[3], isThai(m[2]));
      if (validDate(y, mon, +m[1])) { date = `${y}-${pad(mon)}-${pad(+m[1])}`; break; }
    }
    if (!date) {
      const re2 = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/g;
      while ((m = re2.exec(t))) {
        const y = fixYear(+m[3], +m[3] < 100 && +m[3] > 50);
        if (validDate(y, +m[2], +m[1])) { date = `${y}-${pad(+m[2])}-${pad(+m[1])}`; break; }
      }
    }
    let time = null;
    const re3 = /(?:^|[^\d])(\d{1,2}):(\d{2})(?::\d{2})?/g;
    while ((m = re3.exec(t))) {
      if (+m[1] < 24 && +m[2] < 60) { time = `${pad(+m[1])}:${m[2]}`; break; }
    }
    return { date, time };
  }

  function parseMerchant(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const label = /^(?:ไปยัง|ไปที่|ถึง|ผู้รับ|ชื่อผู้รับ|บัญชีผู้รับ|ร้านค้า|ชื่อร้านค้า|ชื่อร้าน|(?:merchant|to)(?=[\s:：]|$))\s*[:：]?\s*(.*)$/i;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(label);
      if (!m) continue;
      let name = m[1].trim();
      if (name.length < 2 && lines[i + 1]) name = lines[i + 1];
      name = name.replace(/[^฀-๿A-Za-z0-9 .&'\-()]/g, '').trim();
      if (name.length >= 2) return name.slice(0, 60);
    }
    // ใบเสร็จร้านค้า: ใช้บรรทัดแรกที่มีตัวอักษรอย่างน้อย 3 ตัว
    for (const l of lines.slice(0, 6)) {
      const letters = (l.match(/[฀-๿A-Za-z]/g) || []).length;
      if (letters >= 3 && !/\d{2}[\/:]\d{2}/.test(l)) return l.replace(/[^฀-๿A-Za-z0-9 .&'\-()]/g, '').trim().slice(0, 60);
    }
    return '';
  }

  function matches(kw, spaced, compact) {
    const k = kw.toLowerCase();
    if (/^[a-z0-9\- ]+$/.test(k) && k.length <= 4) {
      return new RegExp('(^|[^a-z0-9])' + k.replace(/[-]/g, '\\-') + '([^a-z0-9]|$)').test(spaced);
    }
    return compact.includes(k.replace(/\s+/g, ''));
  }

  function categorize(text, merchant) {
    const spaced = tidy(text + '\n' + merchant).toLowerCase();
    const compact = spaced.replace(/\s+/g, '');
    const mCompact = tidy(merchant).toLowerCase().replace(/\s+/g, '');
    let best = { id: 'other', score: 0 };
    for (const c of CATEGORIES) {
      let score = 0;
      for (const kw of c.kw) {
        if (!matches(kw, spaced, compact)) continue;
        let s = Math.min(kw.length, 8);
        if (mCompact && mCompact.includes(kw.toLowerCase().replace(/\s+/g, ''))) s *= 3; // อยู่ในชื่อผู้รับ น้ำหนักมากกว่า
        if (c.weak) s *= 0.4;
        score += s;
      }
      if (score > best.score) best = { id: c.id, score };
    }
    return best.id;
  }

  function parseSlip(text) {
    const { date, time } = parseDateTime(text);
    const amount = parseAmount(text);
    const merchant = parseMerchant(text);
    return { amount, date, time, merchant, category: categorize(text, merchant) };
  }

  const AI_PROMPT = `คุณอ่านสลิปโอนเงิน/จ่ายบิล/ใบเสร็จของไทยจากรูป ตอบเป็น JSON อย่างเดียวตามรูปแบบนี้:
{"is_slip": true/false, "amount": ตัวเลขจำนวนเงินที่โอน/จ่ายจริง (ไม่รวมค่าธรรมเนียม) หรือ null, "date": "YYYY-MM-DD" แบบ ค.ศ. (ถ้าเป็น พ.ศ. ให้ลบ 543) หรือ null, "time": "HH:MM" หรือ null, "merchant": "ชื่อผู้รับ/ร้านค้า/ผู้ให้บริการ" , "category": หนึ่งใน ${CATEGORIES.map((c) => c.id).join('|')}}
หมวด: ${CATEGORIES.map((c) => c.id + '=' + c.name).join(', ')}
ถ้ารูปไม่ใช่สลิปหรือใบเสร็จให้ is_slip=false อย่าเดาค่าที่มองไม่เห็นชัด ให้ใส่ null`;
  const api = { AI_PROMPT, CATEGORIES, parseSlip, parseAmount, parseDateTime, parseMerchant, categorize, tidy };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SlipParser = api;
})(typeof self !== 'undefined' ? self : this);

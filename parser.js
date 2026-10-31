/* หมวดหมู่ค่าใช้จ่าย + พรอมต์ให้ Gemini + ตัวจัดรูปผลลัพธ์ ใช้ทั้งในเบราว์เซอร์ (window.SlipParser) และเซิร์ฟเวอร์ (require) */
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

  /** ลบช่องว่างที่ OCR ใส่แทรกระหว่างตัวอักษรไทยติดกัน */
  function tidy(text) {
    return String(text || '')
      .replace(/\r/g, '')
      .replace(/([฀-๿])[ \t]+(?=[฀-๿])/g, '$1')
      .replace(/[ \t]+/g, ' ')
      .split('\n').map((l) => l.trim()).join('\n');
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

  const AI_PROMPT = `คุณอ่านสลิปโอนเงิน/จ่ายบิล/ใบเสร็จของไทยจากรูป ตอบเป็น JSON อย่างเดียวตามรูปแบบนี้:
{"is_slip": true/false, "amount": ตัวเลขจำนวนเงินที่โอน/จ่ายจริง (ไม่รวมค่าธรรมเนียม) หรือ null, "date": "YYYY-MM-DD" แบบ ค.ศ. (ถ้าเป็น พ.ศ. ให้ลบ 543) หรือ null, "time": "HH:MM" หรือ null, "merchant": "ชื่อผู้รับ/ร้านค้า/ผู้ให้บริการ" , "category": หนึ่งใน ${CATEGORIES.map((c) => c.id).join('|')}}
หมวด: ${CATEGORIES.map((c) => c.id + '=' + c.name).join(', ')}
ถ้ารูปไม่ใช่สลิปหรือใบเสร็จให้ is_slip=false อย่าเดาค่าที่มองไม่เห็นชัด ให้ใส่ null`;
  const ruleKey = (m) => String(m || '').toLowerCase().replace(/\s+/g, '');

  /** แปลงผลจาก Gemini ให้อยู่ในรูปที่ใช้ได้แน่นอน (ค่าที่ไม่ถูกต้องกลายเป็น null) */
  function normalizeAI(o) {
    o = o || {};
    const amount = typeof o.amount === 'number' ? o.amount : parseFloat(String(o.amount ?? '').replace(/,/g, ''));
    const merchant = String(o.merchant || '').trim().slice(0, 80);
    const ids = new Set(CATEGORIES.map((c) => c.id));
    return {
      isSlip: o.is_slip !== false,
      amount: amount > 0 && amount < 1e8 ? Math.round(amount * 100) / 100 : null,
      date: /^\d{4}-\d{2}-\d{2}$/.test(o.date || '') ? o.date : null,
      time: /^\d{2}:\d{2}$/.test(o.time || '') ? o.time : null,
      merchant,
      category: ids.has(o.category) ? o.category : categorize('', merchant)
    };
  }

  const api = { CATEGORIES, AI_PROMPT, categorize, normalizeAI, ruleKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SlipParser = api;
})(typeof self !== 'undefined' ? self : this);

# ตั้งให้ iPhone ส่งสลิปเข้าแอพเองทุกวัน (iOS Shortcuts)

หลักการ: แอป **คำสั่งลัด (Shortcuts)** ดึงรูปใหม่ → อ่านข้อความในเครื่องด้วย Live Text → เปิดเว็บแอพพร้อมข้อความ → แอพแยกหมวดและบันทึกให้

> ใช้ **Safari** เปิดเว็บแอพทุกครั้ง อย่าใช้ไอคอน "เพิ่มลงหน้าจอโฮม" แบบเว็บแอพ เพราะบน iOS ข้อมูลของ Safari กับของเว็บแอพบนหน้าจอโฮม **แยกกัน** และ Shortcuts จะเปิด Safari เสมอ

## สร้าง Shortcut
เปิดแอป คำสั่งลัด → แท็บ **ออโตเมชัน** → **+** → **เวลาของวัน** (เช่น 21:00, ทุกวัน) → **เรียกใช้ทันที** → ใส่ขั้นตอนตามลำดับ:

1. **Find Photos** (ค้นหารูปภาพ): Album = *Screenshots* (หรืออัลบั้มที่คุณเก็บสลิป), Date Added **is in the last 1 days**
2. **Repeat with Each** (ทำซ้ำกับแต่ละรายการ) บน Photos
   1. **Extract Text from Image** (แยกข้อความจากรูปภาพ) ← Repeat Item
   2. **Text**: ใส่ `Extracted Text` แล้วขึ้นบรรทัดใหม่ตามด้วย `====`
   3. **Add to Variable** ชื่อ `Slips`
3. **Combine Text** (รวมข้อความ): `Slips` คั่นด้วยบรรทัดใหม่
4. **URL Encode** (เข้ารหัส URL) ผลของข้อ 3
5. **Text**: `https://<โฮสต์ของคุณ>/index.html#import=` ต่อด้วยผลจากข้อ 4
6. **Open URLs** (เปิด URL) ← Text จากข้อ 5

ทดสอบโดยกดรัน Shortcut เองก่อน แล้วค่อยเปิดเป็นออโตเมชัน

## ข้อควรรู้
- ตอนออโตเมชันรัน Safari จะเด้งขึ้นมา iPhone ควรปลดล็อกอยู่
- ภาพแคปจอที่ไม่ใช่สลิปจะถูกข้ามอัตโนมัติ (ต้องมีคำอย่าง บาท/จำนวน/สำเร็จ และมีตัวเลข) สลิปที่แอพอ่านวันที่/จำนวนไม่ครบ จะเด้งหน้าให้ตรวจแก้
- สลิปซ้ำ (จำนวน วันที่ เวลา ผู้รับตรงกัน) จะถูกข้าม จึงรันซ้ำได้โดยไม่เบิ้ล
- Live Text อ่านภาษาไทยได้ไหมและแม่นแค่ไหนขึ้นกับสลิปแต่ละธนาคาร ให้ลองกับสลิปจริงก่อน

---

# แบบ B: ให้ Shortcut ส่งรูปไปให้ Gemini อ่านเอง (แม่นกว่า Live Text)

ใช้แทนขั้นตอน "Extract Text from Image" ในแบบข้างบน ทุกอย่างอื่นเหมือนเดิม

**เตรียม:** สมัคร API key ฟรีที่ https://aistudio.google.com (Get API key) และเช็กโควตา/เงื่อนไขล่าสุดที่ https://ai.google.dev/pricing
⚠️ รูปสลิปจะถูกส่งไปที่ Google และคีย์จะเก็บอยู่ใน Shortcut ของคุณ อย่าแชร์ Shortcut นี้ให้ใคร

ในลูป **Repeat with Each** (บน Photos) ใช้ขั้นตอนนี้แทน:
1. **Resize Image** (ปรับขนาดรูปภาพ) กว้าง 1200 → **Convert Image** เป็น JPEG
2. **Base64 Encode** (เข้ารหัส Base64) ผลของข้อ 1 ตั้ง Line Breaks = None
3. **Get Contents of URL**
   - URL: `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent` (ถ้าได้ 404 ให้เปิด https://generativelanguage.googleapis.com/v1beta/models?key=คีย์ของคุณ ดูชื่อโมเดลที่ใช้ได้ แล้วแทนชื่อนี้)
   - Method: POST, Headers: `x-goog-api-key` = คีย์ของคุณ, `Content-Type` = `application/json`
   - Request Body: **File** ใส่ Text ที่ประกอบเป็น JSON ดังนี้ (แทน `<BASE64>` ด้วยผลข้อ 2, `<PROMPT>` ด้วยข้อความจาก `AI_PROMPT` ใน `app.js`โดยขึ้นบรรทัดใหม่ให้เป็น `\n`):
     `{"contents":[{"parts":[{"text":"<PROMPT>"},{"inline_data":{"mime_type":"image/jpeg","data":"<BASE64>"}}]}],"generationConfig":{"responseMimeType":"application/json","temperature":0}}`
4. **Get Dictionary Value**: `candidates` → รายการแรก → `content` → `parts` → รายการแรก → `text` (ได้ JSON ของสลิป เช่น `{"amount":125,...}`)
5. **Text**: ผลข้อ 4 ขึ้นบรรทัดใหม่แล้วตามด้วย `====` → **Add to Variable** `Slips`

หลังลูป ใช้ขั้นตอน 3–6 เดิม (Combine Text → URL Encode → ต่อท้าย `…/index.html#import=` → Open URLs) แอพรับ JSON ได้โดยตรง

> ขั้นตอนนี้ผมเขียนจากความรู้เรื่อง Shortcuts และ Gemini API โดยยังไม่ได้ลองรันบน iPhone จริง ชื่อ action อาจต่างเล็กน้อยตามเวอร์ชัน ถ้าติดตรงไหนบอกผมได้

# ใช้ Gemini ในแอพโดยตรง (เลือกรูปเอง)
ในหน้าแอพ เลื่อนลงล่าง เปิด "อ่านสลิปด้วย Gemini" แล้ววาง API key ถ้า Gemini ใช้ไม่ได้ แอพจะถอยไปอ่านในเครื่องด้วย Tesseract เอง

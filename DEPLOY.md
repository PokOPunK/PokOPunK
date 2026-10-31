# Deploy บน VPS ของคุณ (Docker + Caddy เดียวกับ garage-log)

ผลลัพธ์: `https://slip.penquinwatch.com` เสิร์ฟหน้าแอพ และมี `/api/read` เป็นตัวกลางเรียก Gemini โดยเก็บ API key ไว้ที่เซิร์ฟเวอร์ (ไม่อยู่ใน repo หรือหน้าเว็บ)

## 1) DNS
ที่ผู้ให้บริการโดเมน เพิ่ม **A record** `slip` → IP เดียวกับ `garage.penquinwatch.com`

## 2) ขอ Gemini API key
https://aistudio.google.com → Get API key (เช็กโควตา/เงื่อนไขที่ https://ai.google.dev/pricing – รูปสลิปจะถูกส่งไปที่ Google)

## 3) ขึ้น VPS (ssh เข้าเครื่องแล้วรัน)
```bash
git clone https://github.com/PokOPunK/PokOPunK.git slip-sense && cd slip-sense   # repo public clone ได้เลย
cp .env.example .env
nano .env          # ใส่ GEMINI_API_KEY และ APP_PASSWORD (สร้างรหัสด้วย: openssl rand -base64 18)
chmod 600 .env
docker compose up -d --build
docker compose logs --tail 20 slip-sense     # ต้องเห็น "สลิปเซ้นส์ พร้อมที่พอร์ต 3000"
```
container จะอยู่บน network `penquin_watch_default` เหมือน garage-log (compose ไฟล์ตั้งไว้แล้ว)

## 4) เพิ่มบล็อกใน Caddyfile ของ penquin-watch
```
slip.penquinwatch.com {
    reverse_proxy slip-sense:3000
}
```
แล้ว reload (ในโฟลเดอร์ penquin-watch):
```bash
docker compose -f docker-compose.prod.yml exec caddy caddy reload --config /etc/caddy/Caddyfile
```
Caddy ขอใบรับรอง HTTPS ให้เอง (DNS ต้องชี้ถูกก่อน)

## 5) ใช้งาน
- เปิด `https://slip.penquinwatch.com` ด้วย **Safari** → เลื่อนลงล่าง เปิด "อ่านสลิปด้วย Gemini" → ใส่ **รหัสผ่านเซิร์ฟเวอร์** (ค่า APP_PASSWORD) ครั้งเดียว
- ตั้ง Shortcut ตาม `SHORTCUT.md` แบบ B

## อัปเดตเวอร์ชันภายหลัง
```bash
cd slip-sense && git pull && docker compose up -d --build
```

## ความปลอดภัย
- `.env` ห้าม commit (อยู่ใน .gitignore แล้ว) รหัสผ่านยาวๆ สุ่มเอา
- เซิร์ฟเวอร์ล็อก IP ที่เดารหัสผิด 10 ครั้งใน 10 นาที และจำกัด 120 รูป/ชั่วโมง/IP
- ข้อมูลค่าใช้จ่ายยังเก็บในมือถือคุณ ไม่ได้เก็บบนเซิร์ฟเวอร์ เซิร์ฟเวอร์ส่งผ่านรูปไปให้ Gemini แล้วไม่บันทึกรูป
- ถ้าสงสัยว่า key หลุด ให้ลบ key ที่ aistudio.google.com แล้วสร้างใหม่ แก้ `.env` และสั่ง `docker compose up -d`

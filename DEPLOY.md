# Deploy บน VPS ของคุณ (Docker + Caddy เดียวกับ garage-log)

ผลลัพธ์: `https://slip.penquinwatch.com` เป็นทั้งหน้าแอพ, ตัวอ่านสลิป (Gemini, คีย์อยู่ที่เซิร์ฟเวอร์) และที่เก็บข้อมูล (SQLite)

## 1) DNS
ที่ผู้ให้บริการโดเมน เพิ่ม **A record** `slip` → IP เดียวกับ `garage.penquinwatch.com`

## 2) ขอ Gemini API key
https://aistudio.google.com → Get API key (เช็กโควตา/เงื่อนไขที่ https://ai.google.dev/pricing – รูปสลิปจะถูกส่งไปที่ Google)

## 3) ขึ้น VPS (ssh เข้าเครื่องแล้วรัน)
```bash
git clone https://github.com/PokOPunK/PokOPunK.git slip-sense && cd slip-sense
cp .env.example .env
nano .env          # ใส่ GEMINI_API_KEY และ APP_PASSWORD (สร้างรหัสด้วย: openssl rand -base64 18)
chmod 600 .env
docker compose up -d --build
docker compose logs --tail 20 slip-sense     # ต้องเห็น "สลิปเซ้นส์ พร้อมที่พอร์ต 3000"
```

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

## 5) ใช้งาน
- เปิด `https://slip.penquinwatch.com` → ใส่รหัสผ่าน (APP_PASSWORD) ครั้งเดียว → ติดตั้งลงหน้าจอโฮมได้ตามปกติ
- ถ้าเคยใช้เวอร์ชันเก่าบน GitHub Pages: เปิดเวอร์ชันเก่าไม่ได้แล้ว แต่ข้อมูลเก่าอยู่ใน Safari ของ **โดเมนเก่า** ย้ายข้ามโดเมนอัตโนมัติไม่ได้ (ปุ่ม "ย้ายข้อมูลเดิม" ทำงานเฉพาะเมื่อเปิดจากโดเมนเดียวกัน) ถ้ามีข้อมูลเก่าน้อย แนะนำให้เพิ่มใหม่
- ตั้ง Shortcut ตาม `SHORTCUT.md`

## อัปเดตเวอร์ชันภายหลัง
```bash
cd slip-sense && git pull && docker compose up -d --build
```

## สำรองข้อมูล
```bash
docker compose exec slip-sense node --disable-warning=ExperimentalWarning -e "new (require('node:sqlite').DatabaseSync)('/data/slips.db').exec(\"VACUUM INTO '/data/backup.db'\")"
docker cp slip-sense:/data/backup.db ./slips-$(date +%F).db
docker compose exec slip-sense rm /data/backup.db
```
หรือกดปุ่ม "⬇︎ CSV" ในแอพเพื่อเก็บไว้เปิดด้วย Excel

## ความปลอดภัย
- `.env` ห้าม commit (อยู่ใน .gitignore แล้ว) รหัสผ่านยาวๆ สุ่มเอา ทุก API ต้องใช้รหัสนี้
- เซิร์ฟเวอร์ล็อก IP ที่เดารหัสผิด 10 ครั้งใน 10 นาที และจำกัดการส่งรูป 150 รูป/ชั่วโมง/IP
- รูปสลิปเต็มไม่ถูกเก็บ (เก็บแค่ค่า hash กันส่งซ้ำ และรูปย่อเมื่อสแกนจากแอพ)
- ถ้าสงสัยว่า key หลุด ให้ลบ key ที่ aistudio.google.com แล้วสร้างใหม่ แก้ `.env` และสั่ง `docker compose up -d`

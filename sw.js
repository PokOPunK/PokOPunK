const CACHE = 'slipsense-v1';
const SHELL = ['./', 'index.html', 'style.css', 'parser.js', 'app.js', 'manifest.json', 'icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
// แคชทุกอย่างรวมถึงไฟล์ OCR/ภาษาไทยจาก CDN เพื่อใช้ออฟไลน์ได้หลังเปิดครั้งแรก
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then((hit) => {
    const net = fetch(e.request).then((r) => { if (r.ok || r.type === 'opaque') { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});

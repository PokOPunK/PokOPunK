const CACHE = 'slipsense-v4';
const SHELL = ['./', 'index.html', 'style.css', 'parser.js', 'app.js', 'manifest.json', 'icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.hostname.endsWith('googleapis.com') || url.pathname.includes('/api/')) return; // ไม่แตะ API
  const put = (r) => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); } return r; };
  if (url.origin === location.origin) {
    // ไฟล์ของแอพ: โหลดจากเน็ตก่อนเพื่อให้ได้เวอร์ชันใหม่เสมอ ออฟไลน์ค่อยใช้แคช
    e.respondWith(fetch(req).then(put).catch(() => caches.match(req)));
  }
});

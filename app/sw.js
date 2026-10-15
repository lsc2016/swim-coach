// 오프라인용 캐시. 화면 파일은 캐시에서 먼저 열고, 뒤에서 새 버전으로 갱신한다.
// md 데이터(/api/)는 앱이 휴대폰 저장소에 따로 보관하므로 여기서는 건드리지 않는다.
const CACHE = 'swim-coach-v1';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const key = e.request.mode === 'navigate' ? 'index.html' : e.request;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(key);
    const fresh = fetch(e.request).then(res => {
      if (res.ok) cache.put(key, res.clone());
      return res;
    }).catch(() => cached);
    return cached || fresh;
  }));
});

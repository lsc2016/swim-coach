// 오프라인용 캐시.
// - 화면 파일: 캐시에서 먼저 열고, 뒤에서 새 버전으로 갱신
// - data.json(커리큘럼·수영장 md 묶음): 인터넷이 되면 새로 받고, 안 되면 캐시
// 캐시 이름은 build.py가 배포할 때마다 바꾼다.
const CACHE = 'swim-coach-dev';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'icon-180.png', 'icon-192.png', 'icon-512.png', 'data.json'];

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
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('/data.json')) {
    e.respondWith(caches.open(CACHE).then(cache =>
      fetch(e.request, { cache: 'no-cache' })
        .then(res => { if (res.ok) cache.put('data.json', res.clone()); return res; })
        .catch(() => cache.match('data.json'))));
    return;
  }
  const key = e.request.mode === 'navigate' ? 'index.html' : e.request;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(key, { ignoreSearch: true });
    const fresh = fetch(e.request).then(res => {
      if (res.ok) cache.put(key, res.clone());
      return res;
    }).catch(() => cached);
    return cached || fresh;
  }));
});

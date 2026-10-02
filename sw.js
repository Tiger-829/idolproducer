const CACHE_NAME = `idol-game-v${Date.now()}`;
// index.html から読み込む外部ファイルもオフライン動作に含める
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './js/01-constants.js',
  './js/02-state.js',
  './js/03-venue.js',
  './js/04-members.js',
  './js/05-calc.js',
  './js/06-progress.js',
  './js/07-schedule.js',
  './js/08-events.js',
  './js/09-selection-draft.js',
  './js/10-ui-panels.js',
  './js/11-ui-roster.js',
  './js/12-ui-plan-save.js',
  './js/13-help.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const cloned = response.clone();
        const isSameOrigin = event.request.url.startsWith(self.location.origin);
        if (isSameOrigin) {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((res) => res || caches.match('./index.html')))
  );
});
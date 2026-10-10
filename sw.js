const APP_VERSION = 'v7';
const CACHE_NAME = `idol-game-${APP_VERSION}`;
// index.html から読み込む外部ファイルもオフライン動作に含める
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './js/00-shortcut.js',
  './js/01-constants.js',
  './js/02-state.js',
  './js/03-venue.js',
  './js/04-members.js',
  './js/05-calc.js',
  './js/06-progress.js',
  './js/07-schedule.js',
  './js/08-events.js',
  './js/09-selection-draft.js',
  './js/10-ui-navigation.js',
  './js/11-ui-group.js',
  './js/12-ui-formation.js',
  './js/13-ui-office.js',
  './js/14-ui-funds.js',
  './js/15-ui-ranking.js',
  './js/16-ui-records.js',
  './js/17-ui-core.js',
  './js/18-ui-plan-save.js',
  './js/19-help.js',
  './js/20-save-sync.js',
  './vendor/qrcode.min.js',
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

  const isSameOrigin = event.request.url.startsWith(self.location.origin);
  const isNavigation = event.request.mode === 'navigate' || event.request.destination === 'document';

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const cloned = response.clone();
        if (isSameOrigin && response && response.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          if (isNavigation) {
            caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', cloned));
          }
        }
        return response;
      })
      .catch(() => {
        if (isNavigation) {
          return caches.match('./index.html') || caches.match('./');
        }
        return caches.match(event.request) || caches.match('./index.html');
      })
  );
});
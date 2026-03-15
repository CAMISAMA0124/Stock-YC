const CACHE_NAME = 'yc-ark-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/index.css',
  '/manifest.json',
  '/icon.png',
  '/js/app.js',
  '/js/state.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

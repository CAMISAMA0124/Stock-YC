const CACHE_NAME = 'yc-ark-v11';
const ASSETS = [
  './',
  './index.html',
  './index.css?v=11',
  './manifest.json',
  './icon.png',
  './js/state.js?v=11',
  './js/data/api.js?v=11',
  './js/data/metals.js?v=11',
  './js/app.js?v=11'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Never cache API calls — always network-only for /api/*
  if (event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Network-First strategy for all other assets to prevent caching old versions
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Optionally update cache with the new response here
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache if network fails
        return caches.match(event.request);
      })
  );
});

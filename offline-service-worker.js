// Service Worker script

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('tiddlystow-001').then((cache) => {
      return cache.addAll([
        './',
        'index.html',
        'TiddlyStow-ZH.html',
        'manifest.json',
        'favicon.ico',
        'android-chrome-192x192.png',
        'android-chrome-512x512.png'
      ]);
    })
  );
});
self.addEventListener('fetch', function(event) {

  // Serve from offline-cache. Fetch from network on cache-miss.
  event.respondWith(
    caches.match(event.request).then(function(response) {
      return response || fetch(event.request);
    })
  );
});


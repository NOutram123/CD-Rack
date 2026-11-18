const cacheName = 'cd-rack-v12';
const shell = ['/', '/app.js', '/config.js', '/demo-player.js', '/carousel.js', '/spine-colour.js', '/rack-sort.js', '/style.css', '/manifest.webmanifest', '/icon.svg'];
self.addEventListener('install', event => { event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(shell))); self.skipWaiting(); });
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== cacheName).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !shell.includes(new URL(event.request.url).pathname)) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

const MEDIA_CACHE = 'chabongspace-memory-media-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || !url.pathname.startsWith('/media/')) return;

  event.respondWith((async () => {
    const cache = await caches.open(MEDIA_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone()).catch(() => {});
      return response;
    } catch {
      return cached || new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});
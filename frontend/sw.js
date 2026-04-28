const CACHE_NAME = 'ff-cache-v5';
const urlsToCache = [
  '/',
  '/dashboard',
  '/css/global.css',
  '/js/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  // Apenas faz cache de requisições GET. Chamadas de API (POST/PUT/DELETE) passam direto.
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/api/')) return; // Não faz cache da API

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).then(
          function(response) {
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            var responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(function(cache) {
                cache.put(event.request, responseToCache);
              });
            return response;
          }
        );
      })
  );
});

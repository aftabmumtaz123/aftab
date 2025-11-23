const CACHE_NAME = 'portfolio-v7';
const ASSETS_TO_CACHE = [
    '/',
    '/projects',
    '/resume',
    '/resume/print',
    '/contact',
    '/admin/dashboard',
    '/admin/hero',
    '/admin/skills',
    '/admin/experience',
    '/admin/education',
    '/admin/projects',
    '/admin/testimonials',
    '/admin/blog',
    '/admin/config',
    '/admin/finance',
    '/css/style.css',
    '/js/idb-utility.js',
    '/js/offline-sync.js',
    '/js/toast.js',
    '/manifest.json',
    '/js/tailwindcss.js',
    '/js/chart.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    '/offline'
];

// Install Event
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .catch(err => {
                console.error('Cache install error:', err);
            })
    );
    self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch Event
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    // 1. API GET requests (Network-First for fresh data)
    if (requestUrl.pathname.startsWith('/admin') && event.request.method === 'GET') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Check if valid response
                    // If status is 503 (Service Unavailable) or not 200, try cache
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        console.log('[SW] Server returned error/503, checking cache for:', event.request.url);
                        return caches.match(event.request.url, { ignoreVary: true }).then(cachedResponse => {
                            if (cachedResponse) {
                                console.log('[SW] Found in cache:', event.request.url);
                                return cachedResponse;
                            }
                            console.log('[SW] Not found in cache:', event.request.url);
                            return response;
                        });
                    }
                    // Clone and cache
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                    return response;
                })
                .catch(() => {
                    console.log('[SW] Network failed, checking cache for:', event.request.url);
                    return caches.match(event.request.url, { ignoreVary: true });
                })
        );
        return;
    }

    // 2. HTML Navigation (Network First, fall back to Cache)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Check if valid response
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    // Clone the response to put in cache
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                    return response;
                })
                .catch(() => {
                    // If network fails, try to serve from cache
                    // Use request.url to avoid mismatch due to mode/headers
                    return caches.match(event.request.url, { ignoreVary: true })
                        .then(response => {
                            if (response) {
                                return response;
                            }
                            // If not in cache, serve offline page
                            return caches.match('/offline');
                        });
                })
        );
        return;
    }

    // 3. Static Assets (Cache First)
    event.respondWith(
        caches.match(event.request, { ignoreVary: true })
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request).then(
                    response => {
                        // Check if we received a valid response
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        // Cache local assets dynamically
                        if (requestUrl.origin === location.origin) {
                            const responseToCache = response.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => {
                                    cache.put(event.request, responseToCache);
                                });
                        }
                        return response;
                    }
                );
            })
    );
});

importScripts('./sw-image-cache.js');
importScripts('./sw-idb-cache.js');
importScripts('./sw-favorite-posts-sync.js');

// A request is an API GET if its path starts with /api/ and is not an image.
// Exclude image paths to avoid double-respondWith conflicts with the image handler.
function looksLikeApiRequest(request) {
  if (request.method !== 'GET') return false;
  try {
    const { pathname } = new URL(request.url);
    return pathname.startsWith('/api/') && !_IMG_EXT.test(pathname);
  } catch {
    return false;
  }
}

// Cache-first for cross-origin images. Registered before importScripts('./ngsw-worker.js')
// so this handler wins the respondWith race against ngsw-worker's catch-all.
self.addEventListener('fetch', (event) => {
  if (!isImageRequest(event.request)) return;
  event.respondWith(handleImageCacheRequest(event.request));
});

// Network-first with IndexedDB fallback for API GET requests.
// Registered before importScripts('./ngsw-worker.js') so it wins over ngsw's catch-all.
self.addEventListener('fetch', (event) => {
  if (!looksLikeApiRequest(event.request)) return;
  event.respondWith(handleApiCacheRequest(event.request));
});

// Offline favorite/unfavorite — intercept before ngsw so we can respond optimistically.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'POST' && event.request.method !== 'DELETE') return;
  try {
    if (!/\/api\/articles\/[^/]+\/favorite$/.test(new URL(event.request.url).pathname)) return;
  } catch {
    return;
  }
  event.respondWith(handleFavoriteRequest(event.request));
});

importScripts('./ngsw-worker.js');

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-favorites') {
    event.waitUntil(syncFavorites());
  }
});

// Fallback: Angular posts 'sync-favorites' on the window online event so sync
// runs even in browsers where the Background Sync API doesn't fire automatically.
self.addEventListener('message', (event) => {
  if (event.data === 'sync-favorites') {
    event.waitUntil(syncFavorites());
  }
});

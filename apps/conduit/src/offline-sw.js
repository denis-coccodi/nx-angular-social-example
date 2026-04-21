const DB_NAME = 'conduit-offline';
const STORE_NAME = 'favorites';
const FALLBACK_API_URL = 'http://localhost:8080/api';

// Reads the API URL written to Cache API by the Angular app on startup.
// Falls back to FALLBACK_API_URL if not yet written (e.g. very first background sync).
async function getApiUrl() {
  try {
    const cache = await caches.open('conduit-sw-config');
    const res = await cache.match('/sw-config.json');
    if (res) return (await res.json()).api_url;
  } catch {
    // cache unavailable, fall through to default
  }
  return FALLBACK_API_URL;
}

importScripts('./sw-idb-cache.js');

const IMAGE_CACHE = 'conduit-images';
const IMAGE_EXT = /\.(?:jpe?g|png|webp|gif|svg|avif|ico)(?:[?#]|$)/i;

// A request is an API GET if its path starts with /api/ and is not an image file.
// The image fetch handler below must take precedence for overlapping URLs, so
// we exclude IMAGE_EXT paths here to avoid double-respondWith conflicts.
function looksLikeApiRequest(request) {
  if (request.method !== 'GET') return false;
  try {
    const { pathname } = new URL(request.url);
    return pathname.startsWith('/api/') && !IMAGE_EXT.test(pathname);
  } catch {
    return false;
  }
}

// Cache-first for cross-origin images. Must register before importScripts so
// this handler wins the respondWith race against ngsw-worker's catch-all.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin) return; // let ngsw handle same-origin assets
  if (!IMAGE_EXT.test(url.pathname)) return;
  event.respondWith(cacheFirstImage(event.request));
});

// Stale-while-revalidate for API GET requests via IndexedDB.
// Registered before importScripts('./ngsw-worker.js') so it wins over ngsw's catch-all.
self.addEventListener('fetch', (event) => {
  if (!looksLikeApiRequest(event.request)) return;
  event.respondWith(handleApiCacheRequest(event.request));
});

async function cacheFirstImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    // cache both normal (ok) and opaque (no-CORS cross-origin) responses
    if (response.ok || response.type === 'opaque') {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response(null, { status: 503 });
  }
}

importScripts('./ngsw-worker.js');

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-favorites') {
    event.waitUntil(syncFavorites());
  }
});

async function syncFavorites() {
  const apiUrl = await getApiUrl();
  const db = await openDatabase();
  const favorites = await getAllPendingFavorites(db);

  for (const item of favorites) {
    try {
      const url = `${apiUrl}/articles/${item.slug}/favorite`;
      const method = item.isFavorite ? 'POST' : 'DELETE';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          // 'Authorization': `Token ${await getAuthTokenFromIndexedDB()}`
        },
      });

      if (response.ok) {
        await removeFavoriteFromDb(db, item.slug);
      }
    } catch (error) {
      console.error('Background sync failed for item:', item.slug, error);
      // Throwing here triggers a retry by the browser later
      throw error;
    }
  }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllPendingFavorites(db) {
  return new Promise((resolve) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
  });
}

function removeFavoriteFromDb(db, slug) {
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  store.delete(slug);
}

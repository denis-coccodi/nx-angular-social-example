// IndexedDB-backed stale-while-revalidate cache for API GET responses.
// Imported by offline-sw.js via importScripts.

const _IDB_CACHE_DB = 'conduit-api-cache';
const _IDB_CACHE_STORE = 'responses';
const _IDB_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

function _openApiCacheDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(_IDB_CACHE_DB, 1);
    req.onupgradeneeded = ({ target }) => {
      const db = target.result;
      if (!db.objectStoreNames.contains(_IDB_CACHE_STORE)) {
        db.createObjectStore(_IDB_CACHE_STORE, { keyPath: 'url' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function _getCachedApiResponse(url) {
  return _openApiCacheDb().then(
    (db) =>
      new Promise((resolve) => {
        const tx = db.transaction(_IDB_CACHE_STORE, 'readonly');
        const req = tx.objectStore(_IDB_CACHE_STORE).get(url);
        req.onsuccess = () => {
          const e = req.result;
          if (!e || Date.now() - e.timestamp > _IDB_CACHE_MAX_AGE) return resolve(null);
          resolve(new Response(e.body, { status: e.status, statusText: e.statusText, headers: e.headers }));
        };
        req.onerror = () => resolve(null);
      }),
  );
}

function _putApiCacheResponse(url, response) {
  return response.text().then((body) => {
    const headers = {};
    response.headers.forEach((v, k) => (headers[k] = v));
    const entry = {
      url,
      body,
      status: response.status,
      statusText: response.statusText,
      headers,
      timestamp: Date.now(),
    };
    return _openApiCacheDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(_IDB_CACHE_STORE, 'readwrite');
          const req = tx.objectStore(_IDB_CACHE_STORE).put(entry);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        }),
    );
  });
}

/**
 * Network-first handler for API GET requests.
 * On success the response is cached in IndexedDB.
 * On network failure the cached entry is returned if present; otherwise a 503.
 * @param {Request} request
 */
function handleApiCacheRequest(request) {
  const url = request.url;

  return fetch(request.clone())
    .then((response) => {
      if (response.ok) _putApiCacheResponse(url, response.clone()).catch(() => {});
      return response;
    })
    .catch(() =>
      _getCachedApiResponse(url).then(
        (cached) =>
          cached ??
          new Response(JSON.stringify({ errors: { offline: ['You are offline'] } }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
}

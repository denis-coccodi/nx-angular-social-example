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
 * Searches all cached GET responses for an article matching the slug.
 * Looks inside both single-article ({ article }) and list ({ articles }) payloads.
 * @param {string} slug
 * @returns {Promise<object|null>}
 */
function getArticleFromApiCache(slug) {
  return _openApiCacheDb().then(
    (db) =>
      new Promise((resolve) => {
        const tx = db.transaction(_IDB_CACHE_STORE, 'readonly');
        const req = tx.objectStore(_IDB_CACHE_STORE).getAll();
        req.onsuccess = () => {
          for (const entry of req.result) {
            try {
              const data = JSON.parse(entry.body);
              if (data.article?.slug === slug) return resolve(data.article);
              const found = Array.isArray(data.articles) && data.articles.find((a) => a.slug === slug);
              if (found) return resolve(found);
            } catch { /* non-JSON entry, skip */ }
          }
          resolve(null);
        };
        req.onerror = () => resolve(null);
      }),
  );
}

/**
 * Patches favorited + favoritesCount for a given slug across all cached GET responses.
 * @param {string} slug
 * @param {boolean} favorited
 * @param {number} favoritesCount
 */
function patchArticleInApiCache(slug, favorited, favoritesCount) {
  return _openApiCacheDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(_IDB_CACHE_STORE, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);

        const store = tx.objectStore(_IDB_CACHE_STORE);
        const getAllReq = store.getAll();
        getAllReq.onsuccess = () => {
          for (const entry of getAllReq.result) {
            let data;
            try { data = JSON.parse(entry.body); } catch { continue; /* non-JSON entry */ }
            let changed = false;

            if (data.article?.slug === slug) {
              data.article.favorited = favorited;
              data.article.favoritesCount = favoritesCount;
              changed = true;
            }
            if (Array.isArray(data.articles)) {
              const a = data.articles.find((a) => a.slug === slug);
              if (a) {
                a.favorited = favorited;
                a.favoritesCount = favoritesCount;
                changed = true;
              }
            }
            if (changed) {
              entry.body = JSON.stringify(data);
              store.put(entry);
            }
          }
        };
        getAllReq.onerror = () => reject(getAllReq.error);
      }),
  );
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

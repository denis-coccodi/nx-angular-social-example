// Offline favorite/unfavorite interception and background sync.
// Imported by offline-sw.js via importScripts (after sw-idb-cache.js).
//
// Online path  – request passes straight through to the network, then any
//                pending queue is drained as a side-effect (piggyback sync).
// Offline path – optimistic IDB patch + pending-queue entry + sync registration.
// Sync path    – replays queued actions and reconciles IDB cache with server truth.

const _FAV_DB_NAME = 'conduit-offline';
const _FAV_STORE_NAME = 'favorites';

// ── IDB helpers ──────────────────────────────────────────────────────────────

function _openFavDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(_FAV_DB_NAME, 1);
    req.onupgradeneeded = ({ target }) => {
      const db = target.result;
      if (!db.objectStoreNames.contains(_FAV_STORE_NAME)) {
        // keyed by slug so a second offline action on the same article overwrites the first
        db.createObjectStore(_FAV_STORE_NAME, { keyPath: 'slug' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// requestUrl: the original intercepted URL (same-origin proxy path).
// Auth is cookie-based so replaying via the same origin sends the session cookie automatically.
function _savePendingFavorite(slug, isFavorite, requestUrl) {
  return _openFavDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(_FAV_STORE_NAME, 'readwrite');
        const req = tx.objectStore(_FAV_STORE_NAME).put({ slug, isFavorite, requestUrl });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
}

function _getAllPendingFavorites(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(_FAV_STORE_NAME, 'readonly');
    const req = tx.objectStore(_FAV_STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Removes the pending entry only if its isFavorite value still matches `processedValue`.
// Guards against a race where a new offline action overwrites the entry while a concurrent
// syncFavorites() is mid-flight: without this check, the new action would be silently deleted.
function _removePendingFavoriteIfUnchanged(db, slug, processedValue) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(_FAV_STORE_NAME, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    const store = tx.objectStore(_FAV_STORE_NAME);
    const getReq = store.get(slug);
    getReq.onsuccess = () => {
      if (getReq.result?.isFavorite === processedValue) store.delete(slug);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

// ── Fetch interceptor ────────────────────────────────────────────────────────

/**
 * Called for every POST/DELETE to …/articles/:slug/favorite.
 *
 * Online:  passes the request through unchanged, then drains any pending queue
 *          as a piggyback side-effect (fallback for when Background Sync doesn't fire).
 * Offline: optimistically patches every cached GET response that contains
 *          this article (single-article and list responses), queues the action
 *          for background sync, and returns a synthetic 200 reflecting the
 *          post-action state so Angular's store updates immediately.
 */
async function handleFavoriteRequest(request) {
  const slugMatch = new URL(request.url).pathname.match(/\/articles\/([^/]+)\/favorite$/);
  if (!slugMatch) return fetch(request);

  const slug = slugMatch[1];
  const isFavoriting = request.method === 'POST';

  try {
    const response = await fetch(request.clone());
    // We are online — drain pending offline actions as a piggyback side-effect.
    syncFavorites().catch(() => {});
    return response;
  } catch {
    // ── offline path ──────────────────────────────────────────────────────
    const cached = await getArticleFromApiCache(slug);
    const preCount = cached?.favoritesCount ?? 0;
    const postCount = Math.max(0, preCount + (isFavoriting ? 1 : -1));

    // Patch every cached GET response so future offline reads are consistent
    await patchArticleInApiCache(slug, isFavoriting, postCount);

    // Store the original URL so the sync replay hits the same-origin proxy path,
    // which ensures session cookies are forwarded to the backend automatically.
    await _savePendingFavorite(slug, isFavoriting, request.url);
    self.registration.sync.register('sync-favorites').catch(() => { /* sync not supported */ });

    const article = { ...(cached ?? { slug }), favorited: isFavoriting, favoritesCount: postCount };
    return new Response(JSON.stringify({ article }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ── Background sync ──────────────────────────────────────────────────────────

/**
 * Replays every pending favorite/unfavorite against the live API.
 * On success reconciles the IDB cache with the server's authoritative values.
 * Throwing causes the browser to retry the sync later.
 */
async function syncFavorites() {
  const db = await _openFavDb();
  const pending = await _getAllPendingFavorites(db);

  for (const item of pending) {
    // Fall back to a same-origin relative path for items queued before requestUrl was stored.
    const url = item.requestUrl ?? `/api/articles/${item.slug}/favorite`;

    try {
      const response = await fetch(url, {
        method: item.isFavorite ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // sends session cookies — required for cookie-based auth
      });

      if (response.ok) {
        const { article } = await response.json();
        if (article) {
          await patchArticleInApiCache(article.slug, article.favorited, article.favoritesCount);
        }
        await _removePendingFavoriteIfUnchanged(db, item.slug, item.isFavorite);
      } else if (response.status >= 400 && response.status < 500) {
        // Client error (session expired, article deleted, etc.) — retrying won't help
        await _removePendingFavoriteIfUnchanged(db, item.slug, item.isFavorite);
      } else {
        throw new Error(`sync-favorites: server returned ${response.status} for ${item.slug}`);
      }
    } catch (error) {
      console.error('Background sync failed for:', item.slug, error);
      throw error; // triggers browser retry
    }
  }
}

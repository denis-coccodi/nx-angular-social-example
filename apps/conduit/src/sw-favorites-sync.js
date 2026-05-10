// Background-sync handler for offline favorite/unfavorite actions.
// Imported by offline-sw.js via importScripts.

const _FAV_DB_NAME = 'conduit-offline';
const _FAV_STORE_NAME = 'favorites';
const _FAV_FALLBACK_API_URL = 'http://localhost:8080/api';

function _getFavApiUrl() {
  return caches
    .open('conduit-sw-config')
    .then((cache) => cache.match('/sw-config.json'))
    .then((res) => (res ? res.json().then((j) => j.api_url) : _FAV_FALLBACK_API_URL))
    .catch(() => _FAV_FALLBACK_API_URL);
}

function _openFavDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(_FAV_DB_NAME, 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function _getAllPendingFavorites(db) {
  return new Promise((resolve) => {
    const tx = db.transaction(_FAV_STORE_NAME, 'readonly');
    const req = tx.objectStore(_FAV_STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
  });
}

function _removeFavoriteFromDb(db, slug) {
  const tx = db.transaction(_FAV_STORE_NAME, 'readwrite');
  tx.objectStore(_FAV_STORE_NAME).delete(slug);
}

async function syncFavorites() {
  const apiUrl = await _getFavApiUrl();
  const db = await _openFavDb();
  const favorites = await _getAllPendingFavorites(db);

  for (const item of favorites) {
    try {
      const response = await fetch(`${apiUrl}/articles/${item.slug}/favorite`, {
        method: item.isFavorite ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        _removeFavoriteFromDb(db, item.slug);
      }
    } catch (error) {
      console.error('Background sync failed for item:', item.slug, error);
      // Re-throwing triggers a browser retry
      throw error;
    }
  }
}

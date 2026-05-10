// Cache-first handler for cross-origin image requests.
// Imported by offline-sw.js via importScripts.

const _IMG_CACHE_NAME = 'conduit-images';
const _IMG_EXT = /\.(?:jpe?g|png|webp|gif|svg|avif|ico)(?:[?#]|$)/i;

function isImageRequest(request) {
  if (request.method !== 'GET') return false;
  try {
    const url = new URL(request.url);
    return url.origin !== self.location.origin && _IMG_EXT.test(url.pathname);
  } catch {
    return false;
  }
}

async function handleImageCacheRequest(request) {
  const cache = await caches.open(_IMG_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    // Cache both normal (ok) and opaque (no-CORS cross-origin) responses
    if (response.ok || response.type === 'opaque') {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response(null, { status: 503 });
  }
}

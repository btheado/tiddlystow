// Constants and configuration
const OPFS_PREFIX =  'i/';
const NATIVEFS_PREFIX = 'e/';

const createResponse = (body, options = {}) => {
  const { status = 200, statusText = 'OK', headers = {} } = options;
  return new Response(body, { status, statusText, headers: new Headers(headers) });
};

// TODO: home page links
// TODO: add download/backup buttons to the directory list page (but only for opfs?)

importScripts('./idbKeyval.js', './corefs.js', './opfs.js', './nativefs.js');

// Fetch handler to convert HTTP read/write methods to browser file system calls
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const { url } = request;

  const scopeUrl = new URL(self.registration.scope);
  const requestUrl = new URL(url);
  let route;

  if (requestUrl.pathname.startsWith(scopeUrl.pathname + OPFS_PREFIX)) {
    route = OPFS_PREFIX;
  } else if (requestUrl.pathname.startsWith(scopeUrl.pathname + NATIVEFS_PREFIX)) {
    route = NATIVEFS_PREFIX;
  } else {
    // Fetch all other resources from the network. Serve from cache on failure in order to support offline use.
    // Directory listings and stored files are handled by the service worker which is always available offline.
    // So this is really only for files like index.html.
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
    return;
  }

  const relativePath = requestUrl.pathname.slice(scopeUrl.pathname.length + route.length);
  const pathParts = relativePath.split('/').filter(Boolean);

  if (pathParts.length > 1) {
    event.respondWith(createResponse('Wiki subdirectories are not supported', {
      status: 404,
      statusText: 'Not Found',
      headers: { 'Content-Type': 'text/plain' }
    }));
    return;
  }

  const fileName = pathParts[0];
  const dirName = (scopeUrl.pathname + route).replace(/\/$/,'').replaceAll('/', '#');
  if (route === OPFS_PREFIX) {
    event.respondWith(handleOpfsRequest(request, route, dirName, fileName));
  } else if (route === NATIVEFS_PREFIX) {
    event.respondWith(handleNativeFsRequest(request, route, dirName, fileName));
  }
});

// Offline support
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('tiddlystow-v2-001').then((cache) => {
      return cache.addAll([
        './',
        'index.html',
        'manifest.json',
        '../favicon.ico',
        '../android-chrome-192x192.png',
        '../android-chrome-512x512.png'
      ]);
    })
  );
});

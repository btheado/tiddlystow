// Constants and configuration
const OPFS_PREFIX =  'i/';
const NATIVEFS_PREFIX = 'e/';

const createResponse = (body, options = {}) => {
  const { status = 200, statusText = 'OK', headers = {} } = options;
  return new Response(body, { status, statusText, headers: new Headers(headers) });
};

importScripts('./idbKeyval.js', './page.js', './corefs.js', './opfs.js', './nativefs.js');

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
  const rawPathParts = relativePath.split('/').filter(Boolean);
  const pathParts = rawPathParts.map((part) => decodeURIComponent(part));
  let pathInfo = {
    mountSlug: null,
    pathSegments: pathParts,
    isDirectoryRequest: requestUrl.pathname.endsWith('/')
  };

  if (route === NATIVEFS_PREFIX && pathParts[0]?.startsWith('@') && pathParts[0].length > 1) {
    pathInfo = {
      mountSlug: pathParts[0].slice(1),
      pathSegments: pathParts.slice(1),
      isDirectoryRequest: requestUrl.pathname.endsWith('/') || pathParts.length === 1
    };
  }

  const dirName = (scopeUrl.pathname + route).replace(/\/$/,'').replaceAll('/', '#');
  if (route === OPFS_PREFIX) {
    event.respondWith(handleOpfsRequest(request, route, dirName, pathInfo));
  } else if (route === NATIVEFS_PREFIX) {
    event.respondWith(handleNativeFsRequest(request, route, dirName, pathInfo));
  }
});

// Offline support
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('tiddlystow-v2-003').then((cache) => {
      return cache.addAll([
        './',
        'index.html',
        'manifest.json',
        'idbKeyval.js',
        'page.js',
        'styles/wiki-creator.css',
        'styles/directory-list.css',
        'styles/nativefs.css',
        'styles/opfs.css',
        'scripts/wiki-creator.js',
        'scripts/directory-list.js',
        'scripts/nativefs-page.js',
        'scripts/opfs-eviction.js',
        '../favicon.ico',
        '../android-chrome-192x192.png',
        '../android-chrome-512x512.png'
      ]);
    })
  );
});

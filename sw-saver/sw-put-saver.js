// Constants and configuration
const SUPPORTED_METHODS = ['OPTIONS', 'GET', 'HEAD', 'DELETE', 'PUT'];
const OPFS_PREFIX =  'i/';
const NATIVEFS_PREFIX = 'e/';

const createResponse = (body, options = {}) => {
  const { status = 200, statusText = 'OK', headers = {} } = options;
  return new Response(body, { status, statusText, headers: new Headers(headers) });
};

// TODO: fail the service worker installation if OPFS is not supported?
const handleOptions = () => createResponse(null, {
  // For a real WEBDAV server, the dav header will have value like "1,2", but
  // the TiddlyWiki PUT saver only checks for presence of the header and doesn't
  // care about the value.
  headers: {
    'dav': '0',
    'Allow': SUPPORTED_METHODS.join(', ')
  }
});

function getWikiCreatorHtml(fileName) {
  return `
    <html>
    <head>
      <title>Create new Tiddlywiki file</title>
      <script type="module">
        async function saveAndReload(contents, type, size) {
          if (contents) {
            await fetch(window.location.href, {
              method: 'PUT',
              headers: {
                'Content-Type': type,
                'Content-Length': size
              },
              body: contents
            });
            window.location.reload();
          }
        }
        window.openFromUrl = async function (url) {
          // TODO: error handling
          const contents = await fetch(url).then(res => res.text());
          saveAndReload(contents, "text/html", contents.length)
        }
        // Hmm, it would be best to use file.name to store the file? That
        // way the file extension gets picked up automatically? Because it
        // seems the file extension is what is used when reading opfs file to get the mime type?
        // But it might be common to want to upload the same file as a template for multiple
        // different opfs files. In fact for TW files, I would think that would be the common case.
        // For static files I think using the file name would be the common case.
        window.openFromUpload = function (event) {
          const file = event.target.files[0];
          const reader = new FileReader();
          reader.onload = async function(event) {
            saveAndReload(event.target.result, file.type, file.size);
          };
          // Array buffer works for both png and html files to pass to fetch
          reader.readAsArrayBuffer(file);
        }
      </script>
    </head>
    <body>
      <p>File '${fileName}' doesn't exist.</p>
      <p>Create from a remote url?</p>
      <ul>
        <li><button type="button" onclick="openFromUrl('https://tiddlywiki.com/empty.html')">tiddlywiki.com/empty.html</button></li>
        <li><button type="button" onclick="openFromUrl('https://tiddlywiki.com/prerelease/empty.html')">tiddlywiki.com/prerelease</button></li>
      </ul>
      <p>Upload file into the browser?</p>
      <input type="file" id="fileInput" onchange="openFromUpload(event)">
    </body>
    </html>
  `;
}

const handleGetFile = async (dirHandle, fileName, headersOnly = false) => {
  try {
    const fileHandle = await dirHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const contents = headersOnly ? null :
      (file.type.startsWith('text/') ? await file.text() : await file.arrayBuffer());

    // Create a 200 response from the contents of the file handle
    return createResponse(contents, {
      headers: {
        "Content-Type": file.type || "text/html",
        "Content-Length": file.size
      }
    });
  } catch (error) {
    if (error.name === 'NotFoundError') {
      // TODO: only do this for .html suffix. Return a plain 404 otherwise?
      // Return an html page which allows wiki to be uploaded or fetched from url
      // the page will be replaced with the wiki and the put saver will takeover from there
      return createResponse(getWikiCreatorHtml(fileName), {
        status: 404,
        statusText: "File not found",
        headers: { "Content-Type": "text/html" }
      });
    }
    // Handle other errors
    console.error('Error accessing file:', error);
    return createResponse(`Error accessing file '${fileName}: ${error}'.`, {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};
const handlePutFile = async (dirHandle, fileName, request) => {
  try {
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    const contentType = request.headers.get('Content-Type');
    const content = contentType?.includes('text/') ? await request.text() : await request.arrayBuffer();

    await writable.write(content);
    await writable.close();
    return createResponse(null, { status: 200 });
  } catch (error) {
    console.error('Error saving file:', error);
    return createResponse(`Error saving file '${fileName}: ${error}'.`, {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};
const handleDeleteFile = async (dirHandle, fileName) => {
  try {
    await dirHandle.removeEntry(fileName);
    return createResponse(null, { status: 204, statusText: "No Content" });
  } catch (error) {
    if (error.name === 'NotFoundError') {
      return createResponse(`Could not delete file '${fileName}'. File not found.`, {
        status: 404,
        statusText: "File not found",
        headers: { "Content-Type": "text/plain" }
      });
    }
    console.error('Error deleting file:', error);
    return createResponse(`Error deleting file '${fileName}: ${error}'.`, {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};
function getDirectoryListHtml(baseUrl, files, storageWarningHtml) {
  // TODO: provide a button to download/export all opfs files. Probably best to implement it as a
  // service worker endpoint whose GET method returns a zip file of the contents. That way the
  // UI doesn't know about opfs...all opfs access is on the "server" side of the service worker.
  const fileListHtml = files.length == 0 ? "" : `
      <p>Files in this directory</p>
      <ul>
        ${files.map(f => `
          <li>
            <a href="${baseUrl}${f.name}">${f.name}</a>
            <button onclick="deleteFile('${baseUrl}${f.name}')">Delete</button>
          </li>`).join("\n")}
      </ul>
  `;
  return html = `
    <html>
    <head>
      <title>File list</title>
    </head>
    <body>
      <input type="text" id="urlInput" placeholder="New wiki name">.html
      <button onclick="navigateToURL()">Go</button>
      ${fileListHtml}
      ${storageWarningHtml || ""}
      <script>
        function navigateToURL() {
          var userInput = document.getElementById("urlInput").value.trim();
          if (userInput !== "") {
            // Navigate to the file creation page for this wiki
            // TODO: url encoding userInput
            window.location.href = userInput; // + ".html";
          }
        }
        function deleteFile(url) {
          fetch(url, {method: 'DELETE'})
          .then(response => {
            if (response.ok) {
              window.location.reload();
            } else {
              console.log('Failed to delete', url);
            }
          })
          .catch(error => {
            console.log('Failed to delete:', error)
          })
        }
      </script>
    </body>
    </html>
  `;
}

const handleListDirectory = async (dirHandle, request, storageWarningHtml) => {
  try {
    const files = [];
    for await (const file of dirHandle.values()) {
      files.push(file);
    }

    const acceptHeader = request.headers.get("Accept");
    if (acceptHeader?.includes("application/json")) {
      const json = JSON.stringify(files.map(file => ({ kind: file.kind, name: file.name })));
      return createResponse(json, { headers: { "Content-Type": "application/json" } });
    } else {
      const html = getDirectoryListHtml(request.url, files, storageWarningHtml);
      return createResponse(html, { headers: { "Content-Type": "text/html" } });
    }
  } catch (error) {
    console.error('Error listing directory:', error);
    return createResponse(`Error listing directory: ${error}`, {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};

importScripts('./idbKeyval.js');
function getNativeFSDirectoryPickerHtml(idbKey) {
  return html = `
    <html>
    <head>
      <title>Directory picker</title>
    </head>
    <body>
      No externl wiki directory found: <button onclick="pickDirectory()">Pick external directory</button>
      <script src="../idbKeyval.js"></script>
      <script>
        async function pickDirectory() {
          // pick directory, store file handle in idb and reload the page
          const idbKey = '${idbKey}';
          const dirHandle = await window.showDirectoryPicker({mode: 'readwrite'});
          await idbKeyval.set(idbKey, dirHandle);
          console.log(dirHandle);
          window.location.reload();
        }
      </script>
    </body>
    </html>
  `;
}
function handleNativeFSDirectorySelection(idbKey) {
  const html = getNativeFSDirectoryPickerHtml(idbKey);
  return createResponse(html, {
    status: 404,
    statusText: 'Directory Handle Not Found',
    headers: { "Content-Type": "text/html"}
  });
}
function getNativeFSPermissionRequestHtml(idbKey) {
  return html = `
    <html>
    <head>
      <title>Directory permission request</title>
    </head>
    <body>
      Directory access unauthorized: <button onclick="requestDirectoryPermission()">Request directory permission</button>
      <script src="../idbKeyval.js"></script>
      <script>
        async function requestDirectoryPermission() {
          const idbKey = '${idbKey}';
          const dirHandle = await idbKeyval.get(idbKey);
          console.log(dirHandle);
          await dirHandle.requestPermission({mode: 'readwrite'});
          window.location.reload();
        }
      </script>
    </body>
    </html>
  `;
}
function handleNativeFSPermissionNotGranted(idbKey) {
  const html = getNativeFSPermissionRequestHtml(idbKey);
  return createResponse(html, {
    status: 403,
    statusText: 'Directory Access Unauthorized',
    headers: { "Content-Type": "text/html"}
  });
}

async function fileExists(directoryHandle, fileName) {
    try {
        // Attempt to get the file handle
        await directoryHandle.getFileHandle(fileName, { create: false });
        return true; // File exists
    } catch (error) {
        if (error.name === 'NotFoundError') {
            return false; // File does not exist
        }
        throw error; // Rethrow unexpected errors
    }
}

function getOpfsEvictionProtectionHtml(idbKey, nextUrl) {
  let nextPage = "window.location.reload();";
  if (nextUrl) {
    nextPage = `window.location.href = "${nextUrl}"`
  }
  return html = `
    <html>
    <head>
      <title>Request Protection from Storage Eviction</title>
    </head>
    <body onload="document.cookie = 'storageNoticeShown=true; path=/; samesite=strict'">
      <h1>Prevent Files from Being Automatically Deleted</h1>
      <p>
        By default, web browsers may automatically delete stored files to free up space.
        To help protect your files from unexpected removal, you can request persistent storage by clicking the button below.
      </p>
      <p>
        <strong>Note:</strong>
        - <strong>Firefox:</strong> You'll see a prompt asking for permission to persist storage.
        - <strong>Chrome:</strong> This will likely be granted automatically if the page is bookmarked or added to the home screen. Otherwise, the request will be denied automatically.
      </p>
      <p>
        <strong>Important:</strong> This does not prevent you from manually clearing storage.
        Be sure to back up important files regularly.
      </p>
      <button onclick="requestEvictionProtection()">Request protection from storage eviction</button>
      <script src="../idbKeyval.js"></script>
      <script>
        async function requestEvictionProtection() {
          const idbKey = '${idbKey}';
          await idbKeyval.set(idbKey, true);
          const persisted = await navigator.storage.persist()
          console.log(persisted);
          ${nextPage}
        }
      </script>
    </body>
    </html>
  `;
}
function handleOpfsEvictionProtectionNotGranted(idbKey, nextUrl) {
  const html = getOpfsEvictionProtectionHtml(idbKey, nextUrl);
  return createResponse(html, {
    status: 403,
    statusText: 'Eviction protection not enabled',
    headers: { "Content-Type": "text/html"}
  });
}
const getOpfsBaseDirHandle = async (baseDirName) => {
  const opfsRoot = await navigator.storage.getDirectory();
  return opfsRoot.getDirectoryHandle(baseDirName, { create: true });
};

function handleFileRequest(request, baseDirHandle, fileName) {
  const { method } = request;
  if (fileName) {
    switch (method) {
      case 'GET':
        return handleGetFile(baseDirHandle, fileName);
      case 'PUT':
        return handlePutFile(baseDirHandle, fileName, request);
      case 'DELETE':
        return handleDeleteFile(baseDirHandle, fileName);
      case 'HEAD':
        return handleGetFile(baseDirHandle, fileName, true);
      case 'OPTIONS':
        return handleOptions();
      default:
        return createResponse(`Method ${method} not allowed`, {
          status: 405,
          statusText: 'Method Not Allowed',
          headers: { 'Allow': SUPPORTED_METHODS.join(', ') }
        });
    }
  } else {
    return handleListDirectory(baseDirHandle, request);
  }
}
const handleOpfsRequest = async (request, route, dirName, fileName) => {
  const baseDirHandle = await getOpfsBaseDirHandle(dirName);
  const idbKey = `${dirName}?storage_notice_shown`;
  if (!await navigator.storage.persisted() && request.method === 'GET' && await fileExists(baseDirHandle, fileName) && !await self.idbKeyval.get(idbKey)) {
    // Intercept the page the first time an existing file is requested so the user can reqeust eviction protection
    return handleOpfsEvictionProtectionNotGranted(idbKey);
  }
  // The eviction protection page can be explicitly requested using a parameter on the dir listing url (i.e. 'i/?request_eviction_protection')
  const request_url = new URL(request.url);
  if (!fileName && request_url.searchParams.has('request_eviction_protection')) {
    request_url.searchParams.delete('request_eviction_protection');
    return handleOpfsEvictionProtectionNotGranted(idbKey, request_url.href);
  }
  if (!fileName && !await navigator.storage.persisted() && await self.idbKeyval.get(idbKey)) {
    // Augment the directory listing page with a message about requesting eviction protection
    return handleListDirectory(baseDirHandle, request, "<p>Storage not protected from eviction. <a href='?request_eviction_protection'>Request eviction protection</a></p>");
  }

  // Translate the http method in the request to a filesystem action for the given filename
  return handleFileRequest(request, baseDirHandle, fileName);
}
const handleNativeFsRequest = async (request, route, dirName, fileName) => {
  const idbKey = dirName;
  const baseDirHandle = await self.idbKeyval.get(idbKey);
  if (!baseDirHandle) {
    return handleNativeFSDirectorySelection(idbKey);
  } else if (await baseDirHandle.queryPermission({mode: 'readwrite'}) !== 'granted') {
    return handleNativeFSPermissionNotGranted(idbKey);
  }

  // Translate the http method in the request to a filesystem action for the given filename
  return handleFileRequest(request, baseDirHandle, fileName);
}

// Main event listener
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
    return; // Not our responsibility
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

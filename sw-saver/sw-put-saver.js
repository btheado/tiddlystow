// TODO: fail the service worker installation if OPFS is not supported?
function getOptionsResponse() {
    // For a real WEBDAV server, the dav header will have value like "1,2", but
    // the TiddlyWiki PUT saver only checks for presence of the header and doesn't
    // care about the value.
    const headers = new Headers({
      'dav': '0',
      'Allow': 'OPTIONS, GET, HEAD, DELETE, PUT'
    });

    // Send the headers in a 200 OK response
    const response = new Response(null, {
      status: 200,
      headers: headers
    });
    return response;
}
function getWikiCreatorHtml(fileName) {
  return `
    <html>
    <head>
      <title>Create new Tiddlywiki file</title>
      <script type="module">
        function replacePageContents(contents) {
          if (contents) {
            document.open();
            document.write(contents);
            document.close();
          }
        }
        window.openFromUrl = async function (url) {
          // TODO: error handling
          const contents = await fetch(url).then(res => res.text());
          replacePageContents(contents);
        }
        window.openFromUpload = function (event) {
          const file = event.target.files[0];
          const reader = new FileReader();
          reader.onload = function(event) {
            replacePageContents(event.target.result);
          };
          reader.readAsText(file);
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
      <input type="file" id="fileInput" accept=".html" onchange="openFromUpload(event)">
    </body>
    </html>
  `;
}
async function getFileFromOpfs(basePath, fileName, headersOnly=false) {
  try {
    // Create a 200 response from the contents of the file handle
    const dir = await getBaseDirHandle(basePath);
    const fileHandle = await dir.getFileHandle(fileName),
      file = await fileHandle.getFile(),
      contents = file.type.startsWith('text/') ? await file.text() : await file.arrayBuffer();
    return new Response(headersOnly ? null : contents, {headers: new Headers({
      "Content-Type": file.type ? file.type : "text/html",
      "Content-Length": file.size
    })});
  } catch (error) {
    if (error.name === 'NotFoundError') {
      // TODO: only do this for .html suffix. Return a plain 404 otherwise
      // Return an html page which allows wiki to be uploaded or fetched from url
      // the page will be replaced with the wiki and the put saver will takeover from there
      return new Response(getWikiCreatorHtml(fileName), {
        status: 404,
        statusText: "File not found",
        headers: new Headers({"Content-Type": "text/html"})
      });
    } else {
      // Handle other errors
      console.error('Error accessing file:', error);
      return new Response(`Error accessing file '${fileName}: ${error}'.`, {
        status: 500,
        statusText: 'Internal Server Error',
        headers: {'Content-Type': 'text/plain'}
      });
    }
  }
}
// TODO: How to handle requesting eviction protection permission? I doubt service worker is allowed to make such a request
// TODO: error handling
async function saveFileToOpfs(basePath, fileName, request) {
  const dir = await getBaseDirHandle(basePath),
    fileHandle = await dir.getFileHandle(fileName, {create: true}),
    writable = await fileHandle.createWritable(),
    contentType = request.headers.get('Content-Type'),
    content = (contentType && contentType.includes('text/')) ? await request.text() : await request.arrayBuffer();
  await writable.write(content);
  await writable.close();
  return new Response(null, {
    status: 200,
    statusText: 'OK'
  });
}
async function deleteFileFromOpfs(basePath, fileName) {
  try {
    const dir = await getBaseDirHandle(basePath);
    await dir.removeEntry(fileName);
    return new Response(null, {status: 204, statusText: "No Content"});
  } catch (error) {
    if (error.name === 'NotFoundError') {
      return new Response(`Could not delete file '${fileName}'. File not found.`, {
        status: 404,
        statusText: "File not found",
        headers: new Headers({"Content-Type": "text/plain"})
      });
    } else {
      // Handle other errors
      console.error('Error accessing file:', error);
      return new Response(`Error accessing file '${fileName}: ${error}'.`, {
        status: 500,
        statusText: 'Internal Server Error',
        headers: {'Content-Type': 'text/plain'}
      });
    }
  }
}
function getDirectoryListHtml(baseUrl, files) {
  // TODO: provide a button to download/export all opfs files. Probably best to implement it as a
  // service worker endpoint whose GET method returns a zip file of the contents. That way the
  // UI doesn't know about opfs...all opfs access is on the "server" side of the service worker.
  return html = `
    <html>
    <head>
      <title>File list</title>
    </head>
    <body>
      <input type="text" id="urlInput" placeholder="New wiki name">.html
      <button onclick="navigateToURL()">Go</button>
      <p>Files in this directory</p>
      <ul>
        ${files.map(f => `
          <li>
            <a href="${baseUrl}${f.name}">${f.name}</a>
            <button onclick="deleteFile('${baseUrl}${f.name}')">Delete</button>
          </li>`).join("\n")}
      </ul>
      <script>
        function navigateToURL() {
          var userInput = document.getElementById("urlInput").value.trim();
          if (userInput !== "") {
            // Navigate to the file creation page for this wiki
            // TODO: url encoding userInput
            window.location.href = userInput + ".html";
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
function getDirectoryListJson(files) {
  return files.map(file => ({kind: file.kind, name: file.name}))
}
// TODO: error handling
async function listOpfsDirectory(basePath, request) {
  const dir = await getBaseDirHandle(basePath),
    files = [];
  for await (const file of dir.values()) {
    files.push(file);
  }
  const acceptHeader = request.headers.get("Accept");
  if (acceptHeader && acceptHeader.includes("application/json")) {
    const json = JSON.stringify(getDirectoryListJson(files));
    return new Response(json, {headers: new Headers({"Content-Type": "application/json"})});
  } else {
    const html = getDirectoryListHtml(request.url, files);
    return new Response(html, {headers: new Headers({"Content-Type": "text/html"})});
  }
}
// Use a subdirectory off the opfs root. The name of the subdir is derived
// from the scope of the service worker. i.e. 'sw-saver' => 'sw-saver#w'
async function getBaseDirHandle(basePath) {
  const opfsRoot = await navigator.storage.getDirectory();
  return await opfsRoot.getDirectoryHandle((basePath.split('/') + ['w'].join('#')), {create: true});
}
self.addEventListener('fetch', event => {
  const { request } = event;
  const { method, url } = request;

  if (method === 'OPTIONS') {
    event.respondWith(getOptionsResponse());
    return;
  }

  if (!url.startsWith(self.registration.scope + 'w/')) {
    // Only handle requests starting with '/w/'
    return;
  }

  const scopePathname = new URL(self.registration.scope).pathname;
  const urlPathname = new URL(url).pathname.replace(scopePathname, '');
  const pathParts = urlPathname.split('/').filter(part => part !== '');

  if (pathParts.length > 2) {
    // Unsupported subdirectories
    const response = new Response('Wiki subdirectories are not supported', {
      status: 404,
      statusText: 'Not Found',
      headers: {
        'Content-Type': 'text/plain'
      }
    });
    event.respondWith(response);
    return;
  }

  if (pathParts.length === 2) {
    const fileName = pathParts[1];

    if (method === 'GET') {
      event.respondWith(getFileFromOpfs(scopePathname, fileName));
    } else if (method === 'PUT') {
      event.respondWith(saveFileToOpfs(scopePathname, fileName, request));
    } else if (method === 'DELETE') {
      event.respondWith(deleteFileFromOpfs(scopePathname, fileName));
    } else if (method === 'HEAD') {
      event.respondWith(getFileFromOpfs(scopePathname, fileName, headersOnly=true));
    }
  } else {
    event.respondWith(listOpfsDirectory(scopePathname, request));
  }
});


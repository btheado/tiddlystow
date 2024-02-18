function getOptionsResponse() {
    // These verbs will eventually be supported.
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
async function getFileFromOpfs(fileName) {
  // TODO: use a subdirectory based on the scope of the service worker to ensure there are no
  // conflicts with other uses of opfs on the same domain
  const opfsRoot = await navigator.storage.getDirectory();
  try {
    // Create a 200 response from the contents of the file handle
    const fileHandle = await opfsRoot.getFileHandle(fileName),
      file = await fileHandle.getFile(),
      contents = await file.text();
    return new Response(contents, {headers: new Headers({"Content-Type": "text/html"})});
  } catch (error) {
    if (error.name === 'NotFoundError') {
      // TODO: only do this for .html suffix. Return a plain 404 otherwise
      // Return an html page which allows wiki to be uploaded or fetched from url
      // the page will be replaced with the wiki and the put saver will takeover from there
      // TODO: provide a button to download/export all opfs files
      const html = `
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
      return new Response(html, {
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
async function saveFileToOpfs(fileName, request) {
  const opfsRoot = await navigator.storage.getDirectory(),
    fileHandle = await opfsRoot.getFileHandle(fileName, {create: true}),
    writable = await fileHandle.createWritable(),
    content = await request.text();
  await writable.write(content);
  await writable.close();
  return new Response(null, {
    status: 200,
    statusText: 'OK'
  });
}
async function deleteFileFromOpfs(fileName) {
  // TODO: use a subdirectory based on the scope of the service worker to ensure there are no
  // conflicts with other uses of opfs on the same domain
  const opfsRoot = await navigator.storage.getDirectory();
  try {
    await opfsRoot.removeEntry(fileName);
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
async function listOpfsDirectory(request) {
  const opfsRoot = await navigator.storage.getDirectory(),
    fileNames = [];
  for await (const key of opfsRoot.keys()) {
    fileNames.push(key);
  }
  const html = `
    <html>
    <head>
      <title>File list</title>
    </head>
    <body>
      <input type="text" id="urlInput" placeholder="New wiki name">.html
      <button onclick="navigateToURL()">Go</button>
      <p>Files in this directory</p>
      <ul>
        ${fileNames.map(f => `
          <li>
            <a href="${request.url}${f}">${f}</a>
            <button onclick="deleteFile('${request.url}${f}')">Delete</button>
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
  return new Response(html, {headers: new Headers({"Content-Type": "text/html"})});
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

    // TODO: HEAD request support
    if (method === 'GET') {
      event.respondWith(getFileFromOpfs(fileName));
    } else if (method === 'PUT') {
      event.respondWith(saveFileToOpfs(fileName, request));
    } else if (method === 'DELETE') {
      event.respondWith(deleteFileFromOpfs(fileName));
    }
  } else {
    event.respondWith(listOpfsDirectory(request));
  }
});


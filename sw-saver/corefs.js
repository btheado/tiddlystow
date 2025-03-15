const SUPPORTED_METHODS = ['OPTIONS', 'GET', 'HEAD', 'DELETE', 'PUT'];
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

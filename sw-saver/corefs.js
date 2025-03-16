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
  // Properly encode URLs for security
  const encodePathComponent = (component) => {
    return encodeURIComponent(component).replace(/'/g, '%27');
  };

  // Create file list HTML only if files exist
  const fileListHtml = files.length === 0 ? "" : `
    <div class="file-list">
      <h2>Files in this directory</h2>
      <ul class="file-items">
        ${files.map(f => {
          const encodedPath = encodePathComponent(f.name);
          const fullPath = `${baseUrl}${encodedPath}`;
          return `
          <li class="file-item">
            <div class="file-info">
              <a href="${fullPath}" class="file-link">${f.name}</a>
              ${f.size !== undefined ? `<span class="file-size">(${formatFileSize(f.size)})</span>` : ''}
            </div>
            <div class="file-actions">
              <button
                class="delete-btn"
                onclick="deleteFile('${fullPath}', '${f.name}')"
                aria-label="Delete ${f.name}"
              >Delete</button>
            </div>
          </li>`;
        }).join("")}
      </ul>
    </div>
  `;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>File Directory</title>
      <style>
        :root {
          --primary-color: #3498db;
          --danger-color: #e74c3c;
          --warning-bg: #fcf8e3;
          --warning-border: #faebcc;
          --warning-text: #8a6d3b;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          max-width: 900px;
          margin: 0 auto;
          padding: 20px;
          color: #333;
        }

        h1, h2 {
          margin-top: 0;
        }

        .create-form {
          display: flex;
          margin-bottom: 20px;
          align-items: center;
          gap: 5px;
        }

        .create-form input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 16px;
        }

        button {
          padding: 8px 12px;
          background-color: var(--primary-color);
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: background-color 0.2s;
        }

        button:hover {
          background-color: #2980b9;
        }

        .delete-btn {
          background-color: var(--danger-color);
          font-size: 12px;
          padding: 4px 8px;
        }

        .delete-btn:hover {
          background-color: #c0392b;
        }

        .file-items {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .file-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid #eee;
        }

        .file-link {
          color: var(--primary-color);
          text-decoration: none;
          word-break: break-all;
        }

        .file-link:hover {
          text-decoration: underline;
        }

        .file-size {
          color: #777;
          margin-left: 8px;
          font-size: 14px;
        }

        .file-actions {
          flex-shrink: 0;
          margin-left: 10px;
        }

        .warning-message {
          background-color: var(--warning-bg);
          border: 1px solid var(--warning-border);
          color: var(--warning-text);
          padding: 10px;
          margin: 10px 0;
          border-radius: 4px;
        }

        .warning-message a {
          color: var(--warning-text);
          font-weight: bold;
        }

        .empty-state {
          color: #777;
          font-style: italic;
          margin: 20px 0;
        }

        @media (max-width: 600px) {
          .create-form {
            flex-direction: column;
            align-items: stretch;
          }

          .create-form .file-extension {
            display: none;
          }

          button {
            margin-top: 8px;
          }
        }
      </style>
    </head>
    <body>
      <h1>File Directory</h1>

      ${storageWarningHtml ? `<div class="warning-message">${storageWarningHtml}</div>` : ""}

      <div class="create-form">
        <input
          type="text"
          id="urlInput"
          placeholder="New wiki name"
          aria-label="New wiki name"
        >
        <span class="file-extension">.html</span>
        <button onclick="navigateToURL()">Create</button>
      </div>

      ${fileListHtml || '<p class="empty-state">No files in this directory</p>'}

      <script>
        function navigateToURL() {
          const userInput = document.getElementById("urlInput").value.trim();
          if (userInput !== "") {
            // URL encode the user input for safety
            const encodedInput = encodeURIComponent(userInput);
            window.location.href = encodedInput + ".html";
          } else {
            alert("Please enter a file name");
          }
        }

        function deleteFile(url, fileName) {
          if (confirm("Are you sure you want to delete " + fileName + "?")) {
            fetch(url, { method: 'DELETE' })
              .then(response => {
                if (response.ok) {
                  window.location.reload();
                } else {
                  alert('Failed to delete: ' + fileName);
                  console.error('Delete failed with status:', response.status);
                }
              })
              .catch(error => {
                alert('Error deleting file: ' + error.message);
                console.error('Delete error:', error);
              });
          }
        }

        // Utility function to format file sizes
        function formatFileSize(bytes) {
          if (bytes === undefined || bytes === null) return '';

          const units = ['B', 'KB', 'MB', 'GB'];
          let size = bytes;
          let unitIndex = 0;

          while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
          }

          return size.toFixed(unitIndex === 0 ? 0 : 1) + ' ' + units[unitIndex];
        }

        // Focus the input field when the page loads
        document.addEventListener('DOMContentLoaded', () => {
          document.getElementById('urlInput').focus();

          // Add keyboard shortcut (Enter key) to create new file
          document.getElementById('urlInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
              navigateToURL();
            }
          });
        });
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

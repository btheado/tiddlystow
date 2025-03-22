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
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Create new TiddlyWiki file</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          line-height: 1.6;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          color: #333;
        }
        h1 {
          color: #1976d2;
          margin-bottom: 0.5em;
        }
        .container {
          background-color: #f5f5f5;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .section {
          margin-bottom: 20px;
          padding-bottom: 20px;
          border-bottom: 1px solid #e0e0e0;
        }
        .section:last-child {
          border-bottom: none;
          margin-bottom: 0;
          padding-bottom: 0;
        }
        .button-list {
          list-style-type: none;
          padding: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        button {
          background-color: #1976d2;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 8px 16px;
          cursor: pointer;
          transition: background-color 0.3s;
        }
        button:hover {
          background-color: #1565c0;
        }
        button:focus {
          outline: 2px solid #1976d2;
          outline-offset: 2px;
        }
        .file-input-wrapper {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        #status-message {
          margin-top: 20px;
          padding: 10px;
          border-radius: 4px;
          display: none;
        }
        .success {
          background-color: #e8f5e9;
          color: #2e7d32;
          border: 1px solid #c8e6c9;
        }
        .error {
          background-color: #ffebee;
          color: #c62828;
          border: 1px solid #ffcdd2;
        }
        .loading {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 3px solid rgba(0,0,0,0.2);
          border-radius: 50%;
          border-top-color: #1976d2;
          animation: spin 1s ease-in-out infinite;
          margin-right: 8px;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      </style>
      <script type="module">
        // Show status message helper function
        function showStatus(message, type) {
          const statusElement = document.getElementById('status-message');

          // Clear any previous content
          statusElement.innerHTML = '';

          if (type === 'loading') {
            // Create spinner element
            const spinner = document.createElement('span');
            spinner.className = 'loading';
            statusElement.appendChild(spinner);

            // Add the text message separately
            const textNode = document.createTextNode(message);
            statusElement.appendChild(textNode);
          } else {
            // For non-loading messages, just use text
            statusElement.textContent = message;
            statusElement.className = type;
          }

          statusElement.style.display = 'block';
        }

        // Save content and reload the page
        async function saveAndReload(contents, type, size) {
          if (!contents) {
            showStatus('Error: No content to save', 'error');
            return;
          }

          try {
            const response = await fetch(window.location.href, {
              method: 'PUT',
              headers: {
                'Content-Type': type,
                'Content-Length': size
              },
              body: contents
            });

            if (!response.ok) {
              throw new Error(\`Server responded with \${response.status}: \${response.statusText}\`);
            }

            showStatus('File saved successfully! Reloading...', 'success');
            //setTimeout(() => window.location.reload(), 1000);
            window.location.reload()
          } catch (error) {
            showStatus(\`Error saving file: \${error.message}\`, 'error');
            console.error('Save error:', error);
          }
        }

        // Open from URL handler
        window.openFromUrl = async function(url, description) {
          try {
            showStatus(\`Loading \${description || url}...\`, 'loading');
            const response = await fetch(url);

            if (!response.ok) {
              throw new Error(\`Server responded with \${response.status}: \${response.statusText}\`);
            }

            const contents = await response.text();
            saveAndReload(contents, "text/html", contents.length);
          } catch (error) {
            showStatus(\`Error fetching from URL: \${error.message}\`, 'error');
            console.error('Fetch error:', error);
          }
        };

        // Open from upload handler
        window.openFromUpload = function(event) {
          const fileInput = event.target;
          const file = fileInput.files[0];

          if (!file) {
            showStatus('No file selected', 'error');
            return;
          }

          // Validate file type (optional)
          const validTypes = ['text/html', 'application/xhtml+xml'];
          if (!validTypes.includes(file.type) && !file.name.endsWith('.html')) {
            showStatus('Warning: File does not appear to be an HTML file', 'error');
            // Continue anyway - user might know what they're doing
          }

          showStatus(\`Reading file: \${file.name}...\`, 'loading');

          const reader = new FileReader();
          reader.onload = async function(event) {
            try {
              await saveAndReload(event.target.result, file.type, file.size);
            } catch (error) {
              showStatus(\`Error processing file: \${error.message}\`, 'error');
              console.error('File processing error:', error);
            }
          };

          reader.onerror = function() {
            showStatus('Error reading file', 'error');
            console.error('FileReader error:', reader.error);
          };

          // Array buffer works for both png and html files to pass to fetch
          reader.readAsArrayBuffer(file);
        };

        // Reset file input when dialog is canceled
        window.resetFileInput = function() {
          document.getElementById('fileInput').value = '';
        };
      </script>
    </head>
    <body>
      <div class="container">
        <h1>Create TiddlyWiki</h1>
        <p>The file <strong>'${fileName}'</strong> doesn't exist yet.</p>

        <div class="section">
          <h2>Create from template</h2>
          <p>Start with an official TiddlyWiki template:</p>
          <ul class="button-list">
            <li><button type="button" aria-label="Create from empty TiddlyWiki template"
                onclick="openFromUrl('https://tiddlywiki.com/empty.html', 'Empty TiddlyWiki')">
                Latest release
            </button></li>
            <li><button type="button" aria-label="Create from TiddlyWiki prerelease template"
                onclick="openFromUrl('https://tiddlywiki.com/prerelease/empty.html', 'Prerelease TiddlyWiki')">
                Prerelease Version
            </button></li>
          </ul>
        </div>

        <div class="section">
          <h2>Upload existing TiddlyWiki</h2>
          <p>Upload a TiddlyWiki file from your computer:</p>
          <div class="file-input-wrapper">
            <input type="file" id="fileInput"
                  accept=".html,.htm"
                  aria-label="Upload TiddlyWiki file"
                  onchange="openFromUpload(event)"
                  onclick="resetFileInput()">
            <p><small>Select an HTML file containing a TiddlyWiki</small></p>
          </div>
        </div>

        <div id="status-message"></div>
      </div>
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
function getDirectoryListHtml(baseUrl, files, {storageWarningHtml, footerHtml} = {}) {
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
              <!-- This is not working for chrome. It gives error "file wasn't available on site". It works fine in firefox -->
              <a
                class="btn"
                href="${fullPath}"
                download="${f.name}"
                aria-label="Download ${f.name}"
                role="button"
              >Download</a>
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

        .input-wrapper {
          display: flex;
          align-items: center;
          flex: 1;
        }

        .input-wrapper input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 16px;
        }

        .file-extension {
          margin-left: 4px;
          font-size: 16px;
        }

        button, .btn {
          padding: 8px 12px;
          background-color: var(--primary-color);
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: background-color 0.2s;
        }

        button:hover, .btn:hover {
          background-color: #2980b9;
        }

        .file-actions button, .file-actions .btn {
          font-size: 12px;
          padding: 4px 8px;
        }

        a.btn {
          text-decoration: none;
        }

        .delete-btn, .disconnect-button {
          background-color: var(--danger-color);
        }

        .delete-btn:hover, .disconnect-button:hover {
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

          .input-wrapper {
            width: 100%;
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
        <div class="input-wrapper">
        <input
          type="text"
          id="urlInput"
          placeholder="New wiki name"
          aria-label="New wiki name"
        >
        <span class="file-extension">.html</span>
        </div>
        <button onclick="navigateToURL()">Create</button>
      </div>

      ${fileListHtml || '<p class="empty-state">No files in this directory</p>'}

      ${footerHtml || ""}

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

        function disconnectDirectory() {
          fetch(window.location.href, {
            method: 'DELETE'
          })
          .then(response => {
            window.location.reload();
          })
          .catch(error => {
            console.error('Error disconnecting directory:', error);
          });
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
    // Ensure consistent order of the files by sorting by name
    files.sort((a, b) => a.name.localeCompare(b.name));

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

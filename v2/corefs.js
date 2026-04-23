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
  return renderHtmlPage({
    title: 'Create new TiddlyWiki file',
    stylesheets: ['styles/wiki-creator.css'],
    head: pageDataScript({ fileName }),
    body: `
      <div class="container">
        <h1>Create TiddlyWiki</h1>
        <p>The file <strong>'${escapeHtml(fileName)}'</strong> doesn't exist yet.</p>

        <div class="section">
          <h2>Create from template</h2>
          <p>Start with an official TiddlyWiki template:</p>
          <ul class="button-list">
            <li><button type="button" data-url="https://tiddlywiki.com/empty.html" data-description="Empty TiddlyWiki" aria-label="Create from empty TiddlyWiki template">Latest release</button></li>
            <li><button type="button" data-url="https://tiddlywiki.com/prerelease/empty.html" data-description="Prerelease TiddlyWiki" aria-label="Create from TiddlyWiki prerelease template">Prerelease Version</button></li>
          </ul>
        </div>

        <div class="section">
          <h2>Upload existing TiddlyWiki</h2>
          <p>Upload a TiddlyWiki file from your computer:</p>
          <div class="file-input-wrapper">
            <input type="file" id="fileInput" accept=".html,.htm" aria-label="Upload TiddlyWiki file">
            <p><small>Select an HTML file containing a TiddlyWiki</small></p>
          </div>
        </div>

        <div id="status-message"></div>
      </div>
    `,
    scripts: ['scripts/wiki-creator.js']
  });
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
              <a href="${escapeAttribute(fullPath)}" class="file-link">${escapeHtml(f.name)}</a>
              ${f.size !== undefined ? `<span class="file-size">(${formatFileSize(f.size)})</span>` : ''}
            </div>
            <div class="file-actions">
              <button type="button" class="download-btn" data-url="${escapeAttribute(fullPath)}" data-file-name="${escapeAttribute(f.name)}" aria-label="Download ${escapeAttribute(f.name)}">Download</button>
              <button type="button" class="delete-btn" data-url="${escapeAttribute(fullPath)}" data-file-name="${escapeAttribute(f.name)}" aria-label="Delete ${escapeAttribute(f.name)}">Delete</button>
            </div>
          </li>`;
        }).join("")}
      </ul>
    </div>
  `;

  return renderHtmlPage({
    title: 'File Directory',
    stylesheets: ['styles/directory-list.css'],
    body: `
      <h1>File Directory</h1>

      ${storageWarningHtml ? `<div class="warning-message">${storageWarningHtml}</div>` : ""}

      <div class="create-form">
        <div class="input-wrapper">
          <input type="text" id="urlInput" placeholder="New wiki name" aria-label="New wiki name">
          <span class="file-extension">.html</span>
        </div>
        <button id="createButton" type="button">Create</button>
      </div>

      ${fileListHtml || '<p class="empty-state">No files in this directory</p>'}

      ${footerHtml || ""}
    `,
    scripts: ['scripts/directory-list.js']
  });
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

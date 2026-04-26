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

function encodePathComponent(component) {
  return encodeURIComponent(component).replace(/'/g, '%27');
}

function buildChildUrl(baseUrl, name, isDirectory = false) {
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = '';
  if (!url.pathname.endsWith('/')) {
    url.pathname += '/';
  }
  url.pathname += encodePathComponent(name);
  if (isDirectory) {
    url.pathname += '/';
  }
  return url.href;
}

function buildParentUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = '';
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length > 0) {
    segments.pop();
  }
  url.pathname = `/${segments.join('/')}${segments.length ? '/' : ''}`;
  return url.href;
}

function buildRootUrl(baseUrl, depth) {
  let rootUrl = baseUrl;
  for (let index = 0; index < depth; index += 1) {
    rootUrl = buildParentUrl(rootUrl);
  }
  return rootUrl;
}

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

async function getDirectoryHandleForPath(baseDirHandle, pathSegments, create = false) {
  let directoryHandle = baseDirHandle;
  for (const segment of pathSegments) {
    directoryHandle = await directoryHandle.getDirectoryHandle(segment, { create });
  }
  return directoryHandle;
}

async function getFileHandleForPath(baseDirHandle, pathSegments, create = false) {
  const parentDirectoryHandle = await getDirectoryHandleForPath(baseDirHandle, pathSegments.slice(0, -1), create);
  return parentDirectoryHandle.getFileHandle(pathSegments.at(-1), { create });
}

async function getPathKind(baseDirHandle, pathSegments) {
  if (pathSegments.length === 0) {
    return 'directory';
  }

  try {
    await getFileHandleForPath(baseDirHandle, pathSegments, false);
    return 'file';
  } catch (error) {
    if (error.name !== 'NotFoundError') {
      throw error;
    }
  }

  try {
    await getDirectoryHandleForPath(baseDirHandle, pathSegments, false);
    return 'directory';
  } catch (error) {
    if (error.name === 'NotFoundError') {
      return null;
    }
    throw error;
  }
}

const handleGetFile = async (dirHandle, pathSegments, headersOnly = false) => {
  const fileName = pathSegments.join('/');
  try {
    const fileHandle = await getFileHandleForPath(dirHandle, pathSegments);
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
    // Handle other errors
    console.error('Error accessing file:', error);
    return createResponse(`Error accessing file '${fileName}: ${error}'.`, {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};
const handlePutFile = async (dirHandle, pathSegments, request) => {
  const fileName = pathSegments.join('/');
  try {
    const fileHandle = await getFileHandleForPath(dirHandle, pathSegments, true);
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
const handlePutDirectory = async (dirHandle, pathSegments) => {
  const directoryName = pathSegments.join('/');

  if (pathSegments.length === 0) {
    return createResponse('Cannot create the root directory.', {
      status: 400,
      statusText: 'Bad Request',
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  try {
    const pathKind = await getPathKind(dirHandle, pathSegments);
    if (pathKind === 'file') {
      return createResponse(`Cannot create directory '${directoryName}'. A file already exists at that path.`, {
        status: 409,
        statusText: 'Conflict',
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    if (pathKind === 'directory') {
      return createResponse(null, { status: 204, statusText: 'No Content' });
    }

    await getDirectoryHandleForPath(dirHandle, pathSegments, true);
    return createResponse(null, { status: 201, statusText: 'Created' });
  } catch (error) {
    console.error('Error creating directory:', error);
    return createResponse(`Error creating directory '${directoryName}: ${error}'.`, {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};
const handleDeleteFile = async (dirHandle, pathSegments) => {
  const fileName = pathSegments.join('/');
  try {
    const parentDirectoryHandle = await getDirectoryHandleForPath(dirHandle, pathSegments.slice(0, -1), false);
    await parentDirectoryHandle.removeEntry(pathSegments.at(-1));
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

function getBreadcrumbHtml(baseUrl, pathSegments, {
  rootUrl = buildRootUrl(baseUrl, pathSegments.length),
  homeUrl = buildParentUrl(rootUrl),
  rootLabel = 'root',
  breadcrumbItems = null
} = {}) {
  const items = [];
  const hasChildItems = breadcrumbItems ? breadcrumbItems.length > 0 : pathSegments.length > 0;

  if (homeUrl) {
    items.push(`<a href="${escapeAttribute(homeUrl)}" class="breadcrumb-home" aria-label="Home" title="Home">&#8962;</a>`);
  }

  if (hasChildItems) {
    items.push(`<a href="${escapeAttribute(rootUrl)}">${escapeHtml(rootLabel)}</a>`);
  } else {
    items.push(`<span>${escapeHtml(rootLabel)}</span>`);
  }

  if (breadcrumbItems) {
    breadcrumbItems.forEach((item, index) => {
      if (item.href && index < breadcrumbItems.length - 1) {
        items.push(`<a href="${escapeAttribute(item.href)}">${escapeHtml(item.label)}</a>`);
      } else {
        items.push(`<span>${escapeHtml(item.label)}</span>`);
      }
    });
    return `<nav class="breadcrumbs" aria-label="Breadcrumbs">${items.join('<span class="breadcrumb-separator">/</span>')}</nav>`;
  }

  let currentHref = rootUrl;
  pathSegments.forEach((segment, index) => {
    currentHref = buildChildUrl(currentHref, segment, true);
    if (index === pathSegments.length - 1) {
      items.push(`<span>${escapeHtml(segment)}</span>`);
    } else {
      items.push(`<a href="${escapeAttribute(currentHref)}">${escapeHtml(segment)}</a>`);
    }
  });

  return `<nav class="breadcrumbs" aria-label="Breadcrumbs">${items.join('<span class="breadcrumb-separator">/</span>')}</nav>`;
}

function getDirectoryListHtml(baseUrl, entries, {
  storageWarningHtml,
  footerHtml,
  sectionHtml,
  pageData,
  extraScripts = [],
  currentPathSegments = [],
  showCreateForm = true,
  breadcrumbOptions = null
} = {}) {
  // Create file list HTML only if files exist
  const fileListHtml = entries.length === 0 ? "" : `
    <div class="file-list">
      <h2>Files in this directory</h2>
      <ul class="file-items">
        ${entries.map((entry) => {
          const isDirectory = entry.kind === 'directory';
          const fullPath = buildChildUrl(baseUrl, entry.name, isDirectory);
          return `
          <li class="file-item">
            <div class="file-info">
              <a href="${escapeAttribute(fullPath)}" class="file-link">${escapeHtml(entry.name)}${isDirectory ? '/' : ''}</a>
              ${entry.size !== undefined ? `<span class="file-size">(${formatFileSize(entry.size)})</span>` : ''}
            </div>
            <div class="file-actions">
              ${isDirectory ? '' : `
              <button type="button" class="download-btn" data-url="${escapeAttribute(fullPath)}" data-file-name="${escapeAttribute(entry.name)}" aria-label="Download ${escapeAttribute(entry.name)}">Download</button>
              <button type="button" class="delete-btn" data-url="${escapeAttribute(fullPath)}" data-file-name="${escapeAttribute(entry.name)}" aria-label="Delete ${escapeAttribute(entry.name)}">Delete</button>
              `}
            </div>
          </li>`;
        }).join("")}
      </ul>
    </div>
  `;

  return renderHtmlPage({
    title: 'File Directory',
    stylesheets: ['styles/directory-list.css'],
    head: `${pageData ? pageDataScript(pageData) : ''}`,
    body: `
      <h1>File Directory</h1>
      ${getBreadcrumbHtml(baseUrl, currentPathSegments, breadcrumbOptions || {})}

      ${storageWarningHtml ? `<div class="warning-message">${storageWarningHtml}</div>` : ""}
      ${sectionHtml || ''}

      ${showCreateForm ? `
      <div class="create-actions">
        <section class="create-panel">
          <h2>Create Wiki</h2>
          <div class="create-form">
            <div class="input-wrapper">
              <input type="text" id="urlInput" placeholder="New wiki path or name" aria-label="New wiki path or name">
              <span class="file-extension">.html</span>
            </div>
            <button id="createButton" type="button">Create</button>
          </div>
        </section>

        <section class="create-panel">
          <h2>Create Directory</h2>
          <div class="create-form">
            <div class="input-wrapper">
              <input type="text" id="directoryInput" placeholder="New directory path or name" aria-label="New directory path or name">
            </div>
            <button id="createDirectoryButton" type="button">Create</button>
          </div>
        </section>
      </div>
      ` : ''}

      ${fileListHtml || '<p class="empty-state">No files in this directory</p>'}

      ${footerHtml || ""}
    `,
    scripts: [...extraScripts, 'scripts/directory-list.js']
  });
}
const handleListDirectory = async (dirHandle, request, {
  storageWarningHtml,
  footerHtml,
  sectionHtml,
  pageData,
  extraScripts,
  currentPathSegments = [],
  showCreateForm = true,
  breadcrumbOptions = null
} = {}) => {
  try {
    const entries = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        entries.push({ kind: entry.kind, name: entry.name, size: file.size });
      } else {
        entries.push({ kind: entry.kind, name: entry.name });
      }
    }
    entries.sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    const acceptHeader = request.headers.get("Accept");
    if (acceptHeader?.includes("application/json")) {
      const json = JSON.stringify(entries.map((entry) => ({ kind: entry.kind, name: entry.name })));
      return createResponse(json, { headers: { "Content-Type": "application/json" } });
    } else {
      const html = getDirectoryListHtml(request.url, entries, {
        storageWarningHtml,
        footerHtml,
        sectionHtml,
        pageData,
        extraScripts,
        currentPathSegments,
        showCreateForm,
        breadcrumbOptions
      });
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

async function fileExists(directoryHandle, pathSegments) {
    if (!pathSegments || pathSegments.length === 0) {
        return false;
    }
    try {
        // Attempt to get the file handle
        await getFileHandleForPath(directoryHandle, pathSegments, false);
        return true; // File exists
    } catch (error) {
        if (error.name === 'NotFoundError') {
            return false; // File does not exist
        }
        throw error; // Rethrow unexpected errors
    }
}

async function handleFileRequest(request, baseDirHandle, pathSegments = [], { isDirectoryRequest = false, directoryOptions = {} } = {}) {
  const { method } = request;

  switch (method) {
    case 'GET':
    case 'HEAD': {
      if (isDirectoryRequest || pathSegments.length === 0) {
        try {
          const directoryHandle = await getDirectoryHandleForPath(baseDirHandle, pathSegments, false);
          return handleListDirectory(directoryHandle, request, {
            ...directoryOptions,
            currentPathSegments: pathSegments
          });
        } catch (error) {
          if (error.name === 'NotFoundError') {
            return createResponse(`Directory '${pathSegments.join('/')}' not found.`, {
              status: 404,
              statusText: 'Directory not found',
              headers: { 'Content-Type': 'text/plain' }
            });
          }
          throw error;
        }
      }

      const pathKind = await getPathKind(baseDirHandle, pathSegments);
      if (pathKind === 'directory') {
        const redirectUrl = new URL(request.url);
        redirectUrl.search = '';
        redirectUrl.hash = '';
        redirectUrl.pathname += '/';
        return createResponse(null, {
          status: 301,
          statusText: 'Moved Permanently',
          headers: { 'Location': redirectUrl.href }
        });
      }
      if (pathKind === 'file') {
        return handleGetFile(baseDirHandle, pathSegments, method === 'HEAD');
      }
      return createResponse(getWikiCreatorHtml(pathSegments.join('/')), {
        status: 404,
        statusText: "File not found",
        headers: { "Content-Type": "text/html" }
      });
    }
    case 'PUT':
      if (isDirectoryRequest) {
        return handlePutDirectory(baseDirHandle, pathSegments);
      }
      return handlePutFile(baseDirHandle, pathSegments, request);
    case 'DELETE':
      return handleDeleteFile(baseDirHandle, pathSegments);
    case 'OPTIONS':
      return handleOptions();
    default:
      return createResponse(`Method ${method} not allowed`, {
        status: 405,
        statusText: 'Method Not Allowed',
        headers: { 'Allow': SUPPORTED_METHODS.join(', ') }
      });
  }
}

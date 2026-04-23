// Shared template function for consistent styling and structure
function getNativeFSTemplateHtml(title, buttonText, actionFunction, idbKey) {
  return renderHtmlPage({
    title,
    stylesheets: ['styles/nativefs.css'],
    head: pageDataScript({ idbKey, actionFunction }),
    body: `
      <div class="container">
        <div class="message">${escapeHtml(title)}</div>
        <button id="nativeFsActionButton" type="button">${escapeHtml(buttonText)}</button>
      </div>
    `,
    scripts: ['idbKeyval.js', 'scripts/nativefs-page.js']
  });
}

function getNativeFSDirectoryPickerHtml(idbKey) {
  return getNativeFSTemplateHtml(
    'No external wiki directory found',
    'Pick external directory',
    'pickDirectory',
    idbKey
  );
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
  return getNativeFSTemplateHtml(
    'Directory access unauthorized',
    'Request directory permission',
    'requestDirectoryPermission',
    idbKey
  );
}
function handleNativeFSPermissionNotGranted(idbKey) {
  const html = getNativeFSPermissionRequestHtml(idbKey);
  return createResponse(html, {
    status: 403,
    statusText: 'Directory Access Unauthorized',
    headers: { "Content-Type": "text/html"}
  });
}
const handleNativeFsRequest = async (request, route, dirName, fileName) => {
  const idbKey = dirName;
  const baseDirHandle = await self.idbKeyval.get(idbKey);
  if (!baseDirHandle) {
    return handleNativeFSDirectorySelection(idbKey);
  } else if (await baseDirHandle.queryPermission({mode: 'readwrite'}) !== 'granted') {
    return handleNativeFSPermissionNotGranted(idbKey);
  }

  // Only one directory is currently supported, and this provides a way to select a different directory
  if (!fileName && request.method === 'DELETE') {
    await self.idbKeyval.del(idbKey);
    return handleNativeFSDirectorySelection(idbKey);
  }

  if (!fileName) {
    return handleListDirectory(baseDirHandle, request, {
      footerHtml: '<button type="button" class="disconnect-button" id="disconnectDirectoryButton">Disconnect Directory</button>'
    });
  }

  // Translate the http method in the request to a filesystem action for the given filename
  return handleFileRequest(request, baseDirHandle, fileName);
}

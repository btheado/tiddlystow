// Shared template function for consistent styling and structure
function getNativeFSTemplateHtml(title, buttonText, actionFunction, idbKey) {
  return `
    <html>
    <head>
      <title>${title}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 40vh;
          margin: 0;
          background-color: #f5f5f5;
          color: #333;
        }
        .container {
          background-color: white;
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
          text-align: center;
        }
        button {
          background-color: #4a86e8;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 4px;
          font-size: 1rem;
          cursor: pointer;
          margin-top: 1rem;
          transition: background-color 0.2s;
        }
        button:hover {
          background-color: #3a76d8;
        }
        .message {
          margin-bottom: 1rem;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="message">${title}</div>
        <button onclick="${actionFunction}()">${buttonText}</button>
      </div>
      <script src="../idbKeyval.js"></script>
      <script>
        async function ${actionFunction}() {
          const idbKey = '${idbKey}';
          ${actionFunction === 'pickDirectory' ?
            `const dirHandle = await window.showDirectoryPicker({mode: 'readwrite'});
            await idbKeyval.set(idbKey, dirHandle);
            console.log(dirHandle);` :
            `const dirHandle = await idbKeyval.get(idbKey);
            console.log(dirHandle);
            await dirHandle.requestPermission({mode: 'readwrite'});`
          }
          window.location.reload();
        }
      </script>
    </body>
    </html>
  `;
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
      footerHtml: '<button class="disconnect-button" onclick="disconnectDirectory()">Disconnect Directory</button>'
    });
  }

  // Translate the http method in the request to a filesystem action for the given filename
  return handleFileRequest(request, baseDirHandle, fileName);
}

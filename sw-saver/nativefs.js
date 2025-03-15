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

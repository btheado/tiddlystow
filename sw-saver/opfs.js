function getOpfsEvictionProtectionHtml(idbKey, nextUrl) {
  let nextPage = "window.location.reload();";
  if (nextUrl) {
    nextPage = `window.location.href = "${nextUrl}"`
  }
  return html = `
    <html>
    <head>
      <title>Request Protection from Storage Eviction</title>
    </head>
    <body onload="document.cookie = 'storageNoticeShown=true; path=/; samesite=strict'">
      <h1>Prevent Files from Being Automatically Deleted</h1>
      <p>
        By default, web browsers may automatically delete stored files to free up space.
        To help protect your files from unexpected removal, you can request persistent storage by clicking the button below.
      </p>
      <p>
        <strong>Note:</strong>
        - <strong>Firefox:</strong> You'll see a prompt asking for permission to persist storage.
        - <strong>Chrome:</strong> This will likely be granted automatically if the page is bookmarked or added to the home screen. Otherwise, the request will be denied automatically.
      </p>
      <p>
        <strong>Important:</strong> This does not prevent you from manually clearing storage.
        Be sure to back up important files regularly.
      </p>
      <button onclick="requestEvictionProtection()">Request protection from storage eviction</button>
      <script src="../idbKeyval.js"></script>
      <script>
        async function requestEvictionProtection() {
          const idbKey = '${idbKey}';
          await idbKeyval.set(idbKey, true);
          const persisted = await navigator.storage.persist()
          console.log(persisted);
          ${nextPage}
        }
      </script>
    </body>
    </html>
  `;
}
function handleOpfsEvictionProtectionNotGranted(idbKey, nextUrl) {
  const html = getOpfsEvictionProtectionHtml(idbKey, nextUrl);
  return createResponse(html, {
    status: 403,
    statusText: 'Eviction protection not enabled',
    headers: { "Content-Type": "text/html"}
  });
}
const getOpfsBaseDirHandle = async (baseDirName) => {
  const opfsRoot = await navigator.storage.getDirectory();
  return opfsRoot.getDirectoryHandle(baseDirName, { create: true });
};
const handleOpfsRequest = async (request, route, dirName, fileName) => {
  const baseDirHandle = await getOpfsBaseDirHandle(dirName);
  const idbKey = `${dirName}?storage_notice_shown`;
  if (!await navigator.storage.persisted() && request.method === 'GET' && await fileExists(baseDirHandle, fileName) && !await self.idbKeyval.get(idbKey)) {
    // Intercept the page the first time an existing file is requested so the user can reqeust eviction protection
    return handleOpfsEvictionProtectionNotGranted(idbKey);
  }
  // The eviction protection page can be explicitly requested using a parameter on the dir listing url (i.e. 'i/?request_eviction_protection')
  const request_url = new URL(request.url);
  if (!fileName && request_url.searchParams.has('request_eviction_protection')) {
    request_url.searchParams.delete('request_eviction_protection');
    return handleOpfsEvictionProtectionNotGranted(idbKey, request_url.href);
  }
  if (!fileName && !await navigator.storage.persisted() && await self.idbKeyval.get(idbKey)) {
    // Augment the directory listing page with a message about requesting eviction protection
    return handleListDirectory(baseDirHandle, request, "<p>Storage not protected from eviction. <a href='?request_eviction_protection'>Request eviction protection</a></p>");
  }

  // Translate the http method in the request to a filesystem action for the given filename
  return handleFileRequest(request, baseDirHandle, fileName);
}

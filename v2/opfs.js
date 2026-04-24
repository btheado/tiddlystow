function getOpfsEvictionProtectionHtml(idbKey, nextUrl) {
  return renderHtmlPage({
    title: 'Request Protection from Storage Eviction',
    stylesheets: ['styles/opfs.css'],
    head: pageDataScript({ idbKey, nextUrl: nextUrl || null }),
    body: `
      <div class="container">
        <h1>Prevent Files from Being Automatically Deleted</h1>

        <p>
          By default, web browsers may automatically delete stored files to free up space when storage is low.
          To help protect your files from unexpected removal, you can request persistent storage by clicking the button below.
        </p>

        <div class="browser-info">
          <strong>Browser-specific information:</strong>
          <ul>
            <li><strong>Firefox:</strong> You'll see a prompt asking for permission to persist storage.</li>
            <li><strong>Chrome:</strong> This will likely be granted automatically if you've installed this as a PWA or added it to your home screen. Otherwise, the request may be denied.</li>
            <li><strong>Safari:</strong> Storage persistence works differently and has various limitations.</li>
          </ul>
        </div>

        <div class="warning">
          <strong>Important:</strong> This does not prevent you from manually clearing storage.
          Be sure to back up important files regularly as browser storage should not be considered permanent.
        </div>

        <button id="protectionButton" type="button">Request protection from storage eviction</button>

        <div id="statusMessage" class="status"></div>
      </div>
    `,
    scripts: ['idbKeyval.js', 'scripts/opfs-eviction.js']
  });
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
  const pathSegments = fileName.pathSegments;
  const baseDirHandle = await getOpfsBaseDirHandle(dirName);
  const idbKey = `${dirName}?storage_notice_shown`;
  if (!await navigator.storage.persisted() && request.method === 'GET' && await fileExists(baseDirHandle, pathSegments) && !await self.idbKeyval.get(idbKey)) {
    // Intercept the page the first time an existing file is requested so the user can reqeust eviction protection
    return handleOpfsEvictionProtectionNotGranted(idbKey);
  }
  // The eviction protection page can be explicitly requested using a parameter on the dir listing url (i.e. 'i/?request_eviction_protection')
  const request_url = new URL(request.url);
  if (pathSegments.length === 0 && request_url.searchParams.has('request_eviction_protection')) {
    request_url.searchParams.delete('request_eviction_protection');
    return handleOpfsEvictionProtectionNotGranted(idbKey, request_url.href);
  }
  if (pathSegments.length === 0 && !await navigator.storage.persisted() && await self.idbKeyval.get(idbKey)) {
    // Augment the directory listing page with a message about requesting eviction protection
    return handleFileRequest(request, baseDirHandle, pathSegments, {
      isDirectoryRequest: fileName.isDirectoryRequest,
      directoryOptions: {
      storageWarningHtml: "<p>Storage not protected from eviction. <a href='?request_eviction_protection'>Request eviction protection</a></p>"
      }
    });
  }

  // Translate the http method in the request to a filesystem action for the given filename
  return handleFileRequest(request, baseDirHandle, pathSegments, {
    isDirectoryRequest: fileName.isDirectoryRequest
  });
}

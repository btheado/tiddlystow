function getOpfsEvictionProtectionHtml(idbKey, nextUrl) {
  const nextPage = nextUrl ? `window.location.href = "${nextUrl}"` : "window.location.reload();";

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Request Protection from Storage Eviction</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', sans-serif;
          line-height: 1.6;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          color: #333;
        }
        .container {
          background-color: #f9f9f9;
          border-radius: 8px;
          padding: 25px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
          color: #2a5885;
          margin-top: 0;
        }
        .browser-info {
          background-color: #f0f7ff;
          border-left: 4px solid #2a5885;
          padding: 12px 15px;
          margin: 20px 0;
        }
        .warning {
          background-color: #fff8f0;
          border-left: 4px solid #e67e22;
          padding: 12px 15px;
          margin: 20px 0;
        }
        button {
          background-color: #2a5885;
          color: white;
          border: none;
          padding: 12px 20px;
          border-radius: 4px;
          font-size: 16px;
          cursor: pointer;
          transition: background-color 0.2s;
          display: block;
          margin: 20px 0;
        }
        button:hover {
          background-color: #1e3c64;
        }
        .status {
          margin-top: 15px;
          padding: 10px;
          border-radius: 4px;
          display: none;
        }
        .success {
          background-color: #e7f4e8;
          color: #2e7d32;
        }
        .error {
          background-color: #fdeded;
          color: #c62828;
        }
        @media (max-width: 600px) {
          .container {
            padding: 15px;
          }
        }
      </style>
    </head>
    <body>
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

        <button id="protectionButton" onclick="requestEvictionProtection()">Request protection from storage eviction</button>

        <div id="statusMessage" class="status"></div>
      </div>

      <script src="../idbKeyval.js"></script>
      <script>
        async function requestEvictionProtection() {
          const button = document.getElementById('protectionButton');
          const statusMessage = document.getElementById('statusMessage');

          // Disable button while processing
          button.disabled = true;
          button.textContent = 'Processing...';

          try {
            // Check if storage persistence is supported
            if (!navigator.storage || !navigator.storage.persist) {
              throw new Error('Storage persistence is not supported in your browser');
            }

            // Store the key in IndexedDB
            const idbKey = '${idbKey}';
            await idbKeyval.set(idbKey, true);

            // Request persistence
            const persisted = await navigator.storage.persist();

            // Show appropriate message
            statusMessage.style.display = 'block';
            if (persisted) {
              statusMessage.className = 'status success';
              statusMessage.textContent = 'Success! Your browser has granted permission to protect your files from automatic deletion.';

              // Redirect after a short delay
              setTimeout(() => {
                ${nextPage}
              }, 1500);
            } else {
              statusMessage.className = 'status error';
              statusMessage.textContent = 'Your browser denied the request for persistent storage. Your files may still be removed if your device is low on storage. Please ensure you back up important files.';

              // Re-enable button
              button.disabled = false;
              button.textContent = 'Continue without eviction protection';
              button.onclick = () => {
                ${nextPage}
              };
            }
          } catch (error) {
            console.error('Error requesting storage persistence:', error);

            // Show error message
            statusMessage.style.display = 'block';
            statusMessage.className = 'status error';
            statusMessage.textContent = 'An error occurred: ' + error.message;

            // Change button to continue option
            button.disabled = false;
            button.textContent = 'Continue without eviction protection';
            button.onclick = () => {
              ${nextPage}
            };
          }
        }

        // Detect browser for more specific guidance
        function detectBrowser() {
          const ua = navigator.userAgent;
          let browserInfo = document.querySelector('.browser-info');

          if (ua.includes('Firefox')) {
            let ffSpecific = document.createElement('p');
            ffSpecific.innerHTML = '<strong>Firefox detected:</strong> You will need to explicitly approve the permission request.';
            browserInfo.appendChild(ffSpecific);
          } else if (ua.includes('Chrome')) {
            let chromeSpecific = document.createElement('p');
            chromeSpecific.innerHTML = '<strong>Chrome detected:</strong> For best results, consider installing this as a PWA or adding it to your home screen.';
            browserInfo.appendChild(chromeSpecific);
          } else if (ua.includes('Safari')) {
            let safariSpecific = document.createElement('p');
            safariSpecific.innerHTML = '<strong>Safari detected:</strong> Storage in Safari has more limitations than other browsers. Regular backups are strongly recommended.';
            browserInfo.appendChild(safariSpecific);
          }
        }

        // Check current persistence status on page load
        async function checkPersistenceStatus() {
          if (navigator.storage && navigator.storage.persisted) {
            const isPersisted = await navigator.storage.persisted();
            if (isPersisted) {
              const button = document.getElementById('protectionButton');
              button.disabled = true;
              button.textContent = 'Storage protection already enabled';

              const statusMessage = document.getElementById('statusMessage');
              statusMessage.style.display = 'block';
              statusMessage.className = 'status success';
              statusMessage.textContent = 'Your storage is already protected from automatic deletion.';

              setTimeout(() => {
                ${nextPage}
              }, 1500);
            }
          }
        }

        // Initialize page
        window.addEventListener('DOMContentLoaded', () => {
          detectBrowser();
          checkPersistenceStatus();
        });
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

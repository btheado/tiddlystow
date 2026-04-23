function getNextPageAction() {
  const { nextUrl } = window.TIDDLYSTOW_PAGE_DATA;
  return () => {
    if (nextUrl) {
      window.location.href = nextUrl;
    } else {
      window.location.reload();
    }
  };
}

function detectBrowser() {
  const ua = navigator.userAgent;
  const browserInfo = document.querySelector('.browser-info');

  if (ua.includes('Firefox')) {
    const paragraph = document.createElement('p');
    paragraph.innerHTML = '<strong>Firefox detected:</strong> You will need to explicitly approve the permission request.';
    browserInfo.appendChild(paragraph);
  } else if (ua.includes('Chrome')) {
    const paragraph = document.createElement('p');
    paragraph.innerHTML = '<strong>Chrome detected:</strong> For best results, consider installing this as a PWA or adding it to your home screen.';
    browserInfo.appendChild(paragraph);
  } else if (ua.includes('Safari')) {
    const paragraph = document.createElement('p');
    paragraph.innerHTML = '<strong>Safari detected:</strong> Storage in Safari has more limitations than other browsers. Regular backups are strongly recommended.';
    browserInfo.appendChild(paragraph);
  }
}

async function checkPersistenceStatus() {
  if (!navigator.storage || !navigator.storage.persisted) {
    return;
  }

  const isPersisted = await navigator.storage.persisted();
  if (!isPersisted) {
    return;
  }

  const button = document.getElementById('protectionButton');
  button.disabled = true;
  button.textContent = 'Storage protection already enabled';

  const statusMessage = document.getElementById('statusMessage');
  statusMessage.style.display = 'block';
  statusMessage.className = 'status success';
  statusMessage.textContent = 'Your storage is already protected from automatic deletion.';

  setTimeout(getNextPageAction(), 1500);
}

async function requestEvictionProtection() {
  const button = document.getElementById('protectionButton');
  const statusMessage = document.getElementById('statusMessage');
  const { idbKey } = window.TIDDLYSTOW_PAGE_DATA;
  const continueAction = getNextPageAction();

  button.disabled = true;
  button.textContent = 'Processing...';

  try {
    if (!navigator.storage || !navigator.storage.persist) {
      throw new Error('Storage persistence is not supported in your browser');
    }

    await idbKeyval.set(idbKey, true);
    const persisted = await navigator.storage.persist();

    statusMessage.style.display = 'block';
    if (persisted) {
      statusMessage.className = 'status success';
      statusMessage.textContent = 'Success! Your browser has granted permission to protect your files from automatic deletion.';
      setTimeout(continueAction, 1500);
      return;
    }

    statusMessage.className = 'status error';
    statusMessage.textContent = 'Your browser denied the request for persistent storage. Your files may still be removed if your device is low on storage. Please ensure you back up important files.';
  } catch (error) {
    console.error('Error requesting storage persistence:', error);
    statusMessage.style.display = 'block';
    statusMessage.className = 'status error';
    statusMessage.textContent = 'An error occurred: ' + error.message;
  }

  button.disabled = false;
  button.textContent = 'Continue without eviction protection';
  button.onclick = continueAction;
}

window.addEventListener('DOMContentLoaded', () => {
  detectBrowser();
  checkPersistenceStatus().catch((error) => {
    console.error('Error checking persistence status:', error);
  });
  document.getElementById('protectionButton').onclick = () => {
    requestEvictionProtection().catch((error) => {
      console.error('Error requesting eviction protection:', error);
    });
  };
});

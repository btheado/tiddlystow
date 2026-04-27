const NATIVEFS_MOUNTS_KEY_SUFFIX = '?mounts';
const NATIVEFS_MOUNT_KEY_PREFIX = '?mount:';

function encodePathForUrl(path) {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function normalizeWikiPath(input) {
  const trimmed = input.trim().replace(/^\/+|\/+$/g, '');
  if (!trimmed) {
    return '';
  }
  return /\.(html?|xhtml)$/i.test(trimmed) ? trimmed : `${trimmed}.html`;
}

function normalizeDirectoryPath(input) {
  return input.trim().replace(/^\/+|\/+$/g, '');
}

function getNativeFSMountsKey(rootKey) {
  return `${rootKey}${NATIVEFS_MOUNTS_KEY_SUFFIX}`;
}

function getNativeFSMountHandleKey(rootKey, mountSlug) {
  return `${rootKey}${NATIVEFS_MOUNT_KEY_PREFIX}${mountSlug}`;
}

function slugifyMountName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getUniqueMountSlug(baseSlug, mounts) {
  const existingSlugs = new Set(mounts.map((mount) => mount.slug));
  if (!existingSlugs.has(baseSlug)) {
    return baseSlug;
  }

  let suffix = 2;
  while (existingSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseSlug}-${suffix}`;
}

function navigateToURL() {
  const urlInput = document.getElementById('urlInput');
  const userInput = urlInput?.value.trim() || '';
  if (userInput !== '') {
    const wikiPath = normalizeWikiPath(userInput);
    window.location.href = encodePathForUrl(wikiPath);
  } else {
    alert('Please enter a file name');
  }
}

function buildDirectoryUrl(directoryPath) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  if (!url.pathname.endsWith('/')) {
    url.pathname += '/';
  }
  url.pathname += `${encodePathForUrl(directoryPath)}/`;
  return url.href;
}

async function createDirectory() {
  const directoryInput = document.getElementById('directoryInput');
  const userInput = directoryInput?.value || '';
  const directoryPath = normalizeDirectoryPath(userInput);

  if (!directoryPath) {
    alert('Please enter a directory name');
    return;
  }

  const directoryUrl = buildDirectoryUrl(directoryPath);

  try {
    const response = await fetch(directoryUrl, { method: 'PUT' });
    if (response.ok) {
      window.location.href = directoryUrl;
      return;
    }

    const errorMessage = await response.text();
    alert(errorMessage || `Failed to create directory: ${directoryPath}`);
  } catch (error) {
    alert('Error creating directory: ' + error.message);
    console.error('Create directory error:', error);
  }
}

async function deleteFile(url, fileName) {
  if (!confirm('Are you sure you want to delete ' + fileName + '?')) {
    return;
  }

  try {
    const response = await fetch(url, { method: 'DELETE' });
    if (response.ok) {
      window.location.reload();
      return;
    }

    alert('Failed to delete: ' + fileName);
    console.error('Delete failed with status:', response.status);
  } catch (error) {
    alert('Error deleting file: ' + error.message);
    console.error('Delete error:', error);
  }
}

async function downloadFile(url, filename) {
  const response = await fetch(url);
  const blob = await response.blob();

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function disconnectDirectory(button) {
  const disconnectButton = button || document.getElementById('disconnectDirectoryButton');
  const targetUrl = disconnectButton?.dataset.url || window.location.href;
  try {
    await fetch(targetUrl, { method: 'DELETE' });
    if (disconnectButton?.dataset.redirectUrl) {
      window.location.href = disconnectButton.dataset.redirectUrl;
      return;
    }
    window.location.reload();
  } catch (error) {
    console.error('Error disconnecting directory:', error);
  }
}

async function attachDirectory() {
  const { nativeFsRootKey } = window.TIDDLYSTOW_PAGE_DATA || {};
  if (!nativeFsRootKey) {
    return;
  }

  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const mountsKey = getNativeFSMountsKey(nativeFsRootKey);
    const mounts = await idbKeyval.get(mountsKey) || [];
    const baseSlug = slugifyMountName(dirHandle.name) || 'directory';
    const mountSlug = getUniqueMountSlug(baseSlug, mounts);

    mounts.push({ slug: mountSlug, name: dirHandle.name });
    mounts.sort((left, right) => left.name.localeCompare(right.name));

    await idbKeyval.set(getNativeFSMountHandleKey(nativeFsRootKey, mountSlug), dirHandle);
    await idbKeyval.set(mountsKey, mounts);
    window.location.reload();
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('Error attaching directory:', error);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('urlInput');
  if (urlInput) {
    urlInput.focus();
    urlInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter') {
        navigateToURL();
      }
    });
  }

  const createButton = document.getElementById('createButton');
  if (createButton) {
    createButton.addEventListener('click', navigateToURL);
  }

  const directoryInput = document.getElementById('directoryInput');
  if (directoryInput) {
    directoryInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter') {
        createDirectory();
      }
    });
  }

  const createDirectoryButton = document.getElementById('createDirectoryButton');
  if (createDirectoryButton) {
    createDirectoryButton.addEventListener('click', createDirectory);
  }

  document.querySelectorAll('.delete-btn[data-url]').forEach((button) => {
    button.addEventListener('click', () => deleteFile(button.dataset.url, button.dataset.fileName));
  });

  document.querySelectorAll('.download-btn[data-url]').forEach((button) => {
    button.addEventListener('click', () => downloadFile(button.dataset.url, button.dataset.fileName));
  });

  document.querySelectorAll('.disconnect-button').forEach((button) => {
    button.addEventListener('click', () => disconnectDirectory(button));
  });

  const attachDirectoryButton = document.getElementById('attachDirectoryButton');
  if (attachDirectoryButton) {
    attachDirectoryButton.addEventListener('click', attachDirectory);
  }
});

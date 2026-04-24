// Shared template function for consistent styling and structure
const NATIVEFS_MOUNTS_KEY_SUFFIX = '?mounts';
const NATIVEFS_MOUNT_KEY_PREFIX = '?mount:';

function getNativeFSMountsKey(idbKey) {
  return `${idbKey}${NATIVEFS_MOUNTS_KEY_SUFFIX}`;
}

function getNativeFSMountHandleKey(idbKey, mountSlug) {
  return `${idbKey}${NATIVEFS_MOUNT_KEY_PREFIX}${mountSlug}`;
}

async function getNativeFSMounts(idbKey) {
  return await self.idbKeyval.get(getNativeFSMountsKey(idbKey)) || [];
}

async function saveNativeFSMounts(idbKey, mounts) {
  mounts.sort((left, right) => left.name.localeCompare(right.name));
  await self.idbKeyval.set(getNativeFSMountsKey(idbKey), mounts);
}

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

function getNativeFSMountSectionHtml(route, mounts) {
  const rootUrl = getAssetUrl(route);
  const mountItems = mounts.length === 0 ? '<p class="empty-state">No additional directories attached.</p>' : `
    <ul class="mount-list">
      ${mounts.map((mount) => `
        <li class="mount-item">
          <a href="${escapeAttribute(`${rootUrl}@${encodePathComponent(mount.slug)}/`)}" class="file-link">${escapeHtml(mount.name)}</a>
        </li>
      `).join('')}
    </ul>
  `;

  return `
    <section class="secondary-section">
      <h2>Attached External Directories</h2>
      ${mountItems}
      <button type="button" id="attachDirectoryButton">Attach Another Directory</button>
    </section>
  `;
}

function getNativeFSMountMissingHtml(route, mountSlug) {
  const rootUrl = getAssetUrl(route);
  return renderHtmlPage({
    title: 'External directory not found',
    stylesheets: ['styles/nativefs.css'],
    body: `
      <div class="container">
        <div class="message">No attached external directory was found for '${escapeHtml(mountSlug)}'.</div>
        <a href="${escapeAttribute(rootUrl)}">Return to external directories</a>
      </div>
    `
  });
}

async function removeNativeFSMount(idbKey, mountSlug) {
  const mounts = await getNativeFSMounts(idbKey);
  await self.idbKeyval.del(getNativeFSMountHandleKey(idbKey, mountSlug));
  await saveNativeFSMounts(idbKey, mounts.filter((mount) => mount.slug !== mountSlug));
}

const handleNativeFsRequest = async (request, route, dirName, pathInfo) => {
  const idbKey = dirName;
  const { mountSlug, pathSegments, isDirectoryRequest } = pathInfo;

  const handleKey = mountSlug ? getNativeFSMountHandleKey(idbKey, mountSlug) : idbKey;
  const baseDirHandle = await self.idbKeyval.get(handleKey);

  if (!baseDirHandle) {
    if (mountSlug) {
      return createResponse(getNativeFSMountMissingHtml(route, mountSlug), {
        status: 404,
        statusText: 'Directory Handle Not Found',
        headers: { "Content-Type": "text/html" }
      });
    }

    const mounts = await getNativeFSMounts(idbKey);
    if (mounts.length > 0) {
      return handleListDirectory({
        async *values() {
        }
      }, request, {
        sectionHtml: getNativeFSMountSectionHtml(route, mounts),
        pageData: { nativeFsRootKey: idbKey },
        extraScripts: ['idbKeyval.js'],
        showCreateForm: false
      });
    }

    return handleNativeFSDirectorySelection(idbKey);
  }

  if (await baseDirHandle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
    return handleNativeFSPermissionNotGranted(handleKey);
  }

  if (pathSegments.length === 0 && request.method === 'DELETE') {
    if (mountSlug) {
      await removeNativeFSMount(idbKey, mountSlug);
      return createResponse(null, { status: 204, statusText: 'No Content' });
    }
    await self.idbKeyval.del(idbKey);
    return handleNativeFSDirectorySelection(idbKey);
  }

  const mounts = !mountSlug && pathSegments.length === 0 ? await getNativeFSMounts(idbKey) : [];
  const rootUrl = getAssetUrl(route);
  const footerHtml = mountSlug
    ? `<div class="footer-actions"><a href="${escapeAttribute(rootUrl)}" class="btn">Back to default directory</a><button type="button" class="disconnect-button" id="disconnectDirectoryButton" data-redirect-url="${escapeAttribute(rootUrl)}">Disconnect Directory</button></div>`
    : '<button type="button" class="disconnect-button" id="disconnectDirectoryButton">Disconnect Directory</button>';

  return handleFileRequest(request, baseDirHandle, pathSegments, {
    isDirectoryRequest,
    directoryOptions: {
      footerHtml: pathSegments.length === 0 ? footerHtml : '',
      sectionHtml: !mountSlug && pathSegments.length === 0 ? getNativeFSMountSectionHtml(route, mounts) : '',
      pageData: !mountSlug && pathSegments.length === 0 ? { nativeFsRootKey: idbKey } : null,
      extraScripts: !mountSlug && pathSegments.length === 0 ? ['idbKeyval.js'] : []
    }
  });
}

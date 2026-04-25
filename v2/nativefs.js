// Shared template function for consistent styling and structure
const NATIVEFS_MOUNTS_KEY_SUFFIX = '?mounts';
const NATIVEFS_MOUNT_KEY_PREFIX = '?mount:';
const NATIVEFS_DEFAULT_MOUNT_KEY_SUFFIX = '?default-mount';

function getNativeFSMountsKey(idbKey) {
  return `${idbKey}${NATIVEFS_MOUNTS_KEY_SUFFIX}`;
}

function getNativeFSMountHandleKey(idbKey, mountSlug) {
  return `${idbKey}${NATIVEFS_MOUNT_KEY_PREFIX}${mountSlug}`;
}

function getNativeFSDefaultMountKey(idbKey) {
  return `${idbKey}${NATIVEFS_DEFAULT_MOUNT_KEY_SUFFIX}`;
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

async function getNativeFSMounts(idbKey) {
  return await self.idbKeyval.get(getNativeFSMountsKey(idbKey)) || [];
}

async function saveNativeFSMounts(idbKey, mounts) {
  mounts.sort((left, right) => left.name.localeCompare(right.name));
  await self.idbKeyval.set(getNativeFSMountsKey(idbKey), mounts);
}

async function getNativeFSDefaultMountSlug(idbKey) {
  return await self.idbKeyval.get(getNativeFSDefaultMountKey(idbKey)) || null;
}

async function setNativeFSDefaultMountSlug(idbKey, mountSlug) {
  if (mountSlug) {
    await self.idbKeyval.set(getNativeFSDefaultMountKey(idbKey), mountSlug);
  } else {
    await self.idbKeyval.del(getNativeFSDefaultMountKey(idbKey));
  }
}

function getNativeFSMountUrl(route, mountSlug) {
  return `${getAssetUrl(route)}@${encodePathComponent(mountSlug)}/`;
}

async function ensureNativeFSMountState(idbKey) {
  let mounts = await getNativeFSMounts(idbKey);
  let defaultMountSlug = await getNativeFSDefaultMountSlug(idbKey);
  const legacyDefaultHandle = await self.idbKeyval.get(idbKey);

  if (legacyDefaultHandle) {
    const mountSlug = defaultMountSlug && mounts.some((mount) => mount.slug === defaultMountSlug)
      ? defaultMountSlug
      : getUniqueMountSlug(slugifyMountName(legacyDefaultHandle.name) || 'directory', mounts);

    if (!mounts.some((mount) => mount.slug === mountSlug)) {
      mounts.push({ slug: mountSlug, name: legacyDefaultHandle.name });
      await self.idbKeyval.set(getNativeFSMountHandleKey(idbKey, mountSlug), legacyDefaultHandle);
      await saveNativeFSMounts(idbKey, mounts);
      mounts = await getNativeFSMounts(idbKey);
    }

    defaultMountSlug = mountSlug;
    await setNativeFSDefaultMountSlug(idbKey, mountSlug);
    await self.idbKeyval.del(idbKey);
  }

  if (defaultMountSlug && !mounts.some((mount) => mount.slug === defaultMountSlug)) {
    defaultMountSlug = mounts[0]?.slug || null;
    await setNativeFSDefaultMountSlug(idbKey, defaultMountSlug);
  } else if (!defaultMountSlug && mounts.length > 0) {
    defaultMountSlug = mounts[0].slug;
    await setNativeFSDefaultMountSlug(idbKey, defaultMountSlug);
  }

  return { mounts, defaultMountSlug };
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
  const mountItems = mounts.length === 0 ? '<p class="empty-state">No additional directories attached.</p>' : `
    <ul class="mount-list">
      ${mounts.map((mount) => `
        <li class="mount-item">
          <a href="${escapeAttribute(getNativeFSMountUrl(route, mount.slug))}" class="file-link">${escapeHtml(mount.name)}</a>
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
  const remainingMounts = mounts.filter((mount) => mount.slug !== mountSlug);
  await saveNativeFSMounts(idbKey, remainingMounts);

  const defaultMountSlug = await getNativeFSDefaultMountSlug(idbKey);
  if (defaultMountSlug === mountSlug) {
    await setNativeFSDefaultMountSlug(idbKey, remainingMounts[0]?.slug || null);
  }
}

const handleNativeFsRequest = async (request, route, dirName, pathInfo) => {
  const idbKey = dirName;
  const { mountSlug, pathSegments, isDirectoryRequest } = pathInfo;
  const { mounts, defaultMountSlug } = await ensureNativeFSMountState(idbKey);

  if (!mountSlug && pathSegments.length === 0) {
    if (defaultMountSlug) {
      return createResponse(null, {
        status: 302,
        statusText: 'Found',
        headers: { 'Location': getNativeFSMountUrl(route, defaultMountSlug) }
      });
    }

    if (mounts.length > 0) {
      return createResponse(null, {
        status: 302,
        statusText: 'Found',
        headers: { 'Location': getNativeFSMountUrl(route, mounts[0].slug) }
      });
    }

    return handleNativeFSDirectorySelection(idbKey);
  }

  const handleKey = getNativeFSMountHandleKey(idbKey, mountSlug);
  const baseDirHandle = await self.idbKeyval.get(handleKey);

  if (!baseDirHandle) {
    return createResponse(getNativeFSMountMissingHtml(route, mountSlug), {
      status: 404,
      statusText: 'Directory Handle Not Found',
      headers: { "Content-Type": "text/html" }
    });
  }

  if (await baseDirHandle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
    return handleNativeFSPermissionNotGranted(handleKey);
  }

  if (pathSegments.length === 0 && request.method === 'DELETE') {
    await removeNativeFSMount(idbKey, mountSlug);
    return createResponse(null, { status: 204, statusText: 'No Content' });
  }

  const isDefaultMount = mountSlug === defaultMountSlug;
  const attachedMounts = mounts.filter((mount) => mount.slug !== defaultMountSlug);
  const defaultMountUrl = defaultMountSlug ? getNativeFSMountUrl(route, defaultMountSlug) : getAssetUrl(route);
  const redirectUrl = isDefaultMount ? getAssetUrl(route) : defaultMountUrl;
  const footerHtml = isDefaultMount
    ? `<button type="button" class="disconnect-button" id="disconnectDirectoryButton" data-redirect-url="${escapeAttribute(redirectUrl)}">Disconnect Directory</button>`
    : `<div class="footer-actions"><a href="${escapeAttribute(defaultMountUrl)}" class="btn">Back to default directory</a><button type="button" class="disconnect-button" id="disconnectDirectoryButton" data-redirect-url="${escapeAttribute(redirectUrl)}">Disconnect Directory</button></div>`;

  return handleFileRequest(request, baseDirHandle, pathSegments, {
    isDirectoryRequest,
    directoryOptions: {
      footerHtml: pathSegments.length === 0 ? footerHtml : '',
      sectionHtml: isDefaultMount && pathSegments.length === 0 ? getNativeFSMountSectionHtml(route, attachedMounts) : '',
      pageData: isDefaultMount && pathSegments.length === 0 ? { nativeFsRootKey: idbKey } : null,
      extraScripts: isDefaultMount && pathSegments.length === 0 ? ['idbKeyval.js'] : []
    }
  });
}

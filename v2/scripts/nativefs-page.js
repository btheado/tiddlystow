async function runNativeFsAction() {
  const { idbKey, actionFunction } = window.TIDDLYSTOW_PAGE_DATA;

  if (actionFunction === 'pickDirectory') {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await idbKeyval.set(idbKey, dirHandle);
  } else if (actionFunction === 'requestDirectoryPermission') {
    const dirHandle = await idbKeyval.get(idbKey);
    await dirHandle.requestPermission({ mode: 'readwrite' });
  } else {
    throw new Error(`Unknown native fs action: ${actionFunction}`);
  }

  window.location.reload();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('nativeFsActionButton').addEventListener('click', () => {
    runNativeFsAction().catch((error) => {
      console.error('Native FS action failed:', error);
    });
  });
});

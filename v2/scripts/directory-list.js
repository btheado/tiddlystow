function navigateToURL() {
  const userInput = document.getElementById('urlInput').value.trim();
  if (userInput !== '') {
    window.location.href = encodeURIComponent(userInput) + '.html';
  } else {
    alert('Please enter a file name');
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

async function disconnectDirectory() {
  try {
    await fetch(window.location.href, { method: 'DELETE' });
    window.location.reload();
  } catch (error) {
    console.error('Error disconnecting directory:', error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('urlInput');
  urlInput.focus();
  urlInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      navigateToURL();
    }
  });

  const createButton = document.getElementById('createButton');
  if (createButton) {
    createButton.addEventListener('click', navigateToURL);
  }

  document.querySelectorAll('.delete-btn[data-url]').forEach((button) => {
    button.addEventListener('click', () => deleteFile(button.dataset.url, button.dataset.fileName));
  });

  document.querySelectorAll('.download-btn[data-url]').forEach((button) => {
    button.addEventListener('click', () => downloadFile(button.dataset.url, button.dataset.fileName));
  });

  const disconnectButton = document.getElementById('disconnectDirectoryButton');
  if (disconnectButton) {
    disconnectButton.addEventListener('click', disconnectDirectory);
  }
});

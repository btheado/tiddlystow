function showStatus(message, type) {
  const statusElement = document.getElementById('status-message');
  statusElement.innerHTML = '';

  if (type === 'loading') {
    const spinner = document.createElement('span');
    spinner.className = 'loading';
    statusElement.appendChild(spinner);
    statusElement.appendChild(document.createTextNode(message));
  } else {
    statusElement.textContent = message;
    statusElement.className = type;
  }

  statusElement.style.display = 'block';
}

async function saveAndReload(contents, type, size) {
  if (!contents) {
    showStatus('Error: No content to save', 'error');
    return;
  }

  try {
    const response = await fetch(window.location.href, {
      method: 'PUT',
      headers: {
        'Content-Type': type,
        'Content-Length': size
      },
      body: contents
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }

    showStatus('File saved successfully! Reloading...', 'success');
    window.location.reload();
  } catch (error) {
    showStatus(`Error saving file: ${error.message}`, 'error');
    console.error('Save error:', error);
  }
}

async function openFromUrl(url, description) {
  try {
    showStatus(`Loading ${description || url}...`, 'loading');
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }

    const contents = await response.text();
    await saveAndReload(contents, 'text/html', contents.length);
  } catch (error) {
    showStatus(`Error fetching from URL: ${error.message}`, 'error');
    console.error('Fetch error:', error);
  }
}

function openFromUpload(event) {
  const fileInput = event.target;
  const file = fileInput.files[0];

  if (!file) {
    showStatus('No file selected', 'error');
    return;
  }

  const validTypes = ['text/html', 'application/xhtml+xml'];
  if (!validTypes.includes(file.type) && !file.name.endsWith('.html')) {
    showStatus('Warning: File does not appear to be an HTML file', 'error');
  }

  showStatus(`Reading file: ${file.name}...`, 'loading');

  const reader = new FileReader();
  reader.onload = async function(loadEvent) {
    try {
      await saveAndReload(loadEvent.target.result, file.type, file.size);
    } catch (error) {
      showStatus(`Error processing file: ${error.message}`, 'error');
      console.error('File processing error:', error);
    }
  };

  reader.onerror = function() {
    showStatus('Error reading file', 'error');
    console.error('FileReader error:', reader.error);
  };

  reader.readAsArrayBuffer(file);
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.button-list button[data-url]').forEach((button) => {
    button.addEventListener('click', () => openFromUrl(button.dataset.url, button.dataset.description));
  });

  const fileInput = document.getElementById('fileInput');
  fileInput.addEventListener('change', openFromUpload);
  fileInput.addEventListener('click', () => {
    fileInput.value = '';
  });
});

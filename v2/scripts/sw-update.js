(function() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  let promptElement = null;
  let isReloading = false;
  let currentRegistration = null;
  const observedRegistrations = new WeakSet();

  function ensurePrompt() {
    if (promptElement) {
      return promptElement;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'sw-update hidden';
    wrapper.innerHTML = `
      <div class="sw-update__message">A site update is available.</div>
      <button type="button" class="sw-update__button">Update now</button>
    `;

    const button = wrapper.querySelector('.sw-update__button');
    button.addEventListener('click', () => {
      if (!currentRegistration?.waiting) {
        return;
      }
      button.disabled = true;
      button.textContent = 'Updating...';
      currentRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    });

    document.body.appendChild(wrapper);
    promptElement = wrapper;
    return promptElement;
  }

  function showPrompt(registration) {
    if (!registration?.waiting) {
      return;
    }
    currentRegistration = registration;
    ensurePrompt().classList.remove('hidden');
  }

  function monitorInstallingWorker(registration, worker) {
    if (!worker) {
      return;
    }

    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        showPrompt(registration);
      }
    });
  }

  function observeRegistration(registration) {
    if (!registration || observedRegistrations.has(registration)) {
      return;
    }

    observedRegistrations.add(registration);
    currentRegistration = registration;

    if (registration.waiting) {
      showPrompt(registration);
    }

    registration.addEventListener('updatefound', () => {
      monitorInstallingWorker(registration, registration.installing);
    });

    if (registration.installing) {
      monitorInstallingWorker(registration, registration.installing);
    }
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isReloading) {
      return;
    }
    isReloading = true;
    window.location.reload();
  });

  window.TiddlystowObserveServiceWorkerRegistration = observeRegistration;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      navigator.serviceWorker.getRegistration().then(observeRegistration);
    }, { once: true });
  } else {
    navigator.serviceWorker.getRegistration().then(observeRegistration);
  }
}());

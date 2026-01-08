(function () {
  

  const STATE = {
    inProgress: false,
    lastAttemptAt: 0,
    minRetryMs: 60000 
  };

  function $id(id){ return document.getElementById(id); }

  function showMessage(msg){
    const el = $id('nearby-msg');
    if (el) el.textContent = msg;
  }

  async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 45000 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(resource, { ...options, signal: controller.signal });
      clearTimeout(id);
      return res;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  async function findNearbyByCoords(lat, lng, specialistName) {
    if (STATE.inProgress) return;
    const now = Date.now();
    if (now - STATE.lastAttemptAt < STATE.minRetryMs) {
      showMessage('Please wait a moment before retrying...');
      return;
    }
    STATE.inProgress = true;
    STATE.lastAttemptAt = now;
    showMessage('Searching nearby providers...');
    const mapEl = $id('map');
    if (mapEl) mapEl.style.display = 'block';
    try {
      const url = `/nearby?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=3000&specialist=${encodeURIComponent(specialistName)}`;
      const res = await fetchWithTimeout(url, { timeout: 45000, cache: 'no-store' });
      if (!res.ok) {
        showMessage('Service temporarily unavailable. Please try again later.');
        STATE.inProgress = false;
        return;
      }
      const j = await res.json();
      if (!j.ok) {
        showMessage('No results found or service returned an error.');
        STATE.inProgress = false;
        return;
      }
      showMessage(`${j.count} places found`);
      // Trigger rendering by dispatching a custom event with payload
      document.dispatchEvent(new CustomEvent('nearby:places', { detail: { places: j.places, lat, lng } }));
    } catch (err) {
      console.error('Nearby fetch error', err);
      if (err.name === 'AbortError') {
        showMessage('Request timed out. Please try again.');
      } else {
        showMessage('Network or server error. Try again later.');
      }
    } finally {
      STATE.inProgress = false;
    }
  }

  // Expose functions
  window.__nearby = {
    findNearbyByCoords,
    tryAutoLocate: function(specialistName) {
      if (!navigator.geolocation) {
        showMessage('Geolocation not supported; use fallback.');
        const fallbackEl = $id('nearby-fallback');
        if (fallbackEl) fallbackEl.style.display = 'block';
        return;
      }
      // Prevent immediate repeated automatic calls
      const now = Date.now();
      if (now - STATE.lastAttemptAt < 500) return;
      showMessage('Attempting to detect your location automatically...');
      navigator.geolocation.getCurrentPosition(
        (pos) => { window.__nearby.findNearbyByCoords(pos.coords.latitude, pos.coords.longitude, specialistName); },
        (err) => {
          console.warn('Geolocation error', err);
          if (err && err.code === err.PERMISSION_DENIED) {
            showMessage('Location permission denied. Use the fallback search below.');
          } else if (err && err.code === err.POSITION_UNAVAILABLE) {
            showMessage('Location unavailable. Try again or use fallback search.');
          } else if (err && err.code === err.TIMEOUT) {
            showMessage('Location request timed out. Try again or use fallback.');
          } else {
            showMessage('Geolocation failed. Use fallback search.');
          }
          const fallbackEl = $id('nearby-fallback');
          if (fallbackEl) fallbackEl.style.display = 'block';
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    }
  };

})();
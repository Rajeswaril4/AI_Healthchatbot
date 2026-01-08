// Shared JS used by index.html and result.html
document.addEventListener('DOMContentLoaded', () => {
  // Theme toggle
  const themeToggle = document.getElementById('theme-toggle');
  const themeIconImg = document.getElementById('theme-icon');

  const savedTheme = localStorage.getItem('theme') || 'light';
  const isDark = savedTheme === 'dark';
  document.body.classList.toggle('dark', isDark);

  const sunIcon = themeIconImg && themeIconImg.dataset && themeIconImg.dataset.sun ? themeIconImg.dataset.sun : null;
  const moonIcon = themeIconImg && themeIconImg.dataset && themeIconImg.dataset.moon ? themeIconImg.dataset.moon : null;

  function setThemeIcon(dark) {
    if (!themeIconImg) return;
    if (dark && moonIcon) themeIconImg.src = moonIcon;
    else if (!dark && sunIcon) themeIconImg.src = sunIcon;
    themeToggle && themeToggle.setAttribute('aria-pressed', String(dark));
    themeIconImg.alt = dark ? 'Dark mode (active)' : 'Light mode (active)';
  }
  setThemeIcon(isDark);

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const nowDark = document.body.classList.toggle('dark');
      setThemeIcon(nowDark);
      localStorage.setItem('theme', nowDark ? 'dark' : 'light');
    });
  }

  // Background image toggle
  const bgToggle = document.getElementById('bg-toggle');
  const bgImage = document.getElementById('bgImage');

  try {
    const savedBg = localStorage.getItem('bgImage') || 'off';
    if (bgImage && bgImage.dataset && bgImage.dataset.src && savedBg === 'on') {
      bgImage.style.backgroundImage = `url('${bgImage.dataset.src}')`;
      bgImage.classList.add('visible');
      bgToggle && bgToggle.setAttribute('aria-pressed', 'true');
    }
  } catch (e) { /* ignore */ }

  function toggleBackgroundImage() {
    if (!bgImage || !bgToggle) return;
    const isNowOn = !bgImage.classList.contains('visible');
    if (isNowOn) {
      if (bgImage.dataset && bgImage.dataset.src) bgImage.style.backgroundImage = `url('${bgImage.dataset.src}')`;
      bgImage.classList.add('visible');
      localStorage.setItem('bgImage', 'on');
    } else {
      bgImage.classList.remove('visible');
      bgImage.style.backgroundImage = '';
      localStorage.setItem('bgImage', 'off');
    }
    bgToggle.setAttribute('aria-pressed', String(isNowOn));
    bgToggle.setAttribute('aria-label', isNowOn ? 'Hide background image' : 'Show background image');
  }

  if (bgToggle) {
    bgToggle.addEventListener('click', (e) => { e.preventDefault(); toggleBackgroundImage(); });
    bgToggle.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleBackgroundImage(); } });
  }

  // Search/filter
  const searchEl = document.getElementById('search');
  if (searchEl) {
    searchEl.addEventListener('input', function () {
      const q = this.value.trim().toLowerCase();
      document.querySelectorAll('.symptom-card').forEach(card => {
        const match = card.dataset.symptom.toLowerCase().includes(q);
        card.style.display = match ? 'flex' : 'none';
      });
    });
  }

  // Symptom card selection (no visible checkboxes). Hidden inputs are populated before submit.
  const symptomCards = Array.from(document.querySelectorAll('.symptom-card'));
  const hiddenInputsContainer = document.getElementById('hidden-inputs');

  if (symptomCards.length) {
    symptomCards.forEach(card => {
      if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '0');
      if (!card.hasAttribute('role')) card.setAttribute('role', 'button');
      if (!card.hasAttribute('aria-pressed')) card.setAttribute('aria-pressed', 'false');

      const toggle = (c) => {
        const selected = c.classList.toggle('selected');
        c.setAttribute('aria-pressed', String(selected));
        const label = c.querySelector('.symptom-label');
        if (label) c.setAttribute('aria-label', `${label.textContent} ${selected ? 'selected' : 'not selected'}`);
      };

      card.addEventListener('click', (e) => {
        if (e.target && (e.target.tagName.toLowerCase() === 'a' || e.target.tagName.toLowerCase() === 'button')) return;
        toggle(card);
      });

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(card); }
      });
    });
  }

  function prepareHiddenInputs() {
    if (!hiddenInputsContainer) return;
    hiddenInputsContainer.innerHTML = '';
    document.querySelectorAll('.symptom-card.selected').forEach(card => {
      const name = card.dataset.symptom;
      if (!name) return;
      const inp = document.createElement('input');
      inp.type = 'hidden';
      inp.name = 'symptoms';
      inp.value = name;
      hiddenInputsContainer.appendChild(inp);
    });
  }

  // Submit handling
  const symptomForm = document.getElementById('symptom-form');
  const predictBtn = document.querySelector('.predict-btn');

  if (symptomForm) {
    symptomForm.addEventListener('submit', (e) => {
      const selected = document.querySelectorAll('.symptom-card.selected').length;
      if (selected === 0) {
        e.preventDefault();
        if (predictBtn) {
          const original = predictBtn.textContent;
          predictBtn.textContent = 'Select at least one';
          predictBtn.classList.add('flash-selected');
          setTimeout(() => { predictBtn.textContent = original; predictBtn.classList.remove('flash-selected'); }, 1000);
        }
        return;
      }
      prepareHiddenInputs();
    });
  }

  // Confidence meter animation (on result page)
  document.querySelectorAll('.confidence-fill').forEach(el => {
    const val = el.dataset.conf;
    let pct = 0;
    if (val !== undefined && val !== null && val !== '' && val !== 'None') {
      const n = Number(val);
      if (!Number.isNaN(n)) pct = Math.max(0, Math.min(100, n));
    }
    setTimeout(() => { el.style.width = pct + '%'; }, 80);
  });

  // 3D background parallax (if element exists and reduced-motion not requested)
  const bg = document.getElementById('bg3d');
  if (bg && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const layers = Array.from(bg.querySelectorAll('.bg-layer'));
    let lastX = 0, lastY = 0;
    function handlePointerMove(e) {
      const clientX = (e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] && e.touches[0].clientX) || window.innerWidth/2);
      const clientY = (e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] && e.touches[0].clientY) || window.innerHeight/2);
      const centerX = (clientX - (window.innerWidth / 2)) / (window.innerWidth / 2);
      const centerY = (clientY - (window.innerHeight / 2)) / (window.innerHeight / 2);
      if (Math.abs(centerX - lastX) < 0.002 && Math.abs(centerY - lastY) < 0.002) return;
      lastX = centerX; lastY = centerY;
      layers.forEach(layer => {
        const speed = parseFloat(layer.dataset.speed) || 0.04;
        const layerOffsetX = centerX * 30 * speed;
        const layerOffsetY = centerY * 18 * speed;
        layer.style.transform = `translate3d(${layerOffsetX}px, ${layerOffsetY}px, 0)`;
        Array.from(layer.querySelectorAll('.bg-shape')).forEach(shape => {
          const depth = Number(shape.dataset.depth) || 12;
          const rx = centerY * depth * 0.8;
          const ry = centerX * depth * 0.7;
          shape.style.transform = `translate3d(0,0,${depth}px) rotateX(${rx}deg) rotateY(${ry}deg)`;
        });
      });
    }
    window.addEventListener('mousemove', handlePointerMove, { passive: true });
    window.addEventListener('touchmove', handlePointerMove, { passive: true });
  }
});
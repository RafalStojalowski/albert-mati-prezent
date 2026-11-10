// Scena szóstego punktu: Sahara
// Kamera → Przemo kręci się w kółko → "Już odpocząłem" → nagranie (placeholder)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fadeTo(el, opacity, ms) {
  el.style.transition = `opacity ${ms}ms ease`;
  el.style.opacity = String(opacity);
  return sleep(ms);
}

const SPEECH = 'Zapraszam na wiadukt!\nCzeka tam coś specjalnego…';

export async function startSaharaScene({ origin, sceneTarget, overlay, onEnd, devMode }) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } }, audio: false,
  });
  const video = document.createElement('video');
  video.className = 'ar-video';
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.srcObject = stream;
  document.body.appendChild(video);
  await video.play();

  // Kręcący się Przemo
  const photoEl = document.createElement('div');
  photoEl.className = 'radziun-photo sahara-spin';
  photoEl.innerHTML = '<img src="src/przemo.jpg" alt="Przemo na Saharze">';
  document.body.appendChild(photoEl);

  // Przycisk "Już odpocząłem"
  const btnEl = document.createElement('button');
  btnEl.className = 'sahara-rest-btn';
  btnEl.textContent = 'Już odpocząłem!';
  document.body.appendChild(btnEl);

  // UI overlay
  const labelEl  = overlay.querySelector('.ar-label');
  const hintEl   = overlay.querySelector('.ar-hint');
  const bottomEl = overlay.querySelector('.ar-bottom');
  const ORIG_BTM = bottomEl.innerHTML;

  labelEl.textContent = 'Przemo na Saharze';
  hintEl.textContent  = 'Przemo kręci się w kółko…';
  bottomEl.innerHTML  = '<button class="ar-close" aria-label="Zamknij">✕</button>';
  overlay.classList.remove('hidden');

  let cancelled = false;

  // Dymek (tworzony od razu, ukryty)
  const speechEl = document.createElement('div');
  speechEl.className = 'przemo-video-speech';
  speechEl.style.opacity = '0';
  speechEl.style.pointerEvents = 'none';
  const lines = SPEECH.split('\n');
  speechEl.innerHTML = lines.map(l => `<p>${l}</p>`).join('') +
    '<p class="tap-hint">Dotknij aby kontynuować</p>';
  document.body.appendChild(speechEl);

  function cleanupAll() {
    stream.getTracks().forEach(t => t.stop());
    video.remove();
    if (photoEl.parentElement) photoEl.remove();
    if (btnEl.parentElement) btnEl.remove();
    if (speechEl.parentElement) speechEl.remove();
    labelEl.textContent = '';
    hintEl.textContent  = '';
    bottomEl.innerHTML  = ORIG_BTM;
    overlay.classList.add('hidden');
  }

  bottomEl.querySelector('.ar-close').addEventListener('click', () => {
    cancelled = true;
    cleanupAll();
    onEnd && onEnd();
  });

  // Czekaj na kliknięcie "Już odpocząłem"
  await new Promise(res => {
    btnEl.addEventListener('click', res, { once: true });
    btnEl.addEventListener('touchstart', (e) => { e.preventDefault(); res(); }, { once: true });
  });

  if (cancelled) return;

  // Ukryj przycisk i zatrzymaj kręcenie
  btnEl.remove();
  photoEl.classList.remove('sahara-spin');
  hintEl.textContent = '';

  // Pokaż dymek z mową
  speechEl.style.pointerEvents = 'auto';
  await fadeTo(speechEl, 1, 600);

  if (cancelled) return;

  // Czekaj na tap
  await new Promise(res => {
    speechEl.addEventListener('click', res, { once: true });
    speechEl.addEventListener('touchstart', res, { once: true, passive: true });
  });

  if (cancelled) return;

  // Fade out i zamknij
  await Promise.all([
    fadeTo(photoEl,  0, 800),
    fadeTo(speechEl, 0, 800),
  ]);

  cleanupAll();
  onEnd && onEnd();
}

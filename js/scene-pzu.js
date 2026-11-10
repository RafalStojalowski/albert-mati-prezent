// Scena czwartego punktu: PZU
// Kamera → Przemo stoi na PZU → nagranie (placeholder: tekst mowy)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fadeTo(el, opacity, ms) {
  el.style.transition = `opacity ${ms}ms ease`;
  el.style.opacity = String(opacity);
  return sleep(ms);
}

const SPEECH = 'Witam serdecznie kolegów!\nZapraszam na partyjkę w siatkotenisa!';

export async function startPzuScene({ origin, sceneTarget, overlay, onEnd, devMode }) {
  // 1. Otwórz kamerę
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

  // 2. Nałóż zdjęcie Przema
  const photoEl = document.createElement('div');
  photoEl.className = 'radziun-photo';
  photoEl.innerHTML = '<img src="src/przemo.jpg" alt="Przemo na PZU">';
  document.body.appendChild(photoEl);

  // 3. UI overlay
  const labelEl  = overlay.querySelector('.ar-label');
  const hintEl   = overlay.querySelector('.ar-hint');
  const bottomEl = overlay.querySelector('.ar-bottom');
  const ORIG_BTM = bottomEl.innerHTML;

  labelEl.textContent = 'Przemo na PZU';
  hintEl.textContent  = '';
  bottomEl.innerHTML  = '<button class="ar-close" aria-label="Zamknij">✕</button>';
  overlay.classList.remove('hidden');

  let cancelled = false;

  function cleanupAll() {
    stream.getTracks().forEach(t => t.stop());
    video.remove();
    if (photoEl.parentElement) photoEl.remove();
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

  // 4. Dymek z mową (placeholder nagrania)
  const speechEl = document.createElement('div');
  speechEl.className = 'przemo-video-speech';
  speechEl.style.opacity = '0';
  const lines = SPEECH.split('\n');
  speechEl.innerHTML = lines.map(l => `<p>${l}</p>`).join('') +
    '<p class="tap-hint">Dotknij aby kontynuować</p>';
  document.body.appendChild(speechEl);

  // Czekaj chwilę, potem pokaż mowę
  if (devMode) {
    hintEl.textContent = '[DEV] Dotknij aby pominąć';
    await Promise.race([
      sleep(2000),
      new Promise(r => overlay.addEventListener('click', r, { once: true })),
    ]);
  } else {
    await sleep(3000);
  }

  if (cancelled) return;

  // Pokaż dymek
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

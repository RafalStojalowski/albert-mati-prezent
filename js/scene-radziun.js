// Scena trzeciego punktu: Radziun – pod blokiem
// Kamera → zdjęcie Przema przy Zaspowóz → zanika → minigra wyścigowa

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function startRadziunScene({ origin, sceneTarget, overlay, onEnd, devMode }) {
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

  // 2. Nałóż zdjęcie Przema na kamerę
  const photoEl = document.createElement('div');
  photoEl.className = 'radziun-photo';
  photoEl.innerHTML = '<img src="src/zaspowoz.jpg" alt="Przemo przy Zaspowóz">';
  document.body.appendChild(photoEl);

  const labelEl  = overlay.querySelector('.ar-label');
  const hintEl   = overlay.querySelector('.ar-hint');
  const bottomEl = overlay.querySelector('.ar-bottom');
  const ORIG_BTM = bottomEl.innerHTML;

  labelEl.textContent = 'Przemo przy Zaspowóz';
  hintEl.textContent  = '';
  bottomEl.innerHTML  = '<button class="ar-close" aria-label="Zamknij">✕</button>';
  overlay.classList.remove('hidden');

  let cancelled = false;

  function cleanupCamera() {
    stream.getTracks().forEach(t => t.stop());
    video.remove();
    photoEl.remove();
    labelEl.textContent = '';
    hintEl.textContent  = '';
    bottomEl.innerHTML  = ORIG_BTM;
    overlay.classList.add('hidden');
  }

  bottomEl.querySelector('.ar-close').addEventListener('click', () => {
    cancelled = true;
    cleanupCamera();
    onEnd && onEnd();
  });

  // 3. Czekaj chwilę, potem Przemo zanika
  if (devMode) {
    hintEl.textContent = '[DEV] Dotknij aby pominąć';
    await new Promise(res => {
      const skip = () => { overlay.removeEventListener('click', skip); res(); };
      overlay.addEventListener('click', skip, { once: true });
      setTimeout(res, 5000);
    });
  } else {
    await sleep(4500);
  }

  if (cancelled) return;

  // Fade out zdjęcia
  photoEl.style.transition = 'opacity 1.5s ease';
  photoEl.style.opacity = '0';
  hintEl.textContent = 'Przemo znika…';
  await sleep(1800);

  if (cancelled) return;

  // 4. Zamknij kamerę
  cleanupCamera();

  // 5. Uruchom minigrę wyścigową
  const mgMod = await import(new URL('js/minigame-racing.js', document.baseURI).href);
  await mgMod.startRacingGame();

  // 6. Nagranie Przema: teraz trzeba pograć w piłeczkę
  const { playVideoMessage } = await import('./video-message.js');
  await playVideoMessage('src/przemo-zaspowoz.mp4', {
    start: 'button',
    hint: 'Przemo ma Wam coś do powiedzenia',
  });

  onEnd && onEnd();
}

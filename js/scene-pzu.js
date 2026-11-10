// Scena czwartego punktu: PZU
// Kamera → nagranie Przema na PZU (wita kolegów i zaprasza na siatkotenisa)

import { playVideoMessage } from './video-message.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const VIDEO = 'src/przemo-pzu.mp4';

export async function startPzuScene({ overlay, onEnd, devMode }) {
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

  // 2. UI overlay
  const labelEl  = overlay.querySelector('.ar-label');
  const hintEl   = overlay.querySelector('.ar-hint');
  const bottomEl = overlay.querySelector('.ar-bottom');
  const ORIG_BTM = bottomEl.innerHTML;

  labelEl.textContent = 'Przemo na PZU';
  hintEl.textContent  = devMode ? '[DEV] Dotknij aby pominąć' : '';
  bottomEl.innerHTML  = '<button class="ar-close" aria-label="Zamknij">✕</button>';
  overlay.classList.remove('hidden');

  let cancelled = false;

  function cleanupAll() {
    stream.getTracks().forEach(t => t.stop());
    video.remove();
    labelEl.textContent = '';
    hintEl.textContent  = '';
    bottomEl.innerHTML  = ORIG_BTM;
    overlay.classList.add('hidden');
  }

  bottomEl.querySelector('.ar-close').addEventListener('click', () => {
    if (cancelled) return;
    cancelled = true;
    cleanupAll();
    onEnd && onEnd();
  });

  // 3. Chwila na kamerce, potem nagranie
  if (devMode) {
    await Promise.race([
      sleep(2000),
      new Promise(r => overlay.addEventListener('click', r, { once: true })),
    ]);
  } else {
    await sleep(2000);
  }
  if (cancelled) return;

  await playVideoMessage(VIDEO, { overCamera: true });
  if (cancelled) return;

  cancelled = true;
  cleanupAll();
  onEnd && onEnd();
}

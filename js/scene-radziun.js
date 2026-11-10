// Scena trzeciego punktu: Radziun – pod blokiem
// Kamera → zdjęcie Przema przy Zaspowozie zawieszone przed graczem →
// po chwili znika → minigra wyścigowa → nagranie Przema (teraz pograć w piłeczkę).

import { openAnchorView, playVideoMessage } from './anchor-view.js';

const PHOTO    = 'src/zaspowoz.jpg';
const VIDEO    = 'src/przemo-zaspowoz.mp4';
const SHOW_MS  = 5000;   // jak długo zdjęcie wisi po znalezieniu

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function startRadziunScene({ onEnd }) {
  const view = await openAnchorView({ hint: '' });

  const img = document.createElement('img');
  img.src = PHOTO;
  img.alt = 'Przemo przy Zaspowozie';
  const it = view.anchor(img);       // zawieszone tam, gdzie patrzy telefon
  view.guide(it);

  // Zdjęcie widoczne przez chwilę (licząc tylko czas, gdy jest na ekranie)
  const result = await Promise.race([
    (async () => {
      let shown = 0, last = performance.now();
      while (shown < SHOW_MS && view.running) {
        await sleep(100);
        const now = performance.now();
        if (it.inView) shown += now - last;
        last = now;
      }
      img.style.transition = 'opacity 1.5s ease';
      img.style.opacity = '0';
      view.setHint('Przemo znika…');
      await sleep(1700);
      return 'next';
    })(),
    view.closed.then(() => 'closed'),
  ]);
  view.close();

  if (result === 'closed') { onEnd && onEnd(); return; }

  // Minigra wyścigowa
  const mgMod = await import(new URL('js/minigame-racing.js', document.baseURI).href);
  await mgMod.startRacingGame();

  // Nagranie Przema – zawieszone przed graczem po kliknięciu "Odtwórz"
  try {
    await playVideoMessage(VIDEO, { start: 'button', hint: 'Przemo ma Wam coś do powiedzenia' });
  } finally {
    onEnd && onEnd();
  }
}

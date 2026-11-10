// Scena trzeciego punktu: Radziun – pod blokiem
// Kamera → zdjęcie Przema przy Zaspowozie zawieszone przed graczem →
// po 3 s celowania w zdjęcie: sekwencja napisów → zdjęcie znika →
// minigra wyścigowa → nagranie Przema (teraz pograć w piłeczkę).

import { openAnchorView, playVideoMessage } from './anchor-view.js';

const PHOTO = 'src/zaspowoz.jpg';
const VIDEO = 'src/przemo-zaspowoz.mp4';
const TEXTS = [
  'Przemo, Radziun i Zaspowóz',
  'czyli auto wyczynowe',
  'Teraz trochę pojeździmy',
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function startRadziunScene({ onEnd }) {
  const view = await openAnchorView({ hint: '' });

  const img = document.createElement('img');
  img.src = PHOTO;
  img.alt = 'Przemo przy Zaspowozie';
  const it = view.anchor(img);       // zawieszone tam, gdzie patrzy telefon
  view.guide(it);

  const result = await Promise.race([
    (async () => {
      // Napisy dopiero po 3 s celowania w zdjęcie
      await view.waitFound(it, { holdMs: 3000, holdHint: '' });
      await view.showTexts(TEXTS);
      img.style.transition = 'opacity 1.5s ease';
      img.style.opacity = '0';
      await sleep(1600);
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

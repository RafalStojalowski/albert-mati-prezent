// Scena piątego punktu: Kort tenisowy
// Kamera → w kierunku miejsca, gdzie stoi Przemo, widać jego zdjęcie (jak na pętli).
// Wycelowanie → minigra w tenisa → nagranie Przema w tym samym kierunku
// (zaprasza na wysuszone boisko).

import { openAnchorView, playVideoMessage } from './anchor-view.js';
import { bearingTo } from './aim-arrow.js';

const PHOTO = 'src/przemo.jpg';          // placeholder – do podmiany na zdjęcie z kortu
const VIDEO = 'src/przemo-tenis.mp4';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function startKortScene({ origin, sceneTarget, onEnd }) {
  const bearing = bearingTo(origin, sceneTarget);
  const view = await openAnchorView({ hint: 'Rozejrzyj się – ktoś tu na Was czeka' });

  const img = document.createElement('img');
  img.src = PHOTO;
  img.alt = 'Przemo na korcie';
  const it = view.anchor(img, { bearing });
  view.guide(it);

  const result = await Promise.race([
    view.waitFound(it, { holdMs: 2000 }).then(() => 'found'),
    view.closed.then(() => 'closed'),
  ]);

  if (result === 'closed') { view.close(); onEnd && onEnd(); return; }

  if (navigator.vibrate) navigator.vibrate(80);
  view.setHint('Przemo zaprasza na partyjkę!');
  await sleep(2000);
  view.close();

  // Minigra w tenisa
  const mgMod = await import(new URL('js/minigame-tennis.js', document.baseURI).href);
  await mgMod.startTennisGame();

  // Nagranie Przema – tam, gdzie stał na korcie
  try {
    await playVideoMessage(VIDEO, {
      bearing, start: 'button', hint: 'Przemo ma Wam coś do powiedzenia',
    });
  } finally {
    onEnd && onEnd();
  }
}

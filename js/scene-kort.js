// Scena piątego punktu: Kort tenisowy
// Czarny ekran z sekwencją napisów → minigra w tenisa →
// nagranie Przema na kamerce w kierunku kortu (zaprasza na wysuszone boisko).

import { playVideoMessage } from './anchor-view.js';
import { bearingTo } from './aim-arrow.js';

const VIDEO = 'src/przemo-tenis.mp4';
const TEXTS = [
  'To jest jedno z ulubionych miejsc Zaspiańczyków',
  'oraz środowisko naturalne Romana',
  'Teraz zapraszam na trochę inną odmianę siatkotenisa z Przemem',
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fadeTo(el, opacity, ms) {
  el.style.transition = `opacity ${ms}ms ease`;
  el.style.opacity = String(opacity);
  return sleep(ms);
}

export async function startKortScene({ origin, sceneTarget, onEnd }) {
  try {
    // Czarny ekran z napisami
    const screen = document.createElement('div');
    screen.className = 'text-screen';
    const textEl = document.createElement('div');
    textEl.className = 'text-screen-line';
    textEl.style.opacity = '0';
    screen.appendChild(textEl);
    document.body.appendChild(screen);

    for (const line of TEXTS) {
      textEl.textContent = line;
      await fadeTo(textEl, 1, 700);
      await sleep(Math.max(3000, line.length * 70));
      await fadeTo(textEl, 0, 600);
    }

    // Minigra w tenisa (jej nakładka przykrywa czarny ekran)
    const mgMod = await import(new URL('js/minigame-tennis.js', document.baseURI).href);
    const game = mgMod.startTennisGame();
    await sleep(50);
    screen.remove();
    await game;

    // Nagranie Przema – na kamerce w kierunku kortu
    await playVideoMessage(VIDEO, {
      bearing: bearingTo(origin, sceneTarget),
      start: 'button',
      hint: 'Przemo ma Wam coś do powiedzenia',
    });
  } finally {
    onEnd && onEnd();
  }
}

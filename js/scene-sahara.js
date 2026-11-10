// Scena szóstego punktu: Sahara
// Kamera → w kierunku miejsca, gdzie kręci się Przemo, wisi zapętlone nagranie
// (przemo-sie-kreci.mp4), które przesuwa się przy obracaniu i pochylaniu telefonu.
// Po znalezieniu: napis o odpoczynku + przycisk "Już odpocząłem!" →
// nagranie przemo-sachara.mp4 w tym samym miejscu.

import { openAnchorView, playVideoMessage } from './anchor-view.js';
import { bearingTo } from './aim-arrow.js';

const SPIN_VIDEO  = 'src/przemo-sie-kreci.mp4';
const FINAL_VIDEO = 'src/przemo-sachara.mp4';
const REST_TEXT   = 'Tutaj możesz odpocząć przy kręcącym się Przemie';

export async function startSaharaScene({ origin, sceneTarget, onEnd }) {
  const bearing = bearingTo(origin, sceneTarget);
  const view = await openAnchorView({ hint: 'Rozejrzyj się – ktoś tu na Was czeka' });

  const spin = document.createElement('video');
  spin.src = SPIN_VIDEO;
  spin.loop = true;
  spin.muted = true;
  spin.setAttribute('playsinline', '');
  spin.setAttribute('webkit-playsinline', '');
  const it = view.anchor(spin, { bearing });
  view.guide(it);
  spin.play().catch(() => {});

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    view.close();
    onEnd && onEnd();
  };
  view.closed.then(finish);

  // Znaleziony → napis zostaje, pojawia się przycisk
  await view.waitFound(it);
  if (done) return;
  if (navigator.vibrate) navigator.vibrate(80);
  view.setHint(REST_TEXT);

  const restBtn = document.createElement('button');
  restBtn.className = 'sahara-rest-btn';
  restBtn.textContent = 'Już odpocząłem!';
  view.layer.appendChild(restBtn);

  restBtn.addEventListener('click', () => {
    restBtn.remove();
    view.unanchor(it);
    // Synchronicznie w kliknięciu – dźwięk działa także na iOS
    playVideoMessage(FINAL_VIDEO, { bearing, start: 'now', view }).then(finish);
  }, { once: true });
}

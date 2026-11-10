// Scena czwartego punktu: PZU
// Kamera → w kierunku miejsca, gdzie stoi Przemo, wisi jego nagranie
// (wita kolegów i zaprasza na siatkotenisa). Rusza, gdy gracz na nie spojrzy.

import { playVideoMessage } from './video-message.js';
import { bearingTo } from './aim-arrow.js';

const VIDEO = 'src/przemo-pzu.mp4';

export async function startPzuScene({ origin, sceneTarget, onEnd }) {
  await playVideoMessage(VIDEO, {
    bearing: bearingTo(origin, sceneTarget),
    start: 'onFound',
    hint: 'Rozejrzyj się – ktoś tu na Was czeka',
  });
  onEnd && onEnd();
}

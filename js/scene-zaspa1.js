// Scena drugiego punktu: Pętla tramwajowa
// Gracz włącza kamerę i celuje telefonem w kierunku miejsca, gdzie stoi Przemo.
// Po wycelowaniu pojawia się zdjęcie Przema, napis "Teraz trochę pogramy",
// odliczanie i minigra (obrona Przema). Po wygranej – podpowiedź do kolejnego punktu.

import { createAimArrow, turnHint } from './aim-arrow.js';

const DEG     = Math.PI / 180;
const HOLD_MS = 2000;   // ms trzymania celownika
const AIM_TOL = 20;     // stopnie tolerancji kompasowej
const H_FOV   = 60;     // przybliżony poziomy kąt widzenia kamery
const PHOTO   = 'src/przemo-petla-tramwajowa.png';

// ---------- Math ----------

function compassHeading(a, b, g) {
  const ax = b * DEG, ay = g * DEG, az = a * DEG;
  const cy = Math.cos(ay), cz = Math.cos(az);
  const sx = Math.sin(ax), sy = Math.sin(ay), sz = Math.sin(az);
  const vx = -cz * sy - sz * sx * cy;
  const vy = -sz * sy + cz * sx * cy;
  let h = Math.atan(vx / vy);
  if (vy < 0) h += Math.PI; else if (vx < 0) h += 2 * Math.PI;
  return h / DEG;
}

function bearingTo(from, to) {
  const dL   = (to.lng - from.lng) * DEG;
  const lat1 = from.lat * DEG, lat2 = to.lat * DEG;
  const y = Math.sin(dL) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dL);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

function angDiff(a, b) { return ((a - b + 540) % 360) - 180; }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fadeTo(el, opacity, ms) {
  el.style.transition = `opacity ${ms}ms ease`;
  el.style.opacity    = String(opacity);
  return sleep(ms);
}

// ---------- Główna funkcja ----------

export async function startZaspa1Scene({ origin, sceneTarget, overlay, onEnd, devMode }) {

  // iOS 13+: pozwolenie na czujniki (póki trwa gest użytkownika)
  let sensorsDenied = false;
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') sensorsDenied = true;
    } catch (_) { /* ignoruj */ }
  }

  // 1. Kamera
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } }, audio: false,
    });
  } catch (e) {
    throw new Error('Nie udało się otworzyć kamery: ' + (e.message || e));
  }
  const video = document.createElement('video');
  video.className = 'ar-video';
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.srcObject = stream;
  document.body.appendChild(video);
  await video.play();

  // 2. Overlay
  const topEl    = overlay.querySelector('.ar-top');
  const labelEl  = overlay.querySelector('.ar-label');
  const hintEl   = overlay.querySelector('.ar-hint');
  const xhair    = overlay.querySelector('.ar-crosshair');
  const bottomEl = overlay.querySelector('.ar-bottom');
  const ORIG_BOTTOM = bottomEl.innerHTML;

  labelEl.textContent = 'Rozejrzyj się – ktoś tu na Was czeka';
  hintEl.textContent  = 'Obróć telefon w stronę strzałki';
  bottomEl.innerHTML  = '<button class="ar-close" aria-label="Zamknij">✕</button>';
  overlay.classList.remove('hidden');

  const countEl = document.createElement('div');
  countEl.className = 'aim-count';
  xhair.appendChild(countEl);

  const arrow   = createAimArrow(overlay);
  const arrowEl = arrow.el;

  // Zdjęcie Przema – widoczne, gdy kamera patrzy w jego kierunku
  const przemoEl = document.createElement('img');
  przemoEl.src = PHOTO;
  przemoEl.alt = 'Przemo';
  przemoEl.className = 'zaspa1-przemo';
  przemoEl.style.opacity = '0';
  overlay.appendChild(przemoEl);

  let running   = true;
  let triggered = false;

  function restoreOverlay() {
    countEl.remove();
    arrowEl.remove();
    przemoEl.remove();
    xhair.classList.remove('aim-ready');
    for (const el of [xhair, topEl, bottomEl]) {
      el.style.opacity = '';
      el.style.transition = '';
    }
    bottomEl.style.pointerEvents = '';
    overlay.style.pointerEvents  = '';
    labelEl.textContent = '';
    hintEl.textContent  = '';
    bottomEl.innerHTML  = ORIG_BOTTOM;
    overlay.classList.add('hidden');
  }

  function stopSensors() {
    clearTimeout(compassFallbackTimer);
    if (orientEvtAbs) window.removeEventListener(orientEvtAbs, onOrientAbs);
    window.removeEventListener('deviceorientation', onOrientRel);
    overlay.removeEventListener('click', onTap);
  }

  function stopCamera() {
    stream.getTracks().forEach(t => t.stop());
    video.remove();
  }

  function finish() {
    if (!running) return;
    running = false;
    stopSensors();
    stopCamera();
    restoreOverlay();
    onEnd && onEnd();
  }

  bottomEl.querySelector('.ar-close').addEventListener('click', finish);

  // 3. Kompas – absolute, z fallbackiem na relative
  let heading = null;
  let gotAbsolute = false;
  const orientEvtAbs = 'ondeviceorientationabsolute' in window
    ? 'deviceorientationabsolute' : null;

  function onOrientAbs(e) {
    if (e.alpha == null) return;
    heading = compassHeading(e.alpha, e.beta, e.gamma);
    gotAbsolute = true;
  }
  function onOrientRel(e) {
    if (e.alpha == null || gotAbsolute) return;
    heading = compassHeading(e.alpha, e.beta, e.gamma);
  }
  if (orientEvtAbs) window.addEventListener(orientEvtAbs, onOrientAbs);
  window.addEventListener('deviceorientation', onOrientRel);

  function onTap() { triggerSequence(); }

  function enableTapMode(msg) {
    hintEl.textContent = msg;
    arrowEl.style.display = 'none';
    overlay.style.pointerEvents = 'auto';
    overlay.addEventListener('click', onTap, { once: true });
  }

  const compassFallbackTimer = setTimeout(() => {
    if (heading === null && running && !triggered) {
      enableTapMode('Brak kompasu – dotknij ekranu, aby kontynuować');
    }
  }, 3000);

  if (sensorsDenied) enableTapMode('Brak dostępu do kompasu – dotknij ekranu');
  else if (devMode) enableTapMode('[DEV] Dotknij ekranu, aby kontynuować');

  // 4. Celowanie
  const targetBearing = bearingTo(origin, sceneTarget);
  let aimStart = null;

  function aimLoop() {
    if (!running || triggered) return;
    if (heading !== null) {
      // diff > 0 → cel jest po lewej stronie
      const diff    = angDiff(heading, targetBearing);
      const absDiff = Math.abs(diff);
      const aimed   = absDiff <= AIM_TOL;

      // Zdjęcie przesuwa się po ekranie razem z obrotem telefonu
      przemoEl.style.left = (50 - (diff / H_FOV) * 100) + '%';
      const edge = H_FOV / 2 + 10;
      const vis  = absDiff >= edge ? 0
        : Math.min(1, 1 - (absDiff - AIM_TOL) / (edge - AIM_TOL));
      przemoEl.style.opacity = vis.toFixed(2);

      if (aimed) {
        arrowEl.style.display = 'none';
        if (!aimStart) aimStart = Date.now();
        const elapsed   = Date.now() - aimStart;
        const remaining = Math.ceil((HOLD_MS - elapsed) / 1000);
        xhair.classList.add('aim-ready');
        countEl.textContent = remaining > 0 ? String(remaining) : '';
        hintEl.textContent  = 'Jest! Trzymaj nieruchomo…';
        if (elapsed >= HOLD_MS) { triggerSequence(); return; }
      } else {
        arrow.update(diff);
        aimStart = null;
        xhair.classList.remove('aim-ready');
        countEl.textContent = '';
        if (!devMode) hintEl.textContent = turnHint(diff);
      }
    }
    requestAnimationFrame(aimLoop);
  }
  requestAnimationFrame(aimLoop);

  // 5. Sekwencja: zdjęcie → "Teraz trochę pogramy" → odliczanie → minigra
  function triggerSequence() {
    if (triggered || !running) return;
    triggered = true;
    stopSensors();
    arrowEl.style.display = 'none';
    bottomEl.style.pointerEvents = 'none';
    playSequence()
      .catch(err => console.error('Błąd sekwencji:', err))
      .finally(finish);
  }

  async function playSequence() {
    // Zdjęcie Przema na środku
    przemoEl.style.transition = 'left 0.6s ease, opacity 0.6s ease';
    przemoEl.style.left = '50%';
    przemoEl.style.opacity = '1';
    countEl.textContent = '';
    xhair.classList.remove('aim-ready');
    await Promise.all([
      fadeTo(topEl,    0, 300),
      fadeTo(bottomEl, 0, 300),
      fadeTo(xhair,    0, 300),
    ]);
    if (navigator.vibrate) navigator.vibrate(80);
    await sleep(3000);

    // Napis
    const textEl = document.createElement('div');
    textEl.className = 'brzezno-text';
    textEl.style.opacity = '0';
    textEl.textContent = 'Teraz trochę pogramy';
    overlay.appendChild(textEl);
    await fadeTo(textEl, 1, 700);
    await sleep(2200);
    await Promise.all([fadeTo(textEl, 0, 600), fadeTo(przemoEl, 0, 800)]);
    textEl.remove();

    // Odliczanie
    const cdEl = document.createElement('div');
    cdEl.className = 'zaspa1-countdown';
    overlay.appendChild(cdEl);
    for (const n of ['3', '2', '1', 'Start!']) {
      cdEl.innerHTML = `<span>${n}</span>`;
      await sleep(900);
    }
    cdEl.remove();

    // Kamera już niepotrzebna – minigra (z sekwencją wygranej i podpowiedzią dalej)
    stopCamera();
    restoreOverlay();
    const mg = await import(new URL('js/minigame.js', document.baseURI).href);
    await mg.startMiniGame();
  }
}

// Scena szóstego punktu: Sahara
// Gracz włącza kamerę i celuje w kierunku miejsca, gdzie kręci się Przemo.
// Zapętlone nagranie (przemo-sie-kreci.mp4) widać, gdy kamera patrzy w tę stronę,
// razem z napisem o odpoczynku. Przycisk "Już odpocząłem" → nagranie
// przemo-sachara.mp4 (z dźwiękiem) z podpowiedzią do kolejnego punktu.

import { createAimArrow, turnHint } from './aim-arrow.js';

const DEG     = Math.PI / 180;
const AIM_TOL = 20;    // stopnie – w tym zakresie nagranie jest w pełni widoczne
const H_FOV   = 60;    // przybliżony poziomy kąt widzenia kamery
const SPIN_VIDEO  = 'src/przemo-sie-kreci.mp4';
const FINAL_VIDEO = 'src/przemo-sachara.mp4';
const REST_TEXT   = 'Tutaj możesz odpocząć przy kręcącym się Przemie';

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

function makeVideo(src, { loop = false, muted = false } = {}) {
  const v = document.createElement('video');
  v.src = src;
  v.loop = loop;
  v.muted = muted;
  v.preload = 'auto';
  v.setAttribute('playsinline', '');
  v.setAttribute('webkit-playsinline', '');
  return v;
}

// ---------- Główna funkcja ----------

export async function startSaharaScene({ origin, sceneTarget, overlay, onEnd, devMode }) {

  // iOS 13+: pozwolenie na czujniki (póki trwa gest użytkownika)
  let sensorsDenied = false;
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') sensorsDenied = true;
    } catch (_) { /* ignoruj */ }
  }

  // Nagranie końcowe – wczytujemy z wyprzedzeniem
  const finalVid = makeVideo(FINAL_VIDEO);
  finalVid.className = 'sahara-video sahara-final';
  finalVid.load();

  // 1. Kamera
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } }, audio: false,
    });
  } catch (e) {
    throw new Error('Nie udało się otworzyć kamery: ' + (e.message || e));
  }
  const cam = document.createElement('video');
  cam.className = 'ar-video';
  cam.setAttribute('playsinline', '');
  cam.muted = true;
  cam.srcObject = stream;
  document.body.appendChild(cam);
  await cam.play();

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
  xhair.style.opacity = '0';

  const arrow = createAimArrow(overlay);

  // Zapętlony kręcący się Przemo – widoczny w kierunku celu
  const spinVid = makeVideo(SPIN_VIDEO, { loop: true, muted: true });
  spinVid.className = 'sahara-video';
  spinVid.style.opacity = '0';
  overlay.appendChild(spinVid);
  spinVid.play().catch(() => {});

  // Przycisk "Już odpocząłem!" – pojawia się po znalezieniu Przema
  const restBtn = document.createElement('button');
  restBtn.className = 'sahara-rest-btn';
  restBtn.textContent = 'Już odpocząłem!';
  restBtn.style.display = 'none';
  overlay.appendChild(restBtn);

  let running = true;
  let found   = false;
  let resting = true;   // faza z kręcącym się Przemem

  function stopSensors() {
    clearTimeout(compassFallbackTimer);
    if (orientEvtAbs) window.removeEventListener(orientEvtAbs, onOrientAbs);
    window.removeEventListener('deviceorientation', onOrientRel);
  }

  function finish() {
    if (!running) return;
    running = false;
    stopSensors();
    stream.getTracks().forEach(t => t.stop());
    cam.remove();
    spinVid.pause(); spinVid.remove();
    finalVid.pause(); finalVid.remove();
    arrow.remove();
    restBtn.remove();
    overlay.querySelectorAll('.sahara-end').forEach(el => el.remove());
    xhair.style.opacity = '';
    topEl.style.opacity = '';
    topEl.style.transition = '';
    overlay.style.pointerEvents = '';
    labelEl.textContent = '';
    hintEl.textContent  = '';
    bottomEl.innerHTML  = ORIG_BOTTOM;
    overlay.classList.add('hidden');
    onEnd && onEnd();
  }

  bottomEl.querySelector('.ar-close').addEventListener('click', finish);

  function markFound() {
    if (found) return;
    found = true;
    labelEl.textContent = REST_TEXT;
    hintEl.textContent  = '';
    restBtn.style.display = '';
    if (navigator.vibrate) navigator.vibrate(80);
  }

  // Bez kompasu – nagranie po prostu stoi na środku ekranu
  function showWithoutCompass(msg) {
    if (!resting) return;
    stopSensors();
    arrow.hide();
    spinVid.style.left = '50%';
    spinVid.style.opacity = '1';
    markFound();
    if (msg) hintEl.textContent = msg;
  }

  // 3. Kompas
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

  const compassFallbackTimer = setTimeout(() => {
    if (heading === null && running) showWithoutCompass('Brak kompasu');
  }, 3000);

  if (sensorsDenied || devMode) showWithoutCompass(devMode ? '[DEV] bez kompasu' : '');

  // 4. Pętla – nagranie podąża za kierunkiem celu
  const targetBearing = bearingTo(origin, sceneTarget);

  function loop() {
    if (!running || !resting) return;
    if (heading !== null && !devMode && !sensorsDenied) {
      const diff    = angDiff(heading, targetBearing); // > 0 → cel po lewej
      const absDiff = Math.abs(diff);

      spinVid.style.left = (50 - (diff / H_FOV) * 100) + '%';
      const edge = H_FOV / 2 + 10;
      const vis  = absDiff >= edge ? 0
        : Math.min(1, 1 - (absDiff - AIM_TOL) / (edge - AIM_TOL));
      spinVid.style.opacity = vis.toFixed(2);

      if (absDiff <= AIM_TOL) {
        arrow.hide();
        markFound();
      } else {
        arrow.update(diff);
        if (!found) hintEl.textContent = turnHint(diff);
      }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // 5. "Już odpocząłem!" → nagranie końcowe
  restBtn.addEventListener('click', async () => {
    if (!resting || !running) return;
    resting = false;
    stopSensors();
    arrow.remove();
    restBtn.remove();

    // Start odtwarzania od razu w geście kliknięcia (dźwięk na iOS)
    finalVid.style.opacity = '0';
    overlay.appendChild(finalVid);
    const playing = finalVid.play().catch(() => {
      // Autoplay z dźwiękiem zablokowany – grajmy wyciszone
      finalVid.muted = true;
      return finalVid.play().catch(() => {});
    });

    await Promise.all([
      fadeTo(topEl, 0, 400),
      fadeTo(spinVid, 0, 600),
    ]);
    spinVid.pause();
    await fadeTo(finalVid, 1, 600);
    await playing;

    await new Promise(res => {
      if (finalVid.ended) return res();
      finalVid.addEventListener('ended', res, { once: true });
      finalVid.addEventListener('error', res, { once: true });
    });
    if (!running) return;

    // Po nagraniu: obejrzyj jeszcze raz albo zamknij
    const endEl = document.createElement('div');
    endEl.className = 'sahara-end';
    endEl.innerHTML =
      '<button class="sahara-again">↺ Obejrzyj jeszcze raz</button>' +
      '<button class="sahara-done">Dalej</button>';
    overlay.appendChild(endEl);
    endEl.querySelector('.sahara-done').addEventListener('click', finish);
    endEl.querySelector('.sahara-again').addEventListener('click', () => {
      endEl.remove();
      finalVid.currentTime = 0;
      finalVid.play().catch(() => {});
      finalVid.addEventListener('ended', () => {
        if (running) overlay.appendChild(endEl);
      }, { once: true });
    });
  });
}

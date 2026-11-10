// Scena pierwszego punktu: Plaża Brzeźno
// Celowanie kompasem w punkt nad morzem przez 3 s → Przemo wyłania się z wody.

const DEG = Math.PI / 180;
const HOLD_MS  = 3000;  // ms trzymania celownika
const AIM_TOL  = 25;    // stopnie tolerancji kompasowej

// ---------- Math ----------

function compassHeading(a, b, g) {
  const ax = b * DEG, ay = g * DEG, az = a * DEG;
  const cx = Math.cos(ax), cy = Math.cos(ay), cz = Math.cos(az);
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

// ---------- Helpers ----------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fadeTo(el, opacity, ms) {
  el.style.transition = `opacity ${ms}ms ease`;
  el.style.opacity    = String(opacity);
  return sleep(ms);
}

// ---------- Treść sekwencji ----------

const INTRO_TEXTS = [
  'Dzień dobry',
  'To jest prezent dla Alberta i Matiego',
  'Ale to jest dopiero początek przygody',
  'Na szczęście będzie wam towarzyszyć Przemo',
];

const SPEECH =
  'gdy już skończy się impreza, musicie pójść na granicę Zaspy i Przymorza, ' +
  'gdzie podłużny poroznik kończy i zaczyna swój bieg';

// ---------- Główna funkcja ----------

export async function startBrzeznoScene({ origin, sceneTarget, overlay, onEnd, devMode }) {

  // 1. Otwórz kamerę
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
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

  // 2. Skonfiguruj overlay
  const topEl    = overlay.querySelector('.ar-top');
  const labelEl  = overlay.querySelector('.ar-label');
  const hintEl   = overlay.querySelector('.ar-hint');
  const xhair    = overlay.querySelector('.ar-crosshair');
  const bottomEl = overlay.querySelector('.ar-bottom');
  const ORIG_BOTTOM = bottomEl.innerHTML;

  labelEl.textContent = 'Wyceluj w punkt nad morzem';
  hintEl.textContent  = devMode
    ? '[DEV] Dotknij ekran, aby uruchomić sekwencję'
    : 'Obróć telefon w stronę strzałki';
  bottomEl.innerHTML  = '<button class="ar-close" aria-label="Zamknij">✕</button>';
  overlay.classList.remove('hidden');

  // Licznik w celowniku (3-2-1)
  const countEl = document.createElement('div');
  countEl.className = 'aim-count';
  xhair.appendChild(countEl);

  // Strzałka kierunku
  const arrowEl = document.createElement('div');
  arrowEl.className = 'aim-arrow';
  arrowEl.textContent = '▲';
  xhair.parentElement.appendChild(arrowEl);

  let running   = true;
  let triggered = false;

  function cleanup() {
    if (!running) return;
    running = false;
    window.removeEventListener(orientEvtAbs,  onOrientAbs);
    window.removeEventListener('deviceorientation', onOrientRel);
    clearTimeout(compassFallbackTimer);
    stream.getTracks().forEach(t => t.stop());
    video.remove();
    countEl.remove();
    arrowEl.remove();
    xhair.classList.remove('aim-ready');
    xhair.style.opacity    = '';
    topEl.style.opacity    = '';
    bottomEl.style.opacity = '';
    bottomEl.style.pointerEvents = '';
    labelEl.textContent = '';
    hintEl.textContent  = '';
    bottomEl.innerHTML  = ORIG_BOTTOM;
    overlay.classList.add('hidden');
    onEnd && onEnd();
  }

  bottomEl.querySelector('.ar-close').addEventListener('click', cleanup);

  // 3. Kompas – próbuj absolute, potem relative
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
    // Użyj nawet nieabsolutnych odczytów – na większości urządzeń
    // alpha i tak bazuje na kompasie
    heading = compassHeading(e.alpha, e.beta, e.gamma);
  }

  if (orientEvtAbs) window.addEventListener(orientEvtAbs, onOrientAbs);
  window.addEventListener('deviceorientation', onOrientRel);

  // iOS 13+: zapytaj o pozwolenie na czujniki
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') {
        hintEl.textContent = 'Brak dostępu do kompasu – dotknij ekranu';
        devMode = true;
      }
    } catch (_) { /* ignoruj */ }
  }

  // Fallback: jeśli kompas nie odpowiada w ciągu 5 s, włącz tryb tap
  const compassFallbackTimer = setTimeout(() => {
    if (heading === null && running && !triggered) {
      hintEl.textContent = 'Brak kompasu – dotknij ekranu, aby uruchomić';
      arrowEl.style.display = 'none';
      overlay.addEventListener('click', onTap, { once: true });
    }
  }, 5000);

  // 4. Trigger sekwencji
  const targetBearing = bearingTo(origin, sceneTarget);
  let aimStart = null;

  function triggerSequence() {
    if (triggered || !running) return;
    triggered = true;
    clearTimeout(compassFallbackTimer);
    window.removeEventListener(orientEvtAbs, onOrientAbs);
    window.removeEventListener('deviceorientation', onOrientRel);
    overlay.removeEventListener('click', onTap);
    arrowEl.style.display = 'none';
    bottomEl.style.pointerEvents = 'none';
    playSequence().then(cleanup).catch(err => {
      console.error('Błąd sekwencji:', err);
      cleanup();
    });
  }

  function onTap() { triggerSequence(); }

  if (devMode) {
    overlay.addEventListener('click', onTap, { once: true });
  }

  // 5. Pętla celowania ze strzałką kierunkową
  function aimLoop() {
    if (!running || triggered) return;
    if (heading !== null) {
      const diff  = angDiff(heading, targetBearing);
      const absDiff = Math.abs(diff);
      const aimed = absDiff <= AIM_TOL;

      // Strzałka wskazuje kierunek celu
      if (absDiff > AIM_TOL) {
        arrowEl.style.display = '';
        arrowEl.style.transform = `translate(-50%, -50%) rotate(${diff}deg)`;
        arrowEl.style.opacity = Math.min(1, absDiff / 30).toFixed(2);
      } else {
        arrowEl.style.display = 'none';
      }

      if (aimed) {
        if (!aimStart) aimStart = Date.now();
        const elapsed   = Date.now() - aimStart;
        const remaining = Math.ceil((HOLD_MS - elapsed) / 1000);
        xhair.classList.add('aim-ready');
        countEl.textContent = remaining > 0 ? String(remaining) : '';
        hintEl.textContent = 'Trzymaj nieruchomo…';
        if (elapsed >= HOLD_MS) { triggerSequence(); return; }
      } else {
        aimStart = null;
        xhair.classList.remove('aim-ready');
        countEl.textContent = '';
        hintEl.textContent = diff > 0 ? 'Obróć w prawo →' : '← Obróć w lewo';
      }
    }
    requestAnimationFrame(aimLoop);
  }
  if (!devMode) requestAnimationFrame(aimLoop);

  // 6. Sekwencja narracyjna
  async function playSequence() {
    await Promise.all([
      fadeTo(topEl,    0, 300),
      fadeTo(bottomEl, 0, 300),
      fadeTo(xhair,    0, 300),
    ]);

    const seq = document.createElement('div');
    seq.className   = 'brzezno-seq';
    seq.style.opacity = '1';
    overlay.appendChild(seq);

    // --- Przemo wyłania się z wody (1. pojawienie) ---
    const przemoWrap = document.createElement('div');
    przemoWrap.className = 'przemo-wrap';
    przemoWrap.innerHTML = '<img src="src/przemo.jpg" class="przemo-img" alt="Przemo">';
    seq.appendChild(przemoWrap);

    await sleep(80);
    przemoWrap.classList.add('risen');
    await sleep(2200);
    await sleep(600);

    // Przemo odpływa
    przemoWrap.classList.remove('risen');
    await sleep(2200);

    // --- Sekwencja tekstów ---
    const textEl = document.createElement('div');
    textEl.className     = 'brzezno-text';
    textEl.style.opacity = '0';
    seq.appendChild(textEl);

    for (const msg of INTRO_TEXTS) {
      textEl.textContent = msg;
      await fadeTo(textEl, 1, 700);
      await sleep(1800);
      await fadeTo(textEl, 0, 700);
      await sleep(400);
    }

    // --- Przemo wraca (2. pojawienie) ---
    przemoWrap.style.opacity = '1';
    await sleep(80);
    przemoWrap.classList.add('risen');
    await sleep(1800);

    // Dymek z tekstem Przema
    const speechEl = document.createElement('div');
    speechEl.className     = 'przemo-speech';
    speechEl.textContent   = SPEECH;
    speechEl.style.opacity = '0';
    seq.appendChild(speechEl);

    await fadeTo(speechEl, 1, 800);
    await sleep(5500);

    // Przemo znika razem z dymkiem
    await Promise.all([
      fadeTo(speechEl,  0,  800),
      fadeTo(przemoWrap, 0, 1400),
    ]);
    await sleep(400);

    // Zanikanie całej sekwencji
    await fadeTo(seq, 0, 700);
    seq.remove();
  }
}

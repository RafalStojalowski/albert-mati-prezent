// Wspólny widok kamery ze zdjęciami / nagraniami "zawieszonymi" w przestrzeni.
// Element stoi w danym kierunku (azymut) na wysokości horyzontu i przesuwa się
// po ekranie przy obracaniu i pochylaniu telefonu – tak jak Przemo na pętli.
// Gdy prowadzony element jest poza ekranem, strzałka i podpowiedź pokazują drogę.
//
//   const view = await openAnchorView({ hint: '…' });
//   const item = view.anchor(imgOrVideo, { bearing });   // bearing null → przed graczem
//   view.guide(item);
//   await view.waitFound(item, { holdMs: 2000 });
//   …
//   view.close();

import {
  createAimArrow, turnHint, tiltHint,
  compassHeading, angDiff, cameraElevation, screenFov,
} from './aim-arrow.js';

const NO_COMPASS_MS = 3000;

export async function openAnchorView({ ownCamera = true, hint = '' } = {}) {
  // ---------- Czujniki (iOS: prośba o zgodę jak najwcześniej w geście) ----------
  let denied = false;
  function requestSensors() {
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      return DeviceOrientationEvent.requestPermission()
        .then(r => { denied = r !== 'granted'; })
        .catch(() => {});
    }
    return Promise.resolve();
  }
  const permP = requestSensors();

  // ---------- Warstwa ----------
  const layer = document.createElement('div');
  layer.className = 'vm-layer';

  const hintEl = document.createElement('div');
  hintEl.className = 'vm-hint';
  layer.appendChild(hintEl);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'vm-close';
  closeBtn.setAttribute('aria-label', 'Zamknij');
  closeBtn.textContent = '✕';
  layer.appendChild(closeBtn);

  const controls = document.createElement('div');
  controls.className = 'vm-controls';
  layer.appendChild(controls);

  const arrow = createAimArrow(layer);

  // ---------- Kamera ----------
  let stream = null;
  let cam = null;
  if (ownCamera) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }, audio: false,
      });
    } catch (e) {
      throw new Error('Nie udało się otworzyć kamery: ' + (e.message || e));
    }
    cam = document.createElement('video');
    cam.className = 'ar-video';
    cam.setAttribute('playsinline', '');
    cam.muted = true;
    cam.srcObject = stream;
    document.body.appendChild(cam);
    cam.play().catch(() => {});
  }
  document.body.appendChild(layer);
  await permP;

  // ---------- Orientacja ----------
  let heading = null;
  let elevation = 0;
  let gotAbsolute = false;
  const openedAt = performance.now();
  const orientEvtAbs = 'ondeviceorientationabsolute' in window
    ? 'deviceorientationabsolute' : null;
  function onOrientAbs(e) {
    if (e.alpha == null) return;
    heading   = compassHeading(e.alpha, e.beta, e.gamma);
    elevation = cameraElevation(e.beta, e.gamma);
    gotAbsolute = true;
  }
  function onOrientRel(e) {
    if (e.alpha == null || gotAbsolute) return;
    heading   = compassHeading(e.alpha, e.beta, e.gamma);
    elevation = cameraElevation(e.beta, e.gamma);
  }
  if (orientEvtAbs) window.addEventListener(orientEvtAbs, onOrientAbs);
  window.addEventListener('deviceorientation', onOrientRel);

  // Brak kompasu – elementy po prostu na środku ekranu
  function noCompass() {
    return denied || (heading === null && performance.now() - openedAt > NO_COMPASS_MS);
  }

  // ---------- Elementy ----------
  const items = [];
  let guided = null;
  let baseHint = hint;
  let running = true;

  function setHint(t) {
    hintEl.textContent = t || '';
    hintEl.style.display = t ? '' : 'none';
  }
  setHint(hint);

  function anchor(el, { bearing = null, elev = 0 } = {}) {
    el.classList.add('vm-media');
    layer.insertBefore(el, hintEl);
    const it = { el, bearing, elev, diff: 0, vDiff: 0, inView: false, centered: false };
    items.push(it);
    return it;
  }

  function unanchor(it) {
    const i = items.indexOf(it);
    if (i >= 0) items.splice(i, 1);
    if (guided === it) guided = null;
    it.el.remove();
  }

  function loop() {
    if (!running) return;
    const fov = screenFov();
    const nc  = noCompass();

    for (const it of items) {
      if (nc || heading === null) {
        // bez kompasu – na środku; czekając na pierwszy odczyt – ukryty
        it.el.style.left = '50%';
        it.el.style.top  = '50%';
        it.el.style.visibility = nc ? 'visible' : 'hidden';
        it.inView = it.centered = nc;
        continue;
      }
      if (it.bearing === null) it.bearing = heading;   // zawieś przed graczem
      it.diff  = angDiff(heading, it.bearing);         // > 0 → element po lewej
      it.vDiff = elevation - it.elev;                  // > 0 → telefon za wysoko
      it.el.style.left = (50 - (it.diff  / fov.h) * 100) + '%';
      it.el.style.top  = (50 + (it.vDiff / fov.v) * 100) + '%';
      it.el.style.visibility = Math.abs(it.diff) < 90 ? 'visible' : 'hidden';
      it.inView   = Math.abs(it.diff) < fov.h / 2 && Math.abs(it.vDiff) < fov.v / 2;
      it.centered = Math.abs(it.diff) < 20 && Math.abs(it.vDiff) < 15;
    }

    // Strzałka do prowadzonego elementu
    if (guided && !nc && heading !== null) {
      if (Math.abs(guided.diff) > fov.h / 2) {
        arrow.update(guided.diff);
        setHint(turnHint(guided.diff));
      } else if (Math.abs(guided.vDiff) > fov.v / 2) {
        arrow.point(guided.vDiff > 0 ? 'down' : 'up', Math.abs(guided.vDiff));
        setHint(tiltHint(guided.vDiff));
      } else {
        arrow.hide();
        setHint(baseHint);
      }
    } else {
      arrow.hide();
      setHint(baseHint);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Czeka, aż element będzie na środku ekranu przez holdMs
  function waitFound(it, { holdMs = 0, holdHint = 'Jest! Trzymaj nieruchomo…' } = {}) {
    return new Promise(res => {
      let since = null;
      const saved = baseHint;
      (function check() {
        if (!running) return;
        if (it.centered) {
          if (since === null) since = performance.now();
          if (holdMs && holdHint) baseHint = holdHint;
          if (performance.now() - since >= holdMs) {
            baseHint = saved;
            res();
            return;
          }
        } else {
          since = null;
          baseHint = saved;
        }
        requestAnimationFrame(check);
      })();
    });
  }

  // ✕ – Promise kończy się po kliknięciu
  const closed = new Promise(res => closeBtn.addEventListener('click', res, { once: true }));

  function close() {
    if (!running) return;
    running = false;
    if (orientEvtAbs) window.removeEventListener(orientEvtAbs, onOrientAbs);
    window.removeEventListener('deviceorientation', onOrientRel);
    for (const it of items) if (it.el.pause) it.el.pause();
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (cam) cam.remove();
    layer.remove();
  }

  return {
    layer, controls, closed,
    anchor, unanchor, waitFound, close, requestSensors,
    guide(it) { guided = it; },
    setHint(t) { baseHint = t || ''; },
    get running() { return running; },
  };
}

// ---------- Nagranie Przema w widoku ----------
// Odtwarza nagranie zawieszone w przestrzeni; po końcu: "Obejrzyj jeszcze raz" / "Dalej".
//   start: 'button'  – przycisk "▶ Odtwórz nagranie"
//          'now'     – od razu (wywołać synchronicznie w obsłudze kliknięcia,
//                      z view przekazanym przez scenę)
//          'onFound' – gdy gracz skieruje telefon na nagranie
//   view:  istniejący widok sceny (nie jest zamykany po nagraniu)
// Kończy się po "Dalej" lub ✕.

export function playVideoMessage(src, {
  bearing = null, start = 'button', hint = '', view = null,
} = {}) {
  const vid = document.createElement('video');
  vid.src = src;
  vid.preload = 'auto';
  vid.setAttribute('playsinline', '');
  vid.setAttribute('webkit-playsinline', '');

  // Tryb 'now' – start synchroniczny, w geście (dźwięk na iOS)
  let playP = null;
  if (start === 'now') playP = vid.play();

  return (async () => {
    const ownView = !view;
    const v = view || await openAnchorView({ hint });
    if (!ownView) v.setHint(hint);
    let started = start === 'now';
    if (start === 'button') vid.style.opacity = '0';

    // przy trybie 'button' nagranie zawiesza się dopiero po kliknięciu
    let it = start === 'button' ? null : v.anchor(vid, { bearing });
    if (it) v.guide(it);

    return new Promise(resolve => {
      function finish() {
        vid.pause();
        if (ownView) v.close();
        else { if (it) v.unanchor(it); v.controls.innerHTML = ''; }
        resolve();
      }

      function play() {
        started = true;
        v.controls.innerHTML = '';
        vid.muted = false;
        vid.style.opacity = '1';
        if (!it) { it = v.anchor(vid, { bearing }); v.guide(it); }
        vid.play().catch(() => {
          v.controls.innerHTML = '<button class="vm-primary vm-play">▶ Odtwórz nagranie</button>';
        });
      }

      v.controls.onclick = (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.classList.contains('vm-play')) { v.requestSensors(); play(); }
        else if (b.classList.contains('vm-again')) { vid.currentTime = 0; play(); }
        else if (b.classList.contains('vm-done')) finish();
      };
      v.closed.then(finish);

      vid.addEventListener('ended', () => {
        v.controls.innerHTML =
          '<button class="vm-again">↺ Obejrzyj jeszcze raz</button>' +
          '<button class="vm-primary vm-done">Dalej</button>';
      });
      vid.addEventListener('error', () => {
        v.controls.innerHTML = '<button class="vm-primary vm-done">Dalej</button>';
      });

      if (start === 'button') {
        v.controls.innerHTML = '<button class="vm-primary vm-play">▶ Odtwórz nagranie</button>';
      } else if (start === 'now') {
        playP && playP.catch(() => {
          v.controls.innerHTML = '<button class="vm-primary vm-play">▶ Odtwórz nagranie</button>';
        });
      } else {
        // 'onFound' – rusza, gdy nagranie znajdzie się na środku ekranu
        v.waitFound(it).then(() => {
          if (started) return;
          if (navigator.vibrate) navigator.vibrate(80);
          v.setHint('');
          play();
        });
      }
    });
  })();
}

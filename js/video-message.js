// Wspólny odtwarzacz nagrań Przema na kamerce.
// Nagranie jest "zawieszone" w przestrzeni jak zdjęcie Przema na pętli:
// przesuwa się po ekranie przy obracaniu i pochylaniu telefonu, a gdy
// zniknie z ekranu – strzałka pokazuje, gdzie jest.
//
// Opcje:
//   bearing   – azymut (stopnie), w którym stoi nagranie; null → kierunek,
//               w który patrzy telefon w chwili startu
//   ownCamera – true: odtwarzacz sam włącza/wyłącza kamerę;
//               false: scena ma już włączoną kamerę
//   start     – 'button'  – przycisk "▶ Odtwórz nagranie" (np. po minigrze)
//               'now'     – od razu (wywołać synchronicznie w obsłudze kliknięcia)
//               'onFound' – gdy gracz skieruje telefon na nagranie
//   hint      – tekst na górze ekranu, zanim nagranie ruszy
// Zwraca Promise, który kończy się po "Dalej" albo ✕.

import {
  createAimArrow, turnHint, tiltHint,
  compassHeading, angDiff, cameraElevation, screenFov,
} from './aim-arrow.js';

const TARGET_ELEV = 0;

export function playVideoMessage(src, {
  bearing = null, ownCamera = true, start = 'button', hint = '',
} = {}) {
  return new Promise(resolve => {
    // ---------- Elementy ----------
    const layer = document.createElement('div');
    layer.className = 'vm-layer';

    const vid = document.createElement('video');
    vid.className = 'vm-video';
    vid.src = src;
    vid.preload = 'auto';
    vid.setAttribute('playsinline', '');
    vid.setAttribute('webkit-playsinline', '');
    vid.style.opacity = '0';
    layer.appendChild(vid);

    const arrow = createAimArrow(layer);

    const hintEl = document.createElement('div');
    hintEl.className = 'vm-hint';
    hintEl.textContent = hint;
    hintEl.style.display = hint ? '' : 'none';
    layer.appendChild(hintEl);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'vm-close';
    closeBtn.setAttribute('aria-label', 'Zamknij');
    closeBtn.textContent = '✕';
    layer.appendChild(closeBtn);

    const controls = document.createElement('div');
    controls.className = 'vm-controls';
    layer.appendChild(controls);

    document.body.appendChild(layer);

    // ---------- Stan ----------
    let running   = true;
    let started   = false;      // nagranie zostało uruchomione
    let heading   = null;
    let elevation = 0;
    let gotAbsolute = false;
    let anchor    = bearing;    // azymut nagrania
    let noCompass = false;
    let stream    = null;
    let cam       = null;

    function setHint(t) {
      hintEl.textContent = t;
      hintEl.style.display = t ? '' : 'none';
    }

    function showButtons(html) {
      controls.innerHTML = html;
    }

    // ---------- Kamera ----------
    if (ownCamera) {
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }, audio: false,
      }).then(s => {
        if (!running) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        cam = document.createElement('video');
        cam.className = 'ar-video';
        cam.setAttribute('playsinline', '');
        cam.muted = true;
        cam.srcObject = s;
        document.body.insertBefore(cam, layer);
        cam.play().catch(() => {});
      }).catch(() => {
        layer.classList.add('no-camera');
      });
    }

    // ---------- Czujniki ----------
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
    let sensorsOn = false;
    function startSensors() {
      if (sensorsOn) return;
      sensorsOn = true;
      // iOS 13+ – wywołane synchronicznie w geście użytkownika
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
          .then(r => { if (r !== 'granted') noCompass = true; })
          .catch(() => {});
      }
      if (orientEvtAbs) window.addEventListener(orientEvtAbs, onOrientAbs);
      window.addEventListener('deviceorientation', onOrientRel);
      setTimeout(() => { if (heading === null) noCompass = true; }, 3000);
    }

    // ---------- Odtwarzanie ----------
    function play() {
      started = true;
      controls.innerHTML = '';
      vid.muted = false;
      vid.style.opacity = '1';
      vid.play().catch(() => {
        // Przeglądarka zablokowała dźwięk bez gestu – poproś o kliknięcie
        showButtons('<button class="vm-primary vm-play">▶ Odtwórz nagranie</button>');
      });
    }

    controls.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.classList.contains('vm-play')) { startSensors(); play(); }
      else if (b.classList.contains('vm-again')) { vid.currentTime = 0; play(); }
      else if (b.classList.contains('vm-done')) finish();
    });
    closeBtn.addEventListener('click', finish);

    vid.addEventListener('ended', () => {
      showButtons(
        '<button class="vm-again">↺ Obejrzyj jeszcze raz</button>' +
        '<button class="vm-primary vm-done">Dalej</button>');
    });
    vid.addEventListener('error', () => {
      showButtons('<button class="vm-primary vm-done">Dalej</button>');
    });

    if (start === 'now') {
      startSensors();
      play();                         // synchronicznie – w geście kliknięcia
    } else if (start === 'button') {
      showButtons('<button class="vm-primary vm-play">▶ Odtwórz nagranie</button>');
    } else {                          // 'onFound'
      startSensors();
      vid.style.opacity = '1';        // pierwsza klatka czeka w swoim miejscu
    }

    // ---------- Pętla pozycjonowania ----------
    function loop() {
      if (!running) return;

      if (noCompass || (heading === null && !sensorsOn)) {
        // Bez kompasu (lub przed startem w trybie 'button') – na środku
        vid.style.left = '50%';
        vid.style.top  = '50%';
        arrow.hide();
        if (noCompass && start === 'onFound' && !started) play();
      } else if (heading !== null) {
        if (anchor === null) anchor = heading;   // zawieś przed graczem
        const diff  = angDiff(heading, anchor);  // > 0 → nagranie po lewej
        const vDiff = elevation - TARGET_ELEV;   // > 0 → telefon za wysoko
        const fov   = screenFov();

        vid.style.left = (50 - (diff  / fov.h) * 100) + '%';
        vid.style.top  = (50 + (vDiff / fov.v) * 100) + '%';
        vid.style.visibility = Math.abs(diff) < 90 ? 'visible' : 'hidden';

        const offH = Math.abs(diff)  > fov.h / 2;
        const offV = Math.abs(vDiff) > fov.v / 2;
        if (offH) {
          arrow.update(diff);
          setHint(turnHint(diff));
        } else if (offV) {
          arrow.point(vDiff > 0 ? 'down' : 'up', Math.abs(vDiff));
          setHint(tiltHint(vDiff));
        } else {
          arrow.hide();
          setHint(started ? '' : hint);
          if (start === 'onFound' && !started &&
              Math.abs(diff) < fov.h * 0.3 && Math.abs(vDiff) < fov.v * 0.3) {
            if (navigator.vibrate) navigator.vibrate(80);
            play();
          }
        }
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    // ---------- Koniec ----------
    function finish() {
      if (!running) return;
      running = false;
      vid.pause();
      if (orientEvtAbs) window.removeEventListener(orientEvtAbs, onOrientAbs);
      window.removeEventListener('deviceorientation', onOrientRel);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (cam) cam.remove();
      layer.remove();
      resolve();
    }
  });
}

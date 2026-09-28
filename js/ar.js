// Widok AR: zdjęcia zawieszone nad konkretnymi miejscami (współrzędne GPS).
// Tryb główny: WebXR (Chrome na Androidzie z ARCore) – stabilne śledzenie ruchu telefonu.
// Tryb zapasowy: obraz z kamery + czujniki orientacji (mniej stabilny).
// Kierunek ustawia wstępnie kompas, a dokładnie – kalibracja przez gracza.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const EYE_HEIGHT = 1.5;       // m – wysokość telefonu nad ziemią
const MAX_TEXTURE = 1024;     // px – dłuższy bok tekstury
const DEG = Math.PI / 180;

// ---------- Geografia ----------

// Przesunięcie w metrach: x = wschód, north = północ
function geoOffset(from, to) {
  const x = (to.lng - from.lng) * Math.cos(from.lat * DEG) * 111320;
  const north = (to.lat - from.lat) * 110540;
  return { x, north };
}

function bearingDeg(from, to) {
  const { x, north } = geoOffset(from, to);
  return (Math.atan2(x, north) / DEG + 360) % 360;
}

// Kierunek kompasowy tylnej kamery z deviceorientationabsolute (wzór z W3C)
function compassHeading(alpha, beta, gamma) {
  const x = beta * DEG, y = gamma * DEG, z = alpha * DEG;
  const cX = Math.cos(x), cY = Math.cos(y), cZ = Math.cos(z);
  const sX = Math.sin(x), sY = Math.sin(y), sZ = Math.sin(z);
  const vx = -cZ * sY - sZ * sX * cY;
  const vy = -sZ * sY + cZ * sX * cY;
  let h = Math.atan(vx / vy);
  if (vy < 0) h += Math.PI;
  else if (vx < 0) h += 2 * Math.PI;
  return h / DEG;
}

// Kąt (w stopniach, zgodnie z ruchem wskazówek zegara od -Z) kierunku patrzenia kamery
function yawFromQuaternion(q) {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return (Math.atan2(f.x, -f.z) / DEG + 360) % 360;
}

function normDeg(a) {
  return ((a % 360) + 540) % 360 - 180; // -180..180
}

function circularMeanDeg(values) {
  let s = 0, c = 0;
  values.forEach((v) => { s += Math.sin(v * DEG); c += Math.cos(v * DEG); });
  return Math.atan2(s, c) / DEG;
}

// ---------- Tekstury ----------

function loadImageTexture(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_TEXTURE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      resolve({ texture: tex, aspect: canvas.height / canvas.width });
    };
    img.onerror = () => reject(new Error('Nie udało się wczytać ' + url));
    img.src = url;
  });
}

// ---------- Kompas (nasłuch w tle) ----------

function createCompass() {
  const state = { heading: null, time: 0, alpha: null, beta: null, gamma: null };
  const eventName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  function onOrient(e) {
    if (e.alpha == null) return;
    if (eventName === 'deviceorientation' && !e.absolute) return;
    state.alpha = e.alpha; state.beta = e.beta; state.gamma = e.gamma;
    state.heading = compassHeading(e.alpha, e.beta, e.gamma);
    state.time = performance.now();
  }
  window.addEventListener(eventName, onOrient);
  state.stop = () => window.removeEventListener(eventName, onOrient);
  return state;
}

// ---------- Wspólna scena ----------

async function buildScene(origin, targets) {
  const scene = new THREE.Scene();
  // Grupa w układzie geograficznym: x = wschód, -z = północ. Obrót grupy = kalibracja.
  const geoGroup = new THREE.Group();
  scene.add(geoGroup);

  const items = [];
  for (const t of targets) {
    const { texture, aspect } = await loadImageTexture(t.image);
    const w = t.width || 10;
    const h = w * aspect;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true })
    );
    const { x, north } = geoOffset(origin, t);
    mesh.position.set(x, (t.elevation || 0) + h / 2 - EYE_HEIGHT, -north);
    geoGroup.add(mesh);
    items.push({
      target: t,
      mesh,
      bearing: bearingDeg(origin, t),
      distance: Math.hypot(x, north),
    });
  }
  return { scene, geoGroup, items };
}

// Zdjęcie zawsze zwrócone przodem do gracza (obrót tylko w poziomie)
const _camPos = new THREE.Vector3();
const _meshPos = new THREE.Vector3();
function faceCamera(items, camera) {
  camera.getWorldPosition(_camPos);
  items.forEach(({ mesh }) => {
    mesh.getWorldPosition(_meshPos);
    mesh.lookAt(_camPos.x, _meshPos.y, _camPos.z);
  });
}

// ---------- Nakładka z przyciskami ----------

function setupOverlay(overlay, handlers) {
  const label = overlay.querySelector('.ar-label');
  const hint = overlay.querySelector('.ar-hint');
  const on = (sel, fn) => {
    const el = overlay.querySelector(sel);
    const h = (e) => { e.stopPropagation(); fn(); };
    el.addEventListener('click', h);
    return () => el.removeEventListener('click', h);
  };
  const offs = [
    on('.ar-calibrate', handlers.calibrate),
    on('.ar-left', () => handlers.nudge(-1)),
    on('.ar-right', () => handlers.nudge(1)),
    on('.ar-close', handlers.close),
  ];
  label.textContent = '';
  hint.textContent = 'Uruchamiam kamerę…';
  overlay.classList.remove('hidden');
  return {
    setLabel: (text) => { label.textContent = text; },
    setHint: (text) => { hint.textContent = text; },
    dispose: () => { offs.forEach((f) => f()); overlay.classList.add('hidden'); },
  };
}

function labelFor(item) {
  return `${item.target.name} – ${Math.round(item.distance)} m`;
}

// ---------- Tryb WebXR ----------

async function startWebXR({ origin, targets, overlay, onEnd }) {
  let session = null;
  let main = null;            // pierwszy cel – do niego kalibrujemy
  let geoGroup = null;
  let offset = null;          // stopnie: kąt sceny XR minus kierunek geograficzny
  let currentYaw = 0;

  const applyOffset = () => { if (geoGroup) geoGroup.rotation.y = -offset * DEG; };

  const ui = setupOverlay(overlay, {
    calibrate: () => {
      if (!main) return;
      offset = normDeg(currentYaw - main.bearing);
      applyOffset();
      ui.setHint('Skalibrowano. W razie potrzeby popraw strzałkami.');
    },
    nudge: (d) => {
      if (offset == null) return;
      offset = normDeg(offset + d);
      applyOffset();
    },
    close: () => session && session.end(),
  });

  const compass = createCompass();
  const preHeading = compass.heading;

  // Sesję trzeba poprosić od razu – Chrome wymaga świeżego stuknięcia gracza
  try {
    session = await navigator.xr.requestSession('immersive-ar', {
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: overlay },
    });
  } catch (e) {
    compass.stop();
    ui.dispose();
    throw e;
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  renderer.domElement.style.display = 'none';
  document.body.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);

  session.addEventListener('end', () => {
    renderer.setAnimationLoop(null);
    compass.stop();
    ui.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    onEnd && onEnd();
  });

  let built;
  try {
    await renderer.xr.setSession(session);
    built = await buildScene(origin, targets);
  } catch (e) {
    session.end();
    throw e;
  }
  const { scene, items } = built;
  geoGroup = built.geoGroup;
  main = items[0];
  ui.setLabel(labelFor(main));
  ui.setHint('Ustalam kierunek… Trzymaj telefon pionowo.');

  const samples = [];
  const startTime = performance.now();

  renderer.setAnimationLoop((time, frame) => {
    const pose = frame && frame.getViewerPose(renderer.xr.getReferenceSpace());
    if (pose) {
      const o = pose.transform.orientation;
      currentYaw = yawFromQuaternion(new THREE.Quaternion(o.x, o.y, o.z, o.w));

      // Wstępne wyrównanie do północy na podstawie kompasu
      if (offset == null) {
        const now = performance.now();
        if (compass.heading != null && now - compass.time < 300) {
          samples.push(normDeg(currentYaw - compass.heading));
        }
        if (samples.length >= 20) {
          offset = circularMeanDeg(samples);
        } else if (now - startTime > 2500) {
          // Kompas nie działa w trakcie sesji – bierzemy odczyt sprzed startu,
          // a bez niego stawiamy zdjęcie przed graczem
          offset = preHeading != null
            ? normDeg(currentYaw - preHeading)
            : normDeg(currentYaw - main.bearing);
        }
        if (offset != null) {
          applyOffset();
          ui.setHint(`Wyceluj środek ekranu w: ${main.target.name} i stuknij „Kalibruj”.`);
        }
      }
    }
    geoGroup.visible = offset != null;
    faceCamera(items, renderer.xr.getCamera());
    renderer.render(scene, camera);
  });
}

// ---------- Tryb zapasowy: kamera + czujniki ----------

async function startFallback({ origin, targets, overlay, onEnd }) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false,
  });
  const compass = createCompass();

  const video = document.createElement('video');
  video.className = 'ar-video';
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.srcObject = stream;
  document.body.appendChild(video);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.className = 'ar-canvas';
  document.body.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);

  let running = true;
  let main = null;
  let geoGroup = null;
  let offset = 0;
  const applyOffset = () => { if (geoGroup) geoGroup.rotation.y = -offset * DEG; };

  const ui = setupOverlay(overlay, {
    calibrate: () => {
      if (!main) return;
      offset = normDeg(yawFromQuaternion(camera.quaternion) - main.bearing);
      applyOffset();
      ui.setHint('Skalibrowano. W razie potrzeby popraw strzałkami.');
    },
    nudge: (d) => { offset = normDeg(offset + d); applyOffset(); },
    close: () => stop(),
  });

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  function stop() {
    if (!running) return;
    running = false;
    compass.stop();
    ui.dispose();
    window.removeEventListener('resize', onResize);
    stream.getTracks().forEach((t) => t.stop());
    video.remove();
    renderer.dispose();
    renderer.domElement.remove();
    onEnd && onEnd();
  }

  let built;
  try {
    await video.play();
    built = await buildScene(origin, targets);
  } catch (e) {
    stop();
    throw e;
  }
  const { scene, items } = built;
  geoGroup = built.geoGroup;
  main = items[0];
  ui.setLabel(labelFor(main));
  ui.setHint(`Tryb uproszczony. Wyceluj w: ${main.target.name} i stuknij „Kalibruj”.`);

  // Orientacja kamery z czujników (jak w DeviceOrientationControls z three.js)
  const euler = new THREE.Euler();
  const q0 = new THREE.Quaternion();
  const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
  const zee = new THREE.Vector3(0, 0, 1);
  const targetQ = new THREE.Quaternion();
  let hasOrientation = false;

  function loop() {
    if (!running) return;
    if (compass.alpha != null) {
      const orient = (screen.orientation ? screen.orientation.angle : window.orientation || 0) * DEG;
      euler.set(compass.beta * DEG, compass.alpha * DEG, -compass.gamma * DEG, 'YXZ');
      targetQ.setFromEuler(euler).multiply(q1).multiply(q0.setFromAxisAngle(zee, -orient));
      if (!hasOrientation) { camera.quaternion.copy(targetQ); hasOrientation = true; }
      else camera.quaternion.slerp(targetQ, 0.2); // wygładzanie drgań
    }
    geoGroup.visible = hasOrientation;
    faceCamera(items, camera);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

// ---------- API ----------

// Sprawdzamy od razu przy wczytaniu modułu. Niektóre przeglądarki bez AR nigdy nie
// odpowiadają na isSessionSupported, stąd limit czasu.
const xrSupported = (async () => {
  if (!navigator.xr) return false;
  try {
    return await Promise.race([
      navigator.xr.isSessionSupported('immersive-ar'),
      new Promise((resolve) => setTimeout(() => resolve(false), 1500)),
    ]);
  } catch (e) {
    return false;
  }
})();

export function isWebXRSupported() {
  return xrSupported;
}

export async function startAR(opts) {
  if (await isWebXRSupported()) {
    try {
      return await startWebXR(opts);
    } catch (e) {
      console.warn('WebXR nie wystartował, przechodzę na tryb zapasowy', e);
    }
  }
  return startFallback(opts);
}

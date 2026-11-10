// Scena piątego punktu: Kort tenisowy
// Przemo stoi na korcie w 3D → zbliż się → minigra w tenisa → nagranie

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const DEG        = Math.PI / 180;
const EYE_HEIGHT = 1.5;
const IMG_WIDTH  = 1.8;

function geoOffset(from, to) {
  return {
    x:     (to.lng - from.lng) * Math.cos(from.lat * DEG) * 111320,
    north: (to.lat - from.lat) * 110540,
  };
}

function physDist(a, b) {
  const { x, north } = geoOffset(a, b);
  return Math.hypot(x, north);
}

function compassHeading(a, b, g) {
  const ax = b*DEG, ay = g*DEG, az = a*DEG;
  const cx = Math.cos(ax), cy = Math.cos(ay), cz = Math.cos(az);
  const sx = Math.sin(ax), sy = Math.sin(ay), sz = Math.sin(az);
  const vx = -cz*sy - sz*sx*cy;
  const vy = -sz*sy + cz*sx*cy;
  let h = Math.atan(vx / vy);
  if (vy < 0) h += Math.PI; else if (vx < 0) h += 2*Math.PI;
  return h / DEG;
}

function normDeg(a) { return ((a % 360) + 540) % 360 - 180; }

export async function startKortScene({ origin, sceneTarget, enterRadius, overlay, onEnd, devMode }) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } }, audio: false,
  });
  const video = document.createElement('video');
  video.className = 'ar-video';
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.srcObject = stream;
  document.body.appendChild(video);
  await video.play();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.className = 'ar-canvas';
  document.body.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
  const scene  = new THREE.Scene();
  const geoGroup = new THREE.Group();
  scene.add(geoGroup);

  const { mesh, imgH } = await loadImageMesh('src/przemo.jpg', IMG_WIDTH);
  geoGroup.add(mesh);

  let playerPos = { lat: origin.lat, lng: origin.lng };

  function placeMesh(pos) {
    const { x, north } = geoOffset(pos, sceneTarget);
    mesh.position.set(x, imgH / 2 - EYE_HEIGHT, -north);
  }
  placeMesh(playerPos);

  const labelEl  = overlay.querySelector('.ar-label');
  const hintEl   = overlay.querySelector('.ar-hint');
  const bottomEl = overlay.querySelector('.ar-bottom');
  const ORIG_BTM = bottomEl.innerHTML;

  labelEl.textContent = 'Przemo na korcie';
  hintEl.textContent  = devMode
    ? '[DEV] Naciśnij "Wejdź" aby uruchomić minigrę'
    : 'Zbliż się do Przema…';

  if (devMode) {
    bottomEl.innerHTML =
      '<button class="ar-btn-enter">Wejdź w zdjęcie</button>' +
      '<button class="ar-close" aria-label="Zamknij">✕</button>';
  } else {
    bottomEl.innerHTML = '<button class="ar-close" aria-label="Zamknij">✕</button>';
  }
  overlay.classList.remove('hidden');

  let running  = true;
  let entered  = false;
  let watchId  = null;

  function cleanup() {
    if (!running) return;
    running = false;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    window.removeEventListener('resize', onResize);
    if (orientEvtAbs) window.removeEventListener(orientEvtAbs, onOrientAbs);
    window.removeEventListener('deviceorientation', onOrientRel);
    stream.getTracks().forEach(t => t.stop());
    video.remove();
    renderer.setAnimationLoop(null);
    renderer.dispose();
    renderer.domElement.remove();
    labelEl.textContent = '';
    hintEl.textContent  = '';
    bottomEl.innerHTML  = ORIG_BTM;
    overlay.classList.add('hidden');
    onEnd && onEnd();
  }

  async function triggerEnter() {
    if (entered || !running) return;
    entered = true;
    running = false;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    window.removeEventListener('resize', onResize);
    if (orientEvtAbs) window.removeEventListener(orientEvtAbs, onOrientAbs);
    window.removeEventListener('deviceorientation', onOrientRel);
    stream.getTracks().forEach(t => t.stop());
    video.remove();
    renderer.setAnimationLoop(null);
    renderer.dispose();
    renderer.domElement.remove();
    overlay.classList.add('hidden');
    const mgMod = await import(new URL('js/minigame-tennis.js', document.baseURI).href);
    await mgMod.startTennisGame();
    // Nagranie Przema: zaprasza na wysuszone boisko
    const { playVideoMessage } = await import('./video-message.js');
    await playVideoMessage('src/przemo-tenis.mp4', {
      start: 'button',
      hint: 'Przemo ma Wam coś do powiedzenia',
    });
    labelEl.textContent = '';
    hintEl.textContent  = '';
    bottomEl.innerHTML  = ORIG_BTM;
    onEnd && onEnd();
  }

  bottomEl.addEventListener('click', (e) => {
    if (e.target.classList.contains('ar-close')) cleanup();
    if (e.target.classList.contains('ar-btn-enter')) triggerEnter();
  });

  if ('geolocation' in navigator) {
    watchId = navigator.geolocation.watchPosition(
      (p) => {
        if (!running || entered) return;
        playerPos = { lat: p.coords.latitude, lng: p.coords.longitude };
        placeMesh(playerPos);
        const dist = physDist(playerPos, sceneTarget);
        hintEl.textContent = devMode
          ? `[DEV] ${Math.round(dist)} m od Przema`
          : `${Math.round(dist)} m od Przema`;
        if (dist <= enterRadius && p.coords.accuracy <= 20) triggerEnter();
      },
      null,
      { enableHighAccuracy: true, maximumAge: 1500 }
    );
  }

  let compassH     = null;
  let gotAbsolute  = false;
  let offset       = null;
  const orientEvtAbs = 'ondeviceorientationabsolute' in window
    ? 'deviceorientationabsolute' : null;

  const euler = new THREE.Euler();
  const q0    = new THREE.Quaternion();
  const q1    = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
  const zee   = new THREE.Vector3(0, 0, 1);

  function applyOrientation(e) {
    compassH = compassHeading(e.alpha, e.beta, e.gamma);
    const orient = (screen.orientation ? screen.orientation.angle : window.orientation || 0) * DEG;
    euler.set(e.beta * DEG, e.alpha * DEG, -e.gamma * DEG, 'YXZ');
    camera.quaternion
      .setFromEuler(euler)
      .multiply(q1)
      .multiply(q0.setFromAxisAngle(zee, -orient));

    if (offset === null && compassH !== null) {
      const { x, north } = geoOffset(playerPos, sceneTarget);
      const targetBearing = (Math.atan2(x, north) / DEG + 360) % 360;
      const camYaw = (Math.atan2(
        2*(camera.quaternion.x*camera.quaternion.w + camera.quaternion.y*camera.quaternion.z),
        1 - 2*(camera.quaternion.x*camera.quaternion.x + camera.quaternion.y*camera.quaternion.y)
      ) / DEG + 360) % 360;
      offset = normDeg(camYaw - targetBearing);
      geoGroup.rotation.y = -offset * DEG;
    }
  }

  function onOrientAbs(e) {
    if (e.alpha == null) return;
    gotAbsolute = true;
    applyOrientation(e);
  }
  function onOrientRel(e) {
    if (e.alpha == null || gotAbsolute) return;
    applyOrientation(e);
  }

  if (orientEvtAbs) window.addEventListener(orientEvtAbs, onOrientAbs);
  window.addEventListener('deviceorientation', onOrientRel);

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  const _camPos  = new THREE.Vector3();
  const _meshPos = new THREE.Vector3();

  renderer.setAnimationLoop(() => {
    if (!running) return;
    camera.getWorldPosition(_camPos);
    mesh.getWorldPosition(_meshPos);
    mesh.lookAt(_camPos.x, _meshPos.y, _camPos.z);
    renderer.render(scene, camera);
  });
}

async function loadImageMesh(url, width) {
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Brak ' + url));
    i.src = url;
  });
  const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
  const cv = document.createElement('canvas');
  cv.width  = Math.round(img.width  * scale);
  cv.height = Math.round(img.height * scale);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const aspect = cv.height / cv.width;
  const h = width * aspect;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, h),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true })
  );
  return { mesh, imgH: h };
}

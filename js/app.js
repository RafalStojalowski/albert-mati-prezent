(function () {
  'use strict';

  const CFG = window.GAME_CONFIG;

  // Tryb testowy: dodaj ?debug do adresu, wtedy klik na mapie "prowadzi" ludzika
  const DEBUG = new URLSearchParams(location.search).has('debug');

  // ---------- Parametry ruchu ----------
  const WALK_SPEED_THRESHOLD = 0.6;  // m/s – powyżej tego uznajemy, że gracz idzie
  const MOVE_THRESHOLD = 4;          // m – przesunięcie od ostatniej kotwicy = ruch
  const WALK_HOLD_MS = 3000;         // jak długo animować chodzenie po ostatnim ruchu
  const JITTER_IGNORE = 1.5;         // m – mniejsze skoki GPS ignorujemy
  const MAX_ACCURACY_FOR_REACH = 50; // m – przy gorszej dokładności nie zaliczamy punktów
  const SIM_SPEED = 1.4;             // m/s – prędkość w trybie testowym

  // ---------- Zapis postępu ----------
  function loadProgress() {
    try {
      const raw = localStorage.getItem(CFG.storageKey);
      const data = raw ? JSON.parse(raw) : null;
      if (data && Array.isArray(data.visited)) return data;
    } catch (e) { /* brak dostępu do storage – gramy bez zapisu */ }
    return { visited: [] };
  }

  function saveProgress() {
    try {
      localStorage.setItem(CFG.storageKey, JSON.stringify(progress));
    } catch (e) { /* ignorujemy */ }
  }

  const progress = loadProgress();

  // ---------- Pomocnicze ----------
  function distance(a, b) {
    return L.latLng(a).distanceTo(L.latLng(b));
  }

  function formatDistance(m) {
    return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(1) + ' km';
  }

  const $ = (id) => document.getElementById(id);

  let toastTimer = null;
  function toast(text, ms = 3500) {
    const el = $('toast');
    el.textContent = text;
    el.classList.remove('hidden');
    // restart animacji wejścia
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  function setGpsStatus(text, cls) {
    const el = $('gpsStatus');
    el.textContent = text;
    el.className = 'gps-status' + (cls ? ' ' + cls : '');
  }

  // ---------- Mapa ----------
  const map = L.map('map', {
    zoomControl: false,
    attributionControl: true,
  }).setView(CFG.mapCenter, CFG.mapZoom);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  // ---------- Punkty ----------
  const spotMarkers = {};

  function spotIcon(index, visited) {
    return L.divIcon({
      className: 'spot-icon',
      html: `<div class="spot${visited ? ' visited' : ''}">${visited ? '✓' : index + 1}</div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -20],
    });
  }

  function spotPopup(spot) {
    const visited = progress.visited.includes(spot.id);
    let html = `<b>${spot.name}</b><br>`;
    html += visited ? 'Odwiedzony ✓' : 'Jeszcze nieodwiedzony';
    if (playerPos) html += `<br>Odległość: ${formatDistance(distance(playerPos, spot))}`;
    return html;
  }

  CFG.spots.forEach((spot, i) => {
    const m = L.marker([spot.lat, spot.lng], {
      icon: spotIcon(i, progress.visited.includes(spot.id)),
    }).addTo(map);
    m.bindPopup(() => spotPopup(spot));
    spotMarkers[spot.id] = { marker: m, index: i };
  });

  function refreshSpots() {
    CFG.spots.forEach((spot) => {
      const { marker, index } = spotMarkers[spot.id];
      marker.setIcon(spotIcon(index, progress.visited.includes(spot.id)));
    });
    $('progress').textContent = `${progress.visited.length}/${CFG.spots.length}`;
  }

  function checkSpots(pos, accuracy) {
    if (accuracy > MAX_ACCURACY_FOR_REACH) return;
    CFG.spots.forEach((spot) => {
      if (progress.visited.includes(spot.id)) return;
      const radius = spot.radius || CFG.reachRadius;
      if (distance(pos, spot) <= radius) {
        progress.visited.push(spot.id);
        saveProgress();
        refreshSpots();
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        if (progress.visited.length === CFG.spots.length) {
          toast('Brawo! Wszystkie punkty odwiedzone!', 6000);
        } else {
          toast(`Odwiedzono: ${spot.name} (${progress.visited.length}/${CFG.spots.length})`);
        }
      }
    });
  }

  // ---------- Ludzik gracza ----------
  const WALKER_SVG = `
    <div class="walker-wrap">
      <svg class="walker" viewBox="0 0 40 60">
        <ellipse class="shadow" cx="20" cy="56" rx="9" ry="3"/>
        <g class="figure">
          <g class="leg back"><line class="limb back" x1="20" y1="34" x2="20" y2="52"/></g>
          <g class="arm back"><line class="limb back" x1="20" y1="20" x2="20" y2="32"/></g>
          <line class="torso" x1="20" y1="19" x2="20" y2="34"/>
          <circle class="head" cx="20" cy="11" r="6"/>
          <g class="leg front"><line class="limb" x1="20" y1="34" x2="20" y2="52"/></g>
          <g class="arm front"><line class="limb" x1="20" y1="20" x2="20" y2="32"/></g>
        </g>
      </svg>
    </div>`;

  let playerMarker = null;
  let accuracyCircle = null;
  let playerPos = null;       // ostatnia docelowa pozycja (L.LatLng)
  let displayPos = null;      // aktualnie wyświetlana pozycja (w trakcie animacji)
  let anchorPos = null;       // punkt odniesienia do wykrywania ruchu
  let lastFixTime = 0;
  let walkUntil = 0;
  let walkTimer = null;
  let followPlayer = true;

  function ensurePlayerMarker(latlng) {
    if (playerMarker) return;
    playerMarker = L.marker(latlng, {
      icon: L.divIcon({
        className: 'player-icon',
        html: WALKER_SVG,
        iconSize: [40, 60],
        iconAnchor: [20, 56],
      }),
      zIndexOffset: 1000,
      interactive: false,
    }).addTo(map);
    accuracyCircle = L.circle(latlng, {
      radius: 10,
      color: '#1f6f5c',
      weight: 1,
      fillOpacity: 0.1,
      interactive: false,
    }).addTo(map);
    displayPos = latlng;
  }

  function walkerEl() {
    return playerMarker && playerMarker.getElement();
  }

  function setWalking(on) {
    const el = walkerEl();
    if (el) el.classList.toggle('walking', on);
  }

  function markMoving() {
    walkUntil = Date.now() + WALK_HOLD_MS;
    setWalking(true);
    clearTimeout(walkTimer);
    walkTimer = setTimeout(() => {
      if (Date.now() >= walkUntil) setWalking(false);
    }, WALK_HOLD_MS + 50);
  }

  function setFacing(from, to) {
    const el = walkerEl();
    if (!el) return;
    const wrap = el.querySelector('.walker-wrap');
    const dLng = to.lng - from.lng;
    if (Math.abs(dLng) < 1e-6) return;
    wrap.classList.toggle('facing-left', dLng < 0);
  }

  // Płynne przesunięcie ludzika do nowej pozycji
  let animFrame = null;
  function animateTo(target, durationMs) {
    cancelAnimationFrame(animFrame);
    const start = displayPos || target;
    const t0 = performance.now();
    function step(now) {
      const t = Math.min(1, (now - t0) / durationMs);
      const lat = start.lat + (target.lat - start.lat) * t;
      const lng = start.lng + (target.lng - start.lng) * t;
      displayPos = L.latLng(lat, lng);
      playerMarker.setLatLng(displayPos);
      accuracyCircle.setLatLng(displayPos);
      if (followPlayer) map.panTo(displayPos, { animate: false });
      if (t < 1) animFrame = requestAnimationFrame(step);
    }
    animFrame = requestAnimationFrame(step);
  }

  // Wspólna obsługa nowej pozycji – z prawdziwego GPS i z symulacji
  function onPosition(lat, lng, accuracy, speed) {
    const pos = L.latLng(lat, lng);
    const now = Date.now();
    const first = !playerPos;

    ensurePlayerMarker(pos);
    accuracyCircle.setRadius(accuracy);

    if (first) {
      playerPos = anchorPos = displayPos = pos;
      playerMarker.setLatLng(pos);
      accuracyCircle.setLatLng(pos);
      map.setView(pos, Math.max(map.getZoom(), 17));
      lastFixTime = now;
      checkSpots(pos, accuracy);
      return;
    }

    const jump = distance(playerPos, pos);
    if (jump < JITTER_IGNORE) return;

    // Wykrywanie ruchu: prędkość z GPS albo wyraźne oddalenie od kotwicy
    const movedFromAnchor = distance(anchorPos, pos);
    const threshold = Math.max(MOVE_THRESHOLD, Math.min(accuracy * 0.5, 15));
    const isMoving = (speed != null && speed > WALK_SPEED_THRESHOLD) || movedFromAnchor > threshold;
    if (isMoving) {
      setFacing(anchorPos, pos);
      anchorPos = pos;
      markMoving();
    }

    const dt = Math.min(Math.max(now - lastFixTime, 300), 2000);
    lastFixTime = now;
    playerPos = pos;
    animateTo(pos, dt);
    checkSpots(pos, accuracy);
  }

  // ---------- Prawdziwy GPS ----------
  function startGps() {
    if (!('geolocation' in navigator)) {
      setGpsStatus('Ta przeglądarka nie obsługuje GPS', 'error');
      return;
    }
    setGpsStatus('Szukam sygnału GPS…');
    navigator.geolocation.watchPosition(
      (p) => {
        const { latitude, longitude, accuracy, speed } = p.coords;
        if (accuracy > 100) {
          setGpsStatus(`Słaby sygnał GPS (±${Math.round(accuracy)} m)`);
        } else {
          setGpsStatus('', 'ok');
        }
        onPosition(latitude, longitude, accuracy, speed);
      },
      (err) => {
        const msg = err.code === err.PERMISSION_DENIED
          ? 'Brak zgody na lokalizację – włącz ją w ustawieniach przeglądarki'
          : 'Nie udało się ustalić pozycji';
        setGpsStatus(msg, 'error');
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
    );
  }

  // ---------- Symulacja (tryb ?debug) ----------
  let simTimer = null;
  function simulateWalkTo(target) {
    clearInterval(simTimer);
    let cur = playerPos || L.latLng(CFG.mapCenter);
    simTimer = setInterval(() => {
      const d = distance(cur, target);
      const stepLen = SIM_SPEED; // co 1 s
      if (d <= stepLen) {
        cur = target;
        clearInterval(simTimer);
        onPosition(cur.lat, cur.lng, 5, 0);
        return;
      }
      const f = stepLen / d;
      cur = L.latLng(cur.lat + (target.lat - cur.lat) * f, cur.lng + (target.lng - cur.lng) * f);
      onPosition(cur.lat, cur.lng, 5, SIM_SPEED);
    }, 1000);
  }

  function startDebug() {
    setGpsStatus('TRYB TESTOWY – kliknij mapę, żeby iść');
    onPosition(CFG.mapCenter[0], CFG.mapCenter[1], 5, 0);
    map.on('click', (e) => simulateWalkTo(e.latlng));
  }

  // ---------- Blokada wygaszania ekranu ----------
  let wakeLock = null;
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) { /* niedostępne – trudno */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wakeLock !== null) requestWakeLock();
  });

  // ---------- UI ----------
  function setFollow(on) {
    followPlayer = on;
    $('btnCenter').classList.toggle('active', on);
  }

  map.on('dragstart', () => setFollow(false));

  $('btnCenter').addEventListener('click', () => {
    setFollow(true);
    if (displayPos) map.setView(displayPos, Math.max(map.getZoom(), 17));
  });

  $('btnMenu').addEventListener('click', () => $('menu').classList.toggle('hidden'));
  $('btnCloseMenu').addEventListener('click', () => $('menu').classList.add('hidden'));
  $('btnReset').addEventListener('click', () => {
    if (!confirm('Na pewno wyzerować postęp?')) return;
    progress.visited = [];
    saveProgress();
    refreshSpots();
    $('menu').classList.add('hidden');
    toast('Postęp wyzerowany');
  });

  $('btnStart').addEventListener('click', () => {
    $('startScreen').classList.add('hidden');
    requestWakeLock();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    if (DEBUG) startDebug(); else startGps();
  });

  setFollow(true);
  refreshSpots();
})();

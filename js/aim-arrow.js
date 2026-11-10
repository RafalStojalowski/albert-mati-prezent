// Wspólna strzałka kierunku dla scen z kamerą.
// Pokazuje się przy lewej albo prawej krawędzi ekranu i wskazuje,
// w którą stronę obrócić telefon.

const ARROW_SVG =
  '<svg viewBox="0 0 64 40" width="100%" height="100%" aria-hidden="true">' +
  '<path d="M4 20 H40 M30 6 L56 20 L30 34" fill="none" stroke="currentColor" ' +
  'stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>' +
  '</svg>';

export function createAimArrow(container) {
  const el = document.createElement('div');
  el.className = 'aim-arrow';
  el.innerHTML = ARROW_SVG;
  el.style.display = 'none';
  container.appendChild(el);

  return {
    el,
    // diff = heading − celBearing (w stopniach, −180…180).
    // diff > 0 → cel jest po lewej. Wywołanie z null ukrywa strzałkę.
    update(diff) {
      if (diff == null) { el.style.display = 'none'; return; }
      this.point(diff > 0 ? 'left' : 'right', Math.abs(diff));
    },
    // dir: 'left' | 'right' | 'up' | 'down'; mag – odchylenie w stopniach
    point(dir, mag = 60) {
      el.style.display = '';
      for (const d of ['left', 'right', 'up', 'down']) el.classList.toggle(d, d === dir);
      el.style.opacity = Math.min(1, 0.55 + mag / 60).toFixed(2);
    },
    hide() { el.style.display = 'none'; },
    remove() { el.remove(); },
  };
}

// Tekst podpowiedzi zgodny ze strzałką
export function turnHint(diff) {
  return diff > 0 ? '← Obróć w lewo' : 'Obróć w prawo →';
}

// vDiff = pochylenie kamery − pochylenie celu (stopnie); > 0 → kamera za wysoko
export function tiltHint(vDiff) {
  return vDiff > 0 ? '↓ Opuść telefon niżej' : '↑ Unieś telefon wyżej';
}

// Kierunek osi kamery względem północy (stopnie) z deviceorientation
export function compassHeading(a, b, g) {
  const D = Math.PI / 180;
  const ax = b * D, ay = g * D, az = a * D;
  const cy = Math.cos(ay), cz = Math.cos(az);
  const sx = Math.sin(ax), sy = Math.sin(ay), sz = Math.sin(az);
  const vx = -cz * sy - sz * sx * cy;
  const vy = -sz * sy + cz * sx * cy;
  let h = Math.atan(vx / vy);
  if (vy < 0) h += Math.PI; else if (vx < 0) h += 2 * Math.PI;
  return h / D;
}

// Azymut z punktu from do punktu to (stopnie)
export function bearingTo(from, to) {
  const D = Math.PI / 180;
  const dL   = (to.lng - from.lng) * D;
  const lat1 = from.lat * D, lat2 = to.lat * D;
  const y = Math.sin(dL) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dL);
  return (Math.atan2(y, x) / D + 360) % 360;
}

// Różnica kątów w zakresie −180…180
export function angDiff(a, b) { return ((a - b + 540) % 360) - 180; }

// Kąt pochylenia osi kamery nad horyzontem (stopnie, + w górę),
// niezależny od orientacji ekranu.
export function cameraElevation(beta, gamma) {
  const D = Math.PI / 180;
  const z = -Math.cos(beta * D) * Math.cos(gamma * D);
  return Math.asin(Math.max(-1, Math.min(1, z))) / D;
}

// Przybliżone pole widzenia obrazu z kamery na ekranie (object-fit: cover).
// Dłuższy bok ekranu ≈ 65°, krótszy wynika z proporcji.
export function screenFov() {
  const W = window.innerWidth, H = window.innerHeight;
  const LONG = 65 * Math.PI / 180;
  const short = 2 * Math.atan(Math.tan(LONG / 2) * Math.min(W, H) / Math.max(W, H)) * 180 / Math.PI;
  return W >= H ? { h: 65, v: short } : { h: short, v: 65 };
}

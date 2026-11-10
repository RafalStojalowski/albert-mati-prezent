// Minigra wyścigowa: Zaspowóz wymija luksusowe auta

const WIN_TIME   = 45000;
const MAX_LIVES  = 3;
const LANES      = 3;
const BASE_SPEED = 6;
const SPEED_GAIN = 6;
const CAR_W      = 54;
const CAR_H      = 95;
const OBS_W      = 50;
const OBS_H      = 88;
const SPAWN_START = 1200;
const SPAWN_MIN   = 380;
const INVULN_MS   = 1200;

// Po wygranej odtwarzane jest nagranie Przema (scene-radziun.js)
const WIN_TEXT = 'Wygrana!';

const LUXURY_CARS = [
  { name: 'AUDI',         body: '#1a1a2e', accent: '#4a4a6a', glass: '#6688bb', stripe: '#888' },
  { name: 'PORSCHE',      body: '#c0c0c0', accent: '#888888', glass: '#88aacc', stripe: '#666' },
  { name: 'LAMBORGHINI',  body: '#f39c12', accent: '#d68910', glass: '#85c1e9', stripe: '#e67e22' },
  { name: 'BMW',          body: '#ecf0f1', accent: '#bdc3c7', glass: '#7fb3d8', stripe: '#2980b9' },
  { name: 'MERCEDES',     body: '#2c3e50', accent: '#1a252f', glass: '#5dade2', stripe: '#7f8c8d' },
  { name: 'FERRARI',      body: '#c0392b', accent: '#922b21', glass: '#85c1e9', stripe: '#e74c3c' },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Opcjonalny obrazek Zaspowozu widzianego z góry (pionowy, ok. 54×95).
// Gdy pliku nie ma – auto jest rysowane w kodzie.
// (src/zaspowoz.jpg to zdjęcie z Przemem do sceny na kamerze, nie sprite.)
let zaspowozImg = null;
const img = new Image();
img.onload = () => { zaspowozImg = img; };
img.src = 'src/zaspowoz-auto.png';

export async function startRacingGame() {
  while (true) {
    const result = await playOnce();
    if (result === 'win') {
      await showWinSequence();
      return;
    }
    await showRetry();
  }
}

function playOnce() {
  return new Promise(resolve => {
    const overlay = document.getElementById('minigameOverlay');
    const canvas  = document.getElementById('minigameCanvas');
    overlay.classList.remove('hidden');

    const W = canvas.width  = window.innerWidth;
    const H = canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');

    const roadL = W * 0.1;
    const roadR = W * 0.9;
    const roadW = roadR - roadL;
    const laneW = roadW / LANES;
    const laneXs = [];
    for (let i = 0; i < LANES; i++) laneXs.push(roadL + laneW * (i + 0.5));

    let lane        = 1;
    let targetLane  = 1;
    let carX        = laneXs[1];
    let lives       = MAX_LIVES;
    let done        = false;
    let startTime   = null;
    let lastSpawn   = 0;
    let invulnUntil = 0;
    let obstacles   = [];
    let particles   = [];
    let scenery     = [];
    let roadOffset  = 0;
    let rafId       = null;
    let score       = 0;
    let shakeUntil  = 0;
    let exhaustTimer = 0;

    // Sceneria — drzewa i budynki po bokach
    for (let i = 0; i < 20; i++) {
      scenery.push({
        side: Math.random() < 0.5 ? 'L' : 'R',
        y: Math.random() * H,
        type: Math.random() < 0.6 ? 'tree' : 'building',
        size: 12 + Math.random() * 18,
      });
    }

    function onTap(e) {
      e.preventDefault();
      if (done) return;
      const r = canvas.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      const tx = src.clientX - r.left;
      if (tx < W / 2) {
        targetLane = Math.max(0, targetLane - 1);
      } else {
        targetLane = Math.min(LANES - 1, targetLane + 1);
      }
    }
    canvas.addEventListener('click', onTap);
    canvas.addEventListener('touchstart', onTap, { passive: false });

    function spawnObstacle(now, elapsed) {
      const progress = Math.min(1, elapsed / WIN_TIME);
      const interval = SPAWN_START - (SPAWN_START - SPAWN_MIN) * progress;
      if (now - lastSpawn < interval) return;
      lastSpawn = now;

      const randCar = () => LUXURY_CARS[Math.floor(Math.random() * LUXURY_CARS.length)];

      const first = tryPlace(Math.floor(Math.random() * LANES), -OBS_H);
      if (!first) return;

      // Podwójne przeszkody — wcześniej i częściej
      if (elapsed > 6000 && Math.random() < 0.35) {
        const second = (first.lane + (Math.random() < 0.5 ? 1 : -1) + LANES) % LANES;
        tryPlace(second, -OBS_H - 30);
      }

      // Po 25s czasem blokada 2 pasów – zawsze z jednym wolnym przejazdem
      if (elapsed > 25000 && Math.random() < 0.2) {
        const free = (first.lane + 1 + Math.floor(Math.random() * (LANES - 1))) % LANES;
        for (let l = 0; l < LANES; l++) {
          if (l !== free && l !== first.lane) tryPlace(l, -OBS_H - 15);
        }
      }

      // Po 15s: niektóre auta zmieniają pas (o ile nie zamkną przejazdu)
      if (elapsed > 15000 && Math.random() < 0.15) {
        const o = obstacles[obstacles.length - 1];
        o.swerve = (Math.random() < 0.5 ? -1 : 1) * 0.3;
        if (blockedLanes(o.y).size >= LANES) o.swerve = 0;
      }

      // Dodaje auto tylko wtedy, gdy w tym "rzędzie" zostaje wolny pas
      function tryPlace(laneIdx, y) {
        const blocked = blockedLanes(y);
        blocked.add(laneIdx);
        if (blocked.size >= LANES) return null;
        const o = { lane: laneIdx, y, car: randCar(), swerve: 0 };
        obstacles.push(o);
        return o;
      }
    }

    // Pasy zajęte przez auta na podobnej wysokości (rząd, którego nie da się
    // przejechać "zygzakiem"). Auto zmieniające pas zajmuje też pas docelowy.
    const ROW_GAP = OBS_H + CAR_H + 40;
    function blockedLanes(y) {
      const s = new Set();
      for (const o of obstacles) {
        if (Math.abs(o.y - y) >= ROW_GAP) continue;
        if (o.swerve) {
          const to = Math.max(0, Math.min(LANES - 1, Math.round(o.lane + Math.sign(o.swerve))));
          for (let l = Math.min(Math.floor(o.lane), to); l <= Math.max(Math.ceil(o.lane), to); l++) s.add(l);
        } else {
          s.add(Math.round(o.lane));
        }
      }
      return s;
    }

    function spawnParticles(x, y, color, count, spread) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 1 + Math.random() * spread;
        particles.push({
          x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 1,
          life: 1, decay: 0.02 + Math.random() * 0.03,
          color, size: 1.5 + Math.random() * 3,
        });
      }
    }

    function loop(now) {
      if (!startTime) startTime = now;
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / WIN_TIME);
      const speed = BASE_SPEED + progress * SPEED_GAIN;

      spawnObstacle(now, elapsed);

      // Gracz
      const targetX = laneXs[targetLane];
      carX += (targetX - carX) * 0.16;
      lane = targetLane;

      // Przeszkody
      obstacles = obstacles.filter(o => {
        o.y += speed;
        if (o.swerve) {
          const lx = laneXs[o.lane];
          o.lane = Math.max(0, Math.min(LANES - 1,
            o.lane + (o.swerve > 0 ? 0.008 : -0.008)));
        }
        if (o.y > H + OBS_H) { score++; return false; }
        return true;
      });

      // Kolizje
      if (now > invulnUntil) {
        for (const o of obstacles) {
          const ox = laneXs[Math.round(o.lane)];
          if (Math.abs(ox - carX) < (CAR_W + OBS_W) * 0.38 &&
              o.y + OBS_H > H - CAR_H - 30 && o.y < H - 20) {
            lives--;
            invulnUntil = now + INVULN_MS;
            shakeUntil = now + 250;
            if (navigator.vibrate) navigator.vibrate(200);
            spawnParticles(carX, H - CAR_H - 30, '#f39c12', 12, 4);
            spawnParticles(carX, H - CAR_H - 30, '#e74c3c', 8, 3);
            if (lives <= 0) { done = true; cancelAnimationFrame(rafId); finish('lose'); return; }
            break;
          }
        }
      }

      // Spaliny Zaspowóz
      exhaustTimer += speed * 0.15;
      if (exhaustTimer > 1) {
        exhaustTimer = 0;
        particles.push({
          x: carX + (Math.random() - 0.5) * 12,
          y: H - 28,
          vx: (Math.random() - 0.5) * 0.5,
          vy: 1 + Math.random(),
          life: 0.6, decay: 0.015,
          color: 'rgba(100,100,100,0.5)', size: 3 + Math.random() * 4,
        });
      }

      // Cząsteczki
      particles = particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        return p.life > 0;
      });

      // Sceneria scroll
      for (const s of scenery) {
        s.y += speed * 0.4;
        if (s.y > H + 40) { s.y = -40; s.size = 12 + Math.random() * 18; }
      }

      if (elapsed >= WIN_TIME && !done) {
        done = true;
        cancelAnimationFrame(rafId);
        finish('win');
        return;
      }

      draw(now, elapsed, speed, progress);
      rafId = requestAnimationFrame(loop);
    }

    function draw(now, elapsed, speed, progress) {
      let sx = 0, sy = 0;
      if (now < shakeUntil) {
        sx = (Math.random() - 0.5) * 6;
        sy = (Math.random() - 0.5) * 6;
      }
      ctx.save();
      ctx.translate(sx, sy);

      // Tło
      ctx.fillStyle = '#1a3d1a';
      ctx.fillRect(-10, -10, W + 20, H + 20);

      // Sceneria
      for (const s of scenery) {
        const x = s.side === 'L' ? roadL * 0.5 : W - (W - roadR) * 0.5;
        if (s.type === 'tree') {
          ctx.fillStyle = '#0d2a0d';
          ctx.beginPath();
          ctx.arc(x + (Math.random() - 0.5) * 4, s.y, s.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#3a1f0a';
          ctx.fillRect(x - 2, s.y + s.size - 4, 4, 8);
        } else {
          ctx.fillStyle = '#2c2c3e';
          roundRect(ctx, x - s.size * 0.6, s.y - s.size, s.size * 1.2, s.size * 1.5, 3);
          ctx.fill();
          ctx.fillStyle = '#f0e68c';
          for (let wy = 0; wy < 3; wy++) {
            for (let wx = 0; wx < 2; wx++) {
              ctx.fillRect(x - s.size * 0.4 + wx * s.size * 0.5,
                s.y - s.size + 4 + wy * s.size * 0.4, 4, 5);
            }
          }
        }
      }

      // Droga — gradient
      const roadGrad = ctx.createLinearGradient(roadL, 0, roadR, 0);
      roadGrad.addColorStop(0, '#2a2a2a');
      roadGrad.addColorStop(0.1, '#3a3a3a');
      roadGrad.addColorStop(0.5, '#404040');
      roadGrad.addColorStop(0.9, '#3a3a3a');
      roadGrad.addColorStop(1, '#2a2a2a');
      ctx.fillStyle = roadGrad;
      ctx.fillRect(roadL, 0, roadW, H);

      // Linie pasów
      roadOffset = (roadOffset + speed) % 44;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.setLineDash([22, 22]);
      for (let i = 1; i < LANES; i++) {
        const x = roadL + laneW * i;
        ctx.beginPath();
        ctx.moveTo(x, -44 + roadOffset);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Krawędzie — podwójna linia
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(roadL, 0); ctx.lineTo(roadL, H);
      ctx.moveTo(roadR, 0); ctx.lineTo(roadR, H);
      ctx.stroke();
      ctx.strokeStyle = '#f1c40f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(roadL - 5, 0); ctx.lineTo(roadL - 5, H);
      ctx.moveTo(roadR + 5, 0); ctx.lineTo(roadR + 5, H);
      ctx.stroke();

      // Speed lines at high speed
      if (progress > 0.4) {
        const intensity = (progress - 0.4) / 0.6;
        ctx.strokeStyle = `rgba(255,255,255,${intensity * 0.15})`;
        ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
          const lx = roadL + Math.random() * roadW;
          const ly = Math.random() * H;
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.lineTo(lx, ly + 30 + intensity * 40);
          ctx.stroke();
        }
      }

      // Przeszkody — luksusowe auta
      for (const o of obstacles) {
        const ox = laneXs[Math.round(o.lane)];
        drawLuxuryCar(ctx, ox, o.y, o.car);
      }

      // Cząsteczki
      for (const p of particles) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Zaspowóz
      const carY = H - CAR_H - 30;
      const blink = now < invulnUntil && Math.floor(now / 100) % 2;
      if (!blink) {
        drawZaspowoz(ctx, carX, carY, now, speed);
      }

      // HUD
      drawHUD(ctx, now, elapsed, progress, W, H, lives);

      // Instrukcja startowa
      if (elapsed < 3500) {
        const a = Math.max(0, 1 - elapsed / 3500);
        ctx.fillStyle = `rgba(0,0,0,${a * 0.5})`;
        roundRect(ctx, W / 2 - 130, H / 2 - 30, 260, 60, 14);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.font = 'bold 17px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('← Dotknij lewo / prawo →', W / 2, H / 2);
      }

      ctx.restore();
    }

    function drawLuxuryCar(ctx, cx, y, car) {
      const w = OBS_W, h = OBS_H;
      const x = cx - w / 2;

      // Cień
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(cx, y + h + 4, w * 0.4, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Karoseria
      ctx.fillStyle = car.body;
      roundRect(ctx, x + 2, y + 4, w - 4, h - 4, 12);
      ctx.fill();

      // Obrys
      ctx.strokeStyle = car.accent;
      ctx.lineWidth = 2;
      roundRect(ctx, x + 2, y + 4, w - 4, h - 4, 12);
      ctx.stroke();

      // Maska — gradient
      ctx.fillStyle = car.accent;
      roundRect(ctx, x + 6, y + 6, w - 12, h * 0.25, 6);
      ctx.fill();

      // Szyba przednia
      ctx.fillStyle = car.glass;
      roundRect(ctx, x + 8, y + h * 0.26, w - 16, h * 0.2, 4);
      ctx.fill();
      // Odbicie na szybie
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x + 10, y + h * 0.27, w - 22, h * 0.06);

      // Szyba tylna
      ctx.fillStyle = car.glass;
      roundRect(ctx, x + 10, y + h * 0.58, w - 20, h * 0.15, 3);
      ctx.fill();

      // Światła przednie
      ctx.fillStyle = '#ffffcc';
      ctx.shadowColor = '#ffffaa';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(x + 10, y + 10, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + w - 10, y + 10, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Światła tylne
      ctx.fillStyle = '#ff3333';
      ctx.shadowColor = '#ff0000';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(x + 8, y + h - 10, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + w - 8, y + h - 10, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Pasek sportowy
      ctx.fillStyle = car.stripe;
      ctx.fillRect(cx - 2, y + 6, 4, h * 0.22);

      // Nazwa marki
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 7px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(car.name, cx, y + h * 0.48);
    }

    function drawZaspowoz(ctx, cx, y, now, speed) {
      const w = CAR_W, h = CAR_H;
      const x = cx - w / 2;

      if (zaspowozImg) {
        // Rysuj załadowany obrazek
        ctx.save();
        roundRect(ctx, x, y, w, h, 10);
        ctx.clip();
        ctx.drawImage(zaspowozImg, x, y, w, h);
        ctx.restore();
        // Obrys
        ctx.strokeStyle = '#2fa88a';
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, w, h, 10);
        ctx.stroke();
      } else {
        // Placeholder — narysowany Zaspowóz
        // Cień
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(cx, y + h + 4, w * 0.4, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Karoseria
        ctx.fillStyle = '#1f6f5c';
        roundRect(ctx, x + 1, y + 2, w - 2, h - 2, 12);
        ctx.fill();
        ctx.strokeStyle = '#2fa88a';
        ctx.lineWidth = 2;
        roundRect(ctx, x + 1, y + 2, w - 2, h - 2, 12);
        ctx.stroke();

        // Maska
        ctx.fillStyle = '#16574a';
        roundRect(ctx, x + 5, y + 5, w - 10, h * 0.2, 6);
        ctx.fill();

        // Szyba
        ctx.fillStyle = '#a8e6cf';
        roundRect(ctx, x + 8, y + h * 0.22, w - 16, h * 0.2, 4);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(x + 10, y + h * 0.23, w - 22, h * 0.06);

        // Szyba tylna
        ctx.fillStyle = '#a8e6cf';
        roundRect(ctx, x + 10, y + h * 0.58, w - 20, h * 0.14, 3);
        ctx.fill();

        // Światła
        ctx.fillStyle = '#ffffcc';
        ctx.shadowColor = '#ffffaa';
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.arc(x + 10, y + 9, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + w - 10, y + 9, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Tylne światła
        ctx.fillStyle = '#ff4444';
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(x + 7, y + h - 8, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + w - 7, y + h - 8, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Napis
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ZASPOWÓZ', cx, y + h * 0.48);
      }
    }

    function drawHUD(ctx, now, elapsed, progress, W, H, lives) {
      // HP serduszka
      ctx.textAlign = 'left';
      ctx.font = '20px system-ui';
      for (let i = 0; i < MAX_LIVES; i++) {
        ctx.fillText(i < lives ? '❤️' : '🖤', 12 + i * 28, 30);
      }

      // Timer — pasek na górze
      const barY = 6, barH = 6;
      const barL = MAX_LIVES * 28 + 24;
      const barR = W - 90;
      const barW = barR - barL;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      roundRect(ctx, barL, barY, barW, barH, 3);
      ctx.fill();
      const timeProg = Math.min(1, elapsed / WIN_TIME);
      const barColor = timeProg > 0.7 ? '#2ecc71' : (timeProg > 0.4 ? '#f39c12' : '#e74c3c');
      ctx.fillStyle = barColor;
      roundRect(ctx, barL, barY, barW * timeProg, barH, 3);
      ctx.fill();

      // Timer tekst
      const remaining = Math.max(0, WIN_TIME - elapsed);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px system-ui';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(`${(remaining / 1000).toFixed(1)}s`, W - 14, 6);

      // Prędkościomierz
      const kmh = Math.round(60 + progress * 140);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(ctx, W - 84, 26, 74, 26, 6);
      ctx.fill();
      ctx.fillStyle = kmh > 150 ? '#ff4444' : '#0f0';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${kmh} km/h`, W - 16, 39);

      // Wyminiętych
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      roundRect(ctx, W - 84, 56, 74, 22, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '11px system-ui';
      ctx.fillText(`wyminięte: ${score}`, W - 16, 67);
    }

    function finish(result) {
      canvas.removeEventListener('click', onTap);
      canvas.removeEventListener('touchstart', onTap);
      if (result === 'lose') {
        ctx.fillStyle = 'rgba(0,0,0,0.82)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#e74c3c';
        ctx.font = `bold ${Math.round(W * 0.075)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Rozbity!', W / 2, H / 2 - 50);
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.round(W * 0.04)}px system-ui`;
        ctx.fillText(`Wyminięte: ${score}`, W / 2, H / 2);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `${Math.round(W * 0.035)}px system-ui`;
        ctx.fillText('Dotknij aby spróbować ponownie', W / 2, H / 2 + 45);
      }
      resolve(result);
    }

    rafId = requestAnimationFrame(loop);
  });
}

async function showRetry() {
  const canvas = document.getElementById('minigameCanvas');
  await new Promise(res => {
    canvas.addEventListener('click',      res, { once: true });
    canvas.addEventListener('touchstart', res, { once: true, passive: true });
  });
}

async function showWinSequence() {
  const overlay = document.getElementById('minigameOverlay');
  const canvas  = document.getElementById('minigameCanvas');
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  ctx.fillRect(0, 0, W, H);

  // Zaspowóz icon
  const icoW = 60, icoH = 100;
  if (zaspowozImg) {
    ctx.save();
    roundRect(ctx, W / 2 - icoW / 2, H / 2 + 20, icoW, icoH, 10);
    ctx.clip();
    ctx.drawImage(zaspowozImg, W / 2 - icoW / 2, H / 2 + 20, icoW, icoH);
    ctx.restore();
  } else {
    ctx.fillStyle = '#1f6f5c';
    roundRect(ctx, W / 2 - icoW / 2, H / 2 + 20, icoW, icoH, 12);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ZASPOWÓZ', W / 2, H / 2 + 70);
  }

  await sleep(600);

  const lines = WIN_TEXT.split('\n');
  const fontSize = Math.min(22, Math.max(14, Math.round(W * 0.045)));

  for (let a = 0; a <= 1; a += 0.05) {
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(0, 0, W, H);
    if (zaspowozImg) {
      ctx.save();
      roundRect(ctx, W / 2 - icoW / 2, H / 2 + 20, icoW, icoH, 10);
      ctx.clip();
      ctx.drawImage(zaspowozImg, W / 2 - icoW / 2, H / 2 + 20, icoW, icoH);
      ctx.restore();
    } else {
      ctx.fillStyle = '#1f6f5c';
      roundRect(ctx, W / 2 - icoW / 2, H / 2 + 20, icoW, icoH, 12);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('ZASPOWÓZ', W / 2, H / 2 + 70);
    }
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.font = `bold ${fontSize}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - 40 + i * (fontSize + 8)));
    await sleep(16);
  }

  await sleep(1500);

  for (let a = 1; a >= 0; a -= 0.04) {
    ctx.globalAlpha = a;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    await sleep(16);
  }
  overlay.classList.add('hidden');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

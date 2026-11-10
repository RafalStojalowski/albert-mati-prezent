// Minigra wyścigowa: Zaspowóz wymija przeszkody

const WIN_TIME   = 35000;  // ms – przetrwaj 35 sekund
const MAX_LIVES  = 3;
const LANES      = 3;
const BASE_SPEED = 5;      // px/frame prędkość bazowa przeszkód
const CAR_W      = 52;
const CAR_H      = 90;
const OBS_W      = 48;
const OBS_H      = 80;
const SPAWN_INTERVAL_START = 1400; // ms
const SPAWN_INTERVAL_MIN   = 600;
const INVULN_MS  = 1200;   // ms nietykalności po zderzeniu

const WIN_TEXT = 'Przemo mówi:\nteraz trzeba pograć w piłeczkę!';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

    // Pasy ruchu
    const roadL = W * 0.12;
    const roadR = W * 0.88;
    const roadW = roadR - roadL;
    const laneW = roadW / LANES;
    const laneXs = [];
    for (let i = 0; i < LANES; i++) laneXs.push(roadL + laneW * (i + 0.5));

    // Stan gry
    let lane       = 1; // środkowy pas
    let targetLane = 1;
    let carX       = laneXs[1];
    let lives      = MAX_LIVES;
    let done       = false;
    let startTime  = null;
    let lastSpawn  = 0;
    let invulnUntil = 0;
    let obstacles  = [];
    let roadOffset = 0;
    let rafId      = null;
    let score      = 0;

    // Sterowanie: tap lewo/prawo
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
      const interval = SPAWN_INTERVAL_START - (SPAWN_INTERVAL_START - SPAWN_INTERVAL_MIN) * progress;
      if (now - lastSpawn < interval) return;
      lastSpawn = now;
      // Losowy pas, unikaj tego samego co ostatni
      let obsLane = Math.floor(Math.random() * LANES);
      // Czasem 2 przeszkody obok siebie (po 15s)
      obstacles.push({ lane: obsLane, y: -OBS_H });
      if (elapsed > 15000 && Math.random() < 0.3) {
        let second = (obsLane + (Math.random() < 0.5 ? 1 : -1) + LANES) % LANES;
        obstacles.push({ lane: second, y: -OBS_H - 40 });
      }
    }

    function loop(now) {
      if (!startTime) startTime = now;
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / WIN_TIME);
      const speed = BASE_SPEED + progress * 4;

      // Spawn
      spawnObstacle(now, elapsed);

      // Przesuń samochód gracza do docelowego pasa
      const targetX = laneXs[targetLane];
      carX += (targetX - carX) * 0.18;
      lane = targetLane;

      // Przesuń przeszkody
      obstacles = obstacles.filter(o => {
        o.y += speed;
        if (o.y > H + OBS_H) { score++; return false; }
        return true;
      });

      // Kolizje
      if (now > invulnUntil) {
        for (const o of obstacles) {
          const ox = laneXs[o.lane];
          if (Math.abs(ox - carX) < (CAR_W + OBS_W) * 0.4 &&
              o.y + OBS_H > H - CAR_H - 30 && o.y < H - 20) {
            lives--;
            invulnUntil = now + INVULN_MS;
            if (navigator.vibrate) navigator.vibrate(150);
            if (lives <= 0) { done = true; cancelAnimationFrame(rafId); finish('lose'); return; }
            break;
          }
        }
      }

      // Wygrana
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
      ctx.clearRect(0, 0, W, H);

      // Tło - trawa
      ctx.fillStyle = '#2a5c2a';
      ctx.fillRect(0, 0, W, H);

      // Droga
      ctx.fillStyle = '#333';
      ctx.fillRect(roadL, 0, roadW, H);

      // Linie pasów (animowane)
      roadOffset = (roadOffset + speed) % 40;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.setLineDash([20, 20]);
      for (let i = 1; i < LANES; i++) {
        const x = roadL + laneW * i;
        ctx.beginPath();
        ctx.moveTo(x, -40 + roadOffset);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Krawędzie drogi
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(roadL, 0); ctx.lineTo(roadL, H);
      ctx.moveTo(roadR, 0); ctx.lineTo(roadR, H);
      ctx.stroke();

      // Przeszkody
      for (const o of obstacles) {
        const ox = laneXs[o.lane] - OBS_W / 2;
        ctx.fillStyle = '#c0392b';
        roundRect(ctx, ox, o.y, OBS_W, OBS_H, 8);
        ctx.fill();
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 2;
        roundRect(ctx, ox, o.y, OBS_W, OBS_H, 8);
        ctx.stroke();
        // Okna
        ctx.fillStyle = '#85c1e9';
        ctx.fillRect(ox + 8, o.y + 10, OBS_W - 16, 18);
      }

      // Samochód gracza (Zaspowóz)
      const carY = H - CAR_H - 30;
      const blink = now < invulnUntil && Math.floor(now / 100) % 2;
      if (!blink) {
        const cx = carX - CAR_W / 2;
        ctx.fillStyle = '#1f6f5c';
        roundRect(ctx, cx, carY, CAR_W, CAR_H, 10);
        ctx.fill();
        ctx.strokeStyle = '#2fa88a';
        ctx.lineWidth = 2;
        roundRect(ctx, cx, carY, CAR_W, CAR_H, 10);
        ctx.stroke();
        // Szyba
        ctx.fillStyle = '#a8e6cf';
        ctx.fillRect(cx + 8, carY + 8, CAR_W - 16, 22);
        // Tekst
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ZASPOWÓZ', carX, carY + CAR_H - 15);
      }

      // HP
      ctx.textAlign = 'left';
      ctx.font = '22px system-ui';
      for (let i = 0; i < MAX_LIVES; i++) {
        ctx.fillText(i < lives ? '❤️' : '🖤', 14 + i * 30, 36);
      }

      // Timer
      const remaining = Math.max(0, WIN_TIME - elapsed);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(`${(remaining / 1000).toFixed(1)}s`, W - 14, 32);

      // Prędkościomierz
      const kmh = Math.round(60 + progress * 100);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      roundRect(ctx, W - 80, 44, 68, 28, 6);
      ctx.fill();
      ctx.fillStyle = '#0f0';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${kmh} km/h`, W - 18, 63);

      // Instrukcja na starcie
      if (elapsed < 3000) {
        ctx.fillStyle = `rgba(255,255,255,${1 - elapsed / 3000})`;
        ctx.font = 'bold 18px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('← Dotknij lewo / prawo →', W / 2, H / 2);
      }
    }

    function finish(result) {
      canvas.removeEventListener('click', onTap);
      canvas.removeEventListener('touchstart', onTap);
      if (result === 'lose') {
        ctx.fillStyle = 'rgba(0,0,0,0.78)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#e74c3c';
        ctx.font = `bold ${Math.round(W * 0.07)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Rozbity!', W / 2, H / 2 - 30);
        ctx.fillStyle = '#fff';
        ctx.font = `${Math.round(W * 0.04)}px system-ui`;
        ctx.fillText('Dotknij aby spróbować ponownie', W / 2, H / 2 + 30);
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

  // Ikona Zaspowóz
  ctx.fillStyle = '#1f6f5c';
  roundRect(ctx, W / 2 - 30, H / 2 + 20, 60, 100, 12);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('ZASPOWÓZ', W / 2, H / 2 + 100);

  await sleep(600);

  // Tekst wygranej
  const lines = WIN_TEXT.split('\n');
  const fontSize = Math.min(22, Math.max(14, Math.round(W * 0.045)));

  for (let a = 0; a <= 1; a += 0.05) {
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1f6f5c';
    roundRect(ctx, W / 2 - 30, H / 2 + 20, 60, 100, 12);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('ZASPOWÓZ', W / 2, H / 2 + 100);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.font = `bold ${fontSize}px system-ui`;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - 40 + i * (fontSize + 8)));
    await sleep(16);
  }

  await sleep(3000);

  // Fade out
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

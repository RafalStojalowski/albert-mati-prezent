// Minigra: Obrona Przema przed Przymorzanami

const TOWER_RANGE     = 150;   // px
const TOWER_LIFETIME  = 6000;  // ms
const TOWER_COOLDOWN  = 5000;  // ms
const TOWER_FIRE_RATE = 1100;  // ms między strzałami
const PRZEMO_HP_MAX   = 5;
const PRZEMO_RADIUS   = 38;    // px – strefa Przema

// harmonogram spawnów: [czas_ms, strona] 0=N 1=E 2=S 3=W
const SPAWNS = [
  [2000,0],[4000,0],[6000,0],[8000,0],[10000,0],[12000,0],
  [17000,1],[17000,3],[19500,1],[19500,3],[22000,1],[22000,3],[24500,1],[24500,3],
  [30000,0],[30000,2],[31500,1],[31500,3],[33000,0],[33000,2],[34500,1],[34500,3],[36000,0],[36000,2],
];
const TOTAL = SPAWNS.length; // 24

const WIN_TEXTS = [
  'Przemo jest teraz bezpieczny',
  'Zaspiańskiego Cassanove\noraz jego auto wyczynowe',
  'na pewno wiecie gdzie mieszka',
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function startMiniGame() {
  while (true) {
    const result = await playOnce();
    if (result === 'win') {
      await showWinSequence();
      return;
    }
    // przegrana – pokaż retry
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
    const cx = W / 2, cy = H / 2;
    const ctx = canvas.getContext('2d');

    let przemoHp    = PRZEMO_HP_MAX;
    let towers      = [];
    let enemies     = [];
    let lastTower   = -(TOWER_COOLDOWN + 1);
    let done        = false;
    let spawnIdx    = 0;
    let killed      = 0;
    let startTime   = null;
    let rafId       = null;

    function spawnEnemy(side) {
      const margin = 10;
      let x, y;
      const speed = 0.55 + (spawnIdx * 0.012);
      switch (side) {
        case 0: x = cx + (Math.random() - 0.5) * W * 0.7; y = margin; break;
        case 1: x = W - margin; y = cy + (Math.random() - 0.5) * H * 0.7; break;
        case 2: x = cx + (Math.random() - 0.5) * W * 0.7; y = H - margin; break;
        case 3: x = margin; y = cy + (Math.random() - 0.5) * H * 0.7; break;
      }
      const angle = Math.atan2(cy - y, cx - x);
      enemies.push({ x, y, angle, speed, dead: false, reached: false, flash: 0 });
    }

    function placeTower(px, py) {
      const now = performance.now();
      if (done) return;
      if (now - lastTower < TOWER_COOLDOWN) return;
      if (Math.hypot(px - cx, py - cy) < PRZEMO_RADIUS + 20) return;
      towers.push({ x: px, y: py, placedAt: now, lastShot: 0 });
      lastTower = now;
    }

    function onTap(e) {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      placeTower(src.clientX - r.left, src.clientY - r.top);
    }
    canvas.addEventListener('click', onTap);
    canvas.addEventListener('touchstart', onTap, { passive: false });

    function loop(now) {
      if (!startTime) startTime = now;
      const elapsed = now - startTime;
      const dt = 16.67; // fixed step simulation

      // Spawn
      while (spawnIdx < SPAWNS.length && elapsed >= SPAWNS[spawnIdx][0]) {
        spawnEnemy(SPAWNS[spawnIdx][1]);
        spawnIdx++;
      }

      // Towers: strzelaj i wymagaj wygaśnięcia
      towers = towers.filter(t => {
        if (now - t.placedAt >= TOWER_LIFETIME) return false;
        // znajdź najbliższego wroga w zasięgu
        let target = null, minD = Infinity;
        for (const e of enemies) {
          if (e.dead || e.reached) continue;
          const d = Math.hypot(e.x - t.x, e.y - t.y);
          if (d <= TOWER_RANGE && d < minD) { minD = d; target = e; }
        }
        if (target && now - t.lastShot >= TOWER_FIRE_RATE) {
          target.hp = (target.hp || 1) - 1;
          t.lastShot = now;
          target.flash = 6;
          if ((target.hp || 0) <= 0) { target.dead = true; killed++; }
        }
        return true;
      });

      // Wrogowie się poruszają
      for (const e of enemies) {
        if (e.dead || e.reached) continue;
        e.x += Math.cos(e.angle) * e.speed * (dt / 16.67);
        e.y += Math.sin(e.angle) * e.speed * (dt / 16.67);
        if (e.flash > 0) e.flash--;
        if (Math.hypot(e.x - cx, e.y - cy) < PRZEMO_RADIUS) {
          e.reached = true;
          przemoHp--;
          if (przemoHp <= 0 && !done) { done = true; cancelAnimationFrame(rafId); finish('lose'); return; }
        }
      }

      // Koniec – wszyscy pokonani
      if (!done && spawnIdx >= SPAWNS.length && enemies.every(e => e.dead || e.reached)) {
        done = true;
        cancelAnimationFrame(rafId);
        finish('win');
        return;
      }

      draw(now, elapsed);
      rafId = requestAnimationFrame(loop);
    }

    function draw(now, elapsed) {
      ctx.clearRect(0, 0, W, H);

      // Tło
      ctx.fillStyle = 'rgba(8, 20, 14, 0.94)';
      ctx.fillRect(0, 0, W, H);

      // Zasięgi wież (subtelne)
      for (const t of towers) {
        const rem = 1 - (now - t.placedAt) / TOWER_LIFETIME;
        ctx.beginPath();
        ctx.arc(t.x, t.y, TOWER_RANGE, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(31,111,92,${0.08 * rem})`;
        ctx.fill();
      }

      // Wieżyczki
      for (const t of towers) {
        const rem = 1 - (now - t.placedAt) / TOWER_LIFETIME;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 17, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(31,111,92,${0.55 + 0.45 * rem})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(80,200,160,${rem})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = '15px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚡', t.x, t.y);
        // Pasek czasu życia
        const barW = 32;
        const barH = 4;
        ctx.fillStyle = '#333';
        ctx.fillRect(t.x - barW/2, t.y + 20, barW, barH);
        ctx.fillStyle = `hsl(${120 * rem}, 80%, 50%)`;
        ctx.fillRect(t.x - barW/2, t.y + 20, barW * rem, barH);
      }

      // Wrogowie
      for (const e of enemies) {
        if (e.dead || e.reached) continue;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 13, 0, Math.PI * 2);
        ctx.fillStyle = e.flash > 0 ? '#fff' : '#c0392b';
        ctx.fill();
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = e.flash > 0 ? '#c0392b' : '#fff';
        ctx.font = '11px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('P', e.x, e.y);
      }

      // Przemo w centrum
      ctx.beginPath();
      ctx.arc(cx, cy, PRZEMO_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#1f6f5c';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.font = '26px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🧑', cx, cy);

      // HP
      ctx.textAlign = 'left';
      ctx.font = '22px system-ui';
      for (let i = 0; i < PRZEMO_HP_MAX; i++) {
        ctx.fillText(i < przemoHp ? '❤️' : '🖤', 14 + i * 30, 36);
      }

      // Licznik wrogów
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.font = '13px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(`Przymorzanie: ${killed}/${TOTAL}`, W - 12, 22);

      // Cooldown / "postaw wieżyczkę"
      const cd = Math.max(0, TOWER_COOLDOWN - (now - lastTower));
      ctx.textAlign = 'center';
      const btnY = H - 34;
      if (cd > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        roundRect(ctx, cx - 90, btnY - 18, 180, 38, 10);
        ctx.fill();
        ctx.fillStyle = '#aaa';
        ctx.font = '14px system-ui';
        ctx.fillText(`⏱ wieżyczka za ${(cd/1000).toFixed(1)}s`, cx, btnY);
      } else {
        ctx.fillStyle = 'rgba(31,111,92,0.8)';
        roundRect(ctx, cx - 90, btnY - 18, 180, 38, 10);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px system-ui';
        ctx.fillText('👆 postaw wieżyczkę', cx, btnY);
      }
    }

    function finish(result) {
      canvas.removeEventListener('click', onTap);
      canvas.removeEventListener('touchstart', onTap);

      if (result === 'lose') {
        // pokaż gameover
        ctx.fillStyle = 'rgba(0,0,0,0.78)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#e74c3c';
        ctx.font = `bold ${Math.round(W * 0.08)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Przemo poległ!', cx, cy - 30);
        ctx.fillStyle = '#fff';
        ctx.font = `${Math.round(W * 0.045)}px system-ui`;
        ctx.fillText('Dotknij aby spróbować ponownie', cx, cy + 30);
      }

      resolve(result);
    }

    rafId = requestAnimationFrame(loop);
  });
}

async function showRetry() {
  // Czekaj na tap (overlay już pokazuje gameover)
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
  const cx = W / 2, cy = H / 2;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  ctx.fillRect(0, 0, W, H);
  drawPrzemoIcon(ctx, cx, cy + 40, 52);
  await sleep(500);

  for (const line of WIN_TEXTS) {
    await animText(ctx, line, cx, cy - 60, W, H, cy + 40);
  }

  // Zanik
  for (let a = 1; a >= 0; a -= 0.04) {
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    await sleep(16);
  }
  overlay.classList.add('hidden');
}

async function animText(ctx, text, cx, ty, W, H, iconY) {
  const lines = text.split('\n');
  const fontSize = Math.min(22, Math.max(14, Math.round(W * 0.045)));

  async function frame(alpha) {
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(0, 0, W, H);
    drawPrzemoIcon(ctx, cx, iconY, 52);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.font = `bold ${fontSize}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, cx, ty + i * (fontSize + 8)));
  }

  for (let a = 0; a <= 1; a += 0.06) { await frame(a); await sleep(16); }
  await sleep(2200);
  for (let a = 1; a >= 0; a -= 0.06) { await frame(a); await sleep(16); }
  await sleep(300);
}

function drawPrzemoIcon(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#1f6f5c';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.font = `${Math.round(r * 0.9)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🧑', x, y);
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

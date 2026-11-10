// Minigra: Obrona Przema przed Przymorzanami – Tower Defense

const TOWER_RANGE     = 160;
const TOWER_LIFETIME  = 8000;
const TOWER_COOLDOWN  = 3000;
const TOWER_FIRE_RATE = 800;
const PROJ_SPEED      = 8;
const PRZEMO_HP_MAX   = 5;
const PRZEMO_RADIUS   = 40;

const WAVES = [
  { start: 2000,  count: 8,  sides: [0],          interval: 1300, hp: 1, speed: 0.50 },
  { start: 16000, count: 10, sides: [1, 3],        interval: 1100, hp: 1, speed: 0.65 },
  { start: 30000, count: 12, sides: [0, 1, 2, 3],  interval: 1000, hp: 2, speed: 0.70 },
  { start: 46000, count: 14, sides: [0, 1, 2, 3],  interval: 850,  hp: 2, speed: 0.85 },
  { start: 62000, count: 12, sides: [0, 1, 2, 3],  interval: 800,  hp: 3, speed: 1.00, bosses: 3 },
];

function buildSpawns() {
  const list = [];
  for (const w of WAVES) {
    for (let i = 0; i < w.count; i++) {
      const t = w.start + i * w.interval;
      const side = w.sides[i % w.sides.length];
      const boss = w.bosses && i >= w.count - w.bosses;
      list.push({ t, side, hp: boss ? 6 : w.hp, speed: boss ? w.speed * 0.6 : w.speed, boss });
    }
  }
  list.sort((a, b) => a.t - b.t);
  return list;
}

const SPAWNS = buildSpawns();
const TOTAL  = SPAWNS.length;

const WIN_TEXTS = [
  'Przemo jest teraz bezpieczny',
  'teraz trzeba odwiedzić Zaspiańskiego Cassanove\noraz jego auto wyczynowe',
  'na pewno wiecie gdzie mieszka',
];

const WAVE_NAMES = ['Fala 1: Północ', 'Fala 2: Flanki', 'Fala 3: Oblężenie', 'Fala 4: Szturm', 'Fala 5: Atak Główny'];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Twarz Przema (rysowana w kółku)
let faceImg = null;
const _face = new Image();
_face.onload = () => { faceImg = _face; };
_face.src = 'src/twarz-przemo.png';

function drawFace(ctx, x, y, r) {
  if (!faceImg) return false;
  const iw = faceImg.width, ih = faceImg.height;
  const s  = Math.min(iw, ih);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(faceImg, (iw - s) / 2, (ih - s) / 2, s, s, x - r, y - r, r * 2, r * 2);
  ctx.restore();
  return true;
}

export async function startMiniGame() {
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
    const cx = W / 2, cy = H / 2;
    const ctx = canvas.getContext('2d');

    let przemoHp     = PRZEMO_HP_MAX;
    let towers       = [];
    let enemies      = [];
    let projectiles  = [];
    let particles    = [];
    let lastTower    = -(TOWER_COOLDOWN + 1);
    let done         = false;
    let spawnIdx     = 0;
    let killed       = 0;
    let startTime    = null;
    let rafId        = null;
    let shakeUntil   = 0;
    let currentWave  = -1;
    let waveTextAlpha = 0;
    let waveTextTime  = 0;

    function spawnEnemy(spawn) {
      const margin = 10;
      let x, y;
      switch (spawn.side) {
        case 0: x = cx + (Math.random() - 0.5) * W * 0.7; y = -20; break;
        case 1: x = W + 20; y = cy + (Math.random() - 0.5) * H * 0.7; break;
        case 2: x = cx + (Math.random() - 0.5) * W * 0.7; y = H + 20; break;
        case 3: x = -20; y = cy + (Math.random() - 0.5) * H * 0.7; break;
      }
      const angle = Math.atan2(cy - y, cx - x);
      enemies.push({
        x, y, angle, speed: spawn.speed, hp: spawn.hp, maxHp: spawn.hp,
        boss: spawn.boss, dead: false, reached: false, flash: 0,
        walkOffset: Math.random() * Math.PI * 2,
        deathTime: 0,
      });
    }

    function placeTower(px, py) {
      const now = performance.now();
      if (done) return;
      if (now - lastTower < TOWER_COOLDOWN) return;
      if (Math.hypot(px - cx, py - cy) < PRZEMO_RADIUS + 24) return;
      towers.push({ x: px, y: py, placedAt: now, lastShot: 0, targetAngle: 0 });
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

    function spawnParticles(x, y, color, count) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 1 + Math.random() * 3;
        particles.push({
          x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
          life: 1, decay: 0.02 + Math.random() * 0.03, color, size: 2 + Math.random() * 3,
        });
      }
    }

    function loop(now) {
      if (!startTime) startTime = now;
      const elapsed = now - startTime;
      const dt = 16.67;

      // Wave announcements
      for (let wi = 0; wi < WAVES.length; wi++) {
        if (elapsed >= WAVES[wi].start && wi > currentWave) {
          currentWave = wi;
          waveTextAlpha = 1;
          waveTextTime = now;
        }
      }
      if (waveTextAlpha > 0 && now - waveTextTime > 1500) {
        waveTextAlpha = Math.max(0, waveTextAlpha - 0.02);
      }

      // Spawn
      while (spawnIdx < SPAWNS.length && elapsed >= SPAWNS[spawnIdx].t) {
        spawnEnemy(SPAWNS[spawnIdx]);
        spawnIdx++;
      }

      // Towers: aim and shoot
      towers = towers.filter(t => {
        if (now - t.placedAt >= TOWER_LIFETIME) return false;

        let target = null, minD = Infinity;
        for (const e of enemies) {
          if (e.dead || e.reached) continue;
          const d = Math.hypot(e.x - t.x, e.y - t.y);
          if (d <= TOWER_RANGE && d < minD) { minD = d; target = e; }
        }

        if (target) {
          t.targetAngle = Math.atan2(target.y - t.y, target.x - t.x);
          if (now - t.lastShot >= TOWER_FIRE_RATE) {
            t.lastShot = now;
            const a = t.targetAngle;
            projectiles.push({
              x: t.x + Math.cos(a) * 20, y: t.y + Math.sin(a) * 20,
              vx: Math.cos(a) * PROJ_SPEED, vy: Math.sin(a) * PROJ_SPEED,
              targetId: enemies.indexOf(target),
            });
          }
        }
        return true;
      });

      // Projectiles
      projectiles = projectiles.filter(p => {
        p.x += p.vx * (dt / 16.67);
        p.y += p.vy * (dt / 16.67);

        if (p.x < -50 || p.x > W + 50 || p.y < -50 || p.y > H + 50) return false;

        for (const e of enemies) {
          if (e.dead || e.reached) continue;
          const hitR = e.boss ? 22 : 14;
          if (Math.hypot(p.x - e.x, p.y - e.y) < hitR) {
            e.hp--;
            e.flash = 8;
            spawnParticles(p.x, p.y, '#f39c12', 4);
            if (e.hp <= 0) {
              e.dead = true;
              e.deathTime = now;
              killed++;
              spawnParticles(e.x, e.y, '#e74c3c', e.boss ? 16 : 8);
            }
            return false;
          }
        }
        return true;
      });

      // Enemies move
      for (const e of enemies) {
        if (e.dead || e.reached) continue;
        e.x += Math.cos(e.angle) * e.speed * (dt / 16.67);
        e.y += Math.sin(e.angle) * e.speed * (dt / 16.67);
        if (e.flash > 0) e.flash--;
        if (Math.hypot(e.x - cx, e.y - cy) < PRZEMO_RADIUS) {
          e.reached = true;
          przemoHp--;
          shakeUntil = now + 300;
          if (navigator.vibrate) navigator.vibrate(200);
          spawnParticles(cx, cy, '#e74c3c', 6);
          if (przemoHp <= 0 && !done) { done = true; cancelAnimationFrame(rafId); finish('lose'); return; }
        }
      }

      // Particles
      particles = particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        return p.life > 0;
      });

      // Win check
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
      // Screen shake
      let sx = 0, sy = 0;
      if (now < shakeUntil) {
        sx = (Math.random() - 0.5) * 8;
        sy = (Math.random() - 0.5) * 8;
      }
      ctx.save();
      ctx.translate(sx, sy);

      // Background – dark grass
      ctx.fillStyle = '#0a1f14';
      ctx.fillRect(-10, -10, W + 20, H + 20);

      // Subtle grid
      ctx.strokeStyle = 'rgba(47, 168, 138, 0.06)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
      for (let gy = 0; gy < H; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

      // Tower ranges
      for (const t of towers) {
        const rem = 1 - (now - t.placedAt) / TOWER_LIFETIME;
        ctx.beginPath();
        ctx.arc(t.x, t.y, TOWER_RANGE, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(31,111,92,${0.06 * rem})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(47,168,138,${0.15 * rem})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Towers
      for (const t of towers) {
        const rem = 1 - (now - t.placedAt) / TOWER_LIFETIME;
        drawTower(ctx, t, now, rem);
      }

      // Enemies
      for (const e of enemies) {
        if (e.reached) continue;
        if (e.dead) {
          // Death fade
          const fade = Math.max(0, 1 - (now - e.deathTime) / 400);
          if (fade <= 0) continue;
          ctx.globalAlpha = fade;
          drawEnemy(ctx, e, now);
          ctx.globalAlpha = 1;
        } else {
          drawEnemy(ctx, e, now);
        }
      }

      // Projectiles
      for (const p of projectiles) {
        drawProjectile(ctx, p);
      }

      // Particles
      for (const p of particles) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Przemo
      drawPrzemo(ctx, cx, cy, now);

      // HUD
      drawHUD(ctx, now, W, H, cx, przemoHp, killed);

      // Wave text
      if (waveTextAlpha > 0 && currentWave >= 0) {
        ctx.fillStyle = `rgba(255,255,255,${waveTextAlpha * 0.9})`;
        ctx.font = `bold ${Math.round(W * 0.055)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(WAVE_NAMES[currentWave] || '', cx, H * 0.18);
      }

      // Intro hint
      if (elapsed < 4000) {
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 1 - elapsed / 4000)})`;
        ctx.font = 'bold 15px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('👆 Dotknij aby postawić wieżyczkę', cx, H * 0.75);
      }

      ctx.restore();
    }

    function drawTower(ctx, t, now, rem) {
      ctx.save();
      ctx.translate(t.x, t.y);

      // Base platform
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(44,62,80,${0.5 + 0.5 * rem})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(52,73,94,${rem})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Inner ring
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(31,111,92,${0.6 + 0.4 * rem})`;
      ctx.fill();

      // Barrel
      ctx.rotate(t.targetAngle);
      ctx.fillStyle = `rgba(127,140,141,${0.6 + 0.4 * rem})`;
      roundRect(ctx, -3, -24, 6, 18, 2);
      ctx.fill();
      // Barrel tip
      ctx.fillStyle = `rgba(149,165,166,${0.7 + 0.3 * rem})`;
      roundRect(ctx, -4, -28, 8, 6, 2);
      ctx.fill();

      // Muzzle flash
      if (now - t.lastShot < 120) {
        const fl = 1 - (now - t.lastShot) / 120;
        ctx.fillStyle = `rgba(243,156,18,${fl})`;
        ctx.beginPath();
        ctx.arc(0, -30, 5 + fl * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,200,${fl * 0.8})`;
        ctx.beginPath();
        ctx.arc(0, -30, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      // Lifetime bar
      const barW = 28, barH = 3;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(t.x - barW / 2, t.y + 24, barW, barH);
      ctx.fillStyle = `hsl(${120 * rem}, 70%, 45%)`;
      ctx.fillRect(t.x - barW / 2, t.y + 24, barW * rem, barH);
    }

    function drawEnemy(ctx, e, now) {
      const s = e.boss ? 26 : 16;
      const headR = e.boss ? 11 : 7;
      const phase = (now * 0.007 + e.walkOffset) % (Math.PI * 2);
      const legSw = Math.sin(phase) * (e.boss ? 14 : 10);
      const armSw = Math.sin(phase + Math.PI) * (e.boss ? 12 : 8);
      const bob   = Math.abs(Math.sin(phase)) * 2;

      ctx.save();
      ctx.translate(e.x, e.y - bob);

      const col = e.flash > 0 ? '#fff' : (e.boss ? '#8e44ad' : '#c0392b');
      const colStroke = e.flash > 0 ? '#fff' : (e.boss ? '#9b59b6' : '#e74c3c');
      ctx.strokeStyle = colStroke;
      ctx.lineWidth = e.boss ? 3.5 : 2.5;
      ctx.lineCap = 'round';

      // Legs
      ctx.beginPath();
      ctx.moveTo(0, s * 0.45);
      ctx.lineTo(-legSw * 0.5, s + 4);
      ctx.moveTo(0, s * 0.45);
      ctx.lineTo(legSw * 0.5, s + 4);
      ctx.stroke();

      // Torso
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.15);
      ctx.lineTo(0, s * 0.45);
      ctx.stroke();

      // Arms
      ctx.beginPath();
      ctx.moveTo(0, s * 0.08);
      ctx.lineTo(-armSw * 0.5 - (e.boss ? 10 : 7), s * 0.35);
      ctx.moveTo(0, s * 0.08);
      ctx.lineTo(armSw * 0.5 + (e.boss ? 10 : 7), s * 0.35);
      ctx.stroke();

      // Head
      ctx.beginPath();
      ctx.arc(0, -s * 0.15 - headR, headR, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = colStroke;
      ctx.stroke();

      // "PRZYMORZANIN" on forehead
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${e.boss ? 8 : 6}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PRZYMO-', 0, -s * 0.15 - headR - 1);
      ctx.fillText('-RZANIN', 0, -s * 0.15 - headR + (e.boss ? 7 : 5));

      // HP bar
      if (e.maxHp > 1) {
        const bw = e.boss ? 36 : 26;
        const bh = 3;
        const by = -s * 0.15 - headR * 2 - 8;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(-bw / 2, by, bw, bh);
        ctx.fillStyle = e.hp > e.maxHp * 0.3 ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(-bw / 2, by, bw * (e.hp / e.maxHp), bh);
      }

      // Boss crown
      if (e.boss) {
        ctx.font = '12px system-ui';
        ctx.fillText('👑', 0, -s * 0.15 - headR * 2 - 14);
      }

      ctx.restore();
    }

    function drawProjectile(ctx, p) {
      // Trail
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 2.5, p.y - p.vy * 2.5);
      ctx.strokeStyle = 'rgba(241,196,15,0.4)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Bullet glow
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(241,196,15,0.3)';
      ctx.fill();

      // Bullet core
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#f1c40f';
      ctx.fill();
    }

    function drawPrzemo(ctx, x, y, now) {
      // Outer glow
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.003);
      ctx.beginPath();
      ctx.arc(x, y, PRZEMO_RADIUS + 6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(31,111,92,${0.15 + 0.1 * pulse})`;
      ctx.fill();

      // Shield circle
      ctx.beginPath();
      ctx.arc(x, y, PRZEMO_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#1a5c4a';
      ctx.fill();
      ctx.strokeStyle = '#2fa88a';
      ctx.lineWidth = 3;
      ctx.stroke();

      if (drawFace(ctx, x, y, PRZEMO_RADIUS - 2)) {
        ctx.beginPath();
        ctx.arc(x, y, PRZEMO_RADIUS, 0, Math.PI * 2);
        ctx.strokeStyle = '#2fa88a';
        ctx.lineWidth = 3;
        ctx.stroke();
        return;
      }

      // Przemo figure (stick) – zapas, gdy zdjęcie się nie wczytało
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      // Head
      ctx.beginPath();
      ctx.arc(x, y - 14, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#2fa88a';
      ctx.fill();
      ctx.stroke();
      // Torso
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x, y + 10);
      ctx.stroke();
      // Arms
      const armW = 10;
      ctx.beginPath();
      ctx.moveTo(x - armW, y + 2);
      ctx.lineTo(x, y - 2);
      ctx.lineTo(x + armW, y + 2);
      ctx.stroke();
      // Legs
      ctx.beginPath();
      ctx.moveTo(x - 8, y + 20);
      ctx.lineTo(x, y + 10);
      ctx.lineTo(x + 8, y + 20);
      ctx.stroke();
      // Label
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PRZEMO', x, y + 28);
    }

    function drawHUD(ctx, now, W, H, cx, hp, killed) {
      // HP hearts
      ctx.textAlign = 'left';
      ctx.font = '20px system-ui';
      for (let i = 0; i < PRZEMO_HP_MAX; i++) {
        ctx.fillText(i < hp ? '❤️' : '🖤', 12 + i * 28, 30);
      }

      // Kill counter
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(ctx, W - 130, 10, 120, 28, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px system-ui';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`☠ ${killed} / ${TOTAL}`, W - 16, 24);

      // Tower cooldown
      const cd = Math.max(0, TOWER_COOLDOWN - (now - lastTower));
      ctx.textAlign = 'center';
      const btnY = H - 32;
      const btnW = 180, btnH = 40;
      if (cd > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        roundRect(ctx, cx - btnW / 2, btnY - btnH / 2, btnW, btnH, 12);
        ctx.fill();
        // Progress bar inside
        const prog = 1 - cd / TOWER_COOLDOWN;
        ctx.fillStyle = 'rgba(31,111,92,0.4)';
        roundRect(ctx, cx - btnW / 2, btnY - btnH / 2, btnW * prog, btnH, 12);
        ctx.fill();
        ctx.fillStyle = '#aaa';
        ctx.font = '14px system-ui';
        ctx.textBaseline = 'middle';
        ctx.fillText(`⏱ ${(cd / 1000).toFixed(1)}s`, cx, btnY);
      } else {
        ctx.fillStyle = 'rgba(31,111,92,0.85)';
        roundRect(ctx, cx - btnW / 2, btnY - btnH / 2, btnW, btnH, 12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(47,168,138,0.6)';
        ctx.lineWidth = 2;
        roundRect(ctx, cx - btnW / 2, btnY - btnH / 2, btnW, btnH, 12);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 15px system-ui';
        ctx.textBaseline = 'middle';
        ctx.fillText('👆 Postaw wieżyczkę!', cx, btnY);
      }
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
        ctx.fillText('Przemo poległ!', cx, cy - 40);
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.round(W * 0.04)}px system-ui`;
        ctx.fillText(`Pokonano: ${killed} / ${TOTAL}`, cx, cy + 10);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `${Math.round(W * 0.035)}px system-ui`;
        ctx.fillText('Dotknij aby spróbować ponownie', cx, cy + 50);
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
  const cx = W / 2, cy = H / 2;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  ctx.fillRect(0, 0, W, H);
  drawPrzemoIconWin(ctx, cx, cy + 40, 52);
  await sleep(500);

  for (const line of WIN_TEXTS) {
    await animText(ctx, line, cx, cy - 60, W, H, cy + 40);
  }

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
  const fontSize = Math.min(22, Math.max(14, Math.round(W * 0.045)));
  const lineH = fontSize + 8;
  ctx.font = `bold ${fontSize}px system-ui`;

  // Zawijanie długich linii do szerokości ekranu
  const maxW = W * 0.86;
  const lines = [];
  for (const para of text.split('\n')) {
    let cur = '';
    for (const word of para.split(' ')) {
      const test = cur ? cur + ' ' + word : word;
      if (cur && ctx.measureText(test).width > maxW) { lines.push(cur); cur = word; }
      else cur = test;
    }
    lines.push(cur);
  }
  // Blok tekstu kończy się nad ikoną Przema
  const startY = Math.min(ty, iconY - 52 - 28 - (lines.length - 1) * lineH);

  async function frame(alpha) {
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(0, 0, W, H);
    drawPrzemoIconWin(ctx, cx, iconY, 52);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.font = `bold ${fontSize}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, cx, startY + i * lineH));
  }

  // Czas na przeczytanie: min. 4,5 s, dłuższe teksty dłużej
  const readMs = Math.max(4500, text.length * 90);
  for (let a = 0; a <= 1; a += 0.06) { await frame(a); await sleep(16); }
  await sleep(readMs);
  for (let a = 1; a >= 0; a -= 0.06) { await frame(a); await sleep(16); }
  await sleep(300);
}

function drawPrzemoIconWin(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#1f6f5c';
  ctx.fill();
  ctx.strokeStyle = '#2fa88a';
  ctx.lineWidth = 3;
  ctx.stroke();
  if (drawFace(ctx, x, y, r - 2)) return;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PRZEMO', x, y);
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

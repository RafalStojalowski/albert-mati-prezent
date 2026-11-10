// Minigra tenisowa: siatkotenisa z Przemem

const WIN_SCORE    = 5;
const PADDLE_H     = 14;
const BALL_R       = 10;
const BALL_SPEED   = 5;
const BALL_ACCEL   = 0.3;
const AI_SPEED     = 2.4;   // prędkość Przema (px/klatkę)
const AI_MISS      = 1.15;  // jak bardzo Przemo myli się w ocenie piłki (× szerokość paletki)
const SERVE_DELAY  = 800;

// Po wygranej odtwarzane jest nagranie Przema (scene-kort.js)
const WIN_TEXT = 'Wygrana!';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function startTennisGame() {
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

    const courtL = W * 0.05;
    const courtR = W * 0.95;
    const courtT = H * 0.08;
    const courtB = H * 0.92;
    const courtW = courtR - courtL;
    const courtH = courtB - courtT;
    const netY   = courtT + courtH / 2;

    const PADDLE_W = Math.min(100, W * 0.22);

    let playerX = W / 2;
    let aiX     = W / 2;
    let aiError = 0;   // błąd przewidywania Przema, losowany przy każdym odbiciu gracza
    let playerScore = 0;
    let aiScore     = 0;
    let ball = null;
    let done = false;
    let serving = true;
    let serveTimer = 0;
    let rafId = null;
    let lastTime = null;

    function resetBall(toPlayer) {
      serving = true;
      serveTimer = performance.now();
      ball = {
        x: W / 2,
        y: toPlayer ? netY + courtH * 0.15 : netY - courtH * 0.15,
        vx: (Math.random() < 0.5 ? -1 : 1) * (BALL_SPEED * 0.6),
        vy: toPlayer ? BALL_SPEED : -BALL_SPEED,
        speed: BALL_SPEED,
      };
    }

    resetBall(true);

    function onTouch(e) {
      e.preventDefault();
      if (done) return;
      const r = canvas.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      playerX = src.clientX - r.left;
    }
    function onMove(e) {
      if (done) return;
      const r = canvas.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      playerX = src.clientX - r.left;
    }
    canvas.addEventListener('touchstart', onTouch, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('mousedown', onTouch);
    canvas.addEventListener('mousemove', onMove);

    function loop(now) {
      if (!lastTime) lastTime = now;
      const dt = Math.min(now - lastTime, 32);
      lastTime = now;

      if (serving && now - serveTimer > SERVE_DELAY) serving = false;

      if (!serving && ball) {
        const spd = ball.speed + BALL_ACCEL * (playerScore + aiScore);
        const ratio = spd / ball.speed;

        ball.x += ball.vx * ratio * (dt / 16);
        ball.y += ball.vy * ratio * (dt / 16);

        if (ball.x - BALL_R < courtL) { ball.x = courtL + BALL_R; ball.vx = Math.abs(ball.vx); }
        if (ball.x + BALL_R > courtR) { ball.x = courtR - BALL_R; ball.vx = -Math.abs(ball.vx); }

        const playerPaddleY = courtB - 20;
        if (ball.vy > 0 && ball.y + BALL_R >= playerPaddleY && ball.y - BALL_R < playerPaddleY + PADDLE_H) {
          if (ball.x > playerX - PADDLE_W / 2 - BALL_R && ball.x < playerX + PADDLE_W / 2 + BALL_R) {
            ball.vy = -Math.abs(ball.vy);
            ball.y = playerPaddleY - BALL_R;
            const off = (ball.x - playerX) / (PADDLE_W / 2);
            ball.vx = off * spd * 0.8;
            aiError = (Math.random() - 0.5) * PADDLE_W * AI_MISS;
          }
        }

        const aiPaddleY = courtT + 20;
        if (ball.vy < 0 && ball.y - BALL_R <= aiPaddleY + PADDLE_H && ball.y + BALL_R > aiPaddleY) {
          if (ball.x > aiX - PADDLE_W / 2 - BALL_R && ball.x < aiX + PADDLE_W / 2 + BALL_R) {
            ball.vy = Math.abs(ball.vy);
            ball.y = aiPaddleY + PADDLE_H + BALL_R;
            const off = (ball.x - aiX) / (PADDLE_W / 2);
            ball.vx = off * spd * 0.7;
          }
        }

        if (ball.y > courtB + BALL_R * 2) {
          aiScore++;
          if (aiScore >= WIN_SCORE) { done = true; cancelAnimationFrame(rafId); finish('lose'); return; }
          resetBall(true);
        }
        if (ball.y < courtT - BALL_R * 2) {
          playerScore++;
          if (playerScore >= WIN_SCORE) { done = true; cancelAnimationFrame(rafId); finish('win'); return; }
          resetBall(false);
        }
      }

      // AI
      // Przemo goni piłkę tylko gdy leci do niego (z błędem), inaczej wraca na środek
      const aiTarget = ball && ball.vy < 0 ? ball.x + aiError : W / 2;
      const aiDiff = aiTarget - aiX;
      const maxMove = AI_SPEED * (dt / 16);
      if (Math.abs(aiDiff) > 2) aiX += Math.sign(aiDiff) * Math.min(Math.abs(aiDiff), maxMove);
      aiX = Math.max(courtL + PADDLE_W / 2, Math.min(courtR - PADDLE_W / 2, aiX));

      draw(now);
      rafId = requestAnimationFrame(loop);
    }

    function draw(now) {
      // Tło kort
      ctx.fillStyle = '#1a6e3a';
      ctx.fillRect(0, 0, W, H);

      // Kort
      ctx.fillStyle = '#2d8a4e';
      ctx.fillRect(courtL, courtT, courtW, courtH);

      // Linie kortu
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(courtL, courtT, courtW, courtH);

      // Siatka
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(courtL, netY);
      ctx.lineTo(courtR, netY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Linie serwisowe
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(courtL, courtT + courtH * 0.3);
      ctx.lineTo(courtR, courtT + courtH * 0.3);
      ctx.moveTo(courtL, courtB - courtH * 0.3);
      ctx.lineTo(courtR, courtB - courtH * 0.3);
      ctx.moveTo(W / 2, courtT);
      ctx.lineTo(W / 2, courtB);
      ctx.stroke();

      // AI paddle (Przemo)
      const aiPaddleY = courtT + 20;
      ctx.fillStyle = '#c0392b';
      roundRect(ctx, aiX - PADDLE_W / 2, aiPaddleY, PADDLE_W, PADDLE_H, 7);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PRZEMO', aiX, aiPaddleY + PADDLE_H / 2);

      // Player paddle
      const playerPaddleY = courtB - 20;
      ctx.fillStyle = '#1f6f5c';
      roundRect(ctx, playerX - PADDLE_W / 2, playerPaddleY, PADDLE_W, PADDLE_H, 7);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px system-ui';
      ctx.fillText('TY', playerX, playerPaddleY + PADDLE_H / 2);

      // Ball
      if (ball) {
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#d4ac0d';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Score
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      roundRect(ctx, W / 2 - 60, 6, 120, 32, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${playerScore} : ${aiScore}`, W / 2, 22);

      // Labels
      ctx.font = '12px system-ui';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText('Ty', W / 2 - 40, 22);
      ctx.fillText('Przemo', W / 2 + 44, 22);

      // Instructions at start
      if (playerScore === 0 && aiScore === 0 && serving) {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = 'bold 16px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('← Przesuń palec aby sterować →', W / 2, H / 2 + courtH * 0.3);
        ctx.font = '14px system-ui';
        ctx.fillText(`Pierwszy do ${WIN_SCORE} wygrywa!`, W / 2, H / 2 + courtH * 0.3 + 28);
      }
    }

    function finish(result) {
      canvas.removeEventListener('touchstart', onTouch);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('mousedown', onTouch);
      canvas.removeEventListener('mousemove', onMove);
      if (result === 'lose') {
        ctx.fillStyle = 'rgba(0,0,0,0.78)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#e74c3c';
        ctx.font = `bold ${Math.round(W * 0.07)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Przegrywka!', W / 2, H / 2 - 30);
        ctx.fillStyle = '#fff';
        ctx.font = `${Math.round(W * 0.04)}px system-ui`;
        ctx.fillText(`${playerScore} : ${aiScore}`, W / 2, H / 2 + 10);
        ctx.fillText('Dotknij aby spróbować ponownie', W / 2, H / 2 + 50);
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

  // Trophy icon
  ctx.fillStyle = '#f1c40f';
  ctx.font = '60px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🏆', W / 2, H / 2 + 40);

  await sleep(600);

  const lines = WIN_TEXT.split('\n');
  const fontSize = Math.min(22, Math.max(14, Math.round(W * 0.045)));

  for (let a = 0; a <= 1; a += 0.05) {
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f1c40f';
    ctx.font = '60px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏆', W / 2, H / 2 + 40);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.font = `bold ${fontSize}px system-ui`;
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

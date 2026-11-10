// Scena siódmego punktu: Wiadukt – FINAŁ
// Kamera → zdjęcie wiaduktu → gratulacje → sekwencja urodzinowa z konfetti

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fadeTo(el, opacity, ms) {
  el.style.transition = `opacity ${ms}ms ease`;
  el.style.opacity = String(opacity);
  return sleep(ms);
}

export async function startWiaduktScene({ origin, sceneTarget, overlay, onEnd, devMode }) {
  // 1. Kamera
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

  // 2. Zdjęcie wiaduktu
  const photoEl = document.createElement('div');
  photoEl.className = 'radziun-photo';
  photoEl.innerHTML = '<img src="src/przemo.jpg" alt="Wiadukt">';
  document.body.appendChild(photoEl);

  // UI overlay
  const labelEl  = overlay.querySelector('.ar-label');
  const hintEl   = overlay.querySelector('.ar-hint');
  const bottomEl = overlay.querySelector('.ar-bottom');
  const ORIG_BTM = bottomEl.innerHTML;

  labelEl.textContent = 'Cel podróży!';
  hintEl.textContent  = '';
  bottomEl.innerHTML  = '';
  overlay.classList.remove('hidden');

  let cancelled = false;

  // 3. Kontener finałowy (na wierzchu wszystkiego)
  const finaleEl = document.createElement('div');
  finaleEl.className = 'wiadukt-finale';
  finaleEl.style.opacity = '0';
  document.body.appendChild(finaleEl);

  // Canvas na konfetti
  const confettiCanvas = document.createElement('canvas');
  confettiCanvas.className = 'wiadukt-confetti';
  finaleEl.appendChild(confettiCanvas);

  // Tekst gratulacji
  const textBox = document.createElement('div');
  textBox.className = 'wiadukt-text';
  finaleEl.appendChild(textBox);

  function cleanupAll() {
    stream.getTracks().forEach(t => t.stop());
    video.remove();
    if (photoEl.parentElement) photoEl.remove();
    if (finaleEl.parentElement) finaleEl.remove();
    labelEl.textContent = '';
    hintEl.textContent  = '';
    bottomEl.innerHTML  = ORIG_BTM;
    overlay.classList.add('hidden');
  }

  // Krótka pauza z kamerą + zdjęciem
  if (devMode) {
    hintEl.textContent = '[DEV] Dotknij aby pominąć';
    await Promise.race([
      sleep(2000),
      new Promise(r => overlay.addEventListener('click', r, { once: true })),
    ]);
  } else {
    await sleep(3000);
  }

  if (cancelled) return;

  // 4. Fade out zdjęcia, fade in finału
  await fadeTo(photoEl, 0, 1200);
  photoEl.remove();

  // Ukryj overlay AR
  overlay.classList.add('hidden');

  // Pokaż ekran finałowy
  await fadeTo(finaleEl, 1, 800);

  if (cancelled) return;

  // 5. Uruchom konfetti
  const confettiRaf = startConfetti(confettiCanvas);

  // 6. Sekwencja tekstów
  const texts = [
    { text: 'Gratulacje!', size: 'big', duration: 2500 },
    { text: 'Ukończyliście\nZaspiański Spacer!', size: 'medium', duration: 3000 },
    { text: 'Wszystkiego najlepszego\nAlbert i Mati!', size: 'big', duration: 3500 },
    { text: '🎂🎉🎈', size: 'emoji', duration: 2500 },
    { text: 'Przemo jest z Was dumny!', size: 'medium', duration: 3000 },
    { text: 'Dotknij aby zakończyć', size: 'small', duration: 0 },
  ];

  for (const item of texts) {
    if (cancelled) break;

    textBox.className = 'wiadukt-text wiadukt-text-' + item.size;
    textBox.innerHTML = item.text.split('\n').map(l => `<div>${l}</div>`).join('');
    textBox.style.opacity = '0';
    await fadeTo(textBox, 1, 600);

    if (item.duration > 0) {
      await sleep(item.duration);
      await fadeTo(textBox, 0, 500);
    }
  }

  if (cancelled) return;

  // Czekaj na tap
  await new Promise(res => {
    finaleEl.addEventListener('click', res, { once: true });
    finaleEl.addEventListener('touchstart', res, { once: true, passive: true });
  });

  // Zatrzymaj konfetti
  cancelAnimationFrame(confettiRaf.id);

  // Fade out
  await fadeTo(finaleEl, 0, 1000);

  cleanupAll();
  onEnd && onEnd();
}

// ---------- Konfetti ----------

function startConfetti(canvas) {
  const W = canvas.width  = window.innerWidth;
  const H = canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');

  const EMOJIS = ['🎉', '🎂', '🎈', '🎁', '⭐', '🥳', '🎊', '💛'];
  const COUNT  = 60;

  const particles = [];
  for (let i = 0; i < COUNT; i++) {
    particles.push({
      x: Math.random() * W,
      y: Math.random() * -H,
      vx: (Math.random() - 0.5) * 2,
      vy: 1.5 + Math.random() * 3,
      rot: Math.random() * 360,
      rotV: (Math.random() - 0.5) * 6,
      emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
      size: 18 + Math.random() * 18,
    });
  }

  const state = { id: 0 };

  function loop() {
    ctx.clearRect(0, 0, W, H);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.rotV;

      if (p.y > H + 40) {
        p.y = -40;
        p.x = Math.random() * W;
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.font = `${p.size}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.emoji, 0, 0);
      ctx.restore();
    }

    state.id = requestAnimationFrame(loop);
  }

  state.id = requestAnimationFrame(loop);
  return state;
}

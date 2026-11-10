// Scena siódmego punktu: Wiadukt – FINAŁ
// Gratulacje i sekwencja urodzinowa z konfetti → "Zobacz wiadukt" →
// kamera, w której w kierunku wiaduktu (scene.target) wisi zdjęcie wiadukt.jpg
// (przesuwa się przy obracaniu i pochylaniu telefonu), a pod nim pojawiają się
// życzenia. Przy kolejnych otwarciach kamery od razu włącza się wiadukt (pamiątka).

import { openAnchorView } from './anchor-view.js';
import { bearingTo } from './aim-arrow.js';

const PHOTO = 'src/wiadukt.jpg';
// Zerowane razem z postępem gry (menu → Wyzeruj postęp)
const SEEN_KEY = ((window.GAME_CONFIG && window.GAME_CONFIG.storageKey) || 'zaspa') + '-wiadukt-seen';

// Napisy wyświetlane przy zdjęciu wiaduktu
const CAPTIONS = [
  'Wszystkiego najlepszego z okazji urodzin!',
  'To jest specjalna pamiątka, do której zawsze możecie wracać',
  'Będziecie mogli zobaczyć wiadukt nawet gdy go już nie będzie z nami',
  ':(',
];
const CAPTION_MS = 4000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fadeTo(el, opacity, ms) {
  el.style.transition = `opacity ${ms}ms ease`;
  el.style.opacity = String(opacity);
  return sleep(ms);
}

function finaleSeen() {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch (_) { return false; }
}
function markFinaleSeen() {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch (_) { /* ignoruj */ }
}

export async function startWiaduktScene({ origin, sceneTarget, onEnd }) {
  try {
    let showFinale = !finaleSeen();
    while (true) {
      if (showFinale) {
        await playFinale();
        markFinaleSeen();
      }
      const result = await viewWiadukt(bearingTo(origin, sceneTarget));
      if (result !== 'replay') break;
      showFinale = true;
    }
  } finally {
    onEnd && onEnd();
  }
}

// ---------- Finał: gratulacje + konfetti ----------

async function playFinale() {
  const finaleEl = document.createElement('div');
  finaleEl.className = 'wiadukt-finale';
  finaleEl.style.opacity = '0';
  document.body.appendChild(finaleEl);

  const confettiCanvas = document.createElement('canvas');
  confettiCanvas.className = 'wiadukt-confetti';
  finaleEl.appendChild(confettiCanvas);

  const textBox = document.createElement('div');
  textBox.className = 'wiadukt-text';
  finaleEl.appendChild(textBox);

  await fadeTo(finaleEl, 1, 800);
  const confettiRaf = startConfetti(confettiCanvas);

  const texts = [
    { text: 'Gratulacje!', size: 'big', duration: 2500 },
    { text: 'To koniec\nZaspiańskiego spaceru!', size: 'medium', duration: 3000 },
    { text: 'Wszystkiego najlepszego\nAlbert i Mati!', size: 'big', duration: 3500 },
    { text: '🎂🎉🎈', size: 'emoji', duration: 2500 },
    { text: 'Przemo jest z Was dumny!', size: 'medium', duration: 3000 },
    { text: 'Oto Wasza nagroda…', size: 'medium', duration: 0 },
  ];

  for (const item of texts) {
    textBox.className = 'wiadukt-text wiadukt-text-' + item.size;
    textBox.innerHTML = item.text.split('\n').map(l => `<div>${l}</div>`).join('');
    textBox.style.opacity = '0';
    await fadeTo(textBox, 1, 600);
    if (item.duration > 0) {
      await sleep(item.duration);
      await fadeTo(textBox, 0, 500);
    }
  }

  // Przycisk przejścia do nagrody (gest potrzebny m.in. do czujników na iOS)
  const btn = document.createElement('button');
  btn.className = 'wiadukt-reward-btn';
  btn.textContent = '📷 Zobacz wiadukt';
  finaleEl.appendChild(btn);
  await new Promise(res => btn.addEventListener('click', res, { once: true }));

  cancelAnimationFrame(confettiRaf.id);
  finaleEl.remove();
}

// ---------- Nagroda: wiadukt na kamerce w jego kierunku ----------

async function viewWiadukt(bearing) {
  const view = await openAnchorView({ hint: 'Wiadukt – pamiątka na zawsze' });

  const img = document.createElement('img');
  img.src = PHOTO;
  img.alt = 'Wiadukt';
  img.classList.add('vm-wide');
  const it = view.anchor(img, { bearing });
  view.guide(it);

  view.controls.innerHTML =
    '<button class="wiadukt-replay" aria-label="Powtórz finał">🎉 Powtórz finał</button>';
  const replay = new Promise(res =>
    view.controls.querySelector('.wiadukt-replay').addEventListener('click', res, { once: true }));

  // Napisy pod wiaduktem – po pierwszym znalezieniu zdjęcia
  const caption = document.createElement('div');
  caption.className = 'vm-caption';
  caption.style.opacity = '0';
  view.layer.appendChild(caption);
  (async () => {
    await view.waitFound(it);
    await sleep(1500);
    for (const line of CAPTIONS) {
      if (!view.running) return;
      caption.textContent = line;
      await fadeTo(caption, 1, 700);
      await sleep(CAPTION_MS);
      if (line !== CAPTIONS[CAPTIONS.length - 1]) await fadeTo(caption, 0, 600);
    }
  })();

  const result = await Promise.race([
    view.closed.then(() => 'close'),
    replay.then(() => 'replay'),
  ]);
  view.close();
  return result;
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

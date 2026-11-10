// Wspólny odtwarzacz nagrań Przema.
// Pokazuje nagranie na środku ekranu (nad kamerą albo na ciemnym tle),
// próbuje odtworzyć z dźwiękiem; gdy przeglądarka blokuje autoplay –
// pokazuje przycisk "▶ Odtwórz". Po nagraniu: "Obejrzyj jeszcze raz" / "Dalej".
// Zwraca Promise, który kończy się po kliknięciu "Dalej".

export function playVideoMessage(src, { overCamera = false } = {}) {
  return new Promise(resolve => {
    const layer = document.createElement('div');
    layer.className = 'video-msg' + (overCamera ? ' over-camera' : '');

    const vid = document.createElement('video');
    vid.src = src;
    vid.preload = 'auto';
    vid.setAttribute('playsinline', '');
    vid.setAttribute('webkit-playsinline', '');
    layer.appendChild(vid);

    const playBtn = document.createElement('button');
    playBtn.className = 'video-msg-play';
    playBtn.textContent = '▶ Odtwórz nagranie';
    playBtn.style.display = 'none';
    layer.appendChild(playBtn);

    const endEl = document.createElement('div');
    endEl.className = 'video-msg-end';
    endEl.style.display = 'none';
    endEl.innerHTML =
      '<button class="again">↺ Obejrzyj jeszcze raz</button>' +
      '<button class="done">Dalej</button>';
    layer.appendChild(endEl);

    document.body.appendChild(layer);
    requestAnimationFrame(() => layer.classList.add('visible'));

    function start() {
      playBtn.style.display = 'none';
      endEl.style.display = 'none';
      vid.play().catch(() => { playBtn.style.display = ''; });
    }

    playBtn.addEventListener('click', () => {
      vid.muted = false;
      start();
    });
    vid.addEventListener('ended', () => { endEl.style.display = ''; });
    vid.addEventListener('error', () => { endEl.style.display = ''; });
    endEl.querySelector('.again').addEventListener('click', () => {
      vid.currentTime = 0;
      start();
    });
    endEl.querySelector('.done').addEventListener('click', () => {
      vid.pause();
      layer.classList.remove('visible');
      setTimeout(() => { layer.remove(); resolve(); }, 400);
    });

    start();
  });
}

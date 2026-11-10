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
      el.style.display = '';
      const left = diff > 0;
      el.classList.toggle('left', left);
      el.classList.toggle('right', !left);
      el.style.opacity = Math.min(1, 0.55 + Math.abs(diff) / 60).toFixed(2);
    },
    hide() { el.style.display = 'none'; },
    remove() { el.remove(); },
  };
}

// Tekst podpowiedzi zgodny ze strzałką
export function turnHint(diff) {
  return diff > 0 ? '← Obróć w lewo' : 'Obróć w prawo →';
}

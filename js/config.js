// Konfiguracja gry – tutaj podmieniasz punkty, promień zaliczenia itp.
window.GAME_CONFIG = {
  // Klucz w localStorage – zmień, jeśli chcesz wyzerować postęp wszystkim graczom
  storageKey: 'zaspa-gra-v1',

  // Środek mapy na starcie (Gdańsk Zaspa)
  mapCenter: [54.3917, 18.6045],
  mapZoom: 16,

  // Z jakiej odległości (w metrach) punkt uznajemy za odwiedzony
  reachRadius: 25,

  // Punkty na mapie – na razie przykładowe, rozrzucone po Zaspie
  spots: [
    { id: 'p1', name: 'Punkt 1', lat: 54.3948, lng: 18.6060 },
    { id: 'p2', name: 'Punkt 2', lat: 54.3940, lng: 18.6105 },
    { id: 'p3', name: 'Punkt 3', lat: 54.3912, lng: 18.6000 },
    { id: 'p4', name: 'Punkt 4', lat: 54.3892, lng: 18.6041 },
    { id: 'p5', name: 'Punkt 5', lat: 54.3881, lng: 18.5998 },
  ],
};

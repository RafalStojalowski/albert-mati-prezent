// Konfiguracja gry – tutaj podmieniasz punkty, promień zaliczenia itp.
window.GAME_CONFIG = {
  // Klucz w localStorage – zmień, aby wyzerować postęp wszystkim graczom
  storageKey: 'zaspa-gra-v3',

  // Środek mapy na starcie
  mapCenter: [54.3960, 18.5990],
  mapZoom: 14,

  // Z jakiej odległości (w metrach) punkt uznajemy za odwiedzony
  reachRadius: 30,

  // Punkty są sekwencyjne – każdy odblokowany dopiero po zaliczeniu poprzedniego.
  spots: [
    // 1) Plaża Brzeźno – jedyny punkt widoczny od startu
    {
      id: 'brzezno-plaza',
      lat: 54.4121,
      lng: 18.6289,
      radius: 50,
      scene: {
        type: 'brzezno',
        target: { lat: 54.4141, lng: 18.6289 },
      },
    },
    // 2) Pętla tramwajowa
    {
      id: 'zaspa-1',
      lat: 54.39981,
      lng: 18.59506,
      hidden: true,
      revealRadius: 500,
      scene: {
        type: 'zaspa1',
        // Kierunek, w który gracz ma skierować kamerę (tam stoi Przemo)
        target: { lat: 54.39964, lng: 18.59528 },
      },
    },
    // 3) Radziun – pod blokiem
    {
      id: 'zaspa-radziun',
      lat: 54.3955,
      lng: 18.6110,
      hidden: true,
      revealRadius: 500,
      scene: {
        type: 'radziun',
        target: { lat: 54.3955, lng: 18.6110 },
      },
    },
    // 4) PZU
    {
      id: 'zaspa-pzu',
      lat: 54.3934,
      lng: 18.6092,
      hidden: true,
      revealRadius: 500,
      scene: {
        type: 'pzu',
        target: { lat: 54.3937, lng: 18.6093 },
      },
    },
    // 5) Kort tenisowy
    {
      id: 'zaspa-kort',
      lat: 54.3890,
      lng: 18.5994,
      hidden: true,
      revealRadius: 500,
      scene: {
        type: 'kort',
        target: { lat: 54.3889, lng: 18.5992 },
        enterRadius: 6,
      },
    },
    // 6) Sahara
    {
      id: 'zaspa-sahara',
      lat: 54.3942,
      lng: 18.5939,
      hidden: true,
      revealRadius: 500,
      scene: {
        type: 'sahara',
        target: { lat: 54.3944, lng: 18.5942 },
      },
    },
    // 7) Wiadukt – finał
    {
      id: 'wiadukt',
      lat: 54.3945,
      lng: 18.5999,
      hidden: true,
      revealRadius: 500,
      scene: {
        type: 'wiadukt',
        target: { lat: 54.3946, lng: 18.6018 },
      },
    },
  ],
};

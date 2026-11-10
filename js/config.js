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
      lat: 54.39344,
      lng: 18.60917,
      hidden: true,
      revealRadius: 500,
      scene: {
        type: 'pzu',
        // Kierunek, w którym na kamerce wisi nagranie Przema
        target: { lat: 54.39369, lng: 18.60928 },
      },
    },
    // 5) Kort tenisowy
    {
      id: 'zaspa-kort',
      lat: 54.38900,
      lng: 18.59942,
      hidden: true,
      revealRadius: 500,
      scene: {
        type: 'kort',
        // Kierunek, w którym na kamerce stoi Przemo (i potem jego nagranie)
        target: { lat: 54.38894, lng: 18.59917 },
      },
    },
    // 6) Sahara
    {
      id: 'zaspa-sahara',
      lat: 54.39422,
      lng: 18.59386,
      hidden: true,
      revealRadius: 500,
      scene: {
        type: 'sahara',
        // Kierunek, w który gracz ma skierować kamerę (tam kręci się Przemo)
        target: { lat: 54.39439, lng: 18.59422 },
      },
    },
    // 7) Wiadukt – finał
    {
      id: 'wiadukt',
      lat: 54.39453,
      lng: 18.59986,
      hidden: true,
      revealRadius: 500,
      scene: {
        type: 'wiadukt',
        // Kierunek, w którym na kamerce widać zdjęcie wiaduktu (nagroda)
        target: { lat: 54.39461, lng: 18.60178 },
      },
    },
  ],
};

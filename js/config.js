// Konfiguracja gry – tutaj podmieniasz punkty, promień zaliczenia itp.
window.GAME_CONFIG = {
  // Klucz w localStorage – zmień, aby wyzerować postęp wszystkim graczom
  storageKey: 'zaspa-gra-v2',

  // Środek mapy na starcie
  mapCenter: [54.3940, 18.6010],
  mapZoom: 14,

  // Z jakiej odległości (w metrach) punkt uznajemy za odwiedzony
  reachRadius: 30,

  // Punkty są sekwencyjne – każdy odblokowany dopiero po zaliczeniu poprzedniego.
  spots: [
    {
      id: 'brzezno-plaza',
      name: 'Plaża Brzeźno',
      lat: 54.4030,
      lng: 18.5942,
      radius: 50,
      scene: {
        type: 'brzezno',
        // Punkt nad morzem, w który trzeba wycelować (~220 m od brzegu, prosto na północ)
        target: { lat: 54.4050, lng: 18.5942 },
      },
    },
    {
      id: 'zaspa-1',
      name: 'Pętla tramwajowa',
      lat: 54.3960,
      lng: 18.6018,
      hidden: true,       // znacznik niewidoczny dopóki gracz nie jest blisko
      revealRadius: 500,  // metry – pokaż znacznik + toast
      scene: {
        type: 'zaspa1',
        target: { lat: 54.3960, lng: 18.6018 }, // GPS gdzie stoi AR-owe zdjęcie
        enterRadius: 6,  // metry – wejście w zdjęcie odpala minigrę
      },
    },
    {
      id: 'zaspa-2',
      name: 'Zaspa – Murale',
      lat: 54.3948,
      lng: 18.6052,
    },
    {
      id: 'zaspa-3',
      name: 'Zaspa – Rynek',
      lat: 54.3918,
      lng: 18.6068,
    },
    {
      id: 'zaspa-4',
      name: 'Zaspa – Boisko',
      lat: 54.3895,
      lng: 18.6052,
    },
    {
      id: 'zaspa-5',
      name: 'Zaspa – Skwer',
      lat: 54.3870,
      lng: 18.6055,
    },
    {
      id: 'wiadukt',
      name: 'Wiadukt',
      lat: 54.3845,
      lng: 18.6058,
      // Widok AR z zachowanym obrazem wiaduktu.
      // Zastąp src/rataj.jpg swoim zdjęciem wiaduktu i dostosuj współrzędne targetu.
      ar: {
        targets: [
          {
            name: 'Wiadukt Zaspa',
            lat: 54.3835,
            lng: 18.6060,
            image: 'src/rataj.jpg',
            width: 50,
            elevation: 4,
          },
        ],
      },
    },
  ],
};

// Konfiguracja gry – tutaj podmieniasz punkty, promień zaliczenia itp.
window.GAME_CONFIG = {
  // Klucz w localStorage – zmień, jeśli chcesz wyzerować postęp wszystkim graczom
  storageKey: 'zaspa-gra-v1',

  // Środek mapy na starcie (Gdańsk Zaspa)
  mapCenter: [54.3917, 18.6045],
  mapZoom: 16,

  // Z jakiej odległości (w metrach) punkt uznajemy za odwiedzony
  reachRadius: 25,

  spots: [
    {
      id: 'p1',
      name: 'Punkt 1',
      lat: 54.393750,   // 54°23'37.5"N
      lng: 18.610361,   // 18°36'37.3"E

      // Po odwiedzeniu punktu odblokowuje się kamera z obiektami AR
      ar: {
        targets: [
          {
            name: 'Boisko',
            lat: 54.393667,   // 54°23'37.2"N
            lng: 18.609222,   // 18°36'33.2"E
            image: 'src/przemo.jpg',
            width: 14,        // szerokość zdjęcia w metrach (wysokość wg proporcji)
            elevation: 4,     // dolna krawędź zdjęcia nad ziemią, w metrach
          },
        ],
      },
    },
  ],
};

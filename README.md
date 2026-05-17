# Skanuj UX Demo

Narzędzie do prezentacji UX aplikacji dla niewidomych.

## Uruchomienie
1. Zainstaluj zależności: `npm install`
2. Uruchom serwer: `npm start`
3. Na iPhonie wejdź na: `http://TWOJE_IP:3000/phone`
4. Na Macu wejdź na: `http://localhost:3000/controller`

## Funkcje
- **PWA**: Dodaj do ekranu głównego na iPhonie, aby ukryć paski przeglądarki.
- **IMU**: Skanowanie wymaga fizycznego obrotu telefonu (najpierw w lewo, potem w prawo).
- **Audio**: Narastające piknięcia o różnej barwie dla lewej i prawej strony.
- **Kontroler**: Zdalne wyzwalanie statusów SAFE/STOP, resetowanie dema i przełączanie języka.
- **Kamera**: Live feed z kamery lub animowany gradient jako backup.

## Sterowanie z klawiatury (opcjonalnie)
Możesz rozbudować kontroler o obsługę klawiatury dla jeszcze szybszej reakcji na scenie.

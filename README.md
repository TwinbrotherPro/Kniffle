# Kniffle

An installable, offline-capable Kniffel web app for pass-and-play on one phone.

- 1–8 players, matches of 1–20 games (most game wins takes the match, total points break ties)
- **Roll in app** (3 rolls, tap dice to hold) or **Real dice** (tap in what you rolled; the app scores it)
- Scoresheet with live previews, upper-section bonus tracker (+/− vs. three of each), undo of the last score
- Match results: game wins, totals, average/best/worst, upper bonus rate, Kniffels, cumulative points chart
- All-time stats per player and match history (stored locally on the device)
- Progress is saved continuously, so you can close the app and resume

No build step — plain HTML/CSS/JS.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Install on your phone

A PWA has to be served over HTTPS. The included workflow deploys to GitHub Pages:

1. In the repo settings → **Pages**, set **Source** to **GitHub Actions**.
2. Push to `main` (or run the workflow manually).
3. Open the Pages URL on your phone:
   - **Android/Chrome:** menu → *Install app* / *Add to Home screen*
   - **iOS/Safari:** Share → *Add to Home Screen*

When you change app files, bump `VERSION` in `sw.js` so installed copies update.

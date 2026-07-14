# DTF // TEXT AUTOBATTLER — phone install + auto-update
Web app by Aj. PWA-ready: install on phone as an app icon, auto-updates on every deploy.

## Quick start (laptop, local)
    cd web
    python -m http.server 8137 --bind 0.0.0.0
Then open http://localhost:8137/ on the laptop.

## Publish to GitHub Pages (so your PHONE can install + auto-update)
1) Make a repo on github.com (e.g. `dtf-autobattler`) — public.
2) From this folder, run ONCE to connect:
       git remote add origin https://github.com/<you>/<repo>.git
3) Every time you change the game, publish with ONE command:
       git add -A && git commit -m "update" && git push
4) GitHub → repo Settings → Pages → Source: "Deploy from a branch" → branch `main`, folder `/ (root)` → Save.
5) Wait ~1 min. Your game is live at:
       https://<you>.github.io/<repo>/
6) On your Samsung S25 (Chrome): open that URL → ⋮ menu → "Add to Home Screen".
   It now lives as a green DTF app icon.
7) AUTO-UPDATE: next time you run the publish command (step 3), the phone
   reloads the new version automatically (service worker = network-first).
   Optional: bump CACHE in sw.js ("dtf-v2" → "dtf-v3") to force a hard refresh.

## Move your SAVE between devices
Settings are per-device. Use the SHOP → "COPY" export code (DTF1:…), then
on the other device SHOP → "IMPORT CODE". (True cloud-sync of progress would
need a backend — optional later.)

## Files
  index.html        UI shell + PWA wiring
  engine.js         game logic (faithful JS port of game_core.py)
  ui.js             controller: modes, heroes, shop, SFX, BGM, animations
  sw.js             service worker (network-first = auto-update)
  manifest.webmanifest, icon-192/512.png   PWA install assets
  engine.test.js, uijsdom.test.js   headless tests (node + jsdom)

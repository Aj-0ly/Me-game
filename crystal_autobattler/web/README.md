# DTF // TEXT AUTOBATTLER — WEB (cross-device)

A **roguelite text-RPG autobattler** you can play **in any browser** — your
Samsung S25 Ultra (phone) and your Windows laptop both work, no install.
Retro green-on-black terminal look, animated combat, persistent SHOP.

> The original Python/Tk desktop version lives one folder up (`../main.py`).

## How to play it
```
cd crystal_autobattler/web
python -m http.server 8137
```
Open `http://localhost:8137/` on your laptop, OR on your phone (same Wi-Fi)
`http://<laptop-ip>:8137/`. For **true anywhere access**, deploy the `web/`
folder to any static host (GitHub Pages / Netlify / Vercel / Cloudflare
Pages / itch.io) — it's just 3 static files, no backend.

## What's new (v2 — "go all in")
- **RETRY** on the death screen — re-run the *same* warband instantly (no
  re-draft). Plus NEW RUN / SHOP buttons on every end screen.
- **Smoother combat juice**: floating damage numbers, hit-shake, **crit
  screen flash**, and an animated **WAVE banner** between waves.
- **⚙ Settings** (persisted): Sound FX, Scanlines, Hit particles,
  **Auto-battle** (hands-free idle mode), and **Animation speed** (0.5×/1×/2×).
- **Procedural WebAudio SFX** — retro beeps for hits/crits/wins/loot/levels.
  No asset files needed.
- **Status-effect icons** on each card (burn 🔥 / slow ❄ / buff ▲ / taunt ⛨)
  and a dead-tint when a unit falls.
- **Combo counter** in the waybar; builds while you land hits, tracks your
  best in `bestCombo`.
- **Achievements** (6) + **best-run tracking** (best wave / wins / top combo)
  persisted across runs.
- **Cross-device saves**: SHOP → COPY the `DTF1:` code → IMPORT on the
  other device.

## Controls (touch + mouse)
Title: NEW RUN / SHOP / ⚙ / HOW TO PLAY. Draft: tap ≤5 class cards, START.
Battle: ⚔ ENGAGE WAVE (or flip AUTO-BATTLE on). Loot/transform/ascend popups:
CONFIRM (assign to a hero) or AUTO. End screen: RETRY / NEW RUN / SHOP.

## Files
- `engine.js` — game engine (ported 1:1 from `../game_core.py`).
- `ui.js` — responsive terminal UI + settings + SFX + autoplay + achievements.
- `index.html` — layout, theme, scanlines, juice CSS.
- `engine.test.js` — Node test: faithful port, balance, shop growth, hp-bar.
- `uijsdom.test.js` — jsdom test: full clickable flow + RETRY + settings +
  export/import. (needs `npm i jsdom`)

## Verify
```
node engine.test.js
node uijsdom.test.js     # needs: npm i jsdom
```

## Why web
The reference list (awesome-open-source-games) is dominated by browser-based
HTML5/JS games — they run everywhere. Borrowed genre staples: idle/auto-battle
(Clicker section), leaderboards & achievements (Maps/Hacks), and arcade juice
(floating numbers/crits, like Onslaught Arena / SURVIVOR).

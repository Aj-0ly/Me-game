# DTF // TEXT AUTOBATTLER

A functioning **roguelite text-RPG autobattler** (Doomfields-spirit) with a
retro **green-on-black terminal** look — ASCII robot mascot, text HP bars,
narrated combat — plus a **persistent SHOP** for forever-progression.

## Run it
- Double-click **`run.bat`**, or `python main.py` in this folder.
- Python 3.11+ with Tkinter (default Windows installer includes it).

## Commands (typed at the bottom prompt)
- `play` — draft up to 5 heroes (different classes) → begin a run
- `shop` — spend **shards** on permanent upgrades
- `help` — how to play

## The loop
1. **Draft** your warband (Vanguard / Blade / Arcanist / Herald / Ranger).
2. **Engage** each wave — combat auto-resolves *in the text log* (HP bars,
   crits, attacks all narrated like a terminal RPG).
3. Between waves: level up + campfire heal (+35% HP).
4. At **Lv3** pick a **transformation**; at **Lv6** **ascend** to an elite.
5. **Loot** drops — auto-equip or assign to a hero.
6. Survive **12 waves** to win. Die and you still bank shards.
7. **SHOP**: spend shards on permanent buffs that apply to *every* run.

## Meta-progression (the RPG layer)
Each run earns shards (2/wave survived, 30 on victory). The shop sells
permanent stat multipliers — global (all heroes) and per-class — that stack
into every future run. Progress saves to `meta.json`.

## Verify
- `python game_core.py --sim` — headless battle sim + win-rate.
- `python smoke_test.py` — drives the real GUI through a full run, the
  rerun path, and a shop purchase; asserts persistence.
- `python layout_test.py` — regression for the "too many items breaks the
  layout" bug: forces dozens of items onto heroes, confirms the ENGAGE
  button stays reachable and waves still advance.

## Files
- `game_core.py` — verified simulation engine (pure logic, meta/shop data).
- `main.py` — retro terminal text-RPG GUI.
- `smoke_test.py` — headless full-flow test.
- `run.bat` — Windows one-click launcher.
- `meta.json` — persisted shards + upgrade ranks (created on first run).

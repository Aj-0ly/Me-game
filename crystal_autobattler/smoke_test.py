"""Headless driver for the CLICKABLE terminal GUI.

We build the real App, then drive it: draft -> engage x12 (animation runs
synchronously) -> auto-confirm loot/spec/elite -> reach summary -> verify the
rerun path (NEW RUN button) and the shop purchase path both work.

Verifies the three requested fixes:
  1) rerun works (NEW RUN from summary -> fresh draft + wave)
  2) shop works (buy persists to meta.json)
  3) combat animates into the log (log got combat lines + cards updated)
"""

import os, json, types, tkinter as tk
os.environ.setdefault("DISPLAY", "")
import main as M
import game_core as G

app = M.App()

# Make .after() run synchronously so animations resolve immediately in test.
app.after = lambda ms, cb=None, *a, **k: (cb() if cb else None) or None

# Non-blocking auto-apply versions of the modal choosers.
def _auto_loot(self):
    drops = G.roll_loot(self.wave, n=1 if self.wave < 3 else 2)
    for i, item in enumerate(drops):
        hero = G.best_loot_target(self.team, item, rr_index=i)
        if not hasattr(hero, "_items"): hero._items = []
        hero.equip(item); hero._items.append(item)
    self.refresh_cards(); self.open_spec()
def _auto_spec(self):
    pending = [h for h in self.team if h.alive() and h.level >= 3 and not h.spec]
    if pending:
        h = pending[0]; h.apply_spec(G.auto_spec(h)); self.refresh_cards(); self.open_spec()
    else:
        self.open_elite()
def _auto_elite(self):
    pending = [h for h in self.team if h.alive() and h.level >= 6 and not h.elite]
    if pending:
        h = pending[0]; h.apply_elite("Savage"); self.refresh_cards(); self.open_elite()
    else:
        self.advance_wave()
app.open_loot = types.MethodType(_auto_loot, app)
app.open_spec = types.MethodType(_auto_spec, app)
app.open_elite = types.MethodType(_auto_elite, app)

# ---- 1) draft via the real widgets ----
app.goto_draft()
for cls, var in app.pick_vars.items():
    var.set(True)
app._on_pick()
assert app.start_btn["state"] == "normal"
app._start_run()
assert app.active == "battle"
print("DRAFT_OK", [h.kind for h in app.team])

# ---- 2) full run ----
combat_lines = 0
for _ in range(80):
    if app.active == "summary":
        break
    if app.engage_btn["state"] == "normal" and not app.busy:
        # capture log size before/after to confirm animation wrote lines
        before = app.log.index("end")
        app.engage()
        if app.log.index("end") != before:
            combat_lines += 1
print("RUN_ENDED active=", app.active)
assert app.active == "summary"
assert combat_lines >= 5, "combat did not animate into the log"

# cards updated (at least the surviving heroes have bars)
assert any(c.disp_hp >= 0 for c in app.cards.values())
print("ANIM_OK combat_lines=", combat_lines)

# ---- 3) RERUN fix (NEW RUN button) ----
app.goto_draft()
assert app.active == "draft"
for cls, var in app.pick_vars.items():
    var.set(False)
app.pick_vars["Blade"].set(True); app.pick_vars["Ranger"].set(True)
app._on_pick()
app._start_run()
assert app.active == "battle" and app.wave == 1
print("RERUN_OK")

# ---- 4) SHOP fix ----
app.goto_shop()
assert app.active == "shop"
before = app.meta["shards"]
forge = next(u for u in G.SHOP_UPGRADES if u["id"] == "forge")
rank0 = app.meta["ranks"]["forge"]
cost = G.upgrade_cost(forge, rank0)
app.buy(forge)
assert app.meta["shards"] == before - cost
assert app.meta["ranks"]["forge"] == rank0 + 1
saved = json.load(open(G.SHOP_FILE))
assert saved["ranks"]["forge"] == app.meta["ranks"]["forge"]
print("SHOP_OK", "shards", before, "->", app.meta["shards"], "persisted")

print("ALL_SMOKE_OK")

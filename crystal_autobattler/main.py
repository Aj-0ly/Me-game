"""
CRYSTAL // TEXT AUTOBATTLER
Clickable terminal-styled roguelite autobattler (Doomfields-spirit).

- Green-on-black retro terminal design (ASCII robot, mono font, scanlines).
- Fully CLICKABLE: draft cards, ENGAGE button, loot/spec/elite pickers, shop.
- Animated combat: attacks + HP drops step INTO the terminal log.
- Persistent SHOP for meta-progression between runs.

Built on the verified engine in game_core.py.
Run on Windows:  python main.py   (or double-click run.bat)
"""

import re
import tkinter as tk
from tkinter import ttk

import game_core as G

# ---- retro terminal palette ----
BLACK   = "#040804"
PANEL   = "#081008"
SCREEN  = "#020402"
GREEN   = "#33ff66"
DIM     = "#1f8f3c"
BRIGHT  = "#aaffbb"
AMBER   = "#ffcc44"
CYAN     = "#39d4ff"
RED     = "#ff5566"
MAGENTA = "#cc77ff"
BANNER  = "#16161c"
FONT    = ("Consolas", 11)
FONT_B  = ("Consolas", 11, "bold")
FONT_L  = ("Consolas", 18, "bold")
FONT_XL = ("Consolas", 30, "bold")

ROBOT = r"""
        .-'''''''-.
       /  _   _  \
      |  (o) (o)  |
      |     ^     |
      |  \ ___ /  |
       \  '---'  /
        \       /
   ()    \     /    ()
  (  )____\   /____(  )
   ||     /___\     ||
   ||    |     |    ||
  _||____|     |____||_
 /  \    \     /    /  \
|    |    |   |    |    |
'----'    '---'    '----'
"""


# ---------------------------------------------------------------------------
# Animated HP-bar card (clickable terminal panel)
# ---------------------------------------------------------------------------

class Card(tk.Frame):
    BAR_W = 200

    def __init__(self, parent, unit, accent, on_click=None):
        super().__init__(parent, bg=PANEL, bd=1, relief="solid",
                         highlightbackground=accent, highlightthickness=1)
        self.unit = unit
        self.accent = accent
        self.disp_hp = unit.hp
        self._build(on_click)

    def _build(self, on_click):
        head = tk.Frame(self, bg=PANEL)
        head.pack(fill="x", padx=6, pady=(4, 0))
        self.title = tk.Label(head, text=self.unit.kind, bg=PANEL,
                              fg=self.accent, font=FONT_B)
        self.title.pack(side="left")
        self.sub = tk.Label(head, text="", bg=PANEL, fg=DIM, font=("Consolas", 9))
        self.sub.pack(side="right")

        self.bar = tk.Frame(self, bg="#0a1a0a", height=14, width=self.BAR_W)
        self.bar.pack(fill="x", padx=6, pady=(4, 0))
        self.bar.pack_propagate(False)
        self.inner = tk.Frame(self.bar, bg=GREEN, height=14)
        self.inner.place(x=0, y=0, width=self.BAR_W, height=14)
        self.hp_lbl = tk.Label(self, text="", bg=PANEL, fg=BRIGHT,
                               font=("Consolas", 9))
        self.hp_lbl.pack(anchor="e", padx=6)

        self.stat = tk.Label(self, text="", bg=PANEL, fg=DIM,
                             font=("Consolas", 9), justify="left")
        self.stat.pack(anchor="w", padx=6, pady=(0, 4))

        self.bind("<Button-1>", lambda e: on_click and on_click(self))
        for w in (self.title, self.sub, self.stat, self.hp_lbl, self.bar):
            w.bind("<Button-1>", lambda e: on_click and on_click(self))

        self.refresh()

    def refresh(self):
        sub = f"Lv{self.unit.level}"
        if getattr(self.unit, "spec", None):
            sub += f" {self.unit.spec}"
        if getattr(self.unit, "elite", None):
            sub += f" ({self.unit.elite})"
        self.sub.config(text=sub)
        items = getattr(self.unit, "_items", [])
        item_txt = compact_items(self.unit)
        self.stat.config(
            text=f"ATK {self.unit.atk:.0f}  DEF {self.unit.defense:.0f}  "
                 f"SPD {self.unit.spd:.0f}  [{self.unit.ability}]"
                 + (f"\n{item_txt}" if item_txt else ""))
        if items:
            full = "\n".join(f"◈ {i['name']}  ({i['desc']})" for i in items)
            self.stat.bind("<Enter>", lambda e, t=full: self._tip(e, t))
            self.stat.bind("<Leave>", lambda e: self._tip_hide())
        self.set_hp(self.unit.hp, animate=False)

    def _tip(self, event, text):
        x = self.winfo_rootx() + 30
        y = self.winfo_rooty() + 20
        if not hasattr(self, "_tipwin") or not self._tipwin.winfo_exists():
            self._tipwin = tk.Toplevel(self)
            self._tipwin.wm_overrideredirect(True)
            self._tipwin.configure(bg="#0c1f0c")
            tk.Label(self._tipwin, text=text, bg="#0c1f0c", fg=BRIGHT,
                     font=("Consolas", 9), justify="left").pack(padx=8, pady=6)
        self._tipwin.wm_geometry(f"+{x}+{y}")

    def _tip_hide(self):
        if hasattr(self, "_tipwin") and self._tipwin.winfo_exists():
            self._tipwin.destroy()

    def set_hp(self, hp, animate=True):
        self.disp_hp = max(0, min(hp, self.unit.hp_max))
        frac = self.disp_hp / self.unit.hp_max if self.unit.hp_max else 0
        col = GREEN if frac > 0.5 else (AMBER if frac > 0.25 else RED)
        self.inner.config(bg=col, width=max(2, int(self.BAR_W * frac)))
        self.hp_lbl.config(text=f"{int(self.disp_hp)}/{int(self.unit.hp_max)}")
        if self.disp_hp <= 0:
            self.title.config(fg=RED)
            self.stat.config(text=self.stat.cget("text").split(chr(10))[0] + "\n  [ DOWN ]")

    def flash(self, color):
        self.config(highlightbackground=color)
        self.after(160, lambda: self.config(highlightbackground=self.accent))


class ScrollBox(tk.Frame):
    """A fixed-height (or fixed-fill) scrollable container so its children
    can never push the rest of the layout off-screen."""
    def __init__(self, master, **kw):
        super().__init__(master, **kw)
        self.canvas = tk.Canvas(self, bg=PANEL, highlightthickness=0)
        self.vsb = ttk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        self.canvas.configure(yscrollcommand=self.vsb.set)
        self.vsb.pack(side="right", fill="y")
        self.canvas.pack(side="left", fill="both", expand=True)
        self.inner = tk.Frame(self.canvas, bg=PANEL)
        self.canvas.create_window((0, 0), window=self.inner, anchor="nw")
        self.inner.bind("<Configure>",
                        lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        self.canvas.bind("<Enter>", self._bind_wheel)
        self.canvas.bind("<Leave>", self._unbind_wheel)

    def _on_wheel(self, event):
        self.canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

    def _bind_wheel(self, e):
        self.canvas.bind_all("<MouseWheel>", self._on_wheel)

    def _unbind_wheel(self, e):
        try:
            self.canvas.unbind_all("<MouseWheel>")
        except Exception:
            pass


def compact_items(unit):
    items = getattr(unit, "_items", [])
    if not items:
        return ""
    names = [i["name"] for i in items]
    if len(names) <= 3:
        return "  ".join(f"◈{n}" for n in names)
    return "◈" + " ◈".join(names[:3]) + f"  …(+{len(names) - 3})"


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("crystal-text-autobattler")
        self.geometry("1040x760")
        self.configure(bg=BLACK)
        self.option_add("*Font", "Consolas 11")

        self.meta = G.load_meta()
        self.team = []
        self.enemies = []
        self.wave = 0
        self.picks = []
        self.cards = {}        # name -> Card (battle screen)
        self.animating = False
        self.busy = False

        self._style()
        self._waybar()
        self._container()
        self._scanlines()
        self.show("title")

    # ---- styling ----
    def _style(self):
        s = ttk.Style()
        s.theme_use("default")
        s.configure("TButton", background=PANEL, foreground=GREEN,
                    borderwidth=1, font=FONT_B, padding=6)
        s.map("TButton",
              background=[("active", "#0c1f0c"), ("disabled", "#0a0a0a")],
              foreground=[("disabled", DIM)])
        s.configure("TScrollbar", background="#0c200c", troughcolor=PANEL)

    def _waybar(self):
        bar = tk.Frame(self, bg="#0c160c", height=28)
        bar.pack(fill="x", side="top")
        bar.pack_propagate(False)
        self.ws = []
        for i in range(1, 6):
            p = tk.Label(bar, text=str(i), bg="#0c160c", fg=DIM,
                         font=FONT_B, width=2, anchor="center")
            p.pack(side="left", padx=2)
            self.ws.append((i, p))
        tk.Label(bar, text="DTF // TEXT AUTOBATTLER",
                 bg="#0c160c", fg=GREEN, font=FONT_B).pack(side="left", padx=16)
        right = tk.Frame(bar, bg="#0c160c")
        right.pack(side="right", padx=8)
        self.wave_lbl = tk.Label(right, text="wave 0/12", bg="#0c160c",
                                 fg=CYAN, font=FONT)
        self.wave_lbl.pack(side="right", padx=8)
        self.shard_lbl = tk.Label(right, text="◈ 0", bg="#0c160c",
                                  fg=AMBER, font=FONT_B)
        self.shard_lbl.pack(side="right", padx=4)

    def _set_ws(self, active):
        for i, p in self.ws:
            p.config(bg="#143014" if i == active else "#0c160c",
                     fg=GREEN if i == active else DIM)

    def _scanlines(self):
        """Subtle CRT scanline overlay."""
        self.sl = tk.Canvas(self, bg=BLACK, highlightthickness=0)
        self.sl.place(x=0, y=28, relwidth=1, relheight=1)
        for y in range(0, 800, 3):
            self.sl.create_line(0, y, 2000, y, fill="#0a1a0a", width=1)
        self.tk.call("lower", self.sl._w, self.c._w)
        self.sl.config(state="disabled")

    def _container(self):
        self.c = tk.Frame(self, bg=SCREEN)
        self.c.pack(fill="both", expand=True, padx=10, pady=(4, 10))
        self.screens = {}
        self.screens["title"] = self._build_title()
        self.screens["draft"] = self._build_draft()
        self.screens["battle"] = self._build_battle()
        self.screens["shop"] = self._build_shop()
        self.screens["summary"] = self._build_summary()
        for n, f in self.screens.items():
            f.place(relx=0, rely=0, relwidth=1, relheight=1)

    def show(self, name):
        for n, f in self.screens.items():
            f.tkraise() if n == name else f.lower()
        self.active = name
        {
            "title": 1, "draft": 1, "battle": 2, "shop": 4, "summary": 5
        }.get(name)
        self._set_ws({"title": 1, "draft": 1, "battle": 2,
                      "shop": 4, "summary": 5}[name])

    # ---- TITLE ----
    def _build_title(self):
        f = tk.Frame(self.c, bg=SCREEN)
        tk.Label(f, text=ROBOT, bg=SCREEN, fg=GREEN, font=("Consolas", 10),
                 justify="left").pack(side="left", padx=30, pady=20)
        side = tk.Frame(f, bg=SCREEN)
        side.pack(side="left", fill="y", padx=20, pady=40)
        tk.Label(side, text="DTF", bg=SCREEN, fg=BRIGHT, font=FONT_XL).pack(anchor="w")
        tk.Label(side, text="// TEXT AUTOBATTLER", bg=SCREEN, fg=GREEN, font=FONT_L).pack(anchor="w", pady=(0, 18))
        tk.Label(side, text="a roguelite warband crawler", bg=SCREEN, fg=DIM, font=FONT).pack(anchor="w")
        tk.Label(side, text="made by Aj", bg=SCREEN, fg=DIM, font=FONT).pack(anchor="w", pady=(0, 10))
        tk.Label(side, text=f"banked shards: ◈ {self.meta['shards']}",
                 bg=SCREEN, fg=AMBER, font=FONT_B).pack(anchor="w", pady=(4, 24))
        for txt, cmd in [("▶ NEW RUN", self.goto_draft),
                         ("🛒 SHOP", self.goto_shop),
                         ("? HOW TO PLAY", self.goto_help)]:
            b = tk.Button(side, text=txt, bg=PANEL, fg=GREEN, font=FONT_B,
                          relief="solid", bd=1, padx=18, pady=8,
                          activebackground="#0c1f0c", command=cmd)
            b.pack(anchor="w", pady=6, fill="x")
        return f

    def goto_draft(self):
        self.refresh_title_shards()
        self.show("draft")

    def goto_shop(self):
        self.refresh_title_shards()
        self.build_shop_rows()
        self.show("shop")

    def goto_help(self):
        self.refresh_title_shards()
        self.show("title")
        # help overlay
        t = tk.Toplevel(self)
        t.configure(bg=SCREEN)
        t.geometry("460x320")
        tk.Label(t, text="HOW TO PLAY", bg=SCREEN, fg=BRIGHT, font=FONT_L).pack(pady=10)
        for line in [
            "1. Draft up to 5 heroes (different classes).",
            "2. Hit ENGAGE — the battle animates in the log.",
            "3. Level up + heal at the campfire between waves.",
            "4. Lv3: pick a TRANSFORMATION.  Lv6: ASCEND to elite.",
            "5. Loot drops — assign or auto-equip.",
            "6. Survive 12 waves to win. Die and still bank shards.",
            "7. SHOP: spend shards on permanent upgrades.",
        ]:
            tk.Label(t, text="  " + line, bg=SCREEN, fg=GREEN, font=FONT,
                     justify="left").pack(anchor="w", padx=14, pady=2)
        tk.Button(t, text="close", bg=GREEN, fg=BLACK, font=FONT_B,
                  command=t.destroy, relief="flat", padx=14).pack(pady=12)

    def refresh_title_shards(self):
        self.meta = G.load_meta()
        self.shard_lbl.config(text=f"◈ {self.meta['shards']}")
        # update title screen shard label if present
        for w in self.screens["title"].winfo_children():
            self._upd_shard_label(w)

    def _upd_shard_label(self, w):
        if isinstance(w, tk.Frame):
            for c in w.winfo_children():
                if isinstance(c, tk.Label) and c.cget("text").startswith("banked shards"):
                    c.config(text=f"banked shards: ◈ {self.meta['shards']}")
                self._upd_shard_label(c)

    # ---- DRAFT ----
    def _build_draft(self):
        f = tk.Frame(self.c, bg=SCREEN)
        tk.Label(f, text="DRAFT YOUR WARBAND", bg=SCREEN, fg=BRIGHT, font=FONT_XL).pack(pady=(12, 2))
        tk.Label(f, text="Pick up to 5 heroes, each a different class.",
                 bg=SCREEN, fg=DIM, font=FONT).pack(pady=(0, 10))
        self.pick_vars = {}
        grid = tk.Frame(f, bg=SCREEN)
        grid.pack(padx=20, pady=10)
        for i, (cls, st) in enumerate(G.CLASSES.items()):
            var = tk.BooleanVar()
            self.pick_vars[cls] = var
            card = tk.Frame(grid, bg=PANEL, bd=1, relief="ridge", width=180, height=150)
            card.grid(row=0, column=i, padx=8, pady=8)
            card.pack_propagate(False)
            chk = tk.Checkbutton(card, text=cls, variable=var, bg=PANEL, fg=GREEN,
                                 selectcolor="#0c1f0c", font=FONT_B,
                                 activebackground=PANEL, activeforeground=BRIGHT,
                                 command=self._on_pick)
            chk.pack(pady=(8, 4))
            tk.Label(card, text=f"HP {st['hp']}  ATK {st['atk']}\nDEF {st['def']}  SPD {st['spd']}\n[{st['ability']}]",
                     bg=PANEL, fg=DIM, font=("Consolas", 10), justify="left").pack(pady=4)
        self.draft_status = tk.Label(f, text="Selected: 0/5", bg=SCREEN, fg=CYAN, font=FONT_B)
        self.draft_status.pack(pady=8)
        self.start_btn = tk.Button(f, text="▶ START RUN", bg=GREEN, fg=BLACK,
                                    font=FONT_B, state="disabled", command=self._start_run,
                                    relief="flat", padx=20, pady=8)
        self.start_btn.pack(pady=10)
        return f

    def _on_pick(self):
        sel = [c for c, v in self.pick_vars.items() if v.get()]
        self.draft_status.config(text=f"Selected: {len(sel)}/5")
        self.start_btn.config(state="normal" if 1 <= len(sel) <= 5 else "disabled")

    def _start_run(self):
        self.picks = [c for c, v in self.pick_vars.items() if v.get()]
        self.team = G.draft_team(self.picks)
        G.apply_meta(self.team, self.meta)
        self.wave = 1
        self.show("battle")
        self.begin_wave()

    # ---- BATTLE ----
    def _build_battle(self):
        f = tk.Frame(self.c, bg=SCREEN)
        self.hero_box = ScrollBox(f, bg=PANEL, bd=1, relief="solid")
        self.hero_box.pack(side="left", fill="both", expand=True, padx=(0, 6), pady=6)
        self.enemy_box = ScrollBox(f, bg=PANEL, bd=1, relief="solid")
        self.enemy_box.pack(side="right", fill="both", expand=True, padx=(6, 0), pady=6)
        # expose inner frames the way the rest of the code expects
        self.hero_panel = self.hero_box.inner
        self.enemy_panel = self.enemy_box.inner

        bottom = tk.Frame(f, bg=SCREEN)
        bottom.pack(side="bottom", fill="x", pady=(6, 0))
        self.log = tk.Text(bottom, bg=SCREEN, fg=GREEN, font=FONT, height=11,
                           relief="flat", wrap="word", state="disabled")
        self.log.pack(side="left", fill="both", expand=True, padx=(0, 6))
        self.log.tag_config("crit", foreground=AMBER)
        self.log.tag_config("bad", foreground=RED)
        self.log.tag_config("good", foreground=BRIGHT)
        self.log.tag_config("sys", foreground=DIM)
        self.log.tag_config("loot", foreground=CYAN)
        sb = ttk.Scrollbar(bottom, command=self.log.yview)
        sb.pack(side="left", fill="y")
        self.log.config(yscrollcommand=sb.set)

        ctl = tk.Frame(bottom, bg=SCREEN, width=210)
        ctl.pack(side="right", fill="y", padx=(6, 0))
        self.engage_btn = tk.Button(ctl, text="⚔ ENGAGE WAVE", bg=GREEN, fg=BLACK,
                                     font=FONT_B, command=self.engage, relief="flat",
                                     padx=10, pady=10)
        self.engage_btn.pack(pady=6, fill="x")
        self.wave_title = tk.Label(ctl, text="WAVE 1", bg=SCREEN, fg=AMBER, font=FONT_L)
        self.wave_title.pack(pady=4)
        self.banner = tk.Label(ctl, text="", bg=SCREEN, fg=CYAN, font=FONT_B, wraplength=200)
        self.banner.pack(pady=4)
        return f

    def begin_wave(self):
        self.wave_title.config(text=f"WAVE {self.wave}")
        self.wave_lbl.config(text=f"wave {self.wave}/{G.MAX_WAVE}")
        self.banner.config(text="")
        self.enemies = G.spawn_wave(self.wave)
        self._build_cards()
        self.engage_btn.config(state="normal")
        self.log_insert(f"=== WAVE {self.wave} / {G.MAX_WAVE} ===", "sys")
        self.log_insert(f"{len(self.enemies)} hostiles emerge from the crystal dark.", "bad")

    def _build_cards(self):
        for w in self.hero_panel.winfo_children(): w.destroy()
        for w in self.enemy_panel.winfo_children(): w.destroy()
        self.cards = {}
        tk.Label(self.hero_panel, text="YOUR WARBAND", bg=PANEL, fg=GREEN, font=FONT_B).pack(anchor="w", padx=8, pady=6)
        for h in self.team:
            accent = MAGENTA if getattr(h, "spec", None) else GREEN
            c = Card(self.hero_panel, h, accent)
            c.pack(fill="x", padx=6, pady=5)
            self.cards[h.name] = c
        tk.Label(self.enemy_panel, text="HOSTILES", bg=PANEL, fg=RED, font=FONT_B).pack(anchor="w", padx=8, pady=6)
        for e in self.enemies:
            c = Card(self.enemy_panel, e, RED)
            c.pack(fill="x", padx=6, pady=5)
            self.cards[e.name] = c

    def log_insert(self, text, tag="sys"):
        self.log.configure(state="normal")
        self.log.insert("end", text + "\n", tag)
        self.log.configure(state="disabled")
        self.log.see("end")

    # ---- ANIMATED COMBAT ----
    def engage(self):
        if self.animating or self.busy:
            return
        self.animating = True
        self.busy = True
        self.engage_btn.config(state="disabled")
        self.banner.config(text="resolving…")
        G._log.clear()
        # snapshot pre-hp for bar tween
        for u in self.team + self.enemies:
            u._pre_hp = u.hp
        won, rounds = G.resolve_wave(self.team, self.enemies)
        self.log_insert(f"-- resolution ({rounds} rounds) --", "sys")
        self.animate_log(list(G._log), won)

    def animate_log(self, lines, won, idx=0):
        if idx >= len(lines):
            self.after(250, lambda: self.finish_wave(won))
            return
        line = lines[idx]
        tag = "crit" if "CRIT" in line else ("bad" if "->" in line else "sys")
        self.log_insert(line, tag)
        # animate the hit
        m = re.search(r"->\s*([^-]+?)\s*\(-(\d+)\)", line)
        if m:
            target_name = m.group(1).strip()
            dmg = int(m.group(2))
            card = self.cards.get(target_name)
            if card and card.unit.alive() or (card and card.disp_hp > 0):
                card.set_hp(card.disp_hp - dmg)
                card.flash(RED if tag != "crit" else AMBER)
        self.after(90, lambda: self.animate_log(lines, won, idx + 1))

    def finish_wave(self, won):
        # settle bars to true values
        for u in self.team + self.enemies:
            c = self.cards.get(u.name)
            if c:
                c.refresh()
        if won:
            self.banner.config(text=f"✔ WAVE {self.wave} CLEARED")
            self.log_insert(f"✔ WAVE {self.wave} CLEARED", "good")
            self.after_wave_win()
        else:
            self.banner.config(text=f"✖ WIPED on wave {self.wave}")
            self.log_insert(f"✖ WIPED on wave {self.wave}.", "bad")
            self.after(700, self.show_defeat)
        self.animating = False
        self.busy = False

    def after_wave_win(self):
        G.level_up_all(self.team)
        for h in self.team:
            if h.alive():
                h.hp = min(h.hp_max, h.hp + int(h.hp_max * 0.35))
        for h in self.team:
            c = self.cards.get(h.name)
            if c:
                c.refresh()
        self.open_loot()

    # ---- LOOT chooser (clickable) ----
    def open_loot(self):
        drops = G.roll_loot(self.wave, n=1 if self.wave < 3 else 2)
        if not drops:
            self.open_spec()
            return
        win = tk.Toplevel(self)
        win.title("loot")
        win.configure(bg=SCREEN)
        win.geometry("540x360")
        win.grab_set()
        tk.Label(win, text="LOOT ACQUIRED", bg=SCREEN, fg=CYAN, font=FONT_L).pack(pady=10)
        tk.Label(win, text="Assign each item to a hero, or auto-assign.",
                 bg=SCREEN, fg=DIM, font=FONT).pack()
        alive = [h for h in self.team if h.alive()]
        choices = {}
        for item in drops:
            row = tk.Frame(win, bg=SCREEN)
            row.pack(fill="x", padx=20, pady=4)
            tk.Label(row, text=f"◈ {item['name']}", bg=SCREEN, fg=BRIGHT,
                     font=FONT_B, width=22, anchor="w").pack(side="left")
            tk.Label(row, text=item["desc"], bg=SCREEN, fg=DIM, font=("Consolas", 9),
                     width=22, anchor="w").pack(side="left")
            var = tk.StringVar(value=alive[0].kind)
            ttk.OptionMenu(row, var, alive[0].kind, *[h.kind for h in alive]).pack(side="right")
            choices[item["name"]] = (item, var)

        def confirm():
            for name, (item, var) in choices.items():
                hero = next((h for h in self.team if h.kind == var.get()), alive[0])
                if not hasattr(hero, "_items"): hero._items = []
                hero.equip(item); hero._items.append(item)
            self.log_insert("Loot equipped: " + ", ".join(i for i in choices), "loot")
            win.destroy(); self.refresh_cards(); self.open_spec()
        def auto():
            for i, item in enumerate(drops):
                hero = G.best_loot_target(self.team, item, rr_index=i)
                if not hasattr(hero, "_items"): hero._items = []
                hero.equip(item); hero._items.append(item)
            self.log_insert("Loot auto-equipped.", "loot")
            win.destroy(); self.refresh_cards(); self.open_spec()

        bf = tk.Frame(win, bg=SCREEN); bf.pack(pady=14)
        tk.Button(bf, text="✔ CONFIRM", bg=GREEN, fg=BLACK, font=FONT_B,
                  command=confirm, relief="flat", padx=14, pady=6).pack(side="left", padx=8)
        tk.Button(bf, text="⚡ AUTO", bg=CYAN, fg=BLACK, font=FONT_B,
                  command=auto, relief="flat", padx=14, pady=6).pack(side="left", padx=8)

    def refresh_cards(self):
        for h in self.team:
            c = self.cards.get(h.name)
            if c:
                c.refresh()

    # ---- SPEC / ELITE pickers (clickable) ----
    def open_spec(self):
        pending = [h for h in self.team if h.alive() and h.level >= 3 and not h.spec]
        if not pending:
            self.open_elite()
            return
        h = pending[0]
        opts = list(G.SPEC[h.kind].items())
        win = tk.Toplevel(self); win.title("transform"); win.configure(bg=SCREEN); win.geometry("580x320")
        win.grab_set()
        tk.Label(win, text=f"{h.kind} reached Lv3 — CHOOSE TRANSFORMATION",
                 bg=SCREEN, fg=MAGENTA, font=FONT_L).pack(pady=14)
        for spec, d in opts:
            b = d["bonus"]
            desc = ", ".join(f"+{int(v*100)}% {k}" for k, v in b.items())
            tk.Button(win, text=f"{spec}\n{desc}\n→ {d['ability']}", bg=PANEL, fg=GREEN,
                      font=FONT, height=3, width=46, relief="ridge",
                      activebackground="#0c1f0c",
                      command=lambda s=spec: self.pick_spec(h, s, win)).pack(pady=6, padx=20, fill="x")

    def pick_spec(self, h, spec, win):
        h.apply_spec(spec)
        self.log_insert(f"{h.kind} transforms into {spec}!", "good")
        win.destroy(); self.refresh_cards(); self.open_spec()

    def open_elite(self):
        pending = [h for h in self.team if h.alive() and h.level >= 6 and not h.elite]
        if not pending:
            self.advance_wave()
            return
        h = pending[0]
        opts = list(G.ELITE.items())
        win = tk.Toplevel(self); win.title("ascend"); win.configure(bg=SCREEN); win.geometry("580x280")
        win.grab_set()
        tk.Label(win, text=f"{h.kind} ({h.spec}) reached Lv6 — ASCEND",
                 bg=SCREEN, fg=AMBER, font=FONT_L).pack(pady=14)
        for elite, d in opts:
            b = d["bonus"]
            desc = ", ".join(f"+{int(v*100)}% {k}" for k, v in b.items())
            tk.Button(win, text=f"{d['label']}\n{desc}", bg=PANEL, fg=GREEN, font=FONT,
                      height=2, width=46, relief="ridge", activebackground="#0c1f0c",
                      command=lambda e=elite: self.pick_elite(h, e, win)).pack(pady=6, padx=20, fill="x")

    def pick_elite(self, h, elite, win):
        h.apply_elite(elite)
        self.log_insert(f"{h.kind} ({h.spec}) ascends as {d_label(elite)}!", "good")
        win.destroy(); self.refresh_cards(); self.open_elite()

    def advance_wave(self):
        self.wave += 1
        if self.wave > G.MAX_WAVE:
            self.show_victory(); return
        self.enemies = []
        self.begin_wave()

    # ---- SHOP (clickable) ----
    def _build_shop(self):
        f = tk.Frame(self.c, bg=SCREEN)
        tk.Label(f, text="DTF SHOP", bg=SCREEN, fg=BRIGHT, font=FONT_XL).pack(pady=(14, 2))
        self.shop_shard = tk.Label(f, text="", bg=SCREEN, fg=AMBER, font=FONT_B)
        self.shop_shard.pack(pady=(0, 8))
        self.shop_rows = tk.Frame(f, bg=SCREEN)
        self.shop_rows.pack(fill="both", expand=True, padx=30)
        tk.Button(f, text="◀ BACK", bg=PANEL, fg=GREEN, font=FONT_B, relief="solid",
                  bd=1, command=lambda: self.show("title")).pack(pady=10)
        return f

    def build_shop_rows(self):
        for w in self.shop_rows.winfo_children(): w.destroy()
        self.shop_shard.config(text=f"Your shards: ◈ {self.meta['shards']}")
        for up in G.SHOP_UPGRADES:
            rank = self.meta["ranks"].get(up["id"], 0)
            maxed = rank >= up["max"]
            cost = G.upgrade_cost(up, rank)
            row = tk.Frame(self.shop_rows, bg=PANEL, bd=1, relief="solid")
            row.pack(fill="x", padx=6, pady=4)
            tk.Label(row, text=f"{up['name']}", bg=PANEL, fg=GREEN, font=FONT_B,
                     width=18, anchor="w").pack(side="left", padx=8)
            tk.Label(row, text=f"r{rank}/{up['max']}", bg=PANEL, fg=DIM, width=7).pack(side="left")
            tk.Label(row, text=up["desc"], bg=PANEL, fg=DIM, width=30, anchor="w").pack(side="left")
            if maxed:
                tk.Label(row, text="MAX", bg=PANEL, fg=AMBER, font=FONT_B, width=10).pack(side="right", padx=8)
            else:
                b = tk.Button(row, text=f"◈ {cost}", bg=GREEN, fg=BLACK, font=FONT_B,
                              relief="flat", width=8,
                              command=lambda u=up: self.buy(u))
                b.pack(side="right", padx=8)
                if self.meta["shards"] < cost:
                    b.config(state="disabled", bg="#0c200c", fg=DIM)

    def buy(self, up):
        rank = self.meta["ranks"].get(up["id"], 0)
        if rank >= up["max"]:
            return
        cost = G.upgrade_cost(up, rank)
        if self.meta["shards"] < cost:
            return
        self.meta["shards"] -= cost
        self.meta["ranks"][up["id"]] = rank + 1
        G.save_meta(self.meta)
        self.shard_lbl.config(text=f"◈ {self.meta['shards']}")
        self.build_shop_rows()

    # ---- SUMMARY ----
    def _build_summary(self):
        f = tk.Frame(self.c, bg=SCREEN)
        self.sum_title = tk.Label(f, text="", bg=SCREEN, fg=BRIGHT, font=FONT_XL)
        self.sum_title.pack(pady=(60, 10))
        self.sum_body = tk.Label(f, text="", bg=SCREEN, fg=GREEN, font=FONT, justify="center")
        self.sum_body.pack(pady=10)
        bf = tk.Frame(f, bg=SCREEN); bf.pack(pady=18)
        tk.Button(bf, text="↻ NEW RUN", bg=GREEN, fg=BLACK, font=FONT_B, relief="flat",
                  padx=18, pady=8, command=self.goto_draft).pack(side="left", padx=8)
        tk.Button(bf, text="🛒 SHOP", bg=CYAN, fg=BLACK, font=FONT_B, relief="flat",
                  padx=18, pady=8, command=self.goto_shop).pack(side="left", padx=8)
        return f

    def show_defeat(self):
        shards = self.wave * 2
        self.meta["shards"] += shards; G.save_meta(self.meta)
        self.shard_lbl.config(text=f"◈ {self.meta['shards']}")
        self.sum_title.config(text="RUN ENDED", fg=RED)
        self.sum_body.config(text=f"Your warband fell on wave {self.wave} of {G.MAX_WAVE}.\n\n"
                                  f"Shards earned: ◈ {shards}\nBanked: ◈ {self.meta['shards']}")
        self.show("summary")

    def show_victory(self):
        shards = 30
        self.meta["shards"] += shards; G.save_meta(self.meta)
        self.shard_lbl.config(text=f"◈ {self.meta['shards']}")
        self.sum_title.config(text="VICTORY", fg=GREEN)
        self.sum_body.config(text=f"You cleared all {G.MAX_WAVE} waves!\n\n"
                                  f"Shards earned: ◈ {shards}\nBanked: ◈ {self.meta['shards']}\n\n✦ DTF ETERNAL ✦")
        self.show("summary")


def d_label(elite):
    return G.ELITE[elite]["label"]


if __name__ == "__main__":
    App().mainloop()

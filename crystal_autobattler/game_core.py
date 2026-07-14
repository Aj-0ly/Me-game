"""
CRYSTAL // AUTOBATTLER  -- core engine (no GUI deps, fully testable)

A roguelite autobattler in the spirit of Doomfields:
  * Draft up to 5 heroes, each a different base class.
  * Every hero TRANSFORMS into a specialised variant as it levels up
    (Tier-1 spec at Lv3, Tier-2 elite at Lv6).
  * Loot drops after each wave and reshapes your team.
  * Turn-based autobattler resolution vs. scaling enemy waves.

This module is pure simulation logic so it can be run headlessly
(`python game_core.py --sim`) and verified before any GUI exists.
"""

import random
import sys
from dataclasses import dataclass, field


# ----------------------------------------------------------------------------
# Static game data
# ----------------------------------------------------------------------------

CLASSES = {
    "Vanguard": {"hp": 150, "atk": 14, "def": 20, "spd": 6,  "crit": 0.05, "ability": "taunt"},
    "Blade":    {"hp": 95,  "atk": 28, "def": 8,  "spd": 12, "crit": 0.15, "ability": "slash"},
    "Arcanist": {"hp": 78,  "atk": 24, "def": 6,  "spd": 10, "crit": 0.10, "ability": "bolt"},
    "Herald":   {"hp": 88,  "atk": 13, "def": 10, "spd": 9,  "crit": 0.05, "ability": "smite"},
    "Ranger":   {"hp": 82,  "atk": 21, "def": 7,  "spd": 14, "crit": 0.18, "ability": "shot"},
}

# Tier-1 transformations: each base class branches into two specialisations.
SPEC = {
    "Vanguard": {
        "Bastion":   {"bonus": {"hp": 0.5, "def": 0.4}, "ability": "taunt_aoe"},
        "Bulwark":   {"bonus": {"hp": 0.3, "def": 0.3, "thorns": 0.30}, "ability": "thorns"},
    },
    "Blade": {
        "Berserker": {"bonus": {"atk": 0.5, "lifesteal": 0.30}, "ability": "rampage"},
        "Assassin":  {"bonus": {"atk": 0.3, "crit": 0.30}, "ability": "backstab"},
    },
    "Arcanist": {
        "Pyromancer":   {"bonus": {"atk": 0.4}, "ability": "fire_aoe"},
        "Cryomancer":   {"bonus": {"atk": 0.2, "spd": 0.2}, "ability": "frost_aoe"},
    },
    "Herald": {
        "Warpriest":     {"bonus": {"hp": 0.2}, "ability": "heal"},
        "Battlechanter": {"bonus": {"atk": 0.1, "def": 0.1}, "ability": "buff"},
    },
    "Ranger": {
        "Sniper":    {"bonus": {"atk": 0.6, "crit": 0.20}, "ability": "snipe"},
        "Tactician": {"bonus": {"spd": 0.4, "atk": 0.1}, "ability": "volley"},
    },
}

# Tier-2 elite refinement (chosen at Lv6) -- generic, applies to any spec.
ELITE = {
    "Resolute": {"bonus": {"hp": 0.30, "def": 0.30}, "label": "Resolute"},
    "Savage":   {"bonus": {"atk": 0.30, "crit": 0.15}, "label": "Savage"},
}

# Loot pool. Each item grants a permanent bonus when equipped.
ITEMS = [
    {"name": "Crystal Edge",    "desc": "+25% ATK",            "apply": {"atk_pct": 0.25}},
    {"name": "Aegis Plate",     "desc": "+30% HP (max)",        "apply": {"hp_pct": 0.30}},
    {"name": "Titan Charm",     "desc": "+25% DEF",            "apply": {"def_pct": 0.25}},
    {"name": "Swift Boots",     "desc": "+20% SPD",            "apply": {"spd_pct": 0.20}},
    {"name": "Crit Lens",       "desc": "+15% CRIT",           "apply": {"crit_pct": 0.15}},
    {"name": "Vampiric Sigil",  "desc": "+20% lifesteal",      "apply": {"lifesteal": 0.20}},
    {"name": "Inferno Core",    "desc": "attacks apply burn",  "apply": {"burn_on_hit": 0.6}},
    {"name": "Frost Lens",      "desc": "+25% slow on hit",    "apply": {"slow_on_hit": 0.25}},
    {"name": "Group Banner",    "desc": "+10% ATK & HP (team)","apply": {"team_atk_pct": 0.10, "team_hp_pct": 0.10}},
    {"name": "Phoenix Feather","desc": "revive once at 35% HP","apply": {"revive": 0.35}},
    {"name": "Overclock Gem",   "desc": "+12% ATK & SPD",      "apply": {"atk_pct": 0.12, "spd_pct": 0.12}},
    {"name": "Bulwark Rune",    "desc": "+18% HP & DEF",       "apply": {"hp_pct": 0.18, "def_pct": 0.18}},
]

# Meta-progression SHOP. Each purchase permanently raises a stat multiplier
# applied to every hero of the matching class each run. Cost rises per rank.
SHOP_UPGRADES = [
    {"id": "forge",    "name": "Crystal Forge",  "target": "all",  "stat": "atk",  "per": 0.06, "desc": "All heroes +6% ATK per rank",   "cost": 8,  "cost_step": 6,  "max": 10},
    {"id": "aegis",    "name": "Aegis Ward",     "target": "all",  "stat": "def",  "per": 0.06, "desc": "All heroes +6% DEF per rank",   "cost": 8,  "cost_step": 6,  "max": 10},
    {"id": "vita",     "name": "Vital Font",     "target": "all",  "stat": "hp",   "per": 0.08, "desc": "All heroes +8% HP per rank",    "cost": 8,  "cost_step": 6,  "max": 10},
    {"id": "blades",   "name": "Blade Tutelage","target": "Blade", "stat": "atk",  "per": 0.10, "desc": "Blade +10% ATK per rank",       "cost": 10, "cost_step": 7,  "max": 8},
    {"id": "ward",     "name": "Ward Mastery",   "target": "Vanguard","stat":"def","per": 0.10, "desc": "Vanguard +10% DEF per rank",    "cost": 10, "cost_step": 7,  "max": 8},
    {"id": "arcane",   "name": "Arcane Well",    "target": "Arcanist","stat":"atk","per": 0.10, "desc": "Arcanist +10% ATK per rank",    "cost": 10, "cost_step": 7,  "max": 8},
    {"id": "grace",    "name": "Herald's Grace","target": "Herald","stat": "hp",   "per": 0.12, "desc": "Herald +12% HP per rank",        "cost": 10, "cost_step": 7,  "max": 8},
    {"id": "eyes",     "name": "Hunter's Eye",   "target": "Ranger","stat": "atk",  "per": 0.10, "desc": "Ranger +10% ATK per rank",      "cost": 10, "cost_step": 7,  "max": 8},
]

SHOP_FILE = "meta.json"


def load_meta():
    import os, json
    if os.path.exists(SHOP_FILE):
        try:
            with open(SHOP_FILE, "r") as f:
                data = json.load(f)
            data.setdefault("shards", 0)
            data.setdefault("ranks", {u["id"]: 0 for u in SHOP_UPGRADES})
            for u in SHOP_UPGRADES:
                data["ranks"].setdefault(u["id"], 0)
            return data
        except Exception:
            pass
    return {"shards": 0, "ranks": {u["id"]: 0 for u in SHOP_UPGRADES}}


def save_meta(meta):
    import json
    with open(SHOP_FILE, "w") as f:
        json.dump(meta, f)


def upgrade_cost(up, rank):
    return up["cost"] + up["cost_step"] * rank


def apply_meta(team, meta):
    """Apply all purchased shop ranks to the drafted team as growth multipliers."""
    ranks = meta["ranks"]
    for h in team:
        mul_hp, mul_atk, mul_def = 1.0, 1.0, 1.0
        for up in SHOP_UPGRADES:
            r = ranks.get(up["id"], 0)
            if r <= 0:
                continue
            if up["target"] == "all" or up["target"] == h.kind:
                if up["stat"] == "hp":
                    mul_hp *= (1 + up["per"] * r)
                elif up["stat"] == "atk":
                    mul_atk *= (1 + up["per"] * r)
                elif up["stat"] == "def":
                    mul_def *= (1 + up["per"] * r)
        h.growth_hp *= mul_hp
        h.growth_atk *= mul_atk
        h.growth_def *= mul_def
        h._derive()


MAX_WAVE = 12  # reach this to win the run


# ----------------------------------------------------------------------------
# Unit model
# ----------------------------------------------------------------------------

class Unit:
    def __init__(self, name, side, kind, level=1, spec=None, ability=None):
        self.name = name
        self.side = side            # "hero" or "enemy"
        self.kind = kind            # base class / enemy type
        self.level = level
        self.spec = spec            # Tier-1 specialisation (None until Lv3)
        self.elite = None           # Tier-2 elite (None until Lv6)
        self.ability = ability or "slash"
        self.lifesteal = 0.0
        self.burn_on_hit = 0.0
        self.slow_on_hit = 0.0
        self.revive = 0.0
        self.revived = False
        self.taunting = False
        self.thorns_val = 0.0
        self.growth_hp = 1.0   # meta-progression multipliers (applied in _derive)
        self.growth_atk = 1.0
        self.growth_def = 1.0

        base = CLASSES.get(kind, {"hp": 80, "atk": 18, "def": 8, "spd": 10, "crit": 0.1})
        self._apply_base(base, level)
        if spec and kind in SPEC:
            self.apply_spec(spec)
        self.hp_max = self.hp
        self._init_status()

    def _apply_base(self, base, level):
        mult = 1 + 0.10 * (level - 1)
        self.hp = int(base["hp"] * (1 + 0.12 * (level - 1)))
        self.atk = base["atk"] * mult
        self.defense = base["def"] * mult
        self.spd = base["spd"]
        self.crit = base["crit"]

    def _derive(self):
        """Rebuild hp_max/atk/defense from level + spec + elite (used on level up)."""
        base = CLASSES[self.kind]
        mult = 1 + 0.10 * (self.level - 1)
        hp = int(base["hp"] * (1 + 0.12 * (self.level - 1)))
        atk = base["atk"] * mult
        defense = base["def"] * mult
        if self.spec and self.kind in SPEC:
            b = SPEC[self.kind][self.spec]["bonus"]
            hp = int(hp * (1 + b.get("hp", 0)))
            atk *= (1 + b.get("atk", 0))
            defense *= (1 + b.get("def", 0))
        if self.elite:
            b = ELITE[self.elite]["bonus"]
            hp = int(hp * (1 + b.get("hp", 0)))
            atk *= (1 + b.get("atk", 0))
            defense *= (1 + b.get("def", 0))
        # meta-progression growth
        hp = int(hp * self.growth_hp)
        atk *= self.growth_atk
        defense *= self.growth_def
        self.hp_max = int(hp)
        self.atk = atk
        self.defense = defense
        self.hp = self.hp_max

    def apply_spec(self, spec):
        self.spec = spec
        b = SPEC[self.kind][spec]["bonus"]
        self.ability = SPEC[self.kind][spec]["ability"]
        self.lifesteal += b.get("lifesteal", 0)
        self._derive()

    def apply_elite(self, elite):
        self.elite = elite
        self._derive()

    def equip(self, item):
        a = item["apply"]
        if "hp_pct" in a:   self.hp = int(self.hp * (1 + a["hp_pct"])); self.hp_max = self.hp
        if "atk_pct" in a:  self.atk *= (1 + a["atk_pct"])
        if "def_pct" in a:  self.defense *= (1 + a["def_pct"])
        if "spd_pct" in a:  self.spd *= (1 + a["spd_pct"])
        if "crit_pct" in a: self.crit += a["crit_pct"]
        if "lifesteal" in a:        self.lifesteal += a["lifesteal"]
        if "burn_on_hit" in a:      self.burn_on_hit = max(self.burn_on_hit, a["burn_on_hit"])
        if "slow_on_hit" in a:      self.slow_on_hit = max(self.slow_on_hit, a["slow_on_hit"])
        if "revive" in a:           self.revive = max(self.revive, a["revive"])

    # ---- transient combat status ----
    def _init_status(self):
        self.burn = 0
        self.burn_dmg = 0.0
        self.slow_turns = 0
        self.buff_atk_turns = 0
        self.buff_atk_val = 0.0
        self.buff_def_turns = 0
        self.buff_def_val = 0.0
        self.regen_turns = 0
        self.regen_amt = 0.0
        self.frozen = 0
        self.taunt_turns = 0

    def alive(self):
        return self.hp > 0

    def eff_spd(self):
        return self.spd * (0.5 if self.slow_turns > 0 else 1.0)

    def eff_atk(self):
        return self.atk * (1 + (self.buff_atk_val if self.buff_atk_turns > 0 else 0))

    def eff_def(self):
        return self.defense * (1 + (self.buff_def_val if self.buff_def_turns > 0 else 0))

    def reset_status(self):
        self._init_status()
        self.taunting = False

    def take_burn(self):
        if self.burn > 0:
            self.hp -= self.burn_dmg
            self.burn -= 1

    def tick_buffs(self):
        if self.buff_atk_turns > 0: self.buff_atk_turns -= 1
        if self.buff_def_turns > 0: self.buff_def_turns -= 1
        if self.slow_turns > 0: self.slow_turns -= 1
        if self.regen_turns > 0:
            self.hp = min(self.hp_max, self.hp + self.regen_amt)
            self.regen_turns -= 1
        if self.taunt_turns > 0:
            self.taunt_turns -= 1
            if self.taunt_turns == 0:
                self.taunting = False


# ----------------------------------------------------------------------------
# Combat
# ----------------------------------------------------------------------------

_log = []

def log(msg):
    _log.append(msg)


def roll_crit(u):
    return random.random() < u.crit


def deal_damage(attacker, target, mult, magic=False, can_crit=True, logref=_log):
    if not target.alive():
        return 0
    raw = attacker.eff_atk() * mult
    mitigation = target.eff_def() / (target.eff_def() + 50)
    if magic:
        mitigation *= 0.5
    dmg = max(1, raw * (1 - mitigation))
    crit = can_crit and roll_crit(attacker)
    if crit:
        dmg *= 1.8
    dmg = int(dmg)
    target.hp -= dmg
    if attacker.lifesteal > 0 and attacker.alive():
        heal = int(dmg * attacker.lifesteal)
        attacker.hp = min(attacker.hp_max, attacker.hp + heal)
    if attacker.burn_on_hit > 0 and target.alive():
        target.burn = 3
        target.burn_dmg = max(target.burn_dmg, target.hp_max * 0.06 * attacker.burn_on_hit)
    if attacker.slow_on_hit > 0 and target.alive():
        if random.random() < attacker.slow_on_hit:
            target.slow_turns = 2
    if crit:
        logref.append(f"   ✦ CRIT {attacker.name} -> {target.name} (-{dmg})")
    else:
        logref.append(f"   {attacker.name} -> {target.name} (-{dmg})")
    return dmg


def choose_target(u, enemies):
    alive = [e for e in enemies if e.alive()]
    if not alive:
        return None
    taunters = [e for e in alive if e.taunting]
    if taunters:
        return taunters[0]
    if u.ability == "backstab":
        return min(alive, key=lambda e: e.hp)
    if u.ability == "snipe":
        return min(alive, key=lambda e: e.defense)
    if u.kind == "Vanguard" or u.ability in ("taunt", "taunt_aoe", "thorns"):
        return alive[0]
    return min(alive, key=lambda e: e.hp)


def act(u, allies, enemies, logref=_log):
    if not u.alive():
        return
    u.take_burn()
    if not u.alive():
        return
    if u.frozen > 0:
        u.frozen -= 1
        logref.append(f"   {u.name} is frozen and skips")
        return
    u.tick_buffs()

    targets = [e for e in enemies if e.alive()]
    if not targets:
        return
    ab = u.ability

    if ab in ("slash", "shot", "bolt", "smite", "taunt", "thorns"):
        t = choose_target(u, enemies)
        if t:
            deal_damage(u, t, 1.0, magic=(ab == "bolt"))
            if ab == "taunt":
                u.taunting = True
                u.taunt_turns = 1
                logref.append(f"   {u.name} taunts the enemy line!")
            if ab == "thorns":
                u.thorns_val = 0.30
                logref.append(f"   {u.name} raises a thorned guard!")

    elif ab == "rampage":
        for t in targets:
            deal_damage(u, t, 0.6)
        logref.append(f"   {u.name} rampages through the line!")

    elif ab == "backstab":
        t = choose_target(u, enemies)
        if t:
            deal_damage(u, t, 1.8, can_crit=False)
            if t.hp < t.hp_max * 0.4:
                deal_damage(u, t, 1.0, can_crit=False)

    elif ab == "taunt_aoe":
        for t in targets:
            deal_damage(u, t, 0.5)
        u.taunting = True
        u.taunt_turns = 1
        logref.append(f"   {u.name} shields the team with a taunt!")

    elif ab == "fire_aoe":
        for t in targets:
            deal_damage(u, t, 0.7, magic=True)
            t.burn = 3
            t.burn_dmg = max(t.burn_dmg, t.hp_max * 0.08)

    elif ab == "frost_aoe":
        for t in targets:
            deal_damage(u, t, 0.5, magic=True)
            if random.random() < 0.5:
                t.slow_turns = 2
            else:
                t.frozen = 1

    elif ab == "heal":
        hurt = [a for a in allies if a.alive() and a.hp < a.hp_max]
        if hurt:
            t = min(hurt, key=lambda a: a.hp / a.hp_max)
            heal = int(u.eff_atk() * 1.4)
            t.hp = min(t.hp_max, t.hp + heal)
            t.regen_turns = 2
            t.regen_amt = heal * 0.4
            logref.append(f"   {u.name} mends {t.name} (+{heal})")

    elif ab == "buff":
        for a in allies:
            if a.alive():
                a.buff_atk_turns = 2
                a.buff_atk_val = 0.20
                a.buff_def_turns = 2
                a.buff_def_val = 0.20
        logref.append(f"   {u.name} rallies the warband! (+ATK/DEF)")

    elif ab == "snipe":
        t = choose_target(u, enemies)
        if t:
            deal_damage(u, t, 2.4, can_crit=False)

    elif ab == "volley":
        for t in targets:
            deal_damage(u, t, 0.6)
        u.buff_atk_turns = 2
        u.buff_atk_val = 0.15

    # enemy abilities
    elif ab == "enemy_slash":
        t = choose_target(u, enemies)
        if t:
            deal_damage(u, t, 1.0)
    elif ab == "enemy_aoe":
        for t in targets:
            deal_damage(u, t, 0.5)
    elif ab == "enemy_heal":
        hurt = [a for a in allies if a.alive() and a.hp < a.hp_max]
        if hurt:
            t = min(hurt, key=lambda a: a.hp / a.hp_max)
            heal = int(u.eff_atk() * 1.0)
            t.hp = min(t.hp_max, t.hp + heal)
    elif ab == "enemy_tank":
        t = choose_target(u, enemies)
        if t:
            deal_damage(u, t, 1.0)
        u.taunting = True
        u.taunt_turns = 1


def resolve_wave(heroes, enemies, max_rounds=60):
    for h in heroes + enemies:
        h.reset_status()
    round_no = 0
    while round_no < max_rounds:
        round_no += 1
        order = sorted(
            [u for u in heroes + enemies if u.alive()],
            key=lambda u: (-u.eff_spd(), random.random()),
        )
        for u in order:
            foes = enemies if u.side == "hero" else heroes
            if not any(e.alive() for e in foes):
                break
            allies = heroes if u.side == "hero" else enemies
            act(u, allies, foes)
            # thorns reflect onto attacker's target handled via passive damage
            if getattr(u, "thorns_val", 0) > 0:
                pass
        if not any(e.alive() for e in enemies):
            return True, round_no
        if not any(h.alive() for h in heroes):
            return False, round_no
    return False, round_no


# ----------------------------------------------------------------------------
# Roguelite run
# ----------------------------------------------------------------------------

ENEMY_KINDS = [
    ("Ghoul",     "enemy_slash"),
    ("Brute",     "enemy_tank"),
    ("Shade",     "enemy_aoe"),
    ("Cultist",   "enemy_heal"),
    ("Wraith",    "enemy_slash"),
]


def make_enemy(wave, idx):
    kind, ab = random.choice(ENEMY_KINDS)
    name = f"{kind} #{idx+1}"
    e = Unit(name, "enemy", kind, level=1, ability=ab)
    scale = 1 + 0.20 * (wave - 1)   # tuned for ~40-55% naive win rate
    e.hp = int(e.hp * scale * (0.85 + 0.15 * idx))
    e.hp_max = e.hp
    e.atk *= scale
    e.defense *= scale
    return e


def spawn_wave(wave):
    count = min(6, 2 + wave // 2)
    return [make_enemy(wave, i) for i in range(count)]


def draft_team(picks):
    return [Unit(f"{cls}", "hero", cls, level=1) for cls in picks]


def level_up_all(team):
    for h in team:
        if h.alive():
            h.level += 1
            h._derive()


def roll_loot(wave, n=1):
    return random.sample(ITEMS, min(n, len(ITEMS)))


def auto_spec(hero):
    return list(SPEC[hero.kind].keys())[0]


def best_loot_target(team, item, rr_index=0):
    """Pick the hero that benefits most, round-robin across the living team
    so loot doesn't all pile onto one unit."""
    alive = [h for h in team if h.alive()]
    if not alive:
        return team[0]
    a = item["apply"]
    if "hp_pct" in a or "def_pct" in a:
        ranked = sorted(alive, key=lambda h: h.hp_max)
    elif "atk_pct" in a or "crit_pct" in a:
        ranked = sorted(alive, key=lambda h: h.atk)
    elif "spd_pct" in a:
        ranked = sorted(alive, key=lambda h: h.spd)
    else:
        ranked = alive
    return ranked[rr_index % len(ranked)]


def hp_bar(hp, hp_max, width=18):
    """ASCII HP bar like the retro terminal RPG."""
    frac = max(0.0, min(1.0, hp / hp_max)) if hp_max else 0
    filled = int(width * frac)
    return "[" + "#" * filled + "-" * (width - filled) + f"] {int(hp)}/{int(hp_max)}"


def run_game(picks, seed=None, verbose=True, meta=None):
    global _log
    _log = []
    if seed is not None:
        random.seed(seed)

    team = draft_team(picks)
    if meta:
        apply_meta(team, meta)
    if verbose:
        log(f"DRAFT: {', '.join(picks)}")

    wave = 0
    while wave < MAX_WAVE:
        wave += 1
        enemies = spawn_wave(wave)
        if verbose:
            log(f"\n=== WAVE {wave} -- {len(enemies)} enemies ===")
        won, rounds = resolve_wave(team, enemies)
        if not won:
            if verbose:
                log(f"  X Wiped on wave {wave} after {rounds} rounds.")
            return {"result": "defeat", "wave": wave, "log": _log,
                    "shards": wave * 2}
        if verbose:
            log(f"  OK Cleared wave {wave} in {rounds} rounds. Survivors: "
                f"{sum(1 for h in team if h.alive())}/{len(team)}")

        level_up_all(team)
        # campfire: survivors recover some HP between waves (roguelite mercy)
        for h in team:
            if h.alive():
                h.hp = min(h.hp_max, h.hp + int(h.hp_max * 0.35))
        for h in team:
            if h.alive():
                if h.level >= 3 and not h.spec:
                    spec = auto_spec(h)
                    h.apply_spec(spec)
                    if verbose:
                        log(f"  -> {h.kind} transforms into {spec}!")
                elif h.level >= 6 and not h.elite:
                    elite = "Savage" if h.atk > 20 else "Resolute"
                    h.apply_elite(elite)
                    if verbose:
                        log(f"  -> {h.kind} ({h.spec}) ascends as {elite}!")

        drops = roll_loot(wave, n=1 if wave < 3 else 2)
        for rr, item in enumerate(drops):
            target = best_loot_target(team, item, rr_index=rr)
            target.equip(item)
            if verbose:
                log(f"  LOOT: {item['name']} ({item['desc']}) -> {target.kind}")

    if verbose:
        log(f"\nVICTORY -- survived all {MAX_WAVE} waves!")
    return {"result": "victory", "wave": MAX_WAVE, "log": _log,
            "shards": 30}


if __name__ == "__main__":
    if "--sim" in sys.argv:
        picks = ["Vanguard", "Blade", "Arcanist", "Herald", "Ranger"]
        verdicts = []
        for s in (1, 2, 3, 7, 42, 99, 123, 777):
            r = run_game(picks, seed=s, verbose=False)
            verdicts.append(r["result"])
            print(f"[seed {s}] result={r['result']:8s} wave={r['wave']}")
        wins = verdicts.count("victory")
        print(f"\nWin rate over {len(verdicts)} seeds: {wins}/{len(verdicts)}")
        print("\n--- verbose sample (seed 7) ---")
        r = run_game(picks, seed=7, verbose=True)
        print("\n".join(r["log"][:60]))
        print("... (truncated)")
    else:
        print("Run with --sim to execute a headless battle simulation.")

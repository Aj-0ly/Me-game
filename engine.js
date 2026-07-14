/*
 * DTF // TEXT AUTOBATTLER — game engine (vanilla JS)
 * Faithful port of the verified Python game_core.py combat, extended with:
 *  - rarity tiers (Common/Rare/Epic/Legendary) that scale item power
 *  - 24 items, 4 unlockable hero classes, 3 game modes, meta relics
 * Pure logic, no DOM. Runs in Node (tests) and the browser (window.CRYSTAL).
 */

(function (root) {
  "use strict";

  // ---------- base classes (5 default + 4 unlockable) ----------
  const CLASSES = {
    Vanguard: { hp: 150, atk: 14, def: 20, spd: 6,  crit: 0.05, ability: "taunt",   locked: false },
    Blade:    { hp: 95,  atk: 28, def: 8,  spd: 12, crit: 0.15, ability: "slash",   locked: false },
    Arcanist: { hp: 78,  atk: 24, def: 6,  spd: 10, crit: 0.10, ability: "bolt",    locked: false },
    Herald:   { hp: 88,  atk: 13, def: 10, spd: 9,  crit: 0.05, ability: "smite",   locked: false },
    Ranger:   { hp: 82,  atk: 21, def: 7,  spd: 14, crit: 0.18, ability: "shot",    locked: false },
    // --- unlockable (bought with meta shards) ---
    Warden:   { hp: 170, atk: 16, def: 26, spd: 5,  crit: 0.04, ability: "taunt_aoe", locked: true,  unlock: "hero_warden" },
    Duelist:  { hp: 105, atk: 34, def: 9,  spd: 13, crit: 0.22, ability: "backstab",  locked: true,  unlock: "hero_duelist" },
    Druid:    { hp: 100, atk: 18, def: 10, spd: 9,  crit: 0.10, ability: "heal",     locked: true,  unlock: "hero_druid" },
    Sorcerer: { hp: 70,  atk: 30, def: 5,  spd: 12, crit: 0.15, ability: "fire_aoe", locked: true,  unlock: "hero_sorcerer" },
  };

  const SPEC = {
    Vanguard: {
      Bastion:   { bonus: { hp: 0.5, def: 0.4 }, ability: "taunt_aoe" },
      Bulwark:   { bonus: { hp: 0.3, def: 0.3, thorns: 0.30 }, ability: "thorns" },
    },
    Blade: {
      Berserker: { bonus: { atk: 0.5, lifesteal: 0.30 }, ability: "rampage" },
      Assassin:  { bonus: { atk: 0.3, crit: 0.30 }, ability: "backstab" },
    },
    Arcanist: {
      Pyromancer:   { bonus: { atk: 0.4 }, ability: "fire_aoe" },
      Cryomancer:   { bonus: { atk: 0.2, spd: 0.2 }, ability: "frost_aoe" },
    },
    Herald: {
      Warpriest:     { bonus: { hp: 0.2 }, ability: "heal" },
      Battlechanter: { bonus: { atk: 0.1, def: 0.1 }, ability: "buff" },
    },
    Ranger: {
      Sniper:    { bonus: { atk: 0.6, crit: 0.20 }, ability: "snipe" },
      Tactician: { bonus: { spd: 0.4, atk: 0.1 }, ability: "volley" },
    },
    Warden: {
      Fortress:  { bonus: { hp: 0.6, def: 0.5 }, ability: "taunt_aoe" },
      Protector: { bonus: { def: 0.6, thorns: 0.4 }, ability: "thorns" },
    },
    Duelist: {
      Reaver:    { bonus: { atk: 0.6, lifesteal: 0.35 }, ability: "rampage" },
      Phantom:   { bonus: { atk: 0.4, crit: 0.35 }, ability: "backstab" },
    },
    Druid: {
      Hierophant: { bonus: { hp: 0.3 }, ability: "heal" },
      Summoner:   { bonus: { atk: 0.3, spd: 0.2 }, ability: "buff" },
    },
    Sorcerer: {
      Inferno:   { bonus: { atk: 0.5 }, ability: "fire_aoe" },
      Tempest:   { bonus: { atk: 0.3, spd: 0.3 }, ability: "frost_aoe" },
    },
  };

  const ELITE = {
    Resolute: { bonus: { hp: 0.30, def: 0.30 }, label: "Resolute" },
    Savage:   { bonus: { atk: 0.30, crit: 0.15 }, label: "Savage" },
  };

  // ---------- rarity ----------
  const RARITY = {
    Common:    { mult: 1.0,  weight: 60, color: "#9fb0a0", css: "var(--dim)" },
    Rare:      { mult: 1.25, weight: 26, color: "#4aa3ff", css: "var(--cyan)" },
    Epic:      { mult: 1.55, weight: 11, color: "#cc77ff", css: "var(--magenta)" },
    Legendary: { mult: 2.0,  weight: 3,  color: "#ffcc44", css: "var(--amber)" },
  };
  function pickRarity() {
    const entries = Object.entries(RARITY).filter(([k]) => k !== "Common" || true);
    let total = 0; entries.forEach(([, v]) => total += v.weight);
    let r = rng() * total;
    for (const [k, v] of entries) { if ((r -= v.weight) <= 0) return k; }
    return "Common";
  }

  // ---------- items (24) ----------
  // base = effect at Common; scaled by RARITY mult. apply = stat deltas.
  const ITEMS = [
    { name: "Crystal Edge",    desc: "+ATK",        base: { atk_pct: 0.25 }, flavor: "a honed shard of the deep" },
    { name: "Aegis Plate",     desc: "+HP",         base: { hp_pct: 0.30 }, flavor: "warding crystalmail" },
    { name: "Titan Charm",     desc: "+DEF",        base: { def_pct: 0.25 }, flavor: "heavy with old strength" },
    { name: "Swift Boots",     desc: "+SPD",        base: { spd_pct: 0.20 }, flavor: "laces woven by wind" },
    { name: "Crit Lens",       desc: "+CRIT",       base: { crit_pct: 0.15 }, flavor: "see the killing moment" },
    { name: "Vampiric Sigil",  desc: "lifesteal",   base: { lifesteal: 0.20 }, flavor: "drinks what it spills" },
    { name: "Inferno Core",    desc: "burn on hit", base: { burn_on_hit: 0.6 }, flavor: "always smouldering" },
    { name: "Frost Lens",      desc: "slow on hit", base: { slow_on_hit: 0.25 }, flavor: "breathes winter" },
    { name: "Group Banner",    desc: "team +ATK/HP",base: { team_atk_pct: 0.10, team_hp_pct: 0.10 }, flavor: "raises the warband" },
    { name: "Phoenix Feather", desc: "revive once", base: { revive: 0.35 }, flavor: "burns to live again" },
    { name: "Overclock Gem",   desc: "+ATK/SPD",    base: { atk_pct: 0.12, spd_pct: 0.12 }, flavor: "overdrives the soul" },
    { name: "Bulwark Rune",    desc: "+HP/DEF",     base: { hp_pct: 0.18, def_pct: 0.18 }, flavor: "stone-bound ward" },
    // Rare+
    { name: "Stormfang",       desc: "+ATK +CRIT",  base: { atk_pct: 0.30, crit_pct: 0.12 }, flavor: "hums with lightning", minR: "Rare" },
    { name: "Eclipse Veil",    desc: "+DEF +HP",    base: { def_pct: 0.30, hp_pct: 0.25 }, flavor: "swallows the light", minR: "Rare" },
    { name: "Bloodpact Idol",  desc: "big lifesteal",base: { lifesteal: 0.35 }, flavor: "a pact in red", minR: "Rare" },
    { name: "Tempest Coil",    desc: "+SPD +ATK",   base: { spd_pct: 0.28, atk_pct: 0.18 }, flavor: "coiled thunder", minR: "Rare" },
    { name: "Warden's Oath",   desc: "revive +HP",  base: { revive: 0.5, hp_pct: 0.15 }, flavor: "oath never broken", minR: "Rare" },
    // Epic+
    { name: "Void Reaver",     desc: "+ATK big",    base: { atk_pct: 0.55 }, flavor: "tears the dark", minR: "Epic" },
    { name: "Aegis Eternal",   desc: "+HP/DEF big", base: { hp_pct: 0.45, def_pct: 0.40 }, flavor: "unbreaking", minR: "Epic" },
    { name: "Seraph Wings",    desc: "+SPD big",    base: { spd_pct: 0.55 }, flavor: "flight of the blessed", minR: "Epic" },
    { name: "Doomheart",       desc: "burn+ATK",    base: { burn_on_hit: 0.9, atk_pct: 0.20 }, flavor: "a heart of ruin", minR: "Epic" },
    { name: "Godslayer Sigil", desc: "+ATK +CRIT big", base: { atk_pct: 0.40, crit_pct: 0.30 }, flavor: "ends the divine", minR: "Epic" },
    // Legendary
    { name: "Crown of DTF",    desc: "team +ATK/HP big", base: { team_atk_pct: 0.25, team_hp_pct: 0.25 }, flavor: "worn by legends", minR: "Legendary" },
    { name: "Singularity",     desc: "+ALL stats",  base: { atk_pct: 0.35, def_pct: 0.35, hp_pct: 0.35, spd_pct: 0.20, crit_pct: 0.15 }, flavor: "collapses the battlefield", minR: "Legendary" },
  ];
  const RAR_ORDER = ["Common","Rare","Epic","Legendary"];
  function rarityRank(r){ return RAR_ORDER.indexOf(r); }

  // ---------- shop upgrades (meta, permanent) ----------
  const SHOP_UPGRADES = [
    { id: "forge",  name: "Crystal Forge",   target: "all",     stat: "atk", per: 0.06, desc: "All heroes +6% ATK per rank",  cost: 8,  cost_step: 6, max: 10 },
    { id: "aegis",  name: "Aegis Ward",      target: "all",     stat: "def", per: 0.06, desc: "All heroes +6% DEF per rank",  cost: 8,  cost_step: 6, max: 10 },
    { id: "vita",   name: "Vital Font",      target: "all",     stat: "hp",  per: 0.08, desc: "All heroes +8% HP per rank",   cost: 8,  cost_step: 6, max: 10 },
    { id: "blades", name: "Blade Tutelage", target: "Blade",    stat: "atk", per: 0.10, desc: "Blade +10% ATK per rank",      cost: 10, cost_step: 7, max: 8 },
    { id: "ward",   name: "Ward Mastery",   target: "Vanguard", stat: "def", per: 0.10, desc: "Vanguard +10% DEF per rank",  cost: 10, cost_step: 7, max: 8 },
    { id: "arcane", name: "Arcane Well",    target: "Arcanist", stat: "atk", per: 0.10, desc: "Arcanist +10% ATK per rank",  cost: 10, cost_step: 7, max: 8 },
    { id: "grace",  name: "Herald's Grace", target: "Herald",   stat: "hp",  per: 0.12, desc: "Herald +12% HP per rank",     cost: 10, cost_step: 7, max: 8 },
    { id: "eyes",   name: "Hunter's Eye",   target: "Ranger",   stat: "atk", per: 0.10, desc: "Ranger +10% ATK per rank",    cost: 10, cost_step: 7, max: 8 },
  ];

  // ---------- unlockable heroes (meta) ----------
  const SHOP_HEROES = [
    { id: "hero_warden",   name: "Warden",   cost: 60,  desc: "Tanky taunt-aoe bulwark. Unlocks the class." },
    { id: "hero_duelist",  name: "Duelist",  cost: 80,  desc: "Glass-cannon backstabber. Unlocks the class." },
    { id: "hero_druid",    name: "Druid",    cost: 70,  desc: "Healer buffer. Unlocks the class." },
    { id: "hero_sorcerer", name: "Sorcerer", cost: 90,  desc: "AoE fire mage. Unlocks the class." },
  ];

  // ---------- meta relics (passive run bonuses, bought permanent) ----------
  const SHOP_RELICS = [
    { id: "relic_camp",   name: "Everburn Campfire", cost: 50, desc: "Campfire heals 50% (was 35%)." },
    { id: "relic_loot",   name: "Lucky Find",        cost: 55, desc: "+1 loot drop per wave." },
    { id: "relic_start",  name: "Veteran Start",      cost: 65, desc: "Start each run at wave 2." },
    { id: "relic_gold",   name: "Shard Magnet",       cost: 45, desc: "+50% shards from runs." },
    { id: "relic_thrive", name: "Thriving Warband",  cost: 70, desc: "All heroes start +1 level." },
  ];

  const MAX_WAVE = 12;
  const MODES = {
    campaign: { name: "Campaign", desc: "Clear 12 waves. Classic run.", waves: 12, boss: false },
    endless:  { name: "Endless",  desc: "Survive as long as you can. Difficulty ramps forever.", waves: 999, boss: false },
    boss:     { name: "Boss Rush", desc: "Every 3rd wave is an Elite boss. Brutal.", waves: 12, boss: true },
  };

  // ---- RNG ----
  let rng = Math.random;
  function setRng(fn) { rng = fn; }
  function resetRng() { rng = Math.random; }
  function makeRng(seed) { let s = (seed >>> 0) || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return (s >>> 0) / 4294967296; }; }

  // ---- Unit ----
  function Unit(name, side, kind, level, spec, ability) {
    this.name = name; this.side = side; this.kind = kind; this.level = level || 1;
    this.spec = spec || null; this.elite = null; this.ability = ability || "slash";
    this.lifesteal = 0; this.burn_on_hit = 0; this.slow_on_hit = 0; this.revive = 0; this.thorns_val = 0;
    this.growth_hp = 1; this.growth_atk = 1; this.growth_def = 1;
    this._items = [];
    const base = CLASSES[kind] || { hp: 80, atk: 18, def: 8, spd: 10, crit: 0.1 };
    this._applyBase(base, this.level);
    if (spec && SPEC[kind]) this.applySpec(spec);
    this.hp_max = this.hp;
    this._initStatus();
  }
  Unit.prototype._applyBase = function (base, level) {
    this.hp = Math.floor(base.hp * (1 + 0.12 * (level - 1)));
    this.atk = base.atk * (1 + 0.10 * (level - 1));
    this.defense = base.def * (1 + 0.10 * (level - 1));
    this.spd = base.spd; this.crit = base.crit;
  };
  Unit.prototype._derive = function () {
    const base = CLASSES[this.kind] || { hp: 90, atk: 18, def: 12, spd: 9, crit: 0.08 };
    const mult = 1 + 0.10 * (this.level - 1);
    let hp = Math.floor(base.hp * (1 + 0.12 * (this.level - 1)));
    let atk = base.atk * mult;
    let defense = base.def * mult;
    if (this.spec && SPEC[this.kind]) { const b = SPEC[this.kind][this.spec].bonus;
      if (b.hp) hp = Math.floor(hp * (1 + b.hp)); if (b.atk) atk *= (1 + b.atk); if (b.def) defense *= (1 + b.def); }
    if (this.elite) { const b = ELITE[this.elite].bonus;
      if (b.hp) hp = Math.floor(hp * (1 + b.hp)); if (b.atk) atk *= (1 + b.atk); if (b.def) defense *= (1 + b.def); }
    hp = Math.floor(hp * this.growth_hp); atk *= this.growth_atk; defense *= this.growth_def;
    this.hp_max = Math.floor(hp); this.atk = atk; this.defense = defense; this.hp = this.hp_max;
  };
  Unit.prototype.applySpec = function (spec) { this.spec = spec; const b = SPEC[this.kind][spec].bonus; this.ability = SPEC[this.kind][spec].ability; if (b.lifesteal) this.lifesteal += b.lifesteal; this._derive(); };
  Unit.prototype.applyElite = function (elite) { this.elite = elite; this._derive(); };
  Unit.prototype.equip = function (itemInst) {
    const a = itemInst.apply;
    if (a.hp_pct)   { this.hp = Math.floor(this.hp * (1 + a.hp_pct)); this.hp_max = this.hp; }
    if (a.atk_pct)  this.atk *= (1 + a.atk_pct);
    if (a.def_pct)  this.defense *= (1 + a.def_pct);
    if (a.spd_pct)  this.spd *= (1 + a.spd_pct);
    if (a.crit_pct) this.crit += a.crit_pct;
    if (a.lifesteal)    this.lifesteal += a.lifesteal;
    if (a.burn_on_hit)  this.burn_on_hit = Math.max(this.burn_on_hit, a.burn_on_hit);
    if (a.slow_on_hit)  this.slow_on_hit = Math.max(this.slow_on_hit, a.slow_on_hit);
    if (a.revive)       this.revive = Math.max(this.revive, a.revive);
    if (a.team_atk_pct) this._team_atk_pct = (this._team_atk_pct||0) + a.team_atk_pct;
    if (a.team_hp_pct)  this._team_hp_pct  = (this._team_hp_pct||0) + a.team_hp_pct;
    this._items.push(itemInst);
  };
  Unit.prototype._initStatus = function () { this.burn = 0; this.burn_dmg = 0; this.slow_turns = 0; this.buff_atk_turns = 0; this.buff_atk_val = 0; this.buff_def_turns = 0; this.buff_def_val = 0; this.regen_turns = 0; this.regen_amt = 0; this.frozen = 0; this.taunt_turns = 0; };
  Unit.prototype.alive = function () { return this.hp > 0; };
  Unit.prototype.effSpd = function () { return this.slow_turns > 0 ? this.spd * 0.5 : this.spd; };
  Unit.prototype.effAtk = function () { return this.atk * (1 + (this.buff_atk_turns > 0 ? this.buff_atk_val : 0)); };
  Unit.prototype.effDef = function () { return this.defense * (1 + (this.buff_def_turns > 0 ? this.buff_def_val : 0)); };
  Unit.prototype.resetStatus = function () { this._initStatus(); this.taunting = false; };
  Unit.prototype.takeBurn = function () { if (this.burn > 0) { this.hp -= this.burn_dmg; this.burn--; } };
  Unit.prototype.tickBuffs = function () { if (this.buff_atk_turns > 0) this.buff_atk_turns--; if (this.buff_def_turns > 0) this.buff_def_turns--; if (this.slow_turns > 0) this.slow_turns--; if (this.regen_turns > 0) { this.hp = Math.min(this.hp_max, this.hp + this.regen_amt); this.regen_turns--; } if (this.taunt_turns > 0) { this.taunt_turns--; if (this.taunt_turns === 0) this.taunting = false; } };

  // ---- combat ----
  const log = [];
  function L(msg) { log.push(msg); }
  function rollCrit(u) { return rng() < u.crit; }
  function dealDamage(attacker, target, mult, magic, canCrit) {
    magic = magic || false; canCrit = (canCrit === undefined) ? true : canCrit;
    if (!target.alive()) return 0;
    const raw = attacker.effAtk() * mult;
    let mitigation = target.effDef() / (target.effDef() + 50);
    if (magic) mitigation *= 0.5;
    let dmg = Math.max(1, raw * (1 - mitigation));
    const crit = canCrit && rollCrit(attacker);
    if (crit) dmg *= 1.8;
    dmg = Math.floor(dmg);
    target.hp -= dmg;
    if (attacker.lifesteal > 0 && attacker.alive()) { const heal = Math.floor(dmg * attacker.lifesteal); attacker.hp = Math.min(attacker.hp_max, attacker.hp + heal); }
    if (attacker.burn_on_hit > 0 && target.alive()) { target.burn = 3; target.burn_dmg = Math.max(target.burn_dmg, target.hp_max * 0.06 * attacker.burn_on_hit); }
    if (attacker.slow_on_hit > 0 && target.alive()) { if (rng() < attacker.slow_on_hit) target.slow_turns = 2; }
    if (crit) L(`   ✦ CRIT ${attacker.name} -> ${target.name} (-${dmg})`);
    else L(`   ${attacker.name} -> ${target.name} (-${dmg})`);
    return dmg;
  }
  function chooseTarget(u, enemies) {
    const alive = enemies.filter(e => e.alive()); if (!alive.length) return null;
    let taunters = alive.filter(e => e.taunting); if (taunters.length) return taunters[0];
    if (u.ability === "backstab") return alive.reduce((a, b) => (b.hp < a.hp ? b : a));
    if (u.ability === "snipe") return alive.reduce((a, b) => (b.defense < a.defense ? b : a));
    if (u.kind === "Vanguard" || ["taunt", "taunt_aoe", "thorns"].includes(u.ability)) return alive[0];
    return alive.reduce((a, b) => (b.hp < a.hp ? b : a));
  }
  function act(u, allies, enemies) {
    if (!u.alive()) return;
    u.takeBurn(); if (!u.alive()) return;
    if (u.frozen > 0) { u.frozen--; L(`   ${u.name} is frozen and skips`); return; }
    u.tickBuffs();
    const targets = enemies.filter(e => e.alive()); if (!targets.length) return;
    const ab = u.ability;
    if (["slash","shot","bolt","smite","taunt","thorns"].includes(ab)) { const t = chooseTarget(u, enemies); if (t) { dealDamage(u, t, 1.0, ab === "bolt", true); if (ab === "taunt") { u.taunting = true; u.taunt_turns = 1; L(`   ${u.name} taunts the enemy line!`); } if (ab === "thorns") { u.thorns_val = 0.30; L(`   ${u.name} raises a thorned guard!`); } } }
    else if (ab === "rampage") { targets.forEach(t => dealDamage(u, t, 0.6, false, true)); L(`   ${u.name} rampages through the line!`); }
    else if (ab === "backstab") { const t = chooseTarget(u, enemies); if (t) { dealDamage(u, t, 1.8, false, false); if (t.hp < t.hp_max * 0.4) dealDamage(u, t, 1.0, false, false); } }
    else if (ab === "taunt_aoe") { targets.forEach(t => dealDamage(u, t, 0.5, false, true)); u.taunting = true; u.taunt_turns = 1; L(`   ${u.name} shields the team with a taunt!`); }
    else if (ab === "fire_aoe") { targets.forEach(t => { dealDamage(u, t, 0.7, true, true); t.burn = 3; t.burn_dmg = Math.max(t.burn_dmg, t.hp_max * 0.08); }); }
    else if (ab === "frost_aoe") { targets.forEach(t => { dealDamage(u, t, 0.5, true, true); if (rng() < 0.5) t.slow_turns = 2; else t.frozen = 1; }); }
    else if (ab === "heal") { const hurt = allies.filter(a => a.alive() && a.hp < a.hp_max); if (hurt.length) { const t = hurt.reduce((a, b) => (b.hp / b.hp_max < a.hp / a.hp_max ? b : a)); const heal = Math.floor(u.effAtk() * 1.4); t.hp = Math.min(t.hp_max, t.hp + heal); t.regen_turns = 2; t.regen_amt = heal * 0.4; L(`   ${u.name} mends ${t.name} (+${heal})`); } }
    else if (ab === "buff") { allies.forEach(a => { if (a.alive()) { a.buff_atk_turns = 2; a.buff_atk_val = 0.20; a.buff_def_turns = 2; a.buff_def_val = 0.20; } }); L(`   ${u.name} rallies the warband! (+ATK/DEF)`); }
    else if (ab === "snipe") { const t = chooseTarget(u, enemies); if (t) dealDamage(u, t, 2.4, false, false); }
    else if (ab === "volley") { targets.forEach(t => dealDamage(u, t, 0.6, false, true)); u.buff_atk_turns = 2; u.buff_atk_val = 0.15; }
    else if (ab === "enemy_slash") { const t = chooseTarget(u, enemies); if (t) dealDamage(u, t, 1.0, false, true); }
    else if (ab === "enemy_aoe") { targets.forEach(t => dealDamage(u, t, 0.5, false, true)); }
    else if (ab === "enemy_heal") { const hurt = allies.filter(a => a.alive() && a.hp < a.hp_max); if (hurt.length) { const t = hurt.reduce((a, b) => (b.hp / b.hp_max < a.hp / a.hp_max ? b : a)); const heal = Math.floor(u.effAtk() * 1.0); t.hp = Math.min(t.hp_max, t.hp + heal); } }
    else if (ab === "enemy_tank") { const t = chooseTarget(u, enemies); if (t) { dealDamage(u, t, 1.0, false, true); } u.taunting = true; u.taunt_turns = 1; }
  }
  function resolveWave(heroes, enemies, maxRounds) {
    maxRounds = maxRounds || 60;
    heroes.concat(enemies).forEach(u => u.resetStatus());
    let round = 0;
    while (round < maxRounds) {
      round++;
      const order = heroes.concat(enemies).filter(u => u.alive()).sort((a, b) => b.effSpd() - a.effSpd() || rng() - 0.5);
      for (const u of order) { const foes = u.side === "hero" ? enemies : heroes; if (!foes.some(e => e.alive())) break; const allies = u.side === "hero" ? heroes : enemies; act(u, allies, foes); }
      if (!enemies.some(e => e.alive())) return [true, round];
      if (!heroes.some(h => h.alive())) return [false, round];
    }
    return [false, round];
  }

  // ---- run building ----
  const ENEMY_KINDS = [["Ghoul","enemy_slash"],["Brute","enemy_tank"],["Shade","enemy_aoe"],["Cultist","enemy_heal"],["Wraith","enemy_slash"]];
  function makeEnemy(wave, idx, opts) {
    opts = opts || {};
    const [kind, ab] = ENEMY_KINDS[Math.floor(rng() * ENEMY_KINDS.length)];
    const e = new Unit(`${kind} #${idx + 1}`, "enemy", kind, 1, null, ab);
    const scale = 1 + 0.20 * (wave - 1) * (opts.boss ? 1.6 : 1);
    e.hp = Math.floor(e.hp * scale * (0.85 + 0.15 * idx) * (opts.boss ? 3 : 1));
    e.hp_max = e.hp; e.atk *= scale * (opts.boss ? 1.8 : 1); e.defense *= scale * (opts.boss ? 1.6 : 1);
    if (opts.boss) { e.elite = "Savage"; e._derive(); e.name = "✦ BOSS " + kind; }
    return e;
  }
  function spawnWave(wave, mode) {
    mode = mode || "campaign";
    const count = Math.min(6, 2 + Math.floor(wave / 2));
    const arr = [];
    for (let i = 0; i < count; i++) arr.push(makeEnemy(wave, i, { boss: mode === "boss" && wave % 3 === 0 }));
    return arr;
  }
  function draftTeam(picks) { return picks.map(cls => new Unit(cls, "hero", cls, 1)); }
  function levelUpAll(team) { team.forEach(h => { if (h.alive()) { h.level++; h._derive(); } }); }
  function autoSpec(hero) { return Object.keys(SPEC[hero.kind])[0]; }
  function bestLootTarget(team, itemInst, rr) {
    const alive = team.filter(h => h.alive()); if (!alive.length) return team[0];
    const a = itemInst.apply; let ranked;
    if (a.hp_pct || a.def_pct) ranked = alive.slice().sort((x, y) => x.hp_max - y.hp_max);
    else if (a.atk_pct || a.crit_pct) ranked = alive.slice().sort((x, y) => x.atk - y.atk);
    else if (a.spd_pct) ranked = alive.slice().sort((x, y) => x.spd - y.spd);
    else ranked = alive;
    return ranked[rr % ranked.length];
  }
  // build an item instance with a rolled rarity (scaled effects)
  function rollItem(wave) {
    const pool = ITEMS.slice();
    const chosen = pool[Math.floor(rng() * pool.length)];
    let rarity = pickRarity();
    while (chosen.minR && rarityRank(rarity) < rarityRank(chosen.minR)) rarity = chosen.minR;
    const m = RARITY[rarity].mult;
    const apply = {};
    for (const k in chosen.base) apply[k] = chosen.base[k] * (k.endsWith("pct") ? m : m);
    return { name: chosen.name, desc: chosen.desc, rarity, apply, flavor: chosen.flavor };
  }
  function rollLoot(wave, n) {
    const out = []; for (let i = 0; i < n; i++) out.push(rollItem(wave)); return out;
  }

  function hpBar(hp, hpMax, width) {
    width = width || 18; const frac = Math.max(0, Math.min(1, hp / hpMax)); const filled = Math.floor(width * frac);
    return "[" + "#".repeat(filled) + "-".repeat(width - filled) + `] ${Math.floor(hp)}/${Math.floor(hpMax)}`;
  }

  // ---- meta persistence ----
  function loadMeta() {
    try { const raw = (root.localStorage && localStorage.getItem("crystal_meta")); if (raw) { const data = JSON.parse(raw); data.shards = data.shards || 0; data.ranks = data.ranks || {}; SHOP_UPGRADES.forEach(u => { if (data.ranks[u.id] == null) data.ranks[u.id] = 0; }); data.unlocks = data.unlocks || {}; data.relics = data.relics || {}; data.best = data.best || { wave: 0 }; data.wins = data.wins || 0; data.totalBought = data.totalBought || 0; data.bestCombo = data.bestCombo || 0; data.ach = data.ach || {}; return data; } } catch (e) {}
    const ranks = {}; SHOP_UPGRADES.forEach(u => ranks[u.id] = 0);
    return { shards: 0, ranks, unlocks: {}, relics: {}, best: { wave: 0 }, wins: 0, totalBought: 0, bestCombo: 0, ach: {} };
  }
  function saveMeta(meta) { try { if (root.localStorage) localStorage.setItem("crystal_meta", JSON.stringify(meta)); } catch (e) {} }
  function upgradeCost(up, rank) { return up.cost + up.cost_step * rank; }
  function unlockedHeroes(meta) { return Object.keys(CLASSES).filter(k => !CLASSES[k].locked || meta.unlocks[CLASSES[k].unlock]); }
  function relicOn(meta, id) { return !!meta.relics[id]; }
  function applyMeta(team, meta) {
    const ranks = meta.ranks;
    team.forEach(h => { let mh = 1, ma = 1, md = 1;
      SHOP_UPGRADES.forEach(up => { const r = ranks[up.id] || 0; if (r <= 0) return; if (up.target === "all" || up.target === h.kind) { if (up.stat === "hp") mh *= (1 + up.per * r); else if (up.stat === "atk") ma *= (1 + up.per * r); else if (up.stat === "def") md *= (1 + up.per * r); } });
      h.growth_hp *= mh; h.growth_atk *= ma; h.growth_def *= md; h._derive(); });
    // team buffs from items
    const tatk = team.reduce((s, h) => s + (h._team_atk_pct || 0), 0);
    const thp = team.reduce((s, h) => s + (h._team_hp_pct || 0), 0);
    if (tatk) team.forEach(h => { h.growth_atk *= (1 + tatk); h._derive(); });
    if (thp) team.forEach(h => { h.growth_hp *= (1 + thp); h.hp_max = Math.floor(h.hp_max * (1 + thp)); h.hp = h.hp_max; });
    // relic: thriving warband (+1 start level)
    if (relicOn(meta, "relic_thrive")) team.forEach(h => { h.level += 1; h._derive(); });
  }

  function devGrantItem(team, nameOrRarity) {
    const r = RARITY[nameOrRarity] ? nameOrRarity : pickRarity();
    const pool = ITEMS.filter(i => i.rarity === r);
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    const item = rollItemSpecific(chosen, r);
    const t = team.filter(h => h.alive());
    (t[0] || team[0]).equip(item);
    return item;
  }
  function rollItemSpecific(chosen, rarity) {
    const m = RARITY[rarity].mult; const apply = {};
    for (const k in chosen.base) apply[k] = chosen.base[k] * (k.endsWith("pct") ? m : m);
    return { name: chosen.name, desc: chosen.desc, rarity, apply, flavor: chosen.flavor };
  }
  function devUnlockAll(meta) { Object.keys(CLASSES).forEach(k => { if (CLASSES[k].unlock) meta.unlocks[CLASSES[k].unlock] = true; }); Object.keys(SHOP_RELICS).forEach(k => meta.relics[k] = true); SHOP_UPGRADES.forEach(u => meta.ranks[u.id] = u.max); }
  function devAddShards(meta, n) { meta.shards += n; }

  const CRYSTAL = {
    CLASSES, SPEC, ELITE, RARITY, RAR_ORDER, ITEMS, SHOP_UPGRADES, SHOP_HEROES, SHOP_RELICS,
    MODES, MAX_WAVE, RELIC_DEFS: SHOP_RELICS, Unit,
    setRng, resetRng, makeRng,
    resolveWave, spawnWave, draftTeam, levelUpAll, autoSpec,
    bestLootTarget, rollLoot, rollItem, rarityRank,
    hpBar, loadMeta, saveMeta, upgradeCost, unlockedHeroes, relicOn, applyMeta, log,
    devGrantItem, devUnlockAll, devAddShards,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = CRYSTAL;
  root.CRYSTAL = CRYSTAL;
})(typeof window !== "undefined" ? window : globalThis);

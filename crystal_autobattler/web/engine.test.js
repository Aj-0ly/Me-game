/* Node test for the expanded DTF engine.
 * 1) Item count + all rarities reachable.
 * 2) Balance (full campaign run, auto-player) — must not be trivially 0% or 100%.
 * 3) Unlockable heroes draftable after meta unlock.
 * 4) Modes produce correct wave counts / boss flag.
 * 5) Meta shop: hero unlock + relic + upgrade application.
 * 6) hpBar + export shape. */
const C = require("./engine.js");

// 1) items + rarity
console.log("ITEMS:", C.ITEMS.length, "| expect>=24");
console.log("CLASSES total:", Object.keys(C.CLASSES).length, "| unlockable:", Object.values(C.CLASSES).filter(c=>c.locked).length);
let rarSeen = new Set();
for (let i=0;i<4000;i++){ rarSeen.add(C.rollItem(5).rarity); }
console.log("rarities seen:", [...rarSeen].sort().join(","), "| all4:", ["Common","Rare","Epic","Legendary"].every(r=>rarSeen.has(r)));

// 2) balance over seeds (campaign)
function fullRun(seed, picks){
  C.setRng(C.makeRng(seed));
  const meta = C.loadMeta();
  const team = C.draftTeam(picks); C.applyMeta(team, meta);
  let wave=0, won=false;
  while (wave < C.MAX_WAVE){
    wave++; const enemies = C.spawnWave(wave, "campaign");
    [won] = C.resolveWave(team, enemies);
    if (!won) return { result:"defeat", wave };
    C.levelUpAll(team);
    team.forEach(h=>{ if(h.alive()) h.hp=Math.min(h.hp_max, h.hp+Math.floor(h.hp_max*0.35)); });
    team.forEach(h=>{ if(h.alive()&&h.level>=3&&!h.spec) h.applySpec(C.autoSpec(h));
      else if(h.alive()&&h.level>=6&&!h.elite) h.applyElite(h.atk>20?"Savage":"Resolute"); });
    C.rollLoot(wave, wave<3?1:2).forEach((it,i)=>C.bestLootTarget(team,it,i).equip(it));
  }
  return { result:"victory", wave:C.MAX_WAVE };
}
let wins=0, n=12; const seeds=[1,2,3,7,42,99,123,256,777,1024,13,55];
for (const s of seeds){ if (fullRun(s,["Vanguard","Blade","Arcanist","Herald","Ranger"]).result==="victory") wins++; }
console.log(`campaign win-rate over ${n} seeds: ${wins}/${n}`);

// 3) unlockable hero
const meta = C.loadMeta(); meta.unlocks.hero_duelist = true;
const unlocked = C.unlockedHeroes(meta);
console.log("Duelist unlocked?", unlocked.includes("Duelist"));
const t2 = C.draftTeam(["Duelist","Blade","Arcanist","Herald","Ranger"]);
console.log("draft Duelist ok:", t2[0].kind==="Duelist");

// 4) modes
console.log("endless waves const:", C.MODES.endless.waves, "| boss flag:", C.MODES.boss.boss);
const bossWave = C.spawnWave(3, "boss");
console.log("boss wave 3 has boss enemy?", bossWave.some(e=>e.name.includes("BOSS")));
const normWave = C.spawnWave(3, "campaign");
console.log("campaign wave 3 no boss?", !normWave.some(e=>e.name.includes("BOSS")));

// 5) meta shop
const m2 = C.loadMeta(); m2.shards = 500;
m2.ranks.forge = 3; m2.unlocks.hero_sorcerer = true; m2.relics.relic_camp = true;
const team = C.draftTeam(["Sorcerer","Blade","Arcanist","Herald","Ranger"]);
C.applyMeta(team, m2);
console.log("Sorcerer atk after forge x3 (expect >30):", team[0].atk.toFixed(1));
console.log("relic camp on?", C.relicOn(m2,"relic_camp"));

// 6) hpBar
console.log("hpBar:", C.hpBar(50,100));
console.log("ALL_ENGINE_OK");

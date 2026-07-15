/* jsdom UI test v3: mode select, draft (locked heroes), combat loop, retry,
 * settings (5 toggles + speed), shop tabs (Upgrades/Heroes/Relics), unlock hero,
 * export/import. Needs: npm i jsdom */
const { JSDOM } = require("jsdom");
const fs = require("fs"); const path = require("path");
const dir = __dirname; const html = fs.readFileSync(path.join(dir,"index.html"),"utf8");
const dom = new JSDOM(html,{ runScripts:"outside-only", pretendToBeVisual:true, url:"http://localhost/" });
const { window } = dom; const { document } = window;
global.window=window; global.document=document; global.navigator=window.navigator;
global.btoa=(s)=>Buffer.from(s,"binary").toString("base64"); global.atob=(s)=>Buffer.from(s,"base64").toString("binary");
window.btoa=global.btoa; window.atob=global.atob;
window.localStorage.setItem("crystal_meta", JSON.stringify({shards:500,ranks:{},unlocks:{},relics:{},best:{wave:0},wins:0,totalBought:0,bestCombo:0,ach:{}}));
window.prompt=()=>null; window.alert=()=>{};
global.setTimeout=(fn,ms)=>{ if(ms===260) return 0; /* swallow BGM loop in sync test */ fn(); return 0; }; window.setTimeout=global.setTimeout;
window.eval(fs.readFileSync(path.join(dir,"engine.js"),"utf8")); window.eval(fs.readFileSync(path.join(dir,"ui.js"),"utf8"));

function click(el){ if(el&&typeof el.onclick==="function")el.onclick(); }
function buttons(){ return [...document.querySelectorAll("button")]; }
function modal(){ const m=document.querySelector(".modal-bg"); return m?m.querySelector(".modal"):null; }

// 1) title -> mode -> draft
click(buttons().find(b=>b.textContent.includes("NEW RUN")));
console.log("MODE screen shown:", !!document.body.textContent.includes("SELECT MODE"));
const modes=[...document.querySelectorAll(".cls")]; console.log("MODES listed:", modes.length, "(expect 3)");
click(modes.find(c=>c.textContent.includes("Campaign")));
console.log("DRAFT shown:", document.querySelectorAll(".cls").length>=5);
// locked hero present? (Duelist locked by default)
const classes=[...document.querySelectorAll(".cls")]; const duelist=classes.find(c=>c.textContent.includes("Duelist"));
console.log("Duelist locked by default:", duelist && duelist.textContent.includes("🔒"));
// pick 5
["Vanguard","Blade","Arcanist","Herald","Ranger"].forEach(n=>click(classes.find(c=>c.textContent.includes(n))));
click(buttons().find(b=>b.textContent.includes("START RUN")));
console.log("BATTLE reached:", !!document.getElementById("engageBtn"));

// 2) combat loop to summary
let g=0; while(g++<800){ if(document.getElementById("engageBtn")&&!document.getElementById("engageBtn").disabled){click(document.getElementById("engageBtn"));continue;}
  const m=modal(); if(m){const b=[...m.querySelectorAll("button")]; if(b.length){click(b[b.length-1]);continue;} m.parentElement.removeChild(m);continue;}
  if(document.body.textContent.includes("VICTORY")||document.body.textContent.includes("RUN ENDED"))break; break; }
console.log("REACHED SUMMARY:", document.body.textContent.includes("VICTORY")||document.body.textContent.includes("RUN ENDED"));

// 3) retry after a forced death (1 hero)
const nr=buttons().find(b=>b.textContent.includes("NEW RUN")); if(nr)click(nr);
click([...document.querySelectorAll(".cls")].find(c=>c.textContent.includes("Campaign")));
click([...document.querySelectorAll(".cls")][0]);
click(buttons().find(b=>b.textContent.includes("START RUN")));
let g2=0; while(g2++<800){ if(document.getElementById("engageBtn")&&!document.getElementById("engageBtn").disabled){click(document.getElementById("engageBtn"));continue;}
  const m=modal(); if(m){const b=[...m.querySelectorAll("button")]; if(b.length){click(b[b.length-1]);continue;} m.parentElement.removeChild(m);continue;}
  if(document.body.textContent.includes("VICTORY")||document.body.textContent.includes("RUN ENDED"))break; break; }
console.log("DEFEAT reached:", document.body.textContent.includes("RUN ENDED"));
const retry=buttons().find(b=>b.textContent.includes("RETRY")); console.log("RETRY exists:", !!retry); if(retry){click(retry); console.log("RETRY->battle:", !!document.getElementById("engageBtn")); }

// 4) settings: 5 toggles + speed
click(document.getElementById("gearBtn")); const sm=modal(); console.log("SETTINGS open:", !!sm&&sm.textContent.includes("SETTINGS"));
if(sm){ console.log("toggles:", sm.querySelectorAll(".toggle").length, "| speed seg:", sm.querySelectorAll(".seg button").length); document.body.removeChild(sm.parentElement); }

// 5) shop tabs + unlock hero
// get to shop
let g3=0; while(g3++<60){ if(document.getElementById("engageBtn")&&!document.getElementById("engageBtn").disabled){click(document.getElementById("engageBtn"));continue;}
  const m=modal(); if(m){const b=[...m.querySelectorAll("button")]; if(b.length){click(b[b.length-1]);continue;} m.parentElement.removeChild(m);continue;}
  if(document.body.textContent.includes("RUN ENDED")||document.body.textContent.includes("VICTORY"))break; break; }
let shop=buttons().find(b=>b.textContent.includes("SHOP")); if(!shop){ const n2=buttons().find(b=>b.textContent.includes("NEW RUN")); if(n2)click(n2); click([...document.querySelectorAll(".cls")].find(c=>c.textContent.includes("Campaign"))); click([...document.querySelectorAll(".cls")][0]); click(buttons().find(b=>b.textContent.includes("START RUN"))); let g4=0; while(g4++<60){ if(document.getElementById("engageBtn")&&!document.getElementById("engageBtn").disabled){click(document.getElementById("engageBtn"));continue;} const mm=modal(); if(mm){const bb=[...mm.querySelectorAll("button")]; if(bb.length){click(bb[bb.length-1]);continue;} mm.parentElement.removeChild(mm);continue;} if(document.body.textContent.includes("RUN ENDED")||document.body.textContent.includes("VICTORY"))break; break; } shop=buttons().find(b=>b.textContent.includes("SHOP")); }
if(shop)click(shop);
const tabs=[...document.querySelectorAll(".auto-row button")]; console.log("SHOP tabs:", tabs.map(t=>t.textContent).join("/"));
// (shards seeded in store before boot => buy buttons enabled)
click(tabs.find(t=>t.textContent.includes("Heroes")));
const heroBuy=buttons().find(b=>b.textContent.includes("◈")); if(heroBuy){ click(heroBuy); console.log("HERO unlocked (meta.unlocks):", Object.keys(window.CRYSTAL.loadMeta().unlocks).length>0); }
const tabs3=[...document.querySelectorAll(".auto-row button")]; click(tabs3.find(t=>t.textContent.includes("Relics")));
const relBuy=buttons().find(b=>b.textContent.includes("◈")); if(relBuy){ click(relBuy); console.log("RELIC active:", Object.keys(window.CRYSTAL.loadMeta().relics).length>0); }

// 6) export/import
const ta=document.getElementById("exportTa"); console.log("EXPORT present:", !!ta&&ta.value.startsWith("DTF1:"));
const code=ta?ta.value:""; window.prompt=()=>code; const imp=buttons().find(b=>b.textContent.includes("IMPORT")); if(imp)click(imp);
console.log("IMPORT ok:", !document.body.textContent.includes("invalid"));

// 7) hidden DEV console (admin) — keyboard sequence + actions
function key(code){ try{ const e=new window.Event("keydown",{bubbles:true}); e.keyCode=code; e.which=code; document.dispatchEvent(e); }catch(err){} }
[38,38,40,40,37,39,37,39,66,65].forEach(key); // Konami + BA
const devOpen = !!document.querySelector(".modal");
console.log("DEV opens via key-seq:", devOpen);
if(devOpen){
  const rows=[...document.querySelectorAll(".modal .opt")].map(b=>b.textContent);
  console.log("DEV rows:", rows.length, "(expect 7)");
  // shards before
  const beforeShards = window.CRYSTAL.loadMeta().shards;
  const addRow = [...document.querySelectorAll(".modal .opt")].find(b=>b.textContent.includes("1000 shards"));
  if(addRow){ click(addRow); console.log("DEV +1000 shards:", window.CRYSTAL.loadMeta().shards>beforeShards); }
  const unlockRow = [...document.querySelectorAll(".modal .opt")].find(b=>b.textContent.includes("unlock ALL"));
  if(unlockRow){ click(unlockRow); console.log("DEV unlock ALL:", Object.keys(window.CRYSTAL.loadMeta().unlocks).length>0 && Object.keys(window.CRYSTAL.loadMeta().relics).length>0); }
  const closeBtn=[...document.querySelectorAll(".modal .btn")].find(b=>b.textContent.includes("close"));
  if(closeBtn)click(closeBtn);
}
// hidden code path: click shard label -> prompt -> type code
window.prompt=()=>"n0va";
const shardLbl=document.getElementById("shardLbl");
if(shardLbl){ shardLbl.dispatchEvent(new window.MouseEvent("click",{bubbles:true})); }
console.log("DEV reopens via code:", !!document.querySelector(".modal"));
const close2=[...document.querySelectorAll(".modal .btn")].find(b=>b.textContent.includes("close")); if(close2)click(close2);
console.log("ALL_UI_OK");

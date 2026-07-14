/* DTF // TEXT AUTOBATTLER — UI controller (browser). v3 "full power".
 * Features: mode select (campaign/endless/boss), unlockable heroes w/ rarity,
 * 24 items across 4 rarities, animated combat + juice, settings (persisted),
 * procedural WebAudio SFX + BGM, status icons, AUTO-BATTLE, retry, achievements,
 * meta shop (Upgrades/Heroes/Relics tabs w/ export/import save code). */
(function () {
  "use strict";
  const C = window.CRYSTAL;
  const $ = (id) => document.getElementById(id);
  const body = $("body");
  const ROBOT = `        .-'''''''-.
       /  _   _  \\
      |  (o) (o)  |
      |     ^     |
      |  \\ ___ /  |
       \\  '---'  /
        \\       /
   ()    \\     /    ()
  (  )____\\   /____(  )
   ||     /___\\     ||
   ||    |     |    ||
  _||____|     |____||_
 /  \\    \\     /    /  \\
|    |    |   |    |    |
'----'    '---'    '----'`;

  const SETTINGS_DEFAULT = { sfx:true, music:true, speed:1, scan:true, particles:true, autoplay:false };
  function loadSettings(){ try{ const r=localStorage.getItem("crystal_settings"); if(r) return Object.assign({},SETTINGS_DEFAULT,JSON.parse(r)); }catch(e){} return {...SETTINGS_DEFAULT}; }
  function saveSettings(){ try{ localStorage.setItem("crystal_settings", JSON.stringify(S.settings)); }catch(e){} }

  const ACH = [
    { id:"first", name:"First Blood", desc:"Win your first run", test:(m)=>m.best.wave>=1 && m.wins>0 },
    { id:"wave6", name:"Ascendant", desc:"Reach wave 6", test:(m)=>m.best.wave>=6 },
    { id:"win",  name:"DTF ETERNAL", desc:"Clear all 12 waves", test:(m)=>m.best.wave>=12 },
    { id:"combo20", name:"Combo Lord", desc:"Land a 20-hit combo", test:(m)=>m.bestCombo>=20 },
    { id:"shop", name:"Arms Dealer", desc:"Buy 5 shop upgrades", test:(m)=>m.totalBought>=5 },
    { id:"rich", name:"Crystal Baron", desc:"Bank 100 shards", test:(m)=>m.shards>=100 },
    { id:"hero", name:"Recruiter", desc:"Unlock a hero", test:(m)=>Object.keys(m.unlocks||{}).length>0 },
    { id:"legend", name:"Legendary", desc:"Get a Legendary item", test:(m)=>m.foundLegendary },
  ];
  function loadMeta(){ const m=C.loadMeta(); if(!m.best)m.best={wave:0}; if(m.wins==null)m.wins=0; if(m.totalBought==null)m.totalBought=0; if(m.bestCombo==null)m.bestCombo=0; if(!m.ach)m.ach={}; if(!m.unlocks)m.unlocks={}; if(!m.relics)m.relics={}; if(!m.ranks)m.ranks={}; return m; }
  function saveMeta(){ C.saveMeta(S.meta); refreshShards(); }

  const S = {
    screen:"title", mode:"campaign", meta:loadMeta(), settings:loadSettings(),
    team:[], enemies:[], wave:0, picks:[],
    runHeroes:null, runPicks:null, runMode:"campaign",
    cards:{}, animating:false, busy:false, endResult:null,
    combo:0, comboTimer:null, autoplay:false, speedMul:1, musicOn:false, musicTimer:null,
  };

  function applySettings(){ document.body.classList.toggle("no-scan", !S.settings.scan); S.speedMul=S.settings.speed; S.autoplay=S.settings.autoplay; if(S.settings.music) startMusic(); else stopMusic(); }

  // ---------- audio ----------
  let actx=null;
  function audio(){ if(!actx){ try{ actx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ actx=null; } } return actx; }
  function beep(freq,dur,type,vol){ if(!S.settings.sfx)return; const ac=audio(); if(!ac)return; try{ const o=ac.createOscillator(),g=ac.createGain(); o.type=type||"square"; o.frequency.value=freq; g.gain.value=(vol||0.06); o.connect(g); g.connect(ac.destination); const t=ac.currentTime; o.start(t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur); o.stop(t+dur+0.02); }catch(e){} }
  const SFX={ hit:()=>beep(220+Math.random()*60,0.06,"square",0.05), crit:()=>{beep(660,0.08,"sawtooth",0.08);beep(330,0.12,"square",0.06);},
    win:()=>{[523,659,784,1046].forEach((f,i)=>setTimeout(()=>beep(f,0.12,"triangle",0.07),i*70));}, lose:()=>{[392,330,262,196].forEach((f,i)=>setTimeout(()=>beep(f,0.16,"sawtooth",0.07),i*90));},
    click:()=>beep(440,0.04,"square",0.04), loot:(r)=>{ const base=r==="Legendary"?1046:r==="Epic"?784:r==="Rare"?659:523; beep(base,0.08,"triangle",0.07); setTimeout(()=>beep(base*1.5,0.1,"triangle",0.06),70); },
    level:()=>{[523,784].forEach((f,i)=>setTimeout(()=>beep(f,0.1,"triangle",0.06),i*60));}, rare:()=>{[880,1175,1568].forEach((f,i)=>setTimeout(()=>beep(f,0.1,"sine",0.06),i*60));} };
  // procedural BGM — looping arpeggio (self-schedules; guarded against re-entrancy)
  function startMusic(){
    if (S.musicOn || !S.settings.music) return;
    S.musicOn = true;
    const scale = [196,233,262,294,349,392]; let step = 0; let scheduled = false;
    const tick = () => {
      if (!S.musicOn || !S.settings.music) return;
      if (scheduled) return;            // never double-schedule under sync timers
      scheduled = true;
      const f = scale[step % scale.length] * ((step % 12 < 6) ? 1 : 0.5);
      beep(f, 0.18, "sine", 0.025);
      if (step % 4 === 0) beep(f/2, 0.3, "triangle", 0.02);
      step++;
      S.musicTimer = setTimeout(() => { scheduled = false; tick(); }, 260);
    };
    tick();
  }
  function stopMusic(){ S.musicOn=false; if(S.musicTimer)clearTimeout(S.musicTimer); }

  // ---------- helpers ----------
  function refreshShards(){ $("shardLbl").textContent="◈ "+S.meta.shards; }
  function setWS(n){ document.querySelectorAll(".ws").forEach(w=>w.classList.toggle("on",+w.dataset.ws===n)); }
  function toast(msg){ const t=$("toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove("show"),1600); }
  function el(tag,cls,html){ const e=document.createElement(tag); if(cls)e.className=cls; if(html!=null)e.innerHTML=html; return e; }
  function rarColor(r){ return (C.RARITY[r]&&C.RARITY[r].css)||"var(--dim)"; }
  function itemsLine(u){ if(!u._items.length)return ""; const n=u._items.map(i=>i.name); if(n.length<=3)return "  ◈"+n.join(" ◈"); return "◈"+n.slice(0,3).join(" ◈")+`  …(+${n.length-3})`; }
  function cardEl(u,accent){ const wrap=el("div","card"+(u.side==="enemy"?" enemy":"")); wrap.style.borderLeftColor=accent;
    const top=el("div","top"); const nm=el("span","nm",u.kind+(u.spec?" · "+u.spec:"")+(u.elite?" ("+u.elite+")":"")); nm.style.color=accent;
    const sub=el("span","sub","Lv"+u.level); top.appendChild(nm); top.appendChild(sub);
    const badges=el("div","badges"); const stat=el("div","stat",`ATK ${u.atk.toFixed(0)} DEF ${u.defense.toFixed(0)} SPD ${u.spd.toFixed(0)} [${u.ability}]${itemsLine(u)?"<br>"+itemsLine(u):""}`);
    const hpwrap=el("div","hpwrap"); const hpbar=el("div","hpbar"); hpwrap.appendChild(hpbar);
    const hptxt=el("div","hptxt",`${Math.floor(u.hp)}/${Math.floor(u.hp_max)}`);
    wrap.appendChild(top); wrap.appendChild(badges); wrap.appendChild(stat); wrap.appendChild(hpwrap); wrap.appendChild(hptxt);
    wrap._hp=hpbar; wrap._txt=hptxt; wrap._badges=badges; wrap._u=u; wrap._accent=accent; return wrap; }
  function setCardHP(wrap,hp){ const u=wrap._u; const frac=Math.max(0,Math.min(1,hp/u.hp_max)); wrap._hp.style.width=(frac*100)+"%"; wrap._hp.style.background=frac>.5?"var(--green)":(frac>.25?"var(--amber)":"var(--red)"); wrap._txt.textContent=`${Math.floor(hp)}/${Math.floor(u.hp_max)}`; }
  function updateBadges(wrap){ const u=wrap._u; wrap._badges.innerHTML=""; if(u.burn>0)wrap._badges.appendChild(el("span","badge b-burn","🔥")); if(u.slow_turns>0)wrap._badges.appendChild(el("span","badge b-slow","❄")); if(u.buff_atk_turns>0)wrap._badges.appendChild(el("span","badge b-buff","▲")); if(u.taunting)wrap._badges.appendChild(el("span","badge b-taunt","⛨")); const wasDead=wrap.classList.contains("dead"); wrap.classList.toggle("dead",!u.alive()); if(!u.alive()&&!wasDead){ wrap.classList.add("collapse"); setTimeout(()=>wrap.classList.remove("collapse"),440); } }

  // ---------- render ----------
  function render(){ body.innerHTML=""; applySettings();
    if(S.screen==="title")renderTitle(); else if(S.screen==="mode")renderMode(); else if(S.screen==="draft")renderDraft();
    else if(S.screen==="battle")renderBattle(); else if(S.screen==="shop")renderShop(); else if(S.screen==="summary")renderSummary(); }

  function renderTitle(){
    setWS(1); const robot=el("pre","robot",ROBOT); const col=el("div");
    col.appendChild(el("h1",null,"DTF")); col.appendChild(el("h2",null,"// TEXT AUTOBATTLER"));
    col.appendChild(el("div","muted","a roguelite warband crawler · made by Aj"));
    col.appendChild(el("div","muted",`banked shards: ◈ ${S.meta.shards}`));
    col.appendChild(el("div","best",`best: wave ${S.meta.best.wave} · wins ${S.meta.wins} · top combo ${S.meta.bestCombo}`));
    const b1=el("button","btn primary","▶ NEW RUN"), b2=el("button","btn cyan","🛒 SHOP"), b3=el("button","btn ghost","? HOW TO PLAY");
    b1.onclick=()=>{SFX.click();S.screen="mode";render();}; b2.onclick=()=>{SFX.click();S.screen="shop";render();}; b3.onclick=showHelp;
    [b1,b2,b3].forEach(b=>{b.style.margin="6px 0";b.style.display="block";col.appendChild(b);});
    const row=el("div","row"); row.appendChild(robot); row.appendChild(col); body.appendChild(row);
  }
  function showHelp(){ openModal("HOW TO PLAY",(m)=>{ m.appendChild(el("div",null,"1. Pick a MODE (Campaign/Endless/Boss Rush).<br>2. Draft up to 5 heroes (unlock more in SHOP).<br>3. ENGAGE — combat animates in the log.<br>4. Loot has RARITY (Common→Legendary); CONFIRM or AUTO.<br>5. Lv3 transform, Lv6 ascend. SHOP: upgrades, heroes, relics.<br>6. ⚙ Settings: SFX, music, speed, AUTO-BATTLE. Died? RETRY.")); const c=el("button","btn primary","close"); c.onclick=closeModal; m.appendChild(c); }); }

  function renderMode(){
    setWS(1); body.appendChild(el("h1",null,"SELECT MODE"));
    const grid=el("div","draft-grid");
    Object.entries(C.MODES).forEach(([id,mode])=>{ const c=el("div","cls"); c.appendChild(el("div","cn",mode.name)); c.appendChild(el("div","cd",mode.desc)); c.onclick=()=>{SFX.click();S.mode=id;S.screen="draft";render();}; grid.appendChild(c); });
    body.appendChild(grid); const back=el("button","btn ghost","◀ BACK"); back.onclick=()=>{SFX.click();S.screen="title";render();}; body.appendChild(back);
  }

  function renderDraft(){
    setWS(1); body.appendChild(el("h1",null,"DRAFT YOUR WARBAND")); body.appendChild(el("div","muted",`Mode: ${C.MODES[S.mode].name} · pick up to 5 heroes`));
    const grid=el("div","draft-grid"); const vars={}; const status=el("div","muted","Selected: 0/5"); status.style.margin="8px 0";
    const start=el("button","btn primary","▶ START RUN"); start.disabled=true; start.style.fontSize="18px";
    function updateStatus(){ const n=Object.values(vars).filter(Boolean).length; status.textContent=`Selected: ${n}/5`; start.disabled=!(n>=1&&n<=5); }
    const unlocked=C.unlockedHeroes(S.meta);
    Object.keys(C.CLASSES).forEach(cls=>{ const st=C.CLASSES[cls]; const locked=st.locked && !S.meta.unlocks[st.unlock];
      const c=el("div","cls"); if(locked)c.style.opacity=".5"; c.appendChild(el("div","cn",cls+(locked?" 🔒":"")));
      c.appendChild(el("div","cd",`HP ${st.hp} ATK ${st.atk} DEF ${st.def} SPD ${st.spd}<br>[${st.ability}]${locked?"<br><span class='muted'>unlock in SHOP</span>":""}`));
      if(locked){ c.onclick=()=>toast("locked — buy in SHOP"); return; }
      vars[cls]=false; c.onclick=()=>{ const sel=Object.values(vars).filter(Boolean).length; if(!vars[cls]&&sel>=5){toast("max 5 heroes");return;} vars[cls]=!vars[cls]; c.classList.toggle("sel",vars[cls]); updateStatus(); SFX.click(); }; grid.appendChild(c);
    });
    body.appendChild(grid); body.appendChild(status);
    start.onclick=()=>{ S.picks=Object.keys(vars).filter(k=>vars[k]); if(!S.picks.length)return; SFX.click(); startRun(S.picks); };
    body.appendChild(start); const back=el("button","btn ghost","◀ MODE"); back.onclick=()=>{SFX.click();S.screen="mode";render();}; body.appendChild(back);
  }
  function startRun(picks){ S.runPicks=picks.slice(); S.runMode=S.mode; S.team=C.draftTeam(picks); C.applyMeta(S.team,S.meta);
    if(C.relicOn(S.meta,"relic_start"))S.wave=2; else S.wave=1; S.screen="battle"; render(); beginWave(); }
  function retryRun(){ if(!S.runPicks)return; SFX.click(); S.team=C.draftTeam(S.runPicks); C.applyMeta(S.team,S.meta); if(C.relicOn(S.meta,"relic_start"))S.wave=2; else S.wave=1; S.screen="battle"; render(); beginWave(); toast("retry — same warband"); }

  function renderBattle(){
    setWS(2); const row=el("div","row");
    const hp=el("div","panel scroller"); hp.id="heroPanel"; hp.appendChild(el("h3",null,"YOUR WARBAND"));
    const ep=el("div","panel scroller"); ep.id="enemyPanel"; ep.appendChild(el("h3",null,"HOSTILES"));
    row.appendChild(hp); row.appendChild(ep); body.appendChild(row);
    S.cards={}; S.team.forEach(h=>{ const c=cardEl(h,h.spec?"var(--magenta)":"var(--green)"); hp.appendChild(c); S.cards[h.name]=c; setCardHP(c,h.hp); updateBadges(c); });
    S.enemies.forEach(e=>{ const c=cardEl(e,"var(--red)"); ep.appendChild(c); S.cards[e.name]=c; setCardHP(c,e.hp); updateBadges(c); });
    const log=el("div","log"); log.id="log"; body.appendChild(log);
    const ctl=el("div","controls"); const engage=el("button","btn primary","⚔ ENGAGE WAVE"); engage.id="engageBtn"; engage.onclick=engageWave;
    const wt=el("div",null,"WAVE "+S.wave+(S.mode==="endless"?"+":" / "+C.MAX_WAVE)); wt.style.fontSize="20px"; wt.style.color="var(--amber)"; wt.style.fontWeight="bold"; wt.style.marginTop="6px"; wt.id="waveTitle";
    const banner=el("div","banner"); banner.id="banner"; const auto=el("div","auto-row");
    const autoBtn=el("button","btn ghost",S.autoplay?"⏸ AUTO: ON":"▶ AUTO-BATTLE"); autoBtn.id="autoBtn";
    autoBtn.onclick=()=>{ S.settings.autoplay=!S.settings.autoplay; S.autoplay=S.settings.autoplay; saveSettings(); autoBtn.textContent=S.autoplay?"⏸ AUTO: ON":"▶ AUTO-BATTLE"; if(S.autoplay)maybeAuto(); toast(S.autoplay?"auto-battle ON":"auto-battle OFF"); };
    auto.appendChild(autoBtn); ctl.appendChild(wt); ctl.appendChild(engage); ctl.appendChild(auto); ctl.appendChild(banner); body.appendChild(ctl);
  }
  function logLine(text,tag){ const log=$("log"); if(!log)return; const d=el("div",tag||"sys",text); log.appendChild(d); log.scrollTop=log.scrollHeight; }
  function beginWave(){
    $("waveTitle").textContent="WAVE "+S.wave+(S.mode==="endless"?"+":" / "+C.MAX_WAVE); $("banner").textContent="";
    S.enemies=C.spawnWave(S.wave,S.mode); const ep=$("enemyPanel"); ep.innerHTML="<h3>HOSTILES</h3>"; const hp=$("heroPanel"); hp.innerHTML="<h3>YOUR WARBAND</h3>"; S.cards={};
    S.team.forEach(h=>{ const c=cardEl(h,h.spec?"var(--magenta)":"var(--green)"); hp.appendChild(c); S.cards[h.name]=c; setCardHP(c,h.hp); updateBadges(c); });
    S.enemies.forEach(e=>{ const c=cardEl(e,"var(--red)"); ep.appendChild(c); S.cards[e.name]=c; setCardHP(c,e.hp); updateBadges(c); });
    $("engageBtn").disabled=false; logLine(`=== WAVE ${S.wave} / ${S.mode==="endless"?"∞":C.MAX_WAVE} ===`,"sys");
    logLine(`${S.enemies.length} hostiles emerge from the crystal dark.`,"bad"); waveBanner("WAVE "+S.wave); if(S.autoplay)maybeAuto();
  }
  function maybeAuto(){ if(!S.autoplay||S.animating||S.busy)return; if($("engageBtn")&&!$("engageBtn").disabled)setTimeout(()=>{ if(S.autoplay&&!$("engageBtn").disabled)engageWave(); },400); }

  // ---------- combat ----------
  function engageWave(){ if(S.animating||S.busy)return; S.animating=true; S.busy=true; $("engageBtn").disabled=true; $("banner").textContent="resolving…"; if($("autoBtn"))$("autoBtn").disabled=true; C.log.length=0; const [won,rounds]=C.resolveWave(S.team,S.enemies); logLine(`-- resolution (${rounds} rounds) --`,"sys"); animateLog(C.log.slice(),won,0); }
  function bumpCombo(){ S.combo++; const lbl=$("comboLbl"); lbl.textContent="COMBO x"+S.combo; clearTimeout(S.comboTimer); S.comboTimer=setTimeout(()=>{S.combo=0;lbl.textContent="";},2500); if(S.combo>S.meta.bestCombo){S.meta.bestCombo=S.combo;saveMeta();} if(S.combo>=20)checkAchievements(); }
  function animateLog(lines,won,idx){
    try{
      if(idx>=lines.length){ setTimeout(()=>finishWave(won),200/Math.max(0.5,S.speedMul)); return; }
      const line=lines[idx]; let tag="sys"; if(line.includes("CRIT"))tag="crit"; else if(line.includes("->"))tag="bad"; logLine(line,tag);
      const m=line.match(/->\s*([^-]+?)\s*\(-(\d+)\)/);
      if(m){
        const c=S.cards[m[1].trim()];
        if(c){ const u=c._u; setCardHP(c,Math.max(0,u.hp)); flashCard(c,tag==="crit"?"var(--amber)":"var(--red)"); floatDmg(c,"-"+m[2],tag==="crit"); if(tag==="crit"){critFlash();SFX.crit();}else SFX.hit(); bumpCombo(); }
        // attacker reacts: heroes lunge toward the enemy side (right) + glow on their act; enemies lunge left
        const arrow=line.indexOf("->");
        const atkName=line.slice(0,arrow).replace(/^✦\s*CRIT\s*/,"").trim();
        const ac=S.cards[atkName];
        if(ac){ if(ac._u.side==="hero"){ lungeCard(ac,"R"); glowCard(ac); } else { lungeCard(ac,"L"); } }
      }
      else if(line.includes("mends")){
        const hm=line.match(/mends\s+(.+?)\s*\(\+(\d+)\)/);
        if(hm){ const hc=S.cards[hm[1].trim()]; if(hc){ setCardHP(hc,hc._u.hp); healFloat(hc,"+"+hm[2]); } }
        const actor=line.trim().split(/\s+/)[0].replace(/[✦]/g,""); const ac=S.cards[actor]; if(ac&&ac._u.side==="hero")glowCard(ac);
        SFX.level();
      }
      else if(line.includes("CLEARED")||line.includes("wiped")||line.includes("rall"))SFX.level();
      else {
        // other hero ability lines (rampage / taunt / shield) — flash the actor
        const actor=line.trim().replace(/^✦\s*CRIT\s*/,"").split(/\s+/)[0].replace(/[✦]/g,"");
        const ac=S.cards[actor]; if(ac&&ac._u.side==="hero")glowCard(ac);
      }
    }catch(e){}
    setTimeout(()=>animateLog(lines,won,idx+1),Math.max(20,80/S.speedMul));
  }
  function flashCard(wrap,color){ wrap.style.borderLeftColor=color; wrap.classList.add("shake"); setTimeout(()=>{ wrap.classList.remove("shake"); wrap.style.borderLeftColor=wrap._accent; },150); }
  function floatDmg(wrap,text,crit){ if(!S.settings.particles)return; const f=el("div","floater",text); f.style.color=crit?"var(--amber)":"var(--bright)"; wrap.appendChild(f); setTimeout(()=>f.remove(),700); }
  function healFloat(wrap,text){ if(!S.settings.particles)return; const f=el("div","floater",text); f.style.color="var(--green)"; wrap.appendChild(f); setTimeout(()=>f.remove(),700); }
  function glowCard(wrap){ if(!S.settings.particles)return; const c=wrap._accent||"var(--green)"; wrap.style.transition="box-shadow .15s"; wrap.style.boxShadow=`0 0 14px ${c}`; setTimeout(()=>{ if(wrap._accent)wrap.style.boxShadow=""; },260); }
  function lungeCard(wrap,dir){ if(!S.settings.particles)return; wrap.classList.remove("lungeR","lungeL"); void wrap.offsetWidth; wrap.classList.add(dir==="R"?"lungeR":"lungeL"); setTimeout(()=>wrap.classList.remove("lungeR","lungeL"),240); }
  function pulseCard(wrap){ if(!S.settings.particles)return; wrap.classList.add("lvlup"); setTimeout(()=>wrap.classList.remove("lvlup"),520); }
  function critFlash(){ const cf=$("critflash"); cf.classList.remove("go"); void cf.offsetWidth; cf.classList.add("go"); }
  function waveBanner(txt){ const b=el("div","wavebanner"); const s=el("span",null,txt); b.appendChild(s); body.appendChild(b); setTimeout(()=>b.remove(),1100); }
  function finishWave(won){ Object.values(S.cards).forEach(c=>{ setCardHP(c,c._u.hp); updateBadges(c); });
    if(won){ $("banner").textContent=`✔ WAVE ${S.wave} CLEARED`; logLine(`✔ WAVE ${S.wave} CLEARED`,"good"); afterWaveWin(); }
    else { $("banner").textContent=`✖ WIPED on wave ${S.wave}`; logLine(`✖ WIPED on wave ${S.wave}.`,"bad"); SFX.lose(); setTimeout(showDefeat,600); }
    S.animating=false; S.busy=false; if($("autoBtn"))$("autoBtn").disabled=false;
    if(S.autoplay&&!S.endResult)setTimeout(()=>{ if(S.autoplay&&S.screen==="battle"&&!$("engageBtn").disabled)engageWave(); },500/Math.max(0.5,S.speedMul));
  }
  function afterWaveWin(){ C.levelUpAll(S.team); SFX.level(); S.team.forEach(h=>{ if(h.alive()){ h.hp=Math.min(h.hp_max,h.hp+Math.floor(h.hp_max*(C.relicOn(S.meta,"relic_camp")?0.5:0.35))); const c=S.cards[h.name]; if(c)pulseCard(c); } });
    Object.values(S.cards).forEach(c=>setCardHP(c,c._u.hp)); openLoot(); }

  function openLoot(){
    const extra=C.relicOn(S.meta,"relic_loot")?1:0; const drops=C.rollLoot(S.wave,S.wave<3?1:2+extra); if(!drops.length){ openSpec(); return; }
    openModal("LOOT ACQUIRED",(m)=>{ const alive=S.team.filter(h=>h.alive()); const choices={};
      drops.forEach(item=>{ const r=el("div","shop-row"); const rar=el("span","pill"); rar.textContent=item.rarity; rar.style.borderColor=rarColor(item.rarity); rar.style.color=rarColor(item.rarity); r.appendChild(rar);
        r.appendChild(el("div","sn","◈ "+item.name)); r.appendChild(el("div","sd",item.desc+" — "+item.flavor));
        const sel=document.createElement("select"); alive.forEach(h=>{const o=document.createElement("option");o.value=h.kind;o.textContent=h.kind;sel.appendChild(o);}); r.appendChild(sel);
        m.appendChild(r); choices[item.name]=item; choices[item.name+"_sel"]=sel; });
      const bf=el("div","pick-hero"); const confirm=el("button","btn primary","✔ CONFIRM"); const auto=el("button","btn cyan","⚡ AUTO");
      confirm.onclick=()=>{ drops.forEach(item=>{ const h=S.team.find(x=>x.kind===choices[item.name+"_sel"].value)||alive[0]; h.equip(item); }); logLine("Loot equipped.","loot"); SFX.loot(drops[0].rarity); if(drops.some(d=>d.rarity==="Legendary"))S.meta.foundLegendary=true; closeModal(); refreshCards(); openSpec(); };
      auto.onclick=()=>{ drops.forEach((item,i)=>{ const h=C.bestLootTarget(S.team,item,i); h.equip(item); }); logLine("Loot auto-equipped.","loot"); SFX.loot(drops[0].rarity); if(drops.some(d=>d.rarity==="Legendary"))S.meta.foundLegendary=true; closeModal(); refreshCards(); openSpec(); };
      bf.appendChild(confirm); bf.appendChild(auto); m.appendChild(bf);
    });
  }
  function refreshCards(){ Object.values(S.cards).forEach(c=>{ const u=c._u; const stat=c.querySelector(".stat"); stat.innerHTML=`ATK ${u.atk.toFixed(0)} DEF ${u.defense.toFixed(0)} SPD ${u.spd.toFixed(0)} [${u.ability}]${itemsLine(u)?"<br>"+itemsLine(u):""}`; setCardHP(c,u.hp); updateBadges(c); }); }
  function openSpec(){ const pending=S.team.filter(h=>h.alive()&&h.level>=3&&!h.spec); if(!pending.length){openElite();return;} const h=pending[0]; const opts=Object.entries(C.SPEC[h.kind]);
    openModal(`${h.kind} reached Lv3 — CHOOSE TRANSFORMATION`,(m)=>{ opts.forEach(([spec,d])=>{ const b=d.bonus; const desc=Object.entries(b).map(([k,v])=>`+${Math.round(v*100)}% ${k}`).join(" "); const btn=el("button","btn opt",`<span class="oa">${spec}</span><br>${desc}<br>→ ${d.ability}`); btn.onclick=()=>{ h.applySpec(spec); logLine(`${h.kind} transforms into ${spec}!`,"good"); SFX.level(); closeModal(); refreshCards(); openSpec(); }; m.appendChild(btn); }); }); }
  function openElite(){ const pending=S.team.filter(h=>h.alive()&&h.level>=6&&!h.elite); if(!pending.length){advanceWave();return;} const h=pending[0]; const opts=Object.entries(C.ELITE);
    openModal(`${h.kind} (${h.spec}) reached Lv6 — ASCEND`,(m)=>{ opts.forEach(([elite,d])=>{ const b=d.bonus; const desc=Object.entries(b).map(([k,v])=>`+${Math.round(v*100)}% ${k}`).join(" "); const btn=el("button","btn opt",`<span class="oa">${d.label}</span><br>${desc}`); btn.onclick=()=>{ h.applyElite(elite); logLine(`${h.kind} (${h.spec}) ascends as ${d.label}!`,"good"); SFX.level(); closeModal(); refreshCards(); openElite(); }; m.appendChild(btn); }); }); }
  function advanceWave(){ S.wave++; if(S.mode!=="endless"&&S.wave>C.MAX_WAVE){showVictory();return;} if(S.wave>S.meta.best.wave){S.meta.best.wave=S.wave;saveMeta();} render(); beginWave(); }

  // ---------- shop (tabs) ----------
  function renderShop(){ setWS(4); body.appendChild(el("h1",null,"DTF SHOP")); body.appendChild(el("div",null,"Your shards: ◈ "+S.meta.shards)).style.color="var(--amber)";
    body.appendChild(el("div","best",`best: wave ${S.meta.best.wave} · wins ${S.meta.wins} · top combo ${S.meta.bestCombo} · upgrades ${S.meta.totalBought} · heroes ${Object.keys(S.meta.unlocks).length}`));
    const tabs=el("div","auto-row"); tabs.style.margin="8px 0"; const tabBtns={}; ["Upgrades","Heroes","Relics"].forEach((t,i)=>{ const b=el("button","btn",t); b.onclick=()=>{SFX.click();Object.values(tabBtns).forEach(x=>x.classList.remove("on"));b.classList.add("on");showTab(t);}; if(i===0)b.classList.add("on"); tabBtns[t]=b; tabs.appendChild(b); });
    body.appendChild(tabs); const box=el("div"); box.id="shopBox"; body.appendChild(box); showTab("Upgrades");
    const back=el("button","btn ghost","◀ BACK"); back.onclick=()=>{SFX.click();S.screen="title";render();}; body.appendChild(back);
    const ex=el("div","panel"); ex.style.marginTop="12px"; ex.appendChild(el("h3",null,"CROSS-DEVICE BACKUP")); ex.appendChild(el("div","muted","Copy this code to move your save to another device (your phone):"));
    const ta=document.createElement("textarea"); ta.id="exportTa"; ta.readOnly=true; ta.value=exportCode(); ex.appendChild(ta);
    const row=el("div","pick-hero"); const copy=el("button","btn primary","COPY"); copy.onclick=()=>{ ta.select(); try{document.execCommand("copy");}catch(e){} if(navigator.clipboard)navigator.clipboard.writeText(ta.value).catch(()=>{}); toast("code copied"); };
    const imp=el("button","btn cyan","IMPORT CODE"); imp.onclick=()=>{ const code=prompt("Paste your DTF save code:"); if(code&&importCode(code)){toast("save imported");renderShop();} else if(code)toast("invalid code"); };
    row.appendChild(copy); row.appendChild(imp); ex.appendChild(row); body.appendChild(ex);
    function showTab(t){ const box=$("shopBox"); box.innerHTML=""; if(t==="Upgrades")buildUpgrades(box); else if(t==="Heroes")buildHeroes(box); else buildRelics(box); }
  }
  function buildUpgrades(box){ C.SHOP_UPGRADES.forEach(up=>{ const rank=S.meta.ranks[up.id]||0; const maxed=rank>=up.max; const cost=C.upgradeCost(up,rank); const r=el("div","shop-row"); r.appendChild(el("div","sn",up.name)); r.appendChild(el("div","sd",up.desc)); r.appendChild(el("div","rk",`r${rank}/${up.max}`)); if(maxed)r.appendChild(el("span","pill","MAX")); else { const b=el("button","btn primary","◈ "+cost); if(S.meta.shards<cost)b.disabled=true; b.onclick=()=>{ if(S.meta.shards<cost)return; S.meta.shards-=cost; S.meta.ranks[up.id]=rank+1; S.meta.totalBought++; saveMeta(); if(up.id==="forge"){} buildUpgrades($("shopBox")); SFX.loot(); checkAchievements(); }; r.appendChild(b); } box.appendChild(r); }); refreshShardLine(); }
  function buildHeroes(box){ C.SHOP_HEROES.forEach(h=>{ const owned=!!S.meta.unlocks[h.id]; const r=el("div","shop-row"); r.appendChild(el("div","sn",h.name)); r.appendChild(el("div","sd",h.desc)); if(owned)r.appendChild(el("span","pill","OWNED")); else { const b=el("button","btn primary","◈ "+h.cost); if(S.meta.shards<h.cost)b.disabled=true; b.onclick=()=>{ if(S.meta.shards<h.cost)return; S.meta.shards-=h.cost; S.meta.unlocks[h.id]=true; saveMeta(); buildHeroes($("shopBox")); SFX.rare(); checkAchievements(); toast(h.name+" unlocked!"); }; r.appendChild(b); } box.appendChild(r); }); refreshShardLine(); }
  function buildRelics(box){ C.SHOP_RELICS.forEach(rel=>{ const owned=!!S.meta.relics[rel.id]; const r=el("div","shop-row"); r.appendChild(el("div","sn",rel.name)); r.appendChild(el("div","sd",rel.desc)); if(owned)r.appendChild(el("span","pill","ACTIVE")); else { const b=el("button","btn primary","◈ "+rel.cost); if(S.meta.shards<rel.cost)b.disabled=true; b.onclick=()=>{ if(S.meta.shards<rel.cost)return; S.meta.shards-=rel.cost; S.meta.relics[rel.id]=true; saveMeta(); buildRelics($("shopBox")); SFX.rare(); toast(rel.name+" active!"); }; r.appendChild(b); } box.appendChild(r); }); refreshShardLine(); }
  function refreshShardLine(){ const lbl=body.querySelector("div[style]"); if(lbl)lbl.textContent="Your shards: ◈ "+S.meta.shards; }

  // ---------- summary / retry ----------
  function shardReward(){ let base=S.wave*2; if(S.mode==="endless")base=Math.floor(base*1.5); if(C.relicOn(S.meta,"relic_gold"))base=Math.floor(base*1.5); if(S.endResult==="victory")base=30; return base; }
  function award(shards){ S.meta.shards+=shards; saveMeta(); }
  function showDefeat(){ award(shardReward()); S.endResult="defeat"; if(S.wave>S.meta.best.wave){S.meta.best.wave=S.wave;saveMeta();} saveMeta(); SFX.lose(); renderSummary(); }
  function showVictory(){ award(30); S.endResult="victory"; S.meta.wins=(S.meta.wins||0)+1; if(12>S.meta.best.wave)S.meta.best.wave=12; saveMeta(); SFX.win(); renderSummary(); }
  function renderSummary(){ setWS(5); const win=S.endResult==="victory"; body.appendChild(el("h1",null,win?"VICTORY":"RUN ENDED")); body.lastChild.style.color=win?"var(--green)":"var(--red)";
    const earned=shardReward(); const modeName=C.MODES[S.runMode].name;
    body.appendChild(el("div","muted",win?`You cleared the ${modeName} run!\nShards earned: ◈ ${earned}\nBanked: ◈ ${S.meta.shards}\n\n✦ DTF ETERNAL ✦`:`Your warband fell on wave ${S.wave} of the ${modeName} run.\nShards earned: ◈ ${earned}\nBanked: ◈ ${S.meta.shards}`)); body.lastChild.style.whiteSpace="pre-line";
    body.appendChild(el("div","best",`best: wave ${S.meta.best.wave} · wins ${S.meta.wins} · top combo ${S.meta.bestCombo}`));
    const row=el("div","pick-hero"); const retry=el("button","btn magenta","↻ RETRY SAME WARBAND"); retry.onclick=retryRun; const nr=el("button","btn primary","✦ NEW RUN"); nr.onclick=()=>{SFX.click();S.screen="mode";render();}; const sh=el("button","btn cyan","🛒 SHOP"); sh.onclick=()=>{SFX.click();S.screen="shop";render();};
    row.appendChild(retry); row.appendChild(nr); row.appendChild(sh); body.appendChild(row); checkAchievements(); if(S.autoplay){ S.settings.autoplay=false; S.autoplay=false; saveSettings(); }
  }

  // ---------- achievements ----------
  function checkAchievements(){ ACH.forEach(a=>{ if(!S.meta.ach[a.id]&&a.test(S.meta)){ S.meta.ach[a.id]=true; saveMeta(); showAchv(a); } }); }
  function showAchv(a){ const elx=$("achv"); elx.innerHTML="★ ACHIEVEMENT<br><b>"+a.name+"</b><br><span class='muted'>"+a.desc+"</span>"; elx.classList.add("show"); clearTimeout(showAchv._t); showAchv._t=setTimeout(()=>elx.classList.remove("show"),3200); }

  // ---------- settings ----------
  function openSettings(){ openModal("⚙ SETTINGS",(m)=>{ m.appendChild(settingRow("Sound FX","procedural retro beeps",S.settings.sfx,()=>{S.settings.sfx=!S.settings.sfx;saveSettings();if(S.settings.sfx)SFX.click();return S.settings.sfx;}));
    m.appendChild(settingRow("Music","procedural background track",S.settings.music,()=>{S.settings.music=!S.settings.music;applySettings();saveSettings();if(S.settings.music)startMusic();return S.settings.music;}));
    m.appendChild(settingRow("Scanlines","CRT overlay",S.settings.scan,()=>{S.settings.scan=!S.settings.scan;applySettings();saveSettings();return S.settings.scan;}));
    m.appendChild(settingRow("Hit particles","floating dmg + shake",S.settings.particles,()=>{S.settings.particles=!S.settings.particles;saveSettings();return S.settings.particles;}));
    m.appendChild(settingRow("Auto-battle","auto-engage every wave",S.settings.autoplay,()=>{S.settings.autoplay=!S.settings.autoplay;S.autoplay=S.settings.autoplay;saveSettings();if(S.autoplay)maybeAuto();return S.settings.autoplay;}));
    const sr=el("div","setting-row"); const left=el("div"); left.appendChild(el("div","lbl","Animation speed")); left.appendChild(el("div","desc","0.5× / 1× / 2×")); sr.appendChild(left); const seg=el("div","seg"); [["0.5",0.5],["1",1],["2",2]].forEach(([lab,val])=>{ const b=el("button",S.settings.speed===val?"on":"",lab+"×"); b.onclick=()=>{S.settings.speed=val;saveSettings();seg.querySelectorAll("button").forEach(x=>x.classList.remove("on"));b.classList.add("on");}; seg.appendChild(b); }); sr.appendChild(seg); m.appendChild(sr);
    const close=el("button","btn primary","done"); close.onclick=closeModal; m.appendChild(close); }); }
  function settingRow(lbl,desc,on,onToggle){ const r=el("div","setting-row"); const left=el("div"); left.appendChild(el("div","lbl",lbl)); left.appendChild(el("div","desc",desc)); r.appendChild(left); const tg=el("div","toggle"+(on?" on":"")); tg.appendChild(el("div","knob")); tg.onclick=()=>{ const v=onToggle(); tg.classList.toggle("on",v); }; r.appendChild(tg); return r; }

  // ---------- export/import ----------
  function exportCode(){ try{ return "DTF1:"+btoa(unescape(encodeURIComponent(JSON.stringify(S.meta)))); }catch(e){return ""; } }
  function importCode(code){ code=(code||"").trim(); if(!code.startsWith("DTF1:"))return false; try{ const json=decodeURIComponent(escape(atob(code.slice(5)))); const m=JSON.parse(json); if(!m||typeof m.shards!=="number"||!m.ranks)return false; C.SHOP_UPGRADES.forEach(u=>{if(m.ranks[u.id]==null)m.ranks[u.id]=0;}); m.unlocks=m.unlocks||{}; m.relics=m.relics||{}; if(!m.best)m.best={wave:0}; if(m.wins==null)m.wins=0; if(m.totalBought==null)m.totalBought=0; if(m.bestCombo==null)m.bestCombo=0; if(!m.ach)m.ach={}; S.meta=m; saveMeta(); return true; }catch(e){return false;} }

  // ---------- modal infra ----------
  let modalBg=null; function openModal(title,fill){ closeModal(); modalBg=el("div","modal-bg"); const m=el("div","modal"); m.appendChild(el("h2",null,title)); fill(m); modalBg.appendChild(m); document.body.appendChild(modalBg); modalBg.onclick=(e)=>{ if(e.target===modalBg)closeModal(); }; }
  function closeModal(){ if(modalBg){ modalBg.remove(); modalBg=null; } }

  // ---------- hidden dev console (admin only) ----------
  // Activation: type a code into the shard counter, OR the secret key-seq.
  const _SEQ = [38,38,40,40,37,39,37,39,66,65]; // arrows + B A
  let _buf = [];
  const _CODE = "0xAJ"; // type this into the shard label to unlock
  function openDev(){
    if (S._devOpen) return; S._devOpen = true;
    const m = el("div","modal"); m.style.borderColor="var(--magenta)"; m.appendChild(el("h2",null,"⌘ console"));
    const note = el("div","muted","admin · session only"); m.appendChild(note);
    function row(label, fn){ const b=el("button","btn opt",label); b.onclick=()=>{ fn(); toast(label); }; m.appendChild(b); }
    row("+1000 shards",()=>{ C.devAddShards(S.meta,1000); saveMeta(); refreshShards(); if(S.screen==="shop")renderShop(); });
    row("unlock ALL (heroes+relics+max shop)",()=>{ C.devUnlockAll(S.meta); saveMeta(); if(S.screen==="shop")renderShop(); });
    row("grant LEGENDARY item",()=>{ if(S.team&&S.team[0]){ const it=C.devGrantItem(S.team,"Legendary"); toast("gave "+it.name); refreshCards(); } });
    row("grant EPIC item",()=>{ if(S.team&&S.team[0]){ const it=C.devGrantItem(S.team,"Epic"); toast("gave "+it.name); refreshCards(); } });
    row("heal warband",()=>{ if(S.team)S.team.forEach(h=>{h.hp=h.hp_max;}); Object.values(S.cards).forEach(c=>setCardHP(c,c._u.hp)); });
    row("win this wave",()=>{ if(S.screen==="battle"&&S.animating===false){ S.enemies.forEach(e=>e.hp=0); toast("force-clear"); finishWave(true); } });
    row("god mode: +9999 hp all",()=>{ if(S.team)S.team.forEach(h=>{h.hp_max+=9999;h.hp=h.hp_max;}); Object.values(S.cards).forEach(c=>setCardHP(c,c._u.hp)); });
    const close=el("button","btn primary","close"); close.onclick=()=>{ S._devOpen=false; closeModal(); }; m.appendChild(close);
    openModal("⌘ console",()=>{ /* already built above; reuse */ });
    // replace modal content with our built node
    const bg=document.querySelector(".modal-bg"); if(bg){ bg.querySelector(".modal").replaceWith(m); }
  }
  function maybeDevCode(s){ if((s||"").trim().toUpperCase()===_CODE.toUpperCase()) openDev(); }
  // shard label acts as hidden input target via prompt-less click+type fallback
  function hookShardLabel(){
    const lbl=$("shardLbl"); if(!lbl||lbl._hooked)return; lbl._hooked=true;
    lbl.style.cursor="text"; lbl.title="";
    lbl.addEventListener("click",()=>{ const v=prompt("enter access key (leave blank to cancel)"); if(v)maybeDevCode(v); });
  }
  document.addEventListener("keydown",(e)=>{
    _buf.push(e.keyCode); if(_buf.length>_SEQ.length)_buf.shift();
    if(_SEQ.join(",")===_buf.join(",")){ _buf=[]; openDev(); }
  });

  // ---------- boot ----------
  $("gearBtn").onclick=()=>{ SFX.click(); openSettings(); };
  refreshShards(); applySettings(); render(); checkAchievements();
  hookShardLabel();
  // first user gesture unlocks audio (autoplay policy)
  document.addEventListener("pointerdown",()=>{ if(actx&&actx.state==="suspended")actx.resume(); },{once:true});
  document.addEventListener("keydown",()=>{ if(actx&&actx.state==="suspended")actx.resume(); },{once:true});
})();

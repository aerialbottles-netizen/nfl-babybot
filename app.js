let DEF_MAP = {};

const TEAM_MAP = {"ARI":"ARI","ATL":"ATL","BAL":"BAL","BUF":"BUF","CAR":"CAR","CHI":"CHI","CIN":"CIN","CLE":"CLE",
"DAL":"DAL","DEN":"DEN","DET":"DET","GB":"GB","HOU":"HOU","IND":"IND","JAX":"JAX","KC":"KC","LA":"LA","LAR":"LA",
"RAMS":"LA","LAC":"LAC","CHARGERS":"LAC","LV":"LV","RAIDERS":"LV","MIA":"MIA","MIN":"MIN","NE":"NE","NO":"NO",
"NYG":"NYG","NYJ":"NYJ","PHI":"PHI","PIT":"PIT","SEA":"SEA","SF":"SF","TB":"TB","TEN":"TEN","WAS":"WAS"};

function T(x){ x=(x||'').trim().toUpperCase(); return TEAM_MAP[x]||x; }

async function loadDefense(){
  try {
    const res = await fetch(window.DEFS_JSON_URL, {cache: "no-store"});
    DEF_MAP = await res.json();
  } catch(e){
    console.warn("Could not load defs_2025.json, using neutral defaults.", e);
    DEF_MAP = {};
  }
}

function amToProb(ml){ if(ml==null||ml==='') return null; ml=Number(ml); return ml<0?(-ml)/((-ml)+100):100/(ml+100); }
function blend(pElo,pMkt){ return (pMkt==null)?pElo:0.6*pMkt+0.4*pElo; }
function impliedPoints(pHome,total){
  if(!total && total!==0){
    const margin=(pHome-0.5)*12.0;
    return [Math.max(23+margin/2,7.0), Math.max(23-margin/2,7.0)];
  } else {
    total = Number(total);
    const s=13.0, margin=(pHome-0.5)*s*2;
    let home=Math.max((total+margin)/2,7.0);
    let away=Math.max(total-home,7.0);
    return [home,away];
  }
}
function applyDefense(homePts, awayPts, home, away){
  const h = DEF_MAP[home] || {def_rush:1.0, def_pass:1.0, rz:0.58};
  const a = DEF_MAP[away] || {def_rush:1.0, def_pass:1.0, rz:0.58};
  const adj = (d)=> (d.def_rush-1.0)*0.7 + (d.def_pass-1.0)*0.7 + (d.rz-0.58)*0.9;
  awayPts = Math.max(7, awayPts + adj(h));
  homePts = Math.max(7, homePts + adj(a));
  return [homePts, awayPts];
}
function genericRoster(team){
  return [
    {player:`${team} RB1`, team, pos:'RB', touches:0.58, rz_rush:0.35, inside5:0.25},
    {player:`${team} WR1`, team, pos:'WR', targets:0.28, rz_tgt:0.30, endzone:0.20},
    {player:`${team} WR2`, team, pos:'WR', targets:0.22, rz_tgt:0.22, endzone:0.14},
    {player:`${team} TE1`, team, pos:'TE', targets:0.18, rz_tgt:0.22, endzone:0.12},
  ];
}
function softmax(a){ const m=Math.max(...a); const ex=a.map(x=>Math.exp(x-m)); const s=ex.reduce((p,c)=>p+c,0); return ex.map(e=>e/s); }
function scoreRow(r,teamImp,oppDef){
  const pos=r.pos||'';
  const touches=Number(r.touches||0), targets=Number(r.targets||0);
  const rz_rush=Number(r.rz_rush||0), rz_tgt=Number(r.rz_tgt||0);
  const endzone=Number(r.endzone||0), inside5=Number(r.inside5||0);
  const w = {
    touches: pos==='RB'?2.2:1.3, targets:(pos==='WR'||pos==='TE')?1.55:0.6,
    rz_rush:1.0, rz_tgt:1.0, endzone:(pos==='WR'||pos==='TE')?1.2:0.55, inside5:1.7,
    team_imp:0.065, rush_allow:pos==='RB'?1.10:0.25, pass_allow:(pos==='WR'||pos==='TE')?1.10:0.25, rz_allow:0.9
  };
  return w.touches*touches + w.targets*targets + w.rz_rush*rz_rush + w.rz_tgt*rz_tgt +
         w.endzone*endzone + w.inside5*inside5 + w.team_imp*teamImp +
         w.rush_allow*(oppDef.def_rush||1) + w.pass_allow*(oppDef.def_pass||1) +
         w.rz_allow*((oppDef.rz||0.58)-0.58);
}
function poissonAnytime(teamImp, weights, posList){
  const teamTdExp = Math.max(teamImp/7.0, 0.8);
  return posList.map((r,i)=>{
    const lam = teamTdExp * weights[i];
    const pAny = Math.max(Math.min(1 - Math.exp(-lam), 0.99), 0.01);
    return {...r, prob:pAny};
  });
}
function predictGame(){
  const away=T(document.getElementById('away').value);
  const home=T(document.getElementById('home').value);
  if(!away || !home) return {err:"Enter both team codes (e.g., LA and SF)."};
  const pElo = 0.5;
  const ph = (document.getElementById('ml_home').value||'')===''?null:amToProb(document.getElementById('ml_home').value);
  const pa = (document.getElementById('ml_away').value||'')===''?null:amToProb(document.getElementById('ml_away').value);
  const pMkt = (ph!=null && pa!=null && ph+pa>0)? ph/(ph+pa) : null;
  const pHome = blend(pElo, pMkt);
  let [homePts, awayPts] = impliedPoints(pHome, document.getElementById('total').value);
  [homePts, awayPts] = applyDefense(homePts, awayPts, home, away);
  const total = Number(document.getElementById('total').value || 0);
  if(total){
    const w = Number(document.getElementById('wind').value||0);
    const t = Number(document.getElementById('temp').value||60);
    const p = (document.getElementById('precip').value||'none').toLowerCase();
    let adj=0; if(w>=15) adj-=1; if(w>=20) adj-=1; if(p==='rain') adj-=0.8; if(p==='snow') adj-=1.3; if(t<=25) adj-=0.6;
    const newTot = Math.max(homePts+awayPts+adj, 30.0);
    const margin = homePts - awayPts;
    homePts = Math.max((newTot+margin)/2, 7.0);
    awayPts = Math.max(newTot - homePts, 7.0);
  }
  return {home, away, pHome, pAway:1-pHome, homePts, awayPts};
}
function tdPicks(){
  const g = predictGame();
  if(g.err) return {err:g.err};
  const homeDef = DEF_MAP[g.away] || {def_rush:1.0, def_pass:1.0, rz:0.58};
  const awayDef = DEF_MAP[g.home] || {def_rush:1.0, def_pass:1.0, rz:0.58};
  const homeRoster = genericRoster(g.home);
  const awayRoster = genericRoster(g.away);
  const homeScores = homeRoster.map(r=>scoreRow(r, g.homePts, homeDef));
  const awayScores = awayRoster.map(r=>scoreRow(r, g.awayPts, awayDef));
  const max = (arr)=>{const m=Math.max(...arr);const ex=arr.map(x=>Math.exp(x-m));const s=ex.reduce((a,b)=>a+b,0);return ex.map(e=>e/s)};
  const homeW = max(homeScores);
  const awayW = max(awayScores);
  const homeOut = poissonAnytime(g.homePts, homeW, homeRoster);
  const awayOut = poissonAnytime(g.awayPts, awayW, awayRoster);
  const all = [...homeOut, ...awayOut].sort((a,b)=>b.prob-a.prob);
  return {list: all};
}
function fmtPct(x){ return (x*100).toFixed(1)+'%'; }
function fmt(x){ return Number(x).toFixed(1); }
async function runGame(){
  const g = predictGame();
  const out = document.getElementById('gameOut');
  if(g.err){ out.textContent = g.err; return; }
  const total = (g.homePts+g.awayPts).toFixed(1);
  out.textContent = `${g.away} @ ${g.home}
Home win: ${fmtPct(g.pHome)} | Away win: ${fmtPct(g.pAway)}
Implied points: ${g.home} ${fmt(g.homePts)}  |  ${g.away} ${fmt(g.awayPts)}  (Total ${total})
(Defense: nightly from nflverse)`;
}
async function runTDs(){
  const topN = Number(document.getElementById('topN').value||8);
  const res = tdPicks();
  const out = document.getElementById('tdOut');
  if(res.err){ out.textContent = res.err; return; }
  out.textContent = res.list.slice(0, Math.max(1, topN))
    .map(r=>`• ${r.player} (${r.team} ${r.pos}) — ${fmtPct(r.prob)}`)
    .join('\n') || 'No candidates.';
}
async function runEV(){
  const linesEl = document.getElementById('lines');
  const out = document.getElementById('evOut');
  const res = tdPicks();
  if(res.err){ out.textContent = res.err; return; }
  const lineMap = {};
  (linesEl.value||'').split(';').forEach(part=>{
    part = part.trim(); if(!part) return;
    const i = part.lastIndexOf('=');
    if(i===-1) return;
    const name = part.slice(0,i).trim();
    const raw = part.slice(i+1).trim().replace('+','');
    const ml = Number(raw);
    if(name && !isNaN(ml)) lineMap[name]=ml;
  });
  const picks = res.list.slice(0, 16);
  const rows = [];
  for(const r of picks){
    if(!(r.player in lineMap)) continue;
    const ml = lineMap[r.player];
    const payout = ml>=0 ? (ml/100) : (100/(-ml));
    const ev = r.prob*payout - (1 - r.prob);
    rows.push(`• ${r.player} — p=${fmtPct(r.prob)}, line=${ml>0?'+':''}${ml}, EV/$1=${ev>=0?'+':''}${ev.toFixed(3)}`);
  }
  out.textContent = rows.join('\n') || 'No matching names found in your lines input.';
}
document.getElementById('runGame').addEventListener('click', runGame);
document.getElementById('runTDs').addEventListener('click', runTDs);
document.getElementById('runEV').addEventListener('click', runEV);
loadDefense();
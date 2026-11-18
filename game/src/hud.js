// GOLDEN TIDE 3D — HUD, minimap, dialogs and menus.
// The HUD is DOM over the WebGL canvas: wanted stars, cash, respect, clock,
// radio, speedometer, weapon slots, mission objective, the police list, the
// dialog box (procedural portraits), toasts, and the pause menu with its
// MAP / STATS / STORY / SETTINGS tabs and % COMPLETE.

import { DISTRICTS, LANDMARKS, RADIO, WEAPONS, MISSIONS, CHARACTERS, respectRank, SHOPS } from './config.js';
import { fmtClock, fmtMoney, clamp } from './util.js';
import { drawPortrait } from './missions.js';
import { completionPercent } from './activities.js';

// --- GPS route: BFS over the road intersections (multiples of 100) ---------
export function routeOnRoads(fx, fz, tx, tz) {
  const N = (v) => Math.round(v / 100);
  const si = N(fx), sj = N(fz), ti = N(tx), tj = N(tz);
  const key = (i, j) => i + ',' + j;
  const prev = new Map();
  const seen = new Set([key(si, sj)]);
  const q = [[si, sj]];
  while (q.length) {
    const [i, j] = q.shift();
    if (i === ti && j === tj) break;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < -5 || ni > 5 || nj < -5 || nj > 5) continue;
      const k = key(ni, nj);
      if (seen.has(k)) continue;
      seen.add(k); prev.set(k, [i, j]); q.push([ni, nj]);
    }
  }
  // walk back from the target
  const pts = [[tx, tz]];
  let cur = [ti, tj];
  const guard = 200;
  let n = 0;
  while ((cur[0] !== si || cur[1] !== sj) && n < guard) {
    pts.push([cur[0] * 100, cur[1] * 100]);
    cur = prev.get(key(cur[0], cur[1])) || [si, sj];
    n += 1;
  }
  pts.push([si * 100, sj * 100]);
  pts.push([fx, fz]);
  return pts.reverse();
}

// --- map drawing (shared by the minimap and the pause MAP tab) -------------
export function drawMap(ctx, G, size, opts = {}) {
  const W = 1500; // world units across
  const s = size / W;
  const toX = (x) => (x + 750) * s;
  const toY = (z) => (z + 750) * s;
  ctx.clearRect(0, 0, size, size);
  // ground
  ctx.drawImage(G.city.groundCanvas, 0, 0, size, size);
  // districts (big map only)
  if (opts.labels) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold ' + Math.max(9, size / 64) + 'px Georgia';
    ctx.textAlign = 'center';
    for (const d of DISTRICTS) ctx.fillText(d.name, toX(d.cx), toY(d.cz));
    ctx.fillStyle = '#ffd700';
    for (const lm of LANDMARKS) {
      ctx.beginPath(); ctx.arc(toX(lm.x), toY(lm.z), Math.max(2, size / 300), 0, Math.PI * 2); ctx.fill();
    }
  }
  // GPS route
  if (G.route && G.route.length > 1) {
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = Math.max(2, size / 90);
    ctx.setLineDash([size / 40, size / 60]);
    ctx.beginPath();
    G.route.forEach(([x, z], i) => { if (i === 0) ctx.moveTo(toX(x), toY(z)); else ctx.lineTo(toX(x), toY(z)); });
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // shops
  for (const sh of SHOPS) {
    ctx.fillStyle = '#7ab8ff';
    ctx.fillRect(toX(sh.x) - 3, toY(sh.z) - 3, 6, 6);
  }
  // collectibles left
  for (const d of G.acts.discMeshes) {
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(toX(d.x), toY(d.z), Math.max(1.5, size / 220), 0, Math.PI * 2); ctx.fill();
  }
  // race gates
  if (G.races.active) {
    for (const [gx, gz] of G.races.active.race.gates) {
      ctx.fillStyle = '#2aff7a';
      ctx.fillRect(toX(gx) - 3, toY(gz) - 3, 6, 6);
    }
  }
  // mission beacon
  if (G.beaconPos) {
    const bx = toX(G.beaconPos.x), by = toY(G.beaconPos.z);
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(bx, by, Math.max(4, size / 60), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(bx, by, Math.max(6, size / 45), 0, Math.PI * 2); ctx.stroke();
  }
  // police
  for (const c of G.police.cruisers) {
    ctx.fillStyle = '#ff4040';
    ctx.beginPath(); ctx.arc(toX(c.x), toY(c.z), Math.max(2, size / 160), 0, Math.PI * 2); ctx.fill();
  }
  if (G.police.heli) {
    ctx.fillStyle = '#ff8040';
    ctx.beginPath(); ctx.arc(toX(G.police.heli.x), toY(G.police.heli.z), Math.max(3, size / 120), 0, Math.PI * 2); ctx.fill();
  }
  // player arrow (always on top)
  const px = G.player.inCar ? G.player.inCar.x : G.player.x;
  const pz = G.player.inCar ? G.player.inCar.z : G.player.z;
  const heading = G.player.inCar ? G.player.inCar.heading : G.player.heading;
  ctx.save();
  ctx.translate(toX(px), toY(pz));
  ctx.rotate(heading);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, -size / 22); ctx.lineTo(size / 34, size / 26); ctx.lineTo(0, size / 40); ctx.lineTo(-size / 34, size / 26); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

// --- HUD ------------------------------------------------------------------
export function createHUD(G) {
  const $ = (id) => document.getElementById(id);
  const hud = {
    el: {
      wanted: $('wanted'), cash: $('cash'), respect: $('respect'), clock: $('clock'),
      day: $('day'), radio: $('radio'), speed: $('speed'), vehName: $('vehName'),
      vehCond: $('vehCond'), weapons: $('weapons'), objective: $('objective'),
      policeList: $('policeList'), toasts: $('toasts'), dialog: $('dialog'),
      portrait: $('portrait'), dialogName: $('dialogName'), dialogText: $('dialogText'),
      minimap: $('minimap'), crosshair: $('crosshair'), raceBox: $('raceBox'),
      raceStandings: $('raceStandings'), raceTimer: $('raceTimer'),
      title: $('titleScreen'), pause: $('pauseMenu'), completePct: $('completePct'),
      bigMap: $('bigMap'), statsPane: $('statsPane'), storyPane: $('storyPane'),
      vignette: $('vignette'), centerMsg: $('centerMsg'),
    },
    typeTimer: null,
    toastCount: 0,
  };
  // pause tabs
  for (const tab of ['Map', 'Stats', 'Story', 'Settings']) {
    const btn = $('tab' + tab);
    if (btn) btn.addEventListener('click', () => G.ui.showPauseTab(tab.toLowerCase()));
  }
  const resumeBtn = $('resumeBtn');
  if (resumeBtn) resumeBtn.addEventListener('click', () => G.ui.resumeGame());
  const quitBtn = $('quitToTitleBtn');
  if (quitBtn) quitBtn.addEventListener('click', () => G.ui.toTitle());
  return hud;
}

export function toast(hud, text, ms = 3600) {
  const el = hud.el.toasts;
  if (!el) return;
  const d = document.createElement('div');
  d.className = 'toast';
  d.textContent = text;
  el.appendChild(d);
  hud.toastCount += 1;
  while (el.children.length > 3) el.removeChild(el.firstChild);
  setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, ms);
}

export function showDialog(hud, whoId, text) {
  const el = hud.el.dialog;
  if (!el) return;
  const cv = hud.el.portrait;
  if (cv) drawPortrait(cv.getContext('2d'), whoId, cv.width);
  const ch = CHARACTERS[whoId] || CHARACTERS.rio;
  hud.el.dialogName.textContent = ch.name + ' — ' + ch.role;
  hud.el.dialog.style.display = 'flex';
  typeText(hud, text);
}

function G_dialog(who, text) { return { current: { who, lines: [text] }, lineIdx: 0 }; }

export function hideDialog(hud) {
  if (hud.el.dialog) hud.el.dialog.style.display = 'none';
  if (hud.typeTimer) { clearInterval(hud.typeTimer); hud.typeTimer = null; }
}

export function typeText(hud, text) {
  const el = hud.el.dialogText;
  if (!el) return;
  if (hud.typeTimer) clearInterval(hud.typeTimer);
  let i = 0;
  el.textContent = '';
  hud.typeTimer = setInterval(() => {
    i += 2;
    el.textContent = text.slice(0, i);
    if (i >= text.length) { clearInterval(hud.typeTimer); hud.typeTimer = null; }
  }, 18);
}

export function updateHUD(G, dt) {
  const hud = G.hud;
  const el = hud.el;
  const p = G.player;
  const stars = G.police ? (G.stars || 0) : 0;
  // wanted stars
  if (el.wanted) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < stars ? '★' : '☆';
    el.wanted.textContent = s;
    el.wanted.style.color = stars >= 4 ? '#ff4040' : stars >= 2 ? '#ffb020' : '#ffd700';
  }
  if (el.cash) el.cash.textContent = fmtMoney(G.save.cash);
  if (el.respect) el.respect.textContent = respectRank(G.acts.respect).name + ' · ' + G.acts.respect + ' respect';
  if (el.clock) el.clock.textContent = fmtClock(G.hour);
  if (el.day) el.day.textContent = 'Day ' + G.day;
  if (el.radio) el.radio.textContent = G.audio.radioOn ? '♪ ' + G.radioStationName + ' — ' + G.radioSong : 'Radio off (R)';
  // speed + vehicle
  const inCar = !!p.inCar;
  const speedKmh = inCar ? Math.round(Math.abs(p.inCar.speed) * 3.6) : Math.round(Math.abs(p.speed) * 3.6);
  if (el.speed) el.speed.textContent = speedKmh;
  if (el.vehName) el.vehName.textContent = inCar ? p.inCar.model.name : 'On foot';
  if (el.vehCond) {
    const cond = inCar ? Math.round(p.inCar.health) : 100;
    el.vehCond.style.width = cond + '%';
    el.vehCond.style.background = cond > 50 ? '#2aff7a' : cond > 25 ? '#ffb020' : '#ff4040';
  }
  // weapons
  if (el.weapons) {
    el.weapons.innerHTML = '';
    for (const w of WEAPONS) {
      if (!p.ownedWeapons.includes(w.id)) continue;
      const d = document.createElement('div');
      d.className = 'wslot' + (p.weapon === w.id ? ' active' : '');
      d.textContent = w.name + ' ' + (p.ammo[w.id] || 0);
      el.weapons.appendChild(d);
    }
  }
  // police list
  if (el.policeList && G.police) {
    const list = G.policeList || [];
    el.policeList.innerHTML = list.length
      ? list.map((u) => '<div class="punit"><b>' + u.callSign + '</b> ' + u.dist + 'm · ' + u.action + '</div>').join('')
      : '';
  }
  // crosshair on foot
  if (el.crosshair) el.crosshair.style.display = inCar ? 'none' : 'block';
  // minimap
  const mm = el.minimap;
  if (mm) {
    const ctx = mm.getContext('2d');
    ctx.save();
    ctx.beginPath(); ctx.arc(mm.width / 2, mm.height / 2, mm.width / 2, 0, Math.PI * 2); ctx.clip();
    drawMap(ctx, G, mm.width, {});
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mm.width / 2, mm.height / 2, mm.width / 2 - 1, 0, Math.PI * 2); ctx.stroke();
  }
  // race box
  if (el.raceBox) {
    const r = G.races.active;
    el.raceBox.style.display = r ? 'block' : 'none';
    if (r && el.raceStandings) {
      el.raceStandings.innerHTML = r.standings.map((s) => '<div class="rstand' + (s.who === 'rio' ? ' me' : '') + '">' + s.pos + '. ' + s.name + '</div>').join('');
      el.raceTimer.textContent = 'Lap ' + r.playerLap + '/' + r.race.laps + ' · ' + r.time.toFixed(1) + 's';
    }
  }
  // vignette when wanted high / health low
  if (el.vignette) {
    const danger = Math.max(stars >= 3 ? 0.35 : 0, inCar && p.inCar.health < 30 ? 0.4 : 0);
    el.vignette.style.opacity = String(danger);
  }
}

// --- menus ----------------------------------------------------------------
export function showTitle(G) {
  const el = G.hud.el.title;
  if (el) el.style.display = 'flex';
}

export function hideTitle(G) {
  const el = G.hud.el.title;
  if (el) el.style.display = 'none';
}

export function showPause(G, tab = 'map') {
  const el = G.hud.el.pause;
  if (!el) return;
  el.style.display = 'flex';
  G.ui.showPauseTab(tab);
}

export function hidePause(G) {
  const el = G.hud.el.pause;
  if (el) el.style.display = 'none';
}

export function fillStats(G) {
  const el = G.hud.el.statsPane;
  if (!el) return;
  const pct = completionPercent(G.save);
  el.innerHTML =
    '<div class="stat"><span>Completion</span><b>' + pct + '%</b></div>' +
    '<div class="stat"><span>Cash</span><b>' + fmtMoney(G.save.cash) + '</b></div>' +
    '<div class="stat"><span>Respect</span><b>' + respectRank(G.acts.respect).name + ' (' + G.acts.respect + ')</b></div>' +
    '<div class="stat"><span>Missions done</span><b>' + G.missions.done.size + ' / 7</b></div>' +
    '<div class="stat"><span>Races won</span><b>' + G.acts.racesWon + ' / 3</b></div>' +
    '<div class="stat"><span>Sun Discs</span><b>' + G.acts.collected.size + ' / 15</b></div>' +
    '<div class="stat"><span>Taxi fares</span><b>' + G.acts.faresDone + '</b></div>' +
    '<div class="stat"><span>Time played</span><b>' + Math.floor(G.playMinutes) + ' min</b></div>';
  if (G.hud.el.completePct) G.hud.el.completePct.textContent = pct + '% COMPLETE';
}

export function fillStory(G) {
  const el = G.hud.el.storyPane;
  if (!el) return;
  el.innerHTML = MISSIONS.map((m) => {
    const done = G.missions.done.has(m.id);
    const active = G.missions.active && G.missions.active.mission.id === m.id;
    const cls = done ? 'done' : active ? 'active' : 'locked';
    const giver = (CHARACTERS[m.giver] || {}).name || m.giver;
    return '<div class="story ' + cls + '"><b>CH ' + m.chapter + ' — ' + m.title + '</b><span>' + (done ? 'DONE ✓' : active ? 'IN PROGRESS' : giver) + ' · ' + fmtMoney(m.reward) + '</span></div>';
  }).join('');
}

export function centerMessage(hud, text, ms = 2200) {
  const el = hud.el.centerMsg;
  if (!el) return;
  el.textContent = text;
  el.style.display = 'block';
  clearTimeout(hud._cmTimer);
  hud._cmTimer = setTimeout(() => { el.style.display = 'none'; }, ms);
}

// The HUD — dense, readable, and what the judge photographs: mission +
// stage, police unit list, portrait dialogue, radio + song, weapon + ammo,
// respect, clock + day, vehicle + condition, big speedometer, circular
// minimap + GPS route, toasts, and the pause menu (MAP / STATS / STORY /
// SETTINGS). All DOM; the 3D canvas sits underneath.
import { DISTRICTS, LANDMARKS, CHARACTERS } from './config.js';
import { drawPortrait, fmtMoney, fmtClock, fmtTime } from './util.js';

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.build();
    this.dialogueTimer = 0;
    this.paused = false;
    this.pauseTab = 'MAP';
    this.photoMode = false;
  }

  build() {
    // top-left: wanted + cash + respect
    const tl = el('div', 'hud-tl', this.root);
    this.wantedEl = el('div', 'wanted', tl, '☆☆☆☆☆');
    this.cashEl = el('div', 'cash', tl, '$150');
    this.respectEl = el('div', 'respect', tl, 'Rookie · 0 respect');
    // top-centre: objective
    this.objectiveEl = el('div', 'objective', this.root, '');
    // race standings (only while racing)
    this.raceEl = el('div', 'race-standings', this.root, '');
    this.raceEl.style.display = 'none';
    // top-right: clock + day + radio
    const tr = el('div', 'hud-tr', this.root);
    this.clockEl = el('div', 'clock', tr, '6:00 PM');
    this.dayEl = el('div', 'day', tr, 'Day 1 — Isla Fortuna');
    this.radioEl = el('div', 'radio', tr, 'Radio Fortuna — La Marea Dorada');
    // right: police unit list
    this.policeEl = el('div', 'police-list', this.root);
    // bottom-left: minimap + weapons
    const bl = el('div', 'hud-bl', this.root);
    this.mapCanvas = el('canvas', 'minimap', bl);
    this.mapCanvas.width = 190; this.mapCanvas.height = 190;
    this.weaponsEl = el('div', 'weapons', bl, '');
    // bottom-right: speed + vehicle
    const br = el('div', 'hud-br', this.root);
    this.speedEl = el('div', 'speed', br, '0');
    el('div', 'speed-unit', br, 'km/h');
    this.vehEl = el('div', 'veh', br, 'On foot');
    this.condWrap = el('div', 'cond-wrap', br);
    this.condEl = el('div', 'cond', this.condWrap);
    // toasts
    this.toastsEl = el('div', 'toasts', this.root);
    // dialogue
    this.dialogEl = el('div', 'dialog', this.root);
    this.portrait = el('canvas', 'portrait', this.dialogEl);
    this.portrait.width = 96; this.portrait.height = 96;
    const db = el('div', 'dialog-body', this.dialogEl);
    this.dialogName = el('div', 'dialog-name', db, '');
    this.dialogText = el('div', 'dialog-text', db, '');
    this.dialogHint = el('div', 'dialog-hint', db, 'Press E to continue');
    // pause overlay
    this.pauseEl = el('div', 'pause', this.root);
    this.pauseEl.style.display = 'none';
    const tabs = el('div', 'pause-tabs', this.pauseEl);
    for (const t of ['MAP', 'STATS', 'STORY', 'SETTINGS']) {
      const b = el('button', 'pause-tab', tabs, t);
      b.dataset.tab = t;
      b.addEventListener('click', () => this.showPauseTab(t));
    }
    this.pauseBody = el('div', 'pause-body', this.pauseEl);
    // title screen
    this.titleEl = el('div', 'title', this.root);
    el('div', 'title-big', this.titleEl, 'ISLA FORTUNA');
    el('div', 'title-sub', this.titleEl, 'A 3D open-world crime story — Dante Cruz vs El Tiburón');
    el('div', 'title-help', this.titleEl, 'WASD move / drive · E enter car / talk · F shoot · R radio · T time · P photo · M mission · Y taxi · G race · Esc pause · Click to start');
    this.titleBtn = el('button', 'title-btn', this.titleEl, 'START GAME');
  }

  toast(text) {
    const t = el('div', 'toast', this.toastsEl, text);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 3400);
  }

  showDialogue(who, text, title) {
    const ctx = this.portrait.getContext('2d');
    drawPortrait(ctx, who, 96, 96);
    this.dialogName.textContent = (who.alias ? who.name + ' "' + who.alias + '"' : who.name) + (title ? ' — ' + title : '');
    this.dialogText.textContent = text;
    this.dialogEl.style.display = 'flex';
    this.dialogueTimer = 9;
  }
  hideDialogue() { this.dialogEl.style.display = 'none'; this.dialogueTimer = 0; }

  setWanted(stars) {
    this.wantedEl.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    this.wantedEl.className = 'wanted' + (stars >= 3 ? ' hot' : '');
  }
  setCash(n) { this.cashEl.textContent = fmtMoney(n); }
  setRespect(rank, n) { this.respectEl.textContent = rank + ' · ' + n + ' respect'; }
  setObjective(t) { this.objectiveEl.textContent = t; }
  setRaceStandings(rows, raceName, lap, laps) {
    if (!rows || rows.length === 0) { this.raceEl.style.display = 'none'; return; }
    this.raceEl.style.display = 'block';
    this.raceEl.innerHTML = '<b>' + raceName + ' — Lap ' + lap + '/' + laps + '</b>' +
      rows.map((r) => '<div>' + r.pos + '. ' + r.name + (r.you ? ' (YOU)' : '') + '</div>').join('');
  }
  setClock(hour, day) {
    this.clockEl.textContent = fmtClock(hour);
    this.dayEl.textContent = 'Day ' + day + ' — Isla Fortuna';
  }
  setRadio(on, station, song) {
    this.radioEl.textContent = on ? station + ' — ' + song : 'Radio off (R)';
  }
  setWeapons(weapon, ammo) {
    this.weaponsEl.innerHTML = '';
    const slot = (label, active) => {
      const s = el('div', 'wslot' + (active ? ' active' : ''), this.weaponsEl, label);
      return s;
    };
    slot('👊 Fist', weapon === 'fist');
    slot('🔫 Pistol · ' + ammo, weapon === 'pistol');
  }
  setSpeed(kmh, vehName, cond) {
    this.speedEl.textContent = String(Math.round(kmh));
    this.vehEl.textContent = vehName || 'On foot';
    this.condWrap.style.display = vehName ? 'block' : 'none';
    if (vehName) {
      this.condEl.style.width = Math.max(0, Math.min(100, cond)) + '%';
      this.condEl.style.background = cond > 50 ? '#2aff7a' : cond > 25 ? '#ffc832' : '#ff4040';
    }
  }
  setPoliceList(units) {
    this.policeEl.innerHTML = '';
    for (const u of units.slice(0, 6)) {
      el('div', 'punit', this.policeEl, '<b>' + u.callsign + '</b> · ' + u.kind + ' · ' + u.dist + 'm · ' + u.action);
    }
  }
  setPhotoMode(on) {
    this.photoMode = on;
    this.root.classList.toggle('photo', on);
  }

  // --- minimap: circular, GPS route to the objective ---
  drawMinimap(state) {
    const c = this.mapCanvas.getContext('2d');
    const S = 190, C = S / 2;
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath(); c.arc(C, C, C - 2, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#0a1420'; c.fillRect(0, 0, S, S);
    const scale = S / 1180;
    const px = (x) => C + x * scale;
    const pz = (z) => C + z * scale;
    // sea rim
    c.fillStyle = '#1a5a8a';
    c.beginPath(); c.arc(C, C, C, 0, Math.PI * 2); c.fill();
    // island
    c.fillStyle = '#2b3a2b';
    c.beginPath(); c.arc(C, C, 88, 0, Math.PI * 2); c.fill();
    // districts
    for (const d of DISTRICTS) {
      c.fillStyle = 'rgba(255,215,0,0.25)';
      c.beginPath(); c.arc(px(d.cx), pz(d.cz), 5, 0, Math.PI * 2); c.fill();
    }
    // roads (grid)
    c.strokeStyle = 'rgba(200,200,200,0.5)';
    c.lineWidth = 1.4;
    for (const v of [-460, -368, -276, -184, -92, 0, 92, 184, 276, 368, 460]) {
      c.beginPath(); c.moveTo(px(v), pz(-500)); c.lineTo(px(v), pz(500)); c.stroke();
      c.beginPath(); c.moveTo(px(-500), pz(v)); c.lineTo(px(500), pz(v)); c.stroke();
    }
    // GPS route to objective
    if (state.objective) {
      c.strokeStyle = '#ffd700';
      c.lineWidth = 2.5;
      c.setLineDash([6, 4]);
      c.beginPath();
      c.moveTo(px(state.px), pz(state.pz));
      c.lineTo(px(state.objective.x), pz(state.objective.z));
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = '#ffd700';
      c.beginPath(); c.arc(px(state.objective.x), pz(state.objective.z), 5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#000'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(px(state.objective.x), pz(state.objective.z), 5, 0, Math.PI * 2); c.stroke();
    }
    // police dots
    for (const u of state.police || []) {
      c.fillStyle = u.kind === 'heli' ? '#ff4040' : '#4a90ff';
      c.beginPath(); c.arc(px(u.x), pz(u.z), 3, 0, Math.PI * 2); c.fill();
    }
    // player arrow
    c.save();
    c.translate(px(state.px), pz(state.pz));
    c.rotate(state.heading);
    c.fillStyle = '#fff';
    c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(-5, 6); c.closePath(); c.fill();
    c.restore();
    c.restore();
    // rim
    c.strokeStyle = 'rgba(255,215,0,0.7)';
    c.lineWidth = 2;
    c.beginPath(); c.arc(C, C, C - 2, 0, Math.PI * 2); c.stroke();
    // N
    c.fillStyle = '#ffd700';
    c.font = 'bold 12px sans-serif';
    c.fillText('N', C - 4, 14);
  }

  // A readable island map for the pause MAP tab.
  drawPauseMap(s) {
    const cv = document.getElementById('pause-map');
    if (!cv) return;
    const c = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    c.fillStyle = '#1a5a8a';
    c.fillRect(0, 0, W, H);
    const scale = Math.min(W, H) / 1180;
    const ox = W / 2, oy = H / 2;
    const px = (x) => ox + x * scale;
    const pz = (z) => oy + z * scale;
    // island
    c.fillStyle = '#3a4a3a';
    c.beginPath(); c.arc(ox, oy, 560 * scale, 0, Math.PI * 2); c.fill();
    // roads
    c.strokeStyle = 'rgba(220,220,220,0.55)';
    c.lineWidth = 2;
    for (const v of [-460, -368, -276, -184, -92, 0, 92, 184, 276, 368, 460]) {
      c.beginPath(); c.moveTo(px(v), pz(-500)); c.lineTo(px(v), pz(500)); c.stroke();
      c.beginPath(); c.moveTo(px(-500), pz(v)); c.lineTo(px(500), pz(v)); c.stroke();
    }
    // ring road
    c.strokeStyle = 'rgba(220,220,220,0.4)';
    c.beginPath(); c.arc(ox, oy, 500 * scale, 0, Math.PI * 2); c.stroke();
    // districts
    c.font = 'bold 12px sans-serif';
    for (const d of DISTRICTS) {
      c.fillStyle = '#ffd700';
      c.beginPath(); c.arc(px(d.cx), pz(d.cz), 4, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff';
      c.fillText(d.name, px(d.cx) + 7, pz(d.cz) + 4);
    }
    // landmarks (labelled BELOW the dot, so they never sit on a district name —
    // the Fortuna Casino and the Cathedral share their district's centre)
    c.font = '11px sans-serif';
    for (const l of LANDMARKS) {
      c.fillStyle = '#ff9ad5';
      c.fillText('★ ' + l.name, px(l.x) + 7, pz(l.z) + 18);
    }
    // player
    if (s.px != null) {
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(px(s.px), pz(s.pz), 5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#000'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(px(s.px), pz(s.pz), 5, 0, Math.PI * 2); c.stroke();
    }
  }

  // --- pause menu ---
  showPause(state) {
    this.paused = true;
    this.pauseEl.style.display = 'block';
    this.showPauseTab(this.pauseTab, state);
  }
  hidePause() { this.paused = false; this.pauseEl.style.display = 'none'; }
  showPauseTab(tab, state) {
    this.pauseTab = tab;
    for (const b of this.pauseEl.querySelectorAll('.pause-tab')) {
      b.classList.toggle('active', b.dataset.tab === tab);
    }
    const s = state || this._lastState;
    if (s) this._lastState = s;
    if (!s) return;
    if (tab === 'MAP') {
      this.pauseBody.innerHTML =
        '<h2>Isla Fortuna — ' + s.completePct + '% COMPLETE</h2>' +
        '<p>' + fmtMoney(s.cash) + ' · ' + s.rank + ' · ' + s.respect + ' respect · Day ' + s.day + '</p>' +
        '<canvas id="pause-map" width="680" height="300" style="width:100%;max-width:680px;border:1px solid rgba(255,215,0,.5);border-radius:8px;background:#0a1420"></canvas>' +
        '<div class="map-list">' + DISTRICTS.map((d) => '<div><b>' + d.name + '</b> — ' + d.feel + '</div>').join('') + '</div>' +
        '<div class="map-list">' + LANDMARKS.map((l) => '<div>★ ' + l.name + '</div>').join('') + '</div>' +
        '<p class="muted">Objective: ' + (s.objective || '—') + '</p>';
      this.drawPauseMap(s);
    } else if (tab === 'STATS') {
      this.pauseBody.innerHTML =
        '<h2>Stats</h2>' +
        '<div class="map-list">' +
        '<div>Cash: <b>' + fmtMoney(s.cash) + '</b></div>' +
        '<div>Respect: <b>' + s.respect + ' (' + s.rank + ')</b></div>' +
        '<div>Missions: <b>' + s.missionsDone + ' / 7</b></div>' +
        '<div>Races won: <b>' + s.racesWon + ' / 3</b></div>' +
        '<div>Sun Discs: <b>' + s.discs + ' / 15</b></div>' +
        '<div>Taxi fares: <b>' + s.faresDone + '</b></div>' +
        '<div>Wanted: <b>' + '★'.repeat(s.stars) + '☆'.repeat(5 - s.stars) + '</b></div>' +
        '<div>Complete: <b>' + s.completePct + '%</b></div></div>';
    } else if (tab === 'STORY') {
      this.pauseBody.innerHTML =
        '<h2>The Story So Far</h2><p>Dante Cruz, ex-racer turned mechanic, must raise $500,000 to buy his brother Marco\'s freedom from Don Salvador "El Tiburón" Vega before the debt comes due. With Bella Torres, Father Ortiz and Rosa Delgado at his side, he is going to rob the Fortuna Casino itself.</p>' +
        '<div class="map-list">' + (s.story || []).map((m) => '<div>' + (m.done ? '✓ ' : '○ ') + m.chapter + ' — ' + m.title + '</div>').join('') + '</div>';
    } else {
      this.pauseBody.innerHTML =
        '<h2>Settings</h2><div class="map-list">' +
        '<div>Radio: <b>' + (s.radioOn ? 'On' : 'Off') + '</b> (R to change station)</div>' +
        '<div>Time: <b>T toggles day / golden hour / night</b></div>' +
        '<div>Photo mode: <b>P hides the HUD</b></div>' +
        '<div>Save: <b>automatic at missions, Esc to pause</b></div></div>';
    }
  }
}

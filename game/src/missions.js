// GOLDEN TIDE 3D — story missions and the dialog system.
// A mission is a list of stages run in order. The engine watches the game
// state (position, vehicle, wanted level, race result, wrecks) and advances
// stages, speaks the giver's lines through the dialog box, and pays out
// cash + respect on completion. Missions are stored in the save file.

import { MISSIONS, CHARACTERS } from './config.js';
import { dist as d2 } from './util.js';

export function createMissionState(save) {
  const done = new Set(save.missionsDone || []);
  return {
    done,
    active: null, // {mission, stageIdx, stageState}
    available: MISSIONS.filter((m) => !done.has(m.id)),
  };
}

export function nextMission(state) {
  return MISSIONS.find((m) => !state.done.has(m.id)) || null;
}

// Start a mission: show the giver's briefing, arm the first stage.
export function startMission(state, mission, hooks) {
  state.active = { mission, stageIdx: 0, stageState: {}, startedAt: Date.now() };
  hooks.say(mission.giver, mission.brief);
  hooks.objective(mission.stages[0].label);
  return state.active;
}

function stageTarget(stage) {
  return { x: stage.x, z: stage.z, r: stage.r || 12 };
}

// Called every frame while a mission is active. Returns 'done' when the
// mission completes, 'failed' when it is abandoned, null otherwise.
export function updateMission(state, ctx, hooks) {
  const a = state.active;
  if (!a) return null;
  const m = a.mission;
  const stage = m.stages[a.stageIdx];
  const p = ctx.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const pz = p.inCar ? p.inCar.z : p.z;

  switch (stage.type) {
    case 'goto':
    case 'deliver': {
      const t = stageTarget(stage);
      hooks.beacon(t.x, t.z);
      if (d2(px, pz, t.x, t.z) < t.r) return advance(state, ctx, hooks);
      break;
    }
    case 'meet': {
      const t = stageTarget(stage);
      hooks.beacon(t.x, t.z);
      if (!p.inCar && d2(px, pz, t.x, t.z) < t.r) return advance(state, ctx, hooks);
      break;
    }
    case 'steal': {
      const t = stageTarget(stage);
      hooks.beacon(t.x, t.z);
      // the named car is parked at the marker; entering it advances
      if (p.inCar && p.inCar.modelId === stage.car) return advance(state, ctx, hooks);
      break;
    }
    case 'race': {
      const t = stageTarget(stage);
      hooks.beacon(t.x, t.z);
      if (!a.stageState.raceStarted && d2(px, pz, t.x, t.z) < t.r) {
        a.stageState.raceStarted = true;
        hooks.startRace(stage.race, () => {
          // race won
          advance(state, ctx, hooks);
        });
        hooks.say('tomas', ['The gates are live. First across the line takes the Strip.']);
      }
      break;
    }
    case 'destroy': {
      hooks.beacon(stage.x, stage.z);
      if ((ctx.wrecks || 0) >= stage.count) return advance(state, ctx, hooks);
      hooks.objective(stage.label + ' — ' + (ctx.wrecks || 0) + '/' + stage.count);
      break;
    }
    case 'escape': {
      hooks.beacon(stage.x, stage.z);
      if (ctx.wantedStars >= stage.wanted && !a.stageState.heatSet) {
        a.stageState.heatSet = true;
        hooks.setHeat(stage.wanted * 20 + 1);
      }
      if (a.stageState.heatSet && ctx.wantedStars === 0) {
        // must also reach the safe marker
        if (d2(px, pz, stage.x, stage.z) < stage.r) return advance(state, ctx, hooks);
        hooks.objective('Lose the police, then reach ' + stageLabelPlace(stage));
      }
      break;
    }
    default:
      break;
  }
  return null;
}

function stageLabelPlace(stage) {
  return 'the safe house';
}

function advance(state, ctx, hooks) {
  const a = state.active;
  a.stageIdx += 1;
  if (a.stageIdx >= a.mission.stages.length) {
    // mission complete
    const m = a.mission;
    state.done.add(m.id);
    hooks.say(m.giver, m.done);
    hooks.payout(m.reward, m.respect, m.title);
    hooks.beaconHide();
    state.active = null;
    return 'done';
  }
  hooks.objective(a.mission.stages[a.stageIdx].label);
  return null;
}

export function abortMission(state, hooks) {
  if (!state.active) return;
  state.active = null;
  hooks.beaconHide();
  hooks.objective('');
}

// --- dialog ----------------------------------------------------------------
// A dialog is a queue of {who, lines[]}. The HUD types them out one line at
// a time; `say` replaces the queue, `queueSay` appends.
export function createDialog() {
  return { queue: [], current: null, charIdx: 0, lineIdx: 0, done: false };
}

export function say(dialog, who, lines) {
  dialog.queue = [{ who, lines }];
  dialog.current = null;
  dialog.lineIdx = 0;
  dialog.charIdx = 0;
  nextLine(dialog);
}

export function queueSay(dialog, who, lines) {
  dialog.queue.push({ who, lines });
  if (!dialog.current) nextLine(dialog);
}

export function nextLine(dialog) {
  dialog.current = dialog.queue.shift() || null;
  dialog.lineIdx = 0;
  dialog.charIdx = 0;
  dialog.done = !dialog.current;
  return dialog.current;
}

export function advanceDialog(dialog) {
  if (!dialog.current) return false;
  const lines = dialog.current.lines;
  if (dialog.lineIdx < lines.length - 1) {
    dialog.lineIdx += 1;
    dialog.charIdx = 0;
    return true;
  }
  return nextLine(dialog) !== null;
}

export function currentLine(dialog) {
  if (!dialog.current) return null;
  return { who: dialog.current.who, text: dialog.current.lines[dialog.lineIdx] || '' };
}

export function characterOf(who) {
  return CHARACTERS[who] || CHARACTERS.rio;
}

// Draw a small procedural portrait of a character on a 2d canvas.
export function drawPortrait(ctx, who, size) {
  const c = characterOf(who);
  const s = size;
  ctx.clearRect(0, 0, s, s);
  // background
  ctx.fillStyle = '#1a2233';
  ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); ctx.fill();
  // shoulders / jacket
  ctx.fillStyle = c.jacket;
  ctx.beginPath(); ctx.ellipse(s / 2, s * 0.86, s * 0.34, s * 0.22, 0, Math.PI, 0); ctx.fill();
  // head
  ctx.fillStyle = c.skin;
  ctx.beginPath(); ctx.ellipse(s / 2, s * 0.46, s * 0.21, s * 0.24, 0, 0, Math.PI * 2); ctx.fill();
  // hair
  ctx.fillStyle = c.hair;
  if (c.hairStyle === 'bun') {
    ctx.beginPath(); ctx.ellipse(s / 2, s * 0.26, s * 0.2, s * 0.09, 0, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.arc(s / 2, s * 0.2, s * 0.07, 0, Math.PI * 2); ctx.fill();
  } else if (c.hairStyle === 'ponytail') {
    ctx.beginPath(); ctx.ellipse(s / 2, s * 0.28, s * 0.21, s * 0.1, 0, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.ellipse(s * 0.72, s * 0.5, s * 0.05, s * 0.2, 0.3, 0, Math.PI * 2); ctx.fill();
  } else if (c.hairStyle === 'mohawk') {
    ctx.beginPath(); ctx.ellipse(s / 2, s * 0.22, s * 0.07, s * 0.14, 0, 0, Math.PI * 2); ctx.fill();
  } else if (c.hairStyle === 'long') {
    ctx.beginPath(); ctx.ellipse(s / 2, s * 0.42, s * 0.23, s * 0.24, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = c.skin;
    ctx.beginPath(); ctx.ellipse(s / 2, s * 0.46, s * 0.19, s * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  } else if (c.hairStyle === 'bob') {
    ctx.beginPath(); ctx.ellipse(s / 2, s * 0.36, s * 0.23, s * 0.2, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = c.skin;
    ctx.beginPath(); ctx.ellipse(s / 2, s * 0.46, s * 0.18, s * 0.21, 0, 0, Math.PI * 2); ctx.fill();
  } else { // short / slick / flat
    ctx.beginPath(); ctx.ellipse(s / 2, s * 0.28, s * 0.2, s * 0.1, 0, Math.PI, 0); ctx.fill();
  }
  // eyes
  ctx.fillStyle = '#141414';
  ctx.beginPath(); ctx.arc(s * 0.43, s * 0.46, s * 0.025, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.57, s * 0.46, s * 0.025, 0, Math.PI * 2); ctx.fill();
  // mouth
  ctx.strokeStyle = '#7a3a2a'; ctx.lineWidth = s * 0.02;
  ctx.beginPath(); ctx.arc(s / 2, s * 0.58, s * 0.05, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
}


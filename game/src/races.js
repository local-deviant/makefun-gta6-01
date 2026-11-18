// GOLDEN TIDE 3D — street races: named rivals, gates, live standings.
// A race is a loop of gates. Rivals drive the same loop with slightly
// different speeds and a little rubber-banding. The player wins by crossing
// every gate in order and finishing first; standings update every gate.

import * as THREE from '../vendor/three.module.min.js';
import { RACES, CHARACTERS } from './config.js';
import { dist, clamp } from './util.js';
import { buildCarMesh, createDriver, driveStep } from './vehicles.js';

export function raceById(id) {
  return RACES.find((r) => r.id === id);
}

export function createRaceState() {
  return { active: null };
}

// Start a race: spawn the rivals at the gate line, open the first gate.
export function startRace(state, scene, raceId, playerCar, onFinish) {
  const race = raceById(raceId);
  if (!race) return null;
  const start = race.gates[0];
  const rivals = race.rivals.map((who, i) => {
    const modelId = ['coupe', 'sport', 'sunsetGT'][i % 3];
    const d = createDriver(modelId, start[0] - 6 + i * 6, start[1] + 8 + i * 2, 0);
    d.mesh = buildCarMesh(modelId);
    d.mesh.position.set(d.x, 0, d.z);
    d.who = who;
    d.name = CHARACTERS[who].name;
    d.gateIdx = 0;
    d.lap = 1;
    d.speedBase = 0.86 + Math.random() * 0.1;
    d.finished = false;
    d.finishTime = 0;
    scene.add(d.mesh);
    return d;
  });
  state.active = {
    race, rivals, onFinish,
    playerGate: 0, playerLap: 1,
    time: 0, startedAt: performance.now(),
    gateMeshes: buildGateMeshes(scene, race),
    standings: [],
    finished: false,
  };
  return state.active;
}

function buildGateMeshes(scene, race) {
  const meshes = [];
  for (let i = 0; i < race.gates.length; i++) {
    const [x, z] = race.gates[i];
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x2aff7a, transparent: true, opacity: 0.85 });
    for (const s of [-3, 3]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 6, 8), mat);
      post.position.set(s, 3, 0);
      g.add(post);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.5, 0.5), mat);
    bar.position.y = 6; g.add(bar);
    // a floating chevron above the gate
    const chev = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.2, 4), new THREE.MeshBasicMaterial({ color: 0xffd700 }));
    chev.position.y = 8.4; chev.rotation.x = Math.PI; chev.rotation.y = Math.PI / 4;
    g.add(chev);
    g.position.set(x, 0, z);
    // face the next gate
    const next = race.gates[(i + 1) % race.gates.length];
    g.rotation.y = Math.atan2(next[0] - x, next[1] - z);
    g.visible = i === 0;
    scene.add(g);
    meshes.push(g);
  }
  return meshes;
}

function gatePassed(a, gate, car) {
  return dist(car.x, car.z, gate[0], gate[1]) < 7;
}

// One race tick. Returns 'won' | 'lost' | null.
export function updateRace(state, scene, playerCar, dt, collide, hooks) {
  const r = state.active;
  if (!r) return null;
  r.time += dt;

  // --- rivals drive the gate loop
  for (const rv of r.rivals) {
    if (rv.finished) continue;
    const gate = r.race.gates[rv.gateIdx];
    const want = Math.atan2(gate[0] - rv.x, gate[1] - rv.z);
    const diff = ((want - rv.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    // rubber-band: slower when ahead of the player, faster when behind
    const playerGate = r.playerGate + (r.playerLap - 1) * r.race.gates.length;
    const rvGate = rv.gateIdx + (rv.lap - 1) * r.race.gates.length;
    const band = clamp(1 + (playerGate - rvGate) * 0.03, 0.88, 1.1);
    const throttle = 0.92 * rv.speedBase * band;
    driveStep(rv, { throttle, steer: clamp(diff * 2, -1, 1), brake: false }, dt, collide);
    if (gatePassed(r, gate, rv)) {
      rv.gateIdx += 1;
      if (rv.gateIdx >= r.race.gates.length) {
        rv.gateIdx = 0;
        rv.lap += 1;
        if (rv.lap > r.race.laps) {
          rv.finished = true;
          rv.finishTime = r.time;
        }
      }
    }
  }

  // --- player gates
  const pgate = r.race.gates[r.playerGate];
  if (playerCar && gatePassed(r, pgate, playerCar)) {
    r.playerGate += 1;
    hooks.toast('Gate ' + r.playerGate + '/' + r.race.gates.length + ' — lap ' + r.playerLap);
    if (r.playerGate >= r.race.gates.length) {
      r.playerGate = 0;
      r.playerLap += 1;
      if (r.playerLap > r.race.laps) {
        return finishRace(state, scene, true, hooks);
      }
    }
    updateGateVisibility(r);
  }

  // --- standings: order by (lap, gate, distance to next gate)
  const progress = (gateIdx, lap, x, z) => {
    const gate = r.race.gates[gateIdx % r.race.gates.length];
    return (lap - 1) * r.race.gates.length + gateIdx - dist(x, z, gate[0], gate[1]) / 200;
  };
  const entries = r.rivals.map((rv) => ({
    name: rv.name, who: rv.who,
    p: rv.finished ? 9999 : progress(rv.gateIdx, rv.lap, rv.x, rv.z),
    finished: rv.finished,
  }));
  if (playerCar) {
    entries.push({
      name: 'Rio (You)', who: 'rio',
      p: progress(r.playerGate, r.playerLap, playerCar.x, playerCar.z),
      finished: false,
    });
  }
  entries.sort((a, b) => b.p - a.p);
  r.standings = entries.map((e, i) => ({ pos: i + 1, name: e.name, who: e.who }));
  hooks.standings(r.standings, r.playerLap, r.race.laps, r.time);

  // --- a rival finishing first ends the race as a loss
  if (r.rivals.some((rv) => rv.finished)) {
    return finishRace(state, scene, false, hooks);
  }
  return null;
}

function updateGateVisibility(r) {
  r.gateMeshes.forEach((g, i) => { g.visible = i === r.playerGate; });
}

function finishRace(state, scene, won, hooks) {
  const r = state.active;
  for (const g of r.gateMeshes) scene.remove(g);
  for (const rv of r.rivals) scene.remove(rv.mesh);
  const cb = r.onFinish;
  state.active = null;
  if (won) {
    hooks.toast('Race won — ' + r.race.name + '!');
    if (cb) cb();
    return 'won';
  }
  hooks.toast('Race lost — ' + r.race.name + '. Try again at the start line.');
  return 'lost';
}

export function abortRace(state, scene) {
  const r = state.active;
  if (!r) return;
  for (const g of r.gateMeshes) scene.remove(g);
  for (const rv of r.rivals) scene.remove(rv.mesh);
  state.active = null;
}

// ISLA FORTUNA — main loop. Wires the city, the player, the police, the
// missions, the races and the HUD into one playable game. Deterministic:
// one seeded RNG, fixed-step simulation, no Date.now()/Math.random() in
// gameplay. Screenshots come from REAL gameplay state via ?shot=.
import * as THREE from 'three';
import { SEED, START, GARAGE, SHOP, ECONOMY, RADIO, MISSIONS, RACES, WANTED } from './config.js';
import { makeRng, clamp, dist2d, fmtMoney } from './util.js';
import { buildCity, hitsSolid } from './city.js';
import { buildSky } from './sky.js';
import { TrafficCar, spawnParkedCars, nearestParkedCar, makeCarMesh } from './vehicles.js';
import { Player, makePlayerMesh } from './player.js';
import { Wanted } from './police.js';
import { MissionRunner } from './missions.js';
import { RaceManager } from './races.js';
import { Activities } from './activities.js';
import { AudioEngine } from './audio.js';
import { saveGame, loadGame } from './save.js';
import { HUD } from './hud.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot'); // chase | foot | race | map | null
const FIXED_DT = 1 / 60;

const rng = makeRng(SEED);
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a2a4a);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 5000);

const sky = buildSky(scene);
const city = buildCity(scene);
const hud = new HUD();
const audio = new AudioEngine();

// race-start hints (one-shot per approach, so they never spam)
let raceHintId = null;
let raceHintM4 = false;

// --- world state ---
const G = {
  time: 0, // simulation seconds
  hour: 17.5, // golden hour by default
  day: 1,
  started: false,
  paused: false,
  over: false,
  timeMode: 1, // 0 day, 1 golden hour, 2 night
  photo: false,
  speedKmh: 0,
  saveMsg: '',
};

const player = new Player(scene, START);
const wanted = new Wanted(scene, city.solids);
const missions = new MissionRunner(onMissionEvent);
const races = new RaceManager(scene, rng);
const activities = new Activities(scene, rng, city.solids);

// traffic + parked cars + pedestrians
const traffic = [];
for (let i = 0; i < 16; i++) {
  const def = { name: 'Traffic', color: [0x8a8a8a, 0x5a6a7a, 0x7a4a3a, 0x3a5a4a, 0xb8b8b8][i % 5], top: 40, accel: 16, handling: 0.8 };
  traffic.push(new TrafficCar(scene, rng, def, city.solids));
}
const parked = spawnParkedCars(scene, rng, city.solids, 26);

// pedestrians: simple figures walking the sidewalks, and witnesses.
const peds = [];
function makePedMesh(shirtColor) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc98a5a, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.85, 0.36), shirt);
  body.position.y = 1.0; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.34), skin);
  head.position.y = 1.65; g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.26), new THREE.MeshStandardMaterial({ color: 0x2b2b33, roughness: 0.9 }));
  legL.position.set(-0.15, 0.28, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.15; g.add(legR);
  g.userData = { legL, legR, phase: rng.next() * 6 };
  return g;
}
const PED_SHIRTS = [0xc96a3a, 0x2b6a8a, 0xe8c832, 0x7a2b5e, 0x4a7a3a, 0xd8d2c2];
for (let i = 0; i < 26; i++) {
  const mesh = makePedMesh(PED_SHIRTS[i % PED_SHIRTS.length]);
  const x = rng.range(-460, 460), z = rng.range(-460, 460);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  peds.push({ mesh, x, z, heading: rng.next() * Math.PI * 2, speed: rng.range(1.0, 1.9), target: null, phase: rng.next() * 6 });
}

// objective marker: a short, subtle golden pillar at the current target
const markerMat = new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false });
const marker = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 16, 10, 1, true), markerMat);
marker.position.set(START.x, 8, START.z);
scene.add(marker);
const markerBase = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.3, 18), new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.55 }));
markerBase.position.set(START.x, 0.4, START.z);
scene.add(markerBase);

// --- input ---
const input = { up: false, down: false, left: false, right: false, shift: false };
const keyMap = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'shift', ShiftRight: 'shift' };
window.addEventListener('keydown', (e) => {
  if (keyMap[e.code] != null) { input[keyMap[e.code]] = true; e.preventDefault(); }
  if (e.code === 'KeyE') onInteract();
  if (e.code === 'KeyF') onShoot();
  if (e.code === 'KeyR') onRadio();
  if (e.code === 'KeyT') onTimeToggle();
  if (e.code === 'KeyP') onPhoto();
  if (e.code === 'KeyM') onMissionKey();
  if (e.code === 'KeyY') onTaxi();
  if (e.code === 'KeyG') onRace();
  if (e.code === 'Digit1') { player.weapon = 'fist'; hud.setWeapons('fist', player.ammo); }
  if (e.code === 'Digit2') { player.weapon = 'pistol'; hud.setWeapons('pistol', player.ammo); }
  if (e.code === 'Escape') onPause();
});
window.addEventListener('keyup', (e) => {
  if (keyMap[e.code] != null) input[keyMap[e.code]] = false;
});
window.addEventListener('resize', onResize);
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
onResize();

// --- events from systems -> HUD / audio / toasts ---
function onMissionEvent(type, payload) {
  if (type === 'dialogue') {
    hud.showDialogue(payload.who, payload.text, payload.title);
  } else if (type === 'mission-start') {
    hud.toast(payload.def.chapter + ' — ' + payload.def.title + ' · ' + payload.def.place);
    audio.chime();
  } else if (type === 'mission-complete') {
    hud.toast(payload.def.title + ' COMPLETE · +' + fmtMoney(payload.def.payout));
    audio.chime();
    activities.addRespect(ECONOMY.respectPerMission);
    doSave();
  } else if (type === 'stage') {
    hud.toast('Objective: ' + payload.text);
  }
}

function onRaceEvent(type, payload) {
  if (type === 'race-start') {
    hud.toast(payload.def.name + ' — beat ' + payload.def.rival + '!');
    audio.chime();
  } else if (type === 'checkpoint') {
    hud.toast('Lap ' + payload.lap + ' / ' + payload.total);
  } else if (type === 'race-finish') {
    if (payload.won) {
      hud.toast(payload.def.name + ' WON!');
      activities.addRespect(ECONOMY.respectPerRace);
      missions.raceFinished(true);
    } else {
      hud.toast(payload.def.name + ' lost — rematch at the Strip.');
      missions.raceFinished(false);
    }
  }
}

// --- actions ---
function nearestPed(x, z, maxD) {
  let best = null, bd = maxD;
  for (const p of peds) {
    const d = dist2d(x, z, p.x, p.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function onInteract() {
  if (!G.started || G.paused) return;
  audio.ensure();
  const p = player.pos;
  // near the active mission marker and on foot: start the mission
  if (!missions.active && missions.current) {
    const def = missions.current;
    const s0 = def.stages[0];
    if (dist2d(p.x, p.z, s0.x, s0.z) < 14) { missions.start(player); return; }
  }
  // garage: respray
  if (activities.atGarage(player) && player.inCar) {
    const r = activities.respray(player, wanted);
    if (r.ok) {
      hud.toast(r.cleared ? 'Respray done — wanted cleared. -$250' : 'Respray done — car looks brand new. -$250');
      audio.chime();
    } else hud.toast('Respray: ' + r.why);
    return;
  }
  // weapon shop
  if (activities.atShop(player)) {
    const r = activities.buyPistol(player);
    if (r.ok) { hud.toast(r.what === 'pistol' ? 'Pistol bought — $400. Press 2 to equip, F to shoot.' : 'Ammo +30 — $60'); hud.setWeapons(player.weapon, player.ammo); }
    else hud.toast('Shop: ' + r.why);
    return;
  }
  // enter / exit car
  if (player.inCar) { player.exitCar(scene); return; }
  const car = nearestParkedCar(parked, p.x, p.z, 6);
  if (car) {
    const def = player.enterCar(scene, car);
    // witnesses: a ped nearby sees the theft
    const witness = nearestPed(p.x, p.z, 26);
    wanted.reportCrime(22, !!witness, p.x, p.z);
    if (witness) hud.toast('A witness saw you steal the ' + def.name + '…');
    else hud.toast('You took the ' + def.name + ' — nobody saw a thing.');
    if (wanted.changeCar()) hud.toast('New car — the cops lost a star.');
    audio.ensure();
    return;
  }
}

// Taxi fare: Y while driving. (E exits the car, so it can never start a fare.)
function onTaxi() {
  if (!G.started || G.paused || !player.inCar) return;
  audio.ensure();
  if (activities.fare) { hud.toast('Finish the current fare first.'); return; }
  activities.startFare(player, (t, pl) => {
    if (t === 'fare-start') hud.toast('Taxi fare: take them to ' + pl.dest + ' · ' + fmtMoney(pl.fare));
  });
}

// Street race: G while driving near a race's first checkpoint.
function onRace() {
  if (!G.started || G.paused || !player.inCar || races.active) return;
  const p = player.pos;
  let best = null, bd = 30;
  for (const r of RACES) {
    const d = dist2d(p.x, p.z, r.checkpoints[0][0], r.checkpoints[0][1]);
    if (d < bd) { bd = d; best = r; }
  }
  if (best) races.start(best.id, player, onRaceEvent);
  else hud.toast('No race start nearby. Find the gold rings: Strip Sprint (Avenida del Sol), Playa Norte Run, Harbor Loop (Puerto Viejo).');
}

function onShoot() {
  if (!G.started || G.paused) return;
  audio.ensure();
  const ray = player.shoot();
  if (!ray) { if (player.weapon === 'pistol') hud.toast('Out of ammo — buy more at the weapon shop.'); return; }
  audio.shot();
  hud.setWeapons(player.weapon, player.ammo);
  const res = wanted.shootHeli(ray);
  if (res === 'down') {
    hud.toast('HELICOPTER DOWN! -1 star. The island saw that.');
    audio.chime();
  } else if (res === 'hit') {
    hud.toast('Hit the helicopter! ' + (WANTED.heliHitsToDown - 1) + ' more to bring it down.');
  }
  // shooting in public draws heat
  wanted.reportCrime(10, !!nearestPed(ray.ox, ray.oz, 30), ray.ox, ray.oz);
}

function onRadio() {
  audio.ensure();
  const s = audio.nextStation();
  hud.setRadio(true, s.station.name, s.song);
  hud.toast('Radio: ' + s.station.name + ' — ' + s.song);
}
function onTimeToggle() {
  G.timeMode = (G.timeMode + 1) % 3;
  G.hour = [12, 17.5, 22][G.timeMode];
  hud.toast(['Midday', 'Golden hour', 'Night'][G.timeMode]);
}
function onPhoto() {
  G.photo = !G.photo;
  hud.setPhotoMode(G.photo);
}
function onMissionKey() {
  if (!G.started || G.paused) return;
  if (missions.active) { hud.toast(missions.objectiveText()); return; }
  const def = missions.start(player);
  if (!def) hud.toast('All missions complete. Isla Fortuna is yours.');
}
function onPause() {
  if (!G.started) return;
  if (G.paused) { hud.hidePause(); G.paused = false; }
  else { G.paused = true; hud.hideDialogue(); hud.showPause(pauseState()); }
}
function pauseState() {
  const p = player.pos;
  return {
    px: p.x, pz: p.z,
    cash: player.cash, rank: activities.respectRank(), respect: activities.respect,
    day: G.day, objective: missions.objectiveText(), completePct: completePct(),
    missionsDone: missions.done.length, racesWon: races.won.length,
    discs: activities.discs, faresDone: activities.faresDone, stars: wanted.level,
    radioOn: audio.radioOn,
    story: MISSIONS.map((m) => ({ chapter: m.chapter, title: m.title, done: missions.done.includes(m.id) })),
  };
}
function completePct() {
  return activities.completePct(missions.done.length, races.won.length);
}
function doSave() {
  saveGame({
    cash: player.cash, respect: activities.respect, missionsDone: missions.done.length,
    racesWon: races.won.length, discs: activities.discs, faresDone: activities.faresDone,
    day: G.day, hour: G.hour, x: player.pos.x, z: player.pos.z,
  });
}

// --- title / start ---
function startGame() {
  if (G.started) return;
  G.started = true;
  hud.titleEl.style.display = 'none';
  audio.ensure();
  hud.toast('Isla Fortuna — Day 1. Find Father Ortiz at the garage (M for your mission).');
  hud.showDialogue({ name: 'Father Ortiz', alias: '', age: 70, role: '', skin: '#c9a06a', hair: '#e8e8e8', shirt: '#2b2b2b', desc: '' },
    'Dante. Your brother owes El Tiburón half a million, and the week is almost gone. Come to the garage — we have work to do.',
    'CH1 — A Brother\'s Debt');
}
hud.titleBtn.addEventListener('click', startGame);
canvas.addEventListener('click', () => { if (!G.started) startGame(); });

// --- simulation step ---
function step(dt) {
  G.time += dt;
  G.hour += dt / 240; // 1 game hour per 4 real minutes
  if (G.hour >= 24) { G.hour -= 24; G.day++; }
  scene.userData.time = G.time;
  city.lightPhase(G.time);

  // player (roadblock blockers are solid for the car, like buildings)
  const drive = player.update(dt, input, city.solids, G.time, wanted.blockers);
  player.camHeading = camera.userData.heading ?? player.heading;
  G.speedKmh = drive.speed;

  // traffic
  for (const t of traffic) t.update(dt, city, traffic);
  // peds: wander the sidewalks
  for (const p of peds) {
    if (!p.target || dist2d(p.x, p.z, p.target.x, p.target.z) < 4) {
      const gx = [-460, -368, -276, -184, -92, 0, 92, 184, 276, 368, 460][Math.floor(rng.next() * 11)];
      const gz = rng.range(-460, 460);
      p.target = rng.next() < 0.5 ? { x: gx + 10, z: gz } : { x: rng.range(-460, 460), z: gx + 10 };
    }
    const wantH = Math.atan2(p.target.x - p.x, p.target.z - p.z);
    let dh = wantH - p.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    p.heading += clamp(dh, -3 * dt, 3 * dt);
    p.x += Math.sin(p.heading) * p.speed * dt;
    p.z += Math.cos(p.heading) * p.speed * dt;
    p.phase += dt * 7;
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.heading;
    p.mesh.userData.legL.rotation.x = Math.sin(p.phase) * 0.4;
    p.mesh.userData.legR.rotation.x = -Math.sin(p.phase) * 0.4;
  }

  // wanted
  const events = wanted.update(dt, player, city.solids);
  for (const e of events) {
    if (e.type === 'ram') {
      player.health = Math.max(0, player.health - 2);
      if (player.health <= 0) { hud.toast('BUSTED — the cops took you in. (Respawning at the garage.)'); player.health = 100; wanted.respray(); player.exitCar(scene); player.x = GARAGE.x; player.z = GARAGE.z; }
    } else if (e.type === 'busted') {
      hud.toast('BUSTED — the cops took you in. (Respawning at the garage.)');
      wanted.respray();
      if (player.inCar) player.exitCar(scene);
      player.x = GARAGE.x; player.z = GARAGE.z;
      player.health = 100;
    }
  }

  // missions + races + activities
  missions.update(dt, player);
  // A race stage starts its race automatically — otherwise CH4 can never begin.
  // (Only when the player is in a car; on foot, hint once so they are not stuck.)
  if (missions.active) {
    const st = missions.active.def.stages[missions.active.stage];
    if (st && st.race && !races.active) {
      if (player.inCar) { races.start(st.race, player, onRaceEvent); raceHintM4 = false; }
      else if (!raceHintM4) { raceHintM4 = true; hud.toast('Get in a car — the Midnight Grand Prix needs wheels.'); }
    }
  }
  // Free-race hint: near a race start, in a car, no race running.
  if (!races.active && player.inCar && !(missions.active && missions.active.def.stages[missions.active.stage].race)) {
    const pp = player.pos;
    let near = null;
    for (const r of RACES) {
      if (dist2d(pp.x, pp.z, r.checkpoints[0][0], r.checkpoints[0][1]) < 30) { near = r; break; }
    }
    if (near && raceHintId !== near.id) { raceHintId = near.id; hud.toast('Press G to start the ' + near.name + ' race!'); }
    else if (!near) raceHintId = null;
  }
  const raceResult = races.update(dt, player, onRaceEvent);
  if (raceResult === 'won' && missions.active) missions.raceFinished(true);
  if (raceResult === 'lost' && missions.active) missions.raceFinished(false);
  if (races.active) {
    hud.setRaceStandings(races.standings(), races.active.def.name, races.active.lap + 1, races.active.def.laps);
  } else {
    hud.setRaceStandings(null);
  }
  activities.update(dt, player, (t, pl) => {
    if (t === 'disc') hud.toast('Sun Disc ' + pl.n + '/15 · +' + fmtMoney(pl.reward));
    if (t === 'fare-pickup') hud.toast('Passenger in — drive to ' + pl.dest + '.');
    if (t === 'fare-done') hud.toast('Fare paid · +' + fmtMoney(pl.fare) + ' (' + pl.n + ' fares)');
    if (t === 'fare-start') hud.toast('Taxi fare: take them to ' + pl.dest + ' · ' + fmtMoney(pl.fare));
  });

  // objective marker
  const target = missions.active ? missions.marker : (races.active ? { x: RACES.find((r) => r.id === races.active.def.id).checkpoints[races.active.cp][0], z: RACES.find((r) => r.id === races.active.def.id).checkpoints[races.active.cp][1] } : (activities.fare ? { x: activities.fare.stage === 'pickup' ? activities.fare.px : activities.fare.dx, z: activities.fare.stage === 'pickup' ? activities.fare.pz : activities.fare.dz } : null));
  if (target) {
    marker.visible = true; markerBase.visible = true;
    marker.position.set(target.x, 8, target.z);
    markerBase.position.set(target.x, 0.4, target.z);
  } else { marker.visible = false; markerBase.visible = false; }

  // dialogue timer
  if (hud.dialogueTimer > 0) {
    hud.dialogueTimer -= dt;
    if (hud.dialogueTimer <= 0) hud.hideDialogue();
  }

  // audio
  audio.update(dt, G.speedKmh, wanted.level);

  // HUD
  const p = player.pos;
  hud.setWanted(wanted.level);
  hud.setCash(player.cash);
  hud.setRespect(activities.respectRank(), activities.respect);
  hud.setObjective(missions.objectiveText());
  hud.setClock(G.hour, G.day);
  const song = audio.currentSong();
  hud.setRadio(audio.radioOn, song.station.name, song.song);
  hud.setWeapons(player.weapon, player.ammo);
  hud.setSpeed(G.speedKmh, player.inCar ? player.inCar.def.name : null, player.inCar ? (player.inCar.condition ?? 100) : 100);
  hud.setPoliceList(wanted.unitList(player));
  hud.drawMinimap({
    px: p.x, pz: p.z, heading: player.inCar ? player.carHeading : player.heading,
    objective: target ? { x: target.x, z: target.z } : null,
    police: wanted.units.map((u) => ({ x: u.x, z: u.z, kind: u.kind })),
  });
}

// --- camera ---
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const p = player.pos;
  const heading = player.inCar ? player.carHeading : player.heading;
  const dist = player.inCar ? 13 : 8.5;
  const height = player.inCar ? 5.2 : 4.2;
  const bx = p.x - Math.sin(heading) * dist;
  const bz = p.z - Math.cos(heading) * dist;
  camTarget.set(bx, height, bz);
  camera.position.lerp(camTarget, Math.min(1, 5 * dt));
  camera.lookAt(p.x, player.inCar ? 1.6 : 1.4, p.z);
  camera.userData.heading = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
}

// --- screenshot scenes (real gameplay state) ---
function setupShot() {
  if (!SHOT) return;
  G.started = true;
  hud.titleEl.style.display = 'none';
  if (SHOT === 'chase') {
    G.hour = 17.6;
    // Dante driving a Comet GT north up Avenida del Sol (road x=0),
    // 4 stars: heli + roadblock ahead, golden hour.
    const car = parked[0];
    player.enterCar(scene, car);
    player.carHeading = Math.PI; // north (-z)
    player.carMesh.position.set(0, 0, -100);
    player.carMesh.rotation.y = player.carHeading;
    player.health = 10000; // invulnerable for the shot: the chase must not bust him
    wanted.setWanted(4, 0, -100, Math.PI);
    input.up = true;
    for (let i = 0; i < 100; i++) step(FIXED_DT); // 1.7 s of chase: roadblock still ahead, in frame
    input.up = false;
  } else if (SHOT === 'foot') {
    G.hour = 17.4;
    // Dante on the market plaza, facing north toward the fountain and the stalls.
    player.x = -40; player.z = 90;
    player.heading = Math.PI;
    player.mesh.position.set(player.x, 0, player.z);
    // peds around the fountain and the market stalls
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      peds[i].x = -60 + Math.cos(a) * 18;
      peds[i].z = 60 + Math.sin(a) * 18;
      peds[i].mesh.position.set(peds[i].x, 0, peds[i].z);
    }
    hud.showDialogue({ name: 'Isabella Torres', alias: 'Bella', age: 26, role: '', skin: '#b87a4a', hair: '#3a1a10', shirt: '#7a2b5e', desc: '' },
      'The bug is in the warehouse, Dante. Draw them to the Shipyard and hold them there — then vanish. Change cars, or respray. You know the drill.',
      'CH3 — Smoke and Mirrors');
    for (let i = 0; i < 60; i++) step(FIXED_DT);
  } else if (SHOT === 'race') {
    G.hour = 18.2;
    // Strip Sprint: a fast car on road x=0, heading north toward checkpoint (0,-184).
    // Pick a sporty parked car so the shot reads as a race, not a van.
    const car = parked.find((c) => c.def.name === 'Comet GT' || c.def.name === 'Falco Sport') || parked[1];
    player.enterCar(scene, car);
    player.carHeading = Math.PI;
    player.carMesh.position.set(0, 0, -120);
    player.carMesh.rotation.y = player.carHeading;
    races.start('strip', player, onRaceEvent);
    // Stage the rival ahead for the shot (shot-only: the real race starts side by side).
    if (races.active) {
      races.active.rival.x = player.pos.x + 6;
      races.active.rival.z = player.pos.z - 55;
      races.active.rival.mesh.position.set(races.active.rival.x, 0, races.active.rival.z);
    }
    // fast-forward briefly: the rival (55 m ahead) stays in frame.
    input.up = true;
    for (let i = 0; i < 90; i++) {
      step(FIXED_DT);
    }
    input.up = false;
  } else if (SHOT === 'map') {
    G.hour = 17.5;
    // Stage honest early-game progress so the map shows a real % COMPLETE.
    missions.done = ['m1'];
    missions.index = 1;
    player.cash = 950;
    activities.discs = 5;
    activities.faresDone = 2;
    activities.respect = 17;
    for (let i = 0; i < 5; i++) { if (activities.discMeshes[i]) { activities.discMeshes[i].got = true; activities.discMeshes[i].mesh.visible = false; } }
    missions.start(player);
    hud.hideDialogue();
    G.paused = true;
    hud.showPause(pauseState());
    for (let i = 0; i < 30; i++) step(FIXED_DT);
  }
  updateCamera(1);
  sky.setTime(G.hour, player.pos);
  renderer.render(scene, camera);
  window.__shotReady = true;
}

// --- main loop ---
let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (SHOT) return; // shot scenes render once in setupShot
  if (!G.started || G.paused) {
    // still render the world behind the title / pause
    sky.setTime(G.hour, player.pos);
    updateCamera(dt);
    renderer.render(scene, camera);
    return;
  }
  acc += dt;
  let n = 0;
  while (acc >= FIXED_DT && n < 5) {
    step(FIXED_DT);
    acc -= FIXED_DT;
    n++;
  }
  sky.setTime(G.hour, player.pos);
  updateCamera(dt);
  renderer.render(scene, camera);
}

// boot
sky.setTime(G.hour, START);
updateCamera(1);
renderer.render(scene, camera);
if (SHOT) {
  setupShot();
} else {
  requestAnimationFrame(frame);
}
window.__game = { G, player, wanted, missions, races, activities, city, step, parked, traffic, peds, renderer };

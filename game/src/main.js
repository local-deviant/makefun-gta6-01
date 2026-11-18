// GOLDEN TIDE 3D — bootstrap, game loop, input and the game state.
// Wires every module together: city, sky, vehicles, player, police,
// missions, races, activities, audio, save and HUD. The game has three
// states: title (orbiting camera), playing, paused (menu tabs).

import * as THREE from '../vendor/three.module.min.js';
import { GAME_TITLE, CITY_NAME, DAY_LENGTH_SEC, START_HOUR, MISSIONS, RACES, WEAPONS, RADIO, CAR_MODELS, GRID_MIN, GRID_MAX } from './config.js';
import { clamp, lerp, dist, mulberry32, fmtClock } from './util.js';
import { buildCity } from './city.js';
import { createSky, sunDirection } from './sky.js';
import { buildCarMesh, createDriver, driveStep, createTraffic, updateTraffic, createPedestrians, updatePedestrians } from './vehicles.js';
import { createPlayer, walkStep, nearestCar, enterCar, exitCar, shoot, createCameraRig, createBeacon } from './player.js';
import { createPolice, addHeat, updatePolice, starsFromHeat, policeList } from './police.js';
import { createMissionState, nextMission, startMission, updateMission, abortMission, say, advanceDialog, currentLine, createDialog } from './missions.js';
import { createRaceState, startRace, updateRace, abortRace } from './races.js';
import { createActivities, buildActivityMarkers, updateActivities, nearestShop, buyWeapon, completionPercent } from './activities.js';
import { createAudio, ensureAudio, setEngine, setSiren, playShot, playBlip, playCash, startRadio, stopRadio, setMuted } from './audio.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { createHUD, updateHUD, drawMap, routeOnRoads, toast, showDialog, hideDialog, showTitle, hideTitle, showPause, hidePause, fillStats, fillStory, centerMessage } from './hud.js';

// ---------------------------------------------------------------------------
// Collision: circle (x, z, r) against building AABBs + the island edge.
// When the circle is outside a box, push it out along the closest point;
// when its centre is already inside a box, push it out along the shallowest
// side (a plain closest-point test leaves an inside circle stuck, since the
// closest point is itself and the push direction is zero).
function makeCollider(colliders) {
  return (x, z, r) => {
    let hit = false;
    for (const b of colliders) {
      const cx = clamp(x, b.minX, b.maxX);
      const cz = clamp(z, b.minZ, b.maxZ);
      const dx = x - cx, dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = r - d;
          x += (dx / d) * push;
          z += (dz / d) * push;
        } else {
          const pl = x - b.minX, pr = b.maxX - x, pt = z - b.minZ, pb = b.maxZ - z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) x = b.minX - r;
          else if (m === pr) x = b.maxX + r;
          else if (m === pt) z = b.minZ - r;
          else z = b.maxZ + r;
        }
        hit = true;
      }
    }
    const ex = clamp(x, -735, 735), ez = clamp(z, -735, 735);
    if (ex !== x || ez !== z) { x = ex; z = ez; hit = true; }
    return { x, z, hit };
  };
}

const RADIO_SONGS = [
  ['Sol de Medianoche', 'La Marea', 'Calle Ocho', 'Fuego Lento'],
  ['Midnight Drive', 'Neon Palms', 'Chrome Hearts', 'Sunset Run'],
  ['Harbor Lights', 'Gasoline', 'Rooftop Kings', 'Night Shift'],
  ['Tide Pools', 'Golden Hour', 'Salt Air', 'Slow Wave'],
];

export function createGame() {
  const save = loadSave();
  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 4200);

  const city = buildCity(scene);
  const sky = createSky(scene, renderer);
  const collide = makeCollider(city.colliders);
  // player headlights: a spotlight that follows the car at night/dusk
  const headlight = new THREE.SpotLight(0xfff2c8, 0, 70, 0.55, 0.5, 1.1);
  scene.add(headlight);
  scene.add(headlight.target);
  const player = createPlayer(0, 200);
  player.mesh.position.set(player.x, 0, player.z);
  scene.add(player.mesh);
  const rig = createCameraRig(camera);
  const beacon = createBeacon(scene);
  const police = createPolice();
  const missions = createMissionState(save);
  const races = createRaceState();
  const acts = createActivities(save);
  const audio = createAudio();
  const dialog = createDialog();

  const rng = mulberry32(99);
  const traffic = createTraffic(22, rng);
  for (const c of traffic) scene.add(c.mesh);
  const peds = createPedestrians(34, rng);
  for (const p of peds) scene.add(p.mesh);
  buildActivityMarkers(scene, acts);

  // Parked cars the player can steal (model, x, z, heading).
  // All sit on a road edge / sidewalk, never inside a building block.
  const parked = [];
  const parkedDefs = [
    { model: 'taxi', x: 9, z: 196, h: 0 },
    { model: 'sedan', x: -109, z: 0, h: Math.PI / 2 },
    { model: 'coupe', x: 250, z: -109, h: -Math.PI / 2 },
    { model: 'truck', x: 300, z: 209, h: Math.PI },
    { model: 'sport', x: -109, z: -250, h: 0 },
    { model: 'sunsetGT', x: 307, z: -300, h: Math.PI / 2 },
    { model: 'sedan', x: 108, z: 350, h: 0 },
  ];
  for (const d of parkedDefs) {
    const c = createDriver(d.model, d.x, d.z, d.h);
    c.mesh = buildCarMesh(d.model, { taxi: d.model === 'taxi' });
    c.mesh.position.set(d.x, 0, d.z);
    c.mesh.rotation.y = d.h;
    c.parked = true;
    scene.add(c.mesh);
    parked.push(c);
  }
  // Viper gang cars (mission 5 targets) parked along the La Vega curb
  const viperCars = [];
  for (let i = 0; i < 3; i++) {
    const c = createDriver('coupe', -309, -380 + i * 30, Math.PI / 2);
    c.mesh = buildCarMesh('coupe');
    c.mesh.children.forEach(() => {});
    c.mesh.position.set(c.x, 0, c.z);
    c.mesh.rotation.y = c.heading;
    c.isViper = true;
    c.health = 100;
    c.wrecked = false;
    // repaint them Viper red
    c.mesh.traverse((o) => {
      if (o.isMesh && o.material && o.material.color) o.material = o.material.clone();
    });
    scene.add(c.mesh);
    viperCars.push(c);
  }

  const G = {
    title: GAME_TITLE, cityName: CITY_NAME,
    renderer, scene, camera, canvas,
    city, sky, collide, player, rig, beacon, police, missions, races, acts, audio, dialog, headlight,
    traffic, peds, parked, viperCars,
    save, rng,
    state: 'title', // 'title' | 'playing' | 'paused'
    hour: START_HOUR, day: 1,
    playMinutes: save.playMinutes || 0,
    stars: 0, policeList: [],
    route: null, beaconPos: null,
    wrecks: 0,
    radioStationName: 'Radio Dorada', radioSong: 'Sol de Medianoche',
    keys: {}, mouse: { x: 0, y: 0, down: false },
    shotMode: null,
    ui: null, hud: null,
    lastSave: 0,
    t: 0,
  };

  G.hud = createHUD(G);
  G.ui = createUI(G);
  return G;
}

// ---------------------------------------------------------------------------
// UI object: pause tabs, resume, title. (Referenced by hud.js as G.ui.)
// ---------------------------------------------------------------------------
function createUI(G) {
  return {
    showPauseTab(tab) {
      for (const t of ['map', 'stats', 'story', 'settings']) {
        const btn = document.getElementById('tab' + t[0].toUpperCase() + t.slice(1));
        const pane = document.getElementById('pane' + t[0].toUpperCase() + t.slice(1));
        if (btn) btn.classList.toggle('active', t === tab);
        if (pane) pane.style.display = t === tab ? 'block' : 'none';
      }
      // the header % is live on every tab (it used to stay at its 0% default
      // on the map tab, because only the stats tab refreshed it)
      if (G.hud.el.completePct) G.hud.el.completePct.textContent = completionPercent(G.save) + '% COMPLETE';
      if (tab === 'map') {
        const cv = document.getElementById('bigMap');
        if (cv) drawMap(cv.getContext('2d'), G, cv.width, { labels: true });
      }
      if (tab === 'stats') fillStats(G);
      if (tab === 'story') fillStory(G);
      if (tab === 'settings') fillSettings(G);
    },
    resumeGame() {
      hidePause(G);
      G.state = 'playing';
    },
    toTitle() {
      hidePause(G);
      G.state = 'title';
      showTitle(G);
    },
  };
}

function fillSettings(G) {
  const pane = document.getElementById('paneSettings');
  if (!pane) return;
  const s = G.save.settings;
  pane.innerHTML =
    '<div class="setting"><span>Volume</span><input id="setVolume" type="range" min="0" max="100" value="' + Math.round((s.volume ?? 0.7) * 100) + '"></div>' +
    '<div class="setting"><span>Muted</span><input id="setMuted" type="checkbox"' + (s.muted ? ' checked' : '') + '></div>' +
    '<div class="setting"><span>Shadows</span><input id="setShadows" type="checkbox"' + (s.shadows !== false ? ' checked' : '') + '></div>' +
    '<div class="setting"><span>Reset save</span><button id="resetSaveBtn">Reset progress</button></div>';
  const vol = document.getElementById('setVolume');
  if (vol) vol.addEventListener('input', () => { G.save.settings.volume = vol.value / 100; G.audio.volume = vol.value / 100; if (G.audio.master) G.audio.master.gain.value = G.save.settings.muted ? 0 : vol.value / 100; });
  const mut = document.getElementById('setMuted');
  if (mut) mut.addEventListener('change', () => { G.save.settings.muted = mut.checked; setMuted(G.audio, mut.checked); });
  const sh = document.getElementById('setShadows');
  if (sh) sh.addEventListener('change', () => { G.save.settings.shadows = sh.checked; G.renderer.shadowMap.enabled = sh.checked; });
  const rs = document.getElementById('resetSaveBtn');
  if (rs) rs.addEventListener('click', () => { clearSave(); location.reload(); });
}

// ---------------------------------------------------------------------------
// Mission / race / activity hooks (the glue the modules call back into).
// ---------------------------------------------------------------------------
function makeHooks(G) {
  return {
    say(who, lines) {
      say(G.dialog, who, lines);
      const line = currentLine(G.dialog);
      if (line) showDialog(G.hud, line.who, line.text);
    },
    objective(text) {
      const el = document.getElementById('objective');
      if (el) el.textContent = text ? '◆ ' + text : '';
    },
    beacon(x, z) {
      G.beacon.show(x, z);
      G.beaconPos = { x, z };
      const px = G.player.inCar ? G.player.inCar.x : G.player.x;
      const pz = G.player.inCar ? G.player.inCar.z : G.player.z;
      G.route = routeOnRoads(px, pz, x, z);
    },
    beaconHide() {
      G.beacon.hide();
      G.beaconPos = null;
      G.route = null;
    },
    payout(cash, respect, title) {
      G.save.cash += cash;
      G.acts.respect += respect;
      G.save.respect = G.acts.respect;
      G.save.missionsDone = [...G.missions.done];
      playCash(G.audio);
      toast(G.hud, 'Mission complete: ' + title + ' — +' + cash + ' · +' + respect + ' respect');
      centerMessage(G.hud, 'MISSION COMPLETE — ' + title);
      writeSave(G.save);
    },
    collectDisc(id, total) {
      G.save.cash += 50;
      G.acts.respect += 1;
      G.save.respect = G.acts.respect;
      G.save.collectibles = [...G.acts.collected];
      playCash(G.audio);
      toast(G.hud, 'Sun Disc ' + total + '/15 — +$50');
      writeSave(G.save);
    },
    fareDone(reward, total) {
      G.save.cash += reward;
      G.save.faresDone = total;
      playCash(G.audio);
      toast(G.hud, 'Fare complete — +$' + reward + ' (' + total + ' fares)');
      writeSave(G.save);
    },
    toast(text) { toast(G.hud, text); },
    standings(list, lap, laps, time) { /* HUD reads G.races.active directly */ },
    startRace(raceId, onWin) {
      const car = G.player.inCar;
      if (!car) return;
      startRace(G.races, G.scene, raceId, car, onWin);
      toast(G.hud, 'Race started — first to the finish wins');
    },
    setHeat(heat) {
      G.police.heat = heat;
    },
  };
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
function bindInput(G) {
  const keys = G.keys;
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.code === 'Enter') {
      if (G.state === 'title') { startPlaying(G); return; }
      if (G.dialog.current) {
        if (!advanceDialog(G.dialog)) { hideDialog(G.hud); }
        else { const line = currentLine(G.dialog); if (line) showDialog(G.hud, line.who, line.text); }
      }
    }
    if (e.code === 'KeyE') tryInteract(G);
    if (e.code === 'KeyR') cycleRadio(G);
    if (e.code === 'KeyV') { G.rig.mode = G.rig.mode === 'top' ? 'chase' : 'top'; }
    if (e.code === 'KeyF') tryShoot(G);
    if (e.code === 'Digit1') equipWeapon(G, 'pistol');
    if (e.code === 'Digit2') equipWeapon(G, 'smg');
    if (e.code === 'Digit3') equipWeapon(G, 'shotgun');
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (G.state === 'playing') { G.state = 'paused'; showPause(G, 'map'); }
      else if (G.state === 'paused') { G.ui.resumeGame(); }
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  G.canvas.addEventListener('mousedown', (e) => {
    G.mouse.down = true;
    G.mouse.x = e.clientX; G.mouse.y = e.clientY;
    ensureAudio(G.audio);
    if (G.state === 'playing' && !G.player.inCar) tryShoot(G);
    if (G.dialog.current) {
      if (!advanceDialog(G.dialog)) hideDialog(G.hud);
      else { const line = currentLine(G.dialog); if (line) showDialog(G.hud, line.who, line.text); }
    }
  });
  G.canvas.addEventListener('mousemove', (e) => {
    if (G.mouse.down && !G.player.inCar) {
      G.rig.yaw -= (e.movementX || 0) * 0.004 * (G.save.settings.sensitivity || 1);
    }
  });
  window.addEventListener('mouseup', () => { G.mouse.down = false; });
  window.addEventListener('resize', () => {
    G.camera.aspect = window.innerWidth / window.innerHeight;
    G.camera.updateProjectionMatrix();
    G.renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function tryInteract(G) {
  const p = G.player;
  if (G.state !== 'playing') return;
  // near a mission start marker?
  const next = nextMission(G.missions);
  if (!G.missions.active && next) {
    const s = next.stages[0];
    const px = p.inCar ? p.inCar.x : p.x;
    const pz = p.inCar ? p.inCar.z : p.z;
    if (dist(px, pz, s.x, s.z) < 16) {
      startMission(G.missions, next, makeHooks(G));
      return;
    }
  }
  // enter / exit a car
  if (p.inCar) {
    exitCar(p, G.scene);
    return;
  }
  const car = nearestCar(p, [...G.parked, ...G.traffic, ...G.viperCars], 5.5);
  if (car) {
    const wasParked = car.parked || car.isViper;
    enterCar(p, car, G.scene);
    if (wasParked) {
      addHeat(G.police, 18);
      toast(G.hud, 'Car stolen — the cops noticed (+heat)');
    }
    if (car.parked) {
      car.parked = false;
      const i = G.parked.indexOf(car);
      if (i >= 0) G.parked.splice(i, 1);
    }
    // a stolen traffic car stops being traffic: without this the traffic AI
    // keeps driving it every frame and fights the player's input
    const ti = G.traffic.indexOf(car);
    if (ti >= 0) G.traffic.splice(ti, 1);
    playBlip(G.audio, 520, 0.1);
  }
}

function tryShoot(G) {
  const p = G.player;
  if (G.state !== 'playing' || p.inCar) return;
  // aim at the mouse position on the ground plane
  const ndc = new THREE.Vector2((G.mouse.x / window.innerWidth) * 2 - 1, -(G.mouse.y / window.innerHeight) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, G.camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1);
  const aim = new THREE.Vector3();
  ray.ray.intersectPlane(plane, aim);
  if (!aim) return;
  const targets = [...G.traffic, ...G.viperCars, ...G.police.cruisers, ...G.peds.map((pd) => ({ x: pd.x, z: pd.z, health: 100 }))];
  const res = shoot(p, aim, WEAPONS, targets, performance.now() / 1000);
  if (res === 'empty') { toast(G.hud, 'Out of ammo — buy more at Iron & Lead'); return; }
  if (!res) return;
  playShot(G.audio);
  addHeat(G.police, 8);
  // tracer line
  const from = new THREE.Vector3(p.x, 1.5, p.z);
  const to = res.target ? new THREE.Vector3(res.target.x, 1.2, res.target.z) : aim.clone().setY(1.2);
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe970, transparent: true, opacity: 0.9 }));
  G.scene.add(line);
  setTimeout(() => G.scene.remove(line), 90);
  if (res.target && res.target.isViper && res.target.health <= 0 && !res.target.wrecked) {
    res.target.wrecked = true;
    G.wrecks += 1;
    res.target.mesh.rotation.z = 0.12;
    toast(G.hud, 'Viper car wrecked (' + G.wrecks + '/3)');
  }
  if (res.target && res.killed && res.target.isPolice) {
    addHeat(G.police, 25);
  }
}

function equipWeapon(G, id) {
  if (!G.player.ownedWeapons.includes(id)) { toast(G.hud, 'You do not own that weapon — visit Iron & Lead'); return; }
  G.player.weapon = id;
  playBlip(G.audio, 660, 0.07);
}

function cycleRadio(G) {
  ensureAudio(G.audio);
  const idx = (G.audio.radioStation + 1) % RADIO.length;
  startRadio(G.audio, idx);
  G.radioStationName = RADIO[idx].name;
  G.radioSong = RADIO_SONGS[idx][Math.floor(Math.random() * 4)];
  toast(G.hud, '♪ ' + G.radioStationName + ' — ' + G.radioSong);
}

// ---------------------------------------------------------------------------
// Busted / wrecked
// ---------------------------------------------------------------------------
function onBusted(G) {
  const fine = Math.max(50, Math.floor(G.save.cash * 0.15));
  G.save.cash -= fine;
  G.police.heat = 0;
  G.stars = 0;
  if (G.player.inCar) {
    const car = G.player.inCar;
    exitCar(G.player, G.scene);
    car.health = 40;
  }
  G.player.x = -300; G.player.z = -90;
  G.player.mesh.position.set(-300, 0, -90);
  toast(G.hud, 'BUSTED — fined $' + fine + '. The cops let you go at the station.');
  centerMessage(G.hud, 'BUSTED');
  writeSave(G.save);
}

// ---------------------------------------------------------------------------
// Shot setups (for screenshots): ?shot=chase|foot|race|map
// ---------------------------------------------------------------------------
function setupShot(G, shot) {
  const hooks = makeHooks(G);
  if (shot === 'chase') {
    G.hour = 17.5;
    const car = G.parked.find((c) => c.modelId === 'sunsetGT') || G.parked[0];
    const i = G.parked.indexOf(car);
    if (i >= 0) G.parked.splice(i, 1);
    car.x = 0; car.z = 180; car.heading = Math.PI; car.speed = 22;
    car.mesh.position.set(0, 0, 180);
    enterCar(G.player, car, G.scene);
    // heat 70 sits mid-band for 4 stars (61..80), so the HUD reliably
    // shows the four stars the dialog below talks about
    G.police.heat = 70;
    // cruisers in pursuit, on the same road
    for (let k = 0; k < 3; k++) {
      const c = createDriver('police', (k - 1) * 4, 140 - k * 12, Math.PI);
      c.mesh = buildCarMesh('police', { police: true });
      c.mesh.position.set(c.x, 0, c.z);
      c.isPolice = true; c.callSign = 'UNIT-' + (12 + k * 3); c.action = 'Pursuing';
      G.scene.add(c.mesh);
      G.police.cruisers.push(c);
    }
    const m3 = MISSIONS[2];
    startMission(G.missions, m3, hooks);
    G.missions.active.stageIdx = 1;
    hooks.objective(m3.stages[1].label);
    hooks.beacon(-300, -100);
    say(G.dialog, 'marisol', ['Four stars and the whole city behind you. Do not stop, Rio.']);
    const line = currentLine(G.dialog);
    if (line) showDialog(G.hud, line.who, line.text);
    startRadio(G.audio, 1);
    G.radioStationName = RADIO[1].name; G.radioSong = 'Midnight Drive';
  } else if (shot === 'foot') {
    G.hour = 14;
    G.player.x = -300; G.player.z = -380; G.player.heading = Math.PI;
    G.player.mesh.position.set(-300, 0, -380);
    G.police.heat = 45;
    const m5 = MISSIONS[4];
    startMission(G.missions, m5, hooks);
    hooks.beacon(-309, -350);
    say(G.dialog, 'luna', ['The Vipers are right there. Make it loud, Rio.']);
    const line = currentLine(G.dialog);
    if (line) showDialog(G.hud, line.who, line.text);
    const c = createDriver('police', -300, -350, Math.PI);
    c.mesh = buildCarMesh('police', { police: true });
    c.mesh.position.set(c.x, 0, c.z);
    c.isPolice = true; c.callSign = 'UNIT-07'; c.action = 'Pursuing';
    G.scene.add(c.mesh);
    G.police.cruisers.push(c);
  } else if (shot === 'race') {
    G.hour = 19.5;
    const car = G.parked.find((c) => c.modelId === 'sport') || G.parked[0];
    const i = G.parked.indexOf(car);
    if (i >= 0) G.parked.splice(i, 1);
    // mid-race: lap 2, approaching gate 4 (0,-200) on the x=0 road at night
    car.x = 0; car.z = -180; car.heading = Math.PI; car.speed = 30;
    car.mesh.position.set(0, 0, -180);
    enterCar(G.player, car, G.scene);
    startRace(G.races, G.scene, 'strip', car, () => {});
    G.races.active.playerLap = 2;
    G.races.active.playerGate = 4;
    G.races.active.time = 62.4;
    // pull the rivals up to the player's gate so they are visible in frame
    const gate = RACES.find((r) => r.id === 'strip').gates[4];
    G.races.active.rivals.forEach((rv, k) => {
      rv.x = gate[0] + (k - 1) * 6; rv.z = gate[1] + 18 + k * 8; rv.heading = Math.PI;
      rv.mesh.position.set(rv.x, 0, rv.z);
      rv.gateIdx = 4; rv.lap = 2;
    });
    startRadio(G.audio, 1);
    G.radioStationName = RADIO[1].name; G.radioSong = 'Neon Palms';
  } else if (shot === 'map') {
    G.hour = 17.5;
    // stage a mid-game save so the pause screen shows real progress:
    // CH1-3 done, the Strip race won, 5 Sun Discs, 2 fares = 11/30 (37%)
    const doneMissions = ['m1', 'm2', 'm3'];
    const discs = ['disc01', 'disc02', 'disc03', 'disc04', 'disc05'];
    G.save.missionsDone = [...doneMissions];
    G.save.collectibles = [...discs];
    G.save.racesWon = 1;
    G.save.faresDone = 2;
    G.save.respect = 9;   // m1 2 + m2 3 + m3 4
    G.save.cash = 2670;   // 250 + 200 + 400 + 600 + 800 + 180 + 240
    for (const m of doneMissions) G.missions.done.add(m);
    for (const d of discs) {
      G.acts.collected.add(d);
      const dm = G.acts.discMeshes.find((x) => x.id === d);
      if (dm) dm.mesh.removeFromParent();
    }
    G.acts.discMeshes = G.acts.discMeshes.filter((x) => !G.acts.collected.has(x.id));
    G.acts.racesWon = 1; G.acts.faresDone = 2; G.acts.respect = 9;
    // refresh the top-left HUD too (the game is paused, so the normal
    // per-frame HUD update never runs after staging)
    updateHUD(G);
    G.state = 'paused';
    showPause(G, 'map');
  }
}

// ---------------------------------------------------------------------------
// Start / loop
// ---------------------------------------------------------------------------
function startPlaying(G) {
  ensureAudio(G.audio);
  hideTitle(G);
  hideDialog(G.hud);
  G.state = 'playing';
  const next = nextMission(G.missions);
  if (next && !G.missions.active) {
    const s = next.stages[0];
    makeHooks(G).beacon(s.x, s.z);
    toast(G.hud, 'Next job: CH ' + next.chapter + ' — ' + next.title + '. Follow the gold marker, press E to start.');
  }
  if (!G.audio.radioOn) {
    startRadio(G.audio, 0);
    G.radioStationName = RADIO[0].name; G.radioSong = 'Sol de Medianoche';
  }
}

function tick(G, now) {
  requestAnimationFrame((t) => tick(G, t));
  const dt = Math.min((now - (G._last || now)) / 1000, 0.05);
  G._last = now;
  G.t += dt;
  const hooks = makeHooks(G);

  // clock
  if (G.state === 'playing') {
    G.hour += (dt / DAY_LENGTH_SEC) * 24;
    if (G.hour >= 24) { G.hour -= 24; G.day += 1; }
    G.playMinutes += dt / 60;
  }

  // --- title orbit camera
  if (G.state === 'title') {
    const a = G.t * 0.03;
    G.camera.position.set(Math.sin(a) * 420, 150, Math.cos(a) * 420);
    G.camera.lookAt(0, 10, 0);
    G.sky.update(G.hour, { x: 0, z: 0 }, G.city.lampHeads, dt);
    G.renderer.render(G.scene, G.camera);
    return;
  }
  if (G.state === 'paused') {
    G.renderer.render(G.scene, G.camera);
    return;
  }

  // --- input -> player
  const p = G.player;
  const k = G.keys;
  if (p.inCar) {
    // in shot mode the car drives itself so screenshots catch it moving
    const auto = G.shotMode ? { throttle: 1, steer: 0, brake: false } : null;
    const input = auto || {
      throttle: (k.KeyW || k.ArrowUp ? 1 : 0) + (k.KeyS || k.ArrowDown ? -0.6 : 0),
      steer: (k.KeyA || k.ArrowLeft ? -1 : 0) + (k.KeyD || k.ArrowRight ? 1 : 0),
      brake: !!k.Space,
    };
    driveStep(p.inCar, input, dt, G.collide);
    // car vs car bumps (roadblock cars count too: they are what stops you)
    const roadblockCars = G.police.roadblocks.flatMap((rb) => rb.cars);
    for (const other of [...G.traffic, ...G.parked, ...G.viperCars, ...G.police.cruisers, ...roadblockCars]) {
      if (other === p.inCar) continue;
      const d = dist(p.inCar.x, p.inCar.z, other.x, other.z);
      if (d < 4.6 && d > 0.01) {
        const push = Math.atan2(p.inCar.x - other.x, p.inCar.z - other.z);
        p.inCar.x += Math.sin(push) * dt * 8;
        p.inCar.z += Math.cos(push) * dt * 8;
        if (other.isPolice) addHeat(G.police, 4);
        if (other.isRoadblock) {
          // a roadblock is a wall, not a nudge: stop the car dead on the
          // line, push it back out of the overlap so it cannot creep
          // through, and dent it for ramming a police line
          const sep = 4.6 - d;
          p.inCar.x += Math.sin(push) * sep;
          p.inCar.z += Math.cos(push) * sep;
          p.inCar.speed = 0;
          p.inCar.health = Math.max(0, p.inCar.health - dt * 6);
        }
        if (other.isViper && Math.abs(p.inCar.speed) > 14) {
          other.health -= 30;
          if (other.health <= 0 && !other.wrecked) {
            other.wrecked = true; G.wrecks += 1;
            other.mesh.rotation.z = 0.12;
            toast(G.hud, 'Viper car wrecked (' + G.wrecks + '/3)');
          }
        }
      }
    }
    // wrecked car
    if (p.inCar.health <= 0) {
      const car = p.inCar;
      exitCar(p, G.scene);
      car.mesh.rotation.z = 0.1;
      toast(G.hud, 'Your car is wrecked!');
      if (G.stars > 0) onBusted(G);
    }
    // speeding near police adds heat
    if (Math.abs(p.inCar.speed) > 26) {
      for (const c of G.police.cruisers) {
        if (dist(c.x, c.z, p.inCar.x, p.inCar.z) < 30) { addHeat(G.police, dt * 1.5); break; }
      }
    }
  } else {
    const input = {
      forward: !!(k.KeyW || k.ArrowUp),
      back: !!(k.KeyS || k.ArrowDown),
      left: !!(k.KeyA || k.ArrowLeft),
      right: !!(k.KeyD || k.ArrowRight),
      run: !!k.ShiftLeft,
      camHeading: G.rig.yaw,
    };
    walkStep(p, input, dt, G.collide);
    // running into a pedestrian adds heat
    for (const pd of G.peds) {
      if (dist(p.x, p.z, pd.x, pd.z) < 1.2) addHeat(G.police, 2);
    }
  }

  // camera yaw follows the car on the road; on foot it is free (mouse)
  if (p.inCar) G.rig.yaw = p.inCar.heading;

  // --- world systems
  updateTraffic(G.traffic, dt, G.collide, p.inCar);
  updatePedestrians(G.peds, dt, G.t, { x: p.inCar ? p.inCar.x : p.x, z: p.inCar ? p.inCar.z : p.z }, G.collide);
  G.stars = updatePolice(G.police, G.scene, p, dt, G.t, G.collide, () => onBusted(G));
  const px = p.inCar ? p.inCar.x : p.x;
  const pz = p.inCar ? p.inCar.z : p.z;
  G.policeList = policeList(G.police, px, pz);
  setSiren(G.audio, G.police.cruisers.length > 0, G.t);
  setEngine(G.audio, p.inCar ? Math.abs(p.inCar.speed) / p.inCar.model.topSpeed : 0, !!p.inCar);

  // missions
  if (G.missions.active) {
    const res = updateMission(G.missions, { player: p, wantedStars: G.stars, wrecks: G.wrecks }, hooks);
    if (res === 'done') {
      const next = nextMission(G.missions);
      if (next) {
        const s = next.stages[0];
        hooks.beacon(s.x, s.z);
        toast(G.hud, 'Next job: CH ' + next.chapter + ' — ' + next.title + '. Follow the gold marker, press E to start.');
      }
    }
  } else {
    // show the next job's start marker
    const next = nextMission(G.missions);
    if (next) {
      const s = next.stages[0];
      hooks.beacon(s.x, s.z);
      if (dist(px, pz, s.x, s.z) < 16) {
        const el = document.getElementById('objective');
        if (el) el.textContent = '◆ Press E — start CH ' + next.chapter + ': ' + next.title;
      }
    }
  }

  // races
  if (G.races.active) {
    updateRace(G.races, G.scene, p.inCar, dt, G.collide, hooks);
  }

  // activities
  updateActivities(G.acts, G.scene, p, dt, G.t, hooks);

  // shops: near a shop, show the prompt; E opens the buy (weapons only here)
  const shop = nearestShop(px, pz, 14);
  if (shop && !p.inCar && G.state === 'playing') {
    const el = document.getElementById('objective');
    if (el && !G.missions.active) el.textContent = '◆ ' + shop.name + ' — press B to browse';
    if (G.keys.KeyB) {
      G.keys.KeyB = false;
      if (shop.kind === 'weapons') {
        const res = buyWeapon(p, G.save.cash, p.weapon === 'pistol' ? 'smg' : 'shotgun');
        if (res.ok) { G.save.cash -= res.spent; toast(G.hud, res.note + ' (-$' + res.spent + ')'); writeSave(G.save); }
        else toast(G.hud, 'Cannot buy: ' + res.why);
      } else if (shop.kind === 'garage') {
        if (G.save.cash >= 100) { G.save.cash -= 100; toast(G.hud, 'Car repaired (-$100)'); writeSave(G.save); }
        else toast(G.hud, 'Not enough cash to repair ($100)');
      } else {
        toast(G.hud, shop.name + ' — new stock arrives with the next chapter');
      }
    }
  }

  // sky + beacon + camera + HUD
  G.sky.update(G.hour, { x: px, z: pz }, G.city.lampHeads, dt);
  G.beacon.update(G.t);
  G.city.waterTex.offset.x += dt * 0.008;
  G.city.waterTex.offset.y += dt * 0.005;
  G.rig.update(p, dt);
  // keep the camera out of buildings (a chase camera behind a car at a
  // corner can otherwise swing inside a block and go black)
  const cc = G.collide(G.camera.position.x, G.camera.position.z, 2);
  G.camera.position.x = cc.x; G.camera.position.z = cc.z;
  // headlights on at night/dusk while driving
  const night = G.hour < 6.5 || G.hour > 18;
  if (p.inCar && night) {
    const c = p.inCar;
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    G.headlight.position.set(c.x + fx * 2, 1.2, c.z + fz * 2);
    G.headlight.target.position.set(c.x + fx * 30, 0, c.z + fz * 30);
    G.headlight.intensity = 500;
  } else {
    G.headlight.intensity = 0;
  }
  updateHUD(G, dt);

  // autosave every 20 s
  if (G.t - G.lastSave > 20) {
    G.lastSave = G.t;
    G.save.playMinutes = G.playMinutes;
    writeSave(G.save);
  }

  G.renderer.render(G.scene, G.camera);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
export function boot() {
  const G = createGame();
  bindInput(G);
  // title screen
  const params = new URLSearchParams(location.search);
  const shot = params.get('shot');
  showTitle(G);
  // start button
  const startBtn = document.getElementById('startBtn');
  if (startBtn) startBtn.addEventListener('click', () => { ensureAudio(G.audio); startPlaying(G); });
  const contBtn = document.getElementById('continueBtn');
  if (contBtn) contBtn.addEventListener('click', () => { ensureAudio(G.audio); startPlaying(G); });
  // a shot param skips the title and stages the scene for a screenshot
  if (shot) {
    hideTitle(G);
    G.state = 'playing';
    G.shotMode = shot;
    setupShot(G, shot);
    if (shot !== 'map') {
      // let the world settle a moment before the screenshot
      G.rig.update(G.player, 0.5);
    }
  }
  requestAnimationFrame((t) => tick(G, t));
  // debug handle (read-only inspection; harmless in the shipped game)
  window.__GOLDEN_TIDE__ = G;
  return G;
}

window.addEventListener('DOMContentLoaded', boot);

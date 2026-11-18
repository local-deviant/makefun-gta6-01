// GOLDEN TIDE 3D — side activities: taxi fares, Sun Disc collectibles,
// shops (weapons, garage repair, car dealer) and the respect ladder.
// Each activity is a marker in the world; the HUD shows what is near.

import * as THREE from '../vendor/three.module.min.js';
import { COLLECTIBLES, SHOPS, WEAPONS, respectRank } from './config.js';
import { dist, mulberry32 } from './util.js';

export function createActivities(save) {
  return {
    collected: new Set(save.collectibles || []),
    faresDone: save.faresDone || 0,
    racesWon: save.racesWon || 0,
    respect: save.respect || 0,
    fare: null, // {pickup:{x,z}, drop:{x,z}, stage:'pickup'|'drop', reward}
    discMeshes: [],
  };
}

export function buildActivityMarkers(scene, acts) {
  const g = new THREE.Group();
  g.name = 'activities';
  // Sun Discs: golden spinning discs
  const discGeo = new THREE.CylinderGeometry(1.1, 1.1, 0.25, 16);
  const discMat = new THREE.MeshStandardMaterial({ color: 0xd8a018, emissive: 0xffb800, emissiveIntensity: 1.4, metalness: 0.8, roughness: 0.3 });
  for (const c of COLLECTIBLES) {
    if (acts.collected.has(c.id)) continue;
    const m = new THREE.Mesh(discGeo, discMat);
    m.position.set(c.x, 1.6, c.z);
    m.rotation.x = Math.PI / 2.4;
    g.add(m);
    acts.discMeshes.push({ id: c.id, mesh: m, x: c.x, z: c.z });
  }
  // Shop signs: a floating marker + a small sign board
  const signTex = (label) => new THREE.CanvasTexture(((c) => {
    const x = c.getContext('2d');
    x.fillStyle = '#101826'; x.fillRect(0, 0, 256, 64);
    x.fillStyle = '#ffd700'; x.font = 'bold 28px Georgia'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(label, 128, 34);
    return c;
  })(document.createElement('canvas')));
  for (const s of SHOPS) {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshStandardMaterial({ map: signTex(s.name), emissive: 0xffffff, emissiveMap: signTex(s.name), emissiveIntensity: 0.7, side: THREE.DoubleSide }));
    board.position.set(s.x, 6.5, s.z);
    g.add(board);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 6, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    pole.position.set(s.x, 3, s.z);
    g.add(pole);
  }
  scene.add(g);
  return g;
}

export function updateActivities(acts, scene, player, dt, t, hooks) {
  const px = player.inCar ? player.inCar.x : player.x;
  const pz = player.inCar ? player.inCar.z : player.z;

  // spin the discs; collect on touch
  for (let i = acts.discMeshes.length - 1; i >= 0; i--) {
    const d = acts.discMeshes[i];
    d.mesh.rotation.y += dt * 2;
    d.mesh.position.y = 1.6 + Math.sin(t * 2 + i) * 0.3;
    if (dist(px, pz, d.x, d.z) < 3) {
      scene.remove(d.mesh);
      acts.discMeshes.splice(i, 1);
      acts.collected.add(d.id);
      hooks.collectDisc(d.id, acts.collected.size);
    }
  }

  // taxi fare: when the player is in a car and no fare is open, one appears
  if (!acts.fare && player.inCar && Math.random() < dt * 0.06) {
    const rng = mulberry32(Date.now() % 100000);
    const gx = (Math.floor(rng() * 11) - 5) * 100;
    const gz = (Math.floor(rng() * 11) - 5) * 100;
    const dx = (Math.floor(rng() * 11) - 5) * 100;
    const dz = (Math.floor(rng() * 11) - 5) * 100;
    acts.fare = { pickup: { x: gx, z: gz }, drop: { x: dx, z: dz }, stage: 'pickup', reward: 120 + Math.floor(rng() * 180) };
    hooks.toast('Taxi fare: pick up the client at the marker');
    hooks.beacon(gx, gz);
  }
  if (acts.fare) {
    const target = acts.fare.stage === 'pickup' ? acts.fare.pickup : acts.fare.drop;
    hooks.beacon(target.x, target.z);
    if (dist(px, pz, target.x, target.z) < 10) {
      if (acts.fare.stage === 'pickup') {
        acts.fare.stage = 'drop';
        hooks.toast('Client aboard — drive to the destination');
      } else {
        const reward = acts.fare.reward;
        acts.fare = null;
        acts.faresDone += 1;
        hooks.fareDone(reward, acts.faresDone);
        hooks.beaconHide();
      }
    }
  }
}

// --- shops ----------------------------------------------------------------
export function nearestShop(px, pz, maxDist = 12) {
  let best = null, bd = maxDist;
  for (const s of SHOPS) {
    const d = dist(px, pz, s.x, s.z);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

export function buyWeapon(player, cash, weaponId) {
  const w = WEAPONS.find((x) => x.id === weaponId);
  if (!w) return { ok: false, why: 'no such weapon' };
  if (player.ownedWeapons.includes(weaponId)) {
    // top up ammo
    const price = 40;
    if (cash < price) return { ok: false, why: 'not enough cash' };
    player.ammo[weaponId] = (player.ammo[weaponId] || 0) + w.ammo;
    return { ok: true, spent: price, note: 'Ammo topped up: ' + w.name };
  }
  if (cash < w.price) return { ok: false, why: 'not enough cash' };
  player.ownedWeapons.push(weaponId);
  player.ammo[weaponId] = w.ammo;
  return { ok: true, spent: w.price, note: 'Bought ' + w.name };
}

export function respectInfo(points) {
  return { rank: respectRank(points), points };
}

// % COMPLETE: 7 missions + 3 races + 15 discs + 5 fares = 30 items.
export function completionPercent(save) {
  const total = 7 + 3 + 15 + 5;
  const done = (save.missionsDone || []).length
    + Math.min(3, save.racesWon || 0)
    + (save.collectibles || []).length
    + Math.min(5, save.faresDone || 0);
  return Math.round((done / total) * 100);
}

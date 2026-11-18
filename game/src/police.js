// GOLDEN TIDE 3D — police: the wanted system, cruisers, roadblocks, helicopter.
// Wanted heat 0..100 maps to stars 0..5. Cruisers spawn by star count, chase
// and ram; at 3+ stars roadblocks appear ahead; at 4+ a helicopter follows
// with a searchlight. Losing line of sight cools the heat; being busted
// respawns the player at the station and takes a cut of the cash.

import * as THREE from '../vendor/three.module.min.js';
import { clamp, dist, angleDiff, turnToward } from './util.js';
import { buildCarMesh, createDriver, driveStep } from './vehicles.js';

export function starsFromHeat(heat) {
  return clamp(Math.ceil(heat / 20), 0, 5);
}

export function createPolice() {
  return {
    heat: 0,
    cruisers: [],      // driver objects with .mesh
    roadblocks: [],    // {x, z, heading, meshes[]}
    heli: null,        // {group, rotor, light, x, z, y}
    lastSpawn: 0,
    bustTimer: 0,
  };
}

function spawnCruiser(police, scene, x, z) {
  const c = createDriver('police', x, z, 0);
  c.mesh = buildCarMesh('police', { police: true });
  c.mesh.position.set(x, 0, z);
  c.isPolice = true;
  c.health = 120;
  c.callSign = 'UNIT-' + String(10 + police.cruisers.length * 3 + Math.floor(Math.random() * 8));
  c.action = 'Pursuing';
  scene.add(c.mesh);
  police.cruisers.push(c);
  return c;
}

function spawnHeli(police, scene, x, z) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 6.5), new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.4, metalness: 0.5 }));
  body.castShadow = true; g.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 5), new THREE.MeshStandardMaterial({ color: 0x1a2a3a }));
  tail.position.set(0, 0.3, -5.2); g.add(tail);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 2), new THREE.MeshStandardMaterial({ color: 0x0a1a2a, roughness: 0.1, metalness: 0.7 }));
  glass.position.set(0, 0.2, 2.4); g.add(glass);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  mast.position.y = 1.2; g.add(mast);
  const rotor = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  rotor.add(blade);
  const blade2 = blade.clone(); blade2.rotation.y = Math.PI / 2; rotor.add(blade2);
  rotor.position.y = 1.75; g.add(rotor);
  // searchlight: a spotlight + a visible cone
  const spot = new THREE.SpotLight(0xfff2b0, 900, 120, 0.32, 0.45, 1.2);
  spot.position.set(0, -0.6, 0);
  g.add(spot);
  g.add(spot.target);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(9, 40, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
  );
  cone.rotation.x = Math.PI; cone.position.y = -20; g.add(cone);
  g.position.set(x, 42, z);
  scene.add(g);
  police.heli = { group: g, rotor, spot, cone, x, z, y: 42 };
  return police.heli;
}

function spawnRoadblock(police, scene, x, z, heading) {
  const meshes = [];
  const perp = heading + Math.PI / 2;
  for (const s of [-4.5, 0, 4.5]) {
    const c = createDriver('police', x + Math.sin(perp) * s, z + Math.cos(perp) * s, heading);
    c.mesh = buildCarMesh('police', { police: true });
    c.mesh.position.set(c.x, 0, c.z);
    c.mesh.rotation.y = heading;
    c.isRoadblock = true;
    c.isPolice = true; // so ramming one counts as hitting a police car
    c.health = 150;
    scene.add(c.mesh);
    meshes.push(c);
  }
  police.roadblocks.push({ x, z, heading, cars: meshes });
}

export function addHeat(police, amount) {
  police.heat = clamp(police.heat + amount, 0, 100);
}

export function updatePolice(police, scene, player, dt, t, collide, onBusted) {
  const stars = starsFromHeat(police.heat);
  const px = player.inCar ? player.inCar.x : player.x;
  const pz = player.inCar ? player.inCar.z : player.z;
  const playerSpeed = player.inCar ? Math.abs(player.inCar.speed) : Math.abs(player.speed);

  // --- spawn cruisers to match the star count
  const wantCruisers = stars === 0 ? 0 : Math.min(1 + stars, 6);
  if (police.cruisers.length < wantCruisers && t - police.lastSpawn > 1.2) {
    police.lastSpawn = t;
    const a = Math.random() * Math.PI * 2;
    spawnCruiser(police, scene, px + Math.sin(a) * 55, pz + Math.cos(a) * 55);
  }
  if (stars === 0) {
    // stand down: cruisers drive off and despawn when far
    for (let i = police.cruisers.length - 1; i >= 0; i--) {
      const c = police.cruisers[i];
      const d = dist(c.x, c.z, px, pz);
      if (d > 120) { scene.remove(c.mesh); police.cruisers.splice(i, 1); }
    }
  }

  // --- cruiser pursuit: steer at the player, ram, keep formation
  for (const c of police.cruisers) {
    const d = dist(c.x, c.z, px, pz);
    const want = Math.atan2(px - c.x, pz - c.z);
    const diff = angleDiff(c.heading, want);
    const steer = clamp(diff * 2.2, -1, 1);
    const throttle = d > 6 ? 0.95 : 0.4;
    driveStep(c, { throttle, steer, brake: false }, dt, collide);
    // ramming: bump the player's car
    if (player.inCar && d < 5.2) {
      const push = Math.atan2(player.inCar.x - c.x, player.inCar.z - c.z);
      player.inCar.x += Math.sin(push) * dt * 6;
      player.inCar.z += Math.cos(push) * dt * 6;
      player.inCar.health = Math.max(0, player.inCar.health - dt * 4);
      c.health = Math.max(0, c.health - dt * 2);
    }
    // on foot: a cruiser that touches the player busts them
    if (!player.inCar && d < 3.4 && playerSpeed < 2) {
      police.bustTimer += dt;
      if (police.bustTimer > 1.5) {
        police.bustTimer = 0;
        onBusted();
      }
    } else {
      police.bustTimer = Math.max(0, police.bustTimer - dt);
    }
    // light bar flash
    const bar = c.mesh.userData.lightBar;
    if (bar) {
      const on = Math.floor(t * 6) % 2 === 0;
      bar.children[0].material.emissiveIntensity = on ? 4 : 0.4;
      bar.children[1].material.emissiveIntensity = on ? 0.4 : 4;
    }
  }

  // --- roadblocks at 3+ stars: one ahead of the player every ~25 s
  if (stars >= 3 && police.roadblocks.length < Math.min(stars - 1, 3) && t - (police.lastRoadblock || 0) > 22) {
    police.lastRoadblock = t;
    const heading = player.inCar ? player.inCar.heading : player.heading;
    const bx = px + Math.sin(heading) * 55;
    const bz = pz + Math.cos(heading) * 55;
    spawnRoadblock(police, scene, bx, bz, heading);
  }
  // roadblocks despawn when the player is far past them
  for (let i = police.roadblocks.length - 1; i >= 0; i--) {
    const rb = police.roadblocks[i];
    if (dist(rb.x, rb.z, px, pz) > 160) {
      for (const c of rb.cars) scene.remove(c.mesh);
      police.roadblocks.splice(i, 1);
    }
  }
  // roadblock light bars flash like the cruisers'
  for (const rb of police.roadblocks) {
    for (const c of rb.cars) {
      const bar = c.mesh.userData.lightBar;
      if (bar) {
        const on = Math.floor(t * 6) % 2 === 0;
        bar.children[0].material.emissiveIntensity = on ? 4 : 0.4;
        bar.children[1].material.emissiveIntensity = on ? 0.4 : 4;
      }
    }
  }

  // --- helicopter at 4+ stars
  if (stars >= 4 && !police.heli) spawnHeli(police, scene, px + 30, pz - 30);
  if (stars < 4 && police.heli) {
    scene.remove(police.heli.group);
    police.heli = null;
  }
  if (police.heli) {
    const h = police.heli;
    h.x = lerp(h.x, px, dt * 0.55);
    h.z = lerp(h.z, pz, dt * 0.55);
    h.group.position.set(h.x, h.y + Math.sin(t * 0.8) * 1.5, h.z);
    h.group.rotation.y = Math.atan2(px - h.x, pz - h.z);
    h.rotor.rotation.y += dt * 22;
    h.spot.target.position.set(px - h.x, -h.y, pz - h.z);
    h.cone.lookAt(px, 0, pz);
  }

  // --- heat cools when the player is slow and out of sight of every cruiser
  let seen = false;
  for (const c of police.cruisers) {
    if (dist(c.x, c.z, px, pz) < 45) { seen = true; break; }
  }
  if (stars > 0 && !seen && playerSpeed < 3) {
    police.heat = Math.max(0, police.heat - dt * 2.2);
  } else if (stars > 0) {
    police.heat = Math.max(0, police.heat - dt * 0.35);
  }

  return stars;
}

// The HUD police list: call sign, distance, action.
export function policeList(police, px, pz) {
  const list = police.cruisers.map((c) => ({
    callSign: c.callSign,
    dist: Math.round(dist(c.x, c.z, px, pz)),
    action: dist(c.x, c.z, px, pz) < 8 ? 'RAMMING' : 'Pursuing',
  }));
  if (police.heli) list.push({ callSign: 'AIR-1', dist: Math.round(dist(police.heli.x, police.heli.z, px, pz)), action: 'Air support' });
  for (const rb of police.roadblocks) {
    list.push({ callSign: 'BLOCK', dist: Math.round(dist(rb.x, rb.z, px, pz)), action: 'Roadblock' });
  }
  return list.slice(0, 5);
}
function lerp(a, b, t) { return a + (b - a) * t; }

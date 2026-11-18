// GOLDEN TIDE 3D — vehicles: car factory, arcade driving, traffic AI.
// A car is a small group of boxes (body, cabin, wheels, lights). Physics is
// arcade: throttle, steering scaled by speed, drift on handbrake, AABB
// collision against buildings and circle collision against other cars.

import * as THREE from '../vendor/three.module.min.js';
import { CAR_MODELS, GRID_MIN, GRID_MAX, ROAD_STEP } from './config.js';
import { clamp, turnToward, angleDiff, dist, mulberry32 } from './util.js';

export function carModel(id) {
  return CAR_MODELS.find((m) => m.id === id) || CAR_MODELS[1];
}

// Build a car mesh. `opts`: model id, police (light bar), taxi (roof sign).
export function buildCarMesh(modelId, opts = {}) {
  const model = carModel(modelId);
  const g = new THREE.Group();
  g.name = 'car-' + modelId;
  const paint = new THREE.MeshStandardMaterial({ color: model.color, roughness: 0.35, metalness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14181e, roughness: 0.2, metalness: 0.4 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dce2, roughness: 0.15, metalness: 0.9 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.42, 0.7), paint);
  nose.position.set(0, 0.45, 2.35); nose.castShadow = true; g.add(nose);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.58, 2.1), dark);
  cabin.position.set(0, 1.12, -0.25); cabin.castShadow = true; g.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 1.6), paint);
  roof.position.set(0, 1.44, -0.25); g.add(roof);
  // headlights + taillights
  const headMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff2b0, emissiveIntensity: 1.6 });
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.1), headMat);
    hl.position.set(s * 0.62, 0.55, 2.72); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.1), new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 1.2 }));
    tl.position.set(s * 0.62, 0.55, -2.22); g.add(tl);
  }
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.9 });
  const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.32, 8);
  hubGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Group();
    const tire = new THREE.Mesh(wheelGeo, wheelMat); tire.castShadow = true; w.add(tire);
    w.add(new THREE.Mesh(hubGeo, chrome));
    w.position.set(wx, 0.36, wz);
    g.add(w);
    wheels.push(w);
  }
  if (opts.taxi) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.5), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffd700, emissiveIntensity: 1.4 }));
    sign.position.set(0, 1.62, -0.25); g.add(sign);
  }
  let lightBar = null;
  if (opts.police) {
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.5), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2020, emissiveIntensity: 3 }));
    red.position.x = -0.4; lightBar.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.5), new THREE.MeshStandardMaterial({ color: 0x000022, emissive: 0x2040ff, emissiveIntensity: 3 }));
    blue.position.x = 0.4; lightBar.add(blue);
    lightBar.position.set(0, 1.58, -0.25);
    g.add(lightBar);
    // black doors + white body: repaint the body white with black doors
    body.material = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35, metalness: 0.4 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.5, 1.4), new THREE.MeshStandardMaterial({ color: 0x14181e, roughness: 0.4 }));
    door.position.set(0, 0.55, 0.1); g.add(door);
  }
  g.userData.wheels = wheels;
  g.userData.lightBar = lightBar;
  g.userData.headMat = headMat;
  return g;
}

// --- arcade driving -------------------------------------------------------
export function createDriver(modelId, x, z, heading) {
  const model = carModel(modelId);
  return {
    modelId, model,
    x, z, heading, speed: 0,
    steer: 0, health: 100, mesh: null,
    // physics state
    drift: 0,
  };
}

// One physics step. `input`: {throttle (-1..1), steer (-1..1), brake (bool)}.
// `collide` resolves building AABBs and the island edge.
export function driveStep(car, input, dt, collide) {
  const m = car.model;
  const targetSpeed = input.throttle * m.topSpeed;
  const accelRate = input.throttle !== 0 ? m.accel : 8;
  car.speed += clamp(targetSpeed - car.speed, -accelRate * dt, accelRate * dt);
  if (input.brake) car.speed = approach(car.speed, 0, 30 * dt);
  // steering: less at speed, more drift with handbrake
  const steerAuthority = clamp(Math.abs(car.speed) / 8, 0.15, 1) * m.grip * 0.55;
  const steerAngle = input.steer * steerAuthority * (input.brake ? 1.6 : 1);
  car.heading += steerAngle * dt * Math.sign(car.speed || 1) * clamp(Math.abs(car.speed) / 6, 0.25, 1);
  if (input.brake) car.drift = clamp(car.drift + dt * 2, 0, 1); else car.drift = Math.max(0, car.drift - dt * 3);
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const res = collide(nx, nz, 2.4);
  car.x = res.x; car.z = res.z;
  if (res.hit) {
    // a wall stops the car and scrapes its health a little
    if (Math.abs(car.speed) > 12) car.health = Math.max(0, car.health - Math.abs(car.speed) * 0.25);
    car.speed *= 0.35;
  }
  // mesh pose
  if (car.mesh) {
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    const spin = car.speed * dt * 2.8;
    for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
    const front = car.mesh.userData.wheels;
    front[0].rotation.y = input.steer * 0.4;
    front[1].rotation.y = input.steer * 0.4;
  }
  return car;
}

function approach(v, target, step) {
  if (v < target) return Math.min(target, v + step);
  if (v > target) return Math.max(target, v - step);
  return v;
}

// --- traffic --------------------------------------------------------------
// A traffic car picks an intersection, drives to it, then picks another.
// It slows for the car ahead of it.
export function createTraffic(count, rng) {
  const cars = [];
  const models = ['sedan', 'coupe', 'taxi', 'truck', 'sport'];
  for (let i = 0; i < count; i++) {
    const modelId = models[Math.floor(rng() * models.length)];
    const gx = (Math.floor(rng() * 11) - 5) * ROAD_STEP;
    const gz = (Math.floor(rng() * 11) - 5) * ROAD_STEP;
    const along = rng() < 0.5;
    const d = {
      ...createDriver(modelId, along ? gx + (rng() - 0.5) * 40 : gx, along ? gz : gz + (rng() - 0.5) * 40, along ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2)),
      target: null, wait: 0, mesh: buildCarMesh(modelId, { taxi: modelId === 'taxi' }),
    };
    d.mesh.position.set(d.x, 0, d.z);
    cars.push(d);
  }
  return cars;
}

export function updateTraffic(cars, dt, collide, playerCar) {
  for (const c of cars) {
    if (!c.target) {
      // pick the next intersection along the current heading
      const gx = Math.round(c.x / ROAD_STEP) * ROAD_STEP;
      const gz = Math.round(c.z / ROAD_STEP) * ROAD_STEP;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const [dx, dz] = dirs[Math.floor(Math.random() * dirs.length)];
      c.target = {
        x: clamp(gx + dx * ROAD_STEP, GRID_MIN, GRID_MAX),
        z: clamp(gz + dz * ROAD_STEP, GRID_MIN, GRID_MAX),
      };
    }
    const want = Math.atan2(c.target.x - c.x, c.target.z - c.z);
    const diff = angleDiff(c.heading, want);
    const steer = clamp(diff * 1.6, -1, 1);
    // slow for a car ahead
    let throttle = 0.55;
    if (playerCar) {
      const pd = dist(c.x, c.z, playerCar.x, playerCar.z);
      if (pd < 14 && Math.abs(angleDiff(c.heading, Math.atan2(playerCar.x - c.x, playerCar.z - c.z))) < 0.6) throttle = 0.12;
    }
    driveStep(c, { throttle, steer, brake: false }, dt, collide);
    if (dist(c.x, c.z, c.target.x, c.target.z) < 6) c.target = null;
  }
}

// A simple walking pedestrian (a low-poly figure that strolls a sidewalk).
export function buildPedestrian(rng) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: [0xc98a5e, 0x8a5a3a, 0xe8c8a8][Math.floor(rng() * 3)], roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: [0xc23a2a, 0x2a6a8a, 0x8a6a2a, 0x5a3a7a, 0x2a7a4a][Math.floor(rng() * 5)], roughness: 0.9 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), new THREE.MeshStandardMaterial({ color: 0x2a2a3a }));
  legs.position.y = 0.4; g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), shirt);
  torso.position.y = 1.18; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.78; head.castShadow = true; g.add(head);
  return g;
}

export function createPedestrians(count, rng) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    // Spawn on a road, walking along it on the sidewalk edge — never inside
    // a building block. Roads run every ROAD_STEP; heading stays cardinal so
    // the intersection turns below keep the ped on the road grid.
    const northSouth = rng() < 0.5;
    const line = (Math.floor(rng() * 11) - 5) * ROAD_STEP;
    const along = (Math.floor(rng() * 11) - 5) * ROAD_STEP + (rng() - 0.5) * 80;
    const off = (rng() < 0.5 ? -1 : 1) * (8 + rng() * 2);
    peds.push({
      x: northSouth ? line + off : along,
      z: northSouth ? along : line + off,
      heading: northSouth ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
      speed: 1.2 + rng() * 0.9,
      mesh: buildPedestrian(rng), phase: rng() * 10,
    });
  }
  return peds;
}

export function updatePedestrians(peds, dt, t, playerPos, collide) {
  for (const p of peds) {
    p.x += Math.sin(p.heading) * p.speed * dt;
    p.z += Math.cos(p.heading) * p.speed * dt;
    // wander: at an intersection, sometimes turn
    if (Math.abs(p.x % ROAD_STEP) < 2 || Math.abs(p.z % ROAD_STEP) < 2) {
      if (Math.random() < 0.01) p.heading += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
    }
    p.x = clamp(p.x, GRID_MIN - 20, GRID_MAX + 20);
    p.z = clamp(p.z, GRID_MIN - 20, GRID_MAX + 20);
    // flee the player's car a little
    if (playerPos) {
      const d = dist(p.x, p.z, playerPos.x, playerPos.z);
      if (d < 6) {
        const a = Math.atan2(p.x - playerPos.x, p.z - playerPos.z);
        p.x += Math.sin(a) * dt * 4; p.z += Math.cos(a) * dt * 4;
      }
    }
    // backstop: a nudge (flee, drift) must never push a ped through a wall;
    // the collider pushes the ped back out of any building it entered
    if (collide) {
      const res = collide(p.x, p.z, 0.6);
      if (res.hit) { p.x = res.x; p.z = res.z; }
    }
    p.mesh.position.set(p.x, Math.abs(Math.sin(t * 6 + p.phase)) * 0.06, p.z);
    p.mesh.rotation.y = p.heading;
  }
}

export { mulberry32 };

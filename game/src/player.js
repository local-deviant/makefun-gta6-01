// GOLDEN TIDE 3D — the player: on foot, in a car, and the camera.
// On foot the camera sits over the shoulder; in a car it chases behind.
// E enters or steals the nearest car, F (or click) fires the equipped weapon.

import * as THREE from '../vendor/three.module.min.js';
import { clamp, lerp, angleDiff, dist, turnToward } from './util.js';
import { buildCarMesh, createDriver } from './vehicles.js';

export function buildPlayerMesh() {
  const g = new THREE.Group();
  g.name = 'player';
  const skin = new THREE.MeshStandardMaterial({ color: 0xc98a5e, roughness: 0.8 });
  const jacket = new THREE.MeshStandardMaterial({ color: 0x2a4a6a, roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x1e2430, roughness: 0.9 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.85, 0.22), pants);
  legL.position.set(-0.13, 0.42, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.13; g.add(legR);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), jacket);
  torso.position.y = 1.2; torso.castShadow = true; g.add(torso);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), jacket);
  armL.position.set(-0.4, 1.22, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.4; g.add(armR);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skin);
  head.position.y = 1.78; head.castShadow = true; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
  hair.position.y = 1.84; g.add(hair);
  g.userData.legL = legL; g.userData.legR = legR;
  g.userData.armL = armL; g.userData.armR = armR;
  return g;
}

export function createPlayer(x, z) {
  return {
    x, z, heading: 0, speed: 0,
    inCar: null, // the driver object when driving
    mesh: buildPlayerMesh(),
    onGround: true,
    walkPhase: 0,
    weapon: 'pistol', ammo: { pistol: 24, smg: 0, shotgun: 0 },
    ownedWeapons: ['pistol'],
    lastShot: 0,
    wanted: 0, wantedHeat: 0, // heat 0..100, stars = ceil(heat/20)
  };
}

// --- on-foot movement -----------------------------------------------------
export function walkStep(p, input, dt, collide) {
  const run = input.run ? 7.5 : 4.2;
  let mx = 0, mz = 0;
  if (input.forward) mz += 1;
  if (input.back) mz -= 1;
  if (input.left) mx -= 1;
  if (input.right) mx += 1;
  const len = Math.hypot(mx, mz) || 1;
  mx /= len; mz /= len;
  // movement is relative to the camera heading
  const cam = input.camHeading;
  const wx = Math.sin(cam) * mz + Math.cos(cam) * mx;
  const wz = Math.cos(cam) * mz - Math.sin(cam) * mx;
  const moving = input.forward || input.back || input.left || input.right;
  p.speed = moving ? run : 0;
  if (moving) {
    const targetHeading = Math.atan2(wx, wz);
    p.heading = turnToward(p.heading, targetHeading, dt * 10);
    const nx = p.x + wx * run * dt;
    const nz = p.z + wz * run * dt;
    const res = collide(nx, nz, 0.6);
    p.x = res.x; p.z = res.z;
    p.walkPhase += dt * (run ? 11 : 0);
  }
  p.mesh.position.set(p.x, Math.abs(Math.sin(p.walkPhase)) * 0.05, p.z);
  p.mesh.rotation.y = p.heading;
  const swing = moving ? Math.sin(p.walkPhase) * 0.5 : 0;
  p.mesh.userData.legL.rotation.x = swing;
  p.mesh.userData.legR.rotation.x = -swing;
  p.mesh.userData.armL.rotation.x = -swing * 0.7;
  p.mesh.userData.armR.rotation.x = swing * 0.7;
  return p;
}

// --- entering / stealing cars ---------------------------------------------
export function nearestCar(p, cars, maxDist = 5) {
  let best = null, bd = maxDist;
  for (const c of cars) {
    const d = dist(p.x, p.z, c.x, c.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export function enterCar(p, car, scene) {
  p.inCar = car;
  car.mesh = car.mesh || buildCarMesh(car.modelId, car.police ? { police: true } : {});
  p.mesh.visible = false;
  return car;
}

export function exitCar(p, scene) {
  const car = p.inCar;
  if (!car) return null;
  p.inCar = null;
  p.x = car.x - Math.sin(car.heading + Math.PI / 2) * 3;
  p.z = car.z - Math.cos(car.heading + Math.PI / 2) * 3;
  p.heading = car.heading;
  p.mesh.visible = true;
  p.mesh.position.set(p.x, 0, p.z);
  return car;
}

// --- combat ----------------------------------------------------------------
// Hitscan shot from the player toward `aim` (a world point). Returns the hit
// car/pedestrian or null. `onHit` is called with (target, damage).
export function shoot(p, aim, weapons, targets, now) {
  const w = weapons.find((x) => x.id === p.weapon);
  if (!w) return null;
  if (now - p.lastShot < w.rate) return null;
  if ((p.ammo[p.weapon] || 0) <= 0) return 'empty';
  p.lastShot = now;
  p.ammo[p.weapon] -= 1;
  // find the nearest target within a cone of the aim direction
  const dir = Math.atan2(aim.x - p.x, aim.z - p.z);
  let best = null, bd = 60;
  for (const t of targets) {
    const d = dist(p.x, p.z, t.x, t.z);
    if (d > 60 || d < 1) continue;
    const a = Math.atan2(t.x - p.x, t.z - p.z);
    if (Math.abs(angleDiff(dir, a)) < 0.14 && d < bd) { bd = d; best = t; }
  }
  if (best) {
    best.health = (best.health ?? 100) - w.damage;
    return { target: best, damage: w.damage, killed: best.health <= 0 };
  }
  return { target: null, damage: 0, killed: false };
}

// --- camera ----------------------------------------------------------------
export function createCameraRig(camera) {
  return {
    camera,
    mode: 'chase', // 'chase' | 'foot' | 'top'
    yaw: 0, pitch: 0.32,
    pos: new THREE.Vector3(0, 8, -14),
    look: new THREE.Vector3(0, 1, 0),
    update(p, dt) {
      const cam = camera;
      if (p.inCar) {
        const car = p.inCar;
        const back = 10.5 + Math.abs(car.speed) * 0.12;
        const h = 4.4 + Math.abs(car.speed) * 0.03;
        const want = new THREE.Vector3(
          car.x - Math.sin(car.heading) * back,
          h,
          car.z - Math.cos(car.heading) * back,
        );
        const look = new THREE.Vector3(
          car.x + Math.sin(car.heading) * 8,
          1.4,
          car.z + Math.cos(car.heading) * 8,
        );
        this.pos.lerp(want, 1 - Math.pow(0.0001, dt));
        this.look.lerp(look, 1 - Math.pow(0.00001, dt));
        cam.position.copy(this.pos);
        cam.lookAt(this.look);
      } else if (this.mode === 'top') {
        const want = new THREE.Vector3(p.x, 70, p.z + 0.1);
        this.pos.lerp(want, 1 - Math.pow(0.001, dt));
        cam.position.copy(this.pos);
        cam.lookAt(p.x, 0, p.z);
      } else {
        // over-shoulder on foot
        const back = 4.6, h = 2.6;
        const want = new THREE.Vector3(
          p.x - Math.sin(this.yaw) * back,
          h,
          p.z - Math.cos(this.yaw) * back,
        );
        const look = new THREE.Vector3(
          p.x + Math.sin(this.yaw) * 6,
          1.3,
          p.z + Math.cos(this.yaw) * 6,
        );
        this.pos.lerp(want, 1 - Math.pow(0.0001, dt));
        this.look.lerp(look, 1 - Math.pow(0.00001, dt));
        cam.position.copy(this.pos);
        cam.lookAt(this.look);
      }
    },
  };
}

// A glowing vertical beacon + ground ring that marks the current objective.
export function createBeacon(scene) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 30; g.add(beam);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.2, 0.28, 8, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd700 }),
  );
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; g.add(ring);
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe970 }),
  );
  dot.position.y = 1.2; g.add(dot);
  g.visible = false;
  scene.add(g);
  return {
    group: g,
    show(x, z) { g.visible = true; g.position.set(x, 0, z); },
    hide() { g.visible = false; },
    update(t) {
      if (!g.visible) return;
      ring.scale.setScalar(1 + Math.sin(t * 3) * 0.12);
      dot.position.y = 1.2 + Math.sin(t * 2.4) * 0.35;
    },
  };
}

export { createDriver };

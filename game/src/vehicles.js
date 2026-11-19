// Vehicles: car meshes, traffic that follows roads and stops at red
// lights, parked cars, and the player's driven car physics (arcade).
import * as THREE from 'three';
import { CARS, CITY } from './config.js';
import { makeRng, clamp, angleLerp, dist2d } from './util.js';
import { hitsSolid } from './city.js';

const GRID = [-460, -368, -276, -184, -92, 0, 92, 184, 276, 368, 460];

export function makeCarMesh(def, rng) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.35, metalness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x141c26, roughness: 0.15, metalness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.55, 2.1), glassMat);
  cabin.position.set(0, 1.08, -0.25);
  cabin.castShadow = true;
  g.add(cabin);
  // headlights + taillights
  const hl = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffe9a0, emissiveIntensity: 0.9 });
  const tl = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2a2a, emissiveIntensity: 0.7 });
  for (const sx of [-0.7, 0.7]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), hl);
    h.position.set(sx, 0.55, 2.22); g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tl);
    t.position.set(sx, 0.62, -2.22); g.add(t);
  }
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w);
    wheels.push(w);
  }
  g.userData = { def, wheels };
  return g;
}

// A traffic car: drives along grid roads, turns at intersections,
// stops at red lights, keeps a gap to the car ahead.
export class TrafficCar {
  constructor(scene, rng, def, solids) {
    this.def = def;
    this.mesh = makeCarMesh(def, rng);
    this.solids = solids;
    // start on a random road, axis-aligned
    const alongX = rng.chance(0.5);
    const line = GRID[Math.floor(rng.next() * GRID.length)];
    const along = rng.range(-460, 460);
    this.x = alongX ? along : line;
    this.z = alongX ? line : along;
    this.heading = alongX ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
    this.speed = 0;
    this.targetSpeed = rng.range(9, 14);
    this.wait = 0;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    scene.add(this.mesh);
  }
  update(dt, city, others) {
    // red light ahead?
    const look = 16;
    const fx = this.x + Math.sin(this.heading) * look;
    const fz = this.z + Math.cos(this.heading) * look;
    const alongX = Math.abs(Math.sin(this.heading)) > 0.7;
    let stopped = false;
    if (city.redFor(fx, fz, alongX)) stopped = true;
    // car ahead on the same lane?
    for (const o of others) {
      if (o === this) continue;
      const dx = o.x - this.x, dz = o.z - this.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 13) {
        const fwd = (dx * Math.sin(this.heading) + dz * Math.cos(this.heading)) / Math.max(d, 0.001);
        if (fwd > 0.7) { stopped = true; break; }
      }
    }
    if (stopped) {
      this.speed = Math.max(0, this.speed - 22 * dt);
    } else {
      this.speed = Math.min(this.targetSpeed, this.speed + 8 * dt);
    }
    // move
    let nx = this.x + Math.sin(this.heading) * this.speed * dt;
    let nz = this.z + Math.cos(this.heading) * this.speed * dt;
    // turn at intersections (snap to grid when near a crossing)
    const nearX = GRID.reduce((a, b) => (Math.abs(b - nx) < Math.abs(a - nx) ? b : a), GRID[0]);
    const nearZ = GRID.reduce((a, b) => (Math.abs(b - nz) < Math.abs(a - nz) ? b : a), GRID[0]);
    if (this.speed > 0.5 && Math.abs(nx - nearX) < 2.5 && Math.abs(nz - nearZ) < 2.5) {
      // decide: keep going, or turn (seeded by position so it is stable)
      const h = Math.abs(Math.sin(nx * 0.37 + nz * 0.73)) ;
      if (h < 0.34) {
        const turnLeft = Math.sin(nx * 1.13 + nz * 0.41) > 0;
        this.heading += turnLeft ? Math.PI / 2 : -Math.PI / 2;
        nx = nearX; nz = nearZ;
      }
    }
    // stay on the island
    if (Math.abs(nx) > 500 || Math.abs(nz) > 500) {
      this.heading += Math.PI;
      nx = clamp(nx, -500, 500); nz = clamp(nz, -500, 500);
    }
    // do not drive through buildings
    if (!hitsSolid(this.solids, nx, nz, 2.2)) {
      this.x = nx; this.z = nz;
    } else {
      this.heading += Math.PI / 2;
    }
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    // spin wheels
    for (const w of this.mesh.userData.wheels) w.rotation.x += this.speed * dt * 2.4;
  }
}

export function spawnParkedCars(scene, rng, solids, count = 26) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const def = CARS[Math.floor(rng.next() * CARS.length)];
    const mesh = makeCarMesh(def, rng);
    // park along a road edge
    const alongX = rng.chance(0.5);
    const line = GRID[Math.floor(rng.next() * GRID.length)];
    const along = rng.range(-440, 440);
    const off = (rng.chance(0.5) ? 1 : -1) * (CITY.roadHalf + 1.6);
    const x = alongX ? along : line + off;
    const z = alongX ? line + off : along;
    if (hitsSolid(solids, x, z, 3)) continue;
    mesh.position.set(x, 0, z);
    mesh.rotation.y = alongX ? (off > 0 ? Math.PI / 2 : -Math.PI / 2) : (off > 0 ? 0 : Math.PI);
    scene.add(mesh);
    cars.push({ def, mesh, x, z, parked: true, stolen: false });
  }
  return cars;
}

export function nearestParkedCar(cars, x, z, maxD = 6) {
  let best = null, bd = maxD;
  for (const c of cars) {
    if (c.stolen) continue;
    const d = dist2d(x, z, c.x, c.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

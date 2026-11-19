// Dante Cruz — on foot and behind the wheel. Walk with WASD, steal any
// car with E, drive it (stolen cars are YOURS to drive), punch and shoot.
// Foot speed, car physics and the camera are all arcade-simple and stable.
import * as THREE from 'three';
import { clamp, angleLerp, dist2d } from './util.js';
import { hitsSolid, clampToIsland } from './city.js';
import { makeCarMesh } from './vehicles.js';

export function makePlayerMesh() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xc98a5a, roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x2b4a6e, roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2b2b33, roughness: 0.9 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.95, 0.42), shirt);
  body.position.y = 1.05; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.4), skin);
  head.position.y = 1.78; head.castShadow = true; g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.44), hair);
  cap.position.y = 2.02; g.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.62, 0.3), pants);
  legL.position.set(-0.18, 0.31, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.18; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.24), shirt);
  armL.position.set(-0.48, 1.05, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.48; g.add(armR);
  g.userData = { legL, legR, armL, armR };
  return g;
}

export class Player {
  constructor(scene, start) {
    this.x = start.x; this.z = start.z;
    this.heading = start.heading;
    this.speed = 0;
    this.mesh = makePlayerMesh();
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    scene.add(this.mesh);
    this.inCar = null; // parked-car record when driving
    this.carMesh = null;
    this.carSpeed = 0;
    this.carHeading = this.heading;
    this.health = 100;
    this.cash = 150;
    this.ammo = 24;
    this.weapon = 'fist'; // fist | pistol
    this.moving = false;
    this.walkPhase = 0;
  }

  get pos() { return this.inCar ? { x: this.carMesh.position.x, z: this.carMesh.position.z } : { x: this.x, z: this.z }; }

  enterCar(scene, parked) {
    parked.stolen = true;
    parked.mesh.visible = false;
    this.inCar = parked;
    this.carMesh = makeCarMesh(parked.def);
    this.carMesh.position.set(parked.x, 0, parked.z);
    this.carMesh.rotation.y = parked.mesh.rotation.y;
    this.carHeading = parked.mesh.rotation.y;
    this.carSpeed = 0;
    scene.add(this.carMesh);
    this.mesh.visible = false;
    return parked.def;
  }

  exitCar(scene) {
    if (!this.inCar) return;
    const p = this.carMesh.position;
    this.x = p.x + Math.sin(this.carHeading + Math.PI / 2) * 2.4;
    this.z = p.z + Math.cos(this.carHeading + Math.PI / 2) * 2.4;
    this.heading = this.carHeading;
    this.inCar = null;
    scene.remove(this.carMesh);
    this.carMesh = null;
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  update(dt, input, solids, now, extraSolids) {
    this.moving = false;
    // a point is blocked by a building OR by a roadblock car
    const blocked = (x, z, r) => hitsSolid(solids, x, z, r) || (extraSolids && hitsSolid(extraSolids, x, z, r));
    if (this.inCar) {
      // --- driving ---
      const def = this.inCar.def;
      const fwd = (input.up ? 1 : 0) - (input.down ? 0.55 : 0);
      const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
      this.carSpeed = clamp(this.carSpeed + fwd * def.accel * dt, -14, def.top);
      if (!fwd) this.carSpeed *= Math.max(0, 1 - 1.6 * dt);
      if (Math.abs(this.carSpeed) > 0.4) {
        this.carHeading += steer * def.handling * 1.9 * dt * Math.sign(this.carSpeed) * clamp(Math.abs(this.carSpeed) / 12, 0.35, 1);
      }
      const nx = this.carMesh.position.x + Math.sin(this.carHeading) * this.carSpeed * dt;
      const nz = this.carMesh.position.z + Math.cos(this.carHeading) * this.carSpeed * dt;
      const solid = blocked(nx, nz, 2.4);
      if (solid) {
        // a real wall: stop cold, lose a little condition
        this.carSpeed = 0;
        this.inCar.condition = Math.max(0, (this.inCar.condition ?? 100) - 1);
      } else {
        const c = clampToIsland(nx, nz, 10);
        this.carMesh.position.x = c.x;
        this.carMesh.position.z = c.z;
      }
      this.carMesh.rotation.y = this.carHeading;
      for (const w of this.carMesh.userData.wheels) w.rotation.x += this.carSpeed * dt * 2.4;
      this.moving = Math.abs(this.carSpeed) > 1;
      return { speed: Math.abs(this.carSpeed) * 3.6, heading: this.carHeading };
    }
    // --- on foot ---
    const mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const mz = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const mag = Math.sqrt(mx * mx + mz * mz);
    if (mag > 0) {
      const run = input.shift ? 9.5 : 5.2;
      const dx = (mx / mag) * run * dt;
      const dz = (mz / mag) * run * dt;
      // camera-relative: input is screen-relative, camera looks from behind
      const camA = this.camHeading ?? this.heading;
      const wx = dx * Math.cos(camA) - dz * Math.sin(camA);
      const wz = dx * Math.sin(camA) + dz * Math.cos(camA);
      const nx = this.x + wx, nz = this.z + wz;
      if (!blocked(nx, this.z, 0.7)) this.x = nx;
      if (!blocked(this.x, nz, 0.7)) this.z = nz;
      const c = clampToIsland(this.x, this.z, 10);
      this.x = c.x; this.z = c.z;
      this.heading = angleLerp(this.heading, Math.atan2(wx, wz), Math.min(1, 12 * dt));
      this.moving = true;
      this.walkPhase += dt * (run * 1.6);
      const sw = Math.sin(this.walkPhase) * 0.45;
      this.mesh.userData.legL.rotation.x = sw;
      this.mesh.userData.legR.rotation.x = -sw;
      this.mesh.userData.armL.rotation.x = -sw * 0.7;
      this.mesh.userData.armR.rotation.x = sw * 0.7;
    } else {
      this.mesh.userData.legL.rotation.x *= 0.8;
      this.mesh.userData.legR.rotation.x *= 0.8;
      this.mesh.userData.armL.rotation.x *= 0.8;
      this.mesh.userData.armR.rotation.x *= 0.8;
    }
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    return { speed: mag > 0 ? (input.shift ? 9.5 : 5.2) * 3.6 : 0, heading: this.heading };
  }

  // fire the pistol: returns a ray {ox,oy,oz,dx,dy,dz} or null
  shoot() {
    if (this.weapon !== 'pistol' || this.ammo <= 0) return null;
    this.ammo--;
    const p = this.pos;
    const h = this.inCar ? this.carHeading : this.heading;
    return {
      ox: p.x, oy: this.inCar ? 1.4 : 1.5, oz: p.z,
      dx: Math.sin(h), dy: 0, dz: Math.cos(h),
    };
  }
}

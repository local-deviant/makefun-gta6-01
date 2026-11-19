// The wanted system — ONE DEEP MECHANIC. Stars 0-5, escalation by UNIT
// TYPE, not just a number. The player can fight the system: witnesses take
// 2.5 s to phone it in, changing cars drops a star, a respray clears it,
// and the helicopter can be shot down (3 hits -> fireball, -1 star).
import * as THREE from 'three';
import { WANTED } from './config.js';
import { clamp, dist2d } from './util.js';
import { makeCarMesh } from './vehicles.js';
import { hitsSolid } from './city.js';

const POLICE_DEF = { name: 'Interceptor Cruiser', color: 0x14161c, top: 56, accel: 24, handling: 0.95 };
const CALLSIGNS = ['Unit 7', 'Unit 12', 'Unit 21', 'Unit 33', 'Unit 44', 'Unit 58', 'Unit 63', 'Unit 77'];

function policeCarMesh() {
  const g = makeCarMesh(POLICE_DEF);
  // white doors
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.4, 2.4), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4, metalness: 0.3 }));
  door.position.set(0, 0.55, 0.2);
  g.add(door);
  // light bar: red + blue, flashing
  const bar = new THREE.Group();
  const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.4), new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2a2a, emissiveIntensity: 2 }));
  r.position.x = -0.35; bar.add(r);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.4), new THREE.MeshStandardMaterial({ color: 0x2a6aff, emissive: 0x2a6aff, emissiveIntensity: 2 }));
  b.position.x = 0.35; bar.add(b);
  bar.position.y = 1.42;
  g.add(bar);
  g.userData.lightR = r; g.userData.lightB = b;
  return g;
}

function heliMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.4, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 5.2), bodyMat);
  body.castShadow = true; g.add(body);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 1.6), new THREE.MeshStandardMaterial({ color: 0x9ac8e8, roughness: 0.1, metalness: 0.6 }));
  glass.position.set(0, 0.3, 1.8); g.add(glass);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.4), bodyMat);
  tail.position.set(0, 0.5, -4.2); g.add(tail);
  const rotor = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 }));
  rotor.add(blade);
  const blade2 = blade.clone(); blade2.rotation.y = Math.PI / 2; rotor.add(blade2);
  rotor.position.y = 1.15;
  g.add(rotor);
  // searchlight cone (visible at night only, subtle)
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(5, 18, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }),
  );
  cone.position.y = -9;
  cone.rotation.x = Math.PI;
  g.add(cone);
  g.userData = { rotor, cone };
  return g;
}

function footCopMesh() {
  const g = new THREE.Group();
  const uni = new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.85 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4), uni);
  body.position.y = 1.05; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.38), new THREE.MeshStandardMaterial({ color: 0xc98a5a, roughness: 0.8 }));
  head.position.y = 1.76; g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.42), new THREE.MeshStandardMaterial({ color: 0x101828, roughness: 0.7 }));
  cap.position.y = 1.98; g.add(cap);
  return g;
}

export class Wanted {
  constructor(scene, solids) {
    this.scene = scene;
    this.solids = solids;
    this.heat = 0;
    this.stars = 0;
    this.units = []; // {kind, callsign, mesh, x, z, heading, speed, state, hits}
    this.pending = []; // delayed witness reports {at, severity}
    this.time = 0;
    this.lastSeen = -100;
    this.blockers = []; // roadblock solids for collision
    this.heliDownTimer = 0;
    this.flash = 0;
  }

  get level() { return this.stars; }

  starsForHeat(h) {
    if (h >= 90) return 5;
    if (h >= 72) return 4;
    if (h >= 52) return 3;
    if (h >= 32) return 2;
    if (h >= 12) return 1;
    return 0;
  }

  // A crime happened. If witnessed, the police are phoned after 2.5 s.
  reportCrime(severity, witnessed, x, z) {
    if (!witnessed) return; // out of sight: nobody calls
    this.pending.push({ at: this.time + WANTED.witnessDelay, severity, x, z });
  }

  addHeat(n) {
    this.heat = clamp(this.heat + n, 0, 100);
    this.stars = this.starsForHeat(this.heat);
    this.lastSeen = this.time;
  }

  changeCar() {
    if (this.stars > 0) {
      this.heat = Math.max(0, this.heat - 16);
      this.stars = this.starsForHeat(this.heat);
      return true;
    }
    return false;
  }

  respray() {
    const had = this.stars > 0;
    this.heat = 0; this.stars = 0;
    this.clearUnits();
    return had;
  }

  clearUnits() {
    for (const u of this.units) {
      this.scene.remove(u.mesh);
      // a roadblock is 3 cars; the unit's mesh is only the first one
      if (u.blockers) for (const m of u.blockers) this.scene.remove(m);
    }
    this.units = [];
    this.blockers = [];
  }

  setWanted(stars, px, pz, heading = 0) {
    this.stars = clamp(stars, 0, 5);
    this.heat = [0, 14, 34, 54, 74, 92][this.stars];
    this.lastSeen = this.time;
    this.heading = heading;
    this.syncUnits(px, pz, heading);
  }

  syncUnits(px, pz, heading = 0) {
    this.heading = heading;
    const want = { cruiser: 0, heli: 0, foot: 0, swat: 0, roadblock: 0 };
    if (this.stars >= 1) want.cruiser = Math.min(this.stars, 3);
    if (this.stars >= 2) want.foot = 2;
    if (this.stars >= 3 && this.heliDownTimer <= 0) want.heli = 1;
    if (this.stars >= 4) want.roadblock = 1;
    if (this.stars >= 5) { want.swat = 2; want.cruiser = 4; }
    const count = (k) => this.units.filter((u) => u.kind === k).length;
    // spawn missing
    const spawn = (kind) => {
      const a = (this.units.length * 2.39996) % (Math.PI * 2);
      const d = 90 + (this.units.length % 3) * 30;
      const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      let mesh;
      if (kind === 'heli') mesh = heliMesh();
      else if (kind === 'foot') mesh = footCopMesh();
      else mesh = policeCarMesh();
      mesh.position.set(x, kind === 'heli' ? 55 : 0, z);
      this.scene.add(mesh);
      this.units.push({
        kind, callsign: CALLSIGNS[this.units.length % CALLSIGNS.length],
        mesh, x, z, heading: a, speed: 0, state: 'chase', hits: 0, t: 0, lastRam: -10,
      });
    };
    for (const k of ['cruiser', 'foot', 'heli', 'swat']) {
      while (count(k) < want[k]) spawn(k);
    }
    // roadblock is special: a wall of cars AHEAD of the player on the road,
    // spread across it so it stops you cold.
    if (want.roadblock > 0 && !this.units.some((u) => u.kind === 'roadblock')) {
      const hx = Math.sin(heading), hz = Math.cos(heading);
      const bx = px + hx * 55, bz = pz + hz * 55;
      const perpX = Math.cos(heading), perpZ = -Math.sin(heading);
      const blockers = [];
      for (let i = -1; i <= 1; i++) {
        const m = policeCarMesh();
        m.position.set(bx + perpX * i * 5.5, 0, bz + perpZ * i * 5.5);
        m.rotation.y = heading + Math.PI / 2;
        this.scene.add(m);
        blockers.push(m);
        this.blockers.push({ x: bx + perpX * i * 5.5, z: bz + perpZ * i * 5.5, hx: 2.4, hz: 2.4 });
      }
      this.units.push({ kind: 'roadblock', callsign: 'Roadblock', mesh: blockers[0], blockers, x: bx, z: bz, heading, speed: 0, state: 'roadblock', hits: 0, t: 0 });
    }
    // remove surplus
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u.kind === 'roadblock') {
        if (want.roadblock === 0) {
          for (const m of u.blockers) this.scene.remove(m);
          this.blockers = [];
          this.units.splice(i, 1);
        }
        continue;
      }
      if (count(u.kind) > want[u.kind]) {
        this.scene.remove(u.mesh);
        this.units.splice(i, 1);
      }
    }
  }

  // returns events: [{type:'ram'|'busted'|'heliDown', ...}]
  update(dt, player, solids) {
    this.time += dt;
    this.flash += dt;
    // delayed witness reports land
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.time >= this.pending[i].at) {
        this.addHeat(this.pending[i].severity);
        this.pending.splice(i, 1);
      }
    }
    if (this.heliDownTimer > 0) this.heliDownTimer -= dt;
    const p = player.pos;
    const events = [];
    // decay when unseen: no unit within 45 m and no recent sighting
    const seen = this.units.some((u) => u.kind !== 'roadblock' && dist2d(u.x, u.z, p.x, p.z) < 45);
    if (seen) this.lastSeen = this.time;
    if (this.stars > 0 && this.time - this.lastSeen > 8) {
      this.heat = Math.max(0, this.heat - WANTED.decayPerSec[this.stars] * 100 * dt * 0.12);
      const ns = this.starsForHeat(this.heat);
      if (ns !== this.stars) { this.stars = ns; this.syncUnits(p.x, p.z, player.inCar ? player.carHeading : player.heading); }
    }
    this.syncUnits(p.x, p.z, player.inCar ? player.carHeading : player.heading);
    // unit behaviour
    for (const u of this.units) {
      u.t += dt;
      if (u.kind === 'cruiser' || u.kind === 'swat') {
        const d = dist2d(u.x, u.z, p.x, p.z);
        const wantH = Math.atan2(p.x - u.x, p.z - u.z);
        let dh = wantH - u.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        u.heading += clamp(dh, -2.4 * dt, 2.4 * dt);
        const top = u.kind === 'swat' ? 40 : 34;
        u.speed = clamp(u.speed + (d > 10 ? 14 * dt : -20 * dt), 0, top);
        if (d < 6 && player.inCar) {
          // ram: damage the player's car, but at most once a second per unit
          if (this.time - u.lastRam > 1.0) {
            u.lastRam = this.time;
            events.push({ type: 'ram', at: u.callsign });
            u.speed = Math.max(0, u.speed - 12);
            player.carSpeed = (player.carSpeed || 0) * 0.6;
          }
        }
        if (d < 4 && !player.inCar) {
          events.push({ type: 'busted' });
        }
        // drive around buildings, never through them (like traffic)
        const nx = u.x + Math.sin(u.heading) * u.speed * dt;
        const nz = u.z + Math.cos(u.heading) * u.speed * dt;
        if (!hitsSolid(this.solids, nx, nz, 2.2)) { u.x = nx; u.z = nz; }
        else { u.heading += Math.PI / 2; u.speed = Math.max(0, u.speed - 10 * dt); }
        u.mesh.position.set(u.x, 0, u.z);
        u.mesh.rotation.y = u.heading;
        // flash the light bar
        const on = Math.floor(this.flash * 6) % 2 === 0;
        u.mesh.userData.lightR.material.emissiveIntensity = on ? 2.4 : 0.3;
        u.mesh.userData.lightB.material.emissiveIntensity = on ? 0.3 : 2.4;
      } else if (u.kind === 'heli') {
        // hover above the player, slowly circling
        const a = this.time * 0.25 + u.t * 0.1;
        const tx = p.x + Math.cos(a) * 26;
        const tz = p.z + Math.sin(a) * 26;
        u.x += (tx - u.x) * Math.min(1, 1.4 * dt);
        u.z += (tz - u.z) * Math.min(1, 1.4 * dt);
        u.mesh.position.set(u.x, 52 + Math.sin(this.time * 1.3) * 2.5, u.z);
        u.mesh.rotation.y = Math.atan2(p.x - u.x, p.z - u.z);
        u.mesh.userData.rotor.rotation.y += dt * 22;
        u.state = 'chase';
      } else if (u.kind === 'foot') {
        const d = dist2d(u.x, u.z, p.x, p.z);
        const wantH = Math.atan2(p.x - u.x, p.z - u.z);
        u.heading += clamp(wantH - u.heading, -3 * dt, 3 * dt);
        u.speed = d > 3 ? 6.5 : 0;
        // walk around buildings, never through them
        const nx = u.x + Math.sin(u.heading) * u.speed * dt;
        const nz = u.z + Math.cos(u.heading) * u.speed * dt;
        if (!hitsSolid(this.solids, nx, nz, 0.7)) { u.x = nx; u.z = nz; }
        else { u.heading += Math.PI / 2; }
        u.mesh.position.set(u.x, 0, u.z);
        u.mesh.rotation.y = u.heading;
        if (d < 2.2 && !player.inCar) events.push({ type: 'busted' });
      }
    }
    return events;
  }

  // The player shot at the helicopter. Returns 'down' | 'hit' | 'miss'.
  // The pistol fires flat (dy = 0), so the hit test is in the horizontal
  // plane: the heli counts as hit when the ray passes within 8 m of its
  // ground position inside 320 m. The player must aim at it.
  shootHeli(ray) {
    const heli = this.units.find((u) => u.kind === 'heli');
    if (!heli) return 'miss';
    const hx = heli.mesh.position.x, hz = heli.mesh.position.z;
    const dx = hx - ray.ox, dz = hz - ray.oz;
    const along = dx * ray.dx + dz * ray.dz;
    if (along < 0 || along > 320) return 'miss';
    const cx = ray.ox + ray.dx * along, cz = ray.oz + ray.dz * along;
    const dd = Math.sqrt((cx - hx) ** 2 + (cz - hz) ** 2);
    if (dd > 8) return 'miss';
    heli.hits++;
    if (heli.hits >= WANTED.heliHitsToDown) {
      // fireball: the heli falls and is gone
      this.scene.remove(heli.mesh);
      this.units = this.units.filter((u) => u !== heli);
      this.heat = Math.max(0, this.heat - 18);
      this.stars = this.starsForHeat(this.heat);
      this.heliDownTimer = 25;
      return 'down';
    }
    return 'hit';
  }

  unitList(player) {
    const p = player.pos;
    return this.units.map((u) => ({
      callsign: u.callsign,
      kind: u.kind,
      dist: Math.round(dist2d(u.x, u.z, p.x, p.z)),
      action: u.kind === 'roadblock' ? 'roadblock' : u.kind === 'heli' ? 'searchlight' : 'chasing',
    }));
  }
}

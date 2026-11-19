// Street races — 3 named races, checkpoints, live standings, rivals who
// actually drive the course. A race is laps around a checkpoint loop;
// position is by progress (lap + checkpoint + distance to next).
import * as THREE from 'three';
import { RACES } from './config.js';
import { dist2d, clamp } from './util.js';
import { makeCarMesh } from './vehicles.js';

export class RaceManager {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.active = null; // {def, lap, cp, rival:{...}, progress, startT, t}
    this.won = []; // race ids won
    this.markerMesh = null;
  }

  get racing() { return !!this.active; }

  start(raceId, player, onEvent) {
    const def = RACES.find((r) => r.id === raceId);
    if (!def || this.active) return false;
    // rival car on the line beside and just ahead of the player
    const p = player.pos;
    const rivalDef = { name: 'Vex Interceptor', color: 0x111111, top: 54, accel: 24, handling: 0.95 };
    const mesh = makeCarMesh(rivalDef);
    mesh.position.set(p.x + 5, 0, p.z - 10);
    this.scene.add(mesh);
    this.active = {
      def, lap: 0, cp: 0, t: 0, startT: 0,
      rival: { mesh, x: p.x + 5, z: p.z - 10, heading: player.inCar ? player.carHeading : player.heading, speed: 0, cp: 0, lap: 0, progress: 0 },
      playerProgress: 0,
    };
    this.showMarker(def.checkpoints[0]);
    onEvent('race-start', { def });
    return true;
  }

  showMarker(cp) {
    this.hideMarker();
    const geo = new THREE.CylinderGeometry(6, 6, 0.4, 20);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.5 });
    this.markerMesh = new THREE.Mesh(geo, mat);
    this.markerMesh.position.set(cp[0], 0.5, cp[1]);
    this.scene.add(this.markerMesh);
  }
  hideMarker() {
    if (this.markerMesh) { this.scene.remove(this.markerMesh); this.markerMesh = null; }
  }

  standings() {
    if (!this.active) return [];
    const a = this.active;
    const pProg = a.lap * 1000 + a.cp * 100 + a.playerProgress;
    const rProg = a.rival.lap * 1000 + a.rival.cp * 100 + a.rival.progress;
    const rows = [
      { name: 'Dante Cruz', you: true, prog: pProg },
      { name: a.def.rival === 'vex' ? 'Vex' : a.def.rival === 'rosa' ? 'Rosa Delgado' : 'Tomas Reyes', you: false, prog: rProg },
    ];
    rows.sort((x, y) => y.prog - x.prog);
    return rows.map((r, i) => ({ pos: i + 1, name: r.name, you: r.you }));
  }

  // returns 'won' | 'lost' | null
  update(dt, player, onEvent) {
    if (!this.active) return null;
    const a = this.active;
    a.t += dt;
    const def = a.def;
    const cps = def.checkpoints;
    // player checkpoint
    const p = player.pos;
    const next = cps[a.cp];
    const d = dist2d(p.x, p.z, next[0], next[1]);
    a.playerProgress = clamp(100 - d, 0, 100);
    if (d < 12) {
      a.cp++;
      if (a.cp >= cps.length) { a.cp = 0; a.lap++; }
      if (a.lap >= def.laps) return this.finish(true, onEvent);
      this.showMarker(cps[a.cp]);
      onEvent('checkpoint', { lap: a.lap + 1, total: def.laps });
    }
    // rival drives the loop (simple pursuit of the next checkpoint)
    const r = a.rival;
    const rc = cps[r.cp];
    const rdx = rc[0] - r.x, rdz = rc[1] - r.z;
    const rd = Math.sqrt(rdx * rdx + rdz * rdz);
    const wantH = Math.atan2(rdx, rdz);
    let dh = wantH - r.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    r.heading += clamp(dh, -2.2 * dt, 2.2 * dt);
    r.speed = clamp(r.speed + 12 * dt, 0, 50);
    r.x += Math.sin(r.heading) * r.speed * dt;
    r.z += Math.cos(r.heading) * r.speed * dt;
    r.progress = clamp(100 - rd, 0, 100);
    r.mesh.position.set(r.x, 0, r.z);
    r.mesh.rotation.y = r.heading;
    if (rd < 12) {
      r.cp++;
      if (r.cp >= cps.length) { r.cp = 0; r.lap++; }
      if (r.lap >= def.laps) return this.finish(false, onEvent);
    }
    // marker pulse
    if (this.markerMesh) this.markerMesh.material.opacity = 0.35 + Math.sin(a.t * 5) * 0.15;
    return null;
  }

  finish(won, onEvent) {
    const def = this.active.def;
    this.scene.remove(this.active.rival.mesh);
    this.hideMarker();
    const wasWon = won;
    if (won && !this.won.includes(def.id)) this.won.push(def.id);
    this.active = null;
    onEvent('race-finish', { def, won: wasWon });
    return wasWon ? 'won' : 'lost';
  }

  abort() {
    if (!this.active) return;
    this.scene.remove(this.active.rival.mesh);
    this.hideMarker();
    this.active = null;
  }
}

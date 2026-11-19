// Side activities, kept DEEP: taxi fares, 15 hidden Sun Discs, a weapon
// shop, the garage (respray + repair), respect ranks, % COMPLETE.
import * as THREE from 'three';
import { ECONOMY, SUN_DISCS, GARAGE, SHOP, CARS } from './config.js';
import { makeRng, dist2d, fmtMoney } from './util.js';

export class Activities {
  constructor(scene, rng, solids) {
    this.scene = scene;
    this.rng = rng;
    this.solids = solids;
    this.respect = 0;
    this.faresDone = 0;
    this.discs = 0;
    this.fare = null; // {px, pz, dx, dz, passenger}
    this.discMeshes = [];
    this.buildDiscs();
    this.buildMarkers();
  }

  respectRank() {
    const r = this.respect;
    const ranks = ECONOMY.ranks;
    if (r >= 80) return ranks[4];
    if (r >= 50) return ranks[3];
    if (r >= 28) return ranks[2];
    if (r >= 12) return ranks[1];
    return ranks[0];
  }

  addRespect(n) { this.respect += n; }

  buildMarkers() {
    // garage + shop beacons: short, subtle light pillars so they read as
    // wayfinding, not skyscrapers.
    const mk = (x, z, color) => {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(1.0, 1.0, 16, 10, 1, true),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }),
      );
      m.position.set(x, 8, z);
      this.scene.add(m);
    };
    mk(GARAGE.x, GARAGE.z, 0x2aff7a);
    mk(SHOP.x, SHOP.z, 0xffc832);
  }

  buildDiscs() {
    const geo = new THREE.TorusGeometry(1.1, 0.32, 8, 20);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xa88000, emissiveIntensity: 0.9, metalness: 0.8, roughness: 0.3 });
    for (let i = 0; i < SUN_DISCS; i++) {
      // deterministic spread: a ring + a few landmarks
      const a = (i / SUN_DISCS) * Math.PI * 2;
      const r = 120 + (i % 4) * 90;
      let x = Math.cos(a) * r, z = Math.sin(a) * r;
      x = Math.max(-480, Math.min(480, x));
      z = Math.max(-480, Math.min(480, z));
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, 2.2, z);
      m.rotation.x = Math.PI / 2.4;
      this.scene.add(m);
      this.discMeshes.push({ mesh: m, x, z, got: false });
    }
  }

  // discs spin; collect on touch
  update(dt, player, onEvent) {
    const p = player.pos;
    for (const d of this.discMeshes) {
      if (d.got) continue;
      d.mesh.rotation.z += dt * 1.2;
      d.mesh.position.y = 2.2 + Math.sin(this.scene.userData.time * 2 + d.x) * 0.35;
      if (dist2d(p.x, p.z, d.x, d.z) < 3.2) {
        d.got = true;
        d.mesh.visible = false;
        this.discs++;
        player.cash += ECONOMY.discReward;
        this.addRespect(ECONOMY.respectPerDisc);
        onEvent('disc', { n: this.discs, total: SUN_DISCS, reward: ECONOMY.discReward });
      }
    }
    // taxi fare: passenger waits, then ride to the destination
    if (this.fare && this.fare.stage === 'pickup' && dist2d(p.x, p.z, this.fare.px, this.fare.pz) < 8) {
      this.fare.stage = 'drop';
      onEvent('fare-pickup', { dest: this.fare.destName });
    } else if (this.fare && this.fare.stage === 'drop' && dist2d(p.x, p.z, this.fare.dx, this.fare.dz) < 10) {
      player.cash += ECONOMY.taxiFare;
      this.faresDone++;
      this.addRespect(ECONOMY.respectPerFare);
      onEvent('fare-done', { fare: ECONOMY.taxiFare, n: this.faresDone });
      this.fare = null;
    }
  }

  startFare(player, onEvent) {
    if (this.fare || !player.inCar) return false;
    const p = player.pos;
    const spots = [
      { x: -380, z: 300, name: 'Puerto Viejo docks' },
      { x: -120, z: -330, name: 'Fortuna Casino' },
      { x: 380, z: 120, name: 'Playa Norte boardwalk' },
      { x: 300, z: 330, name: 'Barrio Alto' },
      { x: -60, z: 60, name: 'Mercado Central' },
      { x: 330, z: -300, name: 'La Loma' },
    ];
    const dest = spots[this.rng.int(0, spots.length - 1)];
    // passenger stands near the player
    const px = p.x + 12, pz = p.z + 6;
    this.fare = { px, pz, dx: dest.x, dz: dest.z, destName: dest.name, stage: 'pickup' };
    onEvent('fare-start', { dest: dest.name, fare: ECONOMY.taxiFare });
    return true;
  }

  atGarage(player) {
    const p = player.pos;
    return dist2d(p.x, p.z, GARAGE.x, GARAGE.z) < 16;
  }
  atShop(player) {
    const p = player.pos;
    return dist2d(p.x, p.z, SHOP.x, SHOP.z) < 14;
  }

  respray(player, wanted) {
    if (!this.atGarage(player)) return { ok: false, why: 'not at the garage' };
    if (player.cash < 250) return { ok: false, why: 'not enough cash' };
    const had = wanted.respray();
    player.cash -= 250;
    if (player.inCar) player.inCar.condition = 100;
    return { ok: true, cleared: had };
  }

  buyPistol(player) {
    if (player.weapon === 'pistol') {
      if (player.cash < 60) return { ok: false, why: 'not enough cash' };
      player.ammo += 30;
      player.cash -= 60;
      return { ok: true, what: 'ammo' };
    }
    if (player.cash < 400) return { ok: false, why: 'not enough cash' };
    player.cash -= 400;
    player.weapon = 'pistol';
    player.ammo = 48;
    return { ok: true, what: 'pistol' };
  }

  completePct(missionsDone, racesWon) {
    const m = (missionsDone / 7) * 55;
    const r = (racesWon / 3) * 15;
    const d = (this.discs / SUN_DISCS) * 15;
    const f = Math.min(15, this.faresDone * 1.5);
    return Math.min(100, Math.round(m + r + d + f));
  }
}

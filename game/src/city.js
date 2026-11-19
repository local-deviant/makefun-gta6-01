// ISLA FORTUNA — the city itself, built procedurally from the fixed seed.
// Buildings are boxes with window textures drawn by code; the ground (roads,
// sidewalks, blocks, beach, causeway) is one big canvas texture. No models,
// no textures from disk. Deterministic: same seed, same city.
import * as THREE from 'three';
import { CITY, DISTRICTS, LANDMARKS, LIGHTS, SEED } from './config.js';
import { makeRng, clamp } from './util.js';

const GRID = [-460, -368, -276, -184, -92, 0, 92, 184, 276, 368, 460];
const WORLD = 560; // half-extent of the ground plane

function districtAt(x, z) {
  let best = DISTRICTS[0], bd = Infinity;
  for (const d of DISTRICTS) {
    const dd = (x - d.cx) * (x - d.cx) + (z - d.cz) * (z - d.cz);
    if (dd < bd) { bd = dd; best = d; }
  }
  return best;
}

// A tileable window facade, drawn on a canvas. Variant picks the lit ratio.
function facadeTexture(rng, base, lit) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // subtle vertical shading
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.25)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  // window grid 4 x 10
  for (let r = 0; r < 10; r++) {
    for (let col = 0; col < 4; col++) {
      const x = 10 + col * 30, y = 10 + r * 24;
      const on = rng.next() < lit;
      g.fillStyle = on ? '#ffd98a' : '#1c2733';
      g.fillRect(x, y, 20, 14);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(x, y, 20, 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function groundTexture(rng) {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const px = (v) => ((v + WORLD) / (WORLD * 2)) * S;
  const pw = (v) => (v / (WORLD * 2)) * S;
  // island base: warm concrete
  g.fillStyle = '#9a8f7a';
  g.fillRect(0, 0, S, S);
  // beach ring (sand) near the rim
  g.strokeStyle = '#e8d9a8';
  g.lineWidth = pw(46);
  g.beginPath();
  g.arc(S / 2, S / 2, pw(WORLD - 20), 0, Math.PI * 2);
  g.stroke();
  // district ground tint
  for (const d of DISTRICTS) {
    g.fillStyle = d.palette[0] + '55';
    g.beginPath();
    g.arc(px(d.cx), px(d.cz), pw(d.r), 0, Math.PI * 2);
    g.fill();
  }
  // blocks: slightly darker pavement between roads
  g.fillStyle = '#8a7f6c';
  for (let i = 0; i < GRID.length - 1; i++) {
    for (let j = 0; j < GRID.length - 1; j++) {
      const x0 = GRID[i] + 10, x1 = GRID[i + 1] - 10;
      const z0 = GRID[j] + 10, z1 = GRID[j + 1] - 10;
      if (rng.next() < 0.5) g.fillStyle = '#8a7f6c'; else g.fillStyle = '#94886f';
      g.fillRect(px(x0), px(z0), pw(x1 - x0), pw(z1 - z0));
    }
  }
  // roads: dark asphalt + centre dashes + sidewalks
  for (const v of GRID) {
    // sidewalk band
    g.fillStyle = '#b8ab8d';
    g.fillRect(px(v - CITY.roadHalf - CITY.sidewalk), 0, pw((CITY.roadHalf + CITY.sidewalk) * 2), S);
    g.fillRect(0, px(v - CITY.roadHalf - CITY.sidewalk), S, pw((CITY.roadHalf + CITY.sidewalk) * 2));
    // asphalt
    g.fillStyle = '#33363b';
    g.fillRect(px(v - CITY.roadHalf), 0, pw(CITY.roadHalf * 2), S);
    g.fillRect(0, px(v - CITY.roadHalf), S, pw(CITY.roadHalf * 2));
    // dashes
    g.fillStyle = '#d8c832';
    for (let d = -WORLD; d < WORLD; d += 24) {
      g.fillRect(px(v) - 1.5, px(d), 3, pw(10));
      g.fillRect(px(d), px(v) - 1.5, pw(10), 3);
    }
  }
  // ring road (circle)
  g.strokeStyle = '#33363b';
  g.lineWidth = pw(14);
  g.beginPath(); g.arc(S / 2, S / 2, pw(500), 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#d8c832';
  g.lineWidth = 3;
  g.setLineDash([14, 14]);
  g.beginPath(); g.arc(S / 2, S / 2, pw(500), 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  // causeway to the lighthouse islet (south-west diagonal)
  g.strokeStyle = '#b8ab8d';
  g.lineWidth = pw(16);
  g.beginPath(); g.moveTo(px(-440), px(-440)); g.lineTo(px(-540), px(-540)); g.stroke();
  g.strokeStyle = '#33363b';
  g.lineWidth = pw(10);
  g.beginPath(); g.moveTo(px(-440), px(-440)); g.lineTo(px(-540), px(-540)); g.stroke();
  // lighthouse islet
  g.fillStyle = '#e8d9a8';
  g.beginPath(); g.arc(px(-540), px(-540), pw(34), 0, Math.PI * 2); g.fill();
  // plaza in Mercado Central
  g.fillStyle = '#c9a06a';
  g.beginPath(); g.arc(px(-60), px(60), pw(44), 0, Math.PI * 2); g.fill();
  // paving rings so the plaza is not one flat brown disc
  g.strokeStyle = 'rgba(120,90,50,0.55)';
  g.lineWidth = pw(1.6);
  for (const r of [14, 26, 38]) {
    g.beginPath(); g.arc(px(-60), px(60), pw(r), 0, Math.PI * 2); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildCity(scene) {
  const rng = makeRng(SEED);
  const group = new THREE.Group();
  const solids = []; // {x,z,hx,hz} collision boxes
  const addSolid = (x, z, hx, hz) => solids.push({ x, z, hx, hz });

  // --- sea + island ground ---
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshStandardMaterial({ color: 0x1a5a8a, roughness: 0.35, metalness: 0.1 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.6;
  sea.receiveShadow = true;
  group.add(sea);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD * 2, WORLD * 2),
    new THREE.MeshStandardMaterial({ map: groundTexture(rng), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // --- building materials (a small pool of facades) ---
  const facades = [];
  for (let i = 0; i < 6; i++) {
    const base = ['#7a6a58', '#5e6a72', '#8a5a3a', '#3a4a6e', '#6e5a3a', '#9a8a6a'][i];
    facades.push(facadeTexture(rng, base, 0.32 + i * 0.04));
  }
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 0.9 });

  // --- buildings, block by block ---
  const skipNear = (x, z) => {
    for (const L of LANDMARKS) {
      if (Math.abs(x - L.x) < 70 && Math.abs(z - L.z) < 70) return true;
    }
    return false;
  };
  let buildingCount = 0;
  for (let i = 0; i < GRID.length - 1; i++) {
    for (let j = 0; j < GRID.length - 1; j++) {
      const cx = (GRID[i] + GRID[i + 1]) / 2;
      const cz = (GRID[j] + GRID[j + 1]) / 2;
      if (Math.abs(cx) > 480 || Math.abs(cz) > 480) continue;
      if (skipNear(cx, cz)) continue;
      if (rng.next() < 0.12) continue; // empty lot / park
      const d = districtAt(cx, cz);
      const n = rng.int(1, 3);
      for (let k = 0; k < n; k++) {
        const w = rng.range(16, 30);
        const dep = rng.range(16, 30);
        const h = rng.range(d.h[0], d.h[1]);
        const ox = cx + rng.range(-18, 18);
        const oz = cz + rng.range(-18, 18);
        const mat = new THREE.MeshStandardMaterial({
          map: facades[rng.int(0, 5)].clone(),
          roughness: 0.85,
        });
        mat.map.repeat.set(Math.max(1, Math.round(w / 14)), Math.max(1, Math.round(h / 22)));
        mat.map.needsUpdate = true;
        const m = new THREE.Mesh(boxGeo, mat);
        m.position.set(ox, h / 2, oz);
        m.scale.set(w, h, dep);
        m.castShadow = true;
        m.receiveShadow = true;
        group.add(m);
        // flat roof cap
        const roof = new THREE.Mesh(boxGeo, roofMat);
        roof.position.set(ox, h + 0.4, oz);
        roof.scale.set(w * 0.94, 0.8, dep * 0.94);
        group.add(roof);
        addSolid(ox, oz, w / 2 + 0.5, dep / 2 + 0.5);
        buildingCount++;
        if (buildingCount > 220) break;
      }
      if (buildingCount > 220) break;
    }
    if (buildingCount > 220) break;
  }

  // --- landmarks ---
  const landmarkMeshes = (kind, x, z) => {
    if (kind === 'casino') {
      const base = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x2b3a5e, roughness: 0.4, metalness: 0.3 }));
      base.position.set(x, 26, z); base.scale.set(70, 52, 44); base.castShadow = true; group.add(base);
      addSolid(x, z, 36, 23);
      const tower = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xc9a13a, roughness: 0.35, metalness: 0.5, emissive: 0x6a4a00 }));
      tower.position.set(x, 62, z); tower.scale.set(22, 20, 22); tower.castShadow = true; group.add(tower);
      // neon crown
      const crown = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xff2a6e, emissive: 0xff2a6e, emissiveIntensity: 1.6 }));
      crown.position.set(x, 74, z); crown.scale.set(24, 2.5, 24); group.add(crown);
    } else if (kind === 'lighthouse') {
      const isle = new THREE.Mesh(new THREE.CylinderGeometry(30, 34, 3, 20), new THREE.MeshStandardMaterial({ color: 0xd8cba8, roughness: 1 }));
      isle.position.set(x, 0.5, z); group.add(isle);
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 46, 12), new THREE.MeshStandardMaterial({ color: 0xf2ead2, roughness: 0.7 }));
      tower.position.set(x, 25, z); tower.castShadow = true; group.add(tower);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(4.5, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffd76a, emissiveIntensity: 2.5 }));
      lamp.position.set(x, 50, z); group.add(lamp);
      addSolid(x, z, 8, 8);
      // causeway deck
      const deck = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x9a8f7a, roughness: 1 }));
      deck.position.set(-490, 1.2, -490); deck.scale.set(10, 2.4, 130); deck.rotation.y = Math.PI / 4; group.add(deck);
    } else if (kind === 'cathedral') {
      const body = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.8 }));
      body.position.set(x, 16, z); body.scale.set(46, 32, 30); body.castShadow = true; group.add(body);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(11, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2b6a8a, roughness: 0.4, metalness: 0.3 }));
      dome.position.set(x, 32, z); group.add(dome);
      const t1 = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.8 }));
      t1.position.set(x - 18, 26, z); t1.scale.set(8, 52, 8); group.add(t1);
      const t2 = t1.clone(); t2.position.x = x + 18; group.add(t2);
      addSolid(x, z, 24, 16);
    } else if (kind === 'port') {
      const cols = [0xc93a2b, 0x2b6a8a, 0xe8c832, 0x4a7a3a];
      for (let a = 0; a < 10; a++) {
        const cx = x + rng.range(-50, 50), cz = z + rng.range(-40, 40);
        const h = rng.int(1, 3);
        for (let s = 0; s < h; s++) {
          const box = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: cols[(a + s) % 4], roughness: 0.7 }));
          box.position.set(cx, 2.5 + s * 5, cz); box.scale.set(12, 5, 5);
          box.castShadow = true; group.add(box);
        }
        addSolid(cx, cz, 6.5, 3);
      }
      // crane
      const crane = new THREE.Group();
      const leg = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xd8c832, roughness: 0.6 }));
      leg.position.y = 25; leg.scale.set(4, 50, 4); crane.add(leg);
      const arm = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xd8c832, roughness: 0.6 }));
      arm.position.set(18, 48, 0); arm.scale.set(44, 3, 3); crane.add(arm);
      crane.position.set(x + 40, 0, z - 30);
      group.add(crane);
    } else if (kind === 'stadium') {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(46, 50, 22, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.8, side: THREE.DoubleSide }));
      ring.position.set(x, 11, z); ring.castShadow = true; group.add(ring);
      const field = new THREE.Mesh(new THREE.CircleGeometry(44, 24), new THREE.MeshStandardMaterial({ color: 0x3a8a4a, roughness: 1 }));
      field.rotation.x = -Math.PI / 2; field.position.set(x, 0.4, z); group.add(field);
      addSolid(x, z, 48, 48);
    }
  };
  for (const L of LANDMARKS) landmarkMeshes(L.kind, L.x, L.z);

  // --- palm trees on Playa Norte ---
  const palmTrunk = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 });
  const palmLeaf = new THREE.MeshStandardMaterial({ color: 0x2b7a3a, roughness: 0.9, side: THREE.DoubleSide });
  for (let i = 0; i < 42; i++) {
    const x = rng.range(300, 500), z = rng.range(40, 260);
    const h = rng.range(7, 11);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, h, 6), palmTrunk);
    trunk.position.set(x, h / 2, z); trunk.rotation.z = rng.range(-0.12, 0.12);
    group.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(3.2, 3.4, 7), palmLeaf);
    crown.position.set(x, h + 1.4, z); crown.scale.y = 0.55;
    group.add(crown);
  }

  // --- market stalls in Mercado Central ---
  const stallCols = [0xc93a2b, 0xe8c832, 0x2b6a8a, 0x7a2b5e];
  for (let i = 0; i < 14; i++) {
    const x = -60 + rng.range(-70, 70), z = 60 + rng.range(-60, 60);
    if (Math.abs(x + 60) < 18 && Math.abs(z - 60) < 18) continue;
    const stall = new THREE.Group();
    const counter = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x8a6f4d, roughness: 1 }));
    counter.position.y = 1; counter.scale.set(5, 2, 3); stall.add(counter);
    const awn = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: stallCols[i % 4], roughness: 0.9 }));
    awn.position.y = 3.2; awn.scale.set(6, 0.3, 4); awn.rotation.z = 0.12; stall.add(awn);
    stall.position.set(x, 0, z);
    group.add(stall);
    addSolid(x, z, 3, 2);
  }

  // plaza centrepiece: a fountain, and stalls ringing the plaza so the
  // market reads as a market, not one big empty brown disc.
  const fountain = new THREE.Group();
  const fBase = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 1.6, 14), new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.9 }));
  fBase.position.y = 0.8; fountain.add(fBase);
  const fWater = new THREE.Mesh(new THREE.CircleGeometry(4.2, 14), new THREE.MeshStandardMaterial({ color: 0x2b8ac9, roughness: 0.2, metalness: 0.3 }));
  fWater.rotation.x = -Math.PI / 2; fWater.position.y = 1.65; fountain.add(fWater);
  const fCol = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.0, 3.2, 10), new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.9 }));
  fCol.position.y = 2.6; fountain.add(fCol);
  fountain.position.set(-60, 0, 60);
  group.add(fountain);
  addSolid(-60, 60, 6.5, 6.5);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const x = -60 + Math.cos(a) * 30, z = 60 + Math.sin(a) * 30;
    const stall = new THREE.Group();
    const counter = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x8a6f4d, roughness: 1 }));
    counter.position.y = 1; counter.scale.set(5, 2, 3); stall.add(counter);
    const awn = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: stallCols[(i + 2) % 4], roughness: 0.9 }));
    awn.position.y = 3.2; awn.scale.set(6, 0.3, 4); awn.rotation.z = 0.12; stall.add(awn);
    stall.position.set(x, 0, z);
    stall.rotation.y = -a + Math.PI / 2;
    group.add(stall);
    addSolid(x, z, 3, 2);
  }

  // --- traffic lights ---
  const lights = [];
  for (const L of LIGHTS) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 6.5, 8), new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.6 }));
    pole.position.y = 3.25; g.add(pole);
    const head = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 }));
    head.position.y = 6.4; head.scale.set(1.1, 2.6, 0.8); g.add(head);
    const mk = (dy, color) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 }));
      s.position.set(0, 6.4 + dy, 0.45); g.add(s); return s;
    };
    const red = mk(0.75, 0xff2a2a), amber = mk(0, 0xffc832), green = mk(-0.75, 0x2aff5a);
    g.position.set(L.x + 9, 0, L.z + 9);
    group.add(g);
    lights.push({ x: L.x, z: L.z, red, amber, green, phase: rng.next() * 14, mesh: g });
  }

  scene.add(group);
  return {
    group, solids, lights, buildingCount,
    districtAt,
    gridLines: GRID,
    // traffic light state: NS green when phase in [0,7), EW green in [7,14)
    lightPhase(t) {
      for (const L of lights) {
        const p = (t + L.phase) % 14;
        const nsGreen = p < 6.4;
        const amber = (p >= 6.4 && p < 7) || (p >= 13.4);
        L.red.material.emissiveIntensity = nsGreen ? 0.15 : 1.8;
        L.amber.material.emissiveIntensity = amber ? 1.8 : 0.15;
        L.green.material.emissiveIntensity = nsGreen ? 1.8 : 0.15;
        L.nsGreen = nsGreen;
      }
    },
    // is the light red for a car travelling along +x/-x (EW) or +z/-z (NS)?
    redFor(x, z, alongX) {
      for (const L of lights) {
        if (Math.abs(x - L.x) < 16 && Math.abs(z - L.z) < 16) {
          return alongX ? L.nsGreen : !L.nsGreen;
        }
      }
      return false;
    },
  };
}

// Point-in-solid test (AABB) for player / car collision.
export function hitsSolid(solids, x, z, r) {
  for (const s of solids) {
    if (Math.abs(x - s.x) < s.hx + r && Math.abs(z - s.z) < s.hz + r) return s;
  }
  return null;
}

export function clampToIsland(x, z, margin = 12) {
  return {
    x: clamp(x, -WORLD + margin, WORLD - margin),
    z: clamp(z, -WORLD + margin, WORLD - margin),
  };
}

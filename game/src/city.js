// GOLDEN TIDE 3D — the city of Costa Dorada.
// Builds the island ground (canvas texture: roads, districts, beach, plaza),
// the buildings (seeded, per-district style), the landmarks, palms, lamps and
// the water. Returns the layout the game logic needs: building colliders,
// road helpers, spawn points and the ground canvas for the minimap.

import * as THREE from '../vendor/three.module.min.js';
import { DISTRICTS, LANDMARKS, ROAD_STEP, GRID_MIN, GRID_MAX, ISLAND_HALF, districtAt } from './config.js';
import { mulberry32, makeCanvas, clamp } from './util.js';

const TEX = 2048; // ground texture size (px) for a 1500-unit island
const WORLD = ISLAND_HALF * 2;
function tx(x) { return (x + ISLAND_HALF) / WORLD * TEX; } // world x -> canvas px
function tz(z) { return (z + ISLAND_HALF) / WORLD * TEX; }
function tw(w) { return w / WORLD * TEX; }

// --- window facades -------------------------------------------------------
function facadeTexture(rng, litRatio) {
  return new THREE.CanvasTexture(makeCanvas(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#cfc8bd'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let y = 0; y < h; y += 32) ctx.fillRect(0, y, w, 2);
    const cols = 4, rows = 8, cw = w / cols, ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = rng() < litRatio;
        ctx.fillStyle = lit ? '#ffd88a' : '#2a3548';
        ctx.fillRect(c * cw + 6, r * ch + 8, cw - 12, ch - 16);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(c * cw + 6, r * ch + 8, cw - 12, 4);
      }
    }
  }));
}

// --- ground texture -------------------------------------------------------
function groundCanvas() {
  return makeCanvas(TEX, TEX, (ctx) => {
    // base grass
    ctx.fillStyle = '#5a8a4a'; ctx.fillRect(0, 0, TEX, TEX);
    // district tints
    for (const d of DISTRICTS) {
      ctx.fillStyle = d.tint; ctx.globalAlpha = 0.35;
      ctx.fillRect(tx(d.cx - d.hw), tz(d.cz - d.hd), tw(d.hw * 2), tw(d.hd * 2));
    }
    ctx.globalAlpha = 1;
    // park blobs
    const rng = mulberry32(7);
    for (let i = 0; i < 26; i++) {
      const x = (rng() * 2 - 1) * 620, z = (rng() * 2 - 1) * 620;
      ctx.fillStyle = '#4a7a3e';
      ctx.beginPath(); ctx.ellipse(tx(x), tz(z), tw(30 + rng() * 40), tw(20 + rng() * 30), rng() * 3, 0, Math.PI * 2); ctx.fill();
    }
    // beach ring (sand) just inside the island edge
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(0, 0, TEX, tw(46));
    ctx.fillRect(0, TEX - tw(46), TEX, tw(46));
    ctx.fillRect(0, 0, tw(46), TEX);
    ctx.fillRect(TEX - tw(46), 0, tw(46), TEX);
    // lighthouse islet + causeway (north)
    ctx.fillStyle = '#e8d29a';
    ctx.beginPath(); ctx.arc(tx(0), tz(-720), tw(55), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a3a3a'; ctx.fillRect(tx(-9), tz(-760), tw(18), tw(280));
    // marina water inlet (south-west)
    ctx.fillStyle = '#2a6a8a';
    ctx.fillRect(tx(-500), tz(430), tw(180), tw(70));
    // port concrete (south-east)
    ctx.fillStyle = '#8a8f96';
    ctx.fillRect(tx(300), tz(180), tw(200), tw(320));
    // plaza (Casco Viejo)
    ctx.fillStyle = '#d8c8a0';
    ctx.fillRect(tx(-340), tz(-190), tw(80), tw(80));
    // sidewalks + roads
    for (let g = GRID_MIN; g <= GRID_MAX; g += ROAD_STEP) {
      ctx.fillStyle = '#b8b0a0';
      ctx.fillRect(tx(g - 11), 0, tw(22), TEX);
      ctx.fillRect(0, tz(g - 11), TEX, tw(22));
      ctx.fillStyle = '#33363c';
      ctx.fillRect(tx(g - 7), 0, tw(14), TEX);
      ctx.fillRect(0, tz(g - 7), TEX, tw(14));
    }
    // lane dashes
    ctx.fillStyle = '#e8d88a';
    for (let g = GRID_MIN; g <= GRID_MAX; g += ROAD_STEP) {
      for (let p = GRID_MIN; p <= GRID_MAX; p += 24) {
        ctx.fillRect(tx(g - 0.8), tz(p), tw(1.6), tw(10));
        ctx.fillRect(tx(p), tz(g - 0.8), tw(10), tw(1.6));
      }
    }
    // crosswalks at every intersection
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let gx = GRID_MIN; gx <= GRID_MAX; gx += ROAD_STEP) {
      for (let gz = GRID_MIN; gz <= GRID_MAX; gz += ROAD_STEP) {
        for (let i = -3; i <= 3; i++) {
          ctx.fillRect(tx(gx + i * 3.4 - 1), tz(gz - 10), tw(2), tw(5));
          ctx.fillRect(tx(gx + i * 3.4 - 1), tz(gz + 5), tw(2), tw(5));
          ctx.fillRect(tx(gx - 10), tz(gz + i * 3.4 - 1), tw(5), tw(2));
          ctx.fillRect(tx(gx + 5), tz(gz + i * 3.4 - 1), tw(5), tw(2));
        }
      }
    }
  });
}

// --- buildings ------------------------------------------------------------
function buildBuildings(scene, rng, colliders) {
  const group = new THREE.Group();
  group.name = 'buildings';
  const facades = [facadeTexture(mulberry32(11), 0.25), facadeTexture(mulberry32(23), 0.45), facadeTexture(mulberry32(37), 0.15)];
  for (const f of facades) { f.colorSpace = THREE.SRGBColorSpace; f.wrapS = f.wrapT = THREE.RepeatWrapping; }
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 0.9 });
  const mats = new Map();
  function matFor(color, fi) {
    const key = color + '|' + fi;
    if (!mats.has(key)) {
      mats.set(key, new THREE.MeshStandardMaterial({ map: facades[fi], color, roughness: 0.85, metalness: 0.05 }));
    }
    return mats.get(key);
  }
  // blocks: cells between roads
  for (let i = -5; i < 5; i++) {
    for (let j = -5; j < 5; j++) {
      const bx0 = i * ROAD_STEP + 11, bz0 = j * ROAD_STEP + 11;
      const cx = bx0 + 39, cz = bz0 + 39;
      const d = districtAt(cx, cz);
      if (!d) continue;
      // skip special plots
      if (d.id === 'casco' && Math.abs(cx + 300) < 60 && Math.abs(cz + 150) < 60) continue; // plaza
      if (d.id === 'northgate' && Math.abs(cx - 50) < 70 && Math.abs(cz + 420) < 60) continue; // stadium
      if (d.id === 'puerto') continue; // containers instead
      if (d.id === 'marina' && cz > 420) continue; // docks
      const n = d.style === 'strip' ? 2 : (d.style === 'villa' || d.style === 'suburb' ? 3 : (rng() < 0.5 ? 2 : 1));
      for (let k = 0; k < n; k++) {
        const w = 18 + rng() * 22, dep = 18 + rng() * 22;
        const ox = bx0 + 10 + rng() * (78 - w), oz = bz0 + 10 + rng() * (78 - dep);
        const h = d.minH + rng() * (d.maxH - d.minH);
        const color = d.palette[Math.floor(rng() * d.palette.length)];
        const fi = Math.floor(rng() * facades.length);
        const m = new THREE.Mesh(boxGeo, matFor(color, fi));
        m.scale.set(w, h, dep);
        m.position.set(ox + w / 2, h / 2, oz + dep / 2);
        m.castShadow = true; m.receiveShadow = true;
        // repeat the facade so windows stay small on tall towers
        const f = facades[fi].clone(); f.needsUpdate = true;
        f.repeat.set(Math.max(1, Math.round(w / 14)), Math.max(1, Math.round(h / 22)));
        m.material = matFor(color, fi);
        group.add(m);
        // roof cap
        const roof = new THREE.Mesh(boxGeo, roofMat);
        roof.scale.set(w + 0.6, 0.8, dep + 0.6);
        roof.position.set(ox + w / 2, h + 0.4, oz + dep / 2);
        group.add(roof);
        colliders.push({ minX: ox, maxX: ox + w, minZ: oz, maxZ: oz + dep });
      }
    }
  }
  // port containers (stacked boxes)
  const contCols = [0xb03030, 0x2a6a3a, 0x2a4a8a, 0xc8a018];
  for (let i = 0; i < 46; i++) {
    const x = 320 + rng() * 160, z = 200 + rng() * 280;
    const w = 12, h = 3 + Math.floor(rng() * 3) * 3, dep = 3;
    const m = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: contCols[i % 4], roughness: 0.8 }));
    m.scale.set(w, h, dep);
    m.position.set(x, h / 2, z);
    m.rotation.y = (rng() < 0.5 ? 0 : Math.PI / 2);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    colliders.push({ minX: x - 6, maxX: x + 6, minZ: z - 6, maxZ: z + 6 });
  }
  scene.add(group);
  return group;
}

// --- landmarks ------------------------------------------------------------
function buildLandmarks(scene, colliders) {
  const g = new THREE.Group();
  g.name = 'landmarks';
  const add = (mesh, x, z, y = 0) => { mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh; };
  const stone = new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x2a4a6a, roughness: 0.15, metalness: 0.6 });
  const neon = (c) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 2.2 });

  // Lighthouse (islet, north)
  const lh = new THREE.Group();
  const stripeTex = new THREE.CanvasTexture(makeCanvas(64, 128, (ctx) => {
    for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#c03028' : '#f2f2f2'; ctx.fillRect(0, i * 32, 64, 32); }
  }));
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, 42, 12), new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.8 }));
  tower.position.y = 21; tower.castShadow = true; lh.add(tower);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 5, 12), neon(0xffe9a0));
  lamp.position.y = 44; lh.add(lamp);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(3.6, 4, 12), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  cap.position.y = 48.5; lh.add(cap);
  lh.position.set(0, 0, -720); g.add(lh);
  colliders.push({ minX: -7, maxX: 7, minZ: -727, maxZ: -713 });

  // El Dorado Casino (tallest tower, Avenida Dorada)
  const casino = new THREE.Group();
  const towerBox = new THREE.Mesh(new THREE.BoxGeometry(34, 86, 34), glass);
  towerBox.position.y = 43; towerBox.castShadow = true; casino.add(towerBox);
  const signTex = new THREE.CanvasTexture(makeCanvas(512, 128, (ctx) => {
    ctx.fillStyle = '#1a0a2a'; ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#ffd700'; ctx.font = 'bold 64px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('EL DORADO', 256, 64);
  }));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(44, 11), new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.9 }));
  sign.position.set(0, 78, 17.5); casino.add(sign);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(36, 1.2, 36), neon(0xff2a7a));
  trim.position.y = 86; casino.add(trim);
  casino.position.set(50, 0, 0); g.add(casino);
  colliders.push({ minX: 32, maxX: 68, minZ: -18, maxZ: 18 });

  // Cathedral (Casco Viejo)
  const cath = new THREE.Group();
  const nave = new THREE.Mesh(new THREE.BoxGeometry(30, 16, 44), stone);
  nave.position.y = 8; nave.castShadow = true; cath.add(nave);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.4, metalness: 0.3 }));
  dome.position.y = 16; cath.add(dome);
  for (const s of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.6, 26, 10), stone);
    t.position.set(s * 12, 13, -18); t.castShadow = true; cath.add(t);
    const sp = new THREE.Mesh(new THREE.ConeGeometry(3.4, 8, 10), new THREE.MeshStandardMaterial({ color: 0x6a4a2a }));
    sp.position.set(s * 12, 30, -18); cath.add(sp);
  }
  cath.position.set(-300, 0, -150); g.add(cath);
  colliders.push({ minX: -318, maxX: -282, minZ: -176, maxZ: -124 });

  // Clock tower (plaza)
  const clock = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(8, 30, 8), stone);
  shaft.position.y = 15; shaft.castShadow = true; clock.add(shaft);
  const faceTex = new THREE.CanvasTexture(makeCanvas(128, 128, (ctx) => {
    ctx.fillStyle = '#f2ead8'; ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(64, 28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(92, 64); ctx.stroke();
  }));
  const face = new THREE.Mesh(new THREE.CircleGeometry(3.4, 24), new THREE.MeshStandardMaterial({ map: faceTex, emissive: 0xffffff, emissiveMap: faceTex, emissiveIntensity: 0.5 }));
  face.position.set(0, 26, 4.2); clock.add(face);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(6.4, 6, 4), new THREE.MeshStandardMaterial({ color: 0x2a5a3a }));
  roof.position.y = 33; roof.rotation.y = Math.PI / 4; clock.add(roof);
  clock.position.set(-250, 0, -100); g.add(clock);
  colliders.push({ minX: -255, maxX: -245, minZ: -105, maxZ: -95 });

  // Ferris wheel (Coral Beach boardwalk)
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(16, 0.8, 8, 32), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, emissive: 0xff5a8a, emissiveIntensity: 0.7 }));
  rim.position.y = 20; wheel.add(rim);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.6, 32, 0.6), new THREE.MeshStandardMaterial({ color: 0xd8d8d8 }));
    spoke.position.set(Math.cos(a) * 0, 20, 0);
    spoke.rotation.z = a + Math.PI / 2; spoke.position.x = Math.cos(a) * 0;
    wheel.add(spoke);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 2.4), new THREE.MeshStandardMaterial({ color: [0xff5a5a, 0x5a9aff, 0xffd75a, 0x5aff8a][i % 4] }));
    cab.position.set(Math.cos(a) * 16, 20 + Math.sin(a) * 16, 0); wheel.add(cab);
  }
  const legL = new THREE.Mesh(new THREE.BoxGeometry(1.2, 22, 1.2), new THREE.MeshStandardMaterial({ color: 0x8a8a8a }));
  legL.position.set(-6, 10, 0); legL.rotation.z = 0.3; wheel.add(legL);
  const legR = legL.clone(); legR.position.x = 6; legR.rotation.z = -0.3; wheel.add(legR);
  wheel.position.set(100, 0, 450); wheel.rotation.y = Math.PI / 2; g.add(wheel);
  colliders.push({ minX: 92, maxX: 108, minZ: 442, maxZ: 458 });

  // Stadium (Northgate)
  const stad = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(42, 46, 14, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xc8c8d0, roughness: 0.7, side: THREE.DoubleSide }));
  bowl.position.y = 7; bowl.castShadow = true; stad.add(bowl);
  const field = new THREE.Mesh(new THREE.CircleGeometry(38, 24), new THREE.MeshStandardMaterial({ color: 0x3a7a3a }));
  field.rotation.x = -Math.PI / 2; field.position.y = 0.5; stad.add(field);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 26, 6), new THREE.MeshStandardMaterial({ color: 0x666666 }));
    pole.position.set(Math.cos(a) * 44, 13, Math.sin(a) * 44); stad.add(pole);
    const lampBox = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 1), neon(0xffffff));
    lampBox.position.set(Math.cos(a) * 44, 26, Math.sin(a) * 44); lampBox.lookAt(0, 0, 0); stad.add(lampBox);
  }
  stad.position.set(50, 0, -420); g.add(stad);
  colliders.push({ minX: 4, maxX: 96, minZ: -466, maxZ: -374 });

  // Port cranes (El Puerto)
  for (let i = 0; i < 3; i++) {
    const crane = new THREE.Group();
    const legA = new THREE.Mesh(new THREE.BoxGeometry(2, 26, 2), new THREE.MeshStandardMaterial({ color: 0xc8a018 }));
    legA.position.set(-4, 13, 0); crane.add(legA);
    const legB = legA.clone(); legB.position.x = 4; crane.add(legB);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(30, 2, 2), new THREE.MeshStandardMaterial({ color: 0xc8a018 }));
    jib.position.set(8, 25, 0); crane.add(jib);
    const cable = new THREE.Mesh(new THREE.BoxGeometry(0.3, 10, 0.3), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    cable.position.set(20, 19, 0); crane.add(cable);
    crane.position.set(340 + i * 60, 0, 220); g.add(crane);
    colliders.push({ minX: 332 + i * 60, maxX: 348 + i * 60, minZ: 214, maxZ: 226 });
  }

  // Marina docks + boats
  const dockMat = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.95 });
  for (let i = 0; i < 3; i++) {
    const dock = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 40), dockMat);
    dock.position.set(-460 + i * 40, 0.5, 450); dock.castShadow = true; g.add(dock);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(5, 2.4, 14), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }));
    hull.position.set(-460 + i * 40 + 8, 0.8, 440 + i * 8); hull.castShadow = true; g.add(hull);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2, 6), new THREE.MeshStandardMaterial({ color: 0x2a4a6a }));
    cab.position.set(-460 + i * 40 + 8, 2.8, 440 + i * 8); g.add(cab);
  }
  scene.add(g);
  return g;
}

// --- palms, lamps, water --------------------------------------------------
function buildGreenery(scene, rng) {
  const g = new THREE.Group();
  g.name = 'greenery';
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2a7a3a, roughness: 0.9, side: THREE.DoubleSide });
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 7, 6);
  const leafGeo = new THREE.ConeGeometry(1.1, 4.5, 4);
  leafGeo.scale(1, 1, 0.18);
  // palms along the beach + avenues
  const spots = [];
  for (let x = -580; x <= 580; x += 40) { spots.push([x, 560]); spots.push([x, -560]); }
  for (let z = -500; z <= 500; z += 60) { spots.push([-560, z]); }
  for (const [x, z] of spots) {
    if (rng() < 0.45) continue;
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3.5; trunk.rotation.z = (rng() - 0.5) * 0.16; trunk.castShadow = true; palm.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.4, 7, Math.sin(a) * 1.4);
      leaf.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      leaf.castShadow = true; palm.add(leaf);
    }
    palm.position.set(x + (rng() - 0.5) * 12, 0, z + (rng() - 0.5) * 12);
    g.add(palm);
  }
  // street lamps along every avenue
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, metalness: 0.4 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xffd88a, emissiveIntensity: 0 });
  const lampHeads = [];
  for (let gx = GRID_MIN; gx <= GRID_MAX; gx += ROAD_STEP) {
    for (let gz = GRID_MIN; gz <= GRID_MAX; gz += ROAD_STEP * 2) {
      for (const [lx, lz] of [[gx + 9, gz], [gx - 9, gz + 100]]) {
        if (lx < GRID_MIN || lx > GRID_MAX || lz < GRID_MIN || lz > GRID_MAX) continue;
        const lamp = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 7, 6), poleMat);
        pole.position.y = 3.5; lamp.add(pole);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 0.18), poleMat);
        arm.position.set(1, 6.9, 0); lamp.add(arm);
        const head = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 0.6), lampMat.clone());
        head.position.set(2.1, 6.8, 0); lamp.add(head);
        lamp.position.set(lx, 0, lz);
        g.add(lamp);
        lampHeads.push(head);
      }
    }
  }
  scene.add(g);
  return { group: g, lampHeads, lampMat };
}

export function buildCity(scene) {
  const rng = mulberry32(20261118);
  const colliders = [];
  const canvas = groundCanvas();
  const groundTex = new THREE.CanvasTexture(canvas);
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.anisotropy = 4;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD, WORLD),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);

  // water (animated texture offset)
  const waterTex = new THREE.CanvasTexture(makeCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#1a5a7a'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
    for (let i = 0; i < 24; i++) {
      ctx.beginPath();
      const y = ((i * 37) % h);
      ctx.moveTo(0, y); ctx.bezierCurveTo(60, y + 8, 140, y - 8, w, y);
      ctx.stroke();
    }
  }));
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(10, 10);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(4200, 4200),
    new THREE.MeshStandardMaterial({ map: waterTex, color: 0x3a8ab8, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.92 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.4;
  water.name = 'water';
  scene.add(water);

  // causeway bridge deck (north, over the water to the lighthouse islet)
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(16, 1.2, 260),
    new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9 }),
  );
  deck.position.set(0, 0.6, -620);
  deck.receiveShadow = true;
  scene.add(deck);

  buildBuildings(scene, rng, colliders);
  buildLandmarks(scene, colliders);
  const green = buildGreenery(scene, rng);

  return {
    colliders, groundCanvas: canvas, groundTex, waterTex,
    lampHeads: green.lampHeads,
    // road helpers
    onRoad(x, z) {
      const rx = Math.abs(((x + 50) % ROAD_STEP + ROAD_STEP) % ROAD_STEP - 50);
      const rz = Math.abs(((z + 50) % ROAD_STEP + ROAD_STEP) % ROAD_STEP - 50);
      return rx <= ROAD_HALF + 2 || rz <= ROAD_HALF + 2;
    },
    nearestRoadPoint(x, z) {
      const nx = Math.round(x / ROAD_STEP) * ROAD_STEP;
      const nz = Math.round(z / ROAD_STEP) * ROAD_STEP;
      return Math.abs(x - nx) < Math.abs(z - nz) ? { x: nx, z } : { x, z: nz };
    },
    clampToIsland(x, z) {
      return { x: clamp(x, -ISLAND_HALF + 12, ISLAND_HALF - 12), z: clamp(z, -ISLAND_HALF + 12, ISLAND_HALF - 12) };
    },
  };
}

// GOLDEN TIDE 3D — sky, sun, day/night cycle and lighting.
// A shader sky dome whose colours follow the clock; a directional sun with
// shadows that tracks the player; street lamps that switch on at dusk.

import * as THREE from '../vendor/three.module.min.js';
import { clamp, lerp } from './util.js';

const VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w; // pin the dome to the far plane
}`;

const FRAG = `
varying vec3 vDir;
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float sunSize;
void main() {
  float h = clamp(vDir.y, 0.0, 1.0);
  vec3 col = mix(horizonColor, topColor, pow(h, 0.6));
  float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
  col += sunColor * pow(s, 220.0) * 1.6;   // the disc
  col += sunColor * pow(s, 8.0) * 0.35;    // the haze around it
  gl_FragColor = vec4(col, 1.0);
}`;

// Keyframes of the sky through the day: [hour, top, horizon, sun, fog, ambient]
const SKY_KEYS = [
  { h: 0,  top: 0x060a18, hor: 0x0e1626, sun: 0x223044, fog: 0x0a1220, sunI: 0.45, amb: 0.5 },
  { h: 5,  top: 0x0a1226, hor: 0x1a2438, sun: 0x3a4a66, fog: 0x101a28, sunI: 0.45, amb: 0.5 },
  { h: 7,  top: 0x3a6a9a, hor: 0xe89a5a, sun: 0xffb060, fog: 0xc89a6a, sunI: 0.9,  amb: 0.45 },
  { h: 10, top: 0x2a6ac8, hor: 0x9ac8e8, sun: 0xfff2c8, fog: 0xa8c8e0, sunI: 1.6,  amb: 0.7 },
  { h: 14, top: 0x1a5ac0, hor: 0x8ab8e0, sun: 0xfff8e0, fog: 0x9ab8d8, sunI: 1.7,  amb: 0.75 },
  { h: 17, top: 0x2a5aa8, hor: 0xff9a3a, sun: 0xff7a1a, fog: 0xe88a4a, sunI: 1.5,  amb: 0.85 },
  { h: 18, top: 0x1a2a5a, hor: 0xff6a2a, sun: 0xff5a00, fog: 0xd86a3a, sunI: 1.2,  amb: 0.8 },
  { h: 19, top: 0x0e1430, hor: 0x8a3a4a, sun: 0xc83a2a, fog: 0x5a3040, sunI: 0.7,  amb: 0.65 },
  { h: 21, top: 0x060a18, hor: 0x101828, sun: 0x2a3a55, fog: 0x0c1424, sunI: 0.5,  amb: 0.55 },
  { h: 24, top: 0x060a18, hor: 0x0e1626, sun: 0x223044, fog: 0x0a1220, sunI: 0.45, amb: 0.5 },
];

function sampleSky(hour) {
  const h = ((hour % 24) + 24) % 24;
  let a = SKY_KEYS[0], b = SKY_KEYS[SKY_KEYS.length - 1];
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    if (h >= SKY_KEYS[i].h && h <= SKY_KEYS[i + 1].h) { a = SKY_KEYS[i]; b = SKY_KEYS[i + 1]; break; }
  }
  const t = b.h === a.h ? 0 : (h - a.h) / (b.h - a.h);
  const mix = (ca, cb) => {
    const A = new THREE.Color(ca), B = new THREE.Color(cb);
    return A.lerp(B, t);
  };
  return {
    top: mix(a.top, b.top), hor: mix(a.hor, b.hor), sun: mix(a.sun, b.sun),
    fog: mix(a.fog, b.fog),
    sunI: lerp(a.sunI, b.sunI, t), amb: lerp(a.amb, b.amb, t),
  };
}

// Sun direction from the hour: rises east (06:00), sets west (18:00).
export function sunDirection(hour) {
  const a = ((hour - 6) / 12) * Math.PI; // 0 at 06:00, PI at 18:00
  return new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.9 + 0.08, 0.35).normalize();
}

export function createSky(scene, renderer) {
  const uniforms = {
    topColor: { value: new THREE.Color(0x2a6ac8) },
    horizonColor: { value: new THREE.Color(0x9ac8e8) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunColor: { value: new THREE.Color(0xfff2c8) },
    sunSize: { value: 0.02 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(2600, 24, 14),
    new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  dome.name = 'skyDome';
  scene.add(dome);

  const sun = new THREE.DirectionalLight(0xfff2c8, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 700;
  sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0x9ac8e8, 0x4a5a3a, 0.7);
  scene.add(hemi);

  // Warm bounce fill from the side opposite the sun: at golden hour the sun
  // is low in the west, so the facades facing the camera (east) would be
  // black silhouettes without it. No shadows — it only lifts the dark sides.
  const fill = new THREE.DirectionalLight(0xffc890, 0.4);
  scene.add(fill);
  scene.add(fill.target);

  // a few soft clouds (billboards that drift)
  const clouds = [];
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, fog: false });
  for (let i = 0; i < 10; i++) {
    const puffs = [];
    for (let j = 0; j < 4; j++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(14 + Math.random() * 14, 8, 6), cloudMat);
      s.position.set((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 20);
      s.scale.y = 0.4;
      puffs.push(s);
    }
    const cg = new THREE.Group();
    for (const p of puffs) cg.add(p);
    cg.position.set((Math.random() - 0.5) * 2200, 260 + Math.random() * 120, (Math.random() - 0.5) * 2200);
    scene.add(cg);
    clouds.push(cg);
  }

  scene.fog = new THREE.Fog(0xa8c8e0, 500, 2400);

  return {
    dome, sun, hemi, fill, clouds,
    update(hour, playerPos, lampHeads, dt) {
      const k = sampleSky(hour);
      uniforms.topColor.value.copy(k.top);
      uniforms.horizonColor.value.copy(k.hor);
      uniforms.sunColor.value.copy(k.sun);
      const isDay = hour > 6 && hour < 19;
      // by day the light follows the sun; at night it is a high moon
      const dir = isDay ? sunDirection(hour) : new THREE.Vector3(0.35, 1, 0.25).normalize();
      uniforms.sunDir.value.copy(dir);
      const sunPos = dir.clone().multiplyScalar(420);
      sun.position.set(playerPos.x + sunPos.x, Math.max(40, sunPos.y), playerPos.z + sunPos.z);
      sun.target.position.set(playerPos.x, 0, playerPos.z);
      sun.intensity = k.sunI;
      sun.color.copy(k.sun);
      hemi.intensity = k.amb;
      hemi.color.copy(k.top).lerp(new THREE.Color(0xffffff), 0.4);
      // The fill shines from the south-east: opposite the setting sun, but
      // biased toward the south so it also lights the faces the chase
      // camera sees (the camera looks north, so the south faces of the
      // towers are what fills the frame — a pure east fill leaves them black)
      const lowSun = 1 - clamp(dir.y, 0, 1);
      fill.intensity = isDay ? 0.15 + 0.65 * lowSun : 0.15;
      const oppX = -dir.x, oppZ = -dir.z;
      const fx = oppX * 0.55, fz = oppZ * 0.55 + 0.85;
      const fl = Math.hypot(fx, fz) || 1;
      fill.position.set(playerPos.x + (fx / fl) * 420, 180, playerPos.z + (fz / fl) * 420);
      fill.target.position.set(playerPos.x, 0, playerPos.z);
      scene.fog.color.copy(k.fog);
      scene.background = null; // the dome paints the sky
      dome.position.set(playerPos.x, 0, playerPos.z);
      // lamps on at dusk
      const lampOn = !isDay;
      for (const head of lampHeads) {
        head.material.emissiveIntensity = lampOn ? 2.4 : 0;
      }
      // clouds drift and fade at night
      for (const c of clouds) {
        c.position.x += dt * 2.2;
        if (c.position.x > 1200) c.position.x = -1200;
      }
      cloudMat.opacity = isDay ? 0.55 : 0.18;
      renderer.toneMappingExposure = isDay ? 1.05 : 1.05;
    },
  };
}

// Sky, sun, fog and the day/night cycle. Golden hour is the default look:
// a low warm sun plus a warm fill light so building windows stay readable.
import * as THREE from 'three';
import { clamp, lerp } from './util.js';

export function buildSky(scene) {
  // gradient dome
  const skyGeo = new THREE.SphereGeometry(2400, 24, 14);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x2b5a8a) },
      mid: { value: new THREE.Color(0x7ab0d8) },
      low: { value: new THREE.Color(0xffb36a) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 low;
      void main(){ float h = normalize(vP).y; vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.8, h)) : mix(low, mid, smoothstep(-0.05, 0.25, h)); gl_FragColor = vec4(c, 1.0); }`,
  });
  const dome = new THREE.Mesh(skyGeo, skyMat);
  scene.add(dome);

  // sun disc + glow sprite (a canvas radial sprite, no texture file)
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 128; glowCanvas.height = 128;
  const gc = glowCanvas.getContext('2d');
  const grad = gc.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.35, 'rgba(255,190,100,0.55)');
  grad.addColorStop(1, 'rgba(255,160,60,0)');
  gc.fillStyle = grad; gc.fillRect(0, 0, 128, 128);
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, fog: false }));
  sunSprite.scale.set(520, 520, 1);
  scene.add(sunSprite);

  // lights
  const sun = new THREE.DirectionalLight(0xffc890, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -320; sun.shadow.camera.right = 320;
  sun.shadow.camera.top = 320; sun.shadow.camera.bottom = -320;
  sun.shadow.camera.far = 1600;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0x9ab8d8, 0x6a5a42, 0.85);
  scene.add(hemi);
  // warm golden-hour fill so windows and facades stay readable at sunset
  const fill = new THREE.DirectionalLight(0xffb36a, 0.9);
  fill.position.set(400, 180, -300);
  scene.add(fill);
  scene.add(fill.target);

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(26, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xe8ecf2, fog: false }),
  );
  scene.add(moon);

  // a few stars (points) for night
  const starGeo = new THREE.BufferGeometry();
  const starPos = [];
  const sr = 2200;
  for (let i = 0; i < 420; i++) {
    const a = (i * 2.39996) % (Math.PI * 2);
    const y = 0.25 + ((i * 0.731) % 0.75);
    const r = Math.sqrt(1 - y * y);
    starPos.push(Math.cos(a) * r * sr, y * sr, Math.sin(a) * r * sr);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 3.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0 }));
  scene.add(stars);

  scene.fog = new THREE.Fog(0xc9a06a, 700, 2400);

  // hour: 0-24. Returns a small report for the HUD.
  function setTime(hour, target) {
    const h = ((hour % 24) + 24) % 24;
    const dayFrac = h / 24;
    // sun elevation: rises 6h, sets 19h, peak at 12.5h
    const sunA = (dayFrac - 0.25) * Math.PI * 2;
    const el = Math.sin(sunA) * 0.9 + 0.08;
    const az = Math.cos(sunA);
    const px = target ? target.x : 0;
    const pz = target ? target.z : 0;
    sun.position.set(px + az * 900, Math.max(60, el * 900), pz + 320);
    sun.target.position.set(px, 0, pz);
    const golden = clamp(1 - Math.abs(el - 0.22) / 0.22, 0, 1); // near sunset/sunrise
    const night = clamp(-el * 2.2, 0, 1);
    const day = 1 - night;
    sun.intensity = lerp(0.25, 2.8, day) * (1 - golden * 0.25);
    sun.color.setHSL(0.08 + golden * 0.02, 0.75, lerp(0.62, 0.55, golden));
    hemi.intensity = lerp(0.16, 0.9, day);
    fill.intensity = lerp(0.1, 0.95, day) * (0.5 + golden * 0.5);
    fill.color.setHSL(0.07, 0.8, 0.6);
    // sky colours
    skyMat.uniforms.top.value.setHSL(0.58, 0.55, lerp(0.05, 0.42, day));
    skyMat.uniforms.mid.value.setHSL(0.55, lerp(0.1, 0.55, day), lerp(0.08, 0.62, day) - golden * 0.08);
    skyMat.uniforms.low.value.setHSL(lerp(0.07, 0.08, day) + golden * 0.02, lerp(0.3, 0.5, day), lerp(0.1, 0.62, day));
    scene.fog.color.setHSL(0.08, lerp(0.15, 0.45, day), lerp(0.06, 0.66, day));
    sunSprite.position.set(px + az * 2100, Math.max(90, el * 2100), pz + 700);
    sunSprite.material.opacity = clamp(day + golden, 0, 1);
    moon.position.set(px - az * 1900, Math.max(200, -el * 1900), pz - 600);
    stars.material.opacity = night * 0.9;
    return { hour: h, golden, night, day };
  }

  return { dome, sun, hemi, fill, sunSprite, moon, stars, setTime };
}

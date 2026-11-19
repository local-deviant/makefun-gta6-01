// Small deterministic helpers. One seeded RNG drives the whole world —
// same seed, same city, same traffic, same spawns. No Math.random() here.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range(lo, hi) { return lo + (hi - lo) * next(); },
    int(lo, hi) { return Math.floor(lo + (hi - lo + 1) * next()); },
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
    chance(p) { return next() < p; },
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

export function angleLerp(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function dist2d(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  return Math.sqrt(dx * dx + dz * dz);
}

export function fmtMoney(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

export function fmtClock(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour % 1) * 60);
  const hh = h % 12 === 0 ? 12 : h % 12;
  const ap = h < 12 ? 'AM' : 'PM';
  return hh + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
}

// Draw a small stylised portrait on a 2d canvas context.
// skin/hair/shirt come from the character table; the face is procedural.
export function drawPortrait(ctx, ch, w, h) {
  const cx = w / 2, cy = h / 2;
  ctx.clearRect(0, 0, w, h);
  // backdrop
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2b3a5e');
  g.addColorStop(1, '#c96a3a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // shoulders / shirt
  ctx.fillStyle = ch.shirt;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.42, h);
  ctx.quadraticCurveTo(cx - w * 0.40, cy + h * 0.18, cx, cy + h * 0.16);
  ctx.quadraticCurveTo(cx + w * 0.40, cy + h * 0.18, cx + w * 0.42, h);
  ctx.closePath();
  ctx.fill();
  // neck
  ctx.fillStyle = ch.skin;
  ctx.fillRect(cx - w * 0.07, cy + h * 0.02, w * 0.14, h * 0.16);
  // head
  ctx.beginPath();
  ctx.ellipse(cx, cy - h * 0.08, w * 0.20, h * 0.24, 0, 0, TAU);
  ctx.fill();
  // hair
  ctx.fillStyle = ch.hair;
  ctx.beginPath();
  ctx.ellipse(cx, cy - h * 0.24, w * 0.21, h * 0.13, 0, Math.PI, TAU);
  ctx.fill();
  // eyes
  ctx.fillStyle = '#14100c';
  ctx.beginPath(); ctx.arc(cx - w * 0.075, cy - h * 0.08, w * 0.018, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + w * 0.075, cy - h * 0.08, w * 0.018, 0, TAU); ctx.fill();
  // smile
  ctx.strokeStyle = '#5a2a1a';
  ctx.lineWidth = Math.max(1.5, w * 0.012);
  ctx.beginPath();
  ctx.arc(cx, cy + h * 0.02, w * 0.07, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  // frame
  ctx.strokeStyle = 'rgba(255,215,0,0.85)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
}

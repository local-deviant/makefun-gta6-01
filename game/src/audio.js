// GOLDEN TIDE 3D — sound, all synthesized with WebAudio (no audio files).
// Engine hum follows speed, police sirens wail, gunshots crack, and four
// radio stations play tiny step-sequencer loops. Everything starts after
// the first user gesture (browsers demand it).

import { RADIO } from './config.js';

export function createAudio() {
  return {
    ctx: null, master: null, muted: false, volume: 0.7,
    engineOsc: null, engineGain: null, engineFilter: null,
    sirenOsc: null, sirenGain: null, sirenTimer: 0,
    radioStation: 0, radioTimer: null, radioStep: 0, radioOn: false,
    started: false,
  };
}

export function ensureAudio(a) {
  if (a.ctx) {
    if (a.ctx.state === 'suspended') a.ctx.resume();
    return true;
  }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    a.ctx = new Ctx();
    a.master = a.ctx.createGain();
    a.master.gain.value = a.volume;
    a.master.connect(a.ctx.destination);
    // engine: a sawtooth through a lowpass, pitch follows speed
    a.engineOsc = a.ctx.createOscillator();
    a.engineOsc.type = 'sawtooth';
    a.engineOsc.frequency.value = 55;
    a.engineFilter = a.ctx.createBiquadFilter();
    a.engineFilter.type = 'lowpass';
    a.engineFilter.frequency.value = 420;
    a.engineGain = a.ctx.createGain();
    a.engineGain.gain.value = 0;
    a.engineOsc.connect(a.engineFilter).connect(a.engineGain).connect(a.master);
    a.engineOsc.start();
    // siren: two alternating tones
    a.sirenOsc = a.ctx.createOscillator();
    a.sirenOsc.type = 'triangle';
    a.sirenOsc.frequency.value = 700;
    a.sirenGain = a.ctx.createGain();
    a.sirenGain.gain.value = 0;
    a.sirenOsc.connect(a.sirenGain).connect(a.master);
    a.sirenOsc.start();
    a.started = true;
    return true;
  } catch (e) {
    return false;
  }
}

function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

export function setEngine(a, speed01, inCar) {
  if (!a.ctx || !a.engineOsc) return;
  const f = 55 + speed01 * 165;
  a.engineOsc.frequency.setTargetAtTime(f, a.ctx.currentTime, 0.08);
  a.engineFilter.frequency.setTargetAtTime(320 + speed01 * 1400, a.ctx.currentTime, 0.1);
  a.engineGain.gain.setTargetAtTime(inCar ? 0.05 + speed01 * 0.06 : 0, a.ctx.currentTime, 0.1);
}

export function setSiren(a, on, t) {
  if (!a.ctx || !a.sirenOsc) return;
  a.sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, a.ctx.currentTime, 0.2);
  if (on) a.sirenOsc.frequency.setTargetAtTime(Math.floor(t * 1.6) % 2 === 0 ? 700 : 950, a.ctx.currentTime, 0.05);
}

export function playShot(a) {
  if (!a.ctx) return;
  const dur = 0.14;
  const buf = a.ctx.createBuffer(1, a.ctx.sampleRate * dur, a.ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.ctx.createBufferSource();
  src.buffer = buf;
  const g = a.ctx.createGain();
  g.gain.value = 0.5;
  src.connect(g).connect(a.master);
  src.start();
}

export function playBlip(a, freq = 880, dur = 0.08) {
  if (!a.ctx) return;
  const o = a.ctx.createOscillator();
  o.type = 'sine'; o.frequency.value = freq;
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(0.18, a.ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.ctx.currentTime + dur);
  o.connect(g).connect(a.master);
  o.start(); o.stop(a.ctx.currentTime + dur);
}

export function playCash(a) {
  playBlip(a, 1320, 0.1);
  setTimeout(() => playBlip(a, 1760, 0.14), 90);
}

// --- radio: a step sequencer over the station's note pattern ---------------
export function startRadio(a, stationIdx) {
  if (!a.ctx) return;
  stopRadio(a);
  const st = RADIO[stationIdx % RADIO.length];
  a.radioStation = stationIdx % RADIO.length;
  a.radioOn = true;
  a.radioStep = 0;
  const stepDur = 60 / st.bpm / 2;
  const tick = () => {
    if (!a.radioOn || !a.ctx) return;
    const note = st.notes[a.radioStep % st.notes.length];
    const o = a.ctx.createOscillator();
    o.type = st.wave;
    o.frequency.value = midiToFreq(note);
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, a.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.05, a.ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, a.ctx.currentTime + stepDur * 0.95);
    o.connect(g).connect(a.master);
    o.start();
    o.stop(a.ctx.currentTime + stepDur);
    // a soft bass note on the beat
    if (a.radioStep % 2 === 0) {
      const b = a.ctx.createOscillator();
      b.type = 'sine';
      b.frequency.value = midiToFreq(note - 24);
      const bg = a.ctx.createGain();
      bg.gain.setValueAtTime(0.0001, a.ctx.currentTime);
      bg.gain.exponentialRampToValueAtTime(0.06, a.ctx.currentTime + 0.02);
      bg.gain.exponentialRampToValueAtTime(0.0001, a.ctx.currentTime + stepDur * 1.8);
      b.connect(bg).connect(a.master);
      b.start(); b.stop(a.ctx.currentTime + stepDur * 2);
    }
    a.radioStep += 1;
    a.radioTimer = setTimeout(tick, stepDur * 1000);
  };
  tick();
}

export function stopRadio(a) {
  a.radioOn = false;
  if (a.radioTimer) { clearTimeout(a.radioTimer); a.radioTimer = null; }
}

export function setMuted(a, muted) {
  a.muted = muted;
  if (a.master) a.master.gain.value = muted ? 0 : a.volume;
}

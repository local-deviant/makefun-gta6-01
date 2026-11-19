// Sound — everything synthesised with WebAudio, no audio files.
// 4 radio stations with named songs, engine hum, sirens, gunshots.
import { RADIO } from './config.js';

// Tiny step sequencer: a song is a list of [note, beats] over a chord pad.
const SONGS = {
  'La Marea Dorada': { bpm: 96, bass: [55, 65.4, 49, 58.3], lead: [220, 261.6, 329.6, 392] },
  'Calle del Sol': { bpm: 104, bass: [49, 55, 65.4, 58.3], lead: [196, 246.9, 293.7, 329.6] },
  'Baila, Fortuna': { bpm: 112, bass: [65.4, 55, 49, 65.4], lead: [261.6, 329.6, 392, 440] },
  'El Tiburón Baila': { bpm: 120, bass: [55, 55, 65.4, 49], lead: [220, 277.2, 329.6, 370] },
  'Motor en la Noche': { bpm: 132, bass: [41.2, 49, 55, 49], lead: [164.8, 196, 246.9, 220] },
  'Gasolina y Fuego': { bpm: 140, bass: [49, 41.2, 55, 65.4], lead: [196, 220, 261.6, 293.7] },
  'La Loma Arde': { bpm: 126, bass: [55, 65.4, 55, 49], lead: [220, 246.9, 293.7, 329.6] },
  'Marea Baja': { bpm: 72, bass: [55, 49, 43.7, 49], lead: [220, 196, 174.6, 196] },
  'Atardecer en Playa Norte': { bpm: 66, bass: [49, 55, 65.4, 58.3], lead: [196, 220, 261.6, 246.9] },
  'Viento del Mar': { bpm: 78, bass: [43.7, 49, 55, 49], lead: [174.6, 196, 220, 196] },
  'Bella Torres en Vivo': { bpm: 90, bass: [55, 55, 55, 55], lead: [220, 220, 220, 220] },
  'Noticias de la Isla': { bpm: 90, bass: [49, 49, 49, 49], lead: [196, 196, 196, 196] },
  'El Puerto Habla': { bpm: 90, bass: [65.4, 65.4, 65.4, 65.4], lead: [261.6, 261.6, 261.6, 261.6] },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.station = 0;
    this.song = 0;
    this.radioOn = true;
    this.step = 0;
    this.nextNote = 0;
    this.master = null;
    this.radioGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
  }

  ensure() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.radioGain = this.ctx.createGain();
      this.radioGain.gain.value = 0.16;
      this.radioGain.connect(this.master);
      // engine hum
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      // siren (two-tone)
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'sine';
      this.sirenOsc.frequency.value = 660;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
    } catch (e) { this.ctx = null; }
  }

  currentSong() {
    const st = RADIO[this.station];
    return { station: st, song: st.songs[this.song % st.songs.length] };
  }

  nextStation() {
    this.station = (this.station + 1) % RADIO.length;
    this.song = 0;
    this.step = 0;
    return this.currentSong();
  }

  toggleRadio() { this.radioOn = !this.radioOn; return this.radioOn; }

  // called every frame: schedules the sequencer + engine/siren levels
  update(dt, speedKmh, wantedStars) {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    // engine
    this.engineGain.gain.value = speedKmh > 1 ? 0.05 + Math.min(0.09, speedKmh / 900) : 0;
    this.engineOsc.frequency.value = 52 + speedKmh * 0.9;
    // siren when wanted
    this.sirenGain.gain.value = wantedStars > 0 ? 0.045 : 0;
    this.sirenOsc.frequency.value = 620 + Math.sin(this.ctx.currentTime * 5) * 130;
    // radio sequencer
    if (!this.radioOn) return;
    const { song } = this.currentSong();
    const data = SONGS[song] || SONGS['Marea Baja'];
    const spb = 60 / data.bpm / 2;
    if (this.ctx.currentTime < this.nextNote) return;
    this.nextNote = this.ctx.currentTime + spb;
    const i = this.step % 8;
    const bassF = data.bass[Math.floor(i / 2) % data.bass.length];
    const leadF = data.lead[i % data.lead.length];
    this.blip(bassF, spb * 1.8, 'triangle', 0.5);
    if (i % 2 === 0) this.blip(leadF, spb * 0.9, 'square', 0.12);
    this.step++;
    if (this.step >= 64) { this.step = 0; this.song++; }
  }

  blip(freq, dur, type, vol) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.radioGain);
    o.start();
    o.stop(this.ctx.currentTime + dur + 0.02);
  }

  shot() {
    if (!this.ctx) return;
    const dur = 0.14;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 0.5;
    src.connect(g); g.connect(this.master);
    src.start();
  }

  chime() {
    if (!this.ctx) return;
    this.blip(880, 0.3, 'sine', 0.25);
    setTimeout(() => this.blip(1318, 0.35, 'sine', 0.25), 120);
  }
}

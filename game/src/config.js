// GOLDEN TIDE 3D — configuration and world data.
// Pure data: districts, landmarks, story, races, collectibles, radio, respect.
// No imports. Every module reads from here so the city, the HUD, the minimap
// and the missions all agree on the same Costa Dorada.

export const GAME_TITLE = 'GOLDEN TIDE 3D';
export const CITY_NAME = 'Costa Dorada';

// ---------------------------------------------------------------------------
// World layout. x grows east, z grows south. Roads form a grid every 100 units.
// The road grid runs from -500 to +500; the island ground is 1500 x 1500 and
// the water starts beyond it. A causeway runs north to the lighthouse islet.
// ---------------------------------------------------------------------------
export const ROAD_STEP = 100;
export const ROAD_HALF = 7; // half-width of a road surface
export const GRID_MIN = -500;
export const GRID_MAX = 500;
export const ISLAND_HALF = 750;
export const WATER_LEVEL = -0.4;

export const DISTRICTS = [
  { id: 'marina',   name: 'Marina del Sol',  cx: -350, cz:  350, hw: 220, hd: 150, tint: '#3d7ea6', style: 'marina',   minH: 10, maxH: 26, palette: ['#e8dcc8', '#c9b18c', '#9fb8c8', '#f2e9d8'] },
  { id: 'casco',    name: 'Casco Viejo',     cx: -350, cz: -150, hw: 220, hd: 200, tint: '#b08954', style: 'oldtown',  minH:  8, maxH: 18, palette: ['#d8b98a', '#c99a5e', '#e8d0a0', '#b98a5a'] },
  { id: 'vega',     name: 'La Vega',         cx: -350, cz: -420, hw: 220, hd: 110, tint: '#7a9a4e', style: 'market',   minH:  6, maxH: 14, palette: ['#e0c080', '#c8a060', '#d8b070', '#b8905a'] },
  { id: 'avenida',  name: 'Avenida Dorada',  cx:   50, cz:    0, hw: 180, hd: 300, tint: '#c94f7c', style: 'strip',    minH: 22, maxH: 64, palette: ['#3a3f5a', '#2c3148', '#4a4f6a', '#5a5f7a'] },
  { id: 'beach',    name: 'Coral Beach',     cx:  100, cz:  420, hw: 220, hd: 110, tint: '#e8c98a', style: 'beach',    minH: 10, maxH: 30, palette: ['#f2e0b8', '#e8d0a0', '#ffffff', '#d8c8a0'] },
  { id: 'puerto',   name: 'El Puerto',       cx:  400, cz:  300, hw: 130, hd: 200, tint: '#6a7a8a', style: 'port',     minH:  8, maxH: 22, palette: ['#8a8f96', '#6a7078', '#9aa0a8', '#5a6068'] },
  { id: 'heights',  name: 'Palm Heights',    cx:  350, cz: -350, hw: 180, hd: 180, tint: '#4e8a6a', style: 'villa',    minH:  8, maxH: 18, palette: ['#f2e8d8', '#e8dcc8', '#ffffff', '#d8c8b8'] },
  { id: 'northgate',name: 'Northgate',       cx:   50, cz: -420, hw: 180, hd: 110, tint: '#7a8a9a', style: 'suburb',   minH:  6, maxH: 14, palette: ['#d8d0c0', '#c8c0b0', '#e8e0d0', '#b8b0a0'] },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (Math.abs(x - d.cx) <= d.hw && Math.abs(z - d.cz) <= d.hd) return d;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Landmarks (name, position, kind). The skyline the player navigates by.
// ---------------------------------------------------------------------------
export const LANDMARKS = [
  { id: 'lighthouse', name: 'Mercury Lighthouse', kind: 'lighthouse', x: 0,    z: -720 },
  { id: 'casino',     name: 'El Dorado Casino',   kind: 'casino',     x: 50,   z: 0 },
  { id: 'cathedral',  name: 'Santa Lucia Cathedral', kind: 'cathedral', x: -300, z: -150 },
  { id: 'ferris',     name: 'Coral Wheel',        kind: 'ferris',     x: 100,  z: 450 },
  { id: 'stadium',    name: 'Dorada Stadium',     kind: 'stadium',    x: 50,   z: -420 },
  { id: 'clocktower', name: 'Plaza Clock Tower',  kind: 'clocktower', x: -250, z: -100 },
  { id: 'cranes',     name: 'Port Cranes',        kind: 'cranes',     x: 400,  z: 300 },
  { id: 'marinadocks',name: 'Marina Docks',       kind: 'docks',      x: -400, z: 450 },
];

// ---------------------------------------------------------------------------
// People. Portraits are drawn procedurally from these colours.
// ---------------------------------------------------------------------------
export const CHARACTERS = {
  rio:      { name: 'Rio',            role: 'You — getaway driver',        skin: '#c98a5e', hair: '#1a1a1a', hairStyle: 'short',  jacket: '#2a4a6a' },
  marisol:  { name: 'Donna Marisol',  role: 'Fixer — La Jefa',             skin: '#d8a878', hair: '#3a2a1a', hairStyle: 'bun',    jacket: '#6a1a2a' },
  sofia:    { name: 'Sofia',          role: 'Mechanic — Vega Garage',      skin: '#b8784a', hair: '#0a0a0a', hairStyle: 'ponytail', jacket: '#2a5a3a' },
  tomas:    { name: 'Tomas "El Gato"',role: 'Street racer',                skin: '#c98a5e', hair: '#2a1a0a', hairStyle: 'slick',  jacket: '#8a6a1a' },
  luna:     { name: 'Luna',           role: 'Hacker',                      skin: '#e8c8a8', hair: '#4a1a6a', hairStyle: 'bob',    jacket: '#3a2a5a' },
  vega:     { name: 'Inspector Vega', role: 'Police — on the take',        skin: '#a87850', hair: '#5a5a5a', hairStyle: 'flat',   jacket: '#1a2a3a' },
  elrey:    { name: 'El Rey',         role: 'Boss of Costa Dorada',        skin: '#d8a878', hair: '#e8e8e8', hairStyle: 'slick',  jacket: '#3a1a1a' },
  vex:      { name: 'Vex',            role: 'Street racer',                skin: '#8a5a3a', hair: '#0a0a0a', hairStyle: 'mohawk', jacket: '#1a1a1a' },
  rosa:     { name: 'Rosa',           role: 'Street racer',                skin: '#c98a5e', hair: '#6a1a0a', hairStyle: 'long',   jacket: '#7a2a4a' },
};

// ---------------------------------------------------------------------------
// Story: 7 jobs. Each stage is a goal the mission engine runs in order.
// stage types: goto (drive/walk to a marker), steal (enter a named car),
// deliver (reach a marker while in a vehicle), race (win a street race),
// destroy (wreck N named cars), escape (lose the wanted level), meet (talk).
// ---------------------------------------------------------------------------
export const MISSIONS = [
  {
    id: 'm1', chapter: 1, title: 'First Fare', giver: 'marisol', reward: 200, respect: 2,
    brief: [
      'Rio. You drive, I pay. A client is waiting at the Marina — take him to the Strip.',
      'No shortcuts through the plaza, the cops love that corner. Smooth and fast.',
    ],
    stages: [
      { type: 'goto', label: 'Pick up the client at Marina del Sol', x: -400, z: 400, r: 12 },
      { type: 'deliver', label: 'Drop the client at Avenida Dorada', x: 100, z: 100, r: 12 },
    ],
    done: ['Clean run. The client tipped. You might last in this town, Rio.'],
  },
  {
    id: 'm2', chapter: 2, title: 'Hot Wheels', giver: 'sofia', reward: 400, respect: 3,
    brief: [
      'A Sunset GT is parked up in Palm Heights. Owner is away, keys are in it.',
      'Bring it to my garage in La Vega. Do not scratch it. I mean it, Rio.',
    ],
    stages: [
      { type: 'steal', label: 'Steal the Sunset GT in Palm Heights', car: 'sunsetGT', x: 307, z: -300, r: 10 },
      { type: 'deliver', label: 'Deliver the Sunset GT to Vega Garage', x: -350, z: -400, r: 12 },
    ],
    done: ['Beautiful. No scratches. Marisol was right about you.'],
  },
  {
    id: 'm3', chapter: 3, title: 'The Getaway', giver: 'marisol', reward: 600, respect: 4,
    brief: [
      'A package is sitting at the port. The cops know the time. The cops do not know the driver.',
      'Grab it, then lose them. Three stars is nothing if you keep moving.',
    ],
    stages: [
      { type: 'goto', label: 'Collect the package at El Puerto', x: 400, z: 350, r: 12 },
      { type: 'escape', label: 'Lose the police (wanted 0)', wanted: 3, x: -300, z: -100, r: 14 },
    ],
    done: ['The package is safe. The cops are still looking for a ghost.'],
  },
  {
    id: 'm4', chapter: 4, title: 'Street Kings', giver: 'tomas', reward: 800, respect: 5,
    brief: [
      'El Gato runs the Strip at night. Beat me in a race and the streets are yours.',
      'Three laps, eight gates. No shortcuts — the gates are watching.',
    ],
    stages: [
      { type: 'race', label: 'Beat Tomas in the Strip race', race: 'strip', x: 0, z: 200, r: 14 },
    ],
    done: ['You drive like the tide, Rio. The Strip is yours tonight.'],
  },
  {
    id: 'm5', chapter: 5, title: 'Payback', giver: 'luna', reward: 700, respect: 4,
    brief: [
      'The Vipers torched my server rack. Their cars are parked in the market district.',
      'Wreck three of them. Guns work. A stolen truck works better.',
    ],
    stages: [
      { type: 'destroy', label: 'Wreck 3 Viper cars in La Vega', count: 3, x: -309, z: -350, r: 30 },
    ],
    done: ['Three wrecks, zero witnesses. The Vipers will think twice.'],
  },
  {
    id: 'm6', chapter: 6, title: 'The Informant', giver: 'vega', reward: 900, respect: 5,
    brief: [
      'Meet me at the lighthouse causeway. Come alone. Bring cash for my trouble.',
      'And Rio — if this is a trap, it is not my trap. Watch the road behind you.',
    ],
    stages: [
      { type: 'meet', label: 'Meet Inspector Vega at the causeway', x: 0, z: -600, r: 12 },
      { type: 'escape', label: 'Escape the police trap (wanted 0)', wanted: 3, x: 100, z: 420, r: 14 },
    ],
    done: ['Vega got his envelope. The trap got nothing. We are even, for now.'],
  },
  {
    id: 'm7', chapter: 7, title: 'Golden Tide', giver: 'elrey', reward: 2000, respect: 8,
    brief: [
      'The El Dorado vault. Tonight. Five stars, a helicopter, the whole city watching.',
      'Take the vault, reach the boat at the Marina, and Costa Dorada is ours.',
    ],
    stages: [
      { type: 'goto', label: 'Reach the El Dorado Casino vault', x: 100, z: 0, r: 12 },
      { type: 'escape', label: 'Escape with the vault (wanted 0)', wanted: 5, x: -400, z: 450, r: 14 },
    ],
    done: ['The tide came in gold tonight. Costa Dorada belongs to us now.'],
  },
];

// ---------------------------------------------------------------------------
// Street races: 3 loops of gates. Rivals are named; standings are live.
// ---------------------------------------------------------------------------
export const RACES = [
  {
    id: 'strip', name: 'Strip Sprint', laps: 3,
    rivals: ['tomas', 'vex', 'rosa'],
    gates: [[0, 200], [200, 200], [200, 0], [200, -200], [0, -200], [-200, -200], [-200, 0], [-200, 200]],
    reward: 800,
  },
  {
    id: 'beach', name: 'Coral Beach Run', laps: 2,
    rivals: ['vex', 'rosa'],
    gates: [[-100, 400], [300, 400], [400, 200], [200, 100], [-100, 100], [-300, 300]],
    reward: 500,
  },
  {
    id: 'harbor', name: 'Harbor Loop', laps: 2,
    rivals: ['tomas', 'rosa'],
    gates: [[-400, 400], [-400, 100], [-100, 100], [-100, 400], [-400, 400]],
    reward: 500,
  },
];

// ---------------------------------------------------------------------------
// Side activities.
// ---------------------------------------------------------------------------
export const COLLECTIBLES = [
  { id: 'disc01', x: -400, z: 450 }, { id: 'disc02', x: -300, z: -100 }, { id: 'disc03', x: 100, z: 0 },
  { id: 'disc04', x: 100, z: 400 }, { id: 'disc05', x: 400, z: 300 }, { id: 'disc06', x: 300, z: -300 },
  { id: 'disc07', x: 0, z: -720 }, { id: 'disc08', x: -300, z: -400 }, { id: 'disc09', x: 0, z: -400 },
  { id: 'disc10', x: 200, z: 200 }, { id: 'disc11', x: -100, z: 100 }, { id: 'disc12', x: 400, z: -100 },
  { id: 'disc13', x: -400, z: -400 }, { id: 'disc14', x: 100, z: -100 }, { id: 'disc15', x: 0, z: 400 },
];

export const SHOPS = [
  { id: 'gunshop', name: 'Iron & Lead', kind: 'weapons', x: -200, z: 0 },
  { id: 'garage', name: 'Vega Garage', kind: 'garage', x: -350, z: -400 },
  { id: 'dealership', name: 'Sunset Motors', kind: 'cars', x: 100, z: 100 },
];

export const WEAPONS = [
  { id: 'pistol', name: 'Pistol', price: 0, ammo: 24, damage: 34, rate: 0.28, auto: false },
  { id: 'smg', name: 'Storm SMG', price: 600, ammo: 60, damage: 18, rate: 0.09, auto: true },
  { id: 'shotgun', name: 'Boomstick', price: 900, ammo: 12, damage: 90, rate: 0.8, auto: false },
];

export const RESPECT_RANKS = [
  { at: 0, name: 'Rookie' },
  { at: 10, name: 'Hustler' },
  { at: 25, name: 'Wheelman' },
  { at: 50, name: 'Kingpin' },
];

export function respectRank(points) {
  let rank = RESPECT_RANKS[0];
  for (const r of RESPECT_RANKS) if (points >= r.at) rank = r;
  return rank;
}

// ---------------------------------------------------------------------------
// Radio: 4 stations, each a tiny step-sequencer pattern (MIDI notes, bpm).
// ---------------------------------------------------------------------------
export const RADIO = [
  { id: 'dorada', name: 'Radio Dorada', genre: 'salsa', bpm: 96, notes: [60, 63, 65, 67, 70, 72, 67, 65], wave: 'triangle' },
  { id: 'neon', name: 'Neon FM', genre: 'synthwave', bpm: 112, notes: [45, 48, 52, 55, 57, 55, 52, 48], wave: 'sawtooth' },
  { id: 'rock', name: 'Costa Rock', genre: 'rock', bpm: 128, notes: [40, 40, 43, 45, 47, 45, 43, 40], wave: 'square' },
  { id: 'wave', name: 'Wave 101', genre: 'chill', bpm: 80, notes: [57, 60, 64, 67, 64, 60, 57, 55], wave: 'sine' },
];

// ---------------------------------------------------------------------------
// Cars the player can steal or buy.
// ---------------------------------------------------------------------------
export const CAR_MODELS = [
  { id: 'taxi', name: 'City Taxi', color: 0xf2c200, topSpeed: 26, accel: 14, grip: 2.4 },
  { id: 'sedan', name: 'Marlin Sedan', color: 0x4a6a8a, topSpeed: 28, accel: 15, grip: 2.5 },
  { id: 'coupe', name: 'Sunset Coupe', color: 0xc23a2a, topSpeed: 32, accel: 18, grip: 2.8 },
  { id: 'sunsetGT', name: 'Sunset GT', color: 0xd8a018, topSpeed: 38, accel: 22, grip: 3.1 },
  { id: 'truck', name: 'Harbor Truck', color: 0x5a6a5a, topSpeed: 22, accel: 11, grip: 2.2 },
  { id: 'sport', name: 'Vortex S', color: 0x2a9a8a, topSpeed: 36, accel: 21, grip: 3.0 },
  { id: 'police', name: 'CPD Cruiser', color: 0xe8e8e8, topSpeed: 33, accel: 19, grip: 2.9 },
];

export const DAY_LENGTH_SEC = 480; // one full day = 8 minutes of play
export const START_HOUR = 17.5; // golden hour at the start

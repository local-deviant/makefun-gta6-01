// ISLA FORTUNA — configuration: every name, number and table the game uses.
// One place for tuning so the systems stay small and honest.
export const SEED = 0x1F0A7A; // fixed seed: same seed, same city, same traffic
export const CITY = {
  half: 550, // island is ~1100 m across, centred on (0,0)
  block: 92, // city block pitch in metres
  roadHalf: 7, // half-width of a road
  sidewalk: 3.2, // sidewalk width beside each road
};

export const DISTRICTS = [
  { name: 'Puerto Viejo', cx: -380, cz: 300, r: 150, palette: ['#8a6f4d', '#7a5f43', '#96795a'], h: [14, 26], feel: 'docks' },
  { name: 'Casino Row', cx: -120, cz: -330, r: 170, palette: ['#2b3a5e', '#3a4a6e', '#22304e'], h: [60, 120], feel: 'towers' },
  { name: 'Mercado Central', cx: -60, cz: 60, r: 160, palette: ['#c96a3a', '#b85a30', '#d07a48'], h: [10, 22], feel: 'market' },
  { name: 'La Loma', cx: 330, cz: -300, r: 150, palette: ['#e8d9b0', '#dcc79a', '#f0e2c0'], h: [12, 30], feel: 'villas' },
  { name: 'Playa Norte', cx: 380, cz: 120, r: 150, palette: ['#e8dcc0', '#d8cba8', '#f2e8cc'], h: [16, 42], feel: 'beach' },
  { name: 'El Astillero', cx: -380, cz: -260, r: 140, palette: ['#5e6a72', '#4e5a62', '#6e7a82'], h: [12, 30], feel: 'industrial' },
  { name: 'Avenida del Sol', cx: 60, cz: -120, r: 180, palette: ['#c9a13a', '#b8912f', '#d9b148'], h: [18, 46], feel: 'strip' },
  { name: 'Barrio Alto', cx: 300, cz: 330, r: 160, palette: ['#d96a5a', '#c95a4a', '#e87a68'], h: [10, 24], feel: 'barrio' },
];

export const LANDMARKS = [
  { name: 'Fortuna Casino', x: -120, z: -330, kind: 'casino' },
  { name: 'The Lighthouse', x: -520, z: -520, kind: 'lighthouse' },
  { name: 'Cathedral of Santa Fortuna', x: 300, z: 330, kind: 'cathedral' },
  { name: 'Container Port', x: -420, z: 340, kind: 'port' },
  { name: 'Fortuna Stadium', x: 420, z: -120, kind: 'stadium' },
];

// Traffic-light intersections (grid points where lights stand).
export const LIGHTS = [
  { x: -184, z: -92 }, { x: 0, z: -92 }, { x: 184, z: -92 },
  { x: -184, z: 92 }, { x: 0, z: 92 }, { x: 184, z: 92 },
  { x: -184, z: 276 }, { x: 0, z: 276 }, { x: 184, z: 276 },
];

export const CHARACTERS = {
  dante: { name: 'Dante Cruz', alias: 'El Rayo', age: 28, role: 'Mechanic & ex-racer', skin: '#c98a5a', hair: '#1a1210', shirt: '#2b4a6e', desc: 'Former street racer, now a mechanic in his uncle\'s garage.' },
  marco: { name: 'Marco Cruz', alias: '', age: 21, role: 'Dockworker', skin: '#c98a5a', hair: '#241a12', shirt: '#5a6e2b', desc: 'Dante\'s younger brother. Owes the cartel $500,000.' },
  tiburon: { name: 'Don Salvador Vega', alias: 'El Tiburón', age: 63, role: 'Cartel boss', skin: '#d9b08a', hair: '#cfcfcf', shirt: '#1a1a1a', desc: 'Owns the Fortuna Casino and controls the port. Cold, patient, everywhere.' },
  carmen: { name: 'Carmen Vega', alias: 'La Serpiente', age: 30, role: 'Cartel enforcer', skin: '#d9a06a', hair: '#0d0d0d', shirt: '#6e1a2b', desc: 'Runs the street side. Never forgets a debt.' },
  bella: { name: 'Isabella Torres', alias: 'Bella', age: 26, role: 'Pirate-radio journalist', skin: '#b87a4a', hair: '#3a1a10', shirt: '#7a2b5e', desc: 'Has recorded El Tiburón\'s crimes for years. Needs a driver she can trust.' },
  ortiz: { name: 'Father Ortiz', alias: '', age: 70, role: 'Priest of the cathedral', skin: '#c9a06a', hair: '#e8e8e8', shirt: '#2b2b2b', desc: 'Runs the garage as a front. Knows everyone in the Barrio.' },
  rosa: { name: 'Rosa Delgado', alias: 'La Flaca', age: 24, role: 'Getaway driver', skin: '#a86a3a', hair: '#120d0a', shirt: '#c93a2b', desc: 'Dante\'s old racing rival, now his friend.' },
  vex: { name: 'Vex', alias: '', age: 29, role: 'Cartel-backed racer', skin: '#8a6a4a', hair: '#0a0a0a', shirt: '#111111', desc: 'Races for the cartel. Races dirty.' },
  tomas: { name: 'Tomas Reyes', alias: '', age: 34, role: 'Harbor racer', skin: '#b88a5a', hair: '#2a1a10', shirt: '#2b5a6e', desc: 'A dockside legend with a fast boat and a faster car.' },
};

export const MISSIONS = [
  {
    id: 'm1', chapter: 'CH1', title: "A Brother's Debt", giver: 'ortiz',
    place: 'The garage, Barrio Alto', payout: 800,
    brief: 'Marco owes El Tiburón $500,000, due in 7 days. Father Ortiz has a courier job to buy time: drive a sealed package from Puerto Viejo to Mercado Central — without a single scratch on the car.',
    stages: [
      { text: 'Pick up the package at the Puerto Viejo docks', x: -420, z: 340 },
      { text: 'Deliver it to Mercado Central — do not scratch the car', x: -60, z: 60 },
    ],
    outro: 'Package delivered clean. $800 in hand, and one week to save Marco.',
  },
  {
    id: 'm2', chapter: 'CH2', title: "The Mechanic's Favor", giver: 'rosa',
    place: 'Avenida del Sol', payout: 1200,
    brief: 'Rosa needs a gold Comet GT for a client — parked on Casino Row, guarded, and watched. Steal it. Witnesses phone the police after 2.5 seconds, so be quick or be unseen.',
    stages: [
      { text: 'Steal the gold Comet GT on Casino Row', x: -120, z: -300 },
      { text: 'Lose the cops and bring the car to Rosa on Avenida del Sol', x: 60, z: -120 },
    ],
    outro: 'The Comet purrs. Rosa pays $1,200 and winks: "You still steal like a poet."',
  },
  {
    id: 'm3', chapter: 'CH3', title: 'Smoke and Mirrors', giver: 'bella',
    place: 'Pirate-radio station, Mercado Central', payout: 1500,
    brief: 'Bella needs a distraction while she plants a bug in a cartel warehouse. Draw the police to the Shipyard and hold them there for 90 seconds — then vanish. Change cars or respray to clear your wanted level.',
    stages: [
      { text: 'Get the police chasing you to El Astillero', x: -380, z: -260 },
      { text: 'Hold them there for 90 seconds', x: -380, z: -260, hold: 90 },
      { text: 'Vanish — change cars or respray at the garage', x: 276, z: 300 },
    ],
    outro: 'The bug is planted. Bella\'s voice crackles over the radio: "You are a beautiful distraction."',
  },
  {
    id: 'm4', chapter: 'CH4', title: 'Midnight Grand Prix', giver: 'rosa',
    place: 'Avenida del Sol', payout: 5000,
    brief: 'A street race against VEX, the cartel-backed racer, with a $5,000 bet. It is a trap — cartel cars will try to ram you off the road. Win anyway.',
    stages: [
      { text: 'Win the Midnight Grand Prix against Vex', x: 60, z: -120, race: 'strip' },
    ],
    outro: 'Vex eats your dust. $5,000, and the whole Strip saw it.',
  },
  {
    id: 'm5', chapter: 'CH5', title: 'The Longshoreman', giver: 'ortiz',
    place: 'Container port, Puerto Viejo', payout: 2000,
    brief: 'Infiltrate the container port at night, photograph the shipment manifest, and get out without being seen. On foot. Guards patrol. A boat waits for the escape.',
    stages: [
      { text: 'Reach the container port unseen', x: -420, z: 340 },
      { text: 'Photograph the manifest', x: -420, z: 340, hold: 6 },
      { text: 'Escape by boat at the far pier', x: -480, z: 420 },
    ],
    outro: 'The manifest is in Bella\'s hands. The cartel\'s paper trail just grew a face.',
  },
  {
    id: 'm6', chapter: 'CH6', title: 'Static', giver: 'bella',
    place: 'Pirate-radio station, Mercado Central', payout: 2500,
    brief: 'Bella is about to broadcast the evidence. Cartel hitmen are coming for the station. Hold the door for 3 minutes while the broadcast goes out, then drive Bella to safety through a police chase.',
    stages: [
      { text: 'Hold the station door for 3 minutes', x: -60, z: 60, hold: 180 },
      { text: 'Drive Bella to the garage in Barrio Alto', x: 276, z: 300 },
    ],
    outro: 'The broadcast is out. The whole island heard El Tiburón\'s name tonight.',
  },
  {
    id: 'm7', chapter: 'CH7', title: 'The Fortuna Job', giver: 'dante',
    place: 'Fortuna Casino, Casino Row', payout: 500000,
    brief: 'The finale. Rob the Fortuna Casino vault during the grand gala. Get in as a valet, crack the vault, carry the money out, and escape across the causeway while every cop on the island chases you. Marco\'s freedom is in that vault.',
    stages: [
      { text: 'Enter the casino as a valet', x: -120, z: -330 },
      { text: 'Crack the vault', x: -120, z: -330, hold: 20 },
      { text: 'Escape across the causeway to the lighthouse', x: -520, z: -520 },
    ],
    outro: 'Marco is free. El Tiburón is exposed. Dante drives into the sunrise, $500,000 lighter and finally free.',
  },
];

export const RACES = [
  { id: 'strip', name: 'Strip Sprint', place: 'Avenida del Sol', rival: 'vex', laps: 2, checkpoints: [[0, -184], [184, -184], [184, 0], [0, 0]] },
  { id: 'playa', name: 'Playa Norte Run', place: 'Playa Norte', rival: 'rosa', laps: 2, checkpoints: [[368, 92], [460, 184], [368, 276], [276, 184]] },
  { id: 'harbor', name: 'Harbor Loop', place: 'Puerto Viejo', rival: 'tomas', laps: 2, checkpoints: [[-368, 184], [-276, 368], [-460, 368], [-460, 184]] },
];

export const CARS = [
  { name: 'Comet GT', color: 0xd4af37, top: 62, accel: 26, handling: 1.0 },
  { name: 'Bison Pickup', color: 0x7a3a2b, top: 44, accel: 18, handling: 0.8 },
  { name: 'Vesper Sedan', color: 0x2b4a6e, top: 50, accel: 20, handling: 0.9 },
  { name: 'Toro Taxi', color: 0xe8c832, top: 46, accel: 19, handling: 0.9 },
  { name: 'Lobo Cruiser', color: 0x1a1a1a, top: 58, accel: 25, handling: 0.95 },
  { name: 'Solmar Coupe', color: 0xc93a4a, top: 56, accel: 23, handling: 0.95 },
  { name: 'Duna Van', color: 0x8a8a7a, top: 40, accel: 15, handling: 0.7 },
  { name: 'Falco Sport', color: 0x2b7a4a, top: 60, accel: 25, handling: 1.0 },
];

export const RADIO = [
  { name: 'Radio Fortuna', genre: 'Salsa', songs: ['La Marea Dorada', 'Calle del Sol', 'Baila, Fortuna', 'El Tiburón Baila'] },
  { name: 'Isla Rock 101', genre: 'Rock', songs: ['Motor en la Noche', 'Gasolina y Fuego', 'La Loma Arde'] },
  { name: 'Onda Azul', genre: 'Chill', songs: ['Marea Baja', 'Atardecer en Playa Norte', 'Viento del Mar'] },
  { name: 'La Voz del Pueblo', genre: 'Talk', songs: ['Bella Torres en Vivo', 'Noticias de la Isla', 'El Puerto Habla'] },
];

export const WANTED = {
  maxStars: 5,
  decayPerSec: [0, 0.05, 0.04, 0.03, 0.02, 0.012], // per star, while unseen
  witnessDelay: 2.5,
  heliAtStars: 3,
  heliHitsToDown: 3,
  roadblockAtStars: 4,
  swatAtStars: 5,
  changeCarDrop: 1,
  resprayCost: 250,
};

export const ECONOMY = {
  startCash: 150,
  taxiFare: 120,
  discReward: 100,
  respectPerMission: 10,
  respectPerRace: 8,
  respectPerFare: 2,
  respectPerDisc: 1,
  ranks: ['Rookie', 'Hustler', 'Wheelman', 'Kingpin', 'Legend of Fortuna'],
};

export const SUN_DISCS = 15;
export const START = { x: 276, z: 300, heading: Math.PI * 0.75 }; // the garage, Barrio Alto — on the road, clear of the cathedral
export const GARAGE = { x: 276, z: 300 };
export const SHOP = { x: -60, z: 90 }; // weapon shop, Mercado Central

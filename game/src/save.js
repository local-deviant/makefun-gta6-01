// GOLDEN TIDE 3D — save / load (localStorage, one JSON key).

const KEY = 'golden-tide-3d-save-v1';

export function defaultSave() {
  return {
    cash: 250,
    respect: 0,
    missionsDone: [],
    collectibles: [],
    racesWon: 0,
    faresDone: 0,
    bestCar: null,
    settings: { volume: 0.7, muted: false, shadows: true, sensitivity: 1 },
    playMinutes: 0,
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const s = JSON.parse(raw);
    return { ...defaultSave(), ...s, settings: { ...defaultSave().settings, ...(s.settings || {}) } };
  } catch (e) {
    return defaultSave();
  }
}

export function writeSave(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch (e) {
    // storage full or unavailable: the game keeps running unsaved
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}

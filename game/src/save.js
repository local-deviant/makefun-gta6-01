// Save / load via localStorage. One slot, plain JSON, no network.
const KEY = 'isla-fortuna-save-v1';

export function saveGame(state) {
  try {
    const data = {
      cash: state.cash,
      respect: state.respect,
      missionsDone: state.missionsDone,
      racesWon: state.racesWon,
      discs: state.discs,
      faresDone: state.faresDone,
      day: state.day,
      hour: state.hour,
      x: state.x,
      z: state.z,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}

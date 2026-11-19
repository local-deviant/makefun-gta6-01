// The story — 7 missions, chapters, portrait dialogue. Each mission is a
// small stage machine: go to a marker, do the thing, get paid. Every
// mission ends at a real named place. Dialogue is shown with a drawn
// portrait (see util.drawPortrait) and the speaker's name.
import { MISSIONS, CHARACTERS } from './config.js';
import { dist2d, fmtMoney } from './util.js';

export class MissionRunner {
  constructor(onEvent) {
    this.onEvent = onEvent; // (type, payload) -> hud/toast/sound
    this.index = 0; // next mission to start
    this.active = null; // {def, stage, holdT, marker}
    this.done = []; // completed mission ids
    this.marker = null; // {x, z, label}
  }

  get current() { return MISSIONS[this.index] || null; }
  get finished() { return this.index >= MISSIONS.length; }

  start(player) {
    const def = this.current;
    if (!def || this.active) return null;
    this.active = { def, stage: 0, holdT: 0 };
    this.setMarker(def.stages[0]);
    this.say(def.giver, def.brief, def.title + ' — ' + def.chapter);
    this.onEvent('mission-start', { def });
    return def;
  }

  setMarker(stage) {
    this.marker = stage ? { x: stage.x, z: stage.z, label: stage.text } : null;
  }

  say(who, text, title) {
    this.onEvent('dialogue', { who: CHARACTERS[who], text, title: title || '' });
  }

  // Called every tick. Returns events for the main loop.
  update(dt, player) {
    if (!this.active) return [];
    const a = this.active;
    const def = a.def;
    const stage = def.stages[a.stage];
    const p = player.pos;
    const events = [];
    const d = dist2d(p.x, p.z, stage.x, stage.z);
    if (stage.hold) {
      if (d < 14) {
        a.holdT += dt;
        if (a.holdT >= stage.hold) {
          a.holdT = 0;
          this.advance(player);
        }
      } else {
        a.holdT = Math.max(0, a.holdT - dt * 0.5);
      }
    } else if (stage.race) {
      // the race system drives this stage; the runner only waits
    } else if (d < 12) {
      this.advance(player);
    }
    return events;
  }

  advance(player) {
    const a = this.active;
    const def = a.def;
    a.stage++;
    if (a.stage >= def.stages.length) {
      this.complete(player);
      return;
    }
    this.setMarker(def.stages[a.stage]);
    this.onEvent('stage', { text: def.stages[a.stage].text });
  }

  complete(player) {
    const def = this.active.def;
    player.cash += def.payout;
    this.done.push(def.id);
    this.active = null;
    this.marker = null;
    this.index++;
    this.say(def.giver, def.outro + '  +' + fmtMoney(def.payout), def.title + ' — COMPLETE');
    this.onEvent('mission-complete', { def });
  }

  // The race system reports a win/loss for the race stage.
  raceFinished(won) {
    if (!this.active) return;
    const stage = this.active.def.stages[this.active.stage];
    if (!stage || !stage.race) return;
    if (won) this.advance({ pos: () => ({ x: stage.x, z: stage.z }) });
    else this.say('rosa', 'Vex got lucky. Race him again — the Strip never forgets a rematch.', 'Midnight Grand Prix');
  }

  objectiveText() {
    if (!this.active) {
      const next = this.current;
      return next ? 'Next: ' + next.chapter + ' ' + next.title + ' — talk to ' + CHARACTERS[next.giver].name : 'All missions complete. Isla Fortuna is yours.';
    }
    const stage = this.active.def.stages[this.active.stage];
    let t = this.active.def.chapter + ' ' + this.active.def.title + ' — ' + stage.text;
    if (stage.hold) t += ' (' + Math.ceil(stage.hold - this.active.holdT) + 's)';
    return t;
  }

  progress() {
    return { done: this.done.length, total: MISSIONS.length, next: this.current ? this.current.title : null };
  }
}

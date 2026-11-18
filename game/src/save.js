// save.js — localStorage save/load (cash, health, ammo, weapons, missions,
// upgrades, paint, radio station). Autosave every 20 s.
import { WEAPONS } from './config.js';

const KEY = 'lumenbay-v5-save';

export function saveGame(G) {
  try {
    const data = {
      cash: G.cash, points: G.points, missionsDone: G.missionsDone, missionIdx: G.missionIdx,
      hp: G.player.hp, weapon: G.player.weapon, ammo: G.player.ammo, owned: G.player.owned,
      upgrades: G.upgrades, station: G.audio.station, clock: G.clock,
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}

export function loadGame(G) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    G.cash = d.cash ?? G.cash;
    G.points = d.points ?? 0;
    G.missionsDone = d.missionsDone ?? 0;
    G.missionIdx = d.missionIdx ?? 0;
    G.player.hp = d.hp ?? 100;
    G.player.weapon = d.weapon || 'pistol';
    G.player.ammo = d.ammo || { smg: 120, shotgun: 40, rifle: 60 };
    G.player.owned = d.owned || ['pistol'];
    G.upgrades = d.upgrades || { armor: 0, engine: 0, nos: 0, paint: -1 };
    G.clock = d.clock ?? G.clock;
    if (typeof d.station === 'number' && d.station >= 0) G.audio.setStation(d.station);
    return true;
  } catch (e) { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}

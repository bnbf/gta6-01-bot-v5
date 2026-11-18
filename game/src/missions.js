// missions.js — 12-mission story engine. Steps are interpreted here:
// steal-any | steal-marked | goto | timed-goto | collect | gain-heat |
// lose-heat | race | escort | grab-cash.
import { MISSIONS, CFG, dist, clamp } from './config.js';
import { makeCar } from './vehicles.js';

export function startMission(G, idx) {
  const def = MISSIONS[idx];
  if (!def) { G.mission = null; G.objective = ''; return; }
  G.missionIdx = idx;
  G.mission = { def, stepIdx: 0, step: JSON.parse(JSON.stringify(def.steps[0])), timer: 0, collected: [], raceIdx: 0, cashGrabbed: false };
  const s = G.mission.step;
  if (s.type === 'timed-goto' || s.type === 'race') G.mission.timer = s.time;
  if (s.type === 'escort') { G.mission.timer = s.time; spawnWitness(G); }
  if (s.type === 'steal-marked') spawnMarkedCar(G);
  G.objective = s.label || def.brief;
  G.sfx('mission');
}

function spawnWitness(G) {
  const px = G.onFoot ? G.player.x : G.player.x;
  G.witness = { x: px + 60, y: pyOf(G) + 40, angle: 0, name: 'Witness', color: '#ffd23f', hp: 100 };
  function pyOf(G2) { return G2.player.y; }
  G.effects.push({ type: 'text', x: G.witness.x, y: G.witness.y - 30, txt: 'WITNESS — protect them!', t: 2, color: '#ffd23f' });
}

function spawnMarkedCar(G) {
  const lm = G.city.landmarks.marina;
  const car = makeCar(lm.road.x + 60, lm.road.y + 40, 0, { color: '#ffc233', name: 'Gold Comet', kind: 'parked', marked: true });
  G.parked.push(car);
  G.markedCar = car;
  G.effects.push({ type: 'text', x: car.x, y: car.y - 30, txt: 'MARKED CAR', t: 2, color: '#ffc233' });
}

export function missionMarker(G) {
  const m = G.mission;
  if (!m) return null;
  const s = m.step;
  const lm = G.city.landmarks;
  switch (s.type) {
    case 'goto': case 'timed-goto': return { x: lm[s.to].road.x, y: lm[s.to].road.y, label: s.label };
    case 'collect': {
      const next = s.to[m.collected.length];
      if (!next) return null;
      return { x: lm[next].road.x, y: lm[next].road.y, label: s.label };
    }
    case 'lose-heat': return { x: lm[s.to].road.x, y: lm[s.to].road.y, label: s.label };
    case 'race': {
      const next = s.points[m.raceIdx];
      if (!next) return null;
      return { x: lm[next].road.x, y: lm[next].road.y, label: `${s.label} (${m.raceIdx}/${s.points.length})` };
    }
    case 'escort': return { x: lm[s.to].road.x, y: lm[s.to].road.y, label: s.label };
    case 'grab-cash': return { x: lm.bank.road.x, y: lm.bank.road.y, label: s.label };
    case 'steal-marked': return G.markedCar ? { x: G.markedCar.x, y: G.markedCar.y, label: 'Steal the marked gold car at the Marina.' } : null;
    default: return null;
  }
}

function atPos(G, x, y, r = 70) {
  const px = G.onFoot ? G.player.x : (G.car ? G.car.x : G.player.x);
  const py = G.onFoot ? G.player.y : (G.car ? G.car.y : G.player.y);
  return dist(px, py, x, y) < r;
}

function advance(G) {
  const m = G.mission;
  m.stepIdx++;
  if (m.stepIdx >= m.def.steps.length) { completeMission(G); return; }
  m.step = JSON.parse(JSON.stringify(m.def.steps[m.stepIdx]));
  const s = m.step;
  if (s.type === 'timed-goto' || s.type === 'race') m.timer = s.time;
  if (s.type === 'escort') { m.timer = s.time; spawnWitness(G); }
  if (s.type === 'steal-marked') spawnMarkedCar(G);
  G.objective = s.label || m.def.brief;
  G.sfx('mission');
}

function completeMission(G) {
  const m = G.mission;
  G.cash += m.def.reward;
  G.points += 200 + m.def.reward / 5;
  G.effects.push({ type: 'text', x: G.player.x, y: G.player.y - 40, txt: `${m.def.name} COMPLETE +$${m.def.reward}`, t: 2.2, color: '#7CFC00' });
  G.sfx('complete');
  G.missionsDone++;
  if (G.missionIdx + 1 < MISSIONS.length) startMission(G, G.missionIdx + 1);
  else {
    G.mission = null;
    G.objective = 'All 12 missions complete — you are the King of the Bay!';
    G.state = 'won';
  }
}

function failMission(G, reason) {
  G.effects.push({ type: 'text', x: G.player.x, y: G.player.y - 40, txt: `MISSION FAILED: ${reason}`, t: 2, color: '#ff5a5a' });
  G.sfx('fail');
  G.witness = null;
  startMission(G, G.missionIdx); // restart the same mission
}

export function updateMission(G, dt) {
  const m = G.mission;
  if (!m) return;
  const s = m.step;
  const lm = G.city.landmarks;
  if (s.type === 'timed-goto' || s.type === 'race' || s.type === 'escort') {
    m.timer -= dt;
    G.objective = `${s.label} ${Math.max(0, Math.ceil(m.timer))}s left.`;
    if (m.timer <= 0) { failMission(G, 'Out of time'); return; }
  }
  switch (s.type) {
    case 'steal-any':
      if (!G.onFoot && G.car) advance(G);
      break;
    case 'steal-marked':
      if (s.done && !G.onFoot && G.car && G.car.marked) advance(G);
      break;
    case 'goto':
      if (atPos(G, lm[s.to].road.x, lm[s.to].road.y)) advance(G);
      break;
    case 'timed-goto':
      if (atPos(G, lm[s.to].road.x, lm[s.to].road.y)) advance(G);
      break;
    case 'collect': {
      const next = s.to[m.collected.length];
      if (next && atPos(G, lm[next].road.x, lm[next].road.y, 80)) {
        G.cash += 50;
        m.collected.push(next);
        G.sfx('pickup');
        if (m.collected.length >= s.to.length) advance(G);
        else G.objective = `${s.label} (${m.collected.length}/${s.to.length})`;
      }
      break;
    }
    case 'gain-heat':
      if (G.wanted >= s.stars) advance(G);
      break;
    case 'lose-heat':
      if (G.wanted <= 0 && atPos(G, lm[s.to].road.x, lm[s.to].road.y)) advance(G);
      break;
    case 'grab-cash':
      if (!m.cashGrabbed && atPos(G, lm.bank.road.x, lm.bank.road.y, 90)) {
        m.cashGrabbed = true;
        G.cash += s.amount;
        G.wanted = 5;
        G.effects.push({ type: 'text', x: lm.bank.road.x, y: lm.bank.road.y - 30, txt: `+$${s.amount} VAULT CASH!`, t: 1.8, color: '#ffd23f' });
        G.sfx('pickup');
        advance(G);
      }
      break;
    case 'race': {
      const next = s.points[m.raceIdx];
      if (next && atPos(G, lm[next].road.x, lm[next].road.y, 80)) {
        m.raceIdx++;
        G.sfx('pickup');
        if (m.raceIdx >= s.points.length) advance(G);
      }
      break;
    }
    case 'escort': {
      if (!G.witness) { failMission(G, 'The witness is gone'); return; }
      if (atPos(G, lm[s.to].road.x, lm[s.to].road.y, 80) && dist(G.witness.x, G.witness.y, lm[s.to].road.x, lm[s.to].road.y) < 140) {
        G.witness = null;
        advance(G);
      }
      break;
    }
  }
}

// Street-race side job (any time, R near a race start is not needed —
// press T anywhere in a car to start a 3-checkpoint sprint).
export function startSideRace(G) {
  if (G.sideRace || G.onFoot || !G.car) return false;
  G.sideRace = { points: ['raceA', 'raceB', 'raceC'], idx: 0, time: 100 };
  G.objective = 'Side race! Hit 3 checkpoints in 100s.';
  G.sfx('mission');
  return true;
}
export function updateSideRace(G, dt) {
  if (!G.sideRace) return;
  const r = G.sideRace;
  r.time -= dt;
  const lm = G.city.landmarks[r.points[r.idx]];
  if (dist(G.car.x, G.car.y, lm.road.x, lm.road.y) < 80) {
    r.idx++;
    G.sfx('pickup');
    if (r.idx >= r.points.length) {
      G.cash += 200; G.points += 100;
      G.effects.push({ type: 'text', x: G.car.x, y: G.car.y - 30, txt: 'RACE WON +$200', t: 1.6, color: '#7CFC00' });
      G.sideRace = null;
      G.objective = G.mission ? (G.mission.step.label || '') : '';
      return;
    }
  }
  if (r.time <= 0) { G.sideRace = null; G.objective = G.mission ? (G.mission.step.label || '') : ''; }
}
export function sideRaceMarker(G) {
  if (!G.sideRace) return null;
  const lm = G.city.landmarks[G.sideRace.points[G.sideRace.idx]];
  return { x: lm.road.x, y: lm.road.y, label: `Side race CP ${G.sideRace.idx + 1}/3 — ${Math.ceil(G.sideRace.time)}s` };
}

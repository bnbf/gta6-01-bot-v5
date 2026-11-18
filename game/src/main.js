// main.js — loop, input, camera, wanted decay with line-of-sight, shops,
// garage purchases, ?test=1 self-test and ?shot= staging.
import { CFG, MISSIONS, WEAPONS, WEAPON_ORDER, UPGRADES, PAINTS, STATIONS, clamp, dist } from './config.js';
import { createCity } from './city.js';
import { initTraffic, updateTraffic, updatePlayerCar, updatePolice, spawnRoadblock, applyUpgradesToCar, makeCar } from './vehicles.js';
import { initPeds, updatePeds, updateTaxi, startTaxi } from './people.js';
import { updatePlayer, trySteal, driveBy, switchWeapon, shoot } from './player.js';
import { startMission, updateMission, missionMarker, updateSideRace, sideRaceMarker, startSideRace } from './missions.js';
import { createAudio } from './audio.js';
import { render } from './render.js';
import { drawHUD, drawTitle, drawMenu } from './hud.js';
import { saveGame, loadGame } from './save.js';

const params = new URLSearchParams(location.search);
const TEST_MODE = params.get('test') === '1';
const SHOT = params.get('shot') || '';

export function createGame() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const G = {
    ctx, view: { w: 1280, h: 720 },
    city: createCity(),
    audio: createAudio(),
    player: { x: 700, y: 350, angle: 0, aim: 0, hp: 100, weapon: 'pistol', ammo: { smg: 120, shotgun: 40, rifle: 60 }, owned: ['pistol'], fireCd: 0, moving: false },
    onFoot: true, car: null,
    traffic: [], parked: [], police: [], officers: [], peds: [], roadblocks: [],
    heli: null, heliCooldown: 0,
    wanted: 0, cash: 250, points: 0, missionsDone: 0, missionIdx: 0, mission: null, objective: '',
    clock: CFG.CLOCK_START, dayT: 0,
    state: 'title', menu: null,
    cam: { x: 700, y: 350 }, shake: 0,
    effects: [], recentShot: 0,
    upgrades: { armor: 0, engine: 0, nos: 0, paint: -1 },
    mouse: { x: 0, y: 0, wx: 0, wy: 0, down: false },
    input: { up: false, down: false, left: false, right: false, run: false, nos: false },
    nearShop: null, taxiOffer: null, taxi: null, witness: null, markedCar: null, sideRace: null,
    anyCopSeen: false, unseenTimer: 0, wantedTimer: 0,
    missionMarker: null, sideRaceMarker: null,
    autosaveT: 0, testResults: [], testDone: false,
  };
  G.sfx = (n) => G.audio.sfx(n);
  initTraffic(G);
  initPeds(G);
  return G;
}

function resize(G) {
  const w = window.innerWidth, h = window.innerHeight;
  G.view.w = w; G.view.h = h;
  G.ctx.canvas.width = w; G.ctx.canvas.height = h;
}

function nearestShop(G) {
  if (!G.onFoot && !(G.car)) return null;
  const px = G.onFoot ? G.player.x : G.car.x;
  const py = G.onFoot ? G.player.y : G.car.y;
  const lm = G.city.landmarks;
  const spots = [
    { kind: 'gunshop', label: 'LUMEN ARMS gun shop', x: lm.gunshop.road.x, y: lm.gunshop.road.y },
    { kind: 'diner', label: 'Neon Diner', x: lm.diner.road.x, y: lm.diner.road.y },
    { kind: 'garage', label: 'Volt Garage', x: lm.garage.road.x, y: lm.garage.road.y },
    { kind: 'safehouse', label: 'Harbor Loft safehouse', x: lm.safehouse.road.x, y: lm.safehouse.road.y },
  ];
  for (const s of spots) {
    if (dist(px, py, s.x, s.y) < 120) return s;
  }
  return null;
}

export function decayWanted(G, dt) {
  if (G.wanted <= 0) return;
  if (G.anyCopSeen || G.heli) { G.unseenTimer = 0; G.wantedTimer = 0; return; }
  G.unseenTimer += dt;
  if (G.unseenTimer > 4) {
    G.wantedTimer += dt;
    if (G.wantedTimer >= 3) {
      G.wantedTimer = 0;
      G.wanted = Math.max(0, G.wanted - 1);
      if (G.wanted === 0) G.objective = G.mission ? (G.mission.step.label || '') : '';
    }
  }
}

function respawn(G) {
  const lm = G.city.landmarks.safehouse;
  G.player.x = lm.road.x; G.player.y = lm.road.y;
  G.player.hp = 100;
  G.cash = Math.max(0, G.cash - 100);
  G.wanted = 0; G.unseenTimer = 0; G.wantedTimer = 0;
  G.police = []; G.officers = []; G.roadblocks = []; G.heli = null;
  G.onFoot = true; G.car = null;
  G.menu = null;
  G.cam.x = G.player.x; G.cam.y = G.player.y;
}

// --- purchases (also used by the self-test) ---
export function buyWeapon(G, key) {
  const w = WEAPONS[key];
  if (!w) return false;
  if (G.player.owned.includes(key)) {
    if (key === 'pistol') return false;
    if (G.cash < w.ammoPrice) return false;
    G.cash -= w.ammoPrice;
    G.player.ammo[key] = (G.player.ammo[key] || 0) + w.mag;
    G.sfx('buy');
    return true;
  }
  if (G.cash < w.price) return false;
  G.cash -= w.price;
  G.player.owned.push(key);
  G.player.ammo[key] = (G.player.ammo[key] || 0) + w.mag;
  G.player.weapon = key;
  G.sfx('buy');
  return true;
}
export function buyUpgrade(G, kind) {
  const u = UPGRADES[kind];
  const lvl = G.upgrades[kind];
  if (lvl >= 3) return false;
  const price = u.tiers[lvl + 1];
  if (G.cash < price) return false;
  G.cash -= price;
  G.upgrades[kind] = lvl + 1;
  if (kind === 'nos' && G.car) G.car.nos = UPGRADES.nos.charges[lvl + 1];
  applyUpgradesToCar(G);
  G.sfx('buy');
  return true;
}
export function buyGarage(G, action) {
  if (action === 'repair') {
    if (!G.car || G.cash < 30) return false;
    G.cash -= 30; G.car.hp = 100; G.sfx('buy'); return true;
  }
  if (action === 'nos') {
    if (!G.car || G.cash < 15) return false;
    G.cash -= 15; G.car.nos = G.car.maxNos || 1; G.sfx('buy'); return true;
  }
  if (action === 'paint') {
    if (G.cash < 50) return false;
    G.cash -= 50;
    G.upgrades.paint = ((G.upgrades.paint < 0 ? -1 : G.upgrades.paint) + 1) % PAINTS.length;
    applyUpgradesToCar(G);
    G.sfx('buy');
    return true;
  }
  return false;
}

function handleMenuKey(G, key) {
  const m = G.menu;
  if (m === 'gunshop') {
    if (key >= '1' && key <= '4') buyWeapon(G, WEAPON_ORDER[+key - 1]);
    if (key === '5' && G.player.weapon !== 'pistol' && G.cash >= 40) {
      G.cash -= 40;
      G.player.ammo[G.player.weapon] = (G.player.ammo[G.player.weapon] || 0) + 40;
      G.sfx('buy');
    }
  } else if (m === 'diner') {
    if (key === '1' && G.cash >= 20) { G.cash -= 20; G.player.hp = 100; G.sfx('heal'); }
    if (key === '2' && G.cash >= 8) { G.cash -= 8; G.player.hp = Math.min(100, G.player.hp + 25); G.sfx('heal'); }
  } else if (m === 'garage') {
    if (key === '1') buyGarage(G, 'repair');
    if (key === '2') buyGarage(G, 'nos');
    if (key === '3') buyUpgrade(G, 'armor');
    if (key === '4') buyUpgrade(G, 'engine');
    if (key === '5') buyUpgrade(G, 'nos');
    if (key === '6') buyGarage(G, 'paint');
  }
}

function update(G, dt) {
  // state conversions from gameplay events
  if (G.state === 'busted') { G.state = 'playing'; G.menu = 'busted'; }
  if (G.state === 'wasted') { G.state = 'playing'; G.menu = 'wasted'; }
  if (G.state === 'won') { G.state = 'playing'; G.menu = 'won'; }
  if (G.menu || G.state !== 'playing') return;

  G.clock = Math.min(CFG.CLOCK_END, G.clock + dt * CFG.CLOCK_RATE);
  G.dayT = clamp((G.clock - CFG.CLOCK_START) / (CFG.CLOCK_END - CFG.CLOCK_START), 0, 1);

  updatePlayer(G, dt, G.input);
  if (!G.onFoot && G.car) { updatePlayerCar(G, dt, G.input); driveBy(G, dt); }
  updateTraffic(G, dt);
  updatePolice(G, dt);
  updatePeds(G, dt);
  updateMission(G, dt);
  updateTaxi(G, dt);
  updateSideRace(G, dt);
  decayWanted(G, dt);

  if (G.player.hp <= 0) { G.state = 'wasted'; }
  if (Math.random() < dt * 0.15 && G.wanted >= 2) G.sfx('siren');

  G.nearShop = nearestShop(G);
  G.missionMarker = missionMarker(G);
  G.sideRaceMarker = sideRaceMarker(G);

  // camera: follow + velocity lead
  const tx = G.onFoot ? G.player.x : (G.car ? G.car.x : G.player.x);
  const ty = G.onFoot ? G.player.y : (G.car ? G.car.y : G.player.y);
  const lead = G.car ? 0.35 : 0.12;
  const lx = tx + (G.car ? Math.cos(G.car.angle) * G.car.speed * lead : 0);
  const ly = ty + (G.car ? Math.sin(G.car.angle) * G.car.speed * lead : 0);
  G.cam.x += (lx - G.cam.x) * Math.min(1, 4 * dt);
  G.cam.y += (ly - G.cam.y) * Math.min(1, 4 * dt);
  G.cam.x = clamp(G.cam.x, G.view.w / 2 - 100, CFG.WORLD_W - G.view.w / 2 + 100);
  G.cam.y = clamp(G.cam.y, G.view.h / 2 - 100, CFG.WORLD_H - G.view.h / 2 + 100);
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 30);

  // effects age
  for (const e of G.effects) e.t -= dt;
  G.effects = G.effects.filter(e => e.t > 0);

  // autosave
  G.autosaveT += dt;
  if (G.autosaveT > 20) { G.autosaveT = 0; saveGame(G); }
}

function densify(G, cx, cy, cars = 10, peds = 14) {
  // extra traffic + peds clustered near (cx, cy) for dense staged shots
  let added = 0;
  for (let i = 0; i < cars * 3 && added < cars; i++) {
    const rx = Math.floor((cx + (Math.random() - 0.5) * 900) / CFG.TILE) * CFG.TILE;
    const ry = Math.floor((cy + (Math.random() - 0.5) * 700) / CFG.TILE) * CFG.TILE;
    if (rx < 0 || ry < 0 || rx > CFG.WORLD_W || ry > CFG.BEACH_TOP) continue;
    if (dist(rx, ry, cx, cy) < 110) continue; // never spawn on top of the subject
    const car = makeCar(rx, ry, (Math.random() < 0.5 ? 0 : Math.PI / 2) * (Math.random() < 0.5 ? 1 : -1),
      { color: ['#e33b3b', '#3b7de3', '#e3a83b', '#7de33b', '#e36ab0', '#3bd8c9'][added % 6], name: 'Sedan' });
    car.speed = 90 + Math.random() * 60;
    G.traffic.push(car);
    added++;
  }
  for (let i = 0; i < peds; i++) {
    const rp = G.city.nearestRoadPoint(cx + (Math.random() - 0.5) * 700, cy + (Math.random() - 0.5) * 500);
    G.peds.push({ x: rp.x + (Math.random() - 0.5) * 50, y: rp.y + (Math.random() - 0.5) * 50,
      angle: Math.random() * Math.PI * 2, speed: 30, color: '#f2c14e', name: 'Extra', flee: 0, taxi: false, wait: 2 });
  }
  // line the two roads crossing at (cx, cy) with cars so the frame reads dense
  const roadY = Math.round(cy / CFG.TILE) * CFG.TILE;
  const roadX = Math.round(cx / CFG.TILE) * CFG.TILE;
  const cols = ['#e33b3b', '#3b7de3', '#e3a83b', '#7de33b', '#e36ab0', '#3bd8c9'];
  [-330, -230, -150, 150, 230, 330].forEach((off, i) => {
    const car = makeCar(cx + off, roadY + (i % 2 ? -18 : 18), off < 0 ? 0 : Math.PI, { color: cols[i % cols.length], name: 'Sedan' });
    car.speed = 100;
    G.traffic.push(car);
    const car2 = makeCar(roadX + (i % 2 ? -18 : 18), cy + off, off < 0 ? Math.PI / 2 : -Math.PI / 2, { color: cols[(i + 3) % cols.length], name: 'Sedan' });
    car2.speed = 100;
    G.traffic.push(car2);
  });
}

function stageShot(G, shot) {
  G.state = 'playing';
  G.menu = null;
  G.staged = shot; // freeze staged speed/hp/wanted each frame (see update())
  if (shot === 'title') { G.state = 'title'; G.cam.x = 1225; G.cam.y = 700; G.dayT = 0.55; G.clock = 1160; return; }
  if (shot === 'chase') {
    const car = makeCar(1050, 1050, 0, { color: '#8b3dff', name: 'Comet', kind: 'player' });
    car.speed = 500; car.hp = 96; car.maxNos = 2; car.nos = 2;
    G.car = car; G.onFoot = false; G.player.x = car.x; G.player.y = car.y;
    G.wanted = 4; G.cash = 250; G.player.hp = 96;
    G.player.ammo.smg = 48; G.player.owned.push('smg'); G.player.weapon = 'pistol';
    startMission(G, 0);
    // show the delivery step (not the steal step) in the cover shot
    G.mission.stepIdx = 1;
    G.mission.step = JSON.parse(JSON.stringify(MISSIONS[0].steps[1]));
    G.objective = G.mission.step.label;
    updatePolice(G, 0.6);
    // pull two cop cars into the frame and put a roadblock ahead
    if (G.police[0]) { G.police[0].x = car.x - 260; G.police[0].y = car.y - 130; G.police[0].angle = 0.5; }
    if (G.police[1]) { G.police[1].x = car.x + 300; G.police[1].y = car.y + 150; G.police[1].angle = Math.PI + 0.4; }
    spawnRoadblock(G, car.x, car.y);
    G.heli = { x: car.x + 120, y: car.y - 140, hp: 120, maxHp: 120, angle: 0 };
    densify(G, car.x, car.y, 12, 16);
    G.cam.x = car.x; G.cam.y = car.y;
    G.clock = 1170; G.dayT = 0.6;
    return;
  }
  if (shot === 'foot') {
    G.player.x = 1400; G.player.y = 700; G.onFoot = true; G.car = null;
    G.player.weapon = 'smg'; G.player.owned = ['pistol', 'smg']; G.player.ammo.smg = 64;
    G.player.aim = -0.6;
    G.wanted = 2; G.cash = 250;
    startMission(G, 1);
    G.mission.timer = 89;
    updatePolice(G, 0.5);
    densify(G, 1400, 700, 10, 18);
    G.cam.x = 1400; G.cam.y = 700;
    G.clock = 1185; G.dayT = 0.8;
    return;
  }
  if (shot === 'escape') {
    const lm = G.city.landmarks.bank;
    const car = makeCar(lm.road.x + 40, lm.road.y + 60, Math.PI / 2, { color: '#ff2fb3', name: 'Falcon', kind: 'player' });
    car.speed = 420; car.hp = 78; car.maxNos = 2; car.nos = 1;
    G.car = car; G.onFoot = false; G.player.x = car.x; G.player.y = car.y;
    G.wanted = 5; G.cash = 650; G.player.hp = 88;
    startMission(G, 4);
    G.mission.stepIdx = 2; // lose-heat step
    G.mission.step = JSON.parse(JSON.stringify(MISSIONS[4].steps[2]));
    G.objective = G.mission.step.label;
    updatePolice(G, 0.6);
    G.heli = { x: car.x + 120, y: car.y - 140, hp: 90, maxHp: 120, angle: 0 };
    spawnRoadblock(G, car.x, car.y);
    spawnRoadblock(G, car.x + 200, car.y - 100);
    densify(G, car.x, car.y, 12, 14);
    G.cam.x = car.x; G.cam.y = car.y;
    G.clock = 1195; G.dayT = 0.95;
    return;
  }
}

// --- self-test (?test=1): 22 checks over the real systems ---
function runSelfTest(G) {
  const R = [];
  const check = (name, ok) => R.push({ name, ok: !!ok });
  try {
    check('spawn on road', G.city.onRoad(G.player.x, G.player.y, 40));
    check('traffic >= 10', G.traffic.length >= 10);
    check('parked >= 5', G.parked.length >= 5);
    check('peds >= 10', G.peds.length >= 10);
    check('mission 1 active', G.mission && G.mission.def.name === 'First Wheels');
    // walk
    const px0 = G.player.x, py0 = G.player.y;
    G.input.up = true;
    updatePlayer(G, 0.5, G.input);
    G.input.up = false;
    check('walk moves player', dist(px0, py0, G.player.x, G.player.y) > 20);
    // steal a car parked next to the player
    const near = makeCar(G.player.x + 30, G.player.y, 0, { color: '#e33b3b', name: 'Test', kind: 'parked' });
    G.parked.push(near);
    const stole = trySteal(G);
    check('steal car works', stole === 'steal' && !G.onFoot && !!G.car);
    check('wanted rises on steal', G.wanted >= 1);
    // drive (put the car on a road first, facing east along it)
    G.car.x = 700; G.car.y = 350; G.car.angle = 0;
    const s0 = G.car.speed;
    G.input.up = true;
    updatePlayerCar(G, 1.0, G.input);
    G.input.up = false;
    check('car drives', G.car && G.car.speed > 50 && G.car.speed > s0);
    // police at 2 stars
    G.wanted = 2;
    updatePolice(G, 0.5);
    check('police spawn at 2 stars', G.police.length > 0);
    // helicopter at 4 stars
    G.wanted = 4;
    updatePolice(G, 0.5);
    check('helicopter spawns at 4 stars', !!G.heli);
    // mission 1 completes by delivering to the garage (tick 1: steal step,
    // tick 2: at the garage, mission completes and mission 2 starts)
    const gr = G.city.landmarks.garage.road;
    G.car.x = gr.x; G.car.y = gr.y;
    updateMission(G, 0.1);
    updateMission(G, 0.1);
    check('mission 1 completes', G.missionIdx === 1);
    check('mission 2 starts', G.mission && G.mission.def.name === 'Neon Courier');
    // save / load round-trip
    G.cash = 999;
    saveGame(G);
    G.cash = 0;
    loadGame(G);
    check('save/load round-trip', G.cash === 999);
    // shooting consumes ammo
    G.player.owned.push('smg');
    G.player.weapon = 'smg';
    G.player.ammo.smg = 50;
    G.onFoot = true; G.car = null;
    G.player.x = 700; G.player.y = 350;
    const a0 = G.player.ammo.smg;
    G.player.fireCd = 0;
    shoot(G, G.player.x, G.player.y, 0, false);
    check('shooting consumes ammo', G.player.ammo.smg === a0 - 1);
    // gun shop purchase
    G.cash = 1000;
    const bought = buyWeapon(G, 'shotgun');
    check('gun shop buy works', bought && G.player.owned.includes('shotgun'));
    // radio: 4th station
    G.audio.setStation(3);
    check('radio has 4th station', G.audio.radioName() === 'PALM LO-FI');
    // garage upgrade purchase
    G.cash = 1000;
    const up = buyUpgrade(G, 'engine');
    check('garage upgrade purchase works', up && G.upgrades.engine === 1);
    // roadblock at 4 stars
    G.wanted = 4;
    G.roadblocks = [];
    spawnRoadblock(G, G.player.x, G.player.y);
    check('roadblock spawns at 4 stars', G.roadblocks.length > 0);
    // districts
    const names = new Set();
    for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) names.add(G.city.districtAt(c * CFG.TILE + 10, r * CFG.TILE + 10));
    check('6 named districts', names.size === 6);
    check('district lookup (Neon Strip)', G.city.districtAt(1750, 350) === 'Neon Strip');
    // drive-by shooting from a car
    const car2 = makeCar(G.player.x + 40, G.player.y, 0, { color: '#3b7de3', name: 'Test2', kind: 'player' });
    G.car = car2; G.onFoot = false;
    G.player.weapon = 'smg'; G.player.ammo.smg = 50; G.player.fireCd = 0;
    G.mouse.down = true; G.mouse.wx = G.player.x + 200; G.mouse.wy = G.player.y;
    driveBy(G, 0.2);
    G.mouse.down = false;
    check('drive-by shooting works', G.player.ammo.smg < 50);
    // wanted decays when unseen
    G.wanted = 2; G.anyCopSeen = false; G.heli = null;
    G.unseenTimer = 5; G.wantedTimer = 2.9;
    decayWanted(G, 0.2);
    check('wanted decays when unseen', G.wanted === 1);
  } catch (e) {
    R.push({ name: 'no exception: ' + e.message, ok: false });
  }
  G.testResults = R;
  G.testDone = true;
  const passed = R.filter(r => r.ok).length;
  document.title = `TEST ${passed}/${R.length} PASS`;
  console.log(`SELF-TEST ${passed}/${R.length} PASS`);
  R.forEach(r => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name));
}

function drawTestResults(G) {
  const ctx = G.ctx, W = G.view.w;
  ctx.fillStyle = '#0b0b1e';
  ctx.fillRect(0, 0, W, G.view.h);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px monospace';
  const passed = G.testResults.filter(r => r.ok).length;
  ctx.fillText(`LUMEN BAY self-test: ${passed}/${G.testResults.length} PASS`, 20, 40);
  ctx.font = '16px monospace';
  G.testResults.forEach((r, i) => {
    ctx.fillStyle = r.ok ? '#7CFC00' : '#ff5a5a';
    ctx.fillText((r.ok ? 'PASS ' : 'FAIL ') + r.name, 20, 72 + i * 24);
  });
}

function bindInput(G) {
  const keymap = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
  window.addEventListener('keydown', (e) => {
    G.audio.ensure();
    const k = e.code;
    if (keymap[k]) { G.input[keymap[k]] = true; e.preventDefault(); }
    if (k === 'ShiftLeft' || k === 'ShiftRight') { G.input.run = true; G.input.nos = true; }
    if (e.repeat) return;
    if (G.menu && (k === 'Escape' || (k === 'Enter' && (G.menu === 'busted' || G.menu === 'wasted' || G.menu === 'won')))) {
      if (G.menu === 'busted' || G.menu === 'wasted') respawn(G);
      else G.menu = null;
      return;
    }
    if (G.menu) { handleMenuKey(G, e.key); return; }
    if (G.state === 'title') {
      if (k === 'Enter') { G.state = 'playing'; startMission(G, G.missionIdx); }
      return;
    }
    if (k === 'KeyE') {
      const shop = nearestShop(G);
      if (shop && (G.onFoot || shop.kind === 'garage')) {
        G.menu = shop.kind === 'gunshop' ? 'gunshop' : shop.kind === 'diner' ? 'diner' : shop.kind === 'garage' ? 'garage' : 'safehouse';
        if (G.menu === 'safehouse') { G.player.hp = 100; saveGame(G); }
        G.sfx('click');
      } else {
        trySteal(G);
        applyUpgradesToCar(G);
      }
    }
    if (k === 'KeyR') { G.audio.nextStation(); }
    if (k === 'KeyT') {
      if (G.taxiOffer) startTaxi(G, G.taxiOffer);
      else if (!G.onFoot && G.car) startSideRace(G);
    }
    if (k === 'KeyP') G.menu = 'pause';
    if (k === 'KeyH') G.menu = 'help';
    if (k === 'KeyM') G.menu = 'missions';
    if (k >= 'Digit1' && k <= 'Digit4') switchWeapon(G, +k.slice(-1) - 1);
  });
  window.addEventListener('keyup', (e) => {
    const k = e.code;
    if (keymap[k]) G.input[keymap[k]] = false;
    if (k === 'ShiftLeft' || k === 'ShiftRight') { G.input.run = false; G.input.nos = false; }
  });
  const canvas = G.ctx.canvas;
  canvas.addEventListener('mousemove', (e) => {
    G.mouse.x = e.clientX; G.mouse.y = e.clientY;
    G.mouse.wx = G.cam.x - G.view.w / 2 + e.clientX;
    G.mouse.wy = G.cam.y - G.view.h / 2 + e.clientY;
  });
  canvas.addEventListener('mousedown', (e) => { G.audio.ensure(); G.mouse.down = true; });
  window.addEventListener('mouseup', () => { G.mouse.down = false; });
  window.addEventListener('resize', () => resize(G));
}

export function boot() {
  const G = createGame();
  resize(G);
  bindInput(G);
  loadGame(G);
  startMission(G, G.missionIdx);
  if (SHOT) {
    stageShot(G, SHOT);
    // staged shots are frozen frames: compute the markers once here, since
    // the update loop is skipped while staged (see frame()).
    G.missionMarker = missionMarker(G);
    G.sideRaceMarker = sideRaceMarker(G);
  }
  if (TEST_MODE) {
    G.state = 'playing';
    runSelfTest(G);
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!TEST_MODE && !G.staged) update(G, dt);
    render(G);
    if (G.state === 'title') drawTitle(G);
    else if (G.menu) drawMenu(G);
    else drawHUD(G);
    if (TEST_MODE && G.testDone) drawTestResults(G);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return G;
}

boot();

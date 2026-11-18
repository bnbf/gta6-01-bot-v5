// player.js — walking/running, stealing and exiting cars, mouse-aim hitscan
// shooting on foot and drive-by shooting from a car.
import { CFG, WEAPONS, clamp, dist, angTo, angDiff } from './config.js';
import { damageCar } from './vehicles.js';

export function updatePlayer(G, dt, input) {
  const p = G.player;
  if (G.recentShot > 0) G.recentShot -= dt;
  if (!G.onFoot) return;
  const run = input.run;
  const speed = run ? CFG.RUN_SPEED : CFG.WALK_SPEED;
  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (mx || my) {
    const len = Math.hypot(mx, my);
    mx /= len; my /= len;
    p.angle = Math.atan2(my, mx);
    const nx = p.x + mx * speed * dt;
    const ny = p.y + my * speed * dt;
    if (!G.city.circleHitsBuilding(nx, p.y, 14)) p.x = clamp(nx, 16, CFG.WORLD_W - 16);
    if (!G.city.circleHitsBuilding(p.x, ny, 14)) p.y = clamp(ny, 16, CFG.WORLD_H - 16);
    p.moving = true;
  } else p.moving = false;
  // aim at the mouse (world coords)
  p.aim = Math.atan2(G.mouse.wy - p.y, G.mouse.wx - p.x);
  // firing
  p.fireCd -= dt;
  if (input.mouseDown && p.fireCd <= 0) shoot(G, p.x, p.y, p.aim, false);
}

export function nearestCar(G, x, y, maxD) {
  let best = null, bd = maxD;
  const all = [...G.traffic, ...G.parked, ...G.police];
  for (const c of all) {
    const d = dist(x, y, c.x, c.y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export function trySteal(G) {
  const p = G.player;
  if (!G.onFoot) { // exit the car
    if (!G.car) return;
    const car = G.car;
    G.car = null;
    G.onFoot = true;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    const parked = { ...car, kind: 'parked', speed: 0 };
    G.parked.push(parked);
    return 'exit';
  }
  const car = nearestCar(G, p.x, p.y, 64);
  if (!car) return null;
  // remove from its list, become the player car
  for (const list of [G.traffic, G.parked, G.police]) {
    const i = list.indexOf(car);
    if (i >= 0) list.splice(i, 1);
  }
  G.car = car;
  G.car.kind = 'player';
  G.onFoot = false;
  G.player.x = car.x; G.player.y = car.y;
  if (!car.stolen) {
    car.stolen = true;
    G.wanted = Math.max(G.wanted, 1);
    G.points += 20;
    G.sfx('steal');
    G.effects.push({ type: 'text', x: car.x, y: car.y - 34, txt: 'CAR STOLEN', t: 1.1, color: '#ff9f1c' });
  }
  // marked-car mission hook
  if (car.marked && G.mission && G.mission.step && G.mission.step.type === 'steal-marked') {
    G.mission.step.done = true;
  }
  return 'steal';
}

export function shoot(G, x, y, angle, driveBy) {
  const p = G.player;
  const w = WEAPONS[p.weapon];
  if (p.weapon !== 'pistol') {
    if ((p.ammo[p.weapon] || 0) <= 0) { G.sfx('empty'); p.fireCd = 0.3; return false; }
    p.ammo[p.weapon]--;
  }
  p.fireCd = w.rate;
  G.recentShot = 1.2;
  if (G.wanted < 1) { G.wanted = 1; }
  G.sfx('shot');
  const pellets = w.pellets || 1;
  let hitAnything = false;
  for (let k = 0; k < pellets; k++) {
    const a = angle + (Math.random() - 0.5) * w.spread * (driveBy ? 2.2 : 1);
    const ex = x + Math.cos(a) * w.range;
    const ey = y + Math.sin(a) * w.range;
    // tracer
    G.effects.push({ type: 'tracer', x1: x, y1: y, x2: ex, y2: ey, t: 0.08 });
    // helicopter: shootable from anywhere in range (it hovers low)
    if (G.heli) {
      const hd = dist(x, y, G.heli.x, G.heli.y);
      const hAlong = (G.heli.x - x) * Math.cos(a) + (G.heli.y - y) * Math.sin(a);
      const hSide = Math.abs(-(G.heli.x - x) * Math.sin(a) + (G.heli.y - y) * Math.cos(a));
      if (hd < w.range && hAlong > 0 && hSide < 46) {
        G.heli.hp -= w.dmg;
        hitAnything = true;
        G.effects.push({ type: 'text', x: G.heli.x, y: G.heli.y - 20, txt: `-${w.dmg}`, t: 0.5, color: '#ffd23f' });
      }
    }
    // hit the nearest cop / officer / ped along the ray
    const targets = [
      ...G.police.map(c => ({ x: c.x, y: c.y, r: 24, kind: 'cop', ref: c })),
      ...G.officers.map(o => ({ x: o.x, y: o.y, r: 14, kind: 'officer', ref: o })),
    ];
    let bestT = null, bestD = 1e18;
    for (const t of targets) {
      const along = (t.x - x) * Math.cos(a) + (t.y - y) * Math.sin(a);
      const side = Math.abs(-(t.x - x) * Math.sin(a) + (t.y - y) * Math.cos(a));
      if (along > 0 && along < w.range && side < t.r && along < bestD) { bestD = along; bestT = t; }
    }
    if (bestT && !G.city.segmentBlocked(x, y, bestT.x, bestT.y)) {
      hitAnything = true;
      if (bestT.kind === 'cop') {
        bestT.ref.hp -= w.dmg;
        if (bestT.ref.hp <= 0) {
          G.police.splice(G.police.indexOf(bestT.ref), 1);
          G.cash += 50; G.points += 60;
          G.effects.push({ type: 'text', x: bestT.x, y: bestT.y - 30, txt: 'COP DOWN +$50', t: 1.2, color: '#ffd23f' });
        }
      } else {
        bestT.ref.hp -= w.dmg;
        if (bestT.ref.hp <= 0) G.officers.splice(G.officers.indexOf(bestT.ref), 1);
      }
      G.effects.push({ type: 'text', x: bestT.x, y: bestT.y - 20, txt: `-${w.dmg}`, t: 0.5, color: '#fff' });
    }
  }
  if (G.onFoot === false && driveBy) p.fireCd = w.rate * 1.25;
  return hitAnything;
}

// Drive-by: called from main while the player is in a car and clicking.
export function driveBy(G, dt) {
  const p = G.player;
  p.fireCd -= dt;
  if (G.mouse.down && p.fireCd <= 0 && G.car) {
    const a = Math.atan2(G.mouse.wy - G.car.y, G.mouse.wx - G.car.x);
    shoot(G, G.car.x, G.car.y, a, true);
  }
}

export function switchWeapon(G, idx) {
  const order = ['pistol', 'smg', 'shotgun', 'rifle'];
  const key = order[idx];
  if (!key) return;
  if (key !== 'pistol' && !G.player.owned.includes(key)) return;
  G.player.weapon = key;
  G.sfx('click');
}

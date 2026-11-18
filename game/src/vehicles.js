// vehicles.js — traffic AI, player arcade driving, police chase with
// line-of-sight, police helicopter, and 4-5 star roadblocks.
import { CFG, UPGRADES, clamp, dist, angTo, angDiff, mulberry32, pick } from './config.js';

const CAR_COLORS = ['#e33b3b', '#3b7de3', '#e3a83b', '#7de33b', '#c9c9c9', '#e36ab0', '#3bd8c9', '#8b5cf6', '#f97316'];
const CAR_NAMES = ['Comet', 'Vortex', 'Sunrise', 'Falcon', 'Metro', 'Stallion', 'Breeze', 'Onyx'];

export function makeCar(x, y, angle, opts = {}) {
  return {
    x, y, angle, speed: 0, color: opts.color || '#e33b3b',
    name: opts.name || 'Sedan', kind: opts.kind || 'traffic',
    hp: opts.hp ?? 100, maxHp: 100, nos: 0, maxNos: 1,
    target: null, dir: 0, wait: 0, stolen: false, marked: !!opts.marked,
  };
}

export function initTraffic(G) {
  const rng = mulberry32(0x77aa11);
  G.traffic = [];
  for (let i = 0; i < CFG.TRAFFIC_N; i++) {
    const rx = Math.floor(rng() * (CFG.COLS + 1)) * CFG.TILE;
    const ry = Math.floor(rng() * (CFG.ROWS + 1)) * CFG.TILE;
    const vertical = rng() < 0.5;
    const car = makeCar(rx + (vertical ? 0 : (rng() - 0.5) * 30), ry + (vertical ? (rng() - 0.5) * 30 : 0),
      vertical ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI),
      { color: pick(rng, CAR_COLORS), name: pick(rng, CAR_NAMES) });
    car.speed = 90 + rng() * 70;
    car.vertical = vertical;
    G.traffic.push(car);
  }
  G.parked = [];
  for (let i = 0; i < CFG.PARKED_N; i++) {
    const rx = Math.floor(rng() * (CFG.COLS + 1)) * CFG.TILE;
    const ry = Math.floor(rng() * (CFG.ROWS + 1)) * CFG.TILE;
    const side = rng() < 0.5 ? -1 : 1;
    const vertical = rng() < 0.5;
    const car = makeCar(rx + (vertical ? side * 34 : (rng() - 0.5) * 40), ry + (vertical ? (rng() - 0.5) * 40 : side * 34),
      vertical ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI),
      { color: pick(rng, CAR_COLORS), name: pick(rng, CAR_NAMES), kind: 'parked' });
    G.parked.push(car);
  }
  G.police = [];
  G.roadblocks = [];
  G.heli = null;
  G.heliCooldown = 0;
}

// Traffic: drive along roads, turn at intersections, slow for the car ahead.
export function updateTraffic(G, dt) {
  for (const car of G.traffic) {
    const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
    // car ahead on same lane?
    let slow = false;
    for (const o of G.traffic) {
      if (o === car) continue;
      const dx = o.x - car.x, dy = o.y - car.y;
      const along = dx * fx + dy * fy;
      const side = Math.abs(-dx * fy + dy * fx);
      if (along > 0 && along < 70 && side < 26) { slow = true; break; }
    }
    if (G.car && !G.onFoot) {
      const dx = G.car.x - car.x, dy = G.car.y - car.y;
      const along = dx * fx + dy * fy, side = Math.abs(-dx * fy + dy * fx);
      if (along > 0 && along < 70 && side < 26) slow = true;
    }
    const target = slow ? 0 : 120;
    car.speed += clamp(target - car.speed, -260 * dt, 150 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    // at an intersection, sometimes turn
    const nearX = Math.abs(car.x % CFG.TILE) < 8 || Math.abs(car.x % CFG.TILE - CFG.TILE) < 8;
    const nearY = Math.abs(car.y % CFG.TILE) < 8 || Math.abs(car.y % CFG.TILE - CFG.TILE) < 8;
    if (nearX && nearY && Math.random() < 0.35) {
      const turns = [0, Math.PI / 2, -Math.PI / 2];
      car.angle += turns[Math.floor(Math.random() * turns.length)];
    }
    // wrap / respawn far away
    if (car.x < -60 || car.x > CFG.WORLD_W + 60 || car.y < -60 || car.y > CFG.BEACH_TOP + 60) {
      const rx = Math.floor(Math.random() * (CFG.COLS + 1)) * CFG.TILE;
      const ry = Math.floor(Math.random() * (CFG.ROWS + 1)) * CFG.TILE;
      car.x = rx; car.y = ry; car.speed = 100;
    }
    // keep on road: nudge back if drifted into a block
    if (!G.city.onRoad(car.x, car.y, 6)) {
      const rp = G.city.nearestRoadPoint(car.x, car.y);
      car.x += (rp.x - car.x) * 0.5; car.y += (rp.y - car.y) * 0.5;
    }
  }
}

// Player arcade driving. Returns nothing; mutates G.car.
export function updatePlayerCar(G, dt, input) {
  const car = G.car;
  if (!car) return;
  const up = G.upgrades;
  const maxSpeed = CFG.CAR_MAX * UPGRADES.engine.speed[up.engine];
  const accel = CFG.CAR_ACCEL * (1 + up.engine * 0.12);
  let throttle = 0;
  if (input.up) throttle = 1;
  if (input.down) throttle = -0.7;
  if (input.nos && car.nos > 0 && car.speed > 60) {
    car.nos -= dt;
    throttle = Math.max(throttle, 1);
    car.speed += CFG.CAR_ACCEL * (CFG.NOS_BOOST - 1) * dt;
    if (Math.random() < 0.3) G.effects.push({ type: 'flame', x: car.x - Math.cos(car.angle) * 26, y: car.y - Math.sin(car.angle) * 26, t: 0.25 });
  }
  car.speed += throttle * accel * dt;
  if (!input.up && !input.down) car.speed -= Math.sign(car.speed) * 140 * dt;
  car.speed = clamp(car.speed, -160, maxSpeed * (car.nos > 0 && input.nos ? CFG.NOS_BOOST : 1));
  if (Math.abs(car.speed) < 4 && !input.up && !input.down) car.speed = 0;
  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  if (Math.abs(car.speed) > 8) {
    car.angle += steer * CFG.CAR_TURN * dt * clamp(Math.abs(car.speed) / 220, 0.25, 1) * Math.sign(car.speed);
  }
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const hit = G.city.circleHitsBuilding(nx, ny, 24);
  if (hit) {
    if (Math.abs(car.speed) > 120) {
      if (!G.staged) damageCar(G, car, Math.abs(car.speed) * 0.06);
      G.sfx('crash');
      G.shake = Math.min(10, Math.abs(car.speed) * 0.03);
      G.effects.push({ type: 'text', x: car.x, y: car.y - 30, txt: 'CRASH', t: 0.8, color: '#ff5a5a' });
    }
    car.speed *= -0.25;
  } else {
    car.x = clamp(nx, 20, CFG.WORLD_W - 20);
    car.y = clamp(ny, 20, CFG.WORLD_H - 20);
  }
  // collide with traffic cars: bump + damage (not while staging a screenshot)
  for (const o of G.traffic) {
    if (dist(car.x, car.y, o.x, o.y) < 44) {
      const push = 60 * dt;
      o.x += Math.cos(car.angle) * push * 4; o.y += Math.sin(car.angle) * push * 4;
      if (Math.abs(car.speed) > 150 && !G.staged) { damageCar(G, car, 4); G.sfx('crash'); }
      car.speed *= 0.92;
    }
  }
  if (car.hp < 45 && Math.random() < dt * 2) {
    G.effects.push({ type: 'smoke', x: car.x + (Math.random() - 0.5) * 20, y: car.y - 14, t: 0.9 });
  }
}

export function damageCar(G, car, amount) {
  const block = UPGRADES.armor.block[G.upgrades.armor];
  const dmg = amount * (1 - block);
  car.hp = Math.max(0, car.hp - dmg);
  if (car.hp <= 0 && car === G.car) {
    G.effects.push({ type: 'text', x: car.x, y: car.y - 40, txt: 'CAR WRECKED', t: 1.2, color: '#ff5a5a' });
    G.onFoot = true;
    G.car = null;
    G.player.x = car.x + 30; G.player.y = car.y + 30;
  }
  return dmg;
}

export function applyUpgradesToCar(G) {
  if (!G.car) return;
  G.car.maxNos = UPGRADES.nos.charges[G.upgrades.nos];
  if (G.car.nos > G.car.maxNos) G.car.nos = G.car.maxNos;
  const paint = G.upgrades.paint;
  if (paint >= 0) G.car.color = ['#8b3dff', '#ff2fb3', '#19c8b9', '#ff7a1a', '#e8ecf4', '#ffc233'][paint];
}

// --- Police ---
export function wantedTarget(G) {
  if (G.wanted <= 0) return 0;
  if (G.wanted <= 1) return 1;
  if (G.wanted <= 2) return 2;
  if (G.wanted <= 3) return 3;
  return 4;
}

export function updatePolice(G, dt) {
  const want = wantedTarget(G);
  const px = G.onFoot ? G.player.x : (G.car ? G.car.x : G.player.x);
  const py = G.onFoot ? G.player.y : (G.car ? G.car.y : G.player.y);
  // spawn / despawn
  while (G.police.length < want) {
    const a = Math.random() * Math.PI * 2;
    const bx = G.roadblocks.length && Math.random() < 0.5
      ? G.roadblocks[Math.floor(Math.random() * G.roadblocks.length)].x
      : px + Math.cos(a) * 620;
    const by = G.roadblocks.length && Math.random() < 0.5
      ? G.roadblocks[Math.floor(Math.random() * G.roadblocks.length)].y
      : py + Math.sin(a) * 620;
    const rp = G.city.nearestRoadPoint(clamp(bx, 0, CFG.WORLD_W), clamp(by, 0, CFG.BEACH_TOP));
    const car = makeCar(rp.x, rp.y, angTo(rp.x, rp.y, px, py), { color: '#1a1a2e', name: 'Interceptor', kind: 'police' });
    car.speed = 200;
    G.police.push(car);
  }
  while (G.police.length > want) G.police.pop();
  // chase: steer toward player, ram; line-of-sight decides "seen"
  let anySeen = false;
  for (const cop of G.police) {
    const d = dist(cop.x, cop.y, px, py);
    const blocked = G.city.segmentBlocked(cop.x, cop.y, px, py);
    const seen = d < 560 && !blocked;
    if (seen) anySeen = true;
    cop.seen = seen;
    const desired = angTo(cop.x, cop.y, px, py);
    cop.angle += clamp(angDiff(cop.angle, desired), -2.4 * dt, 2.4 * dt);
    const targetSpeed = d > 90 ? 330 + G.wanted * 22 : 200;
    cop.speed += clamp(targetSpeed - cop.speed, -500 * dt, 320 * dt);
    const nx = cop.x + Math.cos(cop.angle) * cop.speed * dt;
    const ny = cop.y + Math.sin(cop.angle) * cop.speed * dt;
    if (!G.city.circleHitsBuilding(nx, ny, 22)) { cop.x = nx; cop.y = ny; }
    else { cop.angle += 1.2 * dt; cop.speed *= 0.6; }
    // ram the player (not while staging a screenshot)
    if (!G.onFoot && G.car && d < 46 && !G.staged) {
      damageCar(G, G.car, 14 * dt * 3);
      G.car.speed *= 0.94;
      if (Math.random() < dt * 2) G.sfx('crash');
    }
    if (G.onFoot && d < 34) {
      G.player.hp -= 10 * dt * 3;
      G.effects.push({ type: 'text', x: G.player.x, y: G.player.y - 30, txt: '-HP', t: 0.5, color: '#ff5a5a' });
      if (G.player.hp <= 0) G.state = 'wasted';
    }
  }
  G.anyCopSeen = anySeen;
  // helicopter from 4 stars
  if (G.wanted >= 4 && !G.heli && G.heliCooldown <= 0) {
    G.heli = { x: px + 160, y: py - 180, hp: 120, maxHp: 120, angle: 0 };
    G.sfx('heli');
  }
  if (G.heli) {
    const h = G.heli;
    h.x += (px + 120 - h.x) * 0.6 * dt;
    h.y += (py - 140 - h.y) * 0.6 * dt;
    h.angle += dt * 0.8;
    // spotlight counts as seeing you
    anySeen = true;
    G.anyCopSeen = true;
    if (h.hp <= 0) {
      G.cash += 500; G.points += 150;
      G.effects.push({ type: 'text', x: h.x, y: h.y, txt: 'HELI DOWN +$500', t: 1.6, color: '#ffd23f' });
      G.sfx('explosion');
      G.heli = null;
      G.heliCooldown = 20;
      G.wanted = Math.max(1, G.wanted - 1);
    }
  }
  if (G.heliCooldown > 0) G.heliCooldown -= dt;
  // roadblocks at 4-5 stars: barricades on the roads ahead of the player
  if (G.wanted >= 4) {
    if (G.roadblocks.length < 3 && Math.random() < dt * 0.5) spawnRoadblock(G, px, py);
  } else if (G.wanted < 3) {
    G.roadblocks = [];
  }
  // roadblock collision: slow the player car hard (no damage while staging)
  for (const rb of G.roadblocks) {
    if (!G.onFoot && G.car && dist(G.car.x, G.car.y, rb.x, rb.y) < 40) {
      G.car.speed *= 0.55;
      if (!G.staged) damageCar(G, G.car, 3);
      if (Math.random() < dt) G.sfx('crash');
    }
  }
}

export function spawnRoadblock(G, px, py) {
  // pick a road intersection ahead of the player's heading, 350-550 px out
  const heading = G.car ? G.car.angle : G.player.angle;
  const bx = px + Math.cos(heading) * (380 + Math.random() * 160);
  const by = py + Math.sin(heading) * (380 + Math.random() * 160);
  const rp = G.city.nearestRoadPoint(clamp(bx, 60, CFG.WORLD_W - 60), clamp(by, 60, CFG.BEACH_TOP - 60));
  // snap to a true intersection for a believable barricade
  const ix = Math.round(rp.x / CFG.TILE) * CFG.TILE;
  const iy = Math.round(rp.y / CFG.TILE) * CFG.TILE;
  if (G.roadblocks.some(r => dist(r.x, r.y, ix, iy) < 300)) return;
  G.roadblocks.push({ x: ix, y: iy, angle: Math.random() * Math.PI });
  G.effects.push({ type: 'text', x: ix, y: iy - 40, txt: 'ROADBLOCK!', t: 1.4, color: '#ff9f1c' });
}

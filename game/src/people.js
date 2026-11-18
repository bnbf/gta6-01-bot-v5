// people.js — pedestrians who stroll and flee crime, foot officers who chase
// and bust, and the taxi-fare side job.
import { CFG, clamp, dist, angTo, mulberry32, pick } from './config.js';

const PED_COLORS = ['#f2c14e', '#e07a5f', '#81b29a', '#f4a261', '#a78bfa', '#60a5fa', '#f472b6', '#34d399'];
const PED_NAMES = ['Mara', 'Jules', 'Rico', 'Tessa', 'Dee', 'Omar', 'Lena', 'Kai', 'Nia', 'Pete'];

export function initPeds(G) {
  const rng = mulberry32(0x99beef);
  G.peds = [];
  for (let i = 0; i < CFG.PED_N; i++) {
    const x = 100 + rng() * (CFG.WORLD_W - 200);
    const y = 100 + rng() * (CFG.BEACH_TOP - 200);
    const rp = G.city.nearestRoadPoint(x, y);
    G.peds.push({ x: rp.x + (rng() - 0.5) * 60, y: rp.y + (rng() - 0.5) * 60,
      angle: rng() * Math.PI * 2, speed: 28 + rng() * 30, color: pick(rng, PED_COLORS),
      name: pick(rng, PED_NAMES), flee: 0, taxi: false, wait: rng() * 4 });
  }
  G.officers = [];
  G.taxi = null;
  G.witness = null;
}

export function updatePeds(G, dt) {
  const px = G.onFoot ? G.player.x : (G.car ? G.car.x : G.player.x);
  const py = G.onFoot ? G.player.y : (G.car ? G.car.y : G.player.y);
  const crime = G.wanted > 0 || G.recentShot > 0;
  for (const p of G.peds) {
    const d = dist(p.x, p.y, px, py);
    if (crime && d < 260) p.flee = 2.5;
    if (p.flee > 0) {
      p.flee -= dt;
      const a = angTo(px, py, p.x, p.y);
      p.x += Math.cos(a) * 120 * dt;
      p.y += Math.sin(a) * 120 * dt;
      p.angle = a;
    } else {
      p.wait -= dt;
      if (p.wait <= 0) {
        p.angle = Math.floor(Math.random() * 4) * (Math.PI / 2);
        p.wait = 2 + Math.random() * 4;
      }
      const nx = p.x + Math.cos(p.angle) * p.speed * dt;
      const ny = p.y + Math.sin(p.angle) * p.speed * dt;
      if (!G.city.pointInBuilding(nx, ny) && nx > 30 && nx < CFG.WORLD_W - 30 && ny > 30 && ny < CFG.BEACH_TOP - 30) {
        p.x = nx; p.y = ny;
      } else { p.angle += Math.PI / 2; }
    }
    // taxi flag: a ped near the road waves when the player drives by slowly
    if (!G.onFoot && G.car && Math.abs(G.car.speed) < 120 && d < 90 && !G.taxi && Math.random() < dt * 0.05) {
      p.taxi = true;
      G.taxiOffer = p;
    }
  }
  // foot officers from 2 stars
  const wantOfficers = G.wanted >= 2 ? Math.min(3, G.wanted - 1) : 0;
  while (G.officers.length < wantOfficers) {
    const a = Math.random() * Math.PI * 2;
    const rp = G.city.nearestRoadPoint(clamp(px + Math.cos(a) * 420, 0, CFG.WORLD_W), clamp(py + Math.sin(a) * 420, 0, CFG.BEACH_TOP));
    G.officers.push({ x: rp.x, y: rp.y, angle: 0, speed: 150, hp: 50 });
  }
  while (G.officers.length > wantOfficers) G.officers.pop();
  for (const o of G.officers) {
    const d = dist(o.x, o.y, px, py);
    if (!G.onFoot) { // officers wait near the car / give up slowly
      o.x += Math.cos(o.angle) * 20 * dt;
      continue;
    }
    o.angle = angTo(o.x, o.y, px, py);
    const blocked = G.city.segmentBlocked(o.x, o.y, px, py);
    if (d > 26 && !blocked) {
      o.x += Math.cos(o.angle) * o.speed * dt;
      o.y += Math.sin(o.angle) * o.speed * dt;
    }
    if (d < 30) {
      // bust: player is caught
      G.state = 'busted';
      G.bustedAt = performance.now();
    }
  }
  // witness escort: follows the player, stays close
  if (G.witness) {
    const w = G.witness;
    const d = dist(w.x, w.y, px, py);
    if (d > 60) {
      const a = angTo(w.x, w.y, px, py);
      w.x += Math.cos(a) * 150 * dt;
      w.y += Math.sin(a) * 150 * dt;
      w.angle = a;
    }
  }
}

// Taxi side job: pick up the waving ped, drive them to a random landmark.
export function startTaxi(G, ped) {
  const spots = ['diner', 'marina', 'bank', 'plaza', 'pier', 'garage'];
  const dest = spots[Math.floor(Math.random() * spots.length)];
  G.taxi = { ped, dest, fare: 60 + Math.floor(Math.random() * 90), time: 75 };
  ped.taxi = false;
  G.taxiOffer = null;
  G.objective = `Taxi: drop ${ped.name} at ${G.city.landmarks[dest].label}. $${G.taxi.fare}`;
}
export function updateTaxi(G, dt) {
  if (!G.taxi) return;
  G.taxi.time -= dt;
  const lm = G.city.landmarks[G.taxi.dest];
  if (!G.onFoot && G.car && dist(G.car.x, G.car.y, lm.road.x, lm.road.y) < 70) {
    G.cash += G.taxi.fare; G.points += 40;
    G.effects.push({ type: 'text', x: lm.road.x, y: lm.road.y - 30, txt: `FARE +$${G.taxi.fare}`, t: 1.4, color: '#7CFC00' });
    G.sfx('pickup');
    G.taxi = null;
    G.objective = '';
  } else if (G.taxi.time <= 0) {
    G.effects.push({ type: 'text', x: G.player.x, y: G.player.y - 30, txt: 'FARE LOST', t: 1.2, color: '#ff5a5a' });
    G.taxi = null;
    G.objective = '';
  }
}

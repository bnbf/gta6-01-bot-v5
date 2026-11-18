// city.js — deterministic seeded city: 7x6 blocks, roads, buildings, parks,
// beach + sea, district lookup, landmarks, collision and line-of-sight.
import { CFG, DISTRICT_MAP, districtByName, mulberry32, pick, clamp } from './config.js';

const NEON_SIGNS = ['ARCADE', 'CLUB VOLT', 'MOTEL', 'LUMEN ARMS', 'NEON DINER', 'PIER 9', 'HOTEL LUMEN', 'TACOS', '24H', 'CASINO', 'RAMEN', 'BAR 88', 'GYM', 'CINEMA', 'KARAOKE', 'DONUTS'];

export function createCity() {
  const rng = mulberry32(0x1b7e5a11);
  const buildings = [];
  const parks = [];
  const palms = [];
  const landmarks = {};
  const roadX = []; // vertical road centre lines
  const roadY = [];
  for (let i = 0; i <= CFG.COLS; i++) roadX.push(i * CFG.TILE);
  for (let j = 0; j <= CFG.ROWS; j++) roadY.push(j * CFG.TILE);

  function blockRect(c, r) {
    return { x: c * CFG.TILE + CFG.ROAD_W / 2 + 8, y: r * CFG.TILE + CFG.ROAD_W / 2 + 8,
             w: CFG.TILE - CFG.ROAD_W - 16, h: CFG.TILE - CFG.ROAD_W - 16 };
  }
  function districtAt(x, y) {
    const c = clamp(Math.floor(x / CFG.TILE), 0, CFG.COLS - 1);
    const r = clamp(Math.floor(y / CFG.TILE), 0, CFG.ROWS - 1);
    return DISTRICT_MAP[r][c];
  }
  function roadPointNear(x, y) {
    // nearest point on the road grid (intersection snap)
    const ix = clamp(Math.round(x / CFG.TILE), 0, CFG.COLS) * CFG.TILE;
    const iy = clamp(Math.round(y / CFG.TILE), 0, CFG.ROWS) * CFG.TILE;
    return { x: ix, y: iy };
  }

  for (let r = 0; r < CFG.ROWS; r++) {
    for (let c = 0; c < CFG.COLS; c++) {
      const b = blockRect(c, r);
      const d = districtByName(districtAt(b.x + b.w / 2, b.y + b.h / 2));
      const roll = rng();
      if (roll < 0.14) { // park / plaza block
        parks.push({ ...b, district: d.name });
        for (let k = 0; k < 5; k++) palms.push({ x: b.x + 30 + rng() * (b.w - 60), y: b.y + 30 + rng() * (b.h - 60) });
        continue;
      }
      const n = rng() < 0.55 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const bw = n === 1 ? b.w * (0.55 + rng() * 0.3) : b.w * (0.42 + rng() * 0.12);
        const bh = n === 1 ? b.h * (0.55 + rng() * 0.3) : b.h * (0.42 + rng() * 0.12);
        const bx = n === 1 ? b.x + (b.w - bw) / 2 : b.x + k * (b.w / 2) + (b.w / 2 - bw) / 2;
        const by = n === 1 ? b.y + (b.h - bh) / 2 : b.y + (b.h - bh) / 2 + (rng() - 0.5) * 30;
        const sign = rng() < 0.5 ? pick(rng, NEON_SIGNS) : null;
        buildings.push({ x: bx, y: by, w: bw, h: bh, district: d.name,
          color: d.build, roof: d.roof, sign, signColor: d.sign,
          winSeed: Math.floor(rng() * 1e9) });
      }
    }
  }

  // Named landmarks: fixed blocks, with a road point to stand/drive to.
  function landmark(name, bc, br, label) {
    const b = blockRect(bc, br);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const rp = roadPointNear(cx, cy + b.h / 2 + 60);
    landmarks[name] = { x: cx, y: cy, road: rp, label, district: districtAt(cx, cy) };
    // paint the landmark building's sign
    let best = null, bd = 1e18;
    for (const bl of buildings) {
      const d = Math.hypot(bl.x + bl.w / 2 - cx, bl.y + bl.h / 2 - cy);
      if (d < bd) { bd = d; best = bl; }
    }
    if (best) { best.sign = label; best.signColor = districtByName(districtAt(cx, cy)).sign; }
    return landmarks[name];
  }
  landmark('garage', 2, 1, 'VOLT GARAGE');
  landmark('gunshop', 4, 1, 'LUMEN ARMS');
  landmark('diner', 3, 2, 'NEON DINER');
  landmark('safehouse', 5, 2, 'HARBOR LOFT');
  landmark('bank', 3, 1, 'LUMEN TRUST');
  landmark('marina', 6, 2, 'MARINA');
  landmark('docks', 6, 3, 'DOCKSIDE');
  landmark('industrial', 0, 3, 'INDUSTRIAL YARD');
  landmark('plaza', 5, 1, 'NEON PLAZA');
  landmark('chapel', 0, 0, 'OLD CHAPEL');
  landmark('pier', 3, 5, 'PIER 9');
  // Race checkpoints: spread intersections across the city.
  landmarks.raceA = { x: 350, y: 350, road: { x: 350, y: 350 }, label: 'CP1', district: 'Old Town' };
  landmarks.raceB = { x: 2100, y: 350, road: { x: 2100, y: 350 }, label: 'CP2', district: 'Neon Strip' };
  landmarks.raceC = { x: 2100, y: 1400, road: { x: 2100, y: 1400 }, label: 'CP3', district: 'Marina' };
  landmarks.raceD = { x: 350, y: 1400, road: { x: 350, y: 1400 }, label: 'CP4', district: 'Industrial' };
  landmarks.raceE = { x: 1225, y: 700, road: { x: 1225, y: 700 }, label: 'CP5', district: 'Downtown' };
  landmarks.raceF = { x: 1750, y: 1750, road: { x: 1750, y: 1750 }, label: 'CP6', district: 'Beachfront' };

  function onRoad(x, y, pad = 0) {
    const hw = CFG.ROAD_W / 2 + pad;
    for (const rx of roadX) if (Math.abs(x - rx) <= hw && y >= -20 && y <= CFG.BEACH_TOP + 20) return true;
    for (const ry of roadY) if (Math.abs(y - ry) <= hw && x >= -20 && x <= CFG.WORLD_W + 20) return true;
    return false;
  }
  function pointInBuilding(x, y) {
    for (const b of buildings) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    return null;
  }
  function circleHitsBuilding(x, y, r) {
    for (const b of buildings) {
      const cx = clamp(x, b.x, b.x + b.w), cy = clamp(y, b.y, b.y + b.h);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r) return b;
    }
    return null;
  }
  function segmentBlocked(x1, y1, x2, y2) {
    const d = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(1, Math.ceil(d / 14));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (pointInBuilding(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return true;
    }
    return false;
  }
  function nearestRoadPoint(x, y) {
    // closest point on the road network (for spawning traffic on roads)
    let best = null, bd = 1e18;
    for (const rx of roadX) {
      const yy = clamp(y, 0, CFG.BEACH_TOP);
      const d = Math.hypot(x - rx, y - yy);
      if (d < bd) { bd = d; best = { x: rx, y: yy }; }
    }
    for (const ry of roadY) {
      const xx = clamp(x, 0, CFG.WORLD_W);
      const d = Math.hypot(x - xx, y - ry);
      if (d < bd) { bd = d; best = { x: xx, y: ry }; }
    }
    return best;
  }

  return { buildings, parks, palms, landmarks, roadX, roadY,
    districtAt, onRoad, pointInBuilding, circleHitsBuilding, segmentBlocked,
    nearestRoadPoint, roadPointNear };
}

// LUMEN BAY: Neon Heat — config.js
// Original open-world crime game. All constants, districts, weapons, economy,
// radio stations, garage upgrades and the 12-mission story live here.

export const CFG = {
  TILE: 350,          // road pitch (block 260 + road 90)
  ROAD_W: 90,
  COLS: 7,
  ROWS: 6,
  BEACH_TOP: 2190,    // city height; beach + sea extend below
  WORLD_W: 2540,
  WORLD_H: 2550,
  CLOCK_START: 1120,  // 18:40 in minutes
  CLOCK_END: 1200,    // 20:00
  CLOCK_RATE: 0.4,     // game-minutes per real second (80 min over ~200 s)
  WALK_SPEED: 165,
  RUN_SPEED: 250,
  CAR_MAX: 560,        // px/s top speed (base), upgrades multiply
  CAR_ACCEL: 420,
  CAR_BRAKE: 700,
  CAR_TURN: 2.9,
  NOS_BOOST: 1.55,
  POLICE_MAX: 6,
  TRAFFIC_N: 16,
  PARKED_N: 10,
  PED_N: 34,
};

// Seeded RNG (mulberry32) — deterministic city, traffic colours, etc.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
export function angTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
export function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Six named districts. Each block of the 7x6 grid belongs to one district;
// the palette + landmark flavour of a block comes from its district.
export const DISTRICTS = [
  { name: 'Old Town',   tint: '#8a6d4b', build: '#4a3a5e', roof: '#6b543a', sign: '#ffb347', lamp: '#ffd9a0' },
  { name: 'Downtown',   tint: '#3d4a7a', build: '#3c3f6e', roof: '#2e3160', sign: '#7dd3fc', lamp: '#ffe9a8' },
  { name: 'Neon Strip', tint: '#7a2a6e', build: '#4b2a63', roof: '#3a1f4d', sign: '#ff2fb3', lamp: '#ffb3e6' },
  { name: 'Marina',     tint: '#1f5f6e', build: '#2a4a63', roof: '#1f3a4d', sign: '#2ee6c8', lamp: '#b3fff2' },
  { name: 'Industrial', tint: '#5e4a2a', build: '#4d4438', roof: '#3a3226', sign: '#ffb020', lamp: '#ffe1a0' },
  { name: 'Beachfront', tint: '#2a6e5f', build: '#3a5e6e', roof: '#2a4a5e', sign: '#ff7a59', lamp: '#ffe9c9' },
];
// District per block: rows of 7 columns each (row 0 = north).
export const DISTRICT_MAP = [
  ['Old Town', 'Old Town', 'Downtown', 'Downtown', 'Downtown', 'Neon Strip', 'Neon Strip'],
  ['Old Town', 'Downtown', 'Downtown', 'Downtown', 'Neon Strip', 'Neon Strip', 'Neon Strip'],
  ['Industrial', 'Industrial', 'Downtown', 'Downtown', 'Neon Strip', 'Marina', 'Marina'],
  ['Industrial', 'Industrial', 'Downtown', 'Downtown', 'Marina', 'Marina', 'Beachfront'],
  ['Industrial', 'Industrial', 'Beachfront', 'Beachfront', 'Beachfront', 'Beachfront', 'Beachfront'],
  ['Beachfront', 'Beachfront', 'Beachfront', 'Beachfront', 'Beachfront', 'Beachfront', 'Beachfront'],
];
export function districtByName(name) { return DISTRICTS.find(d => d.name === name); }

export const WEAPONS = {
  pistol:  { name: 'Pistol',  dmg: 26, rate: 0.28, spread: 0.05, range: 520, price: 0,   ammoPrice: 0,  mag: Infinity },
  smg:     { name: 'SMG',     dmg: 13, rate: 0.09, spread: 0.12, range: 460, price: 150, ammoPrice: 40, mag: 120 },
  shotgun: { name: 'Shotgun', dmg: 11, rate: 0.75, spread: 0.30, range: 340, price: 250, ammoPrice: 60, mag: 40, pellets: 5 },
  rifle:   { name: 'Rifle',   dmg: 48, rate: 0.55, spread: 0.02, range: 720, price: 450, ammoPrice: 90, mag: 60 },
};
export const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'rifle'];

export const STATIONS = [
  { name: 'NEON FM',      desc: 'synthwave', bpm: 112, root: 57, scale: [0, 3, 5, 7, 10], wave: 'sawtooth', bass: 'triangle' },
  { name: 'SUNSET DRIVE', desc: '80s pop',   bpm: 100, root: 62, scale: [0, 2, 4, 7, 9],  wave: 'square',   bass: 'sine' },
  { name: 'BAY BASS',     desc: 'electro',   bpm: 128, root: 45, scale: [0, 3, 5, 6, 10], wave: 'sawtooth', bass: 'sawtooth' },
  { name: 'PALM LO-FI',   desc: 'late-night lo-fi', bpm: 72, root: 55, scale: [0, 2, 5, 7, 9], wave: 'sine', bass: 'sine' },
];

export const UPGRADES = {
  armor:  { name: 'Armor',  tiers: [0, 120, 260, 450], desc: ['Stock panels', 'Reinforced doors', 'Armored hull', 'Military plating'], block: [0, 0.25, 0.5, 0.65] },
  engine: { name: 'Engine', tiers: [0, 150, 320, 550], desc: ['Stock motor', 'Tuned V6', 'Twin-turbo V8', 'Race-spec V12'], speed: [1, 1.15, 1.3, 1.5] },
  nos:    { name: 'NOS',    tiers: [0, 100, 220, 380], desc: ['No NOS', 'Single bottle', 'Twin bottles', 'Triple shot'], charges: [1, 2, 3, 4] },
};
export const PAINTS = [
  { name: 'Midnight Purple', color: '#8b3dff' },
  { name: 'Neon Pink', color: '#ff2fb3' },
  { name: 'Bay Teal', color: '#19c8b9' },
  { name: 'Sunset Orange', color: '#ff7a1a' },
  { name: 'Ghost White', color: '#e8ecf4' },
  { name: 'Lumen Gold', color: '#ffc233' },
];

export const RANKS = [
  { pts: 0, name: 'Street Punk' },
  { pts: 300, name: 'Hustler' },
  { pts: 800, name: 'Wheelman' },
  { pts: 1600, name: 'Enforcer' },
  { pts: 2800, name: 'King of the Bay' },
];
export function rankFor(pts) {
  let r = RANKS[0];
  for (const x of RANKS) if (pts >= x.pts) r = x;
  return r.name;
}

// 12 story missions. Steps are interpreted by missions.js:
//  steal-any | goto | timed-goto | collect | gain-heat | lose-heat | race | escort | grab-cash
export const MISSIONS = [
  { id: 1, name: 'First Wheels', brief: 'Steal any car and deliver it to Volt Garage.', reward: 250,
    steps: [{ type: 'steal-any' }, { type: 'goto', to: 'garage', label: 'Deliver the car to Volt Garage.' }] },
  { id: 2, name: 'Neon Courier', brief: 'A package for the Neon Diner. 90 seconds. No excuses.', reward: 300,
    steps: [{ type: 'timed-goto', to: 'diner', time: 90, label: 'Deliver the package to the Neon Diner.' }] },
  { id: 3, name: 'Protection Money', brief: 'Collect from three shops on the Strip. Be polite. Be firm.', reward: 350,
    steps: [{ type: 'collect', to: ['gunshop', 'diner', 'garage'], label: 'Collect protection money.' }] },
  { id: 4, name: 'Heat Wave', brief: 'The PD is watching. Get to 3 stars, then shake the heat and reach the Harbor Loft.', reward: 400,
    steps: [{ type: 'gain-heat', stars: 3, label: 'Raise heat to 3 stars.' }, { type: 'lose-heat', to: 'safehouse', label: 'Lose the heat, then reach the Harbor Loft.' }] },
  { id: 5, name: 'The Big Score', brief: 'Hit Lumen Trust Bank. Grab the vault cash and vanish.', reward: 800,
    steps: [{ type: 'goto', to: 'bank', label: 'Reach Lumen Trust Bank.' }, { type: 'grab-cash', amount: 400, label: 'Grab the vault cash!' }, { type: 'lose-heat', to: 'safehouse', label: 'Escape the 5-star heat. Reach the Harbor Loft.' }] },
  { id: 6, name: 'Midnight Race', brief: 'Four checkpoints, 120 seconds, no brakes. Win the Strip.', reward: 500,
    steps: [{ type: 'race', points: ['raceA', 'raceB', 'raceC', 'raceD'], time: 120, label: 'Race! Hit every checkpoint.' }] },
  { id: 7, name: 'King of the Bay', brief: 'Prove it at the Marina, then cross the Strip in 100 seconds with the PD on you.', reward: 600,
    steps: [{ type: 'goto', to: 'marina', label: 'Reach the Marina.' }, { type: 'timed-goto', to: 'plaza', time: 100, label: 'Cross to Neon Plaza in 100s!' }] },
  { id: 8, name: 'Bay Circuit', brief: 'The full circuit: six checkpoints, 150 seconds. The Strip is watching.', reward: 550,
    steps: [{ type: 'race', points: ['raceA', 'raceC', 'raceE', 'raceF', 'raceB', 'raceD'], time: 150, label: 'Bay Circuit! Hit every checkpoint.' }] },
  { id: 9, name: 'Dockside Run', brief: 'Pick up the crate at the Dockside Warehouse. Drop it at the Industrial Yard. 120 seconds.', reward: 650,
    steps: [{ type: 'goto', to: 'docks', label: 'Pick up the crate at the Dockside Warehouse.' }, { type: 'timed-goto', to: 'industrial', time: 120, label: 'Deliver the crate to the Industrial Yard.' }] },
  { id: 10, name: 'Garage Job', brief: 'A marked car is waiting near the Marina. Steal it, keep it in one piece, bring it to Volt Garage.', reward: 700,
    steps: [{ type: 'steal-marked' }, { type: 'goto', to: 'garage', label: 'Deliver the marked car to Volt Garage. Keep it clean!' }] },
  { id: 11, name: 'Safe Witness', brief: 'Vera has a witness. Walk them to the Harbor Loft in 150 seconds. Keep them alive.', reward: 750,
    steps: [{ type: 'escort', to: 'safehouse', time: 150, label: 'Escort the witness to the Harbor Loft.' }] },
  { id: 12, name: "Kingpin's Fall", brief: 'The finale. Hit the bank one last time, ride out the 5-star storm, and come home to the Loft.', reward: 1500,
    steps: [{ type: 'goto', to: 'bank', label: 'Reach Lumen Trust Bank.' }, { type: 'grab-cash', amount: 600, label: 'Grab the vault cash!' }, { type: 'lose-heat', to: 'safehouse', label: 'Lose the 5-star heat. Reach the Harbor Loft.' }] },
];

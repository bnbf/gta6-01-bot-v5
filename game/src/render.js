// render.js — canvas world rendering: golden dusk fading to neon night,
// neon signs, street lamps, headlights, light pool, helicopter spotlight,
// district ground labels, and the minimap with district names.
import { CFG, DISTRICTS, districtByName, clamp } from './config.js';

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpColor(c1, c2, t) {
  const p = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const a = p(c1), b = p(c2);
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
}

export function render(G) {
  const ctx = G.ctx;
  const W = G.view.w, H = G.view.h;
  const cam = G.cam;
  const dayT = G.dayT; // 0 = golden dusk 18:40, 1 = neon night 20:00
  ctx.fillStyle = '#0b0b1e';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2 - cam.x, H / 2 - cam.y);
  if (G.shake > 0.3) ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);

  // --- ground ---
  ctx.fillStyle = lerpColor('#3a3048', '#1c1930', dayT);
  ctx.fillRect(-100, -100, CFG.WORLD_W + 200, CFG.BEACH_TOP + 100);
  // beach + sea
  ctx.fillStyle = lerpColor('#c9a86a', '#7a6a45', dayT);
  ctx.fillRect(-100, CFG.BEACH_TOP, CFG.WORLD_W + 200, 160);
  const seaT = (performance.now() / 900) % 1;
  ctx.fillStyle = lerpColor('#2a6f8e', '#0a2a4a', dayT);
  ctx.fillRect(-100, CFG.BEACH_TOP + 160, CFG.WORLD_W + 200, 200);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const y = CFG.BEACH_TOP + 170 + i * 28 + Math.sin(seaT * 6 + i) * 3;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CFG.WORLD_W, y); ctx.stroke();
  }
  // pier
  ctx.fillStyle = '#5a4632';
  ctx.fillRect(1180, CFG.BEACH_TOP - 20, 90, 200);
  ctx.fillStyle = '#ff7a59';
  ctx.font = 'bold 15px monospace';
  ctx.fillText('PIER 9', 1190, CFG.BEACH_TOP + 190);

  // --- roads ---
  const roadCol = lerpColor('#4a4458', '#232033', dayT);
  ctx.fillStyle = roadCol;
  for (const rx of G.city.roadX) ctx.fillRect(rx - CFG.ROAD_W / 2, -40, CFG.ROAD_W, CFG.BEACH_TOP + 40);
  for (const ry of G.city.roadY) ctx.fillRect(-40, ry - CFG.ROAD_W / 2, CFG.WORLD_W + 80, CFG.ROAD_W);
  // dashed centre lines
  ctx.strokeStyle = 'rgba(255,214,100,0.55)';
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 22]);
  for (const rx of G.city.roadX) { ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx, CFG.BEACH_TOP); ctx.stroke(); }
  for (const ry of G.city.roadY) { ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(CFG.WORLD_W, ry); ctx.stroke(); }
  ctx.setLineDash([]);

  // --- parks ---
  for (const pk of G.city.parks) {
    ctx.fillStyle = lerpColor('#3d6b3a', '#1d3a24', dayT);
    ctx.fillRect(pk.x, pk.y, pk.w, pk.h);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.arc(pk.x + pk.w / 2, pk.y + pk.h / 2, 42, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(pk.x + pk.w / 2, pk.y + pk.h / 2, 42, 0, Math.PI * 2); ctx.stroke();
  }
  // palms
  ctx.fillStyle = '#2d5a2d';
  for (const pl of G.city.palms) {
    ctx.beginPath(); ctx.arc(pl.x, pl.y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3d7a3d'; ctx.lineWidth = 2;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(pl.x, pl.y); ctx.lineTo(pl.x + Math.cos(a) * 12, pl.y + Math.sin(a) * 12); ctx.stroke();
    }
  }

  // --- district ground labels ---
  ctx.textAlign = 'center';
  for (let r = 0; r < CFG.ROWS; r++) {
    for (let c = 0; c < CFG.COLS; c++) {
      const name = G.city.districtAt(c * CFG.TILE + CFG.TILE / 2, r * CFG.TILE + CFG.TILE / 2);
      if (c === 0 && r === 0) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.font = 'bold 17px monospace';
      const bx = c * CFG.TILE + CFG.TILE / 2, by = r * CFG.TILE + CFG.TILE / 2;
      if (!G.city.pointInBuilding(bx, by)) ctx.fillText(name.toUpperCase(), bx, by);
    }
  }

  // --- buildings ---
  for (const b of G.city.buildings) {
    const d = districtByName(b.district);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(b.x + 6, b.y + 6, b.w, b.h);
    ctx.fillStyle = lerpColor(b.color, '#241f38', dayT * 0.5);
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x, b.y, b.w, 8);
    // lit windows
    const cols = Math.max(2, Math.floor(b.w / 26)), rows = Math.max(2, Math.floor(b.h / 30));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const lit = ((b.winSeed + i * 7 + j * 13) % 10) < 6;
        ctx.fillStyle = lit ? (dayT > 0.4 ? '#ffd97a' : '#ffe9a8') : 'rgba(0,0,0,0.35)';
        ctx.fillRect(b.x + 8 + i * ((b.w - 16) / cols), b.y + 14 + j * ((b.h - 24) / rows), 12, 14);
      }
    }
    // neon sign
    if (b.sign) {
      ctx.save();
      ctx.shadowColor = b.signColor; ctx.shadowBlur = 14;
      ctx.fillStyle = b.signColor;
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(b.sign, b.x + b.w / 2, b.y - 6);
      ctx.restore();
    }
  }

  drawMarkers(G, ctx);
  drawCars(G, ctx);
  drawPeds(G, ctx);
  drawPlayer(G, ctx);
  drawHeli(G, ctx);
  drawEffects(G, ctx);

  // --- night lighting overlay ---
  const night = ctx.createRadialGradient(cam.x, cam.y, 120, cam.x, cam.y, 620);
  night.addColorStop(0, `rgba(6,6,26,${0.05 + dayT * 0.10})`);
  night.addColorStop(1, `rgba(6,6,26,${dayT * 0.55})`);
  ctx.fillStyle = night;
  ctx.fillRect(cam.x - 700, cam.y - 500, 1400, 1000);
  // player light pool
  const px = G.onFoot ? G.player.x : (G.car ? G.car.x : G.player.x);
  const py = G.onFoot ? G.player.y : (G.car ? G.car.y : G.player.y);
  const pool = ctx.createRadialGradient(px, py, 20, px, py, 260);
  pool.addColorStop(0, 'rgba(255,220,150,0.20)');
  pool.addColorStop(1, 'rgba(255,220,150,0)');
  ctx.fillStyle = pool;
  ctx.fillRect(px - 280, py - 280, 560, 560);

  ctx.restore();
  drawMinimap(G, ctx);
  if (G.wanted >= 4) {
    ctx.strokeStyle = 'rgba(255,40,40,0.35)';
    ctx.lineWidth = 26;
    ctx.strokeRect(0, 0, W, H);
  }
}

function drawMarkers(G, ctx) {
  const marks = [];
  const mm = G.missionMarker;
  if (mm) marks.push({ ...mm, color: '#2ee6c8' });
  const sr = G.sideRaceMarker;
  if (sr) marks.push({ ...sr, color: '#ffd23f' });
  if (G.taxi) {
    const lm = G.city.landmarks[G.taxi.dest];
    marks.push({ x: lm.road.x, y: lm.road.y, label: 'TAXI DROP', color: '#ffd23f' });
  }
  const t = performance.now() / 400;
  for (const m of marks) {
    const bob = Math.sin(t) * 6;
    ctx.save();
    ctx.strokeStyle = m.color; ctx.lineWidth = 3;
    ctx.fillStyle = m.color + '33';
    ctx.beginPath(); ctx.arc(m.x, m.y, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = m.color;
    ctx.beginPath(); ctx.moveTo(m.x, m.y - 58 + bob); ctx.lineTo(m.x - 10, m.y - 38 + bob); ctx.lineTo(m.x + 10, m.y - 38 + bob); ctx.closePath(); ctx.fill();
    ctx.fillRect(m.x - 2, m.y - 58 + bob, 4, 22);
    ctx.restore();
  }
}

function drawCarShape(ctx, car, isPlayer) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(-22, -10, 46, 24);
  ctx.fillStyle = car.color;
  ctx.fillRect(-22, -11, 44, 22);
  ctx.fillStyle = '#1c2436';
  ctx.fillRect(-6, -9, 14, 18);
  ctx.fillStyle = '#dfe8ff';
  ctx.fillRect(18, -9, 4, 18); // windshield
  if (car.kind === 'police') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-22, -11, 44, 6);
    ctx.fillStyle = '#e33b3b';
    ctx.fillRect(-22, 5, 44, 6);
    const blink = Math.floor(performance.now() / 200) % 2 === 0;
    ctx.fillStyle = blink ? '#ff2f2f' : '#2f7bff';
    ctx.fillRect(-4, -14, 8, 4);
  }
  if (car.marked) {
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2;
    ctx.strokeRect(-24, -13, 48, 26);
  }
  // damage smoke handled by effects; hp bar for player car
  if (isPlayer && car.hp < 100) {
    ctx.fillStyle = '#000';
    ctx.fillRect(-22, -20, 44, 5);
    ctx.fillStyle = car.hp > 45 ? '#7CFC00' : '#ff5a5a';
    ctx.fillRect(-22, -20, 44 * (car.hp / 100), 5);
  }
  ctx.restore();
  // headlight cones at night
  if (G_dayT > 0.35) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const g = ctx.createLinearGradient(22, 0, 170, 0);
    g.addColorStop(0, 'rgba(255,240,180,0.20)');
    g.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(22, -8); ctx.lineTo(170, -42); ctx.lineTo(170, 42); ctx.lineTo(22, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
let G_dayT = 0;

function drawCars(G, ctx) {
  G_dayT = G.dayT;
  for (const c of G.traffic) drawCarShape(ctx, c, false);
  for (const c of G.parked) drawCarShape(ctx, c, false);
  for (const c of G.police) drawCarShape(ctx, c, false);
  if (G.car) drawCarShape(ctx, G.car, true);
  // roadblocks: striped barricades + cones
  for (const rb of G.roadblocks) {
    ctx.save();
    ctx.translate(rb.x, rb.y);
    ctx.rotate(rb.angle);
    ctx.fillStyle = '#ff9f1c';
    ctx.fillRect(-40, -8, 80, 16);
    ctx.fillStyle = '#111';
    for (let i = -3; i <= 3; i += 2) ctx.fillRect(i * 11, -8, 11, 16);
    ctx.fillStyle = '#ff5a5a';
    ctx.beginPath(); ctx.arc(-52, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(52, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function drawPeds(G, ctx) {
  for (const p of G.peds) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(4, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (p.taxi) {
      ctx.fillStyle = '#ffd23f';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI?', p.x, p.y - 14);
    }
  }
  for (const o of G.officers) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.fillStyle = '#1a2a5e';
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
    ctx.fillText('PD', o.x, o.y + 3);
    ctx.restore();
  }
  if (G.witness) {
    const w = G.witness;
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.fillStyle = w.color;
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
    ctx.fillText('W', w.x, w.y + 3);
    ctx.restore();
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
    ctx.fillText('WITNESS', w.x, w.y - 16);
  }
}

function drawPlayer(G, ctx) {
  if (!G.onFoot) return;
  const p = G.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.aim);
  ctx.fillStyle = '#111';
  ctx.fillRect(6, -2, 18, 4); // gun
  ctx.restore();
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = '#19c8b9';
  ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0b3d3a';
  ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // aim line
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(p.aim) * 46, p.y + Math.sin(p.aim) * 46); ctx.stroke();
}

function drawHeli(G, ctx) {
  if (!G.heli) return;
  const h = G.heli;
  // spotlight cone down to the player
  const px = G.onFoot ? G.player.x : (G.car ? G.car.x : G.player.x);
  const py = G.onFoot ? G.player.y : (G.car ? G.car.y : G.player.y);
  ctx.save();
  const g = ctx.createLinearGradient(h.x, h.y, px, py);
  g.addColorStop(0, 'rgba(255,255,200,0.30)');
  g.addColorStop(1, 'rgba(255,255,200,0.05)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(h.x, h.y);
  ctx.lineTo(px - 55, py - 20); ctx.lineTo(px + 55, py + 20);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(h.angle);
  ctx.fillStyle = '#22263a';
  ctx.fillRect(-20, -7, 40, 14);
  ctx.fillStyle = '#3a4066';
  ctx.fillRect(-8, -5, 16, 10);
  ctx.strokeStyle = '#8a90b8'; ctx.lineWidth = 3;
  const rot = performance.now() / 60;
  ctx.beginPath(); ctx.moveTo(Math.cos(rot) * 34, Math.sin(rot) * 34); ctx.lineTo(-Math.cos(rot) * 34, -Math.sin(rot) * 34); ctx.stroke();
  ctx.restore();
  // hp bar
  ctx.fillStyle = '#000';
  ctx.fillRect(h.x - 26, h.y - 30, 52, 6);
  ctx.fillStyle = '#ff5a5a';
  ctx.fillRect(h.x - 26, h.y - 30, 52 * (h.hp / h.maxHp), 6);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
  ctx.fillText('PD HELI', h.x, h.y - 36);
}

function drawEffects(G, ctx) {
  for (const e of G.effects) {
    if (e.type === 'tracer') {
      ctx.strokeStyle = 'rgba(255,220,120,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2); ctx.stroke();
    } else if (e.type === 'smoke') {
      ctx.fillStyle = `rgba(120,120,120,${0.5 * (e.t / 0.9)})`;
      ctx.beginPath(); ctx.arc(e.x, e.y, 10 + (0.9 - e.t) * 14, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === 'flame') {
      ctx.fillStyle = 'rgba(255,140,0,0.8)';
      ctx.beginPath(); ctx.arc(e.x, e.y, 7, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === 'text') {
      ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = e.color || '#fff';
      ctx.fillText(e.txt, e.x, e.y);
    }
  }
}

function drawMinimap(G, ctx) {
  const W = G.view.w;
  const mw = 190, mh = 150;
  const mx = W - mw - 14, my = 14;
  const sx = mw / CFG.WORLD_W, sy = mh / CFG.BEACH_TOP;
  ctx.fillStyle = 'rgba(8,10,24,0.85)';
  ctx.fillRect(mx, my, mw, mh);
  ctx.strokeStyle = '#2ee6c8'; ctx.lineWidth = 2;
  ctx.strokeRect(mx, my, mw, mh);
  // district blocks
  for (let r = 0; r < CFG.ROWS; r++) {
    for (let c = 0; c < CFG.COLS; c++) {
      const d = districtByName(G.city.districtAt(c * CFG.TILE + 10, r * CFG.TILE + 10));
      ctx.fillStyle = d.tint + '55';
      ctx.fillRect(mx + (c * CFG.TILE) * sx, my + (r * CFG.TILE) * sy, CFG.TILE * sx, CFG.TILE * sy);
    }
  }
  // district labels (first letter clusters + 3 key names)
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '8px monospace'; ctx.textAlign = 'left';
  const labels = [['Downtown', 3, 1], ['Neon Strip', 5, 1], ['Marina', 6, 2], ['Old Town', 0, 0], ['Industrial', 0, 3], ['Beachfront', 3, 5]];
  for (const [name, c, r] of labels) {
    ctx.fillText(name.toUpperCase(), mx + (c * CFG.TILE + 6) * sx, my + (r * CFG.TILE + 16) * sy);
  }
  // roads
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  for (const rx of G.city.roadX) { ctx.beginPath(); ctx.moveTo(mx + rx * sx, my); ctx.lineTo(mx + rx * sx, my + CFG.BEACH_TOP * sy); ctx.stroke(); }
  for (const ry of G.city.roadY) { ctx.beginPath(); ctx.moveTo(mx, my + ry * sy); ctx.lineTo(mx + mw, my + ry * sy); ctx.stroke(); }
  const dot = (x, y, color, r = 3) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(mx + x * sx, my + y * sy, r, 0, Math.PI * 2); ctx.fill(); };
  if (G.missionMarker) dot(G.missionMarker.x, G.missionMarker.y, '#2ee6c8', 4);
  for (const c of G.police) dot(c.x, c.y, '#ff2f2f', 3);
  if (G.heli) dot(G.heli.x, G.heli.y, '#ff2f2f', 4);
  for (const c of G.traffic) dot(c.x, c.y, '#ffd23f', 2);
  const px = G.onFoot ? G.player.x : (G.car ? G.car.x : G.player.x);
  const py = G.onFoot ? G.player.y : (G.car ? G.car.y : G.player.y);
  dot(px, py, '#19c8b9', 4);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.strokeRect(mx + (G.cam.x - G.view.w / 2) * sx, my + (G.cam.y - G.view.h / 2) * sy, G.view.w * sx, G.view.h * sy);
  // district the player is in
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left';
  ctx.fillText('▸ ' + G.city.districtAt(px, py).toUpperCase(), mx, my + mh + 16);
}

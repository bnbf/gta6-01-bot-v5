// hud.js — HUD (stars, cash, health, ammo, speed, clock, rank, objective,
// compass), title screen, pause, shops, garage upgrades, safehouse, menus.
import { WEAPONS, WEAPON_ORDER, UPGRADES, PAINTS, STATIONS, MISSIONS, rankFor, clamp } from './config.js';

export function drawHUD(G) {
  const ctx = G.ctx;
  const W = G.view.w;
  ctx.textAlign = 'left';
  // wanted stars (label BELOW the stars — no overlap)
  ctx.font = 'bold 26px monospace';
  let sx = 16;
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < G.wanted ? '#ffd23f' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', sx, 36);
    sx += 30;
  }
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = '#ff8a8a';
  ctx.fillText('WANTED', 16, 54);
  if (G.heli) {
    ctx.fillStyle = '#ff5a5a';
    ctx.fillText('HELI INBOUND', 16, 70);
  }
  // cash + hp
  ctx.fillStyle = '#7CFC00';
  ctx.font = 'bold 24px monospace';
  ctx.fillText('$' + G.cash, 16, 92);
  ctx.fillStyle = '#111';
  ctx.fillRect(16, 100, 150, 12);
  ctx.fillStyle = G.player.hp > 40 ? '#7CFC00' : '#ff5a5a';
  ctx.fillRect(16, 100, 150 * clamp(G.player.hp / 100, 0, 1), 12);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('HP ' + Math.max(0, Math.round(G.player.hp)), 16, 128);
  // weapon + ammo
  const w = WEAPONS[G.player.weapon];
  const ammo = G.player.weapon === 'pistol' ? '∞' : (G.player.ammo[G.player.weapon] || 0);
  ctx.fillText(`${w.name} ${ammo} / ∞`, 16, 148);
  if (G.car) {
    ctx.fillText(`${Math.round(Math.abs(G.car.speed) * 0.12)} mph`, 16, 168);
    ctx.fillText(`Car HP ${Math.round(G.car.hp)}  NOS ${Math.max(0, G.car.nos).toFixed(0)}/${G.car.maxNos || 1}`, 16, 188);
  } else {
    ctx.fillText('— on foot —', 16, 168);
  }
  // clock + rank + district
  const mins = Math.floor(G.clock);
  const hh = Math.floor(mins / 60), mm = mins % 60;
  ctx.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, 16, 208);
  const px = G.onFoot ? G.player.x : (G.car ? G.car.x : G.player.x);
  const py = G.onFoot ? G.player.y : (G.car ? G.car.y : G.player.y);
  ctx.fillText(`${rankFor(G.points)} · ${G.points} pts`, 16, 228);
  ctx.fillStyle = '#9ad1ff';
  ctx.fillText(G.city.districtAt(px, py), 16, 248);
  // radio
  ctx.fillStyle = '#ff9ff3';
  ctx.fillText(G.audio.radioName() === 'off' ? 'Radio off — press R in a car' : '♪ ' + G.audio.radioName(), 16, 268);
  // weapons list
  ctx.fillStyle = '#fff';
  ctx.font = '12px monospace';
  ctx.fillText(WEAPON_ORDER.map((k, i) => `${G.player.weapon === k ? '◀' : '○'} ${WEAPONS[k].name}`).join('  '), 16, 288);
  // objective bar (wide box, wraps to two lines)
  if (G.objective) {
    ctx.font = 'bold 15px monospace';
    const lines = wrapText(G.ctx, G.objective, 560);
    const bw = 620, bh = 16 + lines.length * 20;
    const bx = (W - bw) / 2;
    ctx.fillStyle = 'rgba(8,12,28,0.85)';
    ctx.fillRect(bx, 12, bw, bh);
    ctx.strokeStyle = '#2ee6c8'; ctx.lineWidth = 2;
    ctx.strokeRect(bx, 12, bw, bh);
    ctx.fillStyle = '#eafffb';
    ctx.textAlign = 'center';
    lines.forEach((ln, i) => ctx.fillText(ln, W / 2, 34 + i * 20));
    ctx.textAlign = 'left';
  }
  // mission name + progress
  if (G.mission) {
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(`MISSION ${G.missionIdx + 1}/12 — ${G.mission.def.name}`, 16, 316);
  }
  // compass arrow to the marker
  const mk = G.missionMarker || G.sideRaceMarker;
  if (mk) {
    const dx = mk.x - px, dy = mk.y - py;
    const d = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    const cx = W / 2, cy = 52;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.fillStyle = '#2ee6c8';
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -8); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#2ee6c8';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(d / 10) + 'm', cx, cy + 30);
    ctx.textAlign = 'left';
  }
  // shop prompt
  if (G.nearShop && !G.menu) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`Press E — ${G.nearShop.label}`, 16, G.view.h - 20);
  }
  if (G.taxiOffer && !G.taxi) {
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`Press T — pick up ${G.taxiOffer.name} (taxi fare)`, 16, G.view.h - 40);
  }
}

function wrapText(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = t;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

export function drawTitle(G) {
  const ctx = G.ctx, W = G.view.w, H = G.view.h;
  ctx.fillStyle = 'rgba(8,8,24,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff2fb3';
  ctx.font = 'bold 64px monospace';
  ctx.fillText('LUMEN BAY', W / 2, 130);
  ctx.fillStyle = '#ffd23f';
  ctx.font = 'bold 30px monospace';
  ctx.fillText('— NEON HEAT —', W / 2, 172);
  ctx.fillStyle = '#fff';
  ctx.font = '16px monospace';
  const feats = [
    '12 story missions · 6 named districts · police helicopter + roadblocks',
    '4 weapons · drive-by shooting · 4 radio stations · garage upgrades + paint',
    'Shops · safehouse · NOS · street races · taxi fares · saves',
    'Golden dusk 18:40 fades to neon night 20:00 — steal cars, outrun the PD,',
    'climb from Street Punk to King of the Bay.',
  ];
  feats.forEach((f, i) => ctx.fillText(f, W / 2, 214 + i * 24));
  ctx.fillStyle = '#7CFC00';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('Press ENTER to play — WASD drive/walk · mouse aim · click shoot', W / 2, 372);
  ctx.fillText('E steal / exit / use shops · Shift run / NOS · R radio · 1-4 weapons · T taxi/race · P pause', W / 2, 402);
  ctx.fillStyle = '#9ad1ff';
  ctx.font = '14px monospace';
  ctx.fillText('An original game. Nothing from any commercial game. Built for make.fun — bounty gta6-01.', W / 2, 448);
  ctx.fillText('Milo Kade · Vera Solano · Big Lou — welcome to Lumen Bay.', W / 2, 474);
  ctx.textAlign = 'left';
}

export function drawMenu(G) {
  const ctx = G.ctx, W = G.view.w, H = G.view.h;
  if (!G.menu) return;
  ctx.fillStyle = 'rgba(8,8,24,0.82)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  let y = 110;
  const title = (t) => { ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 30px monospace'; ctx.fillText(t, W / 2, y); y += 46; };
  const line = (t, color = '#fff', size = 16) => { ctx.fillStyle = color; ctx.font = `${size}px monospace`; ctx.fillText(t, W / 2, y); y += 26; };
  if (G.menu === 'pause') {
    title('PAUSED');
    line('P resume · M missions · H help · ENTER resume', '#9ad1ff');
    line(`Cash $${G.cash} · Missions done ${G.missionsDone}/12 · Rank ${rankFor(G.points)}`);
  } else if (G.menu === 'help') {
    title('HOW TO PLAY');
    line('WASD / arrows — walk & drive · Shift — run / NOS boost');
    line('Mouse — aim · Click — shoot (drive-by works from a car)');
    line('E — steal / exit car, use shops & safehouse · R — radio station');
    line('1-4 — weapons · T — taxi pickup / side race · P — pause');
    line('Shops: LUMEN ARMS (guns), Neon Diner (heal), Volt Garage (repair + upgrades)');
    line('Harbor Loft safehouse heals + saves. Lose the PD: break line of sight!');
    line('Press ESC to close', '#9ad1ff');
  } else if (G.menu === 'missions') {
    title('STORY — 12 MISSIONS');
    MISSIONS.forEach((m, i) => {
      const done = i < G.missionIdx || (i === G.missionIdx && G.missionsDone > i);
      const cur = i === G.missionIdx;
      line(`${done ? '✓' : cur ? '▶' : '·'} ${i + 1}. ${m.name} — $${m.reward}`, done ? '#7CFC00' : cur ? '#ffd23f' : '#fff', 14);
    });
    line('Press ESC to close', '#9ad1ff');
  } else if (G.menu === 'gunshop') {
    title('LUMEN ARMS — GUN SHOP');
    line(`Cash $${G.cash}`, '#7CFC00');
    WEAPON_ORDER.forEach((k, i) => {
      const w = WEAPONS[k];
      const owned = G.player.owned.includes(k);
      line(`${i + 1}. ${w.name} — ${owned ? `OWNED · ammo $${w.ammoPrice}` : `buy $${w.price}`}  (dmg ${w.dmg})`, owned ? '#7CFC00' : '#fff');
    });
    line('5. Ammo refill (current weapon) — $40', '#fff');
    line('Press 1-5 to buy · ESC to leave', '#9ad1ff');
  } else if (G.menu === 'diner') {
    title('NEON DINER');
    line(`Cash $${G.cash} · HP ${Math.round(G.player.hp)}/100`, '#7CFC00');
    line('1. Full meal — heal to 100 HP — $20');
    line('2. Coffee — +25 HP — $8');
    line('Press 1-2 to buy · ESC to leave', '#9ad1ff');
  } else if (G.menu === 'garage') {
    title('VOLT GARAGE');
    line(`Cash $${G.cash} · Car HP ${G.car ? Math.round(G.car.hp) : '—'}/100`, '#7CFC00');
    line('1. Repair car — $30 · 2. Refill NOS — $15');
    const u = G.upgrades;
    line(`3. Armor ${UPGRADES.armor.desc[u.armor]} — next $${u.armor < 3 ? UPGRADES.armor.tiers[u.armor + 1] : 'MAX'}`, '#fff');
    line(`4. Engine ${UPGRADES.engine.desc[u.engine]} — next $${u.engine < 3 ? UPGRADES.engine.tiers[u.engine + 1] : 'MAX'}`, '#fff');
    line(`5. NOS ${UPGRADES.nos.desc[u.nos]} — next $${u.nos < 3 ? UPGRADES.nos.tiers[u.nos + 1] : 'MAX'}`, '#fff');
    line(`6. Repaint — ${PAINTS[G.upgrades.paint >= 0 ? G.upgrades.paint : 0].name} — $50`, '#fff');
    line('Press 1-6 · ESC to leave', '#9ad1ff');
  } else if (G.menu === 'safehouse') {
    title('HARBOR LOFT — SAFEHOUSE');
    line('Healed to full. Game saved.', '#7CFC00');
    line('Press ESC to leave', '#9ad1ff');
  } else if (G.menu === 'busted') {
    title('BUSTED!');
    line('The Lumen Bay PD caught you. Bail $100.', '#ff8a8a');
    line('Press ENTER to walk free', '#9ad1ff');
  } else if (G.menu === 'wasted') {
    title('WASTED');
    line('Milo Kade is down. Hospital bill $100.', '#ff8a8a');
    line('Press ENTER to get back up', '#9ad1ff');
  } else if (G.menu === 'won') {
    title('KING OF THE BAY!');
    line('All 12 missions complete. Lumen Bay is yours.', '#7CFC00');
    line(`Final cash $${G.cash} · Rank ${rankFor(G.points)}`, '#fff');
    line('Press ENTER to keep playing free roam', '#9ad1ff');
  }
  ctx.textAlign = 'left';
}

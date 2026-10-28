// ===== صدى — mobile 2D: the Quest look (low-poly floating island, stone and wood, the upright fox) =====
// Rules and rooms come from logic.js (EchoLogic), the same tested code as every other version.
// This file draws and handles input. Board space: cell (x, y), y = 0 is the bottom row.
// Built from parts/head.js + parts/flow.js + parts/tail.js by build.mjs.
(() => {
'use strict';
const E = window.EchoLogic;
const TICK = 230;                 // ms per tick
const START_HELP = 2, MAX_HELP = 5;
const GLYPH = [                   // door / plate identity: colour + shape (never colour alone)
  { c: '#ffb547', n: 0 },         // circle
  { c: '#ff6fae', n: 3 },         // triangle
  { c: '#46d6a0', n: 4 },         // square
  { c: '#a98bff', n: 4, rot: Math.PI / 4 }, // diamond
];
// palette taken from the Quest version (game/lowpoly): matte, natural, faceted
const PAL = {
  grass: '#8fd14f', grassDk: '#6fb23a', grassLip: '#5f9e33', earth: '#d8743a', earthDk: '#b65a2c', rock: '#c9c4ba',
  tile: '#ead2ae', tileDk: '#d9bd94', grout: '#5c4632',
  stoneTop: '#b8b3ab', stoneTop2: '#a7a29a', stoneFace: '#8c8780', stoneFace2: '#7a756e', moss: '#86c34a',
  wood: '#93603a', woodDk: '#6e4427', iron: '#4a4a52',
  trunk: '#8a4a2e', leaf: '#7cc84a', leafDk: '#5aa53a', leafHi: '#a5e06a',
  // the fox (same colours as fox_up.gd)
  orange: '#e87a33', orangeDk: '#c75e26', white: '#f8ebd6', cream: '#eed6b8', dark: '#54382e', paw: '#452e26',
  iris: '#d1852a', ink: '#1a120f', brow: '#5c3829', nose: '#211714', mouth: '#4d2420', blush: '#ff9e8c',
  echo: '#8fd8ff', gold: '#e8b84a',
};
const AR = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const $ = id => document.getElementById(id);
// colour helpers for flat facets
function hex2(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function shade(c, k, a = 1) { const [r, g, b] = hex2(c), f = v => Math.round(clamp(k >= 0 ? v + (255 - v) * k : v * (1 + k), 0, 255)); return `rgba(${f(r)},${f(g)},${f(b)},${a})`; }
function rng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
// a polygon split into a fan of flat triangles, each a little lighter or darker: the low-poly look
function facet(c, pts, col, seed, vary = .07, light = [-.6, -.8]) {
  const r = rng(seed); let cx = 0, cy = 0; pts.forEach(p => { cx += p[0]; cy += p[1]; }); cx /= pts.length; cy /= pts.length;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy, d = Math.hypot(mx, my) || 1;
    const k = (mx / d * light[0] + my / d * light[1]) * .06 + (r() - .5) * vary;   // lit from the upper left
    c.fillStyle = shade(col, k);
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.closePath(); c.fill();
    c.strokeStyle = c.fillStyle; c.lineWidth = .6; c.stroke();   // hide hairline seams between facets
  }
}

// ---------------- state ----------------
const S = {
  n: 1, runSeed: 0, R: null, echoes: [], acts: [], states: [], help: START_HELP, solved: 0,
  busy: false, won: false, rewinding: false, walk: [], fails: 0, pinMode: false, demo: null, demoSeen: {},
  started: false, muted: false,
};
const cur = () => S.states[S.states.length - 1];
function save() { try { localStorage.setItem('sada2d', JSON.stringify({ n: S.n, runSeed: S.runSeed, help: S.help, solved: S.solved, demoSeen: S.demoSeen, muted: S.muted })); } catch (e) {} }
function load() { try { const d = JSON.parse(localStorage.getItem('sada2d') || 'null'); if (d) Object.assign(S, d); } catch (e) {} if (!S.runSeed) S.runSeed = (Math.random() * 1e9) >>> 0; }

// ---------------- canvas & layout ----------------
const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, VW = 0, VH = 0, CS = 40, OX = 0, OY = 0, WH = .36;   // cell size px, origin, wall height (cells)
let staticLayer = null, skyLayer = null, minis = [];

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  const r = cv.getBoundingClientRect();
  VW = r.width; VH = r.height;
  cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
  layout();
}
function layout() {
  if (!S.R || VW < 50 || VH < 50) return;
  // the whole island must fit: trees above the room (~1.7 cells), grass margins, hanging earth below (~1 cell)
  const R = S.R, top = 56, bottom = 44;
  CS = Math.floor(Math.min((VW - 20) / (R.W + 1.4), (VH - top - bottom) / (R.H + WH + 2.9), 84));
  OX = Math.round((VW - CS * R.W) / 2);
  const used = CS * (R.H + WH + 2.9);
  OY = Math.round(top + (VH - top - bottom - used) / 2 + CS * (1.75 + WH));
  buildStatic();
}
const sx = x => OX + (x + .5) * CS;                    // cell centre -> screen
const sy = y => OY + (S.R.H - 1 - y + .5) * CS;
const bx = x => OX + x * CS, by = y => OY + (S.R.H - y) * CS;   // continuous board coords -> screen

// ---------------- the floating island (pre-rendered once per room) ----------------
function islandOutline(R, r) {
  // a rounded, slightly irregular slab around the grid
  const m = CS * .62, x0 = OX - m, y0 = OY - CS * WH - m * .8, x1 = OX + CS * R.W + m, y1 = OY + CS * R.H + m * .9, rad = CS * .9;
  const pts = [], seg = 7;
  const corner = (cx, cy, a0) => { for (let k = 0; k <= seg; k++) { const a = a0 + k / seg * Math.PI / 2, j = 1 + (r() - .5) * .12; pts.push([cx + Math.cos(a) * rad * j, cy + Math.sin(a) * rad * j]); } };
  corner(x1 - rad, y1 - rad, 0); corner(x0 + rad, y1 - rad, Math.PI / 2); corner(x0 + rad, y0 + rad, Math.PI); corner(x1 - rad, y0 + rad, Math.PI * 1.5);
  return pts;
}
function tree(c, x, y, s, seed) {   // tall thin trunk, layered flat umbrella canopies (as on the Quest island)
  const r = rng(seed);
  c.fillStyle = 'rgba(40,60,20,.25)'; c.beginPath(); c.ellipse(x + s * .2, y + s * .05, s * .35, s * .1, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = PAL.trunk; c.lineWidth = s * .07; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + s * .08, y - s * .7, x - s * .02, y - s * 1.35); c.stroke();
  const layers = 3;
  for (let k = 0; k < layers; k++) {
    const cy = y - s * (1.05 + k * .32), w = s * (.62 - k * .12) * (.9 + r() * .2), h = s * .2;
    const pts = []; for (let q = 0; q < 9; q++) { const a = q / 9 * Math.PI * 2; pts.push([x + Math.cos(a) * w * (.85 + r() * .25), cy + Math.sin(a) * h * (.8 + r() * .3)]); }
    facet(c, pts, k === layers - 1 ? PAL.leafHi : k ? PAL.leaf : PAL.leafDk, seed + k * 7, .12);
  }
}
function tuft(c, x, y, s, col) {
  c.fillStyle = col;
  for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(x + k * s * .25 - s * .1, y); c.lineTo(x + k * s * .32, y - s * (.7 + Math.abs(2 - Math.abs(k)) * .25)); c.lineTo(x + k * s * .25 + s * .1, y); c.fill(); }
}
function rockLump(c, x, y, s, seed) {
  const r = rng(seed), pts = []; for (let q = 0; q < 6; q++) { const a = q / 6 * Math.PI * 2; pts.push([x + Math.cos(a) * s * (.8 + r() * .4), y + Math.sin(a) * s * .6 * (.8 + r() * .4)]); }
  facet(c, pts, PAL.rock, seed, .14);
}
// a small floating island (margins), drawn to its own canvas so it can bob
function miniIsland(s, seed) {
  const c = document.createElement('canvas'), w = s * 2.4, h = s * 3.2; c.width = w * DPR; c.height = h * DPR;
  const g = c.getContext('2d'); g.scale(DPR, DPR);
  const r = rng(seed), cx = w / 2, top = h * .55;
  const under = [[cx - s, top], [cx + s, top], [cx + s * .55, top + s * .55], [cx + s * .1, top + s * 1.25], [cx - s * .35, top + s * .6]];
  facet(g, under, PAL.earth, seed, .16, [.3, -.9]);
  const lid = []; for (let q = 0; q < 10; q++) { const a = q / 10 * Math.PI * 2; lid.push([cx + Math.cos(a) * s * (.95 + r() * .1), top + Math.sin(a) * s * .32]); }
  facet(g, lid, PAL.grass, seed + 1, .1);
  if (r() < .7) tree(g, cx + (r() - .5) * s * .3, top + s * .05, s * .9, seed + 3); else rockLump(g, cx, top, s * .3, seed + 5);
  return { c, w, h };
}

function buildStatic() {
  const R = S.R;
  staticLayer = document.createElement('canvas');
  staticLayer.width = cv.width; staticLayer.height = cv.height;
  const c = staticLayer.getContext('2d');
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  const r = rng(R.W * 131 + R.H * 7 + S.n);
  // sky: its own layer (it stays still while the island floats)
  skyLayer = document.createElement('canvas'); skyLayer.width = cv.width; skyLayer.height = cv.height;
  { const c = skyLayer.getContext('2d'); c.setTransform(DPR, 0, 0, DPR, 0, 0);
  const sky = c.createLinearGradient(0, 0, 0, VH);
  sky.addColorStop(0, '#7fb8d8'); sky.addColorStop(.55, '#b9d9e4'); sky.addColorStop(1, '#f2dfc4');
  c.fillStyle = sky; c.fillRect(0, 0, VW, VH);
  }
  // the island: hanging earth underneath (the side we see), then the grass top
  const out = islandOutline(R, r), bottomY = Math.max(...out.map(p => p[1]));
  const front = out.filter(p => p[1] > OY + CS * R.H * .5).sort((a, b) => a[0] - b[0]);
  const xL = front[0][0], xR = front[front.length - 1][0];
  const drop = Math.min(CS * 1.9, VH - bottomY - 24);
  const under = [...front.map(p => [p[0], p[1]])];
  const n = 7; for (let k = n; k >= 0; k--) { const t = k / n, x = lerp(xL, xR, t), dd = drop * (.35 + .65 * Math.sin(t * Math.PI)) * (.75 + r() * .4); under.push([x, bottomY + dd]); }
  facet(c, under, PAL.earth, 17, .18, [.2, -1]);
  // rock bands in the earth
  for (let k = 0; k < 6; k++) rockLump(c, lerp(xL + CS * .5, xR - CS * .5, r()), bottomY + drop * (.15 + r() * .3), CS * .14, 40 + k);
  // grass lip (the island's front edge)
  c.fillStyle = PAL.grassLip; c.beginPath(); front.forEach((p, i) => i ? c.lineTo(p[0], p[1] + CS * .14) : c.moveTo(p[0], p[1] + CS * .14));
  for (let i = front.length - 1; i >= 0; i--) c.lineTo(front[i][0], front[i][1] - 2); c.fill();
  facet(c, out, PAL.grass, 3, .09);
  // trees behind the room, along the far edge (fully on the island)
  const ty = OY - CS * WH - CS * .25;
  for (let k = 0; k < Math.max(2, R.W - 2); k++) { const x = OX + CS * (k + .5 + r() * .4) * (R.W / Math.max(2, R.W - 2)) - CS * .2; tree(c, clamp(x, OX + CS * .2, OX + CS * R.W - CS * .2), ty - r() * CS * .15, CS * (.95 + r() * .35), 70 + k); }
  // grass tufts and pebbles round the edges
  for (let k = 0; k < 40; k++) {
    const p = out[Math.floor(r() * out.length)], q = [lerp(p[0], OX + CS * R.W / 2, .06 + r() * .06), lerp(p[1], OY + CS * R.H / 2, .06 + r() * .06)];
    if (q[0] > OX - 4 && q[0] < OX + CS * R.W + 4 && q[1] > OY - CS * WH - 4 && q[1] < OY + CS * R.H + 4) continue;
    if (r() < .8) tuft(c, q[0], q[1], CS * .14, r() < .5 ? PAL.grassDk : PAL.leafHi); else rockLump(c, q[0], q[1], CS * .07, 300 + k);
  }
  // the room's floor: a sunk plate of sandstone tiles with dark grout
  c.fillStyle = PAL.grout; c.fillRect(OX - 3, OY - 3, CS * R.W + 6, CS * R.H + 6);
  for (let y = 0; y < R.H; y++) for (let x = 0; x < R.W; x++) {
    if (R.wall[y * R.W + x]) continue;
    const X = OX + x * CS, Y = OY + (R.H - 1 - y) * CS, g = Math.max(1.5, CS * .045);
    const split = (x * 7 + y * 13) % 5 === 0;   // some cells are four small tiles, like the Quest floor
    const tiles = split ? [[0, 0, .5, .5], [.5, 0, .5, .5], [0, .5, .5, .5], [.5, .5, .5, .5]] : [[0, 0, 1, 1]];
    tiles.forEach(([u, v, w, h], k) => {
      const a = [X + u * CS + g, Y + v * CS + g], b = [X + (u + w) * CS - g, Y + (v + h) * CS - g];
      const col = (x + y + k) % 3 ? PAL.tile : PAL.tileDk;
      c.fillStyle = shade(col, .05); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], a[1]); c.lineTo(a[0], b[1]); c.fill();
      c.fillStyle = shade(col, -.04); c.beginPath(); c.moveTo(b[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(a[0], b[1]); c.fill();
    });
  }
  // walls cast a soft shadow on the floor (sun from the upper left)
  c.fillStyle = 'rgba(60,40,25,.28)';
  for (let y = 0; y < R.H; y++) for (let x = 0; x < R.W; x++) {
    if (!R.wall[y * R.W + x]) continue;
    const X = OX + x * CS, Y = OY + (R.H - 1 - y) * CS;
    c.beginPath(); c.moveTo(X, Y + CS); c.lineTo(X + CS, Y + CS); c.lineTo(X + CS * 1.16, Y + CS * .2); c.lineTo(X + CS * 1.16, Y + CS * 1.22); c.lineTo(X + CS * .16, Y + CS * 1.22); c.closePath(); c.fill();
  }
  // floating mini islands in the margins (they bob, so they are separate sprites)
  minis = [];
  const spots = [[OX - CS * 1.15, OY + CS * R.H * .25], [OX + CS * R.W + CS * 1.15, OY + CS * R.H * .55], [OX - CS * 1.0, OY + CS * R.H * .8]];
  spots.forEach(([x, y], k) => { if (x > 30 && x < VW - 30) minis.push({ x, y, ph: k * 1.7, sp: miniIsland(CS * (.55 + k * .08), 500 + k) }); });
}

// ---------------- stone walls (3/4 view: a front face and a top, drawn in depth order) ----------------
function drawWall(x, y) {
  const R = S.R, X = OX + x * CS, Y = OY + (R.H - 1 - y) * CS, h = CS * WH, seed = x * 13 + y * 7, r = rng(seed);
  const below = y > 0 && R.wall[(y - 1) * R.W + x];
  if (!below) {   // front face: two or three courses of slabs
    const courses = 2, ch = h / courses;
    for (let k = 0; k < courses; k++) {
      let cx = X; const cuts = [0, .35 + r() * .3, 1];
      for (let q = 0; q < cuts.length - 1; q++) {
        const w0 = X + cuts[q] * CS, w1 = X + cuts[q + 1] * CS, yy = Y + CS - h + k * ch;
        c2(w0 + 1, yy + 1, w1 - w0 - 2, ch - 2, (k + q) % 2 ? PAL.stoneFace : PAL.stoneFace2, CS * .05);
      }
    }
  }
  // top: one or two slabs, sometimes mossy
  const split = r() < .5, moss = r() < .35;
  if (split) { c2(X + 1, Y - h + 1, CS * .48 - 2, CS - 3, PAL.stoneTop, CS * .06); c2(X + CS * .5 + 1, Y - h + 1, CS * .5 - 3, CS - 3, PAL.stoneTop2, CS * .06); }
  else c2(X + 1, Y - h + 1, CS - 3, CS - 3, PAL.stoneTop, CS * .06);
  if (moss) {   // a patch of moss creeping over one corner
    const cx = X + CS * (r() < .5 ? .3 : .7), cy = Y - h + CS * (r() < .5 ? .3 : .65), pts = [];
    for (let q = 0; q < 7; q++) { const a = q / 7 * Math.PI * 2; pts.push([cx + Math.cos(a) * CS * (.2 + r() * .14), cy + Math.sin(a) * CS * (.16 + r() * .12)]); }
    ctx.save(); ctx.beginPath(); ctx.roundRect(X + 1, Y - h + 1, CS - 3, CS - 3, CS * .06); ctx.clip(); facet(ctx, pts, PAL.moss, seed, .12); ctx.restore();
  }
}
// a slab: rounded rect with two facet triangles (light upper-left, darker lower-right)
function c2(x, y, w, h, col, rad) {
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, w, h, rad); ctx.clip();
  ctx.fillStyle = shade(col, .06); ctx.fillRect(x, y, w, h);
  ctx.fillStyle = shade(col, -.07); ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ---------------- the fox (upright, like fox_up.gd): built from flat shapes, alive ----------------
let ents = [];
function makeEnt(i, p, ghost) {
  return { i, ghost, x: p.x, y: p.y, fx: p.x, fy: p.y, tx: p.x, ty: p.y, t: 1, dur: TICK, face: 'D', walkPh: 0, moving: false, walkW: 0,
    bump: null, expr: 'calm', exprT: 0, blink: 1.5 + Math.random() * 3, blinkT: 0, pop: 1, tail: 0, tailV: 0, ear: 0, look: 0, lookT: 2,
    jump: 0, jumpV: 0, still: 0, scratch: 0 };
}
function spawnEnts() { const pos = cur(); ents = pos.map((p, i) => makeEnt(i, p, i < pos.length - 1)); spread(pos, true); }
// several on one cell (every loop starts that way): echoes stand around the fox, not inside him
function spread(pos, snap) {
  const groups = {}, hero = pos.length - 1;
  pos.forEach((p, i) => (groups[p.x + ',' + p.y] = groups[p.x + ',' + p.y] || []).push(i));
  pos.forEach((p, i) => { ents[i].ox = 0; ents[i].oy = 0; });
  for (const g of Object.values(groups)) {
    if (g.length < 2) continue;
    let ring = g.filter(i => i !== hero); if (!g.includes(hero)) ring = ring.slice(1);
    ring.forEach((i, j) => { const a = Math.PI * 2 * j / ring.length + Math.PI * .75; ents[i].ox = Math.cos(a) * .28; ents[i].oy = Math.sin(a) * .22; });
  }
  if (snap) ents.forEach((e, i) => { e.x = e.fx = e.tx = pos[i].x + e.ox; e.y = e.fy = e.ty = pos[i].y + e.oy; e.t = 1; });
}
function setExpr(e, x, t) { e.expr = x; e.exprT = t; }

function drawFox(e, T) {
  const X = bx(e.x + .5), Y = by(e.y + .5) + CS * .28, s = CS / 100 * 1.15 * (0.7 + .3 * e.pop);
  const g = e.ghost, col = c => g ? shade('#8fd8ff', ({ orange: -.05, orangeDk: -.18, white: .45, cream: .3, dark: -.35, paw: -.4 })[c] ?? 0, .72) : PAL[c];
  const ww = e.walkW, ph = e.walkPh, breathe = Math.sin(T * 2.1 + e.i) * .02;
  const bob = ww * Math.abs(Math.sin(ph)) * 3 + (1 - ww) * Math.sin(T * 2.1 + e.i) * .8, lift = e.jump * 22;
  const flip = e.face === 'L' ? -1 : 1, side = e.face === 'L' || e.face === 'R', back = e.face === 'U';
  ctx.save();
  ctx.translate(X + (e.bumpOff || 0) * CS, Y);
  ctx.scale(s, s);
  // ground shadow
  ctx.fillStyle = 'rgba(50,35,20,.28)'; ctx.beginPath(); ctx.ellipse(4, 2, 26 - e.jump * 8, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(0, -bob - lift);
  const arm = armPose(e, T);
  const tailAng = e.tail + Math.sin(T * 1.7 + e.i) * .12 + (e.expr === 'happy' || e.expr === 'cheer' ? Math.sin(T * 14) * .35 : 0);
  const drawTail = () => {
    ctx.save(); ctx.translate(flip * (side ? -12 : 9), side ? -22 : -20); ctx.scale(.82, .82); ctx.rotate(flip * (side ? -.95 : .12) + tailAng * flip * .6);
    const tp = [[0, 0], [10, -6], [26, -20], [34, -40], [30, -54], [20, -58], [14, -44], [6, -22], [-4, -6]];
    facet(ctx, tp, col('orange'), 11 + e.i, .1);
    const tip = [[30, -54], [20, -58], [14, -48], [24, -44], [34, -44]];
    facet(ctx, tip, col('white'), 12, .05);
    ctx.restore();
  };
  if (!back) drawTail();
  // legs (dark), stepping
  const lg = Math.sin(ph) * 7 * ww;
  for (const [lx, d] of [[-8, lg], [8, -lg]]) {
    ctx.fillStyle = col('dark'); ctx.beginPath(); ctx.roundRect(lx - 4.5 + d * .4, -20, 9, 18 - Math.max(0, d) * .4, 3); ctx.fill();
    ctx.fillStyle = col('paw'); ctx.beginPath(); ctx.ellipse(lx + d * .5 + flip * (side ? 2 : 0), -2.5 - Math.max(0, d) * .4, 7, 3.6, 0, 0, Math.PI * 2); ctx.fill();
  }
  // body: an orange pear, cream belly
  ctx.save(); ctx.scale(1 + breathe, 1 - breathe * .5);
  const body = [[-15, -18], [-17, -32], [-13, -46], [-6, -52], [6, -52], [13, -46], [17, -32], [15, -18], [0, -14]];
  facet(ctx, body, col('orange'), 20 + e.i, .09);
  if (!back) facet(ctx, [[-8, -48], [8, -48], [9, -34], [5, -22], [0, -17], [-5, -22], [-9, -34]].map(p => [p[0] + (side ? flip * 4 : 0), p[1]]), col('white'), 21, .06);
  ctx.restore();
  // arms (dark), posed by mood
  const drawArm = (sgn, a) => {
    ctx.save(); ctx.translate(sgn * 14, -46); ctx.rotate(a.r * sgn);
    ctx.fillStyle = col('dark'); ctx.beginPath(); ctx.roundRect(-3.5, 0, 7, a.len, 3.5); ctx.fill();
    ctx.translate(0, a.len); ctx.rotate(a.h * sgn);
    ctx.fillStyle = col('paw'); ctx.beginPath(); ctx.ellipse(0, 2, 4.6, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col('dark');   // three fingers and a thumb
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.ellipse(k * 2.4, 6.5, 1.3, 2.2, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(-sgn * 4.4, 3, 1.3, 2.1, -sgn * .6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };
  drawArm(-1, arm.l); drawArm(1, arm.r);
  // head
  ctx.save(); ctx.translate(0, -56);
  ctx.rotate((e.look * .12 + (e.expr === 'worry' ? .06 : 0)) * flip);
  if (e.expr === 'worry') ctx.translate(0, 3);
  drawHead(e, T, col, flip, side, back);
  ctx.restore();
  if (back) drawTail();
  ctx.restore();
}
function armPose(e, T) {
  const sw = Math.sin(e.walkPh) * .45 * e.walkW;
  const x = e.expr;
  if (x === 'oops') return { l: { r: -2.4, len: 18, h: .2 }, r: { r: -2.4, len: 18, h: .2 } };   // hands up
  if (x === 'cheer') { const w = Math.sin(T * 12) * .3; return { l: { r: -2.7 + w, len: 19, h: .3 }, r: { r: -2.7 - w, len: 19, h: .3 } }; }
  if (x === 'worry') return { l: { r: -.55, len: 16, h: .5 }, r: { r: -.55, len: 16, h: .5 } };   // hands together
  if (e.scratch > 0) return { l: { r: .15, len: 18, h: 0 }, r: { r: -2.0 + Math.sin(T * 20) * .12, len: 15, h: -1.2 } };   // scratches its chin
  return { l: { r: .2 + sw, len: 18, h: .1 }, r: { r: .2 - sw, len: 18, h: .1 } };
}
function drawHead(e, T, col, flip, side, back) {
  const earTw = e.ear * .3, x = e.expr;
  const earDown = x === 'worry' ? .45 : x === 'oops' ? -.15 : 0;
  // ears: tall triangles, cream inside, dark tips
  for (const sg of [-1, 1]) {
    ctx.save(); ctx.translate(sg * 13, -18); ctx.rotate(sg * (.22 + earDown) + (sg === 1 ? earTw : 0));
    facet(ctx, [[-9, 4], [0, -30], [9, 4]], col('orange'), 30 + sg, .06);
    if (!back) facet(ctx, [[-5, 1], [0, -21], [5, 1]], col('cream'), 31, .04);
    ctx.fillStyle = col('dark'); ctx.beginPath(); ctx.moveTo(-3.4, -20); ctx.lineTo(0, -30); ctx.lineTo(3.4, -20); ctx.fill();
    ctx.restore();
  }
  // skull: wide, faceted, cheek tufts pointing out
  const head = [[-22, 2], [-24, -8], [-18, -20], [-8, -25], [8, -25], [18, -20], [24, -8], [22, 2], [10, 10], [-10, 10]];
  facet(ctx, head, col('orange'), 40 + e.i, .1);
  // hair tuft on top
  ctx.fillStyle = col('orangeDk');
  for (const [tx, h] of [[-5, 7], [0, 10], [5, 7]]) { ctx.beginPath(); ctx.moveTo(tx - 3, -24); ctx.lineTo(tx, -24 - h); ctx.lineTo(tx + 3, -24); ctx.fill(); }
  if (back) return;
  const fx = side ? flip * 5 : 0;
  // lower face: cream muzzle and cheeks
  facet(ctx, [[-25, -2], [-14, -5], [-4, 0], [4, 0], [14, -5], [25, -2], [16, 7], [6, 12], [-6, 12], [-16, 7]].map(p => [p[0] + fx * .6, p[1]]), col('white'), 41, .05);
  // snout
  facet(ctx, [[-6, -6], [6, -6], [4, 3], [0, 5], [-4, 3]].map(p => [p[0] + fx, p[1]]), col('orange'), 42, .05);
  ctx.fillStyle = PAL.nose; if (e.ghost) ctx.fillStyle = 'rgba(40,90,140,.85)';
  ctx.beginPath(); ctx.moveTo(fx - 3.6, 1); ctx.lineTo(fx + 3.6, 1); ctx.lineTo(fx, 5); ctx.closePath(); ctx.fill();
  drawEyes(e, fx, side, flip);
  // mouth
  const ink = e.ghost ? 'rgba(40,90,140,.85)' : PAL.mouth;
  ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath();
  if (x === 'oops') { ctx.ellipse(fx, 9, 2.2, 2.8, 0, 0, Math.PI * 2); ctx.fill(); }
  else if (x === 'cheer') { ctx.moveTo(fx - 4, 7.5); ctx.quadraticCurveTo(fx, 13, fx + 4, 7.5); ctx.closePath(); ctx.fill(); }
  else if (x === 'worry') { ctx.moveTo(fx - 3, 10); ctx.quadraticCurveTo(fx, 7.5, fx + 3, 10); ctx.stroke(); }
  else { ctx.moveTo(fx - 4, 7); ctx.quadraticCurveTo(fx - 2, 9.5, fx, 7.5); ctx.quadraticCurveTo(fx + 2, 9.5, fx + 4, 7); ctx.stroke(); }   // the little "w"
  if (!e.ghost && (x === 'happy' || x === 'cheer')) { ctx.fillStyle = 'rgba(255,140,120,.45)'; ctx.beginPath(); ctx.ellipse(fx - 12, 2, 3.5, 2, 0, 0, Math.PI * 2); ctx.ellipse(fx + 12, 2, 3.5, 2, 0, 0, Math.PI * 2); ctx.fill(); }
}
// almond eyes set into the face: white, amber iris, pupil, glint, a dark upper lid line
function drawEyes(e, fx, side, flip) {
  const x = e.expr, ink = e.ghost ? 'rgba(40,90,140,.9)' : PAL.ink, look = side ? flip * 1.6 : e.look * 1.5;
  const eyes = [fx - 9, fx + 9], ey = -9;
  ctx.lineCap = 'round';
  const closed = e.ghost || e.blinkT > 0;
  for (const [k, ex] of eyes.entries()) {
    const sg = k ? 1 : -1;
    if (closed || x === 'happy' || x === 'cheer') {
      ctx.strokeStyle = ink; ctx.lineWidth = 2.2; ctx.beginPath();
      if (x === 'happy' || x === 'cheer') ctx.arc(ex, ey + 2, 4.2, 1.15 * Math.PI, 1.85 * Math.PI);   // ^ ^
      else { ctx.moveTo(ex - 5, ey); ctx.quadraticCurveTo(ex, ey + 2.5, ex + 5, ey); }               // sleeping / blink
      ctx.stroke(); continue;
    }
    const big = x === 'oops' ? 1.2 : 1, w = 7 * big, h = 4.7 * big;
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(sg * -.12);
    ctx.fillStyle = '#fbf6ee'; ctx.beginPath(); ctx.moveTo(-w, 0); ctx.quadraticCurveTo(0, -h * 1.5, w, 0); ctx.quadraticCurveTo(0, h * 1.3, -w, 0); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = PAL.iris; ctx.beginPath(); ctx.arc(look, 0, 3.6 * big, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAL.ink; ctx.beginPath(); ctx.ellipse(look, 0, 1.5, 2.6 * big, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(look + 1.3, -1.4, .9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = ink; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-w - .6, .4); ctx.quadraticCurveTo(0, -h * 1.55, w + .4, -.4); ctx.stroke();   // upper lid
    ctx.restore();
    // brows
    // brows: a soft arch when calm, raised when surprised, tilted up in the middle when worried
    ctx.strokeStyle = PAL.brow; ctx.lineWidth = 1.7; ctx.beginPath();
    const by0 = ey - 11 - (x === 'oops' ? 2.5 : 0), inner = x === 'worry' ? -2.6 : 0;
    const ix = ex - sg * 4, ox = ex + sg * 4;
    ctx.moveTo(ox, by0 + 1); ctx.quadraticCurveTo(ex, by0 - 1.8, ix, by0 + 1 + inner); ctx.stroke();
  }
}
function updEnt(e, dt, T) {
  if (e.t < 1) {
    e.t = Math.min(1, e.t + dt * 1000 / e.dur);
    const k = ease(e.t);
    e.x = lerp(e.fx, e.tx, k); e.y = lerp(e.fy, e.ty, k);
    e.moving = Math.hypot(e.tx - e.fx, e.ty - e.fy) > .3;
    e.bumpOff = e.bump ? Math.sin(e.t * Math.PI) * .12 * e.bump : 0;
    if (e.t >= 1) { e.bumpOff = 0; e.bump = null; e.moving = false; }
  } else e.still += dt;
  // walking blends in and out (no snapping between standing and walking)
  e.walkW += ((e.moving || (e.still < .1 && e.walkW > .5)) ? 1 - e.walkW : -e.walkW) * Math.min(1, dt * 10);
  e.walkPh += dt * 17 * e.walkW;
  // tail spring follows the motion
  const vx = e.moving ? (e.tx - e.fx) : 0;
  e.tailV += (-vx * .8 - e.tail) * dt * 30; e.tailV *= Math.pow(.02, dt); e.tail += e.tailV * dt;
  // blinking (sometimes a double blink), ear flicks, glances
  e.blink -= dt; if (e.blink < 0) { e.blinkT = .13; e.blink = Math.random() < .2 ? .25 : 2.4 + Math.random() * 3.5; }
  if (e.blinkT > 0) e.blinkT -= dt;
  e.ear *= Math.pow(.01, dt); if (Math.random() < dt * .25) e.ear = 1;
  e.lookT -= dt; if (e.lookT < 0) { e.lookT = 1.5 + Math.random() * 3; e.lookTo = e.still > 1 ? (Math.random() - .5) * 2 : 0; }
  e.look += ((e.lookTo || 0) - e.look) * Math.min(1, dt * 4);
  if (e.exprT > 0) { e.exprT -= dt; if (e.exprT <= 0) e.expr = 'calm'; }
  if (e.jumpV || e.jump > 0) { e.jumpV -= dt * 9; e.jump = Math.max(0, e.jump + e.jumpV * dt * 6); if (e.jump === 0) e.jumpV = 0; }
  // idle life: after standing a while the fox faces you, and now and then scratches its chin
  if (!e.ghost && e.t >= 1 && e.still > 2.6 && Math.floor(e.still) % 6 < 2) e.face = 'D';
  if (!e.ghost && e.still > 4 && e.scratch <= 0 && Math.random() < dt * .08) e.scratch = 1.4;
  if (e.scratch > 0) e.scratch -= dt;
}

// ---------------- doors (wood between stone posts), plates (stone pads), the golden exit ring ----------------
let doorFx = [], plateFx = [];
function glyphPath(c, g, r) {
  const G = GLYPH[g % 4];
  c.beginPath();
  if (!G.n) { c.arc(0, 0, r, 0, Math.PI * 2); return; }
  for (let k = 0; k < G.n; k++) {
    const a = (G.rot || 0) - Math.PI / 2 + k * Math.PI * 2 / G.n + (G.n === 4 && !G.rot ? Math.PI / 4 : 0);
    const X = Math.cos(a) * r, Y = Math.sin(a) * r; k ? c.lineTo(X, Y) : c.moveTo(X, Y);
  }
  c.closePath();
}
function plateHeld(i) {
  const pos = cur();
  return S.R.plates.some(p => p.door === i && (pos.some(e => e.x === p.x && e.y === p.y) || (S.R.pinned || []).some(e => e.x === p.x && e.y === p.y)));
}
function drawDoor(i, T) {
  const R = S.R, d = R.doors[i], f = doorFx[i], G = GLYPH[i % 4];
  const X = OX + d.x * CS, Y = OY + (R.H - 1 - d.y) * CS, h = CS * WH, pw = CS * .17;
  const H = CS * .78 + h;   // the opening's height on screen
  // wooden panel, sinking into the floor as it opens
  const open = f.open, ph = H * (1 - open);
  if (ph > 1) {
    ctx.save(); ctx.beginPath(); ctx.rect(X + pw, Y + CS - H - 2, CS - 2 * pw, H + 2); ctx.clip();
    const top = Y + CS - ph - 2;
    const planks = 3, pwid = (CS - 2 * pw) / planks;
    for (let k = 0; k < planks; k++) c2(X + pw + k * pwid + .5, top, pwid - 1, ph, k % 2 ? PAL.wood : PAL.woodDk, 2);
    ctx.fillStyle = PAL.iron; for (const yy of [.25, .7]) ctx.fillRect(X + pw, top + ph * yy, CS - 2 * pw, Math.max(2, CS * .035));
    if (f.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${f.flash * .5})`; ctx.fillRect(X + pw, top, CS - 2 * pw, ph); }
    ctx.restore();
  }
  // stone posts and lintel
  c2(X + 1, Y + CS - H - CS * .02, pw, H + CS * .02, PAL.stoneFace, CS * .04);
  c2(X + CS - pw - 1, Y + CS - H - CS * .02, pw, H + CS * .02, PAL.stoneFace, CS * .04);
  c2(X - 1, Y + CS - H - CS * .2, CS + 2, CS * .22, PAL.stoneTop, CS * .05);
  // neon glyph above the lintel: breathes when shut, bright and spinning when open, flashes on a bump
  const pulse = .55 + .25 * Math.sin(T * 2.4 + i) + f.lit * .5 + f.open * .6 + f.flash;
  ctx.save(); ctx.translate(X + CS / 2, Y + CS - H - CS * .42 - Math.sin(T * 1.8 + i) * 2 - open * CS * .1);
  ctx.scale(Math.cos(open * T * 2) * .25 * open + (1 - open * .25), 1);
  ctx.shadowColor = G.c; ctx.shadowBlur = CS * .12 * clamp(pulse, .3, 1.6);
  ctx.strokeStyle = G.c; ctx.globalAlpha = clamp(.55 + pulse * .35, 0, 1); ctx.lineWidth = CS * (d.kind === 'inverse' ? .03 : .05); ctx.lineJoin = 'round';
  glyphPath(ctx, i, CS * .14); ctx.stroke();
  ctx.restore();
  if (d.kind === 'timed') {   // three pips counting the open ticks down
    const tm = (cur().timers || [])[i] || 0, held = plateHeld(i);
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = held || k < tm ? G.c : 'rgba(80,70,60,.45)';
      ctx.beginPath(); ctx.arc(X + CS * (.32 + k * .18), Y + CS - H - CS * .09, CS * .04, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (f.flash > 0) f.flash = Math.max(0, f.flash - .04);
}
function drawPlate(j, T) {
  const p = S.R.plates[j], f = plateFx[j], G = GLYPH[p.door % 4], inv = S.R.doors[p.door].kind === 'inverse';
  const X = sx(p.x), Y = sy(p.y), r = CS * .36;
  ctx.save(); ctx.translate(X, Y);
  const oct = k => Array.from({ length: 8 }, (_, q) => { const a = q * Math.PI / 4 + Math.PI / 8; return [Math.cos(a) * r * k, Math.sin(a) * r * k * .82]; });
  facet(ctx, oct(1.08).map(q => [q[0], q[1] + 3]), '#6f6b70', 60 + j, .05);
  ctx.translate(0, f.on * 2.5);
  facet(ctx, oct(1), '#a19ea3', 61 + j, .1);
  const glow = .45 + f.on * .55 + (f.hover || 0) * .35 + .1 * Math.sin(T * 3 + j);
  ctx.shadowColor = G.c; ctx.shadowBlur = CS * .1 * glow;
  ctx.strokeStyle = G.c; ctx.globalAlpha = clamp(glow, 0, 1); ctx.lineWidth = CS * .045;
  ctx.beginPath(); ctx.ellipse(0, 0, r * 1.02, r * .86, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.scale(1, .85); glyphPath(ctx, p.door, r * .36);
  if (inv) { ctx.lineWidth = CS * .03; ctx.stroke(); } else { ctx.fillStyle = G.c; ctx.fill(); }
  ctx.restore();
  if ((S.R.pinned || []).some(e => e.x === p.x && e.y === p.y)) drawStatue(X, Y);
}
// a pinned helper: a small stone fox holding the plate down
function drawStatue(X, Y) {
  ctx.save(); ctx.translate(X, Y + CS * .2); const s = CS / 100; ctx.scale(s, s);
  facet(ctx, [[-14, -2], [-16, -30], [-8, -44], [8, -44], [16, -30], [14, -2]], '#b3aea6', 90, .12);
  facet(ctx, [[-18, -50], [-14, -64], [-4, -70], [4, -70], [14, -64], [18, -50], [8, -42], [-8, -42]], '#bdb8b0', 91, .12);
  for (const sg of [-1, 1]) facet(ctx, [[sg * 6, -66], [sg * 12, -86], [sg * 17, -62]], '#bdb8b0', 92, .1);
  ctx.strokeStyle = '#7d786f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-6, -57, 3, .15 * Math.PI, .85 * Math.PI); ctx.moveTo(9, -57); ctx.arc(6, -57, 3, .15 * Math.PI, .85 * Math.PI); ctx.stroke();
  ctx.restore();
}
function drawExit(T) {
  const e = S.R.exit, X = sx(e.x), Y = sy(e.y), near = S.nearExit || 0, r = CS * .38;
  ctx.save(); ctx.translate(X, Y);
  // round stone platform
  const disc = k => Array.from({ length: 10 }, (_, q) => { const a = q * Math.PI / 5; return [Math.cos(a) * r * k, Math.sin(a) * r * k * .7]; });
  facet(ctx, disc(1.12).map(q => [q[0], q[1] + 4]), '#8f8a84', 80, .06);
  facet(ctx, disc(1.05), '#c9c4ba', 81, .1);
  // light on the platform and a soft beam
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.2);
  g.addColorStop(0, `rgba(255,224,150,${.55 + near * .35})`); g.addColorStop(1, 'rgba(255,200,100,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.2, r * .85, 0, 0, Math.PI * 2); ctx.fill();
  const beam = ctx.createLinearGradient(0, 0, 0, -CS * 1.6);
  beam.addColorStop(0, `rgba(255,220,140,${.35 + near * .25})`); beam.addColorStop(1, 'rgba(255,220,140,0)');
  ctx.fillStyle = beam; ctx.fillRect(-r * .45, -CS * 1.6, r * .9, CS * 1.6);
  // the golden ring, standing and turning slowly (its width follows the turn)
  const turn = Math.cos(T * (.7 + near * 1.5)), cy = -CS * .62 + Math.sin(T * 1.5) * CS * .05;
  ctx.shadowColor = PAL.gold; ctx.shadowBlur = CS * .15 * (1 + near);
  ctx.strokeStyle = PAL.gold; ctx.lineWidth = CS * .075;
  ctx.beginPath(); ctx.ellipse(0, cy, Math.max(1, Math.abs(turn) * r * .95), r * .95, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.shadowBlur = 0; ctx.strokeStyle = shade(PAL.gold, .35); ctx.lineWidth = CS * .025;
  ctx.beginPath(); ctx.ellipse(0, cy, Math.max(1, Math.abs(turn) * r * .95), r * .95, 0, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
  // sparks rising
  for (let k = 0; k < 8; k++) {
    const ph = (T * .4 + k / 8) % 1, a = k * 2.4;
    ctx.fillStyle = `rgba(255,214,120,${(1 - ph) * .9})`;
    ctx.beginPath(); ctx.arc(Math.cos(a) * r * .55, -ph * CS * 1.3, CS * .022 * (1 - ph * .5), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---------------- hint footprints, door links, tick row ----------------
let hint = null, hover = -1;
function drawHint(T) {
  if (!hint) return;
  if (performance.now() > hint.until) { hint = null; return; }
  ctx.save(); ctx.font = `600 ${Math.round(CS * .26)}px "Readex Pro", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  hint.cells.forEach((c, k) => {
    const X = sx(c.x), Y = sy(c.y), a = .6 + .3 * Math.sin(T * 4 - k * .5);
    ctx.fillStyle = `rgba(255,255,255,${a * .55})`; ctx.beginPath(); ctx.arc(X, Y, CS * .21, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(120,70,30,${a + .1})`; ctx.fillText(AR(c.t), X, Y + 1);
  });
  ctx.restore();
}
function drawLink(T) {
  if (hover < 0) return;
  const d = S.R.doors[hover], G = GLYPH[hover % 4];
  ctx.save(); ctx.fillStyle = G.c; ctx.shadowColor = G.c; ctx.shadowBlur = 6;
  for (const p of S.R.plates) {
    if (p.door !== hover) continue;
    const ax = sx(p.x), ay = sy(p.y), cx = sx(d.x), cy = sy(d.y) - CS * .9, n = 14;
    for (let k = 0; k < n; k++) {
      const t = (k + (T * 1.4) % 1) / n, X = lerp(ax, cx, t), Y = lerp(ay, cy, t) - Math.sin(t * Math.PI) * CS * .8;
      ctx.beginPath(); ctx.arc(X, Y, CS * .04 * (.6 + .4 * Math.sin(t * Math.PI)), 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}
function drawTicks(T) {
  const R = S.R, n = R.L, done = S.acts.length, w = Math.min(VW - 130, n * 22), y = VH - 22, x0 = (VW - w) / 2;
  ctx.save(); ctx.fillStyle = 'rgba(30,40,40,.35)'; ctx.beginPath(); ctx.roundRect(x0 - 12, y - 13, w + 24, 26, 13); ctx.fill(); ctx.restore();
  for (let k = 0; k < n; k++) {
    const X = x0 + w * (k + .5) / n, left = n - done, past = k < done, warn = !past && left <= 3;
    ctx.fillStyle = past ? 'rgba(255,255,255,.22)' : warn ? '#ff8a6e' : '#ffd27a';
    ctx.beginPath(); for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2; ctx[q ? 'lineTo' : 'moveTo'](X + Math.cos(a) * 5, y + Math.sin(a) * 5); } ctx.fill();   // little gems
  }
  // echo slots: small blue fox faces, filled as loops are recorded (to the left in RTL)
  for (let k = 0; k < R.E; k++) {
    const X = x0 - 30 - k * 22, Y = y, full = k < S.echoes.length;
    ctx.save(); ctx.translate(X, Y);
    ctx.fillStyle = full ? PAL.echo : 'transparent'; ctx.strokeStyle = PAL.echo; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-8, -2); ctx.lineTo(-7, -11); ctx.lineTo(-3, -6); ctx.lineTo(3, -6); ctx.lineTo(7, -11); ctx.lineTo(8, -2); ctx.lineTo(0, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = full ? '#2a5a7a' : PAL.echo; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(-3.2, -1.5, 1.7, .15 * Math.PI, .85 * Math.PI); ctx.moveTo(4.9, -1.5); ctx.arc(3.2, -1.5, 1.7, .15 * Math.PI, .85 * Math.PI); ctx.stroke();
    ctx.restore();
  }
}

// ---------------- particles ----------------
let parts = [];
function burst(x, y, cols, n, spd) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, v = (.5 + Math.random()) * spd;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spd * .6, r: Math.random() * Math.PI, vr: (Math.random() - .5) * 10, life: 1, c: cols[k % cols.length], s: 3 + Math.random() * 4 });
  }
}
function drawParts(dt) {
  parts = parts.filter(p => (p.life -= dt * .7) > 0);
  for (const p of parts) {
    p.vy += 600 * dt; p.vx *= .99; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = p.life; ctx.fillStyle = p.c;
    ctx.beginPath(); ctx.moveTo(-p.s, p.s * .6); ctx.lineTo(0, -p.s); ctx.lineTo(p.s, p.s * .6); ctx.fill(); ctx.restore();
  }
}

// ---------------- sound: quiet. Sparse soft bells, no drone ----------------
let AC = null, master = null, verb = null, musicT = 0;
function audioStart() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = S.muted ? 0 : .55; master.connect(AC.destination);
    // a gentle echo instead of reverb (fits the name): two soft taps
    verb = AC.createDelay(1); verb.delayTime.value = .42;
    const fb = AC.createGain(); fb.gain.value = .32; const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    verb.connect(lp); lp.connect(fb); fb.connect(verb); lp.connect(master);
  } catch (e) { AC = null; }
}
// a soft bell: sine + a quiet octave, slow attack, long fade
function bell(semi, dur, vol, delay = 0) {
  if (!AC) return;
  const t = AC.currentTime + delay, hz = 440 * Math.pow(2, (semi - 9) / 12);
  const g = AC.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .03); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  for (const [m, v] of [[1, 1], [2, .18]]) { const o = AC.createOscillator(); o.type = 'sine'; o.frequency.value = hz * m; const og = AC.createGain(); og.gain.value = v; o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + .05); }
  g.connect(master); g.connect(verb);
}
// background: one or two quiet notes every few seconds from a pentatonic scale, like wind chimes far away
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
function music(dt) {
  if (!AC || S.muted) return;
  musicT -= dt;
  if (musicT <= 0) {
    musicT = 3.2 + Math.random() * 3.5;
    const root = 12 + PENTA[Math.floor(Math.random() * PENTA.length)];
    bell(root, 3.5, .018);
    if (Math.random() < .45) bell(root + (Math.random() < .5 ? 7 : 4), 3.2, .012, .55 + Math.random() * .4);
  }
}
function tone(semi, dur, vol) { bell(semi, dur, vol * .8); }
const SFX = {
  step: t => bell(PENTA[t % PENTA.length] + 24, .35, .012),
  wait: () => bell(19, .4, .012),
  bump: () => bell(-5, .25, .03),
  door: open => { bell(open ? 16 : 9, 1.1, .02); bell(open ? 23 : 4, 1.2, .012, .08); },
  plate: () => bell(19, .7, .018),
  echo: () => { [12, 16, 19, 24].forEach((s, k) => bell(s, 1.6, .016, k * .09)); },
  rewind: () => { for (let k = 0; k < 4; k++) bell(24 - k * 3, .3, .01, k * .05); },
  win: () => { [0, 4, 7, 12, 16, 19].forEach((s, k) => bell(s + 12, 2, .02, k * .1)); },
  hint: () => bell(21, 1, .016),
};
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
function setMuted(m) { S.muted = m; if (master) master.gain.value = m ? 0 : .55; $('bSound').classList.toggle('off', m); save(); }

// ---------------- room flow (same rules as the 3D versions) ----------------

function loadRoom(n) {
  S.n = n; S.R = E.roomFor(n, S.runSeed);
  if (!S.R) { S.runSeed++; S.R = E.roomFor(n, S.runSeed); }
  S.echoes = []; S.acts = []; S.walk = []; S.won = false; S.busy = false; S.fails = 0; S.pinMode = false; hint = null; hover = -1;
  S.R.pinned = [];
  recompute(); doorFx = S.R.doors.map(() => ({ open: 0, lit: 0, flash: 0 })); plateFx = S.R.plates.map(() => ({ on: 0 }));
  spawnEnts(); doorsUpdate(true); layout(); ui(); save();
  S.enterT = performance.now();
  if (S.R.tutorial && n > 1 && !S.demoSeen[n] && S.started) { S.demoSeen[n] = 1; save(); setTimeout(() => startDemo(true), 900); }
}
function recompute() { S.states = E.run(S.R, S.echoes, S.acts); }
function doAction(a, fromDemo) {
  if (S.busy || S.won || S.rewinding || (S.demo && !fromDemo)) return false;
  if (S.acts.length >= S.R.L) return false;
  const t = S.acts.length, pos = cur();
  const acts = S.echoes.map(e => e[t] || 'W').concat([a]);
  const next = E.step(S.R, pos, acts), hero = ents[ents.length - 1], me = next[next.length - 1];
  if (a !== 'W' && me.blocked) {
    hero.face = a; hero.bump = 1; hero.t = 0; hero.fx = hero.tx = hero.x; hero.fy = hero.ty = hero.y; hero.dur = 220;
    setExpr(hero, 'oops', .7); SFX.bump(); buzz(15); S.walk = [];
    const d = E.DIRS[a], di = E.doorAt(S.R, pos[pos.length - 1].x + d[0], pos[pos.length - 1].y + d[1]); if (di >= 0) doorFx[di].flash = 1;
    burst(bx(hero.x + .5 + d[0] * .4), by(hero.y + .5 + d[1] * .4), ['#c9c4ba', '#ead2ae'], 6, 120);
    return false;
  }
  S.acts.push(a); S.states.push(next);
  S.busy = true;
  next.forEach((n, i) => {
    const e = ents[i], act = acts[i];
    if (act !== 'W') e.face = act;
    e.fx = e.x; e.fy = e.y; e.t = 0; e.dur = TICK; e.still = 0;
    if (n.blocked && act !== 'W') e.bump = 1;
  });
  spread(next, false);
  next.forEach((n, i) => { ents[i].tx = n.x + ents[i].ox; ents[i].ty = n.y + ents[i].oy; });
  if (a === 'W') SFX.wait(); else SFX.step(t);
  doorsUpdate(false); ui();
  const left = S.R.L - S.acts.length;
  if (left <= 3 && left > 0) setExpr(hero, 'worry', 1.5);
  setTimeout(afterTick, TICK);
  return true;
}
function afterTick() {
  S.busy = false;
  const me = cur()[S.echoes.length];
  if (me.x === S.R.exit.x && me.y === S.R.exit.y) return win();
  if (S.acts.length >= S.R.L) {
    S.walk = [];
    if (S.echoes.length < S.R.E) setTimeout(endLoopAsEcho, 300);
    else if (S.demo) { stopDemo(); }
    else { S.fails++; setTimeout(retryLoop, 300); if (S.fails >= 2 && S.help > 0) $('bHint').classList.add('pulse'); }
    return;
  }
  pump();
}
function pump() { if (S.walk.length && !S.busy) { const a = S.walk.shift(); if (!doAction(a, !!S.demo)) S.walk = []; } }
function doorsUpdate(silent) {
  const pos = cur(), open = E.doorStates(S.R, pos);
  open.forEach((o, i) => { const f = doorFx[i]; if (!silent && o !== f.was) { SFX.door(o); if (o) setExpr(ents[ents.length - 1], 'happy', .9); } f.was = o; f.target = o ? 1 : 0; });
  S.R.plates.forEach((p, j) => {
    const on = pos.some(e => e.x === p.x && e.y === p.y) || (S.R.pinned || []).some(e => e.x === p.x && e.y === p.y);
    if (on && !plateFx[j].was && !silent) { SFX.plate(); buzz(10); }
    plateFx[j].was = on; plateFx[j].target = on ? 1 : 0;
  });
}
function endLoopAsEcho() {
  if (S.won || S.rewinding) return;
  S.echoes.push(E.pad(S.acts, S.R.L));
  rewind(() => { S.acts = []; recompute(); spawnEnts(); const g = ents[S.echoes.length - 1]; g.pop = 0; doorsUpdate(true); ui(); SFX.echo(); });
}
function retryLoop() { if (S.won || S.rewinding) return; rewind(() => { S.acts = []; recompute(); spawnEnts(); doorsUpdate(true); ui(); }); }
function backLoop() {
  if (S.demo) return stopDemo();
  if (S.busy || S.won || S.rewinding) return;
  if (!S.acts.length && !S.echoes.length) return;
  S.walk = []; setPin(false);
  rewind(() => { if (!S.acts.length && S.echoes.length) S.echoes.pop(); S.acts = []; recompute(); spawnEnts(); doorsUpdate(true); ui(); });
}
function undo() {
  if (S.demo) return stopDemo();
  if (S.busy || S.won || S.rewinding || !S.acts.length) return;
  S.walk = []; S.acts.pop(); S.states.pop(); spread(cur(), true); doorsUpdate(true); ui(); tone(4, .2, .03);
}
// rewind: the characters glide back along their paths; the paper "inhales"
function rewind(done) {
  S.rewinding = true; SFX.rewind(); buzz([8, 30, 8]);
  const steps = S.acts.length, total = Math.min(900, 160 + steps * 50), t0 = performance.now(), states = S.states;
  if (!steps) { S.rewinding = false; done(); return; }
  (function f() {
    const k = clamp((performance.now() - t0) / total, 0, 1), p = (1 - ease(k)) * steps, i0 = Math.floor(p), fr = p - i0;
    const a = states[Math.min(i0 + 1, steps)], b = states[i0];
    ents.forEach((e, i) => { if (!a[i]) return; e.x = lerp(b[i].x, a[i].x, fr); e.y = lerp(b[i].y, a[i].y, fr); e.t = 1; e.moving = true; e.walkPh -= .4; });
    S.rewindK = k;
    if (k < 1) requestAnimationFrame(f); else { S.rewinding = false; S.rewindK = 0; done(); }
  })();
}
function win() {
  S.won = true;
  const hero = ents[ents.length - 1];
  setExpr(hero, 'cheer', 2.5); hero.jumpV = 1.6; hero.jump = .01;
  SFX.win(); buzz([20, 40, 20]);
  burst(sx(S.R.exit.x), sy(S.R.exit.y), ['#ffb547', '#8fd14f', '#ff6fae', '#46d6a0', '#e87a33'], 40, 260);
  if (S.demo) { setTimeout(() => { stopDemo(); toast('▶'); }, 900); return; }
  S.solved++;
  if (S.solved % 3 === 0 && S.help < MAX_HELP) S.help++;
  setTimeout(() => { S.transT = performance.now(); setTimeout(() => loadRoom(S.n + 1), 380); }, 1300);
}
function walkTo(c) {
  const me = cur()[S.echoes.length];
  if (c.x === me.x && c.y === me.y) { S.walk = ['W']; pump(); return; }
  const path = E.bfsPath(S.R, me, c, true);
  if (!path) { SFX.bump(); return; }
  S.walk = [];
  for (let k = 1; k < path.length; k++) {
    const dx = path[k].x - path[k - 1].x, dy = path[k].y - path[k - 1].y;
    S.walk.push(dx === 1 ? 'R' : dx === -1 ? 'L' : dy === 1 ? 'U' : 'D');
  }
  pump();
}
function useHelp() { if (S.R.tutorial) return true; if (S.help <= 0) { SFX.bump(); return false; } S.help--; ui(); return true; }
function showHint() {
  if (S.demo) return stopDemo();
  if (S.busy || S.won || S.rewinding || !S.R.solution) return;
  if (!useHelp()) return;
  $('bHint').classList.remove('pulse');
  const sol = S.R.solution, seq = S.echoes.length < sol.echoes.length ? sol.echoes[S.echoes.length] : sol.player;
  let p = { ...S.R.start }; const cells = []; let t = 0;
  for (const a of seq) { t++; const d = E.DIRS[a]; if (d[0] || d[1]) { p = { x: p.x + d[0], y: p.y + d[1] }; cells.push({ ...p, t }); } }
  hint = { cells, until: performance.now() + 9000 }; SFX.hint();
}
function setPin(on) { S.pinMode = on; $('bPin').classList.toggle('armed', on); }
function pinPress() {
  if (S.demo) return stopDemo();
  if (S.busy || S.won || S.rewinding) return;
  if (S.pinMode) return setPin(false);
  if (!S.R.tutorial && S.help <= 0) { SFX.bump(); return; }
  setPin(true); toast('◎');
}
function pinAt(c) {
  const plate = S.R.plates.find(p => p.x === c.x && p.y === c.y && S.R.doors[p.door].kind !== 'inverse');
  setPin(false);
  if (!plate || S.R.pinned.some(p => p.x === c.x && p.y === c.y)) return;
  if (!useHelp()) return;
  S.R.pinned.push({ x: c.x, y: c.y });
  recompute(); doorsUpdate(false); ui(); tone(12, .6, .04);
}
function startDemo(free) {
  if (S.busy || S.won || S.rewinding || S.demo || !S.R.solution) return;
  if (!free && !useHelp()) return;
  const sol = S.R.solution, q = [];
  sol.echoes.forEach(e => q.push(...E.pad(e, S.R.L)));
  q.push(...sol.player);
  S.walk = []; setPin(false); S.R.pinned = [];
  S.echoes = []; S.acts = []; recompute(); spawnEnts(); doorsUpdate(true); ui();
  S.demo = { q, iv: setInterval(() => { const d = S.demo; if (!d || S.busy || S.rewinding || S.won || S.acts.length >= S.R.L) return; if (!d.q.length) return stopDemo(); doAction(d.q.shift(), true); }, 40) };
  $('bWatch').classList.add('armed');
}
function stopDemo() {
  if (!S.demo) return;
  clearInterval(S.demo.iv); S.demo = null; $('bWatch').classList.remove('armed');
  S.won = false; S.echoes = []; S.acts = []; S.walk = []; recompute(); spawnEnts(); doorsUpdate(true); ui();
}
let toastT = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 900); }
function ui() {
  $('room').textContent = AR(S.n);
  const h = $('helps'); h.innerHTML = '';
  for (let k = 0; k < MAX_HELP; k++) { const i = document.createElement('i'); if (k >= S.help) i.className = 'off'; h.appendChild(i); }
  const free = S.R && S.R.tutorial;
  for (const id of ['bHint', 'bPin', 'bWatch']) $(id).classList.toggle('dim', !free && S.help <= 0);
  $('bBack').classList.toggle('dim', !S.acts.length && !S.echoes.length);
  $('bUndo').classList.toggle('dim', !S.acts.length);
}

// ---------------- input: swipe to step, tap a cell to walk there ----------------
let touch = null;
function cellAt(px, py) { return { x: Math.floor((px - OX) / CS), y: S.R.H - 1 - Math.floor((py - OY) / CS) }; }
cv.addEventListener('pointerdown', e => { touch = { x: e.clientX, y: e.clientY, t: performance.now() }; const r = cv.getBoundingClientRect(); const c = cellAt(e.clientX - r.left, e.clientY - r.top); hover = hoverDoor(c); });
cv.addEventListener('pointerup', e => {
  if (!touch || !S.started) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y, r = cv.getBoundingClientRect();
  touch = null; setTimeout(() => (hover = -1), 900);
  if (S.demo) return stopDemo();
  if (Math.hypot(dx, dy) > 24) {
    const a = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U');
    S.walk = []; doAction(a); return;
  }
  const c = cellAt(e.clientX - r.left, e.clientY - r.top);
  if (c.x < 0 || c.y < 0 || c.x >= S.R.W || c.y >= S.R.H) return;
  if (S.pinMode) return pinAt(c);
  if (S.busy) { const me = cur()[S.echoes.length]; S.walk = []; setTimeout(() => walkTo(c), TICK); return; }
  walkTo(c);
});
function hoverDoor(c) {
  if (!S.R) return -1;
  const d = E.doorAt(S.R, c.x, c.y); if (d >= 0) return d;
  const p = S.R.plates.find(p => p.x === c.x && p.y === c.y); return p ? p.door : -1;
}
window.addEventListener('keydown', e => {
  const k = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', ' ': 'W' }[e.key];
  if (k && S.started) { e.preventDefault(); S.walk = []; doAction(k); }
  if (e.key === 'z' || e.key === 'Backspace') undo();
});
$('bWait').onclick = () => { S.walk = []; doAction('W'); };
$('bUndo').onclick = undo;
$('bBack').onclick = backLoop;
$('bHint').onclick = showHint;
$('bPin').onclick = pinPress;
$('bWatch').onclick = () => (S.demo ? stopDemo() : startDemo(false));
function begin() {
  if (S.started) return;
  S.started = true; audioStart();
  const t = $('title'); t.style.transition = 'opacity .6s'; t.style.opacity = 0; setTimeout(() => (t.hidden = true), 600);
  if (S.R.tutorial && S.n > 1 && !S.demoSeen[S.n]) { S.demoSeen[S.n] = 1; save(); setTimeout(() => startDemo(true), 700); }
}
$('title').addEventListener('pointerup', begin);
$('title').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') begin(); });


$('bSound').onclick = () => { audioStart(); setMuted(!S.muted); };

// ---------------- frame ----------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; const T = now / 1000;
  if (!S.R || !staticLayer) { requestAnimationFrame(frame); return; }
  ents.forEach(e => updEnt(e, dt, T));
  doorFx.forEach((f, i) => { f.open += ((f.target || 0) - f.open) * Math.min(1, dt * 9); f.lit += ((hover === i ? 1 : 0) - f.lit) * Math.min(1, dt * 6); });
  plateFx.forEach((f, j) => { f.on += ((f.target || 0) - f.on) * Math.min(1, dt * 12); f.hover = hover >= 0 && S.R.plates[j].door === hover ? 1 : 0; });
  const heroE = ents[ents.length - 1];
  S.nearExit = heroE ? clamp(1 - (Math.hypot(heroE.x - S.R.exit.x, heroE.y - S.R.exit.y) - 1) / 3, 0, 1) : 0;
  music(dt);

  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  ctx.fillStyle = '#b9d9e4'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // room entrance: the island floats up into place; on a win it sinks away
  const ent = clamp((now - (S.enterT || 0)) / 700, 0, 1), out = S.transT ? clamp((now - S.transT) / 380, 0, 1) : 0;
  if (ent >= 1 && S.transT && !S.won) S.transT = 0;
  const slide = (1 - ease(ent)) * 50 + ease(out) * 60 + Math.sin(T * .8) * 2.5;   // the island breathes gently in the air
  ctx.drawImage(skyLayer, 0, 0, VW, VH);   // the sky stays put
  ctx.save();
  ctx.globalAlpha = Math.min(ease(ent), 1 - out);
  ctx.translate(0, slide);
  ctx.drawImage(staticLayer, 0, 0, VW, VH);
  for (const m of minis) ctx.drawImage(m.sp.c, m.x - m.sp.w / 2, m.y - m.sp.h * .55 + Math.sin(T * .9 + m.ph) * 6, m.sp.w, m.sp.h);
  drawExit(T);
  S.R.plates.forEach((p, j) => drawPlate(j, T));
  drawHint(T);
  // depth-sorted: far rows first; walls, doors and characters interleave (3/4 view)
  const items = [];
  for (let y = 0; y < S.R.H; y++) for (let x = 0; x < S.R.W; x++) if (S.R.wall[y * S.R.W + x]) items.push({ d: y + .02, f: () => drawWall(x, y) });
  S.R.doors.forEach((d, i) => items.push({ d: d.y + .02, f: () => drawDoor(i, T) }));
  ents.forEach(e => items.push({ d: e.y, f: () => drawFox(e, T) }));
  items.sort((a, b) => b.d - a.d).forEach(it => it.f());
  drawLink(T);
  drawParts(dt);
  ctx.restore();
  if (S.rewindK) { ctx.fillStyle = `rgba(143,216,255,${Math.sin(S.rewindK * Math.PI) * .12})`; ctx.fillRect(0, 0, VW, VH); }
  drawTicks(T);
  requestAnimationFrame(frame);
}

// test hook (used by the automated play test; harmless for players)
window.__heroBox = () => { const e = ents[ents.length - 1]; const X = bx(e.x + .5), Y = by(e.y + .5); return { x: Math.max(0, X - CS * .9), y: Math.max(0, Y - CS * 1.6), width: CS * 1.8, height: CS * 1.9 }; };
window.__sada = { S, doAction, loadRoom, cur, get ents() { return ents; }, startDemo, showHint, setExpr };

load();
window.addEventListener('resize', resize);
loadRoom(S.n);
resize();
$('bSound').classList.toggle('off', S.muted);
requestAnimationFrame(frame);
})();

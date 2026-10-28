// ===== صدى — mobile 2D: isometric board drawn with the painted art (mobile2d/art) =====
// Rules and rooms come from logic.js (EchoLogic), the same tested code as every other version.
// This file draws and handles input. Logic space: cell (x, y), y = 0 is the near row; the exit is far.
// Built from parts/head.js + parts/flow.js + parts/tail.js by build.mjs; sprites come from art/art.js.
(() => {
'use strict';
const E = window.EchoLogic;
const TICK = 230;                 // ms per tick
const START_HELP = 2, MAX_HELP = 5;
const GLYPH = [                   // door / plate identity: colour + shape (never colour alone)
  { c: '#ffb547', n: 0 },         // circle
  { c: '#ff5fa8', n: 3 },         // triangle
  { c: '#36d69a', n: 4 },         // square
  { c: '#9d7bff', n: 4, rot: Math.PI / 4 }, // diamond
];
const PAL = { grass: '#8fd14f', grassDk: '#6db236', grassLip: '#5f9e33', earth: '#d8743a', rock: '#c9c4ba', echo: '#8fd8ff', gold: '#e8b84a' };
const AR = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const $ = id => document.getElementById(id);
function hex2(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function shade(c, k, a = 1) { const [r, g, b] = hex2(c), f = v => Math.round(clamp(k >= 0 ? v + (255 - v) * k : v * (1 + k), 0, 255)); return `rgba(${f(r)},${f(g)},${f(b)},${a})`; }
function rng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function facet(c, pts, col, seed, vary = .07) {   // flat-shaded triangle fan: matches the art's low-poly look
  const r = rng(seed); let cx = 0, cy = 0; pts.forEach(p => { cx += p[0]; cy += p[1]; }); cx /= pts.length; cy /= pts.length;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy, d = Math.hypot(mx, my) || 1;
    c.fillStyle = shade(col, (-mx / d * .6 - my / d * .8) * .06 + (r() - .5) * vary);
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.closePath(); c.fill();
    c.strokeStyle = c.fillStyle; c.lineWidth = 1; c.stroke();
  }
}

// ---------------- sprites ----------------
const IMG = {};
const loaded = Promise.all(Object.entries(window.ART || {}).map(([k, src]) => new Promise(res => {
  const im = new Image(); im.onload = () => { IMG[k] = im; res(); }; im.onerror = () => res(); im.src = src;
})));
// blue see-through copies for the echoes (made once per sprite)
const GHOST = {};
function ghostOf(k) {
  if (GHOST[k]) return GHOST[k];
  const im = IMG[k]; if (!im) return null;
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(120,200,255,.72)'; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = .25; g.drawImage(im, 0, 0);
  return (GHOST[k] = c);
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

// ---------------- isometric projection + camera ----------------
// World units are the art's own pixels: one floor tile is 300 px wide. The two grid axes, measured
// on the floor tile sprite: +x goes down-right, a step toward the viewer (y-1) goes down-left.
const EX = [140, 122], EY = [-158, 118];
const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, VW = 0, VH = 0;
const cam = { x: 0, y: 0, z: .25, tz: .25, fit: .25, follow: false, overview: false };
// logic cell (x, y) -> world point (tile centre on the floor); h lifts it (in tile widths)
function wpt(x, y, h = 0) { const iy = S.R.H - 1 - y; return [x * EX[0] + iy * EY[0], x * EX[1] + iy * EY[1] - h * 300]; }
const toScr = (wx, wy) => [(wx - cam.x) * cam.z + VW / 2, (wy - cam.y) * cam.z + VH / 2];
function scr(x, y, h = 0) { const w = wpt(x, y, h); return toScr(w[0], w[1]); }
function cellAt(px, py) {   // screen -> nearest cell (inverse of the projection)
  const wx = (px - VW / 2) / cam.z + cam.x, wy = (py - VH / 2) / cam.z + cam.y;
  const det = EX[0] * EY[1] - EX[1] * EY[0];
  const x = (wx * EY[1] - wy * EY[0]) / det, iy = (EX[0] * wy - EX[1] * wx) / det;
  return { x: Math.round(x), y: S.R.H - 1 - Math.round(iy) };
}
function swipeMove(dx, dy) {   // the grid direction whose screen direction is closest to the swipe
  const dirs = { R: EX, L: [-EX[0], -EX[1]], D: EY, U: [-EY[0], -EY[1]] };
  let best = 'U', bv = -2; const l = Math.hypot(dx, dy) || 1;
  for (const [k, v] of Object.entries(dirs)) { const d = (dx * v[0] + dy * v[1]) / (l * Math.hypot(v[0], v[1])); if (d > bv) { bv = d; best = k; } }
  return best;
}
function bounds() {
  const R = S.R, pts = [wpt(0, R.H - 1, 1.1), wpt(R.W - 1, R.H - 1, 1.1), wpt(0, 0), wpt(R.W - 1, 0), wpt(R.W - 1, R.H - 1, 1.1), wpt(0, 0, -.6)];
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x0: Math.min(...xs) - 200, x1: Math.max(...xs) + 200, y0: Math.min(...ys) - 120, y1: Math.max(...ys) + 260 };
}
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  const r = cv.getBoundingClientRect(); VW = r.width; VH = r.height;
  cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
  layout();
}
const MIN_TILE = 74;   // px: below this the art is too small to read; the camera follows the fox instead
function layout() {
  if (!S.R || VW < 50) return;
  const b = bounds(), top = 60, bottom = 50;
  cam.fit = Math.min(VW / (b.x1 - b.x0), (VH - top - bottom) / (b.y1 - b.y0));
  cam.follow = cam.fit * 300 < MIN_TILE;
  cam.tz = cam.follow && !cam.overview ? MIN_TILE / 300 : cam.fit;
  if (!cam.follow || cam.overview) { cam.cx = (b.x0 + b.x1) / 2; cam.cy = (b.y0 + b.y1) / 2 - (top - bottom) / 2 / cam.tz; }
  buildSky();
}
function updCam(dt) {
  const b = bounds();
  if (cam.follow && !cam.overview && ents.length) {
    const e = ents[ents.length - 1], w = wpt(e.x, e.y, .25);
    const hw = VW / 2 / cam.tz, hh = VH / 2 / cam.tz;
    cam.cx = clamp(w[0], b.x0 + hw, b.x1 - hw); if (b.x1 - b.x0 < hw * 2) cam.cx = (b.x0 + b.x1) / 2;
    cam.cy = clamp(w[1], b.y0 + hh - 60 / cam.tz, b.y1 - hh + 50 / cam.tz); if (b.y1 - b.y0 < hh * 2) cam.cy = (b.y0 + b.y1) / 2;
  }
  const k = Math.min(1, dt * 5);
  cam.z += (cam.tz - cam.z) * k; cam.x += (cam.cx - cam.x) * k; cam.y += (cam.cy - cam.y) * k;
}
function snapCam() { updCam(10); cam.z = cam.tz; cam.x = cam.cx; cam.y = cam.cy; }

// ---------------- sky and floating decoration ----------------
let skyLayer = null, minis = [];
function buildSky() {
  skyLayer = document.createElement('canvas'); skyLayer.width = cv.width; skyLayer.height = cv.height;
  const c = skyLayer.getContext('2d'); c.setTransform(DPR, 0, 0, DPR, 0, 0);
  const g = c.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, '#5fb0e8'); g.addColorStop(.6, '#9fd3f2'); g.addColorStop(1, '#e9e6d8');
  c.fillStyle = g; c.fillRect(0, 0, VW, VH);
  const s = c.createRadialGradient(0, 0, 0, 0, 0, VW * .9); s.addColorStop(0, 'rgba(255,250,225,.55)'); s.addColorStop(1, 'rgba(255,250,225,0)');
  c.fillStyle = s; c.fillRect(0, 0, VW, VH);   // the sun, upper left, as in the art
  const r = rng(S.n * 7 + 3), b = bounds(), names = ['isl_small_a', 'isl_small_b', 'isl_mid_a', 'isl_mid_b'];
  minis = [];
  for (let k = 0; k < 5; k++) {
    const left = k % 2 === 0, wx = left ? b.x0 - 140 - r() * 220 : b.x1 + 140 + r() * 220, wy = lerp(b.y0, b.y1, .15 + k * .17 + r() * .08);
    minis.push({ n: names[k % 4], wx, wy, s: .55 + r() * .4, ph: r() * 6, depth: .55 + r() * .3 });
  }
}

// ---------------- the island under the room (drawn in world space each frame; cheap polygons) ----------------
function drawIsland(T) {
  const R = S.R, r = rng(R.W * 31 + R.H * 7 + S.n);
  const c0 = wpt(-.5, R.H - .5), c1 = wpt(R.W - .5, R.H - .5), c2 = wpt(R.W - .5, -.5), c3 = wpt(-.5, -.5);   // floor corners (far, right, near, left)
  const grow = (p, q, k) => [p[0] + (p[0] - q[0]) * k, p[1] + (p[1] - q[1]) * k];
  const mid = [(c0[0] + c2[0]) / 2, (c0[1] + c2[1]) / 2];
  const m = .18 + 1.2 / (R.W + R.H);
  const g0 = grow(c0, mid, m), g1 = grow(c1, mid, m), g2 = grow(c2, mid, m), g3 = grow(c3, mid, m);
  const lip = 46, drop = 420;
  // hanging earth below the two near edges (left: g3->g2, right: g2->g1)
  const under = [g3, g2, g1];
  const rim = [];
  for (const [a, b] of [[g3, g2], [g2, g1]]) for (let k = 0; k <= 6; k++) rim.push([lerp(a[0], b[0], k / 6), lerp(a[1], b[1], k / 6) + lip]);
  const bottom = [];
  const n = 9;
  for (let k = n; k >= 0; k--) {
    const t = k / n, p = t < .5 ? [lerp(g3[0], g2[0], t * 2), lerp(g3[1], g2[1], t * 2)] : [lerp(g2[0], g1[0], t * 2 - 1), lerp(g2[1], g1[1], t * 2 - 1)];
    bottom.push([p[0] + (r() - .5) * 60, p[1] + lip + drop * Math.sin(Math.PI * (.15 + .7 * t)) * (.55 + r() * .5)]);
  }
  facet(ctx, [...rim, ...bottom], PAL.earth, 17, .16);
  for (let k = 0; k < 7; k++) {   // grey rocks set in the earth
    const t = r(), p = t < .5 ? [lerp(g3[0], g2[0], t * 2), lerp(g3[1], g2[1], t * 2)] : [lerp(g2[0], g1[0], t * 2 - 1), lerp(g2[1], g1[1], t * 2 - 1)];
    const cx = p[0], cy = p[1] + lip + 60 + r() * drop * .45, s = 26 + r() * 30, pts = [];
    for (let q = 0; q < 6; q++) { const a = q / 6 * Math.PI * 2; pts.push([cx + Math.cos(a) * s * (.8 + r() * .4), cy + Math.sin(a) * s * .8 * (.8 + r() * .4)]); }
    facet(ctx, pts, PAL.rock, 40 + k, .14);
  }
  // falling pebbles under the island
  for (let k = 0; k < 4; k++) {
    const t = .2 + k * .2, p = [lerp(g3[0], g1[0], t), lerp(g3[1], g1[1], t) + lip + drop * (.9 + (k % 2) * .25) + Math.sin(T * 1.2 + k) * 8];
    facet(ctx, [[p[0] - 14, p[1]], [p[0], p[1] - 16], [p[0] + 14, p[1]], [p[0], p[1] + 18]], k % 2 ? PAL.rock : PAL.earth, 60 + k, .2);
  }
  // grass lip and top
  ctx.fillStyle = PAL.grassLip; ctx.beginPath(); ctx.moveTo(g3[0], g3[1]); ctx.lineTo(g2[0], g2[1]); ctx.lineTo(g1[0], g1[1]);
  ctx.lineTo(g1[0], g1[1] + lip); ctx.lineTo(g2[0], g2[1] + lip); ctx.lineTo(g3[0], g3[1] + lip); ctx.fill();
  const top = [];
  for (const [a, b] of [[g0, g1], [g1, g2], [g2, g3], [g3, g0]]) for (let k = 0; k < 5; k++) { const t = k / 5; top.push([lerp(a[0], b[0], t) + (r() - .5) * 18, lerp(a[1], b[1], t) + (r() - .5) * 10]); }
  facet(ctx, top, PAL.grass, 3, .08);
  // a dark seam where the stone floor sits in the grass
  ctx.fillStyle = 'rgba(70,60,35,.35)'; ctx.beginPath(); ctx.moveTo(c0[0], c0[1] - 6); ctx.lineTo(c1[0] + 8, c1[1]); ctx.lineTo(c2[0], c2[1] + 10); ctx.lineTo(c3[0] - 8, c3[1]); ctx.closePath(); ctx.fill();
}

// draw a sprite in world space: anchor (ax, ay) as fractions of its size, s = scale
function spr(k, wx, wy, ax, ay, s = 1, alpha = 1, flip = false, src) {
  const im = src || IMG[k]; if (!im) return;
  const w = im.width * s, h = im.height * s;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(wx, wy); if (flip) ctx.scale(-1, 1);
  ctx.drawImage(im, -ax * w, -ay * h, w, h); ctx.restore();
}

// ---------------- floor, walls, doors, plates, exit ----------------
const TILES = ['floor', 'floor', 'floor', 'floor4', 'floor_crack'];
function floorAt(x, y) { const r = rng(x * 73 + y * 151 + S.n * 7); return TILES[Math.floor(r() * TILES.length)]; }
function drawFloor(x, y) { const w = wpt(x, y); spr(floorAt(x, y), w[0], w[1], .5, 121 / 249); }
function drawWall(x, y) {
  const w = wpt(x, y), moss = rng(x * 17 + y * 29 + S.n)() < .4;
  // the painted block is three courses tall and hid the paths behind it: keep its top as painted and
  // compress the front face, so a wall reads as about one course and a half
  const im = IMG[moss ? 'wall_moss' : 'wall']; if (!im) return;
  const s = 1.3, cut = .4, squash = .5;           // top part = upper 40% of the sprite
  const W = im.width * s, topH = im.height * cut * s, faceH = im.height * (1 - cut) * s * squash;
  const x0 = w[0] - W / 2, base = w[1] + 14 + im.height * .28 * s;   // ground line of the block (was its anchor)
  ctx.drawImage(im, 0, im.height * cut, im.width, im.height * (1 - cut), x0, base - faceH, W, faceH);
  ctx.drawImage(im, 0, 0, im.width, im.height * cut, x0, base - faceH - topH + 2, W, topH);
}
const WALL_LIFT = .5;   // how far the squashed wall's top sits above the floor, in tile widths (for the glyphs)
let doorFx = [], plateFx = [];
function glyphPath(c, g, r) {
  const G = GLYPH[g % 4];
  c.beginPath();
  if (!G.n) { c.arc(0, 0, r, 0, Math.PI * 2); return; }
  for (let k = 0; k < G.n; k++) {
    const a = (G.rot || 0) - Math.PI / 2 + k * Math.PI * 2 / G.n + (G.n === 4 && !G.rot ? Math.PI / 4 : 0);
    k ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.closePath();
}
function plateHeld(i) {
  const pos = cur();
  return S.R.plates.some(p => p.door === i && (pos.some(e => e.x === p.x && e.y === p.y) || (S.R.pinned || []).some(e => e.x === p.x && e.y === p.y)));
}
function drawDoor(i, T) {
  const d = S.R.doors[i], f = doorFx[i], G = GLYPH[i % 4], w = wpt(d.x, d.y);
  // the wooden panel sinks into the floor as the door opens (clipped at the floor line)
  if (f.open < .99) {
    const im = IMG.door_panel, s = 1.05, ph = im.height * s;
    ctx.save();
    ctx.beginPath(); ctx.rect(w[0] - 200, w[1] - 600, 400, 600 + 40); ctx.clip();
    spr('door_panel', w[0] + 4, w[1] + 34 + f.open * ph, .5, .9, s);
    if (f.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = f.flash * .6; spr('door_panel', w[0] + 4, w[1] + 34 + f.open * ph, .5, .9, s); }
    ctx.restore();
  }
  spr('door_frame', w[0] + 6, w[1] + 40, .5, .86, 1.12);
  // neon glyph above the lintel: breathes when shut, bright and spinning when open, flashes on a bump
  const pulse = .55 + .25 * Math.sin(T * 2.4 + i) + f.lit * .5 + f.open * .6 + f.flash;
  ctx.save(); ctx.translate(w[0] + 6, w[1] - 445 - Math.sin(T * 1.8 + i) * 8 - f.open * 30);
  ctx.scale(Math.cos(f.open * T * 2) * .25 * f.open + (1 - f.open * .25), 1);
  ctx.shadowColor = G.c; ctx.shadowBlur = 30 * clamp(pulse, .3, 1.6) * cam.z * 4;
  ctx.strokeStyle = G.c; ctx.globalAlpha = clamp(.6 + pulse * .35, 0, 1); ctx.lineWidth = d.kind === 'inverse' ? 10 : 16; ctx.lineJoin = 'round';
  glyphPath(ctx, i, 46); ctx.stroke();
  ctx.restore();
  if (d.kind === 'timed') {   // three pips counting the open ticks down
    const tm = (cur().timers || [])[i] || 0, held = plateHeld(i);
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = held || k < tm ? G.c : 'rgba(60,50,40,.45)';
      ctx.beginPath(); ctx.arc(w[0] + 6 + (k - 1) * 36, w[1] - 372, 11, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (f.flash > 0) f.flash = Math.max(0, f.flash - .04);
}
function drawPlate(j, T) {
  const p = S.R.plates[j], f = plateFx[j], G = GLYPH[p.door % 4], inv = S.R.doors[p.door].kind === 'inverse', w = wpt(p.x, p.y);
  spr(f.on > .5 ? 'plate_down' : 'plate', w[0], w[1] + 6, .5, .5, .82);
  const glow = .5 + f.on * .5 + (f.hover || 0) * .35 + .1 * Math.sin(T * 3 + j);
  ctx.save(); ctx.translate(w[0] + 4, w[1] - 8 + f.on * 6); ctx.scale(1, .6);
  ctx.shadowColor = G.c; ctx.shadowBlur = 40 * glow * cam.z * 4;
  ctx.strokeStyle = G.c; ctx.globalAlpha = clamp(glow, 0, 1); ctx.lineWidth = 9;
  ctx.beginPath(); ctx.arc(0, 0, 74, 0, Math.PI * 2); ctx.stroke();
  glyphPath(ctx, p.door, 34);
  if (inv) { ctx.lineWidth = 8; ctx.stroke(); } else { ctx.fillStyle = G.c; ctx.fill(); }
  ctx.restore();
}
function drawExit(T) {
  const e = S.R.exit, w = wpt(e.x, e.y), near = S.nearExit || 0;
  spr('exit', w[0], w[1] + 30, .5, .86, .92 + near * .03);
  // sparks rising from the ring, more when the fox comes close
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 10; k++) {
    const ph = (T * (.35 + near * .3) + k / 10) % 1, a = k * 2.4;
    ctx.fillStyle = `rgba(255,214,120,${(1 - ph) * .8})`;
    ctx.beginPath(); ctx.arc(w[0] + Math.cos(a) * 60, w[1] - 120 - ph * 340, 7 * (1 - ph * .5), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function drawStatue(x, y) {   // pinned helper: a grey stone copy of the fox holding the plate
  const w = wpt(x, y);
  ctx.save(); ctx.filter = 'grayscale(1) brightness(1.15) contrast(.8)';
  spr('fox_front', w[0], w[1] + 10, .5, .96, .62);
  ctx.restore();
}

// ---------------- the fox: painted sprites (front, back, walk cycle) with expression heads ----------------
let ents = [];
function makeEnt(i, p, ghost) {
  return { i, ghost, x: p.x, y: p.y, fx: p.x, fy: p.y, tx: p.x, ty: p.y, t: 1, dur: TICK, face: 'D', walkPh: 0, moving: false, walkW: 0,
    bump: null, expr: 'calm', exprT: 0, blink: 1.5 + Math.random() * 3, blinkT: 0, pop: 1, jump: 0, jumpV: 0, still: 9, turnT: 0 };
}
function spawnEnts() { const pos = cur(); ents = pos.map((p, i) => makeEnt(i, p, i < pos.length - 1)); spread(pos, true); }
function spread(pos, snap) {   // several on one cell (every loop starts that way): echoes stand around the fox
  const groups = {}, hero = pos.length - 1;
  pos.forEach((p, i) => (groups[p.x + ',' + p.y] = groups[p.x + ',' + p.y] || []).push(i));
  pos.forEach((p, i) => { ents[i].ox = 0; ents[i].oy = 0; });
  for (const g of Object.values(groups)) {
    if (g.length < 2) continue;
    let ring = g.filter(i => i !== hero); if (!g.includes(hero)) ring = ring.slice(1);
    ring.forEach((i, j) => { const a = Math.PI * 2 * j / ring.length + Math.PI * .25; ents[i].ox = Math.cos(a) * .3; ents[i].oy = Math.sin(a) * .3; });
  }
  if (snap) ents.forEach((e, i) => { e.x = e.fx = e.tx = pos[i].x + e.ox; e.y = e.fy = e.ty = pos[i].y + e.oy; e.t = 1; });
}
function setExpr(e, x, t) { e.expr = x; e.exprT = t; }
const FACE = { calm: 'face_calm', happy: 'face_happy', oops: 'face_oops', worry: 'face_worry', cheer: 'face_cheer', sleep: 'face_sleep' };
function drawFox(e, T) {
  const w = wpt(e.x, e.y), g = e.ghost;
  const s = .78 * (.7 + .3 * e.pop), lift = e.jump * 120;
  // shadow on the floor
  ctx.fillStyle = 'rgba(60,40,20,.28)'; ctx.beginPath(); ctx.ellipse(w[0], w[1] + 4, 70 - e.jump * 20, 26, 0, 0, Math.PI * 2); ctx.fill();
  const bump = e.bumpOff || 0, bd = E.DIRS[e.face] || [0, 0], bv = [bd[0] * EX[0] - bd[1] * EY[0], bd[0] * EX[1] - bd[1] * EY[1]];
  const X = w[0] + bv[0] * bump, Y = w[1] + bv[1] * bump - lift;
  const a = g ? .7 : 1, src = k => g ? ghostOf(k) : IMG[k];
  if (e.walkW > .4 && (e.face === 'R' || e.face === 'D')) {
    // walking toward the viewer: the side walk cycle (right = down-right, flipped = down-left)
    const k = 'walk' + (Math.floor(e.walkPh) % 8);
    spr(k, X, Y, .5, .97, s * 1.1, a, e.face === 'D', src(k));
  } else if (e.face === 'U' || e.face === 'L') {
    const bob = Math.abs(Math.sin(e.walkPh * Math.PI / 4)) * 10 * e.walkW;
    spr('fox_back', X, Y - bob, .5, .97, s, a, e.face === 'L', src('fox_back'));
  } else {
    // facing us: the body, then the expression head drawn over it (it carries the face and the chest)
    const breathe = 1 + Math.sin(T * 2.2 + e.i) * .012, bob = Math.abs(Math.sin(e.walkPh * Math.PI / 4)) * 10 * e.walkW;
    const flip = e.side === 'L';
    ctx.save(); ctx.translate(X, Y - bob); ctx.scale(flip ? -1 : 1, breathe); ctx.translate(-X, -Y + bob);
    spr('fox_front', X, Y - bob, .5, .97, s, a, false, src('fox_front'));
    let fk = FACE[g ? 'sleep' : e.blinkT > 0 && e.expr === 'calm' ? 'sleep' : e.expr] || 'face_calm';
    const fim = IMG[fk];
    if (fim) {
      const fs = s * 200 / 245 * 1.02;   // head sheet scaled to the body's head width
      spr(fk, X + 1, Y - bob - IMG.fox_front.height * s * .97 - 4 + (e.expr === 'worry' ? 6 : 0), .5, 0, fs * (fk === 'face_worry' ? 245 / 303 * 1.0 : 1), a, false, g ? ghostOf(fk) : fim);
    }
    ctx.restore();
  }
}
function updEnt(e, dt, T) {
  if (e.t < 1) {
    e.t = Math.min(1, e.t + dt * 1000 / e.dur);
    const k = e.t;   // linear: a steady walk across the tile
    e.x = lerp(e.fx, e.tx, k); e.y = lerp(e.fy, e.ty, k);
    e.moving = Math.hypot(e.tx - e.fx, e.ty - e.fy) > .3;
    e.bumpOff = e.bump ? Math.sin(e.t * Math.PI) * .12 * e.bump : 0;
    if (e.t >= 1) { e.bumpOff = 0; e.bump = null; e.moving = false; }
    e.still = 0;
  } else e.still += dt;
  e.walkW += ((e.moving || e.still < .12) && e.walkW > .01 || e.moving ? 1 - e.walkW : -e.walkW) * Math.min(1, dt * 12);
  if (!e.moving && e.still > .12) e.walkW = Math.max(0, e.walkW - dt * 6);
  e.walkPh += dt * 30 * Math.max(.2, e.walkW);
  e.blink -= dt; if (e.blink < 0) { e.blinkT = .14; e.blink = Math.random() < .2 ? .3 : 2.4 + Math.random() * 3.5; }
  if (e.blinkT > 0) e.blinkT -= dt;
  if (e.exprT > 0) { e.exprT -= dt; if (e.exprT <= 0) e.expr = 'calm'; }
  if (e.jumpV || e.jump > 0) { e.jumpV -= dt * 9; e.jump = Math.max(0, e.jump + e.jumpV * dt * 6); if (e.jump === 0) e.jumpV = 0; }
  // after a short stop the fox turns back to face you
  if (e.t >= 1 && e.still > .45 && e.face !== 'D' && e.face !== 'F') { e.side = e.face === 'L' || e.face === 'D' ? 'L' : 'R'; e.face = 'F'; }
}

// ---------------- hint footprints, door links, tick row ----------------
let hint = null, hover = -1;
function drawHint(T) {
  if (!hint) return;
  if (performance.now() > hint.until) { hint = null; return; }
  ctx.save(); ctx.font = '700 64px "Readex Pro", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  hint.cells.forEach((c, k) => {
    const w = wpt(c.x, c.y), a = .6 + .3 * Math.sin(T * 4 - k * .5);
    ctx.save(); ctx.translate(w[0], w[1]); ctx.scale(1, .62);
    ctx.fillStyle = `rgba(255,255,255,${a * .6})`; ctx.beginPath(); ctx.arc(0, 0, 60, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.fillStyle = `rgba(120,70,30,${a + .1})`; ctx.fillText(AR(c.t), w[0], w[1] + 2);
  });
  ctx.restore();
}
function drawLink(T) {
  if (hover < 0) return;
  const d = S.R.doors[hover], G = GLYPH[hover % 4];
  ctx.save(); ctx.fillStyle = G.c; ctx.shadowColor = G.c; ctx.shadowBlur = 20 * cam.z * 4;
  for (const p of S.R.plates) {
    if (p.door !== hover) continue;
    const a = wpt(p.x, p.y), b = wpt(d.x, d.y, 1.6), n = 16;
    for (let k = 0; k < n; k++) {
      const t = (k + (T * 1.4) % 1) / n, X = lerp(a[0], b[0], t), Y = lerp(a[1], b[1], t) - Math.sin(t * Math.PI) * 260;
      ctx.beginPath(); ctx.arc(X, Y, 12 * (.6 + .4 * Math.sin(t * Math.PI)), 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}
function drawTicks(T) {
  const R = S.R, n = R.L, done = S.acts.length, w = Math.min(VW - 130, n * 22), y = VH - 22, x0 = (VW - w) / 2;
  ctx.save(); ctx.fillStyle = 'rgba(30,50,60,.35)'; ctx.beginPath(); ctx.roundRect(x0 - 12, y - 13, w + 24, 26, 13); ctx.fill(); ctx.restore();
  for (let k = 0; k < n; k++) {
    const X = x0 + w * (k + .5) / n, left = n - done, past = k < done, warn = !past && left <= 3;
    ctx.fillStyle = past ? 'rgba(255,255,255,.25)' : warn ? '#ff8a6e' : '#ffd27a';
    ctx.beginPath(); for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2; ctx[q ? 'lineTo' : 'moveTo'](X + Math.cos(a) * 5, y + Math.sin(a) * 5); } ctx.fill();
  }
  // echo slots: small sleeping fox faces, filled as loops are recorded
  for (let k = 0; k < R.E; k++) {
    const X = x0 - 30 - k * 26, im = ghostOf('face_sleep');
    if (!im) continue;
    ctx.save(); ctx.globalAlpha = k < S.echoes.length ? 1 : .35; ctx.drawImage(im, X - 11, y - 15, 22, 30); ctx.restore();
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

// ---------------- sound: quiet. Sparse soft bells far away, no drone ----------------
let AC = null, master = null, verb = null, musicT = 2;
function audioStart() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = S.muted ? 0 : .55; master.connect(AC.destination);
    verb = AC.createDelay(1); verb.delayTime.value = .42;
    const fb = AC.createGain(); fb.gain.value = .32; const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    verb.connect(lp); lp.connect(fb); fb.connect(verb); lp.connect(master);
  } catch (e) { AC = null; }
}
function bell(semi, dur, vol, delay = 0) {
  if (!AC) return;
  const t = AC.currentTime + delay, hz = 440 * Math.pow(2, (semi - 9) / 12);
  const g = AC.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .03); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  for (const [m, v] of [[1, 1], [2, .18]]) { const o = AC.createOscillator(); o.type = 'sine'; o.frequency.value = hz * m; const og = AC.createGain(); og.gain.value = v; o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + .05); }
  g.connect(master); g.connect(verb);
}
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
  spawnEnts(); doorsUpdate(true); cam.overview = false; layout(); snapCam(); ui(); save();
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
    { const q = scr(hero.x + d[0] * .4, hero.y + d[1] * .4, .3); burst(q[0], q[1], ['#c9c4ba', '#ead2ae'], 6, 120); }
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
  { const q = scr(S.R.exit.x, S.R.exit.y, 1); burst(q[0], q[1], ['#ffb547', '#8fd14f', '#ff6fae', '#46d6a0', '#e87a33'], 40, 260); }
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
cv.addEventListener('pointerdown', e => { touch = { x: e.clientX, y: e.clientY, t: performance.now() }; const r = cv.getBoundingClientRect(); const c = cellAt(e.clientX - r.left, e.clientY - r.top); hover = hoverDoor(c); });
cv.addEventListener('pointerup', e => {
  if (!touch || !S.started) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y, r = cv.getBoundingClientRect();
  touch = null; setTimeout(() => (hover = -1), 900);
  if (S.demo) return stopDemo();
  if (Math.hypot(dx, dy) > 24) {
    const a = swipeMove(dx, dy);   // the board is isometric: pick the grid direction closest to the swipe
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

// two fingers: pinch to zoom out and see the whole room (or in, to follow the fox); double tap toggles
const pts = new Map(); let pinch0 = 0, lastTap = 0;
cv.addEventListener('pointerdown', e => {
  pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (pts.size === 2) { touch = null; const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); }
});
cv.addEventListener('pointermove', e => {
  if (!pts.has(e.pointerId)) return;
  pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (pts.size === 2 && cam.follow) {
    const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (d < pinch0 * .8 && !cam.overview) { cam.overview = true; layout(); }
    if (d > pinch0 * 1.25 && cam.overview) { cam.overview = false; layout(); }
  }
});
const lift = e => { pts.delete(e.pointerId); };
cv.addEventListener('pointerup', e => {
  const now = performance.now();
  if (pts.size === 1 && now - lastTap < 280 && cam.follow) { cam.overview = !cam.overview; layout(); S.walk = []; }
  lastTap = now; lift(e);
});
cv.addEventListener('pointercancel', lift);

// ---------------- frame ----------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; const T = now / 1000;
  if (!S.R || !skyLayer || !IMG.floor) { requestAnimationFrame(frame); return; }
  ents.forEach(e => updEnt(e, dt, T));
  doorFx.forEach((f, i) => { f.open += ((f.target || 0) - f.open) * Math.min(1, dt * 9); f.lit += ((hover === i ? 1 : 0) - f.lit) * Math.min(1, dt * 6); });
  plateFx.forEach((f, j) => { f.on += ((f.target || 0) - f.on) * Math.min(1, dt * 12); f.hover = hover >= 0 && S.R.plates[j].door === hover ? 1 : 0; });
  const heroE = ents[ents.length - 1];
  S.nearExit = heroE ? clamp(1 - (Math.hypot(heroE.x - S.R.exit.x, heroE.y - S.R.exit.y) - 1) / 3, 0, 1) : 0;
  music(dt); updCam(dt);

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.globalAlpha = 1;
  ctx.drawImage(skyLayer, 0, 0, VW, VH);
  // room entrance: the island rises into place; on a win it sinks away. It also breathes in the air.
  const ent = clamp((now - (S.enterT || 0)) / 700, 0, 1), out = S.transT ? clamp((now - S.transT) / 380, 0, 1) : 0;
  if (ent >= 1 && S.transT && !S.won) S.transT = 0;
  const slide = (1 - ease(ent)) * 260 + ease(out) * 300 + Math.sin(T * .8) * 10;
  const z = cam.z;
  ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * (VW / 2 - cam.x * z), DPR * (VH / 2 - cam.y * z));
  for (const m of minis) { const im = IMG[m.n]; if (im) spr(m.n, m.wx, m.wy + Math.sin(T * .9 + m.ph) * 18, .5, .3, m.s * 1.4, .95); }
  ctx.save();
  ctx.globalAlpha = Math.min(ease(ent), 1 - out);
  ctx.translate(0, slide);
  drawIsland(T);
  const R = S.R, order = [];
  for (let y = 0; y < R.H; y++) for (let x = 0; x < R.W; x++) order.push([x, y, x + (R.H - 1 - y)]);
  order.sort((a, b) => a[2] - b[2]);
  for (const [x, y] of order) if (!R.wall[y * R.W + x]) drawFloor(x, y);
  R.plates.forEach((p, j) => drawPlate(j, T));
  drawHint(T);
  // depth-sorted: far first; walls, doors, the exit, statues and foxes interleave
  const items = [];
  for (const [x, y, d] of order) if (R.wall[y * R.W + x]) items.push({ d, f: () => drawWall(x, y) });
  R.doors.forEach((dr, i) => items.push({ d: dr.x + R.H - 1 - dr.y - .01, f: () => drawDoor(i, T) }));
  items.push({ d: R.exit.x + R.H - 1 - R.exit.y - .02, f: () => drawExit(T) });
  (R.pinned || []).forEach(p => items.push({ d: p.x + R.H - 1 - p.y, f: () => drawStatue(p.x, p.y) }));
  ents.forEach(e => items.push({ d: e.x + R.H - 1 - e.y + .01, f: () => drawFox(e, T) }));
  items.sort((a, b) => a.d - b.d).forEach(it => it.f());
  // see-through: the foxes again, faint, on top of everything, so a wall in front never hides them
  // (where nothing covers them this lands on the same pixels and changes nothing visible)
  ents.forEach(e => { ctx.save(); ctx.globalAlpha *= e.ghost ? .22 : .38; drawFox(e, T); ctx.restore(); });
  drawLink(T);
  ctx.restore();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.globalAlpha = 1;
  drawParts(dt);
  if (S.rewindK) { ctx.fillStyle = `rgba(143,216,255,${Math.sin(S.rewindK * Math.PI) * .14})`; ctx.fillRect(0, 0, VW, VH); }
  drawTicks(T);
  requestAnimationFrame(frame);
}

// test hooks (used by the automated play test; harmless for players)
window.__heroBox = () => { const e = ents[ents.length - 1], p = scr(e.x, e.y); const h = 320 * cam.z; return { x: Math.max(0, p[0] - h * .5), y: Math.max(0, p[1] - h * 1.05), width: h, height: h * 1.15 }; };
window.__sada = { S, doAction, loadRoom, cur, get ents() { return ents; }, startDemo, showHint, setExpr, cam, layout };

load();
window.addEventListener('resize', resize);
loaded.then(() => { loadRoom(S.n); resize(); snapCam(); $('bSound').classList.toggle('off', S.muted); requestAnimationFrame(frame); });
})();

// ===== صدى — mobile 2D: a cut-paper diorama lit by the hero's lantern =====
// Rules and rooms come from logic.js (EchoLogic), the same tested code as every other version.
// This file only draws and handles input. Board space: cell (x, y), y = 0 is the bottom row.
(() => {
'use strict';
const E = window.EchoLogic;
const TICK = 230;                 // ms per tick
const START_HELP = 2, MAX_HELP = 5;
const GLYPH = [                   // door / plate identity: colour + shape (never colour alone)
  { c: '#ffb547', n: 0 },         // circle
  { c: '#ff6fae', n: 3 },         // triangle
  { c: '#7cf0b5', n: 4 },         // square
  { c: '#b79bff', n: 4, rot: Math.PI / 4 }, // diamond
];
const PAL = {
  floorA: '#3a3470', floorB: '#35306a', floorEdge: '#2a255a', floorHi: '#4a4388',
  wallTop: '#efe2c8', wallTop2: '#e2d1b0', wallFace: '#6c5fc4', wallFace2: '#5a4fae', wallDeep: '#3d3488',
  ink: '#0d0c1f', night: 'rgba(13,11,34,', paper: '#efe2c8',
  cloak: '#2f2a6b', cloakHi: '#4a42a0', scarf: '#ff9a3c', face: '#f6e7cc', lantern: '#ffb547', echo: '#8fd8ff',
};
let WHset = 0;
const AR = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const $ = id => document.getElementById(id);

// ---------------- state ----------------
const S = {
  n: 1, runSeed: 0, R: null, echoes: [], acts: [], states: [], help: START_HELP, solved: 0,
  busy: false, won: false, rewinding: false, walk: [], fails: 0, pinMode: false, demo: null, demoSeen: {},
  started: false,
};
const cur = () => S.states[S.states.length - 1];

function save() { try { localStorage.setItem('sada2d', JSON.stringify({ n: S.n, runSeed: S.runSeed, help: S.help, solved: S.solved, demoSeen: S.demoSeen })); } catch (e) {} }
function load() { try { const d = JSON.parse(localStorage.getItem('sada2d') || 'null'); if (d) Object.assign(S, d); } catch (e) {} if (!S.runSeed) S.runSeed = (Math.random() * 1e9) >>> 0; }

// ---------------- canvas & layout ----------------
const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, VW = 0, VH = 0, CS = 40, OX = 0, OY = 0, WH = .34; // cell size px, origin, wall height (in cells)
const light = document.createElement('canvas'), lctx = light.getContext('2d');
let staticLayer = null;   // floor + wall faces pre-rendered per room

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  const r = cv.getBoundingClientRect();
  VW = r.width; VH = r.height;
  cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
  light.width = Math.round(VW * DPR / 2); light.height = Math.round(VH * DPR / 2);
  layout();
}
function layout() {
  if (!S.R) return;
  const R = S.R, top = 62, bottom = 58;             // room for the counter / the tick lanterns
  const availW = VW - 44, availH = VH - top - bottom;
  CS = Math.floor(Math.min(availW / R.W, availH / (R.H + WH + .3), 92));
  OX = Math.round((VW - CS * R.W) / 2);
  OY = Math.round(top + (availH - CS * (R.H + WH)) / 2 + CS * WH);
  buildStatic();
}
// cell centre -> screen
const sx = x => OX + (x + .5) * CS;
const sy = y => OY + (S.R.H - 1 - y + .5) * CS;

// ---------------- paper textures ----------------
function grain(c, w, h, alpha) {   // fibrous paper noise, drawn once
  const g = c.createImageData(w, h), d = g.data;
  let s = 1234567;
  for (let i = 0; i < d.length; i += 4) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const v = (s >> 16) & 255;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = (v > 200 || v < 40) ? alpha : alpha * .35;
  }
  return g;
}
// a deckled (hand-torn) rectangle: tiny jitter along the edges, stable per seed
function deckle(c, x, y, w, h, seed, amp) {
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const steps = Math.max(4, Math.round((w + h) / 9));
  c.beginPath();
  const edge = (x0, y0, x1, y1, nx, ny) => {
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, j = (rnd() - .5) * amp;
      c.lineTo(lerp(x0, x1, t) + nx * j, lerp(y0, y1, t) + ny * j);
    }
  };
  c.moveTo(x, y);
  edge(x, y, x + w, y, 0, 1); edge(x + w, y, x + w, y + h, 1, 0);
  edge(x + w, y + h, x, y + h, 0, 1); edge(x, y + h, x, y, 1, 0);
  c.closePath();
}

function buildStatic() {
  const R = S.R;
  staticLayer = document.createElement('canvas');
  staticLayer.width = cv.width; staticLayer.height = cv.height;
  const c = staticLayer.getContext('2d');
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  // night around the board: a cut-paper crescent and a few paper stars in the empty margins
  {
    let sd = 99; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const inBoard = (x, y) => x > OX - CS * .5 && x < OX + CS * (R.W + .5) && y > OY - CS * (WH + .6) && y < OY + CS * (R.H + .6);
    for (let k = 0; k < 46; k++) {
      const x = rnd() * VW, y = rnd() * VH * .95, r = 1.2 + rnd() * 2.6;
      if (inBoard(x, y)) continue;
      c.fillStyle = `rgba(239,226,200,${.18 + rnd() * .35})`;
      c.beginPath(); for (let q = 0; q < 8; q++) { const a = q * Math.PI / 4, rr = q % 2 ? r * .38 : r; q ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + rr, y); } c.fill();
    }
    const mx = VW * .82, my = Math.max(40, OY - CS * WH - 70), mr = Math.min(34, Math.max(18, (OY - CS * WH - 20) * .35));
    if (my - mr > 40) {
      c.save(); c.shadowColor = 'rgba(255,214,150,.35)'; c.shadowBlur = 24;
      c.fillStyle = '#efe2c8'; c.beginPath(); c.arc(mx, my, mr, 0, Math.PI * 2); c.fill(); c.restore();
      c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(mx - mr * .45, my - mr * .2, mr * .92, 0, Math.PI * 2); c.fill();
      c.globalCompositeOperation = 'source-over';
    }
  }
  // board base: a sheet of paper under the room with a soft drop shadow
  c.save();
  c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = CS * .6; c.shadowOffsetY = CS * .25;
  c.fillStyle = PAL.floorEdge;
  deckle(c, OX - CS * .18, OY - CS * .12, CS * R.W + CS * .36, CS * R.H + CS * .42, 7, CS * .05); c.fill();
  c.restore();
  // floor tiles: cut paper squares, two tones in a checker, a lit top edge
  for (let y = 0; y < R.H; y++) for (let x = 0; x < R.W; x++) {
    if (R.wall[y * R.W + x]) continue;
    const X = OX + x * CS, Y = OY + (R.H - 1 - y) * CS, g = CS * .06;
    c.fillStyle = (x + y) % 2 ? PAL.floorA : PAL.floorB;
    deckle(c, X + g, Y + g, CS - 2 * g, CS - 2 * g, x * 31 + y * 17, CS * .025); c.fill();
    c.strokeStyle = PAL.floorHi; c.lineWidth = 1;
    c.beginPath(); c.moveTo(X + g * 1.6, Y + g * 1.3); c.lineTo(X + CS - g * 1.6, Y + g * 1.3); c.stroke();
  }
  // grain over everything
  const gc = document.createElement('canvas'); gc.width = 128; gc.height = 128;
  gc.getContext('2d').putImageData(grain(gc.getContext('2d'), 128, 128, 22), 0, 0);
  c.save(); c.globalCompositeOperation = 'overlay'; c.fillStyle = c.createPattern(gc, 'repeat');
  c.fillRect(OX - CS, OY - CS, CS * (R.W + 2), CS * (R.H + 2)); c.restore();
}

// walls are drawn in depth order with the characters (3/4 view: a front face and a paper top)
let LIGHTS = [];
// how lit a spot is (0..1) by the lanterns, ignoring occlusion: used for walls, doors and figures
function litAt(x, y) { let b = .12; for (const L of LIGHTS) { const d = Math.hypot(L.x - x, L.y - y); b = Math.max(b, (1 - d / (L.r * 1.25)) * L.a); } return clamp(b, 0, 1); }
function fillD(col, dk) { ctx.fillStyle = col; ctx.fill(); if (dk > .01) { ctx.fillStyle = `rgba(13,11,34,${dk})`; ctx.fill(); } }
function drawWall(x, y) {
  const X = OX + x * CS, Y = OY + (S.R.H - 1 - y) * CS, h = CS * WH, seed = x * 13 + y * 7;
  const dk = (1 - litAt(x + .5, y + .5)) * .48;
  const below = y > 0 && S.R.wall[(y - 1) * S.R.W + x];
  // front face (stacked paper sheets), hidden when the wall continues toward the viewer
  if (!below) {
    ctx.beginPath(); ctx.rect(X, Y + CS - h, CS, h); fillD(PAL.wallDeep, dk);
    for (let k = 0; k < 3; k++) {
      deckle(ctx, X + 1, Y + CS - h + k * h / 3, CS - 2, h / 3 - 1, seed + k, CS * .02); fillD(k % 2 ? PAL.wallFace : PAL.wallFace2, dk);
    }
  }
  // top: two stacked cream sheets, slightly offset (the cut-paper edge)
  deckle(ctx, X + 1, Y - h + 3, CS - 2, CS - 1, seed + 5, CS * .03); fillD(PAL.wallTop2, dk);
  deckle(ctx, X + 2, Y - h, CS - 4, CS - 4, seed + 9, CS * .03); fillD(PAL.wallTop, dk * .85);
  // a tiny cut pattern on the top sheet: the room's own motif (rows of small triangles)
  if ((x * 7 + y * 3) % 4 === 0) {
    ctx.fillStyle = 'rgba(108,95,196,.35)';
    for (let k = 0; k < 4; k++) {
      const px = X + CS * (.24 + k * .17), py = Y - h + CS * .5;
      ctx.beginPath(); ctx.moveTo(px, py - CS * .06); ctx.lineTo(px + CS * .06, py + CS * .05); ctx.lineTo(px - CS * .06, py + CS * .05); ctx.fill();
    }
  }
}

// ---------------- light: the lantern casts real shadows off the walls and closed doors ----------------
function segments(openDoors) {
  const R = S.R, segs = [], solid = (x, y) => x < 0 || y < 0 || x >= R.W || y >= R.H ? false : (R.wall[y * R.W + x] === 1 || closedDoorAt(x, y, openDoors));
  for (let y = 0; y < R.H; y++) for (let x = 0; x < R.W; x++) {
    if (!solid(x, y)) continue;
    if (!solid(x, y - 1)) segs.push([x, y, x + 1, y]);
    if (!solid(x, y + 1)) segs.push([x, y + 1, x + 1, y + 1]);
    if (!solid(x - 1, y)) segs.push([x, y, x, y + 1]);
    if (!solid(x + 1, y)) segs.push([x + 1, y, x + 1, y + 1]);
  }
  segs.push([0, 0, R.W, 0], [R.W, 0, R.W, R.H], [R.W, R.H, 0, R.H], [0, R.H, 0, 0]);   // light stays on the board
  return segs;
}
function closedDoorAt(x, y, openDoors) { const i = E.doorAt(S.R, x, y); return i >= 0 && !openDoors[i]; }
function visibility(lx, ly, segs, rad) {
  const near = segs.filter(s => {
    const minx = Math.min(s[0], s[2]) - rad, maxx = Math.max(s[0], s[2]) + rad, miny = Math.min(s[1], s[3]) - rad, maxy = Math.max(s[1], s[3]) + rad;
    return lx > minx && lx < maxx && ly > miny && ly < maxy;
  });
  near.push([lx - rad, ly - rad, lx + rad, ly - rad], [lx + rad, ly - rad, lx + rad, ly + rad], [lx + rad, ly + rad, lx - rad, ly + rad], [lx - rad, ly + rad, lx - rad, ly - rad]);
  const angles = [];
  for (const s of near) for (const [px, py] of [[s[0], s[1]], [s[2], s[3]]]) {
    const a = Math.atan2(py - ly, px - lx); angles.push(a - 1e-4, a, a + 1e-4);
  }
  const pts = [];
  for (const a of angles) {
    const dx = Math.cos(a), dy = Math.sin(a); let best = Infinity;
    for (const s of near) {
      const ex = s[2] - s[0], ey = s[3] - s[1], den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((s[0] - lx) * ey - (s[1] - ly) * ex) / den, u = ((s[0] - lx) * dy - (s[1] - ly) * dx) / den;
      if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
    }
    if (best < Infinity) pts.push([a, lx + dx * best, ly + dy * best]);
  }
  pts.sort((p, q) => p[0] - q[0]);
  return pts;
}
// board coordinates (cells, y up, continuous) -> screen
const bx = x => OX + x * CS, by = y => OY + (S.R.H - y) * CS;

function drawLights(lights, openDoors) {
  const k = .5 * DPR, segs = segments(openDoors);
  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.globalCompositeOperation = 'source-over';
  lctx.clearRect(0, 0, light.width, light.height);
  lctx.fillStyle = PAL.night + '.74)'; lctx.fillRect(0, 0, light.width, light.height);
  lctx.globalCompositeOperation = 'destination-out';
  for (const L of lights) {
    const poly = visibility(L.x, L.y, segs, L.r);
    lctx.save();
    lctx.beginPath();
    poly.forEach(([, px, py], i) => { const X = bx(px) * k, Y = by(py) * k; i ? lctx.lineTo(X, Y) : lctx.moveTo(X, Y); });
    lctx.closePath(); lctx.clip();
    const gx = bx(L.x) * k, gy = by(L.y) * k, gr = L.r * CS * k;
    const g = lctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
    g.addColorStop(0, `rgba(0,0,0,${L.a})`); g.addColorStop(.55, `rgba(0,0,0,${L.a * .55})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = g; lctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    lctx.restore();
    L.poly = poly;
  }
  // soft ambient so walls in shadow still read as paper
  lctx.fillStyle = 'rgba(0,0,0,.18)'; lctx.fillRect(0, 0, light.width, light.height);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(light, 0, 0, cv.width, cv.height); ctx.restore();
  // coloured warmth inside each light
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const L of lights) {
    if (!L.poly) continue;
    ctx.save(); ctx.beginPath();
    L.poly.forEach(([, px, py], i) => { i ? ctx.lineTo(bx(px), by(py)) : ctx.moveTo(bx(px), by(py)); });
    ctx.closePath(); ctx.clip();
    const gx = bx(L.x), gy = by(L.y), gr = L.r * CS * .8;
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
    g.addColorStop(0, L.tint); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    ctx.restore();
  }
  ctx.restore();
}

// ---------------- characters ----------------
// The hero: a small paper figure in a hooded cloak with a lantern on a crook and a scarf that trails.
// Echoes are the same figure in blue tracing paper, eyes closed: memories walking in their sleep.
let ents = [];
function makeEnt(i, p, ghost) {
  return { i, ghost, x: p.x, y: p.y, fx: p.x, fy: p.y, tx: p.x, ty: p.y, t: 1, dur: TICK, face: 'D', walkPh: 0, moving: false,
    bump: null, expr: 'calm', exprT: 0, blink: 2 + Math.random() * 3, blinkT: 0, sway: 0, swayV: 0, jump: 0, pop: ghost ? 0 : 1,
    scarf: Array.from({ length: 6 }, () => ({ x: p.x, y: p.y, px: p.x, py: p.y })) };
}
function spawnEnts() {
  const pos = cur();
  ents = pos.map((p, i) => makeEnt(i, p, i < pos.length - 1));
  ents.forEach(e => (e.pop = 1));
  spread(pos, true);
}
// several on one cell (every loop starts that way): echoes stand around the hero, not inside him
function spread(pos, snap) {
  const groups = {};
  pos.forEach((p, i) => (groups[p.x + ',' + p.y] = groups[p.x + ',' + p.y] || []).push(i));
  const hero = pos.length - 1;
  pos.forEach((p, i) => { ents[i].ox = 0; ents[i].oy = 0; });
  for (const g of Object.values(groups)) {
    if (g.length < 2) continue;
    let ring = g.filter(i => i !== hero); if (!g.includes(hero)) ring = ring.slice(1);
    ring.forEach((i, j) => { const a = Math.PI * 2 * j / ring.length + Math.PI * .75; ents[i].ox = Math.cos(a) * .26; ents[i].oy = Math.sin(a) * .2; });
  }
  if (snap) ents.forEach((e, i) => { e.x = e.fx = e.tx = pos[i].x + e.ox; e.y = e.fy = e.ty = pos[i].y + e.oy; e.t = 1; });
}
function setExpr(e, x, t) { e.expr = x; e.exprT = t; }

function drawEnt(e, T) {
  const X = bx(e.x + .5), Y = by(e.y + .5) + CS * .18, s = CS * .0105 * (0.6 + 0.4 * e.pop);
  const bob = e.moving ? Math.abs(Math.sin(e.walkPh)) * 2.2 : Math.sin(T * 2.2 + e.i) * .6;
  const lift = e.jump * 14;
  ctx.save();
  ctx.translate(X + (e.bumpOff || 0) * CS, Y - lift);
  ctx.scale(s, s);
  const flip = e.face === 'L' ? -1 : 1;
  const back = e.face === 'U';
  const ghost = e.ghost, col = ghost ? PAL.echo : null;
  ctx.globalAlpha = ghost ? .62 : 1;
  // floor shadow (stays on the floor when jumping)
  ctx.save(); ctx.translate(0, lift / s); ctx.fillStyle = 'rgba(5,4,18,.45)';
  ctx.beginPath(); ctx.ellipse(0, 4, 22 - e.jump * 6, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.translate(0, -bob);
  // legs
  const lp = e.moving ? Math.sin(e.walkPh) * 6 : 0;
  ctx.fillStyle = ghost ? 'rgba(143,216,255,.8)' : '#1b1840';
  ctx.beginPath(); ctx.roundRect(-10 + lp * .5, -8, 8, 12 + Math.max(0, lp) * .3, 4); ctx.fill();
  ctx.beginPath(); ctx.roundRect(2 - lp * .5, -8, 8, 12 + Math.max(0, -lp) * .3, 4); ctx.fill();
  // scarf (drawn behind the cloak when facing us)
  const scarfPts = e.scarf.map(p => [(p.x - e.x) * CS / s, -(p.y - e.y) * CS / s]);
  const drawScarf = () => {
    ctx.strokeStyle = ghost ? 'rgba(190,235,255,.85)' : PAL.scarf; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(0, -42);
    scarfPts.forEach(([px, py], k) => ctx.lineTo(px * .9, -42 + py * .9 + k * 2.5));
    ctx.stroke();
  };
  if (!back) drawScarf();
  // cloak: a bell of folded paper
  ctx.save(); ctx.scale(flip, 1);
  const sw = e.sway * 4;
  ctx.fillStyle = ghost ? 'rgba(143,216,255,.55)' : PAL.cloak;
  ctx.beginPath();
  ctx.moveTo(-8, -50); ctx.quadraticCurveTo(-26 + sw, -20, -24 + sw, -4); ctx.lineTo(24 + sw, -4); ctx.quadraticCurveTo(26 + sw, -20, 8, -50); ctx.closePath(); ctx.fill();
  ctx.fillStyle = ghost ? 'rgba(220,245,255,.5)' : PAL.cloakHi;   // one fold, lit side
  ctx.beginPath(); ctx.moveTo(4, -48); ctx.quadraticCurveTo(14 + sw, -22, 16 + sw, -4); ctx.lineTo(24 + sw, -4); ctx.quadraticCurveTo(24 + sw, -22, 8, -50); ctx.fill();
  // hood + face
  ctx.fillStyle = ghost ? 'rgba(143,216,255,.7)' : PAL.cloak;
  ctx.beginPath(); ctx.ellipse(0, -60, 21, 20, 0, 0, Math.PI * 2); ctx.fill();
  // hood tip, flopping with motion
  ctx.beginPath(); ctx.moveTo(-6, -77); ctx.quadraticCurveTo(10 - sw * 2, -96, 22 - sw * 3, -88); ctx.quadraticCurveTo(12, -80, 8, -74); ctx.fill();
  if (!back) {
    ctx.fillStyle = ghost ? 'rgba(235,250,255,.85)' : PAL.face;
    const fx = e.face === 'R' || e.face === 'L' ? 4 : 0;
    ctx.beginPath(); ctx.ellipse(fx, -58, 14, 13, 0, 0, Math.PI * 2); ctx.fill();
    drawFace(e, fx, ghost);
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -78); ctx.quadraticCurveTo(-2, -60, 0, -44); ctx.stroke();
  }
  ctx.restore();
  if (back) drawScarf();
  // lantern on a crook, swinging like a pendulum
  const hand = [flip * 18, -30], top = [flip * 26, -70], swing = e.swing || 0;
  ctx.strokeStyle = ghost ? 'rgba(190,235,255,.8)' : '#c9a36a'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(hand[0], hand[1] + 14); ctx.lineTo(top[0], top[1]); ctx.quadraticCurveTo(top[0] + flip * 10, top[1] - 6, top[0] + flip * 12, top[1] + 4); ctx.stroke();
  const lx = top[0] + flip * 12 + Math.sin(swing) * 10, ly = top[1] + 14 + Math.cos(swing) * 2;
  ctx.beginPath(); ctx.moveTo(top[0] + flip * 12, top[1] + 4); ctx.lineTo(lx, ly - 6); ctx.stroke();
  const glow = ghost ? PAL.echo : PAL.lantern, flick = .85 + Math.sin(T * 17 + e.i) * .06 + Math.sin(T * 7.3) * .05;
  const gg = ctx.createRadialGradient(lx, ly + 4, 0, lx, ly + 4, 34);
  gg.addColorStop(0, ghost ? 'rgba(143,216,255,.55)' : `rgba(255,190,90,${.65 * flick})`); gg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(lx, ly + 4, 34, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#2b2050'; ctx.beginPath(); ctx.roundRect(lx - 7, ly - 6, 14, 3, 1.5); ctx.fill();
  ctx.fillStyle = glow; ctx.beginPath();   // the lamp body: a little paper lantern
  ctx.moveTo(lx - 7, ly - 3); ctx.quadraticCurveTo(lx - 10, ly + 5, lx - 6, ly + 13); ctx.lineTo(lx + 6, ly + 13); ctx.quadraticCurveTo(lx + 10, ly + 5, lx + 7, ly - 3); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.ellipse(lx, ly + 5, 2.4, 4 * flick, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}
function drawFace(e, fx, ghost) {
  const ink = ghost ? 'rgba(40,90,140,.9)' : PAL.ink;
  const look = e.face === 'R' || e.face === 'L' ? 3 : 0;
  const ex = [fx - 5.5 + look, fx + 5.5 + look], ey = -59;
  ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 2; ctx.lineCap = 'round';
  const blink = e.blinkT > 0;
  const x = e.expr;
  if (ghost || x === 'sleep') {          // echoes walk with closed eyes
    for (const X of ex) { ctx.beginPath(); ctx.arc(X, ey, 3, .15 * Math.PI, .85 * Math.PI); ctx.stroke(); }
    return;
  }
  if (x === 'happy' || x === 'cheer') {
    for (const X of ex) { ctx.beginPath(); ctx.arc(X, ey + 1.5, 3.2, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke(); }
  } else if (blink) {
    for (const X of ex) { ctx.beginPath(); ctx.moveTo(X - 3, ey); ctx.lineTo(X + 3, ey); ctx.stroke(); }
  } else {
    const big = x === 'oops' ? 1.35 : 1;
    for (const X of ex) { ctx.beginPath(); ctx.ellipse(X, ey, 2.6 * big, 3.4 * big, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#fff';
    for (const X of ex) { ctx.beginPath(); ctx.arc(X + .9, ey - 1.2, .9, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = ink;
  }
  // brows: worried when time runs short
  if (x === 'worry') {
    ctx.beginPath(); ctx.moveTo(ex[0] - 3, ey - 7); ctx.lineTo(ex[0] + 2.5, ey - 5.5); ctx.moveTo(ex[1] + 3, ey - 7); ctx.lineTo(ex[1] - 2.5, ey - 5.5); ctx.stroke();
  }
  // mouth
  ctx.beginPath();
  if (x === 'oops') ctx.ellipse(fx + look, -50, 2.4, 3, 0, 0, Math.PI * 2), ctx.fill();
  else if (x === 'cheer') { ctx.ellipse(fx + look, -51, 4, 3.4, 0, 0, Math.PI); ctx.fill(); }
  else if (x === 'happy') { ctx.arc(fx + look, -52.5, 3.6, .15 * Math.PI, .85 * Math.PI); ctx.stroke(); }
  else if (x === 'worry') { ctx.arc(fx + look, -48.5, 3, 1.2 * Math.PI, 1.8 * Math.PI); ctx.stroke(); }
  else { ctx.arc(fx + look, -52, 2.4, .2 * Math.PI, .8 * Math.PI); ctx.stroke(); }
  // cheeks
  ctx.fillStyle = 'rgba(255,120,110,.35)';
  ctx.beginPath(); ctx.arc(ex[0] - 2, ey + 5, 2.4, 0, Math.PI * 2); ctx.arc(ex[1] + 2, ey + 5, 2.4, 0, Math.PI * 2); ctx.fill();
}

function updEnt(e, dt, T) {
  if (e.t < 1) {
    e.t = Math.min(1, e.t + dt * 1000 / e.dur);
    const k = ease(e.t);
    e.x = lerp(e.fx, e.tx, k); e.y = lerp(e.fy, e.ty, k);
    e.moving = Math.hypot(e.tx - e.fx, e.ty - e.fy) > .3;
    if (e.moving) e.walkPh += dt * 18;
    e.bumpOff = e.bump ? Math.sin(e.t * Math.PI) * .12 * e.bump : 0;
    if (e.t >= 1) { e.moving = false; e.bumpOff = 0; e.bump = null; }
  } else e.still = (e.still || 0) + dt;
  // lantern pendulum and cloak sway respond to motion
  const vx = e.moving ? (e.tx - e.fx) : 0;
  e.swayV += (-vx * .9 - e.sway) * dt * 14; e.swayV *= .86; e.sway += e.swayV * dt * 10;
  e.swing = (e.swing || 0) * .92 + (-vx * .5 - (e.swing || 0)) * dt * 6 + Math.sin(T * 1.6 + e.i) * .004;
  // scarf: a short chain pulled toward the neck, trailing behind the motion
  const sc = e.scarf; sc[0].x = e.x; sc[0].y = e.y + .02;
  for (let k = 1; k < sc.length; k++) {
    const p = sc[k], q = sc[k - 1];
    const nx = p.x + (p.x - p.px) * .82 + Math.sin(T * 3 + k + e.i) * .0015, ny = p.y + (p.y - p.py) * .82 - .0012;
    p.px = p.x; p.py = p.y; p.x = nx; p.y = ny;
    const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) || 1e-6, L = .07;
    if (d > L) { p.x = q.x + dx / d * L; p.y = q.y + dy / d * L; }
  }
  e.blink -= dt; if (e.blink < 0) { e.blinkT = .12; e.blink = 2.5 + Math.random() * 3.5; }
  if (e.blinkT > 0) e.blinkT -= dt;
  if (e.exprT > 0) { e.exprT -= dt; if (e.exprT <= 0) e.expr = 'calm'; }
  if (e.jump > 0 || e.jumpV) { e.jumpV = (e.jumpV || 0) - dt * 9; e.jump = Math.max(0, e.jump + e.jumpV * dt * 6); if (e.jump === 0) e.jumpV = 0; }
  // idle life: the hero glances at you after standing still for a while
  if (!e.ghost && e.t >= 1 && e.still > 2.6 && Math.floor(e.still) % 6 < 2) e.face = 'D';
}

// ---------------- doors, plates, exit ----------------
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
function drawDoor(i, T) {
  const d = S.R.doors[i], f = doorFx[i], G = GLYPH[i % 4];
  const X = OX + d.x * CS, Y = OY + (S.R.H - 1 - d.y) * CS, h = CS * WH;
  // posts: the wall continues on both sides as two narrow paper pillars
  const dk = (1 - litAt(d.x + .5, d.y + .5)) * .48;
  for (const px of [X + 1, X + CS - CS * .16 - 1]) { deckle(ctx, px, Y - h, CS * .16, CS + h - 2, i * 3 + px, CS * .02); fillD(PAL.wallTop2, dk); }
  // the panel: a sheet with the door's glyph cut through it, lit from behind in its colour
  const open = f.open, ph = (CS + h - 6) * (1 - open);
  if (ph > 1) {
    ctx.save();
    ctx.beginPath(); ctx.rect(X + CS * .16, Y + CS - ph - 2, CS * .68, ph); ctx.clip();
    ctx.fillStyle = '#2b2466'; ctx.fillRect(X + CS * .16, Y + CS - ph - 2, CS * .68, ph);
    // folds (the sheet concertinas down when it opens)
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
    for (let k = 1; k < 5; k++) { const yy = Y + CS - 2 - ph * k / 5; ctx.beginPath(); ctx.moveTo(X + CS * .16, yy); ctx.lineTo(X + CS * .84, yy); ctx.stroke(); }
    ctx.translate(X + CS / 2, Y + CS - ph * .55 - 2);
    const pulse = .65 + .25 * Math.sin(T * 2.4 + i) + f.lit * .4 + f.flash;
    ctx.shadowColor = G.c; ctx.shadowBlur = CS * .25 * pulse;
    ctx.fillStyle = G.c; ctx.globalAlpha = clamp(.55 + pulse * .35, 0, 1);
    glyphPath(ctx, i, CS * .17);
    if (d.kind === 'inverse') { ctx.lineWidth = CS * .045; ctx.strokeStyle = G.c; ctx.stroke(); } else ctx.fill();
    ctx.restore();
  }
  // timed doors: three pips that count the open ticks down
  if (d.kind === 'timed') {
    const tm = (cur().timers || [])[i] || 0, held = plateHeld(i);
    for (let k = 0; k < 3; k++) {
      const on = held || k < tm;
      ctx.fillStyle = on ? G.c : 'rgba(239,226,200,.25)';
      ctx.beginPath(); ctx.arc(X + CS * (.32 + k * .18), Y - h - CS * .1, CS * .045, 0, Math.PI * 2); ctx.fill();
    }
  }
  // lintel
  deckle(ctx, X + 1, Y - h - 1, CS - 2, CS * .2, i * 11 + 3, CS * .02); fillD(PAL.wallTop, dk * .85);
  if (f.flash > 0) f.flash = Math.max(0, f.flash - .04);
}
function plateHeld(i) {
  const pos = cur();
  return S.R.plates.some(p => p.door === i && (pos.some(e => e.x === p.x && e.y === p.y) || (S.R.pinned || []).some(e => e.x === p.x && e.y === p.y)));
}
function drawPlate(j, T) {
  const p = S.R.plates[j], f = plateFx[j], G = GLYPH[p.door % 4], inv = S.R.doors[p.door].kind === 'inverse';
  const X = sx(p.x), Y = sy(p.y), r = CS * .33;
  ctx.save(); ctx.translate(X, Y + f.on * 2);
  // medallion: stacked discs of paper
  ctx.fillStyle = '#1b1745'; ctx.beginPath(); ctx.ellipse(0, 3, r * 1.05, r * .95, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = f.on > .5 ? '#2a2360' : '#3a3378'; ctx.beginPath(); ctx.ellipse(0, 0, r, r * .9, 0, 0, Math.PI * 2); ctx.fill();
  const glow = .45 + f.on * .55 + (f.hover || 0) * .3 + .1 * Math.sin(T * 3 + j);
  ctx.shadowColor = G.c; ctx.shadowBlur = CS * .2 * glow;
  ctx.strokeStyle = G.c; ctx.globalAlpha = clamp(glow, 0, 1); ctx.lineWidth = CS * .035;
  ctx.beginPath(); ctx.ellipse(0, 0, r * .78, r * .7, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.scale(1, .9);
  glyphPath(ctx, p.door, r * .38);
  if (inv) { ctx.lineWidth = CS * .03; ctx.stroke(); } else { ctx.fillStyle = G.c; ctx.fill(); }
  ctx.restore();
  // a pinned helper: a small paper statue holding the plate
  if ((S.R.pinned || []).some(e => e.x === p.x && e.y === p.y)) drawStatue(X, Y);
}
function drawStatue(X, Y) {
  ctx.save(); ctx.translate(X, Y + CS * .1); const s = CS * .0105; ctx.scale(s, s);
  ctx.fillStyle = '#b9ad94';
  ctx.beginPath(); ctx.moveTo(-18, -2); ctx.quadraticCurveTo(-20, -30, -8, -46); ctx.lineTo(8, -46); ctx.quadraticCurveTo(20, -30, 18, -2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, -56, 15, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#7d735f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-5, -57, 2.6, .15 * Math.PI, .85 * Math.PI); ctx.arc(5, -57, 2.6, .15 * Math.PI, .85 * Math.PI); ctx.stroke();
  ctx.restore();
}
function drawExit(T) {
  const e = S.R.exit, X = sx(e.x), Y = sy(e.y);
  const near = S.nearExit || 0;
  ctx.save(); ctx.translate(X, Y);
  // a round window cut into the floor (qamariya): glowing rings and a rising beam
  const r = CS * .4;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.6);
  g.addColorStop(0, `rgba(255,215,140,${.55 + near * .3})`); g.addColorStop(1, 'rgba(255,181,71,0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = PAL.lantern; ctx.lineWidth = CS * .04;
  ctx.save(); ctx.rotate(T * (.4 + near));
  ctx.setLineDash([CS * .09, CS * .06]); ctx.beginPath(); ctx.ellipse(0, 0, r, r * .88, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore(); ctx.setLineDash([]);
  ctx.fillStyle = '#fff3d6'; ctx.beginPath(); ctx.ellipse(0, 0, r * .45, r * .4, 0, 0, Math.PI * 2); ctx.fill();
  // eight-point star cut into the centre
  ctx.fillStyle = '#ffcf7a'; ctx.beginPath();
  for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8 + T * .3, rr = k % 2 ? r * .16 : r * .32; k ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * .9) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr * .9); }
  ctx.fill();
  // motes rising
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 7; k++) {
    const ph = (T * .35 + k / 7) % 1, a = k * 2.4;
    ctx.fillStyle = `rgba(255,200,110,${(1 - ph) * .8})`;
    ctx.beginPath(); ctx.arc(Math.cos(a) * r * .5, -ph * CS * 1.1, CS * .025 * (1 - ph * .5), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---------------- hint footprints, link arcs, tick lanterns ----------------
let hint = null;  // {cells:[{x,y,t}], until}
let hover = -1;   // door index under the finger (shows which plate opens it)
function drawHint(T) {
  if (!hint) return;
  if (performance.now() > hint.until) { hint = null; return; }
  ctx.save(); ctx.font = `600 ${Math.round(CS * .26)}px ${getComputedStyle(document.body).getPropertyValue('--ui') || 'sans-serif'}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  hint.cells.forEach((c, k) => {
    const X = sx(c.x), Y = sy(c.y), a = .55 + .35 * Math.sin(T * 4 - k * .5);
    ctx.fillStyle = `rgba(255,211,138,${a * .35})`; ctx.beginPath(); ctx.arc(X, Y, CS * .22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,226,170,${a})`; ctx.fillText(AR(c.t), X, Y + 1);
  });
  ctx.restore();
}
function drawLink(T) {
  if (hover < 0) return;
  const d = S.R.doors[hover], G = GLYPH[hover % 4];
  ctx.save(); ctx.fillStyle = G.c; ctx.shadowColor = G.c; ctx.shadowBlur = 8;
  for (const p of S.R.plates) {
    if (p.door !== hover) continue;
    const ax = sx(p.x), ay = sy(p.y), cx = sx(d.x), cy = sy(d.y) - CS * .3, n = 14;
    for (let k = 0; k < n; k++) {
      const t = (k + (T * 1.4) % 1) / n, X = lerp(ax, cx, t), Y = lerp(ay, cy, t) - Math.sin(t * Math.PI) * CS * .9;
      ctx.beginPath(); ctx.arc(X, Y, CS * .04 * (.6 + .4 * Math.sin(t * Math.PI)), 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}
function drawTicks(T) {
  const R = S.R, n = R.L, done = S.acts.length, w = Math.min(VW - 120, n * 22), y = VH - 26, x0 = (VW - w) / 2;
  for (let k = 0; k < n; k++) {
    const X = x0 + w * (k + .5) / n, left = n - done, past = k < done;
    const warn = !past && left <= 3;
    ctx.save(); ctx.translate(X, y);
    if (!past) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 10); g.addColorStop(0, warn ? 'rgba(255,110,90,.6)' : 'rgba(255,181,71,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = past ? 'rgba(239,226,200,.18)' : warn ? '#ff8a6e' : '#ffcf7a';
    ctx.beginPath(); ctx.moveTo(-3.5, -4); ctx.quadraticCurveTo(-5, 1, -3, 5); ctx.lineTo(3, 5); ctx.quadraticCurveTo(5, 1, 3.5, -4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // echo slots: small masks, filled as loops are recorded
  for (let k = 0; k < R.E; k++) {
    const X = x0 + w + 22 + k * 20, Y = y;
    ctx.save(); ctx.translate(VW - X, Y);   // RTL: masks sit to the left of the lanterns
    ctx.fillStyle = k < S.echoes.length ? PAL.echo : 'transparent'; ctx.strokeStyle = PAL.echo; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, 0, 7, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = k < S.echoes.length ? '#204a6a' : PAL.echo;
    ctx.beginPath(); ctx.arc(-2.6, -1, 1.6, .15 * Math.PI, .85 * Math.PI); ctx.arc(2.6, -1, 1.6, .15 * Math.PI, .85 * Math.PI); ctx.stroke();
    ctx.restore();
  }
}

// ---------------- particles (paper confetti on win, dust on bumps) ----------------
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
    ctx.fillRect(-p.s, -p.s * .6, p.s * 2, p.s * 1.2); ctx.restore();
  }
}

// ---------------- sound: calm night, soft paper and chimes ----------------
let AC = null, master = null;
function audioStart() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = .5; master.connect(AC.destination);
    // a quiet drone: two low sines a fifth apart, breathing through a slow filter
    const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = .4;
    const g = AC.createGain(); g.gain.value = .045; f.connect(g); g.connect(master);
    for (const [hz, det] of [[110, 0], [164.8, 3], [220, -4]]) { const o = AC.createOscillator(); o.type = 'sine'; o.frequency.value = hz; o.detune.value = det; o.connect(f); o.start(); }
    const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = .07; lg.gain.value = 220; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
  } catch (e) { AC = null; }
}
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];
function tone(semi, dur, vol, type = 'sine', delay = 0) {
  if (!AC) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.value = 440 * Math.pow(2, (semi - 9) / 12);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
}
function paper(vol = .05) {   // a soft rustle: filtered noise
  if (!AC) return;
  const len = .09, b = AC.createBuffer(1, AC.sampleRate * len, AC.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = .8; g.gain.value = vol;
  s.buffer = b; s.connect(f); f.connect(g); g.connect(master); s.start();
}
const SFX = {
  step: t => { paper(.035); tone(SCALE[t % SCALE.length] + 12, .25, .025); },
  wait: () => tone(7, .3, .03),
  bump: () => { tone(-12, .18, .06, 'triangle'); paper(.08); },
  door: open => { tone(open ? 16 : 9, .7, .04); tone(open ? 23 : 4, .9, .025, 'sine', .06); },
  plate: () => tone(19, .5, .035),
  echo: () => { [12, 16, 19, 24].forEach((s, k) => tone(s, 1.2, .03, 'sine', k * .07)); },
  rewind: () => { for (let k = 0; k < 5; k++) tone(24 - k * 3, .2, .02, 'sine', k * .04); },
  win: () => { [0, 4, 7, 12, 16, 19, 24].forEach((s, k) => tone(s + 12, 1.4, .035, 'sine', k * .08)); },
  hint: () => tone(21, .8, .03),
};
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

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
    burst(bx(hero.x + .5 + d[0] * .4), by(hero.y + .5 + d[1] * .4), ['#efe2c8', '#8d86b8'], 6, 120);
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
  burst(sx(S.R.exit.x), sy(S.R.exit.y), ['#ffb547', '#efe2c8', '#ff6fae', '#7cf0b5', '#8fd8ff'], 40, 260);
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

// ---------------- frame ----------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; const T = now / 1000;
  if (!S.R || !staticLayer) { requestAnimationFrame(frame); return; }
  ents.forEach(e => { updEnt(e, dt, T); if (e.pop < 1) e.pop = Math.min(1, e.pop + dt * 3); });
  doorFx.forEach(f => { f.open += ((f.target || 0) - f.open) * Math.min(1, dt * 9); f.lit += (((hover >= 0 && doorFx[hover] === f) ? 1 : 0) - f.lit) * Math.min(1, dt * 6); });
  plateFx.forEach((f, j) => { f.on += ((f.target || 0) - f.on) * Math.min(1, dt * 12); f.hover = hover >= 0 && S.R.plates[j].door === hover ? 1 : 0; });
  const heroE = ents[ents.length - 1];
  S.nearExit = heroE ? clamp(1 - (Math.hypot(heroE.x - S.R.exit.x, heroE.y - S.R.exit.y) - 1) / 3, 0, 1) : 0;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#151330'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // room entrance: the paper sheet slides up into place
  const ent = clamp((now - (S.enterT || 0)) / 600, 0, 1), out = S.transT ? clamp((now - S.transT) / 380, 0, 1) : 0;
  if (ent >= 1 && S.transT && !S.won) S.transT = 0;
  const slide = (1 - ease(ent)) * 40 + ease(out) * -40;
  ctx.globalAlpha = Math.min(ease(ent), 1 - out);
  ctx.translate(0, slide);
  ctx.drawImage(staticLayer, 0, 0, cv.width / DPR, cv.height / DPR);

  // lights: the hero's lantern, the echoes' pale lanterns, the exit, lit plates
  const open = E.doorStates(S.R, cur()), lights = [];
  ents.forEach(e => lights.push({ x: e.x + .5, y: e.y + .55, r: e.ghost ? 2.3 : 3.6 + Math.sin(T * 9) * .04, a: e.ghost ? .7 : 1, tint: e.ghost ? 'rgba(80,150,220,.16)' : 'rgba(255,160,60,.22)' }));
  lights.push({ x: S.R.exit.x + .5, y: S.R.exit.y + .5, r: 2.2 + S.nearExit * .8, a: .85, tint: 'rgba(255,190,90,.14)' });
  S.R.plates.forEach((p, j) => { if (plateFx[j].on > .3) lights.push({ x: p.x + .5, y: p.y + .5, r: 1.3, a: .6 * plateFx[j].on, tint: 'rgba(255,255,255,.0)' }); });
  LIGHTS = lights;
  // floor shadows: cast by walls and closed doors (on the floor plane, under everything standing)
  drawLights(lights, open);
  drawExit(T);
  S.R.plates.forEach((p, j) => drawPlate(j, T));
  drawHint(T);
  // depth-sorted: far rows first; walls, doors and characters interleave (3/4 view)
  const items = [];
  for (let y = 0; y < S.R.H; y++) for (let x = 0; x < S.R.W; x++) if (S.R.wall[y * S.R.W + x]) items.push({ d: y + .02, f: () => drawWall(x, y) });
  S.R.doors.forEach((d, i) => items.push({ d: d.y + .02, f: () => drawDoor(i, T) }));
  ents.forEach(e => items.push({ d: e.y, f: () => drawEnt(e, T) }));
  items.sort((a, b) => b.d - a.d).forEach(it => it.f());
  drawLink(T);
  drawParts(dt);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (S.rewindK) { ctx.fillStyle = `rgba(143,216,255,${Math.sin(S.rewindK * Math.PI) * .08})`; ctx.fillRect(0, 0, VW, VH); }
  drawTicks(T);
  requestAnimationFrame(frame);
}

// test hook (used by the automated play test; harmless for players)
window.__sada = { S, doAction, loadRoom, cur, get ents() { return ents; }, startDemo, showHint };

load();
window.addEventListener('resize', resize);
loadRoom(S.n);
resize();
requestAnimationFrame(frame);
})();

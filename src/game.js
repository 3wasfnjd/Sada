import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const E = window.EchoLogic;
const $ = id => document.getElementById(id);
const AR = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[+d]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOutBack = k => { const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const TICK = 165;            // ms per tick
const MAX_ECHOES = 5;
const START_SAND = 6, MAX_SAND = 15;

// door / plate glyphs: colour + shape (never colour alone)
const GLYPH = [
  { color: 0xffb547, seg: 32, rot: 0 },          // circle
  { color: 0xff6fae, seg: 3, rot: Math.PI / 2 },  // triangle
  { color: 0x7cf0b5, seg: 4, rot: Math.PI / 4 },  // square
  { color: 0xb79bff, seg: 4, rot: 0 },            // diamond
];
const ECHO_COLS = [0x8fd8ff, 0x86b7ff, 0x9ff0e6, 0xb9a6ff, 0xd6f6ff];

// ---------------- renderer & scene ----------------
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
scene.add(new THREE.HemisphereLight(0xa9b6ff, 0x3a2a35, 1.15));
const sun = new THREE.DirectionalLight(0xffd6a0, 2.5);
sun.position.set(-4, 10, 6); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 });
scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight(0x6f8cff, 0.9); rim.position.set(6, 5, -8); scene.add(rim);

// ---------------- procedural textures ----------------
function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const rnd = Math.random;
const TEX = {
  glow: canvasTex(64, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.3, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); }),
  beam: canvasTex(64, (g, s) => { const r = g.createLinearGradient(0, s, 0, 0); r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(.5, 'rgba(255,255,255,.25)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); }),
  tile: canvasTex(128, (g, s) => {
    g.fillStyle = '#efe2cc'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rnd() < .5 ? '120,90,60' : '255,250,240'},${rnd() * .18})`; g.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2, 1 + rnd() * 2); }
    g.strokeStyle = 'rgba(110,80,50,.35)'; g.lineWidth = 3; g.strokeRect(14, 14, s - 28, s - 28);
    g.strokeStyle = 'rgba(255,248,235,.5)'; g.lineWidth = 1.5; g.strokeRect(17, 17, s - 34, s - 34);
    g.strokeStyle = 'rgba(70,50,30,.4)'; g.lineWidth = 4; g.strokeRect(0, 0, s, s);
  }),
  wall: canvasTex(128, (g, s) => {
    g.fillStyle = '#d8d0e8'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(40,30,60,${rnd() * .15})`; g.fillRect(rnd() * s, rnd() * s, 2, 2); }
    g.strokeStyle = 'rgba(40,28,70,.45)'; g.lineWidth = 2.5;
    for (let r = 0; r < 4; r++) { const y = r * s / 4; g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); const off = r % 2 ? s / 4 : 0; for (let x = off; x < s; x += s / 2) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + s / 4); g.stroke(); } }
  }),
};
function glowSprite(color, size, opacity = 1) {
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity }));
  m.scale.set(size, size, 1); return m;
}

// ---------------- shared geometry / materials ----------------
const G = {
  tile: new THREE.BoxGeometry(0.96, 0.5, 0.96),
  wall: new THREE.BoxGeometry(1, 0.95, 1),
  cap: new THREE.BoxGeometry(1.04, 0.08, 1.04),
  dot: new THREE.CircleGeometry(0.075, 16).rotateX(-Math.PI / 2),
  foot: new THREE.CircleGeometry(0.11, 18).rotateX(-Math.PI / 2),
  blob: new THREE.CircleGeometry(0.26, 24).rotateX(-Math.PI / 2),
  ring: new THREE.RingGeometry(0.3, 0.36, 40).rotateX(-Math.PI / 2),
};
const M = {
  tile: new THREE.MeshStandardMaterial({ map: TEX.tile, roughness: .85 }),
  wall: new THREE.MeshStandardMaterial({ map: TEX.wall, color: 0x5d4d82, roughness: .9 }),
  cap: new THREE.MeshStandardMaterial({ color: 0x8c7bb5, roughness: .7 }),
  base: new THREE.MeshStandardMaterial({ color: 0x2a2346, roughness: 1 }),
  door: new THREE.MeshStandardMaterial({ map: TEX.wall, color: 0x43365f, roughness: .8 }),
  plateBase: new THREE.MeshStandardMaterial({ color: 0x3a3150, roughness: .5, metalness: .4 }),
  blob: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .28, depthWrite: false }),
};

// ---------------- audio ----------------
const A = { ctx: null, master: null, rev: null, muted: false };
function audioInit() {
  if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor(); comp.connect(ctx.destination);
    const master = ctx.createGain(); master.gain.value = A.muted ? 0 : .85; master.connect(comp);
    const conv = ctx.createConvolver(); const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    conv.buffer = ir; const rg = ctx.createGain(); rg.gain.value = .32; conv.connect(rg); rg.connect(master);
    Object.assign(A, { ctx, master, rev: conv });
    // ambient pad
    const pad = ctx.createGain(); pad.gain.value = .035; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    pad.connect(lp); lp.connect(master); lp.connect(conv);
    [73.42, 110, 146.83].forEach((f, i) => { const o = ctx.createOscillator(); o.type = i === 1 ? 'triangle' : 'sine'; o.frequency.value = f; o.detune.value = (i - 1) * 6; o.connect(pad); o.start(); });
    const lfo = ctx.createOscillator(); lfo.frequency.value = .07; const lg = ctx.createGain(); lg.gain.value = .02; lfo.connect(lg); lg.connect(pad.gain); lfo.start();
  } catch (e) { A.ctx = null; }
}
function tone(f, delay = 0, dur = .3, type = 'sine', gain = .15, wet = true, attack = .005) {
  if (!A.ctx) return;
  const t = A.ctx.currentTime + delay, o = A.ctx.createOscillator(), g = A.ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(A.master); if (wet) g.connect(A.rev);
  o.start(t); o.stop(t + dur + .05); return o;
}
function noise(delay, dur, f0, f1, gain = .12, q = 2, rev = false) {
  if (!A.ctx) return;
  const ctx = A.ctx, t = ctx.currentTime + delay, len = Math.ceil(ctx.sampleRate * dur), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource(); s.buffer = b; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  if (rev) { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * .95); g.gain.linearRampToValueAtTime(0, t + dur); }
  else { g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur); }
  s.connect(bp); bp.connect(g); g.connect(A.master); g.connect(A.rev); s.start(t); s.stop(t + dur + .02);
}
const SCALE = [0, 2, 3, 7, 9];
const note = i => 293.66 * Math.pow(2, (SCALE[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5)) / 12);
const SFX = {
  tick(t, echoMoves, heroMoved) {
    if (heroMoved) { tone(note(t % 8), 0, .28, 'sine', .14); tone(note(t % 8) * 4, 0, .06, 'sine', .03, false); }
    echoMoves.forEach((m, j) => { if (m) tone(note((t % 8) + 2 + j * 2), .012 * (j + 1), .45, 'triangle', .07 * Math.pow(.75, j)); });
  },
  bump() { tone(98, 0, .12, 'triangle', .2, false); noise(0, .06, 400, 200, .06); },
  wait(t) { tone(note(t % 8) / 2, 0, .2, 'sine', .07); },
  plate(i, on) { if (on) { tone(note(10 + i * 2), 0, .7, 'triangle', .13); tone(note(12 + i * 2), .06, .7, 'sine', .07); } else tone(note(6 + i * 2), 0, .25, 'sine', .06); },
  door(open) { noise(0, .35, open ? 300 : 900, open ? 1200 : 200, .1, 1.2); tone(open ? 65 : 55, 0, .3, 'sine', .18, false); },
  warn() { tone(1568, 0, .08, 'square', .03, false); },
  rewind() {
    if (!A.ctx) return; const t = A.ctx.currentTime, o = A.ctx.createOscillator(), g = A.ctx.createGain(), lp = A.ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(70, t + .85);
    lp.type = 'lowpass'; lp.frequency.value = 1400; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.09, t + .2); g.gain.exponentialRampToValueAtTime(.0001, t + .9);
    o.connect(lp); lp.connect(g); g.connect(A.master); g.connect(A.rev); o.start(t); o.stop(t + 1);
    noise(0, .8, 600, 4000, .1, .8, true);
  },
  spawn() { tone(880, 0, 1.2, 'sine', .07, true, .15); tone(1318.5, .05, 1.2, 'sine', .05, true, .2); tone(note(0), 0, .9, 'triangle', .08); },
  win() { [0, 2, 4, 5, 7, 10].forEach((n, i) => tone(note(n + 5), i * .075, .9, 'triangle', .11)); tone(note(0) / 2, 0, 1.6, 'sine', .12); },
  over() { [4, 3, 1, 0].forEach((n, i) => tone(note(n), i * .22, 1, 'sine', .1)); },
  land() { tone(140, 0, .15, 'sine', .15, false); noise(0, .1, 800, 300, .05); },
};
function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { } }

// ---------------- characters ----------------
function makeChar(color, ghost) {
  const root = new THREE.Group(), inner = new THREE.Group(); root.add(inner);
  const mat = ghost
    ? new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .75, transparent: true, opacity: .52, depthWrite: false, roughness: .3 })
    : new THREE.MeshStandardMaterial({ color, roughness: .5, metalness: .2 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.2, 6, 16), mat); body.position.y = .3;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 28, 18), mat); head.position.y = .7;
  const eyeMat = ghost ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : new THREE.MeshStandardMaterial({ color: 0x1b1430, roughness: .2 });
  const eyes = new THREE.Group();
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), eyeMat); e.position.set(s * .075, .73, .175); e.scale.set(1, 1.25, .6); eyes.add(e); }
  const scarfMat = ghost ? mat : new THREE.MeshStandardMaterial({ color: 0xd9573b, roughness: .6 });
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.05, 8, 24), scarfMat); scarf.rotation.x = Math.PI / 2; scarf.position.y = .52;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(.08, .2, .04), scarfMat); tail.position.set(.1, .42, -.17); tail.rotation.z = .3;
  const tassel = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), ghost ? mat : new THREE.MeshStandardMaterial({ color: 0xffe2a6, emissive: 0xffb547, emissiveIntensity: .6 }));
  tassel.position.y = .95;
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .1, 6), mat); stalk.position.y = .89;
  inner.add(body, head, eyes, scarf, tail, stalk, tassel);
  const blob = new THREE.Mesh(G.blob, ghost ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .25, blending: THREE.AdditiveBlending, depthWrite: false }) : M.blob);
  blob.position.y = .012; root.add(blob);
  if (ghost) { const gl = glowSprite(color, 1.3, .35); gl.position.y = .5; root.add(gl); }
  else inner.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { root, inner, eyes, tail, ghost, yaw: 0, tyaw: 0, anim: null, blink: 2 + Math.random() * 3, land: 0, mat };
}

// ---------------- state ----------------
const S = {
  n: 1, runSeed: 1, R: null, echoes: [], acts: [], states: [],
  sand: START_SAND, best: 0, busy: false, walk: [], won: false, over: false, rewinding: false,
  ents: [], ghosts: [], hero: null, doors: [], plates: [], exitObj: null, firstMove: false, platePressedOnce: false,
};
try { S.best = +localStorage.getItem('sada-best') || 0; } catch (e) { }
$('bestStart').textContent = AR(S.best);

let roomGroup = null, rise = null, fx = [];
const cellV = (x, y, h = 0) => new THREE.Vector3(x - (S.R.W - 1) / 2, h, -(y - (S.R.H - 1) / 2));

// echo path dots + hint footprints
const dots = new THREE.InstancedMesh(G.dot, new THREE.MeshBasicMaterial({ transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending }), 400);
dots.count = 0; scene.add(dots);
const feet = new THREE.InstancedMesh(G.foot, new THREE.MeshBasicMaterial({ color: 0xffd38a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), 80);
feet.count = 0; scene.add(feet);
let hintT = 0;

function buildRoom() {
  if (roomGroup) { scene.remove(roomGroup); roomGroup.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); }
  const R = S.R; roomGroup = new THREE.Group(); scene.add(roomGroup);
  const items = []; // {kind:'inst', mesh, i, pos} | {kind:'obj', obj, y}
  const startCell = R.start;
  const delayOf = (x, y) => (Math.abs(x - startCell.x) + Math.abs(y - startCell.y)) * .035;

  const base = new THREE.Mesh(new THREE.BoxGeometry(R.W + .5, 1, R.H + .5), M.base); base.position.y = -1; base.receiveShadow = true;
  roomGroup.add(base); items.push({ kind: 'obj', obj: base, y: -1, d: 0 });
  const under = glowSprite(0x6f5cff, Math.max(R.W, R.H) * 2.2, .22); under.position.y = -1.6; roomGroup.add(under);

  const floorCells = [], wallCells = [];
  for (let y = 0; y < R.H; y++) for (let x = 0; x < R.W; x++) (R.wall[y * R.W + x] ? wallCells : floorCells).push([x, y]);
  const floor = new THREE.InstancedMesh(G.tile, M.tile, floorCells.length); floor.receiveShadow = true;
  const col = new THREE.Color();
  floorCells.forEach(([x, y], i) => {
    col.setHSL(.09 + Math.random() * .015, .42 + Math.random() * .1, .66 + Math.random() * .07);
    floor.setColorAt(i, col); items.push({ kind: 'inst', mesh: floor, i, p: cellV(x, y, -.25), d: delayOf(x, y) });
  });
  const walls = new THREE.InstancedMesh(G.wall, M.wall, Math.max(1, wallCells.length)); walls.castShadow = walls.receiveShadow = true;
  const caps = new THREE.InstancedMesh(G.cap, M.cap, Math.max(1, wallCells.length)); caps.castShadow = true;
  walls.count = caps.count = wallCells.length;
  wallCells.forEach(([x, y], i) => {
    items.push({ kind: 'inst', mesh: walls, i, p: cellV(x, y, .475), d: delayOf(x, y) + .05 });
    items.push({ kind: 'inst', mesh: caps, i, p: cellV(x, y, .99), d: delayOf(x, y) + .05 });
  });
  roomGroup.add(floor, walls, caps);

  // doors
  S.doors = R.doors.map((d, i) => {
    const gph = GLYPH[i % GLYPH.length];
    const g = new THREE.Group();
    const block = new THREE.Mesh(G.wall, M.door); block.position.y = .475; block.castShadow = block.receiveShadow = true;
    const seamMat = new THREE.MeshStandardMaterial({ color: gph.color, emissive: gph.color, emissiveIntensity: 1.6 });
    const seam = new THREE.Mesh(new THREE.BoxGeometry(1.01, .07, 1.01), seamMat); seam.position.y = .5;
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(.17, .17, .05, gph.seg), seamMat); coin.rotation.x = Math.PI / 2; coin.rotation.y = gph.rot; coin.position.set(0, .5, .52);
    g.add(block, seam, coin);
    const holder = new THREE.Group(); holder.position.copy(cellV(d.x, d.y)); holder.add(g); roomGroup.add(holder);
    const icon = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .04, gph.seg), seamMat); icon.rotation.x = Math.PI / 2; icon.position.set(0, 1.45, 0);
    const ig = glowSprite(gph.color, .9, .55); ig.position.y = 1.45; holder.add(icon, ig);
    items.push({ kind: 'obj', obj: holder, y: 0, d: delayOf(d.x, d.y) + .05 });
    return { g, icon, ig, seamMat, open: 0, target: 0, wasOpen: false };
  });
  // plates
  S.plates = R.plates.map(p => {
    const gph = GLYPH[p.door % GLYPH.length];
    const holder = new THREE.Group(); holder.position.copy(cellV(p.x, p.y));
    const b = new THREE.Mesh(new THREE.CylinderGeometry(.36, .4, .07, gph.seg), M.plateBase); b.rotation.y = gph.rot; b.position.y = .035; b.receiveShadow = true;
    const topMat = new THREE.MeshStandardMaterial({ color: gph.color, emissive: gph.color, emissiveIntensity: .5 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(.27, .27, .05, gph.seg), topMat); top.rotation.y = gph.rot; top.position.y = .1;
    const gl = glowSprite(gph.color, 1.1, .25); gl.position.y = .15;
    holder.add(b, top, gl); roomGroup.add(holder);
    items.push({ kind: 'obj', obj: holder, y: 0, d: delayOf(p.x, p.y) + .1 });
    return { top, topMat, gl, door: p.door, press: 0, target: 0, was: false, x: p.x, y: p.y };
  });
  // start ring
  const sr = new THREE.Mesh(G.ring, new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
  const sh = new THREE.Group(); sh.position.copy(cellV(R.start.x, R.start.y, .015)); sh.add(sr); roomGroup.add(sh);
  items.push({ kind: 'obj', obj: sh, y: .015, d: 0 });
  // exit
  const ex = new THREE.Group(); ex.position.copy(cellV(R.exit.x, R.exit.y));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.32, .045, 10, 48), new THREE.MeshStandardMaterial({ color: 0xfff1c1, emissive: 0xffd27a, emissiveIntensity: 2 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = .08;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.3, .34, 3.2, 32, 1, true), new THREE.MeshBasicMaterial({ map: TEX.beam, color: 0xffd99a, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 1.6;
  const eg = glowSprite(0xffd27a, 1.6, .7); eg.position.y = .3;
  const motes = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Array(60).fill(0).flatMap(() => [(Math.random() - .5) * .5, Math.random() * 2.5, (Math.random() - .5) * .5]), 3)),
    new THREE.PointsMaterial({ color: 0xffe2a6, size: .05, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false }));
  ex.add(ring, beam, eg, motes); roomGroup.add(ex);
  items.push({ kind: 'obj', obj: ex, y: 0, d: delayOf(R.exit.x, R.exit.y) + .15 });
  S.exitObj = { ex, ring, beam, motes, eg };

  rise = { items, t: 0, dir: 1, dur: Math.max(...items.map(i => i.d)) + .55 };
  applyRise(0);
  fitCamera();
}

const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
function applyRise(t) {
  const touched = new Set();
  for (const it of rise.items) {
    const k = clamp((t - it.d) / .5, 0, 1);
    const off = rise.dir > 0 ? (1 - easeOutBack(k)) * -4 : -(k * k) * 5;
    if (it.kind === 'inst') { _v.copy(it.p); _v.y += off; _m.compose(_v, _q, _s); it.mesh.setMatrixAt(it.i, _m); touched.add(it.mesh); }
    else it.obj.position.y = it.y + off;
  }
  touched.forEach(m => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
}

function fitCamera() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  if (!S.R) return;
  const R = S.R, el = 58 * Math.PI / 180, dir = new THREE.Vector3(0, Math.sin(el), Math.cos(el)), target = new THREE.Vector3(0, 0, .35);
  const corners = []; for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const sy of [0, 1.5]) corners.push(new THREE.Vector3(sx * (R.W / 2 + .3), sy, sz * (R.H / 2 + .3)));
  let lo = 4, hi = 120;
  for (let it = 0; it < 30; it++) {
    const d = (lo + hi) / 2; camera.position.copy(target).addScaledVector(dir, d); camera.lookAt(target); camera.updateMatrixWorld();
    const ok = corners.every(c => { const p = c.clone().project(camera); return Math.abs(p.x) < .9 && Math.abs(p.y) < .9; });
    if (ok) hi = d; else lo = d;
  }
  camera.position.copy(target).addScaledVector(dir, hi); camera.lookAt(target);
  camera.userData = { base: camera.position.clone(), target };
  sun.target.position.set(0, 0, 0);
}
new ResizeObserver(fitCamera).observe(stage);

// ---------------- entities ----------------
function clearEnts() { for (const e of S.ents) scene.remove(e.root); S.ents = []; }
function spawnEnts() {
  clearEnts();
  S.echoes.forEach((_, i) => S.ents.push(makeChar(ECHO_COLS[i % ECHO_COLS.length], true)));
  const hero = makeChar(0xf2b25c, false); S.ents.push(hero);
  S.ents.forEach(e => scene.add(e.root));
  snapAll(S.states[S.acts.length]);
}
function snapAll(pos) {
  pos.forEach((p, i) => { const e = S.ents[i]; if (!e) return; e.anim = null; e.root.position.copy(cellV(p.x, p.y)); });
}
function animEnt(e, from, to, blocked, act) {
  const d = E.DIRS[act];
  if (d && (d[0] || d[1])) e.tyaw = Math.atan2(d[0], -d[1]);
  const moved = from.x !== to.x || from.y !== to.y;
  e.anim = { from: cellV(from.x, from.y), to: cellV(to.x, to.y), t: 0, dur: TICK / 1000, kind: moved ? 'hop' : blocked ? 'bump' : 'idle', dir: d || [0, 0] };
}

// ---------------- game flow ----------------
const cur = () => S.states[S.acts.length];
function recompute() { S.states = E.run(S.R, S.echoes, S.acts); }

function startRun() {
  S.runSeed = (Math.random() * 1e9) >>> 0; S.n = 1; S.sand = START_SAND; S.over = false;
  $('overScreen').hidden = true;
  startRoom();
}
function startRoom() {
  let R = E.roomFor(S.n, S.runSeed), k = 1;
  while (!R && k < 20) R = E.roomFor(S.n, S.runSeed + k++);
  S.R = R; S.echoes = []; S.acts = []; S.won = false; S.walk = []; S.busy = false; S.platePressedOnce = false;
  recompute(); buildRoom(); clearEnts(); updateDots(); ui();
  feet.count = 0;
  setTimeout(() => {
    spawnEnts();
    const h = S.ents[S.ents.length - 1]; h.root.position.y = 3; h.anim = { kind: 'drop', t: 0, dur: .45, to: h.root.position.clone().setY(0) };
    setTimeout(() => SFX.land(), 380);
    doorsUpdate(true);
    if (S.n === 1 && !S.firstMove) $('finger').classList.add('on');
  }, Math.min(900, rise.dur * 1000 - 200));
  $('room').textContent = 'غرفة ' + AR(S.n);
}

function doAction(a) {
  if (S.busy || S.won || S.over || S.rewinding || !S.ents.length) return false;
  if (S.acts.length >= S.R.L) return false;
  const t = S.acts.length, pos = cur();
  const acts = S.echoes.map(e => e[t] || 'W').concat([a]);
  const next = E.step(S.R, pos, acts);
  const me = next[next.length - 1];
  const hero = S.ents[S.ents.length - 1];
  if (a !== 'W' && me.blocked) { animEnt(hero, pos[pos.length - 1], pos[pos.length - 1], true, a); SFX.bump(); buzz(15); S.walk = []; return false; }
  if (!S.firstMove) { S.firstMove = true; $('finger').classList.remove('on'); }
  S.acts.push(a); S.states.push(next.map(({ x, y }) => ({ x, y })));
  S.busy = true;
  next.forEach((n, i) => animEnt(S.ents[i], pos[i], n, n.blocked, acts[i]));
  const echoMoves = S.echoes.map((_, i) => pos[i].x !== next[i].x || pos[i].y !== next[i].y);
  if (a === 'W') SFX.wait(t); SFX.tick(t, echoMoves, a !== 'W');
  doorsUpdate(false);
  updateDots(); ui();
  const left = S.R.L - S.acts.length;
  if (left <= 3 && left > 0) SFX.warn();
  setTimeout(afterTick, TICK);
  return true;
}
function afterTick() {
  S.busy = false;
  const me = cur()[S.echoes.length];
  if (me.x === S.R.exit.x && me.y === S.R.exit.y) return win();
  if (S.acts.length >= S.R.L) {
    S.walk = [];
    if (S.sand > 0) { toast('انتهى الوقت'); setTimeout(() => echo(true), 450); }
    else gameOver();
    return;
  }
  coach();
  pump();
}
function pump() { if (S.walk.length && !S.busy) { const a = S.walk.shift(); if (!doAction(a)) S.walk = []; } }

function doorsUpdate(silent) {
  const pos = cur(), open = E.doorStates(S.R, pos);
  S.doors.forEach((d, i) => { d.target = open[i] ? 1 : 0; if (!silent && open[i] !== d.wasOpen) SFX.door(open[i]); d.wasOpen = open[i]; });
  S.plates.forEach(p => {
    const on = pos.some(e => e.x === p.x && e.y === p.y);
    p.target = on ? 1 : 0;
    if (on && !p.was && !silent) { SFX.plate(p.door, true); buzz(12); ringFX(cellV(p.x, p.y, .1), GLYPH[p.door % GLYPH.length].color); S.platePressedOnce = true; }
    if (!on && p.was && !silent) SFX.plate(p.door, false);
    p.was = on;
  });
}

function echo(auto) {
  if (S.busy || S.won || S.over || S.rewinding) return;
  if (!S.acts.length) { toast('تحرّك أولًا'); return; }
  if (S.sand <= 0) { toast('نفد الرمل'); return; }
  if (S.echoes.length >= MAX_ECHOES) { toast('خمسة أصداء كحد أقصى'); return; }
  S.walk = [];
  S.sand--; S.echoes.push(E.pad(S.acts, S.R.L));
  $('echo').classList.remove('pulse');
  rewindAnim(() => {
    S.acts = []; recompute(); spawnEnts();
    const g = S.ents[S.echoes.length - 1]; g.root.scale.setScalar(.01); g.pop = 0;
    SFX.spawn(); ringFX(cellV(S.R.start.x, S.R.start.y, .1), 0x8fd8ff, 1.6);
    doorsUpdate(true); updateDots(); ui();
  });
  ui();
}
function rewindAnim(done) {
  S.rewinding = true; stage.classList.add('rewinding'); SFX.rewind(); buzz([10, 30, 10]);
  const steps = S.acts.length, total = Math.min(900, 140 + steps * 45), t0 = performance.now();
  const states = S.states;
  (function f() {
    const k = clamp((performance.now() - t0) / total, 0, 1);
    const pos = (1 - k) * steps, i0 = Math.floor(pos), fr = pos - i0;
    const a = states[Math.min(i0 + 1, steps)], b = states[i0];
    S.ents.forEach((e, i) => { if (!a[i]) return; e.anim = null; e.root.position.copy(cellV(a[i].x, a[i].y)).lerp(cellV(b[i].x, b[i].y), 1 - fr); e.root.position.y = Math.sin(fr * Math.PI) * .12; });
    if (k < 1) requestAnimationFrame(f);
    else { stage.classList.remove('rewinding'); S.rewinding = false; done(); }
  })();
}
function restart() {
  if (S.busy || S.won || S.over || S.rewinding) return;
  S.echoes = []; S.acts = []; S.walk = []; recompute(); spawnEnts(); doorsUpdate(true); updateDots(); ui();
}
function undo() {
  if (S.busy || S.won || S.over || S.rewinding || !S.acts.length) return;
  S.walk = []; S.acts.pop(); S.states.pop(); snapAll(cur()); doorsUpdate(true); updateDots(); ui();
  tone(note(2), 0, .12, 'sine', .06);
}
function hint() {
  if (S.busy || S.won || S.over || S.rewinding) return;
  if (S.sand <= 1) { toast('الرمل لا يكفي للتلميح'); return; }
  const sol = S.R.solution; if (!sol) return;
  const seq = S.echoes.length < sol.echoes.length ? sol.echoes[S.echoes.length] : sol.player;
  S.sand--; ui();
  let p = { ...S.R.start }; const cells = [];
  for (const a of seq) { const d = E.DIRS[a]; if (d[0] || d[1]) { p = { x: p.x + d[0], y: p.y + d[1] }; cells.push(p); } }
  feet.count = Math.min(80, cells.length);
  cells.slice(0, 80).forEach((c, i) => { _v.copy(cellV(c.x, c.y, .03)); _m.compose(_v, _q, _s); feet.setMatrixAt(i, _m); });
  feet.instanceMatrix.needsUpdate = true; hintT = 6;
  toast(S.echoes.length < sol.echoes.length ? 'درب الصدى القادم' : 'دربك إلى المخرج');
  tone(note(9), 0, .6, 'sine', .08);
}

function win() {
  S.won = true; S.walk = [];
  const R = S.R, used = S.echoes.length, gain = Math.max(1, R.par + 1 - Math.max(0, used - R.par));
  S.sand = Math.min(MAX_SAND, S.sand + R.par + 1);
  const perfect = used <= R.par;
  SFX.win(); buzz([20, 40, 20]);
  const hero = S.ents[S.ents.length - 1]; hero.anim = { kind: 'cheer', t: 0, dur: .8 };
  burst(cellV(R.exit.x, R.exit.y, .4));
  const fl = $('flash'); fl.style.transition = 'none'; fl.style.opacity = .25; requestAnimationFrame(() => { fl.style.transition = 'opacity .6s'; fl.style.opacity = 0; });
  toast((perfect ? 'مثالي ✦  ' : '') + '+' + AR(R.par + 1) + ' رمل');
  S.best = Math.max(S.best, S.n);
  try { localStorage.setItem('sada-best', S.best); } catch (e) { }
  ui();
  setTimeout(() => {
    rise.dir = -1; rise.t = 0; rise.dur = .9;
    S.ents.forEach(e => e.anim = { kind: 'leave', t: 0, dur: .5 });
    setTimeout(() => { S.n++; startRoom(); }, 750);
  }, 1100);
  void gain;
}
function gameOver() {
  S.over = true; SFX.over();
  $('overRooms').textContent = AR(S.n - 1); $('overBest').textContent = AR(S.best);
  setTimeout(() => { $('overScreen').hidden = false; $('again').focus(); }, 700);
}

// ---------------- FX ----------------
function ringFX(p, color, scale = 1) {
  const m = new THREE.Mesh(G.ring, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.copy(p); scene.add(m); fx.push({ obj: m, t: 0, dur: .7, kind: 'ring', s: scale });
}
function burst(p) {
  const n = 70, pos = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) { pos.set([p.x, p.y, p.z], i * 3); const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.5; vel.push([Math.cos(a) * s, 2 + Math.random() * 3.5, Math.sin(a) * s]); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffd99a, size: .09, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(pts); fx.push({ obj: pts, t: 0, dur: 1.3, kind: 'burst', vel });
}
function updateDots() {
  if (!S.R || !S.echoes.length) { dots.count = 0; return; }
  const t = S.acts.length, L = S.R.L;
  const future = E.run(S.R, S.echoes, S.acts.concat(Array(L - t).fill('W')));
  let k = 0; const c = new THREE.Color();
  S.echoes.forEach((_, i) => {
    let prev = future[t][i];
    for (let s = t + 1; s <= L && k < 400; s++) {
      const p = future[s][i]; if (p.x === prev.x && p.y === prev.y) continue; prev = p;
      _v.copy(cellV(p.x, p.y, .02 + i * .002)); _m.compose(_v, _q, _s); dots.setMatrixAt(k, _m);
      c.setHex(ECHO_COLS[i % ECHO_COLS.length]).multiplyScalar(1 - Math.min(.7, (s - t) / (L + 2))); dots.setColorAt(k, c); k++;
    }
  });
  dots.count = k; dots.instanceMatrix.needsUpdate = true; if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
}

// ---------------- UI ----------------
let lastL = -1;
function ui() {
  const R = S.R; if (!R) return;
  const tk = $('ticks');
  if (lastL !== R.L || tk.children.length !== R.L) { tk.innerHTML = ''; for (let i = 0; i < R.L; i++) tk.appendChild(document.createElement('i')); lastL = R.L; }
  const t = S.acts.length, left = R.L - t;
  [...tk.children].forEach((el, i) => el.classList.toggle('done', i < t));
  tk.classList.toggle('warn', left <= 3);
  $('left').textContent = AR(left); $('left').classList.toggle('warn', left <= 3);
  $('sandN').textContent = AR(S.sand); $('sand').classList.toggle('low', S.sand <= 1);
  $('echoN').textContent = AR(S.echoes.length);
  $('echo').disabled = S.sand <= 0 || S.echoes.length >= MAX_ECHOES;
  $('undo').disabled = !t; $('hint').disabled = S.sand <= 1 || !R.solution;
}
let toastT = null;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 1600); }
function coach() {
  // teach the echo button through play: room with a door, plate used, still no echo
  if (S.R.doors.length && !S.echoes.length && S.platePressedOnce && S.acts.length >= 2) $('echo').classList.add('pulse');
  if (S.R.L - S.acts.length <= 2 && S.R.doors.length > S.echoes.length) $('echo').classList.add('pulse');
}

// ---------------- input ----------------
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ndc = new THREE.Vector2(), hit = new THREE.Vector3();
let down = null;
renderer.domElement.addEventListener('pointerdown', e => { audioInit(); down = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!down) return; const dx = e.clientX - down.x, dy = e.clientY - down.y; down = null;
  if (!S.R || S.won || S.over) return;
  if (Math.hypot(dx, dy) > 26) { S.walk = []; doAction(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U')); return; }
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera); if (!ray.ray.intersectPlane(plane, hit)) return;
  const x = Math.round(hit.x + (S.R.W - 1) / 2), y = Math.round(-hit.z + (S.R.H - 1) / 2);
  if (x < 0 || y < 0 || x >= S.R.W || y >= S.R.H) return;
  const me = cur()[S.echoes.length];
  if (x === me.x && y === me.y) { S.walk = []; doAction('W'); return; }
  const path = E.bfsPath(S.R, me, { x, y }, true); if (!path) { SFX.bump(); return; }
  S.walk = []; for (let i = 1; i < path.length; i++) { const a = path[i - 1], b = path[i]; S.walk.push(b.x > a.x ? 'R' : b.x < a.x ? 'L' : b.y > a.y ? 'U' : 'D'); }
  ringFX(cellV(x, y, .05), 0xffe2a6, .6);
  pump();
});
addEventListener('keydown', e => {
  const k = e.key; const map = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', w: 'U', s: 'D', a: 'L', d: 'R' };
  if (!$('startScreen').hidden || !$('overScreen').hidden) return;
  audioInit();
  if (map[k]) { S.walk = []; doAction(map[k]); e.preventDefault(); }
  else if (k === ' ') { S.walk = []; doAction('W'); e.preventDefault(); }
  else if (k === 'e' || k === 'Enter') echo();
  else if (k === 'z' || k === 'Backspace') undo();
  else if (k === 'r') restart();
});
$('wait').onclick = () => { audioInit(); S.walk = []; doAction('W'); };
$('echo').onclick = () => { audioInit(); echo(); };
$('undo').onclick = undo; $('restart').onclick = restart; $('hint').onclick = hint;
$('mute').onclick = () => { A.muted = !A.muted; if (A.master) A.master.gain.value = A.muted ? 0 : .85; $('waves').style.opacity = A.muted ? .15 : 1; };
$('go').onclick = () => { audioInit(); $('startScreen').hidden = true; startRun(); };
$('again').onclick = () => { audioInit(); startRun(); };

// ---------------- frame loop ----------------
let last = performance.now(), T = 0;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; T += dt;
  if (rise) { rise.t += dt; if (rise.t <= rise.dur + .1) applyRise(rise.t); }
  for (const e of S.ents) {
    const a = e.anim;
    if (e.pop !== undefined) { e.pop = Math.min(1, e.pop + dt * 2.5); e.root.scale.setScalar(easeOutBack(e.pop)); if (e.pop >= 1) delete e.pop; }
    let sq = 1;
    if (a) {
      a.t += dt; const k = clamp(a.t / a.dur, 0, 1);
      if (a.kind === 'hop') { e.root.position.lerpVectors(a.from, a.to, k); e.root.position.y = Math.sin(k * Math.PI) * .26; sq = 1 + Math.sin(k * Math.PI) * .12; if (k >= 1) e.land = .12; }
      else if (a.kind === 'bump') { const b = Math.sin(k * Math.PI) * .18; e.root.position.copy(a.from); e.root.position.x += a.dir[0] * b; e.root.position.z -= a.dir[1] * b; }
      else if (a.kind === 'idle') { e.root.position.copy(a.to); sq = 1 - Math.sin(k * Math.PI) * .06; }
      else if (a.kind === 'drop') { e.root.position.y = 3 * (1 - k * k); if (k >= 1) { e.root.position.y = 0; e.land = .18; } }
      else if (a.kind === 'cheer') { e.root.position.y = Math.abs(Math.sin(k * Math.PI * 2)) * .45; e.tyaw += dt * 9; }
      else if (a.kind === 'leave') { e.root.position.y = k * k * 3; e.root.scale.setScalar(1 - k * .6); }
      if (k >= 1 && a.kind !== 'leave') e.anim = null;
    } else e.root.position.y = 0;
    if (e.land > 0) { e.land -= dt; sq = 1 - Math.sin((e.land / .15) * Math.PI) * .2; }
    e.inner.scale.set(1 / Math.sqrt(sq), sq * (1 + Math.sin(T * 2.4 + e.root.id) * .015), 1 / Math.sqrt(sq));
    let dy = e.tyaw - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); e.yaw += dy * Math.min(1, dt * 14); e.root.rotation.y = e.yaw;
    e.tail.rotation.x = Math.sin(T * 6 + e.root.id) * .25 + (a && a.kind === 'hop' ? -.6 : 0);
    e.blink -= dt; if (e.blink < 0) { e.eyes.scale.y = .1; if (e.blink < -.12) { e.eyes.scale.y = 1; e.blink = 2 + Math.random() * 4; } }
    if (e.ghost) e.mat.opacity = .45 + Math.sin(T * 3 + e.root.id) * .07;
  }
  for (const d of S.doors) {
    d.open += (d.target - d.open) * Math.min(1, dt * 10);
    d.g.position.y = -d.open * .97; d.seamMat.emissiveIntensity = 1.4 + d.open * 1.6 + Math.sin(T * 3) * .2;
    d.icon.rotation.z = T * 1.2; d.icon.position.y = 1.45 + Math.sin(T * 2) * .05; d.ig.material.opacity = .4 + d.open * .5;
  }
  for (const p of S.plates) {
    p.press += (p.target - p.press) * Math.min(1, dt * 14);
    p.top.position.y = .1 - p.press * .025; p.topMat.emissiveIntensity = .5 + p.press * 2.5 + (1 - p.press) * Math.max(0, Math.sin(T * 3)) * .4;
    p.gl.material.opacity = .2 + p.press * .6;
  }
  if (S.exitObj) {
    const x = S.exitObj; x.ring.rotation.z = T * .8; x.beam.material.opacity = .45 + Math.sin(T * 2) * .1;
    const arr = x.motes.geometry.attributes.position; for (let i = 0; i < arr.count; i++) { let y = arr.getY(i) + dt * .5; if (y > 2.6) y = 0; arr.setY(i, y); } arr.needsUpdate = true;
  }
  if (hintT > 0) { hintT -= dt; feet.material.opacity = Math.min(.85, hintT) * (.6 + Math.sin(T * 6) * .25); if (hintT <= 0) feet.count = 0; }
  fx = fx.filter(f => {
    f.t += dt; const k = f.t / f.dur;
    if (f.kind === 'ring') { f.obj.scale.setScalar((1 + k * 2.2) * f.s); f.obj.material.opacity = .9 * (1 - k); }
    else { const p = f.obj.geometry.attributes.position; f.vel.forEach((v, i) => { v[1] -= 6 * dt; p.setXYZ(i, p.getX(i) + v[0] * dt, Math.max(.02, p.getY(i) + v[1] * dt), p.getZ(i) + v[2] * dt); }); p.needsUpdate = true; f.obj.material.opacity = 1 - k; }
    if (k >= 1) { scene.remove(f.obj); f.obj.geometry !== G.ring && f.obj.geometry.dispose(); f.obj.material.dispose(); return false; }
    return true;
  });
  if (camera.userData.base) { camera.position.copy(camera.userData.base); camera.position.x += Math.sin(T * .25) * .25; camera.position.y += Math.sin(T * .31) * .12; camera.lookAt(camera.userData.target); }
  // onboarding finger follows the exit on screen
  const fg = $('finger');
  if (fg.classList.contains('on') && S.R) { const p = cellV(S.R.exit.x, S.R.exit.y, .2).project(camera); fg.style.left = ((p.x + 1) / 2 * stage.clientWidth) + 'px'; fg.style.top = ((1 - p.y) / 2 * stage.clientHeight) + 'px'; }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
fitCamera();

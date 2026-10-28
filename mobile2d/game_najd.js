// ===== صدى — mobile: a 3D board built in code (three.js), the fox painted (sprites from mobile2d/art) =====
// Rules and rooms: logic.js (EchoLogic). World: one cell = 1 unit, floor top at y = 0;
// cell (x, y) sits at X = x, Z = H-1-y, so the exit row is far from the camera.
// Built from parts3d/head.js + parts/flow.js + parts3d/tail.js by build3d.mjs.
(() => {
'use strict';
const E = window.EchoLogic;
const TICK = 230;
const START_HELP = 2, MAX_HELP = 5;
const GLYPH = [
  { c: '#ffb547', n: 0 },
  { c: '#ff5fa8', n: 3 },
  { c: '#36d69a', n: 4 },
  { c: '#9d7bff', n: 4, rot: Math.PI / 4 },
];
const AR = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const $ = id => document.getElementById(id);
function rng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// ---------------- painted sprites (the fox) ----------------
const IMG = {};
const loaded = Promise.all(Object.entries(window.ART || {}).map(([k, src]) => new Promise(res => {
  const im = new Image(); im.onload = () => { IMG[k] = im; res(); }; im.onerror = () => res(); im.src = src;
})));
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
function save() { try { localStorage.setItem('sada3d', JSON.stringify({ n: S.n, runSeed: S.runSeed, help: S.help, solved: S.solved, demoSeen: S.demoSeen, muted: S.muted })); } catch (e) {} }
function load() { try { const d = JSON.parse(localStorage.getItem('sada3d') || 'null'); if (d) Object.assign(S, d); } catch (e) {} if (!S.runSeed) S.runSeed = (Math.random() * 1e9) >>> 0; }

// ---------------- three.js scene ----------------
const cv = $('cv'), over = $('ov'), octx = over.getContext('2d');
let DPR = 1, VW = 0, VH = 0;
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 200);
// Camera mostly square to the grid (rows run across the phone, the long rooms run up the screen),
// turned a little for depth: yaw 16°, looking down at 54°. Swipes are then plain up/down/left/right.
const YAW = 16 * Math.PI / 180, ELEV = 54 * Math.PI / 180;
const CAMDIR = new THREE.Vector3(Math.sin(YAW) * Math.cos(ELEV), Math.sin(ELEV), Math.cos(YAW) * Math.cos(ELEV));
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x8a6a48, 1.0));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0006; sun.shadow.normalBias = .02;
scene.add(sun); scene.add(sun.target);
const world = new THREE.Group(); scene.add(world);     // the island and the room (rebuilt per room)
const actors = new THREE.Group(); scene.add(actors);   // foxes, glyphs, effects

// world position of logic cell (x, y), h = height
const wv = (x, y, h = 0) => new THREE.Vector3(x, h, S.R.H - 1 - y);
// screen position (CSS px) of a logic cell / world point
function scrW(v) { const p = v.clone().project(camera); return [(p.x + 1) / 2 * VW, (1 - p.y) / 2 * VH]; }
function scr(x, y, h = 0) { return scrW(wv(x, y, h)); }
function cellAt(px, py) {   // tap -> cell: cast the ray onto the floor plane
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(px / VW * 2 - 1, -(py / VH * 2 - 1));
  ray.setFromCamera(ndc, camera);
  const t = -ray.ray.origin.y / ray.ray.direction.y, p = ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
  return { x: Math.round(p.x), y: S.R.H - 1 - Math.round(p.z) };
}
function swipeMove(dx, dy) {   // the grid direction whose on-screen direction is closest to the swipe
  const o = scr(1, 1), dirs = { R: scr(2, 1), L: scr(0, 1), U: scr(1, 2), D: scr(1, 0) };
  let best = 'U', bv = -2; const l = Math.hypot(dx, dy) || 1;
  for (const [k, v] of Object.entries(dirs)) { const vx = v[0] - o[0], vy = v[1] - o[1], d = (dx * vx + dy * vy) / (l * Math.hypot(vx, vy)); if (d > bv) { bv = d; best = k; } }
  return best;
}

// ---------------- camera: fit the room, or follow the fox when the room is too big to read ----------------
const cam = { target: new THREE.Vector3(), look: new THREE.Vector3(), zoom: 1, tzoom: 1, follow: false, overview: false, fitZoom: 1 };
const VIEW = 7.2;   // (fit recomputes the zoom per room)   // world units visible across the screen width at zoom 1
const MIN_CELL = 46;   // px per cell below which the camera follows the fox
function roomBox() {
  const R = S.R, pts = [];
  for (const [x, y] of [[-1, -1.1], [R.W, -1.1], [-1, R.H], [R.W, R.H]]) for (const h of [-.45, 1.3]) pts.push(wv(x, y, h));
  return pts;
}
function layout() {
  if (!S.R || VW < 50) return;
  buildRoom();
  // fit: project the room's box with zoom 1 and scale to the screen (room above the tick row)
  setCam(roomCentre(), 1);
  const pts = roomBox().map(scrW);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const top = 70, bottom = 50;
  cam.fitZoom = Math.min(VW / (Math.max(...xs) - Math.min(...xs)), (VH - top - bottom) / (Math.max(...ys) - Math.min(...ys)));
  const cellPx = cam.fitZoom * VW / VIEW;
  cam.follow = cellPx < MIN_CELL;
  cam.tzoom = cam.follow && !cam.overview ? MIN_CELL / (VW / VIEW) : cam.fitZoom;
  // centre the room between the top bar and the tick row
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const want = [VW / 2, top + (VH - top - bottom) / 2];
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const upp = VIEW / VW;   // world units per px at zoom 1
  cam.fitCentre = roomCentre().addScaledVector(right, (cx - want[0]) * upp).addScaledVector(up, -(cy - want[1]) * upp);
}
function roomCentre() { const R = S.R; return wv((R.W - 1) / 2, (R.H - 1) / 2, 0); }
function setCam(look, zoom) {
  const a = VW / VH, hw = VIEW / 2 / zoom, hh = hw / a;
  camera.left = -hw; camera.right = hw; camera.top = hh; camera.bottom = -hh;
  camera.position.copy(look).addScaledVector(CAMDIR, 40); camera.lookAt(look); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}
function updCam(dt) {
  let goal = cam.fitCentre || roomCentre();
  if (cam.follow && !cam.overview && ents.length) { const e = ents[ents.length - 1]; goal = wv(e.x, e.y, 0); }
  const k = Math.min(1, dt * 5);
  cam.look.lerp(goal, k); cam.zoom += (cam.tzoom - cam.zoom) * k;
  setCam(cam.look, cam.zoom);
  // keep the sun's shadow box on the room
  const c = roomCentre(); sun.position.copy(c).add(new THREE.Vector3(-6, 12, 3)); sun.target.position.copy(c);
}
function snapCam() { cam.look.copy(cam.follow && !cam.overview && ents.length ? wv(ents[ents.length - 1].x, ents[ents.length - 1].y) : (cam.fitCentre || roomCentre())); cam.zoom = cam.tzoom; setCam(cam.look, cam.zoom); }
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  const r = cv.getBoundingClientRect(); VW = r.width; VH = r.height;
  renderer.setPixelRatio(DPR); renderer.setSize(VW, VH, false);
  over.width = Math.round(VW * DPR); over.height = Math.round(VH * DPR);
  built = null; layout(); snapCam();
}

// ---------------- low-poly geometry, all made in code ----------------
// a box with chamfered edges and corners (the cut stone look of the art), flat-shaded, coloured per vertex
function chamferBox(w, h, d, c) {
  const hx = w / 2, hy = h / 2, hz = d / 2, P = (sx, sy, sz, k) => k === 0 ? [sx * hx, sy * (hy - c), sz * (hz - c)] : k === 1 ? [sx * (hx - c), sy * hy, sz * (hz - c)] : [sx * (hx - c), sy * (hy - c), sz * hz];
  const tris = [];
  const quad = (a, b, cc, dd) => { tris.push([a, b, cc], [a, cc, dd]); };
  const S2 = [-1, 1];
  for (const s of S2) {   // the six faces
    quad(P(s, -1, -1, 0), P(s, 1, -1, 0), P(s, 1, 1, 0), P(s, -1, 1, 0));
    quad(P(-1, s, -1, 1), P(1, s, -1, 1), P(1, s, 1, 1), P(-1, s, 1, 1));
    quad(P(-1, -1, s, 2), P(1, -1, s, 2), P(1, 1, s, 2), P(-1, 1, s, 2));
  }
  for (const a of S2) for (const b of S2) {   // the twelve edge bevels
    quad(P(a, b, -1, 0), P(a, b, -1, 1), P(a, b, 1, 1), P(a, b, 1, 0));
    quad(P(a, -1, b, 0), P(a, -1, b, 2), P(a, 1, b, 2), P(a, 1, b, 0));
    quad(P(-1, a, b, 1), P(-1, a, b, 2), P(1, a, b, 2), P(1, a, b, 1));
  }
  for (const a of S2) for (const b of S2) for (const cc of S2) tris.push([P(a, b, cc, 0), P(a, b, cc, 1), P(a, b, cc, 2)]);   // corners
  const pos = [];
  for (const t of tris) {   // orient every triangle outward
    const [A, B, C] = t.map(v => new THREE.Vector3(...v));
    const n = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(C, A));
    const m = A.clone().add(B).add(C);
    if (n.dot(m) < 0) pos.push(...A.toArray(), ...C.toArray(), ...B.toArray()); else pos.push(...A.toArray(), ...B.toArray(), ...C.toArray());
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}
// paint a geometry one colour (with a little per-face variation), place it, keep it for merging
const tmpC = new THREE.Color();
function paint(g, col, vary, r, topCol) {
  const p = g.attributes.position, n = g.attributes.normal, cols = new Float32Array(p.count * 3), base = new THREE.Color(col), top = topCol && new THREE.Color(topCol);
  for (let i = 0; i < p.count; i += 3) {
    const k = 1 + (r() - .5) * vary;
    const useTop = top && n.getY(i) > .7;
    tmpC.copy(useTop ? top : base).multiplyScalar(k);
    for (let j = 0; j < 3; j++) { cols[(i + j) * 3] = tmpC.r; cols[(i + j) * 3 + 1] = tmpC.g; cols[(i + j) * 3 + 2] = tmpC.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}
function flat(g) { const f = g.index ? g.toNonIndexed() : g; f.computeVertexNormals(); return f; }
function place(g, x, y, z, ry = 0, s = [1, 1, 1], rx = 0, rz = 0) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(...s));
  g.applyMatrix4(m); return g;
}
const MAT = {
  solid: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .92, metalness: 0 }),
};
function merged(list, shadow = true) {
  const g = mergeGeometries(list.map(x => { const y = x.index ? x.toNonIndexed() : x; for (const k of Object.keys(y.attributes)) if (!['position', 'normal', 'color'].includes(k)) y.deleteAttribute(k); return y; }));
  const m = new THREE.Mesh(g, MAT.solid); m.castShadow = shadow; m.receiveShadow = true; return m;
}
function rock(r, s, col = '#c3beb6') { const g = flat(new THREE.IcosahedronGeometry(s, 0)); g.attributes.position.array.forEach((v, i, a) => (a[i] = v * (.8 + r() * .4))); g.computeVertexNormals(); return paint(g, col, .18, r); }
function tree(r, x, z, h) {   // tall thin trunk, layered umbrella canopies
  const out = [];
  out.push(paint(place(flat(new THREE.CylinderGeometry(.035, .06, h, 5)), x, h / 2, z, 0, [1, 1, 1], (r() - .5) * .12, (r() - .5) * .12), '#8a4f2c', .15, r));
  const layers = 2 + (r() < .5 ? 1 : 0);
  for (let k = 0; k < layers; k++) {
    const s = (.55 - k * .12) * (.85 + r() * .3), y = h * (.78 + k * .2);
    out.push(paint(place(flat(new THREE.IcosahedronGeometry(s, 1)), x + (r() - .5) * .1, y, z + (r() - .5) * .1, r() * 6, [1, .38, 1]), k === layers - 1 ? '#a8d84c' : '#8cc63f', .16, r));
  }
  return out;
}
function bush(r, x, z, s) { return paint(place(flat(new THREE.IcosahedronGeometry(s, 1)), x, s * .55, z, r() * 6, [1, .75, 1]), '#6fb236', .2, r); }
function tuft(r, x, z, s) {
  const out = [];
  for (let k = 0; k < 5; k++) { const a = r() * 6.28, d = r() * s * .5; out.push(paint(place(flat(new THREE.ConeGeometry(s * .14, s * (.7 + r() * .6), 3)), x + Math.cos(a) * d, s * .3, z + Math.sin(a) * d, r() * 6, [1, 1, 1], (r() - .5) * .5, (r() - .5) * .5), r() < .5 ? '#7ccf3f' : '#5ea832', .15, r)); }
  return out;
}

// ---------------- the room: island, floor, walls, doors, plates, exit, decoration ----------------
let built = null, doorObjs = [], plateObjs = [], exitObj = null, minis = [], pebbles = [], glyphObjs = [];
function buildRoom() {
  const R = S.R;
  if (built === R) return;
  built = R;
  world.clear(); actors.children.filter(o => o.userData.room).forEach(o => actors.remove(o));
  doorObjs = []; plateObjs = []; glyphObjs = []; minis = []; pebbles = [];
  const r = rng(R.W * 131 + R.H * 7 + S.n * 13);
  const stat = [];
  // island: a faceted grass slab around the floor, hanging earth below with rocks
  const m = .85, x0 = -.5 - m, x1 = R.W - .5 + m, z0 = -.5 - m, z1 = R.H - .5 + m;
  const ring = [], N = 28;
  for (let k = 0; k < N; k++) {   // rounded-rectangle outline, slightly irregular
    const a = k / N * Math.PI * 2, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ex = (x1 - x0) / 2, ez = (z1 - z0) / 2;
    const c = Math.cos(a), s = Math.sin(a), p = 6;
    const rx = ex * Math.sign(c) * Math.pow(Math.abs(c), 2 / p), rz = ez * Math.sign(s) * Math.pow(Math.abs(s), 2 / p);
    ring.push([cx + rx * (1 + (r() - .5) * .04), cz + rz * (1 + (r() - .5) * .04)]);
  }
  const shape = new THREE.Shape(ring.map(p => new THREE.Vector2(p[0], -p[1])));
  const slab = new THREE.ExtrudeGeometry(shape, { depth: .32, bevelEnabled: false, curveSegments: 1 });
  slab.rotateX(-Math.PI / 2); slab.translate(0, -.32 - .04, 0);
  stat.push(paint(flat(slab), '#6fb238', .1, r, '#8fd14f'));
  // earth: rings shrinking downward to a jagged point
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, levels = [[1, -.36], [.82, -1.0], [.55, -1.8], [.25, -2.6]];
  const pos = [];
  const L = levels.map(([s, y], li) => ring.map(p => [cx + (p[0] - cx) * s * (li ? .9 + r() * .2 : 1), y - (li ? r() * .4 : 0), cz + (p[1] - cz) * s * (li ? .9 + r() * .2 : 1)]));
  const tip = [cx, -3.3, cz];
  for (let li = 0; li < L.length - 1; li++) for (let k = 0; k < N; k++) {
    const a = L[li][k], b = L[li][(k + 1) % N], c = L[li + 1][(k + 1) % N], d = L[li + 1][k];
    pos.push(...a, ...d, ...b, ...b, ...d, ...c);
  }
  for (let k = 0; k < N; k++) { const a = L[3][k], b = L[3][(k + 1) % N]; pos.push(...a, ...tip, ...b); }
  const earth = new THREE.BufferGeometry(); earth.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); earth.computeVertexNormals();
  stat.push(paint(earth, '#d4733a', .22, r));
  for (let k = 0; k < 14; k++) { const a = r() * 6.28, lv = .3 + r() * .5; stat.push(place(rock(r, .12 + r() * .14), cx + Math.cos(a) * (x1 - x0) / 2 * (1 - lv * .5), -.5 - lv * 1.6, cz + Math.sin(a) * (z1 - z0) / 2 * (1 - lv * .5))); }
  // floor: chamfered sandstone tiles (some split in four), grout shows between them
  const isWall = (x, y) => x >= 0 && y >= 0 && x < R.W && y < R.H && R.wall[y * R.W + x] === 1;
  for (let y = 0; y < R.H; y++) for (let x = 0; x < R.W; x++) {
    if (isWall(x, y)) continue;
    const X = x, Z = R.H - 1 - y, tone = ['#dcbb84', '#d3ae76', '#e2c48f'][Math.floor(r() * 3)];
    if (r() < .22) for (const [u, v] of [[-.24, -.24], [.24, -.24], [-.24, .24], [.24, .24]]) stat.push(paint(place(chamferBox(.44, .16, .44, .04), X + u, -.08 + (r() - .5) * .02, Z + v, (r() - .5) * .05), tone, .08, r));
    else stat.push(paint(place(chamferBox(.92, .16, .92, .05), X, -.08 + (r() - .5) * .02, Z, (r() - .5) * .04), tone, .08, r));
  }
  // grout bed under the floor
  stat.push(paint(place(new THREE.BoxGeometry(R.W + .06, .1, R.H + .06), (R.W - 1) / 2, -.075, (R.H - 1) / 2), '#7a6248', .05, r));   // grout shows between the tiles
  // walls: stacked grey stone blocks, two courses, moss on some tops
  for (let y = 0; y < R.H; y++) for (let x = 0; x < R.W; x++) {
    if (!isWall(x, y)) continue;
    const X = x, Z = R.H - 1 - y;
    const runX = isWall(x - 1, y) || isWall(x + 1, y) || E.doorAt(R, x - 1, y) >= 0 || E.doorAt(R, x + 1, y) >= 0;
    for (let c = 0; c < 2; c++) {
      const yy = .2 + c * .34, cut = .35 + r() * .3;
      const parts = (c + x + y) % 2 ? [[-.5, cut - .5], [cut - .5, .5]] : [[-.5, .5]];
      for (const [a, b] of parts) {
        const len = b - a - .03, mid = (a + b) / 2, grey = ['#bdb8b0', '#aaa59d', '#c6c1b8'][Math.floor(r() * 3)];
        const g = runX ? chamferBox(len, .32, .86, .05) : chamferBox(.86, .32, len, .05);
        stat.push(paint(place(g, X + (runX ? mid : 0) + (r() - .5) * .02, yy, Z + (runX ? 0 : mid) + (r() - .5) * .02, (r() - .5) * .04), grey, .1, r, c === 1 && r() < .35 ? '#86c34a' : null));
      }
    }
    if (r() < .3) stat.push(...tuft(r, X + (r() - .5) * .5, Z + .5, .22).map(g => place(g, 0, -.02, 0)));
  }
  // doors: two stone posts and a lintel; the wooden plank panel and its glyph are live objects
  R.doors.forEach((d, i) => {
    const X = d.x, Z = R.H - 1 - d.y;
    for (const s of [-1, 1]) for (let c = 0; c < 3; c++) stat.push(paint(place(chamferBox(.16, .3, .3, .04), X + s * .42, .17 + c * .31, Z, (r() - .5) * .06), '#b3aea6', .1, r));
    stat.push(paint(place(chamferBox(1.04, .2, .36, .05), X, 1.04, Z), '#c2bdb4', .08, r, '#c9c4bb'));
    const panel = new THREE.Group();
    const planks = [];
    for (let k = 0; k < 4; k++) planks.push(paint(place(chamferBox(.16, .82, .07, .02), -.255 + k * .17, .41, 0), k % 2 ? '#8a5530' : '#9b6238', .08, r));
    for (const yy of [.2, .64]) planks.push(paint(place(new THREE.BoxGeometry(.7, .06, .09), 0, yy, 0), '#4a4a52', .05, r));
    const pm = merged(planks); panel.add(pm);
    panel.position.set(X, 0, Z); world.add(panel);
    const glyph = makeGlyph(i, d.kind === 'inverse'); glyph.position.set(X, 1.32, Z); glyph.userData.room = true; actors.add(glyph);
    const pips = [];
    if (d.kind === 'timed') for (let k = 0; k < 3; k++) { const p = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6), new THREE.MeshBasicMaterial({ color: GLYPH[i % 4].c })); p.position.set(X + (k - 1) * .13, 1.2, Z); world.add(p); pips.push(p); }
    doorObjs.push({ panel, glyph, pips });
  });
  // plates: octagonal stone pads with a coloured ring and the door's mark
  R.plates.forEach((p, j) => {
    const X = p.x, Z = R.H - 1 - p.y, G = GLYPH[p.door % 4], inv = R.doors[p.door].kind === 'inverse';
    const grp = new THREE.Group(); grp.position.set(X, 0, Z);
    const base = paint(flat(new THREE.CylinderGeometry(.4, .43, .1, 8)), '#9a979c', .1, r); base.rotateY(Math.PI / 8);
    const bm = new THREE.Mesh(base, MAT.solid); bm.position.y = .03; bm.receiveShadow = true; grp.add(bm);
    const top = new THREE.Mesh(paint(flat(new THREE.CylinderGeometry(.3, .3, .06, 8)), '#b2afb3', .08, r), MAT.solid); top.rotation.y = Math.PI / 8; top.position.y = .09; top.receiveShadow = true; grp.add(top);
    const ringM = new THREE.MeshBasicMaterial({ color: G.c, transparent: true });
    const rg = new THREE.Mesh(new THREE.TorusGeometry(.33, .03, 4, 32), ringM); rg.rotation.x = -Math.PI / 2; rg.position.y = .1; grp.add(rg);
    const mark = new THREE.Mesh(glyphShape(p.door, .12, inv), ringM); mark.rotation.x = -Math.PI / 2; mark.position.y = .125; grp.add(mark);
    world.add(grp);
    plateObjs.push({ grp, top, ring: rg, mat: ringM, mark });
  });
  // exit: a stepped stone platform, a standing golden ring, a beam of light
  {
    const X = R.exit.x, Z = R.H - 1 - R.exit.y, grp = new THREE.Group(); grp.position.set(X, 0, Z);
    const g1 = paint(flat(new THREE.CylinderGeometry(.46, .5, .12, 8)), '#a9a49c', .08, r); g1.rotateY(Math.PI / 8); g1.translate(0, .02, 0);
    const g2 = paint(flat(new THREE.CylinderGeometry(.34, .38, .1, 8)), '#d8cfba', .06, r); g2.rotateY(Math.PI / 8); g2.translate(0, .12, 0);
    const pm = new THREE.Mesh(mergeGeometries([g1, g2]), MAT.solid); pm.receiveShadow = pm.castShadow = true; grp.add(pm);
    const gold = new THREE.MeshStandardMaterial({ color: 0xf2bb3a, emissive: 0x9a6510, emissiveIntensity: .55, metalness: .6, roughness: .32, flatShading: true });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.3, .055, 6, 12), gold); ring.position.y = .55; ring.castShadow = true; grp.add(ring);
    for (const s of [-1, 1]) { const st = new THREE.Mesh(paint(place(chamferBox(.08, .14, .12, .02), s * .2, .22, 0), '#c8c2b6', .05, r), MAT.solid); grp.add(st); }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.2, .3, 1.6, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc56a, transparent: true, opacity: .14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = .95; grp.add(beam);
    const sparks = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(16 * 3), 3)),
      new THREE.PointsMaterial({ color: 0xffd68a, size: .07, transparent: true, opacity: .9, depthWrite: false, blending: THREE.AdditiveBlending }));
    grp.add(sparks);
    world.add(grp); exitObj = { grp, ring, beam, sparks };
  }
  // decoration on the island rim: trees behind, bushes, rocks and grass all round (never on the floor)
  const rim = (t, inset) => { const k = Math.floor(t * N) % N, f = t * N - Math.floor(t * N), a = ring[k], b = ring[(k + 1) % N]; return [lerp(a[0], b[0], f) + (cx - lerp(a[0], b[0], f)) * inset, lerp(a[1], b[1], f) + (cz - lerp(a[1], b[1], f)) * inset]; };
  const onFloor = (x, z) => x > -.62 && x < R.W - .38 && z > -.62 && z < R.H - .38;
  // trees stand behind the room (far edge and far corners), never in front of the exit
  const ex = R.exit.x, ez = R.H - 1 - R.exit.y;
  for (let k = 0; k < 9; k++) {
    const t = .5 + k * .056 + r() * .015, p = rim(t, .12 + r() * .05);
    if (onFloor(p[0], p[1]) || Math.hypot(p[0] - ex, p[1] - ez) < 1.3 || p[1] > (R.H - 1) * .45) continue;
    stat.push(...tree(r, p[0], p[1], .95 + r() * .45));
  }
  for (let k = 0; k < 10; k++) { const p = rim(r(), .06 + r() * .06); if (!onFloor(p[0], p[1])) stat.push(bush(r, p[0], p[1], .14 + r() * .1)); }
  for (let k = 0; k < 10; k++) { const p = rim(r(), .05 + r() * .08); if (!onFloor(p[0], p[1])) stat.push(place(rock(r, .1 + r() * .1), p[0], .06, p[1])); }
  for (let k = 0; k < 26; k++) { const p = rim(r(), .03 + r() * .12); if (!onFloor(p[0], p[1])) stat.push(...tuft(r, p[0], p[1], .2 + r() * .1)); }
  world.add(merged(stat));
  // small floating islands around, each with a tree or a rock, bobbing
  for (let k = 0; k < 4; k++) {
    const side = k % 2 ? 1 : -1, g = [];
    const s = .4 + r() * .3;
    g.push(paint(flat(new THREE.CylinderGeometry(s, s * .95, .16, 7)), '#7cc43f', .1, r, '#8fd14f'));
    g.push(paint(place(flat(new THREE.ConeGeometry(s * .95, s * 1.8, 7)), 0, -.08 - s * .9, 0, 0, [1, 1, 1], Math.PI), '#d4733a', .2, r));
    if (r() < .6) g.push(...tree(r, 0, 0, .8 + r() * .4).map(t => place(t, 0, .08, 0))); else g.push(place(rock(r, .14), 0, .14, 0));
    const mesh = merged(g); const base = new THREE.Vector3(cx + side * ((x1 - x0) / 2 + 1.4 + r()), -1 - r() * 1.5 + k * .5, lerp(z0, z1, .15 + k * .22));
    mesh.position.copy(base); world.add(mesh); minis.push({ mesh, base, ph: r() * 6 });
  }
  for (let k = 0; k < 5; k++) { const mesh = new THREE.Mesh(rock(r, .06 + r() * .06, k % 2 ? '#c3beb6' : '#c86b37'), MAT.solid); const base = new THREE.Vector3(lerp(x0, x1, r()), -3 - r() * .8, lerp(z0, z1, .5 + r() * .5)); mesh.position.copy(base); world.add(mesh); pebbles.push({ mesh, base, ph: r() * 6 }); }
  // shadow camera covers the island
  const sc = sun.shadow.camera, ext = Math.max(R.W, R.H) * .8 + 3;
  sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = .5; sc.far = 40; sc.updateProjectionMatrix();
}
function glyphShape(g, r, hollow) {   // the door's mark as a flat shape (circle, triangle, square, diamond)
  const G = GLYPH[g % 4], n = G.n || 32, sh = new THREE.Shape();
  const pts = []; for (let k = 0; k < n; k++) { const a = (G.rot || 0) - Math.PI / 2 + k * Math.PI * 2 / n + (G.n === 4 && !G.rot ? Math.PI / 4 : 0); pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r)); }
  sh.setFromPoints(pts);
  if (hollow) { const h = new THREE.Path(); h.setFromPoints(pts.map(p => p.clone().multiplyScalar(.62)).reverse()); sh.holes.push(h); }
  return new THREE.ShapeGeometry(sh);
}
function makeGlyph(i, inverse) {   // neon outline of the door's shape, facing the camera
  const G = GLYPH[i % 4], grp = new THREE.Group();
  const n = G.n || 40, outer = .24, inner = inverse ? .2 : .17, sh = new THREE.Shape(), hole = new THREE.Path();
  const ptsO = [], ptsI = [];
  for (let k = 0; k < n; k++) { const a = (G.rot || 0) + Math.PI / 2 + k * Math.PI * 2 / n + (G.n === 4 && !G.rot ? Math.PI / 4 : 0); ptsO.push(new THREE.Vector2(Math.cos(a) * outer, Math.sin(a) * outer)); ptsI.push(new THREE.Vector2(Math.cos(a) * inner, Math.sin(a) * inner)); }
  sh.setFromPoints(ptsO); hole.setFromPoints(ptsI.reverse()); sh.holes.push(hole);
  const mat = new THREE.MeshBasicMaterial({ color: G.c, transparent: true, depthTest: false });
  const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), mat); m.renderOrder = 5; grp.add(m);
  const halo = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: G.c, transparent: true, opacity: .25, depthTest: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(1.25); halo.renderOrder = 4; grp.add(halo);
  grp.userData = { mat, halo, room: true };
  return grp;
}

// ---------------- the fox: painted sprites on a camera-facing card ----------------
let ents = [];
const FOX_H = 1.2;   // card height in world units
function makeEnt(i, p, ghost) {
  const c = document.createElement('canvas'); c.width = 300; c.height = 420;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const card = new THREE.Mesh(new THREE.PlaneGeometry(FOX_H * 300 / 420, FOX_H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: .02, depthWrite: !ghost, opacity: ghost ? .72 : 1, toneMapped: false }));
  card.geometry.translate(0, FOX_H / 2, 0);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.22, 20), new THREE.MeshBasicMaterial({ color: 0x3c2814, transparent: true, opacity: .32, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  actors.add(card); actors.add(shadow);
  return { i, ghost, x: p.x, y: p.y, fx: p.x, fy: p.y, tx: p.x, ty: p.y, t: 1, dur: TICK, face: 'D', walkPh: 0, moving: false, walkW: 0,
    bump: null, expr: 'calm', exprT: 0, blink: 1.5 + Math.random() * 3, blinkT: 0, pop: 1, jump: 0, jumpV: 0, still: 9, c, g: c.getContext('2d'), tex, card, shadow, key: '' };
}
function spawnEnts() {
  ents.forEach(e => { actors.remove(e.card); actors.remove(e.shadow); e.tex.dispose(); e.card.geometry.dispose(); e.card.material.dispose(); });
  const pos = cur(); ents = pos.map((p, i) => makeEnt(i, p, i < pos.length - 1)); spread(pos, true);
}
function spread(pos, snap) {
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
// draw the fox's current pose into its card (only when the pose changes)
function paintFox(e, T) {
  let key, draw;
  const src = k => e.ghost ? ghostOf(k) : IMG[k];
  if (e.walkW > .4 && (e.face === 'R' || e.face === 'L')) {
    // walking across the screen: the side walk cycle (flipped for left)
    const k = 'walk' + (Math.floor(e.walkPh) % 8); key = k + e.face;
    draw = g => { const im = src(k); g.save(); if (e.face === 'L') { g.translate(300, 0); g.scale(-1, 1); } const s = 400 / im.height; g.drawImage(im, 150 - im.width * s / 2, 420 - im.height * s - 4, im.width * s, im.height * s); g.restore(); };
  } else if (e.face === 'U') {
    key = 'back';
    draw = g => { const im = src('fox_back'), s = 400 / im.height; g.drawImage(im, 150 - im.width * s / 2, 420 - im.height * s - 4, im.width * s, im.height * s); };
  } else {
    const fk = FACE[e.ghost ? 'sleep' : e.blinkT > 0 && e.expr === 'calm' ? 'sleep' : e.expr] || 'face_calm';
    key = 'front' + fk + (e.side || '');
    draw = g => {
      const body = src('fox_front'), face = src(fk), s = 400 / body.height, bw = body.width * s, bh = body.height * s;
      g.save(); if (e.side === 'L') { g.translate(300, 0); g.scale(-1, 1); }
      g.drawImage(body, 150 - bw / 2, 420 - bh - 4, bw, bh);
      const fs = bw / 245 * 1.02 * (fk === 'face_worry' ? 245 / 303 : 1), fw = face.width * fs, fh = face.height * fs;
      g.drawImage(face, 151 - fw / 2, 420 - bh - 8 + (fk === 'face_worry' ? 8 : 0), fw, fh);
      g.restore();
    };
  }
  if (key !== e.key) { e.key = key; e.g.clearRect(0, 0, 300, 420); draw(e.g); e.tex.needsUpdate = true; }
}
function placeFox(e, T) {
  const w = wv(e.x, e.y), bd = E.DIRS[e.face] || [0, 0];
  const bump = (e.bumpOff || 0);
  e.card.position.set(w.x + bd[0] * bump, e.jump * .5 + (e.walkW > .1 ? Math.abs(Math.sin(e.walkPh * Math.PI / 4)) * .05 : 0), w.z - bd[1] * bump);
  e.card.quaternion.copy(camera.quaternion);
  const breathe = e.face === 'F' || e.face === 'D' && e.walkW < .4 ? 1 + Math.sin(T * 2.2 + e.i) * .012 : 1;
  e.card.scale.set(1, breathe, 1).multiplyScalar(.7 + .3 * e.pop);
  e.shadow.position.set(w.x, .012, w.z); e.shadow.scale.setScalar(1 - e.jump * .3);
}
function updEnt(e, dt, T) {
  if (e.t < 1) {
    e.t = Math.min(1, e.t + dt * 1000 / e.dur);
    e.x = lerp(e.fx, e.tx, e.t); e.y = lerp(e.fy, e.ty, e.t);
    e.moving = Math.hypot(e.tx - e.fx, e.ty - e.fy) > .3;
    e.bumpOff = e.bump ? Math.sin(e.t * Math.PI) * .14 * e.bump : 0;
    if (e.t >= 1) { e.bumpOff = 0; e.bump = null; e.moving = false; }
    e.still = 0;
  } else e.still += dt;
  if (e.moving) e.walkW = Math.min(1, e.walkW + dt * 12); else if (e.still > .12) e.walkW = Math.max(0, e.walkW - dt * 6);
  e.walkPh += dt * 30 * Math.max(.2, e.walkW);
  e.blink -= dt; if (e.blink < 0) { e.blinkT = .14; e.blink = Math.random() < .2 ? .3 : 2.4 + Math.random() * 3.5; }
  if (e.blinkT > 0) e.blinkT -= dt;
  if (e.exprT > 0) { e.exprT -= dt; if (e.exprT <= 0) e.expr = 'calm'; }
  if (e.jumpV || e.jump > 0) { e.jumpV -= dt * 9; e.jump = Math.max(0, e.jump + e.jumpV * dt * 6); if (e.jump === 0) e.jumpV = 0; }
  if (e.pop < 1) e.pop = Math.min(1, e.pop + dt * 3);
  if (e.t >= 1 && e.still > .45 && e.face !== 'F' && e.face !== 'D') { e.side = e.face === 'L' ? 'L' : 'R'; e.face = 'F'; }
  paintFox(e, T); placeFox(e, T);
}

// ---------------- live objects: doors, plates, exit, decoration ----------------
let doorFx = [], plateFx = [];
function plateHeld(i) {
  const pos = cur();
  return S.R.plates.some(p => p.door === i && (pos.some(e => e.x === p.x && e.y === p.y) || (S.R.pinned || []).some(e => e.x === p.x && e.y === p.y)));
}
let statues = [];
function syncStatues() {
  const want = (S.R.pinned || []).map(p => p.x + ',' + p.y).join(';');
  if (syncStatues.k === want && syncStatues.R === S.R) return; syncStatues.k = want; syncStatues.R = S.R;
  statues.forEach(s => actors.remove(s)); statues = [];
  for (const p of S.R.pinned || []) {   // pinned helper: a grey stone fox
    const c = document.createElement('canvas'); c.width = 300; c.height = 420; const g = c.getContext('2d');
    g.filter = 'grayscale(1) brightness(1.2) contrast(.75)'; const im = IMG.fox_front, s = 400 / im.height; g.drawImage(im, 150 - im.width * s / 2, 420 - im.height * s - 4, im.width * s, im.height * s);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(.75 * 300 / 420, .75).translate(0, .375, 0), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: .05 }));
    const w = wv(p.x, p.y, .1); m.position.copy(w); actors.add(m); statues.push(m);
  }
}
function updWorld(dt, T) {
  const R = S.R;
  doorFx.forEach((f, i) => {
    f.open += ((f.target || 0) - f.open) * Math.min(1, dt * 9);
    f.lit += ((hover === i ? 1 : 0) - f.lit) * Math.min(1, dt * 6);
    const o = doorObjs[i]; if (!o) return;
    o.panel.position.y = -f.open * .95; o.panel.visible = f.open < .97;
    const pulse = .55 + .25 * Math.sin(T * 2.4 + i) + f.lit * .5 + f.open * .6 + (f.flash || 0);
    o.glyph.quaternion.copy(camera.quaternion);
    o.glyph.rotateY(f.open * T * 2);
    o.glyph.position.y = 1.32 + Math.sin(T * 1.8 + i) * .03 + f.open * .1;
    o.glyph.userData.mat.opacity = clamp(.55 + pulse * .4, 0, 1);
    o.glyph.userData.halo.material.opacity = clamp(.12 + pulse * .2, 0, .6);
    o.glyph.scale.setScalar(1 + (f.flash || 0) * .3);
    if (f.flash > 0) f.flash = Math.max(0, f.flash - dt * 2.5);
    if (o.pips.length) { const tm = (cur().timers || [])[i] || 0, held = plateHeld(i); o.pips.forEach((p, k) => p.material.opacity = (p.material.transparent = true, held || k < tm ? 1 : .25)); }
  });
  plateFx.forEach((f, j) => {
    f.on += ((f.target || 0) - f.on) * Math.min(1, dt * 12);
    const o = plateObjs[j]; if (!o) return;
    const hov = hover >= 0 && R.plates[j].door === hover ? 1 : 0;
    o.top.position.y = .09 - f.on * .04; o.mark.position.y = .125 - f.on * .04; o.ring.position.y = .1 - f.on * .03;
    o.mat.opacity = clamp(.55 + f.on * .45 + hov * .3 + .08 * Math.sin(T * 3 + j), 0, 1);
  });
  if (exitObj) {
    const near = S.nearExit || 0;
    exitObj.ring.rotation.y += dt * (.7 + near * 2);
    exitObj.ring.position.y = .58 + Math.sin(T * 1.5) * .04;
    exitObj.beam.material.opacity = .08 + near * .1 + Math.sin(T * 2) * .02;
    const p = exitObj.sparks.geometry.attributes.position;
    for (let k = 0; k < p.count; k++) { const ph = (T * (.3 + near * .3) + k / p.count) % 1, a = k * 2.4; p.setXYZ(k, Math.cos(a) * .22, .2 + ph * 1.4, Math.sin(a) * .22); }
    p.needsUpdate = true;
  }
  for (const m of minis) m.mesh.position.y = m.base.y + Math.sin(T * .8 + m.ph) * .12;
  for (const m of pebbles) { m.mesh.position.y = m.base.y + Math.sin(T * 1.1 + m.ph) * .1; m.mesh.rotation.y += dt * .3; }
  syncStatues();
}

// ---------------- overlay (2D canvas over the 3D view): hints, links, particles, tick row ----------------
let hint = null, hover = -1;
function drawHint(T) {
  if (!hint) return;
  if (performance.now() > hint.until) { hint = null; return; }
  octx.save(); octx.font = '700 17px "Readex Pro", system-ui, sans-serif'; octx.textAlign = 'center'; octx.textBaseline = 'middle';
  hint.cells.forEach((c, k) => {
    const p = scr(c.x, c.y, .05), a = .6 + .3 * Math.sin(T * 4 - k * .5);
    octx.fillStyle = `rgba(255,255,255,${a * .75})`; octx.beginPath(); octx.ellipse(p[0], p[1], 15, 10, 0, 0, Math.PI * 2); octx.fill();
    octx.fillStyle = `rgba(110,60,25,${a + .1})`; octx.fillText(AR(c.t), p[0], p[1] + 1);
  });
  octx.restore();
}
function drawLink(T) {
  if (hover < 0) return;
  const d = S.R.doors[hover], G = GLYPH[hover % 4];
  octx.save(); octx.fillStyle = G.c; octx.shadowColor = G.c; octx.shadowBlur = 8;
  for (const p of S.R.plates) {
    if (p.door !== hover) continue;
    const a = wv(p.x, p.y, .15), b = wv(d.x, d.y, 1.4), n = 16;
    for (let k = 0; k < n; k++) {
      const t = (k + (T * 1.4) % 1) / n, v = a.clone().lerp(b, t); v.y += Math.sin(t * Math.PI) * 1.1;
      const q = scrW(v); octx.beginPath(); octx.arc(q[0], q[1], 3.5 * (.6 + .4 * Math.sin(t * Math.PI)), 0, Math.PI * 2); octx.fill();
    }
  }
  octx.restore();
}
function drawTicks(T) {
  const R = S.R, n = R.L, done = S.acts.length, w = Math.min(VW - 130, n * 22), y = VH - 22, x0 = (VW - w) / 2;
  octx.save(); octx.fillStyle = 'rgba(30,50,60,.35)'; octx.beginPath(); octx.roundRect(x0 - 12, y - 13, w + 24, 26, 13); octx.fill(); octx.restore();
  for (let k = 0; k < n; k++) {
    const X = x0 + w * (k + .5) / n, left = n - done, past = k < done, warn = !past && left <= 3;
    octx.fillStyle = past ? 'rgba(255,255,255,.25)' : warn ? '#ff8a6e' : '#ffd27a';
    octx.beginPath(); for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2; octx[q ? 'lineTo' : 'moveTo'](X + Math.cos(a) * 5, y + Math.sin(a) * 5); } octx.fill();
  }
  for (let k = 0; k < R.E; k++) {
    const X = x0 - 30 - k * 26, im = ghostOf('face_sleep'); if (!im) continue;
    octx.save(); octx.globalAlpha = k < S.echoes.length ? 1 : .35; octx.drawImage(im, X - 11, y - 15, 22, 30); octx.restore();
  }
}
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
    octx.save(); octx.translate(p.x, p.y); octx.rotate(p.r); octx.globalAlpha = p.life; octx.fillStyle = p.c;
    octx.beginPath(); octx.moveTo(-p.s, p.s * .6); octx.lineTo(0, -p.s); octx.lineTo(p.s, p.s * .6); octx.fill(); octx.restore();
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

// ===== صدى — "Najd at sunset": my own art direction for the 3D mobile version =====
// Loaded after parts3d/head.js; its function declarations replace the island theme's (same names).
// Inspired by Najdi mud-brick architecture (stepped crenellations, triangular openings, painted
// wooden doors, palm-trunk beams) at golden hour. It is an artistic interpretation, not a survey.
// Light: a low warm sun from the left throws long shadows; a cool sky fills the shade; warm haze far away.

const NAJD = {
  sand: '#e9b27a', sandDk: '#cf9a62', mud: '#c27a45', mudDk: '#a9622f', mudLt: '#d89a63', plaster: '#ecd0a6',
  tile: ['#f3dcb6', '#edd2a6', '#f6e4c4'], grout: '#9c6b43', wood: '#6e4528', woodLt: '#8a5a35', palm: '#7d5c3a',
  frond: '#5e8f37', frondLt: '#7aa84a', brass: '#c99a45', haze: 0xf2b58a,
};
// --- light and air (adjust the scene made in head.js) ---
scene.children.filter(o => o.isHemisphereLight).forEach(h => { h.color.set(0xd6dcff); h.groundColor.set(0xc0703a); h.intensity = .7; });
sun.color.set(0xffc480); sun.intensity = 3.1;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 3;
scene.fog = new THREE.Fog(NAJD.haze, 44, 64);
renderer.toneMappingExposure = 1.18;
document.body.classList.add('najd');

// --- extra shapes ---
function crenel(r, x, y, z, s) {   // one stepped Najdi crenellation (a small pyramid on a step)
  return [
    paint(place(chamferBox(s, s * .35, s, s * .06), x, y + s * .17, z), NAJD.mudLt, .08, r),
    paint(place(flat(new THREE.ConeGeometry(s * .66, s * .62, 4)), x, y + s * .35 + s * .31, z, Math.PI / 4), NAJD.mudLt, .08, r),
  ];
}
function vent(r, x, y, z, s, facing) {   // a small triangular opening, dark, on a wall face
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-s / 2, 0, 0, s / 2, 0, 0, 0, s * .9, 0], 3)); g.computeVertexNormals();
  if (facing === 'x') g.rotateY(Math.PI / 2);
  return paint(place(g, x, y, z), '#4a2615', .05, r);
}
function beamEnd(r, x, y, z, along) {   // a palm-trunk beam end sticking out of the wall
  const g = flat(new THREE.CylinderGeometry(.045, .045, .2, 6)); g.rotateX(Math.PI / 2); if (along === 'x') g.rotateY(Math.PI / 2);
  return paint(place(g, x, y, z), NAJD.wood, .15, r);
}
function palm(r, x, z, h) {   // segmented trunk leaning a little, a crown of drooping fronds, dates
  const out = [], lean = (r() - .5) * .25, seg = 7;
  let px = x, pz = z;
  for (let k = 0; k < seg; k++) {
    const y = h * k / seg, s = .085 - k * .004;
    out.push(paint(place(flat(new THREE.CylinderGeometry(s * .9, s, h / seg * 1.05, 6)), px, y + h / seg / 2, pz, r() * 6), k % 2 ? NAJD.palm : '#6f5032', .1, r));
    px += lean * h / seg * .5; pz += lean * h / seg * .25;
  }
  const n = 10;
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI * 2 + r() * .3, len = .62 + r() * .2, droop = .5 + r() * .35;
    const g = new THREE.PlaneGeometry(len, .16, 6, 1); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = (p.getX(i) + len / 2) / len; p.setY(i, p.getY(i) * (1 - u * .85)); p.setZ(i, -droop * u * u * .9); }
    g.translate(len / 2, 0, 0); g.rotateX(-Math.PI / 2); g.rotateZ(-(.15 + r() * .2)); g.rotateY(a);
    const f = flat(g); out.push(paint(place(f, px, h, pz), k % 2 ? NAJD.frond : NAJD.frondLt, .14, r));
  }
  for (let k = 0; k < 3; k++) out.push(paint(place(flat(new THREE.IcosahedronGeometry(.06, 0)), px + (r() - .5) * .15, h - .1, pz + (r() - .5) * .15), '#b8572b', .1, r));
  return out;
}
function jar(r, x, z, s) {   // a clay water jar
  const pts = [[0, 0], [.16, .02], [.24, .18], [.22, .36], [.12, .48], [.1, .56], [.13, .6]].map(([a, b]) => new THREE.Vector2(a * s, b * s));
  return paint(place(flat(new THREE.LatheGeometry(pts, 9)), x, 0, z, r() * 6), '#b8643a', .12, r);
}
function grassTuft(r, x, z, s) {
  const out = [];
  for (let k = 0; k < 6; k++) { const a = r() * 6.28, d = r() * s * .4; out.push(paint(place(flat(new THREE.ConeGeometry(s * .06, s * (.5 + r() * .5), 3)), x + Math.cos(a) * d, s * .2, z + Math.sin(a) * d, r() * 6, [1, 1, 1], (r() - .5) * .6, (r() - .5) * .6), r() < .5 ? '#a9a14a' : '#8f8a3c', .15, r)); }
  return out;
}
// the painted wooden door: rows of triangles and dots in red, teal, yellow and white, the door's mark in the middle
const doorTex = {};
function najdDoorTexture(g) {
  if (doorTex[g]) return doorTex[g];
  const c = document.createElement('canvas'); c.width = 256; c.height = 320; const x = c.getContext('2d');
  x.fillStyle = '#7b4a28'; x.fillRect(0, 0, 256, 320);
  for (let k = 0; k < 4; k++) { x.fillStyle = k % 2 ? '#86522d' : '#744523'; x.fillRect(k * 64, 0, 62, 320); }   // planks
  const cols = ['#c8432f', '#2f8f8a', '#e7b13b', '#f1e6cf'];
  const band = (y, h, flip) => {
    for (let i = 0; i < 8; i++) {
      x.fillStyle = cols[(i + (flip ? 2 : 0)) % 4];
      x.beginPath(); const X = 16 + i * 28; if (flip) { x.moveTo(X, y); x.lineTo(X + 28, y); x.lineTo(X + 14, y + h); } else { x.moveTo(X, y + h); x.lineTo(X + 28, y + h); x.lineTo(X + 14, y); } x.fill();
    }
  };
  x.strokeStyle = '#f1e6cf'; x.lineWidth = 4; x.strokeRect(12, 12, 232, 296);
  band(22, 26, false); band(48, 26, true); band(246, 26, false); band(272, 26, true);
  for (let i = 0; i < 9; i++) { x.fillStyle = cols[i % 4]; x.beginPath(); x.arc(24 + i * 26, 92, 6, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(24 + i * 26, 230, 6, 0, Math.PI * 2); x.fill(); }
  // the door's own mark (colour + shape) in a cream medallion
  x.fillStyle = '#f1e6cf'; x.beginPath(); x.arc(128, 160, 50, 0, Math.PI * 2); x.fill();
  x.save(); x.translate(128, 160); glyphPath2(x, g, 34); x.fillStyle = GLYPH[g % 4].c; x.fill(); x.lineWidth = 4; x.strokeStyle = '#5a2f17'; x.stroke(); x.restore();
  x.fillStyle = '#2b1a0f'; x.beginPath(); x.arc(206, 168, 8, 0, Math.PI * 2); x.fill();   // the ring pull
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (doorTex[g] = t);
}
function glyphPath2(c, g, r) {
  const G = GLYPH[g % 4]; c.beginPath();
  if (!G.n) { c.arc(0, 0, r, 0, Math.PI * 2); return; }
  for (let k = 0; k < G.n; k++) { const a = (G.rot || 0) - Math.PI / 2 + k * Math.PI * 2 / G.n + (G.n === 4 && !G.rot ? Math.PI / 4 : 0); k ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  c.closePath();
}

// --- the room ---
let motes = null, prints = [], lastCells = [];
function buildRoom() {
  const R = S.R;
  if (built === R) return;
  built = R;
  world.clear(); actors.children.filter(o => o.userData.room).forEach(o => actors.remove(o));
  doorObjs = []; plateObjs = []; glyphObjs = []; minis = []; pebbles = []; prints.forEach(p => actors.remove(p.m)); prints = []; lastCells = [];
  const r = rng(R.W * 131 + R.H * 7 + S.n * 13);
  const stat = [];
  const cx = (R.W - 1) / 2, cz = (R.H - 1) / 2;
  // desert all round: low-poly dunes, rippled; far away they fade into the warm haze
  {
    const g = new THREE.PlaneGeometry(70, 70, 46, 46); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const X = p.getX(i), Z = p.getZ(i), d = Math.hypot(X, Z);
      const dune = Math.sin(X * .23 + Z * .11) * .9 + Math.sin(X * .07 - Z * .19 + 1.3) * 1.4 + Math.sin(X * .5 + Z * .4) * .12;
      const k = clamp((d - 6) / 10, 0, 1);   // flat near the room, dunes further out
      p.setY(i, -.42 + dune * k * k * 1.1 + (r() - .5) * .04);
    }
    const f = flat(g); f.translate(cx, 0, cz);
    stat.push(paint(f, NAJD.sand, .06, r));
  }
  // the courtyard plinth: a raised plaster platform with a stepped edge
  const m = .55;
  stat.push(paint(place(chamferBox(R.W + m * 2, .3, R.H + m * 2, .06), cx, -.28, cz), NAJD.plaster, .05, r, '#e4c093'));
  stat.push(paint(place(chamferBox(R.W + m * 2 + .5, .14, R.H + m * 2 + .5, .05), cx, -.42, cz), NAJD.mudLt, .05, r));
  // floor: plaster tiles with darker joints
  stat.push(paint(place(new THREE.BoxGeometry(R.W + .04, .08, R.H + .04), cx, -.09, cz), NAJD.grout, .05, r));
  const isWall = (x, y) => x >= 0 && y >= 0 && x < R.W && y < R.H && R.wall[y * R.W + x] === 1;
  for (let y = 0; y < R.H; y++) for (let x = 0; x < R.W; x++) {
    if (isWall(x, y)) continue;
    const X = x, Z = R.H - 1 - y, tone = NAJD.tile[Math.floor(r() * 3)];
    stat.push(paint(place(chamferBox(.93, .12, .93, .035), X, -.055 + (r() - .5) * .012, Z, (r() - .5) * .03), tone, .06, r));
  }
  // mud-brick walls: plastered body, a lighter band, stepped crenellations, triangular openings, beam ends
  for (let y = 0; y < R.H; y++) for (let x = 0; x < R.W; x++) {
    if (!isWall(x, y)) continue;
    const X = x, Z = R.H - 1 - y;
    const runX = isWall(x - 1, y) || isWall(x + 1, y) || E.doorAt(R, x - 1, y) >= 0 || E.doorAt(R, x + 1, y) >= 0;
    const tower = !runX && !isWall(x, y - 1) && !isWall(x, y + 1);
    const h = tower ? .82 : .62;
    stat.push(paint(place(chamferBox(runX ? 1.01 : .9, h, runX ? .82 : .9, .035), X, h / 2, Z), [NAJD.mud, '#bb7442', '#c6804b'][Math.floor(r() * 3)], .07, r));
    stat.push(paint(place(chamferBox(runX ? 1.02 : .92, .07, runX ? .86 : .92, .02), X, h - .06, Z), NAJD.mudLt, .05, r));
    const s = .2;
    if (runX) for (const u of [-.32, 0, .32]) stat.push(...crenel(r, X + u, h, Z, s));
    else for (const [u, v] of [[-.28, -.28], [.28, -.28], [-.28, .28], [.28, .28]]) stat.push(...crenel(r, X + u, h, Z + v, s));
    if (runX) {
      if ((x + y) % 2 === 0) stat.push(vent(r, X + (r() - .5) * .2, h * .52, Z + .413, .13));
      if (r() < .4) stat.push(beamEnd(r, X + (r() - .5) * .5, h * .78, Z + .45));
    } else {
      stat.push(vent(r, X, h * .55, Z + .453, .12));
      stat.push(vent(r, X + .453, h * .55, Z, .12, 'x'));
    }
  }
  // doors: mud posts, a palm-wood lintel with beam ends; the painted door swings open on its hinge
  R.doors.forEach((d, i) => {
    const X = d.x, Z = R.H - 1 - d.y, inv = d.kind === 'inverse';
    for (const s of [-1, 1]) stat.push(paint(place(chamferBox(.13, 1.0, .84, .03), X + s * .45, .5, Z), NAJD.mud, .06, r));
    stat.push(paint(place(chamferBox(1.08, .12, .3, .02), X, 1.02, Z + .2), NAJD.wood, .1, r));
    for (const s of [-1, 1]) stat.push(beamEnd(r, X + s * .58, 1.02, Z + .2, 'x'));
    stat.push(...crenel(r, X - .3, 1.08, Z, .18), ...crenel(r, X + .3, 1.08, Z, .18));
    const hinge = new THREE.Group(); hinge.position.set(X - .38, 0, Z + .05);
    const tex = najdDoorTexture(i);
    const mats = [new THREE.MeshStandardMaterial({ color: '#6b4126', roughness: .9 }), new THREE.MeshStandardMaterial({ color: '#6b4126', roughness: .9 }),
      new THREE.MeshStandardMaterial({ color: '#6b4126', roughness: .9 }), new THREE.MeshStandardMaterial({ color: '#6b4126', roughness: .9 }),
      new THREE.MeshStandardMaterial({ map: tex, roughness: .85, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: .22 }), new THREE.MeshStandardMaterial({ map: tex, roughness: .85, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: .22 })];
    const panel = new THREE.Mesh(new THREE.BoxGeometry(.76, .9, .06), mats); panel.position.set(.38, .46, 0); panel.castShadow = true; panel.receiveShadow = true;
    hinge.add(panel); world.add(hinge);
    const glyph = makeGlyph(i, inv); glyph.position.set(X, 1.5, Z); glyph.userData.room = true; actors.add(glyph);
    const pips = [];
    if (d.kind === 'timed') for (let k = 0; k < 3; k++) { const p = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6), new THREE.MeshBasicMaterial({ color: GLYPH[i % 4].c, transparent: true })); p.position.set(X + (k - 1) * .13, 1.28, Z + .2); world.add(p); pips.push(p); }
    doorObjs.push({ panel: hinge, glyph, pips, swing: true });
  });
  // plates: limestone discs with a brass ring and the door's mark inlaid, glowing when pressed
  const brass = new THREE.MeshStandardMaterial({ color: NAJD.brass, metalness: .75, roughness: .35 });
  R.plates.forEach((p, j) => {
    const X = p.x, Z = R.H - 1 - p.y, G = GLYPH[p.door % 4], inv = R.doors[p.door].kind === 'inverse';
    const grp = new THREE.Group(); grp.position.set(X, 0, Z);
    const base = new THREE.Mesh(paint(flat(new THREE.CylinderGeometry(.38, .41, .06, 12)), '#d9c3a0', .06, r), MAT.solid); base.position.y = .01; base.receiveShadow = true; grp.add(base);
    const top = new THREE.Mesh(paint(flat(new THREE.CylinderGeometry(.3, .3, .05, 12)), '#e6d3b2', .05, r), MAT.solid); top.position.y = .05; top.receiveShadow = true; grp.add(top);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.33, .025, 6, 32), brass); ring.rotation.x = -Math.PI / 2; ring.position.y = .045; grp.add(ring);
    const mat = new THREE.MeshBasicMaterial({ color: G.c, transparent: true });
    const mark = new THREE.Mesh(glyphShape(p.door, .13, inv), mat); mark.rotation.x = -Math.PI / 2; mark.position.y = .082; grp.add(mark);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(.42, 24), new THREE.MeshBasicMaterial({ color: G.c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = .09; grp.add(glow);
    world.add(grp);
    plateObjs.push({ grp, top, ring: glow, mat, mark, najd: true });
  });
  // the exit: a tall gateway with light pouring through it, a lantern hanging in the arch
  {
    const X = R.exit.x, Z = R.H - 1 - R.exit.y, grp = new THREE.Group(); grp.position.set(X, 0, Z);
    const parts = [];
    for (const s of [-1, 1]) parts.push(paint(place(chamferBox(.16, 1.3, .3, .03), s * .38, .65, -.25), NAJD.mudLt, .05, r));
    parts.push(paint(place(chamferBox(.96, .16, .34, .03), 0, 1.36, -.25), NAJD.mud, .05, r));
    for (const u of [-.3, 0, .3]) parts.push(...crenel(r, u, 1.44, -.25, .17));
    parts.push(paint(place(chamferBox(.9, .05, .7, .02), 0, .01, 0), '#f0dcb8', .04, r));
    const gm = merged(parts); grp.add(gm);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffd38a, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const doorLight = new THREE.Mesh(new THREE.PlaneGeometry(.6, 1.26), lightMat); doorLight.position.set(0, .64, -.25); grp.add(doorLight);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(.6, 28), new THREE.MeshBasicMaterial({ color: 0xffc56a, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(0, .03, .05); pool.scale.set(1, .7, 1); grp.add(pool);
    const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(.07, 0), new THREE.MeshBasicMaterial({ color: 0xfff0c2 })); lantern.position.set(0, 1.12, -.08); grp.add(lantern);
    const sparks = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(16 * 3), 3)),
      new THREE.PointsMaterial({ color: 0xffd68a, size: .06, transparent: true, opacity: .9, depthWrite: false, blending: THREE.AdditiveBlending }));
    grp.add(sparks);
    world.add(grp); exitObj = { grp, ring: lantern, beam: doorLight, sparks, pool, najd: true };
  }
  // around the courtyard: palms, clay jars, desert grass, a few stones (never on the floor)
  const onYard = (x, z) => x > -1.2 && x < R.W + .2 && z > -1.2 && z < R.H + .2;
  const ring = (k, n, off) => { const t = k / n * Math.PI * 2, rx = R.W / 2 + m + off, rz = R.H / 2 + m + off; return [cx + Math.cos(t) * rx * (1 + (r() - .5) * .2), cz + Math.sin(t) * rz * (1 + (r() - .5) * .2)]; };
  const ex = R.exit.x, ez = R.H - 1 - R.exit.y;
  for (let k = 0; k < 9; k++) { const p = ring(k + r() * .4, 9, 1.1 + r() * 1.4); if (onYard(p[0], p[1]) || p[1] > cz + R.H * .55 || Math.hypot(p[0] - ex, p[1] - ez) < 1.5) continue; stat.push(...palm(r, p[0], p[1], 1.4 + r() * .8)); }
  for (let k = 0; k < 6; k++) { const p = ring(r() * 12, 12, .9 + r() * .6); if (!onYard(p[0], p[1])) stat.push(place(jar(r, 0, 0, .55 + r() * .3), p[0], -.42, p[1])); }
  for (let k = 0; k < 24; k++) { const p = ring(r() * 24, 24, .7 + r() * 3); if (!onYard(p[0], p[1])) stat.push(...grassTuft(r, p[0], p[1], .35 + r() * .2).map(g => place(g, 0, -.42, 0))); }
  for (let k = 0; k < 10; k++) { const p = ring(r() * 10, 10, .8 + r() * 3); if (!onYard(p[0], p[1])) stat.push(place(rock(r, .08 + r() * .1, '#c9a27a'), p[0], -.38, p[1])); }
  world.add(merged(stat));
  // dust motes drifting in the low sun
  const N = 140, mp = new Float32Array(N * 3);
  for (let k = 0; k < N; k++) { mp[k * 3] = cx + (r() - .5) * (R.W + 6); mp[k * 3 + 1] = r() * 2.2; mp[k * 3 + 2] = cz + (r() - .5) * (R.H + 6); }
  motes = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(mp, 3)),
    new THREE.PointsMaterial({ color: 0xffd9a0, size: .035, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending }));
  world.add(motes);
  const sc = sun.shadow.camera, ext = Math.max(R.W, R.H) * .8 + 4;
  sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = .5; sc.far = 50; sc.updateProjectionMatrix();
}

// --- every frame: doors swing, plates glow, the gate breathes, dust drifts, echoes leave glowing footprints ---
const printGeo = new THREE.CircleGeometry(.07, 10); printGeo.rotateX(-Math.PI / 2);
function updWorld(dt, T) {
  const R = S.R, c = roomCentre();
  sun.position.copy(c).add(new THREE.Vector3(-10, 5.2, 4.5)); sun.target.position.copy(c);   // low sun: long shadows
  doorFx.forEach((f, i) => {
    f.open += ((f.target || 0) - f.open) * Math.min(1, dt * 7);
    f.lit += ((hover === i ? 1 : 0) - f.lit) * Math.min(1, dt * 6);
    const o = doorObjs[i]; if (!o) return;
    o.panel.rotation.y = f.open * 1.9 + (f.flash || 0) * Math.sin(T * 60) * .04;
    const pulse = .55 + .25 * Math.sin(T * 2.4 + i) + f.lit * .5 + f.open * .6 + (f.flash || 0);
    o.glyph.quaternion.copy(camera.quaternion); o.glyph.rotateY(f.open * T * 2);
    o.glyph.position.y = 1.5 + Math.sin(T * 1.8 + i) * .03 + f.open * .08;
    o.glyph.userData.mat.opacity = clamp(.55 + pulse * .4, 0, 1);
    o.glyph.userData.halo.material.opacity = clamp(.12 + pulse * .2, 0, .6);
    o.glyph.scale.setScalar(1 + (f.flash || 0) * .3);
    if (f.flash > 0) f.flash = Math.max(0, f.flash - dt * 2.5);
    if (o.pips.length) { const tm = (cur().timers || [])[i] || 0, held = plateHeld(i); o.pips.forEach((p, k) => (p.material.opacity = held || k < tm ? 1 : .25)); }
  });
  plateFx.forEach((f, j) => {
    f.on += ((f.target || 0) - f.on) * Math.min(1, dt * 12);
    const o = plateObjs[j]; if (!o) return;
    const hov = hover >= 0 && R.plates[j].door === hover ? 1 : 0;
    o.top.position.y = .05 - f.on * .03; o.mark.position.y = .082 - f.on * .03;
    o.mat.opacity = clamp(.6 + f.on * .4 + hov * .3, 0, 1);
    o.ring.material.opacity = clamp(f.on * .45 + hov * .25 + .05 * Math.sin(T * 3 + j), 0, .7);
  });
  if (exitObj) {
    const near = S.nearExit || 0;
    exitObj.beam.material.opacity = .55 + near * .35 + Math.sin(T * 2) * .06;
    exitObj.pool.material.opacity = .25 + near * .3;
    exitObj.ring.position.y = 1.12 + Math.sin(T * 1.6) * .015; exitObj.ring.rotation.y += dt;
    const p = exitObj.sparks.geometry.attributes.position;
    for (let k = 0; k < p.count; k++) { const ph = (T * (.25 + near * .3) + k / p.count) % 1, a = k * 2.4; p.setXYZ(k, Math.cos(a) * .25, .1 + ph * 1.3, -.2 + Math.sin(a) * .12); }
    p.needsUpdate = true;
  }
  if (motes) {
    const p = motes.geometry.attributes.position, cx = (R.W - 1) / 2;
    for (let k = 0; k < p.count; k++) { let x = p.getX(k) + dt * (.12 + (k % 5) * .02), y = p.getY(k) + Math.sin(T * .7 + k) * dt * .05; if (x > cx + R.W / 2 + 3) x -= R.W + 6; p.setXY(k, x, y); }
    p.needsUpdate = true;
  }
  // footprints: every cell a fox walks into keeps a small mark for a moment (echoes glow blue)
  ents.forEach((e, i) => {
    const cell = Math.round(e.x) + ',' + Math.round(e.y);
    if (lastCells[i] !== undefined && lastCells[i] !== cell && e.moving) {
      const m = new THREE.Mesh(printGeo, new THREE.MeshBasicMaterial({ color: e.ghost ? 0x8fd8ff : 0x7a4a26, transparent: true, opacity: e.ghost ? .7 : .35, depthWrite: false, blending: e.ghost ? THREE.AdditiveBlending : THREE.NormalBlending }));
      const w = wv(e.x, e.y, .012); m.position.set(w.x + (Math.random() - .5) * .12, w.y, w.z + (Math.random() - .5) * .12); m.userData.room = true;
      actors.add(m); prints.push({ m, life: e.ghost ? 3 : 2 });
    }
    lastCells[i] = cell;
  });
  prints = prints.filter(p => { p.life -= dt; p.m.material.opacity = Math.max(0, p.m.material.opacity * Math.min(1, p.life)); if (p.life <= 0) { actors.remove(p.m); p.m.material.dispose(); return false; } return true; });
  syncStatues();
}
function roomBox() {
  const R = S.R, pts = [];
  for (const [x, y] of [[-1, -1], [R.W, -1], [-1, R.H], [R.W, R.H]]) for (const h of [-.45, 1.6]) pts.push(wv(x, y, h));
  return pts;
}

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

// two fingers: pinch to see the whole room (or back to following the fox); a double tap toggles too
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
cv.addEventListener('pointerup', e => {
  const now = performance.now();
  if (pts.size === 1 && now - lastTap < 280 && cam.follow) { cam.overview = !cam.overview; layout(); S.walk = []; }
  lastTap = now; pts.delete(e.pointerId);
});
cv.addEventListener('pointercancel', e => pts.delete(e.pointerId));

// ---------------- frame ----------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - last) / 1000); last = now; const T = now / 1000;
  if (!S.R || !built) return;
  const heroE = ents[ents.length - 1];
  S.nearExit = heroE ? clamp(1 - (Math.hypot(heroE.x - S.R.exit.x, heroE.y - S.R.exit.y) - 1) / 3, 0, 1) : 0;
  music(dt); updCam(dt);
  ents.forEach(e => updEnt(e, dt, T));
  updWorld(dt, T);
  // room entrance: the island rises into place; on a win it sinks away; it breathes gently in the air
  const ent = clamp((now - (S.enterT || 0)) / 800, 0, 1), out = S.transT ? clamp((now - S.transT) / 380, 0, 1) : 0;
  if (ent >= 1 && S.transT && !S.won) S.transT = 0;
  const lift = -(1 - ease(ent)) * 3 - ease(out) * 3 + Math.sin(T * .8) * .04;
  world.position.y = actors.position.y = lift;
  renderer.render(scene, camera);
  octx.setTransform(DPR, 0, 0, DPR, 0, 0); octx.clearRect(0, 0, VW, VH);
  drawHint(T); drawLink(T); drawParts(dt);
  if (S.rewindK) { octx.fillStyle = `rgba(143,216,255,${Math.sin(S.rewindK * Math.PI) * .14})`; octx.fillRect(0, 0, VW, VH); }
  drawTicks(T);
}

// test hooks (used by the automated play test; harmless for players)
window.__heroBox = () => { const e = ents[ents.length - 1], p = scr(e.x, e.y), t = scr(e.x, e.y, FOX_H * 1.15); const h = (p[1] - t[1]) * 1.15; return { x: Math.max(0, p[0] - h * .5), y: Math.max(0, t[1] - h * .08), width: h, height: h * 1.1 }; };
window.__sada = { S, doAction, loadRoom, cur, get ents() { return ents; }, startDemo, showHint, setExpr, cam, layout };

load();
window.addEventListener('resize', resize);
loaded.then(() => { const r = cv.getBoundingClientRect(); VW = r.width; VH = r.height; loadRoom(S.n); resize(); $('bSound').classList.toggle('off', S.muted); requestAnimationFrame(frame); });
})();

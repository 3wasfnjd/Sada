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

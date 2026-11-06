import * as THREE from 'three';

const E = window.EchoLogic;
const $ = id => document.getElementById(id);
const AR = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[+d]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOutBack = k => { const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const TICK = 165;            // ms per tick
const START_HELP = 2, MAX_HELP = 5;

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
    setTimeout(() => decodeSamples(), 0);
    // calm background: a soft desert breeze plus a rare, distant chime (no constant drone)
    const wlen = ctx.sampleRate * 4, nb = ctx.createBuffer(1, wlen, ctx.sampleRate), nd = nb.getChannelData(0);
    let b0 = 0; for (let i = 0; i < wlen; i++) { b0 = .985 * b0 + .015 * (Math.random() * 2 - 1); nd[i] = b0 * 3; } // brown-ish noise
    const wind = ctx.createBufferSource(); wind.buffer = nb; wind.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 420; wf.Q.value = .3;
    const wg = ctx.createGain(); wg.gain.value = .045;
    const sway = ctx.createOscillator(); sway.frequency.value = .045; const sg = ctx.createGain(); sg.gain.value = .025;
    sway.connect(sg); sg.connect(wg.gain); sway.start();
    wind.connect(wf); wf.connect(wg); wg.connect(master); wind.start();
    const chime = () => {
      if (A.ctx && !A.muted) { const n = [0, 2, 4, 5, 7][Math.floor(Math.random() * 5)] + 10; tone(note(n), 0, 3.2, 'sine', .022, true, .4); }
      setTimeout(chime, 9000 + Math.random() * 9000);
    };
    setTimeout(chime, 6000);
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

// ---------------- swappable assets ----------------
// Every slot is optional. An empty slot keeps the built-in procedural look.
// The manifest lives in the page (<script id="asset-manifest">); see docs/ASSETS.md.
const MANIFEST = (() => { try { return JSON.parse(document.getElementById('asset-manifest').textContent) || {}; } catch (e) { return {}; } })();
const ASSET = { tex: {}, snd: {}, buf: {} };
const MODEL_SLOTS = ['floor', 'wall', 'door', 'plate', 'exit', 'hero'];
const LIST_SLOTS = ['doorFrames', 'doorPanels', 'plates'];   // one model per door colour (amber, pink, mint, violet)
// pieces from tools/blender/pieces.py: Sada_glow / Sada_haze carry their colour in vertex colours
function prepModel(gltf) {
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    const n = (o.material && o.material.name) || '';
    if (n.startsWith('Sada_glow')) o.material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, name: n });
    else if (n.startsWith('Sada_haze')) o.material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, name: n });
    o.castShadow = !n.startsWith('Sada_haze');
  });
  gltf.scene.traverse(o => { if (o.isLight) o.visible = false; });
  return gltf;
}
async function loadAssets() {
  const wanted = MODEL_SLOTS.filter(k => MANIFEST[k] && MANIFEST[k].url);
  const lists = LIST_SLOTS.filter(k => Array.isArray(MANIFEST[k]) && MANIFEST[k].some(e => e && e.url));
  if (wanted.length || lists.length) {
    try {
      const [{ GLTFLoader }, SU] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/utils/SkeletonUtils.js')]);
      ASSET.SkeletonUtils = SU;
      const loader = new GLTFLoader();
      const one = async cfg => { try { return { gltf: prepModel(await loader.loadAsync(cfg.url)), cfg }; } catch (e) { console.warn('[assets] could not load', cfg.url, e); return null; } };
      await Promise.all(wanted.map(async k => { ASSET[k] = await one(MANIFEST[k]); }));
      await Promise.all(lists.map(async k => { ASSET[k] = await Promise.all(MANIFEST[k].map(c => c && c.url ? one(c) : null)); }));
    } catch (e) { console.warn('[assets] glTF loader unavailable', e); }
  }
  const tl = new THREE.TextureLoader();
  for (const [k, url] of Object.entries(MANIFEST.textures || {})) {
    if (!url) continue;
    try { const t = await tl.loadAsync(url); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; ASSET.tex[k] = t; }
    catch (e) { console.warn('[assets] texture failed', k, e); }
  }
  // texture slots override the procedural ones (glow, beam, tile, wall)
  for (const k of ['glow', 'beam']) if (ASSET.tex[k]) TEX[k] = ASSET.tex[k];
  if (ASSET.tex.tile) { ASSET.tex.tile.wrapS = ASSET.tex.tile.wrapT = THREE.RepeatWrapping; M.tile.map = ASSET.tex.tile; M.tile.needsUpdate = true; }
  if (ASSET.tex.wall) { ASSET.tex.wall.wrapS = ASSET.tex.wall.wrapT = THREE.RepeatWrapping; M.wall.map = M.door.map = ASSET.tex.wall; M.wall.needsUpdate = M.door.needsUpdate = true; }
  for (const [k, url] of Object.entries(MANIFEST.sounds || {})) if (url) ASSET.snd[k] = url;
}
const assetsReady = loadAssets();

function cfgMatrix(cfg) {
  return new THREE.Matrix4().compose(new THREE.Vector3(0, cfg.offsetY || 0, 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (cfg.rotY || 0) * Math.PI / 180, 0)),
    new THREE.Vector3().setScalar(cfg.scale ?? 1));
}
function applyCfg(obj, cfg) { obj.applyMatrix4(cfgMatrix(cfg)); return obj; }
// floor and wall models are instanced: one mesh, one material
function instancedPart(asset) {
  let mesh = null; asset.gltf.scene.updateMatrixWorld(true);
  asset.gltf.scene.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
  if (!mesh) return null;
  const geo = mesh.geometry.clone(); geo.applyMatrix4(mesh.matrixWorld); geo.applyMatrix4(cfgMatrix(asset.cfg));
  return { geo, mat: mesh.material };
}
function modelClone(asset, shadows = true) {
  const o = applyCfg(asset.gltf.scene.clone(true), asset.cfg);
  o.traverse(m => { if (m.isMesh) { m.castShadow = shadows; m.receiveShadow = true; } });
  return o;
}

// recorded sounds replace the synthesised ones, slot by slot
async function decodeSamples() {
  if (!A.ctx) return;
  for (const [k, url] of Object.entries(ASSET.snd)) {
    if (ASSET.buf[k]) continue;
    try { const r = await fetch(url); ASSET.buf[k] = await A.ctx.decodeAudioData(await r.arrayBuffer()); }
    catch (e) { console.warn('[assets] sound failed', k, e); }
  }
}
function playSample(k, rate = 1, gain = .9) {
  const b = ASSET.buf[k]; if (!b || !A.ctx) return false;
  const s = A.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
  const g = A.ctx.createGain(); g.gain.value = gain; s.connect(g); g.connect(A.master); g.connect(A.rev); s.start();
  return true;
}
for (const k of Object.keys(SFX)) {
  const synth = SFX[k];
  SFX[k] = (...args) => {
    if (k === 'tick') { // keep the melody: pitch the step sample along the scale
      const [t, echoMoves, heroMoved] = args;
      if (ASSET.buf.tick) {
        if (heroMoved) playSample('tick', note(t % 8) / note(0), .8);
        echoMoves.forEach((m, j) => { if (m) playSample('tick', note((t % 8) + 2 + j * 2) / note(0), .4 * Math.pow(.75, j)); });
        return;
      }
    } else if (playSample(k)) return;
    synth(...args);
  };
}

// ---------------- characters ----------------
function makeChar(color, ghost) {
  if (ASSET.hero && ASSET.SkeletonUtils) return makeModelChar(color, ghost);
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

// a character from the hero model: echoes reuse it with a glowing see-through material
function makeModelChar(color, ghost) {
  const src = ASSET.hero, cfg = src.cfg;
  const model = applyCfg(ASSET.SkeletonUtils.clone(src.gltf.scene), cfg);
  const root = new THREE.Group(), inner = new THREE.Group(); root.add(inner); inner.add(model);
  let mat = { opacity: 1 };
  if (ghost) {
    mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .75, transparent: true, opacity: .52, depthWrite: false, roughness: .3 });
    model.traverse(o => { if (o.isMesh) { o.material = mat; o.castShadow = false; } });
    const gl = glowSprite(color, 1.3, .35); gl.position.y = .5; root.add(gl);
  } else model.traverse(o => { if (o.isMesh) { o.castShadow = true; if (cfg.tint) { o.material = o.material.clone(); o.material.color.multiply(new THREE.Color(color)); } } });
  const blob = new THREE.Mesh(G.blob, ghost ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .25, blending: THREE.AdditiveBlending, depthWrite: false }) : M.blob);
  blob.position.y = .012; root.add(blob);
  const mixer = new THREE.AnimationMixer(model), clips = {};
  for (const c of src.gltf.animations || []) clips[c.name.toLowerCase()] = mixer.clipAction(c);
  let current = null;
  const play = name => {
    const next = clips[name] || clips.idle; if (!next || next === current) return;
    next.reset().fadeIn(.08).play(); if (current) current.fadeOut(.08); current = next;
  };
  play('idle');
  const dummy = new THREE.Object3D();
  return { root, inner, eyes: dummy, tail: dummy, ghost, yaw: 0, tyaw: 0, anim: null, blink: 1e9, land: 0, mat, mixer, play, model: true, squash: !!cfg.squash };
}

// ---------------- state ----------------
const S = {
  n: 1, runSeed: 1, R: null, echoes: [], acts: [], states: [],
  help: START_HELP, solved: 0, perfects: 0, helped: false, fails: 0, pinMode: false, statues: [], demo: null, demoSeen: {},
  best: 0, busy: false, walk: [], won: false, over: false, rewinding: false,
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
  // floor: model origin = centre of the tile's TOP face; procedural tile sits 0.25 lower
  const fPart = ASSET.floor && instancedPart(ASSET.floor);
  const floor = new THREE.InstancedMesh(fPart ? fPart.geo : G.tile, fPart ? fPart.mat : M.tile, floorCells.length); floor.receiveShadow = true;
  const col = new THREE.Color();
  floorCells.forEach(([x, y], i) => {
    if (!fPart) { col.setHSL(.09 + Math.random() * .015, .42 + Math.random() * .1, .66 + Math.random() * .07); floor.setColorAt(i, col); }
    items.push({ kind: 'inst', mesh: floor, i, p: cellV(x, y, fPart ? 0 : -.25), d: delayOf(x, y) });
  });
  // walls: model origin = centre of the bottom face (ground level)
  const wPart = ASSET.wall && instancedPart(ASSET.wall);
  const walls = new THREE.InstancedMesh(wPart ? wPart.geo : G.wall, wPart ? wPart.mat : M.wall, Math.max(1, wallCells.length)); walls.castShadow = walls.receiveShadow = true;
  const caps = new THREE.InstancedMesh(G.cap, M.cap, Math.max(1, wallCells.length)); caps.castShadow = true;
  walls.count = wallCells.length; caps.count = wPart ? 0 : wallCells.length;
  wallCells.forEach(([x, y], i) => {
    items.push({ kind: 'inst', mesh: walls, i, p: cellV(x, y, wPart ? 0 : .475), d: delayOf(x, y) + .05 });
    if (!wPart) items.push({ kind: 'inst', mesh: caps, i, p: cellV(x, y, .99), d: delayOf(x, y) + .05 });
  });
  roomGroup.add(floor, walls, caps);

  // doors
  S.doors = R.doors.map((d, i) => {
    const gph = GLYPH[i % GLYPH.length];
    const g = new THREE.Group();
    const gi = i % GLYPH.length, panelA = ASSET.doorPanels && ASSET.doorPanels[gi], frameA = ASSET.doorFrames && ASSET.doorFrames[gi];
    let block;
    if (panelA) block = modelClone(panelA);
    else if (ASSET.door) block = modelClone(ASSET.door);
    else { block = new THREE.Mesh(G.wall, M.door); block.position.y = .475; block.castShadow = block.receiveShadow = true; }
    const seamMat = new THREE.MeshStandardMaterial({ color: gph.color, emissive: gph.color, emissiveIntensity: 1.6 });
    const seam = new THREE.Mesh(new THREE.BoxGeometry(1.01, .07, 1.01), seamMat); seam.position.y = .5;
    const inv = d.kind === 'inverse';
    // inverse doors show an outline glyph (hollow), hold/timed a solid one
    const glyphGeo = (r, t) => inv ? new THREE.RingGeometry(r * .55, r, gph.seg, 1, gph.rot) : new THREE.CylinderGeometry(r, r, t, gph.seg).rotateX(Math.PI / 2).rotateZ(gph.rot);
    seamMat.side = THREE.DoubleSide;
    const coin = new THREE.Mesh(glyphGeo(.17, .05), seamMat); coin.position.set(0, .5, .53);
    if (panelA) g.add(block); else g.add(block, seam, coin);   // modelled doors carry their own glowing symbol
    const holder = new THREE.Group(); holder.position.copy(cellV(d.x, d.y)); holder.add(g); roomGroup.add(holder);
    if (frameA) holder.add(modelClone(frameA));
    const iconY = panelA ? 2.05 : 1.45;
    const icon = new THREE.Mesh(glyphGeo(.13, .04), seamMat); icon.position.set(0, iconY, 0);
    const ig = glowSprite(gph.color, .9, .55); ig.position.y = iconY; holder.add(icon, ig);
    if (panelA && !inv) icon.visible = ig.visible = false;          // only inverse doors keep the floating hint
    // timed doors: three pips that drain while the door counts down
    const pips = [];
    if (d.kind === 'timed') for (let k = 0; k < 3; k++) {
      const m = new THREE.MeshStandardMaterial({ color: gph.color, emissive: gph.color, emissiveIntensity: .2 });
      const pip = new THREE.Mesh(new THREE.SphereGeometry(.055, 12, 8), m); pip.position.set((k - 1) * .2, panelA ? 1.95 : 1.13, 0); holder.add(pip); pips.push(m);
    }
    items.push({ kind: 'obj', obj: holder, y: 0, d: delayOf(d.x, d.y) + .05 });
    return { g, icon, ig, seamMat, pips, kind: d.kind, timer: 0, open: 0, target: 0, wasOpen: false, sink: panelA ? 1.85 : .97 };
  });
  // plates
  S.plates = R.plates.map(p => {
    const gph = GLYPH[p.door % GLYPH.length];
    const holder = new THREE.Group(); holder.position.copy(cellV(p.x, p.y));
    let b; const plateA = ASSET.plates && ASSET.plates[p.door % GLYPH.length];
    const glowMats = [];
    if (plateA) {
      b = modelClone(plateA, false);
      b.traverse(o => { if (o.isMesh && o.material.name && o.material.name.startsWith('Sada_glow')) { o.material = o.material.clone(); glowMats.push(o.material); } });
    }
    else if (ASSET.plate) b = modelClone(ASSET.plate, false);
    else { b = new THREE.Mesh(new THREE.CylinderGeometry(.36, .4, .07, gph.seg), M.plateBase); b.rotation.y = gph.rot; b.position.y = .035; b.receiveShadow = true; }
    const topMat = new THREE.MeshStandardMaterial({ color: gph.color, emissive: gph.color, emissiveIntensity: .5 });
    const kind = R.doors[p.door].kind;
    let top;
    if (kind === 'inverse') { topMat.side = THREE.DoubleSide; top = new THREE.Mesh(new THREE.RingGeometry(.15, .28, gph.seg, 1, gph.rot).rotateX(-Math.PI / 2), topMat); }
    else { top = new THREE.Mesh(new THREE.CylinderGeometry(.27, .27, .05, gph.seg), topMat); top.rotation.y = gph.rot; }
    top.position.y = plateA ? .115 : .1;
    const gl = glowSprite(gph.color, 1.1, .25); gl.position.y = .15;
    holder.add(b, gl); if (!plateA || kind === 'inverse') holder.add(top);   // modelled plates show their own disc; inverse keeps the hollow ring
    if (kind === 'timed') for (let k = 0; k < 3; k++) {
      const a = Math.PI / 2 + k * Math.PI * 2 / 3, tick = new THREE.Mesh(new THREE.BoxGeometry(.09, .04, .09), topMat);
      tick.position.set(Math.cos(a) * .44, .05, -Math.sin(a) * .44); tick.rotation.y = a; holder.add(tick);
    }
    items.push({ kind: 'obj', obj: holder, y: 0, d: delayOf(p.x, p.y) + .1 });
    return { top, topMat, gl, base: b, glowMats, model: !!plateA, door: p.door, press: 0, target: 0, was: false, x: p.x, y: p.y };
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
  ex.add(ring, beam, eg, motes); if (ASSET.exit) { ex.add(modelClone(ASSET.exit)); ring.visible = beam.visible = false; } roomGroup.add(ex);
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
  S.runSeed = (Math.random() * 1e9) >>> 0; S.n = 1; S.help = START_HELP; S.solved = 0; S.perfects = 0; S.over = false;
  startRoom();
}
function startRoom() {
  let R = E.roomFor(S.n, S.runSeed), k = 1;
  while (!R && k < 20) R = E.roomFor(S.n, S.runSeed + k++);
  S.R = R; S.echoes = []; S.acts = []; S.won = false; S.walk = []; S.busy = false; S.platePressedOnce = false;
  S.helped = false; S.fails = 0; setPinMode(false); S.statues.forEach(st => scene.remove(st.root)); S.statues = []; $('hint').classList.remove('pulse');
  recompute(); buildRoom(); clearEnts(); updateDots(); ui();
  feet.count = 0;
  setTimeout(() => {
    spawnEnts();
    const h = S.ents[S.ents.length - 1]; h.root.position.y = 3; h.anim = { kind: 'drop', t: 0, dur: .45, to: h.root.position.clone().setY(0) };
    setTimeout(() => SFX.land(), 380);
    doorsUpdate(true);
    if (S.n === 1 && !S.firstMove) $('finger').classList.add('on');
    if (S.R.tutorial && S.n > 1 && !S.demoSeen[S.n]) { S.demoSeen[S.n] = true; setTimeout(() => startDemo(true), 700); }
  }, Math.min(900, rise.dur * 1000 - 200));
  $('room').textContent = 'غرفة ' + AR(S.n);
}

function doAction(a, fromDemo) {
  if (S.demo && !fromDemo) { stopDemo(); return false; }
  if (S.busy || S.won || S.over || S.rewinding || !S.ents.length) return false;
  if (S.acts.length >= S.R.L) return false;
  const t = S.acts.length, pos = cur();
  const acts = S.echoes.map(e => e[t] || 'W').concat([a]);
  const next = E.step(S.R, pos, acts);
  const me = next[next.length - 1];
  const hero = S.ents[S.ents.length - 1];
  if (a !== 'W' && me.blocked) { animEnt(hero, pos[pos.length - 1], pos[pos.length - 1], true, a); SFX.bump(); buzz(15); S.walk = []; return false; }
  if (!S.firstMove) { S.firstMove = true; $('finger').classList.remove('on'); }
  S.acts.push(a); { const keep = next.map(({ x, y }) => ({ x, y })); keep.timers = next.timers; S.states.push(keep); }
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
    if (S.echoes.length < S.R.E) { setTimeout(endLoopAsEcho, 350); }
    else if (S.demo) { console.error('[demo] final loop ended without the exit', S.n); toast('⚠'); stopDemo(); }
    else { S.fails++; setTimeout(retryLoop, 350); if (S.fails >= 2 && S.help > 0) $('hint').classList.add('pulse'); }
    return;
  }
  pump();
}
function pump() { if (S.walk.length && !S.busy) { const a = S.walk.shift(); if (!doAction(a)) S.walk = []; } }

function doorsUpdate(silent) {
  const pos = cur(), open = E.doorStates(S.R, pos);
  S.doors.forEach((d, i) => {
    d.target = open[i] ? 1 : 0; if (!silent && open[i] !== d.wasOpen) SFX.door(open[i]); d.wasOpen = open[i];
    if (d.kind === 'timed') {
      const held = S.R.plates.some(p => p.door === i && pos.some(e => e.x === p.x && e.y === p.y));
      const t = held ? 3 : ((pos.timers && pos.timers[i]) || 0);
      if (!silent && !held && t > 0 && t < d.timer) tone(1200 + t * 200, 0, .06, 'sine', .05, false);
      d.timer = t;
    }
  });
  S.plates.forEach(p => {
    const on = pos.some(e => e.x === p.x && e.y === p.y) || (S.R.pinned || []).some(e => e.x === p.x && e.y === p.y);
    p.target = on ? 1 : 0;
    if (on && !p.was && !silent) { SFX.plate(p.door, true); buzz(12); ringFX(cellV(p.x, p.y, .1), GLYPH[p.door % GLYPH.length].color); S.platePressedOnce = true; }
    if (!on && p.was && !silent) SFX.plate(p.door, false);
    p.was = on;
  });
}

// a finished loop becomes an echo, and the next loop starts
function endLoopAsEcho() {
  if (S.won || S.rewinding) return;
  S.echoes.push(E.pad(S.acts, S.R.L));
  rewindAnim(() => {
    S.acts = []; recompute(); spawnEnts();
    const g = S.ents[S.echoes.length - 1]; g.root.scale.setScalar(.01); g.pop = 0;
    SFX.spawn(); ringFX(cellV(S.R.start.x, S.R.start.y, .1), 0x8fd8ff, 1.6);
    doorsUpdate(true); updateDots(); ui();
  });
}
// the final loop failed: replay only this loop, keeping every echo
function retryLoop() {
  if (S.won || S.rewinding) return;
  rewindAnim(() => { S.acts = []; recompute(); spawnEnts(); doorsUpdate(true); updateDots(); ui(); });
}
// one loop back: discard the newest echo and record it again
function backLoop() {
  if (S.demo) { stopDemo(); return; }
  if (S.busy || S.won || S.rewinding) return;
  if (!S.acts.length && !S.echoes.length) return;
  S.walk = []; setPinMode(false);
  rewindAnim(() => {
    if (!S.acts.length && S.echoes.length) S.echoes.pop();
    S.acts = []; recompute(); spawnEnts(); doorsUpdate(true); updateDots(); ui();
  });
}
function rewindAnim(done) {
  S.rewinding = true; stage.classList.add('rewinding'); SFX.rewind(); buzz([10, 30, 10]);
  const steps = S.acts.length, total = Math.min(900, 140 + steps * 45), t0 = performance.now();
  if (!steps) { stage.classList.remove('rewinding'); S.rewinding = false; done(); return; }
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
  if (S.demo) { stopDemo(); return; }
  if (S.busy || S.won || S.over || S.rewinding) return;
  S.echoes = []; S.acts = []; S.walk = []; recompute(); spawnEnts(); doorsUpdate(true); updateDots(); ui();
}
function undo() {
  if (S.demo) { stopDemo(); return; }
  if (S.busy || S.won || S.over || S.rewinding || !S.acts.length) return;
  S.walk = []; S.acts.pop(); S.states.pop(); snapAll(cur()); doorsUpdate(true); updateDots(); ui();
  tone(note(2), 0, .12, 'sine', .06);
}
function hint() {
  if (S.demo) { stopDemo(); return; }
  if (S.busy || S.won || S.rewinding) return;
  if (S.help <= 0) { SFX.bump(); return; }
  const sol = S.R.solution; if (!sol) return;
  const recording = S.echoes.length < sol.echoes.length;
  const seq = recording ? sol.echoes[S.echoes.length] : sol.player;
  S.help--; S.helped = true; $('hint').classList.remove('pulse');
  let p = { ...S.R.start }; const cells = []; let t = 0;
  for (const a of seq) { t++; const d = E.DIRS[a]; if (d[0] || d[1]) { p = { x: p.x + d[0], y: p.y + d[1] }; cells.push({ ...p, t }); } }
  feet.count = Math.min(80, cells.length);
  cells.slice(0, 80).forEach((c, i) => { _v.copy(cellV(c.x, c.y, .03)); _m.compose(_v, _q, _s); feet.setMatrixAt(i, _m); });
  feet.instanceMatrix.needsUpdate = true; hintT = 9;
  hintNums = cells.map(c => ({ pos: cellV(c.x, c.y, .38), n: c.t, color: 0xffd38a }));
  refreshNums(); ui();
  
  tone(note(9), 0, .6, 'sine', .08);
}
function setPinMode(on) { S.pinMode = on; $('pin').classList.toggle('armed', on); }
function pinPress() {
  if (S.demo) { stopDemo(); return; }
  if (S.busy || S.won || S.rewinding) return;
  if (S.pinMode) { setPinMode(false); return; }
  if (S.help <= 0) { SFX.bump(); return; }
  setPinMode(true); toast('◎');
}
function pinAt(x, y) {
  const plate = S.R.plates.find(p => p.x === x && p.y === y && S.R.doors[p.door].kind !== 'inverse');
  setPinMode(false);
  if (!plate) { return; }
  if ((S.R.pinned || []).some(p => p.x === x && p.y === y)) return;
  S.help--; S.helped = true;
  S.R.pinned = (S.R.pinned || []).concat([{ x, y }]);
  const st = makeChar(0xb8a989, false); st.root.position.copy(cellV(x, y)); st.root.scale.setScalar(.01); st.pop = 0; st.statue = true;
  if (st.model) { const stone = new THREE.MeshStandardMaterial({ color: 0xb8a989, roughness: .9 }); st.inner.traverse(o => { if (o.isMesh) o.material = stone; }); }
  scene.add(st.root); S.statues.push(st);
  ringFX(cellV(x, y, .1), 0xffd38a, 1.4); SFX.spawn();
  recompute(); doorsUpdate(false); updateDots(); ui();
}

function win() {
  if (S.demo) return demoReached();
  S.won = true; S.walk = []; setPinMode(false);
  const R = S.R, perfect = !S.helped;
  S.solved++; if (perfect) S.perfects++;
  const gift = S.solved % 3 === 0 && S.help < MAX_HELP;
  if (gift) S.help++;
  SFX.win(); buzz([20, 40, 20]);
  const hero = S.ents[S.ents.length - 1]; hero.anim = { kind: 'cheer', t: 0, dur: .8 };
  burst(cellV(R.exit.x, R.exit.y, .4));
  const fl = $('flash'); fl.style.transition = 'none'; fl.style.opacity = .25; requestAnimationFrame(() => { fl.style.transition = 'opacity .6s'; fl.style.opacity = 0; });
  toast((perfect ? '✦' : '✓') + (gift ? '  +١' : ''));
  S.best = Math.max(S.best, S.n);
  try { localStorage.setItem('sada-best', S.best); } catch (e) { }
  ui();
  setTimeout(() => {
    rise.dir = -1; rise.t = 0; rise.dur = .9;
    S.ents.concat(S.statues).forEach(e => e.anim = { kind: 'leave', t: 0, dur: .5 });
    setTimeout(() => { S.n++; startRoom(); }, 750);
  }, 1100);
}

// ---------------- watch the solution ----------------
// Plays the room's stored solution through the real game flow (loops, echoes, doors),
// so it is both a lesson for the player and a live check of the UI path.
function startDemo(free) {
  if (S.busy || S.won || S.rewinding || S.demo || !S.R || !S.R.solution) return;
  if (!free && !S.R.tutorial) {
    if (S.help <= 0) { SFX.bump(); return; }
    S.help--; S.helped = true;
  }
  const sol = S.R.solution, L = S.R.L, queue = [];
  sol.echoes.forEach(e => queue.push(...E.pad(e, L)));
  queue.push(...sol.player);
  S.walk = []; setPinMode(false);
  S.echoes = []; S.acts = []; recompute(); spawnEnts(); doorsUpdate(true); updateDots(); ui();
  S.demo = { queue, timer: setInterval(demoStep, 40) };
  stage.classList.add('demo'); $('watch').classList.add('on');
  
}
function demoStep() {
  const d = S.demo; if (!d || d.done || S.busy || S.rewinding || S.acts.length >= S.R.L) return;
  if (!d.queue.length) { console.error('[demo] solution ran out without reaching the exit', S.n); toast('⚠'); stopDemo(); return; }
  const a = d.queue.shift();
  if (!doAction(a, true)) { console.error('[demo] move rejected', a, 'room', S.n); toast('⚠'); stopDemo(); }
}
function demoReached() {
  if (S.demo) S.demo.done = true;
  SFX.win(); burst(cellV(S.R.exit.x, S.R.exit.y, .4));
  setTimeout(() => { stopDemo(); toast('▶'); }, 700);
}
function stopDemo() {
  if (!S.demo) return;
  clearInterval(S.demo.timer); S.demo = null;
  stage.classList.remove('demo'); $('watch').classList.remove('on');
  S.busy = false; S.walk = [];
  const reset = () => { S.echoes = []; S.acts = []; recompute(); spawnEnts(); doorsUpdate(true); updateDots(); ui(); };
  if (S.rewinding) setTimeout(reset, 950); else reset();
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
// number labels (echo timing and hint steps)
const numCache = new Map(), numPool = [], numGroup = new THREE.Group(); scene.add(numGroup);
let echoNums = [], hintNums = [];
function numTex(n, color) {
  const key = n + '|' + color; if (numCache.has(key)) return numCache.get(key);
  const t = canvasTex(64, (g) => {
    g.font = '600 40px "Readex Pro", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 9; g.strokeStyle = 'rgba(13,15,34,.85)'; g.strokeText(AR(n), 32, 34);
    g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.fillText(AR(n), 32, 34);
  });
  numCache.set(key, t); return t;
}
function refreshNums() {
  const list = echoNums.concat(hintT > 0 ? hintNums : []);
  while (numPool.length < list.length) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })); sp.scale.set(.34, .34, 1); numGroup.add(sp); numPool.push(sp); }
  numPool.forEach((sp, i) => { const it = list[i]; sp.visible = !!it; if (it) { const tx = numTex(it.n, it.color); if (sp.material.map !== tx) { sp.material.map = tx; sp.material.needsUpdate = true; } sp.position.copy(it.pos); } });
}
function updateDots() {
  echoNums = [];
  if (!S.R) { dots.count = 0; refreshNums(); return; }
  const t = S.acts.length, L = S.R.L;
  const future = E.run(S.R, S.echoes, S.acts.concat(Array(L - t).fill('W')));
  // predicted door-open windows (assuming you wait), shown under the timeline
  S.windows = S.R.doors.map((d, i) => future.slice(0, L).map(st => E.doorStates(S.R, st)[i]));
  if (!S.echoes.length) { dots.count = 0; refreshNums(); return; }
  let k = 0; const c = new THREE.Color();

  S.echoes.forEach((_, i) => {
    let prev = future[t][i];
    for (let s = t + 1; s <= L && k < 400; s++) {
      const p = future[s][i]; if (p.x === prev.x && p.y === prev.y) continue; prev = p;
      _v.copy(cellV(p.x, p.y, .02 + i * .002)); _m.compose(_v, _q, _s); dots.setMatrixAt(k, _m);
      c.setHex(ECHO_COLS[i % ECHO_COLS.length]).multiplyScalar(1 - Math.min(.7, (s - t) / (L + 2))); dots.setColorAt(k, c); k++;
      echoNums.push({ pos: cellV(p.x, p.y, .3 + i * .05), n: s, color: ECHO_COLS[i % ECHO_COLS.length] });
    }
  });
  dots.count = k; dots.instanceMatrix.needsUpdate = true; if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
  refreshNums();
}

// ---------------- UI ----------------
let lastL = -1;
function ui() {
  const R = S.R; if (!R) return;
  const tk = $('ticks'), dw = $('doorWin');
  if (lastL !== R.L || tk.children.length !== R.L || dw.children.length !== R.doors.length) {
    tk.innerHTML = ''; for (let i = 0; i < R.L; i++) tk.appendChild(document.createElement('i'));
    dw.innerHTML = '';
    R.doors.forEach(() => { const row = document.createElement('div'); for (let i = 0; i < R.L; i++) row.appendChild(document.createElement('i')); dw.appendChild(row); });
    lastL = R.L;
  }
  const t = S.acts.length, left = R.L - t;
  [...tk.children].forEach((el, i) => el.classList.toggle('done', i < t));
  tk.classList.toggle('warn', left <= 3);
  (S.windows || []).forEach((w, di) => {
    const row = dw.children[di]; if (!row) return;
    const col = '#' + GLYPH[di % GLYPH.length].color.toString(16).padStart(6, '0');
    [...row.children].forEach((el, i) => { el.style.background = w[i] ? col : ''; el.style.opacity = i < t ? .35 : 1; });
  });
  $('left').textContent = AR(left); $('left').classList.toggle('warn', left <= 3);
  const final = S.echoes.length >= R.E;
  $('loopN').textContent = AR(S.echoes.length + 1) + '/' + AR(R.E + 1); $('loopChip').classList.toggle('final', final);
  $('helpN').textContent = AR(S.help); $('helpChip').classList.toggle('none', S.help <= 0);
  $('undo').disabled = !t; $('back').disabled = !t && !S.echoes.length;
  $('hint').disabled = S.help <= 0 || !R.solution; $('pin').disabled = S.help <= 0 && !S.pinMode;
}
let toastT = null;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 1600); }
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
  if (x < 0 || y < 0 || x >= S.R.W || y >= S.R.H) { if (S.pinMode) setPinMode(false); return; }
  if (S.pinMode) { pinAt(x, y); return; }
  const me = cur()[S.echoes.length];
  if (x === me.x && y === me.y) { S.walk = []; doAction('W'); return; }
  const path = E.bfsPath(S.R, me, { x, y }, true); if (!path) { SFX.bump(); return; }
  S.walk = []; for (let i = 1; i < path.length; i++) { const a = path[i - 1], b = path[i]; S.walk.push(b.x > a.x ? 'R' : b.x < a.x ? 'L' : b.y > a.y ? 'U' : 'D'); }
  ringFX(cellV(x, y, .05), 0xffe2a6, .6);
  pump();
});
addEventListener('keydown', e => {
  const k = e.key; const map = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', w: 'U', s: 'D', a: 'L', d: 'R' };
  if (!$('startScreen').hidden) return;
  audioInit();
  if (map[k]) { S.walk = []; doAction(map[k]); e.preventDefault(); }
  else if (k === ' ') { S.walk = []; doAction('W'); e.preventDefault(); }
  else if (k === 'b') backLoop();
  else if (k === 'h') hint();
  else if (k === 'z' || k === 'Backspace') undo();
  else if (k === 'r') restart();
});
$('wait').onclick = () => { audioInit(); S.walk = []; doAction('W'); };
$('back').onclick = backLoop; $('pin').onclick = pinPress;
$('watch').onclick = () => { audioInit(); if (S.demo) stopDemo(); else startDemo(false); };
$('undo').onclick = undo; $('restart').onclick = restart; $('hint').onclick = hint;
$('mute').onclick = () => { A.muted = !A.muted; if (A.master) A.master.gain.value = A.muted ? 0 : .85; $('waves').style.opacity = A.muted ? .15 : 1; };
$('go').onclick = async () => { audioInit(); $('go').disabled = true; await assetsReady; $('go').disabled = false; $('startScreen').hidden = true; startRun(); };

// ---------------- frame loop ----------------
let last = performance.now(), T = 0;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; T += dt;
  if (rise) { rise.t += dt; if (rise.t <= rise.dur + .1) applyRise(rise.t); }
  for (const e of S.ents.concat(S.statues)) {
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
    if (e.model && !e.squash) sq = 1;
    e.inner.scale.set(1 / Math.sqrt(sq), sq * (1 + (e.model ? 0 : Math.sin(T * 2.4 + e.root.id) * .015)), 1 / Math.sqrt(sq));
    if (e.mixer) { e.play(a ? ({ hop: 'hop', bump: 'bump', cheer: 'cheer', drop: 'land' }[a.kind] || 'idle') : 'idle'); e.mixer.update(dt); }
    let dy = e.tyaw - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); e.yaw += dy * Math.min(1, dt * 14); e.root.rotation.y = e.yaw;
    e.tail.rotation.x = Math.sin(T * 6 + e.root.id) * .25 + (a && a.kind === 'hop' ? -.6 : 0);
    e.blink -= dt; if (e.blink < 0) { e.eyes.scale.y = .1; if (e.blink < -.12) { e.eyes.scale.y = 1; e.blink = 2 + Math.random() * 4; } }
    if (e.ghost) e.mat.opacity = .45 + Math.sin(T * 3 + e.root.id) * .07;
  }
  for (const d of S.doors) {
    d.open += (d.target - d.open) * Math.min(1, dt * 10);
    d.g.position.y = -d.open * d.sink; d.seamMat.emissiveIntensity = 1.4 + d.open * 1.6 + Math.sin(T * 3) * .2;
    d.icon.rotation.y = T * 1.2; d.icon.position.y = 1.45 + Math.sin(T * 2) * .05; d.ig.material.opacity = .4 + d.open * .5;
    d.pips.forEach((m, k) => { const lit = k < d.timer; m.emissiveIntensity += ((lit ? 2.4 : .15) - m.emissiveIntensity) * Math.min(1, dt * 12); });
  }
  for (const p of S.plates) {
    p.press += (p.target - p.press) * Math.min(1, dt * 14);
    if (p.model) { p.base.position.y = -p.press * .025; const k = .55 + p.press * .9 + (1 - p.press) * Math.max(0, Math.sin(T * 3)) * .15; p.glowMats.forEach(m => m.color.setScalar(k)); }
    p.top.position.y = (p.model ? .115 : .1) - p.press * .025; p.topMat.emissiveIntensity = .5 + p.press * 2.5 + (1 - p.press) * Math.max(0, Math.sin(T * 3)) * .4;
    p.gl.material.opacity = .2 + p.press * .6;
  }
  if (S.exitObj) {
    const x = S.exitObj; x.ring.rotation.z = T * .8; x.beam.material.opacity = .45 + Math.sin(T * 2) * .1;
    const arr = x.motes.geometry.attributes.position; for (let i = 0; i < arr.count; i++) { let y = arr.getY(i) + dt * .5; if (y > 2.6) y = 0; arr.setY(i, y); } arr.needsUpdate = true;
  }
  if (hintT > 0) { hintT -= dt; feet.material.opacity = Math.min(.85, hintT) * (.6 + Math.sin(T * 6) * .25); if (hintT <= 0) { feet.count = 0; refreshNums(); } }
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

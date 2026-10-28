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

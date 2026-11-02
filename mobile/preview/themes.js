// Preview only: alternative looks for طيف, switched live from the page. Each theme draws the background, the board
// (floor, walls, plates, gates, exit), the characters, and an optional screen-space pass after everything.
//   sketch  — pencil and watercolour (characters from the Aboden-Assets sketch pack, see sketch-chars.js)
//   shadow  — خيال الظل: a lit cloth screen, cut-leather silhouettes, coloured glass, a jointed puppet on a rod
//   vhs     — شريط فيديو: neon on a dark CRT, scanlines, a cassette-headed hero, echoes as glitchy recordings
window.THEME = (() => {
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
function hash(n) { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }
function star(c, x, y, r1, r2, rot) { c.beginPath(); for (let k = 0; k < 10; k++) { const a = rot + k * Math.PI / 5 - Math.PI / 2, r = k % 2 ? r2 : r1; c[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); }
function glyphPath(c, G, x, y, r) {
  c.beginPath();
  if (!G.n) { c.arc(x, y, r, 0, TAU); return; }
  for (let k = 0; k < G.n; k++) { const a = -Math.PI / 2 + (G.rot || (G.n === 4 ? Math.PI / 4 : 0)) + k * TAU / G.n, rr = r * (G.n === 3 ? 1.2 : 1.05); c[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr + (G.n === 3 ? r * .18 : 0)); }
  c.closePath();
}
// board geometry shared by the themes
function geo(A) {
  const { S, B, cellX, cellY } = A, R = S.R, s = B.s, pad = s * .32;
  return { R, s, pad, x0: B.ox - pad, y0: B.oy - pad - B.h * .5, w: R.W * s + pad * 2, h: R.H * s + pad * 2, CX: x => cellX(x), CY: y => cellY(y) - B.h * .5 };
}
function floorPath(c, A, G, r) {   // every floor cell as a rect; corners round where two walls meet
  const { isWall } = A, { R, s, CX, CY } = G;
  for (let y = 0; y < R.H; y++) for (let x = 0; x < R.W; x++) if (!isWall(x, y)) {
    const w = isWall, tl = w(x - 1, y) && w(x, y + 1) ? r : 0, tr = w(x + 1, y) && w(x, y + 1) ? r : 0, br = w(x + 1, y) && w(x, y - 1) ? r : 0, bl = w(x - 1, y) && w(x, y - 1) ? r : 0;
    c.roundRect(CX(x), CY(y), s, s, [tl, tr, br, bl]);
  }
}
function edgeRuns(A, G) {   // wall/floor borders merged into straight runs
  const { isWall } = A, { R, s, CX, CY } = G, runs = [];
  for (let y = 0; y < R.H; y++) for (const side of [1, -1]) { let st = null;
    for (let x = 0; x <= R.W; x++) { const on = x < R.W && !isWall(x, y) && isWall(x, y + side);
      if (on && st === null) st = x; if (!on && st !== null) { const yy = side > 0 ? CY(y) : CY(y) + s; runs.push([CX(st), yy, CX(x), yy]); st = null; } } }
  for (let x = 0; x < R.W; x++) for (const side of [-1, 1]) { let st = null;
    for (let y = 0; y <= R.H; y++) { const on = y < R.H && !isWall(x, y) && isWall(x + side, y);
      if (on && st === null) st = y; if (!on && st !== null) { const xx = side < 0 ? CX(x) : CX(x) + s; runs.push([xx, CY(y - 1), xx, CY(st) + s]); st = null; } } }
  return runs;
}
const bufs = {};
function buf(name, px) { let b = bufs[name]; if (!b) b = bufs[name] = document.createElement('canvas'); if (b.width !== px) { b.width = px; b.height = px; } const g = b.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, px, px); return [b, g]; }

// =====================================================================================================
// خيال الظل
// =====================================================================================================
const SIL = '#140a05';
const shadow = (() => {
  let lamp = 1, weave = null;
  function weavePat(c) {
    if (weave) return weave;
    const w = document.createElement('canvas'); w.width = w.height = 6; const g = w.getContext('2d');
    g.fillStyle = 'rgba(90,40,10,.07)'; g.fillRect(0, 0, 6, 1); g.fillRect(0, 3, 6, 1); g.fillStyle = 'rgba(90,40,10,.04)'; g.fillRect(0, 0, 1, 6); g.fillRect(3, 0, 1, 6);
    return (weave = c.createPattern(w, 'repeat'));
  }
  function bg(c, A, T) {
    lamp = .93 + Math.sin(T * 7.3) * .03 + Math.sin(T * 13.1 + 1) * .025 + Math.sin(T * 2.1) * .02;
    const { VW, VH } = A;
    c.fillStyle = '#1d110a'; c.fillRect(0, 0, VW, VH);
    const g = c.createRadialGradient(VW / 2, VH * .45, 0, VW / 2, VH * .45, Math.max(VW, VH) * .75);
    g.addColorStop(0, `rgba(150,75,25,${.5 * lamp})`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, VW, VH);
  }
  function room(c, A, T) {
    const G = geo(A), { R, s, x0, y0, w, h, CX, CY } = G, { S, isWall, scr, doorFx, plateFx, GLYPH, cur, E, plateHeld } = A;
    // wooden frame with a row of small cut triangles
    const fp = s * .2;
    c.fillStyle = '#3a2416'; c.beginPath(); c.roundRect(x0 - fp, y0 - fp, w + fp * 2, h + fp * 2, s * .18); c.fill();
    c.strokeStyle = '#5c3b22'; c.lineWidth = 2; c.stroke();
    c.fillStyle = `rgba(255,190,110,${.35 * lamp})`;
    for (const yy of [y0 - fp * .5, y0 + h + fp * .5]) for (let xx = x0 + s * .2; xx < x0 + w - s * .1; xx += s * .32) { c.beginPath(); c.moveTo(xx - s * .06, yy + s * .04); c.lineTo(xx, yy - s * .05); c.lineTo(xx + s * .06, yy + s * .04); c.fill(); }
    // the lit cloth
    const lx = x0 + w / 2, ly = y0 + h * .38;
    const lg = c.createRadialGradient(lx, ly, 0, lx, ly, Math.max(w, h) * .75);
    lg.addColorStop(0, '#fff3d6'); lg.addColorStop(.35, '#ffd68f'); lg.addColorStop(.75, '#e99a47'); lg.addColorStop(1, '#a5571f');
    c.fillStyle = lg; c.fillRect(x0, y0, w, h);
    c.fillStyle = weavePat(c); c.fillRect(x0, y0, w, h);
    c.fillStyle = `rgba(40,15,5,${clamp((1 - lamp) * 2.2, 0, .3)})`; c.fillRect(x0, y0, w, h);
    // faint grid on the floor
    c.save(); c.beginPath(); floorPath(c, A, G, 0); c.clip();
    c.strokeStyle = 'rgba(110,50,15,.12)'; c.lineWidth = 1; c.beginPath();
    for (let x = 1; x < R.W; x++) { c.moveTo(CX(x), y0); c.lineTo(CX(x), y0 + h); }
    for (let y = 0; y < R.H; y++) { c.moveTo(x0, CY(y)); c.lineTo(x0 + w, CY(y)); }
    c.stroke(); c.restore();
    // plates and exit sit on the cloth; walls, then gates, are the cut leather in front
    R.plates.forEach((p, j) => plate(c, A, p, j, T));
    exit(c, A, T);
    // walls: one silhouette (the screen minus the floor), with a soft penumbra spilling onto the cloth
    c.save(); c.beginPath(); c.rect(x0, y0, w, h); floorPath(c, A, G, s * .26);
    c.shadowColor = 'rgba(30,10,2,.55)'; c.shadowBlur = s * .14; c.fillStyle = SIL; c.fill('evenodd'); c.restore();
    // perforations: tiny holes the lamp shines through, like punched leather (a lattice across the walls)
    c.save(); c.beginPath(); c.rect(x0, y0, w, h); floorPath(c, A, G, s * .26); c.clip('evenodd');
    c.fillStyle = `rgba(255,214,140,${.75 * lamp})`;
    for (let y = -1; y <= R.H; y++) for (let x = -1; x <= R.W; x++) {
      if (!isWall(x, y)) continue;
      const cx = CX(x) + s / 2, cy = CY(y) + s / 2, d = s * .2, r = s * .035;
      if ((x + y) % 2 === 0) { for (const [ox, oy] of [[0, -d], [d, 0], [0, d], [-d, 0]]) { c.beginPath(); c.arc(cx + ox, cy + oy, r, 0, TAU); c.fill(); } c.beginPath(); c.arc(cx, cy, r * 1.4, 0, TAU); c.fill(); }
      else { c.beginPath(); c.moveTo(cx, cy - r * 2.2); c.lineTo(cx + r * 1.4, cy); c.lineTo(cx, cy + r * 2.2); c.lineTo(cx - r * 1.4, cy); c.closePath(); c.fill(); }
    }
    c.restore();
    R.doors.forEach((d, i) => gate(c, A, d, i, T));
  }
  function plate(c, A, p, j, T) {
    const { S, scr, plateFx, GLYPH, B } = A, s = B.s, d = S.R.doors[p.door], G = GLYPH[p.door % 4], on = plateFx[j].on, [X, Y] = scr(p.x, p.y), r = s * .3;
    // coloured glass: light passes through and tints the cloth; pressed, it glows
    c.save();
    c.globalAlpha = .5 + on * .3; c.fillStyle = G.c; c.beginPath(); c.arc(X, Y, r, 0, TAU); c.fill();
    if (on > .05) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = on * .55; const g = c.createRadialGradient(X, Y, 0, X, Y, r * 1.9); g.addColorStop(0, G.c); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.beginPath(); c.arc(X, Y, r * 1.9, 0, TAU); c.fill(); }
    c.restore();
    // the leather holder: a ring with four little spokes (zig-zag teeth if it is an inverse plate)
    c.strokeStyle = SIL; c.fillStyle = SIL; c.lineWidth = s * .065; c.beginPath(); c.arc(X, Y, r, 0, TAU); c.stroke();
    if (d.kind === 'inverse') { for (let k = 0; k < 12; k++) { const a = k * TAU / 12 + T * .3; c.beginPath(); c.moveTo(X + Math.cos(a - .12) * r, Y + Math.sin(a - .12) * r); c.lineTo(X + Math.cos(a) * r * 1.28, Y + Math.sin(a) * r * 1.28); c.lineTo(X + Math.cos(a + .12) * r, Y + Math.sin(a + .12) * r); c.fill(); } }
    else for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; c.beginPath(); c.moveTo(X + Math.cos(a) * r, Y + Math.sin(a) * r); c.lineTo(X + Math.cos(a) * r * 1.3, Y + Math.sin(a) * r * 1.3); c.lineWidth = s * .05; c.stroke(); }
    glyphPath(c, G, X, Y, s * .09); c.fill();
    if (plateFx[j].hover) { c.strokeStyle = `rgba(255,240,200,${.6 + Math.sin(T * 6) * .3})`; c.lineWidth = 2; c.beginPath(); c.arc(X, Y, r * 1.45, 0, TAU); c.stroke(); }
  }
  function exit(c, A, T) {
    const { S, scr, B } = A, s = B.s, [X, Y] = scr(S.R.exit.x, S.R.exit.y), r = s * .36;
    c.save();
    c.fillStyle = SIL; c.beginPath(); c.arc(X, Y, r, 0, TAU); c.fill();
    // a star cut out of the disc; the lamp blazes through it
    c.shadowColor = '#fff2b0'; c.shadowBlur = s * (.35 + (S.nearExit || 0) * .4);
    c.fillStyle = '#fff8e0'; star(c, X, Y, r * .78 * (1 + Math.sin(T * 4) * .05), r * .34, T * .5); c.fill();
    c.restore();
    c.strokeStyle = SIL; c.lineWidth = s * .04;
    for (let k = 0; k < 8; k++) { const a = k * TAU / 8 - T * .3; c.beginPath(); c.moveTo(X + Math.cos(a) * r * 1.05, Y + Math.sin(a) * r * 1.05); c.lineTo(X + Math.cos(a) * r * 1.3, Y + Math.sin(a) * r * 1.3); c.stroke(); }
  }
  function gate(c, A, d, i, T) {
    const { S, B, cellX, cellY, doorFx, GLYPH, cur, E, plateHeld } = A, s = B.s, G = GLYPH[i % 4], f = doorFx[i], o = clamp(f.open, 0, 1);
    const X = cellX(d.x), Y = cellY(d.y) - B.h * .5, m = s * .08, shake = f.flash > 0 ? Math.sin(T * 60) * f.flash * s * .04 : 0;
    // when it opens, the leather panel is lifted away from the screen: it shrinks and its shadow fades and blurs
    if (o < .98) {
      c.save(); c.globalAlpha = 1 - o * .9;
      const sc = 1 - o * .35, bw = (s - 2 * m) * sc, cx = X + s / 2 + shake, cy = Y + s / 2;
      if (o > .02) { c.shadowColor = SIL; c.shadowBlur = o * s * .3; }
      c.fillStyle = SIL; c.beginPath(); c.roundRect(cx - bw / 2, cy - bw / 2, bw, bw, s * .12 * sc); c.fill();
      c.shadowBlur = 0;
      // a glass window shaped like its glyph, and a strip of coloured glass along the top and bottom
      c.globalCompositeOperation = 'source-over'; c.fillStyle = G.c;
      c.save(); c.shadowColor = G.c; c.shadowBlur = s * .2; glyphPath(c, G, cx, cy, s * .15 * sc); c.fill(); c.restore();
      c.globalAlpha *= .85; c.fillRect(cx - bw * .36, cy - bw * .4, bw * .72, bw * .08); c.fillRect(cx - bw * .36, cy + bw * .32, bw * .72, bw * .08);
      c.restore();
    }
    c.save(); c.globalAlpha = o * .5; c.setLineDash([4, 4]); c.strokeStyle = SIL; c.lineWidth = 1.5; c.strokeRect(X + m, Y + m, s - 2 * m, s - 2 * m); c.restore();
    if (d.kind === 'timed') {
      if (o < .5) {   // a little hourglass cut into the corner
        const hx = X + s * .8, hy = Y + s * .2, k = s * .08;
        c.fillStyle = '#ffd68f'; c.beginPath(); c.moveTo(hx - k, hy - k * 1.3); c.lineTo(hx + k, hy - k * 1.3); c.lineTo(hx, hy); c.lineTo(hx + k, hy + k * 1.3); c.lineTo(hx - k, hy + k * 1.3); c.lineTo(hx, hy); c.closePath(); c.fill();
      } else {
        const t = (cur().timers || [])[i] || 0;
        if (t > 0 && !plateHeld(i)) {
          const cx = X + s / 2, cy = Y + s / 2;
          c.strokeStyle = G.c; c.lineWidth = s * .07; c.lineCap = 'round'; c.beginPath(); c.arc(cx, cy, s * .28, -Math.PI / 2, -Math.PI / 2 + TAU * t / E.TIMER); c.stroke();
          c.fillStyle = SIL; c.font = `800 ${Math.round(s * .38)}px "Baloo Bhaijaan 2", system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('٠١٢٣٤٥٦٧٨٩'[t], cx, cy + s * .03);
        }
      }
    }
  }
  // ----- the puppet: jointed cut leather on a rod; coloured translucent panels where the light shows through -----
  function puppet(g, st) {
    const { walk, ph, mood, blink, ghost, T, seed } = st;
    const sw = Math.sin(ph) * walk, bob = Math.abs(Math.sin(ph)) * 3 * walk;
    const cheer = mood === 'cheer', fill = SIL;
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.translate(0, -bob);
    // the rod, held from below the screen
    g.strokeStyle = fill; g.lineWidth = 2.2; g.beginPath(); g.moveTo(14 + sw * 3, cheer ? -96 : -50); g.lineTo(30, 18 + bob); g.stroke();
    // legs (pinned at the hip, swinging), curled slippers
    g.lineWidth = 6;
    for (const sd of [-1, 1]) {
      const a = sd * sw * .5, hx = sd * 5, hy = -30, fx = hx + Math.sin(a) * 26, fy = hy + Math.cos(a) * 28;
      g.beginPath(); g.moveTo(hx, hy); g.lineTo(fx, fy); g.stroke();
      g.fillStyle = fill; g.beginPath(); g.ellipse(fx + 4, fy - 1, 7, 3.5, 0, 0, TAU); g.fill();
      g.beginPath(); g.arc(fx + 11, fy - 3, 2.4, 0, TAU); g.fill();
    }
    // robe
    g.fillStyle = fill; g.beginPath(); g.moveTo(-11, -64); g.lineTo(11, -64); g.lineTo(19, -26); g.quadraticCurveTo(0, -20, -19, -26); g.closePath(); g.fill();
    if (!ghost) {
      g.save(); g.globalAlpha = .92;
      g.fillStyle = '#d2402c'; g.beginPath(); g.moveTo(-7, -60); g.lineTo(7, -60); g.lineTo(14, -30); g.quadraticCurveTo(0, -26, -14, -30); g.closePath(); g.fill();
      g.fillStyle = '#f2b233'; g.fillRect(-10, -47, 20, 4.5);
      g.fillStyle = 'rgba(255,240,200,.85)'; for (const [x, y] of [[-6, -38], [0, -36], [6, -38], [0, -54]]) { g.beginPath(); g.arc(x, y, 1.3, 0, TAU); g.fill(); }
      g.restore();
    }
    // the arm on the rod
    const ax = 10, ay = -60, hx = cheer ? 16 : 14 + sw * 3, hy = cheer ? -96 : -50;
    g.strokeStyle = fill; g.lineWidth = 5; g.beginPath(); g.moveTo(ax, ay); g.lineTo((ax + hx) / 2 + 5, (ay + hy) / 2); g.lineTo(hx, hy); g.stroke();
    g.fillStyle = fill; g.beginPath(); g.arc(hx, hy, 3.6, 0, TAU); g.fill();
    // back arm, swinging
    g.lineWidth = 4.5; g.beginPath(); g.moveTo(-9, -60); g.lineTo(-15 - sw * 3, -46); g.lineTo(-13 - sw * 5, -36); g.stroke();
    // head, with a tall hat and a swinging tassel
    const tilt = Math.sin(T * 1.7 + seed) * .05 + sw * .05 + (mood === 'worry' ? .15 : 0);
    g.save(); g.translate(0, -76); g.rotate(tilt);
    g.fillStyle = fill; g.beginPath(); g.arc(0, 0, 13, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(12, 1); g.quadraticCurveTo(19, 3, 13, 7); g.fill();   // nose, in profile
    g.beginPath(); g.moveTo(-11, -7); g.lineTo(-6, -38); g.quadraticCurveTo(0, -42, 4, -36); g.lineTo(11, -7); g.closePath(); g.fill();
    if (!ghost) { g.save(); g.globalAlpha = .9; g.fillStyle = '#2a9d8f'; g.beginPath(); g.moveTo(-7, -11); g.lineTo(-3.5, -32); g.lineTo(2, -31); g.lineTo(7, -11); g.closePath(); g.fill(); g.restore(); }
    const ts = Math.sin(T * 4 + seed) * .4 + sw * .5;
    g.strokeStyle = fill; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, -40); g.quadraticCurveTo(-8 + ts * 6, -40, -12 + ts * 10, -30); g.stroke();
    g.beginPath(); g.arc(-12 + ts * 10, -28, 3, 0, TAU); g.fill();
    // the eye and mouth are holes: the lamp shines through them
    g.fillStyle = ghost ? 'rgba(0,0,0,0)' : '#fff6dc'; g.strokeStyle = '#fff6dc'; g.lineWidth = 2;
    if (!ghost) {
      if (blink || mood === 'happy' || mood === 'cheer') { g.beginPath(); if (blink) { g.moveTo(1, -2); g.lineTo(8, -2); } else g.arc(5, 0, 3.4, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
      else { const r = mood === 'oops' ? 4.6 : 3.4; g.beginPath(); g.arc(5, -2, r, 0, TAU); g.fill(); g.fillStyle = SIL; g.beginPath(); g.arc(6.2, -1.6, r * .45, 0, TAU); g.fill(); }
      if (mood === 'worry') { g.beginPath(); g.moveTo(1, -9); g.lineTo(9, -6); g.stroke(); }
      g.beginPath(); if (mood === 'oops') g.arc(8, 7, 2, 0, TAU), g.fill(); else { g.arc(6, 5, 3.4, .2, Math.PI * .7); g.stroke(); }
    }
    g.restore();
  }
  function ent(c, e, X, Y, cell, T, look, mood) {
    if (look[0]) e._h = look[0];
    const dpr = Math.min(devicePixelRatio || 1, 3), S = cell * 2, px = Math.round(S * dpr), [b, g] = buf('shadow', px);
    const k = cell * (e.ghost ? .74 : 1) / 100 * dpr;
    g.setTransform(k * (e._h < 0 ? -1 : 1), 0, 0, k, px / 2, px * .86 - (e.jump || 0) * 60 * k);
    puppet(g, { walk: e.walkW || 0, ph: (e.walkPh || 0) * Math.PI / 4, mood, blink: e.blinkT > 0, ghost: e.ghost, T, seed: e.i * 1.7 });
    if (e.ghost) {
      // a طيف is a puppet held far from the cloth: a soft, faint shadow (blur drawn through the shadow offset trick)
      // (blur by drawing small and scaling back up: works on every browser, unlike ctx.filter)
      const q = Math.max(8, Math.round(px / 3.5)), [sb, sg] = buf('shadowSmall', q);
      sg.imageSmoothingEnabled = true; sg.drawImage(b, 0, 0, q, q);
      c.save(); c.globalAlpha *= .62; c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(sb, X - S / 2, Y - S * .86, S, S); c.drawImage(sb, X - S / 2, Y - S * .86, S, S); c.restore();
    } else c.drawImage(b, X - S / 2, Y - S * .86, S, S);
    return true;
  }
  function post(c, A, T) {
    const { VW, VH, S } = A;
    // dust drifting in the lamp light
    c.save(); c.fillStyle = 'rgba(255,214,150,.35)';
    for (let k = 0; k < 26; k++) { const x = (hash(k) * VW + T * (4 + hash(k + 9) * 8)) % VW, y = (hash(k + 3) * VH - T * (3 + hash(k + 5) * 6) % VH + VH) % VH; c.globalAlpha = .25 + .25 * Math.sin(T * 2 + k); c.beginPath(); c.arc(x, y, .8 + hash(k + 7) * 1.4, 0, TAU); c.fill(); }
    c.restore();
    const v = c.createRadialGradient(VW / 2, VH * .48, Math.min(VW, VH) * .35, VW / 2, VH * .48, Math.max(VW, VH) * .8);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(10,4,0,.6)'); c.fillStyle = v; c.fillRect(0, 0, VW, VH);
    if (S.rewindK) { c.fillStyle = `rgba(10,4,0,${Math.sin(S.rewindK * Math.PI) * .45})`; c.fillRect(0, 0, VW, VH); }   // the lamp dips while time runs back
  }
  return { bg, room, ent, post };
})();

// =====================================================================================================
// شريط فيديو
// =====================================================================================================
const vhs = (() => {
  const NEON = { cyan: '#3df2ff', pink: '#ff3fa4', purple: '#9b5cff', yellow: '#ffe14d', red: '#ff3b3b' };
  let scan = null;
  function bg(c, A, T) {
    const { VW, VH } = A;
    c.fillStyle = '#0b0a14'; c.fillRect(0, 0, VW, VH);
    const g = c.createLinearGradient(0, VH * .5, 0, VH); g.addColorStop(0, 'rgba(155,92,255,0)'); g.addColorStop(1, 'rgba(155,92,255,.18)'); c.fillStyle = g; c.fillRect(0, 0, VW, VH);
    // a perspective grid sinking toward the horizon behind everything (slow scroll)
    c.save(); c.strokeStyle = 'rgba(255,63,164,.16)'; c.lineWidth = 1; const hy = VH * .62;
    for (let k = 0; k < 14; k++) { const t = ((k + (T * .4) % 1) / 14), y = hy + Math.pow(t, 2.2) * (VH - hy); c.beginPath(); c.moveTo(0, y); c.lineTo(VW, y); c.stroke(); }
    for (let k = -10; k <= 10; k++) { c.beginPath(); c.moveTo(VW / 2 + k * 14, hy); c.lineTo(VW / 2 + k * 90, VH); c.stroke(); }
    c.restore();
  }
  function glow(c, col, blur) { c.shadowColor = col; c.shadowBlur = blur; }
  function room(c, A, T) {
    const G = geo(A), { R, s, x0, y0, w, h, CX, CY } = G, { S, isWall } = A;
    // the playfield
    c.save(); glow(c, NEON.purple, s * .4); c.fillStyle = '#120f2a'; c.beginPath(); c.roundRect(x0, y0, w, h, s * .12); c.fill(); c.restore();
    // walls: dark purple blocks with fine magenta lines
    c.save(); c.beginPath(); c.rect(x0, y0, w, h); floorPath(c, A, G, s * .16); c.clip('evenodd');
    c.fillStyle = '#26103f'; c.fillRect(x0, y0, w, h);
    c.strokeStyle = 'rgba(255,63,164,.16)'; c.lineWidth = 1; c.beginPath(); for (let y = y0 + 2; y < y0 + h; y += 4) { c.moveTo(x0, y); c.lineTo(x0 + w, y); } c.stroke();
    c.restore();
    // floor: deep blue with a glowing cyan grid
    c.save(); c.beginPath(); floorPath(c, A, G, s * .16); c.clip();
    c.fillStyle = '#0d1636'; c.fillRect(x0, y0, w, h);
    glow(c, NEON.cyan, 6); c.strokeStyle = 'rgba(61,242,255,.32)'; c.lineWidth = 1.2; c.beginPath();
    for (let x = 0; x <= R.W; x++) { c.moveTo(CX(x), y0); c.lineTo(CX(x), y0 + h); }
    for (let y = -1; y < R.H; y++) { c.moveTo(x0, CY(y) + s); c.lineTo(x0 + w, CY(y) + s); }
    c.stroke(); c.restore();
    // neon edges where wall meets floor
    c.save(); glow(c, NEON.pink, 10); c.strokeStyle = NEON.pink; c.lineWidth = 2.2; c.lineCap = 'round'; c.beginPath();
    for (const [ax, ay, bx, by] of edgeRuns(A, G)) { c.moveTo(ax, ay); c.lineTo(bx, by); } c.stroke(); c.restore();
    c.save(); glow(c, NEON.purple, 12); c.strokeStyle = NEON.purple; c.lineWidth = 2; c.beginPath(); c.roundRect(x0, y0, w, h, s * .12); c.stroke(); c.restore();
    R.plates.forEach((p, j) => plate(c, A, p, j, T));
    exit(c, A, T);
    R.doors.forEach((d, i) => gate(c, A, d, i, T));
    // on-screen display above the board: recording or playing back
    const rec = Math.floor(T * 2) % 2 === 0, n = S.echoes.length;
    c.save(); c.font = `800 ${Math.round(clamp(s * .3, 13, 18))}px "Baloo Bhaijaan 2", system-ui, sans-serif`; c.textBaseline = 'bottom';
    c.textAlign = 'right'; glow(c, NEON.red, 8); c.fillStyle = rec ? NEON.red : 'rgba(255,59,59,.35)'; c.fillText('● تسجيل', x0 + w, y0 - s * .12);
    if (n) { c.textAlign = 'left'; glow(c, NEON.cyan, 8); c.fillStyle = NEON.cyan; c.fillText('▶ ' + '٠١٢٣٤٥٦٧٨٩'[n] + ' ×', x0, y0 - s * .12); }
    c.restore();
  }
  function plate(c, A, p, j, T) {
    const { S, scr, plateFx, GLYPH, B } = A, s = B.s, d = S.R.doors[p.door], G = GLYPH[p.door % 4], on = plateFx[j].on, [X, Y] = scr(p.x, p.y), r = s * .29;
    c.save(); glow(c, G.c, 10 + on * 14);
    if (on > .05) { c.globalAlpha = on * .35; c.fillStyle = G.c; c.beginPath(); c.arc(X, Y, r, 0, TAU); c.fill(); c.globalAlpha = 1; }
    c.strokeStyle = G.c; c.lineWidth = s * .055;
    if (d.kind === 'inverse') { c.setLineDash([s * .08, s * .06]); c.lineDashOffset = -T * 20; }
    c.beginPath(); c.arc(X, Y, r, 0, TAU); c.stroke(); c.setLineDash([]);
    c.lineWidth = 2; glyphPath(c, G, X, Y, s * .09); c.stroke();
    if (plateFx[j].hover) { c.globalAlpha = .6 + Math.sin(T * 8) * .3; c.beginPath(); c.arc(X, Y, r * 1.4, 0, TAU); c.stroke(); }
    c.restore();
  }
  function exit(c, A, T) {
    const { S, scr, B } = A, s = B.s, [X, Y] = scr(S.R.exit.x, S.R.exit.y), r = s * .34;
    c.save(); glow(c, NEON.yellow, s * (.3 + (S.nearExit || 0) * .3)); c.strokeStyle = NEON.yellow; c.lineWidth = 2.5; c.lineJoin = 'round';
    star(c, X, Y, r * .9 * (1 + Math.sin(T * 4) * .06), r * .4, 0); c.stroke();
    c.setLineDash([4, 6]); c.lineDashOffset = T * 12; c.beginPath(); c.arc(X, Y, r * 1.25, 0, TAU); c.stroke();
    c.restore();
  }
  function gate(c, A, d, i, T) {
    const { B, cellX, cellY, doorFx, GLYPH, cur, E, plateHeld } = A, s = B.s, G = GLYPH[i % 4], f = doorFx[i], o = clamp(f.open, 0, 1);
    const X = cellX(d.x), Y = cellY(d.y) - B.h * .5, m = s * .1, shake = f.flash > 0 ? Math.sin(T * 60) * f.flash * s * .05 : 0;
    // emitters at both ends; a laser curtain between them that retracts when open
    c.save(); glow(c, G.c, 10); c.fillStyle = G.c;
    c.fillRect(X + m, Y + m * .6, s - 2 * m, s * .06); c.fillRect(X + m, Y + s - m * .6 - s * .06, s - 2 * m, s * .06);
    if (o < .98) {
      const len = (s - 2 * m) * (1 - o);
      c.strokeStyle = G.c; c.lineWidth = 2;
      for (let k = 0; k < 5; k++) {
        const xx = X + m + (k + .5) * (s - 2 * m) / 5 + shake, fl = .55 + .45 * hash(Math.floor(T * 20) + k * 13 + i * 7);
        c.globalAlpha = fl * (1 - o * .5); c.beginPath(); c.moveTo(xx, Y + s / 2 - len / 2); c.lineTo(xx, Y + s / 2 + len / 2); c.stroke();
      }
      c.globalAlpha = 1 - o; c.fillStyle = '#0d1636'; c.beginPath(); c.roundRect(X + s / 2 - s * .17, Y + s / 2 - s * .17, s * .34, s * .34, 4); c.fill();
      c.strokeStyle = G.c; c.lineWidth = 2; c.stroke(); glyphPath(c, G, X + s / 2, Y + s / 2, s * .09); c.fillStyle = G.c; c.fill();
    }
    c.restore();
    if (d.kind === 'timed') {
      const t = (cur().timers || [])[i] || 0, cx = X + s / 2, cy = Y + s / 2;
      c.save(); c.font = `800 ${Math.round(s * (o > .5 ? .4 : .2))}px "Baloo Bhaijaan 2", system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; glow(c, NEON.yellow, 8); c.fillStyle = NEON.yellow;
      if (o > .5 && t > 0 && !plateHeld(i)) c.fillText('٠:٠' + '٠١٢٣٤٥٦٧٨٩'[t], cx, cy + s * .03);
      else if (o < .5) c.fillText('⏱', X + s * .8, Y + s * .22);
      c.restore();
    }
  }
  // ----- the hero: a little body under a cassette head; the face is pixels on the label; the reels turn as it walks -----
  function cassette(g, st) {
    const { walk, ph, mood, blink, T, reel } = st;
    const sw = Math.sin(ph) * walk, bob = Math.abs(Math.sin(ph)) * 3 * walk, cheer = mood === 'cheer';
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.translate(0, -bob);
    // legs and sneakers
    g.strokeStyle = '#e8e6f5'; g.lineWidth = 4;
    for (const sd of [-1, 1]) { const fx = sd * 8 + sw * sd * 6, fy = Math.max(0, sd * sw) * -5; g.beginPath(); g.moveTo(sd * 6, -26); g.lineTo(fx, fy - 3); g.stroke(); g.fillStyle = NEON.pink; g.beginPath(); g.roundRect(fx - 6, fy - 5, 12, 6, 3); g.fill(); }
    // body: a little player with two buttons
    g.fillStyle = '#23213a'; g.strokeStyle = '#0b0a14'; g.lineWidth = 2.5; g.beginPath(); g.roundRect(-13, -46, 26, 22, 5); g.fill(); g.stroke();
    g.fillStyle = NEON.red; g.beginPath(); g.arc(-5, -35, 3, 0, TAU); g.fill(); g.fillStyle = NEON.cyan; g.beginPath(); g.moveTo(3, -38); g.lineTo(8, -35); g.lineTo(3, -32); g.fill();
    // arms
    g.strokeStyle = '#e8e6f5'; g.lineWidth = 3.5;
    for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(sd * 13, -42); g.lineTo(sd * (19 + (cheer ? 2 : 0)), cheer ? -62 : -30 + sd * sw * 4); g.stroke(); }
    // the cassette head
    const tilt = Math.sin(T * 1.6) * .03 + sw * .04 + (mood === 'worry' ? .12 : 0);
    g.save(); g.translate(0, -70); g.rotate(tilt);
    g.fillStyle = '#efe4c8'; g.strokeStyle = '#0b0a14'; g.lineWidth = 3; g.beginPath(); g.roundRect(-31, -24, 62, 44, 6); g.fill(); g.stroke();
    g.fillStyle = '#ff5a5f'; g.beginPath(); g.roundRect(-25, -19, 50, 20, 3); g.fill();
    g.fillStyle = '#ffd166'; g.fillRect(-25, -19, 50, 4);
    // tape window with turning reels
    g.fillStyle = '#2b2b38'; g.beginPath(); g.roundRect(-17, 4, 34, 12, 5); g.fill();
    for (const sd of [-1, 1]) {
      g.save(); g.translate(sd * 9, 10); g.rotate(reel * sd);
      g.fillStyle = '#d8d2bf'; g.beginPath(); g.arc(0, 0, 4.6, 0, TAU); g.fill();
      g.fillStyle = '#2b2b38'; for (let k = 0; k < 3; k++) { g.rotate(TAU / 3); g.fillRect(-.8, -4, 1.6, 2.6); }
      g.restore();
    }
    g.fillStyle = '#0b0a14'; for (const [x, y] of [[-27, -20], [27, -20], [-27, 16], [27, 16]]) { g.beginPath(); g.arc(x, y, 1.4, 0, TAU); g.fill(); }
    // pixel face on the label
    g.fillStyle = '#1a1020'; const P = 2.6;
    const px = (cx, cy, rows) => rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') g.fillRect(cx + i * P, cy + j * P, P, P); }));
    let eye = ['.##.', '####', '####', '.##.'];
    if (blink) eye = ['....', '....', '####', '....'];
    else if (mood === 'happy' || cheer) eye = ['....', '.##.', '#..#', '....'];
    else if (mood === 'oops') eye = ['#..#', '.##.', '.##.', '#..#'];
    else if (mood === 'worry') eye = ['##..', '.##.', '.##.', '.##.'];
    px(-17, -15, eye); px(6, -15, mood === 'worry' ? eye.map(r => [...r].reverse().join('')) : eye);
    g.restore();
  }
  function ent(c, e, X, Y, cell, T, look, mood) {
    const dpr = Math.min(devicePixelRatio || 1, 3), S = cell * 2, px = Math.round(S * dpr), [b, g] = buf('vhs', px);
    const k = cell * (e.ghost ? .72 : 1) / 112 * dpr;
    g.setTransform(k, 0, 0, k, px / 2 + (look[0] || 0) * 2 * k, px * .86 - (e.jump || 0) * 60 * k);
    e._reel = (e._reel || 0) + (e.walkW || 0) * .25;
    cassette(g, { walk: e.walkW || 0, ph: (e.walkPh || 0) * Math.PI / 4, mood, blink: e.ghost ? false : e.blinkT > 0, T, reel: e._reel });
    if (!e.ghost) { c.drawImage(b, X - S / 2, Y - S * .86, S, S); return true; }
    // a طيف is an old recording: two colour channels slipping apart, faded, with a torn line now and then
    const [t1, g1] = buf('vhsC', px), [t2, g2] = buf('vhsM', px);
    for (const [tb, tg, col] of [[t1, g1, 'rgba(61,242,255,.9)'], [t2, g2, 'rgba(255,63,164,.9)']]) { tg.drawImage(b, 0, 0); tg.globalCompositeOperation = 'source-atop'; tg.fillStyle = col; tg.fillRect(0, 0, px, px); tg.globalCompositeOperation = 'source-over'; }
    const j = Math.sin(T * 3 + e.i) * 1.5 + (hash(Math.floor(T * 12) + e.i) > .9 ? 4 : 0);
    c.save(); c.globalAlpha = .55; c.globalCompositeOperation = 'lighter';
    c.drawImage(t1, X - S / 2 - 2 - j, Y - S * .86, S, S); c.drawImage(t2, X - S / 2 + 2 + j, Y - S * .86, S, S);
    c.restore();
    return true;
  }
  function post(c, A, T) {
    const { VW, VH, S, DPR, cv } = A;
    if (S.rewindK) {   // rewinding: the picture tears into slipping bands, and the OSD shows ◀◀
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
      const W = cv.width, H = cv.height;
      for (let k = 0; k < 7; k++) { const y = Math.floor(hash(k + Math.floor(T * 30)) * H), hh = Math.floor((10 + hash(k + 3) * 40) * DPR), off = (hash(k + 7 + Math.floor(T * 30)) - .5) * 60 * DPR * Math.sin(S.rewindK * Math.PI); c.drawImage(cv, 0, y, W, hh, off, y, W, hh); }
      c.restore();
      c.save(); c.font = '800 44px "Baloo Bhaijaan 2", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.globalAlpha = Math.sin(S.rewindK * Math.PI);
      c.fillStyle = NEON.pink; c.fillText('◀◀ ترجيع', VW / 2 + 3, VH * .42); c.fillStyle = NEON.cyan; c.fillText('◀◀ ترجيع', VW / 2 - 3, VH * .42); c.fillStyle = '#fff'; c.fillText('◀◀ ترجيع', VW / 2, VH * .42);
      c.restore();
    }
    // scanlines, a slow rolling band, and a curved-glass vignette
    if (!scan) { const p = document.createElement('canvas'); p.width = 1; p.height = 3; const g = p.getContext('2d'); g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(0, 2, 1, 1); scan = c.createPattern(p, 'repeat'); }
    c.fillStyle = scan; c.fillRect(0, 0, VW, VH);
    const by = (T * 90) % (VH + 80) - 40; const bg = c.createLinearGradient(0, by - 30, 0, by + 30); bg.addColorStop(0, 'rgba(255,255,255,0)'); bg.addColorStop(.5, 'rgba(255,255,255,.035)'); bg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = bg; c.fillRect(0, by - 30, VW, 60);
    const v = c.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * .4, VW / 2, VH / 2, Math.max(VW, VH) * .75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)'); c.fillStyle = v; c.fillRect(0, 0, VW, VH);
  }
  return { bg, room, ent, post };
})();

// =====================================================================================================
const sketch = {
  bg: (c, A) => SKETCH.paper(c, A.VW, A.VH, A.DPR),
  room: (c, A, T) => SKETCH.room(c, A, T),
  ent: (c, e, X, Y, cell, T, look, mood) => SKETCH.cur !== 'blob' && SKETCH.drawEnt(c, e, X, Y, cell, T, look, mood),
};
const ALL = { clean: null, sketch, shadow, vhs };
let cur = 'shadow';
return { get: () => ALL[cur], set: n => { cur = n; document.body.dataset.theme = n; }, get cur() { return cur; } };
})();

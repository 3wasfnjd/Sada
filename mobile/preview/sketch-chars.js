// Preview only: four characters from the Aboden-Assets pack «شخبطات عبودين» (sketch/index.html, copied as-is
// from 3wasfnjd/Aboden-Assets) so they can be tried on the طيف board. Not part of the game build.
window.SKETCH = (() => {
let ctx = null;
const reduce = false;
const INK = '#1b1a1c', PAPER = '#fbf9f4';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
let seed = 1; const R = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; const J = a => (R() - .5) * 2 * a;

// ---------- pencil and watercolour primitives ----------
function path(p, closed) {
  ctx.beginPath(); const n = p.length; if (n < 2) return;
  if (closed) { const m = [(p[n - 1][0] + p[0][0]) / 2, (p[n - 1][1] + p[0][1]) / 2]; ctx.moveTo(m[0], m[1]); for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); } }
  else { ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2); ctx.lineTo(p[n - 1][0], p[n - 1][1]); }
}
const jit = (p, a) => p.map(([x, y]) => [x + J(a), y + J(a)]);
function ink(p, o = {}) {
  const w = o.w ?? 1.9, j = o.j ?? 1.3, n = o.n ?? ((o.w ?? 1.9) >= 2 ? 3 : 2), a = o.a ?? .92, col = o.col ?? INK, closed = !!o.closed;
  ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let k = 0; k < n; k++) {
    let q = jit(p, j * (k ? 1.6 : 1));
    if (!closed && q.length > 1 && k === 0) { const [x0, y0] = q[0], [x1, y1] = q[1], [xa, ya] = q[q.length - 1], [xb, yb] = q[q.length - 2]; const o1 = .15 + R() * .2, o2 = .15 + R() * .2; q = [[x0 + (x0 - x1) * o1, y0 + (y0 - y1) * o1], ...q, [xa + (xa - xb) * o2, ya + (ya - yb) * o2]]; }
    ctx.globalAlpha = a * (k ? .4 : 1); ctx.lineWidth = w * (k ? .5 : 1) * (.8 + R() * .4); path(q, closed); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function ell(cx, cy, rx, ry, o = {}) {
  const n = o.n ?? 28, wob = o.wob ?? .045, over = o.over ?? .4, rot = o.rot ?? 0, s = o.start ?? R() * 6.283, tot = Math.PI * 2 + over, c = Math.cos(rot), sn = Math.sin(rot), pts = [];
  const cnt = over ? n : n - 1;
  for (let i = 0; i <= cnt; i++) { const a = s + tot * i / n, r = 1 + J(wob), x = Math.cos(a) * rx * r, y = Math.sin(a) * ry * r; pts.push([cx + x * c - y * sn, cy + x * sn + y * c]); }
  return pts;
}
const shape = (cx, cy, rx, ry, rot = 0, wob = .03) => ell(cx, cy, rx, ry, { over: 0, rot, wob, n: 30, start: 0 });
function fill(p, col, a = 1) { ctx.globalAlpha = a; ctx.fillStyle = col; path(p, true); ctx.fill(); ctx.globalAlpha = 1; }
function wash(p, col, a = .62, spread = 3) {
  for (let k = 0; k < 3; k++) fill(jit(p, spread + k * 1.6), col, a * (k ? .32 : .7));
  ctx.globalAlpha = a * .35; ctx.strokeStyle = col; ctx.lineWidth = 2.2; path(jit(p, 1.5), true); ctx.stroke(); ctx.globalAlpha = 1;
}
function hatch(p, ang, gap, a = .3, w = 1) {
  ctx.save(); path(p, true); ctx.clip(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, L = Math.hypot(x1 - x0, y1 - y0) / 2 + 4, c = Math.cos(ang), s = Math.sin(ang);
  ctx.globalAlpha = a * .32; ctx.fillStyle = '#8f877e'; for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.ellipse(cx + J(4), cy + J(4), (x1 - x0) / 2, (y1 - y0) / 2, 0, 0, 7); ctx.fill(); }
  ctx.strokeStyle = INK; ctx.lineWidth = w; ctx.globalAlpha = a;
  for (let d = -L; d <= L; d += gap) { const ox = -s * d, oy = c * d; ctx.beginPath(); ctx.moveTo(cx + ox - c * L + J(2), cy + oy - s * L + J(2)); ctx.lineTo(cx + ox + c * L + J(2), cy + oy + s * L + J(2)); ctx.stroke(); }
  ctx.restore(); ctx.globalAlpha = 1;
}
function line(x1, y1, x2, y2, o = {}) { const b = o.bow ?? 0, mx = (x1 + x2) / 2 - (y2 - y1) * b, my = (y1 + y2) / 2 + (x2 - x1) * b; ink([[x1, y1], [mx, my], [x2, y2]], o); }
function fur(cx, cy, rx, ry, a0, a1, count, len, o = {}) { // short strokes flicking outward from an outline
  for (let i = 0; i < count; i++) { const a = a0 + (a1 - a0) * (i + R()) / count, l = len * (.5 + R() * .8), x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry, b = a + J(.35); line(x, y, x + Math.cos(b) * l, y + Math.sin(b) * l, { w: o.w ?? 1.1, n: 1, j: .6, a: o.a ?? .75 }); }
}
function dots(cx, cy, r, count, col, a = .5) { for (let i = 0; i < count; i++) { const ang = R() * 6.283, d = r * Math.sqrt(R()); ctx.globalAlpha = a * (.4 + R() * .6); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, .8 + R() * 1.8, 0, 7); ctx.fill(); } ctx.globalAlpha = 1; }
function scribbleFill(p, col = INK, a = .9) { fill(p, col, a * .85); ink(p, { closed: true, w: 1.6, col, a }); }

// ---------- reusable parts ----------
function egg(x, y, rx, ry, rot, style) {
  const p = shape(x, y, rx, ry, rot, .02);
  fill(p, '#fff', 1);
  ctx.save(); path(p, true); ctx.clip();
  if (style === 'stripes') { const cols = ['#f39a2e', '#86c35a', '#f06e8e', '#f7d046', '#f39a2e']; for (let i = 0; i < 5; i++) { const yy = y - ry + (i + .5) * ry * 2 / 5; wash([[x - rx * 1.4, yy - ry * .16], [x + rx * 1.4, yy - ry * .2 + J(2)], [x + rx * 1.4, yy + ry * .18], [x - rx * 1.4, yy + ry * .2]], cols[i], .7, 2); } }
  else if (style === 'dots') { wash(p, '#fbe3ea', .6); const cs = ['#f06e8e', '#f7d046', '#86c35a', '#7cc4e8']; for (let i = 0; i < 6; i++) { const a = i * 1.1, d = .45; wash(shape(x + Math.cos(a) * rx * d, y + Math.sin(a) * ry * d, rx * .24, rx * .2), cs[i % 4], .7, 1.5); } }
  else { wash(p, style || '#f6b33a', .75); wash(shape(x - rx * .2, y + ry * .25, rx * .7, ry * .45), '#f07a2a', .45); }
  ctx.restore();
  ink(ell(x, y, rx, ry, { rot, wob: .03, over: .3 }), { w: 1.7 });
}
function eyes(st, ex, ey, rx, ry, gap) {
  const s = st.eyeScale * 1.28, b = st.blink, happy = st.happy;
  for (const side of [-1, 1]) {
    const cx = side * gap + ex, cy = ey, erx = rx * s, ery = ry * s * (1 - b * .92);
    if (happy > .5) { ink([[cx - erx * .8, cy + ery * .2], [cx, cy - ery * .55], [cx + erx * .8, cy + ery * .2]], { w: 2.6 }); continue; }
    if (b > .85) { ink([[cx - erx, cy], [cx, cy + 3], [cx + erx, cy]], { w: 2.4 }); continue; }
    fill(shape(cx, cy, erx, ery), '#ffffff');
    ink(ell(cx, cy, erx, ery, { over: .5 }), { w: 3, n: 3, j: 1.6 });
    const px = cx + st.lookX * erx * .42 + side * st.cross * erx * -.35, py = cy + st.lookY * ery * .35 + ery * .1, pr = Math.min(erx, ery) * .27 * st.pupil;
    fill(shape(px, py, pr, pr * 1.1), INK); ink(ell(px, py, pr, pr * 1.1), { w: 1.2, n: 1 });
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px - pr * .35, py - pr * .4, pr * .32, 0, 7); ctx.fill();
  }
}
function mouth(st, x, y, w) {
  if (st.mouth === 'o') { const r = w * .22 * (1 + st.open); fill(shape(x, y + 4, r, r * 1.2), '#3a1418'); ink(ell(x, y + 4, r, r * 1.2), { w: 1.8 }); fill(shape(x, y + 4 + r * .5, r * .55, r * .35), '#e46a7a', .9); return; }
  if (st.mouth === 'laugh') { const p = [[x - w * .55, y - 2], [x, y + w * .55], [x + w * .55, y - 2]]; fill([...p, [x, y + 2]], '#3a1418'); fill(shape(x, y + w * .32, w * .22, w * .12), '#e46a7a'); ink(p, { w: 2 }); line(x - w * .55, y - 2, x + w * .55, y - 2, { w: 1.4, n: 1 }); return; }
  ink([[x - w * .5, y - 3], [x - w * .2, y + w * .22], [x + w * .2, y + w * .22], [x + w * .5, y - 3]], { w: 2 });
  line(x - w * .56, y - 6, x - w * .46, y, { w: 1.2, n: 1 }); line(x + w * .56, y - 6, x + w * .46, y, { w: 1.2, n: 1 });
}
function whiskers(x, y, side, n = 3, len = 46) { for (let i = 0; i < n; i++) { const a = (i - (n - 1) / 2) * .16 + (side > 0 ? 0 : Math.PI); line(x, y + i * 3, x + Math.cos(a) * len, y + i * 3 + Math.sin(a) * len * .6 - 3, { w: 1, n: 1, a: .8 }); } }
function blush(x, y, r, col = '#f4a07a') { wash(shape(x, y, r, r * .65), col, .45, 2.5); }

// ---------- the rig: shared legs, body, arms; each animal adds head and props ----------
function legsAndBody(st, o) {
  const hipY = -o.legLen, legGap = o.legGap ?? 9, footW = o.footW ?? 15;
  for (const side of [-1, 1]) {
    const lift = side < 0 ? st.liftL : st.liftR, fx = side * (legGap + 3) + st.stepX * side, fy = -lift;
    line(side * legGap, hipY + 4, fx, fy - 3, { w: o.legW ?? 2.2, bow: side * .04 });
    if (o.legInk) line(side * legGap + 3, hipY + 4, fx + 3, fy - 3, { w: 1.2, n: 1 });
    const f = shape(fx + side * 5, fy - 2, footW, 5.5, side * .05);
    if (o.feet === 'orange') { line(fx, fy - 2, fx + side * 16, fy, { w: 2.4, col: '#e2701e' }); line(fx, fy - 2, fx + side * 10, fy + 3, { w: 2, col: '#e2701e' }); line(fx, fy - 2, fx - side * 6, fy + 1, { w: 2, col: '#e2701e' }); }
    else scribbleFill(f, INK, .9);
  }
  const by = hipY - o.bodyRy + 8, bp = shape(0, by, o.bodyRx, o.bodyRy);
  fill(bp, '#fff'); if (o.bodyTint) wash(shape(o.bodyRx * .25, by + o.bodyRy * .2, o.bodyRx * .7, o.bodyRy * .7), o.bodyTint, .35);
  hatch(shape(o.bodyRx * .45, by + o.bodyRy * .25, o.bodyRx * .7, o.bodyRy * .85), -.9, 4.5, .22);
  ink(ell(0, by, o.bodyRx, o.bodyRy), { w: 2 });
  if (o.bodyFur) fur(0, by, o.bodyRx, o.bodyRy, 0, Math.PI * 2, 22, 7);
  return { by, top: by - o.bodyRy };
}
function drawArm(s, h, side, o, up) {
  const mid = [(s[0] + h[0]) / 2 + side * 6, (s[1] + h[1]) / 2 + 4];
  ink([s, mid, h], { w: o.w ?? 2 }); if (o.thick) ink([[s[0] + side * 4, s[1] + 3], [mid[0] + side * 4, mid[1] + 2], [h[0] + side * 3, h[1]]], { w: 1.3, n: 1 });
  if (up) { const pm = shape(h[0], h[1] - 4, 8, 9); fill(pm, '#fff'); ink(ell(h[0], h[1] - 4, 8, 9, { over: .3 }), { w: 1.8 }); for (let f = -1; f <= 1; f++) line(h[0] + f * 4, h[1] - 11, h[0] + f * 6, h[1] - 18, { w: 1.5, n: 1 }); line(h[0] - side * 7, h[1] - 3, h[0] - side * 13, h[1] - 8, { w: 1.5, n: 1 }); for (let k = 0; k < 2; k++) ink([[h[0] + side * (14 + k * 6), h[1] - 16], [h[0] + side * (18 + k * 6), h[1] - 6], [h[0] + side * (14 + k * 6), h[1] + 4]], { w: 1.1, n: 1, a: .7 }); }
  else ink(ell(h[0], h[1], 4.5, 4, { over: .3 }), { w: 1.6, n: 1 });
}
function arms(st, sh, hands, o = {}) { // shoulders [x,y], hands: [[x,y],[x,y]] targets
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1, s = [side * sh[0], sh[1]];
    let h = hands[i];
    if (st.wave > 0 && side === (o.waveSide ?? 1)) { const tx = side * 46 + Math.sin(st.t * 14) * 10, ty = s[1] - 46 + Math.cos(st.t * 14) * 3; h = [lerp(h[0], tx, st.wave), lerp(h[1], ty, st.wave)]; }
    if (st.cheer > 0) { const a = -Math.PI / 2 - side * .7 + Math.sin(st.t * 10 + i * 3) * .3, L = o.armLen ?? 38; h = [lerp(h[0], s[0] + Math.cos(a) * L * -side * -1, st.cheer), lerp(h[1], s[1] + Math.sin(a) * L, st.cheer)]; }
    const raised = (st.wave > .15 && side === (o.waveSide ?? 1)) || st.cheer > .15;
    if (raised) { (st._late ||= []).push([s, h, side, o]); continue; }
    drawArm(s, h, side, o, false);
  }
}
function shadow(st, w) { const k = 1 - clamp(-st.y / 120, 0, .6); ctx.globalAlpha = .1 * k; ctx.fillStyle = '#6b6058'; ctx.beginPath(); ctx.ellipse(0, 2, w * k, 6 * k, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1; for (let i = 0; i < 3; i++) line(-w * (.9 + R() * .3), 4 + i * 2.5, w * (.9 + R() * .3), 4 + i * 2.5 + J(1.5), { w: i ? .8 : 1.4, n: 1, a: .55 - i * .12 }); }
function fx(st, hy) { // surprise marks and laugh lines
  if (st.marks > .05) for (let i = -1; i <= 1; i++) { const a = -Math.PI / 2 + i * .55, r0 = 88, r1 = 88 + 26 * st.marks; line(Math.cos(a) * r0, hy + Math.sin(a) * r0, Math.cos(a) * r1, hy + Math.sin(a) * r1, { w: 2.2 }); }
  if (st.laugh > .05) for (const s of [-1, 1]) for (let i = 0; i < 2; i++) ink([[s * (78 + i * 10), hy - 12 + i * 14], [s * (86 + i * 10), hy - 18 + i * 14], [s * (94 + i * 10), hy - 10 + i * 14]], { w: 1.4, n: 1, a: st.laugh });
  if (st.music > .05) { const x = 70, y = hy - 70 + Math.sin(st.t * 5) * 6; ctx.globalAlpha = st.music; ink([[x, y], [x, y - 22], [x + 12, y - 26]], { w: 1.8, n: 1 }); fill(shape(x - 4, y, 5, 4, -.3), INK); ctx.globalAlpha = 1; }
}

const CH = [
  { name: 'ثعلوب', draw(st) {
      const tsw = Math.sin(st.t * 3) * .2; ctx.save(); ctx.translate(20, -40); ctx.rotate(-.9 + tsw); const tl = shape(0, -32, 18, 36); fill(tl, '#fff'); wash(tl, '#ef8a2c', .8); fill(shape(0, -62, 10, 9), '#fff'); ink(ell(0, -32, 18, 36), { w: 2 }); ctx.restore();
      const B = legsAndBody(st, { legLen: 38, bodyRx: 22, bodyRy: 30, bodyTint: '#ef8a2c', footW: 14 });
      wash(shape(-4, B.by - 4, 18, 26), '#ef8a2c', .55); fill(shape(0, B.by + 4, 10, 16), '#fff', .8);
      arms(st, [16, B.top + 10], [[-10, B.by + 6], [12, B.by + 6]], { waveSide: 1 });
      const hy = B.top - 44 + st.headBob;
      ctx.save(); ctx.translate(0, hy); ctx.rotate(st.tilt);
      for (const s of [-1, 1]) { const tri = [[s * 14, -36], [s * 46, -76 - st.ear * 8], [s * 48, -22]]; fill(tri, '#fff'); wash(tri, '#ef8a2c', .85); fill([[s * 40, -62 - st.ear * 6], [s * 46, -76 - st.ear * 8], [s * 47, -60]], INK, .85); ink([...tri, tri[0]], { w: 2 }); }
      const hp = [[-50, -16], [-26, -40], [26, -40], [50, -16], [44, 10], [10, 34], [0, 40], [-10, 34], [-44, 10]]; fill(hp, '#fff'); wash(hp, '#ef8a2c', .8); const ck = [[-44, 8], [-14, 4], [0, 40], [14, 4], [44, 8], [10, 34], [-10, 34]]; fill(ck, '#fff', .9); ink([...hp, hp[0]], { w: 2.2, closed: true });
      eyes(st, 0, -14, 14, 16, 17); fill(shape(0, 30, 6, 4.5), INK); mouth(st, 0, 36, 12); whiskers(-10, 30, -1, 2, 30); whiskers(10, 30, 1, 2, 30);
      ctx.restore(); fx(st, hy);
  } },
  { name: 'صوصو', draw(st) {
      const B = legsAndBody(st, { legLen: 44, bodyRx: 4, bodyRy: 4, legGap: 10, feet: 'orange', legW: 2.4 });
      const hy = -112 + st.headBob;
      ctx.save(); ctx.translate(0, hy); ctx.rotate(st.tilt);
      const hp = shape(0, 0, 60, 66); fill(hp, '#fff'); hatch(shape(30, 20, 30, 40), -.8, 4.5, .18); ink(ell(0, 0, 60, 66), { w: 2.2 }); fur(0, 0, 60, 66, Math.PI * .75, Math.PI * 1.35, 10, 10);
      for (let i = 0; i < 6; i++) line(-6 + i * 3, -64, -16 + i * 7 + J(3), -86 - R() * 10, { w: 1.2, n: 1 });
      eyes(st, -2, -24, 18, 21, 20);
      const op = st.mouth === 'o' || st.mouth === 'laugh' ? 8 : 0, bk = [[-16, -4], [14, -6], [-2, 18 + op]]; fill(bk, '#fff'); wash(bk, '#f39a2e', .9, 1.5); ink([...bk, bk[0]], { w: 2 }); if (op) fill([[-10, 2], [8, 1], [-2, 10]], '#3a1418');
      ctx.restore();
      egg(30, -56, 30, 38, -.25, 'dots'); wash(shape(46, -84, 8, 12), '#e2701e', .7);
      ink([[-40, hy + 30], [-10, -54], [24, -60]], { w: 2 }); ink([[-34, hy + 38], [-8, -48], [20, -52]], { w: 1.2, n: 1 }); // wing
      fx(st, hy);
  } },
  { name: 'بومبوم', draw(st) {
      const B = legsAndBody(st, { legLen: 30, bodyRx: 4, bodyRy: 4, legGap: 12, feet: 'orange', legW: 2.4 });
      const hy = -108 + st.headBob;
      ctx.save(); ctx.translate(0, hy); ctx.rotate(st.tilt);
      for (const s of [-1, 1]) { const tri = [[s * 26, -60], [s * 50, -96 - st.ear * 10], [s * 52, -54]]; fill(tri, '#fff'); wash(tri, '#9a6a42', .7); ink([...tri, tri[0]], { w: 2 }); }
      const hp = shape(0, 0, 62, 76); fill(hp, '#fff'); wash(shape(0, 10, 58, 70), '#c49a6c', .5); wash(shape(0, 30, 34, 40), '#f3e6d0', .7); hatch(shape(30, 24, 30, 44), -.8, 4.5, .2); ink(ell(0, 0, 62, 76), { w: 2.3 });
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) ink([[-14 + j * 14, 30 + i * 11], [-7 + j * 14, 35 + i * 11], [0 + j * 14, 30 + i * 11]], { w: 1, n: 1, a: .6 });
      for (const s of [-1, 1]) { const r = shape(s * 22, -26, 28, 28); fill(r, '#fff'); wash(r, '#f39a2e', .55); ink(ell(s * 22, -26, 28, 28), { w: 1.6, n: 1 }); }
      eyes(st, 0, -26, 19, 20, 22);
      const bk = [[-8, -4], [8, -4], [0, 12]]; fill(bk, '#fff'); wash(bk, '#e2701e', .9, 1); ink([...bk, bk[0]], { w: 1.8 }); if (st.mouth === 'o' || st.mouth === 'laugh') fill(shape(0, 16, 5, 4), '#3a1418');
      for (const s of [-1, 1]) { const w = [[s * 56, -6], [s * 72, 30 + (st.cheer + st.wave) * -30 * (s > 0 ? 1 : .3)], [s * 50, 58]]; fill(w, '#fff'); wash(w, '#9a6a42', .7); ink(w, { w: 2 }); }
      ctx.restore(); fx(st, hy);
  } },
  { name: 'بطروق', draw(st) {
      const B = legsAndBody(st, { legLen: 22, bodyRx: 4, bodyRy: 4, legGap: 12, feet: 'orange', legW: 2.4 });
      const hy = -96 + st.headBob;
      ctx.save(); ctx.translate(0, hy); ctx.rotate(st.tilt);
      const hp = shape(0, 0, 56, 76); fill(hp, '#fff'); wash(hp, '#2d3440', .8, 2); const face = [[-44, -8], [-30, -52], [0, -40], [30, -52], [44, -8], [36, 50], [0, 66], [-36, 50]]; fill(face, '#fff'); wash(face, '#f4efe6', .4); hatch(shape(30, 20, 24, 40), -.8, 4.5, .15); ink(ell(0, 0, 56, 76), { w: 2.3 }); ink([...face, face[0]], { w: 1.4, n: 1, closed: true });
      eyes(st, 0, -24, 15, 17, 17);
      const bk = [[-12, -2], [12, -2], [0, 16]]; fill(bk, '#fff'); wash(bk, '#f39a2e', .95, 1); ink([...bk, bk[0]], { w: 1.8 }); if (st.mouth === 'o' || st.mouth === 'laugh') fill(shape(0, 20, 5, 4), '#3a1418');
      blush(-28, 4, 9, '#f28aa0'); blush(28, 4, 9, '#f28aa0');
      for (const s of [-1, 1]) { const up = (s > 0 ? st.wave : 0) + st.cheer; const fl = [[s * 50, -10], [s * (70 + up * 10), 24 - up * 50], [s * 54, 40]]; fill(fl, '#fff'); wash(fl, '#2d3440', .85, 1.5); ink(fl, { w: 2 }); }
      // little scarf
      const sc = [[-40, 30], [0, 40], [40, 30], [40, 40], [0, 50], [-40, 40]]; fill(sc, '#fff'); wash(sc, '#e8524a', .85, 1.5); ink([...sc, sc[0]], { w: 1.6, closed: true }); const tl = [[20, 44], [30, 70], [40, 68], [32, 42]]; fill(tl, '#fff'); wash(tl, '#e8524a', .85, 1.5); ink([...tl, tl[0]], { w: 1.4, closed: true });
      ctx.restore(); fx(st, hy);
  } },
];
const ACTS = { 'يقفز': 1.1, 'يلوّح': 2.2, 'يرقص': 3.2, 'ينصدم': 1.6, 'يضحك': 2.2, 'يمشي': 3.2 };
const A = CH.map((c, i) => ({ i, act: null, t0: 0, x: 0, phase: Math.random() * 10, blinkT: 1 + Math.random() * 3, blink: 0, look: [0, 0], lookT: 0, hold: 2 + i * .7 }));
function pose(a, t) {
  const st = { t, y: 0, sx: 1, sy: 1, lean: 0, tilt: 0, headBob: 0, blink: 0, eyeScale: 1, pupil: 1, mouth: 'smile', open: 0, wave: 0, cheer: 0, liftL: 0, liftR: 0, stepX: 0, ear: 0, marks: 0, laugh: 0, music: 0, happy: 0, lookX: a.look[0], lookY: a.look[1], cross: 0, x: 0 };
  const br = Math.sin(t * 2.2 + a.phase); st.sy = 1 + br * .015; st.headBob = br * 1.5; st.tilt = Math.sin(t * .8 + a.phase) * .04; st.ear = Math.sin(t * 1.5 + a.phase) * .15;
  st.blink = a.blink;
  if (a.act) {
    const p = (t - a.t0) / ACTS[a.act], q = clamp(p, 0, 1), env = Math.sin(Math.PI * q);
    if (a.act === 'يقفز') {
      if (q < .22) { const k = ease(q / .22); st.sy = 1 - .16 * k; st.sx = 1 + .12 * k; }
      else if (q < .78) { const k = (q - .22) / .56; st.y = -Math.sin(Math.PI * k) * 90; st.sy = 1.08; st.sx = .94; st.liftL = st.liftR = 10 * Math.sin(Math.PI * k); st.cheer = Math.sin(Math.PI * k); st.mouth = 'laugh'; st.ear = -.4; }
      else { const k = (q - .78) / .22; st.sy = 1 - .12 * Math.sin(Math.PI * k); st.sx = 1 + .1 * Math.sin(Math.PI * k); }
    } else if (a.act === 'يلوّح') { st.wave = clamp(env * 3, 0, 1); st.tilt = .12 * env; st.mouth = 'laugh'; st.ear = .3 * env; }
    else if (a.act === 'يرقص') { const k = clamp(env * 3, 0, 1); st.lean = Math.sin(t * 7) * .14 * k; st.y = -Math.abs(Math.sin(t * 7)) * 14 * k; st.liftL = Math.max(0, Math.sin(t * 7)) * 14 * k; st.liftR = Math.max(0, -Math.sin(t * 7)) * 14 * k; st.cheer = k; st.tilt = -Math.sin(t * 7) * .18 * k; st.happy = k; st.mouth = 'laugh'; st.music = k; st.ear = Math.sin(t * 14) * .3 * k; }
    else if (a.act === 'ينصدم') { const k = clamp(env * 2.5, 0, 1); st.eyeScale = 1 + .3 * k; st.pupil = 1 - .45 * k; st.mouth = 'o'; st.open = k; st.marks = k; st.ear = -.6 * k; st.y = -Math.sin(Math.PI * clamp(q / .35, 0, 1)) * 26; st.sy = 1 + .08 * k; st.sx = 1 - .05 * k; st.blink = 0; }
    else if (a.act === 'يضحك') { const k = clamp(env * 3, 0, 1); st.happy = k; st.mouth = 'laugh'; st.lean = Math.sin(t * 30) * .03 * k; st.y = -Math.abs(Math.sin(t * 15)) * 4 * k; st.laugh = k; st.tilt = .15 * k; }
    else if (a.act === 'يمشي') { const k = clamp(env * 3, 0, 1), w = t * 7; st.x = Math.sin(Math.PI * 2 * q) * 34; st.liftL = Math.max(0, Math.sin(w)) * 12 * k; st.liftR = Math.max(0, -Math.sin(w)) * 12 * k; st.y = -Math.abs(Math.sin(w)) * 5 * k; st.lean = Math.cos(Math.PI * 2 * q) * .08 * k; st.lookX = Math.cos(Math.PI * 2 * q) * k; st.stepX = Math.sin(w) * 3 * k; }
    if (p >= 1) a.act = null;
  }
  return st;
}

const H = { 'ثعلوب': 205, 'صوصو': 185, 'بومبوم': 190, 'بطروق': 175 };
const buf = document.createElement('canvas'), bx = buf.getContext('2d');
// draws one entity of the game with the chosen character; ghosts are tinted blue and see-through, eyes closed
function drawEnt(target, e, X, Y, cell, T, look, mood) {
  const c = CH.find(k => k.name === SKETCH.cur); if (!c) return false;
  const S = 2 * cell, dpr = Math.min(devicePixelRatio || 1, 3), px = Math.round(S * dpr);
  if (buf.width !== px) { buf.width = px; buf.height = px; }
  bx.setTransform(1, 0, 0, 1, 0, 0); bx.clearRect(0, 0, px, px);
  const k = (cell * 1.12 / H[c.name]) * dpr;
  bx.setTransform(k, 0, 0, k, px / 2, px * .82);
  ctx = bx;
  const a = { look: [look[0], look[1]], blink: e.ghost ? 1 : (e.blinkT > 0 ? 1 : 0), phase: e.i * 1.7, act: null };
  const st = pose(a, T);
  const w = e.walkW || 0, ph = (e.walkPh || 0) * Math.PI / 4;
  st.liftL = Math.max(0, Math.sin(ph)) * 14 * w; st.liftR = Math.max(0, -Math.sin(ph)) * 14 * w; st.stepX = Math.sin(ph) * 3 * w; st.y = -Math.abs(Math.sin(ph)) * 6 * w - (e.jump || 0) * 110;
  if (mood === 'cheer') { st.cheer = 1; st.happy = 1; st.mouth = 'laugh'; }
  else if (mood === 'happy') { st.happy = 1; st.mouth = 'laugh'; }
  else if (mood === 'oops') { st.eyeScale = 1.3; st.pupil = .55; st.mouth = 'o'; st.open = 1; st.marks = 1; }
  else if (mood === 'worry') { st.mouth = 'o'; st.open = .2; st.tilt = .12; }
  seed = 1 + ((Math.floor(T * 9) * 977 + e.i * 7919) % 2147480000);
  shadow(st, 48);
  bx.translate(0, st.y); bx.rotate(st.lean); bx.scale(st.sx, st.sy);
  c.draw(st);
  if (st._late) for (const [s0, h0, sd, o0] of st._late) drawArm(s0, h0, sd, o0, true);
  if (e.ghost) { bx.setTransform(1, 0, 0, 1, 0, 0); bx.globalCompositeOperation = 'source-atop'; bx.fillStyle = 'rgba(90,170,255,.55)'; bx.fillRect(0, 0, px, px); bx.globalCompositeOperation = 'source-over'; }
  target.save(); target.globalAlpha *= e.ghost ? .78 : 1;
  target.drawImage(buf, X - S / 2, Y - S * .82, S, S);
  target.restore();
  return true;
}
return { cur: 'ثعلوب', names: Object.keys(H), drawEnt };
})();

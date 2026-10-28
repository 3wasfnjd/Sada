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

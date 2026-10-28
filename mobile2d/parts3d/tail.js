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

$('bSound').onclick = () => { audioStart(); setMuted(!S.muted); };

// ---------------- frame ----------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; const T = now / 1000;
  if (!S.R || !staticLayer) { requestAnimationFrame(frame); return; }
  ents.forEach(e => updEnt(e, dt, T));
  doorFx.forEach((f, i) => { f.open += ((f.target || 0) - f.open) * Math.min(1, dt * 9); f.lit += ((hover === i ? 1 : 0) - f.lit) * Math.min(1, dt * 6); });
  plateFx.forEach((f, j) => { f.on += ((f.target || 0) - f.on) * Math.min(1, dt * 12); f.hover = hover >= 0 && S.R.plates[j].door === hover ? 1 : 0; });
  const heroE = ents[ents.length - 1];
  S.nearExit = heroE ? clamp(1 - (Math.hypot(heroE.x - S.R.exit.x, heroE.y - S.R.exit.y) - 1) / 3, 0, 1) : 0;
  music(dt);

  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  ctx.fillStyle = '#b9d9e4'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // room entrance: the island floats up into place; on a win it sinks away
  const ent = clamp((now - (S.enterT || 0)) / 700, 0, 1), out = S.transT ? clamp((now - S.transT) / 380, 0, 1) : 0;
  if (ent >= 1 && S.transT && !S.won) S.transT = 0;
  const slide = (1 - ease(ent)) * 50 + ease(out) * 60 + Math.sin(T * .8) * 2.5;   // the island breathes gently in the air
  ctx.drawImage(skyLayer, 0, 0, VW, VH);   // the sky stays put
  ctx.save();
  ctx.globalAlpha = Math.min(ease(ent), 1 - out);
  ctx.translate(0, slide);
  ctx.drawImage(staticLayer, 0, 0, VW, VH);
  for (const m of minis) ctx.drawImage(m.sp.c, m.x - m.sp.w / 2, m.y - m.sp.h * .55 + Math.sin(T * .9 + m.ph) * 6, m.sp.w, m.sp.h);
  drawExit(T);
  S.R.plates.forEach((p, j) => drawPlate(j, T));
  drawHint(T);
  // depth-sorted: far rows first; walls, doors and characters interleave (3/4 view)
  const items = [];
  for (let y = 0; y < S.R.H; y++) for (let x = 0; x < S.R.W; x++) if (S.R.wall[y * S.R.W + x]) items.push({ d: y + .02, f: () => drawWall(x, y) });
  S.R.doors.forEach((d, i) => items.push({ d: d.y + .02, f: () => drawDoor(i, T) }));
  ents.forEach(e => items.push({ d: e.y, f: () => drawFox(e, T) }));
  items.sort((a, b) => b.d - a.d).forEach(it => it.f());
  drawLink(T);
  drawParts(dt);
  ctx.restore();
  if (S.rewindK) { ctx.fillStyle = `rgba(143,216,255,${Math.sin(S.rewindK * Math.PI) * .12})`; ctx.fillRect(0, 0, VW, VH); }
  drawTicks(T);
  requestAnimationFrame(frame);
}

// test hook (used by the automated play test; harmless for players)
window.__heroBox = () => { const e = ents[ents.length - 1]; const X = bx(e.x + .5), Y = by(e.y + .5); return { x: Math.max(0, X - CS * .9), y: Math.max(0, Y - CS * 1.6), width: CS * 1.8, height: CS * 1.9 }; };
window.__sada = { S, doAction, loadRoom, cur, get ents() { return ents; }, startDemo, showHint, setExpr };

load();
window.addEventListener('resize', resize);
loadRoom(S.n);
resize();
$('bSound').classList.toggle('off', S.muted);
requestAnimationFrame(frame);
})();

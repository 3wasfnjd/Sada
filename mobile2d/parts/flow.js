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


// Proves every room the game can hand out is solvable with its own rules, and reports variety metrics.
import '../src/logic.js';
const E = globalThis.EchoLogic;
let failed = 0;
const fail = m => { failed++; console.error('FAIL', m); };

// tutorials
E.TUTORIAL.forEach((def, i) => {
  const r = E.roomFor(i + 1, 1);
  const alone = !!def.alone;
  if (!r.solution) fail('tutorial ' + (i + 1) + ' has no solution');
  else if (!E.verify(r, alone)) fail('tutorial ' + (i + 1) + ' fails verify');
});

// timed-door rule: open for TIMER ticks after the plate is left
{
  const r = E.fromMap({ L: 12, map: ['..E..', '.....', '##A##', '.....', '1...S'], alone: true }, 99);
  if (!E.aloneSolvable(r, 12)) fail('timed tutorial should be solvable alone');
  const hold = E.fromMap({ L: 12, map: ['..E..', '.....', '##a##', '.....', '1...S'], tasks: [[0]] }, 99);
  if (E.aloneSolvable(hold, 12)) fail('hold door must not be solvable alone');
}
// inverse rule: standing on the plate closes the door
{
  const r = E.fromMap({ L: 9, map: ['..E..', '.....', '##b##', '.y...', '..S..'], tasks: [] }, 99);
  const on = E.run(r, [], ['L', 'U']); // start (2,0) -> (1,0) -> (1,1) = plate
  if (E.doorStates(r, on[2])[0] !== false) fail('inverse door should be closed while its plate is held');
  if (E.doorStates(r, on[0])[0] !== true) fail('inverse door should be open by default');
}

const RUNS = 40, ROOMS = 30, T0 = E.TUTORIAL.length;
let total = 0, worst = 0, sumL = 0, feat = { timed: 0, sync: 0, inverse: 0 }, fewer = 0;
for (let run = 0; run < RUNS; run++) for (let n = T0 + 1; n <= T0 + ROOMS; n++) {
  const t = performance.now(); const r = E.roomFor(n, run + 11); const ms = performance.now() - t; worst = Math.max(worst, ms); total++;
  if (!r) { fail(`run ${run} room ${n}: generator gave up`); continue; }
  if (!E.verify(r)) fail(`run ${run} room ${n}: solution fails, or exit reachable alone`);
  sumL += r.L;
  for (const k in feat) if (r.features[k]) feat[k]++;
  if (r.E < r.doors.filter(d => d.kind !== 'inverse').length) fewer++;
}
const a = E.roomFor(12, 99), b = E.roomFor(12, 99);
if (JSON.stringify([...a.wall, a.doors, a.plates, a.L]) !== JSON.stringify([...b.wall, b.doors, b.plates, b.L])) fail('generator is not deterministic');

const pct = v => (100 * v / total).toFixed(0) + '%';
console.log(`${total} generated rooms checked, slowest ${worst.toFixed(1)} ms, average loop ${(sumL / total).toFixed(1)} ticks`);
console.log(`timed doors ${pct(feat.timed)}, inverse plates ${pct(feat.inverse)}, fewer echoes than gates (echo must move in sync) ${pct(fewer)}`);
if (failed) { console.error(failed + ' failure(s)'); process.exit(1); }
console.log('all checks passed');

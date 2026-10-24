// Proves every room the game can hand out is solvable with its own rules.
import '../src/logic.js';
const E = globalThis.EchoLogic;
let failed = 0;
const fail = m => { failed++; console.error('FAIL', m); };

// tutorials
for (let n = 1; n <= E.TUTORIAL.length; n++) {
  const r = E.roomFor(n, 1);
  if (!r.solution || !r.solution.player) fail('tutorial ' + n + ' has no solution');
  else if (r.doors.length && !E.verify(r)) fail('tutorial ' + n + ' fails verify');
}

// generated rooms: 40 runs x 30 rooms
const RUNS = 40, ROOMS = 30; let worst = 0, total = 0;
for (let run = 0; run < RUNS; run++) for (let n = E.TUTORIAL.length + 1; n <= E.TUTORIAL.length + ROOMS; n++) {
  const t = performance.now(); const r = E.roomFor(n, run + 11); const ms = performance.now() - t; worst = Math.max(worst, ms); total++;
  if (!r) { fail(`run ${run} room ${n}: generator gave up`); continue; }
  if (!E.verify(r)) fail(`run ${run} room ${n}: solution does not reach the exit, or exit reachable alone`);
  if (r.solution.player.length > r.L) fail(`run ${run} room ${n}: solution longer than loop`);
}
// determinism: same seed -> same room
const a = E.roomFor(12, 99), b = E.roomFor(12, 99);
if (JSON.stringify([...a.wall, a.doors, a.plates, a.L]) !== JSON.stringify([...b.wall, b.doors, b.plates, b.L])) fail('generator is not deterministic');

console.log(`${total} generated rooms checked, slowest ${worst.toFixed(1)} ms`);
if (failed) { console.error(failed + ' failure(s)'); process.exit(1); }
console.log('all checks passed');

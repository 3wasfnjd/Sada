// Dumps rooms from the reference JS logic so the Godot port can prove it makes the exact same rooms.
import '../src/logic.js';
import { writeFileSync } from 'node:fs';
const E = globalThis.EchoLogic;
const r = E.rng(12345); const rng = [r(), r(), r(), r(), r()];
const rooms = [];
for (const seed of [11, 777, 2026]) for (const n of [1, 2, 3, 4, 5, 6, 9, 15, 24, 33]) {
  const R = E.roomFor(n, seed);
  rooms.push({
    seed, n, W: R.W, H: R.H, wall: Array.from(R.wall).join(''), L: R.L, E: R.E,
    start: [R.start.x, R.start.y], exit: [R.exit.x, R.exit.y],
    doors: R.doors.map(d => [d.x, d.y, d.kind]), plates: R.plates.map(p => [p.x, p.y, p.door]),
    echoes: R.solution.echoes.map(e => e.join('')), player: R.solution.player.join(''),
  });
}
writeFileSync(new URL('../quest/tests/fixtures.json', import.meta.url), JSON.stringify({ rng, rooms }, null, 1));
console.log('fixtures:', rooms.length, 'rooms');

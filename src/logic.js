// ===== صدى — pure game logic (no rendering) — v0.2 =====
// Door kinds:
//   hold    — open while someone stands on its plate
//   timed   — like hold, but stays open TIMER more ticks after the plate is left
//   inverse — open by default, CLOSED while someone stands on its plate
// Any door with someone standing inside it stays open.
(function (root) {
  const DIRS = { U: [0, 1], D: [0, -1], L: [-1, 0], R: [1, 0], W: [0, 0] };
  const MOVES = ['U', 'D', 'L', 'R'];
  const TIMER = 3;

  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clampI = (v, a, b) => Math.max(a, Math.min(b, v));
  const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const idx = (room, x, y) => y * room.W + x;
  const same = (a, b) => a.x === b.x && a.y === b.y;
  function doorAt(room, x, y) { for (let i = 0; i < room.doors.length; i++) if (room.doors[i].x === x && room.doors[i].y === y) return i; return -1; }

  // positions arrays carry .timers (one per door, 0 for non-timed)
  function withTimers(pos, timers) { pos.timers = timers; return pos; }
  function plateOn(room, pos, door) {
    return room.plates.some(p => p.door === door && (pos.some(e => e.x === p.x && e.y === p.y) || (room.pinned || []).some(e => e.x === p.x && e.y === p.y)));
  }

  function doorStates(room, pos) {
    const timers = pos.timers || [];
    return room.doors.map((d, i) => {
      const on = plateOn(room, pos, i);
      let open = d.kind === 'inverse' ? !on : (on || (d.kind === 'timed' && (timers[i] || 0) > 0));
      if (pos.some(e => e.x === d.x && e.y === d.y)) open = true;
      return open;
    });
  }

  function step(room, pos, actions) {
    const open = doorStates(room, pos);
    const next = pos.map((e, i) => {
      const d = DIRS[actions[i] || 'W'];
      const moving = !!(d[0] || d[1]);
      const nx = e.x + d[0], ny = e.y + d[1];
      if (nx < 0 || ny < 0 || nx >= room.W || ny >= room.H) return { x: e.x, y: e.y, blocked: moving };
      if (room.wall[idx(room, nx, ny)]) return { x: e.x, y: e.y, blocked: moving };
      const di = doorAt(room, nx, ny);
      if (di >= 0 && !open[di] && !(e.x === nx && e.y === ny)) return { x: e.x, y: e.y, blocked: true };
      return { x: nx, y: ny, blocked: false };
    });
    const t0 = pos.timers || [];
    return withTimers(next, room.doors.map((d, i) => d.kind !== 'timed' ? 0 : plateOn(room, pos, i) ? TIMER : Math.max(0, (t0[i] || 0) - 1)));
  }

  function startPos(room, n) { return withTimers(Array.from({ length: n }, () => ({ ...room.start })), room.doors.map(() => 0)); }

  // states[t] = positions (echoes..., player) after t ticks
  function run(room, echoes, player) {
    let pos = startPos(room, echoes.length + 1);
    const states = [pos];
    for (let t = 0; t < player.length; t++) {
      pos = step(room, pos, echoes.map(e => e[t] || 'W').concat([player[t]]));
      states.push(pos);
    }
    return states;
  }

  function bfsPath(room, from, to, doorsPassable) {
    const W = room.W, H = room.H, prev = new Int32Array(W * H).fill(-2);
    const q = [idx(room, from.x, from.y)]; prev[q[0]] = -1;
    let head = 0;
    while (head < q.length) {
      const c = q[head++]; const cx = c % W, cy = (c / W) | 0;
      if (cx === to.x && cy === to.y) {
        const path = []; let k = c;
        while (k !== -1) { path.push({ x: k % W, y: (k / W) | 0 }); k = prev[k]; }
        return path.reverse();
      }
      for (const m of MOVES) {
        const nx = cx + DIRS[m][0], ny = cy + DIRS[m][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = idx(room, nx, ny);
        if (prev[n] !== -2 || room.wall[n]) continue;
        if (!doorsPassable) { const di = doorAt(room, nx, ny); if (di >= 0 && room.doors[di].kind !== 'inverse') continue; }
        prev[n] = c; q.push(n);
      }
    }
    return null;
  }

  // walk to each target in turn (shortest paths), waiting whenever the next step is blocked;
  // waits[k] extra ticks are spent standing on intermediate target k
  function routeMulti(room, echoes, targets, waits = []) {
    const acts = []; let from = { ...room.start };
    for (let k = 0; k < targets.length; k++) {
      const path = bfsPath(room, from, targets[k], true);
      if (!path) return null;
      let pi = 0, guard = 0;
      while (pi < path.length - 1 && guard++ < 40) {
        const states = run(room, echoes, acts);
        const pos = states[states.length - 1];
        const me = pos[pos.length - 1];
        const nxt = path[pi + 1];
        const m = MOVES.find(mm => me.x + DIRS[mm][0] === nxt.x && me.y + DIRS[mm][1] === nxt.y);
        const after = step(room, pos, echoes.map(e => e[acts.length] || 'W').concat([m]));
        if (same(after[after.length - 1], nxt)) { acts.push(m); pi++; } else acts.push('W');
      }
      if (pi !== path.length - 1) return null;
      if (k < targets.length - 1) for (let w = 0; w < (waits[k] || 0); w++) acts.push('W');
      from = targets[k];
    }
    return acts;
  }

  const plateOf = (room, door) => room.plates.find(p => p.door === door);

  // tasks: [[doorIdx, ...], ...] — one echo per task, pressing its doors' plates in order.
  // playerFirst: door indices whose plates the player presses on the way (timed doors only).
  function solveTasks(room, tasks, playerFirst = []) {
    const relay = tasks.map((t, i) => t.length > 1 ? i : -1).filter(i => i >= 0);
    const combos = relay.length ? cartesian(relay.map(() => [0, 1, 2, 3, 4, 5])) : [[]];
    for (const combo of combos) {
      const echoes = []; let ok = true;
      for (let j = 0; j < tasks.length; j++) {
        const waits = relay.includes(j) ? Array(tasks[j].length - 1).fill(combo[relay.indexOf(j)]) : [];
        const a = routeMulti(room, echoes, tasks[j].map(di => plateOf(room, di)), waits);
        if (!a) { ok = false; break; }
        echoes.push(a);
      }
      if (!ok) continue;
      for (const pw of [0, 1, 2]) {
        const targets = playerFirst.map(di => plateOf(room, di)).concat([room.exit]);
        const player = routeMulti(room, echoes, targets, playerFirst.map(() => pw));
        if (player && reaches(room, echoes, player)) return { echoes, player };
      }
    }
    return null;
  }
  function cartesian(lists) { return lists.reduce((acc, l) => acc.flatMap(a => l.map(x => a.concat([x]))), [[]]); }
  function reaches(room, echoes, player) {
    const L = Math.max(player.length, ...echoes.map(e => e.length), 0);
    const st = run(room, echoes.map(e => pad(e, L)), player);
    return same(st[st.length - 1][echoes.length], room.exit);
  }

  // exact check: can the player alone reach the exit within L ticks? (BFS over position + door timers)
  function aloneSolvable(room, L) {
    const start = startPos(room, 1);
    const key = p => p[0].x + ',' + p[0].y + '|' + p.timers.join('');
    let frontier = [start]; const seen = new Set([key(start)]);
    for (let t = 0; t < L; t++) {
      const nextF = [];
      for (const p of frontier) for (const a of ['U', 'D', 'L', 'R', 'W']) {
        const n = step(room, p, [a]);
        if (a !== 'W' && n[0].blocked) continue;
        if (same(n[0], room.exit)) return true;
        const k = key(n); if (!seen.has(k)) { seen.add(k); nextF.push(n); }
      }
      frontier = nextF;
    }
    return false;
  }

  function regionConnected(room, cells) {
    const set = new Set(cells.filter(([x, y]) => !room.wall[idx(room, x, y)]).map(([x, y]) => x + ',' + y));
    if (!set.size) return false;
    const first = set.values().next().value; const seen = new Set([first]); const q = [first];
    while (q.length) {
      const [x, y] = q.pop().split(',').map(Number);
      for (const m of MOVES) { const k = (x + DIRS[m][0]) + ',' + (y + DIRS[m][1]); if (set.has(k) && !seen.has(k)) { seen.add(k); q.push(k); } }
    }
    return seen.size === set.size;
  }

  // ---------- generator ----------
  function difficulty(level) {
    const k = level <= 2 ? 2 : level <= 8 ? 2 + (level % 2) : level <= 18 ? 3 : 3 + (level % 3 === 0 ? 1 : 0);
    return {
      k,
      W: level <= 3 ? 4 : level < 10 ? 5 : 6,
      deep: Math.min(0.6, 0.1 + level * 0.04),
      obst: Math.min(0.2, 0.05 + level * 0.01),
      slack: Math.max(1, 2 - Math.floor(level / 8)),
      tall: Math.min(0.6, 0.2 + level * 0.02),
      pTimed: level < 2 ? 0 : Math.min(0.6, 0.3 + level * 0.03),
      pInverse: level < 4 ? 0 : Math.min(0.4, 0.15 + level * 0.015),
      allowFull: level <= 1 ? 0.3 : 0.12, // chance to keep a room that needs one echo per gate
    };
  }

  // all ways to split n ordered gates into e contiguous groups
  function compositions(n, e) {
    const out = [];
    (function rec(startI, left, acc) {
      if (left === 1) { out.push(acc.concat([n - startI])); return; }
      for (let size = 1; size <= n - startI - (left - 1); size++) rec(startI + size, left - 1, acc.concat([size]));
    })(0, e, []);
    return out;
  }

  // fewest echoes that solve the room, by chaining consecutive gates onto one echo
  function minimalTasks(room) {
    const gates = room.doors.map((d, i) => i).filter(i => room.doors[i].kind !== 'inverse');
    for (let e = 1; e <= gates.length; e++) {
      for (const comp of compositions(gates.length, e)) {
        const tasks = []; let at = 0;
        for (const size of comp) { tasks.push(gates.slice(at, at + size)); at += size; }
        const sol = solveTasks(room, tasks);
        if (sol) return { tasks, sol };
      }
    }
    return null;
  }

  function generate(level, seed) {
    for (let attempt = 0; attempt < 400; attempt++) {
      const r = rng(seed + attempt * 7919);
      const d = difficulty(level);
      const k = d.k, W = d.W;
      const hs = []; for (let i = 0; i <= k; i++) hs.push(i === 0 ? 2 : r() < d.tall ? 2 : 1);
      const H = hs.reduce((a, b) => a + b, 0) + k;
      const room = { W, H, wall: new Uint8Array(W * H), doors: [], plates: [], regions: [] };
      let y = 0;
      for (let i = 0; i <= k; i++) {
        const rows = []; for (let j = 0; j < hs[i]; j++) rows.push(y + j);
        room.regions.push(rows); y += hs[i];
        if (i < k) {
          for (let x = 0; x < W; x++) room.wall[idx(room, x, y)] = 1;
          const px = room.doors.length ? room.doors[room.doors.length - 1].x : ri(r, 0, W - 1);
          const dx = clampI(px + ri(r, -2, 2), 0, W - 1); room.wall[idx(room, dx, y)] = 0;
          const kind = i > 0 && r() < d.pInverse ? 'inverse' : r() < d.pTimed ? 'timed' : 'hold';
          room.doors.push({ x: dx, y, kind });
          y++;
        }
      }
      const gateCount = room.doors.filter(dd => dd.kind !== 'inverse').length;
      if (gateCount < 1) continue;
      const cellsOf = i => { const c = []; for (const yy of room.regions[i]) for (let x = 0; x < W; x++) c.push([x, yy]); return c; };
      const near = new Set(); room.doors.forEach(dd => { near.add(dd.x + ',' + (dd.y - 1)); near.add(dd.x + ',' + (dd.y + 1)); });
      for (let i = 0; i <= k; i++) {
        const cells = cellsOf(i);
        for (const [x, yy] of cells) {
          if (near.has(x + ',' + yy) || r() > d.obst) continue;
          room.wall[idx(room, x, yy)] = 1;
          if (!regionConnected(room, cells)) room.wall[idx(room, x, yy)] = 0;
        }
      }
      const free = i => cellsOf(i).filter(([x, yy]) => !room.wall[idx(room, x, yy)] && !near.has(x + ',' + yy));
      const used = new Set();
      const take = list => { const c = list.filter(([x, yy]) => !used.has(x + ',' + yy)); if (!c.length) return null; const p = pick(r, c); used.add(p[0] + ',' + p[1]); return { x: p[0], y: p[1] }; };
      const bottom = free(0).filter(([, yy]) => yy === 0);
      room.start = take(bottom.length ? bottom : free(0));
      const topRow = free(k).filter(([, yy]) => yy === H - 1);
      room.exit = take(topRow.length ? topRow : free(k));
      if (!room.start || !room.exit) continue;

      // gate plates: mostly on the near side so one echo can walk between them
      let bad = false;
      for (let i = 0; i < k; i++) {
        if (room.doors[i].kind === 'inverse') continue;
        let reg = 0;
        if (i > 0 && r() < d.deep) reg = ri(r, 1, i);
        const minDist = room.doors[i].kind === 'timed' ? TIMER + 2 : 2;
        const p = take(free(reg).filter(([x, yy]) => Math.abs(x - room.doors[i].x) + Math.abs(yy - room.doors[i].y) >= minDist));
        if (!p) { bad = true; break; }
        room.plates.push({ x: p.x, y: p.y, door: i });
      }
      if (bad) continue;

      let best = minimalTasks(room);
      if (!best) continue;
      // the heart of v0.3: fewer echoes than gates, so echoes must move in sync with you
      if (best.tasks.length >= gateCount && r() > d.allowFull) continue;

      // inverse plates on cells an echo crosses
      let invOk = true;
      for (let i = 0; i < k; i++) {
        if (room.doors[i].kind !== 'inverse') continue;
        const sol = best.sol;
        const L0 = Math.max(sol.player.length, ...sol.echoes.map(e => e.length));
        const st = run(room, sol.echoes.map(e => pad(e, L0)), pad(sol.player, L0));
        const crossed = [];
        for (let t = 1; t < st.length; t++) for (let j = 0; j < sol.echoes.length; j++) {
          const c = st[t][j]; const key = c.x + ',' + c.y;
          if (used.has(key) || near.has(key) || doorAt(room, c.x, c.y) >= 0 || room.plates.some(p => same(p, c))) continue;
          if (sol.echoes.every((_, jj) => !same(st[st.length - 1][jj], c))) crossed.push([c.x, c.y]);
        }
        const p = crossed.length ? take(crossed) : null;
        if (!p) { invOk = false; break; }
        room.plates.push({ x: p.x, y: p.y, door: i });
        const again = solveTasks(room, best.tasks);
        if (!again) { invOk = false; break; }
        best = { tasks: best.tasks, sol: again };
      }
      if (!invOk) continue;

      const sol = best.sol;
      const len = Math.max(sol.player.length, ...sol.echoes.map(e => e.length));
      room.L = len + d.slack;
      room.E = best.tasks.length;
      room.par = room.E;
      room.tasks = best.tasks;
      room.solution = sol;
      if (!verify(room)) continue;
      room.seed = seed; room.level = level;
      room.features = {
        timed: room.doors.some(dd => dd.kind === 'timed'),
        sync: best.tasks.some(t => t.length > 1),
        inverse: room.doors.some(dd => dd.kind === 'inverse'),
      };
      return room;
    }
    return null;
  }

  function verify(room, allowAlone) {
    const s = room.solution;
    if (!s || s.player.length > room.L) return false;
    if (s.echoes.length !== room.E || s.echoes.some(e => e.length > room.L)) return false;
    if (!reaches(room, s.echoes.map(e => pad(e, room.L)), s.player)) return false;
    return allowAlone ? true : !aloneSolvable(room, room.L);
  }
  const pad = (a, L) => a.concat(Array(Math.max(0, L - a.length)).fill('W'));

  // hand-made opening rooms (rows listed top -> bottom)
  // # wall  . floor  S start  E exit
  // a/b/c hold door, A/B/C timed door; 1/2/3 plate for door a|A / b|B / c|C; x/y/z inverse plate (makes that door inverse)
  // short demonstration rooms; L is computed from the solution (+1 spare tick)
  const TUTORIAL = [
    { map: ['.E.', '...', '.S.'], alone: true },
    { map: ['.E.', '#a#', '1.S'], tasks: [[0]] },
    { map: ['E..', '#b#', '...', '#a#', '21S'], tasks: [[0, 1]] },
    { map: ['.E.', '#A#', '...', '1.S'], alone: true },
    { map: ['E..', '#b#', 'y..', '#a#', '1.S'], tasks: [[0]] },
  ];
  function fromMap(def, level) {
    const rows = def.map.slice().reverse(); const H = rows.length, W = rows[0].length;
    const room = { W, H, wall: new Uint8Array(W * H), doors: [], plates: [], L: def.L, level, tutorial: true };
    const doorDefs = [], plateDefs = [];
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '#') room.wall[y * W + x] = 1;
      else if (ch === 'S') room.start = { x, y };
      else if (ch === 'E') room.exit = { x, y };
      else if (/[a-cA-C]/.test(ch)) doorDefs.push({ id: ch.toLowerCase(), x, y, kind: ch === ch.toUpperCase() ? 'timed' : 'hold' });
      else if (/[1-3]/.test(ch)) plateDefs.push({ x, y, id: 'abc'[+ch - 1], inv: false });
      else if (/[x-z]/.test(ch)) plateDefs.push({ x, y, id: 'abc'['xyz'.indexOf(ch)], inv: true });
    }));
    doorDefs.sort((a, b) => a.y - b.y);
    doorDefs.forEach(dd => room.doors.push({ x: dd.x, y: dd.y, kind: dd.kind }));
    plateDefs.forEach(p => { const di = doorDefs.findIndex(dd => dd.id === p.id); if (p.inv) room.doors[di].kind = 'inverse'; room.plates.push({ x: p.x, y: p.y, door: di }); });
    const gates = room.doors.map((dd, i) => i).filter(i => room.doors[i].kind !== 'inverse');
    if (def.alone) { room.tasks = []; room.solution = solveTasks(room, [], gates); }
    else { room.tasks = def.tasks; room.solution = solveTasks(room, def.tasks); }
    room.E = room.par = room.tasks.length;
    if (!def.L && room.solution) room.L = Math.max(room.solution.player.length, ...room.solution.echoes.map(e => e.length)) + 1;
    return room;
  }

  function roomFor(n, runSeed) { // n = 1-based room number in a run
    if (n <= TUTORIAL.length) return fromMap(TUTORIAL[n - 1], n);
    return generate(n - TUTORIAL.length, (runSeed * 1000003 + n * 7919) >>> 0);
  }

  root.EchoLogic = { compositions, minimalTasks, DIRS, MOVES, TIMER, rng, step, run, startPos, doorStates, doorAt, generate, verify, roomFor, pad, bfsPath, difficulty, TUTORIAL, fromMap, solveTasks, aloneSolvable };
})(typeof window !== 'undefined' ? window : globalThis);

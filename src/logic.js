// ===== صدى — pure game logic (no rendering) =====
(function (root) {
  const DIRS = { U: [0, 1], D: [0, -1], L: [-1, 0], R: [1, 0], W: [0, 0] };
  const MOVES = ['U', 'D', 'L', 'R'];

  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

  // room: {W,H,wall:Uint8Array, doors:[{x,y}], plates:[{x,y,door}], start:{x,y}, exit:{x,y}, L, par, solution}
  const idx = (room, x, y) => y * room.W + x;
  function doorAt(room, x, y) { for (let i = 0; i < room.doors.length; i++) if (room.doors[i].x === x && room.doors[i].y === y) return i; return -1; }

  function doorStates(room, pos) {
    const open = room.doors.map(() => false);
    for (const p of room.plates) for (const e of pos) if (e.x === p.x && e.y === p.y) open[p.door] = true;
    room.doors.forEach((d, i) => { for (const e of pos) if (e.x === d.x && e.y === d.y) open[i] = true; });
    return open;
  }

  // advance every entity one tick; actions[i] for entity i
  function step(room, pos, actions) {
    const open = doorStates(room, pos);
    return pos.map((e, i) => {
      const d = DIRS[actions[i] || 'W'];
      const nx = e.x + d[0], ny = e.y + d[1];
      if (nx < 0 || ny < 0 || nx >= room.W || ny >= room.H) return { x: e.x, y: e.y, blocked: d[0] || d[1] ? true : false };
      if (room.wall[idx(room, nx, ny)]) return { x: e.x, y: e.y, blocked: !!(d[0] || d[1]) };
      const di = doorAt(room, nx, ny);
      if (di >= 0 && !open[di]) return { x: e.x, y: e.y, blocked: true };
      return { x: nx, y: ny, blocked: false };
    });
  }

  // run a whole loop: echoes (arrays of actions) + player actions; returns states[t] = positions (echoes..., player)
  function run(room, echoes, player) {
    let pos = echoes.map(() => ({ ...room.start })).concat([{ ...room.start }]);
    const states = [pos];
    for (let t = 0; t < player.length; t++) {
      const acts = echoes.map(e => e[t] || 'W').concat([player[t]]);
      pos = step(room, pos, acts);
      states.push(pos);
    }
    return states;
  }

  function bfsPath(room, from, to, doorsPassable) {
    const W = room.W, H = room.H, prev = new Int32Array(W * H).fill(-2);
    const q = [idx(room, from.x, from.y)]; prev[q[0]] = -1;
    while (q.length) {
      const c = q.shift(); const cx = c % W, cy = (c / W) | 0;
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
        if (!doorsPassable && doorAt(room, nx, ny) >= 0) continue;
        prev[n] = c; q.push(n);
      }
    }
    return null;
  }

  // walk a path, waiting at closed doors, given already-recorded echoes
  function route(room, echoes, target) {
    const path = bfsPath(room, room.start, target, true);
    if (!path) return null;
    const acts = [];
    let pi = 0, guard = 0;
    while (pi < path.length - 1 && guard++ < 80) {
      const states = run(room, echoes, acts.concat(['W']));
      const pos = states[states.length - 2];
      const me = pos[pos.length - 1];
      const nxt = path[pi + 1];
      const m = MOVES.find(k => me.x + DIRS[k][0] === nxt.x && me.y + DIRS[k][1] === nxt.y);
      const after = step(room, pos, echoes.map(e => e[acts.length] || 'W').concat([m]));
      const meAfter = after[after.length - 1];
      if (meAfter.x === nxt.x && meAfter.y === nxt.y) { acts.push(m); pi++; }
      else acts.push('W');
    }
    return pi === path.length - 1 ? acts : null;
  }

  function solve(room) {
    const echoes = [];
    for (let i = 0; i < room.doors.length; i++) {
      const p = room.plates.find(pl => pl.door === i);
      const a = route(room, echoes, p);
      if (!a) return null;
      echoes.push(a);
    }
    const player = route(room, echoes, room.exit);
    if (!player) return null;
    return { echoes, player };
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
    // level counts generated rooms from 1
    const k = level <= 3 ? 2 : level <= 10 ? 2 + (level % 2) : level <= 18 ? 3 : 3 + (level % 3 === 0 ? 1 : 0);
    const W = level < 8 ? 5 : 6;
    const deep = Math.min(0.85, 0.15 + level * 0.05); // chance a plate sits beyond earlier doors
    const obst = Math.min(0.22, 0.04 + level * 0.012);
    const slack = Math.max(1, 3 - Math.floor(level / 6));
    return { k, W, deep, obst, slack };
  }

  function generate(level, seed) {
    for (let attempt = 0; attempt < 400; attempt++) {
      const r = rng(seed + attempt * 7919);
      const d = difficulty(level);
      const k = d.k, W = d.W;
      const hs = []; for (let i = 0; i <= k; i++) hs.push(i === 0 || i === k ? 2 : (k >= 3 ? ri(r, 1, 2) : 2));
      const H = hs.reduce((a, b) => a + b, 0) + k;
      const room = { W, H, wall: new Uint8Array(W * H), doors: [], plates: [], regions: [] };
      let y = 0;
      for (let i = 0; i <= k; i++) {
        const rows = []; for (let j = 0; j < hs[i]; j++) rows.push(y + j);
        room.regions.push(rows); y += hs[i];
        if (i < k) {
          for (let x = 0; x < W; x++) room.wall[idx(room, x, y)] = 1;
          const dx = ri(r, 0, W - 1); room.wall[idx(room, dx, y)] = 0; room.doors.push({ x: dx, y });
          y++;
        }
      }
      const cellsOf = i => { const c = []; for (const yy of room.regions[i]) for (let x = 0; x < W; x++) c.push([x, yy]); return c; };
      const near = new Set(); room.doors.forEach(dd => { near.add(dd.x + ',' + (dd.y - 1)); near.add(dd.x + ',' + (dd.y + 1)); });
      // obstacles
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
      // start: bottom region, prefer bottom row; exit: top region, prefer far from the last door
      room.start = take(free(0).filter(([, yy]) => yy === 0).length ? free(0).filter(([, yy]) => yy === 0) : free(0));
      const top = free(k).sort((a, b) => (Math.abs(b[0] - room.doors[k - 1].x) + b[1]) - (Math.abs(a[0] - room.doors[k - 1].x) + a[1]));
      room.exit = top.length ? (used.add(top[0][0] + ',' + top[0][1]), { x: top[0][0], y: top[0][1] }) : null;
      if (!room.start || !room.exit) continue;
      let bad = false;
      for (let i = 0; i < k; i++) {
        let reg = 0;
        if (i > 0 && r() < d.deep) reg = ri(r, 1, i);
        const p = take(free(reg).filter(([x, yy]) => Math.abs(x - room.doors[i].x) + Math.abs(yy - room.doors[i].y) >= 2));
        if (!p) { bad = true; break; }
        room.plates.push({ x: p.x, y: p.y, door: i });
      }
      if (bad) continue;
      const sol = solve(room);
      if (!sol) continue;
      const len = Math.max(sol.player.length, ...sol.echoes.map(e => e.length));
      room.L = len + d.slack;
      room.par = k;
      room.solution = sol;
      if (!verify(room)) continue;
      room.seed = seed; room.level = level;
      return room;
    }
    return null;
  }

  function verify(room) {
    const s = room.solution;
    const echoes = s.echoes.map(e => pad(e, room.L));
    const states = run(room, echoes, s.player);
    const last = states[states.length - 1];
    const me = last[last.length - 1];
    if (!(me.x === room.exit.x && me.y === room.exit.y && s.player.length <= room.L)) return false;
    // alone: the exit must be unreachable without anyone holding plates
    return !bfsPath(room, room.start, room.exit, false);
  }
  const pad = (a, L) => a.concat(Array(Math.max(0, L - a.length)).fill('W'));

  // hand-made opening rooms (rows listed top -> bottom)
  // # wall  . floor  S start  E exit  a/b/c door  1/2/3 plate for door a/b/c
  const TUTORIAL = [
    { L: 9, map: ['#.E.#', '#...#', '.....', '..#..', '.....', '..S..'] },
    { L: 9, map: ['..E..', '.....', '##a##', '.....', '1...S'] },
    { L: 16, map: ['.E...', '.....', '###b#', '.....', '.....', '#a###', '.....', '2..1S'] },
  ];
  function fromMap(def, level) {
    const rows = def.map.slice().reverse(); const H = rows.length, W = rows[0].length;
    const room = { W, H, wall: new Uint8Array(W * H), doors: [], plates: [], L: def.L, level, tutorial: true };
    const doorIds = {}, plateDefs = [];
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '#') room.wall[y * W + x] = 1;
      else if (ch === 'S') room.start = { x, y };
      else if (ch === 'E') room.exit = { x, y };
      else if (/[a-c]/.test(ch)) doorIds[ch] = { x, y };
      else if (/[1-3]/.test(ch)) plateDefs.push({ x, y, ch: 'abc'[+ch - 1] });
    }));
    const keys = Object.keys(doorIds).sort((a, b) => doorIds[a].y - doorIds[b].y);
    keys.forEach(kk => room.doors.push(doorIds[kk]));
    plateDefs.forEach(p => room.plates.push({ x: p.x, y: p.y, door: keys.indexOf(p.ch) }));
    room.par = room.doors.length;
    room.solution = room.doors.length ? solve(room) : { echoes: [], player: route(room, [], room.exit) };
    return room;
  }

  function roomFor(n, runSeed) { // n = 1-based room number in a run
    if (n <= TUTORIAL.length) return fromMap(TUTORIAL[n - 1].map ? TUTORIAL[n - 1] : TUTORIAL[0], n);
    return generate(n - TUTORIAL.length, (runSeed * 1000003 + n * 7919) >>> 0);
  }

  root.EchoLogic = { DIRS, MOVES, rng, step, run, doorStates, doorAt, generate, verify, roomFor, pad, bfsPath, difficulty, TUTORIAL, fromMap, solve };
})(typeof window !== 'undefined' ? window : globalThis);

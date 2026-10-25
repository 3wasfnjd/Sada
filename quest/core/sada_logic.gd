extends RefCounted
## صدى — pure game rules + room generator for the Quest version.
## Line-by-line port of src/logic.js (the web/mobile reference). Same seed => same room,
## proven by quest/tests/run_tests.gd against fixtures dumped from the JS.
##
## Room: Dictionary {W, H, wall: Array[int] (1 = wall), doors: [{x,y,kind}], plates: [{x,y,door}],
##       start: Vector2i, exit: Vector2i, L, E, tasks, solution: {echoes: [[acts]], player: [acts]}}
## Positions ("pos"): Dictionary {p: Array[Vector2i], b: Array[bool] (blocked), t: Array[int] (door timers)}
## Actions are one-letter Strings: U D L R W.

const TIMER := 3
const MOVES := ["U", "D", "L", "R"]
const DIRS := {"U": Vector2i(0, 1), "D": Vector2i(0, -1), "L": Vector2i(-1, 0), "R": Vector2i(1, 0), "W": Vector2i(0, 0)}
const MASK := 0xFFFFFFFF

# ---------- deterministic RNG: Mulberry32, bit-exact with the JS version ----------
class Rng:
	const M32 := 0xFFFFFFFF
	var s: int
	func _init(seed: int) -> void:
		s = seed & M32
	static func _imul(a: int, b: int) -> int:
		a &= M32; b &= M32
		return (((a & 0xFFFF) * b) + ((((a >> 16) * b) & 0xFFFF) << 16)) & M32
	func next() -> float:
		s = (s + 0x6D2B79F5) & M32
		var t := _imul(s ^ (s >> 15), 1 | s)
		t = ((t + _imul(t ^ (t >> 7), 61 | t)) & M32) ^ t
		return float((t ^ (t >> 14)) & M32) / 4294967296.0
	func range_i(a: int, b: int) -> int:
		return a + int(floor(next() * (b - a + 1)))
	func pick(arr: Array):
		return arr[int(floor(next() * arr.size()))]

static func idx(room: Dictionary, x: int, y: int) -> int:
	return y * room.W + x

static func door_at(room: Dictionary, x: int, y: int) -> int:
	for i in room.doors.size():
		if room.doors[i].x == x and room.doors[i].y == y:
			return i
	return -1

static func _occupied(pos_list: Array, x: int, y: int) -> bool:
	for e in pos_list:
		if e.x == x and e.y == y:
			return true
	return false

static func plate_on(room: Dictionary, pos: Dictionary, door: int) -> bool:
	var pinned: Array = room.get("pinned", [])
	for p in room.plates:
		if p.door == door and (_occupied(pos.p, p.x, p.y) or _occupied(pinned, p.x, p.y)):
			return true
	return false

static func door_states(room: Dictionary, pos: Dictionary) -> Array:
	var out := []
	var timers: Array = pos.get("t", [])
	for i in room.doors.size():
		var d: Dictionary = room.doors[i]
		var on := plate_on(room, pos, i)
		var open: bool
		if d.kind == "inverse":
			open = not on
		else:
			open = on or (d.kind == "timed" and i < timers.size() and timers[i] > 0)
		if _occupied(pos.p, d.x, d.y):
			open = true
		out.append(open)
	return out

static func step(room: Dictionary, pos: Dictionary, actions: Array) -> Dictionary:
	var open := door_states(room, pos)
	var np := []; var nb := []
	for i in pos.p.size():
		var e: Vector2i = pos.p[i]
		var a: String = actions[i] if i < actions.size() and actions[i] != "" else "W"
		var d: Vector2i = DIRS[a]
		var moving := d != Vector2i.ZERO
		var n := e + d
		if n.x < 0 or n.y < 0 or n.x >= room.W or n.y >= room.H or room.wall[idx(room, n.x, n.y)] == 1:
			np.append(e); nb.append(moving); continue
		var di := door_at(room, n.x, n.y)
		if di >= 0 and not open[di] and n != e:
			np.append(e); nb.append(true); continue
		np.append(n); nb.append(false)
	var t0: Array = pos.get("t", [])
	var nt := []
	for i in room.doors.size():
		if room.doors[i].kind != "timed":
			nt.append(0)
		elif plate_on(room, pos, i):
			nt.append(TIMER)
		else:
			nt.append(maxi(0, (t0[i] if i < t0.size() else 0) - 1))
	return {"p": np, "b": nb, "t": nt}

static func start_pos(room: Dictionary, n: int) -> Dictionary:
	var p := []; var b := []; var t := []
	for i in n: p.append(room.start); b.append(false)
	for i in room.doors.size(): t.append(0)
	return {"p": p, "b": b, "t": t}

static func _act(list: Array, t: int) -> String:
	return list[t] if t < list.size() else "W"

## states[t] = positions (echoes..., player) after t ticks
static func run(room: Dictionary, echoes: Array, player: Array) -> Array:
	var pos := start_pos(room, echoes.size() + 1)
	var states := [pos]
	for t in player.size():
		var acts := []
		for e in echoes: acts.append(_act(e, t))
		acts.append(player[t])
		pos = step(room, pos, acts)
		states.append(pos)
	return states

static func bfs_path(room: Dictionary, from: Vector2i, to: Vector2i, doors_passable: bool):
	var W: int = room.W; var H: int = room.H
	var prev := PackedInt32Array(); prev.resize(W * H); prev.fill(-2)
	var q := [idx(room, from.x, from.y)]; prev[q[0]] = -1
	var head := 0
	while head < q.size():
		var c: int = q[head]; head += 1
		var cx := c % W; var cy := c / W
		if cx == to.x and cy == to.y:
			var path := []; var k := c
			while k != -1:
				path.append(Vector2i(k % W, k / W)); k = prev[k]
			path.reverse(); return path
		for m in MOVES:
			var nx: int = cx + DIRS[m].x; var ny: int = cy + DIRS[m].y
			if nx < 0 or ny < 0 or nx >= W or ny >= H: continue
			var n := idx(room, nx, ny)
			if prev[n] != -2 or room.wall[n] == 1: continue
			if not doors_passable:
				var di := door_at(room, nx, ny)
				if di >= 0 and room.doors[di].kind != "inverse": continue
			prev[n] = c; q.append(n)
	return null

static func route_multi(room: Dictionary, echoes: Array, targets: Array, waits: Array = []):
	var acts := []; var from: Vector2i = room.start
	for k in targets.size():
		var path = bfs_path(room, from, targets[k], true)
		if path == null: return null
		var pi := 0; var guard := 0
		while pi < path.size() - 1 and guard < 40:
			guard += 1
			var states := run(room, echoes, acts)
			var pos: Dictionary = states[states.size() - 1]
			var me: Vector2i = pos.p[pos.p.size() - 1]
			var nxt: Vector2i = path[pi + 1]
			var m := ""
			for mm in MOVES:
				if me + DIRS[mm] == nxt: m = mm; break
			var a2 := []
			for e in echoes: a2.append(_act(e, acts.size()))
			a2.append(m)
			var after := step(room, pos, a2)
			if after.p[after.p.size() - 1] == nxt:
				acts.append(m); pi += 1
			else:
				acts.append("W")
		if pi != path.size() - 1: return null
		if k < targets.size() - 1:
			for w in (waits[k] if k < waits.size() else 0): acts.append("W")
		from = targets[k]
	return acts

static func plate_of(room: Dictionary, door: int) -> Vector2i:
	for p in room.plates:
		if p.door == door: return Vector2i(p.x, p.y)
	return Vector2i(-1, -1)

static func pad(a: Array, L: int) -> Array:
	var o := a.duplicate()
	while o.size() < L: o.append("W")
	return o

static func _max_len(player: Array, echoes: Array) -> int:
	var L := player.size()
	for e in echoes: L = maxi(L, e.size())
	return L

static func reaches(room: Dictionary, echoes: Array, player: Array) -> bool:
	var L := _max_len(player, echoes)
	var padded := []
	for e in echoes: padded.append(pad(e, L))
	var st := run(room, padded, player)
	var last: Dictionary = st[st.size() - 1]
	return last.p[echoes.size()] == room.exit

static func _cartesian(lists: Array) -> Array:
	var acc := [[]]
	for l in lists:
		var nxt := []
		for a in acc:
			for x in l:
				var c: Array = a.duplicate(); c.append(x); nxt.append(c)
		acc = nxt
	return acc

static func solve_tasks(room: Dictionary, tasks: Array, player_first: Array = []):
	var relay := []
	for i in tasks.size():
		if tasks[i].size() > 1: relay.append(i)
	var combos := _cartesian(relay.map(func(_r): return [0, 1, 2, 3, 4, 5])) if relay.size() else [[]]
	for combo in combos:
		var echoes := []; var ok := true
		for j in tasks.size():
			var waits := []
			if relay.has(j):
				for w in tasks[j].size() - 1: waits.append(combo[relay.find(j)])
			var targets := []
			for di in tasks[j]: targets.append(plate_of(room, di))
			var a = route_multi(room, echoes, targets, waits)
			if a == null: ok = false; break
			echoes.append(a)
		if not ok: continue
		for pw in [0, 1, 2]:
			var targets := []
			for di in player_first: targets.append(plate_of(room, di))
			targets.append(room.exit)
			var pws := []
			for _d in player_first: pws.append(pw)
			var player = route_multi(room, echoes, targets, pws)
			if player != null and reaches(room, echoes, player):
				return {"echoes": echoes, "player": player}
	return null

## exact: can the player alone reach the exit within L ticks? (BFS over position + door timers)
static func alone_solvable(room: Dictionary, L: int) -> bool:
	var start := start_pos(room, 1)
	var key := func(p: Dictionary) -> String: return "%d,%d|%s" % [p.p[0].x, p.p[0].y, str(p.t)]
	var frontier := [start]; var seen := {key.call(start): true}
	for t in L:
		var next_f := []
		for p in frontier:
			for a in ["U", "D", "L", "R", "W"]:
				var n := step(room, p, [a])
				if a != "W" and n.b[0]: continue
				if n.p[0] == room.exit: return true
				var k: String = key.call(n)
				if not seen.has(k): seen[k] = true; next_f.append(n)
		frontier = next_f
	return false

static func _region_connected(room: Dictionary, cells: Array) -> bool:
	var set := {}
	for c in cells:
		if room.wall[idx(room, c.x, c.y)] == 0: set[c] = true
	if set.is_empty(): return false
	var first = set.keys()[0]; var seen := {first: true}; var q := [first]
	while q.size():
		var c: Vector2i = q.pop_back()
		for m in MOVES:
			var k: Vector2i = c + DIRS[m]
			if set.has(k) and not seen.has(k): seen[k] = true; q.append(k)
	return seen.size() == set.size()

# ---------- generator ----------
static func difficulty(level: int) -> Dictionary:
	var k: int
	if level <= 2: k = 2
	elif level <= 8: k = 2 + (level % 2)
	elif level <= 18: k = 3
	else: k = 3 + (1 if level % 3 == 0 else 0)
	return {
		"k": k, "W": 4 if level <= 3 else (5 if level < 10 else 6),
		"deep": minf(0.6, 0.1 + level * 0.04), "obst": minf(0.2, 0.05 + level * 0.01),
		"slack": maxi(1, 2 - int(floor(level / 8.0))), "tall": minf(0.6, 0.2 + level * 0.02),
		"pTimed": 0.0 if level < 2 else minf(0.6, 0.3 + level * 0.03),
		"pInverse": 0.0 if level < 4 else minf(0.4, 0.15 + level * 0.015),
		"allowFull": 0.3 if level <= 1 else 0.12,
	}

static func compositions(n: int, e: int) -> Array:
	var out := []
	_comp_rec(n, 0, e, [], out)
	return out

static func _comp_rec(n: int, start_i: int, left: int, acc: Array, out: Array) -> void:
	if left == 1:
		var c := acc.duplicate(); c.append(n - start_i); out.append(c); return
	for size in range(1, n - start_i - (left - 1) + 1):
		var c := acc.duplicate(); c.append(size)
		_comp_rec(n, start_i + size, left - 1, c, out)

static func minimal_tasks(room: Dictionary):
	var gates := []
	for i in room.doors.size():
		if room.doors[i].kind != "inverse": gates.append(i)
	for e in range(1, gates.size() + 1):
		for comp in compositions(gates.size(), e):
			var tasks := []; var at := 0
			for size in comp:
				tasks.append(gates.slice(at, at + size)); at += size
			var sol = solve_tasks(room, tasks)
			if sol != null: return {"tasks": tasks, "sol": sol}
	return null

static func generate(level: int, seed: int):
	for attempt in 400:
		var r := Rng.new((seed + attempt * 7919) & MASK)
		var d := difficulty(level)
		var k: int = d.k; var W: int = d.W
		var hs := []
		for i in k + 1: hs.append(2 if i == 0 else (2 if r.next() < d.tall else 1))
		var H := k
		for h in hs: H += h
		var wall := []; wall.resize(W * H); wall.fill(0)
		var room := {"W": W, "H": H, "wall": wall, "doors": [], "plates": [], "regions": []}
		var y := 0
		for i in k + 1:
			var rows := []
			for j in hs[i]: rows.append(y + j)
			room.regions.append(rows); y += hs[i]
			if i < k:
				for x in W: room.wall[idx(room, x, y)] = 1
				var px: int = room.doors[room.doors.size() - 1].x if room.doors.size() else r.range_i(0, W - 1)
				var dx := clampi(px + r.range_i(-2, 2), 0, W - 1); room.wall[idx(room, dx, y)] = 0
				var kind := "inverse" if i > 0 and r.next() < d.pInverse else ("timed" if r.next() < d.pTimed else "hold")
				room.doors.append({"x": dx, "y": y, "kind": kind})
				y += 1
		var gate_count := 0
		for dd in room.doors:
			if dd.kind != "inverse": gate_count += 1
		if gate_count < 1: continue
		var cells_of := func(i: int) -> Array:
			var c := []
			for yy in room.regions[i]:
				for x in W: c.append(Vector2i(x, yy))
			return c
		var near := {}
		for dd in room.doors:
			near[Vector2i(dd.x, dd.y - 1)] = true; near[Vector2i(dd.x, dd.y + 1)] = true
		for i in k + 1:
			var cells: Array = cells_of.call(i)
			for c in cells:
				if near.has(c) or r.next() > d.obst: continue
				room.wall[idx(room, c.x, c.y)] = 1
				if not _region_connected(room, cells): room.wall[idx(room, c.x, c.y)] = 0
		var free := func(i: int) -> Array:
			return cells_of.call(i).filter(func(c): return room.wall[idx(room, c.x, c.y)] == 0 and not near.has(c))
		var used := {}
		var take := func(list: Array):
			var c := list.filter(func(v): return not used.has(v))
			if c.is_empty(): return null
			var p: Vector2i = r.pick(c); used[p] = true; return p
		var bottom: Array = free.call(0).filter(func(c): return c.y == 0)
		var st = take.call(bottom if bottom.size() else free.call(0))
		var top_row: Array = free.call(k).filter(func(c): return c.y == H - 1)
		var ex = take.call(top_row if top_row.size() else free.call(k))
		if st == null or ex == null: continue
		room.start = st; room.exit = ex

		var bad := false
		for i in k:
			if room.doors[i].kind == "inverse": continue
			var reg := 0
			if i > 0 and r.next() < d.deep: reg = r.range_i(1, i)
			var min_dist := TIMER + 2 if room.doors[i].kind == "timed" else 2
			var di: Dictionary = room.doors[i]
			var p = take.call(free.call(reg).filter(func(c): return absi(c.x - di.x) + absi(c.y - di.y) >= min_dist))
			if p == null: bad = true; break
			room.plates.append({"x": p.x, "y": p.y, "door": i})
		if bad: continue

		var best = minimal_tasks(room)
		if best == null: continue
		if best.tasks.size() >= gate_count and r.next() > d.allowFull: continue

		var inv_ok := true
		for i in k:
			if room.doors[i].kind != "inverse": continue
			var sol: Dictionary = best.sol
			var L0 := _max_len(sol.player, sol.echoes)
			var padded := []
			for e in sol.echoes: padded.append(pad(e, L0))
			var sts := run(room, padded, pad(sol.player, L0))
			var crossed := []
			var last: Dictionary = sts[sts.size() - 1]
			for t in range(1, sts.size()):
				for j in sol.echoes.size():
					var c: Vector2i = sts[t].p[j]
					if used.has(c) or near.has(c) or door_at(room, c.x, c.y) >= 0: continue
					var on_plate := false
					for pl in room.plates:
						if pl.x == c.x and pl.y == c.y: on_plate = true
					if on_plate: continue
					var at_end := false
					for jj in sol.echoes.size():
						if last.p[jj] == c: at_end = true
					if not at_end: crossed.append(c)
			var p = take.call(crossed) if crossed.size() else null
			if p == null: inv_ok = false; break
			room.plates.append({"x": p.x, "y": p.y, "door": i})
			var again = solve_tasks(room, best.tasks)
			if again == null: inv_ok = false; break
			best = {"tasks": best.tasks, "sol": again}
		if not inv_ok: continue

		var sol2: Dictionary = best.sol
		room.L = _max_len(sol2.player, sol2.echoes) + d.slack
		room.E = best.tasks.size(); room.par = room.E
		room.tasks = best.tasks; room.solution = sol2
		if not verify(room): continue
		room.seed = seed; room.level = level
		return room
	return null

static func verify(room: Dictionary, allow_alone := false) -> bool:
	var s = room.get("solution")
	if s == null or s.player.size() > room.L: return false
	if s.echoes.size() != room.E: return false
	var padded := []
	for e in s.echoes:
		if e.size() > room.L: return false
		padded.append(pad(e, room.L))
	if not reaches(room, padded, s.player): return false
	return true if allow_alone else not alone_solvable(room, room.L)

# hand-made opening rooms (rows top -> bottom). # wall . floor S start E exit
# a/b/c hold door, A/B/C timed door; 1/2/3 plate for door a/b/c; x/y/z inverse plate
const TUTORIAL := [
	{"map": [".E.", "...", ".S."], "alone": true},
	{"map": [".E.", "#a#", "1.S"], "tasks": [[0]]},
	{"map": ["E..", "#b#", "...", "#a#", "21S"], "tasks": [[0, 1]]},
	{"map": [".E.", "#A#", "...", "1.S"], "alone": true},
	{"map": ["E..", "#b#", "y..", "#a#", "1.S"], "tasks": [[0]]},
]

static func from_map(def: Dictionary, level: int) -> Dictionary:
	var rows: Array = def.map.duplicate(); rows.reverse()
	var H := rows.size(); var W: int = rows[0].length()
	var wall := []; wall.resize(W * H); wall.fill(0)
	var room := {"W": W, "H": H, "wall": wall, "doors": [], "plates": [], "level": level, "tutorial": true}
	var door_defs := []; var plate_defs := []
	for y in H:
		for x in W:
			var ch: String = rows[y][x]
			if ch == "#": room.wall[y * W + x] = 1
			elif ch == "S": room.start = Vector2i(x, y)
			elif ch == "E": room.exit = Vector2i(x, y)
			elif "abcABC".contains(ch): door_defs.append({"id": ch.to_lower(), "x": x, "y": y, "kind": "timed" if ch == ch.to_upper() else "hold"})
			elif "123".contains(ch): plate_defs.append({"x": x, "y": y, "id": "abc"[int(ch) - 1], "inv": false})
			elif "xyz".contains(ch): plate_defs.append({"x": x, "y": y, "id": "abc"["xyz".find(ch)], "inv": true})
	door_defs.sort_custom(func(a, b): return a.y < b.y)
	for dd in door_defs: room.doors.append({"x": dd.x, "y": dd.y, "kind": dd.kind})
	for p in plate_defs:
		var di := -1
		for i in door_defs.size():
			if door_defs[i].id == p.id: di = i; break
		if p.inv: room.doors[di].kind = "inverse"
		room.plates.append({"x": p.x, "y": p.y, "door": di})
	var gates := []
	for i in room.doors.size():
		if room.doors[i].kind != "inverse": gates.append(i)
	if def.get("alone", false):
		room.tasks = []; room.solution = solve_tasks(room, [], gates)
	else:
		room.tasks = def.tasks; room.solution = solve_tasks(room, def.tasks)
	room.E = room.tasks.size(); room.par = room.E
	if room.solution != null: room.L = _max_len(room.solution.player, room.solution.echoes) + 1
	return room

## n = 1-based room number in a run
static func room_for(n: int, run_seed: int):
	if n <= TUTORIAL.size(): return from_map(TUTORIAL[n - 1], n)
	return generate(n - TUTORIAL.size(), (run_seed * 1000003 + n * 7919) & MASK)

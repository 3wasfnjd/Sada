extends SceneTree
## Headless tests for the Quest logic:  godot --headless --path quest -s res://tests/run_tests.gd
## 1) parity: same rooms, bit for bit, as the JS reference (fixtures.json from tools/dump_fixtures.mjs)
## 2) every generated room is solvable with its echo budget and not solvable alone
## 3) generation time per room (the game generates the next room in the background)

const Logic = preload("res://core/sada_logic.gd")
var failed := 0

func fail(msg: String) -> void:
	failed += 1; printerr("FAIL ", msg)

func _init() -> void:
	var fx = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures.json"))
	# rng
	var r = Logic.Rng.new(12345)
	for i in fx.rng.size():
		var v: float = r.next()
		if absf(v - fx.rng[i]) > 1e-12: fail("rng[%d] %f != %f" % [i, v, fx.rng[i]])
	# rooms
	var t_total := 0
	for f in fx.rooms:
		var t0 := Time.get_ticks_msec()
		var room = Logic.room_for(int(f.n), int(f.seed))
		t_total += Time.get_ticks_msec() - t0
		var tag := "seed %d room %d" % [f.seed, f.n]
		if room == null: fail(tag + ": no room"); continue
		var wall := ""
		for w in room.wall: wall += str(w)
		var doors := []
		for d in room.doors: doors.append([d.x, d.y, d.kind])
		var plates := []
		for p in room.plates: plates.append([p.x, p.y, p.door])
		var echoes := []
		for e in room.solution.echoes: echoes.append("".join(e))
		var got := {"W": room.W, "H": room.H, "wall": wall, "L": room.L, "E": room.E,
			"start": [room.start.x, room.start.y], "exit": [room.exit.x, room.exit.y],
			"doors": doors, "plates": plates, "echoes": echoes, "player": "".join(room.solution.player)}
		for k in got:
			# round-trip through JSON so ints and the parser's floats compare equal
			if JSON.stringify(JSON.parse_string(JSON.stringify(got[k]))) != JSON.stringify(f[k]): fail("%s %s: %s != %s" % [tag, k, JSON.stringify(got[k]), JSON.stringify(f[k])])
		var alone: bool = room.get("tutorial", false) and (int(f.E) == 0)
		if not Logic.verify(room, alone): fail(tag + ": verify")
	print("parity rooms: %d, %d ms" % [fx.rooms.size(), t_total])
	# solvability sweep + timing
	var worst := 0; var n_ok := 0
	for run in 4:
		for n in range(6, 26):
			var t0 := Time.get_ticks_msec()
			var room = Logic.room_for(n, 900 + run)
			var dt := Time.get_ticks_msec() - t0
			worst = maxi(worst, dt)
			if room == null: fail("sweep run %d room %d: none" % [run, n]); continue
			if not Logic.verify(room): fail("sweep run %d room %d: verify" % [run, n]); continue
			n_ok += 1
	print("sweep: %d rooms ok, slowest %d ms" % [n_ok, worst])
	if failed: printerr("%d failure(s)" % failed); quit(1)
	else: print("all checks passed"); quit(0)

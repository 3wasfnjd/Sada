extends SceneTree
## Plays the real game scene (no headset) with each room's own solution, through the same
## calls the controllers use: loops must turn into echoes, the exit must win, the next room load.
##   godot --headless --xr-mode off --path quest -s res://tests/play_test.gd
## With a display (xvfb) and  -- --shot=<dir>  it also saves screenshots of a few rooms.

var failed := 0
var game: Node

func fail(m: String) -> void:
	failed += 1; printerr("FAIL ", m)

func _init() -> void:
	_run.call_deferred()

func _run() -> void:
	var shot := ""
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--shot="): shot = a.substr(7)
	DirAccess.remove_absolute(ProjectSettings.globalize_path("user://sada.cfg"))
	game = load("res://scenes/main.tscn").instantiate()
	root.add_child(game)
	await process_frame
	game.run_seed = 77
	Engine.time_scale = 8.0 if shot == "" else 1.0
	var rooms := 8 if shot == "" else 2
	for k in range(1, rooms + 1):
		game.load_room(k)
		await process_frame
		var R: Dictionary = game.R
		if shot != "" and k in [2, 3, 6]:
			await _shoot(shot + "/room%d.png" % k)
		var sol: Dictionary = R.solution
		var t0 := Time.get_ticks_msec()
		for e in sol.echoes:
			for a in Logic().pad(e, R.L):
				await _act(a)
			await _until(func(): return game.acts.is_empty() and not game.rewinding and not game.busy)
		if game.echoes.size() != sol.echoes.size():
			fail("room %d: %d echoes recorded, expected %d" % [k, game.echoes.size(), sol.echoes.size()])
		for a in sol.player:
			await _act(a)
			if game.won: break
		await _until(func(): return game.n == k + 1)
		if game.n != k + 1: fail("room %d: solution did not win (n=%d)" % [k, game.n])
		else: print("room %d ok  (L=%d, echoes=%d, %d ms)" % [k, R.L, R.E, Time.get_ticks_msec() - t0])
	# undo and loop-back behave
	game.load_room(3)
	await process_frame
	await _act("L")
	var before: int = game.acts.size()
	game.undo()
	if game.acts.size() != before - 1: fail("undo did not remove a step")
	if shot != "":
		game.load_room(6); await process_frame
		game.hint(); await _wait(0.4)
		await _shoot(shot + "/hint.png")
	print("play test: %d failure(s)" % failed)
	quit(1 if failed else 0)

func Logic():
	return load("res://core/sada_logic.gd")

func _act(a: String) -> void:
	await _until(func(): return not game.busy and not game.rewinding)
	game.do_action(a)
	await _until(func(): return not game.busy)

func _until(f: Callable, limit := 20.0) -> void:
	var t := 0.0
	while not f.call() and t < limit:
		await process_frame
		t += 1.0 / 60.0

func _wait(s: float) -> void:
	var t := Time.get_ticks_msec()
	while Time.get_ticks_msec() - t < s * 1000: await process_frame

func _shoot(path: String) -> void:
	await _wait(0.6)
	var img := root.get_texture().get_image()
	if img: img.save_png(path); print("shot ", path)

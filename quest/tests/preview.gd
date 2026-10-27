extends SceneTree
## Preview renders of the code-built art (needs a display, e.g. xvfb):
##   godot --xr-mode off --path quest -s res://tests/preview.gd -- --out=<dir>
## hero.png: the hero with each expression, an echo, and his back.  game_rN.png: real rooms
## through the real game scene from the player's height.

var out := "user://preview"
var hero_script := "res://game/lowpoly/hero.gd"
var only_hero := false

func _init() -> void:
	_run.call_deferred()


func _light(parent: Node, ambient := 0.4) -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.11, 0.12, 0.15)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.66, 0.68, 0.76)
	env.ambient_light_energy = ambient
	var we := WorldEnvironment.new(); we.environment = env; parent.add_child(we)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50, -35, 0)
	sun.light_energy = 0.9
	sun.light_color = Color(1.0, 0.96, 0.9)
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	sun.directional_shadow_max_distance = 12.0
	parent.add_child(sun)


func _run() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="): out = a.substr(6)
		if a.begins_with("--hero="): hero_script = "res://game/lowpoly/%s.gd" % a.substr(7)
		if a == "--only-hero": only_hero = true
	DirAccess.make_dir_recursive_absolute(out)
	await _hero_sheet()
	if not only_hero: await _game_shots()
	quit(0)


func _hero_sheet() -> void:
	var stage := Node3D.new(); root.add_child(stage)
	_light(stage)
	var Hero = load(hero_script)
	var gm := StandardMaterial3D.new()
	gm.albedo_color = Color(0.56, 0.85, 1.0, 0.5); gm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	gm.emission_enabled = true; gm.emission = Color(0.56, 0.85, 1.0); gm.emission_energy_multiplier = 0.6
	var exprs := ["calm", "smile", "surprise", "worry", "joy", "", "back"]
	var heroes := []
	for i in exprs.size():
		var h: Node3D = Hero.new()
		h.build(exprs[i] == "", gm)
		h.position = Vector3((i - 3) * 0.6, 0, 0)
		stage.add_child(h)
		if exprs[i] == "back": h.rotation.y = PI
		heroes.append(h)
	var floor_mi := MeshInstance3D.new(); var pm := PlaneMesh.new(); pm.size = Vector2(6, 2); floor_mi.mesh = pm
	var fm := StandardMaterial3D.new(); fm.albedo_color = Color(0.3, 0.32, 0.36); floor_mi.material_override = fm
	stage.add_child(floor_mi)
	var cam := Camera3D.new(); stage.add_child(cam)
	cam.fov = 30
	cam.position = Vector3(0, 0.9, 4.2); cam.look_at(Vector3(0, 0.45, 0))
	await process_frame
	for i in exprs.size():
		if exprs[i] != "" and exprs[i] != "back": heroes[i].expr(exprs[i], 0.0)
	await _wait(0.2)
	await _shot(out + "/hero.png")
	# close-up of the face
	cam.fov = 18
	cam.position = Vector3(-0.6, 0.72, 1.6); cam.look_at(Vector3(-0.6, 0.62, 0))
	heroes[2].expr("calm", 0.0)
	await _wait(0.3)
	await _shot(out + "/hero_face.png")
	cam.position = Vector3(-0.6 + 1.2, 0.72, 1.6); cam.look_at(Vector3(0.6, 0.62, 0))
	await _shot(out + "/hero_face_joy.png")
	# side view (three-quarter)
	cam.fov = 30; cam.position = Vector3(0, 0.9, 4.2); cam.look_at(Vector3(0, 0.45, 0))
	for h in heroes: h.rotation.y = PI / 2 * 0.8
	await _wait(0.2)
	await _shot(out + "/hero_side.png")
	for h in heroes: h.rotation.y = 0.0
	heroes[heroes.size() - 1].rotation.y = PI
	# walk pose
	for h in heroes: h.play("walk")
	await _wait(0.12)
	cam.fov = 30; cam.position = Vector3(0, 0.9, 4.2); cam.look_at(Vector3(0, 0.45, 0))
	await _shot(out + "/hero_walk.png")
	stage.queue_free()
	await process_frame


func _game_shots() -> void:
	var game: Node = load("res://scenes/main.tscn").instantiate()
	root.add_child(game)
	await process_frame
	game.run_seed = 77
	for k in [3, 6, 9]:
		game.load_room(k)
		await _wait(0.6)
		await _shot(out + "/game_r%d.png" % k)
		# closer, from the side
		var cam: Camera3D = game.cam
		var save := cam.global_transform
		var b: Node3D = game.board
		var c: Vector3 = b.global_position
		cam.global_position = c + Vector3(0.38, 0.22, 0.42)
		cam.look_at(c + Vector3(0, 0.02, 0))
		await _wait(0.1)
		await _shot(out + "/game_r%d_side.png" % k)
		cam.global_transform = save
	game.queue_free()


func _wait(s: float) -> void:
	var t := Time.get_ticks_msec()
	while Time.get_ticks_msec() - t < s * 1000.0:
		await process_frame


func _shot(path: String) -> void:
	await process_frame
	await process_frame
	await RenderingServer.frame_post_draw
	root.get_viewport().get_texture().get_image().save_png(path)
	print("shot ", path)

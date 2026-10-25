extends Node3D
## صدى on Meta Quest: the room stands on your table (passthrough MR).
## Rules are the same as the web version (core/sada_logic.gd, parity-tested):
## each loop has L ticks; when a loop ends without the exit it becomes an echo that replays
## your moves; plates open doors; reach the exit within the room's echo budget.
##
## Controls (controllers):
##   right stick flick   step (direction as you see it, wherever you stand)
##   right trigger        point at a cell: walk there (on yourself: wait one tick)
##   A                    wait one tick          B   undo one step
##   X                    hint (limited)         Y   one loop back
##   left stick           x: turn the table, y: bigger / smaller
##   grip tap             bring the table in front of you
##   grip hold (one)      carry the table; both grips: pinch to resize and turn
## Desktop (no headset): arrows, space = wait, Z = undo, H = hint, Backspace = loop back.

const Logic = preload("res://core/sada_logic.gd")
const Board = preload("res://game/board.gd")
const TICK := 0.3
const TABLE_SIZE := 0.62   # metres: the larger side of the room on the table
const START_HELP := 3
const SAVE := "user://sada.cfg"

var xr: XRInterface
var xr_on := false
var origin: XROrigin3D
var cam: Camera3D
var hands := {}            # "left"/"right" -> XRController3D (aim pose)
var ray: MeshInstance3D
var env: Environment
var table: Node3D          # positioned in the room, metres
var board: Board           # scaled into the table
var sfx := {}
var player: AudioStreamPlayer

var run_seed := 0
var n := 1
var R: Dictionary
var echoes := []
var acts := []
var states := []
var walk := []
var busy := false
var won := false
var rewinding := false
var help := START_HELP
var fails := 0
var placed := false
var _prev := {}
var _stick_t := 0.0
var _place_frames := 0
const ZOOM_MIN := 0.35
const ZOOM_MAX := 3.0
var zoom := 1.0
var _grip := {"left": {"held": false, "t": 0.0, "moved": false}, "right": {"held": false, "t": 0.0, "moved": false}}
var _drag := {}            # one hand: {hand, offset}; two hands: {d0, a0, z0, yaw0, mid0, pos0}


func _ready() -> void:
	env = Environment.new()
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.62, 0.64, 0.72)
	env.ambient_light_energy = 0.36
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.07, 0.08, 0.1)
	var we := WorldEnvironment.new(); we.environment = env; add_child(we)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-55, -35, 0)
	sun.light_energy = 0.62
	sun.light_color = Color(1.0, 0.97, 0.92)
	sun.shadow_enabled = true
	# the whole room is under a metre: an orthogonal shadow map over a short distance keeps
	# shadows crisp at table scale (the default split cascades spread texels over metres)
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	sun.directional_shadow_max_distance = 2.0
	sun.shadow_blur = 1.2
	RenderingServer.directional_shadow_atlas_set_size(4096, true)
	RenderingServer.directional_soft_shadow_filter_set_quality(RenderingServer.SHADOW_QUALITY_SOFT_LOW)
	add_child(sun)

	origin = XROrigin3D.new(); add_child(origin)
	xr = XRServer.find_interface("OpenXR")
	if xr and (xr.is_initialized() or xr.initialize()):
		xr_on = true
		get_viewport().use_xr = true
		# sharpness: render above the headset's recommended size (with 4x MSAA), light
		# fixed foveation — the same settings Mafateeh ships with on Quest 3
		xr.set("render_target_size_multiplier", 1.4)
		xr.set("foveation_level", 1)
		xr.set("foveation_dynamic", true)
		DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
		cam = XRCamera3D.new()
		cam.near = 0.02
		origin.add_child(cam)
		for h in ["left", "right"]:
			var c := XRController3D.new()
			c.tracker = h + "_hand"; c.pose = "aim"
			origin.add_child(c)
			hands[h] = c
			if ClassDB.class_exists("OpenXRFbRenderModel"):
				var grip := XRController3D.new()
				grip.tracker = h + "_hand"; grip.pose = "grip"
				origin.add_child(grip)
				var model: Node3D = ClassDB.instantiate("OpenXRFbRenderModel")
				if h == "right": model.set("render_model_type", 1)
				grip.add_child(model)
		_passthrough()
		# the list of blend modes is only reliable once the session runs (same as Mafateeh)
		xr.connect("session_begun", _passthrough)
		xr.connect("pose_recentered", func(): placed = false)
		_make_ray()
	else:
		cam = Camera3D.new()
		origin.add_child(cam)
		cam.fov = 50
		cam.position = Vector3(0, 1.55, 0.3)
		cam.look_at(Vector3(0, 0.95, -0.27))

	table = Node3D.new(); add_child(table)
	board = Board.new(); table.add_child(board)
	table.position = Vector3(0, 0.95, -0.25)
	_make_sounds()
	_load()
	load_room(n)


## AR: the real room is seen through the headset cameras; only the table is drawn
func _passthrough() -> void:
	if xr.get_supported_environment_blend_modes().has(XRInterface.XR_ENV_BLEND_MODE_ALPHA_BLEND):
		get_viewport().transparent_bg = true
		env.background_mode = Environment.BG_COLOR
		env.background_color = Color(0, 0, 0, 0)
		xr.environment_blend_mode = XRInterface.XR_ENV_BLEND_MODE_ALPHA_BLEND


func _make_ray() -> void:
	ray = MeshInstance3D.new()
	var c := CylinderMesh.new(); c.top_radius = 0.0015; c.bottom_radius = 0.0015; c.height = 1.0
	ray.mesh = c
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = Color(1.0, 0.9, 0.62, 0.8)
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ray.material_override = m
	ray.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	ray.top_level = true
	add_child(ray)


# ---------------- table placement ----------------

func place_table() -> void:
	var t := cam.global_transform
	var fwd := -t.basis.z; fwd.y = 0
	if fwd.length() < 0.1: fwd = Vector3(0, 0, -1)
	fwd = fwd.normalized()
	table.global_position = t.origin + fwd * (0.42 + 0.12 * zoom) + Vector3(0, -0.42, 0)
	table.global_basis = Basis(Vector3.UP, atan2(-fwd.x, -fwd.z)).scaled(Vector3.ONE * zoom)
	placed = true


## size and turn of the table: kept in `table` (the room inside keeps its own fit)
func set_zoom(z: float) -> void:
	zoom = clampf(z, ZOOM_MIN, ZOOM_MAX)
	table.basis = Basis(Vector3.UP, table.rotation.y).scaled(Vector3.ONE * zoom)


func turn_table(r: float) -> void:
	table.basis = Basis(Vector3.UP, wrapf(table.rotation.y + r, -PI, PI)).scaled(Vector3.ONE * zoom)


func _fit() -> void:
	var s := TABLE_SIZE / board.span()
	board.scale = Vector3.ONE * s


# ---------------- room flow ----------------

func load_room(k: int) -> void:
	n = k
	R = Logic.room_for(n, run_seed)
	if R == null:   # never seen in tests; move on rather than stall
		run_seed += 1; R = Logic.room_for(n, run_seed)
	echoes = []; acts = []; walk = []; won = false; busy = false; fails = 0
	board.build(R)
	_fit()
	_reset_states()
	_save()


func _reset_states() -> void:
	states = [Logic.start_pos(R, echoes.size() + 1)]
	board.spawn(echoes.size() + 1, states[0])
	_refresh(true)


func cur() -> Dictionary:
	return states[states.size() - 1]


func _refresh(_silent: bool) -> void:
	board.update_doors(Logic.door_states(R, cur()), cur())
	board.show_timeline(acts.size(), echoes.size())


func do_action(a: String) -> bool:
	if busy or won or rewinding: return false
	if acts.size() >= R.L: return false
	var t := acts.size()
	var pos := cur()
	var list := []
	for e in echoes: list.append(e[t] if t < e.size() else "W")
	list.append(a)
	var nxt := Logic.step(R, pos, list)
	var me := echoes.size()
	if a != "W" and nxt.b[me]:
		var tgt: Vector2i = pos.p[me] + Logic.DIRS[a]
		board.flash_door(Logic.door_at(R, tgt.x, tgt.y))
		board.bump(me, a); _sound("bump"); _buzz(0.12); walk.clear()
		return false
	var before := Logic.door_states(R, pos)
	acts.append(a); states.append(nxt)
	board.animate(pos, nxt, list, TICK)
	var after := Logic.door_states(R, nxt)
	if before != after: _sound("door")
	_sound("step" if a != "W" else "wait")
	_refresh(false)
	busy = true
	await get_tree().create_timer(TICK).timeout
	busy = false
	_after_tick()
	return true


func _after_tick() -> void:
	var me: Vector2i = cur().p[echoes.size()]
	if me == R.exit:
		_win(); return
	if acts.size() >= R.L:
		walk.clear()
		await get_tree().create_timer(0.35).timeout
		if echoes.size() < R.E: end_loop_as_echo()
		else:
			fails += 1; retry_loop()
		return
	_pump()


func _pump() -> void:
	if walk.size() and not busy:
		var a: String = walk.pop_front()
		if not await do_action(a): walk.clear()


## a finished loop becomes an echo and the next loop starts
func end_loop_as_echo() -> void:
	if won or rewinding: return
	echoes.append(Logic.pad(acts, R.L))
	await _rewind()
	acts = []; _reset_states(); _sound("echo")


## the last loop failed: replay only this loop, keeping every echo
func retry_loop() -> void:
	if won or rewinding: return
	await _rewind()
	acts = []; _reset_states()


## one loop back: drop the newest echo and record it again
func back_loop() -> void:
	if busy or won or rewinding: return
	if acts.is_empty() and echoes.is_empty(): return
	walk.clear()
	await _rewind()
	if acts.is_empty() and echoes.size(): echoes.pop_back()
	acts = []; _reset_states()


func undo() -> void:
	if busy or won or rewinding or acts.is_empty(): return
	walk.clear(); acts.pop_back(); states.pop_back()
	board.snap(cur()); _refresh(true); _sound("wait")


func hint() -> void:
	if busy or won or rewinding: return
	if help <= 0: _sound("bump"); return
	var sol = R.get("solution")
	if sol == null: return
	var seq: Array = sol.echoes[echoes.size()] if echoes.size() < sol.echoes.size() else sol.player
	help -= 1
	var p: Vector2i = R.start
	var cells := []
	var t := 0
	for a in seq:
		t += 1
		var d: Vector2i = Logic.DIRS[a]
		if d != Vector2i.ZERO:
			p += d; cells.append({"x": p.x, "y": p.y, "t": t})
	board.show_hint(cells)
	_sound("hint")


func _rewind() -> void:
	rewinding = true
	_sound("rewind")
	var steps := acts.size()
	if steps:
		var total := minf(0.9, 0.14 + steps * 0.045)
		var k := 0.0
		while k < 1.0:
			await get_tree().process_frame
			k = minf(1.0, k + get_process_delta_time() / total)
			var i := int(floor((1.0 - k) * steps))
			board.snap(states[clampi(i, 0, steps)])
	rewinding = false


func _win() -> void:
	won = true
	board.cheer(echoes.size()); _sound("win"); _buzz(0.3)
	if help < 5 and n > Logic.TUTORIAL.size(): help += 1
	await get_tree().create_timer(1.8).timeout
	load_room(n + 1)


## walk to a cell along the shortest path (doors counted as open; a closed one stops you)
func walk_to(c: Vector2i) -> void:
	var me: Vector2i = cur().p[echoes.size()]
	if c == me:
		walk = ["W"]; _pump(); return
	if c.x < 0 or c.y < 0 or c.x >= R.W or c.y >= R.H: return
	var path = Logic.bfs_path(R, me, c, true)
	if path == null: _sound("bump"); return
	walk = []
	for i in range(1, path.size()):
		var d: Vector2i = path[i] - path[i - 1]
		for m in Logic.MOVES:
			if Logic.DIRS[m] == d: walk.append(m)
	_pump()


# ---------------- input ----------------

func _process(dt: float) -> void:
	board.viewer = cam.global_position
	if xr_on:
		if not placed:
			_place_frames += 1
			if _place_frames > 20 and cam.global_position.length() > 0.01:
				place_table()
		_xr_input(dt)


func _pressed(h: String, b: String) -> bool:
	var c: XRController3D = hands.get(h)
	if c == null: return false
	var now := c.is_button_pressed(b)
	var key := h + b
	var was: bool = _prev.get(key, false)
	_prev[key] = now
	return now and not was


func _xr_input(dt: float) -> void:
	_grips(dt)
	# left stick: x turns the table, y makes it bigger / smaller
	var lc: XRController3D = hands.get("left")
	if lc:
		var s := lc.get_vector2("primary")
		if absf(s.x) > 0.25: turn_table(-signf(s.x) * (absf(s.x) - 0.25) / 0.75 * 1.8 * dt)
		if absf(s.y) > 0.25 and absf(s.y) > absf(s.x) * 0.5:
			set_zoom(zoom * exp(signf(s.y) * (absf(s.y) - 0.25) / 0.75 * 1.1 * dt))
			_zoom_dirty = true
		elif _zoom_dirty:
			_zoom_dirty = false; _save()
	if _pressed("right", "ax_button"): do_action("W")
	if _pressed("right", "by_button"): undo()
	if _pressed("left", "ax_button"): hint()
	if _pressed("left", "by_button"): back_loop()
	# stick: direction relative to how you look at the table
	var rc: XRController3D = hands.get("right")
	if rc:
		var v := rc.get_vector2("primary")
		_stick_t -= dt
		if v.length() > 0.75 and _stick_t <= 0.0:
			_stick_t = 0.32 if _prev.get("stick", false) else 0.5
			_prev["stick"] = true
			_move_view(v)
		elif v.length() < 0.35:
			_prev["stick"] = false; _stick_t = 0.0
		_update_ray(rc)
		board.hover(_ray_cell(rc))
		if _pressed("right", "trigger_click"):
			var hit = _ray_cell(rc)
			if hit != null: walk_to(hit)


var _zoom_dirty := false

## grip: tap = bring the table in front of you; hold one = carry it;
## hold both = pinch: spread/close the hands to resize, turn them to rotate
func _grips(dt: float) -> void:
	var held := []
	for h in ["left", "right"]:
		var c: XRController3D = hands.get(h)
		var g: Dictionary = _grip[h]
		var now: bool = c != null and c.get_float("grip") > 0.6
		if now and not g.held:
			g.held = true; g.t = 0.0; g.moved = false
		elif now:
			g.t += dt
		elif g.held:
			g.held = false
			if g.t < 0.3 and not g.moved and _drag.is_empty(): place_table()
		if g.held: held.append(h)
	if held.size() == 2:
		var a: Vector3 = hands.left.global_position; var b: Vector3 = hands.right.global_position
		var v := b - a; v.y = 0
		var mid := (a + b) / 2.0
		if not _drag.has("d0"):
			_drag = {"d0": maxf(0.05, v.length()), "a0": atan2(v.x, v.z), "z0": zoom, "yaw0": table.rotation.y, "mid0": mid, "pos0": table.global_position}
			_grip.left.moved = true; _grip.right.moved = true
		set_zoom(_drag.z0 * maxf(0.05, v.length()) / _drag.d0)
		var turn := wrapf(atan2(v.x, v.z) - _drag.a0, -PI, PI)
		table.basis = Basis(Vector3.UP, _drag.yaw0 + turn).scaled(Vector3.ONE * zoom)
		table.global_position = _drag.pos0 + (mid - _drag.mid0)
		_zoom_dirty = true
	elif held.size() == 1 and _grip[held[0]].t >= 0.3:
		var c: XRController3D = hands[held[0]]
		if _drag.get("hand", "") != held[0]:
			_drag = {"hand": held[0], "offset": table.global_position - c.global_position}
			_grip[held[0]].moved = true
		table.global_position = c.global_position + _drag.offset
	elif held.is_empty() and not _drag.is_empty():
		_drag = {}
		if _zoom_dirty: _zoom_dirty = false; _save()
	elif held.size() == 1 and _drag.has("d0"):
		_drag = {}


func _move_view(v: Vector2) -> void:
	var b := cam.global_basis
	var right := b.x; right.y = 0
	var fwd := -b.z; fwd.y = 0
	var world := (right.normalized() * v.x + fwd.normalized() * v.y)
	var local := board.global_basis.inverse() * world   # board space: +x right, -z = "U"
	var a: String
	if absf(local.x) > absf(local.z): a = "R" if local.x > 0 else "L"
	else: a = "U" if local.z < 0 else "D"
	walk.clear()
	do_action(a)


func _ray_cell(c: XRController3D):
	var o := c.global_position
	var d := -c.global_basis.z
	var inv := board.global_transform.affine_inverse()
	var lo := inv * o
	var ld := (inv.basis * d)
	if absf(ld.y) < 1e-4: return null
	var k := -lo.y / ld.y
	if k < 0: return null
	return board.to_cell(lo + ld * k)


func _update_ray(c: XRController3D) -> void:
	if ray == null: return
	var o := c.global_position
	var d := -c.global_basis.z
	var len := 0.35
	var inv := board.global_transform.affine_inverse()
	var ld := inv.basis * d
	var lo := inv * o
	if ld.y < -1e-4:
		var hit := board.global_transform * (lo + ld * (-lo.y / ld.y))
		len = clampf(o.distance_to(hit), 0.05, 1.5)
	var side := d.cross(Vector3.UP)
	if side.length() < 1e-3: side = Vector3.RIGHT
	side = side.normalized()
	ray.global_transform = Transform3D(Basis(side, d * len, side.cross(d)), o + d * len / 2.0)


func _unhandled_input(e: InputEvent) -> void:
	if not (e is InputEventKey and e.pressed and not e.echo): return
	match e.keycode:
		KEY_UP: walk.clear(); do_action("U")
		KEY_DOWN: walk.clear(); do_action("D")
		KEY_LEFT: walk.clear(); do_action("L")
		KEY_RIGHT: walk.clear(); do_action("R")
		KEY_SPACE: do_action("W")
		KEY_Z: undo()
		KEY_H: hint()
		KEY_BACKSPACE: back_loop()


func _buzz(dur: float) -> void:
	for h in hands.values():
		(h as XRController3D).trigger_haptic_pulse("haptic", 0.0, 0.5, dur, 0.0)


# ---------------- sound: small synthesized tones, calm ----------------

func _tone(freqs: Array, dur: float, vol := 0.25) -> AudioStreamWAV:
	var rate := 22050
	var count := int(rate * dur)
	var data := PackedByteArray(); data.resize(count * 2)
	for i in count:
		var t := float(i) / rate
		var env_ := minf(1.0, t * 80.0) * exp(-t * 6.0 / dur)
		var s := 0.0
		for j in freqs.size():
			var f: float = freqs[j]
			s += sin(TAU * f * t) / freqs.size()
		data.encode_s16(i * 2, int(clampf(s * env_ * vol, -1, 1) * 32767))
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS; w.mix_rate = rate; w.data = data
	return w


func _make_sounds() -> void:
	sfx = {
		"step": _tone([660.0], 0.09, 0.12), "wait": _tone([440.0], 0.12, 0.1),
		"bump": _tone([140.0, 147.0], 0.14, 0.3), "door": _tone([392.0, 587.0], 0.35, 0.18),
		"echo": _tone([523.0, 784.0, 1046.0], 0.8, 0.2), "rewind": _tone([300.0, 450.0], 0.4, 0.12),
		"hint": _tone([880.0, 1318.0], 0.6, 0.14), "win": _tone([523.0, 659.0, 784.0, 1046.0], 1.4, 0.25),
	}
	player = AudioStreamPlayer.new()
	player.max_polyphony = 6
	add_child(player)


func _sound(k: String) -> void:
	if sfx.has(k):
		player.stream = sfx[k]; player.play()


# ---------------- progress ----------------

func _load() -> void:
	var c := ConfigFile.new()
	if c.load(SAVE) == OK:
		run_seed = int(c.get_value("run", "seed", 0)); n = int(c.get_value("run", "room", 1))
		help = int(c.get_value("run", "help", START_HELP))
		zoom = clampf(float(c.get_value("view", "zoom", 1.0)), ZOOM_MIN, ZOOM_MAX)
	if run_seed == 0:
		randomize(); run_seed = randi_range(1, 1 << 30)


func _save() -> void:
	var c := ConfigFile.new()
	c.set_value("run", "seed", run_seed); c.set_value("run", "room", n); c.set_value("run", "help", help); c.set_value("view", "zoom", zoom)
	c.save(SAVE)

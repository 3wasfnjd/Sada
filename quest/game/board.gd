extends Node3D
## The room as a small diorama: pieces from assets/pieces, the gnome hero and its echoes.
## Board space: one cell = 1 unit, floor top at y = 0, cell (x, y) at (x-(W-1)/2, 0, -(y-(H-1)/2)).
## The parent scales this node down to table size. Pure view: it never changes the rules.

const P := "res://assets/pieces/"
const SHAPES := ["Circle", "Triangle", "Square", "Diamond"]
const COLOURS := ["Amber", "Pink", "Mint", "Violet"]
const GLYPH := [Color(1.0, 0.71, 0.28), Color(1.0, 0.44, 0.68), Color(0.49, 0.94, 0.71), Color(0.72, 0.61, 1.0)]
const ECHO_COLS := [Color(0.56, 0.85, 1.0), Color(0.53, 0.72, 1.0), Color(0.62, 0.94, 0.9), Color(0.73, 0.65, 1.0), Color(0.84, 0.96, 1.0)]
const HOP := 0.32

var R: Dictionary
var room_node: Node3D
var ents := []      # [{node, ap, from: Vector3, to: Vector3, t, dur, yaw, tyaw, bump, ghost}]
var doors := []     # [{panel, open, target}]
var plates := []    # [{node, on, target}]
var exit_node: Node3D
var hint_node: Node3D
var hint_t := 0.0
var ticks_node: Node3D
var ticks := []
var echo_slots := []
var _cache := {}
var _gnome: PackedScene = preload("res://assets/gnome.glb")
var _ghost_mats := []
var _statue: StandardMaterial3D


func _ready() -> void:
	for c in ECHO_COLS:
		var m := StandardMaterial3D.new()
		m.albedo_color = Color(c.r, c.g, c.b, 0.5)
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.emission_enabled = true
		m.emission = c
		m.emission_energy_multiplier = 0.6
		m.roughness = 0.4
		_ghost_mats.append(m)


func cell(x: int, y: int, h := 0.0) -> Vector3:
	return Vector3(x - (R.W - 1) / 2.0, h, -(y - (R.H - 1) / 2.0))


func to_cell(local: Vector3) -> Vector2i:
	return Vector2i(roundi(local.x + (R.W - 1) / 2.0), roundi(-local.z + (R.H - 1) / 2.0))


## the larger side of the room, in cells (the parent sizes the table from it)
func span() -> float:
	return float(maxi(R.W, R.H)) + 1.0


# ---------------- models ----------------

func _scene(name: String) -> PackedScene:
	if not _cache.has(name):
		_cache[name] = load(P + name + ".glb")
	return _cache[name]


## the pieces carry their colours in vertex colours; Sada_glow parts are lit from inside,
## Sada_haze parts are a faint additive veil (same treatment as the web version)
static var _srgb := {}

## The Compatibility renderer (used on Quest) shows vertex colours as stored, without the
## linear -> sRGB step, and ignores vertex_color_is_srgb. The pieces store linear colours
## (glTF), so convert them once per mesh; then they look as authored in Blender.
static func _srgb_mesh(mesh: Mesh) -> Mesh:
	if not (mesh is ArrayMesh): return mesh
	var out := ArrayMesh.new()
	var any := false
	for s in mesh.get_surface_count():
		var arr := mesh.surface_get_arrays(s)
		var cols = arr[Mesh.ARRAY_COLOR]
		if cols != null and cols.size():
			var c: PackedColorArray = cols
			for i in c.size(): c[i] = c[i].linear_to_srgb()
			arr[Mesh.ARRAY_COLOR] = c
			any = true
		out.add_surface_from_arrays(mesh.surface_get_primitive_type(s), arr)
		out.surface_set_material(s, mesh.surface_get_material(s))
	return out if any else mesh


static func prep(n: Node) -> void:
	if n is MeshInstance3D:
		var mi := n as MeshInstance3D
		if not _srgb.has(mi.mesh): _srgb[mi.mesh] = _srgb_mesh(mi.mesh)
		mi.mesh = _srgb[mi.mesh]
		for s in mi.mesh.get_surface_count():
			var src := mi.get_active_material(s)
			var nm: String = src.resource_name if src else ""
			var m := StandardMaterial3D.new()
			m.vertex_color_use_as_albedo = true
			m.roughness = 0.85
			if nm.begins_with("Sada_glow"):
				m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			elif nm.begins_with("Sada_haze"):
				m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
				m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
				m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
				m.albedo_color = Color(1, 1, 1, 0.18)
				m.cull_mode = BaseMaterial3D.CULL_DISABLED
				m.no_depth_test = false
				mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			mi.set_surface_override_material(s, m)
	if n is Light3D:
		(n as Light3D).visible = false
	for c in n.get_children():
		prep(c)


func _piece(name: String) -> Node3D:
	var n: Node3D = _scene(name).instantiate()
	prep(n)
	return n


## one mesh drawn many times (floor tiles, wall blocks): a MultiMesh, one draw call each
func _multi(name: String, cells: Array) -> MultiMeshInstance3D:
	var src := _piece(name)
	var mi: MeshInstance3D = src.find_children("*", "MeshInstance3D", true, false)[0] if not (src is MeshInstance3D) else src
	var mesh: Mesh = mi.mesh.duplicate()
	for s in mesh.get_surface_count():
		mesh.surface_set_material(s, mi.get_surface_override_material(s))
	var rel: Transform3D = Transform3D.IDENTITY if mi == src else _rel(src, mi)
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = mesh
	mm.instance_count = cells.size()
	for i in cells.size():
		mm.set_instance_transform(i, Transform3D(Basis(), cell(cells[i].x, cells[i].y)) * rel)
	var out := MultiMeshInstance3D.new()
	out.multimesh = mm
	src.free()
	return out


static func _rel(root: Node3D, n: Node3D) -> Transform3D:
	var t := Transform3D.IDENTITY
	var c: Node = n
	while c != root and c is Node3D:
		t = (c as Node3D).transform * t
		c = c.get_parent()
	return t


# ---------------- room ----------------

func build(room: Dictionary) -> void:
	R = room
	if room_node:
		room_node.free()
	room_node = Node3D.new()
	add_child(room_node)
	doors.clear(); plates.clear()
	var floor_cells := []; var wall_cells := []
	for y in R.H:
		for x in R.W:
			(wall_cells if R.wall[y * R.W + x] == 1 else floor_cells).append(Vector2i(x, y))
	room_node.add_child(_multi("FloorTile_1x1", floor_cells))
	if wall_cells.size():
		room_node.add_child(_multi("WallBlock_1x1", wall_cells))
	for i in R.doors.size():
		var d: Dictionary = R.doors[i]
		var g: int = i % 4
		var frame := _piece(SHAPES[g] + "Door_frame")
		frame.position = cell(d.x, d.y)
		room_node.add_child(frame)
		var panel := _piece(SHAPES[g] + "Door_panel")
		panel.position = cell(d.x, d.y)
		room_node.add_child(panel)
		var mark: MeshInstance3D = null
		if d.kind == "inverse" or d.kind == "timed":
			mark = _door_mark(d.kind, GLYPH[g])
			mark.position = cell(d.x, d.y, 2.05)
			room_node.add_child(mark)
		doors.append({"panel": panel, "open": 0.0, "target": 0.0, "mark": mark})
	for p in R.plates:
		var g: int = p.door % 4
		var n := _piece(COLOURS[g] + "Plate")
		n.position = cell(p.x, p.y)
		room_node.add_child(n)
		if R.doors[p.door].kind == "inverse":
			var ring := _ring(GLYPH[g])
			ring.position = cell(p.x, p.y, 0.12)
			room_node.add_child(ring)
		plates.append({"node": n, "on": 0.0, "target": 0.0})
	exit_node = _piece("ExitRing")
	exit_node.position = cell(R.exit.x, R.exit.y)
	room_node.add_child(exit_node)
	_build_ticks()
	clear_hint()


## inverse doors: hollow ring above the door; timed doors: three small pips (same idea as the web)
func _door_mark(kind: String, c: Color) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	if kind == "inverse":
		var t := TorusMesh.new(); t.inner_radius = 0.12; t.outer_radius = 0.18
		m.mesh = t
		m.rotation.x = PI / 2
	else:
		var s := SphereMesh.new(); s.radius = 0.09; s.height = 0.18
		m.mesh = s
	m.material_override = _glow(c)
	return m


func _ring(c: Color) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	var t := TorusMesh.new(); t.inner_radius = 0.3; t.outer_radius = 0.36
	m.mesh = t
	m.material_override = _glow(c)
	return m


static func _glow(c: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = c
	return m


# ---------------- loop timeline: echo slots + tick dots along the near edge ----------------

func _build_ticks() -> void:
	ticks.clear(); echo_slots.clear()
	ticks_node = Node3D.new()
	room_node.add_child(ticks_node)
	var y0 := -1.0
	var L: int = R.L
	var w := minf(R.W - 0.4, L * 0.32)
	var dot := SphereMesh.new(); dot.radius = 0.07; dot.height = 0.14
	for i in L:
		var m := MeshInstance3D.new()
		m.mesh = dot
		m.position = Vector3(-w / 2.0 + w * (i + 0.5) / L, 0.1, -(y0 - (R.H - 1) / 2.0))
		m.material_override = _glow(Color(1, 0.9, 0.65))
		ticks_node.add_child(m)
		ticks.append(m)
	var e: int = R.E
	var cap := CapsuleMesh.new(); cap.radius = 0.1; cap.height = 0.34
	for i in e:
		var m := MeshInstance3D.new()
		m.mesh = cap
		m.position = Vector3(-w / 2.0 - 0.35 - i * 0.3, 0.2, -(y0 - (R.H - 1) / 2.0))
		ticks_node.add_child(m)
		echo_slots.append(m)


func show_timeline(done: int, echoes: int) -> void:
	for i in ticks.size():
		var m: MeshInstance3D = ticks[i]
		var left := ticks.size() - done
		var c := Color(1, 0.9, 0.65) if i >= done else Color(0.25, 0.22, 0.2)
		if i >= done and left <= 3:
			c = Color(1, 0.45, 0.35)
		(m.material_override as StandardMaterial3D).albedo_color = c
	for i in echo_slots.size():
		var m: MeshInstance3D = echo_slots[i]
		m.material_override = _ghost_mats[i % _ghost_mats.size()] if i < echoes else _glow(Color(0.3, 0.3, 0.34))


# ---------------- characters ----------------

func spawn(count: int, pos: Dictionary) -> void:
	for e in ents:
		e.node.queue_free()
	ents.clear()
	for i in count:
		var n: Node3D = _gnome.instantiate()
		var ghost := i < count - 1
		if ghost:
			for mi in n.find_children("*", "MeshInstance3D", true, false):
				(mi as MeshInstance3D).material_override = _ghost_mats[i % _ghost_mats.size()]
		add_child(n)
		var ap: AnimationPlayer = n.find_children("*", "AnimationPlayer", true, false)[0] if n.find_children("*", "AnimationPlayer", true, false).size() else null
		var p: Vector2i = pos.p[i]
		var e := {"node": n, "ap": ap, "from": cell(p.x, p.y), "to": cell(p.x, p.y), "t": 1.0, "dur": HOP, "yaw": 0.0, "tyaw": 0.0, "bump": Vector3.ZERO, "ghost": ghost, "anim": ""}
		n.position = e.to
		ents.append(e)
		_play(e, "idle")


func _play(e: Dictionary, name: String) -> void:
	var ap: AnimationPlayer = e.ap
	if ap == null:
		return
	var found := ""
	for a in ap.get_animation_list():
		if a == name or a.ends_with("/" + name) or a.begins_with(name):
			found = a; break
	if found == "":
		return
	if name == "idle":
		ap.get_animation(found).loop_mode = Animation.LOOP_LINEAR
	e.anim = name
	ap.play(found, 0.08)


func _face(e: Dictionary, a: String) -> void:
	var d: Vector2i = {"U": Vector2i(0, 1), "D": Vector2i(0, -1), "L": Vector2i(-1, 0), "R": Vector2i(1, 0)}.get(a, Vector2i.ZERO)
	if d != Vector2i.ZERO:
		e.tyaw = atan2(float(d.x), float(-d.y))


## one tick: every entity hops (or bumps) from its old cell to its new one
func animate(before: Dictionary, after: Dictionary, acts: Array, dur: float) -> void:
	for i in ents.size():
		var e: Dictionary = ents[i]
		var a: Vector2i = before.p[i]; var b: Vector2i = after.p[i]
		var act: String = acts[i] if i < acts.size() else "W"
		_face(e, act)
		e.from = cell(a.x, a.y); e.to = cell(b.x, b.y); e.t = 0.0; e.dur = dur * 0.9
		e.bump = Vector3.ZERO
		if a != b:
			_play(e, "hop")
		elif act != "W" and after.b[i]:
			e.bump = Vector3(sin(e.tyaw), 0, cos(e.tyaw)) * 0.22
			_play(e, "bump")


func bump(i: int, act: String) -> void:
	var e: Dictionary = ents[i]
	_face(e, act)
	e.from = e.to; e.t = 0.0; e.dur = HOP
	e.bump = Vector3(sin(e.tyaw), 0, cos(e.tyaw)) * 0.22
	_play(e, "bump")


func cheer(i: int) -> void:
	_play(ents[i], "cheer")


func snap(pos: Dictionary) -> void:
	for i in mini(ents.size(), pos.p.size()):
		var p: Vector2i = pos.p[i]
		var e: Dictionary = ents[i]
		e.from = cell(p.x, p.y); e.to = e.from; e.t = 1.0
		e.node.position = e.to


func update_doors(open: Array, pos: Dictionary) -> void:
	for i in doors.size():
		doors[i].target = 1.0 if open[i] else 0.0
	var pinned: Array = R.get("pinned", [])
	for j in plates.size():
		var pl: Dictionary = R.plates[j]
		var on := false
		for q in pos.p:
			if q.x == pl.x and q.y == pl.y: on = true
		for q in pinned:
			if q.x == pl.x and q.y == pl.y: on = true
		plates[j].target = 1.0 if on else 0.0


# ---------------- hint: numbered footprints for the next loop ----------------

func show_hint(cells: Array) -> void:
	clear_hint()
	hint_node = Node3D.new()
	room_node.add_child(hint_node)
	var disc := CylinderMesh.new(); disc.top_radius = 0.16; disc.bottom_radius = 0.16; disc.height = 0.02
	var mat := _glow(Color(1, 0.83, 0.54))
	for c in cells:
		var m := MeshInstance3D.new()
		m.mesh = disc; m.material_override = mat
		m.position = cell(c.x, c.y, 0.04)
		hint_node.add_child(m)
		var l := Label3D.new()
		l.text = str(c.t)
		l.font_size = 96; l.pixel_size = 0.004
		l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		l.no_depth_test = true
		l.modulate = Color(1, 0.86, 0.6)
		l.outline_size = 16
		l.position = cell(c.x, c.y, 0.55)
		hint_node.add_child(l)
	hint_t = 9.0


func clear_hint() -> void:
	if hint_node:
		hint_node.queue_free()
		hint_node = null


func _process(dt: float) -> void:
	for e in ents:
		if e.t < 1.0:
			e.t = minf(1.0, e.t + dt / e.dur)
			var k: float = e.t
			var p: Vector3 = (e.from as Vector3).lerp(e.to, k)
			if e.bump != Vector3.ZERO:
				p += e.bump * sin(k * PI)
			p.y = sin(k * PI) * (0.28 if e.from != e.to else 0.06)
			e.node.position = p
			if e.t >= 1.0 and e.anim != "cheer":
				_play(e, "idle")
		var dy: float = wrapf(e.tyaw - e.yaw, -PI, PI)
		e.yaw += dy * minf(1.0, dt * 14.0)
		e.node.rotation.y = e.yaw
	for d in doors:
		d.open = move_toward(d.open, d.target, dt * 4.0)
		var pn: Node3D = d.panel
		pn.scale.y = maxf(0.03, 1.0 - d.open * 0.97)
		pn.visible = d.open < 0.99
	for p in plates:
		p.on = move_toward(p.on, p.target, dt * 8.0)
		(p.node as Node3D).position.y = -0.05 * p.on
	if hint_node:
		hint_t -= dt
		if hint_t <= 0.0:
			clear_hint()

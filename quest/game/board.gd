extends Node3D
## The room as a small diorama on a floating island. Since Quest 0.6.0 everything is built in code
## in a low-poly faceted style (game/lowpoly/): stone floor and walls, stone doors, the island and
## the hero (a Saudi elder in a shemagh). LOWPOLY = false brings back the imported pieces and gnome.
## Board space: one cell = 1 unit, floor top at y = 0, cell (x, y) at (x-(W-1)/2, 0, -(y-(H-1)/2)).
## The parent scales this node down to table size. Pure view: it never changes the rules.

const P := "res://assets/pieces/"
const SHAPES := ["Circle", "Triangle", "Square", "Diamond"]
const COLOURS := ["Amber", "Pink", "Mint", "Violet"]
const GLYPH := [Color(1.0, 0.71, 0.28), Color(1.0, 0.44, 0.68), Color(0.49, 0.94, 0.71), Color(0.72, 0.61, 1.0)]
const ECHO_COLS := [Color(0.56, 0.85, 1.0), Color(0.53, 0.72, 1.0), Color(0.62, 0.94, 0.9), Color(0.73, 0.65, 1.0), Color(0.84, 0.96, 1.0)]
const HOP := 0.32
const LOWPOLY := true
const Env = preload("res://game/lowpoly/env.gd")
const Hero = preload("res://game/lowpoly/fox_up.gd")   # the hero since 0.9.0 (fox.gd: on four legs; hero.gd: the elder)

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
# the Quest build uses the sharper gnome (16k triangles, 2048 textures) when it is present
var _gnome: PackedScene = null if LOWPOLY else (load("res://assets/gnome_quest.glb") if ResourceLoader.exists("res://assets/gnome_quest.glb") else load("res://assets/gnome.glb"))
var _lp_cache := {}   # code-built meshes shared by every room (door frame, panel, plate, exit)
var viewer := Vector3(0, 10, 10)   # the player's head in world space (set by main), for the idle glance
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
			for i in c.size():
				var v: Color = c[i].linear_to_srgb()
				var l := v.get_luminance()
				c[i] = Color(lerpf(v.r, l, 0.12), lerpf(v.g, l, 0.12), lerpf(v.b, l, 0.12), v.a)
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


## Fit transform per piece: the exported pieces are not all centred on their own origin
## (the wall block sat 1.24 cells off, inside the next row). Centre every piece on its cell in
## x/z; the wall block fills exactly one cell.
var _fits := {}
const FILL := {"WallBlock_1x1": 1.0}   # the floor tile overlaps its neighbours on purpose (no seams)

func _fit_of(name: String, src: Node3D) -> Transform3D:
	if _fits.has(name): return _fits[name]
	var box := AABB(); var first := true
	for mi in src.find_children("*", "MeshInstance3D", true, false):
		var b: AABB = _rel(src, mi) * (mi as MeshInstance3D).get_aabb()
		box = b if first else box.merge(b); first = false
	var c := box.get_center()
	var sc := Vector3.ONE
	if FILL.has(name):
		sc = Vector3(FILL[name] / maxf(box.size.x, 0.01), 1.0, FILL[name] / maxf(box.size.z, 0.01))
	var t := Transform3D(Basis.from_scale(sc), Vector3(-c.x * sc.x, 0.0, -c.z * sc.z))
	_fits[name] = t
	return t


func _piece(name: String) -> Node3D:
	var src: Node3D = _scene(name).instantiate()
	prep(src)
	var n := Node3D.new()
	var inner := Node3D.new()
	inner.transform = _fit_of(name, src)
	n.add_child(inner)
	src.transform = Transform3D.IDENTITY
	inner.add_child(src)
	return n


## one mesh drawn many times (floor tiles, wall blocks): a MultiMesh, one draw call each
func _multi(name: String, cells: Array) -> MultiMeshInstance3D:
	var src := _piece(name)
	var mi: MeshInstance3D = src.find_children("*", "MeshInstance3D", true, false)[0]
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
	var room_seed: int = hash([R.W, R.H, R.wall])
	if LOWPOLY:
		room_node.add_child(_lp_mi(Env.floor_mesh(floor_cells + wall_cells, R.W, R.H, room_seed)))
		if wall_cells.size():
			room_node.add_child(_lp_mi(Env.wall_mesh(wall_cells, R.W, R.H, room_seed + 1)))
		room_node.add_child(_lp_mi(Env.island_mesh(R, room_seed + 2)))
	else:
		room_node.add_child(_multi("FloorTile_1x1", floor_cells))
		if wall_cells.size():
			room_node.add_child(_multi("WallBlock_1x1", wall_cells))
	for i in R.doors.size():
		var d: Dictionary = R.doors[i]
		var g: int = i % 4
		var frame: Node3D = _lp_mi(_shared("frame")) if LOWPOLY else _piece(SHAPES[g] + "Door_frame")
		frame.position = cell(d.x, d.y)
		room_node.add_child(frame)
		var panel: Node3D = _lp_mi(_shared("panel")) if LOWPOLY else _piece(SHAPES[g] + "Door_panel")
		panel.position = cell(d.x, d.y)
		room_node.add_child(panel)
		if LOWPOLY:   # a door in a wall running up/down the board turns with it
			frame.rotation.y = _door_turn(d.x, d.y); panel.rotation.y = frame.rotation.y
		var mark: MeshInstance3D = null
		if d.kind == "inverse" or d.kind == "timed":
			mark = _door_mark(d.kind, GLYPH[g])
			mark.position = cell(d.x, d.y, 2.75)
			room_node.add_child(mark)
		var emb := _emblem(g, d.kind == "inverse")
		emb.position = cell(d.x, d.y, 2.2)
		room_node.add_child(emb)
		doors.append({"panel": panel, "open": 0.0, "target": 0.0, "mark": mark, "emb": emb, "lit": 0.0, "flash": 0.0, "col": GLYPH[g]})
	for p in R.plates:
		var g: int = p.door % 4
		var n: Node3D = _lp_mi(_shared("plate")) if LOWPOLY else _piece(COLOURS[g] + "Plate")
		n.position = cell(p.x, p.y)
		room_node.add_child(n)
		if R.doors[p.door].kind == "inverse":
			var ring := _ring(GLYPH[g])
			ring.position = cell(p.x, p.y, 0.12)
			room_node.add_child(ring)
		var ph := _floor_ring(GLYPH[g], 0.4)
		ph.position = cell(p.x, p.y, 0.11)
		room_node.add_child(ph)
		plates.append({"node": n, "on": 0.0, "target": 0.0, "halo": ph, "col": GLYPH[g]})
	exit_node = _lp_mi(_shared("exit")) if LOWPOLY else _piece("ExitRing")
	exit_node.position = cell(R.exit.x, R.exit.y)
	room_node.add_child(exit_node)
	_exit_fx()
	if not LOWPOLY: _ground()   # the island replaces the dark footprint
	link = MultiMeshInstance3D.new()
	var lmm := MultiMesh.new(); lmm.transform_format = MultiMesh.TRANSFORM_3D
	var ld := SphereMesh.new(); ld.radius = 0.06; ld.height = 0.12; ld.radial_segments = 8; ld.rings = 4
	var lm := _glow(Color.WHITE); lm.no_depth_test = true; lm.render_priority = 5
	ld.material = lm
	lmm.mesh = ld; lmm.instance_count = LINK_DOTS * 4; lmm.visible_instance_count = 0
	link.multimesh = lmm
	link.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	room_node.add_child(link)
	hover_door = -1
	_build_ticks()
	clear_hint()


func _lp_mi(m: Mesh) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = m
	return mi


func _shared(k: String) -> Mesh:
	if not _lp_cache.has(k):
		match k:
			"frame": _lp_cache[k] = Env.door_frame_mesh(5)
			"panel": _lp_cache[k] = Env.door_panel_mesh(6)
			"plate": _lp_cache[k] = Env.plate_mesh(7)
			"exit": _lp_cache[k] = Env.exit_mesh(8)
	return _lp_cache[k]


func _is_wall(x: int, y: int) -> bool:
	return x >= 0 and y >= 0 and x < R.W and y < R.H and R.wall[y * R.W + x] == 1


## doors stand along x; one with walls above and below it (and none beside) turns a quarter
func _door_turn(x: int, y: int) -> float:
	if _is_wall(x - 1, y) or _is_wall(x + 1, y): return 0.0
	if _is_wall(x, y - 1) or _is_wall(x, y + 1): return PI / 2
	return 0.0


## inverse doors: hollow ring above the door; timed doors: three small pips (same idea as the web)
func _door_mark(kind: String, c: Color) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	if kind == "inverse":
		var t := TorusMesh.new(); t.inner_radius = 0.12; t.outer_radius = 0.18
		m.mesh = t
		m.rotation.x = PI / 2
	else:
		var s := SphereMesh.new(); s.radius = 0.09; s.height = 0.18; s.radial_segments = 10; s.rings = 5
		m.mesh = s
	m.material_override = _glow(c)
	return m


func _ring(c: Color) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	var t := TorusMesh.new(); t.inner_radius = 0.3; t.outer_radius = 0.36
	m.mesh = t
	m.material_override = _glow(c)
	return m


# ---------------- neon ----------------

const EXIT_COL := Color(1.0, 0.82, 0.35)
var exit_fx := {}
var link: MultiMeshInstance3D
var hover_door := -1
var near_exit := 0.0
var _T := 0.0
static var _halo_tex: GradientTexture2D

## the door's shape as a neon outline: circle, triangle, square, diamond (inverse: thinner, hollow)
func _emblem(g: int, inverse: bool) -> Node3D:
	var holder := Node3D.new()   # spins and bobs; the shape inside stays upright, facing the player
	var m := MeshInstance3D.new()
	holder.add_child(m)
	var t := TorusMesh.new()
	t.rings = [48, 3, 4, 4][g]
	t.ring_segments = 8
	t.outer_radius = 0.42
	t.inner_radius = 0.35 if not inverse else 0.39
	m.mesh = t
	# torus lies flat: turn its corners within its own plane, then stand it up
	m.basis = Basis(Vector3.RIGHT, PI / 2) * Basis(Vector3.UP, [0.0, 0.0, PI / 4, 0.0][g])
	m.material_override = _glow(GLYPH[g])
	m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# the glow hugs the tube: the same shape, a little thicker and see-through (child 1)
	holder.add_child(_tube_glow(t, m.basis, GLYPH[g]))
	return holder


## a neon tube's glow: a thicker, transparent copy of the same torus, so the light stays on the
## element itself instead of a haze around it
func _tube_glow(core: TorusMesh, b: Basis, c: Color) -> MeshInstance3D:
	var t := TorusMesh.new()
	t.rings = core.rings; t.ring_segments = 8
	var w := core.outer_radius - core.inner_radius
	t.outer_radius = core.outer_radius + w * 0.9
	t.inner_radius = maxf(0.0, core.inner_radius - w * 0.9)
	var m := MeshInstance3D.new()
	m.mesh = t
	m.basis = b
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	mat.albedo_color = Color(c.r, c.g, c.b, 0.25)
	m.material_override = mat
	m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return m


## flat neon ring lying on the floor (plates, exit base)
func _floor_ring(c: Color, r: float) -> Node3D:
	var holder := Node3D.new()
	var t := TorusMesh.new(); t.rings = 48; t.ring_segments = 8
	t.outer_radius = r; t.inner_radius = r - 0.035
	var m := MeshInstance3D.new(); m.mesh = t
	m.material_override = _glow(c)
	m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	holder.add_child(m)
	holder.add_child(_tube_glow(t, Basis(), c))
	return holder


func _set_neon(holder: Node3D, c: Color, k: float) -> void:
	((holder.get_child(0) as MeshInstance3D).material_override as StandardMaterial3D).albedo_color = c * clampf(0.45 + k * 0.55, 0.0, 1.0)
	((holder.get_child(1) as MeshInstance3D).material_override as StandardMaterial3D).albedo_color = Color(c.r, c.g, c.b, clampf(0.08 + k * 0.22, 0.0, 0.35))


## soft additive glow (a radial gradient on a quad): the neon "bloom" without post-processing
func _halo(c: Color, size: float, billboard: bool) -> MeshInstance3D:
	if _halo_tex == null:
		var gr := Gradient.new()
		gr.set_color(0, Color(1, 1, 1, 1)); gr.set_color(1, Color(1, 1, 1, 0))
		gr.add_point(0.35, Color(1, 1, 1, 0.35))
		_halo_tex = GradientTexture2D.new()
		_halo_tex.gradient = gr; _halo_tex.fill = GradientTexture2D.FILL_RADIAL
		_halo_tex.fill_from = Vector2(0.5, 0.5); _halo_tex.fill_to = Vector2(1.0, 0.5)
		_halo_tex.width = 128; _halo_tex.height = 128
	var m := MeshInstance3D.new()
	var q := QuadMesh.new(); q.size = Vector2(size, size)
	m.mesh = q
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_texture = _halo_tex
	mat.albedo_color = Color(c.r, c.g, c.b, 0.5)
	mat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	if billboard: mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	else: m.rotation.x = -PI / 2
	m.material_override = mat
	m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return m


func _exit_fx() -> void:
	var at := cell(R.exit.x, R.exit.y)
	var ring := _emblem(0, false)
	ring.scale = Vector3.ONE * 1.5
	((ring.get_child(0) as MeshInstance3D).material_override as StandardMaterial3D).albedo_color = EXIT_COL
	ring.position = at + Vector3(0, 1.3, 0)
	room_node.add_child(ring)
	var base := _floor_ring(EXIT_COL, 0.55)
	base.position = at + Vector3(0, 0.05, 0)
	room_node.add_child(base)
	var sp := CPUParticles3D.new()
	sp.amount = 24; sp.lifetime = 1.8
	sp.emission_shape = CPUParticles3D.EMISSION_SHAPE_RING
	sp.emission_ring_axis = Vector3.UP; sp.emission_ring_radius = 0.45; sp.emission_ring_inner_radius = 0.3; sp.emission_ring_height = 0.05
	sp.direction = Vector3.UP; sp.spread = 8; sp.gravity = Vector3.ZERO
	sp.initial_velocity_min = 0.5; sp.initial_velocity_max = 0.9
	sp.scale_amount_min = 0.5; sp.scale_amount_max = 1.0
	var dot := SphereMesh.new(); dot.radius = 0.035; dot.height = 0.07; dot.radial_segments = 6; dot.rings = 3
	sp.mesh = dot
	var pm := _glow(EXIT_COL); dot.material = pm
	var curve := Curve.new(); curve.add_point(Vector2(0, 0)); curve.add_point(Vector2(0.2, 1)); curve.add_point(Vector2(1, 0))
	sp.scale_amount_curve = curve
	sp.position = at + Vector3(0, 0.1, 0)
	room_node.add_child(sp)
	exit_fx = {"ring": ring, "base": base}


## grounding on the real table: a soft dark footprint under the room, and a shadow catcher
## that turns the room's shadow into darkness over the passthrough image
func _ground() -> void:
	var blob := _halo(Color.BLACK, 1.0, false)
	blob.scale = Vector3(R.W + 1.6, R.H + 1.6, 1)
	var bm := blob.material_override as StandardMaterial3D
	bm.blend_mode = BaseMaterial3D.BLEND_MODE_MIX
	bm.albedo_color = Color(0, 0, 0, 0.55)
	blob.position = Vector3(0, -0.335, 0)
	room_node.add_child(blob)
	var catcher := MeshInstance3D.new()
	var pl := PlaneMesh.new(); pl.size = Vector2(R.W + 6, R.H + 6)
	catcher.mesh = pl
	var cm := StandardMaterial3D.new()
	cm.shadow_to_opacity = true
	cm.albedo_color = Color(0, 0, 0)
	cm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	cm.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	catcher.material_override = cm
	catcher.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	catcher.position = Vector3(0, -0.33, 0)
	room_node.add_child(catcher)


## the ray is over this cell: a door or a plate lights up with its partner, joined by a neon arc
func hover(c) -> void:
	var di := -1
	if c != null and R.size():
		for i in R.doors.size():
			if R.doors[i].x == c.x and R.doors[i].y == c.y: di = i
		for p in R.plates:
			if p.x == c.x and p.y == c.y: di = p.door
	hover_door = di


func flash_door(i: int) -> void:
	if i >= 0 and i < doors.size(): doors[i].flash = 1.0


const LINK_DOTS := 16

func _draw_link() -> void:
	var mm := (link as MultiMeshInstance3D).multimesh
	if hover_door < 0:
		mm.visible_instance_count = 0; return
	var d: Dictionary = R.doors[hover_door]
	var col: Color = GLYPH[hover_door % 4]
	(mm.mesh.surface_get_material(0) as StandardMaterial3D).albedo_color = col
	var a := cell(d.x, d.y, 1.0)
	var n := 0
	for p in R.plates:
		if p.door != hover_door: continue
		var b := cell(p.x, p.y, 0.15)
		for k in LINK_DOTS:
			if n >= mm.instance_count: break
			var t := (float(k) + fmod(_T * 1.5, 1.0)) / LINK_DOTS   # dots flow from plate to door
			var q := b.lerp(a, t) + Vector3(0, sin(t * PI) * 1.2, 0)
			var sz := 0.6 + 0.4 * sin(t * PI)
			mm.set_instance_transform(n, Transform3D(Basis.from_scale(Vector3.ONE * sz), q))
			n += 1
	mm.visible_instance_count = n


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
	var dot := SphereMesh.new(); dot.radius = 0.07; dot.height = 0.14; dot.radial_segments = 10; dot.rings = 5
	for i in L:
		var m := MeshInstance3D.new()
		m.mesh = dot
		m.position = Vector3(-w / 2.0 + w * (i + 0.5) / L, 0.1, -(y0 - (R.H - 1) / 2.0))
		m.material_override = _glow(Color(1, 0.9, 0.65))
		ticks_node.add_child(m)
		ticks.append(m)
	var e: int = R.E
	var cap := CapsuleMesh.new(); cap.radius = 0.1; cap.height = 0.34; cap.radial_segments = 10; cap.rings = 2
	for i in e:
		var m := MeshInstance3D.new()
		m.mesh = cap
		m.position = Vector3(-w / 2.0 - 0.35 - i * 0.3, 0.2, -(y0 - (R.H - 1) / 2.0))
		ticks_node.add_child(m)
		echo_slots.append(m)


## the hero's face (code-built hero only): smile, surprise, worry, joy
func hero_expr(x: String, seconds: float) -> void:
	if ents.size() and ents[ents.size() - 1].node.has_method("expr"):
		ents[ents.size() - 1].node.expr(x, seconds)


func show_timeline(done: int, echoes: int) -> void:
	if ents.size() and ents[ents.size() - 1].node.has_method("expr"):
		var left := ticks.size() - done
		ents[ents.size() - 1].node.worry = 1.0 if (left <= 2 and left > 0 and done > 0) else 0.0
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
		var ghost := i < count - 1
		var n: Node3D
		if LOWPOLY:
			n = Hero.new()
			n.build(ghost, _ghost_mats[i % _ghost_mats.size()])
		else:
			n = _gnome.instantiate()
		if ghost and not LOWPOLY:
			for mi in n.find_children("*", "MeshInstance3D", true, false):
				(mi as MeshInstance3D).material_override = _ghost_mats[i % _ghost_mats.size()]
		add_child(n)
		var aps := n.find_children("*", "AnimationPlayer", true, false)
		var ap: AnimationPlayer = aps[0] if aps.size() else null
		var p: Vector2i = pos.p[i]
		var e := {"node": n, "ap": ap, "from": cell(p.x, p.y), "to": cell(p.x, p.y), "t": 1.0, "dur": HOP, "yaw": 0.0, "tyaw": 0.0, "bump": Vector3.ZERO, "ghost": ghost, "anim": "", "still": 0.0}
		ents.append(e)
		_play(e, "idle")
	var off := _spread(pos)
	for i in ents.size():
		ents[i].to = ents[i].to + off[i]; ents[i].from = ents[i].to
		ents[i].node.position = ents[i].to


## Several characters on one cell (all of them at the start of a loop): drawn on the same spot
## they flicker into each other. The hero keeps the centre, echoes stand around it.
func _spread(pos: Dictionary) -> Array:
	var out := []
	var groups := {}
	for i in pos.p.size():
		out.append(Vector3.ZERO)
		var c: Vector2i = pos.p[i]
		if not groups.has(c): groups[c] = []
		groups[c].append(i)
	var hero: int = pos.p.size() - 1
	for c in groups:
		var g: Array = groups[c]
		if g.size() < 2: continue
		var ring := g.filter(func(i): return i != hero)
		if not g.has(hero): ring = ring.slice(1)   # no hero here: the first echo keeps the centre
		for j in ring.size():
			var a := TAU * j / ring.size() + PI / 4
			out[ring[j]] = Vector3(cos(a), 0, sin(a)) * 0.24
	return out


func _play(e: Dictionary, name: String) -> void:
	if e.node.has_method("play"):   # the code-built hero animates itself
		e.anim = name
		e.node.play(name)
		return
	var ap: AnimationPlayer = e.ap
	if ap == null:
		return
	var found := ""
	for a in ap.get_animation_list():
		if a == name or a.ends_with("/" + name) or a.begins_with(name):
			found = a; break
	if found == "":
		return
	if name == "idle" or name == "walk":
		ap.get_animation(found).loop_mode = Animation.LOOP_LINEAR
		if e.anim == name and ap.is_playing():
			return   # keep the cycle going instead of restarting it every step
	e.anim = name
	ap.play(found, 0.08)


func _face(e: Dictionary, a: String) -> void:
	var d: Vector2i = {"U": Vector2i(0, 1), "D": Vector2i(0, -1), "L": Vector2i(-1, 0), "R": Vector2i(1, 0)}.get(a, Vector2i.ZERO)
	if d != Vector2i.ZERO:
		e.tyaw = atan2(float(d.x), float(-d.y))


## one tick: every entity walks (or bumps) from its old cell to its new one
func animate(before: Dictionary, after: Dictionary, acts: Array, dur: float) -> void:
	var off := _spread(after)
	for i in ents.size():
		var e: Dictionary = ents[i]
		var a: Vector2i = before.p[i]; var b: Vector2i = after.p[i]
		var act: String = acts[i] if i < acts.size() else "W"
		_face(e, act)
		e.from = e.node.position; e.from.y = 0.0
		e.to = cell(b.x, b.y) + off[i]; e.t = 0.0; e.dur = dur
		e.bump = Vector3.ZERO
		if a != b:
			e.still = 0.0
			_play(e, "walk" if _has(e, "walk") else "hop")
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


func _has(e: Dictionary, name: String) -> bool:
	if e.node.has_method("play"): return true
	return e.ap != null and (e.ap as AnimationPlayer).has_animation(name)


func snap(pos: Dictionary) -> void:
	var off := _spread(pos)
	for i in mini(ents.size(), pos.p.size()):
		var p: Vector2i = pos.p[i]
		var e: Dictionary = ents[i]
		e.from = cell(p.x, p.y) + off[i]; e.to = e.from; e.t = 1.0
		e.node.position = e.to


func update_doors(open: Array, pos: Dictionary) -> void:
	var opened := false
	for i in doors.size():
		if open[i] and doors[i].target < 0.5: opened = true
		doors[i].target = 1.0 if open[i] else 0.0
	if opened: hero_expr("smile", 1.4)
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
			var walking: bool = (e.from as Vector3).distance_to(e.to) > 0.3
			# walking: a light step bob (two steps per cell) instead of a jump
			p.y = absf(sin(k * TAU)) * 0.04 if walking else sin(k * PI) * 0.06
			e.node.position = p
		else:
			e.still += dt
			# a short pause between steps keeps walking; a longer one settles into idle
			if e.still > 0.12 and e.anim != "cheer" and e.anim != "idle": _play(e, "idle")
			# alive: after standing a while the hero turns to look at you, then back
			if not e.ghost and e.still > 2.0 and fmod(e.still, 7.0) < 3.5:
				var v: Vector3 = to_local(viewer) - (e.node as Node3D).position
				e.tyaw = atan2(v.x, v.z)
		var dy: float = wrapf(e.tyaw - e.yaw, -PI, PI)
		e.yaw += dy * minf(1.0, dt * 14.0)
		e.node.rotation.y = e.yaw
	_T += dt
	for i in doors.size():
		var d: Dictionary = doors[i]
		d.open = move_toward(d.open, d.target, dt * 4.0)
		var pn: Node3D = d.panel
		pn.scale.y = maxf(0.03, 1.0 - d.open * 0.97)
		pn.visible = d.open < 0.99
		# neon: breathes when closed, bright and spinning when open, white flash on a bump
		var hov := 1.0 if hover_door == i else 0.0
		d.lit = move_toward(d.lit, maxf(d.target, hov * 0.7), dt * 3.0)
		d.flash = maxf(0.0, d.flash - dt * 2.5)
		var pulse := 0.55 + 0.25 * sin(_T * 2.6 + i)
		var k: float = clampf(pulse + d.lit * 0.6, 0.0, 1.4)
		var col: Color = (d.col as Color).lerp(Color.WHITE, d.flash * 0.8)
		var em: Node3D = d.emb
		_set_neon(em, col, k / 1.4 + d.flash * 0.3)
		em.rotation.y = d.open * _T * 2.0
		em.position.y = 2.2 + sin(_T * 1.8 + i) * 0.06 + d.open * 0.3
		em.scale = Vector3.ONE * (1.0 + d.flash * 0.3 + hov * 0.15)
	for p in plates:
		p.on = move_toward(p.on, p.target, dt * 8.0)
		(p.node as Node3D).position.y = -0.05 * p.on
		var hov := 1.0 if hover_door >= 0 and R.plates[plates.find(p)].door == hover_door else 0.0
		var a: float = 0.15 + 0.08 * sin(_T * 3.0) + p.on * 0.4 + hov * 0.25
		var c: Color = p.col
		_set_neon(p.halo, c, a / 0.9)
	if exit_fx.size() and ents.size():
		var hero: Node3D = ents[ents.size() - 1].node
		var dist := hero.position.distance_to(cell(R.exit.x, R.exit.y))
		near_exit = move_toward(near_exit, clampf(1.0 - (dist - 1.0) / 2.5, 0.0, 1.0), dt * 2.0)
	if exit_fx.size():
		var ring: Node3D = exit_fx.ring
		ring.rotation.y += dt * (0.8 + near_exit * 3.0)
		ring.position.y = cell(R.exit.x, R.exit.y).y + 1.3 + sin(_T * 1.5) * 0.12
		var g := 0.7 + 0.3 * sin(_T * 2.2) + near_exit * 0.5
		_set_neon(exit_fx.ring, EXIT_COL, g / 1.5)
		_set_neon(exit_fx.base, EXIT_COL, g / 1.5)
	if link: _draw_link()
	if hint_node:
		hint_t -= dt
		if hint_t <= 0.0:
			clear_hint()

extends Node3D
## The hero, built in code in the low-poly faceted style: a Saudi elder (شايب) with a red and
## white shemagh worn over the head and shoulders under a black double iqal (one end hangs on his
## chest and swings, the other is thrown back over the shoulder), a white beard and
## moustache, a white thobe under a brown bisht with gold trim, and a cane.
## Faces +z. About 0.85 cells tall. All motion is procedural (no skeleton):
##   play("idle" | "walk" | "hop" | "bump" | "land" | "cheer")
##   expr("calm" | "smile" | "surprise" | "worry" | "joy", seconds)  (0 s = keep)
## Echoes (ghost = true) are the same figure, see-through blue, with closed eyes.

const LP = preload("res://game/lowpoly/lp.gd")

const SKIN := Color(0.82, 0.60, 0.44)
const WHITE := Color(0.96, 0.95, 0.91)
const BEARD := Color(0.93, 0.92, 0.89)
const RED := Color(0.80, 0.15, 0.15)
const BISHT := Color(0.12, 0.12, 0.13)
const IQAL := Color(0.07, 0.07, 0.08)
const CLOTH := Color(1, 1, 1)   # shemagh vertex colour: the texture carries the pattern
const GOLD := Color(0.86, 0.68, 0.32)
const EYE := Color(0.16, 0.10, 0.07)
const MOUTH := Color(0.36, 0.14, 0.12)
const SANDAL := Color(0.36, 0.23, 0.14)
const CANE := Color(0.45, 0.30, 0.18)

const NECK := Vector3(0, 0.47, 0)
const HC := Vector3(0, 0.15, 0)        # head centre, in the head pivot's space
const HR := Vector3(0.165, 0.17, 0.16)

var ghost := false
var ghost_mat: Material

var body: Node3D
var head: Node3D
var arm_l: Node3D
var arm_r: Node3D
var foot_l: Node3D
var foot_r: Node3D
var tail: Array = []        # shemagh tail segments (Node3D), swing with motion
var eyes: Array = []        # [left, right]: Node3D, children 0 open / 1 happy / 2 closed
var brows: Array = []
var mouth: Node3D           # children 0 smile / 1 open / 2 worried / 3 small

var anim := "idle"
var _t := 0.0
var _phase := 0.0
var _anim_t := 0.0
var _expr := "calm"
var _expr_t := 0.0
var _blink := 2.0
var _blink_t := 0.0
var _pop := 0.0
var _tail_v := Vector2.ZERO
var _tail_a := Vector2.ZERO
var _last_pos := Vector3.ZERO
var worry := 0.0
var _worried := false            # 0..1, set by the board when the steps are running out


func build(as_ghost: bool, ghost_material: Material = null) -> void:
	ghost = as_ghost
	ghost_mat = ghost_material
	body = Node3D.new(); add_child(body)
	body.add_child(_mesh(_torso_mesh()))
	var bisht := _mesh(_bisht_mesh())
	if not ghost:
		var bm := LP.material().duplicate() as StandardMaterial3D
		bm.cull_mode = BaseMaterial3D.CULL_DISABLED
		bisht.material_override = bm
	body.add_child(bisht)
	head = Node3D.new(); head.position = NECK; body.add_child(head)
	head.add_child(_mesh(_head_mesh()))
	var drape := _mesh(_drape_mesh())
	if not ghost:
		drape.material_override = shemagh_material()
	head.add_child(drape)
	_face_parts()
	# the shemagh's free end on his left: hangs beside the face, then onto the chest
	var pivot := Node3D.new(); pivot.position = Vector3(0.175, -0.035, 0.125); head.add_child(pivot)
	var parent: Node3D = pivot
	for k in 2:
		var seg := Node3D.new()
		seg.position = Vector3.ZERO if k == 0 else Vector3(-0.02, -0.17, 0.005)
		var fm := _mesh(_flap_mesh(k))
		fm.material_override = shemagh_material()
		seg.add_child(fm)
		parent.add_child(seg); tail.append(seg); parent = seg
	arm_l = _arm(-1); arm_r = _arm(1)
	foot_l = _foot(-1); foot_r = _foot(1)
	if ghost:
		for mi in find_children("*", "MeshInstance3D", true, false):
			(mi as MeshInstance3D).material_override = ghost_mat
			(mi as MeshInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_blink = randf_range(1.0, 4.0)
	_apply_expr()


func _mesh(m: Mesh) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = m
	return mi


func _lp(seed_: int) -> LP:
	var lp := LP.new(seed_)
	lp.ao_low = -0.05; lp.ao_high = 0.9; lp.ao_min = 0.8; lp.shade_jitter = 0.03
	return lp


# ---------------- parts ----------------

func _torso_mesh() -> ArrayMesh:
	var lp := _lp(11)
	var rings := []
	for r in [[0.03, 0.165], [0.2, 0.15], [0.36, 0.14], [0.44, 0.125], [0.49, 0.06]]:
		rings.append([r[0], LP.circle(8, r[1], r[1] * 0.88, PI / 8)])
	lp.loft(rings, WHITE)
	lp.cyl(Vector3(0, 0.47, 0), 0.055, 0.05, 0.05, 6, SKIN)   # neck
	return lp.commit()


## the bisht: an open cloak over the shoulders, gold trim down both front edges
func _bisht_mesh() -> ArrayMesh:
	var lp := _lp(12)
	var gap := 0.5   # front opening (radians each side of +z)
	var n := 9
	var levels := [[0.05, 0.2], [0.24, 0.175], [0.41, 0.158], [0.47, 0.11]]
	var pts := []
	for L in levels:
		var row := []
		for k in n:
			var a := PI / 2 + gap + (TAU - 2 * gap) * k / (n - 1)   # from front-left round the back to front-right
			row.append(Vector3(cos(a) * L[1], L[0], sin(a) * L[1] * 0.9))
		pts.append(row)
	for i in levels.size() - 1:
		for k in n - 1:
			var a: Vector3 = pts[i][k]; var b: Vector3 = pts[i][k + 1]; var c: Vector3 = pts[i + 1][k]; var d: Vector3 = pts[i + 1][k + 1]
			var ins := Vector3(0, (a.y + c.y) / 2.0, 0)
			lp.tri(a, b, d, BISHT, ins); lp.tri(a, d, c, BISHT, ins)
	# shoulder yoke so the top reads closed
	for k in n - 1:
		var a: Vector3 = pts[levels.size() - 1][k]; var b: Vector3 = pts[levels.size() - 1][k + 1]
		lp.tri(a, b, Vector3(0, 0.5, -0.01), BISHT, Vector3(0, 0.3, 0))
	# gold trim down both opening edges and along the shoulders
	for side in [0, n - 1]:
		for i in levels.size() - 1:
			var a: Vector3 = pts[i][side]; var c: Vector3 = pts[i + 1][side]
			lp.block((a + c) / 2.0, Vector3(0.02, absf(c.y - a.y) + 0.02, 0.02), 0.005, 0.0, GOLD)
	return lp.commit()


func _head_mesh() -> ArrayMesh:
	var lp := _lp(13)
	lp.blob(HC, HR, 0.025, SKIN, 1)
	lp.blob(HC + Vector3(0, -0.02, 0.165), Vector3(0.032, 0.036, 0.036), 0.1, Color(0.80, 0.55, 0.40))   # nose
	for s in [-1, 1]:
		lp.blob(HC + Vector3(0.165 * s, 0.0, 0.0), Vector3(0.025, 0.04, 0.03), 0.1, SKIN)   # ears
		lp.blob(HC + Vector3(0.12 * s, -0.06, 0.06), Vector3(0.05, 0.08, 0.06), 0.15, BEARD)   # sideburns
		var m := HC + Vector3(0.038 * s, -0.052, 0.158)
		lp.xf = Transform3D(Basis(Vector3.BACK, 0.35 * s), m)   # moustache, drooping outwards
		lp.block(Vector3.ZERO, Vector3(0.06, 0.022, 0.03), 0.008, 0.003, BEARD)
		lp.xf = Transform3D.IDENTITY
	lp.blob(HC + Vector3(0, -0.13, 0.05), Vector3(0.14, 0.095, 0.125), 0.08, BEARD, 1)   # beard
	lp.blob(HC + Vector3(0, -0.2, 0.08), Vector3(0.07, 0.06, 0.07), 0.15, BEARD)          # beard point
	# the iqal: two black cords round the crown, tilted a little back
	for k in 2:
		lp.xf = Transform3D(Basis(Vector3.RIGHT, -0.22), HC + Vector3(0, 0.125 + 0.024 * k, -0.02))
		_ring(lp, 0.152, 0.146, 0.013, 14, IQAL)
	lp.xf = Transform3D.IDENTITY
	return lp.commit()


## The shemagh, worn the Saudi way: a square folded into a triangle, its folded edge straight
## across the forehead with the raised crease (البنية) in the middle, under the iqal; the sides fall
## flat beside the cheeks to the shoulders; the triangle's point falls down the back with a
## fringe. Left end hangs on the chest (its own swinging node), right end thrown back over the
## shoulder. White vertex colours (light only): the check pattern is the texture.
func _drape_mesh() -> ArrayMesh:
	var lp := _lp(15)
	lp.shade_jitter = 0.02
	# over the head: top, sides and back down to the ears, open for the face
	lp.blob(HC + Vector3(0, 0.012, -0.006), HR * Vector3(1.13, 1.08, 1.13), 0.012, CLOTH, 2, -0.62,
		func(d: Vector3) -> bool: return not (d.z > 0.3 and d.y < 0.52))
	# the crease over the forehead: a small upright diamond peak
	lp.xf = Transform3D(Basis(Vector3.RIGHT, -0.5) * Basis(Vector3.BACK, PI / 4), HC + Vector3(0, 0.13, 0.145))
	lp.block(Vector3.ZERO, Vector3(0.045, 0.045, 0.03), 0.004, 0.0, CLOTH)
	lp.xf = Transform3D.IDENTITY
	# the sides: flat cloth beside the cheeks down to the shoulders, a little flared
	for sd in [-1.0, 1.0]:
		var rows := [[HC.y + 0.02, 0.19, 0.12, -0.12], [HC.y - 0.1, 0.2, 0.125, -0.13],
			[0.0, 0.215, 0.13, -0.14], [-0.055, 0.245, 0.12, -0.15]]
		var grid := []
		for r in rows:
			var row := []
			for k in 3:
				var z: float = lerpf(r[2], r[3], k / 2.0)
				row.append(Vector3(sd * ((r[1] as float) + 0.008 * absf(k - 1)), r[0], z))
			grid.append(row)
		_sheet(lp, grid, Vector3(0, HC.y * 0.5, 0))
	# the back: the triangle's point falls down the back
	var back := [[Vector3(-0.17, HC.y - 0.02, -0.15), Vector3(0, HC.y - 0.02, -0.18), Vector3(0.17, HC.y - 0.02, -0.15)],
		[Vector3(-0.2, -0.04, -0.17), Vector3(0, -0.04, -0.21), Vector3(0.2, -0.04, -0.17)],
		[Vector3(-0.1, -0.15, -0.2), Vector3(0, -0.16, -0.215), Vector3(0.1, -0.15, -0.2)]]
	_sheet(lp, back, Vector3(0, 0.0, 0))
	lp.tri(back[2][0], back[2][2], Vector3(0, -0.25, -0.215), CLOTH, Vector3(0, -0.2, 0))
	for j in 3:   # fringe at the point
		lp.block(Vector3(-0.016 + 0.016 * j, -0.265, -0.215), Vector3(0.007, 0.03, 0.007), 0.0, 0.0, CLOTH)
	# the right end thrown back over the shoulder, then down the back
	lp.xf = Transform3D(Basis(Vector3.BACK, 0.35) * Basis(Vector3.RIGHT, 0.15), Vector3(-0.2, -0.04, -0.03))
	lp.block(Vector3.ZERO, Vector3(0.12, 0.014, 0.13), 0.004, 0.003, CLOTH)
	lp.xf = Transform3D(Basis(Vector3.RIGHT, 0.2), Vector3(-0.16, -0.13, -0.22))
	lp.block(Vector3.ZERO, Vector3(0.1, 0.16, 0.014), 0.004, 0.003, CLOTH)
	lp.xf = Transform3D.IDENTITY
	return lp.commit()


## a thin sheet of cloth through a grid of points (rows of equal length)
func _sheet(lp: LP, grid: Array, inside: Vector3) -> void:
	for i in grid.size() - 1:
		for k in (grid[i] as Array).size() - 1:
			var a: Vector3 = grid[i][k]; var b: Vector3 = grid[i][k + 1]
			var c: Vector3 = grid[i + 1][k]; var d: Vector3 = grid[i + 1][k + 1]
			var ins := Vector3(inside.x, (a.y + c.y) / 2.0, inside.z)
			lp.tri(a, b, d, CLOTH, ins); lp.tri(a, d, c, CLOTH, ins)


## the hanging end of the shemagh: beside the face (0), then lying on the chest (1)
func _flap_mesh(k: int) -> ArrayMesh:
	var lp := _lp(20 + k)
	if k == 0:
		lp.xf = Transform3D(Basis(Vector3.UP, 0.35), Vector3.ZERO)   # turned to follow the shoulder
		lp.block(Vector3(-0.02, -0.085, 0), Vector3(0.12, 0.18, 0.014), 0.004, 0.003, CLOTH)
		lp.xf = Transform3D.IDENTITY
	else:
		lp.block(Vector3(0, -0.07, 0), Vector3(0.095, 0.15, 0.016), 0.005, 0.004, CLOTH)
		for j in 4:   # the fringe: short white threads
			lp.block(Vector3(-0.036 + 0.024 * j, -0.158, 0), Vector3(0.008, 0.03, 0.008), 0.0, 0.0, CLOTH)
	return lp.commit()


static var _shemagh_mat: StandardMaterial3D

## the shemagh's cloth: a small red-and-white check texture made here in code (with mipmaps so
## it stays calm in the headset), wrapped over the cloth by triplanar mapping; the faceted
## shading still comes from the vertex colours. Both sides drawn (it is a thin sheet).
static func shemagh_material() -> StandardMaterial3D:
	if _shemagh_mat: return _shemagh_mat
	var img := Image.create(32, 32, false, Image.FORMAT_RGB8)
	for y in 32:
		for x in 32:
			var cx := x % 8; var cy := y % 8
			var c := WHITE if (cx < 2 or cy < 2) else RED
			if cx == 5 and cy == 5: c = Color(0.9, 0.55, 0.55)   # woven fleck in each red square
			img.set_pixel(x, y, c)
	img.generate_mipmaps()
	var m := StandardMaterial3D.new()
	m.vertex_color_use_as_albedo = true
	m.albedo_texture = ImageTexture.create_from_image(img)
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	m.uv1_triplanar = true
	m.uv1_scale = Vector3.ONE * 13.0
	m.roughness = 1.0
	m.metallic_specular = 0.1
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	_shemagh_mat = m
	return m


## a faceted ring (the iqal cords) in the xz plane
func _ring(lp: LP, rx: float, rz: float, t: float, n: int, cl: Color) -> void:
	for k in n:
		var a0 := TAU * k / n; var a1 := TAU * (k + 1) / n
		var p0 := Vector3(cos(a0) * rx, 0, sin(a0) * rz); var p1 := Vector3(cos(a1) * rx, 0, sin(a1) * rz)
		var mid := (p0 + p1) / 2.0
		var save := lp.xf
		lp.xf = save * Transform3D(Basis(Vector3.UP, -atan2(p1.z - p0.z, p1.x - p0.x)), mid)
		lp.block(Vector3.ZERO, Vector3(p0.distance_to(p1) + t * 0.6, t * 1.4, t * 1.4), 0.0, 0.0, cl)
		lp.xf = save


func _face_parts() -> void:
	for s in [-1, 1]:
		var e := Node3D.new()
		e.position = HC + Vector3(0.062 * s, 0.015, 0.152)
		head.add_child(e)
		var lp := _lp(30)
		lp.blob(Vector3.ZERO, Vector3(0.03, 0.038, 0.014), 0.05, EYE)
		lp.blob(Vector3(0.01, 0.013, 0.012), Vector3(0.009, 0.009, 0.004), 0.0, WHITE)
		e.add_child(_mesh(lp.commit()))
		lp = _lp(31)   # happy: an upturned arc ^
		for t in [-1, 1]:
			lp.xf = Transform3D(Basis(Vector3.BACK, -0.6 * t), Vector3(0.014 * t, 0.004, 0))
			lp.block(Vector3.ZERO, Vector3(0.034, 0.011, 0.012), 0.003, 0.0, EYE)
		e.add_child(_mesh(lp.commit()))
		lp = _lp(32)   # closed: a gentle line
		lp.block(Vector3.ZERO, Vector3(0.05, 0.01, 0.012), 0.003, 0.0, EYE)
		e.add_child(_mesh(lp.commit()))
		eyes.append(e)
		var b := Node3D.new()
		b.position = HC + Vector3(0.064 * s, 0.07, 0.15)
		head.add_child(b)
		lp = _lp(33)
		lp.block(Vector3.ZERO, Vector3(0.062, 0.022, 0.03), 0.008, 0.004, BEARD)
		b.add_child(_mesh(lp.commit()))
		brows.append(b)
	mouth = Node3D.new()
	mouth.position = HC + Vector3(0, -0.082, 0.158)
	head.add_child(mouth)
	var lp := _lp(40)   # smile: a small curve
	for t in [-1, 0, 1]:
		lp.xf = Transform3D(Basis(Vector3.BACK, 0.45 * t), Vector3(0.016 * t, 0.006 * absf(t), 0))
		lp.block(Vector3.ZERO, Vector3(0.02, 0.01, 0.012), 0.003, 0.0, MOUTH)
	mouth.add_child(_mesh(lp.commit()))
	lp = _lp(41)   # open: an O
	lp.blob(Vector3(0, -0.006, 0), Vector3(0.022, 0.026, 0.01), 0.05, MOUTH)
	mouth.add_child(_mesh(lp.commit()))
	lp = _lp(42)   # worried: a downturned curve
	for t in [-1, 0, 1]:
		lp.xf = Transform3D(Basis(Vector3.BACK, -0.45 * t), Vector3(0.016 * t, -0.006 * absf(t), 0))
		lp.block(Vector3.ZERO, Vector3(0.02, 0.01, 0.012), 0.003, 0.0, MOUTH)
	mouth.add_child(_mesh(lp.commit()))
	lp = _lp(43)   # small: a short line
	lp.block(Vector3.ZERO, Vector3(0.03, 0.009, 0.012), 0.003, 0.0, MOUTH)
	mouth.add_child(_mesh(lp.commit()))


func _arm(s: int) -> Node3D:
	var p := Node3D.new()
	p.position = Vector3(0.17 * s, 0.43, 0.0)
	body.add_child(p)
	var lp := _lp(50 + s)
	lp.xf = Transform3D(Basis(Vector3.BACK, 0.12 * s), Vector3.ZERO)
	var rings := []
	for r in [[-0.21, 0.068], [-0.1, 0.055], [0.0, 0.047]]:
		rings.append([r[0], LP.circle(6, r[1], r[1])])
	lp.loft(rings, BISHT)
	lp.cyl(Vector3(0, -0.215, 0), 0.04, 0.042, 0.02, 6, WHITE)   # thobe cuff
	lp.blob(Vector3(0, -0.24, 0.01), Vector3(0.04, 0.04, 0.04), 0.1, SKIN)
	if s == 1:   # the cane, held in the right hand
		lp.xf = Transform3D.IDENTITY
		var hand := Vector3(0.12 * 0.24 * s, -0.24, 0.02)
		lp.cyl(hand + Vector3(0, -0.2, 0.0), 0.014, 0.014, 0.32, 5, CANE)
		lp.xf = Transform3D(Basis(Vector3.RIGHT, 0.0), hand + Vector3(0, 0.12, 0.0))
		for k in 4:   # the crook
			var a := PI * k / 3.0
			lp.block(Vector3(0, sin(a) * 0.035, -cos(a) * 0.035 + 0.035), Vector3(0.026, 0.026, 0.03), 0.006, 0.0, CANE)
		lp.xf = Transform3D.IDENTITY
	p.add_child(_mesh(lp.commit()))
	return p


func _foot(s: int) -> Node3D:
	var lp := _lp(60 + s)
	lp.block(Vector3(0, 0.02, 0.02), Vector3(0.075, 0.04, 0.13), 0.012, 0.004, SANDAL)
	lp.block(Vector3(0, 0.045, 0.04), Vector3(0.06, 0.03, 0.07), 0.01, 0.003, SKIN)
	var mi := _mesh(lp.commit())
	var f := Node3D.new()
	f.position = Vector3(0.07 * s, 0, 0.02)
	f.add_child(mi)
	add_child(f)
	return f


# ---------------- behaviour ----------------

func play(name: String) -> void:
	if name == anim and (name == "idle" or name == "walk" or name == "hop" or name == "cheer"):
		return
	anim = name
	_anim_t = 0.0
	match name:
		"bump": expr("surprise", 0.9)
		"cheer": expr("joy", 0.0)
		"land": _pop = 0.6


func expr(name: String, seconds: float) -> void:
	if ghost:
		return
	if name != _expr: _pop = 1.0
	_expr = name
	_expr_t = seconds
	_apply_expr()


func _apply_expr() -> void:
	var e := _expr
	if e == "calm" and worry > 0.5: e = "worry"
	var eye_mode := 0   # open
	if ghost: eye_mode = 2
	elif e == "smile" or e == "joy": eye_mode = 1
	for eye in eyes:
		for i in 3:
			(eye.get_child(i) as Node3D).visible = i == eye_mode
	var m := {"calm": 0, "smile": 0, "surprise": 1, "worry": 2, "joy": 1}.get(e, 0) as int
	if ghost: m = 3
	for i in 4:
		(mouth.get_child(i) as Node3D).visible = i == m
	for k in 2:
		var s := -1.0 if k == 0 else 1.0
		var b: Node3D = brows[k]
		match e:
			"surprise", "joy":
				b.position.y = HC.y + 0.09; b.rotation.z = 0.0
			"worry":
				b.position.y = HC.y + 0.075; b.rotation.z = 0.35 * s
			_:
				b.position.y = HC.y + 0.07; b.rotation.z = -0.08 * s


func _process(dt: float) -> void:
	_t += dt
	_anim_t += dt
	if _expr_t > 0.0:
		_expr_t -= dt
		if _expr_t <= 0.0: expr("calm", 0.0)
	# blink (open eyes only)
	_blink -= dt
	if _blink <= 0.0:
		_blink = randf_range(2.2, 5.0)
		_blink_t = 0.13
	_blink_t = maxf(0.0, _blink_t - dt)
	_pop = maxf(0.0, _pop - dt * 4.0)
	if (worry > 0.5) != _worried:
		_worried = worry > 0.5
		_apply_expr()
	var open_scale := 1.35 if _expr == "surprise" else 1.0
	for eye in eyes:
		var sy := 0.12 if _blink_t > 0.0 else open_scale
		(eye as Node3D).scale = Vector3(open_scale, sy, 1.0) * (1.0 + _pop * 0.15)
	mouth.scale = Vector3.ONE * (1.0 + _pop * 0.25)
	# motion since last frame (the board moves the whole figure)
	var gp := global_position
	var vel := (gp - _last_pos) / maxf(dt, 0.0001)
	_last_pos = gp
	var local_v := global_basis.inverse() * vel
	var sc: float = global_basis.get_scale().x
	if sc > 0.0: local_v /= sc
	match anim:
		"walk", "hop": _walk(dt)
		"bump": _bump()
		"cheer": _cheer()
		_: _idle()
	_tail_physics(dt, local_v)


func _idle() -> void:
	var br := sin(_t * 1.7)
	body.position = Vector3.ZERO
	body.scale = Vector3(1.0 - br * 0.008, 1.0 + br * 0.012, 1.0 - br * 0.008) * _squash()
	body.rotation = Vector3(0, 0, 0)
	head.rotation = Vector3(sin(_t * 0.9) * 0.04 - 0.03, sin(_t * 0.45) * 0.12, sin(_t * 0.7) * 0.03)
	arm_l.rotation = Vector3(sin(_t * 1.7) * 0.03, 0, -0.12)
	arm_r.rotation = Vector3(-0.15 + sin(_t * 1.7 + 0.5) * 0.03, 0, 0.1)
	foot_l.position = Vector3(-0.07, 0, 0.02); foot_r.position = Vector3(0.07, 0, 0.02)


func _walk(dt: float) -> void:
	_phase += dt * TAU * 3.2
	var s := sin(_phase)
	body.position = Vector3(0, absf(cos(_phase)) * 0.015, 0)
	body.rotation = Vector3(0.08, 0, s * 0.06)
	body.scale = Vector3.ONE * _squash()
	head.rotation = Vector3(-0.05, -s * 0.05, -s * 0.04)
	arm_l.rotation = Vector3(-s * 0.45, 0, -0.15)
	arm_r.rotation = Vector3(s * 0.3 - 0.2, 0, 0.12)
	foot_l.position = Vector3(-0.07, maxf(0.0, s) * 0.04, 0.02 + s * 0.06)
	foot_r.position = Vector3(0.07, maxf(0.0, -s) * 0.04, 0.02 - s * 0.06)


func _bump() -> void:
	var k := clampf(_anim_t / 0.35, 0.0, 1.0)
	var hit := sin(k * PI)
	body.position = Vector3.ZERO
	body.rotation = Vector3(-0.25 * hit, 0, 0)
	body.scale = Vector3(1.0 + hit * 0.1, 1.0 - hit * 0.12, 1.0 + hit * 0.1)
	head.rotation = Vector3(-0.2 * hit, sin(_anim_t * 30.0) * 0.08 * (1.0 - k), 0)
	arm_l.rotation = Vector3(-0.9 * hit, 0, -0.5 * hit - 0.12)
	arm_r.rotation = Vector3(-0.6 * hit - 0.15, 0, 0.3 * hit + 0.1)
	if k >= 1.0: anim = "idle"


func _cheer() -> void:
	var j := absf(sin(_anim_t * 6.0))
	body.position = Vector3(0, j * 0.12, 0)
	body.rotation = Vector3(-0.08, 0, 0)
	body.scale = Vector3(1.0 - j * 0.04, 1.0 + j * 0.06, 1.0 - j * 0.04)
	head.rotation = Vector3(-0.2, sin(_anim_t * 3.0) * 0.15, 0)
	arm_r.rotation = Vector3(-2.5 + sin(_anim_t * 12.0) * 0.25, 0, 0.25)   # cane raised, waving
	arm_l.rotation = Vector3(-0.3, 0, -0.6 - j * 0.2)
	foot_l.position = Vector3(-0.07, 0, 0.02); foot_r.position = Vector3(0.07, 0, 0.02)


func _squash() -> float:
	return 1.0 + _pop * 0.03


## the shemagh tail lags behind the motion and settles with a spring
func _tail_physics(dt: float, v: Vector3) -> void:
	var target := Vector2(clampf(v.z * 0.5, -1.0, 1.0), clampf(-v.x * 0.5, -0.8, 0.8))
	target += Vector2(sin(_t * 1.3) * 0.05, sin(_t * 0.9) * 0.05)
	if anim == "cheer": target += Vector2(sin(_anim_t * 6.0) * 0.4, 0)
	_tail_v += ((target - _tail_a) * 60.0 - _tail_v * 7.0) * dt
	_tail_a += _tail_v * dt
	if tail.size() == 2:
		(tail[0] as Node3D).rotation = Vector3(-0.12 + _tail_a.x * 0.35, 0, _tail_a.y * 0.3)
		(tail[1] as Node3D).rotation = Vector3(0.05 + _tail_a.x * 0.3, 0, _tail_a.y * 0.25)

extends Node3D
## The hero (since Quest 0.8.0): a small, round fox cub built in code in the low-poly faceted
## style, after the user's reference sheet: orange coat, cream cheeks, chest and big tail tip,
## dark brown legs and ear backs, warm amber eyes.
## Big head and eyes so it reads from above at table size; ears and the big fluffy tail carry
## the mood. Faces +z, about 0.8 cells tall to the ear tips. All motion is procedural:
##   play("idle" | "walk" | "hop" | "bump" | "land" | "cheer")
##   expr("calm" | "smile" | "surprise" | "worry" | "joy", seconds)  (0 s = keep)
## Echoes (ghost = true) are the same cub, see-through blue, eyes closed.

const LP = preload("res://game/lowpoly/lp.gd")

const ORANGE := Color(0.91, 0.48, 0.20)
const ORANGE_DK := Color(0.78, 0.37, 0.15)
const WHITE := Color(0.97, 0.92, 0.84)     # cream white: chest, cheeks, tail tip
const CREAM := Color(0.93, 0.84, 0.72)     # inside the ears
const DARK := Color(0.33, 0.22, 0.18)      # legs, ear backs
const PAW := Color(0.27, 0.18, 0.15)
const EYE := Color(0.10, 0.07, 0.06)
const IRIS := Color(0.82, 0.52, 0.14)      # warm amber-gold eyes
const BROW := Color(0.36, 0.22, 0.16)
const NOSE := Color(0.13, 0.09, 0.08)
const MOUTH := Color(0.30, 0.14, 0.12)
const BLUSH := Color(1.0, 0.62, 0.55)

const HEAD := Vector3(0, 0.46, 0.19)   # head pivot (neck), in the body's space
const HC := Vector3(0, 0.07, 0.02)     # head centre, in the head pivot's space
const HR := Vector3(0.14, 0.125, 0.13)

var ghost := false
var ghost_mat: Material

var body: Node3D
var head: Node3D
var ears: Array = []        # [left, right] pivots
var legs: Array = []        # [front-left, front-right, back-left, back-right] pivots
var tail: Array = []        # tail segments (Node3D), a spring chain
var eyes: Array = []        # children 0 open / 1 happy / 2 closed
var brows: Array = []
var mouth: Node3D           # children 0 smile / 1 open / 2 worried / 3 small

var anim := "idle"
var worry := 0.0
var _worried := false
var _t := 0.0
var _phase := 0.0
var _anim_t := 0.0
var _expr := "calm"
var _expr_t := 0.0
var _blink := 2.0
var _blink_t := 0.0
var _pop := 0.0
var _twitch := 3.0
var _twitch_t := 0.0
var _tail_v := Vector2.ZERO
var _tail_a := Vector2.ZERO
var _last_pos := Vector3.ZERO


func build(as_ghost: bool, ghost_material: Material = null) -> void:
	ghost = as_ghost
	ghost_mat = ghost_material
	body = Node3D.new(); add_child(body)
	body.add_child(_mesh(_body_mesh()))
	for i in 4:
		legs.append(_leg(i))
	head = Node3D.new(); head.position = HEAD; body.add_child(head)
	head.add_child(_mesh(_head_mesh()))
	for s in [-1, 1]:
		var e := Node3D.new()
		e.position = HC + Vector3(0.07 * s, 0.08, -0.015)
		e.rotation = Vector3(0, 0, -0.2 * s)
		e.add_child(_mesh(_ear_mesh()))
		head.add_child(e)
		ears.append(e)
	_face_parts()
	var parent: Node3D = body
	for k in 3:   # the tail: three fluffy segments, the last with the white tip
		var seg := Node3D.new()
		seg.position = Vector3(0, 0.32, -0.2) if k == 0 else Vector3(0, 0.0, -0.12)
		seg.rotation.x = [0.75, 0.25, 0.15][k]   # rest pose: curled up behind
		seg.add_child(_mesh(_tail_mesh(k)))
		parent.add_child(seg); tail.append(seg); parent = seg
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
	lp.ao_low = -0.02; lp.ao_high = 0.75; lp.ao_min = 0.8; lp.shade_jitter = 0.03
	return lp


# ---------------- parts ----------------

func _body_mesh() -> ArrayMesh:
	var lp := _lp(1)
	# the torso lofted from the rump (back) to the chest (front): deep chest, slim waist
	# rings: [z, half-width, half-height, centre height]
	var rings := [[-0.24, 0.02, 0.02, 0.3], [-0.21, 0.075, 0.08, 0.3], [-0.14, 0.1, 0.1, 0.295],
		[-0.03, 0.085, 0.09, 0.29], [0.07, 0.095, 0.11, 0.3], [0.15, 0.09, 0.115, 0.32], [0.2, 0.05, 0.07, 0.34]]
	var n := 8
	for i in rings.size() - 1:
		var a: Array = rings[i]; var b: Array = rings[i + 1]
		for k in n:
			var k2 := (k + 1) % n
			var p := func(r: Array, kk: int) -> Vector3:
				var t := TAU * kk / n + PI / n
				return Vector3(cos(t) * (r[1] as float), (r[3] as float) + sin(t) * (r[2] as float), r[0])
			var ins := Vector3(0, ((a[3] as float) + (b[3] as float)) / 2.0, ((a[0] as float) + (b[0] as float)) / 2.0)
			var col := func(ctr: Vector3, nm: Vector3) -> Color:
				return WHITE if (ctr.z > 0.04 and nm.z > 0.25 and ctr.y < 0.39) or (nm.y < -0.6 and ctr.z > -0.02) else ORANGE
			lp.tri(p.call(a, k), p.call(a, k2), p.call(b, k2), col, ins)
			lp.tri(p.call(a, k), p.call(b, k2), p.call(b, k), col, ins)
	# neck up into the head, with the cream bib down the front
	lp.blob(Vector3(0, 0.38, 0.16), Vector3(0.075, 0.09, 0.075), 0.04, ORANGE, 1)
	lp.blob(Vector3(0, 0.34, 0.2), Vector3(0.06, 0.08, 0.04), 0.04, WHITE, 1)
	return lp.commit()


func _leg(i: int) -> Node3D:
	var front := i < 2
	var s := -1.0 if i % 2 == 0 else 1.0
	var p := Node3D.new()
	p.position = Vector3(0.055 * s, 0.25, 0.12) if front else Vector3(0.065 * s, 0.27, -0.16)
	body.add_child(p)
	var lp := _lp(10 + i)
	if front:
		_limb(lp, Vector3(0, 0.02, 0), Vector3(0, -0.11, 0.005), 0.038, 0.031, ORANGE)
		_limb(lp, Vector3(0, -0.11, 0.005), Vector3(0, -0.23, 0.0), 0.031, 0.027, DARK)
	else:
		# haunch, thigh angled back, shin angled forward: the fox's hind leg
		lp.blob(Vector3(0.008 * s, 0.0, 0.0), Vector3(0.055, 0.075, 0.075), 0.04, ORANGE, 1)
		_limb(lp, Vector3(0, -0.02, 0.01), Vector3(0, -0.12, -0.04), 0.042, 0.031, ORANGE)
		_limb(lp, Vector3(0, -0.12, -0.04), Vector3(0, -0.25, 0.0), 0.029, 0.025, DARK)
	lp.blob(Vector3(0, -0.24 if front else -0.255, 0.022), Vector3(0.036, 0.022, 0.05), 0.05, PAW, 1)
	p.add_child(_mesh(lp.commit()))
	return p


## a tapered 6-sided limb from a to b
func _limb(lp: LP, a: Vector3, b: Vector3, r0: float, r1: float, cl: Color) -> void:
	var d := b - a
	var up := d.normalized()
	var side := up.cross(Vector3.FORWARD if absf(up.z) < 0.9 else Vector3.RIGHT).normalized()
	lp.xf = Transform3D(Basis(side, up, side.cross(up)), a)
	lp.cyl(Vector3.ZERO, r0, r1, d.length(), 6, cl)
	lp.blob(Vector3(0, d.length(), 0), Vector3.ONE * r1 * 1.05, 0.0, cl)   # round joint
	lp.xf = Transform3D.IDENTITY


func _head_mesh() -> ArrayMesh:
	var lp := _lp(2)
	lp.blob(HC, HR, 0.03, func(ctr: Vector3, nm: Vector3) -> Color:
		return WHITE if (ctr.y < HC.y - 0.035 and nm.z > -0.2) else ORANGE, 2)
	# cream cheeks with pointed fluff, sweeping back and down
	for s in [-1, 1]:
		lp.xf = Transform3D(Basis(Vector3.UP, 0.9 * s) * Basis(Vector3.BACK, -1.9 * s), HC + Vector3(0.12 * s, -0.075, 0.0))
		lp.cyl(Vector3.ZERO, 0.022, 0.0, 0.05, 4, WHITE)
		lp.xf = Transform3D.IDENTITY

	# the snout: a tapered cone, orange on top, cream underneath, black nose at the tip
	var axis_y := HC.y - 0.03
	lp.xf = Transform3D(Basis(Vector3.RIGHT, PI / 2), HC + Vector3(0, -0.03, 0.06))
	lp.cyl(Vector3.ZERO, 0.066, 0.018, 0.185, 7, func(ctr: Vector3, _n: Vector3) -> Color:
		return WHITE if ctr.y < axis_y - 0.005 else ORANGE)
	lp.xf = Transform3D.IDENTITY
	lp.blob(HC + Vector3(0, -0.027, 0.25), Vector3(0.024, 0.018, 0.016), 0.05, NOSE)
	return lp.commit()


func _ear_mesh() -> ArrayMesh:
	var lp := _lp(3)
	# a tall faceted pyramid: orange front edges, dark back and tip, cream inside
	# the base sits deep inside the head (y < 0), so the ear grows out of the skull
	var base := [Vector3(-0.06, -0.07, 0.01), Vector3(0.06, -0.07, 0.01), Vector3(0, -0.07, -0.05)]
	var tip := Vector3(0, 0.2, -0.015)
	var mid := [Vector3(-0.032, 0.13, 0.0), Vector3(0.032, 0.13, 0.0), Vector3(0, 0.13, -0.03)]
	var ins := Vector3(0, 0.07, -0.02)
	var side := func(ctr: Vector3, n: Vector3) -> Color: return DARK if n.z < -0.2 else ORANGE
	for k in 3:
		var k2 := (k + 1) % 3
		lp.tri(base[k], base[k2], mid[k2], side, ins); lp.tri(base[k], mid[k2], mid[k], side, ins)
		lp.tri(mid[k], mid[k2], tip, DARK, ins)
	lp.tri(Vector3(-0.05, 0.02, 0.012), Vector3(0.05, 0.02, 0.012), Vector3(0, 0.16, 0.008), CREAM, Vector3(0, 0.07, -0.05))
	lp.tri(Vector3(-0.03, 0.02, 0.016), Vector3(0.03, 0.02, 0.016), Vector3(0, 0.1, 0.012), WHITE, Vector3(0, 0.07, -0.05))
	return lp.commit()


func _tail_mesh(k: int) -> ArrayMesh:
	var lp := _lp(20 + k)
	var r: float = [0.085, 0.12, 0.115][k]
	if k < 2:
		lp.blob(Vector3(0, 0.03, -0.07), Vector3(r * 0.85, r, r * 1.2), 0.12, ORANGE, 1)
	else:   # the big cream tip
		lp.blob(Vector3(0, 0.03, -0.05), Vector3(r * 0.8, r * 0.85, r * 0.9), 0.12, ORANGE, 0)
		lp.blob(Vector3(0, 0.04, -0.12), Vector3(r * 0.85, r * 0.9, r * 0.95), 0.12, WHITE, 1)
	return lp.commit()


func _face_parts() -> void:
	for s in [-1, 1]:
		var e := Node3D.new()
		e.position = HC + Vector3(0.06 * s, 0.025, 0.115)
		e.rotation = Vector3(0, 0.38 * s, 0.12 * s)
		head.add_child(e)
		var lp := _lp(30)   # open: amber iris, dark pupil, two highlights
		lp.blob(Vector3.ZERO, Vector3(0.03, 0.036, 0.014), 0.03, EYE, 1)
		lp.blob(Vector3(0.0, -0.004, 0.006), Vector3(0.024, 0.028, 0.012), 0.03, IRIS, 1)
		lp.blob(Vector3(0.0, -0.002, 0.012), Vector3(0.014, 0.019, 0.008), 0.03, EYE)
		lp.blob(Vector3(0.011, 0.014, 0.016), Vector3(0.009, 0.009, 0.004), 0.0, Color.WHITE)
		lp.blob(Vector3(-0.01, -0.014, 0.015), Vector3(0.005, 0.005, 0.003), 0.0, Color.WHITE)
		e.add_child(_mesh(lp.commit()))
		lp = _lp(31)   # happy: an upturned arc ^
		for t in [-1, 1]:
			lp.xf = Transform3D(Basis(Vector3.BACK, -0.6 * t), Vector3(0.015 * t, 0.004, 0))
			lp.block(Vector3.ZERO, Vector3(0.036, 0.011, 0.012), 0.003, 0.0, EYE)
		e.add_child(_mesh(lp.commit()))
		lp = _lp(32)   # closed: a soft curve
		for t in [-1, 1]:
			lp.xf = Transform3D(Basis(Vector3.BACK, 0.3 * t), Vector3(0.016 * t, 0.0, 0))
			lp.block(Vector3.ZERO, Vector3(0.034, 0.01, 0.012), 0.003, 0.0, EYE)
		e.add_child(_mesh(lp.commit()))
		eyes.append(e)
		var b := Node3D.new()
		b.position = HC + Vector3(0.06 * s, 0.075, 0.112)
		b.rotation.y = 0.38 * s
		head.add_child(b)
		lp = _lp(33)
		lp.block(Vector3.ZERO, Vector3(0.04, 0.01, 0.012), 0.003, 0.0, BROW)
		b.add_child(_mesh(lp.commit()))
		brows.append(b)
	mouth = Node3D.new()
	mouth.position = HC + Vector3(0, -0.068, 0.215)
	head.add_child(mouth)
	var lp := _lp(40)   # smile: a little "w"
	for t in [-1, 1]:
		for u in [-1, 1]:
			lp.xf = Transform3D(Basis(Vector3.BACK, 0.5 * u), Vector3(0.012 * t + 0.006 * u, 0.0, 0))
			lp.block(Vector3.ZERO, Vector3(0.016, 0.008, 0.01), 0.002, 0.0, MOUTH)
	mouth.add_child(_mesh(lp.commit()))
	lp = _lp(41)   # open
	lp.blob(Vector3(0, -0.008, 0), Vector3(0.022, 0.024, 0.01), 0.05, MOUTH)
	lp.blob(Vector3(0, -0.018, 0.004), Vector3(0.012, 0.008, 0.006), 0.0, BLUSH)      # tongue
	mouth.add_child(_mesh(lp.commit()))
	lp = _lp(42)   # worried: a small wobble
	for t in [-1, 0, 1]:
		lp.xf = Transform3D(Basis(Vector3.BACK, 0.5 * (1 if t != 0 else 0) * -t), Vector3(0.012 * t, -0.004 * absf(t), 0))
		lp.block(Vector3.ZERO, Vector3(0.014, 0.008, 0.01), 0.002, 0.0, MOUTH)
	mouth.add_child(_mesh(lp.commit()))
	lp = _lp(43)   # small: a dot
	lp.blob(Vector3.ZERO, Vector3(0.008, 0.006, 0.006), 0.0, MOUTH)
	mouth.add_child(_mesh(lp.commit()))


## a faceted ring in the xz plane (the collar)
func _ring(lp: LP, rx: float, rz: float, t: float, n: int, cl: Color) -> void:
	for k in n:
		var a0 := TAU * k / n; var a1 := TAU * (k + 1) / n
		var p0 := Vector3(cos(a0) * rx, 0, sin(a0) * rz); var p1 := Vector3(cos(a1) * rx, 0, sin(a1) * rz)
		var save := lp.xf
		lp.xf = save * Transform3D(Basis(Vector3.UP, -atan2(p1.z - p0.z, p1.x - p0.x)), (p0 + p1) / 2.0)
		lp.block(Vector3.ZERO, Vector3(p0.distance_to(p1) + t * 0.5, t, t * 1.2), 0.0, 0.0, cl)
		lp.xf = save


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


func _mood() -> String:
	return "worry" if (_expr == "calm" and worry > 0.5) else _expr


func _apply_expr() -> void:
	var e := _mood()
	var eye_mode := 0
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
		b.position.y = HC.y + (0.09 if e in ["surprise", "joy"] else 0.075)
		b.rotation.z = (-0.4 * s) if e == "worry" else ((-0.15 * s) if e == "surprise" else -0.12 * s)


func _process(dt: float) -> void:
	_t += dt
	_anim_t += dt
	if _expr_t > 0.0:
		_expr_t -= dt
		if _expr_t <= 0.0: expr("calm", 0.0)
	if (worry > 0.5) != _worried:
		_worried = worry > 0.5
		_apply_expr()
	_blink -= dt
	if _blink <= 0.0:
		_blink = randf_range(2.2, 5.0); _blink_t = 0.12
	_blink_t = maxf(0.0, _blink_t - dt)
	_pop = maxf(0.0, _pop - dt * 4.0)
	var open_scale := 1.3 if _expr == "surprise" else 1.0
	for eye in eyes:
		(eye as Node3D).scale = Vector3(open_scale, 0.12 if _blink_t > 0.0 else open_scale, 1.0) * (1.0 + _pop * 0.15)
	mouth.scale = Vector3.ONE * (1.0 + _pop * 0.25)
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
	_ears(dt)
	_tail_physics(dt, local_v)


func _legs_rest() -> void:
	for l in legs: (l as Node3D).rotation = Vector3.ZERO


func _idle() -> void:
	var br := sin(_t * 2.0)
	body.position = Vector3.ZERO
	body.rotation = Vector3.ZERO
	body.scale = Vector3(1.0 - br * 0.01, 1.0 + br * 0.015, 1.0) * (1.0 + _pop * 0.03)
	head.rotation = Vector3(sin(_t * 0.9) * 0.04, sin(_t * 0.45) * 0.15, sin(_t * 0.6) * 0.12)   # curious head tilt
	_legs_rest()


func _walk(dt: float) -> void:
	_phase += dt * TAU * 3.4
	var s := sin(_phase)
	body.position = Vector3(0, absf(cos(_phase)) * 0.025, 0)
	body.rotation = Vector3(0.04 * cos(_phase * 2.0), 0, s * 0.05)
	body.scale = Vector3.ONE
	head.rotation = Vector3(-0.05, -s * 0.06, -s * 0.05)
	# trot: diagonal pairs move together
	(legs[0] as Node3D).rotation.x = s * 0.6
	(legs[3] as Node3D).rotation.x = s * 0.6
	(legs[1] as Node3D).rotation.x = -s * 0.6
	(legs[2] as Node3D).rotation.x = -s * 0.6


func _bump() -> void:
	var k := clampf(_anim_t / 0.35, 0.0, 1.0)
	var hit := sin(k * PI)
	body.position = Vector3(0, 0, -0.03 * hit)
	body.rotation = Vector3(-0.2 * hit, 0, 0)
	body.scale = Vector3(1.0 + hit * 0.12, 1.0 - hit * 0.14, 1.0 + hit * 0.1)
	head.rotation = Vector3(-0.15 * hit, sin(_anim_t * 30.0) * 0.1 * (1.0 - k), 0)
	_legs_rest()
	if k >= 1.0: anim = "idle"


func _cheer() -> void:
	var j := absf(sin(_anim_t * 6.5))
	body.position = Vector3(0, j * 0.14, 0)
	body.rotation = Vector3(-0.15 * j, sin(_anim_t * 3.0) * 0.3, 0)
	body.scale = Vector3(1.0 - j * 0.05, 1.0 + j * 0.08, 1.0 - j * 0.05)
	head.rotation = Vector3(-0.25, 0, sin(_anim_t * 6.5) * 0.15)
	for l in legs: (l as Node3D).rotation.x = -0.5 * j


## ears: perk up when surprised or happy, fold back when worried, twitch now and then
func _ears(dt: float) -> void:
	var e := _mood()
	var back := 0.0
	if e == "worry": back = 0.7
	elif e == "surprise": back = -0.25
	elif anim == "bump": back = 0.5
	_twitch -= dt
	if _twitch <= 0.0:
		_twitch = randf_range(2.0, 5.0); _twitch_t = 0.25
	_twitch_t = maxf(0.0, _twitch_t - dt)
	for k in 2:
		var s := -1.0 if k == 0 else 1.0
		var tw := sin(_twitch_t * 40.0) * 0.25 if (k == 1 and _twitch_t > 0.0) else 0.0
		var ear: Node3D = ears[k]
		ear.rotation.x = lerpf(ear.rotation.x, -back, minf(1.0, dt * 10.0))
		ear.rotation.z = -0.2 * s - (0.35 * s if e == "worry" else 0.0) + tw


## the tail lags behind the motion and settles with a spring; wags when happy
func _tail_physics(dt: float, v: Vector3) -> void:
	var target := Vector2(clampf(v.z * 0.6, -1.0, 1.0), clampf(-v.x * 0.6, -0.9, 0.9))
	target += Vector2(sin(_t * 1.3) * 0.06, sin(_t * 1.1) * 0.15)
	var e := _mood()
	if anim == "cheer" or e == "joy" or e == "smile": target.y += sin(_t * 14.0) * 0.6
	if e == "worry": target.x -= 0.5
	_tail_v += ((target - _tail_a) * 60.0 - _tail_v * 7.0) * dt
	_tail_a += _tail_v * dt
	if tail.size() == 3:
		(tail[0] as Node3D).rotation = Vector3(0.75 + _tail_a.x * 0.4, _tail_a.y * 0.5, 0)
		(tail[1] as Node3D).rotation = Vector3(0.25 + _tail_a.x * 0.3, _tail_a.y * 0.4, 0)
		(tail[2] as Node3D).rotation = Vector3(0.15 + _tail_a.x * 0.3, _tail_a.y * 0.4, 0)

extends Node3D
## Life around the room (Quest 1.1): wind streaks drifting over the board, birds perched on the walls
## that take off when the hero walks past, butterflies over little flower patches on the island rim,
## and a rabbit nibbling in the garden behind the room. Placed at random from the room's seed, so
## every room is different but the same room looks the same each visit. Board space (see board.gd):
## one cell = 1 unit, floor top at y = 0. Pure view: the rules never see any of this.
## Built in the same low-poly vertex-coloured style as env.gd; a few hundred triangles each.

const LP = preload("res://game/lowpoly/lp.gd")
const Env = preload("res://game/lowpoly/env.gd")

const PETALS := [Color(0.98, 0.55, 0.68), Color(0.99, 0.85, 0.35), Color(0.97, 0.96, 0.92), Color(0.72, 0.58, 0.95), Color(0.98, 0.62, 0.38)]
const WINGS := [Color(1.0, 0.72, 0.25), Color(0.55, 0.78, 1.0), Color(1.0, 0.95, 0.55), Color(0.95, 0.5, 0.75)]
const SCARE := 1.7          # cells: a bird takes off when the hero comes this close

var hero := Vector3(999, 0, 999)   # set every frame by the board (hero position, board space)
var _rng := RandomNumberGenerator.new()
var _R: Dictionary
var _top: PackedVector2Array
var _hw := 0.0
var _hh := 0.0
var _T := 0.0
var _birds := []       # {node, wings:[L,R], head, state, t, a, b, ctrl, dur, wait, face}
var _flies := []       # {node, wings, c, r, h, ph, sp}
var _rabbit := {}
var _streaks := []     # {mi, mat, p, v, life, age, len}
var _perches := []     # wall-top spots next to the floor (where birds sit)


func setup(R: Dictionary, top: PackedVector2Array, seed_: int) -> void:
	_R = R; _top = top
	_hw = R.W / 2.0; _hh = R.H / 2.0
	_rng.seed = seed_
	for y in R.H:
		for x in R.W:
			if R.wall[y * R.W + x] != 1: continue
			var near := false
			for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
				var q: Vector2i = Vector2i(x, y) + d
				if q.x >= 0 and q.y >= 0 and q.x < R.W and q.y < R.H and R.wall[q.y * R.W + q.x] == 0: near = true
			if near: _perches.append(_cell(x, y) + Vector3(0, Env.WALL_H + 0.02, 0))
	_flowers_and_butterflies()
	_make_birds()
	_make_rabbit()
	for k in 5: _streaks.append(_streak(true))


func _cell(x: int, y: int) -> Vector3:
	return Vector3(x - (_R.W - 1) / 2.0, 0, -(y - (_R.H - 1) / 2.0))


func _mi(m: Mesh) -> MeshInstance3D:
	var mi := MeshInstance3D.new(); mi.mesh = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi


## a free spot on the island rim (not on the room, not on the timeline strip in front)
func _rim_spot(margin: float, back_only := false) -> Variant:
	for _i in 60:
		var p := Vector3(_rng.randf_range(-_hw - 0.7, _hw + 0.7), -0.05, _rng.randf_range(-_hh - Env.GARDEN + 0.3, _hh + 0.5))
		if absf(p.x) < _hw + 0.15 and absf(p.z) < _hh + 0.15: continue
		if p.z > _hh + 0.2 and absf(p.x) < _hw: continue
		if back_only and p.z > -_hh - 0.4: continue
		if not Env._crown_fits(_top, p, margin): continue
		return p
	return null


# ---------------- flowers and butterflies ----------------

func _flowers_and_butterflies() -> void:
	var lp := LP.new(_rng.randi())
	lp.ao_min = 0.85
	var patches := []
	for k in _rng.randi_range(3, 5):
		var c = _rim_spot(0.3)
		if c == null: continue
		patches.append(c)
		var pc: Color = PETALS[_rng.randi() % PETALS.size()]
		for f in _rng.randi_range(4, 7):
			var a := _rng.randf_range(0, TAU); var d := _rng.randf_range(0.0, 0.3)
			var p: Vector3 = c + Vector3(cos(a) * d, 0, sin(a) * d)
			var h := _rng.randf_range(0.2, 0.36)
			lp.cyl(p, 0.012, 0.008, h, 3, Env.GRASS_DK)
			var top := p + Vector3(0, h, 0)
			for q in 5:   # five flat petals (2 triangles each, seen from above and below) around a yellow heart
				var qa := TAU * q / 5.0 + a
				var tip := top + Vector3(cos(qa) * 0.09, 0.02, sin(qa) * 0.09)
				var l := top + Vector3(cos(qa - 0.6) * 0.04, 0.006, sin(qa - 0.6) * 0.04)
				var r := top + Vector3(cos(qa + 0.6) * 0.04, 0.006, sin(qa + 0.6) * 0.04)
				lp.tri(top, l, tip, pc, top + Vector3(0, -1, 0)); lp.tri(top, tip, r, pc, top + Vector3(0, -1, 0))
				lp.tri(top, tip, l, pc.darkened(0.12), top + Vector3(0, 1, 0)); lp.tri(top, r, tip, pc.darkened(0.12), top + Vector3(0, 1, 0))
			lp.cyl(top + Vector3(0, 0.0, 0), 0.026, 0.016, 0.022, 5, Color(0.98, 0.78, 0.2))
			if f % 2 == 0: lp.blob(p + Vector3(0.03, 0.04, 0), Vector3(0.04, 0.012, 0.022), 0.1, Env.GRASS)   # a leaf
	add_child(_mi(lp.commit()))
	for i in mini(patches.size(), _rng.randi_range(2, 3)):
		var n := Node3D.new(); add_child(n); n.scale = Vector3.ONE * 2.2
		var col: Color = WINGS[_rng.randi() % WINGS.size()]
		var body := LP.new(1); body.blob(Vector3.ZERO, Vector3(0.012, 0.012, 0.05), 0.0, Color(0.2, 0.15, 0.12))
		n.add_child(_mi(body.commit()))
		var wings := []
		for sd in [-1, 1]:
			var w := LP.new(2)
			w.tri(Vector3(0, 0, -0.02), Vector3(sd * 0.09, 0, -0.06), Vector3(sd * 0.07, 0, 0.02), col, Vector3(0, -1, 0))
			w.tri(Vector3(0, 0, 0.0), Vector3(sd * 0.06, 0, 0.03), Vector3(sd * 0.03, 0, 0.07), col.darkened(0.15), Vector3(0, -1, 0))
			w.tri(Vector3(0, 0, -0.02), Vector3(sd * 0.07, 0, 0.02), Vector3(sd * 0.09, 0, -0.06), col, Vector3(0, 1, 0))   # both sides
			w.tri(Vector3(0, 0, 0.0), Vector3(sd * 0.03, 0, 0.07), Vector3(sd * 0.06, 0, 0.03), col.darkened(0.15), Vector3(0, 1, 0))
			var wm := _mi(w.commit()); n.add_child(wm); wings.append(wm)
		_flies.append({"node": n, "wings": wings, "c": patches[i] + Vector3(0, 0.45, 0), "r": _rng.randf_range(0.18, 0.35),
			"h": _rng.randf_range(0.05, 0.25), "ph": _rng.randf_range(0, TAU), "sp": _rng.randf_range(0.7, 1.1)})


# ---------------- birds ----------------

func _bird_mesh(n: Node3D) -> Dictionary:
	var body := LP.new(3)
	var plume: Color = [Color(0.32, 0.55, 0.92), Color(0.95, 0.72, 0.2), Color(0.86, 0.36, 0.3), Color(0.45, 0.36, 0.3)][_rng.randi() % 4]
	body.blob(Vector3(0, 0.07, 0), Vector3(0.06, 0.055, 0.085), 0.05, plume, 1)
	body.blob(Vector3(0, 0.055, 0.02), Vector3(0.045, 0.04, 0.05), 0.03, Color(0.93, 0.86, 0.74))      # pale belly
	body.tri(Vector3(-0.03, 0.08, -0.07), Vector3(0.03, 0.08, -0.07), Vector3(0, 0.1, -0.16), plume.darkened(0.2), Vector3(0, 0, 0))   # tail
	body.cyl(Vector3(-0.02, 0, 0.0), 0.004, 0.004, 0.03, 3, Color(0.85, 0.55, 0.2))   # legs
	body.cyl(Vector3(0.02, 0, 0.0), 0.004, 0.004, 0.03, 3, Color(0.85, 0.55, 0.2))
	n.add_child(_mi(body.commit()))
	var head := Node3D.new(); head.position = Vector3(0, 0.13, 0.06); n.add_child(head)
	var h := LP.new(4)
	h.blob(Vector3.ZERO, Vector3(0.04, 0.04, 0.042), 0.03, plume, 1)
	h.blob(Vector3(0.028, 0.012, 0.022), Vector3(0.008, 0.008, 0.008), 0.0, Color(0.05, 0.05, 0.05))
	h.blob(Vector3(-0.028, 0.012, 0.022), Vector3(0.008, 0.008, 0.008), 0.0, Color(0.05, 0.05, 0.05))
	var hm := _mi(h.commit()); head.add_child(hm)
	# the beak: a small cone turned forward
	var beak := LP.new(5); beak.cyl(Vector3.ZERO, 0.012, 0.0, 0.035, 4, Color(0.95, 0.68, 0.2))
	var bm := _mi(beak.commit()); bm.rotation.x = PI / 2; bm.position = Vector3(0, -0.005, 0.035); head.add_child(bm)
	var wings := []
	for sd in [-1, 1]:
		var piv := Node3D.new(); piv.position = Vector3(sd * 0.05, 0.09, 0.0); n.add_child(piv)
		var w := LP.new(6)
		w.tri(Vector3(0, 0, 0.05), Vector3(sd * 0.13, 0, -0.01), Vector3(0, 0, -0.06), plume.darkened(0.1), Vector3(0, -1, 0))
		w.tri(Vector3(0, 0, 0.05), Vector3(0, 0, -0.06), Vector3(sd * 0.13, 0, -0.01), plume.darkened(0.1), Vector3(0, 1, 0))
		var wm := _mi(w.commit()); piv.add_child(wm)
		piv.rotation.z = sd * 1.2   # folded against the body
		wings.append(piv)
	return {"head": head, "wings": wings}


func _make_birds() -> void:
	if _perches.is_empty(): return
	var spots := _perches.duplicate(); spots.shuffle()
	for i in mini(spots.size(), _rng.randi_range(2, 3)):
		var n := Node3D.new(); add_child(n)
		var parts := _bird_mesh(n)
		var b := {"node": n, "head": parts.head, "wings": parts.wings, "state": "sit", "t": 0.0, "wait": 0.0, "peck": _rng.randf_range(1, 4),
			"a": Vector3.ZERO, "b": spots[i], "ctrl": Vector3.ZERO, "dur": 1.0, "face": _rng.randf_range(0, TAU)}
		n.position = spots[i]; n.rotation.y = b.face; n.scale = Vector3.ONE * 2.0
		_birds.append(b)


func _away_from(p: Vector3, from: Vector3) -> Vector3:
	var d := p - from; d.y = 0
	if d.length() < 0.01: d = Vector3(_rng.randf_range(-1, 1), 0, -1)
	d = d.normalized()
	return p + d * 7.0 + Vector3(_rng.randf_range(-2, 2), _rng.randf_range(3.5, 5.0), _rng.randf_range(-2, 2))


func _update_birds(dt: float) -> void:
	for b in _birds:
		var n: Node3D = b.node
		match b.state:
			"sit":
				# peck and look around now and then
				b.peck -= dt
				var head: Node3D = b.head
				head.rotation.x = lerpf(head.rotation.x, 0.0, dt * 8.0)
				if b.peck < 0.0:
					b.peck = _rng.randf_range(1.2, 4.0)
					if _rng.randf() < 0.5: head.rotation.x = 0.7
					else: b.face += _rng.randf_range(-1.2, 1.2)
				n.rotation.y = lerp_angle(n.rotation.y, b.face, dt * 6.0)
				var d := Vector2(hero.x - n.position.x, hero.z - n.position.z).length()
				if d < SCARE:   # the hero comes close: off it goes, away from the hero
					b.state = "fly"; b.t = 0.0; b.a = n.position; b.b = _away_from(n.position, hero)
					b.ctrl = (b.a + b.b) / 2.0 + Vector3(0, 0.6, 0); b.dur = _rng.randf_range(1.6, 2.2)
			"fly", "land":
				b.t = minf(1.0, b.t + dt / b.dur)
				var k: float = b.t if b.state == "fly" else 1.0 - pow(1.0 - b.t, 2.0)
				if b.state == "fly": k = b.t * b.t * (2.0 - b.t)   # quick start
				var a: Vector3 = b.a; var c: Vector3 = b.ctrl; var e: Vector3 = b.b
				var p := a.lerp(c, k).lerp(c.lerp(e, k), k)
				var dir := p - n.position
				n.position = p
				if Vector2(dir.x, dir.z).length() > 0.001: n.rotation.y = atan2(dir.x, dir.z)
				var flap := sin(_T * 34.0) * 0.9
				for i in 2:
					(b.wings[i] as Node3D).rotation.z = (-1.0 if i == 0 else 1.0) * (0.15 + flap)
				if b.t >= 1.0:
					if b.state == "fly":
						b.state = "gone"; b.wait = _rng.randf_range(5.0, 11.0); n.visible = false
					else:
						b.state = "sit"; b.face = n.rotation.y
						for i in 2: (b.wings[i] as Node3D).rotation.z = (-1 if i == 0 else 1) * 1.2
			"gone":
				b.wait -= dt
				if b.wait <= 0.0:   # come back to a perch far from the hero
					var best = null; var far := -1.0
					for s in _perches:
						var dd := Vector2(hero.x - (s as Vector3).x, hero.z - (s as Vector3).z).length()
						if dd > SCARE + 0.8 and dd > far * 0.6 and _rng.randf() < 0.6: best = s; far = dd
					if best == null: b.wait = 2.0; continue
					b.state = "land"; b.t = 0.0; b.b = best; b.a = _away_from(best, best + Vector3(_rng.randf_range(-1, 1), 0, 1))
					b.ctrl = (b.a + b.b) / 2.0 + Vector3(0, 0.8, 0); b.dur = 2.2
					n.position = b.a; n.visible = true


# ---------------- rabbit ----------------

func _make_rabbit() -> void:
	var p = _rim_spot(0.25, true)
	if p == null: p = _rim_spot(0.25)
	if p == null: return
	var n := Node3D.new(); add_child(n); n.position = p; n.scale = Vector3.ONE * 1.8
	var fur := Color(0.78, 0.68, 0.58) if _rng.randf() < 0.6 else Color(0.92, 0.9, 0.86)
	var lp := LP.new(7)
	lp.blob(Vector3(0, 0.09, -0.02), Vector3(0.085, 0.08, 0.11), 0.04, fur, 1)          # body
	lp.blob(Vector3(0, 0.07, -0.13), Vector3(0.035, 0.035, 0.035), 0.0, Color(0.98, 0.97, 0.95))   # tail
	lp.blob(Vector3(-0.05, 0.03, 0.05), Vector3(0.03, 0.025, 0.05), 0.0, fur.darkened(0.1))
	lp.blob(Vector3(0.05, 0.03, 0.05), Vector3(0.03, 0.025, 0.05), 0.0, fur.darkened(0.1))
	n.add_child(_mi(lp.commit()))
	var head := Node3D.new(); head.position = Vector3(0, 0.17, 0.08); n.add_child(head)
	var h := LP.new(8)
	h.blob(Vector3.ZERO, Vector3(0.055, 0.05, 0.06), 0.03, fur, 1)
	h.blob(Vector3(0.03, 0.015, 0.045), Vector3(0.009, 0.009, 0.009), 0.0, Color(0.06, 0.05, 0.05))
	h.blob(Vector3(-0.03, 0.015, 0.045), Vector3(0.009, 0.009, 0.009), 0.0, Color(0.06, 0.05, 0.05))
	h.blob(Vector3(0, -0.005, 0.06), Vector3(0.01, 0.008, 0.008), 0.0, Color(0.95, 0.6, 0.65))
	head.add_child(_mi(h.commit()))
	var ears := []
	for sd in [-1, 1]:
		var piv := Node3D.new(); piv.position = Vector3(sd * 0.022, 0.035, -0.01); head.add_child(piv)
		var e := LP.new(9)
		e.blob(Vector3(0, 0.06, 0), Vector3(0.016, 0.06, 0.01), 0.0, fur)
		e.blob(Vector3(0, 0.06, 0.006), Vector3(0.009, 0.045, 0.006), 0.0, Color(0.95, 0.72, 0.74))
		piv.add_child(_mi(e.commit())); piv.rotation.z = sd * 0.12
		ears.append(piv)
	n.rotation.y = _rng.randf_range(0, TAU)
	_rabbit = {"node": n, "head": head, "ears": ears, "t": _rng.randf_range(1, 3), "hop": 0.0, "from": p, "to": p, "home": p}


func _update_rabbit(dt: float) -> void:
	if _rabbit.is_empty(): return
	var n: Node3D = _rabbit.node
	var head: Node3D = _rabbit.head
	# nibbling: the head dips and the ears twitch; every few seconds a little hop nearby
	head.rotation.x = 0.35 + sin(_T * 9.0) * 0.06 * (1.0 if fmod(_T, 5.0) < 2.5 else 0.0)
	for i in 2:
		(_rabbit.ears[i] as Node3D).rotation.x = sin(_T * 3.0 + i) * 0.08 + (0.4 if fmod(_T + i * 0.3, 4.2) < 0.15 else 0.0)
	if _rabbit.hop > 0.0:
		_rabbit.hop = maxf(0.0, _rabbit.hop - dt * 2.4)
		var k: float = 1.0 - _rabbit.hop
		n.position = (_rabbit.from as Vector3).lerp(_rabbit.to, k) + Vector3(0, sin(k * PI) * 0.09, 0)
		return
	_rabbit.t -= dt
	if _rabbit.t <= 0.0:
		_rabbit.t = _rng.randf_range(2.5, 6.0)
		var a := _rng.randf_range(0, TAU)
		var to: Vector3 = _rabbit.home + Vector3(cos(a), 0, sin(a)) * _rng.randf_range(0.0, 0.3)
		if not Env._crown_fits(_top, to, 0.2): return
		if absf(to.x) < _hw + 0.15 and absf(to.z) < _hh + 0.15: return
		_rabbit.from = n.position; _rabbit.to = to; _rabbit.hop = 1.0
		var d: Vector3 = to - n.position
		if d.length() > 0.01: n.rotation.y = atan2(d.x, d.z)


# ---------------- wind streaks ----------------

func _streak(start := false) -> Dictionary:
	var mi := MeshInstance3D.new()
	var len := _rng.randf_range(1.8, 3.2)
	var m := ImmediateMesh.new()
	var seg := 14
	var amp := _rng.randf_range(0.03, 0.08)
	var waves := _rng.randf_range(0.4, 0.9)
	var w := 0.014
	m.surface_begin(Mesh.PRIMITIVE_TRIANGLE_STRIP)
	for i in seg + 1:
		var t := float(i) / seg
		var x := (t - 0.5) * len
		var y := sin(t * TAU * waves) * amp
		var a := sin(t * PI)   # fades at both ends
		m.surface_set_color(Color(1, 1, 1, a))
		m.surface_add_vertex(Vector3(x, y + w, 0))
		m.surface_set_color(Color(1, 1, 1, a))
		m.surface_add_vertex(Vector3(x, y - w, 0))
	m.surface_end()
	mi.mesh = m
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.vertex_color_use_as_albedo = true
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	mat.albedo_color = Color(1, 1, 1, 0)
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	var s := {"mi": mi, "mat": mat, "life": _rng.randf_range(2.5, 4.5), "age": 0.0, "v": Vector3(_rng.randf_range(0.9, 1.5), 0, _rng.randf_range(-0.15, 0.15))}
	_respawn(s, start)
	return s


func _respawn(s: Dictionary, start := false) -> void:
	var mi: MeshInstance3D = s.mi
	mi.position = Vector3(-_hw - 2.5 + (_rng.randf_range(0, 5) if start else 0.0), _rng.randf_range(0.5, 2.2), _rng.randf_range(-_hh - 1.5, _hh + 0.8))
	mi.rotation.y = atan2(-(s.v as Vector3).z, (s.v as Vector3).x)
	s.age = _rng.randf_range(0, s.life * 0.6) if start else 0.0


func _update_streaks(dt: float) -> void:
	for s in _streaks:
		s.age += dt
		var mi: MeshInstance3D = s.mi
		mi.position += (s.v as Vector3) * dt
		var k: float = s.age / s.life
		(s.mat as StandardMaterial3D).albedo_color.a = clampf(sin(clampf(k, 0, 1) * PI), 0, 1) * 0.42
		if k >= 1.0: _respawn(s)


# ---------------- per frame ----------------

func _process(dt: float) -> void:
	_T += dt
	_update_birds(dt)
	_update_rabbit(dt)
	_update_streaks(dt)
	for f in _flies:
		var n: Node3D = f.node
		var t: float = _T * f.sp + f.ph
		var p: Vector3 = f.c + Vector3(cos(t) * f.r, f.h + sin(t * 2.3) * 0.08, sin(t * 1.3) * f.r * 0.8)
		var d := p - n.position
		n.position = p
		if d.length() > 0.0001: n.rotation.y = atan2(d.x, d.z)
		var flap := absf(sin(_T * 22.0 + f.ph)) * 1.2
		(f.wings[0] as Node3D).rotation.z = flap
		(f.wings[1] as Node3D).rotation.z = -flap

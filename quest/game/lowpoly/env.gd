extends RefCounted
## The room's world, built in code in the low-poly faceted style: stone floor slabs, stacked
## stone walls, stone door frames with wooden doors, plate bases, the exit dais, and the floating
## island the room stands on, with trees, bushes, rocks and grass around its rim.
## Board space (same as board.gd): one cell = 1 unit, floor top at y = 0.
## Pure view: the rules never see any of this.

const LP = preload("res://game/lowpoly/lp.gd")

# natural, rich palette (sRGB)
const STONE := Color(0.70, 0.63, 0.53)
const STONE_DK := Color(0.60, 0.56, 0.52)
const WALL := Color(0.60, 0.57, 0.54)
const MOSS := Color(0.47, 0.60, 0.30)
const GRASS := Color(0.43, 0.57, 0.28)
const GRASS_DK := Color(0.31, 0.44, 0.21)
const EARTH := Color(0.55, 0.39, 0.26)
const ROCK := Color(0.52, 0.48, 0.46)
const TRUNK := Color(0.42, 0.29, 0.20)
const WOOD := Color(0.50, 0.33, 0.20)
const IRON := Color(0.27, 0.27, 0.30)
const LEAF := [Color(0.27, 0.48, 0.24), Color(0.36, 0.58, 0.27), Color(0.50, 0.68, 0.32)]
const FLOWERS := [Color(0.95, 0.85, 0.40), Color(0.93, 0.55, 0.45), Color(0.95, 0.93, 0.88)]

const WALL_H := 0.95


static func _tone(c: Color, k: float) -> Color:
	return Color(c.r * k, c.g * k, c.b * k, c.a)


## floor: one big slab, two halves or four small stones per cell, a little uneven
static func floor_mesh(cells: Array, W: int, H: int, seed_: int) -> ArrayMesh:
	var lp := LP.new(seed_)
	lp.ao_low = -0.25; lp.ao_high = 0.0; lp.ao_min = 0.55
	for c: Vector2i in cells:
		var o := _cell(c.x, c.y, W, H)
		var r := lp.rnd(0.0, 1.0)
		var tone := lp.rnd(0.9, 1.08)
		var cl := _tone(STONE, tone)
		if r < 0.45:
			_slab(lp, o, Vector2(0.97, 0.97), cl)
		elif r < 0.75:
			var along_x := lp.rng.randi() % 2 == 0
			for s in [-1, 1]:
				var off := Vector3(0.245 * s, 0, 0) if along_x else Vector3(0, 0, 0.245 * s)
				_slab(lp, o + off, Vector2(0.475, 0.97) if along_x else Vector2(0.97, 0.475), _tone(cl, lp.rnd(0.93, 1.06)))
		else:
			for sx in [-1, 1]:
				for sz in [-1, 1]:
					_slab(lp, o + Vector3(0.245 * sx, 0, 0.245 * sz), Vector2(0.475, 0.475), _tone(cl, lp.rnd(0.92, 1.07)))
	# dark earth under the slabs, so the joints read as shadowed grooves
	lp.block(Vector3(0, -0.07, 0), Vector3(W + 0.02, 0.1, H + 0.02), 0.01, 0.0, Color(0.30, 0.25, 0.20))
	return lp.commit()


static func _slab(lp: LP, at: Vector3, s: Vector2, cl: Color) -> void:
	var t := 0.16
	lp.block(at + Vector3(0, -t / 2.0 + lp.rnd(-0.012, 0.008), 0), Vector3(s.x, t, s.y), 0.05, 0.012, cl)


## walls: three courses of stones, staggered, some with moss on top
static func wall_mesh(cells: Array, W: int, H: int, seed_: int) -> ArrayMesh:
	var lp := LP.new(seed_)
	lp.ao_low = -0.1; lp.ao_high = WALL_H; lp.ao_min = 0.6
	var rows := 3
	var rh := WALL_H / rows
	for c: Vector2i in cells:
		var o := _cell(c.x, c.y, W, H)
		for r in rows:
			var y := r * rh + rh / 2.0 - 0.02
			var split := (r + c.x + c.y) % 2 == 0
			var top = null
			if r == rows - 1 and lp.rnd(0, 1) < 0.4:
				top = _tone(MOSS, lp.rnd(0.9, 1.1))
			var cl := _tone(WALL, lp.rnd(0.86, 1.1))
			var hh := rh - 0.02 + (lp.rnd(-0.03, 0.05) if r == rows - 1 else 0.0)
			if split:
				var along_x := r % 2 == 0
				for s in [-1, 1]:
					var off := Vector3(0.25 * s, 0, 0) if along_x else Vector3(0, 0, 0.25 * s)
					var sz := Vector3(0.48, hh, 1.0) if along_x else Vector3(1.0, hh, 0.48)
					lp.block(o + off + Vector3(0, y + (hh - rh) / 2.0, 0), sz, 0.06, 0.018, _tone(cl, lp.rnd(0.92, 1.06)), top)
			else:
				lp.block(o + Vector3(0, y + (hh - rh) / 2.0, 0), Vector3(1.0, hh, 1.0), 0.07, 0.02, cl, top)
		if lp.rnd(0, 1) < 0.18:   # a loose stone on top now and then
			lp.blob(o + Vector3(lp.rnd(-0.2, 0.2), WALL_H + 0.06, lp.rnd(-0.2, 0.2)), Vector3(0.14, 0.09, 0.12), 0.2, _tone(WALL, 0.95))
	return lp.commit()


## a door frame standing along x on its cell: two stone pillars and a lintel
static func door_frame_mesh(seed_: int) -> ArrayMesh:
	var lp := LP.new(seed_)
	lp.ao_low = -0.1; lp.ao_high = 1.9; lp.ao_min = 0.62
	for s in [-1, 1]:
		var y := 0.0
		var hs := [0.5, 0.55, 0.55]
		for k in 3:
			var h: float = hs[k]
			lp.block(Vector3(0.39 * s, y + h / 2.0, 0), Vector3(0.24, h - 0.02, 0.46), 0.05, 0.015, _tone(WALL, lp.rnd(0.9, 1.08)))
			y += h
	lp.block(Vector3(0, 1.72, 0), Vector3(1.06, 0.26, 0.5), 0.07, 0.015, _tone(WALL, 1.02), _tone(MOSS, 0.95))
	lp.block(Vector3(0, 1.62, 0.02), Vector3(0.2, 0.3, 0.5), 0.04, 0.01, _tone(STONE, 1.0))   # keystone
	return lp.commit()


## the wooden door between the pillars; its origin is at the floor so scaling y lowers it
static func door_panel_mesh(seed_: int) -> ArrayMesh:
	var lp := LP.new(seed_)
	lp.ao_low = 0.0; lp.ao_high = 1.5; lp.ao_min = 0.7
	for k in 3:
		lp.block(Vector3(-0.2 + 0.2 * k, 0.76, 0), Vector3(0.19, 1.44, 0.08), 0.025, 0.006, _tone(WOOD, lp.rnd(0.88, 1.08)))
	for y in [0.35, 1.15]:
		lp.block(Vector3(0, y, 0), Vector3(0.6, 0.07, 0.11), 0.015, 0.0, IRON)
	return lp.commit()


## a plate: dark octagonal stone with a metal disc (the neon ring is drawn by the board)
static func plate_mesh(seed_: int) -> ArrayMesh:
	var lp := LP.new(seed_)
	lp.ao_low = -0.05; lp.ao_high = 0.1; lp.ao_min = 0.75
	lp.cyl(Vector3(0, -0.02, 0), 0.4, 0.37, 0.1, 8, Color(0.36, 0.35, 0.37), 0.01, PI / 8)
	lp.cyl(Vector3(0, 0.06, 0), 0.27, 0.25, 0.04, 8, Color(0.46, 0.45, 0.47), 0.0, PI / 8)
	return lp.commit()


## the exit: a round stepped stone dais with three small standing stones
static func exit_mesh(seed_: int) -> ArrayMesh:
	var lp := LP.new(seed_)
	lp.ao_low = -0.05; lp.ao_high = 0.4; lp.ao_min = 0.7
	lp.cyl(Vector3(0, -0.02, 0), 0.5, 0.47, 0.08, 10, _tone(STONE, 1.05), 0.01)
	lp.cyl(Vector3(0, 0.06, 0), 0.36, 0.33, 0.04, 10, _tone(STONE, 1.15), 0.005)
	for k in 3:
		var a := TAU * k / 3.0 + 0.5
		lp.block(Vector3(cos(a) * 0.44, 0.15, sin(a) * 0.44), Vector3(0.1, 0.3, 0.09), 0.025, 0.015, _tone(WALL, 0.95), _tone(MOSS, 1.0))
	return lp.commit()


## the floating island under the room: grass cap, earth band, rock body tapering to a point,
## hanging and floating rocks, and life on the rim (trees at the back, bushes, rocks, grass)
static func island_mesh(R: Dictionary, seed_: int) -> ArrayMesh:
	var lp := LP.new(seed_)
	var W: int = R.W; var H: int = R.H
	lp.ao_low = -2.6; lp.ao_high = 0.0; lp.ao_min = 0.42
	var ex := W / 2.0 + 0.55; var ez := H / 2.0 + 0.55
	var n := 32
	var base := PackedVector2Array()
	for k in n:   # rounded rectangle (superellipse) around the room
		var a := TAU * k / n + PI / n
		var cx := cos(a); var sz := sin(a)
		base.append(Vector2(signf(cx) * pow(absf(cx), 0.45) * ex, signf(sz) * pow(absf(sz), 0.45) * ez))
	var layers := [[-0.05, 1.0, 0.0], [-0.2, 1.03, 0.04], [-0.3, 0.99, 0.05], [-0.75, 0.86, 0.1],
		[-1.35, 0.62, 0.12], [-2.0, 0.34, 0.1], [-2.6, 0.06, 0.04]]
	var rings := []
	for L in layers:
		var r := PackedVector2Array()
		for k in n:
			var p: Vector2 = base[k] * (L[1] as float)
			r.append(p + p.normalized() * lp.rnd(-L[2], L[2]))
		rings.append([L[0] + lp.rnd(-0.02, 0.02), r])
	rings.reverse()
	var band := func(ctr: Vector3, nm: Vector3) -> Color:
		if ctr.y > -0.21: return _tone(GRASS, 1.0 + nm.y * 0.06)
		if ctr.y > -0.27: return GRASS_DK
		if ctr.y > -0.8: return _tone(EARTH, lerpf(0.9, 1.05, clampf(ctr.y + 0.8, 0, 1)))
		return ROCK
	lp.loft(rings, band, false, false)
	# faceted grass top: two inner rings, slightly uneven, then the centre
	var top_y: float = rings[rings.size() - 1][0]
	var outer: PackedVector2Array = rings[rings.size() - 1][1]
	var tops := [outer]
	for f in [0.74, 0.45]:
		var r := PackedVector2Array()
		for k in n: r.append(base[k] * f + Vector2(lp.rnd(-0.08, 0.08), lp.rnd(-0.08, 0.08)))
		tops.append(r)
	var below := Vector3(0, top_y - 2.0, 0)
	for j in 2:
		var a: PackedVector2Array = tops[j]; var b: PackedVector2Array = tops[j + 1]
		var ya := top_y + (0.0 if j == 0 else lp.rnd(-0.01, 0.01)); var yb := top_y + lp.rnd(0.0, 0.02)
		for k in n:
			var k2 := (k + 1) % n
			var p0 := Vector3(a[k].x, ya, a[k].y); var p1 := Vector3(a[k2].x, ya, a[k2].y)
			var q0 := Vector3(b[k].x, yb, b[k].y); var q1 := Vector3(b[k2].x, yb, b[k2].y)
			lp.tri(p0, p1, q1, band, below); lp.tri(p0, q1, q0, band, below)
	var inner: PackedVector2Array = tops[2]
	for k in n:
		var k2 := (k + 1) % n
		lp.tri(Vector3(0, top_y, 0), Vector3(inner[k].x, top_y, inner[k].y), Vector3(inner[k2].x, top_y, inner[k2].y), band, below)
	# hanging rocks under the island and a few small ones floating beside it
	for k in 5:
		var a := lp.rnd(0, TAU)
		lp.blob(Vector3(cos(a) * ex * 0.45, lp.rnd(-1.4, -0.9), sin(a) * ez * 0.45), Vector3(0.35, 0.5, 0.35) * lp.rnd(0.7, 1.2), 0.25, ROCK)
	for k in 3:
		var a := TAU * k / 3.0 + lp.rnd(0, 1)
		var at := Vector3(cos(a) * (ex + 0.9), lp.rnd(-1.4, -0.5), sin(a) * (ez + 0.9))
		lp.blob(at, Vector3(0.22, 0.2, 0.22) * lp.rnd(0.7, 1.3), 0.3, ROCK, 0, -2.0)
		lp.blob(at + Vector3(0, 0.13, 0), Vector3(0.2, 0.06, 0.2), 0.2, GRASS, 0, 0.0)
	_rim_life(lp, W, H, ex, ez)
	return lp.commit()


## trees on the far corners (never in front of the puzzle), bushes, rocks, tufts and flowers
static func _rim_life(lp: LP, W: int, H: int, ex: float, ez: float) -> void:
	lp.ao_low = -0.1; lp.ao_high = 1.6; lp.ao_min = 0.6
	var hw := W / 2.0; var hh := H / 2.0
	var trees := [Vector3(-ex + 0.3, 0, -ez + 0.3), Vector3(ex - 0.3, 0, -ez + 0.25)]
	if W >= 6: trees.append(Vector3(lp.rnd(-0.3, 0.3) * W, 0, -ez + 0.22))
	if H >= 6: trees.append(Vector3(-ex + 0.22, 0, -hh * 0.2))
	for t in trees:
		_tree(lp, t + Vector3(0, -0.06, 0), lp.rnd(0.85, 1.15))
	for k in 6:   # bushes along the sides and the far edge
		var p := _rim_point(lp, hw, hh, ex, ez, false)
		var s := lp.rnd(0.16, 0.26)
		lp.blob(p + Vector3(0, s * 0.5, 0), Vector3(s * 1.2, s, s * 1.2), 0.22, _leaf_fn(p.y + s * 1.5, s * 2.0))
	for k in 7:
		var p := _rim_point(lp, hw, hh, ex, ez, true)
		lp.blob(p + Vector3(0, 0.03, 0), Vector3(0.12, 0.09, 0.1) * lp.rnd(0.7, 1.6), 0.3, _tone(ROCK, lp.rnd(1.0, 1.25)))
	for k in 16:
		var p := _rim_point(lp, hw, hh, ex, ez, true)
		_tuft(lp, p + Vector3(0, -0.06, 0))
	for k in 8:
		var p := _rim_point(lp, hw, hh, ex, ez, true)
		var c: Color = FLOWERS[k % FLOWERS.size()]
		lp.cyl(p + Vector3(0, -0.06, 0), 0.01, 0.006, 0.1, 3, GRASS_DK)
		lp.blob(p + Vector3(0, 0.06, 0), Vector3(0.035, 0.025, 0.035), 0.1, c)


static func _rim_point(lp: LP, hw: float, hh: float, ex: float, ez: float, front_ok: bool) -> Vector3:
	for _i in 30:
		var a := lp.rnd(0, TAU)
		var x := cos(a) * ex * 0.97; var z := sin(a) * ez * 0.97
		x = clampf(x, -ex + 0.08, ex - 0.08); z = clampf(z, -ez + 0.08, ez - 0.08)
		var outside := absf(x) > hw + 0.08 or absf(z) > hh + 0.08
		if not outside: continue
		if not front_ok and z > hh * 0.3: continue
		if z > hh + 0.25 and absf(x) < hw * 0.75: continue   # keep the timeline strip in front clear
		return Vector3(x, -0.05, z)
	return Vector3(-ex + 0.1, -0.05, -ez + 0.1)


static func _leaf_fn(top: float, h: float) -> Callable:
	return func(ctr: Vector3, nm: Vector3) -> Color:
		var k := clampf((ctr.y - (top - h)) / maxf(h, 0.01), 0.0, 1.0) * 0.7 + clampf(nm.y, 0.0, 1.0) * 0.5
		var i := clampi(int(k * 2.0), 0, 2)
		return LEAF[i]


static func _tree(lp: LP, at: Vector3, s: float) -> void:
	var trunk_h := 0.55 * s
	var lean := Vector3(lp.rnd(-0.06, 0.06), 0, lp.rnd(-0.06, 0.06))
	var save: Transform3D = lp.xf
	lp.cyl(at, 0.08 * s, 0.05 * s, trunk_h, 5, TRUNK, 0.01)
	for k in 3:   # roots
		var a := TAU * k / 3.0 + lp.rnd(0, 1)
		lp.block(at + Vector3(cos(a) * 0.08, 0.02, sin(a) * 0.08) * s, Vector3(0.12, 0.05, 0.05) * s, 0.01, 0.01, TRUNK)
	var top := at + lean + Vector3(0, trunk_h, 0)
	var crown_top := top.y + 0.75 * s
	var leaf := _leaf_fn(crown_top, 0.95 * s)
	# stacked leaf masses, big at the bottom, smaller and lighter towards the top
	lp.blob(top + Vector3(0, 0.12, 0) * s, Vector3(0.42, 0.3, 0.42) * s, 0.18, leaf, 1)
	lp.blob(top + Vector3(lp.rnd(-0.12, 0.12), 0.38, lp.rnd(-0.12, 0.12)) * s, Vector3(0.32, 0.26, 0.32) * s, 0.18, leaf, 1)
	lp.blob(top + Vector3(lp.rnd(-0.08, 0.08), 0.6, lp.rnd(-0.08, 0.08)) * s, Vector3(0.2, 0.18, 0.2) * s, 0.2, leaf, 0)
	for k in 2:
		var a := lp.rnd(0, TAU)
		lp.blob(top + Vector3(cos(a) * 0.32, 0.1, sin(a) * 0.32) * s, Vector3(0.18, 0.15, 0.18) * s, 0.2, leaf, 0)
	lp.xf = save


static func _tuft(lp: LP, at: Vector3) -> void:
	for k in 3:
		var a := TAU * k / 3.0 + lp.rnd(0, 1)
		lp.cyl(at + Vector3(cos(a) * 0.03, 0, sin(a) * 0.03), 0.018, 0.0, lp.rnd(0.09, 0.15), 3, GRASS if k % 2 == 0 else GRASS_DK, 0.0, a)


static func _cell(x: int, y: int, W: int, H: int) -> Vector3:
	return Vector3(x - (W - 1) / 2.0, 0.0, -(y - (H - 1) / 2.0))

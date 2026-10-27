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
const MOSS := Color(0.44, 0.60, 0.25)
const GRASS := Color(0.53, 0.76, 0.25)
const GRASS_HI := Color(0.64, 0.84, 0.30)
const GRASS_LT := Color(0.74, 0.90, 0.36)
const GRASS_DK := Color(0.40, 0.62, 0.20)
const EARTH := Color(0.84, 0.45, 0.24)
const EARTH_DK := Color(0.58, 0.27, 0.16)
const WHITE_ROCK := Color(0.93, 0.90, 0.85)
const ROCK := Color(0.52, 0.48, 0.46)
const TRUNK := Color(0.66, 0.31, 0.18)
const WOOD := Color(0.50, 0.33, 0.20)
const IRON := Color(0.27, 0.27, 0.30)
const LEAF := [Color(0.24, 0.50, 0.20), Color(0.34, 0.62, 0.24), Color(0.47, 0.74, 0.28)]
const FLOWERS := [Color(0.95, 0.85, 0.40), Color(0.93, 0.55, 0.45), Color(0.95, 0.93, 0.88)]

const WALL_H := 0.95
const GARDEN := 2.1   # depth of the garden behind the room, in cells


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
			if r == rows - 1 and lp.rnd(0, 1) < 0.25:
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


## the floating island under the room: lime grass on top, orange earth below tapering to a point,
## a garden behind the room where the trees stand (every tree fully on the island), tall grass
## on the rim, white rocks, bushes, and small floating islands around it.
## The last island built keeps its outline and tree list for the art test.
static var last_outline := PackedVector2Array()
static var last_trees := []   # [Vector3 trunk base, float measured crown reach, PackedVector2Array island top]

static func island_mesh(R: Dictionary, seed_: int) -> ArrayMesh:
	var lp := LP.new(seed_)
	var W: int = R.W; var H: int = R.H
	var hw := W / 2.0; var hh := H / 2.0
	var ex := hw + 0.75; var ez_f := hh + 0.6; var ez_b := hh + GARDEN
	var n := 36
	var base := PackedVector2Array()
	for k in n:   # rounded rectangle, deeper at the back (the garden)
		var a := TAU * k / n + PI / n
		var cx := cos(a); var sz := sin(a)
		var z := signf(sz) * pow(absf(sz), 0.4)
		base.append(Vector2(signf(cx) * pow(absf(cx), 0.4) * ex, z * (ez_f if z > 0.0 else ez_b)))
	var top := _landmass(lp, base, Vector3(0, -0.05, 0), 2.8, 0.1)
	last_outline = top
	last_trees = []
	lp.ao_low = -0.1; lp.ao_high = 2.2; lp.ao_min = 0.72
	_garden(lp, top, hw, hh, ex, ez_b)
	_rim_life(lp, top, hw, hh)
	_skirt(lp, top, -0.05)
	# small floating islands around, each with its own life
	var minis := [[Vector3(-ex - 1.3, -0.5, -0.4), 0.7], [Vector3(ex + 1.2, 0.15, -hh * 0.5 - 0.6), 0.55],
		[Vector3(-ex * 0.4, 0.55, -ez_b - 1.1), 0.5], [Vector3(ex + 0.9, -1.1, hh * 0.6), 0.4]]
	for m in minis:
		var c: Vector3 = m[0]; var r: float = m[1]
		lp.ao_low = c.y - r * 2.2; lp.ao_high = c.y; lp.ao_min = 0.45
		var pts := LP.circle(9, r, r * 0.85, lp.rnd(0, 1))
		var mtop := _landmass(lp, pts, c, r * 2.2, r * 0.18)
		lp.ao_low = c.y - 0.1; lp.ao_high = c.y + 1.4; lp.ao_min = 0.6
		if r >= 0.55:
			last_trees.append([c, _tree(lp, c, 0.55, r * 0.5), mtop])
		else:
			_bush(lp, c + Vector3(lp.rnd(-0.1, 0.1), 0, lp.rnd(-0.1, 0.1)), r * 0.45)
		for k in 6:
			var a := lp.rnd(0, TAU); var d := lp.rnd(0.2, 0.75) * r
			_tuft(lp, c + Vector3(cos(a) * d, 0, sin(a) * d * 0.85), 0.16)
		lp.blob(c + Vector3(r * 0.4, 0.03, r * 0.2), Vector3(0.09, 0.07, 0.08), 0.3, WHITE_ROCK)
		_skirt(lp, mtop, c.y)
	return lp.commit()


## grass top + earth body through a ring of points (relative to c); returns the top outline (absolute x/z)
static func _landmass(lp: LP, pts: PackedVector2Array, c: Vector3, depth: float, jit: float) -> PackedVector2Array:
	var n := pts.size()
	var layers := [[0.0, 1.0, 0.0], [-0.06, 1.03, 0.4], [-0.13, 1.0, 0.5], [-0.3, 0.9, 1.0],
		[-0.55, 0.66, 1.2], [-0.8, 0.38, 1.0], [-1.0, 0.07, 0.4]]
	var rings := []
	for L in layers:
		var r := PackedVector2Array()
		for k in n:
			var p: Vector2 = pts[k] * (L[1] as float)
			r.append(Vector2(c.x, c.z) + p + p.normalized() * lp.rnd(-jit, jit) * (L[2] as float))
		rings.append([c.y + (L[0] as float) * depth + lp.rnd(-0.015, 0.015) * depth, r])
	rings[0][0] = c.y
	rings.reverse()
	var gy := c.y - 0.035 * depth
	var band := func(ctr: Vector3, nm: Vector3) -> Color:
		if ctr.y > gy: return _tone(GRASS if nm.y > 0.5 else GRASS_DK, 1.0 + nm.y * 0.05)
		var k := clampf((ctr.y - (c.y - depth)) / depth, 0.0, 1.0)
		return EARTH_DK.lerp(EARTH, k)
	lp.loft(rings, band, false, false, Vector2(c.x, c.z))
	var outer: PackedVector2Array = rings[rings.size() - 1][1]
	var tops := [outer]
	for f in [0.72, 0.42]:
		var r := PackedVector2Array()
		for k in n: r.append(Vector2(c.x, c.z) + pts[k] * f + Vector2(lp.rnd(-0.06, 0.06), lp.rnd(-0.06, 0.06)))
		tops.append(r)
	var below := Vector3(c.x, c.y - 2.0, c.z)
	for j in 2:
		var a: PackedVector2Array = tops[j]; var b: PackedVector2Array = tops[j + 1]
		var ya := c.y + (0.0 if j == 0 else lp.rnd(-0.008, 0.008)); var yb := c.y + lp.rnd(0.0, 0.015)
		for k in n:
			var k2 := (k + 1) % n
			var p0 := Vector3(a[k].x, ya, a[k].y); var p1 := Vector3(a[k2].x, ya, a[k2].y)
			var q0 := Vector3(b[k].x, yb, b[k].y); var q1 := Vector3(b[k2].x, yb, b[k2].y)
			lp.tri(p0, p1, q1, band, below); lp.tri(p0, q1, q0, band, below)
	var inner: PackedVector2Array = tops[2]
	for k in n:
		var k2 := (k + 1) % n
		lp.tri(Vector3(c.x, c.y, c.z), Vector3(inner[k].x, c.y, inner[k].y), Vector3(inner[k2].x, c.y, inner[k2].y), band, below)
	# a few rocks hanging under it
	for k in maxi(2, n / 9):
		var a := lp.rnd(0, TAU)
		var d := lp.rnd(0.15, 0.4)
		var p := Vector2(c.x, c.z) + pts[k * 3 % n] * d
		lp.blob(Vector3(p.x, c.y - depth * lp.rnd(0.35, 0.55), p.y), Vector3(0.18, 0.3, 0.18) * depth * 0.4, 0.25, EARTH_DK)
	return outer


## the garden behind the room: a row of tall trees (crowns fully over the island), bushes, rocks
static func _garden(lp: LP, top: PackedVector2Array, hw: float, hh: float, ex: float, ez_b: float) -> void:
	var x := -ex + 0.6
	while x < ex - 0.5:
		for _try in 12:
			var s := lp.rnd(0.85, 1.15)
			var cr := 0.68 * s
			var at := Vector3(x + lp.rnd(-0.15, 0.15), -0.05, -hh - lp.rnd(0.75, GARDEN - cr - 0.05))
			if _crown_fits(top, at, cr + 0.12):
				last_trees.append([at, _tree(lp, at, s, cr), top])
				break
		x += lp.rnd(0.95, 1.25)
	for k in 5:
		var p := Vector3(lp.rnd(-ex + 0.3, ex - 0.3), -0.05, -hh - lp.rnd(0.25, GARDEN - 0.3))
		if _crown_fits(top, p, 0.25): _bush(lp, p, lp.rnd(0.14, 0.22))
	for k in 6:
		var p := Vector3(lp.rnd(-ex + 0.2, ex - 0.2), -0.05, -hh - lp.rnd(0.2, GARDEN - 0.2))
		if _crown_fits(top, p, 0.15):
			lp.blob(p + Vector3(0, 0.05, 0), Vector3(0.14, 0.11, 0.12) * lp.rnd(0.7, 1.5), 0.3, _tone(WHITE_ROCK, lp.rnd(0.92, 1.02)))
	for k in 130:
		var p := Vector3(lp.rnd(-ex + 0.1, ex - 0.1), -0.05, -hh - lp.rnd(0.12, GARDEN - 0.1))
		if _crown_fits(top, p, 0.06): _tuft(lp, p, lp.rnd(0.18, 0.34))


static func _crown_fits(top: PackedVector2Array, at: Vector3, r: float) -> bool:
	for k in 10:
		var a := TAU * k / 10.0
		if not Geometry2D.is_point_in_polygon(Vector2(at.x + cos(a) * r, at.z + sin(a) * r), top): return false
	return true


## along the sides and the front: tall grass (short in front, so the room stays readable),
## bushes, white rocks and flowers; the timeline strip in front stays clear
static func _rim_life(lp: LP, top: PackedVector2Array, hw: float, hh: float) -> void:
	var placed := 0
	for _i in 900:
		if placed >= 320: break
		var p := Vector3(lp.rnd(-hw - 0.75, hw + 0.75), -0.05, lp.rnd(-hh - 0.2, hh + 0.6))
		if absf(p.x) < hw + 0.07 and p.z > -hh - 0.07: continue          # on the room
		if p.z > hh + 0.25 and absf(p.x) < hw * 0.8: continue             # the timeline strip
		if not _crown_fits(top, p, 0.05): continue
		var front := p.z > hh * 0.2
		_tuft(lp, p, lp.rnd(0.07, 0.11) if front else lp.rnd(0.16, 0.3))
		placed += 1
	for k in 40:
		var p := Vector3(lp.rnd(-hw - 0.7, hw + 0.7), -0.05, lp.rnd(-hh, hh + 0.5))
		if absf(p.x) < hw + 0.2: continue
		if not _crown_fits(top, p, 0.22): continue
		var r := lp.rnd(0, 1)
		if r < 0.3 and p.z < hh * 0.3: _bush(lp, p, lp.rnd(0.13, 0.2))
		elif r < 0.6: lp.blob(p + Vector3(0, 0.04, 0), Vector3(0.11, 0.08, 0.1) * lp.rnd(0.7, 1.4), 0.3, _tone(WHITE_ROCK, lp.rnd(0.92, 1.02)))
		else:
			var c: Color = FLOWERS[k % FLOWERS.size()]
			lp.cyl(p, 0.01, 0.006, 0.12, 3, GRASS_DK)
			lp.blob(p + Vector3(0, 0.13, 0), Vector3(0.035, 0.025, 0.035), 0.1, c)


## grass blades hanging over the island's edge
static func _skirt(lp: LP, top: PackedVector2Array, y: float) -> void:
	var save := lp.xf
	var n := top.size()
	for k in n:
		var a: Vector2 = top[k]; var b: Vector2 = top[(k + 1) % n]
		var out := Vector2(b.y - a.y, a.x - b.x).normalized()
		var ctr := Vector2.ZERO
		for q in top: ctr += q
		ctr /= float(n)
		if out.dot((a + b) / 2.0 - ctr) < 0.0: out = -out
		for j in 3:
			var p := a.lerp(b, (j + lp.rnd(0.1, 0.9)) / 3.0)
			var tilt := Basis(Vector3(-out.y, 0, out.x), lp.rnd(1.6, 2.3))   # lean out and down
			lp.xf = Transform3D(tilt, Vector3(p.x, y - 0.01, p.y) - Vector3(out.x, 0, out.y) * 0.02)
			lp.cyl(Vector3.ZERO, 0.025, 0.0, lp.rnd(0.1, 0.18), 3, GRASS if j % 2 == 0 else GRASS_DK, 0.0, lp.rnd(0, 1))
	lp.xf = save


static func _leaf_fn(top: float, h: float) -> Callable:
	return func(ctr: Vector3, nm: Vector3) -> Color:
		var k := clampf((ctr.y - (top - h)) / maxf(h, 0.01), 0.0, 1.0) * 0.6 + clampf(nm.y, 0.0, 1.0) * 0.6
		return LEAF[clampi(int(k * 2.0), 0, 2)]


static func _bush(lp: LP, at: Vector3, s: float) -> void:
	var leaf := _leaf_fn(at.y + s * 1.6, s * 1.6)
	lp.blob(at + Vector3(0, s * 0.6, 0), Vector3(s * 1.2, s, s * 1.2), 0.2, leaf, 1)
	lp.blob(at + Vector3(s * 0.7, s * 0.4, s * 0.2), Vector3(s * 0.7, s * 0.6, s * 0.7), 0.2, leaf)


## a tall tree: slender red-brown trunk with a slight bend, branches rising to flat umbrella
## canopies in layers (darker underneath, lighter on top). All of it within `cr` of the trunk.
static func _tree(lp: LP, at: Vector3, s: float, cr: float) -> float:
	var h := lp.rnd(1.5, 2.1) * s
	var bend := Vector3(lp.rnd(-0.08, 0.08), 0, lp.rnd(-0.08, 0.08)) * s
	var mid := at + Vector3(0, h * 0.5, 0) + bend
	var tip := at + Vector3(0, h, 0) + bend * 0.4
	_limb(lp, at, mid, 0.07 * s, 0.05 * s)
	_limb(lp, mid, tip, 0.05 * s, 0.03 * s)
	for k in 3:   # roots
		var a := TAU * k / 3.0 + lp.rnd(0, 1)
		_limb(lp, at + Vector3(0, 0.1 * s, 0), at + Vector3(cos(a) * 0.14, 0.0, sin(a) * 0.14) * s, 0.035 * s, 0.015 * s)
	var leaf := _leaf_fn(tip.y + 0.2 * s, h * 0.6)
	var reach := _canopy(lp, tip + Vector3(0, 0.05, 0), cr * 0.72, leaf, at)
	var nb := 3
	for k in nb:
		var a := TAU * k / nb + lp.rnd(-0.4, 0.4)
		var from := at.lerp(tip, lp.rnd(0.5, 0.72)) + bend * 0.5
		var out := cr * lp.rnd(0.32, 0.4)
		var to := from + Vector3(cos(a) * out, h * lp.rnd(0.18, 0.3), sin(a) * out)
		_limb(lp, from, to, 0.03 * s, 0.018 * s)
		reach = maxf(reach, _canopy(lp, to + Vector3(0, 0.03, 0), cr * lp.rnd(0.45, 0.55), leaf, at))
	return reach


## a flat leaf layer; returns how far it reaches from `trunk` (horizontally)
static func _canopy(lp: LP, c: Vector3, r: float, leaf: Callable, trunk: Vector3) -> float:
	lp.blob(c, Vector3(r, r * 0.38, r), 0.16, leaf, 1)
	lp.blob(c + Vector3(lp.rnd(-0.05, 0.05), r * 0.3, lp.rnd(-0.05, 0.05)), Vector3(r * 0.66, r * 0.3, r * 0.66), 0.16, leaf, 1)
	return Vector2(c.x - trunk.x, c.z - trunk.z).length() + r * 1.16


## a tapered 5-sided branch from a to b
static func _limb(lp: LP, a: Vector3, b: Vector3, r0: float, r1: float) -> void:
	var save := lp.xf
	var d := b - a
	var up := d.normalized()
	var side := up.cross(Vector3.FORWARD if absf(up.z) < 0.9 else Vector3.RIGHT).normalized()
	var bs := Basis(side, up, side.cross(up))
	lp.xf = save * Transform3D(bs, a)
	lp.cyl(Vector3.ZERO, r0, r1, d.length(), 5, TRUNK, 0.0, lp.rnd(0, 1))
	lp.xf = save


## a clump of grass blades (3-sided, open at the bottom: 3 triangles a blade), lit like the lawn
static func _tuft(lp: LP, at: Vector3, h := 0.14) -> void:
	var save := lp.xf
	var ao := lp.ao_min
	lp.ao_min = 0.92
	for k in 5:
		var a := TAU * k / 5.0 + lp.rnd(0, 1)
		var d := lp.rnd(0.0, 0.04)
		var lean := Basis(Vector3(-sin(a), 0, cos(a)), lp.rnd(0.15, 0.5))
		lp.xf = save * Transform3D(lean, at + Vector3(cos(a) * d, -0.01, sin(a) * d))
		lp.cyl(Vector3.ZERO, 0.018, 0.0, h * lp.rnd(0.6, 1.2), 3, [GRASS_HI, GRASS, GRASS_LT][k % 3], 0.0, a, false)
	lp.xf = save
	lp.ao_min = ao


static func _cell(x: int, y: int, W: int, H: int) -> Vector3:
	return Vector3(x - (W - 1) / 2.0, 0.0, -(y - (H - 1) / 2.0))

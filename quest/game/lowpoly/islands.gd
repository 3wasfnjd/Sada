extends RefCounted
## Floating islands that really differ from room to room (Quest 1.1). Three independent choices,
## so no two neighbouring rooms share the same island:
##   1. the rock base   — "taper" (orange earth cone), "terraces" (striped sandstone ledges),
##                        "basalt" (a slab on hexagonal stone columns), "roots" (a thin slab with
##                        roots and vines hanging under it); the outline is round, lobed or long
##   2. the plant cover — "meadow" (umbrella trees, flowers), "pine" (conifers, ferns, mushrooms,
##                        a fallen log), "palm" (sandy oasis, palms, reeds), "blossom" (round pink
##                        and white crowns, petals on the grass)
##   3. where the big masses sit — "grove" (a row of trees behind the room), "sides" (two clumps
##                        beside the room), "boulders" (big mossy rocks and a stone spire, few trees),
##                        "hill" (a mound behind the room with trees on top and stepping stones)
## and on many islands a stream that starts at a spring and spills over the edge as a waterfall.
## Board space (see board.gd): one cell = 1 unit, the grass top at y = -0.05.
## Env.last_outline / Env.last_trees keep working (the room sign, the animals and the art test use them).

const LP = preload("res://game/lowpoly/lp.gd")
const Env = preload("res://game/lowpoly/env.gd")

const BASES := ["taper", "terraces", "basalt", "roots"]
const FLORAS := ["meadow", "pine", "palm", "blossom"]
const LAYOUTS := ["grove", "sides", "boulders", "hill"]
const FRONT := 0.95    # depth of the island in front of the room (the timeline and the room sign)

static var last_kind := {}
static var last_water := []      # Node3D: stream and waterfall (the board adds them and animates them)
static var water_mats := []      # StandardMaterial3D whose uv1_offset the board scrolls
static var _water_tex: ImageTexture
static var _river := []          # river centre line (Vector2 x/z) to keep plants off it


static func build(R: Dictionary, seed_: int) -> ArrayMesh:
	var lp := LP.new(seed_)
	# the room's place in the run: the 4 tutorial rooms are levels 1-4, generated rooms count on from 5
	var level: int = int(R.get("level", 1)) + (0 if R.get("tutorial", false) else 4)
	# neighbouring rooms always differ in base and plants, and every 16 rooms show all 16 pairs;
	# layout, outline and the stream follow the seed
	var kind := {
		"base": BASES[level % 4],
		"flora": FLORAS[(level + level / 4) % 4],
		"layout": LAYOUTS[(seed_ >> 2) % 4],
		"shape": ["round", "lobed", "long"][(seed_ >> 4) % 3],
		"river": ((seed_ >> 6) % 5) < 3,
		"side": -1 if ((seed_ >> 9) & 1) == 0 else 1,
	}
	last_kind = kind
	last_water = []; water_mats = []; _river = []
	var W: int = R.W; var H: int = R.H
	var hw := W / 2.0; var hh := H / 2.0
	var ex := hw + 0.75; var ez_f := hh + FRONT; var ez_b := hh + Env.GARDEN
	var pal := _palette(kind.flora, kind.base)
	# outline: a rounded rectangle, deeper at the back; lobes push it out, "long" stretches one side
	var n := 40
	var phase := lp.rnd(0, TAU)
	var base := PackedVector2Array()
	for k in n:
		var a := TAU * k / n + PI / n
		var cx := cos(a); var sz := sin(a)
		var z := signf(sz) * pow(absf(sz), 0.4)
		var p := Vector2(signf(cx) * pow(absf(cx), 0.4) * ex, z * (ez_f if z > 0.0 else ez_b))
		match kind.shape:
			"lobed": p *= 1.0 + maxf(0.0, sin(a * 3.0 + phase)) * 0.12 + maxf(0.0, sin(a * 5.0 + phase * 2.0)) * 0.05
			"long": if signf(p.x) == float(kind.side) and p.y < hh * 0.5: p.x *= 1.3
		base.append(p)
	var depth := 2.8
	lp.ao_low = -0.05 - depth; lp.ao_high = -0.05; lp.ao_min = 0.55
	var top := _body(lp, base, Vector3(0, -0.05, 0), depth, 0.1, kind.base, pal)
	Env.last_outline = top
	Env.last_trees = []
	lp.ao_low = -0.1; lp.ao_high = 2.2; lp.ao_min = 0.72
	if kind.river: _stream(lp, top, hw, hh, ex, ez_b, kind.side, depth, pal)
	_masses(lp, top, hw, hh, ex, ez_b, kind, pal)
	_ground_cover(lp, top, hw, hh, kind.flora, pal)
	if kind.base == "basalt": _moss_lip(lp, top)
	else: Env._skirt(lp, top, -0.05)
	# small floating islands around, same family as the big one
	var minis := [[Vector3(-ex - 1.3, -0.5, -0.4), 0.7], [Vector3(ex + 1.2, 0.15, -hh * 0.5 - 0.6), 0.55],
		[Vector3(-ex * 0.4, 0.55, -ez_b - 1.1), 0.5], [Vector3(ex + 0.9, -1.1, hh * 0.6), 0.4]]
	for m in minis:
		var c: Vector3 = m[0]; var r: float = m[1]
		if kind.shape == "long" and signf(c.x) == float(kind.side): c.x += signf(c.x) * 0.6
		lp.ao_low = c.y - r * 2.2; lp.ao_high = c.y; lp.ao_min = 0.45
		var pts := LP.circle(9, r, r * 0.85, lp.rnd(0, 1))
		var mtop := _body(lp, pts, c, r * 2.2, r * 0.18, kind.base, pal)
		lp.ao_low = c.y - 0.1; lp.ao_high = c.y + 1.4; lp.ao_min = 0.6
		if r >= 0.55 and Env._crown_fits(mtop, c, _reach(kind.flora, 0.55, r * 0.5)):
			Env.last_trees.append([c, _plant(lp, c, 0.55, r * 0.5, kind.flora, pal), mtop])
		else:
			_shrub(lp, c + Vector3(lp.rnd(-0.1, 0.1), 0, lp.rnd(-0.1, 0.1)), r * 0.45, kind.flora, pal)
		for k in 5:
			var a := lp.rnd(0, TAU); var d := lp.rnd(0.2, 0.75) * r
			_tuft(lp, c + Vector3(cos(a) * d, 0, sin(a) * d * 0.85), 0.15, pal)
	return lp.commit()


static func _palette(flora: String, base: String) -> Dictionary:
	var p := {
		"grass": Env.GRASS, "grass_dk": Env.GRASS_DK, "grass_hi": Env.GRASS_HI, "grass_lt": Env.GRASS_LT,
		"side_hi": Env.EARTH, "side_lo": Env.EARTH_DK, "rock": Env.WHITE_ROCK,
	}
	match flora:
		"pine":
			p.grass = Color(0.36, 0.6, 0.27); p.grass_dk = Color(0.27, 0.47, 0.22); p.grass_hi = Color(0.44, 0.66, 0.3); p.grass_lt = Color(0.5, 0.72, 0.34)
		"palm":
			p.grass = Color(0.93, 0.83, 0.58); p.grass_dk = Color(0.84, 0.72, 0.47); p.grass_hi = Color(0.62, 0.74, 0.3); p.grass_lt = Color(0.7, 0.8, 0.36)
		"blossom":
			p.grass = Color(0.6, 0.8, 0.36); p.grass_dk = Color(0.48, 0.68, 0.28); p.grass_hi = Color(0.68, 0.86, 0.4); p.grass_lt = Color(0.78, 0.92, 0.48)
	match base:
		"terraces": p.side_hi = Color(0.93, 0.74, 0.5); p.side_lo = Color(0.7, 0.42, 0.28)
		"basalt": p.side_hi = Color(0.7, 0.7, 0.74); p.side_lo = Color(0.46, 0.47, 0.54)
		"roots": p.side_hi = Color(0.55, 0.38, 0.25); p.side_lo = Color(0.36, 0.24, 0.16)
	return p


# ---------------- 1. the rock base ----------------

## grass top + body through a ring of points (relative to c); returns the top outline (absolute x/z)
static func _body(lp: LP, pts: PackedVector2Array, c: Vector3, depth: float, jit: float, style: String, pal: Dictionary) -> PackedVector2Array:
	var n := pts.size()
	var layers: Array
	match style:
		"terraces":   # stacked ledges: each band steps in, like weathered sandstone
			layers = [[0.0, 1.0, 0.0], [-0.06, 1.02, 0.3], [-0.2, 1.0, 0.4], [-0.21, 0.88, 0.5], [-0.4, 0.87, 0.6],
				[-0.41, 0.72, 0.6], [-0.6, 0.7, 0.7], [-0.61, 0.52, 0.6], [-0.8, 0.48, 0.6], [-0.81, 0.3, 0.4], [-0.95, 0.12, 0.3]]
		"basalt":     # only a slab: the columns underneath are added below
			layers = [[0.0, 1.0, 0.0], [-0.04, 1.02, 0.3], [-0.1, 0.98, 0.4], [-0.13, 0.9, 0.3]]
		"roots":      # a thin, soft slab
			layers = [[0.0, 1.0, 0.0], [-0.05, 1.03, 0.4], [-0.14, 0.96, 0.6], [-0.26, 0.78, 0.8], [-0.33, 0.45, 0.6], [-0.36, 0.1, 0.3]]
		_:            # taper: the classic cone
			layers = [[0.0, 1.0, 0.0], [-0.06, 1.03, 0.4], [-0.13, 1.0, 0.5], [-0.3, 0.9, 1.0],
				[-0.55, 0.66, 1.2], [-0.8, 0.38, 1.0], [-1.0, 0.07, 0.4]]
	var rings := []
	for L in layers:
		var r := PackedVector2Array()
		for k in n:
			var p: Vector2 = pts[k] * (L[1] as float)
			r.append(Vector2(c.x, c.z) + p + p.normalized() * lp.rnd(-jit, jit) * (L[2] as float))
		rings.append([c.y + (L[0] as float) * depth + lp.rnd(-0.01, 0.01) * depth, r])
	rings[0][0] = c.y
	rings.reverse()
	var gy := c.y - 0.035 * depth
	var hi: Color = pal.side_hi; var lo: Color = pal.side_lo
	var band := func(ctr: Vector3, nm: Vector3) -> Color:
		if ctr.y > gy: return Env._tone(pal.grass if nm.y > 0.5 else pal.grass_dk, 1.0 + nm.y * 0.05)
		var k := clampf((ctr.y - (c.y - depth)) / depth, 0.0, 1.0)
		if style == "terraces":   # stripes of colour, ledges lit from above
			var stripe := int(floor((c.y - ctr.y) / depth * 9.0)) % 3
			var cl: Color = [hi, hi.lerp(lo, 0.45), Color(0.96, 0.86, 0.66)][stripe]
			return cl.lightened(0.12) if nm.y > 0.5 else cl
		return lo.lerp(hi, k)
	lp.loft(rings, band, style == "basalt" or style == "roots", false, Vector2(c.x, c.z))
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
	match style:
		"basalt": _columns(lp, outer, c, depth, pal)
		"roots": _hanging_roots(lp, outer, c, depth)
		"terraces":
			for k in maxi(2, n / 12):   # a few fallen blocks clinging under the ledges
				var p := Vector2(c.x, c.z) + pts[k * 5 % n] * lp.rnd(0.3, 0.5)
				lp.block(Vector3(p.x, c.y - depth * lp.rnd(0.75, 0.9), p.y), Vector3(0.3, 0.22, 0.26) * depth * 0.35, 0.03, 0.02, Color(0.82, 0.6, 0.4))
		_:
			for k in maxi(2, n / 9):
				var p := Vector2(c.x, c.z) + pts[k * 3 % n] * lp.rnd(0.15, 0.4)
				lp.blob(Vector3(p.x, c.y - depth * lp.rnd(0.35, 0.55), p.y), Vector3(0.18, 0.3, 0.18) * depth * 0.4, 0.25, Env.EARTH_DK)
	return outer


## hexagonal stone columns under the slab, longest in the middle
static func _columns(lp: LP, outer: PackedVector2Array, c: Vector3, depth: float, pal: Dictionary) -> void:
	var bb := Rect2(outer[0], Vector2.ZERO)
	for p in outer: bb = bb.expand(p)
	var step := clampf(depth * 0.26, 0.18, 0.72)
	var r := step * 0.55
	var ctr := bb.get_center(); var maxd := bb.size.length() * 0.5
	var row := 0
	var y := bb.position.y
	while y < bb.end.y:
		var x := bb.position.x + (step * 0.5 if row % 2 else 0.0)
		while x < bb.end.x:
			var p := Vector2(x, y)
			if Geometry2D.is_point_in_polygon(p, outer):
				var k := 1.0 - clampf(p.distance_to(ctr) / maxd, 0.0, 1.0)
				var h := depth * (0.15 + 0.85 * k * k) * lp.rnd(0.6, 1.0)
				var top_y := c.y - depth * 0.12
				var cl: Color = pal.side_lo.lerp(pal.side_hi, lp.rnd(0.1, 0.9))
				lp.cyl(Vector3(p.x, top_y - h, p.y), r * lp.rnd(0.85, 1.0), r * lp.rnd(0.9, 1.0), h, 6, cl, 0.0, lp.rnd(0, 0.3), true)
			x += step
		y += step * 0.87
		row += 1


## roots and vines dangling under a thin slab
static func _hanging_roots(lp: LP, outer: PackedVector2Array, c: Vector3, depth: float) -> void:
	var n := outer.size()
	for k in n / 2:
		var o: Vector2 = outer[(k * 2) % n]
		var p := Vector2(c.x, c.z).lerp(o, lp.rnd(0.35, 0.85))
		var a := Vector3(p.x, c.y - depth * 0.25, p.y)
		var len := depth * lp.rnd(0.3, 0.75)
		var mid := a + Vector3(lp.rnd(-0.1, 0.1) * depth, -len * 0.5, lp.rnd(-0.1, 0.1) * depth)
		var end := a + Vector3(lp.rnd(-0.15, 0.15) * depth, -len, lp.rnd(-0.15, 0.15) * depth)
		var w := depth * 0.035
		Env._limb(lp, a, mid, w, w * 0.7)
		Env._limb(lp, mid, end, w * 0.7, w * 0.15)
		if k % 2 == 0:   # a vine with a few leaves
			var v0 := Vector3(o.x, c.y - 0.02, o.y)
			var v1 := v0 + Vector3(0, -depth * lp.rnd(0.25, 0.5), 0)
			lp.cyl(v1, 0.01 * depth, 0.006 * depth, v0.y - v1.y, 3, Env.GRASS_DK)
			for q in 3:
				lp.blob(v0.lerp(v1, 0.3 + q * 0.25), Vector3(0.035, 0.02, 0.035) * depth, 0.1, Env.LEAF[q % 3])


static func _moss_lip(lp: LP, top: PackedVector2Array) -> void:
	for k in top.size():
		var p: Vector2 = top[k]
		if k % 2 == 0: lp.blob(Vector3(p.x, -0.07, p.y), Vector3(0.09, 0.05, 0.09), 0.2, Env.MOSS)


# ---------------- 2. the plants ----------------

## one tall plant of the island's kind; returns how far its crown reaches from the trunk
static func _plant(lp: LP, at: Vector3, s: float, cr: float, flora: String, pal: Dictionary) -> float:
	match flora:
		"pine": return _pine(lp, at, s)
		"palm": return _palm(lp, at, s)
		"blossom": return _blossom(lp, at, s, cr)
	return Env._tree(lp, at, s, cr)


## the most a plant of this kind can reach from its trunk (checked before it is built)
static func _reach(flora: String, s: float, cr: float) -> float:
	match flora:
		"pine": return 0.62 * s
		"palm": return 1.12 * s
		"blossom": return cr * 0.55 + 0.36 * s
	return cr + 0.1


static func _pine(lp: LP, at: Vector3, s: float) -> float:
	var h := lp.rnd(1.6, 2.2) * s
	lp.cyl(at, 0.07 * s, 0.04 * s, h * 0.35, 5, Env.TRUNK.darkened(0.15))
	var tiers := 4
	var reach := 0.0
	for t in tiers:
		var k := float(t) / tiers
		var r := (0.55 - k * 0.36) * s
		var y := at.y + h * (0.22 + k * 0.2)
		var cl: Color = [Color(0.16, 0.38, 0.22), Color(0.2, 0.45, 0.25), Color(0.25, 0.52, 0.28), Color(0.3, 0.58, 0.3)][t]
		lp.cyl(Vector3(at.x, y, at.z), r, 0.0, h * 0.34, 7, cl, r * 0.08, lp.rnd(0, 1))
		reach = maxf(reach, r * 1.1)
	return reach


static func _palm(lp: LP, at: Vector3, s: float) -> float:
	var h := lp.rnd(1.5, 2.0) * s
	var lean := Vector3(lp.rnd(-0.2, 0.2), 0, lp.rnd(-0.15, 0.08)) * s
	var segs := 6
	var prev := at
	for i in segs:   # a curved trunk of short rings
		var t := float(i + 1) / segs
		var p := at + Vector3(0, h * t, 0) + lean * t * t
		Env._limb(lp, prev, p, 0.065 * s * (1.0 - t * 0.35), 0.06 * s * (1.0 - t * 0.35))
		prev = p
	var crown := prev
	var fronds := 8
	var reach := 0.0
	for f in fronds:   # long drooping fronds: a strip of leaflet triangles
		var a := TAU * f / fronds + lp.rnd(-0.2, 0.2)
		var dir := Vector3(cos(a), 0, sin(a))
		var len := lp.rnd(0.6, 0.8) * s
		var steps := 4
		var last := crown
		for j in steps:
			var t := float(j + 1) / steps
			var p := crown + dir * len * t + Vector3(0, 0.12 * s - t * t * 0.45 * s, 0)
			var side := dir.cross(Vector3.UP).normalized() * 0.11 * s * (1.0 - t * 0.6)
			var cl: Color = [Color(0.26, 0.55, 0.22), Color(0.34, 0.64, 0.26)][j % 2]
			lp.tri(last, p, p + side, cl, last + Vector3(0, -1, 0)); lp.tri(last, p + side, p, cl, last + Vector3(0, 1, 0))
			lp.tri(last, p - side, p, cl, last + Vector3(0, -1, 0)); lp.tri(last, p, p - side, cl, last + Vector3(0, 1, 0))
			last = p
		reach = maxf(reach, Vector2(last.x - at.x, last.z - at.z).length() + 0.1 * s)
	for k in 3: lp.blob(crown + Vector3(cos(k * 2.1) * 0.06, -0.05, sin(k * 2.1) * 0.06) * s, Vector3(0.05, 0.05, 0.05) * s, 0.05, Color(0.45, 0.3, 0.15))
	return reach


static func _blossom(lp: LP, at: Vector3, s: float, cr: float) -> float:
	var h := lp.rnd(1.1, 1.5) * s
	var top := at + Vector3(lp.rnd(-0.05, 0.05), h, lp.rnd(-0.05, 0.05)) * Vector3(s, 1, s)
	Env._limb(lp, at, at.lerp(top, 0.55), 0.07 * s, 0.05 * s)
	var fork := at.lerp(top, 0.55)
	var pink := [Color(0.98, 0.72, 0.82), Color(0.99, 0.84, 0.9), Color(0.96, 0.6, 0.74), Color(0.99, 0.95, 0.96)]
	var reach := 0.0
	for k in 5:   # round clouds of blossom on short branches
		var a := TAU * k / 5.0 + lp.rnd(-0.3, 0.3)
		var out := cr * lp.rnd(0.3, 0.55)
		var c := top + Vector3(cos(a) * out, lp.rnd(-0.15, 0.1) * s, sin(a) * out)
		Env._limb(lp, fork, c, 0.035 * s, 0.02 * s)
		var r := lp.rnd(0.22, 0.32) * s
		lp.blob(c, Vector3(r, r * 0.8, r), 0.12, pink[k % 4])
		reach = maxf(reach, Vector2(c.x - at.x, c.z - at.z).length() + r * 1.1)
	lp.blob(top + Vector3(0, 0.08 * s, 0), Vector3(0.3, 0.24, 0.3) * s, 0.12, pink[1], 1)
	return maxf(reach, 0.32 * s)


## a low plant: bush, fern, reeds or a blossom shrub
static func _shrub(lp: LP, at: Vector3, s: float, flora: String, pal: Dictionary) -> void:
	match flora:
		"pine":   # a fern: arching fronds
			for k in 6:
				var a := TAU * k / 6.0
				var tip := at + Vector3(cos(a) * s * 1.4, s * 0.5, sin(a) * s * 1.4)
				var mid := at + Vector3(cos(a) * s * 0.6, s * 0.9, sin(a) * s * 0.6)
				lp.tri(at, mid, tip, Color(0.3, 0.56, 0.26), at + Vector3(0, -1, 0)); lp.tri(at, tip, mid, Color(0.26, 0.5, 0.24), at + Vector3(0, 1, 0))
		"palm":   # reeds
			for k in 7:
				var p := at + Vector3(lp.rnd(-0.6, 0.6) * s, 0, lp.rnd(-0.6, 0.6) * s)
				lp.cyl(p, 0.012, 0.004, lp.rnd(1.2, 2.2) * s, 3, Color(0.5, 0.62, 0.28))
				if k % 3 == 0: lp.blob(p + Vector3(0, 1.6 * s, 0), Vector3(0.02, 0.06, 0.02), 0.0, Color(0.42, 0.28, 0.16))
		"blossom":
			lp.blob(at + Vector3(0, s * 0.6, 0), Vector3(s, s * 0.8, s), 0.15, Color(0.97, 0.78, 0.86), 1)
		_:
			Env._bush(lp, at, s)


static func _tuft(lp: LP, at: Vector3, h: float, pal: Dictionary) -> void:
	var save := lp.xf
	for k in 4:
		var a := TAU * k / 4.0 + lp.rnd(0, 1)
		var d := lp.rnd(0.0, 0.04)
		var lean := Basis(Vector3(-sin(a), 0, cos(a)), lp.rnd(0.15, 0.5))
		lp.xf = save * Transform3D(lean, at + Vector3(cos(a) * d, -0.01, sin(a) * d))
		lp.cyl(Vector3.ZERO, 0.018, 0.0, h * lp.rnd(0.6, 1.2), 3, [pal.grass_hi, pal.grass_dk, pal.grass_lt][k % 3], 0.0, a, false)
	lp.xf = save


static func _clear_of_river(p: Vector3, r: float) -> bool:
	for i in range(1, _river.size()):
		var q := Geometry2D.get_closest_point_to_segment(Vector2(p.x, p.z), _river[i - 1], _river[i])
		if q.distance_to(Vector2(p.x, p.z)) < r + 0.2: return false
	return true


static func _ok(top: PackedVector2Array, p: Vector3, r: float, hw: float, hh: float) -> bool:
	if absf(p.x) < hw + 0.1 + r * 0.3 and absf(p.z) < hh + 0.1 + r * 0.3: return false   # not on the room
	if p.z > hh + 0.2 and absf(p.x) < hw + 0.3: return false                          # not on the timeline / sign
	return Env._crown_fits(top, p, r) and _clear_of_river(p, r)


# ---------------- 3. where the masses sit ----------------

static func _masses(lp: LP, top: PackedVector2Array, hw: float, hh: float, ex: float, ez_b: float, kind: Dictionary, pal: Dictionary) -> void:
	var flora: String = kind.flora
	var tall := func(at: Vector3, s: float) -> bool:
		var cr := 0.68 * s
		var guess := _reach(flora, s, cr) + 0.05
		if not _ok(top, at, guess, hw, hh): return false
		Env.last_trees.append([at, _plant(lp, at, s, cr, flora, pal), top])
		return true
	match kind.layout:
		"grove":   # a row of trees behind the room
			var x := -ex + 0.6
			while x < ex - 0.5:
				for _try in 12:
					var s := lp.rnd(0.85, 1.15)
					if tall.call(Vector3(x + lp.rnd(-0.15, 0.15), -0.05, -hh - lp.rnd(0.75, Env.GARDEN - 0.7)), s): break
				x += lp.rnd(0.95, 1.25)
		"sides":   # two clumps beside the room, the back left open
			for sd in [-1, 1]:
				var placed := 0
				for _try in 40:
					if placed >= 3: break
					var p := Vector3(sd * (hw + lp.rnd(0.3, 0.75)), -0.05, lp.rnd(-hh - 1.2, hh * 0.4))
					if tall.call(p, lp.rnd(0.6, 0.85)): placed += 1
			for k in 6:
				var p := Vector3(lp.rnd(-ex + 0.3, ex - 0.3), -0.05, -hh - lp.rnd(0.3, Env.GARDEN - 0.3))
				if _ok(top, p, 0.25, hw, hh): _shrub(lp, p, lp.rnd(0.12, 0.2), flora, pal)
		"boulders":   # big mossy rocks and a stone spire; only a couple of trees
			for k in 7:
				var p := Vector3(lp.rnd(-ex + 0.3, ex - 0.3), -0.05, lp.rnd(-hh - Env.GARDEN + 0.4, hh * 0.3))
				var r := lp.rnd(0.18, 0.38)
				if not _ok(top, p, r, hw, hh): continue
				lp.blob(p + Vector3(0, r * 0.55, 0), Vector3(r, r * 0.8, r * 0.9), 0.25, Env._tone(pal.rock, lp.rnd(0.85, 1.0)), 0, -2.0)
				lp.blob(p + Vector3(0, r * 1.15, 0), Vector3(r * 0.7, r * 0.18, r * 0.6), 0.2, Env.MOSS)
			for _try in 30:   # a spire of stacked stones
				var p := Vector3(lp.rnd(-ex + 0.4, ex - 0.4), -0.05, -hh - lp.rnd(0.5, Env.GARDEN - 0.5))
				if not _ok(top, p, 0.3, hw, hh): continue
				var y := 0.0
				for k in 5:
					var sz := 0.34 - k * 0.05
					lp.block(p + Vector3(lp.rnd(-0.03, 0.03), y + sz * 0.4, lp.rnd(-0.03, 0.03)), Vector3(sz, sz * 0.8, sz), 0.04, 0.02, Env._tone(pal.rock, lp.rnd(0.82, 0.98)))
					y += sz * 0.78
				break
			var placed := 0
			for _try in 30:
				if placed >= 2: break
				if tall.call(Vector3(lp.rnd(-ex + 0.5, ex - 0.5), -0.05, -hh - lp.rnd(0.7, Env.GARDEN - 0.7)), lp.rnd(0.8, 1.0)): placed += 1
		"hill":   # a grassy mound behind the room, trees on top, stepping stones up to it
			var hc := Vector3(lp.rnd(-hw * 0.5, hw * 0.5), -0.05, -hh - Env.GARDEN * 0.55)
			var hr := minf(1.0, ex * 0.45)
			lp.blob(hc + Vector3(0, -0.02, 0), Vector3(hr, 0.42, hr * 0.7), 0.06, func(ctr: Vector3, nm: Vector3) -> Color: return pal.grass if nm.y > 0.3 else pal.grass_dk, 1, -0.05)
			var placed := 0
			for _try in 20:
				if placed >= 2: break
				var a := lp.rnd(0, TAU)
				var p := hc + Vector3(cos(a) * hr * 0.35, 0.33, sin(a) * hr * 0.25)
				var s := lp.rnd(0.75, 0.95)
				var guess := _reach(flora, s, 0.68 * s) + 0.05
				if Env._crown_fits(top, p, guess) and _clear_of_river(p, guess):
					Env.last_trees.append([p, _plant(lp, p, s, 0.68 * s, flora, pal), top]); placed += 1
			for k in 4:   # stepping stones from the room's back edge to the hill
				var p := Vector3(0, -0.04, -hh - 0.2).lerp(hc, (k + 0.5) / 4.5)
				lp.cyl(p + Vector3(lp.rnd(-0.05, 0.05), 0, 0), 0.11, 0.1, 0.03, 6, Env._tone(Env.STONE, 1.05))
	# every island keeps at least two tall plants (they frame the room and the birds sit in them)
	var tries := 0
	while Env.last_trees.size() < 2 and tries < 80:
		tries += 1
		tall.call(Vector3(lp.rnd(-ex + 0.4, ex - 0.4), -0.05, -hh - lp.rnd(0.5, Env.GARDEN - 0.4)), lp.rnd(0.55, 0.8))
	# a few low plants everywhere it fits
	for k in 6:
		var p := Vector3(lp.rnd(-ex + 0.2, ex - 0.2), -0.05, lp.rnd(-hh - Env.GARDEN + 0.2, hh * 0.6))
		if _ok(top, p, 0.2, hw, hh): _shrub(lp, p, lp.rnd(0.12, 0.2), flora, pal)


## grass, flowers and small things that tell the kind of island
static func _ground_cover(lp: LP, top: PackedVector2Array, hw: float, hh: float, flora: String, pal: Dictionary) -> void:
	var count := 120 if flora == "palm" else 230
	var placed := 0
	for _i in 1100:
		if placed >= count: break
		var p := Vector3(lp.rnd(-hw - 0.8, hw + 0.8), -0.05, lp.rnd(-hh - Env.GARDEN, hh + 0.9))
		if absf(p.x) < hw + 0.07 and p.z > -hh - 0.07 and p.z < hh + 0.07: continue
		if p.z > hh + 0.15 and absf(p.x) < hw + 0.3: continue
		if not Env._crown_fits(top, p, 0.05) or not _clear_of_river(p, 0.0): continue
		_tuft(lp, p, lp.rnd(0.07, 0.11) if p.z > hh * 0.2 else lp.rnd(0.14, 0.28), pal)
		placed += 1
	for k in 22:
		var p := Vector3(lp.rnd(-hw - 0.7, hw + 0.7), -0.05, lp.rnd(-hh - Env.GARDEN + 0.2, hh + 0.5))
		if not _ok(top, p, 0.08, hw, hh): continue
		match flora:
			"pine":   # mushrooms
				lp.cyl(p, 0.015, 0.012, 0.06, 4, Color(0.95, 0.92, 0.85))
				lp.blob(p + Vector3(0, 0.07, 0), Vector3(0.05, 0.025, 0.05), 0.05, Color(0.85, 0.22, 0.18) if k % 2 else Color(0.82, 0.62, 0.38))
			"blossom":   # fallen petals
				for q in 3:
					var c := p + Vector3(lp.rnd(-0.1, 0.1), 0.005, lp.rnd(-0.1, 0.1))
					lp.tri(c, c + Vector3(0.03, 0, 0.01), c + Vector3(0.01, 0, 0.03), Color(0.98, 0.78, 0.86), c + Vector3(0, -1, 0))
			"palm":   # shells and sand-coloured stones
				lp.blob(p + Vector3(0, 0.02, 0), Vector3(0.05, 0.03, 0.04), 0.2, Color(0.88, 0.78, 0.6))
			_:   # flowers
				var cl: Color = Env.FLOWERS[k % Env.FLOWERS.size()]
				lp.cyl(p, 0.01, 0.006, 0.12, 3, Env.GRASS_DK)
				lp.blob(p + Vector3(0, 0.13, 0), Vector3(0.035, 0.025, 0.035), 0.1, cl)
	if flora == "pine":   # a fallen log
		for _try in 20:
			var p := Vector3(lp.rnd(-hw - 0.5, hw + 0.5), -0.02, -hh - lp.rnd(0.4, Env.GARDEN - 0.4))
			if not _ok(top, p, 0.4, hw, hh): continue
			var a := lp.rnd(0, PI)
			var d := Vector3(cos(a), 0, sin(a)) * 0.38
			Env._limb(lp, p - d + Vector3(0, 0.06, 0), p + d + Vector3(0, 0.06, 0), 0.07, 0.06)
			break


# ---------------- the stream and its waterfall ----------------

static func _stream(lp: LP, top: PackedVector2Array, hw: float, hh: float, ex: float, ez_b: float, side: int, depth: float, pal: Dictionary) -> void:
	# a spring in the back garden, along the side of the room, then over the edge
	var spring := Vector2(side * hw * 0.35, -hh - Env.GARDEN * 0.62)
	var turn := Vector2(side * (hw + 0.38), -hh - 0.45)
	var run := Vector2(side * (hw + 0.42), -hh * 0.25)
	var edge := run
	for i in 60:   # walk outward until the grass ends
		edge.x += side * 0.04
		if not Geometry2D.is_point_in_polygon(edge, top): break
	var ctrl := [spring, spring.lerp(turn, 0.5) + Vector2(side * 0.15, 0.1), turn, run, edge]
	var pts := []
	for i in ctrl.size() - 1:   # Catmull-Rom through the control points
		var p0: Vector2 = ctrl[maxi(i - 1, 0)]; var p1: Vector2 = ctrl[i]; var p2: Vector2 = ctrl[i + 1]; var p3: Vector2 = ctrl[mini(i + 2, ctrl.size() - 1)]
		for k in 6:
			var t := k / 6.0
			pts.append(0.5 * ((2.0 * p1) + (-p0 + p2) * t + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t * t + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t * t * t))
	pts.append(edge)
	_river = pts.duplicate()
	# the spring: a ring of stones around a small pool
	for k in 7:
		var a := TAU * k / 7.0
		lp.blob(Vector3(spring.x + cos(a) * 0.24, -0.02, spring.y + sin(a) * 0.2), Vector3(0.08, 0.06, 0.07), 0.25, Env._tone(pal.rock, lp.rnd(0.85, 1.0)))
	# banks: pebbles along both sides
	for i in range(1, pts.size() - 1, 2):
		var a: Vector2 = pts[i - 1]; var b: Vector2 = pts[i + 1]
		var nrm := (b - a).normalized().orthogonal()
		for sd in [-1, 1]:
			var q: Vector2 = pts[i] + nrm * sd * lp.rnd(0.13, 0.17)
			lp.blob(Vector3(q.x, -0.04, q.y), Vector3(0.045, 0.03, 0.04), 0.3, Env._tone(Env.WHITE_ROCK, lp.rnd(0.8, 0.95)))
	# water: a flat ribbon on the grass, then a falling sheet down the island's side
	var path := []
	for p in pts: path.append(Vector3(p.x, -0.035, p.y))
	var out := Vector3(side, 0, 0)
	var e3 := Vector3(edge.x, -0.035, edge.y)
	var fall := [e3, e3 + out * 0.08 + Vector3(0, -0.06, 0), e3 + out * 0.16 + Vector3(0, -0.35, 0), e3 + out * 0.22 + Vector3(0, -depth * 0.55, 0), e3 + out * 0.26 + Vector3(0, -depth * 1.05, 0)]
	last_water.append(_ribbon(path, 0.2, Vector3.UP, 1.0, false))
	last_water.append(_ribbon(fall, 0.26, out, 1.6, true))
	# foam where it tips over and mist where it fades
	last_water.append(_mist(e3 + out * 0.12 + Vector3(0, -0.04, 0), 0.6))
	last_water.append(_mist(e3 + out * 0.24 + Vector3(0, -depth * 0.75, 0), 1.6))


static func _water_texture() -> ImageTexture:
	if _water_tex: return _water_tex
	var img := Image.create(32, 64, false, Image.FORMAT_RGBA8)
	for y in 64:
		for x in 32:
			var w := 0.5 + 0.5 * sin(y * TAU / 16.0 + sin(x * 0.4) * 1.5)
			var foam := clampf((w - 0.82) * 6.0, 0.0, 1.0)
			img.set_pixel(x, y, Color(0.36, 0.7, 0.92).lerp(Color(0.86, 0.96, 1.0), foam))
	img.generate_mipmaps()
	_water_tex = ImageTexture.create_from_image(img)
	return _water_tex


## a strip of water along a path; `up` is the side the strip faces; v runs along the path (scrolled by the board)
static func _ribbon(path: Array, width: float, up: Vector3, speed: float, fade: bool) -> MeshInstance3D:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var dist := 0.0
	var prev_l := Vector3.ZERO; var prev_r := Vector3.ZERO; var prev_v := 0.0; var prev_a := 1.0
	for i in path.size():
		var p: Vector3 = path[i]
		var tan: Vector3 = ((path[mini(i + 1, path.size() - 1)] as Vector3) - (path[maxi(i - 1, 0)] as Vector3)).normalized()
		var side := tan.cross(up).normalized() * width * 0.5
		if i > 0: dist += p.distance_to(path[i - 1])
		var v := dist * 2.0
		var a := 1.0 if not fade else 1.0 - float(i) / (path.size() - 1) * 0.9
		var l := p - side; var r := p + side
		if i > 0:
			for q in [[prev_l, 0.0, prev_v, prev_a], [prev_r, 1.0, prev_v, prev_a], [r, 1.0, v, a], [prev_l, 0.0, prev_v, prev_a], [r, 1.0, v, a], [l, 0.0, v, a]]:
				st.set_color(Color(1, 1, 1, q[3])); st.set_uv(Vector2(q[1], q[2])); st.add_vertex(q[0])
		prev_l = l; prev_r = r; prev_v = v; prev_a = a
	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	var m := StandardMaterial3D.new()
	m.albedo_texture = _water_texture()
	m.vertex_color_use_as_albedo = true
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.albedo_color = Color(1, 1, 1, 0.88)
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	m.roughness = 0.15
	m.metallic_specular = 0.6
	m.emission_enabled = true; m.emission = Color(0.18, 0.38, 0.5)
	m.set_meta("speed", speed)
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	water_mats.append(m)
	return mi


static func _mist(at: Vector3, size: float) -> CPUParticles3D:
	var p := CPUParticles3D.new()
	p.local_coords = true
	p.position = at
	p.amount = 10; p.lifetime = 1.2
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE; p.emission_sphere_radius = 0.08 * size
	p.direction = Vector3(0, -1, 0); p.spread = 50; p.gravity = Vector3(0, -0.6, 0)
	p.initial_velocity_min = 0.1 * size; p.initial_velocity_max = 0.3 * size
	var dot := SphereMesh.new(); dot.radius = 0.03 * size; dot.height = 0.06 * size; dot.radial_segments = 6; dot.rings = 3
	var m := StandardMaterial3D.new(); m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = Color(0.92, 0.97, 1.0, 0.75); m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	dot.material = m
	p.mesh = dot
	var curve := Curve.new(); curve.add_point(Vector2(0, 0.3)); curve.add_point(Vector2(0.3, 1)); curve.add_point(Vector2(1, 0))
	p.scale_amount_curve = curve
	return p

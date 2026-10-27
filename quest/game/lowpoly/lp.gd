extends RefCounted
## Low-poly faceted mesh builder (Quest 0.6.0 art style: faceted, matte, rich natural colours).
## Every triangle is flat shaded and carries one vertex colour, already in sRGB because the
## Compatibility renderer shows vertex colours as stored. Light is "baked" into the colours:
## lower faces and faces looking down are darker, faces looking up slightly lighter, and each
## face gets a small random tone so stone and leaves read as facets, not flat plastic.
## Seeded: the same seed always gives the same shapes (rooms look the same every visit).

var v := PackedVector3Array()
var nrm := PackedVector3Array()
var col := PackedColorArray()
var xf := Transform3D.IDENTITY      # applied to every point given to the primitives
var rng := RandomNumberGenerator.new()
var ao_low := -0.4                  # mesh-space height where the baked shade is darkest
var ao_high := 1.0                  # ...and where it is fully lit
var ao_min := 0.62
var shade_jitter := 0.05
var face_light := true              # brighter up-facing, darker down-facing faces


func _init(seed_: int = 1) -> void:
	rng.seed = seed_


func tris() -> int:
	return v.size() / 3


func rnd(a: float, b: float) -> float:
	return rng.randf_range(a, b)


func jv(j: float) -> Vector3:
	return Vector3(rng.randf_range(-j, j), rng.randf_range(-j, j), rng.randf_range(-j, j))


## one mesh-space triangle, turned to face away from `inside`. `cl` is a Color or a
## Callable(centre: Vector3, normal: Vector3) -> Color (for gradients and patterns)
func tri_w(a: Vector3, b: Vector3, c: Vector3, cl, inside: Vector3) -> void:
	var n := (b - a).cross(c - a)
	if n.length_squared() < 1e-14:
		return
	n = n.normalized()
	var ctr := (a + b + c) / 3.0
	if n.dot(ctr - inside) < 0.0:
		n = -n
		var t := b; b = c; c = t
	var base: Color = cl.call(ctr, n) if cl is Callable else cl
	var k := lerpf(ao_min, 1.0, clampf((ctr.y - ao_low) / maxf(ao_high - ao_low, 0.001), 0.0, 1.0))
	if face_light:
		k *= (1.0 + 0.10 * n.y) if n.y > 0.0 else (1.0 + 0.25 * n.y)
	k *= 1.0 + rng.randf_range(-shade_jitter, shade_jitter)
	var c2 := Color(clampf(base.r * k, 0, 1), clampf(base.g * k, 0, 1), clampf(base.b * k, 0, 1), base.a)
	# Godot draws clockwise triangles as front faces: emit the outward (counter-clockwise) one reversed
	v.append(a); v.append(c); v.append(b)
	for i in 3:
		nrm.append(n); col.append(c2)


## a convex polygon from unordered (nearly coplanar) local points, fanned into triangles
func poly(pts: Array, cl, inside: Vector3) -> void:
	var w := []
	for p in pts:
		w.append(xf * (p as Vector3))
	var ins := xf * inside
	var c := Vector3.ZERO
	for p in w:
		c += p
	c /= float(w.size())
	var ax: Vector3 = (c - ins).normalized()
	var u := ax.cross(Vector3.UP if absf(ax.y) < 0.9 else Vector3.RIGHT).normalized()
	var t := ax.cross(u)
	w.sort_custom(func(p, q): return atan2((p - c).dot(t), (p - c).dot(u)) < atan2((q - c).dot(t), (q - c).dot(u)))
	for i in range(1, w.size() - 1):
		tri_w(w[0], w[i], w[i + 1], cl, ins)


func tri(a: Vector3, b: Vector3, c: Vector3, cl, inside: Vector3) -> void:
	tri_w(xf * a, xf * b, xf * c, cl, xf * inside)


## chamfered box: a stone, a plank, a slab. `jit` moves each corner a little so no two are alike.
## `top` (optional Color) paints the upper face, e.g. moss or a lighter cap.
func block(c: Vector3, s: Vector3, bev: float, jit: float, cl, top = null) -> void:
	var h := s / 2.0
	var b := minf(bev, minf(h.x, minf(h.y, h.z)) * 0.9)
	var P := {}
	for sx in [-1, 1]:
		for sy in [-1, 1]:
			for sz in [-1, 1]:
				var j := jv(jit)
				P[Vector3i(sx, sy, sz)] = [
					c + j + Vector3(sx * h.x, sy * (h.y - b), sz * (h.z - b)),
					c + j + Vector3(sx * (h.x - b), sy * h.y, sz * (h.z - b)),
					c + j + Vector3(sx * (h.x - b), sy * (h.y - b), sz * h.z)]
	for a in 3:
		for sg in [-1, 1]:
			var pts := []
			for k in P:
				if (k as Vector3i)[a] == sg: pts.append(P[k][a])
			poly(pts, top if (a == 1 and sg == 1 and top != null) else cl, c)
	for a in 3:
		for b2 in range(a + 1, 3):
			for sa in [-1, 1]:
				for sb in [-1, 1]:
					var pts := []
					for k in P:
						if (k as Vector3i)[a] == sa and (k as Vector3i)[b2] == sb:
							pts.append(P[k][a]); pts.append(P[k][b2])
					poly(pts, cl, c)
	for k in P:
		tri(P[k][0], P[k][1], P[k][2], cl, c)


const _ICO_F := [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4],
	[11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
	[4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]]

static func _ico_v() -> Array:
	var t := (1.0 + sqrt(5.0)) / 2.0
	var out := []
	for p in [Vector3(-1, t, 0), Vector3(1, t, 0), Vector3(-1, -t, 0), Vector3(1, -t, 0),
			Vector3(0, -1, t), Vector3(0, 1, t), Vector3(0, -1, -t), Vector3(0, 1, -t),
			Vector3(t, 0, -1), Vector3(t, 0, 1), Vector3(-t, 0, -1), Vector3(-t, 0, 1)]:
		out.append((p as Vector3).normalized())
	return out


## faceted blob: an icosahedron (sub 0: 20 faces, sub 1: 80) with each vertex pushed in or
## out. Rocks, leaf clusters, heads, hands. `cut` keeps only the part above that height (-1..1).
func blob(c: Vector3, r: Vector3, jit: float, cl, sub: int = 0, cut: float = -2.0, keep: Callable = Callable()) -> void:
	var verts: Array = _ico_v()
	var faces: Array = _ICO_F.duplicate(true)
	for _i in sub:
		var mids := {}
		var nf := []
		for f in faces:
			var m := []
			for e in 3:
				var a: int = f[e]; var b: int = f[(e + 1) % 3]
				var key := Vector2i(mini(a, b), maxi(a, b))
				if not mids.has(key):
					verts.append(((verts[a] as Vector3) + (verts[b] as Vector3)).normalized())
					mids[key] = verts.size() - 1
				m.append(mids[key])
			nf.append([f[0], m[0], m[2]]); nf.append([f[1], m[1], m[0]]); nf.append([f[2], m[2], m[1]]); nf.append([m[0], m[1], m[2]])
		faces = nf
	var pts := []
	for p in verts:
		var d: Vector3 = p
		pts.append(c + (d * (1.0 + rng.randf_range(-jit, jit))) * r)
	for f in faces:
		var a: Vector3 = verts[f[0]]; var b: Vector3 = verts[f[1]]; var cc: Vector3 = verts[f[2]]
		if cut > -1.5 and (a.y + b.y + cc.y) / 3.0 < cut:
			continue
		if keep.is_valid() and not keep.call((a + b + cc) / 3.0):
			continue
		tri(pts[f[0]], pts[f[1]], pts[f[2]], cl, c)


## a solid lofted through horizontal rings (same point count each), closed at both ends:
## columns, trunks, the island. rings: [[y, PackedVector2Array (x, z)], ...] from bottom to top
func loft(rings: Array, cl, cap_bottom := true, cap_top := true, axis := Vector2.ZERO) -> void:
	var n: int = (rings[0][1] as PackedVector2Array).size()
	for i in rings.size() - 1:
		var y0: float = rings[i][0]; var y1: float = rings[i + 1][0]
		var r0: PackedVector2Array = rings[i][1]; var r1: PackedVector2Array = rings[i + 1][1]
		var ins := Vector3(axis.x, (y0 + y1) / 2.0, axis.y)
		for k in n:
			var k2 := (k + 1) % n
			var a := Vector3(r0[k].x, y0, r0[k].y); var b := Vector3(r0[k2].x, y0, r0[k2].y)
			var c := Vector3(r1[k].x, y1, r1[k].y); var d := Vector3(r1[k2].x, y1, r1[k2].y)
			tri(a, b, d, cl, ins); tri(a, d, c, cl, ins)
	if cap_bottom: _cap(rings[0], cl, -1.0, axis)
	if cap_top: _cap(rings[rings.size() - 1], cl, 1.0, axis)


func _cap(ring: Array, cl, s: float, axis: Vector2) -> void:
	var y: float = ring[0]; var r: PackedVector2Array = ring[1]
	var ctr := Vector3(axis.x, y, axis.y)
	var ins := ctr - Vector3(0, s, 0)
	for k in r.size():
		var k2 := (k + 1) % r.size()
		tri(ctr, Vector3(r[k].x, y, r[k].y), Vector3(r[k2].x, y, r[k2].y), cl, ins)


static func circle(n: int, rx: float, rz: float, phase := 0.0, cx := 0.0, cz := 0.0) -> PackedVector2Array:
	var out := PackedVector2Array()
	for k in n:
		var a := TAU * k / n + phase
		out.append(Vector2(cx + cos(a) * rx, cz + sin(a) * rz))
	return out


## low-poly column / cone / disc (r1 = 0 gives a point)
func cyl(c: Vector3, r0: float, r1: float, h: float, n: int, cl, jit := 0.0, phase := 0.0) -> void:
	var a := circle(n, r0, r0, phase, c.x, c.z)
	var b := circle(n, maxf(r1, 0.0001), maxf(r1, 0.0001), phase, c.x, c.z)
	if jit > 0.0:
		for k in n:
			a[k] += Vector2(rnd(-jit, jit), rnd(-jit, jit)); b[k] += Vector2(rnd(-jit, jit), rnd(-jit, jit))
	loft([[c.y, a], [c.y + h, b]], cl, true, r1 > 0.0, Vector2(c.x, c.z))


## everything so far as one mesh (one draw call)
func commit(mat: Material = null) -> ArrayMesh:
	var m := ArrayMesh.new()
	if v.size() == 0:
		return m
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = v
	arr[Mesh.ARRAY_NORMAL] = nrm
	arr[Mesh.ARRAY_COLOR] = col
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	m.surface_set_material(0, mat if mat else material())
	return m


func clear() -> void:
	v = PackedVector3Array(); nrm = PackedVector3Array(); col = PackedColorArray()
	xf = Transform3D.IDENTITY


static var _mat: StandardMaterial3D

## matte, coloured by the vertex colours
static func material() -> StandardMaterial3D:
	if _mat == null:
		_mat = StandardMaterial3D.new()
		_mat.vertex_color_use_as_albedo = true
		_mat.roughness = 1.0
		_mat.metallic_specular = 0.12
	return _mat

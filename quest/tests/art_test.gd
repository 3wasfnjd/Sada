extends SceneTree
## Checks the code-built art (game/lowpoly/), no headset needed:
##   godot --headless --xr-mode off --path quest -s res://tests/art_test.gd
## - every wall stone stays on its own cell (the old imported wall stood in the next row)
## - floor tops stay flat (the hero's feet), door frame / plate / exit centred on their cell
## - triangle budget per room (Quest), and the hero's faces switch as asked

const Env = preload("res://game/lowpoly/env.gd")
const Islands = preload("res://game/lowpoly/islands.gd")
const Hero = preload("res://game/lowpoly/fox_v2.gd")   # the hero since Quest 1.1 (the user's model); fox_up.gd before it
const Logic = preload("res://core/sada_logic.gd")
const BUDGET := 60000   # triangles for a whole room with its island, doors, neon and figures

var failed := 0

func fail(m: String) -> void:
	failed += 1; printerr("FAIL ", m)


func _init() -> void:
	_run.call_deferred()


func _box(m: Mesh) -> AABB:
	return m.get_aabb()


func _run() -> void:
	# walls: one cell at a time, each must stay inside its own square
	var W := 7; var H := 5
	for c in [Vector2i(0, 0), Vector2i(3, 2), Vector2i(6, 4), Vector2i(2, 4)]:
		var b := _box(Env.wall_mesh([c], W, H, 3 + c.x))
		var at := Vector3(c.x - (W - 1) / 2.0, 0, -(c.y - (H - 1) / 2.0))
		var ctr := b.get_center()
		if absf(ctr.x - at.x) > 0.05 or absf(ctr.z - at.z) > 0.05: fail("wall %s off its cell: %s" % [c, ctr])
		if b.size.x > 1.07 or b.size.z > 1.07: fail("wall %s wider than a cell: %s" % [c, b.size])
		if b.position.y < -0.06 or b.end.y > Env.WALL_H + 0.25: fail("wall %s height out of range: %s" % [c, b])
	# floor: tops flat enough to stand on
	var cells := []
	for y in H:
		for x in W: cells.append(Vector2i(x, y))
	var fb := _box(Env.floor_mesh(cells, W, H, 9))
	if fb.end.y > 0.03: fail("floor sticks up: top at %.3f" % fb.end.y)
	if absf(fb.get_center().x) > 0.05 or absf(fb.get_center().z) > 0.05: fail("floor not centred: %s" % fb.get_center())
	var parts := {"door frame": Env.door_frame_mesh(1), "plate": Env.plate_mesh(1), "exit": Env.exit_mesh(1)}
	for k in parts:
		var c: Vector3 = (parts[k] as Mesh).get_aabb().get_center()
		if absf(c.x) > 0.05 or absf(c.z) > 0.05: fail("%s not centred on its cell: %s" % [k, c])
	var fr := Env.door_frame_mesh(1).get_aabb()
	if fr.size.x > 1.1: fail("door frame wider than its cell: %s" % fr.size)
	# hero: built, about one cell tall, faces switch
	var h: Node3D = Hero.new()
	h.build(false)
	root.add_child(h)
	await process_frame
	var hb := AABB(); var first := true
	for mi in h.find_children("*", "MeshInstance3D", true, false):
		var bb: AABB = (mi as MeshInstance3D).global_transform * (mi as MeshInstance3D).get_aabb()
		hb = bb if first else hb.merge(bb); first = false
	if hb.size.y < 0.7 or hb.size.y > 1.0: fail("hero height %.2f (want 0.7..1.0 cells)" % hb.size.y)
	# an animal is long: up to one cell nose to tail, a bit under one cell wide
	if hb.size.x > 0.75 or hb.size.z > 1.0: fail("hero bigger than a cell: %s" % hb.size)
	# the clips and face shapes the game needs, and the expressions reach the face
	for c in ["Idle", "Idle_Fidget", "Walk", "Hop", "Bump", "Land", "Cheer", "Worry"]:
		if not h.ap.has_animation(c): fail("hero clip missing: %s" % c)
	for k in ["blink", "eyes_happy", "eyes_closed", "eyes_wide", "mouth_open", "mouth_worry", "brows_up", "brows_worry"]:
		if not h._shape.has(k): fail("hero face shape missing: %s" % k)
	h.expr("surprise", 2.0)
	for _i in 30: await process_frame
	if h.face.get_blend_shape_value(h._shape["eyes_wide"]) < 0.5: fail("surprise not on the face")
	h.expr("calm", 0.0); h.worry = 1.0
	for _i in 30: await process_frame
	if h.face.get_blend_shape_value(h._shape["mouth_worry"]) < 0.5: fail("worry (steps running out) not shown")
	if h.ap.current_animation != "Worry": fail("worried idle clip not playing (%s)" % h.ap.current_animation)
	h.worry = 0.0
	for a in ["walk", "bump", "cheer", "idle"]:
		h.play(a)
		await process_frame
	var g: Node3D = Hero.new()
	g.build(true, StandardMaterial3D.new())
	root.add_child(g)
	for _i in 3: await process_frame
	if g.face.get_blend_shape_value(g._shape["eyes_closed"]) < 0.99: fail("echo eyes should be closed")
	var hero_tris := _tris(h)
	# rooms: triangle budget through the real board
	var board: Node3D = load("res://game/board.gd").new()
	root.add_child(board)
	var worst := 0; var worst_k := 0
	var prev_kind := {}
	var seen := {}
	for k in range(1, 61):
		var R = Logic.room_for(k, 77)
		if R == null: continue
		board.build(R)
		board.spawn(R.E + 1, Logic.start_pos(R, R.E + 1))
		await process_frame
		# islands: neighbouring rooms differ in rock base and plants; all kinds show up
		var kind: Dictionary = Islands.last_kind
		if prev_kind and (kind.base == prev_kind.base or kind.flora == prev_kind.flora):
			fail("room %d: same island base/plants as the room before (%s)" % [k, kind])
		prev_kind = kind
		for f in ["base", "flora", "layout", "shape"]: seen[kind[f]] = true
		seen["river" if kind.river else "dry"] = true
		# trees: every crown stays over its own island, no trunk on the room
		if Env.last_trees.is_empty(): fail("room %d: no trees" % k)
		for tr in Env.last_trees:
			var at: Vector3 = tr[0]; var reach: float = tr[1]
			if not Env._crown_fits(tr[2], at, reach): fail("room %d: tree at %s reaches off its island (%.2f)" % [k, at, reach])
			if absf(at.x) < R.W / 2.0 + 0.1 and absf(at.z) < R.H / 2.0 + 0.1: fail("room %d: tree on the room at %s" % [k, at])
		var t := _tris(board)
		if t > worst: worst = t; worst_k = k
		if t > BUDGET: fail("room %d (%dx%d): %d triangles > %d" % [k, R.W, R.H, t, BUDGET])
	for want_kind in Islands.BASES + Islands.FLORAS + Islands.LAYOUTS + ["round", "lobed", "long", "river", "dry"]:
		if not seen.has(want_kind): fail("island kind never used in rooms 1-60: %s" % want_kind)
	print("hero: %d triangles; heaviest room: %d (%d triangles, budget %d)" % [hero_tris, worst_k, worst, BUDGET])
	print("art test: %d failure(s)" % failed)
	quit(1 if failed else 0)


func _tris(n: Node) -> int:
	var t := 0
	for c in n.find_children("*", "GeometryInstance3D", true, false):
		if not (c as Node3D).is_visible_in_tree(): continue
		if c is MeshInstance3D and (c as MeshInstance3D).mesh:
			t += (c as MeshInstance3D).mesh.get_faces().size() / 3
		elif c is MultiMeshInstance3D and (c as MultiMeshInstance3D).multimesh.mesh:
			var mm := (c as MultiMeshInstance3D).multimesh
			var cnt := mm.visible_instance_count if mm.visible_instance_count >= 0 else mm.instance_count
			t += mm.mesh.get_faces().size() / 3 * cnt
		elif c is CPUParticles3D and (c as CPUParticles3D).mesh:
			t += (c as CPUParticles3D).mesh.get_faces().size() / 3 * (c as CPUParticles3D).amount
	return t

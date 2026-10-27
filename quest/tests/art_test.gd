extends SceneTree
## Checks the code-built art (game/lowpoly/), no headset needed:
##   godot --headless --xr-mode off --path quest -s res://tests/art_test.gd
## - every wall stone stays on its own cell (the old imported wall stood in the next row)
## - floor tops stay flat (the hero's feet), door frame / plate / exit centred on their cell
## - triangle budget per room (Quest), and the hero's faces switch as asked

const Env = preload("res://game/lowpoly/env.gd")
const Hero = preload("res://game/lowpoly/fox_up.gd")   # the hero since 0.9.0 (fox.gd: on four legs; hero.gd: the elder)
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
	var want := {"calm": [0, 0], "smile": [1, 0], "surprise": [0, 1], "worry": [0, 2], "joy": [1, 1]}
	for x in want:
		h.expr(x, 0.0)
		var eye: Node3D = h.eyes[0]
		if not (eye.get_child(want[x][0]) as Node3D).visible: fail("expr %s: wrong eyes" % x)
		if not (h.mouth.get_child(want[x][1]) as Node3D).visible: fail("expr %s: wrong mouth" % x)
	h.expr("calm", 0.0); h.worry = 1.0
	await process_frame
	if not (h.mouth.get_child(2) as Node3D).visible: fail("worry (steps running out) not shown")
	for a in ["walk", "bump", "cheer", "idle"]:
		h.play(a)
		await process_frame
	var g: Node3D = Hero.new()
	g.build(true, StandardMaterial3D.new())
	root.add_child(g)
	if not (g.eyes[0].get_child(2) as Node3D).visible: fail("echo eyes should be closed")
	var hero_tris := _tris(h)
	# rooms: triangle budget through the real board
	var board: Node3D = load("res://game/board.gd").new()
	root.add_child(board)
	var worst := 0; var worst_k := 0
	for k in [1, 3, 6, 9, 12, 16, 20, 25, 30]:
		var R = Logic.room_for(k, 77)
		if R == null: continue
		board.build(R)
		board.spawn(R.E + 1, Logic.start_pos(R, R.E + 1))
		await process_frame
		# trees: every crown stays over its own island, no trunk on the room
		if Env.last_trees.is_empty(): fail("room %d: no trees" % k)
		for tr in Env.last_trees:
			var at: Vector3 = tr[0]; var reach: float = tr[1]
			if not Env._crown_fits(tr[2], at, reach): fail("room %d: tree at %s reaches off its island (%.2f)" % [k, at, reach])
			if absf(at.x) < R.W / 2.0 + 0.1 and absf(at.z) < R.H / 2.0 + 0.1: fail("room %d: tree on the room at %s" % [k, at])
		var t := _tris(board)
		if t > worst: worst = t; worst_k = k
		if t > BUDGET: fail("room %d (%dx%d): %d triangles > %d" % [k, R.W, R.H, t, BUDGET])
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

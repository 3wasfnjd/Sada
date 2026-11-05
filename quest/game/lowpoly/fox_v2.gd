extends Node3D
## The hero since Quest 1.1: the user's fox model v2 (assets/hero/fox_tayf_v2.glb — rigged, 8 clips:
## Idle, Idle_Fidget, Walk, Hop, Bump, Land, Cheer, Worry; 9 face shapes on Fox_Face).
## Same interface as the code-built fox (fox_up.gd), so the board can use either:
##   build(ghost, ghost_material) · play("idle"|"walk"|"hop"|"bump"|"land"|"cheer") · expr(name, s) · worry
## The clips carry their own faces (blinks, smiles). On top of them, after the clip is applied each
## frame, this adds the game's expressions (surprise on a bump, worry when steps run out), and an
## echo keeps its eyes closed. Faces +z; scaled so the ear tips stand 0.88 cells high.

const SCENE := preload("res://assets/hero/fox_tayf_v2.glb")
const MODEL_H := 2.93           # ear tip height in the file (metres in the file, cells in the game)
const HEIGHT := 0.88            # in cells
const CLIP := {"idle": "Idle", "walk": "Walk", "hop": "Hop", "bump": "Bump", "land": "Land", "cheer": "Cheer", "worry": "Worry", "fidget": "Idle_Fidget"}
const LOOPS := ["Idle", "Walk", "Cheer", "Worry"]
## extra face weights per expression (added over the clip's own face, never lowering it)
const FACE := {
	"calm": {},
	"smile": {"eyes_happy": 0.6},
	"surprise": {"eyes_wide": 1.0, "brows_up": 1.0, "mouth_open": 0.7},
	"worry": {"mouth_worry": 1.0, "brows_worry": 1.0},
	"joy": {"eyes_happy": 1.0, "mouth_open": 0.8, "brows_up": 0.4},
}

var ghost := false
var anim := "idle"
var worry := 0.0
var model: Node3D
var ap: AnimationPlayer
var face: MeshInstance3D
var _shape := {}               # face shape name -> index
var _expr := "calm"
var _expr_t := 0.0
var _w := {}                   # current extra weights (eased)
var _idle_t := 0.0
var _next_fidget := 7.0


func build(as_ghost: bool, ghost_material: Material = null) -> void:
	ghost = as_ghost
	model = SCENE.instantiate()
	model.scale = Vector3.ONE * (HEIGHT / MODEL_H)
	add_child(model)
	ap = model.find_child("AnimationPlayer", true, false)
	for mi in model.find_children("*", "MeshInstance3D", true, false):
		var m := mi as MeshInstance3D
		if ghost and ghost_material: m.material_override = ghost_material
		if m.mesh and m.mesh.get_blend_shape_count() > 0:
			face = m
			for i in m.mesh.get_blend_shape_count(): _shape[str(m.mesh.get_blend_shape_name(i))] = i
	if ap:
		for c in LOOPS:
			if ap.has_animation(c): ap.get_animation(c).loop_mode = Animation.LOOP_LINEAR
		ap.mixer_applied.connect(_face_over)
		ap.animation_finished.connect(_on_finished)
	_next_fidget = randf_range(6.0, 10.0)
	play("idle")


func _ready() -> void:
	# build() runs before the board adds us to the tree, where a clip can't start yet
	if ap and ap.current_animation == "": _clip(anim)
	_face_over()


## the board's names for what the hero does
func play(name: String) -> void:
	if name == anim and (name == "idle" or name == "walk" or name == "cheer"):
		return
	anim = name
	_idle_t = 0.0
	match name:
		"bump": expr("surprise", 0.9)
		"cheer": expr("joy", 0.0)
	_clip(name)


func _clip(name: String) -> void:
	if ap == null: return
	var c: String = CLIP.get(name, "Idle")
	if name == "idle" and worry > 0.5 and not ghost: c = "Worry"
	if ap.has_animation(c): ap.play(c, 0.12)


func _on_finished(_c: StringName) -> void:
	# one-shot clips (hop, bump, land, fidget) settle back into idle
	if anim != "walk" and anim != "cheer":
		anim = "idle"
		_clip("idle")


func expr(name: String, seconds: float) -> void:
	if ghost: return
	_expr = name
	_expr_t = seconds


func _process(dt: float) -> void:
	if _expr_t > 0.0:
		_expr_t -= dt
		if _expr_t <= 0.0: _expr = "calm"
	var mood := _expr
	if mood == "calm" and worry > 0.5: mood = "worry"
	var want: Dictionary = FACE.get(mood, {})
	for k in _shape:
		_w[k] = move_toward(float(_w.get(k, 0.0)), float(want.get(k, 0.0)), dt * 6.0)
	# idle: switch to the worried stance when steps run out, and fidget now and then
	if anim == "idle" and ap and not ghost:
		var want_clip := "Worry" if worry > 0.5 else "Idle"
		if ap.current_animation != want_clip and ap.current_animation != "Idle_Fidget": ap.play(want_clip, 0.25)
		_idle_t += dt
		if _idle_t > _next_fidget and want_clip == "Idle" and ap.has_animation("Idle_Fidget"):
			_idle_t = 0.0; _next_fidget = randf_range(7.0, 12.0)
			ap.play("Idle_Fidget", 0.2)


## runs right after the clip has set the face for this frame
func _face_over() -> void:
	if face == null: return
	if ghost:   # an echo walks with its eyes closed
		for k in ["blink", "eyes_happy", "eyes_wide"]:
			if _shape.has(k): face.set_blend_shape_value(_shape[k], 0.0)
		if _shape.has("eyes_closed"): face.set_blend_shape_value(_shape["eyes_closed"], 1.0)
		return
	for k in _w:
		var i: int = _shape[k]
		face.set_blend_shape_value(i, maxf(face.get_blend_shape_value(i), _w[k]))

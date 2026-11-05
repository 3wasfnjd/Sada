extends Node3D
## The in-game menu (☰ on the left controller, Esc on a desktop): a panel floating in front of you
## with five pages — how to play, settings, language, studio, about. Drawn as a normal Godot UI in a
## SubViewport shown on a quad; the right controller's ray points at it and the trigger clicks.
## No studio logo here: the approved logo appears only once, as the system splash at launch.

signal action(name: String, value: Variant)   # sound, volume, life, card, recenter, zoom, restart, lang, close

const S = preload("res://game/strings.gd")
const SIZE := Vector2i(1100, 760)
const QUAD := Vector2(0.66, 0.456)   # metres

var lang := "ar"
var version := "1.0.0"
var settings := {"sound": true, "volume": 0.8, "life": true, "card": true}
var vp: SubViewport
var quad: MeshInstance3D
var dot: MeshInstance3D
var page := "howto"
var _font: FontFile
var _held := false
var _last_px := Vector2(-1, -1)
var _restart_armed := false


func _ready() -> void:
	vp = SubViewport.new()
	vp.size = SIZE
	vp.transparent_bg = true
	vp.render_target_update_mode = SubViewport.UPDATE_WHEN_VISIBLE
	vp.gui_embed_subwindows = true
	add_child(vp)
	quad = MeshInstance3D.new()
	var q := QuadMesh.new(); q.size = QUAD
	quad.mesh = q
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.albedo_texture = vp.get_texture()
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	quad.material_override = m
	quad.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(quad)
	dot = MeshInstance3D.new()
	var s := SphereMesh.new(); s.radius = 0.004; s.height = 0.008; s.radial_segments = 8; s.rings = 4
	dot.mesh = s
	var dm := StandardMaterial3D.new(); dm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; dm.albedo_color = Color(1, 0.85, 0.5)
	dot.material_override = dm; dot.visible = false
	add_child(dot)
	_font = FontFile.new()
	_font.load_dynamic_font("res://assets/fonts/baloo-arabic.woff2")
	var latin := FontFile.new(); latin.load_dynamic_font("res://assets/fonts/baloo-latin.woff2")
	_font.fallbacks = [latin]
	visible = false
	rebuild()


func is_open() -> bool:
	return visible


func open_at(head: Transform3D) -> void:
	var fwd := -head.basis.z; fwd.y = 0
	if fwd.length() < 0.1: fwd = Vector3(0, 0, -1)
	fwd = fwd.normalized()
	global_position = head.origin + fwd * 0.62 + Vector3(0, -0.12, 0)
	global_basis = Basis(Vector3.UP, atan2(-fwd.x, -fwd.z))
	rotate_object_local(Vector3.RIGHT, -0.12)
	_restart_armed = false
	page = "howto"
	rebuild()
	visible = true


func close() -> void:
	visible = false; dot.visible = false
	_held = false


# ---------------- pointing ----------------

## the point (in viewport pixels) where a ray hits the panel, or null
func ray_px(o: Vector3, d: Vector3) -> Variant:
	if not visible: return null
	var inv := quad.global_transform.affine_inverse()
	var lo := inv * o
	var ld := inv.basis * d
	if absf(ld.z) < 1e-5: return null
	var k := -lo.z / ld.z
	if k < 0: return null
	var p := lo + ld * k
	if absf(p.x) > QUAD.x / 2 or absf(p.y) > QUAD.y / 2: return null
	dot.visible = true
	dot.global_position = quad.global_transform * Vector3(p.x, p.y, 0.003)
	return Vector2((p.x / QUAD.x + 0.5) * SIZE.x, (0.5 - p.y / QUAD.y) * SIZE.y)


## feed the controller to the UI: hover, press, drag, release
func pointer(px: Variant, pressed: bool) -> void:
	if px == null:
		dot.visible = false
		if _held: _button(_last_px, false)
		return
	var p: Vector2 = px
	var mm := InputEventMouseMotion.new()
	mm.position = p; mm.global_position = p
	mm.relative = p - _last_px if _last_px.x >= 0 else Vector2.ZERO
	mm.button_mask = MOUSE_BUTTON_MASK_LEFT if _held else 0
	vp.push_input(mm, true)
	if pressed and not _held: _button(p, true)
	elif not pressed and _held: _button(p, false)
	_last_px = p


func _button(p: Vector2, down: bool) -> void:
	_held = down
	var e := InputEventMouseButton.new()
	e.button_index = MOUSE_BUTTON_LEFT; e.pressed = down
	e.position = p; e.global_position = p
	e.button_mask = MOUSE_BUTTON_MASK_LEFT if down else 0
	vp.push_input(e, true)


# ---------------- the UI ----------------

func _t(k: String) -> String:
	return S.t(lang, k)


func rebuild() -> void:
	for c in vp.get_children(): c.queue_free()
	var theme := Theme.new()
	theme.default_font = _font
	theme.default_font_size = 30
	var root := PanelContainer.new()
	root.theme = theme
	root.size = SIZE
	root.layout_direction = Control.LAYOUT_DIRECTION_RTL if lang == "ar" else Control.LAYOUT_DIRECTION_LTR
	root.add_theme_stylebox_override("panel", _box(Color(0.1, 0.085, 0.12, 0.94), 36, Color(1, 0.84, 0.55, 0.35)))
	vp.add_child(root)
	var outer := VBoxContainer.new(); outer.add_theme_constant_override("separation", 16)
	var pad := MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]: pad.add_theme_constant_override("margin_" + side, 34)
	root.add_child(pad); pad.add_child(outer)
	# header: title and resume
	var head := HBoxContainer.new()
	var title := Label.new(); title.text = _t("title"); title.add_theme_font_size_override("font_size", 52)
	title.add_theme_color_override("font_color", Color(1, 0.88, 0.62))
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title)
	head.add_child(_btn(_t("resume"), func(): action.emit("close", null), Color(0.25, 0.72, 0.5)))
	outer.add_child(head)
	var body := HBoxContainer.new(); body.add_theme_constant_override("separation", 26)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	outer.add_child(body)
	var tabs := VBoxContainer.new(); tabs.add_theme_constant_override("separation", 10)
	tabs.custom_minimum_size = Vector2(250, 0)
	for k in ["howto", "settings", "lang", "studio", "about"]:
		var b := _btn(_t("tab_" + k), func(): page = k; _restart_armed = false; rebuild(), Color(0.98, 0.78, 0.42) if page == k else Color(0.22, 0.2, 0.27))
		if page == k: b.add_theme_color_override("font_color", Color(0.12, 0.08, 0.05))
		tabs.add_child(b)
	body.add_child(tabs)
	var content := VBoxContainer.new(); content.add_theme_constant_override("separation", 14)
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_child(content)
	match page:
		"howto": content.add_child(_rich(_t("howto"), 24))
		"studio": content.add_child(_rich(_t("studio"), 30))
		"about": content.add_child(_rich(_t("about") % version, 28))
		"lang":
			content.add_child(_rich(_t("lang_note"), 30))
			for l in [["ar", "العربية"], ["en", "English"]]:
				var b := _btn(l[1], func(): action.emit("lang", l[0]), Color(0.98, 0.78, 0.42) if lang == l[0] else Color(0.22, 0.2, 0.27))
				b.custom_minimum_size = Vector2(0, 86); b.add_theme_font_size_override("font_size", 38)
				if lang == l[0]: b.add_theme_color_override("font_color", Color(0.12, 0.08, 0.05))
				content.add_child(b)
		"settings":
			content.add_child(_toggle("sound"))
			var vrow := HBoxContainer.new()
			var vl := Label.new(); vl.text = _t("volume"); vl.custom_minimum_size = Vector2(220, 0); vrow.add_child(vl)
			var sl := HSlider.new(); sl.min_value = 0; sl.max_value = 1; sl.step = 0.05; sl.value = settings.volume
			sl.size_flags_horizontal = Control.SIZE_EXPAND_FILL; sl.custom_minimum_size = Vector2(0, 50)
			sl.add_theme_icon_override("grabber", _knob()); sl.add_theme_icon_override("grabber_highlight", _knob())
			sl.add_theme_stylebox_override("slider", _box(Color(0.3, 0.27, 0.35), 8, Color(0, 0, 0, 0), 10))
			sl.add_theme_stylebox_override("grabber_area", _box(Color(0.98, 0.78, 0.42), 8, Color(0, 0, 0, 0), 10))
			sl.value_changed.connect(func(v): settings.volume = v; action.emit("volume", v))
			vrow.add_child(sl); content.add_child(vrow)
			content.add_child(_toggle("life"))
			content.add_child(_toggle("card"))
			var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 12)
			row.add_child(_btn(_t("recenter"), func(): action.emit("recenter", null)))
			row.add_child(_btn(_t("zoom"), func(): action.emit("zoom", null)))
			content.add_child(row)
			var rb := _btn(_t("restart_sure") if _restart_armed else _t("restart"), _on_restart, Color(0.75, 0.3, 0.28) if _restart_armed else Color(0.35, 0.2, 0.22))
			content.add_child(rb)


## starting over needs two presses (the first one turns the button red and asks)
func _on_restart() -> void:
	if _restart_armed:
		_restart_armed = false; action.emit("restart", null)
	else:
		_restart_armed = true; rebuild()


func _toggle(key: String) -> Control:
	var row := HBoxContainer.new()
	var l := Label.new(); l.text = _t(key); l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	row.add_child(l)
	var on: bool = settings[key]
	var b := _btn(_t("on") if on else _t("off"), func(): settings[key] = not settings[key]; action.emit(key, settings[key]); rebuild(),
		Color(0.25, 0.72, 0.5) if on else Color(0.35, 0.33, 0.4))
	b.custom_minimum_size = Vector2(150, 64)
	row.add_child(b)
	return row


func _btn(text: String, cb: Callable, col := Color(0.22, 0.2, 0.27)) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(0, 64)
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_stylebox_override("normal", _box(col, 18))
	b.add_theme_stylebox_override("hover", _box(col.lightened(0.15), 18, Color(1, 0.9, 0.7, 0.6)))
	b.add_theme_stylebox_override("pressed", _box(col.darkened(0.2), 18))
	b.add_theme_color_override("font_color", Color(1, 0.96, 0.9))
	b.add_theme_color_override("font_hover_color", Color(1, 1, 1))
	b.pressed.connect(cb)
	return b


func _rich(bb: String, size: int) -> RichTextLabel:
	var r := RichTextLabel.new()
	r.bbcode_enabled = true
	r.text = bb.replace("[b]", "[color=#ffd98a]").replace("[/b]", "[/color]")   # headings in amber (the font has no bold)
	r.fit_content = true
	r.scroll_active = false
	r.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	r.add_theme_font_size_override("normal_font_size", size)
	r.add_theme_font_size_override("bold_font_size", size)
	r.add_theme_font_override("normal_font", _font)
	r.add_theme_font_override("bold_font", _font)
	r.add_theme_color_override("default_color", Color(0.96, 0.92, 0.86))
	r.text_direction = Control.TEXT_DIRECTION_RTL if lang == "ar" else Control.TEXT_DIRECTION_LTR
	return r


func _box(c: Color, r: int, border := Color(0, 0, 0, 0), pad := 14) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = c
	s.set_corner_radius_all(r)
	s.content_margin_left = pad + 6; s.content_margin_right = pad + 6; s.content_margin_top = pad * 0.5; s.content_margin_bottom = pad * 0.5
	if border.a > 0:
		s.set_border_width_all(2); s.border_color = border
	return s


func _knob() -> Texture2D:
	var img := Image.create(34, 34, false, Image.FORMAT_RGBA8)
	for y in 34:
		for x in 34:
			var d := Vector2(x - 16.5, y - 16.5).length()
			img.set_pixel(x, y, Color(1, 0.9, 0.7, clampf(16.0 - d, 0.0, 1.0)))
	return ImageTexture.create_from_image(img)

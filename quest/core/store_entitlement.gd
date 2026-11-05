extends Node
## Meta Horizon Store entitlement check (VRC.Quest.Security.1), via the Godot Meta Toolkit
## (addons/godot_meta_toolkit, same files as Dahrooj-Quest). Runs only in store builds: CI writes
## the App ID into the project setting tayf/store/meta_app_id from the META_APP_ID secret.
## Sideload/test builds have no App ID and skip the check. Gameplay never waits on it.
##
## Policy (as in Dahrooj): if the platform starts and says this user does not own the app, quit.
## If the platform cannot start at all (service unavailable), the player is not punished.

signal finished(result: String)  # "skipped" | "entitled" | "not_entitled" | "unavailable"


func run() -> void:
	var app_id := String(ProjectSettings.get_setting("tayf/store/meta_app_id", "")).strip_edges()
	if app_id == "" or OS.get_name() != "Android" or not Engine.has_singleton("MetaPlatformSDK"):
		finished.emit("skipped")
		return
	var sdk = Engine.get_singleton("MetaPlatformSDK")
	var init = await sdk.initialize_platform_async(app_id).completed
	if init.is_error():
		push_warning("Meta Platform SDK unavailable: %s" % _err(init))
		finished.emit("unavailable")
		return
	var ent = await sdk.entitlement_get_is_viewer_entitled_async().completed
	if ent.is_error():
		get_tree().quit()   # quit first: nothing after this line may stop it
		finished.emit("not_entitled")
		return
	finished.emit("entitled")


static func _err(res: Object) -> String:
	if res == null: return "?"
	if res.has_method("get_error"):
		var e: Variant = res.call("get_error")
		if e is Object and (e as Object).has_method("get_message"):
			return str((e as Object).call("get_message"))
		return str(e)
	return "?"

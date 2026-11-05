# Data Use Checkup and permissions — Tayf (Quest)

Answers for the Developer Dashboard's Data Use Checkup and privacy questions. Every claim points at
the code that makes it true (folder `quest/`).

| Topic | Answer | Where |
|---|---|---|
| Personal data collected | None. No accounts, no analytics, no ads, no network code. | whole project; `permissions/internet=false` in `export_presets.cfg` |
| Saved data | One local file, `user://tayf.cfg`, in the app's private storage: run seed, current room, help count, table zoom, and whether the controls card was hidden. Uninstalling removes it. | `game/main.gd` (`_save`, `_load`) |
| Passthrough | Drawn by the system (OpenXR alpha blend). The app never reads camera frames; there is no camera permission. | `game/main.gd` (`_passthrough`) |
| Controller models | `com.oculus.permission.RENDER_MODEL`, to draw the user's own controllers. | `export_presets.cfg` (`meta_xr_features/render_model=1`) |
| Meta Platform SDK | Only `initialize_platform_async(app_id)` and `entitlement_get_is_viewer_entitled_async()`, and only in store builds (CI writes the App ID from the `META_APP_ID` secret). Not entitled: the app quits. Platform unavailable: play goes on. | `core/store_entitlement.gd` |
| Platform features requested in the Checkup | None besides the entitlement check (no user profile, friends, achievements, leaderboards, cloud saves). | — |
| Permissions in the APK | `com.oculus.permission.RENDER_MODEL`, `org.khronos.openxr.permission.OPENXR`, `org.khronos.openxr.permission.OPENXR_SYSTEM`. Each build lists them in `apk-report.txt`. | CI report |

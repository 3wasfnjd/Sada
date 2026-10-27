#!/usr/bin/env bash
# صدى — Sada: reproducible Quest APK build (used by .github/workflows/quest-apk.yml).
# Adapted from the Mafateeh pipeline that already produces installable Quest APKs.
# Runs on a stock ubuntu-24.04 GitHub runner; no desktop editor needed.
#
# Pinned toolchain (verified against Godot 4.6.3 sources: platform/android/java/app/config.gradle):
#   Godot 4.6.3-stable editor + export templates (SHA-512 checked)
#   OpenXR Vendors plugin 5.1.0-stable (vendored in quest/addons)
#   JDK 17, Android platform 36, build-tools 36.1.0, NDK 29.0.14206865
#
# Signing: SADA_KEYSTORE_B64 / _ALIAS / _PASSWORD secrets when present;
# otherwise the committed TEST-ONLY key in tools/ci/test-signing (sideload
# testing only, never for store distribution).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"   # quest/
REPO="$(cd "$ROOT/.." && pwd)"
OUT="${OUT_DIR:-$REPO/build}"
CACHE="${GODOT_CACHE:-$HOME/.cache/sada-godot}"

GODOT_VERSION="4.6.3-stable"
GODOT_TEMPLATE_DIR="4.6.3.stable"
GODOT_URL="https://github.com/godotengine/godot-builds/releases/download/${GODOT_VERSION}"
GODOT_EDITOR_ZIP="Godot_v${GODOT_VERSION}_linux.x86_64.zip"
GODOT_EDITOR_SHA512="a035258da32b77f966a5376f9fa29c30a6adde826a85ba918e1605bd1fc9823eba7d85f1dd5e748956bd2ba72827c0025ffa11bb82aec91128c407a2e723c99c"
GODOT_TPZ="Godot_v${GODOT_VERSION}_export_templates.tpz"
GODOT_TPZ_SHA512="da606b61c10157844f8300172df374472665f95015495cb1a7cd132c40ede404faa96cc1016a4b9662db9909ddea69632c4948b2cd11163438dad4808881fb68"
ANDROID_PLATFORM="platforms;android-36"
ANDROID_BUILD_TOOLS="36.1.0"
ANDROID_NDK="29.0.14206865"

APP_VERSION="${APP_VERSION:-$(sed -n 's/^config\/version="\(.*\)"/\1/p' "$ROOT/project.godot")}"
VERSION_CODE="${VERSION_CODE:-1}"

log() { printf '\n==> %s\n' "$*"; }

fetch() {  # fetch <file> <sha512>
  local f="$1" sum="$2"
  mkdir -p "$CACHE"
  if [ ! -f "$CACHE/$f" ] || ! echo "$sum  $CACHE/$f" | sha512sum -c --quiet - 2>/dev/null; then
    curl -fL --retry 4 --retry-delay 5 -o "$CACHE/$f.part" "$GODOT_URL/$f"
    mv "$CACHE/$f.part" "$CACHE/$f"
  fi
  echo "$sum  $CACHE/$f" | sha512sum -c -
}

log "Godot ${GODOT_VERSION}"
fetch "$GODOT_EDITOR_ZIP" "$GODOT_EDITOR_SHA512"
fetch "$GODOT_TPZ" "$GODOT_TPZ_SHA512"
mkdir -p "$CACHE/bin"
if [ ! -x "$CACHE/bin/godot" ]; then
  unzip -o -q "$CACHE/$GODOT_EDITOR_ZIP" -d "$CACHE/bin"
  mv "$CACHE/bin/Godot_v${GODOT_VERSION}_linux.x86_64" "$CACHE/bin/godot"
fi
GODOT="$CACHE/bin/godot"
"$GODOT" --version
TPL="$HOME/.local/share/godot/export_templates/$GODOT_TEMPLATE_DIR"
if [ ! -f "$TPL/android_source.zip" ]; then
  mkdir -p "$TPL" /tmp/tpz
  unzip -o -q "$CACHE/$GODOT_TPZ" 'templates/android_*' 'templates/version.txt' -d /tmp/tpz
  mv /tmp/tpz/templates/* "$TPL/"
fi
ls -la "$TPL"

log "Android SDK"
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/usr/local/lib/android/sdk}}"
SDKMANAGER="$SDK/cmdline-tools/latest/bin/sdkmanager"
yes | "$SDKMANAGER" --licenses >/dev/null || true
"$SDKMANAGER" --install "$ANDROID_PLATFORM" "build-tools;$ANDROID_BUILD_TOOLS" "ndk;$ANDROID_NDK" "platform-tools" >/dev/null
JAVA="${JAVA_HOME:?JDK 17 required}"
"$JAVA/bin/java" -version 2>&1 | head -1

mkdir -p "$HOME/.config/godot"
cat > "$HOME/.config/godot/editor_settings-4.6.tres" <<EOF
[gd_resource type="EditorSettings" format=3]

[resource]
export/android/android_sdk_path = "$SDK"
export/android/java_sdk_path = "$JAVA"
EOF

log "Signing"
KEYDIR="$(mktemp -d)"
if [ -n "${SADA_KEYSTORE_B64:-}" ]; then
  # Copy-pasted secrets often carry a stray newline, CR or space: strip them.
  KS_ALIAS="$(printf '%s' "${SADA_KEYSTORE_ALIAS:?SADA_KEYSTORE_ALIAS secret missing}" | tr -d '\r\n' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
  KS_PASS="$(printf '%s' "${SADA_KEYSTORE_PASSWORD:?SADA_KEYSTORE_PASSWORD secret missing}" | tr -d '\r\n')"
  if ! printf '%s' "$SADA_KEYSTORE_B64" | tr -d ' \r\n\t' | base64 -d > "$KEYDIR/release.keystore" 2>/dev/null \
     || [ ! -s "$KEYDIR/release.keystore" ]; then
    echo "::error::SADA_KEYSTORE_B64 is not valid Base64. Re-copy the whole Base64 text of the keystore file."
    exit 1
  fi
  echo "keystore: $(stat -c %s "$KEYDIR/release.keystore") bytes, sha256 $(sha256sum "$KEYDIR/release.keystore" | cut -c1-12)…"
  KT="$JAVA/bin/keytool"
  if ! "$KT" -list -keystore "$KEYDIR/release.keystore" -storepass "$KS_PASS" >/dev/null 2>"$KEYDIR/kt.err"; then
    echo "::error::The keystore did not open with SADA_KEYSTORE_PASSWORD ($(grep -v "^Picked up" "$KEYDIR/kt.err" | head -c 200 | tr '\n' ' ')). Either the password secret is wrong or the Base64 text is not the full keystore file."
    exit 1
  fi
  if ! "$KT" -list -keystore "$KEYDIR/release.keystore" -storepass "$KS_PASS" -alias "$KS_ALIAS" >/dev/null 2>&1; then
    echo "::error::Alias '$KS_ALIAS' (SADA_KEYSTORE_ALIAS) is not in the keystore. Aliases found: $("$KT" -list -keystore "$KEYDIR/release.keystore" -storepass "$KS_PASS" 2>/dev/null | sed -n 's/^\([^,]*\), .*PrivateKeyEntry.*/\1/p' | paste -sd, -)"
    exit 1
  fi
  # A JKS keystore may hold a key password different from the store password;
  # Godot signs with one password for both.
  if ! "$KT" -certreq -keystore "$KEYDIR/release.keystore" -storepass "$KS_PASS" -keypass "$KS_PASS" -alias "$KS_ALIAS" >/dev/null 2>&1; then
    echo "::error::The key '$KS_ALIAS' has its own password, different from the keystore password. Recreate the keystore with -storetype PKCS12 (one password) as in docs/meta-store-submission.md."
    exit 1
  fi
  echo "keystore check: password and alias OK"
  # Godot validates the credentials by running keytool through a shell with the
  # password inside double quotes, so a password containing $ ` " or \ fails there
  # although it is correct. Sign from a temporary copy of the same key and
  # certificate under a random alphanumeric password instead.
  SIGN_PASS="$(openssl rand -hex 24)"
  echo "::add-mask::$SIGN_PASS"
  "$KT" -importkeystore -noprompt -srckeystore "$KEYDIR/release.keystore" -srcstorepass "$KS_PASS" \
    -srcalias "$KS_ALIAS" -srckeypass "$KS_PASS" -destkeystore "$KEYDIR/sign.p12" -deststoretype PKCS12 \
    -deststorepass "$SIGN_PASS" -destkeypass "$SIGN_PASS" -destalias release >/dev/null 2>&1 \
    || { echo "::error::Could not prepare the signing copy of the keystore."; exit 1; }
  KEY_CERT_SHA256="$("$KT" -list -v -keystore "$KEYDIR/release.keystore" -storepass "$KS_PASS" -alias "$KS_ALIAS" 2>/dev/null \
    | sed -n 's/^[[:space:]]*SHA256: //p' | head -1 | tr -d ':' | tr 'A-F' 'a-f')"
  echo "release certificate SHA-256: $KEY_CERT_SHA256"
  export GODOT_ANDROID_KEYSTORE_RELEASE_PATH="$KEYDIR/sign.p12"
  export GODOT_ANDROID_KEYSTORE_RELEASE_USER="release"
  export GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD="$SIGN_PASS"
  SIGNING="private key from repository secrets"
else
  # Public, test-only key so successive test builds can be installed over each other.
  export GODOT_ANDROID_KEYSTORE_RELEASE_PATH="$ROOT/tools/ci/test-signing/sada-test.keystore"
  export GODOT_ANDROID_KEYSTORE_RELEASE_USER="sada-test"
  export GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD="sada-test-only"
  SIGNING="TEST-ONLY key (tools/ci/test-signing) — sideload testing, not for store release"
fi
echo "$SIGNING"

PACKAGE="com.abodengames.sada"

log "Version ${APP_VERSION} (${VERSION_CODE})"
sed -i "s/^version\/code=.*/version\/code=${VERSION_CODE}/; s/^version\/name=.*/version\/name=\"${APP_VERSION}\"/" "$ROOT/export_presets.cfg"

log "Import"
"$GODOT" --headless --xr-mode off --path "$ROOT" --import 2>&1 | grep -v "OpenXR-Loader" | tail -5 || true

if [ "${SKIP_TESTS:-0}" != "1" ]; then
  log "Tests"
  mkdir -p "$OUT"
  "$GODOT" --headless --xr-mode off --path "$ROOT" -s res://tests/run_tests.gd 2>&1 | grep -v "OpenXR" | tail -8
  "$GODOT" --headless --xr-mode off --path "$ROOT" -s res://tests/play_test.gd 2>&1 | grep -v "OpenXR" | tee "$OUT/test-report.txt" | tail -12
  grep -q "play test: 0 failure" "$OUT/test-report.txt"
  "$GODOT" --headless --xr-mode off --path "$ROOT" -s res://tests/art_test.gd 2>&1 | grep -v "OpenXR" | tee "$OUT/art-report.txt" | tail -6
  grep -q "art test: 0 failure" "$OUT/art-report.txt"
fi

log "Export"
mkdir -p "$OUT"
APK="$OUT/sada-quest-${APP_VERSION}-${VERSION_CODE}.apk"
# Install the Godot Android build template the same way the editor does, then add
# the store manifest hook (see tools/ci/store_manifest.gradle).
rm -rf "$ROOT/android"
mkdir -p "$ROOT/android/build"
unzip -q "$TPL/android_source.zip" -d "$ROOT/android/build"
rm -rf "$ROOT/android/build/src/main/assets"
echo "$GODOT_TEMPLATE_DIR" > "$ROOT/android/.build_version"
touch "$ROOT/android/build/.gdignore"
"$GODOT" --headless --xr-mode off --path "$ROOT" --export-release "Quest" "$APK" 2>&1 | grep -v "OpenXR-Loader" | tee "$OUT/export.log"
test -s "$APK" || { echo "Export failed: no APK produced"; exit 1; }

log "Verify"
BT="$SDK/build-tools/$ANDROID_BUILD_TOOLS"
{
  echo "Sada Quest APK build report"
  echo "file: $(basename "$APK")"
  echo "version: ${APP_VERSION} (code ${VERSION_CODE})"
  echo "size_bytes: $(stat -c %s "$APK")"
  echo "sha256: $(sha256sum "$APK" | cut -d' ' -f1)"
  echo "signing: $SIGNING"
  echo "godot: ${GODOT_VERSION}; openxr_vendors: 5.1.0-stable; build-tools: ${ANDROID_BUILD_TOOLS}; ndk: ${ANDROID_NDK}"
  echo
  echo "--- apksigner verify"
  "$BT/apksigner" verify --verbose --print-certs "$APK" | grep -E "Verified|Signer #1 certificate (DN|SHA-256)|Number of signers"
  echo
  echo "--- badging"
  "$BT/aapt2" dump badging "$APK" | grep -E "^package:|sdkVersion|targetSdkVersion|application-label|native-code|uses-feature|uses-permission|launchable-activity"
  echo
  echo "--- manifest (XR launch)"
  "$BT/aapt2" dump xmltree --file AndroidManifest.xml "$APK" | grep -E "com.oculus|android.intent.category|PASSTHROUGH|supportedDevices|org.khronos.openxr" | sed 's/^ *//' | sort -u
  echo
  echo "--- native libraries"
  unzip -l "$APK" | grep -E "lib/.*\.so" | awk '{print $4}'
} | tee "$OUT/apk-report.txt"

# Hard checks: valid signature, arm64 only, OpenXR/Quest launch entries present.
"$BT/apksigner" verify "$APK"
if [ -n "${KEY_CERT_SHA256:-}" ]; then  # the APK must carry the owner's certificate
  APK_CERT="$("$BT/apksigner" verify --print-certs "$APK" | sed -n 's/^Signer #1 certificate SHA-256 digest: //p')"
  [ "$APK_CERT" = "$KEY_CERT_SHA256" ] || { echo "::error::APK certificate $APK_CERT differs from the release key $KEY_CERT_SHA256"; exit 1; }
  echo "APK signed with the release key (certificate $APK_CERT)"
fi
unzip -l "$APK" | grep -q "lib/arm64-v8a/libgodot_android.so"
unzip -l "$APK" | grep -q "lib/arm64-v8a/libgodotopenxrvendors.so"
! unzip -l "$APK" | grep -qE "lib/(armeabi-v7a|x86|x86_64)/"
"$BT/aapt2" dump xmltree --file AndroidManifest.xml "$APK" | grep -q "com.oculus.intent.category.VR"
"$BT/aapt2" dump xmltree --file AndroidManifest.xml "$APK" | grep -q "org.khronos.openxr.intent.category.IMMERSIVE_HMD"
"$BT/aapt2" dump badging "$APK" | grep -q "package: name='${PACKAGE}'"
"$BT/aapt2" dump badging "$APK" | grep -q "targetSdkVersion:'34'"
sha256sum "$APK" | tee "$APK.sha256"
echo "APK=$APK" >> "${GITHUB_ENV:-/dev/null}"
log "Done: $APK"

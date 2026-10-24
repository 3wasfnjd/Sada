#!/usr/bin/env bash
# Copies every third-party file the game needs into vendor/, so the game runs with no external links.
# Pinned versions — change here, then re-run (GitHub Actions runs it when this file changes).
set -euo pipefail
THREE=0.170.0
REEM=5.2.5      # @fontsource/reem-kufi
READEX=5.2.5    # @fontsource/readex-pro
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
( cd "$tmp" && npm pack --silent "three@$THREE" "@fontsource/reem-kufi@$REEM" "@fontsource/readex-pro@$READEX" >/dev/null && for f in *.tgz; do mkdir -p "${f%.tgz}" && tar -xzf "$f" -C "${f%.tgz}"; done )
rm -rf vendor && mkdir -p vendor/three/addons/loaders vendor/three/addons/utils vendor/fonts
T="$tmp/three-$THREE/package"
cp "$T/build/three.module.min.js" vendor/three/three.module.min.js
cp "$T/examples/jsm/loaders/GLTFLoader.js" vendor/three/addons/loaders/
cp "$T/examples/jsm/utils/BufferGeometryUtils.js" "$T/examples/jsm/utils/SkeletonUtils.js" vendor/three/addons/utils/
cp "$T/LICENSE" vendor/three/LICENSE
copy_font () { # $1 tarball dir, $2 target name, $3.. weights
  local src="$tmp/$1/package" dst="vendor/fonts/$2"; shift 2; mkdir -p "$dst/files"
  for w in "$@"; do
    cp "$src/$w.css" "$dst/$w.css"
    for sub in arabic latin; do cp "$src/files/"*"-$sub-$w-normal.woff2" "$dst/files/" 2>/dev/null || true; done
    # keep only the arabic + latin faces, woff2 only
    node -e '
      const fs=require("fs"),p=process.argv[1];let c=fs.readFileSync(p,"utf8");
      c=c.split("@font-face").filter((b,i)=>i===0||/-(arabic|latin)-\d+-normal/.test(b)&&!/latin-ext/.test(b)).join("@font-face");
      c=c.replace(/,\s*url\([^)]*\.woff\)\s*format\(.woff.\)/g,"");
      fs.writeFileSync(p,c);' "$dst/$w.css"
  done
  cp "$src/LICENSE" "$dst/LICENSE" 2>/dev/null || true
}
copy_font "fontsource-reem-kufi-$REEM" reem-kufi 600 700
copy_font "fontsource-readex-pro-$READEX" readex-pro 400 600
du -sh vendor; find vendor -type f | sort

// Preview page: the طيف game with a look picker — clean (the game), sketch (+ four sketch-pack animals),
// shadow puppets (خيال الظل) and VHS (شريط فيديو).
//   node mobile/preview/build-preview.mjs   -> mobile/dist/tayf_chars_preview.html
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), m = join(here, '..');
const shell = readFileSync(join(m, 'shell.html'), 'utf8').replace('<title>طيف</title>', '<title>طيف — تجربة الأشكال</title>');
const ui = `
<style>
#top #mid { visibility: hidden; }
.pk { position: fixed; left: 50%; transform: translateX(-50%); z-index: 4; display: flex; gap: 4px; background: #fff; padding: 4px; border-radius: 14px; box-shadow: 0 3px 0 var(--lip); }
#looks { top: calc(env(safe-area-inset-top, 0px) + 66px); }
#animals { top: calc(env(safe-area-inset-top, 0px) + 112px); }
.pk button { border: 0; background: none; font: 700 13px var(--font); color: var(--soft); padding: 6px 9px 4px; border-radius: 10px; cursor: pointer; white-space: nowrap; }
.pk button[aria-pressed=true] { background: var(--purple); color: #fff; }
body:not([data-theme=sketch]) #animals { display: none; }

/* خيال الظل: dark wood and amber */
body[data-theme=shadow] { background: #1d110a; }
body[data-theme=shadow] .round { background: linear-gradient(#5a3a22, #3a2416); box-shadow: 0 4px 0 #1a0f08; color: #ffd48a; }
body[data-theme=shadow] #echoes { background: #3a2416; box-shadow: 0 3px 0 #1a0f08; }
body[data-theme=shadow] #echoes i svg path:first-child { fill: #ffd48a; }
body[data-theme=shadow] .big { background: #2b1a10; box-shadow: 0 5px 0 #140a05, 0 8px 16px #0006; }
body[data-theme=shadow] .big b { color: #e8b77a; }
body[data-theme=shadow] .big .ic { background: #140a05 !important; color: #ffd48a; box-shadow: inset 0 0 0 2px #5a3a22; }
body[data-theme=shadow] #tip { background: #2b1a10ee; color: #ffe2b0; }
body[data-theme=shadow] #toast { background: #2b1a10; color: #ffd48a; box-shadow: 0 5px 0 #140a05; }
body[data-theme=shadow] .pk { background: #2b1a10; box-shadow: 0 3px 0 #140a05; }
body[data-theme=shadow] .pk button { color: #c8955c; }
body[data-theme=shadow] .pk button[aria-pressed=true] { background: #ffd48a; color: #2b1a10; }
body[data-theme=shadow] #cheer { -webkit-text-stroke-color: #140a05; text-shadow: 0 6px 0 #000, 0 0 30px #ffb54788; color: #ffd48a; }

/* شريط فيديو: neon on black */
body[data-theme=vhs] { background: #0b0a14; }
body[data-theme=vhs] .round { background: #15132a; box-shadow: 0 0 0 2px #3df2ff, 0 0 14px #3df2ff66; color: #3df2ff; }
body[data-theme=vhs] #echoes { background: #15132a; box-shadow: 0 0 0 2px #9b5cff, 0 0 12px #9b5cff55; }
body[data-theme=vhs] .big { background: #13112a; box-shadow: 0 0 0 2px #ff3fa4, 0 0 16px #ff3fa455; }
body[data-theme=vhs] .big:active { box-shadow: 0 0 0 2px #ff3fa4, 0 0 26px #ff3fa4aa; }
body[data-theme=vhs] .big b { color: #d7d1ff; }
body[data-theme=vhs] .big .ic { background: #0b0a14 !important; box-shadow: inset 0 0 0 2px currentColor, 0 0 10px currentColor; }
body[data-theme=vhs] #bWait .ic { color: #3df2ff; } body[data-theme=vhs] #bUndo .ic { color: #ffe14d; } body[data-theme=vhs] #bHelp .ic { color: #ff3fa4; }
body[data-theme=vhs] #tip { background: #13112aee; color: #d8f9ff; box-shadow: 0 0 0 1px #3df2ff; }
body[data-theme=vhs] #toast { background: #13112a; color: #3df2ff; box-shadow: 0 0 0 2px #3df2ff, 0 0 18px #3df2ff66; }
body[data-theme=vhs] .pk { background: #13112a; box-shadow: 0 0 0 1px #9b5cff; }
body[data-theme=vhs] .pk button { color: #9d97c9; }
body[data-theme=vhs] .pk button[aria-pressed=true] { background: #ff3fa4; color: #0b0a14; }
body[data-theme=vhs] #cheer { -webkit-text-stroke-color: #ff3fa4; text-shadow: 3px 0 0 #3df2ff, -3px 0 0 #ff3fa4, 0 0 24px #ff3fa4; }

/* sketch: paper */
body[data-theme=sketch] { background: #fbf9f4; }
</style>
<div class="pk" id="looks" role="group" aria-label="الشكل">
  <button data-t="shadow">خيال الظل</button><button data-t="vhs">شريط فيديو</button><button data-t="sketch">مرسوم</button><button data-t="clean">ناعم</button>
</div>
<div class="pk" id="animals" role="group" aria-label="الشخصية">
  <button data-c="ثعلوب">ثعلوب</button><button data-c="صوصو">صوصو</button><button data-c="بومبوم">بومبوم</button><button data-c="بطروق">بطروق</button><button data-c="blob">البرتقالي</button>
</div>
<script>
(() => {
  const mark = (sel, attr, v) => document.querySelectorAll(sel + ' button').forEach(b => b.setAttribute('aria-pressed', b.dataset[attr] === v));
  window.__look = t => { THEME.set(t); mark('#looks', 't', t); };
  window.__animal = c => { SKETCH.cur = c; mark('#animals', 'c', c); };
  document.querySelectorAll('#looks button').forEach(b => b.onclick = () => __look(b.dataset.t));
  document.querySelectorAll('#animals button').forEach(b => b.onclick = () => __animal(b.dataset.c));
  __look('shadow'); __animal('بطروق');
})();
</script>`;
const logic = readFileSync(join(m, '..', 'src', 'logic.js'), 'utf8');
const sk = readFileSync(join(here, 'sketch-chars.js'), 'utf8');
const th = readFileSync(join(here, 'themes.js'), 'utf8');
const game = readFileSync(join(m, 'game.js'), 'utf8');
const out = join(m, 'dist', 'tayf_chars_preview.html');
writeFileSync(out, shell + '\n<script>\n' + logic + '\n</script>\n<script>\n' + sk + '\n</script>\n<script>\n' + th + '\n</script>\n' + ui + '\n<script>\n' + game + '\n</script>\n</body>\n</html>\n');
console.log('wrote', out);

// Preview page: the طيف game with a character picker (orange blob or four sketch-pack characters).
//   node mobile/preview/build-preview.mjs   -> mobile/dist/tayf_chars_preview.html
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), m = join(here, '..');
let shell = readFileSync(join(m, 'shell.html'), 'utf8').replace('<title>طيف</title>', '<title>طيف — تجربة الشخصيات</title>');
const picker = `
<style>
#pick { position: fixed; left: 50%; transform: translateX(-50%); top: calc(env(safe-area-inset-top, 0px) + 98px); z-index: 4; display: flex; gap: 6px;
  background: #fff; padding: 5px; border-radius: 16px; box-shadow: 0 3px 0 var(--lip); }
#pick button { border: 0; background: none; font: 700 14px var(--font); color: var(--soft); padding: 6px 10px 4px; border-radius: 11px; cursor: pointer; white-space: nowrap; }
#pick button[aria-pressed=true] { background: var(--purple); color: #fff; }
#top #mid { visibility: hidden; }
</style>
<div id="pick" role="group" aria-label="الشخصية">
  <button data-c="blob">البرتقالي</button><button data-c="ثعلوب">ثعلوب</button><button data-c="صوصو">صوصو</button><button data-c="بومبوم">بومبوم</button><button data-c="بطروق">بطروق</button>
</div>
<script>
document.querySelectorAll('#pick button').forEach(b => {
  b.setAttribute('aria-pressed', b.dataset.c === SKETCH.cur);
  b.onclick = () => { SKETCH.cur = b.dataset.c; document.querySelectorAll('#pick button').forEach(x => x.setAttribute('aria-pressed', x === b)); };
});
</script>`;
const logic = readFileSync(join(m, '..', 'src', 'logic.js'), 'utf8');
const sk = readFileSync(join(here, 'sketch-chars.js'), 'utf8');
const game = readFileSync(join(m, 'game.js'), 'utf8');
const out = join(m, 'dist', 'tayf_chars_preview.html');
writeFileSync(out, shell + '\n<script>\n' + logic + '\n</script>\n<script>\n' + sk + '\n</script>\n' + picker + '\n<script>\n' + game + '\n</script>\n</body>\n</html>\n');
console.log('wrote', out);

// Builds index.html — the web version of «طيف» (Tayf): mobile/shell.html + src/logic.js + mobile/game.js,
// the same page as mobile/dist/sada.html. The old 3D web «صدى» lives in legacy/sada-3d-web/.
//   node tools/build.mjs          write index.html and mobile/dist/sada.html
//   node tools/build.mjs --check  fail if either is out of date
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const out = read('mobile/shell.html') + '\n<script>\n' + read('src/logic.js') + '\n</script>\n<script>\n' + read('mobile/game.js') + '\n</script>\n</body>\n</html>\n';
const targets = ['index.html', 'mobile/dist/sada.html'].map(p => new URL('../' + p, import.meta.url));
if (process.argv.includes('--check')) {
  for (const t of targets) {
    if (!existsSync(t) || readFileSync(t, 'utf8') !== out) { console.error(t.pathname + ' is out of date: run node tools/build.mjs'); process.exit(1); }
  }
  console.log('index.html is up to date');
} else { for (const t of targets) writeFileSync(t, out); console.log('built index.html', out.length, 'bytes'); }

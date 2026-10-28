// Builds one self-contained page: shell + logic.js + game2d.js inlined (no external files except Google Fonts).
//   node mobile2d/build.mjs [out]   (default mobile2d/dist/sada2d.html)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || join(here, 'dist', 'sada2d.html');
const shell = readFileSync(join(here, 'shell.html'), 'utf8');
const logic = readFileSync(join(here, '..', 'src', 'logic.js'), 'utf8');
const game = ['head', 'flow', 'tail'].map(n => readFileSync(join(here, 'parts', n + '.js'), 'utf8')).join('\n');
writeFileSync(join(here, 'game2d.js'), game);   // the joined file, kept for reading
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, shell + '\n<script>\n' + logic + '\n</script>\n<script>\n' + game + '\n</script>\n');
console.log('wrote', out);

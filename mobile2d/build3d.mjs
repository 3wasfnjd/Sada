// Builds the 3D mobile page: shell + art + logic + three.js module (parts3d/head + parts/flow + parts3d/tail).
//   node mobile2d/build3d.mjs            -> dist/sada3d.html (three.js from jsDelivr, for the artifact page)
//   node mobile2d/build3d.mjs --local    -> dist/sada3d.local.html (three.js from the repo's vendor/, for tests)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const local = process.argv.includes('--local');
const T = local ? '../../vendor/three/three.module.min.js' : 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';
const U = local ? '../../vendor/three/addons/utils/BufferGeometryUtils.js' : 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/utils/BufferGeometryUtils.js';
const shell = readFileSync(join(here, 'shell.html'), 'utf8');
const art = readFileSync(join(here, 'art', 'art.js'), 'utf8');
const logic = readFileSync(join(here, '..', 'src', 'logic.js'), 'utf8');
const game = [join(here, 'parts3d', 'head.js'), join(here, 'parts', 'flow.js'), join(here, 'parts3d', 'tail.js')].map(f => readFileSync(f, 'utf8')).join('\n');
writeFileSync(join(here, 'game3d.js'), game);
const out = join(here, 'dist', local ? 'sada3d.local.html' : 'sada3d.html');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, shell +
  `\n<script type="importmap">${JSON.stringify({ imports: { three: T } })}</script>\n<script>\n${art}\n</script>\n<script>\n${logic}\n</script>\n` +
  `<script type="module">\nimport * as THREE from 'three';\nimport { mergeGeometries } from '${U}';\n${game}\n</script>\n`);
console.log('wrote', out);

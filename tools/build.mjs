// Builds index.html from src/: shell + logic (classic script) + game (module).
import { readFileSync, writeFileSync } from 'node:fs';
const read = p => readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
const out = read('shell.html').replace('/*LOGIC*/', () => read('logic.js')).replace('/*GAME*/', () => read('game.js'));
const check = process.argv.includes('--check');
const target = new URL('../index.html', import.meta.url);
if (check) {
  const cur = readFileSync(target, 'utf8');
  if (cur !== out) { console.error('index.html is out of date: run node tools/build.mjs'); process.exit(1); }
  console.log('index.html is up to date');
} else { writeFileSync(target, out); console.log('built index.html', out.length, 'bytes'); }

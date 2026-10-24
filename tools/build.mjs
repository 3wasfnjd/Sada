// Builds index.html from src/: shell + logic (classic script) + game (module).
import { readFileSync, writeFileSync } from 'node:fs';
const read = p => readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
const body = read('shell.html').replace('/*LOGIC*/', () => read('logic.js')).replace('/*GAME*/', () => read('game.js'));
// standalone page skeleton (GitHub Pages / APK): doctype, charset, mobile viewport, base reset
const out = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#0d0f22">
<style>
html,body{margin:0;height:100%}
:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);box-sizing:border-box}
*,*::before,*::after{box-sizing:border-box}
body{font:14px system-ui,sans-serif}
[hidden]{display:none!important}
</style>
</head>
<body>
${body}
</body>
</html>
`;
const check = process.argv.includes('--check');
const target = new URL('../index.html', import.meta.url);
if (check) {
  const cur = readFileSync(target, 'utf8');
  if (cur !== out) { console.error('index.html is out of date: run node tools/build.mjs'); process.exit(1); }
  console.log('index.html is up to date');
} else { writeFileSync(target, out); console.log('built index.html', out.length, 'bytes'); }

// Automated check of the 2D page in a real browser: plays each room with its own solution through
// the same doAction the swipes use, checks every room is won, and saves phone-size screenshots.
//   node mobile2d/test2d.cjs <page.html> <shots dir>
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [page_, shots] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|fonts\.g/.test(m.text())) errs.push(m.text()); });   // fonts are offline here
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await p.goto('file://' + path.resolve(page_));
  await p.waitForTimeout(500);
  if (shots) await p.screenshot({ path: shots + '/0_title.png' });
  await p.mouse.click(195, 400);
  await p.waitForTimeout(900);
  let fails = 0;
  // the watched solution (auto demo on tutorial 2) must reach the exit by itself
  const demoOk = await p.evaluate(async () => {
    const s = window.__sada; s.S.demoSeen = {}; s.loadRoom(2);
    for (let k = 0; k < 150; k++) { await new Promise(r => setTimeout(r, 100)); if (s.S.won && s.S.demo) return true; }
    return false;
  });
  console.log('demo on room 2', demoOk ? 'reached the exit' : 'DID NOT reach the exit');
  if (!demoOk) fails++;
  await p.waitForTimeout(1500);
  await p.evaluate(() => { window.__sada.S.demoSeen = { 2: 1, 3: 1, 4: 1, 5: 1 }; });
  for (let n = 1; n <= 9; n++) {
    await p.evaluate(n => { const s = window.__sada; if (s.S.demo) s.startDemo; s.loadRoom(n); }, n);
    await p.evaluate(() => { const s = window.__sada; if (s.S.demo) { clearInterval(s.S.demo.iv); s.S.demo = null; } });
    await p.waitForTimeout(700);
    if (shots && [2, 3, 6, 8].includes(n)) await p.screenshot({ path: `${shots}/room${n}.png` });
    const ok = await p.evaluate(async n => {
      const s = window.__sada, R = s.S.R, sol = R.solution, E = window.EchoLogic;
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const act = async a => { for (let k = 0; k < 200 && (s.S.busy || s.S.rewinding); k++) await wait(20); s.doAction(a); await wait(260); };
      for (const e of sol.echoes) { for (const a of E.pad(e, R.L)) await act(a); for (let k = 0; k < 200 && (s.S.rewinding || s.S.acts.length); k++) await wait(30); }
      for (const a of sol.player) { await act(a); if (s.S.won) break; }
      return s.S.won;
    }, n);
    if (shots && n === 3) await p.screenshot({ path: `${shots}/win3.png` });
    console.log('room', n, ok ? 'won' : 'NOT WON');
    if (!ok) fails++;
    await p.waitForTimeout(2200);   // let the win transition finish (it loads the next room itself)
  }
  // hint + hover look
  await p.evaluate(() => { const s = window.__sada; s.loadRoom(7); });
  await p.waitForTimeout(800);
  await p.evaluate(() => { const s = window.__sada; s.S.help = 3; s.showHint(); });
  await p.waitForTimeout(400);
  if (shots) await p.screenshot({ path: shots + '/hint7.png' });
  console.log('errors:', errs.length ? errs.join(' | ') : 'none');
  console.log(fails ? `FAIL ${fails} room(s)` : 'all rooms won');
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();

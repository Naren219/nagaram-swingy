/*
 * NAGARAM smoke suite — drives the real built page in headless Chromium and
 * asserts against measurements rather than inspection. Nearly every
 * significant bug in this project has been invisible to reading the code and
 * obvious to a measurement, so: write a check before claiming a fix, and
 * sanity-check a new metric's polarity against a known-good case first.
 *
 *   npm test
 *
 * Needs a Chromium: `npx playwright install chromium`, or point
 * CHROMIUM_PATH at an existing binary. Headless mobile emulation throttles
 * requestAnimationFrame hard, so prefer waitForFunction over wall-clock waits.
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 8517;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css' };

let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '  \u2192 ' + detail : ''));
  if (!ok) failures++;
}

/* serve the repo as-is, so the page loads its vendored three.js exactly as in production */
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.normalize(path.join(ROOT, rel === '/' ? 'index.html' : rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const BASE = 'http://localhost:' + PORT + '/';
  const launch = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
  if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
  let browser;
  try {
    browser = await chromium.launch(launch);
  } catch (e) {
    console.error('\nCould not start Chromium. Either install one:\n' +
      '  npx playwright install chromium\n' +
      'or point at an existing binary:\n' +
      '  CHROMIUM_PATH=/path/to/chrome npm test\n\n' + e.message);
    server.close();
    process.exit(1);
  }

  const SHOTS = path.join(ROOT, 'test', 'screenshots');
  fs.mkdirSync(SHOTS, { recursive: true });

  async function newPage(opts) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 800 } }, opts));
    const page = await ctx.newPage();
    page.errors = [];
    page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
    page.on('pageerror', e => page.errors.push('PAGEERROR: ' + e.message));
    return { ctx, page };
  }

  /* ================= desktop pass ================= */
  {
    const { ctx, page } = await newPage({});
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(5000);
    check('load screen cleared', await page.evaluate(() => document.getElementById('load').classList.contains('gone')));
    await page.click('#gate');
    await page.waitForTimeout(4000);

    const st = await page.evaluate(() => ({
      posFinite: [player.p.x, player.p.y, player.p.z].every(Number.isFinite),
      speed: player.v.length(),
      wind: WIND.length(),
      windFinite: [WIND.x, WIND.y, WIND.z].every(Number.isFinite),
      dayT, curNight,
      hud: document.querySelector('#vSpd .v').textContent
    }));
    check('sim runs, position finite', st.posFinite, 'speed ' + st.speed.toFixed(1) + ' m/s, HUD ' + st.hud);
    check('wind finite and bounded', st.windFinite && st.wind >= 0 && st.wind < 8, st.wind.toFixed(2) + ' m/s');
    check('day clock advancing from 0.55', st.dayT > 0.55 && st.dayT < 0.58, 'dayT ' + st.dayT.toFixed(4));

    /* continuous TOD: jump the clock near night, verify lighting follows */
    const night = await page.evaluate(() => { dayT = 0.80; return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => res({ curNight, exp: renderer.toneMappingExposure })))); });
    check('night plateau reaches full night', night.curNight > 0.99, 'curNight ' + night.curNight.toFixed(2) + ', exposure ' + night.exp.toFixed(2));
    const dusk = await page.evaluate(() => { dayT = 0.665; return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => res(curNight)))); });
    check('mid-segment blend is intermediate', dusk > 0.3 && dusk < 0.95, 'curNight ' + dusk.toFixed(2));

    /* T skips to next anchor */
    const tSkip = await page.evaluate(() => { dayT = 0.31; return true; }) && await page.keyboard.press('KeyT').then(() =>
      page.evaluate(() => dayT));
    check('T key skips to next anchor', Math.abs(tSkip - 0.55) < 0.01, 'dayT ' + tSkip);

    /* photo mode */
    await page.keyboard.press('KeyC');
    await page.waitForTimeout(300);
    const photo = await page.evaluate(() => ({
      on: photoMode, cls: document.body.classList.contains('photo'),
      hud: getComputedStyle(document.getElementById('hud')).display,
      p: [player.p.x, player.p.y, player.p.z]
    }));
    await page.waitForTimeout(1200);
    const frozen = await page.evaluate(() => [player.p.x, player.p.y, player.p.z]);
    check('photo mode hides HUD', photo.on && photo.cls && photo.hud === 'none');
    check('photo mode freezes player', JSON.stringify(photo.p) === JSON.stringify(frozen));
    await page.keyboard.press('KeyC');
    const resumed = await page.waitForFunction(
      f => !photoMode && (player.p.x !== f[0] || player.p.y !== f[1] || player.p.z !== f[2]),
      frozen, { timeout: 20000 }
    ).then(() => true).catch(() => false);
    check('exit photo resumes physics', resumed);

    /* boarding: a web latched to the hull boards from any distance */
    await page.evaluate(() => {
      const pl = planes[0];
      const w = player.webs[0];
      w.on = true; w.pl = pl; w.lo.set(0, 2, 0); w.len = w.tgt = 60; w.rest = 40;
      planePoint(pl, 0, 2, 0, w.a);
      player.p.set(pl.p.x, pl.p.y - 60, pl.p.z);   // hanging a full tow-line below
      player.v.set(0, 0, 0);
    });
    await page.keyboard.press('KeyE');
    const towBoard = await page.waitForFunction(() => player.riding !== null, null, { timeout: 20000, polling: 100 }).then(() => true).catch(() => false);
    check('E boards from a latched tow line at 60 m', towBoard,
      await page.evaluate(() => 'riding=' + !!player.riding + ' websOff=' + (!player.webs[0].on && !player.webs[1].on)));

    /* boarding: distance measured to the hull surface, not its centre */
    await page.evaluate(() => { player.riding = null; });
    await page.evaluate(() => {
      const pl = planes[0];
      player.p.set(pl.p.x + 13 + 10, pl.p.y, pl.p.z);   // 10 m off the wingtip = 23 m from centre
      player.v.copy(pl.v);
    });
    await page.keyboard.press('KeyE');
    const tipBoard = await page.waitForFunction(() => player.riding !== null, null, { timeout: 20000, polling: 100 }).then(() => true).catch(() => false);
    check('E boards 10 m off a wingtip (23 m from centre)', tipBoard);

    await page.evaluate(() => { player.riding = null; });
    await page.evaluate(() => {
      const pl = planes[0];
      player.p.set(pl.p.x + 13 + 20, pl.p.y, pl.p.z);   // 20 m off the surface: out of reach
      player.v.copy(pl.v);
    });
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(600);
    check('E does not board from 20 m off the surface', await page.evaluate(() => player.riding === null));
    await page.evaluate(() => { respawn(); });

    /* flips: a hard upward release somersaults, a soft one doesn't */
    const flip = await page.evaluate(() => {
      const out = {};
      const w = player.webs[0];
      player.p.set(-46, 80, -230); player.grounded = false; player.riding = null;
      /* soft release: below threshold, no flip */
      flipT = 1e9; player.v.set(8, 5, 10); w.on = true; w.pl = null;
      releaseWeb(0); out.soft = flipT < flipDur;
      /* hard release: single flip */
      flipT = 1e9; player.v.set(8, 14, 10); w.on = true;
      releaseWeb(0); out.hard = flipT < flipDur; out.n1 = flipN;
      /* the rig really rotates mid-flip: pose once at half progress */
      const q1 = rig.quaternion.clone();
      flipT = flipDur * 0.5;
      poseRig(0.016, inp);
      out.angle = q1.angleTo(rig.quaternion);
      /* spin-rate consistency across the plateau — the original layering bug
         (flip fed back through the orientation slerp) made this erratic.
         Settle the base orientation on the new velocity first so only the
         flip's own rotation is measured. */
      flipT = 1e9; flipA = 0;
      for (let i = 0; i < 60; i++) poseRig(1 / 60, inp);
      flipT = flipDur * 0.30;
      poseRig(1 / 60, inp);
      const qp = rig.quaternion.clone(); const steps = [];
      for (let i = 0; i < 15; i++) {
        poseRig(1 / 60, inp);
        steps.push(qp.angleTo(rig.quaternion)); qp.copy(rig.quaternion);
      }
      const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
      out.rate = mean * 60;
      out.jitter = Math.max(...steps.map(s => Math.abs(s - mean))) / mean;
      /* violent release: double */
      flipT = 1e9; player.v.set(8, 25, 10); w.on = true;
      releaseWeb(0); out.n2 = flipN;
      /* grounding cancels */
      player.grounded = true; poseRig(0.016, inp); out.cancelled = !(flipT < flipDur);
      player.grounded = false; flipT = 1e9;
      return out;
    });
    check('soft release does not flip', !flip.soft);
    check('hard upward release starts a flip', flip.hard && flip.n1 === 1, JSON.stringify(flip));
    check('mid-flip rig is rotated', flip.angle > 1.5, 'angle ' + flip.angle.toFixed(2) + ' rad');
    check('flip tumbles at a constant rate', flip.jitter < 0.2,
      'plateau ' + (flip.rate * 180 / Math.PI).toFixed(0) + ' deg/s, jitter ' + (flip.jitter * 100).toFixed(1) + '%');
    check('flip pace is unhurried (under 400 deg/s)', flip.rate * 180 / Math.PI < 400, (flip.rate * 180 / Math.PI).toFixed(0) + ' deg/s');
    check('violent release doubles the flip', flip.n2 === 2);
    check('landing cancels the flip', flip.cancelled);
    /* render one mid-flip frame for visual inspection: pause the loop so the
       manual pose and camera survive until the screenshot */
    await page.evaluate(() => {
      paused = true;
      player.p.set(-46, 60, -230); player.v.set(12, 10, 20); player.grounded = false;
      pRender.copy(player.p);
      flipDur = 0.85; flipN = 1;
      for (let i = 0; i < 30; i++) { flipT = flipDur * 0.45; poseRig(0.016, inp); }
      camera.position.set(player.p.x + 2.6, player.p.y + 1.3, player.p.z - 5.5);
      camera.up.set(0, 1, 0);
      camera.lookAt(player.p.x, player.p.y + 0.4, player.p.z);
      renderer.render(scene, camera);
    });
    await page.screenshot({ path: SHOTS + '/flip.png' });
    await page.evaluate(() => { flipT = 1e9; paused = false; respawn(); });

    /* gopuram gateways: a gopuram is a gate, so the passage must be passable
       and the piers/lintel around it must not be. Rays start inside the
       courtyard and shoot outward, isolating the precinct from city clutter. */
    const gates = await page.evaluate(() => {
      const shot = (ox, oy, oz, dx, dy, dz, t) => { const h = rayHit(ox, oy, oz, dx, dy, dz, t); return h ? +h.t.toFixed(1) : null; };
      return {
        northOpen:   shot(0, 4, -100, 0, 0, -1, 40),
        northPier:   shot(8, 4, -100, 0, 0, -1, 40),
        northLintel: shot(0, 9, -100, 0, 0, -1, 40),
        eastOpen:    shot(100, 4, 0, 1, 0, 0, 36),
        archOpen:    shot(34, 3, -100, 0, 0, -1, 36),
        wallSolid:   shot(55, 3, -100, 0, 0, -1, 36),
        aboveArch:   shot(34, 9, -100, 0, 0, -1, 36),
        inPrecinct:  buildings.filter(b => Math.abs(b.x) < 132 && Math.abs(b.z) < 132).length,
        gateW: +(GOPURAMS[0].gap).toFixed(1), gateH: +(GOPURAMS[0].openH).toFixed(1)
      };
    });
    check('gopuram gateway is open through the middle', gates.northOpen === null && gates.eastOpen === null,
      'clear ' + gates.gateW + ' m wide x ' + gates.gateH + ' m high');
    check('gate piers still block', gates.northPier !== null, 'hit at ' + gates.northPier + ' m');
    check('gate lintel still blocks above the opening', gates.northLintel !== null, 'hit at ' + gates.northLintel + ' m');
    check('prakaram arches are passable', gates.archOpen === null);
    check('wall between arches is solid', gates.wallSolid !== null, 'hit at ' + gates.wallSolid + ' m');
    check('wall above an arch is solid', gates.aboveArch !== null, 'hit at ' + gates.aboveArch + ' m');
    check('no buildings inside the prakaram', gates.inPrecinct === 0, gates.inPrecinct + ' found');

    /* merged-geometry NaN scan: two undefined fields once poisoned a whole mesh */
    const nan = await page.evaluate(() => {
      let bad = 0;
      scene.traverse(o => {
        const g = o.geometry; if (!g || !g.attributes || !g.attributes.position) return;
        const a = g.attributes.position.array;
        for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) { bad++; break; }
      });
      return bad;
    });
    check('no NaN in any geometry', nan === 0, nan + ' meshes affected');

    /* Thermals. Climb rate is measured with the position pinned inside the
       column: unpinned, a 30 m/s glide leaves a 64 m thermal in two seconds and
       the reading silently becomes 'air outside a thermal' (it did, first try). */
    const therm = await page.evaluate(() => {
      const was = paused; paused = true;              // stop frame() stepping underneath us
      function climb({ x, z, glide, pitch = 0.10, hold = 90, secs = 8 }) {
        player.riding = null; player.clinging = false; player.grounded = false;
        player.webs[0].on = player.webs[1].on = false;
        player.p.set(x, hold, z); player.v.set(30, 0, 0);
        const i = { fwd: V3(Math.cos(pitch), Math.sin(pitch), 0), mx: 0, mz: 0, mzRaw: 0, jump: false,
          glide, tuck: false, reelIn: false, reelOut: false, zip: false, cling: false, mount: false };
        WIND.set(0, 0, 0);
        for (let k = 0, n = Math.round(secs / SUB); k < n; k++) {
          player.grounded = false; stepPhysics(SUB, i); player.p.set(x, hold, z);
        }
        return +player.v.y.toFixed(1);
      }
      const T = THERMALS[0];
      const out = {
        core: +thermalAt(T.x, 90, T.z).toFixed(1),
        outside: +thermalAt(T.x + T.r + 5, 90, T.z).toFixed(1),
        ceiling: +thermalAt(T.x, 240, T.z).toFixed(1),
        glideIn: climb({ x: T.x, z: T.z, glide: true }),
        glideOut: climb({ x: 0, z: -400, glide: true }),
        fallIn: climb({ x: T.x, z: T.z, glide: false }),
        fallOut: climb({ x: 0, z: -400, glide: false }),
      };
      paused = was; respawn();
      return out;
    });
    check('thermal is bounded: lift at the core, none outside or above',
      therm.core > 0 && therm.outside === 0 && therm.ceiling === 0,
      'core ' + therm.core + ' m/s');
    check('gliding inside a thermal GAINS altitude', therm.glideIn > 2,
      therm.glideIn + ' m/s climb vs ' + therm.glideOut + ' outside');
    check('gliding outside still sinks', therm.glideOut < 0);
    check('falling through a thermal does not climb', therm.fallIn < 0,
      therm.fallIn + ' m/s');
    check('but a thermal does slow a fall', therm.fallIn > therm.fallOut,
      therm.fallIn + ' vs ' + therm.fallOut + ' m/s outside');
    check('spreading the wings beats falling through', therm.glideIn > therm.fallIn + 10);

    /* Water contact. The sea used to be a lid — the ground clamp caught you at
       RAD, so you stood on it and every bit of momentum died. These assert it
       is a volume: you enter, you come back up, and a graze is not a plunge. */
    const water = await page.evaluate(() => {
      const was = paused; paused = true;
      function run({ x, z, y0, vy = 0, vx = 0, secs = 4 }) {
        player.riding = null; player.clinging = false; player.grounded = false; player.wasWet = false;
        player.webs[0].on = player.webs[1].on = false;
        player.p.set(x, y0, z); player.v.set(vx, vy, 0);
        const i = { fwd: V3(1, 0, 0), mx: 0, mz: 0, mzRaw: 0, jump: false, glide: false, tuck: false,
                    reelIn: false, reelOut: false, zip: false, cling: false, mount: false };
        let minY = 1e9;
        splashCool = 0;                       // updateSplashes is not running to clear it
        const splash0 = splashNext;
        for (let k = 0, n = Math.round(secs / SUB); k < n; k++) {
          stepPhysics(SUB, i);
          minY = Math.min(minY, player.p.y);
        }
        const splashed = splashNext - splash0;
        return { minY: +minY.toFixed(2), restY: +player.p.y.toFixed(2),
                 horiz: +Math.hypot(player.v.x, player.v.z).toFixed(1), grounded: player.grounded, splashed };
      }
      const out = {
        skim:  run({ x: SEA_X + 120, z: 0, y0: 0.7, vx: 45, vy: -1.5, secs: 3 }),
        dive:  run({ x: SEA_X + 120, z: 0, y0: 25, vy: -30, secs: 6 }),
        float: run({ x: SEA_X + 120, z: 40, y0: -6, secs: 8 }),
        river: run({ x: -120, z: riverZ(-120), y0: 20, vy: -20, secs: 6 }),
        land:  run({ x: -300, z: -420, y0: 60, vy: -40, secs: 4 }),
      };
      paused = was; respawn();
      return out;
    });
    check('water is enterable, not a lid', water.dive.minY < -2 && !water.dive.grounded,
      'dive reached ' + water.dive.minY + ' m');
    check('a dive surfaces and settles at the waterline', Math.abs(water.dive.restY) < 0.4,
      'rest y ' + water.dive.restY);
    check('a submerged body floats back up', water.float.restY > -0.4 && water.float.restY < 0.4,
      'from -6 m to ' + water.float.restY);
    check('skimming stays shallow and keeps speed', water.skim.minY > -2 && water.skim.horiz > 10,
      water.skim.horiz + ' m/s kept, dipped to ' + water.skim.minY + ' m');
    check('a graze is cheaper than a plunge', water.skim.horiz > water.dive.horiz + 8);
    check('the river behaves like the sea', Math.abs(water.river.restY - 0.06) < 0.4,
      'rest y ' + water.river.restY);
    check('entering water raises a splash', water.dive.splashed > 0 && water.land.splashed === 0);
    check('dry land is unaffected', water.land.grounded && Math.abs(water.land.restY - 0.85) < 0.01);

    /* settings persistence across reload */
    await page.evaluate(() => { sens = 0.0071; assist = false; saveSettings(); });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(4000);
    const persisted = await page.evaluate(() => ({ sens, assist }));
    check('settings persist across reload', Math.abs(persisted.sens - 0.0071) < 1e-9 && persisted.assist === false, JSON.stringify(persisted));

    /* long-run stability with wind */
    await page.click('#gate');
    await page.waitForTimeout(8000);
    const stable = await page.evaluate(() => [player.p.x, player.p.y, player.p.z, player.v.x, player.v.y, player.v.z].every(Number.isFinite));
    check('12s run stays finite under wind', stable);
    check('desktop console clean', page.errors.length === 0, page.errors.join(' | ') || 'no errors');
    await page.screenshot({ path: SHOTS + '/desktop.png' });
    await ctx.close();
  }

  /* ================= touch pass (landscape) ================= */
  {
    const { ctx, page } = await newPage({ viewport: { width: 860, height: 400 }, hasTouch: true, isMobile: true });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(4000);
    const boot = await page.evaluate(() => ({
      touch: document.body.classList.contains('touch'),
      rotate: getComputedStyle(document.getElementById('rotate')).display,
      pr: renderer.getPixelRatio(),
      shadow: sun.shadow.mapSize.width
    }));
    check('touch UI enabled on coarse pointer', boot.touch);
    check('rotate overlay hidden in landscape', boot.rotate === 'none');
    check('mobile perf: pixel ratio capped at 1.25', boot.pr <= 1.25, 'ratio ' + boot.pr);
    check('mobile perf: 1024px shadow map', boot.shadow === 1024);

    await page.tap('#gate');
    await page.waitForTimeout(1200);
    const t0 = await page.evaluate(() => ({
      started, gateGone: document.getElementById('gate').classList.contains('gone'),
      freeLook, touchVisible: getComputedStyle(document.getElementById('touch')).display
    }));
    check('gate tap starts game, no freelook ring', t0.started && t0.gateGone && !t0.freeLook && t0.touchVisible === 'block', JSON.stringify(t0));

    /* floating stick: touch anywhere in the left zone spawns the stick there */
    const stick = await page.evaluate(() => {
      dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, pointerType: 'touch', bubbles: true, clientX: 150, clientY: 220 }));
      const spawn = { id: tstick.id, live: document.getElementById('tStick').classList.contains('live'),
                      left: document.getElementById('tStick').style.left };
      dispatchEvent(new PointerEvent('pointermove', { pointerId: 9, pointerType: 'touch', bubbles: true, clientX: 150, clientY: 150 }));
      const bent = { y: tstick.y };
      /* release NOWHERE NEAR the stick element — window-level tracking must still reset it */
      document.body.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, pointerType: 'touch', bubbles: true, clientX: 700, clientY: 100 }));
      return { spawn, bent, after: { id: tstick.id, x: tstick.x, y: tstick.y } };
    });
    check('floating stick spawns at thumb', stick.spawn.id !== -1 && stick.spawn.live && stick.spawn.left === '90px', JSON.stringify(stick.spawn));
    check('stick deflects full forward', stick.bent.y < -0.95, 'y ' + stick.bent.y);
    check('stick releases even off-element', stick.after.id === -1 && stick.after.x === 0 && stick.after.y === 0);

    /* web button: hold fires, dragging the held thumb aims, release lets go.
       Drop the player to street level first so anchors exist overhead. The
       emulated-mobile rAF loop is heavily throttled in headless, so wait on
       conditions rather than wall time. */
    await page.evaluate(() => { player.p.set(-46, 20, -230); player.v.set(0, 0, 0); });
    const webDown = await page.evaluate(() => {
      const el = document.getElementById('tWeb');
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, pointerType: 'touch', bubbles: true, clientX: r.left + 40, clientY: r.top + 40 }));
      return { held: held[0], lit: el.classList.contains('on') };
    });
    check('web button engages', webDown.held && webDown.lit);
    const webOn = await page.waitForFunction(() => player.webs[0].on, null, { timeout: 25000 }).then(() => true).catch(() => false);
    check('web fired while held (anchor found)', webOn);
    const aim = await page.evaluate(() => {
      const before = yaw;
      dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, pointerType: 'touch', bubbles: true, clientX: 500, clientY: 200 }));
      dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, pointerType: 'touch', bubbles: true, clientX: 590, clientY: 200 }));
      return { held: held[0], turned: yaw - before };
    });
    check('held web thumb aims the view', aim.held && Math.abs(aim.turned) > 0.1, 'Δyaw ' + aim.turned.toFixed(3));
    const webUp = await page.evaluate(() => {
      /* release far from the button — must still let go */
      document.body.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', bubbles: true, clientX: 300, clientY: 100 }));
      return { held: held[0], on: player.webs[0].on, lit: document.getElementById('tWeb').classList.contains('on') };
    });
    check('web releases even off-element', !webUp.held && !webUp.on && !webUp.lit);

    /* jump button sets Space (glide path) and aims while held */
    const jump = await page.evaluate(() => {
      const el = document.getElementById('tJump');
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 8, pointerType: 'touch', bubbles: true, clientX: r.left + 30, clientY: r.top + 30 }));
      const dn = !!keys['Space'];
      const y0 = yaw;
      dispatchEvent(new PointerEvent('pointermove', { pointerId: 8, pointerType: 'touch', bubbles: true, clientX: r.left + 100, clientY: r.top + 30 }));
      const turned = yaw - y0;
      document.body.dispatchEvent(new PointerEvent('pointerup', { pointerId: 8, pointerType: 'touch', bubbles: true }));
      return { dn, turned, up: !!keys['Space'] };
    });
    check('jump button drives Space key state', jump.dn && !jump.up);
    check('held glide thumb aims the view', jump.turned > 0.1, 'Δyaw ' + jump.turned.toFixed(3));

    /* hand-role layout: swing-time actions (zip, dive) on the left, held
       primaries (web, jump) on the right */
    const layout = await page.evaluate(() => {
      const cx = id => { const r = document.getElementById(id).getBoundingClientRect(); return (r.left + r.right) / 2 / innerWidth; };
      return { zip: cx('tZip'), dive: cx('tTuck'), web: cx('tWeb'), jump: cx('tJump') };
    });
    check('zip and dive sit on the left hand', layout.zip < 0.45 && layout.dive < 0.45, JSON.stringify(layout));
    check('web and jump sit on the right hand', layout.web > 0.55 && layout.jump > 0.55);

    /* the question that drove this layout: zip WHILE the web is held */
    const both = await page.evaluate(() => {
      const web = document.getElementById('tWeb'), zip = document.getElementById('tZip');
      web.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 21, pointerType: 'touch', bubbles: true }));
      zip.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 22, pointerType: 'touch', bubbles: true }));
      const during = { web: held[0], zip: !!keys['KeyQ'] };
      document.body.dispatchEvent(new PointerEvent('pointerup', { pointerId: 22, pointerType: 'touch', bubbles: true }));
      const zipUp = { web: held[0], zip: !!keys['KeyQ'] };
      document.body.dispatchEvent(new PointerEvent('pointerup', { pointerId: 21, pointerType: 'touch', bubbles: true }));
      return { during, zipUp, after: held[0] };
    });
    check('zip works while web is held', both.during.web && both.during.zip, JSON.stringify(both.during));
    check('releasing zip keeps the web held', both.zipUp.web && !both.zipUp.zip && !both.after);

    /* drag-look on the right side of the screen */
    const yaw0 = await page.evaluate(() => yaw);
    await page.evaluate(() => {
      dispatchEvent(new PointerEvent('pointerdown', { pointerId: 11, pointerType: 'touch', bubbles: true, clientX: 600, clientY: 120 }));
      dispatchEvent(new PointerEvent('pointermove', { pointerId: 11, pointerType: 'touch', bubbles: true, clientX: 700, clientY: 120 }));
      dispatchEvent(new PointerEvent('pointerup', { pointerId: 11, pointerType: 'touch', bubbles: true }));
    });
    const yaw1 = await page.evaluate(() => yaw);
    check('touch drag turns the view', yaw1 > yaw0, 'yaw ' + yaw0.toFixed(3) + ' → ' + yaw1.toFixed(3));

    /* contextual board button near an aircraft, tap boards */
    await page.evaluate(() => { const pl = planes[0]; player.p.copy(pl.p); player.p.y += 2; player.v.copy(pl.v); });
    const boardShown = await page.waitForFunction(
      () => document.getElementById('tBoard').classList.contains('show'), null, { timeout: 25000 }
    ).then(() => true).catch(() => false);
    check('board button appears near aircraft', boardShown);
    await page.evaluate(() => {
      const el = document.getElementById('tBoard');
      el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 13, pointerType: 'touch', bubbles: true }));
      document.body.dispatchEvent(new PointerEvent('pointerup', { pointerId: 13, pointerType: 'touch', bubbles: true }));
    });
    const boarded = await page.waitForFunction(
      () => player.riding !== null && !document.getElementById('tBoard').classList.contains('show'),
      null, { timeout: 25000 }
    ).then(() => true).catch(() => false);
    check('tap boards the aircraft, button hides', boarded);

    await page.waitForTimeout(1000);
    check('touch sim stays finite', await page.evaluate(() => [player.p.x, player.p.y, player.p.z].every(Number.isFinite)));
    check('touch console clean', page.errors.length === 0, page.errors.join(' | ') || 'no errors');
    await page.screenshot({ path: SHOTS + '/touch.png' });
    await ctx.close();
  }

  /* ================= portrait overlay pass ================= */
  {
    const { ctx, page } = await newPage({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(3000);
    const rot = await page.evaluate(() => getComputedStyle(document.getElementById('rotate')).display);
    check('portrait shows rotate overlay', rot === 'flex', 'display ' + rot);
    check('portrait console clean', page.errors.length === 0, page.errors.join(' | ') || 'no errors');
    await ctx.close();
  }

  /* ================= fixed-step pass =================
     Takes the loop away from requestAnimationFrame and the GPU: frames are run
     synchronously on a chosen dt, so a 240 Hz display can be simulated exactly
     and nothing here waits on the wall clock. */
  {
    const { ctx, page } = await newPage({});
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('load').classList.contains('gone'));
    await page.evaluate(() => {
      window.requestAnimationFrame = () => 0;
      renderer.render = () => {};
      window.__dt = 1 / 60; clock.getDelta = () => window.__dt;
      window.__run = (n) => { for (let i = 0; i < n; i++) frame(); };
    });
    await page.waitForTimeout(150);   // let the one already-queued rAF callback drain

    /* presses on a display faster than the 120 Hz physics: frames with no
       substep must not swallow the edge. Polarity: 60 Hz has always passed. */
    for (const hz of [60, 144, 240]) {
      const r = await page.evaluate((hz) => {
        __dt = 1 / hz; let jumped = 0, boarded = 0; const N = 120;
        for (let i = 0; i < N; i++) {
          player.riding = null;
          player.p.set(-350, 0.85, -182); player.v.set(0, 0, 0);   // open road junction
          __run(Math.ceil(hz / 3) + (i % 7));                        // settle, at a varying accumulator phase
          const y0 = player.p.y;
          jumpEdge = true; __run(Math.ceil(hz / 20));
          if (player.p.y > y0 + 0.3) jumped++;
          const pl = planes[0];
          player.p.set(pl.p.x, pl.p.y + 3, pl.p.z); player.v.copy(pl.v); __run(2 + (i % 5));
          player.p.set(pl.p.x, pl.p.y + 3, pl.p.z);
          mountEdge = true; __run(2);
          if (player.riding) boarded++;
        }
        player.riding = null;
        /* and one press is still exactly one jump */
        player.p.set(-350, 0.85, -182); player.v.set(0, 0, 0); __run(hz);
        jumpEdge = true; __run(Math.ceil(hz / 10));
        return { N, jumped, boarded, vy: player.v.y };
      }, hz);
      check('every jump press lands at ' + hz + ' Hz', r.jumped === r.N, r.jumped + '/' + r.N);
      check('every board press lands at ' + hz + ' Hz', r.boarded === r.N, r.boarded + '/' + r.N);
      check('one press is one jump at ' + hz + ' Hz', r.vy > 12 && r.vy < 16, 'vy ' + r.vy.toFixed(1) + ' m/s after 0.1 s');
    }

    /* tapping the web must not manufacture energy. Fixed pendulum, assist off,
       identical start; the only difference between runs is the tapping. */
    const pend = await page.evaluate(() => {
      __dt = 1 / 60;
      const swing = (every) => {
        assist = false; player.riding = null; releaseWeb(0); releaseWeb(1);
        const b = buildings.reduce((a, c) => c.h > a.h ? c : a);
        const A = { x: b.x - b.w / 2 - 14, y: b.h + 60, z: b.z, pl: null };   // free air beside the tallest tower
        const L = 40, th = Math.PI / 3, y0 = A.y - L * Math.cos(th);
        player.p.set(A.x, y0, A.z + L * Math.sin(th)); player.v.set(0, 0, 0);
        fireWebAt(0, A);
        const E = () => 0.5 * player.v.lengthSq() + G * player.p.y, e0 = E();
        let maxY = -1e9;
        for (let f = 0; f < 60 * 15; f++) {
          if (every && f % every === 0 && player.webs[0].on) { releaseWeb(0); fireWebAt(0, A); }
          __run(1); maxY = Math.max(maxY, player.p.y);
        }
        const out = { rise: maxY - y0, gain: (E() - e0) / G };
        releaseWeb(0); assist = true; return out;
      };
      const pop = (age) => {
        const w = player.webs[0]; player.p.set(-46, 80, -230); player.grounded = false; flipT = 1e9;
        w.on = true; w.pl = null; w.age = age; player.v.set(8, 5, 10); releaseWeb(0);
        return player.v.y - 5;
      };
      return { hold: swing(0), tap4: swing(15), tap10: swing(6), popTap: pop(0.1), popSwing: pop(2.0) };
    });
    check('a held swing only loses energy to drag', pend.hold.gain < 0 && pend.hold.rise < 0.5,
      'energy ' + pend.hold.gain.toFixed(1) + ' m of height over 15 s');
    check('tapping the web 10x a second gains nothing', pend.tap10.gain <= pend.hold.gain + 1 && pend.tap10.rise < 0.5,
      'energy ' + pend.tap10.gain.toFixed(1) + ' m, rise ' + pend.tap10.rise.toFixed(1) + ' m');
    check('tapping the web 4x a second gains nothing', pend.tap4.gain <= pend.hold.gain + 1 && pend.tap4.rise < 0.5,
      'energy ' + pend.tap4.gain.toFixed(1) + ' m, rise ' + pend.tap4.rise.toFixed(1) + ' m');
    check('a tap earns no release pop', Math.abs(pend.popTap) < 1e-6, pend.popTap.toFixed(2) + ' m/s');
    check('a full swing still earns its release pop', Math.abs(pend.popSwing - 2.4) < 1e-6, pend.popSwing.toFixed(2) + ' m/s');

    /* limbs settle on real time, not on frame count */
    const settle = await page.evaluate(() => [30, 60, 144, 240].map(hz => {
      player.riding = null;
      player.p.set(-46, 200, -230); player.v.set(0, -5, 20); player.grounded = false; player.clinging = false; flipT = 1e9;
      pRender.copy(player.p);
      const rest = { fwd: inp.fwd, glide: false, tuck: false }, glide = { fwd: inp.fwd, glide: true, tuck: false };
      for (let i = 0; i < 400; i++) poseRig(1 / 60, rest);
      const n = Math.round(0.1 * hz); for (let i = 0; i < n; i++) poseRig(1 / hz, glide);
      return spine.rotation.x;
    }));
    const sMin = Math.min(...settle), sMax = Math.max(...settle);
    check('rig pose speed is independent of frame rate', (sMax - sMin) / sMax < 0.05,
      'spine 0.1 s into a glide at 30/60/144/240 Hz: ' + settle.map(v => v.toFixed(3)).join(' '));

    /* the maidan and the tank are open ground: nothing built on them, nothing
       driving across them, and the tank's steps are walkable */
    const open = await page.evaluate(() => {
      const touching = buildings.filter(b => onOpenGround(b.x, b.z, b.w / 2, b.d / 2)).length;
      const lanes = segs.filter(s => {
        for (let t = s.a; t <= s.b; t += 2) if (onOpenGround(s.axis === 'x' ? t : s.k, s.axis === 'x' ? s.k : t, 0, 0)) return true;
        return false;
      }).length;
      const mt = THERMALS[THERMALS.length - 1];
      const inThermal = buildings.filter(b => Math.hypot(b.x - mt.x, b.z - mt.z) < mt.r).length;
      /* walk in from the street, over the ghats, to the water */
      __dt = 1 / 60; player.riding = null;
      player.p.set(TANK.x - TANK.half - 18, 0.85, TANK.z); player.v.set(0, 0, 0); yaw = -Math.PI / 2; pitch = 0; __run(30);
      let top = 0; keys['KeyW'] = true;
      for (let f = 0; f < 60 * 9; f++) { __run(1); top = Math.max(top, player.p.y); }
      keys['KeyW'] = false;
      return { n: buildings.length, touching, lanes, inThermal, top, reach: player.p.x - TANK.x, endY: player.p.y };
    });
    check('nothing is built on the maidan or the tank', open.touching === 0 && open.n > 250, open.touching + ' of ' + open.n + ' buildings');
    check('no traffic lane crosses the maidan or the tank', open.lanes === 0, open.lanes + ' lanes');
    check('the maidan thermal is clear of buildings', open.inThermal === 0, open.inThermal + ' buildings');
    check('tank ghats are climbed on foot, down to the pool', open.top > 1.6 && open.top < 2.2 && Math.abs(open.reach) < 40 && open.endY < 0.9,
      'crest ' + open.top.toFixed(2) + ' m, ended ' + open.reach.toFixed(0) + ' m from centre at y ' + open.endY.toFixed(2));

    /* vegetation is batched by ground cell so the camera and the shadow
       frustum can each skip what they cannot see. Polarity: before batching
       this was 866k triangles in both passes from every viewpoint. */
    const veg = await page.evaluate(() => {
      const tris = (b) => b.geometry.attributes.position.count / 3 * b.count;
      const all = vegBatches.reduce((s, b) => s + tris(b), 0);
      const plants = vegBatches.reduce((s, b) => s + b.count, 0);
      /* every plant must sit inside the sphere its batch is culled by */
      let outside = 0; const m = new THREE.Matrix4(), s = new THREE.Sphere(), c = new THREE.Sphere();
      for (const b of vegBatches) {
        b.updateMatrixWorld();
        c.copy(b.geometry.boundingSphere).applyMatrix4(b.matrixWorld);
        const g = b.geometry.clone(); g.computeBoundingSphere();
        for (let i = 0; i < b.count; i++) {
          b.getMatrixAt(i, m); m.premultiply(b.matrixWorld);
          s.copy(g.boundingSphere).applyMatrix4(m);
          if (s.center.distanceTo(c.center) + s.radius > c.radius + 1e-3) outside++;
        }
        g.dispose();
      }
      const drawn = (x, y, z, yw, pt) => {
        __dt = 1 / 60; player.riding = null; yaw = yw; pitch = pt;
        for (let i = 0; i < 40; i++) { player.p.set(x, y, z); player.v.set(0, 0, 0); __run(1); }
        scene.updateMatrixWorld(); camera.updateMatrixWorld();
        const cam = new THREE.Frustum().setFromProjectionMatrix(
          new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        sun.shadow.updateMatrices(sun);
        const sh = sun.shadow.getFrustum();
        let n = 0;
        for (const b of vegBatches) n += (cam.intersectsObject(b) ? tris(b) : 0) + (sh.intersectsObject(b) ? tris(b) : 0);
        return n;
      };
      const views = [drawn(0, 0.85, 42, 0, 0.1), drawn(0, 0.85, 42, Math.PI, 0.1), drawn(0, 220, 0, 0.6, -0.5),
                     drawn(-640, 30, -300, Math.PI / 2, 0), drawn(-640, 30, -300, -Math.PI / 2, 0)];
      return { all, plants, outside, batches: vegBatches.length, culled: vegBatches.every(b => b.frustumCulled), worst: Math.max(...views) };
    });
    check('vegetation: every plant is inside its batch\'s culling sphere', veg.outside === 0 && veg.culled && veg.plants > 1200,
      veg.outside + ' of ' + veg.plants + ' outside, ' + veg.batches + ' batches');
    check('vegetation: a frame draws well under the old 1.73M triangles', veg.all < 420000 && veg.worst < 330000,
      (veg.all / 1000).toFixed(0) + 'k in the world, worst view draws ' + (veg.worst / 1000).toFixed(0) + 'k across both passes');

    /* whatever is fixed to an aircraft is drawn on the aircraft, on every
       frame. Polarity: 60 Hz always read 0; 144 Hz used to read 0.14 m. */
    const pin = await page.evaluate(() => {
      const out = {}, o = new THREE.Vector3(), pl = planes[0];
      for (const hz of [60, 144, 240]) {
        __dt = 1 / hz; held[0] = held[1] = false; releaseWeb(0); releaseWeb(1); player.riding = null;
        player.p.set(pl.p.x, pl.p.y + 3, pl.p.z); player.v.copy(pl.v); __run(3); mountEdge = true; __run(6);
        let rider = player.riding ? 0 : 99, anchor = 99;
        for (let i = 0; i < 200; i++) { __run(1); planePoint(pl, player.rideLo.x, player.rideLo.y, player.rideLo.z, o); rider = Math.max(rider, o.distanceTo(pRender)); }
        player.riding = null; player.p.set(pl.p.x, pl.p.y - 30, pl.p.z); player.v.copy(pl.v);
        const w = player.webs[0];
        if (fireWebAt(0, { x: pl.p.x, y: pl.p.y - 2, z: pl.p.z, pl })) {
          anchor = 0;
          for (let i = 0; i < 200 && w.on; i++) { __run(1); planePoint(pl, w.lo.x, w.lo.y, w.lo.z, o); anchor = Math.max(anchor, o.distanceTo(w.a)); }
        }
        releaseWeb(0); out[hz] = Math.max(rider, anchor);
      }
      return out;
    });
    check('rider and tow anchor stay pinned to the hull at 60/144/240 Hz', pin[60] < 1e-3 && pin[144] < 1e-3 && pin[240] < 1e-3,
      'worst slip ' + [60, 144, 240].map(h => pin[h].toFixed(3) + ' m').join(' / '));

    /* coyote time: the jump still counts just after the edge, not long after,
       and never a second time on the way up */
    const coy = await page.evaluate(() => {
      __dt = 1 / 60; player.riding = null; held[0] = held[1] = false; releaseWeb(0); releaseWeb(1);
      const b = buildings.find(b => b.h > 30 && b.w > 14 && freeAt(b.x + b.w / 2 + 8, b.z, 6));
      const offEdge = (delay) => {
        player.p.set(b.x + b.w / 2 - 3, b.h + 2.5, b.z); player.v.set(0, 0, 0); yaw = -Math.PI / 2; pitch = 0;
        __run(50); const roofY = player.p.y, stood = player.grounded;
        keys['KeyW'] = true;
        let f = 0; while (player.grounded && f++ < 300) __run(1);
        __run(delay); jumpEdge = true; __run(3);
        keys['KeyW'] = false;
        return { stood, left: f < 300, vy: player.v.y, drop: roofY - player.p.y };
      };
      const hop = (again) => {
        player.p.set(-350, 0.85, -182); player.v.set(0, 0, 0); __run(30);
        jumpEdge = true; __run(6); if (again) jumpEdge = true; __run(6);
        return player.v.y;
      };
      return { found: !!b, soon: offEdge(6), late: offEdge(18), once: hop(false), twice: hop(true) };
    });
    check('a jump 0.1 s after running off a roof still jumps', coy.found && coy.soon.stood && coy.soon.left && coy.soon.vy > 8,
      'vy ' + coy.soon.vy.toFixed(1) + ' m/s');
    check('a jump 0.3 s after the edge does not', coy.late.left && coy.late.vy < 0, 'vy ' + coy.late.vy.toFixed(1) + ' m/s');
    /* a second jump would read about 17 m/s; the wind alone moves it by millimetres */
    check('coyote time gives no second jump on the way up', Math.abs(coy.once - coy.twice) < 0.5,
      'vy ' + coy.once.toFixed(2) + ' with one press, ' + coy.twice.toFixed(2) + ' m/s with two');

    /* a paused game draws one frame and then leaves the GPU alone */
    const idle = await page.evaluate(() => {
      let draws = 0; renderer.render = () => { draws++; };
      __dt = 1 / 60; __run(5); const playing = draws;
      draws = 0; setPaused(true); __run(120); const paused1 = draws;   // the one frame is drawn by pausing itself
      dispatchEvent(new Event('resize')); __run(60); const resized = draws - paused1;
      const t0 = T; __run(10); const frozen = T === t0;
      setPaused(false); draws = 0; __run(5); const resumed = draws;
      renderer.render = () => {};
      return { playing, paused1, resized, frozen, resumed };
    });
    check('paused: one frame drawn, then none', idle.playing === 5 && idle.paused1 === 1 && idle.frozen, JSON.stringify(idle));
    check('paused: a resize redraws once, resuming draws every frame', idle.resized === 1 && idle.resumed === 5);

    /* vehicles are written straight into the instance buffer; check that
       against a matrix composed the long way */
    const traf = await page.evaluate(() => {
      __dt = 1 / 60; __run(30);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
      let worst = 0;
      for (const v of vehicles) {
        const onX = v.seg.axis === 'x';
        p.set(onX ? v.t : v.seg.k + v.dir * 3.7, 0, onX ? v.seg.k - v.dir * 3.7 : v.t);
        e.set(0, onX ? (v.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (v.dir > 0 ? 0 : Math.PI), 0);
        m.compose(p, q.setFromEuler(e), one);
        const a = vMeshes[v.mesh].instanceMatrix.array, o = v.idx * 16;
        for (let k = 0; k < 16; k++) worst = Math.max(worst, Math.abs(a[o + k] - m.elements[k]));
      }
      return { worst, n: vehicles.length };
    });
    check('traffic instance matrices match a composed transform', traf.worst < 1e-4 && traf.n > 300, 'worst entry off by ' + traf.worst.toExponential(1) + ' over ' + traf.n + ' vehicles');

    /* ring runs. A course is a pure function of its seed, so every date must
       yield one; then fly one on rails and check the clock, the saved best
       and the ghost. On rails at a known speed the time is length / speed
       whatever the frame rate, which is what the sub-frame crossing buys. */
    const crs = await page.evaluate(() => {
      let failed = 0, bad = 0, steep = 0; const t = new Date();
      for (let d = 0; d < 366; d++) {
        const day = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + d));
        const g = buildCourse(day.getUTCFullYear() * 10000 + (day.getUTCMonth() + 1) * 100 + day.getUTCDate());
        if (!g || g.length !== COURSE_RINGS) { failed++; continue; }
        for (let i = 0; i < g.length; i++) {
          if (!clearAt(g[i].x, g[i].y, g[i].z, RING_R) || roofNear(g[i].x, g[i].z, 70) < g[i].y) bad++;
          if (i && g[i].y - g[i - 1].y > 30.01) steep++;
        }
      }
      return { failed, bad, steep, same: JSON.stringify(buildCourse(77)) === JSON.stringify(buildCourse(77)) };
    });
    check('runs: every day of the coming year has a course', crs.failed === 0 && crs.same, crs.failed + ' dates without one');
    check('runs: every ring is in open air, below a roof to swing from, and never a steep climb', crs.bad === 0 && crs.steep === 0,
      crs.bad + ' badly placed, ' + crs.steep + ' too steep');

    const fly = await page.evaluate(() => {
      const rail = (hz, speed) => {
        __dt = 1 / hz; armRun();
        const g = run.rings, pts = [{ x: g[0].x - g[0].ux * 40, y: g[0].y, z: g[0].z - g[0].uz * 40 }].concat(g);
        pts.push({ x: g[11].x + g[11].ux * 30, y: g[11].y, z: g[11].z + g[11].uz * 30 });
        let len = 0; for (let i = 1; i < g.length; i++) len += Math.hypot(g[i].x - g[i - 1].x, g[i].y - g[i - 1].y, g[i].z - g[i - 1].z);
        const states = [run.state]; let ghostSeen = 0, ghostOff = 0, f = 0;
        /* constant speed along the whole polyline: the step carries over each corner */
        let s = 0;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
          for (; s < L; s += speed / hz) {
            player.p.set(a.x + (b.x - a.x) * s / L, a.y + (b.y - a.y) * s / L, a.z + (b.z - a.z) * s / L); player.v.set(0, 0, 0);
            __run(1); f++;
            if (states[states.length - 1] !== run.state) states.push(run.state);
            if (ghostMesh.visible) { ghostSeen++; ghostOff = Math.max(ghostOff, ghostMesh.position.distanceTo(player.p)); }
          }
          s -= L;
        }
        return { t: run.t, want: len / speed, states: states.join('>'), splits: run.splits.slice(), ghostSeen, ghostOff,
          hud: runEl.textContent, shown: runEl.classList.contains('on'), rings: ringNow.visible };
      };
      run.ci = 1;
      const first = rail(60, 50), saved1 = runSaves.c1 && runSaves.c1.time;
      const slower = rail(144, 40), saved2 = runSaves.c1.time;
      const faster = rail(60, 60), saved3 = runSaves.c1.time;
      const stored = JSON.parse(localStorage.getItem(RUN_KEY)).c1;
      quitRun();
      return { first, slower, faster, saved1, saved2, saved3, storedT: stored.time, ghostBytes: stored.ghost.length, off: run.state, hidden: !runEl.classList.contains('on') && !ringNow.visible };
    });
    check('runs: armed, live from the first ring, done at the last', fly.first.states === 'armed>live>done' && fly.first.shown && !fly.first.rings,
      fly.first.states + ' · "' + fly.first.hud + '"');
    check('runs: the clock is exact at 60 and 144 Hz', Math.abs(fly.first.t - fly.first.want) < 0.01 && Math.abs(fly.slower.t - fly.slower.want) < 0.01,
      fly.first.t.toFixed(3) + ' vs ' + fly.first.want.toFixed(3) + ' s, ' + fly.slower.t.toFixed(3) + ' vs ' + fly.slower.want.toFixed(3) + ' s');
    check('runs: splits rise ring by ring', fly.first.splits.length === 12 && fly.first.splits.every((v, i, a) => i === 0 ? v === 0 : v > a[i - 1]));
    check('runs: only a faster time replaces the best, and it is stored', fly.saved1 === fly.first.t && fly.saved2 === fly.saved1 && fly.saved3 === fly.faster.t && fly.saved3 < fly.saved1 && fly.storedT === fly.saved3,
      [fly.saved1, fly.saved2, fly.saved3].map(v => v.toFixed(2)).join(' → ') + ' s, ghost ' + fly.ghostBytes + ' bytes');
    check('runs: the ghost replays the best flight', fly.first.ghostSeen === 0 && fly.slower.ghostSeen > 100 && fly.faster.ghostSeen > 100,
      'seen on ' + fly.slower.ghostSeen + ' frames of the second run');
    check('runs: leaving clears the rings and the readout', fly.off === 'off' && fly.hidden);

    /* a saved time is a record only on the course it was flown on, and only if
       it is whole. Polarity: the untouched save is accepted first. */
    const trust = await page.evaluate(() => {
      const c = COURSES[1], good = JSON.stringify(runSaves.c1);
      const bestWith = (edit) => { runSaves.c1 = JSON.parse(good); edit(runSaves.c1); armRun(); const b = run.best; quitRun(); return b; };
      const intact = bestWith(() => {});
      const out = {
        intact: !!intact && intact.time === JSON.parse(good).time && intact.ghost.length > 30,
        movedCourse: bestWith(s => { s.sig = 'elsewhere'; }) === null,
        badTime: bestWith(s => { s.time = '12'; }) === null,
        shortSplits: bestWith(s => { s.splits.pop(); }) === null,
        noGhost: (b => !!b && b.ghost.length === 0)(bestWith(s => { delete s.ghost; })),
        sig: c.sig
      };
      runSaves.c1 = JSON.parse(good);
      return out;
    });
    check('runs: a save from a different course, or a damaged one, is no best at all',
      trust.intact && trust.movedCourse && trust.badTime && trust.shortSplits && trust.noGhost, JSON.stringify(trust));

    /* the page that stayed open past midnight: its daily course is yesterday's
       by the calendar, and the time set on it must still be kept */
    const late = await page.evaluate(() => {
      const ci = COURSES.findIndex(c => c.id.startsWith('day-')), id = COURSES[ci].id;
      const real = Date.prototype.getUTCDate; Date.prototype.getUTCDate = function () { return real.call(this) + 1; };
      run.ci = ci; armRun(); __dt = 1 / 60;
      for (const r of run.rings) { player.p.set(r.x, r.y, r.z); player.v.set(0, 0, 0); __run(1); }
      Date.prototype.getUTCDate = real;
      const kept = JSON.parse(localStorage.getItem(RUN_KEY))[id];
      const state = run.state; quitRun();
      return { state, kept: !!kept && kept.time > 0 };
    });
    check('runs: a daily time set after midnight is kept', late.state === 'done' && late.kept, JSON.stringify(late));

    /* the sound of a line biting belongs to whoever listens for it, once */
    const bite = await page.evaluate(() => {
      let n = 0; listen('attach', () => n++);
      player.riding = null; releaseWeb(0);
      fireWebAt(0, null); const onMiss = n;
      fireWebAt(0, { x: player.p.x, y: player.p.y + 30, z: player.p.z }); const onHit = n;
      releaseWeb(0);
      return { onMiss, onHit };
    });
    check('a line that bites announces it once; a miss does not', bite.onMiss === 0 && bite.onHit === 1, JSON.stringify(bite));
    check('fixed-step console clean', page.errors.length === 0, page.errors.join(' | ') || 'no errors');
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(failures === 0
    ? '\nALL CHECKS PASSED'
    : '\n' + failures + ' CHECK(S) FAILED');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('SMOKE CRASHED:', e); process.exit(1); });

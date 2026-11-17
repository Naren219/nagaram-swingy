/*
 * The fixed-step pass of the smoke suite. smoke.js runs it; see there for how
 * to run the suite.
 *
 * It takes the loop away from requestAnimationFrame and the GPU: frames are
 * run synchronously on a chosen dt, so a 240 Hz display can be simulated
 * exactly and nothing here waits on the wall clock. In the page:
 *
 *   __run(n)       run n frames, each of __dt seconds
 *   __reset(hz)    a clean player at a frame rate (60 by default): off any
 *                  aircraft, both lines released, nothing held, no key down
 *
 * Every section starts from __reset(), so a section does not depend on what
 * ran before it. One section is one subject; a new one goes in SECTIONS.
 */

async function inputEdges(page, check) {
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
}

async function webEnergy(page, check) {
  /* tapping the web must not manufacture energy. Fixed pendulum, assist off,
     identical start; the only difference between runs is the tapping. */
  const pend = await page.evaluate(() => {
    const swing = (every) => {
      __reset(); assist = false;
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
}

async function rigTiming(page, check) {
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
}

async function openGround(page, check) {
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
}

async function vegetation(page, check) {
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
      __reset(); yaw = yw; pitch = pt;
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
}

async function hullPinning(page, check) {
  /* whatever is fixed to an aircraft is drawn on the aircraft, on every
     frame. Polarity: 60 Hz always read 0; 144 Hz used to read 0.14 m. */
  const pin = await page.evaluate(() => {
    const out = {}, o = new THREE.Vector3(), pl = planes[0];
    for (const hz of [60, 144, 240]) {
      __reset(hz);
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
}

async function coyoteTime(page, check) {
  /* coyote time: the jump still counts just after the edge, not long after,
     and never a second time on the way up */
  const coy = await page.evaluate(() => {
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
}

async function pausing(page, check) {
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
}

async function trafficMatrices(page, check) {
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
}

async function ringRuns(page, check) {
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
}

async function lineBite(page, check) {
  /* the sound of a line biting belongs to whoever listens for it, once */
  const bite = await page.evaluate(() => {
    let n = 0; listen('attach', () => n++);
    fireWebAt(0, null); const onMiss = n;
    fireWebAt(0, { x: player.p.x, y: player.p.y + 30, z: player.p.z }); const onHit = n;
    releaseWeb(0);
    return { onMiss, onHit };
  });
  check('a line that bites announces it once; a miss does not', bite.onMiss === 0 && bite.onHit === 1, JSON.stringify(bite));
}

async function motionEvents(page, check) {
  /* what the sound of moving is hung on: a landing is announced once, with
     the speed it happened at; so is a release; a foot comes down at a rate set
     by ground speed and not by the display; and the rush of something going by
     is there beside a wall at speed and nowhere else. Polarity: standing still
     and open sky must both read nothing. */
  const ev = await page.evaluate(() => {
    const seen = { land: [], release: [], step: 0 };
    listen('land', (hit, ny) => seen.land.push({ hit, ny }));
    listen('release', (spd, age) => seen.release.push({ spd, age }));
    listen('step', () => seen.step++);
    const drop = (hz, h) => {
      __reset(hz); seen.land.length = 0;
      player.p.set(-350, 0.85 + h, -182); player.v.set(0, 0, 0); player.airT = 1;
      __run(hz * 3);
      return { n: seen.land.length, hit: seen.land[0] ? seen.land[0].hit : 0, ny: seen.land[0] ? seen.land[0].ny : 0 };
    };
    const d60 = drop(60, 12), d240 = drop(240, 12);
    seen.land.length = 0; __run(240 * 2); const standing = seen.land.length;

    /* a wall, met side-on in flight */
    __reset();
    const b = buildings.find(b => b.h > 70 && b.kind === 'glass');
    seen.land.length = 0;
    player.p.set(b.x + b.w / 2 + 6, b.h * 0.6, b.z); player.v.set(-14, 0, 0); player.airT = 1; __run(40);
    const wall = seen.land[0] || { hit: 0, ny: 9 };

    __reset(); seen.release.length = 0;
    player.p.set(-46, 80, -230); player.v.set(0, 0, 25);
    fireWebAt(0, { x: -46, y: 130, z: -200, pl: null }); __run(45); releaseWeb(0); releaseWeb(0);
    const rel = { n: seen.release.length, age: seen.release[0] ? seen.release[0].age : 0 };

    const walk = (hz) => {
      __reset(hz); player.p.set(-350, 0.85, -182); player.v.set(0, 0, 0); yaw = 0; pitch = 0; __run(hz);
      seen.step = 0; __run(hz); const still = seen.step;
      keys['KeyW'] = true; __run(hz * 3); keys['KeyW'] = false;
      return { still, steps: seen.step };
    };
    const w60 = walk(60), w240 = walk(240);

    /* beside a tower at 108 km/h, then the same flight in open sky, then slowly */
    __reset(); yaw = 0; pitch = 0; updateCamDirs();
    const P = new THREE.Vector3(b.x + b.w / 2 + 3.85, b.h * 0.6, b.z), fast = new THREE.Vector3(0, 0, 30);
    player.grounded = false;
    const beside = Object.assign({}, proximity(P, fast));
    const sky = proximity(new THREE.Vector3(P.x, 420, P.z), fast).lvl;
    const slow = proximity(P, new THREE.Vector3(0, 0, 6)).lvl;
    yaw = Math.PI; updateCamDirs();
    const flipped = proximity(P, fast).pan;
    return { d60, d240, standing, wall, rel, w60, w240, beside, sky, slow, flipped, want: Math.sqrt(2 * G * 12) };
  });
  check('a landing is announced once, at the speed it happened',
    ev.d60.n === 1 && ev.d240.n === 1 && Math.abs(ev.d60.hit - ev.want) < 2.5 && Math.abs(ev.d240.hit - ev.want) < 2.5 && ev.d60.ny > 0.9,
    'a 12 m drop: ' + ev.d60.hit.toFixed(1) + ' m/s at 60 Hz, ' + ev.d240.hit.toFixed(1) + ' at 240 Hz (free fall ' + ev.want.toFixed(1) + ')');
  check('standing on the street announces nothing', ev.standing === 0, ev.standing + ' landings in 2 s');
  check('a wall met side-on is a landing too, and says it was a wall', ev.wall.hit > 10 && ev.wall.hit < 16 && Math.abs(ev.wall.ny) < 0.1,
    ev.wall.hit.toFixed(1) + ' m/s, normal y ' + ev.wall.ny.toFixed(2));
  check('a release is announced once, with its time on the line', ev.rel.n === 1 && Math.abs(ev.rel.age - 0.75) < 0.03,
    ev.rel.n + ' event(s), ' + ev.rel.age.toFixed(2) + ' s');
  check('footfalls follow ground speed, not the frame rate', ev.w60.still === 0 && ev.w240.still === 0 && ev.w60.steps > 6 && Math.abs(ev.w60.steps - ev.w240.steps) <= 1,
    ev.w60.steps + ' steps in 3 s at 60 Hz, ' + ev.w240.steps + ' at 240 Hz');
  check('the rush of a wall going by: there beside a tower at speed', ev.beside.lvl > 0.2 && ev.beside.l > 0.5 && ev.beside.r === 0,
    'level ' + ev.beside.lvl.toFixed(2) + ', wall side ' + ev.beside.l.toFixed(2));
  check('no rush in open sky or at walking pace', ev.sky === 0 && ev.slow === 0, 'sky ' + ev.sky + ', slow ' + ev.slow);
  check('the rush is heard on the side the wall is on', ev.beside.pan > 0.5 && ev.flipped < -0.5,
    'pan ' + ev.beside.pan.toFixed(2) + ' facing along the wall, ' + ev.flipped.toFixed(2) + ' facing back');
}

async function landing(page, check) {
  /* a fast touchdown rolls: the ground declines to stop you for a moment, and
     a jump inside that moment leaves with the speed. Polarity: on the old
     ground (grip 6.2 from the first step) 30 m/s was 4.7 m/s after 0.3 s. It
     must also give nothing away: running into the roll adds no speed, hopping
     from roll to roll only loses it, and at a walk nothing has changed. */
  const r = await page.evaluate(() => {
    const hs = () => Math.hypot(player.v.x, player.v.z);
    const touch = (hz, vx, held) => {
      __reset(hz); yaw = -Math.PI / 2; pitch = 0;          // facing +x, along the road
      player.p.set(-350, 2.2, -182); player.v.set(vx, -4, 0); player.airT = 1; player.roll = 9; player.grounded = false;
      let f = 0; while (!player.grounded && f++ < hz) __run(1);
      if (held) keys[held] = true;
      return hs();
    };
    const after = (hz, vx, secs, held) => { touch(hz, vx, held); __run(Math.round(hz * secs)); const v = hs(); keys[held] = false; return v; };
    const out = { at60: after(60, 30, 0.3), at240: after(240, 30, 0.3), rest: after(60, 30, 2.0), walk: after(60, 6, 0.3) };
    /* the old ground, for the polarity: the same touchdown with the roll switched off */
    touch(60, 30); player.roll = 9; __run(18); out.old = hs();
    /* jump a quarter of a second in */
    const v0 = touch(60, 30); __run(15); jumpEdge = true; __run(4);
    out.jump = { v0, v: hs(), vy: player.v.y, up: !player.grounded };
    /* run with it, as hard as the legs go, and watch for any gain */
    touch(60, 30, 'KeyW'); keys['ShiftLeft'] = true; let top = 0;
    for (let i = 0; i < 90; i++) { __run(1); top = Math.max(top, hs()); }
    keys['KeyW'] = keys['ShiftLeft'] = false; out.pushed = top; out.sprint = hs();
    /* hop from roll to roll */
    touch(60, 30); const hops = [hs()];
    for (let k = 0; k < 5; k++) {
      __run(10); jumpEdge = true; __run(2);
      let f = 0; while (!player.grounded && f++ < 400) __run(1);
      hops.push(hs());
    }
    out.hops = hops; out.rollOver = player.roll;
    return out;
  });
  check('a 108 km/h touchdown is still moving 0.3 s later', r.at60 > 24 && Math.abs(r.at60 - r.at240) < 0.5 && r.old < 7,
    r.at60.toFixed(1) + ' m/s at 60 Hz, ' + r.at240.toFixed(1) + ' at 240 Hz (without the roll: ' + r.old.toFixed(1) + ')');
  check('a jump out of the roll takes the speed with it', r.jump.up && r.jump.v > 0.8 * r.jump.v0 && r.jump.vy > 8,
    r.jump.v.toFixed(1) + ' of ' + r.jump.v0.toFixed(1) + ' m/s, rising at ' + r.jump.vy.toFixed(1));
  check('left alone, the roll ends and you stop', r.rest < 0.5, r.rest.toFixed(2) + ' m/s after 2 s');
  check('at a walk the ground is as it was', r.walk < 1.5, r.walk.toFixed(2) + ' m/s 0.3 s after a 6 m/s touchdown');
  check('running into the roll adds nothing', r.pushed <= 30.05 && r.sprint < 11 && r.sprint > 8,
    'peak ' + r.pushed.toFixed(2) + ' m/s from a 30 m/s touchdown, settling to a ' + r.sprint.toFixed(1) + ' m/s sprint');
  check('hopping from roll to roll only loses speed', r.hops.every((v, i, a) => i === 0 || v < a[i - 1]),
    r.hops.map(v => v.toFixed(1)).join(' > ') + ' m/s');
}

async function wallRun(page, check) {
  /* a wall met while travelling along it carries most of your weight for a
     moment. Polarity: the same launch in open air is plain free fall. It must
     not be a source of height or energy, must not happen head-on, slowly, on a
     line or in a dive, and must run out. */
  const r = await page.evaluate(() => {
    const b = buildings.filter(b => b.kind === 'glass' && b.h > 90 && b.d > 44).sort((a, c) => c.h - a.h)[0];
    const face = b.x + b.w / 2, z0 = b.z - b.d / 2 + 2, y0 = b.h * 0.75;
    const E = () => 0.5 * player.v.lengthSq() + G * player.p.y;
    const fly = (hz, o) => {
      __reset(hz); yaw = 0; pitch = 0;
      const air = o.air ? 400 : 0;                       // the same launch, clear of everything
      player.p.set(face + RAD + 0.01 + air, y0 + air, z0); player.v.set(o.vx, o.vy || 0, o.vz);
      player.grounded = false; player.wallT = WALL_T; player.airT = 0; player.touch = false;
      if (o.line) fireWebAt(0, { x: face + 30, y: y0 + 60, z: z0 + 30, pl: null });
      if (o.dive) keys['ShiftLeft'] = true;
      const e0 = E(), out = { ran: 0, gain: -1e9, top: -1e9 }, n = Math.round(hz * (o.secs || 1));
      for (let i = 0; i < n; i++) {
        __run(1);
        if (player.wallRun) out.ran++;
        out.gain = Math.max(out.gain, E() - e0); out.top = Math.max(out.top, player.p.y - y0 - air);
        if (o.kickAt === i) jumpEdge = true;
      }
      keys['ShiftLeft'] = false; releaseWeb(0);
      out.drop = y0 + air - player.p.y; out.ran /= hz; out.vy = player.v.y; out.left = player.wallT;
      out.off = (player.p.x - air - face - RAD); out.vOut = player.v.x;
      return out;
    };
    return {
      wall: fly(60, { vx: -2, vz: 22 }), wall240: fly(240, { vx: -2, vz: 22 }), free: fly(60, { vx: -2, vz: 22, air: true }),
      headOn: fly(60, { vx: -22, vz: 3 }), slow: fly(60, { vx: -2, vz: 7 }),
      line: fly(60, { vx: -2, vz: 22, line: true }), dive: fly(60, { vx: -2, vz: 22, dive: true }),
      long: fly(60, { vx: -2, vz: 18, secs: 2.2 }),
      rising: fly(60, { vx: -2, vy: 12, vz: 22 }), risingFree: fly(60, { vx: -2, vy: 12, vz: 22, air: true }),
      kick: fly(60, { vx: -2, vz: 22, kickAt: 20, secs: 0.4 }), depth: b.d, h: b.h
    };
  });
  check('a wall run along a tower face sinks a fraction of free fall', r.wall.ran > 0.9 && r.wall.drop < 0.45 * r.free.drop && r.free.drop > 10,
    r.wall.drop.toFixed(1) + ' m lost in 1 s on the wall, ' + r.free.drop.toFixed(1) + ' m in open air');
  check('the wall run is the same at 240 Hz', Math.abs(r.wall.drop - r.wall240.drop) < 0.3, r.wall.drop.toFixed(2) + ' vs ' + r.wall240.drop.toFixed(2) + ' m');
  check('no wall run head-on, at a jog, on a line or in a dive', r.headOn.ran === 0 && r.slow.ran === 0 && r.line.ran === 0 && r.dive.ran === 0,
    [r.headOn.ran, r.slow.ran, r.line.ran, r.dive.ran].join(' / ') + ' s');
  check('the wall run runs out', r.long.ran > 1.2 && r.long.ran < 1.4 && r.long.vy < -12, r.long.ran.toFixed(2) + ' s on the wall, then falling at ' + r.long.vy.toFixed(1) + ' m/s');
  check('the wall never lifts: no energy gained, no height beyond a plain throw',
    r.wall.gain < 0.5 && r.rising.gain < 0.5 && r.rising.top < r.risingFree.top + 0.1,
    'energy change at most ' + Math.max(r.wall.gain, r.rising.gain).toFixed(2) + ' J/kg, peak ' + r.rising.top.toFixed(2) + ' m on the wall vs ' + r.risingFree.top.toFixed(2) + ' m thrown');
  check('a jump kicks off the wall and buys the next run', r.kick.vOut > 8 && r.kick.vy > 0 && r.kick.off > 0.3 && r.kick.left === 1.3,
    r.kick.vOut.toFixed(1) + ' m/s off the wall, ' + r.kick.vy.toFixed(1) + ' up, ' + r.kick.left + ' s of wall in hand');
}

async function strandPicture(page, check) {
  /* the drawn line: it leaves the hand and reaches the anchor in a time set
     by distance, not by the display; it is dead straight while it carries
     weight; and when it is longer than the gap it hangs by what a rope of that
     length would. Polarity: a line switched off draws nothing at all. */
  const r = await page.evaluate(() => {
    const drawn = (i) => { let n = 0; const a = strandMesh.instanceMatrix.array; for (let k = 0; k < STRAND_SEG; k++) if (a[(i * STRAND_SEG + k) * 16 + 5] !== 0 || a[(i * STRAND_SEG + k) * 16 + 4] !== 0) n++; return n; };
    const A = { x: -46, y: 260, z: -230, pl: null };
    const arrive = (hz) => {
      __reset(hz); assist = false; player.p.set(-46, 180, -230); player.v.set(0, 0, 0); player.grounded = false; __run(2);
      fireWebAt(0, A);
      let f = 0, early = splats[0].visible; const tip0 = strandTip[0].distanceTo(player.p);
      do { __run(1); f++; if (splats[0].visible && strandTip[0].distanceTo(player.webs[0].a) > 0.5) early = true; }
      while (f < hz && strandTip[0].distanceTo(player.webs[0].a) > 0.5);
      const tip1 = f === 1 ? 0 : -1;   // one frame in, it must not be there yet
      return { t: f / hz, early, tip0, tip1, splat: splats[0].visible };
    };
    const a60 = arrive(60), a144 = arrive(144), a240 = arrive(240);
    /* hang on it until it is carrying you */
    __run(240 * 4);
    const w = player.webs[0];
    const taut = { sag: strandSag[0], tension: w.tension, segs: drawn(0), other: drawn(1) };
    /* and the arm holding it reaches for the anchor. Polarity: this read -0.94
       while the aim was computed as anchor minus anchor. */
    const arm = [[shoulderL, elbowL], [shoulderR, elbowR]].map(([sh, el]) => {
      const s = sh.getWorldPosition(new THREE.Vector3()), h = el.localToWorld(new THREE.Vector3(0, -FORE - 0.05, 0));
      return { reach: h.clone().sub(s).normalize().dot(w.a.clone().sub(s).normalize()), mine: h.distanceTo(w.hand) < 1e-6 };
    }).find(a => a.mine);
    taut.reach = arm ? arm.reach : -9;
    /* now hold still off to one side, some 10 m nearer the anchor than the line is long */
    for (let i = 0; i < 240; i++) { player.p.set(A.x + 60, A.y - 36, A.z); player.v.set(0, 0, 0); __run(1); }
    const d = w.hand.distanceTo(w.a), loose = w.len - player.p.distanceTo(w.a);
    const slack = { sag: strandSag[0], want: Math.min(Math.sqrt(0.375 * d * loose), 0.3 * d), len: w.len, d, loose };
    slack.across = Math.hypot(w.a.x - w.hand.x, w.a.z - w.hand.z) / d;   // how much of "down" is across the line
    /* the middle of the drawn line really is that far off the straight one */
    const mid = new THREE.Vector3(), m4 = new THREE.Matrix4();
    strandMesh.getMatrixAt(STRAND_SEG / 2, m4); mid.setFromMatrixPosition(m4);
    const line = new THREE.Line3(w.hand.clone(), w.a.clone()), on = new THREE.Vector3();
    line.closestPointToPoint(mid, true, on); slack.off = mid.distanceTo(on);
    releaseWeb(0); __run(2); assist = true;
    return { a60, a144, a240, taut, slack, want: shootTime(80), gone: drawn(0), splatGone: !splats[0].visible };
  });
  const ts = [r.a60, r.a144, r.a240];
  check('the strand reaches an anchor 80 m off in the same time at 60/144/240 Hz',
    /* the hand is an arm's reach up the line, so the span is a little under 80 m */
    ts.every(a => a.t >= r.want - 0.006 && a.t < r.want + 0.03 && a.tip1 === -1 && !a.early && a.splat),
    ts.map(a => a.t.toFixed(3)).join(' / ') + ' s (travel time for 80 m: ' + r.want.toFixed(3) + ' s)');
  check('the arm on the line reaches for the anchor', r.taut.reach > 0.95, 'hand is ' + r.taut.reach.toFixed(3) + ' along the direction to it');
  check('a line carrying weight is drawn straight, all of it', r.taut.tension > 1200 && r.taut.sag < 0.02 && r.taut.segs === 12 && r.taut.other === 0,
    'sag ' + r.taut.sag.toFixed(3) + ' m at ' + (r.taut.tension / 1000).toFixed(1) + ' kN, ' + r.taut.segs + ' segments');
  check('a slack line hangs like a rope of its length', r.slack.want > 3 && Math.abs(r.slack.sag - r.slack.want) < 0.02 * r.slack.want &&
    Math.abs(r.slack.off - r.slack.sag * r.slack.across) < 0.05 * r.slack.sag,
    'sag ' + r.slack.sag.toFixed(1) + ' m for ' + r.slack.loose.toFixed(1) + ' m of slack over ' + r.slack.d.toFixed(0) + ' m (rope: ' + r.slack.want.toFixed(1) + '), drawn ' + r.slack.off.toFixed(1) + ' m off the chord');
  check('a released line draws nothing', r.gone === 0 && r.splatGone, r.gone + ' segments');
}

async function sashCloth(page, check) {
  /* the sash is there to show the air going past, so that is what is
     measured: it hangs when you stand, streams dead astern in flight (in
     photo mode too), keeps its length, stays behind the back, and does the
     same thing at any frame rate. Polarity: standing and flying must differ. */
  const r = await page.evaluate(() => {
    const end = () => { const o = (SASH_N - 1) * 3, v = new THREE.Vector3(sashQ[o], sashQ[o + 1], sashQ[o + 2]); return v.normalize(); };
    const shape = () => {
      let stretch = 0, front = 0, ok = true, bend = 0;
      const tip = new THREE.Vector3(sashQ[SASH_N * 3 - 3], sashQ[SASH_N * 3 - 2], sashQ[SASH_N * 3 - 1]), chord = new THREE.Line3(new THREE.Vector3(), tip), on = new THREE.Vector3(), pt = new THREE.Vector3();
      for (let i = 1; i < SASH_N; i++) {
        bend = Math.max(bend, chord.closestPointToPoint(pt.set(sashQ[i * 3], sashQ[i * 3 + 1], sashQ[i * 3 + 2]), true, on).distanceTo(pt));
        const o = i * 3, d = Math.hypot(sashQ[o] - sashQ[o - 3], sashQ[o + 1] - sashQ[o - 2], sashQ[o + 2] - sashQ[o - 1]);
        stretch = Math.max(stretch, Math.abs(d / SASH_SEG - 1));
        front = Math.min(front, sashQ[o] * sashBack.x + sashQ[o + 1] * sashBack.y + sashQ[o + 2] * sashBack.z);
        ok = ok && isFinite(d);
      }
      return { stretch, front, ok, bend };
    };
    const fly = (hz, vx, vy, vz, secs) => {
      __reset(hz); yaw = 0; pitch = 0;
      let worst = { stretch: 0, front: 0, ok: true, bend: 0 };
      for (let i = 0; i < hz * secs; i++) {
        player.p.set(-46, 300, -230); player.v.set(vx, vy, vz); player.grounded = false; __run(1);
        if (i > hz) { const s = shape(); worst = { stretch: Math.max(worst.stretch, s.stretch), front: Math.min(worst.front, s.front), ok: worst.ok && s.ok, bend: Math.max(worst.bend, s.bend) }; }
      }
      const e = end(), v = new THREE.Vector3(vx, vy, vz).normalize();
      return { astern: -e.dot(v), e, worst };
    };
    __reset(); player.p.set(-350, 0.85, -182); player.v.set(0, 0, 0); __run(240);
    const rest = { down: -end().y, shape: shape() };
    const f60 = fly(60, 0, 0, 34, 3), f30 = fly(30, 0, 0, 34, 3), f240 = fly(240, 0, 0, 34, 3);
    const dive = fly(60, 0, -45, 8, 3), fast = fly(60, 0, -90, 110, 2);
    /* frozen for a photograph in the middle of that flight */
    fly(60, 0, 0, 34, 2); setPhoto(true); __run(120); const photo = -end().dot(new THREE.Vector3(0, 0, 1)); setPhoto(false);
    respawn(); __run(3); const jumped = shape();
    return { rest, f60, dive, fast, photo, jumped, rates: Math.min(f60.e.dot(f30.e), f60.e.dot(f240.e)), verts: sashGeo.attributes.position.count };
  });
  check('standing, the sash hangs; in flight it streams dead astern', r.rest.down > 0.8 && r.f60.astern > 0.9 && r.dive.astern > 0.9,
    'hanging ' + r.rest.down.toFixed(2) + ', astern ' + r.f60.astern.toFixed(2) + ' level and ' + r.dive.astern.toFixed(2) + ' in a dive');
  check('the sash keeps its length and stays behind the back, even at 500 km/h',
    Math.max(r.rest.shape.stretch, r.f60.worst.stretch, r.dive.worst.stretch, r.fast.worst.stretch) < 0.06 &&
    Math.min(r.rest.shape.front, r.f60.worst.front, r.fast.worst.front) > -0.01 && r.fast.worst.ok && r.fast.astern > 0.9,
    'worst stretch ' + (Math.max(r.f60.worst.stretch, r.dive.worst.stretch, r.fast.worst.stretch) * 100).toFixed(1) + '%, ' + (-Math.min(r.f60.worst.front, r.fast.worst.front) * 100).toFixed(1) + ' cm through the back');
  check('streaming, the sash ripples: it is cloth, not a stick', r.f60.worst.bend > 0.03 && r.f60.worst.bend < 0.3,
    'up to ' + (r.f60.worst.bend * 100).toFixed(1) + ' cm off straight over ' + (0.13 * 8 * 100).toFixed(0) + ' cm');
  check('the sash streams the same way at 30, 60 and 240 Hz', r.rates > 0.9, 'directions agree to ' + r.rates.toFixed(3));
  check('frozen for a photo mid-flight, the sash still streams', r.photo > 0.9, 'astern ' + r.photo.toFixed(2));
  check('a respawn does not whip the sash', r.jumped.ok && r.jumped.stretch < 0.06, 'stretch ' + (r.jumped.stretch * 100).toFixed(1) + '% three frames after');
}

async function gamepad(page, check) {
  /* a pad drives the same game: a trigger is a held web, A is one jump at any
     frame rate, the sticks walk and turn on real time, start pauses and
     resumes without asking for the pointer, and a landing is felt.
     Polarity: with no pad announced, none of it is polled. */
  const r = await page.evaluate(() => {
    const btn = () => ({ pressed: false, value: 0 });
    const fake = { connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, btn), felt: [],
      vibrationActuator: { playEffect(type, o) { fake.felt.push(o); return Promise.resolve(); } } };
    let polled = 0;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => { polled++; return [null, fake]; } });
    const press = (i, on) => { fake.buttons[i].pressed = on; fake.buttons[i].value = on ? 1 : 0; };
    __reset(); __run(30); const unannounced = polled;
    dispatchEvent(new Event('gamepadconnected')); started = true;

    /* right trigger: one line, held as long as the trigger is */
    let bites = 0; listen('attach', () => bites++);
    const tw = buildings.filter(b => b.kind === 'glass' && b.h > 90).sort((a, c) => c.h - a.h)[0];
    player.p.set(tw.x + tw.w / 2 + 40, tw.h * 0.5, tw.z); player.v.set(0, 0, 0); player.grounded = false;
    yaw = Math.PI / 2; pitch = 0.3; __run(3);                    // facing the tower, looking up its face
    const aimed = !!aimPt;
    fake.buttons[7].value = 0.6; __run(30);                      // an analogue trigger, most of the way down
    const web = { on: player.webs[1].on, held: held[1], other: player.webs[0].on, bites };
    fake.buttons[7].value = 0; __run(2); web.off = !player.webs[1].on && !held[1];

    const hop = (hz) => {
      __reset(hz); player.p.set(-350, 0.85, -182); player.v.set(0, 0, 0); __run(hz);
      press(0, true); __run(Math.ceil(hz / 10)); const vy = player.v.y; __run(Math.ceil(hz / 5));
      const glide = inp.glide; press(0, false); __run(2);
      return { vy, glide, after: inp.glide };
    };
    const j60 = hop(60), j240 = hop(240);

    const walk = (x, y) => {
      __reset(); player.p.set(-350, 0.85, -182); player.v.set(0, 0, 0); yaw = 0; pitch = 0; __run(40);
      fake.axes[0] = x; fake.axes[1] = y; __run(90); fake.axes[0] = fake.axes[1] = 0;
      return { vx: player.v.x, vz: player.v.z };
    };
    const fwd = walk(0, -1), drift = walk(0.1, -0.1);

    const turn = (hz) => { __reset(hz); yaw = 0; pitch = 0; fake.axes[2] = 1; fake.axes[3] = -0.5; __run(hz); fake.axes[2] = fake.axes[3] = 0; return { yaw, pitch }; };
    const t60 = turn(60), t240 = turn(240);

    /* a landing, felt */
    __reset(); fake.felt.length = 0;
    player.p.set(-350, 12, -182); player.v.set(0, 0, 0); player.grounded = false; player.airT = 1; __run(90);
    const thump = fake.felt.reduce((m, o) => Math.max(m, o.strongMagnitude), 0);

    /* start: pause, and everything else goes dead; start again: back, with no pointer asked for */
    __reset(); const asked = []; const realLock = renderer.domElement.requestPointerLock;
    renderer.domElement.requestPointerLock = function () { asked.push(1); };
    press(9, true); __run(2); press(9, false); __run(2); const pausedNow = paused;
    press(0, true); fake.axes[2] = 1; const y0 = yaw; __run(10); const deadJump = jumpEdge, deadLook = yaw === y0; press(0, false); fake.axes[2] = 0; __run(2);
    press(9, true); __run(2); press(9, false); __run(60);
    const resumed = !paused, lockAsked = asked.length, cursorMode = freeLook;
    renderer.domElement.requestPointerLock = realLock;
    fake.connected = false; __run(2);
    return { unannounced, aimed, web, j60, j240, fwd, drift, t60, t240, thump, pausedNow, deadJump, deadLook, resumed, lockAsked, cursorMode, want: PAD_LOOK * sens / 0.0034 };
  });
  check('gamepad: nothing is polled until a pad announces itself', r.unannounced === 0, r.unannounced + ' polls in 30 frames');
  check('gamepad: a trigger is one line, held while the trigger is', r.aimed && r.web.on && r.web.held && !r.web.other && r.web.bites === 1 && r.web.off, JSON.stringify(r.web));
  check('gamepad: A is one jump at 60 and 240 Hz, and held in the air it glides',
    r.j60.vy > 12 && r.j60.vy < 16 && r.j240.vy > 12 && r.j240.vy < 16 && r.j60.glide && r.j240.glide && !r.j60.after,
    'vy ' + r.j60.vy.toFixed(1) + ' / ' + r.j240.vy.toFixed(1) + ' m/s after 0.1 s');
  check('gamepad: the left stick walks, and a stick at rest in its dead zone does not', r.fwd.vz > 5 && Math.abs(r.fwd.vx) < 0.5 && Math.hypot(r.drift.vx, r.drift.vz) < 0.05,
    'forward ' + r.fwd.vz.toFixed(1) + ' m/s, drift ' + Math.hypot(r.drift.vx, r.drift.vz).toFixed(3));
  check('gamepad: the right stick turns on real time, not frames', Math.abs(r.t60.yaw - r.want) < 0.02 && Math.abs(r.t60.yaw - r.t240.yaw) < 0.02 && r.t60.pitch > 0.3 && Math.abs(r.t60.pitch - r.t240.pitch) < 0.02,
    'a second at full stick: ' + r.t60.yaw.toFixed(3) + ' rad at 60 Hz, ' + r.t240.yaw.toFixed(3) + ' at 240 Hz');
  check('gamepad: a landing is felt', r.thump > 0.4, 'strong motor at ' + r.thump.toFixed(2) + ' for a 12 m drop');
  check('gamepad: start pauses, a paused pad does nothing, start resumes without asking for the pointer',
    r.pausedNow && !r.deadJump && r.deadLook && r.resumed && r.lockAsked === 0 && !r.cursorMode,
    JSON.stringify({ paused: r.pausedNow, resumed: r.resumed, lockAsked: r.lockAsked, cursorMode: r.cursorMode }));
}

async function quietHud(page, check) {
  /* the readouts leave after four seconds on the move and come back when you
     stop. Polarity: three seconds in they are still there. A roll across a
     roof is not stopping; riding an aircraft is. */
  const r = await page.evaluate(() => {
    const st = document.createElement('style'); st.textContent = '#band,#tbar,#help,#mapwrap{transition:none !important}'; document.head.appendChild(st);
    const op = (id) => +getComputedStyle(document.getElementById(id)).opacity;
    const quiet = () => document.body.classList.contains('quiet');
    const hold = (secs, x, vz, z) => { for (let i = 0; i < 60 * secs; i++) { player.p.set(x, 300, z || -230); player.v.set(0, 0, vz); player.grounded = false; __run(1); } };
    __reset(); player.p.set(-350, 0.85, -182); player.v.set(0, 0, 0); __run(120);
    const out = { start: quiet(), band0: op('band') };
    hold(3, -46, 30); out.at3 = quiet();
    hold(1.5, -46, 30); out.at45 = quiet(); out.band = op('band'); out.tbar = op('tbar'); out.map = op('mapwrap');
    /* a new district, while the band that names it is away */
    toastEl.textContent = ''; hold(0.3, 300, 30, 150); out.zone = elZone.textContent; out.said = toastEl.textContent;
    document.body.classList.add('run'); out.mapRun = op('mapwrap'); document.body.classList.remove('run');
    /* down onto the street at speed, roll, and off again: never stopped */
    player.p.set(-350, 2.2, -182); player.v.set(26, -4, 0); player.grounded = false; player.airT = 1;
    __run(20); jumpEdge = true; __run(20); out.afterRoll = quiet();
    tapKey('KeyH'); __run(2); out.afterH = quiet(); tapKey('KeyH');
    hold(4.5, -46, 30); out.again = quiet();
    player.p.set(-350, 0.85, -182); player.v.set(0, 0, 0); __run(30); out.justStopped = quiet(); __run(40); out.stopped = quiet(); out.bandBack = op('band');
    hold(4.5, -46, 30); const pl = planes[0];
    player.p.set(pl.p.x, pl.p.y + 3, pl.p.z); player.v.copy(pl.v); __run(2); mountEdge = true; __run(60); out.riding = !!player.riding; out.aboard = quiet();
    player.riding = null; st.remove();
    return out;
  });
  check('the readouts are there at a standstill and three seconds into a flight', !r.start && r.band0 === 1 && !r.at3);
  check('after four seconds on the move they are gone, and the map only dims', r.at45 && r.band === 0 && r.tbar === 0 && r.map > 0.2 && r.map < 0.6,
    'band ' + r.band + ', map ' + r.map);
  check('a district entered while they are away announces itself', r.zone.length > 3 && r.said === r.zone, '"' + r.said + '"');
  check('in a ring run the map stays', r.mapRun === 1, 'opacity ' + r.mapRun);
  check('a roll across the ground is not a stop; H, a real stop and boarding an aircraft are',
    r.afterRoll && !r.afterH && r.again && r.justStopped && !r.stopped && r.bandBack === 1 && r.riding && !r.aboard,
    JSON.stringify({ afterRoll: r.afterRoll, afterH: r.afterH, again: r.again, stopped: r.stopped, aboard: r.aboard }));
}

const SECTIONS = [inputEdges, webEnergy, rigTiming, openGround, vegetation, hullPinning, coyoteTime, pausing, trafficMatrices, ringRuns, lineBite,
  motionEvents, landing, wallRun, strandPicture, sashCloth, gamepad, quietHud];

module.exports = async function fixedStep({ newPage, BASE, check }) {
  const { ctx, page } = await newPage({});
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('load').classList.contains('gone'));
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
    renderer.render = () => {};
    window.__dt = 1 / 60; clock.getDelta = () => window.__dt;
    window.__run = (n) => { for (let i = 0; i < n; i++) frame(); };
    window.__reset = (hz) => {
      window.__dt = 1 / (hz || 60);
      player.riding = null;
      held[0] = held[1] = false; releaseWeb(0); releaseWeb(1);
      for (const k of Object.keys(keys)) keys[k] = false;
    };
  });
  await page.waitForTimeout(150);   // let the one already-queued rAF callback drain
  /* ONLY=motionEvents,webEnergy runs just those; the sections are independent */
  const only = (process.env.ONLY || '').split(',').filter(Boolean);
  for (const section of SECTIONS) {
    if (only.length && !only.includes(section.name)) continue;
    await page.evaluate(() => __reset());
    await section(page, check);
  }
  check('fixed-step console clean', page.errors.length === 0, page.errors.join(' | ') || 'no errors');
  await ctx.close();
};

/* run directly for this pass alone:  node test/fixed-step.js */
if (require.main === module) {
  (async () => {
    const suite = await require('./harness').start();
    await module.exports(suite);
    await suite.finish();
  })().catch(e => { console.error('FIXED-STEP CRASHED:', e); process.exit(1); });
}

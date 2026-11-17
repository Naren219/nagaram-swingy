# NAGARAM

A browser-based third-person web-swinging sandbox set on a Coromandel-coast-inspired city — temple ward, old bazaar, tech park, river, and the Bay of Bengal. Everything is procedural: the city, the facades, the character, the audio. Nothing is asked of you: there are no levels or points, and the product is the feel of moving through the city. For when you want something to aim that at, there are optional [ring runs](#ring-runs) against the clock.

**Ships as a static page with no runtime dependencies** — no assets, no bundler, no CDN. `index.html` plus a vendored copy of Three.js; open it and it runs, from a web server or straight off disk. Source lives split under `src/` and is concatenated back into that file by a dependency-free Node script (see [Development](#development)).

## Play

Open `index.html` in a browser (or serve the repo root with any static server) and click to start.

| Input | Action |
|---|---|
| mouse / arrows | look |
| `[` `]` | look sensitivity |
| L / R click | fire left / right web (hold — it retries until something connects) |
| W / S | winch in / pay out line |
| A / D | steer + bank |
| Space | jump · hold in air to glide |
| Shift | tuck & dive |
| Q | zip to anchor |
| E | cling to wall · board an aircraft |
| T / F / M | skip time of day · swing assist · mute |
| G / N / X | ring run: start or restart · next course · leave |
| C | photo mode (HUD hidden, player frozen, city alive) |
| P / R / H | shadows · respawn · hide help |
| Esc | pause |

**Gamepad** (any standard-mapped pad; rumble where the pad has it): the triggers are the two webs, the left stick moves and winches, the right stick looks. **A** jump, hold to glide · **B** or **RB** dive · **LB** zip · **X** cling, board · **Y** photo mode · **start** pause · **back** ring run. D-pad: up time of day, right next course, down leave run, left respawn.

**Touch devices** (landscape only — the game asks you to rotate, and locks landscape where the platform allows) split the controls by hand role. The right thumb owns the two held primaries: **web** and **jump/glide**, and both double as aim surfaces — keep the button held and drag the same thumb to steer. The left hand owns movement plus everything you need *during* a swing, while the right thumb is pinned on the web: a floating stick that appears wherever the thumb lands (steer + winch), with **zip** and **dive** just above it. A **board aircraft** button appears whenever a plane is in reach, and **run** in the top-left corner starts a ring run (**next** and **end** appear beside it while one is on). Mobile also renders at a reduced pixel ratio with a smaller shadow map to hold frame rate.

### Ring runs

Press **G** and you are put on the approach to a course of twelve rings through the city. The clock starts as you pass the first ring and stops at the last; a shaft of light, the minimap and an arrow at the screen edge point to the next one. Your best time on each course is kept in the browser, along with a ghost of the flight that set it, which flies the course with you next time.

A course is nothing but a seed. **Today's** course comes from the date (UTC), so it is the same for everyone and new every day; three fixed courses are always there; and `?run=1234` on the address builds the course for any seed, so one can be shared as a link. Rings are only placed in open air, below a roof tall enough to swing from, and never more than 30 m above the ring before.

Other things to know:

- Come down on a roof or the street faster than you can run and you roll instead of stopping: for a third of a second the ground barely slows you. Jump out of the roll and the speed goes with you.
- Meet a wall while travelling along it at speed and you run it: the wall carries most of your weight for up to 1.3 s. Jump to kick off it. No button, and not while on a line or in a dive. It only slows a descent — a wall will not lift you.
- The line is a rope: it travels from the hand to the anchor, and hangs in a curve whenever it is longer than the gap it spans.
- The sash off the left shoulder streams along the air going past, so it shows your speed, a crosswind and a thermal.
- The readouts fade after four seconds on the move and return when you stop, board an aircraft or press H. A district you enter while they are away is named on screen.
- Aircraft crossing the city are valid web anchors — latch one and it tows you. If a web is latched to a hull, E climbs the line aboard from any distance.
- Release a swing while climbing hard and the body throws itself into a somersault — a violent release doubles it. No button; it's earned by the swing.
- The gopurams are gateways, not scenery: fly the passage through any of the four, and the prakaram walls have low arches worth threading at speed.
- Columns of rising air over the marina, the tech park and the maidan are marked by drifting chaff in a haze cone. Glide into one and you climb; fall through one and you only fall slower.
- The sea and river are volumes. Dive in and you plunge, slow, and surface; graze the water at speed and you skim, trailing rings.
- Time of day flows continuously through dawn, noon, evening, and a long night; T skips ahead to the next.
- A slow monsoon breeze wanders over the city. Drag and lift run on airspeed, not ground speed, so gliding up-wind and down-wind feel different.
- Sensitivity, assist, mute, shadows, and the time of day persist across visits (localStorage).

## Deploy to Cloudflare Pages

The repo is laid out for a zero-config deploy: the site is a static `index.html` at the repo root.

**Via the dashboard (Git integration):**

1. In the Cloudflare dashboard, go to **Workers & Pages → Create → Pages → Connect to Git**.
2. Select this repository and the production branch.
3. Leave the build settings at their defaults:
   - **Framework preset:** None
   - **Build command:** *(empty)*
   - **Build output directory:** `/`
4. Click **Save and Deploy**.

Every push to the production branch redeploys automatically; other branches get preview URLs.

**Via Wrangler (direct upload):**

```sh
npx wrangler pages deploy . --project-name nagaram
```

Run direct uploads from a clean checkout — the git integration only ever sees committed files, but a direct upload takes the working directory as-is, including a local `node_modules/` if you have installed the dev dependency.

Notes:

- Three.js r128 is vendored at `vendor/three.min.js`, so there is no third-party runtime dependency and no CDN outage can take the game down.
- `_headers` sets a few conservative security headers; Pages picks it up automatically.
- Pointer lock is requested on click and falls back to cursor-rate steering when the browser refuses it (e.g. inside embedded frames), so the game stays playable on preview URLs and embeds.

## Development

**Edit `src/`, not `index.html`.** The deployed page is a build artifact: `tools/build.js` concatenates the parts in `src/` into the single self-contained `index.html` that is committed and served.

```sh
npm run build     # regenerate index.html from src/
npm run check     # fail if index.html is stale (useful in CI / pre-commit)
npm test          # check the build is current, then run the smoke suite
```

The build itself is one Node script doing an ordered concatenation — no bundler, nothing to install. `index.html` stays committed so Cloudflare Pages still needs zero build configuration.

### Testing

`npm test` drives the real built page in headless Chromium and asserts against measurements — 153 checks across a desktop pass, a landscape-touch pass, a portrait pass, and a fixed-step pass, covering physics stability, the lighting blend, photo mode, settings round-tripping through a reload, aircraft boarding, gopuram passability, thermal climb rates, water entry and skimming, the somersault's rate profile, and every touch control.

The fixed-step pass takes the loop away from `requestAnimationFrame` and the GPU and runs frames synchronously on a chosen `dt`. That is how to test anything refresh-rate dependent (it simulates a 240 Hz display exactly) or anything about energy, and it needs no wall-clock waits: input edges at 60/144/240 Hz, web-tapping as an energy source, rig pose speed against frame rate, the open ground at the maidan and the tank, the vegetation triangle budget, hull pinning, coyote time, what a paused game draws, ring runs flown on rails (the clock must read length ÷ speed at any frame rate), the landing roll and the wall-run (neither may add speed, height or energy), the events sound hangs on, the drawn line's travel and sag, the sash, a mocked gamepad, and the fading readouts.

The suite is three files under `test/`. `smoke.js` is the entry point and holds the three passes that drive the page in real time. `fixed-step.js` holds the fixed-step pass as one function per subject, listed in `SECTIONS`; each starts from `__reset()`, so a section does not depend on what ran before it, and a new subject is a new function added to that list. `harness.js` is the server, the browser and the tally of checks.

The fixed-step pass runs on its own, and `ONLY` picks sections by name — the quick loop while working on one subject:

```sh
node test/fixed-step.js
ONLY=landing,wallRun node test/fixed-step.js
```

```sh
npm install                       # one devDependency: playwright
npx playwright install chromium   # or set CHROMIUM_PATH to an existing binary
npm test
```

**Write a measurement before claiming a fix.** Nearly every significant bug in this project has been invisible to reading the code and obvious to a measurement — a camera basis dotted -1.000 against its true axis, 5% crosshair fidelity, a flip spinning at 514°/s with 73% frame-to-frame jitter. Check a new metric's polarity against a known-good case before trusting it; a test that is wrong in the right direction hides real results.

Headless mobile emulation throttles `requestAnimationFrame` heavily, so wait on conditions (`waitForFunction`) rather than wall-clock time.

### Layout of `src/`

The parts share a single runtime scope, exactly as they did when this was one file, so **order is semantic**. The manifest in `tools/build.js` is the source of truth; the numeric filename prefixes mirror it.

| Part | Contents |
|---|---|
| `head.html` | markup, CSS, HUD, touch controls, opening `<script>` |
| `00-core.js` | utils, renderer, sky shader, lighting, time-of-day presets |
| `10-world.js` | district function, city generation, landmark placement |
| `20-geometry.js` | `mergeGeos`, `taper`, matrix helpers |
| `30-facade.js` | procedural facade shader injected into Lambert/Phong |
| `40-buildings.js` | instanced building batches, rooftop kit |
| `45-ground.js` | ground canvas painting, distant hills |
| `50-water.js` | sea and river shader |
| `55-daycycle.js` | continuous time-of-day blending |
| `60-monuments.js` | gopurams, vimana, mandapam, bridges, lighthouse, aim marker |
| `65-broadphase.js` | spatial hash over solid AABBs |
| `70-vegetation.js` | palm and tree scattering, batched by ground cell for culling |
| `75-traffic.js` | vehicles, boats, kites, aircraft |
| `80-physics.js` | XPBD solver, contacts, landing roll, wall-run, water volumes, thermals, anchor search |
| `82-thermal-motes.js` | rising chaff and haze marking each thermal |
| `84-water-fx.js` | splash and skim rings |
| `85-rig.js` | character rig geometry, procedural posing, somersault and landing roll, the drawn line |
| `86-sash.js` | the sash: a cloth chain simulated in the player's frame |
| `90-camera.js` | boom, collision, orientation |
| `92-input.js` | keyboard, pointer lock, touch, gamepad, photo mode, settings |
| `94-audio.js` | synthesised ambience, the sound of the line and the body, one-shots |
| `96-hud.js` | minimap, readouts and when they fade |
| `97-runs.js` | ring runs: course generation from a seed, clock, saved bests, ghost |
| `99-loop.js` | main loop |
| `tail.html` | closing tags |

Built output also depends on `vendor/three.min.js` (Three.js r128, MIT — extracted verbatim from npm `three@0.128.0`, license at `vendor/three.LICENSE`). Upgrading past r128 is a real migration, not a drop-in: the facade shader injects into Lambert/Phong chunks, and colour-management defaults changed in later revisions.

### Things that must not be broken

- **Physics is position-based dynamics at a fixed 120 Hz.** The web is a hard distance constraint, not a spring, and velocity is *derived from the position delta* after the constraint solve — never integrated forward. Do not convert it to a conventional integrator; energy conservation, taut-rope behavior, and aircraft towing all depend on it.
- **Render interpolation is load-bearing.** The camera, rig, and shadow frustum read `pRender` (interpolated between substeps), never `player.p`. Removing it causes visible judder on any non-60 Hz display.
- `updatePlanes(dt)` must run **before** the physics loop, or riders and latched anchors lag the hull by a frame. `pinToPlanes()` then re-pins them **after** it, every frame: the hulls move per frame and the player per substep, so above 120 Hz a frame with no substep would draw them 14 cm off the airframe.
- **Per-frame code allocates nothing it can avoid.** `updateTraffic` writes instance matrices directly, and anything that composes a matrix per frame borrows the one `scratch` set in `20-geometry.js`. Do not add private scratch objects: all of `src/` is one global scope and they collide by name.
- **A paused game draws nothing in the loop.** `setPaused(true)` and a resize each put up one frame themselves. Anything else that changes the picture while paused must draw it too.
- **Input edges (jump, board) are cleared by the physics step that consumes them**, not by the frame that read them. Above 120 Hz some frames run no substep at all, and clearing per frame drops the press.
- **The release pop is scaled by time on the line** (`w.age`). Granted unconditionally, tapping the web button is a free energy source that out-climbs gravity.
- The maidan and the temple tank are reserved by `onOpenGround()`. Anything new that places things in the world (buildings, lanes, props) must ask it.
- **Vegetation is batched per ground cell and frustum-culled** (`vegBatches`). r128 turns culling off on every `InstancedMesh`; one un-culled, shadow-casting batch of plants was 85% of the frame. A batch's instances must stay inside its geometry's bounding sphere.
- **Physics announces, it does not act.** `80-physics.js` calls `emit('splash', …)` and the HUD, rig, audio and effects `listen()`; it must not reach into the DOM, the rig or the audio itself. An event with no listener is dead weight: add one when something needs it.
- **The roll and the wall-run only decline to take; they never give.** During a roll the legs steer but cannot push while you are faster than a sprint, and the wall carries weight only on the way down. Either rule relaxed is a free source of speed or height. Both have checks that fail if energy rises.
- **`player.touch`, not `player.contact`, says whether anything was touched this substep.** `contact` is cleared by every solver pass that finds you already pushed clear, so on flat ground it ends most steps false. Landings and wall-runs are read from `touch`.
- **The drawn line is a picture.** `drawStrand()` animates the strand's travel and its sag from the solver's `len`, `age` and `tension`; nothing in physics reads it back.
- **The sash is simulated as offsets from its pin, against air velocity minus the player's.** Simulated in world space it whips on every respawn and goes limp in photo mode.
- **A course never touches the world's random stream.** `buildCourse()` has its own generator, so the city is identical whether or not a run was ever started.
- **A saved best belongs to the rings it was flown through.** Saves carry `courseSig()`, a fingerprint of the ring positions, and `bestFor()` is the only place a save is read. Change the generator, its constants or the city and old times quietly stop counting, which is the point.
- **Everything a run shows follows from `run.state`, in `syncRunView()`.** Do not show, hide or label run UI anywhere else.
- The character is an original design (navy/gold/teal). It is **not** Spider-Man and must not become him.

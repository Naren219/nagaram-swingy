# NAGARAM

A browser-based third-person web-swinging sandbox set on a Coromandel-coast-inspired city — temple ward, old bazaar, tech park, river, and the Bay of Bengal. Everything is procedural: the city, the facades, the character, the audio. There are no levels, points, or objectives; the whole product is the feel of moving through the city.

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
| C | photo mode (HUD hidden, player frozen, city alive) |
| P / R / H | shadows · respawn · hide help |
| Esc | pause |

**Touch devices** (landscape only — the game asks you to rotate, and locks landscape where the platform allows) split the controls by hand role. The right thumb owns the two held primaries: **web** and **jump/glide**, and both double as aim surfaces — keep the button held and drag the same thumb to steer. The left hand owns movement plus everything you need *during* a swing, while the right thumb is pinned on the web: a floating stick that appears wherever the thumb lands (steer + winch), with **zip** and **dive** just above it. A **board aircraft** button appears whenever a plane is in reach. Mobile also renders at a reduced pixel ratio with a smaller shadow map to hold frame rate.

Other things to know:

- Aircraft crossing the city are valid web anchors — latch one and it tows you. If a web is latched to a hull, E climbs the line aboard from any distance.
- Release a swing while climbing hard and the body throws itself into a somersault — a violent release doubles it. No button; it's earned by the swing.
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

`npm test` drives the real built page in headless Chromium and asserts against measurements — 48 checks across a desktop pass, a landscape-touch pass, and a portrait pass, covering physics stability, the lighting blend, photo mode, settings round-tripping through a reload, aircraft boarding, the somersault's rate profile, and every touch control.

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
| `70-vegetation.js` | palm and tree scattering |
| `75-traffic.js` | vehicles, boats, kites, aircraft |
| `80-physics.js` | XPBD solver, contacts, anchor search, web firing |
| `85-rig.js` | character rig geometry, procedural posing, somersault |
| `90-camera.js` | boom, collision, orientation |
| `92-input.js` | keyboard, pointer lock, touch, photo mode, settings |
| `94-audio.js` | synthesised ambience and one-shots |
| `96-hud.js` | minimap, readouts |
| `99-loop.js` | main loop |
| `tail.html` | closing tags |

Built output also depends on `vendor/three.min.js` (Three.js r128, MIT — extracted verbatim from npm `three@0.128.0`, license at `vendor/three.LICENSE`). Upgrading past r128 is a real migration, not a drop-in: the facade shader injects into Lambert/Phong chunks, and colour-management defaults changed in later revisions.

### Things that must not be broken

- **Physics is position-based dynamics at a fixed 120 Hz.** The web is a hard distance constraint, not a spring, and velocity is *derived from the position delta* after the constraint solve — never integrated forward. Do not convert it to a conventional integrator; energy conservation, taut-rope behavior, and aircraft towing all depend on it.
- **Render interpolation is load-bearing.** The camera, rig, and shadow frustum read `pRender` (interpolated between substeps), never `player.p`. Removing it causes visible judder on any non-60 Hz display.
- `updatePlanes(dt)` must run **before** the physics loop, or riders and latched anchors lag the hull by a frame.
- The character is an original design (navy/gold/teal). It is **not** Spider-Man and must not become him.

# NAGARAM

A browser-based third-person web-swinging sandbox set on a Coromandel-coast-inspired city — temple ward, old bazaar, tech park, river, and the Bay of Bengal. Everything is procedural: the city, the facades, the character, the audio. There are no levels, points, or objectives; the whole product is the feel of moving through the city.

**One self-contained HTML file. No build step, no assets, no dependencies beyond a Three.js CDN tag.** Open `index.html` and it runs.

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
| T / F / M | time of day · swing assist · mute |
| P / R / H | shadows · respawn · hide help |
| Esc | pause |

Aircraft crossing the city are valid web anchors — latch one and it tows you.

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

Notes:

- Three.js r128 is loaded from cdnjs, which is Cloudflare's own CDN — no extra config needed.
- `_headers` sets a few conservative security headers; Pages picks it up automatically.
- Pointer lock is requested on click and falls back to cursor-rate steering when the browser refuses it (e.g. inside embedded frames), so the game stays playable on preview URLs and embeds.

## Development

The technical handoff notes (world layout, physics invariants, coordinate conventions, and a ranked list of next features) live with the project owner. The short version of what matters:

- **Physics is position-based dynamics at a fixed 120 Hz.** The web is a hard distance constraint, not a spring, and velocity is *derived from the position delta* after the constraint solve — never integrated forward. Do not convert it to a conventional integrator; energy conservation, taut-rope behavior, and aircraft towing all depend on it.
- **Render interpolation is load-bearing.** The camera, rig, and shadow frustum read `pRender` (interpolated between substeps), never `player.p`. Removing it causes visible judder on any non-60 Hz display.
- `updatePlanes(dt)` must run **before** the physics loop, or riders and latched anchors lag the hull by a frame.
- The character is an original design (navy/gold/teal). It is **not** Spider-Man and must not become him.

# Moonshot — State File

**File:** `moonshot_state_20260805a.md`
**Date:** 2026-08-05
**Produced by:** Claude Code — a long unbroken `dev` stretch since file `c` (v1.1.9 → v1.2.4: slider/
theme/tab/pane redesign, an angle-of-inclination control added then reverted as conceptually unsound,
3D buildings + terrain + a 3D virtual-point pillar + 2D/3D view toggle, a full switch to Mapbox's Standard
style with a label-toggle legend and the newer Interactions API, and finally an opt-in "set height
automatically" toggle + 2D/3D sync fix), then an owner-requested merge of `dev` → `main`, promoting all of
it to production in one shot.
**Supersedes:** `moonshot_state_20260802c.md`.

> **This is the single handoff doc.** `MOONSHOT_BRIEF.md` is the original product spec and stays put as
> a permanent reference (not retired). Read §1 for current status, §5 for how the project works. When you
> finish a sizeable task, write the next state file (protocol in §6) — don't edit this one; carry §5
> forward into it.

---

## 1. Current status

**`main`/production and `dev` are back in sync, both at v1.2.4.** This file's owner explicitly asked to
merge `dev` → `main` right after v1.2.4 shipped, then asked for this state update — same pattern as file
`c`'s merge. The merge (`git merge dev --no-edit` on `main`) was clean, no conflicts. `CNAME` survived
intact (confirmed via `cat CNAME` post-merge, no restore commit needed this time — see file `c` §3 for why
that varies merge-to-merge depending on the merge-base, not a fixed rule). Pushed to `origin/main`
(`2d317bc`); GitHub Pages rebuild not independently polled this round, but the mechanism is unchanged from
every previous merge.
- Standing instruction unchanged: push to `dev` immediately after every commit, no confirmation needed;
  merging to `main` still needs the owner's go-ahead each time (`[[feedback_dev_branch_autopush]]`
  memory) — this session's merge was requested explicitly.
- **One owner-facing item never actually delivered, worth surfacing on next contact**: the owner asked
  (message preceding v1.2.3) whether a slider could control "building render distance." Researched and
  confirmed Mapbox Standard's public config API has no such property — only `show3dBuildings`/
  `show3dObjects`/`show3dFacades` (visibility toggles, no LOD/distance control exist at all). This
  conclusion was reached but the session broke (ran out of credits) before it was communicated back to the
  owner, and the resumed session went straight into the next request without circling back. **Say this
  explicitly next time there's a natural opening** — don't let it silently stay unresolved.
- The `experiment/standard-style` branch (an earlier, rougher, pre-token-fix attempt at the Standard-style
  swap) is still pushed to GitHub, untouched — not merged, not deleted. It predates the real v1.2.3 work
  and has no unique content worth recovering; safe to delete whenever the owner wants, not yet asked.

---

## 2. What changed since `c` (v1.1.9 → v1.2.4)

### v1.1.9 — range sliders, favourites list redesign
- Target height and max distance became range sliders paired with their existing editable number inputs
  (mirror each other live). Height slider range depends on the current unit (0–2000 ft / 0–600 m,
  independently chosen). Both recompute the path live while dragging, rAF-throttled (`js/main.js
  rafThrottle`) so rapid drag events coalesce to at most once per frame.
- Favourites rows lost their individual bordered-box look — full-width, plain until hovered, edit/remove
  icons only reveal on hover.

### v1.1.10 — number-line slider styling, dark blue theme, narrower favourites bar
- Removed native spinner arrows on the number inputs (redundant with the sliders).
- Sliders restyled as a number line: thin track, tick marks via `repeating-linear-gradient` (native
  `<datalist>` ticks aren't reliably stylable), thin vertical-bar thumb instead of a circle.
- **Color theme swapped yellow (`#ffcc66`) → dark blue (`--accent: #2d4a9e`) everywhere** — CSS custom
  property, marker/path-line colors, favicon. Also flipped dark-text-on-accent pairings to white where
  dark-on-dark-blue would've been unreadable.
- Favourites sidebar narrowed to 60% of its previous width.
- **Cache-busting convention established** (separate commit, same day): Cloudflare Pages 4h edge caching
  meant the owner saw stale styling despite the origin already being correct. Added `?v=1.1.10` to every
  local `<link>`/`<script>` reference *and* every relative ES-module import specifier — this is now a
  strict per-release discipline (`[[project_moonshot_cache_busting]]` memory), followed on every version
  since.

### v1.1.11 — top-level tab system
New "Moon Alignment" / "POV Arc" tabs in the header; everything built so far moved under
`#view-alignment`, `#view-pov-arc` added as an empty placeholder. Mapbox's canvas doesn't notice its
container returning from `display:none`, so switching back to Alignment calls `map.resize()`.

### v1.1.12 — tab restyle, font-weight bugfix
- Tabs moved next to the "Moonshot" brand, restyled as flat bar segments (no fill/border, bottom-border
  underline when active) instead of floating pill buttons.
- **Real bug found and fixed**: 7 CSS rules used `font-weight: 600` but Moonshot only self-hosts DM Sans
  weights 400/500 — changed all to 500.

### v1.1.13 — resizable panes, underline-style selection, cleanup
- Sidebar and panel panes became drag-resizable (thin accent-line handle, same visual language as the tab
  underline). Sidebar starting width bumped 126px → 151px.
- Time-mode buttons (Now/Next Full Moon/Custom Date) restyled to match the tabs (flat, underline-on-active).
- Favourites rows gained a thin vertical accent bar on the active entry (`state.activeFavouriteId`-driven,
  inset box-shadow so it doesn't shift layout).
- Removed a redundant `<hr>` in the moon panel (double-line artifact against the last fact row's own border).

### v1.1.14 → v1.1.16 — angle-of-inclination control: added, then reverted
- v1.1.14 added an "Angle" slider under target height, three-way live-linked to height and max distance
  (`angle = atan(height / distance)`, editable in any direction with clamping/snap-back at the edges).
- **v1.1.16 fully reverted it** — the owner identified the real conceptual flaw: the angle from observer to
  the virtual point varies continuously along the path (it *is* the moon's altitude at whatever point
  you're looking at, by construction of the alignment algorithm). Max distance is a search cutoff, not a
  fixed "observation distance," so there's no single angle to tie a control to. All associated UI/state/
  config (`ANGLE_RANGE`, `metersToKm`) removed; control bar back to a single height row / 64px height.
  **If this idea resurfaces, don't just re-add v1.1.14's UI — the underlying premise was wrong, not just
  the execution.**

### v1.1.15 — 3D virtual-point pillar, 2D/3D toggle, scale control
- The virtual target point now renders as a thin vertical `fill-extrusion` pillar (ground → target height)
  at the landmark, visible once the map tilts into 3D. Chose `fill-extrusion` over Marker (no altitude
  support) or the newer line-z-offset API (still experimental, needs a terrain DEM this didn't yet have).
- New bottom-right 2D/3D `ViewModeControl`: 2D resets pitch+bearing to 0, 3D eases to a fixed tilt
  (pitch 60, bearing -20).
- Added Mapbox's built-in `ScaleControl` (bottom-left, metric).

### v1.2.1 — real 3D buildings, terrain, click-to-read building height
- Real building extrusions (`fill-extrusion` on the base style's own `composite`/`building` source-layer —
  no extra tile requests), colored `#5a6472`, inserted below the first label layer, zoom-interpolated flat
  at 14 → full height by 14.05 to avoid pop-in.
- Ground terrain via `mapbox-terrain-dem-v1` raster-DEM, exaggeration 1.0.
- Clicking a building read its real height (from the same fill-extrusion data via `queryRenderedFeatures`)
  and auto-filled the target-height slider — this specific behavior is the one v1.2.4 later made opt-in
  (see below).

### v1.2.2 — buildings minzoom 14 → 13
13 is the practical floor: Mapbox's building source-layer has no data before zoom 13 (large/prominent
buildings only; full coverage by 16) — not an arbitrary tweak.

### v1.2.3 — switch to Mapbox Standard style
- `MAPBOX_STYLE` → `mapbox://styles/mapbox/standard` (natively maintained; classic styles like `dark-v11`
  are not). Bumped Mapbox GL JS CDN 3.27.0 → 3.28.0 (required for the Interactions API below).
- New top-left `LegendControl` with toggle switches for POI/business labels and street-name labels, wired
  to `map.setConfigProperty('basemap', 'showPointOfInterestLabels' | 'showRoadLabels', bool)`.
- `lightPreset` set to `'night'` so Standard's basemap matches the app's dark theme (Standard defaults to a
  bright/light look otherwise — this was the owner's core complaint that triggered the switch).
- Removed the `+`/`-` zoom control (owner exclusively uses pinch/scroll-wheel).
- Building-click height reading ported from `queryRenderedFeatures` (doesn't reach Standard's natively-
  rendered layers) to the newer **Interactions/Featureset API**
  (`map.addInteraction(id, {type, target:{featuresetId:'buildings', importId:'basemap'}, handler})`),
  coordinated with the plain click handler via a `setTimeout`-deferred read (the two Mapbox event systems'
  relative firing order isn't guaranteed, so this avoids assuming one fires before the other).
- **Requires a Mapbox token URL restriction covering the Cloudflare Pages preview domain**
  (`moonshot-et1.pages.dev`, which auto-covers every preview subdomain — Mapbox has no wildcard support at
  all, but does auto-authorize subdomains of any listed bare domain). Without it, Standard's style JSON
  still loads (200) but tiles/features 403 silently — this was the actual root cause of an earlier "blank
  map, wrong colors" report, diagnosed from the owner's own DevTools Network tab screenshots, not from a
  worker-context Referer theory that turned out to be a dead end.

### v1.2.4 — opt-in auto-height toggle, 500ft default, 2D/3D sync fix
- **v1.2.1's building-click auto-fill is now gated behind a new legend toggle, "Set height automatically"
  — off by default.** With it off, clicking a building no longer touches the target-height value; height
  only changes via picking a favourite or a manual edit. `DEFAULT_TARGET_HEIGHT_FT` changed from 1900 (a
  CN-Tower-specific value) to a plain 500ft starting point. State lives as a module-level
  `autoHeightEnabled` flag in `js/map.js`, read by `onMapClick` to decide whether to report a non-null
  `buildingHeightM` back to the caller at all (rather than main.js filtering it) — keeps the gating and the
  data source it gates in the same file.
- **`ViewModeControl`'s 2D/3D buttons now stay in sync when the map is tilted manually** (right-click drag,
  two-finger touch) — not just when the buttons themselves are clicked. Root cause: the buttons only ever
  called `_setActive()` from their own click handlers, so manual gestures never touched the UI. Fix: a
  single `map.on('pitch', () => this._setActive(map.getPitch() > 0 ? '3d' : '2d'))` listener is now the
  only thing that sets active state — including for the buttons' own clicks, since `easeTo()` fires `pitch`
  events during its animation too. Single source of truth instead of two paths that could drift.
- Verified this round (browser pane, static server): footer/version + import-specifier consistency across
  all 6 changed files, `node --check` on every edited `.js` file, DOM-level confirmation via
  `javascript_tool` that the three legend checkboxes have the correct default checked states
  (`showPointOfInterestLabels: true`, `showRoadLabels: true`, `autoHeight: false`) and that the target-
  height number input starts at `500`. **Could not visually confirm the pitch-sync fix or WebGL rendering
  in general** — this sandboxed preview pane doesn't reliably composite Mapbox's canvas frames (long-
  standing, carried-forward limitation, see §3) — relied on source-level review of the single-listener
  wiring instead. Owner should confirm live: dragging/tilting into 3D without touching the 2D/3D buttons
  should now flip the 3D button active.

---

## 3. Open items / known issues

- **"Building render distance" is not deliverable via Mapbox Standard's public API** — see §1, still needs
  to be said to the owner directly (was researched and concluded, never actually communicated).
- `experiment/standard-style` branch — stale, superseded, safe to delete, not yet asked about (§1).
- **Sandboxed dev-pane WebGL/compositing limitation — still the single most recurring friction point this
  project hits.** Confirmed again this round (couldn't screenshot or visually verify the pitch-sync fix).
  Established workarounds, still the right approach: (a) `node --check` for syntax, (b) exercising pure
  logic via dynamic `import()` + direct calls in `javascript_tool`, bypassing the map-load gate, (c) DOM/
  attribute-level checks (checkbox `.checked`, input `.value`) via `javascript_tool` even when the WebGL
  canvas itself won't composite, (d) direct `curl` against deployed URLs when relevant, (e) asking the
  owner to confirm real visual/interaction behavior in their own browser for anything WebGL-dependent —
  don't claim visual confirmation that didn't actually happen.
- **Mapbox token URL restrictions must include every Cloudflare Pages preview domain the owner might use**
  (currently just `moonshot-et1.pages.dev`, covers all its preview subdomains automatically) — if a new
  preview URL ever 403s on tiles/features while the style JSON itself still loads fine, check the token's
  URL allowlist before re-diagnosing from scratch (see v1.2.3 above).
- Carried forward from file `c`, still true and still relevant:
  - The path's time window still has no UI to narrow it (removed deliberately in v1.1.7) — always the
    natural moonrise-to-moonset span. Don't silently resurrect the old UI if asked; confirm what's wanted.
  - `git push` still must go through the `aiceinc` collaborator account.
  - GitHub secret-scanning still false-positives on the Mapbox `pk.` token on any commit touching it.
  - Untested: moon-never-rises/sets fallback path, zero-valid-points state (path renders as an empty line
    with no dedicated message).
  - Out of scope, not built (brief §7, unchanged): sun-alignment mode. (Terrain/building occlusion is
    *partially* addressed now — real terrain + real 3D buildings both render — but nothing in the alignment
    algorithm itself accounts for them occluding the line of sight; the path is still pure geometry.)

---

## 4. Next steps (none pending; ideas)

1. Tell the owner directly, next natural opening: no "building render distance" control is possible via
   Mapbox Standard's public API (see §1/§3).
2. Ask the owner to confirm, in a real browser: the three legend toggles all work as expected (POI labels,
   road labels, and especially the new opt-in "Set height automatically"), and that manually tilting into
   3D (not via the button) now flips the 2D/3D control's active state.
3. Consider deleting the stale `experiment/standard-style` branch (owner hasn't been asked).
4. Sun-alignment mode, and any real occlusion-aware use of the now-real terrain/building data (brief's
   noted future enhancements — buildings/terrain were originally added toward this, but the alignment path
   itself doesn't consult them yet).
5. The sidebar still has room for more than favourites (scoped as "future buttons/features" since v1.1.3).

Reminder: develop on `dev`, **push immediately after every commit — no confirmation needed**. Merging
`dev` → `main` needs the owner's go-ahead each time (this file's merge was one such explicit request).
Always `cat CNAME` after a merge, before pushing — see file `c` §3 for why it won't always need restoring.
Bump the `?v=` cache-bust string (footer version *and* every local link/script/import specifier) on every
release — see v1.1.10 above and `[[project_moonshot_cache_busting]]`.

---

## 5. How the project works (architecture, pipeline, gotchas)

**Shape.** Unchanged: static, plain HTML/CSS/vanilla-JS ES modules, no framework, no bundler, no build
step. Astronomy Engine + Mapbox GL JS via CDN `<script>` globals (`Astronomy`, `mapboxgl`, now v3.28.0).

**Files** (current full set; substantial changes since file `c` in bold). `index.html` — `.topbar` (brand +
**Moon Alignment/POV Arc tabs**) → `.controlbar` (search, target-height+unit-toggle **as a slider+number
pair**, max-distance **slider+number pair**, Now/Next-Full-Moon/Custom-Date) → **`.view`-wrapped** `.layout`
(`.sidebar-pane` [favourites, **drag-resizable**] + `#map` + `.panel-pane` [`#moon-panel`,
**drag-resizable**]) + **`#view-pov-arc` placeholder** → `.site-footer`. `css/styles.css` — black theme with
**dark-blue accent** (was yellow), self-hosted DM Sans (**600-weight bug fixed, all now 500**), number-line
slider styling, tab/time-button underline styling, resizable-pane handle styling, **`.map-legend`/
`.legend-*` toggle-switch styling**, **`.view-mode-control`/`.view-mode-btn` 2D/3D control styling**.
`js/config.js` (token + defaults; **`MAPBOX_STYLE` now Standard; `DEFAULT_TARGET_HEIGHT_FT` now 500, unit-
independent `TARGET_HEIGHT_RANGE`/`MAX_DISTANCE_RANGE` added for the sliders**). `js/astro.js` (Astronomy
Engine wrapper, unchanged). `js/alignment.js` (unchanged since genesis — Section-2 ray-cast algorithm
itself has never been touched by any UI/3D/style work). `js/map.js` — substantially grown: map init now
adds `LegendControl` (top-left, POI/road-label toggles + **the new "Set height automatically" toggle**,
`ViewModeControl` (bottom-right 2D/3D, **now pitch-driven for sync**), and a `ScaleControl`; no more
`NavigationControl` (+/- buttons removed); `addBuildingsAndTerrain()` sets up terrain + Standard's native
building visibility + `lightPreset:'night'` (classic-style buildings layer from v1.2.1 was dropped once
Standard started rendering buildings natively); `onMapClick()` uses the Interactions/Featureset API for
building-height reads, **gated by the `autoHeightEnabled` module flag**; still has path rendering (hit-line
+ visible line + per-2-min arrows + permanent per-10-min timestamp labels + hover tooltip) and geocoding,
all unchanged from file `c`; **new virtual-point pillar rendering** (`fill-extrusion`, ground → target
height). `js/panel.js` (unchanged logic from file `c`). `js/datepicker.js` (unchanged). `js/favourites.js`
(unchanged from file `c`). `js/main.js` (orchestration; **new `rafThrottle` for slider drags, slider
min/max/step wiring per unit, resizable-pane drag handlers, tab-switching wiring with `map.resize()` on
return**). `CNAME` (main only) · `_headers` (dev only) · `fonts/` · `state/` · `.claude/launch.json`.

**The alignment algorithm** — unchanged since genesis (file `a`'s §5 has the full walkthrough). Still pure
geometry: doesn't consult the now-real terrain or building data for occlusion (see §3/§4).

**Time windows / hover system** — both unchanged mechanically since file `c` (no changes this stretch).

**Mapbox Standard style + config properties** (new, v1.2.3) — replaces the classic `dark-v11` style.
Config knobs are set via `map.setConfigProperty('basemap', propertyName, value)`, not layer paint
properties — confirmed available: `showPointOfInterestLabels`, `showRoadLabels`, `lightPreset`
(`dawn`/`day`/`dusk`/`night`), `theme`, `show3dBuildings`/`show3dObjects`/`show3dFacades` (visibility only —
**no distance/LOD control exists**, see §1/§3). Natively-rendered features (buildings, labels) aren't
reachable via the classic `queryRenderedFeatures` — use the newer Interactions/Featureset API instead
(`map.addInteraction`, `featuresetId`/`importId` targeting), which needs Mapbox GL JS ≥3.28.0.

**3D buildings, terrain, virtual-point pillar** (v1.1.15/v1.2.1) — terrain via `raster-dem`
(`mapbox-terrain-dem-v1`) + `map.setTerrain()`, unaffected by the later Standard-style swap. Buildings now
render natively as part of the Standard style itself (the app's own custom `fill-extrusion` buildings layer
from v1.2.1 was removed once that happened) — only the virtual-point pillar remains a custom
`fill-extrusion` layer, since that's app-specific geometry Mapbox has no native equivalent for.

**"Set height automatically" toggle** (new, v1.2.4) — `autoHeightEnabled`, a module-level `let` in
`js/map.js`, flipped by the third `LegendControl` checkbox. Off by default. `onMapClick` only reports a
non-null `buildingHeightM` to its caller when this is true; `main.js`'s `applyBuildingHeight` call site is
unchanged (still just checks `!= null`) — the gating lives entirely in `map.js`, next to the data source it
gates, not duplicated in the caller.

**2D/3D view sync** (fixed v1.2.4) — `ViewModeControl._setActive` is now driven by a single
`map.on('pitch', ...)` listener rather than being called from each button's own click handler. Any future
control that changes pitch (programmatically or via gesture) will automatically keep this UI in sync for
free — don't add a second explicit `_setActive` call path if you touch this again.

**Deploy** — mechanically unchanged (`dev`→Cloudflare Pages, `main`→GitHub Pages, `CNAME`/`_headers`
split). Cloudflare Pages preview builds are reachable at `<hash>.moonshot-et1.pages.dev`, which is why the
Mapbox token's URL allowlist entry is the bare `moonshot-et1.pages.dev` domain (auto-covers every hash
subdomain) rather than the production/dev custom domains alone.

**Aesthetic / product intent.** Unchanged: personal, non-commercial tool; chrome consistency with
bendentremont.com is a deliberate choice, not incidental. The dark-blue theme (v1.1.10) replaced the
original yellow specifically to read as more "night sky," matching the astro subject matter.

---

## 6. State-file protocol

- Files live in `state/`, named `moonshot_state_YYYYMMDD<letter>.md` (letter increments within a day:
  a, b, c…). **Latest = highest date, then highest letter** — read that one first.
- After a sizeable task, **write a NEW file** (name what it supersedes in the header). Don't edit old
  ones — each is an immutable snapshot; the trail is the history. **Carry §5 forward** (lightly updated)
  so the architecture context always rides with the latest file.

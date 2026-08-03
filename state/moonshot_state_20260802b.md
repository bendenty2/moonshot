# Moonshot — State File

**File:** `moonshot_state_20260802b.md`
**Date:** 2026-08-02
**Produced by:** Claude Code — five iterative rounds of dev-branch polish/features after v1 shipped:
chrome (header/footer/black theme), unit toggles + calendar picker + moonrise-to-moonset windowing, a
full path-visual rework (later partly reverted per feedback), a left-sidebar favourites system with a
location lock, and finally precision/live-clock polish on the moon panel. Versions v1.1.1 → v1.1.5.
**Supersedes:** `moonshot_state_20260802a.md` (the genesis file, v1/pre-chrome).

> **This is the single handoff doc.** `MOONSHOT_BRIEF.md` is the original product spec and stays put as
> a permanent reference (not retired). Read §1 for current status, §5 for how the project works. When you
> finish a sizeable task, write the next state file (protocol in §6) — don't edit this one; carry §5
> forward into it.

---

## 1. Current status

**`dev` is at v1.1.5; `main`/production has NOT been updated since the original v1 ship.** Everything in
§2 below is live at `dev.moonshot.bendentremont.com` and has NOT been merged to `main` /
`moonshot.bendentremont.com` yet. Production is still running the pre-chrome v1 build from state file
`a` (gradient-era circles-not-arrows path, no footer/header/sidebar/favourites, ±12h/24h time windows,
1-decimal panel figures). **Don't assume production reflects anything in this file — check which branch
before describing "the site" to the owner.**
- Owner has visually confirmed v1.1.1–v1.1.4 on `dev` in a real browser after each push. v1.1.5 was
  pushed but not yet owner-confirmed as of this file.
- Merging `dev` → `main` was not requested this session — standing instruction is to push to `dev`
  immediately after every commit (no confirmation needed) but to **ask first before merging to `main`**
  (see `[[feedback_dev_branch_autopush]]` memory).

---

## 2. What changed since `a` (v1.1.1 → v1.1.5)

### v1.1.1 — chrome
Footer (`v1.1.1`, dynamic year, "Benjamin d'Entremont" copyright — matches Ben's Place) · black backdrop
(`--bg`/`--panel-bg` → `#000000`) · new `.topbar` header with "Moonshot" brand on the left.

### v1.1.2 — polish pass
Removed the Mapbox compass ("reset bearing to north") button (`showCompass: false`) · control bar
background now matches header/footer (pure black, was a lighter `--card-bg`) · footer version/copyright
inset from the screen edges using bendentremont.com's exact scaling `clamp()` padding formula · **self-
hosted DM Sans** copied from the Photo Site repo (`fonts/dmsans-latin*.woff2` + `@font-face`, `--font-
sans` now DM-Sans-first everywhere) · fixed a real bug: Mapbox's default white-card hover popup was
picking up the page's near-white text color, washing out to near-invisible contrast — popups (later
replaced entirely, see v1.1.3) got explicit dark-card colors.

### v1.1.3 — first path-visual rework + sidebar + panel rename
- Panel title `"Moon over <landmark>"` → static, then → `"Live Moon Info"` (settled in v1.1.4's commit
  but the text change itself landed here).
- **Target height** gained a `ft`/`m` unit-toggle button (`js/config.js`: `heightToMeters`/`metersToFeet`
  /`heightUnit` state). **Max distance** switched from miles to km (`DEFAULT_MAX_DISTANCE_KM`,
  `kmToMeters`, `METERS_PER_KM` — the old mile constants are gone).
- **Custom date** control replaced entirely: was a native `<input type="datetime-local">`, now a button
  that opens a hand-built navigable month/year calendar popover (`js/datepicker.js`, `createDatePicker`)
  — **date-only, no time-of-day** on that control anymore.
- **Time-window model unified across all three modes** (`js/astro.js` `moonUpWindow(refDate, observer)`):
  every mode now resolves to the *actual* moonrise→moonset interval bracketing (or next-following) a
  reference instant, not an arbitrary `±12h`/`now+24h` heuristic. `'now'` → bracket/next around `new
  Date()`; `'fullmoon'` → around the next full-moon instant; `'custom'` → around local noon of the picked
  day (so it naturally resolves to that evening's rise-to-set). Falls back to `refDate ± 12h` only if the
  moon genuinely doesn't rise/set in the search window (extreme latitude).
- **New start/end override fields** in the panel ("Path window" section, under the main facts): pre-
  filled from the natural moonrise/moonset, freely editable `<input type="time">`s that directly become
  the path's actual search bounds — no clamping, since the astronomy filter (`altitude ≤ 0`) already
  rejects anything outside the moon's real up-time regardless of what bounds you set.
- First path-visual rework (**later reverted, see v1.1.4**): solid line → blue/yellow *speed gradient*
  (`line-gradient`, ground-distance-per-2-min-step, normalized per-path) + only **~10** direction arrows.
  Continuous hover (see below) shipped in this same round and was *kept*.
- **Continuous hover, not point-snapping**: removed the old discrete-circle layer + anchored `Popup`
  entirely. A wide (16px) invisible line layer (`alignment-path-hit`) gives the thin visible line a
  forgiving hit area; `mousemove` on it finds the closest point via planar segment projection
  (`closestPointOnPath`), linearly interpolates time/distance/altitude between the two bracketing samples
  (`interpolateAt`), and shows the result in a plain DOM tooltip that tracks the raw cursor (`e.point.x/y`)
  — not a geo-anchored `Popup`. This is why hovering feels smooth instead of jumping between 2-min ticks.
- New empty left `.sidebar-pane` (half the width of the right panel) — placeholder at this point, filled
  in v1.1.4.

### v1.1.4 — favourites, lock toggle, live refresh, path-visual revert
- **Path visual reverted** per explicit feedback: back to a solid `#ffcc66` line, and arrows restored to
  **one per 2-min sample** (i.e. same density the original circles had) instead of the ~10-arrow/gradient
  experiment. The gradient/speed-color code was deleted outright, not just disabled.
- **Favourites system** (`js/favourites.js`, new module): bookmarks `{id, name, lat, lon, heightValue,
  heightUnit}` in `localStorage` under `moonshot.favourites`. "Set Favourite" button in the sidebar snap-
  shots the current landmark + target height; list items are click-to-apply (flies map, restores height
  +unit), rename (pencil icon → inline `<input>`, commits on blur/Enter, Escape reverts), and remove (×).
  `crypto.randomUUID()` for ids — fine even over local `http://` since `localhost` counts as a secure
  context.
- **Lock-location toggle** (checkbox styled as a slider switch) in the sidebar: when checked,
  `onMapClick`'s handler in `main.js` no-ops (`if (state.locationLocked) return;`). **Deliberately doesn't
  touch marker dragging** — the owner's spec described only click behavior, so dragging the existing
  marker still works regardless of lock state.
- `LIVE_REFRESH_MS` 60s → 10s (owner asked "is it possible to update every 5-10-30s"; picked 10s as a
  reasonable default — Astronomy Engine calls are sub-ms, no real cost to going faster still if asked).
- Illumination percentage: whole number → one decimal (`Math.round(fraction*1000)/10`, `.toFixed(1)`).

### v1.1.5 — precision + live clock + cardinal direction
Prompted by the owner comparing against timeanddate.com's moon page:
- Azimuth/altitude: 1 decimal → **2 decimals**.
- New **"Current time" row**, first in the facts list, showing full precision including seconds
  (`formatExactTime`, exported from `panel.js`). It **ticks every second** via its own `setInterval` in
  `main.js` that just re-queries `#panel-current-time` and sets `textContent` — deliberately separate from
  the 10s astronomy-recompute cycle, since the clock needs no recomputation and a proper ticking clock
  reads as more "live" than a number that jumps every 10s.
- Azimuth now shows its **16-point cardinal** (`azimuthToCardinal`, verified against the reference site's
  own example: 72.06° → "ENE", exact match) plus a small **arrow glyph** (`↑`, unrotated = north) rotated
  via inline `transform: rotate(${azimuth}deg)` to point the true compass direction — no offset needed
  here (unlike the map's `▶` arrows, which point east by default and need a `-90°` correction; `↑` points
  north by default, matching azimuth's own 0°-is-north convention directly).

---

## 3. Open items / known issues

- **`main`/production is stale** (see §1) — the owner hasn't asked for a `dev`→`main` merge yet. Don't
  merge without asking first, per standing memory.
- **The "path often spans way more than an hour" note from file `a` is largely superseded.** The window is
  now the *actual* moonrise-to-moonset interval (v1.1.3's `moonUpWindow`), not an arbitrary padded window
  — so a long path is now the deliberately-correct behavior, not an artifact of over-generous ±12h
  padding. The underlying physics observation still holds (ground speed varies a lot across the path,
  which is now literally visualized via arrow density/spacing since v1.1.4), but it's no longer really an
  "issue" — more a documented characteristic. The owner can narrow it via the start/end override fields.
- **Sandboxed dev-environment gotchas (this session's Claude Browser preview pane, NOT a real-browser
  bug)** — worth not re-diagnosing these as real bugs in a future session:
  - Mapbox's `'load'` event / WebGL frequently never fires because the pane isn't actually compositing
    frames (viewport reads `0×0` when this happens). `ready.then(...)`-gated code (marker, path, click
    handlers) simply never runs in that state. Real verification needs the owner's own browser, or in a
    pinch, calling exported functions directly via dynamic `import()` in `javascript_tool` to bypass the
    map-load gate entirely (this worked well for verifying `panel.js`/`favourites.js` logic in isolation).
  - **The preview pane's static file server (Python `http.server`) has no cache-busting headers, and the
    browser aggressively caches ES module `<script type="module">` fetches across navigations within a
    session.** Editing a `.js` file and just re-navigating is NOT enough to see the change — the page will
    silently keep running stale module code. Fix: before checking a change, run `fetch(f, {cache:
    'reload'})` for every `js/*.js` (and `css/styles.css`) file, THEN navigate. Hit this concretely once
    (a `showCompass:false` fix appeared correct in a raw `fetch` diagnostic but the live page still showed
    the old compass button until modules were primed this way).
  - **CSS transitions never advance/tick in this pane** (again, no compositing) — `getComputedStyle` on an
    element mid-`transition` can report the *pre-transition* value indefinitely, which looks exactly like
    a broken `:checked`/state-driven style rule but isn't. Confirmed once on the lock-toggle slider: it
    "failed" via `getComputedStyle` until `transition` was forced to `none` inline, at which point the
    correct color appeared immediately. If a `getComputedStyle` check on a transitioning property looks
    wrong in this pane, suspect this before suspecting the CSS/JS.
- **`git push` must go through the `aiceinc` GitHub collaborator account** (cached local credentials don't
  match `bendenty2`, which owns the repo) — unchanged from file `a`, still true, no action needed.
- **GitHub secret-scanning false-positives on the Mapbox `pk.` token** on any commit that touches it —
  unchanged from file `a`; resolve via the repo's secret-scanning allowlist UI if it resurfaces.
- Untested: moon-never-rises/sets edge case (extreme latitude, falls back to `refDate ± 12h` per
  `moonUpWindow`'s `null` case) and the zero-valid-points panel message — still not exercised with real
  inputs that hit either path.
- Out of scope, not built (brief §7, unchanged): terrain/building occlusion, sun-alignment mode, no
  accounts (favourites now give *some* persistence via `localStorage`, but that's client-local bookmarks,
  not accounts — consistent with brief §6's "could be a nice future add-on using local storage").

---

## 4. Next steps (none pending; ideas)

1. Ask the owner if/when they want `dev` merged to `main` — nothing currently blocks it, it just hasn't
   been requested.
2. Terrain-aware occlusion, sun-alignment mode (brief's noted future enhancements, still out of v1 scope).
3. Manually verify the two untested edge cases in §3.
4. The sidebar has room for more than favourites eventually (it was explicitly scoped as "future
   buttons/features will go there" when created) — no specific ask yet, just noting the intended home.

Reminder: develop on `dev`, **push immediately after every commit — no confirmation needed** (standing
instruction, `[[feedback_dev_branch_autopush]]` memory). Merging `dev` → `main` still needs the owner's
go-ahead each time. Verify `CNAME` survives any future merge — it lives only on `main`; `_headers` only on
`dev`.

---

## 5. How the project works (architecture, pipeline, gotchas)

**Shape.** Unchanged from file `a`: static, plain HTML/CSS/vanilla-JS ES modules, no framework, no
bundler, no build step. Astronomy Engine + Mapbox GL JS via CDN `<script>` globals (`Astronomy`,
`mapboxgl`); Moonshot's own files are ES modules referencing those globals.

**Files** (current full set). `index.html` — `.topbar` (brand) → `.controlbar` (search, target-height +
unit-toggle, max-distance-km, Now/Next-Full-Moon/Custom-Date-with-calendar-popover) → `.layout` (
`.sidebar-pane` [lock toggle, Set Favourite button, favourites list] + `#map` + `.panel-pane` [`#moon-
panel` card, then the "Path window" start/end-time section]) → `.site-footer`. `css/styles.css` — black
theme throughout, self-hosted DM Sans, flexbox column body (`topbar`/`controlbar`/`layout`(flex:1)/
`footer` stacked, no `vh` arithmetic needed since nothing scrolls). `js/config.js` (token + tunable
defaults + unit-conversion helpers — km/ft/m, no more miles). `js/astro.js` (Astronomy Engine wrapper +
`moonUpWindow`). `js/alignment.js` (unchanged since file `a` — the Section-2 ray-cast algorithm itself
hasn't been touched by any of this session's chrome/UX work). `js/map.js` (map init, marker, click,
**path rendering + continuous hover system** — see v1.1.3/v1.1.4 above for the current shape: hit-line +
visible line + dense arrow-per-sample symbol layer + cursor-following tooltip; geocoding). `js/panel.js`
(`computeMoonInfo`, `renderMoonPanel`, `renderPathStatus`, `formatExactTime`, cardinal-direction helper).
`js/datepicker.js` (new in v1.1.3 — self-contained month/year-navigable calendar popover component, no
external deps). `js/favourites.js` (new in v1.1.4 — `localStorage`-backed CRUD + list rendering). `js/
main.js` (orchestration: `state` object now also carries `heightUnit`, `maxDistanceKm`, `pathStart`/
`pathEnd`/`pathBoundsCustomized`, `favourites`, `locationLocked`; two intervals — 10s astronomy recompute,
1s clock tick). `CNAME` (main only) · `_headers` (dev only) · `fonts/` (self-hosted DM Sans, committed) ·
`.claude/launch.json` (local static server config).

**The alignment algorithm** — unchanged since file `a`, still exactly as documented there (accurate
spherical destination-point formula for the horizontal projection; only the elevation-angle relationship
itself ignores Earth's curvature, per the brief's documented v1 simplification). Re-read file `a` §5 if
you need the precise formula walkthrough; not re-derived here since nothing about it changed.

**Time windows, current model** (`js/main.js` + `js/astro.js` `moonUpWindow`). Every mode resolves a
*reference instant* (`getReferenceDate()`: `'now'` → literally now; `'fullmoon'` → next full-moon instant;
`'custom'` → local noon of the picked day), then `moonUpWindow(refDate, observer)` finds the single
continuous moon-up interval bracketing or following it — searching backward up to 40h for the bracketing
rise if the moon's currently up, or forward for the next rise+set pair if it's currently down. This
becomes `state.pathStart`/`pathEnd`, which populate the editable start/end `<input type="time">`s in the
panel. Editing those inputs directly sets `pathBoundsCustomized = true` and re-runs `updatePath()` with
the new bounds — no clamping to the natural window, since out-of-range points get filtered by the
astronomy check anyway. The moon info panel/card is **still** always computed from real "now", fully
decoupled from whichever time mode drives the path (unchanged design point from file `a`).

**Hover system** (`js/map.js`) — see v1.1.3 bullet above for the mechanism; the short version: don't
reach for Mapbox's `Popup` class for this kind of continuously-updating hover, a plain absolutely-
positioned DOM element following `e.point.x/y` is simpler and smoother for this use case.

**Deploy** — unchanged mechanically from file `a` (`dev`→Cloudflare Pages, `main`→GitHub Pages, same
`CNAME`/`_headers` split), just now meaningfully **out of sync** — see §1.

**Aesthetic / product intent.** Personal, non-commercial tool. The chrome work this session (black theme,
DM Sans, header/footer matching bendentremont.com) was explicitly about visual consistency across the
owner's project family, not a new design direction — keep future chrome changes consistent with that
sibling site unless told otherwise.

---

## 6. State-file protocol

- Files live in `state/`, named `moonshot_state_YYYYMMDD<letter>.md` (letter increments within a day:
  a, b, c…). **Latest = highest date, then highest letter** — read that one first.
- After a sizeable task, **write a NEW file** (name what it supersedes in the header). Don't edit old
  ones — each is an immutable snapshot; the trail is the history. **Carry §5 forward** (lightly updated)
  so the architecture context always rides with the latest file.

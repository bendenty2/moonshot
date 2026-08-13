# Moonshot — State File

**File:** `moonshot_state_20260813a.md`
**Date:** 2026-08-13
**Produced by:** Claude Code — a single-commit `dev` round since file `b` (v1.3.2: fixed a mobile-layout
bug where the map was getting squeezed down to a sliver), then an owner-requested merge of `dev` → `main`,
promoting it to production.
**Supersedes:** `moonshot_state_20260805b.md`.

> **This is the single handoff doc.** `MOONSHOT_BRIEF.md` is the original product spec and stays put as
> a permanent reference (not retired). Read §1 for current status, §5 for how the project works. When you
> finish a sizeable task, write the next state file (protocol in §6) — don't edit this one; carry §5
> forward into it.

---

## 1. Current status

**`main`/production and `dev` are back in sync, both at v1.3.2.** This file's owner explicitly asked to
merge `dev` → `main` right after v1.3.2 shipped, then asked for this state update — same pattern as every
previous merge in this project's history. The merge (`git merge dev --no-edit` on `main`) was clean, no
conflicts. `CNAME` survived intact (confirmed via `cat CNAME` post-merge). Pushed to `origin/main`.
- Standing instruction unchanged: push to `dev` immediately after every commit, no confirmation needed;
  merging to `main` still needs the owner's go-ahead each time (`[[feedback_dev_branch_autopush]]`
  memory) — this merge was requested explicitly ("yes, merge to main and update state").
- Session note: this round started with the owner asking "where'd we leave off?" after a gap — answered
  from `git log`/`git status` rather than assuming the last state file was current (it wasn't; v1.3.2 had
  already shipped to `dev` but not yet merged, and had no state-file coverage yet). **When resuming after
  a gap, check git directly before answering "where are we" — the last state file can lag actual `dev`.**

---

## 2. What changed since `b` (v1.3.2)

### v1.3.2 — fixed mobile layout: map was getting squeezed to a sliver
- **Root cause**: on narrow viewports, `.panel-pane` (the moon-info box) still carried its **desktop**
  `flex: 0 0 auto` — never shrinks, always sized to its full natural content height. `.map-pane` still
  carried its desktop `flex: 1 1 auto` (shrinkable). In the mobile column layout, flexbox had no choice but
  to shrink the map down to almost nothing to make room for the panel's uncapped height — the mobile
  media query's `.map-pane { height: 60vh }` was only ever a flex-basis starting point, not a floor, so
  flex-shrink still won out over it.
- **Fix**: made the roles explicit in the mobile media query. `.map-pane` is now `flex: 0 0 auto` with a
  bounded height (`45vh`, clamped between `220px` and `420px`) so it can't be shrunk out from under the
  panel. `.panel-pane` is now `flex: 1 1 auto; min-height: 0;` so it only takes whatever space is left
  *after* the map — its existing `overflow-y: auto` then scrolls its own content within that remaining
  space instead of forcing the whole page taller than the viewport.
- Verified directly in the browser pane at a 375×812 viewport via `getBoundingClientRect()`/`scrollHeight`
  (not just visual inspection, since this pane can't reliably composite the map's WebGL canvas — see §3):
  map rendered at ~365px tall (previously reduced to a sliver), panel content (370px worth) correctly
  scrolled within its own ~170px box, and `document.documentElement.scrollHeight` matched
  `window.innerHeight` exactly — the page itself never needs to scroll, confirming the fix.
- Reported by the owner via a real-phone screenshot (Android Chrome) showing the moon-info panel
  effectively covering the map; the numeric verification above is the strongest confirmation available
  without a real device, but the owner should still eyeball their own phone to be sure.

---

## 3. Open items / known issues

Carried forward from file `b`, still true and still relevant — nothing new this round beyond §1's note
about checking git state directly after a gap:
- Sandboxed dev-pane WebGL/animation-frame limitation: `map.easeTo({..., duration: 0})` works instantly and
  correctly in this pane, but the default *animated* `easeTo()` never visibly completes here (the pane's
  `requestAnimationFrame` loop doesn't reliably progress). Established workarounds: `node --check` for
  syntax, dynamic `import()` + direct calls in `javascript_tool`, DOM/attribute/`getBoundingClientRect()`
  checks (as used for this round's mobile-layout verification) even when the WebGL canvas won't composite,
  direct `curl` against deployed URLs, and asking the owner to confirm real visual/animation behavior in
  their own browser. Say plainly when something wasn't (and couldn't be) visually confirmed here.
- Transient Mapbox SKU-token 403s during rapid local-preview reload cycles — confirmed harmless/
  environmental in file `b`, not a real regression; don't re-diagnose it as one if it recurs.
- Mapbox token URL restrictions must include every Cloudflare Pages preview domain in use (currently
  `moonshot-et1.pages.dev`, auto-covers all its preview subdomains).
- The path's time window still has no UI to narrow it (removed deliberately in v1.1.7).
- `git push` still must go through the `aiceinc` collaborator account.
- GitHub secret-scanning still false-positives on the Mapbox `pk.` token on any commit touching it.
- Untested: moon-never-rises/sets fallback path, zero-valid-points state.
- Out of scope, not built (brief §7): sun-alignment mode; the alignment algorithm still doesn't consult the
  real terrain/building data for occlusion (buildings/terrain render, but nothing about them feeds back
  into the path math).
- `experiment/standard-style` branch (stale, pre-dates the real Standard-style work, safe to delete) — still
  not asked about, still exists.

---

## 4. Next steps (none pending; ideas)

1. Sun-alignment mode, occlusion-aware use of the real terrain/building data (brief's noted future
   enhancements).
2. Consider deleting the stale `experiment/standard-style` branch (owner still hasn't been asked).
3. The sidebar still has room for more than favourites (scoped as "future buttons/features" since v1.1.3).
4. Manually verify the two untested edge cases in §3 in a real browser at some point.
5. **Owner should confirm the v1.3.2 mobile fix on their actual phone** — this round's verification was
   numeric (`getBoundingClientRect`/`scrollHeight` in a resized browser pane), not a real-device screenshot
   like the one that originally reported the bug.

Reminder: develop on `dev`, **push immediately after every commit — no confirmation needed**. Merging
`dev` → `main` needs the owner's go-ahead each time (this file's merge was one such explicit request).
Always `cat CNAME` after a merge, before pushing. Bump the `?v=` cache-bust string (footer version *and*
every local link/script/import specifier) on every release — `[[project_moonshot_cache_busting]]`.

---

## 5. How the project works (architecture, pipeline, gotchas)

**Shape.** Unchanged: static, plain HTML/CSS/vanilla-JS ES modules, no framework, no bundler, no build
step. Astronomy Engine + Mapbox GL JS via CDN `<script>` globals (`Astronomy`, `mapboxgl`, v3.28.0).

**Files** (current full set; unchanged from file `b` except the mobile CSS fix below). `index.html` —
`.topbar` (brand + tabs + light/dark theme pill, reusing `.view-mode-control`/`.view-mode-btn`) →
`.controlbar` → `.layout` → `.site-footer`. `css/styles.css` — `color-scheme` declared per theme;
`--hover-wash`/`--footer-text(-dim)`/`--scale-color` tokens; `.view-mode-control` pill has a sliding
`.view-mode-highlight` layer instead of per-button background; `.panel-date-grid`/`.pdg-*` for the moon
panel's 5 date rows; `.compass-*` styles; consolidated Mapbox-hover-conflict overrides; **mobile media
query's `.map-pane`/`.panel-pane` now explicitly set `flex`/`min-height` instead of relying on the desktop
defaults (see §2)**. `js/config.js` — `DEFAULT_MAP_ZOOM`/`PITCH`/`BEARING`/`CENTER_OFFSET_LAT` for the
opening camera (15.35 / 70 / 0 / ~31m north); shared `DEG`/`RAD` exports. `js/astro.js` (unchanged).
`js/alignment.js` (algorithm itself untouched since genesis). `js/map.js` — `MapControlsPanel` (merged
legend+2D/3D+compass-toggle box, bottom-right), `CompassControl` (top-right, N/E/S/W + live heading
readout), sliding-highlight pill markup, `setMapTheme()`. `js/panel.js` — `dateParts()`/`dateGridRow()` for
the date grid, built from raw `Date` getters (not locale-string parsing). `js/datepicker.js` (uses the
shared `onOutsideClick()` helper). `js/favourites.js` (unchanged). `js/main.js` — theme state + toggle
wiring; initial camera center offset applied only at `createMap()` call, never to `state.landmark`; marker
created synchronously right after `createMap()` (not inside `ready.then()`); uses `onOutsideClick()` for
the search-results dropdown. `js/theme.js` (localStorage-backed light/dark preference). `js/dom.js`
(`onOutsideClick()`). `CNAME` (main only) · `_headers` (dev only) · `fonts/` · `state/` · `.claude/
launch.json`.

**The alignment algorithm** — unchanged since genesis, still pure geometry (doesn't consult terrain/
building data for occlusion).

**Site-wide theme** — `state.theme` (`'dark'`|`'light'`), persisted via `js/theme.js`, applied by setting
`data-theme` on `<html>`. `index.html` has a synchronous inline `<head>` script that duplicates `theme.js`'s
storage key deliberately (that module isn't loaded yet at that point) to avoid a flash of the wrong theme.
`setMapTheme(map, theme)` in `map.js` keeps the Mapbox Standard style's `lightPreset` (day/night) in sync.

**The `.view-mode-control`/`.view-mode-btn` pill pattern** — shared by the 2D/3D and theme toggles: a
container with a sliding `.view-mode-highlight` absolutely-positioned accent layer (`translateX(0)`↔
`translateX(100%)` via an `.is-second-active` class), two equal-width buttons layered above it. Any future
two-option toggle should reuse this pattern — it has the Mapbox-hover-conflict fix baked in.

**Mapbox base-CSS hover conflict** — `.mapboxgl-ctrl button:not(:disabled):hover { background-color: #eee }`
ships in Mapbox's own stylesheet and is more specific than a bare custom `:hover` rule on any button living
inside a `.mapboxgl-ctrl` container (it includes the `button` type selector). Any new custom button control
added to the map **must** include an extra ancestor class in its hover selector and must explicitly restate
`background-color` there — see the consolidated rule in `styles.css` (covers `.view-mode-btn` and
`.compass-btn` together).

**Compass control** — `CompassControl` in `map.js`. Plain N/E/S/W letters on a circular `.compass-face`
dial (no degree ticks, no center dot), plus a `.compass-heading` readout below showing the live bearing
normalized to 0–359°, both inside one `.compass-control` container so `setVisible()` hides/shows them
together. `MapControlsPanel` owns the show/hide checkbox and calls `compass.setVisible()` via an
`onToggleCompass` constructor callback.

**Opening camera** — `DEFAULT_MAP_ZOOM`/`PITCH`/`BEARING` in `config.js` (15.35 / 70 / 0), plus
`DEFAULT_MAP_CENTER_OFFSET_LAT` (~31m north), applied only to the camera passed into `createMap()` in
`main.js` — never to `state.landmark`. The "3D" view-mode button's reset target (`pitch: 70, bearing: 0`) is
kept manually in sync with these defaults — if the defaults change again, update both places.

**Moon panel date grid** — `.panel-date-grid` (CSS Grid, `1fr repeat(6, max-content)` columns) replaces a
flat list for the 5 date rows. `panel.js`'s `dateParts()` breaks each date into weekday/month/day/year/
time/meridiem pieces from raw `Date` getters, and `dateGridRow()` renders each as its own set of grid cells
so every field lines up vertically across rows like a table without a visible border.

**Mobile layout** (fixed this round, v1.3.2) — the `@media (max-width: 720px)` block collapses `.layout`
to a column (sidebar hidden, map above, moon-info panel below). The map is a **fixed-height** block
(`flex: 0 0 auto`, `height: 45vh` clamped 220–420px) and the panel is **flexible with internal scroll**
(`flex: 1 1 auto; min-height: 0;`, relying on its existing `overflow-y: auto`). **This is the load-bearing
pattern for this layout — if either side reverts to relying on its desktop `flex` value without an explicit
mobile override, the squeeze bug in §2 comes back.**

**Deploy** — mechanically unchanged (`dev`→Cloudflare Pages, `main`→GitHub Pages, `CNAME`/`_headers` split,
`moonshot-et1.pages.dev` token allowlist entry covers all preview subdomains).

**Aesthetic / product intent.** Unchanged: personal, non-commercial tool; chrome consistency with
bendentremont.com is deliberate.

---

## 6. State-file protocol

- Files live in `state/`, named `moonshot_state_YYYYMMDD<letter>.md` (letter increments within a day:
  a, b, c…). **Latest = highest date, then highest letter** — read that one first.
- After a sizeable task, **write a NEW file** (name what it supersedes in the header). Don't edit old
  ones — each is an immutable snapshot; the trail is the history. **Carry §5 forward** (lightly updated)
  so the architecture context always rides with the latest file.

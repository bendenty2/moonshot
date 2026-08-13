# Moonshot — State File

**File:** `moonshot_state_20260805b.md`
**Date:** 2026-08-05
**Produced by:** Claude Code — a long unbroken `dev` stretch since file `a` (v1.2.5 → v1.3.1: merging the
Standard-style label toggles into one switch, a new site-wide light/dark theme, a multi-round fight to get
the 2D/3D pill's hover state right against a Mapbox base-CSS conflict, a sliding-highlight pill redesign, a
CSS-grid date-alignment rebuild of the moon panel, a new N/E/S/W compass control iterated through several
rounds of feedback, several rounds of opening-camera-angle tuning, and a full code-cleanliness audit with
three approved follow-up fixes), then an owner-requested merge of `dev` → `main`, promoting all of it to
production in one shot.
**Supersedes:** `moonshot_state_20260805a.md`.

> **This is the single handoff doc.** `MOONSHOT_BRIEF.md` is the original product spec and stays put as
> a permanent reference (not retired). Read §1 for current status, §5 for how the project works. When you
> finish a sizeable task, write the next state file (protocol in §6) — don't edit this one; carry §5
> forward into it.

---

## 1. Current status

**`main`/production and `dev` are back in sync, both at v1.3.1.** This file's owner explicitly asked to
merge `dev` → `main` right after v1.3.1 shipped, then asked for this state update — same pattern as every
previous merge in this project's history. The merge (`git merge dev --no-edit` on `main`) was clean, no
conflicts. `CNAME` survived intact (confirmed via `cat CNAME` post-merge, no restore commit needed — see
file `c`'s §3 for why that varies merge-to-merge depending on the merge-base, not a fixed rule). Pushed to
`origin/main`.
- Standing instruction unchanged: push to `dev` immediately after every commit, no confirmation needed;
  merging to `main` still needs the owner's go-ahead each time (`[[feedback_dev_branch_autopush]]`
  memory) — this session's merge was requested explicitly.
- **Version-numbering note for next time:** several rounds this stretch (v1.2.11, v1.2.12, and this file's
  v1.3.1) arrived *without* an explicit version number in the owner's message. Established handling: bump
  to the next sequential version anyway (patch bump by default; v1.3.1 was the one case the owner
  explicitly asked for a minor bump instead, when approving the code-audit follow-ups) rather than leaving
  the deployed code unversioned — don't stop to ask, just say what you picked in the wrap-up message.

---

## 2. What changed since `a` (v1.2.5 → v1.3.1)

### v1.2.5 — merged labels toggle, site-wide light/dark mode, styling polish
- Legend's separate POI/street-name toggles merged into one "Labels" switch, extended to also cover place
  labels (towns/districts/regions) and transit-station labels — previously untouched by either toggle.
- **New site-wide light/dark theme toggle** (top bar), persisted to `localStorage` via new `js/theme.js`,
  applied synchronously via an inline `<head>` script (avoids a flash of the wrong theme before the
  deferred module loads), and wired to drive the map's Standard-style `lightPreset` (day/night) in sync.
  New `--hover-wash`/`--footer-text(-dim)` CSS tokens; every hardcoded black/white color in the chrome
  swapped for variables so the whole UI actually responds to the toggle.
- Default opening location/height restored to CN Tower + 1900ft (reverting v1.2.4's plain 500ft) — the
  auto-fill-from-building-click toggle stayed independently opt-in, unaffected.
- Scale control restyled to the controlbar sliders' number-line look.
- 2D/3D control redesigned from a stacked square pair into a rounded horizontal pill — the shape that
  every later round in this file builds on.

### v1.2.6 → v1.2.10 — the pill-hover saga, plus opening camera v1
This was a real multi-round debugging arc, worth reading in full since the *wrong* fixes are as
instructive as the right one:
- **v1.2.6**: map opens already tilted (zoom 16.2/pitch 60/bearing -20). First hover fix attempt: stopped
  painting a background overlay on hover, faded opacity instead. *Didn't actually fix it.*
- **v1.2.7**: diagnosed (incorrectly, but plausibly) as Chrome's OS-dark-mode form-control auto-styling;
  added `color-scheme: dark/light`. Also: labels off by default, "Now" → "Next Moonrise", theme toggle
  reads "Dark"/"Light" as text. *Still didn't fix the hover bug.*
- **v1.2.8**: **found the real cause** — Mapbox's own base CSS ships `.mapboxgl-ctrl button:not(:disabled)
  :hover { background-color: #eee }`, and that selector (class + `button` type + two pseudo-classes) is
  MORE specific than a bare `.view-mode-btn:hover` rule. Fixed by scoping our override under an extra
  `.view-mode-control` ancestor class to out-specify it. Also merged the top-left legend box and the
  bottom-right 2D/3D pill into one `MapControlsPanel`, bottom-right.
- **v1.2.9**: pills got a sliding accent-highlight animation (separate absolutely-positioned layer,
  `translateX` between two equal-width segments) instead of instant background flips. Azimuth/altitude to
  3 decimals, illumination to 2. "Set height automatically" → "Set height on click".
- **v1.2.10**: **the v1.2.9 redesign reopened the same hover bug for the *active* segment specifically** —
  moving the active look onto the separate highlight layer meant the button's own `is-active` rule no
  longer set `background-color` at all, so Mapbox's `#eee` rule had nothing opposing it there. Added the
  missing override. Also: zoom pulled back one level (16.2→15.2, anchored to the scale bar's 50m→100m
  reading — one scale-bar doubling is exactly one Mapbox zoom level), and the moon panel's 5 date rows
  rebuilt as a real CSS grid (one column per weekday/month/day/year/time/meridiem) so proportional-width
  text lines up like a table without looking like one. Found and fixed a latent cross-locale bug in the
  process: parsing "AM"/"PM" back out of a `toLocaleTimeString()` string isn't safe (some locales render
  "p.m." instead) — `panel.js` now builds times from raw `Date` getters instead.
- **Lesson for future hover-related CSS on Mapbox controls**: any custom button inside a `.mapboxgl-ctrl`
  container needs an *explicit* `background-color` in every one of its own hover-adjacent rules, with
  enough extra ancestor specificity to beat `.mapboxgl-ctrl button:not(:disabled):hover`. Dropping the
  background-color declaration because "nothing else sets it" is exactly the trap — something else (Mapbox)
  always does.

### v1.2.11 → v1.2.13 — compass control, added then refined twice
- **v1.2.11**: new `CompassControl` (top-right) — a circular dial with fixed-position N/E/S/W buttons, each
  easing the map to the bearing that puts that direction "up" (N=0/E=90/S=180/W=270). The dial
  counter-rotates against live bearing so it reads as a true compass; each letter individually
  counter-counter-rotates to stay upright — the classic "ring rotates, labels don't" technique.
- **v1.2.12**: opening camera tuned again — bearing 0 (exactly north), pitch 70 (shallower/more
  horizon-level than 60), zoom 15.5, plus a new small camera-only ~20m north offset
  (`DEFAULT_MAP_CENTER_OFFSET_LAT`) so the tower sits a little closer to the viewer — applied only to the
  initial camera's `center`, never to `state.landmark` itself (marker/path/favourites still use the real
  coordinate). New "Compass" show/hide toggle in the control panel (on by default). Compass enlarged
  64px→84px with a degree-marked bezel (10°/30° tick rings via two stacked masked
  `repeating-conic-gradient`s) and a center pivot dot.
- **v1.2.13**: another "just a bit more" pass — zoom 15.5→15.35, offset ~20m→~31m. **Compass simplified
  back down** — bezel ticks and center dot removed per owner feedback ("leaving just the letters"), plus a
  new live heading readout (e.g. "0°") below the dial, built from raw bearing normalized to 0–359.
- **Camera-tuning lesson**: without a reference screenshot, terms like "shallower angle" and "shifted
  towards" are genuinely ambiguous (shallower could mean more-overhead OR more-horizon-level depending on
  which surface "angle" is measured from) — this file's owner was told the interpretation taken and why in
  each round, which let corrections land in one more round instead of guessing blind repeatedly. Keep doing
  that instead of silently picking an interpretation.

### v1.2.14 — copy tweaks
"Labels" → "Show labels", "Compass" → "Show compass", "Set height on click" → "Auto-set height".

### v1.2.15 — code audit, part 1 (owner asked for "as efficient and clean as possible")
Implemented directly (dead code / pure duplication, zero behavioral risk):
- Removed 3 dead exports never imported anywhere: `OBSERVER_ELEVATION_M` (never actually wired to
  anything — `makeObserver`'s elevation param already defaults to 0 and every call site passed `0`
  literally), `clearAlignmentPath`, `MOON_QUARTER_NAMES` (not even used internally).
- Deduplicated `DEG`/`RAD` (previously defined identically in both `alignment.js` and `map.js`) into one
  shared export from `config.js`.
- Removed the `--panel-bg` CSS variable — always identical to `--bg` in both themes, used in exactly one
  place, now references `--bg` directly.

### v1.3.1 — code audit, part 2 (the three "discuss with me" items, all approved)
- **Fixed a real latent race**: `marker` was only assigned inside `ready.then()` (after the map's `'load'`
  event) — any code path calling `setLandmark()` before that resolved would throw on
  `marker.setLngLat(...)`. Mapbox's `Marker` is a plain DOM overlay independent of style/`'load'`, so it's
  now created synchronously right after `createMap()` returns instead.
- Consolidated the (by now three) near-identical CSS overrides for the Mapbox hover conflict described
  above into two rules sharing one comment, instead of three each with their own. No visual change.
- Extracted the "close popover on outside click" pattern — previously written separately in
  `datepicker.js` and `main.js` — into a shared `onOutsideClick()` helper in a **new `js/dom.js` module**.

---

## 3. Open items / known issues

- Carried forward from file `a`, still true and still relevant:
  - Sandboxed dev-pane WebGL/animation-frame limitation, hit repeatedly again this stretch. Confirmed
    precisely this time (not just asserted): `map.easeTo({..., duration: 0})` updates camera state
    instantly and correctly in this pane, but the *default animated* `easeTo()` (no explicit duration)
    never completes — the pane's `requestAnimationFrame` loop doesn't reliably progress, so animated
    camera moves (both the compass buttons and the pre-existing 2D/3D button) never visibly resolve here.
    Established workarounds (still correct): `node --check` for syntax, dynamic `import()` + direct calls
    in `javascript_tool` to bypass the map-load gate, DOM/attribute-level checks even when the WebGL canvas
    itself won't composite, direct `curl` against deployed URLs, and asking the owner to confirm real
    visual/animation behavior in their own browser — say plainly when something wasn't (and couldn't be)
    visually confirmed here, rather than implying it was.
  - Mapbox token URL restrictions must include every Cloudflare Pages preview domain in use (currently
    `moonshot-et1.pages.dev`, auto-covers all its preview subdomains).
  - The path's time window still has no UI to narrow it (removed deliberately in v1.1.7).
  - `git push` still must go through the `aiceinc` collaborator account.
  - GitHub secret-scanning still false-positives on the Mapbox `pk.` token on any commit touching it.
  - Untested: moon-never-rises/sets fallback path, zero-valid-points state.
  - Out of scope, not built (brief §7): sun-alignment mode; the alignment algorithm still doesn't consult
    the now-real terrain/building data for occlusion (buildings/terrain render, but nothing about them
    feeds back into the path math).
- **New this stretch**: a transient Mapbox SKU-token 403 pattern (`sku=...` query param on
  `/v4/mapbox.mapbox-bathymetry-v2,...` tile requests) showed up repeatedly during this session's rapid
  local-preview reload cycles. Confirmed harmless/environmental, not a real regression: the style endpoint
  itself (`/styles/v1/mapbox/standard`) returned 200 with the same token via direct `curl` every time this
  was checked. Root cause is almost certainly SKU tokens being per-page-load ephemeral and not surviving
  the kind of aggressive same-tab reload-without-full-navigation this session did a lot of for testing —
  worth knowing so it's not re-diagnosed as a real bug next time it shows up in this same dev pane.
- `experiment/standard-style` branch (stale, pre-dates the real Standard-style work, safe to delete) — still
  not asked about, still exists.
- "Building render distance" is still not deliverable via Mapbox Standard's public API (only
  `show3dBuildings`/`show3dObjects`/`show3dFacades` visibility toggles exist, no LOD/distance control) —
  this was communicated to the owner directly this stretch (previously flagged in file `a` as still
  pending); considered closed now, no further action needed unless it comes up again.

---

## 4. Next steps (none pending; ideas)

1. Sun-alignment mode, occlusion-aware use of the real terrain/building data (brief's noted future
   enhancements).
2. Consider deleting the stale `experiment/standard-style` branch (owner still hasn't been asked).
3. The sidebar still has room for more than favourites (scoped as "future buttons/features" since v1.1.3).
4. Manually verify the two untested edge cases in §3 in a real browser at some point — this session's
   pane limitation means they've never been exercised end-to-end, only reasoned about.

Reminder: develop on `dev`, **push immediately after every commit — no confirmation needed**. Merging
`dev` → `main` needs the owner's go-ahead each time (this file's merge was one such explicit request).
Always `cat CNAME` after a merge, before pushing. Bump the `?v=` cache-bust string (footer version *and*
every local link/script/import specifier, including the new `js/dom.js`) on every release —
`[[project_moonshot_cache_busting]]`.

---

## 5. How the project works (architecture, pipeline, gotchas)

**Shape.** Unchanged: static, plain HTML/CSS/vanilla-JS ES modules, no framework, no bundler, no build
step. Astronomy Engine + Mapbox GL JS via CDN `<script>` globals (`Astronomy`, `mapboxgl`, v3.28.0).

**Files** (current full set; substantial changes since file `a` in bold). `index.html` — `.topbar` (brand +
tabs + **light/dark theme pill, reusing `.view-mode-control`/`.view-mode-btn`**) → `.controlbar` → `.layout`
→ `.site-footer`. `css/styles.css` — **`color-scheme` declared per theme; `--hover-wash`/`--footer-text(-
dim)`/`--scale-color` tokens; `--panel-bg` removed (redundant with `--bg`); `.view-mode-control` pill now
has a sliding `.view-mode-highlight` layer instead of per-button background; `.panel-date-grid`/`.pdg-*`
replace the old flat `.panel-facts` list for the 5 date rows; `.compass-*` styles for the new control;
consolidated Mapbox-hover-conflict overrides**. `js/config.js` — **`DEFAULT_MAP_ZOOM`/`PITCH`/`BEARING`/
`CENTER_OFFSET_LAT` for the opening camera; shared `DEG`/`RAD` exports (moved here from being duplicated in
alignment.js and map.js); `OBSERVER_ELEVATION_M` removed (dead)**. `js/astro.js` (unchanged behavior;
`MOON_QUARTER_NAMES` dead export removed). `js/alignment.js` (algorithm itself untouched since genesis;
now imports `DEG`/`RAD` from config.js instead of defining them locally). `js/map.js` — substantially
grown: **`MapControlsPanel` (merged legend+2D/3D+compass-toggle box, bottom-right, takes an
`onToggleCompass` callback), `CompassControl` (top-right, N/E/S/W + live heading readout), sliding-highlight
pill markup for both the 2D/3D and theme toggles, `setMapTheme()` (lightPreset day/night)**; still has path
rendering, virtual-point pillar, geocoding, building-height click reading (gated by the "Auto-set height"
toggle). `js/panel.js` — **`dateParts()`/`dateGridRow()` replace the old single-string date formatters;
time built from raw `Date` getters, not locale-string parsing**. `js/datepicker.js` (now uses the shared
`onOutsideClick()` helper). `js/favourites.js` (unchanged). `js/main.js` — **theme state + two-button
toggle wiring; initial camera center offset applied only at `createMap()` call, not to `state.landmark`;
marker now created synchronously right after `createMap()` (no longer inside `ready.then()`); uses
`onOutsideClick()` for the search-results dropdown**. **`js/theme.js`** (new in this stretch —
localStorage-backed light/dark preference). **`js/dom.js`** (new — currently just `onOutsideClick()`).
`CNAME` (main only) · `_headers` (dev only) · `fonts/` · `state/` · `.claude/launch.json`.

**The alignment algorithm** — unchanged since genesis, still pure geometry (doesn't consult terrain/
building data for occlusion).

**Site-wide theme** (new, v1.2.5) — `state.theme` (`'dark'`|`'light'`), persisted via `js/theme.js`,
applied by setting `data-theme` on `<html>`. `index.html` has a synchronous inline `<head>` script that
duplicates `theme.js`'s storage key deliberately (that module isn't loaded yet at that point) to avoid a
flash of the wrong theme. `setMapTheme(map, theme)` in `map.js` keeps the Mapbox Standard style's
`lightPreset` (day/night) in sync — called once after `'load'` and again on every toggle.

**The `.view-mode-control`/`.view-mode-btn` pill pattern** — now shared by three different controls (2D/3D,
theme, and indirectly informs the compass's button styling): a container with a sliding
`.view-mode-highlight` absolutely-positioned accent layer (`translateX(0)`↔`translateX(100%)` via an
`.is-second-active` class), two equal-width buttons layered above it. **Any future two-option toggle should
reuse this pattern** rather than inventing a new one — it already has the Mapbox-hover-conflict fix baked
in via the consolidated CSS override (see below).

**Mapbox base-CSS hover conflict** — `.mapboxgl-ctrl button:not(:disabled):hover { background-color: #eee
}` ships in Mapbox's own stylesheet and is more specific than a bare custom `:hover` rule on any button
living inside a `.mapboxgl-ctrl` container (it includes the `button` type selector). Any new custom button
control added to the map **must** include an extra ancestor class in its hover selector and must explicitly
restate `background-color` there — see the consolidated rule in `styles.css` (covers `.view-mode-btn` and
`.compass-btn` together) for the exact pattern and its comment.

**Compass control** (new, v1.2.11–v1.2.13) — `CompassControl` in `map.js`. Current final form: plain
N/E/S/W letters on a circular `.compass-face` dial (no degree ticks, no center dot — removed after initial
feedback), plus a `.compass-heading` readout below showing the live bearing normalized to 0–359°, both
inside one `.compass-control` container so the existing `setVisible()` toggle hides/shows them together
with no extra wiring. `MapControlsPanel` owns the show/hide checkbox and calls `compass.setVisible()` via
an `onToggleCompass` constructor callback — the two controls don't reach into each other's internals.

**Opening camera** — `DEFAULT_MAP_ZOOM`/`PITCH`/`BEARING` in `config.js` (currently 15.35 / 70 / 0), plus
`DEFAULT_MAP_CENTER_OFFSET_LAT` (~31m north), applied only to the camera passed into `createMap()` in
`main.js` — never to `state.landmark`, which stays the landmark's real coordinate for the marker, alignment
path, and favourites. The "3D" view-mode button's reset target (`pitch: 70, bearing: 0`) is kept manually in
sync with these defaults — if the defaults change again, update both places.

**Moon panel date grid** (new, v1.2.10) — `.panel-date-grid` (CSS Grid, `1fr repeat(6, max-content)`
columns) replaces the old flat `<dl>` list for the 5 date rows. `panel.js`'s `dateParts()` breaks each date
into weekday/month/day/year/time/meridiem pieces built from raw `Date` getters (not locale-string parsing
— that has a real cross-locale AM/PM-format bug, see §2), and `dateGridRow()` renders each as its own set
of grid cells so every field lines up vertically across rows like a table without a visible border.

**Deploy** — mechanically unchanged (`dev`→Cloudflare Pages, `main`→GitHub Pages, `CNAME`/`_headers`
split, `moonshot-et1.pages.dev` token allowlist entry covers all preview subdomains).

**Aesthetic / product intent.** Unchanged: personal, non-commercial tool; chrome consistency with
bendentremont.com is deliberate.

---

## 6. State-file protocol

- Files live in `state/`, named `moonshot_state_YYYYMMDD<letter>.md` (letter increments within a day:
  a, b, c…). **Latest = highest date, then highest letter** — read that one first.
- After a sizeable task, **write a NEW file** (name what it supersedes in the header). Don't edit old
  ones — each is an immutable snapshot; the trail is the history. **Carry §5 forward** (lightly updated)
  so the architecture context always rides with the latest file.

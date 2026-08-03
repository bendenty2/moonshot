# Moonshot — State File

**File:** `moonshot_state_20260802c.md`
**Date:** 2026-08-02
**Produced by:** Claude Code — three more dev-branch rounds after file `b` (chronological ordering + 1s
panel refresh + mobile spacing; full-date hover + permanent timestamp labels + removal of the path-window
UI and lock toggle; a label-rounding bugfix + favourites star toggle), then an owner-requested merge of
`dev` into `main`, promoting all of it to production. Versions v1.1.6 → v1.1.8.
**Supersedes:** `moonshot_state_20260802b.md`.

> **This is the single handoff doc.** `MOONSHOT_BRIEF.md` is the original product spec and stays put as
> a permanent reference (not retired). Read §1 for current status, §5 for how the project works. When you
> finish a sizeable task, write the next state file (protocol in §6) — don't edit this one; carry §5
> forward into it.

---

## 1. Current status

**`main`/production and `dev` are back in sync, both at v1.1.8.** Unlike file `b` (written when they'd
diverged), there is currently no gap — this file's owner explicitly asked to merge `dev` → `main` right
after v1.1.8 shipped, then asked for this state update. Confirmed live: `moonshot.bendentremont.com`
serving `v1.1.8` (polled via curl until the new footer version appeared, ~confirms GitHub Pages rebuild
completed).
- Standing instruction unchanged: push to `dev` immediately after every commit, no confirmation needed;
  merging to `main` still needs the owner's go-ahead each time (`[[feedback_dev_branch_autopush]]`
  memory) — this session's merge was requested explicitly, not assumed.
- The second `dev`→`main` merge in this project's history did **not** delete `CNAME` the way the first one
  did (see §3 for why) — don't assume every future merge will need a CNAME-restore step; check first.

---

## 2. What changed since `b` (v1.1.6 → v1.1.8)

### v1.1.6 — chronological ordering, 1s panel refresh, mobile spacing
- **"Next moonrise"/"Next moonset" and "Next full moon"/"Next new moon" now sort chronologically**
  (soonest first) on every render (`js/panel.js` `chronological()`), instead of a fixed HTML order. Fixes
  full/new moon displaying backwards, and makes the rise/set pair visibly swap places once the sooner one
  passes and the panel recomputes past it.
- **Panel refresh split from path refresh**: new `PANEL_REFRESH_MS = 1000` drives just the moon-info panel
  (cheap, ~10 Astronomy Engine calls); `LIVE_REFRESH_MS` (still 10s) keeps driving the heavier path/window
  recompute. This made the separate v1.1.5 clock-only ticker redundant (whole panel re-renders every
  second anyway) — it was deleted.
- **Mobile control bar** (≤720px, wraps to 2+ rows): padding `12px`→`16px 12px`, gap `24px`→`16px`
  (uniform), so wrapped rows read as evenly spaced instead of sandwiched against the bar's own edges.

### v1.1.7 — full-date hover, permanent timestamp labels, big UI cleanup
- Hover tooltip (`js/map.js` `formatTooltipTime`) gained `month`/`day` — was weekday-only before, now
  e.g. "Sun, Aug 2, 9:31:45 PM".
- **New always-visible timestamp-label symbol layer**, separate from the per-2-min arrow layer — see
  v1.1.8 below, this version's implementation had a real bug that got fixed one version later.
- **Removed the "Path window" start/end override UI entirely** (the `<input type="time">` pair + "N
  alignment points..." status text, introduced in v1.1.3). The *underlying* `state.pathStart`/`pathEnd`
  computation (`moonUpWindow`-driven) is untouched — only the manual-override UI and its wiring
  (`applyTimeToDate`, `toTimeInputValue`, `pad2`, `state.pathBoundsCustomized`) are gone. There is
  currently **no way to narrow the path's time window from the UI** — it's always exactly the natural
  moonrise-to-moonset interval (or the owner's chosen time mode's version of that).
- **Removed the lock-location toggle entirely** (UI, state, CSS, the `onMapClick` guard) — map clicks
  always place the landmark now, unconditionally.
- Favourites edit (pencil icon) extended to cover height value + unit alongside the name, via a small
  `<form>`-based inline editor (`js/favourites.js` `startEdit`) built with DOM APIs rather than template-
  string HTML, specifically so an arbitrary favourite name can never break out of an attribute value.

### v1.1.8 — timestamp-rounding bugfix + favourites star toggle
- **Fixed the v1.1.7 timestamp labels**: they were computing minutes elapsed *since the path's own
  arbitrary start time* (e.g. an exact moonrise second like 11:21:xx) and filtering for multiples of 10 —
  so labels read 11:31, 11:41, 11:51 instead of clean marks. Root cause: with a fixed 2-min sample step
  from a non-round start instant, samples can structurally never land exactly on a real round-10-minute
  clock mark. Fix (`timestampLabelsToGeoJSON` in `js/map.js`): compute every *real* 10-min mark
  (`:00`/`:10`/`:20`/…) spanned by the path, find the nearest sample to each, and label that point with
  the **rounded mark's** text — not the sample's own slightly-off time. Verified against a synthetic path
  starting at `22:23:47` — now correctly emits `10:30 PM, 10:40 PM, ..., 12:20 AM`.
- **"Set Favourite" button replaced with a star icon** next to the "Favourites" heading
  (`#favourite-star-btn`, outline `☆` / filled `★`). New `state.activeFavouriteId`, cleared to `null` (and
  the star un-filled) on: any landmark change *not* originating from selecting a favourite (map click,
  marker drag, search select — `setLandmark`'s new `fromFavourite` option distinguishes this), and any
  target-height value **or** unit change. Set (and the star filled) when: a favourite is selected from the
  list, or the star itself is clicked while unfilled (which also saves current location+height as a new
  favourite). Clicking an already-filled star is a no-op. Removing the currently-active favourite also
  clears it. `favourites.js`'s `renameFavourite` was generalized to `updateFavourite(list, id, updates)`
  to support this (and the v1.1.7 height-editing) with one function.

---

## 3. Open items / known issues

- **Second merge didn't need a CNAME restore, unlike the first — here's why, so it's not re-diagnosed as
  a regression.** The first `dev`→`main` merge deleted `CNAME` because, relative to the *original*
  divergence point (back when `dev` was branched off `main`, both still had `CNAME`), `dev`'s history
  contains a real deletion of it (`git rm CNAME`, done when setting up the dev/main split) while `main`
  never touched it — git auto-applies that deletion on merge. After that first merge, `CNAME` was restored
  on `main` via its own commit. For *this* (second) merge, the merge-base shifted forward to that first
  merge point — relative to *that* base, `main` gained `CNAME` (the restore commit) while `dev` still never
  touches the file at all (no change, not a deletion, since the base itself already lacked it on dev's
  side). No conflicting change → nothing to auto-delete. **Bottom line: check `cat CNAME` after every
  merge regardless** (still generically prudent), but don't be surprised if a given merge doesn't actually
  need a restore — it depends on the merge-base, not on some fixed rule.
- **The path's time window currently has no UI to narrow it** (see v1.1.7 above) — it's always the full
  natural moonrise-to-moonset span. If the owner asks for this back in some form, note that the *removal*
  was deliberate/explicit ("we don't need it"), not an oversight — don't just silently re-add the old UI;
  confirm what they actually want narrowed and why before designing it.
- Carried forward from file `b`, still true and still relevant:
  - Sandboxed dev-environment gotchas (Mapbox `'load'`/WebGL frequently not firing since the preview pane
    doesn't always composite frames; the static file server's lack of cache-busting requiring
    `fetch(f, {cache:'reload'})` priming before checking a JS/CSS change; CSS transitions never
    ticking in this pane, making `getComputedStyle` mid-transition checks misleading). All still hit
    repeatedly this round (e.g. mid-transition lock-toggle check earlier — now moot since that feature's
    gone, but the general gotcha still applies to any other transitioning element). When something can't
    be verified live in this pane, prefer: (a) exporting/reproducing the pure logic standalone in Node, or
    (b) bypassing the map-load gate via dynamic `import()` + direct function calls in `javascript_tool`.
  - `git push` still must go through the `aiceinc` collaborator account.
  - GitHub secret-scanning still false-positives on the Mapbox `pk.` token on any commit that touches it.
  - Untested: moon-never-rises/sets fallback path, zero-valid-points state (no dedicated UI message for
    this anymore since `renderPathStatus` was deleted in v1.1.7 — the path would just render as an empty
    line with no explanation if this is ever hit; worth knowing if the owner reports a "blank map" bug).
- Out of scope, not built (brief §7, unchanged): terrain/building occlusion, sun-alignment mode.

---

## 4. Next steps (none pending; ideas)

1. Terrain-aware occlusion, sun-alignment mode (brief's noted future enhancements).
2. Manually verify the two untested edge cases in §3.
3. The sidebar still has room for more than favourites (explicitly scoped as "future buttons/features"
   when created in v1.1.3) — no specific ask yet.
4. If the owner ever wants to narrow the path's window again, design it fresh rather than resurrecting the
   removed start/end-time UI verbatim (see §3).

Reminder: develop on `dev`, **push immediately after every commit — no confirmation needed**. Merging
`dev` → `main` needs the owner's go-ahead each time (this file's merge was one such explicit request).
Always `cat CNAME` after a merge, before pushing — see §3 for why it won't always need restoring.

---

## 5. How the project works (architecture, pipeline, gotchas)

**Shape.** Unchanged: static, plain HTML/CSS/vanilla-JS ES modules, no framework, no bundler, no build
step. Astronomy Engine + Mapbox GL JS via CDN `<script>` globals (`Astronomy`, `mapboxgl`).

**Files** (current full set; changed from file `b` in bold). `index.html` — `.topbar` → `.controlbar`
(search, target-height+unit-toggle, max-distance-km, Now/Next-Full-Moon/Custom-Date-calendar) →
`.layout` (`.sidebar-pane` [**just a `.sidebar-section` with a header row: "Favourites" heading + star
button, then the list — no more lock toggle, no more Set Favourite button**] + `#map` + `.panel-pane`
[**just `#moon-panel` — no more Path window section**]) → `.site-footer`. `css/styles.css` — black theme,
self-hosted DM Sans, flexbox column body. `js/config.js` (token + defaults; **`PANEL_REFRESH_MS` new,
`LIVE_REFRESH_MS` retained for the slower path cycle**). `js/astro.js` (Astronomy Engine wrapper +
`moonUpWindow`, unchanged). `js/alignment.js` (unchanged since genesis — Section-2 ray-cast algorithm
itself has never been touched by any UI/UX work). `js/map.js` (map init, marker, click, path rendering:
hit-line + visible solid-color line + per-2-min arrow symbol layer + **new permanent per-10-min timestamp
label symbol layer** + cursor-following hover tooltip **now with full date**; geocoding). `js/panel.js`
(`computeMoonInfo`, `renderMoonPanel` **with chronological rise/set + phase ordering**, `formatExactTime`,
cardinal-direction helper; **`renderPathStatus` deleted**). `js/datepicker.js` (unchanged). `js/
favourites.js` (**`renameFavourite` generalized to `updateFavourite`; `startRename` replaced by `startEdit`
covering name+height+unit via a `<form>` built with DOM APIs**). `js/main.js` (orchestration; **state
object: `pathBoundsCustomized` and `locationLocked` removed, `activeFavouriteId` added; two intervals —
1s panel-only, 10s path/window**). `CNAME` (main only) · `_headers` (dev only) · `fonts/` · `.claude/
launch.json`.

**The alignment algorithm** — unchanged since genesis (file `a`'s §5 has the full formula walkthrough;
not re-derived here since nothing about it has changed across any of v1.1.1–v1.1.8).

**Time windows** — unchanged mechanism from file `b` (`getReferenceDate()` + `moonUpWindow()` →
`state.pathStart`/`pathEnd`). What changed is that these bounds are **no longer user-editable** — v1.1.7
removed the UI that let you narrow them via `<input type="time">`. The moon info panel is still always
computed from real "now", decoupled from whichever time mode drives the path.

**Hover system** — unchanged mechanism from file `b` (plain DOM tooltip following `e.point.x/y`, not
Mapbox's `Popup`); the tooltip's date format gained month/day in v1.1.7.

**Permanent timestamp labels** (new, `js/map.js` `timestampLabelsToGeoJSON`) — separate symbol layer from
the direction arrows. Finds every true round `LABEL_INTERVAL_MIN`-minute clock mark (currently 10)
spanned by the path, picks the nearest actual sample to each mark, and labels that point with the
**rounded mark's** text (not the sample's own time) — see v1.1.8 above for why this matters. `text-size`
is a `['interpolate', ['linear'], ['zoom'], ...]` expression for smooth zoom-scaling; `text-allow-overlap:
false` lets Mapbox's own collision handling thin labels out at low zoom rather than jumbling.

**Favourites star** (new, `js/main.js` + `js/favourites.js`) — `state.activeFavouriteId` tracks whether
the *current* landmark+height state matches a saved favourite. `setLandmark(landmark, {flyTo,
fromFavourite})`'s new `fromFavourite` flag is the key distinction: favourite-selection calls it `true`
(star stays/becomes filled); every other landmark-changing path (map click, drag, search) omits it
(defaults `false`, star clears). Height/unit changes clear it directly in their own input handlers. If you
add a new way to change landmark or height in the future, remember to think about whether it should clear
`activeFavouriteId` — the pattern isn't automatic/derived, it's manually wired at each mutation site.

**Deploy** — mechanically unchanged (`dev`→Cloudflare Pages, `main`→GitHub Pages, `CNAME`/`_headers`
split) — see §1/§3 for this file's specific merge and the CNAME nuance.

**Aesthetic / product intent.** Unchanged: personal, non-commercial tool; chrome consistency with
bendentremont.com is a deliberate choice, not incidental.

---

## 6. State-file protocol

- Files live in `state/`, named `moonshot_state_YYYYMMDD<letter>.md` (letter increments within a day:
  a, b, c…). **Latest = highest date, then highest letter** — read that one first.
- After a sizeable task, **write a NEW file** (name what it supersedes in the header). Don't edit old
  ones — each is an immutable snapshot; the trail is the history. **Carry §5 forward** (lightly updated)
  so the architecture context always rides with the latest file.

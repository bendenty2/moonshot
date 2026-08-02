# Moonshot — State File

**File:** `moonshot_state_20260802a.md`
**Date:** 2026-08-02
**Produced by:** Claude Code — built v1 end to end from `MOONSHOT_BRIEF.md`: astronomy wrapper, alignment
path algorithm, Mapbox map + control bar, live moon info panel; then wired up production + dev
deployment (GitHub Pages / Cloudflare Pages) and DNS.
**Supersedes:** none — first state file.

> **This is the single handoff doc.** `MOONSHOT_BRIEF.md` is the original product spec (landmark
> alignment problem, algorithm, UI spec) and stays put as a permanent reference — it is NOT retired the
> way Ben's Place's onboarding brief was. Read §1 for current status, §5 for how the project works. When
> you finish a sizeable task, write the next state file (protocol in §6) — don't edit this one; carry §5
> forward into it.

---

## 1. Current status

**v1 shipped and live.**
- **Production (`main` → GitHub Pages → `moonshot.bendentremont.com`): LIVE.** Verified working by the
  owner in a real browser — map, marker, path, and panel all render correctly.
- **Dev preview (`dev` → Cloudflare Pages → `dev.moonshot.bendentremont.com`): LIVE**, `noindex`'d via
  `_headers`.
- Covers brief build-order steps 1–5 in full, and step 6 partially (responsive layout + hover timestamp
  labels done; extreme-latitude/no-rise-set edge cases not yet manually verified — see §3).
- Mapbox token is a dedicated public (`pk.`) token, URL-restricted to both live domains + localhost.

---

## 2. What's been built (genesis — no prior state file to diff against)

- **`js/astro.js`** — thin wrapper around the global `Astronomy` object (astronomy-engine 2.1.19, UMD
  browser build via CDN): topocentric moon azimuth/altitude (`moonHorizontal`), illumination fraction,
  named phase + waxing/waning (`moonPhaseName`, bucketed off `Astronomy.MoonPhase()`'s 0–360° angle),
  nearest rise/set (`nextMoonRiseSet`), next full/new moon (`nextFullMoon`/`nextNewMoon`, walks
  `SearchMoonQuarter`/`NextMoonQuarter` to the target quarter).
- **`js/alignment.js`** — the brief's Section 2 ray-cast algorithm. For each time step: get the moon's
  az/alt from the landmark; bearing = `az + 180°` (opposite the moon); distance = `targetHeight /
  tan(altitude)`; reject if `altitude ≤ 0` or `distance > maxDistance`; project landmark → candidate
  point using the **accurate spherical destination-point formula** (bearing + distance), not a flattened
  approximation — only the elevation-angle relationship itself ignores Earth's curvature, which is the
  brief's actual documented v1 simplification (Section 6).
- **`js/map.js`** — Mapbox GL JS (v3.27.0, CDN) wrapper: `createMap` returns `{map, ready}` (`ready`
  resolves on the `'load'` event); draggable click-to-place marker; `renderAlignmentPath` adds/updates
  GeoJSON line + circle layers with hover popups (timestamp, distance, moon altitude); `geocode()` is a
  raw `fetch` against the Mapbox Geocoding API v5 (not the `mapbox-gl-geocoder` plugin), so the search
  box lives in the control bar per the UI spec instead of floating on the map.
- **`js/panel.js`** — `computeMoonInfo` + `renderMoonPanel` + `renderPathStatus` for the moon info panel.
- **`js/main.js`** — orchestration. Single mutable `state` object (landmark, target height ft, max
  distance mi, time mode, custom date). **Key design point: the moon panel always reflects live
  real-world "now," decoupled from whichever time window is selected for the alignment path.**
  `getSearchWindow()`: `'now'` mode = `[now, now+24h]`; `'fullmoon'`/`'custom'` = center ± 12h. A 60s
  interval refreshes the panel always, and the path too if still in `'now'` mode.
- **`index.html` / `css/styles.css`** — plain static shell, no build step, no framework (mirrors Ben's
  Place philosophy exactly): control bar (search, target height, max distance, Now/Next Full
  Moon/custom datetime) + 2/3 map + 1/3 panel, dark theme, responsive at 720px.
- **Deployment**: repo `bendenty2/moonshot`, `main` → GitHub Pages (`CNAME` = `moonshot.bendentremont.com`,
  lives only on `main`), `dev` → Cloudflare Pages (`_headers` forces `noindex`, lives only on `dev`).
  Canonical tag in `index.html` always points at production. Local dev server config at
  `.claude/launch.json` (`python -m http.server 8099`).

---

## 3. Open items / known issues

- **The path is often much longer than the brief's "roughly hour-long, near moonrise/moonset" framing
  suggests.** With a tall target height (the ~1900–2000 ft default) and a generous max distance (5 mi
  default), a valid alignment point exists almost anytime the moon is above the horizon — distance just
  shrinks as altitude climbs (e.g. ~780 m at 36° altitude vs. ~8 km at 4°), rather than becoming invalid.
  Confirmed in production: a real run produced 364 points spanning ~12 hours. This is mathematically
  correct per the literal Section 2 algorithm, not a bug. **Owner's explicit call: leave as-is** — the
  long path is arguably more useful (every valid shooting spot/time, not just the ends) and the hover
  timestamps already let you find the moonrise/moonset segments. No min-distance filter was added. If
  this becomes annoying in practice, the fix is a "min distance" control mirroring "max distance" in
  `config.js`/the control bar.
- **Untested edge cases**: moon never rises/sets that day (extreme latitudes), and the "no valid
  alignment point in this window" UI state (`renderPathStatus` handles zero points in code, but hasn't
  been exercised with real inputs that actually hit it).
- **This session's automated browser-preview tool (Claude Browser pane) could not reliably verify
  Mapbox's WebGL rendering** — the map's `'load'` event depends on the pane actually compositing frames,
  and the sandboxed pane often wasn't displayed, so `'load'` never fired and downstream UI (marker,
  panel, path) never rendered in-tool. Real verification happened in the owner's own browser. Don't
  re-litigate this — if you need to verify Mapbox rendering, ask the owner to check in their own browser
  rather than trusting the automated pane's screenshot/console tools for this project.
- **`git push` from this machine must go through the `aiceinc` GitHub account.** The machine's cached
  Git credentials authenticate as `aiceinc`, not `bendenty2` (which owns the repo). Rather than switching
  cached credentials per-project, `aiceinc` was added as a Write collaborator on `bendenty2/moonshot`.
  Pushes work through that identity; no further action needed unless collaborator access is revoked.
- **GitHub secret-scanning flagged the Mapbox token as a "Secret Access Token" on first push** — a known
  false positive: GitHub's Mapbox partner pattern doesn't distinguish `pk.` (public) from `sk.` (secret)
  tokens, and Mapbox's own backend enforces that a `pk.`-prefixed token cannot carry secret scopes
  regardless. Owner unblocked it via the repo's secret-scanning allowlist. Expect this to resurface if
  the token is ever rotated/replaced in a new commit — same resolution applies.
- Out of scope, not built (per brief §7, unchanged): terrain/building occlusion, sun-alignment mode,
  accounts/persistence.

---

## 4. Next steps (none pending; ideas)

1. Optional: min-distance control if the wide-path behavior (see §3) turns out to be a real annoyance.
2. Terrain-aware occlusion (brief's suggested future enhancement, §6).
3. Sun-alignment mode (brief §7, explicitly out of v1 scope).
4. Optional: localStorage for saved locations (brief §6, "nice future add-on").
5. Manually verify the two untested edge cases in §3 (no-rise-set day; zero valid points).

Reminder: develop on `dev`, push, verify at `dev.moonshot.bendentremont.com`, then merge `dev` → `main`
to publish to `moonshot.bendentremont.com` (GitHub Pages auto-deploys on push to `main`). Verify `CNAME`
survives the merge — it lives only on `main`.

---

## 5. How the project works (architecture, pipeline, gotchas)

**Shape.** A **static** site — plain HTML/CSS/vanilla JS (ES modules), no framework, no bundler, no
server, no build step at all (not even Ben's Place's `build.py` — Moonshot has no generated assets).
Astronomy Engine and Mapbox GL JS are loaded via CDN `<script>` tags as browser globals (`Astronomy`,
`mapboxgl`); Moonshot's own `js/*.js` files are ES modules (`type="module"`) that reference those
globals. Keep this model — no framework/bundler without explicit say-so.

**Files.** `index.html` (control bar + `#map` + `#moon-panel` shell, CDN script tags, canonical tag) ·
`css/styles.css` (dark theme, flex control bar, 2/3-map + 1/3-panel layout, 720px responsive breakpoint)
· `js/config.js` (Mapbox token + tunable defaults: `DEFAULT_LANDMARK`, `DEFAULT_TARGET_HEIGHT_FT`,
`DEFAULT_MAX_DISTANCE_MI`, `PATH_STEP_MINUTES`, `LIVE_REFRESH_MS`, unit-conversion helpers) ·
`js/astro.js`, `js/alignment.js`, `js/map.js`, `js/panel.js`, `js/main.js` (see §2 for each's role) ·
`CNAME` (main branch only) · `_headers` (dev branch only) · `.claude/launch.json` (local static-server
config for the Claude Browser preview tool).

**The alignment algorithm, precisely** (`js/alignment.js`, implementing brief §2). One `Astronomy.Observer`
is built at the landmark's lat/lon/0m (parallax across a few km is negligible for the moon at ~384,000 km,
so a single reference point per time step is correct, not an approximation). Per time step: `moonHorizontal()`
→ `{azimuth, altitude}`; skip if `altitude ≤ 0`; `distanceM = targetHeightM / tan(altitude)`; skip if
non-finite, ≤0, or `> maxDistanceM`; `bearing = (azimuth + 180) % 360`; project landmark → candidate point
via the standard spherical destination-point formula (`asin`/`atan2` on bearing + angular distance) — this
part is exact, not flattened. The only real "flat/simplified geometry" (brief's documented v1 scope
decision) is that the elevation-angle relationship itself (`atan(height/distance)`) ignores Earth's
curvature over that distance.

**Time windows** (`js/main.js` `getSearchWindow()`). The moon info panel is **always** computed from the
actual current time, regardless of the selected time mode — it's a "what's the sky doing right now"
readout, decoupled from the alignment path's time selection. The path's window: `'now'` → `[now,
now+24h]`; `'fullmoon'` → next full moon time ± 12h; `'custom'` → the picked date/time ± 12h. A 60s
interval keeps the panel fresh always, and re-runs the path too only while in `'now'` mode.

**Map layer** (`js/map.js`). `createMap()` returns `{map, ready}`; `ready` is a promise resolving on
Mapbox's `'load'` event — **all marker/path/click-handler setup in `main.js` is gated behind this**, so
if the map never visibly loads (bad token, no network, or — in this sandboxed dev environment — the
preview pane not compositing frames), nothing downstream will either. `renderAlignmentPath()` is
idempotent: first call adds the GeoJSON sources/layers, later calls just `setData()`. Geocoding is a
direct `fetch` to `api.mapbox.com/geocoding/v5/mapbox.places/...json` (not the geocoder plugin), giving
full control over placing the search UI inside the control bar per the brief's layout spec.

**Deploy.** `dev` → Cloudflare Pages (`dev.moonshot.bendentremont.com`); `main` → GitHub Pages
(`moonshot.bendentremont.com`). Exactly mirrors the `bendentremont.com` project's split: **`CNAME` lives
only on `main`, `_headers` lives only on `dev`** — always check both survive/stay separated after a
merge, before pushing. Cloudflare Pages project's production branch is set to `dev` (not the default
`main`) specifically so it serves the dev subdomain, not production. GitHub push protection flagged the
Mapbox token as a false-positive secret on first push (see §3) — expect this again on any future commit
that changes the token.

**Aesthetic / product intent.** A personal, non-commercial tool — "path of totality, but for
moon-behind-landmark photography." North star: the brief's algorithm (§2) and UI spec (§3) as written.
No accounts, no persistence, no terrain modeling in v1 — preserve that scope without a fresh ask.

---

## 6. State-file protocol

- Files live in `state/`, named `moonshot_state_YYYYMMDD<letter>.md` (letter increments within a day:
  a, b, c…). **Latest = highest date, then highest letter** — read that one first.
- After a sizeable task, **write a NEW file** (name what it supersedes in the header). Don't edit old
  ones — each is an immutable snapshot; the trail is the history. **Carry §5 forward** (lightly updated)
  so the architecture context always rides with the latest file.

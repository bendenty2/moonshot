# Moonshot — Project Brief

## 1. What this is

A personal (non-commercial) web tool that shows exactly when and where to stand to photograph a specific landmark with the moon positioned directly behind/above it. Think of the "path of totality" maps used for solar eclipses, but for moon-behind-landmark alignments: as the moon moves across the sky, the one spot on the ground where it lines up perfectly with the landmark also moves, tracing a curved, timestamped path on a map.

This is a standalone project, separate from `bendentremont.com` (the "Ben's Place" site). It lives in its own folder (`Moonshot`) and will be handed to its own Claude Code project — not the Ben's Place one. It should reuse the general build philosophy of Ben's Place (static site, deployed on Cloudflare) but is otherwise an independent codebase, repo, and (eventually) domain. Domain selection is out of scope for this brief and can be decided later (options include a new domain or a subdomain of the existing one).

## 2. The core problem, precisely stated

Given:
- A **landmark** with a lat/lon and a **virtual target point** at that lat/lon, sitting at a chosen elevation above sea level (e.g. ~1900 ft for a point just above the CN Tower's spire, so the full moon reads as sitting just above it rather than behind the structure itself).
- A **time window** (e.g. the evening of the next full moon).

Find, for each moment in time, the point(s) on the ground from which a straight line through the observer's eye and the virtual target point continues on to the moon's actual position in the sky. Plot that set of points as a path, with each point labeled with the timestamp at which it's valid.

### Why this path is naturally short and near moonrise/moonset

The virtual target point sits only a few hundred meters above the landmark's base at most. For an observer standing any real photographic distance away (hundreds of meters to a few kilometers), the *elevation angle* up to that target point is small — a couple of degrees at most. That angle only matches the moon's actual elevation angle when the moon itself is low in the sky — i.e., near moonrise or moonset. So the interesting/valid part of the path is generally a roughly hour-long window around moonrise or moonset, not an all-night affair. This matches how moon-behind-landmark photos are actually shot in practice, and it's a useful sanity check on the math.

### Recommended algorithm (v1, flat/simplified geometry — see Section 6 on scope)

For each time step `t` within the search window:

1. Compute the moon's **topocentric azimuth** `Az_moon(t)` and **altitude** `Alt_moon(t)` as seen from roughly the landmark's location (parallax from a few km of horizontal offset is negligible for the moon at ~384,000 km, so a single reference point per iteration is fine — no need to re-derive topocentric position per candidate point).
2. The observer must be positioned so that looking toward the landmark, the moon is directly beyond it — meaning the observer lies on the ray starting at the landmark and pointing in the direction **opposite** the moon's azimuth (`Az_moon(t) + 180°`).
3. Walk out along that ray to find the distance `d` at which the elevation angle to the virtual target point equals the moon's altitude:
   `atan(target_height_above_observer / d) = Alt_moon(t)` → solve for `d`.
   (`target_height_above_observer` = virtual point elevation minus observer's assumed eye-level elevation, roughly sea level unless local terrain data is added later.)
4. That gives a single candidate point `P(t)` for this timestamp. Reject/skip points where `Alt_moon(t) ≤ 0` (moon below horizon) or where `d` falls outside a sane photographic range (e.g., discard if the moon would appear either absurdly tiny or the shot impractically far away — expose this as a configurable max distance, not a hardcoded limit).
5. Repeat across the time window at a reasonable step size (e.g., every 1–2 minutes) to trace the full path. Attach the timestamp to each point for display.

This produces a continuous, timestamped curve that updates whenever the landmark location, virtual point elevation, or time window changes — exactly the "recompute on input change" behavior described in the UI spec below.

**Note for the implementer:** this is the recommended starting approach, not gospel — if a cleaner closed-form or iterative refinement emerges during implementation (e.g., accounting for Earth's curvature at longer distances), that's a reasonable improvement, but flat-geometry is an acceptable v1 simplification per the scope decisions below.

## 3. UI specification

**Layout:** left two-thirds of the screen is the map. Right one-third is the moon info panel. Above both, a control bar.

### Control bar (top, full width)
- **Left side:** location search box (see Section 4 — geocoding). Typing a place/address/landmark name resolves to coordinates and recenters the map.
- **Also in this area:** a numeric input for the **virtual point elevation** (feet or meters, user's choice — pick one and be consistent), which is used as the target height in the alignment calculation.
- **Right side, next to the location bar:** time controls —
  - Defaults to **"Now"** (current real-world date/time).
  - A **"Next Full Moon"** button that jumps the time window to the upcoming full moon and immediately recomputes/shows that alignment path.
  - A way to pick an **arbitrary custom date/time** (date-time picker), so the user isn't limited to just "now" or "next full moon."
  - These are togglable — switching between them should feel instant and just re-run the same computation with a different time window.

### Map (left two-thirds)
- Square aspect, fills most of the screen by default.
- Built on **Mapbox GL JS** (vector tiles, smooth pan/zoom, good default styling). Requires a Mapbox access token — use a public token restricted to your domain(s); safe to ship client-side.
- Standard pan and zoom.
- Always displays the current alignment path as an overlay: a curved line/series of points across the relevant time window, each point labeled with its timestamp (on hover or as a lightweight always-visible label — implementer's call on the exact interaction, but timestamps must be inspectable).
- The path recomputes automatically whenever: the location/landmark changes, the virtual point elevation changes, or the time selection changes (now / next full moon / custom).
- Clicking directly on the map should also be a valid way to (re)place the landmark point, in addition to the search box.

### Moon info panel (right one-third)
Live/current details about the moon, including at minimum:
- Current phase (name, e.g. "Waxing Gibbous") and percent illumination.
- Next moonrise and moonset (for the currently selected map location).
- Next full moon date/time.
- Next new moon date/time.
- (Nice to have, low cost to add given the library: current moon azimuth/altitude, moon distance.)

## 4. Location search / geocoding

Use **Mapbox's Geocoding API** (forward geocoding: place name/address → coordinates) rather than standing up a separate geocoding provider — this keeps everything on a single Mapbox account/token and avoids managing a second API key. Free tier covers 100,000 requests/month, which is far more than a personal-use tool will ever need.

## 5. Astronomical calculations

Use the **Astronomy Engine** library (`astronomy-engine` on npm, MIT-licensed, by Don Cross — JS/TypeScript native). It directly supports everything this project needs:
- Topocentric moon azimuth/altitude for a given observer lat/lon/elevation and time (`Horizon()`).
- Moon illumination fraction and phase (`Illumination()`, `MoonPhase()`).
- Searching for the next full/new moon and quarter phases (`SearchMoonQuarter()` and related search functions).
- Rise/set time search for the moon at a given location (`SearchRiseSet()`).

This avoids hand-rolling orbital mechanics and gives accurate, well-tested results for all the "moon info panel" data and the alignment path math in Section 2.

## 6. Architecture and scope decisions (already made)

- **Fully static, client-side only.** All astronomy math and path computation runs in-browser JS. No backend/server component. Deploy as a static site on Cloudflare Pages, mirroring the Ben's Place deployment style. The Mapbox token is the only "secret," and it's safe to expose client-side when domain-restricted in the Mapbox dashboard.
- **Geocoding:** search-box based, using Mapbox Geocoding (Section 4) — not manual-coordinates-only.
- **Terrain:** v1 uses simplified flat/smooth-Earth geometry — no terrain elevation data, no line-of-sight obstruction checks against hills or buildings. This is a known simplification; terrain-aware occlusion (e.g., via an elevation API) is a reasonable **future enhancement**, not a v1 requirement.
- **No accounts, no persistence.** This is a single-session tool for personal use — no login, no saved locations/history required for v1 (could be a nice future add-on using local storage, but not required).

## 7. Explicitly out of scope for v1

- Terrain/building occlusion modeling.
- Sun-alignment mode (same idea but for the sun instead of the moon) — plausible future extension, not v1.
- Mobile native app — a responsive web layout is sufficient; no app-store deliverable.
- Multi-user accounts, saved trips, sharing/export features.
- Domain name selection and DNS setup — decide separately once the tool is built.

## 8. Suggested build order

1. Static shell with Mapbox map + control bar layout (no astronomy yet).
2. Wire up Astronomy Engine: moon info panel showing live phase/illumination/rise-set/next full/new moon for the map's current center.
3. Implement the alignment path algorithm (Section 2) for a fixed test case (e.g., CN Tower, ~1900 ft target elevation, next full moon) and verify the traced path looks physically sane (near moonrise/moonset, curving smoothly).
4. Wire the virtual point elevation input and location search/click-to-place into the path recomputation.
5. Wire the time controls (Now / Next Full Moon / custom date-time) into the same recomputation path.
6. Polish: timestamp labels on the path, responsive layout, loading/edge-case states (e.g., moon never rises/sets that day at extreme latitudes, or no valid alignment point exists within the max-distance bound).

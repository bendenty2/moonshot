// Moonshot configuration.
//
// Dedicated public token for Moonshot, URL-restricted in the Mapbox dashboard
// (console.mapbox.com/account/access-tokens) to moonshot.bendentremont.com,
// dev.moonshot.bendentremont.com, moonshot-et1.pages.dev (covers every
// Cloudflare Pages preview branch, via Mapbox's automatic subdomain
// matching), and localhost.
export const MAPBOX_TOKEN = 'pk.eyJ1IjoiYmVuZGVudHJlbW9udCIsImEiOiJjbXNjMjlraDkxaXJiMzVwcGozMnFuNXJ2In0.b3E8CuU6PSuqgm0engM3Vw';

// Switched from the classic dark-v11 style to Standard (native 3D
// buildings, dynamic lighting via lightPreset, actively maintained by
// Mapbox — dark-v11 and other "classic" styles are not). See map.js for
// the lightPreset/theme/label-toggle config wired on top of this.
export const MAPBOX_STYLE = 'mapbox://styles/mapbox/standard';

// Default landmark shown on first load: CN Tower, Toronto.
export const DEFAULT_LANDMARK = {
  name: 'CN Tower',
  lat: 43.6426,
  lon: -79.3871,
};

// The map's initial camera — a tilted 3D framing of the default landmark
// (rather than a flat top-down start). Bearing 0 faces exactly north.
// Pitch raised from the view-mode "3D" button's 60 to a shallower
// (more horizon-level, less overhead) 70 per owner feedback. Zoom pulled
// back slightly from 15.5 -> 15.35 per a follow-up "just a bit more" nudge.
export const DEFAULT_MAP_ZOOM = 15.35;
export const DEFAULT_MAP_PITCH = 70;
export const DEFAULT_MAP_BEARING = 0;

// A small camera-only nudge north of the landmark's real coordinate, so
// the tilted opening view sits the tower a little closer to the viewer
// instead of exactly on the pitch's natural center line — "shifted
// slightly towards the CN Tower" per owner feedback, increased once
// (0.00018 -> 0.00028, ~20m -> ~31m) on a follow-up "slightly more" nudge.
// Deliberately only applied to the initial camera's center (see main.js),
// not to state.landmark itself: the marker, path algorithm, and favourites all
// still need the landmark's true, unshifted coordinate.
export const DEFAULT_MAP_CENTER_OFFSET_LAT = 0.00028; // ~31m north

// Virtual target point elevation, in feet above the landmark's base.
// ~1900 ft puts a full moon reading just above the CN Tower's spire — the
// standard opening location + height the app always starts at. From here,
// height only changes via picking a favourite or a manual edit, unless the
// "Set height on click" legend toggle (see map.js) is switched on.
export const DEFAULT_TARGET_HEIGHT_FT = 1900;

// Observer eye-level elevation above sea level. v1 assumes flat terrain
// at sea level (see brief section 6) rather than looking up local ground elevation.
export const OBSERVER_ELEVATION_M = 0;

// How far from the landmark we'll search for a valid alignment point, in km.
// Configurable rather than hardcoded — exposed as a control-bar input.
export const DEFAULT_MAX_DISTANCE_KM = 8;

// Slider bounds for the target-height control. Independently chosen per
// unit (not a mathematical conversion of one another — 2000 ft and 600 m are
// each a separately-picked "sane useful range" for that unit).
export const TARGET_HEIGHT_RANGE = {
  ft: { min: 0, max: 2000, step: 10 },
  m: { min: 0, max: 600, step: 5 },
};

// Slider bounds for the max-distance control (always km, no unit toggle).
export const MAX_DISTANCE_RANGE = { min: 0, max: 10, step: 0.1 };

// Sampling step for walking the alignment path across the search window.
export const PATH_STEP_MINUTES = 2;

// The moon info panel (phase/illumination/rise-set/azimuth/altitude/current
// time) recomputes on this interval (ms). Astronomy Engine's calculations
// are cheap (a handful of calls, sub-10ms total), so a 1s tick costs nothing
// meaningful and reads as genuinely live rather than visibly stepping.
export const PANEL_REFRESH_MS = 1_000;

// The alignment path (and, in "Now" mode, its natural moonrise-to-moonset
// window) recomputes on this interval (ms) instead — deliberately slower
// than PANEL_REFRESH_MS, since it's much heavier (one Astronomy Engine call
// pair per 2-min sample across the whole window, plus re-rendering the map
// layers) and its natural bounds only change when the moon actually rises
// or sets, not from one second to the next.
export const LIVE_REFRESH_MS = 10_000;

export const FEET_PER_METER = 3.28084;
export const METERS_PER_KM = 1000;

export function feetToMeters(ft) {
  return ft / FEET_PER_METER;
}

export function metersToFeet(m) {
  return m * FEET_PER_METER;
}

export function kmToMeters(km) {
  return km * METERS_PER_KM;
}

// Converts a target-height value in the given display unit ('ft' | 'm') to meters.
export function heightToMeters(value, unit) {
  return unit === 'ft' ? feetToMeters(value) : value;
}

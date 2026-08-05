// Moonshot configuration.
//
// Dedicated public token for Moonshot, URL-restricted in the Mapbox dashboard
// (console.mapbox.com/account/access-tokens) to moonshot.bendentremont.com,
// dev.moonshot.bendentremont.com, and localhost.
export const MAPBOX_TOKEN = 'pk.eyJ1IjoiYmVuZGVudHJlbW9udCIsImEiOiJjbXNjMjlraDkxaXJiMzVwcGozMnFuNXJ2In0.b3E8CuU6PSuqgm0engM3Vw';

// EXPERIMENT (branch: experiment/standard-style): comparing Mapbox's newer
// Standard style (native 3D buildings + dynamic day/dusk/night/dawn
// lighting) against the current dark-v11 classic style. Not merged to dev —
// swap back to 'mapbox://styles/mapbox/dark-v11' if this doesn't ship.
export const MAPBOX_STYLE = 'mapbox://styles/mapbox/standard';

// Default landmark shown on first load: CN Tower, Toronto.
export const DEFAULT_LANDMARK = {
  name: 'CN Tower',
  lat: 43.6426,
  lon: -79.3871,
};

// Virtual target point elevation, in feet above the landmark's base.
// ~1900 ft puts a full moon reading just above the CN Tower's spire.
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

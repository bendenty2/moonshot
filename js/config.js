// Moonshot configuration.
//
// Dedicated public token for Moonshot. TODO: once a deployment domain is
// chosen, add a URL restriction to this token in the Mapbox dashboard
// (console.mapbox.com/account/access-tokens) — safe to leave open until then.
export const MAPBOX_TOKEN = 'pk.eyJ1IjoiYmVuZGVudHJlbW9udCIsImEiOiJjbXNjMjlraDkxaXJiMzVwcGozMnFuNXJ2In0.b3E8CuU6PSuqgm0engM3Vw';

export const MAPBOX_STYLE = 'mapbox://styles/mapbox/dark-v11';

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

// Sampling step for walking the alignment path across the search window.
export const PATH_STEP_MINUTES = 2;

// "Now" mode re-recomputes on this interval (ms) so the panel/path stay fresh.
export const LIVE_REFRESH_MS = 60_000;

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

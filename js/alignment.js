// Traces the moon- or sun-behind-landmark alignment path (brief section 2).
// Body-agnostic: the caller passes whichever body's az/alt lookup function
// it wants (moonHorizontal/sunHorizontal from astro.js) — the geometry
// below doesn't care which body it's tracking, only that it gets an
// {azimuth, altitude} pair per timestamp.
//
// For each timestamp in the window, the body's topocentric az/alt is
// computed once from the landmark (parallax over a few km is negligible at
// solar-system distances, so a single reference point per iteration is
// fine). The observer must stand on the ray from the landmark pointing
// opposite the body's azimuth, at the distance where the elevation angle
// up to the virtual target point equals the body's altitude.
//
// Horizontal projection (landmark -> candidate point) uses the standard
// spherical "destination point given distance and bearing" formula, which is
// exact regardless of distance. The vertical/elevation-angle relationship
// (atan(height/distance)) ignores Earth's curvature over that distance, which
// is the "flat/simplified geometry" simplification the brief calls out as an
// acceptable v1 scope decision (curvature only matters at the multi-km+
// distances this tool isn't meant to reach anyway).

import { makeObserver } from './astro.js?v=1.3.3';
import { DEG, RAD } from './config.js?v=1.3.3';

const EARTH_RADIUS_M = 6371000;

// Destination point given a start lat/lon, bearing (deg), and distance (m).
function destinationPoint(lat, lon, bearingDeg, distanceM) {
  const delta = distanceM / EARTH_RADIUS_M;
  const theta = bearingDeg * DEG;
  const phi1 = lat * DEG;
  const lambda1 = lon * DEG;

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
  );
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
    );

  return { lat: phi2 * RAD, lon: lambda2 * RAD };
}

/**
 * @param {object} opts
 * @param {{lat:number, lon:number}} opts.landmark
 * @param {number} opts.targetHeightM - virtual target point height above the observer's eye level, in meters
 * @param {number} opts.maxDistanceM - reject candidate points farther than this from the landmark
 * @param {Date} opts.windowStart
 * @param {Date} opts.windowEnd
 * @param {number} opts.stepMinutes
 * @param {(date: Date, observer: object) => {azimuth: number, altitude: number}} opts.bodyHorizontal -
 *   moonHorizontal or sunHorizontal from astro.js
 * @param {(candidate: {lat:number, lon:number, distanceM:number}) => boolean} [opts.occlusionCheck] -
 *   returns true if terrain/a building blocks the sightline at this candidate point; omit to skip occlusion
 * @returns {{points: Array<{time:Date, lat:number, lon:number, distanceM:number, azimuth:number, altitude:number}>, reason: string|null}}
 *   `reason` is null when points is non-empty; otherwise one of 'below-horizon' (the body never got low
 *   enough over the whole window), 'too-far' (it did, but only outside maxDistanceM), 'occluded' (every
 *   otherwise-valid point was blocked by terrain/a building), or 'unknown' (window itself was empty/degenerate).
 */
export function computeAlignmentPath({
  landmark,
  targetHeightM,
  maxDistanceM,
  windowStart,
  windowEnd,
  stepMinutes,
  bodyHorizontal,
  occlusionCheck,
}) {
  const observer = makeObserver(landmark.lat, landmark.lon, 0);
  const points = [];
  const stepMs = stepMinutes * 60_000;

  let anyBelowHorizon = false;
  let anyTooFar = false;
  let anyOccluded = false;

  for (let t = windowStart.getTime(); t <= windowEnd.getTime(); t += stepMs) {
    const time = new Date(t);
    const { azimuth, altitude } = bodyHorizontal(time, observer);

    if (altitude <= 0) {
      anyBelowHorizon = true;
      continue; // body below horizon: no valid alignment
    }

    const distanceM = targetHeightM / Math.tan(altitude * DEG);
    if (!Number.isFinite(distanceM) || distanceM <= 0 || distanceM > maxDistanceM) {
      anyTooFar = true;
      continue;
    }

    const bearing = (azimuth + 180) % 360; // opposite the body: landmark -> observer
    const { lat, lon } = destinationPoint(landmark.lat, landmark.lon, bearing, distanceM);

    if (occlusionCheck && occlusionCheck({ lat, lon, distanceM })) {
      anyOccluded = true;
      continue;
    }

    points.push({ time, lat, lon, distanceM, azimuth, altitude });
  }

  let reason = null;
  if (points.length === 0) {
    if (anyOccluded) reason = 'occluded';
    else if (anyTooFar) reason = 'too-far';
    else if (anyBelowHorizon) reason = 'below-horizon';
    else reason = 'unknown';
  }

  return { points, reason };
}

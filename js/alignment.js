// Traces the moon-behind-landmark alignment path (brief section 2).
//
// For each timestamp in the window, the moon's topocentric az/alt is computed
// once from the landmark (parallax over a few km is negligible for the moon).
// The observer must stand on the ray from the landmark pointing opposite the
// moon's azimuth, at the distance where the elevation angle up to the virtual
// target point equals the moon's altitude.
//
// Horizontal projection (landmark -> candidate point) uses the standard
// spherical "destination point given distance and bearing" formula, which is
// exact regardless of distance. The vertical/elevation-angle relationship
// (atan(height/distance)) ignores Earth's curvature over that distance, which
// is the "flat/simplified geometry" simplification the brief calls out as an
// acceptable v1 scope decision (curvature only matters at the multi-km+
// distances this tool isn't meant to reach anyway).

import { makeObserver, moonHorizontal } from './astro.js?v=1.2.3';

const EARTH_RADIUS_M = 6371000;
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

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
 * @returns {Array<{time:Date, lat:number, lon:number, distanceM:number, moonAzimuth:number, moonAltitude:number}>}
 */
export function computeAlignmentPath({
  landmark,
  targetHeightM,
  maxDistanceM,
  windowStart,
  windowEnd,
  stepMinutes,
}) {
  const observer = makeObserver(landmark.lat, landmark.lon, 0);
  const points = [];
  const stepMs = stepMinutes * 60_000;

  for (let t = windowStart.getTime(); t <= windowEnd.getTime(); t += stepMs) {
    const time = new Date(t);
    const { azimuth, altitude } = moonHorizontal(time, observer);

    if (altitude <= 0) continue; // moon below horizon: no valid alignment

    const distanceM = targetHeightM / Math.tan(altitude * DEG);
    if (!Number.isFinite(distanceM) || distanceM <= 0 || distanceM > maxDistanceM) continue;

    const bearing = (azimuth + 180) % 360; // opposite the moon: landmark -> observer
    const { lat, lon } = destinationPoint(landmark.lat, landmark.lon, bearing, distanceM);

    points.push({ time, lat, lon, distanceM, moonAzimuth: azimuth, moonAltitude: altitude });
  }

  return points;
}

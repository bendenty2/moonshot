// Thin wrapper around the global `Astronomy` object (astronomy-engine UMD
// browser build, loaded via <script> in index.html) for everything the moon
// info panel and alignment path need.

const MOON_QUARTER_NAMES = ['New Moon', 'First Quarter', 'Full Moon', 'Last Quarter'];

export function makeObserver(lat, lon, elevationM = 0) {
  return new Astronomy.Observer(lat, lon, elevationM);
}

// Topocentric azimuth/altitude of the moon, in degrees, as seen from `observer` at `date`.
export function moonHorizontal(date, observer) {
  const eq = Astronomy.Equator(Astronomy.Body.Moon, date, observer, true, true);
  const hor = Astronomy.Horizon(date, observer, eq.ra, eq.dec, 'normal');
  return { azimuth: hor.azimuth, altitude: hor.altitude };
}

export function moonIllumination(date) {
  const illum = Astronomy.Illumination(Astronomy.Body.Moon, date);
  return { fraction: illum.phase_fraction };
}

// Named phase + waxing/waning, derived from the moon's ecliptic phase angle
// (0=new, 90=first quarter, 180=full, 270=last quarter).
export function moonPhaseName(date) {
  const angle = Astronomy.MoonPhase(date);
  const waxing = angle < 180;
  const NEAR = 8; // degrees of tolerance around an exact quarter to use its precise name

  if (angle < NEAR || angle > 360 - NEAR) return 'New Moon';
  if (Math.abs(angle - 90) < NEAR) return 'First Quarter';
  if (Math.abs(angle - 180) < NEAR) return 'Full Moon';
  if (Math.abs(angle - 270) < NEAR) return 'Last Quarter';

  if (angle < 90) return 'Waxing Crescent';
  if (angle < 180) return 'Waxing Gibbous';
  if (angle < 270) return 'Waning Gibbous';
  return 'Waning Crescent';
}

// Nearest upcoming moonrise and moonset for `observer`, searching forward from `date`.
export function nextMoonRiseSet(date, observer, limitDays = 3) {
  const rise = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, +1, date, limitDays);
  const set = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, -1, date, limitDays);
  return { rise: rise ? rise.date : null, set: set ? set.date : null };
}

function nextQuarter(date, targetQuarter, maxSteps = 4) {
  let mq = Astronomy.SearchMoonQuarter(date);
  for (let i = 0; i < maxSteps && mq.quarter !== targetQuarter; i++) {
    mq = Astronomy.NextMoonQuarter(mq);
  }
  return mq.time.date;
}

export function nextFullMoon(date) {
  return nextQuarter(date, 2);
}

export function nextNewMoon(date) {
  return nextQuarter(date, 0);
}

export { MOON_QUARTER_NAMES };

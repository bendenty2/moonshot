// Thin wrapper around the global `Astronomy` object (astronomy-engine UMD
// browser build, loaded via <script> in index.html) for everything the
// moon/sun info panels and alignment paths need.

const NORTHERN_SEASON_NAMES = ['Winter', 'Spring', 'Summer', 'Fall'];

export function makeObserver(lat, lon, elevationM = 0) {
  return new Astronomy.Observer(lat, lon, elevationM);
}

// Topocentric azimuth/altitude of the moon, in degrees, as seen from `observer` at `date`.
export function moonHorizontal(date, observer) {
  const eq = Astronomy.Equator(Astronomy.Body.Moon, date, observer, true, true);
  const hor = Astronomy.Horizon(date, observer, eq.ra, eq.dec, 'normal');
  return { azimuth: hor.azimuth, altitude: hor.altitude };
}

// Same, for the sun — used by Sun Alignment mode. The alignment path math
// itself (alignment.js) doesn't care which body it's given; both of these
// just need to expose the same {azimuth, altitude} shape.
export function sunHorizontal(date, observer) {
  const eq = Astronomy.Equator(Astronomy.Body.Sun, date, observer, true, true);
  const hor = Astronomy.Horizon(date, observer, eq.ra, eq.dec, 'normal');
  return { azimuth: hor.azimuth, altitude: hor.altitude };
}

// Distance to a body in km, for the moon/sun info panels' "Distance" row.
export function bodyDistanceKm(body, date, observer) {
  const AU_KM = 149_597_870.7;
  const eq = Astronomy.Equator(body, date, observer, true, true);
  return Math.round(eq.dist * AU_KM);
}

export function moonIllumination(date) {
  const illum = Astronomy.Illumination(Astronomy.Body.Moon, date);
  return { fraction: illum.phase_fraction };
}

// Named phase + waxing/waning, derived from the moon's ecliptic phase angle
// (0=new, 90=first quarter, 180=full, 270=last quarter).
export function moonPhaseName(date) {
  const angle = Astronomy.MoonPhase(date);
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

// The sun's rough equivalent of a "phase name": which of the 4 astronomical
// seasons `date` falls in, corrected for hemisphere (`lat`'s sign) since
// the Northern/Southern Hemisphere solstices/equinoxes name opposite
// seasons. Boundary dates come from the same Seasons() call nextSolstice/
// nextEquinox below use, so this always agrees with those.
export function seasonName(date, lat) {
  const seasons = Astronomy.Seasons(date.getFullYear());
  const marEq = seasons.mar_equinox.date;
  const junSol = seasons.jun_solstice.date;
  const sepEq = seasons.sep_equinox.date;
  const decSol = seasons.dec_solstice.date;

  let idx; // 0=winter, 1=spring, 2=summer, 3=fall (Northern Hemisphere)
  if (date < marEq) idx = 0;
  else if (date < junSol) idx = 1;
  else if (date < sepEq) idx = 2;
  else if (date < decSol) idx = 3;
  else idx = 0;

  if (lat < 0) idx = (idx + 2) % 4; // Southern Hemisphere seasons are offset by half a year
  return NORTHERN_SEASON_NAMES[idx];
}

// Nearest upcoming moonrise and moonset for `observer`, searching forward from `date`.
export function nextMoonRiseSet(date, observer, limitDays = 3) {
  const rise = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, +1, date, limitDays);
  const set = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, -1, date, limitDays);
  return { rise: rise ? rise.date : null, set: set ? set.date : null };
}

// Same, for the sun.
export function nextSunRiseSet(date, observer, limitDays = 3) {
  const rise = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, +1, date, limitDays);
  const set = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, -1, date, limitDays);
  return { rise: rise ? rise.date : null, set: set ? set.date : null };
}

// The most recent rise at or before `beforeDate`. Astronomy Engine only
// searches forward, so this steps forward through consecutive rises from a
// safe lookback point and keeps the last one that doesn't overshoot —
// necessary because a body can rise and set more than once within a single
// ~40h lookback window (a naive single forward search from the lookback
// point would return the *earliest* rise in range, not the most recent).
// Shared by moonUpWindow/sunUpWindow below — body-agnostic (takes body +
// its own rise/set search) rather than duplicated per body.
function mostRecentRiseAtOrBefore(body, beforeDate, observer, limitDays) {
  let searchFrom = new Date(beforeDate.getTime() - 40 * 60 * 60 * 1000);
  let best = null;
  for (let i = 0; i < 4; i++) {
    const rise = Astronomy.SearchRiseSet(body, observer, +1, searchFrom, limitDays);
    if (!rise || rise.date > beforeDate) break;
    best = rise;
    searchFrom = new Date(rise.date.getTime() + 60_000);
  }
  return best;
}

// The single continuous up-interval bracketing `refDate` (if the body is up
// right then) or the next one after it (if it's currently down). This is
// the natural "rise to set" window used as the default alignment-path
// bounds for every time mode, for either body.
function upWindow(body, horizontalFn, refDate, observer) {
  const { altitude } = horizontalFn(refDate, observer);
  const SEARCH_LIMIT_DAYS = 2;

  if (altitude > 0) {
    // Body is up now: find the most recent rise that started this interval,
    // and the set that will end it.
    const rise = mostRecentRiseAtOrBefore(body, refDate, observer, SEARCH_LIMIT_DAYS);
    const set = Astronomy.SearchRiseSet(body, observer, -1, refDate, SEARCH_LIMIT_DAYS);
    if (rise && set) return { start: rise.date, end: set.date };
  } else {
    // Body is down: find the next rise, then the set that follows it.
    const rise = Astronomy.SearchRiseSet(body, observer, +1, refDate, SEARCH_LIMIT_DAYS);
    if (rise) {
      const set = Astronomy.SearchRiseSet(body, observer, -1, rise.date, SEARCH_LIMIT_DAYS);
      if (set) return { start: rise.date, end: set.date };
    }
  }

  return null; // body doesn't rise/set within the search window (e.g. extreme latitude)
}

export function moonUpWindow(refDate, observer) {
  return upWindow(Astronomy.Body.Moon, moonHorizontal, refDate, observer);
}

export function sunUpWindow(refDate, observer) {
  return upWindow(Astronomy.Body.Sun, sunHorizontal, refDate, observer);
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

// Next equinox/solstice (whichever of the pair comes first) after `date` —
// the sun's rough equivalent of "next full/new moon". Seasons() gives all 4
// events for one calendar year in chronological order; checking `date`'s
// year then the next one (in the same chronological order) finds the next
// occurrence regardless of where in the year `date` currently falls.
function nextSeasonEvent(date, keysInOrder) {
  for (const year of [date.getFullYear(), date.getFullYear() + 1]) {
    const seasons = Astronomy.Seasons(year);
    for (const key of keysInOrder) {
      const eventDate = seasons[key].date;
      if (eventDate > date) return eventDate;
    }
  }
  return null; // shouldn't happen in practice
}

export function nextEquinox(date) {
  return nextSeasonEvent(date, ['mar_equinox', 'sep_equinox']);
}

export function nextSolstice(date) {
  return nextSeasonEvent(date, ['jun_solstice', 'dec_solstice']);
}

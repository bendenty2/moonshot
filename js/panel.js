import {
  makeObserver,
  moonHorizontal,
  sunHorizontal,
  moonIllumination,
  moonPhaseName,
  seasonName,
  nextMoonRiseSet,
  nextSunRiseSet,
  nextFullMoon,
  nextNewMoon,
  nextSolstice,
  nextEquinox,
  sunUpWindow,
  bodyDistanceKm,
} from './astro.js?v=1.3.3';

const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

function azimuthToCardinal(deg) {
  return CARDINALS[Math.round(deg / 22.5) % 16];
}

// Breaks a date into its separate weekday/month/day/year/time/meridiem
// pieces instead of one opaque formatted string. Each piece becomes its
// own grid column in the date rows below (see .panel-date-grid in
// styles.css) — that's the only way to get proportional-width text to
// actually line up between rows, since padding characters can't align a
// non-monospace font the way they could in a plain-text table.
//
// The time/meridiem split is built from raw Date getters rather than
// regex-splitting a toLocaleTimeString() string: that string's AM/PM
// marker isn't reliably "AM"/"PM" across locales (e.g. "p.m." with
// periods, lowercase), which a fixed regex would silently fail to split
// out. Weekday/month are still locale-formatted since those are used
// whole, not parsed back apart.
function dateParts(date, { seconds = false } = {}) {
  if (!date) return null;
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
  const month = date.toLocaleDateString(undefined, { month: 'short' });
  const day = date.getDate();
  const year = date.getFullYear();
  const hour24 = date.getHours();
  const hour12 = hour24 % 12 || 12;
  const minute = String(date.getMinutes()).padStart(2, '0');
  const time = seconds ? `${hour12}:${minute}:${String(date.getSeconds()).padStart(2, '0')}` : `${hour12}:${minute}`;
  const meridiem = hour24 < 12 ? 'AM' : 'PM';
  return { weekday, month, day, year, time, meridiem };
}

// Sorts a set of [label, date] rows chronologically (soonest first). Rows
// with no date (null — e.g. the body never rises/sets that day) sort last.
function chronological(rows) {
  return [...rows].sort((a, b) => {
    if (!a[1]) return 1;
    if (!b[1]) return -1;
    return a[1] - b[1];
  });
}

// One row of the date grid: a label cell (column 1) plus either the six
// weekday/month/day/year/time/meridiem cells, or — if the body simply
// doesn't rise/set that day — a single dash spanning the rest of the row.
function dateGridRow([label, date], { seconds = false } = {}) {
  const parts = dateParts(date, { seconds });
  if (!parts) {
    return `
      <span class="pdg-label">${label}</span>
      <span class="pdg-empty">—</span>
    `;
  }
  return `
      <span class="pdg-label">${label}</span>
      <span class="pdg-cell pdg-weekday">${parts.weekday},</span>
      <span class="pdg-cell pdg-month">${parts.month}</span>
      <span class="pdg-cell pdg-day">${parts.day},</span>
      <span class="pdg-cell pdg-year">${parts.year},</span>
      <span class="pdg-cell pdg-time">${parts.time}</span>
      <span class="pdg-cell pdg-meridiem">${parts.meridiem}</span>
  `;
}

// Shared by renderMoonPanel/renderSunPanel below — same overall shape
// (title, a two-item headline row, the 5-row date grid, azimuth/altitude/
// distance), just with different labels/content for the headline and date
// rows depending on which body it's for.
function renderInfoPanel(container, { title, headlineLeft, headlineRight, currentTimeRow, otherRows, azimuth, altitude, distanceKm }) {
  container.innerHTML = `
    <h2 class="panel-title">${title}</h2>

    <div class="panel-row panel-row--phase">
      <span class="panel-phase-name">${headlineLeft}</span>
      <span class="panel-phase-pct">${headlineRight}</span>
    </div>

    <div class="panel-date-grid">
      ${dateGridRow(currentTimeRow, { seconds: true })}
      ${otherRows.map((row) => dateGridRow(row)).join('\n      ')}
    </div>

    <dl class="panel-facts panel-facts--secondary">
      <div class="panel-fact">
        <dt>Azimuth</dt>
        <dd>${azimuth.toFixed(3)}° ${azimuthToCardinal(azimuth)} <span class="panel-azimuth-arrow" style="transform: rotate(${azimuth.toFixed(3)}deg)">&uarr;</span></dd>
      </div>
      <div class="panel-fact"><dt>Altitude</dt><dd>${altitude.toFixed(3)}°</dd></div>
      <div class="panel-fact"><dt>Distance</dt><dd>${distanceKm.toLocaleString()} km</dd></div>
    </dl>
  `;
}

export function computeMoonInfo(date, landmark) {
  const observer = makeObserver(landmark.lat, landmark.lon, 0);
  const { fraction } = moonIllumination(date);
  const phaseName = moonPhaseName(date);
  const { rise, set } = nextMoonRiseSet(date, observer);
  const fullMoon = nextFullMoon(date);
  const newMoon = nextNewMoon(date);
  const { azimuth, altitude } = moonHorizontal(date, observer);

  return {
    now: date,
    phaseName,
    illuminationPct: Math.round(fraction * 10000) / 100,
    moonrise: rise,
    moonset: set,
    nextFullMoon: fullMoon,
    nextNewMoon: newMoon,
    azimuth,
    altitude,
    distanceKm: bodyDistanceKm(Astronomy.Body.Moon, date, observer),
  };
}

export function renderMoonPanel(container, info) {
  const riseSetRows = chronological([
    ['Next moonrise', info.moonrise],
    ['Next moonset', info.moonset],
  ]);
  const phaseRows = chronological([
    ['Next full moon', info.nextFullMoon],
    ['Next new moon', info.nextNewMoon],
  ]);

  renderInfoPanel(container, {
    title: 'Live Moon Info',
    headlineLeft: info.phaseName,
    headlineRight: `${info.illuminationPct.toFixed(2)}% illuminated`,
    currentTimeRow: ['Current time', info.now],
    otherRows: [...riseSetRows, ...phaseRows],
    azimuth: info.azimuth,
    altitude: info.altitude,
    distanceKm: info.distanceKm,
  });
}

// Sun Alignment's equivalent of computeMoonInfo/renderMoonPanel. The sun
// has no real "phase" the way the moon does, so the headline row shows the
// current season (corrected for hemisphere — see seasonName in astro.js)
// and today's/the current up-period's day length instead of a phase name
// and illumination percent. "Next solstice"/"next equinox" round out the
// pairing with "next full/new moon" — both are the sun's own periodically
// recurring notable events.
export function computeSunInfo(date, landmark) {
  const observer = makeObserver(landmark.lat, landmark.lon, 0);
  const { rise, set } = nextSunRiseSet(date, observer);
  const { azimuth, altitude } = sunHorizontal(date, observer);
  const upWindow = sunUpWindow(date, observer);
  const dayLengthMs = upWindow ? upWindow.end.getTime() - upWindow.start.getTime() : null;

  return {
    now: date,
    season: seasonName(date, landmark.lat),
    dayLengthMs,
    sunrise: rise,
    sunset: set,
    nextSolstice: nextSolstice(date),
    nextEquinox: nextEquinox(date),
    azimuth,
    altitude,
    distanceKm: bodyDistanceKm(Astronomy.Body.Sun, date, observer),
  };
}

function formatDayLength(ms) {
  if (ms == null) return '—';
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m daylight`;
}

export function renderSunPanel(container, info) {
  const riseSetRows = chronological([
    ['Next sunrise', info.sunrise],
    ['Next sunset', info.sunset],
  ]);
  const seasonRows = chronological([
    ['Next solstice', info.nextSolstice],
    ['Next equinox', info.nextEquinox],
  ]);

  renderInfoPanel(container, {
    title: 'Live Sun Info',
    headlineLeft: info.season,
    headlineRight: formatDayLength(info.dayLengthMs),
    currentTimeRow: ['Current time', info.now],
    otherRows: [...riseSetRows, ...seasonRows],
    azimuth: info.azimuth,
    altitude: info.altitude,
    distanceKm: info.distanceKm,
  });
}

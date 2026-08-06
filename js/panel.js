import { makeObserver, moonHorizontal, moonIllumination, moonPhaseName, nextMoonRiseSet, nextFullMoon, nextNewMoon } from './astro.js?v=1.2.12';

const AU_KM = 149_597_870.7;

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

export function computeMoonInfo(date, landmark) {
  const observer = makeObserver(landmark.lat, landmark.lon, 0);
  const { fraction } = moonIllumination(date);
  const phaseName = moonPhaseName(date);
  const { rise, set } = nextMoonRiseSet(date, observer);
  const fullMoon = nextFullMoon(date);
  const newMoon = nextNewMoon(date);
  const { azimuth, altitude } = moonHorizontal(date, observer);
  const eq = Astronomy.Equator(Astronomy.Body.Moon, date, observer, true, true);

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
    distanceKm: Math.round(eq.dist * AU_KM),
  };
}

// Sorts a set of [label, date] rows chronologically (soonest first). Rows
// with no date (null — e.g. the moon never rises/sets that day) sort last.
function chronological(rows) {
  return [...rows].sort((a, b) => {
    if (!a[1]) return 1;
    if (!b[1]) return -1;
    return a[1] - b[1];
  });
}

// One row of the date grid: a label cell (column 1) plus either the six
// weekday/month/day/year/time/meridiem cells, or — if the moon simply
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

export function renderMoonPanel(container, info) {
  const riseSetRows = chronological([
    ['Next moonrise', info.moonrise],
    ['Next moonset', info.moonset],
  ]);
  const phaseRows = chronological([
    ['Next full moon', info.nextFullMoon],
    ['Next new moon', info.nextNewMoon],
  ]);

  container.innerHTML = `
    <h2 class="panel-title">Live Moon Info</h2>

    <div class="panel-row panel-row--phase">
      <span class="panel-phase-name">${info.phaseName}</span>
      <span class="panel-phase-pct">${info.illuminationPct.toFixed(2)}% illuminated</span>
    </div>

    <div class="panel-date-grid">
      ${dateGridRow(['Current time', info.now], { seconds: true })}
      ${riseSetRows.map((row) => dateGridRow(row)).join('\n      ')}
      ${phaseRows.map((row) => dateGridRow(row)).join('\n      ')}
    </div>

    <dl class="panel-facts panel-facts--secondary">
      <div class="panel-fact">
        <dt>Azimuth</dt>
        <dd>${info.azimuth.toFixed(3)}° ${azimuthToCardinal(info.azimuth)} <span class="panel-azimuth-arrow" style="transform: rotate(${info.azimuth.toFixed(3)}deg)">&uarr;</span></dd>
      </div>
      <div class="panel-fact"><dt>Altitude</dt><dd>${info.altitude.toFixed(3)}°</dd></div>
      <div class="panel-fact"><dt>Distance</dt><dd>${info.distanceKm.toLocaleString()} km</dd></div>
    </dl>
  `;
}

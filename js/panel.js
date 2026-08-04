import { makeObserver, moonHorizontal, moonIllumination, moonPhaseName, nextMoonRiseSet, nextFullMoon, nextNewMoon } from './astro.js?v=1.1.14';

const AU_KM = 149_597_870.7;

const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

function azimuthToCardinal(deg) {
  return CARDINALS[Math.round(deg / 22.5) % 16];
}

function fmtDateTime(date) {
  if (!date) return '—';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Full precision, including seconds — used for the live-ticking "current time" row.
export function formatExactTime(date) {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
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
    illuminationPct: Math.round(fraction * 1000) / 10,
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

function factRow([label, date]) {
  return `<div class="panel-fact"><dt>${label}</dt><dd>${fmtDateTime(date)}</dd></div>`;
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
      <span class="panel-phase-pct">${info.illuminationPct.toFixed(1)}% illuminated</span>
    </div>

    <dl class="panel-facts">
      <div class="panel-fact"><dt>Current time</dt><dd id="panel-current-time">${formatExactTime(info.now)}</dd></div>
      ${riseSetRows.map(factRow).join('\n      ')}
      ${phaseRows.map(factRow).join('\n      ')}
    </dl>

    <dl class="panel-facts panel-facts--secondary">
      <div class="panel-fact">
        <dt>Azimuth</dt>
        <dd>${info.azimuth.toFixed(2)}° ${azimuthToCardinal(info.azimuth)} <span class="panel-azimuth-arrow" style="transform: rotate(${info.azimuth.toFixed(2)}deg)">&uarr;</span></dd>
      </div>
      <div class="panel-fact"><dt>Altitude</dt><dd>${info.altitude.toFixed(2)}°</dd></div>
      <div class="panel-fact"><dt>Distance</dt><dd>${info.distanceKm.toLocaleString()} km</dd></div>
    </dl>
  `;
}

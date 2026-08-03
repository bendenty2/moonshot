import { makeObserver, moonHorizontal, moonIllumination, moonPhaseName, nextMoonRiseSet, nextFullMoon, nextNewMoon } from './astro.js';

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

export function renderMoonPanel(container, info) {
  container.innerHTML = `
    <h2 class="panel-title">Live Moon Info</h2>

    <div class="panel-row panel-row--phase">
      <span class="panel-phase-name">${info.phaseName}</span>
      <span class="panel-phase-pct">${info.illuminationPct.toFixed(1)}% illuminated</span>
    </div>

    <dl class="panel-facts">
      <div class="panel-fact"><dt>Current time</dt><dd id="panel-current-time">${formatExactTime(info.now)}</dd></div>
      <div class="panel-fact"><dt>Next moonrise</dt><dd>${fmtDateTime(info.moonrise)}</dd></div>
      <div class="panel-fact"><dt>Next moonset</dt><dd>${fmtDateTime(info.moonset)}</dd></div>
      <div class="panel-fact"><dt>Next full moon</dt><dd>${fmtDateTime(info.nextFullMoon)}</dd></div>
      <div class="panel-fact"><dt>Next new moon</dt><dd>${fmtDateTime(info.nextNewMoon)}</dd></div>
    </dl>

    <hr class="panel-divider" />

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

export function renderPathStatus(el, points, windowStart, windowEnd) {
  if (points.length === 0) {
    el.textContent = `No valid alignment found between ${fmtDateTime(windowStart)} and ${fmtDateTime(windowEnd)} within the max distance — try widening it or picking a different time.`;
  } else {
    el.textContent = `${points.length} alignment points from ${fmtDateTime(points[0].time)} to ${fmtDateTime(points[points.length - 1].time)}.`;
  }
}

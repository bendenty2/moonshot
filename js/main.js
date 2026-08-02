import {
  MAPBOX_TOKEN,
  MAPBOX_STYLE,
  DEFAULT_LANDMARK,
  DEFAULT_TARGET_HEIGHT_FT,
  DEFAULT_MAX_DISTANCE_MI,
  PATH_STEP_MINUTES,
  LIVE_REFRESH_MS,
  feetToMeters,
  milesToMeters,
} from './config.js';
import { nextFullMoon } from './astro.js';
import { computeAlignmentPath } from './alignment.js';
import { createMap, addLandmarkMarker, onMapClick, renderAlignmentPath, geocode } from './map.js';
import { computeMoonInfo, renderMoonPanel, renderPathStatus } from './panel.js';

const state = {
  landmark: { ...DEFAULT_LANDMARK },
  targetHeightFt: DEFAULT_TARGET_HEIGHT_FT,
  maxDistanceMi: DEFAULT_MAX_DISTANCE_MI,
  timeMode: 'now', // 'now' | 'fullmoon' | 'custom'
  customDate: null,
};

const panelEl = document.getElementById('moon-panel');
const searchInput = document.getElementById('location-search');
const searchResultsEl = document.getElementById('search-results');
const heightInput = document.getElementById('target-height');
const distanceInput = document.getElementById('max-distance');
const nowBtn = document.getElementById('time-now');
const fullMoonBtn = document.getElementById('time-fullmoon');
const customInput = document.getElementById('time-custom');

heightInput.value = state.targetHeightFt;
distanceInput.value = state.maxDistanceMi;

const { map, ready } = createMap('map', {
  token: MAPBOX_TOKEN,
  style: MAPBOX_STYLE,
  center: state.landmark,
});

let marker;

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function getSearchWindow() {
  const HALF_DAY_MS = 12 * 60 * 60 * 1000;

  if (state.timeMode === 'now') {
    const start = new Date();
    return { start, end: new Date(start.getTime() + 2 * HALF_DAY_MS) };
  }

  let center;
  if (state.timeMode === 'fullmoon') {
    center = nextFullMoon(new Date());
  } else {
    center = state.customDate || new Date();
  }
  return { start: new Date(center.getTime() - HALF_DAY_MS), end: new Date(center.getTime() + HALF_DAY_MS) };
}

function updatePanel() {
  const info = computeMoonInfo(new Date(), state.landmark);
  renderMoonPanel(panelEl, info, state.landmark.name);
}

function updatePath() {
  const { start, end } = getSearchWindow();
  const points = computeAlignmentPath({
    landmark: state.landmark,
    targetHeightM: feetToMeters(state.targetHeightFt),
    maxDistanceM: milesToMeters(state.maxDistanceMi),
    windowStart: start,
    windowEnd: end,
    stepMinutes: PATH_STEP_MINUTES,
  });
  renderAlignmentPath(map, points);
  renderPathStatus(panelEl, points, start, end);
}

function recomputeAll() {
  updatePanel();
  updatePath();
}

function setLandmark(landmark, { flyTo = false } = {}) {
  state.landmark = landmark;
  marker.setLngLat([landmark.lon, landmark.lat]);
  if (flyTo) map.flyTo({ center: [landmark.lon, landmark.lat], zoom: Math.max(map.getZoom(), 14) });
  recomputeAll();
}

function setTimeMode(mode) {
  state.timeMode = mode;
  nowBtn.classList.toggle('is-active', mode === 'now');
  fullMoonBtn.classList.toggle('is-active', mode === 'fullmoon');
  updatePath();
}

// ----- location search -----

let activeResults = [];

const runSearch = debounce(async (query) => {
  if (!query.trim()) {
    searchResultsEl.hidden = true;
    return;
  }
  try {
    activeResults = await geocode(query, MAPBOX_TOKEN, state.landmark);
  } catch (err) {
    console.error(err);
    activeResults = [];
  }
  searchResultsEl.innerHTML = activeResults
    .map((r, i) => `<li data-index="${i}">${r.name}</li>`)
    .join('');
  searchResultsEl.hidden = activeResults.length === 0;
}, 300);

searchInput.addEventListener('input', (e) => runSearch(e.target.value));

searchResultsEl.addEventListener('mousedown', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  const result = activeResults[Number(li.dataset.index)];
  if (!result) return;
  searchInput.value = result.name;
  searchResultsEl.hidden = true;
  setLandmark({ name: result.name, lat: result.lat, lon: result.lon }, { flyTo: true });
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.controlbar-search')) searchResultsEl.hidden = true;
});

// ----- numeric inputs -----

heightInput.addEventListener(
  'input',
  debounce(() => {
    const v = parseFloat(heightInput.value);
    if (Number.isFinite(v) && v >= 0) {
      state.targetHeightFt = v;
      updatePath();
    }
  }, 300)
);

distanceInput.addEventListener(
  'input',
  debounce(() => {
    const v = parseFloat(distanceInput.value);
    if (Number.isFinite(v) && v > 0) {
      state.maxDistanceMi = v;
      updatePath();
    }
  }, 300)
);

// ----- time controls -----

nowBtn.addEventListener('click', () => {
  customInput.value = '';
  setTimeMode('now');
});

fullMoonBtn.addEventListener('click', () => {
  customInput.value = '';
  setTimeMode('fullmoon');
});

customInput.addEventListener('change', () => {
  if (!customInput.value) return;
  state.customDate = new Date(customInput.value);
  state.timeMode = 'custom';
  nowBtn.classList.remove('is-active');
  fullMoonBtn.classList.remove('is-active');
  updatePath();
});

// ----- init -----

ready.then(() => {
  marker = addLandmarkMarker(map, state.landmark, (lonlat) => {
    setLandmark({ name: 'Custom location', lat: lonlat.lat, lon: lonlat.lon });
  });

  onMapClick(map, (lonlat) => {
    setLandmark({ name: 'Custom location', lat: lonlat.lat, lon: lonlat.lon });
  });

  recomputeAll();
});

setInterval(() => {
  updatePanel();
  if (state.timeMode === 'now') updatePath();
}, LIVE_REFRESH_MS);

import {
  MAPBOX_TOKEN,
  MAPBOX_STYLE,
  DEFAULT_LANDMARK,
  DEFAULT_TARGET_HEIGHT_FT,
  DEFAULT_MAX_DISTANCE_KM,
  PATH_STEP_MINUTES,
  PANEL_REFRESH_MS,
  LIVE_REFRESH_MS,
  heightToMeters,
  metersToFeet,
  kmToMeters,
} from './config.js';
import { makeObserver, nextFullMoon, moonUpWindow } from './astro.js';
import { computeAlignmentPath } from './alignment.js';
import { createMap, addLandmarkMarker, onMapClick, renderAlignmentPath, geocode } from './map.js';
import { computeMoonInfo, renderMoonPanel, renderPathStatus } from './panel.js';
import { createDatePicker } from './datepicker.js';
import { loadFavourites, addFavourite, renameFavourite, removeFavourite, renderFavourites } from './favourites.js';

const state = {
  landmark: { ...DEFAULT_LANDMARK },
  targetHeightValue: DEFAULT_TARGET_HEIGHT_FT,
  heightUnit: 'ft', // 'ft' | 'm'
  maxDistanceKm: DEFAULT_MAX_DISTANCE_KM,
  timeMode: 'now', // 'now' | 'fullmoon' | 'custom'
  customDate: null,
  pathStart: null,
  pathEnd: null,
  pathBoundsCustomized: false,
  favourites: loadFavourites(),
  locationLocked: false,
};

const panelEl = document.getElementById('moon-panel');
const pathStatusEl = document.getElementById('path-status');
const searchInput = document.getElementById('location-search');
const searchResultsEl = document.getElementById('search-results');
const heightInput = document.getElementById('target-height');
const heightUnitBtn = document.getElementById('height-unit');
const distanceInput = document.getElementById('max-distance');
const nowBtn = document.getElementById('time-now');
const fullMoonBtn = document.getElementById('time-fullmoon');
const customBtn = document.getElementById('time-custom-btn');
const pathStartInput = document.getElementById('path-start');
const pathEndInput = document.getElementById('path-end');
const footerYearEl = document.getElementById('footer-year');
const lockToggle = document.getElementById('lock-location-toggle');
const setFavouriteBtn = document.getElementById('set-favourite-btn');
const favouritesListEl = document.getElementById('favourites-list');

heightInput.value = state.targetHeightValue;
heightUnitBtn.textContent = state.heightUnit;
distanceInput.value = state.maxDistanceKm;
footerYearEl.textContent = String(new Date().getFullYear());

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

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toTimeInputValue(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

// Reapplies just the HH:MM from a "HH:MM" string onto originalDate's own
// calendar day, so narrowing the time doesn't change which day it's on.
function applyTimeToDate(originalDate, timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(originalDate);
  d.setHours(h, m, 0, 0);
  return d;
}

function formatPickedDate(date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// The reference instant each time mode is "about" — moonUpWindow() finds the
// natural moonrise/moonset interval bracketing (or following) this instant.
function getReferenceDate() {
  if (state.timeMode === 'now') return new Date();
  if (state.timeMode === 'fullmoon') return nextFullMoon(new Date());
  const d = state.customDate || new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
}

function fallbackWindow(refDate) {
  const HALF_DAY_MS = 12 * 60 * 60 * 1000;
  return { start: new Date(refDate.getTime() - HALF_DAY_MS), end: new Date(refDate.getTime() + HALF_DAY_MS) };
}

function syncPathBoundsInputs() {
  pathStartInput.value = toTimeInputValue(state.pathStart);
  pathEndInput.value = toTimeInputValue(state.pathEnd);
}

function updatePanel() {
  const info = computeMoonInfo(new Date(), state.landmark);
  renderMoonPanel(panelEl, info);
}

function updatePath() {
  const points = computeAlignmentPath({
    landmark: state.landmark,
    targetHeightM: heightToMeters(state.targetHeightValue, state.heightUnit),
    maxDistanceM: kmToMeters(state.maxDistanceKm),
    windowStart: state.pathStart,
    windowEnd: state.pathEnd,
    stepMinutes: PATH_STEP_MINUTES,
  });
  renderAlignmentPath(map, points);
  renderPathStatus(pathStatusEl, points, state.pathStart, state.pathEnd);
}

// Recomputes the natural moonrise-to-moonset window for the current landmark
// + time mode, resets any manual start/end narrowing, and redraws the path.
function recomputeNaturalWindow() {
  const observer = makeObserver(state.landmark.lat, state.landmark.lon, 0);
  const refDate = getReferenceDate();
  const window = moonUpWindow(refDate, observer) || fallbackWindow(refDate);
  state.pathStart = window.start;
  state.pathEnd = window.end;
  state.pathBoundsCustomized = false;
  syncPathBoundsInputs();
  updatePath();
}

function setLandmark(landmark, { flyTo = false } = {}) {
  state.landmark = landmark;
  marker.setLngLat([landmark.lon, landmark.lat]);
  if (flyTo) map.flyTo({ center: [landmark.lon, landmark.lat], zoom: Math.max(map.getZoom(), 14) });
  updatePanel();
  recomputeNaturalWindow();
}

// ----- favourites -----

function refreshFavouritesUI() {
  renderFavourites(favouritesListEl, state.favourites, {
    onSelect: (id) => {
      const fav = state.favourites.find((f) => f.id === id);
      if (!fav) return;
      state.targetHeightValue = fav.heightValue;
      state.heightUnit = fav.heightUnit;
      heightInput.value = fav.heightValue;
      heightUnitBtn.textContent = fav.heightUnit;
      setLandmark({ name: fav.name, lat: fav.lat, lon: fav.lon }, { flyTo: true });
    },
    onRename: (id, name) => {
      state.favourites = renameFavourite(state.favourites, id, name);
      refreshFavouritesUI();
    },
    onRemove: (id) => {
      state.favourites = removeFavourite(state.favourites, id);
      refreshFavouritesUI();
    },
  });
}

setFavouriteBtn.addEventListener('click', () => {
  state.favourites = addFavourite(state.favourites, {
    name: state.landmark.name || 'Favourite',
    lat: state.landmark.lat,
    lon: state.landmark.lon,
    heightValue: state.targetHeightValue,
    heightUnit: state.heightUnit,
  });
  refreshFavouritesUI();
});

lockToggle.addEventListener('change', () => {
  state.locationLocked = lockToggle.checked;
});

function activateNow() {
  state.timeMode = 'now';
  nowBtn.classList.add('is-active');
  fullMoonBtn.classList.remove('is-active');
  customBtn.classList.remove('is-active');
  customBtn.textContent = 'Custom Date';
  recomputeNaturalWindow();
}

function activateFullMoon() {
  state.timeMode = 'fullmoon';
  nowBtn.classList.remove('is-active');
  fullMoonBtn.classList.add('is-active');
  customBtn.classList.remove('is-active');
  customBtn.textContent = 'Custom Date';
  recomputeNaturalWindow();
}

function activateCustom(date) {
  state.timeMode = 'custom';
  state.customDate = date;
  nowBtn.classList.remove('is-active');
  fullMoonBtn.classList.remove('is-active');
  customBtn.classList.add('is-active');
  customBtn.textContent = formatPickedDate(date);
  recomputeNaturalWindow();
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
      state.targetHeightValue = v;
      updatePath();
    }
  }, 300)
);

heightUnitBtn.addEventListener('click', () => {
  const newUnit = state.heightUnit === 'ft' ? 'm' : 'ft';
  const meters = heightToMeters(state.targetHeightValue, state.heightUnit);
  const displayValue = newUnit === 'ft' ? metersToFeet(meters) : meters;
  state.heightUnit = newUnit;
  state.targetHeightValue = Math.round(displayValue * (newUnit === 'ft' ? 1 : 10)) / (newUnit === 'ft' ? 1 : 10);
  heightInput.value = state.targetHeightValue;
  heightUnitBtn.textContent = newUnit;
  updatePath();
});

distanceInput.addEventListener(
  'input',
  debounce(() => {
    const v = parseFloat(distanceInput.value);
    if (Number.isFinite(v) && v > 0) {
      state.maxDistanceKm = v;
      updatePath();
    }
  }, 300)
);

// ----- time controls -----

nowBtn.addEventListener('click', activateNow);
fullMoonBtn.addEventListener('click', activateFullMoon);

createDatePicker({
  buttonEl: customBtn,
  popoverEl: document.getElementById('date-picker-popover'),
  labelEl: document.getElementById('date-picker-label'),
  weekdaysEl: document.getElementById('date-picker-weekdays'),
  daysEl: document.getElementById('date-picker-days'),
  onSelect: (date) => activateCustom(date),
});

// ----- path window (start/end) overrides -----

pathStartInput.addEventListener('change', () => {
  if (!pathStartInput.value) return;
  state.pathStart = applyTimeToDate(state.pathStart, pathStartInput.value);
  state.pathBoundsCustomized = true;
  updatePath();
});

pathEndInput.addEventListener('change', () => {
  if (!pathEndInput.value) return;
  state.pathEnd = applyTimeToDate(state.pathEnd, pathEndInput.value);
  state.pathBoundsCustomized = true;
  updatePath();
});

// ----- init -----

ready.then(() => {
  marker = addLandmarkMarker(map, state.landmark, (lonlat) => {
    setLandmark({ name: 'Custom location', lat: lonlat.lat, lon: lonlat.lon });
  });

  onMapClick(map, (lonlat) => {
    if (state.locationLocked) return;
    setLandmark({ name: 'Custom location', lat: lonlat.lat, lon: lonlat.lon });
  });

  updatePanel();
  recomputeNaturalWindow();
});

refreshFavouritesUI();

// Panel data (phase, illumination, rise/set ordering, azimuth/altitude,
// current time) ticks fast — it's cheap and reads as genuinely live.
setInterval(updatePanel, PANEL_REFRESH_MS);

// The path/window recompute is heavier and doesn't need second-by-second
// updates (its natural bounds only change when the moon actually rises or
// sets), so it stays on its own slower cadence.
setInterval(() => {
  if (state.timeMode === 'now' && !state.pathBoundsCustomized) {
    recomputeNaturalWindow();
  } else {
    updatePath();
  }
}, LIVE_REFRESH_MS);

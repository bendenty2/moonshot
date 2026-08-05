import {
  MAPBOX_TOKEN,
  MAPBOX_STYLE,
  DEFAULT_LANDMARK,
  DEFAULT_TARGET_HEIGHT_FT,
  DEFAULT_MAX_DISTANCE_KM,
  TARGET_HEIGHT_RANGE,
  MAX_DISTANCE_RANGE,
  PATH_STEP_MINUTES,
  PANEL_REFRESH_MS,
  LIVE_REFRESH_MS,
  heightToMeters,
  metersToFeet,
  kmToMeters,
} from './config.js?v=1.2.4';
import { makeObserver, nextFullMoon, moonUpWindow } from './astro.js?v=1.2.4';
import { computeAlignmentPath } from './alignment.js?v=1.2.4';
import { createMap, addLandmarkMarker, onMapClick, addBuildingsAndTerrain, renderAlignmentPath, renderVirtualPoint, geocode } from './map.js?v=1.2.4';
import { computeMoonInfo, renderMoonPanel } from './panel.js?v=1.2.4';
import { createDatePicker } from './datepicker.js?v=1.2.4';
import { loadFavourites, addFavourite, updateFavourite, removeFavourite, renderFavourites } from './favourites.js?v=1.2.4';

const state = {
  landmark: { ...DEFAULT_LANDMARK },
  targetHeightValue: DEFAULT_TARGET_HEIGHT_FT,
  heightUnit: 'ft', // 'ft' | 'm'
  maxDistanceKm: DEFAULT_MAX_DISTANCE_KM,
  timeMode: 'now', // 'now' | 'fullmoon' | 'custom'
  customDate: null,
  pathStart: null,
  pathEnd: null,
  favourites: loadFavourites(),
  // The favourite (if any) that the current landmark + target height were
  // just loaded from — drives the star's filled/unfilled state.
  activeFavouriteId: null,
};

const panelEl = document.getElementById('moon-panel');
const searchInput = document.getElementById('location-search');
const searchResultsEl = document.getElementById('search-results');
const heightSlider = document.getElementById('target-height-slider');
const heightInput = document.getElementById('target-height');
const heightUnitBtn = document.getElementById('height-unit');
const distanceSlider = document.getElementById('max-distance-slider');
const distanceInput = document.getElementById('max-distance');
const nowBtn = document.getElementById('time-now');
const fullMoonBtn = document.getElementById('time-fullmoon');
const customBtn = document.getElementById('time-custom-btn');
const footerYearEl = document.getElementById('footer-year');
const favouriteStarBtn = document.getElementById('favourite-star-btn');
const favouritesListEl = document.getElementById('favourites-list');

function applyHeightRange(unit) {
  const range = TARGET_HEIGHT_RANGE[unit];
  heightSlider.min = range.min;
  heightSlider.max = range.max;
  heightSlider.step = range.step;
}

applyHeightRange(state.heightUnit);
heightSlider.value = state.targetHeightValue;
heightInput.value = state.targetHeightValue;
heightUnitBtn.textContent = state.heightUnit;

distanceSlider.min = MAX_DISTANCE_RANGE.min;
distanceSlider.max = MAX_DISTANCE_RANGE.max;
distanceSlider.step = MAX_DISTANCE_RANGE.step;
distanceSlider.value = state.maxDistanceKm;
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

// Coalesces rapid-fire events (e.g. dragging a range slider) to at most once
// per animation frame, so the path recomputes live during a drag without
// redoing the work for every sub-frame 'input' event the browser fires.
function rafThrottle(fn) {
  let scheduled = false;
  let lastArgs;
  return (...args) => {
    lastArgs = args;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      fn(...lastArgs);
    });
  };
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

function updatePanel() {
  const info = computeMoonInfo(new Date(), state.landmark);
  renderMoonPanel(panelEl, info);
}

function updatePath() {
  const targetHeightM = heightToMeters(state.targetHeightValue, state.heightUnit);
  const points = computeAlignmentPath({
    landmark: state.landmark,
    targetHeightM,
    maxDistanceM: kmToMeters(state.maxDistanceKm),
    windowStart: state.pathStart,
    windowEnd: state.pathEnd,
    stepMinutes: PATH_STEP_MINUTES,
  });
  renderAlignmentPath(map, points);
  renderVirtualPoint(map, state.landmark, targetHeightM);
}

// Recomputes the natural moonrise-to-moonset window for the current landmark
// + time mode, and redraws the path.
function recomputeNaturalWindow() {
  const observer = makeObserver(state.landmark.lat, state.landmark.lon, 0);
  const refDate = getReferenceDate();
  const window = moonUpWindow(refDate, observer) || fallbackWindow(refDate);
  state.pathStart = window.start;
  state.pathEnd = window.end;
  updatePath();
}

function setLandmark(landmark, { flyTo = false, fromFavourite = false } = {}) {
  state.landmark = landmark;
  marker.setLngLat([landmark.lon, landmark.lat]);
  if (flyTo) map.flyTo({ center: [landmark.lon, landmark.lat], zoom: Math.max(map.getZoom(), 14) });
  if (!fromFavourite) {
    state.activeFavouriteId = null;
    updateStarUI();
  }
  updatePanel();
  recomputeNaturalWindow();
}

// Applies a real building height (meters, from clicking a 3D building) as
// the target height, converting to whichever unit is currently displayed.
// Doesn't call updatePath itself — meant to be called right before
// setLandmark, which already triggers the one recompute this needs.
function applyBuildingHeight(heightM) {
  const displayValue = state.heightUnit === 'ft' ? metersToFeet(heightM) : heightM;
  const decimals = state.heightUnit === 'ft' ? 0 : 1;
  state.targetHeightValue = Math.round(displayValue * 10 ** decimals) / 10 ** decimals;
  heightSlider.value = state.targetHeightValue;
  heightInput.value = state.targetHeightValue;
  state.activeFavouriteId = null;
  updateStarUI();
}

// ----- favourites -----

// Re-renders the favourites list, marking whichever entry (if any) matches
// state.activeFavouriteId with the vertical accent-bar active style.
function refreshFavouritesUI() {
  renderFavourites(favouritesListEl, state.favourites, {
    activeId: state.activeFavouriteId,
    onSelect: (id) => {
      const fav = state.favourites.find((f) => f.id === id);
      if (!fav) return;
      state.targetHeightValue = fav.heightValue;
      state.heightUnit = fav.heightUnit;
      applyHeightRange(fav.heightUnit);
      heightSlider.value = fav.heightValue;
      heightInput.value = fav.heightValue;
      heightUnitBtn.textContent = fav.heightUnit;
      state.activeFavouriteId = id;
      updateStarUI();
      setLandmark({ name: fav.name, lat: fav.lat, lon: fav.lon }, { flyTo: true, fromFavourite: true });
    },
    onEdit: (id, updates) => {
      state.favourites = updateFavourite(state.favourites, id, updates);
      refreshFavouritesUI();
    },
    onRemove: (id) => {
      state.favourites = removeFavourite(state.favourites, id);
      if (id === state.activeFavouriteId) {
        state.activeFavouriteId = null;
        updateStarUI(); // also re-renders the (now-updated) list
      } else {
        refreshFavouritesUI();
      }
    },
  });
}

// Keeps the star icon AND the favourites list's active-row highlight in sync
// with state.activeFavouriteId — call this (not just the star update alone)
// any time that id changes, so a favourite row's highlight never goes stale.
function updateStarUI() {
  const active = state.activeFavouriteId !== null;
  favouriteStarBtn.textContent = active ? '★' : '☆'; // filled / outline star
  favouriteStarBtn.classList.toggle('is-active', active);
  refreshFavouritesUI();
}

favouriteStarBtn.addEventListener('click', () => {
  if (state.activeFavouriteId !== null) return; // current state already matches a saved favourite
  state.favourites = addFavourite(state.favourites, {
    name: state.landmark.name || 'Favourite',
    lat: state.landmark.lat,
    lon: state.landmark.lon,
    heightValue: state.targetHeightValue,
    heightUnit: state.heightUnit,
  });
  state.activeFavouriteId = state.favourites[state.favourites.length - 1].id;
  updateStarUI();
  refreshFavouritesUI();
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

// ----- numeric inputs (each paired with a slider that mirrors it live) -----

heightInput.addEventListener(
  'input',
  debounce(() => {
    const v = parseFloat(heightInput.value);
    if (Number.isFinite(v) && v >= 0) {
      state.targetHeightValue = v;
      heightSlider.value = v;
      state.activeFavouriteId = null;
      updateStarUI();
      updatePath();
    }
  }, 300)
);

heightSlider.addEventListener(
  'input',
  rafThrottle(() => {
    const v = parseFloat(heightSlider.value);
    state.targetHeightValue = v;
    heightInput.value = v;
    state.activeFavouriteId = null;
    updateStarUI();
    updatePath();
  })
);

heightUnitBtn.addEventListener('click', () => {
  const newUnit = state.heightUnit === 'ft' ? 'm' : 'ft';
  const meters = heightToMeters(state.targetHeightValue, state.heightUnit);
  const displayValue = newUnit === 'ft' ? metersToFeet(meters) : meters;
  state.heightUnit = newUnit;
  state.targetHeightValue = Math.round(displayValue * (newUnit === 'ft' ? 1 : 10)) / (newUnit === 'ft' ? 1 : 10);
  applyHeightRange(newUnit);
  heightSlider.value = state.targetHeightValue;
  heightInput.value = state.targetHeightValue;
  heightUnitBtn.textContent = newUnit;
  state.activeFavouriteId = null;
  updateStarUI();
  updatePath();
});

distanceInput.addEventListener(
  'input',
  debounce(() => {
    const v = parseFloat(distanceInput.value);
    if (Number.isFinite(v) && v > 0) {
      state.maxDistanceKm = v;
      distanceSlider.value = v;
      updatePath();
    }
  }, 300)
);

distanceSlider.addEventListener(
  'input',
  rafThrottle(() => {
    const v = parseFloat(distanceSlider.value);
    state.maxDistanceKm = v;
    distanceInput.value = v;
    updatePath();
  })
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

// ----- top-level tabs -----

const topbarTabs = document.querySelectorAll('.topbar-tab');

topbarTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const view = tab.dataset.view;
    topbarTabs.forEach((t) => t.classList.toggle('is-active', t === tab));
    document.querySelectorAll('.view').forEach((el) => el.classList.toggle('is-active', el.id === `view-${view}`));

    // Mapbox renders into a fixed-size canvas that doesn't notice its
    // container coming back from display:none — nudge it to recalculate.
    if (view === 'alignment') requestAnimationFrame(() => map.resize());
  });
});

// ----- resizable panes -----

function makeResizable(resizerEl, targetEl, { side, min, max }) {
  let startX = 0;
  let startWidth = 0;

  const onMouseMove = rafThrottle((e) => {
    const dx = e.clientX - startX;
    const delta = side === 'left' ? dx : -dx; // dragging right grows a left-anchored pane, shrinks a right-anchored one
    const width = Math.min(max, Math.max(min, startWidth + delta));
    targetEl.style.width = `${width}px`;
    map.resize();
  });

  const onMouseUp = () => {
    resizerEl.classList.remove('is-dragging');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  resizerEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startWidth = targetEl.getBoundingClientRect().width;
    resizerEl.classList.add('is-dragging');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

makeResizable(document.getElementById('sidebar-resizer'), document.querySelector('.sidebar-pane'), {
  side: 'left',
  min: 100,
  max: 400,
});
makeResizable(document.getElementById('panel-resizer'), document.querySelector('.panel-pane'), {
  side: 'right',
  min: 260,
  max: 600,
});

// ----- init -----

ready.then(() => {
  addBuildingsAndTerrain(map);

  marker = addLandmarkMarker(map, state.landmark, (lonlat) => {
    setLandmark({ name: 'Custom location', lat: lonlat.lat, lon: lonlat.lon });
  });

  onMapClick(map, (lonlat) => {
    if (lonlat.buildingHeightM != null) applyBuildingHeight(lonlat.buildingHeightM);
    setLandmark({ name: 'Custom location', lat: lonlat.lat, lon: lonlat.lon });
  });

  updatePanel();
  recomputeNaturalWindow();
});

refreshFavouritesUI();
updateStarUI();

// Panel data (phase, illumination, rise/set ordering, azimuth/altitude,
// current time) ticks fast — it's cheap and reads as genuinely live.
setInterval(updatePanel, PANEL_REFRESH_MS);

// The path/window recompute is heavier and doesn't need second-by-second
// updates (its natural bounds only change when the moon actually rises or
// sets), so it stays on its own slower cadence.
setInterval(() => {
  if (state.timeMode === 'now') {
    recomputeNaturalWindow();
  } else {
    updatePath();
  }
}, LIVE_REFRESH_MS);

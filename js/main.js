import {
  MAPBOX_TOKEN,
  MAPBOX_STYLE,
  DEFAULT_LANDMARK,
  DEFAULT_MAP_ZOOM,
  DEFAULT_MAP_PITCH,
  DEFAULT_MAP_BEARING,
  DEFAULT_MAP_CENTER_OFFSET_LAT,
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
} from './config.js?v=1.3.3';
import { makeObserver, nextFullMoon, moonUpWindow, sunUpWindow, nextSolstice, moonHorizontal, sunHorizontal } from './astro.js?v=1.3.3';
import { computeAlignmentPath } from './alignment.js?v=1.3.3';
import {
  createMap,
  addLandmarkMarker,
  onMapClick,
  addBuildingsAndTerrain,
  renderAlignmentPath,
  renderVirtualPoint,
  geocode,
  setMapTheme,
  isOcclusionEnabled,
  makeOcclusionCheck,
} from './map.js?v=1.3.3';
import { computeMoonInfo, renderMoonPanel, computeSunInfo, renderSunPanel } from './panel.js?v=1.3.3';
import { createDatePicker } from './datepicker.js?v=1.3.3';
import { loadFavourites, addFavourite, updateFavourite, removeFavourite, renderFavourites } from './favourites.js?v=1.3.3';
import { loadTheme, saveTheme } from './theme.js?v=1.3.3';
import { onOutsideClick } from './dom.js?v=1.3.3';

const SUN_MARKER_COLOR = '#e0942f';

document.getElementById('footer-year').textContent = String(new Date().getFullYear());

// ----- shared helpers (pure, or parametrized by whichever map they act on
// — used by both the Moon and Sun Alignment views created below) -----

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

function makeResizable(resizerEl, targetEl, map, { side, min, max }) {
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

// ----- site-wide theme (one toggle, shared across both alignment views —
// each view registers itself via themeSubscribers so a single toggle click
// updates every live map's lightPreset, not just whichever view is active) -----

let currentTheme = loadTheme();
const themeSubscribers = [];

const themeToggleEl = document.getElementById('theme-toggle');
const themeDarkBtn = document.getElementById('theme-dark-btn');
const themeLightBtn = document.getElementById('theme-light-btn');

// index.html's inline anti-flash script may have already set this (for a
// stored 'light' preference) before this module even loaded — setting it
// again here for the 'dark' case is a harmless no-op, and keeps this the
// single place that owns applying currentTheme to the DOM going forward.
document.documentElement.dataset.theme = currentTheme;

function updateThemeToggleUI() {
  const isLight = currentTheme === 'light';
  themeDarkBtn.classList.toggle('is-active', !isLight);
  themeLightBtn.classList.toggle('is-active', isLight);
  themeToggleEl.classList.toggle('is-second-active', isLight);
}
updateThemeToggleUI();

function setTheme(theme) {
  if (theme === currentTheme) return;
  currentTheme = theme;
  document.documentElement.dataset.theme = theme;
  saveTheme(theme);
  updateThemeToggleUI();
  themeSubscribers.forEach((fn) => fn(theme));
}

themeDarkBtn.addEventListener('click', () => setTheme('dark'));
themeLightBtn.addEventListener('click', () => setTheme('light'));

// ----- alignment view factory -----
//
// Moon Alignment and Sun Alignment are two independent instances of the
// same machinery — same controls, same map behaviors, same favourites/
// panel/path wiring — differing only in which body drives the astronomy
// (moonHorizontal vs sunHorizontal), which info panel renders, which
// element ids they're wired to, and a couple of labels/colors. Written
// once here and called twice below rather than duplicated, so a future
// tweak to how e.g. the height slider behaves doesn't have to be applied
// twice by hand and can't quietly drift between the two modes.
function createAlignmentView({
  bodyLabel,
  bodyHorizontal,
  upWindowFn,
  specialEventFn,
  computeInfo,
  renderInfo,
  markerColor,
  favouritesStorageKey,
  ids,
}) {
  const state = {
    landmark: { ...DEFAULT_LANDMARK },
    targetHeightValue: DEFAULT_TARGET_HEIGHT_FT,
    heightUnit: 'ft', // 'ft' | 'm'
    maxDistanceKm: DEFAULT_MAX_DISTANCE_KM,
    timeMode: 'now', // 'now' | 'special' | 'custom'
    customDate: null,
    pathStart: null,
    pathEnd: null,
    favourites: loadFavourites(favouritesStorageKey),
    // The favourite (if any) that the current landmark + target height were
    // just loaded from — drives the star's filled/unfilled state.
    activeFavouriteId: null,
  };

  const viewEl = document.getElementById(ids.viewId);
  const panelEl = document.getElementById(ids.panel);
  const searchInput = document.getElementById(ids.search);
  const searchResultsEl = document.getElementById(ids.searchResults);
  const heightSlider = document.getElementById(ids.heightSlider);
  const heightInput = document.getElementById(ids.heightInput);
  const heightUnitBtn = document.getElementById(ids.heightUnitBtn);
  const distanceSlider = document.getElementById(ids.distanceSlider);
  const distanceInput = document.getElementById(ids.distanceInput);
  const nowBtn = document.getElementById(ids.nowBtn);
  const specialBtn = document.getElementById(ids.specialBtn);
  const customBtn = document.getElementById(ids.customBtn);
  const favouriteStarBtn = document.getElementById(ids.favouriteStarBtn);
  const favouritesListEl = document.getElementById(ids.favouritesList);

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

  // The initial camera center is nudged slightly north of the landmark
  // (DEFAULT_MAP_CENTER_OFFSET_LAT) purely for opening-shot framing — the
  // marker, path algorithm, and everything else below still use
  // state.landmark's real, unshifted coordinate.
  const { map, ready } = createMap(ids.map, {
    token: MAPBOX_TOKEN,
    style: MAPBOX_STYLE,
    center: { lat: state.landmark.lat + DEFAULT_MAP_CENTER_OFFSET_LAT, lon: state.landmark.lon },
    zoom: DEFAULT_MAP_ZOOM,
    pitch: DEFAULT_MAP_PITCH,
    bearing: DEFAULT_MAP_BEARING,
  });

  let mapIsReady = false;
  themeSubscribers.push((theme) => {
    if (mapIsReady) setMapTheme(map, theme);
  });

  // A Marker is a plain DOM overlay, not tied to the style/'load' event, so
  // this doesn't need to wait for `ready` — added synchronously right here
  // closes a race where interacting with the app (e.g. a very fast click)
  // before 'load' fires would otherwise find `marker` still undefined.
  const marker = addLandmarkMarker(
    map,
    state.landmark,
    (lonlat) => {
      setLandmark({ name: 'Custom location', lat: lonlat.lat, lon: lonlat.lon });
    },
    markerColor
  );

  // The reference instant each time mode is "about" — upWindowFn() finds
  // the natural rise/set interval bracketing (or following) this instant.
  function getReferenceDate() {
    if (state.timeMode === 'now') return new Date();
    if (state.timeMode === 'special') return specialEventFn(new Date());
    const d = state.customDate || new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
  }

  function fallbackWindow(refDate) {
    const HALF_DAY_MS = 12 * 60 * 60 * 1000;
    return { start: new Date(refDate.getTime() - HALF_DAY_MS), end: new Date(refDate.getTime() + HALF_DAY_MS) };
  }

  function updatePanel() {
    const info = computeInfo(new Date(), state.landmark);
    renderInfo(panelEl, info);
  }

  function updatePath() {
    const targetHeightM = heightToMeters(state.targetHeightValue, state.heightUnit);
    // Occlusion checking is opt-in (see OCCLUSION_SAMPLES's comment in
    // config.js) — only built and passed through when this view's own
    // legend checkbox is on.
    const occlusionCheck = isOcclusionEnabled(map) ? makeOcclusionCheck(map, state.landmark, targetHeightM) : undefined;
    const result = computeAlignmentPath({
      landmark: state.landmark,
      targetHeightM,
      maxDistanceM: kmToMeters(state.maxDistanceKm),
      windowStart: state.pathStart,
      windowEnd: state.pathEnd,
      stepMinutes: PATH_STEP_MINUTES,
      bodyHorizontal,
      occlusionCheck,
    });
    renderAlignmentPath(map, result, { bodyLabel, lineColor: markerColor, maxDistanceKm: state.maxDistanceKm });
    renderVirtualPoint(map, state.landmark, targetHeightM, markerColor);
  }

  // Recomputes the natural rise-to-set window for the current landmark +
  // time mode, and redraws the path.
  function recomputeNaturalWindow() {
    const observer = makeObserver(state.landmark.lat, state.landmark.lon, 0);
    const refDate = getReferenceDate();
    const window = upWindowFn(refDate, observer) || fallbackWindow(refDate);
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
        state.favourites = updateFavourite(state.favourites, id, updates, favouritesStorageKey);
        refreshFavouritesUI();
      },
      onRemove: (id) => {
        state.favourites = removeFavourite(state.favourites, id, favouritesStorageKey);
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
    state.favourites = addFavourite(
      state.favourites,
      {
        name: state.landmark.name || 'Favourite',
        lat: state.landmark.lat,
        lon: state.landmark.lon,
        heightValue: state.targetHeightValue,
        heightUnit: state.heightUnit,
      },
      favouritesStorageKey
    );
    state.activeFavouriteId = state.favourites[state.favourites.length - 1].id;
    updateStarUI();
    refreshFavouritesUI();
  });

  function activateNow() {
    state.timeMode = 'now';
    nowBtn.classList.add('is-active');
    specialBtn.classList.remove('is-active');
    customBtn.classList.remove('is-active');
    customBtn.textContent = 'Custom Date';
    recomputeNaturalWindow();
  }

  function activateSpecial() {
    state.timeMode = 'special';
    nowBtn.classList.remove('is-active');
    specialBtn.classList.add('is-active');
    customBtn.classList.remove('is-active');
    customBtn.textContent = 'Custom Date';
    recomputeNaturalWindow();
  }

  function activateCustom(date) {
    state.timeMode = 'custom';
    state.customDate = date;
    nowBtn.classList.remove('is-active');
    specialBtn.classList.remove('is-active');
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

  onOutsideClick(searchInput.closest('.controlbar-search'), () => {
    searchResultsEl.hidden = true;
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
  specialBtn.addEventListener('click', activateSpecial);

  createDatePicker({
    buttonEl: customBtn,
    popoverEl: document.getElementById(ids.datePickerPopover),
    labelEl: document.getElementById(ids.datePickerLabel),
    weekdaysEl: document.getElementById(ids.datePickerWeekdays),
    daysEl: document.getElementById(ids.datePickerDays),
    onSelect: (date) => activateCustom(date),
  });

  // ----- resizable panes -----

  makeResizable(document.getElementById(ids.sidebarResizer), viewEl.querySelector('.sidebar-pane'), map, {
    side: 'left',
    min: 100,
    max: 400,
  });
  makeResizable(document.getElementById(ids.panelResizer), viewEl.querySelector('.panel-pane'), map, {
    side: 'right',
    min: 260,
    max: 600,
  });

  // ----- init -----

  ready.then(() => {
    mapIsReady = true;
    addBuildingsAndTerrain(map);
    setMapTheme(map, currentTheme);

    onMapClick(map, (lonlat) => {
      if (lonlat.buildingHeightM != null) applyBuildingHeight(lonlat.buildingHeightM);
      setLandmark({ name: 'Custom location', lat: lonlat.lat, lon: lonlat.lon });
    });

    updatePanel();
    recomputeNaturalWindow();
  });

  refreshFavouritesUI();
  updateStarUI();

  // Panel data ticks fast — it's cheap and reads as genuinely live.
  setInterval(updatePanel, PANEL_REFRESH_MS);

  // The path/window recompute is heavier and doesn't need second-by-second
  // updates (its natural bounds only change when the body actually rises or
  // sets), so it stays on its own slower cadence.
  setInterval(() => {
    if (state.timeMode === 'now') {
      recomputeNaturalWindow();
    } else {
      updatePath();
    }
  }, LIVE_REFRESH_MS);

  return { map };
}

// ----- Moon Alignment -----

const moonView = createAlignmentView({
  bodyLabel: 'Moon',
  bodyHorizontal: moonHorizontal,
  upWindowFn: moonUpWindow,
  specialEventFn: nextFullMoon,
  computeInfo: computeMoonInfo,
  renderInfo: renderMoonPanel,
  markerColor: '#2d4a9e',
  favouritesStorageKey: 'moonshot.favourites',
  ids: {
    viewId: 'view-alignment',
    search: 'location-search',
    searchResults: 'search-results',
    heightSlider: 'target-height-slider',
    heightInput: 'target-height',
    heightUnitBtn: 'height-unit',
    distanceSlider: 'max-distance-slider',
    distanceInput: 'max-distance',
    nowBtn: 'time-now',
    specialBtn: 'time-fullmoon',
    customBtn: 'time-custom-btn',
    datePickerPopover: 'date-picker-popover',
    datePickerLabel: 'date-picker-label',
    datePickerWeekdays: 'date-picker-weekdays',
    datePickerDays: 'date-picker-days',
    favouriteStarBtn: 'favourite-star-btn',
    favouritesList: 'favourites-list',
    sidebarResizer: 'sidebar-resizer',
    panelResizer: 'panel-resizer',
    map: 'map',
    panel: 'moon-panel',
  },
});

// ----- Sun Alignment -----

const sunView = createAlignmentView({
  bodyLabel: 'Sun',
  bodyHorizontal: sunHorizontal,
  upWindowFn: sunUpWindow,
  specialEventFn: nextSolstice,
  computeInfo: computeSunInfo,
  renderInfo: renderSunPanel,
  markerColor: SUN_MARKER_COLOR,
  favouritesStorageKey: 'moonshot.favourites.sun',
  ids: {
    viewId: 'view-sun-alignment',
    search: 'sun-location-search',
    searchResults: 'sun-search-results',
    heightSlider: 'sun-target-height-slider',
    heightInput: 'sun-target-height',
    heightUnitBtn: 'sun-height-unit',
    distanceSlider: 'sun-max-distance-slider',
    distanceInput: 'sun-max-distance',
    nowBtn: 'sun-time-now',
    specialBtn: 'sun-time-special',
    customBtn: 'sun-time-custom-btn',
    datePickerPopover: 'sun-date-picker-popover',
    datePickerLabel: 'sun-date-picker-label',
    datePickerWeekdays: 'sun-date-picker-weekdays',
    datePickerDays: 'sun-date-picker-days',
    favouriteStarBtn: 'sun-favourite-star-btn',
    favouritesList: 'sun-favourites-list',
    sidebarResizer: 'sun-sidebar-resizer',
    panelResizer: 'sun-panel-resizer',
    map: 'sun-map',
    panel: 'sun-panel',
  },
});

// ----- top-level tabs -----

const viewMaps = {
  alignment: moonView.map,
  'sun-alignment': sunView.map,
};

const topbarTabs = document.querySelectorAll('.topbar-tab');

topbarTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const view = tab.dataset.view;
    topbarTabs.forEach((t) => t.classList.toggle('is-active', t === tab));
    document.querySelectorAll('.view').forEach((el) => el.classList.toggle('is-active', el.id === `view-${view}`));

    // Mapbox renders into a fixed-size canvas that doesn't notice its
    // container coming back from display:none — nudge it to recalculate.
    const map = viewMaps[view];
    if (map) requestAnimationFrame(() => map.resize());
  });
});

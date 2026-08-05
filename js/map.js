// Mapbox GL wiring: map init, landmark marker (click-to-place + draggable),
// alignment path rendering, and forward geocoding search.
// Relies on the global `mapboxgl` (loaded via CDN <script> in index.html).

const PATH_SOURCE_ID = 'alignment-path';
const ARROWS_SOURCE_ID = 'alignment-arrows';
const TIMESTAMPS_SOURCE_ID = 'alignment-timestamps';
const VIRTUAL_POINT_SOURCE_ID = 'virtual-point';
const HIT_LAYER_ID = 'alignment-path-hit';
const LINE_LAYER_ID = 'alignment-path-line';
const ARROWS_LAYER_ID = 'alignment-arrows-symbol';
const TIMESTAMPS_LAYER_ID = 'alignment-timestamps-symbol';
const VIRTUAL_POINT_LAYER_ID = 'virtual-point-pillar';
const TERRAIN_SOURCE_ID = 'mapbox-dem';

const LABEL_INTERVAL_MIN = 10;

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

// The path's own sample points for the segment currently under the mouse,
// kept in module scope so the hover handler (wired once) always reads
// whatever was most recently rendered.
let currentPoints = [];
let tooltipEl = null;

// Toggles the map between a flat top-down view and a tilted 3D view — a
// purpose-built replacement for the compass "reset bearing to north" button
// removed earlier, now covering pitch too (not just bearing) since there's
// an actual 3D view to reset out of.
class ViewModeControl {
  onAdd(map) {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group view-mode-control';

    this._btn2d = document.createElement('button');
    this._btn2d.type = 'button';
    this._btn2d.className = 'view-mode-btn is-active';
    this._btn2d.textContent = '2D';
    this._btn2d.setAttribute('aria-label', 'Reset to flat 2D view');

    this._btn3d = document.createElement('button');
    this._btn3d.type = 'button';
    this._btn3d.className = 'view-mode-btn';
    this._btn3d.textContent = '3D';
    this._btn3d.setAttribute('aria-label', 'Tilt to a 3D view');

    this._btn2d.addEventListener('click', () => {
      map.easeTo({ pitch: 0, bearing: 0 });
    });
    this._btn3d.addEventListener('click', () => {
      map.easeTo({ pitch: 60, bearing: -20 });
    });

    // Single source of truth for the active button: driven off the map's
    // actual pitch rather than only the two buttons above, so manually
    // dragging into/out of a tilted view (right-click drag, two-finger
    // touch) keeps the control in sync too, not just clicking the buttons.
    map.on('pitch', () => this._setActive(map.getPitch() > 0 ? '3d' : '2d'));

    this._container.append(this._btn2d, this._btn3d);
    return this._container;
  }

  onRemove() {
    this._container.remove();
    this._map = undefined;
  }

  _setActive(mode) {
    this._btn2d.classList.toggle('is-active', mode === '2d');
    this._btn3d.classList.toggle('is-active', mode === '3d');
  }
}

// Whether a building click should auto-fill the target-height slider with
// that building's real height — the "Set height automatically" legend
// toggle below. Off by default: the target height now just starts at
// DEFAULT_TARGET_HEIGHT_FT and only otherwise changes via a favourite or a
// manual edit, unless the owner opts back into the old auto-fill behavior.
let autoHeightEnabled = false;

// Top-left legend: toggles for the Standard style's basemap label config,
// plus the app-level "set height automatically" preference. Pinch/scroll-
// wheel zoom covers zooming (no +/- buttons anymore), so this and the
// view-mode control are the map's only chrome besides the scale bar.
class LegendControl {
  onAdd(map) {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'mapboxgl-ctrl map-legend';
    this._container.innerHTML = `
      <label class="legend-row">
        <span class="legend-toggle">
          <input type="checkbox" class="legend-checkbox" data-config="showPointOfInterestLabels" checked />
          <span class="legend-slider"></span>
        </span>
        <span class="legend-label">Business &amp; landmark labels</span>
      </label>
      <label class="legend-row">
        <span class="legend-toggle">
          <input type="checkbox" class="legend-checkbox" data-config="showRoadLabels" checked />
          <span class="legend-slider"></span>
        </span>
        <span class="legend-label">Street names</span>
      </label>
      <label class="legend-row">
        <span class="legend-toggle">
          <input type="checkbox" class="legend-checkbox" data-pref="autoHeight" />
          <span class="legend-slider"></span>
        </span>
        <span class="legend-label">Set height automatically</span>
      </label>
    `;

    this._container.querySelectorAll('.legend-checkbox[data-config]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        map.setConfigProperty('basemap', checkbox.dataset.config, checkbox.checked);
      });
    });

    this._container.querySelector('.legend-checkbox[data-pref="autoHeight"]').addEventListener('change', (e) => {
      autoHeightEnabled = e.target.checked;
    });

    return this._container;
  }

  onRemove() {
    this._container.remove();
    this._map = undefined;
  }
}

export function createMap(containerId, { token, style, center }) {
  mapboxgl.accessToken = token;

  const map = new mapboxgl.Map({
    container: containerId,
    style,
    center: [center.lon, center.lat],
    zoom: 15,
  });
  map.addControl(new LegendControl(), 'top-left');
  map.addControl(new ViewModeControl(), 'bottom-right');
  map.addControl(new mapboxgl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');

  const ready = new Promise((resolve) => map.on('load', resolve));
  return { map, ready };
}

export function addLandmarkMarker(map, lonlat, onDragEnd) {
  const marker = new mapboxgl.Marker({ color: '#2d4a9e', draggable: true })
    .setLngLat([lonlat.lon, lonlat.lat])
    .addTo(map);

  marker.on('dragend', () => {
    const { lng, lat } = marker.getLngLat();
    onDragEnd({ lat, lon: lng });
  });

  return marker;
}

// Ground terrain (a raster-DEM tileset, so this does add some tile fetching
// as you pan/zoom — unlike buildings below, which cost nothing extra).
// Standard renders 3D buildings natively, so there's no custom layer to add
// here anymore (a hand-rolled fill-extrusion layer, like Moonshot used on
// the classic dark-v11 style, would just double them up). 'night' is set
// as the default lightPreset since the style's own default reads far
// lighter/whiter than fits the app's dark theme — 'theme' (default/faded/
// monochrome) is another available lever if 'night' alone isn't enough.
// Call once, after the map's 'load' event.
export function addBuildingsAndTerrain(map) {
  map.addSource(TERRAIN_SOURCE_ID, {
    type: 'raster-dem',
    url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
    tileSize: 512,
    maxzoom: 14,
  });
  map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: 1.0 });
  map.setConfigProperty('basemap', 'lightPreset', 'night');
}

// Fires on every map click with the clicked lng/lat, plus that spot's real
// building height in meters if a building was actually clicked AND the
// "Set height automatically" legend toggle is on — null otherwise (either
// no building was under the click, or the toggle is off). Standard's native
// buildings aren't queryable via the classic queryRenderedFeatures (no
// stable layer id to target), so this uses the newer Interactions/Featureset
// API instead (requires Mapbox GL JS 3.28+; degrades to always-null height
// on older versions rather than throwing).
//
// The building-targeted interaction and the plain map click are two
// separate Mapbox event systems firing off the same physical click, and
// their relative order isn't something we can rely on — the setTimeout
// defers reading the stashed height to the next tick, after both have had
// a chance to run, rather than assuming one fires before the other.
export function onMapClick(map, handler) {
  let pendingBuildingHeight = null;

  if (typeof map.addInteraction === 'function') {
    map.addInteraction('moonshot-building-click', {
      type: 'click',
      target: { featuresetId: 'buildings', importId: 'basemap' },
      handler: ({ feature }) => {
        pendingBuildingHeight = feature?.properties?.height ?? null;
      },
    });
  }

  map.on('click', (e) => {
    const { lat, lng } = e.lngLat;
    setTimeout(() => {
      const buildingHeightM = pendingBuildingHeight;
      pendingBuildingHeight = null;
      handler({ lat, lon: lng, buildingHeightM: autoHeightEnabled ? buildingHeightM : null });
    }, 0);
  });
}

function formatTooltipTime(date) {
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatLabelTime(date) {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function bearingBetween(a, b) {
  const phi1 = a.lat * DEG;
  const phi2 = b.lat * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return (Math.atan2(y, x) * RAD + 360) % 360;
}

function pathToGeoJSON(points) {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: points.map((p) => [p.lon, p.lat]),
        },
        properties: {},
      },
    ],
  };
}

// One arrow per sample point (i.e. every PATH_STEP_MINUTES), each rotated to
// the local direction of travel (from the previous sample to the next one).
// '▶' points east (bearing 90°) at zero rotation, so the rotation applied is
// (bearing - 90) to align it with the true compass bearing.
function arrowsToGeoJSON(points) {
  if (points.length < 2) return { type: 'FeatureCollection', features: [] };

  const features = points.map((p, i) => {
    const from = points[Math.max(0, i - 1)];
    const to = points[Math.min(points.length - 1, i + 1)];
    const bearing = bearingBetween(from, to);
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { rotate: (bearing - 90 + 360) % 360 },
    };
  });

  return { type: 'FeatureCollection', features };
}

// Permanent (always-visible, not just on hover) labels on true round
// clock-time marks (e.g. 11:30, 11:40, 11:50 — not offsets from wherever the
// path happens to start, like the moon's exact moonrise second). The path's
// own samples are fixed 2-min steps from an arbitrary start instant, so they
// essentially never land exactly on a round mark — for each candidate mark
// within the path's span, this picks whichever sample is closest to it and
// labels that point with the *rounded* time text, not the sample's own
// (slightly off) exact time.
function timestampLabelsToGeoJSON(points) {
  if (points.length === 0) return { type: 'FeatureCollection', features: [] };

  const intervalMs = LABEL_INTERVAL_MIN * 60 * 1000;
  const firstMark = Math.ceil(points[0].time.getTime() / intervalMs) * intervalMs;
  const lastMark = Math.floor(points[points.length - 1].time.getTime() / intervalMs) * intervalMs;

  const features = [];
  let searchIdx = 0;

  for (let mark = firstMark; mark <= lastMark; mark += intervalMs) {
    // Advance to the sample straddling this mark, then pick whichever of
    // that sample or the previous one is actually closer.
    while (searchIdx < points.length - 1 && points[searchIdx + 1].time.getTime() < mark) searchIdx++;
    const candidates = [points[searchIdx], points[Math.min(searchIdx + 1, points.length - 1)]];
    const closest = candidates.reduce((best, p) =>
      Math.abs(p.time.getTime() - mark) < Math.abs(best.time.getTime() - mark) ? p : best
    );

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [closest.lon, closest.lat] },
      properties: { label: formatLabelTime(new Date(mark)) },
    });
  }

  return { type: 'FeatureCollection', features };
}

// Finds the closest point on the polyline to (lng, lat) via simple planar
// segment projection (accurate enough for hit-testing at city/regional
// scale), returning the segment index and the fraction along it.
function closestPointOnPath(points, lng, lat) {
  let best = null;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.lon - a.lon;
    const dy = b.lat - a.lat;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? ((lng - a.lon) * dx + (lat - a.lat) * dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const projLon = a.lon + dx * t;
    const projLat = a.lat + dy * t;
    const ddx = projLon - lng;
    const ddy = projLat - lat;
    const d = ddx * ddx + ddy * ddy;
    if (!best || d < best.d) best = { d, i, t };
  }
  return best;
}

function interpolateAt(points, i, t) {
  const a = points[i];
  const b = points[i + 1];
  return {
    time: new Date(a.time.getTime() + (b.time.getTime() - a.time.getTime()) * t),
    distanceM: a.distanceM + (b.distanceM - a.distanceM) * t,
    moonAltitude: a.moonAltitude + (b.moonAltitude - a.moonAltitude) * t,
  };
}

function ensureTooltip(map) {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'path-hover-tooltip';
  map.getContainer().appendChild(tooltipEl);
  return tooltipEl;
}

function wireHover(map) {
  map.on('mouseenter', HIT_LAYER_ID, () => {
    map.getCanvas().style.cursor = 'crosshair';
  });

  map.on('mousemove', HIT_LAYER_ID, (e) => {
    if (currentPoints.length < 2) return;
    const best = closestPointOnPath(currentPoints, e.lngLat.lng, e.lngLat.lat);
    if (!best) return;
    const info = interpolateAt(currentPoints, best.i, best.t);

    const tip = ensureTooltip(map);
    tip.style.display = 'block';
    tip.style.left = `${e.point.x}px`;
    tip.style.top = `${e.point.y}px`;
    tip.innerHTML = `<strong>${formatTooltipTime(info.time)}</strong><br>${Math.round(info.distanceM).toLocaleString()} m away · moon alt ${info.moonAltitude.toFixed(1)}°`;
  });

  map.on('mouseleave', HIT_LAYER_ID, () => {
    map.getCanvas().style.cursor = '';
    if (tooltipEl) tooltipEl.style.display = 'none';
  });
}

// Adds the path/arrow/timestamp layers on first call, updates their data on later calls.
export function renderAlignmentPath(map, points) {
  currentPoints = points;
  const lineData = pathToGeoJSON(points);
  const arrowData = arrowsToGeoJSON(points);
  const timestampData = timestampLabelsToGeoJSON(points);

  const lineSource = map.getSource(PATH_SOURCE_ID);
  const arrowSource = map.getSource(ARROWS_SOURCE_ID);
  const timestampSource = map.getSource(TIMESTAMPS_SOURCE_ID);

  if (lineSource && arrowSource && timestampSource) {
    lineSource.setData(lineData);
    arrowSource.setData(arrowData);
    timestampSource.setData(timestampData);
    return;
  }

  map.addSource(PATH_SOURCE_ID, { type: 'geojson', data: lineData });
  map.addSource(ARROWS_SOURCE_ID, { type: 'geojson', data: arrowData });
  map.addSource(TIMESTAMPS_SOURCE_ID, { type: 'geojson', data: timestampData });

  // Wide, invisible line purely to give the thin visible line a forgiving hover hit-area.
  map.addLayer({
    id: HIT_LAYER_ID,
    type: 'line',
    source: PATH_SOURCE_ID,
    paint: { 'line-width': 16, 'line-opacity': 0 },
  });

  map.addLayer({
    id: LINE_LAYER_ID,
    type: 'line',
    source: PATH_SOURCE_ID,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-width': 2,
      'line-color': '#2d4a9e',
    },
  });

  map.addLayer({
    id: ARROWS_LAYER_ID,
    type: 'symbol',
    source: ARROWS_SOURCE_ID,
    layout: {
      'text-field': '▶',
      'text-size': 14,
      'text-rotate': ['get', 'rotate'],
      'text-rotation-alignment': 'map',
      'text-allow-overlap': true,
      'text-ignore-placement': true,
      'text-keep-upright': false,
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': '#000000',
      'text-halo-width': 1,
    },
  });

  map.addLayer({
    id: TIMESTAMPS_LAYER_ID,
    type: 'symbol',
    source: TIMESTAMPS_SOURCE_ID,
    layout: {
      'text-field': ['get', 'label'],
      // Smoothly scales with zoom instead of jumping between fixed sizes.
      'text-size': ['interpolate', ['linear'], ['zoom'], 10, 8, 14, 11, 18, 15],
      'text-anchor': 'top',
      'text-offset': [0, 0.6],
      // Let Mapbox's own label collision handling thin these out when
      // zoomed out (rather than every-10-min label overlapping into an
      // unreadable jumble), and reveal more of them as you zoom in.
      'text-allow-overlap': false,
      'text-ignore-placement': false,
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': '#000000',
      'text-halo-width': 1,
    },
  });

  wireHover(map);
}

export function clearAlignmentPath(map) {
  renderAlignmentPath(map, []);
}

const METERS_PER_DEG_LAT = 111320;

// A small square footprint (a few meters across) centered on the landmark —
// not meant to be seen from directly above, just wide enough for the
// fill-extrusion pillar built on it to read clearly once the map is tilted.
function pillarFootprint(landmark, radiusM = 1.5) {
  const dLat = radiusM / METERS_PER_DEG_LAT;
  const dLon = radiusM / (METERS_PER_DEG_LAT * Math.cos(landmark.lat * DEG));
  const { lat, lon } = landmark;
  return [
    [lon - dLon, lat - dLat],
    [lon + dLon, lat - dLat],
    [lon + dLon, lat + dLat],
    [lon - dLon, lat + dLat],
    [lon - dLon, lat - dLat],
  ];
}

// Mapbox's Marker class has no way to anchor at a real-world altitude
// (that requires terrain + the still-experimental line-z-offset family of
// properties). fill-extrusion is mature and stable and needs neither: a
// thin vertical pillar from the ground up to the target height reads as
// "the virtual point is right here, this high up" once the map is tilted
// into 3D — at pitch 0 it's invisible-by-design (just its flat footprint).
export function renderVirtualPoint(map, landmark, heightM) {
  const data = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [pillarFootprint(landmark)] },
        properties: { height: heightM },
      },
    ],
  };

  const source = map.getSource(VIRTUAL_POINT_SOURCE_ID);
  if (source) {
    source.setData(data);
    return;
  }

  map.addSource(VIRTUAL_POINT_SOURCE_ID, { type: 'geojson', data });
  map.addLayer({
    id: VIRTUAL_POINT_LAYER_ID,
    type: 'fill-extrusion',
    source: VIRTUAL_POINT_SOURCE_ID,
    paint: {
      'fill-extrusion-color': '#2d4a9e',
      'fill-extrusion-height': ['get', 'height'],
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.9,
    },
  });
}

export async function geocode(query, token, proximity) {
  if (!query.trim()) return [];
  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`
  );
  url.searchParams.set('access_token', token);
  url.searchParams.set('limit', '5');
  if (proximity) url.searchParams.set('proximity', `${proximity.lon},${proximity.lat}`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  const data = await res.json();

  return (data.features || []).map((f) => ({
    name: f.place_name,
    lat: f.center[1],
    lon: f.center[0],
  }));
}

// Mapbox GL wiring: map init, landmark marker (click-to-place + draggable),
// alignment path rendering, and forward geocoding search.
// Relies on the global `mapboxgl` (loaded via CDN <script> in index.html).

const PATH_SOURCE_ID = 'alignment-path';
const ARROWS_SOURCE_ID = 'alignment-arrows';
const TIMESTAMPS_SOURCE_ID = 'alignment-timestamps';
const HIT_LAYER_ID = 'alignment-path-hit';
const LINE_LAYER_ID = 'alignment-path-line';
const ARROWS_LAYER_ID = 'alignment-arrows-symbol';
const TIMESTAMPS_LAYER_ID = 'alignment-timestamps-symbol';

const LABEL_INTERVAL_MIN = 10;

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

// The path's own sample points for the segment currently under the mouse,
// kept in module scope so the hover handler (wired once) always reads
// whatever was most recently rendered.
let currentPoints = [];
let tooltipEl = null;

export function createMap(containerId, { token, style, center }) {
  mapboxgl.accessToken = token;

  const map = new mapboxgl.Map({
    container: containerId,
    style,
    center: [center.lon, center.lat],
    zoom: 15,
  });
  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

  const ready = new Promise((resolve) => map.on('load', resolve));
  return { map, ready };
}

export function addLandmarkMarker(map, lonlat, onDragEnd) {
  const marker = new mapboxgl.Marker({ color: '#ffcc66', draggable: true })
    .setLngLat([lonlat.lon, lonlat.lat])
    .addTo(map);

  marker.on('dragend', () => {
    const { lng, lat } = marker.getLngLat();
    onDragEnd({ lat, lon: lng });
  });

  return marker;
}

export function onMapClick(map, handler) {
  map.on('click', (e) => handler({ lat: e.lngLat.lat, lon: e.lngLat.lng }));
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

// Permanent (always-visible, not just on hover) labels every LABEL_INTERVAL_MIN
// minutes of elapsed path time — computed from actual elapsed time rather than
// a fixed sample-index stride, so this stays correct if PATH_STEP_MINUTES ever
// changes to something that doesn't evenly divide the interval.
function timestampLabelsToGeoJSON(points) {
  if (points.length === 0) return { type: 'FeatureCollection', features: [] };

  const startMs = points[0].time.getTime();
  const features = points
    .filter((p) => Math.round((p.time.getTime() - startMs) / 60000) % LABEL_INTERVAL_MIN === 0)
    .map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { label: formatLabelTime(p.time) },
    }));

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
      'line-color': '#ffcc66',
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

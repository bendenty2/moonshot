// Mapbox GL wiring: map init, landmark marker (click-to-place + draggable),
// alignment path rendering, and forward geocoding search.
// Relies on the global `mapboxgl` (loaded via CDN <script> in index.html).

const PATH_SOURCE_ID = 'alignment-path';
const ARROWS_SOURCE_ID = 'alignment-arrows';
const HIT_LAYER_ID = 'alignment-path-hit';
const LINE_LAYER_ID = 'alignment-path-line';
const ARROWS_LAYER_ID = 'alignment-arrows-symbol';

const SLOW_COLOR = [255, 204, 102]; // yellow (--accent)
const FAST_COLOR = [61, 133, 246]; // blue

const EARTH_RADIUS_M = 6371000;
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
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function haversineMeters(a, b) {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
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

// ~`count` evenly-spaced arrow markers along the path, each rotated to the
// local direction of travel (from the previous sample to the next one).
// '▶' points east (bearing 90°) at zero rotation, so the rotation applied is
// (bearing - 90) to align it with the true compass bearing.
function arrowsToGeoJSON(points, count) {
  if (points.length < 2) return { type: 'FeatureCollection', features: [] };

  const step = Math.max(1, Math.floor(points.length / count));
  const features = [];

  for (let i = step; i < points.length - 1; i += step) {
    const from = points[i - 1];
    const to = points[Math.min(i + 1, points.length - 1)];
    const bearing = bearingBetween(from, to);
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [points[i].lon, points[i].lat] },
      properties: { rotate: (bearing - 90 + 360) % 360 },
    });
  }

  return { type: 'FeatureCollection', features };
}

function lerpColor(t) {
  const c = SLOW_COLOR.map((slow, i) => Math.round(slow + (FAST_COLOR[i] - slow) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// Builds a `line-gradient` expression coloring each stretch of the path by
// how fast the observer point is moving there (ground distance covered per
// fixed time step) — blue where it's moving quickly (typically near the
// horizon segments), yellow where it's moving slowly (near culmination).
function buildGradientExpression(points) {
  const FALLBACK = ['interpolate', ['linear'], ['line-progress'], 0, '#ffcc66', 1, '#ffcc66'];
  if (points.length < 2) return FALLBACK;

  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + haversineMeters(points[i - 1], points[i]));
  const total = cum[cum.length - 1];
  if (total <= 0) return FALLBACK;

  const segSpeed = [];
  for (let i = 0; i < points.length - 1; i++) segSpeed.push(haversineMeters(points[i], points[i + 1]));
  const minSpeed = Math.min(...segSpeed);
  const maxSpeed = Math.max(...segSpeed);
  const norm = (s) => (maxSpeed > minSpeed ? (s - minSpeed) / (maxSpeed - minSpeed) : 0.5);

  const stopCount = Math.min(60, segSpeed.length);
  const stops = ['interpolate', ['linear'], ['line-progress']];
  let lastT = -1;

  for (let s = 0; s < stopCount; s++) {
    const segIdx = Math.min(segSpeed.length - 1, Math.round((s / (stopCount - 1)) * (segSpeed.length - 1)));
    let t = cum[segIdx] / total;
    if (t <= lastT) t = lastT + 1e-6;
    lastT = t;
    stops.push(t, lerpColor(norm(segSpeed[segIdx])));
  }
  if (lastT < 1) stops.push(1, lerpColor(norm(segSpeed[segSpeed.length - 1])));

  return stops;
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

// Adds the path/arrow layers on first call, updates their data (and the
// speed gradient) on later calls.
export function renderAlignmentPath(map, points) {
  currentPoints = points;
  const lineData = pathToGeoJSON(points);
  const arrowData = arrowsToGeoJSON(points, 10);
  const gradient = buildGradientExpression(points);

  const lineSource = map.getSource(PATH_SOURCE_ID);
  const arrowSource = map.getSource(ARROWS_SOURCE_ID);

  if (lineSource && arrowSource) {
    lineSource.setData(lineData);
    arrowSource.setData(arrowData);
    map.setPaintProperty(LINE_LAYER_ID, 'line-gradient', gradient);
    return;
  }

  map.addSource(PATH_SOURCE_ID, { type: 'geojson', data: lineData, lineMetrics: true });
  map.addSource(ARROWS_SOURCE_ID, { type: 'geojson', data: arrowData });

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
      'line-gradient': gradient,
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

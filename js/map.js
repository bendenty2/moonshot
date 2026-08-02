// Mapbox GL wiring: map init, landmark marker (click-to-place + draggable),
// alignment path rendering, and forward geocoding search.
// Relies on the global `mapboxgl` (loaded via CDN <script> in index.html).

const PATH_SOURCE_ID = 'alignment-path';
const POINTS_SOURCE_ID = 'alignment-points';

export function createMap(containerId, { token, style, center }) {
  mapboxgl.accessToken = token;

  const map = new mapboxgl.Map({
    container: containerId,
    style,
    center: [center.lon, center.lat],
    zoom: 15,
  });
  map.addControl(new mapboxgl.NavigationControl(), 'top-right');

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

function formatTimestamp(date) {
  return date.toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
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

function pointsToGeoJSON(points) {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: {
        label: formatTimestamp(p.time),
        distanceM: Math.round(p.distanceM),
        moonAltitude: p.moonAltitude.toFixed(1),
      },
    })),
  };
}

// Adds the path/point layers on first call, updates their data on later calls.
export function renderAlignmentPath(map, points) {
  const lineData = pathToGeoJSON(points);
  const pointData = pointsToGeoJSON(points);

  const lineSource = map.getSource(PATH_SOURCE_ID);
  const pointSource = map.getSource(POINTS_SOURCE_ID);

  if (lineSource && pointSource) {
    lineSource.setData(lineData);
    pointSource.setData(pointData);
    return;
  }

  map.addSource(PATH_SOURCE_ID, { type: 'geojson', data: lineData });
  map.addSource(POINTS_SOURCE_ID, { type: 'geojson', data: pointData });

  map.addLayer({
    id: 'alignment-path-line',
    type: 'line',
    source: PATH_SOURCE_ID,
    paint: {
      'line-color': '#ffcc66',
      'line-width': 2,
      'line-opacity': 0.8,
    },
  });

  map.addLayer({
    id: 'alignment-points-circle',
    type: 'circle',
    source: POINTS_SOURCE_ID,
    paint: {
      'circle-radius': 4,
      'circle-color': '#ffcc66',
      'circle-stroke-width': 1,
      'circle-stroke-color': '#1a1a1a',
    },
  });

  const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });

  map.on('mouseenter', 'alignment-points-circle', (e) => {
    map.getCanvas().style.cursor = 'pointer';
    const f = e.features[0];
    const { label, distanceM, moonAltitude } = f.properties;
    popup
      .setLngLat(f.geometry.coordinates)
      .setHTML(
        `<strong>${label}</strong><br>${distanceM.toLocaleString()} m away · moon alt ${moonAltitude}°`
      )
      .addTo(map);
  });

  map.on('mouseleave', 'alignment-points-circle', () => {
    map.getCanvas().style.cursor = '';
    popup.remove();
  });
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

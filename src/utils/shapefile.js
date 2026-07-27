import shp from 'shpjs';
import shpwrite from '@mapbox/shp-write';
import JSZip from 'jszip';

/**
 * Normalize shpjs output into a single GeoJSON FeatureCollection.
 * Zip archives with multiple layers come back as { layerName: FeatureCollection }.
 */
export function normalizeToFeatureCollection(parsed) {
  if (!parsed) return null;

  if (parsed.type === 'FeatureCollection') {
    return parsed;
  }

  if (parsed.type === 'Feature') {
    return { type: 'FeatureCollection', features: [parsed] };
  }

  if (Array.isArray(parsed)) {
    if (parsed.length && parsed[0]?.type === 'FeatureCollection') {
      return {
        type: 'FeatureCollection',
        features: parsed.flatMap((fc) => fc.features || []),
      };
    }
    return { type: 'FeatureCollection', features: parsed };
  }

  if (typeof parsed === 'object') {
    const collections = Object.values(parsed).filter(
      (v) => v && (v.type === 'FeatureCollection' || Array.isArray(v.features))
    );
    if (collections.length) {
      return {
        type: 'FeatureCollection',
        features: collections.flatMap((fc) => fc.features || []),
      };
    }
  }

  return null;
}

/**
 * Parse an uploaded GIS file into a GeoJSON FeatureCollection.
 * Supports: .zip shapefile (ArcGIS export), .geojson / .json
 */
export async function parseGisUpload(file) {
  const name = (file.name || '').toLowerCase();

  if (name.endsWith('.geojson') || name.endsWith('.json')) {
    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Invalid GeoJSON: could not parse JSON.');
    }
    const fc = normalizeToFeatureCollection(parsed);
    if (!fc) throw new Error('Invalid GeoJSON: expected a FeatureCollection or Feature.');
    return fc;
  }

  if (name.endsWith('.zip')) {
    const buffer = await file.arrayBuffer();
    let parsed;
    try {
      parsed = await shp(buffer);
    } catch (err) {
      throw new Error(
        err?.message ||
          'Could not read shapefile zip. Ensure it includes .shp, .shx, and .dbf.'
      );
    }
    const fc = normalizeToFeatureCollection(parsed);
    if (!fc) throw new Error('No readable layers found in the shapefile zip.');
    return fc;
  }

  if (name.endsWith('.shp') || name.endsWith('.shx') || name.endsWith('.dbf') || name.endsWith('.prj')) {
    throw new Error(
      'Please upload a .zip containing the full shapefile set (.shp, .shx, and .dbf), or a .geojson file.'
    );
  }

  throw new Error('Unsupported file type. Upload a .zip shapefile or .geojson / .json.');
}

const LAYER_EXPORT_NAMES = {
  sf_ws_all: 'watersheds',
  sf_river_ode: 'rivers_main',
  sf_river_trib: 'rivers_tributary',
  sf_river_middle: 'rivers_middle',
  sf_river_rock: 'rivers_rock',
};

function sanitizeLayerName(name) {
  return String(name || 'layer')
    .replace(/^sf_/, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .slice(0, 40) || 'layer';
}

/** Shapefile DBF-friendly property values. */
function sanitizeProperties(props) {
  if (!props || typeof props !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(props)) {
    const field = String(key).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 10) || 'attr';
    if (value == null) {
      out[field] = null;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[field] = value;
    } else if (typeof value === 'string') {
      out[field] = value.slice(0, 254);
    } else {
      out[field] = JSON.stringify(value).slice(0, 254);
    }
  }
  return out;
}

function prepareFeatureCollection(geojson) {
  const fc = normalizeToFeatureCollection(geojson);
  if (!fc?.features?.length) return null;

  const features = [];
  for (const f of fc.features) {
    if (!f?.geometry?.type || f.geometry.type === 'GeometryCollection') continue;
    const props = sanitizeProperties(f.properties);
    const { type, coordinates } = f.geometry;

    // Explode multi-geometries so shp-write does not overwrite polygon vs multipolygon files
    if (type === 'MultiPolygon') {
      for (const coords of coordinates) {
        features.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: coords } });
      }
    } else if (type === 'MultiLineString') {
      for (const coords of coordinates) {
        features.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } });
      }
    } else if (type === 'MultiPoint') {
      for (const coords of coordinates) {
        features.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: coords } });
      }
    } else {
      features.push({ type: 'Feature', properties: props, geometry: f.geometry });
    }
  }

  if (!features.length) return null;
  return { type: 'FeatureCollection', features };
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Convert DRN watershed GeoJSON layers into an ArcGIS-ready shapefile zip and download it.
 * Each layer becomes a folder with .shp / .shx / .dbf / .prj.
 */
export async function downloadWatershedShapefiles(layers, {
  direction = 'downstream',
  filename,
} = {}) {
  if (!layers || typeof layers !== 'object') {
    throw new Error('No watershed layers available to download.');
  }

  const master = new JSZip();
  let exported = 0;

  for (const [key, geojson] of Object.entries(layers)) {
    const prepared = prepareFeatureCollection(geojson);
    if (!prepared) continue;

    const layerName = sanitizeLayerName(LAYER_EXPORT_NAMES[key] || key);
    const layerZipData = await shpwrite.zip(prepared, {
      folder: layerName,
      types: {
        point: layerName,
        polygon: layerName,
        polyline: layerName,
        multipolygon: layerName,
        multiline: layerName,
        line: layerName,
      },
      outputType: 'arraybuffer',
      compression: 'DEFLATE',
    });

    const layerZip = await JSZip.loadAsync(layerZipData);
    const fileEntries = Object.values(layerZip.files).filter((f) => !f.dir);
    if (!fileEntries.length) continue;

    for (const file of fileEntries) {
      const content = await file.async('uint8array');
      const dest = file.name.includes('/')
        ? file.name
        : `${layerName}/${file.name}`;
      master.file(dest, content);
    }
    exported += 1;
  }

  if (!exported) {
    throw new Error('No drawable features found in the watershed results.');
  }

  const blob = await master.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const stamp = new Date().toISOString().slice(0, 10);
  const outName = filename || `drn_${direction}_watersheds_${stamp}.zip`;
  triggerBlobDownload(blob, outName);
  return { layers: exported, filename: outName };
}

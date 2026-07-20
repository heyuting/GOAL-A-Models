import shp from 'shpjs';

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
      'Please upload a .zip containing the full shapefile set (.shp, .shx, .dbf), or a .geojson file.'
    );
  }

  throw new Error('Unsupported file type. Upload a .zip shapefile or .geojson / .json.');
}

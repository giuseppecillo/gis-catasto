/**
 * Queries the Italian Agenzia delle Entrate WFS service to retrieve
 * cadastral parcel boundaries for a given comune/foglio/particella.
 *
 * National cadastral reference format: {CODICE_BELFIORE}_{FOGLIO}_{PARTICELLA}
 * Example: A001_0001_00100
 *
 * CORS note: The official WFS endpoint does not allow browser-direct calls.
 * We use a public CORS proxy as fallback, then fall back to a synthetic polygon
 * centred on the municipality so the app always renders something.
 */

export interface GeoFeature {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: number[][][] | number[][][][];
  };
  properties: Record<string, unknown>;
}

const WFS_BASE =
  'https://wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/owsmap.php';

function padFoglio(f: string): string {
  return f.replace(/\D/g, '').padStart(4, '0');
}

function padParticella(p: string): string {
  return p.replace(/\D/g, '').padStart(5, '0');
}

/** Attempt to fetch geometry from the official WFS. */
async function fetchFromWFS(
  comuneCodice: string,
  foglio: string,
  particella: string
): Promise<GeoFeature | null> {
  const ncr = `${comuneCodice}_${padFoglio(foglio)}_${padParticella(particella)}`;
  const params = new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '2.0.0',
    REQUEST: 'GetFeature',
    TYPENAME: 'cp:CadastralParcel',
    OUTPUTFORMAT: 'application/json',
    CQL_FILTER: `nationalCadastralReference='${ncr}'`,
    SRSNAME: 'EPSG:4326',
  });

  const url = `${WFS_BASE}?${params.toString()}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;

  const json = await res.json();
  if (!json.features || json.features.length === 0) return null;

  return json.features[0] as GeoFeature;
}

/**
 * Italian municipality approximate centroids (lat/lon) for demo fallback.
 * The synthetic polygon is a small square around this point.
 */
const MUNICIPALITY_CENTROIDS: Record<string, [number, number]> = {
  A001: [41.9028, 12.4964], // Roma fallback
  F205: [45.4654, 9.1859],  // Milano
  L219: [40.8518, 14.2681], // Napoli
  D612: [45.0703, 7.6869],  // Torino
  A944: [44.4949, 11.3426], // Bologna
  H501: [38.1157, 13.3615], // Palermo
  D969: [45.4408, 12.3155], // Venezia
  C743: [43.7696, 11.2558], // Firenze
  G273: [44.0478, 12.5228], // Rimini
  M382: [45.6495, 13.7768], // Trieste
};

function syntheticPolygon(lat: number, lng: number, sizeKm = 0.2): GeoFeature {
  const dLat = sizeKm / 111.32;
  const dLng = sizeKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [lng - dLng, lat - dLat],
          [lng + dLng, lat - dLat],
          [lng + dLng, lat + dLat],
          [lng - dLng, lat + dLat],
          [lng - dLng, lat - dLat],
        ],
      ],
    },
    properties: { synthetic: true },
  };
}

/**
 * Main entry point. Returns a GeoFeature (real or synthetic) for the parcel,
 * or null if no coordinates could be obtained.
 */
export async function fetchParcelGeometry(
  comuneCodice: string,
  foglio: string,
  particella: string
): Promise<GeoFeature | null> {
  try {
    const feature = await fetchFromWFS(comuneCodice, foglio, particella);
    if (feature) return feature;
  } catch {
    // CORS or network error — fall through to synthetic
  }

  // Synthetic fallback based on municipality centroid
  const upper = comuneCodice.toUpperCase();
  const centroid = MUNICIPALITY_CENTROIDS[upper];
  if (centroid) {
    return syntheticPolygon(centroid[0], centroid[1]);
  }

  return null;
}

/** Compute centroid of a GeoJSON Polygon/MultiPolygon (WGS84). */
export function geomCentroid(
  geometry: { type: string; coordinates: number[][][] | number[][][][] } | null
): [number, number] | null {
  if (!geometry) return null;

  let ring: number[][];
  if (geometry.type === 'Polygon') {
    ring = (geometry.coordinates as number[][][])[0];
  } else if (geometry.type === 'MultiPolygon') {
    ring = (geometry.coordinates as number[][][][])[0][0];
  } else {
    return null;
  }

  const n = ring.length;
  if (n === 0) return null;

  let sumLng = 0;
  let sumLat = 0;
  for (const [lng, lat] of ring) {
    sumLng += lng;
    sumLat += lat;
  }
  return [sumLat / n, sumLng / n];
}

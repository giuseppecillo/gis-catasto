/**
 * Shapefile (ESRI .shp/.shx/.dbf/.prj) writer in pure TypeScript.
 * Produces EPSG:4326 (WGS 84) polygon shapefiles bundled into a .zip
 * using the globally-loaded JSZip library.
 *
 * Supports Polygon and MultiPolygon GeoJSON geometries.
 */

import type { Parcel } from '../types';

declare const JSZip: {
  new (): {
    file(name: string, data: ArrayBuffer | string): void;
    generateAsync(opts: { type: string }): Promise<Blob>;
  };
};

// ─── WGS84 .prj string ───────────────────────────────────────────────────────
const PRJ_WGS84 =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",' +
  'SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

// ─── Little helpers ──────────────────────────────────────────────────────────

function writeInt32BE(view: DataView, offset: number, value: number) {
  view.setInt32(offset, value, false);
}
function writeInt32LE(view: DataView, offset: number, value: number) {
  view.setInt32(offset, value, true);
}
function writeFloat64LE(view: DataView, offset: number, value: number) {
  view.setFloat64(offset, value, true);
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Ring = [number, number][];
type PolygonParts = Ring[];

function geoJsonToRings(geometry: Parcel['geometry']): PolygonParts {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') {
    return (geometry.coordinates as number[][][]).map((ring) =>
      ring.map(([x, y]) => [x, y] as [number, number])
    );
  }
  if (geometry.type === 'MultiPolygon') {
    const all: PolygonParts = [];
    for (const poly of geometry.coordinates as number[][][][]) {
      for (const ring of poly) {
        all.push(ring.map(([x, y]) => [x, y] as [number, number]));
      }
    }
    return all;
  }
  return [];
}

// ─── BBox ────────────────────────────────────────────────────────────────────

function ringBBox(ring: Ring): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

function mergeBBox(
  a: [number, number, number, number],
  b: [number, number, number, number]
): [number, number, number, number] {
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
}

// ─── SHP record for one parcel ───────────────────────────────────────────────

interface ShpRecord {
  contentBytes: Uint8Array;
  bbox: [number, number, number, number];
}

function buildShpRecord(parts: PolygonParts): ShpRecord | null {
  if (parts.length === 0) return null;

  const numParts = parts.length;
  const numPoints = parts.reduce((s, r) => s + r.length, 0);

  // Shape type 5 = Polygon
  // Content length: 4 (type) + 32 (bbox) + 4 (numParts) + 4 (numPoints)
  //               + 4*numParts (parts array) + 16*numPoints (XY pairs)
  const contentLen = 4 + 32 + 4 + 4 + 4 * numParts + 16 * numPoints;
  const buf = new ArrayBuffer(contentLen);
  const view = new DataView(buf);
  let off = 0;

  let bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of parts) bbox = mergeBBox(bbox, ringBBox(ring));

  writeInt32LE(view, off, 5); off += 4; // shape type = Polygon
  writeFloat64LE(view, off, bbox[0]); off += 8; // Xmin
  writeFloat64LE(view, off, bbox[1]); off += 8; // Ymin
  writeFloat64LE(view, off, bbox[2]); off += 8; // Xmax
  writeFloat64LE(view, off, bbox[3]); off += 8; // Ymax
  writeInt32LE(view, off, numParts); off += 4;
  writeInt32LE(view, off, numPoints); off += 4;

  let pointOffset = 0;
  for (const ring of parts) {
    writeInt32LE(view, off, pointOffset); off += 4;
    pointOffset += ring.length;
  }
  for (const ring of parts) {
    for (const [x, y] of ring) {
      writeFloat64LE(view, off, x); off += 8;
      writeFloat64LE(view, off, y); off += 8;
    }
  }

  return { contentBytes: new Uint8Array(buf), bbox };
}

// ─── SHP + SHX file buffers ──────────────────────────────────────────────────

function buildShpShx(records: (ShpRecord | null)[]): {
  shp: ArrayBuffer;
  shx: ArrayBuffer;
} {
  const SHP_HEADER = 100;
  const SHX_HEADER = 100;

  // Compute total content size (each record = 8-byte record header + content)
  let totalContent = 0;
  const offsets: number[] = [];
  for (const rec of records) {
    offsets.push(SHP_HEADER + totalContent);
    totalContent += rec ? 8 + rec.contentBytes.length : 12; // null shape = 12
  }
  const shpLen = SHP_HEADER + totalContent; // in bytes
  const shxLen = SHX_HEADER + records.length * 8;

  const shpBuf = new ArrayBuffer(shpLen);
  const shpView = new DataView(shpBuf);
  const shpU8 = new Uint8Array(shpBuf);

  const shxBuf = new ArrayBuffer(shxLen);
  const shxView = new DataView(shxBuf);

  // File-wide bbox
  let fileBBox: [number, number, number, number] = [
    Infinity, Infinity, -Infinity, -Infinity,
  ];
  for (const rec of records) {
    if (rec) fileBBox = mergeBBox(fileBBox, rec.bbox);
  }
  if (!isFinite(fileBBox[0])) fileBBox = [0, 0, 0, 0];

  function writeHeader(view: DataView, fileCodeInWords: number, lenInWords: number) {
    writeInt32BE(view, 0, 9994);          // file code
    writeInt32BE(view, 24, lenInWords);    // file length (16-bit words)
    writeInt32LE(view, 28, 1000);          // version
    writeInt32LE(view, 32, 5);             // shape type = Polygon
    writeFloat64LE(view, 36, fileBBox[0]); // Xmin
    writeFloat64LE(view, 44, fileBBox[1]); // Ymin
    writeFloat64LE(view, 52, fileBBox[2]); // Xmax
    writeFloat64LE(view, 60, fileBBox[3]); // Ymax
    // Z/M ranges left as 0
  }

  writeHeader(shpView, 9994, shpLen / 2);
  writeHeader(shxView, 9994, shxLen / 2);

  let shpOff = SHP_HEADER;
  let shxOff = SHX_HEADER;

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const recNum = i + 1;

    // SHX entry (offsets in 16-bit words)
    writeInt32BE(shxView, shxOff, offsets[i] / 2); shxOff += 4;
    const contentLen = rec ? rec.contentBytes.length : 4;
    writeInt32BE(shxView, shxOff, contentLen / 2); shxOff += 4;

    // SHP record header
    writeInt32BE(shpView, shpOff, recNum);        shpOff += 4;
    writeInt32BE(shpView, shpOff, contentLen / 2); shpOff += 4;

    if (rec) {
      shpU8.set(rec.contentBytes, shpOff);
      shpOff += rec.contentBytes.length;
    } else {
      // Null shape
      writeInt32LE(shpView, shpOff, 0); shpOff += 4;
    }
  }

  return { shp: shpBuf, shx: shxBuf };
}

// ─── DBF ────────────────────────────────────────────────────────────────────

function encodeDbf(parcels: Parcel[]): ArrayBuffer {
  // Fields: LABEL(50), COMUNE(60), CODICE(6), FOGLIO(10), PARTICELLA(10), COLTURA(60), SUPERF_HA(N,12,4)
  const fields: { name: string; type: 'C' | 'N'; length: number; dec: number }[] = [
    { name: 'LABEL', type: 'C', length: 50, dec: 0 },
    { name: 'COMUNE', type: 'C', length: 60, dec: 0 },
    { name: 'CODICE', type: 'C', length: 6, dec: 0 },
    { name: 'FOGLIO', type: 'C', length: 10, dec: 0 },
    { name: 'PARTICELLA', type: 'C', length: 10, dec: 0 },
    { name: 'COLTURA', type: 'C', length: 60, dec: 0 },
    { name: 'SUPERF_HA', type: 'N', length: 12, dec: 4 },
    { name: 'NOTE', type: 'C', length: 100, dec: 0 },
  ];

  const HEADER_SIZE = 32 + fields.length * 32 + 1;
  const recordSize = 1 + fields.reduce((s, f) => s + f.length, 0);
  const numRecords = parcels.length;
  const totalSize = HEADER_SIZE + numRecords * recordSize + 1;

  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);
  const encoder = new TextEncoder();

  const now = new Date();
  view.setUint8(0, 3);              // dBASE III
  view.setUint8(1, now.getFullYear() - 1900);
  view.setUint8(2, now.getMonth() + 1);
  view.setUint8(3, now.getDate());
  writeInt32LE(view, 4, numRecords);
  view.setUint16(8, HEADER_SIZE, true);
  view.setUint16(10, recordSize, true);

  let off = 32;
  for (const f of fields) {
    const nameBytes = encoder.encode(f.name.padEnd(11, '\0').substring(0, 11));
    u8.set(nameBytes, off); off += 11;
    u8[off] = f.type.charCodeAt(0); off += 1;
    off += 4; // reserved
    view.setUint8(off, f.length); off += 1;
    view.setUint8(off, f.dec); off += 1;
    off += 14; // reserved
  }
  u8[off] = 0x0d; off += 1; // header terminator

  for (const p of parcels) {
    u8[off] = 0x20; off += 1; // deletion flag = not deleted

    function writeField(
      value: string | number | null | undefined,
      length: number,
      type: 'C' | 'N',
      dec: number
    ) {
      let str: string;
      if (type === 'N') {
        const n = typeof value === 'number' ? value : parseFloat(String(value ?? 0)) || 0;
        str = n.toFixed(dec).padStart(length);
      } else {
        str = String(value ?? '').substring(0, length).padEnd(length, ' ');
      }
      const bytes = encoder.encode(str);
      u8.set(bytes.subarray(0, length), off);
      off += length;
    }

    writeField(p.label, 50, 'C', 0);
    writeField(p.comune, 60, 'C', 0);
    writeField(p.comune_codice, 6, 'C', 0);
    writeField(p.foglio, 10, 'C', 0);
    writeField(p.particella, 10, 'C', 0);
    writeField(p.coltura, 60, 'C', 0);
    writeField(p.superficie_ha, 12, 'N', 4);
    writeField(p.note, 100, 'C', 0);
  }

  u8[off] = 0x1a; // EOF marker
  return buf;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function downloadShapefile(parcels: Parcel[]): Promise<void> {
  const records = parcels.map((p) => {
    const parts = geoJsonToRings(p.geometry);
    return buildShpRecord(parts);
  });

  const { shp, shx } = buildShpShx(records);
  const dbf = encodeDbf(parcels);

  const zip = new JSZip();
  zip.file('appezzamenti.shp', shp);
  zip.file('appezzamenti.shx', shx);
  zip.file('appezzamenti.dbf', dbf);
  zip.file('appezzamenti.prj', PRJ_WGS84);

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'appezzamenti_4326.zip';
  a.click();
  URL.revokeObjectURL(url);
}

/** Also export as GeoJSON as a simpler alternative. */
export function downloadGeoJSON(parcels: Parcel[]): void {
  const fc = {
    type: 'FeatureCollection',
    features: parcels.map((p) => ({
      type: 'Feature',
      geometry: p.geometry ?? null,
      properties: {
        id: p.id,
        label: p.label,
        comune: p.comune,
        comune_codice: p.comune_codice,
        foglio: p.foglio,
        particella: p.particella,
        coltura: p.coltura,
        superficie_ha: p.superficie_ha,
        note: p.note,
      },
    })),
  };

  const blob = new Blob([JSON.stringify(fc, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'appezzamenti_4326.geojson';
  a.click();
  URL.revokeObjectURL(url);
}

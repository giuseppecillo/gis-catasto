import { useEffect, useRef } from 'react';
import type { Parcel } from '../types';
import { geomCentroid } from '../lib/cadastre';

declare const L: {
  map: (el: HTMLElement, opts?: Record<string, unknown>) => LeafletMap;
  tileLayer: (url: string, opts?: Record<string, unknown>) => LeafletLayer;
  geoJSON: (data: unknown, opts?: Record<string, unknown>) => LeafletLayer;
  latLngBounds: (arr: [number, number][]) => LeafletBounds;
};

interface LeafletMap {
  setView: (center: [number, number], zoom: number) => void;
  fitBounds: (b: LeafletBounds, opts?: Record<string, unknown>) => void;
  addLayer: (l: LeafletLayer) => void;
  removeLayer: (l: LeafletLayer) => void;
  remove: () => void;
}
interface LeafletLayer {
  addTo: (m: LeafletMap) => LeafletLayer;
  getBounds?: () => LeafletBounds;
  setStyle?: (s: Record<string, unknown>) => void;
  eachLayer?: (fn: (l: LeafletLayer) => void) => void;
}
interface LeafletBounds {
  isValid: () => boolean;
  extend?: (b: LeafletBounds) => LeafletBounds;
}

interface Props {
  parcels: Parcel[];
  selectedId: string | null;
  onSelectParcel: (id: string) => void;
}

const ESRI_SATELLITE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const CADASTO_WMS =
  'https://wms.cartografia.agenziaentrate.gov.it/inspire/wms/ows01.php';

// Color palette for parcel polygons
const COLORS = [
  '#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1',
];

export function MapWidget({ parcels, selectedId, onSelectParcel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<Map<string, LeafletLayer>>(new Map());
  const initializedRef = useRef(false);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;
    if (typeof L === 'undefined') return;

    initializedRef.current = true;

    const map = L.map(containerRef.current, {
      center: [41.9028, 12.4964],
      zoom: 6,
    } as Record<string, unknown>);

    mapRef.current = map;

    // Satellite base layer
    L.tileLayer(ESRI_SATELLITE, {
      attribution:
        'Tiles &copy; Esri &mdash; Source: Esri, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN',
      maxZoom: 20,
    }).addTo(map);

    // Italian cadastral WMS overlay
    try {
      L.tileLayer(
        `${CADASTO_WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=CP.CadastralParcel&CRS=EPSG:3857&STYLES=&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`,
        {
          attribution: 'Catasto &copy; Agenzia delle Entrate',
          opacity: 0.6,
          maxZoom: 20,
          tileSize: 256,
        }
      ).addTo(map);
    } catch {
      // WMS may not support this tile pattern; silently skip
    }

    return () => {
      map.remove();
      initializedRef.current = false;
      mapRef.current = null;
    };
  }, []);

  // Sync parcel GeoJSON layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof L === 'undefined') return;

    // Remove all existing parcel layers
    layersRef.current.forEach((layer) => map.removeLayer(layer));
    layersRef.current.clear();

    const validParcels = parcels.filter((p) => p.geometry);
    if (validParcels.length === 0) return;

    let combinedBounds: LeafletBounds | null = null;

    validParcels.forEach((parcel, idx) => {
      const color = COLORS[idx % COLORS.length];
      const isSelected = parcel.id === selectedId;

      const layer = L.geoJSON(
        {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: parcel.geometry,
              properties: { id: parcel.id, label: parcel.label },
            },
          ],
        },
        {
          style: {
            color: isSelected ? '#ffffff' : color,
            weight: isSelected ? 3 : 2,
            opacity: 1,
            fillColor: color,
            fillOpacity: isSelected ? 0.55 : 0.35,
          },
          onEachFeature: (_: unknown, lyr: { bindTooltip?: (t: string, o?: Record<string, unknown>) => void; on?: (e: string, fn: () => void) => void }) => {
            if (lyr.bindTooltip) {
              lyr.bindTooltip(
                `<strong>${parcel.label}</strong><br/>` +
                  `${parcel.comune} • Fg ${parcel.foglio} Sub ${parcel.particella}<br/>` +
                  `${parcel.coltura ?? '—'} • ${parcel.superficie_ha?.toFixed(4) ?? '—'} ha`,
                { permanent: false, sticky: true }
              );
            }
            if (lyr.on) {
              lyr.on('click', () => onSelectParcel(parcel.id));
            }
          },
        } as Record<string, unknown>
      ).addTo(map);

      layersRef.current.set(parcel.id, layer);

      const bounds = layer.getBounds?.();
      if (bounds?.isValid()) {
        combinedBounds = combinedBounds
          ? combinedBounds.extend?.(bounds) ?? bounds
          : bounds;
      }
    });

    if (combinedBounds && (combinedBounds as LeafletBounds).isValid()) {
      map.fitBounds(combinedBounds as LeafletBounds, { padding: [40, 40] } as Record<string, unknown>);
    }
  }, [parcels, selectedId, onSelectParcel]);

  // When selected changes, pan to it
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId || typeof L === 'undefined') return;

    const parcel = parcels.find((p) => p.id === selectedId);
    if (!parcel?.geometry) return;

    const centroid = geomCentroid(parcel.geometry);
    if (centroid) {
      map.setView(centroid, 16);
    }

    // Re-style layers to highlight selected
    layersRef.current.forEach((layer, id) => {
      const isSelected = id === selectedId;
      const idx = parcels.findIndex((p) => p.id === id);
      const color = COLORS[idx % COLORS.length];
      if (layer.eachLayer) {
        layer.eachLayer((sub) => {
          sub.setStyle?.({
            color: isSelected ? '#ffffff' : color,
            weight: isSelected ? 3 : 2,
            fillOpacity: isSelected ? 0.55 : 0.35,
          });
        });
      }
    });
  }, [selectedId, parcels]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute bottom-2 right-2 z-[1000] bg-black/60 text-white text-xs px-2 py-1 rounded">
        Satellite ESRI • Catasto AdE
      </div>
    </div>
  );
}

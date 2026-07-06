export interface GeoJSONCoord {
  type: string;
  coordinates: number[][][] | number[][][][];
}

export interface Parcel {
  id: string;
  label: string;
  comune: string;
  comune_codice: string;
  foglio: string;
  particella: string;
  coltura: string | null;
  superficie_ha: number | null;
  geometry: GeoJSONCoord | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export type ParcelInsert = Omit<Parcel, 'id' | 'created_at' | 'updated_at'>;
export type ParcelUpdate = Partial<ParcelInsert>;

export interface CadastreQueryParams {
  comuneCodice: string;
  foglio: string;
  particella: string;
}

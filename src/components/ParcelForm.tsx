import { useState, useEffect } from 'react';
import { X, Loader2, MapPin } from 'lucide-react';
import type { Parcel, ParcelInsert } from '../types';
import { fetchParcelGeometry } from '../lib/cadastre';

interface Props {
  parcel?: Parcel | null;
  onSave: (data: ParcelInsert) => Promise<void>;
  onClose: () => void;
}

const COLTURE = [
  'Seminativo',
  'Vigneto',
  'Oliveto',
  'Frutteto',
  'Prato',
  'Bosco',
  'Orto',
  'Incolto',
  'Arboricoltura da legno',
  'Serre',
  'Altro',
];

const empty: ParcelInsert = {
  label: '',
  comune: '',
  comune_codice: '',
  foglio: '',
  particella: '',
  coltura: '',
  superficie_ha: null,
  geometry: null,
  note: '',
};

export function ParcelForm({ parcel, onSave, onClose }: Props) {
  const [form, setForm] = useState<ParcelInsert>(
    parcel
      ? {
          label: parcel.label,
          comune: parcel.comune,
          comune_codice: parcel.comune_codice,
          foglio: parcel.foglio,
          particella: parcel.particella,
          coltura: parcel.coltura ?? '',
          superficie_ha: parcel.superficie_ha,
          geometry: parcel.geometry,
          note: parcel.note ?? '',
        }
      : { ...empty }
  );
  const [saving, setSaving] = useState(false);
  const [fetchingGeom, setFetchingGeom] = useState(false);
  const [geomStatus, setGeomStatus] = useState<string>('');
  const [errors, setErrors] = useState<Partial<Record<keyof ParcelInsert, string>>>({});

  useEffect(() => {
    if (form.geometry) {
      setGeomStatus('Geometria presente');
    }
  }, []);

  function set<K extends keyof ParcelInsert>(key: K, value: ParcelInsert[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const e: Partial<Record<keyof ParcelInsert, string>> = {};
    if (!form.label.trim()) e.label = 'Campo obbligatorio';
    if (!form.comune.trim()) e.comune = 'Campo obbligatorio';
    if (!form.comune_codice.trim()) e.comune_codice = 'Campo obbligatorio (es. F205)';
    if (!form.foglio.trim()) e.foglio = 'Campo obbligatorio';
    if (!form.particella.trim()) e.particella = 'Campo obbligatorio';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleFetchGeometry() {
    if (!form.comune_codice || !form.foglio || !form.particella) {
      setGeomStatus('Compila codice comune, foglio e particella');
      return;
    }
    setFetchingGeom(true);
    setGeomStatus('Recupero geometria dal catasto...');
    try {
      const feature = await fetchParcelGeometry(
        form.comune_codice.trim().toUpperCase(),
        form.foglio.trim(),
        form.particella.trim()
      );
      if (feature) {
        set('geometry', feature.geometry as ParcelInsert['geometry']);
        const isSynthetic = feature.properties?.synthetic;
        setGeomStatus(
          isSynthetic
            ? 'Geometria approssimativa (WFS non raggiungibile — poligono centroide)'
            : 'Geometria reale dal catasto AdE'
        );
      } else {
        setGeomStatus('Nessuna geometria trovata per questo riferimento catastale');
      }
    } catch {
      setGeomStatus('Errore durante il recupero della geometria');
    } finally {
      setFetchingGeom(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave({
        ...form,
        comune_codice: form.comune_codice.trim().toUpperCase(),
        superficie_ha: form.superficie_ha ? Number(form.superficie_ha) : null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#0f1a14] border border-[#1e3a28] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e3a28]">
          <h2 className="text-white font-semibold text-lg">
            {parcel ? 'Modifica appezzamento' : 'Nuovo appezzamento'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Label */}
          <Field label="Nome / ID appezzamento" error={errors.label} required>
            <input
              value={form.label}
              onChange={(e) => set('label', e.target.value)}
              placeholder="es. Appezzamento 1 – Nord"
              className="input-field"
            />
          </Field>

          {/* Cadastral section */}
          <div className="bg-[#0a1410] border border-[#1e3a28] rounded-xl p-4 space-y-4">
            <p className="text-[#4ade80] text-sm font-medium uppercase tracking-widest">
              Riferimento catastale
            </p>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Comune" error={errors.comune} required>
                <input
                  value={form.comune}
                  onChange={(e) => set('comune', e.target.value)}
                  placeholder="es. Roma"
                  className="input-field"
                />
              </Field>
              <Field label="Codice Belfiore" error={errors.comune_codice} required>
                <input
                  value={form.comune_codice}
                  onChange={(e) => set('comune_codice', e.target.value.toUpperCase())}
                  placeholder="es. H501"
                  maxLength={6}
                  className="input-field uppercase"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Foglio" error={errors.foglio} required>
                <input
                  value={form.foglio}
                  onChange={(e) => set('foglio', e.target.value)}
                  placeholder="es. 42"
                  className="input-field"
                />
              </Field>
              <Field label="Particella" error={errors.particella} required>
                <input
                  value={form.particella}
                  onChange={(e) => set('particella', e.target.value)}
                  placeholder="es. 105"
                  className="input-field"
                />
              </Field>
            </div>

            {/* Fetch geometry button */}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleFetchGeometry}
                disabled={fetchingGeom}
                className="flex items-center gap-2 px-4 py-2 bg-[#4ade80]/10 hover:bg-[#4ade80]/20 border border-[#4ade80]/40 text-[#4ade80] rounded-lg text-sm font-medium transition-all disabled:opacity-50"
              >
                {fetchingGeom ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <MapPin size={14} />
                )}
                Recupera geometria dal catasto
              </button>
              {geomStatus && (
                <span className="text-xs text-gray-400 flex-1">{geomStatus}</span>
              )}
            </div>
          </div>

          {/* Agronomic data */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Coltura">
              <select
                value={form.coltura ?? ''}
                onChange={(e) => set('coltura', e.target.value)}
                className="input-field"
              >
                <option value="">— seleziona —</option>
                {COLTURE.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Superficie (ha)">
              <input
                type="number"
                step="0.0001"
                min="0"
                value={form.superficie_ha ?? ''}
                onChange={(e) =>
                  set('superficie_ha', e.target.value ? Number(e.target.value) : null)
                }
                placeholder="es. 2.3500"
                className="input-field"
              />
            </Field>
          </div>

          <Field label="Note">
            <textarea
              value={form.note ?? ''}
              onChange={(e) => set('note', e.target.value)}
              rows={2}
              placeholder="Annotazioni libere..."
              className="input-field resize-none"
            />
          </Field>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-sm text-gray-400 hover:text-white border border-white/10 hover:border-white/30 rounded-lg transition-all"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-[#4ade80] hover:bg-[#22c55e] text-black rounded-lg transition-all disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {parcel ? 'Salva modifiche' : 'Aggiungi appezzamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm text-gray-400">
        {label}
        {required && <span className="text-[#4ade80] ml-1">*</span>}
      </label>
      {children}
      {error && <p className="text-red-400 text-xs mt-0.5">{error}</p>}
    </div>
  );
}

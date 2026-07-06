import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Upload,
  Download,
  Layers,
  Map,
  RefreshCw,
  Loader2,
  AlertCircle,
  FileDown,
  Sprout,
  Table2,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { downloadShapefile, downloadGeoJSON } from './lib/shapefile';
import { fetchParcelGeometry } from './lib/cadastre';
import type { Parcel, ParcelInsert } from './types';
import { MapWidget } from './components/MapWidget';
import { ParcelTable } from './components/ParcelTable';
import { ParcelForm } from './components/ParcelForm';
import { ImportCSV } from './components/ImportCSV';

type View = 'dashboard' | 'table';
type Modal = 'add' | 'edit' | 'import' | null;

export default function App() {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [editParcel, setEditParcel] = useState<Parcel | null>(null);
  const [view, setView] = useState<View>('dashboard');
  const [fetchingGeoms, setFetchingGeoms] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);

  const loadParcels = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('parcels')
      .select('*')
      .order('created_at', { ascending: false });
    if (err) {
      setError(err.message);
    } else {
      setParcels(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadParcels();
  }, [loadParcels]);

  async function handleSave(data: ParcelInsert) {
    if (editParcel) {
      const { error: err } = await supabase
        .from('parcels')
        .update(data)
        .eq('id', editParcel.id);
      if (err) throw err;
    } else {
      const { error: err } = await supabase.from('parcels').insert(data);
      if (err) throw err;
    }
    setModal(null);
    setEditParcel(null);
    await loadParcels();
  }

  async function handleDelete(id: string) {
    const { error: err } = await supabase.from('parcels').delete().eq('id', id);
    if (err) {
      alert("Errore durante l'eliminazione: " + err.message);
      return;
    }
    if (selectedId === id) setSelectedId(null);
    await loadParcels();
  }

  async function handleImport(rows: ParcelInsert[]) {
    const { error: err } = await supabase.from('parcels').insert(rows);
    if (err) throw err;
    await loadParcels();
  }

  async function fetchAllGeometries() {
    const missing = parcels.filter(
      (p) => !p.geometry && p.comune_codice && p.foglio && p.particella
    );
    if (missing.length === 0) return;
    setFetchingGeoms(true);
    for (const p of missing) {
      try {
        const feature = await fetchParcelGeometry(
          p.comune_codice,
          p.foglio,
          p.particella
        );
        if (feature) {
          await supabase
            .from('parcels')
            .update({ geometry: feature.geometry })
            .eq('id', p.id);
        }
      } catch {
        // continue
      }
    }
    setFetchingGeoms(false);
    await loadParcels();
  }

  const totalHa = parcels.reduce((s, p) => s + (p.superficie_ha ?? 0), 0);
  const withGeom = parcels.filter((p) => p.geometry).length;
  const missingGeom = parcels.filter(
    (p) => !p.geometry && p.comune_codice && p.foglio && p.particella
  ).length;

  const cropCounts: Record<string, number> = {};
  for (const p of parcels) {
    const c = p.coltura ?? 'Non specificato';
    cropCounts[c] = (cropCounts[c] ?? 0) + 1;
  }
  const topCrop = Object.entries(cropCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="h-screen flex flex-col bg-[#080f0c] text-white overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-[#1e3a28] bg-[#0b1612] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#4ade80]/20 rounded-lg flex items-center justify-center">
            <Sprout size={18} className="text-[#4ade80]" />
          </div>
          <div>
            <h1 className="text-white font-semibold text-sm leading-tight">
              GIS Catasto
            </h1>
            <p className="text-gray-500 text-xs">Gestione Appezzamenti</p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-[#0f1a14] border border-[#1e3a28] rounded-lg p-1">
          <button
            onClick={() => setView('dashboard')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              view === 'dashboard'
                ? 'bg-[#4ade80]/20 text-[#4ade80]'
                : 'text-gray-500 hover:text-white'
            }`}
          >
            <Map size={13} />
            Dashboard
          </button>
          <button
            onClick={() => setView('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              view === 'table'
                ? 'bg-[#4ade80]/20 text-[#4ade80]'
                : 'text-gray-500 hover:text-white'
            }`}
          >
            <Table2 size={13} />
            Tabella
          </button>
        </div>

        <div className="flex items-center gap-2">
          {missingGeom > 0 && (
            <button
              onClick={fetchAllGeometries}
              disabled={fetchingGeoms}
              title={`Recupera geometrie mancanti (${missingGeom})`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-amber-400 border border-amber-800/50 hover:bg-amber-900/20 rounded-lg transition-all disabled:opacity-50"
            >
              {fetchingGeoms ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <RefreshCw size={13} />
              )}
              Geometrie ({missingGeom})
            </button>
          )}

          <button
            onClick={() => setModal('import')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-300 border border-[#1e3a28] hover:bg-white/5 rounded-lg transition-all"
          >
            <Upload size={13} />
            Importa CSV
          </button>

          <div className="relative">
            <button
              onClick={() => setExportMenu((v) => !v)}
              disabled={parcels.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-300 border border-[#1e3a28] hover:bg-white/5 rounded-lg transition-all disabled:opacity-40"
            >
              <FileDown size={13} />
              Esporta
            </button>
            {exportMenu && (
              <div
                className="absolute right-0 top-full mt-1 z-50 bg-[#0f1a14] border border-[#1e3a28] rounded-xl shadow-xl overflow-hidden min-w-[220px]"
                onMouseLeave={() => setExportMenu(false)}
              >
                <button
                  onClick={() => {
                    downloadShapefile(parcels);
                    setExportMenu(false);
                  }}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-colors"
                >
                  <Download size={14} className="text-[#4ade80]" />
                  Shapefile (.zip) EPSG:4326
                </button>
                <button
                  onClick={() => {
                    downloadGeoJSON(parcels);
                    setExportMenu(false);
                  }}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-colors border-t border-[#1e3a28]"
                >
                  <Download size={14} className="text-blue-400" />
                  GeoJSON EPSG:4326
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setEditParcel(null);
              setModal('add');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#4ade80] hover:bg-[#22c55e] text-black rounded-lg transition-all"
          >
            <Plus size={13} />
            Aggiungi
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={24} className="text-[#4ade80] animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-3 bg-red-950/40 border border-red-900/50 rounded-xl px-6 py-4 text-red-400">
              <AlertCircle size={18} />
              <div>
                <p className="font-medium text-sm">Errore di connessione</p>
                <p className="text-xs mt-0.5">{error}</p>
              </div>
              <button onClick={loadParcels} className="ml-4 text-xs underline">
                Riprova
              </button>
            </div>
          </div>
        ) : view === 'dashboard' ? (
          <DashboardView
            parcels={parcels}
            selectedId={selectedId}
            onSelectParcel={setSelectedId}
            onEdit={(p) => {
              setEditParcel(p);
              setModal('edit');
            }}
            onDelete={handleDelete}
            totalHa={totalHa}
            withGeom={withGeom}
            topCrop={topCrop}
          />
        ) : (
          <TableView
            parcels={parcels}
            selectedId={selectedId}
            onSelectParcel={setSelectedId}
            onEdit={(p) => {
              setEditParcel(p);
              setModal('edit');
            }}
            onDelete={handleDelete}
          />
        )}
      </div>

      {/* Modals */}
      {(modal === 'add' || modal === 'edit') && (
        <ParcelForm
          parcel={editParcel}
          onSave={handleSave}
          onClose={() => {
            setModal(null);
            setEditParcel(null);
          }}
        />
      )}
      {modal === 'import' && (
        <ImportCSV
          onImport={handleImport}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function DashboardView({
  parcels,
  selectedId,
  onSelectParcel,
  onEdit,
  onDelete,
  totalHa,
  withGeom,
  topCrop,
}: {
  parcels: Parcel[];
  selectedId: string | null;
  onSelectParcel: (id: string) => void;
  onEdit: (p: Parcel) => void;
  onDelete: (id: string) => void;
  totalHa: number;
  withGeom: number;
  topCrop: [string, number] | undefined;
}) {
  return (
    <div className="flex h-full">
      <div className="w-[360px] flex-shrink-0 flex flex-col border-r border-[#1e3a28] bg-[#0b1612]">
        <div className="grid grid-cols-3 border-b border-[#1e3a28]">
          <Kpi label="Appezzamenti" value={String(parcels.length)} />
          <Kpi label="Ha totali" value={totalHa.toFixed(2)} highlight />
          <Kpi label="Con mappa" value={`${withGeom}/${parcels.length}`} />
        </div>

        {topCrop && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[#1e3a28] bg-[#0a1410]">
            <Layers size={12} className="text-gray-600" />
            <span className="text-xs text-gray-500">
              Coltura principale:{' '}
              <span className="text-white font-medium">{topCrop[0]}</span>{' '}
              <span className="text-gray-600">({topCrop[1]})</span>
            </span>
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          <ParcelTable
            parcels={parcels}
            selectedId={selectedId}
            onSelect={onSelectParcel}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
      </div>

      <div className="flex-1 p-3 bg-[#080f0c]">
        <MapWidget
          parcels={parcels}
          selectedId={selectedId}
          onSelectParcel={onSelectParcel}
        />
      </div>
    </div>
  );
}

function TableView({
  parcels,
  selectedId,
  onSelectParcel,
  onEdit,
  onDelete,
}: {
  parcels: Parcel[];
  selectedId: string | null;
  onSelectParcel: (id: string) => void;
  onEdit: (p: Parcel) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 z-10 bg-[#0b1612] border-b border-[#1e3a28]">
          <tr>
            {[
              'ID / Nome',
              'Comune',
              'Cod. Belfiore',
              'Foglio',
              'Particella',
              'Coltura',
              'Ha',
              'Geometria',
              'Note',
              '',
            ].map((h) => (
              <th
                key={h}
                className="text-left px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {parcels.length === 0 ? (
            <tr>
              <td colSpan={10} className="text-center py-16 text-gray-600">
                Nessun appezzamento
              </td>
            </tr>
          ) : (
            parcels.map((p) => (
              <tr
                key={p.id}
                onClick={() => onSelectParcel(p.id)}
                className={`border-b border-[#1e3a28] cursor-pointer transition-colors ${
                  p.id === selectedId
                    ? 'bg-[#4ade80]/5'
                    : 'hover:bg-white/[0.02]'
                }`}
              >
                <td className="px-4 py-3 font-medium text-white">{p.label}</td>
                <td className="px-4 py-3 text-gray-400">{p.comune || '—'}</td>
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                  {p.comune_codice || '—'}
                </td>
                <td className="px-4 py-3 text-gray-400">{p.foglio}</td>
                <td className="px-4 py-3 text-gray-400">{p.particella}</td>
                <td className="px-4 py-3 text-gray-400">{p.coltura || '—'}</td>
                <td className="px-4 py-3 text-gray-400">
                  {p.superficie_ha != null ? p.superficie_ha.toFixed(4) : '—'}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      p.geometry ? 'bg-[#4ade80]' : 'bg-gray-700'
                    }`}
                  />
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs max-w-[160px] truncate">
                  {p.note || '—'}
                </td>
                <td
                  className="px-4 py-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onEdit(p)}
                      className="p-1.5 text-gray-600 hover:text-white hover:bg-white/10 rounded transition-all"
                      title="Modifica"
                    >
                      <svg
                        width="12"
                        height="12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Eliminare "${p.label}"?`)) onDelete(p.id);
                      }}
                      className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded transition-all"
                      title="Elimina"
                    >
                      <svg
                        width="12"
                        height="12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="px-4 py-3 text-center">
      <p
        className={`text-lg font-bold ${
          highlight ? 'text-[#4ade80]' : 'text-white'
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

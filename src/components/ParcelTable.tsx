import { MapPin, Layers, Wheat, MoreVertical, Edit2, Trash2, Map } from 'lucide-react';
import type { Parcel } from '../types';

interface Props {
  parcels: Parcel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (parcel: Parcel) => void;
  onDelete: (id: string) => void;
}

const CROP_COLORS: Record<string, string> = {
  Seminativo: 'bg-amber-900/40 text-amber-400 border-amber-800/50',
  Vigneto: 'bg-purple-900/40 text-purple-400 border-purple-800/50',
  Oliveto: 'bg-lime-900/40 text-lime-400 border-lime-800/50',
  Frutteto: 'bg-orange-900/40 text-orange-400 border-orange-800/50',
  Prato: 'bg-green-900/40 text-green-400 border-green-800/50',
  Bosco: 'bg-emerald-900/40 text-emerald-400 border-emerald-800/50',
  Orto: 'bg-teal-900/40 text-teal-400 border-teal-800/50',
  Incolto: 'bg-stone-900/40 text-stone-400 border-stone-800/50',
};

function cropBadge(coltura: string | null) {
  if (!coltura) return 'bg-gray-900/40 text-gray-500 border-gray-800/50';
  return CROP_COLORS[coltura] ?? 'bg-blue-900/40 text-blue-400 border-blue-800/50';
}

export function ParcelTable({ parcels, selectedId, onSelect, onEdit, onDelete }: Props) {
  if (parcels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 text-center">
        <Layers size={40} className="text-gray-700 mb-3" />
        <p className="text-gray-400 font-medium">Nessun appezzamento</p>
        <p className="text-gray-600 text-sm mt-1">
          Aggiungi manualmente o importa da CSV
        </p>
      </div>
    );
  }

  const totalHa = parcels.reduce((sum, p) => sum + (p.superficie_ha ?? 0), 0);

  return (
    <div className="flex flex-col h-full">
      {/* Summary bar */}
      <div className="flex items-center gap-6 px-4 py-2.5 border-b border-[#1e3a28] bg-[#0a1410]">
        <span className="text-xs text-gray-500">
          <span className="text-white font-semibold">{parcels.length}</span> appezzamenti
        </span>
        <span className="text-xs text-gray-500">
          <span className="text-white font-semibold">{totalHa.toFixed(4)}</span> ha totali
        </span>
        <span className="text-xs text-gray-500 ml-auto">
          {parcels.filter((p) => p.geometry).length} con geometria
        </span>
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1">
        {parcels.map((parcel) => (
          <ParcelRow
            key={parcel.id}
            parcel={parcel}
            selected={parcel.id === selectedId}
            onSelect={() => onSelect(parcel.id)}
            onEdit={() => onEdit(parcel)}
            onDelete={() => onDelete(parcel.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ParcelRow({
  parcel,
  selected,
  onSelect,
  onEdit,
  onDelete,
}: {
  parcel: Parcel;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-[#1e3a28] ${
        selected
          ? 'bg-[#4ade80]/10 border-l-2 border-l-[#4ade80]'
          : 'hover:bg-white/[0.03] border-l-2 border-l-transparent'
      }`}
    >
      {/* Icon */}
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          selected ? 'bg-[#4ade80]/20' : 'bg-[#1e3a28]'
        }`}
      >
        <MapPin size={14} className={selected ? 'text-[#4ade80]' : 'text-gray-500'} />
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-white text-sm font-medium truncate">{parcel.label}</p>
          {parcel.coltura && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${cropBadge(
                parcel.coltura
              )}`}
            >
              {parcel.coltura}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 flex-wrap">
          <span className="flex items-center gap-1">
            <Map size={10} />
            {parcel.comune || '—'} • Fg {parcel.foglio} Sub {parcel.particella}
          </span>
          {parcel.superficie_ha != null && (
            <span className="flex items-center gap-1">
              <Wheat size={10} />
              {parcel.superficie_ha.toFixed(4)} ha
            </span>
          )}
        </div>
      </div>

      {/* Geometry indicator */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <div
          className={`w-2 h-2 rounded-full ${
            parcel.geometry ? 'bg-[#4ade80]' : 'bg-gray-700'
          }`}
          title={parcel.geometry ? 'Geometria presente' : 'Nessuna geometria'}
        />
      </div>

      {/* Actions */}
      <div
        className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onEdit}
          className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-all"
          title="Modifica"
        >
          <Edit2 size={13} />
        </button>
        <button
          onClick={() => {
            if (confirm(`Eliminare "${parcel.label}"?`)) onDelete();
          }}
          className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-all"
          title="Elimina"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

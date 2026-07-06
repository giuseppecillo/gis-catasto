import { useState, useRef } from 'react';
import { X, Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { ParcelInsert } from '../types';

interface Props {
  onImport: (parcels: ParcelInsert[]) => Promise<void>;
  onClose: () => void;
}

interface ParsedRow {
  ok: boolean;
  data?: ParcelInsert;
  error?: string;
  raw: string[];
}

const EXPECTED_HEADERS = [
  'label',
  'comune',
  'comune_codice',
  'foglio',
  'particella',
  'coltura',
  'superficie_ha',
  'note',
];

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(';').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));

  const getCol = (row: string[], key: string): string => {
    const idx = headers.indexOf(key);
    return idx >= 0 ? (row[idx] ?? '').trim() : '';
  };

  return lines.slice(1).map((line) => {
    const raw = line.split(';').map((c) => c.trim());
    const label = getCol(raw, 'label') || getCol(raw, 'nome') || getCol(raw, 'id');
    const comune = getCol(raw, 'comune');
    const comune_codice = getCol(raw, 'comune_codice') || getCol(raw, 'codice_belfiore') || getCol(raw, 'codice');
    const foglio = getCol(raw, 'foglio');
    const particella = getCol(raw, 'particella');

    if (!label || !foglio || !particella) {
      return {
        ok: false,
        error: 'Campi obbligatori mancanti (label/nome, foglio, particella)',
        raw,
      };
    }

    const superficie_ha_raw = getCol(raw, 'superficie_ha') || getCol(raw, 'superficie') || getCol(raw, 'ha');
    const superficie_ha = superficie_ha_raw ? parseFloat(superficie_ha_raw.replace(',', '.')) : null;

    return {
      ok: true,
      data: {
        label,
        comune: comune || '',
        comune_codice: comune_codice.toUpperCase() || '',
        foglio,
        particella,
        coltura: getCol(raw, 'coltura') || null,
        superficie_ha: isNaN(superficie_ha as number) ? null : superficie_ha,
        geometry: null,
        note: getCol(raw, 'note') || null,
      },
      raw,
    };
  });
}

const CSV_TEMPLATE = [
  EXPECTED_HEADERS.join(';'),
  'App. Nord;Roma;H501;42;105;Seminativo;2.3500;Campo principale',
  'App. Sud;Roma;H501;42;106;Vigneto;1.2000;',
  'App. Est;Milano;F205;18;330;Oliveto;0.8000;Irrigato',
].join('\n');

export function ImportCSV({ onImport, onClose }: Props) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setRows(parseCSV(text));
      setDone(false);
    };
    reader.readAsText(file, 'UTF-8');
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_appezzamenti.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const validRows = rows.filter((r) => r.ok && r.data);
  const invalidRows = rows.filter((r) => !r.ok);

  async function handleImport() {
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      await onImport(validRows.map((r) => r.data!));
      setDone(true);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#0f1a14] border border-[#1e3a28] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e3a28]">
          <h2 className="text-white font-semibold text-lg">Importa da CSV</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Template download */}
          <div className="flex items-center justify-between bg-[#0a1410] border border-[#1e3a28] rounded-xl px-4 py-3">
            <div className="flex items-center gap-3">
              <FileText size={18} className="text-[#4ade80]" />
              <div>
                <p className="text-white text-sm font-medium">Template CSV</p>
                <p className="text-gray-500 text-xs">
                  Separatore: <code className="text-[#4ade80]">;</code> — Colonne:{' '}
                  <code className="text-gray-400 text-[10px]">{EXPECTED_HEADERS.join(', ')}</code>
                </p>
              </div>
            </div>
            <button
              onClick={downloadTemplate}
              className="text-[#4ade80] text-sm hover:underline"
            >
              Scarica
            </button>
          </div>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-[#1e3a28] hover:border-[#4ade80]/50 rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors group"
          >
            <Upload size={32} className="text-gray-600 group-hover:text-[#4ade80] transition-colors" />
            <p className="text-gray-400 text-sm">
              Trascina il file CSV qui oppure{' '}
              <span className="text-[#4ade80]">sfoglia</span>
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>

          {/* Preview */}
          {rows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5 text-[#4ade80]">
                  <CheckCircle2 size={14} />
                  {validRows.length} righe valide
                </span>
                {invalidRows.length > 0 && (
                  <span className="flex items-center gap-1.5 text-red-400">
                    <AlertCircle size={14} />
                    {invalidRows.length} con errori
                  </span>
                )}
              </div>

              {/* Valid rows preview */}
              {validRows.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-[#1e3a28]">
                  <table className="w-full text-xs">
                    <thead className="bg-[#0a1410]">
                      <tr>
                        {['Label', 'Comune', 'Codice', 'Foglio', 'Particella', 'Coltura', 'Ha'].map(
                          (h) => (
                            <th key={h} className="text-left px-3 py-2 text-gray-400 font-medium">
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {validRows.slice(0, 8).map((r, i) => (
                        <tr key={i} className="border-t border-[#1e3a28]">
                          <td className="px-3 py-1.5 text-white">{r.data!.label}</td>
                          <td className="px-3 py-1.5 text-gray-400">{r.data!.comune}</td>
                          <td className="px-3 py-1.5 text-gray-400">{r.data!.comune_codice}</td>
                          <td className="px-3 py-1.5 text-gray-400">{r.data!.foglio}</td>
                          <td className="px-3 py-1.5 text-gray-400">{r.data!.particella}</td>
                          <td className="px-3 py-1.5 text-gray-400">{r.data!.coltura ?? '—'}</td>
                          <td className="px-3 py-1.5 text-gray-400">
                            {r.data!.superficie_ha?.toFixed(4) ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {validRows.length > 8 && (
                    <p className="text-gray-500 text-xs px-3 py-2">
                      … e altre {validRows.length - 8} righe
                    </p>
                  )}
                </div>
              )}

              {/* Errors preview */}
              {invalidRows.length > 0 && (
                <div className="bg-red-950/30 border border-red-900/40 rounded-xl p-3 space-y-1">
                  {invalidRows.map((r, i) => (
                    <p key={i} className="text-red-400 text-xs">
                      Riga {i + 1}: {r.error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {done && (
            <div className="flex items-center gap-2 text-[#4ade80] text-sm bg-[#4ade80]/10 border border-[#4ade80]/30 rounded-xl px-4 py-3">
              <CheckCircle2 size={16} />
              Importazione completata con successo!
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              onClick={onClose}
              className="px-5 py-2 text-sm text-gray-400 hover:text-white border border-white/10 hover:border-white/30 rounded-lg transition-all"
            >
              {done ? 'Chiudi' : 'Annulla'}
            </button>
            {!done && (
              <button
                onClick={handleImport}
                disabled={validRows.length === 0 || importing}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-[#4ade80] hover:bg-[#22c55e] text-black rounded-lg transition-all disabled:opacity-40"
              >
                {importing && (
                  <span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                )}
                Importa {validRows.length > 0 ? `${validRows.length} appezzamenti` : ''}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

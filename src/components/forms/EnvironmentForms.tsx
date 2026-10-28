import React, { useRef, useState } from 'react';
import { Download, FileSpreadsheet, Plus, Trash2, Upload } from 'lucide-react';
import {
  FangerData,
  FangerSampleRow,
  Iso2631Data,
  Iso2631TaskPeriod,
  Iso5349Data,
  Iso5349ToolPeriod,
  WbgtData,
  WbgtSampleRow,
} from '../../types/ergonomics';
import { computeFangerMetrics } from '../../utils/calculations';
import { VibrationAxesGuide } from '../AngleGuides';

const LOGISTICS_TABLE_12_4_SAMPLES: FangerSampleRow[] = [
  {
    id: 'fg-log-1',
    sectorLabel: '1. Carga y descarga (Muelle)',
    airTempC: 19.2,
    radiantTempC: 19.0,
    relativeHumidityPct: 54,
    airVelocityMs: 0.22,
    metabolicRateMet: 1.8,
    clothingInsulationClo: 0.75,
  },
  {
    id: 'fg-log-2',
    sectorLabel: '2. Clasificación de bolsines',
    airTempC: 20.6,
    radiantTempC: 20.4,
    relativeHumidityPct: 50,
    airVelocityMs: 0.15,
    metabolicRateMet: 1.5,
    clothingInsulationClo: 0.75,
  },
  {
    id: 'fg-log-3',
    sectorLabel: '3. Almacén productos de salud',
    airTempC: 25.4,
    radiantTempC: 25.8,
    relativeHumidityPct: 58,
    airVelocityMs: 0.12,
    metabolicRateMet: 1.6,
    clothingInsulationClo: 0.80,
  },
];

// ============================================================================
// 1. MÉTODO DE FANGER (PMV / PPD — CAPÍTULO 7.2, 7.4 Y PLANILLA TABLA 12.4)
// ============================================================================
export function FangerForm({ data, onChange }: { data: FangerData; onChange: (next: FangerData) => void }) {
  const fangerCsvRef = useRef<HTMLInputElement>(null);
  const [fangerCsvMsg, setFangerCsvMsg] = useState('');

  const rows: FangerSampleRow[] =
    data.multiSectorSamples && data.multiSectorSamples.length > 0
      ? data.multiSectorSamples
      : LOGISTICS_TABLE_12_4_SAMPLES;

  const isSheetMode = Boolean(data.useMultiSectorSheet);

  const toggleMode = (sheet: boolean) => {
    onChange({
      ...data,
      useMultiSectorSheet: sheet,
      multiSectorSamples: rows,
    });
  };

  const addSectorRow = () => {
    const nextRow: FangerSampleRow = {
      id: `fg-${Date.now()}`,
      sectorLabel: `Sector / Puesto ${rows.length + 1}`,
      airTempC: 23.0,
      radiantTempC: 23.0,
      relativeHumidityPct: 50,
      airVelocityMs: 0.15,
      metabolicRateMet: 1.4,
      clothingInsulationClo: 0.7,
    };
    onChange({
      ...data,
      useMultiSectorSheet: true,
      multiSectorSamples: [...rows, nextRow],
    });
  };

  const updateSectorRow = (id: string, patch: Partial<FangerSampleRow>) => {
    onChange({
      ...data,
      useMultiSectorSheet: true,
      multiSectorSamples: rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  };

  const removeSectorRow = (id: string) => {
    if (rows.length <= 1) return;
    onChange({
      ...data,
      useMultiSectorSheet: true,
      multiSectorSamples: rows.filter((r) => r.id !== id),
    });
  };

  const loadTable124Preset = () => {
    onChange({
      ...data,
      useMultiSectorSheet: true,
      multiSectorSamples: LOGISTICS_TABLE_12_4_SAMPLES.map((r) => ({ ...r })),
    });
    setFangerCsvMsg('Cargada serie de 3 sectores de referencia (Tabla 12.4 · Empresa de Logística).');
  };

  const handleImportFangerCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result || '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const parsed: FangerSampleRow[] = [];
      lines.forEach((line, idx) => {
        if (idx === 0 && /sector|puesto|ta|humedad|met/i.test(line)) return;
        const cols = line.split(/[;,]/).map((c) => c.trim().replace(',', '.'));
        const rawCols = line.split(/[;,]/).map((c) => c.trim());
        if (cols.length >= 7) {
          parsed.push({
            id: `fg-csv-${Date.now()}-${idx}`,
            sectorLabel: rawCols[0] || `Sector ${idx + 1}`,
            airTempC: Number(cols[1]) || 22,
            radiantTempC: Number(cols[2]) || 22,
            relativeHumidityPct: Math.min(100, Math.max(5, Number(cols[3]) || 50)),
            airVelocityMs: Math.max(0, Number(cols[4]) || 0.15),
            metabolicRateMet: Math.max(0.8, Number(cols[5]) || 1.2),
            clothingInsulationClo: Math.max(0.1, Number(cols[6]) || 0.7),
          });
        }
      });
      if (parsed.length > 0) {
        onChange({ ...data, useMultiSectorSheet: true, multiSectorSamples: parsed });
        setFangerCsvMsg(`Se cargaron ${parsed.length} filas de mediciones térmicas desde ${file.name}.`);
      } else {
        setFangerCsvMsg('Formato CSV esperado: Sector;ta_C;tr_C;HR_pct;va_ms;M_met;Icl_clo');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportFangerCsv = () => {
    const header = 'Sector_Puesto;ta_C;tr_C;HR_pct;va_ms;M_met;Icl_clo;PMV;PPD_pct;Categoria_ISO7730\n';
    const body = rows
      .map((r) => {
        const m = computeFangerMetrics(r);
        return [
          r.sectorLabel.replace(/;/g, ','),
          r.airTempC,
          r.radiantTempC,
          r.relativeHumidityPct,
          r.airVelocityMs,
          r.metabolicRateMet,
          r.clothingInsulationClo,
          m.pmv.toFixed(2),
          m.ppd.toFixed(1),
          m.categoryCode,
        ].join(';');
      })
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'planilla_confort_termico_fanger.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 sm:p-5 rounded-lg border border-slate-200 bg-white space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            Variables Ambientales y Personales — Confort Térmico ISO 7730 (Apartado 7.2 y Planilla Cap. 12)
          </h4>
          <p className="text-xs text-slate-500">
            Cargue una serie de mediciones por sectores/puestos en planilla o evalúe una medición puntual individual (PMV / PPD)
          </p>
        </div>

        <div className="inline-flex rounded-md border border-slate-300 bg-slate-100 p-0.5 shrink-0 self-start">
          <button
            type="button"
            onClick={() => toggleMode(true)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              isSheetMode ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Planilla de Serie de Datos ({rows.length})
          </button>
          <button
            type="button"
            onClick={() => toggleMode(false)}
            className={`px-3 py-1.5 min-h-[36px] rounded text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              !isSheetMode ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Puesto Único
          </button>
        </div>
      </div>

      {!isSheetMode ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Temp. Seca del Aire ta (°C)</label>
              <input
                type="number"
                step={0.5}
                value={data.airTempC}
                onChange={(e) => onChange({ ...data, airTempC: Number(e.target.value) || 0 })}
                className="w-full min-h-[40px] rounded border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Temp. Radiante Media tr (°C)</label>
              <input
                type="number"
                step={0.5}
                value={data.radiantTempC}
                onChange={(e) => onChange({ ...data, radiantTempC: Number(e.target.value) || 0 })}
                className="w-full min-h-[40px] rounded border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Humedad Relativa HR (%)</label>
              <input
                type="number"
                min={5}
                max={100}
                value={data.relativeHumidityPct}
                onChange={(e) =>
                  onChange({ ...data, relativeHumidityPct: Math.min(100, Math.max(5, Number(e.target.value) || 50)) })
                }
                className="w-full min-h-[40px] rounded border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Velocidad del Aire va (m/s)</label>
              <input
                type="number"
                min={0}
                max={5}
                step={0.05}
                value={data.airVelocityMs}
                onChange={(e) => onChange({ ...data, airVelocityMs: Math.max(0, Number(e.target.value) || 0) })}
                className="w-full min-h-[40px] rounded border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700">
                Tasa Metabólica M (met) — 1 met = 58,2 W/m² (Tabla 7.3)
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="number"
                  min={0.7}
                  max={4.5}
                  step={0.1}
                  value={data.metabolicRateMet}
                  onChange={(e) => onChange({ ...data, metabolicRateMet: Math.max(0.7, Number(e.target.value) || 1.2) })}
                  className="w-full sm:w-28 min-h-[40px] rounded border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
                />
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) onChange({ ...data, metabolicRateMet: Number(e.target.value) });
                  }}
                  className="flex-1 min-h-[40px] rounded border border-slate-300 px-2.5 py-2 text-xs bg-white text-slate-700"
                >
                  <option value="">Seleccionar referencia Tabla 7.3...</option>
                  <option value="1.0">1,0 met — Sentado en reposo</option>
                  <option value="1.2">1,2 met — Trabajo administrativo / oficina sedentaria</option>
                  <option value="1.6">1,6 met — De pie, trabajo ligero (laboratorio / inspección)</option>
                  <option value="2.0">2,0 met — De pie, actividad media con brazos y tronco</option>
                  <option value="2.8">2,8 met — Actividad industrial intensa / marcha rápida</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700">
                Aislamiento de la Vestimenta Icl (clo) — 1 clo = 0,155 m²·K/W (Tabla 7.4)
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="number"
                  min={0.1}
                  max={3.0}
                  step={0.05}
                  value={data.clothingInsulationClo}
                  onChange={(e) =>
                    onChange({ ...data, clothingInsulationClo: Math.max(0.1, Number(e.target.value) || 0.6) })
                  }
                  className="w-full sm:w-28 min-h-[40px] rounded border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
                />
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) onChange({ ...data, clothingInsulationClo: Number(e.target.value) });
                  }}
                  className="flex-1 min-h-[40px] rounded border border-slate-300 px-2.5 py-2 text-xs bg-white text-slate-700"
                >
                  <option value="">Seleccionar vestimenta Tabla 7.4...</option>
                  <option value="0.5">0,50 clo — Ropa ligera de verano (pantalón liviano, camisa manga corta)</option>
                  <option value="0.7">0,70 clo — Ropa habitual de trabajo interior (camisa manga larga, pantalón)</option>
                  <option value="1.0">1,00 clo — Conjunto de invierno interior / mameluco de algodón + chaqueta</option>
                  <option value="1.5">1,50 clo — Abrigo térmico pesado industrial</option>
                </select>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-800">
              Planilla de Relevamiento Higrotérmico Multipunto (ISO 7726 / ISO 7730 — Cálculo Automático por Fila)
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fangerCsvRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleImportFangerCsv}
                className="hidden"
              />
              <button
                type="button"
                onClick={loadTable124Preset}
                className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1.5 rounded border border-amber-300 bg-amber-50 hover:bg-amber-100 text-xs font-semibold text-amber-950 whitespace-nowrap cursor-pointer"
              >
                Ejemplo Tabla 12.4 (3 Sectores)
              </button>
              <button
                type="button"
                onClick={() => fangerCsvRef.current?.click()}
                className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 whitespace-nowrap cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-sky-700" />
                Importar CSV
              </button>
              <button
                type="button"
                onClick={handleExportFangerCsv}
                className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 whitespace-nowrap cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar Planilla CSV
              </button>
              <button
                type="button"
                onClick={addSectorRow}
                className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Añadir Sector
              </button>
            </div>
          </div>

          {fangerCsvMsg && (
            <div className="px-3 py-2 rounded border border-sky-200 bg-sky-50 text-xs text-sky-900">{fangerCsvMsg}</div>
          )}

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                  <th className="py-2.5 px-2.5 whitespace-nowrap">#</th>
                  <th className="py-2.5 px-2.5 min-w-[180px]">Sector / Puesto Relevado</th>
                  <th className="py-2.5 px-2 whitespace-nowrap">ta (°C)</th>
                  <th className="py-2.5 px-2 whitespace-nowrap">tr (°C)</th>
                  <th className="py-2.5 px-2 whitespace-nowrap">HR (%)</th>
                  <th className="py-2.5 px-2 whitespace-nowrap">va (m/s)</th>
                  <th className="py-2.5 px-2 whitespace-nowrap">M (met)</th>
                  <th className="py-2.5 px-2 whitespace-nowrap">Icl (clo)</th>
                  <th className="py-2.5 px-2.5 whitespace-nowrap text-right">PMV</th>
                  <th className="py-2.5 px-2.5 whitespace-nowrap text-right">PPD (%)</th>
                  <th className="py-2.5 px-2.5 whitespace-nowrap">ISO 7730</th>
                  <th className="py-2.5 px-2 text-right">Quitar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, idx) => {
                  const m = computeFangerMetrics(row);
                  const outOfComfort = Math.abs(m.pmv) > 0.5 || m.ppd > 10;
                  return (
                    <tr key={row.id} className={outOfComfort ? 'bg-amber-50/40' : 'hover:bg-slate-50/70'}>
                      <td className="py-2 px-2.5 font-mono text-slate-500 tabular-nums">{idx + 1}</td>
                      <td className="py-2 px-2.5">
                        <input
                          type="text"
                          value={row.sectorLabel}
                          onChange={(e) => updateSectorRow(row.id, { sectorLabel: e.target.value })}
                          className="w-full min-w-[165px] rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-900"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step={0.2}
                          value={row.airTempC}
                          onChange={(e) => updateSectorRow(row.id, { airTempC: Number(e.target.value) || 0 })}
                          className="w-18 rounded border border-slate-300 bg-white px-2 py-1.5 font-mono tabular-nums text-slate-900"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step={0.2}
                          value={row.radiantTempC}
                          onChange={(e) => updateSectorRow(row.id, { radiantTempC: Number(e.target.value) || 0 })}
                          className="w-18 rounded border border-slate-300 bg-white px-2 py-1.5 font-mono tabular-nums text-slate-900"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          min={5}
                          max={100}
                          value={row.relativeHumidityPct}
                          onChange={(e) =>
                            updateSectorRow(row.id, {
                              relativeHumidityPct: Math.min(100, Math.max(5, Number(e.target.value) || 50)),
                            })
                          }
                          className="w-16 rounded border border-slate-300 bg-white px-2 py-1.5 font-mono tabular-nums text-slate-900"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          min={0}
                          max={5}
                          step={0.02}
                          value={row.airVelocityMs}
                          onChange={(e) =>
                            updateSectorRow(row.id, { airVelocityMs: Math.max(0, Number(e.target.value) || 0) })
                          }
                          className="w-18 rounded border border-slate-300 bg-white px-2 py-1.5 font-mono tabular-nums text-slate-900"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          min={0.8}
                          max={4.5}
                          step={0.1}
                          value={row.metabolicRateMet}
                          onChange={(e) =>
                            updateSectorRow(row.id, { metabolicRateMet: Math.max(0.8, Number(e.target.value) || 1.2) })
                          }
                          className="w-16 rounded border border-slate-300 bg-white px-2 py-1.5 font-mono tabular-nums text-slate-900"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          min={0.1}
                          max={3.0}
                          step={0.05}
                          value={row.clothingInsulationClo}
                          onChange={(e) =>
                            updateSectorRow(row.id, {
                              clothingInsulationClo: Math.max(0.1, Number(e.target.value) || 0.7),
                            })
                          }
                          className="w-16 rounded border border-slate-300 bg-white px-2 py-1.5 font-mono tabular-nums text-slate-900"
                        />
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono font-bold tabular-nums text-slate-900">
                        {m.pmv >= 0 ? '+' : ''}
                        {m.pmv.toFixed(2)}
                      </td>
                      <td
                        className={`py-2 px-2.5 text-right font-mono font-bold tabular-nums ${
                          m.ppd > 10 ? 'text-red-700' : 'text-emerald-800'
                        }`}
                      >
                        {m.ppd.toFixed(1)}%
                      </td>
                      <td className="py-2 px-2.5 whitespace-nowrap">
                        <span
                          className={`font-semibold ${
                            m.categoryCode === 'A' || m.categoryCode === 'B'
                              ? 'text-emerald-800'
                              : m.categoryCode === 'C'
                                ? 'text-amber-800'
                                : 'text-red-700'
                          }`}
                        >
                          {m.categoryCode === 'Disconfort' ? 'Fuera B/C' : `Cat. ${m.categoryCode}`}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeSectorRow(row.id)}
                          disabled={rows.length <= 1}
                          className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 cursor-pointer"
                          title="Quitar fila"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
            <span>
              Criterio general de confort (ISO 7730 Cat. B / Libro Cap. 7 y 12): −0,5 ≤ PMV ≤ +0,5 y PPD ≤ 10%. El dictamen global adopta el sector más desfavorable.
            </span>
            <span className="font-mono">Referencia rápida: 1,2 met oficina · 1,6 met de pie ligero · 2,0 met actividad media</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 2. ÍNDICE WBGT — ESTRÉS TÉRMICO POR CALOR (CAPÍTULO 7.3 Y 7.5 + CSV MULTIZONA)
// ============================================================================
export function WbgtForm({ data, onChange }: { data: WbgtData; onChange: (next: WbgtData) => void }) {
  const csvRef = useRef<HTMLInputElement>(null);
  const [csvMsg, setCsvMsg] = useState('');

  const addZone = () => {
    const nextRow: WbgtSampleRow = {
      id: `wb-${Date.now()}`,
      zoneLabel: `Zona ${data.multiZoneSamples.length + 1}`,
      durationMin: 15,
      tbhC: 24,
      tgC: 32,
      taC: 29,
    };
    onChange({ ...data, multiZoneSamples: [...data.multiZoneSamples, nextRow] });
  };

  const updateZone = (id: string, patch: Partial<WbgtSampleRow>) => {
    onChange({
      ...data,
      multiZoneSamples: data.multiZoneSamples.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  };

  const removeZone = (id: string) => {
    if (data.multiZoneSamples.length <= 1) return;
    onChange({ ...data, multiZoneSamples: data.multiZoneSamples.filter((r) => r.id !== id) });
  };

  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result || '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const parsed: WbgtSampleRow[] = [];
      lines.forEach((line, idx) => {
        if (idx === 0 && /zona|duracion|tbh/i.test(line)) return;
        const cols = line.split(/[;,]/).map((c) => c.trim());
        if (cols.length >= 4) {
          parsed.push({
            id: `wb-csv-${Date.now()}-${idx}`,
            zoneLabel: cols[0] || `Zona ${idx + 1}`,
            durationMin: Math.max(1, Number(cols[1]) || 15),
            tbhC: Number(cols[2]) || 24,
            tgC: Number(cols[3]) || 32,
            taC: Number(cols[4]) || Number(cols[3]) || 28,
          });
        }
      });
      if (parsed.length > 0) {
        onChange({ ...data, useMultiZone: true, multiZoneSamples: parsed });
        setCsvMsg(`Se importaron ${parsed.length} zonas térmicas desde ${file.name}.`);
      } else {
        setCsvMsg('Formato CSV inválido. Use: Zona;Minutos;Tbh_C;Tg_C;Ta_C');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const downloadCsv = () => {
    const header = 'Zona_Tarea;Duracion_Min;Tbh_C;Tg_C;Ta_C\n';
    const body = data.multiZoneSamples
      .map((r) => `${r.zoneLabel.replace(/;/g, ',')};${r.durationMin};${r.tbhC};${r.tgC};${r.taC}`)
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mediciones_wbgt_multizona.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="p-5 rounded-lg border border-slate-200 bg-white space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-3">
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={data.solarLoad}
                onChange={(e) => onChange({ ...data, solarLoad: e.target.checked })}
                className="rounded border-slate-300 text-sky-600"
              />
              Exposición exterior con carga solar directa (usa 0,7·Tbh + 0,2·Tg + 0,1·Ta)
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={data.useMultiZone}
                onChange={(e) => onChange({ ...data, useMultiZone: e.target.checked })}
                className="rounded border-slate-300 text-sky-600"
              />
              Ponderación horaria multizona / Carga de tabla CSV
            </label>
          </div>
        </div>

        {!data.useMultiZone ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Temp. Bulbo Húmedo Natural Tbh (°C)</label>
              <input
                type="number"
                step={0.1}
                value={data.tbhC}
                onChange={(e) => onChange({ ...data, tbhC: Number(e.target.value) || 0 })}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Temp. de Globo Tg (°C)</label>
              <input
                type="number"
                step={0.1}
                value={data.tgC}
                onChange={(e) => onChange({ ...data, tgC: Number(e.target.value) || 0 })}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Temp. Seca del Aire Ta (°C) {!data.solarLoad && '(informativa)'}
              </label>
              <input
                type="number"
                step={0.1}
                value={data.taC}
                onChange={(e) => onChange({ ...data, taC: Number(e.target.value) || 0 })}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800">
                Serie de Mediciones por Zona / Fase Operativa (Ponderación Temporal ISO 7243)
              </span>
              <div className="flex items-center gap-2">
                <input ref={csvRef} type="file" accept=".csv,.txt" onChange={handleImportCsv} className="hidden" />
                <button
                  type="button"
                  onClick={() => csvRef.current?.click()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-sky-700" />
                  Cargar CSV
                </button>
                <button
                  type="button"
                  onClick={downloadCsv}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Plantilla CSV
                </button>
                <button
                  type="button"
                  onClick={addZone}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Añadir zona
                </button>
              </div>
            </div>

            {csvMsg && <div className="px-3 py-2 rounded border border-sky-200 bg-sky-50 text-xs text-sky-900">{csvMsg}</div>}

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="py-2 px-3">Zona / Subtarea</th>
                    <th className="py-2 px-2">Duración (min)</th>
                    <th className="py-2 px-2">Tbh (°C)</th>
                    <th className="py-2 px-2">Tg (°C)</th>
                    <th className="py-2 px-2">Ta (°C)</th>
                    <th className="py-2 px-2 text-right">Quitar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.multiZoneSamples.map((row) => (
                    <tr key={row.id}>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={row.zoneLabel}
                          onChange={(e) => updateZone(row.id, { zoneLabel: e.target.value })}
                          className="w-full min-w-40 rounded border border-slate-200 px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          min={1}
                          value={row.durationMin}
                          onChange={(e) => updateZone(row.id, { durationMin: Math.max(1, Number(e.target.value) || 1) })}
                          className="w-20 rounded border border-slate-200 px-2 py-1 font-mono tabular-nums"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step={0.1}
                          value={row.tbhC}
                          onChange={(e) => updateZone(row.id, { tbhC: Number(e.target.value) || 0 })}
                          className="w-20 rounded border border-slate-200 px-2 py-1 font-mono tabular-nums"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step={0.1}
                          value={row.tgC}
                          onChange={(e) => updateZone(row.id, { tgC: Number(e.target.value) || 0 })}
                          className="w-20 rounded border border-slate-200 px-2 py-1 font-mono tabular-nums"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step={0.1}
                          value={row.taC}
                          onChange={(e) => updateZone(row.id, { taC: Number(e.target.value) || 0 })}
                          className="w-20 rounded border border-slate-200 px-2 py-1 font-mono tabular-nums"
                        />
                      </td>
                      <td className="py-2 px-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeZone(row.id)}
                          disabled={data.multiZoneSamples.length <= 1}
                          className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Metabolismo, Aclimatación y Régimen */}
        <div className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Consumo Metabólico M (Watts — Tabla 7.6)</label>
            <select
              value={data.metabolicWatts}
              onChange={(e) => onChange({ ...data, metabolicWatts: Number(e.target.value) })}
              className="w-full rounded border border-slate-300 px-3 py-2 text-xs bg-white"
            >
              <option value={115}>115 W — Clase 0: Reposo sentado</option>
              <option value={180}>180 W — Clase 1: Metabolismo ligero (trabajo manual sentado/de pie)</option>
              <option value={300}>300 W — Clase 2: Metabolismo moderado (brazos y piernas, empuje ligero)</option>
              <option value={400}>400 W — Clase 3: Metabolismo alto (pala, carga pesada, frente de horno)</option>
              <option value={520}>520 W — Clase 4: Metabolismo muy alto (actividad intensa sostenida)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Estado de Aclimatación del Trabajador</label>
            <select
              value={data.acclimatized ? 'si' : 'no'}
              onChange={(e) => onChange({ ...data, acclimatized: e.target.value === 'si' })}
              className="w-full rounded border border-slate-300 px-3 py-2 text-xs bg-white"
            >
              <option value="si">Aclimatado al calor (exposición progresiva ≥ 7 días)</option>
              <option value="no">No aclimatado al calor (límite más estricto)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">WBGT en Zona de Descanso (°C)</label>
            <input
              type="number"
              step={0.5}
              value={data.restWbgtC}
              onChange={(e) => onChange({ ...data, restWbgtC: Number(e.target.value) || 24 })}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 3. VIBRACIONES CUERPO ENTERO — NORMA ISO 2631 (CAPÍTULO 8.3 Y 8.5 + CSV)
// ============================================================================
export function Iso2631Form({ data, onChange }: { data: Iso2631Data; onChange: (next: Iso2631Data) => void }) {
  const csvRef = useRef<HTMLInputElement>(null);
  const [csvMsg, setCsvMsg] = useState('');

  const addPeriod = () => {
    const next: Iso2631TaskPeriod = {
      id: `w-${Date.now()}`,
      equipmentName: `Equipo / Maquinaria ${data.periods.length + 1}`,
      posture: 'sentado',
      awx: 0.3,
      awy: 0.25,
      awz: 0.65,
      exposureHours: 2.0,
    };
    onChange({ periods: [...data.periods, next] });
  };

  const updatePeriod = (id: string, patch: Partial<Iso2631TaskPeriod>) => {
    onChange({ periods: data.periods.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  };

  const removePeriod = (id: string) => {
    if (data.periods.length <= 1) return;
    onChange({ periods: data.periods.filter((p) => p.id !== id) });
  };

  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result || '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const parsed: Iso2631TaskPeriod[] = [];
      lines.forEach((line, idx) => {
        if (idx === 0 && /equipo|awx|postura/i.test(line)) return;
        const cols = line.split(/[;,]/).map((c) => c.trim());
        if (cols.length >= 6) {
          parsed.push({
            id: `w-csv-${Date.now()}-${idx}`,
            equipmentName: cols[0] || `Equipo ${idx + 1}`,
            posture: /pie/i.test(cols[1]) ? 'de_pie' : 'sentado',
            awx: Math.max(0, Number(cols[2]) || 0),
            awy: Math.max(0, Number(cols[3]) || 0),
            awz: Math.max(0, Number(cols[4]) || 0),
            exposureHours: Math.max(0.1, Number(cols[5]) || 1),
          });
        }
      });
      if (parsed.length > 0) {
        onChange({ periods: parsed });
        setCsvMsg(`Se cargaron ${parsed.length} registros de acelerometría ISO 2631 desde ${file.name}.`);
      } else {
        setCsvMsg('Formato CSV inválido. Use: Equipo;Postura(sentado/de_pie);awx;awy;awz;Horas');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const downloadCsv = () => {
    const header = 'Equipo_Vehiculo;Postura;awx_ms2;awy_ms2;awz_ms2;Horas_Exposicion\n';
    const body = data.periods
      .map((p) => `${p.equipmentName.replace(/;/g, ',')};${p.posture};${p.awx};${p.awy};${p.awz};${p.exposureHours}`)
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vibraciones_iso2631.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <VibrationAxesGuide mode="whole_body" />

      <div className="p-5 rounded-lg border border-slate-200 bg-white space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">
              Mediciones Triaxiales por Vehículo / Plataforma y Carga de Datos (ISO 2631)
            </h4>
            <p className="text-xs text-slate-500">
              Ingrese las aceleraciones eficaces ponderadas (m/s²) y el tiempo real de exposición diaria por equipo
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input ref={csvRef} type="file" accept=".csv,.txt" onChange={handleImportCsv} className="hidden" />
            <button
              type="button"
              onClick={() => csvRef.current?.click()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-sky-700" />
              Importar CSV
            </button>
            <button
              type="button"
              onClick={downloadCsv}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Plantilla CSV
            </button>
            <button
              type="button"
              onClick={addPeriod}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Añadir equipo
            </button>
          </div>
        </div>

        {csvMsg && <div className="px-3 py-2 rounded border border-sky-200 bg-sky-50 text-xs text-sky-900">{csvMsg}</div>}

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="py-2 px-3">Equipo / Maquinaria</th>
                <th className="py-2 px-2">Postura</th>
                <th className="py-2 px-2">awx (m/s²)</th>
                <th className="py-2 px-2">awy (m/s²)</th>
                <th className="py-2 px-2">awz (m/s²)</th>
                <th className="py-2 px-2">Tiempo (h/día)</th>
                <th className="py-2 px-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.periods.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      value={p.equipmentName}
                      onChange={(e) => updatePeriod(p.id, { equipmentName: e.target.value })}
                      className="w-full min-w-44 rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <select
                      value={p.posture}
                      onChange={(e) => updatePeriod(p.id, { posture: e.target.value as 'sentado' | 'de_pie' })}
                      className="rounded border border-slate-200 px-2 py-1 bg-white"
                    >
                      <option value="sentado">Sentado (kx,ky=1,4)</option>
                      <option value="de_pie">De pie (k=1,0)</option>
                    </select>
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      min={0}
                      step={0.05}
                      value={p.awx}
                      onChange={(e) => updatePeriod(p.id, { awx: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-20 rounded border border-slate-200 px-2 py-1 font-mono tabular-nums"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      min={0}
                      step={0.05}
                      value={p.awy}
                      onChange={(e) => updatePeriod(p.id, { awy: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-20 rounded border border-slate-200 px-2 py-1 font-mono tabular-nums"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      min={0}
                      step={0.05}
                      value={p.awz}
                      onChange={(e) => updatePeriod(p.id, { awz: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-20 rounded border border-slate-200 px-2 py-1 font-mono tabular-nums"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      min={0.1}
                      max={16}
                      step={0.25}
                      value={p.exposureHours}
                      onChange={(e) => updatePeriod(p.id, { exposureHours: Math.max(0.1, Number(e.target.value) || 0.5) })}
                      className="w-20 rounded border border-slate-200 px-2 py-1 font-mono tabular-nums"
                    />
                  </td>
                  <td className="py-2 px-2 text-right">
                    <button
                      type="button"
                      onClick={() => removePeriod(p.id)}
                      disabled={data.periods.length <= 1}
                      className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 4. VIBRACIONES MANO-BRAZO — NORMA ISO 5349 (CAPÍTULO 8.4 Y 8.6 + CSV)
// ============================================================================
export function Iso5349Form({ data, onChange }: { data: Iso5349Data; onChange: (next: Iso5349Data) => void }) {
  const csvRef = useRef<HTMLInputElement>(null);
  const [csvMsg, setCsvMsg] = useState('');

  const addTool = () => {
    const next: Iso5349ToolPeriod = {
      id: `h-${Date.now()}`,
      toolName: `Herramienta manual ${data.periods.length + 1}`,
      ahwx: 2.2,
      ahwy: 1.8,
      ahwz: 3.4,
      exposureHours: 1.5,
    };
    onChange({ periods: [...data.periods, next] });
  };

  const updateTool = (id: string, patch: Partial<Iso5349ToolPeriod>) => {
    onChange({ periods: data.periods.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  };

  const removeTool = (id: string) => {
    if (data.periods.length <= 1) return;
    onChange({ periods: data.periods.filter((p) => p.id !== id) });
  };

  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result || '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const parsed: Iso5349ToolPeriod[] = [];
      lines.forEach((line, idx) => {
        if (idx === 0 && /herramienta|ahwx/i.test(line)) return;
        const cols = line.split(/[;,]/).map((c) => c.trim());
        if (cols.length >= 5) {
          parsed.push({
            id: `h-csv-${Date.now()}-${idx}`,
            toolName: cols[0] || `Herramienta ${idx + 1}`,
            ahwx: Math.max(0, Number(cols[1]) || 0),
            ahwy: Math.max(0, Number(cols[2]) || 0),
            ahwz: Math.max(0, Number(cols[3]) || 0),
            exposureHours: Math.max(0.05, Number(cols[4]) || 1),
          });
        }
      });
      if (parsed.length > 0) {
        onChange({ periods: parsed });
        setCsvMsg(`Se cargaron ${parsed.length} herramientas ISO 5349 desde ${file.name}.`);
      } else {
        setCsvMsg('Formato CSV inválido. Use: Herramienta;ahwx;ahwy;ahwz;Horas');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const downloadCsv = () => {
    const header = 'Herramienta_Motorizada;ahwx_ms2;ahwy_ms2;ahwz_ms2;Horas_Uso_Efectivo\n';
    const body = data.periods
      .map((p) => `${p.toolName.replace(/;/g, ',')};${p.ahwx};${p.ahwy};${p.ahwz};${p.exposureHours}`)
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vibraciones_iso5349.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <VibrationAxesGuide mode="hand_arm" />

      <div className="p-5 rounded-lg border border-slate-200 bg-white space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">
              Mediciones en Empuñadura por Herramienta y Carga de Datos (ISO 5349)
            </h4>
            <p className="text-xs text-slate-500">
              Ingrese la aceleración ponderada Wh en los tres ejes ortogonales y el tiempo efectivo diario de accionamiento
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input ref={csvRef} type="file" accept=".csv,.txt" onChange={handleImportCsv} className="hidden" />
            <button
              type="button"
              onClick={() => csvRef.current?.click()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-sky-700" />
              Importar CSV
            </button>
            <button
              type="button"
              onClick={downloadCsv}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Plantilla CSV
            </button>
            <button
              type="button"
              onClick={addTool}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Añadir herramienta
            </button>
          </div>
        </div>

        {csvMsg && <div className="px-3 py-2 rounded border border-sky-200 bg-sky-50 text-xs text-sky-900">{csvMsg}</div>}

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="py-2 px-3">Herramienta Manual Motorizada</th>
                <th className="py-2 px-2">ahwx (m/s²)</th>
                <th className="py-2 px-2">ahwy (m/s²)</th>
                <th className="py-2 px-2">ahwz (m/s²)</th>
                <th className="py-2 px-2">Uso Efectivo (h/día)</th>
                <th className="py-2 px-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.periods.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      value={p.toolName}
                      onChange={(e) => updateTool(p.id, { toolName: e.target.value })}
                      className="w-full min-w-48 rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={p.ahwx}
                      onChange={(e) => updateTool(p.id, { ahwx: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-20 rounded border border-slate-200 px-2 py-1 font-mono tabular-nums"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={p.ahwy}
                      onChange={(e) => updateTool(p.id, { ahwy: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-20 rounded border border-slate-200 px-2 py-1 font-mono tabular-nums"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={p.ahwz}
                      onChange={(e) => updateTool(p.id, { ahwz: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-20 rounded border border-slate-200 px-2 py-1 font-mono tabular-nums"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      min={0.05}
                      max={12}
                      step={0.25}
                      value={p.exposureHours}
                      onChange={(e) => updateTool(p.id, { exposureHours: Math.max(0.05, Number(e.target.value) || 0.5) })}
                      className="w-24 rounded border border-slate-200 px-2 py-1 font-mono tabular-nums"
                    />
                  </td>
                  <td className="py-2 px-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeTool(p.id)}
                      disabled={data.periods.length <= 1}
                      className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

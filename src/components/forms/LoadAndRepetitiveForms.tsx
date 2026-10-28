import React, { useState } from 'react';
import { Copy } from 'lucide-react';
import {
  JsiData,
  Lmc295Data,
  Nam295Data,
  NamHandInput,
  NioshData,
  OcraChecklistData,
  OcraChecklistSide,
  OcraCompletoData,
  SnookData,
} from '../../types/ergonomics';
import {
  AngleOption,
  LOWER_ARM_OPTIONS,
  NamThresholdChart,
  NioshGeometryGuide,
  RepetitiveCycleAndAnglesGuide,
  RULA_WRIST_OPTIONS,
  SnookDimensionGuide,
  UPPER_ARM_OPTIONS,
  VisualAngleSelector,
} from '../AngleGuides';

// ============================================================================
// 1. ECUACIÓN NIOSH (CAPÍTULO 5.3 - 5.5)
// ============================================================================
export function NioshForm({ data, onChange }: { data: NioshData; onChange: (next: NioshData) => void }) {
  const [guideTarget, setGuideTarget] = useState<'origin' | 'dest'>('origin');

  return (
    <div className="space-y-5">
      {/* Guía geométrica interactiva H, V, D y Ángulo de Asimetría A */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-700">
            Guía Espacial y Selector Rápido de Ángulo de Asimetría ({guideTarget === 'origin' ? 'Origen' : 'Destino'})
          </span>
          {data.evaluateDestination && (
            <div className="inline-flex rounded border border-slate-300 bg-slate-50 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setGuideTarget('origin')}
                className={`px-2.5 py-1 rounded cursor-pointer ${
                  guideTarget === 'origin' ? 'bg-slate-900 text-white' : 'text-slate-700'
                }`}
              >
                Ver Origen
              </button>
              <button
                type="button"
                onClick={() => setGuideTarget('dest')}
                className={`px-2.5 py-1 rounded cursor-pointer ${
                  guideTarget === 'dest' ? 'bg-slate-900 text-white' : 'text-slate-700'
                }`}
              >
                Ver Destino
              </button>
            </div>
          )}
        </div>
        <NioshGeometryGuide
          hCm={guideTarget === 'origin' ? data.hOriginCm : data.hDestCm}
          vOriginCm={data.vOriginCm}
          vDestCm={data.vDestCm}
          asymmetryDeg={guideTarget === 'origin' ? data.asymmetryOriginDeg : data.asymmetryDestDeg}
          loadKg={data.loadWeightKg}
          onSelectAsymmetry={(deg) =>
            guideTarget === 'origin'
              ? onChange({ ...data, asymmetryOriginDeg: deg })
              : onChange({ ...data, asymmetryDestDeg: deg })
          }
        />
      </div>

      {/* Variables de carga, geometría y frecuencia */}
      <div className="p-5 rounded-lg border border-slate-200 bg-white space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Peso Real de la Carga L (kg)</label>
            <input
              type="number"
              min={0.5}
              step={0.1}
              value={data.loadWeightKg}
              onChange={(e) => onChange({ ...data, loadWeightKg: Math.max(0.1, Number(e.target.value) || 0) })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Frecuencia F (lev/min)</label>
            <input
              type="number"
              min={0.1}
              max={16}
              step={0.1}
              value={data.frequencyLiftsPerMin}
              onChange={(e) => onChange({ ...data, frequencyLiftsPerMin: Math.max(0.1, Number(e.target.value) || 0.2) })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Duración de Exposición (Tabla 5.1)</label>
            <select
              value={data.durationCategory}
              onChange={(e) => onChange({ ...data, durationCategory: e.target.value as NioshData['durationCategory'] })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 bg-white"
            >
              <option value="le_1h">Corta (≤ 1 hora continua)</option>
              <option value="1_to_2h">Moderada (&gt; 1 a 2 horas)</option>
              <option value="2_to_8h">Larga (&gt; 2 a 8 horas)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Calidad del Agarre CM (Tabla 5.2)</label>
            <select
              value={data.couplingQuality}
              onChange={(e) => onChange({ ...data, couplingQuality: e.target.value as NioshData['couplingQuality'] })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 bg-white"
            >
              <option value="bueno">Bueno (asas óptimas, CM = 1,00)</option>
              <option value="regular">Regular (flexión 90° sin asas ideales)</option>
              <option value="malo">Malo (contenedor irregular / sin asas, CM = 0,90)</option>
            </select>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={data.evaluateDestination}
                onChange={(e) => onChange({ ...data, evaluateDestination: e.target.checked })}
                className="rounded border-slate-300 text-sky-600"
              />
              Requiere control significativo en el destino (calcula RWL en Origen y en Destino y adopta el más desfavorable)
            </label>

            <button
              type="button"
              onClick={() =>
                onChange({
                  ...data,
                  evaluateDestination: true,
                  hOriginCm: data.hDestCm,
                  hDestCm: data.hOriginCm,
                  vOriginCm: data.vDestCm,
                  vDestCm: data.vOriginCm,
                  asymmetryOriginDeg: data.asymmetryDestDeg,
                  asymmetryDestDeg: data.asymmetryOriginDeg,
                })
              }
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-sky-300 bg-sky-50 hover:bg-sky-100 text-xs font-semibold text-sky-900 cursor-pointer whitespace-nowrap shrink-0"
              title="Intercambiar las cotas de Origen y Destino (ej. pasar de estibar a desestibar)"
            >
              Invertir Origen ↔ Destino
            </button>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 leading-relaxed">
            <strong className="text-slate-900">
              Sentido detectado:{' '}
              {data.vDestCm - data.vOriginCm >= 10
                ? `Levantamiento ascendente (${data.vOriginCm} cm → ${data.vDestCm} cm, ej. suelo/tarima hacia estantería)`
                : data.vOriginCm - data.vDestCm >= 10
                  ? `Descenso / bajada de carga (${data.vOriginCm} cm → ${data.vDestCm} cm, desde altura mayor hacia altura menor)`
                  : `Traslado horizontal a nivel similar (${data.vOriginCm} cm ↔ ${data.vDestCm} cm)`}
              .
            </strong>{' '}
            Aclaración ergonómica: el punto de <strong>Origen</strong> también puede constituir el <strong>Destino</strong> de la carga en ciclos reversibles de estiba y desestiba; evaluando ambos extremos se garantiza cubrir la postura más exigente.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 space-y-3">
              <h5 className="text-xs font-semibold text-slate-900">
                Geometría en el Origen (Toma inicial · piso, tarima o estantería alta)
              </h5>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">H Origen (cm)</label>
                  <input
                    type="number"
                    min={15}
                    max={90}
                    value={data.hOriginCm}
                    onChange={(e) => onChange({ ...data, hOriginCm: Number(e.target.value) || 25 })}
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">V Origen (cm)</label>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={data.vOriginCm}
                    onChange={(e) => onChange({ ...data, vOriginCm: Number(e.target.value) || 0 })}
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Asimetría A (°)</label>
                  <input
                    type="number"
                    min={0}
                    max={150}
                    value={data.asymmetryOriginDeg}
                    onChange={(e) => onChange({ ...data, asymmetryOriginDeg: Number(e.target.value) || 0 })}
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono tabular-nums"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 space-y-3">
              <h5 className="text-xs font-semibold text-slate-900">Geometría en el Destino del Levantamiento</h5>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">H Destino (cm)</label>
                  <input
                    type="number"
                    min={15}
                    max={90}
                    disabled={!data.evaluateDestination}
                    value={data.hDestCm}
                    onChange={(e) => onChange({ ...data, hDestCm: Number(e.target.value) || 25 })}
                    className="w-full rounded border border-slate-300 bg-white disabled:bg-slate-100 px-2.5 py-1.5 text-xs font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">V Destino (cm)</label>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={data.vDestCm}
                    onChange={(e) => onChange({ ...data, vDestCm: Number(e.target.value) || 0 })}
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Asimetría A (°)</label>
                  <input
                    type="number"
                    min={0}
                    max={150}
                    disabled={!data.evaluateDestination}
                    value={data.asymmetryDestDeg}
                    onChange={(e) => onChange({ ...data, asymmetryDestDeg: Number(e.target.value) || 0 })}
                    className="w-full rounded border border-slate-300 bg-white disabled:bg-slate-100 px-2.5 py-1.5 text-xs font-mono tabular-nums"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 2. TABLAS DE SNOOK Y CIRIELLO (CAPÍTULO 5.9)
// ============================================================================
export function SnookForm({ data, onChange }: { data: SnookData; onChange: (next: SnookData) => void }) {
  const snookSummary =
    data.operationType === 'empuje' || data.operationType === 'traccion'
      ? `Fi=${data.actualInitialForceN} N · Fs=${data.actualSustainedForceN} N · ${data.pushPullDistance}`
      : `${data.actualWeightKg} kg`;
  return (
    <div className="p-5 rounded-lg border border-slate-200 bg-white space-y-5">
      <SnookDimensionGuide operationType={data.operationType} valueSummary={snookSummary} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">Tipo de Operación Manual (Apartado 5.9)</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {(
              [
                { id: 'levantamiento', label: 'Levantamiento' },
                { id: 'empuje', label: 'Empuje' },
                { id: 'traccion', label: 'Tracción' },
                { id: 'transporte', label: 'Transporte' },
              ] as const
            ).map((op) => (
              <button
                key={op.id}
                type="button"
                onClick={() => onChange({ ...data, operationType: op.id })}
                className={`py-2 px-2.5 rounded border text-xs font-medium cursor-pointer ${
                  data.operationType === op.id
                    ? 'border-sky-600 bg-sky-50 text-sky-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {op.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">Población de Referencia (Percentil 90%)</label>
          <div className="grid grid-cols-2 gap-2">
            {(['masculina', 'femenina'] as const).map((pop) => (
              <button
                key={pop}
                type="button"
                onClick={() => onChange({ ...data, population: pop })}
                className={`py-2 px-3 rounded border text-xs font-medium capitalize cursor-pointer ${
                  data.population === pop
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Población {pop}
              </button>
            ))}
          </div>
        </div>
      </div>

      {data.operationType === 'levantamiento' && (
        <div className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Franja Vertical (Tabla 5.6)</label>
            <select
              value={data.liftHeightZone}
              onChange={(e) => onChange({ ...data, liftHeightZone: e.target.value as SnookData['liftHeightZone'] })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs bg-white"
            >
              <option value="sobre_cabeza">Por encima de la cabeza</option>
              <option value="hombros">A la altura de los hombros</option>
              <option value="rodillas_o_inferior">Altura de rodillas o inferior</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Frecuencia (lev/min)</label>
            <select
              value={data.liftFrequencyPerMin}
              onChange={(e) =>
                onChange({ ...data, liftFrequencyPerMin: Number(e.target.value) as SnookData['liftFrequencyPerMin'] })
              }
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono bg-white"
            >
              {[0.2, 0.5, 1, 2, 3, 4, 5, 6, 8].map((f) => (
                <option key={f} value={f}>
                  {f} lev/min
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Peso Real Manipulado (kg)</label>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={data.actualWeightKg}
              onChange={(e) => onChange({ ...data, actualWeightKg: Math.max(0.5, Number(e.target.value) || 1) })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
            />
          </div>
        </div>
      )}

      {(data.operationType === 'empuje' || data.operationType === 'traccion') && (
        <div className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Altura de Aplicación de Manos</label>
            <select
              value={data.handHeightZone}
              onChange={(e) => onChange({ ...data, handHeightZone: e.target.value as SnookData['handHeightZone'] })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs bg-white"
            >
              <option value="hombros">Nivel de los hombros (~140 cm)</option>
              <option value="codo">Nivel del codo (~95–105 cm)</option>
              <option value="pies">Nivel bajo / nudillos (~60 cm)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Distancia de Desplazamiento</label>
            <select
              value={data.pushPullDistance}
              onChange={(e) => onChange({ ...data, pushPullDistance: e.target.value as SnookData['pushPullDistance'] })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs bg-white"
            >
              <option value="2m">Tramo corto (~2 metros)</option>
              <option value="60m">Tramo largo (hasta 60 metros)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Fuerza Inicial Medida (N)</label>
            <input
              type="number"
              min={1}
              value={data.actualInitialForceN}
              onChange={(e) => onChange({ ...data, actualInitialForceN: Math.max(1, Number(e.target.value) || 1) })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Fuerza Sostenida Medida (N)</label>
            <input
              type="number"
              min={1}
              value={data.actualSustainedForceN}
              onChange={(e) => onChange({ ...data, actualSustainedForceN: Math.max(1, Number(e.target.value) || 1) })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
            />
          </div>
        </div>
      )}

      {data.operationType === 'transporte' && (
        <div className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Distancia de Transporte Horizontal (Tabla 5.9)</label>
            <select
              value={data.carryDistance}
              onChange={(e) => onChange({ ...data, carryDistance: e.target.value as SnookData['carryDistance'] })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs bg-white"
            >
              <option value="hasta_2m">Hasta 2 metros</option>
              <option value="2_a_10m">Entre 2 y 10 metros</option>
              <option value="mas_10m">Superior a 10 metros</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Peso Transportado (kg)</label>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={data.actualWeightKg}
              onChange={(e) => onChange({ ...data, actualWeightKg: Math.max(0.5, Number(e.target.value) || 1) })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 3. LEVANTAMIENTO MANUAL DE CARGAS — RESOLUCIÓN 295/03 (TABLAS 1, 2 Y 3)
// ============================================================================
export function Lmc295Form({ data, onChange }: { data: Lmc295Data; onChange: (next: Lmc295Data) => void }) {
  return (
    <div className="space-y-5">
      {/* Esquema gráfico de zonas verticales y horizontales Res. 295/03 */}
      <div className="p-4 rounded-lg border border-slate-200 bg-white flex flex-col md:flex-row items-center gap-5">
        <svg viewBox="0 0 230 140" className="w-60 h-36 shrink-0 bg-slate-50 rounded border border-slate-100">
          {/* Eje tobillo */}
          <line x1="42" y1="12" x2="42" y2="126" stroke="#475569" strokeWidth="1.5" strokeDasharray="3 2" />
          <line x1="20" y1="126" x2="215" y2="126" stroke="#334155" strokeWidth="2" />
          {/* Líneas horizontales de altura */}
          {[32, 62, 95].map((y, idx) => (
            <line key={idx} x1="42" y1={y} x2="210" y2={y} stroke="#cbd5e1" strokeWidth="1" />
          ))}
          {/* Líneas verticales 30, 60, 80 cm */}
          <line x1="95" y1="16" x2="95" y2="126" stroke="#94a3b8" strokeDasharray="2 2" />
          <line x1="150" y1="16" x2="150" y2="126" stroke="#94a3b8" strokeDasharray="2 2" />
          <line x1="198" y1="16" x2="198" y2="126" stroke="#dc2626" strokeDasharray="2 2" />
          <text x="68" y="136" textAnchor="middle" className="text-[8px] font-mono fill-slate-700">
            ≤30cm
          </text>
          <text x="122" y="136" textAnchor="middle" className="text-[8px] font-mono fill-slate-700">
            30-60cm
          </text>
          <text x="174" y="136" textAnchor="middle" className="text-[8px] font-mono fill-slate-700">
            60-80cm
          </text>
          {/* Silueta */}
          <circle cx="42" cy="24" r="7" fill="#e2e8f0" stroke="#334155" strokeWidth="1.5" />
          <line x1="42" y1="31" x2="42" y2="80" stroke="#334155" strokeWidth="5" />
          <line x1="42" y1="80" x2="42" y2="125" stroke="#334155" strokeWidth="4" />
        </svg>
        <div className="space-y-1.5 text-xs text-slate-600">
          <p className="font-semibold text-slate-900">Zonificación Espacial — Resolución MTESS 295/03 (Anexo I)</p>
          <p>
            Seleccione la combinación de duración diaria y frecuencia horaria para determinar la Tabla aplicable (Tabla 1, 2 o 3) y ubique el cuadrante espacial más exigente entre el origen y el destino del levantamiento.
          </p>
          <p className="text-slate-500">
            Nota normativa: si concurren giros mayores a 30°, levantamiento con una sola mano o agarres deficientes, corresponde complementar con la Ecuación NIOSH.
          </p>
        </div>
      </div>

      <div className="p-5 rounded-lg border border-slate-200 bg-white space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Peso Real del Objeto (kg)</label>
            <input
              type="number"
              min={0.5}
              step={0.1}
              value={data.actualWeightKg}
              onChange={(e) => onChange({ ...data, actualWeightKg: Math.max(0.1, Number(e.target.value) || 0) })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Duración Acumulada Diaria</label>
            <select
              value={data.durationHours}
              onChange={(e) => onChange({ ...data, durationHours: e.target.value as Lmc295Data['durationHours'] })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs bg-white"
            >
              <option value="hasta_2h">≤ 2 horas por día</option>
              <option value="mayor_2h">&gt; 2 horas por día</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Frecuencia (levantamientos / hora)</label>
            <input
              type="number"
              min={1}
              max={600}
              value={data.liftsPerHour}
              onChange={(e) => onChange({ ...data, liftsPerHour: Math.max(1, Number(e.target.value) || 1) })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Franja Vertical de las Manos</label>
            <select
              value={data.verticalZone}
              onChange={(e) => onChange({ ...data, verticalZone: e.target.value as Lmc295Data['verticalZone'] })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs bg-white"
            >
              <option value="sobre_hombro">Desde altura de hombros hasta 30 cm por encima</option>
              <option value="nudillos_a_hombro">Desde altura de nudillos hasta debajo del hombro</option>
              <option value="espinilla_a_nudillos">Desde mitad de espinilla hasta altura de nudillos</option>
              <option value="suelo_a_espinilla">Desde el suelo hasta mitad de la espinilla</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Distancia Horizontal desde Punto Medio de Tobillos</label>
            <select
              value={data.horizontalZone}
              onChange={(e) => onChange({ ...data, horizontalZone: e.target.value as Lmc295Data['horizontalZone'] })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs bg-white"
            >
              <option value="proximo_30">Próximo: hasta 30 cm del cuerpo</option>
              <option value="intermedio_30_60">Intermedio: de 30 a 60 cm del cuerpo</option>
              <option value="alejado_60_80">Alejado: de 60 a 80 cm del cuerpo</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Altura Origen (cm)</label>
              <input
                type="number"
                value={data.originHeightCm}
                onChange={(e) => onChange({ ...data, originHeightCm: Number(e.target.value) || 0 })}
                className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-xs font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Altura Destino (cm)</label>
              <input
                type="number"
                value={data.destHeightCm}
                onChange={(e) => onChange({ ...data, destHeightCm: Number(e.target.value) || 0 })}
                className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-xs font-mono tabular-nums"
              />
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 space-y-2">
          <span className="block text-xs font-semibold text-slate-800">
            Condiciones que Invalidan el Uso Directo del VLU y Exigen Análisis NIOSH:
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs text-slate-700">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={data.asymmetryOver30Deg}
                onChange={(e) => onChange({ ...data, asymmetryOver30Deg: e.target.checked })}
                className="rounded border-slate-300 text-sky-600"
              />
              Giro del tronco superior a 30°
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={data.oneHandedLift}
                onChange={(e) => onChange({ ...data, oneHandedLift: e.target.checked })}
                className="rounded border-slate-300 text-sky-600"
              />
              Levantamiento con una sola mano
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={data.constrainedCrouchedPosture}
                onChange={(e) => onChange({ ...data, constrainedCrouchedPosture: e.target.checked })}
                className="rounded border-slate-300 text-sky-600"
              />
              De rodillas, agachado o sentado
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={data.poorCoupling}
                onChange={(e) => onChange({ ...data, poorCoupling: e.target.checked })}
                className="rounded border-slate-300 text-sky-600"
              />
              Agarre deficiente / ausencia de asas
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={data.unstableLoadOrFooting}
                onChange={(e) => onChange({ ...data, unstableLoadOrFooting: e.target.checked })}
                className="rounded border-slate-300 text-sky-600"
              />
              Carga inestable o piso resbaladizo
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={data.highHeatHumidity}
                onChange={(e) => onChange({ ...data, highHeatHumidity: e.target.checked })}
                className="rounded border-slate-300 text-sky-600"
              />
              Calor y humedad elevados
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 4. OCRA ANÁLISIS COMPLETO (CAPÍTULO 6.2 Y 6.5)
// ============================================================================
export function OcraCompletoForm({
  data,
  onChange,
}: {
  data: OcraCompletoData;
  onChange: (next: OcraCompletoData) => void;
}) {
  return (
    <div className="p-5 rounded-lg border border-slate-200 bg-white space-y-5">
      <RepetitiveCycleAndAnglesGuide methodName="OCRA Análisis Completo (Cap. 6.2)" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Acciones Técnicas por Ciclo</label>
          <input
            type="number"
            min={1}
            value={data.actionsPerCycle}
            onChange={(e) => onChange({ ...data, actionsPerCycle: Math.max(1, Number(e.target.value) || 1) })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Duración del Ciclo (segundos)</label>
          <input
            type="number"
            min={1}
            step={0.5}
            value={data.cycleDurationSec}
            onChange={(e) => onChange({ ...data, cycleDurationSec: Math.max(1, Number(e.target.value) || 1) })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Tiempo Neto Repetitivo en Jornada (min)</label>
          <input
            type="number"
            min={15}
            max={720}
            value={data.netRepetitiveMinutes}
            onChange={(e) => onChange({ ...data, netRepetitiveMinutes: Math.max(15, Number(e.target.value) || 60) })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
          />
        </div>
      </div>

      {/* Guía visual resumida de ángulos críticos OCRA */}
      <div className="p-3.5 rounded border border-slate-200 bg-slate-50/70 text-xs text-slate-700 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div>
          <span className="font-semibold text-slate-900 block">Hombro crítico:</span>
          Flexión o abducción &gt; 80° (o sostenido a la altura de la cabeza)
        </div>
        <div>
          <span className="font-semibold text-slate-900 block">Codo crítico:</span>
           Pronosupinación amplia &gt; 60° o flexo-extensión &gt; 60°
        </div>
        <div>
          <span className="font-semibold text-slate-900 block">Muñeca crítica:</span>
          Flexo-extensión &gt; 45° o desviación radiocubital &gt; 20°
        </div>
        <div>
          <span className="font-semibold text-slate-900 block">Mano / Dedos:</span>
          Pinza digital fina (pinch), agarre palmar o en gancho (hook)
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Factor de Fuerza Fm (Tabla 6.3 — Escala Borg)</label>
          <select
            value={data.fmForce}
            onChange={(e) => onChange({ ...data, fmForce: Number(e.target.value) as OcraCompletoData['fmForce'] })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs bg-white"
          >
            <option value={1.0}>1,00 — Fuerza mínima o muy ligera (Borg 0–1)</option>
            <option value={0.85}>0,85 — Fuerza ligera (Borg 2)</option>
            <option value={0.65}>0,65 — Fuerza moderada (Borg 3–4)</option>
            <option value={0.35}>0,35 — Fuerza intensa (Borg 5–6)</option>
            <option value={0.15}>0,15 — Fuerza muy intensa o casi máxima (Borg ≥ 7)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Factor de Postura Fp (Tabla 6.4)</label>
          <select
            value={data.fpPosture}
            onChange={(e) => onChange({ ...data, fpPosture: Number(e.target.value) as OcraCompletoData['fpPosture'] })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs bg-white"
          >
            <option value={1.0}>1,00 — Posturas neutras / confortables todo el ciclo</option>
            <option value={0.85}>0,85 — Desviaciones angulares leves ocasionales</option>
            <option value={0.7}>0,70 — Posturas forzadas durante 1/3 a 2/3 del ciclo</option>
            <option value={0.5}>0,50 — Posturas extremas sostenidas &gt; 2/3 del ciclo</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Factor de Repetitividad Ff (Tabla 6.5)</label>
          <select
            value={data.ffRepetitiveness}
            onChange={(e) =>
              onChange({ ...data, ffRepetitiveness: Number(e.target.value) as OcraCompletoData['ffRepetitiveness'] })
            }
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs bg-white"
          >
            <option value={1.0}>1,00 — ≤ 20 acciones/min</option>
            <option value={0.9}>0,90 — 21 a 30 acciones/min</option>
            <option value={0.7}>0,70 — 31 a 40 acciones/min</option>
            <option value={0.5}>0,50 — 41 a 60 acciones/min</option>
            <option value={0.3}>0,30 — &gt; 60 acciones/min</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Factor de Estereotipia Fe (Tabla 6.6)</label>
          <select
            value={data.feStereotypy}
            onChange={(e) => onChange({ ...data, feStereotypy: Number(e.target.value) as OcraCompletoData['feStereotypy'] })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs bg-white"
          >
            <option value={1.0}>1,00 — Variedad adecuada de gestos / ciclo &gt; 15 s</option>
            <option value={0.85}>0,85 — Estereotipia moderada (gestos repetidos 50–80 % del ciclo)</option>
            <option value={0.7}>0,70 — Estereotipia elevada (ciclo &lt; 8 s o gestos idénticos &gt; 80 %)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Agentes Físicos/Mecánicos Complementarios Fa (Tabla 6.7)</label>
          <select
            value={data.faPhysicalAgents}
            onChange={(e) =>
              onChange({ ...data, faPhysicalAgents: Number(e.target.value) as OcraCompletoData['faPhysicalAgents'] })
            }
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs bg-white"
          >
            <option value={1.0}>1,00 — Ausencia de factores físico-mecánicos adicionales</option>
            <option value={0.9}>0,90 — Presencia moderada (guantes rígidos, compresión localizada, frío)</option>
            <option value={0.8}>0,80 — Presencia intensa (vibraciones, impactos o ritmo impuesto por máquina)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Factor de Recuperación Ft (Tabla 6.8)</label>
          <select
            value={data.ftRecovery}
            onChange={(e) => onChange({ ...data, ftRecovery: Number(e.target.value) as OcraCompletoData['ftRecovery'] })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs bg-white"
          >
            <option value={1.0}>1,00 — Relación trabajo:recuperación adecuada (ej. 50:10 min por hora)</option>
            <option value={0.85}>0,85 — 1 a 2 horas diarias sin pausa de recuperación adecuada</option>
            <option value={0.7}>0,70 — ≥ 3 horas sin pausas adecuadas de recuperación</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-slate-700 mb-1">Factor de Duración Acumulada Fc (Tabla 6.9)</label>
          <select
            value={data.fcDuration}
            onChange={(e) => onChange({ ...data, fcDuration: Number(e.target.value) as OcraCompletoData['fcDuration'] })}
            className="w-full md:w-1/2 rounded-md border border-slate-300 px-3 py-2 text-xs bg-white"
          >
            <option value={1.0}>1,00 — Exposición repetitiva &lt; 120 min</option>
            <option value={0.9}>0,90 — 120 a 239 min</option>
            <option value={0.8}>0,80 — 240 a 359 min</option>
            <option value={0.7}>0,70 — 360 a 480 min (jornada estándar)</option>
            <option value={0.6}>0,60 — &gt; 480 min (jornada extendida)</option>
          </select>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 5. OCRA CHECK LIST (MODO COEFICIENTES LIBRO 6.3 + FICHAS BILATERALES INFORME)
// ============================================================================
export function OcraChecklistForm({
  data,
  onChange,
}: {
  data: OcraChecklistData;
  onChange: (next: OcraChecklistData) => void;
}) {
  const [editingSide, setEditingSide] = useState<'right' | 'left'>('right');
  const side = data[editingSide];

  const updateSide = (patch: Partial<OcraChecklistSide>) => {
    onChange({
      ...data,
      [editingSide]: { ...side, ...patch },
    });
  };

  return (
    <div className="space-y-5">
      <RepetitiveCycleAndAnglesGuide methodName="Check List OCRA (Cap. 6.3)" />
      <div className="p-4 rounded-lg border border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="block text-xs font-semibold text-slate-900">Modalidad de Cálculo Check List OCRA</span>
          <span className="text-xs text-slate-500">
            Elija entre las Fichas Aditivas Bilaterales (Informe Res. 886/15) o los Coeficientes de Cribado (Libro Cap. 6.3)
          </span>
        </div>
        <div className="inline-flex rounded-md border border-slate-300 bg-slate-50 p-0.5">
          <button
            type="button"
            onClick={() => onChange({ ...data, mode: 'clasico_bilateral' })}
            className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer ${
              data.mode === 'clasico_bilateral' ? 'bg-slate-900 text-white' : 'text-slate-700'
            }`}
          >
            Fichas Bilaterales (Der / Izq)
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...data, mode: 'libro_coeficientes' })}
            className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer ${
              data.mode === 'libro_coeficientes' ? 'bg-slate-900 text-white' : 'text-slate-700'
            }`}
          >
            Coeficientes Libro Cap. 6.3
          </button>
        </div>
      </div>

      {data.mode === 'clasico_bilateral' ? (
        <div className="p-5 rounded-lg border border-slate-200 bg-white space-y-5">
          {/* Ficha 1 y 2: Duración Neta y Recuperación */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pb-4 border-b border-slate-100">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Turno Total (min)</label>
              <input
                type="number"
                min={60}
                value={data.shiftMinutes}
                onChange={(e) => onChange({ ...data, shiftMinutes: Math.max(60, Number(e.target.value) || 480) })}
                className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Pausas Oficiales (min)</label>
              <input
                type="number"
                min={0}
                value={data.officialBreaksMinutes}
                onChange={(e) => onChange({ ...data, officialBreaksMinutes: Math.max(0, Number(e.target.value) || 0) })}
                className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Almuerzo (min)</label>
              <input
                type="number"
                min={0}
                value={data.lunchBreakMinutes}
                onChange={(e) => onChange({ ...data, lunchBreakMinutes: Math.max(0, Number(e.target.value) || 0) })}
                className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tareas No Repet. (min)</label>
              <input
                type="number"
                min={0}
                value={data.nonRepetitiveMinutes}
                onChange={(e) => onChange({ ...data, nonRepetitiveMinutes: Math.max(0, Number(e.target.value) || 0) })}
                className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Ficha 2 — Recuperación</label>
              <select
                value={data.recoveryFactorScore}
                onChange={(e) =>
                  onChange({ ...data, recoveryFactorScore: Number(e.target.value) as OcraChecklistData['recoveryFactorScore'] })
                }
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs bg-white"
              >
                <option value={0}>0 pt — 0 h sin recup. (pausa c/hora)</option>
                <option value={2}>2 pt — 2 horas sin recuperación</option>
                <option value={3}>3 pt — 3 horas sin recuperación</option>
                <option value={4}>4 pt — 4 horas sin recuperación</option>
                <option value={6}>6 pt — 6 horas sin recuperación</option>
                <option value={10}>10 pt — Sin pausas en toda la jornada</option>
              </select>
            </div>
          </div>

          {/* Selector de lado y copiado */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-900">
              Fichas 3 a 6 — Puntuación por Extremidad ({editingSide === 'right' ? 'Miembro Derecho' : 'Miembro Izquierdo'})
            </span>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded border border-slate-300 bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setEditingSide('right')}
                  className={`px-3 py-1 text-xs font-medium rounded cursor-pointer ${
                    editingSide === 'right' ? 'bg-sky-600 text-white' : 'text-slate-700'
                  }`}
                >
                  Miembro Derecho
                </button>
                <button
                  type="button"
                  onClick={() => setEditingSide('left')}
                  className={`px-3 py-1 text-xs font-medium rounded cursor-pointer ${
                    editingSide === 'left' ? 'bg-sky-600 text-white' : 'text-slate-700'
                  }`}
                >
                  Miembro Izquierdo
                </button>
              </div>
              <button
                type="button"
                onClick={() => onChange({ ...data, left: { ...data.right } })}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white text-xs text-slate-700 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar Der → Izq
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Ficha 3 — Frecuencia de Acción (0–10)</label>
              <select
                value={side.frequencyFactor}
                onChange={(e) => updateSide({ frequencyFactor: Number(e.target.value) })}
                className="w-full rounded border border-slate-300 px-2.5 py-2 text-xs bg-white"
              >
                <option value={0}>0 pt — Movimientos lentos (≤ 20/min)</option>
                <option value={1}>1 pt — ~25–30 acciones/min con pausas</option>
                <option value={3}>3 pt — ~40 acciones/min rápidas</option>
                <option value={4.5}>4,5 pt — Postura estática sostenida 4,5 min</option>
                <option value={6}>6 pt — ~50–60 acciones/min constantes</option>
                <option value={8}>8 pt — ~60–70 acciones/min muy rápidas</option>
                <option value={10}>10 pt — ≥ 70 acciones/min sin interrupción</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Ficha 4 — Fuerza (Escala Borg, 0–24)</label>
              <select
                value={side.forceFactor}
                onChange={(e) => updateSide({ forceFactor: Number(e.target.value) })}
                className="w-full rounded border border-slate-300 px-2.5 py-2 text-xs bg-white"
              >
                <option value={0}>0 pt — Fuerza nula / muy leve</option>
                <option value={2}>2 pt — Fuerza moderada (Borg 3–4) ~1/3 del tiempo</option>
                <option value={4}>4 pt — Fuerza moderada ~50 % del tiempo</option>
                <option value={6}>6 pt — Fuerza intensa breve (picos 1 % del tiempo)</option>
                <option value={8}>8 pt — Fuerza moderada casi todo el tiempo</option>
                <option value={12}>12 pt — Fuerza intensa 5 % del ciclo</option>
                <option value={24}>24 pt — Fuerza casi máxima &gt; 10 % del ciclo</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Ficha 5A — Hombro (&gt; 80° flex/abd)</label>
              <select
                value={side.shoulderScore}
                onChange={(e) => updateSide({ shoulderScore: Number(e.target.value) })}
                className="w-full rounded border border-slate-300 px-2.5 py-2 text-xs bg-white"
              >
                <option value={0}>0 pt — Brazos bajos / cerca del tronco</option>
                <option value={1}>1 pt — En abducción leve sin apoyo</option>
                <option value={2}>2 pt — Flexión/abducción &gt; 80° (10 % del tiempo)</option>
                <option value={6}>6 pt — Nivel de hombros ~1/3 del tiempo</option>
                <option value={12}>12 pt — Nivel de hombros &gt; 50 % del tiempo</option>
                <option value={24}>24 pt — Sobre cabeza casi todo el tiempo</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Ficha 5B — Codo (&gt; 60° pronosup/flex)</label>
              <select
                value={side.elbowScore}
                onChange={(e) => updateSide({ elbowScore: Number(e.target.value) })}
                className="w-full rounded border border-slate-300 px-2.5 py-2 text-xs bg-white"
              >
                <option value={0}>0 pt — Sin giros ni extensiones amplias</option>
                <option value={2}>2 pt — Giros/flexoextensión amplia ~1/3 del tiempo</option>
                <option value={4}>4 pt — Giros amplios ~50 % del tiempo</option>
                <option value={8}>8 pt — Giros amplios casi todo el ciclo (&gt; 80 %)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Ficha 5C — Muñeca (&gt; 45° flex / &gt; 20° desv)</label>
              <select
                value={side.wristScore}
                onChange={(e) => updateSide({ wristScore: Number(e.target.value) })}
                className="w-full rounded border border-slate-300 px-2.5 py-2 text-xs bg-white"
              >
                <option value={0}>0 pt — Muñeca alineada</option>
                <option value={2}>2 pt — Doblada o desviada ~1/3 del tiempo</option>
                <option value={4}>4 pt — Doblada ~50 % del tiempo</option>
                <option value={8}>8 pt — Postura extrema &gt; 80 % del tiempo</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Ficha 5D — Agarre Mano-Dedos</label>
              <select
                value={side.handGripScore}
                onChange={(e) => updateSide({ handGripScore: Number(e.target.value) })}
                className="w-full rounded border border-slate-300 px-2.5 py-2 text-xs bg-white"
              >
                <option value={0}>0 pt — Agarre de potencia óptimo (power grip)</option>
                <option value={2}>2 pt — Pinza (pinch), palmar o gancho ~1/3 del tiempo</option>
                <option value={4}>4 pt — Pinza / gancho ~50 % del tiempo</option>
                <option value={8}>8 pt — Pinza / gancho &gt; 80 % del ciclo</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Estereotipia Gestual</label>
              <select
                value={side.stereotypyScore}
                onChange={(e) => updateSide({ stereotypyScore: Number(e.target.value) })}
                className="w-full rounded border border-slate-300 px-2.5 py-2 text-xs bg-white"
              >
                <option value={0}>0 pt — Variedad normal de movimientos</option>
                <option value={1.5}>1,5 pt — Gestos idénticos 51–80 % del tiempo (ciclo 8–15 s)</option>
                <option value={3}>3 pt — Gestos idénticos &gt; 80 % o ciclo &lt; 8 s</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Ficha 6A — Complementarios Físico-Mecánicos</label>
              <select
                value={side.complementaryPhysicalScore}
                onChange={(e) => updateSide({ complementaryPhysicalScore: Number(e.target.value) })}
                className="w-full rounded border border-slate-300 px-2.5 py-2 text-xs bg-white"
              >
                <option value={0}>0 pt — Sin factores físico-mecánicos</option>
                <option value={2}>2 pt — Guantes, vibración moderada o compresión 50 %</option>
                <option value={3}>3 pt — Impactos repetidos (≥2/min) o vibración constante</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Ficha 6B — Complementarios Organizativos</label>
              <select
                value={side.complementaryOrganizationalScore}
                onChange={(e) => updateSide({ complementaryOrganizationalScore: Number(e.target.value) })}
                className="w-full rounded border border-slate-300 px-2.5 py-2 text-xs bg-white"
              >
                <option value={0}>0 pt — Ritmo regulable por el trabajador</option>
                <option value={1}>1 pt — Ritmo parcialmente condicionado con márgenes</option>
                <option value={2}>2 pt — Ritmo totalmente impuesto por máquina / línea</option>
              </select>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-5 rounded-lg border border-slate-200 bg-white grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Acciones por Ciclo</label>
            <input
              type="number"
              min={1}
              value={data.actionsPerCycle}
              onChange={(e) => onChange({ ...data, actionsPerCycle: Math.max(1, Number(e.target.value) || 1) })}
              className="w-full rounded border border-slate-300 px-3 py-2 text-xs font-mono tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Duración del Ciclo (s)</label>
            <input
              type="number"
              min={1}
              value={data.cycleDurationSec}
              onChange={(e) => onChange({ ...data, cycleDurationSec: Math.max(1, Number(e.target.value) || 1) })}
              className="w-full rounded border border-slate-300 px-3 py-2 text-xs font-mono tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Tiempo Neto Repetitivo (min)</label>
            <input
              type="number"
              min={15}
              value={data.netRepetitiveMinutes}
              onChange={(e) => onChange({ ...data, netRepetitiveMinutes: Math.max(15, Number(e.target.value) || 60) })}
              className="w-full rounded border border-slate-300 px-3 py-2 text-xs font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Coef. Recuperación (Tabla 6.11)</label>
            <select
              value={data.coefRecovery}
              onChange={(e) => onChange({ ...data, coefRecovery: Number(e.target.value) as OcraChecklistData['coefRecovery'] })}
              className="w-full rounded border border-slate-300 px-2.5 py-2 text-xs bg-white"
            >
              <option value={1.0}>1,00 — Pausas suficientes cada hora</option>
              <option value={0.8}>0,80 — Recuperación parcial (2–3 h sin pausa)</option>
              <option value={0.6}>0,60 — Recuperación insuficiente (&gt; 3 h sin pausa)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Coef. Frecuencia (Tabla 6.12)</label>
            <select
              value={data.coefFrequency}
              onChange={(e) =>
                onChange({ ...data, coefFrequency: Number(e.target.value) as OcraChecklistData['coefFrequency'] })
              }
              className="w-full rounded border border-slate-300 px-2.5 py-2 text-xs bg-white"
            >
              <option value={1.0}>1,00 — Frecuencia baja (≤ 25 acc/min)</option>
              <option value={0.8}>0,80 — Frecuencia media (26–40 acc/min)</option>
              <option value={0.6}>0,60 — Frecuencia alta (41–60 acc/min)</option>
              <option value={0.4}>0,40 — Frecuencia muy alta (&gt; 60 acc/min)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Coef. Fuerza (Tabla 6.13)</label>
            <select
              value={data.coefForce}
              onChange={(e) => onChange({ ...data, coefForce: Number(e.target.value) as OcraChecklistData['coefForce'] })}
              className="w-full rounded border border-slate-300 px-2.5 py-2 text-xs bg-white"
            >
              <option value={1.0}>1,00 — Fuerza mínima</option>
              <option value={0.85}>0,85 — Fuerza ligera</option>
              <option value={0.65}>0,65 — Fuerza moderada</option>
              <option value={0.35}>0,35 — Fuerza intensa</option>
              <option value={0.15}>0,15 — Fuerza muy intensa</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Coef. Postura (Tabla 6.14)</label>
            <select
              value={data.coefPosture}
              onChange={(e) => onChange({ ...data, coefPosture: Number(e.target.value) as OcraChecklistData['coefPosture'] })}
              className="w-full rounded border border-slate-300 px-2.5 py-2 text-xs bg-white"
            >
              <option value={1.0}>1,00 — Postura cómoda / neutra</option>
              <option value={0.85}>0,85 — Desviación postural leve</option>
              <option value={0.7}>0,70 — Postura forzada moderada</option>
              <option value={0.5}>0,50 — Postura extrema sostenida</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Coef. Complementarios (Tabla 6.15)</label>
            <select
              value={data.coefComplementary}
              onChange={(e) =>
                onChange({ ...data, coefComplementary: Number(e.target.value) as OcraChecklistData['coefComplementary'] })
              }
              className="w-full rounded border border-slate-300 px-2.5 py-2 text-xs bg-white"
            >
              <option value={1.0}>1,00 — Ausentes</option>
              <option value={0.9}>0,90 — Leves</option>
              <option value={0.8}>0,80 — Moderados</option>
              <option value={0.7}>0,70 — Intensos</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Coef. Duración (Tabla 6.17)</label>
            <select
              value={data.coefDuration}
              onChange={(e) => onChange({ ...data, coefDuration: Number(e.target.value) as OcraChecklistData['coefDuration'] })}
              className="w-full rounded border border-slate-300 px-2.5 py-2 text-xs bg-white"
            >
              <option value={1.0}>1,00 — &lt; 120 min</option>
              <option value={0.9}>0,90 — 120–239 min</option>
              <option value={0.8}>0,80 — 240–359 min</option>
              <option value={0.7}>0,70 — 360–480 min</option>
              <option value={0.6}>0,60 — &gt; 480 min</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 6. MÉTODO JSI — JOB STRAIN INDEX (CAPÍTULO 6.4 Y 6.6)
// ============================================================================
const JSI_WRIST_OPTIONS: AngleOption<1 | 2 | 3 | 4 | 5>[] = [
  {
    value: 1,
    angleText: 'Muy buena',
    title: 'Perfectamente neutra',
    subtitle: 'Alineada 0°',
    renderSvg: RULA_WRIST_OPTIONS[0].renderSvg,
  },
  {
    value: 2,
    angleText: 'Buena',
    title: 'Cercana a la neutralidad',
    subtitle: 'Desviación mínima (<10°)',
    renderSvg: RULA_WRIST_OPTIONS[1].renderSvg,
  },
  {
    value: 3,
    angleText: 'Regular',
    title: 'No neutra perceptible',
    subtitle: 'Flexión/extensión 10°–25°',
    renderSvg: RULA_WRIST_OPTIONS[1].renderSvg,
  },
  {
    value: 4,
    angleText: 'Mala',
    title: 'Desviación marcada',
    subtitle: 'Flexión/extensión > 25°–40°',
    renderSvg: RULA_WRIST_OPTIONS[2].renderSvg,
  },
  {
    value: 5,
    angleText: 'Muy mala',
    title: 'Desviación extrema',
    subtitle: 'Cercana al límite articular',
    renderSvg: RULA_WRIST_OPTIONS[2].renderSvg,
  },
];

export function JsiForm({ data, onChange }: { data: JsiData; onChange: (next: JsiData) => void }) {
  return (
    <div className="p-5 rounded-lg border border-slate-200 bg-white space-y-5">
      <RepetitiveCycleAndAnglesGuide methodName="Job Strain Index — JSI (Cap. 6.4)" />
      <VisualAngleSelector
        label="Postura de la Mano / Muñeca (PM — Tabla 6.22)"
        figureRef="Guía angular distal JSI"
        selectedValue={data.pmWristPosture}
        onSelect={(val) => onChange({ ...data, pmWristPosture: val })}
        options={JSI_WRIST_OPTIONS}
        columns={5}
      />

      <div className="pt-3 border-t border-slate-100">
        <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer mb-3">
          <input
            type="checkbox"
            checked={data.autoComputeCycleScores}
            onChange={(e) => onChange({ ...data, autoComputeCycleScores: e.target.checked })}
            className="rounded border-slate-300 text-sky-600"
          />
          Calcular automáticamente DE (% duración del esfuerzo) y EPM (esfuerzos/min) a partir de tiempos medidos del ciclo
        </label>

        {data.autoComputeCycleScores ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Duración acumulada de esfuerzo por ciclo (s)</label>
              <input
                type="number"
                min={0.2}
                step={0.2}
                value={data.effortDurationSec}
                onChange={(e) => onChange({ ...data, effortDurationSec: Math.max(0.1, Number(e.target.value) || 1) })}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Duración total del ciclo (s)</label>
              <input
                type="number"
                min={1}
                step={0.5}
                value={data.cycleDurationSec}
                onChange={(e) => onChange({ ...data, cycleDurationSec: Math.max(1, Number(e.target.value) || 1) })}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Duración del Esfuerzo DE (Tabla 6.20)</label>
              <select
                value={data.deDurationScore}
                onChange={(e) => onChange({ ...data, deDurationScore: Number(e.target.value) as JsiData['deDurationScore'] })}
                className="w-full rounded border border-slate-300 px-3 py-2 text-xs bg-white"
              >
                <option value={1}>1 — &lt; 10 % del ciclo</option>
                <option value={2}>2 — 10 % a 29 % del ciclo</option>
                <option value={3}>3 — 30 % a 49 % del ciclo</option>
                <option value={4}>4 — 50 % a 79 % del ciclo</option>
                <option value={5}>5 — ≥ 80 % del ciclo</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Esfuerzos por Minuto EPM (Tabla 6.21)</label>
              <select
                value={data.epmEffortsScore}
                onChange={(e) => onChange({ ...data, epmEffortsScore: Number(e.target.value) as JsiData['epmEffortsScore'] })}
                className="w-full rounded border border-slate-300 px-3 py-2 text-xs bg-white"
              >
                <option value={1}>1 — &lt; 4 esfuerzos/min</option>
                <option value={2}>2 — 4 a 8 esfuerzos/min</option>
                <option value={3}>3 — 9 a 14 esfuerzos/min</option>
                <option value={4}>4 — 15 a 19 esfuerzos/min</option>
                <option value={5}>5 — ≥ 20 esfuerzos/min</option>
              </select>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Intensidad del Esfuerzo IE (Tabla 6.19)</label>
            <select
              value={data.ieIntensity}
              onChange={(e) => onChange({ ...data, ieIntensity: Number(e.target.value) as JsiData['ieIntensity'] })}
              className="w-full rounded border border-slate-300 px-3 py-2 text-xs bg-white"
            >
              <option value={1}>1 — Ligero (esfuerzo apenas perceptible)</option>
              <option value={2}>2 — Un poco duro (esfuerzo definido)</option>
              <option value={3}>3 — Duro (esfuerzo evidente, expresión facial sin cambio)</option>
              <option value={4}>4 — Muy duro (esfuerzo sustancial, cambia expresión)</option>
              <option value={5}>5 — Cercano al máximo (usa tronco/hombros)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Duración Diaria de la Tarea HT (Tabla 6.23)</label>
            <select
              value={data.htHoursPerDay}
              onChange={(e) => onChange({ ...data, htHoursPerDay: Number(e.target.value) as JsiData['htHoursPerDay'] })}
              className="w-full rounded border border-slate-300 px-3 py-2 text-xs bg-white"
            >
              <option value={1}>1 — ≤ 1 hora/día</option>
              <option value={2}>2 — &gt; 1 a 2 horas/día</option>
              <option value={3}>3 — &gt; 2 a 4 horas/día</option>
              <option value={4}>4 — &gt; 4 a 8 horas/día</option>
              <option value={5}>5 — &gt; 8 horas/día</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Ritmo / Velocidad de Trabajo NP (Tabla 6.24)</label>
            <select
              value={data.npSpeedWork}
              onChange={(e) => onChange({ ...data, npSpeedWork: Number(e.target.value) as JsiData['npSpeedWork'] })}
              className="w-full rounded border border-slate-300 px-3 py-2 text-xs bg-white"
            >
              <option value={1}>1 — Muy lento (ritmo extremadamente relajado)</option>
              <option value={2}>2 — Lento (ritmo pausado)</option>
              <option value={3}>3 — Regular (velocidad normal de movimiento)</option>
              <option value={4}>4 — Rápido (apresurado pero sostenible)</option>
              <option value={5}>5 — Muy rápido (al límite de seguimiento)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 7. NIVEL DE ACTIVIDAD MANUAL NAM — RESOLUCIÓN 295/03
// ============================================================================
export function Nam295Form({
  data,
  namPoints,
  onChange,
}: {
  data: Nam295Data;
  namPoints?: {
    right: { nam: number; borg: number; zone: string };
    left: { nam: number; borg: number; zone: string };
  };
  onChange: (next: Nam295Data) => void;
}) {
  const updateHand = (hand: 'right' | 'left', patch: Partial<NamHandInput>) => {
    onChange({
      ...data,
      [hand]: { ...data[hand], ...patch },
    });
  };

  return (
    <div className="space-y-5">
      <RepetitiveCycleAndAnglesGuide methodName="Nivel de Actividad Manual NAM — Res. 295/03" />
      {namPoints && (
        <NamThresholdChart
          rightNam={namPoints.right.nam}
          rightBorg={namPoints.right.borg}
          leftNam={namPoints.left.nam}
          leftBorg={namPoints.left.borg}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(['right', 'left'] as const).map((handKey) => {
          const h = data[handKey];
          const title = handKey === 'right' ? 'Mano Derecha' : 'Mano Izquierda';
          return (
            <div key={handKey} className="p-5 rounded-lg border border-slate-200 bg-white space-y-3.5">
              <h5 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2">{title}</h5>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">N° Esfuerzos Observados</label>
                  <input
                    type="number"
                    min={0}
                    value={h.effortsCount}
                    onChange={(e) => updateHand(handKey, { effortsCount: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Período Observado (s)</label>
                  <input
                    type="number"
                    min={10}
                    value={h.observationPeriodSec}
                    onChange={(e) => updateHand(handKey, { observationPeriodSec: Math.max(10, Number(e.target.value) || 60) })}
                    className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tiempo Total Esfuerzo (s)</label>
                  <input
                    type="number"
                    min={0}
                    value={h.effortTimeSec}
                    onChange={(e) => updateHand(handKey, { effortTimeSec: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Fuerza Pico (Borg 0–10)</label>
                  <select
                    value={h.borgPeakForce}
                    onChange={(e) => updateHand(handKey, { borgPeakForce: Number(e.target.value) })}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs font-mono bg-white"
                  >
                    <option value={0}>0 — Ausencia de esfuerzo</option>
                    <option value={0.5}>0,5 — Muy, muy débil</option>
                    <option value={1}>1 — Muy débil</option>
                    <option value={2}>2 — Débil (ligero)</option>
                    <option value={3}>3 — Moderado</option>
                    <option value={4}>4 — Algo fuerte</option>
                    <option value={5}>5 — Fuerte</option>
                    <option value={6}>6 — Fuerte +</option>
                    <option value={7}>7 — Muy fuerte</option>
                    <option value={8}>8 — Muy fuerte +</option>
                    <option value={9}>9 — Extremadamente fuerte</option>
                    <option value={10}>10 — Esfuerzo máximo</option>
                  </select>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4 rounded-lg border border-slate-200 bg-white flex flex-wrap gap-6 text-xs text-slate-700">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={data.prolongedAwkwardWrist}
            onChange={(e) => onChange({ ...data, prolongedAwkwardWrist: e.target.checked })}
            className="rounded border-slate-300 text-sky-600"
          />
          Flexión, extensión o desviación cubital prolongada de muñeca (factor agravante Res. 295/03)
        </label>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={data.contactStress}
            onChange={(e) => onChange({ ...data, contactStress: e.target.checked })}
            className="rounded border-slate-300 text-sky-600"
          />
          Estrés mecánico por contacto sobre bordes duros o aristas
        </label>
      </div>
    </div>
  );
}

// Re-export unused imports guard if needed by keeping file clean
export { UPPER_ARM_OPTIONS, LOWER_ARM_OPTIONS };

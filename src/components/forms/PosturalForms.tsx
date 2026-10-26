import React, { useRef, useState } from 'react';
import { Box, Copy, Download, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import {
  BipolarData,
  OwasData,
  OwasObservation,
  RebaData,
  RebaSideInput,
  RulaData,
  RulaSideInput,
} from '../../types/ergonomics';
import { BIPOLAR_ITEMS } from '../../utils/defaults';
import { ASSIGNED_CHAPTER4_PHOTOS } from '../../utils/figurePlanCatalog';
import {
  AngleOption,
  LOWER_ARM_OPTIONS,
  ModifierPlateBanner,
  OWAS_ARMS_OPTIONS,
  OWAS_BACK_OPTIONS,
  REBA_LOWER_ARM_OPTIONS,
  REBA_NECK_OPTIONS,
  REBA_TRUNK_OPTIONS,
  REBA_UPPER_ARM_OPTIONS,
  REBA_WRIST_OPTIONS,
  RULA_NECK_OPTIONS,
  RULA_TRUNK_OPTIONS,
  RULA_WRIST_OPTIONS,
  UPPER_ARM_OPTIONS,
  VisualAngleSelector,
} from '../AngleGuides';
import { Biomech3DControlPanel } from '../Biomech3DControlPanel';

// ============================================================================
// ESQUEMAS Y LÁMINAS ANATÓMICAS PARA PIERNAS (RULA, REBA Y OWAS 1..7)
// ============================================================================
const RULA_LEGS_OPTIONS: AngleOption<1 | 2>[] = [
  {
    value: 1,
    angleText: 'Equilibradas',
    title: 'Piernas y pies bien apoyados',
    subtitle: 'Sentado o de pie con peso simétrico',
    photoSlice: { url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-17'], totalCols: 3, colIndex: 1, figCode: 'Fig. 4.17 (+1)' },
    renderSvg: (a) => (
      <svg viewBox="0 0 110 92" className="w-28 h-22">
        <line x1="25" y1="84" x2="85" y2="84" stroke="#64748b" strokeWidth="2" />
        <circle cx="55" cy="18" r="6" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5" />
        <line x1="55" y1="24" x2="55" y2="52" stroke="#475569" strokeWidth="5" />
        <line x1="50" y1="52" x2="46" y2="83" stroke={a ? '#0284c7' : '#334155'} strokeWidth="4" strokeLinecap="round" />
        <line x1="60" y1="52" x2="64" y2="83" stroke={a ? '#0284c7' : '#334155'} strokeWidth="4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: 2,
    angleText: 'Inestables',
    title: 'Sin apoyo bilateral equilibrado',
    subtitle: 'Apoyo en un solo pie o inestable',
    photoSlice: { url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-17'], totalCols: 3, colIndex: 2, figCode: 'Fig. 4.17 (+2)' },
    renderSvg: (a) => (
      <svg viewBox="0 0 110 92" className="w-28 h-22">
        <line x1="25" y1="84" x2="85" y2="84" stroke="#64748b" strokeWidth="2" />
        <circle cx="55" cy="18" r="6" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5" />
        <line x1="55" y1="24" x2="55" y2="52" stroke="#475569" strokeWidth="5" />
        <line x1="50" y1="52" x2="48" y2="83" stroke={a ? '#0284c7' : '#334155'} strokeWidth="4" strokeLinecap="round" />
        <polyline points="60,52 72,64 64,74" fill="none" stroke={a ? '#dc2626' : '#334155'} strokeWidth="4" strokeLinecap="round" />
      </svg>
    ),
  },
];

const REBA_LEGS_BASE_OPTIONS: AngleOption<1 | 2>[] = [
  {
    value: 1,
    angleText: 'Bilateral / Sentado',
    title: 'Soporte bilateral o sentado',
    subtitle: 'Caminando o de pie simétrico (+1)',
    photoSlice: { url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-21a'], totalCols: 3, colIndex: 1, figCode: 'Fig. 4.21a (+1)' },
    renderSvg: RULA_LEGS_OPTIONS[0].renderSvg,
  },
  {
    value: 2,
    angleText: 'Unilateral / Inestable',
    title: 'Soporte unilateral o inestable',
    subtitle: 'Peso sobre una pierna (+2)',
    photoSlice: { url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-21a'], totalCols: 3, colIndex: 2, figCode: 'Fig. 4.21a (+2)' },
    renderSvg: RULA_LEGS_OPTIONS[1].renderSvg,
  },
];

const REBA_KNEE_OPTIONS: AngleOption<0 | 1 | 2>[] = [
  {
    value: 0,
    angleText: '0° a 30°',
    title: 'Rodillas casi extendidas',
    subtitle: 'Sin penalización adicional (+0)',
    photoSlice: { url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-21a'], totalCols: 3, colIndex: 1, figCode: 'Fig. 4.21a (0°–30°)' },
    renderSvg: (a) => (
      <svg viewBox="0 0 110 92" className="w-28 h-22">
        <line x1="25" y1="84" x2="85" y2="84" stroke="#64748b" strokeWidth="2" />
        <line x1="54" y1="22" x2="54" y2="54" stroke="#64748b" strokeWidth="5" />
        <line x1="54" y1="54" x2="56" y2="83" stroke={a ? '#0284c7' : '#334155'} strokeWidth="4.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: 1,
    angleText: '30° a 60°',
    title: 'Flexión media de rodillas',
    subtitle: 'Suma +1 punto a piernas',
    photoSlice: { url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-21b'], totalCols: 2, colIndex: 0, figCode: 'Fig. 4.21b (+1)' },
    renderSvg: (a) => (
      <svg viewBox="0 0 110 92" className="w-28 h-22">
        <line x1="25" y1="84" x2="85" y2="84" stroke="#64748b" strokeWidth="2" />
        <line x1="48" y1="20" x2="48" y2="48" stroke="#64748b" strokeWidth="5" />
        <polyline points="48,48 64,64 52,83" fill="none" stroke={a ? '#0284c7' : '#334155'} strokeWidth="4.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: 2,
    angleText: '> 60° / Cuclillas',
    title: 'Flexión profunda (> 60°)',
    subtitle: 'Suma +2 puntos (no aplica sentado)',
    photoSlice: { url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-21b'], totalCols: 2, colIndex: 1, figCode: 'Fig. 4.21b (+2)' },
    renderSvg: (a) => (
      <svg viewBox="0 0 110 92" className="w-28 h-22">
        <line x1="25" y1="84" x2="85" y2="84" stroke="#64748b" strokeWidth="2" />
        <line x1="44" y1="30" x2="44" y2="58" stroke="#64748b" strokeWidth="5" />
        <polyline points="44,58 72,66 50,83" fill="none" stroke={a ? '#dc2626' : '#334155'} strokeWidth="4.2" strokeLinecap="round" />
      </svg>
    ),
  },
];

const OWAS_LEGS_OPTIONS: AngleOption<1 | 2 | 3 | 4 | 5 | 6 | 7>[] = [
  {
    value: 1,
    angleText: 'Cód. 1',
    title: 'Sentado',
    subtitle: 'Apoyado en asiento',
    photoSlice: { url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-29a'], totalCols: 1, colIndex: 0, figCode: 'Fig. 4.29a (1)' },
    renderSvg: (a) => (
      <svg viewBox="0 0 90 78" className="w-20 h-18">
        <path d="M 28 32 L 28 56 L 52 56" fill="none" stroke="#94a3b8" strokeWidth="2" />
        <polyline points="36,24 36,52 56,52 56,72" fill="none" stroke={a ? '#0284c7' : '#334155'} strokeWidth="3.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: 2,
    angleText: 'Cód. 2',
    title: 'De pie 2 piernas',
    subtitle: 'Ambas rectas',
    photoSlice: { url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-29b'], totalCols: 1, colIndex: 0, figCode: 'Fig. 4.29b (2)' },
    renderSvg: (a) => (
      <svg viewBox="0 0 90 78" className="w-20 h-18">
        <line x1="45" y1="16" x2="45" y2="42" stroke="#64748b" strokeWidth="4" />
        <line x1="40" y1="42" x2="38" y2="72" stroke={a ? '#0284c7' : '#334155'} strokeWidth="3.5" />
        <line x1="50" y1="42" x2="52" y2="72" stroke={a ? '#0284c7' : '#334155'} strokeWidth="3.5" />
      </svg>
    ),
  },
  {
    value: 3,
    angleText: 'Cód. 3',
    title: 'De pie 1 pierna',
    subtitle: 'Peso en 1 pierna recta',
    photoSlice: { url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-29c'], totalCols: 1, colIndex: 0, figCode: 'Fig. 4.29c (3)' },
    renderSvg: (a) => (
      <svg viewBox="0 0 90 78" className="w-20 h-18">
        <line x1="45" y1="16" x2="45" y2="42" stroke="#64748b" strokeWidth="4" />
        <line x1="41" y1="42" x2="41" y2="72" stroke={a ? '#0284c7' : '#334155'} strokeWidth="3.5" />
        <polyline points="49,42 60,54 52,64" fill="none" stroke="#94a3b8" strokeWidth="3" />
      </svg>
    ),
  },
  {
    value: 4,
    angleText: 'Cód. 4',
    title: '2 rodillas flex.',
    subtitle: 'Agachado / cuclillas',
    photoSlice: { url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-29d'], totalCols: 4, colIndex: 0, figCode: 'Fig. 4.29d (4)' },
    renderSvg: (a) => (
      <svg viewBox="0 0 90 78" className="w-20 h-18">
        <line x1="38" y1="20" x2="38" y2="44" stroke="#64748b" strokeWidth="4" />
        <polyline points="38,44 58,56 42,72" fill="none" stroke={a ? '#dc2626' : '#334155'} strokeWidth="3.5" />
      </svg>
    ),
  },
  {
    value: 5,
    angleText: 'Cód. 5',
    title: '1 rodilla flex.',
    subtitle: 'Apoyo asimétrico flex.',
    photoSlice: { url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-29d'], totalCols: 4, colIndex: 1, figCode: 'Fig. 4.29d (5)' },
    renderSvg: (a) => (
      <svg viewBox="0 0 90 78" className="w-20 h-18">
        <line x1="40" y1="20" x2="40" y2="44" stroke="#64748b" strokeWidth="4" />
        <polyline points="40,44 56,56 44,72" fill="none" stroke={a ? '#dc2626' : '#334155'} strokeWidth="3.5" />
        <line x1="36" y1="44" x2="26" y2="66" stroke="#94a3b8" strokeWidth="2.8" />
      </svg>
    ),
  },
  {
    value: 6,
    angleText: 'Cód. 6',
    title: 'Arrodillado',
    subtitle: '1 o 2 rodillas en suelo',
    photoSlice: { url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-29d'], totalCols: 4, colIndex: 2, figCode: 'Fig. 4.29d (6)' },
    renderSvg: (a) => (
      <svg viewBox="0 0 90 78" className="w-20 h-18">
        <line x1="18" y1="72" x2="72" y2="72" stroke="#cbd5e1" strokeWidth="2" />
        <polyline points="38,24 38,50 38,71 62,71" fill="none" stroke={a ? '#0284c7' : '#334155'} strokeWidth="3.5" />
      </svg>
    ),
  },
  {
    value: 7,
    angleText: 'Cód. 7',
    title: 'Caminando',
    subtitle: 'Desplazamiento activo',
    photoSlice: { url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-29d'], totalCols: 4, colIndex: 3, figCode: 'Fig. 4.29d (7)' },
    renderSvg: (a) => (
      <svg viewBox="0 0 90 78" className="w-20 h-18">
        <line x1="45" y1="16" x2="45" y2="42" stroke="#64748b" strokeWidth="4" />
        <polyline points="45,42 32,58 26,72" fill="none" stroke={a ? '#0284c7' : '#334155'} strokeWidth="3.5" />
        <polyline points="45,42 56,56 64,70" fill="none" stroke={a ? '#0284c7' : '#334155'} strokeWidth="3.5" />
      </svg>
    ),
  },
];

// ============================================================================
// 1. FORMULARIO RULA
// ============================================================================
export function RulaForm({ data, onChange }: { data: RulaData; onChange: (next: RulaData) => void }) {
  const [editingSide, setEditingSide] = useState<'right' | 'left'>('right');
  const activeSideKey: 'right' | 'left' =
    data.evaluatedSide === 'derecho' ? 'right' : data.evaluatedSide === 'izquierdo' ? 'left' : editingSide;

  const sideData = data[activeSideKey];

  const updateSide = (patch: Partial<RulaSideInput>) => {
    onChange({
      ...data,
      [activeSideKey]: { ...sideData, ...patch },
    });
  };

  const copyRightToLeft = () => {
    onChange({
      ...data,
      left: { ...data.right },
    });
  };

  return (
    <div className="space-y-6">
      {/* Control Biomecánico 3D Sincronizado con las 36 Láminas Enviadas */}
      <Biomech3DControlPanel
        method="RULA"
        data={data}
        activeSide={activeSideKey}
        onChange={onChange}
      />

      {/* Selector de lado y tiempos del ciclo */}
      <div className="p-4 rounded-lg border border-slate-200 bg-white grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
        <div className="md:col-span-6">
          <label className="block text-xs font-medium text-slate-700 mb-1.5">Hemicuerpo / Lado Evaluado</label>
          <div className="inline-flex rounded-md border border-slate-300 bg-slate-50 p-0.5">
            {(['derecho', 'izquierdo', 'ambos'] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => onChange({ ...data, evaluatedSide: side })}
                className={`px-3 py-1.5 text-xs font-medium rounded capitalize whitespace-nowrap cursor-pointer transition-colors ${
                  data.evaluatedSide === side ? 'bg-slate-900 text-white' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                {side === 'ambos' ? 'Ambos lados (Bilateral)' : `Lado ${side}`}
              </button>
            ))}
          </div>
        </div>

        <div className="md:col-span-3">
          <label className="block text-xs font-medium text-slate-700 mb-1">Duración del ciclo (s)</label>
          <input
            type="number"
            min={1}
            value={data.cycleDurationSec}
            onChange={(e) => onChange({ ...data, cycleDurationSec: Math.max(1, Number(e.target.value) || 1) })}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm font-mono tabular-nums text-slate-900"
          />
        </div>

        <div className="md:col-span-3">
          <label className="block text-xs font-medium text-slate-700 mb-1">Postura mantenida (s)</label>
          <input
            type="number"
            min={0}
            value={data.postureHoldTimeSec}
            onChange={(e) => onChange({ ...data, postureHoldTimeSec: Math.max(0, Number(e.target.value) || 0) })}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm font-mono tabular-nums text-slate-900"
          />
        </div>
      </div>

      {/* GRUPO A: Brazo, Antebrazo, Muñeca */}
      <div className="p-5 rounded-lg border border-slate-200 bg-white space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">
              Grupo A — Miembro Superior ({activeSideKey === 'right' ? 'Lado Derecho' : 'Lado Izquierdo'})
            </h4>
            <p className="text-xs text-slate-500">Seleccione el rango angular sobre las láminas anatómicas Cap. 4 y marque modificadores</p>
          </div>

          {data.evaluatedSide === 'ambos' && (
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-md border border-slate-300 bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setEditingSide('right')}
                  className={`px-3 py-1 text-xs font-medium rounded cursor-pointer ${
                    editingSide === 'right' ? 'bg-sky-600 text-white' : 'text-slate-700'
                  }`}
                >
                  Editar Derecho
                </button>
                <button
                  type="button"
                  onClick={() => setEditingSide('left')}
                  className={`px-3 py-1 text-xs font-medium rounded cursor-pointer ${
                    editingSide === 'left' ? 'bg-sky-600 text-white' : 'text-slate-700'
                  }`}
                >
                  Editar Izquierdo
                </button>
              </div>
              <button
                type="button"
                onClick={copyRightToLeft}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 whitespace-nowrap cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar Der → Izq
              </button>
            </div>
          )}
        </div>

        {/* Brazo */}
        <VisualAngleSelector
          label="1. Posición del Brazo (Flexión / Extensión sagital)"
          figureRef="Fig. 4.4a y Fig. 4.5 · Tabla 4.2"
          selectedValue={sideData.upperArmPos}
          onSelect={(val) => updateSide({ upperArmPos: val })}
          options={UPPER_ARM_OPTIONS}
          columns={4}
          plateRefs={[
            { code: 'Fig. 4.4a', label: 'Puntuaciones base del brazo (1 a 4)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-04a'] },
            { code: 'Fig. 4.5', label: 'Referencia del eje del tronco', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-05'] },
          ]}
        />
        <div className="space-y-2 pt-1">
          <div className="flex flex-wrap gap-4 text-xs text-slate-700">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sideData.shoulderRaised}
                onChange={(e) => updateSide({ shoulderRaised: e.target.checked })}
                className="rounded border-slate-300 text-sky-600"
              />
              Hombro elevado (+1)
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sideData.armAbducted}
                onChange={(e) => updateSide({ armAbducted: e.target.checked })}
                className="rounded border-slate-300 text-sky-600"
              />
              Brazo abducido / separado (+1)
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sideData.armSupported}
                onChange={(e) => updateSide({ armSupported: e.target.checked })}
                className="rounded border-slate-300 text-sky-600"
              />
              Brazo apoyado o cuerpo inclinado a favor (−1)
            </label>
          </div>
          <ModifierPlateBanner
            caption="Modificadores de hombro y brazo (Tabla 4.3)"
            plates={[
              { code: 'Fig. 4.4b', label: 'Abducción (+1) y apoyo (−1)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-04b'] },
              { code: 'Fig. 4.6a', label: 'Elevación (+1), rotación (+1) y apoyo (−1)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-06a'] },
            ]}
          />
        </div>

        {/* Antebrazo */}
        <div className="pt-3 border-t border-slate-100 space-y-2.5">
          <VisualAngleSelector
            label="2. Posición del Antebrazo (Flexión de codo)"
            figureRef="Fig. 4.7 y Fig. 4.8 · Tabla 4.4"
            selectedValue={sideData.lowerArmPos}
            onSelect={(val) => updateSide({ lowerArmPos: val })}
            options={LOWER_ARM_OPTIONS}
            columns={2}
            plateRefs={[
              { code: 'Fig. 4.7', label: 'Puntuaciones de antebrazo (1 y 2)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-07'] },
              { code: 'Fig. 4.8', label: 'Referencia del eje para antebrazo', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-08'] },
            ]}
          />
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={sideData.lowerArmCrossMidline}
              onChange={(e) => updateSide({ lowerArmCrossMidline: e.target.checked })}
              className="rounded border-slate-300 text-sky-600"
            />
            Cruza la línea media del cuerpo o trabaja hacia afuera del eje (+1)
          </label>
          <ModifierPlateBanner
            caption="Vista cenital de cruce de línea media y proyección externa (Tabla 4.5)"
            plates={[
              { code: 'Fig. 4.9', label: 'Cruce medial (+1) y trabajo externo (+1)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-09'] },
            ]}
          />
        </div>

        {/* Muñeca y Giro */}
        <div className="pt-3 border-t border-slate-100 space-y-3">
          <VisualAngleSelector
            label="3. Posición de la Muñeca"
            figureRef="Fig. 4.10a y Fig. 4.10b · Tabla 4.6"
            selectedValue={sideData.wristPos}
            onSelect={(val) => updateSide({ wristPos: val })}
            options={RULA_WRIST_OPTIONS}
            columns={3}
            plateRefs={[
              { code: 'Fig. 4.10a', label: 'Rangos de muñeca RULA (1, 2 y 3)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-10a'] },
              { code: 'Fig. 4.10b', label: 'Detalle flexo-extensión > 15° (3)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-10b'] },
            ]}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={sideData.wristDeviated}
                onChange={(e) => updateSide({ wristDeviated: e.target.checked })}
                className="rounded border-slate-300 text-sky-600"
              />
              Desviación radial o cubital de la muñeca (+1)
            </label>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">4. Giro de Muñeca (Pronosupinación)</label>
              <select
                value={sideData.wristTwist}
                onChange={(e) => updateSide({ wristTwist: Number(e.target.value) as 1 | 2 })}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 bg-white"
              >
                <option value={1}>1 pt — Pronación o supinación en rango medio</option>
                <option value={2}>2 pt — Pronación o supinación extrema / final de rango</option>
              </select>
            </div>
          </div>
          <ModifierPlateBanner
            caption="Giro pronosupinador del antebrazo y muñeca (Tabla 4.8)"
            plates={[
              { code: 'Fig. 4.12', label: 'Rango medio (+1) y extremo (+2)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-12'] },
            ]}
          />
        </div>

        {/* Uso muscular y Fuerza Grupo A */}
        <div className="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Uso Muscular Grupo A (Tabla 4.16)</label>
            <select
              value={sideData.muscleUseA}
              onChange={(e) => updateSide({ muscleUseA: Number(e.target.value) as 0 | 1 })}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 bg-white"
            >
              <option value={0}>0 pt — Postura dinámica ocasional (&lt; 4 veces/min)</option>
              <option value={1}>+1 pt — Estática (&gt; 1 min) o repetitiva (&gt; 4 veces/min)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Fuerza / Carga Aplicada Grupo A (Tabla 4.17)</label>
            <select
              value={sideData.forceLoadA}
              onChange={(e) => updateSide({ forceLoadA: Number(e.target.value) as 0 | 1 | 2 | 3 })}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 bg-white"
            >
              <option value={0}>0 pt — Carga &lt; 2 kg intermitente</option>
              <option value={1}>+1 pt — Carga de 2 a 10 kg intermitente</option>
              <option value={2}>+2 pt — Carga de 2 a 10 kg estática/repetitiva, o &gt; 10 kg intermitente</option>
              <option value={3}>+3 pt — Carga &gt; 10 kg estática/repetitiva, o golpes/fuerzas bruscas</option>
            </select>
          </div>
        </div>
      </div>

      {/* GRUPO B: Cuello, Tronco y Piernas */}
      <div className="p-5 rounded-lg border border-slate-200 bg-white space-y-5">
        <div className="border-b border-slate-100 pb-3">
          <h4 className="text-sm font-semibold text-slate-900">Grupo B — Cuello, Tronco y Piernas</h4>
          <p className="text-xs text-slate-500">Valoración axial común para el cálculo de las Puntuaciones B y D</p>
        </div>

        <VisualAngleSelector
          label="5. Posición del Cuello"
          figureRef="Fig. 4.13a · Tabla 4.9"
          selectedValue={data.neckPos}
          onSelect={(val) => onChange({ ...data, neckPos: val })}
          options={RULA_NECK_OPTIONS}
          columns={4}
        />
        <div className="space-y-2">
          <div className="flex flex-wrap gap-4 text-xs text-slate-700">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={data.neckRotated}
                onChange={(e) => onChange({ ...data, neckRotated: e.target.checked })}
                className="rounded border-slate-300 text-sky-600"
              />
              Cuello rotado (+1)
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={data.neckSideBending}
                onChange={(e) => onChange({ ...data, neckSideBending: e.target.checked })}
                className="rounded border-slate-300 text-sky-600"
              />
              Inclinación lateral del cuello (+1)
            </label>
          </div>
          <ModifierPlateBanner
            caption="Modificadores cervicales de rotación e inclinación lateral (Tabla 4.10)"
            plates={[
              { code: 'Fig. 4.13b', label: 'Rotación (+1) e inclinación lateral (+1)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-13b'] },
            ]}
          />
        </div>

        <div className="pt-3 border-t border-slate-100 space-y-2.5">
          <VisualAngleSelector
            label="6. Posición del Tronco"
            figureRef="Fig. 4.15a y Fig. 4.15b · Tabla 4.11"
            selectedValue={data.trunkPos}
            onSelect={(val) => onChange({ ...data, trunkPos: val })}
            options={RULA_TRUNK_OPTIONS}
            columns={4}
            plateRefs={[
              { code: 'Fig. 4.15a', label: 'Puntuaciones del tronco RULA (1 a 4)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-15a'] },
              { code: 'Fig. 4.15b', label: 'Detalle flexión 20°–60° (3) y > 60° (4)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-15b'] },
            ]}
          />
          <div className="flex flex-wrap gap-4 text-xs text-slate-700">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={data.trunkTwisted}
                onChange={(e) => onChange({ ...data, trunkTwisted: e.target.checked })}
                className="rounded border-slate-300 text-sky-600"
              />
              Tronco con torsión axial (+1)
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={data.trunkSideBending}
                onChange={(e) => onChange({ ...data, trunkSideBending: e.target.checked })}
                className="rounded border-slate-300 text-sky-600"
              />
              Inclinación lateral del tronco (+1)
            </label>
          </div>
          <ModifierPlateBanner
            caption="Modificadores de torsión e inclinación lateral del tronco (Tabla 4.12)"
            plates={[
              { code: 'Fig. 4.16', label: 'Torsión axial (+1) e inclinación lateral (+1)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-16'] },
            ]}
          />
        </div>

        <div className="pt-3 border-t border-slate-100">
          <VisualAngleSelector
            label="7. Soporte de Piernas y Pies"
            figureRef="Fig. 4.17 · Tabla 4.13"
            selectedValue={data.legsPos}
            onSelect={(val) => onChange({ ...data, legsPos: val })}
            options={RULA_LEGS_OPTIONS}
            columns={2}
            plateRefs={[
              { code: 'Fig. 4.17', label: 'Sentado (+1), apoyo bilateral (+1) y unilateral (+2)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-17'] },
            ]}
          />
        </div>

        <div className="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Uso Muscular Grupo B</label>
            <select
              value={data.muscleUseB}
              onChange={(e) => onChange({ ...data, muscleUseB: Number(e.target.value) as 0 | 1 })}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 bg-white"
            >
              <option value={0}>0 pt — Sin mantenimiento estático ni alta frecuencia</option>
              <option value={1}>+1 pt — Postura estática (&gt; 1 min) o repetida (&gt; 4 veces/min)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Fuerza / Carga Grupo B</label>
            <select
              value={data.forceLoadB}
              onChange={(e) => onChange({ ...data, forceLoadB: Number(e.target.value) as 0 | 1 | 2 | 3 })}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 bg-white"
            >
              <option value={0}>0 pt — Carga &lt; 2 kg intermitente</option>
              <option value={1}>+1 pt — Carga 2 a 10 kg intermitente</option>
              <option value={2}>+2 pt — Carga 2 a 10 kg estática/repetitiva o &gt; 10 kg intermitente</option>
              <option value={3}>+3 pt — Carga &gt; 10 kg estática/repetitiva o impactos bruscos</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 2. FORMULARIO REBA
// ============================================================================
export function RebaForm({ data, onChange }: { data: RebaData; onChange: (next: RebaData) => void }) {
  const [editingSide, setEditingSide] = useState<'right' | 'left'>('right');
  const activeSideKey: 'right' | 'left' =
    data.evaluatedSide === 'derecho' ? 'right' : data.evaluatedSide === 'izquierdo' ? 'left' : editingSide;

  const sideData = data[activeSideKey];

  const updateSide = (patch: Partial<RebaSideInput>) => {
    onChange({
      ...data,
      [activeSideKey]: { ...sideData, ...patch },
    });
  };

  return (
    <div className="space-y-6">
      {/* Control Biomecánico 3D Sincronizado con las Láminas REBA Cap. 4 */}
      <Biomech3DControlPanel
        method="REBA"
        data={data}
        activeSide={activeSideKey}
        onChange={onChange}
      />

      <div className="p-4 rounded-lg border border-slate-200 bg-white flex flex-wrap items-center justify-between gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">Lado del Cuerpo Evaluado</label>
          <div className="inline-flex rounded-md border border-slate-300 bg-slate-50 p-0.5">
            {(['derecho', 'izquierdo', 'ambos'] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => onChange({ ...data, evaluatedSide: side })}
                className={`px-3 py-1.5 text-xs font-medium rounded capitalize whitespace-nowrap cursor-pointer ${
                  data.evaluatedSide === side ? 'bg-slate-900 text-white' : 'text-slate-700'
                }`}
              >
                {side === 'ambos' ? 'Ambos lados (peor caso)' : `Lado ${side}`}
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs text-slate-500 max-w-md">
          REBA valora primero el <strong>Grupo A</strong> (Tronco, Cuello, Piernas + Carga) y luego el <strong>Grupo B</strong> (Brazo, Antebrazo, Muñeca + Agarre), sumando finalmente la Actividad Muscular.
        </div>
      </div>

      {/* GRUPO A: Tronco, Cuello y Piernas */}
      <div className="p-5 rounded-lg border border-slate-200 bg-white space-y-5">
        <div className="border-b border-slate-100 pb-3">
          <h4 className="text-sm font-semibold text-slate-900">Grupo A — Tronco, Cuello y Piernas (Apartado 4.3.3)</h4>
        </div>

        <VisualAngleSelector
          label="1. Posición del Tronco"
          figureRef="Fig. 4.19a · Tabla 4.21"
          selectedValue={data.trunkPos}
          onSelect={(val) => onChange({ ...data, trunkPos: val })}
          options={REBA_TRUNK_OPTIONS}
          columns={4}
        />
        <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={data.trunkTwistedOrSide}
            onChange={(e) => onChange({ ...data, trunkTwistedOrSide: e.target.checked })}
            className="rounded border-slate-300 text-sky-600"
          />
          Existe torsión axial o inclinación lateral del tronco (+1)
        </label>
        <ModifierPlateBanner
          caption="Modificadores REBA de torsión e inclinación lateral de tronco (Tabla 4.22)"
          plates={[
            { code: 'Fig. 4.19b', label: 'Torsión (+1) e inclinación lateral (+1)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-19b'] },
          ]}
        />

        <div className="pt-3 border-t border-slate-100 space-y-2.5">
          <VisualAngleSelector
            label="2. Posición del Cuello"
            figureRef="Fig. 4.20 · Tabla 4.23"
            selectedValue={data.neckPos}
            onSelect={(val) => onChange({ ...data, neckPos: val })}
            options={REBA_NECK_OPTIONS}
            columns={2}
          />
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={data.neckTwistedOrSide}
              onChange={(e) => onChange({ ...data, neckTwistedOrSide: e.target.checked })}
              className="rounded border-slate-300 text-sky-600"
            />
            Torsión o inclinación lateral del cuello (+1)
          </label>
        </div>

        <div className="pt-3 border-t border-slate-100 space-y-4">
          <VisualAngleSelector
            label="3. Soporte Base de Piernas"
            figureRef="Fig. 4.21a · Tabla 4.25"
            selectedValue={data.legsBase}
            onSelect={(val) => onChange({ ...data, legsBase: val })}
            options={REBA_LEGS_BASE_OPTIONS}
            columns={2}
            plateRefs={[
              { code: 'Fig. 4.21a', label: 'Sentado (+1), apoyo bilateral (+1) y unilateral (+2)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-21a'] },
            ]}
          />
          <VisualAngleSelector
            label="Flexión Adicional de Rodillas"
            figureRef="Fig. 4.21b · Tabla 4.26"
            selectedValue={data.legsKneeFlexion}
            onSelect={(val) => onChange({ ...data, legsKneeFlexion: val })}
            options={REBA_KNEE_OPTIONS}
            columns={3}
            plateRefs={[
              { code: 'Fig. 4.21b', label: 'Flexión de rodillas 30°–60° (+1) y > 60° (+2)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-21b'] },
            ]}
          />
        </div>

        <div className="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Carga o Fuerza Ejercida (Tabla 4.28)</label>
            <select
              value={data.loadForce}
              onChange={(e) => onChange({ ...data, loadForce: Number(e.target.value) as 0 | 1 | 2 })}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 bg-white"
            >
              <option value={0}>0 pt — Carga inferior a 5 kg</option>
              <option value={1}>+1 pt — Carga entre 5 kg y 10 kg</option>
              <option value={2}>+2 pt — Carga superior a 10 kg</option>
            </select>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-4">
            <input
              type="checkbox"
              checked={data.shockForce}
              onChange={(e) => onChange({ ...data, shockForce: e.target.checked })}
              className="rounded border-slate-300 text-sky-600"
            />
            Aplicación brusca, rápida o con impacto de fuerza (+1)
          </label>
        </div>
      </div>

      {/* GRUPO B: Miembro Superior y Agarre */}
      <div className="p-5 rounded-lg border border-slate-200 bg-white space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <h4 className="text-sm font-semibold text-slate-900">
            Grupo B — Brazo, Antebrazo, Muñeca y Agarre ({activeSideKey === 'right' ? 'Derecho' : 'Izquierdo'})
          </h4>
          {data.evaluatedSide === 'ambos' && (
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-md border border-slate-300 bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setEditingSide('right')}
                  className={`px-3 py-1 text-xs font-medium rounded cursor-pointer ${
                    editingSide === 'right' ? 'bg-sky-600 text-white' : 'text-slate-700'
                  }`}
                >
                  Derecho
                </button>
                <button
                  type="button"
                  onClick={() => setEditingSide('left')}
                  className={`px-3 py-1 text-xs font-medium rounded cursor-pointer ${
                    editingSide === 'left' ? 'bg-sky-600 text-white' : 'text-slate-700'
                  }`}
                >
                  Izquierdo
                </button>
              </div>
              <button
                type="button"
                onClick={() => onChange({ ...data, left: { ...data.right } })}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar Der → Izq
              </button>
            </div>
          )}
        </div>

        <VisualAngleSelector
          label="4. Posición del Brazo"
          figureRef="Fig. 4.22a · Tabla 4.29"
          selectedValue={sideData.upperArmPos}
          onSelect={(val) => updateSide({ upperArmPos: val })}
          options={REBA_UPPER_ARM_OPTIONS}
          columns={4}
        />
        <div className="space-y-2">
          <div className="flex flex-wrap gap-4 text-xs text-slate-700">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sideData.shoulderRaised}
                onChange={(e) => updateSide({ shoulderRaised: e.target.checked })}
                className="rounded border-slate-300 text-sky-600"
              />
              Hombro elevado (+1)
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sideData.armAbducted}
                onChange={(e) => updateSide({ armAbducted: e.target.checked })}
                className="rounded border-slate-300 text-sky-600"
              />
              Brazo abducido o rotado (+1)
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sideData.armSupported}
                onChange={(e) => updateSide({ armSupported: e.target.checked })}
                className="rounded border-slate-300 text-sky-600"
              />
              Existe punto de apoyo del brazo (−1)
            </label>
          </div>
          <ModifierPlateBanner
            caption="Modificadores REBA de hombro y brazo (Tabla 4.30)"
            plates={[
              { code: 'Fig. 4.22b', label: 'Elevación/abducción (+1), rotación (+1) y apoyo (−1)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-22b'] },
            ]}
          />
        </div>

        <div className="pt-3 border-t border-slate-100">
          <VisualAngleSelector
            label="5. Posición del Antebrazo"
            figureRef="Fig. 4.23 · Tabla 4.31"
            selectedValue={sideData.lowerArmPos}
            onSelect={(val) => updateSide({ lowerArmPos: val })}
            options={REBA_LOWER_ARM_OPTIONS}
            columns={2}
          />
        </div>

        <div className="pt-3 border-t border-slate-100 space-y-2.5">
          <VisualAngleSelector
            label="6. Posición de la Muñeca"
            figureRef="Fig. 4.24 · Tabla 4.32"
            selectedValue={sideData.wristPos}
            onSelect={(val) => updateSide({ wristPos: val })}
            options={REBA_WRIST_OPTIONS}
            columns={2}
          />
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={sideData.wristTwistedOrDeviated}
              onChange={(e) => updateSide({ wristTwistedOrDeviated: e.target.checked })}
              className="rounded border-slate-300 text-sky-600"
            />
            Torsión pronosupinadora o desviación radial/cubital de muñeca (+1)
          </label>
        </div>

        <div className="pt-3 border-t border-slate-100">
          <label className="block text-xs font-medium text-slate-700 mb-1">7. Calidad del Agarre / Acoplamiento Mano-Objeto (Tabla 4.35)</label>
          <select
            value={sideData.coupling}
            onChange={(e) => updateSide({ coupling: Number(e.target.value) as 0 | 1 | 2 | 3 })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 bg-white"
          >
            <option value={0}>0 pt (Bueno) — Asideros adecuados y agarre de potencia firme en rango medio</option>
            <option value={1}>+1 pt (Regular) — Agarre aceptable pero no ideal, o con otra parte del cuerpo</option>
            <option value={2}>+2 pt (Malo) — Agarre posible pero sin asideros cómodos</option>
            <option value={3}>+3 pt (Inaceptable) — Incómodo, inseguro, sin asas o sujeto con presión palmar</option>
          </select>
        </div>
      </div>

      {/* ACTIVIDAD MUSCULAR */}
      <div className="p-5 rounded-lg border border-slate-200 bg-white space-y-3">
        <h4 className="text-sm font-semibold text-slate-900">Actividad Muscular (Tabla 4.37 — Suma sobre Tabla C)</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-700">
          <label className="flex items-start gap-2 p-3 rounded border border-slate-200 cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={data.activityStatic}
              onChange={(e) => onChange({ ...data, activityStatic: e.target.checked })}
              className="mt-0.5 rounded border-slate-300 text-sky-600"
            />
            <span>Una o más partes del cuerpo permanecen estáticas por más de 1 minuto (+1)</span>
          </label>
          <label className="flex items-start gap-2 p-3 rounded border border-slate-200 cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={data.activityRepetitive}
              onChange={(e) => onChange({ ...data, activityRepetitive: e.target.checked })}
              className="mt-0.5 rounded border-slate-300 text-sky-600"
            />
            <span>Movimientos repetitivos de corto alcance (&gt; 4 veces por minuto, excepto caminar) (+1)</span>
          </label>
          <label className="flex items-start gap-2 p-3 rounded border border-slate-200 cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={data.activityUnstableChanges}
              onChange={(e) => onChange({ ...data, activityUnstableChanges: e.target.checked })}
              className="mt-0.5 rounded border-slate-300 text-sky-600"
            />
            <span>Cambios posturales importantes e bruscos o sobre base inestable (+1)</span>
          </label>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 3. FORMULARIO OWAS (CON CONTROL BIOMECÁNICO 3D + LÁMINAS + CARGA CSV)
// ============================================================================
export function OwasForm({ data, onChange }: { data: OwasData; onChange: (next: OwasData) => void }) {
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [draftPhase, setDraftPhase] = useState('Nueva postura observada en el ciclo');
  const [draftBack, setDraftBack] = useState<1 | 2 | 3 | 4>(2);
  const [draftArms, setDraftArms] = useState<1 | 2 | 3>(1);
  const [draftLegs, setDraftLegs] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7>(2);
  const [draftLoad, setDraftLoad] = useState<1 | 2 | 3>(1);
  const [draftFreq, setDraftFreq] = useState<number>(10);
  const [csvNotice, setCsvNotice] = useState<string>('');

  const addObservation = () => {
    const newObs: OwasObservation = {
      id: `ow-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      taskPhase: draftPhase.trim() || `Fase ${data.observations.length + 1}`,
      back: draftBack,
      arms: draftArms,
      legs: draftLegs,
      load: draftLoad,
      frequencyCount: Math.max(1, draftFreq),
    };
    onChange({ observations: [...data.observations, newObs] });
  };

  const updateRow = (id: string, patch: Partial<OwasObservation>) => {
    onChange({
      observations: data.observations.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  };

  const removeRow = (id: string) => {
    if (data.observations.length <= 1) return;
    onChange({ observations: data.observations.filter((r) => r.id !== id) });
  };

  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const parsed: OwasObservation[] = [];
      lines.forEach((line, idx) => {
        if (idx === 0 && /fase|espalda|back/i.test(line)) return;
        const cols = line.split(/[;,]/).map((c) => c.trim());
        if (cols.length >= 5) {
          const back = Math.min(4, Math.max(1, Number(cols[1]) || 1)) as 1 | 2 | 3 | 4;
          const arms = Math.min(3, Math.max(1, Number(cols[2]) || 1)) as 1 | 2 | 3;
          const legs = Math.min(7, Math.max(1, Number(cols[3]) || 1)) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
          const load = Math.min(3, Math.max(1, Number(cols[4]) || 1)) as 1 | 2 | 3;
          const freq = Math.max(1, Number(cols[5]) || 1);
          parsed.push({
            id: `ow-csv-${Date.now()}-${idx}`,
            taskPhase: cols[0] || `Observación ${idx + 1}`,
            back,
            arms,
            legs,
            load,
            frequencyCount: freq,
          });
        }
      });
      if (parsed.length > 0) {
        onChange({ observations: parsed });
        setCsvNotice(`Se cargaron ${parsed.length} filas de observaciones OWAS desde ${file.name}.`);
      } else {
        setCsvNotice('Formato CSV no reconocido. Use columnas: Fase;Espalda(1-4);Brazos(1-3);Piernas(1-7);Carga(1-3);Frecuencia');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const downloadCsvTemplate = () => {
    const header = 'Fase_Tarea;Espalda_1a4;Brazos_1a3;Piernas_1a7;Carga_1a3;Frecuencia_Observaciones\n';
    const rows = data.observations
      .map((o) => `${o.taskPhase.replace(/;/g, ',')};${o.back};${o.arms};${o.legs};${o.load};${o.frequencyCount}`)
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_observaciones_owas.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Control Biomecánico 3D Sincronizado con los Códigos OWAS y Láminas Cap. 4 */}
      <Biomech3DControlPanel
        method="OWAS"
        back={draftBack}
        arms={draftArms}
        legs={draftLegs}
        load={draftLoad}
        onChangeCodes={(patch) => {
          if (patch.back !== undefined) setDraftBack(patch.back);
          if (patch.arms !== undefined) setDraftArms(patch.arms);
          if (patch.legs !== undefined) setDraftLegs(patch.legs);
          if (patch.load !== undefined) setDraftLoad(patch.load);
        }}
      />

      {/* Selector visual interactivo para construir código de 4 dígitos */}
      <div className="p-5 rounded-lg border border-slate-200 bg-white space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">
              Constructor Visual de Código Postural OWAS ({draftBack}
              {draftArms}
              {draftLegs}
              {draftLoad})
            </h4>
            <p className="text-xs text-slate-500">
              Seleccione las posturas sobre las láminas oficiales Cap. 4 para configurar el código de 4 dígitos y agregarlo a la serie muestreada
            </p>
          </div>
          <span className="font-mono text-sm font-semibold tabular-nums px-2.5 py-1 rounded bg-slate-100 text-slate-900">
            Código actual: {draftBack}-{draftArms}-{draftLegs}-{draftLoad}
          </span>
        </div>

        <VisualAngleSelector
          label="1° Dígito — Postura de Espalda (1 a 4)"
          figureRef="Fig. 4.27a y Fig. 4.27b · Tabla 4.38"
          selectedValue={draftBack}
          onSelect={setDraftBack}
          options={OWAS_BACK_OPTIONS}
          columns={4}
          plateRefs={[
            { code: 'Fig. 4.27a', label: 'Código 1 — Espalda recta', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-27a'] },
            { code: 'Fig. 4.27b', label: 'Códigos 2, 3 y 4 — Flexión y/o torsión', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-27b'] },
          ]}
        />

        <VisualAngleSelector
          label="2° Dígito — Postura de Brazos (1 a 3)"
          figureRef="Fig. 4.28a y Fig. 4.28b · Tabla 4.39"
          selectedValue={draftArms}
          onSelect={setDraftArms}
          options={OWAS_ARMS_OPTIONS}
          columns={3}
          plateRefs={[
            { code: 'Fig. 4.28a', label: 'Código 1 — Ambos brazos bajo hombros', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-28a'] },
            { code: 'Fig. 4.28b', label: 'Códigos 2 y 3 — Uno o ambos brazos elevados', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-28b'] },
          ]}
        />

        <VisualAngleSelector
          label="3° Dígito — Postura de Piernas (1 a 7)"
          figureRef="Fig. 4.29a a Fig. 4.29d · Tabla 4.40"
          selectedValue={draftLegs}
          onSelect={setDraftLegs}
          options={OWAS_LEGS_OPTIONS}
          columns={7}
          plateRefs={[
            { code: 'Fig. 4.29a', label: 'Cód. 1 Sentado', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-29a'] },
            { code: 'Fig. 4.29b', label: 'Cód. 2 De pie 2 piernas rectas', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-29b'] },
            { code: 'Fig. 4.29c', label: 'Cód. 3 De pie 1 pierna recta', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-29c'] },
            { code: 'Fig. 4.29d', label: 'Cód. 4 a 7 Flexión, arrodillado y caminando', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-29d'] },
          ]}
        />

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-3 border-t border-slate-100 items-end">
          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-slate-700 mb-1">Fase / Subtarea Observada</label>
            <input
              type="text"
              value={draftPhase}
              onChange={(e) => setDraftPhase(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900"
            />
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-slate-700 mb-1">4° Dígito — Carga / Fuerza (Tabla 4.41)</label>
            <select
              value={draftLoad}
              onChange={(e) => setDraftLoad(Number(e.target.value) as 1 | 2 | 3)}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 bg-white"
            >
              <option value={1}>Código 1 — Carga ≤ 10 kg</option>
              <option value={2}>Código 2 — Carga &gt; 10 kg a ≤ 20 kg</option>
              <option value={3}>Código 3 — Carga superior a 20 kg</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">N° Observaciones</label>
            <input
              type="number"
              min={1}
              value={draftFreq}
              onChange={(e) => setDraftFreq(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs font-mono tabular-nums text-slate-900"
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="button"
              onClick={addObservation}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Añadir fila
            </button>
          </div>
        </div>
      </div>

      {/* Carga masiva CSV y Tabla de Observaciones */}
      <div className="p-5 rounded-lg border border-slate-200 bg-white space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Planilla de Muestreo Postural y Carga de Datos (CSV)</h4>
            <p className="text-xs text-slate-500">
              Puede editar directamente cada registro muestreado, enviarlo al visor 3D o cargar una serie de datos en formato CSV
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input ref={csvInputRef} type="file" accept=".csv,.txt" onChange={handleImportCsv} className="hidden" />
            <button
              type="button"
              onClick={() => csvInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 whitespace-nowrap cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-sky-700" />
              Importar CSV
            </button>
            <button
              type="button"
              onClick={downloadCsvTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar / Plantilla CSV
            </button>
          </div>
        </div>

        {csvNotice && (
          <div className="px-3 py-2 rounded border border-sky-200 bg-sky-50 text-xs text-sky-900">{csvNotice}</div>
        )}

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="py-2.5 px-3 font-semibold">Fase / Tarea Observada</th>
                <th className="py-2.5 px-2 font-semibold">Espalda (1-4)</th>
                <th className="py-2.5 px-2 font-semibold">Brazos (1-3)</th>
                <th className="py-2.5 px-2 font-semibold">Piernas (1-7)</th>
                <th className="py-2.5 px-2 font-semibold">Carga (1-3)</th>
                <th className="py-2.5 px-2 font-semibold">Código</th>
                <th className="py-2.5 px-2 font-semibold">Frec. (N)</th>
                <th className="py-2.5 px-2 text-right font-semibold">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.observations.map((obs) => (
                <tr key={obs.id} className="hover:bg-slate-50/70">
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      value={obs.taskPhase}
                      onChange={(e) => updateRow(obs.id, { taskPhase: e.target.value })}
                      className="w-full min-w-44 rounded border border-slate-200 px-2 py-1 text-xs text-slate-900"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <select
                      value={obs.back}
                      onChange={(e) => updateRow(obs.id, { back: Number(e.target.value) as 1 | 2 | 3 | 4 })}
                      className="rounded border border-slate-200 px-1.5 py-1 font-mono tabular-nums"
                    >
                      {[1, 2, 3, 4].map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 px-2">
                    <select
                      value={obs.arms}
                      onChange={(e) => updateRow(obs.id, { arms: Number(e.target.value) as 1 | 2 | 3 })}
                      className="rounded border border-slate-200 px-1.5 py-1 font-mono tabular-nums"
                    >
                      {[1, 2, 3].map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 px-2">
                    <select
                      value={obs.legs}
                      onChange={(e) => updateRow(obs.id, { legs: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6 | 7 })}
                      className="rounded border border-slate-200 px-1.5 py-1 font-mono tabular-nums"
                    >
                      {[1, 2, 3, 4, 5, 6, 7].map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 px-2">
                    <select
                      value={obs.load}
                      onChange={(e) => updateRow(obs.id, { load: Number(e.target.value) as 1 | 2 | 3 })}
                      className="rounded border border-slate-200 px-1.5 py-1 font-mono tabular-nums"
                    >
                      {[1, 2, 3].map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 px-2 font-mono font-semibold tabular-nums text-slate-900">
                    {obs.back}
                    {obs.arms}
                    {obs.legs}
                    {obs.load}
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      min={1}
                      value={obs.frequencyCount}
                      onChange={(e) => updateRow(obs.id, { frequencyCount: Math.max(1, Number(e.target.value) || 1) })}
                      className="w-16 rounded border border-slate-200 px-2 py-1 font-mono tabular-nums"
                    />
                  </td>
                  <td className="py-2 px-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setDraftPhase(obs.taskPhase);
                          setDraftBack(obs.back);
                          setDraftArms(obs.arms);
                          setDraftLegs(obs.legs);
                          setDraftLoad(obs.load);
                        }}
                        className="inline-flex items-center gap-1 px-1.5 py-1 rounded border border-slate-200 bg-white hover:bg-sky-50 hover:border-sky-300 text-[11px] font-medium text-sky-800 whitespace-nowrap cursor-pointer"
                        title="Cargar esta postura en el Control Biomecánico 3D"
                      >
                        <Box className="w-3 h-3" />
                        3D
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(obs.id)}
                        disabled={data.observations.length <= 1}
                        className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
// 4. FORMULARIO CUESTIONARIO BIPOLAR (IRAM 3753 — 15 DIMENSIONES 0..10)
// ============================================================================
export function BipolarForm({ data, onChange }: { data: BipolarData; onChange: (next: BipolarData) => void }) {
  const setScore = (idx: number, val: number) => {
    const next = [...data.scores];
    while (next.length < 15) next.push(0);
    next[idx] = val;
    onChange({ scores: next });
  };

  return (
    <div className="p-5 rounded-lg border border-slate-200 bg-white space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            Cuestionario Bipolar de Fatiga y Disconformidad Subjetiva (15 Dimensiones)
          </h4>
          <p className="text-xs text-slate-500">
            Gradúe de 0 (conformidad plena) a 10 (máxima molestia/fatiga). Valores 0–2: Bajo · 3–6: Moderado · 7–10: Elevado.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange({ scores: Array(15).fill(0) })}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reiniciar a 0
        </button>
      </div>

      <div className="divide-y divide-slate-100">
        {BIPOLAR_ITEMS.map((item, idx) => {
          const current = data.scores[idx] ?? 0;
          return (
            <div key={item.id} className="py-3 grid grid-cols-1 lg:grid-cols-12 gap-2 items-center">
              <div className="lg:col-span-3 text-xs text-slate-700">
                <span className="font-mono font-semibold text-slate-500 mr-1.5">{item.id}.</span>
                {item.leftPole}
              </div>
              <div className="lg:col-span-6 flex items-center justify-between gap-1">
                {Array.from({ length: 11 }, (_, v) => {
                  const selected = current === v;
                  const activeTone =
                    v >= 7
                      ? 'bg-red-600 text-white border-red-600'
                      : v >= 3
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-emerald-600 text-white border-emerald-600';
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setScore(idx, v)}
                      className={`flex-1 py-1.5 rounded border font-mono text-xs tabular-nums transition-colors cursor-pointer ${
                        selected
                          ? activeTone
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
              <div className="lg:col-span-3 text-xs font-medium text-slate-800 lg:text-right">{item.rightPole}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

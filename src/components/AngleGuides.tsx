import React from 'react';

export interface AngleOption<T extends number> {
  value: T;
  angleText: string;
  title: string;
  subtitle?: string;
  renderSvg: (active: boolean) => React.ReactNode;
}

interface VisualAngleSelectorProps<T extends number> {
  label: string;
  figureRef?: string;
  selectedValue: T;
  onSelect: (val: T) => void;
  options: AngleOption<T>[];
  columns?: 2 | 3 | 4 | 5 | 7;
}

export function VisualAngleSelector<T extends number>({
  label,
  figureRef,
  selectedValue,
  onSelect,
  options,
  columns = 4,
}: VisualAngleSelectorProps<T>) {
  const gridClass =
    columns === 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : columns === 3
        ? 'grid-cols-1 sm:grid-cols-3'
        : columns === 5
          ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
          : columns === 7
            ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-7'
            : 'grid-cols-2 lg:grid-cols-4';

  return (
    <div className="p-3.5 rounded-lg bg-[#edf3f9] border border-slate-300/80 space-y-2.5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-semibold text-slate-900">{label}</span>
        {figureRef && <span className="text-xs text-slate-600">{figureRef}</span>}
      </div>
      <div className={`grid ${gridClass} gap-2.5`}>
        {options.map((opt) => {
          const isSelected = selectedValue === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              className={`group flex flex-col items-center text-left p-3 rounded-md border transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-600 ${
                isSelected
                  ? 'border-sky-600 bg-sky-50 ring-2 ring-sky-600/25 text-slate-950'
                  : 'border-slate-300/90 bg-white hover:border-sky-500 hover:bg-sky-50/40 text-slate-700'
              }`}
            >
              <div
                className={`w-full h-24 flex items-center justify-center rounded border mb-2 overflow-hidden ${
                  isSelected ? 'bg-white border-sky-200' : 'bg-slate-50 border-slate-200/70'
                }`}
              >
                {opt.renderSvg(isSelected)}
              </div>
              <div className="w-full flex items-baseline justify-between gap-1">
                <span className="font-mono text-xs font-semibold tabular-nums text-sky-800">{opt.angleText}</span>
                <span className="font-mono text-xs font-semibold tabular-nums text-slate-900">
                  {isSelected ? `✓ +${opt.value} pt` : `+${opt.value} pt`}
                </span>
              </div>
              <p className="w-full text-xs font-medium text-slate-800 mt-0.5 leading-snug">{opt.title}</p>
              {opt.subtitle && <p className="w-full text-[11px] text-slate-500 mt-0.5 leading-tight">{opt.subtitle}</p>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// ESQUEMAS VECTORIALES ANATÓMICOS DE ÁNGULOS (RULA / REBA / OWAS / JSI)
// ============================================================================

function ArmSvg({ deg, extDeg, active }: { deg: number; extDeg?: boolean; active: boolean }) {
  // Shoulder at (45, 28), trunk vertical down to (45, 82)
  const rad = ((extDeg ? -deg : deg) * Math.PI) / 180;
  const len = 42;
  const ex = 45 + Math.sin(rad) * len;
  const ey = 28 + Math.cos(rad) * len;
  const strokeMain = active ? '#0284c7' : '#334155';

  return (
    <svg viewBox="0 0 110 92" className="w-28 h-22">
      {/* Eje del tronco */}
      <line x1="45" y1="10" x2="45" y2="85" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3 3" />
      {/* Cabeza y Torso */}
      <circle cx="45" cy="15" r="7" fill="#e2e8f0" stroke="#64748b" strokeWidth="1.5" />
      <line x1="45" y1="22" x2="45" y2="76" stroke="#64748b" strokeWidth="6" strokeLinecap="round" />
      {/* Arco angular */}
      <path
        d={`M 45 50 Q ${45 + (ex - 45) * 0.45} ${50 - Math.abs(deg) * 0.08} ${45 + Math.sin(rad) * 22} ${28 + Math.cos(rad) * 22}`}
        fill="none"
        stroke="#0284c7"
        strokeWidth="1.8"
      />
      {/* Brazo */}
      <line x1="45" y1="28" x2={ex} y2={ey} stroke={strokeMain} strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="45" cy="28" r="3" fill="#0284c7" />
      <circle cx={ex} cy={ey} r="2.8" fill={strokeMain} />
    </svg>
  );
}

export const UPPER_ARM_OPTIONS: AngleOption<1 | 2 | 3 | 4>[] = [
  {
    value: 1,
    angleText: '-20° a 20°',
    title: 'Posición neutra',
    subtitle: '20° extensión a 20° flexión',
    renderSvg: (a) => <ArmSvg deg={10} active={a} />,
  },
  {
    value: 2,
    angleText: '20°–45° / <-20°',
    title: 'Flexión moderada o ext.',
    subtitle: 'Ext. > 20° o flexión 20°–45°',
    renderSvg: (a) => <ArmSvg deg={35} active={a} />,
  },
  {
    value: 3,
    angleText: '45° a 90°',
    title: 'Flexión elevada',
    subtitle: 'Entre 45° y 90° respecto al tronco',
    renderSvg: (a) => <ArmSvg deg={70} active={a} />,
  },
  {
    value: 4,
    angleText: '> 90°',
    title: 'Sobre nivel del hombro',
    subtitle: 'Flexión superior a 90°',
    renderSvg: (a) => <ArmSvg deg={112} active={a} />,
  },
];

function ForearmSvg({ deg, active }: { deg: number; active: boolean }) {
  // Shoulder (38, 22), Elbow (38, 54), Forearm from elbow at angle deg from vertical downward
  const rad = (deg * Math.PI) / 180;
  const fx = 38 + Math.sin(rad) * 36;
  const fy = 54 + Math.cos(rad) * 36;
  const strokeMain = active ? '#0284c7' : '#334155';

  return (
    <svg viewBox="0 0 110 92" className="w-28 h-22">
      <circle cx="38" cy="13" r="6.5" fill="#e2e8f0" stroke="#64748b" strokeWidth="1.5" />
      <line x1="38" y1="20" x2="38" y2="78" stroke="#cbd5e1" strokeWidth="5.5" strokeLinecap="round" />
      {/* Brazo vertical */}
      <line x1="38" y1="24" x2="38" y2="54" stroke="#475569" strokeWidth="4" strokeLinecap="round" />
      {/* Línea referencia 60-100 */}
      <line x1="38" y1="54" x2="72" y2="54" stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="2 2" />
      {/* Antebrazo */}
      <line x1="38" y1="54" x2={fx} y2={fy} stroke={strokeMain} strokeWidth="4" strokeLinecap="round" />
      <circle cx="38" cy="54" r="3" fill="#0284c7" />
    </svg>
  );
}

export const LOWER_ARM_OPTIONS: AngleOption<1 | 2>[] = [
  {
    value: 1,
    angleText: '60° a 100°',
    title: 'Flexión óptima de codo',
    subtitle: 'Rango funcional cercano a 90°',
    renderSvg: (a) => <ForearmSvg deg={82} active={a} />,
  },
  {
    value: 2,
    angleText: '< 60° ó > 100°',
    title: 'Fuera de rango neutro',
    subtitle: 'Codo muy extendido o muy cerrado',
    renderSvg: (a) => <ForearmSvg deg={125} active={a} />,
  },
];

function WristSvg({ deg, active }: { deg: number; active: boolean }) {
  const rad = (deg * Math.PI) / 180;
  const hx = 56 + Math.cos(rad) * 32;
  const hy = 46 - Math.sin(rad) * 32;
  const strokeMain = active ? '#0284c7' : '#334155';

  return (
    <svg viewBox="0 0 110 92" className="w-28 h-22">
      <line x1="16" y1="46" x2="96" y2="46" stroke="#94a3b8" strokeWidth="1.3" strokeDasharray="3 3" />
      <line x1="18" y1="46" x2="56" y2="46" stroke="#64748b" strokeWidth="5" strokeLinecap="round" />
      <line x1="56" y1="46" x2={hx} y2={hy} stroke={strokeMain} strokeWidth="4" strokeLinecap="round" />
      {deg !== 0 && (
        <line
          x1="56"
          y1="46"
          x2={56 + Math.cos(-rad) * 28}
          y2={46 - Math.sin(-rad) * 28}
          stroke="#cbd5e1"
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}
      <circle cx="56" cy="46" r="3.2" fill="#0284c7" />
    </svg>
  );
}

export const RULA_WRIST_OPTIONS: AngleOption<1 | 2 | 3>[] = [
  {
    value: 1,
    angleText: '0° Neutra',
    title: 'Alineada con antebrazo',
    subtitle: 'Sin flexión ni extensión',
    renderSvg: (a) => <WristSvg deg={0} active={a} />,
  },
  {
    value: 2,
    angleText: '0° a 15°',
    title: 'Flexión / extensión leve',
    subtitle: 'Entre 0° y 15° hacia arriba o abajo',
    renderSvg: (a) => <WristSvg deg={13} active={a} />,
  },
  {
    value: 3,
    angleText: '> 15°',
    title: 'Flexión / extensión marcada',
    subtitle: 'Supera los 15° respecto al eje',
    renderSvg: (a) => <WristSvg deg={32} active={a} />,
  },
];

export const REBA_WRIST_OPTIONS: AngleOption<1 | 2>[] = [
  {
    value: 1,
    angleText: '0° a 15°',
    title: 'Rango neutro a leve',
    subtitle: 'Flexión o extensión hasta 15°',
    renderSvg: (a) => <WristSvg deg={10} active={a} />,
  },
  {
    value: 2,
    angleText: '> 15°',
    title: 'Flexión / extensión > 15°',
    subtitle: 'Desviación angular pronunciada',
    renderSvg: (a) => <WristSvg deg={32} active={a} />,
  },
];

function NeckSvg({ deg, active }: { deg: number; active: boolean }) {
  // Neck pivot at (50, 42); deg > 0 forward flexion (right), deg < 0 extension (left)
  const rad = (deg * Math.PI) / 180;
  const hx = 50 + Math.sin(rad) * 22;
  const hy = 42 - Math.cos(rad) * 22;
  const strokeMain = active ? '#0284c7' : '#334155';

  return (
    <svg viewBox="0 0 110 92" className="w-28 h-22">
      <line x1="50" y1="10" x2="50" y2="82" stroke="#94a3b8" strokeWidth="1.3" strokeDasharray="3 3" />
      <line x1="50" y1="42" x2="50" y2="82" stroke="#64748b" strokeWidth="6" strokeLinecap="round" />
      <line x1="50" y1="42" x2={hx} y2={hy} stroke={strokeMain} strokeWidth="4" strokeLinecap="round" />
      <circle cx={hx} cy={hy} r="8" fill={active ? '#bae6fd' : '#e2e8f0'} stroke={strokeMain} strokeWidth="2" />
      <circle cx="50" cy="42" r="3" fill="#0284c7" />
    </svg>
  );
}

export const RULA_NECK_OPTIONS: AngleOption<1 | 2 | 3 | 4>[] = [
  { value: 1, angleText: '0° a 10°', title: 'Flexión mínima', subtitle: '0°–10°', renderSvg: (a) => <NeckSvg deg={6} active={a} /> },
  { value: 2, angleText: '10° a 20°', title: 'Flexión moderada', subtitle: '10°–20°', renderSvg: (a) => <NeckSvg deg={18} active={a} /> },
  { value: 3, angleText: '> 20°', title: 'Flexión pronunciada', subtitle: 'Mayor a 20°', renderSvg: (a) => <NeckSvg deg={36} active={a} /> },
  { value: 4, angleText: 'Extensión', title: 'Cuello extendido', subtitle: 'Hacia atrás (< 0°)', renderSvg: (a) => <NeckSvg deg={-24} active={a} /> },
];

export const REBA_NECK_OPTIONS: AngleOption<1 | 2>[] = [
  { value: 1, angleText: '0° a 20°', title: 'Flexión neutra/leve', subtitle: 'Entre 0° y 20°', renderSvg: (a) => <NeckSvg deg={12} active={a} /> },
  { value: 2, angleText: '> 20° ó Ext.', title: 'Flexión > 20° o extensión', subtitle: 'Flexión alta o hacia atrás', renderSvg: (a) => <NeckSvg deg={35} active={a} /> },
];

function TrunkSvg({ deg, seated, active }: { deg: number; seated?: boolean; active: boolean }) {
  // Hip at (42, 68)
  const rad = (deg * Math.PI) / 180;
  const sx = 42 + Math.sin(rad) * 38;
  const sy = 68 - Math.cos(rad) * 38;
  const strokeMain = active ? '#0284c7' : '#334155';

  return (
    <svg viewBox="0 0 110 92" className="w-28 h-22">
      <line x1="42" y1="12" x2="42" y2="85" stroke="#94a3b8" strokeWidth="1.3" strokeDasharray="3 3" />
      {seated ? (
        <>
          <path d="M 32 45 L 32 70 L 58 70" fill="none" stroke="#94a3b8" strokeWidth="2.5" />
          <line x1="42" y1="68" x2="64" y2="68" stroke="#64748b" strokeWidth="4" strokeLinecap="round" />
          <line x1="64" y1="68" x2="64" y2="86" stroke="#64748b" strokeWidth="4" strokeLinecap="round" />
        </>
      ) : (
        <line x1="42" y1="68" x2="42" y2="88" stroke="#64748b" strokeWidth="4.5" strokeLinecap="round" />
      )}
      <line x1="42" y1="68" x2={sx} y2={sy} stroke={strokeMain} strokeWidth="5" strokeLinecap="round" />
      <circle cx={sx + Math.sin(rad) * 8} cy={sy - Math.cos(rad) * 8} r="6.5" fill={active ? '#bae6fd' : '#e2e8f0'} stroke={strokeMain} strokeWidth="1.8" />
      <circle cx="42" cy="68" r="3" fill="#0284c7" />
    </svg>
  );
}

export const RULA_TRUNK_OPTIONS: AngleOption<1 | 2 | 3 | 4>[] = [
  { value: 1, angleText: 'Sentado >90°', title: 'Sentado bien apoyado', subtitle: 'Tronco-caderas > 90°', renderSvg: (a) => <TrunkSvg deg={0} seated active={a} /> },
  { value: 2, angleText: '0° a 20°', title: 'Flexión leve (de pie)', subtitle: 'Entre 0° y 20°', renderSvg: (a) => <TrunkSvg deg={14} active={a} /> },
  { value: 3, angleText: '20° a 60°', title: 'Flexión moderada', subtitle: 'Entre 20° y 60°', renderSvg: (a) => <TrunkSvg deg={40} active={a} /> },
  { value: 4, angleText: '> 60°', title: 'Flexión severa', subtitle: 'Superior a 60°', renderSvg: (a) => <TrunkSvg deg={72} active={a} /> },
];

export const REBA_TRUNK_OPTIONS: AngleOption<1 | 2 | 3 | 4>[] = [
  { value: 1, angleText: '0° Erguido', title: 'Tronco vertical', subtitle: 'Sin flexión ni extensión', renderSvg: (a) => <TrunkSvg deg={0} active={a} /> },
  { value: 2, angleText: '0° a 20°', title: 'Flexión / ext. leve', subtitle: '0°–20° flex. o ext.', renderSvg: (a) => <TrunkSvg deg={15} active={a} /> },
  { value: 3, angleText: '20°–60° / >20° ext', title: 'Flexión media', subtitle: '20°–60° flex. o >20° ext.', renderSvg: (a) => <TrunkSvg deg={42} active={a} /> },
  { value: 4, angleText: '> 60°', title: 'Flexión pronunciada', subtitle: 'Flexión mayor a 60°', renderSvg: (a) => <TrunkSvg deg={72} active={a} /> },
];

// OWAS Visual Cards
export const OWAS_BACK_OPTIONS: AngleOption<1 | 2 | 3 | 4>[] = [
  { value: 1, angleText: 'Código 1', title: 'Espalda recta', subtitle: 'Sin flexión (<20°) ni giro', renderSvg: (a) => <TrunkSvg deg={0} active={a} /> },
  { value: 2, angleText: 'Código 2', title: 'Espalda flexionada', subtitle: 'Inclinada ≥ 20° sin torsión', renderSvg: (a) => <TrunkSvg deg={40} active={a} /> },
  {
    value: 3,
    angleText: 'Código 3',
    title: 'Con torsión / ladeada',
    subtitle: 'Giro axial o inclinación lateral',
    renderSvg: (a) => (
      <svg viewBox="0 0 110 92" className="w-28 h-22">
        <circle cx="55" cy="18" r="7" fill="#e2e8f0" stroke={a ? '#0284c7' : '#334155'} strokeWidth="1.8" />
        <line x1="55" y1="26" x2="55" y2="68" stroke={a ? '#0284c7' : '#334155'} strokeWidth="5" strokeLinecap="round" />
        <path d="M 38 44 C 48 36, 62 36, 72 44" fill="none" stroke="#0284c7" strokeWidth="2" />
        <polygon points="72,44 67,40 68,47" fill="#0284c7" />
        <line x1="48" y1="68" x2="46" y2="86" stroke="#64748b" strokeWidth="3.5" />
        <line x1="62" y1="68" x2="64" y2="86" stroke="#64748b" strokeWidth="3.5" />
      </svg>
    ),
  },
  {
    value: 4,
    angleText: 'Código 4',
    title: 'Flexionada + torsión',
    subtitle: 'Doble carga compresión/cizalla',
    renderSvg: (a) => (
      <svg viewBox="0 0 110 92" className="w-28 h-22">
        <line x1="42" y1="68" x2="72" y2="38" stroke={a ? '#dc2626' : '#334155'} strokeWidth="5" strokeLinecap="round" />
        <circle cx="78" cy="32" r="6.5" fill="#fee2e2" stroke="#dc2626" strokeWidth="1.8" />
        <path d="M 46 46 C 56 38, 66 44, 70 54" fill="none" stroke="#0284c7" strokeWidth="2" />
        <line x1="42" y1="68" x2="42" y2="86" stroke="#64748b" strokeWidth="4" />
      </svg>
    ),
  },
];

export const OWAS_ARMS_OPTIONS: AngleOption<1 | 2 | 3>[] = [
  {
    value: 1,
    angleText: 'Código 1',
    title: 'Ambos bajo hombros',
    subtitle: '2 brazos < nivel hombro',
    renderSvg: (a) => (
      <svg viewBox="0 0 110 92" className="w-28 h-22">
        <circle cx="55" cy="18" r="6.5" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5" />
        <line x1="55" y1="25" x2="55" y2="68" stroke="#475569" strokeWidth="5" />
        <line x1="42" y1="30" x2="68" y2="30" stroke="#94a3b8" strokeDasharray="2 2" strokeWidth="1.2" />
        <line x1="48" y1="30" x2="40" y2="56" stroke={a ? '#0284c7' : '#334155'} strokeWidth="3.5" strokeLinecap="round" />
        <line x1="62" y1="30" x2="70" y2="56" stroke={a ? '#0284c7' : '#334155'} strokeWidth="3.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: 2,
    angleText: 'Código 2',
    title: 'Un brazo elevado',
    subtitle: '1 brazo ≥ nivel hombro',
    renderSvg: (a) => (
      <svg viewBox="0 0 110 92" className="w-28 h-22">
        <circle cx="55" cy="22" r="6.5" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5" />
        <line x1="55" y1="29" x2="55" y2="72" stroke="#475569" strokeWidth="5" />
        <line x1="48" y1="34" x2="40" y2="58" stroke="#64748b" strokeWidth="3.5" strokeLinecap="round" />
        <line x1="62" y1="34" x2="76" y2="14" stroke={a ? '#0284c7' : '#334155'} strokeWidth="3.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: 3,
    angleText: 'Código 3',
    title: 'Ambos elevados',
    subtitle: '2 brazos ≥ nivel hombro',
    renderSvg: (a) => (
      <svg viewBox="0 0 110 92" className="w-28 h-22">
        <circle cx="55" cy="24" r="6.5" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5" />
        <line x1="55" y1="31" x2="55" y2="74" stroke="#475569" strokeWidth="5" />
        <line x1="48" y1="36" x2="34" y2="14" stroke={a ? '#0284c7' : '#334155'} strokeWidth="3.8" strokeLinecap="round" />
        <line x1="62" y1="36" x2="76" y2="14" stroke={a ? '#0284c7' : '#334155'} strokeWidth="3.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

// ============================================================================
// ESQUEMA INTERACTIVO GEOMETRÍA NIOSH / LMC (H, V, D y Asimetría A)
// ============================================================================
export function NioshGeometryGuide({
  hCm,
  vOriginCm,
  vDestCm,
  asymmetryDeg,
  onSelectAsymmetry,
}: {
  hCm: number;
  vOriginCm: number;
  vDestCm: number;
  asymmetryDeg: number;
  onSelectAsymmetry?: (deg: number) => void;
}) {
  const radA = ((asymmetryDeg - 90) * Math.PI) / 180;
  const ax = 75 + Math.cos(radA) * 42;
  const ay = 62 + Math.sin(radA) * 42;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 rounded-lg border border-slate-200 bg-white">
      {/* Vista Sagital H, V, D */}
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 190 130" className="w-44 h-32 shrink-0 bg-slate-50 rounded border border-slate-100">
          {/* Suelo */}
          <line x1="12" y1="115" x2="178" y2="115" stroke="#475569" strokeWidth="2" />
          {/* Trabajador estilizado */}
          <circle cx="48" cy="30" r="8" fill="#e2e8f0" stroke="#334155" strokeWidth="1.8" />
          <line x1="48" y1="38" x2="44" y2="76" stroke="#334155" strokeWidth="5" strokeLinecap="round" />
          <line x1="44" y1="76" x2="44" y2="115" stroke="#334155" strokeWidth="4.5" strokeLinecap="round" />
          <line x1="48" y1="45" x2="96" y2="68" stroke="#0284c7" strokeWidth="3.5" strokeLinecap="round" />
          {/* Caja / Carga */}
          <rect x="92" y="60" width="24" height="20" rx="2" fill="#bae6fd" stroke="#0284c7" strokeWidth="1.8" />
          {/* Cota H */}
          <line x1="44" y1="106" x2="104" y2="106" stroke="#0284c7" strokeWidth="1.8" />
          <text x="74" y="102" textAnchor="middle" className="text-[9px] font-mono fill-sky-800 font-semibold">
            H={hCm}cm
          </text>
          {/* Cota V */}
          <line x1="132" y1="115" x2="132" y2="70" stroke="#0f172a" strokeWidth="1.5" strokeDasharray="3 2" />
          <text x="158" y="94" textAnchor="middle" className="text-[9px] font-mono fill-slate-700 font-semibold">
            V={vOriginCm}→{vDestCm}
          </text>
        </svg>
        <div className="space-y-1.5 text-xs text-slate-600">
          <p className="font-semibold text-slate-900">Referencias Geométricas de Medición</p>
          <p>
            <strong className="text-slate-800">H (Horizontal):</strong> Desde el punto medio entre los tobillos hasta la proyección del centro de la carga (mín. 25 cm, máx. 63 cm).
          </p>
          <p>
            <strong className="text-slate-800">V (Altura):</strong> Altura de las manos respecto al suelo (óptimo = 75 cm). Desplazamiento <span className="font-mono">D = |Vd − Vo| = {Math.abs(vDestCm - vOriginCm)} cm</span>.
          </p>
        </div>
      </div>

      {/* Vista Superior Plano Sagital / Ángulo de Asimetría A */}
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 150 120" className="w-38 h-32 shrink-0 bg-slate-50 rounded border border-slate-100">
          {/* Arco transportador 0 a 135 */}
          <path d="M 75 20 A 42 42 0 0 1 117 62" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="2 2" />
          {/* Plano sagital neutro 0° */}
          <line x1="75" y1="62" x2="75" y2="16" stroke="#16a34a" strokeWidth="1.8" strokeDasharray="3 2" />
          <text x="75" y="12" textAnchor="middle" className="text-[8px] font-mono fill-emerald-700 font-semibold">
            0° Sagital
          </text>
          {/* Hombros vista superior */}
          <ellipse cx="75" cy="62" rx="18" ry="8" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5" />
          <circle cx="75" cy="62" r="5" fill="#475569" />
          {/* Vector asimetría actual */}
          <line x1="75" y1="62" x2={ax} y2={ay} stroke="#0284c7" strokeWidth="2.8" strokeLinecap="round" />
          <circle cx={ax} cy={ay} r="4" fill="#0284c7" />
          <text x="75" y="106" textAnchor="middle" className="text-[10px] font-mono fill-slate-900 font-semibold">
            A = {asymmetryDeg}°
          </text>
        </svg>
        <div className="space-y-2 text-xs">
          <p className="font-semibold text-slate-900">Ángulo de Asimetría (A)</p>
          <p className="text-slate-600">Torsión del tronco respecto al plano neutro sagital (máx. 135°).</p>
          {onSelectAsymmetry && (
            <div className="flex flex-wrap gap-1.5">
              {[0, 15, 30, 45, 60, 90, 120].map((deg) => (
                <button
                  key={deg}
                  type="button"
                  onClick={() => onSelectAsymmetry(deg)}
                  className={`px-2 py-1 rounded font-mono text-[11px] tabular-nums border cursor-pointer transition-colors ${
                    asymmetryDeg === deg
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {deg}°
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// GRÁFICO VECTORIAL NAM (ACGIH / RESOLUCIÓN 295/03 — Hoja 28 y 32 Informe)
// ============================================================================
export function NamThresholdChart({
  rightNam,
  rightBorg,
  leftNam,
  leftBorg,
}: {
  rightNam: number;
  rightBorg: number;
  leftNam: number;
  leftBorg: number;
}) {
  // Chart space: X (NAM 0..10) -> x 45..345 (width 300); Y (Borg 0..10) -> y 190..20 (height 170)
  const mapX = (nam: number) => 45 + (Math.max(0, Math.min(10, nam)) / 10) * 300;
  const mapY = (borg: number) => 190 - (Math.max(0, Math.min(10, borg)) / 10) * 170;

  // TLV line: (0.5, 7.41) to (10, 0)
  // AL line: (0.5, 5.28) to (10, 0)
  const x05 = mapX(0.5);
  const x10 = mapX(10);
  const yTlv05 = mapY(7.41);
  const yAl05 = mapY(5.28);
  const y0 = mapY(0);

  return (
    <div className="p-4 rounded-lg border border-slate-200 bg-white">
      <div className="flex items-baseline justify-between mb-2">
        <h4 className="text-sm font-semibold text-slate-900">Valores Límite Umbral para la Actividad Manual (NAM)</h4>
        <span className="text-xs text-slate-500">Resolución MTESS 295/03 · Figura 1</span>
      </div>
      <svg viewBox="0 0 375 225" className="w-full max-w-xl mx-auto h-auto">
        {/* Zona Peligro TME */}
        <polygon
          points={`${x05},${mapY(8.5)} ${x10},${mapY(8.5)} ${x10},${y0} ${x05},${yTlv05}`}
          fill="#fee2e2"
          opacity="0.7"
        />
        {/* Zona de Control */}
        <polygon points={`${x05},${yTlv05} ${x10},${y0} ${x05},${yAl05}`} fill="#fef3c7" opacity="0.85" />
        {/* Zona de Seguridad */}
        <polygon points={`${x05},${yAl05} ${x10},${y0} ${x05},${y0}`} fill="#dcfce7" opacity="0.85" />

        {/* Grilla */}
        {[0, 2, 4, 6, 8, 10].map((v) => (
          <g key={v}>
            <line x1={45} y1={mapY(v)} x2={345} y2={mapY(v)} stroke="#cbd5e1" strokeWidth="0.8" />
            <text x={36} y={mapY(v) + 3} textAnchor="end" className="text-[9px] font-mono fill-slate-600">
              {v}
            </text>
            <line x1={mapX(v)} y1={20} x2={mapX(v)} y2={190} stroke="#cbd5e1" strokeWidth="0.8" />
            <text x={mapX(v)} y={204} textAnchor="middle" className="text-[9px] font-mono fill-slate-600">
              {v}
            </text>
          </g>
        ))}

        {/* Líneas TLV y Límite de Acción */}
        <line x1={x05} y1={yTlv05} x2={x10} y2={y0} stroke="#dc2626" strokeWidth="2.2" />
        <line x1={x05} y1={yAl05} x2={x10} y2={y0} stroke="#0f172a" strokeWidth="1.8" strokeDasharray="4 3" />

        {/* Etiquetas de zonas */}
        <text x={mapX(6.8)} y={mapY(6.4)} className="text-[9px] font-semibold fill-red-900">
          Zona de Peligro TME
        </text>
        <text x={mapX(2.4)} y={mapY(4.7)} className="text-[8.5px] font-semibold fill-amber-900">
          Zona de Control
        </text>
        <text x={mapX(2.8)} y={mapY(1.4)} className="text-[9px] font-semibold fill-emerald-900">
          Zona de Seguridad
        </text>

        {/* Puntos Mano Derecha e Izquierda */}
        <circle cx={mapX(leftNam)} cy={mapY(leftBorg)} r="5.5" fill="#16a34a" stroke="#ffffff" strokeWidth="1.5" />
        <circle cx={mapX(rightNam)} cy={mapY(rightBorg)} r="5.5" fill="#0f172a" stroke="#ffffff" strokeWidth="1.5" />

        {/* Títulos de ejes */}
        <text x="195" y="219" textAnchor="middle" className="text-[10px] font-semibold fill-slate-800">
          NAM (Nivel de Actividad Manual)
        </text>
        <text
          x="13"
          y="105"
          textAnchor="middle"
          transform="rotate(-90 13 105)"
          className="text-[10px] font-semibold fill-slate-800"
        >
          Fuerza Pico Normalizada (Borg)
        </text>
      </svg>
      <div className="flex flex-wrap items-center justify-center gap-5 mt-2 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 h-0.5 bg-red-600" /> Valor Límite Umbral (VLU)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 border-t-2 border-dashed border-slate-900" /> Límite de Acción
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-slate-900" /> Mano Der. ({rightNam}; {rightBorg})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-emerald-600" /> Mano Izq. ({leftNam}; {leftBorg})
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// GUÍA DE EJES BIODINÁMICOS DE VIBRACIONES (ISO 2631 / ISO 5349)
// ============================================================================
export function VibrationAxesGuide({ mode }: { mode: 'whole_body' | 'hand_arm' }) {
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-lg border border-slate-200 bg-white">
      <svg viewBox="0 0 150 110" className="w-36 h-26 shrink-0 bg-slate-50 rounded border border-slate-100">
        {/* Origen */}
        <circle cx="65" cy="70" r="4" fill="#0f172a" />
        {/* Eje Z vertical */}
        <line x1="65" y1="70" x2="65" y2="18" stroke="#dc2626" strokeWidth="2.4" />
        <polygon points="65,14 61,22 69,22" fill="#dc2626" />
        <text x="72" y="22" className="text-[10px] font-mono font-bold fill-red-700">
          Z
        </text>
        {/* Eje X antero-posterior */}
        <line x1="65" y1="70" x2="122" y2="70" stroke="#0284c7" strokeWidth="2.4" />
        <polygon points="126,70 118,66 118,74" fill="#0284c7" />
        <text x="124" y="63" className="text-[10px] font-mono font-bold fill-sky-700">
          X
        </text>
        {/* Eje Y lateral */}
        <line x1="65" y1="70" x2="28" y2="95" stroke="#16a34a" strokeWidth="2.4" />
        <polygon points="24,98 33,96 29,90" fill="#16a34a" />
        <text x="18" y="92" className="text-[10px] font-mono font-bold fill-emerald-700">
          Y
        </text>
      </svg>
      <div className="space-y-1 text-xs text-slate-600">
        <p className="font-semibold text-slate-900">
          {mode === 'whole_body'
            ? 'Sistema de Ejes Biodinámicos — Cuerpo Entero (ISO 2631)'
            : 'Sistema de Ejes Biodinámicos — Mano-Brazo (ISO 5349)'}
        </p>
        {mode === 'whole_body' ? (
          <p>
            <strong className="text-red-700 font-mono">Eje Z:</strong> Vertical (pies a cabeza, factor 1,0) ·{' '}
            <strong className="text-sky-700 font-mono">Eje X:</strong> Adelante-atrás (sentado ×1,4 / de pie ×1,0) ·{' '}
            <strong className="text-emerald-700 font-mono">Eje Y:</strong> Lateral (sentado ×1,4 / de pie ×1,0).
          </p>
        ) : (
          <p>
            <strong className="text-red-700 font-mono">Eje Z:</strong> Longitudinal al tercer metacarpiano (avance útil) ·{' '}
            <strong className="text-sky-700 font-mono">Eje X:</strong> Perpendicular dorso-palmar ·{' '}
            <strong className="text-emerald-700 font-mono">Eje Y:</strong> Paralelo a la palma sobre la empuñadura.
          </p>
        )}
      </div>
    </div>
  );
}

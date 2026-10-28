import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Calculator,
  CheckCircle2,
  Flame,
  Plus,
  Thermometer,
  Waves,
} from 'lucide-react';
import {
  FangerData,
  Iso2631Data,
  Iso5349Data,
  MethodEvaluationResult,
  MethodId,
  StudyTab,
  WbgtData,
} from '../types/ergonomics';
import { METHOD_CATALOG, createDefaultPayloads, createNewStudyTab } from '../utils/defaults';
import {
  computeFangerMetrics,
  evaluateFanger,
  evaluateIso2631,
  evaluateIso5349,
  evaluateWbgt,
} from '../utils/calculations';
import { FangerForm, Iso2631Form, Iso5349Form, WbgtForm } from './forms/EnvironmentForms';
import { getSeverityStyles } from './StudyTabWorkspace';

export type EnvironmentalMethodId =
  | MethodId.FANGER
  | MethodId.WBGT
  | MethodId.ISO_2631
  | MethodId.ISO_5349;

interface EnvironmentalMethodsWorkspaceProps {
  initialMethodId?: EnvironmentalMethodId;
  onBackToEvaluator: () => void;
  onAddEnvironmentalTabToStudy: (newTab: StudyTab) => void;
  onOpenReference?: (methodId: MethodId) => void;
  onOpenFormulaEditor?: (methodId: MethodId) => void;
}

interface EnvPresetItem {
  id: string;
  method: EnvironmentalMethodId;
  label: string;
  taskTitle: string;
  instruments: string;
  apply: (defaults: ReturnType<typeof createDefaultPayloads>) => {
    fanger?: FangerData;
    wbgt?: WbgtData;
    iso2631?: Iso2631Data;
    iso5349?: Iso5349Data;
  };
}

const ENV_PRESETS: EnvPresetItem[] = [
  {
    id: 'fanger_planilla_logistica_12_4',
    method: MethodId.FANGER,
    label: 'Planilla Multipunto Cap. 12 Tabla 12.4 — 3 Sectores Empresa Logística (Fig. 12.1)',
    taskTitle: 'Relevamiento higrotérmico comparativo en 3 sectores de centro logístico',
    instruments: 'Estación microclimática interior ISO 7726 (ta, tr, HR, va) por sector operativo',
    apply: (def) => ({
      fanger: {
        ...def[MethodId.FANGER],
        useMultiSectorSheet: true,
      },
    }),
  },
  {
    id: 'fanger_oficina_cat_a',
    method: MethodId.FANGER,
    label: 'Oficina Climatizada — Categoría A (ISO 7730 · Cap. 7.2)',
    taskTitle: 'Puesto administrativo y análisis técnico en oficina climatizada',
    instruments: 'Termohigrómetro de globo y anemómetro de hilo caliente (ISO 7726)',
    apply: (def) => ({
      fanger: {
        ...def[MethodId.FANGER],
        useMultiSectorSheet: false,
        airTempC: 23.5,
        radiantTempC: 23.5,
        relativeHumidityPct: 50,
        airVelocityMs: 0.12,
        metabolicRateMet: 1.2,
        clothingInsulationClo: 0.7,
      },
    }),
  },
  {
    id: 'fanger_nave_templada',
    method: MethodId.FANGER,
    label: 'Nave de Ensamble Ligero — Disconfort Cálido Moderado (Cap. 7.4)',
    taskTitle: 'Inspección y control de calidad de pie en nave interior sin radiación intensa',
    instruments: 'Estación microclimática interior ISO 7726 (ta, tr, HR, va)',
    apply: (def) => ({
      fanger: {
        ...def[MethodId.FANGER],
        useMultiSectorSheet: false,
        airTempC: 27.0,
        radiantTempC: 28.0,
        relativeHumidityPct: 60,
        airVelocityMs: 0.18,
        metabolicRateMet: 1.6,
        clothingInsulationClo: 0.75,
      },
    }),
  },
  {
    id: 'fanger_camara_fresca',
    method: MethodId.FANGER,
    label: 'Sala de Acondicionamiento Alimentario Fresca (15 °C · Disconfort Frío)',
    taskTitle: 'Clasificación y envasado en sala climatizada a temperatura controlada',
    instruments: 'Termoanemómetro omnidireccional y sonda de temperatura radiante media',
    apply: (def) => ({
      fanger: {
        ...def[MethodId.FANGER],
        useMultiSectorSheet: false,
        airTempC: 15.0,
        radiantTempC: 14.5,
        relativeHumidityPct: 65,
        airVelocityMs: 0.25,
        metabolicRateMet: 1.6,
        clothingInsulationClo: 1.0,
      },
    }),
  },
  {
    id: 'wbgt_horno_libro',
    method: MethodId.WBGT,
    label: 'Ejemplo Libro Cap. 7.5 — Frente de Horno Industrial (Estrés Térmico)',
    taskTitle: 'Carga y descarga manual frente a horno de tratamiento térmico',
    instruments: 'Monitor de estrés térmico WBGT (bulbo húmedo natural Tbh, globo Ø150 mm Tg y aire Ta)',
    apply: (def) => ({
      wbgt: {
        ...def[MethodId.WBGT],
        solarLoad: false,
        useMultiZone: false,
        tbhC: 26.5,
        tgC: 43.8,
        taC: 35.0,
        metabolicWatts: 400,
        acclimatized: true,
        workRegime: 'ciclo_descanso',
        workMinutesPerHour: 30,
        restWbgtC: 23.5,
      },
    }),
  },
  {
    id: 'iso2631_autoelevador',
    method: MethodId.ISO_2631,
    label: 'Ejemplo Libro Cap. 8.5 — Conducción de Autoelevador / Maquinaria',
    taskTitle: 'Conducción de autoelevador sobre pavimento industrial en turno de 6 h',
    instruments: 'Acelerómetro triaxial de asiento (disco SAE / ISO 2631-1)',
    apply: () => ({
      iso2631: {
        periods: [
          {
            id: 'p-forklift-1',
            equipmentName: 'Autoelevador contrapesado en playa de carga',
            posture: 'sentado',
            awx: 0.32,
            awy: 0.28,
            awz: 0.68,
            exposureHours: 5.5,
          },
        ],
      },
    }),
  },
  {
    id: 'iso5349_martillo',
    method: MethodId.ISO_5349,
    label: 'Ejemplo Libro Cap. 8.6 — Operación con Martillo Neumático / Amoladora',
    taskTitle: 'Rebarbado y picado con herramienta motorizada manual',
    instruments: 'Acelerómetro triaxial mano-brazo sobre empuñadura (ISO 5349-2)',
    apply: () => ({
      iso5349: {
        periods: [
          {
            id: 'p-tool-1',
            toolName: 'Martillo neumático de picado / Amoladora angular',
            ahwx: 3.6,
            ahwy: 3.4,
            ahwz: 3.7,
            exposureHours: 3.0,
          },
        ],
      },
    }),
  },
];

function computePpdFromPmv(pmv: number): number {
  return Math.min(
    100,
    Math.max(5, 100 - 95 * Math.exp(-0.03353 * Math.pow(pmv, 4) - 0.2179 * Math.pow(pmv, 2))),
  );
}

/**
 * Curva interactiva PMV–PPD de Fanger (ISO 7730 — Figuras 7.2 y 12.1 del Libro Guía)
 * Soporta tanto evaluación puntual como trazado simultáneo de múltiples sectores cargados en planilla.
 */
const FangerPmvPpdCurveSvg: React.FC<{ data: FangerData; result: MethodEvaluationResult }> = ({
  data,
  result,
}) => {
  const pmvMatch = result.primaryScoreText.match(/([-+]?\d+(?:\.\d+)?)/);
  const pmvVal = pmvMatch ? Math.max(-3, Math.min(3, parseFloat(pmvMatch[1]))) : 0;
  const ppdVal = computePpdFromPmv(pmvVal);

  const isMulti = Boolean(data.useMultiSectorSheet && data.multiSectorSamples && data.multiSectorSamples.length > 0);
  const multiPoints = useMemo(() => {
    if (!isMulti || !data.multiSectorSamples) return [];
    return data.multiSectorSamples.map((row, idx) => {
      const m = computeFangerMetrics(row);
      return {
        idx: idx + 1,
        label: row.sectorLabel,
        pmv: Math.max(-3, Math.min(3, m.pmv)),
        ppd: m.ppd,
        outOfComfort: Math.abs(m.pmv) > 0.5 || m.ppd > 10,
      };
    });
  }, [isMulti, data.multiSectorSamples]);

  const svgW = 580;
  const svgH = 250;
  const padL = 48;
  const padR = 22;
  const padT = 22;
  const padB = 42;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const xOfPmv = (pmv: number) => padL + ((pmv + 3) / 6) * plotW;
  const yOfPpd = (ppd: number) => padT + (1 - ppd / 100) * plotH;

  const pathPoints: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const p = -3 + (6 * i) / 120;
    const y = computePpdFromPmv(p);
    pathPoints.push(`${i === 0 ? 'M' : 'L'} ${xOfPmv(p).toFixed(1)} ${yOfPpd(y).toFixed(1)}`);
  }

  const curX = xOfPmv(pmvVal);
  const curY = yOfPpd(ppdVal);

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h4 className="text-xs font-bold text-slate-900">
            Curva Característica PMV – PPD de Fanger (ISO 7730 · {isMulti ? 'Fig. 12.1 Multipunto' : 'Fig. 7.2'})
          </h4>
          <p className="text-[11px] text-slate-500">
            {isMulti
              ? 'Ubicación simultánea de los sectores relevados en planilla respecto del umbral del 10 % de insatisfechos'
              : 'Relación analítica entre el Voto Medio Estimado (−3 frío a +3 calor) y el Porcentaje de Insatisfechos (mín. 5%)'}
          </p>
        </div>
        <span className="font-mono text-xs font-semibold text-sky-800 tabular-nums">
          {isMulti ? `Crítico: ` : ''}PMV = {pmvVal >= 0 ? '+' : ''}
          {pmvVal.toFixed(2)} · PPD = {ppdVal.toFixed(1)}%
        </span>
      </div>

      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="w-full h-auto max-h-[250px] select-none"
        role="img"
        aria-label="Curva PMV versus PPD según método de Fanger ISO 7730"
      >
        <rect
          x={xOfPmv(-0.7)}
          y={padT}
          width={xOfPmv(0.7) - xOfPmv(-0.7)}
          height={plotH}
          fill="#fef3c7"
          opacity="0.55"
        />
        <rect
          x={xOfPmv(-0.5)}
          y={padT}
          width={xOfPmv(0.5) - xOfPmv(-0.5)}
          height={plotH}
          fill="#dcfce7"
          opacity="0.7"
        />
        <rect
          x={xOfPmv(-0.2)}
          y={padT}
          width={xOfPmv(0.2) - xOfPmv(-0.2)}
          height={plotH}
          fill="#bbf7d0"
          opacity="0.75"
        />

        {[5, 10, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={padL}
              y1={yOfPpd(tick)}
              x2={svgW - padR}
              y2={yOfPpd(tick)}
              stroke={tick === 10 ? '#059669' : '#e2e8f0'}
              strokeDasharray={tick === 10 ? '4 3' : undefined}
              strokeWidth={tick === 10 ? 1.2 : 1}
            />
            <text
              x={padL - 7}
              y={yOfPpd(tick) + 3.5}
              textAnchor="end"
              className="fill-slate-500 text-[10px] font-mono"
            >
              {tick}%
            </text>
          </g>
        ))}

        {[-3, -2, -1, -0.5, 0, 0.5, 1, 2, 3].map((pTick) => (
          <g key={pTick}>
            <line
              x1={xOfPmv(pTick)}
              y1={padT}
              x2={xOfPmv(pTick)}
              y2={padT + plotH}
              stroke={pTick === 0 ? '#94a3b8' : '#e2e8f0'}
              strokeDasharray={Math.abs(pTick) === 0.5 ? '3 3' : undefined}
              strokeWidth={1}
            />
            <text
              x={xOfPmv(pTick)}
              y={padT + plotH + 15}
              textAnchor="middle"
              className="fill-slate-600 text-[10px] font-mono"
            >
              {pTick > 0 ? `+${pTick}` : pTick}
            </text>
          </g>
        ))}

        <line
          x1={padL}
          y1={padT + plotH}
          x2={svgW - padR}
          y2={padT + plotH}
          stroke="#475569"
          strokeWidth={1.3}
        />
        <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="#475569" strokeWidth={1.3} />

        <text x={xOfPmv(-2.3)} y={svgH - 6} textAnchor="middle" className="fill-sky-700 text-[10px] font-semibold">
          ← Disconfort por Frío
        </text>
        <text x={xOfPmv(0)} y={svgH - 6} textAnchor="middle" className="fill-emerald-800 text-[10px] font-semibold">
          Zona Confort (±0,5 · ≤10%)
        </text>
        <text x={xOfPmv(2.3)} y={svgH - 6} textAnchor="middle" className="fill-orange-700 text-[10px] font-semibold">
          Disconfort por Calor →
        </text>

        <path d={pathPoints.join(' ')} fill="none" stroke="#0369a1" strokeWidth={2.6} />

        {isMulti
          ? multiPoints.map((pt) => {
              const px = xOfPmv(pt.pmv);
              const py = yOfPpd(pt.ppd);
              const color = pt.outOfComfort ? '#dc2626' : '#0f766e';
              return (
                <g key={pt.idx}>
                  <line
                    x1={px}
                    y1={padT + plotH}
                    x2={px}
                    y2={py}
                    stroke={color}
                    strokeDasharray="2 2"
                    strokeWidth={1.1}
                    opacity={0.75}
                  />
                  <circle cx={px} cy={py} r={7.5} fill={color} stroke="#ffffff" strokeWidth={1.8} />
                  <text
                    x={px}
                    y={py + 3.2}
                    textAnchor="middle"
                    className="fill-white text-[9px] font-bold font-mono"
                  >
                    {pt.idx}
                  </text>
                </g>
              );
            })
          : (
              <>
                <line
                  x1={curX}
                  y1={padT + plotH}
                  x2={curX}
                  y2={curY}
                  stroke="#dc2626"
                  strokeDasharray="3 3"
                  strokeWidth={1.3}
                />
                <line
                  x1={padL}
                  y1={curY}
                  x2={curX}
                  y2={curY}
                  stroke="#dc2626"
                  strokeDasharray="3 3"
                  strokeWidth={1.3}
                />
                <circle cx={curX} cy={curY} r={5.5} fill="#dc2626" stroke="#ffffff" strokeWidth={2} />
              </>
            )}
      </svg>

      {isMulti && multiPoints.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 border-t border-slate-100 text-[11px] text-slate-700">
          {multiPoints.map((pt) => (
            <span key={pt.idx} className="inline-flex items-center gap-1.5 font-mono tabular-nums">
              <strong className={pt.outOfComfort ? 'text-red-700' : 'text-teal-800'}>[{pt.idx}]</strong>
              <span className="font-sans text-slate-800">{pt.label}:</span>
              <span>
                PMV {pt.pmv >= 0 ? '+' : ''}
                {pt.pmv.toFixed(2)} ({pt.ppd.toFixed(1)}%)
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export const EnvironmentalMethodsWorkspace: React.FC<EnvironmentalMethodsWorkspaceProps> = ({
  initialMethodId = MethodId.FANGER,
  onBackToEvaluator,
  onAddEnvironmentalTabToStudy,
  onOpenReference,
  onOpenFormulaEditor,
}) => {
  const defaultPayloads = useMemo(() => createDefaultPayloads(), []);
  const [selectedMethod, setSelectedMethod] = useState<EnvironmentalMethodId>(initialMethodId);
  const [taskEvaluated, setTaskEvaluated] = useState<string>(
    'Evaluación de confort térmico interior (PMV / PPD) en puesto de trabajo',
  );
  const [instrumentsUsed, setInstrumentsUsed] = useState<string>(
    'Termohigrómetro digital, globo de cobre negro mate y termoanemómetro omnidireccional (ISO 7726)',
  );

  const [fangerData, setFangerData] = useState<FangerData>(defaultPayloads[MethodId.FANGER]);
  const [wbgtData, setWbgtData] = useState<WbgtData>(defaultPayloads[MethodId.WBGT]);
  const [iso2631Data, setIso2631Data] = useState<Iso2631Data>(defaultPayloads[MethodId.ISO_2631]);
  const [iso5349Data, setIso5349Data] = useState<Iso5349Data>(defaultPayloads[MethodId.ISO_5349]);
  const [addedFeedback, setAddedFeedback] = useState<string>('');

  const catalogMeta = useMemo(
    () => METHOD_CATALOG.find((m) => m.id === selectedMethod)!,
    [selectedMethod],
  );

  const liveResult: MethodEvaluationResult = useMemo(() => {
    switch (selectedMethod) {
      case MethodId.FANGER:
        return evaluateFanger(fangerData);
      case MethodId.WBGT:
        return evaluateWbgt(wbgtData);
      case MethodId.ISO_2631:
        return evaluateIso2631(iso2631Data);
      case MethodId.ISO_5349:
        return evaluateIso5349(iso5349Data);
    }
  }, [selectedMethod, fangerData, wbgtData, iso2631Data, iso5349Data]);

  const sevStyle = getSeverityStyles(liveResult.severity);

  const handleSwitchMethod = (nextMethod: EnvironmentalMethodId) => {
    setSelectedMethod(nextMethod);
    if (nextMethod === MethodId.FANGER) {
      setTaskEvaluated('Evaluación de confort térmico interior (PMV / PPD — ISO 7730)');
      setInstrumentsUsed('Termohigrómetro, sonda de globo y anemómetro omnidireccional (ISO 7726)');
    } else if (nextMethod === MethodId.WBGT) {
      setTaskEvaluated('Evaluación de estrés térmico por exposición al calor (Índice WBGT)');
      setInstrumentsUsed('Monitor de estrés térmico WBGT (Tbh natural, Tg Ø150 mm y Ta)');
    } else if (nextMethod === MethodId.ISO_2631) {
      setTaskEvaluated('Exposición diaria A(8) a vibraciones mecánicas de cuerpo entero');
      setInstrumentsUsed('Acelerómetro triaxial de asiento / plataforma conforme a ISO 2631-1');
    } else {
      setTaskEvaluated('Exposición diaria A(8) a vibraciones mecánicas del sistema mano-brazo');
      setInstrumentsUsed('Acelerómetro triaxial en empuñadura de herramienta conforme a ISO 5349-2');
    }
  };

  const handleApplyPreset = (presetId: string) => {
    const found = ENV_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setSelectedMethod(found.method);
    setTaskEvaluated(found.taskTitle);
    setInstrumentsUsed(found.instruments);
    const patch = found.apply(defaultPayloads);
    if (patch.fanger) setFangerData(patch.fanger);
    if (patch.wbgt) setWbgtData(patch.wbgt);
    if (patch.iso2631) setIso2631Data(patch.iso2631);
    if (patch.iso5349) setIso5349Data(patch.iso5349);
  };

  const handleSendToStudy = () => {
    const newTab = createNewStudyTab(1, selectedMethod, taskEvaluated);
    newTab.tabLabel = `Estudio: ${catalogMeta.shortName}`;
    newTab.instrumentsUsed = instrumentsUsed;
    newTab.payloads = {
      ...newTab.payloads,
      [MethodId.FANGER]: fangerData,
      [MethodId.WBGT]: wbgtData,
      [MethodId.ISO_2631]: iso2631Data,
      [MethodId.ISO_5349]: iso5349Data,
    };
    newTab.implementationDeadline = liveResult.recommendedDeadline;
    newTab.evaluatorObservations = `${catalogMeta.justificationTemplate} En la evaluación de "${taskEvaluated}" se registra ${liveResult.primaryScoreText}${liveResult.secondaryScoreText ? ` (${liveResult.secondaryScoreText})` : ''} — ${liveResult.riskLabel}. ${liveResult.interpretation}`;
    newTab.correctiveMeasures = liveResult.suggestedMeasures
      .map((s, idx) => `${idx + 1}. ${s}`)
      .join('\n');

    onAddEnvironmentalTabToStudy(newTab);
    setAddedFeedback(
      `Evaluación de ${catalogMeta.shortName} integrada como pestaña del estudio lista para exportar en PDF y Word.`,
    );
    window.setTimeout(() => setAddedFeedback(''), 4500);
  };

  const methodTabs: {
    id: EnvironmentalMethodId;
    label: string;
    subLabel: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: MethodId.FANGER,
      label: 'Método Fanger (PMV / PPD)',
      subLabel: 'Cap. 7.2 · Confort Térmico ISO 7730',
      icon: <Thermometer className="w-4 h-4" />,
    },
    {
      id: MethodId.WBGT,
      label: 'Índice WBGT (Calor)',
      subLabel: 'Cap. 7.3 · Estrés Térmico ISO 7243',
      icon: <Flame className="w-4 h-4" />,
    },
    {
      id: MethodId.ISO_2631,
      label: 'Vibraciones Cuerpo Entero',
      subLabel: 'Cap. 8.3 · Norma ISO 2631',
      icon: <Waves className="w-4 h-4" />,
    },
    {
      id: MethodId.ISO_5349,
      label: 'Vibraciones Mano-Brazo',
      subLabel: 'Cap. 8.4 · Norma ISO 5349',
      icon: <Waves className="w-4 h-4" />,
    },
  ];

  return (
    <div className="space-y-5">
      {/* CABECERA COHERENTE CON EL ARCHIVO GUÍA (CAPÍTULOS 7 Y 8 SEPARADOS DE CARGA POSTURAL) */}
      <section className="bg-white border border-slate-300 rounded-lg p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-amber-800 font-semibold">
              <span>Ergonomía Ambiental y Agentes Físicos</span>
              <span aria-hidden="true">·</span>
              <span>Capítulos 7 y 8 del Libro Guía</span>
              <span aria-hidden="true">·</span>
              <span>Separado de Carga Postural / Goniometría 3D</span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Confort Térmico (Método de Fanger), Estrés Térmico (WBGT) y Vibraciones Mecánicas
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-4xl leading-relaxed">
              Conforme al archivo guía (Capítulo 7), el <strong>Método de Fanger (ISO 7730)</strong> evalúa el{' '}
              <strong>confort térmico higrotérmico</strong> mediante balance energético corporal (variables ambientales{' '}
              <span className="font-mono">ta, tr, HR, va</span> y personales <span className="font-mono">met, clo</span>) y{' '}
              <strong>no constituye un método de evaluación de carga postural</strong>. Desde esta pestaña dedicada se evalúan los métodos ambientales y vibratorios sin mezclarlos con el goniómetro ni el avatar postural 3D.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onOpenFormulaEditor && (
              <button
                type="button"
                onClick={() => onOpenFormulaEditor(selectedMethod)}
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer"
              >
                <Calculator className="w-3.5 h-3.5 text-sky-700" />
                Fórmulas
              </button>
            )}
            {onOpenReference && (
              <button
                type="button"
                onClick={() => onOpenReference(selectedMethod)}
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-md border border-sky-300 bg-sky-50 hover:bg-sky-100 text-xs font-semibold text-sky-950 cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5 text-sky-700" />
                Tablas Cap. {selectedMethod === MethodId.FANGER || selectedMethod === MethodId.WBGT ? '7' : '8'}
              </button>
            )}
            <button
              type="button"
              onClick={onBackToEvaluator}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-md border border-slate-300 bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-800 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Volver al Estudio
            </button>
          </div>
        </div>

        {/* SELECTOR DE MÉTODO AMBIENTAL / FÍSICO */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
          {methodTabs.map((item) => {
            const active = selectedMethod === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSwitchMethod(item.id)}
                className={`text-left p-3 rounded-md border transition-colors cursor-pointer min-h-[54px] flex items-start gap-2.5 ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                    : 'bg-slate-50 hover:bg-white text-slate-800 border-slate-200'
                }`}
              >
                <span className={`mt-0.5 shrink-0 ${active ? 'text-amber-300' : 'text-sky-700'}`}>
                  {item.icon}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">{item.label}</div>
                  <div className={`text-[11px] truncate ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                    {item.subLabel}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* CASOS DE REFERENCIA DEL LIBRO Y CARGA DE METADATOS DE CAMPO */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 pt-1 items-end">
          <div className="lg:col-span-4 space-y-1">
            <label className="block text-xs font-semibold text-slate-800">
              Cargar Caso Resuelto / Escenario de Referencia (Cap. 7 y 8)
            </label>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) handleApplyPreset(e.target.value);
              }}
              className="w-full min-h-[40px] rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
            >
              <option value="">Seleccionar escenario térmico o vibratorio...</option>
              {ENV_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-4 space-y-1">
            <label className="block text-xs font-semibold text-slate-800">
              Sector / Puesto o Condición Evaluada
            </label>
            <input
              type="text"
              value={taskEvaluated}
              onChange={(e) => setTaskEvaluated(e.target.value)}
              className="w-full min-h-[40px] rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            />
          </div>

          <div className="lg:col-span-4 space-y-1">
            <label className="block text-xs font-semibold text-slate-800">
              Instrumental de Medición Empleado en Campo
            </label>
            <input
              type="text"
              value={instrumentsUsed}
              onChange={(e) => setInstrumentsUsed(e.target.value)}
              className="w-full min-h-[40px] rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            />
          </div>
        </div>

        {addedFeedback && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-950 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{addedFeedback}</span>
          </div>
        )}
      </section>

      {/* CUERPO PRINCIPAL: FORMULARIO INSTRUMENTAL + CURVA / VALORACIÓN EN TIEMPO REAL */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 space-y-5">
          {selectedMethod === MethodId.FANGER && (
            <>
              <FangerPmvPpdCurveSvg data={fangerData} result={liveResult} />
              <FangerForm data={fangerData} onChange={setFangerData} />
            </>
          )}

          {selectedMethod === MethodId.WBGT && (
            <WbgtForm data={wbgtData} onChange={setWbgtData} />
          )}

          {selectedMethod === MethodId.ISO_2631 && (
            <Iso2631Form data={iso2631Data} onChange={setIso2631Data} />
          )}

          {selectedMethod === MethodId.ISO_5349 && (
            <Iso5349Form data={iso5349Data} onChange={setIso5349Data} />
          )}
        </div>

        <aside className="xl:col-span-4 xl:sticky xl:top-20 space-y-4">
          <div className={`rounded-lg border p-5 space-y-3 ${sevStyle.box}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className={`text-xs font-semibold ${sevStyle.labelText}`}>
                Resultado Normativo Instantáneo
              </span>
              <span className="text-xs font-mono font-medium opacity-85">{catalogMeta.shortName}</span>
            </div>

            <div className={`text-2xl font-bold font-mono tabular-nums tracking-tight ${sevStyle.scoreText}`}>
              {liveResult.primaryScoreText}
            </div>

            {liveResult.secondaryScoreText && (
              <div className="text-xs font-mono tabular-nums opacity-90">
                {liveResult.secondaryScoreText}
              </div>
            )}

            <div className="pt-2 border-t border-current/15 space-y-1">
              <div className="text-sm font-semibold">{liveResult.riskLabel}</div>
              <div className="text-xs opacity-90">{liveResult.actionLevelText}</div>
              <div className="text-xs font-medium pt-1">
                Plazo recomendado: <span className="underline">{liveResult.recommendedDeadline}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSendToStudy}
              className="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[42px] rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" />
              Agregar Evaluación al Estudio e Informe
            </button>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-900">
              Desglose Técnico ({catalogMeta.chapterRef})
            </h4>
            <div className="divide-y divide-slate-100 text-xs">
              {liveResult.breakdownRows.map((row, idx) => (
                <div key={idx} className="py-2 space-y-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-slate-600">{row.parameter}</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums text-right">
                      {row.value}
                    </span>
                  </div>
                  {row.reference && (
                    <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                      {row.reference}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
            <h4 className="text-xs font-bold text-slate-900">Medidas Preventivas Sugeridas</h4>
            <ul className="space-y-1.5 text-xs text-slate-700 list-disc list-inside">
              {liveResult.suggestedMeasures.map((m, idx) => (
                <li key={idx} className="leading-relaxed">
                  {m}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
};

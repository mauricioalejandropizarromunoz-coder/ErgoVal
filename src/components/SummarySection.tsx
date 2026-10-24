import React from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  GeneralStudyData,
  MethodEvaluationResult,
  RiskCategory,
  RiskSeverity,
  StudyTab,
} from '../types/ergonomics';
import { evaluateStudyTab } from '../utils/calculations';
import { METHOD_CATALOG } from '../utils/defaults';

export interface PrioritizedTabEntry {
  tab: StudyTab;
  result: MethodEvaluationResult;
  priorityScore: number;
  rank: number;
}

const SEVERITY_WEIGHT: Record<RiskSeverity, number> = {
  muy_alto: 400,
  alto: 300,
  moderado: 200,
  bajo: 100,
};

export function buildPrioritizedStudies(general: GeneralStudyData, tabs: StudyTab[]): PrioritizedTabEntry[] {
  const evaluated = tabs.map((tab) => ({
    tab,
    result: evaluateStudyTab(tab),
  }));

  // Concurrencia de factores elevados (Cap. 10.2)
  const elevatedCategories = new Set(
    evaluated.filter((e) => e.result.severity !== 'bajo').map((e) => e.result.category),
  );
  const concurrencyBonus = elevatedCategories.size >= 2 ? 25 : 0;
  const injuryBonus = general.previousInjuriesOrSymptoms ? 35 : 0;

  const scored = evaluated.map((item) => {
    // Menor hierarchyOrder (1=MMC, 2=Repetitividad, 3=Postura, 4=Vibración, 5=Térmico) = mayor prioridad biomecánica
    const biomechWeight = (6 - item.result.hierarchyOrder) * 15;
    const priorityScore =
      SEVERITY_WEIGHT[item.result.severity] +
      biomechWeight +
      (item.result.severity !== 'bajo' ? concurrencyBonus + injuryBonus : 0);

    return {
      ...item,
      priorityScore,
      rank: 0,
    };
  });

  scored.sort((a, b) => b.priorityScore - a.priorityScore);
  return scored.map((entry, idx) => ({ ...entry, rank: idx + 1 }));
}

export function generateAutomaticExecutiveSynthesis(
  general: GeneralStudyData,
  prioritized: PrioritizedTabEntry[],
): string {
  const workstation = general.workstationName || 'Puesto Evaluado';
  const company = general.companyName || 'la organización';
  const highCount = prioritized.filter(
    (p) => p.result.severity === 'muy_alto' || p.result.severity === 'alto',
  ).length;
  const modCount = prioritized.filter((p) => p.result.severity === 'moderado').length;
  const lowCount = prioritized.filter((p) => p.result.severity === 'bajo').length;

  const lines: string[] = [];
  lines.push(
    `En el estudio ergonómico integral realizado sobre el puesto "${workstation}" perteneciente a ${company} (${general.exposedWorkersCount} trabajador/es expuesto/s, jornada de ${general.shiftDurationHours} h), se aplicaron ${prioritized.length} evaluaciones metodológicas específicas conforme al protocolo de los Capítulos 9 y 10.`,
  );

  if (highCount > 0) {
    const topCritical = prioritized
      .filter((p) => p.result.severity === 'muy_alto' || p.result.severity === 'alto')
      .map((p) => `${p.tab.tabLabel} (${p.result.primaryScoreText} — ${p.result.riskLabel})`)
      .join('; ');
    lines.push(
      `Se identificaron ${highCount} estudio(s) en nivel de RIESGO ALTO / MUY ALTO que demandan intervención prioritaria de ingeniería y rediseño operativo: ${topCritical}.`,
    );
  }

  if (modCount > 0) {
    lines.push(
      `Adicionalmente, ${modCount} estudio(s) arrojaron nivel de RIESGO MODERADO, recomendándose implementar mejoras organizativas, ajustes geométricos y seguimiento periódico a corto/mediano plazo.`,
    );
  }

  if (highCount === 0 && modCount === 0 && lowCount > 0) {
    lines.push(
      `La totalidad de las evaluaciones practicadas (${lowCount} de ${prioritized.length}) se sitúa en ZONA ACEPTABLE / RIESGO BAJO, verificándose condiciones ergonómicas compatibles con la preservación de la salud musculoesquelética bajo el régimen operativo relevado.`,
    );
  }

  if (general.previousInjuriesOrSymptoms) {
    lines.push(
      `Dado el registro de antecedentes o sintomatología previa (${general.previousInjuriesDetail || 'reportada en el puesto'}), se eleva la prioridad de vigilancia médica laboral y verificación temprana de la eficacia de las medidas implementadas.`,
    );
  }

  return lines.join('\n\n');
}

interface SummarySectionProps {
  general: GeneralStudyData;
  tabs: StudyTab[];
  onChangeGeneral: (next: GeneralStudyData) => void;
  onSelectTabIndex: (idx: number) => void;
  onExportPdf: () => void;
  onExportWord: () => void;
  isExportingPdf: boolean;
  isExportingWord: boolean;
}

export function SummarySection({
  general,
  tabs,
  onChangeGeneral,
  onSelectTabIndex,
  onExportPdf,
  onExportWord,
  isExportingPdf,
  isExportingWord,
}: SummarySectionProps) {
  const prioritized = buildPrioritizedStudies(general, tabs);
  const autoSynthesis = generateAutomaticExecutiveSynthesis(general, prioritized);

  const criticalOrHighCount = prioritized.filter(
    (p) => p.result.severity === 'muy_alto' || p.result.severity === 'alto',
  ).length;
  const moderateCount = prioritized.filter((p) => p.result.severity === 'moderado').length;
  const totalPhotos = tabs.reduce((acc, t) => acc + t.photos.length, 0);

  const categoryLabels: Record<RiskCategory, string> = {
    manipulacion_cargas: '1° Manipulación Manual de Cargas',
    movimientos_repetitivos: '2° Movimientos Repetitivos',
    posturas_forzadas: '3° Carga Postural',
    vibraciones: '4° Vibraciones Mecánicas',
    ambiente_termico: '5° Ambiente Térmico',
  };

  const severityLabelMap: Record<RiskSeverity, { label: string; textClass: string }> = {
    muy_alto: { label: 'MUY ALTO · Inmediato', textClass: 'text-red-700 font-semibold' },
    alto: { label: 'ALTO · Corto plazo', textClass: 'text-orange-700 font-semibold' },
    moderado: { label: 'MODERADO · Medio plazo', textClass: 'text-amber-700 font-semibold' },
    bajo: { label: 'BAJO / ACEPTABLE', textClass: 'text-emerald-700 font-semibold' },
  };

  // Cobertura de peligros identificados en Paso 1 vs pestañas creadas
  const uncoveredHazards = (Object.keys(general.hazardsIdentified) as RiskCategory[]).filter(
    (cat) => general.hazardsIdentified[cat] && !tabs.some((t) => METHOD_CATALOG.find((m) => m.id === t.method)?.category === cat),
  );

  return (
    <div className="space-y-6">
      {/* Encabezado Ejecutivo + Acciones Principales de Exportación */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900">
              Resumen Ejecutivo Automático y Jerarquización de Intervenciones (Capítulo 10)
            </h2>
            <p className="text-sm text-slate-600 max-w-[72ch]">
              Consolidación integral de las {tabs.length} pestañas evaluadas sobre el puesto{' '}
              <strong className="text-slate-900">{general.workstationName || 'Sin denominar'}</strong> en{' '}
              <strong className="text-slate-900">{general.companyName || 'Empresa Evaluada'}</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onExportPdf}
              disabled={isExportingPdf}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <FileDown className="w-4 h-4" />
              {isExportingPdf ? 'Generando PDF...' : 'Exportar Informe PDF Detallado'}
            </button>
            <button
              type="button"
              onClick={onExportWord}
              disabled={isExportingWord}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md border border-sky-700 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {isExportingWord ? 'Generando Word...' : 'Exportar Informe Word (.docx)'}
            </button>
          </div>
        </div>

        {/* Fila de KPIs limpios (máx. 4 métricas, tabular-nums) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-5 pt-5 border-t border-slate-100">
          <div>
            <span className="block text-xs text-slate-500">Pestañas / Métodos Evaluados</span>
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">{tabs.length}</span>
            <span className="block text-xs text-slate-500 mt-0.5">{totalPhotos} registro(s) fotográfico(s)</span>
          </div>
          <div>
            <span className="block text-xs text-slate-500">Estudios en Riesgo Alto / Muy Alto</span>
            <span
              className={`text-2xl font-bold font-mono tabular-nums ${
                criticalOrHighCount > 0 ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              {criticalOrHighCount}
            </span>
            <span className="block text-xs text-slate-500 mt-0.5">{moderateCount} en nivel moderado</span>
          </div>
          <div>
            <span className="block text-xs text-slate-500">Trabajadores Expuestos</span>
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {general.exposedWorkersCount}
            </span>
            <span className="block text-xs text-slate-500 mt-0.5">Jornada de {general.shiftDurationHours} h/día</span>
          </div>
          <div>
            <span className="block text-xs text-slate-500">Prioridad N° 1 de Actuación</span>
            <span className="text-sm font-semibold text-slate-900 block mt-1 truncate">
              {prioritized[0] ? `${prioritized[0].tab.tabLabel}` : '—'}
            </span>
            <span className="block text-xs font-mono tabular-nums text-slate-600 mt-0.5">
              {prioritized[0]?.result.primaryScoreText || ''}
            </span>
          </div>
        </div>
      </section>

      {/* Aviso de coherencia de protocolo si se marcó un peligro sin pestaña asociada */}
      {uncoveredHazards.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-4 flex items-start gap-3 text-xs text-amber-950">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Verificación del Protocolo (Capítulo 9.2):</p>
            <p className="mt-0.5">
              En Datos Generales se marcaron como presentes los siguientes factores que aún no cuentan con una pestaña de evaluación asignada:{' '}
              <strong>{uncoveredHazards.map((c) => categoryLabels[c]).join(' · ')}</strong>. Puede añadir una pestaña desde la barra superior si requiere incluirlos en el dictamen.
            </p>
          </div>
        </div>
      )}

      {/* Tabla Consolidada de Resultados y Priorización Biomecánica (Capítulo 10) */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-700" />
            <h3 className="text-sm font-semibold text-slate-900">
              Matriz Consolidada y Orden de Prioridad de Intervención (Criterio Biomecánico Cap. 10.2)
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            1° Cargas · 2° Repetitividad · 3° Posturas · 4° Vibraciones · 5° Térmico + Nivel de Riesgo
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="py-2.5 px-3 font-semibold">Orden</th>
                <th className="py-2.5 px-3 font-semibold">Pestaña / Tarea Evaluada</th>
                <th className="py-2.5 px-3 font-semibold">Método Aplicado</th>
                <th className="py-2.5 px-3 font-semibold">Factor / Jerarquía</th>
                <th className="py-2.5 px-3 font-semibold">Resultado Obtenido</th>
                <th className="py-2.5 px-3 font-semibold">Valoración y Plazo</th>
                <th className="py-2.5 px-3 font-semibold">Observaciones / Medidas</th>
                <th className="py-2.5 px-3 text-right font-semibold">Ir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {prioritized.map((entry) => {
                const origIdx = tabs.findIndex((t) => t.id === entry.tab.id);
                const sevInfo = severityLabelMap[entry.result.severity];
                return (
                  <tr key={entry.tab.id} className="hover:bg-slate-50/70 align-top">
                    <td className="py-3 px-3 font-mono font-bold tabular-nums text-slate-900">#{entry.rank}</td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-900">{entry.tab.tabLabel}</div>
                      <div className="text-slate-500 mt-0.5">{entry.tab.taskEvaluated || 'Sin descripción de subtarea'}</div>
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-800">
                      {METHOD_CATALOG.find((m) => m.id === entry.tab.method)?.shortName}
                    </td>
                    <td className="py-3 px-3 text-slate-600">{categoryLabels[entry.result.category]}</td>
                    <td className="py-3 px-3 font-mono font-semibold tabular-nums text-slate-900">
                      <div>{entry.result.primaryScoreText}</div>
                      {entry.result.secondaryScoreText && (
                        <div className="text-[11px] font-normal text-slate-500">{entry.result.secondaryScoreText}</div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className={sevInfo.textClass}>{sevInfo.label}</div>
                      <div className="text-slate-500 mt-0.5">Plazo hoja: {entry.tab.implementationDeadline}</div>
                    </td>
                    <td className="py-3 px-3 max-w-xs text-slate-600">
                      {entry.tab.correctiveMeasures ? (
                        <span className="line-clamp-2">{entry.tab.correctiveMeasures}</span>
                      ) : (
                        <span className="text-slate-400 italic">Usa sugerencias automáticas del método</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectTabIndex(origIdx)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 hover:bg-slate-100 text-slate-700 font-medium cursor-pointer"
                      >
                        Editar
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Síntesis Diagnóstica y Conclusión Global para el Informe */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-sky-700" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Dictamen y Conclusión Técnica Global del Estudio (Sección 9 y 10 del Informe)
              </h3>
              <p className="text-xs text-slate-500">
                Se genera automáticamente a partir de los resultados de todas las pestañas; puede personalizarla libremente
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onChangeGeneral({ ...general, customGlobalConclusion: autoSynthesis })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-800 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-700" />
            Copiar síntesis automática para editar
          </button>
        </div>

        {!general.customGlobalConclusion ? (
          <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/70 text-sm text-slate-800 whitespace-pre-line leading-relaxed">
            {autoSynthesis}
          </div>
        ) : (
          <div className="space-y-2">
            <textarea
              rows={6}
              value={general.customGlobalConclusion}
              onChange={(e) => onChangeGeneral({ ...general, customGlobalConclusion: e.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none leading-relaxed"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onChangeGeneral({ ...general, customGlobalConclusion: '' })}
                className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
              >
                Restaurar síntesis dinámica automática
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

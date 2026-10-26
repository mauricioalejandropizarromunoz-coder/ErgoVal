import React, { useState } from 'react';
import {
  BookOpen,
  Calculator,
  CheckCircle2,
  ClipboardPenLine,
  Eye,
  FileText,
  Sparkles,
  Thermometer,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { MethodEvaluationResult, MethodId, RiskSeverity, StudyTab } from '../types/ergonomics';
import { evaluateStudyTab } from '../utils/calculations';
import { METHOD_CATALOG } from '../utils/defaults';
import { isMethodFormulaModified } from '../utils/formulaConfig';
import { PhotoGoniometer } from './PhotoGoniometer';
import { EnvironmentFormsSwitch, LoadRepetitiveSwitch, PosturalSwitch } from './MethodFormDispatcher';

interface StudyTabWorkspaceProps {
  tab: StudyTab;
  tabIndex: number;
  totalTabs: number;
  onChange: (updated: StudyTab) => void;
  onDeleteTab: () => void;
  onOpenReference?: (methodId: MethodId, query?: string) => void;
  onOpenFormulaEditor?: (methodId: MethodId) => void;
  onOpenVideoExtractor?: () => void;
  onOpenEnvironmentalWorkspace?: (methodId: MethodId) => void;
}

export function getSeverityStyles(severity: RiskSeverity) {
  switch (severity) {
    case 'bajo':
      return {
        box: 'border-emerald-200 bg-emerald-50/70 text-emerald-950',
        labelText: 'text-emerald-800',
        scoreText: 'text-emerald-950',
      };
    case 'moderado':
      return {
        box: 'border-amber-300 bg-amber-50/70 text-amber-950',
        labelText: 'text-amber-800',
        scoreText: 'text-amber-950',
      };
    case 'alto':
      return {
        box: 'border-orange-300 bg-orange-50/80 text-orange-950',
        labelText: 'text-orange-800',
        scoreText: 'text-orange-950',
      };
    case 'muy_alto':
      return {
        box: 'border-red-300 bg-red-50/80 text-red-950',
        labelText: 'text-red-800',
        scoreText: 'text-red-950',
      };
  }
}

export function StudyTabWorkspace({
  tab,
  tabIndex,
  totalTabs,
  onChange,
  onDeleteTab,
  onOpenReference,
  onOpenFormulaEditor,
  onOpenVideoExtractor,
  onOpenEnvironmentalWorkspace,
}: StudyTabWorkspaceProps) {
  const [showRefPoster, setShowRefPoster] = useState(false);

  const catalogItem = METHOD_CATALOG.find((m) => m.id === tab.method)!;
  const result: MethodEvaluationResult = evaluateStudyTab(tab);
  const sevStyle = getSeverityStyles(result.severity);
  const isCustomFormula = isMethodFormulaModified(tab.method);

  const handleMethodChange = (nextMethod: MethodId) => {
    const nextMeta = METHOD_CATALOG.find((m) => m.id === nextMethod)!;
    const isDefaultLabel = /^(\d+\.\s*|Estudio\s+\d+:\s*)/i.test(tab.tabLabel);
    onChange({
      ...tab,
      method: nextMethod,
      tabLabel: isDefaultLabel ? `Estudio ${tabIndex + 1}: ${nextMeta.shortName}` : tab.tabLabel,
      implementationDeadline: evaluateStudyTab({ ...tab, method: nextMethod }).recommendedDeadline,
    });
  };

  const applySuggestedMeasures = () => {
    const formatted = result.suggestedMeasures.map((s, idx) => `${idx + 1}. ${s}`).join('\n');
    onChange({
      ...tab,
      correctiveMeasures: tab.correctiveMeasures
        ? `${tab.correctiveMeasures.trim()}\n${formatted}`
        : formatted,
      implementationDeadline: result.recommendedDeadline,
    });
  };

  const insertObservationTemplate = () => {
    const draft = `${catalogItem.justificationTemplate} Tras el relevamiento de la tarea "${tab.taskEvaluated || 'evaluada'}", se obtiene ${result.primaryScoreText} (${result.riskLabel} — ${result.actionLevelText}). ${result.interpretation}`;
    onChange({
      ...tab,
      evaluatorObservations: tab.evaluatorObservations
        ? `${tab.evaluatorObservations.trim()}\n\n${draft}`
        : draft,
    });
  };

  const categories: { key: string; label: string }[] = [
    { key: 'posturas_forzadas', label: 'Carga Postural (Cap. 4)' },
    { key: 'manipulacion_cargas', label: 'Manipulación Manual de Cargas (Cap. 5 y 9)' },
    { key: 'movimientos_repetitivos', label: 'Movimientos Repetitivos (Cap. 6 y 9)' },
    { key: 'ambiente_termico', label: 'Ambiente Térmico (Cap. 7)' },
    { key: 'vibraciones', label: 'Vibraciones Mecánicas (Cap. 8)' },
  ];

  return (
    <div className="space-y-6">
      {/* Cabecera de Pestaña: Identificación de Tarea y Selección Ágil de Método */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-3">
            <label className="block text-xs font-medium text-slate-700 mb-1">Título de la Pestaña</label>
            <input
              type="text"
              value={tab.tabLabel}
              onChange={(e) => onChange({ ...tab, tabLabel: e.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 focus:border-sky-600 focus:outline-none"
            />
          </div>

          <div className="lg:col-span-4">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Subtarea / Operación Específica Evaluada en esta Hoja
            </label>
            <input
              type="text"
              value={tab.taskEvaluated}
              onChange={(e) => onChange({ ...tab, taskEvaluated: e.target.value })}
              placeholder="Ej. Extracción manual de material / Paletizado de cajas..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
            />
          </div>

          <div className="lg:col-span-4">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Método Ergonómico Seleccionado
            </label>
            <select
              value={tab.method}
              onChange={(e) => handleMethodChange(e.target.value as MethodId)}
              className="w-full rounded-md border border-sky-600 bg-sky-50/40 px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-none"
            >
              {categories.map((cat) => (
                <optgroup key={cat.key} label={cat.label}>
                  {METHOD_CATALOG.filter((m) => m.category === cat.key).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.shortName} — {m.fullName.split('—')[1]?.trim() || m.categoryLabel}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="lg:col-span-1 flex justify-end">
            <button
              type="button"
              onClick={onDeleteTab}
              disabled={totalTabs <= 1}
              title={totalTabs <= 1 ? 'Debe existir al menos una pestaña de estudio' : 'Eliminar esta pestaña'}
              className="inline-flex items-center justify-center p-2 rounded-md border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 disabled:opacity-35 cursor-pointer transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Barra de metadatos limpios del método (sin píldoras) */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-sky-700 shrink-0" />
            <span className="font-semibold text-slate-900">{catalogItem.fullName}</span>
            <span>·</span>
            <span>{catalogItem.chapterRef}</span>
            <span>·</span>
            <span>
              {catalogItem.category === 'ambiente_termico'
                ? 'Confort / Estrés Térmico Ambiental (Cap. 7 · No evalúa carga postural)'
                : catalogItem.category === 'vibraciones'
                  ? 'Agentes Físicos / Vibraciones Mecánicas (Cap. 8 · No evalúa carga postural)'
                  : `Jerarquía Biomecánica Cap. 10: Prioridad ${catalogItem.hierarchyOrder}°`}
            </span>
            {isCustomFormula && (
              <>
                <span>·</span>
                <span className="font-semibold text-amber-700">Fórmula personalizada activa</span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenEnvironmentalWorkspace &&
              (catalogItem.category === 'ambiente_termico' || catalogItem.category === 'vibraciones') && (
                <button
                  type="button"
                  onClick={() => onOpenEnvironmentalWorkspace(tab.method)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-amber-700 bg-amber-700 hover:bg-amber-800 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  title="Abrir la pestaña especializada de Confort Térmico (Fanger / WBGT) y Vibraciones con curvas ISO 7730"
                >
                  <Thermometer className="w-3.5 h-3.5" />
                  Abrir Pestaña Térmico · Fanger / Físicos
                </button>
              )}

            {onOpenVideoExtractor &&
              (tab.method === MethodId.NIOSH ||
                tab.method === MethodId.REBA ||
                tab.method === MethodId.RULA ||
                tab.method === MethodId.OWAS ||
                tab.method === MethodId.LMC_295 ||
                tab.method === MethodId.SNOOK) && (
                <button
                  type="button"
                  onClick={onOpenVideoExtractor}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-sky-700 bg-sky-700 hover:bg-sky-800 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  title="Extraer variables geométricas (H, V, D, A) y ángulos desde archivo de video y emitir informe"
                >
                  <Video className="w-3.5 h-3.5" />
                  Extraer desde Video IA
                </button>
              )}

            {onOpenFormulaEditor && (
              <button
                type="button"
                onClick={() => onOpenFormulaEditor(tab.method)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                title="Abrir la pestaña de edición de fórmulas y constantes de este método"
              >
                <Calculator className="w-3.5 h-3.5 text-sky-700" />
                Editar Fórmulas
              </button>
            )}

            {onOpenReference && (
              <button
                type="button"
                onClick={() => onOpenReference(tab.method)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-sky-300 bg-sky-50/90 hover:bg-sky-100 text-xs font-semibold text-sky-900 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                title="Abrir fundamento matemático, fórmulas y tablas de cálculo del libro"
              >
                <BookOpen className="w-3.5 h-3.5 text-sky-700" />
                Fundamento y Tablas
              </button>
            )}

            {(tab.method === MethodId.RULA || tab.method === MethodId.REBA || tab.method === MethodId.OWAS) && (
              <button
                type="button"
                onClick={() => setShowRefPoster(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5 text-sky-700" />
                Ver Lámina Guía Adjunta
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Visor modal opcional de la lámina adjunta /assets/aistudio/image_e0642359.png */}
      {showRefPoster && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">
                  Lámina de Referencia Angular Postural ( Tronco, Cuello, Piernas, Brazo, Antebrazo y Muñeca )
                </h4>
                <p className="text-xs text-slate-500">Material visual de apoyo para valoración goniométrica</p>
              </div>
              <button
                type="button"
                onClick={() => setShowRefPoster(false)}
                className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-auto bg-slate-50 flex justify-center">
              <img
                src="/assets/aistudio/image_e0642359.png"
                alt="Lámina guía de ángulos ergonómicos"
                className="max-w-full h-auto rounded border border-slate-200"
              />
            </div>
          </div>
        </div>
      )}

      {/* Cuerpo Principal: Formulario Interactivo con Guías (8 cols) + Resultado Técnico en Vivo (4 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 space-y-6">
          <PosturalSwitch tab={tab} onChange={onChange} />
          <LoadRepetitiveSwitch tab={tab} namPoints={result.namPoints} onChange={onChange} />
          <EnvironmentFormsSwitch tab={tab} onChange={onChange} />

          {/* Registro Fotográfico y Goniómetro Digital de 3 puntos (solo para métodos biomecánicos/posturales) */}
          {catalogItem.category !== 'ambiente_termico' && catalogItem.category !== 'vibraciones' && (
            <PhotoGoniometer
              photos={tab.photos}
              onChange={(photos) => onChange({ ...tab, photos })}
            />
          )}
        </div>

        {/* Panel Lateral Adherente de Resultados y Desglose Matemático */}
        <aside className="xl:col-span-4 xl:sticky xl:top-20 space-y-4">
          <div className={`rounded-lg border p-5 space-y-3 ${sevStyle.box}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className={`text-xs font-semibold uppercase tracking-wider ${sevStyle.labelText}`}>
                Valoración Instantánea
              </span>
              <span className="text-xs font-mono font-medium opacity-85">{catalogItem.shortName}</span>
            </div>

            <div className={`text-2xl font-bold font-mono tabular-nums tracking-tight ${sevStyle.scoreText}`}>
              {result.primaryScoreText}
            </div>

            {result.secondaryScoreText && (
              <div className="text-xs font-mono tabular-nums opacity-90">{result.secondaryScoreText}</div>
            )}

            <div className="pt-2 border-t border-current/15 space-y-1">
              <div className="text-sm font-semibold">{result.riskLabel}</div>
              <div className="text-xs opacity-90">{result.actionLevelText}</div>
              <div className="text-xs font-medium pt-1">
                Plazo sugerido: <span className="underline">{result.recommendedDeadline}</span>
              </div>
            </div>
          </div>

          {/* Barra de distribución OWAS cuando corresponde */}
          {result.owasDistribution && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2.5">
              <div className="flex items-baseline justify-between">
                <h5 className="text-xs font-semibold text-slate-900">Distribución de Categorías OWAS</h5>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  N = {result.owasDistribution.totalObs}
                </span>
              </div>
              <div className="h-3 w-full rounded overflow-hidden flex bg-slate-100">
                <div style={{ width: `${result.owasDistribution.cat1Pct}%` }} className="bg-emerald-500" />
                <div style={{ width: `${result.owasDistribution.cat2Pct}%` }} className="bg-amber-400" />
                <div style={{ width: `${result.owasDistribution.cat3Pct}%` }} className="bg-orange-500" />
                <div style={{ width: `${result.owasDistribution.cat4Pct}%` }} className="bg-red-600" />
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono tabular-nums text-slate-700">
                <span>Cat. 1: {result.owasDistribution.cat1Pct.toFixed(1)}%</span>
                <span>Cat. 2: {result.owasDistribution.cat2Pct.toFixed(1)}%</span>
                <span>Cat. 3: {result.owasDistribution.cat3Pct.toFixed(1)}%</span>
                <span>Cat. 4: {result.owasDistribution.cat4Pct.toFixed(1)}%</span>
              </div>
            </div>
          )}

          {/* Tabla de Desglose de Fórmulas y Multiplicadores */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-700" />
                <h5 className="text-xs font-semibold text-slate-900">Desarrollo y Variables del Cálculo</h5>
              </div>
              {onOpenReference && (
                <button
                  type="button"
                  onClick={() => onOpenReference(tab.method)}
                  className="text-[11px] font-semibold text-sky-700 hover:text-sky-900 cursor-pointer"
                  title="Abrir fórmulas y tablas de este método en el libro de desarrollo"
                >
                  Ver Fórmulas
                </button>
              )}
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              {result.breakdownRows.map((row, i) => (
                <div
                  key={i}
                  onClick={() => onOpenReference?.(tab.method, row.refKey || row.parameter)}
                  className="py-2 space-y-0.5 rounded hover:bg-sky-50/60 px-1 -mx-1 transition-colors cursor-pointer group"
                  title={`Clic para ver definición y tabla de "${row.parameter}" en el libro`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-slate-600 group-hover:text-sky-800 transition-colors font-medium">
                      {row.parameter}
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-slate-900 text-right group-hover:text-sky-900">
                      {row.value}
                    </span>
                  </div>
                  {row.reference && (
                    <div className="text-[11px] text-slate-400 group-hover:text-sky-600 transition-colors flex items-center justify-between">
                      <span>{row.reference}</span>
                      <span className="text-[10px] text-sky-700 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                        ver fundamento →
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-100 text-xs text-slate-600 leading-relaxed">
              {result.interpretation}
            </div>
          </div>

          {/* Recomendaciones Técnicas Automáticas del Método */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-900">Criterios de Rediseño Sugeridos</span>
              <button
                type="button"
                onClick={applySuggestedMeasures}
                className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Pasar al plan
              </button>
            </div>
            <ul className="space-y-1.5 text-xs text-slate-600 list-disc pl-4">
              {result.suggestedMeasures.map((m, idx) => (
                <li key={idx}>{m}</li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {/* FINAL DE LA HOJA: OBSERVACIONES DEL EVALUADOR Y PLAN DE ACCIÓN ESPECÍFICO */}
      <section className="rounded-lg border border-slate-300 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#edf4fb] -mx-5 -mt-5 px-5 py-3.5 rounded-t-lg border-b border-slate-200">
          <div className="flex items-center gap-2">
            <ClipboardPenLine className="w-4 h-4 text-sky-700" />
            <div>
              <h4 className="text-sm font-semibold text-slate-900">
                Cierre de Hoja — Observaciones del Evaluador y Medidas Correctivas ({tab.tabLabel})
              </h4>
              <p className="text-xs text-slate-600">
                Este bloque se incorpora íntegramente al pie del desarrollo de esta pestaña en los informes PDF y Word
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={insertObservationTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-sky-50 text-xs font-medium text-slate-800 whitespace-nowrap cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-700" />
            Redactar base técnica automática
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-12">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Instrumentos de Medición y Técnica de Relevamiento Empleada
            </label>
            <input
              type="text"
              value={tab.instrumentsUsed}
              onChange={(e) => onChange({ ...tab, instrumentsUsed: e.target.value })}
              placeholder="Goniómetro digital, dinamómetro, cinta métrica, termo-anemómetro, acelerómetro triaxial..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
            />
          </div>

          <div className="lg:col-span-6">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Observaciones Técnicas del Evaluador (Al final de la hoja)
            </label>
            <textarea
              rows={4}
              value={tab.evaluatorObservations}
              onChange={(e) => onChange({ ...tab, evaluatorObservations: e.target.value })}
              placeholder="Consigne hallazgos en campo, particularidades antropométricas, variabilidad del ciclo, percepción del trabajador y valoración profesional..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
            />
          </div>

          <div className="lg:col-span-6">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Medidas Correctivas de Ingeniería / Organizativas Propuestas
            </label>
            <textarea
              rows={4}
              value={tab.correctiveMeasures}
              onChange={(e) => onChange({ ...tab, correctiveMeasures: e.target.value })}
              placeholder="Detalle modificaciones geométricas, ayudas mecánicas, rediseño de herramientas, rotación o régimen de pausas..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
            />
          </div>

          <div className="lg:col-span-6">
            <label className="block text-xs font-medium text-slate-700 mb-1">Responsable de Ejecución / Seguimiento</label>
            <input
              type="text"
              value={tab.responsiblePerson}
              onChange={(e) => onChange({ ...tab, responsiblePerson: e.target.value })}
              placeholder="Ej. Jefatura de Ingeniería de Planta / Higiene y Seguridad"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
            />
          </div>

          <div className="lg:col-span-6">
            <label className="block text-xs font-medium text-slate-700 mb-1">Plazo de Implementación (Criterio Tabla 10.2)</label>
            <select
              value={tab.implementationDeadline}
              onChange={(e) =>
                onChange({
                  ...tab,
                  implementationDeadline: e.target.value as StudyTab['implementationDeadline'],
                })
              }
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-sky-600 focus:outline-none"
            >
              <option value="Inmediato">Inmediato (Riesgo muy alto / inaceptable)</option>
              <option value="Corto plazo">Corto plazo (Riesgo alto / acción prioritaria)</option>
              <option value="Medio plazo">Medio plazo (Riesgo moderado / mejora programada)</option>
              <option value="Sin plazo específico">Sin plazo específico (Riesgo bajo / seguimiento periódico)</option>
            </select>
          </div>
        </div>
      </section>
    </div>
  );
}

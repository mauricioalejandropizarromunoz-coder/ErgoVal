import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Box,
  Calculator,
  CheckCircle2,
  ClipboardPenLine,
  Eye,
  FileDown,
  FileText,
  Film,
  Sparkles,
  Thermometer,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import {
  GeneralStudyData,
  MethodEvaluationResult,
  MethodId,
  RiskSeverity,
  StudyPhoto,
  StudyTab,
} from '../types/ergonomics';
import { evaluateStudyTab } from '../utils/calculations';
import { METHOD_CATALOG } from '../utils/defaults';
import { isMethodFormulaModified } from '../utils/formulaConfig';
import {
  isAvatarReplicaPhoto,
  isBiomechanicalVisualMethod,
  renderMethodAvatarStudyPhotos,
} from '../utils/methodAvatarReportHelper';
import { PhotoGoniometer } from './PhotoGoniometer';
import { EnvironmentFormsSwitch, LoadRepetitiveSwitch, PosturalSwitch } from './MethodFormDispatcher';

interface StudyTabWorkspaceProps {
  tab: StudyTab;
  tabIndex: number;
  totalTabs: number;
  general?: GeneralStudyData;
  onChange: (updated: StudyTab) => void;
  onDeleteTab: () => void;
  onOpenReference?: (methodId: MethodId, query?: string) => void;
  onOpenFormulaEditor?: (methodId: MethodId) => void;
  onOpenVideoExtractor?: () => void;
  onOpenTwinVideoStudio?: () => void;
  onOpenEnvironmentalWorkspace?: (methodId: MethodId) => void;
  onExportTabPdf?: (tab: StudyTab) => Promise<void> | void;
  onExportFullPdf?: () => Promise<void> | void;
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
  general,
  onChange,
  onDeleteTab,
  onOpenReference,
  onOpenFormulaEditor,
  onOpenVideoExtractor,
  onOpenTwinVideoStudio,
  onOpenEnvironmentalWorkspace,
  onExportTabPdf,
  onExportFullPdf,
}: StudyTabWorkspaceProps) {
  const [showRefPoster, setShowRefPoster] = useState(false);
  const [liveAutoAvatarPhotos, setLiveAutoAvatarPhotos] = useState<StudyPhoto[]>([]);
  const [showReportPreview, setShowReportPreview] = useState<boolean>(true);
  const [isPinningAvatar, setIsPinningAvatar] = useState<boolean>(false);

  const catalogItem = METHOD_CATALOG.find((m) => m.id === tab.method)!;
  const result: MethodEvaluationResult = evaluateStudyTab(tab);
  const sevStyle = getSeverityStyles(result.severity);
  const isCustomFormula = isMethodFormulaModified(tab.method);
  const isVisualBiomech = isBiomechanicalVisualMethod(tab.method);

  // Actualizar en vivo las réplicas 3D del Avatar con los ángulos exactos de este método para la Previsualización del Informe
  useEffect(() => {
    if (!isVisualBiomech) {
      setLiveAutoAvatarPhotos([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      renderMethodAvatarStudyPhotos(tab)
        .then((generated) => {
          if (!cancelled) setLiveAutoAvatarPhotos(generated);
        })
        .catch(() => {
          if (!cancelled) setLiveAutoAvatarPhotos([]);
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tab, isVisualBiomech]);

  const realOperatorPhotos = tab.photos.filter((p) => !isAvatarReplicaPhoto(p));
  const attachedAvatarPhotos = tab.photos.filter((p) => isAvatarReplicaPhoto(p));
  const effectivePreviewAvatarPhotos =
    attachedAvatarPhotos.length > 0 ? attachedAvatarPhotos : liveAutoAvatarPhotos;

  const handlePinAvatarPhotosIntoTab = async () => {
    if (!isVisualBiomech) return;
    setIsPinningAvatar(true);
    try {
      const fresh = await renderMethodAvatarStudyPhotos(tab);
      if (fresh.length > 0) {
        onChange({
          ...tab,
          photos: [...realOperatorPhotos, ...fresh],
        });
      }
    } finally {
      setIsPinningAvatar(false);
    }
  };

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

            {onOpenVideoExtractor && isVisualBiomech && (
              <button
                type="button"
                onClick={onOpenVideoExtractor}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-sky-700 bg-sky-700 hover:bg-sky-800 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                title="Extraer posturas de Toma de Carga y Destino o Movimientos Repetitivos desde archivo de vídeo"
              >
                <Video className="w-3.5 h-3.5" />
                Extraer desde Video IA
              </button>
            )}

            {onOpenTwinVideoStudio && isVisualBiomech && (
              <button
                type="button"
                onClick={onOpenTwinVideoStudio}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-emerald-700 bg-emerald-700 hover:bg-emerald-800 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                title="Generar y descargar un Vídeo Mellizo del Avatar 3D copiando la posición exacta de un vídeo subido desde su PC"
              >
                <Film className="w-3.5 h-3.5" />
                Vídeo Mellizo 3D
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
              tab={tab}
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

      {/* PREVISUALIZACIÓN EN VIVO DEL INFORME TÉCNICO DE ESTE MÉTODO (OPERARIO REAL + AVATAR 3D CON ÁNGULOS EXACTOS) */}
      <section className="rounded-lg border border-slate-300 bg-white overflow-hidden">
        <div className="bg-slate-900 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-xs font-mono text-sky-300">
              Previsualización en Vivo de la Hoja en el Informe PDF / Word ({catalogItem.shortName})
            </div>
            <h4 className="text-sm sm:text-base font-bold text-white">
              Vista Previa del Informe Técnico con Fotos de Operario y Réplica Avatar 3D de Ángulos Exactos
            </h4>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isVisualBiomech && (
              <button
                type="button"
                disabled={isPinningAvatar}
                onClick={() => void handlePinAvatarPhotosIntoTab()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
                title="Guarda y actualiza las imágenes del Avatar 3D con los ángulos exactos actuales dentro de esta pestaña"
              >
                <Box className="w-3.5 h-3.5" />
                {isPinningAvatar ? 'Actualizando 3D...' : 'Fijar Fotos Avatar 3D en Pestaña'}
              </button>
            )}

            {onExportTabPdf && (
              <button
                type="button"
                onClick={() => void onExportTabPdf(tab)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-700 text-xs font-semibold text-white cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" />
                Descargar PDF de este Método
              </button>
            )}

            {onExportFullPdf && (
              <button
                type="button"
                onClick={() => void onExportFullPdf()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-600 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-100 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                Exportar Informe Completo
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowReportPreview((v) => !v)}
              className="px-2.5 py-1.5 rounded border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
            >
              {showReportPreview ? 'Contraer' : 'Mostrar Vista Previa'}
            </button>
          </div>
        </div>

        {showReportPreview && (
          <div className="p-5 bg-slate-100/80">
            {/* Hoja Institucional simulando exactamente el folio A4 que se exporta */}
            <div className="max-w-5xl mx-auto rounded border border-slate-300 bg-white p-5 sm:p-6 shadow-xs space-y-5">
              {/* Encabezado del folio */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-3.5 text-xs">
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-900 text-sm">
                    {general?.companyName || 'EMPRESA EVALUADA'} · PUESTO: {general?.workstationName || '-'}
                  </div>
                  <div className="text-slate-600">
                    Sector: {general?.department || '-'} · Evaluador: {general?.evaluatorName || '-'} · Fecha: {general?.reportDate || '-'}
                  </div>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <div className="font-bold text-slate-900">
                    ESTUDIO {tabIndex + 1} DE {totalTabs} · {catalogItem.shortName}
                  </div>
                  <div className="text-slate-500">{catalogItem.chapterRef}</div>
                </div>
              </div>

              {/* Resumen del resultado del método */}
              <div className={`rounded border p-3.5 flex flex-wrap items-center justify-between gap-3 ${sevStyle.box}`}>
                <div>
                  <div className="text-xs font-semibold text-slate-700">
                    Subtarea: {tab.taskEvaluated || 'Ciclo operativo del puesto'}
                  </div>
                  <div className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${sevStyle.scoreText}`}>
                    {result.primaryScoreText}
                    {result.secondaryScoreText ? ` · ${result.secondaryScoreText}` : ''}
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div className="font-bold">{result.riskLabel}</div>
                  <div>{result.actionLevelText}</div>
                  <div className="font-mono mt-0.5">Plazo: {tab.implementationDeadline}</div>
                </div>
              </div>

              {/* Bloque Fotográfico Obligatorio: Operario Real + Avatar 3D con Ángulos Exactos */}
              {isVisualBiomech && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h5 className="text-xs font-bold text-slate-900">
                      Registro Fotográfico del Operario y Réplica Avatar 3D con Ángulos Exactos (Incluido en PDF y Word):
                    </h5>
                    <span className="text-[11px] font-mono text-slate-600 tabular-nums">
                      Fotos Operario: {realOperatorPhotos.length} · Réplicas Avatar 3D: {effectivePreviewAvatarPhotos.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Columna / Tarjetas de Fotos Reales del Operario */}
                    {realOperatorPhotos.length > 0 ? (
                      realOperatorPhotos.map((ph) => (
                        <div key={ph.id} className="rounded border border-slate-300 bg-slate-50 p-3 space-y-2">
                          <div className="text-[11px] font-semibold text-slate-800">
                            Operario Real · {ph.name}
                          </div>
                          <div className="rounded border border-slate-200 bg-white h-56 flex items-center justify-center overflow-hidden">
                            <img
                              src={ph.annotatedDataUrl || ph.dataUrl}
                              alt={ph.caption}
                              className="max-h-full max-w-full object-contain"
                            />
                          </div>
                          <p className="text-[11px] text-slate-600 italic leading-snug">
                            {ph.caption}
                            {ph.annotations.length > 0
                              ? ` | Ángulos medidos: ${ph.annotations.map((a) => `${a.label}: ${a.degrees}°`).join(', ')}`
                              : ''}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded border border-dashed border-amber-400 bg-amber-50/50 p-4 flex flex-col justify-center items-start gap-2 text-xs text-amber-950">
                        <div className="font-bold">
                          Aún no adjuntó fotografía real del operario en esta pestaña
                        </div>
                        <p className="text-[11.5px] leading-relaxed">
                          El informe ya incluye automáticamente la <strong>Réplica del Avatar 3D con ángulos exactos</strong> (a la derecha). Para incluir también la foto real del trabajador, súbala arriba en <em>Cargar Foto Operario</em> o extraiga Toma y Destino desde <em>Extraer desde Video IA</em>.
                        </p>
                        {onOpenVideoExtractor && (
                          <button
                            type="button"
                            onClick={onOpenVideoExtractor}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold cursor-pointer"
                          >
                            <Video className="w-3.5 h-3.5" />
                            Extraer Fotos Reales + Avatar desde Vídeo
                          </button>
                        )}
                      </div>
                    )}

                    {/* Tarjetas de Réplica Avatar 3D con Ángulos Exactos */}
                    {effectivePreviewAvatarPhotos.map((av) => (
                      <div key={av.id} className="rounded border border-sky-300 bg-sky-50/30 p-3 space-y-2">
                        <div className="text-[11px] font-semibold text-sky-950">
                          {av.name}
                        </div>
                        <div className="rounded border border-slate-200 bg-white h-56 flex items-center justify-center overflow-hidden">
                          <img
                            src={av.annotatedDataUrl || av.dataUrl}
                            alt={av.caption}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <p className="text-[11px] text-slate-700 font-mono leading-snug">
                          {av.caption}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resumen compacto de variables del método que irán en la tabla del informe */}
              <div className="overflow-x-auto border border-slate-200 rounded">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="py-1.5 px-3 font-semibold">Parámetro / Factor del Método</th>
                      <th className="py-1.5 px-3 font-semibold">Valor Calculado</th>
                      <th className="py-1.5 px-3 font-semibold">Referencia Normativa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {result.breakdownRows.slice(0, 6).map((r, idx) => (
                      <tr key={idx} className="odd:bg-white even:bg-slate-50/70">
                        <td className="py-1.5 px-3 font-medium text-slate-800">{r.parameter}</td>
                        <td className="py-1.5 px-3 font-mono font-semibold tabular-nums text-slate-900">
                          {r.value}
                        </td>
                        <td className="py-1.5 px-3 text-slate-500">{r.reference || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pie de observaciones y medidas en la vista previa */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs border-t border-slate-200 pt-3">
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="font-semibold text-slate-900 mb-1">Observaciones en el Informe:</div>
                  <p className="text-slate-700 whitespace-pre-line line-clamp-4">
                    {tab.evaluatorObservations.trim() || result.interpretation}
                  </p>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="font-semibold text-slate-900 mb-1">Medidas Correctivas en el Informe:</div>
                  <p className="text-slate-700 whitespace-pre-line line-clamp-4">
                    {tab.correctiveMeasures.trim() ||
                      result.suggestedMeasures.map((s, i) => `${i + 1}. ${s}`).join('\n')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

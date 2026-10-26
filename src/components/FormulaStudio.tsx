import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Calculator,
  CheckCircle2,
  Download,
  RotateCcw,
  Search,
  Sliders,
  Upload,
  X,
} from 'lucide-react';
import { MethodId, RiskCategory, RiskSeverity, StudyTab } from '../types/ergonomics';
import { METHOD_CATALOG, createNewStudyTab } from '../utils/defaults';
import { evaluateStudyTab } from '../utils/calculations';
import {
  MethodFormulaProfile,
  countModifiedFormulaMethods,
  exportFormulaOverridesJson,
  getAllFormulaProfiles,
  importFormulaOverridesJson,
  isMethodFormulaModified,
  resetAllFormulaProfiles,
  resetMethodFormulaProfile,
  subscribeFormulaChanges,
  updateMethodExpression,
  updateMethodFormulaSummary,
  updateMethodParameter,
  validateFormulaExpression,
} from '../utils/formulaConfig';

interface FormulaStudioProps {
  initialMethodId?: MethodId;
  tabs?: StudyTab[];
  onBackToEvaluator: () => void;
  onOpenReference?: (methodId: MethodId) => void;
  onNotify?: (msg: string) => void;
}

const CATEGORY_FILTERS: { id: 'all' | RiskCategory; label: string }[] = [
  { id: 'all', label: 'Todos (15)' },
  { id: 'posturas_forzadas', label: 'Postural' },
  { id: 'manipulacion_cargas', label: 'Cargas' },
  { id: 'movimientos_repetitivos', label: 'Repetitivo' },
  { id: 'ambiente_termico', label: 'Térmico' },
  { id: 'vibraciones', label: 'Vibraciones' },
];

function getSeverityTextColor(severity: RiskSeverity): string {
  switch (severity) {
    case 'muy_alto':
      return 'text-red-700';
    case 'alto':
      return 'text-orange-700';
    case 'moderado':
      return 'text-amber-700';
    default:
      return 'text-emerald-700';
  }
}

export const FormulaStudio: React.FC<FormulaStudioProps> = ({
  initialMethodId = MethodId.RULA,
  tabs = [],
  onBackToEvaluator,
  onOpenReference,
  onNotify,
}) => {
  const [selectedMethodId, setSelectedMethodId] = useState<MethodId>(initialMethodId);
  const [categoryFilter, setCategoryFilter] = useState<'all' | RiskCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const [confirmResetAll, setConfirmResetAll] = useState(false);

  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelectedMethodId(initialMethodId);
  }, [initialMethodId]);

  useEffect(() => {
    const unsub = subscribeFormulaChanges(() => {
      setRevision((r) => r + 1);
    });
    return unsub;
  }, []);

  const allProfiles = useMemo(() => {
    void revision;
    return getAllFormulaProfiles();
  }, [revision]);

  const modifiedCount = useMemo(() => {
    void revision;
    return countModifiedFormulaMethods();
  }, [revision]);

  const filteredMethods = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return METHOD_CATALOG.filter((m) => {
      if (categoryFilter !== 'all' && m.category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      const prof = allProfiles[m.id];
      const exprText = prof.expressions.map((e) => `${e.label} ${e.symbol} ${e.expression}`).join(' ');
      const paramText = prof.parameters.map((p) => `${p.label} ${p.symbol}`).join(' ');
      return (
        m.shortName.toLowerCase().includes(q) ||
        m.fullName.toLowerCase().includes(q) ||
        m.chapterRef.toLowerCase().includes(q) ||
        exprText.toLowerCase().includes(q) ||
        paramText.toLowerCase().includes(q)
      );
    });
  }, [categoryFilter, searchQuery, allProfiles]);

  const activeCatalogMeta = useMemo(
    () => METHOD_CATALOG.find((m) => m.id === selectedMethodId) || METHOD_CATALOG[0],
    [selectedMethodId],
  );

  const activeProfile: MethodFormulaProfile = allProfiles[activeCatalogMeta.id];
  const isCurrentMethodModified = isMethodFormulaModified(activeCatalogMeta.id);

  // Build map of parameter values so expression validation has access to all method constants
  const parameterVarsMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of activeProfile.parameters) {
      map[p.key] = p.value;
      map[p.symbol] = p.value;
    }
    return map;
  }, [activeProfile]);

  // Evaluate live simulation either on a matching active study tab or a standard sample tab for this method
  const matchingStudyTab = useMemo(
    () => tabs.find((t) => t.method === activeCatalogMeta.id),
    [tabs, activeCatalogMeta.id],
  );

  const sampleTab = useMemo(
    () => matchingStudyTab || createNewStudyTab(1, activeCatalogMeta.id, 'Simulación de calibración matemática'),
    [matchingStudyTab, activeCatalogMeta.id],
  );

  const liveSimulationResult = useMemo(() => {
    void revision;
    return evaluateStudyTab(sampleTab);
  }, [sampleTab, revision]);

  const handleExportFormulas = () => {
    const jsonText = exportFormulaOverridesJson();
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'formulas_metodos_ergoeval.json';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    onNotify?.('Archivo JSON de fórmulas de métodos exportado correctamente.');
  };

  const handleImportFormulas = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const outcome = importFormulaOverridesJson(String(reader.result || ''));
      onNotify?.(outcome.message);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAppendVariableToExpression = (exprKey: string, currentExpr: string, varName: string) => {
    const trimmed = currentExpr.trimEnd();
    const needsSpace = trimmed.length > 0 && !/[+\-*/^,(]$/.test(trimmed);
    const next = needsSpace ? `${trimmed} * ${varName}` : `${trimmed}${varName}`;
    updateMethodExpression(activeCatalogMeta.id, exprKey, next);
  };

  return (
    <div className="space-y-5">
      {/* CABECERA DEL EDITOR DE FÓRMULAS */}
      <section className="bg-white border border-slate-300 rounded-lg p-4 sm:p-5 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="font-semibold text-sky-800">Motor Matemático Editable</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">15 Métodos Ergonómicos</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {modifiedCount > 0
                  ? `${modifiedCount} método(s) con fórmulas personalizadas`
                  : 'Valores normativos originales activos'}
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Fórmulas, Multiplicadores y Umbrales de Cálculo por Método
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-4xl leading-relaxed">
              Visualice y modifique las ecuaciones algebraicas, constantes físicas y puntos de corte de cada método.
              Todo cambio recalcula al instante las pestañas de estudio, el Resumen Automático y los informes exportados en PDF y Word.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              onChange={handleImportFormulas}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-sky-700" />
              Importar Fórmulas JSON
            </button>

            <button
              type="button"
              onClick={handleExportFormulas}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-sky-700" />
              Exportar Fórmulas JSON
            </button>

            {confirmResetAll ? (
              <div className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    resetAllFormulaProfiles();
                    setConfirmResetAll(false);
                    onNotify?.('Se restauraron las fórmulas originales de los 15 métodos.');
                  }}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-red-700 hover:bg-red-800 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Confirmar restauración total
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmResetAll(false)}
                  className="inline-flex items-center px-2.5 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={modifiedCount === 0}
                onClick={() => setConfirmResetAll(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-45 text-xs font-medium text-slate-800 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
                Restaurar los 15 Métodos
              </button>
            )}

            <button
              type="button"
              onClick={onBackToEvaluator}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Volver a ErgoEval
            </button>
          </div>
        </div>

        {/* Barra sintáctica rápida */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <div>
            <span className="font-semibold text-slate-800">Sintaxis soportada:</span>{' '}
            <code className="font-mono text-[11px] text-slate-800">
              +  -  *  /  ^  ( )  &lt;  &lt;=  &gt;  &gt;=  ==  !=
            </code>
            <span className="mx-2 text-slate-300">·</span>
            <span className="font-semibold text-slate-800">Funciones:</span>{' '}
            <code className="font-mono text-[11px] text-slate-800">
              min(a,b), max(a,b), abs(x), sqrt(x), exp(x), ln(x), log10(x), pow(a,b), round(x), clamp(v,min,max), ifelse(cond,si,no)
            </code>
          </div>
        </div>
      </section>

      {/* CUERPO PRINCIPAL: SELECTOR DE 15 MÉTODOS (IZQUIERDA) + PANEL DE EDICIÓN (DERECHA) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* COLUMNA IZQUIERDA: ÍNDICE DE LOS 15 MÉTODOS */}
        <aside className="lg:col-span-4 xl:col-span-3 bg-white border border-slate-300 rounded-lg overflow-hidden">
          <div className="p-3.5 border-b border-slate-200 space-y-3 bg-slate-50">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar método, variable o constante..."
                className="w-full pl-9 pr-8 py-1.5 text-xs rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-sky-600"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1">
              {CATEGORY_FILTERS.map((cat) => {
                const active = categoryFilter === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryFilter(cat.id)}
                    className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer border transition-colors ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="divide-y divide-slate-200 max-h-[680px] overflow-y-auto">
            {filteredMethods.map((m) => {
              const isSelected = m.id === activeCatalogMeta.id;
              const modified = isMethodFormulaModified(m.id);
              const prof = allProfiles[m.id];

              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMethodId(m.id)}
                  className={`w-full text-left px-3.5 py-2.5 transition-colors cursor-pointer block ${
                    isSelected ? 'bg-sky-50/90' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-bold ${isSelected ? 'text-sky-900' : 'text-slate-900'}`}>
                      {m.shortName}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500">
                      {prof.expressions.length} ec. · {prof.parameters.length} const.
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5 text-[11px] text-slate-600">
                    <span className="truncate">{m.categoryLabel}</span>
                    {modified ? (
                      <span className="font-semibold text-amber-700 shrink-0">Modificada</span>
                    ) : (
                      <span className="text-slate-400 shrink-0">{m.chapterRef.split('·')[0].trim()}</span>
                    )}
                  </div>
                </button>
              );
            })}

            {filteredMethods.length === 0 && (
              <div className="p-6 text-center text-xs text-slate-500 space-y-2">
                <p>Ningún método coincide con el filtro aplicado.</p>
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter('all');
                    setSearchQuery('');
                  }}
                  className="text-sky-700 font-semibold underline cursor-pointer"
                >
                  Mostrar los 15 métodos
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* COLUMNA DERECHA: EDITOR DETALLADO DEL MÉTODO SELECCIONADO */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-5">
          {/* FICHA SUPERIOR DEL MÉTODO + SIMULACIÓN EN VIVO */}
          <section className="bg-white border border-slate-300 rounded-lg p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span>{activeCatalogMeta.chapterRef}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeCatalogMeta.categoryLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span className={isCurrentMethodModified ? 'font-semibold text-amber-700' : 'text-emerald-700 font-medium'}>
                    {isCurrentMethodModified ? 'Formulación personalizada activa' : 'Formulación estándar del libro'}
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">{activeCatalogMeta.fullName}</h2>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {onOpenReference && (
                  <button
                    type="button"
                    onClick={() => onOpenReference(activeCatalogMeta.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-sky-700" />
                    Ver Tablas del Libro
                  </button>
                )}

                <button
                  type="button"
                  disabled={!isCurrentMethodModified}
                  onClick={() => {
                    resetMethodFormulaProfile(activeCatalogMeta.id);
                    onNotify?.(`Se restauraron las fórmulas originales de ${activeCatalogMeta.shortName}.`);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-sky-700" />
                  Restaurar {activeCatalogMeta.shortName}
                </button>
              </div>
            </div>

            {/* Verificación numérica en tiempo real sobre pestaña activa o caso testigo */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">
                  Resultado en vivo con la formulación actual (
                  {matchingStudyTab
                    ? `Pestaña activa: "${matchingStudyTab.tabLabel}"`
                    : 'Caso testigo de calibración'}
                  )
                </span>
                <span className="font-mono tabular-nums text-slate-500">Recálculo automático instantáneo</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <span className="block text-xs text-slate-500">Indicador Principal</span>
                  <span className="text-base font-bold font-mono tabular-nums text-slate-900">
                    {liveSimulationResult.primaryScoreText}
                  </span>
                </div>
                <div>
                  <span className="block text-xs text-slate-500">Desglose / Secundario</span>
                  <span className="text-xs font-mono tabular-nums text-slate-800 block mt-0.5">
                    {liveSimulationResult.secondaryScoreText || '—'}
                  </span>
                </div>
                <div>
                  <span className="block text-xs text-slate-500">Diagnóstico de Riesgo</span>
                  <span className={`text-sm font-bold block mt-0.5 ${getSeverityTextColor(liveSimulationResult.severity)}`}>
                    {liveSimulationResult.riskLabel}
                  </span>
                </div>
                <div>
                  <span className="block text-xs text-slate-500">Nivel de Acción y Plazo</span>
                  <span className="text-xs font-medium text-slate-800 block mt-0.5">
                    {liveSimulationResult.actionLevelText} · {liveSimulationResult.recommendedDeadline}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* SECCIÓN 1: ECUACIONES ALGEBRAICAS EDITABLES */}
          <section className="bg-white border border-slate-300 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-sky-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  1. Ecuaciones Algebraicas de Cálculo ({activeProfile.expressions.length})
                </h3>
              </div>
              <span className="text-xs text-slate-600">
                Haga clic sobre una variable para insertarla o escriba cualquier expresión matemática válida
              </span>
            </div>

            <div className="divide-y divide-slate-200">
              {activeProfile.expressions.map((expr) => {
                const isEdited = expr.expression.trim() !== expr.defaultExpression.trim();
                const validation = validateFormulaExpression(expr.expression, expr.variables, parameterVarsMap);

                return (
                  <div key={expr.key} className="p-5 space-y-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">{expr.label}</span>
                          <span className="text-xs font-mono text-sky-800 tabular-nums">
                            ({expr.symbol}
                            {expr.unit ? ` · ${expr.unit}` : ''})
                          </span>
                          {isEdited && (
                            <span className="text-xs font-semibold text-amber-700">· Ecuación modificada</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600">{expr.description}</p>
                      </div>

                      {isEdited && (
                        <button
                          type="button"
                          onClick={() => updateMethodExpression(activeCatalogMeta.id, expr.key, expr.defaultExpression)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Restaurar ecuación original
                        </button>
                      )}
                    </div>

                    {/* Campo de entrada algebraica */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <span className="font-mono text-xs sm:text-sm font-bold text-slate-700 shrink-0 tabular-nums">
                        {expr.symbol} =
                      </span>
                      <input
                        type="text"
                        value={expr.expression}
                        onChange={(e) => updateMethodExpression(activeCatalogMeta.id, expr.key, e.target.value)}
                        spellCheck={false}
                        className={`flex-1 rounded-md border px-3 py-2 font-mono text-xs sm:text-sm tabular-nums text-slate-900 focus:outline-none ${
                          validation.valid
                            ? 'border-slate-300 bg-slate-50/60 focus:bg-white focus:border-sky-600'
                            : 'border-red-400 bg-red-50/40 focus:border-red-600'
                        }`}
                      />
                    </div>

                    {/* Estado de validación y valor de muestra */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      {validation.valid ? (
                        <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span className="font-mono tabular-nums">
                            Ecuación válida · Muestra ={' '}
                            {Number.isInteger(validation.sampleResult)
                              ? validation.sampleResult
                              : validation.sampleResult?.toFixed(4)}
                            {expr.unit ? ` ${expr.unit}` : ''}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-red-700 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>{validation.error}</span>
                        </div>
                      )}

                      {isEdited && (
                        <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                          Original: {expr.defaultExpression}
                        </span>
                      )}
                    </div>

                    {/* Variables disponibles de entrada */}
                    {expr.variables.length > 0 && (
                      <div className="pt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                        <span className="font-semibold text-slate-700">Variables de entrada:</span>
                        {expr.variables.map((v) => (
                          <button
                            key={v.name}
                            type="button"
                            onClick={() => handleAppendVariableToExpression(expr.key, expr.expression, v.name)}
                            title={`${v.description} (Valor muestra: ${v.sampleValue})`}
                            className="px-2 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-sky-50 hover:border-sky-300 font-mono tabular-nums text-slate-800 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                          >
                            {v.name} ({v.sampleValue})
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* SECCIÓN 2: CONSTANTES Y UMBRALES NUMÉRICOS DE CORTE */}
          <section className="bg-white border border-slate-300 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-sky-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  2. Constantes Normativas y Umbrales de Riesgo ({activeProfile.parameters.length})
                </h3>
              </div>
              <span className="text-xs text-slate-600">
                También pueden referenciarse por símbolo dentro de las ecuaciones superiores
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700">
                    <th className="py-2.5 px-4 font-semibold">Parámetro / Umbral</th>
                    <th className="py-2.5 px-4 font-semibold w-36">Símbolo</th>
                    <th className="py-2.5 px-4 font-semibold w-44 text-right">Valor Activo</th>
                    <th className="py-2.5 px-4 font-semibold w-32 text-right">Valor Libro</th>
                    <th className="py-2.5 px-4 font-semibold w-28 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {activeProfile.parameters.map((param) => {
                    const isParamModified = Math.abs(param.value - param.defaultValue) > 1e-9;
                    return (
                      <tr key={param.key} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-4">
                          <div className="font-semibold text-slate-900">{param.label}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{param.description}</div>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-sky-900 tabular-nums">{param.symbol}</td>
                        <td className="py-2.5 px-4 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <input
                              type="number"
                              min={param.min}
                              max={param.max}
                              step={param.step}
                              value={param.value}
                              onChange={(e) => {
                                const parsed = parseFloat(e.target.value);
                                if (Number.isFinite(parsed)) {
                                  updateMethodParameter(activeCatalogMeta.id, param.key, parsed);
                                }
                              }}
                              className={`w-28 text-right rounded border px-2.5 py-1 font-mono text-xs tabular-nums text-slate-900 focus:outline-none ${
                                isParamModified
                                  ? 'border-amber-400 bg-amber-50/40 focus:border-amber-600'
                                  : 'border-slate-300 bg-white focus:border-sky-600'
                              }`}
                            />
                            {param.unit && (
                              <span className="text-[11px] font-mono text-slate-500 w-10 text-left truncate">
                                {param.unit}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                          {param.defaultValue}
                          {param.unit ? ` ${param.unit}` : ''}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {isParamModified ? (
                            <button
                              type="button"
                              onClick={() =>
                                updateMethodParameter(activeCatalogMeta.id, param.key, param.defaultValue)
                              }
                              className="text-sky-700 hover:text-sky-900 font-semibold underline whitespace-nowrap cursor-pointer"
                            >
                              Restaurar
                            </button>
                          ) : (
                            <span className="text-slate-400">Original</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* SECCIÓN 3: SÍNTESIS FORMAL IMPRESA EN INFORMES PDF / WORD Y MANUAL */}
          <section className="bg-white border border-slate-300 rounded-lg p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  3. Síntesis Matemática Descriptiva (Informes PDF, Word y Biblioteca)
                </h3>
                <p className="text-xs text-slate-600">
                  Este bloque documental se inserta en la tabla técnica de cada estudio exportado y en el Manual PDF.
                </p>
              </div>

              {activeProfile.formulaSummary.trim() !== activeProfile.defaultFormulaSummary.trim() && (
                <button
                  type="button"
                  onClick={() =>
                    updateMethodFormulaSummary(activeCatalogMeta.id, activeProfile.defaultFormulaSummary)
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restaurar síntesis original
                </button>
              )}
            </div>

            <textarea
              rows={4}
              value={activeProfile.formulaSummary}
              onChange={(e) => updateMethodFormulaSummary(activeCatalogMeta.id, e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-slate-50/50 focus:bg-white p-3 font-mono text-xs text-slate-900 leading-relaxed focus:border-sky-600 focus:outline-none"
            />
          </section>
        </div>
      </div>
    </div>
  );
};

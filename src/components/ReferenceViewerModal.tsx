import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Calculator,
  FileDown,
  Layers,
  Search,
  Sliders,
  TableProperties,
  X,
} from 'lucide-react';
import { MethodId } from '../types/ergonomics';
import { getEffectiveMethodReference, BOOK_METADATA } from '../utils/referenceData';
import { METHOD_CATALOG } from '../utils/defaults';
import { isMethodFormulaModified } from '../utils/formulaConfig';

interface ReferenceViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMethodId?: MethodId;
  initialQuery?: string;
  onDownloadManualPdf: () => void;
  onOpenFormulaEditor?: (methodId: MethodId) => void;
}

export function ReferenceViewerModal({
  isOpen,
  onClose,
  initialMethodId = MethodId.RULA,
  initialQuery = '',
  onDownloadManualPdf,
  onOpenFormulaEditor,
}: ReferenceViewerModalProps) {
  const [selectedMethodId, setSelectedMethodId] = useState<MethodId>(initialMethodId);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<'formulas' | 'variables' | 'tablas' | 'ejemplo'>('formulas');

  useEffect(() => {
    if (isOpen) {
      setSelectedMethodId(initialMethodId);
      setSearchQuery(initialQuery);
    }
  }, [isOpen, initialMethodId, initialQuery]);

  if (!isOpen) return null;

  const currentRef = getEffectiveMethodReference(selectedMethodId);
  const isCustomFormula = isMethodFormulaModified(selectedMethodId);

  // Filtro si hay búsqueda activa
  const filteredVariables = currentRef.variables.filter((v) =>
    searchQuery
      ? `${v.name} ${v.meaning} ${v.formulaOrValues} ${v.impactOnResult}`.toLowerCase().includes(searchQuery.toLowerCase())
      : true,
  );

  const filteredTables = currentRef.tables.filter((t) =>
    searchQuery
      ? `${t.tableNumber} ${t.title} ${t.description}`.toLowerCase().includes(searchQuery.toLowerCase())
      : true,
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/65 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-xl border border-slate-300 max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Encabezado del Modal */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-4 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-sky-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold truncate leading-tight">
                Biblioteca Técnica de Métodos y Archivo de Desarrollo
              </h3>
              <p className="text-xs text-sky-200 truncate mt-0.5">
                Fundamentos matemáticos y tablas de cálculo de Mauricio Alejandro Pizarro Muñoz
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onDownloadManualPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium cursor-pointer transition-colors"
            >
              <FileDown className="w-3.5 h-3.5" />
              Descargar Manual Completo (PDF)
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors"
              title="Cerrar ventana"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Barra de Búsqueda y Selector de Método */}
        <div className="p-4 bg-slate-100/90 border-b border-slate-200 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar variable, tabla (ej. HM, Tabla 5.1, Borg, RULA)..."
                className="w-full pl-9 pr-3 py-1.5 rounded-md border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:border-sky-600"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">Método:</span>
            <select
              value={selectedMethodId}
              onChange={(e) => {
                setSelectedMethodId(e.target.value as MethodId);
                setSearchQuery('');
              }}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-600"
            >
              {METHOD_CATALOG.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.shortName} — {m.categoryLabel}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Pestañas de Vista Rápida */}
        <div className="flex items-center gap-2 px-5 pt-3 bg-white border-b border-slate-200 overflow-x-auto text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('formulas')}
            className={`pb-2.5 px-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'formulas'
                ? 'border-sky-600 text-sky-700 font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calculator className="w-3.5 h-3.5 inline mr-1.5" />
            Formulación y Criterio
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('variables')}
            className={`pb-2.5 px-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'variables'
                ? 'border-sky-600 text-sky-700 font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5 inline mr-1.5" />
            Efecto de Cada Variable ({currentRef.variables.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tablas')}
            className={`pb-2.5 px-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'tablas'
                ? 'border-sky-600 text-sky-700 font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <TableProperties className="w-3.5 h-3.5 inline mr-1.5" />
            Tablas del Libro ({currentRef.tables.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ejemplo')}
            className={`pb-2.5 px-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'ejemplo'
                ? 'border-sky-600 text-sky-700 font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 inline mr-1.5" />
            Ejemplo Resuelto del Libro
          </button>
        </div>

        {/* Contenido Desplazable del Modal */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 bg-slate-50/50 text-slate-800 text-xs">
          {/* Ficha Resumen de Ubicación en el Libro */}
          <div className="p-3.5 rounded-lg border border-slate-200 bg-white space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold text-sm text-slate-900">{currentRef.fullName}</span>
              <span className="text-[11px] font-mono text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                {currentRef.chapter}
              </span>
            </div>
            <p className="text-slate-600 text-xs">{currentRef.normativeContext}</p>
          </div>

          {activeTab === 'formulas' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-slate-200 bg-white space-y-2">
                <h4 className="font-semibold text-sm text-slate-900">Fundamento Biomecánico del Método</h4>
                <p className="text-slate-700 leading-relaxed">{currentRef.conceptualBasis}</p>
              </div>

              <div className="p-4 rounded-lg border border-slate-200 bg-white space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-sm text-slate-900">Formulación Matemática Activa</h4>
                    {isCustomFormula && (
                      <span className="text-xs font-semibold text-amber-700">· Personalizada</span>
                    )}
                  </div>
                  {onOpenFormulaEditor && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenFormulaEditor(selectedMethodId);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-sky-300 bg-sky-50 hover:bg-sky-100 text-xs font-semibold text-sky-900 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                    >
                      <Sliders className="w-3.5 h-3.5 text-sky-700" />
                      Modificar Fórmulas de este Método
                    </button>
                  )}
                </div>
                <div className="p-3 rounded-md bg-slate-900 text-sky-200 font-mono text-xs whitespace-pre-line leading-relaxed">
                  {currentRef.formulaSummary}
                </div>
              </div>

              <div className="p-4 rounded-lg border border-slate-200 bg-white space-y-2.5">
                <h4 className="font-semibold text-sm text-slate-900">Niveles de Actuación y Criterios de Corte</h4>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                        <th className="py-2 px-3 font-semibold">Nivel</th>
                        <th className="py-2 px-3 font-semibold">Rango / Puntos</th>
                        <th className="py-2 px-3 font-semibold">Diagnóstico</th>
                        <th className="py-2 px-3 font-semibold">Acción y Medida</th>
                        <th className="py-2 px-3 font-semibold">Plazo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {currentRef.actionLevels.map((al, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-semibold text-slate-900">{al.level}</td>
                          <td className="py-2 px-3 font-mono tabular-nums">{al.scoreRange}</td>
                          <td className="py-2 px-3">{al.risk}</td>
                          <td className="py-2 px-3">{al.action}</td>
                          <td className="py-2 px-3 font-medium text-slate-700">{al.deadline}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-4 rounded-lg border border-sky-200 bg-sky-50/70 text-xs text-sky-950 space-y-1">
                <span className="font-semibold block">Criterio Profesional del Autor (Lic. Mauricio Pizarro):</span>
                <p className="leading-relaxed">{currentRef.authorNotes}</p>
              </div>
            </div>
          )}

          {activeTab === 'variables' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                Esta sección describe qué significa cada variable o dato que el usuario selecciona en la pantalla y cómo afecta matemáticamente al resultado final y al nivel de riesgo:
              </p>

              <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white overflow-hidden">
                {filteredVariables.map((v, idx) => (
                  <div key={idx} className="p-4 space-y-1.5 hover:bg-slate-50/70 transition-colors">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold text-sm text-slate-900">{v.name}</span>
                      <span className="font-mono text-xs text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                        {v.variable}
                      </span>
                    </div>
                    <p className="text-slate-700">
                      <strong className="text-slate-900">Significado:</strong> {v.meaning}
                    </p>
                    <p className="text-slate-700">
                      <strong className="text-slate-900">Valores / Rangos:</strong> <span className="font-mono">{v.formulaOrValues}</span>
                    </p>
                    <div className="p-2.5 rounded bg-emerald-50/80 border border-emerald-200 text-emerald-950 mt-1">
                      <strong>Impacto sobre el Resultado Final:</strong> {v.impactOnResult}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'tablas' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                Tablas citadas y digitalizadas desde el archivo de desarrollo del libro:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredTables.map((t, idx) => (
                  <div key={idx} className="p-4 rounded-lg border border-slate-200 bg-white space-y-2">
                    <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 pb-1.5">
                      <span className="font-bold text-sky-800 text-xs">{t.tableNumber}</span>
                      <span className="font-semibold text-slate-900 text-xs">{t.title}</span>
                    </div>
                    <p className="text-slate-700 leading-relaxed">{t.description}</p>
                    {t.keyValues && (
                      <div className="text-[11px] font-mono text-slate-600 bg-slate-50 p-2 rounded border border-slate-200">
                        {t.keyValues}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'ejemplo' && (
            <div className="p-5 rounded-lg border border-slate-200 bg-white space-y-4">
              <div className="border-b border-slate-100 pb-2">
                <span className="text-xs font-semibold text-sky-700 uppercase tracking-wider block">
                  Caso Resuelto del Libro
                </span>
                <h4 className="text-base font-bold text-slate-900 mt-0.5">{currentRef.workedExample.title}</h4>
              </div>

              <div className="space-y-1">
                <span className="font-semibold text-slate-900 block">Descripción de la Tarea:</span>
                <p className="text-slate-700">{currentRef.workedExample.description}</p>
              </div>

              <div className="space-y-1">
                <span className="font-semibold text-slate-900 block">Datos de Entrada Relevados:</span>
                <div className="p-2.5 rounded bg-slate-100 text-slate-800 font-mono text-xs">
                  {currentRef.workedExample.inputs}
                </div>
              </div>

              <div className="space-y-1">
                <span className="font-semibold text-slate-900 block">Desarrollo Matemático:</span>
                <div className="p-3 rounded bg-slate-900 text-sky-200 font-mono text-xs whitespace-pre-line leading-relaxed">
                  {currentRef.workedExample.calculations}
                </div>
              </div>

              <div className="p-3 rounded-md bg-amber-50 border border-amber-300 text-amber-950 font-semibold text-xs">
                Resultado: {currentRef.workedExample.finalScore}
              </div>

              <div className="space-y-1">
                <span className="font-semibold text-slate-900 block">Conclusión Técnica del Autor:</span>
                <p className="text-slate-700">{currentRef.workedExample.conclusion}</p>
              </div>
            </div>
          )}
        </div>

        {/* Pie del Modal con Advertencia y Copyright */}
        <div className="px-5 py-3 bg-slate-100 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div>
            <span className="font-semibold text-slate-900">{BOOK_METADATA.copyright}</span>
            <span className="hidden sm:inline"> — Obra de referencia: {BOOK_METADATA.title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white font-medium cursor-pointer"
          >
            Cerrar Explorador
          </button>
        </div>
      </div>
    </div>
  );
}

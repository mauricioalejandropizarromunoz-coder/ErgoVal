import React, { useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileDown,
  Info,
  Lock,
  Scale,
  ShieldAlert,
  Sliders,
  Sparkles,
  X,
} from 'lucide-react';
import { PROFESSIONAL_DISCLAIMER_TEXT, COPYRIGHT_NOTICE } from '../utils/reportExport';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenReference: () => void;
  onOpenDisplayControls: () => void;
  onDownloadManualPdf: () => void;
}

export function AboutModal({
  isOpen,
  onClose,
  onOpenReference,
  onOpenDisplayControls,
  onDownloadManualPdf,
}: AboutModalProps) {
  const [activeTab, setActiveTab] = useState<'link' | 'disclaimer' | 'author'>('link');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/65 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-xl border border-slate-300 max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Encabezado */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold leading-tight">
                Información Técnica, Legal y Aviso del Enlace
              </h3>
              <p className="text-xs text-sky-200 mt-0.5">
                ErgoEval · Autoría de Mauricio Alejandro Pizarro Muñoz
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pestañas de navegación */}
        <div className="flex border-b border-slate-200 bg-slate-100 text-xs font-medium text-slate-700">
          <button
            type="button"
            onClick={() => setActiveTab('link')}
            className={`flex-1 py-3 px-3 text-center border-b-2 transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'link'
                ? 'border-sky-600 text-sky-900 bg-white font-semibold'
                : 'border-transparent hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Aviso del Enlace Compartido
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('disclaimer')}
            className={`flex-1 py-3 px-3 text-center border-b-2 transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'disclaimer'
                ? 'border-sky-600 text-sky-900 bg-white font-semibold'
                : 'border-transparent hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Scale className="w-3.5 h-3.5 text-sky-700" />
            Responsabilidad Profesional
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('author')}
            className={`flex-1 py-3 px-3 text-center border-b-2 transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'author'
                ? 'border-sky-600 text-sky-900 bg-white font-semibold'
                : 'border-transparent hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
            Autoría y Copyright
          </button>
        </div>

        {/* Contenido según pestaña */}
        <div className="p-6 space-y-4 text-xs text-slate-700 overflow-y-auto leading-relaxed max-h-[70vh]">
          {activeTab === 'link' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-amber-300 bg-amber-50/80 space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
                  <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
                  ¿Por qué aparece un cartel de advertencia al abrir el enlace compartido?
                </div>
                <p className="text-amber-950">
                  Cuando compartes la dirección de prueba generada en Google AI Studio (con dominio{' '}
                  <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900">
                    https://ais-pre-*.run.app
                  </code>
                  ), Google Cloud muestra por seguridad un cartel intersticial indicando que se trata de un{' '}
                  <strong>«entorno de prueba o aplicación experimental desarrollada por un tercero»</strong>.
                </p>
              </div>

              <div className="space-y-2.5">
                <h4 className="text-sm font-semibold text-slate-900">1. Causa técnica del aviso</h4>
                <p>
                  No se trata de un error de la aplicación ni de un riesgo de seguridad en tu dispositivo. Google
                  Cloud aplica de forma obligatoria e ineludible esta pantalla de advertencia a cualquier prototipo o
                  despliegue en sandbox para prevenir prácticas de phishing en nombres de dominio genéricos.
                </p>

                <h4 className="text-sm font-semibold text-slate-900">2. Cómo proceder al abrir la app</h4>
                <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
                  <li>
                    Si tú o tu cliente acceden desde el enlace directo, simplemente deben presionar el botón de Google:{' '}
                    <strong>«Continuar al sitio»</strong> o <strong>«Aceptar y continuar»</strong>.
                  </li>
                  <li>
                    La aplicación funciona con cifrado TLS/HTTPS completo y no transmite datos a terceros. Toda la
                    información de tus evaluaciones se procesa en el navegador de manera privada.
                  </li>
                </ul>

                <h4 className="text-sm font-semibold text-slate-900">3. Recomendación para entregas a clientes</h4>
                <p>
                  Para remitir informes formales a empresas clientes, departamentos de RRHH, ART o peritajes
                  judiciales, se recomienda utilizar el botón superior de <strong>Exportar PDF</strong> o{' '}
                  <strong>Exportar Word</strong>. El documento generado no depende de enlaces externos y contiene todas
                  las firmas, láminas angulares y tablas reglamentarias.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'disclaimer' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-sky-300 bg-sky-50 space-y-2">
                <div className="flex items-center gap-2 text-sky-950 font-semibold text-sm">
                  <Scale className="w-4 h-4 text-sky-700 shrink-0" />
                  Declaración Formal de Responsabilidad Técnica
                </div>
                <p className="text-slate-800 italic leading-relaxed">
                  «{PROFESSIONAL_DISCLAIMER_TEXT}»
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-900">
                  Condiciones de Uso del Software
                </h4>
                <ul className="list-disc pl-5 space-y-2 text-slate-600">
                  <li>
                    <strong>Uso Profesional Calificado:</strong> ErgoEval es un software de cálculo biométrico y
                    ponderación ergonómica concebido como soporte analítico para ingenieros laborales, ergónomos,
                    médicos del trabajo y especialistas en higiene y seguridad.
                  </li>
                  <li>
                    <strong>Obligación de Inspección de Campo:</strong> Ninguna herramienta digital exime al profesional
                    de la toma presencial de datos cinemáticos, medición ambiental con instrumental calibrado ni del
                    análisis de las condiciones reales del puesto de trabajo.
                  </li>
                  <li>
                    <strong>Verificación de Resultados:</strong> El profesional evaluador debe revisar críticamente
                    cada factor multiplicador, puntuación final y nivel de acción antes de firmar y emitir el informe.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'author' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-slate-900">Propiedad Intelectual y Autoría</span>
                  <span className="text-[11px] font-mono text-sky-700 bg-sky-100 px-2 py-0.5 rounded">
                    ErgoEval v1.0
                  </span>
                </div>
                <p className="text-slate-800 text-sm font-bold">
                  {COPYRIGHT_NOTICE}
                </p>
                <p className="text-slate-600">
                  Desarrollado sobre la base de las metodologías ergonómicas internacionales y el proyecto técnico
                  integral de Mauricio Alejandro Pizarro Muñoz (Capítulos 4 al 10).
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-900">Accesos Directos del Sistema</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onDownloadManualPdf();
                    }}
                    className="p-3 rounded-lg border border-slate-200 bg-white hover:border-sky-500 hover:bg-sky-50 text-left transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                        <FileDown className="w-4 h-4 text-sky-600" />
                        Manual de Uso en PDF
                      </div>
                      <div className="text-[11px] text-slate-500">Procedimiento y efecto de cada variable</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenReference();
                    }}
                    className="p-3 rounded-lg border border-slate-200 bg-white hover:border-sky-500 hover:bg-sky-50 text-left transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                        <BookOpen className="w-4 h-4 text-sky-600" />
                        Biblioteca de Fórmulas
                      </div>
                      <div className="text-[11px] text-slate-500">Tablas y ejercicios resueltos del libro</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenDisplayControls();
                    }}
                    className="p-3 rounded-lg border border-slate-200 bg-white hover:border-sky-500 hover:bg-sky-50 text-left transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                        <Sliders className="w-4 h-4 text-sky-600" />
                        Personalizar Visualización
                      </div>
                      <div className="text-[11px] text-slate-500">Fondo, alto contraste y tamaño de letra</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pie del modal */}
        <div className="px-5 py-3.5 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="text-slate-500">
            {COPYRIGHT_NOTICE}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white font-medium cursor-pointer transition-colors"
          >
            Entendido y Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

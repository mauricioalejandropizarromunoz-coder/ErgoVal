import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  BookOpen,
  Box,
  Building2,
  Calculator,
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileSpreadsheet,
  Info,
  Layers,
  Plus,
  Scale,
  Sliders,
  Thermometer,
  Video,
  X,
} from 'lucide-react';
import {
  DisplayPreferences,
  GeneralStudyData,
  MethodId,
  StudyTab,
} from './types/ergonomics';
import { createInitialGeneralData, createNewStudyTab } from './utils/defaults';
import { buildBlankStudy, buildPresetEmpresaX, buildPresetLibroEjemplos } from './utils/presets';
import { evaluateStudyTab } from './utils/calculations';
import { exportStudyToPdf, exportStudyToWord } from './utils/reportExport';
import { exportUserManualPdf } from './utils/manualExport';
import { countModifiedFormulaMethods, subscribeFormulaChanges } from './utils/formulaConfig';
import { GeneralDataForm } from './components/GeneralDataForm';
import { StudyTabWorkspace } from './components/StudyTabWorkspace';
import { SummarySection } from './components/SummarySection';
import { ReferenceViewerModal } from './components/ReferenceViewerModal';
import { DisplayControlsModal } from './components/DisplayControlsModal';
import { AboutModal } from './components/AboutModal';
import { FigurePlanStudio } from './components/FigurePlanStudio';
import { FormulaStudio } from './components/FormulaStudio';
import { VideoBiomechExtractor } from './components/VideoBiomechExtractor';
import { AvatarTesterWorkspace } from './components/AvatarTesterWorkspace';
import {
  EnvironmentalMethodId,
  EnvironmentalMethodsWorkspace,
} from './components/EnvironmentalMethodsWorkspace';
import { ErrorBoundary } from './components/ErrorBoundary';

const STORAGE_KEY = 'ergoeval_workspace_v1';
const PREFS_STORAGE_KEY = 'ergoeval_display_prefs_v1';

const DEFAULT_PREFERENCES: DisplayPreferences = {
  theme: 'pizarra',
  textContrast: 'normal',
  fontSize: 'normal',
  highlightInputs: true,
};

interface SavedProjectFile {
  version: number;
  general: GeneralStudyData;
  tabs: StudyTab[];
}

function deepReplaceLegacyBrand<T>(input: T): T {
  if (typeof input === 'string') {
    if (
      input.startsWith('data:') ||
      input.startsWith('/assets/') ||
      input.startsWith('http://') ||
      input.startsWith('https://') ||
      input.startsWith('blob:')
    ) {
      return input;
    }
    return input.replace(/\bpose\b/gi, 'EmpresaX') as unknown as T;
  }
  if (Array.isArray(input)) {
    return input.map((item) => deepReplaceLegacyBrand(item)) as unknown as T;
  }
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = deepReplaceLegacyBrand(v);
    }
    return out as T;
  }
  return input;
}

function loadInitialState(): { general: GeneralStudyData; tabs: StudyTab[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = deepReplaceLegacyBrand(JSON.parse(raw) as SavedProjectFile);
      if (parsed && parsed.general && Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
        // Deep sanitize every tab against standard defaults to prevent crashes from older/incomplete schema
        const sanitizedTabs: StudyTab[] = parsed.tabs.map((tab, idx) => {
          const fresh = createNewStudyTab(idx + 1, tab.method || MethodId.RULA, tab.taskEvaluated);
          return {
            ...fresh,
            ...tab,
            id: tab.id || fresh.id,
            tabNumber: idx + 1,
            tabLabel: tab.tabLabel || fresh.tabLabel,
            method: tab.method || MethodId.RULA,
            payloads: {
              ...fresh.payloads,
              ...(tab.payloads || {}),
            },
          };
        });
        const sanitizedGeneral: GeneralStudyData = {
          ...createInitialGeneralData(),
          ...parsed.general,
        };
        return { general: sanitizedGeneral, tabs: sanitizedTabs };
      }
    }
  } catch {
    // Ignore malformed storage and fallback to default EmpresaX S.A. study
  }
  return buildPresetEmpresaX();
}

function loadInitialPreferences(): DisplayPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DisplayPreferences>;
      return {
        theme: parsed.theme || DEFAULT_PREFERENCES.theme,
        textContrast: parsed.textContrast || DEFAULT_PREFERENCES.textContrast,
        fontSize: parsed.fontSize || DEFAULT_PREFERENCES.fontSize,
        highlightInputs: parsed.highlightInputs !== undefined ? parsed.highlightInputs : true,
      };
    }
  } catch {
    // Fallback to defaults
  }
  return DEFAULT_PREFERENCES;
}

export default function App() {
  const initial = loadInitialState();
  const [general, setGeneral] = useState<GeneralStudyData>(initial.general);
  const [tabs, setTabs] = useState<StudyTab[]>(initial.tabs);

  // Preferencias de visualización
  const [preferences, setPreferences] = useState<DisplayPreferences>(loadInitialPreferences);

  // Modales
  const [isReferenceModalOpen, setIsReferenceModalOpen] = useState(false);
  const [referenceInitialMethod, setReferenceInitialMethod] = useState<MethodId>(MethodId.RULA);
  const [referenceInitialQuery, setReferenceInitialQuery] = useState('');
  const [isDisplayModalOpen, setIsDisplayModalOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isDisclaimerDismissed, setIsDisclaimerDismissed] = useState(false);

  // Espacio de trabajo superior: Evaluador Ergonómico, Térmico/Fanger, Testeo de Avatar 3D, Motor 3D Plan de Figuras, Editor de Fórmulas o Extractor Video IA
  const [activeWorkspace, setActiveWorkspace] = useState<
    'evaluador' | 'ambiente_fisico' | 'testeo_avatar' | 'figuras3d' | 'formulas' | 'video_ia'
  >('evaluador');
  const [envWorkspaceMethodId, setEnvWorkspaceMethodId] = useState<EnvironmentalMethodId>(MethodId.FANGER);
  const [isVideoExpanded, setIsVideoExpanded] = useState<boolean>(false);
  const [formulaStudioMethodId, setFormulaStudioMethodId] = useState<MethodId>(MethodId.RULA);
  const [formulaRevision, setFormulaRevision] = useState<number>(0);

  // Page index: 0 = Datos Generales, 1..tabs.length = Pestañas de Estudio, tabs.length + 1 = Resumen Automático
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);
  const [slideDirection, setSlideDirection] = useState<number>(1);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingWord, setIsExportingWord] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const jsonInputRef = useRef<HTMLInputElement>(null);
  const tabButtonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const totalSlides = tabs.length + 2;
  const safeSlideIndex = Math.min(activeSlideIndex, totalSlides - 1);

  useEffect(() => {
    const unsub = subscribeFormulaChanges(() => {
      setFormulaRevision((r) => r + 1);
    });
    return unsub;
  }, []);

  void formulaRevision;
  const modifiedFormulaCount = countModifiedFormulaMethods();

  useEffect(() => {
    try {
      const payload: SavedProjectFile = { version: 1, general, tabs };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage quota exceeded — keep in memory
    }
  }, [general, tabs]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Ignore
    }
  }, [preferences]);

  useEffect(() => {
    const btn = tabButtonsRef.current[safeSlideIndex];
    if (btn) {
      btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [safeSlideIndex]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (activeWorkspace !== 'evaluador') return;
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        navigateToSlide(Math.min(totalSlides - 1, safeSlideIndex + 1));
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateToSlide(Math.max(0, safeSlideIndex - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const showTempBanner = (msg: string) => {
    setStatusBanner(msg);
    window.setTimeout(() => {
      setStatusBanner((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const navigateToSlide = (nextIdx: number) => {
    const clamped = Math.max(0, Math.min(totalSlides - 1, nextIdx));
    if (clamped === safeSlideIndex) return;
    setSlideDirection(clamped > safeSlideIndex ? 1 : -1);
    setActiveSlideIndex(clamped);
  };

  const handleAddTab = (method: MethodId = MethodId.RULA, customTask?: string) => {
    const newTab = createNewStudyTab(tabs.length + 1, method, customTask);
    const nextTabs = [...tabs, newTab];
    setTabs(nextTabs);
    setSlideDirection(1);
    setActiveSlideIndex(nextTabs.length);
  };

  const handleUpdateTab = (tabIdx: number, updated: StudyTab) => {
    setTabs((prev) => prev.map((t, idx) => (idx === tabIdx ? updated : t)));
  };

  const handleDeleteTab = (tabIdx: number) => {
    if (tabs.length <= 1) return;
    const nextTabs = tabs.filter((_, idx) => idx !== tabIdx);
    setTabs(nextTabs);
    setSlideDirection(-1);
    setActiveSlideIndex(Math.max(1, Math.min(nextTabs.length, tabIdx)));
  };

  const handleLoadPreset = (presetKey: 'empresax' | 'libro' | 'blank') => {
    const built =
      presetKey === 'empresax'
        ? buildPresetEmpresaX()
        : presetKey === 'libro'
          ? buildPresetLibroEjemplos()
          : buildBlankStudy();
    setGeneral(built.general);
    setTabs(built.tabs);
    setSlideDirection(1);
    setActiveSlideIndex(0);
    showTempBanner(
      presetKey === 'empresax'
        ? 'Se cargó el estudio modelo EmpresaX S.A. con 5 pestañas evaluadas.'
        : presetKey === 'libro'
          ? 'Se cargaron los 6 ejercicios resueltos de los Capítulos 4 a 8 del libro.'
          : 'Se inició un formulario en blanco listo para carga en campo.',
    );
  };

  const handleExportJson = () => {
    const payload: SavedProjectFile = { version: 1, general, tabs };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `proyecto_ergoeval_${general.reportDate || 'estudio'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = deepReplaceLegacyBrand(JSON.parse(String(reader.result || '')) as SavedProjectFile);
        if (parsed.general && Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
          setGeneral(parsed.general);
          setTabs(parsed.tabs);
          setActiveSlideIndex(0);
          showTempBanner(`Proyecto "${file.name}" cargado correctamente (${parsed.tabs.length} pestañas).`);
        } else {
          showTempBanner('El archivo JSON no contiene una estructura válida de estudio ergonómico.');
        }
      } catch {
        showTempBanner('No se pudo leer el archivo JSON seleccionado.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportPdf = async () => {
    try {
      setIsExportingPdf(true);
      await exportStudyToPdf(general, tabs);
      showTempBanner('Informe PDF detallado generado y descargado correctamente.');
    } catch (err) {
      showTempBanner(`Error al generar el PDF: ${err instanceof Error ? err.message : 'Intente nuevamente'}`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportWord = async () => {
    try {
      setIsExportingWord(true);
      await exportStudyToWord(general, tabs);
      showTempBanner('Informe Word (.docx) detallado generado y descargado correctamente.');
    } catch (err) {
      showTempBanner(`Error al generar el archivo Word: ${err instanceof Error ? err.message : 'Intente nuevamente'}`);
    } finally {
      setIsExportingWord(false);
    }
  };

  const handleDownloadManualPdf = () => {
    try {
      exportUserManualPdf();
      showTempBanner('Manual de uso y procedimiento de métodos descargado en PDF.');
    } catch (err) {
      showTempBanner(`Error al descargar el manual: ${err instanceof Error ? err.message : 'Intente nuevamente'}`);
    }
  };

  const handleOpenReference = (methodId?: MethodId, query = '') => {
    const currentTabMethod =
      safeSlideIndex >= 1 && safeSlideIndex <= tabs.length
        ? tabs[safeSlideIndex - 1]?.method
        : MethodId.RULA;
    setReferenceInitialMethod(methodId || currentTabMethod);
    setReferenceInitialQuery(query);
    setIsReferenceModalOpen(true);
  };

  const handleOpenFormulaEditor = (methodId?: MethodId) => {
    const currentTabMethod =
      safeSlideIndex >= 1 && safeSlideIndex <= tabs.length
        ? tabs[safeSlideIndex - 1]?.method
        : MethodId.RULA;
    setFormulaStudioMethodId(methodId || currentTabMethod);
    setActiveWorkspace('formulas');
  };

  const handleEmitTabsAndReportFromVideo = async ({
    nioshTab,
    rebaTab,
    autoDownloadPdf,
  }: {
    nioshTab: StudyTab;
    rebaTab: StudyTab;
    autoDownloadPdf: boolean;
  }) => {
    const updatedGeneral: GeneralStudyData = {
      ...general,
      hazardsIdentified: {
        ...general.hazardsIdentified,
        manipulacion_cargas: true,
        posturas_forzadas: true,
      },
    };
    const filteredExisting = tabs.filter(
      (t) => t.id !== 'tab-video-ia-niosh' && t.id !== 'tab-video-ia-reba',
    );
    const nextTabs = [...filteredExisting, nioshTab, rebaTab];

    setGeneral(updatedGeneral);
    setTabs(nextTabs);

    if (autoDownloadPdf) {
      setIsExportingPdf(true);
      try {
        await exportStudyToPdf(updatedGeneral, nextTabs);
        showTempBanner(
          'Video procesado: variables extraídas, pestañas NIOSH/REBA creadas e Informe Técnico PDF emitido automáticamente.',
        );
      } finally {
        setIsExportingPdf(false);
      }
    } else {
      showTempBanner(
        'Video procesado: pestañas NIOSH y REBA integradas en el estudio EmpresaX con su informe en pantalla.',
      );
    }
  };

  const handleAddTestedTabToStudy = (newTab: StudyTab) => {
    const nextNumber = tabs.length + 1;
    const normalizedTab: StudyTab = {
      ...newTab,
      tabLabel: newTab.tabLabel
        ? newTab.tabLabel.replace(/^Pestaña \d+:/, `Pestaña ${nextNumber}:`)
        : `Pestaña ${nextNumber}: ${newTab.method}`,
    };
    const nextTabs = [...tabs, normalizedTab];
    setTabs(nextTabs);
    setActiveWorkspace('evaluador');
    setSlideDirection(1);
    setActiveSlideIndex(nextTabs.length);
    showTempBanner(
      `Pestaña calibrada "${normalizedTab.tabLabel}" agregada al estudio e informe técnico con su captura 3D.`,
    );
  };

  // Soporte táctil para deslizar (swipe horizontal) entre pestañas sin interferir con inputs
  const onTouchStart = (e: React.TouchEvent) => {
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'canvas') {
      touchStartRef.current = null;
      return;
    }
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(dx) > 75 && Math.abs(dx) > Math.abs(dy) * 1.8) {
      if (dx < 0 && safeSlideIndex < totalSlides - 1) {
        navigateToSlide(safeSlideIndex + 1);
      } else if (dx > 0 && safeSlideIndex > 0) {
        navigateToSlide(safeSlideIndex - 1);
      }
    }
  };

  const getSeverityShortCode = (tab: StudyTab) => {
    const sev = evaluateStudyTab(tab).severity;
    if (sev === 'muy_alto') return { label: 'Crítico', textClass: 'text-red-700 font-semibold' };
    if (sev === 'alto') return { label: 'Alto', textClass: 'text-orange-700 font-semibold' };
    if (sev === 'moderado') return { label: 'Mod.', textClass: 'text-amber-700 font-semibold' };
    return { label: 'Bajo', textClass: 'text-emerald-700 font-semibold' };
  };

  // Clases dinámicas de personalización visual
  const themeClass = `theme-${preferences.theme}`;
  const contrastClass = `contrast-${preferences.textContrast}`;
  const fontClass = `font-${preferences.fontSize}`;
  const highlightClass = preferences.highlightInputs ? 'highlight-inputs' : '';

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-150 ${themeClass} ${contrastClass} ${fontClass} ${highlightClass}`}
    >
      {/* BARRA SUPERIOR GLOBAL */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-300 shadow-2xs">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2 sm:gap-4">
          {/* Marca, Pestañas de Espacios de Trabajo (con desplazamiento táctil en celular) y Crédito de Autor */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar min-w-0 py-1">
            <button
              type="button"
              onClick={() => {
                setActiveWorkspace('evaluador');
                navigateToSlide(0);
              }}
              className={`font-bold text-base tracking-tight whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-2 px-2 py-1 rounded-md transition-colors ${
                activeWorkspace === 'evaluador'
                  ? 'text-slate-900 bg-slate-100'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
              title="Estudio Ergonómico Multipestaña"
            >
              <span className="w-7 h-7 rounded-md bg-sky-700 text-white flex items-center justify-center text-xs font-mono font-bold">
                EE
              </span>
              <span>ErgoEval</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveWorkspace('testeo_avatar')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer border transition-colors ${
                activeWorkspace === 'testeo_avatar'
                  ? 'bg-indigo-700 text-white border-indigo-800 shadow-2xs'
                  : 'bg-indigo-50/90 text-indigo-950 border-indigo-300 hover:bg-indigo-100'
              }`}
              title="Testeo Interactivo del Avatar Biomecánico 3D (Carga Postural y MMC)"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Testeo Avatar 3D</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveWorkspace('figuras3d')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer border transition-colors ${
                activeWorkspace === 'figuras3d'
                  ? 'bg-sky-700 text-white border-sky-800 shadow-2xs'
                  : 'bg-sky-50/80 text-sky-900 border-sky-200 hover:bg-sky-100'
              }`}
              title="Motor de Renderizado Biomecánico 3D y Plan de Figuras del Libro"
            >
              <Box className="w-3.5 h-3.5" />
              <span>Motor 3D · Figuras</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveWorkspace('ambiente_fisico')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer border transition-colors ${
                activeWorkspace === 'ambiente_fisico'
                  ? 'bg-amber-700 text-white border-amber-800 shadow-2xs'
                  : 'bg-amber-50/90 text-amber-950 border-amber-300 hover:bg-amber-100'
              }`}
              title="Confort Térmico Fanger (ISO 7730 PMV/PPD), Estrés Térmico WBGT y Vibraciones (Cap. 7 y 8)"
            >
              <Thermometer className="w-3.5 h-3.5" />
              <span>Térmico · Fanger / Físicos</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenFormulaEditor()}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer border transition-colors ${
                activeWorkspace === 'formulas'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                  : 'bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200'
              }`}
              title="Ver y modificar las fórmulas algebraicas y umbrales de cada método"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>
                Fórmulas
                {modifiedFormulaCount > 0 ? ` (${modifiedFormulaCount})` : ''}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveWorkspace('video_ia')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer border transition-colors ${
                activeWorkspace === 'video_ia'
                  ? 'bg-emerald-700 text-white border-emerald-800 shadow-2xs'
                  : 'bg-emerald-50/90 text-emerald-950 border-emerald-300 hover:bg-emerald-100'
              }`}
              title="Extractor de Variables Biomecánicas y Muestras CENEA con Emisión Automática de Informe"
            >
              <Video className="w-3.5 h-3.5" />
              <span>Video IA · Informe</span>
            </button>

            <span className="hidden 2xl:inline text-[11px] text-slate-500 font-normal pl-1 border-l border-slate-300 whitespace-nowrap shrink-0">
              por Mauricio Alejandro Pizarro Muñoz
            </span>
          </div>

          {/* Navegación central y accesos de desarrollo / visualización */}
          <nav className="hidden xl:flex items-center gap-3.5 text-xs font-medium text-slate-600">
            <button
              type="button"
              onClick={() => {
                setActiveWorkspace('evaluador');
                navigateToSlide(0);
              }}
              className={`py-1 whitespace-nowrap shrink-0 cursor-pointer hover:text-slate-900 ${
                activeWorkspace === 'evaluador' && safeSlideIndex === 0
                  ? 'text-sky-700 font-semibold underline underline-offset-4'
                  : ''
              }`}
            >
              Datos Generales
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveWorkspace('evaluador');
                navigateToSlide(1);
              }}
              className={`py-1 whitespace-nowrap shrink-0 cursor-pointer hover:text-slate-900 ${
                activeWorkspace === 'evaluador' && safeSlideIndex >= 1 && safeSlideIndex <= tabs.length
                  ? 'text-sky-700 font-semibold underline underline-offset-4'
                  : ''
              }`}
            >
              Pestañas de Estudio ({tabs.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveWorkspace('evaluador');
                navigateToSlide(tabs.length + 1);
              }}
              className={`py-1 whitespace-nowrap shrink-0 cursor-pointer hover:text-slate-900 ${
                activeWorkspace === 'evaluador' && safeSlideIndex === tabs.length + 1
                  ? 'text-sky-700 font-semibold underline underline-offset-4'
                  : ''
              }`}
            >
              Resumen Automático
            </button>

            <span className="text-slate-300">|</span>

            {/* Acceso directo al Manual de Métodos en PDF */}
            <button
              type="button"
              onClick={handleDownloadManualPdf}
              className="inline-flex items-center gap-1.5 py-1 text-slate-700 hover:text-sky-700 cursor-pointer whitespace-nowrap"
              title="Descargar procedimiento descriptivo de los métodos y manual de uso en PDF"
            >
              <FileDown className="w-3.5 h-3.5 text-sky-600" />
              Manual PDF
            </button>

            {/* Acceso al archivo de desarrollo y libro */}
            <button
              type="button"
              onClick={() => handleOpenReference()}
              className="inline-flex items-center gap-1.5 py-1 text-slate-700 hover:text-sky-700 cursor-pointer whitespace-nowrap"
              title="Abrir fórmulas, multiplicadores y tablas del libro de Mauricio Pizarro"
            >
              <BookOpen className="w-3.5 h-3.5 text-sky-600" />
              Fórmulas y Libro
            </button>

            {/* Ajustes de visualización y contraste */}
            <button
              type="button"
              onClick={() => setIsDisplayModalOpen(true)}
              className="inline-flex items-center gap-1.5 py-1 text-slate-700 hover:text-sky-700 cursor-pointer whitespace-nowrap"
              title="Personalizar color de fondo, alto contraste y tamaño de letra"
            >
              <Sliders className="w-3.5 h-3.5 text-sky-600" />
              Visualización
            </button>

            {/* Información, descargo legal y aviso de enlace */}
            <button
              type="button"
              onClick={() => setIsAboutModalOpen(true)}
              className="inline-flex items-center gap-1.5 py-1 text-slate-700 hover:text-sky-700 cursor-pointer whitespace-nowrap"
              title="Aviso de enlace compartido, responsabilidad profesional y autoría"
            >
              <Info className="w-3.5 h-3.5 text-slate-500" />
              Aviso y Autoría
            </button>
          </nav>

          {/* Acciones principales de exportación */}
          <div className="flex items-center gap-2 shrink-0">
            <input
              ref={jsonInputRef}
              type="file"
              accept=".json"
              onChange={handleImportJson}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => setIsDisplayModalOpen(true)}
              className="xl:hidden p-1.5 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
              title="Visualización"
            >
              <Sliders className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveWorkspace((prev) => (prev === 'figuras3d' ? 'evaluador' : 'figuras3d'))
              }
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer border transition-colors ${
                activeWorkspace === 'figuras3d'
                  ? 'bg-sky-700 text-white border-sky-800'
                  : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300'
              }`}
              title="Alternar al Estudio de Figuras 3D del Libro (PNG < 120 KB)"
            >
              <Box className={`w-3.5 h-3.5 ${activeWorkspace === 'figuras3d' ? 'text-white' : 'text-sky-600'}`} />
              <span className="hidden sm:inline">
                {activeWorkspace === 'figuras3d' ? 'Ir a Evaluador' : 'Figuras 3D'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <FileDown className="w-3.5 h-3.5" />
              {isExportingPdf ? 'PDF...' : 'Exportar PDF'}
            </button>

            <button
              type="button"
              onClick={handleExportWord}
              disabled={isExportingWord}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              {isExportingWord ? 'Word...' : 'Exportar Word'}
            </button>
          </div>
        </div>
      </header>

      {/* AVISO DE RESPONSABILIDAD PROFESIONAL Y ADVERTENCIA DE ENLACE (oculto en celular para despejar el visor 3D superior) */}
      {!isDisclaimerDismissed && (
        <div className="hidden sm:block bg-amber-50 border-b border-amber-200/90 text-amber-950 text-xs py-2 px-4 sm:px-6">
          <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Scale className="w-4 h-4 text-amber-700 shrink-0" />
              <p className="truncate sm:text-wrap">
                <span className="font-semibold">AVISO TÉCNICO:</span> Herramienta para uso de profesionales calificados.
                El informe generado no sustituye el análisis, verificación de resultados ni la inspección en campo por parte del profesional evaluador.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsAboutModalOpen(true)}
                className="underline font-semibold hover:text-amber-900 cursor-pointer text-[11px]"
              >
                ¿Por qué el enlace muestra advertencia?
              </button>
              <button
                type="button"
                onClick={() => setIsDisclaimerDismissed(true)}
                className="text-amber-800 hover:text-amber-950 p-0.5 cursor-pointer"
                title="Ocultar aviso de la cabecera"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BARRA DESLIZABLE DE PESTAÑAS DE TRABAJO (MODO EVALUADOR) */}
      {activeWorkspace === 'evaluador' && (
        <div className="bg-[#d2dfec] border-b border-slate-300">
          <div className="max-w-[1400px] mx-auto px-2 sm:px-6 flex items-center gap-1.5 py-2">
            <button
              type="button"
              onClick={() => navigateToSlide(safeSlideIndex - 1)}
              disabled={safeSlideIndex === 0}
              title="Deslizar a la pestaña anterior (Alt + ←)"
              className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-35 text-slate-700 shrink-0 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {/* Pestaña 0: Datos Generales */}
              <button
                ref={(el) => {
                  tabButtonsRef.current[0] = el;
                }}
                type="button"
                onClick={() => navigateToSlide(0)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                  safeSlideIndex === 0
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-white/95 text-slate-700 border-slate-300 hover:border-slate-400 hover:bg-white hover:text-slate-900'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                Datos Empresa y Puesto
              </button>

              {/* Pestañas Dinámicas de Estudio 1..N */}
              {tabs.map((tab, idx) => {
                const slideIdx = idx + 1;
                const isActive = safeSlideIndex === slideIdx;
                const sevTag = getSeverityShortCode(tab);
                return (
                  <button
                    key={tab.id}
                    ref={(el) => {
                      tabButtonsRef.current[slideIdx] = el;
                    }}
                    type="button"
                    onClick={() => navigateToSlide(slideIdx)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-sky-700 text-white border-sky-800 shadow-xs'
                        : 'bg-white/95 text-slate-700 border-slate-300 hover:border-sky-400 hover:bg-white hover:text-slate-900'
                    }`}
                  >
                    <span>{tab.tabLabel}</span>
                    <span
                      className={`font-mono text-[10px] tabular-nums ${
                        isActive ? 'text-sky-100' : sevTag.textClass
                      }`}
                    >
                      · {sevTag.label}
                    </span>
                  </button>
                );
              })}

              {/* Botón + Añadir nueva pestaña de método */}
              <button
                type="button"
                onClick={() => handleAddTab(MethodId.RULA)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-dashed border-sky-700/70 bg-sky-50/90 hover:bg-white text-xs font-semibold text-sky-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Añadir Pestaña
              </button>

              {/* Pestaña Final: Resumen Automático */}
              <button
                ref={(el) => {
                  tabButtonsRef.current[tabs.length + 1] = el;
                }}
                type="button"
                onClick={() => navigateToSlide(tabs.length + 1)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                  safeSlideIndex === tabs.length + 1
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-white/95 text-slate-800 border-slate-300 hover:border-slate-400 hover:bg-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Resumen Automático ({tabs.length})
              </button>
            </div>

            <button
              type="button"
              onClick={() => navigateToSlide(safeSlideIndex + 1)}
              disabled={safeSlideIndex === totalSlides - 1}
              title="Deslizar a la pestaña siguiente (Alt + →)"
              className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-35 text-slate-700 shrink-0 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Notificación temporal no bloqueante */}
      {statusBanner && (
        <div className="max-w-[1400px] w-full mx-auto px-4 sm:px-6 pt-3">
          <div className="px-4 py-2.5 rounded-md border border-sky-200 bg-sky-50 text-xs font-medium text-sky-950 flex items-center justify-between">
            <span>{statusBanner}</span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-sky-700 hover:text-sky-950 font-semibold ml-4 cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* CONTENEDOR PRINCIPAL */}
      {activeWorkspace === 'testeo_avatar' ? (
        <main className="flex-1 max-w-[1400px] w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 overflow-x-hidden">
          <ErrorBoundary>
            <AvatarTesterWorkspace
              onBackToEvaluator={() => setActiveWorkspace('evaluador')}
              onAddTestedTabToStudy={handleAddTestedTabToStudy}
              onOpenEnvironmentalWorkspace={() => {
                setEnvWorkspaceMethodId(MethodId.FANGER);
                setActiveWorkspace('ambiente_fisico');
              }}
            />
          </ErrorBoundary>
        </main>
      ) : activeWorkspace === 'ambiente_fisico' ? (
        <main className="flex-1 max-w-[1400px] w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 overflow-x-hidden">
          <ErrorBoundary>
            <EnvironmentalMethodsWorkspace
              initialMethodId={envWorkspaceMethodId}
              onBackToEvaluator={() => setActiveWorkspace('evaluador')}
              onAddEnvironmentalTabToStudy={handleAddTestedTabToStudy}
              onOpenReference={(mId) => handleOpenReference(mId)}
              onOpenFormulaEditor={(mId) => handleOpenFormulaEditor(mId)}
            />
          </ErrorBoundary>
        </main>
      ) : activeWorkspace === 'figuras3d' ? (
        <main className="flex-1 max-w-[1400px] w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 overflow-x-hidden">
          <ErrorBoundary>
            <FigurePlanStudio onBackToEvaluator={() => setActiveWorkspace('evaluador')} />
          </ErrorBoundary>
        </main>
      ) : activeWorkspace === 'formulas' ? (
        <main className="flex-1 max-w-[1400px] w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 overflow-x-hidden">
          <ErrorBoundary>
            <FormulaStudio
              initialMethodId={formulaStudioMethodId}
              tabs={tabs}
              onBackToEvaluator={() => setActiveWorkspace('evaluador')}
              onOpenReference={(mId) => handleOpenReference(mId)}
              onNotify={showTempBanner}
            />
          </ErrorBoundary>
        </main>
      ) : activeWorkspace === 'video_ia' ? (
        <main
          className={`flex-1 ${
            isVideoExpanded ? 'max-w-[1780px]' : 'max-w-[1400px]'
          } w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 overflow-x-hidden`}
        >
          <ErrorBoundary>
            <VideoBiomechExtractor
              general={general}
              onBackToEvaluator={() => setActiveWorkspace('evaluador')}
              onEmitTabsAndReport={handleEmitTabsAndReportFromVideo}
              onExportCurrentPdf={handleExportPdf}
              onExportCurrentWord={handleExportWord}
              isExpandedView={isVideoExpanded}
              onToggleExpandedView={() => setIsVideoExpanded((prev) => !prev)}
              onOpenGeneratedTabsInEvaluator={() => {
                setActiveWorkspace('evaluador');
                const nioshIdx = tabs.findIndex((t) => t.id === 'tab-video-ia-niosh');
                navigateToSlide(nioshIdx >= 0 ? nioshIdx + 1 : Math.max(1, tabs.length - 1));
              }}
            />
          </ErrorBoundary>
        </main>
      ) : (
        <main
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className="flex-1 max-w-[1400px] w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 overflow-x-hidden"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={
                safeSlideIndex === 0
                  ? 'slide-general'
                  : safeSlideIndex === tabs.length + 1
                    ? 'slide-summary'
                    : `slide-tab-${tabs[safeSlideIndex - 1]?.id}`
              }
              initial={{ opacity: 0, x: slideDirection * 32 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -slideDirection * 32 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {safeSlideIndex === 0 ? (
                <GeneralDataForm
                  data={general}
                  onChange={setGeneral}
                  onLoadPreset={handleLoadPreset}
                  onQuickAddMethodTab={(method, hint) => handleAddTab(method, hint)}
                  onGoToFirstTab={() => navigateToSlide(1)}
                />
              ) : safeSlideIndex === tabs.length + 1 ? (
                <SummarySection
                  general={general}
                  tabs={tabs}
                  onChangeGeneral={setGeneral}
                  onSelectTabIndex={(tabIdx) => navigateToSlide(tabIdx + 1)}
                  onExportPdf={handleExportPdf}
                  onExportWord={handleExportWord}
                  isExportingPdf={isExportingPdf}
                  isExportingWord={isExportingWord}
                />
              ) : (
                <StudyTabWorkspace
                  tab={tabs[safeSlideIndex - 1]}
                  tabIndex={safeSlideIndex - 1}
                  totalTabs={tabs.length}
                  onChange={(updated) => handleUpdateTab(safeSlideIndex - 1, updated)}
                  onDeleteTab={() => handleDeleteTab(safeSlideIndex - 1)}
                  onOpenReference={(methodId, query) => handleOpenReference(methodId, query)}
                  onOpenFormulaEditor={(methodId) => handleOpenFormulaEditor(methodId)}
                  onOpenVideoExtractor={() => setActiveWorkspace('video_ia')}
                  onOpenEnvironmentalWorkspace={(methodId) => {
                    if (
                      methodId === MethodId.FANGER ||
                      methodId === MethodId.WBGT ||
                      methodId === MethodId.ISO_2631 ||
                      methodId === MethodId.ISO_5349
                    ) {
                      setEnvWorkspaceMethodId(methodId);
                    }
                    setActiveWorkspace('ambiente_fisico');
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navegación inferior rápida de deslizamiento entre pestañas */}
          <div className="mt-8 pt-4 border-t border-slate-300 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-700">
            <button
              type="button"
              onClick={() => navigateToSlide(safeSlideIndex - 1)}
              disabled={safeSlideIndex === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 font-medium text-slate-800 whitespace-nowrap cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              Pestaña Anterior
            </button>

            <span className="font-mono tabular-nums text-slate-600">
              Página {safeSlideIndex + 1} de {totalSlides} · Deslice o use Alt + ← / →
            </span>

            <button
              type="button"
              onClick={() => navigateToSlide(safeSlideIndex + 1)}
              disabled={safeSlideIndex === totalSlides - 1}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-slate-900 hover:bg-slate-800 disabled:opacity-40 font-medium text-white whitespace-nowrap cursor-pointer"
            >
              Pestaña Siguiente
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </main>
      )}

      {/* PIE DE PÁGINA INSTITUCIONAL CON COPYRIGHT Y RESPONSABILIDAD PROFESIONAL */}
      <footer className="mt-auto bg-slate-900 text-slate-300 border-t border-slate-800 text-xs">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <div className="font-semibold text-white text-sm">
                ErgoEval — Plataforma Integral de Evaluación Ergonómica de Puestos de Trabajo
              </div>
              <div className="text-slate-400 mt-0.5">
                © Mauricio Alejandro Pizarro Muñoz · Todos los derechos reservados.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <button
                type="button"
                onClick={handleDownloadManualPdf}
                className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 font-medium cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" />
                Manual PDF
              </button>
              <span className="text-slate-700">·</span>
              <button
                type="button"
                onClick={() => handleOpenReference()}
                className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 font-medium cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Biblioteca de Fórmulas
              </button>
              <span className="text-slate-700">·</span>
              <button
                type="button"
                onClick={() => setIsDisplayModalOpen(true)}
                className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 font-medium cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5" />
                Controles de Pantalla
              </button>
              <span className="text-slate-700">·</span>
              <button
                type="button"
                onClick={() => setIsAboutModalOpen(true)}
                className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 font-medium cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Aviso de Enlace
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 leading-relaxed">
            <span className="font-semibold text-slate-300">Descargo de Responsabilidad:</span> ErgoEval es un software
            asistencial de modelización biomecánica y cálculo ergonómico para uso exclusivo de profesionales competentes en salud
            y seguridad ocupacional. Los informes generados constituyen un soporte analítico y no sustituyen la inspección de campo,
            el criterio técnico ni la verificación obligatoria que debe efectuar el propio profesional evaluador.
          </div>
        </div>
      </footer>

      {/* MODAL 1: VISOR DE FÓRMULAS, VARIABLES Y TABLAS DEL LIBRO */}
      <ReferenceViewerModal
        isOpen={isReferenceModalOpen}
        onClose={() => setIsReferenceModalOpen(false)}
        initialMethodId={referenceInitialMethod}
        initialQuery={referenceInitialQuery}
        onDownloadManualPdf={handleDownloadManualPdf}
        onOpenFormulaEditor={(mId) => handleOpenFormulaEditor(mId)}
      />

      {/* MODAL 2: CONTROLES DE VISUALIZACIÓN Y CONTRASTE */}
      <DisplayControlsModal
        isOpen={isDisplayModalOpen}
        onClose={() => setIsDisplayModalOpen(false)}
        preferences={preferences}
        onChangePreferences={setPreferences}
        onResetPreferences={() => setPreferences(DEFAULT_PREFERENCES)}
      />

      {/* MODAL 3: AVISO DEL ENLACE COMPARTIDO, RESPONSABILIDAD Y AUTORÍA */}
      <AboutModal
        isOpen={isAboutModalOpen}
        onClose={() => setIsAboutModalOpen(false)}
        onOpenReference={() => handleOpenReference()}
        onOpenDisplayControls={() => setIsDisplayModalOpen(true)}
        onDownloadManualPdf={handleDownloadManualPdf}
      />
    </div>
  );
}

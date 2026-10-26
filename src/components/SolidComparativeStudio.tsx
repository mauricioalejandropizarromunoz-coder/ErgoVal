import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import {
  Archive,
  ArrowLeft,
  Check,
  Copy,
  Download,
  Eye,
  RotateCcw,
  Search,
  Sliders,
  SplitSquareHorizontal,
} from 'lucide-react';
import { BOOK_FIGURE_CATALOG } from '../utils/figurePlanCatalog';
import { BookFigureFileSpec } from '../types/figurePlan';
import {
  buildScientificComparativePrompt,
  buildSolidComparativeSpecFromBookFigure,
  DEFAULT_SOLID_COMPARATIVE_OPTIONS,
  EvaluatedJointParam,
  exportSolidComparativePng,
  makeSolidStandingNeutralPose,
  MASTER_COMPARATIVE_PRESETS,
  renderBookFigureInSolidComparativeStyle,
  renderSolidComparativeToCanvas,
  SolidComparativeSpec,
  SolidComparativeVisualOptions,
} from '../utils/solidComparativeRenderer';

interface SolidComparativeStudioProps {
  onBackToEvaluator: () => void;
}

const JOINT_PARAM_META: Record<
  EvaluatedJointParam,
  {
    labelEs: string;
    subscript: string;
    minDeg: number;
    maxDeg: number;
    defaultSegmentEs: string;
    englishNoun: string;
  }
> = {
  cervical: {
    labelEs: 'Columna cervical C1–C7 (αc)',
    subscript: 'c',
    minDeg: -35,
    maxDeg: 55,
    defaultSegmentEs: 'Columna cervical C1–C7 y cabeza\n(aislado)',
    englishNoun: 'cervical',
  },
  trunk: {
    labelEs: 'Tronco dorsolumbar L5/S1 (αt)',
    subscript: 't',
    minDeg: -20,
    maxDeg: 85,
    defaultSegmentEs: 'Columna dorsolumbar T1–S1\n(tronco y pelvis)',
    englishNoun: 'anterior trunk',
  },
  shoulder: {
    labelEs: 'Hombro y brazo glenohumeral (αb)',
    subscript: 'b',
    minDeg: -25,
    maxDeg: 135,
    defaultSegmentEs: 'Hombro y brazo derecho\n(complejo glenohumeral)',
    englishNoun: 'shoulder',
  },
  elbow: {
    labelEs: 'Codo y antebrazo humeroulnar (αa)',
    subscript: 'a',
    minDeg: 10,
    maxDeg: 135,
    defaultSegmentEs: 'Codo y antebrazo derecho\n(articulación humeroulnar)',
    englishNoun: 'elbow',
  },
  wrist: {
    labelEs: 'Muñeca radiocarpiana (αm)',
    subscript: 'm',
    minDeg: -40,
    maxDeg: 50,
    defaultSegmentEs: 'Muñeca y mano derecha\n(articulación radiocarpiana)',
    englishNoun: 'wrist',
  },
  knee: {
    labelEs: 'Rodilla femorotibial (αp)',
    subscript: 'p',
    minDeg: 0,
    maxDeg: 95,
    defaultSegmentEs: 'Rodillas y miembros inferiores\n(articulación femorotibial)',
    englishNoun: 'bilateral knee',
  },
};

function applyJointAngleToSpec(
  prev: SolidComparativeSpec,
  param: EvaluatedJointParam,
  newAngleDeg: number,
  updateTexts = true,
): SolidComparativeSpec {
  const meta = JOINT_PARAM_META[param];
  const clamped = Math.max(meta.minDeg, Math.min(meta.maxDeg, Math.round(newAngleDeg)));
  const absVal = Math.abs(clamped);
  const movementWordEs = clamped >= 0 ? 'flexión' : 'extensión';
  const movementWordEn = clamped >= 0 ? 'flexion' : 'extension';

  let poseB = makeSolidStandingNeutralPose();
  switch (param) {
    case 'cervical':
      poseB = makeSolidStandingNeutralPose({ neckFlexionDeg: clamped });
      break;
    case 'trunk':
      poseB = makeSolidStandingNeutralPose({
        trunkFlexionDeg: clamped,
        neckFlexionDeg: clamped > 25 ? 8 : 2,
        shoulderRFlexionDeg: Math.max(2, Math.round(clamped * 0.6)),
        shoulderLFlexionDeg: Math.max(2, Math.round(clamped * 0.6)),
        elbowRFlexionDeg: 14,
        elbowLFlexionDeg: 14,
      });
      break;
    case 'shoulder':
      poseB = makeSolidStandingNeutralPose({
        shoulderRFlexionDeg: clamped,
        elbowRFlexionDeg: clamped > 75 ? 26 : 22,
      });
      break;
    case 'elbow':
      poseB = makeSolidStandingNeutralPose({
        shoulderRFlexionDeg: 8,
        elbowRFlexionDeg: clamped,
      });
      break;
    case 'wrist':
      poseB = makeSolidStandingNeutralPose({
        shoulderRFlexionDeg: 16,
        elbowRFlexionDeg: 82,
        wristRFlexionDeg: clamped,
      });
      break;
    case 'knee':
      poseB = makeSolidStandingNeutralPose({
        hipRFlexionDeg: Math.round(clamped * 0.56),
        kneeRFlexionDeg: clamped,
        hipLFlexionDeg: Math.round(clamped * 0.56),
        kneeLFlexionDeg: clamped,
        trunkFlexionDeg: Math.round(clamped * 0.24),
      });
      break;
  }

  return {
    ...prev,
    evaluatedParam: param,
    alphaSubscript: meta.subscript,
    angleDeg: clamped,
    englishActionPhrase: `${meta.englishNoun} ${movementWordEn} of ${absVal} degrees`,
    headerTitle: updateTexts
      ? `${meta.defaultSegmentEs.replace('\n', ' ')}: ${movementWordEs} de ${absVal}° (Postura de Evaluación)`
      : prev.headerTitle,
    topLeftSegmentLabel: updateTexts ? meta.defaultSegmentEs : prev.topLeftSegmentLabel,
    poseA: makeSolidStandingNeutralPose(),
    poseB,
  };
}

function downloadBlobFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const SolidComparativeStudio: React.FC<SolidComparativeStudioProps> = ({
  onBackToEvaluator,
}) => {
  const [studioTab, setStudioTab] = useState<'comparative' | 'catalog' | 'table'>('comparative');

  // Mode 1: Interactive Comparative A/B Spec & Options
  const [activePresetId, setActivePresetId] = useState<string>(MASTER_COMPARATIVE_PRESETS[0].id);
  const [spec, setSpec] = useState<SolidComparativeSpec>(MASTER_COMPARATIVE_PRESETS[0]);
  const [visualOptions, setVisualOptions] = useState<SolidComparativeVisualOptions>(
    DEFAULT_SOLID_COMPARATIVE_OPTIONS,
  );
  const [qualityMode, setQualityMode] = useState<'hd_editorial' | 'compact_120kb'>('hd_editorial');
  const [showReferenceComparison, setShowReferenceComparison] = useState<boolean>(false);
  const [refImgError, setRefImgError] = useState<boolean>(false);

  // Prompt editor & copy feedback
  const [promptDraft, setPromptDraft] = useState<string>(() =>
    buildScientificComparativePrompt(MASTER_COMPARATIVE_PRESETS[0]),
  );
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [isExportingSingle, setIsExportingSingle] = useState<boolean>(false);

  // Mode 2 & 3: Master 84-Figure Catalog & ZIP State
  const [chapterFilter, setChapterFilter] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBookFigId, setSelectedBookFigId] = useState<string>('fig-4-13b');
  const [catalogPreviewUrl, setCatalogPreviewUrl] = useState<string>('');
  const [catalogPreviewMeta, setCatalogPreviewMeta] = useState<{
    width: number;
    height: number;
    sizeBytes: number;
  } | null>(null);
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number } | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Synchronize prompt draft whenever spec changes
  useEffect(() => {
    setPromptDraft(buildScientificComparativePrompt(spec));
  }, [spec]);

  // Render live interactive Comparative A/B canvas
  useEffect(() => {
    if (studioTab !== 'comparative') return;
    const dst = previewCanvasRef.current;
    if (!dst) return;

    const rendered = renderSolidComparativeToCanvas(spec, visualOptions, 1.25);
    dst.width = rendered.width;
    dst.height = rendered.height;
    const ctx = dst.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, dst.width, dst.height);
      ctx.drawImage(rendered, 0, 0);
    }
  }, [spec, visualOptions, studioTab]);

  // Selected catalog figure for Mode 2
  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return BOOK_FIGURE_CATALOG.filter((f) => {
      if (chapterFilter !== 'all' && f.chapter !== chapterFilter) return false;
      if (!q) return true;
      return (
        f.fileName.toLowerCase().includes(q) ||
        f.figureNumber.toLowerCase().includes(q) ||
        f.title.toLowerCase().includes(q) ||
        f.bookDescription.toLowerCase().includes(q)
      );
    });
  }, [chapterFilter, searchQuery]);

  const selectedBookFigure = useMemo<BookFigureFileSpec>(() => {
    return (
      BOOK_FIGURE_CATALOG.find((f) => f.id === selectedBookFigId) || BOOK_FIGURE_CATALOG[0]
    );
  }, [selectedBookFigId]);

  useEffect(() => {
    if (studioTab !== 'catalog') return;
    let cancelled = false;
    renderBookFigureInSolidComparativeStyle(selectedBookFigure, visualOptions, qualityMode).then(
      (res) => {
        if (cancelled) return;
        setCatalogPreviewUrl(res.dataUrl);
        setCatalogPreviewMeta({
          width: res.width,
          height: res.height,
          sizeBytes: res.sizeBytes,
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [studioTab, selectedBookFigure, visualOptions, qualityMode]);

  const chaptersList = useMemo(() => {
    const map = new Map<number, string>();
    for (const f of BOOK_FIGURE_CATALOG) {
      if (!map.has(f.chapter)) map.set(f.chapter, f.chapterTitle);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, []);

  const handleSelectMasterPreset = (preset: SolidComparativeSpec) => {
    setActivePresetId(preset.id);
    setSpec(preset);
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(promptDraft);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 1800);
    } catch {
      // Clipboard fallback ignored inside sandboxed frames
    }
  };

  const handleApplyFreePrompt = () => {
    const text = promptDraft.toLowerCase();
    let detectedParam: EvaluatedJointParam = spec.evaluatedParam;
    if (text.includes('cervical') || text.includes('neck') || text.includes('cuello') || text.includes('alpha_c') || text.includes('α_c')) {
      detectedParam = 'cervical';
    } else if (text.includes('trunk') || text.includes('lumbar') || text.includes('tronco') || text.includes('alpha_t') || text.includes('α_t')) {
      detectedParam = 'trunk';
    } else if (text.includes('elbow') || text.includes('forearm') || text.includes('codo') || text.includes('antebrazo') || text.includes('alpha_a') || text.includes('α_a')) {
      detectedParam = 'elbow';
    } else if (text.includes('wrist') || text.includes('muñeca') || text.includes('hand') || text.includes('alpha_m') || text.includes('α_m')) {
      detectedParam = 'wrist';
    } else if (text.includes('knee') || text.includes('rodilla') || text.includes('leg') || text.includes('alpha_p') || text.includes('α_p')) {
      detectedParam = 'knee';
    } else if (text.includes('shoulder') || text.includes('hombro') || text.includes('arm') || text.includes('brazo') || text.includes('alpha_b') || text.includes('α_b')) {
      detectedParam = 'shoulder';
    }

    const degMatch = text.match(/(-?\d{1,3})\s*(?:degrees|degree|°|grados)/i);
    const parsedDeg = degMatch ? Number(degMatch[1]) : spec.angleDeg;
    const isExtension = text.includes('extension') || text.includes('extensión');
    const signedDeg = isExtension && parsedDeg > 0 ? -parsedDeg : parsedDeg;

    setActivePresetId('custom');
    setSpec((prev) => applyJointAngleToSpec(prev, detectedParam, signedDeg, true));
  };

  const handleDownloadCurrentComparativePng = async () => {
    setIsExportingSingle(true);
    try {
      const res = await exportSolidComparativePng(spec, visualOptions, qualityMode);
      const safeName = `${spec.id || 'comparativa-ab'}-alpha_${spec.alphaSubscript}_${Math.abs(spec.angleDeg)}deg.png`;
      downloadBlobFile(res.blob, safeName);
    } finally {
      setIsExportingSingle(false);
    }
  };

  const handleDownloadBookFigurePng = useCallback(
    async (fig: BookFigureFileSpec) => {
      const res = await renderBookFigureInSolidComparativeStyle(fig, visualOptions, qualityMode);
      downloadBlobFile(res.blob, fig.fileName);
    },
    [visualOptions, qualityMode],
  );

  const handleDownloadAllZip = async () => {
    if (zipProgress) return;
    const total = BOOK_FIGURE_CATALOG.length;
    setZipProgress({ current: 0, total });
    try {
      const zip = new JSZip();
      for (let i = 0; i < total; i++) {
        const fig = BOOK_FIGURE_CATALOG[i];
        setZipProgress({ current: i + 1, total });
        // Yield briefly to keep UI responsive
        await new Promise((r) => setTimeout(r, 8));
        const res = await renderBookFigureInSolidComparativeStyle(fig, visualOptions, qualityMode);
        zip.file(fig.fileName, res.blob);
      }
      const archiveBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
      const suffix = qualityMode === 'hd_editorial' ? 'hd-solido-ab' : 'compacto-120kb-ab';
      downloadBlobFile(archiveBlob, `plan-figuras-modelo-3d-solido-${suffix}.zip`);
    } finally {
      setZipProgress(null);
    }
  };

  const currentParamMeta = JOINT_PARAM_META[spec.evaluatedParam];

  return (
    <div className="space-y-6">
      {/* Cabecera Editorial del Estudio Comparativo 3D Sólido A/B */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Ilustración Fotorrealista de Manual Médico-Ergonómico</span>
            <span aria-hidden="true">·</span>
            <span>Indumentaria Clínica Gris Lisa</span>
            <span aria-hidden="true">·</span>
            <span>Comparativa Sagital A (Neutra) vs B (Activa)</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Diagrama Comparativo A/B · Postura de Evaluación y Sector Angular
          </h1>
          <p className="text-sm text-slate-600 max-w-3xl">
            Ilustración fotorrealista de manual ergonómico sobre fondo blanco limpio con borde fino, textura natural de piel,
            iluminación de estudio, ambo clínico gris oscuro de manga corta y pantalón largo gris lisos sin logotipos ni bolsillos,
            sectores angulares azules semitransparentes con bordes negros nítidos y pie técnico centrado en español.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setStudioTab('comparative')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                studioTab === 'comparative'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Comparador A/B Interactivo
            </button>
            <button
              type="button"
              onClick={() => setStudioTab('catalog')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                studioTab === 'catalog'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Catálogo 84 Figuras y ZIP
            </button>
            <button
              type="button"
              onClick={() => setStudioTab('table')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                studioTab === 'table'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tabla Maestra
            </button>
          </div>

          <button
            type="button"
            onClick={onBackToEvaluator}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver a ErgoEval
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MODO 1: COMPARADOR INTERACTIVO SÓLIDO A/B + PROMPT CIENTÍFICO         */}
      {/* ===================================================================== */}
      {studioTab === 'comparative' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Columna Izquierda: Selector de Posturas del Documento Maestro y Parámetros */}
          <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Posturas Evaluadas del Documento Maestro
                </h2>
                <p className="text-xs text-slate-500">
                  Seleccione un caso normativo o ajuste el ángulo articular exacto sobre la Figura B
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleSelectMasterPreset(MASTER_COMPARATIVE_PRESETS[0])}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
                title="Restablecer ejemplo de flexión cervical de 30°"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restablecer 30°
              </button>
            </div>

            {/* Cuadrícula de Presets del Libro Maestro */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
              {MASTER_COMPARATIVE_PRESETS.map((preset) => {
                const isSelected = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectMasterPreset(preset)}
                    className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50/70 hover:bg-slate-100 text-slate-800 border-slate-200'
                    }`}
                  >
                    <div className="font-semibold truncate">{preset.codeLabel}</div>
                    <div
                      className={`text-[11px] truncate mt-0.5 ${
                        isSelected ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      {preset.methodRef}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Ajuste Paramétrico de Articulación y Ángulo Exacto */}
            <div className="space-y-4 pt-2 border-t border-slate-200">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-800">
                  Segmento Anatómico Evaluado en Figura B
                </label>
                <select
                  value={spec.evaluatedParam}
                  onChange={(e) => {
                    const nextParam = e.target.value as EvaluatedJointParam;
                    const defaultAngles: Record<EvaluatedJointParam, number> = {
                      cervical: 30,
                      trunk: 35,
                      shoulder: 60,
                      elbow: 85,
                      wrist: 25,
                      knee: 45,
                    };
                    setActivePresetId('custom');
                    setSpec((prev) =>
                      applyJointAngleToSpec(prev, nextParam, defaultAngles[nextParam], true),
                    );
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                >
                  {(Object.keys(JOINT_PARAM_META) as EvaluatedJointParam[]).map((key) => (
                    <option key={key} value={key}>
                      {JOINT_PARAM_META[key].labelEs}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">
                    Ángulo Medido (α{spec.alphaSubscript})
                  </span>
                  <span className="font-mono font-bold text-sky-800 tabular-nums">
                    α{spec.alphaSubscript} = {Math.abs(spec.angleDeg)}°{' '}
                    {spec.angleDeg < 0 ? '(extensión)' : '(flexión)'}
                  </span>
                </div>
                <input
                  type="range"
                  min={currentParamMeta.minDeg}
                  max={currentParamMeta.maxDeg}
                  step={1}
                  value={spec.angleDeg}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setActivePresetId('custom');
                    setSpec((prev) =>
                      applyJointAngleToSpec(prev, prev.evaluatedParam, val, true),
                    );
                  }}
                  className="w-full accent-sky-700 cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-slate-500 font-mono tabular-nums">
                  <span>{currentParamMeta.minDeg}°</span>
                  <span>0° (Neutro A)</span>
                  <span>+{currentParamMeta.maxDeg}°</span>
                </div>
              </div>

              {/* Edición directa de textos del diagrama */}
              <div className="grid grid-cols-1 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Título Técnico Superior
                  </label>
                  <input
                    type="text"
                    value={spec.headerTitle}
                    onChange={(e) =>
                      setSpec((prev) => ({ ...prev, headerTitle: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Etiqueta Anatómica Izquierda (Figura A)
                  </label>
                  <textarea
                    rows={2}
                    value={spec.topLeftSegmentLabel}
                    onChange={(e) =>
                      setSpec((prev) => ({ ...prev, topLeftSegmentLabel: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                </div>
              </div>

              {/* Opciones de Capas y Formato */}
              <div className="pt-2 border-t border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-sky-700" />
                    Capas de Anotación Vectorial y Formato
                  </span>
                  <div className="inline-flex rounded-md border border-slate-200 p-0.5 bg-slate-100">
                    <button
                      type="button"
                      onClick={() =>
                        setVisualOptions((o) => ({ ...o, aspectPreset: 'square_1000' }))
                      }
                      className={`px-2 py-1 rounded text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                        visualOptions.aspectPreset === 'square_1000'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600'
                      }`}
                    >
                      1:1 Lámina
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setVisualOptions((o) => ({ ...o, aspectPreset: 'plan_800x520' }))
                      }
                      className={`px-2 py-1 rounded text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                        visualOptions.aspectPreset === 'plan_800x520'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600'
                      }`}
                    >
                      800×560
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visualOptions.showBlueFanSector}
                      onChange={(e) =>
                        setVisualOptions((o) => ({
                          ...o,
                          showBlueFanSector: e.target.checked,
                        }))
                      }
                      className="rounded border-slate-300 text-sky-700"
                    />
                    <span>Sector azul (abanico)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visualOptions.showDegreeCalloutBoxes}
                      onChange={(e) =>
                        setVisualOptions((o) => ({
                          ...o,
                          showDegreeCalloutBoxes: e.target.checked,
                        }))
                      }
                      className="rounded border-slate-300 text-sky-700"
                    />
                    <span>Recuadros 30° y α=30°</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visualOptions.showHeaderBanner}
                      onChange={(e) =>
                        setVisualOptions((o) => ({
                          ...o,
                          showHeaderBanner: e.target.checked,
                        }))
                      }
                      className="rounded border-slate-300 text-sky-700"
                    />
                    <span>Franja superior técnica</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visualOptions.showBottomCaption}
                      onChange={(e) =>
                        setVisualOptions((o) => ({
                          ...o,
                          showBottomCaption: e.target.checked,
                        }))
                      }
                      className="rounded border-slate-300 text-sky-700"
                    />
                    <span>Pie técnico (Plano Sagital)</span>
                  </label>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-600">
                    <span>Transparencia del abanico geométrico azul</span>
                    <span className="font-mono tabular-nums">
                      {Math.round(visualOptions.sectorOpacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.22}
                    max={0.75}
                    step={0.02}
                    value={visualOptions.sectorOpacity}
                    onChange={(e) =>
                      setVisualOptions((o) => ({
                        ...o,
                        sectorOpacity: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-sky-700 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Columna Derecha: Lienzo Científico Renderizado + Comparativa de Referencia + Prompt */}
          <div className="xl:col-span-7 space-y-5">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-900">
                    Vista Previa en Verdadera Magnitud Sagital
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    α{spec.alphaSubscript} = {Math.abs(spec.angleDeg)}°
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowReferenceComparison((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      showReferenceComparison
                        ? 'bg-sky-700 text-white border-sky-800'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <SplitSquareHorizontal className="w-3.5 h-3.5" />
                    {showReferenceComparison ? 'Ocultar Referencia' : 'Comparar con Referencia'}
                  </button>

                  <select
                    value={qualityMode}
                    onChange={(e) =>
                      setQualityMode(e.target.value as 'hd_editorial' | 'compact_120kb')
                    }
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 cursor-pointer"
                  >
                    <option value="hd_editorial">PNG Alta Definición Editorial</option>
                    <option value="compact_120kb">PNG Compacto (&lt; 120 KB)</option>
                  </select>

                  <button
                    type="button"
                    onClick={handleDownloadCurrentComparativePng}
                    disabled={isExportingSingle}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {isExportingSingle ? 'Exportando...' : 'Descargar PNG'}
                  </button>
                </div>
              </div>

              {/* Lienzo 3D Sólido (o Vista Lado a Lado con Imagen de Referencia Adjunta) */}
              <div
                className={`grid gap-4 items-start ${
                  showReferenceComparison ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
                }`}
              >
                <div className="space-y-1.5">
                  {showReferenceComparison && (
                    <div className="text-xs font-semibold text-slate-700">
                      Ilustración Fotorrealista de Manual (Generada en Tiempo Real)
                    </div>
                  )}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 flex items-center justify-center overflow-hidden">
                    <canvas
                      ref={previewCanvasRef}
                      className="w-full max-w-[680px] h-auto bg-white shadow-2xs"
                    />
                  </div>
                </div>

                {showReferenceComparison && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-slate-700">
                      Estilo Objetivo de Referencia (Archivo Adjunto)
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 flex items-center justify-center overflow-hidden min-h-[280px]">
                      {!refImgError ? (
                        <img
                          src="/assets/aistudio/image_c1b8d286.png"
                          alt="Diagrama ergonómico comparativo A y B de referencia con flexión cervical de 30 grados"
                          referrerPolicy="no-referrer"
                          onError={() => setRefImgError(true)}
                          className="w-full max-w-[680px] h-auto object-contain bg-white"
                        />
                      ) : (
                        <div className="p-6 text-center text-xs text-slate-500">
                          Referencia visual estandarizada: Figura A neutra erguida · Figura B activa con abanico azul y recuadros αc = 30°.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Especificación / Prompt Científico Sincronizado en Inglés */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Especificación Técnica Sincronizada (Prompt Científico A/B)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Se actualiza automáticamente según el documento maestro o permite escribir parámetros en inglés/español y aplicarlos al modelo 3D
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleApplyFreePrompt}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Aplicar Texto al Modelo 3D
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyPrompt}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedPrompt ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copiar Prompt
                      </>
                    )}
                  </button>
                </div>
              </div>

              <textarea
                rows={5}
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-slate-50/70 p-3 font-mono text-xs text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODO 2: CATÁLOGO COMPLETO DE LAS 84 FIGURAS EN ESTILO SÓLIDO A/B      */}
      {/* ===================================================================== */}
      {studioTab === 'catalog' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar figura o archivo (ej. fig-4-13b)..."
                  className="pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900 w-64 focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>

              <select
                value={chapterFilter}
                onChange={(e) =>
                  setChapterFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 cursor-pointer"
              >
                <option value="all">Todos los capítulos ({BOOK_FIGURE_CATALOG.length} archivos)</option>
                {chaptersList.map(([chNum, chName]) => (
                  <option key={chNum} value={chNum}>
                    {chName}
                  </option>
                ))}
              </select>

              <select
                value={qualityMode}
                onChange={(e) =>
                  setQualityMode(e.target.value as 'hd_editorial' | 'compact_120kb')
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 cursor-pointer"
              >
                <option value="hd_editorial">Calidad HD Editorial</option>
                <option value="compact_120kb">Plan Exacto (&lt; 120 KB)</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleDownloadAllZip}
              disabled={Boolean(zipProgress)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <Archive className="w-4 h-4" />
              {zipProgress
                ? `Generando ZIP (${zipProgress.current}/${zipProgress.total})...`
                : `Descargar ZIP Completo (${BOOK_FIGURE_CATALOG.length} PNGs Exactos)`}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Lista de Figuras del Plan */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 max-h-[680px] overflow-y-auto space-y-1.5">
              {filteredCatalog.map((fig) => {
                const isSelected = fig.id === selectedBookFigure.id;
                return (
                  <button
                    key={fig.id}
                    type="button"
                    onClick={() => setSelectedBookFigId(fig.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold tabular-nums">
                        {fig.fileName}
                      </span>
                      <span
                        className={`text-[11px] font-mono tabular-nums ${
                          isSelected ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        Fig. {fig.figureNumber}
                        {fig.subPart || ''}
                      </span>
                    </div>
                    <div
                      className={`text-xs mt-0.5 line-clamp-1 ${
                        isSelected ? 'text-slate-200' : 'text-slate-600'
                      }`}
                    >
                      {fig.title}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Inspector de Figura Seleccionada */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                    <span>Figura {selectedBookFigure.figureNumber}{selectedBookFigure.subPart || ''}</span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedBookFigure.fileName}</span>
                    {catalogPreviewMeta && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          {catalogPreviewMeta.width}×{catalogPreviewMeta.height} px (
                          {(catalogPreviewMeta.sizeBytes / 1024).toFixed(1)} KB)
                        </span>
                      </>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mt-1">
                    {selectedBookFigure.title}
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">
                    {selectedBookFigure.bookDescription}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {selectedBookFigure.renderMode !== 'diagram' &&
                    selectedBookFigure.renderMode !== 'real_chart' && (
                      <button
                        type="button"
                        onClick={() => {
                          const converted =
                            buildSolidComparativeSpecFromBookFigure(selectedBookFigure);
                          setActivePresetId('custom');
                          setSpec(converted);
                          setStudioTab('comparative');
                        }}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Editar en Comparador A/B
                      </button>
                    )}

                  <button
                    type="button"
                    onClick={() => handleDownloadBookFigurePng(selectedBookFigure)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Descargar {selectedBookFigure.fileName}
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-center min-h-[380px]">
                {catalogPreviewUrl ? (
                  <img
                    src={catalogPreviewUrl}
                    alt={selectedBookFigure.title}
                    referrerPolicy="no-referrer"
                    className="max-w-full max-h-[580px] object-contain bg-white shadow-2xs"
                  />
                ) : (
                  <span className="text-xs text-slate-500">Renderizando lámina científica...</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODO 3: TABLA MAESTRA DE NOMENCLATURA Y DESCARGA DIRECTA              */}
      {/* ===================================================================== */}
      {studioTab === 'table' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Índice Completo del Plan de Figuras (Nomenclatura Exacta de Archivos)
              </h2>
              <p className="text-xs text-slate-500">
                Cada figura postural se renderiza automáticamente con el modelo humano 3D sólido comparativo (A vs B)
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadAllZip}
              disabled={Boolean(zipProgress)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Archive className="w-3.5 h-3.5" />
              {zipProgress
                ? `Empaquetando (${zipProgress.current}/${zipProgress.total})...`
                : 'Descargar Todo (.ZIP)'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                  <th className="py-2.5 px-4 whitespace-nowrap">Figura</th>
                  <th className="py-2.5 px-4">Contenido Técnico</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Modalidad</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Archivo Exacto</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {BOOK_FIGURE_CATALOG.map((fig) => {
                  const isDiagram =
                    fig.renderMode === 'diagram' || fig.renderMode === 'real_chart';
                  const derived = !isDiagram
                    ? buildSolidComparativeSpecFromBookFigure(fig)
                    : null;
                  return (
                    <tr key={fig.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {fig.figureNumber}
                        {fig.subPart || ''}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700">{fig.title}</td>
                      <td className="py-2.5 px-4 text-slate-600 font-mono tabular-nums whitespace-nowrap">
                        {derived
                          ? `Comparativa A/B · α${derived.alphaSubscript} = ${Math.abs(derived.angleDeg)}°`
                          : 'Diagrama / Gráfico'}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-sky-800 font-semibold whitespace-nowrap">
                        {fig.fileName}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedBookFigId(fig.id);
                              setStudioTab('catalog');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            Ver
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadBookFigurePng(fig)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-sky-700 hover:bg-sky-800 text-white font-medium cursor-pointer"
                          >
                            <Download className="w-3 h-3" />
                            PNG
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

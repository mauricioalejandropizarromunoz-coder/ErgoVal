import React, { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { trackVideoFrames } from '../utils/poseExtractor';
import {
  Archive,
  ArrowLeft,
  BookOpen,
  Box,
  CheckCircle2,
   ChevronLeft,
  ChevronRight,
  Crosshair,
  Download,
  Eye,
  FileDown,
  FolderArchive,
  Image as ImageIcon,
  Link2,
  RotateCcw,
  Search,
  Sliders,
  Sparkles,
  Table,
  Upload,
  X,
} from 'lucide-react';
import {
  BookFigureFileSpec,
  CameraPreset,
  FocusZone,
  JointKey,
  Panel3DSpec,
  PosturePose3D,
} from '../types/figurePlan';
import {
  BOOK_FIGURE_CATALOG,
  clearCustomFigurePhotoOverride,
  countAssignedFigurePhotos,
  getEffectiveFigurePhotoUrl,
  hasCustomFigurePhotoOverride,
  makeNeutralPose,
  parseBiomechanicalPromptToPanel,
  setCustomFigurePhotoOverride,
  subscribeFigurePhotoOverrides,
} from '../utils/figurePlanCatalog';
import {
  CameraOrbitOverride,
  DEFAULT_ORBIT_OVERRIDE,
  FigureRenderOptions,
  renderBookFigureToCanvas,
  renderBookFigureToPng,
  subscribeAvatarGlbLoaded,
} from '../utils/biomech3dRenderer';
import {
  exportCanvasToHighQualityPng,
  exportCanvasToOptimizedPng,
} from '../utils/pngOptimizer';
import { InteractivePhotoGoniometer } from './InteractivePhotoGoniometer';

type CatalogViewSourceMode =
  | 'synthetic_3d'
  | 'compare_side'
  | 'goniometer'
  | 'assigned_photo';

interface FigurePlanStudioProps {
  onBackToEvaluator: () => void;
}

const BOOK_PDF_PATH =
  '/assets/aistudio/Evaluaci_n_ergon_mica_de_puestos_de_trabajo_-_Mauricio_Alejandro_Pizarro_Mu_oz_c375123e.pdf';

const CHAPTER_FILTERS: { id: number | 'all' | 'photos'; label: string }[] = [
  { id: 'all', label: 'Todas (84)' },
  { id: 'photos', label: 'Con Fotografía (36)' },
  { id: 1, label: 'Cap. 1' },
  { id: 4, label: 'Cap. 4 · RULA/REBA/OWAS' },
  { id: 5, label: 'Cap. 5 · Cargas/NIOSH' },
  { id: 6, label: 'Cap. 6 · OCRA/JSI' },
  { id: 7, label: 'Cap. 7 · Térmico' },
  { id: 8, label: 'Cap. 8 · Vibraciones' },
  { id: 9, label: 'Cap. 9–10 · Gestión' },
  { id: 11, label: 'Cap. 11–13 · Casos' },
];

const FOCUS_ZONE_LABELS: Record<FocusZone, string> = {
  wrist_hand: 'Mano y Muñeca (Segmento Aislado)',
  ankle_foot: 'Pie y Tobillo (Segmento Aislado)',
  elbow_forearm: 'Codo y Antebrazo (Segmento Aislado)',
  shoulder_arm: 'Hombro y Brazo (Segmento Aislado)',
  neck_cervical: 'Cuello y Columna Cervical (Segmento Aislado)',
  lumbar_l5s1: 'Segmento Lumbar L5/S1 (Aislado)',
  trunk_pelvis: 'Tronco y Pelvis (Segmento Aislado)',
  legs_knees: 'Piernas y Rodillas (Segmento Aislado)',
  full_body: 'Cuerpo Humano Completo',
};

const CAMERA_PRESET_LABELS: Record<CameraPreset, string> = {
  sagittal_right: 'Plano Sagital Derecho (Verdadera Magnitud)',
  sagittal_left: 'Plano Sagital Izquierdo (Verdadera Magnitud)',
  frontal: 'Plano Frontal / Coronal',
  dorsal: 'Plano Dorsal / Posterior',
  top: 'Plano Superior / Cenital',
  isometric: 'Vista Isométrica Técnica 3D',
  perspective_oblique: 'Perspectiva Oblicua (Deformación Óptica)',
};

const PROMPT_EXAMPLES = [
  'Mano y muñeca en flexión palmar de 35° con desviación cubital y vector F = 40 N',
  'Segmento lumbar L5/S1 con flexión de tronco a 50° y compresión discal F = 3.2 kN',
  'Pie y tobillo en dorsiflexión de 18° con vector de reacción plantar F = 380 N',
  'Articulación del codo en flexión de 95° sosteniendo herramienta con carga F = 45 N',
  'Abducción de hombro y brazo a 70° en plano frontal con vector F = 30 N',
];

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function getCanvasMaxWidthClass(widthPx: number): string {
  if (widthPx <= 480) return 'w-full max-w-[480px]';
  if (widthPx <= 640) return 'w-full max-w-[640px]';
  return 'w-full max-w-[800px]';
}

export const FigurePlanStudio: React.FC<FigurePlanStudioProps> = ({ onBackToEvaluator }) => {
  const [studioTab, setStudioTab] = useState<'catalog' | 'table' | 'custom'>('catalog');

  // --- EXPORT QUALITY & NOMENCLATURE SETTINGS ---
  const [exportQuality, setExportQuality] = useState<'hd_lossless' | 'compact_120kb'>('hd_lossless');
  const [includeAll84Figures, setIncludeAll84Figures] = useState(true);
  const [useImagesSubfolder, setUseImagesSubfolder] = useState(false);
  const [readyZipLink, setReadyZipLink] = useState<{
    url: string;
    fileName: string;
    count: number;
    sizeMb: string;
  } | null>(null);

  // --- CATALOG MODE STATE ---
  const [chapterFilter, setChapterFilter] = useState<number | 'all' | 'photos'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>(BOOK_FIGURE_CATALOG[1]?.id || 'fig-4-01');
  const [orbit, setOrbit] = useState<CameraOrbitOverride>(DEFAULT_ORBIT_OVERRIDE);
  const [viewSourceMode, setViewSourceMode] = useState<CatalogViewSourceMode>('synthetic_3d');
  const [includeHeaderOnPhoto, setIncludeHeaderOnPhoto] = useState<boolean>(true);
  const [photoRenderTick, setPhotoRenderTick] = useState<number>(0);
  const [panelTargetIdx, setPanelTargetIdx] = useState<number>(0);
  const [poseOverrides, setPoseOverrides] = useState<Partial<PosturePose3D> | null>(null);
  const [activeJointField, setActiveJointField] = useState<
    | 'shoulderRFlexionDeg'
    | 'shoulderRAbductionDeg'
    | 'elbowRFlexionDeg'
    | 'wristRFlexionDeg'
    | 'neckFlexionDeg'
    | 'trunkFlexionDeg'
    | 'kneeRFlexionDeg'
  >('shoulderRFlexionDeg');
  const [compareImgFailed, setCompareImgFailed] = useState<boolean>(false);

  const [pngStats, setPngStats] = useState<{ sizeBytes: number; width: number; height: number } | null>(null);
  const [isExportingSingle, setIsExportingSingle] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [isPdfViewerOpen, setIsPdfViewerOpen] = useState(false);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const customPhotoInputRef = useRef<HTMLInputElement>(null);
  const dragOrbitRef = useRef<{ startX: number; startY: number; az0: number; el0: number } | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchOrbitRef = useRef<{ startDist: number; startZoom: number } | null>(null);

  // --- CUSTOM 3D ENGINE STATE ---
  const [promptInput, setPromptInput] = useState(PROMPT_EXAMPLES[0]);
  const [customFormat, setCustomFormat] = useState<'single_480x640' | 'dual_800x520' | 'scene_800x520'>('single_480x640');
  const [customFileName, setCustomFileName] = useState('fig-aislada-3d.png');
  const [customFocusZone, setCustomFocusZone] = useState<FocusZone>('wrist_hand');
  const [customCamera, setCustomCamera] = useState<CameraPreset>('sagittal_right');
  const [customPrimaryDeg, setCustomPrimaryDeg] = useState<number>(35);
  const [customSecondaryDeg, setCustomSecondaryDeg] = useState<number>(15);
  const [customCompareDeg, setCustomCompareDeg] = useState<number>(0);
  const [customAlphaLabel, setCustomAlphaLabel] = useState<string>('α = 35°');
  const [customForceLabel, setCustomForceLabel] = useState<string>('F = 40 N');
  const [customForceDir, setCustomForceDir] = useState<'down' | 'up' | 'left' | 'right'>('down');
  const [customTitle, setCustomTitle] = useState<string>('Flexión palmar y desviación de mano y muñeca');
  const [customOrbit, setCustomOrbit] = useState<CameraOrbitOverride>(DEFAULT_ORBIT_OVERRIDE);
  const [customPngStats, setCustomPngStats] = useState<{ sizeBytes: number; width: number; height: number } | null>(
    null,
  );
  const customCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const unsubPhoto = subscribeFigurePhotoOverrides(() => {
      setPhotoRenderTick((t) => t + 1);
    });
    const unsubGlb = subscribeAvatarGlbLoaded(() => {
      setPhotoRenderTick((t) => t + 1);
    });
    return () => {
      unsubPhoto();
      unsubGlb();
    };
  }, []);

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (readyZipLink?.url) {
        URL.revokeObjectURL(readyZipLink.url);
      }
    };
  }, [readyZipLink]);

  const filteredCatalog = useMemo(() => {
    void photoRenderTick;
    const q = searchQuery.trim().toLowerCase();
    return BOOK_FIGURE_CATALOG.filter((item) => {
      if (chapterFilter === 'photos') {
        if (!getEffectiveFigurePhotoUrl(item)) return false;
      } else if (chapterFilter !== 'all') {
        if (chapterFilter === 9) {
          if (item.chapter !== 9 && item.chapter !== 10) return false;
        } else if (chapterFilter === 11) {
          if (item.chapter < 11) return false;
        } else if (item.chapter !== chapterFilter) {
          return false;
        }
      }
      if (!q) return true;
      return (
        item.fileName.toLowerCase().includes(q) ||
        item.figureNumber.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.bookDescription.toLowerCase().includes(q)
      );
    });
  }, [chapterFilter, searchQuery, photoRenderTick]);

  const selectedSpec: BookFigureFileSpec = useMemo(() => {
    return (
      BOOK_FIGURE_CATALOG.find((f) => f.id === selectedId) ||
      filteredCatalog[0] ||
      BOOK_FIGURE_CATALOG[0]
    );
  }, [selectedId, filteredCatalog]);

  const selectedIndexInFiltered = useMemo(
    () => filteredCatalog.findIndex((f) => f.id === selectedSpec.id),
    [filteredCatalog, selectedSpec.id],
  );

  useEffect(() => {
    setOrbit(DEFAULT_ORBIT_OVERRIDE);
    setPoseOverrides(null);
    setPanelTargetIdx(0);
    setCompareImgFailed(false);
  }, [selectedSpec.id]);

  // Apply live joint overrides to selectedSpec when manipulating 3D kinematics
  const effectiveSelectedSpec: BookFigureFileSpec = useMemo(() => {
    if (!poseOverrides || !selectedSpec.panels || selectedSpec.panels.length === 0) {
      return selectedSpec;
    }
    const nextPanels = selectedSpec.panels.map((p, idx) => {
      if (idx !== panelTargetIdx) return p;
      return {
        ...p,
        pose: {
          ...p.pose,
          ...poseOverrides,
        },
      };
    });
    return {
      ...selectedSpec,
      panels: nextPanels,
    };
  }, [selectedSpec, poseOverrides, panelTargetIdx]);

  // Render Catalog Preview Canvas at crisp 2x Retina DPI
  useEffect(() => {
    if (studioTab !== 'catalog' || viewSourceMode === 'goniometer') return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const photoUrl = getEffectiveFigurePhotoUrl(selectedSpec);
    const hasPhoto = Boolean(photoUrl);
    const renderSynthetic =
      !hasPhoto ||
      viewSourceMode === 'synthetic_3d' ||
      viewSourceMode === 'compare_side';

    const renderOpts: FigureRenderOptions = {
      preferSynthetic3D: renderSynthetic,
      includeHeaderOnPhoto,
      visualStyle: 'anatomical_skin',
      transparentBg: false,
      onAsyncPhotoLoaded: () => setPhotoRenderTick((t) => t + 1),
    };

    // Dibuja como máximo una vez por frame (escala adaptativa 1.35x en celulares para fluidez GPU, 2x en escritorio)
    const raf = window.requestAnimationFrame(() => {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      renderBookFigureToCanvas(effectiveSelectedSpec, canvas, orbit, isMobile ? 1.35 : 2, renderOpts);
    });

    // El tamaño del PNG se calcula solo cuando el usuario deja de mover (1 s)
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const exporter =
        exportQuality === 'hd_lossless'
          ? () => exportCanvasToHighQualityPng(canvas)
          : () => {
              const c1 = document.createElement('canvas');
              renderBookFigureToCanvas(effectiveSelectedSpec, c1, orbit, 1, renderOpts);
              return exportCanvasToOptimizedPng(c1);
            };

      exporter()
        .then((res) => {
          if (!cancelled) {
            setPngStats({ sizeBytes: res.sizeBytes, width: res.width, height: res.height });
          }
        })
        .catch(() => {});
    }, 1000);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [
    studioTab,
    selectedSpec,
    effectiveSelectedSpec,
    orbit,
    exportQuality,
    viewSourceMode,
    includeHeaderOnPhoto,
    photoRenderTick,
  ]);

  // Build Custom BookFigureFileSpec dynamically from isolated parametric controls
  const customSpec: BookFigureFileSpec = useMemo(() => {
    const buildPanelForAngle = (deg: number, secDeg: number, subLabel: string, badge: string): Panel3DSpec => {
      const pose = makeNeutralPose();
      let arcJoint: JointKey = 'wristR';
      let arcTo: JointKey = 'handR';
      let refType: 'vertical_down' | 'vertical_up' | 'horizontal' | 'trunk_axis' = 'horizontal';
      let forceJoint: JointKey = 'handR';

      switch (customFocusZone) {
        case 'wrist_hand':
          pose.elbowRFlexionDeg = 90;
          pose.wristRFlexionDeg = deg;
          pose.wristRDeviationDeg = secDeg;
          arcJoint = 'wristR';
          arcTo = 'handR';
          refType = 'horizontal';
          forceJoint = 'handR';
          break;
        case 'ankle_foot':
          pose.ankleRDorsiflexionDeg = deg;
          arcJoint = 'ankleR';
          arcTo = 'footR';
          refType = 'horizontal';
          forceJoint = 'footR';
          break;
        case 'elbow_forearm':
          pose.elbowRFlexionDeg = deg;
          pose.forearmRPronationDeg = secDeg;
          arcJoint = 'elbowR';
          arcTo = 'wristR';
          refType = 'vertical_down';
          forceJoint = 'handR';
          break;
        case 'shoulder_arm':
          if (customCamera === 'frontal' || customCamera === 'dorsal') {
            pose.shoulderRAbductionDeg = Math.max(0, deg);
          } else {
            pose.shoulderRFlexionDeg = deg;
          }
          pose.elbowRFlexionDeg = Math.max(15, secDeg);
          arcJoint = 'shoulderR';
          arcTo = 'elbowR';
          refType = 'trunk_axis';
          forceJoint = 'elbowR';
          break;
        case 'neck_cervical':
          pose.neckFlexionDeg = deg;
          pose.neckLateralDeg = secDeg;
          arcJoint = 'c7';
          arcTo = 'head';
          refType = 'vertical_up';
          forceJoint = 'head';
          break;
        case 'lumbar_l5s1':
        case 'trunk_pelvis':
          pose.trunkFlexionDeg = deg;
          pose.trunkLateralDeg = secDeg;
          pose.shoulderRFlexionDeg = Math.max(15, deg * 0.85);
          pose.highlightGroup = 'l5s1_disc';
          arcJoint = 'l5s1';
          arcTo = 'c7';
          refType = 'vertical_up';
          forceJoint = 'l5s1';
          break;
        case 'legs_knees':
          pose.hipRFlexionDeg = deg * 0.65;
          pose.kneeRFlexionDeg = Math.max(0, deg);
          pose.hipLFlexionDeg = deg * 0.65;
          pose.kneeLFlexionDeg = Math.max(0, deg);
          arcJoint = 'kneeR';
          arcTo = 'ankleR';
          refType = 'vertical_down';
          forceJoint = 'kneeR';
          break;
        case 'full_body':
          pose.trunkFlexionDeg = deg;
          pose.shoulderRFlexionDeg = Math.max(20, secDeg);
          pose.kneeRFlexionDeg = 22;
          arcJoint = 'l5s1';
          arcTo = 'c7';
          refType = 'vertical_up';
          forceJoint = 'handR';
          break;
      }

      const dirVec =
        customForceDir === 'down'
          ? { dx: 0, dy: 1 }
          : customForceDir === 'up'
            ? { dx: 0, dy: -1 }
            : customForceDir === 'left'
              ? { dx: -1, dy: 0 }
              : { dx: 1, dy: 0 };

      return {
        subTitle: subLabel,
        scoreBadge: badge,
        focusZone: customFocusZone,
        cameraPreset: customCamera,
        pose,
        angleArcs: [
          {
            joint: arcJoint,
            toJoint: arcTo,
            refType,
            label: badge === 'Postura A (Referencia)' ? `α = ${deg}°` : customAlphaLabel || `α = ${deg}°`,
          },
        ],
        forceVectors: customForceLabel.trim()
          ? [
              {
                atJoint: forceJoint,
                dx: dirVec.dx,
                dy: dirVec.dy,
                lengthPx: 50,
                label: customForceLabel,
              },
            ]
          : [],
        noteBottom:
          customFocusZone === 'full_body'
            ? 'Evaluación postural · Iluminación de estudio'
            : `Zona aislada: ${FOCUS_ZONE_LABELS[customFocusZone].replace(' (Segmento Aislado)', '')}`,
      };
    };

    if (customFormat === 'dual_800x520') {
      return {
        id: 'custom-dual',
        figureNumber: '3D',
        fileName: customFileName || 'fig-comparativa-3d.png',
        chapter: 0,
        chapterTitle: 'Motor 3D Aislado',
        title: customTitle,
        bookDescription: promptInput,
        bodiesRule: '2',
        widthPx: 800,
        heightPx: 520,
        renderMode: '3d_dual',
        panels: [
          buildPanelForAngle(customCompareDeg, 0, 'Condición Base / Neutra', 'Postura A (Referencia)'),
          buildPanelForAngle(customPrimaryDeg, customSecondaryDeg, 'Condición Evaluada', 'Postura B (Evaluada)'),
        ],
      };
    }

    const w = customFormat === 'scene_800x520' ? 800 : 480;
    const h = customFormat === 'scene_800x520' ? 520 : 640;

    return {
      id: 'custom-single',
      figureNumber: '3D',
      fileName: customFileName || 'fig-aislada-3d.png',
      chapter: 0,
      chapterTitle: 'Motor 3D Aislado',
      title: customTitle,
      bookDescription: promptInput,
      bodiesRule: '1',
      widthPx: w,
      heightPx: h,
      renderMode: '3d_single',
      panels: [
        buildPanelForAngle(
          customPrimaryDeg,
          customSecondaryDeg,
          FOCUS_ZONE_LABELS[customFocusZone],
          'Aislamiento Anatómico',
        ),
      ],
    };
  }, [
    customFormat,
    customFileName,
    customTitle,
    promptInput,
    customFocusZone,
    customCamera,
    customPrimaryDeg,
    customSecondaryDeg,
    customCompareDeg,
    customAlphaLabel,
    customForceLabel,
    customForceDir,
  ]);

  useEffect(() => {
    void photoRenderTick;
    if (studioTab !== 'custom') return;
    const canvas = customCanvasRef.current;
    if (!canvas) return;
    renderBookFigureToCanvas(customSpec, canvas, customOrbit, 2, {
      preferSynthetic3D: true,
      visualStyle: 'anatomical_skin',
    });

    let cancelled = false;
    const timer = window.setTimeout(() => {
      exportCanvasToHighQualityPng(canvas)
        .then((res) => {
          if (!cancelled) {
            setCustomPngStats({ sizeBytes: res.sizeBytes, width: res.width, height: res.height });
          }
        })
        .catch(() => {});
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [studioTab, customSpec, customOrbit, photoRenderTick]);

  const handleApplyPrompt = (textToParse = promptInput) => {
    const parsed = parseBiomechanicalPromptToPanel(textToParse);
    setCustomFocusZone(parsed.focusZone);
    setCustomCamera(parsed.panel.cameraPreset);
    setCustomTitle(parsed.panel.subTitle);

    const degMatch = textToParse.match(/(-?\d+(?:[.,]\d+)?)\s*(?:°|º|grados)/i);
    const deg = degMatch ? parseFloat(degMatch[1].replace(',', '.')) : 35;
    setCustomPrimaryDeg(deg);
    setCustomAlphaLabel(`α = ${Math.abs(deg)}°`);

    const forceMatch = textToParse.match(/(\d+(?:[.,]\d+)?)\s*(n|kn|kgf|kg)\b/i);
    setCustomForceLabel(forceMatch ? `F = ${forceMatch[1]} ${forceMatch[2].toUpperCase()}` : 'F');
    setCustomOrbit(DEFAULT_ORBIT_OVERRIDE);
  };

  const handleDownloadSpecPng = async (
    specToExport: BookFigureFileSpec,
    orbitToUse = DEFAULT_ORBIT_OVERRIDE,
    forceSynthetic3D?: boolean,
  ) => {
    try {
      setIsExportingSingle(true);
      const isExportingSelectedIn3D =
        forceSynthetic3D ??
        (specToExport.id === selectedSpec.id &&
          (viewSourceMode === 'synthetic_3d' ||
            viewSourceMode === 'compare_side' ||
            Boolean(poseOverrides)));

      const res = await renderBookFigureToPng(specToExport, orbitToUse, exportQuality, {
        preferSynthetic3D: isExportingSelectedIn3D,
        includeHeaderOnPhoto,
        visualStyle: 'anatomical_skin',
      });
      if (specToExport.id === selectedSpec.id) {
        setPngStats({ sizeBytes: res.sizeBytes, width: res.width, height: res.height });
      }
      const cleanName = specToExport.fileName.endsWith('.png')
        ? specToExport.fileName
        : `${specToExport.fileName}.png`;
      triggerBlobDownload(res.blob, cleanName);
    } finally {
      setIsExportingSingle(false);
    }
  };

  const handleUploadCustomFigurePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomFigurePhotoOverride(selectedSpec.id, reader.result);
        setViewSourceMode('compare_side');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  /**
   * Builds a ZIP containing ONLY the exact PNG files with their origin nomenclature:
   * fig-1-01.png, fig-4-01.png, ..., fig-13-04.png (no extra text or manifest files).
   */
  const handleGenerateAndDownloadZip = async (scope: 'all' | 'chapter') => {
    if (batchProgress) return;
    const list = BOOK_FIGURE_CATALOG.filter((item) => {
      if (!includeAll84Figures && item.isExistingRealChart) return false;
      if (scope === 'chapter') {
        return item.chapter === selectedSpec.chapter;
      }
      return true;
    });

    if (list.length === 0) return;

    try {
      const zip = new JSZip();
      const targetContainer = useImagesSubfolder ? zip.folder('images') || zip : zip;

      for (let i = 0; i < list.length; i++) {
        const spec = list[i];
        setBatchProgress({
          current: i + 1,
          total: list.length,
          label: spec.fileName,
        });
        await new Promise((r) => window.setTimeout(r, 6));
        const rendered = await renderBookFigureToPng(spec, DEFAULT_ORBIT_OVERRIDE, exportQuality, {
          preferSynthetic3D: false,
          includeHeaderOnPhoto,
        });
        // Strictly ONLY the image file with its exact origin filename (e.g., fig-1-01.png, fig-4-01.png)
        targetContainer.file(spec.fileName, rendered.blob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const zipName =
        scope === 'chapter'
          ? `figuras-capitulo-${selectedSpec.chapter}-${exportQuality === 'hd_lossless' ? 'alta-calidad' : 'compacto'}.zip`
          : exportQuality === 'hd_lossless'
            ? 'figuras-plan-completo-alta-calidad.zip'
            : 'figuras-plan-completo-compacto.zip';

      if (scope === 'all') {
        if (readyZipLink?.url) {
          URL.revokeObjectURL(readyZipLink.url);
        }
        const persistentUrl = URL.createObjectURL(zipBlob);
        setReadyZipLink({
          url: persistentUrl,
          fileName: zipName,
          count: list.length,
          sizeMb: (zipBlob.size / (1024 * 1024)).toFixed(2),
        });
      }

      triggerBlobDownload(zipBlob, zipName);
    } finally {
      setBatchProgress(null);
    }
  };

  const selectedAssignedPhotoUrl = useMemo(() => {
    void photoRenderTick;
    return getEffectiveFigurePhotoUrl(selectedSpec);
  }, [selectedSpec, photoRenderTick]);

  const isShowingPureAssignedPhoto =
    Boolean(selectedAssignedPhotoUrl) && viewSourceMode === 'assigned_photo';
  const hasCustomOverrideForSelected = useMemo(() => {
    void photoRenderTick;
    return hasCustomFigurePhotoOverride(selectedSpec.id);
  }, [selectedSpec.id, photoRenderTick]);

  const assignedPhotosTotal = useMemo(() => {
    void photoRenderTick;
    return countAssignedFigurePhotos();
  }, [photoRenderTick]);

  const handleCanvasPointerDown = (
    e: React.PointerEvent<HTMLCanvasElement>,
    isCustom: boolean,
  ) => {
    if (!isCustom && isShowingPureAssignedPhoto) return;
    const activeMode = isCustom ? customSpec.renderMode : selectedSpec.renderMode;
    if (activeMode === 'diagram' || activeMode === 'real_chart') return;
    const current = isCustom ? customOrbit : orbit;
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      pinchOrbitRef.current = { startDist: Math.max(20, dist), startZoom: current.zoom };
      dragOrbitRef.current = null;
    } else if (activePointersRef.current.size === 1) {
      pinchOrbitRef.current = null;
      dragOrbitRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        az0: current.azimuthDeg,
        el0: current.elevationDeg,
      };
    }
  };

  const handleCanvasPointerMove = (
    e: React.PointerEvent<HTMLCanvasElement>,
    isCustom: boolean,
  ) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (activePointersRef.current.size === 2 && pinchOrbitRef.current) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const ratio = dist / pinchOrbitRef.current.startDist;
      const nextZoom = Math.max(
        0.65,
        Math.min(1.85, Math.round(pinchOrbitRef.current.startZoom * ratio * 100) / 100),
      );
      if (isCustom) {
        setCustomOrbit((prev) => ({ ...prev, zoom: nextZoom }));
      } else {
        setOrbit((prev) => ({ ...prev, zoom: nextZoom }));
      }
      return;
    }

    if (!dragOrbitRef.current) return;
    const dx = e.clientX - dragOrbitRef.current.startX;
    const dy = e.clientY - dragOrbitRef.current.startY;
    const nextAz = Math.max(-180, Math.min(180, Math.round(dragOrbitRef.current.az0 - dx * 0.45)));
    const nextEl = Math.max(-65, Math.min(65, Math.round(dragOrbitRef.current.el0 + dy * 0.35)));
    if (isCustom) {
      setCustomOrbit((prev) => ({ ...prev, azimuthDeg: nextAz, elevationDeg: nextEl }));
    } else {
      setOrbit((prev) => ({ ...prev, azimuthDeg: nextAz, elevationDeg: nextEl }));
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      pinchOrbitRef.current = null;
    }
    if (activePointersRef.current.size === 0) {
      dragOrbitRef.current = null;
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  const is3DSelected = selectedSpec.renderMode === '3d_single' || selectedSpec.renderMode === '3d_dual';
  const activePanelPose: PosturePose3D | null =
    effectiveSelectedSpec.panels?.[panelTargetIdx]?.pose || null;

  const updateLiveJoint = (key: keyof PosturePose3D, val: number) => {
    setPoseOverrides((prev) => ({
      ...(prev || {}),
      [key]: val,
    }));
  };
  const totalInZip = includeAll84Figures
    ? BOOK_FIGURE_CATALOG.length
    : BOOK_FIGURE_CATALOG.filter((f) => !f.isExistingRealChart).length;

  // Group catalog rows by Figure Number (e.g. 4.4 -> fig-4-04a.png, fig-4-04b.png) for exact Plan de Figuras table view
  const groupedPlanRows = useMemo(() => {
    const map = new Map<
      string,
      {
        figureNumber: string;
        chapter: number;
        title: string;
        bodiesLabel: string;
        files: BookFigureFileSpec[];
      }
    >();

    for (const item of BOOK_FIGURE_CATALOG) {
      const existing = map.get(item.figureNumber);
      if (existing) {
        existing.files.push(item);
      } else {
        map.set(item.figureNumber, {
          figureNumber: item.figureNumber,
          chapter: item.chapter,
          title: item.title.replace(/\s*\(Parte\s+[a-d]\)$/i, ''),
          bodiesLabel: item.bodiesRule === 'diagrama' ? 'diagrama' : String(item.bodiesRule),
          files: [item],
        });
      }
    }

    return Array.from(map.values()).map((row) => {
      if (row.files.length > 1 && row.bodiesLabel !== 'diagrama') {
        const totalBodies = row.files.reduce(
          (acc, f) => acc + (f.bodiesRule === '2' ? 2 : f.bodiesRule === '1' ? 1 : 0),
          0,
        );
        return { ...row, bodiesLabel: String(totalBodies) };
      }
      return row;
    });
  }, []);

  return (
    <div className="space-y-5">
      {/* CABECERA Y ENLACE DE DESCARGA DIRECTA DEL PAQUETE DE IMÁGENES EN ALTA CALIDAD */}
      <section className="bg-white border border-slate-300 rounded-lg p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-sky-800 font-semibold">
              <span>Ilustración Anatómica Humana 3D</span>
              <span className="text-slate-300">·</span>
              <span className="tabular-nums">{assignedPhotosTotal} Fotografías Adjuntas Asignadas (Cap. 4)</span>
              <span className="text-slate-300">·</span>
              <span className="tabular-nums">Alta Nitidez 2× sin pérdida</span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Motor Biomecánico Anatómico PBR (.glb) y Archivo de Figuras (`fig-1-01.png` … `fig-13-04.png`)
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-4xl leading-relaxed">
              Modelo anatómico humano realista cargado mediante GLTFLoader con texturas PBR (camiseta blanca y shorts celestes),
              iluminación de estudio con sombras suaves, mapeo directo de rotaciones articulares sobre huesos y exportación PNG
              con la nomenclatura exacta del plan de figuras.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsPdfViewerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-sky-700" />
              Consultar Libro PDF
            </button>

            <button
              type="button"
              onClick={onBackToEvaluator}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-800 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Volver a ErgoEval
            </button>
          </div>
        </div>

        {/* ZONA DESTACADA DE ARCHIVO Y ENLACE DE DESCARGA EN ALTA CALIDAD (SOLO IMÁGENES CON NOMENCLATURA EXACTA) */}
        <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-3.5 sm:p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2">
              <FolderArchive className="w-4 h-4 text-sky-700 shrink-0" />
              <span>
                Archivo descargable de alta calidad (contiene únicamente las imágenes con su nombre exacto: `fig-1-01.png`, `fig-4-01.png`, …)
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-xs text-slate-700">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <span className="font-semibold text-slate-800">Calidad:</span>
                <select
                  value={exportQuality}
                  onChange={(e) => setExportQuality(e.target.value as 'hd_lossless' | 'compact_120kb')}
                  className="px-2 py-1 rounded border border-slate-300 bg-white text-slate-900 font-medium text-xs"
                >
                  <option value="hd_lossless">Alta Calidad HD (24-bit sin pérdida · Doble nitidez 2×)</option>
                  <option value="compact_120kb">Editorial Compacto (&lt; 120 KB · Escala 1×)</option>
                </select>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeAll84Figures}
                  onChange={(e) => setIncludeAll84Figures(e.target.checked)}
                  className="rounded border-slate-400 text-sky-700"
                />
                <span>Incluir las 84 figuras completas (incluye 7.2, 12.1, 13.3 y 13.4)</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useImagesSubfolder}
                  onChange={(e) => setUseImagesSubfolder(e.target.checked)}
                  className="rounded border-slate-400 text-sky-700"
                />
                <span>Agrupar dentro de subcarpeta `images/`</span>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => handleGenerateAndDownloadZip('all')}
              disabled={Boolean(batchProgress)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-xs sm:text-sm font-semibold text-white cursor-pointer shadow-2xs"
            >
              <FileDown className="w-4 h-4" />
              {batchProgress
                ? `Generando ${batchProgress.current}/${batchProgress.total} (${batchProgress.label})...`
                : `Generar y Descargar ZIP (${totalInZip} imágenes PNG)`}
            </button>

            {readyZipLink && !batchProgress && (
              <a
                href={readyZipLink.url}
                download={readyZipLink.fileName}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold shadow-2xs"
              >
                <Link2 className="w-4 h-4" />
                <span>
                  Enlace directo: {readyZipLink.fileName} ({readyZipLink.sizeMb} MB)
                </span>
              </a>
            )}
          </div>
        </div>

        {/* Selector de vistas internas */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="inline-flex flex-wrap rounded-md border border-slate-300 bg-slate-100 p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => setStudioTab('catalog')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
                studioTab === 'catalog'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              Visor 3D del Plan de Figuras ({BOOK_FIGURE_CATALOG.length})
            </button>

            <button
              type="button"
              onClick={() => setStudioTab('table')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
                studioTab === 'table'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              Tabla Oficial y Enlaces Individuales (`Figura · Contenido · Cuerpos · Archivos`)
            </button>

            <button
              type="button"
              onClick={() => setStudioTab('custom')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
                studioTab === 'custom'
                  ? 'bg-sky-700 text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generador 3D Aislado por Parámetros
            </button>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* MODO 1: CATÁLOGO INTERACTIVO Y PREVISUALIZACIÓN HD NITIDEZ 2X         */}
      {/* ===================================================================== */}
      {studioTab === 'catalog' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* COLUMNA IZQUIERDA (EN MÓVIL DEBAJO DEL VISOR 3D): ÍNDICE FILTRABLE DE LAS 84 FIGURAS */}
          <aside className="order-2 lg:order-1 lg:col-span-5 bg-white border border-slate-300 rounded-lg overflow-hidden shadow-2xs">
            <div className="p-3.5 border-b border-slate-200 space-y-3 bg-slate-50">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar ej. fig-4-01.png, muñeca, tobillo, lumbar..."
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
                {CHAPTER_FILTERS.map((cf) => {
                  const active = chapterFilter === cf.id;
                  return (
                    <button
                      key={String(cf.id)}
                      type="button"
                      onClick={() => setChapterFilter(cf.id)}
                      className={`px-2 py-1 rounded text-[11px] font-medium cursor-pointer border transition-colors ${
                        active
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {cf.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-600 font-mono tabular-nums">
                <span>Mostrando {filteredCatalog.length} de {BOOK_FIGURE_CATALOG.length} archivos</span>
                <span>Nomenclatura exacta</span>
              </div>
            </div>

            <div className="max-h-[640px] overflow-y-auto divide-y divide-slate-200">
              {filteredCatalog.map((item) => {
                const isSelected = item.id === selectedSpec.id;
                const itemHasPhoto = Boolean(getEffectiveFigurePhotoUrl(item));
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`w-full text-left px-3.5 py-2.5 transition-colors cursor-pointer block ${
                      isSelected ? 'bg-sky-50/90' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-mono text-xs font-bold ${
                          isSelected ? 'text-sky-800' : 'text-slate-900'
                        }`}
                      >
                        {item.fileName}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                        {itemHasPhoto ? (
                          <span className="text-emerald-700 font-semibold">Foto asignada · </span>
                        ) : null}
                        {item.widthPx}×{item.heightPx} ·{' '}
                        {item.bodiesRule === 'diagrama'
                          ? 'diagrama'
                          : item.bodiesRule === '2'
                            ? '2 cuerpos'
                            : '1 cuerpo'}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-slate-800 mt-0.5 line-clamp-1">
                      Fig. {item.figureNumber}
                      {item.subPart || ''} — {item.title}
                    </div>
                  </button>
                );
              })}

              {filteredCatalog.length === 0 && (
                <div className="p-8 text-center text-xs text-slate-500">
                  No se encontraron figuras que coincidan con la búsqueda.
                </div>
              )}
            </div>
          </aside>

          {/* COLUMNA DERECHA (EN CELULARES ARRIBA DEL TODO): VISOR TÉCNICO 3D Y DESCARGA EXACTA */}
          <section className="order-1 lg:order-2 lg:col-span-7 bg-white border border-slate-300 rounded-lg p-4 sm:p-5 shadow-2xs space-y-4">
            {/* Selector rápido móvil para cambiar de figura sin desplazarse al listado inferior */}
            <div className="lg:hidden space-y-1 pb-2 border-b border-slate-200">
              <label className="block text-xs font-semibold text-slate-800">
                Selección Rápida de Figura (Vista Superior Móvil)
              </label>
              <select
                value={selectedSpec.id}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full min-h-[42px] rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900"
              >
                {filteredCatalog.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fileName} — Fig. {item.figureNumber}
                    {item.subPart || ''}: {item.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <div className="text-xs font-mono text-slate-600 tabular-nums">
                  Archivo exacto: <strong className="text-slate-900">{selectedSpec.fileName}</strong>
                  {' · '}
                  <span>Formato base {selectedSpec.widthPx}×{selectedSpec.heightPx} px</span>
                  {pngStats && (
                    <>
                      {' · '}
                      <span className="text-emerald-700 font-semibold">
                        Salida {pngStats.width}×{pngStats.height} px ({(pngStats.sizeBytes / 1024).toFixed(1)} KB)
                      </span>
                    </>
                  )}
                </div>
                <h2 className="text-base font-bold text-slate-900 mt-0.5">
                  Figura {selectedSpec.figureNumber}
                  {selectedSpec.subPart || ''}: {selectedSpec.title}
                </h2>
                <p className="text-xs text-slate-600 mt-1">{selectedSpec.bookDescription}</p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={selectedIndexInFiltered <= 0}
                  onClick={() => {
                    if (selectedIndexInFiltered > 0) {
                      setSelectedId(filteredCatalog[selectedIndexInFiltered - 1].id);
                    }
                  }}
                  className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-35 text-slate-700 cursor-pointer"
                  title="Figura anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono text-slate-600 px-1.5 tabular-nums">
                  {selectedIndexInFiltered + 1}/{filteredCatalog.length}
                </span>
                <button
                  type="button"
                  disabled={selectedIndexInFiltered < 0 || selectedIndexInFiltered >= filteredCatalog.length - 1}
                  onClick={() => {
                    if (selectedIndexInFiltered < filteredCatalog.length - 1) {
                      setSelectedId(filteredCatalog[selectedIndexInFiltered + 1].id);
                    }
                  }}
                  className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-35 text-slate-700 cursor-pointer"
                  title="Figura siguiente"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Selector de fuente visual limpio (sin modelo híbrido ni rayos X) */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                {selectedAssignedPhotoUrl ? (
                  <div className="inline-flex flex-wrap rounded border border-slate-300 bg-white p-0.5 gap-0.5">
                    {is3DSelected && (
                      <button
                        type="button"
                        onClick={() => setViewSourceMode('synthetic_3d')}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          viewSourceMode === 'synthetic_3d'
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-700 hover:text-slate-900'
                        }`}
                      >
                        <Box className="w-3.5 h-3.5" />
                        Modelo 3D Anatómico (.glb)
                      </button>
                    )}
                    {is3DSelected && (
                      <button
                        type="button"
                        onClick={() => setViewSourceMode('compare_side')}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          viewSourceMode === 'compare_side'
                            ? 'bg-sky-700 text-white'
                            : 'text-slate-700 hover:text-slate-900'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Comparar Lado a Lado
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setViewSourceMode('goniometer')}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        viewSourceMode === 'goniometer'
                          ? 'bg-sky-700 text-white'
                          : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      Goniómetro
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewSourceMode('assigned_photo')}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        viewSourceMode === 'assigned_photo'
                          ? 'bg-emerald-700 text-white'
                          : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      Solo Lámina Original
                    </button>
                  </div>
                ) : (
                  <span className="text-slate-600 font-medium">
                    Vista generada por el motor anatómico PBR 3D (.glb) / diagrama vectorial
                  </span>
                )}

                {isShowingPureAssignedPhoto && (
                  <label className="inline-flex items-center gap-1.5 text-slate-700 cursor-pointer select-none pl-1">
                    <input
                      type="checkbox"
                      checked={includeHeaderOnPhoto}
                      onChange={(e) => setIncludeHeaderOnPhoto(e.target.checked)}
                      className="rounded border-slate-400 text-sky-700"
                    />
                    <span>Incluir encabezado FIG. {selectedSpec.figureNumber}{selectedSpec.subPart || ''}</span>
                  </label>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <input
                  ref={customPhotoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUploadCustomFigurePhoto}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => customPhotoInputRef.current?.click()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Upload className="w-3 h-3 text-sky-700" />
                  {selectedAssignedPhotoUrl ? 'Cambiar foto' : 'Asignar foto'}
                </button>
                {hasCustomOverrideForSelected && (
                  <button
                    type="button"
                    onClick={() => clearCustomFigurePhotoOverride(selectedSpec.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Restaurar original
                  </button>
                )}
              </div>
            </div>

            {/* Lienzo de previsualización según el modo activo */}
            {selectedAssignedPhotoUrl && viewSourceMode === 'compare_side' && is3DSelected ? (
              <div className="bg-slate-100 border border-slate-300 rounded-md p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-600 px-1">
                  <span>
                    Comparativa lado a lado: Lámina de Referencia vs Avatar Anatómico 3D (.glb · arrastre el panel derecho para rotar)
                  </span>
                  <span className="font-mono font-semibold text-slate-700">{selectedSpec.fileName}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-white rounded border border-slate-300 p-2.5 flex flex-col justify-between">
                    <div className="flex items-center justify-between text-[11px] text-slate-600 pb-1.5">
                      <span className="font-semibold text-emerald-800">Lámina de Referencia</span>
                      <button
                        type="button"
                        onClick={() => setViewSourceMode('goniometer')}
                        className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 font-semibold cursor-pointer"
                      >
                        <Crosshair className="w-3 h-3" />
                        Medir con goniómetro
                      </button>
                    </div>
                    <div className="flex-1 flex items-center justify-center min-h-[260px]">
                      {!compareImgFailed ? (
                        <img
                          src={selectedAssignedPhotoUrl}
                          alt={selectedSpec.title}
                          referrerPolicy="no-referrer"
                          onError={() => setCompareImgFailed(true)}
                          className="max-h-[340px] w-full object-contain"
                        />
                      ) : (
                        <span className="text-xs text-slate-500">Imagen no disponible</span>
                      )}
                    </div>
                  </div>

                  <div className="bg-white rounded border border-slate-300 p-2.5 flex flex-col justify-between">
                    <div className="flex items-center justify-between text-[11px] text-slate-600 pb-1.5">
                      <span className="font-semibold text-slate-900">Avatar Anatómico 3D (.glb · Arrastre 360°)</span>
                      <span className="font-mono tabular-nums">
                        Az {orbit.azimuthDeg}° · El {orbit.elevationDeg}°
                      </span>
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                      <canvas
                        ref={previewCanvasRef}
                        onPointerDown={(e) => handleCanvasPointerDown(e, false)}
                        onPointerMove={(e) => handleCanvasPointerMove(e, false)}
                        onPointerUp={handleCanvasPointerUp}
                        onPointerCancel={handleCanvasPointerUp}
                        className="w-full h-auto bg-white rounded-xs border border-slate-200 cursor-grab active:cursor-grabbing touch-none select-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : selectedAssignedPhotoUrl && viewSourceMode === 'goniometer' ? (
              <InteractivePhotoGoniometer
                imageUrl={selectedAssignedPhotoUrl}
                figureCode={`Fig. ${selectedSpec.figureNumber}${selectedSpec.subPart || ''}`}
                figureLabel={selectedSpec.title}
                onApplyAngle={
                  is3DSelected
                    ? (deg) => {
                        updateLiveJoint(activeJointField, deg);
                        setViewSourceMode('compare_side');
                      }
                    : undefined
                }
                applyButtonLabel="Transferir ángulo medido al Modelo 3D"
              />
            ) : (
              <div className="bg-slate-100 border border-slate-300 rounded-md p-3 sm:p-4 flex flex-col items-center justify-center space-y-2.5">
                <div className="w-full flex items-center justify-between text-[11px] text-slate-600 px-1">
                  <span>
                    {isShowingPureAssignedPhoto
                      ? 'Fotografía oficial adjunta asignada a esta figura en alta resolución'
                      : is3DSelected
                        ? 'Avatar anatómico PBR (.glb) · 1 dedo rotar / 2 dedos zoom'
                        : 'Esquema técnico renderizado en alta definición'}
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-slate-700">
                    {selectedSpec.fileName}
                  </span>
                </div>

                <canvas
                  ref={previewCanvasRef}
                  onPointerDown={(e) => handleCanvasPointerDown(e, false)}
                  onPointerMove={(e) => handleCanvasPointerMove(e, false)}
                  onPointerUp={handleCanvasPointerUp}
                  onPointerCancel={handleCanvasPointerUp}
                  className={`${getCanvasMaxWidthClass(selectedSpec.widthPx)} h-auto bg-white shadow-xs rounded-xs border border-slate-300 ${
                    is3DSelected && !isShowingPureAssignedPhoto
                      ? 'cursor-grab active:cursor-grabbing touch-none select-none'
                      : ''
                  }`}
                />
              </div>
            )}

            {/* Controles 3D de Cámara + Cinemática Articular en Vivo */}
            {is3DSelected && !isShowingPureAssignedPhoto && viewSourceMode !== 'goniometer' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Cámara y Verdadera Magnitud */}
                <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-sky-700" />
                      Cámara 3D y Verdadera Magnitud
                    </span>
                    <button
                      type="button"
                      onClick={() => setOrbit(DEFAULT_ORBIT_OVERRIDE)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Plano 0°
                    </button>
                  </div>

                  <div className="space-y-2 text-xs">
                    <label className="block space-y-0.5">
                      <div className="flex justify-between text-slate-600">
                        <span>Giro Horizontal (Azimut)</span>
                        <span className="font-mono tabular-nums">{orbit.azimuthDeg}°</span>
                      </div>
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        value={orbit.azimuthDeg}
                        onChange={(e) => setOrbit((p) => ({ ...p, azimuthDeg: Number(e.target.value) }))}
                        className="w-full accent-sky-700"
                      />
                    </label>

                    <label className="block space-y-0.5">
                      <div className="flex justify-between text-slate-600">
                        <span>Inclinación Vertical</span>
                        <span className="font-mono tabular-nums">{orbit.elevationDeg}°</span>
                      </div>
                      <input
                        type="range"
                        min={-65}
                        max={65}
                        value={orbit.elevationDeg}
                        onChange={(e) => setOrbit((p) => ({ ...p, elevationDeg: Number(e.target.value) }))}
                        className="w-full accent-sky-700"
                      />
                    </label>

                    <label className="block space-y-0.5">
                      <div className="flex justify-between text-slate-600">
                        <span>Zoom Óptico</span>
                        <span className="font-mono tabular-nums">{orbit.zoom.toFixed(2)}×</span>
                      </div>
                      <input
                        type="range"
                        min={0.65}
                        max={1.85}
                        step={0.05}
                        value={orbit.zoom}
                        onChange={(e) => setOrbit((p) => ({ ...p, zoom: Number(e.target.value) }))}
                        className="w-full accent-sky-700"
                      />
                    </label>
                  </div>
                </div>

                {/* Control Cinemático Articular en Vivo */}
                {activePanelPose && (
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800">
                        Articulación en Vivo {poseOverrides ? '(Modificada)' : '(Postura Libro)'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {(selectedSpec.panels?.length || 0) >= 2 && (
                          <div className="inline-flex rounded border border-slate-300 bg-white p-0.5">
                            <button
                              type="button"
                              onClick={() => setPanelTargetIdx(0)}
                              className={`px-1.5 py-0.5 rounded-xs text-[11px] font-semibold cursor-pointer ${
                                panelTargetIdx === 0 ? 'bg-slate-900 text-white' : 'text-slate-600'
                              }`}
                            >
                              Cuerpo A
                            </button>
                            <button
                              type="button"
                              onClick={() => setPanelTargetIdx(1)}
                              className={`px-1.5 py-0.5 rounded-xs text-[11px] font-semibold cursor-pointer ${
                                panelTargetIdx === 1 ? 'bg-slate-900 text-white' : 'text-slate-600'
                              }`}
                            >
                              Cuerpo B
                            </button>
                          </div>
                        )}
                        {poseOverrides && (
                          <button
                            type="button"
                            onClick={() => setPoseOverrides(null)}
                            className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 font-medium cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Restaurar
                          </button>
                        )}
                      </div>
                    </div>

                    <select
                      value={activeJointField}
                      onChange={(e) =>
                        setActiveJointField(e.target.value as typeof activeJointField)
                      }
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 font-medium"
                    >
                      <option value="shoulderRFlexionDeg">Flexión / Extensión Hombro Der. ({activePanelPose.shoulderRFlexionDeg}°)</option>
                      <option value="shoulderRAbductionDeg">Abducción Hombro Der. ({activePanelPose.shoulderRAbductionDeg}°)</option>
                      <option value="elbowRFlexionDeg">Flexión Codo Der. ({activePanelPose.elbowRFlexionDeg}°)</option>
                      <option value="wristRFlexionDeg">Flexión / Extensión Muñeca Der. ({activePanelPose.wristRFlexionDeg}°)</option>
                      <option value="neckFlexionDeg">Ángulo Cervical Cuello ({activePanelPose.neckFlexionDeg}°)</option>
                      <option value="trunkFlexionDeg">Inclinación Tronco ({activePanelPose.trunkFlexionDeg}°)</option>
                      <option value="kneeRFlexionDeg">Flexión Rodilla Der. ({activePanelPose.kneeRFlexionDeg}°)</option>
                    </select>

                    <label className="block space-y-1 pt-0.5">
                      <div className="flex justify-between text-slate-700">
                        <span>Ángulo articular seleccionado</span>
                        <span className="font-mono font-bold text-sky-800 tabular-nums">
                          {Number(activePanelPose[activeJointField] || 0)}°
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-35}
                        max={135}
                        value={Number(activePanelPose[activeJointField] || 0)}
                        onChange={(e) => updateLiveJoint(activeJointField, Number(e.target.value))}
                        className="w-full accent-sky-700"
                      />
                    </label>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      Ajuste el ángulo o use el <strong>Goniómetro</strong> sobre la lámina enviada para transferir el valor medido al maniquí 3D.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="text-xs text-slate-600 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Nomenclatura exacta <code className="font-mono font-semibold">{selectedSpec.fileName}</code> sincronizada con lámina y motor 3D.
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleGenerateAndDownloadZip('chapter')}
                  disabled={Boolean(batchProgress)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer"
                >
                  <Archive className="w-3.5 h-3.5 text-slate-600" />
                  ZIP Cap. {selectedSpec.chapter}
                </button>

                {selectedAssignedPhotoUrl && is3DSelected && (
                  <button
                    type="button"
                    onClick={() => handleDownloadSpecPng(effectiveSelectedSpec, orbit, true)}
                    disabled={isExportingSingle}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-sky-300 bg-sky-50 hover:bg-sky-100 text-xs font-semibold text-sky-900 cursor-pointer"
                  >
                    <Box className="w-3.5 h-3.5" />
                    Exportar Versión 3D
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleDownloadSpecPng(effectiveSelectedSpec, orbit)}
                  disabled={isExportingSingle}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  {isExportingSingle ? 'Preparando...' : `Descargar ${selectedSpec.fileName}`}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODO 2: TABLA OFICIAL CON NOMENCLATURA EXACTA Y DESCARGA DIRECTA      */}
      {/* ===================================================================== */}
      {studioTab === 'table' && (
        <section className="bg-white border border-slate-300 rounded-lg overflow-hidden shadow-2xs">
          <div className="px-4 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Índice Completo del Plan de Figuras (`Figura · Contenido · Cuerpos · Archivos`)
              </h2>
              <p className="text-xs text-slate-600">
                Haga clic en cualquier nombre de archivo (`fig-1-01.png`, `fig-4-01.png`, etc.) para descargar la imagen en alta calidad con su nombre exacto de origen.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleGenerateAndDownloadZip('all')}
              disabled={Boolean(batchProgress)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-xs font-semibold text-white cursor-pointer"
            >
              <FolderArchive className="w-3.5 h-3.5" />
              Descargar Todas en un ZIP ({totalInZip} archivos)
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold">
                  <th className="py-2.5 px-4 w-24">Figura</th>
                  <th className="py-2.5 px-4">Contenido</th>
                  <th className="py-2.5 px-4 w-28 text-center">Cuerpos</th>
                  <th className="py-2.5 px-4 w-72">Archivos (Descarga Directa)</th>
                  <th className="py-2.5 px-4 w-28 text-right">Vista</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {groupedPlanRows.map((row) => (
                  <tr key={row.figureNumber} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-900 tabular-nums">
                      {row.figureNumber}
                    </td>
                    <td className="py-2.5 px-4 text-slate-800">{row.title}</td>
                    <td className="py-2.5 px-4 text-center font-mono text-slate-600 tabular-nums">
                      {row.bodiesLabel}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex flex-wrap gap-1.5">
                        {row.files.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => handleDownloadSpecPng(f)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-900 font-mono text-[11px] font-semibold cursor-pointer"
                            title={`Descargar ${f.fileName} en alta calidad`}
                          >
                            <Download className="w-3 h-3 text-sky-700" />
                            {f.fileName}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(row.files[0].id);
                          setStudioTab('catalog');
                        }}
                        className="text-sky-700 hover:text-sky-900 font-semibold underline cursor-pointer"
                      >
                        Abrir en 3D
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ===================================================================== */}
      {/* MODO 3: GENERADOR 3D AISLADO POR DESCRIPCIÓN / PARÁMETROS ANATÓMICOS  */}
      {/* ===================================================================== */}
      {studioTab === 'custom' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <section className="lg:col-span-5 bg-white border border-slate-300 rounded-lg p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-900">
                1. Descripción Técnica de la Zona Anatómica y Postura
              </label>
              <textarea
                rows={3}
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder="Ej.: Mano y muñeca en flexión palmar de 35° con vector F = 40 N..."
                className="w-full p-2.5 text-xs rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-sky-600"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {PROMPT_EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setPromptInput(ex);
                      handleApplyPrompt(ex);
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-sky-50 hover:border-sky-300 text-slate-700 cursor-pointer text-left"
                  >
                    Ejemplo {i + 1}: {ex.slice(0, 38)}…
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => handleApplyPrompt(promptInput)}
                className="w-full mt-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Aislar Articulación y Configurar Escena 3D
              </button>
            </div>

            <hr className="border-slate-200" />

            <div className="space-y-3 text-xs">
              <div className="font-bold text-slate-900">2. Ajuste Anatómico y Encabezado</div>

              <label className="block space-y-1">
                <span className="font-medium text-slate-700">Título de la Ilustración</span>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-slate-900"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-medium text-slate-700">Zona de Enfoque (Aislamiento Anatómico)</span>
                <select
                  value={customFocusZone}
                  onChange={(e) => setCustomFocusZone(e.target.value as FocusZone)}
                  className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-slate-900"
                >
                  {(Object.keys(FOCUS_ZONE_LABELS) as FocusZone[]).map((z) => (
                    <option key={z} value={z}>
                      {FOCUS_ZONE_LABELS[z]}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="font-medium text-slate-700">Formato Plan de Figuras</span>
                  <select
                    value={customFormat}
                    onChange={(e) =>
                      setCustomFormat(e.target.value as 'single_480x640' | 'dual_800x520' | 'scene_800x520')
                    }
                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-slate-900"
                  >
                    <option value="single_480x640">1 Cuerpo / Segmento (480×640)</option>
                    <option value="dual_800x520">2 Cuerpos Comparativos (800×520)</option>
                    <option value="scene_800x520">Escena Apaisada (800×520)</option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="font-medium text-slate-700">Plano Óptico de Cámara</span>
                  <select
                    value={customCamera}
                    onChange={(e) => setCustomCamera(e.target.value as CameraPreset)}
                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-slate-900"
                  >
                    {(Object.keys(CAMERA_PRESET_LABELS) as CameraPreset[]).map((c) => (
                      <option key={c} value={c}>
                        {CAMERA_PRESET_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block space-y-1">
                <div className="flex justify-between text-slate-700">
                  <span className="font-medium">Ángulo Principal del Segmento (α)</span>
                  <span className="font-mono font-bold text-orange-600 tabular-nums">{customPrimaryDeg}°</span>
                </div>
                <input
                  type="range"
                  min={-45}
                  max={135}
                  value={customPrimaryDeg}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setCustomPrimaryDeg(v);
                    setCustomAlphaLabel(`α = ${v}°`);
                  }}
                  className="w-full accent-orange-600"
                />
              </label>

              <label className="block space-y-1">
                <div className="flex justify-between text-slate-700">
                  <span className="font-medium">Ángulo Secundario (Desviación / Prono / Lateral)</span>
                  <span className="font-mono tabular-nums">{customSecondaryDeg}°</span>
                </div>
                <input
                  type="range"
                  min={-60}
                  max={90}
                  value={customSecondaryDeg}
                  onChange={(e) => setCustomSecondaryDeg(Number(e.target.value))}
                  className="w-full accent-sky-700"
                />
              </label>

              {customFormat === 'dual_800x520' && (
                <label className="block space-y-1">
                  <div className="flex justify-between text-slate-700">
                    <span className="font-medium">Ángulo Panel Izquierdo (Referencia Postura A)</span>
                    <span className="font-mono tabular-nums">{customCompareDeg}°</span>
                  </div>
                  <input
                    type="range"
                    min={-30}
                    max={90}
                    value={customCompareDeg}
                    onChange={(e) => setCustomCompareDeg(Number(e.target.value))}
                    className="w-full accent-slate-700"
                  />
                </label>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="font-medium text-slate-700">Etiqueta Arco Naranja (α)</span>
                  <input
                    type="text"
                    value={customAlphaLabel}
                    onChange={(e) => setCustomAlphaLabel(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white font-mono text-xs"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="font-medium text-slate-700">Vector Fuerza Azul (F)</span>
                  <input
                    type="text"
                    value={customForceLabel}
                    onChange={(e) => setCustomForceLabel(e.target.value)}
                    placeholder="F = 45 N"
                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white font-mono text-xs"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="font-medium text-slate-700">Sentido del Vector F</span>
                  <select
                    value={customForceDir}
                    onChange={(e) => setCustomForceDir(e.target.value as 'down' | 'up' | 'left' | 'right')}
                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white"
                  >
                    <option value="down">Vertical Descendente (Carga)</option>
                    <option value="up">Vertical Ascendente (Reacción)</option>
                    <option value="right">Horizontal Derecha (Empuje)</option>
                    <option value="left">Horizontal Izquierda (Arrastre)</option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="font-medium text-slate-700">Archivo PNG de Salida</span>
                  <input
                    type="text"
                    value={customFileName}
                    onChange={(e) => setCustomFileName(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white font-mono text-xs"
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="order-1 lg:order-2 lg:col-span-7 bg-white border border-slate-300 rounded-lg p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <div className="text-xs font-mono text-slate-600 tabular-nums">
                  Archivo: <strong className="text-slate-900">{customSpec.fileName}</strong>
                  {customPngStats && (
                    <>
                      {' · '}
                      <span className="text-emerald-700 font-semibold">
                        {customPngStats.width}×{customPngStats.height} px ({(customPngStats.sizeBytes / 1024).toFixed(1)} KB)
                      </span>
                    </>
                  )}
                </div>
                <h2 className="text-base font-bold text-slate-900 mt-0.5">
                  {FOCUS_ZONE_LABELS[customFocusZone]}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCustomOrbit(DEFAULT_ORBIT_OVERRIDE)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Centrar Plano
                </button>
              </div>
            </div>

            <div className="bg-slate-100 border border-slate-300 rounded-md p-3 sm:p-4 flex flex-col items-center">
              <canvas
                ref={customCanvasRef}
                onPointerDown={(e) => handleCanvasPointerDown(e, true)}
                onPointerMove={(e) => handleCanvasPointerMove(e, true)}
                onPointerUp={handleCanvasPointerUp}
                onPointerCancel={handleCanvasPointerUp}
                className={`${getCanvasMaxWidthClass(customSpec.widthPx)} h-auto bg-white shadow-xs rounded-xs border border-slate-300 cursor-grab active:cursor-grabbing touch-none select-none`}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-600">
                Arrastre con el puntero sobre el lienzo para rotar el segmento humano en 3D.
              </span>
              <button
                type="button"
                onClick={() => handleDownloadSpecPng(customSpec, customOrbit, true)}
                disabled={isExportingSingle}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Descargar {customSpec.fileName} (Alta Calidad)
              </button>
            </div>
          </section>
        </div>
      )}

      {/* MODAL EMBEBIDO PARA CONSULTAR EL PDF DEL LIBRO ADJUNTO */}
      {isPdfViewerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white rounded-lg border border-slate-300 w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden shadow-xl">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50">
              <div className="flex items-center gap-2 min-w-0">
                <Eye className="w-4 h-4 text-sky-700 shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                  Evaluación ergonómica de puestos de trabajo — Mauricio Alejandro Pizarro Muñoz
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={BOOK_PDF_PATH}
                  download="Evaluacion_ergonomica_de_puestos_de_trabajo_Mauricio_Pizarro.pdf"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-xs font-medium text-slate-800"
                >
                  <Download className="w-3.5 h-3.5" />
                  Descargar PDF
                </a>
                <button
                  type="button"
                  onClick={() => setIsPdfViewerOpen(false)}
                  className="p-1.5 rounded hover:bg-slate-200 text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <iframe
              src={BOOK_PDF_PATH}
              title="Libro Evaluación Ergonómica de Puestos de Trabajo"
              className="flex-1 w-full bg-slate-100"
            />
          </div>
        </div>
      )}
    </div>
  );
};

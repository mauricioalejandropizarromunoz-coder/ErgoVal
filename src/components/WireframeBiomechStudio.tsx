import React, { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import {
  Archive,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FileDown,
  FolderArchive,
  Grid,
  Image as ImageIcon,
  Layers,
  Link2,
  RotateCcw,
  Search,
  Sliders,
  Table,
  X,
} from 'lucide-react';
import {
  BookFigureFileSpec,
  CameraPreset,
  FocusZone,
  JointKey,
} from '../types/figurePlan';
import {
  BOOK_FIGURE_CATALOG,
  makeNeutralPose,
  parseBiomechanicalPromptToPanel,
} from '../utils/figurePlanCatalog';
import {
  CameraOrbitOverride,
  DEFAULT_ORBIT_OVERRIDE,
} from '../utils/biomech3dRenderer';
import {
  AngularSectorSpec,
  DEFAULT_WIREFRAME_OPTIONS,
  EnrichedWireframePanel,
  WireframeVisualOptions,
  renderWireframeFigureToCanvas,
  renderWireframeFigureToPng,
} from '../utils/wireframeBiomechRenderer';
import {
  exportCanvasToHighQualityPng,
  exportCanvasToOptimizedPng,
} from '../utils/pngOptimizer';

interface WireframeBiomechStudioProps {
  onBackToEvaluator: () => void;
}

const BOOK_PDF_PATH =
  '/assets/aistudio/Evaluaci_n_ergon_mica_de_puestos_de_trabajo_-_Mauricio_Alejandro_Pizarro_Mu_oz_c375123e.pdf';

const REFERENCE_IMAGE_PATH = '/assets/aistudio/image_a08492d2.png';

const CHAPTER_FILTERS: { id: number | 'all'; label: string }[] = [
  { id: 'all', label: 'Todas (84)' },
  { id: 1, label: 'Cap. 1' },
  { id: 4, label: 'Cap. 4 · RULA/REBA/OWAS' },
  { id: 5, label: 'Cap. 5 · Cargas/NIOSH' },
  { id: 6, label: 'Cap. 6 · OCRA/JSI' },
  { id: 7, label: 'Cap. 7 · Térmico' },
  { id: 8, label: 'Cap. 8 · Vibraciones' },
  { id: 9, label: 'Cap. 9–10 · Gestión' },
  { id: 11, label: 'Cap. 11–13 · Casos' },
];

const FOCUS_ZONE_META: Record<FocusZone, { es: string; en: string }> = {
  full_body: {
    es: 'Cuerpo humano completo en perfil sagital',
    en: 'full human body in sagittal profile',
  },
  elbow_forearm: {
    es: 'Articulación del codo y antebrazo (aislado)',
    en: 'elbow joint and forearm complex',
  },
  wrist_hand: {
    es: 'Mano, carpo y muñeca articulada (aislado)',
    en: 'hand, wrist, and radiocarpal complex',
  },
  shoulder_arm: {
    es: 'Complejo articular del hombro y brazo (aislado)',
    en: 'glenohumeral shoulder joint and upper arm',
  },
  lumbar_l5s1: {
    es: 'Segmento raquídeo lumbosacro L5/S1 (aislado)',
    en: 'lumbosacral spine segment L5/S1',
  },
  neck_cervical: {
    es: 'Columna cervical C1–C7 y cabeza (aislado)',
    en: 'cervical spine C1–C7 and head segment',
  },
  ankle_foot: {
    es: 'Pie, arco plantar y tobillo (aislado)',
    en: 'foot, plantar arch, and talocrural ankle joint',
  },
  legs_knees: {
    es: 'Tren inferior, rodillas y apoyo plantar',
    en: 'lower limbs, tibiofemoral knee joints, and feet',
  },
  trunk_pelvis: {
    es: 'Tronco toracolumbar y pelvis (aislado)',
    en: 'thoracolumbar trunk and pelvic girdle',
  },
};

const CAMERA_LABELS: Record<CameraPreset, string> = {
  sagittal_right: 'Plano Sagital Derecho (Verdadera Magnitud)',
  sagittal_left: 'Plano Sagital Izquierdo (Verdadera Magnitud)',
  frontal: 'Plano Frontal / Coronal',
  dorsal: 'Plano Dorsal / Posterior',
  top: 'Plano Superior / Cenital',
  isometric: 'Vista Isométrica Técnica 3D',
  perspective_oblique: 'Perspectiva Oblicua',
};

interface ParametricPreset {
  id: string;
  label: string;
  fileName: string;
  format: 'dual_reference_sectors' | 'dual_800x520' | 'single_480x640' | 'scene_800x520';
  focusZone: FocusZone;
  camera: CameraPreset;
  actionEs: string;
  actionEn: string;
  primaryDeg: number;
  secondaryDeg: number;
  compareDeg: number;
  sectorMinDeg: number;
  sectorMaxDeg: number;
  subscript: string;
  forceLabel: string;
}

const PARAMETRIC_PRESETS: ParametricPreset[] = [
  {
    id: 'ref_forearm_sectors',
    label: '1. Modelo Imagen Adjunta (60°–100° | >100° y <60°)',
    fileName: 'fig-4-07.png',
    format: 'dual_reference_sectors',
    focusZone: 'full_body',
    camera: 'sagittal_right',
    actionEs: 'flexión sagital del antebrazo (rango óptimo 60°–100° frente a umbrales <60° y >100°)',
    actionEn: 'sagittal forearm flexion comparing 60°–100° optimal range against <60° and >100° zones',
    primaryDeg: 82,
    secondaryDeg: 0,
    compareDeg: 138,
    sectorMinDeg: 60,
    sectorMaxDeg: 100,
    subscript: 'f',
    forceLabel: 'F',
  },
  {
    id: 'wrist_palmar_wire',
    label: '2. Mano y Muñeca Aislada (α_m = 35° + Vector F)',
    fileName: 'fig-4-10b.png',
    format: 'single_480x640',
    focusZone: 'wrist_hand',
    camera: 'sagittal_right',
    actionEs: 'flexión palmar pronunciada (>15°) bajo carga distal descendente',
    actionEn: 'palmar wrist flexion (>15°) under downward distal load application',
    primaryDeg: 35,
    secondaryDeg: 10,
    compareDeg: 0,
    sectorMinDeg: 15,
    sectorMaxDeg: 48,
    subscript: 'm',
    forceLabel: 'F',
  },
  {
    id: 'lumbar_l5s1_wire',
    label: '3. Segmento Lumbar L5/S1 (α_t = 48° + Vector F)',
    fileName: 'fig-5-01.png',
    format: 'single_480x640',
    focusZone: 'lumbar_l5s1',
    camera: 'sagittal_right',
    actionEs: 'flexión anterior del tronco en levantamiento de carga con compresión L5/S1',
    actionEn: 'anterior trunk flexion during manual load lifting with L5/S1 compression',
    primaryDeg: 48,
    secondaryDeg: 0,
    compareDeg: 10,
    sectorMinDeg: 20,
    sectorMaxDeg: 60,
    subscript: 't',
    forceLabel: 'F',
  },
  {
    id: 'shoulder_elev_wire',
    label: '4. Hombro y Brazo Comparativo (20°–45° vs 45°–90°)',
    fileName: 'fig-4-04b.png',
    format: 'dual_800x520',
    focusZone: 'shoulder_arm',
    camera: 'sagittal_right',
    actionEs: 'elevación sagital del brazo respecto al eje del tronco',
    actionEn: 'sagittal upper-arm elevation relative to the thoracolumbar axis',
    primaryDeg: 72,
    secondaryDeg: 20,
    compareDeg: 32,
    sectorMinDeg: 45,
    sectorMaxDeg: 90,
    subscript: 'f',
    forceLabel: 'F',
  },
  {
    id: 'ankle_foot_wire',
    label: '5. Pie y Tobillo Aislado (α_d = 18° + Vector F)',
    fileName: 'fig-tobillo-wireframe.png',
    format: 'single_480x640',
    focusZone: 'ankle_foot',
    camera: 'sagittal_right',
    actionEs: 'dorsiflexión talocrural con apoyo plantar y carga vertical F',
    actionEn: 'talocrural dorsiflexion with plantar contact and downward load F',
    primaryDeg: 18,
    secondaryDeg: 0,
    compareDeg: 0,
    sectorMinDeg: 0,
    sectorMaxDeg: 25,
    subscript: 'd',
    forceLabel: 'F',
  },
  {
    id: 'cervical_neck_wire',
    label: '6. Columna Cervical y Cabeza (α_c = 30° + Vector F)',
    fileName: 'fig-4-13b.png',
    format: 'single_480x640',
    focusZone: 'neck_cervical',
    camera: 'sagittal_right',
    actionEs: 'flexión cervical sostenida superior a 20°',
    actionEn: 'sustained cervical spine flexion exceeding 20°',
    primaryDeg: 30,
    secondaryDeg: 0,
    compareDeg: 8,
    sectorMinDeg: 20,
    sectorMaxDeg: 50,
    subscript: 'c',
    forceLabel: 'F',
  },
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

export const WireframeBiomechStudio: React.FC<WireframeBiomechStudioProps> = ({
  onBackToEvaluator,
}) => {
  const [subMode, setSubMode] = useState<'generator' | 'catalog' | 'table'>('generator');

  // Visual Layer Controls (shared across Generator & Catalog)
  const [wfOptions, setWfOptions] = useState<WireframeVisualOptions>(DEFAULT_WIREFRAME_OPTIONS);
  const [exportQuality, setExportQuality] = useState<'hd_lossless' | 'compact_120kb'>('hd_lossless');
  const [includeAll84Figures, setIncludeAll84Figures] = useState(true);
  const [useImagesSubfolder, setUseImagesSubfolder] = useState(false);

  const [readyZipLink, setReadyZipLink] = useState<{
    url: string;
    fileName: string;
    count: number;
    sizeMb: string;
  } | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    label: string;
  } | null>(null);
  const [isExportingSingle, setIsExportingSingle] = useState(false);
  const [isPdfViewerOpen, setIsPdfViewerOpen] = useState(false);
  const [showRefImagePanel, setShowRefImagePanel] = useState(true);
  const [refImgError, setRefImgError] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // --- GENERATOR PARAMETRIC STATE (defaults to Reference Image 60°–100° | >100° & <60°) ---
  const [activePresetId, setActivePresetId] = useState<string>(PARAMETRIC_PRESETS[0].id);
  const [genFormat, setGenFormat] = useState<
    'dual_reference_sectors' | 'dual_800x520' | 'single_480x640' | 'scene_800x520'
  >(PARAMETRIC_PRESETS[0].format);
  const [genFileName, setGenFileName] = useState<string>(PARAMETRIC_PRESETS[0].fileName);
  const [genFocusZone, setGenFocusZone] = useState<FocusZone>(PARAMETRIC_PRESETS[0].focusZone);
  const [genCamera, setGenCamera] = useState<CameraPreset>(PARAMETRIC_PRESETS[0].camera);
  const [genActionEs, setGenActionEs] = useState<string>(PARAMETRIC_PRESETS[0].actionEs);
  const [genActionEn, setGenActionEn] = useState<string>(PARAMETRIC_PRESETS[0].actionEn);
  const [genPrimaryDeg, setGenPrimaryDeg] = useState<number>(PARAMETRIC_PRESETS[0].primaryDeg);
  const [genSecondaryDeg, setGenSecondaryDeg] = useState<number>(PARAMETRIC_PRESETS[0].secondaryDeg);
  const [genCompareDeg, setGenCompareDeg] = useState<number>(PARAMETRIC_PRESETS[0].compareDeg);
  const [genSectorMin, setGenSectorMin] = useState<number>(PARAMETRIC_PRESETS[0].sectorMinDeg);
  const [genSectorMax, setGenSectorMax] = useState<number>(PARAMETRIC_PRESETS[0].sectorMaxDeg);
  const [genSubscript, setGenSubscript] = useState<string>(PARAMETRIC_PRESETS[0].subscript);
  const [genForceLabel, setGenForceLabel] = useState<string>(PARAMETRIC_PRESETS[0].forceLabel);
  const [genOrbit, setGenOrbit] = useState<CameraOrbitOverride>(DEFAULT_ORBIT_OVERRIDE);
  const [genPngStats, setGenPngStats] = useState<{
    sizeBytes: number;
    width: number;
    height: number;
  } | null>(null);
  const [freeTextPromptInput, setFreeTextPromptInput] = useState<string>('');

  // --- CATALOG MODE STATE ---
  const [chapterFilter, setChapterFilter] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>('fig-4-07');
  const [catOrbit, setCatOrbit] = useState<CameraOrbitOverride>(DEFAULT_ORBIT_OVERRIDE);
  const [catPngStats, setCatPngStats] = useState<{
    sizeBytes: number;
    width: number;
    height: number;
  } | null>(null);

  const genCanvasRef = useRef<HTMLCanvasElement>(null);
  const catCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; az0: number; el0: number } | null>(null);

  useEffect(() => {
    return () => {
      if (readyZipLink?.url) {
        URL.revokeObjectURL(readyZipLink.url);
      }
    };
  }, [readyZipLink]);

  // Synchronized English Technical Prompt matching the unified photorealistic ergonomic manual specification
  const generatedTechnicalPrompt = useMemo(() => {
    const zoneEn = FOCUS_ZONE_META[genFocusZone]?.en || genFocusZone;
    const actionDesc = genActionEn.trim() || genActionEs.trim();
    const alphaToken = `alpha_${genSubscript} = ${Math.round(genPrimaryDeg)}°`;
    return `Photorealistic technical ergonomic manual illustration on a clean white background with a thin border of ${zoneEn} in ${actionDesc}. Maintain the exact poses, structural layout, joint positions, and angular diagram overlays. Realistic digital human anatomical model in a precise sagittal profile view, featuring natural skin texture, clean studio lighting, and subtle shadows. The model wears identical solid dark grey short-sleeve scrubs top and solid grey long pants, completely free of patterns, logos, pockets, or drawings. Keep all blue semi-transparent angular sectors, measurement arcs (${alphaToken}), arrows, and downward force vector '${genForceLabel || 'F'}' with crisp black outlines and high-contrast text boxes. Standardize all text labels into clean, high-legibility Spanish typography. At the bottom, center the technical footer: 'Postura de evaluación · Marcadores de ángulo · Plano Sagital'. Clean professional medical manual render style.`;
  }, [genFocusZone, genActionEn, genActionEs, genSubscript, genPrimaryDeg, genForceLabel]);

  const applyPreset = (p: ParametricPreset) => {
    setActivePresetId(p.id);
    setGenFormat(p.format);
    setGenFileName(p.fileName);
    setGenFocusZone(p.focusZone);
    setGenCamera(p.camera);
    setGenActionEs(p.actionEs);
    setGenActionEn(p.actionEn);
    setGenPrimaryDeg(p.primaryDeg);
    setGenSecondaryDeg(p.secondaryDeg);
    setGenCompareDeg(p.compareDeg);
    setGenSectorMin(p.sectorMinDeg);
    setGenSectorMax(p.sectorMaxDeg);
    setGenSubscript(p.subscript);
    setGenForceLabel(p.forceLabel);
    setGenOrbit(DEFAULT_ORBIT_OVERRIDE);
  };

  // Build Parametric BookFigureFileSpec with EnrichedWireframePanel sectors, orange α_f, and downward F
  const generatorSpec: BookFigureFileSpec = useMemo(() => {
    const makePanel = (
      deg: number,
      secDeg: number,
      subTitle: string,
      badge: string,
      sectors: AngularSectorSpec[],
    ): EnrichedWireframePanel => {
      const pose = makeNeutralPose();
      let arcJoint: JointKey = 'elbowR';
      let arcTo: JointKey = 'wristR';
      let refType: 'vertical_down' | 'vertical_up' | 'horizontal' | 'trunk_axis' = 'vertical_down';
      let forceJoint: JointKey = 'handR';

      switch (genFocusZone) {
        case 'full_body':
          if (genFormat === 'dual_reference_sectors') {
            pose.shoulderRFlexionDeg = 6;
            pose.elbowRFlexionDeg = deg;
            arcJoint = 'elbowR';
            arcTo = 'wristR';
            refType = 'vertical_down';
            forceJoint = 'handR';
          } else {
            pose.trunkFlexionDeg = deg;
            pose.shoulderRFlexionDeg = Math.max(18, deg * 0.75);
            pose.elbowRFlexionDeg = 45;
            arcJoint = 'l5s1';
            arcTo = 'c7';
            refType = 'vertical_up';
            forceJoint = 'handR';
          }
          break;
        case 'elbow_forearm':
          pose.shoulderRFlexionDeg = 6;
          pose.elbowRFlexionDeg = deg;
          pose.forearmRPronationDeg = secDeg;
          arcJoint = 'elbowR';
          arcTo = 'wristR';
          refType = 'vertical_down';
          forceJoint = 'handR';
          break;
        case 'wrist_hand':
          pose.elbowRFlexionDeg = 90;
          pose.wristRFlexionDeg = deg;
          pose.wristRDeviationDeg = secDeg;
          arcJoint = 'wristR';
          arcTo = 'handR';
          refType = 'horizontal';
          forceJoint = 'handR';
          break;
        case 'shoulder_arm':
          if (genCamera === 'frontal' || genCamera === 'dorsal') {
            pose.shoulderRAbductionDeg = Math.max(0, deg);
          } else {
            pose.shoulderRFlexionDeg = deg;
          }
          pose.elbowRFlexionDeg = Math.max(15, secDeg);
          arcJoint = 'shoulderR';
          arcTo = 'elbowR';
          refType = 'trunk_axis';
          forceJoint = 'handR';
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
          pose.shoulderRFlexionDeg = Math.max(15, deg * 0.8);
          pose.highlightGroup = 'l5s1_disc';
          arcJoint = 'l5s1';
          arcTo = 'c7';
          refType = 'vertical_up';
          forceJoint = 'l5s1';
          break;
        case 'ankle_foot':
          pose.ankleRDorsiflexionDeg = deg;
          arcJoint = 'ankleR';
          arcTo = 'footR';
          refType = 'horizontal';
          forceJoint = 'footR';
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
      }

      const sectorsAdjusted = sectors.map((s) => ({ ...s, joint: arcJoint }));

      return {
        subTitle,
        scoreBadge: badge,
        focusZone: genFocusZone,
        cameraPreset: genCamera,
        pose,
        subscriptSymbol: genSubscript,
        customForceLabel: genForceLabel || 'F',
        customSectors: sectorsAdjusted,
        angleArcs: [
          {
            joint: arcJoint,
            toJoint: arcTo,
            refType,
            label: `α_${genSubscript} = ${Math.round(deg)}°`,
          },
        ],
        forceVectors: [
          {
            atJoint: forceJoint,
            dx: 0,
            dy: 1,
            lengthPx: 54,
            label: genForceLabel.trim() || 'F',
          },
        ],
        noteBottom: 'Postura de evaluación · Marcadores de ángulo · Plano Sagital',
      };
    };

    const zeroRefForZone: AngularSectorSpec['zeroRef'] =
      genFocusZone === 'lumbar_l5s1' || genFocusZone === 'trunk_pelvis' || genFocusZone === 'neck_cervical'
        ? 'vertical_up'
        : genFocusZone === 'wrist_hand' || genFocusZone === 'ankle_foot'
          ? 'horizontal_right'
          : 'vertical_down';

    if (genFormat === 'dual_reference_sectors') {
      return {
        id: 'wf-dual-ref',
        figureNumber: 'EVAL',
        fileName: genFileName || 'fig-sectores-evaluacion.png',
        chapter: 4,
        chapterTitle: 'Evaluación Postural · Sectores Angulares',
        title: `${FOCUS_ZONE_META[genFocusZone].es}: ${genActionEs}`,
        bookDescription: generatedTechnicalPrompt,
        bodiesRule: '2',
        widthPx: 800,
        heightPx: 520,
        renderMode: '3d_dual',
        panels: [
          makePanel(
            genPrimaryDeg,
            genSecondaryDeg,
            `Rango óptimo (${genSectorMin}° a ${genSectorMax}°)`,
            `1 pto · α_${genSubscript} = ${Math.round(genPrimaryDeg)}°`,
            [
              {
                joint: 'elbowR',
                zeroRef: zeroRefForZone,
                minDeg: genSectorMin,
                maxDeg: genSectorMax,
                minBoxLabel: `${genSectorMin}°`,
                maxBoxLabel: `${genSectorMax}°`,
              },
            ],
          ),
          makePanel(
            genCompareDeg,
            genSecondaryDeg,
            `Fuera de rango (<${genSectorMin}° o >${genSectorMax}°)`,
            `2 ptos · α_${genSubscript} = ${Math.round(genCompareDeg)}°`,
            [
              {
                joint: 'elbowR',
                zeroRef: zeroRefForZone,
                minDeg: genSectorMax,
                maxDeg: Math.max(genSectorMax + 35, 162),
                midBoxLabel: `>${genSectorMax}°`,
              },
              {
                joint: 'elbowR',
                zeroRef: zeroRefForZone,
                minDeg: 0,
                maxDeg: Math.max(10, genSectorMin),
                midBoxLabel: `<${genSectorMin}°`,
              },
            ],
          ),
        ],
      };
    }

    if (genFormat === 'dual_800x520') {
      return {
        id: 'wf-dual-comp',
        figureNumber: 'EVAL',
        fileName: genFileName || 'fig-comparativa-evaluacion.png',
        chapter: 4,
        chapterTitle: 'Evaluación Postural Comparativa',
        title: `${FOCUS_ZONE_META[genFocusZone].es}: ${genActionEs}`,
        bookDescription: generatedTechnicalPrompt,
        bodiesRule: '2',
        widthPx: 800,
        heightPx: 520,
        renderMode: '3d_dual',
        panels: [
          makePanel(
            genCompareDeg,
            0,
            'Postura A (Referencia)',
            `α_${genSubscript} = ${Math.round(genCompareDeg)}°`,
            [
              {
                joint: 'elbowR',
                zeroRef: zeroRefForZone,
                minDeg: 0,
                maxDeg: Math.max(15, genCompareDeg),
                midBoxLabel: `${Math.round(genCompareDeg)}°`,
              },
            ],
          ),
          makePanel(
            genPrimaryDeg,
            genSecondaryDeg,
            'Postura B (Evaluada)',
            `α_${genSubscript} = ${Math.round(genPrimaryDeg)}°`,
            [
              {
                joint: 'elbowR',
                zeroRef: zeroRefForZone,
                minDeg: genSectorMin,
                maxDeg: genSectorMax,
                minBoxLabel: `${genSectorMin}°`,
                maxBoxLabel: `${genSectorMax}°`,
              },
            ],
          ),
        ],
      };
    }

    const w = genFormat === 'scene_800x520' ? 800 : 480;
    const h = genFormat === 'scene_800x520' ? 520 : 640;

    return {
      id: 'wf-single',
      figureNumber: 'EVAL',
      fileName: genFileName || 'fig-evaluacion-aislada.png',
      chapter: 0,
      chapterTitle: 'Evaluación Postural Técnica',
      title: `${FOCUS_ZONE_META[genFocusZone].es}: ${genActionEs}`,
      bookDescription: generatedTechnicalPrompt,
      bodiesRule: '1',
      widthPx: w,
      heightPx: h,
      renderMode: '3d_single',
      panels: [
        makePanel(
          genPrimaryDeg,
          genSecondaryDeg,
          FOCUS_ZONE_META[genFocusZone].es,
          `α_${genSubscript} = ${Math.round(genPrimaryDeg)}°`,
          [
            {
              joint: 'elbowR',
              zeroRef: zeroRefForZone,
              minDeg: genSectorMin,
              maxDeg: genSectorMax,
              minBoxLabel: `${genSectorMin}°`,
              maxBoxLabel: `${genSectorMax}°`,
            },
          ],
        ),
      ],
    };
  }, [
    genFormat,
    genFileName,
    genFocusZone,
    genCamera,
    genActionEs,
    generatedTechnicalPrompt,
    genPrimaryDeg,
    genSecondaryDeg,
    genCompareDeg,
    genSectorMin,
    genSectorMax,
    genSubscript,
    genForceLabel,
  ]);

  // Filtered Book Catalog
  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return BOOK_FIGURE_CATALOG.filter((item) => {
      if (chapterFilter !== 'all') {
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
  }, [chapterFilter, searchQuery]);

  const selectedCatalogSpec: BookFigureFileSpec = useMemo(() => {
    return (
      BOOK_FIGURE_CATALOG.find((f) => f.id === selectedCatalogId) ||
      filteredCatalog[0] ||
      BOOK_FIGURE_CATALOG[0]
    );
  }, [selectedCatalogId, filteredCatalog]);

  const selectedIndexInFiltered = useMemo(
    () => filteredCatalog.findIndex((f) => f.id === selectedCatalogSpec.id),
    [filteredCatalog, selectedCatalogSpec.id],
  );

  useEffect(() => {
    setCatOrbit(DEFAULT_ORBIT_OVERRIDE);
  }, [selectedCatalogSpec.id]);

  // Render Generator Canvas
  useEffect(() => {
    if (subMode !== 'generator') return;
    const canvas = genCanvasRef.current;
    if (!canvas) return;
    renderWireframeFigureToCanvas(generatorSpec, canvas, genOrbit, wfOptions, 2);

    let cancelled = false;
    const timer = window.setTimeout(() => {
      const exporter =
        exportQuality === 'hd_lossless'
          ? () => exportCanvasToHighQualityPng(canvas)
          : () => {
              const c1 = document.createElement('canvas');
              renderWireframeFigureToCanvas(generatorSpec, c1, genOrbit, wfOptions, 1);
              return exportCanvasToOptimizedPng(c1);
            };
      exporter()
        .then((res) => {
          if (!cancelled) {
            setGenPngStats({ sizeBytes: res.sizeBytes, width: res.width, height: res.height });
          }
        })
        .catch(() => {});
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [subMode, generatorSpec, genOrbit, wfOptions, exportQuality]);

  // Render Catalog Canvas
  useEffect(() => {
    if (subMode !== 'catalog') return;
    const canvas = catCanvasRef.current;
    if (!canvas) return;
    renderWireframeFigureToCanvas(selectedCatalogSpec, canvas, catOrbit, wfOptions, 2);

    let cancelled = false;
    const timer = window.setTimeout(() => {
      const exporter =
        exportQuality === 'hd_lossless'
          ? () => exportCanvasToHighQualityPng(canvas)
          : () => {
              const c1 = document.createElement('canvas');
              renderWireframeFigureToCanvas(selectedCatalogSpec, c1, catOrbit, wfOptions, 1);
              return exportCanvasToOptimizedPng(c1);
            };
      exporter()
        .then((res) => {
          if (!cancelled) {
            setCatPngStats({ sizeBytes: res.sizeBytes, width: res.width, height: res.height });
          }
        })
        .catch(() => {});
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [subMode, selectedCatalogSpec, catOrbit, wfOptions, exportQuality]);

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(generatedTechnicalPrompt);
      setCopiedPrompt(true);
      window.setTimeout(() => setCopiedPrompt(false), 2200);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleParseCustomText = () => {
    const raw = freeTextPromptInput.trim();
    if (!raw) return;
    const parsed = parseBiomechanicalPromptToPanel(raw);
    setActivePresetId('custom');
    setGenFocusZone(parsed.focusZone);
    setGenCamera(parsed.panel.cameraPreset);
    setGenActionEs(raw);
    setGenActionEn(raw);

    const degMatch = raw.match(/(-?\d+(?:[.,]\d+)?)\s*(?:°|º|deg|grados)/i);
    if (degMatch) {
      const val = parseFloat(degMatch[1].replace(',', '.'));
      setGenPrimaryDeg(val);
      setGenSectorMin(Math.max(0, Math.round(val - 20)));
      setGenSectorMax(Math.round(val + 20));
    }

    const subMatch = raw.match(/(?:alpha_|α_)([a-z0-9]+)/i);
    if (subMatch) {
      setGenSubscript(subMatch[1]);
    }

    const forceMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*(n|kn|kgf|kg)\b/i);
    if (forceMatch) {
      setGenForceLabel(`F = ${forceMatch[1]} ${forceMatch[2].toUpperCase()}`);
    } else {
      setGenForceLabel('F');
    }
    setGenOrbit(DEFAULT_ORBIT_OVERRIDE);
  };

  const handleDownloadSinglePng = async (
    spec: BookFigureFileSpec,
    orbitToUse = DEFAULT_ORBIT_OVERRIDE,
  ) => {
    try {
      setIsExportingSingle(true);
      const res = await renderWireframeFigureToPng(spec, orbitToUse, wfOptions, exportQuality);
      const cleanName = spec.fileName.endsWith('.png') ? spec.fileName : `${spec.fileName}.png`;
      triggerBlobDownload(res.blob, cleanName);
    } finally {
      setIsExportingSingle(false);
    }
  };

  const handleGenerateWireframeZip = async (scope: 'all' | 'chapter') => {
    if (batchProgress) return;
    const list = BOOK_FIGURE_CATALOG.filter((item) => {
      if (!includeAll84Figures && item.isExistingRealChart) return false;
      if (scope === 'chapter') {
        return item.chapter === selectedCatalogSpec.chapter;
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
        const rendered = await renderWireframeFigureToPng(
          spec,
          DEFAULT_ORBIT_OVERRIDE,
          wfOptions,
          exportQuality,
        );
        targetContainer.file(spec.fileName, rendered.blob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const zipName =
        scope === 'chapter'
          ? `wireframe-capitulo-${selectedCatalogSpec.chapter}.zip`
          : exportQuality === 'hd_lossless'
            ? 'figuras-wireframe-sectores-alta-calidad.zip'
            : 'figuras-wireframe-sectores-compacto.zip';

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

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>, isGen: boolean) => {
    const mode = isGen ? generatorSpec.renderMode : selectedCatalogSpec.renderMode;
    if (mode === 'diagram' || mode === 'real_chart') return;
    const cur = isGen ? genOrbit : catOrbit;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      az0: cur.azimuthDeg,
      el0: cur.elevationDeg,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>, isGen: boolean) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const nextAz = Math.max(-180, Math.min(180, Math.round(dragRef.current.az0 - dx * 0.45)));
    const nextEl = Math.max(-65, Math.min(65, Math.round(dragRef.current.el0 + dy * 0.35)));
    if (isGen) {
      setGenOrbit((p) => ({ ...p, azimuthDeg: nextAz, elevationDeg: nextEl }));
    } else {
      setCatOrbit((p) => ({ ...p, azimuthDeg: nextAz, elevationDeg: nextEl }));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

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

  const totalInZip = includeAll84Figures
    ? BOOK_FIGURE_CATALOG.length
    : BOOK_FIGURE_CATALOG.filter((f) => !f.isExistingRealChart).length;

  const isCat3D =
    selectedCatalogSpec.renderMode === '3d_single' || selectedCatalogSpec.renderMode === '3d_dual';

  return (
    <div className="space-y-5">
      {/* CABECERA PRINCIPAL Y PAQUETE DESCARGABLE CON NOMENCLATURA EXACTA */}
      <section className="bg-white border border-slate-300 rounded-lg p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-sky-800 font-semibold">
              <span>Ilustración Fotorrealista de Manual Médico</span>
              <span className="text-slate-300">·</span>
              <span>Sectores Angulares Azules y Cotas α_f</span>
              <span className="text-slate-300">·</span>
              <span>Vector Recto Descendente F</span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Laboratorio de Sectores Angulares, Vectores y Plan Completo de Figuras
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-4xl leading-relaxed">
              Aplica a todas las figuras (`fig-1-01.png` … `fig-13-04.png`) el estilo fotorrealista de manual ergonómico sobre fondo
              blanco con borde fino, anatomía humana con piel natural, ambo clínico gris oscuro de manga corta y pantalón largo gris
              lisos sin logotipos ni bolsillos, sectores angulares azules semitransparentes (60°/100°) con trazos negros nítidos,
              vector de fuerza <code className="font-mono font-bold">F</code> y pie centrado en español.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsPdfViewerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 whitespace-nowrap cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-sky-700" />
              Libro Guía PDF
            </button>

            <button
              type="button"
              onClick={onBackToEvaluator}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-800 whitespace-nowrap cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Volver a ErgoEval
            </button>
          </div>
        </div>

        {/* BARRA DE EXPORTACIÓN MASIVA ZIP Y CALIDAD */}
        <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-3.5 sm:p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2">
              <FolderArchive className="w-4 h-4 text-sky-700 shrink-0" />
              <span>
                Descarga de lote completo Wireframe 3D + Sectores (solo archivos PNG con nombre exacto de origen)
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
                  <option value="hd_lossless">Alta Calidad HD (24-bit · Doble nitidez 2×)</option>
                  <option value="compact_120kb">Editorial Compacto (&lt; 120 KB · Escala 1×)</option>
                </select>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <span className="font-semibold text-slate-800">Encuadre Catálogo:</span>
                <select
                  value={wfOptions.framingOverride}
                  onChange={(e) =>
                    setWfOptions((p) => ({
                      ...p,
                      framingOverride: e.target.value as WireframeVisualOptions['framingOverride'],
                    }))
                  }
                  className="px-2 py-1 rounded border border-slate-300 bg-white text-slate-900 font-medium text-xs"
                >
                  <option value="plan_default">Según Plan (Zona Aislada / Cuerpo Completo)</option>
                  <option value="full_body_profile">Cuerpo Completo Perfil Humano (Estilo Imagen Adjunta)</option>
                  <option value="isolated_zone">Priorizar Segmento Anatómico Aislado</option>
                </select>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeAll84Figures}
                  onChange={(e) => setIncludeAll84Figures(e.target.checked)}
                  className="rounded border-slate-400 text-sky-700"
                />
                <span>Incluir las 84 figuras completas</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useImagesSubfolder}
                  onChange={(e) => setUseImagesSubfolder(e.target.checked)}
                  className="rounded border-slate-400 text-sky-700"
                />
                <span>Subcarpeta `images/`</span>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => handleGenerateWireframeZip('all')}
              disabled={Boolean(batchProgress)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-xs sm:text-sm font-semibold text-white whitespace-nowrap cursor-pointer shadow-2xs"
            >
              <FileDown className="w-4 h-4" />
              {batchProgress
                ? `Renderizando ${batchProgress.current}/${batchProgress.total} (${batchProgress.label})...`
                : `Descargar ZIP Wireframe (${totalInZip} PNG)`}
            </button>

            {readyZipLink && !batchProgress && (
              <a
                href={readyZipLink.url}
                download={readyZipLink.fileName}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold whitespace-nowrap shadow-2xs"
              >
                <Link2 className="w-4 h-4" />
                <span>
                  {readyZipLink.fileName} ({readyZipLink.sizeMb} MB)
                </span>
              </a>
            )}
          </div>
        </div>

        {/* CONMUTADOR DE MODOS INTERNOS + CAPAS VISUALES RÁPIDAS */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="inline-flex flex-wrap rounded-md border border-slate-300 bg-slate-100 p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => setSubMode('generator')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                subMode === 'generator'
                  ? 'bg-sky-700 text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              Generador Paramétrico ([ZONA] · [ACCIÓN] · α_f · Vector F)
            </button>

            <button
              type="button"
              onClick={() => setSubMode('catalog')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                subMode === 'catalog'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Catálogo 84 Figuras en Modo Wireframe + Sectores
            </button>

            <button
              type="button"
              onClick={() => setSubMode('table')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                subMode === 'table'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              Tabla Oficial (`Figura · Contenido · Cuerpos · Archivos`)
            </button>
          </div>

          {/* Toggles rápidos de las capas científicas pedidas */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700">
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={wfOptions.showWireframe}
                onChange={(e) => setWfOptions((p) => ({ ...p, showWireframe: e.target.checked }))}
                className="rounded border-slate-400 text-sky-700"
              />
              <span className="font-medium">Wireframe 3D</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={wfOptions.showBlueAngularSectors}
                onChange={(e) => setWfOptions((p) => ({ ...p, showBlueAngularSectors: e.target.checked }))}
                className="rounded border-slate-400 text-sky-700"
              />
              <span className="font-medium">Sectores Azules (60°/100°)</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={wfOptions.showOrangeCurvedArcs}
                onChange={(e) => setWfOptions((p) => ({ ...p, showOrangeCurvedArcs: e.target.checked }))}
                className="rounded border-slate-400 text-sky-700"
              />
              <span className="font-medium">Arco Naranja (α_f)</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={wfOptions.showDownwardForceF}
                onChange={(e) => setWfOptions((p) => ({ ...p, showDownwardForceF: e.target.checked }))}
                className="rounded border-slate-400 text-sky-700"
              />
              <span className="font-medium">Vector Fuerza &apos;F&apos;</span>
            </label>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* MODO 1: GENERADOR PARAMÉTRICO WIREFRAME 3D + SECTORES + VECTOR F      */}
      {/* ===================================================================== */}
      {subMode === 'generator' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* PANEL IZQUIERDO DE PARÁMETROS ANATÓMICOS Y PROMPT TÉCNICO */}
          <aside className="lg:col-span-5 bg-white border border-slate-300 rounded-lg p-4 sm:p-5 shadow-2xs space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                1. Plantillas Biomecánicas Rápidas
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Seleccione el modelo de referencia adjunto (60°–100° | &gt;100° y &lt;60°) o cualquier segmento aislado:
              </p>
              <div className="grid grid-cols-1 gap-1.5 mt-2.5">
                {PARAMETRIC_PRESETS.map((pr) => {
                  const isActive = activePresetId === pr.id;
                  return (
                    <button
                      key={pr.id}
                      type="button"
                      onClick={() => applyPreset(pr)}
                      className={`text-left px-3 py-2 rounded-md border text-xs font-medium transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-sky-50 border-sky-600 text-sky-950 font-semibold'
                          : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {pr.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-slate-200 pt-3.5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                2. Parámetros de Renderizado ([ZONA] · [ACCIÓN] · [ÁNGULO] · F)
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="space-y-1 sm:col-span-2">
                  <span className="font-semibold text-slate-700">[ZONA ANATÓMICA]</span>
                  <select
                    value={genFocusZone}
                    onChange={(e) => {
                      setActivePresetId('custom');
                      setGenFocusZone(e.target.value as FocusZone);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-slate-900"
                  >
                    {(Object.keys(FOCUS_ZONE_META) as FocusZone[]).map((z) => (
                      <option key={z} value={z}>
                        {FOCUS_ZONE_META[z].es}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 sm:col-span-2">
                  <span className="font-semibold text-slate-700">[POSTURAS O ACCIÓN]</span>
                  <input
                    type="text"
                    value={genActionEs}
                    onChange={(e) => {
                      setActivePresetId('custom');
                      setGenActionEs(e.target.value);
                      setGenActionEn(e.target.value);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-slate-900"
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-slate-700">Composición y Formato</span>
                  <select
                    value={genFormat}
                    onChange={(e) =>
                      setGenFormat(
                        e.target.value as
                          | 'dual_reference_sectors'
                          | 'dual_800x520'
                          | 'single_480x640'
                          | 'scene_800x520',
                      )
                    }
                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-slate-900"
                  >
                    <option value="dual_reference_sectors">
                      2 Cuerpos · Sectores Óptimo vs Umbrales (800×520)
                    </option>
                    <option value="dual_800x520">2 Cuerpos · Comparativa A/B (800×520)</option>
                    <option value="single_480x640">1 Cuerpo / Zona Vertical (480×640)</option>
                    <option value="scene_800x520">1 Cuerpo / Escena Apaisada (800×520)</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-slate-700">Plano de Cámara</span>
                  <select
                    value={genCamera}
                    onChange={(e) => setGenCamera(e.target.value as CameraPreset)}
                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-slate-900"
                  >
                    {(Object.keys(CAMERA_LABELS) as CameraPreset[]).map((c) => (
                      <option key={c} value={c}>
                        {CAMERA_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <div className="flex justify-between font-semibold text-slate-700">
                    <span>Ángulo Evaluado</span>
                    <span className="font-mono text-sky-800 tabular-nums">{genPrimaryDeg}°</span>
                  </div>
                  <input
                    type="range"
                    min={-45}
                    max={160}
                    value={genPrimaryDeg}
                    onChange={(e) => setGenPrimaryDeg(Number(e.target.value))}
                    className="w-full accent-sky-700"
                  />
                </label>

                <label className="space-y-1">
                  <div className="flex justify-between font-semibold text-slate-700">
                    <span>Ángulo 2° Cuerpo / Umbral</span>
                    <span className="font-mono text-orange-700 tabular-nums">{genCompareDeg}°</span>
                  </div>
                  <input
                    type="range"
                    min={-30}
                    max={160}
                    value={genCompareDeg}
                    onChange={(e) => setGenCompareDeg(Number(e.target.value))}
                    className="w-full accent-orange-600"
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-slate-700">Sector Azul Mín. (°)</span>
                  <input
                    type="number"
                    min={-60}
                    max={150}
                    value={genSectorMin}
                    onChange={(e) => setGenSectorMin(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-slate-900 font-mono tabular-nums"
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-slate-700">Sector Azul Máx. (°)</span>
                  <input
                    type="number"
                    min={-45}
                    max={175}
                    value={genSectorMax}
                    onChange={(e) => setGenSectorMax(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-slate-900 font-mono tabular-nums"
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-slate-700">[ÁNGULO: Subíndice α]</span>
                  <select
                    value={genSubscript}
                    onChange={(e) => setGenSubscript(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-slate-900 font-mono"
                  >
                    <option value="f">α_f (Flexión)</option>
                    <option value="e">α_e (Extensión)</option>
                    <option value="abd">α_abd (Abducción)</option>
                    <option value="m">α_m (Muñeca)</option>
                    <option value="c">α_c (Cervical)</option>
                    <option value="t">α_t (Tronco / L5-S1)</option>
                    <option value="d">α_d (Dorsiflexión)</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-slate-700">Etiqueta Vector Fuerza</span>
                  <input
                    type="text"
                    value={genForceLabel}
                    onChange={(e) => setGenForceLabel(e.target.value)}
                    placeholder="F"
                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-slate-900 font-mono"
                  />
                </label>

                <label className="space-y-1">
                  <div className="flex justify-between font-semibold text-slate-700">
                    <span>Densidad Wireframe</span>
                    <span className="font-mono tabular-nums">
                      {Math.round(wfOptions.wireframeOpacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.12}
                    max={0.85}
                    step={0.04}
                    value={wfOptions.wireframeOpacity}
                    onChange={(e) =>
                      setWfOptions((p) => ({ ...p, wireframeOpacity: Number(e.target.value) }))
                    }
                    className="w-full accent-sky-700"
                  />
                </label>

                <label className="space-y-1">
                  <div className="flex justify-between font-semibold text-slate-700">
                    <span>Transparencia Piel</span>
                    <span className="font-mono tabular-nums">
                      {Math.round(wfOptions.skinTranslucency * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.14}
                    max={0.62}
                    step={0.04}
                    value={wfOptions.skinTranslucency}
                    onChange={(e) =>
                      setWfOptions((p) => ({ ...p, skinTranslucency: Number(e.target.value) }))
                    }
                    className="w-full accent-sky-700"
                  />
                </label>

                <label className="space-y-1 sm:col-span-2">
                  <span className="font-semibold text-slate-700">Nombre de Archivo PNG</span>
                  <input
                    type="text"
                    value={genFileName}
                    onChange={(e) => setGenFileName(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-slate-900 font-mono"
                  />
                </label>
              </div>
            </div>

            {/* ESPECIFICACIÓN TÉCNICA SINCRONIZADA + ENTRADA LIBRE */}
            <div className="border-t border-slate-200 pt-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900">
                  Especificación Técnica Generada (Prompt Científico)
                </span>
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-800 cursor-pointer"
                >
                  {copiedPrompt ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-700" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-sky-700" />
                      Copiar Prompt
                    </>
                  )}
                </button>
              </div>

              <div className="p-2.5 rounded-md bg-slate-900 text-slate-100 font-mono text-[11px] leading-relaxed select-all">
                {generatedTechnicalPrompt}
              </div>

              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-semibold text-slate-700 block">
                  Interpretar descripción libre (español o inglés):
                </span>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={freeTextPromptInput}
                    onChange={(e) => setFreeTextPromptInput(e.target.value)}
                    placeholder="Ej. Elbow forearm flexion 85° alpha_f with force F = 45 N..."
                    className="flex-1 px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-xs text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={handleParseCustomText}
                    className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            </div>
          </aside>

          {/* COLUMNA DERECHA: VISOR WIREFRAME 3D EN ALTA NITIDEZ + REFERENCIA ADJUNTA */}
          <section className="lg:col-span-7 bg-white border border-slate-300 rounded-lg p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <div className="text-xs font-mono text-slate-600 tabular-nums">
                  Archivo: <strong className="text-slate-900">{generatorSpec.fileName}</strong>
                  {' · '}
                  <span>Formato {generatorSpec.widthPx}×{generatorSpec.heightPx} px</span>
                  {genPngStats && (
                    <>
                      {' · '}
                      <span className="text-emerald-700 font-semibold">
                        PNG {genPngStats.width}×{genPngStats.height} px (
                        {(genPngStats.sizeBytes / 1024).toFixed(1)} KB)
                      </span>
                    </>
                  )}
                </div>
                <h2 className="text-base font-bold text-slate-900 mt-0.5">{generatorSpec.title}</h2>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowRefImagePanel((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 whitespace-nowrap cursor-pointer"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-sky-700" />
                  {showRefImagePanel ? 'Ocultar Referencia' : 'Ver Imagen Referencia'}
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadSinglePng(generatorSpec, genOrbit)}
                  disabled={isExportingSingle}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Descargar {generatorSpec.fileName}
                </button>
              </div>
            </div>

            <div className="bg-slate-100 border border-slate-300 rounded-md p-3 sm:p-4 flex flex-col items-center justify-center">
              <div className="w-full flex items-center justify-between text-[11px] text-slate-600 mb-2 px-1">
                <span>
                  Arrastre horizontal/verticalmente sobre el lienzo para inspeccionar el wireframe 3D o restaure 0°
                </span>
                <span className="font-mono tabular-nums font-semibold text-slate-700">
                  Nitidez 2× · Fondo #FFFFFF
                </span>
              </div>

              <canvas
                ref={genCanvasRef}
                onPointerDown={(e) => handlePointerDown(e, true)}
                onPointerMove={(e) => handlePointerMove(e, true)}
                onPointerUp={handlePointerUp}
                className={`${getCanvasMaxWidthClass(generatorSpec.widthPx)} h-auto bg-white shadow-xs rounded-xs border border-slate-300 cursor-grab active:cursor-grabbing`}
              />
            </div>

            {/* Control de órbita 3D */}
            <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-sky-700" />
                  Cámara Ortográfica / Verdadera Magnitud
                </span>
                <button
                  type="button"
                  onClick={() => setGenOrbit(DEFAULT_ORBIT_OVERRIDE)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restaurar Verdadera Magnitud (0°)
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <label className="space-y-1">
                  <div className="flex justify-between text-slate-600">
                    <span>Rotación Horizontal</span>
                    <span className="font-mono tabular-nums">{genOrbit.azimuthDeg}°</span>
                  </div>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={genOrbit.azimuthDeg}
                    onChange={(e) => setGenOrbit((p) => ({ ...p, azimuthDeg: Number(e.target.value) }))}
                    className="w-full accent-sky-700"
                  />
                </label>

                <label className="space-y-1">
                  <div className="flex justify-between text-slate-600">
                    <span>Elevación</span>
                    <span className="font-mono tabular-nums">{genOrbit.elevationDeg}°</span>
                  </div>
                  <input
                    type="range"
                    min={-65}
                    max={65}
                    value={genOrbit.elevationDeg}
                    onChange={(e) => setGenOrbit((p) => ({ ...p, elevationDeg: Number(e.target.value) }))}
                    className="w-full accent-sky-700"
                  />
                </label>

                <label className="space-y-1">
                  <div className="flex justify-between text-slate-600">
                    <span>Zoom</span>
                    <span className="font-mono tabular-nums">{genOrbit.zoom.toFixed(2)}×</span>
                  </div>
                  <input
                    type="range"
                    min={0.65}
                    max={1.85}
                    step={0.05}
                    value={genOrbit.zoom}
                    onChange={(e) => setGenOrbit((p) => ({ ...p, zoom: Number(e.target.value) }))}
                    className="w-full accent-sky-700"
                  />
                </label>
              </div>
            </div>

            {/* Panel comparativo con la imagen de referencia adjunta */}
            {showRefImagePanel && (
              <div className="border border-slate-200 rounded-md p-3 bg-slate-50/70 flex flex-col sm:flex-row items-center gap-4">
                {!refImgError ? (
                  <img
                    src={REFERENCE_IMAGE_PATH}
                    alt="Referencia ergonómica de sectores angulares de antebrazo (60°–100° vs >100° y <60°)"
                    referrerPolicy="no-referrer"
                    onError={() => setRefImgError(true)}
                    className="w-44 h-44 object-contain bg-white border border-slate-200 rounded p-1 shrink-0"
                  />
                ) : (
                  <div className="w-44 h-44 flex items-center justify-center bg-white border border-slate-200 rounded text-xs text-slate-500 p-3 text-center shrink-0">
                    Referencia de sectores 60°–100° | &gt;100° y &lt;60°
                  </div>
                )}
                <div className="space-y-1.5 text-xs text-slate-700">
                  <div className="font-bold text-slate-900">
                    Correspondencia con la guía visual adjunta + capas técnicas añadidas
                  </div>
                  <p className="leading-relaxed">
                    Se conserva la composición de perfil anatómico sobre fondo blanco limpio y los sectores
                    angulares azules con cotas recuadradas (<code className="font-mono">100°</code>,{' '}
                    <code className="font-mono">60°</code>, <code className="font-mono">&gt;100°</code>,{' '}
                    <code className="font-mono">&lt;60°</code>), sumando la malla topológica{' '}
                    <strong>wireframe 3D</strong>, la piel volumétrica translúcida con esqueleto y tejidos blandos,
                    los <strong>nodos azules luminosos</strong> en los centros de rotación, las{' '}
                    <strong>flechas curvas naranjas</strong> (<code className="font-mono">α_f</code>) y el{' '}
                    <strong>vector recto descendente &apos;F&apos;</strong>.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODO 2: CATÁLOGO DE LAS 84 FIGURAS EN ESTILO WIREFRAME + SECTORES     */}
      {/* ===================================================================== */}
      {subMode === 'catalog' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <aside className="lg:col-span-5 bg-white border border-slate-300 rounded-lg overflow-hidden shadow-2xs">
            <div className="p-3.5 border-b border-slate-200 space-y-3 bg-slate-50">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar ej. fig-4-07.png, antebrazo, muñeca, lumbar..."
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
                <span>
                  Mostrando {filteredCatalog.length} de {BOOK_FIGURE_CATALOG.length} archivos
                </span>
                <span>Wireframe + Sectores + F</span>
              </div>
            </div>

            <div className="max-h-[640px] overflow-y-auto divide-y divide-slate-200">
              {filteredCatalog.map((item) => {
                const isSelected = item.id === selectedCatalogSpec.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedCatalogId(item.id)}
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
            </div>
          </aside>

          <section className="lg:col-span-7 bg-white border border-slate-300 rounded-lg p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <div className="text-xs font-mono text-slate-600 tabular-nums">
                  Archivo exacto: <strong className="text-slate-900">{selectedCatalogSpec.fileName}</strong>
                  {' · '}
                  <span>
                    Base {selectedCatalogSpec.widthPx}×{selectedCatalogSpec.heightPx} px
                  </span>
                  {catPngStats && (
                    <>
                      {' · '}
                      <span className="text-emerald-700 font-semibold">
                        Salida {catPngStats.width}×{catPngStats.height} px (
                        {(catPngStats.sizeBytes / 1024).toFixed(1)} KB)
                      </span>
                    </>
                  )}
                </div>
                <h2 className="text-base font-bold text-slate-900 mt-0.5">
                  Figura {selectedCatalogSpec.figureNumber}
                  {selectedCatalogSpec.subPart || ''}: {selectedCatalogSpec.title}
                </h2>
                <p className="text-xs text-slate-600 mt-1">{selectedCatalogSpec.bookDescription}</p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={selectedIndexInFiltered <= 0}
                  onClick={() => {
                    if (selectedIndexInFiltered > 0) {
                      setSelectedCatalogId(filteredCatalog[selectedIndexInFiltered - 1].id);
                    }
                  }}
                  className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-35 text-slate-700 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono text-slate-600 px-1.5 tabular-nums">
                  {selectedIndexInFiltered + 1}/{filteredCatalog.length}
                </span>
                <button
                  type="button"
                  disabled={
                    selectedIndexInFiltered < 0 || selectedIndexInFiltered >= filteredCatalog.length - 1
                  }
                  onClick={() => {
                    if (selectedIndexInFiltered < filteredCatalog.length - 1) {
                      setSelectedCatalogId(filteredCatalog[selectedIndexInFiltered + 1].id);
                    }
                  }}
                  className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-35 text-slate-700 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="bg-slate-100 border border-slate-300 rounded-md p-3 sm:p-4 flex flex-col items-center justify-center">
              <div className="w-full flex items-center justify-between text-[11px] text-slate-600 mb-2 px-1">
                <span>
                  {isCat3D
                    ? 'Modelo 3D Wireframe con esqueleto, tejidos blandos, sectores azules, arco naranja α_f y vector F'
                    : 'Esquema técnico renderizado en alta definición 2×'}
                </span>
                <span className="font-mono tabular-nums font-semibold text-slate-700">
                  {selectedCatalogSpec.fileName}
                </span>
              </div>

              <canvas
                ref={catCanvasRef}
                onPointerDown={(e) => handlePointerDown(e, false)}
                onPointerMove={(e) => handlePointerMove(e, false)}
                onPointerUp={handlePointerUp}
                className={`${getCanvasMaxWidthClass(selectedCatalogSpec.widthPx)} h-auto bg-white shadow-xs rounded-xs border border-slate-300 ${
                  isCat3D ? 'cursor-grab active:cursor-grabbing' : ''
                }`}
              />
            </div>

            {isCat3D && (
              <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-sky-700" />
                    Control de Cámara y Verdadera Magnitud
                  </span>
                  <button
                    type="button"
                    onClick={() => setCatOrbit(DEFAULT_ORBIT_OVERRIDE)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restaurar Verdadera Magnitud (0°)
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <label className="space-y-1">
                    <div className="flex justify-between text-slate-600">
                      <span>Giro Horizontal</span>
                      <span className="font-mono tabular-nums">{catOrbit.azimuthDeg}°</span>
                    </div>
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      value={catOrbit.azimuthDeg}
                      onChange={(e) => setCatOrbit((p) => ({ ...p, azimuthDeg: Number(e.target.value) }))}
                      className="w-full accent-sky-700"
                    />
                  </label>

                  <label className="space-y-1">
                    <div className="flex justify-between text-slate-600">
                      <span>Inclinación Vertical</span>
                      <span className="font-mono tabular-nums">{catOrbit.elevationDeg}°</span>
                    </div>
                    <input
                      type="range"
                      min={-65}
                      max={65}
                      value={catOrbit.elevationDeg}
                      onChange={(e) => setCatOrbit((p) => ({ ...p, elevationDeg: Number(e.target.value) }))}
                      className="w-full accent-sky-700"
                    />
                  </label>

                  <label className="space-y-1">
                    <div className="flex justify-between text-slate-600">
                      <span>Zoom Óptico</span>
                      <span className="font-mono tabular-nums">{catOrbit.zoom.toFixed(2)}×</span>
                    </div>
                    <input
                      type="range"
                      min={0.65}
                      max={1.85}
                      step={0.05}
                      value={catOrbit.zoom}
                      onChange={(e) => setCatOrbit((p) => ({ ...p, zoom: Number(e.target.value) }))}
                      className="w-full accent-sky-700"
                    />
                  </label>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="text-xs text-slate-600 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Descarga directa con nomenclatura oficial{' '}
                  <code className="font-mono font-semibold">{selectedCatalogSpec.fileName}</code>.
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleGenerateWireframeZip('chapter')}
                  disabled={Boolean(batchProgress)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer"
                >
                  <Archive className="w-3.5 h-3.5 text-slate-600" />
                  ZIP Cap. {selectedCatalogSpec.chapter}
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadSinglePng(selectedCatalogSpec, catOrbit)}
                  disabled={isExportingSingle}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Descargar {selectedCatalogSpec.fileName}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODO 3: TABLA OFICIAL CON DESCARGA INDIVIDUAL WIREFRAME + SECTORES    */}
      {/* ===================================================================== */}
      {subMode === 'table' && (
        <section className="bg-white border border-slate-300 rounded-lg overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                Índice Completo del Plan de Figuras (Versión Wireframe 3D + Sectores + Vector F)
              </h2>
              <p className="text-xs text-slate-600">
                Previsualice o descargue individualmente cada archivo conservando su nombre exacto de origen.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleGenerateWireframeZip('all')}
              disabled={Boolean(batchProgress)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-xs font-semibold text-white cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" />
              Descargar Todo en ZIP ({totalInZip} PNG)
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white font-semibold">
                  <th className="py-2.5 px-3.5 w-20">Figura</th>
                  <th className="py-2.5 px-3.5">Contenido</th>
                  <th className="py-2.5 px-3.5 w-24 text-center">Cuerpos</th>
                  <th className="py-2.5 px-3.5 w-80">Archivos (Descarga Directa)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {groupedPlanRows.map((row) => (
                  <tr key={row.figureNumber} className="hover:bg-slate-50/90">
                    <td className="py-2.5 px-3.5 font-mono font-bold text-slate-900 tabular-nums align-top">
                      {row.figureNumber}
                    </td>
                    <td className="py-2.5 px-3.5 text-slate-800 align-top">{row.title}</td>
                    <td className="py-2.5 px-3.5 font-mono text-center text-slate-600 tabular-nums align-top">
                      {row.bodiesLabel}
                    </td>
                    <td className="py-2.5 px-3.5 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {row.files.map((fSpec) => (
                          <div
                            key={fSpec.id}
                            className="inline-flex items-center rounded border border-slate-300 bg-white overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCatalogId(fSpec.id);
                                setSubMode('catalog');
                              }}
                              className="px-2 py-1 text-[11px] font-mono font-semibold text-sky-800 hover:bg-sky-50 inline-flex items-center gap-1 cursor-pointer"
                              title="Previsualizar en el visor Wireframe 3D"
                            >
                              <Eye className="w-3 h-3" />
                              {fSpec.fileName}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadSinglePng(fSpec)}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 border-l border-slate-300 text-slate-700 cursor-pointer"
                              title={`Descargar ${fSpec.fileName}`}
                            >
                              <Download className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* MODAL VISOR DEL LIBRO PDF */}
      {isPdfViewerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-300 w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden shadow-xl">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="font-bold text-sm text-slate-900">
                Documento Guía — Evaluación Ergonómica de Puestos de Trabajo (Mauricio A. Pizarro Muñoz)
              </div>
              <button
                type="button"
                onClick={() => setIsPdfViewerOpen(false)}
                className="p-1 rounded hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <iframe
              src={BOOK_PDF_PATH}
              title="Libro Guía Evaluación Ergonómica PDF"
              className="flex-1 w-full border-0"
            />
          </div>
        </div>
      )}
    </div>
  );
};

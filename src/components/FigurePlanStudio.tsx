import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import {
  ArrowLeft,
  BookOpen,
  Box,
  Check,
  Crosshair,
  Download,
  FolderArchive,
  ImagePlus,
  Layers,
  Move3d,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Sliders,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  BookFigureFileSpec,
  CameraPreset,
  FocusZone,
  JointKey,
  Panel3DSpec,
  PosturePose3D,
  ScenePropType,
} from '../types/figurePlan';
import {
  BOOK_FIGURE_CATALOG,
  clearCustomFigurePhotoOverride,
  clearCustomFigurePoseOverride,
  extractFigurePoseFromImage,
  getEffectiveFigurePhotoUrl,
  hasCustomFigurePhotoOverride,
  hasCustomFigurePoseOverride,
  makeNeutralPose,
  parseBiomechanicalPromptToPanel,
  saveDefinitiveFigureImageToApp,
  saveDefinitiveFigurePoseToCatalog,
  subscribeFigurePhotoOverrides,
  subscribeFigurePoseOverrides,
} from '../utils/figurePlanCatalog';
import {
  CameraOrbitOverride,
  DEFAULT_ORBIT_OVERRIDE,
  ensureAvatarGlbLoaded,
  renderBookFigureToCanvas,
  renderBookFigureToPng,
  renderInteractiveFreeAvatarToCanvas,
  subscribeAvatarGlbLoaded,
} from '../utils/biomech3dRenderer';
import { exportCanvasToHighQualityPng } from '../utils/pngOptimizer';
import { InteractivePhotoGoniometer } from './InteractivePhotoGoniometer';

export interface FigurePlanStudioProps {
  onBackToEvaluator: () => void;
}

type StudioSubTab = 'catalogo_3d' | 'generador_prompt' | 'documentacion_pdf';
type ViewportDisplayMode = 'lamina_completa' | 'avatar_libre_cuerpo' | 'goniometro_foto';
type AngleCategory = 'tronco_cuello' | 'brazo_der' | 'brazo_izq' | 'piernas_pies' | 'espacio_objeto';

const BODY_LETTERS = ['A', 'B', 'C', 'D'] as const;

function clonePanelsDeepLocal(panels: Panel3DSpec[] | undefined): Panel3DSpec[] {
  if (!panels || panels.length === 0) return [];
  return JSON.parse(JSON.stringify(panels)) as Panel3DSpec[];
}

const SCENE_PROP_LABELS: Array<{ value: ScenePropType; label: string }> = [
  { value: 'none', label: 'Sin objeto / mobiliario' },
  { value: 'work_desk_support', label: 'Mesa / Objeto de apoyo bajo el codo (Fig. 4.6b)' },
  { value: 'iron_tamper_low', label: 'Pisón de tierra bajo (Compactación manual)' },
  { value: 'iron_tamper_high', label: 'Pisón de tierra elevado (Impacto vertical)' },
  { value: 'trench_shovel', label: 'Pala de zanjeo con tierra' },
  { value: 'chair', label: 'Silla de trabajo regulable' },
  { value: 'box_load', label: 'Caja / carga bimanual' },
  { value: 'bus_driver_seat', label: 'Puesto Chofer de Ómnibus / Colectivo' },
  { value: 'crane_levers', label: 'Banco de palancas de hidrogrúa' },
  { value: 'pallet_jack_rack', label: 'Tarima + Estantería industrial' },
  { value: 'bin_to_cart', label: 'Contenedor Bin + Carro lateral' },
  { value: 'floor_pouches', label: 'Bolsines sobre el suelo' },
  { value: 'conveyor_veg_line', label: 'Cinta transportadora continua' },
  { value: 'hopper_sack_pour', label: 'Tolva inoxidable + Saco' },
  { value: 'cart_push_dynamo', label: 'Carro plataforma (Empuje)' },
  { value: 'cart_pull_dynamo', label: 'Carro plataforma (Tracción)' },
  { value: 'office_desk_lateral', label: 'Escritorio de oficina lateral con monitor' },
  { value: 'office_desk_corner_monitor', label: 'Escritorio con monitor en esquina' },
  { value: 'high_scanner_desk', label: 'Mostrador alto de escaneo (99 cm)' },
  { value: 'electrical_panel', label: 'Tablero eléctrico industrial' },
  { value: 'cold_room_high_shelf', label: 'Estante alto en cámara frigorífica' },
  { value: 'pallet_cooler', label: 'Pallet con conservadora térmica' },
];

interface JointSliderField {
  key: keyof PosturePose3D;
  label: string;
  min: number;
  max: number;
  step?: number;
  unit: string;
  category: Exclude<AngleCategory, 'espacio_objeto'>;
}

const JOINT_SLIDER_FIELDS: JointSliderField[] = [
  // Tronco y Cuello
  { key: 'trunkFlexionDeg', label: 'Tronco · Flexión (+) / Extensión (−)', min: -30, max: 110, unit: '°', category: 'tronco_cuello' },
  { key: 'trunkLateralDeg', label: 'Tronco · Inclinación Lateral', min: -35, max: 35, unit: '°', category: 'tronco_cuello' },
  { key: 'trunkTwistDeg', label: 'Tronco · Giro / Rotación Axial', min: -60, max: 60, unit: '°', category: 'tronco_cuello' },
  { key: 'neckFlexionDeg', label: 'Cuello · Flexión (+) / Extensión (−)', min: -40, max: 55, unit: '°', category: 'tronco_cuello' },
  { key: 'neckLateralDeg', label: 'Cuello · Inclinación Lateral', min: -30, max: 30, unit: '°', category: 'tronco_cuello' },
  { key: 'neckTwistDeg', label: 'Cuello · Rotación Cervical', min: -60, max: 60, unit: '°', category: 'tronco_cuello' },

  // Brazo Derecho
  { key: 'shoulderRFlexionDeg', label: 'Hombro Der. · Flexión (+) / Extensión (−)', min: -49, max: 175, unit: '°', category: 'brazo_der' },
  { key: 'shoulderRAbductionDeg', label: 'Hombro Der. · Abducción Lateral', min: 0, max: 135, unit: '°', category: 'brazo_der' },
  { key: 'shoulderRRotationDeg', label: 'Hombro Der. · Rotación Humeral', min: -90, max: 90, unit: '°', category: 'brazo_der' },
  { key: 'elbowRFlexionDeg', label: 'Codo Der. · Flexión (0° recto, 90° L)', min: 0, max: 155, unit: '°', category: 'brazo_der' },
  { key: 'forearmRPronationDeg', label: 'Antebrazo Der. · Pronación / Supinación', min: -85, max: 85, unit: '°', category: 'brazo_der' },
  { key: 'wristRFlexionDeg', label: 'Muñeca Der. · Flexión / Extensión', min: -60, max: 60, unit: '°', category: 'brazo_der' },
  { key: 'wristRDeviationDeg', label: 'Muñeca Der. · Desviación Radial/Cubital', min: -30, max: 30, unit: '°', category: 'brazo_der' },

  // Brazo Izquierdo
  { key: 'shoulderLFlexionDeg', label: 'Hombro Izq. · Flexión (+) / Extensión (−)', min: -49, max: 175, unit: '°', category: 'brazo_izq' },
  { key: 'shoulderLAbductionDeg', label: 'Hombro Izq. · Abducción Lateral', min: 0, max: 135, unit: '°', category: 'brazo_izq' },
  { key: 'shoulderLRotationDeg', label: 'Hombro Izq. · Rotación Humeral', min: -90, max: 90, unit: '°', category: 'brazo_izq' },
  { key: 'elbowLFlexionDeg', label: 'Codo Izq. · Flexión (0° recto, 90° L)', min: 0, max: 155, unit: '°', category: 'brazo_izq' },
  { key: 'forearmLPronationDeg', label: 'Antebrazo Izq. · Pronación / Supinación', min: -85, max: 85, unit: '°', category: 'brazo_izq' },
  { key: 'wristLFlexionDeg', label: 'Muñeca Izq. · Flexión / Extensión', min: -60, max: 60, unit: '°', category: 'brazo_izq' },
  { key: 'wristLDeviationDeg', label: 'Muñeca Izq. · Desviación Radial/Cubital', min: -30, max: 30, unit: '°', category: 'brazo_izq' },

  // Piernas y Pies
  { key: 'hipRFlexionDeg', label: 'Cadera Der. · Flexión / Extensión', min: -30, max: 125, unit: '°', category: 'piernas_pies' },
  { key: 'kneeRFlexionDeg', label: 'Rodilla Der. · Flexión', min: 0, max: 145, unit: '°', category: 'piernas_pies' },
  { key: 'ankleRDorsiflexionDeg', label: 'Tobillo Der. · Dorsiflexión / Plantar', min: -45, max: 40, unit: '°', category: 'piernas_pies' },
  { key: 'hipLFlexionDeg', label: 'Cadera Izq. · Flexión / Extensión', min: -30, max: 125, unit: '°', category: 'piernas_pies' },
  { key: 'kneeLFlexionDeg', label: 'Rodilla Izq. · Flexión', min: 0, max: 145, unit: '°', category: 'piernas_pies' },
  { key: 'ankleLDorsiflexionDeg', label: 'Tobillo Izq. · Dorsiflexión / Plantar', min: -45, max: 40, unit: '°', category: 'piernas_pies' },
];

const REFERENCE_PDF_DOCS = [
  {
    id: 'ergoniza_2026',
    title: 'Ergoniza Intelligent — Bases de Funcionamiento (16 Segmentos / 14 Articulaciones)',
    url: '/assets/aistudio/Ergoniza_Intelligent_-_Bases_de_funcionamiento_3957c1bb.pdf',
  },
];

export const FigurePlanStudio: React.FC<FigurePlanStudioProps> = ({ onBackToEvaluator }) => {
  const [subTab, setSubTab] = useState<StudioSubTab>('catalogo_3d');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [chapterFilter, setChapterFilter] = useState<number | 'all'>('all');

  // Figura seleccionada (por defecto abrimos en Cap. 4 o la primera 3D)
  const [selectedFigId, setSelectedFigId] = useState<string>('fig-4-06b');
  const [overrideTick, setOverrideTick] = useState<number>(0);
  const [avatarReady, setAvatarReady] = useState<boolean>(false);

  const selectedCatalogSpec = useMemo<BookFigureFileSpec>(() => {
    void overrideTick;
    return (
      BOOK_FIGURE_CATALOG.find((f) => f.id === selectedFigId) ||
      BOOK_FIGURE_CATALOG.find((f) => f.panels && f.panels.length > 0) ||
      BOOK_FIGURE_CATALOG[0]
    );
  }, [selectedFigId, overrideTick]);

  // Estado local editable de los paneles (Cuerpo A, Cuerpo B, Cuerpo C, Cuerpo D)
  const [draftPanels, setDraftPanels] = useState<Panel3DSpec[]>(() =>
    clonePanelsDeepLocal(selectedCatalogSpec.panels),
  );
  const [activeBodyIdx, setActiveBodyIdx] = useState<number>(0);
  const [viewportMode, setViewportMode] = useState<ViewportDisplayMode>('avatar_libre_cuerpo');
  const [preferSynthetic3D, setPreferSynthetic3D] = useState<boolean>(true);
  const [showAssignedPhotoBelow, setShowAssignedPhotoBelow] = useState<boolean>(true);
  const [angleCategory, setAngleCategory] = useState<AngleCategory>('brazo_der');
  const [mirrorArmsLegs, setMirrorArmsLegs] = useState<boolean>(false);
  const [show3DGizmos, setShow3DGizmos] = useState<boolean>(true);
  const [show3DGoniometerOverlay, setShow3DGoniometerOverlay] = useState<boolean>(false);
  const [selectedJoint3D, setSelectedJoint3D] = useState<JointKey | null>('elbowR');
  const [hoveredJoint3D, setHoveredJoint3D] = useState<JointKey | null>(null);
  const [transferTargetField, setTransferTargetField] = useState<keyof PosturePose3D>('elbowRFlexionDeg');
  const [orbitOverride, setOrbitOverride] = useState<CameraOrbitOverride>(DEFAULT_ORBIT_OVERRIDE);

  // Estado de operaciones asíncronas y notificaciones
  const [isSavingPose, setIsSavingPose] = useState<boolean>(false);
  const [isExtractingAiPose, setIsExtractingAiPose] = useState<boolean>(false);
  const [isExportingZip, setIsExportingZip] = useState<boolean>(false);
  const [zipProgressPct, setZipProgressPct] = useState<number>(0);
  const [bannerMsg, setBannerMsg] = useState<{
    tone: 'info' | 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  // Generador libre por instrucción escrita
  const [customPromptText, setCustomPromptText] = useState<string>(
    'Operario de pie flexionando tronco 35° y codo derecho 85° con mesa de apoyo bajo el codo',
  );
  const customPromptCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const projectedJointsRef = useRef<Record<JointKey, { x: number; y: number }> | null>(null);
  const replaceImageInputRef = useRef<HTMLInputElement | null>(null);
  const aiImagePoseInputRef = useRef<HTMLInputElement | null>(null);

  const dragStateRef = useRef<{
    mode: 'orbit' | 'joint';
    joint?: JointKey;
    startX: number;
    startY: number;
    startOrbit: CameraOrbitOverride;
    startPose: PosturePose3D;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    ensureAvatarGlbLoaded().then(() => {
      if (mounted) setAvatarReady(true);
    });
    const unsubGlb = subscribeAvatarGlbLoaded(() => {
      if (mounted) setAvatarReady(true);
    });
    const unsubPhoto = subscribeFigurePhotoOverrides(() => {
      if (mounted) setOverrideTick((t) => t + 1);
    });
    const unsubPose = subscribeFigurePoseOverrides(() => {
      if (mounted) setOverrideTick((t) => t + 1);
    });
    return () => {
      mounted = false;
      unsubGlb();
      unsubPhoto();
      unsubPose();
    };
  }, []);

  // Sincronizar paneles editables al cambiar de figura
  useEffect(() => {
    const cloned = clonePanelsDeepLocal(selectedCatalogSpec.panels);
    setDraftPanels(cloned);
    setActiveBodyIdx(0);
    setOrbitOverride(DEFAULT_ORBIT_OVERRIDE);
    if (!cloned || cloned.length === 0) {
      setViewportMode('lamina_completa');
    } else if (cloned.length >= 2) {
      setViewportMode('lamina_completa');
    } else {
      setViewportMode('avatar_libre_cuerpo');
    }
  }, [selectedCatalogSpec.id]);

  const chaptersList = useMemo(() => {
    const map = new Map<number, string>();
    for (const f of BOOK_FIGURE_CATALOG) {
      if (!map.has(f.chapter)) map.set(f.chapter, f.chapterTitle);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, []);

  const filteredFigures = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return BOOK_FIGURE_CATALOG.filter((f) => {
      if (chapterFilter !== 'all' && f.chapter !== chapterFilter) return false;
      if (!q) return true;
      return (
        f.id.toLowerCase().includes(q) ||
        f.figureNumber.toLowerCase().includes(q) ||
        f.title.toLowerCase().includes(q) ||
        f.bookDescription.toLowerCase().includes(q)
      );
    });
  }, [searchQuery, chapterFilter, overrideTick]);

  const safeBodyIdx = Math.max(0, Math.min(Math.max(0, draftPanels.length - 1), activeBodyIdx));
  const activePanel: Panel3DSpec | undefined = draftPanels[safeBodyIdx];
  const effectivePhotoUrl = useMemo(
    () => getEffectiveFigurePhotoUrl(selectedCatalogSpec),
    [selectedCatalogSpec, overrideTick],
  );
  const hasPhotoOverride = hasCustomFigurePhotoOverride(selectedCatalogSpec.id);
  const hasPoseOverride = hasCustomFigurePoseOverride(selectedCatalogSpec.id);

  // Actualizar un campo de postura en el Cuerpo activo (A, B, C o D)
  const updateActiveBodyPose = useCallback(
    (updater: (prev: PosturePose3D) => PosturePose3D) => {
      setDraftPanels((prev) =>
        prev.map((p, idx) => (idx === safeBodyIdx ? { ...p, pose: updater(p.pose) } : p)),
      );
    },
    [safeBodyIdx],
  );

  const updateActiveBodyPanel = useCallback(
    (updater: (prev: Panel3DSpec) => Panel3DSpec) => {
      setDraftPanels((prev) => prev.map((p, idx) => (idx === safeBodyIdx ? updater(p) : p)));
    },
    [safeBodyIdx],
  );

  // Renderizado en tiempo real sobre el canvas principal (Lámina Multi-Cuerpo o Avatar 3D Libre con Nodos)
  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas || viewportMode === 'goniometro_foto') return;

    if (viewportMode === 'avatar_libre_cuerpo' && activePanel) {
      const panelOrbit: CameraOrbitOverride = {
        azimuthDeg: (activePanel.orbitOverride?.azimuthDeg ?? 0) + orbitOverride.azimuthDeg,
        elevationDeg: (activePanel.orbitOverride?.elevationDeg ?? 0) + orbitOverride.elevationDeg,
        zoom: (activePanel.orbitOverride?.zoom ?? 1) * orbitOverride.zoom,
      };
      // En modo Avatar Libre forzamos cuerpo completo si el usuario quiere ver apoyos/piernas salvo primer plano explícito
      const effectiveFreePanel: Panel3DSpec = {
        ...activePanel,
        focusZone: activePanel.focusZone,
      };
      projectedJointsRef.current = renderInteractiveFreeAvatarToCanvas(
        effectiveFreePanel,
        canvas,
        640,
        520,
        panelOrbit,
        2,
        {
          showGizmos: show3DGizmos,
          selectedJoint: selectedJoint3D,
          hoveredJoint: hoveredJoint3D,
        },
      );
      return;
    }

    // Modo Lámina Completa (muestra Cuerpo A, Cuerpo B, Cuerpo C, Cuerpo D juntos o Diagrama)
    projectedJointsRef.current = null;
    const isMulti = draftPanels.length >= 2;
    const previewSpec: BookFigureFileSpec = {
      ...selectedCatalogSpec,
      bodiesRule:
        draftPanels.length === 0
          ? selectedCatalogSpec.bodiesRule
          : isMulti
            ? '2'
            : '1',
      renderMode:
        draftPanels.length === 0
          ? selectedCatalogSpec.renderMode
          : isMulti
            ? '3d_dual'
            : '3d_single',
      widthPx: isMulti ? Math.max(800, draftPanels.length * 400) : selectedCatalogSpec.widthPx,
      heightPx: selectedCatalogSpec.heightPx,
      panels: draftPanels.length > 0 ? draftPanels : selectedCatalogSpec.panels,
    };

    renderBookFigureToCanvas(previewSpec, canvas, orbitOverride, 2, {
      preferSynthetic3D: draftPanels.length > 0 ? true : preferSynthetic3D,
      activePanelHighlightIdx: isMulti ? safeBodyIdx : undefined,
      onAsyncPhotoLoaded: () => setOverrideTick((t) => t + 1),
    });
  }, [
    selectedCatalogSpec,
    draftPanels,
    safeBodyIdx,
    activePanel,
    viewportMode,
    preferSynthetic3D,
    orbitOverride,
    avatarReady,
    show3DGizmos,
    selectedJoint3D,
    hoveredJoint3D,
    overrideTick,
  ]);

  // Renderizado del generador por instrucción escrita
  useEffect(() => {
    if (subTab !== 'generador_prompt' || !customPromptCanvasRef.current) return;
    const parsed = parseBiomechanicalPromptToPanel(customPromptText);
    renderInteractiveFreeAvatarToCanvas(
      parsed.panel,
      customPromptCanvasRef.current,
      540,
      480,
      DEFAULT_ORBIT_OVERRIDE,
      2,
      { showGizmos: false },
    );
  }, [subTab, customPromptText, avatarReady]);

  // Detección de clic / arrastre libre sobre nodos articulares 3D o selección de Cuerpo A..D en lámina
  const findHitJointOnCanvas = useCallback(
    (clientX: number, clientY: number): JointKey | null => {
      const canvas = mainCanvasRef.current;
      const pts = projectedJointsRef.current;
      if (!canvas || !pts || viewportMode !== 'avatar_libre_cuerpo' || !show3DGizmos) {
        return null;
      }
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const lx = ((clientX - rect.left) / rect.width) * 640;
      const ly = ((clientY - rect.top) / rect.height) * 520;

      const joints: JointKey[] = [
        'head',
        'c7',
        'l5s1',
        'pelvis',
        'shoulderR',
        'elbowR',
        'wristR',
        'shoulderL',
        'elbowL',
        'wristL',
        'hipR',
        'kneeR',
        'ankleR',
        'hipL',
        'kneeL',
        'ankleL',
      ];
      let best: JointKey | null = null;
      let bestDist = 22;
      for (const jk of joints) {
        const pt = pts[jk];
        if (!pt) continue;
        const d = Math.hypot(lx - pt.x, ly - pt.y);
        if (d < bestDist) {
          bestDist = d;
          best = jk;
        }
      }
      return best;
    },
    [viewportMode, show3DGizmos],
  );

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;

    // Si estamos en Lámina Completa con múltiples cuerpos, un clic sobre una columna selecciona ese Cuerpo (A, B, C o D)
    if (viewportMode === 'lamina_completa' && draftPanels.length >= 2) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0) {
        const relX = (e.clientX - rect.left) / rect.width;
        const colIdx = Math.min(
          draftPanels.length - 1,
          Math.max(0, Math.floor(relX * draftPanels.length)),
        );
        setActiveBodyIdx(colIdx);
      }
    }

    const hitJoint = findHitJointOnCanvas(e.clientX, e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);

    if (hitJoint && activePanel) {
      setSelectedJoint3D(hitJoint);
      dragStateRef.current = {
        mode: 'joint',
        joint: hitJoint,
        startX: e.clientX,
        startY: e.clientY,
        startOrbit: { ...orbitOverride },
        startPose: { ...activePanel.pose },
      };
      return;
    }

    dragStateRef.current = {
      mode: 'orbit',
      startX: e.clientX,
      startY: e.clientY,
      startOrbit: { ...orbitOverride },
      startPose: activePanel ? { ...activePanel.pose } : makeNeutralPose(),
    };
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = dragStateRef.current;
    if (!st) {
      setHoveredJoint3D(findHitJointOnCanvas(e.clientX, e.clientY));
      return;
    }

    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;

    if (st.mode === 'orbit') {
      setOrbitOverride({
        azimuthDeg: Math.max(-180, Math.min(180, Math.round(st.startOrbit.azimuthDeg + dx * 0.55))),
        elevationDeg: Math.max(-55, Math.min(60, Math.round(st.startOrbit.elevationDeg - dy * 0.45))),
        zoom: st.startOrbit.zoom,
      });
      return;
    }

    if (st.mode === 'joint' && st.joint) {
      const clamp = (v: number, min: number, max: number) =>
        Math.round(Math.max(min, Math.min(max, v)));

      updateActiveBodyPose((prev) => {
        const next = { ...prev };
        switch (st.joint) {
          case 'pelvis':
            next.rootOffsetX = Math.round(Math.max(-1, Math.min(1, (st.startPose.rootOffsetX ?? 0) + dx * 0.003)) * 100) / 100;
            next.rootOffsetZ = Math.round(Math.max(-1, Math.min(1, (st.startPose.rootOffsetZ ?? 0) + dy * 0.003)) * 100) / 100;
            break;
          case 'l5s1':
            next.trunkFlexionDeg = clamp(st.startPose.trunkFlexionDeg + dy * 0.45, -30, 110);
            next.trunkLateralDeg = clamp(st.startPose.trunkLateralDeg + dx * 0.3, -35, 35);
            break;
          case 'c7':
          case 'head':
            next.neckFlexionDeg = clamp(st.startPose.neckFlexionDeg + dy * 0.4, -40, 55);
            next.neckTwistDeg = clamp(st.startPose.neckTwistDeg + dx * 0.4, -60, 60);
            break;
          case 'shoulderR':
            next.shoulderRFlexionDeg = clamp(st.startPose.shoulderRFlexionDeg - dy * 0.55, -49, 175);
            next.shoulderRAbductionDeg = clamp(st.startPose.shoulderRAbductionDeg + dx * 0.45, 0, 135);
            if (mirrorArmsLegs) {
              next.shoulderLFlexionDeg = next.shoulderRFlexionDeg;
              next.shoulderLAbductionDeg = next.shoulderRAbductionDeg;
            }
            break;
          case 'elbowR':
            next.elbowRFlexionDeg = clamp(st.startPose.elbowRFlexionDeg - dy * 0.6, 0, 155);
            if (mirrorArmsLegs) next.elbowLFlexionDeg = next.elbowRFlexionDeg;
            break;
          case 'wristR':
            next.wristRFlexionDeg = clamp(st.startPose.wristRFlexionDeg + dy * 0.5, -60, 60);
            next.forearmRPronationDeg = clamp(st.startPose.forearmRPronationDeg + dx * 0.5, -85, 85);
            break;
          case 'shoulderL':
            next.shoulderLFlexionDeg = clamp(st.startPose.shoulderLFlexionDeg - dy * 0.55, -49, 175);
            next.shoulderLAbductionDeg = clamp(st.startPose.shoulderLAbductionDeg - dx * 0.45, 0, 135);
            break;
          case 'elbowL':
            next.elbowLFlexionDeg = clamp(st.startPose.elbowLFlexionDeg - dy * 0.6, 0, 155);
            break;
          case 'wristL':
            next.wristLFlexionDeg = clamp((st.startPose.wristLFlexionDeg ?? 0) + dy * 0.5, -60, 60);
            next.forearmLPronationDeg = clamp((st.startPose.forearmLPronationDeg ?? 0) + dx * 0.5, -85, 85);
            break;
          case 'hipR':
            next.hipRFlexionDeg = clamp(st.startPose.hipRFlexionDeg + dy * 0.5, -30, 125);
            if (mirrorArmsLegs) next.hipLFlexionDeg = next.hipRFlexionDeg;
            break;
          case 'kneeR':
            next.kneeRFlexionDeg = clamp(st.startPose.kneeRFlexionDeg + dy * 0.55, 0, 145);
            if (mirrorArmsLegs) next.kneeLFlexionDeg = next.kneeRFlexionDeg;
            break;
          case 'ankleR':
            next.ankleRDorsiflexionDeg = clamp(st.startPose.ankleRDorsiflexionDeg - dy * 0.4, -45, 40);
            break;
          case 'hipL':
            next.hipLFlexionDeg = clamp(st.startPose.hipLFlexionDeg + dy * 0.5, -30, 125);
            break;
          case 'kneeL':
            next.kneeLFlexionDeg = clamp(st.startPose.kneeLFlexionDeg + dy * 0.55, 0, 145);
            break;
          case 'ankleL':
            next.ankleLDorsiflexionDeg = clamp(st.startPose.ankleLDorsiflexionDeg - dy * 0.4, -45, 40);
            break;
        }
        return next;
      });
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragStateRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  // Añadir / Quitar Cuerpos (Cuerpo B, Cuerpo C, Cuerpo D)
  const handleAddAnotherBody = () => {
    if (draftPanels.length >= 4) return;
    const base = activePanel
      ? (JSON.parse(JSON.stringify(activePanel)) as Panel3DSpec)
      : {
          subTitle: 'Cuerpo A',
          focusZone: 'full_body' as FocusZone,
          cameraPreset: 'sagittal_right' as CameraPreset,
          pose: makeNeutralPose(),
        };
    const nextIdx = draftPanels.length;
    base.subTitle = `Cuerpo ${BODY_LETTERS[nextIdx] || nextIdx + 1}`;
    setDraftPanels((prev) => [...prev, base]);
    setActiveBodyIdx(nextIdx);
    setBannerMsg({
      tone: 'info',
      text: `Se agregó Cuerpo ${BODY_LETTERS[nextIdx]} a ${selectedCatalogSpec.id}. Puede editarlo libremente y guardarlo en el catálogo.`,
    });
  };

  const handleRemoveActiveBody = () => {
    if (draftPanels.length <= 1) return;
    const next = draftPanels.filter((_, i) => i !== safeBodyIdx);
    setDraftPanels(next);
    setActiveBodyIdx(Math.max(0, safeBodyIdx - 1));
  };

  // Copiar postura exacta desde imagen de referencia con IA (multi-cuerpo A..D)
  const runExtractPoseFromImageSource = async (imageSource: string) => {
    setIsExtractingAiPose(true);
    setBannerMsg({
      tone: 'info',
      text: 'Analizando la imagen de referencia para copiar la postura exacta de cada cuerpo (A..D)...',
    });
    try {
      const res = await extractFigurePoseFromImage({
        imageDataUrl: imageSource,
        figId: selectedCatalogSpec.id,
        title: selectedCatalogSpec.title,
        bookDescription: selectedCatalogSpec.bookDescription,
        expectedBodiesCount: draftPanels.length >= 2 ? draftPanels.length : undefined,
      });

      if (!res.ok || !res.panels) {
        setBannerMsg({
          tone: 'error',
          text: res.error || 'No se pudo extraer la postura desde la imagen.',
        });
        return;
      }

      setDraftPanels(clonePanelsDeepLocal(res.panels));
      setActiveBodyIdx(0);
      setPreferSynthetic3D(true);
      setViewportMode(res.panels.length >= 2 ? 'lamina_completa' : 'avatar_libre_cuerpo');
      setBannerMsg({
        tone: 'success',
        text: `Postura copiada desde la imagen (${res.panels.length} cuerpo(s) detectados). Verifique con el ratón/goniómetro y pulse "Guardar como Referencia".`,
      });
    } finally {
      setIsExtractingAiPose(false);
    }
  };

  // Guardar como postura de referencia definitiva en figurePlanCatalog.ts + pose-overrides.json
  const handleSaveReferencePose = async () => {
    if (draftPanels.length === 0) return;
    setIsSavingPose(true);
    try {
      const panelsWithOrbit = draftPanels.map((p, idx) => {
        if (idx !== safeBodyIdx) return p;
        const az = (p.orbitOverride?.azimuthDeg ?? 0) + orbitOverride.azimuthDeg;
        const el = (p.orbitOverride?.elevationDeg ?? 0) + orbitOverride.elevationDeg;
        const zm = (p.orbitOverride?.zoom ?? 1) * orbitOverride.zoom;
        return {
          ...p,
          orbitOverride: { azimuthDeg: az, elevationDeg: el, zoom: Number(zm.toFixed(2)) },
        };
      });

      const isMulti = panelsWithOrbit.length >= 2;
      const result = await saveDefinitiveFigurePoseToCatalog(
        selectedCatalogSpec.id,
        panelsWithOrbit,
        {
          widthPx: isMulti ? Math.max(800, panelsWithOrbit.length * 400) : 480,
          heightPx: isMulti ? 520 : 640,
        },
      );

      setOrbitOverride(DEFAULT_ORBIT_OVERRIDE);
      setDraftPanels(clonePanelsDeepLocal(panelsWithOrbit));

      if (result.ok) {
        setBannerMsg({
          tone: 'success',
          text: result.catalogFileUpdated
            ? `Postura de referencia guardada definitivamente en figurePlanCatalog.ts (${panelsWithOrbit.length} cuerpo(s): ${panelsWithOrbit.map((_, i) => `Cuerpo ${BODY_LETTERS[i]}`).join(', ')}).`
            : `Postura de referencia almacenada en sesión activa para ${selectedCatalogSpec.id}.`,
        });
      } else {
        setBannerMsg({
          tone: 'warning',
          text: result.error || 'Guardado local aplicado.',
        });
      }
    } finally {
      setIsSavingPose(false);
    }
  };

  // Reemplazar imagen definitiva de la figura
  const handleUploadDefinitivePhoto = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) return;
      const res = await saveDefinitiveFigureImageToApp(selectedCatalogSpec.id, dataUrl);
      setPreferSynthetic3D(false);
      setViewportMode('lamina_completa');
      setBannerMsg({
        tone: res.ok ? 'success' : 'warning',
        text: res.ok
          ? `Imagen definitiva almacenada y publicada para ${selectedCatalogSpec.fileName}.`
          : res.error || 'Imagen guardada localmente.',
      });
    };
    reader.readAsDataURL(file);
  };

  // Exportar PNG individual de la vista actual
  const handleDownloadCurrentPng = async () => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const png = await exportCanvasToHighQualityPng(canvas);
    const a = document.createElement('a');
    a.href = png.dataUrl;
    a.download = selectedCatalogSpec.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Exportación masiva ZIP de todas las figuras
  const handleDownloadAllZip = async () => {
    setIsExportingZip(true);
    setZipProgressPct(0);
    try {
      const zip = new JSZip();
      for (let i = 0; i < BOOK_FIGURE_CATALOG.length; i++) {
        const fig = BOOK_FIGURE_CATALOG[i];
        const rendered = await renderBookFigureToPng(fig, DEFAULT_ORBIT_OVERRIDE, 'hd_lossless');
        const b64 = rendered.dataUrl.split(',')[1] || '';
        zip.file(fig.fileName, b64, { base64: true });
        setZipProgressPct(Math.round(((i + 1) / BOOK_FIGURE_CATALOG.length) * 100));
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'catalogo_figuras_ergoeval_3d.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setBannerMsg({
        tone: 'success',
        text: `Archivo ZIP generado con las ${BOOK_FIGURE_CATALOG.length} láminas del catálogo.`,
      });
    } finally {
      setIsExportingZip(false);
    }
  };

  const visibleSliders = useMemo(
    () =>
      angleCategory === 'espacio_objeto'
        ? []
        : JOINT_SLIDER_FIELDS.filter((f) => f.category === angleCategory),
    [angleCategory],
  );

  return (
    <div className="space-y-4">
      {/* Cabecera Principal */}
      <div className="bg-slate-900 text-white rounded-md border border-slate-800 px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-cyan-300 uppercase tracking-wider">
            <Box className="w-3.5 h-3.5 shrink-0" />
            <span>Estudio Motor 3D de Figuras · Avatar Libre, Multi-Cuerpo (A–D), Objetos Regulables y Multi-Goniómetro</span>
          </div>
          <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">
            Calibración de Posturas de Referencia (`figurePlanCatalog.ts`), Mobiliario 3D e Imágenes Definitivas
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded border border-slate-700 bg-slate-800 p-0.5">
            <button
              type="button"
              onClick={() => setSubTab('catalogo_3d')}
              className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer ${
                subTab === 'catalogo_3d' ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              Catálogo 3D ({BOOK_FIGURE_CATALOG.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('generador_prompt')}
              className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer ${
                subTab === 'generador_prompt' ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              Generador por Texto
            </button>
            <button
              type="button"
              onClick={() => setSubTab('documentacion_pdf')}
              className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer ${
                subTab === 'documentacion_pdf' ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              Bases PDF
            </button>
          </div>

          <button
            type="button"
            disabled={isExportingZip}
            onClick={() => void handleDownloadAllZip()}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-semibold text-slate-100 cursor-pointer tabular-nums"
          >
            <FolderArchive className="w-3.5 h-3.5 text-cyan-400" />
            {isExportingZip ? `Exportando ZIP (${zipProgressPct}%)` : 'Descargar Todo (.ZIP)'}
          </button>

          <button
            type="button"
            onClick={onBackToEvaluator}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-600 bg-white text-slate-900 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver al Evaluador
          </button>
        </div>
      </div>

      {/* Notificación de estado */}
      {bannerMsg && (
        <div
          className={`px-4 py-2.5 rounded-md border text-xs font-medium flex items-center justify-between gap-3 ${
            bannerMsg.tone === 'error'
              ? 'bg-rose-50 border-rose-300 text-rose-950'
              : bannerMsg.tone === 'warning'
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : bannerMsg.tone === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-sky-50 border-sky-200 text-sky-950'
          }`}
        >
          <span>{bannerMsg.text}</span>
          <button
            type="button"
            onClick={() => setBannerMsg(null)}
            className="p-1 opacity-75 hover:opacity-100 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {subTab === 'documentacion_pdf' ? (
        <div className="bg-white border border-slate-300 rounded-md p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Documentación Técnica de Modelización Biomecánica 3D
              </h2>
              <p className="text-xs text-slate-600">
                Manual completo de 16 segmentos, 14 articulaciones, ángulos diedros, momentos estáticos y compresión L4/L5.
              </p>
            </div>
            <a
              href={REFERENCE_PDF_DOCS[0].url}
              download="Ergoniza_Intelligent_Bases_de_funcionamiento.pdf"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5" />
              Descargar PDF
            </a>
          </div>
          <iframe
            src={REFERENCE_PDF_DOCS[0].url}
            title={REFERENCE_PDF_DOCS[0].title}
            className="w-full h-[74vh] rounded border border-slate-300 bg-slate-100"
          />
        </div>
      ) : subTab === 'generador_prompt' ? (
        <div className="bg-white border border-slate-300 rounded-md p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-900">
              Generador Rápido de Postura 3D por Descripción Técnica
            </h2>
            <textarea
              value={customPromptText}
              onChange={(e) => setCustomPromptText(e.target.value)}
              rows={5}
              className="w-full rounded border border-slate-300 p-3 text-xs text-slate-900"
              placeholder="Ej: Flexión de tronco 40°, hombro derecho 55°, codo 85°, carga 15 kg..."
            />
            <p className="text-xs text-slate-600">
              Escriba ángulos articulares en grados (°) y fuerzas/cargas en kg o N para previsualizar el avatar 3D al instante.
            </p>
          </div>
          <div className="lg:col-span-7 flex items-center justify-center border border-slate-200 rounded bg-slate-50 p-3">
            <canvas ref={customPromptCanvasRef} className="max-w-full h-auto rounded border border-slate-200 bg-white" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* COLUMNA 1 (3 cols): Buscador e Índice de Figuras del Libro */}
          <aside className="lg:col-span-3 bg-white border border-slate-300 rounded-md p-3 flex flex-col max-h-[840px]">
            <div className="space-y-2 pb-2.5 border-b border-slate-200">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar ej. 4.6b, 4.27b, 11.2..."
                  className="w-full min-h-[36px] pl-8 pr-2.5 py-1.5 rounded border border-slate-300 text-xs text-slate-900"
                />
              </div>

              <select
                value={chapterFilter}
                onChange={(e) =>
                  setChapterFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="w-full min-h-[36px] rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-900"
              >
                <option value="all">Todos los capítulos ({BOOK_FIGURE_CATALOG.length})</option>
                {chaptersList.map(([ch, title]) => (
                  <option key={ch} value={ch}>
                    {title}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 mt-2 pr-1">
              {filteredFigures.map((fig) => {
                const isSelected = fig.id === selectedCatalogSpec.id;
                const bodiesLen = fig.panels?.length || 0;
                const customPose = hasCustomFigurePoseOverride(fig.id);
                const customImg = hasCustomFigurePhotoOverride(fig.id);
                return (
                  <button
                    key={fig.id}
                    type="button"
                    onClick={() => setSelectedFigId(fig.id)}
                    className={`w-full text-left px-2.5 py-2 rounded transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-sky-50 border border-sky-600'
                        : 'border border-transparent hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-xs font-bold text-slate-900 tabular-nums">
                        Fig. {fig.figureNumber}
                        {fig.subPart || ''}
                      </span>
                      <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                        {bodiesLen > 0 ? `${bodiesLen} cuerpo${bodiesLen > 1 ? 's' : ''}` : 'Diagrama'}
                        {customPose ? ' · Pose✓' : ''}
                        {customImg ? ' · Img✓' : ''}
                      </span>
                    </div>
                    <p className="text-[11.5px] text-slate-700 line-clamp-2 mt-0.5">{fig.title}</p>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* COLUMNA 2 (5 cols): Visor 3D Libre / Lámina Multi-Cuerpo / Multi-Goniómetro + Acciones de Catálogo */}
          <section className="lg:col-span-5 bg-white border border-slate-300 rounded-md p-3.5 space-y-3 flex flex-col">
            <div className="border-b border-slate-200 pb-2.5 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="font-mono text-[11px] font-bold text-sky-800">
                    {selectedCatalogSpec.id} · {selectedCatalogSpec.chapterTitle}
                  </span>
                  <h2 className="text-sm font-bold text-slate-900">{selectedCatalogSpec.title}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDownloadCurrentPng()}
                  className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 cursor-pointer shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  PNG
                </button>
              </div>

              {/* Selector de modo de visualización: Avatar Libre (como Avatar Libre 3D), Lámina Completa (Cuerpos A..D) o Goniómetros sobre Imagen */}
              <div className="flex flex-wrap items-center gap-1.5">
                {draftPanels.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setViewportMode('avatar_libre_cuerpo');
                      setPreferSynthetic3D(true);
                    }}
                    className={`min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded border text-xs font-semibold cursor-pointer ${
                      viewportMode === 'avatar_libre_cuerpo'
                        ? 'bg-violet-700 text-white border-violet-800'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <Move3d className="w-3.5 h-3.5" />
                    Avatar Libre ({`Cuerpo ${BODY_LETTERS[safeBodyIdx] || 'A'}`})
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setViewportMode('lamina_completa')}
                  className={`min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded border text-xs font-semibold cursor-pointer ${
                    viewportMode === 'lamina_completa'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  Lámina Completa ({draftPanels.length || 1})
                </button>

                {effectivePhotoUrl && (
                  <button
                    type="button"
                    onClick={() => setViewportMode('goniometro_foto')}
                    className={`min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded border text-xs font-semibold cursor-pointer ${
                      viewportMode === 'goniometro_foto'
                        ? 'bg-sky-700 text-white border-sky-800'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    Goniómetros en Foto
                  </button>
                )}

                {viewportMode !== 'goniometro_foto' && (
                  <button
                    type="button"
                    onClick={() => setShow3DGoniometerOverlay((v) => !v)}
                    className={`min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded border text-xs font-semibold cursor-pointer ${
                      show3DGoniometerOverlay
                        ? 'bg-emerald-700 text-white border-emerald-800'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                    title="Superponer goniómetros libres/fijos sobre el Avatar 3D y agregar más goniómetros"
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    Goniómetro 3D
                  </button>
                )}
              </div>

              {/* Pestañas de Cuerpos A, B, C, D cuando la figura es 3D */}
              {draftPanels.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1">
                  <div className="flex flex-wrap items-center gap-1">
                    {draftPanels.map((p, idx) => {
                      const isAct = idx === safeBodyIdx;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setActiveBodyIdx(idx)}
                          className={`min-h-[32px] px-2.5 py-1 rounded border text-xs font-semibold cursor-pointer ${
                            isAct
                              ? 'bg-sky-700 text-white border-sky-800'
                              : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          Cuerpo {BODY_LETTERS[idx] || idx + 1}
                        </button>
                      );
                    })}

                    {draftPanels.length < 4 && (
                      <button
                        type="button"
                        onClick={handleAddAnotherBody}
                        className="min-h-[32px] inline-flex items-center gap-1 px-2 py-1 rounded border border-dashed border-sky-700 text-sky-800 bg-sky-50/70 hover:bg-sky-100 text-[11px] font-semibold cursor-pointer"
                        title="Agregar Cuerpo B / C / D a esta figura"
                      >
                        <Plus className="w-3 h-3" />
                        Cuerpo {BODY_LETTERS[draftPanels.length]}
                      </button>
                    )}

                    {draftPanels.length > 1 && (
                      <button
                        type="button"
                        onClick={handleRemoveActiveBody}
                        className="p-1.5 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 cursor-pointer"
                        title="Quitar cuerpo seleccionado"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {effectivePhotoUrl && (
                    <button
                      type="button"
                      onClick={() => setShowAssignedPhotoBelow((v) => !v)}
                      className="px-2 py-1 rounded border border-sky-300 bg-sky-50 hover:bg-sky-100 text-[11px] font-semibold text-sky-900 cursor-pointer"
                    >
                      {showAssignedPhotoBelow ? 'Ocultar Foto Asignada Debajo' : 'Ver Foto Asignada Debajo'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ARRIBA: Avatar 3D (Todas las posturas A..D en Lámina Completa o Cuerpo Libre) | DEBAJO: Foto Asignada */}
            {viewportMode === 'goniometro_foto' && effectivePhotoUrl ? (
              <InteractivePhotoGoniometer
                imageUrl={effectivePhotoUrl}
                figureCode={`Fig. ${selectedCatalogSpec.figureNumber}${selectedCatalogSpec.subPart || ''}`}
                figureLabel={selectedCatalogSpec.title}
                applyButtonLabel={`Aplicar ángulo a Cuerpo ${BODY_LETTERS[safeBodyIdx]}`}
                onApplyAngle={(deg) => {
                  updateActiveBodyPose((prev) => ({
                    ...prev,
                    [transferTargetField]: deg,
                  }));
                  setBannerMsg({
                    tone: 'success',
                    text: `Ángulo ${deg}° transferido a "${String(transferTargetField)}" en Cuerpo ${BODY_LETTERS[safeBodyIdx]}.`,
                  });
                }}
              />
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-600 px-0.5">
                    <span className="font-semibold text-slate-900">
                      ARRIBA · Avatar Motor 3D ({draftPanels.length > 0 ? `${draftPanels.length} postura(s)` : 'Diagrama'})
                    </span>
                    <span className="font-mono text-slate-500">
                      {viewportMode === 'lamina_completa'
                        ? `Mostrando Cuerpos ${draftPanels.map((_, i) => BODY_LETTERS[i]).join(', ')}`
                        : `Editando Cuerpo ${BODY_LETTERS[safeBodyIdx] || 'A'}`}
                    </span>
                  </div>
                  <div className="relative min-h-[340px] rounded border border-slate-300 bg-slate-50 overflow-hidden flex items-center justify-center">
                    <canvas
                      ref={mainCanvasRef}
                      onPointerDown={handleCanvasPointerDown}
                      onPointerMove={handleCanvasPointerMove}
                      onPointerUp={handleCanvasPointerUp}
                      onPointerCancel={handleCanvasPointerUp}
                      className="max-w-full max-h-[430px] w-auto h-auto object-contain touch-none cursor-grab active:cursor-grabbing"
                    />

                    {show3DGoniometerOverlay && (
                      <InteractivePhotoGoniometer
                        transparentOverlay
                        onApplyAngle={(deg, gLabel) => {
                          updateActiveBodyPose((prev) => ({
                            ...prev,
                            [transferTargetField]: deg,
                          }));
                          setBannerMsg({
                            tone: 'success',
                            text: `${gLabel || 'Goniómetro'} (${deg}°) aplicado a "${String(transferTargetField)}" en Cuerpo ${BODY_LETTERS[safeBodyIdx]}.`,
                          });
                        }}
                      />
                    )}
                  </div>
                </div>

                {showAssignedPhotoBelow && effectivePhotoUrl && (
                  <div className="rounded border border-slate-300 bg-white p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-slate-900">
                        DEBAJO · Foto Asignada de Referencia (Todas las posturas de Fig. {selectedCatalogSpec.figureNumber}
                        {selectedCatalogSpec.subPart || ''})
                      </span>
                      <button
                        type="button"
                        onClick={() => setViewportMode('goniometro_foto')}
                        className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 font-semibold cursor-pointer"
                      >
                        <Crosshair className="w-3 h-3" />
                        Medir con goniómetro en foto
                      </button>
                    </div>
                    <div className="rounded border border-slate-200 bg-slate-50/50 p-2 flex items-center justify-center">
                      <img
                        src={effectivePhotoUrl}
                        alt={`Foto asignada ${selectedCatalogSpec.id}`}
                        referrerPolicy="no-referrer"
                        className="max-h-[260px] w-auto object-contain"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Barra de Acciones: Copiar Postura IA, Guardar Postura de Referencia y Reemplazar Imagen Definitiva */}
            <div className="border-t border-slate-200 pt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {draftPanels.length > 0 && (
                  <button
                    type="button"
                    disabled={isSavingPose}
                    onClick={() => void handleSaveReferencePose()}
                    className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {isSavingPose ? 'Guardando...' : 'Guardar Postura de Referencia'}
                  </button>
                )}

                {effectivePhotoUrl && draftPanels.length > 0 && (
                  <button
                    type="button"
                    disabled={isExtractingAiPose}
                    onClick={() => void runExtractPoseFromImageSource(effectivePhotoUrl)}
                    className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                  >
                    {isExtractingAiPose ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    Copiar Postura de su Imagen
                  </button>
                )}

                <input
                  ref={aiImagePoseInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (reader.result) void runExtractPoseFromImageSource(String(reader.result));
                      };
                      reader.readAsDataURL(f);
                    }
                    e.currentTarget.value = '';
                  }}
                />
                {draftPanels.length > 0 && (
                  <button
                    type="button"
                    disabled={isExtractingAiPose}
                    onClick={() => aiImagePoseInputRef.current?.click()}
                    className="min-h-[38px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-950 text-xs font-semibold cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Copiar desde otra foto...
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={replaceImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUploadDefinitivePhoto(f);
                    e.currentTarget.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => replaceImageInputRef.current?.click()}
                  className="min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 cursor-pointer"
                >
                  <ImagePlus className="w-3.5 h-3.5 text-sky-700" />
                  Reemplazar Imagen Definitiva
                </button>

                {hasPhotoOverride && (
                  <button
                    type="button"
                    onClick={() => {
                      clearCustomFigurePhotoOverride(selectedCatalogSpec.id);
                      setBannerMsg({
                        tone: 'info',
                        text: 'Se restauró la imagen original de la figura.',
                      });
                    }}
                    className="min-h-[36px] px-2.5 py-1 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-800 cursor-pointer"
                  >
                    Restaurar Imagen Original
                  </button>
                )}

                {hasPoseOverride && (
                  <button
                    type="button"
                    onClick={async () => {
                      await clearCustomFigurePoseOverride(selectedCatalogSpec.id);
                      const fresh = BOOK_FIGURE_CATALOG.find((f) => f.id === selectedCatalogSpec.id);
                      if (fresh) setDraftPanels(clonePanelsDeepLocal(fresh.panels));
                      setBannerMsg({
                        tone: 'info',
                        text: 'Postura original del catálogo restaurada.',
                      });
                    }}
                    className="min-h-[36px] px-2.5 py-1 rounded border border-amber-300 bg-amber-50 hover:bg-amber-100 text-xs font-semibold text-amber-950 cursor-pointer"
                  >
                    Restaurar Postura Fábrica
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* COLUMNA 3 (4 cols): Control Libre de Ángulos, Objetos/Mobiliario Regulable (Mesa, Pisón, etc.) y Destino de Goniómetro */}
          <section className="lg:col-span-4 bg-white border border-slate-300 rounded-md p-3.5 space-y-3 flex flex-col max-h-[840px] overflow-y-auto">
            {activePanel ? (
              <>
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <div>
                    <span className="font-mono text-[11px] font-bold uppercase text-violet-800">
                      Controles Libres · Cuerpo {BODY_LETTERS[safeBodyIdx] || 'A'}
                    </span>
                    <h3 className="text-xs font-bold text-slate-900">
                      Ángulos Exactos, Cámara y Regulación de Objetos 3D
                    </h3>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShow3DGizmos((g) => !g)}
                      className={`px-2 py-1 rounded border text-[11px] font-semibold cursor-pointer ${
                        show3DGizmos
                          ? 'bg-violet-100 border-violet-400 text-violet-950'
                          : 'bg-slate-50 border-slate-300 text-slate-700'
                      }`}
                    >
                      {show3DGizmos ? 'Nodos ON' : 'Nodos OFF'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOrbitOverride(DEFAULT_ORBIT_OVERRIDE);
                        updateActiveBodyPanel((p) => ({ ...p, orbitOverride: undefined }));
                      }}
                      className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
                      title="Reiniciar cámara de este cuerpo"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Cámara, Zona de Encuadre, Apoyo y Destino del Goniómetro */}
                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 border border-slate-200 rounded p-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Plano de Cámara
                    </label>
                    <select
                      value={activePanel.cameraPreset}
                      onChange={(e) =>
                        updateActiveBodyPanel((p) => ({
                          ...p,
                          cameraPreset: e.target.value as CameraPreset,
                        }))
                      }
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                    >
                      <option value="sagittal_right">Perfil Derecho (Sagital)</option>
                      <option value="sagittal_left">Perfil Izquierdo</option>
                      <option value="frontal">Frontal</option>
                      <option value="dorsal">Posterior (Dorsal)</option>
                      <option value="isometric">Isométrica 3/4</option>
                      <option value="perspective_oblique">Oblicua</option>
                      <option value="top">Superior (Cenital)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Encuadre Anatómico
                    </label>
                    <select
                      value={activePanel.focusZone}
                      onChange={(e) =>
                        updateActiveBodyPanel((p) => ({
                          ...p,
                          focusZone: e.target.value as FocusZone,
                        }))
                      }
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                    >
                      <option value="full_body">Cuerpo Completo (Libre)</option>
                      <option value="shoulder_arm">Hombro y Brazo</option>
                      <option value="elbow_forearm">Codo y Antebrazo</option>
                      <option value="wrist_hand">Muñeca y Mano</option>
                      <option value="neck_cervical">Cabeza y Cuello</option>
                      <option value="trunk_pelvis">Tronco y Pelvis</option>
                      <option value="legs_knees">Piernas y Rodillas</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Modo de Apoyo Podal
                    </label>
                    <select
                      value={activePanel.pose.stanceMode || 'standing'}
                      onChange={(e) =>
                        updateActiveBodyPose((prev) => ({
                          ...prev,
                          stanceMode: e.target.value as PosturePose3D['stanceMode'],
                        }))
                      }
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                    >
                      <option value="standing">Bipedestación (De pie)</option>
                      <option value="seated">Sedestación (Sentado)</option>
                      <option value="squatting">Cuclillas</option>
                      <option value="kneeling">Arrodillado</option>
                      <option value="one_leg">Monopedestación (1 pierna)</option>
                      <option value="walking">Caminando</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Destino del Goniómetro
                    </label>
                    <select
                      value={transferTargetField}
                      onChange={(e) =>
                        setTransferTargetField(e.target.value as keyof PosturePose3D)
                      }
                      className="w-full rounded border border-sky-300 bg-white px-2 py-1 text-xs text-slate-900"
                    >
                      {JOINT_SLIDER_FIELDS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Pestañas de Categorías Articulares + Pestaña Especial de Objeto / Mesa / Pisón Regulable */}
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1">
                  {(
                    [
                      { id: 'tronco_cuello', label: 'Tronco' },
                      { id: 'brazo_der', label: 'Brazo Der.' },
                      { id: 'brazo_izq', label: 'Brazo Izq.' },
                      { id: 'piernas_pies', label: 'Piernas' },
                      { id: 'espacio_objeto', label: 'Objetos 3D' },
                    ] as Array<{ id: AngleCategory; label: string }>
                  ).map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setAngleCategory(cat.id)}
                      className={`py-1.5 px-1.5 rounded border text-[11px] font-semibold cursor-pointer text-center ${
                        angleCategory === cat.id
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {angleCategory === 'espacio_objeto' ? (
                  <div className="space-y-3 border border-sky-200 bg-sky-50/40 rounded p-3 text-xs">
                    <div>
                      <label className="block font-bold text-slate-900 mb-1">
                        Objeto / Mesa / Herramienta en Escena (`prop`)
                      </label>
                      <select
                        value={activePanel.pose.prop || 'none'}
                        onChange={(e) =>
                          updateActiveBodyPose((prev) => ({
                            ...prev,
                            prop: e.target.value as ScenePropType,
                          }))
                        }
                        className="w-full min-h-[36px] rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                      >
                        {SCENE_PROP_LABELS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Regulación fina X / Y / Z / Giro / Escala del Objeto (Mesa, Pisón de Tierra, Pala, etc.) */}
                    <div className="space-y-2.5 pt-1 border-t border-sky-200">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sky-950">
                          Regulación Libre del Objeto (Mesa, Pisón, Silla...)
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateActiveBodyPose((prev) => ({
                              ...prev,
                              propOffsetX: 0,
                              propOffsetY: 0,
                              propOffsetZ: 0,
                              propRotYDeg: 0,
                              propScale: 1,
                            }))
                          }
                          className="text-[11px] text-sky-800 underline font-semibold cursor-pointer"
                        >
                          Centrar Objeto
                        </button>
                      </div>

                      {(
                        [
                          {
                            key: 'propOffsetX' as const,
                            label: 'Posición Lateral Objeto X (m)',
                            min: -1.0,
                            max: 1.0,
                            step: 0.02,
                            fallback: 0,
                          },
                          {
                            key: 'propOffsetY' as const,
                            label: 'Altura Vertical Objeto Y (m) — Subir/Bajar apoyo',
                            min: -0.7,
                            max: 0.7,
                            step: 0.02,
                            fallback: 0,
                          },
                          {
                            key: 'propOffsetZ' as const,
                            label: 'Profundidad Frontal Objeto Z (m) — Acercar al codo/cuerpo',
                            min: -1.0,
                            max: 1.0,
                            step: 0.02,
                            fallback: 0,
                          },
                          {
                            key: 'propRotYDeg' as const,
                            label: 'Giro Horizontal Objeto (°)',
                            min: -180,
                            max: 180,
                            step: 1,
                            fallback: 0,
                          },
                          {
                            key: 'propScale' as const,
                            label: 'Escala de Tamaño del Objeto',
                            min: 0.5,
                            max: 1.8,
                            step: 0.05,
                            fallback: 1,
                          },
                        ] as const
                      ).map((ctrl) => {
                        const val = Number(activePanel.pose[ctrl.key] ?? ctrl.fallback);
                        return (
                          <div key={ctrl.key} className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11.5px] font-medium text-slate-800">
                                {ctrl.label}
                              </span>
                              <input
                                type="number"
                                step={ctrl.step}
                                min={ctrl.min}
                                max={ctrl.max}
                                value={val}
                                onChange={(e) => {
                                  const num = Number(e.target.value);
                                  updateActiveBodyPose((prev) => ({
                                    ...prev,
                                    [ctrl.key]: Number.isFinite(num) ? num : ctrl.fallback,
                                  }));
                                }}
                                className="w-18 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-right font-mono text-xs tabular-nums"
                              />
                            </div>
                            <input
                              type="range"
                              min={ctrl.min}
                              max={ctrl.max}
                              step={ctrl.step}
                              value={val}
                              onChange={(e) =>
                                updateActiveBodyPose((prev) => ({
                                  ...prev,
                                  [ctrl.key]: Number(e.target.value),
                                }))
                              }
                              className="w-full accent-sky-700 cursor-pointer"
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Posición espacial libre del Avatar en el piso */}
                    <div className="space-y-2 pt-2 border-t border-sky-200">
                      <span className="font-bold text-slate-900 block">
                        Desplazamiento Libre del Avatar en Planta
                      </span>
                      {(
                        [
                          { key: 'rootOffsetX' as const, label: 'Avatar Lateral X (m)', min: -0.9, max: 0.9, step: 0.02 },
                          { key: 'rootOffsetZ' as const, label: 'Avatar Avance Z (m)', min: -0.9, max: 0.9, step: 0.02 },
                          { key: 'rootYawDeg' as const, label: 'Giro Corporal Global (°)', min: -180, max: 180, step: 1 },
                        ] as const
                      ).map((rc) => {
                        const val = Number(activePanel.pose[rc.key] ?? 0);
                        return (
                          <div key={rc.key} className="space-y-0.5">
                            <div className="flex justify-between text-[11px]">
                              <span>{rc.label}</span>
                              <span className="font-mono font-bold tabular-nums">{val}</span>
                            </div>
                            <input
                              type="range"
                              min={rc.min}
                              max={rc.max}
                              step={rc.step}
                              value={val}
                              onChange={(e) =>
                                updateActiveBodyPose((prev) => ({
                                  ...prev,
                                  [rc.key]: Number(e.target.value),
                                }))
                              }
                              className="w-full accent-violet-700 cursor-pointer"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <label className="inline-flex items-center gap-2 text-[11.5px] font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={mirrorArmsLegs}
                        onChange={(e) => setMirrorArmsLegs(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      Simetría bilateral Derecho ↔ Izquierdo al mover controles
                    </label>

                    {visibleSliders.map((field) => {
                      const rawVal = Number(activePanel.pose[field.key] ?? 0);
                      return (
                        <div
                          key={field.key}
                          className="border border-slate-200 rounded p-2 bg-slate-50/70 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11.5px] font-medium text-slate-800">
                              {field.label}
                            </span>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={field.min}
                                max={field.max}
                                step={field.step || 1}
                                value={rawVal}
                                onChange={(e) => {
                                  const num = Math.max(
                                    field.min,
                                    Math.min(field.max, Number(e.target.value) || 0),
                                  );
                                  updateActiveBodyPose((prev) => ({
                                    ...prev,
                                    [field.key]: num,
                                  }));
                                }}
                                className="w-16 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-right font-mono text-xs font-semibold tabular-nums text-slate-900"
                              />
                              <span className="text-[11px] font-mono text-slate-500">{field.unit}</span>
                            </div>
                          </div>

                          <input
                            type="range"
                            min={field.min}
                            max={field.max}
                            step={field.step || 1}
                            value={rawVal}
                            onChange={(e) => {
                              const num = Number(e.target.value);
                              updateActiveBodyPose((prev) => {
                                const next = { ...prev, [field.key]: num };
                                if (mirrorArmsLegs) {
                                  if (field.key === 'shoulderRFlexionDeg') next.shoulderLFlexionDeg = num;
                                  if (field.key === 'shoulderRAbductionDeg') next.shoulderLAbductionDeg = num;
                                  if (field.key === 'elbowRFlexionDeg') next.elbowLFlexionDeg = num;
                                  if (field.key === 'hipRFlexionDeg') next.hipLFlexionDeg = num;
                                  if (field.key === 'kneeRFlexionDeg') next.kneeLFlexionDeg = num;
                                }
                                return next;
                              });
                            }}
                            className="w-full accent-sky-700 cursor-pointer"
                          />
                        </div>
                      );
                    })}

                    {/* Atajo rápido para ir a regular el objeto si la figura tiene mesa o pisón */}
                    {activePanel.pose.prop && activePanel.pose.prop !== 'none' && (
                      <button
                        type="button"
                        onClick={() => setAngleCategory('espacio_objeto')}
                        className="w-full min-h-[36px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded border border-sky-300 bg-sky-50 hover:bg-sky-100 text-xs font-semibold text-sky-900 cursor-pointer"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        Regular Posición / Altura del Objeto ({activePanel.pose.prop})
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 text-xs text-slate-600 space-y-2">
                <p className="font-semibold text-slate-900">
                  Esta lámina corresponde a un diagrama metodológico 2D (`{selectedCatalogSpec.renderMode}`).
                </p>
                <p>
                  Puede reemplazar su imagen por una versión definitiva o seleccionar cualquier figura postural 3D en el listado izquierdo para editar sus avatares y objetos.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

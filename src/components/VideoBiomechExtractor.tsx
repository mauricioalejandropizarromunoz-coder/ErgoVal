import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Crosshair,
  Download,
  Expand,
  FileDown,
  FileJson,
  FileText,
  Film,
  Minimize2,
  Move3d,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Sliders,
  Upload,
  Video,
  X,
} from 'lucide-react';
import {
  AngleAnnotation,
  GeneralStudyData,
  JsiData,
  MethodId,
  Nam295Data,
  NioshData,
  OcraChecklistData,
  RebaData,
  StudyPhoto,
  StudyTab,
} from '../types/ergonomics';
import {
  CameraPreset,
  JointKey,
  Panel3DSpec,
  ScenePropType,
} from '../types/figurePlan';
import { evaluateNiosh, evaluateReba, evaluateStudyTab } from '../utils/calculations';
import { createNewStudyTab } from '../utils/defaults';
import {
  CENEA_SAMPLE_VIDEOS_CATALOG,
  CeneaSampleCaseId,
  CeneaSampleVideoSpec,
  buildCeneaSampleFrameSpec,
} from '../utils/ceneaSampleVideosCatalog';
import {
  BiologicalSex,
  ErgonizaDigitalTwinJson,
  InvisibleErgonizaParameters,
  OperatorComplexion,
  buildErgonizaDigitalTwinJson,
  computeErgonizaStaticBiomechanics,
  detectMissingInvisibleParameters,
  sanitizeErgonizaAngles,
  syncAvatarPoseFromErgonizaJson,
} from '../utils/ergonizaBiomechEngine';
import { extractSingleMocapFrame } from '../utils/mocapRetargeter';
import { RepetitiveVideoMetrics, trackVideoFrames } from '../utils/poseExtractor';
import {
  CameraOrbitOverride,
  DEFAULT_ORBIT_OVERRIDE,
  ensureAvatarGlbLoaded,
  renderInteractiveFreeAvatarToCanvas,
  renderInteractivePose3DToCanvas,
  subscribeAvatarGlbLoaded,
} from '../utils/biomech3dRenderer';
import {
  renderAnnotatedOperatorFrameJpeg,
  renderSinglePanelAvatarJpeg,
} from '../utils/methodAvatarReportHelper';
import { NioshGeometryGuide, RepetitiveCycleAndAnglesGuide } from './AngleGuides';
import { InteractivePhotoGoniometer } from './InteractivePhotoGoniometer';

export interface VideoBiomechExtractorProps {
  general: GeneralStudyData;
  onBackToEvaluator: () => void;
  onEmitTabsAndReport: (payload: {
    nioshTab: StudyTab;
    rebaTab: StudyTab;
    emittedTabs?: StudyTab[];
    autoDownloadPdf: boolean;
  }) => Promise<void>;
  onExportCurrentPdf: () => Promise<void>;
  onExportCurrentWord: () => Promise<void>;
  onOpenGeneratedTabsInEvaluator: () => void;
  onOpenTwinVideoStudio?: () => void;
  isExpandedView?: boolean;
  onToggleExpandedView?: () => void;
}

interface ExtractedFramePreview {
  index: number;
  timeSec: number;
  timestamp: string;
  dataUrl: string;
  mimeType: string;
  dataBase64: string;
}

interface PlumbLineAnchor {
  top: { x: number; y: number };
  bottom: { x: number; y: number };
}

const ERGONIZA_MANUAL_PDF_URL =
  '/assets/aistudio/Ergoniza_Intelligent_-_Bases_de_funcionamiento_3957c1bb.pdf';

function formatTimeSecToTimestamp(sec: number): string {
  const safe = Math.max(0, sec);
  const mins = Math.floor(safe / 60);
  const rem = safe - mins * 60;
  const sInt = Math.floor(rem);
  const ms = Math.round((rem - sInt) * 1000);
  return `${String(mins).padStart(2, '0')}:${String(sInt).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      const idx = raw.indexOf(',');
      resolve(idx >= 0 ? raw.slice(idx + 1) : raw);
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo de vídeo.'));
    reader.readAsDataURL(file);
  });
}

function buildRoleJsonFromSample(
  sample: CeneaSampleVideoSpec,
  role: 'origin' | 'dest',
  invisibleParams?: Partial<InvisibleErgonizaParameters>,
  verticalOffsetDeg = 0,
): ErgonizaDigitalTwinJson {
  const isOrigin = role === 'origin';
  const vCm = isOrigin ? sample.vOriginCm : sample.vDestCm;
  const trunkDeg = isOrigin ? sample.trunkOriginDeg : sample.trunkDestDeg;
  const kneeDeg = isOrigin ? sample.kneeOriginDeg : sample.kneeDestDeg;
  const asymDeg = isOrigin ? sample.asymmetryOriginDeg : sample.asymmetryDestDeg;
  const hipDeg = Math.round(Math.min(115, kneeDeg * 0.72 + trunkDeg * 0.32));
  const shoulderDeg = vCm > 115 ? 92 : vCm >= 75 ? 56 : 44;
  const elbowDeg = vCm < 50 ? 28 : 68;
  const support =
    kneeDeg >= 65
      ? 'Bipedestación bilateral con flexión profunda de rodillas'
      : sample.id === 'cenea_empuje_traccion'
        ? 'Bipedestación dinámica en marcha (empuje bimanual)'
        : 'Bipedestación bilateral';

  return buildErgonizaDigitalTwinJson({
    analisisExitoso: true,
    fotogramaCriticoSegundo: isOrigin ? 1.1 : 3.6,
    condicionesApoyo: support,
    planoReferencia: asymDeg >= 20 ? 'Sagital/Frontal' : 'Sagital',
    articulaciones: {
      tronco: {
        flexion_extension_grados: trunkDeg,
        lateralizacion_grados: asymDeg >= 25 ? 8 : 0,
        rotacion_axial_grados: asymDeg,
      },
      hombro_derecho: {
        flexion_anteroposterior_grados: shoulderDeg,
        abduccion_aduccion_grados: 12,
        rotacion_humeral_grados: asymDeg >= 20 ? -10 : 0,
      },
      codo_derecho: {
        flexion_extension_grados: elbowDeg,
      },
      cadera_derecha: {
        flexion_extension_grados: hipDeg,
      },
      rodilla_derecha: {
        flexion_extension_grados: kneeDeg,
      },
    },
    invisibleParams,
    verticalCalibrationOffsetDeg: verticalOffsetDeg,
  });
}

function buildRebaPayloadFromTwin(
  json: ErgonizaDigitalTwinJson,
  loadKg: number,
  coupling: 'bueno' | 'regular' | 'malo',
): RebaData {
  const art = json.sincronizacion_avatar_3d.articulaciones_principales;
  const tr = art.tronco.flexion_extension_grados;
  const trunkPos: 1 | 2 | 3 | 4 =
    Math.abs(tr) <= 4 ? 1 : tr <= 20 && tr >= -20 ? 2 : tr <= 60 ? 3 : 4;
  const trunkTwistedOrSide =
    Math.abs(art.tronco.lateralizacion_grados) >= 8 ||
    Math.abs(art.tronco.rotacion_axial_grados) >= 10;

  const kn = art.rodilla_derecha.flexion_extension_grados;
  const isUnipodal = json.condiciones_apoyo_detectadas.toLowerCase().includes('monoped');
  const legsBase: 1 | 2 = isUnipodal ? 2 : 1;
  const legsKneeFlexion: 0 | 1 | 2 = kn > 60 ? 2 : kn >= 30 ? 1 : 0;

  const sh = art.hombro_derecho.flexion_anteroposterior_grados;
  const upperArmPos: 1 | 2 | 3 | 4 =
    Math.abs(sh) <= 20 ? 1 : sh <= 45 ? 2 : sh <= 90 ? 3 : 4;
  const elb = art.codo_derecho.flexion_extension_grados;
  const lowerArmPos: 1 | 2 = elb >= 60 && elb <= 100 ? 1 : 2;

  const loadForce: 0 | 1 | 2 = loadKg > 10 ? 2 : loadKg >= 5 ? 1 : 0;
  const couplingCode: 0 | 1 | 2 = coupling === 'bueno' ? 0 : coupling === 'regular' ? 1 : 2;

  const side = {
    upperArmPos,
    shoulderRaised: false,
    armAbducted: art.hombro_derecho.abduccion_aduccion_grados > 20,
    armSupported: false,
    lowerArmPos,
    wristPos: 1 as const,
    wristTwistedOrDeviated: Math.abs(art.hombro_derecho.rotacion_humeral_grados) > 25,
    coupling: couplingCode,
  };

  return {
    evaluatedSide: 'derecho',
    trunkPos,
    trunkTwistedOrSide,
    neckPos: tr > 40 ? 2 : 1,
    neckTwistedOrSide: trunkTwistedOrSide,
    legsBase,
    legsKneeFlexion,
    loadForce,
    shockForce: false,
    right: side,
    left: { ...side },
    activityStatic: false,
    activityRepetitive: true,
    activityUnstableChanges: kn > 65 || tr > 50,
  };
}

function makeAngleAnnotationsFromTwin(json: ErgonizaDigitalTwinJson): AngleAnnotation[] {
  const art = json.sincronizacion_avatar_3d.articulaciones_principales;
  return [
    {
      id: 'ann-trunk',
      label: 'Tronco',
      p1: { x: 0.5, y: 0.2 },
      vertex: { x: 0.5, y: 0.5 },
      p2: { x: 0.5, y: 0.8 },
      degrees: Math.round(art.tronco.flexion_extension_grados),
    },
    {
      id: 'ann-shoulder',
      label: 'Hombro',
      p1: { x: 0.5, y: 0.3 },
      vertex: { x: 0.5, y: 0.4 },
      p2: { x: 0.7, y: 0.5 },
      degrees: Math.round(art.hombro_derecho.flexion_anteroposterior_grados),
    },
    {
      id: 'ann-elbow',
      label: 'Codo',
      p1: { x: 0.5, y: 0.3 },
      vertex: { x: 0.6, y: 0.5 },
      p2: { x: 0.8, y: 0.5 },
      degrees: Math.round(art.codo_derecho.flexion_extension_grados),
    },
    {
      id: 'ann-hip',
      label: 'Cadera',
      p1: { x: 0.5, y: 0.3 },
      vertex: { x: 0.5, y: 0.55 },
      p2: { x: 0.5, y: 0.75 },
      degrees: Math.round(art.cadera_derecha.flexion_extension_grados),
    },
    {
      id: 'ann-knee',
      label: 'Rodilla',
      p1: { x: 0.5, y: 0.5 },
      vertex: { x: 0.5, y: 0.72 },
      p2: { x: 0.5, y: 0.92 },
      degrees: Math.round(art.rodilla_derecha.flexion_extension_grados),
    },
  ];
}

export const VideoBiomechExtractor: React.FC<VideoBiomechExtractorProps> = ({
  general,
  onBackToEvaluator,
  onEmitTabsAndReport,
  onExportCurrentWord,
  onOpenGeneratedTabsInEvaluator,
  onOpenTwinVideoStudio,
  isExpandedView = false,
  onToggleExpandedView,
}) => {
  const [sourceMode, setSourceMode] = useState<'upload' | 'sample'>('upload');
  const [selectedSampleId, setSelectedSampleId] = useState<CeneaSampleCaseId>('cenea_mmc_almacen');
  const selectedSample = useMemo(
    () =>
      CENEA_SAMPLE_VIDEOS_CATALOG.find((c) => c.id === selectedSampleId) ||
      CENEA_SAMPLE_VIDEOS_CATALOG[0],
    [selectedSampleId],
  );

  // Vídeo subido y fotogramas extraídos
  const [videoFileName, setVideoFileName] = useState<string>('');
  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null);
  const [extractedFrames, setExtractedFrames] = useState<ExtractedFramePreview[]>([]);
  const [originFrameIdx, setOriginFrameIdx] = useState<number>(0);
  const [destFrameIdx, setDestFrameIdx] = useState<number>(0);
  const [activePostureRole, setActivePostureRole] = useState<'origin' | 'dest'>('origin');

  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisProgressMsg, setAnalysisProgressMsg] = useState<string>('');
  const [statusNotice, setStatusNotice] = useState<{
    tone: 'info' | 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  // Anclaje Geométrico de Gravedad (0° vertical real)
  const [showGravityAnchor, setShowGravityAnchor] = useState<boolean>(true);
  const [plumbAnchor, setPlumbAnchor] = useState<PlumbLineAnchor>({
    top: { x: 0.16, y: 0.12 },
    bottom: { x: 0.16, y: 0.86 },
  });
  const [draggingPlumbPart, setDraggingPlumbPart] = useState<'top' | 'bottom' | null>(null);
  const frameOverlayRef = useRef<HTMLDivElement | null>(null);

  const verticalCalibrationDeg = useMemo(() => {
    const dx = plumbAnchor.bottom.x - plumbAnchor.top.x;
    const dy = Math.max(0.08, plumbAnchor.bottom.y - plumbAnchor.top.y);
    return Math.round(((Math.atan2(dx, dy) * 180) / Math.PI) * 10) / 10;
  }, [plumbAnchor]);

  // Parámetros invisibles
  const [invisibleParams, setInvisibleParams] = useState<InvisibleErgonizaParameters>({
    loadMassKg: 18,
    sex: 'masculino',
    ageYears: 34,
    statureCm: 172,
    bodyMassKg: 76,
    complexion: 'media_p50',
    frequencyPerMin: 4,
    dutyCyclePercent: 20,
    horizontalReachCm: 36,
    gripCoupling: 'regular',
    floorFrictionMu: 0.5,
    isBimanualLoad: true,
    userConfirmedInvisibleParams: true,
  });

  // Geometría Toma de Carga (Origen) y Destino (en cm) — inicializada en bipedestación neutra antes de comparar
  const [vOriginCm, setVOriginCm] = useState<number>(75);
  const [vDestCm, setVDestCm] = useState<number>(108);
  const [hDestCm, setHDestCm] = useState<number>(34);

  const buildUprightStandingNeutralTwin = (tSec = 0): ErgonizaDigitalTwinJson =>
    buildErgonizaDigitalTwinJson({
      analisisExitoso: true,
      fotogramaCriticoSegundo: tSec,
      condicionesApoyo: 'Bipedestación bilateral erguida (en espera de vídeo)',
      planoReferencia: 'Sagital',
      articulaciones: {
        tronco: { flexion_extension_grados: 0, lateralizacion_grados: 0, rotacion_axial_grados: 0 },
        hombro_derecho: {
          flexion_anteroposterior_grados: 8,
          abduccion_aduccion_grados: 4,
          rotacion_humeral_grados: 0,
        },
        codo_derecho: { flexion_extension_grados: 14 },
        cadera_derecha: { flexion_extension_grados: 2 },
        rodilla_derecha: { flexion_extension_grados: 4 },
      },
      invisibleParams: {
        loadMassKg: 18,
        userConfirmedInvisibleParams: true,
      },
    });

  // Postura 1: Toma de Carga (Origen) y Postura 2: Destino — erguidas de pie antes de cargar/comparar vídeo
  const [rawOriginTwinJson, setRawOriginTwinJson] = useState<ErgonizaDigitalTwinJson>(() =>
    buildUprightStandingNeutralTwin(0),
  );
  const [rawDestTwinJson, setRawDestTwinJson] = useState<ErgonizaDigitalTwinJson>(() =>
    buildUprightStandingNeutralTwin(0),
  );

  const effectiveOriginTwinJson = useMemo<ErgonizaDigitalTwinJson>(
    () =>
      buildErgonizaDigitalTwinJson({
        analisisExitoso: rawOriginTwinJson.analisis_exitoso,
        fotogramaCriticoSegundo: rawOriginTwinJson.fotograma_critico_segundo,
        condicionesApoyo: rawOriginTwinJson.condiciones_apoyo_detectadas,
        planoReferencia: rawOriginTwinJson.sincronizacion_avatar_3d.plano_referencia,
        articulaciones: rawOriginTwinJson.sincronizacion_avatar_3d.articulaciones_principales,
        invisibleParams,
        verticalCalibrationOffsetDeg: verticalCalibrationDeg,
      }),
    [rawOriginTwinJson, invisibleParams, verticalCalibrationDeg],
  );

  const effectiveDestTwinJson = useMemo<ErgonizaDigitalTwinJson>(
    () =>
      buildErgonizaDigitalTwinJson({
        analisisExitoso: rawDestTwinJson.analisis_exitoso,
        fotogramaCriticoSegundo: rawDestTwinJson.fotograma_critico_segundo,
        condicionesApoyo: rawDestTwinJson.condiciones_apoyo_detectadas,
        planoReferencia: rawDestTwinJson.sincronizacion_avatar_3d.plano_referencia,
        articulaciones: rawDestTwinJson.sincronizacion_avatar_3d.articulaciones_principales,
        invisibleParams: {
          ...invisibleParams,
          horizontalReachCm: hDestCm,
        },
        verticalCalibrationOffsetDeg: verticalCalibrationDeg,
      }),
    [rawDestTwinJson, invisibleParams, hDestCm, verticalCalibrationDeg],
  );

  const activeEffectiveTwinJson =
    activePostureRole === 'origin' ? effectiveOriginTwinJson : effectiveDestTwinJson;

  // Evaluación de Movimientos Repetitivos extraída del vídeo
  const [repetitiveMetrics, setRepetitiveMetrics] = useState<RepetitiveVideoMetrics>({
    cycleDurationSec: 8.5,
    technicalActionsCountR: 6,
    technicalActionsCountL: 5,
    actionsPerMinR: 42.4,
    actionsPerMinL: 35.3,
    effortDurationSec: 3.4,
    pctShoulderHigh: 28,
    pctElbowWide: 42,
    pctWristAwkward: 34,
    recommendedOcraFreqScore: 3,
    recommendedStereotypyScore: 1.5,
    estimatedHOriginCm: 36,
    estimatedVOriginCm: 26,
    estimatedHDestCm: 34,
    estimatedVDestCm: 112,
  });
  const [borgPeakScore, setBorgPeakScore] = useState<number>(4);
  const [distalGripType, setDistalGripType] = useState<'power' | 'pinch_33' | 'pinch_50' | 'pinch_80'>('pinch_33');
  const [netRepetitiveMinutes, setNetRepetitiveMinutes] = useState<number>(390);
  const [unrecoveredHours, setUnrecoveredHours] = useState<0 | 2 | 3 | 4 | 6>(3);

  // Selección de pestañas a enviar al Estudio e Informe PDF/Word
  const [emitNiosh, setEmitNiosh] = useState<boolean>(true);
  const [emitReba, setEmitReba] = useState<boolean>(true);
  const [emitOcraChecklist, setEmitOcraChecklist] = useState<boolean>(true);
  const [emitJsi, setEmitJsi] = useState<boolean>(true);
  const [emitNam295, setEmitNam295] = useState<boolean>(false);

  // Editor JSON y visor PDF
  const [jsonEditorOpen, setJsonEditorOpen] = useState<boolean>(false);
  const [jsonDraftText, setJsonDraftText] = useState<string>('');
  const [copiedJsonBadge, setCopiedJsonBadge] = useState<boolean>(false);
  const [showErgonizaPdfModal, setShowErgonizaPdfModal] = useState<boolean>(false);

  // Dos lienzos 3D simultáneos: Toma de Carga (Origen) + Destino
  const originAvatarCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const destAvatarCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const projectedOriginJointsRef = useRef<Record<JointKey, { x: number; y: number }> | null>(null);
  const projectedDestJointsRef = useRef<Record<JointKey, { x: number; y: number }> | null>(null);

  const [avatarReady, setAvatarReady] = useState<boolean>(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('sagittal_right');
  const [orbit, setOrbit] = useState<CameraOrbitOverride>(DEFAULT_ORBIT_OVERRIDE);
  const [show3DJointGizmos, setShow3DJointGizmos] = useState<boolean>(true);
  const [show3DGoniometerOverlay, setShow3DGoniometerOverlay] = useState<boolean>(false);
  const [selectedJoint3D, setSelectedJoint3D] = useState<JointKey | null>('l5s1');
  const [hoveredJoint3D, setHoveredJoint3D] = useState<JointKey | null>(null);
  const [activeProp3D, setActiveProp3D] = useState<ScenePropType>('none');
  const [isPlayingCycle3D, setIsPlayingCycle3D] = useState<boolean>(false);
  const [cycleProgress, setCycleProgress] = useState<number>(0.2);
  const [hasEmittedTabs, setHasEmittedTabs] = useState<boolean>(false);
  const [isEmittingReport, setIsEmittingReport] = useState<boolean>(false);

  const drag3DRef = useRef<{
    role: 'origin' | 'dest';
    mode: 'orbit' | 'joint';
    joint?: JointKey;
    startX: number;
    startY: number;
    startOrbit: CameraOrbitOverride;
    startArt: ErgonizaDigitalTwinJson['sincronizacion_avatar_3d']['articulaciones_principales'];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    ensureAvatarGlbLoaded().then(() => {
      if (active) setAvatarReady(true);
    });
    const unsub = subscribeAvatarGlbLoaded(() => {
      if (active) setAvatarReady(true);
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
    };
  }, [videoObjectUrl]);

  useEffect(() => {
    if (!isPlayingCycle3D) return;
    let rafId = 0;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      setCycleProgress((prev) => {
        const next = prev + dt * 0.14;
        return next > 1 ? 0 : next;
      });
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlayingCycle3D]);

  const effectiveLoadForCalc = Math.max(0.5, invisibleParams.loadMassKg ?? 15);

  // Especificación 3D para Postura 1: Toma de Carga (Origen)
  const originAvatarSpec = useMemo<Panel3DSpec>(() => {
    if (isPlayingCycle3D && sourceMode === 'sample') {
      return buildCeneaSampleFrameSpec(selectedSample, cycleProgress, invisibleParams.statureCm).panelSpec;
    }
    const { pose } = syncAvatarPoseFromErgonizaJson(effectiveOriginTwinJson, {
      isBimanual: invisibleParams.isBimanualLoad,
      loadKg: effectiveLoadForCalc,
      prop: activeProp3D,
    });
    const art = effectiveOriginTwinJson.sincronizacion_avatar_3d.articulaciones_principales;
    return {
      subTitle: `1. Toma de Carga (Origen · t=${effectiveOriginTwinJson.fotograma_critico_segundo.toFixed(2)}s)`,
      scoreBadge: `H=${invisibleParams.horizontalReachCm} cm · V=${vOriginCm} cm`,
      focusZone: 'full_body',
      cameraPreset,
      pose,
      angleArcs: [
        {
          joint: 'l5s1',
          refType: 'vertical_up',
          toJoint: 'c7',
          label: `Tronco ${art.tronco.flexion_extension_grados}°`,
        },
        {
          joint: 'elbowR',
          refType: 'segment',
          parentJoint: 'shoulderR',
          toJoint: 'wristR',
          label: `Codo ${art.codo_derecho.flexion_extension_grados}°`,
        },
      ],
    };
  }, [
    isPlayingCycle3D,
    sourceMode,
    selectedSample,
    cycleProgress,
    invisibleParams.statureCm,
    invisibleParams.isBimanualLoad,
    invisibleParams.horizontalReachCm,
    effectiveOriginTwinJson,
    effectiveLoadForCalc,
    activeProp3D,
    vOriginCm,
    cameraPreset,
  ]);

  // Especificación 3D para Postura 2: Destino de Carga
  const destAvatarSpec = useMemo<Panel3DSpec>(() => {
    const { pose } = syncAvatarPoseFromErgonizaJson(effectiveDestTwinJson, {
      isBimanual: invisibleParams.isBimanualLoad,
      loadKg: effectiveLoadForCalc,
      prop: activeProp3D,
    });
    const art = effectiveDestTwinJson.sincronizacion_avatar_3d.articulaciones_principales;
    return {
      subTitle: `2. Destino de Carga (t=${effectiveDestTwinJson.fotograma_critico_segundo.toFixed(2)}s)`,
      scoreBadge: `H=${hDestCm} cm · V=${vDestCm} cm`,
      focusZone: 'full_body',
      cameraPreset,
      pose,
      angleArcs: [
        {
          joint: 'l5s1',
          refType: 'vertical_up',
          toJoint: 'c7',
          label: `Tronco ${art.tronco.flexion_extension_grados}°`,
        },
        {
          joint: 'shoulderR',
          refType: 'trunk_axis',
          toJoint: 'elbowR',
          label: `Hombro ${art.hombro_derecho.flexion_anteroposterior_grados}°`,
        },
      ],
    };
  }, [
    effectiveDestTwinJson,
    invisibleParams.isBimanualLoad,
    effectiveLoadForCalc,
    activeProp3D,
    hDestCm,
    vDestCm,
    cameraPreset,
  ]);

  // Renderizado simultáneo de ambos Avatares 3D (Toma de Carga y Destino)
  useEffect(() => {
    if (originAvatarCanvasRef.current) {
      if (show3DJointGizmos && !isPlayingCycle3D && activePostureRole === 'origin') {
        projectedOriginJointsRef.current = renderInteractiveFreeAvatarToCanvas(
          originAvatarSpec,
          originAvatarCanvasRef.current,
          500,
          430,
          orbit,
          2,
          { showGizmos: true, selectedJoint: selectedJoint3D, hoveredJoint: hoveredJoint3D },
        );
      } else {
        renderInteractivePose3DToCanvas(
          originAvatarSpec,
          originAvatarCanvasRef.current,
          500,
          430,
          orbit,
          2,
        );
        projectedOriginJointsRef.current = null;
      }
    }

    if (destAvatarCanvasRef.current) {
      if (show3DJointGizmos && !isPlayingCycle3D && activePostureRole === 'dest') {
        projectedDestJointsRef.current = renderInteractiveFreeAvatarToCanvas(
          destAvatarSpec,
          destAvatarCanvasRef.current,
          500,
          430,
          orbit,
          2,
          { showGizmos: true, selectedJoint: selectedJoint3D, hoveredJoint: hoveredJoint3D },
        );
      } else {
        renderInteractivePose3DToCanvas(
          destAvatarSpec,
          destAvatarCanvasRef.current,
          500,
          430,
          orbit,
          2,
        );
        projectedDestJointsRef.current = null;
      }
    }
  }, [
    originAvatarSpec,
    destAvatarSpec,
    orbit,
    avatarReady,
    show3DJointGizmos,
    selectedJoint3D,
    hoveredJoint3D,
    isPlayingCycle3D,
    activePostureRole,
  ]);

  const missingInvisibleList = useMemo(
    () => detectMissingInvisibleParameters(invisibleParams),
    [invisibleParams],
  );

  // Compresión L4/L5 en Toma y en Destino (adoptamos la más exigente para el resumen superior)
  const originBiomechReport = useMemo(
    () =>
      computeErgonizaStaticBiomechanics(effectiveOriginTwinJson, {
        ...invisibleParams,
        loadMassKg: effectiveLoadForCalc,
      }),
    [effectiveOriginTwinJson, invisibleParams, effectiveLoadForCalc],
  );

  const destBiomechReport = useMemo(
    () =>
      computeErgonizaStaticBiomechanics(effectiveDestTwinJson, {
        ...invisibleParams,
        horizontalReachCm: hDestCm,
        loadMassKg: effectiveLoadForCalc,
      }),
    [effectiveDestTwinJson, invisibleParams, hDestCm, effectiveLoadForCalc],
  );

  const ergonizaBiomechReport =
    destBiomechReport.l4l5CompressionN > originBiomechReport.l4l5CompressionN
      ? destBiomechReport
      : originBiomechReport;

  const nioshDataPreview = useMemo<NioshData>(
    () => ({
      loadWeightKg: effectiveLoadForCalc,
      evaluateDestination: true,
      hOriginCm: invisibleParams.horizontalReachCm,
      hDestCm,
      vOriginCm,
      vDestCm,
      asymmetryOriginDeg: Math.round(
        Math.abs(
          effectiveOriginTwinJson.sincronizacion_avatar_3d.articulaciones_principales.tronco
            .rotacion_axial_grados,
        ),
      ),
      asymmetryDestDeg: Math.round(
        Math.abs(
          effectiveDestTwinJson.sincronizacion_avatar_3d.articulaciones_principales.tronco
            .rotacion_axial_grados,
        ),
      ),
      frequencyLiftsPerMin: invisibleParams.frequencyPerMin,
      durationCategory:
        invisibleParams.dutyCyclePercent <= 15
          ? 'le_1h'
          : invisibleParams.dutyCyclePercent <= 35
            ? '1_to_2h'
            : '2_to_8h',
      couplingQuality: invisibleParams.gripCoupling,
    }),
    [
      effectiveLoadForCalc,
      invisibleParams.horizontalReachCm,
      invisibleParams.frequencyPerMin,
      invisibleParams.dutyCyclePercent,
      invisibleParams.gripCoupling,
      hDestCm,
      vOriginCm,
      vDestCm,
      effectiveOriginTwinJson,
      effectiveDestTwinJson,
    ],
  );

  const nioshEval = useMemo(() => evaluateNiosh(nioshDataPreview), [nioshDataPreview]);

  // REBA toma la postura más comprometida entre Toma y Destino
  const rebaOriginPayload = useMemo(
    () => buildRebaPayloadFromTwin(effectiveOriginTwinJson, effectiveLoadForCalc, invisibleParams.gripCoupling),
    [effectiveOriginTwinJson, effectiveLoadForCalc, invisibleParams.gripCoupling],
  );
  const rebaDestPayload = useMemo(
    () => buildRebaPayloadFromTwin(effectiveDestTwinJson, effectiveLoadForCalc, invisibleParams.gripCoupling),
    [effectiveDestTwinJson, effectiveLoadForCalc, invisibleParams.gripCoupling],
  );
  const rebaEvalOrigin = useMemo(() => evaluateReba(rebaOriginPayload), [rebaOriginPayload]);
  const rebaEvalDest = useMemo(() => evaluateReba(rebaDestPayload), [rebaDestPayload]);
  const rebaOriginScore = parseInt(rebaEvalOrigin.primaryScoreText, 10) || 0;
  const rebaDestScore = parseInt(rebaEvalDest.primaryScoreText, 10) || 0;
  const rebaDataPreview = rebaDestScore > rebaOriginScore ? rebaDestPayload : rebaOriginPayload;
  const rebaEval = rebaDestScore > rebaOriginScore ? rebaEvalDest : rebaEvalOrigin;

  // Payloads automáticos para Movimientos Repetitivos (OCRA Check List, JSI y NAM Res. 295/03)
  const ocraChecklistPreview = useMemo<OcraChecklistData>(() => {
    const freqScore = (apm: number) =>
      apm > 65 ? 10 : apm > 55 ? 8 : apm > 45 ? 6 : apm > 35 ? 3 : apm > 22 ? 1 : 0;
    const forceScore =
      borgPeakScore >= 7 ? 12 : borgPeakScore >= 5 ? 6 : borgPeakScore >= 3 ? 4 : borgPeakScore >= 2 ? 2 : 0;
    const shScore =
      repetitiveMetrics.pctShoulderHigh >= 50
        ? 12
        : repetitiveMetrics.pctShoulderHigh >= 30
          ? 6
          : repetitiveMetrics.pctShoulderHigh >= 10
            ? 2
            : 0;
    const elScore =
      repetitiveMetrics.pctElbowWide >= 80
        ? 8
        : repetitiveMetrics.pctElbowWide >= 50
          ? 4
          : repetitiveMetrics.pctElbowWide >= 30
            ? 2
            : 0;
    const wrScore =
      repetitiveMetrics.pctWristAwkward >= 80
        ? 8
        : repetitiveMetrics.pctWristAwkward >= 50
          ? 4
          : repetitiveMetrics.pctWristAwkward >= 30
            ? 2
            : 0;
    const gripScore =
      distalGripType === 'pinch_80'
        ? 8
        : distalGripType === 'pinch_50'
          ? 4
          : distalGripType === 'pinch_33'
            ? 2
            : 0;

    return {
      mode: 'clasico_bilateral',
      actionsPerCycle: Math.max(1, repetitiveMetrics.technicalActionsCountR),
      cycleDurationSec: Math.max(1, repetitiveMetrics.cycleDurationSec),
      netRepetitiveMinutes,
      coefRecovery: unrecoveredHours >= 4 ? 0.6 : unrecoveredHours >= 2 ? 0.8 : 1.0,
      coefFrequency: repetitiveMetrics.actionsPerMinR > 40 ? 0.6 : 0.8,
      coefForce: borgPeakScore >= 5 ? 0.35 : borgPeakScore >= 3 ? 0.65 : 0.85,
      coefPosture: shScore >= 6 || wrScore >= 4 ? 0.7 : 0.85,
      coefComplementary: 1.0,
      coefStereotypy: repetitiveMetrics.cycleDurationSec < 8 ? 0.7 : 0.85,
      coefDuration: netRepetitiveMinutes >= 360 ? 0.7 : 0.8,
      shiftMinutes: 480,
      officialBreaksMinutes: 30,
      lunchBreakMinutes: 30,
      nonRepetitiveMinutes: Math.max(0, 420 - netRepetitiveMinutes),
      recoveryFactorScore: unrecoveredHours,
      right: {
        frequencyFactor: freqScore(repetitiveMetrics.actionsPerMinR),
        forceFactor: forceScore,
        shoulderScore: shScore,
        elbowScore: elScore,
        wristScore: wrScore,
        handGripScore: gripScore,
        stereotypyScore: repetitiveMetrics.recommendedStereotypyScore,
        complementaryPhysicalScore: 0,
        complementaryOrganizationalScore: 1,
      },
      left: {
        frequencyFactor: freqScore(repetitiveMetrics.actionsPerMinL),
        forceFactor: Math.max(0, forceScore - 2),
        shoulderScore: Math.max(0, shScore === 12 ? 6 : shScore === 6 ? 2 : 0),
        elbowScore: elScore,
        wristScore: wrScore,
        handGripScore: gripScore,
        stereotypyScore: repetitiveMetrics.recommendedStereotypyScore,
        complementaryPhysicalScore: 0,
        complementaryOrganizationalScore: 1,
      },
    };
  }, [repetitiveMetrics, borgPeakScore, distalGripType, netRepetitiveMinutes, unrecoveredHours]);

  const jsiPreview = useMemo<JsiData>(() => {
    const ie: 1 | 2 | 3 | 4 | 5 =
      borgPeakScore >= 7 ? 5 : borgPeakScore >= 5 ? 4 : borgPeakScore >= 3 ? 3 : borgPeakScore >= 2 ? 2 : 1;
    const pm: 1 | 2 | 3 | 4 | 5 =
      repetitiveMetrics.pctWristAwkward >= 65
        ? 5
        : repetitiveMetrics.pctWristAwkward >= 45
          ? 4
          : repetitiveMetrics.pctWristAwkward >= 25
            ? 3
            : 2;
    return {
      ieIntensity: ie,
      effortDurationSec: Math.max(0.5, repetitiveMetrics.effortDurationSec),
      cycleDurationSec: Math.max(1, repetitiveMetrics.cycleDurationSec),
      deDurationScore: 3,
      epmEffortsScore: 3,
      pmWristPosture: pm,
      htHoursPerDay: netRepetitiveMinutes >= 240 ? 4 : 3,
      npSpeedWork: repetitiveMetrics.actionsPerMinR >= 45 ? 4 : 3,
      autoComputeCycleScores: true,
    };
  }, [borgPeakScore, repetitiveMetrics, netRepetitiveMinutes]);

  const namPreview = useMemo<Nam295Data>(() => {
    const obsSec = Math.max(10, Math.round(repetitiveMetrics.cycleDurationSec * 4));
    const scaleFactor = obsSec / Math.max(1, repetitiveMetrics.cycleDurationSec);
    return {
      right: {
        effortsCount: Math.max(1, Math.round(repetitiveMetrics.technicalActionsCountR * scaleFactor)),
        observationPeriodSec: obsSec,
        effortTimeSec: Math.round(repetitiveMetrics.effortDurationSec * scaleFactor * 10) / 10,
        borgPeakForce: borgPeakScore,
      },
      left: {
        effortsCount: Math.max(1, Math.round(repetitiveMetrics.technicalActionsCountL * scaleFactor)),
        observationPeriodSec: obsSec,
        effortTimeSec: Math.round(repetitiveMetrics.effortDurationSec * 0.85 * scaleFactor * 10) / 10,
        borgPeakForce: Math.max(1, borgPeakScore - 1),
      },
      prolongedAwkwardWrist: repetitiveMetrics.pctWristAwkward >= 35,
      contactStress: false,
    };
  }, [repetitiveMetrics, borgPeakScore]);

  const ocraEvalSummary = useMemo(() => {
    const t = createNewStudyTab(1, MethodId.OCRA_CHECKLIST);
    t.payloads[MethodId.OCRA_CHECKLIST] = ocraChecklistPreview;
    return evaluateStudyTab(t);
  }, [ocraChecklistPreview]);

  const jsiEvalSummary = useMemo(() => {
    const t = createNewStudyTab(1, MethodId.JSI);
    t.payloads[MethodId.JSI] = jsiPreview;
    return evaluateStudyTab(t);
  }, [jsiPreview]);

  const namEvalSummary = useMemo(() => {
    const t = createNewStudyTab(1, MethodId.NAM_295);
    t.payloads[MethodId.NAM_295] = namPreview;
    return evaluateStudyTab(t);
  }, [namPreview]);

  const handleSelectSampleCase = (sampleId: CeneaSampleCaseId) => {
    const spec =
      CENEA_SAMPLE_VIDEOS_CATALOG.find((s) => s.id === sampleId) ||
      CENEA_SAMPLE_VIDEOS_CATALOG[0];
    setSourceMode('sample');
    setSelectedSampleId(spec.id);
    setActiveProp3D(spec.prop);
    setCameraPreset(spec.cameraPreset);
    setOrbit(spec.orbit);
    setVOriginCm(spec.vOriginCm);
    setVDestCm(spec.vDestCm);
    setHDestCm(spec.hDestCm);
    setInvisibleParams((prev) => ({
      ...prev,
      loadMassKg: spec.loadWeightKg,
      frequencyPerMin: spec.frequencyPerMin,
      horizontalReachCm: spec.hOriginCm,
      gripCoupling: spec.couplingQuality,
      userConfirmedInvisibleParams: true,
    }));
    setRawOriginTwinJson(
      buildRoleJsonFromSample(spec, 'origin', {
        loadMassKg: spec.loadWeightKg,
        userConfirmedInvisibleParams: true,
      }),
    );
    setRawDestTwinJson(
      buildRoleJsonFromSample(spec, 'dest', {
        loadMassKg: spec.loadWeightKg,
        userConfirmedInvisibleParams: true,
      }),
    );
    setStatusNotice({
      tone: 'info',
      text: `Caso cargado: "${spec.title}". Se visualizan simultáneamente la Postura 1 (Toma de Carga) y la Postura 2 (Destino).`,
    });
  };

  // Procesamiento del vídeo subido: extrae Toma de Carga + Destino + Métricas de Movimientos Repetitivos
  const processUploadedVideoFile = async (file: File) => {
    setIsAnalyzing(true);
    setSourceMode('upload');
    setIsPlayingCycle3D(false);
    setHasEmittedTabs(false);
    setVideoFileName(file.name);
    setAnalysisProgressMsg('1/3 · Decodificando vídeo y extrayendo fotogramas de Toma de Carga y Destino...');

    if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
    let workingUrl = URL.createObjectURL(file);

    const videoEl = document.createElement('video');
    videoEl.style.position = 'fixed';
    videoEl.style.left = '0px';
    videoEl.style.top = '0px';
    videoEl.style.width = '2px';
    videoEl.style.height = '2px';
    videoEl.style.opacity = '0.01';
    videoEl.style.zIndex = '-1';
    videoEl.style.pointerEvents = 'none';
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.setAttribute('playsinline', 'true');
    videoEl.setAttribute('webkit-playsinline', 'true');
    videoEl.preload = 'auto';
    document.body.appendChild(videoEl);

    try {
      let loadedOk = false;
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => {
            if (videoEl.videoWidth > 0 && videoEl.readyState >= 2) resolve();
            else reject(new Error('timeout'));
          }, 9000);
          const onReady = () => {
            if (videoEl.videoWidth > 0 && videoEl.readyState >= 2) {
              window.clearTimeout(timer);
              resolve();
            }
          };
          videoEl.onloadeddata = onReady;
          videoEl.oncanplay = onReady;
          videoEl.onerror = () => {
            window.clearTimeout(timer);
            reject(new Error('codec'));
          };
          videoEl.src = workingUrl;
          videoEl.load();
        });
        loadedOk = videoEl.videoWidth > 0 && videoEl.readyState >= 2;
      } catch {
        loadedOk = videoEl.videoWidth > 0 && videoEl.readyState >= 1;
      }

      if (!loadedOk) {
        setAnalysisProgressMsg('1/3 · Comprobando normalización de formato de vídeo a MP4 H.264...');
        let transcodedOk = false;
        try {
          const b64 = await fileToBase64(file);
          const normResp = await fetch('/api/biomech/normalize-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: file.name, videoBase64: b64 }),
          });
          const ct = (normResp.headers.get('content-type') || '').toLowerCase();
          if (normResp.ok && ct.includes('video')) {
            const mp4Blob = await normResp.blob();
            if (mp4Blob.size > 512) {
              URL.revokeObjectURL(workingUrl);
              workingUrl = URL.createObjectURL(mp4Blob);
              transcodedOk = true;
            }
          } else if (normResp.ok) {
            const normJson = await normResp.json().catch(() => null);
            const rawB64 = typeof normJson?.mp4Base64 === 'string' ? normJson.mp4Base64 : '';
            if (rawB64.length > 256) {
              const binStr = atob(rawB64);
              const bytes = new Uint8Array(binStr.length);
              for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
              URL.revokeObjectURL(workingUrl);
              workingUrl = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
              transcodedOk = true;
            }
          }
        } catch {
          transcodedOk = false;
        }

        if (!transcodedOk) {
          throw new Error(
            'El navegador no pudo decodificar este códec de vídeo (ej. HEVC propietario). Utilice un archivo MP4 (H.264) o WebM.',
          );
        }

        videoEl.src = workingUrl;
        videoEl.load();
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => reject(new Error('Tiempo agotado al leer vídeo.')), 9000);
          const onReady = () => {
            if (videoEl.videoWidth > 0 && videoEl.readyState >= 2) {
              window.clearTimeout(timer);
              resolve();
            }
          };
          videoEl.onloadeddata = onReady;
          videoEl.oncanplay = onReady;
          videoEl.onerror = () => {
            window.clearTimeout(timer);
            reject(new Error('No se pudo reproducir el archivo de vídeo.'));
          };
        });
      }

      setVideoObjectUrl(workingUrl);
      const dur = Number.isFinite(videoEl.duration) && videoEl.duration > 0.1 ? videoEl.duration : 4.0;

      // Copiar de inmediato la postura real del primer fotograma (t = 0 s) en los avatares antes de completar la comparación
      const frame0Sample = await extractSingleMocapFrame(videoEl, 0);
      if (frame0Sample) {
        const p0 = frame0Sample.ergonomicPose;
        const f0Twin = buildErgonizaDigitalTwinJson({
          analisisExitoso: true,
          fotogramaCriticoSegundo: 0,
          condicionesApoyo: 'Bipedestación bilateral (Fotograma inicial)',
          planoReferencia: 'Sagital',
          articulaciones: {
            tronco: {
              flexion_extension_grados: p0.trunkFlexionDeg,
              lateralizacion_grados: p0.trunkLateralDeg,
              rotacion_axial_grados: p0.trunkTwistDeg,
            },
            hombro_derecho: {
              flexion_anteroposterior_grados: p0.shoulderRFlexionDeg,
              abduccion_aduccion_grados: p0.shoulderRAbductionDeg,
              rotacion_humeral_grados: 0,
            },
            codo_derecho: { flexion_extension_grados: p0.elbowRFlexionDeg },
            cadera_derecha: { flexion_extension_grados: p0.hipRFlexionDeg },
            rodilla_derecha: { flexion_extension_grados: p0.kneeRFlexionDeg },
          },
          invisibleParams,
        });
        setRawOriginTwinJson(f0Twin);
        setRawDestTwinJson(f0Twin);
      }

      const frameCount = 12;
      const offCanvas = document.createElement('canvas');
      const targetW = 640;
      const aspect =
        videoEl.videoWidth > 0 && videoEl.videoHeight > 0
          ? videoEl.videoHeight / videoEl.videoWidth
          : 0.5625;
      const targetH = Math.max(240, Math.round(targetW * aspect));
      offCanvas.width = targetW;
      offCanvas.height = targetH;
      const ctx = offCanvas.getContext('2d');

      const frames: ExtractedFramePreview[] = [];
      for (let i = 0; i < frameCount; i++) {
        const tSec =
          frameCount <= 1 ? dur * 0.5 : 0.04 * dur + (i / (frameCount - 1)) * (dur * 0.92);
        await new Promise<void>((resSeek) => {
          const tOut = window.setTimeout(resSeek, 300);
          videoEl.onseeked = () => {
            window.clearTimeout(tOut);
            window.requestAnimationFrame(() => resSeek());
          };
          videoEl.currentTime = Math.min(Math.max(0, dur - 0.04), tSec);
        });

        if (ctx) {
          ctx.drawImage(videoEl, 0, 0, targetW, targetH);
          const dataUrl = offCanvas.toDataURL('image/jpeg', 0.82);
          frames.push({
            index: i,
            timeSec: Math.round(tSec * 100) / 100,
            timestamp: formatTimeSecToTimestamp(tSec),
            dataUrl,
            mimeType: 'image/jpeg',
            dataBase64: dataUrl.split(',')[1] || '',
          });
        }
      }
      setExtractedFrames(frames);

      // Paso 2A: Escaneo cinemático 3D local (extrae Toma, Destino y métricas de Movimientos Repetitivos)
      setAnalysisProgressMsg(
        '2/3 · Extrayendo posturas 3D de Toma de Carga, Destino y frecuencia de acciones repetitivas...',
      );
      const localTracking = await trackVideoFrames(videoEl, {
        maxSamples: 20,
        verticalCalibrationDeg: 0,
        invisibleParams: { loadMassKg: invisibleParams.loadMassKg, userConfirmedInvisibleParams: true },
      });

      // Paso 2B: Calibración multimodal servidor Gemini 3 (con protección ante respuesta fallback serverless)
      setAnalysisProgressMsg('3/3 · Calibrando cotas H/V de Toma y Destino y sincronizando Avatares 3D...');
      let serverData: Record<string, any> | null = null;
      try {
        const critArt = localTracking?.criticalKeyframe.ergonizaAngles;
        const resp = await fetch('/api/biomech/extract-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            frames: frames.map((f) => ({
              index: f.index,
              timestamp: f.timestamp,
              timeSec: f.timeSec,
              mimeType: f.mimeType,
              dataBase64: f.dataBase64,
            })),
            postural_angles_deg: critArt
              ? {
                  trunk_flexion: critArt.tronco.flexion_extension_grados,
                  knee_flexion: critArt.rodilla_derecha.flexion_extension_grados,
                  right_elbow: critArt.codo_derecho.flexion_extension_grados,
                  left_elbow: localTracking?.criticalKeyframe.leftElbowDeg ?? 62,
                  right_shoulder: critArt.hombro_derecho.flexion_anteroposterior_grados,
                }
              : null,
            niosh_inputs: localTracking
              ? {
                  H_cm: localTracking.repetitiveMetrics.estimatedHOriginCm,
                  V_cm: localTracking.repetitiveMetrics.estimatedVOriginCm,
                  D_cm: Math.max(
                    25,
                    Math.abs(
                      localTracking.repetitiveMetrics.estimatedVDestCm -
                        localTracking.repetitiveMetrics.estimatedVOriginCm,
                    ),
                  ),
                  A_deg: Math.abs(critArt?.tronco.rotacion_axial_grados ?? 0),
                }
              : null,
            workerHeightCm: invisibleParams.statureCm,
            videoDurationSec: dur,
            movementModeHint: 'auto',
          }),
        });
        if (resp.ok) {
          serverData = await resp.json();
        }
      } catch {
        serverData = null;
      }

      const useVerifiedServerMetrics = Boolean(serverData && !serverData.isServerFallback);

      // Selección de fotograma de Toma de Carga (Origen) y de Destino (siempre priorizando MediaPipe local si el servidor devolvió fallback)
      let origIdx = useVerifiedServerMetrics
        ? Number(serverData?.critical_events?.origen_frame_index ?? -1)
        : -1;
      let dstIdx = useVerifiedServerMetrics
        ? Number(serverData?.critical_events?.destino_frame_index ?? -1)
        : -1;

      if (origIdx < 0 || origIdx >= frames.length) {
        if (localTracking) {
          origIdx = frames.reduce(
            (best, f, idx) =>
              Math.abs(f.timeSec - localTracking.originKeyframe.timeSec) <
              Math.abs(frames[best].timeSec - localTracking.originKeyframe.timeSec)
                ? idx
                : best,
            0,
          );
        } else {
          origIdx = 0;
        }
      }

      if (dstIdx < 0 || dstIdx >= frames.length || dstIdx === origIdx) {
        if (localTracking) {
          dstIdx = frames.reduce(
            (best, f, idx) =>
              idx !== origIdx &&
              Math.abs(f.timeSec - localTracking.destKeyframe.timeSec) <
                Math.abs(frames[best].timeSec - localTracking.destKeyframe.timeSec)
                ? idx
                : best,
            frames.length - 1,
          );
        } else {
          dstIdx = Math.max(0, frames.length - 1);
        }
        if (dstIdx === origIdx && frames.length > 1) {
          dstIdx = origIdx < frames.length / 2 ? frames.length - 1 : 0;
        }
      }

      setOriginFrameIdx(origIdx);
      setDestFrameIdx(dstIdx);

      const detectedVOrigin = Math.round(
        Number(
          (useVerifiedServerMetrics ? serverData?.movement_analysis?.v_origen_cm : undefined) ??
            localTracking?.repetitiveMetrics.estimatedVOriginCm ??
            72,
        ),
      );
      const detectedVDest = Math.round(
        Number(
          (useVerifiedServerMetrics ? serverData?.movement_analysis?.v_destino_cm : undefined) ??
            localTracking?.repetitiveMetrics.estimatedVDestCm ??
            106,
        ),
      );
      const detectedHOrigin = Math.round(
        Number(
          (useVerifiedServerMetrics ? serverData?.niosh_inputs?.H_cm : undefined) ??
            localTracking?.repetitiveMetrics.estimatedHOriginCm ??
            36,
        ),
      );
      const detectedHDest = Math.round(
        Number(
          (useVerifiedServerMetrics ? serverData?.movement_analysis?.h_destino_cm : undefined) ??
            localTracking?.repetitiveMetrics.estimatedHDestCm ??
            35,
        ),
      );

      setVOriginCm(detectedVOrigin);
      setVDestCm(detectedVDest);
      setHDestCm(detectedHDest);
      setInvisibleParams((prev) => ({
        ...prev,
        horizontalReachCm: detectedHOrigin,
      }));

      if (localTracking?.repetitiveMetrics) {
        setRepetitiveMetrics(localTracking.repetitiveMetrics);
      }

      if (localTracking) {
        setRawOriginTwinJson({
          ...localTracking.originDigitalTwin,
          fotograma_critico_segundo: frames[origIdx]?.timeSec ?? localTracking.originKeyframe.timeSec,
        });
        setRawDestTwinJson({
          ...localTracking.destDigitalTwin,
          fotograma_critico_segundo: frames[dstIdx]?.timeSec ?? localTracking.destKeyframe.timeSec,
        });
      } else if (useVerifiedServerMetrics && serverData?.ergoniza_digital_twin) {
        const srvTwin = serverData.ergoniza_digital_twin as ErgonizaDigitalTwinJson;
        setRawOriginTwinJson({
          ...srvTwin,
          fotograma_critico_segundo: frames[origIdx]?.timeSec ?? 0.8,
        });
        setRawDestTwinJson(
          buildErgonizaDigitalTwinJson({
            analisisExitoso: true,
            fotogramaCriticoSegundo: frames[dstIdx]?.timeSec ?? Math.max(1.5, dur * 0.78),
            condicionesApoyo: 'Bipedestación bilateral en posicionamiento de destino',
            planoReferencia: srvTwin.sincronizacion_avatar_3d.plano_referencia,
            articulaciones: {
              ...srvTwin.sincronizacion_avatar_3d.articulaciones_principales,
              tronco: {
                ...srvTwin.sincronizacion_avatar_3d.articulaciones_principales.tronco,
                flexion_extension_grados: detectedVDest > 110 ? 6 : 16,
              },
              hombro_derecho: {
                ...srvTwin.sincronizacion_avatar_3d.articulaciones_principales.hombro_derecho,
                flexion_anteroposterior_grados: detectedVDest > 115 ? 88 : 56,
              },
              rodilla_derecha: {
                flexion_extension_grados: detectedVDest < 50 ? 58 : 10,
              },
            },
            invisibleParams,
          }),
        );
      }

      setActiveProp3D('box_load');
      setOrbit(DEFAULT_ORBIT_OVERRIDE);

      setStatusNotice({
        tone: 'success',
        text: `Vídeo procesado: Postura 1 (Toma t=${(frames[origIdx]?.timeSec ?? 0).toFixed(2)} s) y Postura 2 (Destino t=${(frames[dstIdx]?.timeSec ?? 0).toFixed(2)} s) + métricas de Movimientos Repetitivos listas para enviar al informe.`,
      });
    } catch (err: unknown) {
      setStatusNotice({
        tone: 'error',
        text: err instanceof Error ? err.message : 'No se pudo procesar el archivo de vídeo.',
      });
    } finally {
      try {
        videoEl.pause();
        videoEl.removeAttribute('src');
        videoEl.load();
        videoEl.remove();
      } catch {
        // Ignorar limpieza
      }
      setIsAnalyzing(false);
      setAnalysisProgressMsg('');
    }
  };

  // Arrastre de la plomada 0°
  const handlePlumbPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingPlumbPart || !frameOverlayRef.current) return;
    const rect = frameOverlayRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = Math.max(0.03, Math.min(0.97, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0.03, Math.min(0.97, (e.clientY - rect.top) / rect.height));
    setPlumbAnchor((prev) =>
      draggingPlumbPart === 'top'
        ? { ...prev, top: { x: nx, y: Math.min(ny, prev.bottom.y - 0.08) } }
        : { ...prev, bottom: { x: nx, y: Math.max(ny, prev.top.y + 0.08) } },
    );
  };

  const findHitJointOnAvatar = useCallback(
    (role: 'origin' | 'dest', clientX: number, clientY: number): JointKey | null => {
      const canvas = role === 'origin' ? originAvatarCanvasRef.current : destAvatarCanvasRef.current;
      const pts = role === 'origin' ? projectedOriginJointsRef.current : projectedDestJointsRef.current;
      if (!canvas || !pts || !show3DJointGizmos || isPlayingCycle3D || activePostureRole !== role) {
        return null;
      }
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const lx = ((clientX - rect.left) / rect.width) * 500;
      const ly = ((clientY - rect.top) / rect.height) * 430;

      const interactiveList: JointKey[] = [
        'l5s1',
        'c7',
        'shoulderR',
        'elbowR',
        'wristR',
        'hipR',
        'kneeR',
      ];
      let best: JointKey | null = null;
      let bestDist = 22;
      for (const jk of interactiveList) {
        const p = pts[jk];
        if (!p) continue;
        const d = Math.hypot(lx - p.x, ly - p.y);
        if (d < bestDist) {
          bestDist = d;
          best = jk;
        }
      }
      return best;
    },
    [show3DJointGizmos, isPlayingCycle3D, activePostureRole],
  );

  const handleAvatarPointerDown = (role: 'origin' | 'dest', e: React.PointerEvent<HTMLCanvasElement>) => {
    setActivePostureRole(role);
    const hitJoint = findHitJointOnAvatar(role, e.clientX, e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);
    const targetJson = role === 'origin' ? rawOriginTwinJson : rawDestTwinJson;
    if (hitJoint) {
      setSelectedJoint3D(hitJoint);
      drag3DRef.current = {
        role,
        mode: 'joint',
        joint: hitJoint,
        startX: e.clientX,
        startY: e.clientY,
        startOrbit: { ...orbit },
        startArt: JSON.parse(
          JSON.stringify(targetJson.sincronizacion_avatar_3d.articulaciones_principales),
        ),
      };
    } else {
      drag3DRef.current = {
        role,
        mode: 'orbit',
        startX: e.clientX,
        startY: e.clientY,
        startOrbit: { ...orbit },
        startArt: targetJson.sincronizacion_avatar_3d.articulaciones_principales,
      };
    }
  };

  const handleAvatarPointerMove = (role: 'origin' | 'dest', e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = drag3DRef.current;
    if (!st) {
      setHoveredJoint3D(findHitJointOnAvatar(role, e.clientX, e.clientY));
      return;
    }
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;

    if (st.mode === 'orbit') {
      setOrbit({
        azimuthDeg: Math.max(-180, Math.min(180, Math.round(st.startOrbit.azimuthDeg + dx * 0.6))),
        elevationDeg: Math.max(-55, Math.min(60, Math.round(st.startOrbit.elevationDeg - dy * 0.45))),
        zoom: st.startOrbit.zoom,
      });
      return;
    }

    if (st.mode === 'joint' && st.joint) {
      const setter = st.role === 'origin' ? setRawOriginTwinJson : setRawDestTwinJson;
      setter((prev) => {
        const nextArt = sanitizeErgonizaAngles({
          ...st.startArt,
          tronco: { ...st.startArt.tronco },
          hombro_derecho: { ...st.startArt.hombro_derecho },
          codo_derecho: { ...st.startArt.codo_derecho },
          cadera_derecha: { ...st.startArt.cadera_derecha },
          rodilla_derecha: { ...st.startArt.rodilla_derecha },
        });

        if (st.joint === 'l5s1' || st.joint === 'c7') {
          nextArt.tronco.flexion_extension_grados = st.startArt.tronco.flexion_extension_grados + dy * 0.45;
          nextArt.tronco.rotacion_axial_grados = st.startArt.tronco.rotacion_axial_grados + dx * 0.35;
        } else if (st.joint === 'shoulderR') {
          nextArt.hombro_derecho.flexion_anteroposterior_grados =
            st.startArt.hombro_derecho.flexion_anteroposterior_grados - dy * 0.55;
          nextArt.hombro_derecho.abduccion_aduccion_grados =
            st.startArt.hombro_derecho.abduccion_aduccion_grados + dx * 0.45;
        } else if (st.joint === 'elbowR' || st.joint === 'wristR') {
          nextArt.codo_derecho.flexion_extension_grados =
            st.startArt.codo_derecho.flexion_extension_grados - dy * 0.6;
        } else if (st.joint === 'hipR') {
          nextArt.cadera_derecha.flexion_extension_grados =
            st.startArt.cadera_derecha.flexion_extension_grados + dy * 0.5;
        } else if (st.joint === 'kneeR') {
          nextArt.rodilla_derecha.flexion_extension_grados =
            st.startArt.rodilla_derecha.flexion_extension_grados + dy * 0.55;
        }

        return {
          ...prev,
          sincronizacion_avatar_3d: {
            ...prev.sincronizacion_avatar_3d,
            articulaciones_principales: sanitizeErgonizaAngles(nextArt),
          },
        };
      });
    }
  };

  const handleAvatarPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drag3DRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  const formattedStrictJsonString = useMemo(
    () => JSON.stringify(activeEffectiveTwinJson, null, 2),
    [activeEffectiveTwinJson],
  );

  const handleCopyStrictJson = async () => {
    try {
      await navigator.clipboard.writeText(formattedStrictJsonString);
      setCopiedJsonBadge(true);
      window.setTimeout(() => setCopiedJsonBadge(false), 2200);
    } catch {
      setStatusNotice({
        tone: 'info',
        text: 'Seleccione el bloque JSON para copiarlo manualmente.',
      });
    }
  };

  const handleDownloadStrictJson = () => {
    const blob = new Blob([formattedStrictJsonString], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gemelo_digital_${activePostureRole}_${Math.round(activeEffectiveTwinJson.fotograma_critico_segundo * 10)}ds.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleApplyEditedJson = () => {
    try {
      const parsed = JSON.parse(jsonDraftText) as Partial<ErgonizaDigitalTwinJson>;
      if (!parsed.sincronizacion_avatar_3d?.articulaciones_principales) {
        throw new Error('El JSON debe contener "sincronizacion_avatar_3d.articulaciones_principales".');
      }
      const setter = activePostureRole === 'origin' ? setRawOriginTwinJson : setRawDestTwinJson;
      setter({
        analisis_exitoso: parsed.analisis_exitoso !== false,
        fotograma_critico_segundo: Number(parsed.fotograma_critico_segundo ?? 0),
        condiciones_apoyo_detectadas:
          parsed.condiciones_apoyo_detectadas || 'Bipedestación bilateral',
        sincronizacion_avatar_3d: {
          plano_referencia: parsed.sincronizacion_avatar_3d.plano_referencia || 'Sagital',
          articulaciones_principales: sanitizeErgonizaAngles(
            parsed.sincronizacion_avatar_3d.articulaciones_principales,
          ),
        },
        datos_faltantes_requeridos: Array.isArray(parsed.datos_faltantes_requeridos)
          ? parsed.datos_faltantes_requeridos
          : activeEffectiveTwinJson.datos_faltantes_requeridos,
      });
      setJsonEditorOpen(false);
      setStatusNotice({
        tone: 'success',
        text: `JSON aplicado a la postura de ${activePostureRole === 'origin' ? 'Toma de Carga' : 'Destino'}.`,
      });
    } catch (err: unknown) {
      setStatusNotice({
        tone: 'error',
        text: err instanceof Error ? err.message : 'JSON inválido.',
      });
    }
  };

  // Emitir todas las pestañas seleccionadas (NIOSH, REBA, OCRA Check List, JSI, NAM 295) CON FOTOS REALES + AVATAR 3D EXACTO
  const handleEmitCompleteEvaluation = async (autoDownloadPdf: boolean) => {
    if (invisibleParams.loadMassKg === null || !invisibleParams.userConfirmedInvisibleParams) {
      setInvisibleParams((p) => ({
        ...p,
        loadMassKg: p.loadMassKg ?? 15,
        userConfirmedInvisibleParams: true,
      }));
    }

    setIsEmittingReport(true);
    try {
      await ensureAvatarGlbLoaded();

      const origArt = effectiveOriginTwinJson.sincronizacion_avatar_3d.articulaciones_principales;
      const destArt = effectiveDestTwinJson.sincronizacion_avatar_3d.articulaciones_principales;

      const origAvatarJpeg = await renderSinglePanelAvatarJpeg(
        originAvatarSpec,
        `RÉPLICA AVATAR 3D · 1. TOMA DE CARGA (ORIGEN · H=${invisibleParams.horizontalReachCm} cm · V=${vOriginCm} cm)`,
        `Tronco ${origArt.tronco.flexion_extension_grados}° | Hombro ${origArt.hombro_derecho.flexion_anteroposterior_grados}° | Codo ${origArt.codo_derecho.flexion_extension_grados}° | Cadera ${origArt.cadera_derecha.flexion_extension_grados}° | Rodilla ${origArt.rodilla_derecha.flexion_extension_grados}°`,
      );

      const destAvatarJpeg = await renderSinglePanelAvatarJpeg(
        destAvatarSpec,
        `RÉPLICA AVATAR 3D · 2. DESTINO DE CARGA (H=${hDestCm} cm · V=${vDestCm} cm)`,
        `Tronco ${destArt.tronco.flexion_extension_grados}° | Hombro ${destArt.hombro_derecho.flexion_anteroposterior_grados}° | Codo ${destArt.codo_derecho.flexion_extension_grados}° | Cadera ${destArt.cadera_derecha.flexion_extension_grados}° | Rodilla ${destArt.rodilla_derecha.flexion_extension_grados}°`,
      );

      const photos: StudyPhoto[] = [];
      const origRealFrame = sourceMode === 'upload' ? extractedFrames[originFrameIdx] : null;
      const destRealFrame = sourceMode === 'upload' ? extractedFrames[destFrameIdx] : null;

      if (origRealFrame) {
        const opOrigJpeg = await renderAnnotatedOperatorFrameJpeg(
          origRealFrame.dataUrl,
          `OPERARIO REAL · 1. TOMA DE CARGA (t = ${origRealFrame.timeSec.toFixed(2)} s)`,
          [
            `H=${invisibleParams.horizontalReachCm} cm`,
            `V=${vOriginCm} cm`,
            `Tronco ${origArt.tronco.flexion_extension_grados}°`,
            `Rodilla ${origArt.rodilla_derecha.flexion_extension_grados}°`,
          ],
        );
        photos.push({
          id: `vid-real-orig-${Date.now()}`,
          name: `Operario Real — Toma de Carga (${origRealFrame.timestamp})`,
          dataUrl: opOrigJpeg,
          annotatedDataUrl: opOrigJpeg,
          caption: `Fotograma real del operario en Toma de Carga (t = ${origRealFrame.timeSec.toFixed(2)} s · H=${invisibleParams.horizontalReachCm} cm, V=${vOriginCm} cm)`,
          annotations: makeAngleAnnotationsFromTwin(effectiveOriginTwinJson),
        });
      }

      photos.push({
        id: `vid-avatar-orig-${Date.now() + 1}`,
        name: 'Réplica Avatar 3D — 1. Toma de Carga (Origen)',
        dataUrl: origAvatarJpeg,
        annotatedDataUrl: origAvatarJpeg,
        caption: `Réplica Avatar 3D en Toma de Carga · Compresión L4/L5 = ${originBiomechReport.l4l5CompressionN} N`,
        annotations: makeAngleAnnotationsFromTwin(effectiveOriginTwinJson),
      });

      if (destRealFrame) {
        const opDestJpeg = await renderAnnotatedOperatorFrameJpeg(
          destRealFrame.dataUrl,
          `OPERARIO REAL · 2. DESTINO DE CARGA (t = ${destRealFrame.timeSec.toFixed(2)} s)`,
          [
            `H=${hDestCm} cm`,
            `V=${vDestCm} cm`,
            `Tronco ${destArt.tronco.flexion_extension_grados}°`,
            `Hombro ${destArt.hombro_derecho.flexion_anteroposterior_grados}°`,
          ],
        );
        photos.push({
          id: `vid-real-dest-${Date.now() + 2}`,
          name: `Operario Real — Destino de Carga (${destRealFrame.timestamp})`,
          dataUrl: opDestJpeg,
          annotatedDataUrl: opDestJpeg,
          caption: `Fotograma real del operario en Destino de Carga (t = ${destRealFrame.timeSec.toFixed(2)} s · H=${hDestCm} cm, V=${vDestCm} cm)`,
          annotations: makeAngleAnnotationsFromTwin(effectiveDestTwinJson),
        });
      }

      photos.push({
        id: `vid-avatar-dest-${Date.now() + 3}`,
        name: 'Réplica Avatar 3D — 2. Destino de Carga',
        dataUrl: destAvatarJpeg,
        annotatedDataUrl: destAvatarJpeg,
        caption: `Réplica Avatar 3D en Destino de Carga · Compresión L4/L5 = ${destBiomechReport.l4l5CompressionN} N`,
        annotations: makeAngleAnnotationsFromTwin(effectiveDestTwinJson),
      });

      const taskTitle =
        sourceMode === 'upload' && videoFileName
          ? `Vídeo (${videoFileName}) · Toma V=${vOriginCm}cm → Destino V=${vDestCm}cm`
          : selectedSample.title;

      const obsText =
        `${ergonizaBiomechReport.technicalSummary}\n` +
        `• Postura 1 — Toma de Carga (Origen): H=${invisibleParams.horizontalReachCm} cm, V=${vOriginCm} cm, Tronco ${origArt.tronco.flexion_extension_grados}°, Hombro ${origArt.hombro_derecho.flexion_anteroposterior_grados}°, Codo ${origArt.codo_derecho.flexion_extension_grados}°, Rodilla ${origArt.rodilla_derecha.flexion_extension_grados}° (L4/L5 = ${originBiomechReport.l4l5CompressionN} N).\n` +
        `• Postura 2 — Destino de Carga: H=${hDestCm} cm, V=${vDestCm} cm, Tronco ${destArt.tronco.flexion_extension_grados}°, Hombro ${destArt.hombro_derecho.flexion_anteroposterior_grados}°, Codo ${destArt.codo_derecho.flexion_extension_grados}°, Rodilla ${destArt.rodilla_derecha.flexion_extension_grados}° (L4/L5 = ${destBiomechReport.l4l5CompressionN} N).\n` +
        `• Ciclo repetitivo medido: T=${repetitiveMetrics.cycleDurationSec} s · ${repetitiveMetrics.actionsPerMinR} acc/min (Der) / ${repetitiveMetrics.actionsPerMinL} acc/min (Izq) · Borg=${borgPeakScore}.`;

      const nioshTab = createNewStudyTab(1, MethodId.NIOSH, taskTitle);
      nioshTab.id = 'tab-video-ia-niosh';
      nioshTab.tabLabel = 'Vídeo IA · NIOSH (Toma y Destino)';
      nioshTab.payloads[MethodId.NIOSH] = { ...nioshDataPreview };
      nioshTab.photos = photos;
      nioshTab.instrumentsUsed =
        'Motor Computacional de Visión 3D + Gemelo Digital Dual (Toma de Carga y Destino)';
      nioshTab.evaluatorObservations = obsText;

      const rebaTab = createNewStudyTab(2, MethodId.REBA, `${taskTitle} (Postura Crítica)`);
      rebaTab.id = 'tab-video-ia-reba';
      rebaTab.tabLabel = 'Vídeo IA · REBA 3D';
      rebaTab.payloads[MethodId.REBA] = { ...rebaDataPreview };
      rebaTab.photos = photos;
      rebaTab.instrumentsUsed =
        'Gemelo Digital Biomecánico 3D con anclaje gravitatorio vertical (0°)';
      rebaTab.evaluatorObservations = obsText;

      const emittedTabs: StudyTab[] = [];
      if (emitNiosh) emittedTabs.push(nioshTab);
      if (emitReba) emittedTabs.push(rebaTab);

      if (emitOcraChecklist) {
        const ocraTab = createNewStudyTab(3, MethodId.OCRA_CHECKLIST, `${taskTitle} (Movimientos Repetitivos)`);
        ocraTab.id = 'tab-video-ia-ocra';
        ocraTab.tabLabel = 'Vídeo IA · Check List OCRA';
        ocraTab.payloads[MethodId.OCRA_CHECKLIST] = { ...ocraChecklistPreview };
        ocraTab.photos = photos;
        ocraTab.instrumentsUsed =
          'Conteo cinemático de acciones técnicas por vídeo + Gemelo Digital 3D';
        ocraTab.evaluatorObservations = obsText;
        emittedTabs.push(ocraTab);
      }

      if (emitJsi) {
        const jsiTab = createNewStudyTab(4, MethodId.JSI, `${taskTitle} (Esfuerzo Distal JSI)`);
        jsiTab.id = 'tab-video-ia-jsi';
        jsiTab.tabLabel = 'Vídeo IA · JSI';
        jsiTab.payloads[MethodId.JSI] = { ...jsiPreview };
        jsiTab.photos = photos;
        jsiTab.instrumentsUsed = 'Cronometraje digital de ciclo y esfuerzo desde vídeo + Avatar 3D';
        jsiTab.evaluatorObservations = obsText;
        emittedTabs.push(jsiTab);
      }

      if (emitNam295) {
        const namTab = createNewStudyTab(5, MethodId.NAM_295, `${taskTitle} (Actividad Manual NAM)`);
        namTab.id = 'tab-video-ia-nam';
        namTab.tabLabel = 'Vídeo IA · NAM Res. 295/03';
        namTab.payloads[MethodId.NAM_295] = { ...namPreview };
        namTab.photos = photos;
        namTab.instrumentsUsed = 'Análisis de vídeo por ciclo + Escala de Borg (Res. MTESS 295/03)';
        namTab.evaluatorObservations = obsText;
        emittedTabs.push(namTab);
      }

      const finalTabs = emittedTabs.length > 0 ? emittedTabs : [nioshTab, rebaTab];

      await onEmitTabsAndReport({
        nioshTab,
        rebaTab,
        emittedTabs: finalTabs,
        autoDownloadPdf,
      });

      setHasEmittedTabs(true);
      setStatusNotice({
        tone: 'success',
        text: autoDownloadPdf
          ? `Se emitieron ${finalTabs.length} pestañas con fotos reales + Avatar 3D (Toma y Destino) y se descargó el Informe PDF.`
          : `Se integraron ${finalTabs.length} pestañas en el Estudio con fotos reales y réplicas Avatar 3D de Toma de Carga y Destino.`,
      });
    } finally {
      setIsEmittingReport(false);
    }
  };

  const originFrame = extractedFrames[originFrameIdx] || null;
  const destFrame = extractedFrames[destFrameIdx] || null;
  const origArt = effectiveOriginTwinJson.sincronizacion_avatar_3d.articulaciones_principales;
  const destArt = effectiveDestTwinJson.sincronizacion_avatar_3d.articulaciones_principales;

  return (
    <div className="space-y-4">
      {/* Cabecera Técnica */}
      <div className="bg-slate-900 text-white rounded-md border border-slate-800 px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-emerald-300">
            <Video className="w-3.5 h-3.5 shrink-0" />
            <span>Motor de Vídeo IA · Doble Postura (Toma de Carga y Destino) + Movimientos Repetitivos</span>
          </div>
          <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">
            Sincronización Simultánea de Toma de Carga, Destino y Ciclos Repetitivos ({general.workstationName || 'Puesto Evaluado'})
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenTwinVideoStudio && (
            <button
              type="button"
              onClick={onOpenTwinVideoStudio}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-teal-600 hover:bg-teal-700 text-xs font-semibold text-white cursor-pointer"
              title="Abrir la pestaña dedicada para generar y descargar el Vídeo Mellizo del Avatar 3D"
            >
              <Film className="w-3.5 h-3.5" />
              Descargar Vídeo Avatar Mellizo
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowErgonizaPdfModal(true)}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-sky-200 cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Bases Biomecánicas (PDF)
          </button>

          {onToggleExpandedView && (
            <button
              type="button"
              onClick={onToggleExpandedView}
              className="min-h-[38px] hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
            >
              {isExpandedView ? <Minimize2 className="w-3.5 h-3.5" /> : <Expand className="w-3.5 h-3.5" />}
              {isExpandedView ? 'Vista Compacta' : 'Expandir Lienzo'}
            </button>
          )}

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

      {statusNotice && (
        <div
          className={`px-4 py-2.5 rounded-md border text-xs font-medium flex items-center justify-between gap-3 ${
            statusNotice.tone === 'error'
              ? 'bg-rose-50 border-rose-300 text-rose-950'
              : statusNotice.tone === 'warning'
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : statusNotice.tone === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-sky-50 border-sky-200 text-sky-950'
          }`}
        >
          <span>{statusNotice.text}</span>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="p-1 text-current opacity-75 hover:opacity-100 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* PASO 1 + PASO 2: DOBLE POSTURA REAL (TOMA DE CARGA Y DESTINO) + DOBLE GEMELO DIGITAL 3D */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* COLUMNA IZQUIERDA (5 cols): Carga de Vídeo y Fotogramas Reales de Toma de Carga y Destino */}
        <section className="xl:col-span-5 bg-white border border-slate-300 rounded-md p-4 space-y-3.5 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
            <div>
              <span className="font-mono text-xs font-bold text-sky-800">
                1. Vídeo y Posturas de Toma y Destino
              </span>
              <h2 className="text-sm font-bold text-slate-900">
                Fotogramas Reales de Toma de Carga (Origen) y Destino
              </h2>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void processUploadedVideoFile(file);
                e.currentTarget.value = '';
              }}
            />

            <button
              type="button"
              disabled={isAnalyzing}
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              {isAnalyzing ? 'Procesando vídeo...' : 'Subir Vídeo (MP4 / MOV)'}
            </button>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded p-2.5 space-y-1.5">
            <label className="block text-[11px] font-semibold text-slate-700">
              O seleccione una secuencia industrial de referencia:
            </label>
            <div className="flex items-center gap-2">
              <select
                value={selectedSampleId}
                onChange={(e) => handleSelectSampleCase(e.target.value as CeneaSampleCaseId)}
                className="flex-1 min-h-[38px] rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
              >
                {CENEA_SAMPLE_VIDEOS_CATALOG.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.shortLabel}
                  </option>
                ))}
              </select>
              {sourceMode === 'sample' && (
                <button
                  type="button"
                  onClick={() => setIsPlayingCycle3D((p) => !p)}
                  className={`min-h-[38px] inline-flex items-center gap-1 px-3 py-1.5 rounded border text-xs font-semibold cursor-pointer ${
                    isPlayingCycle3D
                      ? 'bg-amber-600 text-white border-amber-700'
                      : 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
                  }`}
                >
                  {isPlayingCycle3D ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isPlayingCycle3D ? 'Pausar' : 'Ciclo 3D'}
                </button>
              )}
            </div>
          </div>

          {isAnalyzing && (
            <div className="p-3 rounded border border-sky-200 bg-sky-50 text-xs text-sky-950 flex items-center gap-2.5">
              <RefreshCw className="w-4 h-4 text-sky-700 animate-spin shrink-0" />
              <span className="font-medium">{analysisProgressMsg}</span>
            </div>
          )}

          {sourceMode === 'upload' && extractedFrames.length > 0 ? (
            <div className="space-y-3">
              {/* Ambos fotogramas reales lado a lado: 1. Toma de Carga y 2. Destino */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div
                  ref={frameOverlayRef}
                  onClick={() => setActivePostureRole('origin')}
                  className={`rounded border p-2 space-y-1.5 cursor-pointer ${
                    activePostureRole === 'origin'
                      ? 'border-sky-600 bg-sky-50/40'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <strong className="text-sky-900">1. Toma de Carga (Origen)</strong>
                    <span className="tabular-nums text-slate-600">
                      t = {(originFrame?.timeSec ?? 0).toFixed(2)} s
                    </span>
                  </div>
                  <div className="relative rounded overflow-hidden bg-slate-950 h-44 flex items-center justify-center">
                    {originFrame && (
                      <img
                        src={originFrame.dataUrl}
                        alt="Fotograma real Toma de Carga"
                        className="max-h-full max-w-full object-contain"
                        draggable={false}
                      />
                    )}
                    {showGravityAnchor && (
                      <svg
                        viewBox="0 0 1000 600"
                        preserveAspectRatio="none"
                        onPointerMove={handlePlumbPointerMove}
                        onPointerUp={() => setDraggingPlumbPart(null)}
                        className="absolute inset-0 w-full h-full touch-none"
                      >
                        <line
                          x1={plumbAnchor.top.x * 1000}
                          y1={plumbAnchor.top.y * 600}
                          x2={plumbAnchor.bottom.x * 1000}
                          y2={plumbAnchor.bottom.y * 600}
                          stroke="#10b981"
                          strokeWidth="4"
                        />
                        <circle
                          cx={plumbAnchor.top.x * 1000}
                          cy={plumbAnchor.top.y * 600}
                          r="14"
                          fill="#0f172a"
                          stroke="#10b981"
                          strokeWidth="4"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setDraggingPlumbPart('top');
                            e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
                          }}
                          className="cursor-grab"
                        />
                        <circle
                          cx={plumbAnchor.bottom.x * 1000}
                          cy={plumbAnchor.bottom.y * 600}
                          r="14"
                          fill="#10b981"
                          stroke="#ffffff"
                          strokeWidth="4"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setDraggingPlumbPart('bottom');
                            e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
                          }}
                          className="cursor-grab"
                        />
                      </svg>
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-slate-700 tabular-nums">
                    H={invisibleParams.horizontalReachCm} cm · V={vOriginCm} cm · Tronco{' '}
                    {origArt.tronco.flexion_extension_grados}°
                  </div>
                </div>

                <div
                  onClick={() => setActivePostureRole('dest')}
                  className={`rounded border p-2 space-y-1.5 cursor-pointer ${
                    activePostureRole === 'dest'
                      ? 'border-emerald-600 bg-emerald-50/40'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <strong className="text-emerald-900">2. Destino de Carga</strong>
                    <span className="tabular-nums text-slate-600">
                      t = {(destFrame?.timeSec ?? 0).toFixed(2)} s
                    </span>
                  </div>
                  <div className="rounded overflow-hidden bg-slate-950 h-44 flex items-center justify-center">
                    {destFrame && (
                      <img
                        src={destFrame.dataUrl}
                        alt="Fotograma real Destino"
                        className="max-h-full max-w-full object-contain"
                        draggable={false}
                      />
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-slate-700 tabular-nums">
                    H={hDestCm} cm · V={vDestCm} cm · Tronco{' '}
                    {destArt.tronco.flexion_extension_grados}°
                  </div>
                </div>
              </div>

              {/* Selector de qué postura cambiar al hacer clic en la tira de fotogramas */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-100 rounded px-2.5 py-1.5 border border-slate-200">
                <span>
                  Clic en fotograma asigna:{' '}
                  <strong>
                    {activePostureRole === 'origin' ? '1. Toma de Carga' : '2. Destino'}
                  </strong>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActivePostureRole('origin')}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                      activePostureRole === 'origin'
                        ? 'bg-sky-700 text-white'
                        : 'bg-white border border-slate-300 text-slate-700'
                    }`}
                  >
                    Elegir Toma (O)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePostureRole('dest')}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                      activePostureRole === 'dest'
                        ? 'bg-emerald-700 text-white'
                        : 'bg-white border border-slate-300 text-slate-700'
                    }`}
                  >
                    Elegir Destino (D)
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGravityAnchor((v) => !v)}
                    className="px-2 py-0.5 rounded bg-white border border-slate-300 text-[11px] font-mono text-slate-700 cursor-pointer"
                  >
                    0° ({verticalCalibrationDeg >= 0 ? '+' : ''}
                    {verticalCalibrationDeg.toFixed(1)}°)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-6 gap-1.5">
                {extractedFrames.map((f, idx) => {
                  const isOrig = idx === originFrameIdx;
                  const isDest = idx === destFrameIdx;
                  return (
                    <button
                      key={f.index}
                      type="button"
                      onClick={() => {
                        if (activePostureRole === 'origin') {
                          setOriginFrameIdx(idx);
                          setRawOriginTwinJson((p) => ({
                            ...p,
                            fotograma_critico_segundo: f.timeSec,
                          }));
                        } else {
                          setDestFrameIdx(idx);
                          setRawDestTwinJson((p) => ({
                            ...p,
                            fotograma_critico_segundo: f.timeSec,
                          }));
                        }
                      }}
                      className={`relative rounded overflow-hidden border text-left cursor-pointer ${
                        isOrig
                          ? 'border-sky-600 ring-2 ring-sky-500/40'
                          : isDest
                            ? 'border-emerald-600 ring-2 ring-emerald-500/40'
                            : 'border-slate-300 opacity-80 hover:opacity-100'
                      }`}
                    >
                      <img src={f.dataUrl} alt={f.timestamp} className="w-full h-11 object-cover block" />
                      <span className="block bg-slate-900/90 text-white font-mono text-[9.5px] px-1 py-0.5 tabular-nums truncate">
                        {f.timeSec.toFixed(1)}s{isOrig ? ' [TOMA]' : isDest ? ' [DEST]' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex-1 rounded border border-dashed border-slate-300 bg-slate-50 p-4 flex flex-col justify-between gap-3">
              <div className="space-y-1.5">
                <div className="font-mono text-xs font-semibold text-slate-800">
                  SECUENCIA INDUSTRIAL ACTIVA · TOMA DE CARGA Y DESTINO
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  {selectedSample.taskSummary}
                </p>
                <p className="text-xs text-slate-600">
                  Suba su vídeo MP4/MOV arriba para extraer automáticamente las <strong>2 fotografías reales del operario (Toma de Carga y Destino)</strong> junto con las <strong>2 réplicas exactas del Avatar 3D</strong> para el informe.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs bg-white border border-slate-200 rounded p-2.5 font-mono tabular-nums">
                <div>
                  <span className="block text-[10px] text-slate-500 font-sans">1. Toma de Carga (Origen)</span>
                  <strong className="text-sky-900">
                    H={invisibleParams.horizontalReachCm} cm · V={vOriginCm} cm · Tronco {origArt.tronco.flexion_extension_grados}°
                  </strong>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500 font-sans">2. Destino de Carga</span>
                  <strong className="text-emerald-900">
                    H={hDestCm} cm · V={vDestCm} cm · Tronco {destArt.tronco.flexion_extension_grados}°
                  </strong>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* COLUMNA DERECHA (7 cols): DOBLE AVATAR 3D SINCRONIZADO (1. TOMA DE CARGA + 2. DESTINO) */}
        <section className="xl:col-span-7 bg-white border border-slate-300 rounded-md p-4 space-y-3 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
            <div>
              <span className="font-mono text-xs font-bold text-emerald-800">
                2. Gemelo Digital 3D — Visualización Simultánea de Toma de Carga y Destino
              </span>
              <h2 className="text-sm font-bold text-slate-900">
                Haga clic en cualquiera de las dos posturas 3D para refinar sus nodos con el ratón
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'sagittal_right', label: 'Sagital' },
                  { id: 'frontal', label: 'Frontal' },
                  { id: 'isometric', label: '3/4' },
                ] as Array<{ id: CameraPreset; label: string }>
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setCameraPreset(preset.id);
                    setOrbit(DEFAULT_ORBIT_OVERRIDE);
                  }}
                  className={`min-h-[34px] px-2.5 py-1 rounded border text-xs font-semibold cursor-pointer ${
                    cameraPreset === preset.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {preset.label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setShow3DJointGizmos((v) => !v)}
                className={`min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded border text-xs font-semibold cursor-pointer ${
                  show3DJointGizmos
                    ? 'bg-violet-700 text-white border-violet-800'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                <Move3d className="w-3.5 h-3.5" />
                Nodos Libres
              </button>

              <button
                type="button"
                onClick={() => setShow3DGoniometerOverlay((v) => !v)}
                className={`min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded border text-xs font-semibold cursor-pointer ${
                  show3DGoniometerOverlay
                    ? 'bg-sky-700 text-white border-sky-800'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5" />
                Goniómetro 3D
              </button>

              <button
                type="button"
                onClick={() => setOrbit(DEFAULT_ORBIT_OVERRIDE)}
                className="min-h-[34px] p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
                title="Restablecer cámara"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Dos visores 3D simultáneos: Postura 1 (Toma de Carga) y Postura 2 (Destino) */}
          <div className="relative grid grid-cols-1 md:grid-cols-2 gap-3 flex-1">
            {/* Avatar 1: Toma de Carga */}
            <div
              onClick={() => setActivePostureRole('origin')}
              className={`rounded border p-2 flex flex-col gap-2 ${
                activePostureRole === 'origin'
                  ? 'border-sky-600 bg-sky-50/25'
                  : 'border-slate-300 bg-slate-50/60'
              }`}
            >
              <div className="flex items-center justify-between text-xs px-1">
                <strong className="text-sky-900">Postura 1 · Toma de Carga (Origen)</strong>
                <span className="font-mono text-[11px] tabular-nums text-slate-700">
                  L4/L5: {originBiomechReport.l4l5CompressionN} N
                </span>
              </div>
              <div className="flex-1 min-h-[300px] rounded border border-slate-200 bg-white overflow-hidden flex items-center justify-center">
                <canvas
                  ref={originAvatarCanvasRef}
                  onPointerDown={(e) => handleAvatarPointerDown('origin', e)}
                  onPointerMove={(e) => handleAvatarPointerMove('origin', e)}
                  onPointerUp={handleAvatarPointerUp}
                  onPointerCancel={handleAvatarPointerUp}
                  className="w-full h-full max-h-[360px] object-contain touch-none cursor-grab active:cursor-grabbing"
                />
              </div>
              <div className="grid grid-cols-4 gap-1 text-[11px] font-mono tabular-nums text-center bg-white border border-slate-200 rounded py-1 px-1.5">
                <span>Tr {origArt.tronco.flexion_extension_grados}°</span>
                <span>Ho {origArt.hombro_derecho.flexion_anteroposterior_grados}°</span>
                <span>Co {origArt.codo_derecho.flexion_extension_grados}°</span>
                <span>Ro {origArt.rodilla_derecha.flexion_extension_grados}°</span>
              </div>
            </div>

            {/* Avatar 2: Destino */}
            <div
              onClick={() => setActivePostureRole('dest')}
              className={`rounded border p-2 flex flex-col gap-2 ${
                activePostureRole === 'dest'
                  ? 'border-emerald-600 bg-emerald-50/25'
                  : 'border-slate-300 bg-slate-50/60'
              }`}
            >
              <div className="flex items-center justify-between text-xs px-1">
                <strong className="text-emerald-900">Postura 2 · Destino de Carga</strong>
                <span className="font-mono text-[11px] tabular-nums text-slate-700">
                  L4/L5: {destBiomechReport.l4l5CompressionN} N
                </span>
              </div>
              <div className="flex-1 min-h-[300px] rounded border border-slate-200 bg-white overflow-hidden flex items-center justify-center">
                <canvas
                  ref={destAvatarCanvasRef}
                  onPointerDown={(e) => handleAvatarPointerDown('dest', e)}
                  onPointerMove={(e) => handleAvatarPointerMove('dest', e)}
                  onPointerUp={handleAvatarPointerUp}
                  onPointerCancel={handleAvatarPointerUp}
                  className="w-full h-full max-h-[360px] object-contain touch-none cursor-grab active:cursor-grabbing"
                />
              </div>
              <div className="grid grid-cols-4 gap-1 text-[11px] font-mono tabular-nums text-center bg-white border border-slate-200 rounded py-1 px-1.5">
                <span>Tr {destArt.tronco.flexion_extension_grados}°</span>
                <span>Ho {destArt.hombro_derecho.flexion_anteroposterior_grados}°</span>
                <span>Co {destArt.codo_derecho.flexion_extension_grados}°</span>
                <span>Ro {destArt.rodilla_derecha.flexion_extension_grados}°</span>
              </div>
            </div>

            {show3DGoniometerOverlay && (
              <InteractivePhotoGoniometer
                transparentOverlay
                onApplyAngle={(deg) => {
                  if (!selectedJoint3D) return;
                  const setter =
                    activePostureRole === 'origin' ? setRawOriginTwinJson : setRawDestTwinJson;
                  setter((prev) => {
                    const nextArt = JSON.parse(
                      JSON.stringify(
                        prev.sincronizacion_avatar_3d.articulaciones_principales,
                      ),
                    );
                    if (selectedJoint3D === 'l5s1' || selectedJoint3D === 'c7') {
                      nextArt.tronco.flexion_extension_grados = deg;
                    } else if (selectedJoint3D === 'shoulderR') {
                      nextArt.hombro_derecho.flexion_anteroposterior_grados = deg;
                    } else if (selectedJoint3D === 'elbowR' || selectedJoint3D === 'wristR') {
                      nextArt.codo_derecho.flexion_extension_grados = deg;
                    } else if (selectedJoint3D === 'hipR') {
                      nextArt.cadera_derecha.flexion_extension_grados = deg;
                    } else if (selectedJoint3D === 'kneeR') {
                      nextArt.rodilla_derecha.flexion_extension_grados = deg;
                    }
                    return {
                      ...prev,
                      sincronizacion_avatar_3d: {
                        ...prev.sincronizacion_avatar_3d,
                        articulaciones_principales: sanitizeErgonizaAngles(nextArt),
                      },
                    };
                  });
                }}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
            <span>
              Editando actualmente:{' '}
              <strong>
                {activePostureRole === 'origin' ? 'Postura 1 (Toma de Carga)' : 'Postura 2 (Destino)'}
              </strong>
              . Ambas posturas se exportan juntas al informe.
            </span>
            <div className="flex items-center gap-2">
              <label className="font-semibold text-slate-700">Objeto en escena:</label>
              <select
                value={activeProp3D}
                onChange={(e) => setActiveProp3D(e.target.value as ScenePropType)}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
              >
                <option value="none">Sin objeto</option>
                <option value="box_load">Caja en manos</option>
                <option value="pallet_jack_rack">Tarima + Estantería</option>
                <option value="work_desk_support">Mesa de apoyo bajo codo</option>
                <option value="chair">Silla de trabajo</option>
                <option value="bin_to_cart">Contenedor Bin + Carro</option>
              </select>
            </div>
          </div>
        </section>
      </div>

      {/* PASO 3: CARGA DE DATOS CON IMAGEN GUÍA ACOTADA (H cm, V Origen cm, V Destino cm, D cm) + SALIDA JSON */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-7 bg-white border border-slate-300 rounded-md p-4 space-y-3.5">
          <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-2.5">
            <div>
              <span className="font-mono text-xs font-bold text-amber-800">
                3. Carga de Datos con Imagen Guía (H cm, V Origen cm, V Destino cm y Peso kg)
              </span>
              <h2 className="text-sm font-bold text-slate-900">
                Guía Gráfica Directa sobre Imagen para Interpretar Qué Medir en Centímetros
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-600 tabular-nums">
              {missingInvisibleList.length === 0 ? 'Datos completos' : `${missingInvisibleList.length} por revisar`}
            </span>
          </div>

          {/* Imagen Guía Acotada indicando H (cm), Vo (cm), Vd (cm) y D (cm) directamente sobre el esquema */}
          <NioshGeometryGuide
            hCm={
              activePostureRole === 'origin'
                ? invisibleParams.horizontalReachCm
                : hDestCm
            }
            vOriginCm={vOriginCm}
            vDestCm={vDestCm}
            asymmetryDeg={Math.round(
              Math.abs(
                activeEffectiveTwinJson.sincronizacion_avatar_3d.articulaciones_principales.tronco
                  .rotacion_axial_grados,
              ),
            )}
            loadKg={effectiveLoadForCalc}
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div>
              <label className="block font-semibold text-slate-800 mb-1">Peso Carga L (kg) *</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={invisibleParams.loadMassKg === null ? '' : invisibleParams.loadMassKg}
                onChange={(e) => {
                  const raw = e.target.value;
                  setInvisibleParams((p) => ({
                    ...p,
                    loadMassKg: raw === '' ? null : Math.max(0, Number(raw)),
                  }));
                }}
                className="w-full min-h-[38px] rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono tabular-nums text-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-red-800 mb-1">H Toma Origen (cm)</label>
              <input
                type="number"
                min={20}
                max={85}
                value={invisibleParams.horizontalReachCm}
                onChange={(e) =>
                  setInvisibleParams((p) => ({
                    ...p,
                    horizontalReachCm: Math.max(20, Math.min(85, Number(e.target.value) || 25)),
                  }))
                }
                className="w-full min-h-[38px] rounded border border-red-300 bg-red-50/30 px-2.5 py-1.5 font-mono tabular-nums text-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-sky-900 mb-1">V Toma Origen (cm)</label>
              <input
                type="number"
                min={0}
                max={190}
                value={vOriginCm}
                onChange={(e) => setVOriginCm(Math.max(0, Math.min(190, Number(e.target.value) || 0)))}
                className="w-full min-h-[38px] rounded border border-sky-300 bg-sky-50/30 px-2.5 py-1.5 font-mono tabular-nums text-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-emerald-900 mb-1">V Destino (cm)</label>
              <input
                type="number"
                min={0}
                max={190}
                value={vDestCm}
                onChange={(e) => setVDestCm(Math.max(0, Math.min(190, Number(e.target.value) || 0)))}
                className="w-full min-h-[38px] rounded border border-emerald-300 bg-emerald-50/30 px-2.5 py-1.5 font-mono tabular-nums text-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-emerald-900 mb-1">H Destino (cm)</label>
              <input
                type="number"
                min={20}
                max={85}
                value={hDestCm}
                onChange={(e) => setHDestCm(Math.max(20, Math.min(85, Number(e.target.value) || 25)))}
                className="w-full min-h-[38px] rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono tabular-nums text-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-800 mb-1">Frecuencia (lev/min)</label>
              <input
                type="number"
                min={0.1}
                max={18}
                step={0.5}
                value={invisibleParams.frequencyPerMin}
                onChange={(e) =>
                  setInvisibleParams((p) => ({
                    ...p,
                    frequencyPerMin: Math.max(0.1, Math.min(18, Number(e.target.value) || 1)),
                  }))
                }
                className="w-full min-h-[38px] rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono tabular-nums text-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-800 mb-1">Estatura Operario (cm)</label>
              <input
                type="number"
                min={142}
                max={208}
                value={invisibleParams.statureCm}
                onChange={(e) =>
                  setInvisibleParams((p) => ({
                    ...p,
                    statureCm: Math.max(142, Math.min(208, Number(e.target.value) || 172)),
                  }))
                }
                className="w-full min-h-[38px] rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono tabular-nums text-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-800 mb-1">Agarre Mano-Carga</label>
              <select
                value={invisibleParams.gripCoupling}
                onChange={(e) =>
                  setInvisibleParams((p) => ({
                    ...p,
                    gripCoupling: e.target.value as 'bueno' | 'regular' | 'malo',
                  }))
                }
                className="w-full min-h-[38px] rounded border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900"
              >
                <option value="bueno">Bueno (Asas óptimas)</option>
                <option value="regular">Regular</option>
                <option value="malo">Malo (Sin asas)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-800 mb-1">Sexo Biológico</label>
              <select
                value={invisibleParams.sex}
                onChange={(e) =>
                  setInvisibleParams((p) => ({ ...p, sex: e.target.value as BiologicalSex }))
                }
                className="w-full min-h-[38px] rounded border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900"
              >
                <option value="masculino">Masculino</option>
                <option value="femenino">Femenino</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-800 mb-1">Peso Operario (kg)</label>
              <input
                type="number"
                min={42}
                max={145}
                value={invisibleParams.bodyMassKg}
                onChange={(e) =>
                  setInvisibleParams((p) => ({
                    ...p,
                    bodyMassKg: Math.max(42, Math.min(145, Number(e.target.value) || 75)),
                  }))
                }
                className="w-full min-h-[38px] rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono tabular-nums text-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-800 mb-1">Complexión</label>
              <select
                value={invisibleParams.complexion}
                onChange={(e) =>
                  setInvisibleParams((p) => ({
                    ...p,
                    complexion: e.target.value as OperatorComplexion,
                  }))
                }
                className="w-full min-h-[38px] rounded border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900"
              >
                <option value="delgada_p5">Delgada / P5</option>
                <option value="media_p50">Media / P50</option>
                <option value="robusta_p95">Robusta / P95</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setInvisibleParams((p) => ({
                    ...p,
                    loadMassKg: p.loadMassKg ?? 15,
                    userConfirmedInvisibleParams: true,
                  }));
                  setStatusNotice({
                    tone: 'success',
                    text: 'Cotas H/V y masa confirmadas para Toma de Carga y Destino.',
                  });
                }}
                className="w-full min-h-[38px] inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                Validar Datos
              </button>
            </div>
          </div>
        </section>

        {/* PASO 4: SALIDA JSON ESTRICTA DE LA POSTURA ACTIVA */}
        <section className="lg:col-span-5 bg-slate-950 text-slate-100 border border-slate-800 rounded-md p-4 space-y-3 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
            <div>
              <span className="font-mono text-xs font-bold text-emerald-400">
                4. Salida JSON Estricto ({activePostureRole === 'origin' ? 'Toma de Carga' : 'Destino'})
              </span>
              <h2 className="text-sm font-bold text-white">
                Sincronización Exacta del Avatar 3D
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setJsonDraftText(formattedStrictJsonString);
                  setJsonEditorOpen((o) => !o);
                }}
                className="min-h-[32px] inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-200 cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5" />
                {jsonEditorOpen ? 'Ver' : 'Editar'}
              </button>

              <button
                type="button"
                onClick={() => void handleCopyStrictJson()}
                className="min-h-[32px] inline-flex items-center gap-1 px-2 py-1 rounded border border-emerald-600/60 bg-emerald-950 hover:bg-emerald-900 text-xs font-semibold text-emerald-200 cursor-pointer"
              >
                {copiedJsonBadge ? <Check className="w-3.5 h-3.5" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
                {copiedJsonBadge ? 'Copiado' : 'Copiar'}
              </button>

              <button
                type="button"
                onClick={handleDownloadStrictJson}
                className="min-h-[32px] inline-flex items-center gap-1 px-2 py-1 rounded border border-sky-600/60 bg-sky-950 hover:bg-sky-900 text-xs font-semibold text-sky-200 cursor-pointer"
              >
                <FileJson className="w-3.5 h-3.5" />
                .json
              </button>
            </div>
          </div>

          {jsonEditorOpen ? (
            <div className="flex-1 flex flex-col gap-2">
              <textarea
                value={jsonDraftText}
                onChange={(e) => setJsonDraftText(e.target.value)}
                rows={13}
                spellCheck={false}
                className="w-full flex-1 rounded border border-slate-700 bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-emerald-300"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setJsonEditorOpen(false)}
                  className="px-3 py-1.5 rounded border border-slate-700 text-xs text-slate-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleApplyEditedJson}
                  className="px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                >
                  Aplicar al Avatar 3D
                </button>
              </div>
            </div>
          ) : (
            <pre className="flex-1 max-h-[370px] overflow-auto rounded border border-slate-800 bg-slate-900/90 p-3 font-mono text-[11px] leading-relaxed text-emerald-300 select-all tabular-nums">
              {formattedStrictJsonString}
            </pre>
          )}
        </section>
      </div>

      {/* NUEVA SECCIÓN: EVALUACIÓN DE MOVIMIENTOS REPETITIVOS POR CARGA DE VÍDEO (OCRA CHECK LIST, JSI, NAM 295) */}
      <section className="bg-white border border-slate-300 rounded-md p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
          <div>
            <span className="font-mono text-xs font-bold text-violet-800">
              5. Evaluación de Movimientos Repetitivos desde Carga de Vídeo
            </span>
            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              Extracción de Acciones Técnicas, Ciclo T (s), Tiempos Angulares MMSS, OCRA Check List, JSI y NAM
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-600 tabular-nums">
            Ciclo medido: {repetitiveMetrics.cycleDurationSec} s · {repetitiveMetrics.actionsPerMinR} acc/min
          </span>
        </div>

        <RepetitiveCycleAndAnglesGuide methodName="Análisis de Movimientos Repetitivos por Vídeo (OCRA / JSI / NAM)" />

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Ciclo T (seg)</label>
            <input
              type="number"
              min={1}
              step={0.5}
              value={repetitiveMetrics.cycleDurationSec}
              onChange={(e) =>
                setRepetitiveMetrics((m) => ({
                  ...m,
                  cycleDurationSec: Math.max(1, Number(e.target.value) || 1),
                }))
              }
              className="w-full rounded border border-slate-300 px-2 py-1.5 font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Acc/min Der.</label>
            <input
              type="number"
              min={1}
              step={1}
              value={repetitiveMetrics.actionsPerMinR}
              onChange={(e) =>
                setRepetitiveMetrics((m) => ({
                  ...m,
                  actionsPerMinR: Math.max(1, Number(e.target.value) || 1),
                }))
              }
              className="w-full rounded border border-slate-300 px-2 py-1.5 font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Acc/min Izq.</label>
            <input
              type="number"
              min={0}
              step={1}
              value={repetitiveMetrics.actionsPerMinL}
              onChange={(e) =>
                setRepetitiveMetrics((m) => ({
                  ...m,
                  actionsPerMinL: Math.max(0, Number(e.target.value) || 0),
                }))
              }
              className="w-full rounded border border-slate-300 px-2 py-1.5 font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Esfuerzo/ciclo (s)</label>
            <input
              type="number"
              min={0.2}
              step={0.2}
              value={repetitiveMetrics.effortDurationSec}
              onChange={(e) =>
                setRepetitiveMetrics((m) => ({
                  ...m,
                  effortDurationSec: Math.max(0.2, Number(e.target.value) || 1),
                }))
              }
              className="w-full rounded border border-slate-300 px-2 py-1.5 font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">% Hombro &gt;80°</label>
            <input
              type="number"
              min={0}
              max={100}
              value={repetitiveMetrics.pctShoulderHigh}
              onChange={(e) =>
                setRepetitiveMetrics((m) => ({
                  ...m,
                  pctShoulderHigh: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                }))
              }
              className="w-full rounded border border-slate-300 px-2 py-1.5 font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">% Muñeca &gt;45°</label>
            <input
              type="number"
              min={0}
              max={100}
              value={repetitiveMetrics.pctWristAwkward}
              onChange={(e) =>
                setRepetitiveMetrics((m) => ({
                  ...m,
                  pctWristAwkward: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                }))
              }
              className="w-full rounded border border-slate-300 px-2 py-1.5 font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Escala Borg (0–10)</label>
            <select
              value={borgPeakScore}
              onChange={(e) => setBorgPeakScore(Number(e.target.value))}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 font-mono"
            >
              <option value={1}>1 · Muy ligero</option>
              <option value={2}>2 · Ligero</option>
              <option value={3}>3 · Moderado</option>
              <option value={4}>4 · Algo fuerte</option>
              <option value={5}>5 · Fuerte</option>
              <option value={7}>7 · Muy fuerte</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Agarre Mano-Dedos</label>
            <select
              value={distalGripType}
              onChange={(e) =>
                setDistalGripType(e.target.value as 'power' | 'pinch_33' | 'pinch_50' | 'pinch_80')
              }
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5"
            >
              <option value="power">Potencia óptimo</option>
              <option value="pinch_33">Pinza / gancho 1/3</option>
              <option value="pinch_50">Pinza / gancho 50%</option>
              <option value="pinch_80">Pinza / gancho &gt;80%</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="rounded border border-slate-200 bg-slate-50 p-3 flex items-center justify-between">
            <div>
              <div className="font-semibold text-slate-700">Check List OCRA (Vídeo)</div>
              <div className="text-slate-500">{ocraEvalSummary.riskLabel}</div>
            </div>
            <div className="font-mono text-base font-bold text-slate-900 tabular-nums">
              {ocraEvalSummary.primaryScoreText}
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 p-3 flex items-center justify-between">
            <div>
              <div className="font-semibold text-slate-700">Job Strain Index — JSI</div>
              <div className="text-slate-500">{jsiEvalSummary.riskLabel}</div>
            </div>
            <div className="font-mono text-base font-bold text-slate-900 tabular-nums">
              {jsiEvalSummary.primaryScoreText}
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 p-3 flex items-center justify-between">
            <div>
              <div className="font-semibold text-slate-700">NAM Res. MTESS 295/03</div>
              <div className="text-slate-500">{namEvalSummary.riskLabel}</div>
            </div>
            <div className="font-mono text-base font-bold text-slate-900 tabular-nums">
              {namEvalSummary.primaryScoreText}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100 text-xs text-slate-700">
          <span className="font-semibold text-slate-900">
            Pestañas a generar e incluir en el Informe PDF/Word (con Fotos Reales + Avatar 3D):
          </span>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={emitNiosh}
              onChange={(e) => setEmitNiosh(e.target.checked)}
              className="rounded border-slate-300"
            />
            NIOSH (Toma y Destino)
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={emitReba}
              onChange={(e) => setEmitReba(e.target.checked)}
              className="rounded border-slate-300"
            />
            REBA 3D
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={emitOcraChecklist}
              onChange={(e) => setEmitOcraChecklist(e.target.checked)}
              className="rounded border-slate-300"
            />
            Check List OCRA (Repetitivos)
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={emitJsi}
              onChange={(e) => setEmitJsi(e.target.checked)}
              className="rounded border-slate-300"
            />
            JSI (Repetitivos)
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={emitNam295}
              onChange={(e) => setEmitNam295(e.target.checked)}
              className="rounded border-slate-300"
            />
            NAM Res. 295/03
          </label>
          <div className="ml-auto flex items-center gap-2">
            <span>Minutos repetitivos/turno:</span>
            <input
              type="number"
              min={30}
              max={600}
              value={netRepetitiveMinutes}
              onChange={(e) => setNetRepetitiveMinutes(Math.max(30, Number(e.target.value) || 360))}
              className="w-18 rounded border border-slate-300 px-2 py-1 font-mono tabular-nums"
            />
            <span>Sin pausa (h):</span>
            <select
              value={unrecoveredHours}
              onChange={(e) => setUnrecoveredHours(Number(e.target.value) as 0 | 2 | 3 | 4 | 6)}
              className="rounded border border-slate-300 bg-white px-2 py-1 font-mono"
            >
              <option value={0}>0 h</option>
              <option value={2}>2 h</option>
              <option value={3}>3 h</option>
              <option value={4}>4 h</option>
              <option value={6}>6 h</option>
            </select>
          </div>
        </div>
      </section>

      {/* PANEL CONSOLIDADO FINAL: COMPRESIÓN L4/L5, MOMENTOS ARTICULARES Y EMISIÓN DE INFORME CON FOTOS GARANTIZADAS */}
      <section className="bg-white border border-slate-300 rounded-md p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <span className="font-mono text-xs font-bold text-slate-600">
              6. Informe Técnico Consolidado (Fotos Reales + Réplicas Avatar 3D Exactas)
            </span>
            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              Compresión L4/L5, Momentos (%MVC), NIOSH, REBA y Movimientos Repetitivos
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isEmittingReport}
              onClick={() => void handleEmitCompleteEvaluation(false)}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5" />
              {isEmittingReport ? 'Generando Fotos y Pestañas...' : 'Enviar Pestañas y Fotos al Evaluador'}
            </button>

            <button
              type="button"
              disabled={isEmittingReport}
              onClick={() => void handleEmitCompleteEvaluation(true)}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" />
              Emitir Informe PDF Completo con Fotos
            </button>

            <button
              type="button"
              onClick={() => void onExportCurrentWord()}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              Exportar Word
            </button>

            {hasEmittedTabs && (
              <button
                type="button"
                onClick={onOpenGeneratedTabsInEvaluator}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-emerald-400 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-950 cursor-pointer"
              >
                Ver Previsualización en Evaluador →
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div
            className={`rounded border p-3 ${
              ergonizaBiomechReport.l4l5CompressionN >= ergonizaBiomechReport.l4l5CompressionLimitN
                ? 'border-rose-300 bg-rose-50/70'
                : ergonizaBiomechReport.l4l5CompressionN >=
                    ergonizaBiomechReport.l4l5CompressionLimitN * 0.78
                  ? 'border-amber-300 bg-amber-50/70'
                  : 'border-emerald-300 bg-emerald-50/60'
            }`}
          >
            <span className="block text-[11px] font-semibold text-slate-600">
              Compresión Discal L4/L5 Máx.
            </span>
            <div className="mt-1 font-mono text-xl font-bold text-slate-950 tabular-nums">
              {ergonizaBiomechReport.l4l5CompressionN} N
            </div>
            <span className="block text-[11px] text-slate-600 font-mono tabular-nums mt-0.5">
              Toma: {originBiomechReport.l4l5CompressionN} N · Dest: {destBiomechReport.l4l5CompressionN} N
            </span>
          </div>

          <div
            className={`rounded border p-3 ${
              ergonizaBiomechReport.l4l5ShearN >= 500
                ? 'border-rose-300 bg-rose-50/70'
                : 'border-slate-200 bg-slate-50'
            }`}
          >
            <span className="block text-[11px] font-semibold text-slate-600">
              Cizalladura Lumbar L4/L5
            </span>
            <div className="mt-1 font-mono text-xl font-bold text-slate-950 tabular-nums">
              {ergonizaBiomechReport.l4l5ShearN} N
            </div>
            <span className="block text-[11px] text-slate-600 font-mono tabular-nums mt-0.5">
              Umbral admisible: &lt; {ergonizaBiomechReport.l4l5ShearLimitN} N
            </span>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[11px] font-semibold text-slate-600">
              Ecuación NIOSH (Toma y Destino)
            </span>
            <div className="mt-1 font-mono text-xl font-bold text-slate-950 tabular-nums">
              {nioshEval.primaryScoreText}
            </div>
            <span className="block text-[11px] text-slate-600 truncate mt-0.5">
              {nioshEval.riskLabel}
            </span>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <span className="block text-[11px] font-semibold text-slate-600">
              Puntuación Postural REBA
            </span>
            <div className="mt-1 font-mono text-xl font-bold text-slate-950 tabular-nums">
              {rebaEval.primaryScoreText}
            </div>
            <span className="block text-[11px] text-slate-600 truncate mt-0.5">
              {rebaEval.riskLabel}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                <th className="py-2 px-3 font-semibold">Articulación Evaluada</th>
                <th className="py-2 px-3 font-semibold">Ángulos Sincronizados</th>
                <th className="py-2 px-3 font-semibold text-right">Momento Req. (N·m)</th>
                <th className="py-2 px-3 font-semibold text-right">Capacidad MVC (N·m)</th>
                <th className="py-2 px-3 font-semibold text-right">
                  %MVC (TLV ≤ {ergonizaBiomechReport.joints[0]?.acgihTlvPercentMvc}%)
                </th>
                <th className="py-2 px-3 font-semibold text-right">% Población Protegida</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {ergonizaBiomechReport.joints.map((j) => (
                <tr key={j.jointId} className="hover:bg-slate-50">
                  <td className="py-2 px-3 font-semibold text-slate-900">{j.jointLabel}</td>
                  <td className="py-2 px-3 font-mono text-[11px] text-slate-700 tabular-nums">
                    {j.angleSummary}
                  </td>
                  <td className="py-2 px-3 font-mono text-right font-semibold text-slate-900 tabular-nums">
                    {j.momentNm.toFixed(1)}
                  </td>
                  <td className="py-2 px-3 font-mono text-right text-slate-700 tabular-nums">
                    {j.mvcCapacityNm.toFixed(1)}
                  </td>
                  <td
                    className={`py-2 px-3 font-mono text-right font-bold tabular-nums ${
                      j.status === 'critico'
                        ? 'text-rose-700'
                        : j.status === 'condicional'
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                    }`}
                  >
                    {j.percentMvc.toFixed(1)}%
                  </td>
                  <td className="py-2 px-3 font-mono text-right text-slate-800 tabular-nums">
                    {j.protectedPopulationPct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-3">
          <strong>Síntesis biomecánica:</strong> {ergonizaBiomechReport.technicalSummary}
        </p>
      </section>

      {showErgonizaPdfModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white rounded-md border border-slate-300 w-full max-w-5xl h-[86vh] flex flex-col overflow-hidden shadow-xl">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen className="w-4 h-4 text-sky-400 shrink-0" />
                <span className="text-xs sm:text-sm font-bold truncate">
                  Referencia Técnica: Modelización Biomecánica 3D de 16 Segmentos y 14 Articulaciones
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={ERGONIZA_MANUAL_PDF_URL}
                  download="Ergoniza_Intelligent_Bases_de_funcionamiento.pdf"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-sky-700 hover:bg-sky-600 text-xs font-semibold text-white"
                >
                  <Download className="w-3.5 h-3.5" />
                  Descargar PDF
                </a>
                <button
                  type="button"
                  onClick={() => setShowErgonizaPdfModal(false)}
                  className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <iframe
              src={ERGONIZA_MANUAL_PDF_URL}
              title="Manual de Bases Biomecánicas"
              className="flex-1 w-full border-0 bg-slate-100"
            />
          </div>
        </div>
      )}
    </div>
  );
};
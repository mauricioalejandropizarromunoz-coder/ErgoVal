import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  ArrowDownUp,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileDown,
  FileSpreadsheet,
  Film,
  Layers,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Upload,
  Video,
} from 'lucide-react';
import {
  GeneralStudyData,
  MethodEvaluationResult,
  MethodId,
  NioshData,
  RebaData,
  StudyPhoto,
  StudyTab,
} from '../types/ergonomics';
import { Panel3DSpec } from '../types/figurePlan';
import { createNewStudyTab } from '../utils/defaults';
import { evaluateStudyTab } from '../utils/calculations';
import { makeNeutralPose } from '../utils/figurePlanCatalog';
import {
  DEFAULT_ORBIT_OVERRIDE,
  ensureAvatarGlbLoaded,
  renderInteractivePose3DToCanvas,
} from '../utils/biomech3dRenderer';
import {
  TrafficLightColor,
  TrafficLightSummary,
  buildVideoBiomechTrafficLight,
  describeNioshTrajectory,
} from '../utils/trafficLightAlerts';
import { getSeverityStyles } from './StudyTabWorkspace';

export const DEFAULT_VIDEO_SYSTEM_INSTRUCTION = `SYSTEM INSTRUCTION: EXTRACTOR DE VARIABLES BIOMECÁNICAS DESDE ARCHIVO DE VIDEO

Eres un sistema de visión por computador y estimación biomecánica 3D espacial. Tu tarea es analizar el video adjunto correspondiente a una tarea laboral de manipulación manual de cargas (levantamiento hacia estantería/mesa, descenso de carga desde altura mayor hacia altura menor, o traslado reversible) para extraer las variables geométricas y angulares necesarias como inputs para un software ergonómico externo.

REGLAS DE ANÁLISIS DE VIDEO:
1. No calcules multiplicadores, no apliques fórmulas normativas ni generes reportes de riesgo ergonómico. Tu objetivo es únicamente la extracción biomecánica y cinemática de datos desde el canal de video.
2. Analiza la secuencia temporal e identifica los timestamps exactos de los momentos críticos y el sentido real del desplazamiento vertical:
   - 'origen_timestamp': Momento exacto en que las manos sujetan la carga e inician la maniobra (puede ubicarse en el suelo/tarima si se levanta hacia una estantería, o en una estantería/plano alto si se baja la carga hacia una altura menor).
   - 'destino_timestamp': Momento exacto en que la carga llega a su punto final de deposición o colocación.
   - Ten en cuenta que en ciclos operativos reversibles (estiba y desestiba), el punto de origen puede actuar también como destino de la carga (y viceversa), por lo que debes reportar tanto 'v_origen_cm' como 'v_destino_cm' además de 'H_cm', 'V_cm' y 'D_cm'.
3. Estima las posiciones tridimensionales del esqueleto del operario (tomando como referencias la base de soporte en tobillos, el centro de masa de las muñecas, la zona lumbar L5/S1 y la columna C7) para calcular:
   - H (Distancia horizontal máxima o crítica en cm desde la proyección de la base de soporte en tobillos al agarre, además de h_origen_cm y h_destino_cm).
   - V (Distancia vertical en cm desde el suelo al agarre en el origen V_cm = v_origen_cm, y altura final en destino v_destino_cm).
   - D (Desplazamiento vertical total en cm |v_destino_cm - v_origen_cm|).
   - A (Ángulo de asimetría del torso/carga en grados).
   - Clasificación cinemática del movimiento ('levantamiento_suelo_a_estanteria' si v_destino_cm > v_origen_cm, 'descenso_altura_a_bajo' si v_origen_cm > v_destino_cm, o 'traslado_mismo_nivel').
   - Flexión articular de tronco, rodillas y codos en grados para el instante de mayor exigencia postural.

FORMATO DE SALIDA (ESTRICTAMENTE JSON):
Responde ÚNICAMENTE con el siguiente objeto JSON sin ningún texto adicional fuera del bloque:

{
  "status": "processed",
  "critical_events": {
    "origen_timestamp": "00:00.000",
    "destino_timestamp": "00:00.000"
  },
  "movement_analysis": {
    "direction": "levantamiento_suelo_a_estanteria",
    "v_origen_cm": 0.0,
    "v_destino_cm": 0.0,
    "h_origen_cm": 0.0,
    "h_destino_cm": 0.0,
    "trajectory_note": "Descripción concisa indicando si levanta desde nivel bajo a estantería o si baja desde altura mayor a menor, aclarando intercambiabilidad origen-destino."
  },
  "niosh_inputs": {
    "H_cm": 0.0,
    "V_cm": 0.0,
    "D_cm": 0.0,
    "A_deg": 0.0
  },
  "postural_angles_deg": {
    "trunk_flexion": 0.0,
    "knee_flexion": 0.0,
    "right_elbow": 0.0,
    "left_elbow": 0.0
  }
}`;

export type MovementDirectionCode =
  | 'levantamiento_suelo_a_estanteria'
  | 'descenso_altura_a_bajo'
  | 'traslado_mismo_nivel'
  | 'ciclo_bidireccional';

export type MovementModeHint = 'auto' | 'levantamiento' | 'descenso' | 'bidireccional';

export interface ExtractedVideoBiomechJson {
  status: 'processed';
  critical_events: {
    origen_timestamp: string;
    destino_timestamp: string;
  };
  movement_analysis?: {
    direction: MovementDirectionCode;
    v_origen_cm: number;
    v_destino_cm: number;
    h_origen_cm: number;
    h_destino_cm: number;
    trajectory_note: string;
  };
  niosh_inputs: {
    H_cm: number;
    V_cm: number;
    D_cm: number;
    A_deg: number;
  };
  postural_angles_deg: {
    trunk_flexion: number;
    knee_flexion: number;
    right_elbow: number;
    left_elbow: number;
  };
}

interface SampledFrame {
  timestamp: string;
  timeSec: number;
  mimeType: string;
  dataBase64: string;
  previewUrl: string;
}

interface EmittedBiomechReportBundle {
  extracted: ExtractedVideoBiomechJson;
  sampledCount: number;
  processingMs: number;
  originKeyframeUrl: string;
  destKeyframeUrl: string;
  origin3DUrl: string;
  dest3DUrl: string;
  nioshData: NioshData;
  nioshTab: StudyTab;
  rebaTab: StudyTab;
  nioshResult: MethodEvaluationResult;
  rebaResult: MethodEvaluationResult;
  trafficLight: TrafficLightSummary;
  pdfAutoEmitted: boolean;
  invertedCycle: boolean;
}

interface VideoBiomechExtractorProps {
  general: GeneralStudyData;
  onBackToEvaluator: () => void;
  onEmitTabsAndReport: (payload: {
    nioshTab: StudyTab;
    rebaTab: StudyTab;
    autoDownloadPdf: boolean;
  }) => Promise<void>;
  onExportCurrentPdf: () => Promise<void>;
  onExportCurrentWord: () => Promise<void>;
  onOpenGeneratedTabsInEvaluator: () => void;
}

function formatSecondsToTimestamp(sec: number): string {
  const safe = Math.max(0, Number.isFinite(sec) ? sec : 0);
  const mins = Math.floor(safe / 60);
  const rem = safe - mins * 60;
  const wholeSecs = Math.floor(rem);
  const ms = Math.min(999, Math.round((rem - wholeSecs) * 1000));
  return `${String(mins).padStart(2, '0')}:${String(wholeSecs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function parseTimestampToSeconds(ts: string, maxDurationSec: number): number {
  const trimmed = (ts || '').trim();
  const match = trimmed.match(/^(\d+):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (match) {
    const mins = parseInt(match[1], 10);
    const secs = parseInt(match[2], 10);
    const msStr = (match[3] || '0').padEnd(3, '0').slice(0, 3);
    const ms = parseInt(msStr, 10);
    const total = mins * 60 + secs + ms / 1000;
    return Math.max(0, Math.min(Math.max(0.1, maxDurationSec - 0.02), total));
  }
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return Math.max(0, Math.min(Math.max(0.1, maxDurationSec - 0.02), numeric));
  }
  return 0;
}

function seekVideoElement(video: HTMLVideoElement, targetSec: number): Promise<void> {
  return new Promise((resolve) => {
    const maxAllowed =
      Number.isFinite(video.duration) && video.duration > 0
        ? Math.max(0, video.duration - 0.01)
        : Math.max(0, targetSec);
    const clamped = Math.max(0, Math.min(maxAllowed, targetSec));
    if (Math.abs(video.currentTime - clamped) < 0.008 && video.readyState >= 2) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', finish);
      resolve();
    };
    const timer = window.setTimeout(finish, 950);
    video.addEventListener(
      'seeked',
      () => {
        window.clearTimeout(timer);
        finish();
      },
      { once: true },
    );
    try {
      video.currentTime = clamped;
    } catch {
      window.clearTimeout(timer);
      finish();
    }
  });
}

function captureVideoFrameDataUrl(
  video: HTMLVideoElement,
  timestampLabel: string,
  maxWidth = 640,
  format: 'image/jpeg' | 'image/png' = 'image/jpeg',
  stampTimestamp = true,
): string {
  const vw = Math.max(1, video.videoWidth || 640);
  const vh = Math.max(1, video.videoHeight || 480);
  const scale = Math.min(1, maxWidth / vw);
  const w = Math.max(160, Math.round(vw * scale));
  const h = Math.max(120, Math.round(vh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(video, 0, 0, w, h);

  // Estampar etiqueta temporal en esquina inferior derecha con ancho dinámico para NUNCA tapar rótulos superiores ni ángulos
  if (stampTimestamp) {
    ctx.save();
    ctx.font = '700 12px "IBM Plex Mono", monospace';
    const textLabel = `TS: ${timestampLabel}`;
    const textW = Math.ceil(ctx.measureText(textLabel).width);
    const boxW = Math.min(w - 16, textW + 18);
    const boxH = 25;
    const boxX = Math.max(8, w - boxW - 8);
    const boxY = Math.max(8, h - boxH - 8);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);
    ctx.fillStyle = '#f8fafc';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(textLabel, boxX + 9, boxY + boxH / 2 + 0.5);
    ctx.restore();
  }

  return format === 'image/jpeg' ? canvas.toDataURL('image/jpeg', 0.8) : canvas.toDataURL('image/png');
}

function needsImmediateTranscodeByFilename(file: File): boolean {
  const lower = file.name.toLowerCase();
  const mime = (file.type || '').toLowerCase();
  if (
    lower.endsWith('.mov') ||
    lower.endsWith('.qt') ||
    lower.endsWith('.hevc') ||
    lower.endsWith('.h265') ||
    lower.endsWith('.avi') ||
    lower.endsWith('.mkv') ||
    lower.endsWith('.3gp') ||
    lower.endsWith('.wmv') ||
    lower.endsWith('.m4v')
  ) {
    return true;
  }
  if (
    mime.includes('quicktime') ||
    mime.includes('matroska') ||
    mime.includes('msvideo') ||
    mime.includes('3gpp')
  ) {
    return true;
  }
  return false;
}

function getResolvedMovementHeights(extracted: ExtractedVideoBiomechJson): {
  vOrigCm: number;
  vDestCm: number;
  hOrigCm: number;
  hDestCm: number;
  dCm: number;
  direction: MovementDirectionCode;
  trajectoryNote: string;
} {
  const { H_cm, V_cm, D_cm } = extracted.niosh_inputs;
  const mov = extracted.movement_analysis;
  const vOrigCm = mov?.v_origen_cm ?? V_cm;
  const vDestCm = mov?.v_destino_cm ?? Math.min(195, Math.round((V_cm + D_cm) * 10) / 10);
  const hOrigCm = mov?.h_origen_cm ?? H_cm;
  const hDestCm = mov?.h_destino_cm ?? H_cm;
  const dCm = Math.max(5, Math.round(Math.abs(vDestCm - vOrigCm) * 10) / 10);

  const inferredDir: MovementDirectionCode =
    mov?.direction ||
    (vDestCm - vOrigCm >= 10
      ? 'levantamiento_suelo_a_estanteria'
      : vOrigCm - vDestCm >= 10
        ? 'descenso_altura_a_bajo'
        : 'traslado_mismo_nivel');

  const trajectoryNote =
    mov?.trajectory_note || describeNioshTrajectory(vOrigCm, vDestCm).technicalExplanation;

  return { vOrigCm, vDestCm, hOrigCm, hDestCm, dCm, direction: inferredDir, trajectoryNote };
}

/**
 * Construye el panel 3D adaptando la cinemática real tanto a LEVANTAMIENTO (suelo -> estantería)
 * como a DESCENSO (estantería alta -> suelo/nivel bajo) y evitando colisión de rótulos.
 */
function build3DPanelFromExtraction(
  extracted: ExtractedVideoBiomechJson,
  phase: 'origin' | 'destination',
  loadKg: number,
  vOrigOverride?: number,
  vDestOverride?: number,
  hOrigOverride?: number,
  hDestOverride?: number,
): Panel3DSpec {
  const resolved = getResolvedMovementHeights(extracted);
  const vOrig = vOrigOverride ?? resolved.vOrigCm;
  const vDest = vDestOverride ?? resolved.vDestCm;
  const hOrig = hOrigOverride ?? resolved.hOrigCm;
  const hDest = hDestOverride ?? resolved.hDestCm;
  const { A_deg } = extracted.niosh_inputs;
  const { trunk_flexion, knee_flexion, right_elbow, left_elbow } = extracted.postural_angles_deg;

  const isOrigin = phase === 'origin';
  const vPhaseCm = isOrigin ? vOrig : vDest;
  const hPhaseCm = isOrigin ? hOrig : hDest;
  const isLowerPoint = vPhaseCm <= Math.min(vOrig, vDest) + 8 && vPhaseCm < 68;
  const isHighShelfPoint = vPhaseCm >= 112;

  const trunkDeg = isLowerPoint
    ? trunk_flexion
    : isHighShelfPoint
      ? Math.max(4, Math.round(trunk_flexion * 0.16))
      : Math.max(8, Math.round(trunk_flexion * 0.34));

  const kneeDeg = isLowerPoint
    ? knee_flexion
    : isHighShelfPoint
      ? Math.max(4, Math.round(knee_flexion * 0.15))
      : Math.max(6, Math.round(knee_flexion * 0.25));

  const hipDeg = Math.round(kneeDeg * 0.68);

  const shoulderFlexDeg = isHighShelfPoint
    ? Math.max(76, Math.min(115, Math.round(62 + (vPhaseCm - 105) * 0.85)))
    : isLowerPoint
      ? Math.max(26, Math.min(82, Math.round(trunkDeg * 0.72 + (hPhaseCm - 25) * 0.5)))
      : Math.max(36, Math.min(92, Math.round(40 + (vPhaseCm - 65) * 0.65)));

  const elbowRDeg = isHighShelfPoint
    ? Math.max(48, Math.min(98, Math.round(right_elbow * 0.78)))
    : isLowerPoint
      ? right_elbow
      : Math.max(55, Math.min(108, Math.round(right_elbow * 0.88)));

  const elbowLDeg = isHighShelfPoint
    ? Math.max(48, Math.min(98, Math.round(left_elbow * 0.78)))
    : isLowerPoint
      ? left_elbow
      : Math.max(55, Math.min(108, Math.round(left_elbow * 0.88)));

  const twistDeg = isOrigin ? Math.round(A_deg * 0.45) : Math.round(A_deg);

  const posture = makeNeutralPose({
    trunkFlexionDeg: trunkDeg,
    trunkTwistDeg: twistDeg,
    neckFlexionDeg: isHighShelfPoint ? -8 : isLowerPoint ? Math.min(26, Math.round(trunkDeg * 0.32 + 8)) : 10,
    shoulderRFlexionDeg: shoulderFlexDeg,
    shoulderLFlexionDeg: shoulderFlexDeg,
    elbowRFlexionDeg: elbowRDeg,
    elbowLFlexionDeg: elbowLDeg,
    hipRFlexionDeg: hipDeg,
    hipLFlexionDeg: hipDeg,
    kneeRFlexionDeg: kneeDeg,
    kneeLFlexionDeg: kneeDeg,
    prop: 'box_load',
    loadKg,
    highlightGroup: 'l5s1_disc',
  });

  return {
    subTitle: isOrigin
      ? `Origen (${extracted.critical_events.origen_timestamp}) · H=${hPhaseCm} cm, V=${vPhaseCm} cm`
      : `Destino (${extracted.critical_events.destino_timestamp}) · H=${hPhaseCm} cm, V=${vPhaseCm} cm`,
    scoreBadge: isOrigin ? `Origen V=${vPhaseCm} cm` : `Destino V=${vPhaseCm} cm`,
    focusZone: 'full_body',
    cameraPreset: Math.abs(twistDeg) >= 22 && !isOrigin ? 'isometric' : 'sagittal_right',
    pose: posture,
    angleArcs: [
      {
        joint: 'l5s1',
        refType: 'vertical_up',
        toJoint: 'c7',
        radiusPx: 40,
        label: `Tronco ${trunkDeg}°`,
      },
      {
        joint: 'kneeR',
        refType: 'vertical_down',
        toJoint: 'ankleR',
        radiusPx: 36,
        label: `Rodilla ${kneeDeg}°`,
      },
    ],
    forceVectors: [
      {
        atJoint: 'handR',
        dx: 0,
        dy: 1,
        lengthPx: 40,
        label: `${loadKg} kg`,
      },
    ],
    dimensions: [
      {
        fromJoint: 'ankleR',
        toJoint: 'handR',
        axis: 'horizontal',
        label: `H = ${hPhaseCm} cm`,
      },
    ],
    noteBottom: isOrigin
      ? `Toma inicial V=${vPhaseCm} cm · Codos ${elbowRDeg}°/${elbowLDeg}°`
      : `Deposición V=${vPhaseCm} cm · D=${Math.round(Math.abs(vDest - vOrig) * 10) / 10} cm · A=${A_deg}°`,
  };
}

function mapExtractedToRebaData(
  extracted: ExtractedVideoBiomechJson,
  loadWeightKg: number,
  couplingQuality: 'bueno' | 'regular' | 'malo',
  vMaxCm: number,
  vMinCm: number,
  hWorstCm: number,
): RebaData {
  const { trunk_flexion, knee_flexion, right_elbow, left_elbow } = extracted.postural_angles_deg;
  const { A_deg } = extracted.niosh_inputs;

  let trunkPos: 1 | 2 | 3 | 4 = 1;
  if (Math.abs(trunk_flexion) <= 5) trunkPos = 1;
  else if (trunk_flexion < 0 || trunk_flexion <= 20) trunkPos = 2;
  else if (trunk_flexion <= 60) trunkPos = 3;
  else trunkPos = 4;

  const legsKneeFlexion: 0 | 1 | 2 = knee_flexion > 60 ? 2 : knee_flexion >= 30 ? 1 : 0;
  const loadForce: 0 | 1 | 2 = loadWeightKg > 10 ? 2 : loadWeightKg >= 5 ? 1 : 0;
  const couplingScore: 0 | 1 | 2 | 3 = couplingQuality === 'bueno' ? 0 : couplingQuality === 'regular' ? 1 : 2;

  const estUpperArmDeg =
    vMaxCm >= 125
      ? Math.min(115, 65 + (vMaxCm - 110) * 0.8)
      : Math.max(15, Math.min(110, trunk_flexion * 0.7 + (hWorstCm - 25) * 0.6));
  const upperArmPos: 1 | 2 | 3 | 4 =
    estUpperArmDeg <= 20 ? 1 : estUpperArmDeg <= 45 ? 2 : estUpperArmDeg <= 90 ? 3 : 4;

  const lowerArmR: 1 | 2 = right_elbow >= 60 && right_elbow <= 100 ? 1 : 2;
  const lowerArmL: 1 | 2 = left_elbow >= 60 && left_elbow <= 100 ? 1 : 2;
  const wristPos: 1 | 2 = vMinCm < 45 || vMaxCm > 135 || hWorstCm > 45 ? 2 : 1;

  return {
    evaluatedSide: 'ambos',
    trunkPos,
    trunkTwistedOrSide: A_deg >= 10,
    neckPos: trunk_flexion > 25 || vMaxCm > 140 ? 2 : 1,
    neckTwistedOrSide: A_deg >= 20,
    legsBase: 1,
    legsKneeFlexion,
    loadForce,
    shockForce: false,
    right: {
      upperArmPos,
      shoulderRaised: vMaxCm > 135,
      armAbducted: hWorstCm > 48,
      armSupported: false,
      lowerArmPos: lowerArmR,
      wristPos,
      wristTwistedOrDeviated: couplingQuality !== 'bueno',
      coupling: couplingScore,
    },
    left: {
      upperArmPos,
      shoulderRaised: vMaxCm > 135,
      armAbducted: hWorstCm > 48,
      armSupported: false,
      lowerArmPos: lowerArmL,
      wristPos,
      wristTwistedOrDeviated: couplingQuality !== 'bueno',
      coupling: couplingScore,
    },
    activityStatic: false,
    activityRepetitive: true,
    activityUnstableChanges: Math.abs(vMaxCm - vMinCm) >= 45,
  };
}

function getTrafficStyles(color: TrafficLightColor): {
  rowBg: string;
  dotBg: string;
  badgeText: string;
} {
  if (color === 'rojo') {
    return {
      rowBg: 'bg-red-50/90',
      dotBg: 'bg-red-600',
      badgeText: 'text-red-900 font-bold',
    };
  }
  if (color === 'ambar') {
    return {
      rowBg: 'bg-amber-50/90',
      dotBg: 'bg-amber-500',
      badgeText: 'text-amber-900 font-bold',
    };
  }
  return {
    rowBg: 'bg-emerald-50/90',
    dotBg: 'bg-emerald-600',
    badgeText: 'text-emerald-900 font-bold',
  };
}

export const VideoBiomechExtractor: React.FC<VideoBiomechExtractorProps> = ({
  general,
  onBackToEvaluator,
  onEmitTabsAndReport,
  onExportCurrentPdf,
  onExportCurrentWord,
  onOpenGeneratedTabsInEvaluator,
}) => {
  // Video file & player state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDurationSec, setVideoDurationSec] = useState<number>(0);
  const [currentPlaySec, setCurrentPlaySec] = useState<number>(0);
  const [isGeneratingTestVideo, setIsGeneratingTestVideo] = useState<boolean>(false);
  const [isNormalizingVideo, setIsNormalizingVideo] = useState<boolean>(false);
  const [normalizingNotice, setNormalizingNotice] = useState<string>('');
  const [videoWasNormalized, setVideoWasNormalized] = useState<boolean>(false);

  // Complementary ergonomic inputs (non-visual task variables)
  const [taskEvaluated, setTaskEvaluated] = useState<string>(
    'Manipulación manual de cajas entre nivel inferior y estantería de estiba',
  );
  const [movementModeHint, setMovementModeHint] = useState<MovementModeHint>('auto');
  const [loadWeightKg, setLoadWeightKg] = useState<number>(16);
  const [workerHeightCm, setWorkerHeightCm] = useState<number>(172);
  const [frequencyLiftsPerMin, setFrequencyLiftsPerMin] = useState<number>(4);
  const [durationCategory, setDurationCategory] = useState<'le_1h' | '1_to_2h' | '2_to_8h'>('1_to_2h');
  const [couplingQuality, setCouplingQuality] = useState<'bueno' | 'regular' | 'malo'>('regular');
  const [autoEmitPdfOnFinish, setAutoEmitPdfOnFinish] = useState<boolean>(true);
  const [sampleFrameCount, setSampleFrameCount] = useState<number>(16);

  // System Instruction viewer / customizer
  const [showPromptPanel, setShowPromptPanel] = useState<boolean>(false);
  const [systemInstruction, setSystemInstruction] = useState<string>(DEFAULT_VIDEO_SYSTEM_INSTRUCTION);

  // Processing & emitted report state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStage, setProcessingStage] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sampledFrames, setSampledFrames] = useState<SampledFrame[]>([]);
  const [emittedBundle, setEmittedBundle] = useState<EmittedBiomechReportBundle | null>(null);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeBlobUrlRef = useRef<string | null>(null);
  const rawUploadedFileRef = useRef<File | null>(null);
  const hasAttemptedAutoNormalizeRef = useRef<boolean>(false);
  const knownDurationRef = useRef<number | null>(null);
  const pendingAutoRunFileRef = useRef<File | null>(null);

  useEffect(() => {
    return () => {
      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
        activeBlobUrlRef.current = null;
      }
    };
  }, []);

  const replaceActiveBlobUrl = (file: File, knownDurSec: number | null = null, normalized = false) => {
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }
    const nextUrl = URL.createObjectURL(file);
    activeBlobUrlRef.current = nextUrl;

    knownDurationRef.current = knownDurSec;
    setVideoDurationSec(knownDurSec ?? 0);
    setCurrentPlaySec(0);
    setVideoFile(file);
    setVideoUrl(nextUrl);
    setVideoWasNormalized(normalized);
    setErrorMsg(null);
    setEmittedBundle(null);
    setSampledFrames([]);
  };

  /**
   * Transcodifica cualquier video (ej. 21 seg en HEVC/H.265 de celular, .mov QuickTime, 10-bit, WebM sin índice)
   * mediante el servidor a MP4 H.264 universal con +faststart para garantizar reproducción 100% fluida.
   */
  const normalizeVideoViaServer = async (
    sourceFile: File,
    reasonMessage = 'Optimizando códec de video a H.264 universal para reproducción fluida...',
  ): Promise<boolean> => {
    if (isNormalizingVideo) return false;
    setIsNormalizingVideo(true);
    setNormalizingNotice(reasonMessage);
    setErrorMsg(null);

    try {
      const resp = await fetch('/api/biomech/normalize-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-File-Name': encodeURIComponent(sourceFile.name || 'video_tarea.mp4'),
        },
        body: sourceFile,
      });

      if (!resp.ok) {
        let serverErr = `Error HTTP ${resp.status} al compatibilizar el video.`;
        try {
          const errJson = await resp.json();
          if (typeof errJson?.error === 'string') serverErr = errJson.error;
        } catch {
          // Ignore JSON parse error
        }
        throw new Error(serverErr);
      }

      const durHeader = resp.headers.get('X-Video-Duration-Sec');
      const parsedDur = durHeader ? parseFloat(durHeader) : NaN;
      const mp4Blob = await resp.blob();
      const cleanBaseName = sourceFile.name.replace(/\.[^.]+$/, '') || 'video_normalizado';
      const normalizedFile = new File([mp4Blob], `${cleanBaseName}_h264.mp4`, {
        type: 'video/mp4',
      });

      hasAttemptedAutoNormalizeRef.current = true;
      replaceActiveBlobUrl(
        normalizedFile,
        Number.isFinite(parsedDur) && parsedDur > 0 ? parsedDur : null,
        true,
      );
      return true;
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo convertir automáticamente el códec del archivo de video.',
      );
      return false;
    } finally {
      setIsNormalizingVideo(false);
      setNormalizingNotice('');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    pendingAutoRunFileRef.current = null;
    rawUploadedFileRef.current = file;
    hasAttemptedAutoNormalizeRef.current = false;

    if (needsImmediateTranscodeByFilename(file)) {
      void normalizeVideoViaServer(
        file,
        `Convirtiendo ${file.name} a formato MP4 H.264 universal para garantizar reproducción y muestreo...`,
      );
      return;
    }

    replaceActiveBlobUrl(file, null, false);
  };

  /**
   * Genera un video 3D de prueba (Levantamiento suelo->estantería o Descenso estantería->suelo)
   * y ejecuta el pipeline completo de extracción + emisión de informe.
   */
  const handleGenerateTestVideo = async (
    autoRunAfterGenerate: boolean,
    simDirection: 'levantamiento' | 'descenso' = 'levantamiento',
  ) => {
    if (isGeneratingTestVideo || isProcessing || isNormalizingVideo) return;
    setErrorMsg(null);
    setIsGeneratingTestVideo(true);

    try {
      await ensureAvatarGlbLoaded();
      const width = 640;
      const height = 480;
      const offCanvas = document.createElement('canvas');
      offCanvas.width = width;
      offCanvas.height = height;

      const stream = offCanvas.captureStream(20);
      const candidates = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4',
      ];
      const supportedMime =
        candidates.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) || '';

      const recorder = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime, videoBitsPerSecond: 2_200_000 })
        : new MediaRecorder(stream);

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      const stoppedPromise = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          const finalMime = recorder.mimeType || supportedMime || 'video/webm';
          resolve(new Blob(chunks, { type: finalMime }));
        };
        recorder.onerror = () => reject(new Error('No se pudo codificar el video 3D de prueba en este navegador.'));
      });

      recorder.start(120);

      const totalDurationMs = 3400;
      const fps = 18;
      const totalSteps = Math.round((totalDurationMs / 1000) * fps);
      const stepMs = Math.round(1000 / fps);

      for (let i = 0; i <= totalSteps; i++) {
        const progress = i / totalSteps;
        let phaseFactor = 0;
        if (progress < 0.22) {
          phaseFactor = 0;
        } else if (progress <= 0.84) {
          const u = (progress - 0.22) / 0.62;
          phaseFactor = u * u * (3 - 2 * u);
        } else {
          phaseFactor = 1;
        }

        // Si simDirection === 'descenso', comienza arriba en estantería (factor=1) y desciende al suelo (factor=0)
        const heightProgress = simDirection === 'levantamiento' ? phaseFactor : 1 - phaseFactor;

        const trunkDeg = Math.round(52 * (1 - heightProgress) + 10 * heightProgress);
        const kneeDeg = Math.round(54 * (1 - heightProgress) + 6 * heightProgress);
        const hipDeg = Math.round(kneeDeg * 0.68);
        const shoulderDeg = Math.round(34 * (1 - heightProgress) + 84 * heightProgress);
        const elbowDeg = Math.round(76 * (1 - heightProgress) + 72 * heightProgress);
        const twistDeg = Math.round(22 * phaseFactor);

        const simPanel: Panel3DSpec = {
          subTitle:
            simDirection === 'levantamiento'
              ? 'Tarea EmpresaX · Levantamiento Suelo a Estantería'
              : 'Tarea EmpresaX · Descenso de Estantería a Nivel Bajo',
          scoreBadge:
            progress < 0.26
              ? simDirection === 'levantamiento'
                ? 'Origen: Toma en Suelo'
                : 'Origen: Toma en Estantería'
              : progress < 0.82
                ? simDirection === 'levantamiento'
                  ? 'Elevación de Carga'
                  : 'Descenso Controlado'
                : simDirection === 'levantamiento'
                  ? 'Destino: Estantería'
                  : 'Destino: Nivel Bajo',
          focusZone: 'full_body',
          cameraPreset: 'sagittal_right',
          pose: makeNeutralPose({
            trunkFlexionDeg: trunkDeg,
            trunkTwistDeg: twistDeg,
            neckFlexionDeg: heightProgress > 0.7 ? -6 : Math.round(trunkDeg * 0.3 + 8),
            shoulderRFlexionDeg: shoulderDeg,
            shoulderLFlexionDeg: shoulderDeg,
            elbowRFlexionDeg: elbowDeg,
            elbowLFlexionDeg: elbowDeg,
            hipRFlexionDeg: hipDeg,
            hipLFlexionDeg: hipDeg,
            kneeRFlexionDeg: kneeDeg,
            kneeLFlexionDeg: kneeDeg,
            prop: 'box_load',
            loadKg: loadWeightKg,
            highlightGroup: 'l5s1_disc',
          }),
          angleArcs: [],
          forceVectors: [],
          noteBottom: `Operario ${workerHeightCm} cm · Carga ${loadWeightKg} kg`,
        };

        renderInteractivePose3DToCanvas(
          simPanel,
          offCanvas,
          width,
          height,
          { azimuthDeg: -14, elevationDeg: 6, zoom: 1.04 },
          1,
          'anatomical_skin',
          false,
        );

        await new Promise((r) => window.setTimeout(r, stepMs));
      }

      recorder.stop();
      const recordedBlob = await stoppedPromise;
      stream.getTracks().forEach((t) => t.stop());

      setMovementModeHint(simDirection);
      setTaskEvaluated(
        simDirection === 'levantamiento'
          ? 'Levantamiento manual de cajas desde suelo/tarima hacia estantería media-alta'
          : 'Descenso manual de cajas desde estantería superior hacia tarima baja',
      );

      const ext = recordedBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const generatedFile = new File(
        [recordedBlob],
        `${simDirection}_caja_empresax_3d.${ext}`,
        { type: recordedBlob.type || 'video/webm' },
      );

      rawUploadedFileRef.current = generatedFile;
      hasAttemptedAutoNormalizeRef.current = true;
      pendingAutoRunFileRef.current = autoRunAfterGenerate ? generatedFile : null;
      replaceActiveBlobUrl(generatedFile, 3.4, false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No fue posible generar el video de prueba automáticamente.',
      );
    } finally {
      setIsGeneratingTestVideo(false);
    }
  };

  /**
   * Construye las pestañas NIOSH + REBA, las figuras 3D sin solapamiento y el semáforo de alertas
   * (usado tanto al finalizar la extracción IA como al pulsar "Invertir Origen ↔ Destino").
   */
  const buildAndEmitStudyBundle = async (params: {
    extracted: ExtractedVideoBiomechJson;
    sampledCount: number;
    processingMs: number;
    originKeyframeUrl: string;
    destKeyframeUrl: string;
    activeFileName: string;
    invertOriginDest: boolean;
    triggerPdfDownload: boolean;
  }) => {
    const {
      extracted,
      sampledCount,
      processingMs,
      originKeyframeUrl,
      destKeyframeUrl,
      activeFileName,
      invertOriginDest,
      triggerPdfDownload,
    } = params;

    const resolved = getResolvedMovementHeights(extracted);
    const vOrig = invertOriginDest ? resolved.vDestCm : resolved.vOrigCm;
    const vDest = invertOriginDest ? resolved.vOrigCm : resolved.vDestCm;
    const hOrig = invertOriginDest ? resolved.hDestCm : resolved.hOrigCm;
    const hDest = invertOriginDest ? resolved.hOrigCm : resolved.hDestCm;
    const asymOrig = invertOriginDest
      ? extracted.niosh_inputs.A_deg
      : Math.round(extracted.niosh_inputs.A_deg * 0.5 * 10) / 10;
    const asymDest = invertOriginDest
      ? Math.round(extracted.niosh_inputs.A_deg * 0.5 * 10) / 10
      : extracted.niosh_inputs.A_deg;

    // Renderizar reconstrucciones 3D limpias con el avatar anatómico PBR (.glb)
    await ensureAvatarGlbLoaded();
    const cOrigin3D = document.createElement('canvas');
    renderInteractivePose3DToCanvas(
      build3DPanelFromExtraction(extracted, 'origin', loadWeightKg, vOrig, vDest, hOrig, hDest),
      cOrigin3D,
      540,
      450,
      DEFAULT_ORBIT_OVERRIDE,
      2,
      'anatomical_skin',
      false,
    );
    const origin3DUrl = cOrigin3D.toDataURL('image/png');

    const cDest3D = document.createElement('canvas');
    renderInteractivePose3DToCanvas(
      build3DPanelFromExtraction(extracted, 'destination', loadWeightKg, vOrig, vDest, hOrig, hDest),
      cDest3D,
      540,
      450,
      DEFAULT_ORBIT_OVERRIDE,
      2,
      'anatomical_skin',
      false,
    );
    const dest3DUrl = cDest3D.toDataURL('image/png');

    const nioshData: NioshData = {
      loadWeightKg,
      evaluateDestination: true,
      hOriginCm: hOrig,
      hDestCm: hDest,
      vOriginCm: vOrig,
      vDestCm: vDest,
      asymmetryOriginDeg: asymOrig,
      asymmetryDestDeg: asymDest,
      frequencyLiftsPerMin,
      durationCategory,
      couplingQuality,
    };

    const trajInfo = describeNioshTrajectory(vOrig, vDest);

    const baseNioshTab = createNewStudyTab(1, MethodId.NIOSH, taskEvaluated);
    baseNioshTab.id = 'tab-video-ia-niosh';
    baseNioshTab.tabLabel = 'Video IA: Ecuación NIOSH';
    baseNioshTab.instrumentsUsed =
      'Extractor de Visión por Computador 3D (EmpresaX) + Calibración antropométrica + Ecuación NIOSH (1993)';
    baseNioshTab.payloads[MethodId.NIOSH] = nioshData;

    const shownOrigKeyframe = invertOriginDest ? destKeyframeUrl : originKeyframeUrl;
    const shownDestKeyframe = invertOriginDest ? originKeyframeUrl : destKeyframeUrl;
    const shownOrigTs = invertOriginDest
      ? extracted.critical_events.destino_timestamp
      : extracted.critical_events.origen_timestamp;
    const shownDestTs = invertOriginDest
      ? extracted.critical_events.origen_timestamp
      : extracted.critical_events.destino_timestamp;

    const nioshPhotos: StudyPhoto[] = [
      {
        id: `ph-orig-${Date.now()}`,
        name: `origen_${shownOrigTs.replace(/[:.]/g, '_')}.png`,
        dataUrl: shownOrigKeyframe,
        caption: `Fotograma crítico en Origen (${shownOrigTs}) — H = ${hOrig} cm, V origen = ${vOrig} cm.`,
        annotations: [],
      },
      {
        id: `ph-3d-orig-${Date.now() + 1}`,
        name: 'reconstruccion_3d_origen_empresax.png',
        dataUrl: origin3DUrl,
        caption: `Modelización 3D en Origen (${shownOrigTs}) — V = ${vOrig} cm, H = ${hOrig} cm.`,
        annotations: [],
      },
      {
        id: `ph-dest-${Date.now() + 2}`,
        name: `destino_${shownDestTs.replace(/[:.]/g, '_')}.png`,
        dataUrl: shownDestKeyframe,
        caption: `Fotograma crítico en Destino (${shownDestTs}) — V destino = ${vDest} cm, D = ${Math.round(Math.abs(vDest - vOrig) * 10) / 10} cm, A = ${extracted.niosh_inputs.A_deg}°.`,
        annotations: [],
      },
      {
        id: `ph-3d-dest-${Date.now() + 3}`,
        name: 'reconstruccion_3d_destino_empresax.png',
        dataUrl: dest3DUrl,
        caption: `Modelización 3D en Destino (${shownDestTs}) — V = ${vDest} cm, H = ${hDest} cm.`,
        annotations: [],
      },
    ];
    baseNioshTab.photos = nioshPhotos;

    const nioshResult = evaluateStudyTab(baseNioshTab);
    baseNioshTab.implementationDeadline = nioshResult.recommendedDeadline;
    baseNioshTab.evaluatorObservations =
      `Extracción biomecánica automatizada desde archivo de video (${activeFileName}): ` +
      `instante inicial en ${shownOrigTs} (V = ${vOrig} cm, H = ${hOrig} cm) e instante final en ${shownDestTs} (V = ${vDest} cm, H = ${hDest} cm). ` +
      `${trajInfo.technicalExplanation} ` +
      `Resultado determinista: ${nioshResult.primaryScoreText} (${nioshResult.riskLabel}).`;
    baseNioshTab.correctiveMeasures = nioshResult.suggestedMeasures
      .map((m, idx) => `${idx + 1}. ${m}`)
      .join('\n');

    // Construir pestaña REBA determinista
    const vMax = Math.max(vOrig, vDest);
    const vMin = Math.min(vOrig, vDest);
    const hWorst = Math.max(hOrig, hDest);
    const rebaMapped = mapExtractedToRebaData(
      extracted,
      loadWeightKg,
      couplingQuality,
      vMax,
      vMin,
      hWorst,
    );

    const baseRebaTab = createNewStudyTab(
      2,
      MethodId.REBA,
      `${taskEvaluated} — ${trajInfo.shortTitle}`,
    );
    baseRebaTab.id = 'tab-video-ia-reba';
    baseRebaTab.tabLabel = 'Video IA: Cuerpo Entero REBA';
    baseRebaTab.instrumentsUsed =
      'Extractor Goniométrico Espacial 3D desde Video + Método REBA (Hignett y McAtamney)';
    baseRebaTab.payloads[MethodId.REBA] = rebaMapped;
    baseRebaTab.photos = [
      {
        id: `ph-reba-3d-${Date.now() + 4}`,
        name: 'postura_3d_reba_origen.png',
        dataUrl: origin3DUrl,
        caption: `Postura 3D en Origen (${shownOrigTs}): tronco ${extracted.postural_angles_deg.trunk_flexion}°, rodillas ${extracted.postural_angles_deg.knee_flexion}°, codos ${extracted.postural_angles_deg.right_elbow}°/${extracted.postural_angles_deg.left_elbow}°.`,
        annotations: [],
      },
      {
        id: `ph-reba-dest-${Date.now() + 5}`,
        name: 'postura_3d_reba_destino.png',
        dataUrl: dest3DUrl,
        caption: `Postura 3D en Destino (${shownDestTs}): cota vertical V = ${vDest} cm.`,
        annotations: [],
      },
    ];

    const rebaResult = evaluateStudyTab(baseRebaTab);
    baseRebaTab.implementationDeadline = rebaResult.recommendedDeadline;
    baseRebaTab.evaluatorObservations =
      `Ángulos articulares extraídos en instante crítico: flexión de tronco = ${extracted.postural_angles_deg.trunk_flexion}°, ` +
      `flexión de rodillas = ${extracted.postural_angles_deg.knee_flexion}°, codo derecho = ${extracted.postural_angles_deg.right_elbow}°, codo izquierdo = ${extracted.postural_angles_deg.left_elbow}°. ` +
      `${trajInfo.shortTitle}. Resultado REBA: ${rebaResult.primaryScoreText} (${rebaResult.riskLabel} — ${rebaResult.actionLevelText}).`;
    baseRebaTab.correctiveMeasures = rebaResult.suggestedMeasures
      .map((m, idx) => `${idx + 1}. ${m}`)
      .join('\n');

    const trafficLight = buildVideoBiomechTrafficLight({
      nioshData,
      nioshResult,
      rebaResult,
      trunkFlexionDeg: extracted.postural_angles_deg.trunk_flexion,
      kneeFlexionDeg: extracted.postural_angles_deg.knee_flexion,
      rightElbowDeg: extracted.postural_angles_deg.right_elbow,
      leftElbowDeg: extracted.postural_angles_deg.left_elbow,
    });

    await onEmitTabsAndReport({
      nioshTab: baseNioshTab,
      rebaTab: baseRebaTab,
      autoDownloadPdf: triggerPdfDownload,
    });

    setEmittedBundle({
      extracted,
      sampledCount,
      processingMs,
      originKeyframeUrl,
      destKeyframeUrl,
      origin3DUrl,
      dest3DUrl,
      nioshData,
      nioshTab: baseNioshTab,
      rebaTab: baseRebaTab,
      nioshResult,
      rebaResult,
      trafficLight,
      pdfAutoEmitted: triggerPdfDownload,
      invertedCycle: invertOriginDest,
    });
  };

  const handleToggleInvertOriginDest = async () => {
    if (!emittedBundle || isProcessing) return;
    setIsProcessing(true);
    setProcessingStage('Invirtiendo cotas de Origen ↔ Destino y recalculando dictamen y semáforo...');
    try {
      await buildAndEmitStudyBundle({
        extracted: emittedBundle.extracted,
        sampledCount: emittedBundle.sampledCount,
        processingMs: emittedBundle.processingMs,
        originKeyframeUrl: emittedBundle.originKeyframeUrl,
        destKeyframeUrl: emittedBundle.destKeyframeUrl,
        activeFileName: videoFile?.name || 'secuencia registrada',
        invertOriginDest: !emittedBundle.invertedCycle,
        triggerPdfDownload: false,
      });
    } finally {
      setIsProcessing(false);
      setProcessingStage('');
    }
  };

  const runVideoExtractionPipeline = async (overrideFile?: File) => {
    let video = videoRef.current;
    if (!video) {
      setErrorMsg('Seleccione o genere primero un archivo de video de manipulación de carga.');
      return;
    }

    const activeFileName = overrideFile?.name || videoFile?.name || 'secuencia registrada';
    setErrorMsg(null);
    setIsProcessing(true);
    const t0 = performance.now();

    try {
      // Asegurar que los metadatos y el primer fotograma estén decodificados
      if (video.readyState < 2) {
        await new Promise<void>((resolve) => {
          const done = () => resolve();
          const t = window.setTimeout(done, 1800);
          video!.addEventListener(
            'loadeddata',
            () => {
              window.clearTimeout(t);
              done();
            },
            { once: true },
          );
        });
      }

      // Si el navegador no pudo decodificar la pista de video (videoWidth === 0, ej. HEVC), normalizar en servidor
      if ((video.videoWidth === 0 || video.error) && rawUploadedFileRef.current && !videoWasNormalized) {
        setProcessingStage('Compatibilizando pista de video (HEVC/QuickTime → H.264) para extraer fotogramas...');
        const ok = await normalizeVideoViaServer(
          rawUploadedFileRef.current,
          'Convirtiendo códec de video a H.264 universal antes del análisis...',
        );
        if (ok) {
          await new Promise((r) => window.setTimeout(r, 450));
          video = videoRef.current;
          if (video && video.readyState < 2) {
            await new Promise<void>((resolve) => {
              const t = window.setTimeout(resolve, 2000);
              video!.addEventListener(
                'loadeddata',
                () => {
                  window.clearTimeout(t);
                  resolve();
                },
                { once: true },
              );
            });
          }
        }
      }

      if (!video) {
        throw new Error('El reproductor de video no se encuentra disponible.');
      }

      video.pause();
      const rawDur =
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : knownDurationRef.current ?? 3.4;
      const safeDuration = Math.max(0.5, Math.min(300, rawDur));
      setVideoDurationSec(safeDuration);

      // Paso 1: Muestreo temporal uniforme sobre la secuencia completa (ej. 21 s)
      const count = Math.max(8, Math.min(24, sampleFrameCount));
      const collected: SampledFrame[] = [];

      for (let i = 0; i < count; i++) {
        const ratio = count === 1 ? 0.5 : 0.03 + (i / (count - 1)) * 0.94;
        const targetSec = Number((safeDuration * ratio).toFixed(3));
        const tsLabel = formatSecondsToTimestamp(targetSec);
        setProcessingStage(
          `Paso 1/4 · Muestreando fotograma ${i + 1} de ${count} (${tsLabel} de ${safeDuration.toFixed(1)} s)...`,
        );
        await seekVideoElement(video, targetSec);
        const jpegDataUrl = captureVideoFrameDataUrl(video, tsLabel, 640, 'image/jpeg', true);
        const base64 = jpegDataUrl.split(',')[1] || '';
        if (base64) {
          collected.push({
            timestamp: tsLabel,
            timeSec: targetSec,
            mimeType: 'image/jpeg',
            dataBase64: base64,
            previewUrl: jpegDataUrl,
          });
        }
      }

      if (collected.length === 0) {
        throw new Error('No se pudieron extraer fotogramas válidos del archivo de video.');
      }
      setSampledFrames(collected);

      // Paso 2: Extracción IA en servidor con detección de levantamiento vs descenso
      setProcessingStage(
        'Paso 2/4 · Extrayendo variables geométricas (H, V origen, V destino, D, A), sentido cinemático y ángulos 3D...',
      );

      const response = await fetch('/api/biomech/extract-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frames: collected.map((f) => ({
            timestamp: f.timestamp,
            mimeType: f.mimeType,
            dataBase64: f.dataBase64,
          })),
          workerHeightCm,
          videoDurationSec: safeDuration,
          movementModeHint,
          customSystemInstruction: systemInstruction,
        }),
      });

      const payloadJson = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof payloadJson?.error === 'string'
            ? payloadJson.error
            : `Error del servidor HTTP ${response.status}`,
        );
      }

      const extracted = payloadJson as ExtractedVideoBiomechJson;

      // Paso 3: Captura de fotogramas críticos de alta resolución en Origen y Destino
      setProcessingStage(
        `Paso 3/4 · Capturando instantes críticos (${extracted.critical_events.origen_timestamp} y ${extracted.critical_events.destino_timestamp}) y reconstruyendo posturas 3D...`,
      );

      const originSec = parseTimestampToSeconds(extracted.critical_events.origen_timestamp, safeDuration);
      const destSec = parseTimestampToSeconds(extracted.critical_events.destino_timestamp, safeDuration);

      await seekVideoElement(video, originSec);
      const originKeyframeUrl = captureVideoFrameDataUrl(
        video,
        `ORIGEN ${extracted.critical_events.origen_timestamp}`,
        840,
        'image/png',
        true,
      );

      await seekVideoElement(video, destSec);
      const destKeyframeUrl = captureVideoFrameDataUrl(
        video,
        `DESTINO ${extracted.critical_events.destino_timestamp}`,
        840,
        'image/png',
        true,
      );

      // Paso 4: Integrar pestañas, calcular semáforo de alertas y emitir Informe PDF
      setProcessingStage(
        autoEmitPdfOnFinish
          ? 'Paso 4/4 · Evaluando Semáforo de Riesgo y emitiendo Informe Técnico PDF...'
          : 'Paso 4/4 · Integrando pestañas y presentando Semáforo e Informe Técnico en pantalla...',
      );

      const elapsed = Math.round(performance.now() - t0);
      await buildAndEmitStudyBundle({
        extracted,
        sampledCount: collected.length,
        processingMs: elapsed,
        originKeyframeUrl,
        destKeyframeUrl,
        activeFileName,
        invertOriginDest: false,
        triggerPdfDownload: autoEmitPdfOnFinish,
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Ocurrió un error al procesar el archivo de video.',
      );
    } finally {
      setIsProcessing(false);
      setProcessingStage('');
    }
  };

  const handleCopyJson = async () => {
    if (!emittedBundle) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(emittedBundle.extracted, null, 2));
      setCopiedJson(true);
      window.setTimeout(() => setCopiedJson(false), 2000);
    } catch {
      // Ignore clipboard permission restrictions
    }
  };

  const handleJumpVideoToTimestamp = (ts: string) => {
    const video = videoRef.current;
    if (!video) return;
    const sec = parseTimestampToSeconds(ts, videoDurationSec || video.duration || 5);
    void seekVideoElement(video, sec);
  };

  return (
    <div className="space-y-6">
      {/* CABECERA DEL MÓDULO DE VISIÓN BIOMECÁNICA Y EMISIÓN AUTOMÁTICA DE INFORME */}
      <section className="bg-white border border-slate-300 rounded-lg p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-sky-800 font-semibold">
              <span>Visión por Computador 3D</span>
              <span className="text-slate-300">·</span>
              <span>Levantamiento vs. Descenso (Origen ↔ Destino)</span>
              <span className="text-slate-300">·</span>
              <span>Semáforo de Alertas e Informe Automático</span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Extractor de Variables Biomecánicas desde Video y Emisión Automática de Informe
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-4xl leading-relaxed">
              Analiza filmaciones laborales (incluyendo compatibilización automática a H.264 para videos móviles en HEVC / QuickTime), distingue si la tarea consiste en{' '}
              <strong>levantar desde el suelo hacia una estantería</strong>,{' '}
              <strong>bajar una carga desde una altura mayor a una menor</strong> o un{' '}
              <strong>ciclo reversible donde el origen también actúa como destino</strong>, y emite el informe con{' '}
              <strong>Alerta de Atención Inmediata y Tabla Semáforo</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowPromptPanel((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {showPromptPanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              System Instruction JSON
            </button>

            <button
              type="button"
              onClick={onBackToEvaluator}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Volver a Pestañas de Estudio
            </button>
          </div>
        </div>

        {/* PANEL DESPLEGABLE CON EL SYSTEM INSTRUCTION EXACTO */}
        {showPromptPanel && (
          <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-900">
                Instrucción del Sistema Activa en Servidor (<code className="font-mono">POST /api/biomech/extract-video</code>)
              </span>
              <button
                type="button"
                onClick={() => setSystemInstruction(DEFAULT_VIDEO_SYSTEM_INSTRUCTION)}
                className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restaurar instrucción original
              </button>
            </div>
            <textarea
              rows={11}
              value={systemInstruction}
              onChange={(e) => setSystemInstruction(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white p-3 font-mono text-xs text-slate-800 focus:border-sky-600 focus:outline-none"
            />
          </div>
        )}

        {/* GRILLA DE CARGA DE VIDEO + PARÁMETROS OPERATIVOS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Columna Izquierda: Reproductor de Video Universal + Carga o Simulación 3D */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-900">
                1. Archivo de Video de la Tarea (Soporte MP4, MOV, HEVC/H.265, WebM)
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,video/*,.mov,.mp4,.webm,.mkv,.avi,.m4v,.3gp"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing || isGeneratingTestVideo || isNormalizingVideo}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-semibold text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-sky-700" />
                  Subir Video (.mp4 / .mov / .webm)
                </button>

                <button
                  type="button"
                  onClick={() => void handleGenerateTestVideo(true, 'levantamiento')}
                  disabled={isProcessing || isGeneratingTestVideo || isNormalizingVideo}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
                  title="Simula levantamiento desde suelo hacia estantería, extrae variables y emite el informe"
                >
                  <Film className="w-3.5 h-3.5" />
                  {isGeneratingTestVideo ? 'Grabando 3D...' : 'Prueba: Levantar Suelo → Estantería'}
                </button>

                <button
                  type="button"
                  onClick={() => void handleGenerateTestVideo(true, 'descenso')}
                  disabled={isProcessing || isGeneratingTestVideo || isNormalizingVideo}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-sky-700 bg-sky-50 hover:bg-sky-100 disabled:opacity-50 text-xs font-semibold text-sky-900 whitespace-nowrap shrink-0 cursor-pointer"
                  title="Simula descenso de carga desde estantería superior hacia nivel inferior y emite el informe"
                >
                  <ArrowDownUp className="w-3.5 h-3.5 text-sky-700" />
                  Prueba: Bajar Estantería → Suelo
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-300 bg-slate-950 overflow-hidden min-h-[310px] flex flex-col justify-between">
              {isNormalizingVideo ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-3 text-slate-200">
                  <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
                  <p className="text-sm font-semibold text-white">
                    Compatibilizando archivo de video para reproducción universal...
                  </p>
                  <p className="text-xs text-slate-400 max-w-md">{normalizingNotice}</p>
                </div>
              ) : videoUrl ? (
                <>
                  <div className="flex-1 flex items-center justify-center bg-slate-950 p-2">
                    <video
                      key={videoUrl}
                      ref={videoRef}
                      src={videoUrl}
                      controls
                      playsInline
                      preload="auto"
                      onLoadedMetadata={(e) => {
                        const vEl = e.currentTarget;
                        const dur = vEl.duration;
                        if (Number.isFinite(dur) && dur > 0) {
                          setVideoDurationSec(dur);
                        } else if (!hasAttemptedAutoNormalizeRef.current && rawUploadedFileRef.current) {
                          void normalizeVideoViaServer(
                            rawUploadedFileRef.current,
                            'Indexando duración exacta y pista H.264 del archivo de video...',
                          );
                          return;
                        }

                        // Si el contenedor MP4 tiene pista de video HEVC/H.265 no soportada por el navegador, videoWidth es 0
                        if (
                          vEl.videoWidth === 0 &&
                          !hasAttemptedAutoNormalizeRef.current &&
                          rawUploadedFileRef.current
                        ) {
                          void normalizeVideoViaServer(
                            rawUploadedFileRef.current,
                            'Códec HEVC / H.265 detectado: recodificando automáticamente a H.264 universal para reproducir en el navegador...',
                          );
                        }
                      }}
                      onError={() => {
                        if (!hasAttemptedAutoNormalizeRef.current && rawUploadedFileRef.current) {
                          void normalizeVideoViaServer(
                            rawUploadedFileRef.current,
                            'Formato o códec de cámara no nativo: convirtiendo automáticamente a MP4 H.264 universal...',
                          );
                        } else {
                          setErrorMsg(
                            'No se pudo decodificar este flujo de video. Pulse "Compatibilizar H.264" o verifique que el archivo no esté dañado.',
                          );
                        }
                      }}
                      onLoadedData={() => {
                        if (pendingAutoRunFileRef.current) {
                          const f = pendingAutoRunFileRef.current;
                          pendingAutoRunFileRef.current = null;
                          void runVideoExtractionPipeline(f);
                        }
                      }}
                      onTimeUpdate={(e) => setCurrentPlaySec(e.currentTarget.currentTime)}
                      className="max-h-[360px] w-full object-contain rounded-xs"
                    />
                  </div>
                  <div className="bg-slate-900 border-t border-slate-800 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300 font-mono tabular-nums">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate max-w-[230px]">{videoFile?.name || 'video_cargado.mp4'}</span>
                      {videoWasNormalized && (
                        <span className="text-[10px] font-sans font-semibold text-emerald-300 border border-emerald-700/60 bg-emerald-950/70 px-1.5 py-0.5 rounded">
                          H.264 Optimizado
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span>
                        {formatSecondsToTimestamp(currentPlaySec)} / {formatSecondsToTimestamp(videoDurationSec)}
                      </span>
                      {rawUploadedFileRef.current && !videoWasNormalized && (
                        <button
                          type="button"
                          onClick={() => {
                            if (rawUploadedFileRef.current) {
                              void normalizeVideoViaServer(
                                rawUploadedFileRef.current,
                                'Recodificando manualmente a MP4 H.264 universal...',
                              );
                            }
                          }}
                          disabled={isProcessing || isNormalizingVideo}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-[11px] font-sans font-medium text-sky-300 cursor-pointer"
                          title="Si el video no se reproduce o se ve en negro (ej. HEVC de celular), conviértalo en 1 clic a H.264"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Compatibilizar H.264
                        </button>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-3 text-slate-300">
                  <Video className="w-10 h-10 text-sky-400" />
                  <div className="space-y-1 max-w-md">
                    <p className="text-sm font-semibold text-white">
                      Ningún archivo de video seleccionado todavía
                    </p>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Suba una filmación real (por ejemplo, de 20–30 segundos desde celular o cámara en formato{' '}
                      <code className="font-mono text-slate-200">.mp4</code>,{' '}
                      <code className="font-mono text-slate-200">.mov</code> o HEVC; se compatibiliza automáticamente a H.264), o utilice los botones de prueba 3D para evaluar levantamiento o descenso de cargas.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isGeneratingTestVideo}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-white hover:bg-slate-100 text-slate-900 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-sky-700" />
                      Seleccionar Archivo de Video
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleGenerateTestVideo(false, 'levantamiento')}
                      disabled={isGeneratingTestVideo}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 text-sky-400" />
                      Generar Video 3D de Muestra
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Columna Derecha: Datos Operativos, Sentido Origen<->Destino y Botón Maestro */}
          <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3 text-xs">
            <div className="font-bold text-slate-900 border-b border-slate-200 pb-2">
              2. Datos Operativos y Sentido de la Carga (Origen ↔ Destino)
            </div>

            <label className="block space-y-1">
              <span className="font-medium text-slate-700">Subtarea Evaluada (Empresa: {general.companyName})</span>
              <input
                type="text"
                value={taskEvaluated}
                onChange={(e) => setTaskEvaluated(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-sky-600 focus:outline-none"
              />
            </label>

            <label className="block space-y-1">
              <span className="font-medium text-slate-700">
                Sentido Cinemático / Relación Origen – Destino
              </span>
              <select
                value={movementModeHint}
                onChange={(e) => setMovementModeHint(e.target.value as MovementModeHint)}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
              >
                <option value="auto">
                  Detección Automática IA (distingue levantar suelo→estantería vs. bajar altura→suelo)
                </option>
                <option value="levantamiento">
                  Levantamiento Ascendente (desde suelo / tarima baja hacia estantería / mesa)
                </option>
                <option value="descenso">
                  Descenso / Bajada de Carga (desde estantería / altura mayor hacia altura menor)
                </option>
                <option value="bidireccional">
                  Ciclo Reversible (Origen ↔ Destino intercambiables: estiba y desestiba)
                </option>
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="font-medium text-slate-700">Masa Real de la Carga (kg)</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={0.5}
                  value={loadWeightKg}
                  onChange={(e) => setLoadWeightKg(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono tabular-nums text-xs text-slate-900"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-medium text-slate-700">Estatura Operario (cm)</span>
                <input
                  type="number"
                  min={140}
                  max={210}
                  step={1}
                  value={workerHeightCm}
                  onChange={(e) => setWorkerHeightCm(Math.max(140, Math.min(210, Number(e.target.value) || 172)))}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono tabular-nums text-xs text-slate-900"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="font-medium text-slate-700">Frecuencia (maniobras/min)</span>
                <input
                  type="number"
                  min={0.2}
                  max={15}
                  step={0.2}
                  value={frequencyLiftsPerMin}
                  onChange={(e) => setFrequencyLiftsPerMin(Math.max(0.2, Number(e.target.value) || 1))}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono tabular-nums text-xs text-slate-900"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-medium text-slate-700">Fotogramas a Muestrear</span>
                <select
                  value={sampleFrameCount}
                  onChange={(e) => setSampleFrameCount(Number(e.target.value))}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono tabular-nums text-xs text-slate-900"
                >
                  <option value={12}>12 fotogramas (Rápido)</option>
                  <option value={16}>16 fotogramas (Óptimo para ~20 s)</option>
                  <option value={22}>22 fotogramas (Alta densidad)</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="font-medium text-slate-700">Duración de Exposición</span>
                <select
                  value={durationCategory}
                  onChange={(e) => setDurationCategory(e.target.value as 'le_1h' | '1_to_2h' | '2_to_8h')}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                >
                  <option value="le_1h">Corta (≤ 1 h)</option>
                  <option value="1_to_2h">Moderada (1 a 2 h)</option>
                  <option value="2_to_8h">Larga (2 a 8 h)</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="font-medium text-slate-700">Tipo de Agarre (CM)</span>
                <select
                  value={couplingQuality}
                  onChange={(e) => setCouplingQuality(e.target.value as 'bueno' | 'regular' | 'malo')}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                >
                  <option value="bueno">Bueno (Asas anatómicas · 1,00)</option>
                  <option value="regular">Regular (Flexión dedos 90° · 0,95)</option>
                  <option value="malo">Malo (Sin asas / voluminoso · 0,90)</option>
                </select>
              </label>
            </div>

            <label className="flex items-start gap-2 pt-0.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoEmitPdfOnFinish}
                onChange={(e) => setAutoEmitPdfOnFinish(e.target.checked)}
                className="mt-0.5 rounded border-slate-400 text-sky-700"
              />
              <span className="text-slate-800 font-medium leading-snug">
                Emitir y descargar automáticamente el <strong>Informe Técnico PDF</strong> (con Semáforo y Alertas) al finalizar
              </span>
            </label>

            <button
              type="button"
              onClick={() => void runVideoExtractionPipeline()}
              disabled={!videoUrl || isProcessing || isGeneratingTestVideo || isNormalizingVideo}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <Sparkles className="w-4 h-4 text-sky-400" />
              {isProcessing
                ? 'Procesando Video y Generando Informe...'
                : 'Procesar Video y Emitir Informe Ergonómico'}
            </button>

            {isProcessing && processingStage && (
              <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950 font-medium">
                {processingStage}
              </div>
            )}

            {errorMsg && (
              <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2.5 text-xs text-red-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        </div>

        {/* TIRA DE FOTOGRAMAS MUESTREADOS CON TIMESTAMPS EXACTOS */}
        {sampledFrames.length > 0 && (
          <div className="pt-2 border-t border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="font-semibold text-slate-800">
                Secuencia Temporal Muestreada ({sampledFrames.length} fotogramas con marca de tiempo milimétrica)
              </span>
              <span className="font-mono tabular-nums">Haga clic en un fotograma para posicionar el reproductor</span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {sampledFrames.map((f, i) => (
                <button
                  key={`${f.timestamp}-${i}`}
                  type="button"
                  onClick={() => handleJumpVideoToTimestamp(f.timestamp)}
                  className="shrink-0 w-28 rounded border border-slate-300 bg-slate-900 overflow-hidden hover:border-sky-600 transition-colors cursor-pointer text-left"
                >
                  <img
                    src={f.previewUrl}
                    alt={`Fotograma ${f.timestamp}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-16 object-cover"
                  />
                  <div className="px-1.5 py-0.5 text-[10px] font-mono tabular-nums text-slate-200 bg-slate-950 text-center">
                    {f.timestamp}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ===================================================================== */}
      {/* INFORME BIOMECÁNICO Y ERGONÓMICO EMITIDO AUTOMÁTICAMENTE              */}
      {/* ===================================================================== */}
      {emittedBundle && (
        <section className="bg-white border border-slate-300 rounded-lg p-5 space-y-6">
          {/* Encabezado de Confirmación de Informe Emitido */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-800 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  {emittedBundle.pdfAutoEmitted
                    ? 'Video procesado e Informe PDF emitido con Semáforo de Riesgo'
                    : 'Video procesado e Informe Técnico actualizado en el estudio activo'}
                </span>
                <span className="text-slate-300">·</span>
                <span className="font-mono tabular-nums text-slate-600">
                  {emittedBundle.sampledCount} fotogramas en {(emittedBundle.processingMs / 1000).toFixed(1)} s
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Informe Técnico de Extracción Biomecánica 3D y Control Normativo ({general.companyName})
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleToggleInvertOriginDest()}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-amber-300 bg-amber-50 hover:bg-amber-100 text-xs font-semibold text-amber-950 whitespace-nowrap shrink-0 cursor-pointer"
                title="Intercambia las cotas de Origen y Destino (ej. pasar de levantar a bajar carga en ciclo reversible)"
              >
                <ArrowDownUp className="w-3.5 h-3.5 text-amber-800" />
                {emittedBundle.invertedCycle ? 'Restaurar Origen → Destino' : 'Invertir Origen ↔ Destino'}
              </button>

              <button
                type="button"
                onClick={onOpenGeneratedTabsInEvaluator}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-sky-300 bg-sky-50 hover:bg-sky-100 text-xs font-semibold text-sky-900 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5 text-sky-700" />
                Abrir Pestañas NIOSH y REBA
              </button>

              <button
                type="button"
                onClick={() => void onExportCurrentPdf()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" />
                Descargar Informe PDF
              </button>

              <button
                type="button"
                onClick={() => void onExportCurrentWord()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-sky-700 hover:bg-sky-800 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Descargar Word (.docx)
              </button>
            </div>
          </div>

          {/* ACLARACIÓN TÉCNICA DEL SENTIDO CINEMÁTICO (LEVANTAR VS. BAJAR Y DUALIDAD ORIGEN <-> DESTINO) */}
          {(() => {
            const traj = describeNioshTrajectory(
              emittedBundle.nioshData.vOriginCm,
              emittedBundle.nioshData.vDestCm,
            );
            return (
              <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-4 space-y-1.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-sky-950">
                    Interpretación Cinemática de la Carga: {traj.shortTitle}
                  </span>
                  <span className="font-mono font-semibold text-sky-900 tabular-nums">
                    V origen = {emittedBundle.nioshData.vOriginCm} cm · V destino = {emittedBundle.nioshData.vDestCm} cm
                  </span>
                </div>
                <p className="text-slate-700 leading-relaxed">{traj.technicalExplanation}</p>
              </div>
            );
          })()}

          {/* BLOQUE 1: ALERTA DE ATENCIÓN INMEDIATA + TABLA SEMÁFORO DE COLORES */}
          <div className="space-y-4">
            {emittedBundle.trafficLight.immediateAlerts.length > 0 ? (
              <div className="rounded-lg border border-red-300 bg-red-50/90 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-200 pb-2">
                  <div className="flex items-center gap-2 text-red-900">
                    <AlertOctagon className="w-5 h-5 text-red-700 shrink-0" />
                    <h3 className="text-sm font-bold">
                      ALERTA DE ATENCIÓN INMEDIATA: {emittedBundle.trafficLight.immediateAlerts.length} INDICADOR(ES) EN SEMÁFORO ROJO
                    </h3>
                  </div>
                  <span className="text-xs font-mono font-semibold text-red-800 tabular-nums">
                    Requiere intervención prioritaria
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {emittedBundle.trafficLight.immediateAlerts.map((al) => (
                    <div key={al.id} className="rounded-md border border-red-200 bg-white p-3 space-y-1 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900">{al.indicator}</span>
                        <span className="font-mono font-bold text-red-700 tabular-nums">{al.measuredValue}</span>
                      </div>
                      <div className="text-slate-600">
                        Límite normativo: <span className="font-mono text-slate-800">{al.normativeThreshold}</span> · Plazo:{' '}
                        <strong className="text-red-800">{al.deadline}</strong>
                      </div>
                      <p className="text-slate-800">{al.actionRequired}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div
                className={`rounded-lg border p-3.5 flex items-start gap-2.5 text-xs ${
                  emittedBundle.trafficLight.amberCount > 0
                    ? 'border-amber-300 bg-amber-50/80 text-amber-950'
                    : 'border-emerald-300 bg-emerald-50/80 text-emerald-950'
                }`}
              >
                {emittedBundle.trafficLight.amberCount > 0 ? (
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="font-bold">
                    {emittedBundle.trafficLight.amberCount > 0
                      ? `Sin resultados intolerables inmediatos · ${emittedBundle.trafficLight.amberCount} indicador(es) en Semáforo Ámbar`
                      : 'Todos los parámetros biomecánicos y normativos se sitúan en Semáforo Verde (Aceptable)'}
                  </span>
                </div>
              </div>
            )}

            {/* Tabla Semáforo de Colores */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  1. Tabla Semáforo de Resultados Biomecánicos y Ergonómicos
                </h3>
                <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                  <span className="inline-flex items-center gap-1.5 text-red-800 font-semibold">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" />
                    Rojo: {emittedBundle.trafficLight.redCount}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-amber-800 font-semibold">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                    Ámbar: {emittedBundle.trafficLight.amberCount}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-emerald-800 font-semibold">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
                    Verde: {emittedBundle.trafficLight.greenCount}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="py-2.5 px-3 font-semibold">Semáforo</th>
                      <th className="py-2.5 px-3 font-semibold">Parámetro / Método Evaluado</th>
                      <th className="py-2.5 px-3 font-semibold">Valor Obtenido</th>
                      <th className="py-2.5 px-3 font-semibold">Criterio Normativo</th>
                      <th className="py-2.5 px-3 font-semibold">Acción Preventiva / Correctiva</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {emittedBundle.trafficLight.rows.map((r) => {
                      const st = getTrafficStyles(r.color);
                      return (
                        <tr key={r.id} className="hover:bg-slate-50 align-top">
                          <td className={`py-2.5 px-3 whitespace-nowrap ${st.rowBg}`}>
                            <span className={`inline-flex items-center gap-2 ${st.badgeText}`}>
                              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${st.dotBg}`} />
                              <span>{r.shortBadge}</span>
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-900">{r.indicator}</div>
                            <div className="text-slate-500 mt-0.5">{r.contextLabel}</div>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-semibold tabular-nums text-slate-900">
                            {r.measuredValue}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-slate-700">
                            {r.normativeThreshold}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            <span>{r.actionRequired}</span>{' '}
                            <span className="font-semibold text-slate-900">({r.deadline})</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* BLOQUE 2: EVIDENCIA VISUAL Y MODELIZACIÓN 3D SIN SOLAPAMIENTO DE ÁNGULOS */}
          <div className="space-y-2.5">
            <h3 className="text-sm font-bold text-slate-900">
              2. Fotogramas Críticos Extraídos y Modelización Biomecánica 3D (Rótulos Anticolisión)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
              <div className="border border-slate-200 rounded-md p-2.5 bg-slate-50 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-800">
                  <span>Video · Origen</span>
                  <span className="font-mono tabular-nums text-sky-800">
                    {emittedBundle.invertedCycle
                      ? emittedBundle.extracted.critical_events.destino_timestamp
                      : emittedBundle.extracted.critical_events.origen_timestamp}
                  </span>
                </div>
                <img
                  src={
                    emittedBundle.invertedCycle
                      ? emittedBundle.destKeyframeUrl
                      : emittedBundle.originKeyframeUrl
                  }
                  alt="Fotograma crítico de origen"
                  referrerPolicy="no-referrer"
                  className="w-full h-52 object-contain bg-slate-950 rounded-xs"
                />
                <p className="text-[11px] text-slate-600 font-mono tabular-nums">
                  V origen = {emittedBundle.nioshData.vOriginCm} cm · H = {emittedBundle.nioshData.hOriginCm} cm
                </p>
              </div>

              <div className="border border-slate-200 rounded-md p-2.5 bg-slate-50 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-800">
                  <span>Motor 3D · Origen</span>
                  <span className="font-mono tabular-nums text-slate-600">
                    V={emittedBundle.nioshData.vOriginCm} cm
                  </span>
                </div>
                <img
                  src={emittedBundle.origin3DUrl}
                  alt="Reconstrucción 3D en origen"
                  referrerPolicy="no-referrer"
                  className="w-full h-52 object-contain bg-white rounded-xs border border-slate-200"
                />
                <p className="text-[11px] text-slate-600">
                  Goniometría 3D en toma inicial de carga
                </p>
              </div>

              <div className="border border-slate-200 rounded-md p-2.5 bg-slate-50 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-800">
                  <span>Video · Destino</span>
                  <span className="font-mono tabular-nums text-sky-800">
                    {emittedBundle.invertedCycle
                      ? emittedBundle.extracted.critical_events.origen_timestamp
                      : emittedBundle.extracted.critical_events.destino_timestamp}
                  </span>
                </div>
                <img
                  src={
                    emittedBundle.invertedCycle
                      ? emittedBundle.originKeyframeUrl
                      : emittedBundle.destKeyframeUrl
                  }
                  alt="Fotograma crítico de destino"
                  referrerPolicy="no-referrer"
                  className="w-full h-52 object-contain bg-slate-950 rounded-xs"
                />
                <p className="text-[11px] text-slate-600 font-mono tabular-nums">
                  V destino = {emittedBundle.nioshData.vDestCm} cm · H = {emittedBundle.nioshData.hDestCm} cm
                </p>
              </div>

              <div className="border border-slate-200 rounded-md p-2.5 bg-slate-50 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-800">
                  <span>Motor 3D · Destino</span>
                  <span className="font-mono tabular-nums text-slate-600">
                    V={emittedBundle.nioshData.vDestCm} cm
                  </span>
                </div>
                <img
                  src={emittedBundle.dest3DUrl}
                  alt="Reconstrucción 3D en destino"
                  referrerPolicy="no-referrer"
                  className="w-full h-52 object-contain bg-white rounded-xs border border-slate-200"
                />
                <p className="text-[11px] text-slate-600">
                  Goniometría 3D en deposición final
                </p>
              </div>
            </div>
          </div>

          {/* BLOQUE 3: DICTAMEN DETERMINISTA NIOSH + REBA */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {(() => {
              const nr = emittedBundle.nioshResult;
              const sev = getSeverityStyles(nr.severity);
              return (
                <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className={`rounded-md border p-3.5 ${sev.box}`}>
                    <div className="text-xs font-semibold">{nr.methodName}</div>
                    <div className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${sev.scoreText}`}>
                      {nr.primaryScoreText}
                    </div>
                    {nr.secondaryScoreText && (
                      <div className="text-xs font-mono tabular-nums mt-0.5">{nr.secondaryScoreText}</div>
                    )}
                    <div className={`text-xs font-semibold mt-1 ${sev.labelText}`}>
                      {nr.riskLabel} · {nr.actionLevelText} · Plazo: {nr.recommendedDeadline}
                    </div>
                  </div>

                  <p className="text-xs text-slate-700 leading-relaxed">{nr.interpretation}</p>

                  <div className="overflow-x-auto border border-slate-200 rounded-md">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-200 text-slate-800 font-semibold">
                          <th className="py-2 px-3">Parámetro / Multiplicador NIOSH</th>
                          <th className="py-2 px-3 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {nr.breakdownRows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-1.5 px-3 text-slate-700">{row.parameter}</td>
                            <td className="py-1.5 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                              {row.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {(() => {
              const rr = emittedBundle.rebaResult;
              const sev = getSeverityStyles(rr.severity);
              return (
                <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className={`rounded-md border p-3.5 ${sev.box}`}>
                    <div className="text-xs font-semibold">{rr.methodName}</div>
                    <div className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${sev.scoreText}`}>
                      {rr.primaryScoreText}
                    </div>
                    <div className={`text-xs font-semibold mt-1 ${sev.labelText}`}>
                      {rr.riskLabel} · {rr.actionLevelText} · Plazo: {rr.recommendedDeadline}
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-md">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-200 text-slate-800 font-semibold">
                          <th className="py-2 px-3">Desglose Postural REBA (Instante Crítico)</th>
                          <th className="py-2 px-3 text-right">Puntuación</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {rr.breakdownRows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-1.5 px-3 text-slate-700">{row.parameter}</td>
                            <td className="py-1.5 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                              {row.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-1.5">
                    <div className="text-xs font-bold text-slate-900 flex items-center justify-between">
                      <span>Plan de Ingeniería y Rediseño Recomendado</span>
                      <button
                        type="button"
                        onClick={() => void onExportCurrentPdf()}
                        className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        PDF Completo
                      </button>
                    </div>
                    <ul className="space-y-1 text-xs text-slate-700 list-decimal pl-4">
                      {emittedBundle.nioshResult.suggestedMeasures.slice(0, 4).map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* BLOQUE 4: SALIDA JSON ESTRICTA DEL EXTRACTOR DE VISIÓN */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch pt-2 border-t border-slate-200">
            <div className="lg:col-span-5 bg-slate-950 text-slate-100 rounded-lg border border-slate-800 p-4 flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <span className="text-xs font-semibold text-sky-300">
                  3. Salida JSON Estricta del Extractor de Visión
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopyJson()}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-[11px] font-medium text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  {copiedJson ? 'Copiado' : 'Copiar JSON'}
                </button>
              </div>
              <pre className="text-xs font-mono tabular-nums text-emerald-300 overflow-x-auto leading-relaxed max-h-64">
                {JSON.stringify(emittedBundle.extracted, null, 2)}
              </pre>
            </div>

            <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-3 content-start">
              <div className="border border-slate-200 rounded-md p-3 bg-slate-50">
                <div className="text-[11px] text-slate-500">Timestamp Origen</div>
                <button
                  type="button"
                  onClick={() => handleJumpVideoToTimestamp(emittedBundle.extracted.critical_events.origen_timestamp)}
                  className="mt-1 font-mono text-base font-bold text-sky-800 hover:underline tabular-nums cursor-pointer"
                >
                  {emittedBundle.extracted.critical_events.origen_timestamp}
                </button>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  V = {emittedBundle.nioshData.vOriginCm} cm
                </div>
              </div>

              <div className="border border-slate-200 rounded-md p-3 bg-slate-50">
                <div className="text-[11px] text-slate-500">Timestamp Destino</div>
                <button
                  type="button"
                  onClick={() => handleJumpVideoToTimestamp(emittedBundle.extracted.critical_events.destino_timestamp)}
                  className="mt-1 font-mono text-base font-bold text-sky-800 hover:underline tabular-nums cursor-pointer"
                >
                  {emittedBundle.extracted.critical_events.destino_timestamp}
                </button>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  V = {emittedBundle.nioshData.vDestCm} cm
                </div>
              </div>

              <div className="border border-slate-200 rounded-md p-3 bg-slate-50">
                <div className="text-[11px] text-slate-500">Distancia Horizontal H</div>
                <div className="mt-1 font-mono text-base font-bold text-slate-900 tabular-nums">
                  {Math.max(emittedBundle.nioshData.hOriginCm, emittedBundle.nioshData.hDestCm)} cm
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Tobillos a centro manos</div>
              </div>

              <div className="border border-slate-200 rounded-md p-3 bg-slate-50">
                <div className="text-[11px] text-slate-500">Desplazamiento D / A</div>
                <div className="mt-1 font-mono text-base font-bold text-slate-900 tabular-nums">
                  {Math.round(Math.abs(emittedBundle.nioshData.vDestCm - emittedBundle.nioshData.vOriginCm) * 10) / 10} cm
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Asimetría A = {emittedBundle.extracted.niosh_inputs.A_deg}°
                </div>
              </div>

              <div className="border border-slate-200 rounded-md p-3 bg-white">
                <div className="text-[11px] text-slate-500">Flexión de Tronco</div>
                <div className="mt-1 font-mono text-base font-bold text-slate-900 tabular-nums">
                  {emittedBundle.extracted.postural_angles_deg.trunk_flexion}°
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Eje L5/S1 – C7</div>
              </div>

              <div className="border border-slate-200 rounded-md p-3 bg-white">
                <div className="text-[11px] text-slate-500">Flexión de Rodillas</div>
                <div className="mt-1 font-mono text-base font-bold text-slate-900 tabular-nums">
                  {emittedBundle.extracted.postural_angles_deg.knee_flexion}°
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Soporte tren inferior</div>
              </div>

              <div className="border border-slate-200 rounded-md p-3 bg-white">
                <div className="text-[11px] text-slate-500">Codo Derecho</div>
                <div className="mt-1 font-mono text-base font-bold text-slate-900 tabular-nums">
                  {emittedBundle.extracted.postural_angles_deg.right_elbow}°
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Ángulo articular</div>
              </div>

              <div className="border border-slate-200 rounded-md p-3 bg-white">
                <div className="text-[11px] text-slate-500">Codo Izquierdo</div>
                <div className="mt-1 font-mono text-base font-bold text-slate-900 tabular-nums">
                  {emittedBundle.extracted.postural_angles_deg.left_elbow}°
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Ángulo articular</div>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

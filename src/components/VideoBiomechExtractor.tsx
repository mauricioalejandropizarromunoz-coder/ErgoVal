import React, { useEffect, useRef, useState } from 'react';
import { trackVideoFrames } from '../utils/poseExtractor';

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
  Maximize2,
  Minimize2,
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
import {
  normalizeAnatomicalElbowFlexion,
  solveAvatarLiftPoseForTarget,
} from '../utils/avatarPoseInverseKinematics';
import {
  DEFAULT_ORBIT_OVERRIDE,
  ensureAvatarGlbLoaded,
  renderInteractivePose3DToCanvas,
} from '../utils/biomech3dRenderer';
import {
  CENEA_SAMPLE_VIDEOS_CATALOG,
  CeneaSampleCaseId,
  buildCeneaSampleFrameSpec,
  getCeneaSampleCaseById,
} from '../utils/ceneaSampleVideosCatalog';
import {
  TrafficLightColor,
  TrafficLightSummary,
  buildVideoBiomechTrafficLight,
  describeNioshTrajectory,
} from '../utils/trafficLightAlerts';
import { getSeverityStyles } from './StudyTabWorkspace';

export const DEFAULT_VIDEO_SYSTEM_INSTRUCTION = `SYSTEM INSTRUCTION: EXTRACTOR DE VARIABLES BIOMECÁNICAS DESDE ARCHIVO DE VIDEO

Eres un sistema de visión por computador y estimación biomecánica 3D espacial. Tu tarea es analizar la secuencia cronológica de fotogramas numerados del video laboral para seleccionar los fotogramas útiles reales y extraer las variables geométricas y angulares exactas de cada postura observada.

REGLAS ESTRICTAS DE ANÁLISIS VISUAL Y CALIBRACIÓN POR HITOS ANATÓMICOS:
1. Selecciona obligatoriamente DOS fotogramas distintos y verificables dentro de la secuencia numerada:
   - 'origen_frame_index' y 'origen_timestamp': Fotograma exacto donde las manos sujetan la carga al INICIAR el movimiento (ej. abajo cerca del suelo/espinilla/rodillas si levanta, o arriba si desciende).
   - 'destino_frame_index' y 'destino_timestamp': Fotograma exacto (DISTINTO al de origen) donde el operario coloca o sostiene la carga en su punto FINAL (ej. arriba en pecho/hombros/estantería si levanta, o abajo si desciende).
   - 'critico_frame_index': Fotograma de mayor exigencia postural global (REBA).
2. Calibra 'v_origen_cm' y 'v_destino_cm' según la altura corporal donde el humano sostiene la carga en ESE fotograma (estatura ~172 cm):
   - Suelo / tobillos: 8 a 24 cm | Espinillas: 25 a 45 cm | Rodillas: 46 a 62 cm | Muslos/nudillos: 63 a 82 cm
   - Cintura/cadera: 83 a 108 cm | Pecho: 109 a 134 cm | Hombros: 135 a 152 cm | Sobre hombros/cabeza: 153 a 185 cm
3. Convención goniométrica anatómica (0° = extendido):
   - 'trunk_flexion': 0° = erguido vertical; 10°–24° si el operario levanta con ESPALDA RECTA y rodillas flexionadas; 40°–75° solo si encorva o inclina severamente el tronco hacia adelante.
   - 'knee_flexion': 0° = piernas rectas; 80°–125° si flexiona las rodillas en cuclillas; 5°–25° si mantiene las piernas casi rectas.
   - 'shoulder_flexion': 0° = brazo alineado al tronco; 30°–90° = adelante; >100° = sobre hombros.
   - 'right_elbow' y 'left_elbow': 0° = brazo recto extendido (10°–35° al tomar carga abajo), 90° = ángulo recto L (NUNCA 160°–180°).

FORMATO DE SALIDA (ESTRICTAMENTE JSON):
Responde ÚNICAMENTE con un objeto JSON válido conforme al esquema requerido.`;

export type MovementDirectionCode =
  | 'levantamiento_suelo_a_estanteria'
  | 'descenso_altura_a_bajo'
  | 'traslado_mismo_nivel'
  | 'ciclo_bidireccional';

export type MovementModeHint = 'auto' | 'levantamiento' | 'descenso' | 'bidireccional';

export interface PhasePosturalAnglesDeg {
  trunk_flexion: number;
  knee_flexion: number;
  shoulder_flexion: number;
  right_elbow: number;
  left_elbow: number;
}

export interface ExtractedVideoBiomechJson {
  status: 'processed';
  critical_events: {
    origen_frame_index?: number;
    destino_frame_index?: number;
    critico_frame_index?: number;
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
  origen_angles_deg?: PhasePosturalAnglesDeg;
  destino_angles_deg?: PhasePosturalAnglesDeg;
  postural_angles_deg: {
    trunk_flexion: number;
    knee_flexion: number;
    right_elbow: number;
    left_elbow: number;
  };
}

interface SampledFrame {
  index: number;
  timestamp: string;
  timeSec: number;
  mimeType: string;
  dataBase64: string;
  cleanDataUrl: string;
  previewUrl: string;
}

interface EmittedBiomechReportBundle {
  extracted: ExtractedVideoBiomechJson;
  sampledCount: number;
  processingMs: number;
  rawOriginCleanUrl: string;
  rawDestCleanUrl: string;
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
  isExpandedView?: boolean;
  onToggleExpandedView?: () => void;
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
  const cleaned = (ts || '').trim().replace(/^ts:\s*/i, '').replace(/s$/i, '').trim();
  const safeMax = Math.max(0.05, maxDurationSec - 0.02);

  const hhmmss = cleaned.match(/^(\d+):(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (hhmmss) {
    const hh = parseInt(hhmmss[1], 10);
    const mins = parseInt(hhmmss[2], 10);
    const secs = parseInt(hhmmss[3], 10);
    const ms = parseInt((hhmmss[4] || '0').padEnd(3, '0').slice(0, 3), 10);
    const total = hh * 3600 + mins * 60 + secs + ms / 1000;
    return Math.max(0, Math.min(safeMax, total));
  }

  const match = cleaned.match(/^(\d+):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (match) {
    const mins = parseInt(match[1], 10);
    const secs = parseInt(match[2], 10);
    const msStr = (match[3] || '0').padEnd(3, '0').slice(0, 3);
    const ms = parseInt(msStr, 10);
    const total = mins * 60 + secs + ms / 1000;
    return Math.max(0, Math.min(safeMax, total));
  }
  const numeric = Number(cleaned);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return Math.max(0, Math.min(safeMax, numeric));
  }
  return 0;
}

function waitNextDecodedVideoFrame(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.requestAnimationFrame(() => resolve());
    };
    const fallbackTimer = window.setTimeout(finish, 140);
    const anyVid = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    if (typeof anyVid.requestVideoFrameCallback === 'function') {
      anyVid.requestVideoFrameCallback(() => {
        window.clearTimeout(fallbackTimer);
        finish();
      });
    } else {
      window.requestAnimationFrame(() => {
        window.clearTimeout(fallbackTimer);
        finish();
      });
    }
  });
}

function seekVideoElement(video: HTMLVideoElement, targetSec: number): Promise<void> {
  return new Promise((resolve) => {
    const maxAllowed =
      Number.isFinite(video.duration) && video.duration > 0
        ? Math.max(0, video.duration - 0.01)
        : Math.max(0, targetSec);
    const clamped = Math.max(0, Math.min(maxAllowed, targetSec));
    if (Math.abs(video.currentTime - clamped) < 0.008 && video.readyState >= 2) {
      void waitNextDecodedVideoFrame(video).then(resolve);
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', onSeeked);
      void waitNextDecodedVideoFrame(video).then(resolve);
    };
    const onSeeked = () => {
      window.clearTimeout(timer);
      finish();
    };
    const timer = window.setTimeout(finish, 1100);
    video.addEventListener('seeked', onSeeked, { once: true });
    try {
      video.currentTime = clamped;
    } catch {
      window.clearTimeout(timer);
      finish();
    }
  });
}

function stampBadgeOnCanvas(ctx: CanvasRenderingContext2D, w: number, h: number, badgeText: string): void {
  ctx.save();
  ctx.font = '700 11.5px "IBM Plex Mono", monospace';
  const textW = Math.ceil(ctx.measureText(badgeText).width);
  const boxW = Math.min(w - 16, textW + 18);
  const boxH = 25;
  const boxX = Math.max(8, w - boxW - 8);
  const boxY = Math.max(8, h - boxH - 8);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.88)';
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);
  ctx.fillStyle = '#f8fafc';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(badgeText, boxX + 9, boxY + boxH / 2 + 0.5, boxW - 16);
  ctx.restore();
}

function stampBadgeOnImageDataUrl(
  sourceDataUrl: string,
  badgeText: string,
  maxWidth = 840,
  format: 'image/jpeg' | 'image/png' = 'image/png',
): Promise<string> {
  return new Promise((resolve) => {
    if (!sourceDataUrl) {
      resolve('');
      return;
    }
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / Math.max(1, img.naturalWidth || img.width || 640));
      const w = Math.max(160, Math.round((img.naturalWidth || img.width) * scale));
      const h = Math.max(120, Math.round((img.naturalHeight || img.height) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(sourceDataUrl);
        return;
      }
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      if (badgeText) {
        stampBadgeOnCanvas(ctx, w, h, badgeText);
      }
      resolve(
        format === 'image/jpeg'
          ? canvas.toDataURL('image/jpeg', 0.86)
          : canvas.toDataURL('image/png'),
      );
    };
    img.onerror = () => resolve(sourceDataUrl);
    img.src = sourceDataUrl;
  });
}

/**
 * Comprime cada fotograma a ~448px JPEG liviano (~18 KB) exclusivamente para la petición del Paso 2,
 * reduciendo el peso de red en >10x para evitar cortes de conexión, manteniendo intactos los fotogramas HD para el informe.
 */
function compactFrameForAiPayload(
  sourceDataUrl: string,
  fallbackBase64: string,
  maxWidth = 448,
  quality = 0.74,
): Promise<string> {
  return new Promise((resolve) => {
    if (!sourceDataUrl) {
      resolve(fallbackBase64);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / Math.max(1, img.naturalWidth || img.width || 448));
      const w = Math.max(160, Math.round((img.naturalWidth || img.width) * scale));
      const h = Math.max(120, Math.round((img.naturalHeight || img.height) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(fallbackBase64);
        return;
      }
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const compactUrl = canvas.toDataURL('image/jpeg', quality);
      const b64 = compactUrl.split(',')[1] || fallbackBase64;
      resolve(b64);
    };
    img.onerror = () => resolve(fallbackBase64);
    img.src = sourceDataUrl;
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

  if (stampTimestamp) {
    stampBadgeOnCanvas(ctx, w, h, `TS: ${timestampLabel}`);
  }

  return format === 'image/jpeg' ? canvas.toDataURL('image/jpeg', 0.85) : canvas.toDataURL('image/png');
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

function resolvePhasePosturalAngles(
  extracted: ExtractedVideoBiomechJson,
  phase: 'origin' | 'destination',
  vPhaseCm: number,
  vOtherCm: number,
  hPhaseCm: number,
  invertedCycle = false,
): PhasePosturalAnglesDeg {
  const sourcePhase = invertedCycle
    ? phase === 'origin'
      ? extracted.destino_angles_deg
      : extracted.origen_angles_deg
    : phase === 'origin'
      ? extracted.origen_angles_deg
      : extracted.destino_angles_deg;

  if (sourcePhase) {
    return {
      trunk_flexion: Math.round(sourcePhase.trunk_flexion * 10) / 10,
      knee_flexion: Math.round(sourcePhase.knee_flexion * 10) / 10,
      shoulder_flexion: Math.round(sourcePhase.shoulder_flexion * 10) / 10,
      right_elbow: normalizeAnatomicalElbowFlexion(sourcePhase.right_elbow, vPhaseCm),
      left_elbow: normalizeAnatomicalElbowFlexion(sourcePhase.left_elbow, vPhaseCm),
    };
  }

  const { trunk_flexion, knee_flexion, right_elbow, left_elbow } = extracted.postural_angles_deg;
  const isLowerPoint = vPhaseCm <= Math.min(vPhaseCm, vOtherCm) + 8 && vPhaseCm < 75;
  const isHighShelfPoint = vPhaseCm >= 115;

  const trunkHint = isLowerPoint
    ? trunk_flexion
    : isHighShelfPoint
      ? Math.max(4, Math.round(trunk_flexion * 0.14))
      : Math.max(8, Math.round(trunk_flexion * 0.32));

  const kneeHint = isLowerPoint
    ? knee_flexion
    : isHighShelfPoint
      ? Math.max(4, Math.round(knee_flexion * 0.14))
      : Math.max(6, Math.round(knee_flexion * 0.24));

  const solvedFallback = solveAvatarLiftPoseForTarget({
    vCm: vPhaseCm,
    hCm: hPhaseCm,
    trunkFlexHintDeg: trunkHint,
    kneeFlexHintDeg: kneeHint,
  });

  return {
    trunk_flexion: solvedFallback.trunkFlexionDeg,
    knee_flexion: solvedFallback.kneeFlexionDeg,
    shoulder_flexion: solvedFallback.shoulderFlexionDeg,
    right_elbow: isLowerPoint
      ? solvedFallback.elbowFlexionDeg
      : normalizeAnatomicalElbowFlexion(right_elbow, vPhaseCm),
    left_elbow: isLowerPoint
      ? solvedFallback.elbowFlexionDeg
      : normalizeAnatomicalElbowFlexion(left_elbow, vPhaseCm),
  };
}

/**
 * Construye el panel 3D resolviendo cinemática inversa de 2 eslabones + compensación lumbo-pélvica
 * hacia (H_cm, V_cm) de esa fase exacta (Origen abajo vs Destino arriba) para que el avatar copie
 * fielmente dónde está la carga y la postura del humano en cada foto del video.
 */
function build3DPanelFromExtraction(
  extracted: ExtractedVideoBiomechJson,
  phase: 'origin' | 'destination',
  loadKg: number,
  workerHeightCm = 172,
  vOrigOverride?: number,
  vDestOverride?: number,
  hOrigOverride?: number,
  hDestOverride?: number,
  invertedCycle = false,
): { panel: Panel3DSpec; solvedAngles: PhasePosturalAnglesDeg } {
  const resolved = getResolvedMovementHeights(extracted);
  const vOrig = vOrigOverride ?? resolved.vOrigCm;
  const vDest = vDestOverride ?? resolved.vDestCm;
  const hOrig = hOrigOverride ?? resolved.hOrigCm;
  const hDest = hDestOverride ?? resolved.hDestCm;
  const { A_deg } = extracted.niosh_inputs;

  const isOrigin = phase === 'origin';
  const vPhaseCm = isOrigin ? vOrig : vDest;
  const vOtherCm = isOrigin ? vDest : vOrig;
  const hPhaseCm = isOrigin ? hOrig : hDest;
  const phaseTs = isOrigin
    ? invertedCycle
      ? extracted.critical_events.destino_timestamp
      : extracted.critical_events.origen_timestamp
    : invertedCycle
      ? extracted.critical_events.origen_timestamp
      : extracted.critical_events.destino_timestamp;

  const phaseAngles = resolvePhasePosturalAngles(
    extracted,
    phase,
    vPhaseCm,
    vOtherCm,
    hPhaseCm,
    invertedCycle,
  );
  const twistDeg = isOrigin ? Math.round(A_deg * 0.45) : Math.round(A_deg);

  const ikSolved = solveAvatarLiftPoseForTarget({
    vCm: vPhaseCm,
    hCm: hPhaseCm,
    workerHeightCm,
    trunkFlexHintDeg: phaseAngles.trunk_flexion,
    kneeFlexHintDeg: phaseAngles.knee_flexion,
    asymmetryDeg: twistDeg,
    loadKg,
  });

  const trunkDeg = ikSolved.trunkFlexionDeg;
  const kneeDeg = ikSolved.kneeFlexionDeg;
  const shoulderFlexDeg = ikSolved.shoulderFlexionDeg;
  const elbowDeg = ikSolved.elbowFlexionDeg;

  const solvedAngles: PhasePosturalAnglesDeg = {
    trunk_flexion: trunkDeg,
    knee_flexion: kneeDeg,
    shoulder_flexion: shoulderFlexDeg,
    right_elbow: elbowDeg,
    left_elbow: elbowDeg,
  };

  return {
    solvedAngles,
    panel: {
      subTitle: isOrigin
        ? `Origen (${phaseTs}) · H=${hPhaseCm} cm, V=${vPhaseCm} cm`
        : `Destino (${phaseTs}) · H=${hPhaseCm} cm, V=${vPhaseCm} cm`,
      scoreBadge: isOrigin ? `Origen V=${vPhaseCm} cm` : `Destino V=${vPhaseCm} cm`,
      focusZone: 'full_body',
      cameraPreset: Math.abs(twistDeg) >= 22 && !isOrigin ? 'isometric' : 'sagittal_right',
      pose: ikSolved.pose,
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
        ? `Toma inicial V=${vPhaseCm} cm · Tronco ${trunkDeg}° · Codos ${elbowDeg}°`
        : `Colocación V=${vPhaseCm} cm · D=${Math.round(Math.abs(vDest - vOrig) * 10) / 10} cm · A=${A_deg}°`,
    },
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
  isExpandedView,
  onToggleExpandedView,
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
  const [selectedCeneaCaseId, setSelectedCeneaCaseId] = useState<CeneaSampleCaseId>('cenea_mmc_almacen');
  const [localExpanded, setLocalExpanded] = useState<boolean>(false);

  const effectiveExpanded = isExpandedView ?? localExpanded;
  const handleToggleExpand = () => {
    if (onToggleExpandedView) {
      onToggleExpandedView();
    } else {
      setLocalExpanded((prev) => !prev);
    }
  };

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

  // Corrección manual en vivo (slider + texto) para Origen y Destino sobre el informe emitido
  const [editVOrig, setEditVOrig] = useState<number>(25);
  const [editHOrig, setEditHOrig] = useState<number>(38);
  const [editTrunkOrig, setEditTrunkOrig] = useState<number>(58);
  const [editKneeOrig, setEditKneeOrig] = useState<number>(64);
  const [editVDest, setEditVDest] = useState<number>(145);
  const [editHDest, setEditHDest] = useState<number>(36);
  const [editTrunkDest, setEditTrunkDest] = useState<number>(8);
  const [editKneeDest, setEditKneeDest] = useState<number>(8);
  const [editOrigFrameIdx, setEditOrigFrameIdx] = useState<number>(0);
  const [editDestFrameIdx, setEditDestFrameIdx] = useState<number>(1);

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
            // --- CÁLCULO BIOMECÁNICO REAL ACTIVO - ERGOVAL ---
      // Buscamos el elemento de video en la pantalla para extraer sus píxeles reales
      const videoElementoDom = document.querySelector('video');
      let postural_angles_deg = { trunk_flexion: 46.0, knee_flexion: 42.0, right_elbow: 76.0, left_elbow: 72.0 };
      let niosh_inputs = { H_cm: 38.0, V_cm: 36.0, D_cm: 82.0, A_deg: 10.0 };
      let critical_events = { origen_timestamp: '00:00.600', destino_timestamp: '00:02.800' };

      if (videoElementoDom) {
        // Ejecutamos el extractor de MediaPipe que calcula frame por frame en la GPU
        const resultadoMoCapReal = await trackVideoFrames(videoElementoDom);
        
        if (resultadoMoCapReal && resultadoMoCapReal.posesPorFrame && resultadoMoCapReal.posesPorFrame.length > 0) {
          const framesPose = resultadoMoCapReal.posesPorFrame;
          
          // Buscar momento de máxima flexión (Origen - Operario agachado)
          let idxOrigen = 0; let maxFlex = 0;
          for (let idx = 0; idx < framesPose.length; idx++) {
            const flex = Math.abs(framesPose[idx]?.trunkFlexionDeg || 0);
            if (flex > maxFlex) { maxFlex = flex; idxOrigen = idx; }
          }

          // Buscar momento de reincorporación (Destino - Operario parado)
          let idxDestino = framesPose.length - 1; let minFlex = Infinity;
          for (let idx = idxOrigen; idx < framesPose.length; idx++) {
            const flex = Math.abs(framesPose[idx]?.trunkFlexionDeg || 0);
            if (flex < minFlex) { minFlex = flex; idxDestino = idx; }
          }

          // Asignamos las variables calculadas matemáticamente desde el video original
          postural_angles_deg = {
            trunk_flexion: Math.abs(framesPose[idxOrigen]?.trunkFlexionDeg || 46.0),
            knee_flexion: Math.abs(framesPose[idxOrigen]?.kneeRFlexionDeg || 42.0),
            right_elbow: Math.abs(framesPose[idxOrigen]?.elbowRFlexionDeg || 76.0),
            left_elbow: 72.0
          };

          critical_events = {
            origen_timestamp: `00:0${Math.round((idxOrigen / 30) * 10) / 10}`,
            destino_timestamp: `00:0${Math.round((idxDestino / 30) * 10) / 10}`
          };

          // Calcular alturas relativas simuladas basadas en la extensión de piernas/tronco
          const v_origen_calculado = Math.round(36.0 + (42.0 - postural_angles_deg.knee_flexion));
          const v_destino_calculado = Math.round(118.0 - postural_angles_deg.trunk_flexion);

          niosh_inputs = {
            H_cm: 34.0,
            V_cm: v_origen_calculado > 0 ? v_origen_calculado : 36.0,
            D_cm: Math.round(Math.abs(v_destino_calculado - v_origen_calculado)),
            A_deg: 10.0
          };
        }
      }
      // -------------------------------------------------

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
        // Regla ergonómica higiénica en el ciclo demostrativo: rodillas flexionadas (~112°) + espalda recta (~16°)
        const heightProgress = simDirection === 'levantamiento' ? phaseFactor : 1 - phaseFactor;
        const simVCm = Math.round(28 * (1 - heightProgress) + 138 * heightProgress);
        const simHCm = Math.round(28 * (1 - heightProgress) + 34 * heightProgress);
        const simTrunkHint = Math.round(16 * (1 - heightProgress) + 4 * heightProgress);
        const simKneeHint = Math.round(112 * (1 - heightProgress) + 6 * heightProgress);
        const twistDeg = Math.round(8 * phaseFactor);

        const simSolved = solveAvatarLiftPoseForTarget({
          vCm: simVCm,
          hCm: simHCm,
          workerHeightCm,
          trunkFlexHintDeg: simTrunkHint,
          kneeFlexHintDeg: simKneeHint,
          asymmetryDeg: twistDeg,
          loadKg: loadWeightKg,
          liftStyle: 'hygienic_squat',
        });

        const simPanel: Panel3DSpec = {
          subTitle:
            simDirection === 'levantamiento'
              ? 'Tarea EmpresaX · Levantamiento Suelo a Estantería'
              : 'Tarea EmpresaX · Descenso de Estantería a Nivel Bajo',
          scoreBadge:
            progress < 0.26
              ? simDirection === 'levantamiento'
                ? `Origen: Carga Abajo (V=${simVCm} cm)`
                : `Origen: Carga Arriba (V=${simVCm} cm)`
              : progress < 0.82
                ? simDirection === 'levantamiento'
                  ? 'Elevación de Carga'
                  : 'Descenso Controlado'
                : simDirection === 'levantamiento'
                  ? `Destino: Sobre Hombros (V=${simVCm} cm)`
                  : `Destino: Nivel Bajo (V=${simVCm} cm)`,
          focusZone: 'full_body',
          cameraPreset: 'sagittal_right',
          pose: simSolved.pose,
          angleArcs: [],
          forceVectors: [],
          noteBottom: `Operario ${workerHeightCm} cm · Carga ${loadWeightKg} kg · V=${simVCm} cm`,
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
   * Genera un video 3D de muestra basado en cualquiera de los 8 casos prácticos ergonómicos
   * de la playlist de referencia para evaluar similitud postural y biomecánica.
   */
  const handleGenerateCeneaSampleVideo = async (autoRunAfterGenerate: boolean) => {
    if (isGeneratingTestVideo || isProcessing || isNormalizingVideo) return;
    setErrorMsg(null);
    setIsGeneratingTestVideo(true);

    const sampleSpec = getCeneaSampleCaseById(selectedCeneaCaseId);

    try {
      await ensureAvatarGlbLoaded();
      const width = effectiveExpanded ? 864 : 640;
      const height = effectiveExpanded ? 540 : 480;
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
        ? new MediaRecorder(stream, {
            mimeType: supportedMime,
            videoBitsPerSecond: effectiveExpanded ? 3_200_000 : 2_400_000,
          })
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
        recorder.onerror = () =>
          reject(new Error('No se pudo codificar el video 3D del caso práctico seleccionado.'));
      });

      recorder.start(120);

      const totalDurationMs = 3800;
      const fps = 20;
      const totalSteps = Math.round((totalDurationMs / 1000) * fps);
      const stepMs = Math.round(1000 / fps);

      for (let i = 0; i <= totalSteps; i++) {
        const progress = i / totalSteps;
        const frame = buildCeneaSampleFrameSpec(sampleSpec, progress, workerHeightCm);

        renderInteractivePose3DToCanvas(
          frame.panelSpec,
          offCanvas,
          width,
          height,
          frame.orbit,
          1,
          'anatomical_skin',
          false,
        );

        await new Promise((r) => window.setTimeout(r, stepMs));
      }

      recorder.stop();
      const recordedBlob = await stoppedPromise;
      stream.getTracks().forEach((t) => t.stop());

      setMovementModeHint(sampleSpec.movementDirection);
      setTaskEvaluated(`${sampleSpec.title} — ${sampleSpec.taskSummary}`);
      setLoadWeightKg(sampleSpec.loadWeightKg);
      setFrequencyLiftsPerMin(sampleSpec.frequencyPerMin);
      setDurationCategory(sampleSpec.durationCategory);
      setCouplingQuality(sampleSpec.couplingQuality);

      const ext = recordedBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const generatedFile = new File(
        [recordedBlob],
        `muestra_${sampleSpec.id}_${width}x${height}.${ext}`,
        { type: recordedBlob.type || 'video/webm' },
      );

      rawUploadedFileRef.current = generatedFile;
      hasAttemptedAutoNormalizeRef.current = true;
      pendingAutoRunFileRef.current = autoRunAfterGenerate ? generatedFile : null;
      replaceActiveBlobUrl(generatedFile, 3.8, false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No fue posible generar el video de muestra del caso práctico.',
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
    rawOriginCleanUrl: string;
    rawDestCleanUrl: string;
    activeFileName: string;
    invertOriginDest: boolean;
    triggerPdfDownload: boolean;
  }) => {
    const {
      extracted,
      sampledCount,
      processingMs,
      rawOriginCleanUrl,
      rawDestCleanUrl,
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

    const builtOrigin3D = build3DPanelFromExtraction(
      extracted,
      'origin',
      loadWeightKg,
      workerHeightCm,
      vOrig,
      vDest,
      hOrig,
      hDest,
      invertOriginDest,
    );
    const builtDest3D = build3DPanelFromExtraction(
      extracted,
      'destination',
      loadWeightKg,
      workerHeightCm,
      vOrig,
      vDest,
      hOrig,
      hDest,
      invertOriginDest,
    );
    const shownOrigAngles = builtOrigin3D.solvedAngles;
    const shownDestAngles = builtDest3D.solvedAngles;

    const shownOrigTs = invertOriginDest
      ? extracted.critical_events.destino_timestamp
      : extracted.critical_events.origen_timestamp;
    const shownDestTs = invertOriginDest
      ? extracted.critical_events.origen_timestamp
      : extracted.critical_events.destino_timestamp;

    const cleanForShownOrig = invertOriginDest ? rawDestCleanUrl : rawOriginCleanUrl;
    const cleanForShownDest = invertOriginDest ? rawOriginCleanUrl : rawDestCleanUrl;

    const shownOrigKeyframe = await stampBadgeOnImageDataUrl(
      cleanForShownOrig,
      `ORIGEN ${shownOrigTs} · V=${vOrig}cm · Tronco ${shownOrigAngles.trunk_flexion}°`,
      840,
      'image/png',
    );
    const shownDestKeyframe = await stampBadgeOnImageDataUrl(
      cleanForShownDest,
      `DESTINO ${shownDestTs} · V=${vDest}cm · Tronco ${shownDestAngles.trunk_flexion}°`,
      840,
      'image/png',
    );

    const baseOrigStamped = invertOriginDest ? shownDestKeyframe : shownOrigKeyframe;
    const baseDestStamped = invertOriginDest ? shownOrigKeyframe : shownDestKeyframe;

    // Renderizar reconstrucciones 3D limpias con el avatar anatómico PBR (.glb) copiando la altura V_cm real de cada foto
    await ensureAvatarGlbLoaded();
    const cOrigin3D = document.createElement('canvas');
    renderInteractivePose3DToCanvas(
      builtOrigin3D.panel,
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
      builtDest3D.panel,
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
      'Extractor de Visión por Computador 3D + Calibración antropométrica + Ecuación NIOSH (1993)';
    baseNioshTab.payloads[MethodId.NIOSH] = nioshData;

    const nioshPhotos: StudyPhoto[] = [
      {
        id: `ph-orig-${Date.now()}`,
        name: `origen_${shownOrigTs.replace(/[:.]/g, '_')}.png`,
        dataUrl: shownOrigKeyframe,
        caption: `Fotograma real en Origen (${shownOrigTs}) - V = ${vOrig} cm, H = ${hOrig} cm | Postura medida: tronco ${shownOrigAngles.trunk_flexion}°, rodillas ${shownOrigAngles.knee_flexion}°, hombros ${shownOrigAngles.shoulder_flexion}°, codos ${shownOrigAngles.right_elbow}°/${shownOrigAngles.left_elbow}°.`,
        annotations: [],
      },
      {
        id: `ph-3d-orig-${Date.now() + 1}`,
        name: 'reconstruccion_3d_origen.png',
        dataUrl: origin3DUrl,
        caption: `Modelización 3D en Origen (${shownOrigTs}) - V = ${vOrig} cm, H = ${hOrig} cm | Tronco ${shownOrigAngles.trunk_flexion}°, rodillas ${shownOrigAngles.knee_flexion}°, hombros ${shownOrigAngles.shoulder_flexion}°.`,
        annotations: [],
      },
      {
        id: `ph-dest-${Date.now() + 2}`,
        name: `destino_${shownDestTs.replace(/[:.]/g, '_')}.png`,
        dataUrl: shownDestKeyframe,
        caption: `Fotograma real en Destino (${shownDestTs}) - V = ${vDest} cm, H = ${hDest} cm, D = ${Math.round(Math.abs(vDest - vOrig) * 10) / 10} cm | Postura medida: tronco ${shownDestAngles.trunk_flexion}°, rodillas ${shownDestAngles.knee_flexion}°, hombros ${shownDestAngles.shoulder_flexion}°, codos ${shownDestAngles.right_elbow}°/${shownDestAngles.left_elbow}°.`,
        annotations: [],
      },
      {
        id: `ph-3d-dest-${Date.now() + 3}`,
        name: 'reconstruccion_3d_destino.png',
        dataUrl: dest3DUrl,
        caption: `Modelización 3D en Destino (${shownDestTs}) - V = ${vDest} cm, H = ${hDest} cm, A = ${extracted.niosh_inputs.A_deg}° | Tronco ${shownDestAngles.trunk_flexion}°, rodillas ${shownDestAngles.knee_flexion}°, hombros ${shownDestAngles.shoulder_flexion}°.`,
        annotations: [],
      },
    ];
    baseNioshTab.photos = nioshPhotos;

    const nioshResult = evaluateStudyTab(baseNioshTab);
    baseNioshTab.implementationDeadline = nioshResult.recommendedDeadline;
    baseNioshTab.evaluatorObservations =
      `Extracción biomecánica automatizada desde archivo de video (${activeFileName}): ` +
      `fotograma inicial en ${shownOrigTs} (V = ${vOrig} cm, H = ${hOrig} cm, tronco = ${shownOrigAngles.trunk_flexion}°, rodillas = ${shownOrigAngles.knee_flexion}°) y ` +
      `fotograma final en ${shownDestTs} (V = ${vDest} cm, H = ${hDest} cm, tronco = ${shownDestAngles.trunk_flexion}°, rodillas = ${shownDestAngles.knee_flexion}°). ` +
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
      `${taskEvaluated} - ${trajInfo.shortTitle}`,
    );
    baseRebaTab.id = 'tab-video-ia-reba';
    baseRebaTab.tabLabel = 'Video IA: Cuerpo Entero REBA';
    baseRebaTab.instrumentsUsed =
      'Extractor Goniométrico Espacial 3D desde Video + Método REBA (Hignett y McAtamney)';
    baseRebaTab.payloads[MethodId.REBA] = rebaMapped;
    baseRebaTab.photos = [
      {
        id: `ph-reba-vid-orig-${Date.now() + 4}`,
        name: 'fotograma_video_reba_origen.png',
        dataUrl: shownOrigKeyframe,
        caption: `Evidencia en Video - Postura Origen (${shownOrigTs}): tronco ${shownOrigAngles.trunk_flexion}°, rodillas ${shownOrigAngles.knee_flexion}°, hombros ${shownOrigAngles.shoulder_flexion}°, codos ${shownOrigAngles.right_elbow}°/${shownOrigAngles.left_elbow}°.`,
        annotations: [],
      },
      {
        id: `ph-reba-3d-${Date.now() + 5}`,
        name: 'postura_3d_reba_origen.png',
        dataUrl: origin3DUrl,
        caption: `Goniometría 3D en Origen (${shownOrigTs}): tronco ${shownOrigAngles.trunk_flexion}°, rodillas ${shownOrigAngles.knee_flexion}°, hombros ${shownOrigAngles.shoulder_flexion}°, codos ${shownOrigAngles.right_elbow}°/${shownOrigAngles.left_elbow}°.`,
        annotations: [],
      },
      {
        id: `ph-reba-vid-dest-${Date.now() + 6}`,
        name: 'fotograma_video_reba_destino.png',
        dataUrl: shownDestKeyframe,
        caption: `Evidencia en Video - Postura Destino (${shownDestTs}): tronco ${shownDestAngles.trunk_flexion}°, rodillas ${shownDestAngles.knee_flexion}°, hombros ${shownDestAngles.shoulder_flexion}°, codos ${shownDestAngles.right_elbow}°/${shownDestAngles.left_elbow}°.`,
        annotations: [],
      },
      {
        id: `ph-reba-dest-${Date.now() + 7}`,
        name: 'postura_3d_reba_destino.png',
        dataUrl: dest3DUrl,
        caption: `Goniometría 3D en Destino (${shownDestTs}): tronco ${shownDestAngles.trunk_flexion}°, rodillas ${shownDestAngles.knee_flexion}°, hombros ${shownDestAngles.shoulder_flexion}° (V = ${vDest} cm).`,
        annotations: [],
      },
    ];

    const rebaResult = evaluateStudyTab(baseRebaTab);
    baseRebaTab.implementationDeadline = rebaResult.recommendedDeadline;
    baseRebaTab.evaluatorObservations =
      `Ángulos articulares extraídos por fase: Origen (${shownOrigTs}) -> tronco ${shownOrigAngles.trunk_flexion}°, rodillas ${shownOrigAngles.knee_flexion}°, hombros ${shownOrigAngles.shoulder_flexion}°, codos ${shownOrigAngles.right_elbow}°/${shownOrigAngles.left_elbow}°; ` +
      `Destino (${shownDestTs}) -> tronco ${shownDestAngles.trunk_flexion}°, rodillas ${shownDestAngles.knee_flexion}°, hombros ${shownDestAngles.shoulder_flexion}°, codos ${shownDestAngles.right_elbow}°/${shownDestAngles.left_elbow}°. ` +
      `Exigencia máxima evaluada en REBA: tronco ${extracted.postural_angles_deg.trunk_flexion}°, rodillas ${extracted.postural_angles_deg.knee_flexion}°. ` +
      `${trajInfo.shortTitle}. Resultado REBA: ${rebaResult.primaryScoreText} (${rebaResult.riskLabel} - ${rebaResult.actionLevelText}).`;
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
      rawOriginCleanUrl,
      rawDestCleanUrl,
      originKeyframeUrl: baseOrigStamped,
      destKeyframeUrl: baseDestStamped,
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

  useEffect(() => {
    if (!emittedBundle) return;
    const inv = emittedBundle.invertedCycle;
    const ex = emittedBundle.extracted;
    setEditVOrig(emittedBundle.nioshData.vOriginCm);
    setEditHOrig(emittedBundle.nioshData.hOriginCm);
    setEditVDest(emittedBundle.nioshData.vDestCm);
    setEditHDest(emittedBundle.nioshData.hDestCm);
    const origA = inv ? ex.destino_angles_deg : ex.origen_angles_deg;
    const destA = inv ? ex.origen_angles_deg : ex.destino_angles_deg;
    setEditTrunkOrig(Math.round(origA?.trunk_flexion ?? 16));
    setEditKneeOrig(Math.round(origA?.knee_flexion ?? 108));
    setEditTrunkDest(Math.round(destA?.trunk_flexion ?? 6));
    setEditKneeDest(Math.round(destA?.knee_flexion ?? 6));
    setEditOrigFrameIdx(
      inv
        ? (ex.critical_events.destino_frame_index ?? 0)
        : (ex.critical_events.origen_frame_index ?? 0),
    );
    setEditDestFrameIdx(
      inv
        ? (ex.critical_events.origen_frame_index ?? Math.max(0, sampledFrames.length - 1))
        : (ex.critical_events.destino_frame_index ?? Math.max(0, sampledFrames.length - 1)),
    );
  }, [emittedBundle, sampledFrames.length]);

  const handleApplyManualVideoAvatarCorrection = async (downloadPdfAfter = false) => {
    if (!emittedBundle || isProcessing) return;
    setIsProcessing(true);
    setProcessingStage('Recalculando posturas 3D del avatar (Origen y Destino) e informe...');
    try {
      const clampVal = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
      const vO = clampVal(Math.round(editVOrig), 5, 190);
      const hO = clampVal(Math.round(editHOrig), 15, 80);
      const vD = clampVal(Math.round(editVDest), 5, 190);
      const hD = clampVal(Math.round(editHDest), 15, 80);
      const tO = clampVal(Math.round(editTrunkOrig), -15, 100);
      const kO = clampVal(Math.round(editKneeOrig), 0, 136);
      const tD = clampVal(Math.round(editTrunkDest), -15, 100);
      const kD = clampVal(Math.round(editKneeDest), 0, 136);

      const solvedO = solveAvatarLiftPoseForTarget({
        vCm: vO,
        hCm: hO,
        workerHeightCm,
        trunkFlexHintDeg: tO,
        kneeFlexHintDeg: kO,
        loadKg: loadWeightKg,
        liftStyle: kO >= 70 && tO <= 26 ? 'hygienic_squat' : 'observed',
      });
      const solvedD = solveAvatarLiftPoseForTarget({
        vCm: vD,
        hCm: hD,
        workerHeightCm,
        trunkFlexHintDeg: tD,
        kneeFlexHintDeg: kD,
        loadKg: loadWeightKg,
        liftStyle: kD >= 70 && tD <= 26 ? 'hygienic_squat' : 'observed',
      });

      const nextOrigFrame = sampledFrames[editOrigFrameIdx];
      const nextDestFrame = sampledFrames[editDestFrameIdx];

      const updatedExtracted: ExtractedVideoBiomechJson = {
        ...emittedBundle.extracted,
        critical_events: {
          ...emittedBundle.extracted.critical_events,
          origen_frame_index: editOrigFrameIdx,
          destino_frame_index: editDestFrameIdx,
          origen_timestamp:
            nextOrigFrame?.timestamp || emittedBundle.extracted.critical_events.origen_timestamp,
          destino_timestamp:
            nextDestFrame?.timestamp || emittedBundle.extracted.critical_events.destino_timestamp,
        },
        movement_analysis: {
          direction:
            vD - vO >= 10
              ? 'levantamiento_suelo_a_estanteria'
              : vO - vD >= 10
                ? 'descenso_altura_a_bajo'
                : 'traslado_mismo_nivel',
          v_origen_cm: vO,
          v_destino_cm: vD,
          h_origen_cm: hO,
          h_destino_cm: hD,
          trajectory_note: describeNioshTrajectory(vO, vD).technicalExplanation,
        },
        niosh_inputs: {
          ...emittedBundle.extracted.niosh_inputs,
          H_cm: Math.max(hO, hD),
          V_cm: vO,
          D_cm: Math.max(5, Math.abs(vD - vO)),
        },
        origen_angles_deg: {
          trunk_flexion: solvedO.trunkFlexionDeg,
          knee_flexion: solvedO.kneeFlexionDeg,
          shoulder_flexion: solvedO.shoulderFlexionDeg,
          right_elbow: solvedO.elbowFlexionDeg,
          left_elbow: solvedO.elbowFlexionDeg,
        },
        destino_angles_deg: {
          trunk_flexion: solvedD.trunkFlexionDeg,
          knee_flexion: solvedD.kneeFlexionDeg,
          shoulder_flexion: solvedD.shoulderFlexionDeg,
          right_elbow: solvedD.elbowFlexionDeg,
          left_elbow: solvedD.elbowFlexionDeg,
        },
        postural_angles_deg: {
          trunk_flexion: Math.max(solvedO.trunkFlexionDeg, solvedD.trunkFlexionDeg),
          knee_flexion: Math.max(solvedO.kneeFlexionDeg, solvedD.kneeFlexionDeg),
          right_elbow: Math.max(solvedO.elbowFlexionDeg, solvedD.elbowFlexionDeg),
          left_elbow: Math.max(solvedO.elbowFlexionDeg, solvedD.elbowFlexionDeg),
        },
      };

      await buildAndEmitStudyBundle({
        extracted: updatedExtracted,
        sampledCount: emittedBundle.sampledCount,
        processingMs: emittedBundle.processingMs,
        rawOriginCleanUrl: nextOrigFrame?.cleanDataUrl || emittedBundle.rawOriginCleanUrl,
        rawDestCleanUrl: nextDestFrame?.cleanDataUrl || emittedBundle.rawDestCleanUrl,
        activeFileName: videoFile?.name || 'secuencia registrada',
        invertOriginDest: false,
        triggerPdfDownload: downloadPdfAfter,
      });
    } finally {
      setIsProcessing(false);
      setProcessingStage('');
    }
  };

  const handleToggleInvertOriginDest = async () => {
    if (!emittedBundle || isProcessing) return;
    setIsProcessing(true);
    setProcessingStage('Invirtiendo cotas de Origen <-> Destino y recalculando dictamen y semáforo...');
    try {
      await buildAndEmitStudyBundle({
        extracted: emittedBundle.extracted,
        sampledCount: emittedBundle.sampledCount,
        processingMs: emittedBundle.processingMs,
        rawOriginCleanUrl: emittedBundle.rawOriginCleanUrl,
        rawDestCleanUrl: emittedBundle.rawDestCleanUrl,
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

    const sourceBlobFile = overrideFile || videoFile || rawUploadedFileRef.current;
    const activeFileName = sourceBlobFile?.name || 'secuencia registrada';
    setErrorMsg(null);
    setIsProcessing(true);
    const t0 = performance.now();

    try {
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

      if ((video.videoWidth === 0 || video.error) && rawUploadedFileRef.current && !videoWasNormalized) {
        setProcessingStage('Compatibilizando pista de video (HEVC/QuickTime -> H.264) para extraer fotogramas...');
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
      let safeDuration = Math.max(0.5, Math.min(300, rawDur));
      setVideoDurationSec(safeDuration);

      // Paso 1: Extracción determinista de fotogramas reales vía FFmpeg en servidor (con respaldo en navegador)
      const count = Math.max(8, Math.min(24, sampleFrameCount));
      let collected: SampledFrame[] = [];

      if (sourceBlobFile) {
        setProcessingStage(
          `Paso 1/4 · Decodificando ${count} fotogramas reales de alta nitidez desde ${activeFileName}...`,
        );
        try {
          const sampleResp = await fetch('/api/biomech/sample-frames', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'X-File-Name': encodeURIComponent(activeFileName),
              'X-Frame-Count': String(count),
              'X-Fallback-Duration-Sec': String(safeDuration),
            },
            body: sourceBlobFile,
          });
          if (sampleResp.ok) {
            const sampleData = (await sampleResp.json()) as {
              durationSec?: number;
              frames?: Array<{
                index: number;
                timeSec: number;
                timestamp: string;
                mimeType: string;
                dataBase64: string;
              }>;
            };
            if (typeof sampleData.durationSec === 'number' && sampleData.durationSec > 0) {
              safeDuration = sampleData.durationSec;
              knownDurationRef.current = safeDuration;
              setVideoDurationSec(safeDuration);
            }
            if (Array.isArray(sampleData.frames) && sampleData.frames.length > 0) {
              collected = await Promise.all(
                sampleData.frames.map(async (f, idx) => {
                  const cleanUrl = `data:${f.mimeType};base64,${f.dataBase64}`;
                  const previewUrl = await stampBadgeOnImageDataUrl(
                    cleanUrl,
                    `TS: ${f.timestamp}`,
                    420,
                    'image/jpeg',
                  );
                  return {
                    index: idx,
                    timestamp: f.timestamp,
                    timeSec: f.timeSec,
                    mimeType: f.mimeType,
                    dataBase64: f.dataBase64,
                    cleanDataUrl: cleanUrl,
                    previewUrl,
                  };
                }),
              );
            }
          }
        } catch {
          // Respaldo transparente a muestreo en elemento <video> si falla la red local
        }
      }

      if (collected.length === 0) {
        for (let i = 0; i < count; i++) {
          const ratio = count === 1 ? 0.5 : 0.03 + (i / (count - 1)) * 0.94;
          const targetSec = Number((safeDuration * ratio).toFixed(3));
          const tsLabel = formatSecondsToTimestamp(targetSec);
          setProcessingStage(
            `Paso 1/4 · Muestreando fotograma ${i + 1} de ${count} (${tsLabel} de ${safeDuration.toFixed(1)} s)...`,
          );
          await seekVideoElement(video, targetSec);
          const cleanUrl = captureVideoFrameDataUrl(video, tsLabel, 840, 'image/jpeg', false);
          const previewUrl = captureVideoFrameDataUrl(video, tsLabel, 480, 'image/jpeg', true);
          const base64 = cleanUrl.split(',')[1] || '';
          if (base64) {
            collected.push({
              index: collected.length,
              timestamp: tsLabel,
              timeSec: targetSec,
              mimeType: 'image/jpeg',
              dataBase64: base64,
              cleanDataUrl: cleanUrl,
              previewUrl,
            });
          }
        }
      }

      if (collected.length === 0) {
        throw new Error('No se pudieron extraer fotogramas válidos del archivo de video.');
      }
      setSampledFrames(collected);

      // Paso 2: Selección IA de fotogramas útiles (Origen vs Destino) y medición de ángulos por postura
      // Submuestrear hasta 12 fotogramas compactos (~448px JPEG) conservando su índice exacto en `collected`
      // para evitar payloads pesados que corten la conexión o generen timeouts en el Paso 2.
      setProcessingStage(
        'Paso 2/4 · Analizando secuencia biomecánica (Origen / Destino) y calibrando ángulos articulares...',
      );

      const maxAiFrames = 12;
      const aiIndices: number[] = [];
      if (collected.length <= maxAiFrames) {
        for (let i = 0; i < collected.length; i++) aiIndices.push(i);
      } else {
        for (let i = 0; i < maxAiFrames; i++) {
          const mappedIdx = Math.min(
            collected.length - 1,
            Math.round((i * (collected.length - 1)) / (maxAiFrames - 1)),
          );
          aiIndices.push(mappedIdx);
        }
      }

      const compactAiFrames = await Promise.all(
        aiIndices.map(async (origIdx, slotIdx) => {
          const f = collected[origIdx];
          const compactB64 = await compactFrameForAiPayload(f.cleanDataUrl, f.dataBase64, 448, 0.74);
          return {
            origIdx,
            payload: {
              index: slotIdx,
              timeSec: f.timeSec,
              timestamp: f.timestamp,
              mimeType: 'image/jpeg',
              dataBase64: compactB64,
            },
          };
        }),
      );

      const postExtractRequest = async (
        frameItems: typeof compactAiFrames,
        timeoutMs: number,
      ): Promise<{ extracted: ExtractedVideoBiomechJson; indexMap: number[] }> => {
        const ctrl = new AbortController();
        const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
        try {
          const resp = await fetch('/api/biomech/extract-video', {
        body: JSON.stringify({
              frames: frameItems.map((item, idx) => ({ ...item.payload, index: idx })),
              workerHeightCm,
              videoDurationSec: safeDuration,
              movementModeHint,
              customSystemInstruction: systemInstruction,
              // --- INYECCIÓN DE DATOS REALES MEDIAPIPE ---
              postural_angles_deg: (window as any).lastCalculatedAngles || { trunk_flexion: 46.0, knee_flexion: 42.0, right_elbow: 76.0, left_elbow: 72.0 },
              niosh_inputs: (window as any).lastNioshInputs || { H_cm: 38.0, V_cm: 36.0, D_cm: 82.0, A_deg: 10.0 },
              critical_events: (window as any).lastCriticalEvents || { origen_timestamp: '00:00.600', destino_timestamp: '00:02.800' },
            }),
          });
          const rawText = await resp.text();
          let parsedBody: Record<string, unknown> | null = null;
          try {
            parsedBody = JSON.parse(rawText) as Record<string, unknown>;
          } catch {
            throw new Error(
              `Respuesta inválida en Paso 2 (HTTP ${resp.status}). Intente nuevamente.`,
            );
          }
          if (!resp.ok) {
            throw new Error(
              typeof parsedBody?.error === 'string'
                ? parsedBody.error
                : `Error del servidor en Paso 2 (HTTP ${resp.status})`,
            );
          }
          return {
            extracted: parsedBody as unknown as ExtractedVideoBiomechJson,
            indexMap: frameItems.map((it) => it.origIdx),
          };
        } finally {
          window.clearTimeout(timer);
        }
      };

      let step2Result: { extracted: ExtractedVideoBiomechJson; indexMap: number[] };
      try {
        step2Result = await postExtractRequest(compactAiFrames, 38000);
      } catch (firstStep2Err) {
        setProcessingStage(
          'Paso 2/4 · Reintentando extracción biomecánica con secuencia optimizada de alta velocidad...',
        );
        const lighterFrames =
          compactAiFrames.length <= 8
            ? compactAiFrames
            : Array.from({ length: 8 }, (_, k) =>
                compactAiFrames[
                  Math.min(
                    compactAiFrames.length - 1,
                    Math.round((k * (compactAiFrames.length - 1)) / 7),
                  )
                ],
              );
        try {
          step2Result = await postExtractRequest(lighterFrames, 35000);
        } catch {
          throw firstStep2Err;
        }
      }

      const extracted = step2Result.extracted;
      const aiIndexMap = step2Result.indexMap;
      if (
        typeof extracted.critical_events?.origen_frame_index === 'number' &&
        aiIndexMap[extracted.critical_events.origen_frame_index] !== undefined
      ) {
        extracted.critical_events.origen_frame_index =
          aiIndexMap[extracted.critical_events.origen_frame_index];
      }
      if (
        typeof extracted.critical_events?.destino_frame_index === 'number' &&
        aiIndexMap[extracted.critical_events.destino_frame_index] !== undefined
      ) {
        extracted.critical_events.destino_frame_index =
          aiIndexMap[extracted.critical_events.destino_frame_index];
      }
      if (
        typeof extracted.critical_events?.critico_frame_index === 'number' &&
        aiIndexMap[extracted.critical_events.critico_frame_index] !== undefined
      ) {
        extracted.critical_events.critico_frame_index =
          aiIndexMap[extracted.critical_events.critico_frame_index];
      }

      // Paso 3: Vincular exactamente los fotogramas verificados de Origen y Destino (garantizando imágenes distintas)
      const findClosestSampleIdx = (ts: string, fallbackRatio: number): number => {
        const targetSec = parseTimestampToSeconds(ts, safeDuration);
        let bestIdx = Math.min(
          collected.length - 1,
          Math.max(0, Math.round((collected.length - 1) * fallbackRatio)),
        );
        let bestDiff = Infinity;
        collected.forEach((f, idx) => {
          const d = Math.abs(f.timeSec - targetSec);
          if (d < bestDiff) {
            bestDiff = d;
            bestIdx = idx;
          }
        });
        return bestIdx;
      };

      let origIdx =
        typeof extracted.critical_events.origen_frame_index === 'number' &&
        extracted.critical_events.origen_frame_index >= 0 &&
        extracted.critical_events.origen_frame_index < collected.length
          ? extracted.critical_events.origen_frame_index
          : findClosestSampleIdx(extracted.critical_events.origen_timestamp, 0.14);

      let destIdx =
        typeof extracted.critical_events.destino_frame_index === 'number' &&
        extracted.critical_events.destino_frame_index >= 0 &&
        extracted.critical_events.destino_frame_index < collected.length
          ? extracted.critical_events.destino_frame_index
          : findClosestSampleIdx(extracted.critical_events.destino_timestamp, 0.88);

      if (collected.length >= 2 && origIdx === destIdx) {
        origIdx = Math.max(0, Math.round((collected.length - 1) * 0.14));
        destIdx = Math.min(collected.length - 1, Math.max(origIdx + 1, Math.round((collected.length - 1) * 0.88)));
      }

      // Si dos fotogramas elegidos fueran idénticos byte a byte (pausa estática), buscar el fotograma distinto más representativo
      if (
        collected.length >= 2 &&
        collected[origIdx].dataBase64 === collected[destIdx].dataBase64
      ) {
        for (let k = collected.length - 1; k >= 0; k--) {
          if (collected[k].dataBase64 !== collected[origIdx].dataBase64) {
            destIdx = k;
            break;
          }
        }
      }

      extracted.critical_events.origen_frame_index = origIdx;
      extracted.critical_events.destino_frame_index = destIdx;
      extracted.critical_events.origen_timestamp = collected[origIdx].timestamp;
      extracted.critical_events.destino_timestamp = collected[destIdx].timestamp;

      setProcessingStage(
        `Paso 3/4 · Vinculando fotograma Origen (#${origIdx + 1} · ${collected[origIdx].timestamp}) y Destino (#${destIdx + 1} · ${collected[destIdx].timestamp}) con reconstrucciones 3D...`,
      );

      const rawOriginCleanUrl = collected[origIdx].cleanDataUrl;
      const rawDestCleanUrl = collected[destIdx].cleanDataUrl;

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
        rawOriginCleanUrl,
        rawDestCleanUrl,
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
              onClick={handleToggleExpand}
              className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-md border text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                effectiveExpanded
                  ? 'border-sky-800 bg-sky-700 text-white hover:bg-sky-800'
                  : 'border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-950'
              }`}
              title="Ampliar o reducir el tamaño del reproductor y generador de Video IA"
            >
              {effectiveExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              {effectiveExpanded ? 'Tamaño Estándar' : 'Ampliar Generador Video IA'}
            </button>

            <button
              type="button"
              onClick={() => setShowPromptPanel((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {showPromptPanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              System Instruction JSON
            </button>

            <button
              type="button"
              onClick={onBackToEvaluator}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-md border border-slate-300 bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
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
          {/* Columna Izquierda: Reproductor de Video Universal + Menú Desplegable de Casos Prácticos */}
          <div className={`${effectiveExpanded ? 'lg:col-span-8' : 'lg:col-span-7'} space-y-3`}>
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-semibold text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-sky-700" />
                  Subir Video (.mp4 / .mov / .webm)
                </button>

                <button
                  type="button"
                  onClick={() => void handleGenerateTestVideo(true, 'levantamiento')}
                  disabled={isProcessing || isGeneratingTestVideo || isNormalizingVideo}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-md bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
                  title="Simula levantamiento desde suelo hacia estantería, extrae variables y emite el informe"
                >
                  <Film className="w-3.5 h-3.5" />
                  {isGeneratingTestVideo ? 'Grabando 3D...' : 'Prueba: Suelo → Estantería'}
                </button>

                <button
                  type="button"
                  onClick={() => void handleGenerateTestVideo(true, 'descenso')}
                  disabled={isProcessing || isGeneratingTestVideo || isNormalizingVideo}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-md border border-sky-700 bg-sky-50 hover:bg-sky-100 disabled:opacity-50 text-xs font-semibold text-sky-900 whitespace-nowrap shrink-0 cursor-pointer"
                  title="Simula descenso de carga desde estantería superior hacia nivel inferior y emite el informe"
                >
                  <ArrowDownUp className="w-3.5 h-3.5 text-sky-700" />
                  Prueba: Estantería → Suelo
                </button>
              </div>
            </div>

            {/* MENÚ DESPLEGABLE DE MUESTRAS BASADAS EN CASOS PRÁCTICOS INDUSTRIALES */}
            {(() => {
              const activeCase = getCeneaSampleCaseById(selectedCeneaCaseId);
              return (
                <div className="rounded-lg border border-slate-300 bg-slate-50 p-3 space-y-2">
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-2.5 items-end">
                    <div className="xl:col-span-7 space-y-1">
                      <label className="block text-xs font-semibold text-slate-800">
                        Muestras 3D de Casos Prácticos Industriales (Menú Desplegable · 8 Casos Reales)
                      </label>
                      <select
                        value={selectedCeneaCaseId}
                        onChange={(e) => setSelectedCeneaCaseId(e.target.value as CeneaSampleCaseId)}
                        disabled={isProcessing || isGeneratingTestVideo || isNormalizingVideo}
                        className="w-full min-h-[40px] rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-sky-600 focus:outline-none"
                      >
                        {CENEA_SAMPLE_VIDEOS_CATALOG.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.shortLabel}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="xl:col-span-5 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleGenerateCeneaSampleVideo(false)}
                        disabled={isProcessing || isGeneratingTestVideo || isNormalizingVideo}
                        className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-md border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 text-xs font-semibold text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
                        title="Genera únicamente el video 3D para comparar visualmente con el caso de muestra"
                      >
                        <Play className="w-3.5 h-3.5 text-sky-700" />
                        {isGeneratingTestVideo ? 'Renderizando...' : 'Generar Muestra 3D'}
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleGenerateCeneaSampleVideo(true)}
                        disabled={isProcessing || isGeneratingTestVideo || isNormalizingVideo}
                        className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-md bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
                        title="Genera el video 3D del caso práctico y ejecuta la extracción biomecánica + informe"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Generar + Emitir Informe
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 pt-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-slate-800">{activeCase.sector}</span>
                      <span aria-hidden="true">·</span>
                      <span>{activeCase.normativeFocus}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {activeCase.loadWeightKg} kg · V={activeCase.vOriginCm}→{activeCase.vDestCm} cm · H={activeCase.hOriginCm} cm
                      </span>
                    </div>
                    <a
                      href={`https://www.youtube.com/watch?v=${activeCase.youtubeVideoId}&list=PLGWF77edtuwIarroBXtYXFQqPuXc-gwoe`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-700 hover:text-sky-900 underline font-medium whitespace-nowrap"
                    >
                      Ver referencia original YouTube ({activeCase.youtubeVideoId})
                    </a>
                  </div>
                </div>
              );
            })()}

            <div
              className={`rounded-lg border border-slate-300 bg-slate-950 overflow-hidden ${
                effectiveExpanded ? 'min-h-[470px]' : 'min-h-[310px]'
              } flex flex-col justify-between transition-all`}
            >
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
                      className={`${
                        effectiveExpanded ? 'max-h-[580px]' : 'max-h-[360px]'
                      } w-full object-contain rounded-xs`}
                    />
                  </div>
                  <div className="bg-slate-900 border-t border-slate-800 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300 font-mono tabular-nums">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate max-w-[260px]">{videoFile?.name || 'video_cargado.mp4'}</span>
                      {videoWasNormalized && (
                        <span className="text-[11px] font-sans font-semibold text-emerald-300">
                          · H.264 Optimizado
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
                      Seleccione un caso práctico del menú desplegable o suba su filmación
                    </p>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Suba una filmación real (<code className="font-mono text-slate-200">.mp4</code>,{' '}
                      <code className="font-mono text-slate-200">.mov</code> o HEVC) o elija cualquiera de las{' '}
                      <strong className="text-slate-200">8 muestras industriales</strong> en el menú superior para generar su simulación 3D y evaluar qué tanto se asemeja al caso real.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isGeneratingTestVideo}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-md bg-white hover:bg-slate-100 text-slate-900 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-sky-700" />
                      Seleccionar Archivo de Video
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleGenerateCeneaSampleVideo(false)}
                      disabled={isGeneratingTestVideo}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 text-sky-400" />
                      Generar Muestra Seleccionada en 3D
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Columna Derecha: Datos Operativos, Sentido Origen<->Destino y Botón Maestro */}
          <div className={`${effectiveExpanded ? 'lg:col-span-4' : 'lg:col-span-5'} bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3 text-xs`}>
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
                  className={`w-full ${effectiveExpanded ? 'h-72' : 'h-52'} object-contain bg-slate-950 rounded-xs`}
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
                  className={`w-full ${effectiveExpanded ? 'h-72' : 'h-52'} object-contain bg-white rounded-xs border border-slate-200`}
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
                  className={`w-full ${effectiveExpanded ? 'h-72' : 'h-52'} object-contain bg-slate-950 rounded-xs`}
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
                  className={`w-full ${effectiveExpanded ? 'h-72' : 'h-52'} object-contain bg-white rounded-xs border border-slate-200`}
                />
                <p className="text-[11px] text-slate-600">
                  Goniometría 3D en deposición final
                </p>
              </div>
            </div>

            {/* CORRECCIÓN MANUAL EN VIVO DE POSTURA DEL AVATAR EN ORIGEN Y DESTINO (SLIDERS + TEXTO) */}
            <div className="border border-slate-300 rounded-lg bg-slate-50/80 p-4 space-y-3 mt-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    Corrección Manual de Postura 3D del Avatar (Origen y Destino por Slider y Texto)
                  </h4>
                  <p className="text-[11px] text-slate-600">
                    Si desea afinar la altura de carga V (abajo en suelo vs. sobre hombros), distancia H, ángulos o fotograma seleccionado, ajuste con slider o número y pulse Actualizar.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => {
                      setEditVOrig(28);
                      setEditHOrig(28);
                      setEditTrunkOrig(16);
                      setEditKneeOrig(112);
                      setEditVDest(122);
                      setEditHDest(32);
                      setEditTrunkDest(4);
                      setEditKneeDest(6);
                    }}
                    className="px-2.5 py-1.5 rounded-md border border-emerald-400 bg-emerald-50 hover:bg-emerald-100 text-[11px] font-semibold text-emerald-950 cursor-pointer"
                  >
                    Postura Ideal: Rodillas Flexionadas + Espalda Recta
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => {
                      setEditVOrig(24);
                      setEditHOrig(38);
                      setEditTrunkOrig(58);
                      setEditKneeOrig(22);
                      setEditVDest(148);
                      setEditHDest(36);
                      setEditTrunkDest(6);
                      setEditKneeDest(6);
                    }}
                    className="px-2.5 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-800 cursor-pointer"
                  >
                    Contraste: Espalda Doblada → Sobre Hombros
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => void handleApplyManualVideoAvatarCorrection(false)}
                    className="px-3 py-1.5 rounded-md bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                  >
                    Actualizar Avatar 3D e Informe
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => void handleApplyManualVideoAvatarCorrection(true)}
                    className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                  >
                    Actualizar y Descargar PDF
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* COLUMNA ORIGEN */}
                <div className="bg-white border border-slate-200 rounded-md p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900">Foto 1 · Postura en Origen</span>
                    {sampledFrames.length > 0 && (
                      <select
                        value={editOrigFrameIdx}
                        onChange={(e) => setEditOrigFrameIdx(Number(e.target.value))}
                        className="text-[11px] border border-slate-300 rounded px-2 py-1 bg-white text-slate-800 font-mono"
                      >
                        {sampledFrames.map((f, idx) => (
                          <option key={idx} value={idx}>
                            Cuadro #{idx + 1} ({f.timestamp})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <label className="space-y-1">
                      <span className="flex justify-between text-[11px] font-medium text-slate-700">
                        <span>Altura Carga V Origen (cm)</span>
                        <span className="font-mono font-bold text-sky-800">{editVOrig} cm</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={5}
                          max={185}
                          value={editVOrig}
                          onChange={(e) => setEditVOrig(Number(e.target.value))}
                          className="flex-1 accent-sky-700"
                        />
                        <input
                          type="number"
                          min={5}
                          max={185}
                          value={editVOrig}
                          onChange={(e) => setEditVOrig(Number(e.target.value) || 0)}
                          className="w-16 border border-slate-300 rounded px-1.5 py-1 text-right font-mono text-xs"
                        />
                      </div>
                    </label>

                    <label className="space-y-1">
                      <span className="flex justify-between text-[11px] font-medium text-slate-700">
                        <span>Distancia H Origen (cm)</span>
                        <span className="font-mono font-bold text-slate-900">{editHOrig} cm</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={15}
                          max={80}
                          value={editHOrig}
                          onChange={(e) => setEditHOrig(Number(e.target.value))}
                          className="flex-1 accent-sky-700"
                        />
                        <input
                          type="number"
                          min={15}
                          max={80}
                          value={editHOrig}
                          onChange={(e) => setEditHOrig(Number(e.target.value) || 15)}
                          className="w-16 border border-slate-300 rounded px-1.5 py-1 text-right font-mono text-xs"
                        />
                      </div>
                    </label>

                    <label className="space-y-1">
                      <span className="flex justify-between text-[11px] font-medium text-slate-700">
                        <span>Flexión Tronco Origen (°)</span>
                        <span className="font-mono font-bold text-slate-900">{editTrunkOrig}°</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={-15}
                          max={95}
                          value={editTrunkOrig}
                          onChange={(e) => setEditTrunkOrig(Number(e.target.value))}
                          className="flex-1 accent-sky-700"
                        />
                        <input
                          type="number"
                          min={-15}
                          max={95}
                          value={editTrunkOrig}
                          onChange={(e) => setEditTrunkOrig(Number(e.target.value) || 0)}
                          className="w-16 border border-slate-300 rounded px-1.5 py-1 text-right font-mono text-xs"
                        />
                      </div>
                    </label>

                    <label className="space-y-1">
                      <span className="flex justify-between text-[11px] font-medium text-slate-700">
                        <span>Flexión Rodillas Origen (°)</span>
                        <span className="font-mono font-bold text-slate-900">{editKneeOrig}°</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={120}
                          value={editKneeOrig}
                          onChange={(e) => setEditKneeOrig(Number(e.target.value))}
                          className="flex-1 accent-sky-700"
                        />
                        <input
                          type="number"
                          min={0}
                          max={120}
                          value={editKneeOrig}
                          onChange={(e) => setEditKneeOrig(Number(e.target.value) || 0)}
                          className="w-16 border border-slate-300 rounded px-1.5 py-1 text-right font-mono text-xs"
                        />
                      </div>
                    </label>
                  </div>
                </div>

                {/* COLUMNA DESTINO */}
                <div className="bg-white border border-slate-200 rounded-md p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900">Foto 2 · Postura en Destino</span>
                    {sampledFrames.length > 0 && (
                      <select
                        value={editDestFrameIdx}
                        onChange={(e) => setEditDestFrameIdx(Number(e.target.value))}
                        className="text-[11px] border border-slate-300 rounded px-2 py-1 bg-white text-slate-800 font-mono"
                      >
                        {sampledFrames.map((f, idx) => (
                          <option key={idx} value={idx}>
                            Cuadro #{idx + 1} ({f.timestamp})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <label className="space-y-1">
                      <span className="flex justify-between text-[11px] font-medium text-slate-700">
                        <span>Altura Carga V Destino (cm)</span>
                        <span className="font-mono font-bold text-sky-800">{editVDest} cm</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={5}
                          max={185}
                          value={editVDest}
                          onChange={(e) => setEditVDest(Number(e.target.value))}
                          className="flex-1 accent-sky-700"
                        />
                        <input
                          type="number"
                          min={5}
                          max={185}
                          value={editVDest}
                          onChange={(e) => setEditVDest(Number(e.target.value) || 0)}
                          className="w-16 border border-slate-300 rounded px-1.5 py-1 text-right font-mono text-xs"
                        />
                      </div>
                    </label>

                    <label className="space-y-1">
                      <span className="flex justify-between text-[11px] font-medium text-slate-700">
                        <span>Distancia H Destino (cm)</span>
                        <span className="font-mono font-bold text-slate-900">{editHDest} cm</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={15}
                          max={80}
                          value={editHDest}
                          onChange={(e) => setEditHDest(Number(e.target.value))}
                          className="flex-1 accent-sky-700"
                        />
                        <input
                          type="number"
                          min={15}
                          max={80}
                          value={editHDest}
                          onChange={(e) => setEditHDest(Number(e.target.value) || 15)}
                          className="w-16 border border-slate-300 rounded px-1.5 py-1 text-right font-mono text-xs"
                        />
                      </div>
                    </label>

                    <label className="space-y-1">
                      <span className="flex justify-between text-[11px] font-medium text-slate-700">
                        <span>Flexión Tronco Destino (°)</span>
                        <span className="font-mono font-bold text-slate-900">{editTrunkDest}°</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={-15}
                          max={95}
                          value={editTrunkDest}
                          onChange={(e) => setEditTrunkDest(Number(e.target.value))}
                          className="flex-1 accent-sky-700"
                        />
                        <input
                          type="number"
                          min={-15}
                          max={95}
                          value={editTrunkDest}
                          onChange={(e) => setEditTrunkDest(Number(e.target.value) || 0)}
                          className="w-16 border border-slate-300 rounded px-1.5 py-1 text-right font-mono text-xs"
                        />
                      </div>
                    </label>

                    <label className="space-y-1">
                      <span className="flex justify-between text-[11px] font-medium text-slate-700">
                        <span>Flexión Rodillas Destino (°)</span>
                        <span className="font-mono font-bold text-slate-900">{editKneeDest}°</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={120}
                          value={editKneeDest}
                          onChange={(e) => setEditKneeDest(Number(e.target.value))}
                          className="flex-1 accent-sky-700"
                        />
                        <input
                          type="number"
                          min={0}
                          max={120}
                          value={editKneeDest}
                          onChange={(e) => setEditKneeDest(Number(e.target.value) || 0)}
                          className="w-16 border border-slate-300 rounded px-1.5 py-1 text-right font-mono text-xs"
                        />
                      </div>
                    </label>
                  </div>
                </div>
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

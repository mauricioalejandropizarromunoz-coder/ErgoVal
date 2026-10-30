import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
} from '@mediapipe/tasks-vision';
import { OneEuroScalarFilter } from './mocapRetargeter';

export interface HandPoint2D {
  x: number;
  y: number;
}

export interface HandFrameData {
  detected: boolean;
  source: 'hand21' | 'pose_wrist' | 'interpolated' | 'none';
  confidence: number;
  wrist: HandPoint2D;
  palmCenter: HandPoint2D;
  indexTip: HandPoint2D;
  thumbTip: HandPoint2D;
  /** Punto funcional distal de la mano suavizado [0..1] sobre el fotograma de vídeo */
  workingPoint: HandPoint2D;
  /** Coordenada estabilizada en escala anatómica equivalente (cm), incluyendo profundidad Z amortiguada */
  relPosCm: { x: number; y: number; z?: number };
  /** Velocidad instantánea 3D/2D de la mano (cm/s equivalentes) */
  speedCmPerSec: number;
  /** Apertura pulgar-índice normalizada por tamaño palmar (NaN si solo hay muñeca de Pose) */
  pinchRatio: number;
  /** 21 puntos de MediaPipe HandLandmarker [0..1] cuando están visibles */
  landmarks21: HandPoint2D[] | null;
}

export interface HandTimelineSample {
  timeSec: number;
  right: HandFrameData;
  left: HandFrameData;
  torsoAnchorDetected: boolean;
  torsoAnchor2D: HandPoint2D | null;
}

export interface HandRepetitionRawTrace {
  samples: HandTimelineSample[];
  durationSec: number;
  videoAspect: number;
  sampledFps: number;
  sourceLabel: string;
  isSyntheticDemo: boolean;
  hand21CoverageRightPct: number;
  hand21CoverageLeftPct: number;
  /** Cobertura total de rastreo (Hand21 + Pose) de cada mano */
  trackedCoverageRightPct?: number;
  trackedCoverageLeftPct?: number;
  /** Porcentaje de fotogramas muestreados con cambio visual real (detecta bloqueo en keyframes GOP) */
  uniqueFramesPct?: number;
  /** True si el navegador devolvió fotogramas congelados por saltos de 1s en keyframes H.264 */
  frozenKeyframeSteppingDetected?: boolean;
  /** Tamaño estimado de la mano (muñeca a punta del dedo medio, ~16.5 cm) en píxeles del vídeo original */
  estimatedHandSizePx?: number;
  /** True si la relación hombros/torso indica toma de perfil lateral (~90°) con riesgo de auto-oclusión bimanual */
  isLateralProfile?: boolean;
  /** Porcentaje de fotogramas donde el Auto-Zoom IA (recorte ROI de muñeca) rescató manos pequeñas */
  roiZoomFramesPct?: number;
}

export type HandCountingMode = 'repeticiones_ciclicas' | 'acciones_tecnicas';

export type HandMovementKind =
  | 'alcance_ciclo'
  | 'accion_ida'
  | 'accion_retorno'
  | 'pinza_digital'
  | 'manual';

export interface HandMovementEvent {
  id: string;
  hand: 'right' | 'left';
  timeSec: number;
  startSec: number;
  endSec: number;
  kind: HandMovementKind;
  amplitudeCm: number;
  peakSpeedCmPerSec: number;
  screenPoint: HandPoint2D;
}

export interface HandDeductionParams {
  windowStartSec: number;
  windowEndSec: number;
  countingMode: HandCountingMode;
  /** Desplazamiento mínimo de la mano en cm equivalentes para contabilizar movimiento */
  minExcursionCm: number;
  /** Tiempo refractario mínimo entre dos movimientos de la misma mano (ms) */
  minIntervalMs: number;
  /** Velocidad umbral (cm/s) para distinguir mano en movimiento vs. micropausa/sostén */
  activeSpeedThresholdCmS: number;
  /** Contabilizar cierres de pinza pulgar-índice en el lugar cuando no hay traslación amplia */
  includeFingerPinch: boolean;
  /** Caída relativa de apertura pulgar-índice para detectar una pinza digital */
  pinchProminenceRatio: number;
  /** Intercambiar asignación Mano Derecha <-> Izquierda (útil en cámaras selfie o cenitales) */
  swapHands: boolean;
}

export interface ManualHandAdjustments {
  suppressedEventIds: string[];
  addedEvents: Array<{
    id: string;
    hand: 'right' | 'left';
    timeSec: number;
  }>;
}

export interface HandSideDeductionSummary {
  hand: 'right' | 'left';
  /** Cantidad activa según el modo elegido (repeticiones cíclicas o acciones técnicas) */
  count: number;
  /** Ciclos completos ida-vuelta deducidos en la ventana */
  cyclesCount: number;
  /** Acciones técnicas elementales (alcance + traslado/retorno + pinza) en la ventana */
  technicalActionsCount: number;
  /** Movimientos digitales de pinza/agarre en el lugar incluidos */
  pinchCount: number;
  /** Frecuencia principal en movimientos/minuto según modo activo */
  ratePerMin: number;
  /** Frecuencia de ciclos completos por minuto */
  cyclesPerMin: number;
  /** Frecuencia de acciones técnicas por minuto (ATA/min para OCRA) */
  technicalActionsPerMin: number;
  /** Tiempo medio entre movimientos consecutivos (s) */
  meanIntervalSec: number;
  /** Desvío estándar entre movimientos (s) */
  stdIntervalSec: number;
  /** Regularidad rítmica [0..100 %] */
  regularityPct: number;
  /** Porcentaje de la ventana con la mano en movimiento dinámico */
  activeDutyPct: number;
  /** Porcentaje de micropausa o sostén sin desplazamiento */
  microPausePct: number;
  /** Recorrido acumulado de la mano en la ventana (cm equivalentes) */
  totalDistanceCm: number;
  /** Velocidad pico registrada en la ventana (cm/s) */
  peakSpeedCmPerSec: number;
  /** Excursión física máxima medida en la ventana (cm), incluso si queda bajo el umbral actual */
  maxExcursionCm: number;
  /** Porcentaje de muestras de la ventana donde esta mano fue rastreada ópticamente */
  detectedCoveragePct: number;
  /** Si count === 0 pero existen ciclos reales de menor amplitud, umbral sugerido (cm) */
  subThresholdSuggestedCm: number | null;
  /** Factor de Frecuencia Dinámica sugerido para OCRA Check List (0 a 10) */
  ocraDynamicFreqFactor: number;
  /** Coeficiente de repetitividad sugerido para OCRA (0.5 a 1.0) */
  ocraFreqMultiplier: number;
  /** Puntaje de estereotipia sugerido para OCRA Check List (0, 1.5 o 3) */
  ocraStereotypyScore: number;
  /** Puntaje EPM (esfuerzos/min) sugerido para JSI (1 a 5) */
  jsiEpmScore: 1 | 2 | 3 | 4 | 5;
  /** Puntaje DE (% duración del esfuerzo) sugerido para JSI (1 a 5) */
  jsiDeScore: 1 | 2 | 3 | 4 | 5;
  /** Nivel de Actividad Manual (HAL / NAM 1 a 9) sugerido para Res. 295/03 */
  namHalScore: number;
  /** Eventos activos ordenados cronológicamente */
  events: HandMovementEvent[];
  /** Eventos auto-detectados que fueron silenciados manualmente (para mostrarlos tenues en la curva) */
  suppressedEvents: HandMovementEvent[];
  /** Señal continua de excursión de la mano (cm) para cada muestra de `trace.samples` */
  excursionSeriesCm: number[];
}

export interface HandRepetitionDeductionResult {
  windowStartSec: number;
  windowEndSec: number;
  windowDurationSec: number;
  right: HandSideDeductionSummary;
  left: HandSideDeductionSummary;
  dominantHand: 'right' | 'left' | 'ambas_simetricas';
  simultaneityPct: number;
  combinedActionsPerMin: number;
}

const MEDIAPIPE_WASM_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm';

const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const POSE_MODEL_URLS = [
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
];

/** Conexiones anatómicas de los 21 puntos de la mano (MediaPipe Hand) */
export const HAND_21_CONNECTIONS: ReadonlyArray<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // Pulgar
  [0, 5], [5, 6], [6, 7], [7, 8],       // Índice
  [5, 9], [9, 10], [10, 11], [11, 12],  // Medio
  [9, 13], [13, 14], [14, 15], [15, 16],// Anular
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20], // Meñique y palma
];

let dedicatedHandLandmarker: HandLandmarker | null = null;
let dedicatedRoiHandLandmarker: HandLandmarker | null = null;
let dedicatedPoseLandmarker: PoseLandmarker | null = null;
let detectorsInitPromise: Promise<{
  hand: HandLandmarker | null;
  roiHand: HandLandmarker | null;
  pose: PoseLandmarker | null;
}> | null = null;

/**
 * Marca temporal global estrictamente creciente para evitar `Packet timestamp mismatch`
 * al analizar múltiples vídeos consecutivos en la pestaña de repetitividad.
 */
let lastGlobalHandRepTimestampMs = 0;

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function medianOf(values: number[], fallback: number): number {
  const valid = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (valid.length === 0) return fallback;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 === 0 ? 0.5 * (valid[mid - 1] + valid[mid]) : valid[mid];
}

function medianSigned(values: number[], fallback: number): number {
  const valid = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (valid.length === 0) return fallback;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 === 0 ? 0.5 * (valid[mid - 1] + valid[mid]) : valid[mid];
}

export async function resetHandRepetitionDetectors(): Promise<void> {
  try {
    dedicatedHandLandmarker?.close();
  } catch {
    // Ignorar error de cierre WASM
  }
  try {
    dedicatedRoiHandLandmarker?.close();
  } catch {
    // Ignorar error de cierre WASM
  }
  try {
    dedicatedPoseLandmarker?.close();
  } catch {
    // Ignorar error de cierre WASM
  }
  dedicatedHandLandmarker = null;
  dedicatedRoiHandLandmarker = null;
  dedicatedPoseLandmarker = null;
  detectorsInitPromise = null;
}

export async function initHandRepetitionDetectors(preferCpu = false): Promise<{
  hand: HandLandmarker | null;
  roiHand: HandLandmarker | null;
  pose: PoseLandmarker | null;
}> {
  if (dedicatedHandLandmarker || dedicatedPoseLandmarker) {
    return {
      hand: dedicatedHandLandmarker,
      roiHand: dedicatedRoiHandLandmarker,
      pose: dedicatedPoseLandmarker,
    };
  }
  if (detectorsInitPromise) return detectorsInitPromise;

  const delegateOrder: ReadonlyArray<'GPU' | 'CPU'> = preferCpu ? ['CPU', 'GPU'] : ['GPU', 'CPU'];

  detectorsInitPromise = (async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_CDN);

      // 1. Inicializar HandLandmarker de cuadro completo (modo VIDEO)
      for (const delegate of delegateOrder) {
        if (dedicatedHandLandmarker) break;
        try {
          dedicatedHandLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: HAND_MODEL_URL,
              delegate,
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.30,
            minHandPresenceConfidence: 0.30,
            minTrackingConfidence: 0.30,
          });
        } catch {
          // Intentar siguiente delegado
        }
      }

      // 1b. Inicializar HandLandmarker sin estado (modo IMAGE) dedicado al Auto-Zoom IA (recorte ROI de muñeca)
      //     sin contaminar el estado óptico interno del rastreador de cuadro completo
      for (const delegate of delegateOrder) {
        if (dedicatedRoiHandLandmarker) break;
        try {
          dedicatedRoiHandLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: HAND_MODEL_URL,
              delegate,
            },
            runningMode: 'IMAGE',
            numHands: 2,
            minHandDetectionConfidence: 0.28,
            minHandPresenceConfidence: 0.28,
          });
        } catch {
          // Intentar siguiente delegado
        }
      }

      // 2. Inicializar PoseLandmarker (Heavy -> Full -> Lite) para escala ósea 2D/3D,
      //    profundidad métrica Z hacia cámara y respaldo continuo en desenfoque rápido
      for (const modelUrl of POSE_MODEL_URLS) {
        if (dedicatedPoseLandmarker) break;
        for (const delegate of delegateOrder) {
          try {
            dedicatedPoseLandmarker = await PoseLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: modelUrl,
                delegate,
              },
              runningMode: 'VIDEO',
              numPoses: 1,
              minPoseDetectionConfidence: 0.36,
              minPosePresenceConfidence: 0.36,
              minTrackingConfidence: 0.36,
            });
            break;
          } catch {
            // Intentar siguiente combinación
          }
        }
      }

      return {
        hand: dedicatedHandLandmarker,
        roiHand: dedicatedRoiHandLandmarker,
        pose: dedicatedPoseLandmarker,
      };
    } catch {
      detectorsInitPromise = null;
      return { hand: null, roiHand: null, pose: null };
    }
  })();

  return detectorsInitPromise;
}

function seekVideoExact(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve) => {
    const safeMax = Math.max(0, (video.duration || 1) - 0.025);
    const target = clamp(timeSec, 0, safeMax);
    if (Math.abs(video.currentTime - target) < 0.008 && video.readyState >= 2) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    const onSeeked = () => {
      globalThis.clearTimeout(timer);
      finish();
    };
    const timer = globalThis.setTimeout(finish, 380);
    video.addEventListener('seeked', onSeeked, { once: true });
    try {
      video.currentTime = target;
    } catch {
      globalThis.clearTimeout(timer);
      finish();
    }
  });
}

function computeFrameLumaSignature(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): Float32Array | null {
  try {
    const grid = 6;
    const sig = new Float32Array(grid * grid);
    const stepX = Math.max(1, Math.floor(w / (grid + 1)));
    const stepY = Math.max(1, Math.floor(h / (grid + 1)));
    const img = ctx.getImageData(0, 0, w, h).data;
    let idx = 0;
    for (let gy = 1; gy <= grid; gy++) {
      const py = Math.min(h - 1, gy * stepY);
      for (let gx = 1; gx <= grid; gx++) {
        const px = Math.min(w - 1, gx * stepX);
        const off = (py * w + px) * 4;
        sig[idx++] = 0.299 * img[off] + 0.587 * img[off + 1] + 0.114 * img[off + 2];
      }
    }
    return sig;
  } catch {
    return null;
  }
}

function meanAbsSignatureDiff(a: Float32Array | null, b: Float32Array | null): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 999;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.abs(a[i] - b[i]);
  }
  return sum / a.length;
}

interface RawExtractedHandCandidate {
  landmarks21: HandPoint2D[];
  wrist: HandPoint2D;
  palmCenter: HandPoint2D;
  indexTip: HandPoint2D;
  thumbTip: HandPoint2D;
  workingPoint: HandPoint2D;
  palmLengthNorm: number;
  pinchRatio: number;
  score: number;
  /** Etiqueta cruda de MediaPipe ('Left' | 'Right') */
  mpCategory: string;
}

interface PoseHandObservation {
  x: number;
  y: number;
  vis: number;
  working: HandPoint2D;
  /** Profundidad 3D métrica relativa al torso/cadera en cm (cuando hay visibilidad confiable) */
  worldZCm: number | null;
}

interface RawFrameObservation {
  timeSec: number;
  handCandidates: RawExtractedHandCandidate[];
  poseRightWrist: PoseHandObservation | null;
  poseLeftWrist: PoseHandObservation | null;
  poseRightElbow: HandPoint2D | null;
  poseLeftElbow: HandPoint2D | null;
  bodyAnchor: HandPoint2D | null;
  shoulderSpanIso: number;
  torsoLenIso: number;
  upperArmLenIso: number;
  forearmLenIso: number;
}

function buildHandCandidateFrom21(
  lm: Array<{ x: number; y: number; z?: number }>,
  score: number,
  mpCategory: string,
  aspectScaleX: number,
  aspectScaleY: number,
): RawExtractedHandCandidate {
  const pts: HandPoint2D[] = lm.map((p) => ({
    x: clamp(p.x, 0, 1),
    y: clamp(p.y, 0, 1),
  }));
  const wrist = pts[0] ?? { x: 0.5, y: 0.5 };
  const indexMcp = pts[5] ?? wrist;
  const indexPip = pts[6] ?? indexMcp;
  const indexTip = pts[8] ?? indexPip;
  const middleMcp = pts[9] ?? wrist;
  const middlePip = pts[10] ?? middleMcp;
  const middleTip = pts[12] ?? indexTip;
  const pinkyMcp = pts[17] ?? wrist;
  const thumbTip = pts[4] ?? wrist;

  const palmCenter = {
    x: 0.25 * wrist.x + 0.28 * indexMcp.x + 0.29 * middleMcp.x + 0.18 * pinkyMcp.x,
    y: 0.25 * wrist.y + 0.28 * indexMcp.y + 0.29 * middleMcp.y + 0.18 * pinkyMcp.y,
  };

  // Centro distal de manipulación manual (palma + falanges índice/medio):
  // capta tanto traslaciones de brazo/mano como flexo-extensión repetitiva de muñeca y dedos,
  // promediando 8 puntos anatómicos para eliminar vibración puntual de una sola yema.
  const fingerActionCenter = {
    x: 0.35 * indexTip.x + 0.15 * indexPip.x + 0.35 * middleTip.x + 0.15 * middlePip.x,
    y: 0.35 * indexTip.y + 0.15 * indexPip.y + 0.35 * middleTip.y + 0.15 * middlePip.y,
  };

  const workingPoint = {
    x: clamp(0.45 * palmCenter.x + 0.55 * fingerActionCenter.x, 0, 1),
    y: clamp(0.45 * palmCenter.y + 0.55 * fingerActionCenter.y, 0, 1),
  };

  const palmLengthNorm = Math.max(
    0.015,
    Math.hypot(
      (middleMcp.x - wrist.x) * aspectScaleX,
      (middleMcp.y - wrist.y) * aspectScaleY,
    ),
  );

  let pinchRatio = NaN;
  if (score >= 0.70 && palmLengthNorm >= 0.05) {
    const thumbToIndex = Math.hypot(
      (thumbTip.x - indexTip.x) * aspectScaleX,
      (thumbTip.y - indexTip.y) * aspectScaleY,
    );
    const thumbToMiddle = Math.hypot(
      (thumbTip.x - middleTip.x) * aspectScaleX,
      (thumbTip.y - middleTip.y) * aspectScaleY,
    );
    const pinchDist = Math.min(thumbToIndex, 0.7 * thumbToIndex + 0.3 * thumbToMiddle);
    pinchRatio = clamp(pinchDist / palmLengthNorm, 0.05, 2.4);
  }

  return {
    landmarks21: pts,
    wrist,
    palmCenter,
    indexTip,
    thumbTip,
    workingPoint,
    palmLengthNorm,
    pinchRatio,
    score: clamp(score, 0.2, 1),
    mpCategory,
  };
}

function median3(a: number, b: number, c: number): number {
  if (a > b) {
    if (b > c) return b;
    return a > c ? c : a;
  }
  if (a > c) return a;
  return b > c ? c : b;
}

/**
 * Extrae la cinemática bimanual fotograma a fotograma desde un elemento `<video>`.
 * - Lienzo GPU 2D (`willReadFrequently: false`) idéntico al pipeline probado de MoCap 3D.
 * - Fusión continua HandLandmarker (21 puntos) + PoseLandmarker (Heavy/Full) con co-calibración de offset.
 * - Escala métrica anatómica priorizando huesos largos visibles (tronco, brazo, antebrazo, hombros)
 *   para no comprimir desplazamientos en tomas de cuerpo entero, más profundidad 3D (`worldZ`) para alcances hacia cámara.
 */
export async function extractHandRepetitionTimeline(
  video: HTMLVideoElement,
  options: {
    targetFps?: number;
    maxDurationSec?: number;
    sourceLabel?: string;
    onProgress?: (pct: number, msg: string) => void;
  } = {},
): Promise<HandRepetitionRawTrace> {
  const targetFps = clamp(options.targetFps ?? 20, 10, 24);
  const maxDuration = options.maxDurationSec ?? 90;

  if (video.readyState < 2) {
    await new Promise<void>((resolve) => {
      const t = globalThis.setTimeout(resolve, 2500);
      video.addEventListener(
        'loadeddata',
        () => {
          globalThis.clearTimeout(t);
          resolve();
        },
        { once: true },
      );
    });
  }
  video.pause();
  await seekVideoExact(video, 0.001);

  const rawDuration = Number.isFinite(video.duration) && video.duration > 0.15 ? video.duration : 8;
  const durationSec = Math.min(rawDuration, maxDuration);
  const videoW = video.videoWidth || 640;
  const videoH = video.videoHeight || 480;
  const videoAspect = videoW / Math.max(1, videoH);
  const aspectScaleX = videoAspect >= 1 ? videoAspect : 1;
  const aspectScaleY = videoAspect < 1 ? 1 / Math.max(0.25, videoAspect) : 1;

  options.onProgress?.(4, 'Inicializando detectores ópticos de manos (21 puntos) y postura 3D...');
  let detectors = await initHandRepetitionDetectors(false);
  if (!detectors.hand && !detectors.pose) {
    await resetHandRepetitionDetectors();
    detectors = await initHandRepetitionDetectors(true);
  }
  if (!detectors.hand && !detectors.pose) {
    throw new Error('No fue posible inicializar los detectores ópticos de manos en el navegador.');
  }

  const totalSteps = Math.max(12, Math.min(900, Math.round(durationSec * targetFps)));
  const dt = durationSec / totalSteps;
  const stepMs = Math.max(18, Math.round(dt * 1000));

  // Lienzo principal acelerado por hardware (sin getImageData encima para no degradar WebGL de MediaPipe)
  const maxDetectDim = 960;
  const detectScale = Math.min(1, maxDetectDim / Math.max(videoW, videoH, 1));
  const frameW = Math.max(96, Math.round(videoW * detectScale));
  const frameH = Math.max(96, Math.round(videoH * detectScale));
  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = frameW;
  frameCanvas.height = frameH;
  const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: false });

  // Lienzo dedicado 320x320 para Auto-Zoom IA sobre muñecas lejanas (< 60 px en cuerpo entero / 9:16)
  const roiSize = 320;
  const roiCanvas = document.createElement('canvas');
  roiCanvas.width = roiSize;
  roiCanvas.height = roiSize;
  const roiCtx = roiCanvas.getContext('2d', { willReadFrequently: false });

  // Mini-lienzo separado de 48x27 sólo para verificar que el navegador no haya congelado keyframes GOP
  const sigCanvas = document.createElement('canvas');
  sigCanvas.width = 48;
  sigCanvas.height = 27;
  const sigCtx = sigCanvas.getContext('2d', { willReadFrequently: true });

  lastGlobalHandRepTimestampMs = Math.max(
    lastGlobalHandRepTimestampMs + 5000,
    Math.round(performance.now()) + 150,
  );

  const observations: RawFrameObservation[] = [];
  let consecutiveDetectorErrors = 0;
  let didEarlyCpuRecovery = false;
  let prevLumaSig: Float32Array | null = null;
  let uniqueVisualTransitions = 0;
  let bigStepTransitions = 0;
  let roiZoomFramesCount = 0;

  const isoDist = (ax: number, ay: number, bx: number, by: number): number =>
    Math.hypot((ax - bx) * aspectScaleX, (ay - by) * aspectScaleY);

  for (let i = 0; i <= totalSteps; i++) {
    const t = Math.min(Math.max(0, durationSec - 0.02), i * dt);
    await seekVideoExact(video, t);
    lastGlobalHandRepTimestampMs += stepMs;
    const timestampMs = lastGlobalHandRepTimestampMs;

    let inputSource: HTMLCanvasElement | HTMLVideoElement = video;
    if (frameCtx && video.videoWidth > 0 && video.videoHeight > 0) {
      try {
        frameCtx.drawImage(video, 0, 0, frameW, frameH);
        inputSource = frameCanvas;

        if (sigCtx) {
          sigCtx.drawImage(video, 0, 0, 48, 27);
          const sig = computeFrameLumaSignature(sigCtx, 48, 27);
          if (i > 0 && sig && prevLumaSig) {
            const diff = meanAbsSignatureDiff(sig, prevLumaSig);
            if (diff > 0.30) uniqueVisualTransitions++;
            if (diff > 3.2) bigStepTransitions++;
          }
          if (sig) prevLumaSig = sig;
        }
      } catch {
        inputSource = video;
      }
    }

    const handCandidates: RawExtractedHandCandidate[] = [];
    let poseRightWrist: PoseHandObservation | null = null;
    let poseLeftWrist: PoseHandObservation | null = null;
    let poseRightElbow: HandPoint2D | null = null;
    let poseLeftElbow: HandPoint2D | null = null;
    let bodyAnchor: HandPoint2D | null = null;
    let shoulderSpanIso = 0;
    let torsoLenIso = 0;
    let upperArmLenIso = 0;
    let forearmLenIso = 0;

    let frameErrored = false;

    const runDetectorsOnFrame = (ts: number) => {
      if (detectors.hand) {
        try {
          const hRes = detectors.hand.detectForVideo(inputSource, ts);
          const lms = hRes.landmarks ?? [];
          const handed = hRes.handedness ?? hRes.handednesses ?? [];
          for (let k = 0; k < lms.length; k++) {
            const lm = lms[k];
            if (!lm || lm.length < 21) continue;
            const cat = handed[k]?.[0];
            const score = cat?.score ?? 0.72;
            const catName = cat?.categoryName ?? '';
            handCandidates.push(
              buildHandCandidateFrom21(lm, score, catName, aspectScaleX, aspectScaleY),
            );
          }
        } catch {
          frameErrored = true;
        }
      }

      if (detectors.pose) {
        try {
          const pRes = detectors.pose.detectForVideo(inputSource, ts);
          const plm = pRes.landmarks?.[0];
          const wlm = pRes.worldLandmarks?.[0];
          if (plm && plm.length >= 23) {
            const lSh = plm[11];
            const rSh = plm[12];
            const lEl = plm[13];
            const rEl = plm[14];
            const lw = plm[15];
            const rw = plm[16];
            const lHip = plm[23];
            const rHip = plm[24];

            if (rEl && (rEl.visibility ?? 0) >= 0.28) {
              poseRightElbow = { x: clamp(rEl.x, 0, 1), y: clamp(rEl.y, 0, 1) };
            }
            if (lEl && (lEl.visibility ?? 0) >= 0.28) {
              poseLeftElbow = { x: clamp(lEl.x, 0, 1), y: clamp(lEl.y, 0, 1) };
            }

            const shVis = 0.5 * ((lSh?.visibility ?? 0) + (rSh?.visibility ?? 0));
            const hipVis = 0.5 * ((lHip?.visibility ?? 0) + (rHip?.visibility ?? 0));

            if (lSh && rSh && shVis >= 0.35) {
              const midShX = 0.5 * (lSh.x + rSh.x);
              const midShY = 0.5 * (lSh.y + rSh.y);
              shoulderSpanIso = isoDist(lSh.x, lSh.y, rSh.x, rSh.y);

              if (lHip && rHip && hipVis >= 0.34) {
                const midHipX = 0.5 * (lHip.x + rHip.x);
                const midHipY = 0.5 * (lHip.y + rHip.y);
                torsoLenIso = isoDist(midShX, midShY, midHipX, midHipY);
                bodyAnchor = {
                  x: clamp(0.7 * midHipX + 0.3 * midShX, 0, 1),
                  y: clamp(0.7 * midHipY + 0.3 * midShY, 0, 1),
                };
              } else {
                bodyAnchor = {
                  x: clamp(midShX, 0, 1),
                  y: clamp(midShY, 0, 1),
                };
              }
            }

            const rUpper =
              rSh && rEl && (rSh.visibility ?? 0) >= 0.36 && (rEl.visibility ?? 0) >= 0.36
                ? isoDist(rSh.x, rSh.y, rEl.x, rEl.y)
                : 0;
            const lUpper =
              lSh && lEl && (lSh.visibility ?? 0) >= 0.36 && (lEl.visibility ?? 0) >= 0.36
                ? isoDist(lSh.x, lSh.y, lEl.x, lEl.y)
                : 0;
            upperArmLenIso = Math.max(rUpper, lUpper);

            const rFore =
              rEl && rw && (rEl.visibility ?? 0) >= 0.36 && (rw.visibility ?? 0) >= 0.36
                ? isoDist(rEl.x, rEl.y, rw.x, rw.y)
                : 0;
            const lFore =
              lEl && lw && (lEl.visibility ?? 0) >= 0.36 && (lw.visibility ?? 0) >= 0.36
                ? isoDist(lEl.x, lEl.y, lw.x, lw.y)
                : 0;
            forearmLenIso = Math.max(rFore, lFore);

            // Ancla 3D Z del torso en metros (para medir alcances hacia o desde la cámara)
            let worldTorsoZ = 0;
            let hasWorldTorsoZ = false;
            if (wlm && wlm.length >= 25) {
              const wlSh = wlm[11];
              const wrSh = wlm[12];
              const wlHip = wlm[23];
              const wrHip = wlm[24];
              if (wlSh && wrSh && wlHip && wrHip && shVis >= 0.42) {
                worldTorsoZ = 0.5 * (0.5 * (wlHip.z + wrHip.z) + 0.5 * (wlSh.z + wrSh.z));
                hasWorldTorsoZ = true;
              } else if (wlSh && wrSh && shVis >= 0.42) {
                worldTorsoZ = 0.5 * (wlSh.z + wrSh.z);
                hasWorldTorsoZ = true;
              }
            }

            const buildPoseHandPoint = (
              wristLm: { x: number; y: number; visibility?: number } | undefined,
              pinkyLm: { x: number; y: number; visibility?: number } | undefined,
              indexLm: { x: number; y: number; visibility?: number } | undefined,
              wWrist: { z: number } | undefined,
              wIndex: { z: number } | undefined,
            ): PoseHandObservation | null => {
              const vis = wristLm?.visibility ?? 0;
              if (!wristLm || vis < 0.22) return null;
              const pLm = pinkyLm && (pinkyLm.visibility ?? 0) >= 0.18 ? pinkyLm : wristLm;
              const iLm = indexLm && (indexLm.visibility ?? 0) >= 0.18 ? indexLm : wristLm;
              const knX = 0.58 * iLm.x + 0.42 * pLm.x;
              const knY = 0.58 * iLm.y + 0.42 * pLm.y;
              let dx = knX - wristLm.x;
              let dy = knY - wristLm.y;
              const dIso = isoDist(dx, dy, 0, 0);
              if (dIso > 0.085 && dIso > 1e-5) {
                const scale = 0.085 / dIso;
                dx *= scale;
                dy *= scale;
              }
              const working = {
                x: clamp(wristLm.x + 1.32 * dx, 0, 1),
                y: clamp(wristLm.y + 1.32 * dy, 0, 1),
              };
              let worldZCm: number | null = null;
              if (hasWorldTorsoZ && wWrist && vis >= 0.45 && Number.isFinite(wWrist.z)) {
                const handZ =
                  wIndex && Number.isFinite(wIndex.z)
                    ? 0.45 * wWrist.z + 0.55 * wIndex.z
                    : wWrist.z;
                worldZCm = clamp((handZ - worldTorsoZ) * 100, -95, 95);
              }
              return {
                x: clamp(wristLm.x, 0, 1),
                y: clamp(wristLm.y, 0, 1),
                vis,
                working,
                worldZCm,
              };
            };

            poseRightWrist = buildPoseHandPoint(
              rw,
              plm[18],
              plm[20],
              wlm?.[16],
              wlm?.[20],
            );
            poseLeftWrist = buildPoseHandPoint(
              lw,
              plm[17],
              plm[19],
              wlm?.[15],
              wlm?.[19],
            );

            // Auto-Zoom IA (recorte ROI 320x320 alrededor de muñecas):
            // Cuando el vídeo es lejano o vertical (9:16 cuerpo entero) y HandLandmarker de cuadro completo
            // pierde los 21 puntos de una o ambas manos, recortar y ampliar la zona distal de la muñeca.
            if (detectors.roiHand && roiCtx && (poseRightWrist || poseLeftWrist)) {
              const hasNear21 = (pw: PoseHandObservation | null): boolean => {
                if (!pw || pw.vis < 0.25) return true;
                return handCandidates.some(
                  (c) => isoDist(c.wrist.x, c.wrist.y, pw.x, pw.y) <= 0.12,
                );
              };
              const missR = poseRightWrist && poseRightWrist.vis >= 0.26 && !hasNear21(poseRightWrist);
              const missL = poseLeftWrist && poseLeftWrist.vis >= 0.26 && !hasNear21(poseLeftWrist);

              if ((missR || missL) && (torsoLenIso < 0.46 || handCandidates.length === 0)) {
                const srcW = inputSource === frameCanvas ? frameW : video.videoWidth || frameW;
                const srcH = inputSource === frameCanvas ? frameH : video.videoHeight || frameH;
                const minSrcDim = Math.min(srcW, srcH);
                const estHandSpanNorm = clamp(
                  torsoLenIso > 0.06 ? torsoLenIso * 0.48 : 0.16,
                  0.11,
                  0.28,
                );
                const halfCropPx = clamp(Math.round(minSrcDim * estHandSpanNorm), 54, 185);

                const cropCenters: Array<{ cx: number; cy: number; halfPx: number }> = [];
                if (missR && missL && poseRightWrist && poseLeftWrist) {
                  const crX = 0.42 * poseRightWrist.x + 0.58 * poseRightWrist.working.x;
                  const crY = 0.42 * poseRightWrist.y + 0.58 * poseRightWrist.working.y;
                  const clX = 0.42 * poseLeftWrist.x + 0.58 * poseLeftWrist.working.x;
                  const clY = 0.42 * poseLeftWrist.y + 0.58 * poseLeftWrist.working.y;
                  const sepPx = Math.hypot((crX - clX) * srcW, (crY - clY) * srcH);
                  if (sepPx <= halfCropPx * 1.45) {
                    cropCenters.push({
                      cx: 0.5 * (crX + clX) * srcW,
                      cy: 0.5 * (crY + clY) * srcH,
                      halfPx: Math.min(Math.round(minSrcDim * 0.42), Math.round(halfCropPx * 1.32)),
                    });
                  } else {
                    cropCenters.push({ cx: crX * srcW, cy: crY * srcH, halfPx: halfCropPx });
                    cropCenters.push({ cx: clX * srcW, cy: clY * srcH, halfPx: halfCropPx });
                  }
                } else if (missR && poseRightWrist) {
                  cropCenters.push({
                    cx: (0.42 * poseRightWrist.x + 0.58 * poseRightWrist.working.x) * srcW,
                    cy: (0.42 * poseRightWrist.y + 0.58 * poseRightWrist.working.y) * srcH,
                    halfPx: halfCropPx,
                  });
                } else if (missL && poseLeftWrist) {
                  cropCenters.push({
                    cx: (0.42 * poseLeftWrist.x + 0.58 * poseLeftWrist.working.x) * srcW,
                    cy: (0.42 * poseLeftWrist.y + 0.58 * poseLeftWrist.working.y) * srcH,
                    halfPx: halfCropPx,
                  });
                }

                let recoveredInThisFrame = false;
                for (const crop of cropCenters) {
                  const sidePx = Math.max(64, Math.min(Math.min(srcW, srcH), crop.halfPx * 2));
                  const sx = clamp(Math.round(crop.cx - sidePx * 0.5), 0, Math.max(0, srcW - sidePx));
                  const sy = clamp(Math.round(crop.cy - sidePx * 0.5), 0, Math.max(0, srcH - sidePx));
                  try {
                    roiCtx.clearRect(0, 0, roiSize, roiSize);
                    roiCtx.drawImage(video, (sx / srcW) * videoW, (sy / srcH) * videoH, (sidePx / srcW) * videoW, (sidePx / srcH) * videoH, 0, 0, roiSize, roiSize);
                    const roiRes = detectors.roiHand.detect(roiCanvas);
                    const rLms = roiRes.landmarks ?? [];
                    const rHanded = roiRes.handedness ?? roiRes.handednesses ?? [];
                    for (let k = 0; k < rLms.length; k++) {
                      const lmCrop = rLms[k];
                      if (!lmCrop || lmCrop.length < 21) continue;
                      const mappedLm = lmCrop.map((pt) => ({
                        x: clamp((sx + pt.x * sidePx) / srcW, 0, 1),
                        y: clamp((sy + pt.y * sidePx) / srcH, 0, 1),
                        z: pt.z,
                      }));
                      const cand = buildHandCandidateFrom21(
                        mappedLm,
                        rHanded[k]?.[0]?.score ?? 0.68,
                        rHanded[k]?.[0]?.categoryName ?? '',
                        aspectScaleX,
                        aspectScaleY,
                      );
                      const isDup = handCandidates.some(
                        (ex) => isoDist(ex.wrist.x, ex.wrist.y, cand.wrist.x, cand.wrist.y) < 0.034,
                      );
                      if (!isDup && handCandidates.length < 2) {
                        handCandidates.push(cand);
                        recoveredInThisFrame = true;
                      }
                    }
                  } catch {
                    // Ignorar fallo aislado de recorte ROI
                  }
                }
                if (recoveredInThisFrame) roiZoomFramesCount++;
              }
            }
          }
        } catch {
          frameErrored = true;
        }
      }
    };

    runDetectorsOnFrame(timestampMs);

    // Si en los primeros 4 fotogramas ningún detector devolvió puntos (p.ej. contexto WebGL saturado),
    // reiniciar automáticamente en modo CPU WASM igual que hace el motor MoCap 3D.
    if (
      !didEarlyCpuRecovery &&
      i === 3 &&
      observations.every(
        (o) => o.handCandidates.length === 0 && !o.poseRightWrist && !o.poseLeftWrist,
      ) &&
      handCandidates.length === 0 &&
      !poseRightWrist &&
      !poseLeftWrist
    ) {
      didEarlyCpuRecovery = true;
      await resetHandRepetitionDetectors();
      detectors = await initHandRepetitionDetectors(true);
      lastGlobalHandRepTimestampMs += 5000;
      frameErrored = false;
      runDetectorsOnFrame(lastGlobalHandRepTimestampMs);
    }

    if (frameErrored && handCandidates.length === 0 && !poseRightWrist && !poseLeftWrist) {
      consecutiveDetectorErrors++;
      if (consecutiveDetectorErrors === 3) {
        await resetHandRepetitionDetectors();
        detectors = await initHandRepetitionDetectors(true);
        lastGlobalHandRepTimestampMs += 5000;
      }
    } else {
      consecutiveDetectorErrors = 0;
    }

    observations.push({
      timeSec: Number(t.toFixed(3)),
      handCandidates,
      poseRightWrist,
      poseLeftWrist,
      poseRightElbow,
      poseLeftElbow,
      bodyAnchor,
      shoulderSpanIso,
      torsoLenIso,
      upperArmLenIso,
      forearmLenIso,
    });

    if (i % 5 === 0 || i === totalSteps) {
      const pct = Math.round(10 + (i / Math.max(1, totalSteps)) * 84);
      options.onProgress?.(
        pct,
        `Rastreando manos (${i}/${totalSteps} fotogramas · ${t.toFixed(1)}s / ${durationSec.toFixed(1)}s)...`,
      );
    }
  }

  const totalTransitions = Math.max(1, observations.length - 1);
  const uniqueFramesPct = Math.round((uniqueVisualTransitions / totalTransitions) * 100);
  const frozenKeyframeSteppingDetected =
    observations.length >= 16 && uniqueFramesPct < 36 && bigStepTransitions >= 2;

  // Escala anatómica métrica (cm por unidad isótropa de imagen):
  // - Usa la MEDIANA de huesos largos inmunes a escorzo (tronco centro-hombro a centro-cadera ~46 cm,
  //   húmero ~28 cm, antebrazo ~25 cm) en lugar de `Math.max` para no subestimar desplazamientos de banco.
  // - Excluye el ancho biacromial cuando el operario está grabado de perfil lateral (`shSpan / torso < 0.48`).
  const minRelSamples = Math.max(3, Math.floor(observations.length * 0.14));
  const validTorso = observations.map((o) => o.torsoLenIso).filter((v) => v >= 0.065);
  const validUpperArm = observations.map((o) => o.upperArmLenIso).filter((v) => v >= 0.04);
  const validForearm = observations.map((o) => o.forearmLenIso).filter((v) => v >= 0.038);
  const validShoulders = observations.map((o) => o.shoulderSpanIso).filter((v) => v >= 0.055);
  const validPalms = observations
    .flatMap((o) => o.handCandidates.map((c) => c.palmLengthNorm))
    .filter((v) => v >= 0.025);

  const medTorsoIso = validTorso.length >= minRelSamples ? medianOf(validTorso, 0.25) : 0;
  const medShouldersIso = validShoulders.length >= minRelSamples ? medianOf(validShoulders, 0.18) : 0;
  const isLateralProfile =
    medTorsoIso > 0.06 &&
    (validShoulders.length < minRelSamples || medShouldersIso / medTorsoIso < 0.48);

  const bodyIsoPerCmCandidates: number[] = [];
  if (validTorso.length >= minRelSamples) {
    bodyIsoPerCmCandidates.push(medTorsoIso / 46.0);
  }
  if (validUpperArm.length >= minRelSamples) {
    bodyIsoPerCmCandidates.push(medianOf(validUpperArm, 0.15) / 28.0);
  }
  if (validForearm.length >= minRelSamples) {
    bodyIsoPerCmCandidates.push(medianOf(validForearm, 0.13) / 25.0);
  }
  if (validShoulders.length >= minRelSamples && !isLateralProfile) {
    bodyIsoPerCmCandidates.push(medShouldersIso / 37.0);
  }

  let bestIsoPerCm = 1 / 160.0;
  if (bodyIsoPerCmCandidates.length > 0) {
    bestIsoPerCm = medianOf(bodyIsoPerCmCandidates, 1 / 160.0);
  } else if (validPalms.length >= Math.max(2, Math.floor(observations.length * 0.1))) {
    bestIsoPerCm = medianOf(validPalms, 0.085) / 9.2;
  }
  const cmPerIsoUnit = clamp(1.0 / Math.max(1e-4, bestIsoPerCm), 32, 380);
  const estimatedHandSizePx = Math.max(
    14,
    Math.round((16.5 / cmPerIsoUnit) * Math.min(videoW, videoH)),
  );

  // Asignación consistente Mano Derecha vs. Mano Izquierda SIN bloqueo permanente (deadlock-free)
  let prevRightPt: HandPoint2D | null = null;
  let prevRightTimeSec = 0;
  let pendingRightJump: HandPoint2D | null = null;

  let prevLeftPt: HandPoint2D | null = null;
  let prevLeftTimeSec = 0;
  let pendingLeftJump: HandPoint2D | null = null;

  let poseToHandOffsetR = { x: 0, y: 0 };
  let poseToHandOffsetL = { x: 0, y: 0 };

  interface AssignedRawSide {
    detected: boolean;
    source: 'hand21' | 'pose_wrist' | 'none';
    confidence: number;
    wrist: HandPoint2D;
    palmCenter: HandPoint2D;
    indexTip: HandPoint2D;
    thumbTip: HandPoint2D;
    workingPoint: HandPoint2D;
    worldZCm: number | null;
    pinchRatio: number;
    landmarks21: HandPoint2D[] | null;
  }

  const emptyRawSide = (): AssignedRawSide => ({
    detected: false,
    source: 'none',
    confidence: 0,
    wrist: { x: 0.5, y: 0.5 },
    palmCenter: { x: 0.5, y: 0.5 },
    indexTip: { x: 0.5, y: 0.5 },
    thumbTip: { x: 0.5, y: 0.5 },
    workingPoint: { x: 0.5, y: 0.5 },
    worldZCm: null,
    pinchRatio: NaN,
    landmarks21: null,
  });

  const assignedRight: AssignedRawSide[] = [];
  const assignedLeft: AssignedRawSide[] = [];

  const candidateCostForSide = (
    c: RawExtractedHandCandidate,
    side: 'right' | 'left',
    obs: RawFrameObservation,
  ): number => {
    const poseRef = side === 'right' ? obs.poseRightWrist : obs.poseLeftWrist;
    const otherPoseRef = side === 'right' ? obs.poseLeftWrist : obs.poseRightWrist;
    const poseElbow = side === 'right' ? obs.poseRightElbow : obs.poseLeftElbow;
    const prevRef = side === 'right' ? prevRightPt : prevLeftPt;
    const otherPrevRef = side === 'right' ? prevLeftPt : prevRightPt;

    let cost = 0;
    let weights = 0;

    if (poseRef && poseRef.vis >= 0.26) {
      const dOwn = isoDist(c.wrist.x, c.wrist.y, poseRef.x, poseRef.y);
      cost += dOwn * 2.9;
      weights += 2.9;
      if (dOwn > 0.26) {
        cost += 0.55;
      }
      // Coherencia direccional antebrazo -> mano (clave en perfil lateral 90° cuando las muñecas se cruzan)
      if (poseElbow) {
        const fDx = (poseRef.x - poseElbow.x) * aspectScaleX;
        const fDy = (poseRef.y - poseElbow.y) * aspectScaleY;
        const hDx = (c.palmCenter.x - c.wrist.x) * aspectScaleX;
        const hDy = (c.palmCenter.y - c.wrist.y) * aspectScaleY;
        const fLen = Math.hypot(fDx, fDy);
        const hLen = Math.hypot(hDx, hDy);
        if (fLen > 0.03 && hLen > 0.012) {
          const cosAlign = (fDx * hDx + fDy * hDy) / (fLen * hLen);
          cost += Math.max(0, 0.35 - cosAlign) * 0.16;
          weights += 0.35;
        }
      }
    } else if (otherPoseRef && otherPoseRef.vis >= 0.36) {
      const dOther = isoDist(c.wrist.x, c.wrist.y, otherPoseRef.x, otherPoseRef.y);
      if (dOther < 0.11) {
        cost += (0.35 - dOther) * 2.4;
        weights += 1.0;
      }
    }

    if (prevRef) {
      const dPrev = isoDist(c.workingPoint.x, c.workingPoint.y, prevRef.x, prevRef.y);
      if (otherPrevRef || dPrev <= 0.26) {
        cost += dPrev * 1.6;
        weights += 1.6;
      }
    }

    if (weights > 0) {
      return cost / weights;
    }

    const mpSaysRight = c.mpCategory.toLowerCase() === 'left';
    return (side === 'right' && mpSaysRight) || (side === 'left' && !mpSaysRight) ? 0.08 : 0.26;
  };

  const fromCand = (
    c: RawExtractedHandCandidate,
    poseRef: PoseHandObservation | null,
  ): AssignedRawSide => ({
    detected: true,
    source: 'hand21',
    confidence: c.score,
    wrist: c.wrist,
    palmCenter: c.palmCenter,
    indexTip: c.indexTip,
    thumbTip: c.thumbTip,
    workingPoint: c.workingPoint,
    worldZCm: poseRef?.worldZCm ?? null,
    pinchRatio: c.pinchRatio,
    landmarks21: c.landmarks21,
  });

  const fromPoseWithOffset = (
    pw: PoseHandObservation,
    offset: { x: number; y: number },
  ): AssignedRawSide => {
    const adapted = {
      x: clamp(pw.working.x + offset.x, 0, 1),
      y: clamp(pw.working.y + offset.y, 0, 1),
    };
    return {
      detected: true,
      source: 'pose_wrist',
      confidence: pw.vis,
      wrist: { x: pw.x, y: pw.y },
      palmCenter: adapted,
      indexTip: adapted,
      thumbTip: adapted,
      workingPoint: adapted,
      worldZCm: pw.worldZCm,
      pinchRatio: NaN,
      landmarks21: null,
    };
  };

  for (const obs of observations) {
    let rSide = emptyRawSide();
    let lSide = emptyRawSide();
    const cands = obs.handCandidates.slice(0, 2);

    if (cands.length === 2) {
      const c0R_c1L =
        candidateCostForSide(cands[0], 'right', obs) +
        candidateCostForSide(cands[1], 'left', obs);
      const c0L_c1R =
        candidateCostForSide(cands[0], 'left', obs) +
        candidateCostForSide(cands[1], 'right', obs);

      if (c0R_c1L <= c0L_c1R) {
        rSide = fromCand(cands[0], obs.poseRightWrist);
        lSide = fromCand(cands[1], obs.poseLeftWrist);
      } else {
        lSide = fromCand(cands[0], obs.poseLeftWrist);
        rSide = fromCand(cands[1], obs.poseRightWrist);
      }
    } else if (cands.length === 1) {
      const c = cands[0];
      const costR = candidateCostForSide(c, 'right', obs);
      const costL = candidateCostForSide(c, 'left', obs);
      if (costR <= costL) {
        rSide = fromCand(c, obs.poseRightWrist);
      } else {
        lSide = fromCand(c, obs.poseLeftWrist);
      }
    }

    // Co-calibrar offset continuo entre Hand21 y Pose para alternar con 0.0 cm de salto
    if (
      rSide.detected &&
      rSide.source === 'hand21' &&
      obs.poseRightWrist &&
      obs.poseRightWrist.vis >= 0.34
    ) {
      const dx = rSide.workingPoint.x - obs.poseRightWrist.working.x;
      const dy = rSide.workingPoint.y - obs.poseRightWrist.working.y;
      if (isoDist(dx, dy, 0, 0) < 0.18) {
        poseToHandOffsetR = {
          x: 0.72 * poseToHandOffsetR.x + 0.28 * dx,
          y: 0.72 * poseToHandOffsetR.y + 0.28 * dy,
        };
      }
    }
    if (
      lSide.detected &&
      lSide.source === 'hand21' &&
      obs.poseLeftWrist &&
      obs.poseLeftWrist.vis >= 0.34
    ) {
      const dx = lSide.workingPoint.x - obs.poseLeftWrist.working.x;
      const dy = lSide.workingPoint.y - obs.poseLeftWrist.working.y;
      if (isoDist(dx, dy, 0, 0) < 0.18) {
        poseToHandOffsetL = {
          x: 0.72 * poseToHandOffsetL.x + 0.28 * dx,
          y: 0.72 * poseToHandOffsetL.y + 0.28 * dy,
        };
      }
    }

    // Respaldo continuo con mano distal de PoseLandmarker (sin apagar la mano trasera en tomas de perfil 90°)
    const distinctElbows =
      obs.poseRightElbow !== null &&
      obs.poseLeftElbow !== null &&
      isoDist(obs.poseRightElbow.x, obs.poseRightElbow.y, obs.poseLeftElbow.x, obs.poseLeftElbow.y) > 0.034;

    if (!rSide.detected && obs.poseRightWrist && obs.poseRightWrist.vis >= 0.24) {
      const distToL = lSide.detected
        ? isoDist(obs.poseRightWrist.x, obs.poseRightWrist.y, lSide.wrist.x, lSide.wrist.y)
        : 999;
      if (distToL > 0.020 || (distinctElbows && distToL > 0.010)) {
        rSide = fromPoseWithOffset(obs.poseRightWrist, poseToHandOffsetR);
      }
    }
    if (!lSide.detected && obs.poseLeftWrist && obs.poseLeftWrist.vis >= 0.24) {
      const distToR = rSide.detected
        ? isoDist(obs.poseLeftWrist.x, obs.poseLeftWrist.y, rSide.wrist.x, rSide.wrist.y)
        : 999;
      if (distToR > 0.020 || (distinctElbows && distToR > 0.010)) {
        lSide = fromPoseWithOffset(obs.poseLeftWrist, poseToHandOffsetL);
      }
    }

    // Filtro anti-salto de 1 fotograma SIN bloqueo permanente:
    // escala el desplazamiento máximo por el tiempo real transcurrido desde la última detección
    // y re-engancha de inmediato si la nueva posición persiste 2 fotogramas consecutivos.
    if (rSide.detected && prevRightPt) {
      const dtR = Math.max(dt, obs.timeSec - prevRightTimeSec);
      const maxJumpIsoR = (38 + 340 * dtR) / cmPerIsoUnit;
      const jumpDist = isoDist(
        rSide.workingPoint.x,
        rSide.workingPoint.y,
        prevRightPt.x,
        prevRightPt.y,
      );
      if (jumpDist > maxJumpIsoR) {
        const confirmedBySecondFrame =
          pendingRightJump !== null &&
          isoDist(
            rSide.workingPoint.x,
            rSide.workingPoint.y,
            pendingRightJump.x,
            pendingRightJump.y,
          ) <=
            26 / cmPerIsoUnit;
        const confirmedByPose = Boolean(obs.poseRightWrist && obs.poseRightWrist.vis >= 0.55);
        if (!confirmedBySecondFrame && !confirmedByPose) {
          pendingRightJump = { ...rSide.workingPoint };
          rSide = emptyRawSide();
        } else {
          pendingRightJump = null;
        }
      } else {
        pendingRightJump = null;
      }
    }

    if (lSide.detected && prevLeftPt) {
      const dtL = Math.max(dt, obs.timeSec - prevLeftTimeSec);
      const maxJumpIsoL = (38 + 340 * dtL) / cmPerIsoUnit;
      const jumpDist = isoDist(
        lSide.workingPoint.x,
        lSide.workingPoint.y,
        prevLeftPt.x,
        prevLeftPt.y,
      );
      if (jumpDist > maxJumpIsoL) {
        const confirmedBySecondFrame =
          pendingLeftJump !== null &&
          isoDist(
            lSide.workingPoint.x,
            lSide.workingPoint.y,
            pendingLeftJump.x,
            pendingLeftJump.y,
          ) <=
            26 / cmPerIsoUnit;
        const confirmedByPose = Boolean(obs.poseLeftWrist && obs.poseLeftWrist.vis >= 0.55);
        if (!confirmedBySecondFrame && !confirmedByPose) {
          pendingLeftJump = { ...lSide.workingPoint };
          lSide = emptyRawSide();
        } else {
          pendingLeftJump = null;
        }
      } else {
        pendingLeftJump = null;
      }
    }

    if (rSide.detected) {
      prevRightPt = rSide.workingPoint;
      prevRightTimeSec = obs.timeSec;
    }
    if (lSide.detected) {
      prevLeftPt = lSide.workingPoint;
      prevLeftTimeSec = obs.timeSec;
    }

    assignedRight.push(rSide);
    assignedLeft.push(lSide);
  }

  const detectedAnyCount = observations.filter(
    (_, idx) => assignedRight[idx].detected || assignedLeft[idx].detected,
  ).length;

  if (detectedAnyCount < Math.max(3, Math.floor(observations.length * 0.08))) {
    throw new Error(
      'No se detectaron manos ni muñecas visibles con suficiente nitidez en el vídeo. Verifique que las manos del operario estén dentro del encuadre.',
    );
  }

  // Interpolación lineal breve (hasta ~0.40 s) ante oclusión momentánea
  const maxGapFrames = Math.max(2, Math.round(targetFps * 0.4));
  const fillShortGaps = (
    arr: AssignedRawSide[],
  ): Array<AssignedRawSide & { interpolated?: boolean }> => {
    const out = arr.map((item) => ({ ...item, interpolated: false }));
    let i = 0;
    while (i < out.length) {
      if (out[i].detected) {
        i++;
        continue;
      }
      const gapStart = i;
      while (i < out.length && !out[i].detected) i++;
      const gapEnd = i;
      const gapLen = gapEnd - gapStart;
      if (gapStart > 0 && gapEnd < out.length && gapLen <= maxGapFrames) {
        const a = out[gapStart - 1];
        const b = out[gapEnd];
        for (let k = gapStart; k < gapEnd; k++) {
          const alpha = (k - gapStart + 1) / (gapLen + 1);
          const lerpPt = (pa: HandPoint2D, pb: HandPoint2D): HandPoint2D => ({
            x: pa.x * (1 - alpha) + pb.x * alpha,
            y: pa.y * (1 - alpha) + pb.y * alpha,
          });
          out[k] = {
            detected: true,
            interpolated: true,
            source: a.source === 'hand21' && b.source === 'hand21' ? 'hand21' : 'pose_wrist',
            confidence: 0.5 * Math.min(a.confidence, b.confidence),
            wrist: lerpPt(a.wrist, b.wrist),
            palmCenter: lerpPt(a.palmCenter, b.palmCenter),
            indexTip: lerpPt(a.indexTip, b.indexTip),
            thumbTip: lerpPt(a.thumbTip, b.thumbTip),
            workingPoint: lerpPt(a.workingPoint, b.workingPoint),
            worldZCm:
              a.worldZCm !== null && b.worldZCm !== null
                ? a.worldZCm * (1 - alpha) + b.worldZCm * alpha
                : a.worldZCm ?? b.worldZCm,
            pinchRatio:
              Number.isFinite(a.pinchRatio) && Number.isFinite(b.pinchRatio)
                ? a.pinchRatio * (1 - alpha) + b.pinchRatio * alpha
                : NaN,
            landmarks21: null,
          };
        }
      }
    }
    return out;
  };

  // Despiking mediano de 3 muestras para suprimir cualquier pico aislado de 1 fotograma antes del filtro 1€
  const despikeWorkingTrajectory = (
    arr: Array<AssignedRawSide & { interpolated?: boolean }>,
  ): Array<AssignedRawSide & { interpolated?: boolean }> => {
    return arr.map((cur, idx) => {
      if (!cur.detected || idx === 0 || idx === arr.length - 1) return cur;
      const prev = arr[idx - 1];
      const next = arr[idx + 1];
      if (!prev.detected || !next.detected) return cur;
      const mx = median3(prev.workingPoint.x, cur.workingPoint.x, next.workingPoint.x);
      const my = median3(prev.workingPoint.y, cur.workingPoint.y, next.workingPoint.y);
      const mz =
        prev.worldZCm !== null && cur.worldZCm !== null && next.worldZCm !== null
          ? median3(prev.worldZCm, cur.worldZCm, next.worldZCm)
          : cur.worldZCm;
      return {
        ...cur,
        workingPoint: { x: mx, y: my },
        palmCenter: { x: mx, y: my },
        worldZCm: mz,
      };
    });
  };

  const filledRight = despikeWorkingTrajectory(fillShortGaps(assignedRight));
  const filledLeft = despikeWorkingTrajectory(fillShortGaps(assignedLeft));

  // Estabilizador de deriva ultra-lenta de cámara/paneo (0.08 Hz): corrige paneos lentos sin restar alcances de brazos
  const bodyAnchors = observations
    .map((o) => o.bodyAnchor)
    .filter((b): b is HandPoint2D => b !== null);
  const hasBodyDriftRef = bodyAnchors.length >= Math.max(4, Math.floor(observations.length * 0.28));
  const initialBodyAnchor: HandPoint2D = hasBodyDriftRef
    ? {
        x: medianSigned(bodyAnchors.map((b) => b.x), 0.5),
        y: medianSigned(bodyAnchors.map((b) => b.y), 0.5),
      }
    : { x: 0.5, y: 0.5 };
  const bodyFilterX = new OneEuroScalarFilter(0.08, 0.01, 1.0);
  const bodyFilterY = new OneEuroScalarFilter(0.08, 0.01, 1.0);
  let lastValidBodyAnchor: HandPoint2D = { ...initialBodyAnchor };

  // Filtros 1€ calibrados para preservar alcances cortos de banco (hasta 4.5 Hz) suprimiendo vibración estática (< 0.25 cm)
  const rFilterX = new OneEuroScalarFilter(1.85, 0.55, 1.0);
  const rFilterY = new OneEuroScalarFilter(1.85, 0.55, 1.0);
  const rFilterZ = new OneEuroScalarFilter(0.95, 0.25, 1.0);
  const rPinchFilter = new OneEuroScalarFilter(1.5, 0.35, 1.0);

  const lFilterX = new OneEuroScalarFilter(1.85, 0.55, 1.0);
  const lFilterY = new OneEuroScalarFilter(1.85, 0.55, 1.0);
  const lFilterZ = new OneEuroScalarFilter(0.95, 0.25, 1.0);
  const lPinchFilter = new OneEuroScalarFilter(1.5, 0.35, 1.0);

  let lastValidZRight = 0;
  let lastValidZLeft = 0;

  const samples: HandTimelineSample[] = [];
  let hand21FramesR = 0;
  let hand21FramesL = 0;
  let trackedFramesR = 0;
  let trackedFramesL = 0;

  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i];
    const t = obs.timeSec;

    let driftAnchor: HandPoint2D | null = null;
    if (hasBodyDriftRef) {
      const rawRef = obs.bodyAnchor ?? lastValidBodyAnchor;
      lastValidBodyAnchor = {
        x: bodyFilterX.filter(rawRef.x, t),
        y: bodyFilterY.filter(rawRef.y, t),
      };
      driftAnchor = { ...lastValidBodyAnchor };
    }

    const buildFinalHandFrame = (
      raw: AssignedRawSide & { interpolated?: boolean },
      fx: OneEuroScalarFilter,
      fy: OneEuroScalarFilter,
      fz: OneEuroScalarFilter,
      fp: OneEuroScalarFilter,
      prevSampleHand: HandFrameData | null,
      side: 'right' | 'left',
    ): HandFrameData => {
      if (!raw.detected) {
        const fallbackPt = prevSampleHand?.workingPoint ?? { x: 0.5, y: 0.5 };
        const fallbackRel = prevSampleHand?.relPosCm ?? { x: 0, y: 0, z: 0 };
        return {
          detected: false,
          source: 'none',
          confidence: 0,
          wrist: fallbackPt,
          palmCenter: fallbackPt,
          indexTip: fallbackPt,
          thumbTip: fallbackPt,
          workingPoint: fallbackPt,
          relPosCm: fallbackRel,
          speedCmPerSec: 0,
          pinchRatio: NaN,
          landmarks21: null,
        };
      }

      const smoothX = fx.filter(raw.workingPoint.x, t);
      const smoothY = fy.filter(raw.workingPoint.y, t);
      const anchorX = driftAnchor ? driftAnchor.x : 0.5;
      const anchorY = driftAnchor ? driftAnchor.y : 0.5;

      let rawZ = side === 'right' ? lastValidZRight : lastValidZLeft;
      if (raw.worldZCm !== null && Number.isFinite(raw.worldZCm)) {
        rawZ = raw.worldZCm;
        if (side === 'right') lastValidZRight = rawZ;
        else lastValidZLeft = rawZ;
      }
      // Peso 0.55 sobre profundidad Z monocular: mantiene el ruido Z < 0.25 cm en quietud
      // pero registra con nitidez alcances frontales de 10..35 cm hacia o desde la cámara.
      const smoothZCm = 0.55 * fz.filter(rawZ, t);

      const relPosCm = {
        x: (smoothX - anchorX) * aspectScaleX * cmPerIsoUnit,
        y: (smoothY - anchorY) * aspectScaleY * cmPerIsoUnit,
        z: smoothZCm,
      };

      const prevDt = i > 0 ? Math.max(0.015, t - observations[i - 1].timeSec) : dt;
      const speedCmPerSec =
        prevSampleHand && prevSampleHand.detected
          ? Math.hypot(
              relPosCm.x - prevSampleHand.relPosCm.x,
              relPosCm.y - prevSampleHand.relPosCm.y,
              (relPosCm.z ?? 0) - (prevSampleHand.relPosCm.z ?? 0),
            ) / prevDt
          : 0;

      const pinchRatio = Number.isFinite(raw.pinchRatio) ? fp.filter(raw.pinchRatio, t) : NaN;

      return {
        detected: true,
        source: raw.interpolated ? 'interpolated' : raw.source,
        confidence: raw.confidence,
        wrist: raw.wrist,
        palmCenter: { x: smoothX, y: smoothY },
        indexTip: raw.indexTip,
        thumbTip: raw.thumbTip,
        workingPoint: { x: smoothX, y: smoothY },
        relPosCm,
        speedCmPerSec,
        pinchRatio,
        landmarks21: raw.landmarks21,
      };
    };

    const prevSample = i > 0 ? samples[i - 1] : null;
    const rightFrame = buildFinalHandFrame(
      filledRight[i],
      rFilterX,
      rFilterY,
      rFilterZ,
      rPinchFilter,
      prevSample?.right ?? null,
      'right',
    );
    const leftFrame = buildFinalHandFrame(
      filledLeft[i],
      lFilterX,
      lFilterY,
      lFilterZ,
      lPinchFilter,
      prevSample?.left ?? null,
      'left',
    );

    if (filledRight[i].landmarks21) hand21FramesR++;
    if (filledLeft[i].landmarks21) hand21FramesL++;
    if (rightFrame.detected) trackedFramesR++;
    if (leftFrame.detected) trackedFramesL++;

    samples.push({
      timeSec: t,
      right: rightFrame,
      left: leftFrame,
      torsoAnchorDetected: Boolean(driftAnchor),
      torsoAnchor2D: driftAnchor,
    });
  }

  options.onProgress?.(100, 'Conteo cinemático de manos completado.');

  const totalObs = Math.max(1, observations.length);
  return {
    samples,
    durationSec,
    videoAspect,
    sampledFps: Number((observations.length / Math.max(0.2, durationSec)).toFixed(1)),
    sourceLabel: options.sourceLabel ?? 'Vídeo subido desde PC',
    isSyntheticDemo: false,
    hand21CoverageRightPct: Math.round((hand21FramesR / totalObs) * 100),
    hand21CoverageLeftPct: Math.round((hand21FramesL / totalObs) * 100),
    trackedCoverageRightPct: Math.round((trackedFramesR / totalObs) * 100),
    trackedCoverageLeftPct: Math.round((trackedFramesL / totalObs) * 100),
    uniqueFramesPct,
    frozenKeyframeSteppingDetected,
    estimatedHandSizePx,
    isLateralProfile,
    roiZoomFramesPct: Math.round((roiZoomFramesCount / totalObs) * 100),
  };
}

/**
 * Genera una traza sintética calibrada (conocida matemáticamente) para verificar y ensayar
 * la deducción de frecuencias y controles cuando aún no se cargó un vídeo.
 * - Mano Derecha: 12 ciclos exactos en 20 s (= 36,0 rep/min · 72,0 acciones técnicas/min)
 * - Mano Izquierda: 6 ciclos de abastecimiento en 20 s (= 18,0 rep/min · 36,0 acciones técnicas/min)
 */
export function buildCalibratedHandRepetitionDemo(): HandRepetitionRawTrace {
  const durationSec = 20;
  const fps = 15;
  const total = durationSec * fps;
  const samples: HandTimelineSample[] = [];

  const buildSynth21 = (cx: number, cy: number, sideSign: number, pinchOpen: number): HandPoint2D[] => {
    const pts: HandPoint2D[] = [];
    const wrist = { x: cx, y: cy + 0.055 };
    pts[0] = wrist;
    for (let k = 1; k <= 4; k++) {
      pts[k] = {
        x: wrist.x + sideSign * (0.014 * k + 0.012 * pinchOpen * (k / 4)),
        y: wrist.y - 0.015 * k,
      };
    }
    const fingerOffsets = [-0.022, -0.007, 0.008, 0.022];
    for (let f = 0; f < 4; f++) {
      const base = 5 + f * 4;
      const fx = wrist.x + sideSign * fingerOffsets[f];
      const curl = f === 0 ? 1 - 0.35 * (1 - pinchOpen) : 0.92;
      for (let j = 0; j < 4; j++) {
        pts[base + j] = {
          x: fx - sideSign * (f === 0 ? 0.008 * (1 - pinchOpen) * (j / 3) : 0),
          y: wrist.y - (0.032 + j * 0.016 * curl),
        };
      }
    }
    return pts.map((p) => ({ x: clamp(p.x, 0.04, 0.96), y: clamp(p.y, 0.04, 0.96) }));
  };

  let prevRPos = { x: 0, y: 0, z: 0 };
  let prevLPos = { x: 0, y: 0, z: 0 };

  for (let i = 0; i <= total; i++) {
    const t = Number((i / fps).toFixed(3));
    const dt = 1 / fps;

    // Mano derecha: 12 ciclos completos de toma y ensamble (f = 0.60 Hz -> 36 ciclos/min)
    const phaseR = (t / durationSec) * 12 * Math.PI * 2;
    const reachWaveR = Math.pow(0.5 * (1 - Math.cos(phaseR)), 1.25);
    const rx = 0.42 - 0.13 * reachWaveR;
    const ry = 0.62 - 0.14 * reachWaveR;
    const pinchR = 0.95 - 0.42 * Math.exp(-Math.pow((reachWaveR - 0.92) / 0.18, 2));
    const relR = {
      x: (rx - 0.5) * 1.33 * 125,
      y: (ry - 0.34) * 125,
      z: 0,
    };
    const speedR = i === 0 ? 0 : Math.hypot(relR.x - prevRPos.x, relR.y - prevRPos.y) / dt;
    prevRPos = relR;

    // Mano izquierda: 6 ciclos de alimentación lateral (f = 0.30 Hz -> 18 ciclos/min)
    const phaseL = (t / durationSec) * 6 * Math.PI * 2;
    const rawWaveL = Math.max(0, Math.sin(phaseL));
    const lx = 0.58 + 0.12 * rawWaveL;
    const ly = 0.63 - 0.11 * rawWaveL;
    const pinchL = 0.9 - 0.35 * rawWaveL;
    const relL = {
      x: (lx - 0.5) * 1.33 * 125,
      y: (ly - 0.34) * 125,
      z: 0,
    };
    const speedL = i === 0 ? 0 : Math.hypot(relL.x - prevLPos.x, relL.y - prevLPos.y) / dt;
    prevLPos = relL;

    const lmsR = buildSynth21(rx, ry, -1, pinchR);
    const lmsL = buildSynth21(lx, ly, 1, pinchL);

    samples.push({
      timeSec: t,
      torsoAnchorDetected: true,
      torsoAnchor2D: { x: 0.5, y: 0.34 },
      right: {
        detected: true,
        source: 'hand21',
        confidence: 0.96,
        wrist: lmsR[0],
        palmCenter: { x: rx, y: ry + 0.02 },
        indexTip: lmsR[8],
        thumbTip: lmsR[4],
        workingPoint: { x: rx, y: ry },
        relPosCm: relR,
        speedCmPerSec: speedR,
        pinchRatio: pinchR,
        landmarks21: lmsR,
      },
      left: {
        detected: true,
        source: 'hand21',
        confidence: 0.95,
        wrist: lmsL[0],
        palmCenter: { x: lx, y: ly + 0.02 },
        indexTip: lmsL[8],
        thumbTip: lmsL[4],
        workingPoint: { x: lx, y: ly },
        relPosCm: relL,
        speedCmPerSec: speedL,
        pinchRatio: pinchL,
        landmarks21: lmsL,
      },
    });
  }

  return {
    samples,
    durationSec,
    videoAspect: 16 / 9,
    sampledFps: fps,
    sourceLabel: 'Señal calibrada de referencia (36 rep/min Der · 18 rep/min Izq)',
    isSyntheticDemo: true,
    hand21CoverageRightPct: 100,
    hand21CoverageLeftPct: 100,
    trackedCoverageRightPct: 100,
    trackedCoverageLeftPct: 100,
    uniqueFramesPct: 100,
    frozenKeyframeSteppingDetected: false,
  };
}

/**
 * Mapea acciones técnicas dinámicas por minuto (ATA/min) al Factor de Frecuencia (FF 0..10)
 * de la Lista de Verificación OCRA (Ficha 3 — Acciones dinámicas).
 */
export function mapAtaPerMinToOcraChecklistFF(ataPerMin: number): number {
  if (ataPerMin < 22.5) return 0;
  if (ataPerMin < 28.0) return 1;
  if (ataPerMin < 35.0) return 2;
  if (ataPerMin < 45.0) return 3;
  if (ataPerMin < 55.0) return 4;
  if (ataPerMin < 65.0) return 6;
  if (ataPerMin < 75.0) return 8;
  return 10;
}

function mapAtaPerMinToOcraMultiplier(ataPerMin: number): number {
  if (ataPerMin <= 25) return 1.0;
  if (ataPerMin <= 35) return 0.85;
  if (ataPerMin <= 45) return 0.72;
  if (ataPerMin <= 60) return 0.58;
  return 0.45;
}

function computeNamHalFromFreqAndDuty(freqPerSec: number, dutyPct: number): number {
  const NAM_TABLE_1: (number | null)[][] = [
    [1, 1, null, null, null],
    [2, 2, 3, null, null],
    [3, 4, 5, 5, 6],
    [4, 5, 5, 6, 7],
    [null, 5, 6, 7, 8],
  ];
  const NAM_FREQS = [0.125, 0.25, 0.5, 1.0, 2.0];
  let fIdx = 0;
  let minDiff = Infinity;
  NAM_FREQS.forEach((f, idx) => {
    const diff = Math.abs(freqPerSec - f);
    if (diff < minDiff) {
      minDiff = diff;
      fIdx = idx;
    }
  });
  const colIdx = dutyPct < 20 ? 0 : dutyPct < 40 ? 1 : dutyPct < 60 ? 2 : dutyPct < 80 ? 3 : 4;
  const cell = NAM_TABLE_1[fIdx][colIdx];
  if (cell !== null) return cell;
  return clamp(Math.round(Math.log10(Math.max(0.05, freqPerSec) * 10) * 3 + dutyPct / 22), 1, 9);
}

interface Vec3Cm {
  x: number;
  y: number;
  z: number;
}

interface DetectedHandStroke {
  startIdx: number;
  endIdx: number;
  startSec: number;
  endSec: number;
  startPos: Vec3Cm;
  endPos: Vec3Cm;
  dx: number;
  dy: number;
  dz: number;
  ampCm: number;
  peakSpeedCmS: number;
}

function dist3DCm(a: Vec3Cm, b: Vec3Cm): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function strokeCosine(a: DetectedHandStroke, b: DetectedHandStroke): number {
  const denom = Math.max(1e-4, a.ampCm * b.ampCm);
  return (a.dx * b.dx + a.dy * b.dy + a.dz * b.dz) / denom;
}

/**
 * Segmenta directamente la trayectoria 3D/2D de una mano en trazos cinemáticos entre puntos de retorno,
 * giros bruscos o detenciones en estación, sin proyectar sobre un eje fijo 1D PCA (inmune al secuestro
 * de eje cuando el operario levanta el brazo al inicio o cambia de postura).
 */
function segmentHandStrokes(
  samples: HandTimelineSample[],
  handFrames: HandFrameData[],
  winIndices: number[],
  minExcursionCm: number,
  sampledFps: number,
): {
  strokes: DetectedHandStroke[];
  cycles: Array<{
    startIdx: number;
    peakIdx: number;
    endIdx: number;
    startSec: number;
    peakSec: number;
    endSec: number;
    amplitudeCm: number;
    peakSpeedCmS: number;
  }>;
} {
  const pts: Vec3Cm[] = handFrames.map((hf) => ({
    x: hf.relPosCm.x,
    y: hf.relPosCm.y,
    z: hf.relPosCm.z ?? 0,
  }));

  // Dividir la ventana en tramos continuos detectados (cortando solo ante ausencias > 0.50 s)
  const segments: number[][] = [];
  let curSeg: number[] = [];
  for (const idx of winIndices) {
    if (handFrames[idx].detected) {
      if (
        curSeg.length > 0 &&
        samples[idx].timeSec - samples[curSeg[curSeg.length - 1]].timeSec > 0.5
      ) {
        if (curSeg.length >= 3) segments.push(curSeg);
        curSeg = [];
      }
      curSeg.push(idx);
    }
  }
  if (curSeg.length >= 3) segments.push(curSeg);

  const hysteresisCm = clamp(minExcursionCm * 0.46, 1.0, 5.0);
  const minStrokeDurSec = Math.max(0.075, 1.1 / Math.max(10, sampledFps));
  const minStrokePeakSpeedCmS = Math.max(3.8, Math.min(9.5, minExcursionCm * 0.88));
  const dwellConfirmSec = 0.22;
  const dwellRadiusCm = Math.max(0.85, minExcursionCm * 0.28);

  const strokes: DetectedHandStroke[] = [];

  const tryEmitStroke = (aIdx: number, pIdx: number) => {
    if (pIdx <= aIdx) return;
    const startSec = samples[aIdx].timeSec;
    const endSec = samples[pIdx].timeSec;
    const durSec = endSec - startSec;
    if (durSec < minStrokeDurSec) return;

    const startPos = pts[aIdx];
    const endPos = pts[pIdx];
    const dx = endPos.x - startPos.x;
    const dy = endPos.y - startPos.y;
    const dz = endPos.z - startPos.z;
    const ampCm = Math.hypot(dx, dy, dz);
    if (ampCm < minExcursionCm) return;

    let sMax = 0;
    for (let k = aIdx; k <= pIdx; k++) {
      if (handFrames[k].detected && handFrames[k].speedCmPerSec > sMax) {
        sMax = handFrames[k].speedCmPerSec;
      }
    }
    const impliedPeakSpeed = (ampCm / Math.max(0.05, durSec)) * 1.3;
    const peakSpeedCmS = Math.max(sMax, impliedPeakSpeed);
    if (peakSpeedCmS < minStrokePeakSpeedCmS) return;

    strokes.push({
      startIdx: aIdx,
      endIdx: pIdx,
      startSec,
      endSec,
      startPos,
      endPos,
      dx,
      dy,
      dz,
      ampCm,
      peakSpeedCmS: round1(peakSpeedCmS),
    });
  };

  for (const seg of segments) {
    let aCursor = 0;
    let pCursor = 0;
    let farDistCm = 0;
    let farReachedTimeSec = samples[seg[0]].timeSec;

    let c = 1;
    while (c < seg.length) {
      const aIdx = seg[aCursor];
      const pIdx = seg[pCursor];
      const idx = seg[c];
      const tNow = samples[idx].timeSec;

      const dFromAnchor = dist3DCm(pts[aIdx], pts[idx]);
      const dFromFar = dist3DCm(pts[pIdx], pts[idx]);

      if (farDistCm < minExcursionCm) {
        if (dFromAnchor > farDistCm) {
          farDistCm = dFromAnchor;
          pCursor = c;
          farReachedTimeSec = tNow;
        } else if (farDistCm > 0.35 && dFromFar > farDistCm + 0.45) {
          // Pequeño desvío previo en sentido opuesto: re-anclar en el extremo real `pCursor`
          aCursor = pCursor;
          farDistCm = dist3DCm(pts[seg[aCursor]], pts[idx]);
          pCursor = c;
          farReachedTimeSec = tNow;
        } else if (
          tNow - samples[aIdx].timeSec > 0.45 &&
          farDistCm < minExcursionCm * 0.42 &&
          handFrames[idx].speedCmPerSec < 3.5
        ) {
          // Mantener el origen ajustado al instante real en que arranca el movimiento tras una pausa
          aCursor = c;
          pCursor = c;
          farDistCm = 0;
          farReachedTimeSec = tNow;
        }
        c++;
        continue;
      }

      // `farDistCm >= minExcursionCm`: verificar si continúa extendiendo el trazo o si alcanzó punto de giro
      const radialGain = dFromAnchor - farDistCm;
      const isOrthogonalTurnAfterMove =
        farDistCm >= minExcursionCm * 3.0 &&
        dFromFar > 0.25 &&
        radialGain < 0.16 * dFromFar;

      if (dFromAnchor > farDistCm && !isOrthogonalTurnAfterMove) {
        farDistCm = dFromAnchor;
        pCursor = c;
        farReachedTimeSec = tNow;
        c++;
        continue;
      }

      // Producto punto entre el paso desde el ápice (P_idx - P_p) y el vector del trazo (P_p - P_a)
      const dot =
        (pts[idx].x - pts[pIdx].x) * (pts[pIdx].x - pts[aIdx].x) +
        (pts[idx].y - pts[pIdx].y) * (pts[pIdx].y - pts[aIdx].y) +
        (pts[idx].z - pts[pIdx].z) * (pts[pIdx].z - pts[aIdx].z);

      const reversed =
        dFromFar >= hysteresisCm &&
        (dot <= 0 || dFromAnchor <= farDistCm - 0.35 * hysteresisCm);
      const redirected =
        farDistCm >= minExcursionCm * 3.0 &&
        dFromFar >= Math.max(hysteresisCm, minExcursionCm * 0.72) &&
        radialGain < 0.16 * dFromFar;
      const dwelled =
        tNow - farReachedTimeSec >= dwellConfirmSec &&
        dFromFar <= dwellRadiusCm &&
        handFrames[idx].speedCmPerSec < 5.0;

      if (reversed || redirected) {
        tryEmitStroke(aIdx, pIdx);
        // Avanzar estrictamente `aCursor = pCursor` (> aCursor previo) y reanudar desde `pCursor + 1`
        aCursor = pCursor;
        farDistCm = 0;
        farReachedTimeSec = samples[seg[aCursor]].timeSec;
        c = aCursor + 1;
        continue;
      }

      if (dwelled) {
        tryEmitStroke(aIdx, pIdx);
        aCursor = c;
        pCursor = c;
        farDistCm = 0;
        farReachedTimeSec = tNow;
        c++;
        continue;
      }

      c++;
    }

    // Confirmar el último trazo al cierre del segmento si alcanzó la excursión mínima
    if (farDistCm >= minExcursionCm && pCursor > aCursor) {
      tryEmitStroke(seg[aCursor], seg[pCursor]);
    }
  }

  // Coalescer sub-trazos colineales separados por una breve vacilación en la misma dirección
  // para emparejar con precisión ciclos completos (ida + vuelta o triángulos de 3 estaciones).
  const mergedStrokes: DetectedHandStroke[] = [];
  for (const st of strokes) {
    const prev = mergedStrokes[mergedStrokes.length - 1];
    if (
      prev &&
      st.startSec - prev.endSec <= 0.42 &&
      strokeCosine(prev, st) > 0.42
    ) {
      const dx = st.endPos.x - prev.startPos.x;
      const dy = st.endPos.y - prev.startPos.y;
      const dz = st.endPos.z - prev.startPos.z;
      const ampCm = Math.hypot(dx, dy, dz);
      mergedStrokes[mergedStrokes.length - 1] = {
        startIdx: prev.startIdx,
        endIdx: st.endIdx,
        startSec: prev.startSec,
        endSec: st.endSec,
        startPos: prev.startPos,
        endPos: st.endPos,
        dx,
        dy,
        dz,
        ampCm,
        peakSpeedCmS: Math.max(prev.peakSpeedCmS, st.peakSpeedCmS),
      };
    } else {
      mergedStrokes.push({ ...st });
    }
  }

  // Emparejar trazos en ciclos completos (soporta ida-vuelta 2 trazos, círculos/elipses y triángulos A->B->C->A)
  const cycles: Array<{
    startIdx: number;
    peakIdx: number;
    endIdx: number;
    startSec: number;
    peakSec: number;
    endSec: number;
    amplitudeCm: number;
    peakSpeedCmS: number;
  }> = [];

  let k = 0;
  while (k < mergedStrokes.length) {
    const s0 = mergedStrokes[k];

    // 1. Verificar primero ciclo triangular cerrado de 3 estaciones (A -> B -> C -> A)
    if (k + 2 < mergedStrokes.length) {
      const s1 = mergedStrokes[k + 1];
      const s2 = mergedStrokes[k + 2];
      const cos01 = strokeCosine(s0, s1);
      const distMidToOrigin = dist3DCm(s1.endPos, s0.startPos);
      const distEndToOrigin = dist3DCm(s2.endPos, s0.startPos);
      const maxTriAmp = Math.max(s0.ampCm, s1.ampCm, s2.ampCm);
      const minTriAmp = Math.min(s0.ampCm, s1.ampCm, s2.ampCm);

      if (
        s1.startSec - s0.endSec <= 4.5 &&
        s2.startSec - s1.endSec <= 4.5 &&
        cos01 > -0.72 &&
        distMidToOrigin > 0.62 * s0.ampCm &&
        distEndToOrigin <= 0.55 * maxTriAmp &&
        minTriAmp >= 0.30 * maxTriAmp
      ) {
        const apexIdx = s1.ampCm > s0.ampCm ? s1.endIdx : s0.endIdx;
        cycles.push({
          startIdx: s0.startIdx,
          peakIdx: apexIdx,
          endIdx: s2.endIdx,
          startSec: s0.startSec,
          peakSec: samples[apexIdx].timeSec,
          endSec: s2.endSec,
          amplitudeCm: round1(maxTriAmp),
          peakSpeedCmS: Math.max(s0.peakSpeedCmS, s1.peakSpeedCmS, s2.peakSpeedCmS),
        });
        k += 3;
        continue;
      }
    }

    // 2. Verificar ciclo ida-vuelta de 2 trazos (o dos mitades opuestas de trayectoria circular/elíptica)
    if (k + 1 < mergedStrokes.length) {
      const s1 = mergedStrokes[k + 1];
      const cos01 = strokeCosine(s0, s1);
      const maxPairAmp = Math.max(s0.ampCm, s1.ampCm);
      const minPairAmp = Math.min(s0.ampCm, s1.ampCm);
      const closureToOrigin = dist3DCm(s1.endPos, s0.startPos);

      if (
        s1.startSec - s0.endSec <= 6.0 &&
        minPairAmp >= 0.28 * maxPairAmp &&
        (cos01 <= -0.14 || closureToOrigin <= 0.55 * maxPairAmp)
      ) {
        cycles.push({
          startIdx: s0.startIdx,
          peakIdx: s0.endIdx,
          endIdx: s1.endIdx,
          startSec: s0.startSec,
          peakSec: s0.endSec,
          endSec: s1.endSec,
          amplitudeCm: round1(maxPairAmp),
          peakSpeedCmS: Math.max(s0.peakSpeedCmS, s1.peakSpeedCmS),
        });
        k += 2;
        continue;
      }
    }

    // Trazo aislado (p.ej. levantamiento inicial de brazo hacia la mesa): avanzar al siguiente trazo
    k += 1;
  }

  return { strokes, cycles };
}

/**
 * Construye una curva continua de excursión en cm fiel a los valles y picos reales 3D/2D:
 * - En cada ciclo confirmado sube exactamente hasta `amplitudeCm` en `peakIdx` y vuelve a `0` en los valles.
 * - Fuera de ciclos (o cuando la amplitud queda debajo del umbral), mide la excursión real desde el valle local
 *   reciente para que el usuario vea en el oscilograma la amplitud física exacta de cualquier micro-movimiento.
 */
function buildExcursionEnvelopeSeries(
  samples: HandTimelineSample[],
  handFrames: HandFrameData[],
  sampledFps: number,
  cycles: Array<{
    startIdx: number;
    peakIdx: number;
    endIdx: number;
    amplitudeCm: number;
  }>,
): number[] {
  const n = samples.length;
  const pts: Vec3Cm[] = handFrames.map((hf) => ({
    x: hf.relPosCm.x,
    y: hf.relPosCm.y,
    z: hf.relPosCm.z ?? 0,
  }));

  // Envolvente base sin umbral alto: seguimiento de valle local (ventana hacia atrás de ~1.3 s)
  const lookbackFrames = Math.max(4, Math.round(sampledFps * 1.3));
  const series = new Array<number>(n).fill(0);

  let localOriginIdx = 0;
  let localPeakDist = 0;

  for (let i = 0; i < n; i++) {
    if (!handFrames[i].detected) {
      series[i] = i > 0 ? series[i - 1] * 0.85 : 0;
      localOriginIdx = Math.min(n - 1, i + 1);
      localPeakDist = 0;
      continue;
    }

    if (i - localOriginIdx > lookbackFrames) {
      // Re-anclar al punto de menor velocidad reciente para evitar deriva acumulada
      let calmIdx = Math.max(0, i - Math.round(lookbackFrames * 0.6));
      let minSpd = Infinity;
      for (let m = Math.max(0, i - lookbackFrames); m <= i; m++) {
        if (handFrames[m].detected && handFrames[m].speedCmPerSec < minSpd) {
          minSpd = handFrames[m].speedCmPerSec;
          calmIdx = m;
        }
      }
      localOriginIdx = calmIdx;
      localPeakDist = dist3DCm(pts[localOriginIdx], pts[i]);
    }

    const d = dist3DCm(pts[localOriginIdx], pts[i]);
    if (d > localPeakDist) {
      localPeakDist = d;
    } else if (localPeakDist >= 1.2 && d <= localPeakDist * 0.35 && handFrames[i].speedCmPerSec < 8) {
      localOriginIdx = i;
      localPeakDist = 0;
    }
    series[i] = round2(d);
  }

  // Alinear exactamente cada ciclo detectado para que su pico en el oscilograma coincida con `amplitudeCm`
  for (const cyc of cycles) {
    const outDenom = Math.max(0.1, dist3DCm(pts[cyc.startIdx], pts[cyc.peakIdx]));
    for (let i = cyc.startIdx; i <= cyc.peakIdx; i++) {
      if (!handFrames[i].detected) continue;
      const frac = clamp(dist3DCm(pts[cyc.startIdx], pts[i]) / outDenom, 0, 1);
      series[i] = round2(cyc.amplitudeCm * frac);
    }
    const retDenom = Math.max(0.1, dist3DCm(pts[cyc.peakIdx], pts[cyc.endIdx]));
    for (let i = cyc.peakIdx + 1; i <= cyc.endIdx; i++) {
      if (!handFrames[i].detected) continue;
      const rem = clamp(dist3DCm(pts[i], pts[cyc.endIdx]) / retDenom, 0, 1);
      series[i] = round2(cyc.amplitudeCm * rem);
    }
  }

  return series;
}

function deduceSingleHand(
  trace: HandRepetitionRawTrace,
  logicalHand: 'right' | 'left',
  params: HandDeductionParams,
  adjustments: ManualHandAdjustments,
): HandSideDeductionSummary {
  const sourceKey: 'right' | 'left' = params.swapHands
    ? logicalHand === 'right'
      ? 'left'
      : 'right'
    : logicalHand;

  const wStart = clamp(params.windowStartSec, 0, Math.max(0, trace.durationSec - 0.2));
  const wEnd = clamp(params.windowEndSec, wStart + 0.2, trace.durationSec);
  const windowDurationSec = Math.max(0.2, wEnd - wStart);
  const minExcursionCm = clamp(params.minExcursionCm, 0.8, 40);
  const minIntervalSec = clamp(params.minIntervalMs / 1000, 0.14, 3.0);

  const n = trace.samples.length;
  const handFrames = trace.samples.map((s) => s[sourceKey]);

  const winIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = trace.samples[i].timeSec;
    if (t >= wStart && t <= wEnd) winIndices.push(i);
  }

  const winDetectedCount = winIndices.filter((idx) => handFrames[idx].detected).length;
  const detectedCoveragePct =
    winIndices.length > 0 ? Math.round((winDetectedCount / winIndices.length) * 100) : 0;

  // 1. Segmentación vectorial directa 3D/2D de trazos y ciclos en el umbral elegido
  const { strokes, cycles } = segmentHandStrokes(
    trace.samples,
    handFrames,
    winIndices,
    minExcursionCm,
    trace.sampledFps,
  );

  // 2. Construir eventos de Ciclos (`cycleEvents`) y Acciones Técnicas (`techEvents`) respetando tiempo refractario
  const cycleEvents: HandMovementEvent[] = [];
  for (const cyc of cycles) {
    const prev = cycleEvents[cycleEvents.length - 1];
    const pt = handFrames[cyc.peakIdx]?.workingPoint ?? { x: 0.5, y: 0.5 };
    if (prev && cyc.peakSec - prev.timeSec < minIntervalSec) {
      if (cyc.amplitudeCm > prev.amplitudeCm) {
        cycleEvents[cycleEvents.length - 1] = {
          ...prev,
          id: `auto-cyc-${logicalHand}-${Math.round(cyc.peakSec * 1000)}`,
          timeSec: cyc.peakSec,
          endSec: cyc.endSec,
          amplitudeCm: cyc.amplitudeCm,
          peakSpeedCmPerSec: Math.max(prev.peakSpeedCmPerSec, cyc.peakSpeedCmS),
          screenPoint: pt,
        };
      }
    } else {
      cycleEvents.push({
        id: `auto-cyc-${logicalHand}-${Math.round(cyc.peakSec * 1000)}`,
        hand: logicalHand,
        timeSec: cyc.peakSec,
        startSec: cyc.startSec,
        endSec: cyc.endSec,
        kind: 'alcance_ciclo',
        amplitudeCm: cyc.amplitudeCm,
        peakSpeedCmPerSec: cyc.peakSpeedCmS,
        screenPoint: pt,
      });
    }
  }

  const techEvents: HandMovementEvent[] = [];
  const minTechGap = Math.max(0.14, minIntervalSec * 0.5);
  strokes.forEach((st, idx) => {
    const prev = techEvents[techEvents.length - 1];
    if (prev && st.endSec - prev.timeSec < minTechGap) return;
    const isReturn = idx > 0 && strokeCosine(strokes[idx - 1], st) <= -0.14;
    techEvents.push({
      id: `auto-${isReturn ? 'ret' : 'ida'}-${logicalHand}-${Math.round(st.endSec * 1000)}`,
      hand: logicalHand,
      timeSec: st.endSec,
      startSec: st.startSec,
      endSec: st.endSec,
      kind: isReturn ? 'accion_retorno' : 'accion_ida',
      amplitudeCm: round1(st.ampCm),
      peakSpeedCmPerSec: st.peakSpeedCmS,
      screenPoint: handFrames[st.endIdx]?.workingPoint ?? { x: 0.5, y: 0.5 },
    });
  });

  // 3. Curva de excursión continua (cm) y diagnóstico de micro-movimientos bajo umbral (sin inventar conteos)
  const excursionSeriesCm = buildExcursionEnvelopeSeries(
    trace.samples,
    handFrames,
    trace.sampledFps,
    cycles,
  );

  let maxExcursionCm = 0;
  for (const idx of winIndices) {
    if (excursionSeriesCm[idx] > maxExcursionCm) {
      maxExcursionCm = excursionSeriesCm[idx];
    }
  }
  for (const st of strokes) {
    if (st.ampCm > maxExcursionCm) maxExcursionCm = st.ampCm;
  }

  let subThresholdSuggestedCm: number | null = null;
  if (cycleEvents.length <= 1 && winDetectedCount >= 8 && minExcursionCm > 1.3) {
    const probeFloorCm = 1.1;
    const fineProbe = segmentHandStrokes(
      trace.samples,
      handFrames,
      winIndices,
      probeFloorCm,
      trace.sampledFps,
    );
    const hasMoreCycles =
      fineProbe.cycles.length >= 2 && fineProbe.cycles.length > cycleEvents.length;
    const hasMultipleWorkbenchStrokes =
      cycleEvents.length === 0 && fineProbe.strokes.length >= 3;

    if (hasMoreCycles || hasMultipleWorkbenchStrokes) {
      const fineAmps = hasMoreCycles
        ? fineProbe.cycles.map((c) => c.amplitudeCm)
        : fineProbe.strokes.map((s) => s.ampCm);
      const subAmps = fineAmps.filter((a) => a >= 1.2 && a < minExcursionCm);
      const medFineAmp = medianOf(subAmps.length > 0 ? subAmps : fineAmps, 0);
      if (medFineAmp >= 1.2 && medFineAmp < minExcursionCm) {
        maxExcursionCm = Math.max(maxExcursionCm, Math.max(...fineAmps));
        subThresholdSuggestedCm = clamp(round1(medFineAmp * 0.78), 1.1, minExcursionCm - 0.3);
      }
    }
  }

  // 4. Detección opcional de pinzas digitales en el lugar (solo en primeros planos con 21 puntos nítidos)
  const pinchEvents: HandMovementEvent[] = [];
  if (params.includeFingerPinch && winIndices.length >= 6) {
    const closureProm = clamp(params.pinchProminenceRatio, 0.16, 0.65);
    const hysteresisPinch = closureProm * 0.6;
    const minPinchDurSec = Math.max(0.1, 1.2 / Math.max(10, trace.sampledFps));
    let pState: 'seeking_close' | 'seeking_open' = 'seeking_close';
    let openIdx = -1;
    let openVal = 1.0;
    let closeIdx = -1;
    let closeVal = 1.0;

    for (let cursor = 0; cursor < winIndices.length; cursor++) {
      const idx = winIndices[cursor];
      const hf = handFrames[idx];
      if (
        !hf.detected ||
        hf.source !== 'hand21' ||
        hf.confidence < 0.72 ||
        !Number.isFinite(hf.pinchRatio)
      ) {
        openIdx = -1;
        closeIdx = -1;
        pState = 'seeking_close';
        continue;
      }

      const pr = hf.pinchRatio;
      if (openIdx < 0) {
        openIdx = idx;
        openVal = pr;
        closeIdx = idx;
        closeVal = pr;
        continue;
      }

      if (pState === 'seeking_close') {
        if (pr < closeVal) {
          closeVal = pr;
          closeIdx = idx;
        }
        if (pr > openVal && openVal - closeVal < closureProm) {
          openVal = pr;
          openIdx = idx;
          closeVal = pr;
          closeIdx = idx;
        } else if (
          openVal - closeVal >= closureProm &&
          pr >= closeVal + hysteresisPinch &&
          trace.samples[closeIdx].timeSec - trace.samples[openIdx].timeSec >= minPinchDurSec
        ) {
          const tClose = trace.samples[closeIdx].timeSec;
          const overlapsCycle = cycleEvents.some(
            (ev) => Math.abs(ev.timeSec - tClose) < Math.max(0.32, minIntervalSec * 0.9),
          );
          const prevPinch = pinchEvents[pinchEvents.length - 1];
          if (!overlapsCycle && (!prevPinch || tClose - prevPinch.timeSec >= minIntervalSec)) {
            pinchEvents.push({
              id: `auto-pinch-${logicalHand}-${Math.round(tClose * 1000)}`,
              hand: logicalHand,
              timeSec: tClose,
              startSec: trace.samples[openIdx].timeSec,
              endSec: trace.samples[idx].timeSec,
              kind: 'pinza_digital',
              amplitudeCm: round1((openVal - closeVal) * 9.2),
              peakSpeedCmPerSec: round1(handFrames[closeIdx].speedCmPerSec),
              screenPoint: handFrames[closeIdx].indexTip,
            });
          }
          pState = 'seeking_open';
          openVal = pr;
          openIdx = idx;
        }
      } else {
        if (pr > openVal) {
          openVal = pr;
          openIdx = idx;
        }
        if (pr <= openVal - hysteresisPinch) {
          pState = 'seeking_close';
          closeVal = pr;
          closeIdx = idx;
        }
      }
    }
  }

  // 5. Combinar con ajustes manuales del usuario (silenciar eventos o agregar marcas manuales)
  const suppressedSet = new Set(adjustments.suppressedEventIds);
  const manualForHand: HandMovementEvent[] = adjustments.addedEvents
    .filter((m) => m.hand === logicalHand && m.timeSec >= wStart && m.timeSec <= wEnd)
    .map((m) => {
      let bestIdx = 0;
      let bestDiff = Infinity;
      for (let i = 0; i < n; i++) {
        const d = Math.abs(trace.samples[i].timeSec - m.timeSec);
        if (d < bestDiff) {
          bestDiff = d;
          bestIdx = i;
        }
      }
      return {
        id: m.id,
        hand: logicalHand,
        timeSec: round2(m.timeSec),
        startSec: round2(Math.max(wStart, m.timeSec - 0.15)),
        endSec: round2(Math.min(wEnd, m.timeSec + 0.15)),
        kind: 'manual' as const,
        amplitudeCm: round1(excursionSeriesCm[bestIdx] || minExcursionCm),
        peakSpeedCmPerSec: round1(handFrames[bestIdx]?.speedCmPerSec ?? 0),
        screenPoint: handFrames[bestIdx]?.workingPoint ?? { x: 0.5, y: 0.5 },
      };
    });

  const allCyclicCandidates = [...cycleEvents, ...pinchEvents].sort((a, b) => a.timeSec - b.timeSec);
  const allTechCandidates = [...techEvents, ...pinchEvents].sort((a, b) => a.timeSec - b.timeSec);

  const activeCyclicEvents = [
    ...allCyclicCandidates.filter((e) => !suppressedSet.has(e.id)),
    ...manualForHand,
  ].sort((a, b) => a.timeSec - b.timeSec);

  const activeTechEvents = [
    ...allTechCandidates.filter((e) => !suppressedSet.has(e.id)),
    ...manualForHand,
  ].sort((a, b) => a.timeSec - b.timeSec);

  const baseForMode =
    params.countingMode === 'repeticiones_ciclicas' ? allCyclicCandidates : allTechCandidates;
  const suppressedEvents = baseForMode.filter((e) => suppressedSet.has(e.id));
  const activeEvents =
    params.countingMode === 'repeticiones_ciclicas' ? activeCyclicEvents : activeTechEvents;

  const cyclesCount = activeCyclicEvents.length;
  const technicalActionsCount = Math.max(cyclesCount, activeTechEvents.length);
  const pinchCount = activeEvents.filter((e) => e.kind === 'pinza_digital').length;
  const count = activeEvents.length;

  const cyclesPerMin = round1((cyclesCount / windowDurationSec) * 60);
  const technicalActionsPerMin = round1((technicalActionsCount / windowDurationSec) * 60);
  const ratePerMin = round1((count / windowDurationSec) * 60);

  // Intervalos inter-movimiento y regularidad rítmica
  let meanIntervalSec = 0;
  let stdIntervalSec = 0;
  let regularityPct = 0;
  if (activeEvents.length >= 2) {
    const intervals: number[] = [];
    for (let k = 1; k < activeEvents.length; k++) {
      intervals.push(activeEvents[k].timeSec - activeEvents[k - 1].timeSec);
    }
    meanIntervalSec = round2(intervals.reduce((a, b) => a + b, 0) / intervals.length);
    const variance =
      intervals.reduce((acc, v) => acc + Math.pow(v - meanIntervalSec, 2), 0) / intervals.length;
    stdIntervalSec = round2(Math.sqrt(variance));
    const cv = meanIntervalSec > 0 ? stdIntervalSec / meanIntervalSec : 1;
    regularityPct = Math.round(clamp((1 - cv) * 100, 0, 100));
  } else if (activeEvents.length === 1) {
    meanIntervalSec = round2(windowDurationSec);
  }

  // Tiempo activo dinámico real de la mano vs. micropausa/sostén y recorrido acumulado
  let activeFrames = 0;
  let totalWinFrames = 0;
  let totalDistanceCm = 0;
  let peakSpeedCmPerSec = 0;

  for (let c = 0; c < winIndices.length; c++) {
    const idx = winIndices[c];
    const h = handFrames[idx];
    const tSample = trace.samples[idx].timeSec;
    totalWinFrames++;
    if (h.detected) {
      if (h.speedCmPerSec > peakSpeedCmPerSec) peakSpeedCmPerSec = h.speedCmPerSec;
      const inConfirmedPinch =
        params.includeFingerPinch &&
        pinchEvents.some((pe) => tSample >= pe.startSec && tSample <= pe.endSec);
      if (h.speedCmPerSec >= params.activeSpeedThresholdCmS || inConfirmedPinch) {
        activeFrames++;
      }
      if (c > 0) {
        const prevH = handFrames[winIndices[c - 1]];
        if (prevH.detected && h.speedCmPerSec >= 2.8) {
          totalDistanceCm += Math.hypot(
            h.relPosCm.x - prevH.relPosCm.x,
            h.relPosCm.y - prevH.relPosCm.y,
            (h.relPosCm.z ?? 0) - (prevH.relPosCm.z ?? 0),
          );
        }
      }
    }
  }

  const activeDutyPct =
    totalWinFrames > 0 ? round1((activeFrames / totalWinFrames) * 100) : 0;
  const microPausePct = round1(Math.max(0, 100 - activeDutyPct));

  // Traducción directa a parámetros ergonómicos (OCRA / JSI / NAM 295)
  const ocraDynamicFreqFactor = mapAtaPerMinToOcraChecklistFF(technicalActionsPerMin);
  const ocraFreqMultiplier = mapAtaPerMinToOcraMultiplier(technicalActionsPerMin);
  const ocraStereotypyScore =
    cyclesCount >= 3 && (activeDutyPct >= 80 || (meanIntervalSec > 0 && meanIntervalSec < 8))
      ? 3
      : cyclesCount >= 2 && (activeDutyPct >= 50 || (meanIntervalSec > 0 && meanIntervalSec <= 15))
        ? 1.5
        : 0;

  const jsiEpmScore: 1 | 2 | 3 | 4 | 5 =
    cyclesPerMin < 4 ? 1 : cyclesPerMin <= 8 ? 2 : cyclesPerMin <= 14 ? 3 : cyclesPerMin <= 19 ? 4 : 5;
  const jsiDeScore: 1 | 2 | 3 | 4 | 5 =
    activeDutyPct < 10 ? 1 : activeDutyPct < 30 ? 2 : activeDutyPct < 50 ? 3 : activeDutyPct < 80 ? 4 : 5;

  const namFreqPerSec = count / windowDurationSec;
  const namHalScore = count > 0 ? computeNamHalFromFreqAndDuty(namFreqPerSec, activeDutyPct) : 1;

  return {
    hand: logicalHand,
    count,
    cyclesCount,
    technicalActionsCount,
    pinchCount,
    ratePerMin,
    cyclesPerMin,
    technicalActionsPerMin,
    meanIntervalSec,
    stdIntervalSec,
    regularityPct,
    activeDutyPct,
    microPausePct,
    totalDistanceCm: round1(totalDistanceCm),
    peakSpeedCmPerSec: round1(peakSpeedCmPerSec),
    maxExcursionCm: round1(maxExcursionCm),
    detectedCoveragePct,
    subThresholdSuggestedCm,
    ocraDynamicFreqFactor,
    ocraFreqMultiplier,
    ocraStereotypyScore,
    jsiEpmScore,
    jsiDeScore,
    namHalScore,
    events: activeEvents,
    suppressedEvents,
    excursionSeriesCm,
  };
}

/**
 * Deduce instantáneamente (< 2 ms) los movimientos repetitivos de ambas manos sobre la traza extraída.
 * Permite recalibrar umbrales, ventana temporal y modo de conteo en vivo sin re-escanear el vídeo.
 */
export function deduceHandRepetitiveMovements(
  trace: HandRepetitionRawTrace,
  params: HandDeductionParams,
  adjustments: ManualHandAdjustments = { suppressedEventIds: [], addedEvents: [] },
): HandRepetitionDeductionResult {
  const wStart = clamp(params.windowStartSec, 0, Math.max(0, trace.durationSec - 0.2));
  const wEnd = clamp(params.windowEndSec, wStart + 0.2, trace.durationSec);
  const windowDurationSec = round2(Math.max(0.2, wEnd - wStart));

  const right = deduceSingleHand(trace, 'right', params, adjustments);
  const left = deduceSingleHand(trace, 'left', params, adjustments);

  // Simultaneidad bimanual (% del tiempo en que ambas manos se mueven al mismo tiempo)
  const rSourceKey: 'right' | 'left' = params.swapHands ? 'left' : 'right';
  const lSourceKey: 'right' | 'left' = params.swapHands ? 'right' : 'left';
  let bothActive = 0;
  let eitherActive = 0;
  for (const s of trace.samples) {
    if (s.timeSec < wStart || s.timeSec > wEnd) continue;
    const rAct = s[rSourceKey].detected && s[rSourceKey].speedCmPerSec >= params.activeSpeedThresholdCmS;
    const lAct = s[lSourceKey].detected && s[lSourceKey].speedCmPerSec >= params.activeSpeedThresholdCmS;
    if (rAct || lAct) eitherActive++;
    if (rAct && lAct) bothActive++;
  }
  const simultaneityPct = eitherActive > 0 ? Math.round((bothActive / eitherActive) * 100) : 0;

  let dominantHand: 'right' | 'left' | 'ambas_simetricas' = 'ambas_simetricas';
  if (right.count > left.count * 1.18 + 0.5) dominantHand = 'right';
  else if (left.count > right.count * 1.18 + 0.5) dominantHand = 'left';

  return {
    windowStartSec: round2(wStart),
    windowEndSec: round2(wEnd),
    windowDurationSec,
    right,
    left,
    dominantHand,
    simultaneityPct,
    combinedActionsPerMin: round1(right.ratePerMin + left.ratePerMin),
  };
}

/**
 * Dibuja sobre el `<canvas>` superpuesto al vídeo:
 * - Esqueleto anatómico de 21 articulaciones de Mano Derecha (azul cielo) y Mano Izquierda (ámbar)
 * - Estela cinemática reciente (~0.9 s) del punto funcional de cada mano
 * - Destello e indicador numérico en tiempo real cada vez que una mano suma una repetición
 */
export function drawHandRepetitionOverlay(
  ctx: CanvasRenderingContext2D,
  trace: HandRepetitionRawTrace,
  deduction: HandRepetitionDeductionResult,
  currentTimeSec: number,
  rect: { x: number; y: number; w: number; h: number },
  options: {
    swapHands: boolean;
    showTrails: boolean;
    showSkeleton21: boolean;
    handFocus: 'both' | 'right' | 'left';
  },
): void {
  if (trace.samples.length === 0 || rect.w <= 8 || rect.h <= 8) return;

  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < trace.samples.length; i++) {
    const d = Math.abs(trace.samples[i].timeSec - currentTimeSec);
    if (d < bestDiff) {
      bestDiff = d;
      bestIdx = i;
    }
  }
  const sample = trace.samples[bestIdx];
  const rRaw = options.swapHands ? sample.left : sample.right;
  const lRaw = options.swapHands ? sample.right : sample.left;

  const toPx = (pt: HandPoint2D) => ({
    x: rect.x + pt.x * rect.w,
    y: rect.y + pt.y * rect.h,
  });

  // 1. Estelas de movimiento de los últimos 0.85 s
  if (options.showTrails) {
    const trailWindowSec = 0.85;
    const drawTrail = (logicalSide: 'right' | 'left', strokeRgb: string) => {
      if (options.handFocus !== 'both' && options.handFocus !== logicalSide) return;
      const rawKey: 'right' | 'left' = options.swapHands
        ? logicalSide === 'right'
          ? 'left'
          : 'right'
        : logicalSide;

      const pts: Array<{ x: number; y: number; age: number }> = [];
      for (let k = Math.max(0, bestIdx - 24); k <= bestIdx; k++) {
        const s = trace.samples[k];
        const age = currentTimeSec - s.timeSec;
        if (age < -0.02 || age > trailWindowSec) continue;
        const hd = s[rawKey];
        if (!hd.detected) continue;
        const p = toPx(hd.workingPoint);
        pts.push({ x: p.x, y: p.y, age });
      }
      if (pts.length < 2) return;

      for (let m = 1; m < pts.length; m++) {
        const alpha = clamp(1 - pts[m].age / trailWindowSec, 0.12, 0.92);
        ctx.beginPath();
        ctx.moveTo(pts[m - 1].x, pts[m - 1].y);
        ctx.lineTo(pts[m].x, pts[m].y);
        ctx.strokeStyle = `rgba(${strokeRgb}, ${alpha.toFixed(2)})`;
        ctx.lineWidth = 2.2 + 2.2 * alpha;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    };

    drawTrail('right', '14, 165, 233');
    drawTrail('left', '245, 158, 11');
  }

  // 2. Esqueleto de 21 articulaciones + punto funcional distal de cada mano
  const drawHandVisual = (
    hd: HandFrameData,
    logicalSide: 'right' | 'left',
    mainColor: string,
    lightColor: string,
    labelPrefix: string,
    summary: HandSideDeductionSummary,
  ) => {
    if (options.handFocus !== 'both' && options.handFocus !== logicalSide) return;
    if (!hd.detected) return;

    if (options.showSkeleton21 && hd.landmarks21 && hd.landmarks21.length >= 21) {
      ctx.save();
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = 2.1;
      ctx.lineJoin = 'round';
      for (const [a, b] of HAND_21_CONNECTIONS) {
        const pa = toPx(hd.landmarks21[a]);
        const pb = toPx(hd.landmarks21[b]);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }

      for (let j = 0; j < 21; j++) {
        const p = toPx(hd.landmarks21[j]);
        const isTip = j === 4 || j === 8 || j === 12 || j === 16 || j === 20;
        ctx.beginPath();
        ctx.arc(p.x, p.y, isTip ? 3.4 : 2.3, 0, Math.PI * 2);
        ctx.fillStyle = isTip ? '#ffffff' : lightColor;
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = mainColor;
        ctx.stroke();
      }
      ctx.restore();
    }

    const wp = toPx(hd.workingPoint);
    const recentEvent = summary.events.find(
      (ev) => Math.abs(ev.timeSec - currentTimeSec) <= 0.18,
    );
    const countSoFar = summary.events.filter((ev) => ev.timeSec <= currentTimeSec + 0.04).length;

    if (recentEvent) {
      const pulse = 1 - Math.abs(recentEvent.timeSec - currentTimeSec) / 0.18;
      ctx.beginPath();
      ctx.arc(wp.x, wp.y, 14 + 10 * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = lightColor;
      ctx.lineWidth = 2.6;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(wp.x, wp.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = mainColor;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    const offsetX = logicalSide === 'right' ? -78 : 14;
    const tagX = clamp(wp.x + offsetX, rect.x + 6, rect.x + rect.w - 86);
    const tagY = clamp(wp.y - 28, rect.y + 8, rect.y + rect.h - 28);

    ctx.save();
    ctx.font = '600 11px "JetBrains Mono", ui-monospace, monospace';
    const text = `${labelPrefix}: ${countSoFar}`;
    const tw = ctx.measureText(text).width + 12;
    ctx.fillStyle = recentEvent ? mainColor : 'rgba(15, 23, 42, 0.86)';
    ctx.strokeStyle = lightColor;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(tagX, tagY, tw, 21, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, tagX + 6, tagY + 10.5);
    ctx.restore();
  };

  drawHandVisual(rRaw, 'right', '#0284c7', '#38bdf8', 'DER', deduction.right);
  drawHandVisual(lRaw, 'left', '#d97706', '#fbbf24', 'IZQ', deduction.left);

  // 3. Contador acumulado limpio en la esquina superior izquierda del fotograma
  ctx.save();
  const hudX = rect.x + 12;
  const hudY = rect.y + 12;
  const rSoFar = deduction.right.events.filter((e) => e.timeSec <= currentTimeSec + 0.04).length;
  const lSoFar = deduction.left.events.filter((e) => e.timeSec <= currentTimeSec + 0.04).length;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(hudX, hudY, 226, 46, 6);
  ctx.fill();
  ctx.stroke();

  ctx.font = '600 11px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(`Mano Der: ${rSoFar} / ${deduction.right.count} mov`, hudX + 10, hudY + 17);
  ctx.fillStyle = '#fbbf24';
  ctx.fillText(`Mano Izq: ${lSoFar} / ${deduction.left.count} mov`, hudX + 10, hudY + 35);
  ctx.restore();
}

import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { PosturePose3D } from '../types/figurePlan';
import { makeNeutralPose } from './figurePlanCatalog';
import {
  clampPoseToNormativeWorkAgeLimits,
  NORMATIVE_JOINT_LIMITS,
  resolveTrunkThighMinAngleDeg,
} from './normativeJointLimits';

export interface MocapVec3 {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface MocapFrameSample {
  timeSec: number;
  /** 33 puntos en espacio métrico 3D alineado con la cámara Three.js (+X der pantalla, +Y arriba, +Z hacia cámara) */
  world3D: MocapVec3[];
  /** 33 puntos normalizados 2D [0..1] sobre el fotograma de vídeo original (filtrados 1€) */
  norm2D: MocapVec3[];
  /** 33 puntos normalizados 2D [0..1] crudos pre-filtro 1€ para inferencia de micro-jitter neuromuscular (V2.6 Sec. 2) */
  rawNorm2D?: MocapVec3[];
  /** Traslación real 3D de la pelvis en metros respecto a la postura inicial (caminata / desplazamiento) */
  rootTranslation: { x: number; y: number; z: number };
  /** Visibilidad media de muñeca/codo derecho [0..1] */
  rightArmConfidence: number;
  /** Visibilidad media de muñeca/codo izquierdo [0..1] */
  leftArmConfidence: number;
  /** Indica si existe oclusión relevante en algún miembro superior (< 0.45) */
  hasOcclusion: boolean;
  /** Ángulos ergonómicos equivalentes para lectura técnica y exportación a métodos */
  ergonomicPose: PosturePose3D;
}

export interface OcclusionSegment {
  startSec: number;
  endSec: number;
  occludedSide: 'left' | 'right' | 'both';
  minConfidence: number;
}

export interface MocapCorrectionPin {
  id: string;
  timeSec: number;
  /** Radio temporal (segundos) de transición suave cosenoidal a ambos lados del pin */
  radiusSec: number;
  mirrorArm: 'none' | 'left_from_right' | 'right_from_left';
  trunkPitchOffsetDeg: number;
  rootYawOffsetDeg: number;
  shoulderROffsetDeg: number;
  elbowROffsetDeg: number;
  shoulderLOffsetDeg: number;
  elbowLOffsetDeg: number;
  kneeOffsetDeg: number;
}

export interface MocapTimelineResult {
  frames: MocapFrameSample[];
  durationSec: number;
  videoAspect: number;
  sampledFps: number;
  modelTier: 'heavy' | 'full' | 'lite';
  occlusionSegments: OcclusionSegment[];
}

const MEDIAPIPE_WASM_CDNS = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm',
  'https://unpkg.com/@mediapipe/tasks-vision@0.10.8/wasm',
];

const MODEL_URLS: Array<{ tier: 'heavy' | 'full' | 'lite'; url: string }> = [
  {
    tier: 'heavy',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
  },
  {
    tier: 'full',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  },
  {
    tier: 'lite',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  },
];

async function resolveVisionTasks(): Promise<Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>> {
  for (const cdn of MEDIAPIPE_WASM_CDNS) {
    try {
      const resolver = await FilesetResolver.forVisionTasks(cdn);
      if (resolver) return resolver;
    } catch {
      // Siguiente CDN de respaldo
    }
  }
  throw new Error('No se pudo inicializar el motor WASM de visión computacional.');
}

let heavyLandmarker: PoseLandmarker | null = null;
let loadedModelTier: 'heavy' | 'full' | 'lite' = 'lite';
let loadedPreferFast: boolean | null = null;
let heavyInitPromise: Promise<{ landmarker: PoseLandmarker; tier: 'heavy' | 'full' | 'lite' } | null> | null =
  null;
/**
 * Marca temporal global estrictamente creciente para `PoseLandmarker` en modo `VIDEO`.
 * Impide colisiones `Packet timestamp mismatch` cuando se procesan varios vídeos seguidos.
 */
let lastGlobalMocapTimestampMs = 0;

/**
 * Genera una marca temporal estrictamente creciente compartida entre todos los módulos
 * que consumen el singleton `PoseLandmarker` en modo `VIDEO`.
 */
export function nextMonotonicMocapTimestampMs(stepMs = 42, forceVideoResetJump = false): number {
  const safeStep = Math.max(16, Math.round(stepMs));
  if (forceVideoResetJump) {
    lastGlobalMocapTimestampMs = Math.max(
      lastGlobalMocapTimestampMs + 5000,
      Math.round(performance.now()) + 150,
    );
  } else {
    lastGlobalMocapTimestampMs = Math.max(
      lastGlobalMocapTimestampMs + safeStep,
      Math.round(performance.now()),
    );
  }
  return lastGlobalMocapTimestampMs;
}

let cachedIsSoftwareWebGL: boolean | null = null;

function isSoftwareWebGL(): boolean {
  if (cachedIsSoftwareWebGL !== null) return cachedIsSoftwareWebGL;
  if (typeof document === 'undefined') {
    cachedIsSoftwareWebGL = false;
    return false;
  }
  try {
    const probeCanvas = document.createElement('canvas');
    const gl =
      probeCanvas.getContext('webgl2') ||
      probeCanvas.getContext('webgl') ||
      (probeCanvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) {
      cachedIsSoftwareWebGL = true;
      return true;
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpuStr = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    cachedIsSoftwareWebGL = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpuStr);
    return cachedIsSoftwareWebGL;
  } catch {
    cachedIsSoftwareWebGL = false;
    return false;
  }
}

function isMobileViewportDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.innerWidth < 768 ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches)
  );
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function percentileSorted(arr: number[], q: number, fallback: number): number {
  if (arr.length === 0) return fallback;
  const sorted = [...arr].sort((a, b) => a - b);
  const pos = clamp(q, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  const frac = pos - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

// ============================================================================
// ONE-EURO FILTER (1€ Filter — Casiez, Roussel & Vogel, CHI 2012)
// Elimina el temblor en reposo sin introducir retraso (lag) en movimientos rápidos
// ============================================================================
class LowPassScalar {
  private initialized = false;
  private hatX = 0;

  filter(x: number, alpha: number): number {
    if (!this.initialized) {
      this.initialized = true;
      this.hatX = x;
      return x;
    }
    this.hatX = alpha * x + (1 - alpha) * this.hatX;
    return this.hatX;
  }

  lastValue(): number {
    return this.hatX;
  }
}

export class OneEuroScalarFilter {
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly dCutoff: number;
  private readonly xFilter = new LowPassScalar();
  private readonly dxFilter = new LowPassScalar();
  private lastTimeSec: number | null = null;

  constructor(minCutoff = 1.35, beta = 0.38, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private computeAlpha(cutoffHz: number, dtSec: number): number {
    const tau = 1.0 / (2 * Math.PI * Math.max(0.01, cutoffHz));
    return 1.0 / (1.0 + tau / Math.max(1e-4, dtSec));
  }

  filter(value: number, timestampSec: number): number {
    if (this.lastTimeSec === null || timestampSec <= this.lastTimeSec) {
      this.lastTimeSec = timestampSec;
      return this.xFilter.filter(value, 1);
    }
    const dt = Math.max(1 / 120, Math.min(0.25, timestampSec - this.lastTimeSec));
    this.lastTimeSec = timestampSec;

    const prevX = this.xFilter.lastValue();
    const dx = (value - prevX) / dt;
    const edx = this.dxFilter.filter(dx, this.computeAlpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xFilter.filter(value, this.computeAlpha(cutoff, dt));
  }
}

class Landmark33OneEuroBank {
  private readonly fx: OneEuroScalarFilter[];
  private readonly fy: OneEuroScalarFilter[];
  private readonly fz: OneEuroScalarFilter[];

  constructor(minCutoff: number, beta: number, zMinCutoff = 0.95, zBeta = 0.24) {
    this.fx = Array.from({ length: 33 }, () => new OneEuroScalarFilter(minCutoff, beta, 1.0));
    this.fy = Array.from({ length: 33 }, () => new OneEuroScalarFilter(minCutoff, beta, 1.0));
    // El eje de profundidad monocular Z requiere corte base más firme para evitar vaivén anteroposterior
    this.fz = Array.from({ length: 33 }, () => new OneEuroScalarFilter(zMinCutoff, zBeta, 1.0));
  }

  filterLandmarks(pts: MocapVec3[], tSec: number): MocapVec3[] {
    return pts.map((p, idx) => ({
      x: this.fx[idx].filter(p.x, tSec),
      y: this.fy[idx].filter(p.y, tSec),
      z: this.fz[idx].filter(p.z, tSec),
      visibility: p.visibility,
    }));
  }
}

/**
 * Carga MediaPipe PoseLandmarker en modo IMAGE (detección independiente por fotograma sin pérdida de ROI
 * en saltos temporales ni errores de timestamp), priorizando el modelo FULL en GPU por precisión + velocidad.
 */
export async function initHeavyPoseMoCap(preferFastModel = true): Promise<{
  landmarker: PoseLandmarker;
  tier: 'heavy' | 'full' | 'lite';
} | null> {
  const isMobile = isMobileViewportDevice();
  const effectiveFast = isMobile ? true : preferFastModel;

  if (heavyLandmarker && loadedPreferFast === effectiveFast) {
    return { landmarker: heavyLandmarker, tier: loadedModelTier };
  }
  if (heavyLandmarker && loadedPreferFast !== effectiveFast) {
    try {
      heavyLandmarker.close();
    } catch {
      // Ignorar cierre al cambiar tier
    }
    heavyLandmarker = null;
    heavyInitPromise = null;
  }
  if (heavyInitPromise) return heavyInitPromise;

  heavyInitPromise = (async () => {
    try {
      const vision = await resolveVisionTasks();
      // FULL tiene precisión 3D real en brazos/tronco/piernas y corre en ~8 ms en GPU (sin los fallos de LITE ni los 30 MB de HEAVY)
      const orderedModels = isMobile
        ? [MODEL_URLS[1], MODEL_URLS[2]]
        : effectiveFast
          ? [MODEL_URLS[1], MODEL_URLS[0], MODEL_URLS[2]]
          : [MODEL_URLS[0], MODEL_URLS[1], MODEL_URLS[2]];
      const useCpuDelegate = isSoftwareWebGL();
      const delegates = useCpuDelegate ? (['CPU'] as const) : (['GPU', 'CPU'] as const);
      for (const candidate of orderedModels) {
        for (const delegate of delegates) {
          try {
            const lm = await PoseLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: candidate.url,
                delegate,
              },
              runningMode: 'IMAGE',
              numPoses: 2,
              minPoseDetectionConfidence: 0.20,
              minPosePresenceConfidence: 0.20,
              minTrackingConfidence: 0.20,
            });
            heavyLandmarker = lm;
            loadedModelTier = candidate.tier;
            loadedPreferFast = effectiveFast;
            return { landmarker: lm, tier: candidate.tier };
          } catch {
            // Probar siguiente combinación delegate / modelo
          }
        }
      }
      heavyInitPromise = null;
      return null;
    } catch (err) {
      console.warn('[mocapRetargeter] No se pudo inicializar MediaPipe Pose:', err);
      heavyInitPromise = null;
      return null;
    }
  })();

  return heavyInitPromise;
}

export async function resetHeavyPoseMoCap(
  preferCpuFallback = false,
  preferFastModel = true,
): Promise<{
  landmarker: PoseLandmarker;
  tier: 'heavy' | 'full' | 'lite';
} | null> {
  if (heavyLandmarker) {
    try {
      heavyLandmarker.close();
    } catch {
      // Ignorar cierre de instancia previa
    }
  }
  heavyLandmarker = null;
  loadedPreferFast = null;
  heavyInitPromise = null;

  if (!preferCpuFallback) {
    return initHeavyPoseMoCap(preferFastModel);
  }

  try {
    const vision = await resolveVisionTasks();
    const isMobile = isMobileViewportDevice();
    const effectiveFast = isMobile ? true : preferFastModel;
    const orderedModels = isMobile
      ? [MODEL_URLS[1], MODEL_URLS[2]]
      : effectiveFast
        ? [MODEL_URLS[1], MODEL_URLS[2]]
        : [MODEL_URLS[0], MODEL_URLS[1], MODEL_URLS[2]];
    const delegates = isSoftwareWebGL() ? (['CPU'] as const) : (['CPU', 'GPU'] as const);
    for (const candidate of orderedModels) {
      for (const delegate of delegates) {
        try {
          const lm = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: candidate.url,
              delegate,
            },
            runningMode: 'IMAGE',
            numPoses: 2,
            minPoseDetectionConfidence: 0.20,
            minPosePresenceConfidence: 0.20,
            minTrackingConfidence: 0.20,
          });
          heavyLandmarker = lm;
          loadedModelTier = candidate.tier;
          loadedPreferFast = effectiveFast;
          return { landmarker: lm, tier: candidate.tier };
        } catch {
          // Intentar siguiente modelo
        }
      }
    }
  } catch {
    // Ignorar
  }
  return null;
}

async function ensureVideoFrameDecoded(video: HTMLVideoElement, timeoutMs = 1200): Promise<void> {
  if (video.readyState >= 2 && video.videoWidth > 0) return;
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('loadeddata', finish);
      video.removeEventListener('canplay', finish);
      video.removeEventListener('seeked', finish);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    video.addEventListener('loadeddata', finish, { once: true });
    video.addEventListener('canplay', finish, { once: true });
    video.addEventListener('seeked', finish, { once: true });
    try {
      if (video.preload === 'metadata' || video.preload === 'none') {
        video.preload = 'auto';
      }
      if (video.readyState === 0) {
        video.load();
      } else if (video.readyState === 1) {
        video.currentTime = 0.001;
      }
    } catch {
      finish();
    }
  });
}

function seekVideoExact(video: HTMLVideoElement, timeSec: number): Promise<void> {
  const prep =
    video.videoWidth > 0 && video.readyState >= 1
      ? Promise.resolve()
      : ensureVideoFrameDecoded(video, 1000);
  return prep.then(
    () =>
      new Promise<void>((resolve) => {
        const dur = Number.isFinite(video.duration) && video.duration > 0.05 ? video.duration : 1;
        const safeMax = Math.max(0, dur - 0.06);
        const target = clamp(timeSec, 0, safeMax);
        if (Math.abs(video.currentTime - target) < 0.006 && video.readyState >= 2 && !video.seeking) {
          resolve();
          return;
        }
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          video.removeEventListener('seeked', onSeeked);
          video.removeEventListener('canplay', onFrameReady);
          video.removeEventListener('loadeddata', onFrameReady);
          window.clearTimeout(timer);
          resolve();
        };
        const onFrameReady = () => {
          if (video.readyState >= 2) {
            finish();
          }
        };
        const onSeeked = () => {
          if (video.readyState >= 2) {
            finish();
          } else {
            video.addEventListener('canplay', onFrameReady, { once: true });
            video.addEventListener('loadeddata', onFrameReady, { once: true });
          }
        };
        // Tiempo suficiente (650 ms) para decodificar saltos entre GOPs H.264 sin truncar fotogramas en el mismo cuadro viejo
        const timer = window.setTimeout(finish, 650);
        video.addEventListener('seeked', onSeeked, { once: true });
        try {
          video.currentTime = target;
        } catch {
          finish();
        }
      }),
  );
}

function vecSub(a: MocapVec3, b: MocapVec3): { x: number; y: number; z: number } {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vecMid(a: MocapVec3, b: MocapVec3): MocapVec3 {
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
    z: (a.z + b.z) * 0.5,
    visibility: Math.min(a.visibility, b.visibility),
  };
}

function vecLen(v: { x: number; y: number; z: number }): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function vecNorm(v: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const m = vecLen(v);
  if (m < 1e-6) return { x: 0, y: 1, z: 0 };
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

function vecDot(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vecCross(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function angleDeg(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  const na = vecLen(a);
  const nb = vecLen(b);
  if (na < 1e-6 || nb < 1e-6) return 0;
  return (Math.acos(clamp(vecDot(a, b) / (na * nb), -1, 1)) * 180) / Math.PI;
}

function shortestAngleDiffRad(fromRad: number, toRad: number): number {
  let d = toRad - fromRad;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

interface CalibratedLimbLengths {
  upperArm: number;
  foreArm: number;
  thigh: number;
  shank: number;
}

function medianValue(arr: number[], fallback: number): number {
  if (arr.length === 0) return fallback;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) * 0.5;
}

/**
 * Calibra las longitudes óseas métricas constantes del operario en los fotogramas nítidos
 * para impedir que la estimación monocular acorte o estire fémur/tibia durante agachadas u oclusiones.
 */
function calibrateSubjectLimbLengths(seq: MocapVec3[][]): CalibratedLimbLengths {
  const upperArms: number[] = [];
  const foreArms: number[] = [];
  const thighs: number[] = [];
  const shanks: number[] = [];

  for (const pts of seq) {
    if (!pts || pts.length < 29) continue;
    for (const [a, b] of [
      [11, 13],
      [12, 14],
    ] as const) {
      if (Math.min(pts[a].visibility, pts[b].visibility) >= 0.6) {
        const d = vecLen(vecSub(pts[b], pts[a]));
        if (d > 0.16 && d < 0.45) upperArms.push(d);
      }
    }
    for (const [a, b] of [
      [13, 15],
      [14, 16],
    ] as const) {
      if (Math.min(pts[a].visibility, pts[b].visibility) >= 0.6) {
        const d = vecLen(vecSub(pts[b], pts[a]));
        if (d > 0.15 && d < 0.42) foreArms.push(d);
      }
    }
    for (const [a, b] of [
      [23, 25],
      [24, 26],
    ] as const) {
      if (Math.min(pts[a].visibility, pts[b].visibility) >= 0.6) {
        const d = vecLen(vecSub(pts[b], pts[a]));
        if (d > 0.25 && d < 0.62) thighs.push(d);
      }
    }
    for (const [a, b] of [
      [25, 27],
      [26, 28],
    ] as const) {
      if (Math.min(pts[a].visibility, pts[b].visibility) >= 0.6) {
        const d = vecLen(vecSub(pts[b], pts[a]));
        if (d > 0.24 && d < 0.60) shanks.push(d);
      }
    }
  }

  return {
    upperArm: clamp(medianValue(upperArms, 0.29), 0.22, 0.38),
    foreArm: clamp(medianValue(foreArms, 0.26), 0.20, 0.36),
    thigh: clamp(medianValue(thighs, 0.42), 0.32, 0.54),
    shank: clamp(medianValue(shanks, 0.41), 0.30, 0.52),
  };
}

function pointToSegmentDist2D(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const lenSq = vx * vx + vy * vy;
  if (lenSq < 1e-8) return Math.hypot(px - ax, py - ay);
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / lenSq, 0, 1);
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function solveAnatomicalKnee2BoneIK(
  hipPos: MocapVec3,
  ankTarget: { x: number; y: number; z: number },
  lThigh: number,
  lShank: number,
  bendFwdHint: { x: number; y: number; z: number },
  kneeVis: number,
): { knee: MocapVec3; ankle: { x: number; y: number; z: number } } {
  const deg2rad = Math.PI / 180;
  // Rango fisiológico laboral (20–59 años, (P50+P95)/2): 178.5° internos (1.5° flex) a 38.5° internos (141.5° flex máx)
  const kFlexMinDeg = NORMATIVE_JOINT_LIMITS.knee.kinoveaFlexMinDeg;
  const kExtMaxDeg = NORMATIVE_JOINT_LIMITS.knee.kinoveaExtMaxDeg;
  const dMin = Math.sqrt(
    Math.max(0.01, lThigh * lThigh + lShank * lShank - 2 * lThigh * lShank * Math.cos(kFlexMinDeg * deg2rad)),
  );
  const dMax = Math.sqrt(
    Math.max(0.04, lThigh * lThigh + lShank * lShank - 2 * lThigh * lShank * Math.cos(kExtMaxDeg * deg2rad)),
  );

  const rawDx = ankTarget.x - hipPos.x;
  const rawDy = ankTarget.y - hipPos.y;
  const rawDz = ankTarget.z - hipPos.z;
  const rawDist = Math.hypot(rawDx, rawDy, rawDz);
  const d = clamp(rawDist, dMin, dMax);
  const uHA =
    rawDist > 1e-5
      ? { x: rawDx / rawDist, y: rawDy / rawDist, z: rawDz / rawDist }
      : { x: 0, y: -1, z: 0 };

  const ankClamped = {
    x: hipPos.x + uHA.x * d,
    y: hipPos.y + uHA.y * d,
    z: hipPos.z + uHA.z * d,
  };

  const a = (lThigh * lThigh - lShank * lShank + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, lThigh * lThigh - a * a));

  const dotHint = vecDot(bendFwdHint, uHA);
  let perp = {
    x: bendFwdHint.x - uHA.x * dotHint,
    y: bendFwdHint.y - uHA.y * dotHint,
    z: bendFwdHint.z - uHA.z * dotHint,
  };
  if (vecLen(perp) < 1e-4) {
    perp = { x: 0, y: 0, z: 1 };
  } else {
    perp = vecNorm(perp);
  }

  return {
    knee: {
      x: hipPos.x + uHA.x * a + perp.x * h,
      y: hipPos.y + uHA.y * a + perp.y * h,
      z: hipPos.z + uHA.z * a + perp.z * h,
      visibility: kneeVis,
    },
    ankle: ankClamped,
  };
}

/**
 * Estabiliza miembros inferiores y superiores imponiendo:
 * 1) Detección de oclusión brazo–rodilla (cuando codo/antebrazo/muñeca cruzan delante de la rodilla en 2D).
 * 2) Coherencia bilateral en agachadas (si una rodilla/tobillo pierde referencia detrás de la otra pierna, acompaña la agachada).
 * 3) Cinemática cerrada de 2 huesos (Cadera–Rodilla–Tobillo) y topes articulares anatómicos humanos:
 *    - Codo: 30° flexión máx. a 170° extensión sana (10°–150° de flexión).
 *    - Rodilla: 35° flexión máx. a 176° extensión sana (4°–145° únicamente hacia atrás).
 *    - Cadera: extensión máx. 28°, flexión máx. 102° y ángulo interno tronco–muslo >= 40° (impide que la rodilla suba al pecho).
 */
function enforceAnatomicalLimitsAndLegCoherence(
  alignedWorld: MocapVec3[],
  rawWorld: MocapVec3[],
  norm2D: MocapVec3[],
  videoAspect: number,
  limbs: CalibratedLimbLengths,
  refScale: number,
): MocapVec3[] {
  const out = alignedWorld.map((p) => ({ ...p }));
  const deg2rad = Math.PI / 180;
  const upY = { x: 0, y: 1, z: 0 };

  const shL = out[11];
  const shR = out[12];
  let hipL = out[23];
  let hipR = out[24];
  if (!shL || !shR || !hipL || !hipR) return out;

  const midSh = vecMid(shL, shR);
  let shLeft = vecSub(shL, shR);
  if (vecLen(shLeft) < 0.04) shLeft = { x: 0, y: 0, z: -1 };
  else shLeft = vecNorm(shLeft);

  const minHipVis = Math.min(rawWorld[23]?.visibility ?? 0.5, rawWorld[24]?.visibility ?? 0.5);
  const rawMidHip = vecMid(hipL, hipR);
  const trunkChord3D = vecLen(vecSub(midSh, rawMidHip));

  // Protección anti-colapso ("tirado en el suelo"): SOLO se activa si las caderas están realmente ocultas/fuera de cuadro
  // (`minHipVis < 0.28`), el torso colapsó a < 17 cm o se invirtió verticalmente (`midSh.y < rawMidHip.y - 0.06`),
  // respetando al 100% las agachadas profundas reales de almacén (tronco 65°–88° con caderas visibles).
  if (minHipVis < 0.28 || trunkChord3D < 0.17 || midSh.y < rawMidHip.y - 0.06) {
    let shHorizFwd = vecCross(shLeft, upY);
    if (vecLen(shHorizFwd) < 1e-4) shHorizFwd = { x: 0, y: 0, z: 1 };
    else shHorizFwd = vecNorm(shHorizFwd);

    const wHipFix =
      trunkChord3D < 0.17 || midSh.y < rawMidHip.y - 0.06
        ? 1.0
        : clamp((0.28 - minHipVis) / 0.16, 0.35, 1.0);
    const synthMidHip = {
      x: midSh.x - shHorizFwd.x * 0.04,
      y: midSh.y - 0.46,
      z: midSh.z - shHorizFwd.z * 0.04,
    };
    const halfPelvisW = 0.105;
    const synthHipL: MocapVec3 = {
      x: synthMidHip.x + shLeft.x * halfPelvisW,
      y: synthMidHip.y + shLeft.y * halfPelvisW,
      z: synthMidHip.z + shLeft.z * halfPelvisW,
      visibility: hipL.visibility,
    };
    const synthHipR: MocapVec3 = {
      x: synthMidHip.x - shLeft.x * halfPelvisW,
      y: synthMidHip.y - shLeft.y * halfPelvisW,
      z: synthMidHip.z - shLeft.z * halfPelvisW,
      visibility: hipR.visibility,
    };
    out[23] = {
      x: hipL.x * (1 - wHipFix) + synthHipL.x * wHipFix,
      y: hipL.y * (1 - wHipFix) + synthHipL.y * wHipFix,
      z: hipL.z * (1 - wHipFix) + synthHipL.z * wHipFix,
      visibility: hipL.visibility,
    };
    out[24] = {
      x: hipR.x * (1 - wHipFix) + synthHipR.x * wHipFix,
      y: hipR.y * (1 - wHipFix) + synthHipR.y * wHipFix,
      z: hipR.z * (1 - wHipFix) + synthHipR.z * wHipFix,
      visibility: hipR.visibility,
    };
    hipL = out[23];
    hipR = out[24];
  }

  const midHip = vecMid(hipL, hipR);

  // Protección anti-hiperextensión lumbar ("limbo" hacia atrás > 10°): en manipulación industrial
  // el tronco flexiona hacia adelante o permanece erguido, jamás arqueado 30° hacia atrás.
  {
    let shHorizFwd = vecCross(shLeft, upY);
    if (vecLen(shHorizFwd) < 1e-4) shHorizFwd = { x: 0, y: 0, z: 1 };
    else shHorizFwd = vecNorm(shHorizFwd);
    const curMidSh = vecMid(out[11], out[12]);
    const tVec = vecSub(curMidSh, midHip);
    const tLen = vecLen(tVec);
    if (tLen > 0.16) {
      const cFwd = vecDot(tVec, shHorizFwd) / tLen;
      const minAllowedFwdSin = -Math.sin(10 * deg2rad);
      if (cFwd < minAllowedFwdSin) {
        const corrFwd = (minAllowedFwdSin - cFwd) * tLen;
        for (const uIdx of [0, 7, 8, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]) {
          if (out[uIdx]) {
            out[uIdx] = {
              ...out[uIdx],
              x: out[uIdx].x + shHorizFwd.x * corrFwd,
              y: out[uIdx].y + shHorizFwd.y * corrFwd,
              z: out[uIdx].z + shHorizFwd.z * corrFwd,
            };
          }
        }
      }
    }
  }

  const midShUpdated = vecMid(out[11], out[12]);
  const trunkUp = vecNorm(vecSub(midShUpdated, midHip));
  let hipLeftRaw = vecSub(hipL, hipR);
  if (vecLen(hipLeftRaw) < 0.04) hipLeftRaw = shLeft;
  else hipLeftRaw = vecNorm(hipLeftRaw);

  const hipTrust = clamp((minHipVis - 0.35) / 0.35, 0.25, 0.72);
  const pelvisLeftBlend = vecNorm({
    x: hipLeftRaw.x * hipTrust + shLeft.x * (1 - hipTrust),
    y: hipLeftRaw.y * hipTrust + shLeft.y * (1 - hipTrust),
    z: hipLeftRaw.z * hipTrust + shLeft.z * (1 - hipTrust),
  });
  const pelvisUp = vecNorm({
    x: upY.x * 0.58 + trunkUp.x * 0.52,
    y: upY.y * 0.58 + trunkUp.y * 0.52,
    z: upY.z * 0.58 + trunkUp.z * 0.52,
  });
  let pelvisFwd = vecCross(pelvisLeftBlend, pelvisUp);
  if (vecLen(pelvisFwd) < 1e-5) pelvisFwd = { x: 0, y: 0, z: 1 };
  else pelvisFwd = vecNorm(pelvisFwd);
  const pelvisLeft = vecNorm(vecCross(pelvisUp, pelvisFwd));

  // Escala métrica estable calibrada desde bipedestación (evita que el escorzo 2D al agacharse infle localScale y doble las rodillas 120°)
  const localScale = Math.max(0.16, refScale);

  // Distancia 2D mínima desde una articulación (ej. rodilla) a los 4 segmentos de brazos
  const minDistToArmSegments2D = (ptIdx: number): number => {
    const pt = norm2D[ptIdx];
    if (!pt) return 1;
    const px = pt.x * videoAspect;
    const py = pt.y;
    const armSegs: Array<[number, number]> = [
      [12, 14],
      [14, 16],
      [11, 13],
      [13, 15],
    ];
    let best = 10;
    for (const [a, b] of armSegs) {
      const pa = norm2D[a];
      const pb = norm2D[b];
      if (!pa || !pb) continue;
      if (Math.min(rawWorld[a]?.visibility ?? 0, rawWorld[b]?.visibility ?? 0) < 0.2) continue;
      const d = pointToSegmentDist2D(px, py, pa.x * videoAspect, pa.y, pb.x * videoAspect, pb.y);
      if (d < best) best = d;
    }
    return best;
  };

  // Paso A: Asistencia bilateral o bipedestación erguida cuando las piernas están ocultas / en sombra bajo mesa
  const anklesOffScreen =
    (norm2D[27]?.y ?? 1) > 0.965 ||
    (norm2D[28]?.y ?? 1) > 0.965 ||
    (norm2D[25]?.y ?? 1) > 0.955 ||
    (norm2D[26]?.y ?? 1) > 0.955;
  const legConfR = anklesOffScreen
    ? Math.min(0.32, rawWorld[26]?.visibility ?? 0, rawWorld[28]?.visibility ?? 0)
    : Math.min(rawWorld[26]?.visibility ?? 0, rawWorld[28]?.visibility ?? 0);
  const legConfL = anklesOffScreen
    ? Math.min(0.32, rawWorld[25]?.visibility ?? 0, rawWorld[27]?.visibility ?? 0)
    : Math.min(rawWorld[25]?.visibility ?? 0, rawWorld[27]?.visibility ?? 0);
  const fullLegSpan = limbs.thigh + limbs.shank;
  const mirrorRelAcrossPelvis = (v: { x: number; y: number; z: number }) => {
    const compLeft = vecDot(v, pelvisLeft);
    return {
      x: v.x - 2 * compLeft * pelvisLeft.x,
      y: v.y - 2 * compLeft * pelvisLeft.y,
      z: v.z - 2 * compLeft * pelvisLeft.z,
    };
  };

  const rawAnkCollapsed =
    (out[28] && out[24] && out[28].y > out[24].y - 0.26) ||
    (out[27] && out[23] && out[27].y > out[23].y - 0.26);

  if (Math.max(legConfR, legConfL) < 0.44 || (rawAnkCollapsed && Math.max(legConfR, legConfL) < 0.62)) {
    // Ambas piernas ocultas (sombra bajo banco de trabajo o vídeo de cintura arriba):
    // mantener bipedestación vertical limpia debajo de la pelvis para que el avatar jamás caiga al suelo.
    const wStand = rawAnkCollapsed
      ? 1.0
      : clamp((0.46 - Math.max(legConfR, legConfL)) / 0.22, 0.45, 1.0);
    const applyStandingLeg = (
      hipPt: MocapVec3,
      kneeIdx: number,
      ankIdx: number,
      heelIdx: number,
      toeIdx: number,
    ) => {
      const sKnee = {
        x: hipPt.x + pelvisFwd.x * 0.025,
        y: hipPt.y - limbs.thigh,
        z: hipPt.z + pelvisFwd.z * 0.025,
      };
      const sAnk = {
        x: hipPt.x,
        y: sKnee.y - limbs.shank,
        z: hipPt.z,
      };
      const sHeel = {
        x: sAnk.x - pelvisFwd.x * 0.055,
        y: sAnk.y - 0.045,
        z: sAnk.z - pelvisFwd.z * 0.055,
      };
      const sToe = {
        x: sAnk.x + pelvisFwd.x * 0.145,
        y: sAnk.y - 0.045,
        z: sAnk.z + pelvisFwd.z * 0.145,
      };
      out[kneeIdx] = {
        x: out[kneeIdx].x * (1 - wStand) + sKnee.x * wStand,
        y: out[kneeIdx].y * (1 - wStand) + sKnee.y * wStand,
        z: out[kneeIdx].z * (1 - wStand) + sKnee.z * wStand,
        visibility: out[kneeIdx].visibility,
      };
      out[ankIdx] = {
        x: out[ankIdx].x * (1 - wStand) + sAnk.x * wStand,
        y: out[ankIdx].y * (1 - wStand) + sAnk.y * wStand,
        z: out[ankIdx].z * (1 - wStand) + sAnk.z * wStand,
        visibility: out[ankIdx].visibility,
      };
      if (out[heelIdx]) {
        out[heelIdx] = {
          x: out[heelIdx].x * (1 - wStand) + sHeel.x * wStand,
          y: out[heelIdx].y * (1 - wStand) + sHeel.y * wStand,
          z: out[heelIdx].z * (1 - wStand) + sHeel.z * wStand,
          visibility: out[heelIdx].visibility,
        };
      }
      if (out[toeIdx]) {
        out[toeIdx] = {
          x: out[toeIdx].x * (1 - wStand) + sToe.x * wStand,
          y: out[toeIdx].y * (1 - wStand) + sToe.y * wStand,
          z: out[toeIdx].z * (1 - wStand) + sToe.z * wStand,
          visibility: out[toeIdx].visibility,
        };
      }
    };
    applyStandingLeg(out[24], 26, 28, 30, 32);
    applyStandingLeg(out[23], 25, 27, 29, 31);
  } else if (legConfL < 0.52 && legConfR >= 0.52) {
    const haL = vecSub(out[27], out[23]);
    const haR = vecSub(out[28], out[24]);
    const occCollapsedOrFloating =
      vecLen(haL) < 0.88 * fullLegSpan || out[27].y - out[28].y > 0.065;
    if (occCollapsedOrFloating && vecLen(haR) >= 0.72 * fullLegSpan) {
      const wMirror = clamp((0.56 - legConfL) / 0.28, 0.45, 0.95);
      const mKnee = mirrorRelAcrossPelvis(vecSub(out[26], out[24]));
      const mAnk = mirrorRelAcrossPelvis(haR);
      const mToe = mirrorRelAcrossPelvis(vecSub(out[32], out[28]));
      out[25] = {
        x: out[23].x + (out[25].x - out[23].x) * (1 - wMirror) + mKnee.x * wMirror,
        y: out[23].y + (out[25].y - out[23].y) * (1 - wMirror) + mKnee.y * wMirror,
        z: out[23].z + (out[25].z - out[23].z) * (1 - wMirror) + mKnee.z * wMirror,
        visibility: Math.max(out[25].visibility, legConfR * 0.8),
      };
      const prevAnkL = { ...out[27] };
      out[27] = {
        x: out[23].x + (out[27].x - out[23].x) * (1 - wMirror) + mAnk.x * wMirror,
        y: out[23].y + (out[27].y - out[23].y) * (1 - wMirror) + mAnk.y * wMirror,
        z: out[23].z + (out[27].z - out[23].z) * (1 - wMirror) + mAnk.z * wMirror,
        visibility: Math.max(out[27].visibility, legConfR * 0.8),
      };
      const dAnkX = out[27].x - prevAnkL.x;
      const dAnkY = out[27].y - prevAnkL.y;
      const dAnkZ = out[27].z - prevAnkL.z;
      out[29] = { ...out[29], x: out[29].x + dAnkX, y: out[29].y + dAnkY, z: out[29].z + dAnkZ };
      out[31] = {
        x: out[27].x + mToe.x * wMirror + (out[31].x - prevAnkL.x) * (1 - wMirror),
        y: out[27].y + mToe.y * wMirror + (out[31].y - prevAnkL.y) * (1 - wMirror),
        z: out[27].z + mToe.z * wMirror + (out[31].z - prevAnkL.z) * (1 - wMirror),
        visibility: out[31].visibility,
      };
    }
  } else if (legConfR < 0.52 && legConfL >= 0.52) {
    const haR = vecSub(out[28], out[24]);
    const haL = vecSub(out[27], out[23]);
    const occCollapsedOrFloating =
      vecLen(haR) < 0.88 * fullLegSpan || out[28].y - out[27].y > 0.065;
    if (occCollapsedOrFloating && vecLen(haL) >= 0.72 * fullLegSpan) {
      const wMirror = clamp((0.56 - legConfR) / 0.28, 0.45, 0.95);
      const mKnee = mirrorRelAcrossPelvis(vecSub(out[25], out[23]));
      const mAnk = mirrorRelAcrossPelvis(haL);
      const mToe = mirrorRelAcrossPelvis(vecSub(out[31], out[27]));
      out[26] = {
        x: out[24].x + (out[26].x - out[24].x) * (1 - wMirror) + mKnee.x * wMirror,
        y: out[24].y + (out[26].y - out[24].y) * (1 - wMirror) + mKnee.y * wMirror,
        z: out[24].z + (out[26].z - out[24].z) * (1 - wMirror) + mKnee.z * wMirror,
        visibility: Math.max(out[26].visibility, legConfL * 0.8),
      };
      const prevAnkR = { ...out[28] };
      out[28] = {
        x: out[24].x + (out[28].x - out[24].x) * (1 - wMirror) + mAnk.x * wMirror,
        y: out[24].y + (out[28].y - out[24].y) * (1 - wMirror) + mAnk.y * wMirror,
        z: out[24].z + (out[28].z - out[24].z) * (1 - wMirror) + mAnk.z * wMirror,
        visibility: Math.max(out[28].visibility, legConfL * 0.8),
      };
      const dAnkX = out[28].x - prevAnkR.x;
      const dAnkY = out[28].y - prevAnkR.y;
      const dAnkZ = out[28].z - prevAnkR.z;
      out[30] = { ...out[30], x: out[30].x + dAnkX, y: out[30].y + dAnkY, z: out[30].z + dAnkZ };
      out[32] = {
        x: out[28].x + mToe.x * wMirror + (out[32].x - prevAnkR.x) * (1 - wMirror),
        y: out[28].y + mToe.y * wMirror + (out[32].y - prevAnkR.y) * (1 - wMirror),
        z: out[28].z + mToe.z * wMirror + (out[32].z - prevAnkR.z) * (1 - wMirror),
        visibility: out[32].visibility,
      };
    }
  }

  // Paso B: Protección contra oclusión brazo–rodilla + Límites Anatómicos de Cadera y Rodilla
  const stabilizeSingleLeg = (
    side: 'R' | 'L',
    hipIdx: number,
    kneeIdx: number,
    ankIdx: number,
    heelIdx: number,
    toeIdx: number,
  ) => {
    const H = out[hipIdx];
    const K = out[kneeIdx];
    const A = out[ankIdx];
    const rawKneeVis = rawWorld[kneeIdx]?.visibility ?? K.visibility;
    const rawAnkVis = rawWorld[ankIdx]?.visibility ?? A.visibility;
    const rawHipVis = rawWorld[hipIdx]?.visibility ?? H.visibility;

    const armDist2D = minDistToArmSegments2D(kneeIdx);
    const thighVec = vecSub(K, H);
    const shankVec = vecSub(A, K);
    const thighUnit = vecNorm(thighVec);

    const sagHipDeg =
      (Math.atan2(vecDot(thighUnit, pelvisFwd), -vecDot(thighUnit, pelvisUp)) * 180) / Math.PI;
    const trunkThighDeg = angleDeg(trunkUp, thighUnit);
    const kneeBendDeg = angleDeg(thighVec, shankVec);
    // Verificar también que la rodilla no hiperextienda hacia adelante (flexión normal -> cross apunta a +pelvisLeft)
    const refPosteriorHinge = vecNorm(vecCross(pelvisUp, pelvisFwd));
    const kneeHingeSign = vecDot(
      vecCross(thighUnit, vecNorm(shankVec)),
      refPosteriorHinge,
    );
    const isHyperextendedForward = kneeBendDeg > 6 && kneeHingeSign < -0.12;

    const visW = clamp((0.56 - rawKneeVis) / 0.26, 0, 1);
    const armOccW = clamp((0.105 - armDist2D) / 0.060, 0, 1);
    const kMinFlex = NORMATIVE_JOINT_LIMITS.knee.flexionMinDeg; // 1.5° (178.5° Kinovea)
    const kMaxFlex = NORMATIVE_JOINT_LIMITS.knee.flexionMaxDeg; // 141.5° (38.5° Kinovea)
    const ttSoftMin = NORMATIVE_JOINT_LIMITS.hip.kinoveaTrunkThighSoftMinDeg; // 62.0°
    const ttHardMin = NORMATIVE_JOINT_LIMITS.hip.kinoveaTrunkThighHardMinDeg; // 58.0°
    const hipExtMin = NORMATIVE_JOINT_LIMITS.hip.extensionMaxDeg; // -28°
    const hipFlexMax = NORMATIVE_JOINT_LIMITS.hip.flexionMaxDeg; // 118°

    // Coherencia 2D->3D de apoyo en piso invariante al zoom (cuando el operario se aleja al fondo del pasillo):
    // Evaluar el ángulo 2D real de la pierna de soporte (`supportKneeBend2D`) además de la relación torso/pierna.
    const midHip2DY = ((norm2D[23]?.y ?? 0.5) + (norm2D[24]?.y ?? 0.5)) * 0.5;
    const midSh2DY = ((norm2D[11]?.y ?? 0.3) + (norm2D[12]?.y ?? 0.3)) * 0.5;
    const midHip2DX = ((norm2D[23]?.x ?? 0.5) + (norm2D[24]?.x ?? 0.5)) * 0.5;
    const midSh2DX = ((norm2D[11]?.x ?? 0.5) + (norm2D[12]?.x ?? 0.5)) * 0.5;
    const torsoChord2D = Math.max(
      0.04,
      Math.hypot((midSh2DX - midHip2DX) * videoAspect, midHip2DY - midSh2DY),
    );
    const lAnk2DY = norm2D[27]?.y ?? 0.8;
    const rAnk2DY = norm2D[28]?.y ?? 0.8;
    const floorAnk2DY = Math.max(lAnk2DY, rAnk2DY);
    const supportHipI = lAnk2DY >= rAnk2DY ? 23 : 24;
    const supportKneeI = lAnk2DY >= rAnk2DY ? 25 : 26;
    const supportAnkI = lAnk2DY >= rAnk2DY ? 27 : 28;
    let supportKneeBend2DDeg = 16;
    if (norm2D[supportHipI] && norm2D[supportKneeI] && norm2D[supportAnkI]) {
      const stx = (norm2D[supportKneeI].x - norm2D[supportHipI].x) * videoAspect;
      const sty = norm2D[supportKneeI].y - norm2D[supportHipI].y;
      const ssx = (norm2D[supportAnkI].x - norm2D[supportKneeI].x) * videoAspect;
      const ssy = norm2D[supportAnkI].y - norm2D[supportKneeI].y;
      const slt = Math.hypot(stx, sty);
      const sls = Math.hypot(ssx, ssy);
      if (slt > 0.02 && sls > 0.02) {
        supportKneeBend2DDeg =
          (Math.acos(clamp((stx * ssx + sty * ssy) / (slt * sls), -1, 1)) * 180) / Math.PI;
      }
    }
    const supportHipToFloor2DY = floorAnk2DY - midHip2DY;
    const supportStandingRatio2D =
      supportHipToFloor2DY / Math.max(0.11, fullLegSpan * localScale * 0.84);
    const isFlatFloorStance =
      floorAnk2DY < 0.965 &&
      (supportStandingRatio2D >= 0.66 ||
        (supportKneeBend2DDeg < 36 && supportHipToFloor2DY >= torsoChord2D * 0.72));

    const rawCurAnk2DY = norm2D[ankIdx]?.y ?? floorAnk2DY;
    const ankFloatAboveFloor2D = floorAnk2DY - rawCurAnk2DY;
    const isOccludedFloatingFoot = isFlatFloorStance && ankFloatAboveFloor2D > 0.040;

    let kneeBend2DDeg = kneeBendDeg;
    if (norm2D[hipIdx] && norm2D[kneeIdx] && norm2D[ankIdx] && !isOccludedFloatingFoot) {
      const t2x = (norm2D[kneeIdx].x - norm2D[hipIdx].x) * videoAspect;
      const t2y = norm2D[kneeIdx].y - norm2D[hipIdx].y;
      const s2x = (norm2D[ankIdx].x - norm2D[kneeIdx].x) * videoAspect;
      const s2y = norm2D[ankIdx].y - norm2D[kneeIdx].y;
      const lt2 = Math.hypot(t2x, t2y);
      const ls2 = Math.hypot(s2x, s2y);
      if (lt2 > 0.022 && ls2 > 0.022) {
        kneeBend2DDeg =
          (Math.acos(clamp((t2x * s2x + t2y * s2y) / (lt2 * ls2), -1, 1)) * 180) / Math.PI;
      }
    } else if (isOccludedFloatingFoot) {
      kneeBend2DDeg = 14;
    }

    const maxPlausibleKneeFlex = isFlatFloorStance
      ? isOccludedFloatingFoot
        ? 24
        : clamp(kneeBend2DDeg * 1.10 + 10, 14, 34)
      : kMaxFlex;
    const zKneeHallucW = isOccludedFloatingFoot
      ? 1.0
      : kneeBendDeg > maxPlausibleKneeFlex
        ? clamp((kneeBendDeg - maxPlausibleKneeFlex) / 10, 0.65, 1)
        : 0;

    let limitW = 0;
    if (
      trunkThighDeg < ttHardMin ||
      sagHipDeg > hipFlexMax ||
      sagHipDeg < hipExtMin ||
      kneeBendDeg < kMinFlex ||
      kneeBendDeg > kMaxFlex ||
      isHyperextendedForward
    ) {
      limitW = 1;
    } else if (trunkThighDeg < ttSoftMin + 4 || sagHipDeg > hipFlexMax - 8) {
      limitW = Math.max(
        clamp((ttSoftMin + 4 - trunkThighDeg) / 6, 0, 1),
        clamp((sagHipDeg - (hipFlexMax - 8)) / 8, 0, 1),
      );
    }

    const wIK = clamp(Math.max(visW, armOccW, limitW, zKneeHallucW), 0, 1);
    if (wIK <= 0.01) return;

    // Usar la escala local de la pierna de soporte del mismo fotograma para evitar que la lejanía al fondo comprima Y
    const effLocalLegScale = isFlatFloorStance
      ? clamp(Math.max(localScale * 0.72, supportHipToFloor2DY / (fullLegSpan * 0.94)), 0.14, 1.65)
      : Math.max(0.14, localScale);

    let ankTarget = { x: A.x, y: A.y, z: A.z };
    if (effLocalLegScale > 0.12 && norm2D[hipIdx] && norm2D[ankIdx]) {
      const effAnk2DY = isOccludedFloatingFoot
        ? Math.max(rawCurAnk2DY, floorAnk2DY - 0.018)
        : rawCurAnk2DY;
      let dx2D = ((norm2D[ankIdx].x - norm2D[hipIdx].x) * videoAspect) / effLocalLegScale;
      if (isOccludedFloatingFoot) {
        dx2D = clamp(dx2D * 0.45, -0.13, 0.13);
      } else if (isFlatFloorStance) {
        dx2D = clamp(dx2D, -0.32, 0.32);
      }
      const dy2D = -(effAnk2DY - norm2D[hipIdx].y) / effLocalLegScale;
      const rawDz = isOccludedFloatingFoot
        ? clamp(pelvisFwd.z * -0.04, -0.09, 0.09)
        : clamp((rawWorld[ankIdx].z - rawWorld[hipIdx].z) * 0.35, -0.18, 0.18);
      ankTarget = {
        x: H.x + dx2D,
        y: H.y + dy2D,
        z: H.z + rawDz,
      };
    }

    const legVecTarget = {
      x: ankTarget.x - H.x,
      y: ankTarget.y - H.y,
      z: ankTarget.z - H.z,
    };
    const curTargetSpan = vecLen(legVecTarget);
    const effAnkForRatio = isOccludedFloatingFoot
      ? Math.max(rawCurAnk2DY, floorAnk2DY - 0.018)
      : rawCurAnk2DY;
    const hipToAnkScreenRatio =
      effLocalLegScale > 0.12 && norm2D[hipIdx]
        ? clamp((effAnkForRatio - norm2D[hipIdx].y) / (fullLegSpan * effLocalLegScale), 0.58, 1.0)
        : 0.94;
    const minPhysicalSpan = isFlatFloorStance
      ? fullLegSpan * clamp(Math.max(hipToAnkScreenRatio, 0.93), 0.90, 0.975)
      : fullLegSpan * clamp(hipToAnkScreenRatio, 0.58, 0.975);
    if (curTargetSpan > 0.08 && curTargetSpan < minPhysicalSpan) {
      const stretch = minPhysicalSpan / curTargetSpan;
      ankTarget = {
        x: H.x + legVecTarget.x * stretch,
        y: H.y + legVecTarget.y * stretch,
        z: H.z + legVecTarget.z * stretch,
      };
    }

    const lateralSign = side === 'R' ? -0.05 : 0.05;
    const bendHint = vecNorm({
      x: pelvisFwd.x + pelvisLeft.x * lateralSign,
      y: pelvisFwd.y + pelvisLeft.y * lateralSign,
      z: pelvisFwd.z + pelvisLeft.z * lateralSign,
    });

    const solved = solveAnatomicalKnee2BoneIK(
      H,
      ankTarget,
      limbs.thigh,
      limbs.shank,
      bendHint,
      K.visibility,
    );

    // Aplicar tope anatómico sobre el muslo resultante (tronco–muslo >= 40°, cadera [-28°, +102°])
    let candThigh = vecNorm({
      x: K.x * (1 - wIK) + solved.knee.x * wIK - H.x,
      y: K.y * (1 - wIK) + solved.knee.y * wIK - H.y,
      z: K.z * (1 - wIK) + solved.knee.z * wIK - H.z,
    });

    const cLeft = vecDot(candThigh, pelvisLeft);
    const cUp = vecDot(candThigh, pelvisUp);
    const cFwd = vecDot(candThigh, pelvisFwd);
    const rawLatOut = side === 'R' ? -cLeft : cLeft;
    const clampedLatRad = clamp(Math.asin(clamp(rawLatOut, -1, 1)), -15 * deg2rad, 42 * deg2rad);
    const clampedSagRad = clamp(Math.atan2(cFwd, -cUp), hipExtMin * deg2rad, hipFlexMax * deg2rad);
    const cosL = Math.cos(clampedLatRad);
    const sinL = Math.sin(clampedLatRad);
    const effLeft = side === 'R' ? -sinL : sinL;
    const effDown = Math.cos(clampedSagRad) * cosL;
    const effFwd = Math.sin(clampedSagRad) * cosL;
    candThigh = vecNorm({
      x: pelvisLeft.x * effLeft - pelvisUp.x * effDown + pelvisFwd.x * effFwd,
      y: pelvisLeft.y * effLeft - pelvisUp.y * effDown + pelvisFwd.y * effFwd,
      z: pelvisLeft.z * effLeft - pelvisUp.z * effDown + pelvisFwd.z * effFwd,
    });

    // Freno mecánico muslo-abdomen Hombro–Cadera–Rodilla: amortiguador 62° -> 58° (y 62° estricto bajo oclusión brazo-rodilla)
    const curTTDeg = angleDeg(trunkUp, candThigh);
    const occStrength = Math.max(visW, armOccW);
    const minAllowedTTDeg = resolveTrunkThighMinAngleDeg(curTTDeg, occStrength);
    if (curTTDeg < minAllowedTTDeg - 0.05) {
      let pushAxis = vecCross(trunkUp, candThigh);
      if (vecLen(pushAxis) < 1e-5) pushAxis = { x: -pelvisLeft.x, y: -pelvisLeft.y, z: -pelvisLeft.z };
      else pushAxis = vecNorm(pushAxis);
      const rotPt = rotatePointAroundAxis(
        { x: trunkUp.x, y: trunkUp.y, z: trunkUp.z, visibility: 1 },
        { x: 0, y: 0, z: 0 },
        pushAxis,
        minAllowedTTDeg * deg2rad,
      );
      candThigh = vecNorm(rotPt);
    }

    const newKnee: MocapVec3 = {
      x: H.x + candThigh.x * limbs.thigh,
      y: H.y + candThigh.y * limbs.thigh,
      z: H.z + candThigh.z * limbs.thigh,
      visibility: K.visibility,
    };

    const blendedAnkTarget = {
      x: A.x * (1 - wIK) + solved.ankle.x * wIK,
      y: A.y * (1 - wIK) + solved.ankle.y * wIK,
      z: A.z * (1 - wIK) + solved.ankle.z * wIK,
    };
    let candShank = vecNorm({
      x: blendedAnkTarget.x - newKnee.x,
      y: blendedAnkTarget.y - newKnee.y,
      z: blendedAnkTarget.z - newKnee.z,
    });

    // Asegurar límite de flexión/extensión de rodilla [1.5°, maxPlausibleKneeFlex] siempre en sentido posterior (+pelvisLeft)
    const effKneeMaxFlex = Math.min(kMaxFlex, maxPlausibleKneeFlex);
    const curKneeBend = angleDeg(candThigh, candShank);
    const candHingeRaw = vecCross(candThigh, candShank);
    const isCandHyperextended = curKneeBend > kMinFlex && vecDot(candHingeRaw, refPosteriorHinge) < -0.10;
    if (curKneeBend < kMinFlex || curKneeBend > effKneeMaxFlex || isCandHyperextended) {
      const targetBendRad = (isCandHyperextended ? kMinFlex : clamp(curKneeBend, kMinFlex, effKneeMaxFlex)) * deg2rad;
      let hingeAxis = candHingeRaw;
      if (vecLen(hingeAxis) < 1e-4 || vecDot(hingeAxis, refPosteriorHinge) <= 0) {
        hingeAxis = refPosteriorHinge;
      } else {
        hingeAxis = vecNorm(hingeAxis);
      }
      const rotShank = rotatePointAroundAxis(
        { x: candThigh.x, y: candThigh.y, z: candThigh.z, visibility: 1 },
        { x: 0, y: 0, z: 0 },
        hingeAxis,
        targetBendRad,
      );
      candShank = vecNorm(rotShank);
    }

    const prevAnk = { ...out[ankIdx] };
    out[kneeIdx] = newKnee;
    out[ankIdx] = {
      x: newKnee.x + candShank.x * limbs.shank,
      y: newKnee.y + candShank.y * limbs.shank,
      z: newKnee.z + candShank.z * limbs.shank,
      visibility: A.visibility,
    };

    const shiftAnkX = out[ankIdx].x - prevAnk.x;
    const shiftAnkY = out[ankIdx].y - prevAnk.y;
    const shiftAnkZ = out[ankIdx].z - prevAnk.z;
    if (out[heelIdx]) {
      out[heelIdx] = {
        ...out[heelIdx],
        x: out[heelIdx].x + shiftAnkX,
        y: out[heelIdx].y + shiftAnkY,
        z: out[heelIdx].z + shiftAnkZ,
      };
    }
    if (out[toeIdx]) {
      out[toeIdx] = {
        ...out[toeIdx],
        x: out[toeIdx].x + shiftAnkX,
        y: out[toeIdx].y + shiftAnkY,
        z: out[toeIdx].z + shiftAnkZ,
      };
    }
  };

  stabilizeSingleLeg('R', 24, 26, 28, 30, 32);
  stabilizeSingleLeg('L', 23, 25, 27, 29, 31);

  // Paso C: Topes anatómicos de codo [8.5°..149.5° flex = 171.5°..30.5° Kinovea] y muñeca [-62° dorsal .. +74° palmar]
  const elbMinFlex = NORMATIVE_JOINT_LIMITS.elbow.flexionMinDeg; // 8.5°
  const elbMaxFlex = NORMATIVE_JOINT_LIMITS.elbow.flexionMaxDeg; // 149.5°
  const wrMaxPalmar = NORMATIVE_JOINT_LIMITS.wrist.palmarFlexionMaxDeg; // 74°
  const wrMaxDorsal = Math.abs(NORMATIVE_JOINT_LIMITS.wrist.dorsalExtensionMinDeg); // 62°

  const clampArmChain = (
    shIdx: number,
    elbIdx: number,
    wrIdx: number,
    pinkyIdx: number,
    idxFingerIdx: number,
  ) => {
    const S = out[shIdx];
    const E = out[elbIdx];
    const W = out[wrIdx];
    if (!S || !E || !W) return;
    const uVec = vecSub(E, S);
    const fVec = vecSub(W, E);
    const fLen = Math.max(0.16, vecLen(fVec));
    const curBend = angleDeg(uVec, fVec);
    let foreUnit = vecNorm(fVec);
    const uUnit = vecNorm(uVec);

    let elbowHinge = vecCross(uUnit, foreUnit);
    if (vecLen(elbowHinge) < 1e-4) {
      elbowHinge = vecNorm(vecCross(uUnit, pelvisFwd));
    } else {
      elbowHinge = vecNorm(elbowHinge);
    }

    if (curBend < elbMinFlex || curBend > elbMaxFlex) {
      const targetRad = clamp(curBend, elbMinFlex, elbMaxFlex) * deg2rad;
      const rotFore = rotatePointAroundAxis(
        { x: uUnit.x, y: uUnit.y, z: uUnit.z, visibility: 1 },
        { x: 0, y: 0, z: 0 },
        elbowHinge,
        targetRad,
      );
      foreUnit = vecNorm(rotFore);
      const newW = {
        x: E.x + foreUnit.x * fLen,
        y: E.y + foreUnit.y * fLen,
        z: E.z + foreUnit.z * fLen,
        visibility: W.visibility,
      };
      const dx = newW.x - W.x;
      const dy = newW.y - W.y;
      const dz = newW.z - W.z;
      out[wrIdx] = newW;
      if (out[pinkyIdx]) {
        out[pinkyIdx] = {
          ...out[pinkyIdx],
          x: out[pinkyIdx].x + dx,
          y: out[pinkyIdx].y + dy,
          z: out[pinkyIdx].z + dz,
        };
      }
      if (out[idxFingerIdx]) {
        out[idxFingerIdx] = {
          ...out[idxFingerIdx],
          x: out[idxFingerIdx].x + dx,
          y: out[idxFingerIdx].y + dy,
          z: out[idxFingerIdx].z + dz,
        };
      }
    }

    // Freno capsular de muñeca sobre los segmentos distales (MUN_EXT = 242° [-62°], MUN_FLE = 106° [+74°])
    const Wcur = out[wrIdx];
    const Pcur = out[pinkyIdx];
    const Icur = out[idxFingerIdx];
    if (Wcur && Pcur && Icur) {
      const midHand = vecMid(Pcur, Icur);
      const hVec = vecSub(midHand, Wcur);
      const hLen = vecLen(hVec);
      if (hLen > 0.02) {
        const hUnit = vecNorm(hVec);
        const wrAng = angleDeg(foreUnit, hUnit);
        // Sentido palmar (+) cuando el carpo cierra en el mismo semiespacio flexor del codo
        const wrCross = vecCross(foreUnit, hUnit);
        const isPalmarSide = vecDot(wrCross, elbowHinge) >= 0;
        const maxWrAllowed = isPalmarSide ? wrMaxPalmar : wrMaxDorsal;
        if (wrAng > maxWrAllowed && vecLen(wrCross) > 1e-4) {
          const wrAxis = vecNorm(wrCross);
          const corrRad = (maxWrAllowed - wrAng) * deg2rad;
          out[pinkyIdx] = rotatePointAroundAxis(Pcur, Wcur, wrAxis, corrRad);
          out[idxFingerIdx] = rotatePointAroundAxis(Icur, Wcur, wrAxis, corrRad);
        }
      }
    }
    // Coherencia vertical 2D->3D de brazos (incondicional respecto a visibilidad): si en píxeles 2D el codo o muñeca
    // está debajo del hombro, impedir que alucinaciones monoculares leven el brazo sobre la cabeza (150°+).
    const sh2D = norm2D[shIdx];
    const elb2D = norm2D[elbIdx];
    const wr2D = norm2D[wrIdx];
    const rawArmVis = Math.min(rawWorld[elbIdx]?.visibility ?? 0, rawWorld[wrIdx]?.visibility ?? 0);
    if (sh2D && elb2D && out[elbIdx] && out[wrIdx]) {
      const elbBelowShIn2D = elb2D.y > sh2D.y + 0.015;
      const occludedUnverifiedOverhead =
        rawArmVis < 0.52 && (!wr2D || wr2D.y > sh2D.y - 0.015);
      if ((elbBelowShIn2D || occludedUnverifiedOverhead) && out[elbIdx].y > S.y + 0.015) {
        const curU = vecSub(out[elbIdx], S);
        const curF = vecSub(out[wrIdx], out[elbIdx]);
        const targetDy = elbBelowShIn2D
          ? clamp(-(elb2D.y - sh2D.y) / Math.max(0.18, localScale), -limbs.upperArm * 0.96, -0.045)
          : -limbs.upperArm * 0.68;
        const horizMag = Math.max(
          0.04,
          Math.sqrt(Math.max(0.002, limbs.upperArm * limbs.upperArm - targetDy * targetDy)),
        );
        const curHoriz = Math.hypot(curU.x, curU.z);
        const hx = curHoriz > 0.02 ? (curU.x / curHoriz) * horizMag : pelvisFwd.x * horizMag;
        const hz = curHoriz > 0.02 ? (curU.z / curHoriz) * horizMag : pelvisFwd.z * horizMag;
        const fixedElb: MocapVec3 = {
          x: S.x + hx,
          y: S.y + targetDy,
          z: S.z + hz,
          visibility: out[elbIdx].visibility,
        };
        const prevW = { ...out[wrIdx] };
        const fUnitPrev = vecNorm(curF);
        let newFy = fUnitPrev.y;
        if (wr2D && elb2D && wr2D.y > elb2D.y + 0.012 && newFy > 0.08) {
          newFy = -Math.abs(newFy) * 0.6;
        }
        const fUnitFixed = vecNorm({ x: fUnitPrev.x, y: newFy, z: fUnitPrev.z });
        const fixedWr: MocapVec3 = {
          x: fixedElb.x + fUnitFixed.x * limbs.foreArm,
          y: fixedElb.y + fUnitFixed.y * limbs.foreArm,
          z: fixedElb.z + fUnitFixed.z * limbs.foreArm,
          visibility: out[wrIdx].visibility,
        };
        const dWx = fixedWr.x - prevW.x;
        const dWy = fixedWr.y - prevW.y;
        const dWz = fixedWr.z - prevW.z;
        out[elbIdx] = fixedElb;
        out[wrIdx] = fixedWr;
        if (out[pinkyIdx]) {
          out[pinkyIdx] = {
            ...out[pinkyIdx],
            x: out[pinkyIdx].x + dWx,
            y: out[pinkyIdx].y + dWy,
            z: out[pinkyIdx].z + dWz,
          };
        }
        if (out[idxFingerIdx]) {
          out[idxFingerIdx] = {
            ...out[idxFingerIdx],
            x: out[idxFingerIdx].x + dWx,
            y: out[idxFingerIdx].y + dWy,
            z: out[idxFingerIdx].z + dWz,
          };
        }
      }
    }

    // Guardia coronal anterior de hombro/muñeca: durante agachadas de carga (tronco > 18°) o con codo flexionado > 40°
    // frente al tronco, impedir que inversión monocular de profundidad (-Z) proyecte codos/manos detrás de la espalda (-45°).
    const thFwdArm = vecNorm(vecCross(shLeft, trunkUp));
    const trunkTiltDegNow = angleDeg(trunkUp, upY);
    const E2 = out[elbIdx];
    const W2 = out[wrIdx];
    if (E2 && W2) {
      const relE = vecSub(E2, S);
      const relW = vecSub(W2, S);
      const bendNow = angleDeg(relE, vecSub(W2, E2));
      const cFwdE = vecDot(relE, thFwdArm);
      const cFwdW = vecDot(relW, thFwdArm);
      const minAllowedFwdW = trunkTiltDegNow > 20 ? 0.08 : bendNow > 42 ? 0.03 : -0.08;
      const minAllowedFwdE = trunkTiltDegNow > 22 ? 0.02 : -0.05;
      if (cFwdW < minAllowedFwdW || cFwdE < minAllowedFwdE) {
        const pushE = Math.max(0, minAllowedFwdE - cFwdE);
        const pushW = Math.max(pushE, minAllowedFwdW - cFwdW);
        const pushedE: MocapVec3 = {
          x: E2.x + thFwdArm.x * pushE,
          y: E2.y + thFwdArm.y * pushE,
          z: E2.z + thFwdArm.z * pushE,
          visibility: E2.visibility,
        };
        const uDirFix = vecNorm(vecSub(pushedE, S));
        const finalE: MocapVec3 = {
          x: S.x + uDirFix.x * limbs.upperArm,
          y: S.y + uDirFix.y * limbs.upperArm,
          z: S.z + uDirFix.z * limbs.upperArm,
          visibility: E2.visibility,
        };
        const pushedWTarget = {
          x: W2.x + thFwdArm.x * pushW,
          y: W2.y + thFwdArm.y * pushW,
          z: W2.z + thFwdArm.z * pushW,
        };
        const fDirFix = vecNorm(vecSub({ ...pushedWTarget, visibility: 1 }, finalE));
        const finalW: MocapVec3 = {
          x: finalE.x + fDirFix.x * limbs.foreArm,
          y: finalE.y + fDirFix.y * limbs.foreArm,
          z: finalE.z + fDirFix.z * limbs.foreArm,
          visibility: W2.visibility,
        };
        const dWx = finalW.x - W2.x;
        const dWy = finalW.y - W2.y;
        const dWz = finalW.z - W2.z;
        out[elbIdx] = finalE;
        out[wrIdx] = finalW;
        if (out[pinkyIdx]) {
          out[pinkyIdx] = {
            ...out[pinkyIdx],
            x: out[pinkyIdx].x + dWx,
            y: out[pinkyIdx].y + dWy,
            z: out[pinkyIdx].z + dWz,
          };
        }
        if (out[idxFingerIdx]) {
          out[idxFingerIdx] = {
            ...out[idxFingerIdx],
            x: out[idxFingerIdx].x + dWx,
            y: out[idxFingerIdx].y + dWy,
            z: out[idxFingerIdx].z + dWz,
          };
        }
      }
    }
  };

  // Coherencia bimanual y postural en perfil u oclusión por caja/estantería:
  // En vistas laterales (|horizFwd.x| >= 0.68), el brazo del lado alejado de cámara queda oculto tras el torso/caja
  // incluso cuando MediaPipe le asigna visibilidad aparente de 0.50–0.65. Lo sincronizamos en el marco del tórax.
  {
    const thoraxFwdVec = vecNorm(vecCross(shLeft, trunkUp));
    const thoraxLeftVec = vecNorm(vecCross(trunkUp, thoraxFwdVec));
    const horizThoraxFwd = vecNorm({ x: thoraxFwdVec.x, y: 0, z: thoraxFwdVec.z });
    const trunkTiltFromUpDeg = angleDeg(trunkUp, upY);
    const rArmConf = Math.min(rawWorld[14]?.visibility ?? 0, rawWorld[16]?.visibility ?? 0);
    const lArmConf = Math.min(rawWorld[13]?.visibility ?? 0, rawWorld[15]?.visibility ?? 0);
    const isRightProfile = horizThoraxFwd.x >= 0.68;
    const isLeftProfile = horizThoraxFwd.x <= -0.68;

    const guideNeutralOrStoopArm = (
      side: 'R' | 'L',
      shIdx: number,
      elbIdx: number,
      wrIdx: number,
      pinkyIdx: number,
      idxFinger: number,
      conf: number,
    ) => {
      const oS = out[shIdx];
      const oE = out[elbIdx];
      const oW = out[wrIdx];
      if (!oS || !oE || !oW) return;
      const wGuide = clamp((0.52 - conf) / 0.30, 0.35, 0.90);
      const latSign = side === 'R' ? -1 : 1;
      const isStooping = trunkTiltFromUpDeg > 24;
      const uDir = isStooping
        ? vecNorm({
            x: -upY.x * 0.80 + horizThoraxFwd.x * 0.58 + thoraxLeftVec.x * latSign * 0.08,
            y: -upY.y * 0.80 + horizThoraxFwd.y * 0.58 + thoraxLeftVec.y * latSign * 0.08,
            z: -upY.z * 0.80 + horizThoraxFwd.z * 0.58 + thoraxLeftVec.z * latSign * 0.08,
          })
        : vecNorm({
            x: -trunkUp.x * 0.94 + thoraxFwdVec.x * 0.26 + thoraxLeftVec.x * latSign * 0.14,
            y: -trunkUp.y * 0.94 + thoraxFwdVec.y * 0.26 + thoraxLeftVec.y * latSign * 0.14,
            z: -trunkUp.z * 0.94 + thoraxFwdVec.z * 0.26 + thoraxLeftVec.z * latSign * 0.14,
          });
      const fDir = isStooping
        ? vecNorm({
            x: -upY.x * 0.45 + horizThoraxFwd.x * 0.88 - thoraxLeftVec.x * latSign * 0.10,
            y: -upY.y * 0.45 + horizThoraxFwd.y * 0.88 - thoraxLeftVec.y * latSign * 0.10,
            z: -upY.z * 0.45 + horizThoraxFwd.z * 0.88 - thoraxLeftVec.z * latSign * 0.10,
          })
        : vecNorm({
            x: -trunkUp.x * 0.74 + thoraxFwdVec.x * 0.66 - thoraxLeftVec.x * latSign * 0.08,
            y: -trunkUp.y * 0.74 + thoraxFwdVec.y * 0.66 - thoraxLeftVec.y * latSign * 0.08,
            z: -trunkUp.z * 0.74 + thoraxFwdVec.z * 0.66 - thoraxLeftVec.z * latSign * 0.08,
          });
      const targetElb = {
        x: oS.x + uDir.x * limbs.upperArm,
        y: oS.y + uDir.y * limbs.upperArm,
        z: oS.z + uDir.z * limbs.upperArm,
      };
      const targetWr = {
        x: targetElb.x + fDir.x * limbs.foreArm,
        y: targetElb.y + fDir.y * limbs.foreArm,
        z: targetElb.z + fDir.z * limbs.foreArm,
      };
      const prevOW = { ...oW };
      out[elbIdx] = {
        x: oE.x * (1 - wGuide) + targetElb.x * wGuide,
        y: oE.y * (1 - wGuide) + targetElb.y * wGuide,
        z: oE.z * (1 - wGuide) + targetElb.z * wGuide,
        visibility: Math.max(oE.visibility, 0.52),
      };
      out[wrIdx] = {
        x: oW.x * (1 - wGuide) + targetWr.x * wGuide,
        y: oW.y * (1 - wGuide) + targetWr.y * wGuide,
        z: oW.z * (1 - wGuide) + targetWr.z * wGuide,
        visibility: Math.max(oW.visibility, 0.52),
      };
      const dWX = out[wrIdx].x - prevOW.x;
      const dWY = out[wrIdx].y - prevOW.y;
      const dWZ = out[wrIdx].z - prevOW.z;
      if (out[pinkyIdx]) {
        out[pinkyIdx] = {
          ...out[pinkyIdx],
          x: out[pinkyIdx].x + dWX,
          y: out[pinkyIdx].y + dWY,
          z: out[pinkyIdx].z + dWZ,
        };
      }
      if (out[idxFinger]) {
        out[idxFinger] = {
          ...out[idxFinger],
          x: out[idxFinger].x + dWX,
          y: out[idxFinger].y + dWY,
          z: out[idxFinger].z + dWZ,
        };
      }
    };

    const mirrorVisibleArmToOccluded = (
      occSide: 'R' | 'L',
      visShIdx: number,
      visElbIdx: number,
      visWrIdx: number,
      occShIdx: number,
      occElbIdx: number,
      occWrIdx: number,
      occPinkyIdx: number,
      occIdxFinger: number,
      occConf: number,
      minMirrorWeight = 0.38,
    ) => {
      const vS = out[visShIdx];
      const vE = out[visElbIdx];
      const vW = out[visWrIdx];
      const oS = out[occShIdx];
      const oE = out[occElbIdx];
      const oW = out[occWrIdx];
      if (!vS || !vE || !vW || !oS || !oE || !oW) return;

      const reachVec = vecSub(vW, vS);
      if (vecDot(reachVec, thoraxFwdVec) <= 0.08 && trunkTiltFromUpDeg <= 22) {
        guideNeutralOrStoopArm(
          occSide,
          occShIdx,
          occElbIdx,
          occWrIdx,
          occPinkyIdx,
          occIdxFinger,
          occConf,
        );
        return;
      }

      const wGuide = Math.max(minMirrorWeight, clamp((0.55 - occConf) / 0.28, 0.38, 0.90));
      const mirrorRel = (rel: { x: number; y: number; z: number }) => {
        const cLat = vecDot(rel, thoraxLeftVec);
        return {
          x: rel.x - 2 * cLat * thoraxLeftVec.x,
          y: rel.y - 2 * cLat * thoraxLeftVec.y,
          z: rel.z - 2 * cLat * thoraxLeftVec.z,
        };
      };
      const mElbRel = mirrorRel(vecSub(vE, vS));
      const mWrRel = mirrorRel(reachVec);
      const prevOW = { ...oW };

      out[occElbIdx] = {
        x: oE.x * (1 - wGuide) + (oS.x + mElbRel.x) * wGuide,
        y: oE.y * (1 - wGuide) + (oS.y + mElbRel.y) * wGuide,
        z: oE.z * (1 - wGuide) + (oS.z + mElbRel.z) * wGuide,
        visibility: Math.max(oE.visibility, 0.56),
      };
      out[occWrIdx] = {
        x: oW.x * (1 - wGuide) + (oS.x + mWrRel.x) * wGuide,
        y: oW.y * (1 - wGuide) + (oS.y + mWrRel.y) * wGuide,
        z: oW.z * (1 - wGuide) + (oS.z + mWrRel.z) * wGuide,
        visibility: Math.max(oW.visibility, 0.56),
      };
      const dWX = out[occWrIdx].x - prevOW.x;
      const dWY = out[occWrIdx].y - prevOW.y;
      const dWZ = out[occWrIdx].z - prevOW.z;
      if (out[occPinkyIdx]) {
        out[occPinkyIdx] = {
          ...out[occPinkyIdx],
          x: out[occPinkyIdx].x + dWX,
          y: out[occPinkyIdx].y + dWY,
          z: out[occPinkyIdx].z + dWZ,
        };
      }
      if (out[occIdxFinger]) {
        out[occIdxFinger] = {
          ...out[occIdxFinger],
          x: out[occIdxFinger].x + dWX,
          y: out[occIdxFinger].y + dWY,
          z: out[occIdxFinger].z + dWZ,
        };
      }
    };

    if ((lArmConf < 0.48 && rArmConf >= 0.50) || (isRightProfile && lArmConf < 0.85 && rArmConf >= 0.48)) {
      mirrorVisibleArmToOccluded(
        'L',
        12,
        14,
        16,
        11,
        13,
        15,
        17,
        19,
        lArmConf,
        isRightProfile ? 0.66 : 0.38,
      );
    } else if ((rArmConf < 0.48 && lArmConf >= 0.50) || (isLeftProfile && rArmConf < 0.85 && lArmConf >= 0.48)) {
      mirrorVisibleArmToOccluded(
        'R',
        11,
        13,
        15,
        12,
        14,
        16,
        18,
        20,
        rArmConf,
        isLeftProfile ? 0.66 : 0.38,
      );
    } else {
      if (rArmConf < 0.42) {
        guideNeutralOrStoopArm('R', 12, 14, 16, 18, 20, rArmConf);
      }
      if (lArmConf < 0.42) {
        guideNeutralOrStoopArm('L', 11, 13, 15, 17, 19, lArmConf);
      }
    }
  }

  clampArmChain(12, 14, 16, 18, 20);
  clampArmChain(11, 13, 15, 17, 19);

  // Paso D: Articulación de Tobillo y Pie — apoyo plantígrado al piso y tope máximo <= 20° respecto al suelo
  const horizFwd = vecNorm({ x: pelvisFwd.x, y: 0, z: pelvisFwd.z });
  const horizLeft = vecNorm(vecCross(upY, horizFwd));
  const lowAnkY = Math.min(out[27]?.y ?? 0, out[28]?.y ?? 0);
  const bothFeetPlanted = Math.abs((out[27]?.y ?? 0) - (out[28]?.y ?? 0)) < 0.04;

  const stabilizeFootAndAnkle = (
    side: 'R' | 'L',
    kneeIdx: number,
    ankIdx: number,
    heelIdx: number,
    toeIdx: number,
  ) => {
    const K = out[kneeIdx];
    const A = out[ankIdx];
    const He = out[heelIdx];
    const To = out[toeIdx];
    if (!K || !A || !He || !To) return;

    const visFoot = Math.min(rawWorld[heelIdx]?.visibility ?? 0, rawWorld[toeIdx]?.visibility ?? 0);
    const soleRaw = vecSub(To, He);
    const soleLen = clamp(vecLen(soleRaw), 0.15, 0.27);
    const soleHorizLen = Math.hypot(soleRaw.x, soleRaw.z);

    // 1. Orientación horizontal del pie acotada al ángulo fisiológico de progresión podal (-20° int .. +36° ext)
    const defaultToeOutRad = (side === 'R' ? -5 : 5) * deg2rad;
    let targetYawFromFwd = defaultToeOutRad;
    if (soleHorizLen > 0.03 && visFoot >= 0.42) {
      const cFwd = (soleRaw.x * horizFwd.x + soleRaw.z * horizFwd.z) / soleHorizLen;
      const cLeft = (soleRaw.x * horizLeft.x + soleRaw.z * horizLeft.z) / soleHorizLen;
      const rawYawLeft = Math.atan2(cLeft, cFwd);
      const minYawLeft = (side === 'R' ? -36 : -20) * deg2rad;
      const maxYawLeft = (side === 'R' ? 20 : 36) * deg2rad;
      const clampedYawLeft = clamp(rawYawLeft, minYawLeft, maxYawLeft);
      const trustHoriz = clamp((visFoot - 0.40) / 0.30, 0.25, 1);
      targetYawFromFwd = defaultToeOutRad * (1 - trustHoriz) + clampedYawLeft * trustHoriz;
    }

    const cosYaw = Math.cos(targetYawFromFwd);
    const sinYaw = Math.sin(targetYawFromFwd);
    const footHorizDir = vecNorm({
      x: horizFwd.x * cosYaw + horizLeft.x * sinYaw,
      y: 0,
      z: horizFwd.z * cosYaw + horizLeft.z * sinYaw,
    });

    // 2. Ángulo de la suela respecto al piso: apoyado plano (~0°) en soporte y NUNCA mayor a 20°
    const rawSolePitchDeg =
      soleHorizLen > 0.025 ? (Math.atan2(soleRaw.y, soleHorizLen) * 180) / Math.PI : 0;
    const ankLift = Math.max(0, A.y - lowAnkY);

    let solePitchDeg = 0;
    if (ankLift < 0.05) {
      if (visFoot < 0.58) {
        // Puntos naranjas / baja confianza estando en el piso: pie 100% apoyado horizontal (0°)
        solePitchDeg = 0;
      } else if (bothFeetPlanted) {
        // Bipedestación / alcance / agachada simétrica: amortiguar ruido monocular manteniendo apoyo plano
        solePitchDeg = clamp(rawSolePitchDeg * 0.22, -8, 5);
      } else {
        // Inicio/fin de apoyo durante caminata: permitir rodadura suave sin superar jamás 18°
        solePitchDeg = clamp(rawSolePitchDeg * 0.65, -18, 12);
      }
    } else {
      // Fase de balanceo / despegue al caminar: respetar gesto real acotado estrictamente < 20° respecto al piso
      solePitchDeg = visFoot >= 0.45 ? clamp(rawSolePitchDeg, -19, 15) : clamp(rawSolePitchDeg * 0.4, -12, 8);
    }

    // 3. Límite anatómico tibiotarsiano edad laboral 20–59 años ((P50+P95)/2: dorsiflexión +31.5°, plantar -40.5°) + suela <= 20° al piso
    const shankDown = vecNorm(vecSub(A, K));
    const shinFwdPitchDeg =
      (Math.atan2(
        shankDown.x * footHorizDir.x + shankDown.z * footHorizDir.z,
        Math.max(0.1, -shankDown.y),
      ) *
        180) /
      Math.PI;
    // solePitchDeg relativo a tobillo neutro = solePitchDeg + shinFwdPitchDeg (dorsiflexión +)
    const minSoleByPlantar = NORMATIVE_JOINT_LIMITS.ankle.plantarflexionMinDeg - shinFwdPitchDeg;
    const maxSoleByDorsi = NORMATIVE_JOINT_LIMITS.ankle.dorsiflexionMaxDeg - shinFwdPitchDeg;
    solePitchDeg = clamp(clamp(solePitchDeg, minSoleByPlantar, maxSoleByDorsi), -19, 15);

    const pitchRad = solePitchDeg * deg2rad;
    const cosP = Math.cos(pitchRad);
    const sinP = Math.sin(pitchRad);
    const soleDir = vecNorm({
      x: footHorizDir.x * cosP,
      y: sinP,
      z: footHorizDir.z * cosP,
    });

    // Posicionar talón y punta coherentemente respecto al tobillo conservando la dirección estabilizada de suela
    const ankleHeightOverSole = 0.045;
    const heelBackDist = soleLen * 0.28;
    const newHeel: MocapVec3 = {
      x: A.x - soleDir.x * heelBackDist,
      y: A.y - ankleHeightOverSole - soleDir.y * heelBackDist,
      z: A.z - soleDir.z * heelBackDist,
      visibility: He.visibility,
    };
    const newToe: MocapVec3 = {
      x: newHeel.x + soleDir.x * soleLen,
      y: newHeel.y + soleDir.y * soleLen,
      z: newHeel.z + soleDir.z * soleLen,
      visibility: To.visibility,
    };

    out[heelIdx] = newHeel;
    out[toeIdx] = newToe;
  };

  stabilizeFootAndAnkle('R', 26, 28, 30, 32);
  stabilizeFootAndAnkle('L', 25, 27, 29, 31);

  return out;
}

/**
 * Fusiona la dirección 2D exacta de los píxeles del vídeo (corregida por relación de aspecto)
 * con las longitudes óseas constantes y profundidad 3D de `worldLandmarks`, para que la silueta
 * proyectada del Avatar 3D coincida visualmente 1:1 con los brazos, tronco y piernas del operario.
 */
function alignWorldChainToScreen2D(
  world3D: MocapVec3[],
  norm2D: MocapVec3[],
  videoAspect: number,
  calibratedLimbs?: CalibratedLimbLengths,
  refScale?: number,
): MocapVec3[] {
  const out = world3D.map((p) => ({ ...p }));

  // 0. Alinear inclinación de Tronco (midHip -> midSh) y Cabeza con los píxeles reales 2D del vídeo
  // conservando la envergadura inter-escapular 3D (giro axial / yaw) y longitud anatómica del torso.
  const hipLOrig = world3D[23];
  const hipROrig = world3D[24];
  const shLOrig = world3D[11];
  const shROrig = world3D[12];
  if (hipLOrig && hipROrig && shLOrig && shROrig && norm2D[11] && norm2D[12] && norm2D[23] && norm2D[24]) {
    const hipsInFrame =
      norm2D[23].y >= 0.05 &&
      norm2D[23].y <= 0.93 &&
      norm2D[24].y >= 0.05 &&
      norm2D[24].y <= 0.93 &&
      norm2D[11].y >= 0.04 &&
      norm2D[12].y >= 0.04;
    const trunkVis = Math.min(
      hipLOrig.visibility,
      hipROrig.visibility,
      shLOrig.visibility,
      shROrig.visibility,
    );
    if (hipsInFrame && trunkVis >= 0.52) {
      const midHipW = vecMid(hipLOrig, hipROrig);
      const midShW = vecMid(shLOrig, shROrig);
      const tDxW = midShW.x - midHipW.x;
      const tDyW = midShW.y - midHipW.y;
      const tDzW = midShW.z - midHipW.z;
      const lenTrunk3D = Math.hypot(tDxW, tDyW, tDzW);

      const midHipScrX = (norm2D[23].x + norm2D[24].x) * 0.5 * videoAspect;
      const midHipScrY = (norm2D[23].y + norm2D[24].y) * 0.5;
      const midShScrX = (norm2D[11].x + norm2D[12].x) * 0.5 * videoAspect;
      const midShScrY = (norm2D[11].y + norm2D[12].y) * 0.5;
      const dxTrunkScr = midShScrX - midHipScrX;
      const dyTrunkScr = -(midShScrY - midHipScrY);
      const lenTrunkScr = Math.hypot(dxTrunkScr, dyTrunkScr);

      if (lenTrunk3D > 0.16 && lenTrunkScr > 0.03) {
        const shLeftW = vecNorm(vecSub(shLOrig, shROrig));
        const subjFwdHoriz = vecNorm(vecCross(shLeftW, { x: 0, y: 1, z: 0 }));

        // Estimación invariante al zoom de la flexión de tronco (tanto por escorzo 2D como por alcance bajo hacia palé/estante):
        let localExpectedTorso2D = 0.45 * Math.max(0.20, refScale ?? 0.45);
        let legSpanScr = 0;
        let floorAnkScrY = 0.82;
        const ankVis = Math.max(norm2D[27]?.visibility ?? 0, norm2D[28]?.visibility ?? 0);
        if (ankVis >= 0.35 && norm2D[27] && norm2D[28]) {
          floorAnkScrY = Math.max(norm2D[27].y, norm2D[28].y);
          const supportAnkIdx = norm2D[27].y >= norm2D[28].y ? 27 : 28;
          const supportAnkScrX = norm2D[supportAnkIdx].x * videoAspect;
          legSpanScr = Math.hypot(supportAnkScrX - midHipScrX, floorAnkScrY - midHipScrY);
          if (legSpanScr > 0.085 && floorAnkScrY < 0.965) {
            localExpectedTorso2D = Math.max(0.065, legSpanScr * 0.78);
          }
        }
        const cosPhiForeshorten = clamp(lenTrunkScr / Math.max(0.065, localExpectedTorso2D), 0.34, 1.0);

        // Detectar agachada lumbar real por descenso de manos/cabeza con piernas extendidas (ej. palé bajo o nivel inferior de estantería)
        let minStoopTiltRad = 0;
        if (legSpanScr > 0.085 && floorAnkScrY < 0.965) {
          const wrLY = (norm2D[15]?.visibility ?? 0) >= 0.24 ? norm2D[15].y : midHipScrY;
          const wrRY = (norm2D[16]?.visibility ?? 0) >= 0.24 ? norm2D[16].y : midHipScrY;
          const lowWristY = Math.max(wrLY, wrRY);
          const wristBelowHipRatio = (lowWristY - midHipScrY) / legSpanScr;
          const earMidY =
            norm2D[7] && norm2D[8] ? (norm2D[7].y + norm2D[8].y) * 0.5 : (norm2D[0]?.y ?? midShScrY);
          const headRefY = Math.max(norm2D[0]?.y ?? midShScrY, earMidY);
          const neckHeightRatio = (midShScrY - headRefY) / legSpanScr;
          if (wristBelowHipRatio > 0.18 && neckHeightRatio < 0.26) {
            minStoopTiltRad = clamp((wristBelowHipRatio - 0.14) * 1.65, 0, 56 * (Math.PI / 180));
          } else if (neckHeightRatio < 0.13 && wristBelowHipRatio > -0.04) {
            minStoopTiltRad = clamp((0.15 - neckHeightRatio) * 4.2, 24 * (Math.PI / 180), 44 * (Math.PI / 180));
          }
        }

        const planarTiltRad = Math.atan2(Math.abs(dxTrunkScr), Math.max(0.01, dyTrunkScr));
        const foreshortenTiltRad = cosPhiForeshorten < 0.92 ? Math.acos(cosPhiForeshorten) : 0;
        const worldFwdDot = tDxW * subjFwdHoriz.x + tDzW * subjFwdHoriz.z;
        const dorsalWorldStoopRad =
          subjFwdHoriz.z < -0.40 && worldFwdDot > 0.03
            ? clamp(Math.atan2(worldFwdDot, Math.max(0.08, tDyW)), 0, 58 * (Math.PI / 180))
            : 0;
        const desiredTotalTiltRad = clamp(
          Math.max(planarTiltRad, foreshortenTiltRad, minStoopTiltRad, dorsalWorldStoopRad),
          0,
          76 * (Math.PI / 180),
        );

        const sinTotal = Math.sin(desiredTotalTiltRad);
        const cosTotal = Math.cos(desiredTotalTiltRad);
        const horizDisp3D = lenTrunk3D * sinTotal;

        // Distribuir la inclinación horizontal del tronco entre el plano de pantalla (dx) y profundidad (dz) coherente con subjFwdHoriz
        const hasStrongPlanarLean = Math.abs(dxTrunkScr) > lenTrunkScr * 0.24;
        let dirHorizX = hasStrongPlanarLean
          ? Math.sign(dxTrunkScr) * Math.max(Math.abs(subjFwdHoriz.x), Math.min(0.96, Math.abs(dxTrunkScr) / Math.max(0.03, lenTrunkScr)))
          : subjFwdHoriz.x;
        let dirHorizZ = subjFwdHoriz.z;
        const normHoriz = Math.hypot(dirHorizX, dirHorizZ);
        if (normHoriz > 1e-4) {
          dirHorizX /= normHoriz;
          dirHorizZ /= normHoriz;
        } else {
          dirHorizX = Math.sign(dxTrunkScr);
          dirHorizZ = 0;
        }

        const targetTrunkDx = horizDisp3D * dirHorizX;
        const targetTrunkDy = lenTrunk3D * cosTotal;
        const targetTrunkDz = clamp(horizDisp3D * dirHorizZ, -lenTrunk3D * 0.82, lenTrunk3D * 0.82);

        const wTrunk = 0.88 * clamp((trunkVis - 0.40) / 0.38, 0.45, 1);
        const newMidShX = midHipW.x + (tDxW * (1 - wTrunk) + targetTrunkDx * wTrunk);
        const newMidShY = midHipW.y + (tDyW * (1 - wTrunk) + targetTrunkDy * wTrunk);
        const newMidShZ = midHipW.z + (tDzW * (1 - wTrunk) + targetTrunkDz * wTrunk);

        const shiftX = newMidShX - midShW.x;
        const shiftY = newMidShY - midShW.y;
        const shiftZ = newMidShZ - midShW.z;

        for (const upperIdx of [0, 7, 8, 11, 12]) {
          if (out[upperIdx]) {
            out[upperIdx] = {
              x: out[upperIdx].x + shiftX,
              y: out[upperIdx].y + shiftY,
              z: out[upperIdx].z + shiftZ,
              visibility: out[upperIdx].visibility,
            };
          }
        }
      }
    }
  }

  const shLeftNow =
    out[11] && out[12] ? vecNorm(vecSub(out[11], out[12])) : { x: 1, y: 0, z: 0 };
  const bodyFwdHoriz = vecNorm(vecCross(shLeftNow, { x: 0, y: 1, z: 0 }));

  const alignSegment = (
    parentIdx: number,
    childIdx: number,
    blendWeight: number,
    fixedBoneLen?: number,
    isArmSegment = false,
  ) => {
    const pW = out[parentIdx];
    const cW = world3D[childIdx];
    const pOrigW = world3D[parentIdx];
    const pN = norm2D[parentIdx];
    const cN = norm2D[childIdx];
    if (!pW || !cW || !pOrigW || !pN || !cN) return;

    const dxW = cW.x - pOrigW.x;
    const dyW = cW.y - pOrigW.y;
    const dzW = cW.z - pOrigW.z;
    const rawLen3D = Math.hypot(dxW, dyW, dzW);
    const len3D = fixedBoneLen ?? rawLen3D;

    const minVis = Math.min(pW.visibility, cW.visibility);
    if (minVis < 0.20) {
      const scaleRel = rawLen3D > 0.03 && fixedBoneLen ? fixedBoneLen / rawLen3D : 1;
      out[childIdx] = {
        x: pW.x + dxW * scaleRel,
        y: pW.y + dyW * scaleRel,
        z: pW.z + dzW * scaleRel,
        visibility: cW.visibility,
      };
      return;
    }

    const lenXY = Math.hypot(dxW, dyW);
    const dxScreen = (cN.x - pN.x) * videoAspect;
    const dyScreen = -(cN.y - pN.y);
    const lenScreen = Math.hypot(dxScreen, dyScreen);

    if (len3D > 0.035 && lenScreen > 0.012) {
      const angScreen = Math.atan2(dyScreen, dxScreen);
      const angW = lenXY > 0.02 ? Math.atan2(dyW, dxW) : angScreen;
      const effWeight = blendWeight * clamp((minVis - 0.18) / 0.42, 0.38, 1);
      const angAligned = angW + shortestAngleDiffRad(angW, angScreen) * effWeight;

      let blendedDz = dzW * 0.55;
      if (isArmSegment) {
        const absFx = Math.abs(bodyFwdHoriz.x);
        const absFz = Math.abs(bodyFwdHoriz.z);
        if (absFx >= 0.62 && dxScreen * bodyFwdHoriz.x > -0.015) {
          // En perfil/oblicuo lateral, alinear profundidad Z del brazo con el plano sagital anterior (thoraxFwd)
          // para que el antebrazo apunte directo hacia la caja/estante y no cruce el abdomen por ruido monocular -Z.
          const approxVx = Math.cos(angAligned) * len3D * 0.88;
          const sagDz = clamp(approxVx * (bodyFwdHoriz.z / bodyFwdHoriz.x), -len3D * 0.55, len3D * 0.55);
          const wSag = clamp((absFx - 0.58) / 0.26, 0, 0.90);
          blendedDz = blendedDz * (1 - wSag) + sagDz * wSag;
        } else if (absFz >= 0.60 && fixedBoneLen && refScale && refScale > 0.18) {
          const expectedMaxScreen = fixedBoneLen * refScale;
          if (expectedMaxScreen > 0.04) {
            const cosPhiZ = clamp(lenScreen / expectedMaxScreen, 0.42, 1.0);
            if (cosPhiZ < 0.86) {
              const foreshortenMagZ = fixedBoneLen * Math.sqrt(Math.max(0, 1 - cosPhiZ * cosPhiZ));
              blendedDz = blendedDz * 0.35 + Math.sign(bodyFwdHoriz.z) * foreshortenMagZ * 0.65;
            }
          }
        }
      } else {
        // Piernas: amortiguar fuertemente Z monocular para evitar flexiones fantasmas fuera de plano
        blendedDz = dzW * 0.35;
      }

      const dampedDz = clamp(blendedDz, -len3D * 0.72, len3D * 0.72);
      const targetLenXY = Math.sqrt(Math.max(0.0004, len3D * len3D - dampedDz * dampedDz));
      out[childIdx] = {
        x: pW.x + Math.cos(angAligned) * targetLenXY,
        y: pW.y + Math.sin(angAligned) * targetLenXY,
        z: pW.z + dampedDz,
        visibility: cW.visibility,
      };
    } else {
      out[childIdx] = {
        x: pW.x + dxW,
        y: pW.y + dyW,
        z: pW.z + dzW,
        visibility: cW.visibility,
      };
    }
  };

  // Descartar muñecas/codos 2D enganchados por error a vigas lejanas del fondo (> 1.48x brazo máximo proyectado)
  const armFullLen3D = (calibratedLimbs?.upperArm ?? 0.28) + (calibratedLimbs?.foreArm ?? 0.25);
  const maxPlausibleArmScr = Math.max(0.18, armFullLen3D * Math.max(0.22, refScale ?? 0.42) * 1.48);
  for (const [shI, elbI, wrI] of [
    [12, 14, 16],
    [11, 13, 15],
  ] as const) {
    if (norm2D[shI] && norm2D[wrI]) {
      const spanScr = Math.hypot(
        (norm2D[wrI].x - norm2D[shI].x) * videoAspect,
        norm2D[wrI].y - norm2D[shI].y,
      );
      if (spanScr > maxPlausibleArmScr) {
        norm2D[wrI] = { ...norm2D[wrI], visibility: Math.min(norm2D[wrI].visibility, 0.12) };
        if (norm2D[elbI]) {
          norm2D[elbI] = { ...norm2D[elbI], visibility: Math.min(norm2D[elbI].visibility, 0.15) };
        }
      }
    }
  }

  // Alinear cadenas cinemáticas desde hombros y caderas hacia extremos distales con longitud ósea constante
  alignSegment(12, 14, 0.86, calibratedLimbs?.upperArm, true); // Hombro Der -> Codo Der
  alignSegment(14, 16, 0.88, calibratedLimbs?.foreArm, true); // Codo Der -> Muñeca Der
  alignSegment(16, 20, 0.68, undefined, true); // Muñeca Der -> Índice Der
  alignSegment(16, 18, 0.68, undefined, true); // Muñeca Der -> Meñique Der

  alignSegment(11, 13, 0.86, calibratedLimbs?.upperArm, true); // Hombro Izq -> Codo Izq
  alignSegment(13, 15, 0.88, calibratedLimbs?.foreArm, true); // Codo Izq -> Muñeca Izq
  alignSegment(15, 19, 0.68, undefined, true); // Muñeca Izq -> Índice Izq
  alignSegment(15, 17, 0.68, undefined, true); // Muñeca Izq -> Meñique Izq

  alignSegment(24, 26, 0.82, calibratedLimbs?.thigh, false); // Cadera Der -> Rodilla Der
  alignSegment(26, 28, 0.84, calibratedLimbs?.shank, false); // Rodilla Der -> Tobillo Der
  alignSegment(28, 30, 0.55, undefined, false); // Tobillo Der -> Talón Der
  alignSegment(28, 32, 0.65, undefined, false); // Tobillo Der -> Punta Pie Der

  alignSegment(23, 25, 0.82, calibratedLimbs?.thigh, false); // Cadera Izq -> Rodilla Izq
  alignSegment(25, 27, 0.84, calibratedLimbs?.shank, false); // Rodilla Izq -> Tobillo Izq
  alignSegment(27, 29, 0.55, undefined, false); // Tobillo Izq -> Talón Izq
  alignSegment(27, 31, 0.65, undefined, false); // Tobillo Izq -> Punta Pie Izq

  return out;
}

/**
 * Calcula ángulos ergonómicos de lectura (Tronco, Cuello, Brazos, Rodillas, Giro Global)
 * coherentes con la pose 3D reconstruida para el HUD y la transferencia al estudio.
 */
export function computeErgonomicPoseFromWorld3D(
  world3D: MocapVec3[],
  rootTranslation: { x: number; y: number; z: number },
): PosturePose3D {
  const upY = { x: 0, y: 1, z: 0 };
  const downY = { x: 0, y: -1, z: 0 };

  const shL = world3D[11];
  const shR = world3D[12];
  const elbL = world3D[13];
  const elbR = world3D[14];
  const wrL = world3D[15];
  const wrR = world3D[16];
  const hipL = world3D[23];
  const hipR = world3D[24];
  const kneeL = world3D[25];
  const kneeR = world3D[26];
  const ankL = world3D[27];
  const ankR = world3D[28];
  const earL = world3D[7];
  const earR = world3D[8];

  const midHip = vecMid(hipL, hipR);
  const midSh = vecMid(shL, shR);
  const midEar = vecMid(earL, earR);

  const leftSh = vecNorm(vecSub(shL, shR));
  const leftHip = vecNorm(vecSub(hipL, hipR));
  const trunkUp = vecNorm(vecSub(midSh, midHip));
  const subjectFwd = vecNorm(vecCross(leftSh, upY));

  const trunkTilt = angleDeg(trunkUp, upY);
  const fwdSign = vecDot(trunkUp, subjectFwd) >= -0.08 ? 1 : -1;
  const trunkFlexionDeg = clamp(round1(fwdSign * trunkTilt), -30, 125);

  const latSin = clamp(vecDot(trunkUp, leftHip), -1, 1);
  const trunkLateralDeg = clamp(round1((-Math.asin(latSin) * 180) / Math.PI), -35, 35);

  const shHoriz = vecNorm({ x: leftSh.x, y: 0, z: leftSh.z });
  const hipHoriz = vecNorm({ x: leftHip.x, y: 0, z: leftHip.z });
  const twistMag = angleDeg(shHoriz, hipHoriz);
  const twistSign = vecCross(hipHoriz, shHoriz).y >= 0 ? 1 : -1;
  const trunkTwistDeg = clamp(round1(twistSign * twistMag), -60, 60);

  const pelvisFwdHoriz = vecNorm(vecCross(hipHoriz, upY));
  const rootYawDeg = round1((Math.atan2(pelvisFwdHoriz.x, pelvisFwdHoriz.z) * 180) / Math.PI);

  const neckUp = vecNorm(vecSub(midEar, midSh));
  const neckTiltMag = angleDeg(neckUp, trunkUp);
  const neckFwdSign = vecDot(neckUp, subjectFwd) >= vecDot(trunkUp, subjectFwd) - 0.04 ? 1 : -1;
  const neckFlexionDeg = clamp(
    round1(neckFwdSign * Math.max(0, neckTiltMag - 6)),
    NORMATIVE_JOINT_LIMITS.cervicalAndShoulder.neckExtensionMinDeg,
    NORMATIVE_JOINT_LIMITS.cervicalAndShoulder.neckFlexionMaxDeg,
  );

  const trunkDown = { x: -trunkUp.x, y: -trunkUp.y, z: -trunkUp.z };
  const thoraxFwd = vecNorm(vecCross(leftSh, trunkUp));
  const humR = vecSub(elbR, shR);
  const foreR = vecSub(wrR, elbR);
  const humL = vecSub(elbL, shL);
  const foreL = vecSub(wrL, elbL);

  const elevR = angleDeg(humR, trunkDown);
  const fwdR = vecDot(vecNorm(humR), thoraxFwd);
  const outR = -vecDot(vecNorm(humR), leftSh);
  const shoulderRFlexionDeg = clamp(
    round1(fwdR >= -0.08 ? elevR : -elevR * 0.65),
    -45,
    180,
  );
  const shoulderRAbductionDeg = clamp(
    round1(Math.max(0, (Math.asin(clamp(outR, -1, 1)) * 180) / Math.PI)),
    0,
    135,
  );

  const elevL = angleDeg(humL, trunkDown);
  const fwdL = vecDot(vecNorm(humL), thoraxFwd);
  const outL = vecDot(vecNorm(humL), leftSh);
  const shoulderLFlexionDeg = clamp(
    round1(fwdL >= -0.08 ? elevL : -elevL * 0.65),
    -45,
    180,
  );
  const shoulderLAbductionDeg = clamp(
    round1(Math.max(0, (Math.asin(clamp(outL, -1, 1)) * 180) / Math.PI)),
    0,
    135,
  );

  // Límites normativos edad laboral 20–59 años ((P50+P95)/2): CODO_EXT = 171.5° (8.5° flex), CODO_FLE = 30.5° (149.5° flex)
  const elbowRFlexionDeg = clamp(
    round1(angleDeg(humR, foreR)),
    NORMATIVE_JOINT_LIMITS.elbow.flexionMinDeg,
    NORMATIVE_JOINT_LIMITS.elbow.flexionMaxDeg,
  );
  const elbowLFlexionDeg = clamp(
    round1(angleDeg(humL, foreL)),
    NORMATIVE_JOINT_LIMITS.elbow.flexionMinDeg,
    NORMATIVE_JOINT_LIMITS.elbow.flexionMaxDeg,
  );

  // Muñeca real 3D con signo palmar (+) / dorsal (-), acotada a [-62.0°, +74.0°] (242°..106° Kinovea)
  const computeSignedWristFlex = (
    side: 'R' | 'L',
    foreVec: { x: number; y: number; z: number },
    wrPt: MocapVec3,
    pinkyPt: MocapVec3 | undefined,
    indexPt: MocapVec3 | undefined,
  ): number => {
    if (!pinkyPt || !indexPt || Math.min(wrPt.visibility, pinkyPt.visibility, indexPt.visibility) < 0.34) {
      return 0;
    }
    const fDir = vecNorm(foreVec);
    const pVec = vecSub(pinkyPt, wrPt);
    const iVec = vecSub(indexPt, wrPt);
    const handMid = vecMid(pinkyPt, indexPt);
    const hDir = vecNorm(vecSub(handMid, wrPt));
    const magDeg = angleDeg(fDir, hDir);
    if (magDeg < 1.5) return 0;
    const rawPalmNormal = side === 'R' ? vecCross(iVec, pVec) : vecCross(pVec, iVec);
    const nLen = vecLen(rawPalmNormal);
    const normPalm = nLen > 1e-4 ? vecNorm(rawPalmNormal) : { x: 0, y: 1, z: 0 };
    const sign = nLen > 1e-4 ? (vecDot(hDir, normPalm) >= 0 ? 1 : -1) : 1;
    return clamp(
      round1(sign * magDeg),
      NORMATIVE_JOINT_LIMITS.wrist.dorsalExtensionMinDeg,
      NORMATIVE_JOINT_LIMITS.wrist.palmarFlexionMaxDeg,
    );
  };

  const wristRFlexionDeg = computeSignedWristFlex('R', foreR, wrR, world3D[18], world3D[20]);
  const wristLFlexionDeg = computeSignedWristFlex('L', foreL, wrL, world3D[17], world3D[19]);

  const thighR = vecSub(kneeR, hipR);
  const shankR = vecSub(ankR, kneeR);
  const thighL = vecSub(kneeL, hipL);
  const shankL = vecSub(ankL, kneeL);

  const kneeRFlexionDeg = clamp(
    round1(angleDeg(thighR, shankR)),
    NORMATIVE_JOINT_LIMITS.knee.flexionMinDeg,
    NORMATIVE_JOINT_LIMITS.knee.flexionMaxDeg,
  );
  const kneeLFlexionDeg = clamp(
    round1(angleDeg(thighL, shankL)),
    NORMATIVE_JOINT_LIMITS.knee.flexionMinDeg,
    NORMATIVE_JOINT_LIMITS.knee.flexionMaxDeg,
  );
  const hipRFlexionDeg = clamp(
    round1(angleDeg(thighR, downY)),
    NORMATIVE_JOINT_LIMITS.hip.extensionMaxDeg,
    NORMATIVE_JOINT_LIMITS.hip.flexionMaxDeg,
  );
  const hipLFlexionDeg = clamp(
    round1(angleDeg(thighL, downY)),
    NORMATIVE_JOINT_LIMITS.hip.extensionMaxDeg,
    NORMATIVE_JOINT_LIMITS.hip.flexionMaxDeg,
  );

  const stanceMode: NonNullable<PosturePose3D['stanceMode']> =
    Math.max(kneeRFlexionDeg, kneeLFlexionDeg) >= 72
      ? 'squatting'
      : Math.abs(ankR.y - ankL.y) > 0.14
        ? 'one_leg'
        : 'standing';

  return clampPoseToNormativeWorkAgeLimits(
    makeNeutralPose({
      trunkFlexionDeg,
      trunkLateralDeg,
      trunkTwistDeg,
      neckFlexionDeg,
      shoulderRFlexionDeg,
      shoulderRAbductionDeg,
      shoulderLFlexionDeg,
      shoulderLAbductionDeg,
      elbowRFlexionDeg,
      elbowLFlexionDeg,
      wristRFlexionDeg,
      wristLFlexionDeg,
      hipRFlexionDeg,
      kneeRFlexionDeg,
      ankleRDorsiflexionDeg: clamp(
        round1(kneeRFlexionDeg - hipRFlexionDeg),
        NORMATIVE_JOINT_LIMITS.ankle.plantarflexionMinDeg,
        NORMATIVE_JOINT_LIMITS.ankle.dorsiflexionMaxDeg,
      ),
      hipLFlexionDeg,
      kneeLFlexionDeg,
      ankleLDorsiflexionDeg: clamp(
        round1(kneeLFlexionDeg - hipLFlexionDeg),
        NORMATIVE_JOINT_LIMITS.ankle.plantarflexionMinDeg,
        NORMATIVE_JOINT_LIMITS.ankle.dorsiflexionMaxDeg,
      ),
      rootYawDeg,
      rootOffsetX: round1(rootTranslation.x * 100) / 100,
      rootOffsetZ: round1(rootTranslation.z * 100) / 100,
      stanceMode,
    }),
  );
}

/**
 * Repara únicamente micro-huecos breves (< 0.85 s) de baja confianza interpolando respecto a la raíz
 * articular padre, dejando las oclusiones prolongadas de perfil con su visibilidad real baja para que
 * `enforceAnatomicalLimitsAndLegCoherence` guíe el brazo oculto en el sistema anatómico del tórax.
 */
function repairSevereOcclusionsTemporal(
  rawWorldSeq: MocapVec3[][],
  times: number[],
  minValidVis = 0.24,
): MocapVec3[][] {
  const nFrames = rawWorldSeq.length;
  if (nFrames <= 2) return rawWorldSeq;

  const repaired = rawWorldSeq.map((f) => f.map((p) => ({ ...p })));
  const parentAnchorOf = (lmIdx: number): number => {
    if (lmIdx === 13 || lmIdx === 15 || lmIdx === 17 || lmIdx === 19 || lmIdx === 21) return 11;
    if (lmIdx === 14 || lmIdx === 16 || lmIdx === 18 || lmIdx === 20 || lmIdx === 22) return 12;
    if (lmIdx === 25 || lmIdx === 27 || lmIdx === 29 || lmIdx === 31) return 23;
    if (lmIdx === 26 || lmIdx === 28 || lmIdx === 30 || lmIdx === 32) return 24;
    return -1;
  };

  for (let lmIdx = 11; lmIdx < 33; lmIdx++) {
    const anchorIdx = parentAnchorOf(lmIdx);
    let i = 0;
    while (i < nFrames) {
      if (repaired[i][lmIdx].visibility < minValidVis) {
        const gapStart = i;
        while (i < nFrames && repaired[i][lmIdx].visibility < minValidVis) {
          i++;
        }
        const gapEnd = i - 1;
        const prevValidIdx = gapStart > 0 ? gapStart - 1 : -1;
        const nextValidIdx = i < nFrames ? i : -1;
        const gapDurSec =
          prevValidIdx >= 0 && nextValidIdx >= 0
            ? (times[nextValidIdx] ?? 0) - (times[prevValidIdx] ?? 0)
            : 999;

        // Solo interpolar huecos breves (<= 0.85 s) para no arrastrar brazos a través del pecho durante giros largos
        if (prevValidIdx >= 0 && nextValidIdx >= 0 && gapDurSec <= 0.85) {
          for (let k = gapStart; k <= gapEnd; k++) {
            const tSpan = Math.max(1e-3, times[nextValidIdx] - times[prevValidIdx]);
            const alpha = clamp((times[k] - times[prevValidIdx]) / tSpan, 0, 1);
            if (anchorIdx >= 0 && anchorIdx !== lmIdx) {
              const relA = vecSub(repaired[prevValidIdx][lmIdx], repaired[prevValidIdx][anchorIdx]);
              const relB = vecSub(repaired[nextValidIdx][lmIdx], repaired[nextValidIdx][anchorIdx]);
              const curAnc = repaired[k][anchorIdx];
              repaired[k][lmIdx] = {
                x: curAnc.x + relA.x + (relB.x - relA.x) * alpha,
                y: curAnc.y + relA.y + (relB.y - relA.y) * alpha,
                z: curAnc.z + relA.z + (relB.z - relA.z) * alpha,
                visibility: repaired[k][lmIdx].visibility,
              };
            } else {
              const a = repaired[prevValidIdx][lmIdx];
              const b = repaired[nextValidIdx][lmIdx];
              repaired[k][lmIdx] = {
                x: a.x + (b.x - a.x) * alpha,
                y: a.y + (b.y - a.y) * alpha,
                z: a.z + (b.z - a.z) * alpha,
                visibility: repaired[k][lmIdx].visibility,
              };
            }
          }
        }
      } else {
        i++;
      }
    }
  }

  return repaired;
}

/**
 * Espeja en coordenadas 3D locales del tórax un brazo oculto a partir del brazo visible.
 */
function applyArmMirrorInThoraxSpace(
  world3D: MocapVec3[],
  direction: 'left_from_right' | 'right_from_left',
  weight: number,
): MocapVec3[] {
  const w = clamp(weight, 0, 1);
  if (w <= 0.001) return world3D;

  const out = world3D.map((p) => ({ ...p }));
  const shL = out[11];
  const shR = out[12];
  const hipL = out[23];
  const hipR = out[24];
  const midSh = vecMid(shL, shR);
  const midHip = vecMid(hipL, hipR);

  const upAxis = vecNorm(vecSub(midSh, midHip));
  const rawLeft = vecNorm(vecSub(shL, shR));
  const fwdAxis = vecNorm(vecCross(rawLeft, upAxis));
  const leftAxis = vecNorm(vecCross(upAxis, fwdAxis));

  const mirrorRelVec = (v: { x: number; y: number; z: number }) => {
    // Reflejar únicamente la componente a lo largo de leftAxis (plano sagital medio del tronco)
    const compLeft = vecDot(v, leftAxis);
    return {
      x: v.x - 2 * compLeft * leftAxis.x,
      y: v.y - 2 * compLeft * leftAxis.y,
      z: v.z - 2 * compLeft * leftAxis.z,
    };
  };

  if (direction === 'left_from_right') {
    const humR = vecSub(out[14], out[12]);
    const foreR = vecSub(out[16], out[14]);
    const mHumL = mirrorRelVec(humR);
    const mForeL = mirrorRelVec(foreR);

    const targetElbL = {
      x: shL.x + mHumL.x,
      y: shL.y + mHumL.y,
      z: shL.z + mHumL.z,
    };
    const targetWrL = {
      x: targetElbL.x + mForeL.x,
      y: targetElbL.y + mForeL.y,
      z: targetElbL.z + mForeL.z,
    };

    out[13] = {
      x: out[13].x + (targetElbL.x - out[13].x) * w,
      y: out[13].y + (targetElbL.y - out[13].y) * w,
      z: out[13].z + (targetElbL.z - out[13].z) * w,
      visibility: Math.max(out[13].visibility, 0.72 * w),
    };
    out[15] = {
      x: out[15].x + (targetWrL.x - out[15].x) * w,
      y: out[15].y + (targetWrL.y - out[15].y) * w,
      z: out[15].z + (targetWrL.z - out[15].z) * w,
      visibility: Math.max(out[15].visibility, 0.72 * w),
    };
    // Espejar también los nudillos/mano (17=meñique, 19=índice, 21=pulgar) respecto a la muñeca para evitar torsión errática
    const handPairsL: Array<[number, number]> = [
      [17, 18],
      [19, 20],
      [21, 22],
    ];
    for (const [lIdx, rIdx] of handPairsL) {
      if (out[lIdx] && out[rIdx]) {
        const mHand = mirrorRelVec(vecSub(out[rIdx], world3D[16]));
        const targetHandL = {
          x: out[15].x + mHand.x,
          y: out[15].y + mHand.y,
          z: out[15].z + mHand.z,
        };
        out[lIdx] = {
          x: out[lIdx].x + (targetHandL.x - out[lIdx].x) * w,
          y: out[lIdx].y + (targetHandL.y - out[lIdx].y) * w,
          z: out[lIdx].z + (targetHandL.z - out[lIdx].z) * w,
          visibility: Math.max(out[lIdx].visibility, 0.65 * w),
        };
      }
    }
  } else {
    const humL = vecSub(out[13], out[11]);
    const foreL = vecSub(out[15], out[13]);
    const mHumR = mirrorRelVec(humL);
    const mForeR = mirrorRelVec(foreL);

    const targetElbR = {
      x: shR.x + mHumR.x,
      y: shR.y + mHumR.y,
      z: shR.z + mHumR.z,
    };
    const targetWrR = {
      x: targetElbR.x + mForeR.x,
      y: targetElbR.y + mForeR.y,
      z: targetElbR.z + mForeR.z,
    };

    out[14] = {
      x: out[14].x + (targetElbR.x - out[14].x) * w,
      y: out[14].y + (targetElbR.y - out[14].y) * w,
      z: out[14].z + (targetElbR.z - out[14].z) * w,
      visibility: Math.max(out[14].visibility, 0.72 * w),
    };
    out[16] = {
      x: out[16].x + (targetWrR.x - out[16].x) * w,
      y: out[16].y + (targetWrR.y - out[16].y) * w,
      z: out[16].z + (targetWrR.z - out[16].z) * w,
      visibility: Math.max(out[16].visibility, 0.72 * w),
    };
    const handPairsR: Array<[number, number]> = [
      [18, 17],
      [20, 19],
      [22, 21],
    ];
    for (const [rIdx, lIdx] of handPairsR) {
      if (out[rIdx] && out[lIdx]) {
        const mHand = mirrorRelVec(vecSub(out[lIdx], world3D[15]));
        const targetHandR = {
          x: out[16].x + mHand.x,
          y: out[16].y + mHand.y,
          z: out[16].z + mHand.z,
        };
        out[rIdx] = {
          x: out[rIdx].x + (targetHandR.x - out[rIdx].x) * w,
          y: out[rIdx].y + (targetHandR.y - out[rIdx].y) * w,
          z: out[rIdx].z + (targetHandR.z - out[rIdx].z) * w,
          visibility: Math.max(out[rIdx].visibility, 0.65 * w),
        };
      }
    }
  }

  return out;
}

function rotatePointAroundAxis(
  pt: MocapVec3,
  origin: { x: number; y: number; z: number },
  axisUnit: { x: number; y: number; z: number },
  angleRad: number,
): MocapVec3 {
  if (Math.abs(angleRad) < 1e-4) return pt;
  const rx = pt.x - origin.x;
  const ry = pt.y - origin.y;
  const rz = pt.z - origin.z;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const dot = rx * axisUnit.x + ry * axisUnit.y + rz * axisUnit.z;
  const cx = axisUnit.y * rz - axisUnit.z * ry;
  const cy = axisUnit.z * rx - axisUnit.x * rz;
  const cz = axisUnit.x * ry - axisUnit.y * rx;
  return {
    x: origin.x + rx * cosA + cx * sinA + axisUnit.x * dot * (1 - cosA),
    y: origin.y + ry * cosA + cy * sinA + axisUnit.y * dot * (1 - cosA),
    z: origin.z + rz * cosA + cz * sinA + axisUnit.z * dot * (1 - cosA),
    visibility: pt.visibility,
  };
}

/**
 * Aplica los pines híbridos de corrección asistida (Opción C) con ventana cosenoidal suave
 * directamente sobre la nube articular 3D antes del retargeting de cuaterniones.
 */
export function applyHybridCorrectionPinsToWorld3D(
  baseWorld3D: MocapVec3[],
  tSec: number,
  pins: MocapCorrectionPin[],
  autoAssistSevereArmOcclusion = false,
): MocapVec3[] {
  let pts = baseWorld3D.map((p) => ({ ...p }));

  // Auto-asistencia opcional solo cuando un brazo tiene oclusión total (< 0.12) y el usuario la habilitó explícitamente
  if (autoAssistSevereArmOcclusion) {
    const confR = Math.min(pts[14]?.visibility ?? 0, pts[16]?.visibility ?? 0);
    const confL = Math.min(pts[13]?.visibility ?? 0, pts[15]?.visibility ?? 0);
    if (confL < 0.12 && confR > 0.78) {
      const autoW = clamp((0.12 - confL) / 0.10, 0.2, 0.65);
      pts = applyArmMirrorInThoraxSpace(pts, 'left_from_right', autoW);
    } else if (confR < 0.12 && confL > 0.78) {
      const autoW = clamp((0.12 - confR) / 0.10, 0.2, 0.65);
      pts = applyArmMirrorInThoraxSpace(pts, 'right_from_left', autoW);
    }
  }

  if (!pins || pins.length === 0) return pts;

  let accTrunkPitch = 0;
  let accRootYaw = 0;
  let accShR = 0;
  let accElbR = 0;
  let accShL = 0;
  let accElbL = 0;
  let accKnee = 0;
  let mirrorLeftW = 0;
  let mirrorRightW = 0;

  for (const pin of pins) {
    const r = Math.max(0.15, pin.radiusSec);
    const dist = Math.abs(tSec - pin.timeSec);
    if (dist >= r) continue;
    // Campana de Hann / coseno elevado C1-continua (1.0 en tSec, 0.0 en bordes)
    const w = 0.5 * (1 + Math.cos((Math.PI * dist) / r));
    accTrunkPitch += pin.trunkPitchOffsetDeg * w;
    accRootYaw += pin.rootYawOffsetDeg * w;
    accShR += pin.shoulderROffsetDeg * w;
    accElbR += pin.elbowROffsetDeg * w;
    accShL += pin.shoulderLOffsetDeg * w;
    accElbL += pin.elbowLOffsetDeg * w;
    accKnee += pin.kneeOffsetDeg * w;
    if (pin.mirrorArm === 'left_from_right') mirrorLeftW = Math.max(mirrorLeftW, w);
    if (pin.mirrorArm === 'right_from_left') mirrorRightW = Math.max(mirrorRightW, w);
  }

  if (mirrorLeftW > 0.01) {
    pts = applyArmMirrorInThoraxSpace(pts, 'left_from_right', mirrorLeftW);
  } else if (mirrorRightW > 0.01) {
    pts = applyArmMirrorInThoraxSpace(pts, 'right_from_left', mirrorRightW);
  }

  const deg2rad = Math.PI / 180;
  const midHip = vecMid(pts[23], pts[24]);
  const leftAxis = vecNorm(vecSub(pts[11], pts[12]));

  // 1. Inclinación adicional de tronco alrededor del eje coxofemoral transversal
  if (Math.abs(accTrunkPitch) > 0.1) {
    const rad = accTrunkPitch * deg2rad;
    const upperIndices = [0, 7, 8, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
    for (const idx of upperIndices) {
      pts[idx] = rotatePointAroundAxis(pts[idx], midHip, leftAxis, rad);
    }
  }

  // 2. Corrección de hombro y codo derecho
  if (Math.abs(accShR) > 0.1) {
    const rad = accShR * deg2rad;
    const shR = pts[12];
    for (const idx of [14, 16, 18, 20, 22]) {
      pts[idx] = rotatePointAroundAxis(pts[idx], shR, leftAxis, rad);
    }
  }
  if (Math.abs(accElbR) > 0.1) {
    const rad = accElbR * deg2rad;
    const elbR = pts[14];
    for (const idx of [16, 18, 20, 22]) {
      pts[idx] = rotatePointAroundAxis(pts[idx], elbR, leftAxis, rad);
    }
  }

  // 3. Corrección de hombro y codo izquierdo
  if (Math.abs(accShL) > 0.1) {
    const rad = accShL * deg2rad;
    const shL = pts[11];
    for (const idx of [13, 15, 17, 19, 21]) {
      pts[idx] = rotatePointAroundAxis(pts[idx], shL, leftAxis, rad);
    }
  }
  if (Math.abs(accElbL) > 0.1) {
    const rad = accElbL * deg2rad;
    const elbL = pts[13];
    for (const idx of [15, 17, 19, 21]) {
      pts[idx] = rotatePointAroundAxis(pts[idx], elbL, leftAxis, rad);
    }
  }

  // 4. Corrección de flexión de rodillas (baja pelvis + tronco y flexiona tibias)
  if (Math.abs(accKnee) > 0.1) {
    const rad = -accKnee * 0.5 * deg2rad;
    for (const idx of [28, 30, 32]) {
      pts[idx] = rotatePointAroundAxis(pts[idx], pts[26], leftAxis, rad);
    }
    for (const idx of [27, 29, 31]) {
      pts[idx] = rotatePointAroundAxis(pts[idx], pts[25], leftAxis, rad);
    }
  }

  // 5. Giro global (Yaw) alrededor de la vertical pasando por pelvis
  if (Math.abs(accRootYaw) > 0.1) {
    const upY = { x: 0, y: 1, z: 0 };
    const rad = accRootYaw * deg2rad;
    for (let idx = 0; idx < 33; idx++) {
      pts[idx] = rotatePointAroundAxis(pts[idx], midHip, upY, rad);
    }
  }

  return pts;
}

/**
 * Extrae la secuencia cinemática 3D real a 24 fps con MediaPipe Pose Heavy,
 * reparación de oclusiones, fusión 2D-3D de perspectiva, Root Motion métrico
 * y filtrado adaptativo One-Euro (1€ Filter).
 */
/**
 * Extrae instantáneamente la pose 3D estabilizada de un único fotograma (por defecto t = 0 s)
 * para que el Avatar 3D adopte de inmediato la postura real del primer fotograma mientras se completa el escaneo.
 */
function estimateSingleFrameStandingScale(
  wPts: MocapVec3[],
  nPts: MocapVec3[],
  videoAspect: number,
  limbs: CalibratedLimbLengths,
): number {
  const candidates: number[] = [];
  const fullLeg = limbs.thigh + limbs.shank;
  for (const [hipIdx, ankIdx] of [
    [23, 27],
    [24, 28],
  ] as const) {
    if (Math.min(nPts[hipIdx]?.visibility ?? 0, nPts[ankIdx]?.visibility ?? 0) >= 0.42) {
      const d2 = Math.hypot(
        (nPts[ankIdx].x - nPts[hipIdx].x) * videoAspect,
        nPts[ankIdx].y - nPts[hipIdx].y,
      );
      if (d2 > 0.08 && fullLeg > 0.45) {
        candidates.push(d2 / (fullLeg * 0.96));
      }
    }
  }
  const pairs: Array<[number, number, number]> = [
    [23, 25, limbs.thigh],
    [24, 26, limbs.thigh],
    [25, 27, limbs.shank],
    [26, 28, limbs.shank],
    [11, 23, 0.48],
    [12, 24, 0.48],
  ];
  for (const [a, b, ref3D] of pairs) {
    if (Math.min(nPts[a]?.visibility ?? 0, nPts[b]?.visibility ?? 0) < 0.42) continue;
    const d2 = Math.hypot((nPts[b].x - nPts[a].x) * videoAspect, nPts[b].y - nPts[a].y);
    const d3 = Math.max(
      ref3D * 0.85,
      Math.hypot(wPts[b].x - wPts[a].x, wPts[b].y - wPts[a].y, wPts[b].z - wPts[a].z),
    );
    if (d2 > 0.03 && d3 > 0.12) {
      candidates.push(d2 / d3);
    }
  }
  return clamp(percentileSorted(candidates, 0.78, 0.42), 0.18, 1.65);
}

interface PlausiblePoseSelection {
  world: MocapVec3[];
  norm: MocapVec3[];
  center: { cx: number; cy: number };
  score: number;
}

function selectBestPlausibleHumanPose(
  res: {
    landmarks?: Array<Array<{ x: number; y: number; z: number; visibility?: number }>>;
    worldLandmarks?: Array<Array<{ x: number; y: number; z: number; visibility?: number }>>;
  } | null,
  videoAspect: number,
  prevCenter: { cx: number; cy: number } | null,
  cropMap?: { srcX: number; srcY: number; srcW: number; srcH: number; vw: number; vh: number; cropScale: number },
): PlausiblePoseSelection | null {
  if (!res?.landmarks?.length || !res?.worldLandmarks?.length) return null;
  const count = Math.min(res.landmarks.length, res.worldLandmarks.length);
  let best: PlausiblePoseSelection | null = null;

  for (let k = 0; k < count; k++) {
    const rawN = res.landmarks[k];
    const rawW = res.worldLandmarks[k];
    if (!rawN || rawN.length < 29 || !rawW || rawW.length < 29) continue;

    const mappedNorm: MocapVec3[] = cropMap
      ? rawN.map((p) => ({
          x: (cropMap.srcX + p.x * cropMap.srcW) / cropMap.vw,
          y: (cropMap.srcY + p.y * cropMap.srcH) / cropMap.vh,
          z: p.z * cropMap.cropScale,
          visibility: clamp(p.visibility ?? 0.85, 0, 1),
        }))
      : rawN.map((p) => ({
          x: p.x,
          y: p.y,
          z: p.z,
          visibility: clamp(p.visibility ?? 0.85, 0, 1),
        }));

    const shX = (mappedNorm[11].x + mappedNorm[12].x) * 0.5;
    const shY = (mappedNorm[11].y + mappedNorm[12].y) * 0.5;
    const hipX = (mappedNorm[23].x + mappedNorm[24].x) * 0.5;
    const hipY = (mappedNorm[23].y + mappedNorm[24].y) * 0.5;
    const ankY = Math.max(mappedNorm[27]?.y ?? hipY, mappedNorm[28]?.y ?? hipY);
    const headY = Math.min(mappedNorm[0]?.y ?? shY, shY);

    // Descartar detecciones fuera de cuadro o escombros/estructuras invertidas (hombros debajo de caderas)
    if (shX < 0.03 || shX > 0.97 || shY < 0.03 || shY > 0.85 || hipY < 0.12 || hipY > 0.98) {
      continue;
    }
    if (shY > hipY + 0.035) {
      continue;
    }

    const coreVis =
      (mappedNorm[11].visibility +
        mappedNorm[12].visibility +
        mappedNorm[23].visibility +
        mappedNorm[24].visibility) *
      0.25;
    if (coreVis < 0.34) continue;

    const trunkSpan2D = Math.hypot((shX - hipX) * videoAspect, shY - hipY);
    if (trunkSpan2D < 0.042) continue;

    // Rechazar falsos positivos donde la cabeza/nariz dista desproporcionadamente de los hombros (esqueleto colapsado en estantería)
    if (mappedNorm[0]) {
      const headToShSpan2D = Math.hypot(
        (mappedNorm[0].x - shX) * videoAspect,
        shY - mappedNorm[0].y,
      );
      if (headToShSpan2D > Math.max(0.145, trunkSpan2D * 1.72)) {
        continue;
      }
    }

    // Rechazar falsos positivos diminutos colgados en la parte alta del cuadro (ej. jaula de carretilla ankY=0.27)
    if (ankY < 0.40 && hipY < 0.34) continue;

    const fullSpanY = ankY - headY;
    const legSpanY = ankY - hipY;
    const isWaistUpBottomCrop = hipY >= 0.72 || ankY >= 0.94;
    if (!isWaistUpBottomCrop && (fullSpanY < 0.18 || legSpanY < 0.085)) {
      continue;
    }

    // Rechazar postes/vigas verticales 1D sin volumen corporal horizontal (ej. montante metálico de estantería)
    const xsBody = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
      .map((idx) => mappedNorm[idx]?.x)
      .filter((v): v is number => typeof v === 'number');
    const bodySpanX = xsBody.length >= 6 ? Math.max(...xsBody) - Math.min(...xsBody) : 0.1;
    if (bodySpanX < 0.033 && fullSpanY > 0.24) {
      continue;
    }

    let score =
      coreVis * 2.0 +
      Math.min(0.75, Math.max(0, fullSpanY)) * 2.6 +
      Math.min(0.32, trunkSpan2D) * 1.5;

    if (hipX < 0.08 || hipX > 0.92) score -= 1.2;

    const bodyMidY = clamp((headY + Math.min(0.95, ankY)) * 0.5, 0.25, 0.78);
    if (prevCenter) {
      const dist = Math.hypot(hipX - prevCenter.cx, bodyMidY - prevCenter.cy);
      if (dist > 0.38) score -= dist * 3.2;
      else score += (0.38 - dist) * 2.2;
    }

    if (!best || score > best.score) {
      const clampedNorm = mappedNorm.map((p) => ({
        ...p,
        x: clamp(p.x, 0, 1),
        y: clamp(p.y, 0, 1),
      }));
      const convertedWorld: MocapVec3[] = rawW.map((p) => ({
        x: p.x,
        y: -p.y,
        z: -p.z,
        visibility: clamp(p.visibility ?? 0.85, 0, 1),
      }));
      best = {
        world: convertedWorld,
        norm: clampedNorm,
        center: { cx: clamp(hipX, 0.14, 0.86), cy: clamp(bodyMidY, 0.34, 0.66) },
        score,
      };
    }
  }

  return best;
}

export async function extractSingleMocapFrame(
  videoElement: HTMLVideoElement,
  timeSec = 0,
): Promise<MocapFrameSample | null> {
  const activeLoaded = await initHeavyPoseMoCap(true);
  if (!activeLoaded) return null;

  await seekVideoExact(videoElement, timeSec);
  const vw = videoElement.videoWidth || 1280;
  const vh = videoElement.videoHeight || 720;
  const videoAspect = vw / Math.max(1, vh);
  const maxDim = isMobileViewportDevice() ? 384 : 480;
  const scale = Math.min(1, maxDim / Math.max(vw, vh, 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(64, Math.round(vw * scale));
  canvas.height = Math.max(64, Math.round(vh * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: false });

  let detectInput: HTMLCanvasElement | HTMLVideoElement = videoElement;
  if (ctx && videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
    try {
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      detectInput = canvas;
    } catch {
      detectInput = videoElement;
    }
  }

  try {
    const res = activeLoaded.landmarker.detect(detectInput);
    let picked = selectBestPlausibleHumanPose(res, videoAspect, null);
    if (!picked && ctx && vw > 0 && vh > 0) {
      for (const [cx, cy, cs] of [
        [0.50, 0.52, 0.70],
        [0.36, 0.54, 0.70],
        [0.64, 0.52, 0.70],
      ] as const) {
        const srcW = vw * cs;
        const srcH = vh * cs;
        const srcX = clamp(cx * vw - srcW * 0.5, 0, Math.max(0, vw - srcW));
        const srcY = clamp(cy * vh - srcH * 0.5, 0, Math.max(0, vh - srcH));
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(videoElement, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);
        const roiRes = activeLoaded.landmarker.detect(canvas);
        picked = selectBestPlausibleHumanPose(roiRes, videoAspect, null, {
          srcX,
          srcY,
          srcW,
          srcH,
          vw,
          vh,
          cropScale: cs,
        });
        if (picked) break;
      }
    }
    if (!picked) return null;

    const rawW = picked.world;
    const rawN = picked.norm;
    const normCopy = [rawN.map((p) => ({ ...p }))];
    const yawFixedW = stabilizeTemporalHeadingSequence([rawW], normCopy, [timeSec], videoAspect)[0];
    const fixedN = normCopy[0];
    const limbs = calibrateSubjectLimbLengths([yawFixedW]);
    const scaleEst = estimateSingleFrameStandingScale(yawFixedW, fixedN, videoAspect, limbs);
    const aligned = alignWorldChainToScreen2D(yawFixedW, fixedN, videoAspect, limbs, scaleEst);
    const stabilized = enforceAnatomicalLimitsAndLegCoherence(
      aligned,
      yawFixedW,
      fixedN,
      videoAspect,
      limbs,
      scaleEst,
    );
    const rootTranslation = { x: 0, y: 0, z: 0 };
    const rightArmConfidence = ((yawFixedW[14]?.visibility ?? 0) + (yawFixedW[16]?.visibility ?? 0)) * 0.5;
    const leftArmConfidence = ((yawFixedW[13]?.visibility ?? 0) + (yawFixedW[15]?.visibility ?? 0)) * 0.5;
    return {
      timeSec: Math.round(timeSec * 1000) / 1000,
      world3D: stabilized,
      norm2D: fixedN,
      rawNorm2D: fixedN,
      rootTranslation,
      rightArmConfidence,
      leftArmConfidence,
      hasOcclusion: Math.min(rightArmConfidence, leftArmConfidence) < 0.45,
      ergonomicPose: computeErgonomicPoseFromWorld3D(stabilized, rootTranslation),
    };
  } catch {
    return null;
  }
}

export interface MocapExtractionOptions {
  targetFps?: number;
  /** Tope explícito de fotogramas a evaluar en todo el vídeo (ej. 30, 60, 100) */
  maxTotalSamples?: number;
  /** Usa modelo FULL acelerado (~8 ms/fotograma) en lugar de Heavy (30 MB). Por defecto `true`. */
  preferFastModel?: boolean;
  abortSignal?: { aborted: boolean };
  onProgress?: (pct: number, phaseText?: string) => void;
  onFirstFrameSample?: (sample: MocapFrameSample) => void;
  onPartialTimeline?: (partial: MocapTimelineResult) => void;
}

/**
 * Rastreador incremental en tiempo real (0 s de pre-escaneo) para cuando el usuario activa
 * el tilde "Rastreo en Vivo al Reproducir". Evalúa directamente el <video> en curso con retargeting completo.
 */
export class LiveMocapStreamTracker {
  private readonly worldBank = new Landmark33OneEuroBank(1.18, 0.65, 0.80, 0.28);
  private readonly normBank = new Landmark33OneEuroBank(1.38, 0.68, 0.95, 0.30);
  private readonly rootXFilter = new OneEuroScalarFilter(0.95, 0.30, 1.0);
  private readonly frameCanvas: HTMLCanvasElement;
  private readonly frameCtx: CanvasRenderingContext2D | null;
  private lastSample: MocapFrameSample | null = null;
  private lastDetectVideoTime = -1;
  private runningScaleEst: number | null = null;
  private refHip2DX: number | null = null;
  private lastValidRootX = 0;

  constructor() {
    this.frameCanvas = document.createElement('canvas');
    this.frameCanvas.width = 512;
    this.frameCanvas.height = 384;
    this.frameCtx = this.frameCanvas.getContext('2d', { willReadFrequently: false });
  }

  reset(): void {
    this.lastSample = null;
    this.lastDetectVideoTime = -1;
    this.runningScaleEst = null;
    this.refHip2DX = null;
    this.lastValidRootX = 0;
  }

  detectCurrentPlayingFrame(videoElement: HTMLVideoElement): MocapFrameSample | null {
    if (!heavyLandmarker || videoElement.videoWidth <= 0 || videoElement.readyState < 2) {
      return this.lastSample;
    }
    const tSec = videoElement.currentTime || 0;
    if (this.lastSample && Math.abs(tSec - this.lastDetectVideoTime) < 0.04) {
      return this.lastSample;
    }
    this.lastDetectVideoTime = tSec;

    const vw = videoElement.videoWidth;
    const vh = videoElement.videoHeight || 1;
    const aspect = vw / vh;
    const maxDim = isMobileViewportDevice() ? 480 : 576;
    const scale = Math.min(1, maxDim / Math.max(vw, vh));
    const cw = Math.max(64, Math.round(vw * scale));
    const ch = Math.max(64, Math.round(vh * scale));
    if (this.frameCanvas.width !== cw || this.frameCanvas.height !== ch) {
      this.frameCanvas.width = cw;
      this.frameCanvas.height = ch;
    }

    let detectInput: HTMLCanvasElement | HTMLVideoElement = videoElement;
    if (this.frameCtx) {
      try {
        this.frameCtx.drawImage(videoElement, 0, 0, cw, ch);
        detectInput = this.frameCanvas;
      } catch {
        detectInput = videoElement;
      }
    }

    try {
      const res = heavyLandmarker.detect(detectInput);
      const picked = selectBestPlausibleHumanPose(res, aspect, null);
      if (!picked) {
        return this.lastSample ? { ...this.lastSample, timeSec: tSec } : null;
      }

      const rawW = picked.world;
      const rawN = picked.norm;

      const normSeqSingle = [rawN.map((p) => ({ ...p }))];
      const yawFixedW = stabilizeTemporalHeadingSequence([rawW], normSeqSingle, [tSec], aspect)[0];
      const fixedN = normSeqSingle[0];
      const limbs = calibrateSubjectLimbLengths([yawFixedW]);
      const instScale = estimateSingleFrameStandingScale(yawFixedW, fixedN, aspect, limbs);
      this.runningScaleEst =
        this.runningScaleEst === null
          ? instScale
          : Math.max(this.runningScaleEst * 0.96, this.runningScaleEst * 0.85 + instScale * 0.15);
      const scaleToUse = clamp(this.runningScaleEst, 0.18, 1.65);

      const filtN = this.normBank.filterLandmarks(fixedN, tSec);
      const aligned = alignWorldChainToScreen2D(yawFixedW, filtN, aspect, limbs, scaleToUse);
      const stabilized = enforceAnatomicalLimitsAndLegCoherence(
        aligned,
        yawFixedW,
        filtN,
        aspect,
        limbs,
        scaleToUse,
      );
      const filtW = this.worldBank.filterLandmarks(stabilized, tSec);

      const hipVis = Math.min(fixedN[23]?.visibility ?? 0, fixedN[24]?.visibility ?? 0);
      if (hipVis >= 0.35) {
        const curHipX = (filtN[23].x + filtN[24].x) * 0.5 * aspect;
        if (this.refHip2DX === null) this.refHip2DX = curHipX;
        this.lastValidRootX = clamp((curHipX - this.refHip2DX) / Math.max(0.18, scaleToUse), -1.45, 1.45);
      }
      const rootTranslation = {
        x: this.rootXFilter.filter(this.lastValidRootX, tSec),
        y: 0,
        z: 0,
      };
      const rConf = ((yawFixedW[14]?.visibility ?? 0) + (yawFixedW[16]?.visibility ?? 0)) * 0.5;
      const lConf = ((yawFixedW[13]?.visibility ?? 0) + (yawFixedW[15]?.visibility ?? 0)) * 0.5;

      const sample: MocapFrameSample = {
        timeSec: Math.round(tSec * 1000) / 1000,
        world3D: filtW,
        norm2D: filtN,
        rawNorm2D: fixedN,
        rootTranslation,
        rightArmConfidence: rConf,
        leftArmConfidence: lConf,
        hasOcclusion: Math.min(rConf, lConf) < 0.45,
        ergonomicPose: computeErgonomicPoseFromWorld3D(filtW, rootTranslation),
      };
      this.lastSample = sample;
      return sample;
    } catch {
      return this.lastSample;
    }
  }
}

const SYMMETRIC_LANDMARK_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 4],
  [2, 5],
  [3, 6],
  [7, 8],
  [9, 10],
  [11, 12],
  [13, 14],
  [15, 16],
  [17, 18],
  [19, 20],
  [21, 22],
  [23, 24],
  [25, 26],
  [27, 28],
  [29, 30],
  [31, 32],
];

/**
 * Estabiliza el rumbo axial global (`yaw`) de cuerpo completo, repara cruces de etiquetas Izq/Der
 * en vistas dorsales/de perfil y rota rígidamente los 33 puntos 3D alrededor de `midHip` (+Y) para que
 * tronco, brazos, piernas y cabeza giren al unísono sin retorcer extremidades ni generar hiperextensiones hacia atrás.
 */
function stabilizeTemporalHeadingSequence(
  worldSeq: MocapVec3[][],
  normSeq: MocapVec3[][],
  times: number[],
  videoAspect = 1.333,
): MocapVec3[][] {
  const N = worldSeq.length;
  if (N === 0) return worldSeq;
  const outSeq = worldSeq.map((f) => f.map((p) => ({ ...p })));

  // Calibrar anchura biacromial frontal 2D de referencia (invariante incluso si el vídeo es todo de perfil)
  const observedShWidths: number[] = [];
  const observedTorsoHeights: number[] = [];
  for (let i = 0; i < N; i++) {
    const n = normSeq[i];
    if (!n || n.length < 25) continue;
    observedShWidths.push(Math.abs(n[11].x - n[12].x) * videoAspect);
    const th = (n[23].y + n[24].y) * 0.5 - (n[11].y + n[12].y) * 0.5;
    if (th > 0.08) observedTorsoHeights.push(th);
  }
  const medTorsoH = percentileSorted(observedTorsoHeights, 0.75, 0.21);
  const refFrontalShWidth = clamp(
    Math.max(percentileSorted(observedShWidths, 0.90, 0.12), medTorsoH * 0.58),
    0.10,
    0.28,
  );

  const cueFwdX = new Array<number>(N).fill(0);
  const cueFwdZ = new Array<number>(N).fill(1);
  const cueStrength = new Array<number>(N).fill(0.5);

  for (let i = 0; i < N; i++) {
    const w = outSeq[i];
    const n = normSeq[i];
    if (!w || w.length < 33 || !n || n.length < 33) continue;

    // 1. Pista anteroposterior horizontal en imagen (`obsX`, invariante a intercambios Izq/Der):
    //    Combina inclinación sagital de tronco, nariz vs hombros/orejas, alcance bimanual y progresión podal.
    const midHipX = (n[23].x + n[24].x) * 0.5;
    const midHipY = (n[23].y + n[24].y) * 0.5;
    const midShX = (n[11].x + n[12].x) * 0.5;
    const midShY = (n[11].y + n[12].y) * 0.5;
    const spineX = (midHipX + midShX) * 0.5;

    let antSumX = 0;
    let antWeight = 0;
    let posCueVotes = 0;
    let negCueVotes = 0;

    // 1a) Inclinación horizontal de tronco en 2D: al agacharse, los hombros SIEMPRE están hacia el frente de la cadera
    const trunkDxScr = (midShX - midHipX) * videoAspect;
    const trunkDyScr = Math.max(0.02, midHipY - midShY);
    const trunkLeanRatio = Math.abs(trunkDxScr) / trunkDyScr;
    if (Math.abs(trunkDxScr) > 0.020 && trunkLeanRatio > 0.13) {
      const leanW = clamp((trunkLeanRatio - 0.11) * 3.5, 0.6, 3.0);
      antSumX += Math.sign(trunkDxScr) * Math.min(1, Math.abs(trunkDxScr) * 7.5) * leanW;
      antWeight += leanW;
      if (trunkDxScr > 0) posCueVotes++;
      else negCueVotes++;
    }

    // 1b) Posición de manos respecto al eje espinal (sin diluir con codos pegados al costado en perfil)
    for (const [lmIdx, baseW] of [
      [15, 1.35],
      [16, 1.35],
    ] as const) {
      const vis = n[lmIdx]?.visibility ?? 0;
      if (vis >= 0.32) {
        const dx = (n[lmIdx].x - spineX) * videoAspect;
        if (Math.abs(dx) > 0.025) {
          const wArm = baseW * clamp((vis - 0.26) / 0.42, 0.45, 1.0);
          antSumX += clamp(dx * 8.5, -1, 1) * wArm;
          antWeight += wArm;
          if (dx > 0.030) posCueVotes++;
          else if (dx < -0.030) negCueVotes++;
        }
      }
    }

    // 1c) Nariz respecto al punto medio auricular / escapular (escala anatómica real en perfil: 0.055 => 1.0)
    const noseVis = n[0]?.visibility ?? 0;
    const earMidVis = Math.min(n[7]?.visibility ?? 0, n[8]?.visibility ?? 0);
    if (noseVis >= 0.38) {
      const refHeadX = earMidVis >= 0.45 ? (n[7].x + n[8].x) * 0.5 : midShX;
      const dxHead = (n[0].x - refHeadX) * videoAspect;
      if (Math.abs(dxHead) > 0.013) {
        antSumX += clamp(dxHead * 17.5, -1, 1) * 1.35;
        antWeight += 1.35;
        if (dxHead > 0.018) posCueVotes++;
        else if (dxHead < -0.018) negCueVotes++;
      }
    }

    // 1d) Progresión podal (punta de los pies - talón siempre apunta hacia adelante; 0.055 => 1.0)
    for (const [heelIdx, toeIdx] of [
      [29, 31],
      [30, 32],
    ] as const) {
      const fVis = Math.min(n[heelIdx]?.visibility ?? 0, n[toeIdx]?.visibility ?? 0);
      if (fVis >= 0.38 && n[toeIdx].y < 0.96) {
        const dxFoot = (n[toeIdx].x - n[heelIdx].x) * videoAspect;
        if (Math.abs(dxFoot) > 0.014) {
          const wFoot = 1.05 * clamp((fVis - 0.34) / 0.4, 0.45, 1.0);
          antSumX += clamp(dxFoot * 17.0, -1, 1) * wFoot;
          antWeight += wFoot;
          if (dxFoot > 0.018) posCueVotes++;
          else if (dxFoot < -0.018) negCueVotes++;
        }
      }
    }

    // 1e) Velocidad horizontal de marcha cuando los tobillos se separan dando zancadas
    if (N >= 3) {
      const iPrev = Math.max(0, i - 1);
      const iNext = Math.min(N - 1, i + 1);
      const dtSpan = Math.max(0.05, (times[iNext] ?? 0) - (times[iPrev] ?? 0));
      const hipPrevX = ((normSeq[iPrev][23]?.x ?? midHipX) + (normSeq[iPrev][24]?.x ?? midHipX)) * 0.5;
      const hipNextX = ((normSeq[iNext][23]?.x ?? midHipX) + (normSeq[iNext][24]?.x ?? midHipX)) * 0.5;
      const velX = ((hipNextX - hipPrevX) * videoAspect) / dtSpan;
      const ankStride = Math.abs((n[27]?.x ?? 0) - (n[28]?.x ?? 0)) * videoAspect;
      if (Math.abs(velX) > 0.08 && ankStride > 0.032) {
        const wWalk = clamp((Math.abs(velX) - 0.06) * 4.5, 0.4, 1.5);
        antSumX += Math.sign(velX) * Math.min(1, Math.abs(velX) * 4.2) * wWalk;
        antWeight += wWalk;
      }
    }

    const obsX = antWeight > 0.05 ? clamp(antSumX / antWeight, -1, 1) : 0;
    const isUnanimousProfileCue =
      (posCueVotes >= 2 && negCueVotes === 0) || (negCueVotes >= 2 && posCueVotes === 0);

    // 2. Geometría proyectiva coronal: el acortamiento 2D de hombros/caderas fija |cos(yaw)|,
    //    y `obsX` fija inequívocamente el signo derecho (+X) vs izquierdo (-X) sin giros erróneos de 180°.
    const shDx2D = (n[11].x - n[12].x) * videoAspect;
    const hipDx2D = (n[23].x - n[24].x) * videoAspect;
    const shWidthAbs = Math.abs(shDx2D);
    const hipWidthAbs = Math.abs(hipDx2D);

    const coronalWidthRatio = clamp(
      (shWidthAbs * 0.68 + hipWidthAbs * 1.15 * 0.32) / refFrontalShWidth,
      0,
      1,
    );
    const sinYawFromForeshortening = Math.sqrt(Math.max(0, 1 - coronalWidthRatio * coronalWidthRatio));

    const rawShLeftX = w[11].x - w[12].x;
    const rawShLeftZ = w[11].z - w[12].z;
    let rawFx = -rawShLeftZ;
    let rawFz = rawShLeftX;
    const rawH = Math.hypot(rawFx, rawFz);
    if (rawH > 0.025) {
      rawFx /= rawH;
      rawFz /= rawH;
    } else {
      rawFx = 0;
      rawFz = 1;
    }

    let fx = rawFx;
    let fz = rawFz;

    // Inversión dorsal real cuando TANTO hombros como caderas aparecen con el lado izquierdo a la izquierda de pantalla
    const isTrueDorsal2D = shDx2D < -0.052 && hipDx2D < -0.022;

    if (antWeight >= 0.36 && Math.abs(obsX) >= 0.18) {
      const cueDrivenSin = clamp(
        Math.abs(obsX) * (isUnanimousProfileCue ? 1.48 : 1.22),
        0.28,
        0.985,
      );
      const profileSinMag = clamp(
        isUnanimousProfileCue || Math.abs(obsX) >= 0.45
          ? Math.max(sinYawFromForeshortening, cueDrivenSin)
          : coronalWidthRatio < 0.60
            ? Math.max(sinYawFromForeshortening * 0.92, cueDrivenSin)
            : cueDrivenSin * 0.88,
        0.24,
        0.985,
      );
      const magZ = Math.sqrt(Math.max(0.02, 1 - profileSinMag * profileSinMag));
      const signZ = isTrueDorsal2D ? -1 : 1;
      fx = Math.sign(obsX) * profileSinMag;
      fz = signZ * magZ;
    } else if (shWidthAbs >= 0.055) {
      fz =
        shDx2D >= 0.045
          ? Math.max(0.76, Math.abs(rawFz))
          : isTrueDorsal2D || shDx2D < -0.062
            ? -Math.max(0.72, Math.abs(rawFz))
            : rawFz;
      if (isTrueDorsal2D) {
        const avgDistalX =
          n[13] && n[14] && n[15] && n[16]
            ? (n[13].x + n[14].x + n[15].x + n[16].x) * 0.25
            : midShX;
        const dorsalReachDx = (avgDistalX - midHipX) * videoAspect;
        fx =
          Math.abs(dorsalReachDx) > 0.018
            ? clamp(dorsalReachDx * 12.0, -0.78, 0.78)
            : antWeight > 0.12
              ? obsX * 0.78 + rawFx * 0.22
              : rawFx * 0.45;
      } else {
        fx = antWeight > 0.12 ? obsX * 0.78 + rawFx * 0.22 : rawFx * 0.45;
      }
    }

    const normF = Math.hypot(fx, fz);
    if (normF > 1e-4) {
      cueFwdX[i] = fx / normF;
      cueFwdZ[i] = fz / normF;
    }
    cueStrength[i] = clamp(0.45 + antWeight * 0.28 + shWidthAbs * 1.6, 0.45, 1.20);
  }

  // 3. Suavizado circular bidireccional ligero (1 pasada adelante+atrás) sin aplastar perfiles puros de ±80°
  const smoothX = cueFwdX.slice();
  const smoothZ = cueFwdZ.slice();
  for (let i = 1; i < N; i++) {
    const dt = Math.max(0.02, (times[i] ?? 0) - (times[i - 1] ?? 0));
    const alpha = clamp(dt * 4.8 * clamp(cueStrength[i], 0.45, 1.15), 0.30, 0.84);
    const bx = smoothX[i - 1] * (1 - alpha) + smoothX[i] * alpha;
    const bz = smoothZ[i - 1] * (1 - alpha) + smoothZ[i] * alpha;
    const m = Math.hypot(bx, bz);
    if (m > 1e-4) {
      smoothX[i] = bx / m;
      smoothZ[i] = bz / m;
    }
  }
  for (let i = N - 2; i >= 0; i--) {
    const dt = Math.max(0.02, (times[i + 1] ?? 0) - (times[i] ?? 0));
    const alpha = clamp(dt * 4.8 * clamp(cueStrength[i], 0.45, 1.15), 0.30, 0.84);
    const bx = smoothX[i + 1] * (1 - alpha) + smoothX[i] * alpha;
    const bz = smoothZ[i + 1] * (1 - alpha) + smoothZ[i] * alpha;
    const m = Math.hypot(bx, bz);
    if (m > 1e-4) {
      smoothX[i] = bx / m;
      smoothZ[i] = bz / m;
    }
  }

  const maxTurnRateRadPerSec = (240 * Math.PI) / 180;
  const targetYaws = new Array<number>(N).fill(0);
  let prevYaw: number | null = null;
  for (let i = 0; i < N; i++) {
    let y = Math.atan2(smoothX[i], smoothZ[i]);
    if (prevYaw !== null && i > 0) {
      const dt = Math.max(0.02, (times[i] ?? 0) - (times[i - 1] ?? 0));
      const maxStep = maxTurnRateRadPerSec * dt;
      y = prevYaw + clamp(shortestAngleDiffRad(prevYaw, y), -maxStep, maxStep);
    }
    prevYaw = y;
    targetYaws[i] = y;
  }

  // 4. Reparar cruces de etiquetas Izq/Der en `outSeq` + `normSeq` y rotar RÍGIDAMENTE los 33 puntos alrededor de +Y
  const upAxis = { x: 0, y: 1, z: 0 };
  for (let i = 0; i < N; i++) {
    const w = outSeq[i];
    const n = normSeq[i];
    if (!w || w.length < 33 || !n || n.length < 33) continue;

    const targetYaw = targetYaws[i];
    const expectedLeftX = Math.cos(targetYaw);
    const expectedLeftZ = -Math.sin(targetYaw);

    const sh2DDx = n[11].x - n[12].x;
    const hip2DDx = n[23].x - n[24].x;
    const wLeftX = (w[11].x - w[12].x) * 0.65 + (w[23].x - w[24].x) * 0.35;
    const wLeftZ = (w[11].z - w[12].z) * 0.65 + (w[23].z - w[24].z) * 0.35;

    // Si en vista frontal/dorsal la lateralidad 2D de hombros y caderas está invertida respecto al rumbo estabilizado,
    // intercambiar pares simétricos Izq<->Der tanto en `normSeq` como en `outSeq`.
    const swapIn2D =
      Math.abs(expectedLeftX) > 0.42 &&
      sh2DDx * expectedLeftX < -0.035 &&
      hip2DDx * expectedLeftX < -0.02;
    if (swapIn2D) {
      for (const [lIdx, rIdx] of SYMMETRIC_LANDMARK_PAIRS) {
        const tmpW = w[lIdx];
        w[lIdx] = w[rIdx];
        w[rIdx] = tmpW;
        const tmpN = n[lIdx];
        n[lIdx] = n[rIdx];
        n[rIdx] = tmpN;
      }
    }

    // Orientar las cinturas escapular, pélvica y cefálica según `targetYaw` SIN rotar los vectores relativos
    // de brazos y piernas fuera del plano de cámara (evita convertir alcance horizontal X en profundidad espuria -Z).
    if (w[7] && w[8]) {
      const midEar = vecMid(w[7], w[8]);
      const halfEar = clamp(vecLen(vecSub(w[7], w[8])) * 0.5, 0.055, 0.085);
      const earTiltY = clamp((w[7].y - w[8].y) * 0.5, -0.03, 0.03);
      w[7] = {
        x: midEar.x + expectedLeftX * halfEar,
        y: midEar.y + earTiltY,
        z: midEar.z + expectedLeftZ * halfEar,
        visibility: w[7].visibility,
      };
      w[8] = {
        x: midEar.x - expectedLeftX * halfEar,
        y: midEar.y - earTiltY,
        z: midEar.z - expectedLeftZ * halfEar,
        visibility: w[8].visibility,
      };
    }

    // Regularizar envergadura biacromial y pélvica trasladando solidariamente sus cadenas hijas (cero torsión espuria)
    const shL = w[11];
    const shR = w[12];
    const hipL = w[23];
    const hipR = w[24];
    const midSh = vecMid(shL, shR);
    const midHipNow = vecMid(hipL, hipR);
    const halfShSpan = clamp(vecLen(vecSub(shL, shR)) * 0.5, 0.16, 0.205);
    const halfHipSpan = clamp(vecLen(vecSub(hipL, hipR)) * 0.5, 0.095, 0.125);
    const shTiltY = clamp((shL.y - shR.y) * 0.5, -0.055, 0.055);
    const hipTiltY = clamp((hipL.y - hipR.y) * 0.5, -0.038, 0.038);

    const newShL: MocapVec3 = {
      x: midSh.x + expectedLeftX * halfShSpan,
      y: midSh.y + shTiltY,
      z: midSh.z + expectedLeftZ * halfShSpan,
      visibility: shL.visibility,
    };
    const newShR: MocapVec3 = {
      x: midSh.x - expectedLeftX * halfShSpan,
      y: midSh.y - shTiltY,
      z: midSh.z - expectedLeftZ * halfShSpan,
      visibility: shR.visibility,
    };
    const newHipL: MocapVec3 = {
      x: midHipNow.x + expectedLeftX * halfHipSpan,
      y: midHipNow.y + hipTiltY,
      z: midHipNow.z + expectedLeftZ * halfHipSpan,
      visibility: hipL.visibility,
    };
    const newHipR: MocapVec3 = {
      x: midHipNow.x - expectedLeftX * halfHipSpan,
      y: midHipNow.y - hipTiltY,
      z: midHipNow.z - expectedLeftZ * halfHipSpan,
      visibility: hipR.visibility,
    };

    const shiftChildren = (indices: readonly number[], dx: number, dy: number, dz: number) => {
      for (const cIdx of indices) {
        if (w[cIdx]) {
          w[cIdx] = {
            ...w[cIdx],
            x: w[cIdx].x + dx,
            y: w[cIdx].y + dy,
            z: w[cIdx].z + dz,
          };
        }
      }
    };

    shiftChildren([13, 15, 17, 19, 21], newShL.x - shL.x, newShL.y - shL.y, newShL.z - shL.z);
    shiftChildren([14, 16, 18, 20, 22], newShR.x - shR.x, newShR.y - shR.y, newShR.z - shR.z);
    shiftChildren([25, 27, 29, 31], newHipL.x - hipL.x, newHipL.y - hipL.y, newHipL.z - hipL.z);
    shiftChildren([26, 28, 30, 32], newHipR.x - hipR.x, newHipR.y - hipR.y, newHipR.z - hipR.z);

    w[11] = newShL;
    w[12] = newShR;
    w[23] = newHipL;
    w[24] = newHipR;
  }

  return outSeq;
}

function buildFilteredMocapTimeline(
  rawTimes: number[],
  rawWorld3D: MocapVec3[][],
  rawNorm2D: MocapVec3[][],
  duration: number,
  videoAspect: number,
  effectiveFps: number,
  tier: 'heavy' | 'full' | 'lite',
): MocapTimelineResult {
  const normSeqWork = rawNorm2D.map((f) => f.map((p) => ({ ...p })));
  const occRepairedSeq = repairSevereOcclusionsTemporal(rawWorld3D, rawTimes, 0.22);
  const repairedWorldSeq = stabilizeTemporalHeadingSequence(
    occRepairedSeq,
    normSeqWork,
    rawTimes,
    videoAspect,
  );
  const calibratedLimbs = calibrateSubjectLimbLengths(repairedWorldSeq);

  // Banco 1€ calibrado con alta respuesta dinámica para que el avatar copie fielmente
  // ciclos de levantamiento, giros y caminata sin retardo ni temblor.
  const worldBank = new Landmark33OneEuroBank(1.15, 0.62, 0.78, 0.28);
  const normBank = new Landmark33OneEuroBank(1.38, 0.66, 0.92, 0.28);
  const rootXFilter = new OneEuroScalarFilter(0.95, 0.30, 1.0);
  const rootZFilter = new OneEuroScalarFilter(0.65, 0.16, 1.0);

  // Calibrar escala métrica 2D/3D de bipedestación (percentil 82 de toda la secuencia)
  // para impedir que fotogramas agachados compriman la longitud aparente de pierna y flexionen rodillas en falso.
  const scaleSamples: number[] = [];
  const floorAnkYSamples: number[] = [];
  for (let i = 0; i < repairedWorldSeq.length; i++) {
    scaleSamples.push(
      estimateSingleFrameStandingScale(
        repairedWorldSeq[i],
        normSeqWork[i],
        videoAspect,
        calibratedLimbs,
      ),
    );
    const n = normSeqWork[i];
    if (Math.max(n[27]?.visibility ?? 0, n[28]?.visibility ?? 0) >= 0.45) {
      floorAnkYSamples.push(Math.max(n[27]?.y ?? 0, n[28]?.y ?? 0));
    }
  }
  const refScale = clamp(percentileSorted(scaleSamples, 0.65, 0.36), 0.16, 1.65);
  const localFrameScales: number[] = scaleSamples.map((_, idx) => {
    const win: number[] = [];
    for (let k = Math.max(0, idx - 2); k <= Math.min(scaleSamples.length - 1, idx + 2); k++) {
      win.push(scaleSamples[k]);
    }
    return clamp(medianValue(win, refScale), 0.16, 1.65);
  });
  const refFloorAnkY = percentileSorted(floorAnkYSamples, 0.55, 0.86);

  const initHipXs: number[] = [];
  for (let i = 0; i < normSeqWork.length; i++) {
    const n = normSeqWork[i];
    if (Math.min(n[23]?.visibility ?? 0, n[24]?.visibility ?? 0) >= 0.32) {
      initHipXs.push(((n[23].x + n[24].x) * 0.5) * videoAspect);
    }
  }
  const refHip2DX =
    initHipXs.length > 0
      ? medianValue(initHipXs, 0.5 * videoAspect)
      : ((normSeqWork[0][23].x + normSeqWork[0][24].x) * 0.5) * videoAspect;

  const frames: MocapFrameSample[] = [];
  const occlusionSegments: OcclusionSegment[] = [];
  let activeOcc: OcclusionSegment | null = null;
  let lastValidRootX = 0;
  let lastValidRootZ = 0;

  for (let i = 0; i < repairedWorldSeq.length; i++) {
    const tSec = rawTimes[i];
    const frameScale = localFrameScales[i] ?? refScale;
    const filtNorm = normBank.filterLandmarks(normSeqWork[i], tSec);
    const alignedWorld = alignWorldChainToScreen2D(
      repairedWorldSeq[i],
      filtNorm,
      videoAspect,
      calibratedLimbs,
      frameScale,
    );
    const stabilizedWorld = enforceAnatomicalLimitsAndLegCoherence(
      alignedWorld,
      repairedWorldSeq[i],
      filtNorm,
      videoAspect,
      calibratedLimbs,
      frameScale,
    );
    const filtWorld = worldBank.filterLandmarks(stabilizedWorld, tSec);

    // Sincronizar también el overlay 2D cuando una pierna ocluida flotaba artificialmente sobre caja/palé
    if (filtNorm[23] && filtNorm[24] && filtNorm[27] && filtNorm[28]) {
      const floorY2D = Math.max(filtNorm[27].y, filtNorm[28].y);
      const midHipY2D = (filtNorm[23].y + filtNorm[24].y) * 0.5;
      const legSpanY2D = floorY2D - midHipY2D;
      if (floorY2D < 0.965 && legSpanY2D >= 0.14) {
        for (const [hipI, kneeI, ankI] of [
          [23, 25, 27],
          [24, 26, 28],
        ] as const) {
          if (floorY2D - filtNorm[ankI].y > 0.048) {
            filtNorm[ankI] = {
              ...filtNorm[ankI],
              x: filtNorm[hipI].x * 0.65 + filtNorm[ankI].x * 0.35,
              y: floorY2D - 0.014,
            };
            filtNorm[kneeI] = {
              ...filtNorm[kneeI],
              x: (filtNorm[hipI].x + filtNorm[ankI].x) * 0.5,
              y: (filtNorm[hipI].y + filtNorm[ankI].y) * 0.5,
            };
          }
        }
      }
    }

    // Traslación continua sin teletransporte a X=0 cuando una rodilla queda tras un palé,
    // y sin "cohete Z" al agacharse (profundidad suave basada solo en perspectiva de pies en suelo).
    const hipVis = Math.min(
      normSeqWork[i][23]?.visibility ?? 0,
      normSeqWork[i][24]?.visibility ?? 0,
    );
    const shVis = Math.min(
      normSeqWork[i][11]?.visibility ?? 0,
      normSeqWork[i][12]?.visibility ?? 0,
    );
    if (hipVis >= 0.30) {
      const curHip2DX = (filtNorm[23].x + filtNorm[24].x) * 0.5 * videoAspect;
      lastValidRootX = clamp((curHip2DX - refHip2DX) / Math.max(0.18, refScale), -1.45, 1.45);
    } else if (shVis >= 0.40) {
      const curSh2DX = (filtNorm[11].x + filtNorm[12].x) * 0.5 * videoAspect;
      lastValidRootX = clamp((curSh2DX - refHip2DX) / Math.max(0.18, refScale), -1.45, 1.45);
    }

    const ankVisMax = Math.max(
      normSeqWork[i][27]?.visibility ?? 0,
      normSeqWork[i][28]?.visibility ?? 0,
    );
    if (ankVisMax >= 0.48) {
      const curFloorAnkY = Math.max(filtNorm[27].y, filtNorm[28].y);
      lastValidRootZ = clamp(((curFloorAnkY - refFloorAnkY) / Math.max(0.18, refScale)) * 0.45, -0.22, 0.22);
    }

    const rootTranslation = {
      x: rootXFilter.filter(lastValidRootX, tSec),
      y: 0,
      z: rootZFilter.filter(lastValidRootZ, tSec),
    };

    const rightArmConfidence =
      ((repairedWorldSeq[i][14]?.visibility ?? 0) + (repairedWorldSeq[i][16]?.visibility ?? 0)) * 0.5;
    const leftArmConfidence =
      ((repairedWorldSeq[i][13]?.visibility ?? 0) + (repairedWorldSeq[i][15]?.visibility ?? 0)) * 0.5;
    const minArmConf = Math.min(rightArmConfidence, leftArmConfidence);
    const hasOcclusion = minArmConf < 0.45;

    if (hasOcclusion) {
      const side: 'left' | 'right' | 'both' =
        rightArmConfidence < 0.45 && leftArmConfidence < 0.45
          ? 'both'
          : leftArmConfidence < 0.45
            ? 'left'
            : 'right';
      if (activeOcc && tSec - activeOcc.endSec <= 0.35) {
        activeOcc.endSec = round1(tSec);
        activeOcc.minConfidence = Math.min(activeOcc.minConfidence, minArmConf);
        if (activeOcc.occludedSide !== side) activeOcc.occludedSide = 'both';
      } else {
        if (activeOcc) occlusionSegments.push(activeOcc);
        activeOcc = {
          startSec: round1(tSec),
          endSec: round1(tSec),
          occludedSide: side,
          minConfidence: minArmConf,
        };
      }
    } else if (activeOcc) {
      occlusionSegments.push(activeOcc);
      activeOcc = null;
    }

    frames.push({
      timeSec: Math.round(tSec * 1000) / 1000,
      world3D: filtWorld,
      norm2D: filtNorm,
      rawNorm2D: normSeqWork[i],
      rootTranslation,
      rightArmConfidence,
      leftArmConfidence,
      hasOcclusion,
      ergonomicPose: computeErgonomicPoseFromWorld3D(filtWorld, rootTranslation),
    });
  }

  if (activeOcc) occlusionSegments.push(activeOcc);

  return {
    frames,
    durationSec: duration,
    videoAspect,
    sampledFps: Math.round(effectiveFps * 10) / 10,
    modelTier: tier,
    occlusionSegments,
  };
}

/**
 * Extrae la secuencia cinemática 3D real con MediaPipe Pose Full en modo IMAGE,
 * evaluando cada fotograma decodificado en resolución nítida (640/512 px) con respaldo de recorte ROI
 * sobre el último centroide válido cuando el operario se aleja en naves industriales amplias.
 */
export async function extractTrueMocapTimeline(
  videoElement: HTMLVideoElement,
  options?: MocapExtractionOptions,
): Promise<MocapTimelineResult | null> {
  const preferFast = options?.preferFastModel !== false;
  let activeLoaded = await initHeavyPoseMoCap(preferFast);
  if (!activeLoaded) return null;

  await ensureVideoFrameDecoded(videoElement, 1100);

  let { landmarker, tier } = activeLoaded;
  const duration =
    Number.isFinite(videoElement.duration) && videoElement.duration > 0.15
      ? videoElement.duration
      : 4;
  const vw = videoElement.videoWidth || 1280;
  const vh = videoElement.videoHeight || 720;
  const videoAspect = vw / Math.max(1, vh);
  const mobileMode = isMobileViewportDevice();

  // Lienzo optimizado (480 px escritorio / 384 px móvil): BlazePose opera internamente a 256×256,
  // acelerando lectura 2× en web y celular sin pérdida de precisión articular.
  const maxDetectDim = mobileMode ? 384 : 480;
  const detectScale = Math.min(1, maxDetectDim / Math.max(vw, vh, 1));
  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = Math.max(96, Math.round(vw * detectScale));
  frameCanvas.height = Math.max(96, Math.round(vh * detectScale));
  const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });

  // Lienzo auxiliar para re-detección focalizada (ROI) sobre el sujeto humano validado
  const roiCanvas = document.createElement('canvas');
  roiCanvas.width = frameCanvas.width;
  roiCanvas.height = frameCanvas.height;
  const roiCtx = roiCanvas.getContext('2d', { willReadFrequently: true });
  let lastValidCenter2D: { cx: number; cy: number } | null = null;

  const maxCap = options?.maxTotalSamples
    ? clamp(Math.round(options.maxTotalSamples), 12, 240)
    : mobileMode
      ? 30
      : 60;
  const defaultFps = duration <= 8 ? 8 : duration <= 22 ? 3.5 : 3;
  const requestedFps = clamp(options?.targetFps ?? defaultFps, 1, 24);
  const totalSamples = Math.max(12, Math.min(maxCap, Math.ceil(duration * requestedFps)));
  const effectiveFps = totalSamples / Math.max(0.2, duration);

  const rawTimes: number[] = [];
  const rawWorld3D: MocapVec3[][] = [];
  const rawNorm2D: MocapVec3[][] = [];

  let didAttemptRecovery = false;
  let emittedFirstPreview = false;

  const tryDetectRoiCrop = (): PlausiblePoseSelection | null => {
    if (!roiCtx || vw <= 0 || vh <= 0) return null;
    const candidateWindows: ReadonlyArray<readonly [number, number, number]> = lastValidCenter2D
      ? [[lastValidCenter2D.cx, lastValidCenter2D.cy, 0.72]]
      : [
          [0.58, 0.52, 0.72],
          [0.42, 0.52, 0.72],
          [0.50, 0.52, 0.76],
        ];

    for (const [cx, cy, cropScale] of candidateWindows) {
      const srcW = vw * cropScale;
      const srcH = vh * cropScale;
      const srcX = clamp(cx * vw - srcW * 0.5, 0, Math.max(0, vw - srcW));
      const srcY = clamp(cy * vh - srcH * 0.5, 0, Math.max(0, vh - srcH));
      try {
        roiCtx.clearRect(0, 0, roiCanvas.width, roiCanvas.height);
        roiCtx.drawImage(
          videoElement,
          srcX,
          srcY,
          srcW,
          srcH,
          0,
          0,
          roiCanvas.width,
          roiCanvas.height,
        );
        const roiRes = landmarker.detect(roiCanvas);
        const picked = selectBestPlausibleHumanPose(roiRes, videoAspect, lastValidCenter2D, {
          srcX,
          srcY,
          srcW,
          srcH,
          vw,
          vh,
          cropScale,
        });
        if (picked) return picked;
      } catch {
        // Probar siguiente ventana ROI
      }
    }
    return null;
  };

  for (let i = 0; i < totalSamples; i++) {
    if (options?.abortSignal?.aborted) {
      break;
    }
    const tSec =
      totalSamples <= 1
        ? 0
        : (i / (totalSamples - 1)) * Math.max(0.05, duration - 0.06);
    await seekVideoExact(videoElement, tSec);

    let detectInput: HTMLCanvasElement | HTMLVideoElement = videoElement;
    if (frameCtx && videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
      try {
        frameCtx.drawImage(videoElement, 0, 0, frameCanvas.width, frameCanvas.height);
        detectInput = frameCanvas;
      } catch {
        detectInput = videoElement;
      }
    }

    try {
      let res = landmarker.detect(detectInput);
      if (
        !didAttemptRecovery &&
        i === 3 &&
        rawWorld3D.length === 0 &&
        (!res.worldLandmarks || res.worldLandmarks.length === 0)
      ) {
        didAttemptRecovery = true;
        const recovered = await resetHeavyPoseMoCap(false, preferFast);
        if (recovered) {
          landmarker = recovered.landmarker;
          tier = recovered.tier;
          res = landmarker.detect(detectInput);
        }
      }

      let picked = selectBestPlausibleHumanPose(res, videoAspect, lastValidCenter2D);
      if (!picked) {
        picked = tryDetectRoiCrop();
      }

      if (picked) {
        const convertedWorld = picked.world;
        const convertedNorm = picked.norm;
        lastValidCenter2D = picked.center;

        rawTimes.push(tSec);
        rawWorld3D.push(convertedWorld);
        rawNorm2D.push(convertedNorm);

        if (!emittedFirstPreview && options?.onFirstFrameSample) {
          emittedFirstPreview = true;
          const previewNormCopy = [convertedNorm.map((p) => ({ ...p }))];
          const previewYawW = stabilizeTemporalHeadingSequence(
            [convertedWorld],
            previewNormCopy,
            [tSec],
            videoAspect,
          )[0];
          const previewN = previewNormCopy[0];
          const previewLimbs = calibrateSubjectLimbLengths([previewYawW]);
          const previewScale = estimateSingleFrameStandingScale(
            previewYawW,
            previewN,
            videoAspect,
            previewLimbs,
          );
          const previewAligned = alignWorldChainToScreen2D(
            previewYawW,
            previewN,
            videoAspect,
            previewLimbs,
            previewScale,
          );
          const previewStab = enforceAnatomicalLimitsAndLegCoherence(
            previewAligned,
            previewYawW,
            previewN,
            videoAspect,
            previewLimbs,
            previewScale,
          );
          const rConf =
            ((previewYawW[14]?.visibility ?? 0) + (previewYawW[16]?.visibility ?? 0)) * 0.5;
          const lConf =
            ((previewYawW[13]?.visibility ?? 0) + (previewYawW[15]?.visibility ?? 0)) * 0.5;
          options.onFirstFrameSample({
            timeSec: Math.round(tSec * 1000) / 1000,
            world3D: previewStab,
            norm2D: previewN,
            rawNorm2D: previewN,
            rootTranslation: { x: 0, y: 0, z: 0 },
            rightArmConfidence: rConf,
            leftArmConfidence: lConf,
            hasOcclusion: Math.min(rConf, lConf) < 0.45,
            ergonomicPose: computeErgonomicPoseFromWorld3D(previewStab, { x: 0, y: 0, z: 0 }),
          });
        }

        if (
          options?.onPartialTimeline &&
          rawWorld3D.length >= 6 &&
          rawWorld3D.length % 14 === 0 &&
          i < totalSamples - 2
        ) {
          options.onPartialTimeline(
            buildFilteredMocapTimeline(
              rawTimes,
              rawWorld3D,
              rawNorm2D,
              duration,
              videoAspect,
              effectiveFps,
              tier,
            ),
          );
        }
      } else if (i === totalSamples - 1 && rawWorld3D.length > 0) {
        rawTimes.push(tSec);
        rawWorld3D.push(rawWorld3D[rawWorld3D.length - 1].map((p) => ({ ...p })));
        rawNorm2D.push(rawNorm2D[rawNorm2D.length - 1].map((p) => ({ ...p })));
      }
    } catch (frameErr) {
      if (!didAttemptRecovery) {
        didAttemptRecovery = true;
        console.warn('[mocapRetargeter] Re-inicializando PoseLandmarker tras excepción:', frameErr);
        const recovered = await resetHeavyPoseMoCap(true, preferFast);
        if (recovered) {
          landmarker = recovered.landmarker;
          tier = recovered.tier;
          try {
            const retryRes = landmarker.detect(detectInput);
            if (
              retryRes.worldLandmarks &&
              retryRes.worldLandmarks.length > 0 &&
              retryRes.landmarks &&
              retryRes.landmarks.length > 0
            ) {
              rawTimes.push(tSec);
              rawWorld3D.push(
                retryRes.worldLandmarks[0].map((p) => ({
                  x: p.x,
                  y: -p.y,
                  z: -p.z,
                  visibility: clamp(p.visibility ?? 0.85, 0, 1),
                })),
              );
              rawNorm2D.push(
                retryRes.landmarks[0].map((p) => ({
                  x: p.x,
                  y: p.y,
                  z: p.z,
                  visibility: clamp(p.visibility ?? 0.85, 0, 1),
                })),
              );
            }
          } catch {
            // Continuar siguiente fotograma
          }
        }
      }
    }

    if (i % 6 === 5) {
      await new Promise<void>((r) => window.setTimeout(r, 0));
    }

    options?.onProgress?.(
      Math.round(((i + 1) / totalSamples) * 94),
      `Copiando movimiento del vídeo: ${i + 1}/${totalSamples} cuadros (${tier.toUpperCase()})`,
    );
  }

  if (rawWorld3D.length === 0) return null;

  options?.onProgress?.(97, 'Alineando cinemática 2D-3D y suavizado 1€...');
  const finalTimeline = buildFilteredMocapTimeline(
    rawTimes,
    rawWorld3D,
    rawNorm2D,
    duration,
    videoAspect,
    effectiveFps,
    tier,
  );
  options?.onProgress?.(100, 'Secuencia 3D lista');
  return finalTimeline;
}

/**
 * Interpola suavemente un MocapFrameSample en cualquier instante continuo `tSec` (60 Hz)
 * aplicando los pines híbridos de corrección (Opción C).
 */
export function interpolateMocapFrameAtTime(
  timeline: MocapTimelineResult,
  tSec: number,
  pins: MocapCorrectionPin[] = [],
  autoAssistSevereArmOcclusion = false,
): MocapFrameSample | null {
  const { frames } = timeline;
  if (!frames || frames.length === 0) return null;

  if (frames.length === 1) {
    const f0 = frames[0];
    const adjustedWorld = applyHybridCorrectionPinsToWorld3D(
      f0.world3D,
      tSec,
      pins,
      autoAssistSevereArmOcclusion,
    );
    return {
      ...f0,
      timeSec: tSec,
      world3D: adjustedWorld,
      ergonomicPose: computeErgonomicPoseFromWorld3D(adjustedWorld, f0.rootTranslation),
    };
  }

  // Búsqueda binaria rápida O(log N) para reproducción fluida a 60 fps
  let lo = 0;
  let hi = frames.length - 2;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid + 1].timeSec < tSec) {
      lo = mid + 1;
    } else if (frames[mid].timeSec > tSec) {
      hi = mid - 1;
    } else {
      lo = mid;
      break;
    }
  }
  const idx = clamp(lo, 0, frames.length - 2);
  const a = frames[idx];
  const b = frames[idx + 1];
  const span = Math.max(1e-4, b.timeSec - a.timeSec);
  const alpha = clamp((tSec - a.timeSec) / span, 0, 1);

  const sAlpha = alpha * alpha * (3 - 2 * alpha);
  const interpWorld: MocapVec3[] = a.world3D.map((pa, i) => {
    const pb = b.world3D[i];
    return {
      x: pa.x + (pb.x - pa.x) * sAlpha,
      y: pa.y + (pb.y - pa.y) * sAlpha,
      z: pa.z + (pb.z - pa.z) * sAlpha,
      visibility: pa.visibility + (pb.visibility - pa.visibility) * alpha,
    };
  });

  // Interpolación jerárquica preservando longitudes óseas para evitar encogimiento de hombros/brazos durante giros amplios
  const preserveBoneInterp = (parentIdx: number, childIdx: number) => {
    const paP = a.world3D[parentIdx];
    const paC = a.world3D[childIdx];
    const pbP = b.world3D[parentIdx];
    const pbC = b.world3D[childIdx];
    const curP = interpWorld[parentIdx];
    const curC = interpWorld[childIdx];
    if (!paP || !paC || !pbP || !pbC || !curP || !curC) return;

    const va = vecSub(paC, paP);
    const vb = vecSub(pbC, pbP);
    const la = vecLen(va);
    const lb = vecLen(vb);
    if (la < 0.02 || lb < 0.02) return;

    const targetLen = la + (lb - la) * sAlpha;
    let dir = {
      x: (va.x / la) * (1 - sAlpha) + (vb.x / lb) * sAlpha,
      y: (va.y / la) * (1 - sAlpha) + (vb.y / lb) * sAlpha,
      z: (va.z / la) * (1 - sAlpha) + (vb.z / lb) * sAlpha,
    };
    const dLen = vecLen(dir);
    if (dLen < 1e-4) {
      // Vectores casi antiparalelos (giro cercano a 180°): rotar por la normal horizontal
      dir = vecNorm(vecCross(va, { x: 0, y: 1, z: 0 }));
    } else {
      dir = { x: dir.x / dLen, y: dir.y / dLen, z: dir.z / dLen };
    }
    interpWorld[childIdx] = {
      x: curP.x + dir.x * targetLen,
      y: curP.y + dir.y * targetLen,
      z: curP.z + dir.z * targetLen,
      visibility: curC.visibility,
    };
  };

  // Preservar envergadura biacromial/pélvica interpolando circularmente el rumbo horizontal en giros de 90°–180°
  const preserveSymmetricPair = (idxL: number, idxR: number) => {
    const aL = a.world3D[idxL];
    const aR = a.world3D[idxR];
    const bL = b.world3D[idxL];
    const bR = b.world3D[idxR];
    if (!aL || !aR || !bL || !bR) return;
    const mid = vecMid(interpWorld[idxL], interpWorld[idxR]);
    const va = vecSub(aL, aR);
    const vb = vecSub(bL, bR);
    const la = vecLen(va);
    const lb = vecLen(vb);
    if (la < 0.04 || lb < 0.04) return;
    const halfSpan = (la + (lb - la) * sAlpha) * 0.5;
    const ha = Math.hypot(va.x, va.z);
    const hb = Math.hypot(vb.x, vb.z);
    let dir: { x: number; y: number; z: number };
    if (ha > 0.03 && hb > 0.03) {
      const yawA = Math.atan2(-va.z, va.x);
      const yawB = Math.atan2(-vb.z, vb.x);
      const yawI = yawA + shortestAngleDiffRad(yawA, yawB) * sAlpha;
      const dy = (va.y / la) * (1 - sAlpha) + (vb.y / lb) * sAlpha;
      const horizScale = Math.sqrt(Math.max(0.05, 1 - dy * dy));
      dir = vecNorm({
        x: Math.cos(yawI) * horizScale,
        y: dy,
        z: -Math.sin(yawI) * horizScale,
      });
    } else {
      dir = {
        x: (va.x / la) * (1 - sAlpha) + (vb.x / lb) * sAlpha,
        y: (va.y / la) * (1 - sAlpha) + (vb.y / lb) * sAlpha,
        z: (va.z / la) * (1 - sAlpha) + (vb.z / lb) * sAlpha,
      };
      dir = vecLen(dir) < 1e-3 ? vecNorm(vecCross(va, { x: 0, y: 1, z: 0 })) : vecNorm(dir);
    }
    interpWorld[idxL] = {
      x: mid.x + dir.x * halfSpan,
      y: mid.y + dir.y * halfSpan,
      z: mid.z + dir.z * halfSpan,
      visibility: interpWorld[idxL].visibility,
    };
    interpWorld[idxR] = {
      x: mid.x - dir.x * halfSpan,
      y: mid.y - dir.y * halfSpan,
      z: mid.z - dir.z * halfSpan,
      visibility: interpWorld[idxR].visibility,
    };
  };

  const preWrR = { ...interpWorld[16] };
  const preWrL = { ...interpWorld[15] };
  const preAnkR = { ...interpWorld[28] };
  const preAnkL = { ...interpWorld[27] };

  preserveSymmetricPair(23, 24);
  preserveSymmetricPair(11, 12);
  preserveBoneInterp(12, 14);
  preserveBoneInterp(14, 16);
  preserveBoneInterp(11, 13);
  preserveBoneInterp(13, 15);
  preserveBoneInterp(24, 26);
  preserveBoneInterp(26, 28);
  preserveBoneInterp(23, 25);
  preserveBoneInterp(25, 27);

  // Trasladar manos y pies solidariamente con el ajuste óseo de muñecas y tobillos para evitar giros fantasma
  const shiftDistalGroup = (indices: readonly number[], prevBase: MocapVec3, newBase: MocapVec3) => {
    const dx = newBase.x - prevBase.x;
    const dy = newBase.y - prevBase.y;
    const dz = newBase.z - prevBase.z;
    for (const k of indices) {
      if (interpWorld[k]) {
        interpWorld[k] = {
          ...interpWorld[k],
          x: interpWorld[k].x + dx,
          y: interpWorld[k].y + dy,
          z: interpWorld[k].z + dz,
        };
      }
    }
  };
  shiftDistalGroup([18, 20, 22], preWrR, interpWorld[16]);
  shiftDistalGroup([17, 19, 21], preWrL, interpWorld[15]);
  shiftDistalGroup([30, 32], preAnkR, interpWorld[28]);
  shiftDistalGroup([29, 31], preAnkL, interpWorld[27]);

  const interpNorm: MocapVec3[] = a.norm2D.map((pa, i) => {
    const pb = b.norm2D[i];
    return {
      x: pa.x + (pb.x - pa.x) * alpha,
      y: pa.y + (pb.y - pa.y) * alpha,
      z: pa.z + (pb.z - pa.z) * alpha,
      visibility: pa.visibility + (pb.visibility - pa.visibility) * alpha,
    };
  });

  const rootTranslation = {
    x: a.rootTranslation.x + (b.rootTranslation.x - a.rootTranslation.x) * alpha,
    y: 0,
    z: a.rootTranslation.z + (b.rootTranslation.z - a.rootTranslation.z) * alpha,
  };

  const adjustedWorld = applyHybridCorrectionPinsToWorld3D(
    interpWorld,
    tSec,
    pins,
    autoAssistSevereArmOcclusion,
  );

  const rightArmConfidence =
    a.rightArmConfidence + (b.rightArmConfidence - a.rightArmConfidence) * alpha;
  const leftArmConfidence =
    a.leftArmConfidence + (b.leftArmConfidence - a.leftArmConfidence) * alpha;

  const interpRawNorm: MocapVec3[] | undefined =
    a.rawNorm2D && b.rawNorm2D
      ? a.rawNorm2D.map((pa, i) => {
          const pb = b.rawNorm2D![i] || pa;
          return {
            x: pa.x + (pb.x - pa.x) * alpha,
            y: pa.y + (pb.y - pa.y) * alpha,
            z: pa.z + (pb.z - pa.z) * alpha,
            visibility: pa.visibility + (pb.visibility - pa.visibility) * alpha,
          };
        })
      : a.rawNorm2D || b.rawNorm2D;

  return {
    timeSec: tSec,
    world3D: adjustedWorld,
    norm2D: interpNorm,
    rawNorm2D: interpRawNorm,
    rootTranslation,
    rightArmConfidence,
    leftArmConfidence,
    hasOcclusion: Math.min(rightArmConfidence, leftArmConfidence) < 0.45,
    ergonomicPose: computeErgonomicPoseFromWorld3D(adjustedWorld, rootTranslation),
  };
}

/**
 * Dibuja los vectores rectos biomecánicos detectados directamente sobre el rectángulo del vídeo original
 * con doble trazo de alto contraste (borde pizarra + núcleo vectorial nítido).
 */
export function drawDetectedSkeletonOverlay(
  ctx: CanvasRenderingContext2D,
  sample: MocapFrameSample,
  rect: { x: number; y: number; w: number; h: number },
): void {
  const pts = sample.norm2D;
  if (!pts || pts.length < 33) return;

  const segments: Array<[number, number]> = [
    [11, 12],
    [23, 24],
    [11, 23],
    [12, 24],
    [12, 14],
    [14, 16],
    [11, 13],
    [13, 15],
    [24, 26],
    [26, 28],
    [28, 32],
    [23, 25],
    [25, 27],
    [27, 31],
  ];

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const [a, b] of segments) {
    const pa = pts[a];
    const pb = pts[b];
    if (!pa || !pb) continue;
    const minVis = Math.min(pa.visibility, pb.visibility);
    if (minVis < 0.22) continue;

    const x1 = rect.x + pa.x * rect.w;
    const y1 = rect.y + pa.y * rect.h;
    const x2 = rect.x + pb.x * rect.w;
    const y2 = rect.y + pb.y * rect.h;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = 4.4;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle =
      minVis >= 0.48 ? 'rgba(56, 189, 248, 0.96)' : 'rgba(251, 191, 36, 0.95)';
    ctx.stroke();
  }

  const keyNodes = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32];
  for (const idx of keyNodes) {
    const p = pts[idx];
    if (!p || p.visibility < 0.22) continue;
    const x = rect.x + p.x * rect.w;
    const y = rect.y + p.y * rect.h;
    ctx.beginPath();
    ctx.arc(x, y, 4.4, 0, Math.PI * 2);
    ctx.fillStyle = p.visibility >= 0.48 ? '#0284c7' : '#f59e0b';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }

  ctx.restore();
}

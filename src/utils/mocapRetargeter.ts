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
let loadedModelTier: 'heavy' | 'full' | 'lite' = 'heavy';
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
 * Carga MediaPipe PoseLandmarker priorizando el modelo HEAVY (máxima fidelidad 3D)
 * con respaldo automático a FULL y LITE según disponibilidad de GPU/red.
 */
export async function initHeavyPoseMoCap(): Promise<{
  landmarker: PoseLandmarker;
  tier: 'heavy' | 'full' | 'lite';
} | null> {
  if (heavyLandmarker) {
    return { landmarker: heavyLandmarker, tier: loadedModelTier };
  }
  if (heavyInitPromise) return heavyInitPromise;

  heavyInitPromise = (async () => {
    try {
      const vision = await resolveVisionTasks();
      const isMobile = isMobileViewportDevice();
      // En dispositivos móviles se utiliza estrictamente LITE -> FULL y delegado CPU (WASM SIMD)
      // para eliminar la colisión de contextos WebGL con Three.js que satura el driver GPU de Android y congela/cierra la app.
      const orderedModels = isMobile
        ? [MODEL_URLS[2], MODEL_URLS[1]]
        : MODEL_URLS;
      const delegates = isMobile ? (['CPU'] as const) : (['GPU', 'CPU'] as const);
      for (const candidate of orderedModels) {
        for (const delegate of delegates) {
          try {
            const lm = await PoseLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: candidate.url,
                delegate,
              },
              runningMode: 'VIDEO',
              numPoses: 1,
              minPoseDetectionConfidence: 0.42,
              minPosePresenceConfidence: 0.42,
              minTrackingConfidence: 0.42,
            });
            heavyLandmarker = lm;
            loadedModelTier = candidate.tier;
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

export async function resetHeavyPoseMoCap(preferCpuFallback = false): Promise<{
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
  heavyInitPromise = null;
  lastGlobalMocapTimestampMs = Math.max(
    lastGlobalMocapTimestampMs + 5000,
    Math.round(performance.now()) + 200,
  );

  if (!preferCpuFallback) {
    return initHeavyPoseMoCap();
  }

  try {
    const vision = await resolveVisionTasks();
    const isMobile = isMobileViewportDevice();
    const orderedModels = isMobile
      ? [MODEL_URLS[2], MODEL_URLS[1]]
      : MODEL_URLS;
    const delegates = isMobile ? (['CPU'] as const) : (['CPU', 'GPU'] as const);
    for (const candidate of orderedModels) {
      for (const delegate of delegates) {
        try {
          const lm = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: candidate.url,
              delegate,
            },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.42,
            minPosePresenceConfidence: 0.42,
            minTrackingConfidence: 0.42,
          });
          heavyLandmarker = lm;
          loadedModelTier = candidate.tier;
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

async function ensureVideoFrameDecoded(video: HTMLVideoElement, timeoutMs = 1400): Promise<void> {
  if (video.readyState >= 2 && video.videoWidth > 0) return;
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('loadeddata', finish);
      video.removeEventListener('canplay', finish);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    video.addEventListener('loadeddata', finish, { once: true });
    video.addEventListener('canplay', finish, { once: true });
    try {
      if (video.readyState === 0) video.load();
    } catch {
      finish();
    }
  });
}

function seekVideoExact(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return ensureVideoFrameDecoded(video, 1200).then(
    () =>
      new Promise<void>((resolve) => {
        const dur = Number.isFinite(video.duration) && video.duration > 0.05 ? video.duration : 1;
        const safeMax = Math.max(0, dur - 0.025);
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
          window.clearTimeout(timer);
          resolve();
        };
        const onSeeked = () => {
          window.clearTimeout(timer);
          // Un único ciclo de composición tras `seeked` garantiza que el buffer de píxeles esté listo en vídeos pausados sin bloquear 80ms por fotograma
          if (typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(() => finish());
          } else {
            finish();
          }
        };
        const timer = window.setTimeout(finish, 260);
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

  // Protección anti-colapso ("tirado en el suelo"): si las caderas están en sombra profunda bajo mesa/banco
  // o fuera de plano (encuadre de cintura arriba) y el vector midHip->midSh pierde altura vertical,
  // reconstruimos una pelvis anatómica erguida bajo los hombros.
  if (minHipVis < 0.38 || midSh.y - rawMidHip.y < 0.16) {
    let shHorizFwd = vecCross(shLeft, upY);
    if (vecLen(shHorizFwd) < 1e-4) shHorizFwd = { x: 0, y: 0, z: 1 };
    else shHorizFwd = vecNorm(shHorizFwd);

    const wHipFix =
      midSh.y - rawMidHip.y < 0.16 ? 1.0 : clamp((0.38 - minHipVis) / 0.18, 0.35, 1.0);
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
  const trunkUp = vecNorm(vecSub(midSh, midHip));
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

  // Escala instantánea tronco 2D/3D (inmune a oclusión de rodillas)
  let localScale = refScale;
  {
    let s2 = 0;
    let s3 = 0;
    for (const [a, b] of [
      [11, 23],
      [12, 24],
    ] as const) {
      if (Math.min(rawWorld[a].visibility, rawWorld[b].visibility) >= 0.45) {
        const d2 = Math.hypot((norm2D[b].x - norm2D[a].x) * videoAspect, norm2D[b].y - norm2D[a].y);
        const d3 = Math.hypot(out[b].x - out[a].x, out[b].y - out[a].y);
        if (d3 > 0.14 && d2 > 0.03) {
          s2 += d2;
          s3 += d3;
        }
      }
    }
    if (s3 > 0.14) {
      localScale = clamp(s2 / s3, refScale * 0.68, refScale * 1.42);
    }
  }

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
  const legConfR = Math.min(rawWorld[26]?.visibility ?? 0, rawWorld[28]?.visibility ?? 0);
  const legConfL = Math.min(rawWorld[25]?.visibility ?? 0, rawWorld[27]?.visibility ?? 0);
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
  } else if (legConfL < 0.48 && legConfR >= 0.52) {
    const haR = vecSub(out[28], out[24]);
    if (vecLen(haR) < 0.86 * fullLegSpan) {
      const wMirror = clamp((0.50 - legConfL) / 0.28, 0.35, 0.95);
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
  } else if (legConfR < 0.48 && legConfL >= 0.52) {
    const haL = vecSub(out[27], out[23]);
    if (vecLen(haL) < 0.86 * fullLegSpan) {
      const wMirror = clamp((0.50 - legConfR) / 0.28, 0.35, 0.95);
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

    const wIK = clamp(Math.max(visW, armOccW, limitW), 0, 1);
    if (wIK <= 0.01) return;

    // Anclar el tobillo directamente desde el vector 2D Cadera->Tobillo (inmune al desvío de la rodilla tapada)
    let ankTarget = { x: A.x, y: A.y, z: A.z };
    if (Math.min(rawHipVis, rawAnkVis) >= 0.42 && localScale > 0.12) {
      const dx2D = ((norm2D[ankIdx].x - norm2D[hipIdx].x) * videoAspect) / localScale;
      const dy2D = -(norm2D[ankIdx].y - norm2D[hipIdx].y) / localScale;
      const rawDz = clamp((rawWorld[ankIdx].z - rawWorld[hipIdx].z) * 0.65, -0.34, 0.34);
      ankTarget = {
        x: H.x + dx2D,
        y: H.y + dy2D,
        z: H.z + rawDz,
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

    // Asegurar límite de flexión/extensión de rodilla [1.5°, 141.5°] siempre en sentido posterior (+pelvisLeft)
    const curKneeBend = angleDeg(candThigh, candShank);
    const candHingeRaw = vecCross(candThigh, candShank);
    const isCandHyperextended = curKneeBend > kMinFlex && vecDot(candHingeRaw, refPosteriorHinge) < -0.10;
    if (curKneeBend < kMinFlex || curKneeBend > kMaxFlex || isCandHyperextended) {
      const targetBendRad = (isCandHyperextended ? kMinFlex : clamp(curKneeBend, kMinFlex, kMaxFlex)) * deg2rad;
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
  };

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
    const trunkVis = Math.min(
      hipLOrig.visibility,
      hipROrig.visibility,
      shLOrig.visibility,
      shROrig.visibility,
    );
    if (trunkVis >= 0.45) {
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
        const dampedTrunkDz = clamp(tDzW * 0.65, -lenTrunk3D * 0.68, lenTrunk3D * 0.68);
        const targetTrunkXY = Math.sqrt(
          Math.max(0.01, lenTrunk3D * lenTrunk3D - dampedTrunkDz * dampedTrunkDz),
        );
        const angTrunkW = Math.atan2(tDyW, tDxW);
        const angTrunkScr = Math.atan2(dyTrunkScr, dxTrunkScr);
        const wTrunk = 0.80 * clamp((trunkVis - 0.42) / 0.4, 0.35, 1);
        const angAlignedTrunk = angTrunkW + shortestAngleDiffRad(angTrunkW, angTrunkScr) * wTrunk;

        const newMidShX = midHipW.x + Math.cos(angAlignedTrunk) * targetTrunkXY;
        const newMidShY = midHipW.y + Math.sin(angAlignedTrunk) * targetTrunkXY;
        const newMidShZ = midHipW.z + dampedTrunkDz;

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

  const alignSegment = (
    parentIdx: number,
    childIdx: number,
    blendWeight: number,
    fixedBoneLen?: number,
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
      // Conservar componente Z monocular continua y amortiguada SIN saltos de signo artificiales:
      // evita que en plano sagital/oblicuo el brazo izquierdo invierta su eje Z y desaparezca tras el tórax.
      let blendedDz = dzW * 0.68;
      if (fixedBoneLen && refScale && refScale > 0.18 && minVis >= 0.68 && Math.abs(dzW) > 0.045) {
        const expectedMaxScreen = fixedBoneLen * refScale;
        if (expectedMaxScreen > 0.04) {
          const cosPhiZ = clamp(lenScreen / expectedMaxScreen, 0.45, 1.0);
          if (cosPhiZ < 0.82) {
            const foreshortenMagZ = fixedBoneLen * Math.sqrt(Math.max(0, 1 - cosPhiZ * cosPhiZ));
            blendedDz = blendedDz * 0.78 + Math.sign(dzW) * foreshortenMagZ * 0.22;
          }
        }
      }
      const dampedDz = clamp(blendedDz, -len3D * 0.72, len3D * 0.72);
      const targetLenXY = Math.sqrt(Math.max(0.0004, len3D * len3D - dampedDz * dampedDz));
      const angScreen = Math.atan2(dyScreen, dxScreen);
      const angW = lenXY > 0.02 ? Math.atan2(dyW, dxW) : angScreen;
      // Permitir alineación 2D desde vis >= 0.20 para que el brazo más alejado en perfil siga fielmente el vídeo
      const effWeight = blendWeight * clamp((minVis - 0.18) / 0.42, 0.35, 1);
      const angAligned = angW + shortestAngleDiffRad(angW, angScreen) * effWeight;
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

  // Alinear cadenas cinemáticas desde hombros y caderas hacia extremos distales con longitud ósea constante
  alignSegment(12, 14, 0.84, calibratedLimbs?.upperArm); // Hombro Der -> Codo Der
  alignSegment(14, 16, 0.86, calibratedLimbs?.foreArm); // Codo Der -> Muñeca Der
  alignSegment(16, 20, 0.68); // Muñeca Der -> Índice Der
  alignSegment(16, 18, 0.68); // Muñeca Der -> Meñique Der

  alignSegment(11, 13, 0.84, calibratedLimbs?.upperArm); // Hombro Izq -> Codo Izq
  alignSegment(13, 15, 0.86, calibratedLimbs?.foreArm); // Codo Izq -> Muñeca Izq
  alignSegment(15, 19, 0.68); // Muñeca Izq -> Índice Izq
  alignSegment(15, 17, 0.68); // Muñeca Izq -> Meñique Izq

  alignSegment(24, 26, 0.82, calibratedLimbs?.thigh); // Cadera Der -> Rodilla Der
  alignSegment(26, 28, 0.84, calibratedLimbs?.shank); // Rodilla Der -> Tobillo Der
  alignSegment(28, 30, 0.55); // Tobillo Der -> Talón Der
  alignSegment(28, 32, 0.65); // Tobillo Der -> Punta Pie Der

  alignSegment(23, 25, 0.82, calibratedLimbs?.thigh); // Cadera Izq -> Rodilla Izq
  alignSegment(25, 27, 0.84, calibratedLimbs?.shank); // Rodilla Izq -> Tobillo Izq
  alignSegment(27, 29, 0.55); // Tobillo Izq -> Talón Izq
  alignSegment(27, 31, 0.65); // Tobillo Izq -> Punta Pie Izq

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
  const humR = vecSub(elbR, shR);
  const foreR = vecSub(wrR, elbR);
  const humL = vecSub(elbL, shL);
  const foreL = vecSub(wrL, elbL);

  const elevR = angleDeg(humR, trunkDown);
  const fwdR = vecDot(vecNorm(humR), subjectFwd);
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
  const fwdL = vecDot(vecNorm(humL), subjectFwd);
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
 * Repara huecos de baja confianza (< 0.28) interpolando linealmente entre el fotograma
 * válido anterior y posterior antes de pasar por el filtro 1€.
 */
function repairSevereOcclusionsTemporal(
  rawWorldSeq: MocapVec3[][],
  minValidVis = 0.28,
): MocapVec3[][] {
  const nFrames = rawWorldSeq.length;
  if (nFrames <= 2) return rawWorldSeq;

  const repaired = rawWorldSeq.map((f) => f.map((p) => ({ ...p })));

  for (let lmIdx = 11; lmIdx < 33; lmIdx++) {
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

        for (let k = gapStart; k <= gapEnd; k++) {
          if (prevValidIdx >= 0 && nextValidIdx >= 0) {
            const alpha = (k - prevValidIdx) / (nextValidIdx - prevValidIdx);
            const a = repaired[prevValidIdx][lmIdx];
            const b = repaired[nextValidIdx][lmIdx];
            repaired[k][lmIdx] = {
              x: a.x + (b.x - a.x) * alpha,
              y: a.y + (b.y - a.y) * alpha,
              z: a.z + (b.z - a.z) * alpha,
              visibility: repaired[k][lmIdx].visibility,
            };
          } else if (prevValidIdx >= 0) {
            repaired[k][lmIdx] = {
              ...repaired[prevValidIdx][lmIdx],
              visibility: repaired[k][lmIdx].visibility,
            };
          } else if (nextValidIdx >= 0) {
            repaired[k][lmIdx] = {
              ...repaired[nextValidIdx][lmIdx],
              visibility: repaired[k][lmIdx].visibility,
            };
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
export async function extractSingleMocapFrame(
  videoElement: HTMLVideoElement,
  timeSec = 0,
): Promise<MocapFrameSample | null> {
  const activeLoaded = await initHeavyPoseMoCap();
  if (!activeLoaded) return null;

  await seekVideoExact(videoElement, timeSec);
  const vw = videoElement.videoWidth || 1280;
  const vh = videoElement.videoHeight || 720;
  const videoAspect = vw / Math.max(1, vh);
  const maxDim = isMobileViewportDevice() ? 560 : 768;
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
    const ts = nextMonotonicMocapTimestampMs(42, true);
    const res = activeLoaded.landmarker.detectForVideo(detectInput, ts);
    if (!res.worldLandmarks?.length || !res.landmarks?.length) return null;

    const rawW: MocapVec3[] = res.worldLandmarks[0].map((p) => ({
      x: p.x,
      y: -p.y,
      z: -p.z,
      visibility: clamp(p.visibility ?? 0.85, 0, 1),
    }));
    const rawN: MocapVec3[] = res.landmarks[0].map((p) => ({
      x: p.x,
      y: p.y,
      z: p.z,
      visibility: clamp(p.visibility ?? 0.85, 0, 1),
    }));
    const limbs = calibrateSubjectLimbLengths([rawW]);
    const aligned = alignWorldChainToScreen2D(rawW, rawN, videoAspect, limbs, 0.55);
    const stabilized = enforceAnatomicalLimitsAndLegCoherence(
      aligned,
      rawW,
      rawN,
      videoAspect,
      limbs,
      0.55,
    );
    const rootTranslation = { x: 0, y: 0, z: 0 };
    const rightArmConfidence = ((rawW[14]?.visibility ?? 0) + (rawW[16]?.visibility ?? 0)) * 0.5;
    const leftArmConfidence = ((rawW[13]?.visibility ?? 0) + (rawW[15]?.visibility ?? 0)) * 0.5;
    return {
      timeSec: Math.round(timeSec * 1000) / 1000,
      world3D: stabilized,
      norm2D: rawN,
      rawNorm2D: rawN,
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

/**
 * Extrae la secuencia cinemática 3D real con MediaPipe Pose,
 * reparación de oclusiones, fusión 2D-3D de perspectiva, Root Motion métrico
 * y filtrado adaptativo One-Euro (1€ Filter).
 */
export async function extractTrueMocapTimeline(
  videoElement: HTMLVideoElement,
  options?: {
    targetFps?: number;
    onProgress?: (pct: number, phaseText?: string) => void;
    onFirstFrameSample?: (sample: MocapFrameSample) => void;
  },
): Promise<MocapTimelineResult | null> {
  let activeLoaded = await initHeavyPoseMoCap();
  if (!activeLoaded) return null;

  await ensureVideoFrameDecoded(videoElement, 1500);

  let { landmarker, tier } = activeLoaded;
  const duration =
    Number.isFinite(videoElement.duration) && videoElement.duration > 0.15
      ? videoElement.duration
      : 4;
  const vw = videoElement.videoWidth || 1280;
  const vh = videoElement.videoHeight || 720;
  const videoAspect = vw / Math.max(1, vh);
  const mobileMode = isMobileViewportDevice();

  // Lienzo 2D RGBA intermedio: normaliza rotación MP4/MOV de móviles y evita fallos de texturas de vídeo GPU
  const maxDetectDim = mobileMode ? 640 : 960;
  const detectScale = Math.min(1, maxDetectDim / Math.max(vw, vh, 1));
  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = Math.max(64, Math.round(vw * detectScale));
  frameCanvas.height = Math.max(64, Math.round(vh * detectScale));
  const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: false });

  const defaultFps = mobileMode ? 18 : 24;
  const requestedFps = clamp(options?.targetFps ?? defaultFps, 12, 30);
  const maxTotalSamples = mobileMode ? 300 : 480;
  const totalSamples = Math.max(16, Math.min(maxTotalSamples, Math.ceil(duration * requestedFps)));
  const effectiveFps = totalSamples / Math.max(0.2, duration);
  const stepMs = Math.max(20, Math.round(1000 / effectiveFps));

  const rawTimes: number[] = [];
  const rawWorld3D: MocapVec3[][] = [];
  const rawNorm2D: MocapVec3[][] = [];

  // Salto >= 5000 ms respecto al último vídeo procesado: garantiza monotonía estricta y reinicia el ROI interno de MediaPipe
  nextMonotonicMocapTimestampMs(stepMs, true);
  let didAttemptRecovery = false;
  let emittedFirstPreview = false;

  for (let i = 0; i < totalSamples; i++) {
    const tSec =
      totalSamples <= 1
        ? 0
        : (i / (totalSamples - 1)) * Math.max(0.05, duration - 0.03);
    await seekVideoExact(videoElement, tSec);
    const frameTs = nextMonotonicMocapTimestampMs(stepMs, false);

    let detectInput: HTMLCanvasElement | HTMLVideoElement = videoElement;
    if (frameCtx && videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
      try {
        frameCtx.drawImage(videoElement, 0, 0, frameCanvas.width, frameCanvas.height);
        detectInput = frameCanvas;
      } catch {
        detectInput = videoElement;
      }
    }

    const runSingleFrameDetect = (tsVal: number) => landmarker.detectForVideo(detectInput, tsVal);

    try {
      let res = runSingleFrameDetect(frameTs);
      // Si en los primeros fotogramas no detecta nada tras cambiar de vídeo, reiniciar instancia una vez
      if (
        !didAttemptRecovery &&
        i === 3 &&
        rawWorld3D.length === 0 &&
        (!res.worldLandmarks || res.worldLandmarks.length === 0)
      ) {
        didAttemptRecovery = true;
        const recovered = await resetHeavyPoseMoCap(false);
        if (recovered) {
          landmarker = recovered.landmarker;
          tier = recovered.tier;
          res = runSingleFrameDetect(nextMonotonicMocapTimestampMs(stepMs, false));
        }
      }

      if (
        res.worldLandmarks &&
        res.worldLandmarks.length > 0 &&
        res.landmarks &&
        res.landmarks.length > 0
      ) {
        const wLm = res.worldLandmarks[0];
        const nLm = res.landmarks[0];
        const convertedWorld: MocapVec3[] = wLm.map((p) => ({
          x: p.x,
          y: -p.y,
          z: -p.z,
          visibility: clamp(p.visibility ?? 0.85, 0, 1),
        }));
        const convertedNorm: MocapVec3[] = nLm.map((p) => ({
          x: p.x,
          y: p.y,
          z: p.z,
          visibility: clamp(p.visibility ?? 0.85, 0, 1),
        }));

        rawTimes.push(tSec);
        rawWorld3D.push(convertedWorld);
        rawNorm2D.push(convertedNorm);

        if (!emittedFirstPreview && options?.onFirstFrameSample) {
          emittedFirstPreview = true;
          const previewLimbs = calibrateSubjectLimbLengths([convertedWorld]);
          const previewAligned = alignWorldChainToScreen2D(
            convertedWorld,
            convertedNorm,
            videoAspect,
            previewLimbs,
            0.55,
          );
          const previewStab = enforceAnatomicalLimitsAndLegCoherence(
            previewAligned,
            convertedWorld,
            convertedNorm,
            videoAspect,
            previewLimbs,
            0.55,
          );
          const rConf = ((convertedWorld[14]?.visibility ?? 0) + (convertedWorld[16]?.visibility ?? 0)) * 0.5;
          const lConf = ((convertedWorld[13]?.visibility ?? 0) + (convertedWorld[15]?.visibility ?? 0)) * 0.5;
          options.onFirstFrameSample({
            timeSec: Math.round(tSec * 1000) / 1000,
            world3D: previewStab,
            norm2D: convertedNorm,
            rawNorm2D: convertedNorm,
            rootTranslation: { x: 0, y: 0, z: 0 },
            rightArmConfidence: rConf,
            leftArmConfidence: lConf,
            hasOcclusion: Math.min(rConf, lConf) < 0.45,
            ergonomicPose: computeErgonomicPoseFromWorld3D(previewStab, { x: 0, y: 0, z: 0 }),
          });
        }
      } else if (rawWorld3D.length > 0) {
        rawTimes.push(tSec);
        rawWorld3D.push(rawWorld3D[rawWorld3D.length - 1].map((p) => ({ ...p, visibility: p.visibility * 0.7 })));
        rawNorm2D.push(rawNorm2D[rawNorm2D.length - 1].map((p) => ({ ...p })));
      }
    } catch (frameErr) {
      if (!didAttemptRecovery) {
        didAttemptRecovery = true;
        console.warn('[mocapRetargeter] Re-inicializando PoseLandmarker tras excepción:', frameErr);
        const recovered = await resetHeavyPoseMoCap(true);
        if (recovered) {
          landmarker = recovered.landmarker;
          tier = recovered.tier;
          try {
            const retryRes = runSingleFrameDetect(nextMonotonicMocapTimestampMs(stepMs, false));
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
              continue;
            }
          } catch {
            // Continuar
          }
        }
      }
      if (rawWorld3D.length > 0) {
        rawTimes.push(tSec);
        rawWorld3D.push(rawWorld3D[rawWorld3D.length - 1].map((p) => ({ ...p, visibility: p.visibility * 0.7 })));
        rawNorm2D.push(rawNorm2D[rawNorm2D.length - 1].map((p) => ({ ...p })));
      }
    }

    // Ceder el hilo principal cada 4 fotogramas para mantener respuesta táctil fluida en móviles
    if (i % 4 === 3) {
      await new Promise<void>((r) => window.setTimeout(r, 0));
    }

    options?.onProgress?.(
      Math.round(((i + 1) / totalSamples) * 92),
      `Rastreando esqueleto 3D (${tier.toUpperCase()}) · fotograma ${i + 1}/${totalSamples}`,
    );
  }

  if (rawWorld3D.length === 0) return null;

  options?.onProgress?.(96, 'Aplicando reparación de oclusiones y filtro cinemático 1€...');

  // 1. Reparar huecos severos de oclusión temporal antes del filtrado (umbral conservador 0.22 para no borrar brazo lejano en perfil)
  const repairedWorldSeq = repairSevereOcclusionsTemporal(rawWorld3D, 0.22);
  const calibratedLimbs = calibrateSubjectLimbLengths(rawWorld3D);

  // 2. Filtrar con banco One-Euro (1€) + estimar Root Motion métrico (caminata X/Z)
  const worldBank = new Landmark33OneEuroBank(1.08, 0.52, 0.68, 0.22);
  const normBank = new Landmark33OneEuroBank(1.35, 0.55, 0.90, 0.25);
  const rootXFilter = new OneEuroScalarFilter(0.95, 0.28, 1.0);
  const rootZFilter = new OneEuroScalarFilter(0.65, 0.16, 1.0);

  // Calibrar escala píxel/metro priorizando tronco y brazos cuando las piernas están en sombra/ocluidas
  const measureScaleRatio = (wPts: MocapVec3[], nPts: MocapVec3[]): number => {
    const upperPairs: Array<[number, number]> = [
      [11, 23],
      [12, 24],
      [11, 13],
      [12, 14],
    ];
    const lowerPairs: Array<[number, number]> = [
      [23, 25],
      [24, 26],
      [25, 27],
      [26, 28],
    ];
    const legVis = Math.min(
      wPts[25]?.visibility ?? 0,
      wPts[26]?.visibility ?? 0,
      wPts[27]?.visibility ?? 0,
      wPts[28]?.visibility ?? 0,
    );
    const pairs = legVis >= 0.5 ? [...upperPairs, ...lowerPairs] : upperPairs;
    let sum2D = 0;
    let sum3D = 0;
    for (const [a, b] of pairs) {
      if (Math.min(wPts[a].visibility, wPts[b].visibility) < 0.42) continue;
      const d2 = Math.hypot((nPts[b].x - nPts[a].x) * videoAspect, nPts[b].y - nPts[a].y);
      const d3 = Math.hypot(wPts[b].x - wPts[a].x, wPts[b].y - wPts[a].y);
      if (d3 > 0.1) {
        sum2D += d2;
        sum3D += d3;
      }
    }
    return sum3D > 0.15 ? clamp(sum2D / sum3D, 0.22, 1.65) : 0.52;
  };

  const refScale = measureScaleRatio(repairedWorldSeq[0], rawNorm2D[0]);
  const refHip2DX = (rawNorm2D[0][11].x + rawNorm2D[0][12].x) * 0.5 * videoAspect;

  const frames: MocapFrameSample[] = [];
  const occlusionSegments: OcclusionSegment[] = [];
  let activeOcc: OcclusionSegment | null = null;

  for (let i = 0; i < repairedWorldSeq.length; i++) {
    const tSec = rawTimes[i];
    const filtNorm = normBank.filterLandmarks(rawNorm2D[i], tSec);
    const alignedWorld = alignWorldChainToScreen2D(
      repairedWorldSeq[i],
      filtNorm,
      videoAspect,
      calibratedLimbs,
      refScale,
    );
    const stabilizedWorld = enforceAnatomicalLimitsAndLegCoherence(
      alignedWorld,
      rawWorld3D[i],
      filtNorm,
      videoAspect,
      calibratedLimbs,
      refScale,
    );
    const filtWorld = worldBank.filterLandmarks(stabilizedWorld, tSec);

    const curHip2DX = (filtNorm[11].x + filtNorm[12].x) * 0.5 * videoAspect;
    const rawRootX = clamp((curHip2DX - refHip2DX) / Math.max(0.18, refScale), -1.8, 1.8);
    const curScale = measureScaleRatio(filtWorld, filtNorm);
    const rawRootZ = clamp(((curScale - refScale) / Math.max(0.18, refScale)) * 1.35, -1.1, 1.1);

    const rootTranslation = {
      x: rootXFilter.filter(rawRootX, tSec),
      y: 0,
      z: rootZFilter.filter(rawRootZ, tSec),
    };

    const rightArmConfidence =
      ((rawWorld3D[i][14]?.visibility ?? 0) + (rawWorld3D[i][16]?.visibility ?? 0)) * 0.5;
    const leftArmConfidence =
      ((rawWorld3D[i][13]?.visibility ?? 0) + (rawWorld3D[i][15]?.visibility ?? 0)) * 0.5;
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
      rawNorm2D: rawNorm2D[i],
      rootTranslation,
      rightArmConfidence,
      leftArmConfidence,
      hasOcclusion,
      ergonomicPose: computeErgonomicPoseFromWorld3D(filtWorld, rootTranslation),
    });
  }

  if (activeOcc) occlusionSegments.push(activeOcc);
  options?.onProgress?.(100, 'Secuencia 3D lista');

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

  const interpWorld: MocapVec3[] = a.world3D.map((pa, i) => {
    const pb = b.world3D[i];
    return {
      x: pa.x + (pb.x - pa.x) * alpha,
      y: pa.y + (pb.y - pa.y) * alpha,
      z: pa.z + (pb.z - pa.z) * alpha,
      visibility: pa.visibility + (pb.visibility - pa.visibility) * alpha,
    };
  });

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
 * Dibuja los vectores biomecánicos detectados directamente sobre el rectángulo del vídeo original
 * coloreando en cian los segmentos nítidos y en ámbar aquellos parcialmente ocluidos.
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
    if (minVis < 0.12) continue;

    ctx.beginPath();
    ctx.moveTo(rect.x + pa.x * rect.w, rect.y + pa.y * rect.h);
    ctx.lineTo(rect.x + pb.x * rect.w, rect.y + pb.y * rect.h);
    ctx.lineWidth = 2.6;
    ctx.strokeStyle =
      minVis >= 0.5 ? 'rgba(14, 165, 233, 0.88)' : 'rgba(245, 158, 11, 0.88)';
    ctx.stroke();
  }

  const keyNodes = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32];
  for (const idx of keyNodes) {
    const p = pts[idx];
    if (!p || p.visibility < 0.15) continue;
    const x = rect.x + p.x * rect.w;
    const y = rect.y + p.y * rect.h;
    ctx.beginPath();
    ctx.arc(x, y, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = p.visibility >= 0.5 ? '#0284c7' : '#f59e0b';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }

  ctx.restore();
}

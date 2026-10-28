import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { PosturePose3D } from '../types/figurePlan';
import { makeNeutralPose } from './figurePlanCatalog';

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
  /** 33 puntos normalizados 2D [0..1] sobre el fotograma de vídeo original */
  norm2D: MocapVec3[];
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

const MEDIAPIPE_WASM_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm';

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

let heavyLandmarker: PoseLandmarker | null = null;
let loadedModelTier: 'heavy' | 'full' | 'lite' = 'heavy';
let heavyInitPromise: Promise<{ landmarker: PoseLandmarker; tier: 'heavy' | 'full' | 'lite' } | null> | null =
  null;

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
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_CDN);
      for (const candidate of MODEL_URLS) {
        for (const delegate of ['GPU', 'CPU'] as const) {
          try {
            const lm = await PoseLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: candidate.url,
                delegate,
              },
              runningMode: 'VIDEO',
              numPoses: 1,
              minPoseDetectionConfidence: 0.45,
              minPosePresenceConfidence: 0.45,
              minTrackingConfidence: 0.45,
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
      console.warn('[mocapRetargeter] No se pudo inicializar MediaPipe Pose Heavy:', err);
      heavyInitPromise = null;
      return null;
    }
  })();

  return heavyInitPromise;
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
      window.clearTimeout(timer);
      finish();
    };
    const timer = window.setTimeout(finish, 380);
    video.addEventListener('seeked', onSeeked, { once: true });
    try {
      video.currentTime = target;
    } catch {
      window.clearTimeout(timer);
      finish();
    }
  });
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

/**
 * Fusiona la dirección 2D exacta de los píxeles del vídeo (corregida por relación de aspecto)
 * con las longitudes óseas y profundidad 3D de `worldLandmarks`, para que la silueta proyectada
 * del Avatar 3D coincida visualmente 1:1 con los brazos, tronco y piernas del operario en vídeo.
 */
function alignWorldChainToScreen2D(
  world3D: MocapVec3[],
  norm2D: MocapVec3[],
  videoAspect: number,
): MocapVec3[] {
  const out = world3D.map((p) => ({ ...p }));

  const alignSegment = (parentIdx: number, childIdx: number, blendWeight: number) => {
    const pW = out[parentIdx];
    const cW = world3D[childIdx];
    const pOrigW = world3D[parentIdx];
    const pN = norm2D[parentIdx];
    const cN = norm2D[childIdx];
    if (!pW || !cW || !pOrigW || !pN || !cN) return;

    const minVis = Math.min(pW.visibility, cW.visibility);
    if (minVis < 0.48) {
      // Con baja visibilidad conservar el desplazamiento relativo 3D puro desde el padre actualizado
      out[childIdx] = {
        x: pW.x + (cW.x - pOrigW.x),
        y: pW.y + (cW.y - pOrigW.y),
        z: pW.z + (cW.z - pOrigW.z),
        visibility: cW.visibility,
      };
      return;
    }

    const dxW = cW.x - pOrigW.x;
    const dyW = cW.y - pOrigW.y;
    const dzW = cW.z - pOrigW.z;
    const lenXY = Math.hypot(dxW, dyW);

    const dxScreen = (cN.x - pN.x) * videoAspect;
    const dyScreen = -(cN.y - pN.y);
    const lenScreen = Math.hypot(dxScreen, dyScreen);

    if (lenXY > 0.035 && lenScreen > 0.015) {
      const angW = Math.atan2(dyW, dxW);
      const angScreen = Math.atan2(dyScreen, dxScreen);
      const effWeight = blendWeight * clamp((minVis - 0.45) / 0.4, 0.25, 1);
      const angAligned = angW + shortestAngleDiffRad(angW, angScreen) * effWeight;
      out[childIdx] = {
        x: pW.x + Math.cos(angAligned) * lenXY,
        y: pW.y + Math.sin(angAligned) * lenXY,
        z: pW.z + dzW,
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

  // Alinear cadenas cinemáticas desde hombros y caderas hacia extremos distales
  alignSegment(12, 14, 0.72); // Hombro Der -> Codo Der
  alignSegment(14, 16, 0.76); // Codo Der -> Muñeca Der
  alignSegment(16, 20, 0.65); // Muñeca Der -> Índice Der
  alignSegment(16, 18, 0.65); // Muñeca Der -> Meñique Der

  alignSegment(11, 13, 0.72); // Hombro Izq -> Codo Izq
  alignSegment(13, 15, 0.76); // Codo Izq -> Muñeca Izq
  alignSegment(15, 19, 0.65); // Muñeca Izq -> Índice Izq
  alignSegment(15, 17, 0.65); // Muñeca Izq -> Meñique Izq

  alignSegment(24, 26, 0.68); // Cadera Der -> Rodilla Der
  alignSegment(26, 28, 0.72); // Rodilla Der -> Tobillo Der
  alignSegment(28, 32, 0.60); // Tobillo Der -> Punta Pie Der

  alignSegment(23, 25, 0.68); // Cadera Izq -> Rodilla Izq
  alignSegment(25, 27, 0.72); // Rodilla Izq -> Tobillo Izq
  alignSegment(27, 31, 0.60); // Tobillo Izq -> Punta Pie Izq

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
  const neckFlexionDeg = clamp(round1(angleDeg(neckUp, trunkUp) - 6), -35, 45);

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

  const elbowRFlexionDeg = clamp(round1(angleDeg(humR, foreR)), 0, 160);
  const elbowLFlexionDeg = clamp(round1(angleDeg(humL, foreL)), 0, 160);

  const thighR = vecSub(kneeR, hipR);
  const shankR = vecSub(ankR, kneeR);
  const thighL = vecSub(kneeL, hipL);
  const shankL = vecSub(ankL, kneeL);

  const kneeRFlexionDeg = clamp(round1(angleDeg(thighR, shankR)), 0, 155);
  const kneeLFlexionDeg = clamp(round1(angleDeg(thighL, shankL)), 0, 155);
  const hipRFlexionDeg = clamp(round1(angleDeg(thighR, downY)), -25, 130);
  const hipLFlexionDeg = clamp(round1(angleDeg(thighL, downY)), -25, 130);

  const stanceMode: NonNullable<PosturePose3D['stanceMode']> =
    Math.max(kneeRFlexionDeg, kneeLFlexionDeg) >= 72
      ? 'squatting'
      : Math.abs(ankR.y - ankL.y) > 0.14
        ? 'one_leg'
        : 'standing';

  return makeNeutralPose({
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
    hipRFlexionDeg,
    kneeRFlexionDeg,
    ankleRDorsiflexionDeg: clamp(round1(kneeRFlexionDeg - hipRFlexionDeg), -24, 34),
    hipLFlexionDeg,
    kneeLFlexionDeg,
    ankleLDorsiflexionDeg: clamp(round1(kneeLFlexionDeg - hipLFlexionDeg), -24, 34),
    rootYawDeg,
    rootOffsetX: round1(rootTranslation.x * 100) / 100,
    rootOffsetZ: round1(rootTranslation.z * 100) / 100,
    stanceMode,
  });
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
      visibility: Math.max(out[13].visibility, 0.75 * w),
    };
    out[15] = {
      x: out[15].x + (targetWrL.x - out[15].x) * w,
      y: out[15].y + (targetWrL.y - out[15].y) * w,
      z: out[15].z + (targetWrL.z - out[15].z) * w,
      visibility: Math.max(out[15].visibility, 0.75 * w),
    };
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
      visibility: Math.max(out[14].visibility, 0.75 * w),
    };
    out[16] = {
      x: out[16].x + (targetWrR.x - out[16].x) * w,
      y: out[16].y + (targetWrR.y - out[16].y) * w,
      z: out[16].z + (targetWrR.z - out[16].z) * w,
      visibility: Math.max(out[16].visibility, 0.75 * w),
    };
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
  autoAssistSevereArmOcclusion = true,
): MocapVec3[] {
  let pts = baseWorld3D.map((p) => ({ ...p }));

  // Auto-asistencia cuando un brazo queda completamente tapado (< 0.26) y el otro es nítido (> 0.74)
  if (autoAssistSevereArmOcclusion) {
    const confR = Math.min(pts[14]?.visibility ?? 0, pts[16]?.visibility ?? 0);
    const confL = Math.min(pts[13]?.visibility ?? 0, pts[15]?.visibility ?? 0);
    if (confL < 0.26 && confR > 0.74) {
      const autoW = clamp((0.26 - confL) / 0.2, 0.2, 0.72);
      pts = applyArmMirrorInThoraxSpace(pts, 'left_from_right', autoW);
    } else if (confR < 0.26 && confL > 0.74) {
      const autoW = clamp((0.26 - confR) / 0.2, 0.2, 0.72);
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
export async function extractTrueMocapTimeline(
  videoElement: HTMLVideoElement,
  options?: {
    targetFps?: number;
    onProgress?: (pct: number, phaseText?: string) => void;
  },
): Promise<MocapTimelineResult | null> {
  const loaded = await initHeavyPoseMoCap();
  if (!loaded) return null;

  const { landmarker, tier } = loaded;
  const duration =
    Number.isFinite(videoElement.duration) && videoElement.duration > 0.15
      ? videoElement.duration
      : 4;
  const vw = videoElement.videoWidth || 1280;
  const vh = videoElement.videoHeight || 720;
  const videoAspect = vw / Math.max(1, vh);

  const requestedFps = clamp(options?.targetFps ?? 24, 12, 30);
  // Hasta 480 fotogramas (~20 s a 24 fps); para vídeos más largos ajusta el paso suavemente
  const totalSamples = Math.max(16, Math.min(480, Math.ceil(duration * requestedFps)));
  const effectiveFps = totalSamples / Math.max(0.2, duration);

  const rawTimes: number[] = [];
  const rawWorld3D: MocapVec3[][] = [];
  const rawNorm2D: MocapVec3[][] = [];

  let monotonicMs = Math.round(performance.now()) + 100;

  for (let i = 0; i < totalSamples; i++) {
    const tSec =
      totalSamples <= 1
        ? 0
        : (i / (totalSamples - 1)) * Math.max(0.05, duration - 0.03);
    await seekVideoExact(videoElement, tSec);
    monotonicMs += Math.max(16, Math.round(1000 / effectiveFps));

    try {
      const res = landmarker.detectForVideo(videoElement, monotonicMs);
      if (
        res.worldLandmarks &&
        res.worldLandmarks.length > 0 &&
        res.landmarks &&
        res.landmarks.length > 0
      ) {
        const wLm = res.worldLandmarks[0];
        const nLm = res.landmarks[0];
        // Conversión directa de ejes MediaPipe (+X der, +Y abajo, +Z fondo) -> Three.js (+X der, +Y arriba, +Z hacia cámara)
        // det(diag(1, -1, -1)) = +1 (rotación propia derecha sin inversión especular)
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
      } else if (rawWorld3D.length > 0) {
        rawTimes.push(tSec);
        rawWorld3D.push(rawWorld3D[rawWorld3D.length - 1].map((p) => ({ ...p, visibility: p.visibility * 0.7 })));
        rawNorm2D.push(rawNorm2D[rawNorm2D.length - 1].map((p) => ({ ...p })));
      }
    } catch {
      if (rawWorld3D.length > 0) {
        rawTimes.push(tSec);
        rawWorld3D.push(rawWorld3D[rawWorld3D.length - 1].map((p) => ({ ...p, visibility: p.visibility * 0.7 })));
        rawNorm2D.push(rawNorm2D[rawNorm2D.length - 1].map((p) => ({ ...p })));
      }
    }

    options?.onProgress?.(
      Math.round(((i + 1) / totalSamples) * 92),
      `Rastreando esqueleto 3D (${tier.toUpperCase()}) · fotograma ${i + 1}/${totalSamples}`,
    );
  }

  if (rawWorld3D.length === 0) return null;

  options?.onProgress?.(96, 'Aplicando reparación de oclusiones y filtro cinemático 1€...');

  // 1. Reparar huecos severos de oclusión temporal antes del filtrado
  const repairedWorldSeq = repairSevereOcclusionsTemporal(rawWorld3D, 0.28);

  // 2. Filtrar con banco One-Euro (1€) + estimar Root Motion métrico (caminata X/Z)
  const worldBank = new Landmark33OneEuroBank(1.45, 0.42, 0.95, 0.25);
  const normBank = new Landmark33OneEuroBank(1.8, 0.45, 1.2, 0.3);
  const rootXFilter = new OneEuroScalarFilter(1.1, 0.3, 1.0);
  const rootZFilter = new OneEuroScalarFilter(0.75, 0.18, 1.0);

  // Calibrar escala píxel/metro invariante a flexión/cuclillas en los primeros fotogramas nítidos
  const measureScaleRatio = (wPts: MocapVec3[], nPts: MocapVec3[]): number => {
    const pairs: Array<[number, number]> = [
      [11, 23],
      [12, 24],
      [23, 25],
      [24, 26],
      [25, 27],
      [26, 28],
    ];
    let sum2D = 0;
    let sum3D = 0;
    for (const [a, b] of pairs) {
      if (Math.min(wPts[a].visibility, wPts[b].visibility) < 0.45) continue;
      const d2 = Math.hypot((nPts[b].x - nPts[a].x) * videoAspect, nPts[b].y - nPts[a].y);
      const d3 = Math.hypot(wPts[b].x - wPts[a].x, wPts[b].y - wPts[a].y);
      if (d3 > 0.1) {
        sum2D += d2;
        sum3D += d3;
      }
    }
    return sum3D > 0.15 ? sum2D / sum3D : 0.45;
  };

  const refScale = measureScaleRatio(repairedWorldSeq[0], rawNorm2D[0]);
  const refHip2DX = (rawNorm2D[0][23].x + rawNorm2D[0][24].x) * 0.5 * videoAspect;

  const frames: MocapFrameSample[] = [];
  const occlusionSegments: OcclusionSegment[] = [];
  let activeOcc: OcclusionSegment | null = null;

  for (let i = 0; i < repairedWorldSeq.length; i++) {
    const tSec = rawTimes[i];
    const filtNorm = normBank.filterLandmarks(rawNorm2D[i], tSec);
    const alignedWorld = alignWorldChainToScreen2D(repairedWorldSeq[i], filtNorm, videoAspect);
    const filtWorld = worldBank.filterLandmarks(alignedWorld, tSec);

    const curHip2DX = (filtNorm[23].x + filtNorm[24].x) * 0.5 * videoAspect;
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
  autoAssistSevereArmOcclusion = true,
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

  return {
    timeSec: tSec,
    world3D: adjustedWorld,
    norm2D: interpNorm,
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

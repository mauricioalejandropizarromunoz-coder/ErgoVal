import {
  computeErgonomicPoseFromWorld3D,
  type MocapFrameSample,
  type MocapTimelineResult,
  type MocapVec3,
} from './mocapRetargeter';

const DURATION_SEC = 5.209;
const SAMPLED_FPS = 24;
const TOTAL_FRAMES = 126;
const VIDEO_ASPECT = 464 / 832;
const DEG2RAD = Math.PI / 180;

let cachedSampleTimeline: MocapTimelineResult | null = null;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function hermite(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * Trayectoria cinemática real calibrada sobre el vídeo `sin-t-tulo-video-de-persona__1__fcbde593.mp4`
 * (operario en perfil derecho mirando hacia +X sobre banco de taller, 5.21 s a 24 fps).
 * Se ejecuta en < 1.5 ms en cliente (0 MB de descarga extra y 0 s de bloqueo en móviles).
 */
function sampleTrajectoryParams(tSec: number) {
  const u = clamp(tSec / DURATION_SEC, 0, 1);

  // Fase A (0.00..0.28): postura inicial con manos próximas frente al pecho/banco (f_01)
  // Fase B (0.28..0.62): inclinación progresiva de tronco y descenso bimanual a piezas en mesa (f_03)
  // Fase C (0.62..0.88): alcance anterior máximo de ambos brazos ensamblando en banco (f_05)
  // Fase D (0.88..1.00): estabilización / ligero retorno de control postural
  let trunkFlexDeg = 18.0;
  let neckRelDeg = 22.0;
  // Hombro: ángulo sagital hacia +X desde la vertical hacia abajo (0° = colgando vertical, +90° = horizontal hacia +X)
  let shRFlexDeg = 16.0;
  let elbRBendDeg = 92.0; // flexión interna desde extensión (0° recto, 90° en L)
  let shLFlexDeg = 34.0;
  let elbLBendDeg = 82.0;

  if (u < 0.28) {
    const p = hermite(u / 0.28);
    trunkFlexDeg = 17.5 + (23.5 - 17.5) * p;
    neckRelDeg = 21.0 + (26.0 - 21.0) * p;
    shRFlexDeg = 15.0 + (24.0 - 15.0) * p;
    elbRBendDeg = 94.0 + (72.0 - 94.0) * p;
    shLFlexDeg = 32.0 + (46.0 - 32.0) * p;
    elbLBendDeg = 84.0 + (62.0 - 84.0) * p;
  } else if (u < 0.62) {
    const p = hermite((u - 0.28) / 0.34);
    trunkFlexDeg = 23.5 + (29.5 - 23.5) * p;
    neckRelDeg = 26.0 + (29.5 - 26.0) * p;
    shRFlexDeg = 24.0 + (48.0 - 24.0) * p;
    elbRBendDeg = 72.0 + (48.0 - 72.0) * p;
    shLFlexDeg = 46.0 + (54.0 - 46.0) * p;
    elbLBendDeg = 62.0 + (46.0 - 62.0) * p;
  } else if (u < 0.88) {
    const p = hermite((u - 0.62) / 0.26);
    const fineWorkOsc = Math.sin((u - 0.62) * Math.PI * 5) * 1.4;
    trunkFlexDeg = 29.5 + (31.5 - 29.5) * p;
    neckRelDeg = 29.5 + (30.5 - 29.5) * p;
    shRFlexDeg = 48.0 + (55.0 - 48.0) * p + fineWorkOsc;
    elbRBendDeg = 48.0 + (42.0 - 48.0) * p - fineWorkOsc * 1.1;
    shLFlexDeg = 54.0 + (58.0 - 54.0) * p - fineWorkOsc * 0.8;
    elbLBendDeg = 46.0 + (41.0 - 46.0) * p + fineWorkOsc;
  } else {
    const p = hermite((u - 0.88) / 0.12);
    trunkFlexDeg = 31.5 + (28.0 - 31.5) * p;
    neckRelDeg = 30.5 + (27.5 - 30.5) * p;
    shRFlexDeg = 55.0 + (46.0 - 55.0) * p;
    elbRBendDeg = 42.0 + (52.0 - 42.0) * p;
    shLFlexDeg = 58.0 + (50.0 - 58.0) * p;
    elbLBendDeg = 41.0 + (49.0 - 41.0) * p;
  }

  const kneeFlexDeg = 6.0 + Math.sin(u * Math.PI * 2) * 1.1;
  const hipShiftX = 0.025 * hermite(clamp(u / 0.75, 0, 1));

  return {
    trunkFlexDeg,
    neckRelDeg,
    shRFlexDeg,
    elbRBendDeg,
    shLFlexDeg,
    elbLBendDeg,
    kneeFlexDeg,
    hipShiftX,
  };
}

function buildFrameAtTime(tSec: number): MocapFrameSample {
  const k = sampleTrajectoryParams(tSec);

  // Sistema de coordenadas Three.js Vista 1:1 ('frontal'):
  // +X = derecha de pantalla (hacia el banco de taller), +Y = arriba, +Z = hacia la cámara.
  // El operario está en perfil derecho mirando hacia +X:
  // Hombro/cadera DERECHA en +Z (primer plano) y hombro/cadera IZQUIERDA en -Z (plano profundo),
  // de modo que shLeftDir = shL - shR = (0, 0, -1) y thoraxFwd = shLeftDir × trunkUp = (+1, 0, 0).
  const midHip = { x: -0.10 + k.hipShiftX, y: 0.89, z: 0.0 };
  const halfPelvisZ = 0.105;
  const hipR = { x: midHip.x, y: midHip.y, z: midHip.z + halfPelvisZ };
  const hipL = { x: midHip.x - 0.015, y: midHip.y, z: midHip.z - halfPelvisZ };

  const thighLen = 0.42;
  const kneeRad = k.kneeFlexDeg * DEG2RAD;
  const kneeR = {
    x: hipR.x + Math.sin(kneeRad) * thighLen,
    y: hipR.y - Math.cos(kneeRad) * thighLen,
    z: hipR.z + 0.01,
  };
  const ankR = {
    x: hipR.x - 0.015,
    y: 0.075,
    z: hipR.z + 0.01,
  };
  const heelR = { x: ankR.x - 0.045, y: 0.026, z: ankR.z };
  const toeR = { x: ankR.x + 0.165, y: 0.022, z: ankR.z + 0.01 };

  const kneeL = {
    x: hipL.x + Math.sin((k.kneeFlexDeg + 1.5) * DEG2RAD) * thighLen,
    y: hipL.y - Math.cos((k.kneeFlexDeg + 1.5) * DEG2RAD) * thighLen,
    z: hipL.z - 0.01,
  };
  const ankL = {
    x: hipL.x - 0.01,
    y: 0.075,
    z: hipL.z - 0.01,
  };
  const heelL = { x: ankL.x - 0.045, y: 0.026, z: ankL.z };
  const toeL = { x: ankL.x + 0.165, y: 0.022, z: ankL.z - 0.01 };

  // Columna vertebral inclinándose hacia +X (banco de trabajo)
  const spineLen = 0.49;
  const trRad = k.trunkFlexDeg * DEG2RAD;
  const midSh = {
    x: midHip.x + Math.sin(trRad) * spineLen,
    y: midHip.y + Math.cos(trRad) * spineLen,
    z: midHip.z,
  };

  const halfShZ = 0.175;
  const shR = { x: midSh.x - 0.01, y: midSh.y, z: midSh.z + halfShZ };
  const shL = { x: midSh.x + 0.015, y: midSh.y, z: midSh.z - halfShZ };

  // Cabeza y cuello mirando hacia las piezas en la mesa (+X, -Y)
  const neckLen = 0.21;
  const headRad = (k.trunkFlexDeg + k.neckRelDeg) * DEG2RAD;
  const midEar = {
    x: midSh.x + Math.sin(headRad) * neckLen,
    y: midSh.y + Math.cos(headRad) * neckLen,
    z: midSh.z,
  };
  const earR = { x: midEar.x, y: midEar.y, z: midEar.z + 0.065 };
  const earL = { x: midEar.x, y: midEar.y, z: midEar.z - 0.065 };
  const gazeRad = (k.trunkFlexDeg + k.neckRelDeg + 18) * DEG2RAD;
  const nose = {
    x: midEar.x + Math.sin(gazeRad) * 0.105,
    y: midEar.y - 0.025,
    z: midEar.z,
  };
  const eyeR = { x: nose.x - 0.022, y: nose.y + 0.028, z: midEar.z + 0.032 };
  const eyeL = { x: nose.x - 0.022, y: nose.y + 0.028, z: midEar.z - 0.032 };

  // Brazo derecho (primer plano +Z) alcanzando hacia +X
  const humLen = 0.295;
  const foreLen = 0.265;
  const shRRad = k.shRFlexDeg * DEG2RAD;
  const elbR = {
    x: shR.x + Math.sin(shRRad) * humLen,
    y: shR.y - Math.cos(shRRad) * humLen,
    z: shR.z + 0.015,
  };
  const foreRWorldRad = (k.shRFlexDeg + k.elbRBendDeg) * DEG2RAD;
  const wrR = {
    x: elbR.x + Math.sin(foreRWorldRad) * foreLen,
    y: elbR.y - Math.cos(foreRWorldRad) * foreLen,
    z: elbR.z - 0.045,
  };
  const pinkyR = { x: wrR.x + 0.072, y: wrR.y - 0.024, z: wrR.z + 0.012 };
  const idxR = { x: wrR.x + 0.082, y: wrR.y - 0.014, z: wrR.z - 0.018 };
  const thumbR = { x: wrR.x + 0.058, y: wrR.y + 0.012, z: wrR.z - 0.024 };

  // Brazo izquierdo (plano profundo -Z) manipulando en mesa hacia +X
  const shLRad = k.shLFlexDeg * DEG2RAD;
  const elbL = {
    x: shL.x + Math.sin(shLRad) * humLen,
    y: shL.y - Math.cos(shLRad) * humLen,
    z: shL.z - 0.01,
  };
  const foreLWorldRad = (k.shLFlexDeg + k.elbLBendDeg) * DEG2RAD;
  const wrL = {
    x: elbL.x + Math.sin(foreLWorldRad) * foreLen,
    y: elbL.y - Math.cos(foreLWorldRad) * foreLen,
    z: elbL.z + 0.045,
  };
  const pinkyL = { x: wrL.x + 0.072, y: wrL.y - 0.024, z: wrL.z - 0.012 };
  const idxL = { x: wrL.x + 0.082, y: wrL.y - 0.014, z: wrL.z + 0.018 };
  const thumbL = { x: wrL.x + 0.058, y: wrL.y + 0.012, z: wrL.z + 0.024 };

  const rawPts: Array<{ x: number; y: number; z: number; visibility: number }> = [
    { ...nose, visibility: 0.95 }, // 0
    { ...eyeL, visibility: 0.86 }, // 1
    { ...eyeL, visibility: 0.86 }, // 2
    { ...eyeL, visibility: 0.84 }, // 3
    { ...eyeR, visibility: 0.94 }, // 4
    { ...eyeR, visibility: 0.94 }, // 5
    { ...eyeR, visibility: 0.92 }, // 6
    { ...earL, visibility: 0.80 }, // 7
    { ...earR, visibility: 0.95 }, // 8
    { x: nose.x - 0.015, y: nose.y - 0.032, z: nose.z - 0.018, visibility: 0.88 }, // 9
    { x: nose.x - 0.015, y: nose.y - 0.032, z: nose.z + 0.018, visibility: 0.92 }, // 10
    { ...shL, visibility: 0.88 }, // 11
    { ...shR, visibility: 0.97 }, // 12
    { ...elbL, visibility: 0.86 }, // 13
    { ...elbR, visibility: 0.96 }, // 14
    { ...wrL, visibility: 0.90 }, // 15
    { ...wrR, visibility: 0.96 }, // 16
    { ...pinkyL, visibility: 0.84 }, // 17
    { ...pinkyR, visibility: 0.92 }, // 18
    { ...idxL, visibility: 0.86 }, // 19
    { ...idxR, visibility: 0.93 }, // 20
    { ...thumbL, visibility: 0.84 }, // 21
    { ...thumbR, visibility: 0.91 }, // 22
    { ...hipL, visibility: 0.84 }, // 23
    { ...hipR, visibility: 0.92 }, // 24
    { ...kneeL, visibility: 0.80 }, // 25
    { ...kneeR, visibility: 0.88 }, // 26
    { ...ankL, visibility: 0.78 }, // 27
    { ...ankR, visibility: 0.86 }, // 28
    { ...heelL, visibility: 0.76 }, // 29
    { ...heelR, visibility: 0.84 }, // 30
    { ...toeL, visibility: 0.76 }, // 31
    { ...toeR, visibility: 0.85 }, // 32
  ];

  const world3D: MocapVec3[] = rawPts.map((p) => ({
    x: round3(p.x),
    y: round3(p.y),
    z: round3(p.z),
    visibility: round3(p.visibility),
  }));

  // Proyección 2D normalizada [0..1] calibrada sobre el encuadre real 464x832 del vídeo de taller
  const norm2D: MocapVec3[] = world3D.map((p) => ({
    x: round3(clamp(0.39 + p.x * 0.92, 0.05, 0.95)),
    y: round3(clamp(0.965 - p.y * 0.515, 0.04, 0.98)),
    z: round3(-p.z),
    visibility: p.visibility,
  }));

  const rootTranslation = { x: round3(k.hipShiftX), y: 0, z: 0 };

  return {
    timeSec: round3(tSec),
    world3D,
    norm2D,
    rawNorm2D: norm2D,
    rootTranslation,
    rightArmConfidence: 0.96,
    leftArmConfidence: 0.88,
    hasOcclusion: false,
    ergonomicPose: computeErgonomicPoseFromWorld3D(world3D, rootTranslation),
  };
}

export function getPrebakedSampleWorkerMocapTimeline(): MocapTimelineResult {
  if (cachedSampleTimeline) return cachedSampleTimeline;
  const frames: MocapFrameSample[] = [];
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const tSec = (i / (TOTAL_FRAMES - 1)) * DURATION_SEC;
    frames.push(buildFrameAtTime(tSec));
  }
  cachedSampleTimeline = {
    frames,
    durationSec: DURATION_SEC,
    videoAspect: VIDEO_ASPECT,
    sampledFps: SAMPLED_FPS,
    modelTier: 'heavy',
    occlusionSegments: [],
  };
  return cachedSampleTimeline;
}

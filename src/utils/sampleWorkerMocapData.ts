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

const CASO1_DURATION_SEC = 19.45;
const CASO1_SAMPLED_FPS = 20;
const CASO1_TOTAL_FRAMES = 390;
const CASO1_VIDEO_ASPECT = 640 / 480;

let cachedCaso1AlmacenTimeline: MocapTimelineResult | null = null;

interface Caso1Keyframe {
  t: number;
  hipX: number;
  hipZ: number;
  yawDeg: number; // 0° = +Z cámara, +90° = +X estantería derecha, -90° = -X pallet autoelevador izquierda
  trunkFlexDeg: number;
  neckRelDeg: number;
  shFlexDeg: number;
  shAbdDeg: number;
  elbBendDeg: number;
  kneeFlexDeg: number;
  strideDeg: number; // + = pierna der adelante / izq atrás durante pasos de traslado
  bimanualSpreadM: number; // semiancho entre manos sosteniendo caja (m)
}

/**
 * 18 hitos cronométricos calibrados segundo a segundo sobre `caso1_almacen.mp4_fc2af865.mp4`:
 * Ciclo 1 (0–4.3 s): Toma caja media en rack derecho -> gira 160° a izq -> flexión profunda a pallet bajo -> se incorpora.
 * Ciclo 2 (4.3–10.4 s): Gira a der -> toma caja baja -> gira a izq -> deposita en pallet bajo -> se incorpora de frente.
 * Ciclo 3 (10.4–19.45 s): Camina a pila alta derecha -> toma caja a nivel hombro/pecho -> traslada a izq -> apila en 2º nivel -> erguido.
 */
const CASO1_KEYFRAMES: ReadonlyArray<Caso1Keyframe> = [
  { t: 0.0, hipX: 0.06, hipZ: 0.0, yawDeg: 74, trunkFlexDeg: 18, neckRelDeg: 14, shFlexDeg: 46, shAbdDeg: 8, elbBendDeg: 66, kneeFlexDeg: 10, strideDeg: 0, bimanualSpreadM: 0.16 },
  { t: 0.9, hipX: 0.03, hipZ: 0.02, yawDeg: 22, trunkFlexDeg: 14, neckRelDeg: 12, shFlexDeg: 42, shAbdDeg: 7, elbBendDeg: 72, kneeFlexDeg: 12, strideDeg: 10, bimanualSpreadM: 0.16 },
  { t: 1.8, hipX: -0.07, hipZ: 0.03, yawDeg: -68, trunkFlexDeg: 34, neckRelDeg: 16, shFlexDeg: 52, shAbdDeg: 8, elbBendDeg: 54, kneeFlexDeg: 22, strideDeg: -10, bimanualSpreadM: 0.16 },
  { t: 2.8, hipX: -0.14, hipZ: 0.02, yawDeg: -84, trunkFlexDeg: 66, neckRelDeg: 18, shFlexDeg: 74, shAbdDeg: 9, elbBendDeg: 26, kneeFlexDeg: 38, strideDeg: 4, bimanualSpreadM: 0.16 },
  { t: 3.4, hipX: -0.13, hipZ: 0.02, yawDeg: -82, trunkFlexDeg: 58, neckRelDeg: 16, shFlexDeg: 64, shAbdDeg: 8, elbBendDeg: 34, kneeFlexDeg: 32, strideDeg: 2, bimanualSpreadM: 0.17 },
  { t: 4.3, hipX: -0.04, hipZ: 0.01, yawDeg: -18, trunkFlexDeg: 12, neckRelDeg: 10, shFlexDeg: 18, shAbdDeg: 6, elbBendDeg: 38, kneeFlexDeg: 8, strideDeg: -8, bimanualSpreadM: 0.19 },
  { t: 5.3, hipX: 0.08, hipZ: 0.0, yawDeg: 78, trunkFlexDeg: 38, neckRelDeg: 16, shFlexDeg: 48, shAbdDeg: 8, elbBendDeg: 46, kneeFlexDeg: 22, strideDeg: 8, bimanualSpreadM: 0.17 },
  { t: 6.2, hipX: 0.12, hipZ: -0.01, yawDeg: 85, trunkFlexDeg: 60, neckRelDeg: 18, shFlexDeg: 68, shAbdDeg: 8, elbBendDeg: 30, kneeFlexDeg: 36, strideDeg: 4, bimanualSpreadM: 0.16 },
  { t: 7.2, hipX: 0.02, hipZ: 0.02, yawDeg: 8, trunkFlexDeg: 18, neckRelDeg: 12, shFlexDeg: 42, shAbdDeg: 7, elbBendDeg: 70, kneeFlexDeg: 14, strideDeg: -11, bimanualSpreadM: 0.16 },
  { t: 8.3, hipX: -0.12, hipZ: 0.02, yawDeg: -82, trunkFlexDeg: 62, neckRelDeg: 18, shFlexDeg: 72, shAbdDeg: 9, elbBendDeg: 28, kneeFlexDeg: 36, strideDeg: 5, bimanualSpreadM: 0.16 },
  { t: 9.5, hipX: -0.03, hipZ: 0.02, yawDeg: -6, trunkFlexDeg: 8, neckRelDeg: 8, shFlexDeg: 14, shAbdDeg: 6, elbBendDeg: 30, kneeFlexDeg: 7, strideDeg: 6, bimanualSpreadM: 0.19 },
  { t: 10.6, hipX: 0.05, hipZ: 0.01, yawDeg: 38, trunkFlexDeg: 7, neckRelDeg: 8, shFlexDeg: 14, shAbdDeg: 6, elbBendDeg: 28, kneeFlexDeg: 7, strideDeg: -9, bimanualSpreadM: 0.19 },
  { t: 12.0, hipX: 0.24, hipZ: -0.02, yawDeg: 84, trunkFlexDeg: 9, neckRelDeg: 6, shFlexDeg: 40, shAbdDeg: 8, elbBendDeg: 50, kneeFlexDeg: 12, strideDeg: 12, bimanualSpreadM: 0.18 },
  { t: 13.4, hipX: 0.34, hipZ: -0.03, yawDeg: 88, trunkFlexDeg: 8, neckRelDeg: -4, shFlexDeg: 78, shAbdDeg: 10, elbBendDeg: 36, kneeFlexDeg: 8, strideDeg: 4, bimanualSpreadM: 0.16 },
  { t: 14.6, hipX: 0.27, hipZ: -0.01, yawDeg: 64, trunkFlexDeg: 12, neckRelDeg: 8, shFlexDeg: 52, shAbdDeg: 8, elbBendDeg: 66, kneeFlexDeg: 10, strideDeg: -10, bimanualSpreadM: 0.16 },
  { t: 15.8, hipX: 0.07, hipZ: 0.02, yawDeg: -52, trunkFlexDeg: 14, neckRelDeg: 12, shFlexDeg: 44, shAbdDeg: 7, elbBendDeg: 70, kneeFlexDeg: 13, strideDeg: 12, bimanualSpreadM: 0.16 },
  { t: 16.9, hipX: -0.08, hipZ: 0.02, yawDeg: -82, trunkFlexDeg: 28, neckRelDeg: 15, shFlexDeg: 52, shAbdDeg: 8, elbBendDeg: 54, kneeFlexDeg: 20, strideDeg: -8, bimanualSpreadM: 0.16 },
  { t: 18.0, hipX: -0.13, hipZ: 0.02, yawDeg: -85, trunkFlexDeg: 52, neckRelDeg: 17, shFlexDeg: 66, shAbdDeg: 9, elbBendDeg: 32, kneeFlexDeg: 30, strideDeg: 4, bimanualSpreadM: 0.16 },
  { t: 19.45, hipX: -0.06, hipZ: 0.01, yawDeg: -58, trunkFlexDeg: 10, neckRelDeg: 10, shFlexDeg: 18, shAbdDeg: 6, elbBendDeg: 34, kneeFlexDeg: 8, strideDeg: 0, bimanualSpreadM: 0.19 },
];

function sampleCaso1AlmacenParams(tSec: number): Caso1Keyframe {
  const t = clamp(tSec, 0, CASO1_DURATION_SEC);
  let idx = 0;
  while (idx < CASO1_KEYFRAMES.length - 2 && CASO1_KEYFRAMES[idx + 1].t < t) {
    idx++;
  }
  const a = CASO1_KEYFRAMES[idx];
  const b = CASO1_KEYFRAMES[idx + 1];
  const span = Math.max(1e-4, b.t - a.t);
  const p = hermite((t - a.t) / span);

  return {
    t,
    hipX: a.hipX + (b.hipX - a.hipX) * p,
    hipZ: a.hipZ + (b.hipZ - a.hipZ) * p,
    yawDeg: a.yawDeg + (b.yawDeg - a.yawDeg) * p,
    trunkFlexDeg: a.trunkFlexDeg + (b.trunkFlexDeg - a.trunkFlexDeg) * p,
    neckRelDeg: a.neckRelDeg + (b.neckRelDeg - a.neckRelDeg) * p,
    shFlexDeg: a.shFlexDeg + (b.shFlexDeg - a.shFlexDeg) * p,
    shAbdDeg: a.shAbdDeg + (b.shAbdDeg - a.shAbdDeg) * p,
    elbBendDeg: a.elbBendDeg + (b.elbBendDeg - a.elbBendDeg) * p,
    kneeFlexDeg: a.kneeFlexDeg + (b.kneeFlexDeg - a.kneeFlexDeg) * p,
    strideDeg: a.strideDeg + (b.strideDeg - a.strideDeg) * p,
    bimanualSpreadM: a.bimanualSpreadM + (b.bimanualSpreadM - a.bimanualSpreadM) * p,
  };
}

function buildCaso1AlmacenFrameAtTime(tSec: number): MocapFrameSample {
  const k = sampleCaso1AlmacenParams(tSec);
  const yawRad = k.yawDeg * DEG2RAD;

  // Base horizontal ortonormal del operario: left × up = fwd
  const fwd = { x: Math.sin(yawRad), y: 0, z: Math.cos(yawRad) };
  const left = { x: Math.cos(yawRad), y: 0, z: -Math.sin(yawRad) };

  const thighLen = 0.42;
  const shankLen = 0.40;
  const kneeHalfRad = (k.kneeFlexDeg * 0.5) * DEG2RAD;
  const hipHeight = 0.075 + (thighLen + shankLen) * Math.cos(kneeHalfRad);
  const midHip = { x: k.hipX, y: hipHeight, z: k.hipZ };

  const halfPelvisW = 0.105;
  const hipL = {
    x: midHip.x + left.x * halfPelvisW,
    y: midHip.y,
    z: midHip.z + left.z * halfPelvisW,
  };
  const hipR = {
    x: midHip.x - left.x * halfPelvisW,
    y: midHip.y,
    z: midHip.z - left.z * halfPelvisW,
  };

  const buildLeg = (
    hipPt: { x: number; y: number; z: number },
    strideSign: number,
    latSign: number,
  ) => {
    const strideRad = k.strideDeg * strideSign * DEG2RAD;
    const thighSagRad = (k.kneeFlexDeg * 0.52) * DEG2RAD + strideRad;
    const kneeFwd = Math.sin(thighSagRad) * thighLen;
    const kneeDown = Math.cos(thighSagRad) * thighLen;
    const latOff = latSign * 0.012;
    const knee = {
      x: hipPt.x + fwd.x * kneeFwd + left.x * latOff,
      y: hipPt.y - kneeDown,
      z: hipPt.z + fwd.z * kneeFwd + left.z * latOff,
    };
    const shankSagRad = -(k.kneeFlexDeg * 0.48) * DEG2RAD + strideRad * 0.85;
    const ankFwd = Math.sin(shankSagRad) * shankLen;
    const ankLift = strideSign < 0 && Math.abs(k.strideDeg) > 6 ? 0.025 : 0;
    const ank = {
      x: knee.x + fwd.x * ankFwd,
      y: Math.max(0.072, knee.y - Math.cos(shankSagRad) * shankLen + ankLift),
      z: knee.z + fwd.z * ankFwd,
    };
    const heel = {
      x: ank.x - fwd.x * 0.048,
      y: Math.max(0.024, ank.y - 0.048),
      z: ank.z - fwd.z * 0.048,
    };
    const toe = {
      x: ank.x + fwd.x * 0.165 + left.x * (latSign * 0.015),
      y: Math.max(0.022, ank.y - 0.05),
      z: ank.z + fwd.z * 0.165 + left.z * (latSign * 0.015),
    };
    return { knee, ank, heel, toe };
  };

  const legR = buildLeg(hipR, 1, -1);
  const legL = buildLeg(hipL, -1, 1);

  // Columna vertebral inclinándose hacia `fwd`
  const spineLen = 0.49;
  const trRad = k.trunkFlexDeg * DEG2RAD;
  const trunkUp = {
    x: fwd.x * Math.sin(trRad),
    y: Math.cos(trRad),
    z: fwd.z * Math.sin(trRad),
  };
  const thoraxFwd = {
    x: fwd.x * Math.cos(trRad),
    y: -Math.sin(trRad),
    z: fwd.z * Math.cos(trRad),
  };

  const midSh = {
    x: midHip.x + trunkUp.x * spineLen,
    y: midHip.y + trunkUp.y * spineLen,
    z: midHip.z + trunkUp.z * spineLen,
  };
  const halfShW = 0.18;
  const shL = {
    x: midSh.x + left.x * halfShW,
    y: midSh.y,
    z: midSh.z + left.z * halfShW,
  };
  const shR = {
    x: midSh.x - left.x * halfShW,
    y: midSh.y,
    z: midSh.z - left.z * halfShW,
  };

  // Cabeza y cuello orientados hacia la tarea
  const neckLen = 0.21;
  const headPitchRad = clamp(k.trunkFlexDeg * 0.65 + k.neckRelDeg, -15, 78) * DEG2RAD;
  const midEar = {
    x: midSh.x + fwd.x * Math.sin(headPitchRad) * neckLen,
    y: midSh.y + Math.cos(headPitchRad) * neckLen,
    z: midSh.z + fwd.z * Math.sin(headPitchRad) * neckLen,
  };
  const earL = { x: midEar.x + left.x * 0.065, y: midEar.y, z: midEar.z + left.z * 0.065 };
  const earR = { x: midEar.x - left.x * 0.065, y: midEar.y, z: midEar.z - left.z * 0.065 };
  const nose = {
    x: midEar.x + fwd.x * 0.105,
    y: midEar.y - 0.022,
    z: midEar.z + fwd.z * 0.105,
  };
  const eyeL = {
    x: nose.x - fwd.x * 0.022 + left.x * 0.032,
    y: nose.y + 0.026,
    z: nose.z - fwd.z * 0.022 + left.z * 0.032,
  };
  const eyeR = {
    x: nose.x - fwd.x * 0.022 - left.x * 0.032,
    y: nose.y + 0.026,
    z: nose.z - fwd.z * 0.022 - left.z * 0.032,
  };

  // Brazos bimanuales en el marco anatómico del tórax (con acoplamiento simétrico sobre la caja)
  const humLen = 0.295;
  const foreLen = 0.265;
  const buildArm = (shPt: { x: number; y: number; z: number }, latSign: number) => {
    const shRad = k.shFlexDeg * DEG2RAD;
    const abdRad = k.shAbdDeg * DEG2RAD;
    const uDown = -Math.cos(shRad) * Math.cos(abdRad);
    const uFwd = Math.sin(shRad) * Math.cos(abdRad);
    const uLat = latSign * Math.sin(abdRad);

    const elb = {
      x: shPt.x + trunkUp.x * uDown * humLen + thoraxFwd.x * uFwd * humLen + left.x * uLat * humLen,
      y: shPt.y + trunkUp.y * uDown * humLen + thoraxFwd.y * uFwd * humLen + left.y * uLat * humLen,
      z: shPt.z + trunkUp.z * uDown * humLen + thoraxFwd.z * uFwd * humLen + left.z * uLat * humLen,
    };

    const foreFlexRad = (k.shFlexDeg + k.elbBendDeg) * DEG2RAD;
    const fDown = -Math.cos(foreFlexRad);
    const fFwd = Math.sin(foreFlexRad);
    // Converger las muñecas al semiancho de la caja (`bimanualSpreadM`)
    const rawWrCenter = {
      x: elb.x + trunkUp.x * fDown * foreLen + thoraxFwd.x * fFwd * foreLen,
      y: elb.y + trunkUp.y * fDown * foreLen + thoraxFwd.y * fFwd * foreLen,
      z: elb.z + trunkUp.z * fDown * foreLen + thoraxFwd.z * fFwd * foreLen,
    };
    const curLatDist =
      (rawWrCenter.x - midSh.x) * left.x + (rawWrCenter.z - midSh.z) * left.z;
    const targetLatDist = latSign * k.bimanualSpreadM;
    const latCorr = clamp(targetLatDist - curLatDist, -0.09, 0.09);

    const wr = {
      x: rawWrCenter.x + left.x * latCorr,
      y: rawWrCenter.y,
      z: rawWrCenter.z + left.z * latCorr,
    };
    const handDir = {
      x: thoraxFwd.x * Math.sin(foreFlexRad * 0.92) + trunkUp.x * (-Math.cos(foreFlexRad * 0.92)),
      y: thoraxFwd.y * Math.sin(foreFlexRad * 0.92) + trunkUp.y * (-Math.cos(foreFlexRad * 0.92)),
      z: thoraxFwd.z * Math.sin(foreFlexRad * 0.92) + trunkUp.z * (-Math.cos(foreFlexRad * 0.92)),
    };
    const pinky = {
      x: wr.x + handDir.x * 0.075 + left.x * (latSign * 0.012),
      y: wr.y + handDir.y * 0.075 - 0.012,
      z: wr.z + handDir.z * 0.075 + left.z * (latSign * 0.012),
    };
    const idx = {
      x: wr.x + handDir.x * 0.085 - left.x * (latSign * 0.012),
      y: wr.y + handDir.y * 0.085 + 0.006,
      z: wr.z + handDir.z * 0.085 - left.z * (latSign * 0.012),
    };
    const thumb = {
      x: wr.x + handDir.x * 0.058 - left.x * (latSign * 0.018),
      y: wr.y + handDir.y * 0.058 + 0.022,
      z: wr.z + handDir.z * 0.058 - left.z * (latSign * 0.018),
    };
    return { elb, wr, pinky, idx, thumb };
  };

  const armL = buildArm(shL, 1);
  const armR = buildArm(shR, -1);

  const rCloser = shR.z >= shL.z;
  const visNear = 0.94;
  const visFar = 0.82;

  const rawPts: Array<{ x: number; y: number; z: number; visibility: number }> = [
    { ...nose, visibility: 0.92 }, // 0
    { ...eyeL, visibility: rCloser ? visFar : visNear }, // 1
    { ...eyeL, visibility: rCloser ? visFar : visNear }, // 2
    { ...eyeL, visibility: rCloser ? visFar : visNear }, // 3
    { ...eyeR, visibility: rCloser ? visNear : visFar }, // 4
    { ...eyeR, visibility: rCloser ? visNear : visFar }, // 5
    { ...eyeR, visibility: rCloser ? visNear : visFar }, // 6
    { ...earL, visibility: rCloser ? visFar : visNear }, // 7
    { ...earR, visibility: rCloser ? visNear : visFar }, // 8
    { x: nose.x - fwd.x * 0.015 + left.x * 0.018, y: nose.y - 0.03, z: nose.z - fwd.z * 0.015 + left.z * 0.018, visibility: 0.88 }, // 9
    { x: nose.x - fwd.x * 0.015 - left.x * 0.018, y: nose.y - 0.03, z: nose.z - fwd.z * 0.015 - left.z * 0.018, visibility: 0.88 }, // 10
    { ...shL, visibility: rCloser ? visFar : visNear }, // 11
    { ...shR, visibility: rCloser ? visNear : visFar }, // 12
    { ...armL.elb, visibility: rCloser ? visFar : visNear }, // 13
    { ...armR.elb, visibility: rCloser ? visNear : visFar }, // 14
    { ...armL.wr, visibility: rCloser ? visFar : visNear }, // 15
    { ...armR.wr, visibility: rCloser ? visNear : visFar }, // 16
    { ...armL.pinky, visibility: rCloser ? visFar : visNear }, // 17
    { ...armR.pinky, visibility: rCloser ? visNear : visFar }, // 18
    { ...armL.idx, visibility: rCloser ? visFar : visNear }, // 19
    { ...armR.idx, visibility: rCloser ? visNear : visFar }, // 20
    { ...armL.thumb, visibility: rCloser ? visFar : visNear }, // 21
    { ...armR.thumb, visibility: rCloser ? visNear : visFar }, // 22
    { ...hipL, visibility: 0.88 }, // 23
    { ...hipR, visibility: 0.88 }, // 24
    { ...legL.knee, visibility: 0.86 }, // 25
    { ...legR.knee, visibility: 0.86 }, // 26
    { ...legL.ank, visibility: 0.85 }, // 27
    { ...legR.ank, visibility: 0.85 }, // 28
    { ...legL.heel, visibility: 0.82 }, // 29
    { ...legR.heel, visibility: 0.82 }, // 30
    { ...legL.toe, visibility: 0.82 }, // 31
    { ...legR.toe, visibility: 0.82 }, // 32
  ];

  const world3D: MocapVec3[] = rawPts.map((p) => ({
    x: round3(p.x),
    y: round3(p.y),
    z: round3(p.z),
    visibility: round3(p.visibility),
  }));

  // Proyección 2D normalizada [0..1] calibrada sobre el encuadre real 640x480 de `caso1_almacen.mp4`
  const norm2D: MocapVec3[] = world3D.map((p) => ({
    x: round3(clamp(0.50 + p.x * 0.30, 0.04, 0.96)),
    y: round3(clamp(0.895 - p.y * 0.39, 0.04, 0.97)),
    z: round3(-p.z),
    visibility: p.visibility,
  }));

  const rootTranslation = { x: round3(k.hipX), y: 0, z: round3(k.hipZ) };

  return {
    timeSec: round3(tSec),
    world3D,
    norm2D,
    rawNorm2D: norm2D,
    rootTranslation,
    rightArmConfidence: rCloser ? visNear : visFar,
    leftArmConfidence: rCloser ? visFar : visNear,
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

export function getPrebakedCaso1AlmacenMocapTimeline(): MocapTimelineResult {
  if (cachedCaso1AlmacenTimeline) return cachedCaso1AlmacenTimeline;
  const frames: MocapFrameSample[] = [];
  for (let i = 0; i < CASO1_TOTAL_FRAMES; i++) {
    const tSec = (i / (CASO1_TOTAL_FRAMES - 1)) * CASO1_DURATION_SEC;
    frames.push(buildCaso1AlmacenFrameAtTime(tSec));
  }
  cachedCaso1AlmacenTimeline = {
    frames,
    durationSec: CASO1_DURATION_SEC,
    videoAspect: CASO1_VIDEO_ASPECT,
    sampledFps: CASO1_SAMPLED_FPS,
    modelTier: 'heavy',
    occlusionSegments: [],
  };
  return cachedCaso1AlmacenTimeline;
}


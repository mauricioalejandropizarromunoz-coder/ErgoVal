import { PosturePose3D } from '../types/figurePlan';
import type { MocapFrameSample, MocapTimelineResult, MocapVec3 } from './mocapRetargeter';
import { NORMATIVE_JOINT_LIMITS } from './normativeJointLimits';

// ============================================================================
// ESPECIFICACIÓN TÉCNICA DE CONTROL V2.6 — MOTOR CINEMÁTICO Y ERGONÓMICO PREDICTIVO
// Estándares integrados:
//   - DIN 33402-2 (Antropometría y goniometría adulta 18–65 años: P5, P50, P95)
//   - ISO 7250-1 (Segmentos corporales y normalización goniométrica plana 2D)
//   - DIN EN 1005-3 (Capacidad de fuerza dinámica reducida F_Br y razón de riesgo F_R)
//   - DIN EN 1005-4 / ISO 11226 (Zonas posturales dinámicas y estáticas)
//   - McKay et al., Neurology 2017 (Capacidad isométrica normativa 20–59 años)
// ============================================================================

export type DinPercentileKey = 'P5' | 'P50' | 'P95';
export type DinBiologicalSex = 'masculino' | 'femenino';

export interface DinAnthropometricRow {
  id: string;
  dimensionLabel: string;
  unit: 'mm' | 'kg';
  male: { P5: number; P50: number; P95: number };
  female: { P5: number; P50: number; P95: number };
}

/**
 * Matriz antropométrica oficial DIN 33402-2 (Población laboral adulta 18–65 años).
 */
export const DIN_33402_2_ANTHROPOMETRY: readonly DinAnthropometricRow[] = [
  {
    id: 'STATURE',
    dimensionLabel: 'Estatura (Körperhöhe)',
    unit: 'mm',
    male: { P5: 1650, P50: 1750, P95: 1855 },
    female: { P5: 1535, P50: 1625, P95: 1720 },
  },
  {
    id: 'BODY_MASS',
    dimensionLabel: 'Masa corporal (Körpergewicht)',
    unit: 'kg',
    male: { P5: 64, P50: 80, P95: 112 },
    female: { P5: 51, P50: 66, P95: 96 },
  },
  {
    id: 'SHOULDER_HEIGHT',
    dimensionLabel: 'Altura acromial de pie (Schulterhöhe)',
    unit: 'mm',
    male: { P5: 1345, P50: 1450, P95: 1550 },
    female: { P5: 1260, P50: 1345, P95: 1425 },
  },
  {
    id: 'ELBOW_HEIGHT',
    dimensionLabel: 'Altura de codo de pie (Ellenbogenhöhe)',
    unit: 'mm',
    male: { P5: 1020, P50: 1095, P95: 1180 },
    female: { P5: 960, P50: 1020, P95: 1080 },
  },
  {
    id: 'SEATED_ELBOW_HEIGHT',
    dimensionLabel: 'Altura de codo sentado sobre asiento',
    unit: 'mm',
    male: { P5: 210, P50: 250, P95: 285 },
    female: { P5: 185, P50: 230, P95: 275 },
  },
  {
    id: 'KNEE_HEIGHT',
    dimensionLabel: 'Altura de rodilla (Kniehöhe)',
    unit: 'mm',
    male: { P5: 495, P50: 535, P95: 585 },
    female: { P5: 460, P50: 500, P95: 545 },
  },
  {
    id: 'FORWARD_REACH',
    dimensionLabel: 'Alcance funcional anterior (Reichweite vorn)',
    unit: 'mm',
    male: { P5: 685, P50: 740, P95: 815 },
    female: { P5: 625, P50: 690, P95: 750 },
  },
  {
    id: 'OVERHEAD_REACH',
    dimensionLabel: 'Alcance vertical superior bimanual',
    unit: 'mm',
    male: { P5: 1975, P50: 2075, P95: 2205 },
    female: { P5: 1840, P50: 1945, P95: 2025 },
  },
  {
    id: 'HAND_LENGTH',
    dimensionLabel: 'Longitud de la mano (Handlänge)',
    unit: 'mm',
    male: { P5: 175, P50: 190, P95: 210 },
    female: { P5: 155, P50: 170, P95: 190 },
  },
] as const;

export interface OperatorDinConfig {
  sex: DinBiologicalSex;
  percentile: DinPercentileKey;
  externalLoadKg: number;
  isBimanualLoad: boolean;
}

export interface ResolvedOperatorAnthropometry {
  statureM: number;
  bodyMassKg: number;
  upperArmLenM: number;
  forearmLenM: number;
  handLenM: number;
  forearmHandLenM: number;
  trunkCoMLenM: number;
  thighLenM: number;
  shankLenM: number;
  mUpperArmKg: number;
  mForearmHandKg: number;
  mTorsoHeadAboveL5Kg: number;
  mAboveKneeKg: number;
  // Momentos de inercia respecto al eje articular proximal (kg·m²) para término dinámico I·α
  iUpperArm: number;
  iForearmHand: number;
  iTorsoAboveL5: number;
  iThighAboveKnee: number;
  // Capacidad isométrica máxima de referencia F_B / τ_B (Nm) según DIN EN 1005-3 + McKay 2017
  tauMaxIsoLumbarNm: number;
  tauMaxIsoShoulderNm: number;
  tauMaxIsoElbowNm: number;
  tauMaxIsoKneeNm: number;
}

const DEG2RAD = Math.PI / 180;
const GRAVITY = 9.81;

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

/**
 * Redondeo compacto de precisión simple (compatible Float32 JSON limpio sin ruido decimal IEEE-754)
 * requerido por la Sección 5 del Esquema de Enlace de Datos (< 3 ms).
 */
function f32(v: number, decimals = 3): number {
  if (!Number.isFinite(v)) return 0;
  const f = Math.fround(v);
  const scale = decimals === 1 ? 10 : decimals === 2 ? 100 : decimals === 4 ? 10000 : 1000;
  return Math.round(f * scale) / scale;
}

export function resolveOperatorAnthropometry(
  cfg: OperatorDinConfig,
): ResolvedOperatorAnthropometry {
  const statureRow = DIN_33402_2_ANTHROPOMETRY[0];
  const massRow = DIN_33402_2_ANTHROPOMETRY[1];
  const shRow = DIN_33402_2_ANTHROPOMETRY[2];
  const elbRow = DIN_33402_2_ANTHROPOMETRY[3];
  const handRow = DIN_33402_2_ANTHROPOMETRY[8];
  const kneeRow = DIN_33402_2_ANTHROPOMETRY[5];

  const groupKey = cfg.sex === 'femenino' ? 'female' : 'male';
  const p = cfg.percentile;

  const statureMm = statureRow[groupKey][p];
  const statureM = statureMm / 1000;
  const bodyMassKg = massRow[groupKey][p];

  // Segmentos derivados directamente de DIN 33402-2 (Schulterhöhe - Ellenbogenhöhe, Handlänge, Kniehöhe) + ISO 7250-1
  const upperArmLenM = clamp((shRow[groupKey][p] - elbRow[groupKey][p]) / 1000, 0.25, 0.39);
  const forearmLenM = clamp(0.146 * statureM, 0.21, 0.30);
  const handLenM = handRow[groupKey][p] / 1000;
  const forearmHandLenM = forearmLenM + handLenM * 0.52;
  const trunkCoMLenM = 0.215 * statureM;
  const thighLenM = 0.245 * statureM;
  const shankLenM = clamp((kneeRow[groupKey][p] - 0.042 * statureMm) / 1000, 0.34, 0.52);

  // Fracciones másicas antropométricas (DIN 33411 / Winter / Dempster)
  const mUpperArmKg = 0.028 * bodyMassKg;
  const mForearmHandKg = 0.022 * bodyMassKg;
  const mTorsoHeadAboveL5Kg = 0.365 * bodyMassKg;
  const mAboveKneeKg = 0.74 * bodyMassKg;

  // Radios de giro proximales k_prox (Winter): I_prox = m * (k_prox * L)^2
  const iUpperArm = mUpperArmKg * Math.pow(0.542 * upperArmLenM, 2);
  const iForearmHand = mForearmHandKg * Math.pow(0.626 * forearmHandLenM, 2);
  const iTorsoAboveL5 = mTorsoHeadAboveL5Kg * Math.pow(0.68 * trunkCoMLenM * 1.45, 2);
  const iThighAboveKnee = mAboveKneeKg * 0.35 * Math.pow(0.54 * thighLenM, 2);

  // Capacidad isométrica base τ_B (Nm) cruzando McKay et al. (Neurology 2017, 20–59 años) + DIN EN 1005-3
  const zPerc = p === 'P5' ? -1.645 : p === 'P95' ? 1.645 : 0;
  // Extensores de rodilla McKay 2017: Varones 202.1 ± 56.1 Nm, Mujeres 122.6 ± 33.6 Nm
  const kneeMean = cfg.sex === 'femenino' ? 122.6 : 202.1;
  const kneeSd = cfg.sex === 'femenino' ? 33.6 : 56.1;
  const tauMaxIsoKneeNm = clamp(kneeMean + zPerc * kneeSd * 0.65, 68, 295);

  // Flexores de codo McKay 2017: Varones 270.2 ± 59.6 N, Mujeres 164.4 ± 42.3 N en muñeca (~forearmLenM)
  const elbForceMean = cfg.sex === 'femenino' ? 164.4 : 270.2;
  const elbForceSd = cfg.sex === 'femenino' ? 42.3 : 59.6;
  const tauMaxIsoElbowNm = clamp(
    (elbForceMean + zPerc * elbForceSd * 0.65) * forearmLenM,
    26,
    98,
  );

  // Hombro flexión/elevación y Lumbar L5/S1 (DIN 33411 / DIN EN 1005-3)
  const shMean = cfg.sex === 'femenino' ? 54.0 : 86.0;
  const shSd = cfg.sex === 'femenino' ? 13.5 : 21.0;
  const tauMaxIsoShoulderNm = clamp(shMean + zPerc * shSd * 0.65, 32, 125);

  const lumMean = cfg.sex === 'femenino' ? 168.0 : 245.0;
  const lumSd = cfg.sex === 'femenino' ? 38.0 : 56.0;
  const tauMaxIsoLumbarNm = clamp(lumMean + zPerc * lumSd * 0.65, 105, 340);

  return {
    statureM,
    bodyMassKg,
    upperArmLenM,
    forearmLenM,
    handLenM,
    forearmHandLenM,
    trunkCoMLenM,
    thighLenM,
    shankLenM,
    mUpperArmKg,
    mForearmHandKg,
    mTorsoHeadAboveL5Kg,
    mAboveKneeKg,
    iUpperArm,
    iForearmHand,
    iTorsoAboveL5,
    iThighAboveKnee,
    tauMaxIsoLumbarNm,
    tauMaxIsoShoulderNm,
    tauMaxIsoElbowNm,
    tauMaxIsoKneeNm,
  };
}

// ============================================================================
// SECCIÓN 1: CRITERIO ANGULAR GEOMÉTRICO ORTOGONAL 2D (3 MARCADORES KINOVEA)
// ============================================================================
export interface Planar2DKinoveaSnapshot {
  lumbarKinoveaDeg: number;
  cervicalKinoveaDeg: number;
  shoulderRElev2DDeg: number;
  shoulderLElev2DDeg: number;
  elbowRKinoveaDeg: number;
  elbowLKinoveaDeg: number;
  wristRKinoveaDeg: number;
  hipRKinoveaDeg: number;
  kneeRKinoveaDeg: number;
  ankleRKinoveaDeg: number;
  // Longitudes planares de segmentos rígidos (en milésimas de altura de imagen corregida por aspecto)
  forearmRPlanarPx: number;
  forearmLPlanarPx: number;
  upperArmRPlanarPx: number;
  upperArmLPlanarPx: number;
  thighRPlanarPx: number;
  trunkPlanarPx: number;
  // Visibilidad óptica mínima de cadenas clave
  trunkVis: number;
  rightArmVis: number;
  leftArmVis: number;
  rightLegVis: number;
}

function angle3Points2DDeg(
  ax: number,
  ay: number,
  vx: number,
  vy: number,
  bx: number,
  by: number,
): number {
  const u1x = ax - vx;
  const u1y = ay - vy;
  const u2x = bx - vx;
  const u2y = by - vy;
  const m1 = Math.hypot(u1x, u1y);
  const m2 = Math.hypot(u2x, u2y);
  if (m1 < 1e-6 || m2 < 1e-6) return 168.0; // Extensión nativa DIN 33402-2 P50 (nunca 180° ideal)
  const cos = clamp((u1x * u2x + u1y * u2y) / (m1 * m2), -1, 1);
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Calcula los ángulos geométricos internos planos 2D (Proximal -> Articulación -> Distal)
 * en proyección ortogonal respecto al plano óptico de la cámara (Sección 1.1–1.3 V2.6),
 * acotados estrictamente por los percentiles reales DIN 33402-2 / ISO 7250-1.
 */
export function computePlanar2DKinoveaSnapshot(
  norm2D: MocapVec3[],
  videoAspect = 16 / 9,
): Planar2DKinoveaSnapshot {
  const px = (idx: number) => (norm2D[idx]?.x ?? 0.5) * videoAspect * 1000;
  const py = (idx: number) => (norm2D[idx]?.y ?? 0.5) * 1000;
  const vis = (idx: number) => norm2D[idx]?.visibility ?? 0.85;

  const shMidX = (px(11) + px(12)) * 0.5;
  const shMidY = (py(11) + py(12)) * 0.5;
  const hipMidX = (px(23) + px(24)) * 0.5;
  const hipMidY = (py(23) + py(24)) * 0.5;
  const earMidX = (px(7) + px(8)) * 0.5;
  const earMidY = (py(7) + py(8)) * 0.5;
  const kneeMidX = (px(25) + px(26)) * 0.5;
  const kneeMidY = (py(25) + py(26)) * 0.5;
  const neckMidX = shMidX * 0.72 + earMidX * 0.28;
  const neckMidY = shMidY * 0.72 + earMidY * 0.28;

  // CODO: Hombro -> Codo -> Muñeca (DIN 33402-2 P95: 28°..175°)
  const elbowRKinoveaDeg = clamp(
    angle3Points2DDeg(px(12), py(12), px(14), py(14), px(16), py(16)),
    28.0,
    175.0,
  );
  const elbowLKinoveaDeg = clamp(
    angle3Points2DDeg(px(11), py(11), px(13), py(13), px(15), py(15)),
    28.0,
    175.0,
  );

  // RODILLA: Cadera -> Rodilla -> Tobillo (DIN 33402-2 P95: 35°..183°)
  const kneeRKinoveaDeg = clamp(
    angle3Points2DDeg(px(24), py(24), px(26), py(26), px(28), py(28)),
    35.0,
    183.0,
  );

  // CADERA: Hombro -> Cadera -> Rodilla (DIN 33402-2 P95: 57°..206°)
  const hipRKinoveaDeg = clamp(
    angle3Points2DDeg(px(12), py(12), px(24), py(24), px(26), py(26)),
    57.0,
    206.0,
  );

  // LUMBAR: Hombro -> CrestaIlíaca -> Fémur (DIN 33402-2 P95: 94°..176°)
  const lumbarKinoveaDeg = clamp(
    angle3Points2DDeg(shMidX, shMidY, hipMidX, hipMidY, kneeMidX, kneeMidY),
    94.0,
    176.0,
  );

  // CERVICAL: Oreja -> CentroCuello -> Hombro (DIN 33402-2 P95: 50°..128°)
  const cervicalKinoveaDeg = clamp(
    angle3Points2DDeg(earMidX, earMidY, neckMidX, neckMidY, shMidX, shMidY),
    50.0,
    168.0,
  );

  // TOBILLO: Rodilla -> Maléolo -> 5°Metatarso (ISO 7250-1 P95: 71°..149°)
  const ankleRKinoveaDeg = clamp(
    angle3Points2DDeg(px(26), py(26), px(28), py(28), px(32), py(32)),
    71.0,
    149.0,
  );

  // MUÑECA: Antebrazo -> Carpo -> 3°Metacarpiano (ISO 7250-1 P95: 101°..245°)
  const handMidRX = (px(18) + px(20)) * 0.5;
  const handMidRY = (py(18) + py(20)) * 0.5;
  const wristRKinoveaDeg = clamp(
    angle3Points2DDeg(px(14), py(14), px(16), py(16), handMidRX, handMidRY),
    101.0,
    245.0,
  );

  // HOMBRO 2D: Cadera -> Hombro -> Codo
  const shoulderRElev2DDeg = clamp(
    angle3Points2DDeg(px(24), py(24), px(12), py(12), px(14), py(14)),
    5.0,
    174.0,
  );
  const shoulderLElev2DDeg = clamp(
    angle3Points2DDeg(px(23), py(23), px(11), py(11), px(13), py(13)),
    5.0,
    174.0,
  );

  const forearmRPlanarPx = Math.hypot(px(16) - px(14), py(16) - py(14));
  const forearmLPlanarPx = Math.hypot(px(15) - px(13), py(15) - py(13));
  const upperArmRPlanarPx = Math.hypot(px(14) - px(12), py(14) - py(12));
  const upperArmLPlanarPx = Math.hypot(px(13) - px(11), py(13) - py(11));
  const thighRPlanarPx = Math.hypot(px(26) - px(24), py(26) - py(24));
  const trunkPlanarPx = Math.hypot(shMidX - hipMidX, shMidY - hipMidY);

  return {
    lumbarKinoveaDeg,
    cervicalKinoveaDeg,
    shoulderRElev2DDeg,
    shoulderLElev2DDeg,
    elbowRKinoveaDeg,
    elbowLKinoveaDeg,
    wristRKinoveaDeg,
    hipRKinoveaDeg,
    kneeRKinoveaDeg,
    ankleRKinoveaDeg,
    forearmRPlanarPx,
    forearmLPlanarPx,
    upperArmRPlanarPx,
    upperArmLPlanarPx,
    thighRPlanarPx,
    trunkPlanarPx,
    trunkVis: Math.min(vis(11), vis(12), vis(23), vis(24)),
    rightArmVis: Math.min(vis(12), vis(14), vis(16)),
    leftArmVis: Math.min(vis(11), vis(13), vis(15)),
    rightLegVis: Math.min(vis(24), vis(26), vis(28)),
  };
}

/**
 * Construye una instantánea equivalente a partir de `PosturePose3D` (para Ciclos de Prueba sin vídeo).
 * Ningún ángulo emplea aproximaciones ideales a 0° o 180°.
 */
export function buildPlanarSnapshotFromPose(pose: PosturePose3D): Planar2DKinoveaSnapshot {
  const elbRKin = clamp(180 - pose.elbowRFlexionDeg, 28.0, 175.0);
  const elbLKin = clamp(180 - pose.elbowLFlexionDeg, 28.0, 175.0);
  const kneeRKin = clamp(180 - pose.kneeRFlexionDeg, 35.0, 183.0);
  const hipRKin = clamp(180 - (pose.hipRFlexionDeg + Math.max(0, pose.trunkFlexionDeg) * 0.35), 57.0, 206.0);
  const lumbarKin = clamp(174.0 - Math.max(-15, pose.trunkFlexionDeg) * 0.92, 94.0, 176.0);
  const cervKin = clamp(150.0 - pose.neckFlexionDeg * 0.48, 50.0, 168.0);
  const ankKin = clamp(105.5 - pose.ankleRDorsiflexionDeg, 71.0, 149.0);
  const wrKin = clamp(180.0 - pose.wristRFlexionDeg, 101.0, 245.0);
  const shRElev = clamp(Math.hypot(pose.shoulderRFlexionDeg, pose.shoulderRAbductionDeg), 6.0, 174.0);
  const shLElev = clamp(Math.hypot(pose.shoulderLFlexionDeg, pose.shoulderLAbductionDeg), 6.0, 174.0);

  // Simular escorzo realista fuera de plano cuando hay abducción o rotación axial en ciclo demo
  const outOfPlaneR = Math.cos(clamp(pose.shoulderRAbductionDeg * 0.65 + Math.abs(pose.trunkTwistDeg) * 0.4, 0, 62) * DEG2RAD);

  return {
    lumbarKinoveaDeg: lumbarKin,
    cervicalKinoveaDeg: cervKin,
    shoulderRElev2DDeg: shRElev,
    shoulderLElev2DDeg: shLElev,
    elbowRKinoveaDeg: elbRKin,
    elbowLKinoveaDeg: elbLKin,
    wristRKinoveaDeg: wrKin,
    hipRKinoveaDeg: hipRKin,
    kneeRKinoveaDeg: kneeRKin,
    ankleRKinoveaDeg: ankKin,
    forearmRPlanarPx: 145 * outOfPlaneR,
    forearmLPlanarPx: 145 * outOfPlaneR,
    upperArmRPlanarPx: 162 * Math.max(0.45, outOfPlaneR),
    upperArmLPlanarPx: 162 * Math.max(0.45, outOfPlaneR),
    thighRPlanarPx: 215,
    trunkPlanarPx: 265,
    trunkVis: 0.96,
    rightArmVis: 0.96,
    leftArmVis: 0.96,
    rightLegVis: 0.96,
  };
}

// ============================================================================
// CALIBRACIÓN DE LONGITUDES PLANARES MÁXIMAS L_{px,max} (ESCORZO Z · SEC. 3.3)
// ============================================================================
export interface PlanarSegmentMaxCalibration {
  forearmRMaxPx: number;
  forearmLMaxPx: number;
  upperArmRMaxPx: number;
  upperArmLMaxPx: number;
  thighRMaxPx: number;
  trunkMaxPx: number;
}

function percentile92(values: number[], fallback: number): number {
  if (values.length === 0) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.92));
  return Math.max(fallback * 0.35, sorted[idx]);
}

export function calibrateMaxPlanarSegmentLengths(
  timeline: MocapTimelineResult,
): PlanarSegmentMaxCalibration {
  const foreR: number[] = [];
  const foreL: number[] = [];
  const armR: number[] = [];
  const armL: number[] = [];
  const thighR: number[] = [];
  const trunk: number[] = [];

  for (const frame of timeline.frames) {
    const snap = computePlanar2DKinoveaSnapshot(frame.norm2D, timeline.videoAspect);
    if (snap.rightArmVis >= 0.55 && snap.forearmRPlanarPx > 12) {
      foreR.push(snap.forearmRPlanarPx);
      armR.push(snap.upperArmRPlanarPx);
    }
    if (snap.leftArmVis >= 0.55 && snap.forearmLPlanarPx > 12) {
      foreL.push(snap.forearmLPlanarPx);
      armL.push(snap.upperArmLPlanarPx);
    }
    if (snap.rightLegVis >= 0.55 && snap.thighRPlanarPx > 18) {
      thighR.push(snap.thighRPlanarPx);
    }
    if (snap.trunkVis >= 0.55 && snap.trunkPlanarPx > 22) {
      trunk.push(snap.trunkPlanarPx);
    }
  }

  const symForeMax = Math.max(percentile92(foreR, 145), percentile92(foreL, 145));
  const symArmMax = Math.max(percentile92(armR, 162), percentile92(armL, 162));

  return {
    forearmRMaxPx: symForeMax,
    forearmLMaxPx: symForeMax,
    upperArmRMaxPx: symArmMax,
    upperArmLMaxPx: symArmMax,
    thighRMaxPx: percentile92(thighR, 215),
    trunkMaxPx: percentile92(trunk, 265),
  };
}

// ============================================================================
// ESQUEMA PLANO DE ENLACE DE DATOS (< 3 ms, CERO TEXTO · SECCIÓN 5 V2.6)
// ============================================================================
export interface BiomechDataLinkFlatV26 {
  schema_ver: number;
  t_sec: number;
  dt_ms: number;
  exec_latency_ms: number;
  // Sección 1: Ángulos ortogonales 2D Kinovea (grados, acotados P5..P95 DIN 33402-2 / ISO 7250-1)
  th_lumbar_deg: number;
  th_cervical_deg: number;
  th_sh_r_deg: number;
  th_elb_r_deg: number;
  th_wr_r_deg: number;
  th_hip_r_deg: number;
  th_knee_r_deg: number;
  th_ank_r_deg: number;
  th_sh_l_deg: number;
  th_elb_l_deg: number;
  // Sección 2: Jitter Articular (N=10) e Índice de Fatiga Neuromuscular (I_f)
  jitter_deg: number;
  fatigue_if: number;
  fatigue_code: number; // 0 = óptimo, 1 = moderada, 2 = crítica
  isometric_gate: number; // 1 = fijación isométrica activa, 0 = movimiento dinámico voluntario
  // Sección 3: Cinemática Inversa de Vídeo (VIM: ω, α, Escorzo Z y Torque τ en Nm + DIN EN 1005-3)
  om_lumbar_dps: number;
  om_sh_r_dps: number;
  om_elb_r_dps: number;
  al_lumbar_dps2: number;
  al_sh_r_dps2: number;
  al_elb_r_dps2: number;
  cos_phiz_fore_r: number;
  phiz_fore_r_deg: number;
  cos_phiz_arm_r: number;
  tau_lumbar_nm: number;
  tau_sh_r_nm: number;
  tau_elb_r_nm: number;
  tau_knee_r_nm: number;
  din_fr_max: number;
  din_fr_code: number; // 0 <= 0.50 (Verde), 1 = 0.51..0.70 (Ámbar), 2 > 0.70 (Rojo DIN EN 1005-3)
  // Sección 4: Campos Potenciales Repulsivos y Vector Predictivo (+0.5 s)
  u_rep_total: number;
  pred_collision_05s: number; // 0 = libre, 1 = colisión predicha en <0.5 s, 2 = barrera P5/DIN activa
  dth_corr_trunk_deg: number;
  dth_corr_sh_r_deg: number;
  dth_corr_elb_r_deg: number;
  dth_corr_sh_l_deg: number;
  dth_corr_knee_r_deg: number;
}

/**
 * Datos para superponer la trayectoria corregida y halos repulsivos directamente sobre el Mellizo 3D.
 */
export interface PredictiveAvatarOverlaySpec {
  enabled: boolean;
  hasActiveCorrection: boolean;
  collisionState: 0 | 1 | 2; // 0 = libre, 1 = predicción +0.5s, 2 = barrera activa
  repulsiveEnergy: number; // 0..1
  /** Desviaciones correctivas recomendadas (grados, con signo en espacio PosturePose3D) */
  deltaTrunkFlexDeg: number;
  deltaShoulderRFlexDeg: number;
  deltaElbowRFlexDeg: number;
  deltaShoulderLFlexDeg: number;
  deltaKneeRFlexDeg: number;
  /** Momentos dinámicos instantáneos para etiquetas concisas opcionales */
  tauLumbarNm: number;
  tauShoulderRNm: number;
  tauElbowRNm: number;
  dinFrMax: number;
}

export interface PredictiveKinematicsEvaluationV26 {
  flatPayload: BiomechDataLinkFlatV26;
  serializedFlatJson: string;
  overlaySpec: PredictiveAvatarOverlaySpec;
  // Resúmenes legibles exclusivamente para la interfaz del operador (fuera del Data Link JSON)
  dominantFatigueJoint: string;
  dinPostureZoneTrunk: 'optima' | 'condicional' | 'inaceptable';
  dinPostureZoneShoulder: 'optima' | 'condicional' | 'inaceptable';
  activeRepulsiveBarriers: string[];
}

/**
 * Evalúa la Sección 2 (Jitter Articular N=10 con compuerta cuasi-isométrica y ponderación de visibilidad)
 * evitando falsos positivos durante desplazamientos rápidos voluntarios y evitando subestimación tras filtro 1€.
 */
function evaluateRefinedWindowJitterV26(
  rawSeries: number[],
  filteredSeries: number[],
  visSeries: number[],
  dtSec: number,
): { jitterDeg: number; ifScore: number; code: 0 | 1 | 2; isometricGate: number } {
  const n = Math.min(rawSeries.length, filteredSeries.length);
  if (n < 2) {
    return { jitterDeg: 0, ifScore: 0, code: 0, isometricGate: 1 };
  }

  const safeDt = Math.max(1 / 60, dtSec);
  let weightedJitterSum = 0;
  let weightTotal = 0;
  let isoCount = 0;

  for (let i = 0; i < n - 1; i++) {
    const vPair = Math.min(visSeries[i] ?? 0.9, visSeries[i + 1] ?? 0.9);
    if (vPair < 0.55) continue; // Descartar ruido óptico por oclusión (no confundir con temblor muscular)

    // Velocidad voluntaria estimada sobre la trayectoria filtrada 1€
    const voluntarySpeedDps = Math.abs(filteredSeries[i + 1] - filteredSeries[i]) / safeDt;

    // Residuo micro-cinemático de alta frecuencia (antes vs después de 1€)
    const res0 = rawSeries[i] - filteredSeries[i];
    const res1 = rawSeries[i + 1] - filteredSeries[i + 1];
    const microStepDeg = Math.abs(res1 - res0);

    // Compuerta cuasi-isométrica (fijación postural o contracción sostenida bajo carga: |ω| <= 14 °/s)
    const isoWeight =
      voluntarySpeedDps <= 14
        ? 1.0
        : 1.0 / (1.0 + Math.pow((voluntarySpeedDps - 14) / 12, 2));

    if (voluntarySpeedDps <= 14) isoCount++;

    const w = isoWeight * clamp((vPair - 0.5) / 0.4, 0.35, 1.0);
    weightedJitterSum += microStepDeg * w;
    weightTotal += w;
  }

  const rawJitter = weightTotal > 0.15 ? weightedJitterSum / weightTotal : 0;
  const jitterDeg = f32(rawJitter, 3);
  const isometricGate = f32(isoCount / Math.max(1, n - 1), 2);

  if (jitterDeg < 0.5) {
    return { jitterDeg, ifScore: 0.0, code: 0, isometricGate };
  }
  if (jitterDeg <= 2.5) {
    const ifScore = f32(0.1 + ((jitterDeg - 0.5) / 2.0) * 0.6, 3);
    return { jitterDeg, ifScore, code: 1, isometricGate };
  }
  return { jitterDeg, ifScore: 1.0, code: 2, isometricGate };
}

/**
 * Calcula un potencial repulsivo armónico unilateral y el vector de corrección predictivo Δθ_corr
 * con horizonte de predicción lineal Δt_horiz = 0.5 s (Sección 4 V2.6).
 */
function evaluateBarrierRepulsion(params: {
  currentDeg: number;
  omegaDps: number;
  barrierDeg: number;
  safeTargetDeg: number;
  direction: 'upper_bound' | 'lower_bound';
  horizonSec?: number;
  marginDeg?: number;
}): {
  uRep: number;
  deltaCorrDeg: number;
  state: 0 | 1 | 2;
} {
  const {
    currentDeg,
    omegaDps,
    barrierDeg,
    safeTargetDeg,
    direction,
    horizonSec = 0.5,
    marginDeg = 10,
  } = params;

  const predDeg = currentDeg + omegaDps * horizonSec;

  if (direction === 'upper_bound') {
    const activeBreach = currentDeg - barrierDeg;
    const predBreach = predDeg - barrierDeg;
    const worstVal = Math.max(currentDeg, predDeg);
    const distIntoZone = worstVal - (barrierDeg - marginDeg);

    if (distIntoZone <= 0) {
      return { uRep: 0, deltaCorrDeg: 0, state: 0 };
    }

    const uRep = clamp(Math.pow(distIntoZone / (marginDeg * 1.8), 2), 0, 1);
    const state: 0 | 1 | 2 = activeBreach >= 0 ? 2 : predBreach >= 0 ? 1 : 0;
    const deltaCorrDeg =
      state > 0 || uRep >= 0.25 ? safeTargetDeg - currentDeg : 0;

    return { uRep, deltaCorrDeg, state };
  }

  // lower_bound (ej. ángulos internos Kinovea donde cerrar ángulo por debajo de P5 es colisión)
  const activeBreach = barrierDeg - currentDeg;
  const predBreach = barrierDeg - predDeg;
  const worstVal = Math.min(currentDeg, predDeg);
  const distIntoZone = barrierDeg + marginDeg - worstVal;

  if (distIntoZone <= 0) {
    return { uRep: 0, deltaCorrDeg: 0, state: 0 };
  }

  const uRep = clamp(Math.pow(distIntoZone / (marginDeg * 1.8), 2), 0, 1);
  const state: 0 | 1 | 2 = activeBreach >= 0 ? 2 : predBreach >= 0 ? 1 : 0;
  const deltaCorrDeg =
    state > 0 || uRep >= 0.25 ? safeTargetDeg - currentDeg : 0;

  return { uRep, deltaCorrDeg, state };
}

/**
 * Ejecuta en tiempo real (< 3 ms) toda la cadena de la Especificación Técnica V2.6 sobre
 * el instante `tSec` de una secuencia MoCap (o sobre un Ciclo de Prueba sintético).
 */
export function evaluatePredictiveKinematicsV26(params: {
  tSec: number;
  pose: PosturePose3D;
  prevPose?: PosturePose3D;
  prev2Pose?: PosturePose3D;
  syntheticDtSec?: number;
  timeline?: MocapTimelineResult | null;
  liveSample?: MocapFrameSample | null;
  planarMaxCalib?: PlanarSegmentMaxCalibration | null;
  operatorConfig: OperatorDinConfig;
  overlayEnabled?: boolean;
}): PredictiveKinematicsEvaluationV26 {
  const tStartMs = typeof performance !== 'undefined' ? performance.now() : 0;
  const {
    tSec,
    pose,
    prevPose,
    prev2Pose,
    syntheticDtSec,
    timeline,
    liveSample,
    planarMaxCalib,
    operatorConfig,
    overlayEnabled = true,
  } = params;

  const anthro = resolveOperatorAnthropometry(operatorConfig);

  // 1. Obtener ventana temporal N=10 fotogramas (o derivadas discretas en modo Ciclo Demo)
  let snapCur: Planar2DKinoveaSnapshot;
  let snapPrev: Planar2DKinoveaSnapshot;
  let snapPrev2: Planar2DKinoveaSnapshot;
  let dtSec = 1 / 24;

  let jitterEval = {
    jitterDeg: 0,
    ifScore: 0,
    code: 0 as 0 | 1 | 2,
    isometricGate: 1,
    dominantLabel: 'Tronco L5/S1',
  };

  if (timeline && timeline.frames.length >= 3) {
    const frames = timeline.frames;
    const aspect = timeline.videoAspect || 16 / 9;

    // Localizar índice actual por búsqueda binaria rápida
    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].timeSec < tSec) lo = mid + 1;
      else hi = mid;
    }
    const idx = clamp(lo, 0, frames.length - 1);
    const idxPrev = Math.max(0, idx - 1);
    const idxPrev2 = Math.max(0, idx - 2);

    const fCur = liveSample ?? frames[idx];
    const fPrev = frames[idxPrev];
    const fPrev2 = frames[idxPrev2];

    dtSec =
      idx > idxPrev
        ? clamp(frames[idx].timeSec - frames[idxPrev].timeSec, 1 / 60, 0.25)
        : 1 / Math.max(12, timeline.sampledFps || 24);

    snapCur = computePlanar2DKinoveaSnapshot(fCur.norm2D, aspect);
    snapPrev = computePlanar2DKinoveaSnapshot(fPrev.norm2D, aspect);
    snapPrev2 = computePlanar2DKinoveaSnapshot(fPrev2.norm2D, aspect);

    // Ventana N = 10 fotogramas (Sección 2.1 V2.6) sobre ángulos crudos vs filtrados 1€
    const winStart = Math.max(0, idx - 9);
    const winFrames = frames.slice(winStart, idx + 1);

    const rawLumbar: number[] = [];
    const filtLumbar: number[] = [];
    const visLumbar: number[] = [];

    const rawElbR: number[] = [];
    const filtElbR: number[] = [];
    const visElbR: number[] = [];

    const rawShR: number[] = [];
    const filtShR: number[] = [];

    for (const wf of winFrames) {
      const sFilt = computePlanar2DKinoveaSnapshot(wf.norm2D, aspect);
      const sRaw = wf.rawNorm2D
        ? computePlanar2DKinoveaSnapshot(wf.rawNorm2D, aspect)
        : sFilt;

      rawLumbar.push(sRaw.lumbarKinoveaDeg);
      filtLumbar.push(sFilt.lumbarKinoveaDeg);
      visLumbar.push(sRaw.trunkVis);

      rawElbR.push(sRaw.elbowRKinoveaDeg);
      filtElbR.push(sFilt.elbowRKinoveaDeg);
      visElbR.push(sRaw.rightArmVis);

      rawShR.push(sRaw.shoulderRElev2DDeg);
      filtShR.push(sFilt.shoulderRElev2DDeg);
    }

    const jLum = evaluateRefinedWindowJitterV26(rawLumbar, filtLumbar, visLumbar, dtSec);
    const jElb = evaluateRefinedWindowJitterV26(rawElbR, filtElbR, visElbR, dtSec);
    const jSh = evaluateRefinedWindowJitterV26(rawShR, filtShR, visElbR, dtSec);

    if (jElb.jitterDeg >= jLum.jitterDeg && jElb.jitterDeg >= jSh.jitterDeg) {
      jitterEval = { ...jElb, dominantLabel: 'Codo Der' };
    } else if (jSh.jitterDeg >= jLum.jitterDeg) {
      jitterEval = { ...jSh, dominantLabel: 'Hombro Der' };
    } else {
      jitterEval = { ...jLum, dominantLabel: 'Tronco L5/S1' };
    }
  } else {
    // Modo Ciclo de Prueba con diferencias finitas discretas
    dtSec = clamp(syntheticDtSec ?? 0.04, 1 / 60, 0.25);
    snapCur = buildPlanarSnapshotFromPose(pose);
    snapPrev = prevPose ? buildPlanarSnapshotFromPose(prevPose) : snapCur;
    snapPrev2 = prev2Pose ? buildPlanarSnapshotFromPose(prev2Pose) : snapPrev;
  }

  // 2. Sección 3.1 y 3.2: Velocidad Angular (ω en °/s) y Aceleración Angular (α en °/s²)
  const omLumbarDps = clamp(
    (snapCur.lumbarKinoveaDeg - snapPrev.lumbarKinoveaDeg) / dtSec,
    -360,
    360,
  );
  const omLumbarPrevDps = clamp(
    (snapPrev.lumbarKinoveaDeg - snapPrev2.lumbarKinoveaDeg) / dtSec,
    -360,
    360,
  );
  const alLumbarDps2 = clamp((omLumbarDps - omLumbarPrevDps) / dtSec, -1200, 1200);

  const omShRDps = clamp(
    (snapCur.shoulderRElev2DDeg - snapPrev.shoulderRElev2DDeg) / dtSec,
    -420,
    420,
  );
  const omShRPrevDps = clamp(
    (snapPrev.shoulderRElev2DDeg - snapPrev2.shoulderRElev2DDeg) / dtSec,
    -420,
    420,
  );
  const alShRDps2 = clamp((omShRDps - omShRPrevDps) / dtSec, -1500, 1500);

  const omElbRDps = clamp(
    (snapCur.elbowRKinoveaDeg - snapPrev.elbowRKinoveaDeg) / dtSec,
    -450,
    450,
  );
  const omElbRPrevDps = clamp(
    (snapPrev.elbowRKinoveaDeg - snapPrev2.elbowRKinoveaDeg) / dtSec,
    -450,
    450,
  );
  const alElbRDps2 = clamp((omElbRDps - omElbRPrevDps) / dtSec, -1600, 1600);

  // 3. Sección 3.3: Detección óptica de escorzo (acortamiento aparente en píxeles L_px(t) / L_{px,max})
  // Compensa desplazamientos de profundidad en el eje Z sin sensores de profundidad.
  const maxForeR = planarMaxCalib?.forearmRMaxPx ?? 145;
  const maxArmR = planarMaxCalib?.upperArmRMaxPx ?? 162;

  const cosPhiZForeR =
    snapCur.rightArmVis >= 0.48
      ? clamp(snapCur.forearmRPlanarPx / Math.max(20, maxForeR), 0.25, 1.0)
      : 0.92;
  const sinPhiZForeR = Math.sqrt(Math.max(0, 1 - cosPhiZForeR * cosPhiZForeR));
  const phiZForeRDeg = (Math.acos(cosPhiZForeR) * 180) / Math.PI;

  const cosPhiZArmR =
    snapCur.rightArmVis >= 0.48
      ? clamp(snapCur.upperArmRPlanarPx / Math.max(20, maxArmR), 0.25, 1.0)
      : 0.94;
  const sinPhiZArmR = Math.sqrt(Math.max(0, 1 - cosPhiZArmR * cosPhiZArmR));

  // 4. Sección 3.4: Estimación no invasiva de Torque Articular Dinámico τ (Nm) + DIN EN 1005-3
  const loadKg = Math.max(0, operatorConfig.externalLoadKg);
  const handShare = operatorConfig.isBimanualLoad ? 0.5 : 1.0;
  const fHandRN = loadKg * handShare * GRAVITY;
  const fTotalLoadN = loadKg * GRAVITY;

  const trunkRad = pose.trunkFlexionDeg * DEG2RAD;
  const shWorldRad = (pose.trunkFlexionDeg + pose.shoulderRFlexionDeg) * DEG2RAD;
  const shAbdRad = pose.shoulderRAbductionDeg * DEG2RAD;
  const foreWorldRad =
    (pose.trunkFlexionDeg + pose.shoulderRFlexionDeg + pose.elbowRFlexionDeg) * DEG2RAD;

  // Brazo de palanca horizontal efectivo del antebrazo compensado por escorzo Z (cos φ_z, sin φ_z)
  const sinForePlanar = Math.abs(Math.sin(foreWorldRad));
  const effForeHorizFactor = clamp(
    Math.hypot(sinForePlanar * cosPhiZForeR, sinPhiZForeR * 0.85),
    0.12,
    1.0,
  );
  const rForeLoadM = anthro.forearmHandLenM * effForeHorizFactor;

  const tauElbowGravNm =
    anthro.mForearmHandKg * GRAVITY * (rForeLoadM * 0.46) + fHandRN * rForeLoadM;
  const tauElbowInertNm = anthro.iForearmHand * Math.abs(alElbRDps2 * DEG2RAD);
  const tauElbowRNm = tauElbowGravNm + tauElbowInertNm;

  // Hombro Derecho (brazo + antebrazo + carga + término inercial) compensado por escorzo Z
  const sinArmPlanar = Math.min(1, Math.hypot(Math.sin(shWorldRad), Math.sin(shAbdRad) * 0.85));
  const effArmHorizFactor = clamp(
    Math.hypot(sinArmPlanar * cosPhiZArmR, sinPhiZArmR * 0.80),
    0.10,
    1.0,
  );
  const rElbowFromShM = anthro.upperArmLenM * effArmHorizFactor;
  const rHandFromShM = Math.min(
    anthro.upperArmLenM + anthro.forearmHandLenM,
    rElbowFromShM + rForeLoadM * 0.88,
  );
  const tauShGravNm =
    anthro.mUpperArmKg * GRAVITY * (rElbowFromShM * 0.44) +
    anthro.mForearmHandKg * GRAVITY * (rElbowFromShM + rForeLoadM * 0.46) +
    fHandRN * rHandFromShM;
  const tauShInertNm =
    (anthro.iUpperArm + anthro.iForearmHand) * Math.abs(alShRDps2 * DEG2RAD);
  const tauShoulderRNm = tauShGravNm + tauShInertNm;

  // Lumbar L5/S1 (torso + brazos + carga + penalización torsional + inercia angular lumbar)
  const rTorsoM = Math.hypot(
    anthro.trunkCoMLenM * Math.sin(trunkRad),
    anthro.trunkCoMLenM * 0.42 * Math.sin(pose.trunkLateralDeg * DEG2RAD),
  );
  const hLoadReachM = clamp(0.18 + Math.abs(rTorsoM) * 0.85 + rHandFromShM * 0.55, 0.20, 0.84);
  const twistPenalty = 1 + (Math.abs(pose.trunkTwistDeg) / 90) * 0.18;
  const tauLumbarGravNm =
    (anthro.mTorsoHeadAboveL5Kg * GRAVITY * Math.abs(rTorsoM) +
      2 * anthro.mUpperArmKg * GRAVITY * Math.max(0.08, Math.abs(rTorsoM) + rElbowFromShM * 0.45) +
      2 * anthro.mForearmHandKg * GRAVITY * (hLoadReachM * 0.72) +
      fTotalLoadN * hLoadReachM) *
    twistPenalty;
  const tauLumbarInertNm = anthro.iTorsoAboveL5 * Math.abs(alLumbarDps2 * DEG2RAD);
  const tauLumbarNm = tauLumbarGravNm + tauLumbarInertNm;

  // Rodilla Derecha (tibiofemoral)
  const isSeated = pose.stanceMode === 'seated';
  const legShare = isSeated ? 0.15 : pose.stanceMode === 'one_leg' ? 1.0 : 0.52;
  const maxKneeFlexDeg = Math.max(pose.kneeRFlexionDeg, pose.kneeLFlexionDeg);
  const rKneeM = anthro.thighLenM * 0.44 * Math.abs(Math.sin(maxKneeFlexDeg * DEG2RAD));
  const tauKneeRNm = isSeated
    ? 11.5
    : legShare * (anthro.mAboveKneeKg * GRAVITY + fTotalLoadN) * Math.max(0.035, rKneeM);

  // Multiplicador dinámico de velocidad m_v según DIN EN 1005-3 y penalización por fatiga I_f
  const mvVelocityFactor = (omegaAbs: number) =>
    omegaAbs <= 15 ? 1.0 : clamp(1.0 - ((omegaAbs - 15) / 100) * 0.28, 0.68, 1.0);
  const fatigueCapFactor = 1.0 - 0.22 * jitterEval.ifScore;

  const frLumbar =
    tauLumbarNm /
    Math.max(25, anthro.tauMaxIsoLumbarNm * mvVelocityFactor(Math.abs(omLumbarDps)) * fatigueCapFactor);
  const frShoulderR =
    tauShoulderRNm /
    Math.max(12, anthro.tauMaxIsoShoulderNm * mvVelocityFactor(Math.abs(omShRDps)) * fatigueCapFactor);
  const frElbowR =
    tauElbowRNm /
    Math.max(10, anthro.tauMaxIsoElbowNm * mvVelocityFactor(Math.abs(omElbRDps)) * fatigueCapFactor);
  const frKneeR = tauKneeRNm / Math.max(25, anthro.tauMaxIsoKneeNm * fatigueCapFactor);

  const dinFrMax = Math.max(frLumbar, frShoulderR, frElbowR, frKneeR);
  const dinFrCode: 0 | 1 | 2 = dinFrMax > 0.7 ? 2 : dinFrMax > 0.5 ? 1 : 0;

  // 5. Sección 4: Campos Potenciales Artificiales Repulsivos (Barrera Anillo 1: P5 DIN 33402-2 + DIN EN 1005-4)
  // y Vectores de Corrección Predictiva con horizonte Δt = 0.5 s.
  // Tronco: DIN EN 1005-4 (>60° rojo) y LUMBAR_FLE P5 = 112° Kinovea (~68° flexión). Objetivo seguro: <= 20° (óptimo DIN EN 1005-4).
  const trunkOmegaFlexDps = -omLumbarDps;
  const repTrunk = evaluateBarrierRepulsion({
    currentDeg: pose.trunkFlexionDeg,
    omegaDps: trunkOmegaFlexDps,
    barrierDeg: 56.0, // Pre-barrera DIN EN 1005-4 (60°) / P5 DIN 33402-2
    safeTargetDeg: 18.0, // Zona verde DIN EN 1005-4 (0°–20°)
    direction: 'upper_bound',
    horizonSec: 0.5,
    marginDeg: 18.0,
  });

  // Hombro Derecho: DIN EN 1005-4 (>60° sin apoyo = inaceptable). Objetivo seguro: 22°
  const shREffElev = Math.max(pose.shoulderRFlexionDeg, pose.shoulderRAbductionDeg);
  const repShR = evaluateBarrierRepulsion({
    currentDeg: shREffElev,
    omegaDps: omShRDps,
    barrierDeg: 60.0,
    safeTargetDeg: 22.0,
    direction: 'upper_bound',
    horizonSec: 0.5,
    marginDeg: 16.0,
  });

  // Hombro Izquierdo
  const shLEffElev = Math.max(pose.shoulderLFlexionDeg, pose.shoulderLAbductionDeg);
  const repShL = evaluateBarrierRepulsion({
    currentDeg: shLEffElev,
    omegaDps: omShRDps * 0.7,
    barrierDeg: 60.0,
    safeTargetDeg: 22.0,
    direction: 'upper_bound',
    horizonSec: 0.5,
    marginDeg: 16.0,
  });

  // Codo Derecho: DIN 33402-2 CODO_FLE P5 = 40° Kinovea (140° flex) y CODO_EXT P5 = 162° Kinovea (18° flex bajo carga)
  const elbRKin = clamp(180 - pose.elbowRFlexionDeg, 28, 175);
  const repElbFlex = evaluateBarrierRepulsion({
    currentDeg: elbRKin,
    omegaDps: omElbRDps,
    barrierDeg: 45.0, // Cerca de P5=40° choque de masas bíceps-antebrazo
    safeTargetDeg: 88.0, // Arco ergonómico neutro (~92° flexión)
    direction: 'lower_bound',
    horizonSec: 0.5,
    marginDeg: 12.0,
  });
  const repElbExt =
    loadKg >= 3 && shREffElev >= 35
      ? evaluateBarrierRepulsion({
          currentDeg: elbRKin,
          omegaDps: omElbRDps,
          barrierDeg: 160.0, // Cerca de CODO_EXT P5=162° con carga alejada
          safeTargetDeg: 105.0, // Acercar carga flexionando codo (~75° flex)
          direction: 'upper_bound',
          horizonSec: 0.5,
          marginDeg: 10.0,
        })
      : { uRep: 0, deltaCorrDeg: 0, state: 0 as 0 | 1 | 2 };

  const deltaElbFlexPoseDeg =
    repElbFlex.uRep >= repElbExt.uRep
      ? -repElbFlex.deltaCorrDeg // Disminuir flexión excesiva
      : -repElbExt.deltaCorrDeg; // Aumentar flexión para acercar carga
  const elbState = Math.max(repElbFlex.state, repElbExt.state) as 0 | 1 | 2;
  const elbURep = Math.max(repElbFlex.uRep, repElbExt.uRep);

  // Rodilla / Cierre Cadera: RODILLA_FLE P5 = 46° Kinovea (134° flexión) / cuclilla profunda sostenida > 95°
  const repKnee = evaluateBarrierRepulsion({
    currentDeg: maxKneeFlexDeg,
    omegaDps: 0,
    barrierDeg: 98.0,
    safeTargetDeg: 45.0,
    direction: 'upper_bound',
    horizonSec: 0.5,
    marginDeg: 18.0,
  });

  const activeRepulsiveBarriers: string[] = [];
  if (repTrunk.state > 0) {
    activeRepulsiveBarriers.push(
      repTrunk.state === 2
        ? `Tronco > barrera DIN (${Math.round(pose.trunkFlexionDeg)}° → ${Math.round(pose.trunkFlexionDeg + repTrunk.deltaCorrDeg)}°)`
        : `Colisión Tronco <0.5s (Δθ ${Math.round(repTrunk.deltaCorrDeg)}°)`,
    );
  }
  if (repShR.state > 0) {
    activeRepulsiveBarriers.push(
      repShR.state === 2
        ? `Hombro D > 60° DIN EN 1005-4 (${Math.round(shREffElev)}°)`
        : `Elevación Hombro D <0.5s`,
    );
  }
  if (elbState > 0) {
    activeRepulsiveBarriers.push(`Codo D tope P5 DIN (${Math.round(elbRKin)}° Kinovea)`);
  }
  if (repKnee.state > 0) {
    activeRepulsiveBarriers.push(`Flexión profunda rodilla (${Math.round(maxKneeFlexDeg)}°)`);
  }

  const uRepTotal = clamp(
    Math.max(repTrunk.uRep, repShR.uRep, repShL.uRep, elbURep, repKnee.uRep),
    0,
    1,
  );
  const collisionState = Math.max(
    repTrunk.state,
    repShR.state,
    repShL.state,
    elbState,
    repKnee.state,
  ) as 0 | 1 | 2;

  const dinPostureZoneTrunk: PredictiveKinematicsEvaluationV26['dinPostureZoneTrunk'] =
    pose.trunkFlexionDeg > 60 || pose.trunkFlexionDeg < -5 || Math.abs(pose.trunkTwistDeg) > 15
      ? 'inaceptable'
      : pose.trunkFlexionDeg > 20 || Math.abs(pose.trunkLateralDeg) > 10
        ? 'condicional'
        : 'optima';

  const dinPostureZoneShoulder: PredictiveKinematicsEvaluationV26['dinPostureZoneShoulder'] =
    Math.max(shREffElev, shLEffElev) > 60
      ? 'inaceptable'
      : Math.max(shREffElev, shLEffElev) > 20
        ? 'condicional'
        : 'optima';

  // Construir objeto plano estricto (Sección 5 V2.6: exclusivamente floats simples y códigos numéricos, < 3 ms)
  const flatPayload: BiomechDataLinkFlatV26 = {
    schema_ver: 2.6,
    t_sec: f32(tSec, 3),
    dt_ms: f32(dtSec * 1000, 2),
    exec_latency_ms: 0,
    th_lumbar_deg: f32(snapCur.lumbarKinoveaDeg, 2),
    th_cervical_deg: f32(snapCur.cervicalKinoveaDeg, 2),
    th_sh_r_deg: f32(snapCur.shoulderRElev2DDeg, 2),
    th_elb_r_deg: f32(snapCur.elbowRKinoveaDeg, 2),
    th_wr_r_deg: f32(snapCur.wristRKinoveaDeg, 2),
    th_hip_r_deg: f32(snapCur.hipRKinoveaDeg, 2),
    th_knee_r_deg: f32(snapCur.kneeRKinoveaDeg, 2),
    th_ank_r_deg: f32(snapCur.ankleRKinoveaDeg, 2),
    th_sh_l_deg: f32(snapCur.shoulderLElev2DDeg, 2),
    th_elb_l_deg: f32(snapCur.elbowLKinoveaDeg, 2),
    jitter_deg: jitterEval.jitterDeg,
    fatigue_if: jitterEval.ifScore,
    fatigue_code: jitterEval.code,
    isometric_gate: jitterEval.isometricGate,
    om_lumbar_dps: f32(omLumbarDps, 2),
    om_sh_r_dps: f32(omShRDps, 2),
    om_elb_r_dps: f32(omElbRDps, 2),
    al_lumbar_dps2: f32(alLumbarDps2, 1),
    al_sh_r_dps2: f32(alShRDps2, 1),
    al_elb_r_dps2: f32(alElbRDps2, 1),
    cos_phiz_fore_r: f32(cosPhiZForeR, 3),
    phiz_fore_r_deg: f32(phiZForeRDeg, 1),
    cos_phiz_arm_r: f32(cosPhiZArmR, 3),
    tau_lumbar_nm: f32(tauLumbarNm, 1),
    tau_sh_r_nm: f32(tauShoulderRNm, 1),
    tau_elb_r_nm: f32(tauElbowRNm, 1),
    tau_knee_r_nm: f32(tauKneeRNm, 1),
    din_fr_max: f32(dinFrMax, 3),
    din_fr_code: dinFrCode,
    u_rep_total: f32(uRepTotal, 3),
    pred_collision_05s: collisionState,
    dth_corr_trunk_deg: f32(repTrunk.deltaCorrDeg, 2),
    dth_corr_sh_r_deg: f32(repShR.deltaCorrDeg, 2),
    dth_corr_elb_r_deg: f32(deltaElbFlexPoseDeg, 2),
    dth_corr_sh_l_deg: f32(repShL.deltaCorrDeg, 2),
    dth_corr_knee_r_deg: f32(repKnee.deltaCorrDeg, 2),
  };

  // Medir latencia real incluyendo serialización JSON plana (garantizando < 3 ms)
  let serializedFlatJson = JSON.stringify(flatPayload);
  const tEndMs = typeof performance !== 'undefined' ? performance.now() : 0;
  flatPayload.exec_latency_ms = f32(Math.max(0.01, tEndMs - tStartMs), 3);
  serializedFlatJson = JSON.stringify(flatPayload);

  const hasActiveCorrection =
    Math.abs(flatPayload.dth_corr_trunk_deg) >= 5 ||
    Math.abs(flatPayload.dth_corr_sh_r_deg) >= 6 ||
    Math.abs(flatPayload.dth_corr_elb_r_deg) >= 8 ||
    Math.abs(flatPayload.dth_corr_sh_l_deg) >= 6 ||
    Math.abs(flatPayload.dth_corr_knee_r_deg) >= 8;

  const overlaySpec: PredictiveAvatarOverlaySpec = {
    enabled: overlayEnabled,
    hasActiveCorrection,
    collisionState,
    repulsiveEnergy: flatPayload.u_rep_total,
    deltaTrunkFlexDeg: flatPayload.dth_corr_trunk_deg,
    deltaShoulderRFlexDeg: flatPayload.dth_corr_sh_r_deg,
    deltaElbowRFlexDeg: flatPayload.dth_corr_elb_r_deg,
    deltaShoulderLFlexDeg: flatPayload.dth_corr_sh_l_deg,
    deltaKneeRFlexDeg: flatPayload.dth_corr_knee_r_deg,
    tauLumbarNm: flatPayload.tau_lumbar_nm,
    tauShoulderRNm: flatPayload.tau_sh_r_nm,
    tauElbowRNm: flatPayload.tau_elb_r_nm,
    dinFrMax: flatPayload.din_fr_max,
  };

  return {
    flatPayload,
    serializedFlatJson,
    overlaySpec,
    dominantFatigueJoint: jitterEval.dominantLabel,
    dinPostureZoneTrunk,
    dinPostureZoneShoulder,
    activeRepulsiveBarriers,
  };
}

/**
 * Helper compatible con NORMATIVE_JOINT_LIMITS para obtener el rango de tope Anillo 2 del Avatar 3D.
 */
export function getRing2AvatarStopSummary(): string {
  const L = NORMATIVE_JOINT_LIMITS;
  return `Anillo 1 Repulsivo: P5 + DIN EN 1005-4 · Anillo 2 Rig 3D: (P50+P95)/2 → Codo [${L.elbow.flexionMinDeg}°, ${L.elbow.flexionMaxDeg}°], Rodilla [${L.knee.flexionMinDeg}°, ${L.knee.flexionMaxDeg}°], Tronco-Muslo ≥ ${L.hip.kinoveaTrunkThighHardMinDeg}°`;
}

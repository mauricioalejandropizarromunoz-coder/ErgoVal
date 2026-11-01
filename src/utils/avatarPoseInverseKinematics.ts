import { PosturePose3D } from '../types/figurePlan';
import { makeNeutralPose } from './figurePlanCatalog';
import {
  clampPoseToNormativeWorkAgeLimits,
  NORMATIVE_JOINT_LIMITS,
} from './normativeJointLimits';

export type LiftPostureStyle = 'hygienic_squat' | 'observed' | 'stoop';

export interface LiftTargetPoseInput {
  /** Altura vertical del agarre desde el suelo en cm (ej. 20 cm suelo, 75 cm nudillos, 145 cm hombros) */
  vCm: number;
  /** Distancia horizontal desde el punto medio de tobillos al centro de la carga en cm (ej. 25..65 cm) */
  hCm: number;
  /** Estatura antropométrica de referencia del operario en cm (por defecto 172 cm) */
  workerHeightCm?: number;
  /** Ángulo de flexión sagital del tronco medido o sugerido en el fotograma (0° = vertical) */
  trunkFlexHintDeg?: number;
  /** Ángulo de flexión de rodillas medido o sugerido en el fotograma (0° = pierna recta) */
  kneeFlexHintDeg?: number;
  /** Ángulo de giro/asimetría axial del tronco en grados */
  asymmetryDeg?: number;
  /** Peso de la carga en kg */
  loadKg?: number;
  /** Si el usuario o visión proporcionó ángulos explícitos de hombro/codo, respetar solo si son físicamente coherentes con V_cm */
  shoulderFlexHintDeg?: number;
  elbowFlexHintDeg?: number;
  /**
   * Patrón biomecánico de levantamiento:
   * - 'hygienic_squat': Regla ergonómica ideal (rodillas flexionadas + espalda recta ≤ 20°–26°).
   * - 'stoop': Contraste disergonómico (piernas extendidas + espalda flexionada).
   * - 'observed': Respeta los ángulos observados en video si son explícitos; por defecto usa técnica higiénica.
   */
  liftStyle?: LiftPostureStyle;
}

export interface SolvedLiftPoseResult {
  pose: PosturePose3D;
  trunkFlexionDeg: number;
  kneeFlexionDeg: number;
  hipFlexionDeg: number;
  ankleDorsiflexionDeg: number;
  shoulderFlexionDeg: number;
  elbowFlexionDeg: number;
  neckFlexionDeg: number;
  estimatedHandHeightCm: number;
  estimatedHandReachCm: number;
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Longitudes óseas reales medidas sobre `/public/models/ergo_avatar.glb` (estatura base ~1.70 m):
 * - Suela a tobillo apoyado: 0.108 m
 * - Pierna (tobillo -> rodilla): 0.378 m
 * - Muslo (rodilla -> cadera): 0.407 m
 * - Pelvis + columna (cadera -> articulación glenohumeral): 0.538 m
 * - Brazo superior (hombro -> codo): 0.252 m
 * - Antebrazo + palma hasta centro de agarre metacarpiano: 0.278 m
 */
const AVATAR_BASE_STATURE_M = 1.70;
const ANKLE_HEIGHT_M = 0.108;
const SHANK_LEN_M = 0.378;
const THIGH_LEN_M = 0.407;
const TRUNK_LEN_M = 0.538;
const UPPER_ARM_LEN_M = 0.252;
const FOREARM_GRIP_LEN_M = 0.278;

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Normaliza un ángulo de codo proveniente de visión por computador o entrada libre:
 * En biomecánica clínica 0° = brazo completamente recto/extendido y 90° = codo en L.
 * Si un detector reporta el ángulo interior suplementario (ej. 165° cuando el brazo cuelga recto hacia abajo),
 * lo convierte automáticamente a flexión real (180° - valor) cuando la carga está baja.
 */
export function normalizeAnatomicalElbowFlexion(rawElbowDeg: number, vCm: number): number {
  if (!Number.isFinite(rawElbowDeg)) return 35;
  const clamped = clamp(rawElbowDeg, 0, 175);
  if (vCm < 82 && clamped > 122) {
    return clamp(Math.round(180 - clamped), NORMATIVE_JOINT_LIMITS.elbow.flexionMinDeg, 75);
  }
  return clamp(
    Math.round(clamped),
    NORMATIVE_JOINT_LIMITS.elbow.flexionMinDeg,
    NORMATIVE_JOINT_LIMITS.elbow.flexionMaxDeg,
  );
}

/**
 * Calcula la posición mundial aproximada (z adelante desde tobillo, y vertical desde el suelo)
 * de la articulación del hombro derecho/izquierdo en el plano sagital para `ergo_avatar.glb`,
 * permitiendo cuclillas profundas reales con pie apoyado (dorsiflexión 0°..31.5° y cadera hasta 118°).
 */
function computeShoulderSagittalWorld(
  trunkDeg: number,
  kneeDeg: number,
): {
  shoulderZ: number;
  shoulderY: number;
  hipDeg: number;
  ankleDeg: number;
} {
  // Con la planta del pie apoyada plana en el suelo (y = 0): hipDeg = kneeDeg - ankleDeg (cero levantamiento de puntas)
  const ankleDeg =
    kneeDeg <= 4
      ? 0
      : clamp(
          kneeDeg * 0.28 + Math.max(0, 26 - trunkDeg) * 0.08,
          0,
          NORMATIVE_JOINT_LIMITS.ankle.dorsiflexionMaxDeg,
        );
  const maxHipByAbdomen =
    NORMATIVE_JOINT_LIMITS.hip.maxTrunkPlusHipClosureHardDeg - Math.max(0, trunkDeg);
  const hipDeg = clamp(
    kneeDeg - ankleDeg,
    NORMATIVE_JOINT_LIMITS.hip.extensionMaxDeg,
    Math.min(NORMATIVE_JOINT_LIMITS.hip.flexionMaxDeg, maxHipByAbdomen),
  );

  // Desde tobillo (z = 0, y = ANKLE_HEIGHT_M) hacia arriba por la tibia:
  // En mundo, la tibia se inclina hacia adelante (+Z) el ángulo (kneeDeg - hipDeg)
  const shankFwdRad = (kneeDeg - hipDeg) * DEG2RAD;
  const kneeZ = SHANK_LEN_M * Math.sin(shankFwdRad);
  const kneeY = ANKLE_HEIGHT_M + SHANK_LEN_M * Math.cos(shankFwdRad);

  // Desde rodilla hacia arriba por el muslo:
  // En mundo, el muslo sube hacia atrás (-Z) con ángulo hipDeg (si hipDeg > 90°, la cadera baja levemente respecto a la rodilla en cuclilla profunda)
  const hipRad = hipDeg * DEG2RAD;
  const hipZ = kneeZ - THIGH_LEN_M * Math.sin(hipRad);
  const hipY = kneeY + THIGH_LEN_M * Math.cos(hipRad);

  // Desde articulación coxofemoral hasta hombro pasando por Hips + Spine + Spine1 + Spine2:
  const chordRad = trunkDeg * 0.98 * DEG2RAD;
  const shoulderZ = hipZ + TRUNK_LEN_M * Math.sin(chordRad) - 0.025;
  const shoulderY = hipY + TRUNK_LEN_M * Math.cos(chordRad);

  return { shoulderZ, shoulderY, hipDeg, ankleDeg };
}

/**
 * Resuelve la postura 3D exacta del avatar (`ergo_avatar.glb`) mediante cinemática inversa de 2 eslabones,
 * priorizando por defecto las reglas ergonómicas básicas de levantamiento manual de cargas
 * (rodillas flexionadas + espalda recta alineada) salvo cuando se observe o solicite explícitamente
 * una flexión lumbar severa con piernas extendidas (stoop).
 */
export function solveAvatarLiftPoseForTarget(input: LiftTargetPoseInput): SolvedLiftPoseResult {
  const statureCm = clamp(input.workerHeightCm ?? 172, 145, 205);
  const scaleMPerCm = AVATAR_BASE_STATURE_M / statureCm;

  const vCm = clamp(input.vCm, 5, 190);
  const hCm = clamp(input.hCm, 15, 80);
  const asymDeg = clamp(input.asymmetryDeg ?? 0, -90, 90);
  const loadKg = clamp(input.loadKg ?? 15, 0, 60);

  // Coordenadas objetivo del centro de agarre en metros del estudio 3D (con referencia desde el punto medio de tobillos z=0)
  const targetY = clamp(vCm * scaleMPerCm, 0.14, 1.86);
  const targetZ = clamp(hCm * scaleMPerCm, 0.18, 0.68);

  const hasExplicitTrunk = Number.isFinite(input.trunkFlexHintDeg);
  const hasExplicitKnee = Number.isFinite(input.kneeFlexHintDeg);

  // Determinar estilo biomecánico: si no hay hints o se pide 'hygienic_squat', aplicar regla básica (rodillas flexionadas + espalda recta)
  const effectiveStyle: LiftPostureStyle =
    input.liftStyle === 'hygienic_squat'
      ? 'hygienic_squat'
      : input.liftStyle === 'stoop'
        ? 'stoop'
        : hasExplicitTrunk && input.trunkFlexHintDeg! >= 34 && (!hasExplicitKnee || input.kneeFlexHintDeg! < input.trunkFlexHintDeg!)
          ? 'stoop'
          : hasExplicitTrunk || hasExplicitKnee
            ? 'observed'
            : 'hygienic_squat';

  let trunkDeg = hasExplicitTrunk
    ? clamp(input.trunkFlexHintDeg!, -15, 96)
    : effectiveStyle === 'stoop'
      ? vCm < 45
        ? 66
        : 38
      : vCm < 45
        ? 16
        : vCm < 80
          ? 10
          : vCm >= 135
            ? 4
            : 6;

  let kneeDeg = hasExplicitKnee
    ? clamp(
        input.kneeFlexHintDeg!,
        NORMATIVE_JOINT_LIMITS.knee.flexionMinDeg,
        NORMATIVE_JOINT_LIMITS.knee.flexionMaxDeg,
      )
    : effectiveStyle === 'stoop'
      ? 10
      : vCm < 35
        ? 112
        : vCm < 55
          ? 86
          : vCm < 75
            ? 42
            : 6;

  // En modo higiénico explícito, garantizar espalda recta (≤ 20°–26°) al iniciar la resolución
  if (effectiveStyle === 'hygienic_squat' && vCm < 75) {
    trunkDeg = clamp(trunkDeg, 8, 22);
    kneeDeg = Math.max(kneeDeg, vCm < 38 ? 104 : 74);
  }

  // Coherencia física en colocación alta (pecho, hombros o sobre cabeza):
  if (vCm >= 125) {
    trunkDeg = clamp(trunkDeg, -8, 12);
    kneeDeg = clamp(kneeDeg, NORMATIVE_JOINT_LIMITS.knee.flexionMinDeg, 14);
  } else if (vCm >= 105) {
    trunkDeg = clamp(trunkDeg, -5, 18);
    kneeDeg = clamp(kneeDeg, NORMATIVE_JOINT_LIMITS.knee.flexionMinDeg, 22);
  }

  // Descenso cinemático del hombro para que brazo + antebrazo alcancen targetY sin deformar la postura:
  const maxComfortArmReach = UPPER_ARM_LEN_M + FOREARM_GRIP_LEN_M - 0.016;
  const isSquatPattern =
    effectiveStyle === 'hygienic_squat' ||
    (effectiveStyle === 'observed' && kneeDeg >= trunkDeg);

  let fk = computeShoulderSagittalWorld(trunkDeg, kneeDeg);
  for (let iter = 0; iter < 42; iter++) {
    const dz = targetZ - fk.shoulderZ;
    const dy = targetY - fk.shoulderY;
    const dist = Math.hypot(dz, dy);
    if (dist <= maxComfortArmReach) break;

    if (targetY < fk.shoulderY) {
      if (isSquatPattern) {
        // Prioridad absoluta: flexionar rodillas manteniendo la espalda recta (bisagra coxofemoral neutra)
        if (kneeDeg < 136) {
          kneeDeg = clamp(kneeDeg + 3.5, 0, 136);
          trunkDeg = clamp(trunkDeg + 0.35, 6, effectiveStyle === 'hygienic_squat' ? 24 : 32);
        } else {
          trunkDeg = clamp(trunkDeg + 1.5, 6, effectiveStyle === 'hygienic_squat' ? 26 : 42);
        }
      } else if (effectiveStyle === 'stoop') {
        trunkDeg = clamp(trunkDeg + 3.0, 0, 88);
        kneeDeg = clamp(kneeDeg + 0.4, 0, 26);
      } else {
        trunkDeg = clamp(trunkDeg + 2.2, -10, 84);
        kneeDeg = clamp(kneeDeg + 2.6, 0, 128);
      }
      fk = computeShoulderSagittalWorld(trunkDeg, kneeDeg);
    } else {
      trunkDeg = clamp(trunkDeg - 2.2, -8, 90);
      kneeDeg = clamp(kneeDeg - 2.5, 0, 120);
      fk = computeShoulderSagittalWorld(trunkDeg, kneeDeg);
    }
  }

  // Vector desde hombro (z_S, y_S) hasta agarre de las manos (targetZ, targetY)
  const dz = targetZ - fk.shoulderZ;
  const dy = targetY - fk.shoulderY;
  const rawDist = Math.hypot(dz, dy);
  const L1 = UPPER_ARM_LEN_M;
  const L2 = FOREARM_GRIP_LEN_M;
  const d = clamp(rawDist, Math.abs(L1 - L2) + 0.025, L1 + L2 - 0.01);

  // Ley de cosenos para flexión anatómica del codo (8.5° mín ext .. 149.5° máx flex)
  const cosInterior = clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1);
  const interiorRad = Math.acos(cosInterior);
  const elbowFlexDeg = clamp(
    Math.round((Math.PI - interiorRad) * RAD2DEG),
    NORMATIVE_JOINT_LIMITS.elbow.flexionMinDeg,
    NORMATIVE_JOINT_LIMITS.elbow.flexionMaxDeg,
  );

  // Ángulo mundial de la línea hombro->mano medido hacia adelante (+Z) desde la vertical descendente (0, -1, 0)
  const lineWorldAngleRad = Math.atan2(dz, -dy);
  const cosPsi = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const psiRad = Math.acos(cosPsi);
  const upperArmWorldDeg = (lineWorldAngleRad - psiRad) * RAD2DEG;

  // `biomech3dRenderer.ts` compensa internamente el exceso torácico sobre la cuerda L5/S1->C7,
  // de modo que `shoulderRFlexionDeg` representa exactamente el ángulo goniométrico respecto al eje del tronco (`1.0 * trunkDeg`):
  const trunkWorldPitchDeg = trunkDeg;
  const shoulderLocalFlexDeg = clamp(Math.round(upperArmWorldDeg + trunkWorldPitchDeg), -25, 172);

  // Alineación cervical natural: cuando el tronco se inclina >35°, el cuello extiende levemente (-4°..-12°) para mirar la carga y no enterrar el mentón
  const neckFlexDeg =
    vCm >= 145
      ? -12
      : vCm >= 115
        ? -4
        : isSquatPattern && trunkDeg <= 26
          ? 6
          : trunkDeg >= 48
            ? clamp(Math.round(12 - (trunkDeg - 36) * 0.65), -14, 8)
            : vCm < 55
              ? clamp(Math.round(14 - trunkDeg * 0.22), 2, 14)
              : 6;

  const achievedArmWorldRad = (shoulderLocalFlexDeg - trunkWorldPitchDeg) * DEG2RAD;
  const elbowWorldZ = fk.shoulderZ + L1 * Math.sin(achievedArmWorldRad);
  const elbowWorldY = fk.shoulderY - L1 * Math.cos(achievedArmWorldRad);
  const forearmWorldRad = achievedArmWorldRad + elbowFlexDeg * DEG2RAD;
  const handWorldZ = elbowWorldZ + L2 * Math.sin(forearmWorldRad);
  const handWorldY = elbowWorldY - L2 * Math.cos(forearmWorldRad);

  const finalTrunk = Math.round(trunkDeg);
  const finalKnee = Math.round(kneeDeg);
  const finalHip = Math.round(fk.hipDeg);
  const finalAnkle = Math.round(fk.ankleDeg);

  const pose = clampPoseToNormativeWorkAgeLimits(
    makeNeutralPose({
      trunkFlexionDeg: finalTrunk,
      trunkTwistDeg: Math.round(asymDeg),
      neckFlexionDeg: neckFlexDeg,
      shoulderRFlexionDeg: shoulderLocalFlexDeg,
      shoulderLFlexionDeg: shoulderLocalFlexDeg,
      shoulderRAbductionDeg: -6,
      shoulderLAbductionDeg: -6,
      shoulderRElevated: vCm >= 142,
      elbowRFlexionDeg: elbowFlexDeg,
      elbowLFlexionDeg: elbowFlexDeg,
      forearmRPronationDeg: -18,
      forearmLPronationDeg: 18,
      wristRFlexionDeg: vCm >= 140 ? -8 : -4,
      wristLFlexionDeg: vCm >= 140 ? -8 : -4,
      wristRDeviationDeg: 6,
      wristLDeviationDeg: -6,
      hipRFlexionDeg: finalHip,
      hipLFlexionDeg: finalHip,
      kneeRFlexionDeg: finalKnee,
      kneeLFlexionDeg: finalKnee,
      ankleRDorsiflexionDeg: finalAnkle,
      ankleLDorsiflexionDeg: finalAnkle,
      stanceMode: finalKnee >= 50 ? 'squatting' : 'standing',
      prop: 'box_load',
      handGripMode: 'box_cradle',
      loadKg,
      highlightGroup: 'l5s1_disc',
    }),
  );

  return {
    pose,
    trunkFlexionDeg: finalTrunk,
    kneeFlexionDeg: finalKnee,
    hipFlexionDeg: finalHip,
    ankleDorsiflexionDeg: finalAnkle,
    shoulderFlexionDeg: shoulderLocalFlexDeg,
    elbowFlexionDeg: elbowFlexDeg,
    neckFlexionDeg: neckFlexDeg,
    estimatedHandHeightCm: Math.max(5, Math.round(handWorldY / scaleMPerCm)),
    estimatedHandReachCm: Math.max(15, Math.round(handWorldZ / scaleMPerCm)),
  };
}

/**
 * Intérprete de correcciones rápidas por texto libre en español para el Laboratorio de Testeo del Avatar.
 * Ejemplos soportados:
 * - "levantamiento ideal" / "espalda recta" / "cuclillas"
 * - "arrodillado" / "caballero" / "conductor"
 * - "v 25, h 30, tronco 16, rodillas 110, peso 12"
 */
export interface ParsedQuickTextCommand {
  vCm?: number;
  hCm?: number;
  loadKg?: number;
  liftStyle?: LiftPostureStyle;
  posePatch: Partial<PosturePose3D>;
  useIkTarget?: boolean;
  summaryApplied: string[];
}

export function parseAvatarQuickTextCorrection(rawText: string): ParsedQuickTextCommand {
  const txt = (rawText || '').toLowerCase().trim();
  const posePatch: Partial<PosturePose3D> = {};
  const summaryApplied: string[] = [];
  let vCm: number | undefined;
  let hCm: number | undefined;
  let loadKg: number | undefined;
  let liftStyle: LiftPostureStyle | undefined;
  let useIkTarget = false;

  const extractNum = (regex: RegExp): number | null => {
    const m = txt.match(regex);
    if (!m) return null;
    const val = parseFloat(m[1].replace(',', '.'));
    return Number.isFinite(val) ? val : null;
  };

  if (/\b(levantamiento\s+ideal|postura\s+ideal|espalda\s+recta|cuclillas|higienic[oa]|higiénic[oa])\b/.test(txt)) {
    vCm = 28;
    hCm = 28;
    liftStyle = 'hygienic_squat';
    posePatch.trunkFlexionDeg = 16;
    posePatch.kneeRFlexionDeg = 112;
    posePatch.kneeLFlexionDeg = 112;
    useIkTarget = true;
    summaryApplied.push('Postura Ideal: Rodillas flexionadas (112°) + Espalda recta (16°)');
  } else if (/\b(carga\s+abajo|en\s+el\s+suelo|nivel\s+bajo|agachado)\b/.test(txt)) {
    vCm = 28;
    hCm = 30;
    liftStyle = 'hygienic_squat';
    useIkTarget = true;
    summaryApplied.push('Preset higiénico: Carga abajo con rodillas flexionadas y espalda recta');
  } else if (/\b(sobre\s+(los\s+)?hombros|carga\s+arriba|estanteria\s+alta|nivel\s+alto)\b/.test(txt)) {
    vCm = 148;
    hCm = 36;
    useIkTarget = true;
    summaryApplied.push('Preset: Carga sobre hombros (V=148 cm)');
  } else if (/\b(cintura|media\s+altura|nudillos)\b/.test(txt)) {
    vCm = 78;
    hCm = 26;
    liftStyle = 'hygienic_squat';
    useIkTarget = true;
    summaryApplied.push('Preset óptimo: Carga en nudillos-cintura (V=78 cm, H=26 cm)');
  }

  if (/\bconductor|chofer|volante|omnibus|ómnibus|colectivo|autobus|autobús\b/.test(txt)) {
    posePatch.stanceMode = 'seated';
    posePatch.prop = 'bus_driver_seat';
    posePatch.trunkFlexionDeg = -10;
    posePatch.neckFlexionDeg = 6;
    posePatch.shoulderRFlexionDeg = 22;
    posePatch.shoulderLFlexionDeg = 22;
    posePatch.shoulderRAbductionDeg = 6;
    posePatch.shoulderLAbductionDeg = 6;
    posePatch.elbowRFlexionDeg = 58;
    posePatch.elbowLFlexionDeg = 58;
    posePatch.forearmRPronationDeg = 34;
    posePatch.forearmLPronationDeg = -34;
    posePatch.wristRFlexionDeg = -6;
    posePatch.wristLFlexionDeg = -6;
    posePatch.handGripMode = 'power_grip';
    posePatch.hipRFlexionDeg = 86;
    posePatch.hipLFlexionDeg = 86;
    posePatch.kneeRFlexionDeg = 64;
    posePatch.kneeLFlexionDeg = 64;
    posePatch.ankleRDorsiflexionDeg = -12;
    posePatch.ankleLDorsiflexionDeg = -8;
    summaryApplied.push('Postura Ideal: Chofer de ómnibus/colectivo (volante bajo 35°, Ángulos A–F)');
  } else if (/\bsentad[oa]\b/.test(txt)) {
    posePatch.stanceMode = 'seated';
    posePatch.prop = 'chair';
    posePatch.trunkFlexionDeg = 2;
    posePatch.hipRFlexionDeg = 90;
    posePatch.hipLFlexionDeg = 90;
    posePatch.kneeRFlexionDeg = 90;
    posePatch.kneeLFlexionDeg = 90;
    posePatch.ankleRDorsiflexionDeg = 0;
    posePatch.ankleLDorsiflexionDeg = 0;
    summaryApplied.push('Postura Ideal: Sentado 90°–90°–90°');
  } else if (/\bcaballero|semi[\s-]?arrodillad[oa]\b/.test(txt)) {
    posePatch.stanceMode = 'kneeling';
    posePatch.trunkFlexionDeg = 6;
    posePatch.hipRFlexionDeg = 2;
    posePatch.kneeRFlexionDeg = 92;
    posePatch.ankleRDorsiflexionDeg = -38;
    posePatch.hipLFlexionDeg = 96;
    posePatch.kneeLFlexionDeg = 96;
    posePatch.ankleLDorsiflexionDeg = 0;
    summaryApplied.push('Postura Ideal: Semi-arrodillado caballero (espalda recta)');
  } else if (/\barrodillad[oa]|de\s+rodillas\b/.test(txt)) {
    posePatch.stanceMode = 'kneeling';
    posePatch.trunkFlexionDeg = 6;
    posePatch.hipRFlexionDeg = 2;
    posePatch.hipLFlexionDeg = 2;
    posePatch.kneeRFlexionDeg = 92;
    posePatch.kneeLFlexionDeg = 92;
    posePatch.ankleRDorsiflexionDeg = -38;
    posePatch.ankleLDorsiflexionDeg = -38;
    summaryApplied.push('Postura Ideal: Arrodillado bilateral con espalda recta');
  } else if (/\bde\s+pie\b/.test(txt)) {
    posePatch.stanceMode = 'standing';
    summaryApplied.push('Postura: De pie');
  }

  const vMatch = extractNum(/(?:^|[\s,;])(?:v|altura(?:\s+vertical)?)[\s:=]+(-?\d+(?:[.,]\d+)?)/);
  if (vMatch !== null) {
    vCm = clamp(vMatch, 5, 190);
    useIkTarget = true;
    summaryApplied.push(`V = ${vCm} cm`);
  }

  const hMatch = extractNum(/(?:^|[\s,;])(?:h|distancia(?:\s+horizontal)?)[\s:=]+(-?\d+(?:[.,]\d+)?)/);
  if (hMatch !== null) {
    hCm = clamp(hMatch, 15, 80);
    useIkTarget = true;
    summaryApplied.push(`H = ${hCm} cm`);
  }

  const wMatch = extractNum(/(?:peso|carga|masa)[\s:=]+(\d+(?:[.,]\d+)?)/);
  if (wMatch !== null) {
    loadKg = clamp(wMatch, 0, 60);
    posePatch.loadKg = loadKg;
    posePatch.prop = loadKg > 0 ? 'box_load' : 'none';
    summaryApplied.push(`Carga = ${loadKg} kg`);
  }

  const trunk = extractNum(/(?:tronco|espalda|lumbar)[\s:=]+(-?\d+(?:[.,]\d+)?)/);
  if (trunk !== null) {
    posePatch.trunkFlexionDeg = clamp(trunk, -25, 110);
    summaryApplied.push(`Tronco = ${posePatch.trunkFlexionDeg}°`);
  }

  const twist = extractNum(/(?:giro|asimetria|asimetría|rotacion|rotación)[\s:=]+(-?\d+(?:[.,]\d+)?)/);
  if (twist !== null) {
    posePatch.trunkTwistDeg = clamp(twist, -90, 90);
    summaryApplied.push(`Giro tronco = ${posePatch.trunkTwistDeg}°`);
  }

  const lat = extractNum(/(?:inclinacion|inclinación|lateral)[\s:=]+(-?\d+(?:[.,]\d+)?)/);
  if (lat !== null) {
    posePatch.trunkLateralDeg = clamp(lat, -45, 45);
    summaryApplied.push(`Inclinación lateral = ${posePatch.trunkLateralDeg}°`);
  }

  const neck = extractNum(/(?:cuello|cervical|cabeza)[\s:=]+(-?\d+(?:[.,]\d+)?)/);
  if (neck !== null) {
    posePatch.neckFlexionDeg = clamp(neck, -40, 55);
    summaryApplied.push(`Cuello = ${posePatch.neckFlexionDeg}°`);
  }

  const shR = extractNum(/(?:hombro\s*d(?:er(?:echo)?)?)[\s:=]+(-?\d+(?:[.,]\d+)?)/);
  const shL = extractNum(/(?:hombro\s*i(?:zq(?:uierdo)?)?)[\s:=]+(-?\d+(?:[.,]\d+)?)/);
  const shBoth = extractNum(/(?:hombros?|brazos?)[\s:=]+(-?\d+(?:[.,]\d+)?)/);
  if (shR !== null || shL !== null) {
    if (shR !== null) {
      posePatch.shoulderRFlexionDeg = clamp(shR, -45, 175);
      summaryApplied.push(`Hombro Der = ${posePatch.shoulderRFlexionDeg}°`);
    }
    if (shL !== null) {
      posePatch.shoulderLFlexionDeg = clamp(shL, -45, 175);
      summaryApplied.push(`Hombro Izq = ${posePatch.shoulderLFlexionDeg}°`);
    }
  } else if (shBoth !== null) {
    const v = clamp(shBoth, -45, 175);
    posePatch.shoulderRFlexionDeg = v;
    posePatch.shoulderLFlexionDeg = v;
    summaryApplied.push(`Hombros = ${v}°`);
  }

  const abd = extractNum(/(?:abduccion|abducción)[\s:=]+(-?\d+(?:[.,]\d+)?)/);
  if (abd !== null) {
    const v = clamp(abd, -30, 160);
    posePatch.shoulderRAbductionDeg = v;
    posePatch.shoulderLAbductionDeg = v;
    summaryApplied.push(`Abducción = ${v}°`);
  }

  const elbR = extractNum(/(?:codo\s*d(?:er(?:echo)?)?)[\s:=]+(-?\d+(?:[.,]\d+)?)/);
  const elbL = extractNum(/(?:codo\s*i(?:zq(?:uierdo)?)?)[\s:=]+(-?\d+(?:[.,]\d+)?)/);
  const elbBoth = extractNum(/(?:codos?|antebrazos?)[\s:=]+(-?\d+(?:[.,]\d+)?)/);
  if (elbR !== null || elbL !== null) {
    if (elbR !== null) {
      posePatch.elbowRFlexionDeg = clamp(elbR, 0, 145);
      summaryApplied.push(`Codo Der = ${posePatch.elbowRFlexionDeg}°`);
    }
    if (elbL !== null) {
      posePatch.elbowLFlexionDeg = clamp(elbL, 0, 145);
      summaryApplied.push(`Codo Izq = ${posePatch.elbowLFlexionDeg}°`);
    }
  } else if (elbBoth !== null) {
    const v = clamp(elbBoth, 0, 145);
    posePatch.elbowRFlexionDeg = v;
    posePatch.elbowLFlexionDeg = v;
    summaryApplied.push(`Codos = ${v}°`);
  }

  const prono = extractNum(/(?:pronacion|pronación|supinacion|supinación)[\s:=]+(-?\d+(?:[.,]\d+)?)/);
  if (prono !== null) {
    posePatch.forearmRPronationDeg = clamp(prono, -90, 90);
    summaryApplied.push(`Pronosupinación = ${posePatch.forearmRPronationDeg}°`);
  }

  const wrist = extractNum(/(?:muneca|muñeca|munecas|muñecas)[\s:=]+(-?\d+(?:[.,]\d+)?)/);
  if (wrist !== null) {
    const v = clamp(wrist, -70, 80);
    posePatch.wristRFlexionDeg = v;
    posePatch.wristLFlexionDeg = v;
    summaryApplied.push(`Muñecas = ${v}°`);
  }

  const dev = extractNum(/(?:desviacion|desviación|cubital|radial)[\s:=]+(-?\d+(?:[.,]\d+)?)/);
  if (dev !== null) {
    posePatch.wristRDeviationDeg = clamp(dev, -30, 40);
    summaryApplied.push(`Desviación muñeca = ${posePatch.wristRDeviationDeg}°`);
  }

  const hip = extractNum(/(?:caderas?)[\s:=]+(-?\d+(?:[.,]\d+)?)/);
  if (hip !== null) {
    const v = clamp(hip, -30, 125);
    posePatch.hipRFlexionDeg = v;
    posePatch.hipLFlexionDeg = v;
    summaryApplied.push(`Caderas = ${v}°`);
  }

  const knee = extractNum(/(?:rodillas?)[\s:=]+(-?\d+(?:[.,]\d+)?)/);
  if (knee !== null) {
    const v = clamp(knee, 0, 135);
    posePatch.kneeRFlexionDeg = v;
    posePatch.kneeLFlexionDeg = v;
    summaryApplied.push(`Rodillas = ${v}°`);
  }

  const ankle = extractNum(/(?:tobillos?|dorsiflexion|dorsiflexión)[\s:=]+(-?\d+(?:[.,]\d+)?)/);
  if (ankle !== null) {
    const v = clamp(ankle, -40, 40);
    posePatch.ankleRDorsiflexionDeg = v;
    posePatch.ankleLDorsiflexionDeg = v;
    summaryApplied.push(`Tobillos = ${v}°`);
  }

  if (/\bsin\s+(caja|carga|objeto)\b/.test(txt)) {
    posePatch.prop = 'none';
    summaryApplied.push('Objeto: Ninguno');
  } else if (/\bcon\s+caja\b/.test(txt)) {
    posePatch.prop = 'box_load';
    summaryApplied.push('Objeto: Caja');
  }

  return { vCm, hCm, loadKg, liftStyle, posePatch, useIkTarget, summaryApplied };
}

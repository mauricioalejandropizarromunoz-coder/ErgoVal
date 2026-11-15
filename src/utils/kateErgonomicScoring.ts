import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  PageBreak,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import {
  RULA_TABLE_A,
  RULA_TABLE_B,
  RULA_TABLE_C,
  REBA_TABLE_A,
  REBA_TABLE_B,
  REBA_TABLE_C,
  getOwasCategory,
} from './calculations';
import {
  KateFullPoseAnglesSnapshot,
  KateMeasuredAngle,
  KatePoseParams,
  KateSheetPrintSummary,
} from './kateAvatarEngine';

export interface KateErgonomicModifiers {
  loadKg: number;
  shockForce: boolean;
  coupling: 0 | 1 | 2 | 3; // 0 Bueno, 1 Regular, 2 Malo, 3 Inaceptable
  staticPosture: boolean; // > 1 min estática o >=4 rep/min
  repetitiveTask: boolean; // > 4 cambios/min o repetitiva
  unstableChanges: boolean; // cambios posturales rápidos/inestables (REBA)
  shoulderLRaised: boolean;
  shoulderRRaised: boolean;
  armLSupported: boolean;
  armRSupported: boolean;
  forearmLCrossMidline: boolean;
  forearmRCrossMidline: boolean;
  legsBalanced: boolean;
  postureBase: 'auto' | 'standing' | 'sitting' | 'kneeling' | 'squat' | 'walking';
}

export function createDefaultKateErgonomicModifiers(): KateErgonomicModifiers {
  return {
    loadKg: 0,
    shockForce: false,
    coupling: 0,
    staticPosture: true, // Posturas estáticas de trance (> 1 min, sin carga externa)
    repetitiveTask: false,
    unstableChanges: false,
    shoulderLRaised: false,
    shoulderRRaised: false,
    armLSupported: false,
    armRSupported: false,
    forearmLCrossMidline: false,
    forearmRCrossMidline: false,
    legsBalanced: true,
    postureBase: 'auto',
  };
}

export interface KateAngleScoreRow {
  code: string;
  key: string;
  segment: string;
  angleDeg: number;
  angleText: string;
  rulaBase: number;
  rulaRule: string;
  rebaBase: number;
  rebaRule: string;
  owasCodeText: string;
  rulaText: string;
  rebaText: string;
}

export interface KateCorrectionItem {
  target: string;
  method: 'RULA' | 'REBA' | 'OWAS' | 'RULA / REBA';
  deltaText: string;
  reason: string;
}

export interface KateStepByStepScoringResult {
  angleRows: KateAngleScoreRow[];
  corrections: KateCorrectionItem[];
  rula: {
    armLBase: number;
    armLAdj: number;
    armLFinal: number;
    armRBase: number;
    armRAdj: number;
    armRFinal: number;
    foreLBase: number;
    foreLFinal: number;
    foreRBase: number;
    foreRFinal: number;
    wristLBase: number;
    wristLFinal: number;
    wristLTwist: 1 | 2;
    wristRBase: number;
    wristRFinal: number;
    wristRTwist: 1 | 2;
    neckBase: number;
    neckAdj: number;
    neckFinal: number;
    trunkBase: number;
    trunkAdj: number;
    trunkFinal: number;
    legsScore: 1 | 2;
    muscleA: 0 | 1;
    forceA: 0 | 1 | 2 | 3;
    muscleB: 0 | 1;
    forceB: 0 | 1 | 2 | 3;
    scoreAL: number;
    scoreCL: number;
    finalL: number;
    scoreAR: number;
    scoreCR: number;
    finalR: number;
    scoreB: number;
    scoreD: number;
    finalWorst: number;
    worstSide: 'Derecho' | 'Izquierdo';
    actionLevel: number;
    actionLevelL: number;
    actionLevelR: number;
    actionText: string;
  };
  reba: {
    trunkBase: number;
    trunkAdj: number;
    trunkFinal: number;
    neckBase: number;
    neckAdj: number;
    neckFinal: number;
    legsBase: 1 | 2;
    kneeFlexAdd: 0 | 1 | 2;
    legsFinal: number;
    tableA: number;
    loadPoints: number;
    scoreA: number;
    armLBase: number;
    armLFinal: number;
    armRBase: number;
    armRFinal: number;
    foreLBase: number;
    foreRBase: number;
    wristLBase: number;
    wristLFinal: number;
    wristRBase: number;
    wristRFinal: number;
    tableBL: number;
    scoreBL: number;
    tableBR: number;
    scoreBR: number;
    coupling: 0 | 1 | 2 | 3;
    activityScore: number;
    tableCL: number;
    finalL: number;
    tableCR: number;
    finalR: number;
    finalWorst: number;
    worstSide: 'Derecho' | 'Izquierdo';
    actionLevel: number;
    actionLevelL: number;
    actionLevelR: number;
    actionText: string;
  };
  owas: {
    backCode: 1 | 2 | 3 | 4;
    backLabel: string;
    armsCode: 1 | 2 | 3;
    armsLabel: string;
    legsCode: 1 | 2 | 3 | 4 | 5 | 6 | 7;
    legsLabel: string;
    loadCode: 1 | 2 | 3;
    loadLabel: string;
    fourDigitCode: string;
    actionCategory: 1 | 2 | 3 | 4;
    actionText: string;
  };
  printSummary: KateSheetPrintSummary;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function scoreArmBase(degSigned: number): { pts: 1 | 2 | 3 | 4; rule: string } {
  if (degSigned >= -20 && degSigned <= 20) return { pts: 1, rule: '-20° a 20°' };
  if (degSigned < -20) return { pts: 2, rule: 'Ext. > 20°' };
  if (degSigned <= 45) return { pts: 2, rule: '20°–45°' };
  if (degSigned <= 90) return { pts: 3, rule: '45°–90°' };
  return { pts: 4, rule: '> 90°' };
}

function scoreForearmBase(flexDeg: number): { pts: 1 | 2; rule: string } {
  if (flexDeg >= 60 && flexDeg <= 100) return { pts: 1, rule: '60°–100°' };
  if (flexDeg < 60) return { pts: 2, rule: '< 60°' };
  return { pts: 2, rule: '> 100°' };
}

function scoreNeckRulaBase(degSigned: number): { pts: 1 | 2 | 3 | 4; rule: string } {
  if (degSigned < -3) return { pts: 4, rule: 'Extensión < 0°' };
  if (degSigned <= 10) return { pts: 1, rule: '0°–10°' };
  if (degSigned <= 20) return { pts: 2, rule: '10°–20°' };
  return { pts: 3, rule: '> 20°' };
}

function scoreNeckRebaBase(degSigned: number): { pts: 1 | 2; rule: string } {
  if (degSigned < -3) return { pts: 2, rule: 'Extensión < 0°' };
  if (degSigned <= 20) return { pts: 1, rule: '0°–20°' };
  return { pts: 2, rule: '> 20°' };
}

function scoreTrunkRulaBase(degSigned: number): { pts: 1 | 2 | 3 | 4; rule: string } {
  if (Math.abs(degSigned) <= 3) return { pts: 1, rule: 'Ergido (0°)' };
  if (degSigned < -3) return { pts: 2, rule: 'Extensión' };
  if (degSigned <= 20) return { pts: 2, rule: '0°–20°' };
  if (degSigned <= 60) return { pts: 3, rule: '20°–60°' };
  return { pts: 4, rule: '> 60°' };
}

function scoreTrunkRebaBase(degSigned: number): { pts: 1 | 2 | 3 | 4; rule: string } {
  if (Math.abs(degSigned) <= 3) return { pts: 1, rule: 'Ergido (0°)' };
  if (degSigned < -20) return { pts: 3, rule: 'Ext. > 20°' };
  if (degSigned < -3) return { pts: 2, rule: 'Ext. 0°–20°' };
  if (degSigned <= 20) return { pts: 2, rule: '0°–20°' };
  if (degSigned <= 60) return { pts: 3, rule: '20°–60°' };
  return { pts: 4, rule: '> 60°' };
}

function scoreWristRulaBase(flexDeg: number): { pts: 1 | 2 | 3; rule: string } {
  if (flexDeg <= 2) return { pts: 1, rule: 'Neutra (0°)' };
  if (flexDeg <= 15) return { pts: 2, rule: '1°–15°' };
  return { pts: 3, rule: '> 15°' };
}

function scoreWristRebaBase(flexDeg: number): { pts: 1 | 2; rule: string } {
  if (flexDeg <= 15) return { pts: 1, rule: '0°–15°' };
  return { pts: 2, rule: '> 15°' };
}

export function computeKateErgonomicScoring(
  snapshot: KateFullPoseAnglesSnapshot,
  params: KatePoseParams,
  modifiers: KateErgonomicModifiers,
  basePosturalLabel?: string,
): KateStepByStepScoringResult {
  const getAngle = (key: string): KateMeasuredAngle | undefined =>
    snapshot.allAngles.find((a) => a.key === key);

  const neckA = getAngle('neck');
  const trunkA = getAngle('trunk');
  const armLA = getAngle('armL');
  const armRA = getAngle('armR');
  const foreLA = getAngle('forearmL');
  const foreRA = getAngle('forearmR');
  const hipLA = getAngle('hipL');
  const hipRA = getAngle('hipR');
  const kneeLA = getAngle('kneeL');
  const kneeRA = getAngle('kneeR');

  const neckDeg = Math.round(neckA?.rawDeg ?? params.neckFlexDeg);
  const trunkDeg = Math.round(trunkA?.rawDeg ?? params.trunkFlexDeg);
  const armLDeg = Math.round(armLA?.rawDeg ?? params.shoulderLFlexDeg);
  const armRDeg = Math.round(armRA?.rawDeg ?? params.shoulderRFlexDeg);
  const foreLFlexDeg = Math.round(foreLA?.rawDeg ?? params.elbowLFlexDeg);
  const foreRFlexDeg = Math.round(foreRA?.rawDeg ?? params.elbowRFlexDeg);
  const kneeLFlexDeg = Math.round(kneeLA?.rawDeg ?? snapshot.kneeLFlexDeg);
  const kneeRFlexDeg = Math.round(kneeRA?.rawDeg ?? snapshot.kneeRFlexDeg);

  // Detección de torsión, inclinación lateral y abducción desde esqueleto 3D + parámetros
  const neckRot = snapshot.neckTwistDeg > 10;
  const neckSide = snapshot.neckSideDeg > 10;
  const trunkTwist = snapshot.trunkTwistDeg > 10;
  const trunkSide = snapshot.trunkSideDeg > 10;

  const armLAbd = snapshot.shoulderLAbdDeg >= 20;
  const armRAbd = snapshot.shoulderRAbdDeg >= 20;
  const armLSup = modifiers.armLSupported || params.apoL !== 'none';
  const armRSup = modifiers.armRSupported || params.apoR !== 'none';

  const wristLDev = snapshot.wristLYawDeg > 10;
  const wristRDev = snapshot.wristRYawDeg > 10;
  const wristLTwist: 1 | 2 = snapshot.wristLRollDeg > 45 ? 2 : 1;
  const wristRTwist: 1 | 2 = snapshot.wristRRollDeg > 45 ? 2 : 1;

  // OWAS Back (1..4)
  const trunkBentOwas = Math.abs(trunkDeg) >= 20;
  const trunkTwistOwas = trunkTwist || trunkSide;
  const owasBackCode: 1 | 2 | 3 | 4 =
    trunkBentOwas && trunkTwistOwas
      ? 4
      : trunkTwistOwas
        ? 3
        : trunkBentOwas
          ? 2
          : 1;
  const owasBackLabel =
    owasBackCode === 1
      ? 'Espalda recta'
      : owasBackCode === 2
        ? 'Espalda flexionada/inclinada (≥20°)'
        : owasBackCode === 3
          ? 'Espalda con giro/inclinación'
          : 'Espalda flexionada y girada';

  // OWAS Arms (1..3)
  const armLUp90 = snapshot.armLElevDeg >= 90 || Math.abs(armLDeg) >= 90;
  const armRUp90 = snapshot.armRElevDeg >= 90 || Math.abs(armRDeg) >= 90;
  const owasArmsCode: 1 | 2 | 3 =
    armLUp90 && armRUp90 ? 3 : armLUp90 || armRUp90 ? 2 : 1;
  const owasArmsLabel =
    owasArmsCode === 1
      ? 'Ambos brazos < 90° (bajo hombro)'
      : owasArmsCode === 2
        ? 'Un brazo ≥ 90° (nivel hombro o sup.)'
        : 'Ambos brazos ≥ 90° (nivel hombro o sup.)';

  // OWAS Legs (1..7)
  const maxKneeFlex = Math.max(kneeLFlexDeg, kneeRFlexDeg);
  const minKneeFlex = Math.min(kneeLFlexDeg, kneeRFlexDeg);
  const maxHipFlex = Math.max(snapshot.hipLFlexDeg, snapshot.hipRFlexDeg);
  const avgHipAbd = (snapshot.hipLAbdDeg + snapshot.hipRAbdDeg) * 0.5;

  let owasLegsCode: 1 | 2 | 3 | 4 | 5 | 6 | 7 = 2;
  let owasLegsLabel = 'De pie, piernas rectas (<30°)';
  if (modifiers.postureBase === 'sitting') {
    owasLegsCode = 1;
    owasLegsLabel = 'Sentado';
  } else if (modifiers.postureBase === 'kneeling') {
    owasLegsCode = 6;
    owasLegsLabel = 'Arrodillado (una o ambas rodillas)';
  } else if (modifiers.postureBase === 'squat') {
    owasLegsCode = 4;
    owasLegsLabel = 'Rodillas flexionadas (ambas)';
  } else if (modifiers.postureBase === 'walking') {
    owasLegsCode = 7;
    owasLegsLabel = 'Caminando / desplazamiento';
  } else if (modifiers.postureBase === 'standing') {
    owasLegsCode = modifiers.legsBalanced ? 2 : 3;
    owasLegsLabel = modifiers.legsBalanced
      ? 'De pie sobre piernas rectas'
      : 'De pie con apoyo unilateral';
  } else {
    // Auto-inferencia desde 3D
    if (maxHipFlex > 65 && avgHipAbd > 16) {
      owasLegsCode = 1;
      owasLegsLabel = 'Sentado / loto';
    } else if (maxKneeFlex > 75 && maxHipFlex < 45) {
      owasLegsCode = 6;
      owasLegsLabel = 'Arrodillado';
    } else if (minKneeFlex >= 45) {
      owasLegsCode = 4;
      owasLegsLabel = 'De pie con rodillas flexionadas';
    } else if (maxKneeFlex >= 45 && minKneeFlex < 20) {
      owasLegsCode = 5;
      owasLegsLabel = 'Peso en una pierna flexionada';
    } else if (!modifiers.legsBalanced) {
      owasLegsCode = 3;
      owasLegsLabel = 'Peso sobre una pierna recta';
    } else {
      owasLegsCode = 2;
      owasLegsLabel = 'De pie sobre ambas piernas';
    }
  }

  // OWAS Load (1..3)
  const owasLoadCode: 1 | 2 | 3 =
    modifiers.loadKg > 20 ? 3 : modifiers.loadKg >= 10 ? 2 : 1;
  const owasLoadLabel =
    owasLoadCode === 1 ? '< 10 kg' : owasLoadCode === 2 ? '10–20 kg' : '> 20 kg';

  const owasActionCat = getOwasCategory(
    owasBackCode,
    owasArmsCode,
    owasLegsCode,
    owasLoadCode,
  );
  const owasActionText =
    owasActionCat === 1
      ? 'Cat. 1 — Postura normal, no requiere medidas'
      : owasActionCat === 2
        ? 'Cat. 2 — Posible daño, corregir a medio plazo'
        : owasActionCat === 3
          ? 'Cat. 3 — Efectos dañinos, corregir a corto plazo'
          : 'Cat. 4 — Muy dañina, corrección inmediata';

  // Puntajes base por segmento
  const neckRula = scoreNeckRulaBase(neckDeg);
  const neckReba = scoreNeckRebaBase(neckDeg);
  const trunkRula = scoreTrunkRulaBase(trunkDeg);
  const trunkReba = scoreTrunkRebaBase(trunkDeg);
  const armLRula = scoreArmBase(armLDeg);
  const armRRula = scoreArmBase(armRDeg);
  const foreLRula = scoreForearmBase(foreLFlexDeg);
  const foreRRula = scoreForearmBase(foreRFlexDeg);
  const wristLRula = scoreWristRulaBase(snapshot.wristLFlexDeg);
  const wristRRula = scoreWristRulaBase(snapshot.wristRFlexDeg);
  const wristLReba = scoreWristRebaBase(snapshot.wristLFlexDeg);
  const wristRReba = scoreWristRebaBase(snapshot.wristRFlexDeg);

  // Flexión de rodillas para REBA piernas
  const kneeFlexAdd: 0 | 1 | 2 =
    maxKneeFlex > 60 || owasLegsCode === 4 || owasLegsCode === 6
      ? 2
      : maxKneeFlex >= 30
        ? 1
        : 0;
  const legsBalancedEffective =
    modifiers.legsBalanced && Math.abs(kneeLFlexDeg - kneeRFlexDeg) <= 35;
  const rulaLegsScore: 1 | 2 = legsBalancedEffective ? 1 : 2;
  const rebaLegsBase: 1 | 2 =
    legsBalancedEffective || owasLegsCode === 1 ? 1 : 2;
  const rebaLegsFinal = clamp(rebaLegsBase + kneeFlexAdd, 1, 4);

  // Listado de filas por ángulo medido (todos los visibles + mandatorios si faltan)
  const formatDisp = (a: KateMeasuredAngle | undefined, fallbackDeg: number, isSigned: boolean, isFlex: boolean) => {
    if (a) return a.textValue;
    const val = isFlex ? (params.convention === 'flex' ? fallbackDeg : 180 - fallbackDeg) : fallbackDeg;
    const r = Math.round(val);
    return isSigned ? `${r >= 0 ? '+' : '−'}${Math.abs(r)}°` : `${Math.abs(r)}°`;
  };

  const fmtPts = (n: number, rule: string) => `${n} ${n === 1 ? 'pt' : 'pts'} (${rule})`;

  const angleRows: KateAngleScoreRow[] = [
    {
      code: neckA && neckA.letter !== '—' ? neckA.letter : '—',
      key: 'neck',
      segment: 'Cuello',
      angleDeg: neckDeg,
      angleText: formatDisp(neckA, neckDeg, true, false),
      rulaBase: neckRula.pts,
      rulaRule: neckRula.rule,
      rebaBase: neckReba.pts,
      rebaRule: neckReba.rule,
      owasCodeText: '—',
      rulaText: fmtPts(neckRula.pts, neckRula.rule),
      rebaText: fmtPts(neckReba.pts, neckReba.rule),
    },
    {
      code: trunkA && trunkA.letter !== '—' ? trunkA.letter : '—',
      key: 'trunk',
      segment: 'Tronco / Espalda',
      angleDeg: trunkDeg,
      angleText: formatDisp(trunkA, trunkDeg, true, false),
      rulaBase: trunkRula.pts,
      rulaRule: trunkRula.rule,
      rebaBase: trunkReba.pts,
      rebaRule: trunkReba.rule,
      owasCodeText: `Espalda ${owasBackCode}`,
      rulaText: fmtPts(trunkRula.pts, trunkRula.rule),
      rebaText: fmtPts(trunkReba.pts, trunkReba.rule),
    },
    {
      code: armLA && armLA.letter !== '—' ? armLA.letter : '—',
      key: 'armL',
      segment: 'Brazo izq.',
      angleDeg: armLDeg,
      angleText: formatDisp(armLA, armLDeg, true, false),
      rulaBase: armLRula.pts,
      rulaRule: armLRula.rule,
      rebaBase: armLRula.pts,
      rebaRule: armLRula.rule,
      owasCodeText: armLUp90 ? '≥90° (sup.)' : '<90° (bajo)',
      rulaText: fmtPts(armLRula.pts, armLRula.rule),
      rebaText: fmtPts(armLRula.pts, armLRula.rule),
    },
    {
      code: armRA && armRA.letter !== '—' ? armRA.letter : '—',
      key: 'armR',
      segment: 'Brazo der.',
      angleDeg: armRDeg,
      angleText: formatDisp(armRA, armRDeg, true, false),
      rulaBase: armRRula.pts,
      rulaRule: armRRula.rule,
      rebaBase: armRRula.pts,
      rebaRule: armRRula.rule,
      owasCodeText: armRUp90 ? '≥90° (sup.)' : '<90° (bajo)',
      rulaText: fmtPts(armRRula.pts, armRRula.rule),
      rebaText: fmtPts(armRRula.pts, armRRula.rule),
    },
    {
      code: foreLA && foreLA.letter !== '—' ? foreLA.letter : '—',
      key: 'forearmL',
      segment: 'Antebrazo izq.',
      angleDeg: foreLFlexDeg,
      angleText: formatDisp(foreLA, foreLFlexDeg, false, true),
      rulaBase: foreLRula.pts,
      rulaRule: foreLRula.rule,
      rebaBase: foreLRula.pts,
      rebaRule: foreLRula.rule,
      owasCodeText: 'En brazo',
      rulaText: fmtPts(foreLRula.pts, foreLRula.rule),
      rebaText: fmtPts(foreLRula.pts, foreLRula.rule),
    },
    {
      code: foreRA && foreRA.letter !== '—' ? foreRA.letter : '—',
      key: 'forearmR',
      segment: 'Antebrazo der.',
      angleDeg: foreRFlexDeg,
      angleText: formatDisp(foreRA, foreRFlexDeg, false, true),
      rulaBase: foreRRula.pts,
      rulaRule: foreRRula.rule,
      rebaBase: foreRRula.pts,
      rebaRule: foreRRula.rule,
      owasCodeText: 'En brazo',
      rulaText: fmtPts(foreRRula.pts, foreRRula.rule),
      rebaText: fmtPts(foreRRula.pts, foreRRula.rule),
    },
    ...(hipLA && params.show.hipL
      ? [
          {
            code: hipLA.letter,
            key: 'hipL',
            segment: 'Cadera izq.',
            angleDeg: Math.round(hipLA.rawDeg),
            angleText: hipLA.textValue,
            rulaBase: rulaLegsScore,
            rulaRule: 'Soporte',
            rebaBase: rebaLegsBase,
            rebaRule: 'Base',
            owasCodeText: `Piernas ${owasLegsCode}`,
            rulaText: `${rulaLegsScore} pt (soporte)`,
            rebaText: `${rebaLegsBase} pt (base)`,
          },
        ]
      : []),
    ...(hipRA && params.show.hipR
      ? [
          {
            code: hipRA.letter,
            key: 'hipR',
            segment: 'Cadera der.',
            angleDeg: Math.round(hipRA.rawDeg),
            angleText: hipRA.textValue,
            rulaBase: rulaLegsScore,
            rulaRule: 'Soporte',
            rebaBase: rebaLegsBase,
            rebaRule: 'Base',
            owasCodeText: `Piernas ${owasLegsCode}`,
            rulaText: `${rulaLegsScore} pt (soporte)`,
            rebaText: `${rebaLegsBase} pt (base)`,
          },
        ]
      : []),
    {
      code: kneeLA && kneeLA.letter !== '—' ? kneeLA.letter : '—',
      key: 'kneeL',
      segment: 'Pierna izq.',
      angleDeg: kneeLFlexDeg,
      angleText: formatDisp(kneeLA, kneeLFlexDeg, false, true),
      rulaBase: rulaLegsScore,
      rulaRule: legsBalancedEffective ? 'Estable' : 'Inestable',
      rebaBase: rebaLegsBase + (kneeLFlexDeg > 60 ? 2 : kneeLFlexDeg >= 30 ? 1 : 0),
      rebaRule: kneeLFlexDeg > 60 ? '>60°' : kneeLFlexDeg >= 30 ? '30°–60°' : '<30°',
      owasCodeText: `Piernas ${owasLegsCode}`,
      rulaText: `${rulaLegsScore} pt (${legsBalancedEffective ? 'estable' : 'deseq.'})`,
      rebaText: `${rebaLegsBase + (kneeLFlexDeg > 60 ? 2 : kneeLFlexDeg >= 30 ? 1 : 0)} pts (${kneeLFlexDeg > 60 ? '>60°' : kneeLFlexDeg >= 30 ? '30–60°' : '<30°'})`,
    },
    {
      code: kneeRA && kneeRA.letter !== '—' ? kneeRA.letter : '—',
      key: 'kneeR',
      segment: 'Pierna der.',
      angleDeg: kneeRFlexDeg,
      angleText: formatDisp(kneeRA, kneeRFlexDeg, false, true),
      rulaBase: rulaLegsScore,
      rulaRule: legsBalancedEffective ? 'Estable' : 'Inestable',
      rebaBase: rebaLegsBase + (kneeRFlexDeg > 60 ? 2 : kneeRFlexDeg >= 30 ? 1 : 0),
      rebaRule: kneeRFlexDeg > 60 ? '>60°' : kneeRFlexDeg >= 30 ? '30°–60°' : '<30°',
      owasCodeText: `Piernas ${owasLegsCode}`,
      rulaText: `${rulaLegsScore} pt (${legsBalancedEffective ? 'estable' : 'deseq.'})`,
      rebaText: `${rebaLegsBase + (kneeRFlexDeg > 60 ? 2 : kneeRFlexDeg >= 30 ? 1 : 0)} pts (${kneeRFlexDeg > 60 ? '>60°' : kneeRFlexDeg >= 30 ? '30–60°' : '<30°'})`,
    },
    {
      code: 'M-I',
      key: 'wristL',
      segment: 'Muñeca izq.',
      angleDeg: snapshot.wristLFlexDeg,
      angleText: `${snapshot.wristLFlexDeg}°`,
      rulaBase: wristLRula.pts,
      rulaRule: wristLRula.rule,
      rebaBase: wristLReba.pts,
      rebaRule: wristLReba.rule,
      owasCodeText: '—',
      rulaText: fmtPts(wristLRula.pts, wristLRula.rule),
      rebaText: fmtPts(wristLReba.pts, wristLReba.rule),
    },
    {
      code: 'M-D',
      key: 'wristR',
      segment: 'Muñeca der.',
      angleDeg: snapshot.wristRFlexDeg,
      angleText: `${snapshot.wristRFlexDeg}°`,
      rulaBase: wristRRula.pts,
      rulaRule: wristRRula.rule,
      rebaBase: wristRReba.pts,
      rebaRule: wristRReba.rule,
      owasCodeText: '—',
      rulaText: fmtPts(wristRRula.pts, wristRRula.rule),
      rebaText: fmtPts(wristRReba.pts, wristRReba.rule),
    },
  ];

  // Correcciones / Penalizaciones aplicadas
  const corrections: KateCorrectionItem[] = [];
  if (neckRot) corrections.push({ target: 'Cuello', method: 'RULA / REBA', deltaText: '+1', reason: `Rotación cervical (${snapshot.neckTwistDeg}° > 10°)` });
  if (neckSide) corrections.push({ target: 'Cuello', method: 'RULA / REBA', deltaText: '+1', reason: `Inclinación lateral cuello (${snapshot.neckSideDeg}° > 10°)` });
  if (trunkTwist) corrections.push({ target: 'Tronco', method: 'RULA / REBA', deltaText: '+1', reason: `Torsión de tronco (${snapshot.trunkTwistDeg}° > 10°)` });
  if (trunkSide) corrections.push({ target: 'Tronco', method: 'RULA / REBA', deltaText: '+1', reason: `Inclinación lateral de tronco (${snapshot.trunkSideDeg}° > 10°)` });
  if (modifiers.shoulderLRaised) corrections.push({ target: 'Hombro izq.', method: 'RULA / REBA', deltaText: '+1', reason: 'Hombro elevado' });
  if (modifiers.shoulderRRaised) corrections.push({ target: 'Hombro der.', method: 'RULA / REBA', deltaText: '+1', reason: 'Hombro elevado' });
  if (armLAbd) corrections.push({ target: 'Brazo izq.', method: 'RULA / REBA', deltaText: '+1', reason: `Brazo abducido (${snapshot.shoulderLAbdDeg}° ≥ 20°)` });
  if (armRAbd) corrections.push({ target: 'Brazo der.', method: 'RULA / REBA', deltaText: '+1', reason: `Brazo abducido (${snapshot.shoulderRAbdDeg}° ≥ 20°)` });
  if (armLSup) corrections.push({ target: 'Brazo izq.', method: 'RULA / REBA', deltaText: '−1', reason: 'Brazo apoyado / descarga peso' });
  if (armRSup) corrections.push({ target: 'Brazo der.', method: 'RULA / REBA', deltaText: '−1', reason: 'Brazo apoyado / descarga peso' });
  if (modifiers.forearmLCrossMidline) corrections.push({ target: 'Antebrazo izq.', method: 'RULA', deltaText: '+1', reason: 'Cruza línea media o fuera del cuerpo' });
  if (modifiers.forearmRCrossMidline) corrections.push({ target: 'Antebrazo der.', method: 'RULA', deltaText: '+1', reason: 'Cruza línea media o fuera del cuerpo' });
  if (wristLDev) corrections.push({ target: 'Muñeca izq.', method: 'RULA / REBA', deltaText: '+1', reason: `Desviación radial/cubital (${snapshot.wristLYawDeg}° > 10°)` });
  if (wristRDev) corrections.push({ target: 'Muñeca der.', method: 'RULA / REBA', deltaText: '+1', reason: `Desviación radial/cubital (${snapshot.wristRYawDeg}° > 10°)` });
  if (kneeFlexAdd > 0) corrections.push({ target: 'Rodillas', method: 'REBA', deltaText: `+${kneeFlexAdd}`, reason: `Flexión de rodilla (${maxKneeFlex}°)` });

  // Cargas, actividad y agarre
  const rulaForceScore: 0 | 1 | 2 | 3 =
    modifiers.loadKg > 10 && (modifiers.staticPosture || modifiers.repetitiveTask)
      ? 3
      : modifiers.loadKg >= 2 && modifiers.loadKg <= 10 && (modifiers.staticPosture || modifiers.repetitiveTask)
        ? 2
        : modifiers.loadKg > 10
          ? 2
          : modifiers.loadKg >= 2
            ? 1
            : 0;
  const rulaMuscle: 0 | 1 = modifiers.staticPosture || modifiers.repetitiveTask ? 1 : 0;

  if (rulaMuscle > 0) corrections.push({ target: 'Actividad muscular', method: 'RULA', deltaText: '+1', reason: 'Postura estática (>1 min) o repetitiva' });
  if (rulaForceScore > 0) corrections.push({ target: 'Carga / Fuerza', method: 'RULA', deltaText: `+${rulaForceScore}`, reason: `Carga manipulada ${modifiers.loadKg} kg` });

  const rebaLoadBase = modifiers.loadKg > 10 ? 2 : modifiers.loadKg >= 5 ? 1 : 0;
  const rebaLoadPoints = rebaLoadBase + (modifiers.shockForce ? 1 : 0);
  if (rebaLoadPoints > 0) {
    corrections.push({
      target: 'Carga / Fuerza',
      method: 'REBA',
      deltaText: `+${rebaLoadPoints}`,
      reason: `${modifiers.loadKg} kg${modifiers.shockForce ? ' + impacto brusco' : ''}`,
    });
  }
  if (modifiers.coupling > 0) {
    corrections.push({
      target: 'Agarre / Acoplamiento',
      method: 'REBA',
      deltaText: `+${modifiers.coupling}`,
      reason: modifiers.coupling === 1 ? 'Regular' : modifiers.coupling === 2 ? 'Malo' : 'Inaceptable',
    });
  }
  const rebaActivityScore =
    (modifiers.staticPosture ? 1 : 0) +
    (modifiers.repetitiveTask ? 1 : 0) +
    (modifiers.unstableChanges ? 1 : 0);
  if (rebaActivityScore > 0) {
    corrections.push({
      target: 'Actividad REBA',
      method: 'REBA',
      deltaText: `+${rebaActivityScore}`,
      reason: [
        modifiers.staticPosture ? 'Estática' : null,
        modifiers.repetitiveTask ? 'Repetitiva' : null,
        modifiers.unstableChanges ? 'Inestable' : null,
      ]
        .filter(Boolean)
        .join(' + '),
    });
  }

  // --- Cálculo RULA Paso a Paso ---
  const armLAdj = (modifiers.shoulderLRaised ? 1 : 0) + (armLAbd ? 1 : 0) - (armLSup ? 1 : 0);
  const armRAdj = (modifiers.shoulderRRaised ? 1 : 0) + (armRAbd ? 1 : 0) - (armRSup ? 1 : 0);
  const rulaArmLFinal = clamp(armLRula.pts + armLAdj, 1, 6);
  const rulaArmRFinal = clamp(armRRula.pts + armRAdj, 1, 6);

  const rulaForeLFinal = clamp(foreLRula.pts + (modifiers.forearmLCrossMidline ? 1 : 0), 1, 3);
  const rulaForeRFinal = clamp(foreRRula.pts + (modifiers.forearmRCrossMidline ? 1 : 0), 1, 3);

  const rulaWristLFinal = clamp(wristLRula.pts + (wristLDev ? 1 : 0), 1, 4);
  const rulaWristRFinal = clamp(wristRRula.pts + (wristRDev ? 1 : 0), 1, 4);

  const rulaNeckAdj = (neckRot ? 1 : 0) + (neckSide ? 1 : 0);
  const rulaNeckFinal = clamp(neckRula.pts + rulaNeckAdj, 1, 6);
  const rulaTrunkAdj = (trunkTwist ? 1 : 0) + (trunkSide ? 1 : 0);
  const rulaTrunkFinal = clamp(trunkRula.pts + rulaTrunkAdj, 1, 6);

  const colB = (rulaTrunkFinal - 1) * 2 + (rulaLegsScore - 1);
  const scoreB = RULA_TABLE_B[rulaNeckFinal - 1][colB];
  const scoreD = scoreB + rulaMuscle + rulaForceScore;

  const colAL = (rulaWristLFinal - 1) * 2 + (wristLTwist - 1);
  const scoreAL = RULA_TABLE_A[rulaArmLFinal - 1][rulaForeLFinal - 1][colAL];
  const scoreCL = scoreAL + rulaMuscle + rulaForceScore;
  const finalL = RULA_TABLE_C[clamp(scoreCL, 1, 8) - 1][clamp(scoreD, 1, 7) - 1];

  const colAR = (rulaWristRFinal - 1) * 2 + (wristRTwist - 1);
  const scoreAR = RULA_TABLE_A[rulaArmRFinal - 1][rulaForeRFinal - 1][colAR];
  const scoreCR = scoreAR + rulaMuscle + rulaForceScore;
  const finalR = RULA_TABLE_C[clamp(scoreCR, 1, 8) - 1][clamp(scoreD, 1, 7) - 1];

  const rulaFinalWorst = Math.max(finalL, finalR);
  const rulaWorstSide = finalR >= finalL ? 'Derecho' : 'Izquierdo';
  const rulaActionLevel = rulaFinalWorst >= 7 ? 4 : rulaFinalWorst >= 5 ? 3 : rulaFinalWorst >= 3 ? 2 : 1;
  const rulaActionText =
    rulaActionLevel === 1
      ? 'Nivel 1 — Postura aceptable'
      : rulaActionLevel === 2
        ? 'Nivel 2 — Profundizar estudio / posibles cambios'
        : rulaActionLevel === 3
          ? 'Nivel 3 — Rediseño de tarea a corto plazo'
          : 'Nivel 4 — Cambios urgentes / inmediatos';

  // --- Cálculo REBA Paso a Paso ---
  const rebaTrunkAdj = trunkTwist || trunkSide ? 1 : 0;
  const rebaTrunkFinal = clamp(trunkReba.pts + rebaTrunkAdj, 1, 5);
  const rebaNeckAdj = neckRot || neckSide ? 1 : 0;
  const rebaNeckFinal = clamp(neckReba.pts + rebaNeckAdj, 1, 3);

  const rebaTableA = REBA_TABLE_A[rebaTrunkFinal - 1][rebaNeckFinal - 1][rebaLegsFinal - 1];
  const rebaScoreA = clamp(rebaTableA + rebaLoadPoints, 1, 12);

  const rebaArmLFinal = clamp(armLRula.pts + armLAdj, 1, 6);
  const rebaArmRFinal = clamp(armRRula.pts + armRAdj, 1, 6);
  const rebaForeLBase = foreLRula.pts;
  const rebaForeRBase = foreRRula.pts;
  const rebaWristLFinal = clamp(wristLReba.pts + (wristLDev || wristLTwist === 2 ? 1 : 0), 1, 3);
  const rebaWristRFinal = clamp(wristRReba.pts + (wristRDev || wristRTwist === 2 ? 1 : 0), 1, 3);

  const tableBL = REBA_TABLE_B[rebaArmLFinal - 1][rebaForeLBase - 1][rebaWristLFinal - 1];
  const scoreBL = clamp(tableBL + modifiers.coupling, 1, 12);
  const tableCL = REBA_TABLE_C[rebaScoreA - 1][scoreBL - 1];
  const rebaFinalL = clamp(tableCL + rebaActivityScore, 1, 15);

  const tableBR = REBA_TABLE_B[rebaArmRFinal - 1][rebaForeRBase - 1][rebaWristRFinal - 1];
  const scoreBR = clamp(tableBR + modifiers.coupling, 1, 12);
  const tableCR = REBA_TABLE_C[rebaScoreA - 1][scoreBR - 1];
  const rebaFinalR = clamp(tableCR + rebaActivityScore, 1, 15);

  const rebaFinalWorst = Math.max(rebaFinalL, rebaFinalR);
  const rebaWorstSide = rebaFinalR >= rebaFinalL ? 'Derecho' : 'Izquierdo';
  const rebaActionLevel =
    rebaFinalWorst >= 11 ? 4 : rebaFinalWorst >= 8 ? 3 : rebaFinalWorst >= 4 ? 2 : rebaFinalWorst >= 2 ? 1 : 0;
  const rebaActionText =
    rebaActionLevel === 0
      ? 'Nivel 0 — Riesgo inapreciable'
      : rebaActionLevel === 1
        ? 'Nivel 1 — Riesgo bajo'
        : rebaActionLevel === 2
          ? 'Nivel 2 — Riesgo medio, actuación necesaria'
          : rebaActionLevel === 3
            ? 'Nivel 3 — Riesgo alto, actuar cuanto antes'
            : 'Nivel 4 — Riesgo muy alto, actuación inmediata';

  const rulaActionLevelL = finalL >= 7 ? 4 : finalL >= 5 ? 3 : finalL >= 3 ? 2 : 1;
  const rulaActionLevelR = finalR >= 7 ? 4 : finalR >= 5 ? 3 : finalR >= 3 ? 2 : 1;
  const rebaActionLevelL =
    rebaFinalL >= 11 ? 4 : rebaFinalL >= 8 ? 3 : rebaFinalL >= 4 ? 2 : rebaFinalL >= 2 ? 1 : 0;
  const rebaActionLevelR =
    rebaFinalR >= 11 ? 4 : rebaFinalR >= 8 ? 3 : rebaFinalR >= 4 ? 2 : rebaFinalR >= 2 ? 1 : 0;

  const correctionsText =
    corrections.length > 0
      ? corrections.map((c) => `${c.target} (${c.method} ${c.deltaText}: ${c.reason})`).join(' · ')
      : 'Sin penalizaciones adicionales sobre los ángulos base medidos.';

  const groupStepLines = [
    `RULA Izq.: Grupo A(Brazo ${rulaArmLFinal}, Anteb. ${rulaForeLFinal}, Muñ. ${rulaWristLFinal}, Giro ${wristLTwist}) → Tabla 4.14 = ${scoreAL} + T.4.16(+${rulaMuscle}) + T.4.17(+${rulaForceScore}) → C = ${scoreCL} | Grupo B(Cuello ${rulaNeckFinal}, Tronco ${rulaTrunkFinal}, Piernas ${rulaLegsScore}) → Tabla 4.15 = ${scoreB} + ${rulaMuscle}+${rulaForceScore} → D = ${scoreD} → Tabla 4.18 = ${finalL}/7`,
    `RULA Der.: Grupo A(Brazo ${rulaArmRFinal}, Anteb. ${rulaForeRFinal}, Muñ. ${rulaWristRFinal}, Giro ${wristRTwist}) → Tabla 4.14 = ${scoreAR} + T.4.16(+${rulaMuscle}) + T.4.17(+${rulaForceScore}) → C = ${scoreCR} | Grupo B → Tabla 4.15 = ${scoreB} → D = ${scoreD} → Tabla 4.18 = ${finalR}/7`,
    `REBA: Grupo A(Tronco ${rebaTrunkFinal}, Cuello ${rebaNeckFinal}, Piernas ${rebaLegsFinal}) → Tabla A = ${rebaTableA} + Carga ${rebaLoadPoints} = ${rebaScoreA} | Grupo B Izq.(${rebaArmLFinal},${rebaForeLBase},${rebaWristLFinal})=${tableBL}+Agarre ${modifiers.coupling}=${scoreBL} → Tabla C=${tableCL}+Act.${rebaActivityScore}=${rebaFinalL} | Der.(${rebaArmRFinal},${rebaForeRBase},${rebaWristRFinal})=${tableBR}+Agarre ${modifiers.coupling}=${scoreBR} → Tabla C=${tableCR}+Act.${rebaActivityScore}=${rebaFinalR}`,
    `OWAS: Código ${owasBackCode}-${owasArmsCode}-${owasLegsCode}-${owasLoadCode} (${owasBackLabel}; ${owasArmsLabel}; ${owasLegsLabel}; Carga ${owasLoadLabel}) => ${owasActionText}`,
  ];

  const finalSummaryLine = `RESULTADO GLOBAL → RULA: ${rulaFinalWorst}/7 (${rulaActionText})  |  REBA: ${rebaFinalWorst}/15 (${rebaActionText})  |  OWAS: ${owasBackCode}-${owasArmsCode}-${owasLegsCode}-${owasLoadCode} (Cat. ${owasActionCat})`;

  const findRowText = (key: string, fallback: string) =>
    angleRows.find((r) => r.key === key)?.angleText ?? fallback;

  const compactAnglesPairRows = [
    {
      leftLabel: 'A Cuello',
      leftVal: findRowText('neck', `${neckDeg >= 0 ? '+' : '−'}${Math.abs(neckDeg)}°`),
      rightLabel: 'F Antebrazo der.',
      rightVal: findRowText('forearmR', `${foreRFlexDeg}°`),
    },
    {
      leftLabel: 'B Tronco / Espalda',
      leftVal: findRowText('trunk', `${trunkDeg >= 0 ? '+' : '−'}${Math.abs(trunkDeg)}°`),
      rightLabel: 'G Pierna izq.',
      rightVal: findRowText('kneeL', `${kneeLFlexDeg}°`),
    },
    {
      leftLabel: 'C Brazo izq.',
      leftVal: findRowText('armL', `${armLDeg >= 0 ? '+' : '−'}${Math.abs(armLDeg)}°`),
      rightLabel: 'H Pierna der.',
      rightVal: findRowText('kneeR', `${kneeRFlexDeg}°`),
    },
    {
      leftLabel: 'D Brazo der.',
      leftVal: findRowText('armR', `${armRDeg >= 0 ? '+' : '−'}${Math.abs(armRDeg)}°`),
      rightLabel: 'M-I Muñeca izq.',
      rightVal: findRowText('wristL', `${snapshot.wristLFlexDeg}°`),
    },
    {
      leftLabel: 'E Antebrazo izq.',
      leftVal: findRowText('forearmL', `${foreLFlexDeg}°`),
      rightLabel: 'M-D Muñeca der.',
      rightVal: findRowText('wristR', `${snapshot.wristRFlexDeg}°`),
    },
  ];

  const owasFourDigit = `${owasBackCode}-${owasArmsCode}-${owasLegsCode}-${owasLoadCode}`;
  const rulaPlusCD =
    rulaForceScore > 0
      ? `(+Est.+${rulaMuscle}, Fza.+${rulaForceScore})`
      : modifiers.staticPosture || modifiers.repetitiveTask
        ? `(+Estática +${rulaMuscle})`
        : '(+0)';

  const scoreRows = [
    {
      label: 'RULA Grupo A (B·A·M·G)',
      left: `${rulaArmLFinal}·${rulaForeLFinal}·${rulaWristLFinal}·${wristLTwist} → ${scoreAL}`,
      right: `${rulaArmRFinal}·${rulaForeRFinal}·${rulaWristRFinal}·${wristRTwist} → ${scoreAR}`,
    },
    {
      label: 'RULA Grupo B (Cuello·Tronco·Pier.)',
      left: `${rulaNeckFinal}·${rulaTrunkFinal}·${rulaLegsScore} → ${scoreB}`,
      right: `${rulaNeckFinal}·${rulaTrunkFinal}·${rulaLegsScore} → ${scoreB}`,
    },
    {
      label: `RULA C y D ${rulaPlusCD}`,
      left: `C ${scoreCL} · D ${scoreD}`,
      right: `C ${scoreCR} · D ${scoreD}`,
    },
    {
      label: 'RULA final (Tabla C)',
      left: `${finalL}/7 · nivel ${rulaActionLevelL}`,
      right: `${finalR}/7 · nivel ${rulaActionLevelR}`,
      bold: true,
    },
    {
      label: 'REBA A y B (T·C·P / B·A·M)',
      left: `A ${rebaScoreA} · B ${scoreBL}`,
      right: `A ${rebaScoreA} · B ${scoreBR}`,
    },
    {
      label: 'REBA final (Tabla C + Act.)',
      left: `C ${tableCL}+${rebaActivityScore}=${rebaFinalL} · niv. ${rebaActionLevelL}`,
      right: `C ${tableCR}+${rebaActivityScore}=${rebaFinalR} · niv. ${rebaActionLevelR}`,
      bold: true,
    },
    {
      label: 'OWAS (Espalda·Brazos·Pier.·Carga)',
      left: `${owasFourDigit} · categoría ${owasActionCat}`,
      right: `${owasFourDigit} · categoría ${owasActionCat}`,
      bold: true,
    },
  ];

  const baseDesc = basePosturalLabel || owasLegsLabel;
  const activePenaltiesBrief = corrections
    .filter((c) => c.target !== 'Actividad muscular' && c.target !== 'Carga / Fuerza' && c.target !== 'Actividad REBA')
    .map((c) => `${c.target} ${c.deltaText}`)
    .slice(0, 6);
  const criteriaLine = `Criterios: ${baseDesc}; carga ${modifiers.loadKg} kg; ${
    modifiers.staticPosture ? 'postura estática sostenida (+1 RULA/REBA)' : 'postura dinámica'
  }; cuello ${neckDeg >= 0 ? `+${neckDeg}°` : `${neckDeg}°`}; tronco ${trunkDeg >= 0 ? `+${trunkDeg}°` : `${trunkDeg}°`}; OWAS ${owasFourDigit} (${owasLegsLabel.toLowerCase()})${
    activePenaltiesBrief.length > 0 ? `; ajustes: ${activePenaltiesBrief.join(', ')}` : ''
  }.`;

  const subtitleLine = `Vistas en verdadera magnitud (${
    params.convention === 'flex' ? '0° = extendido' : '180° = extendido'
  })${basePosturalLabel ? ` · ${basePosturalLabel}` : ''}`;

  return {
    angleRows,
    corrections,
    rula: {
      armLBase: armLRula.pts,
      armLAdj,
      armLFinal: rulaArmLFinal,
      armRBase: armRRula.pts,
      armRAdj,
      armRFinal: rulaArmRFinal,
      foreLBase: foreLRula.pts,
      foreLFinal: rulaForeLFinal,
      foreRBase: foreRRula.pts,
      foreRFinal: rulaForeRFinal,
      wristLBase: wristLRula.pts,
      wristLFinal: rulaWristLFinal,
      wristLTwist,
      wristRBase: wristRRula.pts,
      wristRFinal: rulaWristRFinal,
      wristRTwist,
      neckBase: neckRula.pts,
      neckAdj: rulaNeckAdj,
      neckFinal: rulaNeckFinal,
      trunkBase: trunkRula.pts,
      trunkAdj: rulaTrunkAdj,
      trunkFinal: rulaTrunkFinal,
      legsScore: rulaLegsScore,
      muscleA: rulaMuscle,
      forceA: rulaForceScore,
      muscleB: rulaMuscle,
      forceB: rulaForceScore,
      scoreAL,
      scoreCL,
      finalL,
      scoreAR,
      scoreCR,
      finalR,
      scoreB,
      scoreD,
      finalWorst: rulaFinalWorst,
      worstSide: rulaWorstSide,
      actionLevel: rulaActionLevel,
      actionLevelL: rulaActionLevelL,
      actionLevelR: rulaActionLevelR,
      actionText: rulaActionText,
    },
    reba: {
      trunkBase: trunkReba.pts,
      trunkAdj: rebaTrunkAdj,
      trunkFinal: rebaTrunkFinal,
      neckBase: neckReba.pts,
      neckAdj: rebaNeckAdj,
      neckFinal: rebaNeckFinal,
      legsBase: rebaLegsBase,
      kneeFlexAdd,
      legsFinal: rebaLegsFinal,
      tableA: rebaTableA,
      loadPoints: rebaLoadPoints,
      scoreA: rebaScoreA,
      armLBase: armLRula.pts,
      armLFinal: rebaArmLFinal,
      armRBase: armRRula.pts,
      armRFinal: rebaArmRFinal,
      foreLBase: rebaForeLBase,
      foreRBase: rebaForeRBase,
      wristLBase: wristLReba.pts,
      wristLFinal: rebaWristLFinal,
      wristRBase: wristRReba.pts,
      wristRFinal: rebaWristRFinal,
      tableBL,
      scoreBL,
      tableBR,
      scoreBR,
      coupling: modifiers.coupling,
      activityScore: rebaActivityScore,
      tableCL,
      finalL: rebaFinalL,
      tableCR,
      finalR: rebaFinalR,
      finalWorst: rebaFinalWorst,
      worstSide: rebaWorstSide,
      actionLevel: rebaActionLevel,
      actionLevelL: rebaActionLevelL,
      actionLevelR: rebaActionLevelR,
      actionText: rebaActionText,
    },
    owas: {
      backCode: owasBackCode,
      backLabel: owasBackLabel,
      armsCode: owasArmsCode,
      armsLabel: owasArmsLabel,
      legsCode: owasLegsCode,
      legsLabel: owasLegsLabel,
      loadCode: owasLoadCode,
      loadLabel: owasLoadLabel,
      fourDigitCode: owasFourDigit,
      actionCategory: owasActionCat,
      actionText: owasActionText,
    },
    printSummary: {
      subtitleLine,
      compactAnglesPairRows,
      scoreRows,
      criteriaLine,
      angleRows: angleRows.map((r) => ({
        code: r.code,
        segment: r.segment,
        angleText: r.angleText,
        rulaText: r.rulaText,
        rebaText: r.rebaText,
        owasText: r.owasCodeText,
      })),
      correctionsText,
      groupStepLines,
      finalSummaryLine,
    },
  };
}

// ---------------------------------------------------------------------------
// Exportación Word (.docx) en formato libro 5 × 8 pulgadas (Cambria, fidelidad visual)
// ---------------------------------------------------------------------------
function dataUrlToUint8(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(',')[1] || '';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function loadImgDims(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1800, h: img.naturalHeight || 1400 });
    img.onerror = () => resolve({ w: 1800, h: 1400 });
    img.src = dataUrl;
  });
}

const NO_BORDER_DEF = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;
const NO_CELL_BORDERS = {
  top: NO_BORDER_DEF,
  bottom: NO_BORDER_DEF,
  left: NO_BORDER_DEF,
  right: NO_BORDER_DEF,
};
const NO_TABLE_BORDERS = {
  ...NO_CELL_BORDERS,
  insideHorizontal: NO_BORDER_DEF,
  insideVertical: NO_BORDER_DEF,
};

function makeBwCell(
  text: string,
  opts: {
    bold?: boolean;
    fillHex?: string;
    colorHex?: string;
    borderHex?: string;
    borderSize?: number;
    noBorders?: boolean;
    widthPct?: number;
    columnSpan?: number;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    sizeHalfPt?: number;
    spaceBefore?: number;
    spaceAfter?: number;
  } = {},
): TableCell {
  const border = opts.noBorders
    ? NO_BORDER_DEF
    : {
        style: BorderStyle.SINGLE,
        size: opts.borderSize ?? 6,
        color: opts.borderHex ?? '333333',
      };
  return new TableCell({
    width: opts.widthPct ? { size: opts.widthPct, type: WidthType.PERCENTAGE } : undefined,
    columnSpan: opts.columnSpan,
    shading: opts.fillHex ? { type: ShadingType.CLEAR, fill: opts.fillHex, color: 'auto' } : undefined,
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
    },
    children: text.split('\n').map(
      (line, idx) =>
        new Paragraph({
          alignment: opts.align ?? AlignmentType.LEFT,
          spacing: {
            before: idx === 0 ? (opts.spaceBefore ?? 26) : 12,
            after: opts.spaceAfter ?? 24,
          },
          children: [
            new TextRun({
              text: line,
              bold: opts.bold ?? false,
              font: 'Cambria',
              size: opts.sizeHalfPt ?? 17, // 8.5 pt en hoja 5×8"
              color: opts.colorHex ?? '111111',
            }),
          ],
        }),
    ),
  });
}

function makeRichFlowBoxCell(
  lines: Array<{ text: string; bold?: boolean; italics?: boolean; sizeHalfPt?: number; colorHex?: string }>,
  opts: {
    fillHex?: string;
    borderHex?: string;
    borderSize?: number;
    widthPct?: number;
    columnSpan?: number;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  } = {},
): TableCell {
  const border = {
    style: BorderStyle.SINGLE,
    size: opts.borderSize ?? 8,
    color: opts.borderHex ?? '334155',
  };
  return new TableCell({
    width: opts.widthPct ? { size: opts.widthPct, type: WidthType.PERCENTAGE } : undefined,
    columnSpan: opts.columnSpan,
    shading: opts.fillHex ? { type: ShadingType.CLEAR, fill: opts.fillHex, color: 'auto' } : undefined,
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
    },
    children: lines.map(
      (ln, idx) =>
        new Paragraph({
          alignment: opts.align ?? AlignmentType.CENTER,
          spacing: { before: idx === 0 ? 36 : 12, after: idx === lines.length - 1 ? 36 : 10 },
          children: [
            new TextRun({
              text: ln.text,
              bold: ln.bold ?? false,
              italics: ln.italics ?? false,
              font: 'Cambria',
              size: ln.sizeHalfPt ?? 17,
              color: ln.colorHex ?? '111111',
            }),
          ],
        }),
    ),
  });
}

function makeFlowArrowRow(leftArrow: string, rightArrow: string, colorHex = '0369A1'): TableRow {
  return new TableRow({
    cantSplit: true,
    children: [
      makeBwCell(leftArrow, {
        bold: true,
        noBorders: true,
        colorHex,
        widthPct: 48,
        align: AlignmentType.CENTER,
        sizeHalfPt: 18,
        spaceBefore: 4,
        spaceAfter: 4,
      }),
      makeBwCell('', {
        noBorders: true,
        widthPct: 4,
        spaceBefore: 0,
        spaceAfter: 0,
      }),
      makeBwCell(rightArrow, {
        bold: true,
        noBorders: true,
        colorHex,
        widthPct: 48,
        align: AlignmentType.CENTER,
        sizeHalfPt: 18,
        spaceBefore: 4,
        spaceAfter: 4,
      }),
    ],
  });
}

export interface KateWordPlateInput {
  plateName: string;
  basePosturalLabel?: string;
  sheetPngDataUrl: string;
  scoring: KateStepByStepScoringResult;
  convention: 'flex' | 'internal';
}

function makeBookRuleCell(
  text: string,
  opts: {
    bold?: boolean;
    fillHex?: string;
    topRule?: boolean;
    bottomRule?: boolean;
    widthPct?: number;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    sizeHalfPt?: number;
  } = {},
): TableCell {
  const thinSubtle = { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' } as const;
  const strongRule = { style: BorderStyle.SINGLE, size: 10, color: '111111' } as const;

  return new TableCell({
    width: opts.widthPct ? { size: opts.widthPct, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.fillHex ? { type: ShadingType.CLEAR, fill: opts.fillHex, color: 'auto' } : undefined,
    borders: {
      top: opts.topRule ? strongRule : thinSubtle,
      bottom: opts.bottomRule ? strongRule : thinSubtle,
      left: NO_BORDER_DEF,
      right: NO_BORDER_DEF,
    },
    children: [
      new Paragraph({
        alignment: opts.align ?? AlignmentType.LEFT,
        spacing: { before: 16, after: 16 },
        children: [
          new TextRun({
            text,
            bold: opts.bold ?? false,
            font: 'Cambria',
            size: opts.sizeHalfPt ?? 16, // 8 pt compacto en hoja 6×9"
            color: '111111',
          }),
        ],
      }),
    ],
  });
}

async function buildKatePlate6x9SinglePageChildren(
  input: KateWordPlateInput,
): Promise<Array<Paragraph | Table>> {
  const { plateName, basePosturalLabel, sheetPngDataUrl, scoring, convention } = input;
  const cleanTitle = (plateName || 'Lámina de Referencia Kate 3D').trim();
  const dims = await loadImgDims(sheetPngDataUrl);
  const bytes = dataUrlToUint8(sheetPngDataUrl);

  // Página 6 × 9 pulgadas = 8640 × 12960 twips; márgenes L/R 0.40" (576 twips), T/B 0.30" (432 twips)
  // Ancho útil = 5.20 in (~499 px a 96 DPI). Imagen 1800×1500 (6:5) escalada a 432×360 px (4.50" × 3.75")
  const targetWidthPx = 432;
  const maxHeightPx = 360;
  const scale = Math.min(targetWidthPx / dims.w, maxHeightPx / dims.h);
  const imgW = Math.round(dims.w * scale);
  const imgH = Math.round(dims.h * scale);

  const subtitleText = `Vistas en verdadera magnitud (${
    convention === 'flex' ? '0° = extendido' : '180° = extendido'
  })${basePosturalLabel ? ` · ${basePosturalLabel}` : ''}`;

  const anglePairs = scoring.printSummary.compactAnglesPairRows ?? [];
  const scoreRows = scoring.printSummary.scoreRows ?? [];
  const criteriaText = scoring.printSummary.criteriaLine ?? scoring.printSummary.finalSummaryLine;

  return [
    new Paragraph({
      spacing: { before: 0, after: 18 },
      children: [
        new TextRun({
          text: cleanTitle,
          bold: true,
          font: 'Cambria',
          size: 23, // 11.5 pt
          color: '111111',
        }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 45 },
      children: [
        new TextRun({
          text: subtitleText,
          italics: true,
          font: 'Cambria',
          size: 17, // 8.5 pt
          color: '333333',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 55 },
      children: [
        new ImageRun({
          data: bytes,
          type: 'png',
          transformation: { width: imgW, height: imgH },
        }),
      ],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: NO_TABLE_BORDERS,
      rows: [
        new TableRow({
          tableHeader: true,
          cantSplit: true,
          children: [
            makeBookRuleCell('Ángulos medidos (A–E)', {
              bold: true,
              fillHex: 'F1F5F9',
              topRule: true,
              bottomRule: true,
              widthPct: 34,
            }),
            makeBookRuleCell('', {
              bold: true,
              fillHex: 'F1F5F9',
              topRule: true,
              bottomRule: true,
              widthPct: 16,
              align: AlignmentType.RIGHT,
            }),
            makeBookRuleCell('(F–M)', {
              bold: true,
              fillHex: 'F1F5F9',
              topRule: true,
              bottomRule: true,
              widthPct: 34,
            }),
            makeBookRuleCell('', {
              bold: true,
              fillHex: 'F1F5F9',
              topRule: true,
              bottomRule: true,
              widthPct: 16,
              align: AlignmentType.RIGHT,
            }),
          ],
        }),
        ...anglePairs.map((pair, idx) => {
          const isLast = idx === anglePairs.length - 1;
          const fillHex = idx % 2 === 1 ? 'F8FAFC' : undefined;
          return new TableRow({
            cantSplit: true,
            children: [
              makeBookRuleCell(pair.leftLabel, { fillHex, bottomRule: isLast, widthPct: 34 }),
              makeBookRuleCell(pair.leftVal, {
                bold: true,
                fillHex,
                bottomRule: isLast,
                widthPct: 16,
                align: AlignmentType.RIGHT,
              }),
              makeBookRuleCell(pair.rightLabel, { fillHex, bottomRule: isLast, widthPct: 34 }),
              makeBookRuleCell(pair.rightVal, {
                bold: true,
                fillHex,
                bottomRule: isLast,
                widthPct: 16,
                align: AlignmentType.RIGHT,
              }),
            ],
          });
        }),
      ],
    }),
    new Paragraph({
      spacing: { before: 40, after: 40 },
      children: [],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: NO_TABLE_BORDERS,
      rows: [
        new TableRow({
          tableHeader: true,
          cantSplit: true,
          children: [
            makeBookRuleCell('Puntajes recalculados', {
              bold: true,
              fillHex: 'F1F5F9',
              topRule: true,
              bottomRule: true,
              widthPct: 44,
            }),
            makeBookRuleCell('Lado izq.', {
              bold: true,
              fillHex: 'F1F5F9',
              topRule: true,
              bottomRule: true,
              widthPct: 28,
              align: AlignmentType.CENTER,
            }),
            makeBookRuleCell('Lado der.', {
              bold: true,
              fillHex: 'F1F5F9',
              topRule: true,
              bottomRule: true,
              widthPct: 28,
              align: AlignmentType.CENTER,
            }),
          ],
        }),
        ...scoreRows.map((sr, idx) => {
          const isLast = idx === scoreRows.length - 1;
          const fillHex = sr.bold ? 'F1F5F9' : idx % 2 === 1 ? 'F8FAFC' : undefined;
          return new TableRow({
            cantSplit: true,
            children: [
              makeBookRuleCell(sr.label, {
                bold: sr.bold,
                fillHex,
                bottomRule: isLast,
                widthPct: 44,
              }),
              makeBookRuleCell(sr.left, {
                bold: sr.bold,
                fillHex,
                bottomRule: isLast,
                widthPct: 28,
                align: AlignmentType.CENTER,
              }),
              makeBookRuleCell(sr.right, {
                bold: sr.bold,
                fillHex,
                bottomRule: isLast,
                widthPct: 28,
                align: AlignmentType.CENTER,
              }),
            ],
          });
        }),
      ],
    }),
    new Paragraph({
      spacing: { before: 48, after: 0 },
      children: [
        new TextRun({
          text: criteriaText,
          font: 'Cambria',
          size: 15, // 7.5 pt compacto al pie
          color: '333333',
        }),
      ],
    }),
  ];
}

export async function exportKateSheetToWord6x9Docx(
  options: KateWordPlateInput,
): Promise<{ blob: Blob; filename: string }> {
  const cleanTitle = (options.plateName || 'Lámina de Referencia Kate 3D').trim();
  const children = await buildKatePlate6x9SinglePageChildren(options);

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 6 * 1440, // 6 pulgadas
              height: 9 * 1440, // 9 pulgadas
              orientation: PageOrientation.PORTRAIT,
            },
            margin: {
              top: 432, // 0.30 in
              bottom: 432,
              left: 576, // 0.40 in
              right: 576,
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const safeSlug = cleanTitle
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return {
    blob,
    filename: `${safeSlug || 'Lamina_Kate_6x9'}_6x9_BN.docx`,
  };
}

export async function exportKateBatchToWord6x9Docx(
  plates: KateWordPlateInput[],
  bookTitle = 'Laminas_Kate_53_Posturas_6x9_BN',
): Promise<{ blob: Blob; filename: string }> {
  const allChildren: Array<Paragraph | Table> = [];
  for (let i = 0; i < plates.length; i++) {
    if (i > 0) {
      allChildren.push(new Paragraph({ children: [new PageBreak()] }));
    }
    const block = await buildKatePlate6x9SinglePageChildren(plates[i]);
    allChildren.push(...block);
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 6 * 1440, // 6 pulgadas
              height: 9 * 1440, // 9 pulgadas
              orientation: PageOrientation.PORTRAIT,
            },
            margin: {
              top: 432, // 0.30 in
              bottom: 432,
              left: 576, // 0.40 in
              right: 576,
            },
          },
        },
        children: allChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const safeSlug = bookTitle
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return {
    blob,
    filename: `${safeSlug || 'Laminas_Kate_6x9'}.docx`,
  };
}

export const exportKateSheetToWord5x8Docx = exportKateSheetToWord6x9Docx;
export const exportKateBatchToWord5x8Docx = exportKateBatchToWord6x9Docx;


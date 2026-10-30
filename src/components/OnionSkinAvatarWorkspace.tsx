import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Crosshair,
  Download,
  Eye,
  FlipHorizontal2,
  Hand,
  ImagePlus,
  Layers,
  Link2,
  MousePointerClick,
  Move,
  Plus,
  RotateCcw,
  Sliders,
  Trash2,
} from 'lucide-react';
import {
  MethodId,
  RebaData,
  RebaSideInput,
  RulaData,
  RulaSideInput,
  StudyPhoto,
  StudyTab,
} from '../types/ergonomics';
import {
  CameraPreset,
  JointKey,
  Panel3DSpec,
  PosturePose3D,
  ScenePropType,
} from '../types/figurePlan';
import { createNewStudyTab } from '../utils/defaults';
import { evaluateReba, evaluateRula } from '../utils/calculations';
import { makeNeutralPose } from '../utils/figurePlanCatalog';
import {
  CameraOrbitOverride,
  ensureAvatarGlbLoaded,
  renderInteractiveFreeAvatarToCanvas,
  renderInteractivePose3DToCanvas,
  subscribeAvatarGlbLoaded,
} from '../utils/biomech3dRenderer';
import { exportCanvasToHighQualityPng } from '../utils/pngOptimizer';
import { getSeverityStyles } from './StudyTabWorkspace';

interface OnionSkinAvatarWorkspaceProps {
  onBackToEvaluator: () => void;
  onAddPoseTabToStudy: (newTab: StudyTab) => void;
}

type PointerToolMode = 'move_joints' | 'align_avatar' | 'orbit_camera' | 'pan_photo';
type JointControlGroup = 'left_arm' | 'right_arm' | 'spine_head' | 'legs_feet' | 'space_props' | 'all';
type ZeroExtensionAxis = 'lateral_90' | 'frontal_90';

const STAGE_W = 720;
const STAGE_H = 560;

const INTERACTIVE_JOINTS: JointKey[] = [
  'head',
  'c7',
  't12',
  'l5s1',
  'pelvis',
  'shoulderL',
  'elbowL',
  'wristL',
  'shoulderR',
  'elbowR',
  'wristR',
  'hipL',
  'kneeL',
  'ankleL',
  'hipR',
  'kneeR',
  'ankleR',
];

const JOINT_LABELS_ES: Record<JointKey, string> = {
  head: 'Cabeza / Mirada (Flexión y Giro Cervical)',
  c7: 'Cuello C7 (Flexión e Inclinación Lateral)',
  t12: 'Tronco Torácico T12 (Flexión y Giro Axial)',
  l5s1: 'Columna Lumbar L5/S1 (Flexión e Inclinación)',
  pelvis: 'Pelvis / Raíz (Desplazar o Shift+Arrastrar para Girar)',
  shoulderL: 'Hombro Izquierdo (Flexión y Abducción)',
  elbowL: 'Codo Izquierdo (Flexión y Pronosupinación)',
  wristL: 'Muñeca Izquierda (Flexión y Desviación)',
  handL: 'Mano Izquierda',
  shoulderR: 'Hombro Derecho (Flexión y Abducción)',
  elbowR: 'Codo Derecho (Flexión y Pronosupinación)',
  wristR: 'Muñeca Derecha (Flexión y Desviación)',
  handR: 'Mano Derecha',
  hipL: 'Cadera Izquierda (Flexión Sagital)',
  kneeL: 'Rodilla Izquierda (Flexión Sagital)',
  ankleL: 'Tobillo Izquierdo (Dorsiflexión / Plantar)',
  footL: 'Pie Izquierdo',
  hipR: 'Cadera Derecha (Flexión Sagital)',
  kneeR: 'Rodilla Derecha (Flexión Sagital)',
  ankleR: 'Tobillo Derecho (Dorsiflexión / Plantar)',
  footR: 'Pie Derecho',
};

const BONE_OVERLAY_PAIRS: Array<[JointKey, JointKey]> = [
  ['pelvis', 'l5s1'],
  ['l5s1', 'c7'],
  ['c7', 'head'],
  ['shoulderL', 'elbowL'],
  ['elbowL', 'wristL'],
  ['shoulderR', 'elbowR'],
  ['elbowR', 'wristR'],
  ['hipL', 'kneeL'],
  ['kneeL', 'ankleL'],
  ['hipR', 'kneeR'],
  ['kneeR', 'ankleR'],
];

interface AngleFieldSpec {
  key: keyof PosturePose3D;
  mirrorKey?: keyof PosturePose3D;
  mirrorInvertSign?: boolean;
  label: string;
  invertAsInternal180?: boolean;
  defaultValue?: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  group: Exclude<JointControlGroup, 'all'>;
}

const ONION_PROP_OPTIONS: { value: ScenePropType; label: string }[] = [
  { value: 'none', label: 'Sin mobiliario (Calco limpio sobre foto)' },
  { value: 'cold_room_high_shelf', label: 'Estantería regulable de 4 niveles' },
  { value: 'pallet_jack_rack', label: 'Estantería industrial + tarima' },
  { value: 'work_desk_support', label: 'Mesa / banco de trabajo' },
  { value: 'box_load', label: 'Caja industrial en manos' },
  { value: 'chair', label: 'Silla de trabajo regulable' },
  { value: 'conveyor_veg_line', label: 'Cinta transportadora' },
  { value: 'office_desk_lateral', label: 'Escritorio con monitor PVD' },
];

const ANGLE_FIELDS: AngleFieldSpec[] = [
  // Brazo Izquierdo (primero para acceso inmediato desde Posición Cero)
  {
    key: 'shoulderLAbductionDeg',
    mirrorKey: 'shoulderRAbductionDeg',
    label: 'Hombro Izq. · Abducción(+) / Aducción(-)',
    min: -25,
    max: 150,
    unit: '°',
    group: 'left_arm',
  },
  {
    key: 'shoulderLFlexionDeg',
    mirrorKey: 'shoulderRFlexionDeg',
    label: 'Hombro Izq. · Flexión(+) / Extensión(-)',
    min: -45,
    max: 170,
    unit: '°',
    group: 'left_arm',
  },
  {
    key: 'elbowLFlexionDeg',
    mirrorKey: 'elbowRFlexionDeg',
    invertAsInternal180: true,
    label: 'Codo Izq. · Ángulo Interno (170° = Ext. sana)',
    min: 30,
    max: 170,
    unit: '°',
    group: 'left_arm',
  },
  {
    key: 'forearmLPronationDeg',
    mirrorKey: 'forearmRPronationDeg',
    mirrorInvertSign: true,
    label: 'Antebrazo Izq. · Supin.(+) / Pronación(-)',
    min: -85,
    max: 88,
    unit: '°',
    group: 'left_arm',
  },
  {
    key: 'wristLFlexionDeg',
    mirrorKey: 'wristRFlexionDeg',
    label: 'Muñeca Izq. · Flexión(+) / Extensión(-)',
    min: -55,
    max: 60,
    unit: '°',
    group: 'left_arm',
  },
  {
    key: 'wristLDeviationDeg',
    mirrorKey: 'wristRDeviationDeg',
    label: 'Muñeca Izq. · Desviación Cubital/Radial',
    min: -25,
    max: 30,
    unit: '°',
    group: 'left_arm',
  },

  // Brazo Derecho
  {
    key: 'shoulderRAbductionDeg',
    mirrorKey: 'shoulderLAbductionDeg',
    label: 'Hombro Der. · Abducción(+) / Aducción(-)',
    min: -25,
    max: 150,
    unit: '°',
    group: 'right_arm',
  },
  {
    key: 'shoulderRFlexionDeg',
    mirrorKey: 'shoulderLFlexionDeg',
    label: 'Hombro Der. · Flexión(+) / Extensión(-)',
    min: -45,
    max: 170,
    unit: '°',
    group: 'right_arm',
  },
  {
    key: 'elbowRFlexionDeg',
    mirrorKey: 'elbowLFlexionDeg',
    invertAsInternal180: true,
    label: 'Codo Der. · Ángulo Interno (170° = Ext. sana)',
    min: 30,
    max: 170,
    unit: '°',
    group: 'right_arm',
  },
  {
    key: 'forearmRPronationDeg',
    mirrorKey: 'forearmLPronationDeg',
    mirrorInvertSign: true,
    label: 'Antebrazo Der. · Pronación(+) / Supin.(-)',
    min: -85,
    max: 88,
    unit: '°',
    group: 'right_arm',
  },
  {
    key: 'wristRFlexionDeg',
    mirrorKey: 'wristLFlexionDeg',
    label: 'Muñeca Der. · Flexión(+) / Extensión(-)',
    min: -55,
    max: 60,
    unit: '°',
    group: 'right_arm',
  },
  {
    key: 'wristRDeviationDeg',
    mirrorKey: 'wristLDeviationDeg',
    label: 'Muñeca Der. · Desviación Cubital/Radial',
    min: -25,
    max: 30,
    unit: '°',
    group: 'right_arm',
  },

  // Tronco y Cuello
  { key: 'trunkFlexionDeg', label: 'Flexión(+) / Extensión(-) de Tronco', min: -30, max: 95, unit: '°', group: 'spine_head' },
  { key: 'trunkLateralDeg', label: 'Inclinación Lateral de Tronco', min: -35, max: 35, unit: '°', group: 'spine_head' },
  { key: 'trunkTwistDeg', label: 'Giro / Torsión Axial de Tronco', min: -55, max: 55, unit: '°', group: 'spine_head' },
  { key: 'neckFlexionDeg', label: 'Flexión(+) / Extensión(-) de Cuello', min: -35, max: 45, unit: '°', group: 'spine_head' },
  { key: 'neckLateralDeg', label: 'Inclinación Lateral de Cuello', min: -30, max: 30, unit: '°', group: 'spine_head' },
  { key: 'neckTwistDeg', label: 'Rotación Cervical (Cabeza)', min: -60, max: 60, unit: '°', group: 'spine_head' },

  // Piernas y Pies
  {
    key: 'hipLFlexionDeg',
    mirrorKey: 'hipRFlexionDeg',
    label: 'Cadera Izq. · Flexión(+) / Extensión(-)',
    min: -25,
    max: 120,
    unit: '°',
    group: 'legs_feet',
  },
  {
    key: 'kneeLFlexionDeg',
    mirrorKey: 'kneeRFlexionDeg',
    label: 'Rodilla Izq. · Flexión',
    min: 0,
    max: 135,
    unit: '°',
    group: 'legs_feet',
  },
  {
    key: 'ankleLDorsiflexionDeg',
    mirrorKey: 'ankleRDorsiflexionDeg',
    label: 'Tobillo Izq. · Dorsiflex.(+) / Plantar(-)',
    min: -45,
    max: 40,
    unit: '°',
    group: 'legs_feet',
  },
  {
    key: 'hipRFlexionDeg',
    mirrorKey: 'hipLFlexionDeg',
    label: 'Cadera Der. · Flexión(+) / Extensión(-)',
    min: -25,
    max: 120,
    unit: '°',
    group: 'legs_feet',
  },
  {
    key: 'kneeRFlexionDeg',
    mirrorKey: 'kneeLFlexionDeg',
    label: 'Rodilla Der. · Flexión',
    min: 0,
    max: 135,
    unit: '°',
    group: 'legs_feet',
  },
  {
    key: 'ankleRDorsiflexionDeg',
    mirrorKey: 'ankleLDorsiflexionDeg',
    label: 'Tobillo Der. · Dorsiflex.(+) / Plantar(-)',
    min: -45,
    max: 40,
    unit: '°',
    group: 'legs_feet',
  },

  // Orientación Espacial 3D
  {
    key: 'rootYawDeg',
    label: 'Giro Corporal Global (Yaw 3D)',
    min: -180,
    max: 180,
    step: 1,
    unit: '°',
    group: 'space_props',
  },
  {
    key: 'rootOffsetX',
    label: 'Desplazamiento 3D Lateral (X)',
    min: -0.8,
    max: 0.8,
    step: 0.02,
    unit: ' m',
    group: 'space_props',
  },
  {
    key: 'rootOffsetZ',
    label: 'Avance / Retroceso 3D (Z)',
    min: -0.8,
    max: 0.8,
    step: 0.02,
    unit: ' m',
    group: 'space_props',
  },
  {
    key: 'propOffsetX',
    label: 'Mueble / Estantería · Posición X',
    min: -1.4,
    max: 1.4,
    step: 0.02,
    unit: ' m',
    group: 'space_props',
  },
  {
    key: 'propOffsetY',
    label: 'Mueble / Estantería · Altura Y',
    min: -0.6,
    max: 0.8,
    step: 0.02,
    unit: ' m',
    group: 'space_props',
  },
  {
    key: 'propOffsetZ',
    label: 'Mueble / Estantería · Profundidad Z',
    min: -1.4,
    max: 1.4,
    step: 0.02,
    unit: ' m',
    group: 'space_props',
  },
  {
    key: 'propRotYDeg',
    label: 'Mueble / Estantería · Giro Horizontal',
    min: -180,
    max: 180,
    step: 1,
    unit: '°',
    group: 'space_props',
  },
  {
    key: 'propScale',
    defaultValue: 1,
    label: 'Mueble / Estantería · Escala',
    min: 0.65,
    max: 1.45,
    step: 0.05,
    unit: '×',
    group: 'space_props',
  },
];

function clampNum(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Posición Cero oficial del modo Cáscara de Cebolla:
 * - Brazo izquierdo extendido en extensión sana (170° internos = 10° de curvatura fisiológica) con mano abierta.
 * - Brazo derecho relajado junto al tronco (hombro 0° flex / 5° abd, codo 164° internos, mano relajada).
 * - Tronco, cuello y miembros inferiores alineados en vertical neutra 0°.
 */
export function makeOnionSkinZeroPose(axis: ZeroExtensionAxis = 'lateral_90'): PosturePose3D {
  return makeNeutralPose({
    stanceMode: 'standing',
    prop: 'none' as ScenePropType,
    trunkFlexionDeg: 0,
    trunkLateralDeg: 0,
    trunkTwistDeg: 0,
    neckFlexionDeg: 0,
    neckLateralDeg: 0,
    neckTwistDeg: 0,
    // Brazo izquierdo extendido sano (170° internos) + mano abierta
    shoulderLFlexionDeg: axis === 'frontal_90' ? 90 : 0,
    shoulderLAbductionDeg: axis === 'lateral_90' ? 90 : 0,
    elbowLFlexionDeg: 10,
    forearmLPronationDeg: axis === 'lateral_90' ? 82 : 0,
    wristLFlexionDeg: 0,
    wristLDeviationDeg: 0,
    handLGripMode: 'open',
    // Brazo derecho relajado natural junto al cuerpo (164° internos)
    shoulderRFlexionDeg: 0,
    shoulderRAbductionDeg: 5,
    elbowRFlexionDeg: 16,
    forearmRPronationDeg: 0,
    wristRFlexionDeg: 0,
    wristRDeviationDeg: 0,
    handRGripMode: 'relaxed',
    handGripMode: 'relaxed',
    // Miembros inferiores neutros equilibrados
    hipLFlexionDeg: 0,
    kneeLFlexionDeg: 0,
    ankleLDorsiflexionDeg: 0,
    hipRFlexionDeg: 0,
    kneeRFlexionDeg: 0,
    ankleRDorsiflexionDeg: 0,
    rootOffsetX: 0,
    rootOffsetZ: 0,
    rootYawDeg: 0,
    loadKg: 0,
  });
}

function buildAsymmetricRulaFromPose(pose: PosturePose3D): RulaData {
  const forceLoadVal: 0 | 1 | 2 | 3 =
    (pose.loadKg ?? 0) > 10 ? 2 : (pose.loadKg ?? 0) >= 2 ? 1 : 0;

  const makeSide = (
    shFlex: number,
    shAbd: number,
    elbFlex: number,
    wrFlex: number,
    wrDev: number,
    prono: number,
    elevated?: boolean,
  ): RulaSideInput => {
    const elevDeg = Math.max(Math.abs(shFlex), Math.max(0, shAbd));
    const upperArmPos: 1 | 2 | 3 | 4 =
      elevDeg <= 20 ? 1 : elevDeg <= 45 ? 2 : elevDeg <= 90 ? 3 : 4;
    const lowerArmPos: 1 | 2 = elbFlex >= 60 && elbFlex <= 100 ? 1 : 2;
    const absWr = Math.abs(wrFlex);
    const wristPos: 1 | 2 | 3 = absWr <= 2 ? 1 : absWr <= 15 ? 2 : 3;
    const wristTwist: 1 | 2 = Math.abs(prono) > 45 ? 2 : 1;

    return {
      upperArmPos,
      shoulderRaised: Boolean(elevated),
      armAbducted: shAbd > 20,
      armSupported: pose.stanceMode === 'seated' && pose.trunkFlexionDeg <= 4 && elevDeg <= 25,
      lowerArmPos,
      lowerArmCrossMidline: shAbd < -8,
      wristPos,
      wristDeviated: Math.abs(wrDev) > 10,
      wristTwist,
      muscleUseA: 0,
      forceLoadA: forceLoadVal,
    };
  };

  const right = makeSide(
    pose.shoulderRFlexionDeg,
    pose.shoulderRAbductionDeg,
    pose.elbowRFlexionDeg,
    pose.wristRFlexionDeg,
    pose.wristRDeviationDeg,
    pose.forearmRPronationDeg,
    pose.shoulderRElevated,
  );
  const left = makeSide(
    pose.shoulderLFlexionDeg,
    pose.shoulderLAbductionDeg,
    pose.elbowLFlexionDeg,
    pose.wristLFlexionDeg ?? 0,
    pose.wristLDeviationDeg ?? 0,
    pose.forearmLPronationDeg ?? 0,
    false,
  );

  const nk = pose.neckFlexionDeg;
  const neckPos: 1 | 2 | 3 | 4 = nk < -4 ? 4 : nk <= 10 ? 1 : nk <= 20 ? 2 : 3;
  const tr = pose.trunkFlexionDeg;
  const trunkPos: 1 | 2 | 3 | 4 = Math.abs(tr) <= 4 ? 1 : tr <= 20 ? 2 : tr <= 60 ? 3 : 4;
  const legsBalanced =
    pose.stanceMode !== 'one_leg' &&
    pose.stanceMode !== 'kneeling' &&
    Math.abs(pose.kneeRFlexionDeg - pose.kneeLFlexionDeg) <= 18;

  return {
    evaluatedSide: 'ambos',
    right,
    left,
    neckPos,
    neckRotated: Math.abs(pose.neckTwistDeg) > 10,
    neckSideBending: Math.abs(pose.neckLateralDeg) > 10,
    trunkPos,
    trunkTwisted: Math.abs(pose.trunkTwistDeg) > 10,
    trunkSideBending: Math.abs(pose.trunkLateralDeg) > 10,
    legsPos: legsBalanced ? 1 : 2,
    muscleUseB: 0,
    forceLoadB: forceLoadVal,
    cycleDurationSec: 30,
    postureHoldTimeSec: 10,
  };
}

function buildAsymmetricRebaFromPose(pose: PosturePose3D): RebaData {
  const tr = pose.trunkFlexionDeg;
  const trunkPos: 1 | 2 | 3 | 4 = Math.abs(tr) <= 4 ? 1 : tr < 0 || tr <= 20 ? 2 : tr <= 60 ? 3 : 4;
  const nk = pose.neckFlexionDeg;
  const neckPos: 1 | 2 = nk >= 0 && nk <= 20 ? 1 : 2;
  const maxKnee = Math.max(pose.kneeRFlexionDeg, pose.kneeLFlexionDeg);
  const legsBase: 1 | 2 =
    pose.stanceMode === 'one_leg' ||
    pose.stanceMode === 'kneeling' ||
    Math.abs(pose.kneeRFlexionDeg - pose.kneeLFlexionDeg) > 20
      ? 2
      : 1;
  const legsKneeFlexion: 0 | 1 | 2 =
    pose.stanceMode === 'seated' ? 0 : maxKnee > 60 ? 2 : maxKnee >= 30 ? 1 : 0;

  const makeSide = (
    shFlex: number,
    shAbd: number,
    elbFlex: number,
    wrFlex: number,
    wrDev: number,
    prono: number,
    gripMode: PosturePose3D['handGripMode'],
    elevated?: boolean,
  ): RebaSideInput => {
    const elevDeg = Math.max(Math.abs(shFlex), Math.max(0, shAbd));
    const upperArmPos: 1 | 2 | 3 | 4 =
      elevDeg <= 20 ? 1 : elevDeg <= 45 ? 2 : elevDeg <= 90 ? 3 : 4;
    const lowerArmPos: 1 | 2 = elbFlex >= 60 && elbFlex <= 100 ? 1 : 2;
    const wristPos: 1 | 2 = Math.abs(wrFlex) <= 15 ? 1 : 2;

    return {
      upperArmPos,
      shoulderRaised: Boolean(elevated),
      armAbducted: shAbd > 20,
      armSupported: false,
      lowerArmPos,
      wristPos,
      wristTwistedOrDeviated: Math.abs(wrDev) > 10 || Math.abs(prono) > 55,
      coupling: (gripMode === 'pinch' ? 2 : 0) as 0 | 1 | 2 | 3,
    };
  };

  return {
    evaluatedSide: 'ambos',
    trunkPos,
    trunkTwistedOrSide: Math.abs(pose.trunkTwistDeg) > 10 || Math.abs(pose.trunkLateralDeg) > 10,
    neckPos,
    neckTwistedOrSide: Math.abs(pose.neckTwistDeg) > 10 || Math.abs(pose.neckLateralDeg) > 10,
    legsBase,
    legsKneeFlexion,
    loadForce: (pose.loadKg ?? 0) > 10 ? 2 : (pose.loadKg ?? 0) >= 5 ? 1 : 0,
    shockForce: false,
    right: makeSide(
      pose.shoulderRFlexionDeg,
      pose.shoulderRAbductionDeg,
      pose.elbowRFlexionDeg,
      pose.wristRFlexionDeg,
      pose.wristRDeviationDeg,
      pose.forearmRPronationDeg,
      pose.handRGripMode ?? pose.handGripMode,
      pose.shoulderRElevated,
    ),
    left: makeSide(
      pose.shoulderLFlexionDeg,
      pose.shoulderLAbductionDeg,
      pose.elbowLFlexionDeg,
      pose.wristLFlexionDeg ?? 0,
      pose.wristLDeviationDeg ?? 0,
      pose.forearmLPronationDeg ?? 0,
      pose.handLGripMode ?? pose.handGripMode,
      false,
    ),
    activityStatic: false,
    activityRepetitive: false,
    activityUnstableChanges: false,
  };
}

const AngleNumericRow: React.FC<{
  spec: AngleFieldSpec;
  value: number;
  onChange: (nextVal: number) => void;
}> = ({ spec, value, onChange }) => {
  const step = spec.step ?? 1;
  const uiValue = spec.invertAsInternal180 ? clampNum(180 - value, spec.min, spec.max) : value;
  const displayVal = step < 1 ? Number(uiValue.toFixed(2)) : Math.round(uiValue);

  const emitChange = (nextUiVal: number) => {
    const clamped = clampNum(nextUiVal, spec.min, spec.max);
    onChange(spec.invertAsInternal180 ? 180 - clamped : clamped);
  };

  return (
    <div className="bg-slate-50/90 border border-slate-200 rounded-md px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-slate-800 leading-snug">{spec.label}</label>
        <div className="inline-flex items-center gap-1 shrink-0">
          <input
            type="number"
            min={spec.min}
            max={spec.max}
            step={step}
            value={displayVal}
            onChange={(e) => {
              const parsed = parseFloat(e.target.value);
              if (Number.isFinite(parsed)) {
                emitChange(parsed);
              }
            }}
            className="w-20 min-h-[34px] rounded border border-slate-300 bg-white px-2 py-1 text-right text-xs font-mono font-bold text-slate-900 tabular-nums focus:outline-none focus:border-sky-600"
          />
          <span className="text-xs font-mono text-slate-500 w-4">{spec.unit.trim()}</span>
        </div>
      </div>
      <input
        type="range"
        min={spec.min}
        max={spec.max}
        step={step}
        value={uiValue}
        onChange={(e) => emitChange(parseFloat(e.target.value))}
        className="w-full h-2 accent-sky-700 cursor-pointer"
      />
    </div>
  );
};

export const OnionSkinAvatarWorkspace: React.FC<OnionSkinAvatarWorkspaceProps> = ({
  onBackToEvaluator,
  onAddPoseTabToStudy,
}) => {
  const [zeroAxis, setZeroAxis] = useState<ZeroExtensionAxis>('lateral_90');
  const [pose, setPose] = useState<PosturePose3D>(() => makeOnionSkinZeroPose('lateral_90'));
  const [ghostPose, setGhostPose] = useState<PosturePose3D>(() => makeOnionSkinZeroPose('lateral_90'));
  const [ghostLabel, setGhostLabel] = useState<string>('Posición Cero');
  const [propVisibilityMode, setPropVisibilityMode] = useState<'always' | 'hidden' | 'final_photo_only'>('always');
  const [previewFinalPhotoProp, setPreviewFinalPhotoProp] = useState<boolean>(false);

  // Cámara 3D del Avatar
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('frontal');
  const [orbit, setOrbit] = useState<CameraOrbitOverride>({
    azimuthDeg: 0,
    elevationDeg: 4,
    zoom: 1.02,
  });

  // Controles de Capas "Cáscara de Cebolla" (Onion Skin)
  const [avatarOpacity, setAvatarOpacity] = useState<number>(0.58);
  const [showGhostLayer, setShowGhostLayer] = useState<boolean>(false);
  const [ghostOpacity, setGhostOpacity] = useState<number>(0.26);
  const [avatarPanX, setAvatarPanX] = useState<number>(0);
  const [avatarPanY, setAvatarPanY] = useState<number>(0);
  const [avatarScale2D, setAvatarScale2D] = useState<number>(1.0);
  const [xrayTint, setXrayTint] = useState<boolean>(false);

  // Fotografía subida de fondo y calibración geométrica
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoFileName, setPhotoFileName] = useState<string>('');
  const [photoOpacity, setPhotoOpacity] = useState<number>(1.0);
  const [photoZoom, setPhotoZoom] = useState<number>(1.0);
  const [photoPanX, setPhotoPanX] = useState<number>(0);
  const [photoPanY, setPhotoPanY] = useState<number>(0);
  const [photoTiltDeg, setPhotoTiltDeg] = useState<number>(0);
  const [photoFlipH, setPhotoFlipH] = useState<boolean>(false);
  const [showPlumbGrid, setShowPlumbGrid] = useState<boolean>(true);
  const [isDragOverPhoto, setIsDragOverPhoto] = useState<boolean>(false);

  // Herramientas interactivas sobre el lienzo
  const [pointerMode, setPointerMode] = useState<PointerToolMode>('move_joints');
  const [showGizmos, setShowGizmos] = useState<boolean>(true);
  const [showAngleBadges, setShowAngleBadges] = useState<boolean>(true);
  const [symmetryLocked, setSymmetryLocked] = useState<boolean>(false);
  const [autoFlatFoot, setAutoFlatFoot] = useState<boolean>(true);
  const [activeGroup, setActiveGroup] = useState<JointControlGroup>('left_arm');
  const [selectedJoint, setSelectedJoint] = useState<JointKey | null>('shoulderL');
  const [hoveredJoint, setHoveredJoint] = useState<JointKey | null>(null);
  const [glbReadyTick, setGlbReadyTick] = useState<number>(0);
  const [photoReadyTick, setPhotoReadyTick] = useState<number>(0);
  const [taskTitle, setTaskTitle] = useState<string>('Calco Fotográfico en Cáscara de Cebolla');
  const [statusFeedback, setStatusFeedback] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null);
  const activeAvatarOffRef = useRef<HTMLCanvasElement | null>(null);
  const ghostAvatarOffRef = useRef<HTMLCanvasElement | null>(null);
  const photoImgRef = useRef<HTMLImageElement | null>(null);
  const rawAvatarJointsRef = useRef<Record<JointKey, { x: number; y: number }> | null>(null);

  const dragSessionRef = useRef<
    | {
        kind: 'joint';
        joint: JointKey;
        startX: number;
        startY: number;
        startPose: PosturePose3D;
      }
    | {
        kind: 'align_avatar';
        startX: number;
        startY: number;
        pan0X: number;
        pan0Y: number;
      }
    | {
        kind: 'orbit';
        startX: number;
        startY: number;
        az0: number;
        el0: number;
      }
    | {
        kind: 'pan_photo';
        startX: number;
        startY: number;
        p0X: number;
        p0Y: number;
      }
    | null
  >(null);

  useEffect(() => {
    ensureAvatarGlbLoaded().then(() => setGlbReadyTick((t) => t + 1));
    const unsub = subscribeAvatarGlbLoaded(() => setGlbReadyTick((t) => t + 1));
    return unsub;
  }, []);

  const loadPhotoFromFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setStatusFeedback('Seleccione un archivo de imagen válido (JPG, PNG, WEBP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : null;
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        photoImgRef.current = img;
        setPhotoDataUrl(dataUrl);
        setPhotoFileName(file.name);
        setPhotoZoom(1.0);
        setPhotoPanX(0);
        setPhotoPanY(0);
        setPhotoTiltDeg(0);
        setPhotoFlipH(false);
        setPhotoReadyTick((t) => t + 1);
        setStatusFeedback(
          `Foto "${file.name}" cargada (${img.naturalWidth}×${img.naturalHeight} px). Ajuste la posición/escala del Avatar o arrastre los nodos sobre el operario.`,
        );
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, []);

  // Soporte para pegar imagen con Ctrl+V directamente en la pestaña
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) {
            loadPhotoFromFile(f);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loadPhotoFromFile]);

  const liveProp: ScenePropType =
    propVisibilityMode === 'hidden'
      ? 'none'
      : propVisibilityMode === 'final_photo_only' && !previewFinalPhotoProp
        ? 'none'
        : pose.prop || 'none';
  const exportProp: ScenePropType = propVisibilityMode === 'hidden' ? 'none' : pose.prop || 'none';

  const activePanelSpec: Panel3DSpec = useMemo(
    () => ({
      subTitle: taskTitle,
      focusZone: 'full_body',
      cameraPreset,
      pose: { ...pose, prop: liveProp },
      angleArcs: [],
      forceVectors: [],
    }),
    [taskTitle, cameraPreset, pose, liveProp],
  );

  const exportPanelSpec: Panel3DSpec = useMemo(
    () => ({
      subTitle: taskTitle,
      focusZone: 'full_body',
      cameraPreset,
      pose: { ...pose, prop: exportProp },
      angleArcs: [],
      forceVectors: [],
    }),
    [taskTitle, cameraPreset, pose, exportProp],
  );

  const ghostPanelSpec: Panel3DSpec = useMemo(
    () => ({
      subTitle: ghostLabel,
      focusZone: 'full_body',
      cameraPreset,
      pose: { ...ghostPose, prop: 'none' },
      angleArcs: [],
      forceVectors: [],
    }),
    [ghostLabel, cameraPreset, ghostPose],
  );

  // Transforma un punto 2D del avatar (espacio lógico STAGE_W x STAGE_H) al lienzo compuesto con pan/escala 2D
  const mapAvatarPtToStage = useCallback(
    (pt: { x: number; y: number }): { x: number; y: number } => ({
      x: STAGE_W * 0.5 + avatarPanX + (pt.x - STAGE_W * 0.5) * avatarScale2D,
      y: STAGE_H * 0.5 + avatarPanY + (pt.y - STAGE_H * 0.5) * avatarScale2D,
    }),
    [avatarPanX, avatarPanY, avatarScale2D],
  );

  // 1) Render offscreen de la sombra fantasma ("Cáscara Previa / Posición Cero") sólo cuando cambia ghostPose o cámara
  useEffect(() => {
    void glbReadyTick;
    if (!showGhostLayer) return;
    if (!ghostAvatarOffRef.current) {
      ghostAvatarOffRef.current = document.createElement('canvas');
    }
    renderInteractivePose3DToCanvas(
      ghostPanelSpec,
      ghostAvatarOffRef.current,
      STAGE_W,
      STAGE_H,
      orbit,
      2,
      'anatomical_skin',
      true,
      true,
    );
  }, [showGhostLayer, ghostPanelSpec, orbit, glbReadyTick]);

  // 2) Render offscreen del Avatar 3D activo (fondo 100% transparente y sin sombra de piso)
  useEffect(() => {
    void glbReadyTick;
    if (!activeAvatarOffRef.current) {
      activeAvatarOffRef.current = document.createElement('canvas');
    }
    const pts = renderInteractiveFreeAvatarToCanvas(
      activePanelSpec,
      activeAvatarOffRef.current,
      STAGE_W,
      STAGE_H,
      orbit,
      2,
      {
        showGizmos: false,
        interactiveJoints: INTERACTIVE_JOINTS,
        transparentBg: true,
        hideGroundShadow: true,
      },
    );
    rawAvatarJointsRef.current = pts;
  }, [activePanelSpec, orbit, glbReadyTick]);

  // Función pura para componer Foto + Plomada + Sombra Fantasma + Avatar Cáscara de Cebolla + Nodos/Ángulos
  const drawCompositeScene = useCallback(
    (
      targetCanvas: HTMLCanvasElement,
      dpiScale: number,
      opts: {
        includeGizmos: boolean;
        includeAngles: boolean;
        includePlumb: boolean;
        overrideAvatarCanvas?: HTMLCanvasElement | null;
      },
    ) => {
      targetCanvas.width = Math.round(STAGE_W * dpiScale);
      targetCanvas.height = Math.round(STAGE_H * dpiScale);
      const ctx = targetCanvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpiScale, 0, 0, dpiScale, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Fondo base técnico
      const img = photoImgRef.current;
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, STAGE_W, STAGE_H);

        ctx.save();
        ctx.globalAlpha = clampNum(photoOpacity, 0.1, 1);
        ctx.translate(STAGE_W * 0.5 + photoPanX, STAGE_H * 0.5 + photoPanY);
        if (Math.abs(photoTiltDeg) > 0.05) {
          ctx.rotate((photoTiltDeg * Math.PI) / 180);
        }
        if (photoFlipH) {
          ctx.scale(-1, 1);
        }
        const fitScale = Math.min(STAGE_W / img.naturalWidth, STAGE_H / img.naturalHeight) * photoZoom;
        const dw = img.naturalWidth * fitScale;
        const dh = img.naturalHeight * fitScale;
        ctx.drawImage(img, -dw * 0.5, -dh * 0.5, dw, dh);
        ctx.restore();
      } else {
        // Mesa luminosa de calco técnico cuando aún no se subió fotografía
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, STAGE_W, STAGE_H);
        ctx.save();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        const step = 36;
        ctx.beginPath();
        for (let x = step; x < STAGE_W; x += step) {
          ctx.moveTo(x + 0.5, 0);
          ctx.lineTo(x + 0.5, STAGE_H);
        }
        for (let y = step; y < STAGE_H; y += step) {
          ctx.moveTo(0, y + 0.5);
          ctx.lineTo(STAGE_W, y + 0.5);
        }
        ctx.stroke();
        ctx.restore();
      }

      // Ejes de plomada gravitatoria real (0° vertical y nivel horizontal)
      if (opts.includePlumb) {
        const cx = Math.round(STAGE_W * 0.5 + avatarPanX) + 0.5;
        const cy = Math.round(STAGE_H * 0.5 + avatarPanY) + 0.5;
        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = img ? 'rgba(56, 189, 248, 0.65)' : 'rgba(2, 132, 199, 0.45)';
        ctx.beginPath();
        ctx.moveTo(cx, 10);
        ctx.lineTo(cx, STAGE_H - 10);
        ctx.moveTo(12, cy);
        ctx.lineTo(STAGE_W - 12, cy);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.font = '700 10.5px "IBM Plex Mono", monospace';
        ctx.fillStyle = img ? 'rgba(15, 23, 42, 0.78)' : 'rgba(241, 245, 249, 0.92)';
        ctx.fillRect(cx + 6, 12, 92, 18);
        ctx.fillStyle = img ? '#38bdf8' : '#0369a1';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('PLOMADA 0°', cx + 11, 21);
        ctx.restore();
      }

      const drawW = STAGE_W * avatarScale2D;
      const drawH = STAGE_H * avatarScale2D;
      const drawX = STAGE_W * 0.5 + avatarPanX - drawW * 0.5;
      const drawY = STAGE_H * 0.5 + avatarPanY - drawH * 0.5;

      // Capa Fantasma de Referencia ("Piel Previa / Posición Cero")
      if (showGhostLayer && ghostAvatarOffRef.current && ghostAvatarOffRef.current.width > 0) {
        ctx.save();
        ctx.globalAlpha = clampNum(ghostOpacity, 0.08, 0.75);
        ctx.filter = 'hue-rotate(165deg) saturate(1.65) brightness(1.08)';
        ctx.drawImage(ghostAvatarOffRef.current, drawX, drawY, drawW, drawH);
        ctx.restore();
      }

      // Capa Principal: Avatar 3D en Cáscara de Cebolla
      const actCanvas = opts.overrideAvatarCanvas || activeAvatarOffRef.current;
      if (actCanvas && actCanvas.width > 0) {
        ctx.save();
        ctx.globalAlpha = clampNum(avatarOpacity, 0.08, 1);
        if (xrayTint) {
          ctx.filter = 'contrast(1.18) saturate(1.25) drop-shadow(0px 0px 2px rgba(14,165,233,0.85))';
        }
        ctx.drawImage(actCanvas, drawX, drawY, drawW, drawH);
        ctx.restore();
      }

      // Nodos articulares y etiquetas angulares al 100% de nitidez encima de la piel translúcida
      const rawPts = rawAvatarJointsRef.current;
      if (rawPts && (opts.includeGizmos || opts.includeAngles)) {
        ctx.save();
        if (opts.includeGizmos) {
          ctx.strokeStyle = img ? 'rgba(56, 189, 248, 0.72)' : 'rgba(2, 132, 199, 0.42)';
          ctx.lineWidth = 1.8;
          for (const [a, b] of BONE_OVERLAY_PAIRS) {
            const pa = rawPts[a];
            const pb = rawPts[b];
            if (!pa || !pb) continue;
            const sa = mapAvatarPtToStage(pa);
            const sb = mapAvatarPtToStage(pb);
            ctx.beginPath();
            ctx.moveTo(sa.x, sa.y);
            ctx.lineTo(sb.x, sb.y);
            ctx.stroke();
          }

          for (const jk of INTERACTIVE_JOINTS) {
            const rp = rawPts[jk];
            if (!rp) continue;
            const p = mapAvatarPtToStage(rp);
            const isSelected = selectedJoint === jk;
            const isHovered = hoveredJoint === jk;
            const r = isSelected ? 8.5 : isHovered ? 7.5 : 5.4;

            if (isSelected || isHovered) {
              ctx.beginPath();
              ctx.arc(p.x, p.y, r + 4.5, 0, Math.PI * 2);
              ctx.fillStyle = isSelected ? 'rgba(234, 88, 12, 0.30)' : 'rgba(14, 165, 233, 0.28)';
              ctx.fill();
            }

            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fillStyle = isSelected ? '#ea580c' : isHovered ? '#0284c7' : 'rgba(255, 255, 255, 0.94)';
            ctx.fill();
            ctx.lineWidth = isSelected ? 2.4 : 1.9;
            ctx.strokeStyle = isSelected ? '#ffffff' : '#0284c7';
            ctx.stroke();
          }
        }

        if (opts.includeAngles) {
          const elbIntL = clampNum(Math.round(180 - pose.elbowLFlexionDeg), 30, 170);
          const elbIntR = clampNum(Math.round(180 - pose.elbowRFlexionDeg), 30, 170);
          let skelMinX = STAGE_W * 0.36;
          let skelMaxX = STAGE_W * 0.64;
          const spanPts = Object.values(rawPts);
          if (spanPts.length >= 3) {
            skelMinX = Infinity;
            skelMaxX = -Infinity;
            for (const p of spanPts) {
              if (!p) continue;
              const sp = mapAvatarPtToStage(p);
              if (sp.x < skelMinX) skelMinX = sp.x;
              if (sp.x > skelMaxX) skelMaxX = sp.x;
            }
          }
          const skelMidX = (skelMinX + skelMaxX) * 0.5;

          const badgeDefs: Array<{ ptKey: JointKey; text: string; accent: string; preferSide?: 'left' | 'right' }> = [
            {
              ptKey: 'c7',
              text: `Cuello ${Math.round(pose.neckFlexionDeg)}°`,
              accent: '#0f766e',
              preferSide: 'left',
            },
            {
              ptKey: 'l5s1',
              text: `Tronco ${Math.round(pose.trunkFlexionDeg)}°`,
              accent: '#c2410c',
              preferSide: 'left',
            },
            {
              ptKey: 'shoulderL',
              text: `H.Izq ${Math.round(pose.shoulderLFlexionDeg)}°F · ${Math.round(pose.shoulderLAbductionDeg)}°Abd`,
              accent: '#0284c7',
            },
            {
              ptKey: 'elbowL',
              text: `Codo Izq ${elbIntL}°`,
              accent: '#0284c7',
            },
            {
              ptKey: 'shoulderR',
              text: `H.Der ${Math.round(pose.shoulderRFlexionDeg)}°F · ${Math.round(pose.shoulderRAbductionDeg)}°Abd`,
              accent: '#334155',
            },
            {
              ptKey: 'elbowR',
              text: `Codo Der ${elbIntR}°`,
              accent: '#334155',
            },
          ];

          ctx.font = '700 10.5px "IBM Plex Mono", monospace';
          type PlacedColItem = {
            ax: number;
            ay: number;
            tw: number;
            th: number;
            bx: number;
            by: number;
            text: string;
            accent: string;
            side: 'left' | 'right';
          };
          const leftCol: PlacedColItem[] = [];
          const rightCol: PlacedColItem[] = [];

          for (const b of badgeDefs) {
            const rp = rawPts[b.ptKey];
            if (!rp) continue;
            const sp = mapAvatarPtToStage(rp);
            const tw = Math.ceil(ctx.measureText(b.text).width) + 10;
            const th = 19;
            const side: 'left' | 'right' =
              b.preferSide ?? (sp.x >= skelMidX ? 'right' : 'left');
            const item: PlacedColItem = {
              ax: sp.x,
              ay: sp.y,
              tw,
              th,
              bx: 0,
              by: clampNum(sp.y - th * 0.5, 8, STAGE_H - th - 8),
              text: b.text,
              accent: b.accent,
              side,
            };
            if (side === 'left') leftCol.push(item);
            else rightCol.push(item);
          }

          const stackColumn = (items: PlacedColItem[], side: 'left' | 'right') => {
            items.sort((a, b) => a.ay - b.ay);
            const gap = 5;
            for (let i = 1; i < items.length; i++) {
              const prev = items[i - 1];
              if (items[i].by < prev.by + prev.th + gap) {
                items[i].by = prev.by + prev.th + gap;
              }
            }
            for (let i = items.length - 1; i >= 0; i--) {
              const maxY = STAGE_H - items[i].th - 8;
              if (items[i].by > maxY) items[i].by = maxY;
              if (i < items.length - 1) {
                const next = items[i + 1];
                if (items[i].by + items[i].th + gap > next.by) {
                  items[i].by = Math.max(8, next.by - items[i].th - gap);
                }
              }
            }
            for (const it of items) {
              it.bx =
                side === 'left'
                  ? clampNum(skelMinX - 20 - it.tw, 6, Math.max(6, STAGE_W * 0.38 - it.tw))
                  : clampNum(skelMaxX + 20, Math.min(STAGE_W - it.tw - 6, STAGE_W * 0.62), STAGE_W - it.tw - 6);
            }
          };

          stackColumn(leftCol, 'left');
          stackColumn(rightCol, 'right');

          for (const it of [...leftCol, ...rightCol]) {
            const edgeX = it.side === 'left' ? it.bx + it.tw : it.bx;
            const midY = it.by + it.th * 0.5;
            const elbowX = it.side === 'left' ? edgeX + 7 : edgeX - 7;

            ctx.save();
            ctx.strokeStyle = it.accent;
            ctx.globalAlpha = 0.72;
            ctx.lineWidth = 1.15;
            ctx.beginPath();
            ctx.moveTo(it.ax, it.ay);
            ctx.lineTo(elbowX, midY);
            ctx.lineTo(edgeX, midY);
            ctx.stroke();
            ctx.restore();

            ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
            ctx.strokeStyle = it.accent;
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            ctx.roundRect(it.bx, it.by, it.tw, it.th, 4);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = it.accent;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(it.text, it.bx + 5, midY + 0.5);
          }
        }
        ctx.restore();
      }
    },
    [
      photoOpacity,
      photoPanX,
      photoPanY,
      photoTiltDeg,
      photoFlipH,
      photoZoom,
      avatarPanX,
      avatarPanY,
      avatarScale2D,
      showGhostLayer,
      ghostOpacity,
      avatarOpacity,
      xrayTint,
      selectedJoint,
      hoveredJoint,
      pose,
      mapAvatarPtToStage,
    ],
  );

  // 3) Re-dibujar lienzo visible ante cualquier cambio de capa, foto, opacidad o articulación
  useEffect(() => {
    void glbReadyTick;
    void photoReadyTick;
    const canvas = compositeCanvasRef.current;
    if (!canvas) return;
    drawCompositeScene(canvas, 2, {
      includeGizmos: showGizmos,
      includeAngles: showAngleBadges,
      includePlumb: showPlumbGrid,
    });
  }, [
    drawCompositeScene,
    showGizmos,
    showAngleBadges,
    showPlumbGrid,
    activePanelSpec,
    ghostPanelSpec,
    orbit,
    glbReadyTick,
    photoReadyTick,
  ]);

  const applyAnglePatch = useCallback(
    (basePose: PosturePose3D, updates: Partial<PosturePose3D>): PosturePose3D => {
      const next: PosturePose3D = { ...basePose, ...updates };

      if (symmetryLocked) {
        for (const field of ANGLE_FIELDS) {
          if (field.key in updates && field.mirrorKey && !(field.mirrorKey in updates)) {
            const rawVal = Number(updates[field.key] ?? 0);
            (next as unknown as Record<string, unknown>)[field.mirrorKey] = field.mirrorInvertSign
              ? -rawVal
              : rawVal;
          }
        }
      }

      if (
        autoFlatFoot &&
        next.stanceMode !== 'seated' &&
        next.stanceMode !== 'kneeling' &&
        next.stanceMode !== 'walking'
      ) {
        if ('kneeRFlexionDeg' in updates && !('hipRFlexionDeg' in updates)) {
          next.ankleRDorsiflexionDeg = clampNum(Math.round(next.kneeRFlexionDeg * 0.28), -20, 32);
          next.hipRFlexionDeg = clampNum(next.kneeRFlexionDeg - next.ankleRDorsiflexionDeg, -15, 115);
        } else if ('hipRFlexionDeg' in updates && !('ankleRDorsiflexionDeg' in updates)) {
          next.ankleRDorsiflexionDeg = clampNum(next.kneeRFlexionDeg - next.hipRFlexionDeg, -25, 34);
        }
        if ('kneeLFlexionDeg' in updates && !('hipLFlexionDeg' in updates)) {
          next.ankleLDorsiflexionDeg = clampNum(Math.round(next.kneeLFlexionDeg * 0.28), -20, 32);
          next.hipLFlexionDeg = clampNum(next.kneeLFlexionDeg - next.ankleLDorsiflexionDeg, -15, 115);
        } else if ('hipLFlexionDeg' in updates && !('ankleLDorsiflexionDeg' in updates)) {
          next.ankleLDorsiflexionDeg = clampNum(next.kneeLFlexionDeg - next.hipLFlexionDeg, -25, 34);
        }
      }

      return next;
    },
    [symmetryLocked, autoFlatFoot],
  );

  const getStageCoords = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = STAGE_W / Math.max(1, rect.width);
    const scaleY = STAGE_H / Math.max(1, rect.height);
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const findNearestInteractiveJointOnStage = (
    stageX: number,
    stageY: number,
    maxRadius = 24,
  ): JointKey | null => {
    const rawMap = rawAvatarJointsRef.current;
    if (!rawMap) return null;
    let bestJoint: JointKey | null = null;
    let bestDist = maxRadius;
    for (const jk of INTERACTIVE_JOINTS) {
      const rp = rawMap[jk];
      if (!rp) continue;
      const sp = mapAvatarPtToStage(rp);
      const d = Math.hypot(sp.x - stageX, sp.y - stageY);
      if (d <= bestDist) {
        bestDist = d;
        bestJoint = jk;
      }
    }
    return bestJoint;
  };

  const selectGroupForJoint = (jk: JointKey) => {
    if (jk === 'shoulderL' || jk === 'elbowL' || jk === 'wristL') {
      setActiveGroup('left_arm');
    } else if (jk === 'shoulderR' || jk === 'elbowR' || jk === 'wristR') {
      setActiveGroup('right_arm');
    } else if (jk === 'head' || jk === 'c7' || jk === 't12' || jk === 'l5s1') {
      setActiveGroup('spine_head');
    } else if (
      jk === 'hipL' ||
      jk === 'kneeL' ||
      jk === 'ankleL' ||
      jk === 'hipR' ||
      jk === 'kneeR' ||
      jk === 'ankleR'
    ) {
      setActiveGroup('legs_feet');
    } else if (jk === 'pelvis') {
      setActiveGroup('space_props');
    }
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = getStageCoords(e);

    if (pointerMode === 'move_joints') {
      const hitRadius = e.pointerType === 'touch' ? 34 : 24;
      const hitJoint = findNearestInteractiveJointOnStage(x, y, hitRadius);
      if (hitJoint) {
        setSelectedJoint(hitJoint);
        selectGroupForJoint(hitJoint);
        dragSessionRef.current = {
          kind: 'joint',
          joint: hitJoint,
          startX: e.clientX,
          startY: e.clientY,
          startPose: { ...pose },
        };
        return;
      }
      // Si en modo nodos arrastra fuera de un nodo: con foto cargada encaja el avatar 2D, sin foto orbita 3D
      if (photoDataUrl && !e.altKey) {
        dragSessionRef.current = {
          kind: 'align_avatar',
          startX: e.clientX,
          startY: e.clientY,
          pan0X: avatarPanX,
          pan0Y: avatarPanY,
        };
        return;
      }
    }

    if (pointerMode === 'align_avatar') {
      dragSessionRef.current = {
        kind: 'align_avatar',
        startX: e.clientX,
        startY: e.clientY,
        pan0X: avatarPanX,
        pan0Y: avatarPanY,
      };
      return;
    }

    if (pointerMode === 'pan_photo') {
      dragSessionRef.current = {
        kind: 'pan_photo',
        startX: e.clientX,
        startY: e.clientY,
        p0X: photoPanX,
        p0Y: photoPanY,
      };
      return;
    }

    dragSessionRef.current = {
      kind: 'orbit',
      startX: e.clientX,
      startY: e.clientY,
      az0: orbit.azimuthDeg,
      el0: orbit.elevationDeg,
    };
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const session = dragSessionRef.current;
    if (!session) {
      if (pointerMode === 'move_joints' && e.pointerType === 'mouse') {
        const { x, y } = getStageCoords(e);
        setHoveredJoint(findNearestInteractiveJointOnStage(x, y, 22));
      } else if (hoveredJoint) {
        setHoveredJoint(null);
      }
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const stageRatioX = STAGE_W / Math.max(1, rect.width);
    const stageRatioY = STAGE_H / Math.max(1, rect.height);
    const dx = e.clientX - session.startX;
    const dy = e.clientY - session.startY;

    if (session.kind === 'align_avatar') {
      setAvatarPanX(clampNum(Math.round(session.pan0X + dx * stageRatioX), -420, 420));
      setAvatarPanY(clampNum(Math.round(session.pan0Y + dy * stageRatioY), -360, 360));
      return;
    }

    if (session.kind === 'pan_photo') {
      setPhotoPanX(clampNum(Math.round(session.p0X + dx * stageRatioX), -520, 520));
      setPhotoPanY(clampNum(Math.round(session.p0Y + dy * stageRatioY), -420, 420));
      return;
    }

    if (session.kind === 'orbit') {
      setOrbit((prev) => ({
        ...prev,
        azimuthDeg: clampNum(Math.round(session.az0 - dx * 0.45), -180, 180),
        elevationDeg: clampNum(Math.round(session.el0 + dy * 0.35), -65, 65),
      }));
      return;
    }

    const sp = session.startPose;
    const invScale = 1 / Math.max(0.55, avatarScale2D);
    const sens = 0.55 * invScale;
    let patch: Partial<PosturePose3D> = {};

    switch (session.joint) {
      case 'head':
        patch = {
          neckFlexionDeg: clampNum(Math.round(sp.neckFlexionDeg + dy * sens), -35, 45),
          neckTwistDeg: clampNum(Math.round(sp.neckTwistDeg + dx * sens), -60, 60),
        };
        break;
      case 'c7':
        patch = {
          neckFlexionDeg: clampNum(Math.round(sp.neckFlexionDeg + dy * sens), -35, 45),
          neckLateralDeg: clampNum(Math.round(sp.neckLateralDeg + dx * 0.45 * invScale), -30, 30),
        };
        break;
      case 't12':
        patch = {
          trunkFlexionDeg: clampNum(Math.round(sp.trunkFlexionDeg + dy * sens), -30, 95),
          trunkTwistDeg: clampNum(Math.round(sp.trunkTwistDeg + dx * sens), -55, 55),
        };
        break;
      case 'l5s1':
        patch = {
          trunkFlexionDeg: clampNum(Math.round(sp.trunkFlexionDeg + dy * sens), -30, 95),
          trunkLateralDeg: clampNum(Math.round(sp.trunkLateralDeg + dx * 0.45 * invScale), -35, 35),
        };
        break;
      case 'pelvis':
        if (e.shiftKey) {
          patch = {
            rootYawDeg: clampNum(Math.round((sp.rootYawDeg ?? 0) + dx * 0.7), -180, 180),
          };
        } else {
          patch = {
            rootOffsetX: clampNum(Number(((sp.rootOffsetX ?? 0) + dx * 0.003).toFixed(2)), -0.8, 0.8),
            rootOffsetZ: clampNum(Number(((sp.rootOffsetZ ?? 0) + dy * 0.003).toFixed(2)), -0.8, 0.8),
          };
        }
        break;
      case 'shoulderL':
        if (cameraPreset === 'frontal' || cameraPreset === 'dorsal') {
          patch = {
            shoulderLAbductionDeg: clampNum(
              Math.round(sp.shoulderLAbductionDeg - dy * 0.65 * invScale),
              -25,
              150,
            ),
            shoulderLFlexionDeg: clampNum(
              Math.round(sp.shoulderLFlexionDeg + dx * 0.5 * invScale),
              -45,
              170,
            ),
          };
        } else {
          patch = {
            shoulderLFlexionDeg: clampNum(
              Math.round(sp.shoulderLFlexionDeg - dy * 0.65 * invScale),
              -45,
              170,
            ),
            shoulderLAbductionDeg: clampNum(
              Math.round(sp.shoulderLAbductionDeg - dx * 0.5 * invScale),
              -25,
              150,
            ),
          };
        }
        break;
      case 'elbowL':
        patch = {
          elbowLFlexionDeg: clampNum(Math.round(sp.elbowLFlexionDeg - dy * 0.65 * invScale), 10, 150),
          forearmLPronationDeg: clampNum(
            Math.round((sp.forearmLPronationDeg ?? 0) + dx * 0.6 * invScale),
            -85,
            88,
          ),
        };
        break;
      case 'wristL':
        patch = {
          wristLFlexionDeg: clampNum(Math.round((sp.wristLFlexionDeg ?? 0) + dy * 0.55 * invScale), -55, 60),
          wristLDeviationDeg: clampNum(
            Math.round((sp.wristLDeviationDeg ?? 0) - dx * 0.45 * invScale),
            -25,
            30,
          ),
        };
        break;
      case 'shoulderR':
        if (cameraPreset === 'frontal' || cameraPreset === 'dorsal') {
          patch = {
            shoulderRAbductionDeg: clampNum(
              Math.round(sp.shoulderRAbductionDeg - dy * 0.65 * invScale),
              -25,
              150,
            ),
            shoulderRFlexionDeg: clampNum(
              Math.round(sp.shoulderRFlexionDeg - dx * 0.5 * invScale),
              -45,
              170,
            ),
          };
        } else {
          patch = {
            shoulderRFlexionDeg: clampNum(
              Math.round(sp.shoulderRFlexionDeg - dy * 0.65 * invScale),
              -45,
              170,
            ),
            shoulderRAbductionDeg: clampNum(
              Math.round(sp.shoulderRAbductionDeg + dx * 0.5 * invScale),
              -25,
              150,
            ),
          };
        }
        break;
      case 'elbowR':
        patch = {
          elbowRFlexionDeg: clampNum(Math.round(sp.elbowRFlexionDeg - dy * 0.65 * invScale), 10, 150),
          forearmRPronationDeg: clampNum(Math.round(sp.forearmRPronationDeg + dx * 0.6 * invScale), -85, 88),
        };
        break;
      case 'wristR':
        patch = {
          wristRFlexionDeg: clampNum(Math.round(sp.wristRFlexionDeg + dy * 0.55 * invScale), -55, 60),
          wristRDeviationDeg: clampNum(Math.round(sp.wristRDeviationDeg + dx * 0.45 * invScale), -25, 30),
        };
        break;
      case 'hipL':
        patch = {
          hipLFlexionDeg: clampNum(Math.round(sp.hipLFlexionDeg - dy * 0.6 * invScale), -25, 120),
        };
        break;
      case 'kneeL':
        patch = {
          kneeLFlexionDeg: clampNum(Math.round(sp.kneeLFlexionDeg + dy * 0.65 * invScale), 0, 135),
        };
        break;
      case 'ankleL':
        patch = {
          ankleLDorsiflexionDeg: clampNum(
            Math.round(sp.ankleLDorsiflexionDeg - dy * 0.5 * invScale),
            -45,
            40,
          ),
        };
        break;
      case 'hipR':
        patch = {
          hipRFlexionDeg: clampNum(Math.round(sp.hipRFlexionDeg - dy * 0.6 * invScale), -25, 120),
        };
        break;
      case 'kneeR':
        patch = {
          kneeRFlexionDeg: clampNum(Math.round(sp.kneeRFlexionDeg + dy * 0.65 * invScale), 0, 135),
        };
        break;
      case 'ankleR':
        patch = {
          ankleRDorsiflexionDeg: clampNum(
            Math.round(sp.ankleRDorsiflexionDeg - dy * 0.5 * invScale),
            -45,
            40,
          ),
        };
        break;
      default:
        break;
    }

    setPose(applyAnglePatch(sp, patch));
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragSessionRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  const handleWheelZoom = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    if (pointerMode === 'pan_photo') {
      setPhotoZoom((z) => clampNum(Number((z + delta).toFixed(2)), 0.4, 3.0));
    } else if (pointerMode === 'align_avatar' || photoDataUrl) {
      setAvatarScale2D((s) => clampNum(Number((s + delta).toFixed(2)), 0.45, 2.25));
    } else {
      setOrbit((prev) => ({
        ...prev,
        zoom: clampNum(Number((prev.zoom + delta).toFixed(2)), 0.65, 1.85),
      }));
    }
  };

  const handleResetToZeroPose = (axisOverride?: ZeroExtensionAxis) => {
    const targetAxis = axisOverride ?? zeroAxis;
    if (axisOverride) setZeroAxis(axisOverride);
    const zero = makeOnionSkinZeroPose(targetAxis);
    setPose(zero);
    setSymmetryLocked(false);
    if (targetAxis === 'lateral_90') {
      setCameraPreset('frontal');
      setOrbit({ azimuthDeg: 0, elevationDeg: 4, zoom: 1.02 });
    } else {
      setCameraPreset('sagittal_left');
      setOrbit({ azimuthDeg: 0, elevationDeg: 4, zoom: 1.02 });
    }
    setStatusFeedback(
      'Posición Cero restablecida: Brazo izquierdo extendido con mano abierta · Brazo derecho relajado.',
    );
    window.setTimeout(() => setStatusFeedback(''), 3600);
  };

  const handlePinCurrentAsGhost = () => {
    setGhostPose({ ...pose });
    setGhostLabel('Postura Previa Fijada');
    setShowGhostLayer(true);
    setStatusFeedback('Postura actual fijada como sombra fantasma de referencia (cáscara previa).');
    window.setTimeout(() => setStatusFeedback(''), 3500);
  };

  const handlePinZeroAsGhost = () => {
    setGhostPose(makeOnionSkinZeroPose(zeroAxis));
    setGhostLabel('Posición Cero');
    setShowGhostLayer(true);
  };

  const handleClearPhoto = () => {
    photoImgRef.current = null;
    setPhotoDataUrl(null);
    setPhotoFileName('');
    setPhotoZoom(1.0);
    setPhotoPanX(0);
    setPhotoPanY(0);
    setPhotoTiltDeg(0);
    setPhotoFlipH(false);
    setAvatarPanX(0);
    setAvatarPanY(0);
    setAvatarScale2D(1.0);
    setPhotoReadyTick((t) => t + 1);
  };

  const rulaEval = useMemo(() => evaluateRula(buildAsymmetricRulaFromPose(pose)), [pose]);
  const rebaEval = useMemo(() => evaluateReba(buildAsymmetricRebaFromPose(pose)), [pose]);
  const rulaSev = getSeverityStyles(rulaEval.severity);
  const rebaSev = getSeverityStyles(rebaEval.severity);

  const visibleFields = useMemo(
    () => (activeGroup === 'all' ? ANGLE_FIELDS : ANGLE_FIELDS.filter((f) => f.group === activeGroup)),
    [activeGroup],
  );

  const buildFinalPhotoAvatarCanvas = (): HTMLCanvasElement | null => {
    if (exportProp === liveProp) return null;
    const tempAvatar = document.createElement('canvas');
    renderInteractiveFreeAvatarToCanvas(exportPanelSpec, tempAvatar, STAGE_W, STAGE_H, orbit, 2, {
      showGizmos: false,
      interactiveJoints: INTERACTIVE_JOINTS,
      transparentBg: true,
      hideGroundShadow: true,
    });
    return tempAvatar;
  };

  const handleDownloadCompositePng = async () => {
    await ensureAvatarGlbLoaded();
    const overrideAvatarCanvas = buildFinalPhotoAvatarCanvas();
    const off = document.createElement('canvas');
    drawCompositeScene(off, 2, {
      includeGizmos: false,
      includeAngles: showAngleBadges,
      includePlumb: showPlumbGrid && Boolean(photoDataUrl),
      overrideAvatarCanvas,
    });
    const png = await exportCanvasToHighQualityPng(off);
    const url = URL.createObjectURL(png.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = photoFileName
      ? `calco_cebolla_${photoFileName.replace(/\.[^.]+$/, '')}.png`
      : 'avatar_cascara_cebolla_3d.png';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSendToStudy = async (targetMethod: MethodId.RULA | MethodId.REBA) => {
    await ensureAvatarGlbLoaded();
    const overrideAvatarCanvas = buildFinalPhotoAvatarCanvas();

    // Imagen 1: Calco superpuesto en Cáscara de Cebolla (Foto + Avatar translúcido + Ángulos)
    const compOff = document.createElement('canvas');
    drawCompositeScene(compOff, 2, {
      includeGizmos: false,
      includeAngles: true,
      includePlumb: Boolean(photoDataUrl) && showPlumbGrid,
      overrideAvatarCanvas,
    });
    const compositeDataUrl = compOff.toDataURL('image/png');

    // Imagen 2: Gemelo 3D limpio con los ángulos exactos calcados (incluye mobiliario si es Solo Foto Final)
    const clean3dOff = document.createElement('canvas');
    renderInteractivePose3DToCanvas(
      exportPanelSpec,
      clean3dOff,
      800,
      640,
      orbit,
      2,
      'anatomical_skin',
      false,
      false,
    );
    const clean3dDataUrl = clean3dOff.toDataURL('image/png');

    const newTab = createNewStudyTab(1, targetMethod, taskTitle);
    newTab.tabLabel = `Calco Cebolla · ${targetMethod === MethodId.RULA ? 'RULA' : 'REBA'}`;
    newTab.payloads = {
      ...newTab.payloads,
      [MethodId.RULA]: buildAsymmetricRulaFromPose(pose),
      [MethodId.REBA]: buildAsymmetricRebaFromPose(pose),
    };
    const evalRes = targetMethod === MethodId.RULA ? rulaEval : rebaEval;
    const elbIntL = clampNum(Math.round(180 - pose.elbowLFlexionDeg), 30, 170);
    const elbIntR = clampNum(Math.round(180 - pose.elbowRFlexionDeg), 30, 170);
    newTab.implementationDeadline = evalRes.recommendedDeadline;
    newTab.evaluatorObservations = `Calco fotográfico en cáscara de cebolla: Tronco ${pose.trunkFlexionDeg}° (giro ${pose.trunkTwistDeg}°), Cuello ${pose.neckFlexionDeg}°, Brazo Izq. (Flex ${pose.shoulderLFlexionDeg}° / Abd ${pose.shoulderLAbductionDeg}°, Codo int. ${elbIntL}°), Brazo Der. (Flex ${pose.shoulderRFlexionDeg}° / Abd ${pose.shoulderRAbductionDeg}°, Codo int. ${elbIntR}°), Rodillas I/D ${pose.kneeLFlexionDeg}°/${pose.kneeRFlexionDeg}°. Valoración: ${evalRes.primaryScoreText} (${evalRes.riskLabel}).`;
    newTab.correctiveMeasures = evalRes.suggestedMeasures.map((m, i) => `${i + 1}. ${m}`).join('\n');

    const photosToAttach: StudyPhoto[] = [
      {
        id: `ph-onion-comp-${Date.now()}`,
        name: `calco-cascara-cebolla-${Date.now()}.png`,
        dataUrl: compositeDataUrl,
        caption: `${taskTitle} — Superposición Cáscara de Cebolla (${Math.round(avatarOpacity * 100)}%) · ${evalRes.primaryScoreText}`,
        annotations: [],
      },
      {
        id: `ph-onion-3d-${Date.now() + 1}`,
        name: `gemelo-3d-calcado-${Date.now() + 1}.png`,
        dataUrl: clean3dDataUrl,
        caption: `Avatar 3D replicado con ángulos exactos — ${evalRes.primaryScoreText}`,
        annotations: [],
      },
    ];

    if (photoDataUrl) {
      photosToAttach.unshift({
        id: `ph-onion-orig-${Date.now() - 1}`,
        name: photoFileName || `foto-operario-${Date.now()}.png`,
        dataUrl: photoDataUrl,
        caption: `Fotografía original del operario (${photoFileName || 'captura de puesto'})`,
        annotations: [],
      });
    }

    newTab.photos = photosToAttach;
    onAddPoseTabToStudy(newTab);
    setStatusFeedback(
      `Calco enviado al Estudio Multipestaña (${targetMethod === MethodId.RULA ? 'RULA' : 'REBA'}) incluyendo foto real, calco en cáscara de cebolla y avatar 3D.`,
    );
    window.setTimeout(() => setStatusFeedback(''), 4500);
  };

  return (
    <div className="space-y-5">
      {/* CABECERA TÉCNICA */}
      <section className="bg-white border border-slate-300 rounded-lg p-4 sm:p-5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-sky-800 font-semibold">
              <span>Superposición Translúcida sobre Fotografía</span>
              <span aria-hidden="true">·</span>
              <span>Posición Cero: Brazo Izq. Extendido Mano Abierta + Brazo Der. Relajado</span>
              <span aria-hidden="true">·</span>
              <span>Calco Goniométrico RULA / REBA</span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Avatar 3D en Cáscara de Cebolla (Calco Directo sobre Fotografía)
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-4xl leading-relaxed">
              Suba o pegue (<span className="font-mono">Ctrl+V</span>) una fotografía del puesto de trabajo, regule la
              transparencia tipo cáscara de cebolla del Avatar 3D y arrastre cada articulación directamente encima del
              operario. El botón <strong className="text-slate-800">Posición Cero</strong> restablece en cualquier
              momento la referencia asimétrica con el brazo izquierdo extendido y mano abierta y el brazo derecho
              relajado.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadPhotoFromFile(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-md border border-emerald-700 bg-emerald-700 hover:bg-emerald-800 text-xs font-semibold text-white cursor-pointer"
            >
              <ImagePlus className="w-3.5 h-3.5" />
              {photoDataUrl ? 'Cambiar Foto' : 'Subir Foto'}
            </button>

            <button
              type="button"
              onClick={() => handleResetToZeroPose()}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-900 cursor-pointer"
              title="Restablecer Posición Cero: Brazo izquierdo extendido con mano abierta y brazo derecho relajado"
            >
              <RotateCcw className="w-3.5 h-3.5 text-sky-700" />
              Posición Cero
            </button>

            <button
              type="button"
              onClick={handleDownloadCompositePng}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-md border border-sky-700 bg-sky-700 hover:bg-sky-800 text-xs font-semibold text-white cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Descargar PNG Calco
            </button>

            <button
              type="button"
              onClick={onBackToEvaluator}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-md border border-slate-300 bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-800 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Volver al Estudio
            </button>
          </div>
        </div>

        {statusFeedback && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{statusFeedback}</span>
          </div>
        )}
      </section>

      {/* CUERPO PRINCIPAL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* VISOR DE SUPERPOSICIÓN CÁSCARA DE CEBOLLA */}
        <section className="order-1 lg:col-span-7 bg-white border border-slate-300 rounded-lg p-3.5 sm:p-4 space-y-3 shadow-2xs lg:sticky lg:top-24">
          {/* Barra superior de modos de puntero y vistas de cámara */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
            <div className="inline-flex flex-wrap rounded-md border border-slate-300 bg-slate-100 p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => setPointerMode('move_joints')}
                className={`inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1.5 rounded text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                  pointerMode === 'move_joints'
                    ? 'bg-sky-700 text-white shadow-2xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <MousePointerClick className="w-3.5 h-3.5" />
                Articular Nodos
              </button>

              <button
                type="button"
                onClick={() => setPointerMode('align_avatar')}
                className={`inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1.5 rounded text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                  pointerMode === 'align_avatar'
                    ? 'bg-violet-700 text-white shadow-2xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
                title="Arrastrar y escalar el Avatar 3D completo sobre el operario de la foto"
              >
                <Move className="w-3.5 h-3.5" />
                Encajar Avatar
              </button>

              <button
                type="button"
                onClick={() => setPointerMode('orbit_camera')}
                className={`inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1.5 rounded text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                  pointerMode === 'orbit_camera'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                Cámara 360°
              </button>

              {photoDataUrl && (
                <button
                  type="button"
                  onClick={() => setPointerMode('pan_photo')}
                  className={`inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1.5 rounded text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                    pointerMode === 'pan_photo'
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  Mover Foto
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  { id: 'frontal', label: 'Frontal' },
                  { id: 'sagittal_left', label: 'Perfil Izq.' },
                  { id: 'sagittal_right', label: 'Perfil Der.' },
                  { id: 'isometric', label: 'Oblicua' },
                  { id: 'dorsal', label: 'Espalda' },
                ] as { id: CameraPreset; label: string }[]
              ).map((cam) => (
                <button
                  key={cam.id}
                  type="button"
                  onClick={() => {
                    setCameraPreset(cam.id);
                    setOrbit({ azimuthDeg: 0, elevationDeg: 4, zoom: 1.02 });
                  }}
                  className={`min-h-[34px] px-2.5 py-1 rounded border text-xs font-medium whitespace-nowrap cursor-pointer ${
                    cameraPreset === cam.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {cam.label}
                </button>
              ))}
            </div>
          </div>

          {/* Barra dedicada de Opacidad Cáscara de Cebolla y Escala sobre Foto */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div className="sm:col-span-6 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800 inline-flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-sky-700" />
                  Opacidad Avatar (Cáscara)
                </span>
                <span className="font-mono font-bold text-sky-800 tabular-nums">
                  {Math.round(avatarOpacity * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.02}
                  value={avatarOpacity}
                  onChange={(e) => setAvatarOpacity(parseFloat(e.target.value))}
                  className="flex-1 h-2 accent-sky-700 cursor-pointer"
                />
                <div className="inline-flex gap-1 shrink-0">
                  {[0.3, 0.58, 0.85, 1].map((presetOp) => (
                    <button
                      key={presetOp}
                      type="button"
                      onClick={() => setAvatarOpacity(presetOp)}
                      className={`px-1.5 py-0.5 rounded border text-[11px] font-mono tabular-nums cursor-pointer ${
                        Math.abs(avatarOpacity - presetOp) < 0.03
                          ? 'bg-sky-700 text-white border-sky-700'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {Math.round(presetOp * 100)}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="sm:col-span-6 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800">Escala Avatar sobre Foto</span>
                <div className="inline-flex items-center gap-2">
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {Math.round(avatarScale2D * 100)}%
                  </span>
                  {(avatarPanX !== 0 || avatarPanY !== 0 || Math.abs(avatarScale2D - 1) > 0.01) && (
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarPanX(0);
                        setAvatarPanY(0);
                        setAvatarScale2D(1);
                      }}
                      className="text-[11px] font-semibold text-sky-700 hover:underline cursor-pointer"
                    >
                      Centrar
                    </button>
                  )}
                </div>
              </div>
              <input
                type="range"
                min={0.45}
                max={2.25}
                step={0.02}
                value={avatarScale2D}
                onChange={(e) => setAvatarScale2D(parseFloat(e.target.value))}
                className="w-full h-2 accent-violet-700 cursor-pointer"
              />
            </div>
          </div>

          {/* LIENZO INTERACTIVO CON ARRASTRAR Y SOLTAR FOTO */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOverPhoto(true);
            }}
            onDragLeave={() => setIsDragOverPhoto(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOverPhoto(false);
              const f = e.dataTransfer.files?.[0];
              if (f) loadPhotoFromFile(f);
            }}
            className={`relative rounded-lg border overflow-hidden transition-colors ${
              isDragOverPhoto
                ? 'border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-50'
                : 'border-slate-300 bg-slate-50'
            }`}
          >
            {!photoDataUrl && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-emerald-50/90 border-b border-emerald-200 text-xs text-emerald-950">
                <span>
                  Arrastre una fotografía aquí, presione <strong className="font-mono">Ctrl+V</strong> o pulse{' '}
                  <strong>Subir Foto</strong> para calcar al operario debajo del avatar translúcido.
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 rounded border border-emerald-700 bg-white hover:bg-emerald-100 text-emerald-900 font-semibold whitespace-nowrap cursor-pointer"
                >
                  Elegir archivo...
                </button>
              </div>
            )}

            <canvas
              ref={compositeCanvasRef}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerUp}
              onWheel={handleWheelZoom}
              className={`w-full h-auto max-h-[560px] block mx-auto touch-none select-none ${
                pointerMode === 'move_joints' && hoveredJoint
                  ? 'cursor-grab active:cursor-grabbing'
                  : 'cursor-move'
              }`}
            />

            {/* Pie técnico del lienzo */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-900 text-white text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="truncate">
                  {hoveredJoint
                    ? `Apuntando: ${JOINT_LABELS_ES[hoveredJoint]}`
                    : selectedJoint
                      ? `Articulación activa: ${JOINT_LABELS_ES[selectedJoint]}`
                      : 'Arrastre nodos celestes para articular o el cuerpo para encajar sobre la foto'}
                </span>
              </div>
              <span className="font-mono text-[11px] text-slate-300 tabular-nums shrink-0">
                Cáscara {Math.round(avatarOpacity * 100)}% · Az {orbit.azimuthDeg}° · El {orbit.elevationDeg}°
              </span>
            </div>
          </div>

          {/* Conmutadores rápidos de capas y cáscara fantasma */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-0.5">
            <div className="flex flex-wrap items-center gap-3.5">
              <label className="inline-flex items-center gap-1.5 text-slate-800 font-medium cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showGizmos}
                  onChange={(e) => setShowGizmos(e.target.checked)}
                  className="rounded border-slate-400 text-sky-700"
                />
                <span>Nodos articulares</span>
              </label>

              <label className="inline-flex items-center gap-1.5 text-slate-800 font-medium cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showAngleBadges}
                  onChange={(e) => setShowAngleBadges(e.target.checked)}
                  className="rounded border-slate-400 text-sky-700"
                />
                <span>Etiquetas de ángulos (°)</span>
              </label>

              <label className="inline-flex items-center gap-1.5 text-slate-800 font-medium cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showPlumbGrid}
                  onChange={(e) => setShowPlumbGrid(e.target.checked)}
                  className="rounded border-slate-400 text-sky-700"
                />
                <Crosshair className="w-3.5 h-3.5 text-sky-700" />
                <span>Plomada 0°</span>
              </label>

              <label className="inline-flex items-center gap-1.5 text-slate-800 font-medium cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={xrayTint}
                  onChange={(e) => setXrayTint(e.target.checked)}
                  className="rounded border-slate-400 text-sky-700"
                />
                <Eye className="w-3.5 h-3.5 text-sky-700" />
                <span>Realce de contorno</span>
              </label>

              <label className="inline-flex items-center gap-1.5 text-slate-800 font-medium cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={symmetryLocked}
                  onChange={(e) => setSymmetryLocked(e.target.checked)}
                  className="rounded border-slate-400 text-sky-700"
                />
                <Link2 className="w-3.5 h-3.5 text-sky-700" />
                <span>Simetría (Der ↔ Izq)</span>
              </label>
            </div>
          </div>

          {/* Sombra Fantasma ("Segunda Cáscara de Cebolla") */}
          <div className="rounded-md border border-slate-200 bg-slate-50/80 p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showGhostLayer}
                onChange={(e) => setShowGhostLayer(e.target.checked)}
                className="rounded border-slate-400 text-sky-700"
              />
              <span>Sombra Fantasma Comparativa ({ghostLabel})</span>
            </label>

            <div className="flex flex-wrap items-center gap-2">
              {showGhostLayer && (
                <div className="inline-flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-600 font-mono tabular-nums">
                    {Math.round(ghostOpacity * 100)}%
                  </span>
                  <input
                    type="range"
                    min={0.1}
                    max={0.65}
                    step={0.02}
                    value={ghostOpacity}
                    onChange={(e) => setGhostOpacity(parseFloat(e.target.value))}
                    className="w-20 h-1.5 accent-cyan-600 cursor-pointer"
                  />
                </div>
              )}
              <button
                type="button"
                onClick={handlePinCurrentAsGhost}
                className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 font-medium text-slate-800 cursor-pointer"
              >
                Fijar Actual como Sombra
              </button>
              <button
                type="button"
                onClick={handlePinZeroAsGhost}
                className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 font-medium text-slate-800 cursor-pointer"
              >
                Sombra = Posición Cero
              </button>
            </div>
          </div>

          {/* Valoración ergonómica asimétrica en vivo + Envío al Estudio */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
            <div className={`rounded-md border p-3 ${rulaSev.box} flex items-center justify-between gap-2`}>
              <div>
                <div className="text-[11px] font-semibold text-slate-600">RULA Bilateral en Vivo</div>
                <div className={`text-sm font-bold font-mono tabular-nums ${rulaSev.scoreText}`}>
                  {rulaEval.primaryScoreText} · {rulaEval.riskLabel}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleSendToStudy(MethodId.RULA)}
                className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Enviar RULA
              </button>
            </div>

            <div className={`rounded-md border p-3 ${rebaSev.box} flex items-center justify-between gap-2`}>
              <div>
                <div className="text-[11px] font-semibold text-slate-600">REBA Bilateral en Vivo</div>
                <div className={`text-sm font-bold font-mono tabular-nums ${rebaSev.scoreText}`}>
                  {rebaEval.primaryScoreText} · {rebaEval.riskLabel}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleSendToStudy(MethodId.REBA)}
                className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1.5 rounded bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Enviar REBA
              </button>
            </div>
          </div>
        </section>

        {/* PANEL LATERAL: CALIBRACIÓN DE FOTO, POSICIÓN CERO, MANOS INDEPENDIENTES Y ÁNGULOS */}
        <section className="order-2 lg:col-span-5 bg-white border border-slate-300 rounded-lg p-4 space-y-4 shadow-2xs">
          {/* Bloque 1: Fotografía Subida y Nivelación de Plomada */}
          <div className="space-y-2.5 border-b border-slate-200 pb-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <ImagePlus className="w-4 h-4 text-emerald-700" />
                <span>Fotografía de Referencia bajo el Avatar</span>
              </div>
              {photoDataUrl && (
                <button
                  type="button"
                  onClick={handleClearPhoto}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:text-rose-900 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Quitar foto
                </button>
              )}
            </div>

            {photoDataUrl ? (
              <div className="space-y-2.5 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-800 truncate">{photoFileName}</span>
                  <button
                    type="button"
                    onClick={() => setPhotoFlipH((f) => !f)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-semibold cursor-pointer ${
                      photoFlipH
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <FlipHorizontal2 className="w-3.5 h-3.5" />
                    Espejar Foto
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                      <span>Opacidad Foto</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {Math.round(photoOpacity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.15}
                      max={1}
                      step={0.05}
                      value={photoOpacity}
                      onChange={(e) => setPhotoOpacity(parseFloat(e.target.value))}
                      className="w-full h-1.5 accent-emerald-700 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                      <span>Zoom Foto</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {Math.round(photoZoom * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={2.5}
                      step={0.05}
                      value={photoZoom}
                      onChange={(e) => setPhotoZoom(parseFloat(e.target.value))}
                      className="w-full h-1.5 accent-emerald-700 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                      <span>Nivel / Giro</span>
                      <span className="font-mono font-semibold tabular-nums">{photoTiltDeg}°</span>
                    </div>
                    <input
                      type="range"
                      min={-15}
                      max={15}
                      step={0.5}
                      value={photoTiltDeg}
                      onChange={(e) => setPhotoTiltDeg(parseFloat(e.target.value))}
                      className="w-full h-1.5 accent-emerald-700 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 px-4 rounded-md border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs text-slate-700 font-medium flex items-center justify-center gap-2 cursor-pointer"
              >
                <ImagePlus className="w-4 h-4 text-emerald-700" />
                <span>Seleccionar foto del puesto desde su PC o dispositivo móvil</span>
              </button>
            )}
          </div>

          {/* Bloque 2: Configuración de Posición Cero y Manos Independientes */}
          <div className="space-y-3 border-b border-slate-200 pb-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <Sliders className="w-4 h-4 text-sky-700" />
                <span>Posición Cero y Estado Independiente de Manos</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleResetToZeroPose('lateral_90')}
                className={`min-h-[38px] px-2.5 py-1.5 rounded border text-left text-xs font-semibold cursor-pointer transition-colors ${
                  zeroAxis === 'lateral_90'
                    ? 'bg-sky-50 border-sky-600 text-sky-950'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div>Cero · Izq. Lateral 90°</div>
                <div className="text-[10px] font-normal text-slate-600">
                  Mano izq. abierta · Der. relajado
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleResetToZeroPose('frontal_90')}
                className={`min-h-[38px] px-2.5 py-1.5 rounded border text-left text-xs font-semibold cursor-pointer transition-colors ${
                  zeroAxis === 'frontal_90'
                    ? 'bg-sky-50 border-sky-600 text-sky-950'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div>Cero · Izq. al Frente 90°</div>
                <div className="text-[10px] font-normal text-slate-600">
                  Mano izq. abierta · Der. relajado
                </div>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  <Hand className="w-3 h-3 inline mr-1 text-sky-700" />
                  Mano Izquierda
                </label>
                <select
                  value={pose.handLGripMode || 'open'}
                  onChange={(e) =>
                    setPose((p) => ({
                      ...p,
                      handLGripMode: e.target.value as NonNullable<PosturePose3D['handLGripMode']>,
                    }))
                  }
                  className="w-full min-h-[38px] rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                >
                  <option value="open">Mano abierta extendida (Posición Cero)</option>
                  <option value="relaxed">Mano relajada natural</option>
                  <option value="box_cradle">Acople lateral para cajas</option>
                  <option value="power_grip">Agarre cilíndrico de fuerza</option>
                  <option value="pinch">Pinza digital fina</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  <Hand className="w-3 h-3 inline mr-1 text-slate-600" />
                  Mano Derecha
                </label>
                <select
                  value={pose.handRGripMode || 'relaxed'}
                  onChange={(e) =>
                    setPose((p) => ({
                      ...p,
                      handRGripMode: e.target.value as NonNullable<PosturePose3D['handRGripMode']>,
                    }))
                  }
                  className="w-full min-h-[38px] rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                >
                  <option value="relaxed">Mano relajada natural (Posición Cero)</option>
                  <option value="open">Mano abierta extendida</option>
                  <option value="box_cradle">Acople lateral para cajas</option>
                  <option value="power_grip">Agarre cilíndrico de fuerza</option>
                  <option value="pinch">Pinza digital fina</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Apoyo Corporal (Stance)</label>
                <select
                  value={pose.stanceMode || 'standing'}
                  onChange={(e) =>
                    setPose((p) => ({
                      ...p,
                      stanceMode: e.target.value as NonNullable<PosturePose3D['stanceMode']>,
                    }))
                  }
                  className="w-full min-h-[38px] rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                >
                  <option value="standing">De pie equilibrado (Bipedestación)</option>
                  <option value="squatting">En cuclillas / Flexión profunda</option>
                  <option value="seated">Sentado (Sedestación)</option>
                  <option value="kneeling">Arrodillado en suelo</option>
                  <option value="walking">En marcha / Paso asimétrico</option>
                  <option value="one_leg">Apoyo unilateral (1 pierna)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Carga / Fuerza (kg)</label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  step={0.5}
                  value={pose.loadKg ?? 0}
                  onChange={(e) => setPose((p) => ({ ...p, loadKg: Math.max(0, Number(e.target.value) || 0) }))}
                  className="w-full min-h-[38px] rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono font-semibold tabular-nums text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Mobiliario / Estanterías 3D (Opcional)</label>
              <select
                value={pose.prop || 'none'}
                onChange={(e) => {
                  const nextProp = e.target.value as ScenePropType;
                  setPose((p) => ({ ...p, prop: nextProp }));
                  if (nextProp !== 'none' && propVisibilityMode === 'hidden') {
                    setPropVisibilityMode('final_photo_only');
                  }
                }}
                className="w-full min-h-[38px] rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
              >
                {ONION_PROP_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {pose.prop && pose.prop !== 'none' && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-800">Visibilidad del mueble / estantería</span>
                  <button
                    type="button"
                    onClick={() => setActiveGroup('space_props')}
                    className="text-[11px] font-semibold text-sky-700 hover:text-sky-900 underline cursor-pointer"
                  >
                    Mover X/Y/Z →
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1 bg-slate-200/70 p-0.5 rounded">
                  {(
                    [
                      { id: 'always', label: 'Siempre' },
                      { id: 'hidden', label: 'Quitar' },
                      { id: 'final_photo_only', label: 'Solo foto final' },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setPropVisibilityMode(mode.id)}
                      className={`min-h-[28px] px-2 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
                        propVisibilityMode === mode.id
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
                {propVisibilityMode === 'final_photo_only' && (
                  <label className="flex items-center justify-between gap-2 text-[11px] text-slate-700 cursor-pointer select-none">
                    <span>Oculto al calcar la foto; aparece en la foto final exportada.</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-sky-800 shrink-0">
                      <input
                        type="checkbox"
                        checked={previewFinalPhotoProp}
                        onChange={(e) => setPreviewFinalPhotoProp(e.target.checked)}
                        className="rounded border-slate-400 text-sky-700"
                      />
                      Mostrar para acomodar
                    </span>
                  </label>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Título de la Captura / Tarea</label>
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Ej: Calco fotográfico de alcance lateral en línea..."
                className="w-full min-h-[38px] rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
              />
            </div>

            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 font-medium cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoFlatFoot}
                onChange={(e) => setAutoFlatFoot(e.target.checked)}
                className="rounded border-slate-400 text-sky-700"
              />
              <span>Equilibrio plantígrado automático al flexionar rodillas</span>
            </label>
          </div>

          {/* Bloque 3: Sliders Numéricos por Segmento Corporal */}
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1">
              {(
                [
                  { id: 'left_arm', label: 'Brazo Izq.' },
                  { id: 'right_arm', label: 'Brazo Der.' },
                  { id: 'spine_head', label: 'Tronco y Cuello' },
                  { id: 'legs_feet', label: 'Piernas y Pies' },
                  { id: 'space_props', label: 'Giro y Muebles' },
                  { id: 'all', label: 'Todos (29)' },
                ] as { id: JointControlGroup; label: string }[]
              ).map((grp) => (
                <button
                  key={grp.id}
                  type="button"
                  onClick={() => setActiveGroup(grp.id)}
                  className={`min-h-[34px] px-2.5 py-1 rounded border text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                    activeGroup === grp.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {grp.label}
                </button>
              ))}
            </div>

            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {visibleFields.map((spec) => {
                const rawVal = Number(pose[spec.key] ?? spec.defaultValue ?? 0);
                return (
                  <AngleNumericRow
                    key={String(spec.key)}
                    spec={spec}
                    value={rawVal}
                    onChange={(nextVal) => setPose((prev) => applyAnglePatch(prev, { [spec.key]: nextVal }))}
                  />
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

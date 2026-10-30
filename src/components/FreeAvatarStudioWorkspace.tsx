import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Download,
  Hand,
  Link2,
  MousePointerClick,
  Move3d,
  Plus,
  RotateCcw,
  Sliders,
} from 'lucide-react';
import {
  MethodId,
  RebaData,
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
import { IDEAL_POSTURE_CATALOG, IdealPostureId } from '../utils/idealPosturesCatalog';
import {
  CameraOrbitOverride,
  DEFAULT_ORBIT_OVERRIDE,
  ensureAvatarGlbLoaded,
  renderInteractiveFreeAvatarToCanvas,
  renderInteractivePose3DToCanvas,
  subscribeAvatarGlbLoaded,
} from '../utils/biomech3dRenderer';
import { exportCanvasToHighQualityPng } from '../utils/pngOptimizer';
import {
  clampPoseToNormativeWorkAgeLimits,
  NORMATIVE_JOINT_LIMITS,
} from '../utils/normativeJointLimits';
import { getSeverityStyles } from './StudyTabWorkspace';

interface FreeAvatarStudioWorkspaceProps {
  onBackToEvaluator: () => void;
  onAddPoseTabToStudy: (newTab: StudyTab) => void;
}

type JointControlGroup = 'all' | 'spine_head' | 'right_arm' | 'left_arm' | 'legs_feet' | 'space_props';

const INTERACTIVE_JOINTS: JointKey[] = [
  'head',
  'c7',
  't12',
  'l5s1',
  'pelvis',
  'shoulderR',
  'elbowR',
  'wristR',
  'shoulderL',
  'elbowL',
  'wristL',
  'hipR',
  'kneeR',
  'ankleR',
  'hipL',
  'kneeL',
  'ankleL',
];

const JOINT_LABELS_ES: Record<JointKey, string> = {
  head: 'Cabeza / Mirada (Flexión y Giro Cervical)',
  c7: 'Cuello C7 (Flexión e Inclinación Lateral)',
  t12: 'Tronco Torácico T12 (Flexión y Giro Axial)',
  l5s1: 'Columna Lumbar L5/S1 (Flexión e Inclinación)',
  pelvis: 'Pelvis / Raíz Espacial (Desplazar X/Z y Girar)',
  shoulderR: 'Hombro Derecho (Flexión y Abducción)',
  elbowR: 'Codo Derecho (Flexión y Pronosupinación)',
  wristR: 'Muñeca Derecha (Flexión y Desviación)',
  handR: 'Mano Derecha',
  shoulderL: 'Hombro Izquierdo (Flexión y Abducción)',
  elbowL: 'Codo Izquierdo (Flexión y Pronosupinación)',
  wristL: 'Muñeca Izquierda (Flexión y Desviación)',
  handL: 'Mano Izquierda',
  hipR: 'Cadera Derecha (Flexión Sagital)',
  kneeR: 'Rodilla Derecha (Flexión Sagital)',
  ankleR: 'Tobillo Derecho (Dorsiflexión / Plantar)',
  footR: 'Pie Derecho',
  hipL: 'Cadera Izquierda (Flexión Sagital)',
  kneeL: 'Rodilla Izquierda (Flexión Sagital)',
  ankleL: 'Tobillo Izquierdo (Dorsiflexión / Plantar)',
  footL: 'Pie Izquierdo',
};

const PROP_OPTIONS: { value: ScenePropType; label: string }[] = [
  { value: 'none', label: 'Sin mobiliario (Espacio libre)' },
  { value: 'cold_room_high_shelf', label: 'Estantería regulable de 4 niveles (Almacén)' },
  { value: 'pallet_jack_rack', label: 'Transpaleta con pallet + Estantería industrial' },
  { value: 'work_desk_support', label: 'Mesa / Apoyo bajo Codo y Antebrazo (Fig. 4.6b)' },
  { value: 'box_load', label: 'Caja industrial en manos (Bimanual)' },
  { value: 'chair', label: 'Silla de trabajo regulable' },
  { value: 'iron_tamper_low', label: 'Pisón de tierra bajo (Compactación manual)' },
  { value: 'iron_tamper_high', label: 'Pisón de tierra elevado (Impacto vertical)' },
  { value: 'bus_driver_seat', label: 'Puesto Chofer de Ómnibus / Colectivo (Ø 430 mm)' },
  { value: 'trench_shovel', label: 'Pala de zanjeo (Agarre bimanual)' },
  { value: 'crane_levers', label: 'Banco de palancas de hidrogrúa' },
  { value: 'floor_pouches', label: 'Bolsines sobre el suelo' },
  { value: 'bin_to_cart', label: 'Contenedor Bin profundo + Carro lateral' },
  { value: 'conveyor_veg_line', label: 'Cinta transportadora industrial' },
  { value: 'hopper_sack_pour', label: 'Tolva inoxidable + Saco' },
  { value: 'cart_push_dynamo', label: 'Carro plataforma (Empuje)' },
  { value: 'cart_pull_dynamo', label: 'Carro plataforma (Arrastre)' },
  { value: 'office_desk_lateral', label: 'Escritorio de oficina con PVD + Silla' },
  { value: 'high_scanner_desk', label: 'Mueble alto de escaneo (99 cm)' },
  { value: 'electrical_panel', label: 'Tablero eléctrico industrial' },
  { value: 'pallet_cooler', label: 'Pallet con conservadora térmica' },
];

interface AngleFieldSpec {
  key: keyof PosturePose3D;
  mirrorKey?: keyof PosturePose3D;
  mirrorInvertSign?: boolean;
  invertAsInternal180?: boolean;
  defaultValue?: number;
  label: string;
  min: number;
  max: number;
  step?: number;
  unit: string;
  group: Exclude<JointControlGroup, 'all'>;
}

const ANGLE_FIELDS: AngleFieldSpec[] = [
  // Tronco y Cuello (McKay et al., Neurology 2017, 20–59 años · (P50+P95)/2)
  { key: 'trunkFlexionDeg', label: 'Flexión / Extensión de Tronco', min: -30, max: 95, unit: '°', group: 'spine_head' },
  { key: 'trunkLateralDeg', label: 'Inclinación Lateral de Tronco', min: -35, max: 35, unit: '°', group: 'spine_head' },
  { key: 'trunkTwistDeg', label: 'Giro / Torsión Axial de Tronco', min: -55, max: 55, unit: '°', group: 'spine_head' },
  {
    key: 'neckFlexionDeg',
    label: 'Flexión(+) / Extensión(-) de Cuello',
    min: NORMATIVE_JOINT_LIMITS.cervicalAndShoulder.neckExtensionMinDeg,
    max: NORMATIVE_JOINT_LIMITS.cervicalAndShoulder.neckFlexionMaxDeg,
    unit: '°',
    group: 'spine_head',
  },
  { key: 'neckLateralDeg', label: 'Inclinación Lateral de Cuello', min: -30, max: 30, unit: '°', group: 'spine_head' },
  { key: 'neckTwistDeg', label: 'Rotación Cervical (Cabeza)', min: -60, max: 60, unit: '°', group: 'spine_head' },

  // Brazo Derecho
  {
    key: 'shoulderRFlexionDeg',
    mirrorKey: 'shoulderLFlexionDeg',
    label: 'Hombro Der. · Flexión / Extensión',
    min: -45,
    max: 165,
    unit: '°',
    group: 'right_arm',
  },
  {
    key: 'shoulderRAbductionDeg',
    mirrorKey: 'shoulderLAbductionDeg',
    label: 'Hombro Der. · Abducción / Aducción',
    min: -25,
    max: 135,
    unit: '°',
    group: 'right_arm',
  },
  {
    key: 'elbowRFlexionDeg',
    mirrorKey: 'elbowLFlexionDeg',
    invertAsInternal180: true,
    label: 'Codo Der. · Ángulo Interno (30.5°–171.5°)',
    min: NORMATIVE_JOINT_LIMITS.elbow.kinoveaFlexMinDeg,
    max: NORMATIVE_JOINT_LIMITS.elbow.kinoveaExtMaxDeg,
    step: 0.5,
    unit: '°',
    group: 'right_arm',
  },
  {
    key: 'forearmRPronationDeg',
    mirrorKey: 'forearmLPronationDeg',
    mirrorInvertSign: true,
    label: 'Antebrazo Der. · Pronación(+) / Supin.(-)',
    min: -85,
    max: 85,
    unit: '°',
    group: 'right_arm',
  },
  {
    key: 'wristRFlexionDeg',
    mirrorKey: 'wristLFlexionDeg',
    label: 'Muñeca Der. · Flexión(+) / Extensión(-)',
    min: NORMATIVE_JOINT_LIMITS.wrist.dorsalExtensionMinDeg,
    max: NORMATIVE_JOINT_LIMITS.wrist.palmarFlexionMaxDeg,
    unit: '°',
    group: 'right_arm',
  },
  {
    key: 'wristRDeviationDeg',
    mirrorKey: 'wristLDeviationDeg',
    label: 'Muñeca Der. · Desviación Cubital/Radial',
    min: NORMATIVE_JOINT_LIMITS.wrist.radialDeviationMinDeg,
    max: NORMATIVE_JOINT_LIMITS.wrist.ulnarDeviationMaxDeg,
    unit: '°',
    group: 'right_arm',
  },

  // Brazo Izquierdo
  {
    key: 'shoulderLFlexionDeg',
    mirrorKey: 'shoulderRFlexionDeg',
    label: 'Hombro Izq. · Flexión / Extensión',
    min: -45,
    max: 165,
    unit: '°',
    group: 'left_arm',
  },
  {
    key: 'shoulderLAbductionDeg',
    mirrorKey: 'shoulderRAbductionDeg',
    label: 'Hombro Izq. · Abducción / Aducción',
    min: -25,
    max: 135,
    unit: '°',
    group: 'left_arm',
  },
  {
    key: 'elbowLFlexionDeg',
    mirrorKey: 'elbowRFlexionDeg',
    invertAsInternal180: true,
    label: 'Codo Izq. · Ángulo Interno (30.5°–171.5°)',
    min: NORMATIVE_JOINT_LIMITS.elbow.kinoveaFlexMinDeg,
    max: NORMATIVE_JOINT_LIMITS.elbow.kinoveaExtMaxDeg,
    step: 0.5,
    unit: '°',
    group: 'left_arm',
  },
  {
    key: 'forearmLPronationDeg',
    mirrorKey: 'forearmRPronationDeg',
    mirrorInvertSign: true,
    label: 'Antebrazo Izq. · Pronación(-) / Supin.(+)',
    min: -85,
    max: 85,
    unit: '°',
    group: 'left_arm',
  },
  {
    key: 'wristLFlexionDeg',
    mirrorKey: 'wristRFlexionDeg',
    label: 'Muñeca Izq. · Flexión(+) / Extensión(-)',
    min: NORMATIVE_JOINT_LIMITS.wrist.dorsalExtensionMinDeg,
    max: NORMATIVE_JOINT_LIMITS.wrist.palmarFlexionMaxDeg,
    unit: '°',
    group: 'left_arm',
  },
  {
    key: 'wristLDeviationDeg',
    mirrorKey: 'wristRDeviationDeg',
    label: 'Muñeca Izq. · Desviación Cubital/Radial',
    min: NORMATIVE_JOINT_LIMITS.wrist.radialDeviationMinDeg,
    max: NORMATIVE_JOINT_LIMITS.wrist.ulnarDeviationMaxDeg,
    unit: '°',
    group: 'left_arm',
  },

  // Piernas y Pies (20–59 años · (P50+P95)/2)
  {
    key: 'hipRFlexionDeg',
    mirrorKey: 'hipLFlexionDeg',
    label: 'Cadera Der. · Flexión(+) / Extensión(-)',
    min: NORMATIVE_JOINT_LIMITS.hip.extensionMaxDeg,
    max: NORMATIVE_JOINT_LIMITS.hip.flexionMaxDeg,
    unit: '°',
    group: 'legs_feet',
  },
  {
    key: 'kneeRFlexionDeg',
    mirrorKey: 'kneeLFlexionDeg',
    label: 'Rodilla Der. · Flexión (1.5°–141.5°)',
    min: NORMATIVE_JOINT_LIMITS.knee.flexionMinDeg,
    max: NORMATIVE_JOINT_LIMITS.knee.flexionMaxDeg,
    step: 0.5,
    unit: '°',
    group: 'legs_feet',
  },
  {
    key: 'ankleRDorsiflexionDeg',
    mirrorKey: 'ankleLDorsiflexionDeg',
    label: 'Tobillo Der. · Dorsiflex.(+) / Plantar(-)',
    min: NORMATIVE_JOINT_LIMITS.ankle.plantarflexionMinDeg,
    max: NORMATIVE_JOINT_LIMITS.ankle.dorsiflexionMaxDeg,
    step: 0.5,
    unit: '°',
    group: 'legs_feet',
  },
  {
    key: 'hipLFlexionDeg',
    mirrorKey: 'hipRFlexionDeg',
    label: 'Cadera Izq. · Flexión(+) / Extensión(-)',
    min: NORMATIVE_JOINT_LIMITS.hip.extensionMaxDeg,
    max: NORMATIVE_JOINT_LIMITS.hip.flexionMaxDeg,
    unit: '°',
    group: 'legs_feet',
  },
  {
    key: 'kneeLFlexionDeg',
    mirrorKey: 'kneeRFlexionDeg',
    label: 'Rodilla Izq. · Flexión (1.5°–141.5°)',
    min: NORMATIVE_JOINT_LIMITS.knee.flexionMinDeg,
    max: NORMATIVE_JOINT_LIMITS.knee.flexionMaxDeg,
    step: 0.5,
    unit: '°',
    group: 'legs_feet',
  },
  {
    key: 'ankleLDorsiflexionDeg',
    mirrorKey: 'ankleRDorsiflexionDeg',
    label: 'Tobillo Izq. · Dorsiflex.(+) / Plantar(-)',
    min: NORMATIVE_JOINT_LIMITS.ankle.plantarflexionMinDeg,
    max: NORMATIVE_JOINT_LIMITS.ankle.dorsiflexionMaxDeg,
    step: 0.5,
    unit: '°',
    group: 'legs_feet',
  },

  // Desplazamiento Espacial
  {
    key: 'rootYawDeg',
    label: 'Orientación / Giro Corporal Global',
    min: -180,
    max: 180,
    step: 1,
    unit: '°',
    group: 'space_props',
  },
  {
    key: 'rootOffsetZ',
    label: 'Avance / Retroceso en Planta (Eje Z)',
    min: -0.8,
    max: 0.8,
    step: 0.02,
    unit: ' m',
    group: 'space_props',
  },
  {
    key: 'rootOffsetX',
    label: 'Desplazamiento Lateral Avatar (Eje X)',
    min: -0.8,
    max: 0.8,
    step: 0.02,
    unit: ' m',
    group: 'space_props',
  },
  {
    key: 'propOffsetX',
    label: 'Mueble / Estantería · Posición Lateral X',
    min: -1.4,
    max: 1.4,
    step: 0.02,
    unit: ' m',
    group: 'space_props',
  },
  {
    key: 'propOffsetY',
    label: 'Mueble / Estantería · Regulación Altura Y',
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
    label: 'Mueble / Estantería · Escala Global',
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

function buildRulaFromPose(pose: PosturePose3D): RulaData {
  const maxSh = Math.max(Math.abs(pose.shoulderRFlexionDeg), Math.abs(pose.shoulderLFlexionDeg));
  const upperArmPos: 1 | 2 | 3 | 4 = maxSh <= 20 ? 1 : maxSh <= 45 ? 2 : maxSh <= 90 ? 3 : 4;
  const elb = pose.elbowRFlexionDeg;
  const lowerArmPos: 1 | 2 = elb >= 60 && elb <= 100 ? 1 : 2;
  const wr = Math.abs(pose.wristRFlexionDeg);
  const wristPos: 1 | 2 | 3 = wr <= 2 ? 1 : wr <= 15 ? 2 : 3;
  const wristTwist: 1 | 2 = Math.abs(pose.forearmRPronationDeg) > 45 ? 2 : 1;

  const nk = pose.neckFlexionDeg;
  const neckPos: 1 | 2 | 3 | 4 = nk < -4 ? 4 : nk <= 10 ? 1 : nk <= 20 ? 2 : 3;
  const tr = pose.trunkFlexionDeg;
  const trunkPos: 1 | 2 | 3 | 4 = Math.abs(tr) <= 4 ? 1 : tr <= 20 ? 2 : tr <= 60 ? 3 : 4;
  const legsBalanced =
    pose.stanceMode !== 'one_leg' &&
    pose.stanceMode !== 'kneeling' &&
    Math.abs(pose.kneeRFlexionDeg - pose.kneeLFlexionDeg) <= 18;

  const forceLoadVal: 0 | 1 | 2 | 3 =
    (pose.loadKg ?? 0) > 10 ? 2 : (pose.loadKg ?? 0) >= 2 ? 1 : 0;

  const side: RulaSideInput = {
    upperArmPos,
    shoulderRaised: Boolean(pose.shoulderRElevated),
    armAbducted: Math.max(pose.shoulderRAbductionDeg, pose.shoulderLAbductionDeg) > 20,
    armSupported: pose.stanceMode === 'seated' && tr <= 4,
    lowerArmPos,
    lowerArmCrossMidline: Boolean(pose.forearmRCrossMidline) || pose.shoulderRAbductionDeg < -8,
    wristPos,
    wristDeviated: Math.abs(pose.wristRDeviationDeg) > 10,
    wristTwist,
    muscleUseA: 0,
    forceLoadA: forceLoadVal,
  };

  return {
    evaluatedSide: 'ambos',
    right: side,
    left: { ...side },
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

function buildRebaFromPose(pose: PosturePose3D): RebaData {
  const tr = pose.trunkFlexionDeg;
  const trunkPos: 1 | 2 | 3 | 4 = Math.abs(tr) <= 4 ? 1 : tr < 0 || tr <= 20 ? 2 : tr <= 60 ? 3 : 4;
  const nk = pose.neckFlexionDeg;
  const neckPos: 1 | 2 = nk >= 0 && nk <= 20 ? 1 : 2;
  const maxKnee = Math.max(pose.kneeRFlexionDeg, pose.kneeLFlexionDeg);
  const legsBase: 1 | 2 =
    pose.stanceMode === 'one_leg' || pose.stanceMode === 'kneeling' || Math.abs(pose.kneeRFlexionDeg - pose.kneeLFlexionDeg) > 20
      ? 2
      : 1;
  const legsKneeFlexion: 0 | 1 | 2 = pose.stanceMode === 'seated' ? 0 : maxKnee > 60 ? 2 : maxKnee >= 30 ? 1 : 0;

  const maxSh = Math.max(Math.abs(pose.shoulderRFlexionDeg), Math.abs(pose.shoulderLFlexionDeg));
  const upperArmPos: 1 | 2 | 3 | 4 = maxSh <= 20 ? 1 : maxSh <= 45 ? 2 : maxSh <= 90 ? 3 : 4;
  const lowerArmPos: 1 | 2 = pose.elbowRFlexionDeg >= 60 && pose.elbowRFlexionDeg <= 100 ? 1 : 2;
  const wristPos: 1 | 2 = Math.abs(pose.wristRFlexionDeg) <= 15 ? 1 : 2;

  const side = {
    upperArmPos,
    shoulderRaised: Boolean(pose.shoulderRElevated),
    armAbducted: Math.max(pose.shoulderRAbductionDeg, pose.shoulderLAbductionDeg) > 20,
    armSupported: false,
    lowerArmPos,
    wristPos,
    wristTwistedOrDeviated: Math.abs(pose.wristRDeviationDeg) > 10 || Math.abs(pose.forearmRPronationDeg) > 55,
    coupling: (pose.handGripMode === 'pinch' ? 2 : 0) as 0 | 1 | 2 | 3,
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
    right: side,
    left: { ...side },
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
    <div className="bg-slate-50/80 border border-slate-200 rounded-md px-3 py-2 space-y-1.5">
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

export const FreeAvatarStudioWorkspace: React.FC<FreeAvatarStudioWorkspaceProps> = ({
  onBackToEvaluator,
  onAddPoseTabToStudy,
}) => {
  const [pose, setPose] = useState<PosturePose3D>(() =>
    makeNeutralPose({
      stanceMode: 'standing',
      prop: 'none',
      shoulderRFlexionDeg: 24,
      shoulderLFlexionDeg: 24,
      shoulderRAbductionDeg: 8,
      shoulderLAbductionDeg: 8,
      elbowRFlexionDeg: 42,
      elbowLFlexionDeg: 42,
      forearmRPronationDeg: 0,
      forearmLPronationDeg: 0,
      wristLFlexionDeg: 0,
      wristLDeviationDeg: 0,
      hipRFlexionDeg: 6,
      kneeRFlexionDeg: 8,
      ankleRDorsiflexionDeg: 2,
      hipLFlexionDeg: 6,
      kneeLFlexionDeg: 8,
      ankleLDorsiflexionDeg: 2,
      handGripMode: 'relaxed',
      rootOffsetX: 0,
      rootOffsetZ: 0,
      rootYawDeg: 0,
      loadKg: 0,
    }),
  );

  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('isometric');
  const [orbit, setOrbit] = useState<CameraOrbitOverride>({
    azimuthDeg: -26,
    elevationDeg: 10,
    zoom: 1.05,
  });
  const [pointerMode, setPointerMode] = useState<'move_joints' | 'orbit_camera'>('move_joints');
  const [showGizmos, setShowGizmos] = useState<boolean>(true);
  const [symmetryLocked, setSymmetryLocked] = useState<boolean>(false);
  const [autoFlatFoot, setAutoFlatFoot] = useState<boolean>(true);
  const [activeGroup, setActiveGroup] = useState<JointControlGroup>('spine_head');
  const [selectedJoint, setSelectedJoint] = useState<JointKey | null>('shoulderR');
  const [hoveredJoint, setHoveredJoint] = useState<JointKey | null>(null);
  const [glbReadyTick, setGlbReadyTick] = useState<number>(0);
  const [taskTitle, setTaskTitle] = useState<string>('Simulación biomecánica libre en Avatar 3D');
  const [statusFeedback, setStatusFeedback] = useState<string>('');
  const [propVisibilityMode, setPropVisibilityMode] = useState<'always' | 'hidden' | 'final_photo_only'>('always');
  const [previewFinalPhotoProp, setPreviewFinalPhotoProp] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const projectedJointsRef = useRef<Record<JointKey, { x: number; y: number }> | null>(null);
  const dragSessionRef = useRef<
    | {
        kind: 'joint';
        joint: JointKey;
        startX: number;
        startY: number;
        startPose: PosturePose3D;
      }
    | {
        kind: 'orbit';
        startX: number;
        startY: number;
        az0: number;
        el0: number;
      }
    | null
  >(null);

  useEffect(() => {
    ensureAvatarGlbLoaded().then(() => setGlbReadyTick((t) => t + 1));
    const unsub = subscribeAvatarGlbLoaded(() => setGlbReadyTick((t) => t + 1));
    return unsub;
  }, []);

  const liveProp: ScenePropType =
    propVisibilityMode === 'hidden'
      ? 'none'
      : propVisibilityMode === 'final_photo_only' && !previewFinalPhotoProp
        ? 'none'
        : pose.prop || 'none';
  const exportProp: ScenePropType = propVisibilityMode === 'hidden' ? 'none' : pose.prop || 'none';

  const panelSpec: Panel3DSpec = useMemo(
    () => ({
      subTitle: taskTitle,
      scoreBadge: 'Movimiento Libre 3D',
      focusZone: 'full_body',
      cameraPreset,
      pose: { ...pose, prop: liveProp },
      angleArcs: [],
      forceVectors: [],
    }),
    [taskTitle, cameraPreset, pose, liveProp],
  );

  // Renderizado en tiempo real + captura de coordenadas 2D de articulaciones para el ratón/táctil
  useEffect(() => {
    void glbReadyTick;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const projected = renderInteractiveFreeAvatarToCanvas(
      panelSpec,
      canvas,
      640,
      540,
      orbit,
      2,
      {
        showGizmos,
        interactiveJoints: INTERACTIVE_JOINTS,
        selectedJoint,
        hoveredJoint,
      },
    );
    projectedJointsRef.current = projected;
  }, [panelSpec, orbit, showGizmos, selectedJoint, hoveredJoint, glbReadyTick]);

  const applyAnglePatch = useCallback(
    (basePose: PosturePose3D, updates: Partial<PosturePose3D>): PosturePose3D => {
      const next: PosturePose3D = { ...basePose, ...updates };

      if (symmetryLocked) {
        for (const field of ANGLE_FIELDS) {
          if (field.key in updates && field.mirrorKey && !(field.mirrorKey in updates)) {
            const rawVal = Number(updates[field.key] ?? 0);
            (next as unknown as Record<string, unknown>)[field.mirrorKey] = field.mirrorInvertSign ? -rawVal : rawVal;
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
          next.ankleRDorsiflexionDeg = clampNum(
            Math.round(next.kneeRFlexionDeg * 0.28),
            -20,
            NORMATIVE_JOINT_LIMITS.ankle.dorsiflexionMaxDeg,
          );
          next.hipRFlexionDeg = clampNum(
            next.kneeRFlexionDeg - next.ankleRDorsiflexionDeg,
            NORMATIVE_JOINT_LIMITS.hip.extensionMaxDeg,
            NORMATIVE_JOINT_LIMITS.hip.flexionMaxDeg,
          );
          if (symmetryLocked) {
            next.ankleLDorsiflexionDeg = next.ankleRDorsiflexionDeg;
            next.hipLFlexionDeg = next.hipRFlexionDeg;
          }
        } else if ('hipRFlexionDeg' in updates && !('ankleRDorsiflexionDeg' in updates)) {
          next.ankleRDorsiflexionDeg = clampNum(
            next.kneeRFlexionDeg - next.hipRFlexionDeg,
            NORMATIVE_JOINT_LIMITS.ankle.plantarflexionMinDeg,
            NORMATIVE_JOINT_LIMITS.ankle.dorsiflexionMaxDeg,
          );
          if (symmetryLocked) next.ankleLDorsiflexionDeg = next.ankleRDorsiflexionDeg;
        }
        if ('kneeLFlexionDeg' in updates && !('hipLFlexionDeg' in updates)) {
          next.ankleLDorsiflexionDeg = clampNum(
            Math.round(next.kneeLFlexionDeg * 0.28),
            -20,
            NORMATIVE_JOINT_LIMITS.ankle.dorsiflexionMaxDeg,
          );
          next.hipLFlexionDeg = clampNum(
            next.kneeLFlexionDeg - next.ankleLDorsiflexionDeg,
            NORMATIVE_JOINT_LIMITS.hip.extensionMaxDeg,
            NORMATIVE_JOINT_LIMITS.hip.flexionMaxDeg,
          );
        } else if ('hipLFlexionDeg' in updates && !('ankleLDorsiflexionDeg' in updates)) {
          next.ankleLDorsiflexionDeg = clampNum(
            next.kneeLFlexionDeg - next.hipLFlexionDeg,
            NORMATIVE_JOINT_LIMITS.ankle.plantarflexionMinDeg,
            NORMATIVE_JOINT_LIMITS.ankle.dorsiflexionMaxDeg,
          );
        }
      }

      return clampPoseToNormativeWorkAgeLimits(next);
    },
    [symmetryLocked, autoFlatFoot],
  );

  const getLogicalCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = 640 / Math.max(1, rect.width);
    const scaleY = 540 / Math.max(1, rect.height);
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const findNearestInteractiveJoint = (logicalX: number, logicalY: number, maxRadius = 24): JointKey | null => {
    const map = projectedJointsRef.current;
    if (!map) return null;
    let bestJoint: JointKey | null = null;
    let bestDist = maxRadius;
    for (const jk of INTERACTIVE_JOINTS) {
      const pt = map[jk];
      if (!pt) continue;
      const d = Math.hypot(pt.x - logicalX, pt.y - logicalY);
      if (d <= bestDist) {
        bestDist = d;
        bestJoint = jk;
      }
    }
    return bestJoint;
  };

  const selectGroupForJoint = (jk: JointKey) => {
    if (jk === 'head' || jk === 'c7' || jk === 't12' || jk === 'l5s1') {
      setActiveGroup('spine_head');
    } else if (jk === 'shoulderR' || jk === 'elbowR' || jk === 'wristR') {
      setActiveGroup('right_arm');
    } else if (jk === 'shoulderL' || jk === 'elbowL' || jk === 'wristL') {
      setActiveGroup('left_arm');
    } else if (jk === 'hipR' || jk === 'kneeR' || jk === 'ankleR' || jk === 'hipL' || jk === 'kneeL' || jk === 'ankleL') {
      setActiveGroup('legs_feet');
    } else if (jk === 'pelvis') {
      setActiveGroup('space_props');
    }
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = getLogicalCanvasCoords(e);

    if (pointerMode === 'move_joints') {
      const hitRadius = e.pointerType === 'touch' ? 34 : 24;
      const hitJoint = findNearestInteractiveJoint(x, y, hitRadius);
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
    }

    // Si se arrastra fuera de las articulaciones (o en modo cámara), rotar la vista 360°
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
        const { x, y } = getLogicalCanvasCoords(e);
        setHoveredJoint(findNearestInteractiveJoint(x, y, 22));
      }
      return;
    }

    const dx = e.clientX - session.startX;
    const dy = e.clientY - session.startY;

    if (session.kind === 'orbit') {
      setOrbit((prev) => ({
        ...prev,
        azimuthDeg: clampNum(Math.round(session.az0 - dx * 0.45), -180, 180),
        elevationDeg: clampNum(Math.round(session.el0 + dy * 0.35), -65, 65),
      }));
      return;
    }

    const sp = session.startPose;
    const sens = 0.55;
    let patch: Partial<PosturePose3D> = {};

    switch (session.joint) {
      case 'head':
        patch = {
          neckFlexionDeg: clampNum(
            Math.round(sp.neckFlexionDeg + dy * sens),
            NORMATIVE_JOINT_LIMITS.cervicalAndShoulder.neckExtensionMinDeg,
            NORMATIVE_JOINT_LIMITS.cervicalAndShoulder.neckFlexionMaxDeg,
          ),
          neckTwistDeg: clampNum(Math.round(sp.neckTwistDeg + dx * sens), -60, 60),
        };
        break;
      case 'c7':
        patch = {
          neckFlexionDeg: clampNum(
            Math.round(sp.neckFlexionDeg + dy * sens),
            NORMATIVE_JOINT_LIMITS.cervicalAndShoulder.neckExtensionMinDeg,
            NORMATIVE_JOINT_LIMITS.cervicalAndShoulder.neckFlexionMaxDeg,
          ),
          neckLateralDeg: clampNum(Math.round(sp.neckLateralDeg + dx * 0.45), -30, 30),
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
          trunkLateralDeg: clampNum(Math.round(sp.trunkLateralDeg + dx * 0.45), -35, 35),
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
      case 'shoulderR':
        patch = {
          shoulderRFlexionDeg: clampNum(Math.round(sp.shoulderRFlexionDeg - dy * 0.65), -45, 165),
          shoulderRAbductionDeg: clampNum(Math.round(sp.shoulderRAbductionDeg + dx * 0.5), -25, 135),
        };
        break;
      case 'elbowR':
        patch = {
          elbowRFlexionDeg: clampNum(
            Math.round((sp.elbowRFlexionDeg - dy * 0.65) * 2) / 2,
            NORMATIVE_JOINT_LIMITS.elbow.flexionMinDeg,
            NORMATIVE_JOINT_LIMITS.elbow.flexionMaxDeg,
          ),
          forearmRPronationDeg: clampNum(Math.round(sp.forearmRPronationDeg + dx * 0.6), -85, 85),
        };
        break;
      case 'wristR':
        patch = {
          wristRFlexionDeg: clampNum(
            Math.round(sp.wristRFlexionDeg + dy * 0.55),
            NORMATIVE_JOINT_LIMITS.wrist.dorsalExtensionMinDeg,
            NORMATIVE_JOINT_LIMITS.wrist.palmarFlexionMaxDeg,
          ),
          wristRDeviationDeg: clampNum(
            Math.round(sp.wristRDeviationDeg + dx * 0.45),
            NORMATIVE_JOINT_LIMITS.wrist.radialDeviationMinDeg,
            NORMATIVE_JOINT_LIMITS.wrist.ulnarDeviationMaxDeg,
          ),
        };
        break;
      case 'shoulderL':
        patch = {
          shoulderLFlexionDeg: clampNum(Math.round(sp.shoulderLFlexionDeg - dy * 0.65), -45, 165),
          shoulderLAbductionDeg: clampNum(Math.round(sp.shoulderLAbductionDeg - dx * 0.5), -25, 135),
        };
        break;
      case 'elbowL':
        patch = {
          elbowLFlexionDeg: clampNum(
            Math.round((sp.elbowLFlexionDeg - dy * 0.65) * 2) / 2,
            NORMATIVE_JOINT_LIMITS.elbow.flexionMinDeg,
            NORMATIVE_JOINT_LIMITS.elbow.flexionMaxDeg,
          ),
          forearmLPronationDeg: clampNum(Math.round((sp.forearmLPronationDeg ?? 0) + dx * 0.6), -85, 85),
        };
        break;
      case 'wristL':
        patch = {
          wristLFlexionDeg: clampNum(
            Math.round((sp.wristLFlexionDeg ?? 0) + dy * 0.55),
            NORMATIVE_JOINT_LIMITS.wrist.dorsalExtensionMinDeg,
            NORMATIVE_JOINT_LIMITS.wrist.palmarFlexionMaxDeg,
          ),
          wristLDeviationDeg: clampNum(
            Math.round((sp.wristLDeviationDeg ?? 0) - dx * 0.45),
            NORMATIVE_JOINT_LIMITS.wrist.radialDeviationMinDeg,
            NORMATIVE_JOINT_LIMITS.wrist.ulnarDeviationMaxDeg,
          ),
        };
        break;
      case 'hipR':
        patch = {
          hipRFlexionDeg: clampNum(
            Math.round(sp.hipRFlexionDeg - dy * 0.6),
            NORMATIVE_JOINT_LIMITS.hip.extensionMaxDeg,
            NORMATIVE_JOINT_LIMITS.hip.flexionMaxDeg,
          ),
        };
        break;
      case 'kneeR':
        patch = {
          kneeRFlexionDeg: clampNum(
            Math.round((sp.kneeRFlexionDeg + dy * 0.65) * 2) / 2,
            sp.stanceMode === 'seated' || sp.stanceMode === 'kneeling'
              ? 0
              : NORMATIVE_JOINT_LIMITS.knee.flexionMinDeg,
            NORMATIVE_JOINT_LIMITS.knee.flexionMaxDeg,
          ),
        };
        break;
      case 'ankleR':
        patch = {
          ankleRDorsiflexionDeg: clampNum(
            Math.round((sp.ankleRDorsiflexionDeg - dy * 0.5) * 2) / 2,
            NORMATIVE_JOINT_LIMITS.ankle.plantarflexionMinDeg,
            NORMATIVE_JOINT_LIMITS.ankle.dorsiflexionMaxDeg,
          ),
        };
        break;
      case 'hipL':
        patch = {
          hipLFlexionDeg: clampNum(
            Math.round(sp.hipLFlexionDeg - dy * 0.6),
            NORMATIVE_JOINT_LIMITS.hip.extensionMaxDeg,
            NORMATIVE_JOINT_LIMITS.hip.flexionMaxDeg,
          ),
        };
        break;
      case 'kneeL':
        patch = {
          kneeLFlexionDeg: clampNum(
            Math.round((sp.kneeLFlexionDeg + dy * 0.65) * 2) / 2,
            sp.stanceMode === 'seated' || sp.stanceMode === 'kneeling'
              ? 0
              : NORMATIVE_JOINT_LIMITS.knee.flexionMinDeg,
            NORMATIVE_JOINT_LIMITS.knee.flexionMaxDeg,
          ),
        };
        break;
      case 'ankleL':
        patch = {
          ankleLDorsiflexionDeg: clampNum(
            Math.round((sp.ankleLDorsiflexionDeg - dy * 0.5) * 2) / 2,
            NORMATIVE_JOINT_LIMITS.ankle.plantarflexionMinDeg,
            NORMATIVE_JOINT_LIMITS.ankle.dorsiflexionMaxDeg,
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
    const delta = e.deltaY > 0 ? -0.06 : 0.06;
    setOrbit((prev) => ({
      ...prev,
      zoom: clampNum(Number((prev.zoom + delta).toFixed(2)), 0.65, 1.85),
    }));
  };

  const handleResetNeutral = () => {
    setPose(
      makeNeutralPose({
        stanceMode: 'standing',
        prop: 'none',
        shoulderRFlexionDeg: 10,
        shoulderLFlexionDeg: 10,
        shoulderRAbductionDeg: 5,
        shoulderLAbductionDeg: 5,
        elbowRFlexionDeg: 14,
        elbowLFlexionDeg: 14,
        forearmRPronationDeg: 0,
        forearmLPronationDeg: 0,
        wristLFlexionDeg: 0,
        wristLDeviationDeg: 0,
        hipRFlexionDeg: 4,
        kneeRFlexionDeg: 6,
        ankleRDorsiflexionDeg: 2,
        hipLFlexionDeg: 4,
        kneeLFlexionDeg: 6,
        ankleLDorsiflexionDeg: 2,
        handGripMode: 'relaxed',
        rootOffsetX: 0,
        rootOffsetZ: 0,
        rootYawDeg: 0,
        loadKg: 0,
      }),
    );
    setOrbit({ azimuthDeg: -24, elevationDeg: 8, zoom: 1.05 });
  };

  const handleLoadIdealPreset = (presetId: IdealPostureId) => {
    const found = IDEAL_POSTURE_CATALOG.find((p) => p.id === presetId);
    if (!found) return;
    const built = found.buildPose(172, found.loadKg);
    setPose({
      ...built,
      rootOffsetX: 0,
      rootOffsetZ: 0,
      rootYawDeg: 0,
    });
    setCameraPreset(found.recommendedCamera);
    setOrbit(DEFAULT_ORBIT_OVERRIDE);
    setTaskTitle(found.shortName);
  };

  const rulaEval = useMemo(() => evaluateRula(buildRulaFromPose(pose)), [pose]);
  const rebaEval = useMemo(() => evaluateReba(buildRebaFromPose(pose)), [pose]);
  const rulaSev = getSeverityStyles(rulaEval.severity);
  const rebaSev = getSeverityStyles(rebaEval.severity);

  const visibleFields = useMemo(
    () => (activeGroup === 'all' ? ANGLE_FIELDS : ANGLE_FIELDS.filter((f) => f.group === activeGroup)),
    [activeGroup],
  );

  const handleDownloadCleanPng = async () => {
    await ensureAvatarGlbLoaded();
    const off = document.createElement('canvas');
    const finalSpec: Panel3DSpec = {
      ...panelSpec,
      pose: { ...pose, prop: exportProp },
    };
    renderInteractivePose3DToCanvas(finalSpec, off, 800, 680, orbit, 2, 'anatomical_skin', false);
    const png = await exportCanvasToHighQualityPng(off);
    const url = URL.createObjectURL(png.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'avatar_libre_foto_final_3d.png';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSendToStudy = async (targetMethod: MethodId.RULA | MethodId.REBA) => {
    await ensureAvatarGlbLoaded();
    const off = document.createElement('canvas');
    const finalSpec: Panel3DSpec = {
      ...panelSpec,
      pose: { ...pose, prop: exportProp },
    };
    renderInteractivePose3DToCanvas(finalSpec, off, 800, 640, orbit, 2, 'anatomical_skin', false);
    const dataUrl = off.toDataURL('image/png');

    const newTab = createNewStudyTab(1, targetMethod, taskTitle);
    newTab.tabLabel = `Avatar Libre · ${targetMethod === MethodId.RULA ? 'RULA' : 'REBA'}`;
    newTab.payloads = {
      ...newTab.payloads,
      [MethodId.RULA]: buildRulaFromPose(pose),
      [MethodId.REBA]: buildRebaFromPose(pose),
    };
    const evalRes = targetMethod === MethodId.RULA ? rulaEval : rebaEval;
    const elbIntR = clampNum(Math.round(180 - pose.elbowRFlexionDeg), 30, 170);
    const elbIntL = clampNum(Math.round(180 - pose.elbowLFlexionDeg), 30, 170);
    newTab.implementationDeadline = evalRes.recommendedDeadline;
    newTab.evaluatorObservations = `Simulación cinemática libre con ángulos específicos: Tronco ${pose.trunkFlexionDeg}° (giro ${pose.trunkTwistDeg}°), Cuello ${pose.neckFlexionDeg}°, Hombros D/I ${pose.shoulderRFlexionDeg}°/${pose.shoulderLFlexionDeg}°, Codos int. D/I ${elbIntR}°/${elbIntL}°, Rodillas D/I ${pose.kneeRFlexionDeg}°/${pose.kneeLFlexionDeg}°. Resultado: ${evalRes.primaryScoreText} (${evalRes.riskLabel}).`;
    newTab.correctiveMeasures = evalRes.suggestedMeasures.map((m, i) => `${i + 1}. ${m}`).join('\n');

    const photo: StudyPhoto = {
      id: `ph-free-${Date.now()}`,
      name: `avatar-libre-3d-${Date.now()}.png`,
      dataUrl,
      caption: `${taskTitle} — ${evalRes.primaryScoreText}`,
      annotations: [],
    };
    newTab.photos = [photo];

    onAddPoseTabToStudy(newTab);
    setStatusFeedback(
      `Postura enviada al Estudio de Puesto como pestaña ${targetMethod === MethodId.RULA ? 'RULA' : 'REBA'} con imagen 3D adjunta.`,
    );
    window.setTimeout(() => setStatusFeedback(''), 4500);
  };

  return (
    <div className="space-y-5">
      {/* CABECERA */}
      <section className="bg-white border border-slate-300 rounded-lg p-4 sm:p-5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-sky-800 font-semibold">
              <span>Cinemática Directa con Ratón / Táctil</span>
              <span aria-hidden="true">·</span>
              <span>Ingreso Exacto de Ángulos en Grados (°)</span>
              <span aria-hidden="true">·</span>
              <span>Cálculo RULA y REBA en Vivo</span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Laboratorio de Movimiento Libre del Avatar 3D (Ratón + Ángulos Específicos)
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-4xl leading-relaxed">
              Haga clic y arrastre cualquier nodo articular celeste directamente sobre el Avatar 3D para mover cabeza,
              tronco, hombros, codos, muñecas, pelvis, rodillas o tobillos con el ratón (o dedo en pantallas táctiles),
              arrastre el fondo para orbitar 360° e ingrese ángulos específicos exactos en los campos numéricos laterales.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleResetNeutral}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
              Postura Neutra
            </button>
            <button
              type="button"
              onClick={handleDownloadCleanPng}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-md border border-sky-700 bg-sky-700 hover:bg-sky-800 text-xs font-semibold text-white cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Descargar PNG HD
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

      {/* CUERPO PRINCIPAL: EN MÓVIL EL AVATAR 3D SIEMPRE ARRIBA (order-1) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* COLUMNA VISOR 3D INTERACTIVO */}
        <section className="order-1 lg:col-span-7 bg-white border border-slate-300 rounded-lg p-3.5 sm:p-4 space-y-3 shadow-2xs lg:sticky lg:top-24">
          {/* Barra de modo de puntero y cámaras */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
            <div className="inline-flex rounded-md border border-slate-300 bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setPointerMode('move_joints')}
                className={`inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                  pointerMode === 'move_joints'
                    ? 'bg-sky-700 text-white shadow-2xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <MousePointerClick className="w-3.5 h-3.5" />
                Mover Articulaciones
              </button>
              <button
                type="button"
                onClick={() => setPointerMode('orbit_camera')}
                className={`inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                  pointerMode === 'orbit_camera'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                Rotar Cámara 360°
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'sagittal_right', label: 'Perfil Der.' },
                  { id: 'frontal', label: 'Frontal' },
                  { id: 'isometric', label: 'Isométrica' },
                  { id: 'sagittal_left', label: 'Perfil Izq.' },
                ] as { id: CameraPreset; label: string }[]
              ).map((cam) => (
                <button
                  key={cam.id}
                  type="button"
                  onClick={() => {
                    setCameraPreset(cam.id);
                    setOrbit({ azimuthDeg: 0, elevationDeg: 6, zoom: 1.05 });
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

          {/* Lienzo 3D táctil y de ratón */}
          <div className="relative rounded-lg border border-slate-300 bg-slate-50 overflow-hidden">
            <canvas
              ref={canvasRef}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerUp}
              onWheel={handleWheelZoom}
              className={`w-full h-auto max-h-[540px] block mx-auto touch-none select-none ${
                pointerMode === 'move_joints' && hoveredJoint ? 'cursor-grab active:cursor-grabbing' : 'cursor-move'
              }`}
            />

            {/* Indicador limpio de articulación activa */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-900 text-white text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Move3d className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="truncate">
                  {hoveredJoint
                    ? `Apuntando: ${JOINT_LABELS_ES[hoveredJoint]}`
                    : selectedJoint
                      ? `Articulación activa: ${JOINT_LABELS_ES[selectedJoint]}`
                      : 'Arrastre cualquier punto celeste para articular o el fondo para rotar 360°'}
                </span>
              </div>
              <span className="font-mono text-[11px] text-slate-300 tabular-nums shrink-0">
                Az {orbit.azimuthDeg}° · El {orbit.elevationDeg}° · Zoom {orbit.zoom.toFixed(2)}×
              </span>
            </div>
          </div>

          {/* Opciones rápidas bajo el visor */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-0.5">
            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-1.5 text-slate-800 font-medium cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showGizmos}
                  onChange={(e) => setShowGizmos(e.target.checked)}
                  className="rounded border-slate-400 text-sky-700"
                />
                <span>Mostrar nodos articulares en el cuerpo</span>
              </label>

              <label className="inline-flex items-center gap-1.5 text-slate-800 font-medium cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={symmetryLocked}
                  onChange={(e) => setSymmetryLocked(e.target.checked)}
                  className="rounded border-slate-400 text-sky-700"
                />
                <Link2 className="w-3.5 h-3.5 text-sky-700" />
                <span>Simetría bilateral (Der ↔ Izq)</span>
              </label>

              <label className="inline-flex items-center gap-1.5 text-slate-800 font-medium cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoFlatFoot}
                  onChange={(e) => setAutoFlatFoot(e.target.checked)}
                  className="rounded border-slate-400 text-sky-700"
                />
                <span>Equilibrio plantígrado automático</span>
              </label>
            </div>
          </div>

          {/* Resultados RULA y REBA en vivo + Botones de Integración al Informe */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
            <div className={`rounded-md border p-3 ${rulaSev.box} flex items-center justify-between gap-2`}>
              <div>
                <div className="text-[11px] font-semibold text-slate-600">Valoración RULA en Vivo</div>
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
                <div className="text-[11px] font-semibold text-slate-600">Valoración REBA en Vivo</div>
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

        {/* COLUMNA DERECHA: INGRESO DE ÁNGULOS ESPECÍFICOS Y CONFIGURACIÓN DE ESCENA */}
        <section className="order-2 lg:col-span-5 bg-white border border-slate-300 rounded-lg p-4 space-y-4 shadow-2xs">
          {/* Selección rápida de postura base, modo de pies, agarre y objeto 3D */}
          <div className="space-y-3 border-b border-slate-200 pb-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <Sliders className="w-4 h-4 text-sky-700" />
              <span>Configuración de Escena y Postura Base</span>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Cargar Postura Base de Referencia (Opcional)</label>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) handleLoadIdealPreset(e.target.value as IdealPostureId);
                }}
                className="w-full min-h-[40px] rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-900"
              >
                <option value="">Seleccionar postura base para editar libremente...</option>
                {IDEAL_POSTURE_CATALOG.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.shortName}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Mobiliario / Estantería 3D</label>
                <select
                  value={pose.prop || 'none'}
                  onChange={(e) => {
                    const nextProp = e.target.value as ScenePropType;
                    setPose((p) => ({ ...p, prop: nextProp }));
                    if (nextProp !== 'none' && propVisibilityMode === 'hidden') {
                      setPropVisibilityMode('always');
                    }
                  }}
                  className="w-full min-h-[40px] rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                >
                  {PROP_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

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
                  className="w-full min-h-[40px] rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                >
                  <option value="standing">De pie equilibrado (Bipedestación)</option>
                  <option value="squatting">En cuclillas / Flexión profunda</option>
                  <option value="seated">Sentado (Sedestación)</option>
                  <option value="kneeling">Arrodillado en suelo</option>
                  <option value="walking">En marcha / Paso asimétrico</option>
                  <option value="one_leg">Apoyo unilateral (1 pierna)</option>
                </select>
              </div>
            </div>

            {pose.prop && pose.prop !== 'none' && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-800">
                    Visibilidad y acomodo del mueble / estantería
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveGroup('space_props')}
                    className="text-[11px] font-semibold text-sky-700 hover:text-sky-900 underline cursor-pointer"
                  >
                    Mover X/Y/Z y giro →
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1 bg-slate-200/70 p-0.5 rounded">
                  {(
                    [
                      { id: 'always', label: 'Siempre visible' },
                      { id: 'hidden', label: 'Quitar mueble' },
                      { id: 'final_photo_only', label: 'Solo foto final' },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setPropVisibilityMode(mode.id)}
                      className={`min-h-[30px] px-2 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
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
                  <label className="flex items-center justify-between gap-2 text-[11px] text-slate-700 cursor-pointer select-none pt-0.5">
                    <span>
                      Oculto al articular; se incluye automáticamente al <strong>Descargar PNG HD</strong> o enviar al estudio.
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-semibold text-sky-800 shrink-0">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  <Hand className="w-3 h-3 inline mr-1 text-sky-700" />
                  Tipo de Agarre de Manos
                </label>
                <select
                  value={pose.handGripMode || 'relaxed'}
                  onChange={(e) =>
                    setPose((p) => ({
                      ...p,
                      handGripMode: e.target.value as NonNullable<PosturePose3D['handGripMode']>,
                    }))
                  }
                  className="w-full min-h-[40px] rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                >
                  <option value="relaxed">Manos relajadas naturales</option>
                  <option value="box_cradle">Acople lateral abierto para cajas</option>
                  <option value="power_grip">Agarre cilíndrico de fuerza (Volante/Pala)</option>
                  <option value="pinch">Pinza digital fina</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Masa / Fuerza Manipulada (kg)</label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  step={0.5}
                  value={pose.loadKg ?? 0}
                  onChange={(e) => setPose((p) => ({ ...p, loadKg: Math.max(0, Number(e.target.value) || 0) }))}
                  className="w-full min-h-[40px] rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono font-semibold tabular-nums text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Selector de grupo anatómico para ángulos específicos */}
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1">
              {(
                [
                  { id: 'spine_head', label: 'Tronco y Cuello' },
                  { id: 'right_arm', label: 'Brazo Der.' },
                  { id: 'left_arm', label: 'Brazo Izq.' },
                  { id: 'legs_feet', label: 'Piernas y Pies' },
                  { id: 'space_props', label: 'Muebles y Planta' },
                  { id: 'all', label: 'Todos (28)' },
                ] as { id: JointControlGroup; label: string }[]
              ).map((grp) => (
                <button
                  key={grp.id}
                  type="button"
                  onClick={() => setActiveGroup(grp.id)}
                  className={`min-h-[36px] px-2.5 py-1.5 rounded border text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                    activeGroup === grp.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {grp.label}
                </button>
              ))}
            </div>

            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Box,
  CheckCircle2,
  Download,
  Plus,
  RotateCcw,
  Sliders,
  Thermometer,
} from 'lucide-react';
import {
  MethodEvaluationResult,
  MethodId,
  StudyPhoto,
  StudyTab,
} from '../types/ergonomics';
import {
  CameraPreset,
  FocusZone,
  Panel3DSpec,
  PosturePose3D,
  ScenePropType,
} from '../types/figurePlan';
import { METHOD_CATALOG, createNewStudyTab } from '../utils/defaults';
import { evaluateStudyTab } from '../utils/calculations';
import { makeNeutralPose } from '../utils/figurePlanCatalog';
import {
  LiftPostureStyle,
  parseAvatarQuickTextCorrection,
  solveAvatarLiftPoseForTarget,
} from '../utils/avatarPoseInverseKinematics';
import {
  IDEAL_POSTURE_CATALOG,
  IdealPostureId,
  getIdealPostureById,
} from '../utils/idealPosturesCatalog';
import {
  CENEA_SAMPLE_VIDEOS_CATALOG,
  CeneaSampleCaseId,
  buildCeneaSampleFrameSpec,
  getCeneaSampleCaseById,
} from '../utils/ceneaSampleVideosCatalog';
import {
  CameraOrbitOverride,
  DEFAULT_ORBIT_OVERRIDE,
  ensureAvatarGlbLoaded,
  renderInteractivePose3DToCanvas,
  subscribeAvatarGlbLoaded,
} from '../utils/biomech3dRenderer';
import { getSeverityStyles } from './StudyTabWorkspace';

interface AvatarTesterWorkspaceProps {
  onBackToEvaluator: () => void;
  onAddTestedTabToStudy: (newTab: StudyTab) => void;
  onOpenEnvironmentalWorkspace?: () => void;
}

interface DualNumericSliderProps {
  label: string;
  unit?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (nextVal: number) => void;
}

const DualNumericSlider: React.FC<DualNumericSliderProps> = ({
  label,
  unit = '',
  value,
  min,
  max,
  step = 1,
  onChange,
}) => {
  const [textDraft, setTextDraft] = useState<string>(String(Math.round(value * 100) / 100));
  const [isFocused, setIsFocused] = useState<boolean>(false);

  useEffect(() => {
    if (!isFocused) {
      setTextDraft(String(Math.round(value * 100) / 100));
    }
  }, [value, isFocused]);

  const handleTextChange = (raw: string) => {
    setTextDraft(raw);
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '-' || trimmed.endsWith('.') || trimmed.endsWith(',')) {
      return;
    }
    const parsed = parseFloat(trimmed.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
      onChange(parsed);
    }
  };

  const commitFinalText = () => {
    setIsFocused(false);
    const parsed = parseFloat(textDraft.trim().replace(',', '.'));
    if (Number.isFinite(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed));
      onChange(clamped);
      setTextDraft(String(Math.round(clamped * 100) / 100));
    } else {
      setTextDraft(String(Math.round(value * 100) / 100));
    }
  };

  return (
    <div className="space-y-1 bg-white border border-slate-200 rounded-md p-2.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-slate-800">{label}</span>
        <span className="font-mono font-semibold text-sky-800 tabular-nums">
          {Math.round(value * 10) / 10}
          {unit}
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-sky-700 cursor-pointer"
        />
        <input
          type="text"
          inputMode="decimal"
          value={textDraft}
          onFocus={() => setIsFocused(true)}
          onChange={(e) => handleTextChange(e.target.value)}
          onBlur={commitFinalText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-label={label}
          className="w-20 border border-slate-300 rounded px-2 py-1 text-right font-mono text-xs text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-600"
        />
      </div>
    </div>
  );
};

const SCENE_PROP_OPTIONS: { value: ScenePropType; label: string }[] = [
  { value: 'box_load', label: 'Caja de carga bimanual' },
  { value: 'none', label: 'Sin objeto (solo avatar)' },
  { value: 'bin_to_cart', label: 'Bin contenedor + Carro plataforma (Fig. 12.3)' },
  { value: 'pallet_cooler', label: 'Pallet + Conservadora isotérmica (Fig. 12.8)' },
  { value: 'bus_driver_seat', label: 'Butaca y volante de conducción (Fig. 13.2)' },
  { value: 'electrical_panel', label: 'Tablero eléctrico bajo (Fig. 11.1)' },
  { value: 'office_desk_lateral', label: 'Escritorio con monitor PVD' },
  { value: 'work_desk_support', label: 'Mesa / banco de trabajo' },
  { value: 'chair', label: 'Silla de trabajo' },
  { value: 'cold_room_high_shelf', label: 'Estantería alta con caja' },
  { value: 'cart_push_dynamo', label: 'Carro logístico de empuje' },
  { value: 'cart_pull_dynamo', label: 'Carro logístico de tracción' },
  { value: 'pallet_jack_rack', label: 'Transpaleta + Estantería de almacén' },
  { value: 'hopper_sack_pour', label: 'Tolva inoxidable + Saco industrial' },
  { value: 'conveyor_veg_line', label: 'Cinta transportadora + Gaveta' },
  { value: 'trench_shovel', label: 'Pala manual' },
];

const CAMERA_OPTIONS: { value: CameraPreset; label: string }[] = [
  { value: 'sagittal_right', label: 'Sagital Derecha (Perfil)' },
  { value: 'sagittal_left', label: 'Sagital Izquierda' },
  { value: 'frontal', label: 'Frontal / Coronal' },
  { value: 'isometric', label: 'Isométrica 3D' },
  { value: 'dorsal', label: 'Dorsal / Posterior' },
  { value: 'top', label: 'Superior / Cenital' },
];

const FOCUS_OPTIONS: { value: FocusZone; label: string }[] = [
  { value: 'full_body', label: 'Cuerpo Completo' },
  { value: 'trunk_pelvis', label: 'Tronco y Pelvis' },
  { value: 'lumbar_l5s1', label: 'Lumbar L5/S1' },
  { value: 'shoulder_arm', label: 'Hombro y Brazo' },
  { value: 'elbow_forearm', label: 'Codo y Antebrazo' },
  { value: 'wrist_hand', label: 'Muñeca y Mano (Primer Plano)' },
  { value: 'legs_knees', label: 'Piernas y Rodillas' },
  { value: 'ankle_foot', label: 'Tobillo y Pie' },
];

function buildMethodTabFromAvatarState(params: {
  methodId: MethodId;
  taskLabel: string;
  pose: PosturePose3D;
  vOrigCm: number;
  hOrigCm: number;
  vDestCm: number;
  hDestCm: number;
  loadKg: number;
  freqPerMin: number;
  coupling: 'bueno' | 'regular' | 'malo';
  durationCat: 'le_1h' | '1_to_2h' | '2_to_8h';
  dualMode: boolean;
}): StudyTab {
  const {
    methodId,
    taskLabel,
    pose,
    vOrigCm,
    hOrigCm,
    vDestCm,
    hDestCm,
    loadKg,
    freqPerMin,
    coupling,
    durationCat,
    dualMode,
  } = params;

  const tab = createNewStudyTab(1, methodId, taskLabel);

  const trunkAbs = Math.abs(pose.trunkFlexionDeg);
  const shMax = Math.max(Math.abs(pose.shoulderRFlexionDeg), Math.abs(pose.shoulderLFlexionDeg));
  const elbR = pose.elbowRFlexionDeg;
  const elbL = pose.elbowLFlexionDeg;
  const wristAbs = Math.abs(pose.wristRFlexionDeg);
  const kneeMax = Math.max(pose.kneeRFlexionDeg, pose.kneeLFlexionDeg);

  // Mapear ángulos actuales del avatar a las entradas normativas del método elegido
  if (methodId === MethodId.NIOSH) {
    tab.payloads[MethodId.NIOSH] = {
      loadWeightKg: loadKg,
      evaluateDestination: dualMode,
      hOriginCm: hOrigCm,
      hDestCm: dualMode ? hDestCm : hOrigCm,
      vOriginCm: vOrigCm,
      vDestCm: dualMode ? vDestCm : Math.min(185, vOrigCm + 45),
      asymmetryOriginDeg: Math.abs(pose.trunkTwistDeg),
      asymmetryDestDeg: Math.abs(pose.trunkTwistDeg),
      frequencyLiftsPerMin: freqPerMin,
      durationCategory: durationCat,
      couplingQuality: coupling,
    };
  } else if (methodId === MethodId.REBA) {
    const trunkPos: 1 | 2 | 3 | 4 =
      trunkAbs <= 5 ? 1 : pose.trunkFlexionDeg < 0 || trunkAbs <= 20 ? 2 : trunkAbs <= 60 ? 3 : 4;
    const upperPosR: 1 | 2 | 3 | 4 =
      Math.abs(pose.shoulderRFlexionDeg) <= 20
        ? 1
        : Math.abs(pose.shoulderRFlexionDeg) <= 45
          ? 2
          : Math.abs(pose.shoulderRFlexionDeg) <= 90
            ? 3
            : 4;
    const upperPosL: 1 | 2 | 3 | 4 =
      Math.abs(pose.shoulderLFlexionDeg) <= 20
        ? 1
        : Math.abs(pose.shoulderLFlexionDeg) <= 45
          ? 2
          : Math.abs(pose.shoulderLFlexionDeg) <= 90
            ? 3
            : 4;
    const couplingScore: 0 | 1 | 2 | 3 = coupling === 'bueno' ? 0 : coupling === 'regular' ? 1 : 2;
    tab.payloads[MethodId.REBA] = {
      evaluatedSide: 'ambos',
      trunkPos,
      trunkTwistedOrSide: Math.abs(pose.trunkTwistDeg) >= 10 || Math.abs(pose.trunkLateralDeg) >= 10,
      neckPos: Math.abs(pose.neckFlexionDeg) > 20 || pose.neckFlexionDeg < -5 ? 2 : 1,
      neckTwistedOrSide: Math.abs(pose.neckTwistDeg) >= 10 || Math.abs(pose.neckLateralDeg) >= 10,
      legsBase: pose.stanceMode === 'one_leg' ? 2 : 1,
      legsKneeFlexion: kneeMax > 60 ? 2 : kneeMax >= 30 ? 1 : 0,
      loadForce: loadKg > 10 ? 2 : loadKg >= 5 ? 1 : 0,
      shockForce: false,
      right: {
        upperArmPos: upperPosR,
        shoulderRaised: Boolean(pose.shoulderRElevated),
        armAbducted: pose.shoulderRAbductionDeg > 20,
        armSupported: false,
        lowerArmPos: elbR >= 60 && elbR <= 100 ? 1 : 2,
        wristPos: wristAbs > 15 ? 2 : 1,
        wristTwistedOrDeviated: Math.abs(pose.wristRDeviationDeg) > 10 || Math.abs(pose.forearmRPronationDeg) > 45,
        coupling: couplingScore,
      },
      left: {
        upperArmPos: upperPosL,
        shoulderRaised: Boolean(pose.shoulderRElevated),
        armAbducted: pose.shoulderLAbductionDeg > 20,
        armSupported: false,
        lowerArmPos: elbL >= 60 && elbL <= 100 ? 1 : 2,
        wristPos: Math.abs(pose.wristLFlexionDeg ?? 0) > 15 ? 2 : 1,
        wristTwistedOrDeviated: Math.abs(pose.wristRDeviationDeg) > 10,
        coupling: couplingScore,
      },
      activityStatic: freqPerMin < 1,
      activityRepetitive: freqPerMin >= 4,
      activityUnstableChanges: dualMode && Math.abs(vDestCm - vOrigCm) >= 45,
    };
  } else if (methodId === MethodId.RULA) {
    const upperPosR: 1 | 2 | 3 | 4 =
      Math.abs(pose.shoulderRFlexionDeg) <= 20
        ? 1
        : Math.abs(pose.shoulderRFlexionDeg) <= 45
          ? 2
          : Math.abs(pose.shoulderRFlexionDeg) <= 90
            ? 3
            : 4;
    const upperPosL: 1 | 2 | 3 | 4 =
      Math.abs(pose.shoulderLFlexionDeg) <= 20
        ? 1
        : Math.abs(pose.shoulderLFlexionDeg) <= 45
          ? 2
          : Math.abs(pose.shoulderLFlexionDeg) <= 90
            ? 3
            : 4;
    const forceScore: 0 | 1 | 2 | 3 = loadKg > 10 ? 3 : loadKg >= 2 ? 1 : 0;
    tab.payloads[MethodId.RULA] = {
      evaluatedSide: 'ambos',
      right: {
        upperArmPos: upperPosR,
        shoulderRaised: Boolean(pose.shoulderRElevated),
        armAbducted: pose.shoulderRAbductionDeg > 20,
        armSupported: false,
        lowerArmPos: elbR >= 60 && elbR <= 100 ? 1 : 2,
        lowerArmCrossMidline: Boolean(pose.forearmRCrossMidline),
        wristPos: wristAbs === 0 ? 1 : wristAbs <= 15 ? 2 : 3,
        wristDeviated: Math.abs(pose.wristRDeviationDeg) > 10,
        wristTwist: Math.abs(pose.forearmRPronationDeg) > 45 ? 2 : 1,
        muscleUseA: freqPerMin >= 4 ? 1 : 0,
        forceLoadA: forceScore,
      },
      left: {
        upperArmPos: upperPosL,
        shoulderRaised: Boolean(pose.shoulderRElevated),
        armAbducted: pose.shoulderLAbductionDeg > 20,
        armSupported: false,
        lowerArmPos: elbL >= 60 && elbL <= 100 ? 1 : 2,
        lowerArmCrossMidline: false,
        wristPos: Math.abs(pose.wristLFlexionDeg ?? 0) <= 15 ? 2 : 3,
        wristDeviated: false,
        wristTwist: 1,
        muscleUseA: freqPerMin >= 4 ? 1 : 0,
        forceLoadA: forceScore,
      },
      neckPos:
        pose.neckFlexionDeg < -2
          ? 4
          : pose.neckFlexionDeg <= 10
            ? 1
            : pose.neckFlexionDeg <= 20
              ? 2
              : 3,
      neckRotated: Math.abs(pose.neckTwistDeg) >= 10,
      neckSideBending: Math.abs(pose.neckLateralDeg) >= 10,
      trunkPos:
        trunkAbs <= 3 ? 1 : trunkAbs <= 20 ? 2 : trunkAbs <= 60 ? 3 : 4,
      trunkTwisted: Math.abs(pose.trunkTwistDeg) >= 10,
      trunkSideBending: Math.abs(pose.trunkLateralDeg) >= 10,
      legsPos: pose.stanceMode === 'one_leg' ? 2 : 1,
      muscleUseB: freqPerMin >= 4 ? 1 : 0,
      forceLoadB: forceScore,
      cycleDurationSec: Math.max(4, Math.round(60 / Math.max(0.5, freqPerMin))),
      postureHoldTimeSec: 6,
    };
  } else if (methodId === MethodId.OWAS) {
    const twisted = Math.abs(pose.trunkTwistDeg) >= 15 || Math.abs(pose.trunkLateralDeg) >= 15;
    const bent = pose.trunkFlexionDeg >= 20;
    const back: 1 | 2 | 3 | 4 = bent && twisted ? 4 : twisted ? 3 : bent ? 2 : 1;
    const rAbove = pose.shoulderRFlexionDeg >= 90 || pose.shoulderRAbductionDeg >= 90;
    const lAbove = pose.shoulderLFlexionDeg >= 90 || pose.shoulderLAbductionDeg >= 90;
    const arms: 1 | 2 | 3 = rAbove && lAbove ? 3 : rAbove || lAbove ? 2 : 1;
    const legs: 1 | 2 | 3 | 4 | 5 | 6 | 7 =
      pose.stanceMode === 'seated'
        ? 1
        : pose.stanceMode === 'kneeling'
          ? 6
          : kneeMax >= 35
            ? 4
            : 2;
    const loadCode: 1 | 2 | 3 = loadKg > 20 ? 3 : loadKg > 10 ? 2 : 1;
    tab.payloads[MethodId.OWAS] = {
      observations: [
        {
          id: 'owas-avatar-1',
          taskPhase: taskLabel,
          back,
          arms,
          legs,
          load: loadCode,
          frequencyCount: Math.max(1, Math.round(freqPerMin * 5)),
        },
      ],
    };
  } else if (methodId === MethodId.LMC_295) {
    const vertZone =
      vOrigCm >= 135
        ? 'sobre_hombro'
        : vOrigCm >= 72
          ? 'nudillos_a_hombro'
          : vOrigCm >= 30
            ? 'espinilla_a_nudillos'
            : 'suelo_a_espinilla';
    const horizZone =
      hOrigCm <= 30 ? 'proximo_30' : hOrigCm <= 60 ? 'intermedio_30_60' : 'alejado_60_80';
    tab.payloads[MethodId.LMC_295] = {
      ...tab.payloads[MethodId.LMC_295],
      actualWeightKg: loadKg,
      liftsPerHour: Math.round(freqPerMin * 60),
      verticalZone: vertZone,
      horizontalZone: horizZone,
      originHeightCm: vOrigCm,
      destHeightCm: dualMode ? vDestCm : vOrigCm,
      asymmetryOver30Deg: Math.abs(pose.trunkTwistDeg) > 30,
      constrainedCrouchedPosture: kneeMax > 60,
      poorCoupling: coupling === 'malo',
    };
  } else if (methodId === MethodId.SNOOK) {
    const snapFreqs: Array<0.2 | 0.5 | 1 | 2 | 3 | 4 | 5 | 6 | 8> = [0.2, 0.5, 1, 2, 3, 4, 5, 6, 8];
    const nearestFreq = snapFreqs.reduce((prev, curr) =>
      Math.abs(curr - freqPerMin) < Math.abs(prev - freqPerMin) ? curr : prev,
    );
    tab.payloads[MethodId.SNOOK] = {
      ...tab.payloads[MethodId.SNOOK],
      operationType: 'levantamiento',
      actualWeightKg: loadKg,
      liftFrequencyPerMin: nearestFreq,
      liftHeightZone:
        vOrigCm >= 145
          ? 'sobre_cabeza'
          : vOrigCm >= 95
            ? 'hombros'
            : 'rodillas_o_inferior',
    };
  } else if (methodId === MethodId.OCRA_CHECKLIST) {
    const shScore = shMax > 80 ? 12 : shMax > 45 ? 6 : 2;
    const wristScore = wristAbs > 45 ? 8 : wristAbs > 20 ? 4 : 0;
    tab.payloads[MethodId.OCRA_CHECKLIST] = {
      ...tab.payloads[MethodId.OCRA_CHECKLIST],
      mode: 'clasico_bilateral',
      right: {
        ...tab.payloads[MethodId.OCRA_CHECKLIST].right,
        frequencyFactor: Math.min(10, Math.round(freqPerMin * 1.2)),
        forceFactor: loadKg >= 8 ? 8 : loadKg >= 3 ? 4 : 2,
        shoulderScore: shScore,
        elbowScore: Math.abs(pose.forearmRPronationDeg) > 60 ? 4 : 2,
        wristScore,
        handGripScore: pose.handGripMode === 'pinch' ? 4 : 2,
      },
    };
  } else if (methodId === MethodId.JSI) {
    tab.payloads[MethodId.JSI] = {
      ...tab.payloads[MethodId.JSI],
      ieIntensity: loadKg >= 12 ? 4 : loadKg >= 6 ? 3 : loadKg >= 2 ? 2 : 1,
      epmEffortsScore: freqPerMin >= 20 ? 5 : freqPerMin >= 15 ? 4 : freqPerMin >= 9 ? 3 : freqPerMin >= 4 ? 2 : 1,
      pmWristPosture: wristAbs >= 45 ? 5 : wristAbs >= 25 ? 4 : wristAbs >= 10 ? 3 : 2,
    };
  }

  return tab;
}

export const AvatarTesterWorkspace: React.FC<AvatarTesterWorkspaceProps> = ({
  onBackToEvaluator,
  onAddTestedTabToStudy,
  onOpenEnvironmentalWorkspace,
}) => {
  const [selectedIdealPostureId, setSelectedIdealPostureId] =
    useState<IdealPostureId>('ideal_lift_squat');
  const [selectedCeneaCaseId, setSelectedCeneaCaseId] =
    useState<CeneaSampleCaseId>('cenea_mmc_almacen');
  const [selectedMethod, setSelectedMethod] = useState<MethodId>(MethodId.NIOSH);
  const [taskDescription, setTaskDescription] = useState<string>(
    'Levantamiento higiénico con rodillas flexionadas y espalda recta hacia zona segura',
  );
  const [dualViewMode, setDualViewMode] = useState<boolean>(true);
  const [activePhaseEdit, setActivePhaseEdit] = useState<'origin' | 'destination'>('origin');
  const [autoIkEnabled, setAutoIkEnabled] = useState<boolean>(true);
  const [symmetryArmsAndLegs, setSymmetryArmsAndLegs] = useState<boolean>(true);
  const [paramGroupTab, setParamGroupTab] = useState<
    'carga_ik' | 'tronco_cuello' | 'brazos_manos' | 'piernas_pies' | 'camara_texto'
  >('carga_ik');

  // Cotas espaciales y parámetros de tarea para Origen y Destino (por defecto: técnica higiénica)
  const [vOrigCm, setVOrigCm] = useState<number>(28);
  const [hOrigCm, setHOrigCm] = useState<number>(28);
  const [vDestCm, setVDestCm] = useState<number>(78);
  const [hDestCm, setHDestCm] = useState<number>(26);
  const [workerHeightCm, setWorkerHeightCm] = useState<number>(172);
  const [loadWeightKg, setLoadWeightKg] = useState<number>(12);
  const [freqPerMin, setFreqPerMin] = useState<number>(2);
  const [coupling, setCoupling] = useState<'bueno' | 'regular' | 'malo'>('bueno');
  const [durationCat, setDurationCat] = useState<'le_1h' | '1_to_2h' | '2_to_8h'>('le_1h');

  // Postura 3D completa para Fase 1 (Origen: Levantamiento Ideal) y Fase 2 (Destino: Zona Nudillos-Cintura)
  const [originPose, setOriginPose] = useState<PosturePose3D>(() =>
    getIdealPostureById('ideal_lift_squat').buildPose(172, 12),
  );

  const [destPose, setDestPose] = useState<PosturePose3D>(() =>
    getIdealPostureById('ideal_carry_waist').buildPose(172, 12),
  );

  // Cámara, órbita y textos de figura
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('sagittal_right');
  const [focusZone, setFocusZone] = useState<FocusZone>('full_body');
  const [orbit, setOrbit] = useState<CameraOrbitOverride>(DEFAULT_ORBIT_OVERRIDE);
  const [customHeaderTitle, setCustomHeaderTitle] = useState<string>(
    'Simulación Biomecánica 3D · Postura Ideal y Reglas Ergonómicas',
  );
  const [customFooterNote, setCustomFooterNote] = useState<string>(
    'Cinemática anatómica sobre avatar PBR (.glb)',
  );

  // Barra de corrección rápida por texto libre
  const [quickTextInput, setQuickTextInput] = useState<string>(
    'v 28, h 28, tronco 16, rodillas 112, peso 12',
  );
  const [quickTextFeedback, setQuickTextFeedback] = useState<string>('');
  const [addedBanner, setAddedBanner] = useState<string>('');
  const [glbReadyTick, setGlbReadyTick] = useState<number>(0);

  const canvasOriginRef = useRef<HTMLCanvasElement>(null);
  const canvasDestRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; az0: number; el0: number } | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStateRef = useRef<{ startDist: number; startZoom: number } | null>(null);

  useEffect(() => {
    void ensureAvatarGlbLoaded();
    const unsub = subscribeAvatarGlbLoaded(() => setGlbReadyTick((t) => t + 1));
    return unsub;
  }, []);

  const currentPose = activePhaseEdit === 'origin' ? originPose : destPose;
  const setCurrentPose = (updater: (prev: PosturePose3D) => PosturePose3D) => {
    if (activePhaseEdit === 'origin' || !dualViewMode) {
      setOriginPose(updater);
    } else {
      setDestPose(updater);
    }
  };

  const updatePoseField = <K extends keyof PosturePose3D>(key: K, val: PosturePose3D[K]) => {
    setCurrentPose((prev) => {
      const next: PosturePose3D = { ...prev, [key]: val };
      if (symmetryArmsAndLegs) {
        if (key === 'shoulderRFlexionDeg') next.shoulderLFlexionDeg = val as number;
        if (key === 'shoulderLFlexionDeg') next.shoulderRFlexionDeg = val as number;
        if (key === 'shoulderRAbductionDeg') next.shoulderLAbductionDeg = val as number;
        if (key === 'shoulderLAbductionDeg') next.shoulderRAbductionDeg = val as number;
        if (key === 'elbowRFlexionDeg') next.elbowLFlexionDeg = val as number;
        if (key === 'elbowLFlexionDeg') next.elbowRFlexionDeg = val as number;
        if (key === 'wristRFlexionDeg') next.wristLFlexionDeg = val as number;
        if (key === 'hipRFlexionDeg') next.hipLFlexionDeg = val as number;
        if (key === 'hipLFlexionDeg') next.hipRFlexionDeg = val as number;
        if (key === 'kneeRFlexionDeg') next.kneeLFlexionDeg = val as number;
        if (key === 'kneeLFlexionDeg') next.kneeRFlexionDeg = val as number;
        if (key === 'ankleRDorsiflexionDeg') next.ankleLDorsiflexionDeg = val as number;
        if (key === 'ankleLDorsiflexionDeg') next.ankleRDorsiflexionDeg = val as number;
      }
      return next;
    });
  };

  // Resolver automáticamente brazos/tronco/rodillas cuando cambia V o H con Cinemática Inversa activa
  const applyIkForPhase = (
    phase: 'origin' | 'destination',
    nextV: number,
    nextH: number,
    trunkHint?: number,
    kneeHint?: number,
    nextLoadKg = loadWeightKg,
    nextStature = workerHeightCm,
    liftStyle: LiftPostureStyle = 'hygienic_squat',
  ) => {
    const basePose = phase === 'origin' ? originPose : destPose;
    const solved = solveAvatarLiftPoseForTarget({
      vCm: nextV,
      hCm: nextH,
      workerHeightCm: nextStature,
      trunkFlexHintDeg: trunkHint ?? basePose.trunkFlexionDeg,
      kneeFlexHintDeg: kneeHint ?? basePose.kneeRFlexionDeg,
      asymmetryDeg: basePose.trunkTwistDeg,
      loadKg: nextLoadKg,
      liftStyle,
    });
    const merged: PosturePose3D = {
      ...solved.pose,
      prop: basePose.prop ?? 'box_load',
    };
    if (phase === 'origin') {
      setOriginPose(merged);
    } else {
      setDestPose(merged);
    }
  };

  const handleChangeActiveV = (nextV: number) => {
    // Al mover V con IK activa se prioriza la regla básica: rodillas flexionadas y espalda recta
    const idealTrunkForV = nextV < 50 ? 16 : nextV < 85 ? 10 : 4;
    const idealKneesForV = nextV < 38 ? 112 : nextV < 60 ? 78 : nextV < 82 ? 32 : 6;
    if (activePhaseEdit === 'origin' || !dualViewMode) {
      setVOrigCm(nextV);
      if (autoIkEnabled) {
        applyIkForPhase(
          'origin',
          nextV,
          hOrigCm,
          idealTrunkForV,
          idealKneesForV,
          loadWeightKg,
          workerHeightCm,
          'hygienic_squat',
        );
      }
    } else {
      setVDestCm(nextV);
      if (autoIkEnabled) {
        applyIkForPhase(
          'destination',
          nextV,
          hDestCm,
          idealTrunkForV,
          idealKneesForV,
          loadWeightKg,
          workerHeightCm,
          'hygienic_squat',
        );
      }
    }
  };

  const handleChangeActiveH = (nextH: number) => {
    if (activePhaseEdit === 'origin' || !dualViewMode) {
      setHOrigCm(nextH);
      if (autoIkEnabled) applyIkForPhase('origin', vOrigCm, nextH);
    } else {
      setHDestCm(nextH);
      if (autoIkEnabled) applyIkForPhase('destination', vDestCm, nextH);
    }
  };

  const handleSelectIdealPosture = (postureId: IdealPostureId) => {
    setSelectedIdealPostureId(postureId);
    const spec = getIdealPostureById(postureId);
    const builtPose = spec.buildPose(workerHeightCm, spec.loadKg);

    setSelectedMethod(spec.recommendedMethod);
    setCameraPreset(spec.recommendedCamera);
    setFocusZone(spec.focusZone);
    setOrbit(DEFAULT_ORBIT_OVERRIDE);
    setLoadWeightKg(spec.loadKg);
    setTaskDescription(spec.shortName.replace(/^\d+\.\s*/, ''));

    const targetPhase = dualViewMode ? activePhaseEdit : 'origin';
    if (targetPhase === 'origin') {
      setVOrigCm(spec.vCm);
      setHOrigCm(spec.hCm);
      setOriginPose(builtPose);
    } else {
      setVDestCm(spec.vCm);
      setHDestCm(spec.hCm);
      setDestPose(builtPose);
    }

    setQuickTextInput(
      `v ${spec.vCm}, h ${spec.hCm}, tronco ${Math.round(builtPose.trunkFlexionDeg)}, rodillas ${Math.round(builtPose.kneeRFlexionDeg)}, peso ${spec.loadKg}`,
    );
    setQuickTextFeedback(
      `Postura cargada en ${targetPhase === 'origin' ? 'Foto 1 (Origen)' : 'Foto 2 (Destino)'}: ${spec.shortName}`,
    );
  };

  const handleCompareBadVsIdealLift = () => {
    const badSpec = getIdealPostureById('contrast_bad_stoop_lift');
    const idealSpec = getIdealPostureById('ideal_lift_squat');
    setSelectedIdealPostureId('ideal_lift_squat');
    setDualViewMode(true);
    setActivePhaseEdit('destination');
    setSelectedMethod(MethodId.NIOSH);
    setCameraPreset('sagittal_right');
    setFocusZone('full_body');
    setOrbit(DEFAULT_ORBIT_OVERRIDE);
    setLoadWeightKg(14);
    setVOrigCm(badSpec.vCm);
    setHOrigCm(badSpec.hCm);
    setVDestCm(idealSpec.vCm);
    setHDestCm(idealSpec.hCm);
    setOriginPose(badSpec.buildPose(workerHeightCm, 14));
    setDestPose(idealSpec.buildPose(workerHeightCm, 14));
    setTaskDescription(
      'Contraste biomecánico: Levantamiento incorrecto (espalda doblada) vs. Levantamiento ideal (rodillas flexionadas + espalda recta)',
    );
    setQuickTextFeedback(
      'Comparación activada: Foto 1 = Incorrecta (tronco doblado, piernas rectas) · Foto 2 = Ideal (rodillas flexionadas 112°, espalda recta 16°)',
    );
  };

  const handleLoadCeneaCaseInAvatar = (caseId: CeneaSampleCaseId) => {
    setSelectedCeneaCaseId(caseId);
    const spec = getCeneaSampleCaseById(caseId);
    const origFrame = buildCeneaSampleFrameSpec(spec, 0, workerHeightCm);
    const destFrame = buildCeneaSampleFrameSpec(spec, 1, workerHeightCm);

    setDualViewMode(true);
    setActivePhaseEdit('origin');
    setCameraPreset(spec.cameraPreset);
    setFocusZone('full_body');
    setOrbit(spec.orbit);
    setLoadWeightKg(spec.loadWeightKg);
    setFreqPerMin(spec.frequencyPerMin);
    setCoupling(spec.couplingQuality);
    setDurationCat(spec.durationCategory);
    setVOrigCm(spec.vOriginCm);
    setHOrigCm(spec.hOriginCm);
    setVDestCm(spec.vDestCm);
    setHDestCm(spec.hDestCm);
    setOriginPose(origFrame.panelSpec.pose);
    setDestPose(destFrame.panelSpec.pose);
    setTaskDescription(spec.title);
    if (spec.id === 'cenea_empuje_traccion') {
      setSelectedMethod(MethodId.SNOOK);
    } else if (spec.id === 'cenea_ocra_repetitivos') {
      setSelectedMethod(MethodId.OCRA_CHECKLIST);
    } else {
      setSelectedMethod(MethodId.NIOSH);
    }
    setQuickTextFeedback(
      `Caso práctico cargado en Origen y Destino: ${spec.shortLabel}`,
    );
  };

  const handleApplyPreset = (
    preset:
      | 'floor_low'
      | 'shin_mid'
      | 'waist'
      | 'above_shoulders'
      | 'dual_lift_full'
      | 'neutral_stand'
      | 'seated_desk'
      | 'bin_to_cart_12_3',
  ) => {
    if (preset === 'dual_lift_full') {
      setDualViewMode(true);
      setSelectedIdealPostureId('ideal_lift_squat');
      setVOrigCm(28);
      setHOrigCm(28);
      setVDestCm(122);
      setHDestCm(32);
      setOriginPose(
        solveAvatarLiftPoseForTarget({
          vCm: 28,
          hCm: 28,
          workerHeightCm,
          trunkFlexHintDeg: 16,
          kneeFlexHintDeg: 112,
          loadKg: loadWeightKg,
          liftStyle: 'hygienic_squat',
        }).pose,
      );
      setDestPose(
        solveAvatarLiftPoseForTarget({
          vCm: 122,
          hCm: 32,
          workerHeightCm,
          trunkFlexHintDeg: 4,
          kneeFlexHintDeg: 6,
          loadKg: loadWeightKg,
          liftStyle: 'hygienic_squat',
        }).pose,
      );
      return;
    }

    if (preset === 'bin_to_cart_12_3') {
      setSelectedMethod(MethodId.REBA);
      setCameraPreset('sagittal_right');
      setFocusZone('full_body');
      setOrbit(DEFAULT_ORBIT_OVERRIDE);
      setLoadWeightKg(10);
      const binPose = makeNeutralPose({
        stanceMode: 'standing',
        prop: 'bin_to_cart',
        trunkFlexionDeg: 58,
        trunkLateralDeg: 8,
        trunkTwistDeg: 22,
        neckFlexionDeg: 22,
        shoulderRFlexionDeg: 66,
        shoulderLFlexionDeg: 62,
        shoulderRAbductionDeg: 10,
        shoulderLAbductionDeg: 10,
        elbowRFlexionDeg: 26,
        elbowLFlexionDeg: 28,
        forearmRPronationDeg: 35,
        wristRFlexionDeg: 18,
        wristLFlexionDeg: 16,
        wristRDeviationDeg: 12,
        handGripMode: 'power_grip',
        hipRFlexionDeg: 18,
        kneeRFlexionDeg: 26,
        ankleRDorsiflexionDeg: 10,
        hipLFlexionDeg: 16,
        kneeLFlexionDeg: 24,
        ankleLDorsiflexionDeg: 9,
        loadKg: 10,
      });
      if (activePhaseEdit === 'origin' || !dualViewMode) {
        setVOrigCm(42);
        setHOrigCm(55);
        setOriginPose(binPose);
      } else {
        setVDestCm(35);
        setHDestCm(48);
        setDestPose(binPose);
      }
      setTaskDescription('Caso Fig. 12.3: Extracción bimanual de bultos (10 kg) desde bin hacia carro');
      return;
    }

    if (preset === 'neutral_stand') {
      const p = makeNeutralPose({ prop: 'none', stanceMode: 'standing' });
      setCurrentPose(() => p);
      return;
    }

    if (preset === 'seated_desk') {
      handleSelectIdealPosture('ideal_seated_office');
      return;
    }

    const mapPreset: Record<
      'floor_low' | 'shin_mid' | 'waist' | 'above_shoulders',
      { v: number; h: number; t: number; k: number }
    > = {
      floor_low: { v: 28, h: 28, t: 16, k: 112 },
      shin_mid: { v: 44, h: 30, t: 14, k: 78 },
      waist: { v: 78, h: 26, t: 4, k: 6 },
      above_shoulders: { v: 122, h: 32, t: 4, k: 6 },
    };
    const cfg = mapPreset[preset];
    if (activePhaseEdit === 'origin' || !dualViewMode) {
      setVOrigCm(cfg.v);
      setHOrigCm(cfg.h);
      applyIkForPhase('origin', cfg.v, cfg.h, cfg.t, cfg.k, loadWeightKg, workerHeightCm, 'hygienic_squat');
    } else {
      setVDestCm(cfg.v);
      setHDestCm(cfg.h);
      applyIkForPhase('destination', cfg.v, cfg.h, cfg.t, cfg.k, loadWeightKg, workerHeightCm, 'hygienic_squat');
    }
  };

  const handleRunQuickTextCommand = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const parsed = parseAvatarQuickTextCorrection(quickTextInput);
    if (parsed.loadKg !== undefined) {
      setLoadWeightKg(parsed.loadKg);
    }

    const targetPhase = dualViewMode ? activePhaseEdit : 'origin';
    const curV = targetPhase === 'origin' ? vOrigCm : vDestCm;
    const curH = targetPhase === 'origin' ? hOrigCm : hDestCm;
    const nextV = parsed.vCm ?? curV;
    const nextH = parsed.hCm ?? curH;

    if (targetPhase === 'origin') {
      setVOrigCm(nextV);
      setHOrigCm(nextH);
    } else {
      setVDestCm(nextV);
      setHDestCm(nextH);
    }

    if (parsed.useIkTarget) {
      const basePose = targetPhase === 'origin' ? originPose : destPose;
      const solved = solveAvatarLiftPoseForTarget({
        vCm: nextV,
        hCm: nextH,
        workerHeightCm,
        trunkFlexHintDeg: parsed.posePatch.trunkFlexionDeg ?? basePose.trunkFlexionDeg,
        kneeFlexHintDeg: parsed.posePatch.kneeRFlexionDeg ?? basePose.kneeRFlexionDeg,
        asymmetryDeg: parsed.posePatch.trunkTwistDeg ?? basePose.trunkTwistDeg,
        loadKg: parsed.loadKg ?? loadWeightKg,
        liftStyle: parsed.liftStyle ?? 'hygienic_squat',
      });
      const merged: PosturePose3D = {
        ...solved.pose,
        ...parsed.posePatch,
      };
      // Si el usuario no especificó hombro/codo manual en el texto, conservar los calculados por IK para (H, V)
      if (parsed.posePatch.shoulderRFlexionDeg === undefined) {
        merged.shoulderRFlexionDeg = solved.shoulderFlexionDeg;
        merged.shoulderLFlexionDeg = solved.shoulderFlexionDeg;
      }
      if (parsed.posePatch.elbowRFlexionDeg === undefined) {
        merged.elbowRFlexionDeg = solved.elbowFlexionDeg;
        merged.elbowLFlexionDeg = solved.elbowFlexionDeg;
      }
      if (parsed.posePatch.trunkFlexionDeg === undefined) {
        merged.trunkFlexionDeg = solved.trunkFlexionDeg;
      }
      if (parsed.posePatch.kneeRFlexionDeg === undefined) {
        merged.kneeRFlexionDeg = solved.kneeFlexionDeg;
        merged.kneeLFlexionDeg = solved.kneeFlexionDeg;
      }
      if (targetPhase === 'origin') setOriginPose(merged);
      else setDestPose(merged);
    } else {
      setCurrentPose((prev) => ({ ...prev, ...parsed.posePatch }));
    }

    setQuickTextFeedback(
      parsed.summaryApplied.length > 0
        ? `Aplicado en ${targetPhase === 'origin' ? 'Origen' : 'Destino'}: ${parsed.summaryApplied.join(' · ')}`
        : 'Escriba pares parámetro-valor, ej: "levantamiento ideal", "arrodillado", "v 28, h 28, tronco 16, rodillas 112"',
    );
  };

  // Construcción de paneles 3D en tiempo real
  const originPanelSpec: Panel3DSpec = useMemo(
    () => ({
      subTitle: dualViewMode
        ? `Origen · V=${vOrigCm} cm, H=${hOrigCm} cm`
        : `${customHeaderTitle} · V=${vOrigCm} cm, H=${hOrigCm} cm`,
      scoreBadge: dualViewMode ? `Origen V=${vOrigCm} cm` : `${selectedMethod}`,
      focusZone,
      cameraPreset,
      pose: { ...originPose, loadKg: loadWeightKg },
      angleArcs: [
        {
          joint: 'l5s1',
          refType: 'vertical_up',
          toJoint: 'c7',
          radiusPx: 38,
          label: `Tronco ${Math.round(originPose.trunkFlexionDeg)}°`,
        },
        {
          joint: 'kneeR',
          refType: 'vertical_down',
          toJoint: 'ankleR',
          radiusPx: 34,
          label: `Rodilla ${Math.round(originPose.kneeRFlexionDeg)}°`,
        },
      ],
      forceVectors:
        (originPose.prop === 'box_load' ||
          originPose.prop === 'bin_to_cart' ||
          originPose.prop === 'pallet_cooler') &&
        loadWeightKg > 0
          ? [
              {
                atJoint: 'handR',
                dx: 0,
                dy: 1,
                lengthPx: 38,
                label: `${loadWeightKg} kg`,
              },
            ]
          : [],
      dimensions: [
        {
          fromJoint: 'ankleR',
          toJoint: 'handR',
          axis: 'horizontal',
          label: `H = ${hOrigCm} cm`,
        },
      ],
      noteBottom: `${customFooterNote} · Hombro ${Math.round(originPose.shoulderRFlexionDeg)}° · Codo ${Math.round(originPose.elbowRFlexionDeg)}°`,
    }),
    [
      dualViewMode,
      vOrigCm,
      hOrigCm,
      customHeaderTitle,
      selectedMethod,
      focusZone,
      cameraPreset,
      originPose,
      loadWeightKg,
      customFooterNote,
    ],
  );

  const destPanelSpec: Panel3DSpec = useMemo(
    () => ({
      subTitle: `Destino · V=${vDestCm} cm, H=${hDestCm} cm`,
      scoreBadge: `Destino V=${vDestCm} cm`,
      focusZone,
      cameraPreset,
      pose: { ...destPose, loadKg: loadWeightKg },
      angleArcs: [
        {
          joint: 'l5s1',
          refType: 'vertical_up',
          toJoint: 'c7',
          radiusPx: 38,
          label: `Tronco ${Math.round(destPose.trunkFlexionDeg)}°`,
        },
        {
          joint: 'kneeR',
          refType: 'vertical_down',
          toJoint: 'ankleR',
          radiusPx: 34,
          label: `Rodilla ${Math.round(destPose.kneeRFlexionDeg)}°`,
        },
      ],
      forceVectors:
        (destPose.prop === 'box_load' ||
          destPose.prop === 'bin_to_cart' ||
          destPose.prop === 'pallet_cooler') &&
        loadWeightKg > 0
          ? [
              {
                atJoint: 'handR',
                dx: 0,
                dy: 1,
                lengthPx: 38,
                label: `${loadWeightKg} kg`,
              },
            ]
          : [],
      dimensions: [
        {
          fromJoint: 'ankleR',
          toJoint: 'handR',
          axis: 'horizontal',
          label: `H = ${hDestCm} cm`,
        },
      ],
      noteBottom: `${customFooterNote} · Hombro ${Math.round(destPose.shoulderRFlexionDeg)}° · Codo ${Math.round(destPose.elbowRFlexionDeg)}°`,
    }),
    [vDestCm, hDestCm, focusZone, cameraPreset, destPose, loadWeightKg, customFooterNote],
  );

  // Renderizado en demanda a los canvas interactivos (escala adaptativa móvil 1.35x vs escritorio 2x)
  useEffect(() => {
    void glbReadyTick;
    let rafId = 0;
    rafId = window.requestAnimationFrame(() => {
      const isMobileScreen = typeof window !== 'undefined' && window.innerWidth < 768;
      const dprScale = isMobileScreen ? 1.35 : 2;
      if (canvasOriginRef.current) {
        renderInteractivePose3DToCanvas(
          originPanelSpec,
          canvasOriginRef.current,
          dualViewMode ? 480 : 680,
          460,
          orbit,
          dprScale,
          'anatomical_skin',
          false,
        );
      }
      if (dualViewMode && canvasDestRef.current) {
        renderInteractivePose3DToCanvas(
          destPanelSpec,
          canvasDestRef.current,
          480,
          460,
          orbit,
          dprScale,
          'anatomical_skin',
          false,
        );
      }
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [originPanelSpec, destPanelSpec, dualViewMode, orbit, glbReadyTick]);

  // Evaluación normativa en tiempo real según el método elegido en la lista desplegable
  const evaluatedPreview: { tab: StudyTab; result: MethodEvaluationResult } = useMemo(() => {
    const poseForEval =
      dualViewMode && activePhaseEdit === 'destination' ? destPose : originPose;
    const tab = buildMethodTabFromAvatarState({
      methodId: selectedMethod,
      taskLabel: taskDescription,
      pose: poseForEval,
      vOrigCm,
      hOrigCm,
      vDestCm,
      hDestCm,
      loadKg: loadWeightKg,
      freqPerMin,
      coupling,
      durationCat,
      dualMode: dualViewMode,
    });
    const result = evaluateStudyTab(tab);
    return { tab, result };
  }, [
    selectedMethod,
    taskDescription,
    dualViewMode,
    activePhaseEdit,
    originPose,
    destPose,
    vOrigCm,
    hOrigCm,
    vDestCm,
    hDestCm,
    loadWeightKg,
    freqPerMin,
    coupling,
    durationCat,
  ]);

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      pinchStateRef.current = { startDist: Math.max(20, dist), startZoom: orbit.zoom };
      dragRef.current = null;
    } else if (activePointersRef.current.size === 1) {
      pinchStateRef.current = null;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        az0: orbit.azimuthDeg,
        el0: orbit.elevationDeg,
      };
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (activePointersRef.current.size === 2 && pinchStateRef.current) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const ratio = dist / pinchStateRef.current.startDist;
      const nextZoom = Math.max(0.65, Math.min(2.1, Math.round(pinchStateRef.current.startZoom * ratio * 100) / 100));
      setOrbit((prev) => ({ ...prev, zoom: nextZoom }));
      return;
    }

    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOrbit((prev) => ({
      ...prev,
      azimuthDeg: Math.max(-180, Math.min(180, Math.round(dragRef.current!.az0 + dx * 0.45))),
      elevationDeg: Math.max(-45, Math.min(65, Math.round(dragRef.current!.el0 - dy * 0.35))),
    }));
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      pinchStateRef.current = null;
    }
    if (activePointersRef.current.size === 0) {
      dragRef.current = null;
    }
  };

  const handleDownloadSnapshotPng = () => {
    const targetCanvas =
      dualViewMode && activePhaseEdit === 'destination'
        ? canvasDestRef.current
        : canvasOriginRef.current;
    if (!targetCanvas) return;
    const url = targetCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `avatar_3d_${selectedMethod.toLowerCase()}_${activePhaseEdit}.png`;
    a.click();
  };

  const handleSendToStudyReport = () => {
    const builtTab = { ...evaluatedPreview.tab };
    const photos: StudyPhoto[] = [];
    if (canvasOriginRef.current) {
      photos.push({
        id: `ph-test-orig-${Date.now()}`,
        name: 'avatar_3d_origen.png',
        dataUrl: canvasOriginRef.current.toDataURL('image/png'),
        caption: `Simulación 3D (${selectedMethod}) · Origen V=${vOrigCm} cm, H=${hOrigCm} cm · Tronco ${Math.round(originPose.trunkFlexionDeg)}°, Rodillas ${Math.round(originPose.kneeRFlexionDeg)}°, Hombros ${Math.round(originPose.shoulderRFlexionDeg)}°, Codos ${Math.round(originPose.elbowRFlexionDeg)}°.`,
        annotations: [],
      });
    }
    if (dualViewMode && canvasDestRef.current) {
      photos.push({
        id: `ph-test-dest-${Date.now() + 1}`,
        name: 'avatar_3d_destino.png',
        dataUrl: canvasDestRef.current.toDataURL('image/png'),
        caption: `Simulación 3D (${selectedMethod}) · Destino V=${vDestCm} cm, H=${hDestCm} cm · Tronco ${Math.round(destPose.trunkFlexionDeg)}°, Rodillas ${Math.round(destPose.kneeRFlexionDeg)}°, Hombros ${Math.round(destPose.shoulderRFlexionDeg)}°, Codos ${Math.round(destPose.elbowRFlexionDeg)}°.`,
        annotations: [],
      });
    }
    builtTab.photos = photos;
    builtTab.implementationDeadline = evaluatedPreview.result.recommendedDeadline;
    builtTab.evaluatorObservations = `Pestaña generada y calibrada en el Laboratorio de Testeo de Avatar 3D (${evaluatedPreview.result.methodName}). Resultado: ${evaluatedPreview.result.primaryScoreText} (${evaluatedPreview.result.riskLabel}).`;
    builtTab.correctiveMeasures = evaluatedPreview.result.suggestedMeasures
      .map((m, i) => `${i + 1}. ${m}`)
      .join('\n');

    onAddTestedTabToStudy(builtTab);
    setAddedBanner(
      `Se agregó la pestaña "${builtTab.tabLabel}" al estudio lista para exportar en PDF o Word.`,
    );
    window.setTimeout(() => setAddedBanner(''), 4500);
  };

  const activeV = dualViewMode && activePhaseEdit === 'destination' ? vDestCm : vOrigCm;
  const activeH = dualViewMode && activePhaseEdit === 'destination' ? hDestCm : hOrigCm;
  const sevStyle = getSeverityStyles(evaluatedPreview.result.severity);

  const posturalMethodsOnly = useMemo(
    () =>
      METHOD_CATALOG.filter(
        (m) => m.category !== 'ambiente_termico' && m.category !== 'vibraciones',
      ),
    [],
  );

  return (
    <div className="space-y-4">
      {/* 1. VISUALIZACIÓN 3D DEL AVATAR EN LA PARTE SUPERIOR (OPTIMIZADA PARA CELULARES Y ESCRITORIO) */}
      <section className="bg-white border border-slate-300 rounded-lg p-3.5 sm:p-5 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-sky-800 font-semibold">
              <span>Motor 3D Táctil Optimizado</span>
              <span aria-hidden="true">·</span>
              <span>1 dedo: rotar 360°</span>
              <span aria-hidden="true">·</span>
              <span>2 dedos: pellizcar zoom</span>
            </div>
            <h1 className="text-base sm:text-xl font-bold text-slate-900 tracking-tight">
              Visualización Superior del Avatar 3D y Calibración Postural
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBackToEvaluator}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Volver
            </button>
            <button
              type="button"
              onClick={handleDownloadSnapshotPng}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-sky-700" />
              PNG 3D
            </button>
            <button
              type="button"
              onClick={handleSendToStudyReport}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-md bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Agregar al Informe
            </button>
          </div>
        </div>

        {addedBanner && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-md px-3.5 py-2 text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{addedBanner}</span>
          </div>
        )}

        {/* BARRA DE MODO 1/2 AVATARES Y FASE ACTIVA ENCIMA DEL LIENZO 3D */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md border border-slate-200">
              <button
                type="button"
                onClick={() => setDualViewMode(false)}
                className={`px-3 py-1.5 min-h-[36px] rounded text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                  !dualViewMode ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                1 Avatar
              </button>
              <button
                type="button"
                onClick={() => setDualViewMode(true)}
                className={`px-3 py-1.5 min-h-[36px] rounded text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                  dualViewMode ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                2 Avatares (Origen → Destino)
              </button>
            </div>

            {dualViewMode && (
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setActivePhaseEdit('origin')}
                  className={`px-2.5 py-1.5 min-h-[36px] rounded font-semibold cursor-pointer ${
                    activePhaseEdit === 'origin'
                      ? 'bg-sky-700 text-white'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  Editar Origen
                </button>
                <button
                  type="button"
                  onClick={() => setActivePhaseEdit('destination')}
                  className={`px-2.5 py-1.5 min-h-[36px] rounded font-semibold cursor-pointer ${
                    activePhaseEdit === 'destination'
                      ? 'bg-sky-700 text-white'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  Editar Destino
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono tabular-nums text-slate-600 hidden sm:inline">
              Az {orbit.azimuthDeg}° · El {orbit.elevationDeg}° · Zoom {orbit.zoom.toFixed(2)}×
            </span>
            <button
              type="button"
              onClick={() => setOrbit(DEFAULT_ORBIT_OVERRIDE)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
              title="Restablecer ángulo y zoom de cámara"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Centrar Cámara
            </button>
          </div>
        </div>

        {/* LIENZO 3D SUPERIOR TÁCTIL */}
        {dualViewMode ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div
              onClick={() => setActivePhaseEdit('origin')}
              className={`rounded-md border p-2 transition-colors cursor-pointer ${
                activePhaseEdit === 'origin'
                  ? 'border-sky-600 bg-sky-50/30 ring-2 ring-sky-600/20'
                  : 'border-slate-200 bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-semibold text-slate-800 mb-1.5 px-1">
                <span>Foto 1 · Postura Origen (Inicio)</span>
                <span className="font-mono text-sky-800 tabular-nums">V = {vOrigCm} cm · H = {hOrigCm} cm</span>
              </div>
              <canvas
                ref={canvasOriginRef}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerCancel={handleCanvasPointerUp}
                className="w-full h-auto bg-white rounded border border-slate-200 cursor-grab active:cursor-grabbing touch-none select-none"
              />
            </div>

            <div
              onClick={() => setActivePhaseEdit('destination')}
              className={`rounded-md border p-2 transition-colors cursor-pointer ${
                activePhaseEdit === 'destination'
                  ? 'border-sky-600 bg-sky-50/30 ring-2 ring-sky-600/20'
                  : 'border-slate-200 bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-semibold text-slate-800 mb-1.5 px-1">
                <span>Foto 2 · Postura Destino (Final)</span>
                <span className="font-mono text-sky-800 tabular-nums">V = {vDestCm} cm · H = {hDestCm} cm</span>
              </div>
              <canvas
                ref={canvasDestRef}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerCancel={handleCanvasPointerUp}
                className="w-full h-auto bg-white rounded border border-slate-200 cursor-grab active:cursor-grabbing touch-none select-none"
              />
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-2 flex justify-center">
            <canvas
              ref={canvasOriginRef}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerUp}
              className="w-full max-w-[680px] h-auto bg-white rounded border border-slate-200 cursor-grab active:cursor-grabbing touch-none select-none"
            />
          </div>
        )}
      </section>

      {/* 2. CONTROLES DE MÉTODO, MUESTRAS PRÁCTICAS Y AJUSTE ARTICULAR DEBAJO DEL VISOR 3D */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* COLUMNA IZQUIERDA (7 COLS): MÉTODO POSTURAL, CASOS PRÁCTICOS, POSTURAS IDEALES Y TABLA */}
        <div className="xl:col-span-7 space-y-4">
          <section className="bg-white border border-slate-300 rounded-lg p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
              <div className="md:col-span-6 space-y-1">
                <label className="block text-xs font-semibold text-slate-800">
                  Método de Carga Postural / Biomecánica (Cap. 4, 5, 6 y 9)
                </label>
                <select
                  value={selectedMethod}
                  onChange={(e) => setSelectedMethod(e.target.value as MethodId)}
                  className="w-full min-h-[40px] border border-slate-300 rounded-md px-3 py-2 text-xs font-medium bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                >
                  {posturalMethodsOnly.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.shortName} — {m.categoryLabel} ({m.chapterRef})
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-6 space-y-1">
                <label className="block text-xs font-semibold text-slate-800">
                  Tarea / Fase Evaluada
                </label>
                <input
                  type="text"
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  className="w-full min-h-[40px] border border-slate-300 rounded-md px-3 py-2 text-xs bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>
            </div>

            {/* Nota de coherencia metodológica para Fanger / Ambiente Térmico */}
            {onOpenEnvironmentalWorkspace && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-950">
                <span>
                  Los métodos de <strong>Confort Térmico (Fanger ISO 7730)</strong>, <strong>WBGT</strong> y{' '}
                  <strong>Vibraciones</strong> cuentan con su pestaña específica separada de carga postural.
                </span>
                <button
                  type="button"
                  onClick={onOpenEnvironmentalWorkspace}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-amber-400 bg-white hover:bg-amber-100 text-xs font-semibold text-amber-950 whitespace-nowrap cursor-pointer"
                >
                  <Thermometer className="w-3.5 h-3.5 text-amber-700" />
                  Abrir Térmico · Fanger / Físicos
                </button>
              </div>
            )}

            {/* MENÚ DESPLEGABLE DE MUESTRAS DE CASOS PRÁCTICOS INDUSTRIALES (PLAYLIST DE REFERENCIA) */}
            <div className="border-t border-slate-200 pt-3.5 space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
                <div className="md:col-span-8 space-y-1">
                  <label className="block text-xs font-semibold text-slate-800">
                    Calibración con Casos Prácticos Industriales (8 Muestras de Referencia)
                  </label>
                  <select
                    value={selectedCeneaCaseId}
                    onChange={(e) => handleLoadCeneaCaseInAvatar(e.target.value as CeneaSampleCaseId)}
                    className="w-full min-h-[40px] border border-slate-300 rounded-md px-3 py-2 text-xs font-medium bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                  >
                    {CENEA_SAMPLE_VIDEOS_CATALOG.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.shortLabel}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-4">
                  <button
                    type="button"
                    onClick={() => handleLoadCeneaCaseInAvatar(selectedCeneaCaseId)}
                    className="w-full min-h-[40px] px-3 py-2 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
                  >
                    Cargar Muestra en Avatar
                  </button>
                </div>
              </div>
            </div>

            {/* CATÁLOGO DE POSTURAS IDEALES Y REGLAS ERGONÓMICAS BÁSICAS */}
            <div className="border-t border-slate-200 pt-3.5 space-y-2.5">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
                <div className="md:col-span-7 space-y-1">
                  <label className="block text-xs font-semibold text-slate-800">
                    Catálogo de Posturas Ideales y Bipedestación Normativa ({IDEAL_POSTURE_CATALOG.length} Posturas)
                  </label>
                  <select
                    value={selectedIdealPostureId}
                    onChange={(e) => handleSelectIdealPosture(e.target.value as IdealPostureId)}
                    className="w-full min-h-[40px] border border-slate-300 rounded-md px-3 py-2 text-xs font-medium bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                  >
                    {IDEAL_POSTURE_CATALOG.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.shortName} — {item.category}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectIdealPosture(selectedIdealPostureId)}
                    className="px-3 py-2 min-h-[40px] rounded-md bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Cargar Ideal
                  </button>
                  <button
                    type="button"
                    onClick={handleCompareBadVsIdealLift}
                    className="px-3 py-2 min-h-[40px] rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Incorrecta vs. Ideal
                  </button>
                </div>
              </div>

              {(() => {
                const activeIdealSpec = getIdealPostureById(selectedIdealPostureId);
                return (
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-1.5 text-xs">
                    <div className="flex flex-wrap items-center gap-2 text-slate-600">
                      <span className="font-semibold text-slate-900">{activeIdealSpec.shortName}</span>
                      <span aria-hidden="true">·</span>
                      <span>{activeIdealSpec.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{activeIdealSpec.normativeRef}</span>
                    </div>
                    <p className="text-slate-700">{activeIdealSpec.description}</p>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-slate-800 pt-0.5 list-disc list-inside">
                      {activeIdealSpec.ergonomicRules.map((rule, idx) => (
                        <li key={idx} className="leading-snug">
                          {rule}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
            </div>

            {/* ACCESOS DIRECTOS Y CORRECCIÓN POR TEXTO */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => handleSelectIdealPosture('ideal_standing_neutral')}
                className="px-2.5 py-1.5 min-h-[36px] rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium whitespace-nowrap cursor-pointer"
              >
                Bipedestación Neutra
              </button>
              <button
                type="button"
                onClick={() => handleSelectIdealPosture('ideal_lift_squat')}
                className="px-2.5 py-1.5 min-h-[36px] rounded border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-950 text-xs font-semibold whitespace-nowrap cursor-pointer"
              >
                Levantamiento Ideal
              </button>
              <button
                type="button"
                onClick={() => handleSelectIdealPosture('ideal_driver_comfort')}
                className="px-2.5 py-1.5 min-h-[36px] rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium whitespace-nowrap cursor-pointer"
              >
                Conductor Automóvil (Fig. 13.2)
              </button>
              <button
                type="button"
                onClick={() => handleSelectIdealPosture('ideal_kneeling_knight')}
                className="px-2.5 py-1.5 min-h-[36px] rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium whitespace-nowrap cursor-pointer"
              >
                Caballero (Fig. 11.1)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('bin_to_cart_12_3')}
                className="px-2.5 py-1.5 min-h-[36px] rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium whitespace-nowrap cursor-pointer"
              >
                Bin a Carro (Fig. 12.3)
              </button>
            </div>

            <form onSubmit={handleRunQuickTextCommand} className="space-y-1 pt-1">
              <label className="block text-xs font-semibold text-slate-800">
                Corrección Rápida por Texto (ej. &quot;v 28, h 28, tronco 16, rodillas 110, peso 14&quot;)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={quickTextInput}
                  onChange={(e) => setQuickTextInput(e.target.value)}
                  placeholder="v 28, h 28, tronco 16, rodillas 110, codos 35..."
                  className="flex-1 min-h-[40px] border border-slate-300 rounded-md px-3 py-2 text-xs font-mono bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 min-h-[40px] rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
                >
                  Aplicar
                </button>
              </div>
            </form>

            {quickTextFeedback && (
              <p className="text-xs text-sky-900 bg-sky-50 border border-sky-200 rounded px-3 py-1.5 font-mono">
                {quickTextFeedback}
              </p>
            )}
          </section>

          {/* RESULTADO NORMATIVO EN VIVO DEL MÉTODO SELECCIONADO */}
          <div className="bg-white border border-slate-300 rounded-lg p-4 space-y-3">
            <div className={`rounded-md border p-3.5 ${sevStyle.box}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold">{evaluatedPreview.result.methodName}</span>
                <span className="text-xs font-mono font-semibold">
                  Plazo sugerido: {evaluatedPreview.result.recommendedDeadline}
                </span>
              </div>
              <div className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${sevStyle.scoreText}`}>
                {evaluatedPreview.result.primaryScoreText}
              </div>
              {evaluatedPreview.result.secondaryScoreText && (
                <div className="text-xs font-mono tabular-nums mt-0.5">
                  {evaluatedPreview.result.secondaryScoreText}
                </div>
              )}
              <div className={`text-xs font-semibold mt-1 ${sevStyle.labelText}`}>
                {evaluatedPreview.result.riskLabel} · {evaluatedPreview.result.actionLevelText}
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-md">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-800 font-semibold">
                    <th className="py-2 px-3">Variable / Multiplicador Calculado</th>
                    <th className="py-2 px-3 text-right">Valor</th>
                    <th className="py-2 px-3">Detalle Técnico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {evaluatedPreview.result.breakdownRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-1.5 px-3 font-medium text-slate-800">{row.parameter}</td>
                      <td className="py-1.5 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                        {row.value}
                      </td>
                      <td className="py-1.5 px-3 text-slate-600">{row.reference || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA (5 COLS): TODOS LOS PARÁMETROS POR SLIDER Y CAJA DE TEXTO */}
        <div className="xl:col-span-5 bg-white border border-slate-300 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-sky-700" />
              <h2 className="text-sm font-bold text-slate-900">
                Parámetros Editables (Slider + Texto)
                {dualViewMode
                  ? activePhaseEdit === 'origin'
                    ? ' · Origen'
                    : ' · Destino'
                  : ''}
              </h2>
            </div>

            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={symmetryArmsAndLegs}
                onChange={(e) => setSymmetryArmsAndLegs(e.target.checked)}
                className="rounded accent-sky-700"
              />
              <span>Simetría Der/Izq</span>
            </label>
          </div>

          {/* PESTAÑAS INTERNAS DE PARÁMETROS */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 bg-slate-100 p-1.5 rounded-md border border-slate-200">
            {[
              { id: 'carga_ik', label: '1. Carga (H, V)' },
              { id: 'tronco_cuello', label: '2. Tronco y Cuello' },
              { id: 'brazos_manos', label: '3. Brazos y Manos' },
              { id: 'piernas_pies', label: '4. Piernas y Pies' },
              { id: 'camara_texto', label: '5. Cámara y Rótulos' },
            ].map((tabItem) => (
              <button
                key={tabItem.id}
                type="button"
                onClick={() => setParamGroupTab(tabItem.id as typeof paramGroupTab)}
                className={`px-2 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
                  paramGroupTab === tabItem.id
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tabItem.label}
              </button>
            ))}
          </div>

          {paramGroupTab === 'carga_ik' && (
            <div className="space-y-2.5">
              <div className="bg-sky-50/80 border border-sky-200 rounded-md p-2.5 flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-sky-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoIkEnabled}
                    onChange={(e) => setAutoIkEnabled(e.target.checked)}
                    className="rounded accent-sky-700"
                  />
                  <span>Cinemática Inversa Automática al mover V o H</span>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    applyIkForPhase(
                      dualViewMode ? activePhaseEdit : 'origin',
                      activeV,
                      activeH,
                    )
                  }
                  className="px-2.5 py-1 rounded bg-sky-700 hover:bg-sky-800 text-white text-[11px] font-semibold whitespace-nowrap cursor-pointer"
                >
                  Recalcular IK
                </button>
              </div>

              <DualNumericSlider
                label="Altura Vertical de Carga V (suelo=20, cintura=95, hombros=145)"
                unit=" cm"
                value={activeV}
                min={5}
                max={185}
                onChange={handleChangeActiveV}
              />

              <DualNumericSlider
                label="Distancia Horizontal Tobillos-Manos H"
                unit=" cm"
                value={activeH}
                min={15}
                max={80}
                onChange={handleChangeActiveH}
              />

              <DualNumericSlider
                label="Peso Real de la Carga"
                unit=" kg"
                value={loadWeightKg}
                min={0}
                max={55}
                step={0.5}
                onChange={(v) => {
                  setLoadWeightKg(v);
                  updatePoseField('loadKg', v);
                }}
              />

              <DualNumericSlider
                label="Estatura Antropométrica del Operario"
                unit=" cm"
                value={workerHeightCm}
                min={145}
                max={205}
                onChange={(st) => {
                  setWorkerHeightCm(st);
                  if (autoIkEnabled) {
                    applyIkForPhase(
                      dualViewMode ? activePhaseEdit : 'origin',
                      activeV,
                      activeH,
                      undefined,
                      undefined,
                      loadWeightKg,
                      st,
                    );
                  }
                }}
              />

              <DualNumericSlider
                label="Frecuencia de Acciones / Levantamientos"
                unit="/min"
                value={freqPerMin}
                min={0.2}
                max={25}
                step={0.2}
                onChange={setFreqPerMin}
              />

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <label className="space-y-1 text-xs">
                  <span className="font-medium text-slate-700">Calidad de Agarre</span>
                  <select
                    value={coupling}
                    onChange={(e) => setCoupling(e.target.value as 'bueno' | 'regular' | 'malo')}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white text-xs"
                  >
                    <option value="bueno">Bueno (asas óptimas)</option>
                    <option value="regular">Regular</option>
                    <option value="malo">Malo (sin asas)</option>
                  </select>
                </label>

                <label className="space-y-1 text-xs">
                  <span className="font-medium text-slate-700">Duración Exposición</span>
                  <select
                    value={durationCat}
                    onChange={(e) =>
                      setDurationCat(e.target.value as 'le_1h' | '1_to_2h' | '2_to_8h')
                    }
                    className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white text-xs"
                  >
                    <option value="le_1h">Corta (≤ 1 h)</option>
                    <option value="1_to_2h">Moderada (1 a 2 h)</option>
                    <option value="2_to_8h">Larga (2 a 8 h)</option>
                  </select>
                </label>
              </div>

              <label className="block space-y-1 text-xs pt-1">
                <span className="font-medium text-slate-700">Objeto / Elemento 3D en Escena</span>
                <select
                  value={currentPose.prop || 'none'}
                  onChange={(e) => updatePoseField('prop', e.target.value as ScenePropType)}
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white text-xs"
                >
                  {SCENE_PROP_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {paramGroupTab === 'tronco_cuello' && (
            <div className="space-y-2.5">
              <DualNumericSlider
                label="Flexión (+) / Extensión (-) Sagital de Tronco"
                unit="°"
                value={currentPose.trunkFlexionDeg}
                min={-25}
                max={105}
                onChange={(v) => updatePoseField('trunkFlexionDeg', v)}
              />
              <DualNumericSlider
                label="Inclinación Lateral de Tronco (+Der / -Izq)"
                unit="°"
                value={currentPose.trunkLateralDeg}
                min={-45}
                max={45}
                onChange={(v) => updatePoseField('trunkLateralDeg', v)}
              />
              <DualNumericSlider
                label="Giro Axial / Asimetría de Tronco"
                unit="°"
                value={currentPose.trunkTwistDeg}
                min={-90}
                max={90}
                onChange={(v) => updatePoseField('trunkTwistDeg', v)}
              />
              <DualNumericSlider
                label="Flexión (+) / Extensión (-) de Cuello"
                unit="°"
                value={currentPose.neckFlexionDeg}
                min={-40}
                max={55}
                onChange={(v) => updatePoseField('neckFlexionDeg', v)}
              />
              <DualNumericSlider
                label="Inclinación Lateral de Cuello"
                unit="°"
                value={currentPose.neckLateralDeg}
                min={-40}
                max={40}
                onChange={(v) => updatePoseField('neckLateralDeg', v)}
              />
              <DualNumericSlider
                label="Rotación Axial de Cuello"
                unit="°"
                value={currentPose.neckTwistDeg}
                min={-75}
                max={75}
                onChange={(v) => updatePoseField('neckTwistDeg', v)}
              />
            </div>
          )}

          {paramGroupTab === 'brazos_manos' && (
            <div className="space-y-2.5 max-h-[540px] overflow-y-auto pr-1">
              <DualNumericSlider
                label="Flexión Hombro Derecho (local respecto a tronco)"
                unit="°"
                value={currentPose.shoulderRFlexionDeg}
                min={-45}
                max={175}
                onChange={(v) => updatePoseField('shoulderRFlexionDeg', v)}
              />
              <DualNumericSlider
                label="Abducción (+) / Aducción (-) Hombro Derecho"
                unit="°"
                value={currentPose.shoulderRAbductionDeg}
                min={-25}
                max={160}
                onChange={(v) => updatePoseField('shoulderRAbductionDeg', v)}
              />
              <DualNumericSlider
                label="Flexión Codo Derecho (0° = recto, 90° = L)"
                unit="°"
                value={currentPose.elbowRFlexionDeg}
                min={0}
                max={145}
                onChange={(v) => updatePoseField('elbowRFlexionDeg', v)}
              />
              <DualNumericSlider
                label="Pronación (+) / Supinación (-) Antebrazo"
                unit="°"
                value={currentPose.forearmRPronationDeg}
                min={-90}
                max={90}
                onChange={(v) => updatePoseField('forearmRPronationDeg', v)}
              />
              <DualNumericSlider
                label="Flexión Palmar (+) / Extensión (-) Muñeca Derecha"
                unit="°"
                value={currentPose.wristRFlexionDeg}
                min={-70}
                max={80}
                onChange={(v) => updatePoseField('wristRFlexionDeg', v)}
              />
              <DualNumericSlider
                label="Desviación Cubital (+) / Radial (-) Muñeca"
                unit="°"
                value={currentPose.wristRDeviationDeg}
                min={-30}
                max={40}
                onChange={(v) => updatePoseField('wristRDeviationDeg', v)}
              />

              {!symmetryArmsAndLegs && (
                <>
                  <DualNumericSlider
                    label="Flexión Hombro Izquierdo"
                    unit="°"
                    value={currentPose.shoulderLFlexionDeg}
                    min={-45}
                    max={175}
                    onChange={(v) => updatePoseField('shoulderLFlexionDeg', v)}
                  />
                  <DualNumericSlider
                    label="Abducción Hombro Izquierdo"
                    unit="°"
                    value={currentPose.shoulderLAbductionDeg}
                    min={-25}
                    max={160}
                    onChange={(v) => updatePoseField('shoulderLAbductionDeg', v)}
                  />
                  <DualNumericSlider
                    label="Flexión Codo Izquierdo"
                    unit="°"
                    value={currentPose.elbowLFlexionDeg}
                    min={0}
                    max={145}
                    onChange={(v) => updatePoseField('elbowLFlexionDeg', v)}
                  />
                </>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                <label className="inline-flex items-center gap-2 border border-slate-200 rounded p-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(currentPose.shoulderRElevated)}
                    onChange={(e) => updatePoseField('shoulderRElevated', e.target.checked)}
                    className="accent-sky-700"
                  />
                  <span>Hombro Elevado</span>
                </label>

                <label className="inline-flex items-center gap-2 border border-slate-200 rounded p-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(currentPose.forearmRCrossMidline)}
                    onChange={(e) => updatePoseField('forearmRCrossMidline', e.target.checked)}
                    className="accent-sky-700"
                  />
                  <span>Cruza Línea Media</span>
                </label>
              </div>

              <label className="block space-y-1 text-xs">
                <span className="font-medium text-slate-700">Tipo de Agarre de Dedos</span>
                <select
                  value={currentPose.handGripMode || 'power_grip'}
                  onChange={(e) =>
                    updatePoseField(
                      'handGripMode',
                      e.target.value as 'relaxed' | 'pinch' | 'power_grip',
                    )
                  }
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white text-xs"
                >
                  <option value="power_grip">Agarre de fuerza (puño sobre carga)</option>
                  <option value="pinch">Pinza digital fina</option>
                  <option value="relaxed">Mano abierta relajada</option>
                </select>
              </label>
            </div>
          )}

          {paramGroupTab === 'piernas_pies' && (
            <div className="space-y-2.5">
              <label className="block space-y-1 text-xs">
                <span className="font-medium text-slate-700">Modo de Sustentación / Piernas</span>
                <select
                  value={currentPose.stanceMode || 'standing'}
                  onChange={(e) =>
                    updatePoseField(
                      'stanceMode',
                      e.target.value as PosturePose3D['stanceMode'],
                    )
                  }
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white text-xs"
                >
                  <option value="standing">Bipedestación (De pie)</option>
                  <option value="squatting">Cuclillas / Flexión de piernas</option>
                  <option value="seated">Sentado</option>
                  <option value="kneeling">Arrodillado</option>
                  <option value="one_leg">Apoyo unipodal / Inestable</option>
                </select>
              </label>

              <DualNumericSlider
                label="Flexión Cadera Derecha (respecto a vertical)"
                unit="°"
                value={currentPose.hipRFlexionDeg}
                min={-30}
                max={125}
                onChange={(v) => updatePoseField('hipRFlexionDeg', v)}
              />
              <DualNumericSlider
                label="Flexión Rodilla Derecha (0° = recta)"
                unit="°"
                value={currentPose.kneeRFlexionDeg}
                min={0}
                max={135}
                onChange={(v) => updatePoseField('kneeRFlexionDeg', v)}
              />
              <DualNumericSlider
                label="Dorsiflexión (+) / Flexión Plantar (-) Tobillo Der."
                unit="°"
                value={currentPose.ankleRDorsiflexionDeg}
                min={-40}
                max={40}
                onChange={(v) => updatePoseField('ankleRDorsiflexionDeg', v)}
              />

              {!symmetryArmsAndLegs && (
                <>
                  <DualNumericSlider
                    label="Flexión Cadera Izquierda"
                    unit="°"
                    value={currentPose.hipLFlexionDeg}
                    min={-30}
                    max={125}
                    onChange={(v) => updatePoseField('hipLFlexionDeg', v)}
                  />
                  <DualNumericSlider
                    label="Flexión Rodilla Izquierda"
                    unit="°"
                    value={currentPose.kneeLFlexionDeg}
                    min={0}
                    max={135}
                    onChange={(v) => updatePoseField('kneeLFlexionDeg', v)}
                  />
                  <DualNumericSlider
                    label="Dorsiflexión Tobillo Izquierdo"
                    unit="°"
                    value={currentPose.ankleLDorsiflexionDeg}
                    min={-40}
                    max={40}
                    onChange={(v) => updatePoseField('ankleLDorsiflexionDeg', v)}
                  />
                </>
              )}
            </div>
          )}

          {paramGroupTab === 'camara_texto' && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <label className="space-y-1">
                  <span className="font-medium text-slate-700">Plano de Cámara</span>
                  <select
                    value={cameraPreset}
                    onChange={(e) => setCameraPreset(e.target.value as CameraPreset)}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white text-xs"
                  >
                    {CAMERA_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="font-medium text-slate-700">Zona de Enfoque</span>
                  <select
                    value={focusZone}
                    onChange={(e) => setFocusZone(e.target.value as FocusZone)}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 bg-white text-xs"
                  >
                    {FOCUS_OPTIONS.map((fz) => (
                      <option key={fz.value} value={fz.value}>
                        {fz.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <DualNumericSlider
                label="Órbita Horizontal (Azimut)"
                unit="°"
                value={orbit.azimuthDeg}
                min={-180}
                max={180}
                onChange={(az) => setOrbit((p) => ({ ...p, azimuthDeg: az }))}
              />
              <DualNumericSlider
                label="Elevación de Cámara"
                unit="°"
                value={orbit.elevationDeg}
                min={-45}
                max={65}
                onChange={(el) => setOrbit((p) => ({ ...p, elevationDeg: el }))}
              />
              <DualNumericSlider
                label="Zoom de Encuadre"
                unit="x"
                value={orbit.zoom}
                min={0.55}
                max={2.2}
                step={0.05}
                onChange={(zm) => setOrbit((p) => ({ ...p, zoom: zm }))}
              />

              <label className="block space-y-1 text-xs">
                <span className="font-medium text-slate-700">Título Superior del Lienzo (Texto)</span>
                <input
                  type="text"
                  value={customHeaderTitle}
                  onChange={(e) => setCustomHeaderTitle(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                />
              </label>

              <label className="block space-y-1 text-xs">
                <span className="font-medium text-slate-700">Nota Técnica Inferior (Texto)</span>
                <input
                  type="text"
                  value={customFooterNote}
                  onChange={(e) => setCustomFooterNote(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                />
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Eye,
  Image as ImageIcon,
  RotateCcw,
  Sliders,
} from 'lucide-react';
import { RebaData, RebaSideInput, RulaData, RulaSideInput } from '../types/ergonomics';
import { AngleArcAnnotation, CameraPreset, FocusZone, Panel3DSpec } from '../types/figurePlan';
import {
  BiomechSegmentCategory,
  BOOK_FIGURE_CATALOG,
  CHAPTER4_SENT_PLATES,
  Chapter4SentPlateMeta,
  getEffectiveFigurePhotoUrl,
  makeNeutralPose,
  subscribeFigurePhotoOverrides,
  subscribeFigurePoseOverrides,
} from '../utils/figurePlanCatalog';
import {
  CameraOrbitOverride,
  DEFAULT_ORBIT_OVERRIDE,
  renderInteractivePose3DToCanvas,
  subscribeAvatarGlbLoaded,
} from '../utils/biomech3dRenderer';
import { InteractivePhotoGoniometer } from './InteractivePhotoGoniometer';

export type Biomech3DControlProps =
  | {
      method: 'RULA';
      data: RulaData;
      activeSide: 'right' | 'left';
      onChange: (next: RulaData) => void;
    }
  | {
      method: 'REBA';
      data: RebaData;
      activeSide: 'right' | 'left';
      onChange: (next: RebaData) => void;
    }
  | {
      method: 'OWAS';
      back: 1 | 2 | 3 | 4;
      arms: 1 | 2 | 3;
      legs: 1 | 2 | 3 | 4 | 5 | 6 | 7;
      load: 1 | 2 | 3;
      onChangeCodes: (patch: {
        back?: 1 | 2 | 3 | 4;
        arms?: 1 | 2 | 3;
        legs?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
        load?: 1 | 2 | 3;
      }) => void;
    };

type InspectionViewMode = 'pure_3d' | 'split_compare' | 'goniometer';

const SEGMENT_TABS: { id: BiomechSegmentCategory; label: string }[] = [
  { id: 'upper_arm', label: 'Brazo y Hombro' },
  { id: 'lower_arm', label: 'Antebrazo y Codo' },
  { id: 'wrist', label: 'Muñeca y Giro' },
  { id: 'neck', label: 'Cuello' },
  { id: 'trunk', label: 'Tronco / Espalda' },
  { id: 'legs', label: 'Piernas y Soporte' },
];

const CAMERA_PRESETS_SHORT: { id: CameraPreset; label: string }[] = [
  { id: 'sagittal_right', label: 'Sagital Der. (0°)' },
  { id: 'sagittal_left', label: 'Sagital Izq.' },
  { id: 'frontal', label: 'Frontal' },
  { id: 'top', label: 'Superior' },
  { id: 'isometric', label: 'Isométrica' },
  { id: 'perspective_oblique', label: 'Oblicua (Fig. 4.1)' },
];

function mapArmDegToScore(deg: number): 1 | 2 | 3 | 4 {
  if (deg > 90) return 4;
  if (deg > 45) return 3;
  if (deg > 20 || deg < -20) return 2;
  return 1;
}

function canonicalArmDeg(score: 1 | 2 | 3 | 4): number {
  if (score === 1) return 8;
  if (score === 2) return 34;
  if (score === 3) return 68;
  return 112;
}

function mapForearmDegToScore(deg: number): 1 | 2 {
  return deg >= 60 && deg <= 100 ? 1 : 2;
}

function canonicalForearmDeg(score: 1 | 2): number {
  return score === 1 ? 82 : 122;
}

function mapRulaWristDegToScore(deg: number): 1 | 2 | 3 {
  const a = Math.abs(deg);
  if (a <= 2) return 1;
  if (a <= 15) return 2;
  return 3;
}

function canonicalRulaWristDeg(score: 1 | 2 | 3): number {
  if (score === 1) return 0;
  if (score === 2) return 11;
  return 28;
}

function mapRebaWristDegToScore(deg: number): 1 | 2 {
  return Math.abs(deg) <= 15 ? 1 : 2;
}

function canonicalRebaWristDeg(score: 1 | 2): number {
  return score === 1 ? 8 : 28;
}

function mapRulaNeckDegToScore(deg: number): 1 | 2 | 3 | 4 {
  if (deg < 0) return 4;
  if (deg <= 10) return 1;
  if (deg <= 20) return 2;
  return 3;
}

function canonicalRulaNeckDeg(score: 1 | 2 | 3 | 4): number {
  if (score === 1) return 6;
  if (score === 2) return 16;
  if (score === 3) return 32;
  return -18;
}

function mapRebaNeckDegToScore(deg: number): 1 | 2 {
  return deg >= 0 && deg <= 20 ? 1 : 2;
}

function canonicalRebaNeckDeg(score: 1 | 2): number {
  return score === 1 ? 10 : 30;
}

function mapRulaTrunkDegToScore(deg: number, isSeated: boolean): 1 | 2 | 3 | 4 {
  if (isSeated && Math.abs(deg) <= 5) return 1;
  if (deg <= 20) return 2;
  if (deg <= 60) return 3;
  return 4;
}

function canonicalRulaTrunkDeg(score: 1 | 2 | 3 | 4): number {
  if (score === 1) return 0;
  if (score === 2) return 14;
  if (score === 3) return 40;
  return 72;
}

function mapRebaTrunkDegToScore(deg: number): 1 | 2 | 3 | 4 {
  if (Math.abs(deg) <= 2) return 1;
  if (deg >= -20 && deg <= 20) return 2;
  if (deg < -20 || (deg > 20 && deg <= 60)) return 3;
  return 4;
}

function canonicalRebaTrunkDeg(score: 1 | 2 | 3 | 4): number {
  if (score === 1) return 0;
  if (score === 2) return 14;
  if (score === 3) return 40;
  return 72;
}

function mapRebaKneeDegToScore(deg: number): 0 | 1 | 2 {
  if (deg < 30) return 0;
  if (deg <= 60) return 1;
  return 2;
}

function canonicalRebaKneeDeg(score: 0 | 1 | 2): number {
  if (score === 0) return 10;
  if (score === 1) return 45;
  return 78;
}

function getDefaultPlateForMethodSegment(
  method: 'RULA' | 'REBA' | 'OWAS',
  segment: BiomechSegmentCategory,
): string {
  if (method === 'RULA') {
    switch (segment) {
      case 'upper_arm':
        return 'fig-4-04a';
      case 'lower_arm':
        return 'fig-4-07';
      case 'wrist':
        return 'fig-4-10a';
      case 'neck':
        return 'fig-4-13a';
      case 'trunk':
        return 'fig-4-15a';
      case 'legs':
        return 'fig-4-17';
      default:
        return 'fig-4-01';
    }
  }
  if (method === 'REBA') {
    switch (segment) {
      case 'upper_arm':
        return 'fig-4-22a';
      case 'lower_arm':
        return 'fig-4-23';
      case 'wrist':
        return 'fig-4-24';
      case 'neck':
        return 'fig-4-20';
      case 'trunk':
        return 'fig-4-19a';
      case 'legs':
        return 'fig-4-21b';
      default:
        return 'fig-4-19a';
    }
  }
  // OWAS
  switch (segment) {
    case 'upper_arm':
    case 'lower_arm':
    case 'wrist':
      return 'fig-4-28b';
    case 'trunk':
    case 'neck':
      return 'fig-4-27b';
    case 'legs':
      return 'fig-4-29d';
    default:
      return 'fig-4-27b';
  }
}

export const Biomech3DControlPanel: React.FC<Biomech3DControlProps> = (props) => {
  const { method } = props;
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<InspectionViewMode>('pure_3d');
  const [showAngleGuides, setShowAngleGuides] = useState<boolean>(true);
  const [glbReadyTick, setGlbReadyTick] = useState<number>(0);

  const [activeSegment, setActiveSegment] = useState<BiomechSegmentCategory>(
    method === 'REBA' || method === 'OWAS' ? 'trunk' : 'upper_arm',
  );
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('sagittal_right');
  const [focusIsolated, setFocusIsolated] = useState<boolean>(false);
  const [orbit, setOrbit] = useState<CameraOrbitOverride>(DEFAULT_ORBIT_OVERRIDE);
  const [plateFilterMode, setPlateFilterMode] = useState<'method' | 'all'>('method');
  const [selectedPlateId, setSelectedPlateId] = useState<string>(() =>
    getDefaultPlateForMethodSegment(
      method,
      method === 'REBA' || method === 'OWAS' ? 'trunk' : 'upper_arm',
    ),
  );
  const [plateImgFailed, setPlateImgFailed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const unsubGlb = subscribeAvatarGlbLoaded(() => {
      setGlbReadyTick((t) => t + 1);
    });
    const unsubPose = subscribeFigurePoseOverrides(() => {
      setGlbReadyTick((t) => t + 1);
    });
    const unsubPhoto = subscribeFigurePhotoOverrides(() => {
      setGlbReadyTick((t) => t + 1);
    });
    return () => {
      unsubGlb();
      unsubPose();
      unsubPhoto();
    };
  }, []);

  // Continuous kinematic state (degrees) synced bidirectionally with discrete form scores
  const [armFlexDeg, setArmFlexDeg] = useState<number>(34);
  const [elbowFlexDeg, setElbowFlexDeg] = useState<number>(82);
  const [wristFlexDeg, setWristFlexDeg] = useState<number>(11);
  const [neckFlexDeg, setNeckFlexDeg] = useState<number>(16);
  const [trunkFlexDeg, setTrunkFlexDeg] = useState<number>(36);
  const [kneeFlexDeg, setKneeFlexDeg] = useState<number>(12);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; az0: number; el0: number } | null>(null);

  // Sync continuous angles when form discrete choices change externally
  useEffect(() => {
    if (props.method === 'RULA') {
      const side = props.data[props.activeSide];
      setArmFlexDeg((prev) =>
        mapArmDegToScore(prev) === side.upperArmPos ? prev : canonicalArmDeg(side.upperArmPos),
      );
      setElbowFlexDeg((prev) =>
        mapForearmDegToScore(prev) === side.lowerArmPos ? prev : canonicalForearmDeg(side.lowerArmPos),
      );
      setWristFlexDeg((prev) =>
        mapRulaWristDegToScore(prev) === side.wristPos ? prev : canonicalRulaWristDeg(side.wristPos),
      );
      setNeckFlexDeg((prev) =>
        mapRulaNeckDegToScore(prev) === props.data.neckPos ? prev : canonicalRulaNeckDeg(props.data.neckPos),
      );
      const isSeated = props.data.trunkPos === 1;
      setTrunkFlexDeg((prev) =>
        mapRulaTrunkDegToScore(prev, isSeated) === props.data.trunkPos
          ? prev
          : canonicalRulaTrunkDeg(props.data.trunkPos),
      );
      setKneeFlexDeg(props.data.trunkPos === 1 ? 90 : 8);
    } else if (props.method === 'REBA') {
      const side = props.data[props.activeSide];
      setArmFlexDeg((prev) =>
        mapArmDegToScore(prev) === side.upperArmPos ? prev : canonicalArmDeg(side.upperArmPos),
      );
      setElbowFlexDeg((prev) =>
        mapForearmDegToScore(prev) === side.lowerArmPos ? prev : canonicalForearmDeg(side.lowerArmPos),
      );
      setWristFlexDeg((prev) =>
        mapRebaWristDegToScore(prev) === side.wristPos ? prev : canonicalRebaWristDeg(side.wristPos),
      );
      setNeckFlexDeg((prev) =>
        mapRebaNeckDegToScore(prev) === props.data.neckPos ? prev : canonicalRebaNeckDeg(props.data.neckPos),
      );
      setTrunkFlexDeg((prev) =>
        mapRebaTrunkDegToScore(prev) === props.data.trunkPos
          ? prev
          : canonicalRebaTrunkDeg(props.data.trunkPos),
      );
      setKneeFlexDeg((prev) =>
        mapRebaKneeDegToScore(prev) === props.data.legsKneeFlexion
          ? prev
          : canonicalRebaKneeDeg(props.data.legsKneeFlexion),
      );
    } else {
      // OWAS
      setTrunkFlexDeg((prev) => {
        const shouldBend = props.back === 2 || props.back === 4;
        if (shouldBend && prev >= 20) return prev;
        if (!shouldBend && prev < 20) return prev;
        return shouldBend ? 42 : 4;
      });
      setArmFlexDeg((prev) => {
        const shouldElevate = props.arms >= 2;
        if (shouldElevate && prev >= 90) return prev;
        if (!shouldElevate && prev < 90) return prev;
        return shouldElevate ? 118 : 28;
      });
      if (props.legs === 1) setKneeFlexDeg(90);
      else if (props.legs === 4 || props.legs === 5) setKneeFlexDeg(68);
      else if (props.legs === 6) setKneeFlexDeg(95);
      else setKneeFlexDeg(10);
    }
  }, [
    props.method,
    props.method === 'RULA' ? props.data : null,
    props.method === 'RULA' ? props.activeSide : null,
    props.method === 'REBA' ? props.data : null,
    props.method === 'REBA' ? props.activeSide : null,
    props.method === 'OWAS' ? props.back : null,
    props.method === 'OWAS' ? props.arms : null,
    props.method === 'OWAS' ? props.legs : null,
  ]);

  // Switch default plate when active segment changes
  const handleSelectSegment = (seg: BiomechSegmentCategory) => {
    setActiveSegment(seg);
    if (method === 'OWAS' && seg === 'legs') {
      const legCode = props.method === 'OWAS' ? props.legs : 2;
      if (legCode === 1) setSelectedPlateId('fig-4-29a');
      else if (legCode === 2) setSelectedPlateId('fig-4-29b');
      else if (legCode === 3) setSelectedPlateId('fig-4-29c');
      else setSelectedPlateId('fig-4-29d');
    } else if (method === 'OWAS' && seg === 'trunk') {
      const backCode = props.method === 'OWAS' ? props.back : 1;
      setSelectedPlateId(backCode === 1 ? 'fig-4-27a' : 'fig-4-27b');
    } else if (method === 'OWAS' && seg === 'upper_arm') {
      const armCode = props.method === 'OWAS' ? props.arms : 1;
      setSelectedPlateId(armCode === 1 ? 'fig-4-28a' : 'fig-4-28b');
    } else {
      setSelectedPlateId(getDefaultPlateForMethodSegment(method, seg));
    }
  };

  // Filtered sent plates strip
  const visiblePlates = useMemo<Chapter4SentPlateMeta[]>(() => {
    if (plateFilterMode === 'all') return CHAPTER4_SENT_PLATES;
    return CHAPTER4_SENT_PLATES.filter((p) => p.method === method);
  }, [plateFilterMode, method]);

  const activePlate = useMemo<Chapter4SentPlateMeta>(() => {
    void glbReadyTick;
    const base =
      CHAPTER4_SENT_PLATES.find((p) => p.figId === selectedPlateId) ||
      visiblePlates[0] ||
      CHAPTER4_SENT_PLATES[0];
    const spec = BOOK_FIGURE_CATALOG.find((f) => f.id === base.figId);
    const effectiveUrl = (spec ? getEffectiveFigurePhotoUrl(spec) : undefined) || base.url;
    return { ...base, url: effectiveUrl };
  }, [selectedPlateId, visiblePlates, glbReadyTick]);

  const activeCatalogPanels = useMemo<Panel3DSpec[]>(() => {
    void glbReadyTick;
    return BOOK_FIGURE_CATALOG.find((f) => f.id === activePlate.figId)?.panels || [];
  }, [activePlate.figId, glbReadyTick]);

  const handleAdoptCatalogReferenceBody = (refPanel: Panel3DSpec) => {
    const p = refPanel.pose;
    const isLeft = (props.method === 'RULA' || props.method === 'REBA') && props.activeSide === 'left';
    const nextArm = Math.round(isLeft ? p.shoulderLFlexionDeg : p.shoulderRFlexionDeg);
    const nextElb = Math.round(isLeft ? p.elbowLFlexionDeg : p.elbowRFlexionDeg);
    const nextWri = Math.round(isLeft ? (p.wristLFlexionDeg ?? p.wristRFlexionDeg) : p.wristRFlexionDeg);
    const nextNeck = Math.round(p.neckFlexionDeg);
    const nextTrunk = Math.round(p.trunkFlexionDeg);
    const nextKnee = Math.round(p.kneeRFlexionDeg);

    setArmFlexDeg(nextArm);
    setElbowFlexDeg(nextElb);
    setWristFlexDeg(nextWri);
    setNeckFlexDeg(nextNeck);
    setTrunkFlexDeg(nextTrunk);
    setKneeFlexDeg(nextKnee);
    setCameraPreset(refPanel.cameraPreset);
    setOrbit(refPanel.orbitOverride ? { ...refPanel.orbitOverride } : DEFAULT_ORBIT_OVERRIDE);

    if (props.method === 'RULA') {
      const side = props.data[props.activeSide];
      const isSeated = p.stanceMode === 'seated';
      props.onChange({
        ...props.data,
        neckPos: mapRulaNeckDegToScore(nextNeck),
        neckRotated: Math.abs(p.neckTwistDeg || 0) >= 15,
        neckSideBending: Math.abs(p.neckLateralDeg || 0) >= 12,
        trunkPos: mapRulaTrunkDegToScore(nextTrunk, isSeated),
        trunkTwisted: Math.abs(p.trunkTwistDeg || 0) >= 15,
        trunkSideBending: Math.abs(p.trunkLateralDeg || 0) >= 12,
        legsPos: p.stanceMode === 'one_leg' ? 2 : 1,
        [props.activeSide]: {
          ...side,
          upperArmPos: mapArmDegToScore(nextArm),
          armAbducted: (isLeft ? p.shoulderLAbductionDeg : p.shoulderRAbductionDeg) >= 25,
          shoulderRaised: Boolean(p.shoulderRElevated),
          armSupported: p.prop === 'work_desk_support',
          lowerArmPos: mapForearmDegToScore(nextElb),
          lowerArmCrossMidline: Boolean(p.forearmRCrossMidline),
          wristPos: mapRulaWristDegToScore(nextWri),
          wristDeviated: Math.abs(isLeft ? (p.wristLDeviationDeg ?? 0) : p.wristRDeviationDeg) >= 10,
          wristTwist: Math.abs(p.forearmRPronationDeg || 0) >= 55 ? 2 : 1,
        },
      });
    } else if (props.method === 'REBA') {
      const side = props.data[props.activeSide];
      props.onChange({
        ...props.data,
        neckPos: mapRebaNeckDegToScore(nextNeck),
        neckTwistedOrSide: Math.abs(p.neckTwistDeg || 0) >= 15 || Math.abs(p.neckLateralDeg || 0) >= 12,
        trunkPos: mapRebaTrunkDegToScore(nextTrunk),
        trunkTwistedOrSide: Math.abs(p.trunkTwistDeg || 0) >= 15 || Math.abs(p.trunkLateralDeg || 0) >= 12,
        legsBase: p.stanceMode === 'one_leg' ? 2 : 1,
        legsKneeFlexion: mapRebaKneeDegToScore(nextKnee),
        [props.activeSide]: {
          ...side,
          upperArmPos: mapArmDegToScore(nextArm),
          armAbducted: (isLeft ? p.shoulderLAbductionDeg : p.shoulderRAbductionDeg) >= 25,
          shoulderRaised: Boolean(p.shoulderRElevated),
          armSupported: p.prop === 'work_desk_support',
          lowerArmPos: mapForearmDegToScore(nextElb),
          wristPos: mapRebaWristDegToScore(nextWri),
          wristTwistedOrDeviated:
            Math.abs(p.forearmRPronationDeg || 0) >= 50 || Math.abs(p.wristRDeviationDeg || 0) >= 12,
        },
      });
    } else {
      const twisted = Math.abs(p.trunkTwistDeg || 0) >= 15 || Math.abs(p.trunkLateralDeg || 0) >= 15;
      const bent = nextTrunk >= 20;
      const nextBack: 1 | 2 | 3 | 4 = bent ? (twisted ? 4 : 2) : twisted ? 3 : 1;
      const bothUp = p.shoulderRFlexionDeg >= 90 && p.shoulderLFlexionDeg >= 90;
      const oneUp = p.shoulderRFlexionDeg >= 90 || p.shoulderLFlexionDeg >= 90;
      const nextArms: 1 | 2 | 3 = bothUp ? 3 : oneUp ? 2 : 1;
      const nextLegs: 1 | 2 | 3 | 4 | 5 | 6 | 7 =
        p.stanceMode === 'seated'
          ? 1
          : p.stanceMode === 'kneeling'
            ? 6
            : p.stanceMode === 'walking'
              ? 7
              : p.stanceMode === 'one_leg'
                ? nextKnee >= 35
                  ? 5
                  : 3
                : nextKnee >= 35
                  ? 4
                  : 2;
      props.onChangeCodes({ back: nextBack, arms: nextArms, legs: nextLegs });
    }
  };

  // Update form scores from continuous joint degree changes
  const applyArmDegChange = (deg: number) => {
    setArmFlexDeg(deg);
    const nextScore = mapArmDegToScore(deg);
    if (props.method === 'RULA') {
      const side = props.data[props.activeSide];
      if (side.upperArmPos !== nextScore) {
        props.onChange({
          ...props.data,
          [props.activeSide]: { ...side, upperArmPos: nextScore },
        });
      }
    } else if (props.method === 'REBA') {
      const side = props.data[props.activeSide];
      if (side.upperArmPos !== nextScore) {
        props.onChange({
          ...props.data,
          [props.activeSide]: { ...side, upperArmPos: nextScore },
        });
      }
    } else {
      const nextArms: 1 | 2 | 3 = deg >= 90 ? (props.arms === 3 ? 3 : 2) : 1;
      if (nextArms !== props.arms) {
        props.onChangeCodes({ arms: nextArms });
      }
    }
  };

  const applyElbowDegChange = (deg: number) => {
    setElbowFlexDeg(deg);
    const nextScore = mapForearmDegToScore(deg);
    if (props.method === 'RULA') {
      const side = props.data[props.activeSide];
      if (side.lowerArmPos !== nextScore) {
        props.onChange({
          ...props.data,
          [props.activeSide]: { ...side, lowerArmPos: nextScore },
        });
      }
    } else if (props.method === 'REBA') {
      const side = props.data[props.activeSide];
      if (side.lowerArmPos !== nextScore) {
        props.onChange({
          ...props.data,
          [props.activeSide]: { ...side, lowerArmPos: nextScore },
        });
      }
    }
  };

  const applyWristDegChange = (deg: number) => {
    setWristFlexDeg(deg);
    if (props.method === 'RULA') {
      const nextScore = mapRulaWristDegToScore(deg);
      const side = props.data[props.activeSide];
      if (side.wristPos !== nextScore) {
        props.onChange({
          ...props.data,
          [props.activeSide]: { ...side, wristPos: nextScore },
        });
      }
    } else if (props.method === 'REBA') {
      const nextScore = mapRebaWristDegToScore(deg);
      const side = props.data[props.activeSide];
      if (side.wristPos !== nextScore) {
        props.onChange({
          ...props.data,
          [props.activeSide]: { ...side, wristPos: nextScore },
        });
      }
    }
  };

  const applyNeckDegChange = (deg: number) => {
    setNeckFlexDeg(deg);
    if (props.method === 'RULA') {
      const nextScore = mapRulaNeckDegToScore(deg);
      if (props.data.neckPos !== nextScore) {
        props.onChange({ ...props.data, neckPos: nextScore });
      }
    } else if (props.method === 'REBA') {
      const nextScore = mapRebaNeckDegToScore(deg);
      if (props.data.neckPos !== nextScore) {
        props.onChange({ ...props.data, neckPos: nextScore });
      }
    }
  };

  const applyTrunkDegChange = (deg: number) => {
    setTrunkFlexDeg(deg);
    if (props.method === 'RULA') {
      const isSeated = props.data.trunkPos === 1 && Math.abs(deg) <= 5;
      const nextScore = mapRulaTrunkDegToScore(deg, isSeated);
      if (props.data.trunkPos !== nextScore) {
        props.onChange({ ...props.data, trunkPos: nextScore });
      }
    } else if (props.method === 'REBA') {
      const nextScore = mapRebaTrunkDegToScore(deg);
      if (props.data.trunkPos !== nextScore) {
        props.onChange({ ...props.data, trunkPos: nextScore });
      }
    } else {
      const hasTwist = props.back === 3 || props.back === 4;
      const isBent = deg >= 20;
      const nextBack: 1 | 2 | 3 | 4 = isBent ? (hasTwist ? 4 : 2) : hasTwist ? 3 : 1;
      if (nextBack !== props.back) {
        props.onChangeCodes({ back: nextBack });
      }
    }
  };

  const applyKneeDegChange = (deg: number) => {
    setKneeFlexDeg(deg);
    if (props.method === 'REBA') {
      const nextKnee = mapRebaKneeDegToScore(deg);
      if (props.data.legsKneeFlexion !== nextKnee) {
        props.onChange({ ...props.data, legsKneeFlexion: nextKnee });
      }
    } else if (props.method === 'OWAS') {
      if (deg >= 35 && props.legs !== 1 && props.legs !== 6) {
        const nextLegs: 4 | 5 = props.legs === 3 || props.legs === 5 ? 5 : 4;
        if (props.legs !== nextLegs) {
          props.onChangeCodes({ legs: nextLegs });
        }
      } else if (deg < 30 && (props.legs === 4 || props.legs === 5)) {
        props.onChangeCodes({ legs: props.legs === 5 ? 3 : 2 });
      }
    }
  };

  // Apply goniometer angle directly to active segment
  const handleApplyGoniometerAngle = (measuredDeg: number) => {
    if (activeSegment === 'upper_arm') applyArmDegChange(measuredDeg);
    else if (activeSegment === 'lower_arm') applyElbowDegChange(measuredDeg);
    else if (activeSegment === 'wrist') applyWristDegChange(measuredDeg);
    else if (activeSegment === 'neck') applyNeckDegChange(measuredDeg);
    else if (activeSegment === 'trunk') applyTrunkDegChange(measuredDeg);
    else if (activeSegment === 'legs') applyKneeDegChange(measuredDeg);
  };

  // Build synchronized Panel3DSpec from form + continuous joint state
  const livePanelSpec = useMemo<Panel3DSpec>(() => {
    const pose = makeNeutralPose();
    let badgeText = '';
    const isLeftEvaluated =
      (props.method === 'RULA' || props.method === 'REBA') && props.activeSide === 'left';

    if (props.method === 'RULA') {
      const side: RulaSideInput = props.data[props.activeSide];
      const isSeated = props.data.trunkPos === 1;
      pose.stanceMode = isSeated ? 'seated' : props.data.legsPos === 2 ? 'one_leg' : 'standing';
      pose.prop = side.armSupported ? 'work_desk_support' : isSeated ? 'chair' : 'none';
      pose.trunkFlexionDeg = isSeated ? 0 : trunkFlexDeg;
      pose.trunkTwistDeg = props.data.trunkTwisted ? 28 : 0;
      pose.trunkLateralDeg = props.data.trunkSideBending ? 20 : 0;
      pose.neckFlexionDeg = neckFlexDeg;
      pose.neckTwistDeg = props.data.neckRotated ? 34 : 0;
      pose.neckLateralDeg = props.data.neckSideBending ? 22 : 0;

      if (isLeftEvaluated) {
        pose.shoulderLFlexionDeg = armFlexDeg;
        pose.shoulderLAbductionDeg = side.armAbducted ? 42 : 0;
        pose.elbowLFlexionDeg = elbowFlexDeg;
        pose.wristLFlexionDeg = wristFlexDeg;
      } else {
        pose.shoulderRFlexionDeg = armFlexDeg;
        pose.shoulderRAbductionDeg = side.armAbducted ? 42 : 0;
        pose.shoulderRElevated = side.shoulderRaised;
        pose.elbowRFlexionDeg = elbowFlexDeg;
        pose.forearmRCrossMidline = side.lowerArmCrossMidline;
        pose.forearmRPronationDeg = side.wristTwist === 2 ? 82 : 20;
        pose.wristRFlexionDeg = wristFlexDeg;
        pose.wristRDeviationDeg = side.wristDeviated ? 20 : 0;
      }

      if (isSeated) {
        pose.hipRFlexionDeg = 90;
        pose.kneeRFlexionDeg = 90;
        pose.hipLFlexionDeg = 90;
        pose.kneeLFlexionDeg = 90;
      } else if (props.data.legsPos === 2) {
        pose.hipLFlexionDeg = 28;
        pose.kneeLFlexionDeg = 55;
      }

      badgeText = `RULA (${props.activeSide === 'right' ? 'Der.' : 'Izq.'}) · Br:${side.upperArmPos} Ant:${side.lowerArmPos} Muñ:${side.wristPos} · Cu:${props.data.neckPos} Tr:${props.data.trunkPos}`;
    } else if (props.method === 'REBA') {
      const side: RebaSideInput = props.data[props.activeSide];
      pose.stanceMode =
        props.data.legsBase === 2
          ? 'one_leg'
          : kneeFlexDeg > 60
            ? 'squatting'
            : 'standing';
      pose.prop = side.armSupported ? 'work_desk_support' : props.data.loadForce > 0 ? 'box_load' : 'none';
      pose.trunkFlexionDeg = trunkFlexDeg;
      pose.trunkTwistDeg = props.data.trunkTwistedOrSide ? 26 : 0;
      pose.trunkLateralDeg = props.data.trunkTwistedOrSide ? 14 : 0;
      pose.neckFlexionDeg = neckFlexDeg;
      pose.neckTwistDeg = props.data.neckTwistedOrSide ? 30 : 0;

      if (isLeftEvaluated) {
        pose.shoulderLFlexionDeg = armFlexDeg;
        pose.shoulderLAbductionDeg = side.armAbducted ? 42 : 0;
        pose.elbowLFlexionDeg = elbowFlexDeg;
        pose.wristLFlexionDeg = wristFlexDeg;
      } else {
        pose.shoulderRFlexionDeg = armFlexDeg;
        pose.shoulderRAbductionDeg = side.armAbducted ? 42 : 0;
        pose.shoulderRElevated = side.shoulderRaised;
        pose.elbowRFlexionDeg = elbowFlexDeg;
        pose.forearmRPronationDeg = side.wristTwistedOrDeviated ? 72 : 15;
        pose.wristRFlexionDeg = wristFlexDeg;
        pose.wristRDeviationDeg = side.wristTwistedOrDeviated ? 18 : 0;
      }

      pose.kneeRFlexionDeg = kneeFlexDeg;
      pose.hipRFlexionDeg = kneeFlexDeg * 0.55;
      if (props.data.legsBase === 2) {
        pose.hipLFlexionDeg = 32;
        pose.kneeLFlexionDeg = Math.max(55, kneeFlexDeg);
      } else {
        pose.kneeLFlexionDeg = kneeFlexDeg;
        pose.hipLFlexionDeg = kneeFlexDeg * 0.55;
      }

      badgeText = `REBA (${props.activeSide === 'right' ? 'Der.' : 'Izq.'}) · Tr:${props.data.trunkPos} Cu:${props.data.neckPos} Pi:${props.data.legsBase}+${props.data.legsKneeFlexion} · Br:${side.upperArmPos}`;
    } else {
      // OWAS
      const { back, arms, legs, load } = props;
      pose.trunkFlexionDeg = back === 2 || back === 4 ? Math.max(25, trunkFlexDeg) : Math.min(15, trunkFlexDeg);
      pose.trunkTwistDeg = back === 3 || back === 4 ? 32 : 0;
      pose.trunkLateralDeg = back === 3 ? 16 : 0;
      pose.neckFlexionDeg = 10;

      if (arms === 1) {
        pose.shoulderRFlexionDeg = Math.min(75, Math.max(15, armFlexDeg));
        pose.shoulderLFlexionDeg = 22;
        pose.elbowRFlexionDeg = 65;
        pose.elbowLFlexionDeg = 55;
      } else if (arms === 2) {
        pose.shoulderRFlexionDeg = Math.max(95, armFlexDeg);
        pose.shoulderLFlexionDeg = 20;
        pose.elbowRFlexionDeg = 35;
        pose.elbowLFlexionDeg = 45;
      } else {
        pose.shoulderRFlexionDeg = Math.max(95, armFlexDeg);
        pose.shoulderLFlexionDeg = Math.max(95, armFlexDeg);
        pose.elbowRFlexionDeg = 35;
        pose.elbowLFlexionDeg = 35;
      }

      if (legs === 1) {
        pose.stanceMode = 'seated';
        pose.prop = 'chair';
        pose.hipRFlexionDeg = 90;
        pose.kneeRFlexionDeg = 90;
        pose.hipLFlexionDeg = 90;
        pose.kneeLFlexionDeg = 90;
      } else if (legs === 2) {
        pose.stanceMode = 'standing';
      } else if (legs === 3) {
        pose.stanceMode = 'one_leg';
        pose.hipLFlexionDeg = 28;
        pose.kneeLFlexionDeg = 58;
      } else if (legs === 4) {
        pose.stanceMode = 'squatting';
        pose.hipRFlexionDeg = 55;
        pose.kneeRFlexionDeg = Math.max(45, kneeFlexDeg);
        pose.hipLFlexionDeg = 55;
        pose.kneeLFlexionDeg = Math.max(45, kneeFlexDeg);
      } else if (legs === 5) {
        pose.stanceMode = 'one_leg';
        pose.hipRFlexionDeg = 42;
        pose.kneeRFlexionDeg = Math.max(45, kneeFlexDeg);
        pose.hipLFlexionDeg = 62;
        pose.kneeLFlexionDeg = 82;
      } else if (legs === 6) {
        pose.stanceMode = 'kneeling';
        pose.hipRFlexionDeg = 18;
        pose.kneeRFlexionDeg = 95;
        pose.hipLFlexionDeg = 85;
        pose.kneeLFlexionDeg = 90;
      } else {
        pose.stanceMode = 'walking';
        pose.hipRFlexionDeg = 26;
        pose.kneeRFlexionDeg = 22;
        pose.hipLFlexionDeg = -18;
        pose.kneeLFlexionDeg = 14;
      }

      if (load >= 2 && legs !== 1) {
        pose.prop = 'box_load';
      }

      badgeText = `Código OWAS: ${back}-${arms}-${legs}-${load}`;
    }

    // Active segment focus & angle arc overlay
    let focusZone: FocusZone = 'full_body';
    if (focusIsolated) {
      if (activeSegment === 'upper_arm') focusZone = 'shoulder_arm';
      else if (activeSegment === 'lower_arm') focusZone = 'elbow_forearm';
      else if (activeSegment === 'wrist') focusZone = 'wrist_hand';
      else if (activeSegment === 'neck') focusZone = 'neck_cervical';
      else if (activeSegment === 'trunk') focusZone = 'trunk_pelvis';
      else if (activeSegment === 'legs') focusZone = 'legs_knees';
    }

    const angleArcs: AngleArcAnnotation[] = [];
    const shJoint = isLeftEvaluated ? 'shoulderL' : 'shoulderR';
    const elJoint = isLeftEvaluated ? 'elbowL' : 'elbowR';
    const wrJoint = isLeftEvaluated ? 'wristL' : 'wristR';
    const hdJoint = isLeftEvaluated ? 'handL' : 'handR';

    if (activeSegment === 'upper_arm') {
      angleArcs.push({
        joint: shJoint,
        refType: 'trunk_axis',
        toJoint: elJoint,
        label: `Brazo ${armFlexDeg}°`,
      });
    } else if (activeSegment === 'lower_arm') {
      angleArcs.push({
        joint: elJoint,
        refType: 'vertical_down',
        toJoint: wrJoint,
        label: `Codo ${elbowFlexDeg}°`,
      });
    } else if (activeSegment === 'wrist') {
      angleArcs.push({
        joint: wrJoint,
        refType: 'forearm_axis',
        parentJoint: elJoint,
        toJoint: hdJoint,
        label: `Muñeca ${wristFlexDeg}°`,
      });
    } else if (activeSegment === 'neck') {
      angleArcs.push({
        joint: 'c7',
        refType: 'vertical_up',
        toJoint: 'head',
        label: `Cuello ${neckFlexDeg}°`,
      });
    } else if (activeSegment === 'trunk') {
      angleArcs.push({
        joint: 'l5s1',
        refType: 'vertical_up',
        toJoint: 'c7',
        label: `Tronco ${trunkFlexDeg}°`,
      });
    } else if (activeSegment === 'legs') {
      angleArcs.push({
        joint: 'kneeR',
        refType: 'vertical_down',
        toJoint: 'ankleR',
        label: `Rodilla ${kneeFlexDeg}°`,
      });
    }

    return {
      subTitle: `Avatar Anatómico 3D · ${SEGMENT_TABS.find((s) => s.id === activeSegment)?.label || 'Cuerpo Completo'}`,
      scoreBadge: showAngleGuides ? badgeText : undefined,
      focusZone,
      cameraPreset: isLeftEvaluated && cameraPreset === 'sagittal_right' ? 'sagittal_left' : cameraPreset,
      pose,
      angleArcs: showAngleGuides ? angleArcs : [],
    };
  }, [
    props,
    armFlexDeg,
    elbowFlexDeg,
    wristFlexDeg,
    neckFlexDeg,
    trunkFlexDeg,
    kneeFlexDeg,
    activeSegment,
    focusIsolated,
    cameraPreset,
    showAngleGuides,
  ]);

  // Render interactive 3D canvas whenever pose/orbit/mode/GLB state changes
  useEffect(() => {
    void glbReadyTick;
    if (!isExpanded || viewMode === 'goniometer') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const widthPx = viewMode === 'pure_3d' ? 680 : 460;
    const heightPx = viewMode === 'pure_3d' ? 430 : 390;
    renderInteractivePose3DToCanvas(
      livePanelSpec,
      canvas,
      widthPx,
      heightPx,
      orbit,
      2,
      'anatomical_skin',
      false,
    );
  }, [isExpanded, viewMode, livePanelSpec, orbit, glbReadyTick]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      az0: orbit.azimuthDeg,
      el0: orbit.elevationDeg,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const nextAz = Math.max(-180, Math.min(180, Math.round(dragRef.current.az0 - dx * 0.45)));
    const nextEl = Math.max(-65, Math.min(65, Math.round(dragRef.current.el0 + dy * 0.35)));
    setOrbit((prev) => ({ ...prev, azimuthDeg: nextAz, elevationDeg: nextEl }));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  return (
    <section className="rounded-lg border border-slate-300 bg-white overflow-hidden shadow-2xs">
      {/* Cabecera colapsable del Control Biomecánico 3D */}
      <div className="px-4 py-3 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Box className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="text-xs sm:text-sm font-bold tracking-tight">
            Control Biomecánico 3D Anatómico PBR ({method})
          </span>
          <span className="font-mono text-[11px] text-sky-200 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded tabular-nums">
            Avatar .glb · Iluminación de estudio
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              Ocultar visor 3D
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              Abrir control 3D
            </>
          )}
        </button>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Barra superior de modo de inspección limpio (sin modelo híbrido ni rayos X) */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-200">
            <div className="inline-flex flex-wrap rounded-md border border-slate-300 bg-slate-100 p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => setViewMode('pure_3d')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  viewMode === 'pure_3d'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                <Box className="w-3.5 h-3.5" />
                Modelo 3D Anatómico (.glb)
              </button>
              <button
                type="button"
                onClick={() => setViewMode('split_compare')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  viewMode === 'split_compare'
                    ? 'bg-sky-700 text-white'
                    : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                Comparar Lado a Lado con Lámina
              </button>
              <button
                type="button"
                onClick={() => setViewMode('goniometer')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  viewMode === 'goniometer'
                    ? 'bg-sky-700 text-white'
                    : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5" />
                Goniómetro en Lámina
              </button>
            </div>

            {viewMode !== 'goniometer' && (
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showAngleGuides}
                    onChange={(e) => setShowAngleGuides(e.target.checked)}
                    className="rounded border-slate-300 text-sky-700"
                  />
                  <span>Mostrar arco de ángulo</span>
                </label>

                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={focusIsolated}
                    onChange={(e) => setFocusIsolated(e.target.checked)}
                    className="rounded border-slate-300 text-sky-700"
                  />
                  <span>Aislar segmento</span>
                </label>
              </div>
            )}
          </div>

          {/* Pestañas de articulación / segmento corporal */}
          <div className="flex flex-wrap items-center gap-1.5">
            {SEGMENT_TABS.map((seg) => {
              const active = activeSegment === seg.id;
              return (
                <button
                  key={seg.id}
                  type="button"
                  onClick={() => handleSelectSegment(seg.id)}
                  className={`px-2.5 py-1.5 rounded border text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    active
                      ? 'border-sky-600 bg-sky-50 text-sky-900'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  {seg.label}
                </button>
              );
            })}
          </div>

          {/* Área central: Visor 3D limpio / Comparativa lateral / Goniómetro + Controles cinemáticos */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
            {/* Visor Visual (8 columnas) */}
            <div className="xl:col-span-8 space-y-2.5">
              {viewMode === 'pure_3d' && (
                <div className="rounded-md border border-slate-300 bg-slate-50 p-2.5 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-600 px-1">
                    <span className="font-semibold text-slate-800">
                      Avatar Anatómico Realista 3D (arrastre para rotar 360°)
                    </span>
                    <span className="font-mono tabular-nums">
                      Az {orbit.azimuthDeg}° · El {orbit.elevationDeg}°
                    </span>
                  </div>
                  <div className="flex justify-center">
                    <canvas
                      ref={canvasRef}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      className="w-full max-w-[680px] h-auto bg-white rounded border border-slate-200 cursor-grab active:cursor-grabbing"
                    />
                  </div>
                </div>
              )}

              {viewMode === 'split_compare' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Lienzo 3D Interactivo */}
                  <div className="rounded-md border border-slate-300 bg-slate-50 p-2 flex flex-col">
                    <div className="flex items-center justify-between text-[11px] text-slate-600 pb-1.5 px-1">
                      <span className="font-semibold text-slate-800">Avatar 3D (.glb · Arrastre 360°)</span>
                      <span className="font-mono tabular-nums">
                        Az {orbit.azimuthDeg}° · El {orbit.elevationDeg}°
                      </span>
                    </div>
                    <canvas
                      ref={canvasRef}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      className="w-full h-auto bg-white rounded border border-slate-200 cursor-grab active:cursor-grabbing"
                    />
                  </div>

                  {/* Lámina Anatómica Separada */}
                  <div className="rounded-md border border-slate-300 bg-slate-50 p-2 flex flex-col justify-between">
                    <div className="flex items-center justify-between gap-2 text-[11px] pb-1.5 px-1">
                      <span className="font-semibold text-slate-900 truncate">
                        {activePlate.figCode} — {activePlate.shortLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => setViewMode('goniometer')}
                        className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Crosshair className="w-3 h-3" />
                        Medir ángulo
                      </button>
                    </div>
                    <div className="flex-1 bg-white rounded border border-slate-200 flex items-center justify-center p-2 min-h-[260px]">
                      {!plateImgFailed[activePlate.figId] ? (
                        <img
                          src={activePlate.url}
                          alt={`${activePlate.figCode} ${activePlate.shortLabel}`}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setPlateImgFailed((prev) => ({ ...prev, [activePlate.figId]: true }))
                          }
                          className="max-h-[330px] w-full object-contain"
                        />
                      ) : (
                        <span className="text-xs text-slate-500">Imagen de referencia no disponible</span>
                      )}
                    </div>
                    <div className="pt-1.5 px-1 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Lámina de referencia Cap. 4</span>
                        <span className="font-mono">{activePlate.figId}.png</span>
                      </div>
                      {activeCatalogPanels.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 pt-0.5">
                          <span className="text-[10px] font-semibold text-slate-600 mr-0.5">
                            Adoptar referencia:
                          </span>
                          {activeCatalogPanels.map((refP, rIdx) => {
                            const bodyLet = ['A', 'B', 'C', 'D'][rIdx] || String(rIdx + 1);
                            return (
                              <button
                                key={`adopt-${activePlate.figId}-${rIdx}`}
                                type="button"
                                onClick={() => handleAdoptCatalogReferenceBody(refP)}
                                className="px-2 py-0.5 rounded border border-sky-300 bg-sky-50 hover:bg-sky-100 text-[10px] font-semibold text-sky-900 whitespace-nowrap cursor-pointer"
                                title={refP.subTitle}
                              >
                                {activeCatalogPanels.length > 1 ? `Cuerpo ${bodyLet}` : 'Postura Ref.'}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {viewMode === 'goniometer' && (
                <InteractivePhotoGoniometer
                  imageUrl={activePlate.url}
                  figureCode={activePlate.figCode}
                  figureLabel={activePlate.shortLabel}
                  onApplyAngle={handleApplyGoniometerAngle}
                  applyButtonLabel={`Aplicar ángulo medido a ${
                    SEGMENT_TABS.find((s) => s.id === activeSegment)?.label || 'Modelo 3D'
                  }`}
                  compact
                />
              )}

              {/* Planos ópticos de cámara y control de zoom */}
              {viewMode !== 'goniometer' && (
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1">
                    <Eye className="w-3.5 h-3.5 text-sky-700 mr-1 shrink-0" />
                    {CAMERA_PRESETS_SHORT.map((cam) => (
                      <button
                        key={cam.id}
                        type="button"
                        onClick={() => {
                          setCameraPreset(cam.id);
                          setOrbit(DEFAULT_ORBIT_OVERRIDE);
                        }}
                        className={`px-2 py-1 rounded border text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                          cameraPreset === cam.id && orbit.azimuthDeg === 0 && orbit.elevationDeg === 0
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {cam.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-600">Zoom</span>
                    <input
                      type="range"
                      min={0.7}
                      max={1.75}
                      step={0.05}
                      value={orbit.zoom}
                      onChange={(e) => setOrbit((p) => ({ ...p, zoom: Number(e.target.value) }))}
                      className="w-20 accent-sky-700"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setCameraPreset('sagittal_right');
                        setOrbit(DEFAULT_ORBIT_OVERRIDE);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-medium text-sky-800 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Verdadera Magnitud
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Columna Derecha (4 columnas): Control Cinemático Articular Sincronizado */}
            <div className="xl:col-span-4 rounded-md border border-slate-200 bg-slate-50/80 p-3.5 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-sky-700" />
                  Cinemática Articular → Puntuación
                </span>
                <span className="font-mono text-[11px] text-slate-600">{method}</span>
              </div>

              {/* Deslizador 1: Brazo */}
              <div
                onClick={() => handleSelectSegment('upper_arm')}
                className={`p-2 rounded border transition-colors cursor-pointer ${
                  activeSegment === 'upper_arm'
                    ? 'bg-white border-sky-400'
                    : 'bg-white/70 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-800">Flexión / Ext. Brazo</span>
                  <span className="font-mono font-bold text-sky-800 tabular-nums">
                    {armFlexDeg}° →{' '}
                    {method === 'OWAS'
                      ? `Cód. ${props.method === 'OWAS' ? props.arms : 1}`
                      : `+${mapArmDegToScore(armFlexDeg)} pt`}
                  </span>
                </div>
                <input
                  type="range"
                  min={-35}
                  max={135}
                  value={armFlexDeg}
                  onChange={(e) => applyArmDegChange(Number(e.target.value))}
                  className="w-full accent-sky-700"
                />
              </div>

              {/* Deslizador 2: Antebrazo */}
              {method !== 'OWAS' && (
                <div
                  onClick={() => handleSelectSegment('lower_arm')}
                  className={`p-2 rounded border transition-colors cursor-pointer ${
                    activeSegment === 'lower_arm'
                      ? 'bg-white border-sky-400'
                      : 'bg-white/70 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-800">Flexión de Codo</span>
                    <span className="font-mono font-bold text-sky-800 tabular-nums">
                      {elbowFlexDeg}° → +{mapForearmDegToScore(elbowFlexDeg)} pt
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={145}
                    value={elbowFlexDeg}
                    onChange={(e) => applyElbowDegChange(Number(e.target.value))}
                    className="w-full accent-sky-700"
                  />
                </div>
              )}

              {/* Deslizador 3: Muñeca */}
              {method !== 'OWAS' && (
                <div
                  onClick={() => handleSelectSegment('wrist')}
                  className={`p-2 rounded border transition-colors cursor-pointer ${
                    activeSegment === 'wrist'
                      ? 'bg-white border-sky-400'
                      : 'bg-white/70 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-800">Flexión / Ext. Muñeca</span>
                    <span className="font-mono font-bold text-sky-800 tabular-nums">
                      {wristFlexDeg}° → +
                      {method === 'RULA'
                        ? mapRulaWristDegToScore(wristFlexDeg)
                        : mapRebaWristDegToScore(wristFlexDeg)}{' '}
                      pt
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-40}
                    max={45}
                    value={wristFlexDeg}
                    onChange={(e) => applyWristDegChange(Number(e.target.value))}
                    className="w-full accent-sky-700"
                  />
                </div>
              )}

              {/* Deslizador 4: Cuello */}
              {method !== 'OWAS' && (
                <div
                  onClick={() => handleSelectSegment('neck')}
                  className={`p-2 rounded border transition-colors cursor-pointer ${
                    activeSegment === 'neck'
                      ? 'bg-white border-sky-400'
                      : 'bg-white/70 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-800">Ángulo Cervical (Cuello)</span>
                    <span className="font-mono font-bold text-sky-800 tabular-nums">
                      {neckFlexDeg}° → +
                      {method === 'RULA'
                        ? mapRulaNeckDegToScore(neckFlexDeg)
                        : mapRebaNeckDegToScore(neckFlexDeg)}{' '}
                      pt
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-25}
                    max={45}
                    value={neckFlexDeg}
                    onChange={(e) => applyNeckDegChange(Number(e.target.value))}
                    className="w-full accent-sky-700"
                  />
                </div>
              )}

              {/* Deslizador 5: Tronco / Espalda */}
              <div
                onClick={() => handleSelectSegment('trunk')}
                className={`p-2 rounded border transition-colors cursor-pointer ${
                  activeSegment === 'trunk'
                    ? 'bg-white border-sky-400'
                    : 'bg-white/70 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-800">Inclinación Tronco / Espalda</span>
                  <span className="font-mono font-bold text-sky-800 tabular-nums">
                    {trunkFlexDeg}° →{' '}
                    {method === 'OWAS'
                      ? `Cód. ${props.method === 'OWAS' ? props.back : 1}`
                      : method === 'RULA'
                        ? `+${mapRulaTrunkDegToScore(trunkFlexDeg, props.method === 'RULA' && props.data.trunkPos === 1 && Math.abs(trunkFlexDeg) <= 5)} pt`
                        : `+${mapRebaTrunkDegToScore(trunkFlexDeg)} pt`}
                  </span>
                </div>
                <input
                  type="range"
                  min={-25}
                  max={85}
                  value={trunkFlexDeg}
                  onChange={(e) => applyTrunkDegChange(Number(e.target.value))}
                  className="w-full accent-sky-700"
                />
              </div>

              {/* Deslizador 6: Rodillas / Piernas */}
              <div
                onClick={() => handleSelectSegment('legs')}
                className={`p-2 rounded border transition-colors cursor-pointer ${
                  activeSegment === 'legs'
                    ? 'bg-white border-sky-400'
                    : 'bg-white/70 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-800">Flexión de Rodillas</span>
                  <span className="font-mono font-bold text-sky-800 tabular-nums">
                    {kneeFlexDeg}°{' '}
                    {method === 'REBA'
                      ? `→ +${mapRebaKneeDegToScore(kneeFlexDeg)} pt`
                      : method === 'OWAS'
                        ? `→ Cód. ${props.method === 'OWAS' ? props.legs : 2}`
                        : ''}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={105}
                  value={kneeFlexDeg}
                  onChange={(e) => applyKneeDegChange(Number(e.target.value))}
                  className="w-full accent-sky-700"
                />
              </div>

              {props.method === 'OWAS' && (
                <div className="p-2 rounded border border-slate-200 bg-white space-y-1.5">
                  <span className="block font-semibold text-slate-800">Modificador rápido Torsión Espalda / Brazos</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const twisted = props.back === 3 || props.back === 4;
                        const bent = props.back === 2 || props.back === 4;
                        const nextBack: 1 | 2 | 3 | 4 = !twisted ? (bent ? 4 : 3) : bent ? 2 : 1;
                        props.onChangeCodes({ back: nextBack });
                        setSelectedPlateId(nextBack === 1 ? 'fig-4-27a' : 'fig-4-27b');
                      }}
                      className={`px-2 py-1 rounded border text-[11px] font-medium cursor-pointer ${
                        props.back === 3 || props.back === 4
                          ? 'bg-sky-700 text-white border-sky-700'
                          : 'bg-slate-50 text-slate-700 border-slate-300'
                      }`}
                    >
                      Torsión / Lateral ({props.back === 3 || props.back === 4 ? 'Sí' : 'No'})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const nextArms: 1 | 2 | 3 = props.arms === 3 ? 2 : 3;
                        props.onChangeCodes({ arms: nextArms });
                        setSelectedPlateId('fig-4-28b');
                      }}
                      className={`px-2 py-1 rounded border text-[11px] font-medium cursor-pointer ${
                        props.arms === 3
                          ? 'bg-sky-700 text-white border-sky-700'
                          : 'bg-slate-50 text-slate-700 border-slate-300'
                      }`}
                    >
                      2 Brazos Elevados (Cód. 3)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tira interactiva de láminas de referencia (solo en modo comparativa lateral o goniómetro) */}
          {viewMode !== 'pure_3d' && (
            <div className="pt-2 border-t border-slate-200 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-800">
                  Láminas de Referencia Cap. 4 — Seleccione una figura para comparar lado a lado o medir con goniómetro:
                </span>
                <div className="inline-flex rounded border border-slate-300 bg-slate-100 p-0.5">
                  <button
                    type="button"
                    onClick={() => setPlateFilterMode('method')}
                    className={`px-2 py-0.5 rounded-xs text-[11px] font-semibold cursor-pointer ${
                      plateFilterMode === 'method' ? 'bg-white text-slate-900' : 'text-slate-600'
                    }`}
                  >
                    Láminas {method} ({CHAPTER4_SENT_PLATES.filter((p) => p.method === method).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlateFilterMode('all')}
                    className={`px-2 py-0.5 rounded-xs text-[11px] font-semibold cursor-pointer ${
                      plateFilterMode === 'all' ? 'bg-white text-slate-900' : 'text-slate-600'
                    }`}
                  >
                    Todas Cap. 4 (36)
                  </button>
                </div>
              </div>

              <div className="flex items-stretch gap-2 overflow-x-auto pb-1.5">
                {visiblePlates.map((plate) => {
                  const selected = plate.figId === activePlate.figId;
                  return (
                    <button
                      key={plate.figId}
                      type="button"
                      onClick={() => {
                        setSelectedPlateId(plate.figId);
                        if (plate.segment !== 'general') {
                          setActiveSegment(plate.segment);
                        }
                      }}
                      className={`w-36 shrink-0 rounded border p-1.5 text-left transition-all cursor-pointer flex flex-col justify-between ${
                        selected
                          ? 'border-sky-600 bg-sky-50 ring-1 ring-sky-600/30'
                          : 'border-slate-200 bg-white hover:border-sky-400'
                      }`}
                    >
                      <div className="h-16 w-full bg-white rounded border border-slate-100 flex items-center justify-center overflow-hidden mb-1">
                        {!plateImgFailed[plate.figId] ? (
                          <img
                            src={plate.url}
                            alt={plate.shortLabel}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setPlateImgFailed((prev) => ({ ...prev, [plate.figId]: true }))
                            }
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <span className="font-mono text-[10px] text-slate-400">{plate.figCode}</span>
                        )}
                      </div>
                      <div>
                        <div className="font-mono text-[10px] font-bold text-sky-900">{plate.figCode}</div>
                        <div className="text-[10px] text-slate-700 leading-tight line-clamp-1">
                          {plate.shortLabel}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

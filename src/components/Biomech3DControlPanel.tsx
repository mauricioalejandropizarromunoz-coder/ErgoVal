import React, { useEffect, useRef, useState } from 'react';
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
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RebaData, RebaSideInput, RulaData, RulaSideInput } from '../types/ergonomics';
import { CameraPreset } from '../types/figurePlan';
import {
  BiomechSegmentCategory,
  CHAPTER4_SENT_PLATES,
  Chapter4SentPlateMeta,
} from '../utils/figurePlanCatalog';
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

  const [activeSegment, setActiveSegment] = useState<BiomechSegmentCategory>(
    method === 'REBA' || method === 'OWAS' ? 'trunk' : 'upper_arm',
  );
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('sagittal_right');
  const [plateFilterMode, setPlateFilterMode] = useState<'method' | 'all'>('method');
  const [selectedPlateId, setSelectedPlateId] = useState<string>(() =>
    getDefaultPlateForMethodSegment(
      method,
      method === 'REBA' || method === 'OWAS' ? 'trunk' : 'upper_arm',
    ),
  );
  const [plateImgFailed, setPlateImgFailed] = useState<Record<string, boolean>>({});

  // Continuous kinematic state (degrees)
  const [armFlexDeg, setArmFlexDeg] = useState<number>(34);
  const [elbowFlexDeg, setElbowFlexDeg] = useState<number>(82);
  const [wristFlexDeg, setWristFlexDeg] = useState<number>(11);
  const [neckFlexDeg, setNeckFlexDeg] = useState<number>(16);
  const [trunkFlexDeg, setTrunkFlexDeg] = useState<number>(36);
  const [kneeFlexDeg, setKneeFlexDeg] = useState<number>(12);

  // Direct Three.js Refs for interactive WebGL canvas mounting
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const avatarRootRef = useRef<THREE.Group | null>(null);

  // Initialize direct WebGL Scene and OrbitControls
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 1.2, 3.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.85, 0);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(3, 5, 4);
    scene.add(dirLight);

    const avatarGroup = new THREE.Group();
    scene.add(avatarGroup);
    avatarRootRef.current = avatarGroup;

    // Load actual GLB model
    const loader = new GLTFLoader();
    loader.load(
      '/models/ergo_avatar.glb',
      (gltf) => {
        avatarGroup.clear();
        avatarGroup.add(gltf.scene);
      },
      undefined,
      (err) => {
        console.warn('Error loading GLB, using procedural fallback:', err);
        // Fallback geometry if GLB fails
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.4 });
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.4, 0.2), bodyMat);
        box.position.set(0, 0.85, 0);
        avatarGroup.add(box);
      }
    );

    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Sync continuous angles when form choices change externally
  useEffect(() => {
    if (props.method === 'RULA') {
      const side = props.data[props.activeSide];
      setArmFlexDeg(canonicalArmDeg(side.upperArmPos));
      setElbowFlexDeg(canonicalForearmDeg(side.lowerArmPos));
      setWristFlexDeg(canonicalRulaWristDeg(side.wristPos));
      setNeckFlexDeg(canonicalRulaNeckDeg(props.data.neckPos));
      setTrunkFlexDeg(canonicalRulaTrunkDeg(props.data.trunkPos));
    } else if (props.method === 'REBA') {
      const side = props.data[props.activeSide];
      setArmFlexDeg(canonicalArmDeg(side.upperArmPos));
      setElbowFlexDeg(canonicalForearmDeg(side.lowerArmPos));
      setWristFlexDeg(canonicalRebaWristDeg(side.wristPos));
      setNeckFlexDeg(canonicalRebaNeckDeg(props.data.neckPos));
      setTrunkFlexDeg(canonicalRebaTrunkDeg(props.data.trunkPos));
      setKneeFlexDeg(canonicalRebaKneeDeg(props.data.legsKneeFlexion));
    }
  }, [props]);

  const handleSelectSegment = (seg: BiomechSegmentCategory) => {
    setActiveSegment(seg);
    setSelectedPlateId(getDefaultPlateForMethodSegment(method, seg));
  };

  const visiblePlates = useMemo<Chapter4SentPlateMeta[]>(() => {
    if (plateFilterMode === 'all') return CHAPTER4_SENT_PLATES;
    return CHAPTER4_SENT_PLATES.filter((p) => p.method === method);
  }, [plateFilterMode, method]);

  const activePlate = useMemo<Chapter4SentPlateMeta>(() => {
    return (
      CHAPTER4_SENT_PLATES.find((p) => p.figId === selectedPlateId) ||
      visiblePlates[0] ||
      CHAPTER4_SENT_PLATES[0]
    );
  }, [selectedPlateId, visiblePlates]);

  const applyArmDegChange = (deg: number) => {
    setArmFlexDeg(deg);
    const nextScore = mapArmDegToScore(deg);
    if (props.method === 'RULA' || props.method === 'REBA') {
      const side = props.data[props.activeSide];
      if (side.upperArmPos !== nextScore) {
        props.onChange({
          ...props.data,
          [props.activeSide]: { ...side, upperArmPos: nextScore },
        });
      }
    } else {
      const nextArms = deg >= 90 ? 2 : 1;
      if (nextArms !== props.arms) props.onChangeCodes({ arms: nextArms as any });
    }
  };

  const applyElbowDegChange = (deg: number) => {
    setElbowFlexDeg(deg);
    const nextScore = mapForearmDegToScore(deg);
    if (props.method === 'RULA' || props.method === 'REBA') {
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
    if (props.method === 'RULA' || props.method === 'REBA') {
      const nextScore = props.method === 'RULA' ? mapRulaWristDegToScore(deg) : mapRebaWristDegToScore(deg);
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
    if (props.method === 'RULA' || props.method === 'REBA') {
      const nextScore = props.method === 'RULA' ? mapRulaNeckDegToScore(deg) : mapRebaNeckDegToScore(deg);
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
      const nextBack = deg >= 20 ? 2 : 1;
      if (nextBack !== props.back) props.onChangeCodes({ back: nextBack });
    }
  };

  const applyKneeDegChange = (deg: number) => {
    setKneeFlexDeg(deg);
    if (props.method === 'REBA') {
      const nextKnee = mapRebaKneeDegToScore(deg);
      if (props.data.legsKneeFlexion !== nextKnee) {
        props.onChange({ ...props.data, legsKneeFlexion: nextKnee });
      }
    }
  };

  const handleApplyGoniometerAngle = (measuredDeg: number) => {
    if (activeSegment === 'upper_arm') applyArmDegChange(measuredDeg);
    else if (activeSegment === 'lower_arm') applyElbowDegChange(measuredDeg);
    else if (activeSegment === 'wrist') applyWristDegChange(measuredDeg);
    else if (activeSegment === 'neck') applyNeckDegChange(measuredDeg);
    else if (activeSegment === 'trunk') applyTrunkDegChange(measuredDeg);
    else if (activeSegment === 'legs') applyKneeDegChange(measuredDeg);
  };

  return (
    <section className="rounded-lg border border-slate-300 bg-white overflow-hidden shadow-2xs">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Box className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="text-xs sm:text-sm font-bold tracking-tight">
            Control Biomecánico 3D Anatómico PBR ({method})
          </span>
          <span className="font-mono text-[11px] text-sky-200 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded tabular-nums">
            Avatar .glb · WebGL Directo
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" /> Ocultar visor 3D
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" /> Abrir control 3D
            </>
          )}
        </button>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Top view mode bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-200">
            <div className="inline-flex flex-wrap rounded-md border border-slate-300 bg-slate-100 p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => setViewMode('pure_3d')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  viewMode === 'pure_3d' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                <Box className="w-3.5 h-3.5" />
                Modelo 3D Anatómico (.glb)
              </button>
              <button
                type="button"
                onClick={() => setViewMode('split_compare')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  viewMode === 'split_compare' ? 'bg-sky-700 text-white' : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                Comparar Lado a Lado con Lámina
              </button>
              <button
                type="button"
                onClick={() => setViewMode('goniometer')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  viewMode === 'goniometer' ? 'bg-sky-700 text-white' : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5" />
                Goniómetro en Lámina
              </button>
            </div>

            {viewMode !== 'goniometer' && (
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showAngleGuides}
                  onChange={(e) => setShowAngleGuides(e.target.checked)}
                  className="rounded border-slate-300 text-sky-700"
                />
                <span>Mostrar guías angulares</span>
              </label>
            )}
          </div>

          {/* Segment Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {SEGMENT_TABS.map((seg) => {
              const active = activeSegment === seg.id;
              return (
                <button
                  key={seg.id}
                  type="button"
                  onClick={() => handleSelectSegment(seg.id)}
                  className={`px-2.5 py-1.5 rounded border text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    active ? 'border-sky-600 bg-sky-50 text-sky-900' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  {seg.label}
                </button>
              );
            })}
          </div>

          {/* Central Area: Direct WebGL Canvas / Split Compare / Goniometer */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
            <div className="xl:col-span-8 space-y-2.5">
              {viewMode === 'pure_3d' && (
                <div className="rounded-md border border-slate-300 bg-slate-50 p-2.5 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-600 px-1">
                    <span className="font-semibold text-slate-800">
                      Visor 3D Interactivo (Arrastre para rotar, rueda para zoom)
                    </span>
                    <span className="font-mono tabular-nums">PBR Activo</span>
                  </div>
                  <div
                    ref={containerRef}
                    className="w-full h-[420px] bg-white rounded border border-slate-200 overflow-hidden relative"
                  />
                </div>
              )}

              {viewMode === 'split_compare' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-md border border-slate-300 bg-slate-50 p-2 flex flex-col">
                    <div className="text-[11px] font-semibold text-slate-800 pb-1.5 px-1">
                      Avatar 3D Interactivo
                    </div>
                    <div
                      ref={containerRef}
                      className="w-full h-[360px] bg-white rounded border border-slate-200 overflow-hidden relative"
                    />
                  </div>

                  <div className="rounded-md border border-slate-300 bg-slate-50 p-2 flex flex-col justify-between">
                    <div className="flex items-center justify-between gap-2 text-[11px] pb-1.5 px-1">
                      <span className="font-semibold text-slate-900 truncate">
                        {activePlate.figCode} — {activePlate.shortLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => setViewMode('goniometer')}
                        className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 font-semibold cursor-pointer"
                      >
                        <Crosshair className="w-3 h-3" /> Medir ángulo
                      </button>
                    </div>
                    <div className="flex-1 bg-white rounded border border-slate-200 flex items-center justify-center p-2 min-h-[300px]">
                      {!plateImgFailed[activePlate.figId] ? (
                        <img
                          src={activePlate.url}
                          alt={activePlate.shortLabel}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setPlateImgFailed((prev) => ({ ...prev, [activePlate.figId]: true }))
                          }
                          className="max-h-[330px] w-full object-contain"
                        />
                      ) : (
                        <span className="text-xs text-slate-500">Imagen no disponible</span>
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
                  applyButtonLabel="Aplicar ángulo medido al modelo 3D"
                  compact
                />
              )}
            </div>

            {/* Right Column: Kinematic Sliders */}
            <div className="xl:col-span-4 rounded-md border border-slate-200 bg-slate-50/80 p-3.5 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-sky-700" /> Cinemática Articular
                </span>
                <span className="font-mono text-[11px] text-slate-600">{method}</span>
              </div>

              {/* Arm Flexion */}
              <div
                onClick={() => handleSelectSegment('upper_arm')}
                className={`p-2 rounded border transition-colors cursor-pointer ${
                  activeSegment === 'upper_arm' ? 'bg-white border-sky-400' : 'bg-white/70 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-800">Flexión de Brazo</span>
                  <span className="font-mono font-bold text-sky-800 tabular-nums">{armFlexDeg}°</span>
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

              {/* Elbow Flexion */}
              {method !== 'OWAS' && (
                <div
                  onClick={() => handleSelectSegment('lower_arm')}
                  className={`p-2 rounded border transition-colors cursor-pointer ${
                    activeSegment === 'lower_arm' ? 'bg-white border-sky-400' : 'bg-white/70 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-800">Flexión de Codo</span>
                    <span className="font-mono font-bold text-sky-800 tabular-nums">{elbowFlexDeg}°</span>
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

              {/* Wrist Flexion */}
              {method !== 'OWAS' && (
                <div
                  onClick={() => handleSelectSegment('wrist')}
                  className={`p-2 rounded border transition-colors cursor-pointer ${
                    activeSegment === 'wrist' ? 'bg-white border-sky-400' : 'bg-white/70 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-800">Flexión de Muñeca</span>
                    <span className="font-mono font-bold text-sky-800 tabular-nums">{wristFlexDeg}°</span>
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

              {/* Neck Flexion */}
              {method !== 'OWAS' && (
                <div
                  onClick={() => handleSelectSegment('neck')}
                  className={`p-2 rounded border transition-colors cursor-pointer ${
                    activeSegment === 'neck' ? 'bg-white border-sky-400' : 'bg-white/70 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-800">Ángulo Cervical (Cuello)</span>
                    <span className="font-mono font-bold text-sky-800 tabular-nums">{neckFlexDeg}°</span>
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

              {/* Trunk Flexion */}
              <div
                onClick={() => handleSelectSegment('trunk')}
                className={`p-2 rounded border transition-colors cursor-pointer ${
                  activeSegment === 'trunk' ? 'bg-white border-sky-400' : 'bg-white/70 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-800">Inclinación de Tronco</span>
                  <span className="font-mono font-bold text-sky-800 tabular-nums">{trunkFlexDeg}°</span>
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

              {/* Knee Flexion */}
              <div
                onClick={() => handleSelectSegment('legs')}
                className={`p-2 rounded border transition-colors cursor-pointer ${
                  activeSegment === 'legs' ? 'bg-white border-sky-400' : 'bg-white/70 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-800">Flexión de Rodillas</span>
                  <span className="font-mono font-bold text-sky-800 tabular-nums">{kneeFlexDeg}°</span>
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
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import JSZip from 'jszip';
import {
  ArrowLeft,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  FlipHorizontal2,
  FolderArchive,
  ImagePlus,
  Move,
  Printer,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Scaling,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  applyKatePose,
  createDefaultFootPose,
  createDefaultHandPose,
  createDefaultKatePoseParams,
  createKateRigInstance,
  detectKateLandmarksFromImage,
  detectSoftwareWebGL,
  extractKatePoseParamsFromLandmarks,
  getPresetKatePoseParams,
  KATE_EDITABLE_BONES,
  KATE_SAMPLE_GALLERY,
  KateAngleKey,
  KateBoneOverride,
  KateDetectedHandsLandmarks,
  KateFootPoseParams,
  KateHandPoseParams,
  KateLandmark3D,
  KateMeasuredAngle,
  KatePoseParams,
  KatePresetId,
  KateRigInstance,
  KateSupportType,
  KateTrueMagnitudeView,
  measureKateFullPoseSnapshot,
  mirrorKatePoseLeftRight,
  renderKatePrintSheet,
  solveKateBoneWorldDrag,
} from '../utils/kateAvatarEngine';
import {
  computeKateErgonomicScoring,
  createDefaultKateErgonomicModifiers,
  exportKateBatchToWord6x9Docx,
  exportKateSheetToWord6x9Docx,
  KateErgonomicModifiers,
  KateStepByStepScoringResult,
  KateWordPlateInput,
} from '../utils/kateErgonomicScoring';
import {
  KateCsvExportRowInput,
  parseKatePlatesCsv,
  serializeKatePlatesToCsv,
} from '../utils/kateCsvImport';
import {
  buildKatePoseFromCanonicalRow,
  KATE_53_CANONICAL_POSTURES,
} from '../utils/kate53PosturesCatalog';

interface Props {
  onBackToEvaluator: () => void;
}

interface PhotoBatchItem {
  id: string;
  name: string;
  plateTitle: string;
  basePosturalLabel?: string;
  src: string;
  img: HTMLImageElement | null;
  referenceSrc?: string | null;
  referenceImg?: HTMLImageElement | null;
  landmarks: KateLandmark3D[] | null;
  handsLandmarks: KateDetectedHandsLandmarks;
  confidence: number;
  usedRotationDeg: number;
  detectionStatus: 'pending' | 'detecting' | 'ok' | 'manual';
  params: KatePoseParams;
  ergoModifiers: KateErgonomicModifiers;
  sheetDataUrl: string | null;
  angles: KateMeasuredAngle[];
  views: KateTrueMagnitudeView[];
  scoring: KateStepByStepScoringResult | null;
}

type GizmoMode = 'rotate' | 'translate' | 'scale';
type GizmoSpace = 'local' | 'world';
type FocusRegion = 'body' | 'handL' | 'handR' | 'feet';

const PRESET_LIST: Array<{ id: KatePresetId; label: string }> = [
  { id: 'neutral', label: 'De pie neutro' },
  { id: 'hands_belly', label: 'Manos abdomen' },
  { id: 'hands_hips', label: 'Manos cintura' },
  { id: 'elbows_chest', label: 'Codos pecho' },
  { id: 'lotus', label: 'Piernas cruzadas / Loto' },
  { id: 'kneeling', label: 'De rodillas' },
  { id: 'heels', label: 'Sobre talones' },
  { id: 'ramp45', label: 'Rampa inclinada 45°' },
];

const SUPPORT_OPTIONS: Array<{ value: KateSupportType; label: string }> = [
  { value: 'none', label: 'Libre (sin apoyo)' },
  { value: 'manoAbdomen', label: 'Mano en abdomen' },
  { value: 'manoCintura', label: 'Mano en cintura' },
  { value: 'manosPecho', label: 'Mano en pecho' },
  { value: 'manoRodilla', label: 'Mano en rodilla' },
  { value: 'manoMuslo', label: 'Mano en muslo' },
  { value: 'manoPantorrilla', label: 'Mano en pantorrilla' },
  { value: 'codoRodilla', label: 'Codo en rodilla' },
];

const ANGLE_META: Array<{ key: KateAngleKey; label: string }> = [
  { key: 'neck', label: 'Cuello' },
  { key: 'trunk', label: 'Tronco' },
  { key: 'armL', label: 'Brazo izq.' },
  { key: 'armR', label: 'Brazo der.' },
  { key: 'forearmL', label: 'Codo izq.' },
  { key: 'forearmR', label: 'Codo der.' },
  { key: 'hipL', label: 'Cadera izq.' },
  { key: 'hipR', label: 'Cadera der.' },
  { key: 'kneeL', label: 'Rodilla izq.' },
  { key: 'kneeR', label: 'Rodilla der.' },
];

const DEFAULT_BONE_OVERRIDE: KateBoneOverride = { rx: 0, ry: 0, rz: 0, lenScale: 1 };

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo decodificar la imagen seleccionada.'));
    img.src = src;
  });
}

function CompactSlider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '°',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (val: number) => void;
}) {
  const display = step < 1 ? Math.round(value * 100) / 100 : Math.round(value);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-slate-700 font-medium truncate">{label}</span>
        <span className="font-mono text-[11px] tabular-nums text-slate-900 font-semibold shrink-0">
          {display}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-slate-900"
      />
    </div>
  );
}

function HandContextualPanel({
  sideLabel,
  hand,
  onChange,
}: {
  sideLabel: string;
  hand: KateHandPoseParams;
  onChange: (next: KateHandPoseParams) => void;
}) {
  return (
    <div className="space-y-2.5 pt-2.5 border-t border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-800">{sideLabel}</span>
        <div className="flex flex-wrap gap-1">
          {(
            [
              { id: 'open', label: 'Abierta' },
              { id: 'flat', label: 'Plana' },
              { id: 'relaxed', label: 'Relajada' },
              { id: 'pinch', label: 'Pinza' },
              { id: 'fist', label: 'Puño' },
            ] as const
          ).map((hp) => (
            <button
              key={hp.id}
              type="button"
              onClick={() =>
                onChange({
                  ...createDefaultHandPose(hp.id),
                  wristPitchDeg: hand.wristPitchDeg,
                  wristYawDeg: hand.wristYawDeg,
                  wristRollDeg: hand.wristRollDeg,
                })
              }
              className="px-2 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-900 hover:text-white text-[10px] font-medium text-slate-700 cursor-pointer transition-colors"
            >
              {hp.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2">
        <CompactSlider
          label="Muñeca flex"
          value={hand.wristPitchDeg}
          min={-80}
          max={80}
          onChange={(v) => onChange({ ...hand, wristPitchDeg: v })}
        />
        <CompactSlider
          label="Muñeca lat."
          value={hand.wristYawDeg}
          min={-50}
          max={50}
          onChange={(v) => onChange({ ...hand, wristYawDeg: v })}
        />
        <CompactSlider
          label="Pronación"
          value={hand.wristRollDeg}
          min={-140}
          max={140}
          onChange={(v) => onChange({ ...hand, wristRollDeg: v })}
        />
        <CompactSlider
          label="Apertura"
          value={hand.spreadDeg}
          min={-8}
          max={26}
          onChange={(v) => onChange({ ...hand, spreadDeg: v })}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-2">
        <CompactSlider
          label="Pulgar"
          value={Math.round(hand.thumb * 100)}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => onChange({ ...hand, thumb: v / 100 })}
        />
        <CompactSlider
          label="Índice"
          value={Math.round(hand.index * 100)}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => onChange({ ...hand, index: v / 100 })}
        />
        <CompactSlider
          label="Medio"
          value={Math.round(hand.middle * 100)}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => onChange({ ...hand, middle: v / 100 })}
        />
        <CompactSlider
          label="Anular"
          value={Math.round(hand.ring * 100)}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => onChange({ ...hand, ring: v / 100 })}
        />
        <CompactSlider
          label="Meñique"
          value={Math.round(hand.pinky * 100)}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => onChange({ ...hand, pinky: v / 100 })}
        />
      </div>
    </div>
  );
}

function FootContextualPanel({
  sideLabel,
  foot,
  onChange,
}: {
  sideLabel: string;
  foot: KateFootPoseParams;
  onChange: (next: KateFootPoseParams) => void;
}) {
  return (
    <div className="space-y-2.5 pt-2.5 border-t border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-800">{sideLabel}</span>
        <div className="flex flex-wrap gap-1">
          {(
            [
              { id: 'flat', label: 'Plano' },
              { id: 'plantar', label: 'Punta' },
              { id: 'dorsal', label: 'Talón' },
              { id: 'lotus', label: 'Loto' },
            ] as const
          ).map((fp) => (
            <button
              key={fp.id}
              type="button"
              onClick={() => onChange(createDefaultFootPose(fp.id))}
              className="px-2 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-900 hover:text-white text-[10px] font-medium text-slate-700 cursor-pointer transition-colors"
            >
              {fp.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2">
        <CompactSlider
          label="Dorsal/Plantar"
          value={foot.pitchDeg}
          min={-55}
          max={75}
          onChange={(v) => onChange({ ...foot, pitchDeg: v })}
        />
        <CompactSlider
          label="Inclin. planta"
          value={foot.rollDeg}
          min={-55}
          max={55}
          onChange={(v) => onChange({ ...foot, rollDeg: v })}
        />
        <CompactSlider
          label="Giro punta"
          value={foot.yawDeg}
          min={-60}
          max={60}
          onChange={(v) => onChange({ ...foot, yawDeg: v })}
        />
        <CompactSlider
          label="Dedos pie"
          value={foot.toeDeg}
          min={-45}
          max={50}
          onChange={(v) => onChange({ ...foot, toeDeg: v })}
        />
      </div>
    </div>
  );
}

function createPreloaded53BatchItems(): PhotoBatchItem[] {
  return KATE_53_CANONICAL_POSTURES.map((row) => {
    const built = buildKatePoseFromCanonicalRow(row);
    return {
      id: `kate-53-${row.n}`,
      name: built.plateTitle,
      plateTitle: built.plateTitle,
      basePosturalLabel: built.basePosturalLabel,
      src: '',
      img: null,
      referenceSrc: null,
      referenceImg: null,
      landmarks: null,
      handsLandmarks: {},
      confidence: 1,
      usedRotationDeg: 0,
      detectionStatus: 'manual',
      params: built.params,
      ergoModifiers: built.ergoModifiers,
      sheetDataUrl: null,
      angles: [],
      views: [],
      scoring: null,
    };
  });
}

export const KatePosePlatesWorkspace: React.FC<Props> = ({ onBackToEvaluator }) => {
  const [items, setItems] = useState<PhotoBatchItem[]>(() => createPreloaded53BatchItems());
  const [activeId, setActiveId] = useState<string | null>(
    () => `kate-53-${KATE_53_CANONICAL_POSTURES[0]?.n ?? 1}`,
  );
  const [standaloneParams, setStandaloneParams] = useState<KatePoseParams>(() =>
    createDefaultKatePoseParams(),
  );
  const [standalonePlateTitle, setStandalonePlateTitle] = useState<string>(
    'Lámina 01 · Postura de Referencia',
  );
  const [standaloneModifiers, setStandaloneModifiers] = useState<KateErgonomicModifiers>(() =>
    createDefaultKateErgonomicModifiers(),
  );
  const [standaloneSheetUrl, setStandaloneSheetUrl] = useState<string | null>(null);
  const [standaloneRefSrc, setStandaloneRefSrc] = useState<string | null>(null);
  const [standaloneRefImg, setStandaloneRefImg] = useState<HTMLImageElement | null>(null);
  const [standaloneAngles, setStandaloneAngles] = useState<KateMeasuredAngle[]>([]);
  const [standaloneViews, setStandaloneViews] = useState<KateTrueMagnitudeView[]>([]);
  const [standaloneScoring, setStandaloneScoring] = useState<KateStepByStepScoringResult | null>(
    null,
  );

  const [includeTable, setIncludeTable] = useState<boolean>(true);
  const [contourOutline, setContourOutline] = useState<boolean>(true);
  const [showSkeletonOverlay, setShowSkeletonOverlay] = useState<boolean>(true);
  const [showSheetSettings, setShowSheetSettings] = useState<boolean>(false);
  const [showSamplesMenu, setShowSamplesMenu] = useState<boolean>(false);

  const [selectedBone, setSelectedBone] = useState<string | null>(null);
  const [hoveredBone, setHoveredBone] = useState<string | null>(null);
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('rotate');
  const [gizmoSpace, setGizmoSpace] = useState<GizmoSpace>('local');
  const [focusRegion, setFocusRegion] = useState<FocusRegion>('body');

  const [isLoadingRig, setIsLoadingRig] = useState<boolean>(true);
  const [rigError, setRigError] = useState<string | null>(null);
  const [isRenderingSheet, setIsRenderingSheet] = useState<boolean>(false);
  const [isBatchZipping, setIsBatchZipping] = useState<boolean>(false);
  const [isExportingWord, setIsExportingWord] = useState<boolean>(false);
  const [isExportingBatchWord, setIsExportingBatchWord] = useState<boolean>(false);
  const [statusNote, setStatusNote] = useState<string>(
    '53 posturas pre-cargadas con sus ángulos de referencia. Carga cada estatuilla en Referencia o ajusta sobre Kate 3D.',
  );

  const viewportHostRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refImageInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const activeAvatarCsvInputRef = useRef<HTMLInputElement>(null);
  const printFrameRef = useRef<HTMLIFrameElement>(null);

  const liveRigRef = useRef<KateRigInstance | null>(null);
  const sheetRigRef = useRef<KateRigInstance | null>(null);
  const liveCamRef = useRef<THREE.PerspectiveCamera | null>(null);
  const liveControlsRef = useRef<OrbitControls | null>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const gizmoAnchorRef = useRef<THREE.Group | null>(null);
  const boneOverlayGroupRef = useRef<THREE.Group | null>(null);
  const boneHandlesRef = useRef<Map<string, THREE.Mesh>>(new Map());

  const requestRenderRef = useRef<(() => void) | null>(null);
  const syncBoneOverlayRef = useRef<(() => void) | null>(null);
  const syncGizmoToSelectedBoneRef = useRef<(() => void) | null>(null);
  const renderTimerRef = useRef<number | null>(null);

  const activeItem = useMemo(
    () => items.find((it) => it.id === activeId) || null,
    [items, activeId],
  );

  const currentParams = activeItem ? activeItem.params : standaloneParams;
  const currentPlateTitle = activeItem ? activeItem.plateTitle : standalonePlateTitle;
  const currentBasePosturalLabel = activeItem?.basePosturalLabel;
  const currentModifiers = activeItem ? activeItem.ergoModifiers : standaloneModifiers;
  const currentLandmarks = activeItem ? activeItem.landmarks : null;
  const currentHandsLandmarks = activeItem ? activeItem.handsLandmarks : null;
  const currentRefImage = activeItem
    ? activeItem.referenceImg ?? activeItem.img
    : standaloneRefImg;
  const currentRefSrc = activeItem
    ? activeItem.referenceSrc ?? (activeItem.src || null)
    : standaloneRefSrc;
  const currentSheetUrl = activeItem ? activeItem.sheetDataUrl : standaloneSheetUrl;
  const currentAngles = activeItem ? activeItem.angles : standaloneAngles;
  const currentViews = activeItem ? activeItem.views : standaloneViews;
  const currentScoring = activeItem ? activeItem.scoring : standaloneScoring;

  const currentParamsRef = useRef(currentParams);
  const currentLandmarksRef = useRef(currentLandmarks);
  const currentHandsRef = useRef(currentHandsLandmarks);
  const selectedBoneRef = useRef(selectedBone);
  const hoveredBoneRef = useRef(hoveredBone);
  const gizmoModeRef = useRef(gizmoMode);
  const showOverlayRef = useRef(showSkeletonOverlay);
  const focusRegionRef = useRef(focusRegion);

  currentParamsRef.current = currentParams;
  currentLandmarksRef.current = currentLandmarks;
  currentHandsRef.current = currentHandsLandmarks;
  selectedBoneRef.current = selectedBone;
  hoveredBoneRef.current = hoveredBone;
  gizmoModeRef.current = gizmoMode;
  showOverlayRef.current = showSkeletonOverlay;
  focusRegionRef.current = focusRegion;

  const updateParams = useCallback(
    (
      updater: (prev: KatePoseParams) => KatePoseParams,
      markOverride?: KateAngleKey | 'body' | 'handL' | 'handR' | 'footL' | 'footR',
    ) => {
      const applyUpdate = (prev: KatePoseParams): KatePoseParams => {
        const next = updater(prev);
        if (markOverride) {
          next.overriddenJoints = {
            ...(next.overriddenJoints || {}),
            [markOverride]: true,
          };
        }
        return next;
      };

      if (activeId) {
        setItems((prev) =>
          prev.map((it) => (it.id === activeId ? { ...it, params: applyUpdate(it.params) } : it)),
        );
      } else {
        setStandaloneParams((prev) => applyUpdate(prev));
      }
    },
    [activeId],
  );

  const updatePlateTitle = useCallback(
    (nextTitle: string) => {
      if (activeId) {
        setItems((prev) =>
          prev.map((it) => (it.id === activeId ? { ...it, plateTitle: nextTitle } : it)),
        );
      } else {
        setStandalonePlateTitle(nextTitle);
      }
    },
    [activeId],
  );

  const updateModifiers = useCallback(
    (updater: (prev: KateErgonomicModifiers) => KateErgonomicModifiers) => {
      if (activeId) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === activeId ? { ...it, ergoModifiers: updater(it.ergoModifiers) } : it,
          ),
        );
      } else {
        setStandaloneModifiers((prev) => updater(prev));
      }
    },
    [activeId],
  );

  const updateParamsRef = useRef(updateParams);
  updateParamsRef.current = updateParams;

  // Escena Three.js limpia tipo estudio + nodos articulares discretos + TransformControls Blender
  useEffect(() => {
    const host = viewportHostRef.current;
    if (!host) return;

    let disposed = false;
    const isSoft = detectSoftwareWebGL();
    const width = Math.max(300, host.clientWidth || 500);
    const height = Math.max(400, host.clientHeight || 500);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoft,
      powerPreference: 'high-performance',
      alpha: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSoft ? 1 : 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.setClearColor(0xf3f4f6, 1);
    host.innerHTML = '';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf3f4f6);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    scene.add(new THREE.HemisphereLight(0xffffff, 0xd1d5db, 0.95));
    const key = new THREE.DirectionalLight(0xffffff, 1.25);
    key.position.set(-2.2, 4.2, 3.8);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xf8fafc, 0.55);
    fill.position.set(3.0, 1.5, 2.0);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.35);
    rim.position.set(0.4, 3.0, -4.0);
    scene.add(rim);

    // Suelo de estudio sutil y limpio
    const grid = new THREE.GridHelper(2.6, 12, 0xcbd5e1, 0xe5e7eb);
    grid.position.y = 0;
    scene.add(grid);

    const camera = new THREE.PerspectiveCamera(32, width / height, 0.03, 40);
    camera.position.set(0, 1.02, 3.05);
    liveCamRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.92, 0);
    controls.enableDamping = !isSoft;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.25;
    controls.maxDistance = 7.5;
    controls.update();
    liveControlsRef.current = controls;

    // Nodos articulares sutiles y limpios (nunca bolas gigantes sobre la figura)
    const boneOverlayGroup = new THREE.Group();
    boneOverlayGroup.renderOrder = 20;
    scene.add(boneOverlayGroup);
    boneOverlayGroupRef.current = boneOverlayGroup;

    const handleMap = new Map<string, THREE.Mesh>();
    const sphereGeo = new THREE.SphereGeometry(1, 14, 10);
    const pairs: Array<{ a: string; b: string }> = [];

    for (const meta of KATE_EDITABLE_BONES) {
      const isDetailFinger =
        meta.name.includes('Thumb') ||
        meta.name.includes('Index') ||
        meta.name.includes('Middle') ||
        meta.name.includes('Ring') ||
        meta.name.includes('Pinky');
      const isSpineMinor = meta.name === 'Spine' || meta.name === 'Spine1' || meta.name.includes('Shoulder');
      const isDetailToe = meta.name.includes('ToeBase');
      const cleanR = isDetailFinger
        ? 0.004
        : isDetailToe
          ? 0.007
          : isSpineMinor
            ? 0.0065
            : 0.0085;

      const mat = new THREE.MeshBasicMaterial({
        color: 0x475569,
        depthTest: false,
        transparent: true,
        opacity: 0.45,
      });
      const sphere = new THREE.Mesh(sphereGeo, mat);
      sphere.name = `handle_${meta.name}`;
      sphere.userData.boneName = meta.name;
      sphere.userData.group = meta.group;
      sphere.userData.isDetailFinger = isDetailFinger;
      sphere.userData.isSpineMinor = isSpineMinor;
      sphere.userData.baseRadius = cleanR;
      sphere.scale.setScalar(cleanR);
      sphere.renderOrder = 22;
      boneOverlayGroup.add(sphere);
      handleMap.set(meta.name, sphere);
      if (meta.childName) {
        pairs.push({ a: meta.name, b: meta.childName });
      }
    }
    boneHandlesRef.current = handleMap;

    const lineGeo = new THREE.BufferGeometry();
    const linePosAttr = new THREE.Float32BufferAttribute(new Float32Array(pairs.length * 6), 3);
    lineGeo.setAttribute('position', linePosAttr);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x64748b,
      depthTest: false,
      transparent: true,
      opacity: 0.22,
    });
    const boneLines = new THREE.LineSegments(lineGeo, lineMat);
    boneLines.frustumCulled = false;
    boneLines.renderOrder = 18;
    boneOverlayGroup.add(boneLines);

    const gizmoAnchor = new THREE.Group();
    scene.add(gizmoAnchor);
    gizmoAnchorRef.current = gizmoAnchor;

    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.setSize(0.52);
    transformControls.setMode('rotate');
    transformControls.setSpace('local');
    scene.add(transformControls.getHelper());
    transformControlsRef.current = transformControls;

    let isGizmoDragging = false;
    let dragBoneName: string | null = null;
    const startAnchorPos = new THREE.Vector3();
    const startAnchorQuat = new THREE.Quaternion();
    const startBoneWorldQuat = new THREE.Quaternion();
    const baseLocalQuat = new THREE.Quaternion();
    let startLenScale = 1;

    const updateBoneOverlay = () => {
      const rig = liveRigRef.current;
      const grp = boneOverlayGroupRef.current;
      if (!rig || !grp) return;
      grp.visible = showOverlayRef.current;
      if (!grp.visible) return;

      rig.root.updateMatrixWorld(true);
      const ov = currentParamsRef.current.boneOverrides || {};
      const sel = selectedBoneRef.current;
      const hov = hoveredBoneRef.current;
      const focus = focusRegionRef.current;
      const selMeta = KATE_EDITABLE_BONES.find((b) => b.name === sel);
      const showLeftFingers = focus === 'handL' || selMeta?.group === 'mano_i';
      const showRightFingers = focus === 'handR' || selMeta?.group === 'mano_d';

      const wp = new THREE.Vector3();
      handleMap.forEach((mesh, bName) => {
        const entry = rig.bones.get(bName);
        if (!entry) {
          mesh.visible = false;
          return;
        }
        const isFinger = Boolean(mesh.userData.isDetailFinger);
        const isSpineMinor = Boolean(mesh.userData.isSpineMinor);
        const grpName = mesh.userData.group as string;
        if (isFinger) {
          const allow =
            (grpName === 'mano_i' && showLeftFingers) ||
            (grpName === 'mano_d' && showRightFingers);
          if (!allow) {
            mesh.visible = false;
            return;
          }
        }
        if (isSpineMinor && !sel && !hov) {
          mesh.visible = false;
          return;
        }

        mesh.visible = true;
        entry.bone.getWorldPosition(wp);
        mesh.position.copy(wp);

        const baseR = (mesh.userData.baseRadius as number) || 0.0085;
        const isSel = sel === bName;
        const isHov = hov === bName;
        const hasOv = Boolean(
          ov[bName] &&
            (Math.abs(ov[bName].rx) > 0.2 ||
              Math.abs(ov[bName].ry) > 0.2 ||
              Math.abs(ov[bName].rz) > 0.2 ||
              Math.abs((ov[bName].lenScale ?? 1) - 1) > 0.015),
        );

        const mat = mesh.material as THREE.MeshBasicMaterial;
        if (isSel) {
          mat.color.setHex(0xd97706);
          mat.opacity = 0.96;
          mesh.scale.setScalar(baseR * 1.45);
        } else if (isHov) {
          mat.color.setHex(0x0284c7);
          mat.opacity = 0.92;
          mesh.scale.setScalar(baseR * 1.3);
        } else if (hasOv) {
          mat.color.setHex(0x059669);
          mat.opacity = 0.85;
          mesh.scale.setScalar(baseR * 1.15);
        } else {
          mat.color.setHex(0x475569);
          mat.opacity = 0.42;
          mesh.scale.setScalar(baseR);
        }
      });

      boneLines.visible = Boolean(sel || hov);
      if (!boneLines.visible) return;

      const arr = linePosAttr.array as Float32Array;
      const pA = new THREE.Vector3();
      const pB = new THREE.Vector3();
      for (let i = 0; i < pairs.length; i++) {
        const hA = handleMap.get(pairs[i].a);
        const eA = rig.bones.get(pairs[i].a);
        const eB = rig.bones.get(pairs[i].b);
        if (hA?.visible && eA && eB) {
          eA.bone.getWorldPosition(pA);
          eB.bone.getWorldPosition(pB);
          arr[i * 6 + 0] = pA.x;
          arr[i * 6 + 1] = pA.y;
          arr[i * 6 + 2] = pA.z;
          arr[i * 6 + 3] = pB.x;
          arr[i * 6 + 4] = pB.y;
          arr[i * 6 + 5] = pB.z;
        } else {
          arr[i * 6 + 0] = 0;
          arr[i * 6 + 1] = -99;
          arr[i * 6 + 2] = 0;
          arr[i * 6 + 3] = 0;
          arr[i * 6 + 4] = -99;
          arr[i * 6 + 5] = 0;
        }
      }
      linePosAttr.needsUpdate = true;
    };
    syncBoneOverlayRef.current = updateBoneOverlay;

    const syncGizmoToSelectedBone = () => {
      if (isGizmoDragging) return;
      const rig = liveRigRef.current;
      const sel = selectedBoneRef.current;
      if (!rig || !sel || !showOverlayRef.current) {
        transformControls.detach();
        return;
      }
      const entry = rig.bones.get(sel);
      if (!entry) {
        transformControls.detach();
        return;
      }
      rig.root.updateMatrixWorld(true);
      entry.bone.getWorldPosition(gizmoAnchor.position);
      entry.bone.getWorldQuaternion(gizmoAnchor.quaternion);
      gizmoAnchor.scale.set(1, 1, 1);
      if (transformControls.object !== gizmoAnchor) {
        transformControls.attach(gizmoAnchor);
      }
    };
    syncGizmoToSelectedBoneRef.current = syncGizmoToSelectedBone;

    let rafId = 0;
    let needsRender = true;
    let interacting = false;

    const renderLoop = () => {
      if (disposed) return;
      rafId = 0;
      const changed = controls.update();
      if (needsRender || changed || interacting) {
        renderer.render(scene, camera);
        needsRender = false;
        if (changed || interacting) {
          rafId = window.requestAnimationFrame(renderLoop);
        }
      }
    };

    const scheduleRender = () => {
      if (disposed) return;
      needsRender = true;
      if (!rafId) {
        rafId = window.requestAnimationFrame(renderLoop);
      }
    };
    requestRenderRef.current = scheduleRender;

    const onStart = () => {
      interacting = true;
      scheduleRender();
    };
    const onEnd = () => {
      interacting = false;
      scheduleRender();
    };
    controls.addEventListener('change', scheduleRender);
    controls.addEventListener('start', onStart);
    controls.addEventListener('end', onEnd);

    transformControls.addEventListener('dragging-changed', (e: { value: unknown }) => {
      const dragging = Boolean(e.value);
      controls.enabled = !dragging;
      isGizmoDragging = dragging;

      const rig = liveRigRef.current;
      const sel = selectedBoneRef.current;
      if (dragging && rig && sel) {
        dragBoneName = sel;
        const entry = rig.bones.get(sel);
        if (entry) {
          rig.root.updateMatrixWorld(true);
          startAnchorPos.copy(gizmoAnchor.position);
          startAnchorQuat.copy(gizmoAnchor.quaternion);
          entry.bone.getWorldQuaternion(startBoneWorldQuat);

          const curOv = currentParamsRef.current.boneOverrides?.[sel] || DEFAULT_BONE_OVERRIDE;
          startLenScale = curOv.lenScale ?? 1;

          const qCurOv = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(
              THREE.MathUtils.degToRad(curOv.rx || 0),
              THREE.MathUtils.degToRad(curOv.ry || 0),
              THREE.MathUtils.degToRad(curOv.rz || 0),
              'XYZ',
            ),
          );
          baseLocalQuat.copy(entry.bone.quaternion).multiply(qCurOv.invert());
        }
      } else if (!dragging) {
        dragBoneName = null;
        syncGizmoToSelectedBone();
        scheduleRender();
      }
    });

    transformControls.addEventListener('objectChange', () => {
      if (!isGizmoDragging || !dragBoneName) return;
      const rig = liveRigRef.current;
      if (!rig) return;
      const bName = dragBoneName;
      const entry = rig.bones.get(bName);
      if (!entry || !entry.bone.parent) return;

      const mode = gizmoModeRef.current;
      const curParams = currentParamsRef.current;

      if (mode === 'rotate') {
        const deltaWorldQ = gizmoAnchor.quaternion
          .clone()
          .multiply(startAnchorQuat.clone().invert());
        const desiredBoneWorldQ = deltaWorldQ.multiply(startBoneWorldQuat);
        const parentWorldQ = new THREE.Quaternion();
        entry.bone.parent.getWorldQuaternion(parentWorldQ);
        const desiredLocalQ = parentWorldQ.invert().multiply(desiredBoneWorldQ);
        const qOverride = baseLocalQuat.clone().invert().multiply(desiredLocalQ);
        const euler = new THREE.Euler().setFromQuaternion(qOverride, 'XYZ');

        const prevOv = curParams.boneOverrides?.[bName] || DEFAULT_BONE_OVERRIDE;
        const nextOv: KateBoneOverride = {
          ...prevOv,
          rx: Math.round(THREE.MathUtils.radToDeg(euler.x) * 10) / 10,
          ry: Math.round(THREE.MathUtils.radToDeg(euler.y) * 10) / 10,
          rz: Math.round(THREE.MathUtils.radToDeg(euler.z) * 10) / 10,
        };
        const nextParams: KatePoseParams = {
          ...curParams,
          boneOverrides: { ...(curParams.boneOverrides || {}), [bName]: nextOv },
        };
        applyKatePose(rig, nextParams, currentLandmarksRef.current, currentHandsRef.current);
        updateBoneOverlay();
        updateParamsRef.current((p) => ({
          ...p,
          boneOverrides: { ...(p.boneOverrides || {}), [bName]: nextOv },
        }));
      } else if (mode === 'scale') {
        const s = gizmoAnchor.scale;
        const dx = Math.abs(s.x - 1);
        const dy = Math.abs(s.y - 1);
        const dz = Math.abs(s.z - 1);
        const dominant = dy >= dx && dy >= dz ? s.y : dx >= dz ? s.x : s.z;
        const nextLen = Math.round(clamp(startLenScale * dominant, 0.45, 1.85) * 100) / 100;
        const prevOv = curParams.boneOverrides?.[bName] || DEFAULT_BONE_OVERRIDE;
        const nextOv: KateBoneOverride = { ...prevOv, lenScale: nextLen };
        const nextParams: KatePoseParams = {
          ...curParams,
          boneOverrides: { ...(curParams.boneOverrides || {}), [bName]: nextOv },
        };
        applyKatePose(rig, nextParams, currentLandmarksRef.current, currentHandsRef.current);
        updateBoneOverlay();
        updateParamsRef.current((p) => ({
          ...p,
          boneOverrides: { ...(p.boneOverrides || {}), [bName]: nextOv },
        }));
      } else if (mode === 'translate') {
        const nextOverrides = solveKateBoneWorldDrag(
          rig,
          curParams,
          currentLandmarksRef.current,
          currentHandsRef.current,
          bName,
          gizmoAnchor.position.clone(),
        );
        const nextParams: KatePoseParams = { ...curParams, boneOverrides: nextOverrides };
        applyKatePose(rig, nextParams, currentLandmarksRef.current, currentHandsRef.current);
        updateBoneOverlay();
        updateParamsRef.current((p) => ({ ...p, boneOverrides: nextOverrides }));
      }
      scheduleRender();
    });

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    let lastHoverTs = 0;

    const updateNdc = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      pointerNdc.y = -((ev.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    };

    const getVisibleHandles = () =>
      Array.from(handleMap.values()).filter((m) => m.visible);

    const onPointerDown = (ev: PointerEvent) => {
      downX = ev.clientX;
      downY = ev.clientY;
    };

    const onPointerUp = (ev: PointerEvent) => {
      if (!showOverlayRef.current || isGizmoDragging) return;
      if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 6) return;
      if (transformControls.axis !== null) return;

      updateNdc(ev);
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(getVisibleHandles(), false);
      if (hits.length > 0) {
        const boneName = hits[0].object.userData.boneName as string | undefined;
        if (boneName) {
          setSelectedBone(boneName);
          scheduleRender();
        }
      } else {
        setSelectedBone(null);
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (!showOverlayRef.current || isGizmoDragging) return;
      const now = performance.now();
      if (now - lastHoverTs < 45) return;
      lastHoverTs = now;
      updateNdc(ev);
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(getVisibleHandles(), false);
      const nextHov = hits.length > 0 ? ((hits[0].object.userData.boneName as string) || null) : null;
      if (nextHov !== hoveredBoneRef.current) {
        hoveredBoneRef.current = nextHov;
        setHoveredBone(nextHov);
        renderer.domElement.style.cursor = nextHov ? 'pointer' : 'grab';
        updateBoneOverlay();
        scheduleRender();
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);

    const ro = new ResizeObserver(() => {
      if (!host || disposed) return;
      const w = Math.max(260, host.clientWidth);
      const h = Math.max(320, host.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      scheduleRender();
    });
    ro.observe(host);

    setIsLoadingRig(true);
    setRigError(null);
    Promise.all([createKateRigInstance(true), createKateRigInstance(true)])
      .then(([liveRig, sheetRig]) => {
        if (disposed) return;
        liveRigRef.current = liveRig;
        sheetRigRef.current = sheetRig;
        scene.add(liveRig.root);
        applyKatePose(
          liveRig,
          currentParamsRef.current,
          currentLandmarksRef.current,
          currentHandsRef.current,
        );
        updateBoneOverlay();
        syncGizmoToSelectedBone();
        setIsLoadingRig(false);
        scheduleRender();
      })
      .catch((err) => {
        if (disposed) return;
        setIsLoadingRig(false);
        setRigError(err instanceof Error ? err.message : 'Error cargando /kate.glb');
      });

    return () => {
      disposed = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      controls.removeEventListener('change', scheduleRender);
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('end', onEnd);
      transformControls.detach();
      transformControls.dispose();
      controls.dispose();
      sphereGeo.dispose();
      lineGeo.dispose();
      lineMat.dispose();
      envTex.dispose();
      renderer.dispose();
      liveRigRef.current = null;
      sheetRigRef.current = null;
      transformControlsRef.current = null;
      requestRenderRef.current = null;
      syncBoneOverlayRef.current = null;
      syncGizmoToSelectedBoneRef.current = null;
    };
  }, []);

  // Atajos R / G / S / Esc tipo Blender
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (k === 'r') setGizmoMode('rotate');
      else if (k === 'g') setGizmoMode('translate');
      else if (k === 's') setGizmoMode('scale');
      else if (k === 'escape') setSelectedBone(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const tc = transformControlsRef.current;
    if (!tc) return;
    tc.setMode(gizmoMode);
    tc.setSpace(gizmoMode === 'scale' ? 'local' : gizmoSpace);
    requestRenderRef.current?.();
  }, [gizmoMode, gizmoSpace]);

  useEffect(() => {
    const rig = liveRigRef.current;
    if (!rig) return;
    rig.outlineMeshes.forEach((m) => {
      m.visible = contourOutline;
    });
    applyKatePose(rig, currentParams, currentLandmarks, currentHandsLandmarks);
    syncBoneOverlayRef.current?.();
    syncGizmoToSelectedBoneRef.current?.();
    requestRenderRef.current?.();
  }, [
    currentParams,
    currentLandmarks,
    currentHandsLandmarks,
    contourOutline,
    isLoadingRig,
    selectedBone,
    showSkeletonOverlay,
    focusRegion,
  ]);

  const regenerateSheet = useCallback(
    async (
      targetId: string | null,
      plateTitle: string,
      params: KatePoseParams,
      landmarks: KateLandmark3D[] | null,
      handsLandmarks: KateDetectedHandsLandmarks | null,
      img: HTMLImageElement | null,
      modifiers: KateErgonomicModifiers,
      basePosturalLabel?: string,
    ) => {
      const sheetRig = sheetRigRef.current;
      if (!sheetRig) return;
      setIsRenderingSheet(true);
      try {
        applyKatePose(sheetRig, params, landmarks, handsLandmarks);
        const preSnapshot = measureKateFullPoseSnapshot(sheetRig, params);
        const scoring = computeKateErgonomicScoring(
          preSnapshot,
          params,
          modifiers,
          basePosturalLabel,
        );

        const res = await renderKatePrintSheet(sheetRig, {
          title: plateTitle,
          subtitle: scoring.printSummary.subtitleLine,
          photoImage: img,
          params,
          landmarks,
          handsLandmarks,
          includeTable,
          contourOutline,
          fontPtSize: 12,
          scoringSummary: scoring.printSummary,
        });
        const url = res.canvas.toDataURL('image/png');
        if (targetId === null) {
          setStandaloneSheetUrl(url);
          setStandaloneAngles(res.angles);
          setStandaloneViews(res.views);
          setStandaloneScoring(scoring);
        } else {
          setItems((prev) =>
            prev.map((it) =>
              it.id === targetId
                ? { ...it, sheetDataUrl: url, angles: res.angles, views: res.views, scoring }
                : it,
            ),
          );
        }
      } finally {
        setIsRenderingSheet(false);
      }
    },
    [includeTable, contourOutline],
  );

  useEffect(() => {
    if (isLoadingRig || !sheetRigRef.current) return;
    if (renderTimerRef.current) window.clearTimeout(renderTimerRef.current);
    renderTimerRef.current = window.setTimeout(() => {
      void regenerateSheet(
        activeItem ? activeItem.id : null,
        currentPlateTitle,
        currentParams,
        currentLandmarks,
        currentHandsLandmarks,
        currentRefImage,
        currentModifiers,
        currentBasePosturalLabel,
      );
    }, 135);
    return () => {
      if (renderTimerRef.current) window.clearTimeout(renderTimerRef.current);
    };
  }, [
    isLoadingRig,
    activeItem?.id,
    currentRefImage,
    currentPlateTitle,
    currentBasePosturalLabel,
    currentParams,
    currentModifiers,
    currentLandmarks,
    currentHandsLandmarks,
    includeTable,
    contourOutline,
    regenerateSheet,
  ]);

  const processAndAddPhoto = async (
    name: string,
    src: string,
    suggestedPreset?: KatePresetId,
  ) => {
    setShowSamplesMenu(false);
    const id = `kate-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const initialParams = suggestedPreset
      ? getPresetKatePoseParams(suggestedPreset)
      : createDefaultKatePoseParams();
    const defaultPlateTitle = name.replace(/\.[^.]+$/, '') || 'Lámina Kate 3D';

    const pendingItem: PhotoBatchItem = {
      id,
      name,
      plateTitle: defaultPlateTitle,
      src,
      img: null,
      landmarks: null,
      handsLandmarks: {},
      confidence: 0,
      usedRotationDeg: 0,
      detectionStatus: 'detecting',
      params: initialParams,
      ergoModifiers: createDefaultKateErgonomicModifiers(),
      sheetDataUrl: null,
      angles: [],
      views: [],
      scoring: null,
    };

    setItems((prev) => [...prev, pendingItem]);
    setActiveId(id);
    setStatusNote(`Detectando cuerpo, manos y pies en "${name}"...`);

    try {
      const img = await loadImageElement(src);
      const det = await detectKateLandmarksFromImage(img);
      let nextParams = initialParams;
      let status: 'ok' | 'manual' = 'manual';
      if (det.landmarks) {
        nextParams = extractKatePoseParamsFromLandmarks(
          det.landmarks,
          initialParams,
          det.handsLandmarks,
        );
        status = 'ok';
        setStatusNote(
          `Postura copiada (${Math.round(det.confidence * 100)}%). Haz clic en cualquier hueso de Kate para ajustar.`,
        );
      } else {
        setStatusNote(`Sin detección automática en "${name}"; edita libremente sobre Kate.`);
      }

      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? {
                ...it,
                img,
                landmarks: det.landmarks,
                handsLandmarks: det.handsLandmarks,
                confidence: det.confidence,
                usedRotationDeg: det.usedRotationDeg,
                detectionStatus: status,
                params: nextParams,
              }
            : it,
        ),
      );
    } catch {
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, detectionStatus: 'manual' } : it)),
      );
      setStatusNote(`Error leyendo "${name}".`);
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const url = URL.createObjectURL(file);
      await processAndAddPhoto(file.name, url);
    }
  };

  // Carga SOLO la estatuilla/dibujo en el recuadro "Referencia" SIN tocar ángulos ni postura 3D de Kate
  const handleReferenceImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArr = Array.from(files);

    if (fileArr.length === 1) {
      const file = fileArr[0];
      const url = URL.createObjectURL(file);
      try {
        const img = await loadImageElement(url);
        if (activeId) {
          setItems((prev) =>
            prev.map((it) =>
              it.id === activeId ? { ...it, referenceSrc: url, referenceImg: img } : it,
            ),
          );
        } else {
          setStandaloneRefSrc(url);
          setStandaloneRefImg(img);
        }
        setStatusNote(
          `Estatuilla cargada en Referencia ("${file.name}"). Los ángulos de Kate se mantuvieron sin cambios.`,
        );
      } catch {
        setStatusNote(`No se pudo cargar la estatuilla "${file.name}".`);
      }
      return;
    }

    // Múltiples dibujos de referencia: emparejar con láminas existentes por nombre (sin tocar poses)
    let matched = 0;
    const loaded: Array<{ file: File; url: string; img: HTMLImageElement }> = [];
    for (const f of fileArr) {
      const url = URL.createObjectURL(f);
      try {
        const img = await loadImageElement(url);
        loaded.push({ file: f, url, img });
      } catch {
        // Ignorar archivo ilegible
      }
    }
    if (loaded.length === 0) return;

    const norm = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-z0-9]+/g, '');

    if (items.length > 0) {
      setItems((prev) =>
        prev.map((it) => {
          const itNorm = norm(it.plateTitle || it.name);
          const hit = loaded.find((entry) => {
            const fNorm = norm(entry.file.name);
            return fNorm && itNorm && (itNorm.includes(fNorm) || fNorm.includes(itNorm));
          });
          if (hit) {
            matched++;
            return { ...it, referenceSrc: hit.url, referenceImg: hit.img };
          }
          return it;
        }),
      );
      if (matched === 0 && activeId) {
        const first = loaded[0];
        setItems((prev) =>
          prev.map((it) =>
            it.id === activeId
              ? { ...it, referenceSrc: first.url, referenceImg: first.img }
              : it,
          ),
        );
        matched = 1;
      }
      setStatusNote(
        `Referencias asignadas (${matched} lámina(s)) sin modificar los ángulos del avatar.`,
      );
    } else {
      setStandaloneRefSrc(loaded[0].url);
      setStandaloneRefImg(loaded[0].img);
      setStatusNote(
        `Estatuilla cargada en Referencia ("${loaded[0].file.name}") sin alterar ángulos.`,
      );
    }
  };

  const handleClearReference = () => {
    if (activeId) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === activeId
            ? { ...it, referenceSrc: null, referenceImg: null, src: '', img: null }
            : it,
        ),
      );
    } else {
      setStandaloneRefSrc(null);
      setStandaloneRefImg(null);
    }
    setStatusNote('Imagen de referencia retirada; los ángulos actuales de Kate se conservan.');
  };

  // Importar archivo CSV con nombres de láminas (y ángulos opcionales pre-cargados) para generarlas y ajustarlas luego
  const handleCsvUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    try {
      const text = await file.text();
      const rows = parseKatePlatesCsv(text);
      if (rows.length === 0) {
        setStatusNote(`El archivo CSV "${file.name}" no contiene filas válidas.`);
        return;
      }

      const baseTs = Date.now();
      const newItems: PhotoBatchItem[] = await Promise.all(
        rows.map(async (r, idx) => {
          let refImg: HTMLImageElement | null = null;
          if (r.referenceImageUrl) {
            try {
              refImg = await loadImageElement(r.referenceImageUrl);
            } catch {
              refImg = null;
            }
          }
          return {
            id: `kate-csv-${baseTs}-${idx}`,
            name: r.plateTitle,
            plateTitle: r.plateTitle,
            basePosturalLabel: r.basePosturalLabel,
            src: '',
            img: null,
            referenceSrc: r.referenceImageUrl ?? null,
            referenceImg: refImg,
            landmarks: null,
            handsLandmarks: {},
            confidence: r.hasCustomAngles ? 1 : 0,
            usedRotationDeg: 0,
            detectionStatus: 'manual',
            params: r.params,
            ergoModifiers: r.ergoModifiers,
            sheetDataUrl: null,
            angles: [],
            views: [],
            scoring: null,
          };
        }),
      );

      setItems((prev) => [...prev, ...newItems]);
      setActiveId(newItems[0].id);
      setStatusNote(
        `CSV "${file.name}": ${newItems.length} lámina(s) generadas. Carga cada estatuilla y ajusta ángulos sobre Kate.`,
      );
    } catch {
      setStatusNote(`No se pudo leer el archivo CSV "${file.name}".`);
    }
  };

  // Importa un CSV directamente al avatar activo (conservando su estatuilla de referencia)
  const handleImportCsvToActiveAvatar = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    try {
      const text = await file.text();
      const rows = parseKatePlatesCsv(text);
      if (rows.length === 0) {
        setStatusNote(`El CSV "${file.name}" no contiene filas válidas para el avatar actual.`);
        return;
      }

      const activeIdx = activeItem ? items.findIndex((it) => it.id === activeItem.id) : -1;
      const activeNumMatch = currentPlateTitle.match(/^\s*(\d+)\./);
      const activeNum = activeNumMatch ? Number(activeNumMatch[1]) : activeIdx >= 0 ? activeIdx + 1 : 1;
      const normText = (s: string) =>
        s
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/^\d+\.\s*/, '')
          .trim();

      let chosen = rows[0];
      if (rows.length > 1) {
        const byNum = rows.find((r) => r.nVal === activeNum);
        const activeTitleClean = normText(currentPlateTitle);
        const byName = rows.find((r) => {
          const rn = normText(r.plateTitle);
          return rn && activeTitleClean && (rn === activeTitleClean || activeTitleClean.includes(rn) || rn.includes(activeTitleClean));
        });
        chosen = byNum ?? byName ?? rows[0];
      }

      let refImg: HTMLImageElement | null = null;
      if (chosen.referenceImageUrl) {
        try {
          refImg = await loadImageElement(chosen.referenceImageUrl);
        } catch {
          refImg = null;
        }
      }

      if (activeItem) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === activeItem.id
              ? {
                  ...it,
                  name: chosen.plateTitle || it.name,
                  plateTitle: chosen.plateTitle || it.plateTitle,
                  basePosturalLabel: chosen.basePosturalLabel ?? it.basePosturalLabel,
                  params: chosen.params,
                  ergoModifiers: chosen.ergoModifiers,
                  referenceSrc: chosen.referenceImageUrl ?? it.referenceSrc ?? null,
                  referenceImg: refImg ?? it.referenceImg ?? null,
                  landmarks: null,
                  handsLandmarks: {},
                  confidence: 1,
                  detectionStatus: 'manual',
                }
              : it,
          ),
        );
      } else {
        setStandalonePlateTitle(chosen.plateTitle);
        setStandaloneParams(chosen.params);
        setStandaloneModifiers(chosen.ergoModifiers);
        if (refImg && chosen.referenceImageUrl) {
          setStandaloneRefSrc(chosen.referenceImageUrl);
          setStandaloneRefImg(refImg);
        }
      }

      setStatusNote(
        `CSV aplicado al avatar actual ("${chosen.plateTitle}") desde "${file.name}".`,
      );
    } catch {
      setStatusNote(`No se pudo leer el archivo CSV "${file.name}".`);
    }
  };

  const buildCsvExportRow = (
    n: number,
    plateTitle: string,
    params: KatePoseParams,
    ergoModifiers: KateErgonomicModifiers,
    basePosturalLabel?: string,
  ): KateCsvExportRowInput => {
    const hasBoneOverrides = Object.values(params.boneOverrides || {}).some(
      (ov) =>
        Math.abs(ov.rx || 0) > 0.2 ||
        Math.abs(ov.ry || 0) > 0.2 ||
        Math.abs(ov.rz || 0) > 0.2 ||
        Math.abs((ov.lenScale ?? 1) - 1) > 0.015,
    );

    let measuredAngles: KateCsvExportRowInput['measuredAngles'];
    if (hasBoneOverrides && sheetRigRef.current) {
      applyKatePose(sheetRigRef.current, params, null, null);
      const snap = measureKateFullPoseSnapshot(sheetRigRef.current, params);
      const getAng = (k: KateAngleKey, fallback: number) =>
        snap.allAngles.find((a) => a.key === k)?.rawDeg ?? fallback;
      measuredAngles = {
        neckFlexDeg: getAng('neck', params.neckFlexDeg),
        trunkFlexDeg: getAng('trunk', params.trunkFlexDeg),
        shoulderLFlexDeg: getAng('armL', params.shoulderLFlexDeg),
        shoulderRFlexDeg: getAng('armR', params.shoulderRFlexDeg),
        elbowLFlexDeg: getAng('forearmL', params.elbowLFlexDeg),
        elbowRFlexDeg: getAng('forearmR', params.elbowRFlexDeg),
        kneeLFlexDeg: getAng('kneeL', snap.kneeLFlexDeg),
        kneeRFlexDeg: getAng('kneeR', snap.kneeRFlexDeg),
        wristLFlexDeg: snap.wristLFlexDeg,
        wristRFlexDeg: snap.wristRFlexDeg,
      };
    }

    return {
      n,
      plateTitle,
      basePosturalLabel,
      params,
      ergoModifiers,
      measuredAngles,
    };
  };

  const triggerCsvDownload = (csvContent: string, filename: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const dl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = dl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(dl);
  };

  const handleExportActiveAvatarCsv = () => {
    const activeIdx = activeItem ? items.findIndex((it) => it.id === activeItem.id) : 0;
    const matchNum = currentPlateTitle.match(/^\s*(\d+)\./);
    const n = matchNum ? Number(matchNum[1]) : activeIdx >= 0 ? activeIdx + 1 : 1;
    const row = buildCsvExportRow(
      n,
      currentPlateTitle,
      currentParams,
      currentModifiers,
      currentBasePosturalLabel,
    );
    const csvText = serializeKatePlatesToCsv([row]);
    const cleanSlug = (currentPlateTitle || 'avatar_kate')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const filename = `Kate_${cleanSlug || 'avatar'}_actual.csv`;
    triggerCsvDownload(csvText, filename);
    setStatusNote(`CSV del avatar actual descargado (${filename}).`);
  };

  const handleExportAllAvatarsCsv = () => {
    if (items.length === 0) {
      handleExportActiveAvatarCsv();
      return;
    }
    const rows = items.map((it, idx) => {
      const m = it.plateTitle.match(/^\s*(\d+)\./);
      const n = m ? Number(m[1]) : idx + 1;
      return buildCsvExportRow(
        n,
        it.plateTitle || it.name,
        it.params,
        it.ergoModifiers,
        it.basePosturalLabel,
      );
    });
    const csvText = serializeKatePlatesToCsv(rows);
    const filename = `Kate_${items.length}_Posturas_actual.csv`;
    triggerCsvDownload(csvText, filename);
    setStatusNote(`CSV completo descargado con ${rows.length} avatar(es) (${filename}).`);
  };

  const handleReDetectActive = async () => {
    if (!activeItem || !activeItem.img) return;
    setStatusNote(`Re-detectando postura en "${activeItem.name}"...`);
    setItems((prev) =>
      prev.map((it) => (it.id === activeItem.id ? { ...it, detectionStatus: 'detecting' } : it)),
    );
    const det = await detectKateLandmarksFromImage(activeItem.img);
    if (det.landmarks) {
      const nextParams = extractKatePoseParamsFromLandmarks(
        det.landmarks,
        activeItem.params,
        det.handsLandmarks,
      );
      setItems((prev) =>
        prev.map((it) =>
          it.id === activeItem.id
            ? {
                ...it,
                landmarks: det.landmarks,
                handsLandmarks: det.handsLandmarks,
                confidence: det.confidence,
                usedRotationDeg: det.usedRotationDeg,
                detectionStatus: 'ok',
                params: nextParams,
              }
            : it,
        ),
      );
      setStatusNote(`Postura actualizada (${Math.round(det.confidence * 100)}%).`);
    } else {
      setItems((prev) =>
        prev.map((it) => (it.id === activeItem.id ? { ...it, detectionStatus: 'manual' } : it)),
      );
      setStatusNote('Sin detección automática clara; ajusta directamente sobre el modelo.');
    }
  };

  const setQuickCamera = (preset: 'front' | 'right' | 'left' | 'iso') => {
    const cam = liveCamRef.current;
    const ctrl = liveControlsRef.current;
    if (!cam || !ctrl) return;
    const tgt = ctrl.target.clone();
    const d = cam.position.distanceTo(tgt) || 2.9;
    if (preset === 'front') cam.position.set(tgt.x, tgt.y + 0.04, tgt.z + d);
    else if (preset === 'right') cam.position.set(tgt.x - d, tgt.y + 0.04, tgt.z);
    else if (preset === 'left') cam.position.set(tgt.x + d, tgt.y + 0.04, tgt.z);
    else cam.position.set(tgt.x + d * 0.65, tgt.y + d * 0.2, tgt.z + d * 0.72);
    ctrl.update();
    requestRenderRef.current?.();
  };

  const focusViewportOn = (region: FocusRegion) => {
    setFocusRegion(region);
    const rig = liveRigRef.current;
    const cam = liveCamRef.current;
    const ctrl = liveControlsRef.current;
    if (!rig || !cam || !ctrl) return;
    rig.root.updateMatrixWorld(true);
    const p = new THREE.Vector3(0, 0.92, 0);
    let dist = 3.0;
    if (region === 'handL') {
      rig.bones.get('LeftHand')?.bone.getWorldPosition(p);
      setSelectedBone('LeftHand');
      dist = 0.52;
    } else if (region === 'handR') {
      rig.bones.get('RightHand')?.bone.getWorldPosition(p);
      setSelectedBone('RightHand');
      dist = 0.52;
    } else if (region === 'feet') {
      const fl = rig.bones.get('LeftFoot')?.bone;
      const fr = rig.bones.get('RightFoot')?.bone;
      if (fl && fr) {
        const p1 = new THREE.Vector3();
        const p2 = new THREE.Vector3();
        fl.getWorldPosition(p1);
        fr.getWorldPosition(p2);
        p.copy(p1).add(p2).multiplyScalar(0.5);
      }
      setSelectedBone('LeftFoot');
      dist = 0.78;
    } else {
      setSelectedBone(null);
    }
    const dir = cam.position.clone().sub(ctrl.target);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0.08, 1);
    dir.normalize();
    ctrl.target.copy(p);
    cam.position.copy(p).add(dir.multiplyScalar(dist));
    ctrl.update();
    requestRenderRef.current?.();
  };

  const selectedBoneMeta = useMemo(
    () => KATE_EDITABLE_BONES.find((b) => b.name === selectedBone) || null,
    [selectedBone],
  );

  const selectedOverride: KateBoneOverride = useMemo(() => {
    if (!selectedBone) return DEFAULT_BONE_OVERRIDE;
    return currentParams.boneOverrides?.[selectedBone] || DEFAULT_BONE_OVERRIDE;
  }, [currentParams.boneOverrides, selectedBone]);

  const setSelectedBoneOverride = (patch: Partial<KateBoneOverride>) => {
    if (!selectedBone) return;
    updateParams((p) => {
      const cur = p.boneOverrides?.[selectedBone] || DEFAULT_BONE_OVERRIDE;
      return {
        ...p,
        boneOverrides: {
          ...(p.boneOverrides || {}),
          [selectedBone]: { ...cur, ...patch },
        },
      };
    });
  };

  const resetSelectedBone = () => {
    if (!selectedBone) return;
    updateParams((p) => {
      const next = { ...(p.boneOverrides || {}) };
      delete next[selectedBone];
      return { ...p, boneOverrides: next };
    });
  };

  const handleDownloadActivePng = () => {
    if (!currentSheetUrl) return;
    const a = document.createElement('a');
    const cleanSlug = (currentPlateTitle || 'kate_postura_libre')
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '');
    a.href = currentSheetUrl;
    a.download = `Lamina_Kate_BN_${cleanSlug || 'referencia'}.png`;
    a.click();
  };

  const handleExportWord6x9 = async () => {
    if (!sheetRigRef.current) return;
    setIsExportingWord(true);
    try {
      const sheetRig = sheetRigRef.current;
      applyKatePose(sheetRig, currentParams, currentLandmarks, currentHandsLandmarks);
      const snapshot = measureKateFullPoseSnapshot(sheetRig, currentParams);
      const scoring =
        currentScoring ??
        computeKateErgonomicScoring(
          snapshot,
          currentParams,
          currentModifiers,
          currentBasePosturalLabel,
        );

      const plateOnly = await renderKatePrintSheet(sheetRig, {
        photoImage: currentRefImage,
        params: currentParams,
        landmarks: currentLandmarks,
        handsLandmarks: currentHandsLandmarks,
        includeTable: false, // Renderiza exacto a 1800×1500 px para Word 6×9"
        contourOutline,
        fontPtSize: 12,
      });

      const { blob, filename } = await exportKateSheetToWord6x9Docx({
        plateName: currentPlateTitle,
        basePosturalLabel: currentBasePosturalLabel,
        sheetPngDataUrl: plateOnly.canvas.toDataURL('image/png'),
        scoring,
        convention: currentParams.convention,
      });

      const dl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(dl);
      setStatusNote(
        `Exportado Word 6×9" (${filename}) en 1 hoja con imagen ${plateOnly.canvas.width}×${plateOnly.canvas.height} px.`,
      );
    } finally {
      setIsExportingWord(false);
    }
  };

  const handleExportBatchWord6x9 = async () => {
    if (items.length === 0 || !sheetRigRef.current) return;
    setIsExportingBatchWord(true);
    try {
      const sheetRig = sheetRigRef.current;
      const plates: KateWordPlateInput[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        applyKatePose(sheetRig, it.params, it.landmarks, it.handsLandmarks);
        const snap = measureKateFullPoseSnapshot(sheetRig, it.params);
        const sc = computeKateErgonomicScoring(
          snap,
          it.params,
          it.ergoModifiers,
          it.basePosturalLabel,
        );
        const plateOnly = await renderKatePrintSheet(sheetRig, {
          photoImage: it.referenceImg ?? it.img,
          params: it.params,
          landmarks: it.landmarks,
          handsLandmarks: it.handsLandmarks,
          includeTable: false, // Renderiza exacto a 1800×1500 px para Word 6×9"
          contourOutline,
          fontPtSize: 12,
        });
        plates.push({
          plateName: it.plateTitle || it.name,
          basePosturalLabel: it.basePosturalLabel,
          sheetPngDataUrl: plateOnly.canvas.toDataURL('image/png'),
          scoring: sc,
          convention: it.params.convention,
        });
      }
      const { blob, filename } = await exportKateBatchToWord6x9Docx(
        plates,
        'Laminas_Kate_53_Posturas_6x9_BN',
      );
      const dl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(dl);
      setStatusNote(
        `Exportado libro Word 6×9" (${plates.length} láminas, 1 hoja c/u, imágenes 1800×1500 px).`,
      );
    } finally {
      setIsExportingBatchWord(false);
    }
  };

  const handlePrintActive = () => {
    if (!currentSheetUrl || !printFrameRef.current) return;
    const iframe = printFrameRef.current;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    const title = currentPlateTitle || (activeItem ? activeItem.name : 'Lámina Postural Kate 3D');
    doc.open();
    doc.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    @page { size: 6in 9in; margin: 7.5mm; }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #111111;
      font-family: Cambria, "Liberation Serif", "Times New Roman", Georgia, serif;
      font-size: 11pt;
    }
    .page { width: 100%; display: flex; flex-direction: column; align-items: center; }
    img { width: 100%; max-width: 136mm; height: auto; display: block; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style>
</head>
<body>
  <div class="page"><img src="${currentSheetUrl}" alt="Lámina B&N" /></div>
</body>
</html>`);
    doc.close();
    window.setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 120);
  };

  const handleDownloadBatchZip = async () => {
    if (items.length === 0 || !sheetRigRef.current) return;
    setIsBatchZipping(true);
    try {
      const zip = new JSZip();
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        let url = it.sheetDataUrl;
        if (!url) {
          applyKatePose(sheetRigRef.current, it.params, it.landmarks, it.handsLandmarks);
          const snap = measureKateFullPoseSnapshot(sheetRigRef.current, it.params);
          const sc = computeKateErgonomicScoring(
            snap,
            it.params,
            it.ergoModifiers,
            it.basePosturalLabel,
          );
          const res = await renderKatePrintSheet(sheetRigRef.current, {
            title: it.plateTitle,
            subtitle: sc.printSummary.subtitleLine,
            photoImage: it.referenceImg ?? it.img,
            params: it.params,
            landmarks: it.landmarks,
            handsLandmarks: it.handsLandmarks,
            includeTable,
            contourOutline,
            fontPtSize: 12,
            scoringSummary: sc.printSummary,
          });
          url = res.canvas.toDataURL('image/png');
        }
        const b64 = url.split(',')[1] || '';
        const cleanName = (it.plateTitle || it.name)
          .replace(/\.[^.]+$/, '')
          .replace(/[^a-zA-Z0-9_-]+/g, '_');
        zip.file(`${String(i + 1).padStart(2, '0')}_Lamina_Kate_${cleanName}.png`, b64, {
          base64: true,
        });
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const dl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dl;
      a.download = `Laminas_Kate_6x9_BN.zip`;
      a.click();
      URL.revokeObjectURL(dl);
    } finally {
      setIsBatchZipping(false);
    }
  };

  const isSelectedLeftHand = selectedBoneMeta?.group === 'mano_i';
  const isSelectedRightHand = selectedBoneMeta?.group === 'mano_d';
  const isSelectedLeftFoot = selectedBone === 'LeftFoot' || selectedBone === 'LeftToeBase';
  const isSelectedRightFoot = selectedBone === 'RightFoot' || selectedBone === 'RightToeBase';
  const isSelectedNeck = selectedBone === 'Neck' || selectedBone === 'Head';
  const isSelectedTrunk =
    selectedBone === 'Hips' ||
    selectedBone === 'Spine' ||
    selectedBone === 'Spine1' ||
    selectedBone === 'Spine2';

  return (
    <div className="space-y-3">
      {/* Barra superior limpia de una sola fila */}
      <div className="bg-white border border-slate-200 rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToEvaluator}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver
          </button>
          <div>
            <h1 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
              Kate 3D · Láminas en Verdadera Magnitud
            </h1>
            <p className="text-[11px] text-slate-500">
              {rigError ? `Error: ${rigError}` : statusNote}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 relative">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              void handleFileUpload(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />
          <input
            ref={refImageInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              void handleReferenceImageUpload(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            onChange={(e) => {
              void handleCsvUpload(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />
          <input
            ref={activeAvatarCsvInputRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            onChange={(e) => {
              void handleImportCsvToActiveAvatar(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => refImageInputRef.current?.click()}
            title="Cargar estatuilla o dibujo en el cuadro Referencia SIN modificar la pose ni ángulos de Kate"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-sky-700 bg-sky-50 hover:bg-sky-100 text-sky-900 text-xs font-semibold cursor-pointer"
          >
            <ImagePlus className="w-3.5 h-3.5" />
            Estatuilla ref.
          </button>

          <button
            type="button"
            onClick={() => csvInputRef.current?.click()}
            title="Importar archivo CSV para agregar láminas con su postura y ángulos"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Importar CSV
          </button>

          <button
            type="button"
            onClick={handleExportAllAvatarsCsv}
            title="Descargar CSV con los ángulos y postura base actuales de todas las láminas"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-emerald-700 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-semibold cursor-pointer tabular-nums"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            {items.length > 1 ? `CSV lote (${items.length})` : 'CSV actual'}
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Subir foto para copiar postura automáticamente con IA"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Copiar foto (IA)
          </button>

          {/* Menú compacto de muestras */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowSamplesMenu((s) => !s);
                setShowSheetSettings(false);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
            >
              Muestras
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {showSamplesMenu && (
              <div className="absolute right-0 mt-1.5 w-60 bg-white border border-slate-200 rounded-lg shadow-lg z-30 p-1.5 space-y-0.5">
                {KATE_SAMPLE_GALLERY.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => void processAndAddPhoto(sample.label, sample.url, sample.suggestedPreset)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 text-left text-xs text-slate-800 cursor-pointer"
                  >
                    <img
                      src={sample.url}
                      alt={sample.label}
                      className="w-6 h-6 object-cover rounded border border-slate-200 grayscale shrink-0"
                    />
                    <span className="truncate">{sample.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Popover compacto de opciones de lámina B&N */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowSheetSettings((s) => !s);
                setShowSamplesMenu(false);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Lámina
            </button>
            {showSheetSettings && (
              <div className="absolute right-0 mt-1.5 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-30 p-3 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">Convención codos/rodillas</span>
                  <div className="flex border border-slate-200 rounded overflow-hidden">
                    <button
                      type="button"
                      onClick={() => updateParams((p) => ({ ...p, convention: 'flex' }))}
                      className={`px-2 py-0.5 text-[11px] font-medium cursor-pointer ${
                        currentParams.convention === 'flex'
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-600'
                      }`}
                    >
                      Flex 0°
                    </button>
                    <button
                      type="button"
                      onClick={() => updateParams((p) => ({ ...p, convention: 'internal' }))}
                      className={`px-2 py-0.5 text-[11px] font-medium cursor-pointer ${
                        currentParams.convention === 'internal'
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-600'
                      }`}
                    >
                      Int. 180°
                    </button>
                  </div>
                </div>

                <CompactSlider
                  label="Giro panel Avatar"
                  value={currentParams.generalYawDeg}
                  min={-180}
                  max={180}
                  onChange={(v) => updateParams((p) => ({ ...p, generalYawDeg: v }))}
                />

                <div className="space-y-1.5 pt-1 border-t border-slate-100">
                  <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={contourOutline}
                      onChange={(e) => setContourOutline(e.target.checked)}
                    />
                    Silueta contorno B&amp;N
                  </label>
                  <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeTable}
                      onChange={(e) => setIncludeTable(e.target.checked)}
                    />
                    Tabla Cambria 12 al pie
                  </label>
                  <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentParams.flipZ}
                      onChange={(e) => updateParams((p) => ({ ...p, flipZ: e.target.checked }))}
                    />
                    Invertir profundidad (Flip Z)
                  </label>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <div className="text-[11px] font-semibold text-slate-700 mb-1.5">
                    Ángulos visibles
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[11px]">
                    {ANGLE_META.map((am) => (
                      <label key={am.key} className="flex items-center gap-1.5 text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={currentParams.show[am.key]}
                          onChange={(e) =>
                            updateParams((p) => ({
                              ...p,
                              show: { ...p.show, [am.key]: e.target.checked },
                            }))
                          }
                        />
                        <span>{am.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleDownloadActivePng}
            disabled={!currentSheetUrl}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-800 text-xs font-medium cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            PNG
          </button>

          <button
            type="button"
            onClick={() => void handleExportWord6x9()}
            disabled={isLoadingRig || isExportingWord}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-300 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            {isExportingWord ? 'Word...' : 'Word 6×9"'}
          </button>

          {items.length > 1 && (
            <button
              type="button"
              onClick={() => void handleExportBatchWord6x9()}
              disabled={isLoadingRig || isExportingBatchWord}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-indigo-700 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer tabular-nums"
            >
              <FileText className="w-3.5 h-3.5" />
              {isExportingBatchWord ? 'Word lote...' : `Word 6×9" (${items.length})`}
            </button>
          )}

          <button
            type="button"
            onClick={handlePrintActive}
            disabled={!currentSheetUrl}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-800 text-xs font-medium cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir B&amp;N
          </button>

          {items.length > 1 && (
            <button
              type="button"
              onClick={handleDownloadBatchZip}
              disabled={isBatchZipping}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer tabular-nums"
            >
              <FolderArchive className="w-3.5 h-3.5" />
              {isBatchZipping ? 'ZIP...' : `ZIP (${items.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Tira compacta de láminas cargadas desde CSV o fotos */}
      {items.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center gap-2 overflow-x-auto">
          {items.map((it, idx) => {
            const isSel = it.id === activeId;
            const thumbSrc = it.referenceSrc || it.src;
            return (
              <div
                key={it.id}
                onClick={() => setActiveId(it.id)}
                className={`shrink-0 flex items-center gap-2 px-2 py-1 rounded-md border text-xs cursor-pointer transition-colors ${
                  isSel
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
                }`}
              >
                {thumbSrc ? (
                  <img
                    src={thumbSrc}
                    alt={it.plateTitle || it.name}
                    className="w-8 h-8 object-cover rounded grayscale bg-white shrink-0"
                  />
                ) : (
                  <div
                    className={`w-8 h-8 rounded flex items-center justify-center font-mono text-[11px] font-bold shrink-0 ${
                      isSel ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {String(idx + 1).padStart(2, '0')}
                  </div>
                )}
                <div className="max-w-[140px]">
                  <div className="font-medium truncate text-[11px]">{it.plateTitle || it.name}</div>
                  <div className={`text-[10px] tabular-nums ${isSel ? 'text-slate-300' : 'text-slate-500'}`}>
                    {it.detectionStatus === 'detecting'
                      ? 'Analizando...'
                      : it.detectionStatus === 'ok'
                        ? `IA ${Math.round(it.confidence * 100)}%`
                        : it.referenceImg
                          ? 'Ref. cargada'
                          : 'Ajustar pose'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setItems((prev) => prev.filter((x) => x.id !== it.id));
                    if (activeId === it.id) setActiveId(null);
                  }}
                  className="p-0.5 rounded hover:bg-slate-700/20"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
          {activeItem && (
            <button
              type="button"
              onClick={handleReDetectActive}
              className="ml-auto shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 text-[11px] font-medium text-slate-700 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Re-detectar
            </button>
          )}
        </div>
      )}

      {/* Espacio de trabajo principal: Izquierda Visor 3D + Editor Contextual | Derecha Lámina B&N */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* COLUMNA IZQUIERDA (5 cols): Escenario 3D limpio + Slide del hueso seleccionado */}
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
          {/* Barra superior compacta del visor */}
          <div className="px-3 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-md border border-slate-200 overflow-hidden bg-slate-50">
              {(
                [
                  { id: 'rotate', label: 'Rotar (R)', Icon: RotateCw },
                  { id: 'translate', label: 'Mover IK (G)', Icon: Move },
                  { id: 'scale', label: 'Estirar (S)', Icon: Scaling },
                ] as const
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setGizmoMode(id)}
                  className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium cursor-pointer ${
                    gizmoMode === id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setGizmoSpace((s) => (s === 'local' ? 'world' : 'local'))}
                className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 text-[10px] font-mono text-slate-700 cursor-pointer"
              >
                {gizmoSpace === 'local' ? 'Local' : 'Mundo'}
              </button>
              <button
                type="button"
                onClick={() => setShowSkeletonOverlay((v) => !v)}
                title="Mostrar / ocultar nodos de articulación"
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 text-[11px] text-slate-700 cursor-pointer"
              >
                {showSkeletonOverlay ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Visor WebGL espacioso + barra flotante mínima de enfoque */}
          <div className="relative w-full h-[460px] bg-[#f3f4f6]">
            <div ref={viewportHostRef} className="w-full h-full" />

            {/* Cámaras y zoom rápido discreto arriba */}
            <div className="absolute top-2.5 left-2.5 right-2.5 flex flex-wrap items-center justify-between gap-1.5 pointer-events-none">
              <div className="flex items-center gap-1 pointer-events-auto bg-white/95 border border-slate-200 rounded-md px-1.5 py-1 shadow-xs">
                {(
                  [
                    { id: 'body', label: 'Cuerpo' },
                    { id: 'handL', label: 'Mano I' },
                    { id: 'handR', label: 'Mano D' },
                    { id: 'feet', label: 'Pies' },
                  ] as const
                ).map((zf) => (
                  <button
                    key={zf.id}
                    type="button"
                    onClick={() => focusViewportOn(zf.id)}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                      focusRegion === zf.id
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {zf.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 pointer-events-auto bg-white/95 border border-slate-200 rounded-md px-1.5 py-1 shadow-xs">
                {(
                  [
                    { id: 'front', label: 'Frente' },
                    { id: 'right', label: 'Der' },
                    { id: 'left', label: 'Izq' },
                    { id: 'iso', label: '3/4' },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setQuickCamera(c.id)}
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {hoveredBone && (
              <div className="pointer-events-none absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded bg-slate-900/90 text-white text-[11px] font-medium">
                {KATE_EDITABLE_BONES.find((b) => b.name === hoveredBone)?.labelEs || hoveredBone}
              </div>
            )}

            {isLoadingRig && (
              <div className="absolute inset-0 bg-white/85 flex flex-col items-center justify-center gap-2 text-xs font-medium text-slate-700">
                <div className="w-5 h-5 rounded-full border-2 border-slate-300 border-t-slate-900 animate-spin" />
                <span>Cargando Kate 3D...</span>
              </div>
            )}
          </div>

          {/* PANEL CONTEXTUAL ÚNICO: aparece el slide del hueso que tocaste, o postura general si no hay hueso seleccionado */}
          <div className="p-3.5 border-t border-slate-200 bg-white space-y-3">
            {selectedBone && selectedBoneMeta ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-900">
                    {selectedBoneMeta.labelEs}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={resetSelectedBone}
                      className="px-2 py-0.5 rounded border border-slate-200 hover:bg-slate-50 text-[11px] font-medium text-slate-700 cursor-pointer"
                    >
                      Reset hueso
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedBone(null)}
                      className="px-2 py-0.5 rounded border border-slate-200 hover:bg-slate-50 text-[11px] font-medium text-slate-600 cursor-pointer"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>

                {/* Sliders directos del hueso seleccionado: Estirar + Rot X/Y/Z */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2">
                  <CompactSlider
                    label="Estirar hueso"
                    value={Math.round((selectedOverride.lenScale ?? 1) * 100)}
                    min={45}
                    max={185}
                    unit="%"
                    onChange={(v) => setSelectedBoneOverride({ lenScale: v / 100 })}
                  />
                  <CompactSlider
                    label="Rot X"
                    value={selectedOverride.rx}
                    min={-180}
                    max={180}
                    onChange={(v) => setSelectedBoneOverride({ rx: v })}
                  />
                  <CompactSlider
                    label="Rot Y"
                    value={selectedOverride.ry}
                    min={-180}
                    max={180}
                    onChange={(v) => setSelectedBoneOverride({ ry: v })}
                  />
                  <CompactSlider
                    label="Rot Z"
                    value={selectedOverride.rz}
                    min={-180}
                    max={180}
                    onChange={(v) => setSelectedBoneOverride({ rz: v })}
                  />
                </div>

                {/* Controles extra automáticos según el hueso seleccionado */}
                {isSelectedLeftHand && (
                  <HandContextualPanel
                    sideLabel="Mano y dedos izquierdos"
                    hand={currentParams.handL}
                    onChange={(next) =>
                      updateParams((p) => ({ ...p, handL: next, fists: false }), 'handL')
                    }
                  />
                )}
                {isSelectedRightHand && (
                  <HandContextualPanel
                    sideLabel="Mano y dedos derechos"
                    hand={currentParams.handR}
                    onChange={(next) =>
                      updateParams((p) => ({ ...p, handR: next, fists: false }), 'handR')
                    }
                  />
                )}
                {isSelectedLeftFoot && (
                  <FootContextualPanel
                    sideLabel="Pie y tobillo izquierdo"
                    foot={currentParams.footL}
                    onChange={(next) => updateParams((p) => ({ ...p, footL: next }), 'footL')}
                  />
                )}
                {isSelectedRightFoot && (
                  <FootContextualPanel
                    sideLabel="Pie y tobillo derecho"
                    foot={currentParams.footR}
                    onChange={(next) => updateParams((p) => ({ ...p, footR: next }), 'footR')}
                  />
                )}
                {isSelectedNeck && (
                  <div className="grid grid-cols-3 gap-x-3 gap-y-2 pt-2 border-t border-slate-200">
                    <CompactSlider
                      label="Cuello flex"
                      value={currentParams.neckFlexDeg}
                      min={-60}
                      max={70}
                      onChange={(v) => updateParams((p) => ({ ...p, neckFlexDeg: v }), 'neck')}
                    />
                    <CompactSlider
                      label="Cuello lat."
                      value={currentParams.neckSideDeg}
                      min={-45}
                      max={45}
                      onChange={(v) => updateParams((p) => ({ ...p, neckSideDeg: v }), 'neck')}
                    />
                    <CompactSlider
                      label="Cuello giro"
                      value={currentParams.neckTwistDeg}
                      min={-75}
                      max={75}
                      onChange={(v) => updateParams((p) => ({ ...p, neckTwistDeg: v }), 'neck')}
                    />
                  </div>
                )}
                {isSelectedTrunk && (
                  <div className="grid grid-cols-3 gap-x-3 gap-y-2 pt-2 border-t border-slate-200">
                    <CompactSlider
                      label="Tronco flex"
                      value={currentParams.trunkFlexDeg}
                      min={-45}
                      max={110}
                      onChange={(v) => updateParams((p) => ({ ...p, trunkFlexDeg: v }), 'trunk')}
                    />
                    <CompactSlider
                      label="Tronco lat."
                      value={currentParams.trunkSideDeg}
                      min={-45}
                      max={45}
                      onChange={(v) => updateParams((p) => ({ ...p, trunkSideDeg: v }), 'trunk')}
                    />
                    <CompactSlider
                      label="Torsión"
                      value={currentParams.trunkTwistDeg}
                      min={-60}
                      max={60}
                      onChange={(v) => updateParams((p) => ({ ...p, trunkTwistDeg: v }), 'trunk')}
                    />
                  </div>
                )}
              </>
            ) : (
              /* Vista limpia cuando no hay hueso seleccionado */
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-600">
                    Toca cualquier articulación en Kate para editarla con sliders o gizmo 3D.
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateParams((p) => mirrorKatePoseLeftRight(p))}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 text-[11px] font-medium text-slate-700 cursor-pointer"
                    >
                      <FlipHorizontal2 className="w-3 h-3" />
                      Izq ↔ Der
                    </button>
                    <button
                      type="button"
                      onClick={() => updateParams(() => createDefaultKatePoseParams())}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 text-[11px] font-medium text-slate-700 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select
                    value=""
                    onChange={(e) => {
                      const val = e.target.value as KatePresetId;
                      if (val) updateParams((p) => getPresetKatePoseParams(val, p));
                    }}
                    className="px-2.5 py-1.5 rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-800"
                  >
                    <option value="">Postura base rápida...</option>
                    {PRESET_LIST.map((pr) => (
                      <option key={pr.id} value={pr.id}>
                        {pr.label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={currentParams.apoL}
                    onChange={(e) =>
                      updateParams((p) => ({ ...p, apoL: e.target.value as KateSupportType }), 'armL')
                    }
                    className="px-2.5 py-1.5 rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-800"
                  >
                    {SUPPORT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        Apoyo Izq: {opt.label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={currentParams.apoR}
                    onChange={(e) =>
                      updateParams((p) => ({ ...p, apoR: e.target.value as KateSupportType }), 'armR')
                    }
                    className="px-2.5 py-1.5 rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-800"
                  >
                    {SUPPORT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        Apoyo Der: {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA (7 cols): Lámina B&N limpia en Verdadera Magnitud + Nombre editable */}
        <div className="xl:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-1 min-w-[220px]">
              <label
                htmlFor="kate-plate-title-input"
                className="text-[11px] font-semibold text-slate-600 shrink-0"
              >
                Nombre lámina:
              </label>
              <input
                id="kate-plate-title-input"
                type="text"
                value={currentPlateTitle}
                onChange={(e) => updatePlateTitle(e.target.value)}
                placeholder="Ej: Lámina 01 · Postura de Referencia"
                className="w-full max-w-[320px] px-2.5 py-1 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-900"
                style={{ fontFamily: 'Cambria, "Liberation Serif", Georgia, serif' }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportActiveAvatarCsv}
                title="Descargar el CSV actual de este avatar (postura base y todos sus ángulos)"
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-[11px] font-semibold text-emerald-900 cursor-pointer"
              >
                <Download className="w-3 h-3" />
                CSV avatar
              </button>
              <button
                type="button"
                onClick={() => activeAvatarCsvInputRef.current?.click()}
                title="Importar un CSV directamente sobre este avatar actual para cargar/aproximar su postura"
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-800 cursor-pointer"
              >
                <FileSpreadsheet className="w-3 h-3" />
                Importar CSV a este
              </button>
              <button
                type="button"
                onClick={() => refImageInputRef.current?.click()}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-sky-300 bg-sky-50 hover:bg-sky-100 text-[11px] font-semibold text-sky-900 cursor-pointer"
              >
                <ImagePlus className="w-3 h-3" />
                {currentRefSrc ? 'Cambiar estatuilla' : 'Cargar estatuilla'}
              </button>
              {currentRefSrc && (
                <button
                  type="button"
                  onClick={handleClearReference}
                  title="Quitar imagen de referencia (mantiene los ángulos actuales)"
                  className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded border border-slate-200 hover:bg-slate-100 text-[11px] text-slate-600 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              <span className="text-[11px] font-mono tabular-nums text-slate-500">
                {isRenderingSheet
                  ? 'Actualizando...'
                  : `${currentAngles.length} áng. · 6×9" B&N`}
              </span>
            </div>
          </div>

          <div className="p-4 bg-slate-100/80 flex justify-center">
            {currentSheetUrl ? (
              <img
                src={currentSheetUrl}
                alt="Lámina B&N de Kate en Verdadera Magnitud"
                className="w-full max-w-[820px] h-auto bg-white border border-slate-300 shadow-xs"
              />
            ) : (
              <div className="w-full h-[540px] bg-white border border-slate-200 flex items-center justify-center text-xs text-slate-500">
                Generando lámina B&amp;N...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* INFORME INFERIOR EDITABLE EN CAMBRIA 12: Listado de ángulos + Puntuación RULA · REBA · OWAS paso a paso */}
      {currentScoring && (
        <div
          className="bg-white border border-slate-300 rounded-lg overflow-hidden text-slate-900"
          style={{ fontFamily: 'Cambria, "Liberation Serif", "Times New Roman", Georgia, serif' }}
        >
          {/* Barra superior de resultados globales y ajustes de correcciones/penalizaciones */}
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-bold text-slate-900">
                Listado de Ángulos Medidos y Cálculo Ergonómico Paso a Paso (RULA · REBA · OWAS)
              </h2>
              <p className="text-xs text-slate-600">
                Postura estática de trance sin carga (0 kg · OWAS Carga = 1) · Referencia: {currentPlateTitle || 'Sin título'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
              <span className="px-2.5 py-1 border border-slate-800 bg-white font-bold text-slate-900">
                RULA: {currentScoring.rula.finalWorst}/7 (Niv. {currentScoring.rula.actionLevel})
              </span>
              <span className="px-2.5 py-1 border border-slate-800 bg-white font-bold text-slate-900">
                REBA: {currentScoring.reba.finalWorst}/15 (Niv. {currentScoring.reba.actionLevel})
              </span>
              <span className="px-2.5 py-1 border border-slate-800 bg-white font-bold text-slate-900">
                OWAS: {currentScoring.owas.fourDigitCode} (Cat. {currentScoring.owas.actionCategory})
              </span>
            </div>
          </div>

          {/* Controles enfocados en posturas estáticas de trance (sin carga por defecto) */}
          <div className="px-4 py-2.5 border-b border-slate-200 bg-white flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-sans">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-700">Postura base:</span>
              <select
                value={currentModifiers.postureBase}
                onChange={(e) =>
                  updateModifiers((m) => ({
                    ...m,
                    postureBase: e.target.value as KateErgonomicModifiers['postureBase'],
                  }))
                }
                className="px-2 py-0.5 border border-slate-300 rounded text-xs bg-white"
              >
                <option value="auto">Automática (3D)</option>
                <option value="standing">De pie</option>
                <option value="sitting">Sentado / Loto</option>
                <option value="kneeling">Arrodillado</option>
                <option value="squat">Rodillas flexionadas</option>
                <option value="walking">Caminando</option>
              </select>
            </div>

            {(
              [
                { key: 'staticPosture', label: 'Estática (>1 min)' },
                { key: 'legsBalanced', label: 'Piernas equilibradas' },
                { key: 'shoulderLRaised', label: 'Hombro I elev.' },
                { key: 'shoulderRRaised', label: 'Hombro D elev.' },
                { key: 'armLSupported', label: 'Brazo I apoyado' },
                { key: 'armRSupported', label: 'Brazo D apoyado' },
                { key: 'forearmLCrossMidline', label: 'Anteb. I cruza' },
                { key: 'forearmRCrossMidline', label: 'Anteb. D cruza' },
              ] as const
            ).map((chk) => (
              <label key={chk.key} className="inline-flex items-center gap-1 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(currentModifiers[chk.key])}
                  onChange={(e) =>
                    updateModifiers((m) => ({ ...m, [chk.key]: e.target.checked }))
                  }
                />
                <span>{chk.label}</span>
              </label>
            ))}

            <details className="ml-auto">
              <summary className="text-[11px] font-medium text-slate-500 hover:text-slate-800 cursor-pointer select-none">
                Carga / agarre opcional ({currentModifiers.loadKg} kg)
              </summary>
              <div className="mt-2 pt-2 border-t border-slate-200 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-700">Carga (kg):</span>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    step={0.5}
                    value={currentModifiers.loadKg}
                    onChange={(e) =>
                      updateModifiers((m) => ({
                        ...m,
                        loadKg: Math.max(0, Math.min(60, Number(e.target.value) || 0)),
                      }))
                    }
                    className="w-16 px-1.5 py-0.5 border border-slate-300 rounded text-xs tabular-nums"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-700">Agarre:</span>
                  <select
                    value={currentModifiers.coupling}
                    onChange={(e) =>
                      updateModifiers((m) => ({
                        ...m,
                        coupling: Number(e.target.value) as 0 | 1 | 2 | 3,
                      }))
                    }
                    className="px-2 py-0.5 border border-slate-300 rounded text-xs bg-white"
                  >
                    <option value={0}>0 · Bueno</option>
                    <option value={1}>1 · Regular</option>
                    <option value={2}>2 · Malo</option>
                    <option value={3}>3 · Inaceptable</option>
                  </select>
                </div>
                {(
                  [
                    { key: 'repetitiveTask', label: 'Repetitiva' },
                    { key: 'unstableChanges', label: 'Inestable (REBA)' },
                    { key: 'shockForce', label: 'Impacto' },
                  ] as const
                ).map((chk) => (
                  <label key={chk.key} className="inline-flex items-center gap-1 text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(currentModifiers[chk.key])}
                      onChange={(e) =>
                        updateModifiers((m) => ({ ...m, [chk.key]: e.target.checked }))
                      }
                    />
                    <span>{chk.label}</span>
                  </label>
                ))}
              </div>
            </details>
          </div>

          <div className="p-4 space-y-4">
            {/* Resumen Editorial Compacto 6×9" (idéntico al libro impreso y Word 6×9") */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="border-t-2 border-b-2 border-slate-900 py-1.5">
                <table className="w-full border-collapse text-[13px] tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-900">
                      <th className="py-1 px-1.5 text-left font-bold">Ángulos medidos (A–E)</th>
                      <th className="py-1 px-1.5 text-right font-bold" />
                      <th className="py-1 px-1.5 text-left font-bold pl-4">(F–M)</th>
                      <th className="py-1 px-1.5 text-right font-bold" />
                    </tr>
                  </thead>
                  <tbody>
                    {(currentScoring.printSummary.compactAnglesPairRows ?? []).map((pair, idx) => (
                      <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                        <td className="py-0.5 px-1.5 text-slate-800">{pair.leftLabel}</td>
                        <td className="py-0.5 px-1.5 text-right font-bold text-slate-900">{pair.leftVal}</td>
                        <td className="py-0.5 px-1.5 pl-4 text-slate-800">{pair.rightLabel}</td>
                        <td className="py-0.5 px-1.5 text-right font-bold text-slate-900">{pair.rightVal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border-t-2 border-b-2 border-slate-900 py-1.5">
                <table className="w-full border-collapse text-[13px] tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-900">
                      <th className="py-1 px-1.5 text-left font-bold">Puntajes recalculados</th>
                      <th className="py-1 px-1.5 text-center font-bold">Lado izq.</th>
                      <th className="py-1 px-1.5 text-center font-bold">Lado der.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(currentScoring.printSummary.scoreRows ?? []).map((sr, idx) => (
                      <tr key={idx} className={sr.bold ? 'bg-slate-100 font-bold' : idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                        <td className="py-0.5 px-1.5 text-slate-900">{sr.label}</td>
                        <td className="py-0.5 px-1.5 text-center text-slate-900">{sr.left}</td>
                        <td className="py-0.5 px-1.5 text-center text-slate-900">{sr.right}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1.5 text-[11px] text-slate-600 leading-snug">
                  {currentScoring.printSummary.criteriaLine}
                </p>
              </div>
            </div>

            {/* Tabla 1: Ángulo por ángulo + Puntaje base RULA / REBA / OWAS */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-slate-800 text-[15px]">
                <thead>
                  <tr className="bg-slate-200/80 text-slate-900">
                    <th className="border border-slate-800 px-2.5 py-1.5 text-center w-14">Cód.</th>
                    <th className="border border-slate-800 px-3 py-1.5 text-left">Segmento</th>
                    <th className="border border-slate-800 px-3 py-1.5 text-center tabular-nums">Ángulo</th>
                    <th className="border border-slate-800 px-3 py-1.5 text-left">RULA (pts)</th>
                    <th className="border border-slate-800 px-3 py-1.5 text-left">REBA (pts)</th>
                    <th className="border border-slate-800 px-3 py-1.5 text-left">OWAS (cód.)</th>
                  </tr>
                </thead>
                <tbody>
                  {currentScoring.angleRows.map((row, idx) => (
                    <tr key={row.key} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                      <td className="border border-slate-400 px-2.5 py-1 text-center font-bold">
                        {row.code}
                      </td>
                      <td className="border border-slate-400 px-3 py-1 font-medium">
                        {row.segment}
                      </td>
                      <td className="border border-slate-400 px-3 py-1 text-center font-bold tabular-nums">
                        {row.angleText}
                      </td>
                      <td className="border border-slate-400 px-3 py-1 tabular-nums">
                        {row.rulaText}
                      </td>
                      <td className="border border-slate-400 px-3 py-1 tabular-nums">
                        {row.rebaText}
                      </td>
                      <td className="border border-slate-400 px-3 py-1 tabular-nums">
                        {row.owasCodeText}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bloque 2: Diagrama de Flujo RULA (Tablas 4.14–4.18) + REBA / OWAS + Penalizaciones */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Correcciones y penalizaciones */}
              <div className="lg:col-span-4 border border-slate-700 p-3 bg-white">
                <h3 className="text-[15px] font-bold border-b border-slate-300 pb-1 mb-2">
                  Correcciones / Penalizaciones Posturales
                </h3>
                {currentScoring.corrections.length > 0 ? (
                  <ul className="space-y-1 text-[14px]">
                    {currentScoring.corrections.map((c, idx) => (
                      <li key={`${c.target}-${idx}`} className="flex items-start justify-between gap-2 border-b border-slate-100 pb-1">
                        <span>
                          <strong>{c.target}</strong> ({c.method}): {c.reason}
                        </span>
                        <span className="font-bold tabular-nums shrink-0">{c.deltaText}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[14px] text-slate-600">
                    Sin penalizaciones adicionales sobre los ángulos base medidos.
                  </p>
                )}
              </div>

              {/* Cálculo paso a paso en flujo estructurado */}
              <div className="lg:col-span-8 border border-slate-700 p-3 bg-white space-y-3 text-[14px]">
                <h3 className="text-[15px] font-bold border-b border-slate-300 pb-1">
                  Cálculo Paso a Paso por Grupo (RULA · REBA · OWAS)
                </h3>

                {/* Flujo RULA según Diagrama Tablas 4.14 a 4.18 */}
                <div className="space-y-1.5 tabular-nums">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded border-2 border-sky-700 bg-sky-50/60 px-3 py-2 text-center">
                      <div className="font-bold text-slate-900">GRUPO A: Miembro Superior</div>
                      <div className="text-[12px] text-slate-600">Brazo · Antebrazo · Muñeca · Giro</div>
                      <div className="mt-1 text-[13px] font-medium">
                        Izq.: B {currentScoring.rula.armLFinal} · A {currentScoring.rula.foreLFinal} · M {currentScoring.rula.wristLFinal} · Giro {currentScoring.rula.wristLTwist}
                        <br />
                        Der.: B {currentScoring.rula.armRFinal} · A {currentScoring.rula.foreRFinal} · M {currentScoring.rula.wristRFinal} · Giro {currentScoring.rula.wristRTwist}
                      </div>
                    </div>
                    <div className="rounded border-2 border-sky-700 bg-sky-50/60 px-3 py-2 text-center">
                      <div className="font-bold text-slate-900">GRUPO B: Cuello, Tronco y Piernas</div>
                      <div className="text-[12px] text-slate-600">Ángulos respecto a ejes de referencia</div>
                      <div className="mt-1 text-[13px] font-medium">
                        Cuello {currentScoring.rula.neckFinal} · Tronco {currentScoring.rula.trunkFinal} · Piernas {currentScoring.rula.legsScore}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 text-center text-[13px] font-bold text-sky-700 leading-none">
                    <div>↓</div>
                    <div>↓</div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded border border-slate-400 bg-slate-50 px-3 py-2 text-center">
                      <div className="font-bold text-slate-900">Puntuación Global Grupo A</div>
                      <div className="text-[12px] text-slate-600">Tabla 4.14 (valores de 1 a 9)</div>
                      <div className="mt-0.5 text-[14px] font-bold">
                        Izq.: {currentScoring.rula.scoreAL} &nbsp;|&nbsp; Der.: {currentScoring.rula.scoreAR}
                      </div>
                    </div>
                    <div className="rounded border border-slate-400 bg-slate-50 px-3 py-2 text-center">
                      <div className="font-bold text-slate-900">Puntuación Global Grupo B</div>
                      <div className="text-[12px] text-slate-600">Tabla 4.15 (valores de 1 a 9)</div>
                      <div className="mt-0.5 text-[14px] font-bold">
                        Global B: {currentScoring.rula.scoreB}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 text-center text-[13px] font-bold text-sky-700 leading-none">
                    <div>↓</div>
                    <div>↓</div>
                  </div>

                  <div className="rounded border-2 border-amber-600 bg-amber-50/70 px-3 py-2 text-center">
                    <div className="font-bold text-slate-900">Correcciones: Actividad Muscular y Fuerza</div>
                    <div className="text-[12.5px] text-slate-700">
                      Tabla 4.16 (+1 estática o repetitiva): <strong>+{currentScoring.rula.muscleA}</strong> &nbsp;+&nbsp; Tabla 4.17 (0 a +3 por carga/fuerza): <strong>+{currentScoring.rula.forceA}</strong>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 text-center text-[13px] font-bold text-amber-700 leading-none">
                    <div>↙</div>
                    <div>↘</div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded border-2 border-sky-700 bg-sky-50/60 px-3 py-2 text-center">
                      <div className="font-bold text-slate-900">Puntuación C</div>
                      <div className="text-[12px] text-slate-600">Grupo A + Actividad + Fuerza</div>
                      <div className="mt-0.5 text-[13.5px] font-bold">
                        Izq.: {currentScoring.rula.scoreAL}+{currentScoring.rula.muscleA}+{currentScoring.rula.forceA} = {currentScoring.rula.scoreCL} &nbsp;|&nbsp; Der.: {currentScoring.rula.scoreAR}+{currentScoring.rula.muscleA}+{currentScoring.rula.forceA} = {currentScoring.rula.scoreCR}
                      </div>
                    </div>
                    <div className="rounded border-2 border-sky-700 bg-sky-50/60 px-3 py-2 text-center">
                      <div className="font-bold text-slate-900">Puntuación D</div>
                      <div className="text-[12px] text-slate-600">Grupo B + Actividad + Fuerza</div>
                      <div className="mt-0.5 text-[13.5px] font-bold">
                        {currentScoring.rula.scoreB} + {currentScoring.rula.muscleB} + {currentScoring.rula.forceB} = {currentScoring.rula.scoreD}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 text-center text-[13px] font-bold text-sky-700 leading-none">
                    <div>↘</div>
                    <div>↙</div>
                  </div>

                  <div className="rounded bg-slate-900 text-white px-4 py-2.5 text-center">
                    <div className="font-bold text-[15px]">
                      PUNTUACIÓN FINAL RULA (1 a 7) — Peor lado ({currentScoring.rula.worstSide}): {currentScoring.rula.finalWorst}/7
                    </div>
                    <div className="text-[12.5px] text-slate-200">
                      Tabla 4.18 (cruce C × D) · Izq.: {currentScoring.rula.finalL}/7 | Der.: {currentScoring.rula.finalR}/7 · {currentScoring.rula.actionText}
                    </div>
                  </div>
                </div>

                {/* Flujo estructurado REBA (Tablas A, B y C) */}
                <div className="border-t border-slate-300 pt-2.5 space-y-1.5 tabular-nums">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded border border-slate-400 bg-slate-50 px-3 py-2 text-center">
                      <div className="font-bold">REBA GRUPO A: Tronco, Cuello y Piernas</div>
                      <div className="text-[12.5px] text-slate-700">
                        Tronco {currentScoring.reba.trunkFinal} · Cuello {currentScoring.reba.neckFinal} · Piernas {currentScoring.reba.legsFinal}
                      </div>
                      <div className="mt-0.5 font-bold text-[13.5px]">
                        Tabla A = {currentScoring.reba.tableA} + Carga (+{currentScoring.reba.loadPoints}) → Puntaje A = {currentScoring.reba.scoreA}
                      </div>
                    </div>
                    <div className="rounded border border-slate-400 bg-slate-50 px-3 py-2 text-center">
                      <div className="font-bold">REBA GRUPO B: Brazo, Antebrazo y Muñeca</div>
                      <div className="text-[12.5px] text-slate-700">
                        Izq. ({currentScoring.reba.armLFinal},{currentScoring.reba.foreLBase},{currentScoring.reba.wristLFinal}) → T.B {currentScoring.reba.tableBL}+{currentScoring.reba.coupling} = <strong>{currentScoring.reba.scoreBL}</strong>
                        <br />
                        Der. ({currentScoring.reba.armRFinal},{currentScoring.reba.foreRBase},{currentScoring.reba.wristRFinal}) → T.B {currentScoring.reba.tableBR}+{currentScoring.reba.coupling} = <strong>{currentScoring.reba.scoreBR}</strong>
                      </div>
                    </div>
                  </div>
                  <div className="rounded bg-slate-800 text-white px-3 py-2 text-center">
                    <div className="font-bold">
                      PUNTUACIÓN FINAL REBA (1 a 15) — Peor lado ({currentScoring.reba.worstSide}): {currentScoring.reba.finalWorst}/15
                    </div>
                    <div className="text-[12.5px] text-slate-200">
                      Tabla C (A×B) + Act.(+{currentScoring.reba.activityScore}) · Izq.: {currentScoring.reba.tableCL}+{currentScoring.reba.activityScore}={currentScoring.reba.finalL} | Der.: {currentScoring.reba.tableCR}+{currentScoring.reba.activityScore}={currentScoring.reba.finalR} · {currentScoring.reba.actionText}
                    </div>
                  </div>
                </div>

                {/* OWAS Código 4 dígitos */}
                <div className="rounded border border-slate-400 bg-slate-100 px-3 py-2 text-center tabular-nums">
                  <div className="font-bold">OWAS Código {currentScoring.owas.fourDigitCode} → {currentScoring.owas.actionText}</div>
                  <div className="text-[13px]">
                    Espalda ({currentScoring.owas.backCode}): {currentScoring.owas.backLabel} · Brazos ({currentScoring.owas.armsCode}): {currentScoring.owas.armsLabel} · Piernas ({currentScoring.owas.legsCode}): {currentScoring.owas.legsLabel} · Carga ({currentScoring.owas.loadCode}): {currentScoring.owas.loadLabel}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <iframe
        ref={printFrameRef}
        title="Impresión B&N Kate"
        className="w-0 h-0 border-0 absolute -left-[9999px]"
      />
    </div>
  );
};

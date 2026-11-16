import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { initHeavyPoseMoCap } from './mocapRetargeter';

export const KATE_GLB_URL = '/kate.glb';

export type KateAngleKey =
  | 'neck'
  | 'trunk'
  | 'armL'
  | 'armR'
  | 'forearmL'
  | 'forearmR'
  | 'hipL'
  | 'hipR'
  | 'kneeL'
  | 'kneeR';

export type KateSupportType =
  | 'none'
  | 'codoRodilla'
  | 'manoRodilla'
  | 'manoMuslo'
  | 'manoPantorrilla'
  | 'manoAbdomen'
  | 'manoCintura'
  | 'manosPecho';

export type KateVerticalConstraint = '' | 'up' | 'down';

export type KatePresetId =
  | 'neutral'
  | 'lotus'
  | 'kneeling'
  | 'heels'
  | 'ramp45'
  | 'hands_belly'
  | 'hands_hips'
  | 'elbows_chest';

export interface KateLandmark3D {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface KateHandPoseParams {
  wristPitchDeg: number; // -75..+75 flexión palmar(+) / extensión dorsal(-)
  wristYawDeg: number; // -45..+45 desviación radial/cubital
  wristRollDeg: number; // -120..+120 pronación/supinación
  thumb: number; // 0 (abierto) .. 1 (cerrado)
  index: number;
  middle: number;
  ring: number;
  pinky: number;
  spreadDeg: number; // -10..+25 separación dedos
}

export interface KateFootPoseParams {
  pitchDeg: number; // -50 dorsal .. +65 plantar/punta
  rollDeg: number; // -50..+50 inversión/eversión (planta adentro en loto)
  yawDeg: number; // -55..+55 rotación punta pie izq/der
  toeDeg: number; // -45..+45 flexión dedos pie
}

export interface KateBoneOverride {
  rx: number; // grados rotación local X
  ry: number; // grados rotación local Y
  rz: number; // grados rotación local Z
  lenScale: number; // 0.45..1.85 estiramiento longitudinal del hueso
  tx?: number; // traslación manual local (en metros * 100 para unidades hueso)
  ty?: number;
  tz?: number;
}

export interface KatePoseParams {
  // Orientación global del cuerpo (útil para rampas inclinadas / decúbito / vistas)
  bodyPitchDeg: number;
  bodyRollDeg: number;
  bodyYawDeg: number;

  // Cabeza y tronco
  neckFlexDeg: number;
  neckSideDeg: number;
  neckTwistDeg: number;
  trunkFlexDeg: number;
  trunkSideDeg: number;
  trunkTwistDeg: number;

  // Brazo izquierdo
  shoulderLFlexDeg: number;
  shoulderLAbdDeg: number;
  shoulderLRotDeg?: number; // rotación axial del húmero (Brazo_I_Rot)
  elbowLFlexDeg: number; // 0° = extendido, 145° = flexionado
  forearmLVert: KateVerticalConstraint;
  forearmLPronDeg?: number; // pronosupinación del antebrazo (Antebrazo_I_Pron)
  wristLInwardDeg: number;

  // Brazo derecho
  shoulderRFlexDeg: number;
  shoulderRAbdDeg: number;
  shoulderRRotDeg?: number; // rotación axial del húmero (Brazo_D_Rot)
  elbowRFlexDeg: number;
  forearmRVert: KateVerticalConstraint;
  forearmRPronDeg?: number; // pronosupinación del antebrazo (Antebrazo_D_Pron)
  wristRInwardDeg: number;

  // Manos y Dedos (21 puntos / control fino)
  handL: KateHandPoseParams;
  handR: KateHandPoseParams;

  // Cadera y pierna izquierda
  hipLFlexDeg: number; // 0° = recto abajo, 90° = horizontal adelante
  hipLAbdDeg: number; // apertura lateral / loto
  hipLRotDeg: number; // rotación externa muslo
  kneeLFlexDeg: number; // 0° = extendido, 90° = rodillas, 145° = talones/loto

  // Cadera y pierna derecha
  hipRFlexDeg: number;
  hipRAbdDeg: number;
  hipRRotDeg: number;
  kneeRFlexDeg: number;

  // Pies y Tobillos
  footL: KateFootPoseParams;
  footR: KateFootPoseParams;

  // Posición exacta de la pelvis (Root/Hips) en el mundo (metros)
  pelvisWorldPos?: { x: number; y: number; z: number } | null;

  // Apoyos y manos
  apoL: KateSupportType;
  apoR: KateSupportType;
  fists: boolean;
  flipZ: boolean;

  // Opciones de visualización en lámina
  convention: 'flex' | 'internal';
  show: Record<KateAngleKey, boolean>;
  generalYawDeg: number; // Giro extra en vista Avatar de la lámina

  // Seguimiento híbrido de foto detectada
  useRawLandmarks: boolean;
  overriddenJoints: Partial<Record<KateAngleKey | 'body' | 'handL' | 'handR' | 'footL' | 'footR', boolean>>;

  // Corrección directa por hueso tipo Blender (rotación, estiramiento longitudinal, posición)
  boneOverrides: Record<string, KateBoneOverride>;
  // Rotaciones locales exactas en radianes [rx, ry, rz] por hueso (importación avanzada Three.js)
  exactBoneEulerRad?: Record<string, [number, number, number]> | null;
}

export interface KateMeasuredAngle {
  key: KateAngleKey;
  letter: string;
  labelEs: string;
  signed: boolean;
  isFlexSegment: boolean; // E, F, I/G, J/H usan flexión desde prolongación vs ángulo interno
  isProlongation?: boolean; // true para antebrazo (prolongación brazo) y pierna (prolongación muslo)
  rawDeg: number;
  displayDeg: number;
  textValue: string;
  vertexWorld: THREE.Vector3;
  uDirWorld: THREE.Vector3;
  vDirWorld: THREE.Vector3;
  normalWorld: THREE.Vector3;
  arcRadiusMeters: number;
}

export interface KateFullPoseAnglesSnapshot {
  allAngles: KateMeasuredAngle[];
  visibleAngles: KateMeasuredAngle[];
  shoulderLAbdDeg: number;
  shoulderRAbdDeg: number;
  armLElevDeg: number;
  armRElevDeg: number;
  trunkTwistDeg: number;
  trunkSideDeg: number;
  neckTwistDeg: number;
  neckSideDeg: number;
  wristLFlexDeg: number;
  wristRFlexDeg: number;
  wristLYawDeg: number;
  wristRYawDeg: number;
  wristLRollDeg: number;
  wristRRollDeg: number;
  hipLFlexDeg: number;
  hipRFlexDeg: number;
  hipLAbdDeg: number;
  hipRAbdDeg: number;
  kneeLFlexDeg: number;
  kneeRFlexDeg: number;
}

export interface KateTrueMagnitudeView {
  title: string;
  cameraDirWorld: THREE.Vector3;
  angles: KateMeasuredAngle[];
}

export interface KateSheetPrintSummary {
  subtitleLine?: string;
  compactAnglesPairRows?: Array<{
    leftLabel: string;
    leftVal: string;
    rightLabel: string;
    rightVal: string;
  }>;
  scoreRows?: Array<{
    label: string;
    left: string;
    right: string;
    bold?: boolean;
  }>;
  criteriaLine?: string;
  angleRows: Array<{
    code: string;
    segment: string;
    angleText: string;
    rulaText: string;
    rebaText: string;
    owasText: string;
  }>;
  correctionsText: string;
  groupStepLines: string[];
  finalSummaryLine: string;
}

export interface KateSheetOptions {
  title?: string;
  subtitle?: string;
  photoImage: HTMLImageElement | HTMLCanvasElement | null;
  params: KatePoseParams;
  landmarks?: KateLandmark3D[] | null;
  handsLandmarks?: KateDetectedHandsLandmarks | null;
  includeTable?: boolean;
  contourOutline?: boolean;
  fontPtSize?: number; // Cambria 12 por defecto
  scoringSummary?: KateSheetPrintSummary | null;
}

export interface KateBoneEntry {
  bone: THREE.Bone;
  restPos: THREE.Vector3;
  restQuat: THREE.Quaternion;
}

export interface KateRigInstance {
  root: THREE.Group;
  armature: THREE.Object3D;
  bones: Map<string, KateBoneEntry>;
  skinnedMeshes: THREE.SkinnedMesh[];
  outlineMeshes: THREE.SkinnedMesh[];
  neutralHeadLocalOffset: THREE.Vector3;
}

const DEFAULT_SHOW: Record<KateAngleKey, boolean> = {
  neck: true,
  trunk: true,
  armL: true,
  armR: true,
  forearmL: true,
  forearmR: true,
  hipL: false,
  hipR: false,
  kneeL: true,
  kneeR: true,
};

export function createDefaultHandPose(preset: 'relaxed' | 'open' | 'fist' | 'pinch' | 'flat' = 'relaxed'): KateHandPoseParams {
  if (preset === 'open') {
    return { wristPitchDeg: 0, wristYawDeg: 0, wristRollDeg: 0, thumb: 0.05, index: 0.04, middle: 0.04, ring: 0.05, pinky: 0.06, spreadDeg: 10 };
  }
  if (preset === 'fist') {
    return { wristPitchDeg: 0, wristYawDeg: 0, wristRollDeg: 0, thumb: 0.85, index: 0.96, middle: 0.98, ring: 0.98, pinky: 0.96, spreadDeg: 0 };
  }
  if (preset === 'pinch') {
    return { wristPitchDeg: 6, wristYawDeg: 0, wristRollDeg: 0, thumb: 0.55, index: 0.62, middle: 0.35, ring: 0.45, pinky: 0.55, spreadDeg: 4 };
  }
  if (preset === 'flat') {
    return { wristPitchDeg: 0, wristYawDeg: 0, wristRollDeg: 0, thumb: 0.08, index: 0.02, middle: 0.02, ring: 0.03, pinky: 0.04, spreadDeg: 2 };
  }
  return { wristPitchDeg: 0, wristYawDeg: 0, wristRollDeg: 0, thumb: 0.22, index: 0.24, middle: 0.28, ring: 0.32, pinky: 0.36, spreadDeg: 3 };
}

export function createDefaultFootPose(preset: 'flat' | 'plantar' | 'dorsal' | 'lotus' = 'flat'): KateFootPoseParams {
  if (preset === 'plantar') return { pitchDeg: 38, rollDeg: 0, yawDeg: 0, toeDeg: 10 };
  if (preset === 'dorsal') return { pitchDeg: -22, rollDeg: 0, yawDeg: 0, toeDeg: -8 };
  if (preset === 'lotus') return { pitchDeg: 22, rollDeg: 30, yawDeg: -14, toeDeg: 4 };
  return { pitchDeg: 0, rollDeg: 0, yawDeg: 4, toeDeg: 0 };
}

export function createDefaultKatePoseParams(): KatePoseParams {
  return {
    bodyPitchDeg: 0,
    bodyRollDeg: 0,
    bodyYawDeg: 0,
    neckFlexDeg: -22,
    neckSideDeg: 0,
    neckTwistDeg: 0,
    trunkFlexDeg: 8,
    trunkSideDeg: 0,
    trunkTwistDeg: 0,
    shoulderLFlexDeg: 18,
    shoulderLAbdDeg: 8,
    shoulderLRotDeg: 0,
    elbowLFlexDeg: 58,
    forearmLVert: '',
    forearmLPronDeg: 0,
    wristLInwardDeg: 0,
    shoulderRFlexDeg: 16,
    shoulderRAbdDeg: 8,
    shoulderRRotDeg: 0,
    elbowRFlexDeg: 61,
    forearmRVert: '',
    forearmRPronDeg: 0,
    wristRInwardDeg: 0,
    handL: createDefaultHandPose('flat'),
    handR: createDefaultHandPose('flat'),
    hipLFlexDeg: 15,
    hipLAbdDeg: 3,
    hipLRotDeg: 0,
    kneeLFlexDeg: 25,
    hipRFlexDeg: 13,
    hipRAbdDeg: 3,
    hipRRotDeg: 0,
    kneeRFlexDeg: 21,
    footL: createDefaultFootPose('flat'),
    footR: createDefaultFootPose('flat'),
    pelvisWorldPos: null,
    apoL: 'manoAbdomen',
    apoR: 'manoAbdomen',
    fists: false,
    flipZ: false,
    convention: 'flex',
    show: { ...DEFAULT_SHOW },
    generalYawDeg: 0,
    useRawLandmarks: false,
    overriddenJoints: {},
    boneOverrides: {},
    exactBoneEulerRad: null,
  };
}

export function getPresetKatePoseParams(
  preset: KatePresetId,
  prev?: KatePoseParams,
): KatePoseParams {
  const base = createDefaultKatePoseParams();
  if (prev) {
    base.convention = prev.convention;
    base.show = { ...prev.show };
    base.flipZ = prev.flipZ;
  }
  base.useRawLandmarks = false;
  base.overriddenJoints = {};
  base.boneOverrides = {};

  switch (preset) {
    case 'neutral':
      return {
        ...base,
        neckFlexDeg: 0,
        trunkFlexDeg: 0,
        shoulderLFlexDeg: 4,
        shoulderLAbdDeg: 6,
        elbowLFlexDeg: 10,
        shoulderRFlexDeg: 4,
        shoulderRAbdDeg: 6,
        elbowRFlexDeg: 10,
        handL: createDefaultHandPose('relaxed'),
        handR: createDefaultHandPose('relaxed'),
        hipLFlexDeg: 0,
        hipLAbdDeg: 2,
        kneeLFlexDeg: 4,
        hipRFlexDeg: 0,
        hipRAbdDeg: 2,
        kneeRFlexDeg: 4,
        footL: createDefaultFootPose('flat'),
        footR: createDefaultFootPose('flat'),
        apoL: 'none',
        apoR: 'none',
      };
    case 'hands_belly':
      return {
        ...base,
        neckFlexDeg: -16,
        trunkFlexDeg: 4,
        shoulderLFlexDeg: 12,
        shoulderLAbdDeg: 14,
        elbowLFlexDeg: 66,
        shoulderRFlexDeg: 12,
        shoulderRAbdDeg: 14,
        elbowRFlexDeg: 66,
        handL: createDefaultHandPose('flat'),
        handR: createDefaultHandPose('flat'),
        hipLFlexDeg: 0,
        hipLAbdDeg: 3,
        kneeLFlexDeg: 5,
        hipRFlexDeg: 0,
        hipRAbdDeg: 3,
        kneeRFlexDeg: 5,
        footL: createDefaultFootPose('flat'),
        footR: createDefaultFootPose('flat'),
        apoL: 'manoAbdomen',
        apoR: 'manoAbdomen',
      };
    case 'hands_hips':
      return {
        ...base,
        neckFlexDeg: -4,
        trunkFlexDeg: 0,
        shoulderLFlexDeg: 6,
        shoulderLAbdDeg: 36,
        elbowLFlexDeg: 82,
        shoulderRFlexDeg: 6,
        shoulderRAbdDeg: 36,
        elbowRFlexDeg: 82,
        handL: { ...createDefaultHandPose('open'), wristPitchDeg: -22, spreadDeg: 14 },
        handR: { ...createDefaultHandPose('open'), wristPitchDeg: -22, spreadDeg: 14 },
        hipLFlexDeg: 0,
        hipLAbdDeg: 4,
        kneeLFlexDeg: 3,
        hipRFlexDeg: 0,
        hipRAbdDeg: 4,
        kneeRFlexDeg: 3,
        footL: createDefaultFootPose('flat'),
        footR: createDefaultFootPose('flat'),
        apoL: 'manoCintura',
        apoR: 'manoCintura',
      };
    case 'elbows_chest':
      return {
        ...base,
        neckFlexDeg: 0,
        trunkFlexDeg: 4,
        shoulderLFlexDeg: 78,
        shoulderLAbdDeg: 62,
        elbowLFlexDeg: 118,
        shoulderRFlexDeg: 78,
        shoulderRAbdDeg: 62,
        elbowRFlexDeg: 118,
        handL: createDefaultHandPose('fist'),
        handR: createDefaultHandPose('fist'),
        hipLFlexDeg: 85,
        hipLAbdDeg: 24,
        hipLRotDeg: 18,
        kneeLFlexDeg: 132,
        hipRFlexDeg: 85,
        hipRAbdDeg: 24,
        hipRRotDeg: 18,
        kneeRFlexDeg: 132,
        footL: createDefaultFootPose('lotus'),
        footR: createDefaultFootPose('lotus'),
        apoL: 'manosPecho',
        apoR: 'manosPecho',
        fists: true,
      };
    case 'lotus':
      return {
        ...base,
        neckFlexDeg: -8,
        trunkFlexDeg: 4,
        shoulderLFlexDeg: 28,
        shoulderLAbdDeg: 18,
        elbowLFlexDeg: 42,
        shoulderRFlexDeg: 28,
        shoulderRAbdDeg: 18,
        elbowRFlexDeg: 42,
        handL: createDefaultHandPose('relaxed'),
        handR: createDefaultHandPose('relaxed'),
        hipLFlexDeg: 88,
        hipLAbdDeg: 46,
        hipLRotDeg: 42,
        kneeLFlexDeg: 128,
        hipRFlexDeg: 88,
        hipRAbdDeg: 46,
        hipRRotDeg: 42,
        kneeRFlexDeg: 128,
        footL: createDefaultFootPose('lotus'),
        footR: createDefaultFootPose('lotus'),
        apoL: 'manoRodilla',
        apoR: 'manoRodilla',
      };
    case 'kneeling':
      return {
        ...base,
        neckFlexDeg: -24,
        trunkFlexDeg: 16,
        shoulderLFlexDeg: 26,
        shoulderLAbdDeg: 10,
        elbowLFlexDeg: 24,
        shoulderRFlexDeg: 26,
        shoulderRAbdDeg: 10,
        elbowRFlexDeg: 24,
        handL: createDefaultHandPose('open'),
        handR: createDefaultHandPose('open'),
        hipLFlexDeg: 16,
        hipLAbdDeg: 8,
        kneeLFlexDeg: 95,
        hipRFlexDeg: 16,
        hipRAbdDeg: 8,
        kneeRFlexDeg: 95,
        footL: createDefaultFootPose('plantar'),
        footR: createDefaultFootPose('plantar'),
        apoL: 'manoMuslo',
        apoR: 'manoMuslo',
      };
    case 'heels':
      return {
        ...base,
        neckFlexDeg: 0,
        trunkFlexDeg: 6,
        shoulderLFlexDeg: 20,
        shoulderLAbdDeg: 10,
        elbowLFlexDeg: 45,
        shoulderRFlexDeg: 20,
        shoulderRAbdDeg: 10,
        elbowRFlexDeg: 45,
        handL: createDefaultHandPose('relaxed'),
        handR: createDefaultHandPose('relaxed'),
        hipLFlexDeg: 96,
        hipLAbdDeg: 10,
        kneeLFlexDeg: 148,
        hipRFlexDeg: 96,
        hipRAbdDeg: 10,
        kneeRFlexDeg: 148,
        footL: createDefaultFootPose('plantar'),
        footR: createDefaultFootPose('plantar'),
        apoL: 'manoMuslo',
        apoR: 'manoMuslo',
      };
    case 'ramp45':
      return {
        ...base,
        bodyPitchDeg: -48,
        neckFlexDeg: 20,
        trunkFlexDeg: 2,
        shoulderLFlexDeg: -10,
        shoulderLAbdDeg: 28,
        elbowLFlexDeg: 12,
        shoulderRFlexDeg: -10,
        shoulderRAbdDeg: 28,
        elbowRFlexDeg: 12,
        handL: createDefaultHandPose('open'),
        handR: createDefaultHandPose('open'),
        hipLFlexDeg: 4,
        hipLAbdDeg: 3,
        kneeLFlexDeg: 4,
        hipRFlexDeg: 4,
        hipRAbdDeg: 3,
        kneeRFlexDeg: 4,
        footL: createDefaultFootPose('dorsal'),
        footR: createDefaultFootPose('dorsal'),
        apoL: 'none',
        apoR: 'none',
      };
  }
}

// ---------------------------------------------------------------------------
// Caché del modelo GLB de Kate + Creación de instancias independientes
// ---------------------------------------------------------------------------
let cachedGltfPromise: Promise<THREE.Group> | null = null;
let cachedOffscreenRenderer: THREE.WebGLRenderer | null = null;
let cachedOffscreenEnv: THREE.Texture | null = null;

export function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function loadKateBaseScene(): Promise<THREE.Group> {
  if (cachedGltfPromise) return cachedGltfPromise;
  const loader = new GLTFLoader();
  cachedGltfPromise = new Promise<THREE.Group>((resolve, reject) => {
    loader.load(
      KATE_GLB_URL,
      (gltf) => {
        resolve(gltf.scene);
      },
      undefined,
      (err) => {
        cachedGltfPromise = null;
        reject(err instanceof Error ? err : new Error('No se pudo cargar /kate.glb'));
      },
    );
  });
  return cachedGltfPromise;
}

const KATE_GRAYSCALE_TONES: Record<string, number> = {
  Ch21_Shirt: 0xdcdcdc,
  Ch21_Body: 0xbcbcbc,
  Ch21_Pants: 0x7a7a7a,
  Ch21_Hair: 0x2d2d2d,
  Ch21_Shoes: 0x202020,
  Ch21_Eyelasshes: 0x0f0f0f,
};

function createSkinnedOutlineMaterial(thicknessMeters = 0.0052): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({
    color: 0x050505,
    emissive: 0x0a0a0a,
    emissiveIntensity: 1,
    side: THREE.BackSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uOutline = { value: thicknessMeters };
    shader.vertexShader =
      'uniform float uOutline;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        `vec3 outDir = length(objectNormal) > 0.0001 ? normalize(objectNormal) : vec3(0.0, 1.0, 0.0);
        transformed += outDir * uOutline;
        #include <project_vertex>`,
      );
  };
  return mat;
}

export async function createKateRigInstance(withContour = true): Promise<KateRigInstance> {
  const baseScene = await loadKateBaseScene();
  // Clonar jerarquía preservando Skeleton correctamente con SkeletonUtils-like rebind manual
  const cloned = baseScene.clone(true);

  const root = new THREE.Group();
  root.add(cloned);

  const bones = new Map<string, KateBoneEntry>();
  const boneByName = new Map<string, THREE.Bone>();

  cloned.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) {
      const b = obj as THREE.Bone;
      const clean = b.name.replace(/^mixamorig\d*[:_]?/i, '');
      boneByName.set(b.name, b);
      boneByName.set(clean, b);
      const entry: KateBoneEntry = {
        bone: b,
        restPos: b.position.clone(),
        restQuat: b.quaternion.clone(),
      };
      bones.set(b.name, entry);
      bones.set(clean, entry);
    }
  });

  // Re-vincular skeletons en SkinnedMesh clonados (THREE.Object3D.clone no re-vincula los bones del skeleton al clon!)
  const skinnedMeshes: THREE.SkinnedMesh[] = [];
  const outlineMeshes: THREE.SkinnedMesh[] = [];
  const toAttachOutlines: Array<{ src: THREE.SkinnedMesh }> = [];

  cloned.traverse((obj) => {
    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
      const sm = obj as THREE.SkinnedMesh;
      if (sm.skeleton) {
        const mappedBones = sm.skeleton.bones.map((origB) => boneByName.get(origB.name) || origB);
        const newSkel = new THREE.Skeleton(mappedBones, sm.skeleton.boneInverses);
        sm.bind(newSkel, sm.bindMatrix);
      }
      sm.frustumCulled = false;

      const tone = KATE_GRAYSCALE_TONES[sm.name] ?? 0xb8b8b8;
      const mat = new THREE.MeshStandardMaterial({
        color: tone,
        roughness: sm.name === 'Ch21_Hair' || sm.name === 'Ch21_Shoes' ? 0.58 : 0.80,
        metalness: 0.03,
        envMapIntensity: 0.24,
      });
      sm.material = mat;
      skinnedMeshes.push(sm);

      if (withContour && sm.name !== 'Ch21_Eyelasshes') {
        toAttachOutlines.push({ src: sm });
      }
    }
  });

  const outlineMat = createSkinnedOutlineMaterial(0.0052);
  for (const { src } of toAttachOutlines) {
    const outMesh = new THREE.SkinnedMesh(src.geometry, outlineMat);
    outMesh.name = src.name + '_Outline';
    outMesh.frustumCulled = false;
    outMesh.skeleton = src.skeleton;
    outMesh.bindMatrix.copy(src.bindMatrix);
    outMesh.bindMatrixInverse.copy(src.bindMatrixInverse);
    outMesh.renderOrder = -1;
    src.parent?.add(outMesh);
    outlineMeshes.push(outMesh);
  }

  // Calibrar offset neutro de Head->HeadTop_End para que neckFlexDeg = 0 mire horizontalmente al frente
  root.updateMatrixWorld(true);
  const head = bones.get('Head')?.bone;
  const headTop = bones.get('HeadTop_End')?.bone;
  const neutralHeadLocalOffset = new THREE.Vector3(0, 1, 0);
  if (head && headTop) {
    const pH = new THREE.Vector3();
    const pT = new THREE.Vector3();
    head.getWorldPosition(pH);
    headTop.getWorldPosition(pT);
    const dir = pT.sub(pH).normalize();
    // Compensar ligera inclinación hacia adelante del crown en Mixamo
    neutralHeadLocalOffset.copy(dir).applyAxisAngle(new THREE.Vector3(1, 0, 0), -0.26).normalize();
  }

  return {
    root,
    armature: cloned,
    bones,
    skinnedMeshes,
    outlineMeshes,
    neutralHeadLocalOffset,
  };
}

// ---------------------------------------------------------------------------
// Utilidades vectoriales y Aiming de huesos Mixamo
// ---------------------------------------------------------------------------
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();

function getBoneWorldPos(rig: KateRigInstance, name: string, out = new THREE.Vector3()): THREE.Vector3 {
  const entry = rig.bones.get(name);
  if (!entry) return out.set(0, 0, 0);
  entry.bone.updateWorldMatrix(true, false);
  return entry.bone.getWorldPosition(out);
}

export function resetKatePose(rig: KateRigInstance): void {
  rig.root.position.set(0, 0, 0);
  rig.root.rotation.set(0, 0, 0);
  rig.root.quaternion.identity();
  rig.bones.forEach((entry) => {
    entry.bone.position.copy(entry.restPos);
    entry.bone.quaternion.copy(entry.restQuat);
  });
  rig.root.updateMatrixWorld(true);
}

function aimKateBone(
  rig: KateRigInstance,
  boneName: string,
  childName: string,
  targetWorldDir: THREE.Vector3,
  fraction = 1,
): void {
  const bEntry = rig.bones.get(boneName);
  const cEntry = rig.bones.get(childName);
  if (!bEntry || !cEntry || !bEntry.bone.parent) return;

  bEntry.bone.updateMatrixWorld(true);
  const bPos = _vA;
  const cPos = _vB;
  bEntry.bone.getWorldPosition(bPos);
  cEntry.bone.getWorldPosition(cPos);
  const curDir = cPos.sub(bPos);
  if (curDir.lengthSq() < 1e-8) return;
  curDir.normalize();

  const tgt = targetWorldDir.clone().normalize();
  const deltaWorld = _qA.setFromUnitVectors(curDir, tgt);
  if (fraction < 1) {
    deltaWorld.slerp(new THREE.Quaternion(), 1 - fraction);
  }

  const curWorldQ = new THREE.Quaternion();
  bEntry.bone.getWorldQuaternion(curWorldQ);
  const newWorldQ = deltaWorld.clone().multiply(curWorldQ);

  const parentWorldQ = _qB;
  bEntry.bone.parent.getWorldQuaternion(parentWorldQ);
  const newLocalQ = parentWorldQ.invert().multiply(newWorldQ);
  bEntry.bone.quaternion.copy(newLocalQ);
  bEntry.bone.updateMatrixWorld(true);
}

// ---------------------------------------------------------------------------
// Catálogo de huesos editables en 3D tipo Blender (Pose + Estiramiento)
// ---------------------------------------------------------------------------
export interface KateEditableBoneMeta {
  name: string;
  labelEs: string;
  group: 'tronco' | 'brazo_i' | 'brazo_d' | 'mano_i' | 'mano_d' | 'pierna_i' | 'pierna_d';
  childName?: string;
  ikChain?: { root: string; mid: string; end: string };
  handleRadius: number;
}

export const KATE_EDITABLE_BONES: KateEditableBoneMeta[] = [
  { name: 'Hips', labelEs: 'Pelvis / Cadera raíz', group: 'tronco', childName: 'Spine', handleRadius: 0.036 },
  { name: 'Spine', labelEs: 'Columna lumbar', group: 'tronco', childName: 'Spine1', handleRadius: 0.026 },
  { name: 'Spine1', labelEs: 'Columna dorsal', group: 'tronco', childName: 'Spine2', handleRadius: 0.026 },
  { name: 'Spine2', labelEs: 'Tórax / Pecho', group: 'tronco', childName: 'Neck', handleRadius: 0.028 },
  { name: 'Neck', labelEs: 'Cuello', group: 'tronco', childName: 'Head', handleRadius: 0.024 },
  { name: 'Head', labelEs: 'Cabeza', group: 'tronco', childName: 'HeadTop_End', handleRadius: 0.032 },

  // Brazo izquierdo
  { name: 'LeftShoulder', labelEs: 'Clavícula izquierda', group: 'brazo_i', childName: 'LeftArm', handleRadius: 0.022 },
  { name: 'LeftArm', labelEs: 'Hombro / Brazo izq.', group: 'brazo_i', childName: 'LeftForeArm', handleRadius: 0.028 },
  { name: 'LeftForeArm', labelEs: 'Codo / Antebrazo izq.', group: 'brazo_i', childName: 'LeftHand', handleRadius: 0.026 },
  { name: 'LeftHand', labelEs: 'Muñeca / Mano izquierda', group: 'mano_i', childName: 'LeftHandMiddle1', ikChain: { root: 'LeftArm', mid: 'LeftForeArm', end: 'LeftHand' }, handleRadius: 0.026 },
  { name: 'LeftHandThumb1', labelEs: 'Pulgar izq. (base)', group: 'mano_i', childName: 'LeftHandThumb2', handleRadius: 0.011 },
  { name: 'LeftHandThumb2', labelEs: 'Pulgar izq. (medio)', group: 'mano_i', childName: 'LeftHandThumb3', handleRadius: 0.009 },
  { name: 'LeftHandIndex1', labelEs: 'Índice izq. (base)', group: 'mano_i', childName: 'LeftHandIndex2', handleRadius: 0.011 },
  { name: 'LeftHandIndex2', labelEs: 'Índice izq. (medio)', group: 'mano_i', childName: 'LeftHandIndex3', handleRadius: 0.009 },
  { name: 'LeftHandMiddle1', labelEs: 'Dedo Medio izq. (base)', group: 'mano_i', childName: 'LeftHandMiddle2', handleRadius: 0.011 },
  { name: 'LeftHandRing1', labelEs: 'Anular izq. (base)', group: 'mano_i', childName: 'LeftHandRing2', handleRadius: 0.011 },
  { name: 'LeftHandPinky1', labelEs: 'Meñique izq. (base)', group: 'mano_i', childName: 'LeftHandPinky2', handleRadius: 0.011 },

  // Brazo derecho
  { name: 'RightShoulder', labelEs: 'Clavícula derecha', group: 'brazo_d', childName: 'RightArm', handleRadius: 0.022 },
  { name: 'RightArm', labelEs: 'Hombro / Brazo der.', group: 'brazo_d', childName: 'RightForeArm', handleRadius: 0.028 },
  { name: 'RightForeArm', labelEs: 'Codo / Antebrazo der.', group: 'brazo_d', childName: 'RightHand', handleRadius: 0.026 },
  { name: 'RightHand', labelEs: 'Muñeca / Mano derecha', group: 'mano_d', childName: 'RightHandMiddle1', ikChain: { root: 'RightArm', mid: 'RightForeArm', end: 'RightHand' }, handleRadius: 0.026 },
  { name: 'RightHandThumb1', labelEs: 'Pulgar der. (base)', group: 'mano_d', childName: 'RightHandThumb2', handleRadius: 0.011 },
  { name: 'RightHandThumb2', labelEs: 'Pulgar der. (medio)', group: 'mano_d', childName: 'RightHandThumb3', handleRadius: 0.009 },
  { name: 'RightHandIndex1', labelEs: 'Índice der. (base)', group: 'mano_d', childName: 'RightHandIndex2', handleRadius: 0.011 },
  { name: 'RightHandIndex2', labelEs: 'Índice der. (medio)', group: 'mano_d', childName: 'RightHandIndex3', handleRadius: 0.009 },
  { name: 'RightHandMiddle1', labelEs: 'Dedo Medio der. (base)', group: 'mano_d', childName: 'RightHandMiddle2', handleRadius: 0.011 },
  { name: 'RightHandRing1', labelEs: 'Anular der. (base)', group: 'mano_d', childName: 'RightHandRing2', handleRadius: 0.011 },
  { name: 'RightHandPinky1', labelEs: 'Meñique der. (base)', group: 'mano_d', childName: 'RightHandPinky2', handleRadius: 0.011 },

  // Piernas y Pies
  { name: 'LeftUpLeg', labelEs: 'Cadera / Muslo izquierdo', group: 'pierna_i', childName: 'LeftLeg', handleRadius: 0.030 },
  { name: 'LeftLeg', labelEs: 'Rodilla / Pierna izquierda', group: 'pierna_i', childName: 'LeftFoot', handleRadius: 0.028 },
  { name: 'LeftFoot', labelEs: 'Tobillo / Pie izquierdo', group: 'pierna_i', childName: 'LeftToeBase', ikChain: { root: 'LeftUpLeg', mid: 'LeftLeg', end: 'LeftFoot' }, handleRadius: 0.026 },
  { name: 'LeftToeBase', labelEs: 'Punta / Dedos pie izquierdo', group: 'pierna_i', childName: 'LeftToe_End', handleRadius: 0.018 },

  { name: 'RightUpLeg', labelEs: 'Cadera / Muslo derecho', group: 'pierna_d', childName: 'RightLeg', handleRadius: 0.030 },
  { name: 'RightLeg', labelEs: 'Rodilla / Pierna derecha', group: 'pierna_d', childName: 'RightFoot', handleRadius: 0.028 },
  { name: 'RightFoot', labelEs: 'Tobillo / Pie derecho', group: 'pierna_d', childName: 'RightToeBase', ikChain: { root: 'RightUpLeg', mid: 'RightLeg', end: 'RightFoot' }, handleRadius: 0.026 },
  { name: 'RightToeBase', labelEs: 'Punta / Dedos pie derecho', group: 'pierna_d', childName: 'RightToe_End', handleRadius: 0.018 },
];

export const KATE_BONE_TOPOLOGY_ORDER: string[] = KATE_EDITABLE_BONES.map((b) => b.name);

export function alignBoneToWorldBasis(
  rig: KateRigInstance,
  boneName: string,
  targetY: THREE.Vector3,
  targetZ: THREE.Vector3,
): void {
  const entry = rig.bones.get(boneName);
  if (!entry || !entry.bone.parent) return;

  const y = targetY.clone().normalize();
  const zOrtho = targetZ.clone().sub(y.clone().multiplyScalar(targetZ.dot(y)));
  if (zOrtho.lengthSq() < 1e-6) {
    // Fallback ortogonal estable
    const fallback = Math.abs(y.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    zOrtho.copy(fallback).sub(y.clone().multiplyScalar(fallback.dot(y)));
  }
  const z = zOrtho.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  z.crossVectors(x, y).normalize();

  const worldMat = new THREE.Matrix4().makeBasis(x, y, z);
  const worldQ = new THREE.Quaternion().setFromRotationMatrix(worldMat);

  entry.bone.parent.updateWorldMatrix(true, false);
  const parW = new THREE.Quaternion();
  entry.bone.parent.getWorldQuaternion(parW);
  entry.bone.quaternion.copy(parW.invert().multiply(worldQ));
  entry.bone.updateMatrixWorld(true);
}

function twistBoneAlongAxis(
  rig: KateRigInstance,
  boneName: string,
  worldAxis: THREE.Vector3,
  angleRad: number,
): void {
  const entry = rig.bones.get(boneName);
  if (!entry || !entry.bone.parent || Math.abs(angleRad) < 1e-4) return;
  const rotW = new THREE.Quaternion().setFromAxisAngle(worldAxis.clone().normalize(), angleRad);
  const curW = new THREE.Quaternion();
  entry.bone.getWorldQuaternion(curW);
  const newW = rotW.multiply(curW);
  const parW = new THREE.Quaternion();
  entry.bone.parent.getWorldQuaternion(parW);
  entry.bone.quaternion.copy(parW.invert().multiply(newW));
  entry.bone.updateMatrixWorld(true);
}

// ---------------------------------------------------------------------------
// Orientación de landmarks MediaPipe al marco anatómico de Kate (+Y up, +X izq, +Z frente)
// ---------------------------------------------------------------------------
function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}
function deg(r: number): number {
  return (r * 180) / Math.PI;
}
function rad(d: number): number {
  return (d * Math.PI) / 180;
}

function stabilizeOrientedKateLandmarks(rawPts: THREE.Vector3[]): THREE.Vector3[] {
  const pts = rawPts.map((v) => v.clone());
  if (pts.length < 33) return pts;

  const mid = (a: number, b: number) => pts[a].clone().add(pts[b]).multiplyScalar(0.5);
  let hpM = mid(23, 24);
  let shM = mid(11, 12);
  const torsoLen = Math.max(0.22, shM.distanceTo(hpM));
  let latSh = pts[11].clone().sub(pts[12]).normalize();
  let latHip = pts[23].clone().sub(pts[24]).normalize();
  let spineDir = shM.clone().sub(hpM).normalize();
  let torsoFwd = latSh.clone().cross(spineDir).normalize();

  const isFrontalTorso =
    Math.abs(torsoFwd.z) > 0.72 && Math.abs(latSh.x) > 0.72 && Math.abs(latHip.x) > 0.68;
  const isUpright = spineDir.y > 0.76;

  // 1. Estabilizar ruido Z monocular en pelvis/hombros frontales (evita torsión falsa de cintura)
  if (isFrontalTorso) {
    if (Math.abs(latHip.z) < 0.25 && Math.abs(latSh.z) < 0.25 && Math.abs(latHip.z - latSh.z) < 0.28) {
      const hipAvgZ = (pts[23].z + pts[24].z) * 0.5;
      pts[23].z = hipAvgZ + (pts[23].z - hipAvgZ) * 0.25;
      pts[24].z = hipAvgZ + (pts[24].z - hipAvgZ) * 0.25;

      const shAvgZ = (pts[11].z + pts[12].z) * 0.5;
      pts[11].z = shAvgZ + (pts[11].z - shAvgZ) * 0.25;
      pts[12].z = shAvgZ + (pts[12].z - shAvgZ) * 0.25;
    }

    hpM = mid(23, 24);
    shM = mid(11, 12);
    if (isUpright && Math.abs(shM.z - hpM.z) / torsoLen < 0.16) {
      const dzShift = (hpM.z - shM.z) * 0.68;
      for (let i = 0; i <= 22; i++) {
        pts[i].z += dzShift;
      }
    }

    hpM = mid(23, 24);
    shM = mid(11, 12);
    latSh = pts[11].clone().sub(pts[12]).normalize();
    spineDir = shM.clone().sub(hpM).normalize();
    torsoFwd = latSh.clone().cross(spineDir).normalize();
  }

  // 2. Estabilizar cuello/cabeza frontal (compresión Z nariz-oreja falsa + balanceo por ruido Y)
  if (isFrontalTorso && isUpright) {
    // Nivelar ligero desnivel vertical artificial entre orejas si la mirada es frontal
    const earRollDy = pts[7].y - pts[8].y;
    if (Math.abs(earRollDy) < 0.032) {
      const earAvgY = (pts[7].y + pts[8].y) * 0.5;
      pts[7].y = earAvgY + (pts[7].y - earAvgY) * 0.25;
      pts[8].y = earAvgY + (pts[8].y - earAvgY) * 0.25;
    }

    const earM = mid(7, 8);
    const earFwdRelSh = earM.clone().sub(shM).dot(torsoFwd);
    if (earFwdRelSh < -0.025) {
      const fixEar = torsoFwd.clone().multiplyScalar((-0.015 - earFwdRelSh) * 0.65);
      pts[7].add(fixEar);
      pts[8].add(fixEar);
      pts[0].add(fixEar);
    }
    const earM2 = mid(7, 8);
    const hf = pts[0].clone().sub(earM2);
    const hfFwd = hf.dot(torsoFwd);
    if (hfFwd > 0.012 && hfFwd < 0.095) {
      // Restaurar proyección sagital anatómica nariz->oído (~11 cm) para no amplificar pequeños desniveles Y
      pts[0].addScaledVector(torsoFwd, 0.11 - hfFwd);
    }

    // Verificar proporción facial 2D ojos-nariz-boca: si los ojos están claramente sobre la nariz, no hay hiperextensión trasera
    const eyeM = mid(2, 5);
    const mouthM = mid(9, 10);
    const faceH = Math.max(0.035, eyeM.y - mouthM.y);
    const eyeAboveNoseRatio = (eyeM.y - pts[0].y) / faceH;
    if (eyeAboveNoseRatio > 0.28) {
      const earM3 = mid(7, 8);
      const hf3 = pts[0].clone().sub(earM3);
      const fwdProj = Math.max(0.08, hf3.dot(torsoFwd));
      const maxUpY = eyeAboveNoseRatio > 0.36 ? 0.09 * fwdProj : 0.18 * fwdProj;
      if (hf3.y > maxUpY) {
        pts[0].y = earM3.y + maxUpY;
      }
    }

    // 3. Piernas rectas en postura erguida frontal (evitar flexión falsa por ruido Z de rodilla/tobillo)
    const legSets: Array<[number, number, number, number, number]> = [
      [23, 25, 27, 29, 31],
      [24, 26, 28, 30, 32],
    ];
    for (const [hpI, knI, akI, hlI, toI] of legSets) {
      const hp = pts[hpI];
      const kn = pts[knI];
      const ak = pts[akI];
      const th2X = kn.x - hp.x;
      const th2Y = kn.y - hp.y;
      const sh2X = ak.x - kn.x;
      const sh2Y = ak.y - kn.y;
      const th2L = Math.hypot(th2X, th2Y);
      const sh2L = Math.hypot(sh2X, sh2Y);
      if (th2L > 0.28 * torsoLen && sh2L > 0.28 * torsoLen) {
        const dot2 = clamp((th2X * sh2X + th2Y * sh2Y) / (th2L * sh2L), -1, 1);
        const ang2D = deg(Math.acos(dot2));
        const ang3D = deg(kn.clone().sub(hp).angleTo(ak.clone().sub(kn)));
        if (ang2D < 14 && ang3D < 38) {
          if (Math.abs(ak.z - hp.z) < 0.4 * torsoLen) {
            const dzAk = (hp.z - ak.z) * 0.8;
            ak.z += dzAk;
            pts[hlI].z += dzAk;
            pts[toI].z += dzAk;
          }
          const t = clamp((hp.y - kn.y) / Math.max(0.1, hp.y - ak.y), 0.1, 0.9);
          const lineZ = hp.z + (ak.z - hp.z) * t;
          pts[knI].z = kn.z + (lineZ - kn.z) * 0.88;
        }
      }
    }
  }

  // 3b. Pies y talones apoyados: evitar caída en puntillas por perspectiva 2D cuando está de pie o cuclillas planas
  if (isUpright) {
    const footLegSets: Array<[number, number, number, number, number]> = [
      [23, 25, 27, 29, 31],
      [24, 26, 28, 30, 32],
    ];
    for (const [hpI, knI, akI, hlI, toI] of footLegSets) {
      const thighV = pts[knI].clone().sub(pts[hpI]);
      const shankV = pts[akI].clone().sub(pts[knI]);
      const shankLen = Math.max(0.1, shankV.length());
      const shankVertRatio = -shankV.y / shankLen;
      const kneeAng = thighV.lengthSq() > 1e-4 ? deg(thighV.angleTo(shankV)) : 0;

      // Si la pierna está erguida (sin arrodillarse ni loto elevado)
      if (shankVertRatio > 0.78 && kneeAng < 35) {
        const explicitSideHeelLift = !isFrontalTorso && pts[hlI].y - pts[toI].y > 0.068;
        if (!explicitSideHeelLift) {
          const floorY = Math.min(pts[akI].y - 0.055, (pts[hlI].y + pts[toI].y) * 0.5);
          pts[hlI].y = floorY;
          pts[toI].y = floorY;

          // Asegurar proyección delantera horizontal coherente (talón -> punta >= 13 cm), conservando apertura lateral real
          const fHoriz = pts[toI].clone().sub(pts[hlI]);
          fHoriz.y = 0;
          const fFwd = fHoriz.dot(torsoFwd);
          const fLat = clamp(fHoriz.dot(latSh), -0.075, 0.075);
          const targetFwd = Math.max(0.14, fFwd);
          const corrected = torsoFwd
            .clone()
            .multiplyScalar(targetFwd)
            .addScaledVector(latSh, fLat);
          pts[toI].x = pts[hlI].x + corrected.x;
          pts[toI].z = pts[hlI].z + corrected.z;
        }
      }
    }
  }

  // 4. Estabilizar brazos frontales:
  //    a) Antebrazo/mano apoyado delante del abdomen/pecho sin mandar codo atrás ni mano dentro del torso
  //    b) Brazo relajado colgando al costado sin deriva monocular
  if (isFrontalTorso || Math.abs(torsoFwd.z) > 0.55) {
    const armDefs: Array<{ shI: number; elI: number; wrI: number; tips: number[]; isLeft: boolean }> = [
      { shI: 11, elI: 13, wrI: 15, tips: [17, 19, 21], isLeft: true },
      { shI: 12, elI: 14, wrI: 16, tips: [18, 20, 22], isLeft: false },
    ];
    for (const { shI, elI, wrI, tips, isLeft } of armDefs) {
      const sh = pts[shI];
      const el = pts[elI];
      const wr = pts[wrI];
      const outAxis = isLeft ? latSh : latSh.clone().negate();
      const upper = el.clone().sub(sh);
      const fore = wr.clone().sub(el);
      const uLen = Math.max(0.08, upper.length());
      const fLen = Math.max(0.08, fore.length());

      const wrInward = wr.clone().sub(sh).dot(outAxis);
      const wrDrop = sh.y - wr.y;
      const wrFwdRelSh = wr.clone().sub(sh).dot(torsoFwd);

      if (wrInward < -0.012 && wrDrop > 0.08 && wrDrop < torsoLen * 1.48 && wrFwdRelSh > -0.28) {
        // Caso A: Mano frente al abdomen/cintura/pubis/pecho
        const elFwd = upper.dot(torsoFwd);
        if (elFwd < 0.05 * uLen && elFwd > -0.62 * uLen) {
          pts[elI].addScaledVector(torsoFwd, 0.05 * uLen - elFwd);
        }
        const fracH = clamp((pts[wrI].y - hpM.y) / Math.max(0.2, shM.y - hpM.y), -0.15, 1);
        const spineAtWr = hpM.clone().lerp(shM, Math.max(0, fracH));
        const latDist = Math.abs(pts[wrI].clone().sub(spineAtWr).dot(latSh));
        if (latDist < 0.20) {
          const minClear = 0.16 - 0.09 * (latDist / 0.20);
          const curClear = pts[wrI].clone().sub(spineAtWr).dot(torsoFwd);
          if (curClear < minClear) {
            const delta = torsoFwd.clone().multiplyScalar(minClear - curClear);
            pts[wrI].add(delta);
            for (const ti of tips) pts[ti].add(delta);
          }
        }
      } else if (isFrontalTorso && upper.y < 0 && fore.y < 0) {
        // Caso B: Brazo vertical relajado al costado
        const uLatRatio = Math.abs(upper.dot(latSh)) / uLen;
        const fLatRatio = Math.abs(fore.dot(latSh)) / fLen;
        if (uLatRatio < 0.40 && fLatRatio < 0.42) {
          const elFwd = upper.dot(torsoFwd);
          if (Math.abs(elFwd) < 0.32 * uLen) {
            pts[elI].addScaledVector(torsoFwd, elFwd * 0.35 - elFwd);
          }
          const newFore = pts[wrI].clone().sub(pts[elI]);
          const wrFwd = newFore.dot(torsoFwd);
          if (Math.abs(wrFwd) < 0.30 * fLen) {
            const dW = torsoFwd.clone().multiplyScalar(wrFwd * 0.45 - wrFwd);
            pts[wrI].add(dW);
            for (const ti of tips) pts[ti].add(dW);
          }
        }
      }
    }
  }

  return pts;
}

export function orientWorldLandmarksToKateFrame(
  W: KateLandmark3D[],
  flipZ = false,
): { pts: THREE.Vector3[]; camDir: THREE.Vector3; signs: { sx: number; sy: number; sz: number } } {
  const raw = (i: number) => new THREE.Vector3(W[i].x, W[i].y, W[i].z);
  const shL = raw(11);
  const shR = raw(12);
  const hpL = raw(23);
  const hpR = raw(24);
  const nose = raw(0);
  const earM = raw(7).add(raw(8)).multiplyScalar(0.5);

  // Solo invertir X cuando sea claramente vista de espaldas; en perfiles laterales conservar sistema derecho
  const sx = shL.x - shR.x < -0.10 ? -1 : 1;
  const shM = shL.clone().add(shR).multiplyScalar(0.5);
  const hpM = hpL.clone().add(hpR).multiplyScalar(0.5);
  const sy = shM.y < hpM.y ? -1 : 1;

  const T = (v: THREE.Vector3, zSign: number) =>
    new THREE.Vector3(v.x * sx, v.y * sy, v.z * zSign);

  const lat = T(shL, 1).sub(T(shR, 1)).normalize();
  const spineApprox = T(shM, 1).sub(T(hpM, 1)).normalize();
  let fw = lat.clone().cross(spineApprox);
  if (fw.lengthSq() < 0.05) fw = lat.clone().cross(new THREE.Vector3(0, 1, 0));
  fw.normalize();

  // Signo Z que preserva orientación derecha (det = sx * sy * sz = +1)
  let sz = sx * sy;

  // En perfiles laterales estrechos, corroborar Z mediante nariz, pies y dirección anatómica de rodillas
  if (Math.abs(shL.x - shR.x) < 0.14) {
    const noseVec = T(nose, 1).sub(T(earM, 1));
    let fwdVotes = noseVec.dot(fw) * 1.3;
    if ((W[29]?.visibility ?? 0) > 0.35 && (W[31]?.visibility ?? 0) > 0.35) {
      fwdVotes += T(raw(31), 1).sub(T(raw(29), 1)).dot(fw) * 0.9;
    }
    if ((W[30]?.visibility ?? 0) > 0.35 && (W[32]?.visibility ?? 0) > 0.35) {
      fwdVotes += T(raw(32), 1).sub(T(raw(30), 1)).dot(fw) * 0.9;
    }
    const kneeBulge = (hpI: number, knI: number, akI: number) => {
      const hp = T(raw(hpI), 1);
      const kn = T(raw(knI), 1);
      const ak = T(raw(akI), 1);
      return kn.sub(hp.add(ak).multiplyScalar(0.5));
    };
    fwdVotes += kneeBulge(23, 25, 27).dot(fw) * 0.7;
    fwdVotes += kneeBulge(24, 26, 28).dot(fw) * 0.7;
    if (Math.abs(fwdVotes) > 0.16) {
      sz = fwdVotes >= 0 ? 1 : -1;
    }
  }

  if (flipZ) sz *= -1;

  const rawPts = W.map((p) => new THREE.Vector3(p.x * sx, p.y * sy, p.z * sz));
  const pts = stabilizeOrientedKateLandmarks(rawPts);
  return {
    pts,
    camDir: new THREE.Vector3(0, 0, -sz).normalize(),
    signs: { sx, sy, sz },
  };
}

function computeFingerCurlFromHand21(
  handPts: THREE.Vector3[],
  i0: number,
  i1: number,
  i2: number,
  i3: number,
  isThumb = false,
): number {
  const v1 = handPts[i1].clone().sub(handPts[i0]);
  const v2 = handPts[i2].clone().sub(handPts[i1]);
  const v3 = handPts[i3].clone().sub(handPts[i2]);
  if (v1.lengthSq() < 1e-6 || v2.lengthSq() < 1e-6 || v3.lengthSq() < 1e-6) return 0.25;
  v1.normalize();
  v2.normalize();
  v3.normalize();
  const a12 = deg(Math.acos(clamp(v1.dot(v2), -1, 1)));
  const a23 = deg(Math.acos(clamp(v2.dot(v3), -1, 1)));
  const totalBend = a12 + a23;
  return clamp(totalBend / (isThumb ? 95 : 155), 0, 1);
}

export function extractHandPoseFrom21(
  handWorld21: KateLandmark3D[],
  signs: { sx: number; sy: number; sz: number },
  isLeft: boolean,
): KateHandPoseParams {
  const pts = handWorld21.map((p) => new THREE.Vector3(p.x * signs.sx, p.y * signs.sy, p.z * signs.sz));
  const thumb = computeFingerCurlFromHand21(pts, 1, 2, 3, 4, true);
  const index = computeFingerCurlFromHand21(pts, 0, 5, 6, 7);
  const middle = computeFingerCurlFromHand21(pts, 0, 9, 10, 11);
  const ring = computeFingerCurlFromHand21(pts, 0, 13, 14, 15);
  const pinky = computeFingerCurlFromHand21(pts, 0, 17, 18, 19);

  // Separación dedo índice vs meñique
  const vIdx = pts[6].clone().sub(pts[5]).normalize();
  const vPnk = pts[18].clone().sub(pts[17]).normalize();
  const spreadDeg = Math.round(clamp(deg(vIdx.angleTo(vPnk)) * 0.45, 0, 24));
  void isLeft;

  return {
    wristPitchDeg: 0,
    wristYawDeg: 0,
    wristRollDeg: 0,
    thumb: Math.round(thumb * 100) / 100,
    index: Math.round(index * 100) / 100,
    middle: Math.round(middle * 100) / 100,
    ring: Math.round(ring * 100) / 100,
    pinky: Math.round(pinky * 100) / 100,
    spreadDeg,
  };
}

/**
 * Extrae ángulos editables KatePoseParams desde 33 worldLandmarks de MediaPipe (+ 21 pts por mano si disponibles)
 * para que Kate adopte la postura tentativa Y todos los controles muestren sus ángulos exactos.
 */
export function extractKatePoseParamsFromLandmarks(
  W: KateLandmark3D[],
  prev?: Partial<KatePoseParams>,
  hands?: { left?: KateLandmark3D[] | null; right?: KateLandmark3D[] | null },
): KatePoseParams {
  const base = createDefaultKatePoseParams();
  if (prev) {
    base.convention = prev.convention ?? base.convention;
    base.show = prev.show ? { ...prev.show } : base.show;
    base.flipZ = prev.flipZ ?? false;
  }

  const { pts, signs } = orientWorldLandmarksToKateFrame(W, base.flipZ);
  const p = (i: number) => pts[i].clone();
  const mid = (a: number, b: number) => p(a).add(p(b)).multiplyScalar(0.5);

  const hipM = mid(23, 24);
  const shM = mid(11, 12);
  const earM = mid(7, 8);
  const ankleM = mid(27, 28);

  const up = new THREE.Vector3(0, 1, 0);
  const spineDir = shM.clone().sub(hipM).normalize();
  const latHip = p(23).sub(p(24)).normalize(); // derecha -> izquierda
  const latSh = p(11).sub(p(12)).normalize();
  const fwd = latSh.clone().cross(spineDir).normalize();
  const bodyFwdWorld = latHip.clone().cross(up).normalize();

  // Detectar si el cuerpo completo está inclinado/recostado (e.g. rampa 45°: línea tobillo -> hombro inclinada)
  const fullBodyAxis = shM.clone().sub(ankleM);
  const legL = p(25).sub(p(23));
  const trunkHipAngle = deg(spineDir.angleTo(legL.clone().negate()));
  let bodyPitchDeg = 0;
  if (fullBodyAxis.lengthSq() > 0.1 && trunkHipAngle < 32) {
    const bodyDir = fullBodyAxis.normalize();
    const tiltFromVertical = deg(bodyDir.angleTo(up));
    if (tiltFromVertical > 22 && Math.abs(bodyDir.dot(up)) < 0.88) {
      const sign = bodyDir.dot(bodyFwdWorld) >= 0 ? 1 : -1;
      bodyPitchDeg = Math.round(clamp(sign * tiltFromVertical, -85, 85));
    }
  }

  // Tronco en el marco del cuerpo
  const trunkFwdSin = clamp(spineDir.dot(bodyFwdWorld), -1, 1);
  const trunkUpCos = clamp(spineDir.dot(up), -1, 1);
  const rawTrunkFlex = deg(Math.atan2(trunkFwdSin, trunkUpCos)) - bodyPitchDeg;
  const trunkFlexDeg = Math.round(clamp(rawTrunkFlex, -40, 105));

  const trunkLatSin = clamp(spineDir.dot(latHip), -1, 1);
  const trunkSideDeg = Math.round(clamp(-deg(Math.asin(trunkLatSin)), -35, 35));

  const shH = new THREE.Vector3(latSh.x, 0, latSh.z).normalize();
  const hpH = new THREE.Vector3(latHip.x, 0, latHip.z).normalize();
  let trunkTwistDeg = 0;
  if (shH.lengthSq() > 0.1 && hpH.lengthSq() > 0.1) {
    const tw = deg(shH.angleTo(hpH));
    const twSign = hpH.clone().cross(shH).y >= 0 ? 1 : -1;
    trunkTwistDeg = tw < 6 ? 0 : Math.round(clamp(twSign * tw, -55, 55));
  }

  const bodyYawDeg = Math.round(deg(Math.atan2(bodyFwdWorld.x, bodyFwdWorld.z)));

  // Cuello
  const neckDir = earM.clone().sub(shM).normalize();
  const headFwd = p(0).sub(earM).normalize();
  const headUp = headFwd.clone().cross(latSh).normalize();
  const headRef = neckDir.clone().lerp(headUp, 0.65).normalize();
  const nCos = clamp(headRef.dot(spineDir), -1, 1);
  const nSin = clamp(headRef.dot(fwd), -1, 1);
  const neckFlexDeg = Math.round(clamp(deg(Math.atan2(nSin, nCos)), -22, 48));
  const neckSideDeg = Math.round(clamp(-deg(Math.asin(clamp(headRef.dot(latSh), -1, 1))), -30, 30));

  // Brazos
  const trunkDown = spineDir.clone().negate();
  const computeArm = (shIdx: number, elIdx: number, wrIdx: number, isLeft: boolean) => {
    const upper = p(elIdx).sub(p(shIdx)).normalize();
    const fore = p(wrIdx).sub(p(elIdx)).normalize();
    const outAxis = isLeft ? latSh : latSh.clone().negate();
    const abdSin = clamp(upper.dot(outAxis), -1, 1);
    const abd = Math.round(clamp(deg(Math.asin(abdSin)), -20, 145));
    const inPlane = upper.clone().sub(outAxis.clone().multiplyScalar(upper.dot(outAxis)));
    let flex = 0;
    if (inPlane.lengthSq() > 1e-4) {
      inPlane.normalize();
      flex = Math.round(clamp(deg(Math.atan2(inPlane.dot(fwd), inPlane.dot(trunkDown))), -55, 170));
    }
    const elbInternal = deg(upper.clone().negate().angleTo(fore));
    const elbFlex = Math.round(clamp(180 - elbInternal, 0, 155));
    return { flex, abd, elbFlex };
  };

  const armL = computeArm(11, 13, 15, true);
  const armR = computeArm(12, 14, 16, false);

  // Piernas y Pies
  const computeLeg = (
    hpIdx: number,
    knIdx: number,
    akIdx: number,
    hlIdx: number,
    toIdx: number,
    isLeft: boolean,
  ): { hipFlex: number; abd: number; knFlex: number; rot: number; foot: KateFootPoseParams } => {
    const thigh = p(knIdx).sub(p(hpIdx)).normalize();
    const shank = p(akIdx).sub(p(knIdx)).normalize();
    const outAxis = isLeft ? latHip : latHip.clone().negate();
    const abd = Math.round(clamp(deg(Math.asin(clamp(thigh.dot(outAxis), -1, 1))), -15, 75));
    const inSag = thigh.clone().sub(outAxis.clone().multiplyScalar(thigh.dot(outAxis)));
    let hipFlex = 0;
    if (inSag.lengthSq() > 1e-4) {
      inSag.normalize();
      hipFlex = Math.round(clamp(deg(Math.atan2(inSag.dot(bodyFwdWorld), inSag.dot(trunkDown))), -35, 135));
    }
    const knInternal = deg(thigh.clone().negate().angleTo(shank));
    const knFlex = Math.round(clamp(180 - knInternal, 0, 160));
    let rot = 0;
    if (knFlex > 65 && abd > 15) {
      const inward = isLeft ? -shank.dot(latHip) : shank.dot(latHip);
      rot = Math.round(clamp(inward * 55, 0, 60));
    }

    // Estimación del ángulo del pie desde tobillo/talón/punta
    const footFwd = p(toIdx).sub(p(hlIdx));
    let footPitch = 0;
    let footRoll = 0;
    if (footFwd.lengthSq() > 1e-4) {
      footFwd.normalize();
      const shinFootAng = deg(shank.clone().negate().angleTo(footFwd)); // ~90° = pie plano neutro
      footPitch = Math.round(clamp(shinFootAng - 92, -45, 65));
      if (Math.abs(footFwd.y) < 0.08 && knFlex < 35) {
        footPitch = 0;
      }
      const inwardDot = isLeft ? -footFwd.dot(latHip) : footFwd.dot(latHip);
      if (knFlex > 65 && abd > 15) {
        footRoll = Math.round(clamp(inwardDot * 36, -40, 40));
      }
    }

    return {
      hipFlex,
      abd,
      knFlex,
      rot,
      foot: { pitchDeg: footPitch, rollDeg: footRoll, yawDeg: 0, toeDeg: 0 },
    };
  };

  const legLData = computeLeg(23, 25, 27, 29, 31, true);
  const legRData = computeLeg(24, 26, 28, 30, 32, false);

  const handL = hands?.left ? extractHandPoseFrom21(hands.left, signs, true) : createDefaultHandPose('relaxed');
  const handR = hands?.right ? extractHandPoseFrom21(hands.right, signs, false) : createDefaultHandPose('relaxed');

  return {
    ...base,
    bodyPitchDeg,
    bodyRollDeg: 0,
    bodyYawDeg: clamp(bodyYawDeg, -180, 180),
    neckFlexDeg,
    neckSideDeg,
    neckTwistDeg: 0,
    trunkFlexDeg,
    trunkSideDeg,
    trunkTwistDeg,
    shoulderLFlexDeg: armL.flex,
    shoulderLAbdDeg: armL.abd,
    elbowLFlexDeg: armL.elbFlex,
    shoulderRFlexDeg: armR.flex,
    shoulderRAbdDeg: armR.abd,
    elbowRFlexDeg: armR.elbFlex,
    handL,
    handR,
    hipLFlexDeg: legLData.hipFlex,
    hipLAbdDeg: legLData.abd,
    hipLRotDeg: legLData.rot,
    kneeLFlexDeg: legLData.knFlex,
    hipRFlexDeg: legRData.hipFlex,
    hipRAbdDeg: legRData.abd,
    hipRRotDeg: legRData.rot,
    kneeRFlexDeg: legRData.knFlex,
    footL: legLData.foot,
    footR: legRData.foot,
    apoL: 'none',
    apoR: 'none',
    useRawLandmarks: true,
    overriddenJoints: {},
    boneOverrides: {},
  };
}

export interface KateDetectedHandsLandmarks {
  left?: KateLandmark3D[] | null;
  right?: KateLandmark3D[] | null;
}

export function applyKatePose(
  rig: KateRigInstance,
  params: KatePoseParams,
  landmarks?: KateLandmark3D[] | null,
  handsLandmarks?: KateDetectedHandsLandmarks | null,
  skipOverridesFor?: Set<string>,
): void {
  resetKatePose(rig);

  const bodyQ = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rad(params.bodyPitchDeg), rad(params.bodyYawDeg), rad(params.bodyRollDeg), 'YXZ'),
  );

  // Si venimos de landmarks detectados sin override manual
  const orientedResult =
    landmarks && params.useRawLandmarks
      ? orientWorldLandmarksToKateFrame(landmarks, params.flipZ)
      : null;
  const oriented = orientedResult ? orientedResult.pts : null;
  const signs = orientedResult ? orientedResult.signs : { sx: 1, sy: 1, sz: 1 };
  const frameDet = signs.sx * signs.sy * signs.sz;

  const P = (i: number) => (oriented ? oriented[i].clone() : new THREE.Vector3());
  const ov = params.overriddenJoints || {};

  // 1. Eje base del cuerpo
  const localFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(bodyQ).normalize();
  const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(bodyQ).normalize();
  const localLat = new THREE.Vector3(1, 0, 0).applyQuaternion(bodyQ).normalize(); // +X izquierda

  // 2. Columna y tronco
  let spineDir: THREE.Vector3;
  if (oriented && !ov.trunk && !ov.body) {
    const shM = P(11).add(P(12)).multiplyScalar(0.5);
    const hpM = P(23).add(P(24)).multiplyScalar(0.5);
    spineDir = shM.sub(hpM).normalize();
  } else {
    const flexQ = new THREE.Quaternion().setFromAxisAngle(localLat, rad(params.trunkFlexDeg));
    const sideQ = new THREE.Quaternion().setFromAxisAngle(localFwd, rad(-params.trunkSideDeg));
    spineDir = localUp.clone().applyQuaternion(flexQ).applyQuaternion(sideQ).normalize();
  }

  if (!oriented || ov.body) {
    rig.root.quaternion.copy(bodyQ);
    rig.root.updateMatrixWorld(true);
  }

  const wSpineDir =
    oriented && !ov.trunk && !ov.body
      ? spineDir.clone()
      : new THREE.Vector3(0, 1, 0)
          .applyAxisAngle(new THREE.Vector3(1, 0, 0), rad(params.trunkFlexDeg))
          .applyAxisAngle(new THREE.Vector3(0, 0, 1), rad(-params.trunkSideDeg))
          .applyQuaternion(bodyQ)
          .normalize();

  const wHipsRightToLeft =
    oriented && !ov.trunk && !ov.body
      ? P(23).sub(P(24)).normalize()
      : new THREE.Vector3(1, 0, 0).applyQuaternion(bodyQ).normalize();

  const wTorsoFwd = wHipsRightToLeft.clone().cross(wSpineDir).normalize();
  // Alinear pelvis Hips (+Y spine, +Z fwd) antes de curvar columna
  alignBoneToWorldBasis(rig, 'Hips', wSpineDir, wTorsoFwd);
  aimKateBone(rig, 'Spine', 'Spine1', wSpineDir, 0.75);
  aimKateBone(rig, 'Spine1', 'Spine2', wSpineDir, 1);
  aimKateBone(rig, 'Spine2', 'Neck', wSpineDir, 1);

  if (Math.abs(params.trunkTwistDeg) > 0.5) {
    twistBoneAlongAxis(rig, 'Spine', wSpineDir, rad(params.trunkTwistDeg * 0.45));
    twistBoneAlongAxis(rig, 'Spine2', wSpineDir, rad(params.trunkTwistDeg * 0.55));
  }

  const shPosL = getBoneWorldPos(rig, 'LeftArm');
  const shPosR = getBoneWorldPos(rig, 'RightArm');
  const realTorsoLat = shPosL.clone().sub(shPosR).normalize();
  const sp2Pos = getBoneWorldPos(rig, 'Spine2');
  const neckPos = getBoneWorldPos(rig, 'Neck');
  const realSpineDir = neckPos.clone().sub(sp2Pos).normalize();
  const realTorsoFwd = realTorsoLat.clone().cross(realSpineDir).normalize();

  // 3. Cuello y Cabeza
  if (oriented && !ov.neck && !ov.trunk && !ov.body) {
    const shM = P(11).add(P(12)).multiplyScalar(0.5);
    const earM = P(7).add(P(8)).multiplyScalar(0.5);
    const hl = P(7).sub(P(8)).normalize();
    const hf = P(0).sub(earM).normalize();
    let headUpDir = hf.clone().cross(hl);
    if (headUpDir.lengthSq() < 1e-4 || headUpDir.dot(realSpineDir) < 0) {
      headUpDir.copy(realSpineDir);
    } else {
      headUpDir.normalize();
    }
    // Limitar extensión/flexión cervical irreal debida a ruido Z monocular en fotos frontales
    const hPitch = clamp(
      deg(Math.atan2(headUpDir.dot(realTorsoFwd), headUpDir.dot(realSpineDir))),
      -22,
      48,
    );
    const hSide = clamp(deg(Math.asin(clamp(headUpDir.dot(realTorsoLat), -1, 1))), -28, 28);
    headUpDir = realSpineDir
      .clone()
      .applyQuaternion(new THREE.Quaternion().setFromAxisAngle(realTorsoLat, rad(hPitch)))
      .applyQuaternion(new THREE.Quaternion().setFromAxisAngle(realTorsoFwd, rad(-hSide)))
      .normalize();

    const rawNeckDir = earM.sub(shM).normalize();
    const nAng = rawNeckDir.angleTo(realSpineDir);
    const neckDir =
      nAng > rad(24)
        ? realSpineDir.clone().lerp(rawNeckDir, rad(24) / nAng).normalize()
        : rawNeckDir;
    aimKateBone(rig, 'Neck', 'Head', neckDir, 1);
    // Único offset +0.26 rad para compensar inclinación natural Head->HeadTop_End en kate.glb
    aimKateBone(rig, 'Head', 'HeadTop_End', headUpDir.clone().applyAxisAngle(realTorsoLat, 0.26).normalize(), 1);
  } else {
    const nFlexQ = new THREE.Quaternion().setFromAxisAngle(realTorsoLat, rad(params.neckFlexDeg));
    const nSideQ = new THREE.Quaternion().setFromAxisAngle(realTorsoFwd, rad(-params.neckSideDeg));
    const headUpDir = realSpineDir.clone().applyQuaternion(nFlexQ).applyQuaternion(nSideQ).normalize();
    const neckDir = realSpineDir.clone().lerp(headUpDir, 0.5).normalize();
    aimKateBone(rig, 'Neck', 'Head', neckDir, 1);
    aimKateBone(rig, 'Head', 'HeadTop_End', headUpDir.clone().applyAxisAngle(realTorsoLat, 0.26).normalize(), 1);
    if (Math.abs(params.neckTwistDeg) > 0.5) {
      twistBoneAlongAxis(rig, 'Head', headUpDir, rad(params.neckTwistDeg));
    }
  }

  // 4. Piernas y Pies (Caderas, Rodillas y Tobillos con orientación completa de planta/empeine)
  const pelvisUp = getBoneWorldPos(rig, 'Spine').sub(getBoneWorldPos(rig, 'Hips')).normalize();
  const pelvisLat = getBoneWorldPos(rig, 'LeftUpLeg').sub(getBoneWorldPos(rig, 'RightUpLeg')).normalize();
  const pelvisFwd = pelvisLat.clone().cross(pelvisUp).normalize();
  const pelvisDown = pelvisUp.clone().negate();

  const poseLeg = (isLeft: boolean) => {
    const s = isLeft ? 'Left' : 'Right';
    const hiIdx = isLeft ? 23 : 24;
    const knIdx = isLeft ? 25 : 26;
    const akIdx = isLeft ? 27 : 28;
    const hlIdx = isLeft ? 29 : 30;
    const toIdx = isLeft ? 31 : 32;
    const hipKey = isLeft ? 'hipL' : 'hipR';
    const kneeKey = isLeft ? 'kneeL' : 'kneeR';
    const footKey = isLeft ? 'footL' : 'footR';

    const hipFlex = isLeft ? params.hipLFlexDeg : params.hipRFlexDeg;
    const hipAbd = isLeft ? params.hipLAbdDeg : params.hipRAbdDeg;
    const hipRot = isLeft ? params.hipLRotDeg : params.hipRRotDeg;
    const kneeFlex = isLeft ? params.kneeLFlexDeg : params.kneeRFlexDeg;
    const footParams = isLeft ? params.footL : params.footR;

    let thighDir: THREE.Vector3;
    let shankDir: THREE.Vector3;
    let kneeBendAxis: THREE.Vector3;

    if (oriented && !ov[hipKey] && !ov.body) {
      thighDir = P(knIdx).sub(P(hiIdx)).normalize();
    } else {
      const qFlex = new THREE.Quaternion().setFromAxisAngle(pelvisLat, rad(-hipFlex));
      const abdAxis = pelvisFwd.clone().multiplyScalar(isLeft ? 1 : -1);
      const qAbd = new THREE.Quaternion().setFromAxisAngle(abdAxis, rad(hipAbd));
      thighDir = pelvisDown.clone().applyQuaternion(qFlex).applyQuaternion(qAbd).normalize();
    }

    if (oriented && !ov[kneeKey] && !ov[hipKey] && !ov.body) {
      shankDir = P(akIdx).sub(P(knIdx)).normalize();
      // Eje de bisagra de la rodilla desde el plano (thigh x shank), orientado al frente de la pierna
      const crossKnee = thighDir.clone().cross(shankDir);
      if (crossKnee.lengthSq() > 0.02) {
        kneeBendAxis = crossKnee.normalize();
        if (kneeBendAxis.dot(pelvisLat) < 0) kneeBendAxis.negate();
      } else {
        kneeBendAxis = pelvisLat.clone();
      }
    } else {
      const kneeFlexRad = rad(clamp(kneeFlex, 0, 165));
      const qExtRot = new THREE.Quaternion().setFromAxisAngle(
        thighDir,
        rad((isLeft ? 1 : -1) * hipRot),
      );
      kneeBendAxis = pelvisLat.clone().applyQuaternion(qExtRot).normalize();
      const qKnee = new THREE.Quaternion().setFromAxisAngle(kneeBendAxis, kneeFlexRad);
      shankDir = thighDir.clone().applyQuaternion(qKnee).normalize();
    }

    // Alinear Muslo (+Y thighDir, +Z frente de rodilla = thighDir x kneeBendAxis)
    const thighFront = thighDir.clone().cross(kneeBendAxis).normalize();
    alignBoneToWorldBasis(rig, `${s}UpLeg`, thighDir, thighFront);
    const shinFront = shankDir.clone().cross(kneeBendAxis).normalize();
    alignBoneToWorldBasis(rig, `${s}Leg`, shankDir, shinFront);

    // Pie y Tobillo: orientar usando tanto dirección longitudinal (+Y) como empeine/planta (+Z)
    // En kate.glb, el hueso Foot->ToeBase desciende ~31° (-0.54 rad) respecto al plano horizontal del suelo
    let footFwd: THREE.Vector3;
    let footDorsum: THREE.Vector3;
    if (oriented && !ov[footKey] && !ov[kneeKey] && !ov[hipKey] && !ov.body) {
      const pAnk = P(akIdx);
      const pHeel = P(hlIdx);
      const pToe = P(toIdx);
      const rawFwd = pToe.clone().sub(pHeel);
      if (rawFwd.lengthSq() < 1e-4) rawFwd.copy(pToe).sub(pAnk);
      footFwd = rawFwd.lengthSq() > 1e-5 ? rawFwd.normalize() : shinFront.clone();

      // Si el sujeto está erguido con pantorrilla casi vertical y talón apoyado, mantener planta nivelada al suelo
      const isStandingGrounded =
        realSpineDir.y > 0.72 &&
        shankDir.y < -0.78 &&
        thighDir.angleTo(shankDir) < rad(34) &&
        Math.abs(pHeel.y - pToe.y) < 0.068;

      if (isStandingGrounded) {
        footFwd.y = 0;
        if (footFwd.lengthSq() < 1e-4) footFwd.copy(shinFront).setY(0);
        footFwd.normalize();
        footDorsum = new THREE.Vector3(0, 1, 0);
      } else {
        const lateralFoot = kneeBendAxis.clone();
        footDorsum = footFwd.clone().cross(lateralFoot).normalize();
        const upRef = shankDir.clone().negate().add(shinFront.clone().multiplyScalar(0.35)).normalize();
        if (footDorsum.dot(upRef) < 0) footDorsum.negate();
      }
    } else {
      const baseFootFwd = shinFront.clone();
      const baseDorsum = shankDir.clone().negate();
      const qYaw = new THREE.Quaternion().setFromAxisAngle(baseDorsum, rad((isLeft ? -1 : 1) * footParams.yawDeg));
      const yawLat = kneeBendAxis.clone().applyQuaternion(qYaw).normalize();
      const qPitch = new THREE.Quaternion().setFromAxisAngle(yawLat, rad(footParams.pitchDeg));
      footFwd = baseFootFwd.clone().applyQuaternion(qYaw).applyQuaternion(qPitch).normalize();
      footDorsum = baseDorsum.clone().applyQuaternion(qPitch).normalize();
      const qRoll = new THREE.Quaternion().setFromAxisAngle(
        footFwd,
        rad((isLeft ? -1 : 1) * footParams.rollDeg),
      );
      footDorsum.applyQuaternion(qRoll).normalize();
    }

    const FOOT_REST_SLOPE = -0.54;
    const footBoneY = footFwd
      .clone()
      .multiplyScalar(Math.cos(FOOT_REST_SLOPE))
      .add(footDorsum.clone().multiplyScalar(Math.sin(FOOT_REST_SLOPE)))
      .normalize();
    const footBoneZ = footDorsum
      .clone()
      .multiplyScalar(Math.cos(FOOT_REST_SLOPE))
      .sub(footFwd.clone().multiplyScalar(Math.sin(FOOT_REST_SLOPE)))
      .normalize();
    alignBoneToWorldBasis(rig, `${s}Foot`, footBoneY, footBoneZ);

    // Dedos del pie (ToeBase)
    if (Math.abs(footParams.toeDeg) > 0.5) {
      const toeEntry = rig.bones.get(`${s}ToeBase`);
      if (toeEntry) toeEntry.bone.rotateX(rad(-footParams.toeDeg));
    }
  };

  poseLeg(true);
  poseLeg(false);

  // 5. Brazos, Muñecas, Manos (21 puntos) y Apoyos
  const trunkDown = realSpineDir.clone().negate();
  const hipMidW = getBoneWorldPos(rig, 'LeftUpLeg').add(getBoneWorldPos(rig, 'RightUpLeg')).multiplyScalar(0.5);
  const shMidW = getBoneWorldPos(rig, 'LeftArm').add(getBoneWorldPos(rig, 'RightArm')).multiplyScalar(0.5);

  const applyFingerPose = (isLeft: boolean, handPose: KateHandPoseParams) => {
    const s = isLeft ? 'Left' : 'Right';
    const fMap: Array<{ key: 'Index' | 'Middle' | 'Ring' | 'Pinky'; curl: number; splayMul: number }> = [
      { key: 'Index', curl: handPose.index, splayMul: isLeft ? -1 : 1 },
      { key: 'Middle', curl: handPose.middle, splayMul: 0 },
      { key: 'Ring', curl: handPose.ring, splayMul: isLeft ? 0.55 : -0.55 },
      { key: 'Pinky', curl: handPose.pinky, splayMul: isLeft ? 1.15 : -1.15 },
    ];
    const effectiveSplay = rad(handPose.spreadDeg);

    for (const f of fMap) {
      const e1 = rig.bones.get(`${s}Hand${f.key}1`);
      const e2 = rig.bones.get(`${s}Hand${f.key}2`);
      const e3 = rig.bones.get(`${s}Hand${f.key}3`);
      const c = params.fists ? 0.96 : clamp(handPose.index !== undefined ? f.curl : 0.25, 0, 1);
      if (e1) {
        e1.bone.rotateX(c * 1.25);
        if (Math.abs(effectiveSplay * f.splayMul) > 0.005) {
          e1.bone.rotateZ(effectiveSplay * f.splayMul);
        }
      }
      if (e2) e2.bone.rotateX(c * 1.38);
      if (e3) e3.bone.rotateX(c * 0.95);
    }

    // Pulgar: oposición + flexión
    const thCurl = params.fists ? 0.88 : clamp(handPose.thumb, 0, 1);
    const t1 = rig.bones.get(`${s}HandThumb1`);
    const t2 = rig.bones.get(`${s}HandThumb2`);
    const t3 = rig.bones.get(`${s}HandThumb3`);
    if (t1) {
      t1.bone.rotateX(thCurl * 0.65);
      t1.bone.rotateZ((isLeft ? 1 : -1) * thCurl * 0.35);
    }
    if (t2) t2.bone.rotateX(thCurl * 0.72);
    if (t3) t3.bone.rotateX(thCurl * 0.68);
  };

  const poseArm = (isLeft: boolean) => {
    const s = isLeft ? 'Left' : 'Right';
    const shIdx = isLeft ? 11 : 12;
    const elIdx = isLeft ? 13 : 14;
    const wrIdx = isLeft ? 15 : 16;
    const pkIdx = isLeft ? 17 : 18;
    const ixIdx = isLeft ? 19 : 20;

    const armKey = isLeft ? 'armL' : 'armR';
    const foreKey = isLeft ? 'forearmL' : 'forearmR';
    const handKey = isLeft ? 'handL' : 'handR';

    const shFlex = isLeft ? params.shoulderLFlexDeg : params.shoulderRFlexDeg;
    const shAbd = isLeft ? params.shoulderLAbdDeg : params.shoulderRAbdDeg;
    const shRot = (isLeft ? params.shoulderLRotDeg : params.shoulderRRotDeg) ?? 0;
    const elFlex = isLeft ? params.elbowLFlexDeg : params.elbowRFlexDeg;
    const vert = isLeft ? params.forearmLVert : params.forearmRVert;
    const forePron = (isLeft ? params.forearmLPronDeg : params.forearmRPronDeg) ?? 0;
    const apo = isLeft ? params.apoL : params.apoR;
    const wristIn = isLeft ? params.wristLInwardDeg : params.wristRInwardDeg;
    const handPose = isLeft ? params.handL : params.handR;
    const handLm21 = isLeft ? handsLandmarks?.left : handsLandmarks?.right;

    const shoulderPos = getBoneWorldPos(rig, `${s}Arm`);
    const upperLen = getBoneWorldPos(rig, `${s}ForeArm`).distanceTo(shoulderPos);
    const foreLen = getBoneWorldPos(rig, `${s}Hand`).distanceTo(getBoneWorldPos(rig, `${s}ForeArm`));

    let upperDir: THREE.Vector3;
    let foreDir: THREE.Vector3;
    let usedSupport = false;

    if (apo !== 'none') {
      let targetHandPos: THREE.Vector3 | null = null;
      if (apo === 'manoAbdomen') {
        targetHandPos = hipMidW
          .clone()
          .lerp(shMidW, 0.28)
          .add(realTorsoFwd.clone().multiplyScalar(0.14))
          .add(realTorsoLat.clone().multiplyScalar(isLeft ? 0.04 : -0.04));
      } else if (apo === 'manoCintura') {
        targetHandPos = hipMidW
          .clone()
          .lerp(shMidW, 0.34)
          .add(realTorsoLat.clone().multiplyScalar(isLeft ? 0.165 : -0.165))
          .add(realTorsoFwd.clone().multiplyScalar(0.03));
      } else if (apo === 'manosPecho') {
        targetHandPos = hipMidW
          .clone()
          .lerp(shMidW, 0.82)
          .add(realTorsoFwd.clone().multiplyScalar(0.19))
          .add(realTorsoLat.clone().multiplyScalar(isLeft ? 0.035 : -0.035));
      } else if (apo === 'manoRodilla') {
        targetHandPos = getBoneWorldPos(rig, `${s}Leg`).add(realSpineDir.clone().multiplyScalar(0.05));
      } else if (apo === 'manoMuslo') {
        targetHandPos = getBoneWorldPos(rig, `${s}UpLeg`)
          .lerp(getBoneWorldPos(rig, `${s}Leg`), 0.58)
          .add(realSpineDir.clone().multiplyScalar(0.06));
      } else if (apo === 'manoPantorrilla') {
        targetHandPos = getBoneWorldPos(rig, `${s}Leg`)
          .lerp(getBoneWorldPos(rig, `${s}Foot`), 0.5)
          .add(realTorsoFwd.clone().multiplyScalar(0.04));
      } else if (apo === 'codoRodilla') {
        const kneePos = getBoneWorldPos(rig, `${s}Leg`).add(realSpineDir.clone().multiplyScalar(0.05));
        upperDir = kneePos.sub(shoulderPos).normalize();
        const inPlane = realTorsoFwd.clone().add(realSpineDir.clone().multiplyScalar(1.2)).normalize();
        foreDir = inPlane;
        if (vert === 'up') foreDir = new THREE.Vector3(0, 1, 0);
        else if (vert === 'down') foreDir = new THREE.Vector3(0, -1, 0);
        usedSupport = true;
      }

      if (targetHandPos) {
        const diff = targetHandPos.clone().sub(shoulderPos);
        const dist = clamp(diff.length(), Math.abs(upperLen - foreLen) + 0.02, upperLen + foreLen - 0.015);
        const dirToHand = diff.normalize();
        const bendRef = realTorsoLat
          .clone()
          .multiplyScalar(isLeft ? 1 : -1)
          .add(realTorsoFwd.clone().multiplyScalar(-0.35))
          .normalize();
        const perp = bendRef.sub(dirToHand.clone().multiplyScalar(bendRef.dot(dirToHand)));
        if (perp.lengthSq() < 1e-4) perp.copy(realTorsoFwd).negate();
        perp.normalize();

        const cosA = clamp((upperLen * upperLen + dist * dist - foreLen * foreLen) / (2 * upperLen * dist), -1, 1);
        const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
        const elbowTarget = shoulderPos
          .clone()
          .add(dirToHand.clone().multiplyScalar(cosA * upperLen))
          .add(perp.clone().multiplyScalar(sinA * upperLen));
        upperDir = elbowTarget.clone().sub(shoulderPos).normalize();
        foreDir = targetHandPos.clone().sub(elbowTarget).normalize();
        usedSupport = true;
      }
    }

    if (!usedSupport) {
      if (oriented && !ov[armKey] && !ov.body) {
        upperDir = P(elIdx).sub(P(shIdx)).normalize();
      } else {
        const qShFlex = new THREE.Quaternion().setFromAxisAngle(realTorsoLat, rad(-shFlex));
        const abdAxis = realTorsoFwd.clone().multiplyScalar(isLeft ? 1 : -1);
        const qShAbd = new THREE.Quaternion().setFromAxisAngle(abdAxis, rad(shAbd));
        upperDir = trunkDown.clone().applyQuaternion(qShFlex).applyQuaternion(qShAbd).normalize();
      }

      if (vert === 'up') {
        foreDir = new THREE.Vector3(0, 1, 0);
      } else if (vert === 'down') {
        foreDir = new THREE.Vector3(0, -1, 0);
      } else if (oriented && !ov[foreKey] && !ov[armKey] && !ov.body) {
        foreDir = P(wrIdx).sub(P(elIdx)).normalize();
      } else {
        let bendAxis = realTorsoLat.clone().sub(upperDir.clone().multiplyScalar(realTorsoLat.dot(upperDir)));
        if (bendAxis.lengthSq() < 1e-4) bendAxis = realTorsoFwd.clone();
        bendAxis.normalize();
        if (Math.abs(shRot) > 0.2) {
          bendAxis.applyAxisAngle(upperDir, rad((isLeft ? 1 : -1) * shRot)).normalize();
        }
        const qElb = new THREE.Quaternion().setFromAxisAngle(bendAxis, rad(-elFlex));
        foreDir = upperDir.clone().applyQuaternion(qElb).normalize();
        if (Math.abs(wristIn) > 0.5) {
          foreDir.applyAxisAngle(upperDir, rad((isLeft ? -1 : 1) * wristIn)).normalize();
        }
      }
    }

    // Orientar Arm & ForeArm con el eje +Z local coincidiendo con la normal palmar natural en reposo de kate.glb
    const armElbowCross = isLeft
      ? upperDir!.clone().cross(foreDir!)
      : foreDir!.clone().cross(upperDir!);
    let defaultPalmInward = realTorsoLat
      .clone()
      .multiplyScalar(isLeft ? -1 : 1)
      .add(trunkDown.clone().multiplyScalar(0.28))
      .normalize();
    if (Math.abs(shRot) > 0.2) {
      defaultPalmInward = defaultPalmInward
        .clone()
        .applyAxisAngle(upperDir!, rad((isLeft ? 1 : -1) * shRot))
        .normalize();
    }
    const armPalmZ =
      armElbowCross.lengthSq() > 0.02
        ? armElbowCross.clone().normalize()
        : defaultPalmInward;
    alignBoneToWorldBasis(rig, `${s}Arm`, upperDir!, armPalmZ);

    let forePalmHint =
      armElbowCross.lengthSq() > 0.02 ? armElbowCross.clone().normalize() : defaultPalmInward;
    if (Math.abs(wristIn) > 0.5) {
      forePalmHint = forePalmHint
        .clone()
        .applyAxisAngle(foreDir!, rad((isLeft ? -1 : 1) * wristIn))
        .normalize();
    }
    if (Math.abs(forePron) > 0.2) {
      forePalmHint = forePalmHint
        .clone()
        .applyAxisAngle(foreDir!, rad((isLeft ? 1 : -1) * forePron))
        .normalize();
    }
    alignBoneToWorldBasis(rig, `${s}ForeArm`, foreDir!, forePalmHint);

    // Orientar Muñeca / Mano (+Y = eje mano, +Z = normal que sale de la PALMA)
    if (oriented && !ov[handKey] && !ov.body) {
      let palmFwd: THREE.Vector3 | null = null;
      let palmNormal: THREE.Vector3 | null = null;

      if (handLm21 && handLm21.length >= 21) {
        const hp = handLm21.map((q) => new THREE.Vector3(q.x * signs.sx, q.y * signs.sy, q.z * signs.sz));
        palmFwd = hp[9].clone().sub(hp[0]);
        if (palmFwd.lengthSq() > 1e-5) palmFwd.normalize();
        const vIdx = hp[5].clone().sub(hp[0]);
        const vPnk = hp[17].clone().sub(hp[0]);
        palmNormal = (isLeft ? vPnk.clone().cross(vIdx) : vIdx.clone().cross(vPnk)).multiplyScalar(frameDet);
        if (palmNormal.lengthSq() > 1e-6) palmNormal.normalize();
      } else if ((landmarks?.[ixIdx]?.visibility ?? 0) > 0.3 && (landmarks?.[pkIdx]?.visibility ?? 0) > 0.3) {
        const pW = P(wrIdx);
        const pIx = P(ixIdx);
        const pPk = P(pkIdx);
        const midKnuckle = pIx.clone().add(pPk).multiplyScalar(0.5);
        palmFwd = midKnuckle.sub(pW);
        if (palmFwd.lengthSq() > 1e-5) {
          palmFwd.normalize();
          const foreRef = foreDir!.clone().normalize();
          const devAng = palmFwd.angleTo(foreRef);
          if (devAng > rad(48)) {
            const qDev = new THREE.Quaternion().setFromUnitVectors(foreRef, palmFwd);
            const qClamped = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), qDev, rad(48) / devAng);
            palmFwd = foreRef.applyQuaternion(qClamped).normalize();
          }
        }
        const vI = pIx.clone().sub(pW);
        const vP = pPk.clone().sub(pW);
        palmNormal = (isLeft ? vP.cross(vI) : vI.cross(vP)).multiplyScalar(frameDet);
        if (palmNormal.lengthSq() > 1e-6) {
          palmNormal.normalize().lerp(forePalmHint, 0.45).normalize();
        }
      }

      if (palmFwd && palmFwd.lengthSq() > 0.1) {
        alignBoneToWorldBasis(
          rig,
          `${s}Hand`,
          palmFwd,
          palmNormal && palmNormal.lengthSq() > 0.1 ? palmNormal : forePalmHint,
        );
      }
      // Permitir micro-ajustes manuales de muñeca incluso sobre pose detectada
      const handBone = rig.bones.get(`${s}Hand`)?.bone;
      if (handBone) {
        if (Math.abs(handPose.wristPitchDeg) > 0.5) handBone.rotateX(rad(handPose.wristPitchDeg));
        if (Math.abs(handPose.wristYawDeg) > 0.5) handBone.rotateZ(rad((isLeft ? 1 : -1) * handPose.wristYawDeg));
        if (Math.abs(handPose.wristRollDeg) > 0.5) handBone.rotateY(rad((isLeft ? 1 : -1) * handPose.wristRollDeg));
      }
    } else {
      // Orientación manual de muñeca relativa al antebrazo
      const handBone = rig.bones.get(`${s}Hand`)?.bone;
      if (handBone) {
        if (Math.abs(handPose.wristPitchDeg) > 0.5) handBone.rotateX(rad(handPose.wristPitchDeg));
        if (Math.abs(handPose.wristYawDeg) > 0.5) handBone.rotateZ(rad((isLeft ? 1 : -1) * handPose.wristYawDeg));
        if (Math.abs(handPose.wristRollDeg) > 0.5) handBone.rotateY(rad((isLeft ? 1 : -1) * handPose.wristRollDeg));
      }
    }

    // Aplicar postura de los 5 dedos (3 falanges c/u)
    applyFingerPose(isLeft, handPose);
  };

  poseArm(true);
  poseArm(false);
  rig.root.updateMatrixWorld(true);

  // 6. Aplicar correcciones directas por hueso tipo Blender (Estiramiento longitudinal + Rotación + Posición)
  const overrides = params.boneOverrides || {};
  // Primero estiramientos de longitud (moviendo los hijos a lo largo de su restPos sin deformar hijos)
  for (const boneName of KATE_BONE_TOPOLOGY_ORDER) {
    if (skipOverridesFor?.has(boneName)) continue;
    const o = overrides[boneName];
    if (!o) continue;
    const entry = rig.bones.get(boneName);
    if (!entry) continue;
    const sc = clamp(o.lenScale ?? 1, 0.45, 1.85);
    if (Math.abs(sc - 1) > 0.002) {
      if (boneName === 'Hips') {
        const sp = rig.bones.get('Spine');
        if (sp) sp.bone.position.copy(sp.restPos).multiplyScalar(sc);
      } else {
        for (const child of entry.bone.children) {
          if ((child as THREE.Bone).isBone) {
            const cleanChild = child.name.replace(/^mixamorig\d*[:_]?/i, '');
            const cEntry = rig.bones.get(cleanChild);
            if (cEntry) {
              cEntry.bone.position.copy(cEntry.restPos).multiplyScalar(sc);
            }
          }
        }
      }
    }
  }

  // Luego traslaciones y rotaciones locales acumuladas en orden topológico
  for (const boneName of KATE_BONE_TOPOLOGY_ORDER) {
    if (skipOverridesFor?.has(boneName)) continue;
    const o = overrides[boneName];
    if (!o) continue;
    const entry = rig.bones.get(boneName);
    if (!entry) continue;
    if (o.tx || o.ty || o.tz) {
      entry.bone.position.x += o.tx || 0;
      entry.bone.position.y += o.ty || 0;
      entry.bone.position.z += o.tz || 0;
    }
    if (Math.abs(o.rx) > 0.05 || Math.abs(o.ry) > 0.05 || Math.abs(o.rz) > 0.05) {
      const qDelta = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rad(o.rx || 0), rad(o.ry || 0), rad(o.rz || 0), 'XYZ'),
      );
      entry.bone.quaternion.multiply(qDelta);
    }
    entry.bone.updateMatrixWorld(true);
  }
  rig.root.updateMatrixWorld(true);

  // 6b. Si se importaron rotaciones locales exactas de Three.js en radianes (sin overrides de gizmo)
  if (params.exactBoneEulerRad) {
    for (const boneName of KATE_BONE_TOPOLOGY_ORDER) {
      if (skipOverridesFor?.has(boneName)) continue;
      const eul = params.exactBoneEulerRad[boneName];
      const entry = rig.bones.get(boneName);
      if (eul && entry) {
        entry.bone.rotation.set(eul[0], eul[1], eul[2], 'XYZ');
        entry.bone.updateMatrixWorld(true);
      }
    }
    rig.root.updateMatrixWorld(true);
  }

  // 7. Posición exacta de pelvis (Pelvis_Pos_X/Y/Z) o apoyo automático sobre el suelo (y = 0)
  const hipsOv = overrides.Hips;
  const hasHipsPosOverride = Boolean(
    hipsOv &&
      ((hipsOv.tx && Math.abs(hipsOv.tx) > 1e-4) ||
        (hipsOv.ty && Math.abs(hipsOv.ty) > 1e-4) ||
        (hipsOv.tz && Math.abs(hipsOv.tz) > 1e-4)),
  );
  if (params.pelvisWorldPos && !skipOverridesFor?.has('Hips')) {
    rig.root.updateMatrixWorld(true);
    const curHipsW = getBoneWorldPos(rig, 'Hips');
    rig.root.position.x += params.pelvisWorldPos.x - curHipsW.x;
    rig.root.position.y += params.pelvisWorldPos.y - curHipsW.y;
    rig.root.position.z += params.pelvisWorldPos.z - curHipsW.z;
    rig.root.updateMatrixWorld(true);
  } else if (!hasHipsPosOverride && !skipOverridesFor?.has('Hips')) {
    rig.root.updateMatrixWorld(true);
    const groundBones = [
      'Hips',
      'LeftLeg',
      'RightLeg',
      'LeftFoot',
      'RightFoot',
      'LeftToeBase',
      'RightToeBase',
      'LeftToe_End',
      'RightToe_End',
    ];
    let minY = Infinity;
    let lowestIsHips = false;
    const hipsY = getBoneWorldPos(rig, 'Hips').y;
    for (const bn of groundBones) {
      if (rig.bones.has(bn)) {
        const py = getBoneWorldPos(rig, bn).y;
        if (py < minY) {
          minY = py;
          lowestIsHips = bn === 'Hips';
        }
      }
    }
    if (Number.isFinite(minY) && (minY > 0.045 || minY < -0.005)) {
      const clearance = lowestIsHips ? 0.07 : 0.015;
      rig.root.position.y += clearance - minY;
      rig.root.updateMatrixWorld(true);
    }
    void hipsY;
  }
}

/**
 * Resuelve desplazamiento interactivo tipo Blender ('G' Mover / IK / Auto-Estirar)
 * para cualquier hueso seleccionado sobre Kate y devuelve los `boneOverrides` resultantes.
 */
export function solveKateBoneWorldDrag(
  rig: KateRigInstance,
  params: KatePoseParams,
  landmarks: KateLandmark3D[] | null | undefined,
  handsLandmarks: KateDetectedHandsLandmarks | null | undefined,
  boneName: string,
  targetWorldPos: THREE.Vector3,
): Record<string, KateBoneOverride> {
  const nextOverrides: Record<string, KateBoneOverride> = { ...(params.boneOverrides || {}) };
  const meta = KATE_EDITABLE_BONES.find((b) => b.name === boneName);
  if (!meta) return nextOverrides;

  // Caso 1: Hips -> trasladar pelvis directamente en espacio local del padre
  if (boneName === 'Hips') {
    const skip = new Set(['Hips']);
    applyKatePose(rig, params, landmarks, handsLandmarks, skip);
    const hipsEntry = rig.bones.get('Hips');
    if (!hipsEntry || !hipsEntry.bone.parent) return nextOverrides;
    const basePos = hipsEntry.bone.position.clone();
    const targetLocal = hipsEntry.bone.parent.worldToLocal(targetWorldPos.clone());
    const delta = targetLocal.sub(basePos);
    const prev = nextOverrides.Hips || { rx: 0, ry: 0, rz: 0, lenScale: 1 };
    nextOverrides.Hips = {
      ...prev,
      tx: clamp(delta.x, -80, 80),
      ty: clamp(delta.y, -80, 80),
      tz: clamp(delta.z, -80, 80),
    };
    return nextOverrides;
  }

  // Caso 2: Cadena IK de 2 huesos (Manos y Pies)
  if (meta.ikChain) {
    const { root: rootName, mid: midName, end: endName } = meta.ikChain;
    // Evaluar estado base SIN overrides de rotación en root/mid (mantiene lenScale del usuario si existe)
    const cleanParams: KatePoseParams = {
      ...params,
      boneOverrides: {
        ...nextOverrides,
        [rootName]: { ...(nextOverrides[rootName] || { rx: 0, ry: 0, rz: 0, lenScale: 1 }), rx: 0, ry: 0, rz: 0 },
        [midName]: { ...(nextOverrides[midName] || { rx: 0, ry: 0, rz: 0, lenScale: 1 }), rx: 0, ry: 0, rz: 0 },
      },
    };
    applyKatePose(rig, cleanParams, landmarks, handsLandmarks);

    const rootEntry = rig.bones.get(rootName);
    const midEntry = rig.bones.get(midName);
    const endEntry = rig.bones.get(endName);
    if (!rootEntry || !midEntry || !endEntry || !rootEntry.bone.parent || !midEntry.bone.parent) {
      return nextOverrides;
    }

    const baseRootLocalQ = rootEntry.bone.quaternion.clone();
    const baseMidLocalQ = midEntry.bone.quaternion.clone();

    const pRoot = getBoneWorldPos(rig, rootName);
    const pMid = getBoneWorldPos(rig, midName);
    const pEnd = getBoneWorldPos(rig, endName);

    // Calcular longitudes en reposo sin stretch extra si queremos auto-estirar al sobrepasar alcance
    const curUpperLen = Math.max(0.05, pMid.distanceTo(pRoot));
    const curForeLen = Math.max(0.05, pEnd.distanceTo(pMid));

    const prevRootOv = nextOverrides[rootName] || { rx: 0, ry: 0, rz: 0, lenScale: 1 };
    const prevMidOv = nextOverrides[midName] || { rx: 0, ry: 0, rz: 0, lenScale: 1 };
    const restUpperLen = curUpperLen / clamp(prevRootOv.lenScale || 1, 0.45, 1.85);
    const restForeLen = curForeLen / clamp(prevMidOv.lenScale || 1, 0.45, 1.85);

    const diff = targetWorldPos.clone().sub(pRoot);
    const rawDist = Math.max(0.06, diff.length());
    const maxCurReach = curUpperLen + curForeLen - 0.008;

    let upperLen = curUpperLen;
    let foreLen = curForeLen;
    let nextRootScale = prevRootOv.lenScale ?? 1;
    let nextMidScale = prevMidOv.lenScale ?? 1;

    // Si el usuario estira más allá del alcance actual, estirar proporcionalmente los huesos (estilo Blender IK Stretch)
    if (rawDist > maxCurReach) {
      const stretchFactor = clamp(rawDist / Math.max(0.08, restUpperLen + restForeLen), 1, 1.85);
      nextRootScale = Math.round(stretchFactor * 100) / 100;
      nextMidScale = Math.round(stretchFactor * 100) / 100;
      upperLen = restUpperLen * nextRootScale;
      foreLen = restForeLen * nextMidScale;
    }

    const dist = clamp(rawDist, Math.abs(upperLen - foreLen) + 0.015, upperLen + foreLen - 0.004);
    const dirToTarget = diff.clone().normalize();

    // Preservar plano actual de flexión de codo/rodilla
    const v1 = pMid.clone().sub(pRoot).normalize();
    const v2 = pEnd.clone().sub(pMid).normalize();
    let bendDir = v1.clone().sub(dirToTarget.clone().multiplyScalar(v1.dot(dirToTarget)));
    if (bendDir.lengthSq() < 1e-4) {
      const fallbackPole = endName.includes('Hand')
        ? new THREE.Vector3(endName.startsWith('Left') ? 0.5 : -0.5, 0, -1).normalize()
        : new THREE.Vector3(0, 0, 1);
      bendDir = fallbackPole.sub(dirToTarget.clone().multiplyScalar(fallbackPole.dot(dirToTarget)));
    }
    if (bendDir.lengthSq() < 1e-5) bendDir.set(0, 0, 1);
    bendDir.normalize();
    void v2;

    const cosA = clamp((upperLen * upperLen + dist * dist - foreLen * foreLen) / (2 * upperLen * dist), -1, 1);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const desiredMidWorld = pRoot
      .clone()
      .add(dirToTarget.clone().multiplyScalar(cosA * upperLen))
      .add(bendDir.clone().multiplyScalar(sinA * upperLen));

    // Alinear hueso root hacia desiredMidWorld y guardar delta local respecto a baseRootLocalQ
    aimKateBone(rig, rootName, midName, desiredMidWorld.clone().sub(pRoot).normalize(), 1);
    const deltaRootQ = baseRootLocalQ.clone().invert().multiply(rootEntry.bone.quaternion);
    const eulerRoot = new THREE.Euler().setFromQuaternion(deltaRootQ, 'XYZ');
    nextOverrides[rootName] = {
      ...prevRootOv,
      lenScale: nextRootScale,
      rx: Math.round(deg(eulerRoot.x) * 10) / 10,
      ry: Math.round(deg(eulerRoot.y) * 10) / 10,
      rz: Math.round(deg(eulerRoot.z) * 10) / 10,
    };

    // Re-alinear hijo mid hacia targetWorldPos y guardar delta local respecto a baseMidLocalQ
    rig.root.updateMatrixWorld(true);
    const newPMid = getBoneWorldPos(rig, midName);
    aimKateBone(rig, midName, endName, targetWorldPos.clone().sub(newPMid).normalize(), 1);
    const deltaMidQ = baseMidLocalQ.clone().invert().multiply(midEntry.bone.quaternion);
    const eulerMid = new THREE.Euler().setFromQuaternion(deltaMidQ, 'XYZ');
    nextOverrides[midName] = {
      ...prevMidOv,
      lenScale: nextMidScale,
      rx: Math.round(deg(eulerMid.x) * 10) / 10,
      ry: Math.round(deg(eulerMid.y) * 10) / 10,
      rz: Math.round(deg(eulerMid.z) * 10) / 10,
    };

    return nextOverrides;
  }

  // Caso 3: Hueso intermedio o distal -> apuntar hueso padre hacia targetWorldPos y ajustar estiramiento del padre
  const entry = rig.bones.get(boneName);
  const parentObj = entry?.bone.parent;
  if (!entry || !parentObj || !(parentObj as THREE.Bone).isBone) return nextOverrides;
  const parentName = parentObj.name.replace(/^mixamorig\d*[:_]?/i, '');
  const parentEntry = rig.bones.get(parentName);
  if (!parentEntry) return nextOverrides;

  const cleanParams: KatePoseParams = {
    ...params,
    boneOverrides: {
      ...nextOverrides,
      [parentName]: { ...(nextOverrides[parentName] || { rx: 0, ry: 0, rz: 0, lenScale: 1 }), rx: 0, ry: 0, rz: 0 },
    },
  };
  applyKatePose(rig, cleanParams, landmarks, handsLandmarks);

  const baseParentQ = parentEntry.bone.quaternion.clone();
  const pParent = getBoneWorldPos(rig, parentName);
  const pChild = getBoneWorldPos(rig, boneName);
  const prevParOv = nextOverrides[parentName] || { rx: 0, ry: 0, rz: 0, lenScale: 1 };
  const curDist = Math.max(0.015, pChild.distanceTo(pParent));
  const restDist = curDist / clamp(prevParOv.lenScale || 1, 0.45, 1.85);
  const newDist = Math.max(0.01, targetWorldPos.distanceTo(pParent));
  const nextScale = Math.round(clamp(newDist / restDist, 0.45, 1.85) * 100) / 100;

  aimKateBone(rig, parentName, boneName, targetWorldPos.clone().sub(pParent).normalize(), 1);
  const deltaParQ = baseParentQ.clone().invert().multiply(parentEntry.bone.quaternion);
  const eulerPar = new THREE.Euler().setFromQuaternion(deltaParQ, 'XYZ');

  nextOverrides[parentName] = {
    ...prevParOv,
    lenScale: nextScale,
    rx: Math.round(deg(eulerPar.x) * 10) / 10,
    ry: Math.round(deg(eulerPar.y) * 10) / 10,
    rz: Math.round(deg(eulerPar.z) * 10) / 10,
  };

  return nextOverrides;
}

// ---------------------------------------------------------------------------
// Medición 3D exacta sobre los huesos posados de Kate
// ---------------------------------------------------------------------------
function signedAngleInPlane(
  u: THREE.Vector3,
  v: THREE.Vector3,
  fwdRef: THREE.Vector3,
): { value: number; normal: THREE.Vector3 } {
  const nu = u.clone().normalize();
  const nv = v.clone().normalize();
  const mag = deg(Math.acos(clamp(nu.dot(nv), -1, 1)));
  let n = nu.clone().cross(nv);
  if (n.lengthSq() < 1e-5) {
    n = fwdRef.clone().cross(nu);
    if (n.lengthSq() < 1e-5) n = new THREE.Vector3(1, 0, 0);
  }
  n.normalize();
  // Descomponer componente en fwdRef: positivo si nv apunta hacia adelante relativo a nu
  const perp = nv.clone().sub(nu.clone().multiplyScalar(nv.dot(nu)));
  const sign = perp.lengthSq() > 1e-5 ? (perp.dot(fwdRef) >= 0 ? 1 : -1) : 1;
  return { value: sign * mag, normal: n };
}

export function measureKateFullPoseSnapshot(
  rig: KateRigInstance,
  params: KatePoseParams,
): KateFullPoseAnglesSnapshot {
  rig.root.updateMatrixWorld(true);
  const g = (name: string) => getBoneWorldPos(rig, name);

  const hips = g('Hips');
  const sp2 = g('Spine2');
  const neck = g('Neck');
  const head = g('Head');
  const headTop = g('HeadTop_End');

  const shL = g('LeftArm');
  const elL = g('LeftForeArm');
  const wrL = g('LeftHand');
  const shR = g('RightArm');
  const elR = g('RightForeArm');
  const wrR = g('RightHand');

  const hpL = g('LeftUpLeg');
  const knL = g('LeftLeg');
  const akL = g('LeftFoot');
  const hpR = g('RightUpLeg');
  const knR = g('RightLeg');
  const akR = g('RightFoot');

  const lat = shL.clone().sub(shR).normalize();
  const trunkUp = sp2.clone().sub(hips).normalize();
  const trunkDown = trunkUp.clone().negate();
  const fwd = lat.clone().cross(trunkUp).normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);

  // Cabeza neutral compensation (-0.26 rad en Mixamo Head->HeadTop_End)
  const rawHeadAxis = headTop.clone().sub(head).normalize();
  const headAxis = rawHeadAxis.clone().applyAxisAngle(lat, -0.26).normalize();

  const definitions: Array<{
    key: KateAngleKey;
    labelEs: string;
    signed: boolean;
    isFlexSegment: boolean;
    isProlongation: boolean;
    vertex: THREE.Vector3;
    u: THREE.Vector3;
    v: THREE.Vector3;
    arcR: number;
  }> = [];

  // A: Cuello
  {
    const neckTrunk = neck.clone().sub(sp2).normalize();
    definitions.push({
      key: 'neck',
      labelEs: 'Cuello',
      signed: true,
      isFlexSegment: false,
      isProlongation: false,
      vertex: neck,
      u: neckTrunk,
      v: headAxis,
      arcR: 0.22,
    });
  }

  // B: Tronco
  definitions.push({
    key: 'trunk',
    labelEs: 'Tronco',
    signed: true,
    isFlexSegment: false,
    isProlongation: false,
    vertex: hips,
    u: worldUp,
    v: trunkUp,
    arcR: 0.34,
  });

  // C & D: Brazos
  const upperL = elL.clone().sub(shL).normalize();
  const upperR = elR.clone().sub(shR).normalize();
  definitions.push({
    key: 'armL',
    labelEs: 'Brazo izq.',
    signed: true,
    isFlexSegment: false,
    isProlongation: false,
    vertex: shL,
    u: trunkDown,
    v: upperL,
    arcR: 0.24,
  });
  definitions.push({
    key: 'armR',
    labelEs: 'Brazo der.',
    signed: true,
    isFlexSegment: false,
    isProlongation: false,
    vertex: shR,
    u: trunkDown,
    v: upperR,
    arcR: 0.24,
  });

  // E & F: Antebrazos medidos PROLONGANDO el eje del brazo desde el codo hacia el antebrazo
  definitions.push({
    key: 'forearmL',
    labelEs: 'Antebrazo izq.',
    signed: false,
    isFlexSegment: true,
    isProlongation: true,
    vertex: elL,
    u: upperL.clone(),
    v: wrL.clone().sub(elL).normalize(),
    arcR: 0.2,
  });
  definitions.push({
    key: 'forearmR',
    labelEs: 'Antebrazo der.',
    signed: false,
    isFlexSegment: true,
    isProlongation: true,
    vertex: elR,
    u: upperR.clone(),
    v: wrR.clone().sub(elR).normalize(),
    arcR: 0.2,
  });

  // Caderas
  const thighL = knL.clone().sub(hpL).normalize();
  const thighR = knR.clone().sub(hpR).normalize();
  definitions.push({
    key: 'hipL',
    labelEs: 'Cadera izq.',
    signed: false,
    isFlexSegment: false,
    isProlongation: false,
    vertex: hpL,
    u: trunkUp,
    v: thighL,
    arcR: 0.25,
  });
  definitions.push({
    key: 'hipR',
    labelEs: 'Cadera der.',
    signed: false,
    isFlexSegment: false,
    isProlongation: false,
    vertex: hpR,
    u: trunkUp,
    v: thighR,
    arcR: 0.25,
  });

  // Piernas / Rodillas medidas PROLONGANDO el eje del muslo desde la rodilla contra la flexión de la pierna
  definitions.push({
    key: 'kneeL',
    labelEs: 'Pierna izq.',
    signed: false,
    isFlexSegment: true,
    isProlongation: true,
    vertex: knL,
    u: thighL.clone(),
    v: akL.clone().sub(knL).normalize(),
    arcR: 0.22,
  });
  definitions.push({
    key: 'kneeR',
    labelEs: 'Pierna der.',
    signed: false,
    isFlexSegment: true,
    isProlongation: true,
    vertex: knR,
    u: thighR.clone(),
    v: akR.clone().sub(knR).normalize(),
    arcR: 0.22,
  });

  let visIdx = 0;
  const LETTERS = 'ABCDEFGHIJ';
  const allAngles: KateMeasuredAngle[] = definitions.map((d) => {
    const isVis = params.show[d.key];
    const letter = isVis ? LETTERS[visIdx++] || String(visIdx) : '—';
    const sa = signedAngleInPlane(d.u, d.v, fwd);
    const wedgeDeg = deg(Math.acos(clamp(d.u.dot(d.v), -1, 1)));

    let rawDeg = d.signed ? sa.value : wedgeDeg;
    let displayDeg = rawDeg;
    if (d.isProlongation) {
      const flexDeg = wedgeDeg;
      const internalDeg = 180 - flexDeg;
      rawDeg = flexDeg;
      displayDeg = params.convention === 'flex' ? flexDeg : internalDeg;
    }

    const rounded = Math.round(displayDeg);
    const textValue = d.signed
      ? `${rounded >= 0 ? '+' : '−'}${Math.abs(rounded)}°`
      : `${Math.abs(rounded)}°`;

    return {
      key: d.key,
      letter,
      labelEs: d.labelEs,
      signed: d.signed,
      isFlexSegment: d.isFlexSegment,
      isProlongation: d.isProlongation,
      rawDeg,
      displayDeg,
      textValue,
      vertexWorld: d.vertex,
      uDirWorld: d.u,
      vDirWorld: d.v,
      normalWorld: sa.normal.clone(),
      arcRadiusMeters: d.arcR,
    };
  });

  const visibleAngles = allAngles.filter((a) => params.show[a.key]);

  // Métricas 3D auxiliares para evaluación RULA / REBA / OWAS
  const shLAbd = Math.round(deg(Math.asin(clamp(upperL.dot(lat), -1, 1))));
  const shRAbd = Math.round(deg(Math.asin(clamp(upperR.dot(lat.clone().negate()), -1, 1))));
  const armLElev = Math.round(deg(Math.acos(clamp(upperL.dot(trunkDown), -1, 1))));
  const armRElev = Math.round(deg(Math.acos(clamp(upperR.dot(trunkDown), -1, 1))));
  const kneeLFlex = Math.round(allAngles.find((a) => a.key === 'kneeL')?.rawDeg ?? params.kneeLFlexDeg);
  const kneeRFlex = Math.round(allAngles.find((a) => a.key === 'kneeR')?.rawDeg ?? params.kneeRFlexDeg);

  const trunkLatTilt = Math.round(deg(Math.asin(clamp(-trunkUp.dot(lat), -1, 1))));
  const hpLat = hpL.clone().sub(hpR);
  const hpHoriz = new THREE.Vector3(hpLat.x, 0, hpLat.z).normalize();
  const shHoriz = new THREE.Vector3(lat.x, 0, lat.z).normalize();
  const realTrunkTwist =
    hpHoriz.lengthSq() > 0.1 && shHoriz.lengthSq() > 0.1
      ? Math.round(deg(hpHoriz.angleTo(shHoriz)))
      : Math.round(Math.abs(params.trunkTwistDeg));

  return {
    allAngles,
    visibleAngles,
    shoulderLAbdDeg: Math.max(shLAbd, Math.round(params.shoulderLAbdDeg)),
    shoulderRAbdDeg: Math.max(shRAbd, Math.round(params.shoulderRAbdDeg)),
    armLElevDeg: armLElev,
    armRElevDeg: armRElev,
    trunkTwistDeg: Math.max(realTrunkTwist, Math.round(Math.abs(params.trunkTwistDeg))),
    trunkSideDeg: Math.max(Math.abs(trunkLatTilt), Math.round(Math.abs(params.trunkSideDeg))),
    neckTwistDeg: Math.round(Math.abs(params.neckTwistDeg)),
    neckSideDeg: Math.round(Math.abs(params.neckSideDeg)),
    wristLFlexDeg: Math.round(Math.abs(params.handL.wristPitchDeg)),
    wristRFlexDeg: Math.round(Math.abs(params.handR.wristPitchDeg)),
    wristLYawDeg: Math.round(Math.abs(params.handL.wristYawDeg)),
    wristRYawDeg: Math.round(Math.abs(params.handR.wristYawDeg)),
    wristLRollDeg: Math.round(Math.abs(params.handL.wristRollDeg)),
    wristRRollDeg: Math.round(Math.abs(params.handR.wristRollDeg)),
    hipLFlexDeg: Math.round(clamp(180 - deg(Math.acos(clamp(thighL.dot(trunkUp), -1, 1))), 0, 150)),
    hipRFlexDeg: Math.round(clamp(180 - deg(Math.acos(clamp(thighR.dot(trunkUp), -1, 1))), 0, 150)),
    hipLAbdDeg: Math.round(deg(Math.asin(clamp(thighL.dot(lat), -1, 1)))),
    hipRAbdDeg: Math.round(deg(Math.asin(clamp(thighR.dot(lat.clone().negate()), -1, 1)))),
    kneeLFlexDeg: kneeLFlex,
    kneeRFlexDeg: kneeRFlex,
  };
}

export function measureKate3DAngles(
  rig: KateRigInstance,
  params: KatePoseParams,
): KateMeasuredAngle[] {
  return measureKateFullPoseSnapshot(rig, params).visibleAngles;
}

export interface KateRigExportSnapshot {
  pelvisWorldPos: { x: number; y: number; z: number };
  hipLRotDeg: number;
  hipRRotDeg: number;
  shoulderLRotDeg: number;
  shoulderRRotDeg: number;
  forearmLPronDeg: number;
  forearmRPronDeg: number;
  footL: { pitchDeg: number; rollDeg: number; yawDeg: number };
  footR: { pitchDeg: number; rollDeg: number; yawDeg: number };
  wristLYawDeg: number;
  wristRYawDeg: number;
  boneEulerRad: Record<string, [number, number, number]>;
}

function signedAngleAroundAxisDeg(
  refDir: THREE.Vector3,
  curDir: THREE.Vector3,
  axis: THREE.Vector3,
): number {
  const ax = axis.clone().normalize();
  const r = refDir.clone().sub(ax.clone().multiplyScalar(refDir.dot(ax)));
  const c = curDir.clone().sub(ax.clone().multiplyScalar(curDir.dot(ax)));
  if (r.lengthSq() < 1e-6 || c.lengthSq() < 1e-6) return 0;
  r.normalize();
  c.normalize();
  const dot = clamp(r.dot(c), -1, 1);
  const cross = r.clone().cross(c);
  return deg(Math.atan2(cross.dot(ax), dot));
}

function hasAnyBoneOverride(ov: KateBoneOverride | undefined): boolean {
  if (!ov) return false;
  return (
    Math.abs(ov.rx || 0) > 0.05 ||
    Math.abs(ov.ry || 0) > 0.05 ||
    Math.abs(ov.rz || 0) > 0.05 ||
    Math.abs((ov.lenScale ?? 1) - 1) > 0.005 ||
    Math.abs(ov.tx || 0) > 1e-4 ||
    Math.abs(ov.ty || 0) > 1e-4 ||
    Math.abs(ov.tz || 0) > 1e-4
  );
}

export function extractKateRigExportSnapshot(
  rig: KateRigInstance,
  params: KatePoseParams,
): KateRigExportSnapshot {
  rig.root.updateMatrixWorld(true);
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const r5 = (v: number) => Math.round(v * 100000) / 100000;

  const hipsPos = getBoneWorldPos(rig, 'Hips');
  const pelvisWorldPos = { x: r4(hipsPos.x), y: r4(hipsPos.y), z: r4(hipsPos.z) };

  const boneWorldZ = (boneName: string): THREE.Vector3 => {
    const e = rig.bones.get(boneName);
    if (!e) return new THREE.Vector3(0, 0, 1);
    const q = new THREE.Quaternion();
    e.bone.getWorldQuaternion(q);
    return new THREE.Vector3(0, 0, 1).applyQuaternion(q).normalize();
  };

  const boneWorldY = (boneName: string): THREE.Vector3 => {
    const e = rig.bones.get(boneName);
    if (!e) return new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion();
    e.bone.getWorldQuaternion(q);
    return new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize();
  };

  // Ejes anatómicos base de pelvis y tórax
  const pelvisUp = getBoneWorldPos(rig, 'Spine').sub(hipsPos).normalize();
  const pelvisLat = getBoneWorldPos(rig, 'LeftUpLeg').sub(getBoneWorldPos(rig, 'RightUpLeg')).normalize();
  const pelvisFwd = pelvisLat.clone().cross(pelvisUp).normalize();

  const shPosL = getBoneWorldPos(rig, 'LeftArm');
  const shPosR = getBoneWorldPos(rig, 'RightArm');
  const torsoLat = shPosL.clone().sub(shPosR).normalize();
  const spineDir = getBoneWorldPos(rig, 'Neck').sub(getBoneWorldPos(rig, 'Spine2')).normalize();
  const torsoDown = spineDir.clone().negate();

  // 1. Rotación axial muslos (Cadera_I_Rot / Cadera_D_Rot)
  const measureHipRot = (isLeft: boolean): number => {
    const s = isLeft ? 'Left' : 'Right';
    const baseRot = isLeft ? params.hipLRotDeg : params.hipRRotDeg;
    if (!hasAnyBoneOverride(params.boneOverrides?.[`${s}UpLeg`])) return r2(baseRot);
    const hp = getBoneWorldPos(rig, `${s}UpLeg`);
    const kn = getBoneWorldPos(rig, `${s}Leg`);
    const thighDir = kn.sub(hp).normalize();
    let refFront = thighDir.clone().cross(pelvisLat);
    if (refFront.lengthSq() < 1e-4) refFront = pelvisFwd.clone();
    refFront.normalize();
    const actualFront = boneWorldZ(`${s}UpLeg`);
    return r2(signedAngleAroundAxisDeg(refFront, actualFront, thighDir) * (isLeft ? 1 : -1));
  };

  // 2. Rotación axial brazos (Brazo_I_Rot / Brazo_D_Rot)
  const measureShoulderRot = (isLeft: boolean): number => {
    const s = isLeft ? 'Left' : 'Right';
    const baseRot = (isLeft ? params.shoulderLRotDeg : params.shoulderRRotDeg) ?? 0;
    if (!hasAnyBoneOverride(params.boneOverrides?.[`${s}Arm`])) return r2(baseRot);
    const sh = getBoneWorldPos(rig, `${s}Arm`);
    const el = getBoneWorldPos(rig, `${s}ForeArm`);
    const upperDir = el.sub(sh).normalize();
    const refZ = torsoLat
      .clone()
      .multiplyScalar(isLeft ? -1 : 1)
      .add(torsoDown.clone().multiplyScalar(0.28))
      .normalize();
    const actualZ = boneWorldZ(`${s}Arm`);
    return r2(signedAngleAroundAxisDeg(refZ, actualZ, upperDir) * (isLeft ? 1 : -1));
  };

  // 3. Pronosupinación antebrazo/mano (Antebrazo_I_Pron / Antebrazo_D_Pron)
  const measureForearmPron = (isLeft: boolean): number => {
    const s = isLeft ? 'Left' : 'Right';
    const handPose = isLeft ? params.handL : params.handR;
    const basePron =
      ((isLeft ? params.forearmLPronDeg : params.forearmRPronDeg) ?? 0) + handPose.wristRollDeg;
    if (
      !hasAnyBoneOverride(params.boneOverrides?.[`${s}ForeArm`]) &&
      !hasAnyBoneOverride(params.boneOverrides?.[`${s}Hand`])
    ) {
      return r2(basePron);
    }
    const foreDir = boneWorldY(`${s}ForeArm`);
    const armZ = boneWorldZ(`${s}Arm`);
    const handZ = boneWorldZ(`${s}Hand`);
    return r2(signedAngleAroundAxisDeg(armZ, handZ, foreDir) * (isLeft ? 1 : -1));
  };

  // 4. Pie (Flex, Inversión, Rotación) relativo a la pantorrilla
  const measureFootAngles = (isLeft: boolean): { pitchDeg: number; rollDeg: number; yawDeg: number } => {
    const s = isLeft ? 'Left' : 'Right';
    const fp = isLeft ? params.footL : params.footR;
    if (!hasAnyBoneOverride(params.boneOverrides?.[`${s}Foot`])) {
      return { pitchDeg: r2(fp.pitchDeg), rollDeg: r2(fp.rollDeg), yawDeg: r2(fp.yawDeg) };
    }
    const kn = getBoneWorldPos(rig, `${s}Leg`);
    const ak = getBoneWorldPos(rig, `${s}Foot`);
    const shankDir = ak.clone().sub(kn).normalize();
    const baseDorsum = shankDir.clone().negate();
    const shinFront = boneWorldZ(`${s}Leg`);
    const kneeBendAxis = shinFront.clone().cross(shankDir).normalize();

    const fY = boneWorldY(`${s}Foot`);
    const fZ = boneWorldZ(`${s}Foot`);
    // Deshacer FOOT_REST_SLOPE = -0.54 rad respecto al plano (fY, fZ)
    const slope = -0.54;
    const footFwd = fY
      .clone()
      .multiplyScalar(Math.cos(slope))
      .sub(fZ.clone().multiplyScalar(Math.sin(slope)))
      .normalize();
    const footDorsum = fZ
      .clone()
      .multiplyScalar(Math.cos(slope))
      .add(fY.clone().multiplyScalar(Math.sin(slope)))
      .normalize();

    // Yaw alrededor de baseDorsum
    const fwdProjHoriz = footFwd.clone().sub(baseDorsum.clone().multiplyScalar(footFwd.dot(baseDorsum)));
    const yawDeg =
      fwdProjHoriz.lengthSq() > 1e-4
        ? signedAngleAroundAxisDeg(shinFront, fwdProjHoriz.normalize(), baseDorsum) * (isLeft ? -1 : 1)
        : fp.yawDeg;
    const yawLat = kneeBendAxis
      .clone()
      .applyAxisAngle(baseDorsum, rad((isLeft ? -1 : 1) * yawDeg))
      .normalize();
    const pitchDeg = signedAngleAroundAxisDeg(
      shinFront.clone().applyAxisAngle(baseDorsum, rad((isLeft ? -1 : 1) * yawDeg)),
      footFwd,
      yawLat,
    );
    const unrolledDorsum = baseDorsum.clone().applyAxisAngle(yawLat, rad(pitchDeg)).normalize();
    const rollDeg = signedAngleAroundAxisDeg(unrolledDorsum, footDorsum, footFwd) * (isLeft ? -1 : 1);

    return { pitchDeg: r2(pitchDeg), rollDeg: r2(rollDeg), yawDeg: r2(yawDeg) };
  };

  // 5. Desviación radial/cubital de muñeca
  const measureWristYaw = (isLeft: boolean): number => {
    const s = isLeft ? 'Left' : 'Right';
    const handPose = isLeft ? params.handL : params.handR;
    if (!hasAnyBoneOverride(params.boneOverrides?.[`${s}Hand`])) return r2(handPose.wristYawDeg);
    const ovRz = params.boneOverrides?.[`${s}Hand`]?.rz ?? 0;
    return r2(handPose.wristYawDeg + (isLeft ? 1 : -1) * ovRz);
  };

  // 6. Rotaciones locales exactas XYZ en radianes de cada hueso editable del rig Three.js
  const boneEulerRad: Record<string, [number, number, number]> = {};
  const tmpEuler = new THREE.Euler(0, 0, 0, 'XYZ');
  for (const boneName of KATE_BONE_TOPOLOGY_ORDER) {
    const entry = rig.bones.get(boneName);
    if (!entry) continue;
    tmpEuler.setFromQuaternion(entry.bone.quaternion, 'XYZ');
    boneEulerRad[boneName] = [r5(tmpEuler.x), r5(tmpEuler.y), r5(tmpEuler.z)];
  }

  return {
    pelvisWorldPos,
    hipLRotDeg: measureHipRot(true),
    hipRRotDeg: measureHipRot(false),
    shoulderLRotDeg: measureShoulderRot(true),
    shoulderRRotDeg: measureShoulderRot(false),
    forearmLPronDeg: measureForearmPron(true),
    forearmRPronDeg: measureForearmPron(false),
    footL: measureFootAngles(true),
    footR: measureFootAngles(false),
    wristLYawDeg: measureWristYaw(true),
    wristRYawDeg: measureWristYaw(false),
    boneEulerRad,
  };
}

// ---------------------------------------------------------------------------
// Agrupación automática en Vistas en Verdadera Magnitud (coplanaridad <= 28°)
// ---------------------------------------------------------------------------
function describeAnatomicalPlaneName(
  dir: THREE.Vector3,
  fwd: THREE.Vector3,
  lat: THREE.Vector3,
  up: THREE.Vector3,
  letters: string,
): string {
  const absFwd = Math.abs(dir.dot(fwd));
  const absLat = Math.abs(dir.dot(lat));
  const absUp = Math.abs(dir.dot(up));
  if (absFwd > 0.88) return 'Plano Frontal (XZ)';
  if (absLat > 0.88) return dir.dot(lat) < 0 ? 'Plano Sagital Der. (YZ)' : 'Plano Sagital Izq. (YZ)';
  if (absUp > 0.88) return 'Plano Transversal (XY)';
  if (absLat >= absFwd) {
    const side = dir.dot(lat) < 0 ? 'Der.' : 'Izq.';
    return `Oblicuo Sag. ${side} (${letters})`;
  }
  return `Oblicuo Frontal (${letters})`;
}

export function groupKateViewsTrueMagnitude(
  rig: KateRigInstance,
  angles: KateMeasuredAngle[],
): KateTrueMagnitudeView[] {
  const shL = getBoneWorldPos(rig, 'LeftArm');
  const shR = getBoneWorldPos(rig, 'RightArm');
  const sp2 = getBoneWorldPos(rig, 'Spine2');
  const hips = getBoneWorldPos(rig, 'Hips');
  const lat = shL.clone().sub(shR).normalize();
  const trunkUp = sp2.clone().sub(hips).normalize();
  const fwd = lat.clone().cross(trunkUp).normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);

  if (angles.length === 0) {
    return [
      { title: 'Vista 1 · Plano Frontal (XZ)', cameraDirWorld: fwd.clone(), angles: [] },
      { title: 'Vista 2 · Plano Sagital Der. (YZ)', cameraDirWorld: lat.clone().negate(), angles: [] },
      { title: 'Vista 3 · Plano Sagital Izq. (YZ)', cameraDirWorld: lat.clone(), angles: [] },
    ];
  }

  interface Cluster {
    normalSum: THREE.Vector3;
    angles: KateMeasuredAngle[];
  }
  const clusters: Cluster[] = [];

  for (const ang of angles) {
    let best: Cluster | null = null;
    let bestAbs = 0;
    for (const c of clusters) {
      const avg = c.normalSum.clone().normalize();
      const d = Math.abs(avg.dot(ang.normalWorld));
      if (d > 0.85 && d > bestAbs) {
        best = c;
        bestAbs = d;
      }
    }
    if (best) {
      const avg = best.normalSum.clone().normalize();
      const s = avg.dot(ang.normalWorld) >= 0 ? 1 : -1;
      best.normalSum.add(ang.normalWorld.clone().multiplyScalar(s));
      best.angles.push(ang);
    } else {
      clusters.push({
        normalSum: ang.normalWorld.clone(),
        angles: [ang],
      });
    }
  }

  // Si hay más de 3 clusters, fusionar los 2 más parecidos para mantener la lámina limpia 2×2
  while (clusters.length > 3) {
    let bi = 0;
    let bj = 1;
    let bestDot = -1;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = Math.abs(
          clusters[i].normalSum.clone().normalize().dot(clusters[j].normalSum.clone().normalize()),
        );
        if (d > bestDot) {
          bestDot = d;
          bi = i;
          bj = j;
        }
      }
    }
    const avgI = clusters[bi].normalSum.clone().normalize();
    const avgJ = clusters[bj].normalSum.clone().normalize();
    const s = avgI.dot(avgJ) >= 0 ? 1 : -1;
    clusters[bi].normalSum.add(clusters[bj].normalSum.clone().multiplyScalar(s));
    clusters[bi].angles.push(...clusters[bj].angles);
    clusters.splice(bj, 1);
  }

  // Ordenar por cantidad de ángulos descendente
  clusters.sort((a, b) => b.angles.length - a.angles.length);

  const views: KateTrueMagnitudeView[] = clusters.map((c, idx) => {
    const dir = c.normalSum.clone().normalize();
    const dotFwd = dir.dot(fwd);
    if (Math.abs(dotFwd) > 0.25) {
      if (dotFwd < 0) dir.negate();
    } else {
      const rightCount = c.angles.filter((a) => a.key.endsWith('R')).length;
      const leftCount = c.angles.filter((a) => a.key.endsWith('L')).length;
      const dotRight = dir.dot(lat.clone().negate());
      if (rightCount > leftCount && dotRight < 0) dir.negate();
      else if (leftCount > rightCount && dotRight > 0) dir.negate();
      else if (rightCount === leftCount && dotRight < 0) dir.negate();
    }

    const letters = c.angles.map((a) => a.letter).join(', ');
    const subName = describeAnatomicalPlaneName(dir, fwd, lat, worldUp, letters);

    return {
      title: `Vista ${idx + 1} · ${subName}`,
      cameraDirWorld: dir,
      angles: c.angles,
    };
  });

  // Completar hasta 3 vistas ortogonales con nombres anatómicos exactos
  if (views.length < 3) {
    const hasFront = views.some((v) => Math.abs(v.cameraDirWorld.dot(fwd)) > 0.82);
    if (!hasFront) {
      views.push({
        title: `Vista ${views.length + 1} · Plano Frontal (XZ)`,
        cameraDirWorld: fwd.clone(),
        angles: [],
      });
    }
  }
  if (views.length < 3) {
    const hasRight = views.some((v) => v.cameraDirWorld.dot(lat.clone().negate()) > 0.82);
    views.push({
      title: `Vista ${views.length + 1} · ${hasRight ? 'Plano Sagital Izq. (YZ)' : 'Plano Sagital Der. (YZ)'}`,
      cameraDirWorld: hasRight ? lat.clone() : lat.clone().negate(),
      angles: [],
    });
  }

  return views.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Renderizador WebGL ortográfico offscreen de Kate para vistas en verdadera magnitud
// ---------------------------------------------------------------------------
function ensureOffscreenRenderer(size = 1100): {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  cam: THREE.OrthographicCamera;
} {
  if (!cachedOffscreenRenderer) {
    const isSoft = detectSoftwareWebGL();
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoft,
      preserveDrawingBuffer: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setSize(size, size, false);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor(0xffffff, 1);

    const pmrem = new THREE.PMREMGenerator(renderer);
    cachedOffscreenEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    cachedOffscreenRenderer = renderer;
  } else {
    const cur = cachedOffscreenRenderer.getSize(new THREE.Vector2());
    if (cur.x !== size || cur.y !== size) {
      cachedOffscreenRenderer.setSize(size, size, false);
    }
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  if (cachedOffscreenEnv) scene.environment = cachedOffscreenEnv;

  const hemi = new THREE.HemisphereLight(0xf8fafc, 0x94a3b8, 0.72);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.55);
  key.position.set(-2.8, 3.8, 3.3);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xe2e8f0, 0.42);
  fill.position.set(3.2, 1.2, 2.0);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.65);
  rim.position.set(0.4, 2.8, -4.0);
  scene.add(rim);

  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 30);
  return { renderer: cachedOffscreenRenderer, scene, cam };
}

/**
 * Refuerza contornos exteriores e internos en B&N para impresión láser/tinta nitidísima sobre blanco puro.
 */
function applyPrintContourEnhancementPass(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const src = img.data;
  const lum = new Float32Array(w * h);

  for (let i = 0, p = 0; i < src.length; i += 4, p++) {
    lum[p] = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
  }

  for (let y = 1; y < h - 1; y++) {
    const rowOff = y * w;
    for (let x = 1; x < w - 1; x++) {
      const idx = rowOff + x;
      const curL = lum[idx];
      const pi = idx * 4;

      if (curL >= 251) {
        // Borde exterior crisp: píxel blanco adyacente a figura
        const minN = Math.min(
          lum[idx - 1],
          lum[idx + 1],
          lum[idx - w],
          lum[idx + w],
        );
        if (minN < 240) {
          src[pi] = 24;
          src[pi + 1] = 24;
          src[pi + 2] = 24;
        } else {
          src[pi] = 255;
          src[pi + 1] = 255;
          src[pi + 2] = 255;
        }
        continue;
      }

      // Sobel interno sobre prenda, pliegues, manos, cara y calzado
      const gx =
        -lum[idx - w - 1] +
        lum[idx - w + 1] -
        2 * lum[idx - 1] +
        2 * lum[idx + 1] -
        lum[idx + w - 1] +
        lum[idx + w + 1];
      const gy =
        -lum[idx - w - 1] -
        2 * lum[idx - w] -
        lum[idx - w + 1] +
        lum[idx + w - 1] +
        2 * lum[idx + w] +
        lum[idx + w + 1];
      const grad = Math.hypot(gx, gy);

      // Profundizar tonos medios ligeramente para mayor contraste en papel B&N
      let val = curL * 0.91;
      if (grad > 38) {
        const edgeDarken = Math.min(130, (grad - 38) * 0.85);
        val = Math.max(16, val - edgeDarken);
      }
      const gByte = Math.round(clamp(val, 14, 245));
      src[pi] = gByte;
      src[pi + 1] = gByte;
      src[pi + 2] = gByte;
    }
  }

  ctx.putImageData(img, 0, 0);
}

export function renderKateOrthographicPanel(
  rig: KateRigInstance,
  camDirWorld: THREE.Vector3,
  panelW: number,
  panelH: number,
  enhancePrintContours = true,
): {
  imageCanvas: HTMLCanvasElement;
  projectPoint: (worldPt: THREE.Vector3) => { x: number; y: number };
  camRightWorld: THREE.Vector3;
  camUpWorld: THREE.Vector3;
} {
  const renderSize = 1024;
  const { renderer, scene, cam } = ensureOffscreenRenderer(renderSize);

  scene.add(rig.root);
  rig.root.updateMatrixWorld(true);

  const box = new THREE.Box3();
  const keyBones = [
    'HeadTop_End',
    'Neck',
    'Hips',
    'LeftArm',
    'RightArm',
    'LeftHand',
    'RightHand',
    'LeftForeArm',
    'RightForeArm',
    'LeftUpLeg',
    'RightUpLeg',
    'LeftLeg',
    'RightLeg',
    'LeftFoot',
    'RightFoot',
    'LeftToeBase',
    'RightToeBase',
  ];
  for (const bn of keyBones) {
    const p = getBoneWorldPos(rig, bn);
    box.expandByPoint(p);
  }
  box.expandByScalar(0.16);

  const center = box.getCenter(new THREE.Vector3());
  const dir = camDirWorld.clone().normalize();
  const upRef = Math.abs(dir.y) > 0.92 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(upRef, dir).normalize();
  const camUp = new THREE.Vector3().crossVectors(dir, right).normalize();

  const corners = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z),
  ];
  let maxHalfW = 0.2;
  let maxHalfH = 0.2;
  for (const c of corners) {
    const rel = c.clone().sub(center);
    maxHalfW = Math.max(maxHalfW, Math.abs(rel.dot(right)));
    maxHalfH = Math.max(maxHalfH, Math.abs(rel.dot(camUp)));
  }

  const aspect = panelW / panelH;
  const paddingFactor = 1.24;
  const halfH = Math.max(maxHalfH * paddingFactor, (maxHalfW * paddingFactor) / aspect, 0.52);
  const halfW = halfH * aspect;

  cam.left = -halfW;
  cam.right = halfW;
  cam.top = halfH;
  cam.bottom = -halfH;
  cam.near = 0.1;
  cam.far = 30;
  cam.position.copy(center).add(dir.clone().multiplyScalar(8));
  cam.up.copy(camUp);
  cam.lookAt(center);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);

  renderer.setSize(panelW, panelH, false);
  renderer.render(scene, cam);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = panelW;
  outCanvas.height = panelH;
  const ctx = outCanvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(renderer.domElement, 0, 0);
    if (enhancePrintContours) {
      applyPrintContourEnhancementPass(outCanvas);
    }
  }

  scene.remove(rig.root);

  const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const projectPoint = (worldPt: THREE.Vector3) => {
    const p = worldPt.clone().applyMatrix4(vp);
    return {
      x: (p.x * 0.5 + 0.5) * panelW,
      y: (-p.y * 0.5 + 0.5) * panelH,
    };
  };

  return {
    imageCanvas: outCanvas,
    projectPoint,
    camRightWorld: right,
    camUpWorld: camUp,
  };
}

// ---------------------------------------------------------------------------
// Dibujo de Goniómetros y Etiquetas Cambria 12 SIN SOLAPAMIENTO
// ---------------------------------------------------------------------------
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectsOverlap(a: Rect, b: Rect, pad = 6): boolean {
  return (
    a.x < b.x + b.w + pad &&
    a.x + a.w + pad > b.x &&
    a.y < b.y + b.h + pad &&
    a.y + a.h + pad > b.y
  );
}

function pointInWedge(
  px: number,
  py: number,
  cx: number,
  cy: number,
  a0: number,
  delta: number,
  radius: number,
): boolean {
  const dx = px - cx;
  const dy = py - cy;
  const dist = Math.hypot(dx, dy);
  if (dist > radius + 10) return false;
  if (dist < 14) return true;
  // Normalizar ángulo relativo en [0, 2PI)
  let ang = Math.atan2(dy, dx);
  const wrap = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const start = delta >= 0 ? a0 : a0 + delta;
  const span = Math.abs(delta);
  const rel = wrap(ang - start);
  return rel <= span + 0.14;
}

function distPointToSeg(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  if (l2 < 1e-6) return Math.hypot(px - ax, py - ay);
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1);
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function rectHitsSegment(r: Rect, ax: number, ay: number, bx: number, by: number, pad = 8): boolean {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const halfDiag = Math.hypot(r.w / 2 + pad, r.h / 2 + pad);
  if (distPointToSeg(cx, cy, ax, ay, bx, by) > halfDiag) return false;
  // Muestrear lo largo del segmento para intersección exacta AABB
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const sx = ax + (bx - ax) * t;
    const sy = ay + (by - ay) * t;
    if (sx >= r.x - pad && sx <= r.x + r.w + pad && sy >= r.y - pad && sy <= r.y + r.h + pad) {
      return true;
    }
  }
  return false;
}

function rectHitsWedge(
  r: Rect,
  cx: number,
  cy: number,
  a0: number,
  delta: number,
  radius: number,
  ux?: number,
  uy?: number,
  vx?: number,
  vy?: number,
): boolean {
  // Muestrear 3x3 puntos en el rectángulo contra el sector del goniómetro
  for (let ix = 0; ix <= 2; ix++) {
    for (let iy = 0; iy <= 2; iy++) {
      const px = r.x + (r.w * ix) / 2;
      const py = r.y + (r.h * iy) / 2;
      if (pointInWedge(px, py, cx, cy, a0, delta, radius)) return true;
    }
  }
  // Comprobar también rayos extensores
  if (ux !== undefined && uy !== undefined && vx !== undefined && vy !== undefined) {
    const rayLen = radius * 1.48;
    if (rectHitsSegment(r, cx, cy, cx + ux * rayLen, cy + uy * rayLen, 6)) return true;
    if (rectHitsSegment(r, cx, cy, cx + vx * rayLen, cy + vy * rayLen, 6)) return true;
  }
  return false;
}

function drawGoniometerPanelAnnotations(
  ctx: CanvasRenderingContext2D,
  panelX: number,
  panelY: number,
  panelW: number,
  panelH: number,
  angles: KateMeasuredAngle[],
  projectPoint: (worldPt: THREE.Vector3) => { x: number; y: number },
  fontPx: number,
): void {
  if (angles.length === 0) return;

  interface Wedge2D {
    cx: number;
    cy: number;
    a0: number;
    delta: number;
    radius: number;
    ux: number;
    uy: number;
    vx: number;
    vy: number;
    bisX: number;
    bisY: number;
    angObj: KateMeasuredAngle;
  }

  const wedges: Wedge2D[] = [];

  for (const ang of angles) {
    const c = projectPoint(ang.vertexWorld);
    const pU = projectPoint(ang.vertexWorld.clone().add(ang.uDirWorld.clone().multiplyScalar(0.32)));
    const pV = projectPoint(ang.vertexWorld.clone().add(ang.vDirWorld.clone().multiplyScalar(0.32)));

    const cx = panelX + c.x;
    const cy = panelY + c.y;
    const udx = panelX + pU.x - cx;
    const udy = panelY + pU.y - cy;
    const vdx = panelX + pV.x - cx;
    const vdy = panelY + pV.y - cy;

    const a0 = Math.atan2(udy, udx);
    let a1 = Math.atan2(vdy, vdx);
    let delta = a1 - a0;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;

    const radius = clamp(Math.min(panelW, panelH) * 0.135, 36, 76);
    const midA = a0 + delta * 0.5;

    wedges.push({
      cx,
      cy,
      a0,
      delta,
      radius,
      ux: Math.cos(a0),
      uy: Math.sin(a0),
      vx: Math.cos(a0 + delta),
      vy: Math.sin(a0 + delta),
      bisX: Math.cos(midA),
      bisY: Math.sin(midA),
      angObj: ang,
    });
  }

  // 1. Dibujar primero todos los sectores de goniómetros, rayos y puntos articulares
  ctx.save();
  for (const w of wedges) {
    // Sector sombreado B&N
    ctx.beginPath();
    ctx.moveTo(w.cx, w.cy);
    ctx.arc(w.cx, w.cy, w.radius, w.a0, w.a0 + w.delta, w.delta < 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(120, 120, 120, 0.34)';
    ctx.fill();

    // Arco exterior nítido
    ctx.beginPath();
    ctx.arc(w.cx, w.cy, w.radius, w.a0, w.a0 + w.delta, w.delta < 0);
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    const rayLen = w.radius * 1.48;
    if (w.angObj.isProlongation) {
      // Eje proximal retro-indicativo hacia brazo/muslo + prolongación punteada pasando codo/rodilla
      ctx.beginPath();
      ctx.moveTo(w.cx - w.ux * (w.radius * 0.65), w.cy - w.uy * (w.radius * 0.65));
      ctx.lineTo(w.cx, w.cy);
      ctx.strokeStyle = '#444444';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      ctx.save();
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.moveTo(w.cx, w.cy);
      ctx.lineTo(w.cx + w.ux * rayLen, w.cy + w.uy * rayLen);
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 2.0;
      ctx.stroke();
      ctx.restore();

      // Rayo sólido sobre segmento distal (antebrazo / pierna)
      ctx.beginPath();
      ctx.moveTo(w.cx, w.cy);
      ctx.lineTo(w.cx + w.vx * rayLen, w.cy + w.vy * rayLen);
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 2.2;
      ctx.stroke();
    } else {
      // Rayos extensores largos en verdadera magnitud
      ctx.beginPath();
      ctx.moveTo(w.cx, w.cy);
      ctx.lineTo(w.cx + w.ux * rayLen, w.cy + w.uy * rayLen);
      ctx.moveTo(w.cx, w.cy);
      ctx.lineTo(w.cx + w.vx * rayLen, w.cy + w.vy * rayLen);
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 2.0;
      ctx.stroke();
    }

    // Punto articular (blanco centro, aro negro)
    ctx.beginPath();
    ctx.arc(w.cx, w.cy, 5.2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#111111';
    ctx.stroke();
  }
  ctx.restore();

  // 2. Colocar cajas de texto Cambria 12 garantizando CERO solapamiento con goniómetros ni entre sí
  const margin = 12;
  const placedBoxes: Rect[] = [];
  ctx.font = `bold ${fontPx}px Cambria, "Liberation Serif", "Times New Roman", Georgia, serif`;

  for (const w of wedges) {
    const labelText = `${w.angObj.letter} ${w.angObj.textValue}`;
    const m = ctx.measureText(labelText);
    const padX = Math.round(fontPx * 0.42);
    const padY = Math.round(fontPx * 0.30);
    const boxW = Math.ceil(m.width + padX * 2);
    const boxH = Math.ceil(fontPx + padY * 2);

    const anchorX = w.cx + w.bisX * w.radius;
    const anchorY = w.cy + w.bisY * w.radius;

    const candidates: Array<{ rx: number; ry: number; score: number }> = [];
    const baseAngle = Math.atan2(w.bisY, w.bisX);
    const angleOffsets = [0, 0.35, -0.35, 0.7, -0.7, 1.15, -1.15, 1.6, -1.6, Math.PI];
    const distances = [w.radius + 36, w.radius + 68, w.radius + 104, w.radius + 142, w.radius + 185];

    for (const dist of distances) {
      for (const aOff of angleOffsets) {
        const theta = baseAngle + aOff;
        const cxBox = w.cx + Math.cos(theta) * (dist + boxW * 0.32);
        const cyBox = w.cy + Math.sin(theta) * (dist + boxH * 0.32);
        const rx = clamp(cxBox - boxW / 2, panelX + margin, panelX + panelW - margin - boxW);
        const ry = clamp(cyBox - boxH / 2, panelY + margin, panelY + panelH - margin - boxH);

        const rect: Rect = { x: rx, y: ry, w: boxW, h: boxH };

        let penalty = Math.abs(aOff) * 18 + (dist - w.radius) * 0.4;

        for (const otherW of wedges) {
          if (
            rectHitsWedge(
              rect,
              otherW.cx,
              otherW.cy,
              otherW.a0,
              otherW.delta,
              otherW.radius + 10,
              otherW.ux,
              otherW.uy,
              otherW.vx,
              otherW.vy,
            )
          ) {
            penalty += 35000;
          }
          const vDist = Math.hypot(rx + boxW / 2 - otherW.cx, ry + boxH / 2 - otherW.cy);
          if (vDist < otherW.radius + 22) penalty += 16000;
        }

        for (const pb of placedBoxes) {
          if (rectsOverlap(rect, pb, 10)) {
            penalty += 40000;
          }
        }

        // Evitar esquina inferior izquierda reservada para ejes cartesianos discretos
        const triadZone: Rect = { x: panelX + 6, y: panelY + panelH - 104, w: 112, h: 98 };
        if (rectsOverlap(rect, triadZone, 4)) penalty += 14000;

        const distFromCenterX = Math.abs(rx + boxW / 2 - (panelX + panelW / 2));
        if (distFromCenterX < panelW * 0.14) penalty += 220;

        candidates.push({ rx, ry, score: penalty });
      }
    }

    candidates.sort((a, b) => a.score - b.score);
    const best = candidates[0] || {
      rx: panelX + margin,
      ry: panelY + margin,
      score: 0,
    };
    const finalRect: Rect = { x: best.rx, y: best.ry, w: boxW, h: boxH };
    placedBoxes.push(finalRect);

    const nearX = clamp(anchorX, finalRect.x, finalRect.x + finalRect.w);
    const nearY = clamp(anchorY, finalRect.y, finalRect.y + finalRect.h);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(anchorX, anchorY);
    ctx.lineTo(nearX, nearY);
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.roundRect(finalRect.x, finalRect.y, finalRect.w, finalRect.h, 5);
    ctx.fill();
    ctx.stroke();

    ctx.font = `bold ${fontPx}px Cambria, "Liberation Serif", "Times New Roman", Georgia, serif`;
    ctx.fillStyle = '#111111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, finalRect.x + finalRect.w / 2, finalRect.y + finalRect.h / 2 + 1);
    ctx.restore();
  }
}

/**
 * Dibuja una tríada discreta de ejes cartesianos anatómicos de referencia (X lateral, Y anteroposterior, Z vertical)
 * proyectada exactamente según la cámara ortográfica de la vista.
 */
function drawCartesianReferenceTriad(
  ctx: CanvasRenderingContext2D,
  panelX: number,
  panelY: number,
  panelW: number,
  panelH: number,
  camRightWorld: THREE.Vector3,
  camUpWorld: THREE.Vector3,
): void {
  const isCompact = panelW < 480;
  const len = isCompact ? 18 : 24;
  const fontSize = isCompact ? 26 : 32;
  const safeEdge = isCompact ? 18 : 22;

  const axes = [
    { label: 'X', world: new THREE.Vector3(1, 0, 0), shade: '#374151' },
    { label: 'Y', world: new THREE.Vector3(0, 0, 1), shade: '#4b5563' },
    { label: 'Z', world: new THREE.Vector3(0, 1, 0), shade: '#1f2937' },
  ];

  // Calcular extensión hacia izquierda/abajo para situar el origen de modo que NINGUNA flecha ni letra salga del recuadro
  let minRelX = 0;
  let maxRelY = 0;
  for (const ax of axes) {
    const dx = ax.world.dot(camRightWorld);
    const dy = -ax.world.dot(camUpWorld);
    const mag = Math.hypot(dx, dy);
    if (mag >= 0.22) {
      minRelX = Math.min(minRelX, dx * len + (dx / mag) * 14);
      maxRelY = Math.max(maxRelY, dy * len + (dy / mag) * 14);
    }
  }

  const ox = clamp(
    panelX + Math.max(isCompact ? 38 : 48, Math.ceil(-minRelX) + safeEdge),
    panelX + safeEdge,
    panelX + panelW - len - safeEdge,
  );
  const oy = clamp(
    panelY + panelH - Math.max(isCompact ? 36 : 44, Math.ceil(maxRelY) + safeEdge),
    panelY + len + safeEdge,
    panelY + panelH - safeEdge,
  );

  ctx.save();
  ctx.font = `bold ${fontSize}px Cambria, "Liberation Serif", "Times New Roman", Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Punto origen discreto
  ctx.beginPath();
  ctx.arc(ox, oy, 2.4, 0, Math.PI * 2);
  ctx.fillStyle = '#333333';
  ctx.fill();

  for (const ax of axes) {
    const dx = ax.world.dot(camRightWorld);
    const dy = -ax.world.dot(camUpWorld);
    const mag = Math.hypot(dx, dy);

    if (mag < 0.22) {
      // Eje perpendicular al plano: aro discreto + letra desplazada hacia el interior del panel
      const lblX = clamp(ox + 16, panelX + safeEdge, panelX + panelW - safeEdge);
      const lblY = clamp(oy - 14, panelY + safeEdge, panelY + panelH - safeEdge);
      ctx.beginPath();
      ctx.arc(ox, oy, 5.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#4b5563';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,255,255,0.94)';
      ctx.lineWidth = 4;
      ctx.strokeText(ax.label, lblX, lblY);
      ctx.fillStyle = ax.shade;
      ctx.fillText(ax.label, lblX, lblY);
      continue;
    }

    const ex = clamp(ox + dx * len, panelX + safeEdge, panelX + panelW - safeEdge);
    const ey = clamp(oy + dy * len, panelY + safeEdge, panelY + panelH - safeEdge);

    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = ax.shade;
    ctx.lineWidth = 1.9;
    ctx.stroke();

    // Punta de flecha pequeña y sobria
    const ang = Math.atan2(ey - oy, ex - ox);
    const head = isCompact ? 5.5 : 7.0;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - head * Math.cos(ang - 0.45), ey - head * Math.sin(ang - 0.45));
    ctx.lineTo(ex - head * Math.cos(ang + 0.45), ey - head * Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fillStyle = ax.shade;
    ctx.fill();

    const lx = clamp(ex + (dx / mag) * 14, panelX + safeEdge, panelX + panelW - safeEdge);
    const ly = clamp(ey + (dy / mag) * 14, panelY + safeEdge, panelY + panelH - safeEdge);
    ctx.strokeStyle = 'rgba(255,255,255,0.94)';
    ctx.lineWidth = 4;
    ctx.strokeText(ax.label, lx, ly);
    ctx.fillStyle = ax.shade;
    ctx.fillText(ax.label, lx, ly);
  }
  ctx.restore();
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = (text || '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = `${current} ${words[i]}`;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

function drawFittedCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  startPx: number,
  minPx: number,
  bold: boolean,
): void {
  let px = startPx;
  while (px > minPx) {
    ctx.font = `${bold ? 'bold ' : ''}${px}px Cambria, "Liberation Serif", "Times New Roman", Georgia, serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    px -= 2;
  }
  ctx.font = `${bold ? 'bold ' : ''}${px}px Cambria, "Liberation Serif", "Times New Roman", Georgia, serif`;
  ctx.fillText(text, x, y, maxWidth);
}

// ---------------------------------------------------------------------------
// Generador de Lámina Completa 300 DPI en Blanco y Negro (Cambria 12)
// ---------------------------------------------------------------------------
export async function renderKatePrintSheet(
  rig: KateRigInstance,
  options: KateSheetOptions,
): Promise<{
  canvas: HTMLCanvasElement;
  angles: KateMeasuredAngle[];
  snapshot: KateFullPoseAnglesSnapshot;
  views: KateTrueMagnitudeView[];
}> {
  const {
    title,
    subtitle,
    photoImage,
    params,
    landmarks,
    handsLandmarks,
    includeTable = false,
    contourOutline = true,
    fontPtSize = 12,
    scoringSummary = null,
  } = options;

  rig.outlineMeshes.forEach((m) => {
    m.visible = contourOutline;
  });

  applyKatePose(rig, params, landmarks, handsLandmarks);

  const snapshot = measureKateFullPoseSnapshot(rig, params);
  const angles = snapshot.visibleAngles;
  const views = groupKateViewsTrueMagnitude(rig, angles);

  // Cuando includeTable=false (imagen embebida en Word 6×9"), se garantiza exactamente 1800×1500 px
  const W = 1800;
  const MG = 60;
  const GAP_X = 44;
  const GAP_Y = includeTable ? 34 : 40;
  const colW = Math.floor((W - MG * 2 - GAP_X) / 2); // 818 px
  const panelH = includeTable ? 580 : 610;
  const cambria12Px = Math.round((fontPtSize / 12) * 54);
  const hdrPx = Math.round(cambria12Px * 1.04);
  const hdrGap = includeTable ? 54 : 60;

  const hasTitle = includeTable && Boolean(title && title.trim().length > 0);
  const effectiveSubtitle =
    subtitle?.trim() ||
    scoringSummary?.subtitleLine?.trim() ||
    (includeTable
      ? `Vistas en verdadera magnitud (${
          params.convention === 'flex' ? '0° = extendido' : '180° = extendido'
        })`
      : '');
  const titleHeaderH = hasTitle ? (effectiveSubtitle ? 104 : 68) : 0;

  const FN = (px: number, bold = false, italic = false) =>
    `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${px}px Cambria, "Liberation Serif", "Times New Roman", Georgia, serif`;

  // Cuando includeTable=true (descarga PNG 1 sola hoja libro 6×9"), proporción exacta 6:9 -> 1800 × 2700 px
  const H = includeTable
    ? 2700
    : MG + hdrGap + panelH + GAP_Y + hdrGap + panelH + MG; // 60 + 60 + 610 + 40 + 60 + 610 + 60 = 1500 exacto

  const sheet = document.createElement('canvas');
  sheet.width = W;
  sheet.height = H;
  const ctx = sheet.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  if (hasTitle && title) {
    ctx.fillStyle = '#111111';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    drawFittedCanvasText(
      ctx,
      title.trim(),
      MG,
      MG + 34,
      W - MG * 2,
      Math.round(cambria12Px * 1.12),
      32,
      true,
    );

    if (effectiveSubtitle) {
      ctx.fillStyle = '#333333';
      ctx.font = FN(33, false, true);
      ctx.fillText(effectiveSubtitle, MG, MG + 76, W - MG * 2);
    }

    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(MG, MG + titleHeaderH - 12);
    ctx.lineTo(W - MG, MG + titleHeaderH - 12);
    ctx.stroke();
  }

  const topGridY = MG + titleHeaderH;
  const boxes = [
    { x: MG, y: topGridY + hdrGap },
    { x: MG + colW + GAP_X, y: topGridY + hdrGap },
    { x: MG, y: topGridY + hdrGap + panelH + GAP_Y + hdrGap },
    { x: MG + colW + GAP_X, y: topGridY + hdrGap + panelH + GAP_Y + hdrGap },
  ];

  // --- PANEL 0: Referencia · Avatar 3D ---
  {
    const b = boxes[0];
    ctx.fillStyle = '#111111';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    drawFittedCanvasText(
      ctx,
      'Referencia · Avatar 3D',
      b.x,
      b.y - 12,
      colW - 6,
      hdrPx,
      30,
      true,
    );

    const halfW = Math.floor(colW / 2);
    if (photoImage) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x + 2, b.y + 2, halfW - 4, panelH - 4);
      ctx.clip();
      const iw =
        photoImage instanceof HTMLImageElement
          ? photoImage.naturalWidth || photoImage.width
          : photoImage.width;
      const ih =
        photoImage instanceof HTMLImageElement
          ? photoImage.naturalHeight || photoImage.height
          : photoImage.height;
      const scale = Math.min((halfW - 12) / (iw || 1), (panelH - 12) / (ih || 1));
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.filter = 'grayscale(100%) contrast(108%)';
      ctx.drawImage(photoImage, b.x + (halfW - dw) / 2, b.y + (panelH - dh) / 2, dw, dh);
      ctx.filter = 'none';
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(b.x + 2, b.y + 2, halfW - 4, panelH - 4);
      ctx.fillStyle = '#64748b';
      ctx.font = FN(26, false);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Estatuilla / dibujo', b.x + halfW / 2, b.y + panelH / 2 - 16);
      ctx.font = FN(22, false);
      ctx.fillText('(sin cargar)', b.x + halfW / 2, b.y + panelH / 2 + 16);
      ctx.restore();
    }

    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(b.x + halfW, b.y + 8);
    ctx.lineTo(b.x + halfW, b.y + panelH - 8);
    ctx.stroke();

    const shL = getBoneWorldPos(rig, 'LeftArm');
    const shR = getBoneWorldPos(rig, 'RightArm');
    const sp2 = getBoneWorldPos(rig, 'Spine2');
    const hips = getBoneWorldPos(rig, 'Hips');
    const lat = shL.clone().sub(shR).normalize();
    const trunkUp = sp2.clone().sub(hips).normalize();
    const fwd = lat.clone().cross(trunkUp).normalize();
    const avatarCamDir = fwd
      .clone()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), rad(params.generalYawDeg))
      .normalize();

    const { imageCanvas, camRightWorld, camUpWorld } = renderKateOrthographicPanel(
      rig,
      avatarCamDir,
      halfW - 6,
      panelH - 6,
      contourOutline,
    );
    ctx.drawImage(imageCanvas, b.x + halfW + 3, b.y + 3);
    drawCartesianReferenceTriad(
      ctx,
      b.x + halfW + 3,
      b.y + 3,
      halfW - 6,
      panelH - 6,
      camRightWorld,
      camUpWorld,
    );

    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2.0;
    ctx.strokeRect(b.x, b.y, colW, panelH);
  }

  // --- PANELES 1..3: Vistas en Verdadera Magnitud ---
  for (let i = 0; i < 3; i++) {
    const view = views[i];
    const b = boxes[i + 1];
    if (!view || !b) continue;

    ctx.fillStyle = '#111111';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    drawFittedCanvasText(ctx, view.title, b.x, b.y - 12, colW - 6, hdrPx, 30, true);

    const { imageCanvas, projectPoint, camRightWorld, camUpWorld } = renderKateOrthographicPanel(
      rig,
      view.cameraDirWorld,
      colW - 4,
      panelH - 4,
      contourOutline,
    );
    ctx.drawImage(imageCanvas, b.x + 2, b.y + 2);

    drawCartesianReferenceTriad(
      ctx,
      b.x + 2,
      b.y + 2,
      colW - 4,
      panelH - 4,
      camRightWorld,
      camUpWorld,
    );

    drawGoniometerPanelAnnotations(
      ctx,
      b.x + 2,
      b.y + 2,
      colW - 4,
      panelH - 4,
      view.angles,
      projectPoint,
      Math.round(cambria12Px * 0.96),
    );

    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2.0;
    ctx.strokeRect(b.x, b.y, colW, panelH);
  }

  // --- PIE COMPACTO 1 HOJA (Formato 6×9" B&N): Tabla Ángulos (A–E | F–M) + Puntajes (Izq | Der) + Criterios ---
  if (includeTable) {
    let ty = boxes[2].y + panelH + 30;
    const tblW = W - MG * 2; // 1680 px
    const halfTblW = tblW / 2;

    if (scoringSummary?.compactAnglesPairRows && scoringSummary.compactAnglesPairRows.length > 0) {
      const angHdrH = 52;
      const angRowH = 48;
      const angFontPx = 34;

      // Borde superior e inferior de encabezado Tabla 1
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(MG, ty, tblW, angHdrH);
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(MG, ty);
      ctx.lineTo(MG + tblW, ty);
      ctx.moveTo(MG, ty + angHdrH);
      ctx.lineTo(MG + tblW, ty + angHdrH);
      ctx.stroke();

      ctx.fillStyle = '#111111';
      ctx.font = FN(angFontPx, true);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText('Ángulos medidos (A–E)', MG + 10, ty + angHdrH / 2 + 1);
      ctx.fillText('(F–M)', MG + halfTblW + 24, ty + angHdrH / 2 + 1);
      ty += angHdrH;

      scoringSummary.compactAnglesPairRows.forEach((pair, idx) => {
        if (idx % 2 === 1) {
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(MG, ty, tblW, angRowH);
        }
        ctx.fillStyle = '#111111';
        ctx.textBaseline = 'middle';

        ctx.font = FN(angFontPx, false);
        ctx.textAlign = 'left';
        ctx.fillText(pair.leftLabel, MG + 10, ty + angRowH / 2 + 1);
        ctx.font = FN(angFontPx, true);
        ctx.textAlign = 'right';
        ctx.fillText(pair.leftVal, MG + halfTblW - 22, ty + angRowH / 2 + 1);

        ctx.font = FN(angFontPx, false);
        ctx.textAlign = 'left';
        ctx.fillText(pair.rightLabel, MG + halfTblW + 24, ty + angRowH / 2 + 1);
        ctx.font = FN(angFontPx, true);
        ctx.textAlign = 'right';
        ctx.fillText(pair.rightVal, MG + tblW - 12, ty + angRowH / 2 + 1);

        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(MG, ty + angRowH);
        ctx.lineTo(MG + tblW, ty + angRowH);
        ctx.stroke();
        ty += angRowH;
      });

      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(MG, ty);
      ctx.lineTo(MG + tblW, ty);
      ctx.stroke();

      ty += 24;
    }

    if (scoringSummary?.scoreRows && scoringSummary.scoreRows.length > 0) {
      const scHdrH = 54;
      const scRowH = 52;
      const scFontPx = 34;
      const col0W = Math.round(tblW * 0.44);
      const col1W = Math.round(tblW * 0.28);
      const col2W = tblW - col0W - col1W;

      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(MG, ty, tblW, scHdrH);
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(MG, ty);
      ctx.lineTo(MG + tblW, ty);
      ctx.moveTo(MG, ty + scHdrH);
      ctx.lineTo(MG + tblW, ty + scHdrH);
      ctx.stroke();

      ctx.fillStyle = '#111111';
      ctx.font = FN(scFontPx + 2, true);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText('Puntajes recalculados', MG + 10, ty + scHdrH / 2 + 1);
      ctx.textAlign = 'center';
      ctx.fillText('Lado izq.', MG + col0W + col1W / 2, ty + scHdrH / 2 + 1);
      ctx.fillText('Lado der.', MG + col0W + col1W + col2W / 2, ty + scHdrH / 2 + 1);
      ty += scHdrH;

      scoringSummary.scoreRows.forEach((sr, idx) => {
        if (sr.bold) {
          ctx.fillStyle = '#f1f5f9';
          ctx.fillRect(MG, ty, tblW, scRowH);
        } else if (idx % 2 === 1) {
          ctx.fillStyle = '#fafafa';
          ctx.fillRect(MG, ty, tblW, scRowH);
        }

        ctx.fillStyle = '#111111';
        ctx.font = FN(scFontPx, Boolean(sr.bold));
        ctx.textBaseline = 'middle';

        ctx.textAlign = 'left';
        ctx.fillText(sr.label, MG + 10, ty + scRowH / 2 + 1, col0W - 18);

        ctx.textAlign = 'center';
        ctx.fillText(sr.left, MG + col0W + col1W / 2, ty + scRowH / 2 + 1, col1W - 14);
        ctx.fillText(sr.right, MG + col0W + col1W + col2W / 2, ty + scRowH / 2 + 1, col2W - 14);

        ctx.strokeStyle = '#d1d5db';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(MG, ty + scRowH);
        ctx.lineTo(MG + tblW, ty + scRowH);
        ctx.stroke();
        ty += scRowH;
      });

      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(MG, ty);
      ctx.lineTo(MG + tblW, ty);
      ctx.stroke();

      ty += 24;
    }

    if (scoringSummary?.criteriaLine) {
      ctx.fillStyle = '#333333';
      ctx.font = FN(28, false);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const lines = wrapCanvasText(ctx, scoringSummary.criteriaLine, tblW - 12);
      for (const ln of lines.slice(0, 6)) {
        if (ty + 32 > H - 24) break;
        ctx.fillText(ln, MG + 4, ty + 24);
        ty += 36;
      }
    }
  }

  return { canvas: sheet, angles, snapshot, views };
}

// ---------------------------------------------------------------------------
// Detección robusta de pose 3D + manos 21 puntos (ROI + fallback) desde foto
// ---------------------------------------------------------------------------
export interface KateDetectionResult {
  landmarks: KateLandmark3D[] | null;
  handsLandmarks: KateDetectedHandsLandmarks;
  confidence: number;
  usedRotationDeg: number;
  modelTier: 'heavy' | 'full' | 'lite' | 'none';
}

const HAND_WASM_CDNS = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm',
  'https://unpkg.com/@mediapipe/tasks-vision@0.10.8/wasm',
];
const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

let cachedHandLandmarker: HandLandmarker | null = null;
let handInitPromise: Promise<HandLandmarker | null> | null = null;

async function initKateHandLandmarker(): Promise<HandLandmarker | null> {
  if (cachedHandLandmarker) return cachedHandLandmarker;
  if (handInitPromise) return handInitPromise;

  handInitPromise = (async () => {
    for (const cdn of HAND_WASM_CDNS) {
      try {
        const vision = await FilesetResolver.forVisionTasks(cdn);
        const delegates: Array<'CPU' | 'GPU'> = detectSoftwareWebGL() ? ['CPU', 'GPU'] : ['GPU', 'CPU'];
        for (const delegate of delegates) {
          try {
            const hl = await HandLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate },
              runningMode: 'IMAGE',
              numHands: 2,
              minHandDetectionConfidence: 0.25,
              minHandPresenceConfidence: 0.25,
              minTrackingConfidence: 0.25,
            });
            cachedHandLandmarker = hl;
            return hl;
          } catch {
            // intentar siguiente delegado
          }
        }
      } catch {
        // intentar siguiente CDN
      }
    }
    handInitPromise = null;
    return null;
  })();

  return handInitPromise;
}

function drawRotatedPaddedCanvas(
  img: HTMLImageElement | HTMLCanvasElement,
  rotDeg: number,
  maxSide = 960,
): HTMLCanvasElement {
  const iw = img instanceof HTMLImageElement ? img.naturalWidth || img.width : img.width;
  const ih = img instanceof HTMLImageElement ? img.naturalHeight || img.height : img.height;
  const baseScale = Math.min(1.6, maxSide / Math.max(iw, ih, 1));
  const dw = Math.max(48, Math.round(iw * baseScale));
  const dh = Math.max(48, Math.round(ih * baseScale));
  const pad = Math.round(Math.max(dw, dh) * 0.10);
  const side = Math.ceil(Math.hypot(dw, dh) + pad * 2);

  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, side, side);
  ctx.translate(side / 2, side / 2);
  ctx.rotate((rotDeg * Math.PI) / 180);
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  return canvas;
}

/**
 * Fusiona la silueta 2D de alta precisión en píxeles (`norm2D` sobre canvas cuadrado)
 * con las profundidades métricas 3D (`wl`), propagando Z consistente con longitudes óseas reales.
 */
function fuseNorm2DWithWorld3D(
  wl: KateLandmark3D[],
  norm2D: KateLandmark3D[] | undefined | null,
): KateLandmark3D[] {
  const out = wl.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility }));
  if (!norm2D || norm2D.length < 33 || wl.length < 33) return out;

  const core = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
  let wSum = 0;
  let cxN = 0;
  let cyN = 0;
  let cxW = 0;
  let cyW = 0;
  for (const idx of core) {
    const vis = Math.min(wl[idx].visibility ?? 0.5, norm2D[idx].visibility ?? 0.5);
    if (vis < 0.32) continue;
    wSum += vis;
    cxN += norm2D[idx].x * vis;
    cyN += norm2D[idx].y * vis;
    cxW += wl[idx].x * vis;
    cyW += wl[idx].y * vis;
  }
  if (wSum < 1.2) return out;
  cxN /= wSum;
  cyN /= wSum;
  cxW /= wSum;
  cyW /= wSum;

  let radN = 0;
  let radW = 0;
  for (const idx of core) {
    const vis = Math.min(wl[idx].visibility ?? 0.5, norm2D[idx].visibility ?? 0.5);
    if (vis < 0.32) continue;
    radN += vis * Math.hypot(norm2D[idx].x - cxN, norm2D[idx].y - cyN);
    radW += vis * Math.hypot(wl[idx].x - cxW, wl[idx].y - cyW);
  }
  if (radN < 1e-4) return out;
  const scale = clamp(radW / radN, 0.35, 6.5);

  const dist3 = (a: number, b: number) =>
    Math.hypot(wl[b].x - wl[a].x, wl[b].y - wl[a].y, wl[b].z - wl[a].z);
  const shMidW = {
    x: (wl[11].x + wl[12].x) * 0.5,
    y: (wl[11].y + wl[12].y) * 0.5,
    z: (wl[11].z + wl[12].z) * 0.5,
  };
  const hpMidW = {
    x: (wl[23].x + wl[24].x) * 0.5,
    y: (wl[23].y + wl[24].y) * 0.5,
    z: (wl[23].z + wl[24].z) * 0.5,
  };
  const torso3D = Math.max(0.32, Math.hypot(shMidW.x - hpMidW.x, shMidW.y - hpMidW.y, shMidW.z - hpMidW.z));

  const upperLen = clamp((dist3(11, 13) + dist3(12, 14)) * 0.5, 0.48 * torso3D, 0.66 * torso3D);
  const foreLen = clamp((dist3(13, 15) + dist3(14, 16)) * 0.5, 0.40 * torso3D, 0.58 * torso3D);
  const thighLen = clamp((dist3(23, 25) + dist3(24, 26)) * 0.5, 0.72 * torso3D, 0.96 * torso3D);
  const shankLen = clamp((dist3(25, 27) + dist3(26, 28)) * 0.5, 0.68 * torso3D, 0.94 * torso3D);

  const torso2dY = Math.max(
    0.05,
    Math.hypot(
      (norm2D[11].x + norm2D[12].x) * 0.5 - (norm2D[23].x + norm2D[24].x) * 0.5,
      (norm2D[11].y + norm2D[12].y) * 0.5 - (norm2D[23].y + norm2D[24].y) * 0.5,
    ),
  );
  const isFrontal2D = Math.abs(norm2D[11].x - norm2D[12].x) > 0.48 * torso2dY;

  // 1) Alinear (X, Y) con la silueta exacta de la fotografía (evitando caída falsa Y por perspectiva en talón/punta frontal)
  for (let i = 0; i < 33; i++) {
    const vis2d = norm2D[i].visibility ?? wl[i].visibility ?? 0.5;
    if (vis2d < 0.30) continue;
    const px = cxW + (norm2D[i].x - cxN) * scale;
    const py = cyW + (norm2D[i].y - cyN) * scale;
    const alpha = clamp((vis2d - 0.25) / 0.45, 0.55, 0.94);
    out[i].x = wl[i].x + (px - wl[i].x) * alpha;
    if (!(isFrontal2D && i >= 29 && i <= 32)) {
      out[i].y = wl[i].y + (py - wl[i].y) * alpha;
    }
  }

  // 2) Propagar Z consistente con escorzo 2D real en piernas y brazos
  const fixChain = (parentIdx: number, childIdx: number, refLen: number, followers: number[] = []) => {
    const d2 = Math.hypot(out[childIdx].x - out[parentIdx].x, out[childIdx].y - out[parentIdx].y);
    const dzWl = wl[childIdx].z - wl[parentIdx].z;
    const dzGeom = d2 < refLen ? Math.sqrt(Math.max(0, refLen * refLen - d2 * d2)) : 0;

    let dz = dzWl;
    if (d2 >= 0.91 * refLen) {
      // Segmento casi paralelo al plano de la foto: acotar deriva Z falsa
      const maxDz = Math.max(dzGeom, 0.14 * refLen);
      dz = clamp(dzWl, -maxDz, maxDz);
    } else if (d2 < 0.86 * refLen) {
      // Segmento visiblemente escorzado en profundidad: respetar longitud ósea real
      const sign = dzWl >= 0 ? 1 : -1;
      dz = dzWl + (sign * dzGeom - dzWl) * 0.72;
    }

    const oldZ = out[childIdx].z;
    out[childIdx].z = out[parentIdx].z + dz;
    const shift = out[childIdx].z - oldZ;
    for (const fi of followers) {
      out[fi].z += shift;
    }
  };

  fixChain(23, 25, thighLen, [27, 29, 31]);
  fixChain(25, 27, shankLen, [29, 31]);
  fixChain(24, 26, thighLen, [28, 30, 32]);
  fixChain(26, 28, shankLen, [30, 32]);

  fixChain(11, 13, upperLen, [15, 17, 19, 21]);
  fixChain(13, 15, foreLen, [17, 19, 21]);
  fixChain(12, 14, upperLen, [16, 18, 20, 22]);
  fixChain(14, 16, foreLen, [18, 20, 22]);

  return out;
}

function unrotateXY(pts: Array<{ x: number; y: number; z: number; visibility?: number }>, rotDeg: number): KateLandmark3D[] {
  const invRad = (-rotDeg * Math.PI) / 180;
  const c = Math.cos(invRad);
  const s = Math.sin(invRad);
  return pts.map((p) => ({
    x: p.x * c - p.y * s,
    y: p.x * s + p.y * c,
    z: p.z,
    visibility: p.visibility,
  }));
}

function detectHandCropOnCanvas(
  handLm: HandLandmarker,
  srcCanvas: HTMLCanvasElement,
  normPts: Array<{ x: number; y: number }>,
  indices: number[],
): KateLandmark3D[] | null {
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (const idx of indices) {
    const pt = normPts[idx];
    if (!pt) continue;
    minX = Math.min(minX, pt.x);
    maxX = Math.max(maxX, pt.x);
    minY = Math.min(minY, pt.y);
    maxY = Math.max(maxY, pt.y);
  }
  const cx = ((minX + maxX) * 0.5) * srcCanvas.width;
  const cy = ((minY + maxY) * 0.5) * srcCanvas.height;
  const span = Math.max((maxX - minX) * srcCanvas.width, (maxY - minY) * srcCanvas.height, srcCanvas.width * 0.14);
  const box = Math.round(span * 2.8);
  const sx = clamp(Math.round(cx - box / 2), 0, Math.max(0, srcCanvas.width - 16));
  const sy = clamp(Math.round(cy - box / 2), 0, Math.max(0, srcCanvas.height - 16));
  const sw = Math.min(box, srcCanvas.width - sx);
  const sh = Math.min(box, srcCanvas.height - sy);
  if (sw < 24 || sh < 24) return null;

  const crop = document.createElement('canvas');
  crop.width = 256;
  crop.height = 256;
  const cctx = crop.getContext('2d')!;
  cctx.fillStyle = '#ffffff';
  cctx.fillRect(0, 0, 256, 256);
  cctx.drawImage(srcCanvas, sx, sy, sw, sh, 16, 16, 224, 224);

  try {
    const res = handLm.detect(crop);
    const hw = res.worldLandmarks?.[0];
    return hw && hw.length >= 21 ? hw : null;
  } catch {
    return null;
  }
}

export async function detectKateLandmarksFromImage(
  img: HTMLImageElement | HTMLCanvasElement,
): Promise<KateDetectionResult> {
  const [mocap, handLm] = await Promise.all([initHeavyPoseMoCap(false), initKateHandLandmarker()]);
  if (!mocap) {
    return {
      landmarks: null,
      handsLandmarks: {},
      confidence: 0,
      usedRotationDeg: 0,
      modelTier: 'none',
    };
  }

  const rotations = [0, -45, 45, 90, -90];
  let bestLandmarks: KateLandmark3D[] | null = null;
  let bestNorm2D: Array<{ x: number; y: number }> | null = null;
  let bestCanvas: HTMLCanvasElement | null = null;
  let bestConf = -1;
  let bestRot = 0;

  for (const rotDeg of rotations) {
    const canvas = drawRotatedPaddedCanvas(img, rotDeg, 960);
    let res;
    try {
      res = mocap.landmarker.detect(canvas);
    } catch {
      continue;
    }
    const wl = res.worldLandmarks?.[0];
    if (!wl || wl.length < 33) continue;

    const keyIndices = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
    const avgVis =
      keyIndices.reduce((acc, idx) => acc + (wl[idx]?.visibility ?? 0.5), 0) / keyIndices.length;

    const fused = fuseNorm2DWithWorld3D(wl, res.landmarks?.[0]);
    const unrotated = unrotateXY(fused, rotDeg);
    if (avgVis > bestConf) {
      bestConf = avgVis;
      bestLandmarks = unrotated;
      bestNorm2D = res.landmarks?.[0] || null;
      bestCanvas = canvas;
      bestRot = rotDeg;
    }

    if (rotDeg === 0 && avgVis >= 0.62) {
      break;
    }
  }

  const handsLandmarks: KateDetectedHandsLandmarks = {};
  if (handLm && bestCanvas && bestNorm2D) {
    // 1) Intentar recorte ROI de alta resolución alrededor de cada mano
    const rawL = detectHandCropOnCanvas(handLm, bestCanvas, bestNorm2D, [15, 17, 19, 21]);
    const rawR = detectHandCropOnCanvas(handLm, bestCanvas, bestNorm2D, [16, 18, 20, 22]);
    if (rawL) handsLandmarks.left = unrotateXY(rawL, bestRot);
    if (rawR) handsLandmarks.right = unrotateXY(rawR, bestRot);

    // 2) Fallback en imagen completa si faltó alguna mano
    if (!handsLandmarks.left || !handsLandmarks.right) {
      try {
        const fullRes = handLm.detect(bestCanvas);
        const wrL = bestNorm2D[15];
        const wrR = bestNorm2D[16];
        for (let i = 0; i < (fullRes.worldLandmarks?.length || 0); i++) {
          const hw = fullRes.worldLandmarks[i];
          const hn = fullRes.landmarks?.[i]?.[0];
          if (!hw || hw.length < 21 || !hn) continue;
          const dL = wrL ? Math.hypot(hn.x - wrL.x, hn.y - wrL.y) : 99;
          const dR = wrR ? Math.hypot(hn.x - wrR.x, hn.y - wrR.y) : 99;
          if (dL <= dR && !handsLandmarks.left && dL < 0.25) {
            handsLandmarks.left = unrotateXY(hw, bestRot);
          } else if (dR < dL && !handsLandmarks.right && dR < 0.25) {
            handsLandmarks.right = unrotateXY(hw, bestRot);
          }
        }
      } catch {
        // Ignorar fallo en fallback manos
      }
    }
  }

  return {
    landmarks: bestLandmarks,
    handsLandmarks,
    confidence: bestConf > 0 ? bestConf : 0,
    usedRotationDeg: bestRot,
    modelTier: mocap.tier,
  };
}

export function mirrorKatePoseLeftRight(p: KatePoseParams): KatePoseParams {
  const mirroredOverrides: Record<string, KateBoneOverride> = {};
  for (const [k, v] of Object.entries(p.boneOverrides || {})) {
    let target = k;
    if (k.startsWith('Left')) target = 'Right' + k.slice(4);
    else if (k.startsWith('Right')) target = 'Left' + k.slice(5);
    mirroredOverrides[target] = {
      ...v,
      ry: -v.ry,
      rz: -v.rz,
      tx: v.tx ? -v.tx : 0,
    };
  }

  return {
    ...p,
    neckSideDeg: -p.neckSideDeg,
    neckTwistDeg: -p.neckTwistDeg,
    trunkSideDeg: -p.trunkSideDeg,
    trunkTwistDeg: -p.trunkTwistDeg,
    bodyRollDeg: -p.bodyRollDeg,
    bodyYawDeg: -p.bodyYawDeg,
    shoulderLFlexDeg: p.shoulderRFlexDeg,
    shoulderLAbdDeg: p.shoulderRAbdDeg,
    elbowLFlexDeg: p.elbowRFlexDeg,
    forearmLVert: p.forearmRVert,
    wristLInwardDeg: p.wristRInwardDeg,
    shoulderRFlexDeg: p.shoulderLFlexDeg,
    shoulderRAbdDeg: p.shoulderLAbdDeg,
    elbowRFlexDeg: p.elbowLFlexDeg,
    forearmRVert: p.forearmLVert,
    wristRInwardDeg: p.wristLInwardDeg,
    handL: { ...p.handR, wristYawDeg: -p.handR.wristYawDeg, wristRollDeg: -p.handR.wristRollDeg },
    handR: { ...p.handL, wristYawDeg: -p.handL.wristYawDeg, wristRollDeg: -p.handL.wristRollDeg },
    hipLFlexDeg: p.hipRFlexDeg,
    hipLAbdDeg: p.hipRAbdDeg,
    hipLRotDeg: p.hipRRotDeg,
    kneeLFlexDeg: p.kneeRFlexDeg,
    hipRFlexDeg: p.hipLFlexDeg,
    hipRAbdDeg: p.hipLAbdDeg,
    hipRRotDeg: p.hipLRotDeg,
    kneeRFlexDeg: p.kneeLFlexDeg,
    footL: { ...p.footR, yawDeg: -p.footR.yawDeg },
    footR: { ...p.footL, yawDeg: -p.footL.yawDeg },
    apoL: p.apoR,
    apoR: p.apoL,
    useRawLandmarks: false,
    boneOverrides: mirroredOverrides,
  };
}

export const KATE_SAMPLE_GALLERY: Array<{
  id: string;
  label: string;
  url: string;
  suggestedPreset?: KatePresetId;
}> = [
  {
    id: 'p123',
    label: 'p123 · Mano abdomen',
    url: '/assets/aistudio/p123_1frente_29c527d3.png',
    suggestedPreset: 'hands_belly',
  },
  {
    id: 'p155',
    label: 'p155 · Manos cadera',
    url: '/assets/aistudio/p155_frente_1fb5486d.png',
    suggestedPreset: 'hands_hips',
  },
  {
    id: 'p127',
    label: 'p127 · Loto manos rostro',
    url: '/assets/aistudio/p127_2Frente_9ea9d3e6.png',
    suggestedPreset: 'lotus',
  },
  {
    id: 'p126',
    label: 'p126 · Rodillas frente',
    url: '/assets/aistudio/p126_1b_33300d7d.png',
    suggestedPreset: 'kneeling',
  },
  {
    id: 'p124',
    label: 'p124 · Rampa inclinada',
    url: '/assets/aistudio/p124_1lateral_2b4b6dd4.png',
    suggestedPreset: 'ramp45',
  },
  {
    id: 'p128',
    label: 'p128 · Loto manos muslo',
    url: '/assets/aistudio/p128_1Frente_6a655dba.png',
    suggestedPreset: 'lotus',
  },
  {
    id: 'p135',
    label: 'p135 · Loto manos abdomen',
    url: '/assets/aistudio/p135_1frente_e6234e73.png',
    suggestedPreset: 'lotus',
  },
  {
    id: 'p136',
    label: 'p136 · Postura lateral/loto',
    url: '/assets/aistudio/p136_1Frente_28ea3707.png',
    suggestedPreset: 'lotus',
  },
  {
    id: 'img_32',
    label: 'Ref · De rodillas arriba',
    url: '/assets/aistudio/image_32c0bb02_5056923e.jpg',
    suggestedPreset: 'kneeling',
  },
];


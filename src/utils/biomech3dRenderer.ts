import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  AngleArcAnnotation,
  BookFigureFileSpec,
  CameraPreset,
  DimensionAnnotation,
  FocusZone,
  ForceVectorAnnotation,
  JointKey,
  Panel3DSpec,
  PosturePose3D,
  RenderedPngResult,
  ScenePropType,
} from '../types/figurePlan';
import { renderDiagramVariant } from './diagramRenderer';
import {
  exportCanvasToHighQualityPng,
  exportCanvasToOptimizedPng,
} from './pngOptimizer';
import { getEffectiveFigurePhotoUrl } from './figurePlanCatalog';
import type { MocapFrameSample } from './mocapRetargeter';

export const AVATAR_GLB_URL = '/models/ergo_avatar.glb';

export interface CameraOrbitOverride {
  azimuthDeg: number;
  elevationDeg: number;
  zoom: number;
}

export type BiomechVisualStyle = 'anatomical_skin';

export interface FigureRenderOptions {
  preferSynthetic3D?: boolean;
  includeHeaderOnPhoto?: boolean;
  visualStyle?: BiomechVisualStyle;
  transparentBg?: boolean;
  onAsyncPhotoLoaded?: () => void;
  /**
   * Fuerza encuadre de cuerpo completo en los paneles que no son un primer plano
   * (muñeca, tobillo, piernas). Por defecto usa DEFAULT_FORCE_FULL_BODY.
   */
  forceFullBody?: boolean;
  /** Índice del panel activo (0 = Cuerpo A, 1 = Cuerpo B, ...) para resaltado visual en edición multicuerpo. */
  activePanelHighlightIdx?: number;
}

export const DEFAULT_ORBIT_OVERRIDE: CameraOrbitOverride = {
  azimuthDeg: 0,
  elevationDeg: 0,
  zoom: 1,
};

const DEG2RAD = Math.PI / 180;

// ----------------------------------------------------------------------------
// AJUSTES DE LOOK (puedes cambiarlos aquí sin tocar el resto del código)
// ----------------------------------------------------------------------------
/** true = cuerpo completo en todas las figuras salvo primeros planos; false = zoom por zona. */
const DEFAULT_FORCE_FULL_BODY = true;

/**
 * Pose relajada de base: si un valor de abducción/flexión de codo viene en 0,
 * se usa un mínimo natural, y de pie se adelanta una pierna.
 * Ponlo en false si necesitas ángulos exactos sin ningún offset.
 */
const NATURAL_REST_POSE = false;
const REST_SHOULDER_ABDUCTION_DEG = 5;
const REST_ELBOW_FLEXION_DEG = 10;

/** Mixamo viene en T-pose: baja los brazos a una pose anatómica neutra de pie (brazos colgando). */
const DROP_ARMS_FROM_T_POSE = true;

/** Campo de visión de la cámara en perspectiva (grados). Menor = más "fotográfico". */
const PERSPECTIVE_FOV_DEG = 30;

/**
 * Vistas que usan perspectiva (aspecto de foto). Las vistas de medición
 * (sagitales y superior) se mantienen ortográficas para no distorsionar ángulos.
 */
const PERSPECTIVE_PRESETS: CameraPreset[] = [
  'perspective_oblique',
  'isometric',
  'frontal',
  'dorsal',
];

/** Zonas de primer plano estricto (muñeca, cuello, tobillo) que mantienen zoom dedicado. */
const CLOSEUP_ZONES: FocusZone[] = ['wrist_hand', 'ankle_foot', 'neck_cervical'];

const PALETTE = {
  bgHex: 0xffffff,
  propSteelHex: 0xdbe2ea,
  propLoadHex: 0xd9b99b,
  ink: '#0f172a',
  sub: '#334155',
  muted: '#64748b',
  border: '#cbd5e1',
  arcOrange: '#ea580c',
  arcText: '#c2410c',
  vecBlue: '#1d4ed8',
  vecSlate: '#334155',
  nodeBlue: '#0284c7',
};

// ============================================================================
// PHOTO CACHE FOR PURE REFERENCE PLATES (CHAPTER 4 STANDALONE EXPORT/VIEW)
// ============================================================================
const loadedPhotoCache = new Map<string, HTMLImageElement>();
const pendingPhotoPromises = new Map<string, Promise<HTMLImageElement | null>>();

export function preloadFigurePhoto(url: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  const cached = loadedPhotoCache.get(url);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    return Promise.resolve(cached);
  }
  const existing = pendingPhotoPromises.get(url);
  if (existing) return existing;

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (img.naturalWidth > 0) {
        loadedPhotoCache.set(url, img);
        pendingPhotoPromises.delete(url);
        resolve(img);
      } else {
        pendingPhotoPromises.delete(url);
        resolve(null);
      }
    };
    img.onerror = () => {
      pendingPhotoPromises.delete(url);
      resolve(null);
    };
    img.src = url;
  });

  pendingPhotoPromises.set(url, promise);
  return promise;
}

// ============================================================================
// REALISTIC PBR .GLB AVATAR RIG & BONE MAPPING DEFINITIONS
// ============================================================================
type SegmentGroupKey =
  | 'pelvis'
  | 'lumbar'
  | 'thorax'
  | 'neck_head'
  | 'upper_arm_r'
  | 'forearm_r'
  | 'hand_r'
  | 'upper_arm_l'
  | 'forearm_l'
  | 'hand_l'
  | 'thigh_r'
  | 'shank_r'
  | 'foot_r'
  | 'thigh_l'
  | 'shank_l'
  | 'foot_l';

const ALL_SEGMENTS: SegmentGroupKey[] = [
  'pelvis',
  'lumbar',
  'thorax',
  'neck_head',
  'upper_arm_r',
  'forearm_r',
  'hand_r',
  'upper_arm_l',
  'forearm_l',
  'hand_l',
  'thigh_r',
  'shank_r',
  'foot_r',
  'thigh_l',
  'shank_l',
  'foot_l',
];

const FOCUS_ZONE_SEGMENTS: Record<FocusZone, SegmentGroupKey[]> = {
  wrist_hand: ['forearm_r', 'hand_r'],
  ankle_foot: ['shank_r', 'foot_r'],
  legs_knees: ALL_SEGMENTS,
  elbow_forearm: ALL_SEGMENTS,
  shoulder_arm: ALL_SEGMENTS,
  neck_cervical: ALL_SEGMENTS,
  lumbar_l5s1: ALL_SEGMENTS,
  trunk_pelvis: ALL_SEGMENTS,
  full_body: ALL_SEGMENTS,
};

const FOCUS_ZONE_JOINTS: Record<FocusZone, JointKey[]> = {
  wrist_hand: ['elbowR', 'wristR', 'handR'],
  ankle_foot: ['kneeR', 'ankleR', 'footR'],
  legs_knees: ['pelvis', 'hipR', 'kneeR', 'ankleR', 'footR', 'hipL', 'kneeL', 'ankleL', 'footL'],
  elbow_forearm: ['shoulderR', 'elbowR', 'wristR', 'handR', 'c7', 'l5s1'],
  shoulder_arm: ['c7', 'shoulderR', 'elbowR', 'wristR', 'l5s1'],
  neck_cervical: ['t12', 'c7', 'head'],
  lumbar_l5s1: ['pelvis', 'l5s1', 't12', 'hipR'],
  trunk_pelvis: ['pelvis', 'l5s1', 't12', 'c7', 'head', 'hipR', 'kneeR'],
  full_body: [
    'pelvis',
    'l5s1',
    't12',
    'c7',
    'head',
    'shoulderR',
    'elbowR',
    'wristR',
    'handR',
    'shoulderL',
    'elbowL',
    'wristL',
    'handL',
    'hipR',
    'kneeR',
    'ankleR',
    'footR',
    'hipL',
    'kneeL',
    'ankleL',
    'footL',
  ],
};

interface BoneRestState {
  bone: THREE.Bone;
  restPos: THREE.Vector3;
  restQuat: THREE.Quaternion;
  restWorldQuat: THREE.Quaternion;
  restWorldPos: THREE.Vector3;
}

interface GlbAvatarRig {
  avatarContainer: THREE.Group;
  propsRoot: THREE.Group;
  groundShadowMesh: THREE.Mesh;
  bones: Map<string, BoneRestState>;
  joints: Record<JointKey, THREE.Object3D>;
  skinnedMeshes: THREE.SkinnedMesh[];
  segmentMeshes: Record<SegmentGroupKey, THREE.SkinnedMesh[]>;
  baseMaterials: Map<THREE.SkinnedMesh, THREE.MeshStandardMaterial>;
  groupATintMaterials: Map<THREE.SkinnedMesh, THREE.MeshStandardMaterial>;
  groupBTintMaterials: Map<THREE.SkinnedMesh, THREE.MeshStandardMaterial>;
  isReady: boolean;
  skeletonMapped: boolean;
}

interface StudioEngine3D {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  orthoCam: THREE.OrthographicCamera;
  perspCam: THREE.PerspectiveCamera;
  rig: GlbAvatarRig;
  isSoftwareRenderer: boolean;
}

let sharedEngine: StudioEngine3D | null = null;
let engineCreationFailed = false;
let avatarLoadPromise: Promise<void> | null = null;
const avatarLoadedSubscribers = new Set<() => void>();

export function isAvatarGlbReady(): boolean {
  return Boolean(sharedEngine?.rig.isReady);
}

export function subscribeAvatarGlbLoaded(listener: () => void): () => void {
  avatarLoadedSubscribers.add(listener);
  return () => {
    avatarLoadedSubscribers.delete(listener);
  };
}

function notifyAvatarLoaded(): void {
  avatarLoadedSubscribers.forEach((cb) => {
    try {
      cb();
    } catch {
      // Ignore subscriber error
    }
  });
}

function createEmptySegmentMeshMap(): Record<SegmentGroupKey, THREE.SkinnedMesh[]> {
  return {
    pelvis: [],
    lumbar: [],
    thorax: [],
    neck_head: [],
    upper_arm_r: [],
    forearm_r: [],
    hand_r: [],
    upper_arm_l: [],
    forearm_l: [],
    hand_l: [],
    thigh_r: [],
    shank_r: [],
    foot_r: [],
    thigh_l: [],
    shank_l: [],
    foot_l: [],
  };
}

function createPlaceholderJoints(parent: THREE.Group): Record<JointKey, THREE.Object3D> {
  const keys: JointKey[] = [
    'pelvis',
    'l5s1',
    't12',
    'c7',
    'head',
    'shoulderR',
    'elbowR',
    'wristR',
    'handR',
    'shoulderL',
    'elbowL',
    'wristL',
    'handL',
    'hipR',
    'kneeR',
    'ankleR',
    'footR',
    'hipL',
    'kneeL',
    'ankleL',
    'footL',
  ];
  const map = {} as Record<JointKey, THREE.Object3D>;
  for (const k of keys) {
    const o = new THREE.Object3D();
    parent.add(o);
    map[k] = o;
  }
  return map;
}

/**
 * Configures clean, soft studio lighting (sRGB output, neutral tone mapping,
 * IBL environment, ambient fill, soft directional shadows).
 */
function configureStudioLighting(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  isSoftwareRenderer: boolean,
): THREE.Mesh {
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.6;
    pmrem.dispose();
  } catch {
    // Direct studio lights below provide full illumination if PMREM is unavailable
  }

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0xf8fafc, 0xdbe3ec, 0.7);
  hemiLight.position.set(0, 3.2, 0);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfffcf8, 1.32);
  keyLight.position.set(-2.6, 3.8, 2.8);
  if (!isSoftwareRenderer) {
    const isMobileGpu =
      typeof window !== 'undefined' &&
      (window.innerWidth < 768 || Boolean(window.matchMedia?.('(pointer: coarse)').matches));
    const shadowRes = isMobileGpu ? 1024 : 2048;
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(shadowRes, shadowRes);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 12;
    keyLight.shadow.camera.left = -1.8;
    keyLight.shadow.camera.right = 1.8;
    keyLight.shadow.camera.top = 2.4;
    keyLight.shadow.camera.bottom = -0.4;
    keyLight.shadow.bias = -0.0003;
    keyLight.shadow.normalBias = 0.018;
    // `radius` solo tiene efecto con PCFShadowMap (no con PCFSoftShadowMap)
    keyLight.shadow.radius = isMobileGpu ? 3 : 4;
  }
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xf1f5f9, 0.62);
  fillLight.position.set(2.8, 2.2, 2.4);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xe2e8f0, 0.42);
  rimLight.position.set(0.4, 2.4, -2.8);
  scene.add(rimLight);

  // Soft studio contact-shadow catcher plane on floor y = 0 (amplio para desplazamientos a pie)
  const shadowFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(6.8, 6.8),
    new THREE.ShadowMaterial({ color: 0x0f172a, opacity: 0.22 }),
  );
  shadowFloor.rotation.x = -Math.PI / 2;
  shadowFloor.position.set(0, 0, 0);
  shadowFloor.receiveShadow = !isSoftwareRenderer;
  scene.add(shadowFloor);

  return shadowFloor;
}

/**
 * Strips any debug lines or SkeletonHelpers from the loaded GLTF hierarchy,
 * configures PBR sRGB textures + shadows, and binds anatomical bones to JointKeys.
 */
function bindLoadedGlbToRig(
  gltfScene: THREE.Group,
  engine: StudioEngine3D,
): void {
  const { rig, renderer, isSoftwareRenderer } = engine;
  const maxAniso = renderer.capabilities.getMaxAnisotropy() || 1;

  // Clear placeholder nodes
  while (rig.avatarContainer.children.length > 0) {
    rig.avatarContainer.remove(rig.avatarContainer.children[0]);
  }
  rig.bones.clear();
  rig.skinnedMeshes.length = 0;
  rig.baseMaterials.clear();
  rig.groupATintMaterials.clear();
  rig.groupBTintMaterials.clear();
  rig.segmentMeshes = createEmptySegmentMeshMap();

  // Remove any SkeletonHelper, Line, LineSegments, or Points debug primitives if present
  const debugObjectsToRemove: THREE.Object3D[] = [];
  gltfScene.traverse((obj) => {
    if (
      obj instanceof THREE.SkeletonHelper ||
      obj instanceof THREE.Line ||
      obj instanceof THREE.Points
    ) {
      debugObjectsToRemove.push(obj);
    }
  });
  for (const dbg of debugObjectsToRemove) {
    dbg.parent?.remove(dbg);
  }

  // Register bones & PBR SkinnedMeshes
  gltfScene.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) {
      const bone = obj as THREE.Bone;
      const entry: BoneRestState = {
        bone,
        restPos: bone.position.clone(),
        restQuat: bone.quaternion.clone(),
        restWorldQuat: new THREE.Quaternion(),
        restWorldPos: new THREE.Vector3(),
      };
      // Soporta prefijos Mixamo con o sin índice ("mixamorig:Hips", "mixamorig1:Hips", "mixamorig_Hips")
      const clean = bone.name
        .replace(/^mixamorig\d*[:_]?/i, '')
        .replace(/[._]?00\d$/, '');
      rig.bones.set(bone.name, entry);
      rig.bones.set(clean, entry);
      const finger = clean.match(/^(Left|Right)HandIndex(\d)$/);
      if (finger) {
        rig.bones.set(`${finger[1]}HandFingers${finger[2]}`, entry);
      }
    }

    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
      const sm = obj as THREE.SkinnedMesh;
      sm.castShadow = !isSoftwareRenderer;
      sm.receiveShadow = !isSoftwareRenderer;
      sm.frustumCulled = false;

      const origMat = Array.isArray(sm.material) ? sm.material[0] : sm.material;
      const stdMat =
        origMat instanceof THREE.MeshStandardMaterial
          ? origMat
          : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0 });

      if (stdMat.map) {
        stdMat.map.colorSpace = THREE.SRGBColorSpace;
        stdMat.map.anisotropy = maxAniso;
        stdMat.map.needsUpdate = true;
      }
      if (stdMat.transparent) {
        stdMat.alphaTest = Math.max(stdMat.alphaTest || 0, 0.08);
        stdMat.depthWrite = true;
      }
      stdMat.envMapIntensity = 0.52;
      stdMat.needsUpdate = true;
      sm.material = stdMat;

      rig.skinnedMeshes.push(sm);
      rig.baseMaterials.set(sm, stdMat);

      const matA = stdMat.clone();
      matA.emissive = new THREE.Color(0x0284c7);
      matA.emissiveIntensity = 0.14;
      rig.groupATintMaterials.set(sm, matA);

      const matB = stdMat.clone();
      matB.emissive = new THREE.Color(0xea580c);
      matB.emissiveIntensity = 0.12;
      rig.groupBTintMaterials.set(sm, matB);

      const n = sm.name;
      if (n === 'Avatar_HeadNeck') {
        rig.segmentMeshes.neck_head.push(sm);
      } else if (n === 'Avatar_Tshirt') {
        rig.segmentMeshes.thorax.push(sm);
        rig.segmentMeshes.lumbar.push(sm);
      } else if (n === 'Avatar_TshirtSleeveR') {
        rig.segmentMeshes.upper_arm_r.push(sm);
      } else if (n === 'Avatar_TshirtSleeveL') {
        rig.segmentMeshes.upper_arm_l.push(sm);
      } else if (n === 'Avatar_ArmHandR') {
        rig.segmentMeshes.forearm_r.push(sm);
        rig.segmentMeshes.hand_r.push(sm);
      } else if (n === 'Avatar_ArmHandL') {
        rig.segmentMeshes.forearm_l.push(sm);
        rig.segmentMeshes.hand_l.push(sm);
      } else if (n === 'Avatar_Shorts') {
        rig.segmentMeshes.pelvis.push(sm);
        rig.segmentMeshes.thigh_r.push(sm);
        rig.segmentMeshes.thigh_l.push(sm);
      } else if (n === 'Avatar_LegFootR') {
        rig.segmentMeshes.shank_r.push(sm);
        rig.segmentMeshes.foot_r.push(sm);
      } else if (n === 'Avatar_LegFootL') {
        rig.segmentMeshes.shank_l.push(sm);
        rig.segmentMeshes.foot_l.push(sm);
      } else {
        (Object.keys(rig.segmentMeshes) as SegmentGroupKey[]).forEach((k) => {
          rig.segmentMeshes[k].push(sm);
        });
      }
    } else if ((obj as THREE.Mesh).isMesh) {
      const m = obj as THREE.Mesh;
      m.castShadow = !isSoftwareRenderer;
      m.receiveShadow = !isSoftwareRenderer;
    }
  });

  rig.avatarContainer.position.set(0, 0, 0);
  rig.avatarContainer.rotation.set(0, 0, 0);
  rig.avatarContainer.scale.set(1, 1, 1);
  rig.avatarContainer.add(gltfScene);

  // Map JointKeys directly to the GLB's THREE.Bone hierarchy for exact 2D goniometric projection & prop placement
  const norm = (n: string) =>
    n
      .toLowerCase()
      .replace(/^mixamorig\d*[:_]?/, '')
      .replace(/[^a-z0-9]/g, '');
  const boneOrFallback = (...boneNames: string[]): THREE.Object3D => {
    for (const boneName of boneNames) {
      const exact = rig.bones.get(boneName);
      if (exact) return exact.bone;
      const target = norm(boneName);
      for (const [key, entry] of rig.bones) {
        const nk = norm(key);
        if (nk === target || nk.endsWith(target)) {
          rig.bones.set(boneName, entry);
          return entry.bone;
        }
      }
    }
    return gltfScene;
  };

  rig.joints = {
    pelvis: boneOrFallback('Hips'),
    l5s1: boneOrFallback('Spine'),
    t12: boneOrFallback('Spine2', 'Spine1'),
    c7: boneOrFallback('Neck'),
    head: boneOrFallback('Head'),
    shoulderR: boneOrFallback('RightArm'),
    elbowR: boneOrFallback('RightForeArm'),
    wristR: boneOrFallback('RightHand'),
    handR: boneOrFallback('RightHandMiddle1', 'RightHandIndex1', 'RightHandFingers1', 'RightHand'),
    shoulderL: boneOrFallback('LeftArm'),
    elbowL: boneOrFallback('LeftForeArm'),
    wristL: boneOrFallback('LeftHand'),
    handL: boneOrFallback('LeftHandMiddle1', 'LeftHandIndex1', 'LeftHandFingers1', 'LeftHand'),
    hipR: boneOrFallback('RightUpLeg'),
    kneeR: boneOrFallback('RightLeg'),
    ankleR: boneOrFallback('RightFoot'),
    footR: boneOrFallback('RightToeBase', 'RightFoot'),
    hipL: boneOrFallback('LeftUpLeg'),
    kneeL: boneOrFallback('LeftLeg'),
    ankleL: boneOrFallback('LeftFoot'),
    footL: boneOrFallback('LeftToeBase', 'LeftFoot'),
  };

  rig.avatarContainer.updateMatrixWorld(true);
  rig.skeletonMapped = rig.joints.pelvis !== gltfScene && rig.joints.head !== gltfScene;

  // T-pose -> pose anatómica neutra de pie (brazos verticales junto al torso)
  if (DROP_ARMS_FROM_T_POSE && rig.skeletonMapped) {
    const dropArm = (armName: string, foreName: string) => {
      const arm = rig.bones.get(armName);
      const fore = rig.bones.get(foreName);
      if (!arm || !fore || !arm.bone.parent) return;
      const a = new THREE.Vector3();
      const f = new THREE.Vector3();
      arm.bone.getWorldPosition(a);
      fore.bone.getWorldPosition(f);
      const dir = f.sub(a).normalize();
      if (dir.y < -0.75) return; // ya está colgando
      const outward = dir.x >= 0 ? 1 : -1;
      const target = new THREE.Vector3(outward * 0.04, -1, 0).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(dir, target);
      const pq = new THREE.Quaternion();
      arm.bone.parent.getWorldQuaternion(pq);
      const newLocal = pq
        .clone()
        .invert()
        .multiply(q)
        .multiply(pq)
        .multiply(arm.bone.quaternion);
      arm.bone.quaternion.copy(newLocal);
      arm.bone.updateMatrixWorld(true);
    };
    dropArm('RightArm', 'RightForeArm');
    dropArm('LeftArm', 'LeftForeArm');
    rig.avatarContainer.updateMatrixWorld(true);
  }

  // Capturar pose de reposo local y mundial de TODOS los huesos tras alinear brazos en posición neutra
  const visitedBones = new Set<BoneRestState>();
  rig.bones.forEach((entry) => {
    if (visitedBones.has(entry)) return;
    visitedBones.add(entry);
    entry.restPos.copy(entry.bone.position);
    entry.restQuat.copy(entry.bone.quaternion);
    entry.bone.getWorldQuaternion(entry.restWorldQuat);
    entry.bone.getWorldPosition(entry.restWorldPos);
  });

  rig.isReady = true;
}

function getSharedEngine(): StudioEngine3D | null {
  if (sharedEngine) return sharedEngine;
  if (engineCreationFailed) return null;

  try {
    let isSoftwareRenderer = false;
    try {
      const probeGl = document.createElement('canvas').getContext('webgl2');
      if (!probeGl) {
        isSoftwareRenderer = true;
      } else {
        const dbg = probeGl.getExtension('WEBGL_debug_renderer_info');
        const param = dbg ? dbg.UNMASKED_RENDERER_WEBGL : probeGl.RENDERER;
        const unmasked = String(probeGl.getParameter(param) || '');
        probeGl.getExtension('WEBGL_lose_context')?.loseContext();
        if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(unmasked)) {
          isSoftwareRenderer = true;
        }
      }
    } catch {
      // Ignore WebGL debug extension query failure
    }

    const offscreen = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({
      canvas: offscreen,
      antialias: !isSoftwareRenderer,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // NeutralToneMapping (three r162+) conserva mejor el color de piel y ropa que ACES.
    // Si tu versión de three es anterior, cae a NoToneMapping.
    const neutralToneMapping = (THREE as unknown as Record<string, number>).NeutralToneMapping;
    renderer.toneMapping = (neutralToneMapping ?? THREE.NoToneMapping) as THREE.ToneMapping;
    renderer.toneMappingExposure = 1.0;

    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = !isSoftwareRenderer;
    // PCFShadowMap respeta `shadow.radius` (PCFSoftShadowMap lo ignora)
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PALETTE.bgHex);

    const groundShadowMesh = configureStudioLighting(scene, renderer, isSoftwareRenderer);

    const avatarContainer = new THREE.Group();
    scene.add(avatarContainer);

    const propsRoot = new THREE.Group();
    scene.add(propsRoot);

    const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 30);
    const perspCam = new THREE.PerspectiveCamera(PERSPECTIVE_FOV_DEG, 1, 0.05, 30);

    const rig: GlbAvatarRig = {
      avatarContainer,
      propsRoot,
      groundShadowMesh,
      bones: new Map(),
      joints: createPlaceholderJoints(avatarContainer),
      skinnedMeshes: [],
      segmentMeshes: createEmptySegmentMeshMap(),
      baseMaterials: new Map(),
      groupATintMaterials: new Map(),
      groupBTintMaterials: new Map(),
      isReady: false,
      skeletonMapped: false,
    };

    sharedEngine = {
      renderer,
      scene,
      orthoCam,
      perspCam,
      rig,
      isSoftwareRenderer,
    };

    // Kick off asynchronous GLTFLoader immediately
    void ensureAvatarGlbLoaded();

    return sharedEngine;
  } catch (err) {
    console.warn('WebGL initialization failed:', err);
    engineCreationFailed = true;
    return null;
  }
}

/**
 * Ensures `/models/ergo_avatar.glb` is loaded via Three.js `GLTFLoader` and bound to the shared studio engine.
 */
export function ensureAvatarGlbLoaded(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  const engine = getSharedEngine();
  if (!engine) return Promise.resolve();
  if (engine.rig.isReady) return Promise.resolve();
  if (avatarLoadPromise) return avatarLoadPromise;

  avatarLoadPromise = new Promise<void>((resolve) => {
    const loader = new GLTFLoader();
    loader.load(
      AVATAR_GLB_URL,
      (gltf) => {
        bindLoadedGlbToRig(gltf.scene, engine);
        resolve();
        notifyAvatarLoaded();
      },
      undefined,
      (err) => {
        console.error('Failed to load anatomical GLB avatar:', err);
        avatarLoadPromise = null;
        resolve();
      },
    );
  });

  return avatarLoadPromise;
}

// ============================================================================
// WORKSTATION & LOAD PROPS (CLEAN STUDIO GEOMETRY, NO SKELETON DEBUG LINES)
// ============================================================================
function clearPropsGroup(propsRoot: THREE.Group): void {
  propsRoot.position.set(0, 0, 0);
  propsRoot.rotation.set(0, 0, 0);
  propsRoot.scale.set(1, 1, 1);
  while (propsRoot.children.length > 0) {
    const child = propsRoot.children[0];
    propsRoot.remove(child);
    child.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}

function computeBimanualBoxPlacement(
  palmR: THREE.Vector3,
  palmL: THREE.Vector3,
  defaultWidth: number,
  minCenterY: number,
): { x: number; y: number; z: number; boxW: number } {
  const spanX = Math.abs(palmL.x - palmR.x);
  const boxW = Math.max(
    0.21,
    Math.min(defaultWidth, spanX > 0.14 ? spanX - 0.018 : defaultWidth),
  );
  return {
    x: (palmR.x + palmL.x) * 0.5,
    y: Math.max(minCenterY, (palmR.y + palmL.y) * 0.5 + 0.018),
    z: (palmR.z + palmL.z) * 0.5 + 0.038,
    boxW,
  };
}

function buildSceneProp(
  rig: GlbAvatarRig,
  pose: PosturePose3D,
  isSoftwareRenderer: boolean,
): void {
  clearPropsGroup(rig.propsRoot);
  const prop = pose.prop || 'none';
  if (!prop || prop === 'none') return;

  const structMat = new THREE.MeshStandardMaterial({
    color: PALETTE.propSteelHex,
    roughness: 0.68,
    metalness: 0.08,
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.42,
    metalness: 0.28,
  });
  const elastomerMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.78,
    metalness: 0.04,
  });
  const binBlueMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.62,
    metalness: 0.1,
  });
  const loadMat = new THREE.MeshStandardMaterial({
    color: PALETTE.propLoadHex,
    roughness: 0.74,
    metalness: 0.02,
  });

  const addPropMesh = (mesh: THREE.Mesh) => {
    mesh.castShadow = !isSoftwareRenderer;
    mesh.receiveShadow = !isSoftwareRenderer;
    rig.propsRoot.add(mesh);
  };

  const handWorld = new THREE.Vector3();
  rig.joints.handR.getWorldPosition(handWorld);
  const handLWorld = new THREE.Vector3();
  rig.joints.handL.getWorldPosition(handLWorld);
  const wristRWorld = new THREE.Vector3();
  rig.joints.wristR.getWorldPosition(wristRWorld);
  const wristLWorld = new THREE.Vector3();
  rig.joints.wristL.getWorldPosition(wristLWorld);
  const elbowRWorld = new THREE.Vector3();
  rig.joints.elbowR.getWorldPosition(elbowRWorld);
  const pelvisWorld = new THREE.Vector3();
  rig.joints.pelvis.getWorldPosition(pelvisWorld);
  const footRWorld = new THREE.Vector3();
  rig.joints.footR.getWorldPosition(footRWorld);
  const footLWorld = new THREE.Vector3();
  rig.joints.footL.getWorldPosition(footLWorld);

  const palmR = new THREE.Vector3(
    (wristRWorld.x + handWorld.x) * 0.5,
    (wristRWorld.y + handWorld.y) * 0.5,
    (wristRWorld.z + handWorld.z) * 0.5,
  );
  const palmL = new THREE.Vector3(
    (wristLWorld.x + handLWorld.x) * 0.5,
    (wristLWorld.y + handLWorld.y) * 0.5,
    (wristLWorld.z + handLWorld.z) * 0.5,
  );

  const detachedPhase = pose.loadDetachedPhase || 'carried';

  switch (prop) {
    case 'chair': {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.42), structMat);
      seat.position.set(pelvisWorld.x, pelvisWorld.y - 0.08, pelvisWorld.z + 0.04);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 0.04), structMat);
      back.position.set(pelvisWorld.x, pelvisWorld.y + 0.16, pelvisWorld.z - 0.16);
      const pedH = Math.max(0.18, pelvisWorld.y - 0.1);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, pedH, 16), darkMetalMat);
      ped.position.set(pelvisWorld.x, pedH / 2, pelvisWorld.z);
      const basePlate = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 20), darkMetalMat);
      basePlate.position.set(pelvisWorld.x, 0.01, pelvisWorld.z);
      addPropMesh(seat);
      addPropMesh(back);
      addPropMesh(ped);
      addPropMesh(basePlate);
      break;
    }
    case 'bus_driver_seat': {
      // Puesto de conducción de Ómnibus / Colectivo Urbano e Interurbano (VDV 234 / ISO 16121 / Tabla 13.4):
      // 1. Butaca neumática con pétalos laterales, regulación longitudinal en rieles y base de suspensión.
      const cabX = pelvisWorld.x;
      const seatY = pelvisWorld.y - 0.085;
      const seatZ = pelvisWorld.z + 0.065;
      const seatPan = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.06, 0.45), structMat);
      seatPan.position.set(cabX, seatY, seatZ);
      seatPan.rotation.x = -4 * DEG2RAD;
      addPropMesh(seatPan);

      for (const bx of [-0.22, 0.22]) {
        const thighBolster = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.076, 0.43), darkMetalMat);
        thighBolster.position.set(cabX + bx, seatY + 0.02, seatZ);
        thighBolster.rotation.x = -4 * DEG2RAD;
        addPropMesh(thighBolster);
      }

      const backY = pelvisWorld.y + 0.205;
      const backZ = pelvisWorld.z - 0.175;
      const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.53, 0.055), structMat);
      backrest.position.set(cabX, backY, backZ);
      backrest.rotation.x = -10 * DEG2RAD;
      addPropMesh(backrest);

      for (const bx of [-0.21, 0.21]) {
        const sideBolster = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.46, 0.08), darkMetalMat);
        sideBolster.position.set(cabX + bx, backY - 0.01, backZ + 0.018);
        sideBolster.rotation.x = -10 * DEG2RAD;
        addPropMesh(sideBolster);
      }

      for (const px of [-0.065, 0.065]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.1, 10), darkMetalMat);
        post.position.set(cabX + px, pelvisWorld.y + 0.485, pelvisWorld.z - 0.222);
        post.rotation.x = -10 * DEG2RAD;
        addPropMesh(post);
      }
      const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.165, 0.065), elastomerMat);
      headrest.position.set(cabX, pelvisWorld.y + 0.56, pelvisWorld.z - 0.232);
      headrest.rotation.x = -6 * DEG2RAD;
      addPropMesh(headrest);

      const suspH = Math.max(0.14, seatY - 0.04);
      const suspPedestal = new THREE.Mesh(new THREE.BoxGeometry(0.26, suspH, 0.28), darkMetalMat);
      suspPedestal.position.set(cabX, suspH * 0.5 + 0.022, pelvisWorld.z + 0.02);
      addPropMesh(suspPedestal);

      for (const rx of [-0.155, 0.155]) {
        const slideRail = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.024, 0.48), elastomerMat);
        slideRail.position.set(cabX + rx, 0.012, pelvisWorld.z + 0.04);
        addPropMesh(slideRail);
      }

      // 2. Volante de Ómnibus / Colectivo (Ø 430 mm, aro más plano inclinado 55° respecto a la vertical = 35° sobre horizontal,
      //    situado a nivel bajo sobre el regazo/abdomen del chofer, con columna descendente al piso de cabina).
      const wheelRadius = Math.max(0.195, Math.min(0.22, Math.abs(palmL.x - palmR.x) * 0.52));
      const wheelTiltRad = 55 * DEG2RAD; // 35° respecto a la horizontal (típico de colectivo/ómnibus VDV 234)
      const hubDishDepth = 0.032;

      const wheelCenter = new THREE.Vector3(
        (palmR.x + palmL.x) * 0.5,
        Math.min(pelvisWorld.y + 0.185, (palmR.y + palmL.y) * 0.5 - 0.008),
        (palmR.z + palmL.z) * 0.5 + 0.018,
      );

      const wheelAssembly = new THREE.Group();
      wheelAssembly.position.copy(wheelCenter);
      wheelAssembly.rotation.x = wheelTiltRad;

      const wheelRim = new THREE.Mesh(
        new THREE.TorusGeometry(wheelRadius, 0.0185, 20, 56),
        elastomerMat,
      );
      wheelRim.castShadow = !isSoftwareRenderer;
      wheelRim.receiveShadow = !isSoftwareRenderer;
      wheelAssembly.add(wheelRim);

      for (const gripArcStart of [0.1, Math.PI - 0.52]) {
        const thumbBolster = new THREE.Mesh(
          new THREE.TorusGeometry(wheelRadius, 0.022, 14, 18, 0.42),
          elastomerMat,
        );
        thumbBolster.rotation.z = gripArcStart;
        thumbBolster.castShadow = !isSoftwareRenderer;
        wheelAssembly.add(thumbBolster);
      }

      const airbagPad = new THREE.Mesh(
        new THREE.CylinderGeometry(0.064, 0.056, 0.038, 24),
        darkMetalMat,
      );
      airbagPad.rotation.x = Math.PI / 2;
      airbagPad.position.set(0, 0, hubDishDepth);
      airbagPad.castShadow = !isSoftwareRenderer;
      wheelAssembly.add(airbagPad);

      const spokeSpan = Math.max(0.085, wheelRadius - 0.048);
      const dishAngle = Math.atan2(hubDishDepth, spokeSpan);
      const spokeLen = Math.hypot(spokeSpan, hubDishDepth);

      for (const sideSign of [-1, 1]) {
        const sideSpoke = new THREE.Mesh(
          new THREE.BoxGeometry(spokeLen, 0.028, 0.015),
          darkMetalMat,
        );
        sideSpoke.position.set(sideSign * (0.046 + spokeSpan * 0.5), -0.004, hubDishDepth * 0.5);
        sideSpoke.rotation.y = sideSign * dishAngle;
        sideSpoke.castShadow = !isSoftwareRenderer;
        wheelAssembly.add(sideSpoke);
      }

      for (const bottomOffset of [-0.02, 0.02]) {
        const bottomSpoke = new THREE.Mesh(
          new THREE.BoxGeometry(0.016, spokeLen, 0.015),
          darkMetalMat,
        );
        bottomSpoke.position.set(bottomOffset, -(0.046 + spokeSpan * 0.5), hubDishDepth * 0.5);
        bottomSpoke.rotation.x = -dishAngle;
        bottomSpoke.castShadow = !isSoftwareRenderer;
        wheelAssembly.add(bottomSpoke);
      }

      const columnShroud = new THREE.Mesh(
        new THREE.CylinderGeometry(0.046, 0.058, 0.14, 18),
        darkMetalMat,
      );
      columnShroud.rotation.x = Math.PI / 2;
      columnShroud.position.set(0, 0, hubDishDepth + 0.082);
      columnShroud.castShadow = !isSoftwareRenderer;
      wheelAssembly.add(columnShroud);

      for (const stalkSign of [-1, 1]) {
        const stalk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.005, 0.0065, 0.125, 10),
          elastomerMat,
        );
        stalk.rotation.z = Math.PI / 2 - stalkSign * 0.16;
        stalk.position.set(stalkSign * 0.09, 0.01, hubDishDepth + 0.065);
        wheelAssembly.add(stalk);
      }

      rig.propsRoot.add(wheelAssembly);

      // 3. Columna de dirección de colectivo anclada desde el cubo del volante hasta la caja de dirección en el piso (y = 0)
      const colFloorBase = new THREE.Vector3(
        wheelCenter.x,
        0.04,
        Math.max(wheelCenter.z + 0.24, footRWorld.z - 0.04),
      );
      const colSpanVec = colFloorBase.clone().sub(wheelCenter);
      const colLen = Math.max(0.28, colSpanVec.length() - 0.08);
      const colUnit = colSpanVec.clone().normalize();
      const steeringShaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.026, 0.032, colLen, 16),
        darkMetalMat,
      );
      steeringShaft.position.copy(wheelCenter).addScaledVector(colUnit, 0.06 + colLen * 0.5);
      steeringShaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), colUnit.clone().negate());
      addPropMesh(steeringShaft);

      const floorBoot = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.08, 16), elastomerMat);
      floorBoot.position.set(colFloorBase.x, 0.04, colFloorBase.z);
      addPropMesh(floorBoot);

      // 4. Consola/tablero bajo de colectivo (despejando completamente el campo visual frontal D: 155°-175°)
      const dashFrontZ = Math.max(colFloorBase.z + 0.12, footRWorld.z + 0.08);
      const dashBodyH = Math.max(0.36, wheelCenter.y - 0.08);
      const dashConsole = new THREE.Mesh(
        new THREE.BoxGeometry(0.66, dashBodyH, 0.22),
        structMat,
      );
      dashConsole.position.set(cabX, dashBodyH * 0.5, dashFrontZ);
      addPropMesh(dashConsole);

      const clusterPod = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.09, 0.14),
        darkMetalMat,
      );
      clusterPod.position.set(cabX, dashBodyH + 0.035, dashFrontZ - 0.05);
      clusterPod.rotation.x = -26 * DEG2RAD;
      addPropMesh(clusterPod);

      // Pedales de ómnibus (acelerador de piso articulado y pedal de freno neumático)
      const accelPad = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.015, 0.19), elastomerMat);
      accelPad.position.set(footRWorld.x, Math.max(0.042, footRWorld.y - 0.012), footRWorld.z + 0.018);
      accelPad.rotation.x = -32 * DEG2RAD;
      addPropMesh(accelPad);

      const brakePad = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.016, 0.085), elastomerMat);
      brakePad.position.set(cabX + 0.02, Math.max(0.075, footLWorld.y + 0.02), footRWorld.z + 0.01);
      brakePad.rotation.x = -34 * DEG2RAD;
      addPropMesh(brakePad);
      break;
    }
    case 'work_desk_support':
    case 'office_desk_corner_monitor':
    case 'office_desk_lateral':
    case 'high_scanner_desk': {
      // En `work_desk_support` (ej. Fig. 4.6b / 4.4b apoyo de brazo), el objeto de apoyo debe quedar
      // exactamente DEBAJO DEL CODO y antebrazo derecho (`elbowRWorld` -> `wristRWorld`) para descargar el hombro:
      const isElbowSupportBlock = prop === 'work_desk_support';
      const forearmSupportBottomY = Math.min(elbowRWorld.y, wristRWorld.y) - 0.042;
      const deskH =
        prop === 'high_scanner_desk'
          ? 0.99
          : isElbowSupportBlock
            ? Math.max(0.56, forearmSupportBottomY)
            : Math.max(0.68, handWorld.y - 0.035);
      const deskW = isElbowSupportBlock ? 0.56 : 0.78;
      const deskD = isElbowSupportBlock ? 0.50 : 0.52;
      const deskX = isElbowSupportBlock ? (elbowRWorld.x + wristRWorld.x) * 0.5 : 0;
      const deskZ = isElbowSupportBlock ? (elbowRWorld.z + wristRWorld.z) * 0.5 + 0.05 : 0.44;

      const top = new THREE.Mesh(new THREE.BoxGeometry(deskW, 0.032, deskD), structMat);
      top.position.set(deskX, deskH, deskZ);
      addPropMesh(top);

      if (isElbowSupportBlock) {
        // Almohadilla / bloque ergonómico de apoyo directamente bajo el olécranon (codo derecho) y antebrazo
        const padLenZ = Math.max(0.24, Math.min(0.40, Math.abs(wristRWorld.z - elbowRWorld.z) + 0.14));
        const elbowPad = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.018, padLenZ),
          elastomerMat,
        );
        elbowPad.position.set(
          (elbowRWorld.x + wristRWorld.x) * 0.5,
          deskH + 0.024,
          (elbowRWorld.z + wristRWorld.z) * 0.5,
        );
        addPropMesh(elbowPad);
      }

      if (prop === 'high_scanner_desk') {
        const cabinetBody = new THREE.Mesh(
          new THREE.BoxGeometry(deskW - 0.04, Math.max(0.2, deskH - 0.02), deskD - 0.04),
          binBlueMat,
        );
        cabinetBody.position.set(deskX, (deskH - 0.02) * 0.5, deskZ + 0.01);
        addPropMesh(cabinetBody);

        const scannerScreen = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.024), darkMetalMat);
        scannerScreen.position.set(deskX, deskH + 0.14, deskZ + 0.1);
        scannerScreen.rotation.x = -18 * DEG2RAD;
        addPropMesh(scannerScreen);

        // Paquete pequeño en mostrador sostenido por mano izquierda durante el escaneo
        const smallParcel = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.11, 0.16), loadMat);
        smallParcel.position.set(deskX + 0.08, deskH + 0.07, deskZ - 0.08);
        addPropMesh(smallParcel);
      } else {
        const legH = Math.max(0.2, deskH - 0.016);
        for (const [lx, lz] of [
          [deskX - deskW * 0.44, deskZ - deskD * 0.42],
          [deskX + deskW * 0.44, deskZ - deskD * 0.42],
          [deskX - deskW * 0.44, deskZ + deskD * 0.42],
          [deskX + deskW * 0.44, deskZ + deskD * 0.42],
        ]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.036, legH, 0.036), darkMetalMat);
          leg.position.set(lx, legH * 0.5, lz);
          addPropMesh(leg);
        }
        const rearCrossbar = new THREE.Mesh(new THREE.BoxGeometry(deskW - 0.08, 0.03, 0.03), darkMetalMat);
        rearCrossbar.position.set(deskX, 0.18, deskZ + deskD * 0.42);
        addPropMesh(rearCrossbar);
      }

      if (prop === 'office_desk_corner_monitor' || prop === 'office_desk_lateral') {
        const monX = prop === 'office_desk_corner_monitor' ? -0.22 : 0;
        const monZ = deskZ + 0.12;
        const monStand = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.12, 14), darkMetalMat);
        monStand.position.set(monX, deskH + 0.075, monZ);
        const monBase = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.12), darkMetalMat);
        monBase.position.set(monX, deskH + 0.02, monZ);
        const mon = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.24, 0.024), elastomerMat);
        mon.position.set(monX, deskH + 0.23, monZ);
        if (prop === 'office_desk_corner_monitor') {
          mon.rotation.y = 0.52;
        }
        addPropMesh(monStand);
        addPropMesh(monBase);
        addPropMesh(mon);
      }
      break;
    }
    case 'box_load': {
      if (detachedPhase === 'origin_rest') {
        const skid = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.42), darkMetalMat);
        skid.position.set(-0.24, 0.04, 0.36);
        addPropMesh(skid);
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.21, 0.25), loadMat);
        box.position.set(-0.24, 0.185, 0.36);
        addPropMesh(box);
      } else if (detachedPhase === 'dest_rest') {
        const tableTop = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.03, 0.42), structMat);
        tableTop.position.set(0.26, 0.86, 0.46);
        addPropMesh(tableTop);
        for (const [lx, lz] of [
          [0.03, 0.29],
          [0.49, 0.29],
          [0.03, 0.63],
          [0.49, 0.63],
        ]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.85, 10), darkMetalMat);
          leg.position.set(lx, 0.425, lz);
          addPropMesh(leg);
        }
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.21, 0.25), loadMat);
        box.position.set(0.26, 0.98, 0.46);
        addPropMesh(box);
      } else {
        const { x, y, z, boxW } = computeBimanualBoxPlacement(palmR, palmL, 0.28, 0.115);
        const box = new THREE.Mesh(new THREE.BoxGeometry(boxW, 0.21, 0.25), loadMat);
        box.position.set(x, y, z);
        box.rotation.y = (pose.rootYawDeg ?? 0) * DEG2RAD;
        addPropMesh(box);
      }
      break;
    }
    case 'pallet_cooler': {
      // Pallet industrial SIEMPRE FIJO sobre el suelo del estudio (nunca arrastrado por las manos)
      const palletZ = 0.40;
      const palletTop = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.028, 0.54), loadMat);
      palletTop.position.set(0, 0.106, palletZ);
      addPropMesh(palletTop);
      for (const sx of [-0.26, 0, 0.26]) {
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.092, 0.54), darkMetalMat);
        block.position.set(sx, 0.046, palletZ);
        addPropMesh(block);
      }

      const { x, y, z, boxW } =
        detachedPhase === 'origin_rest'
          ? { x: 0, y: 0.26, z: palletZ, boxW: 0.30 }
          : computeBimanualBoxPlacement(palmR, palmL, 0.30, 0.24);

      const coolerBody = new THREE.Mesh(new THREE.BoxGeometry(boxW, 0.25, 0.28), binBlueMat);
      coolerBody.position.set(x, y - 0.01, z);
      const coolerLid = new THREE.Mesh(new THREE.BoxGeometry(boxW + 0.014, 0.038, 0.295), darkMetalMat);
      coolerLid.position.set(x, y + 0.13, z);
      addPropMesh(coolerBody);
      addPropMesh(coolerLid);
      break;
    }
    case 'bin_to_cart': {
      // Fig. 12.3 y Muestra 8: Contenedor BIN y CARRO plataforma 100% ESTACIONARIOS en el piso (sin desplazarse con la carga)
      const binX = -0.14;
      const binZ = 0.44;
      const binW = 0.60;
      const binD = 0.50;
      const wallT = 0.026;

      const binSkid = new THREE.Mesh(new THREE.BoxGeometry(binW, 0.09, binD), darkMetalMat);
      binSkid.position.set(binX, 0.045, binZ);
      addPropMesh(binSkid);

      const binFrontWall = new THREE.Mesh(new THREE.BoxGeometry(binW, 0.56, wallT), binBlueMat);
      binFrontWall.position.set(binX, 0.09 + 0.28, binZ + binD * 0.5 - wallT * 0.5);
      addPropMesh(binFrontWall);

      const nearWallH = 0.36;
      const binNearWall = new THREE.Mesh(new THREE.BoxGeometry(binW, nearWallH, wallT), binBlueMat);
      binNearWall.position.set(binX, 0.09 + nearWallH * 0.5, binZ - binD * 0.5 + wallT * 0.5);
      addPropMesh(binNearWall);

      const binLeftWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, 0.56, binD), binBlueMat);
      binLeftWall.position.set(binX + binW * 0.5 - wallT * 0.5, 0.09 + 0.28, binZ);
      addPropMesh(binLeftWall);

      const binRightCutaway = new THREE.Mesh(new THREE.BoxGeometry(wallT, 0.2, binD), binBlueMat);
      binRightCutaway.position.set(binX - binW * 0.5 + wallT * 0.5, 0.09 + 0.1, binZ);
      addPropMesh(binRightCutaway);

      const innerParcel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.15, 0.19), loadMat);
      innerParcel.position.set(binX + 0.12, 0.165, binZ + 0.08);
      addPropMesh(innerParcel);

      // Carro plataforma receptor estacionario a un paso lateral-frontal del operador
      const cartX = 0.36;
      const cartZ = 0.52;
      const cartDeckY = 0.35;
      const cartDeck = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.44), structMat);
      cartDeck.position.set(cartX, cartDeckY, cartZ);
      addPropMesh(cartDeck);

      for (const [wx, wz] of [
        [-0.18, -0.16],
        [0.18, -0.16],
        [-0.18, 0.16],
        [0.18, 0.16],
      ]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.055, 0.032, 16),
          elastomerMat,
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(cartX + wx, 0.055, cartZ + wz);
        const fork = new THREE.Mesh(new THREE.BoxGeometry(0.04, cartDeckY - 0.11, 0.05), darkMetalMat);
        fork.position.set(cartX + wx, 0.11 + (cartDeckY - 0.11) * 0.5, cartZ + wz);
        addPropMesh(wheel);
        addPropMesh(fork);
      }

      const handlePostH = 0.56;
      for (const hx of [-0.2, 0.2]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.014, 0.014, handlePostH, 12),
          darkMetalMat,
        );
        post.position.set(cartX + hx, cartDeckY + handlePostH * 0.5, cartZ + 0.2);
        addPropMesh(post);
      }
      const crossBar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.42, 12), darkMetalMat);
      crossBar.rotation.z = Math.PI / 2;
      crossBar.position.set(cartX, cartDeckY + handlePostH, cartZ + 0.2);
      addPropMesh(crossBar);

      const cartParcel = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.20), loadMat);
      cartParcel.position.set(cartX, cartDeckY + 0.10, cartZ + 0.06);
      addPropMesh(cartParcel);

      // Bulto activo de 10 kg (en el bin al inicio, entre las manos en traslado, o sobre el carro al depositar)
      if (detachedPhase === 'origin_rest') {
        const activeParcel = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 0.22), loadMat);
        activeParcel.position.set(binX - 0.02, 0.34, binZ - 0.02);
        addPropMesh(activeParcel);
      } else if (detachedPhase === 'dest_rest') {
        const activeParcel = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 0.22), loadMat);
        activeParcel.position.set(cartX, cartDeckY + 0.11, cartZ - 0.11);
        addPropMesh(activeParcel);
      } else {
        const { x, y, z, boxW } = computeBimanualBoxPlacement(palmR, palmL, 0.26, 0.30);
        const activeParcel = new THREE.Mesh(new THREE.BoxGeometry(boxW, 0.18, 0.22), loadMat);
        activeParcel.position.set(x, y, z);
        activeParcel.rotation.y = (pose.rootYawDeg ?? 0) * DEG2RAD;
        addPropMesh(activeParcel);
      }
      break;
    }
    case 'floor_pouches': {
      // Fig. 12.5: Clasificación de bolsines de correo apoyados directamente sobre el suelo (y = 0)
      const baseZ = Math.max(0.32, (palmR.z + palmL.z) * 0.5 + 0.03);
      const mainPouch = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.09, 0.20), loadMat);
      mainPouch.position.set((palmR.x + palmL.x) * 0.5, 0.045, baseZ);
      addPropMesh(mainPouch);

      const sidePouchA = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.19), binBlueMat);
      sidePouchA.position.set(-0.22, 0.04, baseZ + 0.14);
      sidePouchA.rotation.y = 0.18;
      addPropMesh(sidePouchA);

      const sidePouchB = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.19), structMat);
      sidePouchB.position.set(0.22, 0.04, baseZ + 0.12);
      sidePouchB.rotation.y = -0.22;
      addPropMesh(sidePouchB);
      break;
    }
    case 'electrical_panel':
    case 'cold_room_high_shelf': {
      const shelfZ = 0.48;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.62, 0.22), structMat);
      cab.position.set(0, 0.81, shelfZ);
      addPropMesh(cab);
      if (prop === 'cold_room_high_shelf') {
        const { x, y, z, boxW } = computeBimanualBoxPlacement(palmR, palmL, 0.28, 1.15);
        const crate = new THREE.Mesh(new THREE.BoxGeometry(boxW, 0.20, 0.24), loadMat);
        crate.position.set(x, y, z);
        addPropMesh(crate);
      }
      break;
    }
    case 'trench_shovel': {
      // Fig. 11.2: Pala de zanjeo sujetada BIMANUALMENTE (mano derecha en empuñadura superior D, mano izquierda en cabo medio)
      const gripTop = palmR.clone();
      const gripMid = palmL.clone();
      let dirDown = gripMid.clone().sub(gripTop);
      if (dirDown.lengthSq() < 0.015) {
        dirDown.set(0.06, -0.62, 0.52);
      }
      dirDown.normalize();
      if (dirDown.y > -0.25) {
        dirDown.y = -0.55;
        dirDown.normalize();
      }

      const distToFloor = Math.max(0.55, Math.min(1.18, (gripTop.y - 0.06) / Math.max(0.28, -dirDown.y)));
      const shaftLen = Math.max(0.78, distToFloor - 0.10);

      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.016, 0.017, shaftLen, 14),
        loadMat,
      );
      shaft.position.copy(gripTop).addScaledVector(dirDown, shaftLen * 0.5);
      shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dirDown);
      addPropMesh(shaft);

      // Empuñadura superior transversal en "D" en mano derecha
      const dHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.13, 12), darkMetalMat);
      dHandle.rotation.z = Math.PI / 2;
      dHandle.position.copy(gripTop);
      addPropMesh(dHandle);

      // Hoja metálica de pala apoyada en tierra (y ≈ 0.06) + montículo de tierra excavada
      const bladeCenter = gripTop.clone().addScaledVector(dirDown, shaftLen + 0.09);
      bladeCenter.y = Math.max(0.065, bladeCenter.y);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.018), darkMetalMat);
      blade.position.copy(bladeCenter);
      blade.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dirDown);
      addPropMesh(blade);

      const soilMound = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.26, 0.08, 16), loadMat);
      soilMound.position.set(bladeCenter.x, 0.04, bladeCenter.z + 0.05);
      addPropMesh(soilMound);
      break;
    }
    case 'iron_tamper_low':
    case 'iron_tamper_high': {
      const midX = (palmR.x + palmL.x) * 0.5;
      const midY = (palmR.y + palmL.y) * 0.5;
      const midZ = (palmR.z + palmL.z) * 0.5 + 0.035;
      const barY = prop === 'iron_tamper_high' ? midY - 0.35 : midY - 0.42;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.05, 14), darkMetalMat);
      bar.position.set(midX, Math.max(0.52, barY), midZ);
      const basePlate = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.24), loadMat);
      basePlate.position.set(midX, Math.max(0.025, barY - 0.52), midZ);
      addPropMesh(bar);
      addPropMesh(basePlate);
      break;
    }
    case 'crane_levers': {
      // Fig. 11.4: Banco lateral de válvulas de hidrogrúa con 3 palancas operadas BIMANUALMENTE (mano der. e izq. activas)
      const consoleZ = Math.max(0.36, (palmR.z + palmL.z) * 0.5 + 0.11);
      const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.62, 0.26), structMat);
      consoleBox.position.set(0, 0.38, consoleZ);
      addPropMesh(consoleBox);

      const valveBank = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.09, 0.18), darkMetalMat);
      valveBank.position.set(0, 0.72, consoleZ - 0.02);
      addPropMesh(valveBank);

      const leverTargetsX = [
        Math.min(-0.09, palmR.x),
        0,
        Math.max(0.09, palmL.x),
      ];
      leverTargetsX.forEach((lx, idx) => {
        const targetGrip =
          idx === 0
            ? palmR
            : idx === 2
              ? palmL
              : new THREE.Vector3(0, (palmR.y + palmL.y) * 0.5, (palmR.z + palmL.z) * 0.5);
        const basePt = new THREE.Vector3(lx, 0.75, consoleZ - 0.03);
        const span = targetGrip.clone().sub(basePt);
        const len = Math.max(0.18, Math.min(0.32, span.length()));
        const dir = span.lengthSq() > 0.001 ? span.normalize() : new THREE.Vector3(0, 0.85, -0.5).normalize();

        const leverRod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, len, 12), darkMetalMat);
        leverRod.position.copy(basePt).addScaledVector(dir, len * 0.5);
        leverRod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        addPropMesh(leverRod);

        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.021, 14, 14), elastomerMat);
        knob.position.copy(basePt).addScaledVector(dir, len);
        addPropMesh(knob);
      });
      break;
    }
    case 'cart_push_dynamo':
    case 'cart_pull_dynamo': {
      // Carro industrial con 4 ruedas apoyadas en suelo (y = 0) y manillar bimanual acoplado al avance del operador
      const handleY = Math.max(0.84, (palmR.y + palmL.y) * 0.5);
      const handleZ = (palmR.z + palmL.z) * 0.5 + 0.04;
      const cartCenterX = (palmR.x + palmL.x) * 0.5;
      const cartZ = handleZ + 0.34;
      const deckY = 0.20;

      const deck = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.045, 0.68), structMat);
      deck.position.set(cartCenterX, deckY, cartZ);
      addPropMesh(deck);

      const cargoBox = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.38, 0.48), loadMat);
      cargoBox.position.set(cartCenterX, deckY + 0.21, cartZ + 0.04);
      addPropMesh(cargoBox);

      for (const [wx, wz] of [
        [-0.21, -0.24],
        [0.21, -0.24],
        [-0.21, 0.24],
        [0.21, 0.24],
      ]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.036, 16), elastomerMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(cartCenterX + wx, 0.065, cartZ + wz);
        const caster = new THREE.Mesh(new THREE.BoxGeometry(0.042, deckY - 0.11, 0.055), darkMetalMat);
        caster.position.set(cartCenterX + wx, 0.12 + (deckY - 0.12) * 0.5, cartZ + wz);
        addPropMesh(wheel);
        addPropMesh(caster);
      }

      const postH = Math.max(0.45, handleY - deckY);
      for (const hx of [-0.23, 0.23]) {
        const upright = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, postH, 12), darkMetalMat);
        upright.position.set(cartCenterX + hx, deckY + postH * 0.5, handleZ);
        addPropMesh(upright);
      }

      const handleBar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.50, 14), elastomerMat);
      handleBar.rotation.z = Math.PI / 2;
      handleBar.position.set(cartCenterX, handleY, handleZ);
      addPropMesh(handleBar);
      break;
    }
    case 'loading_dock_van': {
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.5), structMat);
      step.position.set(0, 0.21, 0.55);
      addPropMesh(step);
      break;
    }
    case 'conveyor_veg_line': {
      // Línea de cinta transportadora 100% FIJA en el estudio (nunca arrastrada por las manos)
      const beltY = 0.84;
      const beltZ = 0.48;
      const beltFrame = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.07, 0.46), structMat);
      beltFrame.position.set(-0.08, beltY, beltZ);
      addPropMesh(beltFrame);

      const beltSurface = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.018, 0.38), elastomerMat);
      beltSurface.position.set(-0.08, beltY + 0.042, beltZ);
      addPropMesh(beltSurface);

      for (const lx of [-0.56, 0.40]) {
        for (const lz of [beltZ - 0.18, beltZ + 0.18]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, beltY, 12), darkMetalMat);
          leg.position.set(lx, beltY * 0.5, lz);
          addPropMesh(leg);
        }
      }

      // Tarima lateral estacionaria de depósito para descenso de gavetas
      const sidePallet = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.11, 0.44), darkMetalMat);
      sidePallet.position.set(0.38, 0.055, 0.36);
      addPropMesh(sidePallet);

      const crateSide = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.14, 0.22), binBlueMat);
      crateSide.position.set(-0.38, beltY + 0.12, beltZ);
      addPropMesh(crateSide);

      if (detachedPhase === 'origin_rest') {
        const heldCrate = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.23), loadMat);
        heldCrate.position.set(-0.04, beltY + 0.13, beltZ - 0.04);
        addPropMesh(heldCrate);
      } else if (detachedPhase === 'dest_rest') {
        const heldCrate = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.23), loadMat);
        heldCrate.position.set(0.38, 0.19, 0.36);
        addPropMesh(heldCrate);
      } else {
        const { x, y, z, boxW } = computeBimanualBoxPlacement(palmR, palmL, 0.28, 0.16);
        const heldCrate = new THREE.Mesh(new THREE.BoxGeometry(boxW, 0.16, 0.23), loadMat);
        heldCrate.position.set(x, y, z);
        heldCrate.rotation.y = (pose.rootYawDeg ?? 0) * DEG2RAD;
        addPropMesh(heldCrate);
      }
      break;
    }
    case 'hopper_sack_pour': {
      // Tolva inoxidable y tarima de origen 100% ESTACIONARIAS en el suelo
      const originPallet = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.11, 0.44), darkMetalMat);
      originPallet.position.set(-0.26, 0.055, 0.36);
      addPropMesh(originPallet);

      const hopperX = 0.24;
      const hopperZ = 0.52;
      const rimY = 0.98;
      const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.13, 0.42, 20), structMat);
      funnel.position.set(hopperX, rimY - 0.21, hopperZ);
      addPropMesh(funnel);

      const hopperRim = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.018, 12, 28), darkMetalMat);
      hopperRim.rotation.x = Math.PI / 2;
      hopperRim.position.set(hopperX, rimY, hopperZ);
      addPropMesh(hopperRim);

      const lowerChute = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.56, 16), binBlueMat);
      lowerChute.position.set(hopperX, 0.28, hopperZ);
      addPropMesh(lowerChute);

      for (const [lx, lz] of [
        [hopperX - 0.23, hopperZ - 0.21],
        [hopperX + 0.23, hopperZ - 0.21],
        [hopperX - 0.23, hopperZ + 0.21],
        [hopperX + 0.23, hopperZ + 0.21],
      ]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, rimY - 0.04, 10), darkMetalMat);
        leg.position.set(lx, (rimY - 0.04) * 0.5, lz);
        addPropMesh(leg);
      }

      if (detachedPhase === 'origin_rest') {
        const sack = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.18, 0.24), loadMat);
        sack.position.set(-0.26, 0.20, 0.36);
        addPropMesh(sack);
      } else if (detachedPhase === 'dest_rest') {
        const sack = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.18, 0.24), loadMat);
        sack.position.set(hopperX, rimY + 0.06, hopperZ - 0.08);
        sack.rotation.x = 28 * DEG2RAD;
        addPropMesh(sack);
      } else {
        const { x, y, z, boxW } = computeBimanualBoxPlacement(palmR, palmL, 0.30, 0.18);
        const sack = new THREE.Mesh(new THREE.BoxGeometry(boxW, 0.18, 0.24), loadMat);
        sack.position.set(x, y, z);
        sack.rotation.y = (pose.rootYawDeg ?? 0) * DEG2RAD;
        sack.rotation.x = palmR.y > 0.88 ? 22 * DEG2RAD : 0;
        addPropMesh(sack);
      }
      break;
    }
    case 'pallet_jack_rack': {
      // Tarima de origen y estantería industrial 100% FIJAS en el piso del almacén
      const palletX = -0.26;
      const palletZ = 0.36;
      const pallet = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.12, 0.46), structMat);
      pallet.position.set(palletX, 0.06, palletZ);
      addPropMesh(pallet);

      const rackX = 0.24;
      const rackZ = 0.56;
      for (const [px, pz] of [
        [rackX - 0.34, rackZ - 0.14],
        [rackX + 0.34, rackZ - 0.14],
        [rackX - 0.34, rackZ + 0.16],
        [rackX + 0.34, rackZ + 0.16],
      ]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.032, 1.68, 0.032), darkMetalMat);
        post.position.set(px, 0.84, pz);
        addPropMesh(post);
      }
      for (const shelfY of [1.06, 1.54]) {
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.03, 0.32), binBlueMat);
        shelf.position.set(rackX, shelfY, rackZ + 0.01);
        addPropMesh(shelf);
      }

      if (detachedPhase === 'origin_rest') {
        const heldBox = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.21, 0.25), loadMat);
        heldBox.position.set(palletX, 0.225, palletZ);
        addPropMesh(heldBox);
      } else if (detachedPhase === 'dest_rest') {
        const heldBox = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.21, 0.25), loadMat);
        heldBox.position.set(rackX, 1.18, rackZ - 0.02);
        addPropMesh(heldBox);
      } else {
        const { x, y, z, boxW } = computeBimanualBoxPlacement(palmR, palmL, 0.28, 0.16);
        const heldBox = new THREE.Mesh(new THREE.BoxGeometry(boxW, 0.21, 0.25), loadMat);
        heldBox.position.set(x, y, z);
        heldBox.rotation.y = (pose.rootYawDeg ?? 0) * DEG2RAD;
        addPropMesh(heldBox);
      }
      break;
    }
  }

  // Regulación libre del objeto / mobiliario en escena (mesa de apoyo, pisón de tierra, pala, caja, silla, etc.)
  const pOffX = typeof pose.propOffsetX === 'number' && Number.isFinite(pose.propOffsetX) ? pose.propOffsetX : 0;
  const pOffY = typeof pose.propOffsetY === 'number' && Number.isFinite(pose.propOffsetY) ? pose.propOffsetY : 0;
  const pOffZ = typeof pose.propOffsetZ === 'number' && Number.isFinite(pose.propOffsetZ) ? pose.propOffsetZ : 0;
  const pRotY = typeof pose.propRotYDeg === 'number' && Number.isFinite(pose.propRotYDeg) ? pose.propRotYDeg : 0;
  const pScale =
    typeof pose.propScale === 'number' && Number.isFinite(pose.propScale)
      ? Math.max(0.45, Math.min(2.0, pose.propScale))
      : 1;

  rig.propsRoot.position.set(pOffX, pOffY, pOffZ);
  rig.propsRoot.rotation.set(0, pRotY * DEG2RAD, 0);
  rig.propsRoot.scale.set(pScale, pScale, pScale);
}

// ============================================================================
// BIOMECHANICAL JOINT ROTATION MAPPING ONTO GLB THREE.BONES (CHARACTER SPACE)
// ============================================================================
// Ejes anatómicos del avatar en reposo:
//   +X = Izquierda anatómica | -X = Derecha anatómica
//   +Y = Vertical arriba     | -Y = Vertical abajo
//   +Z = Anterior (frente)   | -Z = Posterior (espalda)
// Para cualquier rotación anatómica R_char relativa al segmento padre:
//   Q_local(B) = Q_restLocal(B) * (Q_restWorld(B)^-1 * R_char * Q_restWorld(B))
// Esto garantiza cinemática 100% invariante al roll local de cada hueso Mixamo/GLTF.
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);
const _axisZ = new THREE.Vector3(0, 0, 1);
const _qRotX = new THREE.Quaternion();
const _qRotY = new THREE.Quaternion();
const _qRotZ = new THREE.Quaternion();
const _charQuat = new THREE.Quaternion();
const _invRestWorld = new THREE.Quaternion();
const _localDelta = new THREE.Quaternion();
const _tmpWorldVec = new THREE.Vector3();

function setBoneCharRotation(
  rig: GlbAvatarRig,
  boneName: string,
  charQuat: THREE.Quaternion,
): void {
  const entry = rig.bones.get(boneName);
  if (!entry) return;
  _invRestWorld.copy(entry.restWorldQuat).invert();
  _localDelta.copy(_invRestWorld).multiply(charQuat).multiply(entry.restWorldQuat);
  entry.bone.quaternion.copy(entry.restQuat).multiply(_localDelta);
}

function makeCharEulerQuat(
  rxRad: number,
  ryRad: number,
  rzRad: number,
  order: 'XYZ' | 'YXZ' | 'ZXY' | 'ZYX' = 'YXZ',
): THREE.Quaternion {
  _qRotX.setFromAxisAngle(_axisX, rxRad);
  _qRotY.setFromAxisAngle(_axisY, ryRad);
  _qRotZ.setFromAxisAngle(_axisZ, rzRad);
  _charQuat.identity();
  if (order === 'YXZ') {
    _charQuat.multiply(_qRotY).multiply(_qRotX).multiply(_qRotZ);
  } else if (order === 'ZXY') {
    _charQuat.multiply(_qRotZ).multiply(_qRotX).multiply(_qRotY);
  } else if (order === 'ZYX') {
    _charQuat.multiply(_qRotZ).multiply(_qRotY).multiply(_qRotX);
  } else {
    _charQuat.multiply(_qRotX).multiply(_qRotY).multiply(_qRotZ);
  }
  return _charQuat;
}

function resetAllBonesToRest(rig: GlbAvatarRig): void {
  rig.avatarContainer.position.set(0, 0, 0);
  rig.avatarContainer.rotation.set(0, 0, 0);
  const visited = new Set<BoneRestState>();
  rig.bones.forEach((entry) => {
    if (visited.has(entry)) return;
    visited.add(entry);
    entry.bone.position.copy(entry.restPos);
    entry.bone.quaternion.copy(entry.restQuat);
  });
}

function curlHandFingers(
  rig: GlbAvatarRig,
  side: 'Right' | 'Left',
  curlProxRad: number,
  curlMidRad: number,
  thumbCurlRad: number,
): void {
  const sign = side === 'Right' ? 1 : -1;
  const fingers = ['Index', 'Middle', 'Ring', 'Pinky'];
  for (const fg of fingers) {
    setBoneCharRotation(rig, `${side}Hand${fg}1`, makeCharEulerQuat(0, 0, sign * curlProxRad, 'XYZ'));
    setBoneCharRotation(rig, `${side}Hand${fg}2`, makeCharEulerQuat(0, 0, sign * curlMidRad, 'XYZ'));
    setBoneCharRotation(rig, `${side}Hand${fg}3`, makeCharEulerQuat(0, 0, sign * curlMidRad * 0.65, 'XYZ'));
  }
  setBoneCharRotation(
    rig,
    `${side}HandThumb1`,
    makeCharEulerQuat(thumbCurlRad * 0.55, 0, sign * thumbCurlRad * 0.75, 'ZXY'),
  );
  setBoneCharRotation(
    rig,
    `${side}HandThumb2`,
    makeCharEulerQuat(thumbCurlRad * 0.45, 0, sign * thumbCurlRad * 0.65, 'ZXY'),
  );
}

function applyPoseToGlbBones(
  engine: StudioEngine3D,
  panel: Panel3DSpec,
): void {
  const { rig, isSoftwareRenderer } = engine;
  if (!rig.isReady) return;

  const { pose, focusZone, cameraPreset } = panel;
  resetAllBonesToRest(rig);

  const rest = (value: number, fallback: number): number =>
    NATURAL_REST_POSE && Math.abs(value) < 0.01 ? fallback : value;

  let shRFlexDeg = pose.shoulderRFlexionDeg;
  let shLFlexDeg = pose.shoulderLFlexionDeg;
  const shRAbdDeg = rest(pose.shoulderRAbductionDeg, REST_SHOULDER_ABDUCTION_DEG);
  const shLAbdDeg = rest(pose.shoulderLAbductionDeg, REST_SHOULDER_ABDUCTION_DEG);
  let elbRFlexDeg = rest(pose.elbowRFlexionDeg, REST_ELBOW_FLEXION_DEG);
  let elbLFlexDeg = rest(pose.elbowLFlexionDeg, REST_ELBOW_FLEXION_DEG);

  // En postura sentada con brazos en neutro por defecto, apoyar manos naturalmente sobre muslos
  if (pose.stanceMode === 'seated') {
    if (Math.abs(shRFlexDeg) <= 6 && elbRFlexDeg <= 16) {
      shRFlexDeg = 22;
      elbRFlexDeg = 54;
    }
    if (Math.abs(shLFlexDeg) <= 6 && elbLFlexDeg <= 16) {
      shLFlexDeg = 22;
      elbLFlexDeg = 54;
    }
  }

  // En primer plano de muñeca/mano, proyectar levemente el húmero hacia adelante conservando
  // exactamente el ángulo horizontal del antebrazo para evitar oclusión con el torso o casco
  if (focusZone === 'wrist_hand' && shRFlexDeg < 26 && elbRFlexDeg >= 65) {
    const deltaAdvance = 28 - shRFlexDeg;
    shRFlexDeg += deltaAdvance;
    elbRFlexDeg = Math.max(25, elbRFlexDeg - deltaAdvance);
  }

  const isStanding = pose.stanceMode !== 'seated' && pose.stanceMode !== 'kneeling';
  const legsAtRest =
    Math.abs(pose.hipRFlexionDeg) < 0.01 &&
    Math.abs(pose.hipLFlexionDeg) < 0.01 &&
    Math.abs(pose.kneeRFlexionDeg) < 0.01 &&
    Math.abs(pose.kneeLFlexionDeg) < 0.01;
  const stepLegs = NATURAL_REST_POSE && isStanding && legsAtRest;
  let hipRDeg = stepLegs ? -3 : pose.hipRFlexionDeg;
  let hipLDeg = stepLegs ? 6 : pose.hipLFlexionDeg;
  const kneeRDeg = pose.kneeRFlexionDeg;
  const kneeLDeg = stepLegs ? 4 : pose.kneeLFlexionDeg;
  let ankleRDeg = pose.ankleRDorsiflexionDeg;
  let ankleLDeg = pose.ankleLDorsiflexionDeg;

  // En postura arrodillada (`kneeling`), garantizar que la tibia apoyada quede horizontal (paralela al suelo y = 0)
  // y el empeine en flexión plantar para que las rodillas descansen físicamente sobre el suelo sin flotar en el aire.
  if (pose.stanceMode === 'kneeling') {
    if (hipRDeg < 45 && kneeRDeg >= 70) {
      if (kneeRDeg - hipRDeg < 89) hipRDeg = kneeRDeg - 90;
      ankleRDeg = Math.min(ankleRDeg, -36);
    }
    if (hipLDeg < 45 && kneeLDeg >= 70) {
      if (kneeLDeg - hipLDeg < 89) hipLDeg = kneeLDeg - 90;
      ankleLDeg = Math.min(ankleLDeg, -36);
    }
  } else if (
    isStanding &&
    pose.stanceMode !== 'walking' &&
    focusZone !== 'ankle_foot'
  ) {
    // Equilibrio plantígrado automático: evita que el avatar quede parado sobre sus talones o puntas
    // cuando la relación cadera-rodilla cambia sin haberse calibrado manualmente la dorsiflexión del tobillo.
    if (Math.abs(pose.ankleRDorsiflexionDeg) < 0.5) {
      ankleRDeg = Math.max(-24, Math.min(34, kneeRDeg - hipRDeg));
    }
    if (Math.abs(pose.ankleLDorsiflexionDeg) < 0.5) {
      ankleLDeg = Math.max(-24, Math.min(34, kneeLDeg - hipLDeg));
    }
  }

  // 1. Ritmo Lumbo-Pélvico:
  // - En levantamiento higiénico en cuclillas (rodillas flexionadas >= 55° y tronco <= 32°),
  //   la inclinación ocurre casi íntegramente por bisagra coxofemoral (80%) manteniendo la ESPALDA RECTA sin cifosis.
  // - En flexión de tronco con piernas extendidas (stoop), se distribuye entre pelvis (38%) y curvatura vertebral.
  const isHygienicStraightBackSquat =
    pose.stanceMode !== 'seated' &&
    Math.max(kneeRDeg, kneeLDeg) >= 55 &&
    pose.trunkFlexionDeg >= 0 &&
    pose.trunkFlexionDeg <= 32;

  const pelvicTiltDeg =
    pose.stanceMode === 'seated'
      ? 0
      : isHygienicStraightBackSquat
        ? pose.trunkFlexionDeg * 0.80
        : pose.trunkFlexionDeg > 0
          ? pose.trunkFlexionDeg * 0.38
          : pose.trunkFlexionDeg * 0.18;
  const pelvicTwistDeg = pose.stanceMode === 'seated' ? 0 : pose.trunkTwistDeg * 0.22;

  setBoneCharRotation(
    rig,
    'Hips',
    makeCharEulerQuat(pelvicTiltDeg * DEG2RAD, -pelvicTwistDeg * DEG2RAD, 0, 'YXZ'),
  );

  const spinalCurveDeg = isHygienicStraightBackSquat
    ? pose.trunkFlexionDeg * 0.26
    : pose.trunkFlexionDeg * 1.24 - pelvicTiltDeg;
  const trunkFlex = spinalCurveDeg * DEG2RAD;
  const trunkLat = pose.trunkLateralDeg * DEG2RAD;
  const trunkTwist = (pose.trunkTwistDeg - pelvicTwistDeg) * DEG2RAD;
  const hasSpine2 = rig.bones.has('Spine2');

  if (hasSpine2) {
    setBoneCharRotation(rig, 'Spine', makeCharEulerQuat(trunkFlex * 0.42, -trunkTwist * 0.34, trunkLat * 0.40, 'YXZ'));
    setBoneCharRotation(rig, 'Spine1', makeCharEulerQuat(trunkFlex * 0.33, -trunkTwist * 0.33, trunkLat * 0.33, 'YXZ'));
    setBoneCharRotation(rig, 'Spine2', makeCharEulerQuat(trunkFlex * 0.25, -trunkTwist * 0.33, trunkLat * 0.27, 'YXZ'));
  } else {
    setBoneCharRotation(rig, 'Spine', makeCharEulerQuat(trunkFlex * 0.56, -trunkTwist * 0.48, trunkLat * 0.55, 'YXZ'));
    setBoneCharRotation(rig, 'Spine1', makeCharEulerQuat(trunkFlex * 0.44, -trunkTwist * 0.52, trunkLat * 0.45, 'YXZ'));
  }

  // 2. Columna Cervical y Cabeza (Neck + Head)
  const neckFlex = pose.neckFlexionDeg * DEG2RAD;
  const neckLat = pose.neckLateralDeg * DEG2RAD;
  const neckTwist = pose.neckTwistDeg * DEG2RAD;

  setBoneCharRotation(rig, 'Neck', makeCharEulerQuat(neckFlex * 0.68, -neckTwist * 0.60, neckLat * 0.65, 'YXZ'));
  setBoneCharRotation(rig, 'Head', makeCharEulerQuat(neckFlex * 0.32, -neckTwist * 0.40, neckLat * 0.35, 'YXZ'));

  // 3. Cintura Escapular y Hombros (RightShoulder/LeftShoulder + RightArm/LeftArm)
  // Compensar el exceso de inclinación de `Spine2` respecto a la cuerda L5/S1->C7 (`pose.trunkFlexionDeg`)
  // para que `shoulderRFlexionDeg` y `shoulderLFlexionDeg` representen con exactitud el ángulo respecto al tronco:
  const spine2WorldPitchDeg = pelvicTiltDeg + spinalCurveDeg;
  const spineExcessOverChordDeg = spine2WorldPitchDeg - pose.trunkFlexionDeg;
  const compensatedShRFlexDeg = shRFlexDeg + spineExcessOverChordDeg;
  const compensatedShLFlexDeg = shLFlexDeg + spineExcessOverChordDeg;

  const elevClavR =
    (pose.shoulderRElevated ? 14 * DEG2RAD : 0) +
    Math.max(0, Math.max(shRFlexDeg, shRAbdDeg) - 60) * 0.22 * DEG2RAD;
  const elevClavL = Math.max(0, Math.max(shLFlexDeg, shLAbdDeg) - 60) * 0.22 * DEG2RAD;

  setBoneCharRotation(rig, 'RightShoulder', makeCharEulerQuat(0, 0, -elevClavR, 'XYZ'));
  setBoneCharRotation(rig, 'LeftShoulder', makeCharEulerQuat(0, 0, elevClavL, 'XYZ'));

  const explicitHumRotR =
    typeof pose.shoulderRRotationDeg === 'number' && Number.isFinite(pose.shoulderRRotationDeg)
      ? -pose.shoulderRRotationDeg * DEG2RAD
      : null;
  const explicitHumRotL =
    typeof pose.shoulderLRotationDeg === 'number' && Number.isFinite(pose.shoulderLRotationDeg)
      ? pose.shoulderLRotationDeg * DEG2RAD
      : 0;

  const intRotR =
    explicitHumRotR !== null
      ? explicitHumRotR
      : pose.forearmRCrossMidline
        ? 42 * DEG2RAD
        : shRAbdDeg > 28 && elbRFlexDeg > 55
          ? -18 * DEG2RAD
          : 0;

  setBoneCharRotation(
    rig,
    'RightArm',
    makeCharEulerQuat(-compensatedShRFlexDeg * DEG2RAD, intRotR, -shRAbdDeg * DEG2RAD, 'ZXY'),
  );
  setBoneCharRotation(
    rig,
    'LeftArm',
    makeCharEulerQuat(-compensatedShLFlexDeg * DEG2RAD, explicitHumRotL, shLAbdDeg * DEG2RAD, 'ZXY'),
  );

  // 4. Codos y Pronosupinación de Antebrazo (RightForeArm / LeftForeArm)
  const autoPalmDownWristView =
    focusZone === 'wrist_hand' &&
    Math.abs(pose.forearmRPronationDeg) < 1 &&
    (cameraPreset === 'sagittal_right' || cameraPreset === 'sagittal_left' || cameraPreset === 'top');

  const isBimanualBoxLikeProp =
    pose.prop === 'box_load' ||
    pose.prop === 'bin_to_cart' ||
    pose.prop === 'pallet_cooler' ||
    pose.prop === 'conveyor_veg_line' ||
    pose.prop === 'hopper_sack_pour' ||
    pose.prop === 'pallet_jack_rack' ||
    pose.prop === 'cold_room_high_shelf';

  // En el sistema del avatar con brazos descendidos desde T-pose:
  // +ry rota la palma hacia abajo (pronación), mientras que -ry (-18°) supina ligeramente
  // orientando las palmas medialmente y hacia arriba para acunar lateralmente cajas sin torsiones imposibles.
  const effectivePronoRDeg = autoPalmDownWristView
    ? 88
    : isBimanualBoxLikeProp && Math.abs(pose.forearmRPronationDeg) < 1
      ? -18
      : pose.prop === 'bus_driver_seat' && Math.abs(pose.forearmRPronationDeg) < 1
        ? 34
        : pose.forearmRPronationDeg;

  const isSymmetricForearmProp =
    isBimanualBoxLikeProp ||
    pose.prop === 'bus_driver_seat' ||
    pose.prop === 'crane_levers' ||
    pose.prop === 'trench_shovel' ||
    pose.prop === 'iron_tamper_low' ||
    pose.prop === 'iron_tamper_high' ||
    pose.prop === 'cart_push_dynamo' ||
    pose.prop === 'cart_pull_dynamo' ||
    pose.prop === 'office_desk_lateral' ||
    pose.prop === 'work_desk_support';

  const effectivePronoLDeg =
    pose.forearmLPronationDeg !== undefined
      ? pose.forearmLPronationDeg
      : isSymmetricForearmProp
        ? -effectivePronoRDeg
        : 0;

  setBoneCharRotation(
    rig,
    'RightForeArm',
    makeCharEulerQuat(-elbRFlexDeg * DEG2RAD, effectivePronoRDeg * DEG2RAD, 0, 'XYZ'),
  );
  setBoneCharRotation(
    rig,
    'LeftForeArm',
    makeCharEulerQuat(-elbLFlexDeg * DEG2RAD, effectivePronoLDeg * DEG2RAD, 0, 'XYZ'),
  );

  // 5. Muñeca: Flexión/Extensión Palmar-Dorsal y Desviación Radial/Cubital (RightHand / LeftHand)
  const effectiveWristLDevDeg =
    pose.wristLDeviationDeg !== undefined
      ? pose.wristLDeviationDeg
      : isSymmetricForearmProp
        ? -pose.wristRDeviationDeg
        : 0;

  setBoneCharRotation(
    rig,
    'RightHand',
    makeCharEulerQuat(
      pose.wristRDeviationDeg * DEG2RAD,
      0,
      pose.wristRFlexionDeg * DEG2RAD,
      'ZXY',
    ),
  );
  setBoneCharRotation(
    rig,
    'LeftHand',
    makeCharEulerQuat(
      effectiveWristLDevDeg * DEG2RAD,
      0,
      -(pose.wristLFlexionDeg ?? 0) * DEG2RAD,
      'ZXY',
    ),
  );

  // 6. Dedos de la Mano (Thumb + Index, Middle, Ring, Pinky)
  const gripMode =
    pose.handGripMode ||
    (isBimanualBoxLikeProp
      ? 'box_cradle'
      : pose.prop && propUsesGrip(pose.prop)
        ? 'power_grip'
        : 'relaxed');

  if (focusZone === 'wrist_hand' && !pose.handGripMode) {
    curlHandFingers(rig, 'Right', 0.08, 0.06, 0.10);
    curlHandFingers(rig, 'Left', 0.16, 0.14, 0.16);
  } else if (gripMode === 'pinch') {
    curlHandFingers(rig, 'Right', 0.55, 0.65, 0.52);
    curlHandFingers(rig, 'Left', 0.18, 0.16, 0.18);
  } else if (gripMode === 'box_cradle') {
    // Acople palmar-lateral abierto anatómico sobre las caras exteriores de cajas/bultos (sin cerrar el puño dentro del volumen)
    curlHandFingers(rig, 'Right', 0.24, 0.28, 0.26);
    curlHandFingers(rig, 'Left', 0.24, 0.28, 0.26);
  } else if (gripMode === 'power_grip') {
    curlHandFingers(rig, 'Right', 0.78, 0.88, 0.54);
    curlHandFingers(rig, 'Left', 0.78, 0.88, 0.54);
  } else {
    curlHandFingers(rig, 'Right', 0.18, 0.16, 0.18);
    curlHandFingers(rig, 'Left', 0.18, 0.16, 0.18);
  }

  // 7. Miembros Inferiores: Caderas, Rodillas y Tobillos
  // En cuclillas profundas, ligera abducción fisiológica de caderas (~9°) para abrir espacio entre rodillas a los brazos/carga:
  const squatHipAbdRDeg =
    pose.stanceMode === 'seated' || pose.stanceMode === 'kneeling'
      ? 0
      : Math.min(10, Math.max(0, (kneeRDeg - 48) * 0.13));
  const squatHipAbdLDeg =
    pose.stanceMode === 'seated' || pose.stanceMode === 'kneeling'
      ? 0
      : Math.min(10, Math.max(0, (kneeLDeg - 48) * 0.13));

  const localHipRDeg = hipRDeg + pelvicTiltDeg;
  const localHipLDeg = hipLDeg + pelvicTiltDeg;
  setBoneCharRotation(
    rig,
    'RightUpLeg',
    makeCharEulerQuat(-localHipRDeg * DEG2RAD, 0, -squatHipAbdRDeg * DEG2RAD, 'ZXY'),
  );
  setBoneCharRotation(rig, 'RightLeg', makeCharEulerQuat(kneeRDeg * DEG2RAD, 0, 0, 'XYZ'));
  setBoneCharRotation(rig, 'RightFoot', makeCharEulerQuat(-ankleRDeg * DEG2RAD, 0, 0, 'XYZ'));

  setBoneCharRotation(
    rig,
    'LeftUpLeg',
    makeCharEulerQuat(-localHipLDeg * DEG2RAD, 0, squatHipAbdLDeg * DEG2RAD, 'ZXY'),
  );
  setBoneCharRotation(rig, 'LeftLeg', makeCharEulerQuat(kneeLDeg * DEG2RAD, 0, 0, 'XYZ'));
  setBoneCharRotation(rig, 'LeftFoot', makeCharEulerQuat(-ankleLDeg * DEG2RAD, 0, 0, 'XYZ'));

  // 8. Desplazamiento/Giro Espacial en Estudio y Apoyo Podal / de Rodillas sobre el Suelo (y = 0)
  rig.avatarContainer.rotation.set(0, (pose.rootYawDeg ?? 0) * DEG2RAD, 0);
  rig.avatarContainer.position.set(pose.rootOffsetX ?? 0, 0, pose.rootOffsetZ ?? 0);
  rig.avatarContainer.updateMatrixWorld(true);

  const groundCandidates: THREE.Object3D[] = [
    rig.joints.ankleR,
    rig.joints.footR,
    rig.joints.ankleL,
    rig.joints.footL,
  ];
  if (pose.stanceMode === 'kneeling') {
    groundCandidates.push(rig.joints.kneeR, rig.joints.kneeL);
  }
  let minJointY = Infinity;
  for (const obj of groundCandidates) {
    obj.getWorldPosition(_tmpWorldVec);
    if (_tmpWorldVec.y < minJointY) minJointY = _tmpWorldVec.y;
  }
  if (Number.isFinite(minJointY)) {
    const desiredSoleClearanceY = pose.stanceMode === 'kneeling' ? 0.026 : 0.022;
    rig.avatarContainer.position.y = desiredSoleClearanceY - minJointY;
  }
  rig.avatarContainer.updateMatrixWorld(true);

  // 9. Visibilidad por Segmento y Materiales PBR Limpios
  const activeSegments = new Set<SegmentGroupKey>(FOCUS_ZONE_SEGMENTS[focusZone]);
  const visibleMeshSet = new Set<THREE.SkinnedMesh>();
  (Object.keys(rig.segmentMeshes) as SegmentGroupKey[]).forEach((segKey) => {
    if (activeSegments.has(segKey)) {
      for (const sm of rig.segmentMeshes[segKey]) {
        visibleMeshSet.add(sm);
      }
    }
  });

  const hasSegmentedAvatarMeshes = rig.skinnedMeshes.some((m) => m.name.startsWith('Avatar_'));
  const isRulaGroups = pose.highlightGroup === 'rula_groups' && hasSegmentedAvatarMeshes;
  for (const sm of rig.skinnedMeshes) {
    sm.visible = visibleMeshSet.has(sm);
    if (!sm.visible) continue;

    if (isRulaGroups) {
      const isGroupA =
        sm.name === 'Avatar_TshirtSleeveR' ||
        sm.name === 'Avatar_ArmHandR' ||
        sm.name === 'Avatar_TshirtSleeveL' ||
        sm.name === 'Avatar_ArmHandL';
      sm.material =
        (isGroupA ? rig.groupATintMaterials.get(sm) : rig.groupBTintMaterials.get(sm)) ||
        rig.baseMaterials.get(sm)!;
    } else {
      sm.material = rig.baseMaterials.get(sm)!;
    }

    sm.skeleton.update();
  }

  rig.groundShadowMesh.visible =
    focusZone !== 'wrist_hand' && focusZone !== 'neck_cervical';

  buildSceneProp(rig, pose, isSoftwareRenderer);
  rig.propsRoot.updateMatrixWorld(true);
}

function propUsesGrip(prop: ScenePropType): boolean {
  return (
    prop !== 'none' &&
    prop !== 'chair' &&
    prop !== 'work_desk_support' &&
    prop !== 'office_desk_corner_monitor' &&
    prop !== 'office_desk_lateral' &&
    prop !== 'high_scanner_desk'
  );
}

// ============================================================================
// CAMERA FRAMING & POSED SKELETAL BOUNDS
// ============================================================================
function computeVisibleFocusBounds(
  rig: GlbAvatarRig,
  focusZone: FocusZone,
): { center: THREE.Vector3; halfExtent: number } {
  if (!rig.isReady) {
    return { center: new THREE.Vector3(0, 0.92, 0), halfExtent: 0.96 };
  }

  if (focusZone === 'full_body' || !rig.skeletonMapped) {
    const meshBox = new THREE.Box3();
    for (const sm of rig.skinnedMeshes) {
      if (!sm.visible) continue;
      sm.computeBoundingBox();
      if (sm.boundingBox) {
        meshBox.union(sm.boundingBox.clone().applyMatrix4(sm.matrixWorld));
      }
    }
    if (rig.propsRoot.children.length > 0) {
      const propBox = new THREE.Box3().setFromObject(rig.propsRoot);
      if (!propBox.isEmpty()) meshBox.union(propBox);
    }
    if (!meshBox.isEmpty()) {
      meshBox.min.y = Math.min(meshBox.min.y, 0);
      const c = new THREE.Vector3();
      const sz = new THREE.Vector3();
      meshBox.getCenter(c);
      meshBox.getSize(sz);
      return { center: c, halfExtent: Math.max(0.6, Math.max(sz.x, sz.y, sz.z) * 0.54) };
    }
  }

  const box = new THREE.Box3();
  const jointList = FOCUS_ZONE_JOINTS[focusZone] || FOCUS_ZONE_JOINTS.full_body;
  const pt = new THREE.Vector3();

  const padRadius =
    focusZone === 'wrist_hand'
      ? 0.09
      : focusZone === 'ankle_foot'
        ? 0.12
        : focusZone === 'neck_cervical'
          ? 0.18
          : 0.18;

  for (const jk of jointList) {
    const jObj = rig.joints[jk];
    if (!jObj) continue;
    jObj.getWorldPosition(pt);
    box.expandByPoint(new THREE.Vector3(pt.x - padRadius, pt.y - padRadius * 0.6, pt.z - padRadius));
    const topExtra = jk === 'head' ? 0.20 : padRadius;
    box.expandByPoint(new THREE.Vector3(pt.x + padRadius, pt.y + topExtra, pt.z + padRadius));
  }

  if (focusZone === 'full_body' && rig.propsRoot.children.length > 0) {
    const propBox = new THREE.Box3().setFromObject(rig.propsRoot);
    if (!propBox.isEmpty()) box.union(propBox);
  }

  if (focusZone === 'full_body' || focusZone === 'legs_knees') {
    box.min.y = Math.min(box.min.y, 0);
  }

  if (box.isEmpty()) {
    return { center: new THREE.Vector3(0, 0.92, 0), halfExtent: 0.95 };
  }

  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = new THREE.Vector3();
  box.getSize(size);

  if (focusZone === 'wrist_hand') {
    rig.joints.wristR.getWorldPosition(pt);
    center.lerp(pt, 0.45);
    return { center, halfExtent: Math.max(0.18, Math.max(size.x, size.y, size.z) * 0.56) };
  }
  if (focusZone === 'ankle_foot') {
    rig.joints.ankleR.getWorldPosition(pt);
    center.lerp(pt, 0.35);
    return { center, halfExtent: Math.max(0.21, Math.max(size.x, size.y, size.z) * 0.56) };
  }
  if (focusZone === 'elbow_forearm') {
    rig.joints.elbowR.getWorldPosition(pt);
    center.lerp(pt, 0.42);
    return { center, halfExtent: Math.max(0.36, Math.max(size.x, size.y, size.z) * 0.34) };
  }
  if (focusZone === 'shoulder_arm') {
    rig.joints.shoulderR.getWorldPosition(pt);
    center.lerp(pt, 0.40);
    return { center, halfExtent: Math.max(0.42, Math.max(size.x, size.y, size.z) * 0.38) };
  }
  if (focusZone === 'neck_cervical') {
    rig.joints.c7.getWorldPosition(pt);
    center.lerp(pt, 0.45);
    return { center, halfExtent: Math.max(0.30, Math.max(size.x, size.y, size.z) * 0.54) };
  }
  if (focusZone === 'lumbar_l5s1') {
    rig.joints.l5s1.getWorldPosition(pt);
    center.lerp(pt, 0.42);
    return { center, halfExtent: Math.max(0.38, Math.max(size.x, size.y, size.z) * 0.48) };
  }

  const maxDim = Math.max(size.x, size.y, size.z);
  return { center, halfExtent: Math.max(0.35, maxDim * 0.54) };
}

function configureCameraForPanel(
  engine: StudioEngine3D,
  preset: CameraPreset,
  center: THREE.Vector3,
  halfExtent: number,
  aspect: number,
  orbit: CameraOrbitOverride,
): THREE.Camera {
  const zoom = Math.max(0.35, orbit.zoom);
  const dist = Math.max(1.8, halfExtent * 3.5) / zoom;

  let baseAzimuthDeg = -90;
  let baseElevationDeg = 0;

  switch (preset) {
    case 'sagittal_right':
      baseAzimuthDeg = -90;
      baseElevationDeg = 0;
      break;
    case 'sagittal_left':
      baseAzimuthDeg = 90;
      baseElevationDeg = 0;
      break;
    case 'frontal':
      baseAzimuthDeg = 0;
      baseElevationDeg = 3;
      break;
    case 'dorsal':
      baseAzimuthDeg = 180;
      baseElevationDeg = 4;
      break;
    case 'top':
      baseAzimuthDeg = -90;
      baseElevationDeg = 82;
      break;
    case 'isometric':
      baseAzimuthDeg = -46;
      baseElevationDeg = 18;
      break;
    case 'perspective_oblique':
      baseAzimuthDeg = -34;
      baseElevationDeg = 24;
      break;
  }

  const az = (baseAzimuthDeg + orbit.azimuthDeg) * DEG2RAD;
  const el = Math.max(-85, Math.min(86, baseElevationDeg + orbit.elevationDeg)) * DEG2RAD;

  const camOffset = new THREE.Vector3(
    dist * Math.cos(el) * Math.sin(az),
    dist * Math.sin(el),
    dist * Math.cos(el) * Math.cos(az),
  );

  const paddedHalf = (halfExtent * 1.16) / zoom;

  // Vistas "fotográficas": perspectiva con distancia calculada para que el encuadre
  // (cuadrado de lado 2*paddedHalf) entre completo sin importar el aspecto del panel.
  if (PERSPECTIVE_PRESETS.includes(preset)) {
    const cam = engine.perspCam;
    cam.fov = PERSPECTIVE_FOV_DEG;
    cam.aspect = aspect;
    const tanHalfFov = Math.tan((cam.fov * DEG2RAD) / 2);
    const fitDist = paddedHalf / (tanHalfFov * Math.min(1, aspect));
    const dir = camOffset.clone().normalize();
    cam.position.copy(center).addScaledVector(dir, fitDist);
    cam.up.set(0, 1, 0);
    cam.lookAt(center);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    return cam;
  }

  // Vistas de medición (sagitales / superior): ortográfica, sin distorsión de ángulos.
  const camPos = center.clone().add(camOffset);
  const cam = engine.orthoCam;
  if (aspect >= 1) {
    cam.top = paddedHalf;
    cam.bottom = -paddedHalf;
    cam.left = -paddedHalf * aspect;
    cam.right = paddedHalf * aspect;
  } else {
    cam.left = -paddedHalf;
    cam.right = paddedHalf;
    cam.top = paddedHalf / aspect;
    cam.bottom = -paddedHalf / aspect;
  }
  cam.position.copy(camPos);
  cam.up.set(0, 1, 0);
  cam.lookAt(center);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  return cam;
}

function projectJoints2D(
  rig: GlbAvatarRig,
  camera: THREE.Camera,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): Record<JointKey, { x: number; y: number }> {
  const out = {} as Record<JointKey, { x: number; y: number }>;
  const v = new THREE.Vector3();
  (Object.keys(rig.joints) as JointKey[]).forEach((k) => {
    rig.joints[k].getWorldPosition(v);
    v.project(camera);
    out[k] = {
      x: rx + (v.x + 1) * 0.5 * rw,
      y: ry + (-v.y + 1) * 0.5 * rh,
    };
  });
  return out;
}

// ============================================================================
// NON-OVERLAPPING 2D GONIOMETRIC / FORCE / DIMENSION CANVAS OVERLAYS
// ============================================================================
function normalizeAngleDiff(startRad: number, endRad: number): number {
  let diff = endRad - startRad;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const safeMax = Math.max(24, maxWidth);
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  const splitToken = (tok: string): string[] => {
    if (ctx.measureText(tok).width <= safeMax) return [tok];
    const parts: string[] = [];
    let cur = '';
    for (const ch of tok) {
      if (cur && ctx.measureText(cur + ch).width > safeMax) {
        parts.push(cur);
        cur = ch;
      } else {
        cur += ch;
      }
    }
    if (cur) parts.push(cur);
    return parts;
  };

  for (const para of paragraphs) {
    const rawWords = para.trim().split(/\s+/).filter(Boolean);
    if (rawWords.length === 0) continue;
    const words: string[] = [];
    for (const w of rawWords) words.push(...splitToken(w));

    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${current} ${words[i]}`;
      if (ctx.measureText(candidate).width <= safeMax) {
        current = candidate;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
  }
  return lines;
}

interface OverlayBoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function computeBoxOverlapArea(a: OverlayBoxRect, b: OverlayBoxRect, pad = 6): number {
  const ox = Math.min(a.x + a.w + pad, b.x + b.w) - Math.max(a.x - pad, b.x);
  const oy = Math.min(a.y + a.h + pad, b.y + b.h) - Math.max(a.y - pad, b.y);
  if (ox <= 0 || oy <= 0) return 0;
  return ox * oy;
}

function drawWhiteBackedTag(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  borderColor: string,
  textColor: string,
  bounds: { x: number; y: number; w: number; h: number },
  font = '700 12px "IBM Plex Mono", monospace',
  placedBoxes?: OverlayBoxRect[],
  anchorPoint?: { x: number; y: number },
): void {
  ctx.save();
  ctx.font = font;
  const padX = 7;
  const maxTextW = Math.max(36, bounds.w - padX * 2 - 12);
  const lines = wrapTextLines(ctx, text, maxTextW);
  const lineH = 14.5;
  let maxLineW = 0;
  for (const ln of lines) {
    maxLineW = Math.max(maxLineW, ctx.measureText(ln).width);
  }
  const tw = Math.ceil(maxLineW) + padX * 2;
  const th = Math.max(21, Math.ceil(lines.length * lineH + 6));

  const minCx = bounds.x + tw / 2 + 5;
  const maxCx = Math.max(minCx, bounds.x + bounds.w - tw / 2 - 5);
  const minCy = bounds.y + th / 2 + 5;
  const maxCy = Math.max(minCy, bounds.y + bounds.h - th / 2 - 5);

  const clampPt = (px: number, py: number) => ({
    cx: Math.round(Math.max(minCx, Math.min(maxCx, px))),
    cy: Math.round(Math.max(minCy, Math.min(maxCy, py))),
  });

  let { cx, cy } = clampPt(x, y);

  if (placedBoxes && placedBoxes.length > 0) {
    const evalCandidate = (candCx: number, candCy: number) => {
      const box: OverlayBoxRect = {
        x: candCx - tw / 2,
        y: candCy - th / 2,
        w: tw,
        h: th,
      };
      let overlap = 0;
      for (const existing of placedBoxes) {
        overlap += computeBoxOverlapArea(box, existing, 6);
      }
      return overlap;
    };

    const initialOverlap = evalCandidate(cx, cy);
    if (initialOverlap > 0) {
      const radii = [24, 42, 62, 84, 108, 132];
      const anglesDeg = [-90, 90, 0, 180, -45, 45, -135, 135, -25, 25, -155, 155];
      let bestCx = cx;
      let bestCy = cy;
      let bestScore = initialOverlap * 10000;

      for (const r of radii) {
        let foundCleanAtRadius = false;
        for (const aDeg of anglesDeg) {
          const rad = aDeg * DEG2RAD;
          const clamped = clampPt(x + Math.cos(rad) * r, y + Math.sin(rad) * r);
          const ov = evalCandidate(clamped.cx, clamped.cy);
          const moveDist = Math.hypot(clamped.cx - cx, clamped.cy - cy);
          const anchorDist = anchorPoint
            ? Math.hypot(clamped.cx - anchorPoint.x, clamped.cy - anchorPoint.y) * 0.25
            : 0;
          const score = ov * 10000 + moveDist + anchorDist;
          if (score < bestScore) {
            bestScore = score;
            bestCx = clamped.cx;
            bestCy = clamped.cy;
            if (ov === 0) foundCleanAtRadius = true;
          }
        }
        if (foundCleanAtRadius) break;
      }

      cx = bestCx;
      cy = bestCy;
    }
  }

  if (placedBoxes) {
    placedBoxes.push({ x: cx - tw / 2, y: cy - th / 2, w: tw, h: th });
  }

  if (anchorPoint) {
    const distToAnchor = Math.hypot(cx - anchorPoint.x, cy - anchorPoint.y);
    if (distToAnchor > Math.min(tw, th) * 0.65) {
      ctx.save();
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(anchorPoint.x, anchorPoint.y);
      ctx.lineTo(cx, cy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = borderColor;
      ctx.beginPath();
      ctx.arc(anchorPoint.x, anchorPoint.y, 2.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.97)';
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(cx - tw / 2, cy - th / 2, tw, th, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const startY = cy - ((lines.length - 1) * lineH) / 2;
  lines.forEach((ln, idx) => {
    ctx.fillText(ln, cx, startY + idx * lineH + 0.5);
  });
  ctx.restore();
}

function draw2DVectorArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width = 2.6,
  head = 9,
): void {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(ang - Math.PI / 6), y2 - head * Math.sin(ang - Math.PI / 6));
  ctx.lineTo(x2 - head * Math.cos(ang + Math.PI / 6), y2 - head * Math.sin(ang + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawAngleArcOverlay(
  ctx: CanvasRenderingContext2D,
  arc: AngleArcAnnotation,
  pts: Record<JointKey, { x: number; y: number }>,
  bounds: { x: number; y: number; w: number; h: number },
  placedBoxes?: OverlayBoxRect[],
): void {
  const origin = pts[arc.joint];
  if (!origin) return;

  let refRad = Math.PI / 2;
  if (arc.refType === 'vertical_down') {
    refRad = Math.PI / 2;
  } else if (arc.refType === 'vertical_up') {
    refRad = -Math.PI / 2;
  } else if (arc.refType === 'horizontal') {
    if (arc.toJoint && pts[arc.toJoint]) {
      refRad = pts[arc.toJoint].x >= origin.x ? 0 : Math.PI;
    } else {
      refRad = 0;
    }
  } else if (arc.refType === 'trunk_axis') {
    const pC7 = pts.c7;
    const pL5 = pts.l5s1;
    refRad = Math.atan2(pL5.y - pC7.y, pL5.x - pC7.x);
  } else if (arc.refType === 'forearm_axis') {
    refRad = Math.atan2(pts.wristR.y - pts.elbowR.y, pts.wristR.x - pts.elbowR.x);
  } else if (arc.refType === 'segment' && arc.parentJoint && pts[arc.parentJoint]) {
    refRad = Math.atan2(origin.y - pts[arc.parentJoint].y, origin.x - pts[arc.parentJoint].x);
  }

  let segRad = refRad + (arc.sweepHintDeg ?? 28) * DEG2RAD;
  if (arc.toJoint && pts[arc.toJoint]) {
    const target = pts[arc.toJoint];
    const dist = Math.hypot(target.x - origin.x, target.y - origin.y);
    if (dist > 6) {
      segRad = Math.atan2(target.y - origin.y, target.x - origin.x);
    }
  }

  const radius = arc.radiusPx ?? 42;
  const lineLen = radius + 18;

  const diff = normalizeAngleDiff(refRad, segRad);
  const absDiff = Math.abs(diff);
  const effectiveDiff = absDiff < 0.14 ? 0.22 : diff;
  const endRad = refRad + effectiveDiff;

  ctx.save();
  ctx.fillStyle = 'rgba(59, 130, 246, 0.26)';
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.arc(origin.x, origin.y, radius, refRad, endRad, effectiveDiff < 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.setLineDash([5, 3]);
  ctx.strokeStyle = '#1e3a8a';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.lineTo(origin.x + Math.cos(refRad) * lineLen, origin.y + Math.sin(refRad) * lineLen);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = '#1d4ed8';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.lineTo(origin.x + Math.cos(segRad) * lineLen, origin.y + Math.sin(segRad) * lineLen);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = '#1d4ed8';
  ctx.fillStyle = '#1d4ed8';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, radius, refRad, endRad, effectiveDiff < 0);
  ctx.stroke();

  const ex = origin.x + Math.cos(endRad) * radius;
  const ey = origin.y + Math.sin(endRad) * radius;
  const tangent = endRad + (effectiveDiff >= 0 ? Math.PI / 2 : -Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - 7.5 * Math.cos(tangent - 0.5), ey - 7.5 * Math.sin(tangent - 0.5));
  ctx.lineTo(ex - 7.5 * Math.cos(tangent + 0.5), ey - 7.5 * Math.sin(tangent + 0.5));
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const midRad = refRad + effectiveDiff * 0.5;
  const arcAnchor = {
    x: origin.x + Math.cos(midRad) * radius,
    y: origin.y + Math.sin(midRad) * radius,
  };
  const lx = origin.x + Math.cos(midRad) * (radius + 30);
  const ly = origin.y + Math.sin(midRad) * (radius + 24);
  drawWhiteBackedTag(
    ctx,
    arc.label,
    lx,
    ly,
    '#1d4ed8',
    '#1e3a8a',
    bounds,
    '700 12px "IBM Plex Mono", monospace',
    placedBoxes,
    arcAnchor,
  );
}

function drawForceVectorOverlay(
  ctx: CanvasRenderingContext2D,
  vec: ForceVectorAnnotation,
  pts: Record<JointKey, { x: number; y: number }>,
  bounds: { x: number; y: number; w: number; h: number },
  placedBoxes?: OverlayBoxRect[],
): void {
  const at = pts[vec.atJoint];
  if (!at) return;
  const mag = Math.hypot(vec.dx, vec.dy) || 1;
  const nx = vec.dx / mag;
  const ny = vec.dy / mag;
  const len = vec.lengthPx ?? 48;
  const x2 = at.x + nx * len;
  const y2 = at.y + ny * len;
  const color = vec.color === 'slate' ? PALETTE.vecSlate : PALETTE.vecBlue;

  draw2DVectorArrow(ctx, at.x, at.y, x2, y2, color, 2.8, 9.5);
  drawWhiteBackedTag(
    ctx,
    vec.label,
    x2 + nx * 24,
    y2 + ny * 18,
    color,
    color,
    bounds,
    '700 12px "IBM Plex Mono", monospace',
    placedBoxes,
    { x: x2, y: y2 },
  );
}

function drawDimensionOverlay(
  ctx: CanvasRenderingContext2D,
  dim: DimensionAnnotation,
  pts: Record<JointKey, { x: number; y: number }>,
  bounds: { x: number; y: number; w: number; h: number },
  placedBoxes?: OverlayBoxRect[],
): void {
  let x1 = 0;
  let y1 = 0;
  let x2 = 0;
  let y2 = 0;

  if (dim.customBox) {
    x1 = bounds.x + dim.customBox.x1 * bounds.w;
    y1 = bounds.y + dim.customBox.y1 * bounds.h;
    x2 = bounds.x + dim.customBox.x2 * bounds.w;
    y2 = bounds.y + dim.customBox.y2 * bounds.h;
  } else if (dim.fromJoint && dim.toJoint && pts[dim.fromJoint] && pts[dim.toJoint]) {
    const p1 = pts[dim.fromJoint];
    const p2 = pts[dim.toJoint];
    if (dim.axis === 'horizontal') {
      const yRow = Math.min(bounds.y + bounds.h - 14, Math.max(p1.y, p2.y) + 26);
      x1 = p1.x;
      y1 = yRow;
      x2 = p2.x;
      y2 = yRow;
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = PALETTE.muted;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(x1, y1);
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    } else if (dim.axis === 'vertical') {
      const xCol = Math.min(bounds.x + bounds.w - 22, Math.max(p1.x, p2.x) + 34);
      x1 = xCol;
      y1 = p1.y;
      x2 = xCol;
      y2 = p2.y;
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = PALETTE.muted;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(x1, y1);
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    } else {
      x1 = p1.x;
      y1 = p1.y;
      x2 = p2.x;
      y2 = p2.y;
    }
  } else {
    return;
  }

  draw2DVectorArrow(ctx, x1, y1, x2, y2, PALETTE.vecBlue, 1.9, 7.5);
  draw2DVectorArrow(ctx, x2, y2, x1, y1, PALETTE.vecBlue, 1.9, 7.5);
  const midAnchor = { x: (x1 + x2) * 0.5, y: (y1 + y2) * 0.5 };
  drawWhiteBackedTag(
    ctx,
    dim.label,
    midAnchor.x,
    midAnchor.y - 15,
    PALETTE.vecBlue,
    PALETTE.vecBlue,
    bounds,
    '700 11.5px "IBM Plex Mono", monospace',
    placedBoxes,
    midAnchor,
  );
}

// ============================================================================
// SINGLE PANEL & BOOK FIGURE RENDERING PIPELINE
// ============================================================================
function renderSingle3DPanelIntoRect(
  ctx: CanvasRenderingContext2D,
  engine: StudioEngine3D,
  panel: Panel3DSpec,
  rect: { x: number; y: number; w: number; h: number },
  orbit: CameraOrbitOverride,
  dpiScale: number,
  transparentBg = false,
  hideChrome = false,
): void {
  ctx.save();
  ctx.font = '700 13px "Plus Jakarta Sans", system-ui, sans-serif';
  const subLines = hideChrome ? [] : wrapTextLines(ctx, panel.subTitle, rect.w - 24).slice(0, 2);
  const subHeight = subLines.length * 16;
  const badgeHeight = !hideChrome && panel.scoreBadge ? 17 : 0;
  const headerH = hideChrome ? 6 : Math.max(40, 12 + subHeight + badgeHeight);

  ctx.font = '600 11.5px "Public Sans", system-ui, sans-serif';
  const noteLines =
    !hideChrome && panel.noteBottom ? wrapTextLines(ctx, panel.noteBottom, rect.w - 24).slice(0, 2) : [];
  const footerH = hideChrome ? 6 : noteLines.length > 0 ? 10 + noteLines.length * 15 : 8;
  ctx.restore();

  const viewX = rect.x + 6;
  const viewY = rect.y + headerH;
  const viewW = Math.max(60, rect.w - 12);
  const viewH = Math.max(80, rect.h - headerH - footerH);

  if (!engine.rig.isReady) {
    if (!transparentBg) {
      ctx.save();
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(viewX, viewY, viewW, viewH);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '600 12px "Public Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Cargando avatar anatómico 3D (.glb)...', viewX + viewW / 2, viewY + viewH / 2);
      ctx.restore();
    }
    return;
  }

  applyPoseToGlbBones(engine, panel);
  const { center, halfExtent } = computeVisibleFocusBounds(engine.rig, panel.focusZone);

  const camera = configureCameraForPanel(
    engine,
    panel.cameraPreset,
    center,
    halfExtent,
    viewW / viewH,
    orbit,
  );

  engine.scene.background = transparentBg ? null : new THREE.Color(PALETTE.bgHex);
  engine.renderer.setClearColor(PALETTE.bgHex, transparentBg ? 0 : 1);

  const isMobileViewport =
    typeof window !== 'undefined' &&
    (window.innerWidth < 768 || Boolean(window.matchMedia?.('(pointer: coarse)').matches));
  const glScale = engine.isSoftwareRenderer
    ? Math.max(1, dpiScale)
    : isMobileViewport && dpiScale < 1.95
      ? Math.min(1.55, Math.max(1.15, dpiScale * 1.25))
      : Math.max(2, dpiScale * 1.5);
  engine.renderer.setSize(Math.round(viewW * glScale), Math.round(viewH * glScale), false);

  try {
    engine.renderer.render(engine.scene, camera);
    ctx.drawImage(engine.renderer.domElement, viewX, viewY, viewW, viewH);
  } catch (renderErr) {
    console.warn('WebGL render error:', renderErr);
    if (!transparentBg) {
      ctx.save();
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(viewX, viewY, viewW, viewH);
      ctx.strokeStyle = '#cbd5e1';
      ctx.strokeRect(viewX, viewY, viewW, viewH);
      ctx.restore();
    }
  }

  const pts = projectJoints2D(engine.rig, camera, viewX, viewY, viewW, viewH);
  const viewportBounds = { x: viewX, y: viewY, w: viewW, h: viewH };
  const placedBoxes: OverlayBoxRect[] = [];

  if (hideChrome && panel.scoreBadge) {
    ctx.save();
    ctx.font = '700 13px "IBM Plex Mono", monospace';
    const bw = Math.max(36, Math.ceil(ctx.measureText(panel.scoreBadge).width) + 18);
    const bh = 28;
    placedBoxes.push({ x: rect.x + 12, y: rect.y + 12, w: bw, h: bh });
    ctx.restore();
  }

  if (panel.pose.highlightGroup === 'rula_groups') {
    drawWhiteBackedTag(
      ctx,
      'Grupo A: Brazo · Antebrazo · Muñeca',
      viewX + viewW * 0.5,
      viewY + 20,
      PALETTE.nodeBlue,
      PALETTE.nodeBlue,
      viewportBounds,
      '700 12px "IBM Plex Mono", monospace',
      placedBoxes,
    );
    drawWhiteBackedTag(
      ctx,
      'Grupo B: Cuello · Tronco · Piernas',
      viewX + viewW * 0.5,
      viewY + viewH - 18,
      PALETTE.arcOrange,
      PALETTE.arcText,
      viewportBounds,
      '700 12px "IBM Plex Mono", monospace',
      placedBoxes,
    );
  }
  if (panel.pose.highlightGroup === 'sagittal_split') {
    drawWhiteBackedTag(
      ctx,
      'Lado Derecho',
      viewX + viewW * 0.25,
      viewY + 24,
      PALETTE.nodeBlue,
      PALETTE.nodeBlue,
      viewportBounds,
      '700 12px "IBM Plex Mono", monospace',
      placedBoxes,
    );
    drawWhiteBackedTag(
      ctx,
      'Lado Izquierdo',
      viewX + viewW * 0.75,
      viewY + 24,
      PALETTE.vecSlate,
      PALETTE.vecSlate,
      viewportBounds,
      '700 12px "IBM Plex Mono", monospace',
      placedBoxes,
    );
  }

  if (panel.angleArcs) {
    for (const arc of panel.angleArcs) {
      drawAngleArcOverlay(ctx, arc, pts, viewportBounds, placedBoxes);
    }
  }
  if (panel.dimensions) {
    for (const dim of panel.dimensions) {
      drawDimensionOverlay(ctx, dim, pts, viewportBounds, placedBoxes);
    }
  }
  if (panel.forceVectors) {
    for (const vec of panel.forceVectors) {
      drawForceVectorOverlay(ctx, vec, pts, viewportBounds, placedBoxes);
    }
  }

  if (hideChrome && panel.scoreBadge) {
    ctx.save();
    ctx.font = '700 13px "IBM Plex Mono", monospace';
    const bw = Math.max(36, Math.ceil(ctx.measureText(panel.scoreBadge).width) + 18);
    const bh = 28;
    const bx = rect.x + 12;
    const by = rect.y + 12;
    ctx.fillStyle = '#3b66b0';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(panel.scoreBadge, bx + bw / 2, by + bh / 2 + 0.5);
    ctx.restore();
    return;
  }

  if (!hideChrome) {
    ctx.save();
    ctx.fillStyle = PALETTE.ink;
    ctx.font = '700 13px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let curY = rect.y + 7;
    for (const line of subLines) {
      ctx.fillText(line, Math.round(rect.x + 12), Math.round(curY));
      curY += 16;
    }

    if (panel.scoreBadge) {
      ctx.fillStyle = '#1d4ed8';
      ctx.font = '700 11.5px "IBM Plex Mono", monospace';
      ctx.fillText(panel.scoreBadge, Math.round(rect.x + 12), Math.round(curY + 1));
    }

    if (noteLines.length > 0) {
      ctx.fillStyle = PALETTE.sub;
      ctx.font = '600 11.5px "Public Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      let noteY = rect.y + rect.h - footerH + 4;
      for (const nLine of noteLines) {
        ctx.fillText(nLine, Math.round(rect.x + rect.w / 2), Math.round(noteY));
        noteY += 15;
      }
    }
    ctx.restore();
  }
}

/**
 * Renders an interactive single 3D posture viewport directly onto a canvas using the PBR `.glb` avatar.
 */
export function renderInteractivePose3DToCanvas(
  panel: Panel3DSpec,
  canvas: HTMLCanvasElement,
  widthPx = 460,
  heightPx = 420,
  orbitOverride: CameraOrbitOverride = DEFAULT_ORBIT_OVERRIDE,
  dpiScale = 2,
  _visualStyle: BiomechVisualStyle = 'anatomical_skin',
  transparentBg = false,
): void {
  const scale = Math.max(1, dpiScale);
  canvas.width = Math.round(widthPx * scale);
  canvas.height = Math.round(heightPx * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (transparentBg) {
    ctx.clearRect(0, 0, widthPx, heightPx);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, widthPx, heightPx);
  }

  const engine = getSharedEngine();
  if (!engine) {
    ctx.save();
    ctx.fillStyle = '#64748b';
    ctx.font = '600 12px "Public Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Motor WebGL 3D no disponible en este navegador', widthPx / 2, heightPx / 2);
    ctx.restore();
    return;
  }

  renderSingle3DPanelIntoRect(
    ctx,
    engine,
    panel,
    { x: 0, y: 0, w: widthPx, h: heightPx },
    orbitOverride,
    scale,
    transparentBg,
    true,
  );
}

// ============================================================================
// DIRECT 3D QUATERNION MOTION-CAPTURE RETARGETING (VIDEO MELLIZO 3D REAL)
// ============================================================================
const _mcParentWorldQuat = new THREE.Quaternion();
const _mcTargetWorldQuat = new THREE.Quaternion();
const _mcBasisMat = new THREE.Matrix4();

function smoothstepScalar(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(1e-5, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function setQuatFromUnitVectorsSafe(
  vFrom: THREE.Vector3,
  vTo: THREE.Vector3,
  fallbackAxis: THREE.Vector3,
): THREE.Quaternion {
  const dot = Math.max(-1, Math.min(1, vFrom.dot(vTo)));
  if (dot < -0.9995) {
    let axis = fallbackAxis.clone().sub(vFrom.clone().multiplyScalar(fallbackAxis.dot(vFrom)));
    if (axis.lengthSq() < 1e-5) {
      axis = new THREE.Vector3(1, 0, 0).cross(vFrom);
      if (axis.lengthSq() < 1e-5) axis = new THREE.Vector3(0, 0, 1).cross(vFrom);
    }
    axis.normalize();
    return new THREE.Quaternion().setFromAxisAngle(axis, Math.PI);
  }
  return new THREE.Quaternion().setFromUnitVectors(vFrom, vTo);
}

function signedAngleAroundAxis(
  fromUnit: THREE.Vector3,
  toUnit: THREE.Vector3,
  axisUnit: THREE.Vector3,
): number {
  const cross = new THREE.Vector3().crossVectors(fromUnit, toUnit);
  return Math.atan2(cross.dot(axisUnit), Math.max(-1, Math.min(1, fromUnit.dot(toUnit))));
}

function makeBasisQuaternion(
  leftUnit: THREE.Vector3,
  upUnit: THREE.Vector3,
  fwdUnit: THREE.Vector3,
): THREE.Quaternion {
  _mcBasisMat.makeBasis(leftUnit, upUnit, fwdUnit);
  return new THREE.Quaternion().setFromRotationMatrix(_mcBasisMat);
}

function applyBoneWorldRotDelta(
  rig: GlbAvatarRig,
  boneName: string,
  worldRotDelta: THREE.Quaternion,
): void {
  const entry = rig.bones.get(boneName);
  if (!entry || !entry.bone.parent) return;
  entry.bone.parent.updateMatrixWorld(true);
  entry.bone.parent.getWorldQuaternion(_mcParentWorldQuat);
  _mcTargetWorldQuat.copy(worldRotDelta).multiply(entry.restWorldQuat);
  entry.bone.quaternion.copy(_mcParentWorldQuat).invert().multiply(_mcTargetWorldQuat);
  entry.bone.updateMatrixWorld(true);
}

function getRestSegmentUnitDir(
  rig: GlbAvatarRig,
  fromBoneName: string,
  toBoneName: string,
  fallbackDir: THREE.Vector3,
): THREE.Vector3 {
  const a = rig.bones.get(fromBoneName);
  const b = rig.bones.get(toBoneName);
  if (!a || !b) return fallbackDir.clone().normalize();
  const d = b.restWorldPos.clone().sub(a.restWorldPos);
  if (d.lengthSq() < 1e-6) return fallbackDir.clone().normalize();
  return d.normalize();
}

function solveSwingTwistChainWorldRot(params: {
  vRestProx: THREE.Vector3;
  vRestDist: THREE.Vector3;
  restBendDir: THREE.Vector3;
  uTarget: THREE.Vector3;
  fTarget: THREE.Vector3;
  refBendDir: THREE.Vector3;
  fallbackSwingAxis: THREE.Vector3;
  maxAxialTwistRad: number;
}): { proxWorldRot: THREE.Quaternion; distWorldRot: THREE.Quaternion } {
  const {
    vRestProx,
    vRestDist,
    restBendDir,
    uTarget,
    fTarget,
    refBendDir,
    fallbackSwingAxis,
    maxAxialTwistRad,
  } = params;

  const restHinge = new THREE.Vector3().crossVectors(vRestProx, restBendDir);
  if (restHinge.lengthSq() < 1e-6) restHinge.set(1, 0, 0);
  else restHinge.normalize();

  const qSwing = setQuatFromUnitVectorsSafe(vRestProx, uTarget, fallbackSwingAxis);
  const swungHinge = restHinge.clone().applyQuaternion(qSwing).normalize();

  // Plano neutro de flexión solidario al tronco/pelvis
  let projRef = refBendDir.clone().sub(uTarget.clone().multiplyScalar(refBendDir.dot(uTarget)));
  if (projRef.lengthSq() < 1e-4) {
    projRef = fallbackSwingAxis
      .clone()
      .sub(uTarget.clone().multiplyScalar(fallbackSwingAxis.dot(uTarget)));
  }
  if (projRef.lengthSq() < 1e-5) projRef.set(0, 0, 1);
  projRef.normalize();

  let neutralHinge = new THREE.Vector3().crossVectors(uTarget, projRef);
  if (neutralHinge.lengthSq() < 1e-5) neutralHinge.copy(swungHinge);
  else neutralHinge.normalize();

  const cosBend = Math.max(-1, Math.min(1, uTarget.dot(fTarget)));
  const bendRad = Math.acos(cosBend);
  const wBend = smoothstepScalar(0.24, 0.64, bendRad);

  let desiredHinge = neutralHinge.clone();
  const rawVideoHinge = new THREE.Vector3().crossVectors(uTarget, fTarget);
  if (wBend > 0.001 && rawVideoHinge.lengthSq() > 1e-4) {
    rawVideoHinge.normalize();
    const deltaFromNeutral = signedAngleAroundAxis(neutralHinge, rawVideoHinge, uTarget);
    const clampedDelta = Math.max(-maxAxialTwistRad, Math.min(maxAxialTwistRad, deltaFromNeutral));
    const qClamp = new THREE.Quaternion().setFromAxisAngle(uTarget, clampedDelta);
    const clampedVideoHinge = neutralHinge.clone().applyQuaternion(qClamp).normalize();
    desiredHinge.lerp(clampedVideoHinge, wBend).normalize();
  }

  const twistRad = signedAngleAroundAxis(swungHinge, desiredHinge, uTarget);
  const qTwist = new THREE.Quaternion().setFromAxisAngle(uTarget, twistRad);
  const proxWorldRot = qTwist.multiply(qSwing);

  const distRestAfterProx = vRestDist.clone().applyQuaternion(proxWorldRot).normalize();
  const qDistSwing = setQuatFromUnitVectorsSafe(distRestAfterProx, fTarget, desiredHinge);
  const distWorldRot = qDistSwing.multiply(proxWorldRot);

  return { proxWorldRot, distWorldRot };
}

/**
 * Aplica retargeting esquelético 3D directo por cuaterniones en espacio mundial desde
 * los 33 puntos de MediaPipe Pose Heavy hacia todos los huesos del avatar `.glb`.
 */
function applyDirectMocapRetargetToGlbBones(
  engine: StudioEngine3D,
  sample: MocapFrameSample,
  sceneProp: ScenePropType = 'none',
): void {
  const { rig, isSoftwareRenderer } = engine;
  if (!rig.isReady || !sample.world3D || sample.world3D.length < 33) return;

  resetAllBonesToRest(rig);

  const P = (idx: number) => {
    const p = sample.world3D[idx];
    return new THREE.Vector3(p.x, p.y, p.z);
  };

  const nose = P(0);
  const earL = P(7);
  const earR = P(8);
  const shL = P(11);
  const shR = P(12);
  const elbL = P(13);
  const elbR = P(14);
  const wrL = P(15);
  const wrR = P(16);
  const pinkyL = P(17);
  const pinkyR = P(18);
  const idxL = P(19);
  const idxR = P(20);
  const hipL = P(23);
  const hipR = P(24);
  const kneeL = P(25);
  const kneeR = P(26);
  const ankL = P(27);
  const ankR = P(28);
  const heelL = P(29);
  const heelR = P(30);
  const toeL = P(31);
  const toeR = P(32);

  const midHip = hipL.clone().add(hipR).multiplyScalar(0.5);
  const midSh = shL.clone().add(shR).multiplyScalar(0.5);
  const midEar = earL.clone().add(earR).multiplyScalar(0.5);
  const worldUp = new THREE.Vector3(0, 1, 0);

  // 1. Base ortonormal 3D de Pelvis (Hips) — incluye Yaw global, inclinación pélvica y balanceo lateral
  const shLeftDir = shL.clone().sub(shR).normalize();
  const hipLeftRaw = hipL.clone().sub(hipR).normalize();
  const pelvisLeftBlend = hipLeftRaw.clone().multiplyScalar(0.72).addScaledVector(shLeftDir, 0.28).normalize();
  const trunkUpUnit = midSh.clone().sub(midHip).normalize();
  const pelvisUpUnit = worldUp.clone().lerp(trunkUpUnit, 0.44).normalize();

  let pelvisFwd = new THREE.Vector3().crossVectors(pelvisLeftBlend, pelvisUpUnit);
  if (pelvisFwd.lengthSq() < 1e-5) pelvisFwd.set(0, 0, 1);
  else pelvisFwd.normalize();
  const pelvisLeft = new THREE.Vector3().crossVectors(pelvisUpUnit, pelvisFwd).normalize();
  const qHipsWorld = makeBasisQuaternion(pelvisLeft, pelvisUpUnit, pelvisFwd);

  applyBoneWorldRotDelta(rig, 'Hips', qHipsWorld);

  // 2. Columna Lumbar y Torácica (Spine -> Spine1 -> Spine2) con torsión axial y flexión lateral real
  let thoraxFwd = new THREE.Vector3().crossVectors(shLeftDir, trunkUpUnit);
  if (thoraxFwd.lengthSq() < 1e-5) thoraxFwd.copy(pelvisFwd);
  else thoraxFwd.normalize();
  const thoraxLeft = new THREE.Vector3().crossVectors(trunkUpUnit, thoraxFwd).normalize();
  const qThoraxWorld = makeBasisQuaternion(thoraxLeft, trunkUpUnit, thoraxFwd);

  if (rig.bones.has('Spine2')) {
    applyBoneWorldRotDelta(rig, 'Spine', qHipsWorld.clone().slerp(qThoraxWorld, 0.36));
    applyBoneWorldRotDelta(rig, 'Spine1', qHipsWorld.clone().slerp(qThoraxWorld, 0.70));
    applyBoneWorldRotDelta(rig, 'Spine2', qThoraxWorld);
  } else {
    applyBoneWorldRotDelta(rig, 'Spine', qHipsWorld.clone().slerp(qThoraxWorld, 0.52));
    applyBoneWorldRotDelta(rig, 'Spine1', qThoraxWorld);
  }

  // 3. Cuello y Cabeza (Neck -> Head) orientados según vector interauricular + nariz
  const earSpan = earL.clone().sub(earR);
  const headLeftRaw = earSpan.lengthSq() > 1e-4 ? earSpan.normalize() : thoraxLeft.clone();
  const gazeRaw = nose.clone().sub(midEar);
  const neckChordUp = midEar.clone().sub(midSh).normalize();
  const headUpRaw =
    gazeRaw.lengthSq() > 1e-4
      ? neckChordUp
          .clone()
          .multiplyScalar(0.68)
          .addScaledVector(new THREE.Vector3().crossVectors(gazeRaw.normalize(), headLeftRaw).normalize(), 0.32)
          .normalize()
      : neckChordUp;
  let headFwd = new THREE.Vector3().crossVectors(headLeftRaw, headUpRaw);
  if (headFwd.lengthSq() < 1e-5) headFwd.copy(thoraxFwd);
  else headFwd.normalize();
  const headLeft = new THREE.Vector3().crossVectors(headUpRaw, headFwd).normalize();
  const qHeadRaw = makeBasisQuaternion(headLeft, headUpRaw, headFwd);
  // Limitar rotación cervical extrema si la cara queda parcialmente oculta de espaldas
  const headAngleDiff = 2 * Math.acos(Math.min(1, Math.abs(qThoraxWorld.dot(qHeadRaw))));
  const qHeadWorld =
    headAngleDiff > 1.28
      ? qThoraxWorld.clone().slerp(qHeadRaw, 1.28 / headAngleDiff)
      : qHeadRaw;

  applyBoneWorldRotDelta(rig, 'Neck', qThoraxWorld.clone().slerp(qHeadWorld, 0.55));
  applyBoneWorldRotDelta(rig, 'Head', qHeadWorld);

  // 4. Cintura Escapular + Brazos y Antebrazos (Derecho e Izquierdo)
  const uR = elbR.clone().sub(shR).normalize();
  const fR = wrR.clone().sub(elbR).normalize();
  const uL = elbL.clone().sub(shL).normalize();
  const fL = wrL.clone().sub(elbL).normalize();

  // Ritmo escapulohumeral sutil en elevaciones por encima del hombro
  const elevFactorR = Math.max(0, (uR.dot(trunkUpUnit) + 0.15) * 0.24);
  const elevFactorL = Math.max(0, (uL.dot(trunkUpUnit) + 0.15) * 0.24);
  if (elevFactorR > 0.01) {
    const qClavR = new THREE.Quaternion().setFromAxisAngle(thoraxFwd, -elevFactorR).multiply(qThoraxWorld);
    applyBoneWorldRotDelta(rig, 'RightShoulder', qClavR);
  } else {
    applyBoneWorldRotDelta(rig, 'RightShoulder', qThoraxWorld);
  }
  if (elevFactorL > 0.01) {
    const qClavL = new THREE.Quaternion().setFromAxisAngle(thoraxFwd, elevFactorL).multiply(qThoraxWorld);
    applyBoneWorldRotDelta(rig, 'LeftShoulder', qClavL);
  } else {
    applyBoneWorldRotDelta(rig, 'LeftShoulder', qThoraxWorld);
  }

  const vRestArmR = getRestSegmentUnitDir(rig, 'RightArm', 'RightForeArm', new THREE.Vector3(-0.04, -1, 0));
  const vRestForeR = getRestSegmentUnitDir(rig, 'RightForeArm', 'RightHand', new THREE.Vector3(-0.04, -1, 0));
  const armChainR = solveSwingTwistChainWorldRot({
    vRestProx: vRestArmR,
    vRestDist: vRestForeR,
    restBendDir: new THREE.Vector3(0, 0, 1),
    uTarget: uR,
    fTarget: fR,
    refBendDir: thoraxFwd,
    fallbackSwingAxis: thoraxLeft,
    maxAxialTwistRad: 1.38,
  });
  applyBoneWorldRotDelta(rig, 'RightArm', armChainR.proxWorldRot);

  // Pronosupinación real de muñeca derecha si índice y meñique son visibles
  let foreWorldRotR = armChainR.distWorldRot.clone();
  const visHandR = Math.min(sample.world3D[18]?.visibility ?? 0, sample.world3D[20]?.visibility ?? 0);
  if (visHandR >= 0.55) {
    const spanR = idxR.clone().sub(pinkyR);
    const projSpan = spanR.sub(fR.clone().multiplyScalar(spanR.dot(fR)));
    if (projSpan.lengthSq() > 1e-4) {
      projSpan.normalize();
      const restSpanAfter = new THREE.Vector3(0, 0, 1).applyQuaternion(foreWorldRotR);
      const restSpanProj = restSpanAfter.sub(fR.clone().multiplyScalar(restSpanAfter.dot(fR)));
      if (restSpanProj.lengthSq() > 1e-4) {
        restSpanProj.normalize();
        const pronoRad = Math.max(
          -1.35,
          Math.min(1.35, signedAngleAroundAxis(restSpanProj, projSpan, fR) * 0.65),
        );
        foreWorldRotR = new THREE.Quaternion().setFromAxisAngle(fR, pronoRad).multiply(foreWorldRotR);
      }
    }
  }
  applyBoneWorldRotDelta(rig, 'RightForeArm', foreWorldRotR);

  // Mano derecha (orientación muñeca -> nudillos)
  const midKnuckleR = idxR.clone().add(pinkyR).multiplyScalar(0.5);
  const handVecR = midKnuckleR.sub(wrR);
  if (visHandR >= 0.5 && handVecR.lengthSq() > 1e-4) {
    handVecR.normalize();
    const vRestHandR = getRestSegmentUnitDir(rig, 'RightHand', 'RightHandMiddle1', vRestForeR);
    const handRestAfter = vRestHandR.clone().applyQuaternion(foreWorldRotR).normalize();
    if (handRestAfter.angleTo(handVecR) < 0.85) {
      const qWristR = setQuatFromUnitVectorsSafe(handRestAfter, handVecR, thoraxLeft).multiply(foreWorldRotR);
      applyBoneWorldRotDelta(rig, 'RightHand', qWristR);
    } else {
      applyBoneWorldRotDelta(rig, 'RightHand', foreWorldRotR);
    }
  } else {
    applyBoneWorldRotDelta(rig, 'RightHand', foreWorldRotR);
  }

  const vRestArmL = getRestSegmentUnitDir(rig, 'LeftArm', 'LeftForeArm', new THREE.Vector3(0.04, -1, 0));
  const vRestForeL = getRestSegmentUnitDir(rig, 'LeftForeArm', 'LeftHand', new THREE.Vector3(0.04, -1, 0));
  const armChainL = solveSwingTwistChainWorldRot({
    vRestProx: vRestArmL,
    vRestDist: vRestForeL,
    restBendDir: new THREE.Vector3(0, 0, 1),
    uTarget: uL,
    fTarget: fL,
    refBendDir: thoraxFwd,
    fallbackSwingAxis: thoraxLeft,
    maxAxialTwistRad: 1.38,
  });
  applyBoneWorldRotDelta(rig, 'LeftArm', armChainL.proxWorldRot);

  let foreWorldRotL = armChainL.distWorldRot.clone();
  const visHandL = Math.min(sample.world3D[17]?.visibility ?? 0, sample.world3D[19]?.visibility ?? 0);
  if (visHandL >= 0.55) {
    const spanL = idxL.clone().sub(pinkyL);
    const projSpanL = spanL.sub(fL.clone().multiplyScalar(spanL.dot(fL)));
    if (projSpanL.lengthSq() > 1e-4) {
      projSpanL.normalize();
      const restSpanAfterL = new THREE.Vector3(0, 0, 1).applyQuaternion(foreWorldRotL);
      const restSpanProjL = restSpanAfterL.sub(fL.clone().multiplyScalar(restSpanAfterL.dot(fL)));
      if (restSpanProjL.lengthSq() > 1e-4) {
        restSpanProjL.normalize();
        const pronoRadL = Math.max(
          -1.35,
          Math.min(1.35, signedAngleAroundAxis(restSpanProjL, projSpanL, fL) * 0.65),
        );
        foreWorldRotL = new THREE.Quaternion().setFromAxisAngle(fL, pronoRadL).multiply(foreWorldRotL);
      }
    }
  }
  applyBoneWorldRotDelta(rig, 'LeftForeArm', foreWorldRotL);

  const midKnuckleL = idxL.clone().add(pinkyL).multiplyScalar(0.5);
  const handVecL = midKnuckleL.sub(wrL);
  if (visHandL >= 0.5 && handVecL.lengthSq() > 1e-4) {
    handVecL.normalize();
    const vRestHandL = getRestSegmentUnitDir(rig, 'LeftHand', 'LeftHandMiddle1', vRestForeL);
    const handRestAfterL = vRestHandL.clone().applyQuaternion(foreWorldRotL).normalize();
    if (handRestAfterL.angleTo(handVecL) < 0.85) {
      const qWristL = setQuatFromUnitVectorsSafe(handRestAfterL, handVecL, thoraxLeft).multiply(foreWorldRotL);
      applyBoneWorldRotDelta(rig, 'LeftHand', qWristL);
    } else {
      applyBoneWorldRotDelta(rig, 'LeftHand', foreWorldRotL);
    }
  } else {
    applyBoneWorldRotDelta(rig, 'LeftHand', foreWorldRotL);
  }

  // Dedos relajados o acople sobre carga si hay objeto activo
  if (sceneProp !== 'none') {
    curlHandFingers(rig, 'Right', 0.26, 0.30, 0.26);
    curlHandFingers(rig, 'Left', 0.26, 0.30, 0.26);
  } else {
    curlHandFingers(rig, 'Right', 0.18, 0.16, 0.18);
    curlHandFingers(rig, 'Left', 0.18, 0.16, 0.18);
  }

  // 5. Miembros Inferiores: Caderas, Rodillas y Pies (la rodilla flexiona hacia -pelvisFwd)
  const thighR = kneeR.clone().sub(hipR).normalize();
  const shankR = ankR.clone().sub(kneeR).normalize();
  const thighL = kneeL.clone().sub(hipL).normalize();
  const shankL = ankL.clone().sub(kneeL).normalize();
  const pelvisBack = pelvisFwd.clone().negate();

  const vRestThighR = getRestSegmentUnitDir(rig, 'RightUpLeg', 'RightLeg', new THREE.Vector3(0, -1, 0));
  const vRestShankR = getRestSegmentUnitDir(rig, 'RightLeg', 'RightFoot', new THREE.Vector3(0, -1, 0));
  const legChainR = solveSwingTwistChainWorldRot({
    vRestProx: vRestThighR,
    vRestDist: vRestShankR,
    restBendDir: new THREE.Vector3(0, 0, -1),
    uTarget: thighR,
    fTarget: shankR,
    refBendDir: pelvisBack,
    fallbackSwingAxis: pelvisLeft,
    maxAxialTwistRad: 0.72,
  });
  applyBoneWorldRotDelta(rig, 'RightUpLeg', legChainR.proxWorldRot);
  applyBoneWorldRotDelta(rig, 'RightLeg', legChainR.distWorldRot);

  const visFootR = Math.min(sample.world3D[30]?.visibility ?? 0, sample.world3D[32]?.visibility ?? 0);
  const footDirR = toeR.clone().sub(heelR);
  if (visFootR >= 0.45 && footDirR.lengthSq() > 1e-4) {
    footDirR.normalize();
    const vRestFootR = getRestSegmentUnitDir(rig, 'RightFoot', 'RightToeBase', new THREE.Vector3(0, -0.35, 0.94));
    const footRestAfterR = vRestFootR.clone().applyQuaternion(legChainR.distWorldRot).normalize();
    const maxFootAngle = 0.72;
    const angFootR = footRestAfterR.angleTo(footDirR);
    const targetFootDirR =
      angFootR > maxFootAngle
        ? footRestAfterR.clone().lerp(footDirR, maxFootAngle / angFootR).normalize()
        : footDirR;
    const qFootR = setQuatFromUnitVectorsSafe(footRestAfterR, targetFootDirR, pelvisLeft).multiply(
      legChainR.distWorldRot,
    );
    applyBoneWorldRotDelta(rig, 'RightFoot', qFootR);
  } else {
    applyBoneWorldRotDelta(rig, 'RightFoot', legChainR.distWorldRot);
  }

  const vRestThighL = getRestSegmentUnitDir(rig, 'LeftUpLeg', 'LeftLeg', new THREE.Vector3(0, -1, 0));
  const vRestShankL = getRestSegmentUnitDir(rig, 'LeftLeg', 'LeftFoot', new THREE.Vector3(0, -1, 0));
  const legChainL = solveSwingTwistChainWorldRot({
    vRestProx: vRestThighL,
    vRestDist: vRestShankL,
    restBendDir: new THREE.Vector3(0, 0, -1),
    uTarget: thighL,
    fTarget: shankL,
    refBendDir: pelvisBack,
    fallbackSwingAxis: pelvisLeft,
    maxAxialTwistRad: 0.72,
  });
  applyBoneWorldRotDelta(rig, 'LeftUpLeg', legChainL.proxWorldRot);
  applyBoneWorldRotDelta(rig, 'LeftLeg', legChainL.distWorldRot);

  const visFootL = Math.min(sample.world3D[29]?.visibility ?? 0, sample.world3D[31]?.visibility ?? 0);
  const footDirL = toeL.clone().sub(heelL);
  if (visFootL >= 0.45 && footDirL.lengthSq() > 1e-4) {
    footDirL.normalize();
    const vRestFootL = getRestSegmentUnitDir(rig, 'LeftFoot', 'LeftToeBase', new THREE.Vector3(0, -0.35, 0.94));
    const footRestAfterL = vRestFootL.clone().applyQuaternion(legChainL.distWorldRot).normalize();
    const maxFootAngle = 0.72;
    const angFootL = footRestAfterL.angleTo(footDirL);
    const targetFootDirL =
      angFootL > maxFootAngle
        ? footRestAfterL.clone().lerp(footDirL, maxFootAngle / angFootL).normalize()
        : footDirL;
    const qFootL = setQuatFromUnitVectorsSafe(footRestAfterL, targetFootDirL, pelvisLeft).multiply(
      legChainL.distWorldRot,
    );
    applyBoneWorldRotDelta(rig, 'LeftFoot', qFootL);
  } else {
    applyBoneWorldRotDelta(rig, 'LeftFoot', legChainL.distWorldRot);
  }

  // 6. Traslación Espacial Real (Root Motion X/Z) + Anclaje Físico de Pies al Suelo (Foot-Planting Y=0)
  rig.avatarContainer.rotation.set(0, 0, 0);
  rig.avatarContainer.position.set(
    sample.rootTranslation.x,
    0,
    sample.rootTranslation.z,
  );
  rig.avatarContainer.updateMatrixWorld(true);

  let minSupportY = Infinity;
  for (const supportObj of [
    rig.joints.ankleR,
    rig.joints.footR,
    rig.joints.ankleL,
    rig.joints.footL,
  ]) {
    supportObj.getWorldPosition(_tmpWorldVec);
    if (_tmpWorldVec.y < minSupportY) minSupportY = _tmpWorldVec.y;
  }
  if (Number.isFinite(minSupportY)) {
    rig.avatarContainer.position.y = 0.022 - minSupportY;
  }
  rig.avatarContainer.updateMatrixWorld(true);

  // Asegurar que la sombra de piso acompañe el desplazamiento horizontal del operario
  rig.groundShadowMesh.visible = true;
  rig.groundShadowMesh.position.x = sample.rootTranslation.x;
  rig.groundShadowMesh.position.z = sample.rootTranslation.z;

  // Actualizar todas las mallas PBR de cuerpo completo
  for (const sm of rig.skinnedMeshes) {
    sm.visible = true;
    sm.material = rig.baseMaterials.get(sm) || sm.material;
    sm.skeleton.update();
  }

  const poseWithProp: PosturePose3D = {
    ...sample.ergonomicPose,
    prop: sceneProp,
  };
  buildSceneProp(rig, poseWithProp, isSoftwareRenderer);
  rig.propsRoot.updateMatrixWorld(true);
}

/**
 * Renderiza un fotograma de Captura de Movimiento 3D Real (Vídeo Mellizo) con CÁMARA FIJA DE ESTUDIO
 * alineada 1:1 con el eje óptico del vídeo original para que agachadas, alcances, giros y pasos
 * se reflejen fielmente sin auto-zoom ni efecto "cinta de correr".
 */
export function renderMocapTwinFrameToCanvas(
  sample: MocapFrameSample,
  canvas: HTMLCanvasElement,
  widthPx = 560,
  heightPx = 460,
  orbitOverride: CameraOrbitOverride = DEFAULT_ORBIT_OVERRIDE,
  options?: {
    cameraPreset?: CameraPreset;
    sceneProp?: ScenePropType;
    showAngleHUD?: boolean;
    dpiScale?: number;
  },
): void {
  const scale = Math.max(1, options?.dpiScale ?? 1.5);
  if (
    canvas.width !== Math.round(widthPx * scale) ||
    canvas.height !== Math.round(heightPx * scale)
  ) {
    canvas.width = Math.round(widthPx * scale);
    canvas.height = Math.round(heightPx * scale);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, widthPx, heightPx);

  const engine = getSharedEngine();
  if (!engine || !engine.rig.isReady) {
    ctx.save();
    ctx.fillStyle = '#64748b';
    ctx.font = '600 12px "Public Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Inicializando gemelo anatómico 3D (.glb)...', widthPx / 2, heightPx / 2);
    ctx.restore();
    return;
  }

  applyDirectMocapRetargetToGlbBones(engine, sample, options?.sceneProp ?? 'none');

  // Restaurar posición centrada de la malla de sombra tras el render para no afectar vistas estáticas
  const fixedStudioCenter = new THREE.Vector3(0, 0.88, 0);
  const fixedHalfExtent = 1.16;
  const preset: CameraPreset = options?.cameraPreset ?? 'frontal';
  const camera = configureCameraForPanel(
    engine,
    preset,
    fixedStudioCenter,
    fixedHalfExtent,
    widthPx / Math.max(1, heightPx),
    orbitOverride,
  );

  // Grilla sutil de piso estacionario (referencia métrica real para pasos y cuclillas)
  ctx.save();
  const projFloorPt = (wx: number, wz: number): { x: number; y: number } | null => {
    const v = new THREE.Vector3(wx, 0.002, wz).project(camera);
    if (v.z > 1) return null;
    return {
      x: (v.x * 0.5 + 0.5) * widthPx,
      y: (-v.y * 0.5 + 0.5) * heightPx,
    };
  };
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  for (let gx = -1.5; gx <= 1.501; gx += 0.3) {
    const a = projFloorPt(gx, -1.2);
    const b = projFloorPt(gx, 1.2);
    if (a && b) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  for (let gz = -1.2; gz <= 1.201; gz += 0.3) {
    const a = projFloorPt(-1.5, gz);
    const b = projFloorPt(1.5, gz);
    if (a && b) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.restore();

  engine.scene.background = null;
  engine.renderer.setClearColor(PALETTE.bgHex, 0);
  const glScale = engine.isSoftwareRenderer ? 1 : Math.min(2, scale * 1.25);
  engine.renderer.setSize(Math.round(widthPx * glScale), Math.round(heightPx * glScale), false);

  try {
    engine.renderer.render(engine.scene, camera);
    ctx.drawImage(engine.renderer.domElement, 0, 0, widthPx, heightPx);
  } catch (err) {
    console.warn('Mocap twin WebGL frame error:', err);
  } finally {
    engine.rig.groundShadowMesh.position.set(0, 0.001, 0);
  }

  if (options?.showAngleHUD !== false) {
    const pts = projectJoints2D(engine.rig, camera, 0, 0, widthPx, heightPx);
    const ep = sample.ergonomicPose;
    const viewportBounds = { x: 8, y: 8, w: widthPx - 16, h: heightPx - 16 };
    const placed: OverlayBoxRect[] = [];

    const dynamicArcs: AngleArcAnnotation[] = [
      {
        joint: 'l5s1',
        refType: 'vertical_up',
        toJoint: 'c7',
        label: `Tronco ${Math.round(ep.trunkFlexionDeg)}°`,
      },
      {
        joint: 'elbowR',
        refType: 'segment',
        parentJoint: 'shoulderR',
        toJoint: 'wristR',
        label: `Codo D ${Math.round(ep.elbowRFlexionDeg)}°`,
      },
    ];
    if (Math.max(ep.kneeRFlexionDeg, ep.kneeLFlexionDeg) >= 18) {
      dynamicArcs.push({
        joint: 'kneeR',
        refType: 'segment',
        parentJoint: 'hipR',
        toJoint: 'ankleR',
        label: `Rodilla ${Math.round(Math.max(ep.kneeRFlexionDeg, ep.kneeLFlexionDeg))}°`,
      });
    }
    for (const arc of dynamicArcs) {
      drawAngleArcOverlay(ctx, arc, pts, viewportBounds, placed);
    }
  }
}

/**
 * Renderiza el Avatar 3D para el Estudio de Movimiento Libre con el Ratón / Táctil,
 * devolviendo las coordenadas 2D proyectadas de todas las articulaciones y dibujando
 * nodos interactivos seleccionables directamente sobre el lienzo.
 */
export function renderInteractiveFreeAvatarToCanvas(
  panel: Panel3DSpec,
  canvas: HTMLCanvasElement,
  widthPx = 640,
  heightPx = 560,
  orbitOverride: CameraOrbitOverride = DEFAULT_ORBIT_OVERRIDE,
  dpiScale = 2,
  gizmoOptions?: {
    showGizmos?: boolean;
    interactiveJoints?: JointKey[];
    selectedJoint?: JointKey | null;
    hoveredJoint?: JointKey | null;
    transparentBg?: boolean;
  },
): Record<JointKey, { x: number; y: number }> | null {
  const scale = Math.max(1, dpiScale);
  canvas.width = Math.round(widthPx * scale);
  canvas.height = Math.round(heightPx * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const useTransparentBg = Boolean(gizmoOptions?.transparentBg);

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (useTransparentBg) {
    ctx.clearRect(0, 0, widthPx, heightPx);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, widthPx, heightPx);
  }

  const engine = getSharedEngine();
  if (!engine || !engine.rig.isReady) {
    renderInteractivePose3DToCanvas(panel, canvas, widthPx, heightPx, orbitOverride, scale, 'anatomical_skin', useTransparentBg);
    return null;
  }

  renderSingle3DPanelIntoRect(
    ctx,
    engine,
    panel,
    { x: 0, y: 0, w: widthPx, h: heightPx },
    orbitOverride,
    scale,
    useTransparentBg,
    true,
  );

  const viewX = 6;
  const viewY = 6;
  const viewW = Math.max(60, widthPx - 12);
  const viewH = Math.max(80, heightPx - 12);
  const { center, halfExtent } = computeVisibleFocusBounds(engine.rig, panel.focusZone);
  const camera = configureCameraForPanel(
    engine,
    panel.cameraPreset,
    center,
    halfExtent,
    viewW / viewH,
    orbitOverride,
  );
  const pts = projectJoints2D(engine.rig, camera, viewX, viewY, viewW, viewH);

  if (gizmoOptions?.showGizmos !== false) {
    const list: JointKey[] = gizmoOptions?.interactiveJoints || [
      'head',
      'c7',
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

    // Líneas guía sutiles entre articulaciones controlables
    const bonePairs: Array<[JointKey, JointKey]> = [
      ['pelvis', 'l5s1'],
      ['l5s1', 'c7'],
      ['c7', 'head'],
      ['shoulderR', 'elbowR'],
      ['elbowR', 'wristR'],
      ['shoulderL', 'elbowL'],
      ['elbowL', 'wristL'],
      ['hipR', 'kneeR'],
      ['kneeR', 'ankleR'],
      ['hipL', 'kneeL'],
      ['kneeL', 'ankleL'],
    ];
    ctx.save();
    ctx.strokeStyle = 'rgba(2, 132, 199, 0.32)';
    ctx.lineWidth = 1.6;
    for (const [a, b] of bonePairs) {
      const pa = pts[a];
      const pb = pts[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }

    for (const jk of list) {
      const p = pts[jk];
      if (!p) continue;
      const isSelected = gizmoOptions?.selectedJoint === jk;
      const isHovered = gizmoOptions?.hoveredJoint === jk;
      const r = isSelected ? 8.5 : isHovered ? 7.5 : 5.6;

      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4.5, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? 'rgba(234, 88, 12, 0.24)' : 'rgba(2, 132, 199, 0.22)';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#ea580c' : isHovered ? '#0284c7' : 'rgba(255, 255, 255, 0.92)';
      ctx.fill();
      ctx.lineWidth = isSelected ? 2.4 : 1.8;
      ctx.strokeStyle = isSelected ? '#ffffff' : '#0284c7';
      ctx.stroke();
    }
    ctx.restore();
  }

  return pts;
}

/**
 * Renders any BookFigureFileSpec onto the provided HTMLCanvasElement using the clean PBR `.glb` avatar.
 */
export function renderBookFigureToCanvas(
  spec: BookFigureFileSpec,
  canvas: HTMLCanvasElement,
  orbitOverride: CameraOrbitOverride = DEFAULT_ORBIT_OVERRIDE,
  dpiScale = 2,
  options?: FigureRenderOptions,
): void {
  try {
    const { widthPx, heightPx } = spec;
    const scale = Math.max(1, dpiScale);
    const assignedPhotoUrl = !options?.preferSynthetic3D ? getEffectiveFigurePhotoUrl(spec) : undefined;
    const transparentBg = Boolean(options?.transparentBg);
    const forceFullBody = options?.forceFullBody ?? DEFAULT_FORCE_FULL_BODY;

    if (!assignedPhotoUrl && (spec.renderMode === 'diagram' || spec.renderMode === 'real_chart')) {
      if (spec.diagramId) {
        renderDiagramVariant(canvas, spec.diagramId, widthPx, heightPx, scale);
      }
      return;
    }

    canvas.width = Math.round(widthPx * scale);
    canvas.height = Math.round(heightPx * scale);

    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (transparentBg) {
      ctx.clearRect(0, 0, widthPx, heightPx);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, widthPx, heightPx);
    }

    const showHeader = !transparentBg && (!assignedPhotoUrl || options?.includeHeaderOnPhoto !== false);
    let topTitleBarH = 0;

    if (showHeader) {
      ctx.save();
      const isCustomFig = spec.figureNumber === '3D';
      const figLabel = isCustomFig ? '3D' : `FIG. ${spec.figureNumber}${spec.subPart || ''}`;
      ctx.font = '700 12px "IBM Plex Mono", monospace';
      const figLabelW = Math.ceil(ctx.measureText(figLabel).width);

      const titleStartX = 14 + figLabelW + 10;
      const availTitleW = Math.max(160, widthPx - titleStartX - 14);
      ctx.font = '700 13.5px "Plus Jakarta Sans", system-ui, sans-serif';
      const titleLines = wrapTextLines(ctx, spec.title, availTitleW).slice(0, 2);
      topTitleBarH = titleLines.length > 1 ? 54 : 40;

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, widthPx, topTitleBarH);
      ctx.strokeStyle = PALETTE.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, topTitleBarH);
      ctx.lineTo(widthPx, topTitleBarH);
      ctx.stroke();

      ctx.fillStyle = PALETTE.nodeBlue;
      ctx.font = '700 12px "IBM Plex Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(figLabel, 14, Math.round(topTitleBarH / 2));

      ctx.fillStyle = PALETTE.ink;
      ctx.font = '700 13.5px "Plus Jakarta Sans", system-ui, sans-serif';
      if (titleLines.length <= 1) {
        ctx.fillText(titleLines[0] || '', Math.round(titleStartX), Math.round(topTitleBarH / 2));
      } else {
        ctx.fillText(titleLines[0], Math.round(titleStartX), Math.round(topTitleBarH / 2 - 9));
        ctx.fillText(titleLines[1], Math.round(titleStartX), Math.round(topTitleBarH / 2 + 10));
      }
      ctx.restore();
    }

    const bodyAreaY = showHeader ? topTitleBarH + 2 : 0;
    const bodyAreaH = showHeader ? heightPx - bodyAreaY - 4 : heightPx;

    if (assignedPhotoUrl) {
      const cachedImg = loadedPhotoCache.get(assignedPhotoUrl);
      if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
        const padX = showHeader ? 10 : 4;
        const padY = showHeader ? 8 : 4;
        const availW = Math.max(40, widthPx - padX * 2);
        const availH = Math.max(40, bodyAreaH - padY * 2);
        const fitScale = Math.min(availW / cachedImg.naturalWidth, availH / cachedImg.naturalHeight);
        const drawW = cachedImg.naturalWidth * fitScale;
        const drawH = cachedImg.naturalHeight * fitScale;
        const drawX = padX + (availW - drawW) / 2;
        const drawY = bodyAreaY + padY + (availH - drawH) / 2;

        ctx.drawImage(cachedImg, drawX, drawY, drawW, drawH);
      } else {
        ctx.save();
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(10, bodyAreaY + 8, widthPx - 20, bodyAreaH - 16);
        ctx.strokeStyle = PALETTE.border;
        ctx.strokeRect(10, bodyAreaY + 8, widthPx - 20, bodyAreaH - 16);
        ctx.fillStyle = PALETTE.ink;
        ctx.font = '600 13px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          `Cargando fotografía asignada (${spec.fileName})...`,
          widthPx / 2,
          bodyAreaY + bodyAreaH / 2,
        );
        ctx.restore();

        preloadFigurePhoto(assignedPhotoUrl).then((img) => {
          if (img) {
            options?.onAsyncPhotoLoaded?.();
          }
        });
      }

      if (showHeader) {
        ctx.save();
        ctx.strokeStyle = PALETTE.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, widthPx - 1, heightPx - 1);
        ctx.restore();
      }
      return;
    }

    // Encuadre de cuerpo completo para zonas que no son primer plano
    const panels: Panel3DSpec[] = (spec.panels || []).map((p) =>
      forceFullBody && !CLOSEUP_ZONES.includes(p.focusZone)
        ? { ...p, focusZone: 'full_body' as FocusZone }
        : p,
    );
    const engine = getSharedEngine();

    if (!engine) {
      ctx.save();
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(8, bodyAreaY + 8, widthPx - 16, bodyAreaH - 16);
      ctx.strokeStyle = PALETTE.border;
      ctx.strokeRect(8, bodyAreaY + 8, widthPx - 16, bodyAreaH - 16);
      ctx.fillStyle = PALETTE.ink;
      ctx.font = '700 13px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Esquema Biomecánico Técnico', widthPx / 2, bodyAreaY + bodyAreaH / 2 - 8);
      ctx.font = '11px "Public Sans", system-ui, sans-serif';
      ctx.fillStyle = PALETTE.muted;
      ctx.fillText('Aceleración WebGL no disponible en este entorno', widthPx / 2, bodyAreaY + bodyAreaH / 2 + 12);
      ctx.restore();
    } else if (panels.length >= 2) {
      const nCols = panels.length;
      const colW = widthPx / nCols;
      for (let i = 0; i < nCols; i++) {
        const x0 = Math.round(i * colW);
        const x1 = i === nCols - 1 ? widthPx : Math.round((i + 1) * colW);
        const padLeft = i === 0 ? 0 : 1;
        const padRight = i === nCols - 1 ? 0 : 1;
        const pOrbit = panels[i].orbitOverride;
        const effectiveOrbit: CameraOrbitOverride = {
          azimuthDeg: (pOrbit?.azimuthDeg ?? 0) + orbitOverride.azimuthDeg,
          elevationDeg: (pOrbit?.elevationDeg ?? 0) + orbitOverride.elevationDeg,
          zoom: (pOrbit?.zoom ?? 1) * orbitOverride.zoom,
        };
        renderSingle3DPanelIntoRect(
          ctx,
          engine,
          panels[i],
          { x: x0 + padLeft, y: bodyAreaY, w: x1 - x0 - padLeft - padRight, h: bodyAreaH },
          effectiveOrbit,
          scale,
          transparentBg,
          transparentBg,
        );
      }

      if (!transparentBg) {
        ctx.save();
        ctx.strokeStyle = PALETTE.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < nCols; i++) {
          const xDiv = Math.round(i * colW);
          ctx.moveTo(xDiv, topTitleBarH);
          ctx.lineTo(xDiv, heightPx);
        }
        ctx.stroke();

        if (
          typeof options?.activePanelHighlightIdx === 'number' &&
          options.activePanelHighlightIdx >= 0 &&
          options.activePanelHighlightIdx < nCols
        ) {
          const hi = options.activePanelHighlightIdx;
          const hx0 = Math.round(hi * colW);
          const hx1 = hi === nCols - 1 ? widthPx : Math.round((hi + 1) * colW);
          ctx.fillStyle = '#2563eb';
          ctx.fillRect(hx0 + 1, bodyAreaY, hx1 - hx0 - 2, 3);
          ctx.strokeStyle = 'rgba(37, 99, 235, 0.45)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(hx0 + 1, bodyAreaY + 0.75, hx1 - hx0 - 2, bodyAreaH - 1.5);
        }
        ctx.restore();
      }
    } else if (panels.length === 1) {
      const pOrbit = panels[0].orbitOverride;
      const effectiveOrbit: CameraOrbitOverride = {
        azimuthDeg: (pOrbit?.azimuthDeg ?? 0) + orbitOverride.azimuthDeg,
        elevationDeg: (pOrbit?.elevationDeg ?? 0) + orbitOverride.elevationDeg,
        zoom: (pOrbit?.zoom ?? 1) * orbitOverride.zoom,
      };
      renderSingle3DPanelIntoRect(
        ctx,
        engine,
        panels[0],
        { x: 0, y: bodyAreaY, w: widthPx, h: bodyAreaH },
        effectiveOrbit,
        scale,
        transparentBg,
        transparentBg,
      );
    }

    if (!transparentBg) {
      ctx.save();
      ctx.strokeStyle = PALETTE.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, widthPx - 1, heightPx - 1);
      ctx.restore();
    }
  } catch (err) {
    console.error('Error rendering figure to canvas:', err);
  }
}

/**
 * Renders a BookFigureFileSpec in High-Quality 24-bit Lossless PNG (default 2x HD resolution)
 * or compact < 120 KB 1x book mode when `qualityMode = 'compact_120kb'`.
 */
export async function renderBookFigureToPng(
  spec: BookFigureFileSpec,
  orbitOverride: CameraOrbitOverride = DEFAULT_ORBIT_OVERRIDE,
  qualityMode: 'hd_lossless' | 'compact_120kb' = 'hd_lossless',
  options?: FigureRenderOptions,
): Promise<RenderedPngResult> {
  await ensureAvatarGlbLoaded();
  if (!options?.preferSynthetic3D) {
    const photoUrl = getEffectiveFigurePhotoUrl(spec);
    if (photoUrl) {
      await preloadFigurePhoto(photoUrl);
    }
  }
  const offCanvas = document.createElement('canvas');
  const dpiScale = qualityMode === 'hd_lossless' ? 2 : 1;
  renderBookFigureToCanvas(spec, offCanvas, orbitOverride, dpiScale, options);
  if (qualityMode === 'hd_lossless') {
    return exportCanvasToHighQualityPng(offCanvas);
  }
  return exportCanvasToOptimizedPng(offCanvas);
}
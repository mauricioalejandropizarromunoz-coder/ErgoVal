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
  RenderedPngResult,
  ScenePropType,
} from '../types/figurePlan';
import { renderDiagramVariant } from './diagramRenderer';
import {
  exportCanvasToHighQualityPng,
  exportCanvasToOptimizedPng,
} from './pngOptimizer';
import { getEffectiveFigurePhotoUrl } from './figurePlanCatalog';

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

  // Soft studio contact-shadow catcher plane on floor y = 0
  const shadowFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(4.5, 4.5),
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

function buildSceneProp(
  rig: GlbAvatarRig,
  prop: ScenePropType,
  isSoftwareRenderer: boolean,
): void {
  clearPropsGroup(rig.propsRoot);
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
  const pelvisWorld = new THREE.Vector3();
  rig.joints.pelvis.getWorldPosition(pelvisWorld);
  const footRWorld = new THREE.Vector3();
  rig.joints.footR.getWorldPosition(footRWorld);

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

  switch (prop) {
    case 'chair': {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.42), structMat);
      seat.position.set(0, pelvisWorld.y - 0.08, pelvisWorld.z + 0.04);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 0.04), structMat);
      back.position.set(0, pelvisWorld.y + 0.16, pelvisWorld.z - 0.16);
      const pedH = Math.max(0.18, pelvisWorld.y - 0.1);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, pedH, 16), darkMetalMat);
      ped.position.set(0, pedH / 2, pelvisWorld.z);
      const basePlate = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 20), darkMetalMat);
      basePlate.position.set(0, 0.01, pelvisWorld.z);
      addPropMesh(seat);
      addPropMesh(back);
      addPropMesh(ped);
      addPropMesh(basePlate);
      break;
    }
    case 'bus_driver_seat': {
      // Diseño automotriz real según SAE J1100 / ISO 16121 / VDV 234:
      // 1. Butaca automotriz ergonómica con pétalos laterales, inclinación antideslizamiento (-5°),
      //    respaldo reclinado (-10°), apoyacabezas de doble vástago y correderas sobre el piso.
      const seatY = pelvisWorld.y - 0.085;
      const seatZ = pelvisWorld.z + 0.065;
      const seatPan = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.45), structMat);
      seatPan.position.set(0, seatY, seatZ);
      seatPan.rotation.x = -5 * DEG2RAD;
      addPropMesh(seatPan);

      for (const bx of [-0.215, 0.215]) {
        const thighBolster = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.078, 0.43), darkMetalMat);
        thighBolster.position.set(bx, seatY + 0.022, seatZ);
        thighBolster.rotation.x = -5 * DEG2RAD;
        addPropMesh(thighBolster);
      }

      const backY = pelvisWorld.y + 0.205;
      const backZ = pelvisWorld.z - 0.175;
      const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.53, 0.055), structMat);
      backrest.position.set(0, backY, backZ);
      backrest.rotation.x = -10 * DEG2RAD;
      addPropMesh(backrest);

      for (const bx of [-0.205, 0.205]) {
        const sideBolster = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.46, 0.08), darkMetalMat);
        sideBolster.position.set(bx, backY - 0.01, backZ + 0.018);
        sideBolster.rotation.x = -10 * DEG2RAD;
        addPropMesh(sideBolster);
      }

      for (const px of [-0.065, 0.065]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.1, 10), darkMetalMat);
        post.position.set(px, pelvisWorld.y + 0.485, pelvisWorld.z - 0.222);
        post.rotation.x = -10 * DEG2RAD;
        addPropMesh(post);
      }
      const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.165, 0.065), elastomerMat);
      headrest.position.set(0, pelvisWorld.y + 0.56, pelvisWorld.z - 0.232);
      headrest.rotation.x = -6 * DEG2RAD;
      addPropMesh(headrest);

      const suspH = Math.max(0.14, seatY - 0.04);
      const suspPedestal = new THREE.Mesh(new THREE.BoxGeometry(0.26, suspH, 0.28), darkMetalMat);
      suspPedestal.position.set(0, suspH * 0.5 + 0.022, pelvisWorld.z + 0.02);
      addPropMesh(suspPedestal);

      for (const rx of [-0.155, 0.155]) {
        const slideRail = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.024, 0.48), elastomerMat);
        slideRail.position.set(rx, 0.012, pelvisWorld.z + 0.04);
        addPropMesh(slideRail);
      }

      // 2. Volante automotriz real (SAE J1100 ángulo A18 = 25° respecto a la horizontal de columna,
      //    aro verticalizado a 25° frente al pecho del conductor, centro cóncavo "dished" con módulo airbag,
      //    3 rayos anatómicos 9-3-6 y apoyos de pulgar).
      const wheelCenter = new THREE.Vector3(
        (palmR.x + palmL.x) * 0.5,
        (palmR.y + palmL.y) * 0.5,
        (palmR.z + palmL.z) * 0.5 + 0.012,
      );
      const wheelRadius = Math.max(0.165, Math.min(0.195, Math.abs(palmL.x - palmR.x) * 0.5));
      const wheelTiltRad = 25 * DEG2RAD; // Inclinación automotriz real (25° respecto a la vertical)
      const hubDishDepth = 0.036; // Profundidad cóncava del núcleo airbag respecto al plano del aro

      const wheelAssembly = new THREE.Group();
      wheelAssembly.position.copy(wheelCenter);
      wheelAssembly.rotation.x = wheelTiltRad;

      // Aro circular forrado en elastómero con engrosamientos ergonómicos en 10-2 / 9-3
      const wheelRim = new THREE.Mesh(
        new THREE.TorusGeometry(wheelRadius, 0.0175, 20, 56),
        elastomerMat,
      );
      wheelRim.castShadow = !isSoftwareRenderer;
      wheelRim.receiveShadow = !isSoftwareRenderer;
      wheelAssembly.add(wheelRim);

      for (const gripArcStart of [0.12, Math.PI - 0.54]) {
        const thumbBolster = new THREE.Mesh(
          new THREE.TorusGeometry(wheelRadius, 0.0215, 14, 18, 0.42),
          elastomerMat,
        );
        thumbBolster.rotation.z = gripArcStart;
        thumbBolster.castShadow = !isSoftwareRenderer;
        wheelAssembly.add(thumbBolster);
      }

      // Módulo central de airbag / bocina desplazado hacia adelante (+Z local) para concavidad automotriz real
      const airbagPad = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.052, 0.038, 24),
        darkMetalMat,
      );
      airbagPad.rotation.x = Math.PI / 2;
      airbagPad.position.set(0, 0, hubDishDepth);
      airbagPad.castShadow = !isSoftwareRenderer;
      wheelAssembly.add(airbagPad);

      const emblemRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.022, 0.0028, 10, 24),
        binBlueMat,
      );
      emblemRing.position.set(0, 0, hubDishDepth - 0.02);
      wheelAssembly.add(emblemRing);

      // 3 rayos automotrices esculpidos (izquierdo 9h, derecho 3h e inferior doble 6h) desde el cubo cóncavo hasta el aro
      const spokeSpan = Math.max(0.08, wheelRadius - 0.046);
      const dishAngle = Math.atan2(hubDishDepth, spokeSpan);
      const spokeLen = Math.hypot(spokeSpan, hubDishDepth);

      for (const sideSign of [-1, 1]) {
        const sideSpoke = new THREE.Mesh(
          new THREE.BoxGeometry(spokeLen, 0.026, 0.014),
          darkMetalMat,
        );
        sideSpoke.position.set(sideSign * (0.044 + spokeSpan * 0.5), -0.006, hubDishDepth * 0.5);
        sideSpoke.rotation.y = sideSign * dishAngle;
        sideSpoke.castShadow = !isSoftwareRenderer;
        wheelAssembly.add(sideSpoke);
      }

      for (const bottomOffset of [-0.018, 0.018]) {
        const bottomSpoke = new THREE.Mesh(
          new THREE.BoxGeometry(0.015, spokeLen, 0.014),
          darkMetalMat,
        );
        bottomSpoke.position.set(bottomOffset, -(0.044 + spokeSpan * 0.5), hubDishDepth * 0.5);
        bottomSpoke.rotation.x = -dishAngle;
        bottomSpoke.castShadow = !isSoftwareRenderer;
        wheelAssembly.add(bottomSpoke);
      }

      // Carcasa envolvente superior de la columna de dirección + palancas de luces/limpiaparabrisas
      const columnShroud = new THREE.Mesh(
        new THREE.CylinderGeometry(0.044, 0.056, 0.13, 18),
        darkMetalMat,
      );
      columnShroud.rotation.x = Math.PI / 2;
      columnShroud.position.set(0, 0, hubDishDepth + 0.078);
      columnShroud.castShadow = !isSoftwareRenderer;
      wheelAssembly.add(columnShroud);

      for (const stalkSign of [-1, 1]) {
        const stalk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0045, 0.006, 0.115, 10),
          elastomerMat,
        );
        stalk.rotation.z = (Math.PI / 2) - stalkSign * 0.18;
        stalk.position.set(stalkSign * 0.085, 0.014, hubDishDepth + 0.062);
        wheelAssembly.add(stalk);
      }

      rig.propsRoot.add(wheelAssembly);

      // 3. Columna telescópica proyectada hacia adelante (+Z) e inclinada -25° hacia el torpedo/tablero automotriz
      const colDir = new THREE.Vector3(
        0,
        -Math.sin(wheelTiltRad),
        Math.cos(wheelTiltRad),
      ).normalize();
      const colLen = 0.34;
      const shaftStart = wheelCenter.clone().addScaledVector(colDir, 0.12);
      const steeringShaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.026, colLen, 16),
        darkMetalMat,
      );
      steeringShaft.position.copy(shaftStart).addScaledVector(colDir, colLen * 0.5);
      steeringShaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), colDir.clone().negate());
      addPropMesh(steeringShaft);

      // 4. Tablero frontal automotriz (torpedo + visera curva de cuadro de instrumentos / velocímetro)
      const dashEntry = shaftStart.clone().addScaledVector(colDir, colLen);
      const dashFrontZ = Math.max(dashEntry.z + 0.08, footRWorld.z + 0.06);
      const dashTopY = Math.max(wheelCenter.y + 0.035, dashEntry.y + 0.16);

      const dashUpperCowl = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.16, 0.24),
        structMat,
      );
      dashUpperCowl.position.set(0, dashTopY - 0.06, dashFrontZ);
      dashUpperCowl.rotation.x = -8 * DEG2RAD;
      addPropMesh(dashUpperCowl);

      // Visera superior del cuadro de instrumentos (cúpula de relojes frente al conductor)
      const clusterHood = new THREE.Mesh(
        new THREE.CylinderGeometry(0.135, 0.145, 0.18, 20, 1, false, 0, Math.PI),
        darkMetalMat,
      );
      clusterHood.rotation.z = Math.PI / 2;
      clusterHood.rotation.y = Math.PI / 2;
      clusterHood.position.set(0, dashTopY + 0.015, dashFrontZ - 0.03);
      addPropMesh(clusterHood);

      // Pared cortafuegos (firewall) inclinada + piso de pedalera y pedales suspendidos de acelerador y freno
      const firewallH = Math.max(0.32, dashTopY - 0.12);
      const firewall = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, firewallH, 0.06),
        structMat,
      );
      firewall.position.set(0, firewallH * 0.5, dashFrontZ + 0.1);
      firewall.rotation.x = 18 * DEG2RAD;
      addPropMesh(firewall);

      const footLWorld = new THREE.Vector3();
      rig.joints.footL.getWorldPosition(footLWorld);

      // Pedal de acelerador bajo pie derecho (Ángulo C: 100°–115°) y pedal de freno junto al pie izquierdo
      const accelPad = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.014, 0.17), elastomerMat);
      accelPad.position.set(footRWorld.x, Math.max(0.042, footRWorld.y - 0.014), footRWorld.z + 0.015);
      accelPad.rotation.x = -34 * DEG2RAD;
      addPropMesh(accelPad);

      const accelArm = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.22, 10), darkMetalMat);
      accelArm.position.set(footRWorld.x, Math.max(0.15, footRWorld.y + 0.09), footRWorld.z + 0.065);
      accelArm.rotation.x = -22 * DEG2RAD;
      addPropMesh(accelArm);

      const brakePad = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.016, 0.075), elastomerMat);
      brakePad.position.set(0.02, Math.max(0.085, footLWorld.y + 0.025), footRWorld.z + 0.01);
      brakePad.rotation.x = -38 * DEG2RAD;
      addPropMesh(brakePad);
      break;
    }
    case 'work_desk_support':
    case 'office_desk_corner_monitor':
    case 'office_desk_lateral':
    case 'high_scanner_desk': {
      const deskH = prop === 'high_scanner_desk' ? 0.99 : Math.max(0.68, handWorld.y - 0.035);
      const deskW = 0.78;
      const deskD = 0.52;
      const deskZ = handWorld.z + 0.2;

      const top = new THREE.Mesh(new THREE.BoxGeometry(deskW, 0.032, deskD), structMat);
      top.position.set(0, deskH, deskZ);
      addPropMesh(top);

      if (prop === 'high_scanner_desk') {
        // Mueble cerrado de 99 cm sin hueco para piernas (Fig. 12.7) + terminal de escaneo
        const cabinetBody = new THREE.Mesh(
          new THREE.BoxGeometry(deskW - 0.04, Math.max(0.2, deskH - 0.02), deskD - 0.04),
          binBlueMat,
        );
        cabinetBody.position.set(0, (deskH - 0.02) * 0.5, deskZ + 0.01);
        addPropMesh(cabinetBody);

        const scannerScreen = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.024), darkMetalMat);
        scannerScreen.position.set(0, deskH + 0.14, deskZ + 0.1);
        scannerScreen.rotation.x = -18 * DEG2RAD;
        addPropMesh(scannerScreen);
      } else {
        // 4 patas estructurales apoyadas en suelo (y = 0) + travesaño posterior para realismo físico
        const legH = Math.max(0.2, deskH - 0.016);
        for (const [lx, lz] of [
          [-deskW * 0.44, deskZ - deskD * 0.42],
          [deskW * 0.44, deskZ - deskD * 0.42],
          [-deskW * 0.44, deskZ + deskD * 0.42],
          [deskW * 0.44, deskZ + deskD * 0.42],
        ]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.036, legH, 0.036), darkMetalMat);
          leg.position.set(lx, legH * 0.5, lz);
          addPropMesh(leg);
        }
        const rearCrossbar = new THREE.Mesh(new THREE.BoxGeometry(deskW - 0.08, 0.03, 0.03), darkMetalMat);
        rearCrossbar.position.set(0, 0.18, deskZ + deskD * 0.42);
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
      const midX = (palmR.x + palmL.x) * 0.5;
      const midY = Math.max(0.115, (palmR.y + palmL.y) * 0.5);
      const midZ = Math.max(palmR.z, palmL.z) + 0.045;
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.22, 0.26), loadMat);
      box.position.set(midX, midY, midZ);
      addPropMesh(box);
      break;
    }
    case 'pallet_cooler': {
      const midX = (palmR.x + palmL.x) * 0.5;
      const midY = Math.max(0.24, (palmR.y + palmL.y) * 0.5);
      const midZ = Math.max(palmR.z, palmL.z) + 0.06;

      // Nevera térmica de pedidos (40x50x50 cm escalada proporcionalmente + tapa aislante)
      const coolerBody = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.26, 0.3), binBlueMat);
      coolerBody.position.set(midX, midY - 0.01, midZ);
      const coolerLid = new THREE.Mesh(new THREE.BoxGeometry(0.365, 0.04, 0.315), darkMetalMat);
      coolerLid.position.set(midX, midY + 0.13, midZ);
      addPropMesh(coolerBody);
      addPropMesh(coolerLid);

      // Pallet industrial de madera/plástico apoyado a ras de suelo (y = 0..0.12 m)
      const palletTop = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.028, 0.54), loadMat);
      palletTop.position.set(0, 0.106, midZ + 0.02);
      addPropMesh(palletTop);
      for (const sx of [-0.26, 0, 0.26]) {
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.092, 0.54), darkMetalMat);
        block.position.set(sx, 0.046, midZ + 0.02);
        addPropMesh(block);
      }
      break;
    }
    case 'bin_to_cart': {
      // Fig. 12.3: Operador extrayendo bulto de 10 kg desde el interior de un contenedor BIN hacia un CARRO plataforma
      const midX = (palmR.x + palmL.x) * 0.5;
      const midY = Math.max(0.34, (palmR.y + palmL.y) * 0.5);
      const midZ = Math.max(palmR.z, palmL.z) + 0.045;

      // 1. Bulto de 10 kg sujetado bimanualmente en plena extracción desde el interior del bin
      const activeParcel = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.19, 0.24), loadMat);
      activeParcel.position.set(midX, midY, midZ);
      addPropMesh(activeParcel);

      // 2. Contenedor industrial BIN (con pared derecha -X rebajada en corte técnico para ver manos y bultos en el interior)
      const binZ = midZ + 0.03;
      const binW = 0.62;
      const binD = 0.52;
      const wallT = 0.028;

      const binSkid = new THREE.Mesh(new THREE.BoxGeometry(binW, 0.09, binD), darkMetalMat);
      binSkid.position.set(0, 0.045, binZ);
      addPropMesh(binSkid);

      // Pared frontal alejada del operador (+Z), pared posterior próxima (-Z, rebajada bajo antebrazos), pared izquierda (+X) y corte derecho (-X)
      const binFrontWall = new THREE.Mesh(new THREE.BoxGeometry(binW, 0.58, wallT), binBlueMat);
      binFrontWall.position.set(0, 0.09 + 0.29, binZ + binD * 0.5 - wallT * 0.5);
      addPropMesh(binFrontWall);

      const nearWallH = Math.max(0.28, Math.min(0.46, midY - 0.1));
      const binNearWall = new THREE.Mesh(new THREE.BoxGeometry(binW, nearWallH, wallT), binBlueMat);
      binNearWall.position.set(0, 0.09 + nearWallH * 0.5, binZ - binD * 0.5 + wallT * 0.5);
      addPropMesh(binNearWall);

      const binLeftWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, 0.58, binD), binBlueMat);
      binLeftWall.position.set(binW * 0.5 - wallT * 0.5, 0.09 + 0.29, binZ);
      addPropMesh(binLeftWall);

      const binRightCutaway = new THREE.Mesh(new THREE.BoxGeometry(wallT, 0.2, binD), binBlueMat);
      binRightCutaway.position.set(-binW * 0.5 + wallT * 0.5, 0.09 + 0.1, binZ);
      addPropMesh(binRightCutaway);

      // Bulto remanente en el fondo del bin para evidenciar extracción interna
      const innerParcel = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.2), loadMat);
      innerParcel.position.set(0.1, 0.17, binZ + 0.1);
      addPropMesh(innerParcel);

      // 3. Carro plataforma receptor (cota de depósito V₂ ≈ 35 cm según apartado 12.4.2 / Fig. 12.4)
      const cartX = 0.22;
      const cartZ = binZ + 0.56;
      const cartDeckY = 0.33;
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

      // Baranda/asa tubular del carro receptor + bulto ya depositado sobre el carro
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

      const cartParcel = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.22), loadMat);
      cartParcel.position.set(cartX, cartDeckY + 0.11, cartZ - 0.04);
      addPropMesh(cartParcel);
      break;
    }
    case 'floor_pouches': {
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.22), loadMat);
      pouch.position.set(0, Math.max(0.06, handWorld.y - 0.04), handWorld.z + 0.06);
      addPropMesh(pouch);
      break;
    }
    case 'electrical_panel':
    case 'cold_room_high_shelf': {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.55, 0.18), structMat);
      cab.position.set(0, 0.82, handWorld.z + 0.18);
      addPropMesh(cab);
      if (prop === 'cold_room_high_shelf') {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.24), loadMat);
        crate.position.set(0, handWorld.y + 0.04, handWorld.z + 0.08);
        addPropMesh(crate);
      }
      break;
    }
    case 'trench_shovel': {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.15, 14), structMat);
      shaft.position.set(-0.08, handWorld.y - 0.25, handWorld.z + 0.18);
      shaft.rotation.x = 0.65;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.02), loadMat);
      blade.position.set(-0.08, Math.max(0.08, handWorld.y - 0.68), handWorld.z + 0.52);
      blade.rotation.x = 0.65;
      addPropMesh(shaft);
      addPropMesh(blade);
      break;
    }
    case 'iron_tamper_low':
    case 'iron_tamper_high': {
      const barY = prop === 'iron_tamper_high' ? handWorld.y - 0.35 : handWorld.y - 0.42;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.05, 14), structMat);
      bar.position.set(0, Math.max(0.52, barY), handWorld.z + 0.05);
      const basePlate = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.24), loadMat);
      basePlate.position.set(0, Math.max(0.025, barY - 0.52), handWorld.z + 0.05);
      addPropMesh(bar);
      addPropMesh(basePlate);
      break;
    }
    case 'crane_levers': {
      const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.28), structMat);
      consoleBox.position.set(0, 0.42, handWorld.z + 0.12);
      const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 12), loadMat);
      lever.position.set(-0.08, 0.78, handWorld.z + 0.06);
      lever.rotation.x = -0.35;
      addPropMesh(consoleBox);
      addPropMesh(lever);
      break;
    }
    case 'cart_push_dynamo':
    case 'cart_pull_dynamo': {
      const cart = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.68), structMat);
      cart.position.set(0, 0.46, handWorld.z + 0.44);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 14), loadMat);
      handle.rotation.z = Math.PI / 2;
      handle.position.set(0, handWorld.y, handWorld.z + 0.08);
      addPropMesh(cart);
      addPropMesh(handle);
      break;
    }
    case 'loading_dock_van': {
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.5), structMat);
      step.position.set(0, 0.21, 0.55);
      addPropMesh(step);
      break;
    }
    case 'conveyor_veg_line': {
      // Línea de cinta transportadora industrial (Caso Verduras / OCRA industria alimenticia)
      const beltY = 0.86;
      const beltZ = Math.max(0.36, Math.max(palmR.z, palmL.z) + 0.18);
      const beltFrame = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.07, 0.48), structMat);
      beltFrame.position.set(0, beltY, beltZ);
      addPropMesh(beltFrame);

      const beltSurface = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.018, 0.4), elastomerMat);
      beltSurface.position.set(0, beltY + 0.042, beltZ);
      addPropMesh(beltSurface);

      for (const lx of [-0.48, 0.48]) {
        for (const lz of [beltZ - 0.19, beltZ + 0.19]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, beltY, 12), darkMetalMat);
          leg.position.set(lx, beltY * 0.5, lz);
          addPropMesh(leg);
        }
      }

      // Cajas agrícolas sobre la línea + bandeja/caja en manipulación
      const crateSide = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.24), binBlueMat);
      crateSide.position.set(0.34, beltY + 0.12, beltZ);
      addPropMesh(crateSide);

      const heldCrate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.24), loadMat);
      heldCrate.position.set(
        (palmR.x + palmL.x) * 0.5,
        Math.max(0.14, (palmR.y + palmL.y) * 0.5),
        Math.max(palmR.z, palmL.z) + 0.04,
      );
      addPropMesh(heldCrate);
      break;
    }
    case 'hopper_sack_pour': {
      // Tolva de formulación industrial PFM (vaciado de sacos en boca de carga a ~98 cm)
      const hopperZ = Math.max(0.42, Math.max(palmR.z, palmL.z) + 0.22);
      const rimY = 0.98;
      const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.13, 0.42, 20), structMat);
      funnel.position.set(0, rimY - 0.21, hopperZ);
      addPropMesh(funnel);

      const hopperRim = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.018, 12, 28), darkMetalMat);
      hopperRim.rotation.x = Math.PI / 2;
      hopperRim.position.set(0, rimY, hopperZ);
      addPropMesh(hopperRim);

      const lowerChute = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.56, 16), binBlueMat);
      lowerChute.position.set(0, 0.28, hopperZ);
      addPropMesh(lowerChute);

      for (const [lx, lz] of [
        [-0.24, hopperZ - 0.22],
        [0.24, hopperZ - 0.22],
        [-0.24, hopperZ + 0.22],
        [0.24, hopperZ + 0.22],
      ]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, rimY - 0.04, 10), darkMetalMat);
        leg.position.set(lx, (rimY - 0.04) * 0.5, lz);
        addPropMesh(leg);
      }

      // Saco de materia prima sostenido bimanualmente
      const sack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.19, 0.25), loadMat);
      sack.position.set(
        (palmR.x + palmL.x) * 0.5,
        Math.max(0.12, (palmR.y + palmL.y) * 0.5),
        Math.max(palmR.z, palmL.z) + 0.045,
      );
      sack.rotation.x = palmR.y > 0.85 ? 24 * DEG2RAD : 0;
      addPropMesh(sack);
      break;
    }
    case 'pallet_jack_rack': {
      // Tarima/pallet industrial en piso + estantería de almacén + caja bimanual (Casos MMC Almacén)
      const rackZ = 0.56;
      const pallet = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.12, 0.48), structMat);
      pallet.position.set(0, 0.06, 0.34);
      addPropMesh(pallet);

      // Estantería frontal de estiba (niveles a 1.05 m y 1.52 m)
      for (const [px, pz] of [
        [-0.36, rackZ - 0.14],
        [0.36, rackZ - 0.14],
        [-0.36, rackZ + 0.16],
        [0.36, rackZ + 0.16],
      ]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.032, 1.68, 0.032), darkMetalMat);
        post.position.set(px, 0.84, pz);
        addPropMesh(post);
      }
      for (const shelfY of [1.06, 1.54]) {
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.03, 0.32), binBlueMat);
        shelf.position.set(0, shelfY, rackZ + 0.01);
        addPropMesh(shelf);
      }

      const heldBox = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.22, 0.26), loadMat);
      heldBox.position.set(
        (palmR.x + palmL.x) * 0.5,
        Math.max(0.13, (palmR.y + palmL.y) * 0.5),
        Math.max(palmR.z, palmL.z) + 0.045,
      );
      addPropMesh(heldBox);
      break;
    }
  }
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

  const intRotR = pose.forearmRCrossMidline
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
    makeCharEulerQuat(-compensatedShLFlexDeg * DEG2RAD, 0, shLAbdDeg * DEG2RAD, 'ZXY'),
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
    pose.prop === 'pallet_jack_rack';

  const effectivePronoRDeg = autoPalmDownWristView
    ? 88
    : isBimanualBoxLikeProp && Math.abs(pose.forearmRPronationDeg) < 1
      ? 20
      : pose.prop === 'bus_driver_seat' && Math.abs(pose.forearmRPronationDeg) < 1
        ? 18
        : pose.forearmRPronationDeg;

  const isSymmetricForearmProp =
    isBimanualBoxLikeProp ||
    pose.prop === 'bus_driver_seat' ||
    pose.prop === 'cart_push_dynamo' ||
    pose.prop === 'cart_pull_dynamo' ||
    pose.prop === 'office_desk_lateral' ||
    pose.prop === 'work_desk_support';

  const effectivePronoLDeg = isSymmetricForearmProp ? -effectivePronoRDeg : 0;

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
    makeCharEulerQuat(0, 0, -(pose.wristLFlexionDeg ?? 0) * DEG2RAD, 'ZXY'),
  );

  // 6. Dedos de la Mano (Thumb + Index, Middle, Ring, Pinky)
  const gripMode =
    pose.handGripMode ||
    (pose.prop && propUsesGrip(pose.prop) ? 'power_grip' : 'relaxed');

  if (focusZone === 'wrist_hand' && !pose.handGripMode) {
    curlHandFingers(rig, 'Right', 0.08, 0.06, 0.10);
    curlHandFingers(rig, 'Left', 0.16, 0.14, 0.16);
  } else if (gripMode === 'pinch') {
    curlHandFingers(rig, 'Right', 0.55, 0.65, 0.52);
    curlHandFingers(rig, 'Left', 0.18, 0.16, 0.18);
  } else if (gripMode === 'power_grip') {
    curlHandFingers(rig, 'Right', 0.85, 0.95, 0.58);
    curlHandFingers(rig, 'Left', 0.85, 0.95, 0.58);
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

  // 8. Apoyo Podal / de Rodillas sobre el Suelo del Estudio (y = 0)
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

  buildSceneProp(rig, pose.prop || 'none', isSoftwareRenderer);
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
      // Admite 2 a 4 paneles en columnas iguales (con 2 paneles el resultado es idéntico al anterior).
      const nCols = Math.min(panels.length, 4);
      const colW = Math.floor(widthPx / nCols);
      for (let i = 0; i < nCols; i++) {
        const x0 = i * colW + (i > 0 ? 1 : 0);
        const x1 = i === nCols - 1 ? widthPx : (i + 1) * colW - 1;
        renderSingle3DPanelIntoRect(
          ctx,
          engine,
          panels[i],
          { x: x0, y: bodyAreaY, w: x1 - x0, h: bodyAreaH },
          orbitOverride,
          scale,
          transparentBg,
          transparentBg,
        );
      }

      if (!transparentBg) {
        ctx.save();
        ctx.strokeStyle = PALETTE.border;
        ctx.lineWidth = 1;
        for (let i = 1; i < nCols; i++) {
          ctx.beginPath();
          ctx.moveTo(i * colW, topTitleBarH);
          ctx.lineTo(i * colW, heightPx);
          ctx.stroke();
        }
        ctx.restore();
      }
    } else if (panels.length === 1) {
      renderSingle3DPanelIntoRect(
        ctx,
        engine,
        panels[0],
        { x: 0, y: bodyAreaY, w: widthPx, h: bodyAreaH },
        orbitOverride,
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
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

export const AVATAR_GLB_URL = '/models/ergo_avatar-1.glb';

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
/** Encuadre de cuerpo completo por defecto (como las fotos de referencia). */
const DEFAULT_FORCE_FULL_BODY = true;

/**
 * Pose relajada de base: si un valor de abducción/flexión de codo viene en 0,
 * se usa un mínimo natural, y de pie se adelanta una pierna.
 * Ponlo en false si necesitas ángulos exactos sin ningún offset.
 */
const NATURAL_REST_POSE = true;
const REST_SHOULDER_ABDUCTION_DEG = 7;
const REST_ELBOW_FLEXION_DEG = 10;

/** Campo de visión de la cámara en perspectiva (grados). Menor = más "fotográfico". */
const PERSPECTIVE_FOV_DEG = 32;

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

/** Zonas de primer plano que NO deben forzarse a cuerpo completo. */
const CLOSEUP_ZONES: FocusZone[] = ['wrist_hand', 'ankle_foot', 'legs_knees', 'full_body'];

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
  legs_knees: [
    'pelvis',
    'thigh_r',
    'shank_r',
    'foot_r',
    'thigh_l',
    'shank_l',
    'foot_l',
  ],
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
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 12;
    keyLight.shadow.camera.left = -1.8;
    keyLight.shadow.camera.right = 1.8;
    keyLight.shadow.camera.top = 2.4;
    keyLight.shadow.camera.bottom = -0.4;
    keyLight.shadow.bias = -0.0003;
    keyLight.shadow.normalBias = 0.018;
    // `radius` solo tiene efecto con PCFShadowMap (no con PCFSoftShadowMap)
    keyLight.shadow.radius = 4;
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
      };
      // Mixamo: "mixamorigHips" o "mixamorig:Hips" -> "Hips"
      const clean = bone.name.replace(/^mixamorig[:_]?/i, '');
      rig.bones.set(bone.name, entry);
      rig.bones.set(clean, entry);
      // Mixamo usa HandIndex1/2 donde el código espera HandFingers1/2
      const finger = clean.match(/^(Left|Right)HandIndex(\d)$/);
      if (finger) rig.bones.set(`${finger[1]}HandFingers${finger[2]}`, entry);
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
      stdMat.envMapIntensity = 0.5;
      stdMat.needsUpdate = true;
      sm.material = stdMat;

      rig.skinnedMeshes.push(sm);
      rig.baseMaterials.set(sm, stdMat);

      // Subtle clinical group tint materials ONLY used when figure 4.2 requests RULA Group A/B highlight
      const matA = stdMat.clone();
      matA.emissive = new THREE.Color(0x0284c7);
      matA.emissiveIntensity = 0.14;
      rig.groupATintMaterials.set(sm, matA);

      const matB = stdMat.clone();
      matB.emissive = new THREE.Color(0xea580c);
      matB.emissiveIntensity = 0.12;
      rig.groupBTintMaterials.set(sm, matB);

      // Map named avatar meshes to anatomical segment groups for isolated views
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
        rig.segmentMeshes.thorax.push(sm);
      }
    } else if ((obj as THREE.Mesh).isMesh) {
      const m = obj as THREE.Mesh;
      m.castShadow = !isSoftwareRenderer;
      m.receiveShadow = !isSoftwareRenderer;
    }
  });

  rig.avatarContainer.add(gltfScene);

  // Map JointKeys directly to the GLB's THREE.Bone hierarchy for exact 2D goniometric projection & prop placement
  const boneOrFallback = (boneName: string): THREE.Object3D =>
    rig.bones.get(boneName)?.bone || gltfScene;

  rig.joints = {
    pelvis: boneOrFallback('Hips'),
    l5s1: boneOrFallback('Spine'),
    t12: boneOrFallback('Spine1'),
    c7: boneOrFallback('Neck'),
    head: boneOrFallback('Head'),
    shoulderR: boneOrFallback('RightArm'),
    elbowR: boneOrFallback('RightForeArm'),
    wristR: boneOrFallback('RightHand'),
    handR: boneOrFallback('RightHandFingers1'),
    shoulderL: boneOrFallback('LeftArm'),
    elbowL: boneOrFallback('LeftForeArm'),
    wristL: boneOrFallback('LeftHand'),
    handL: boneOrFallback('LeftHandFingers1'),
    hipR: boneOrFallback('RightUpLeg'),
    kneeR: boneOrFallback('RightLeg'),
    ankleR: boneOrFallback('RightFoot'),
    footR: boneOrFallback('RightToeBase'),
    hipL: boneOrFallback('LeftUpLeg'),
    kneeL: boneOrFallback('LeftLeg'),
    ankleL: boneOrFallback('LeftFoot'),
    footL: boneOrFallback('LeftToeBase'),
  };

  rig.avatarContainer.updateMatrixWorld(true);
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
  const loadMat = new THREE.MeshStandardMaterial({
    color: PALETTE.propLoadHex,
    roughness: 0.72,
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
  const pelvisWorld = new THREE.Vector3();
  rig.joints.pelvis.getWorldPosition(pelvisWorld);

  switch (prop) {
    case 'chair':
    case 'bus_driver_seat': {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.42), structMat);
      seat.position.set(0, pelvisWorld.y - 0.08, pelvisWorld.z + 0.04);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 0.04), structMat);
      back.position.set(0, pelvisWorld.y + 0.16, pelvisWorld.z - 0.16);
      const pedH = Math.max(0.18, pelvisWorld.y - 0.1);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, pedH, 16), structMat);
      ped.position.set(0, pedH / 2, pelvisWorld.z);
      addPropMesh(seat);
      addPropMesh(back);
      addPropMesh(ped);
      if (prop === 'bus_driver_seat') {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.016, 12, 24), loadMat);
        wheel.rotation.x = Math.PI / 3;
        wheel.position.set(0, pelvisWorld.y + 0.25, pelvisWorld.z + 0.42);
        addPropMesh(wheel);
      }
      break;
    }
    case 'work_desk_support':
    case 'office_desk_corner_monitor':
    case 'office_desk_lateral':
    case 'high_scanner_desk': {
      const deskH = prop === 'high_scanner_desk' ? 1.04 : Math.max(0.55, handWorld.y - 0.03);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.03, 0.52), structMat);
      top.position.set(0, deskH, handWorld.z + 0.16);
      addPropMesh(top);
      if (prop === 'office_desk_corner_monitor' || prop === 'office_desk_lateral') {
        const mon = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.025), loadMat);
        mon.position.set(
          prop === 'office_desk_corner_monitor' ? -0.22 : 0,
          deskH + 0.22,
          handWorld.z + 0.3,
        );
        if (prop === 'office_desk_corner_monitor') mon.rotation.y = 0.55;
        addPropMesh(mon);
      }
      break;
    }
    case 'box_load':
    case 'pallet_cooler':
    case 'bin_to_cart': {
      const midX = (handWorld.x + handLWorld.x) * 0.5;
      const midY = (handWorld.y + handLWorld.y) * 0.5;
      const midZ = Math.max(handWorld.z, handLWorld.z);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.22, 0.26), loadMat);
      box.position.set(midX * 0.4, midY + 0.03, midZ + 0.09);
      addPropMesh(box);
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
  }
}

// ============================================================================
// BIOMECHANICAL JOINT ROTATION MAPPING ONTO GLB THREE.BONES
// ============================================================================
const _deltaEuler = new THREE.Euler();
const _deltaQuat = new THREE.Quaternion();
const _tmpWorldVec = new THREE.Vector3();

function setBoneDeltaEuler(
  rig: GlbAvatarRig,
  boneName: string,
  rxRad: number,
  ryRad: number,
  rzRad: number,
  order: THREE.EulerOrder = 'XYZ',
): void {
  const entry = rig.bones.get(boneName);
  if (!entry) return;
  _deltaEuler.set(rxRad, ryRad, rzRad, order);
  _deltaQuat.setFromEuler(_deltaEuler);
  entry.bone.quaternion.copy(entry.restQuat).multiply(_deltaQuat);
}

function resetAllBonesToRest(rig: GlbAvatarRig): void {
  rig.bones.forEach((entry) => {
    entry.bone.position.copy(entry.restPos);
    entry.bone.quaternion.copy(entry.restQuat);
  });
}

function applyPoseToGlbBones(
  engine: StudioEngine3D,
  panel: Panel3DSpec,
): void {
  const { rig, isSoftwareRenderer } = engine;
  if (!rig.isReady) return;

  const { pose, focusZone } = panel;
  resetAllBonesToRest(rig);

  // Pose relajada: si el valor viene en 0 se usa un mínimo natural (evita brazos rígidos)
  const rest = (value: number, fallback: number): number =>
    NATURAL_REST_POSE && Math.abs(value) < 0.01 ? fallback : value;

  const shRAbdDeg = rest(pose.shoulderRAbductionDeg, REST_SHOULDER_ABDUCTION_DEG);
  const shLAbdDeg = rest(pose.shoulderLAbductionDeg, REST_SHOULDER_ABDUCTION_DEG);
  const elbRFlexDeg = rest(pose.elbowRFlexionDeg, REST_ELBOW_FLEXION_DEG);
  const elbLFlexDeg = rest(pose.elbowLFlexionDeg, REST_ELBOW_FLEXION_DEG);

  // De pie y sin ninguna flexión de piernas: adelantar levemente la pierna izquierda
  const isStanding = pose.stanceMode !== 'seated' && pose.stanceMode !== 'kneeling';
  const legsAtRest =
    Math.abs(pose.hipRFlexionDeg) < 0.01 &&
    Math.abs(pose.hipLFlexionDeg) < 0.01 &&
    Math.abs(pose.kneeRFlexionDeg) < 0.01 &&
    Math.abs(pose.kneeLFlexionDeg) < 0.01;
  const stepLegs = NATURAL_REST_POSE && isStanding && legsAtRest;
  const hipRDeg = stepLegs ? -3 : pose.hipRFlexionDeg;
  const hipLDeg = stepLegs ? 6 : pose.hipLFlexionDeg;
  const kneeRDeg = pose.kneeRFlexionDeg;
  const kneeLDeg = stepLegs ? 4 : pose.kneeLFlexionDeg;

  // 1. Trunk & Lumbar/Thoracic Spine (Spine + Spine1)
  const trunkFlex = pose.trunkFlexionDeg * DEG2RAD;
  const trunkLat = pose.trunkLateralDeg * DEG2RAD;
  const trunkTwist = pose.trunkTwistDeg * DEG2RAD;

  setBoneDeltaEuler(rig, 'Spine', trunkFlex * 0.58, -trunkTwist * 0.45, trunkLat * 0.58, 'YXZ');
  setBoneDeltaEuler(rig, 'Spine1', trunkFlex * 0.42, -trunkTwist * 0.55, trunkLat * 0.42, 'YXZ');

  // 2. Cervical Spine & Head (Neck + Head)
  const neckFlex = pose.neckFlexionDeg * DEG2RAD;
  const neckLat = pose.neckLateralDeg * DEG2RAD;
  const neckTwist = pose.neckTwistDeg * DEG2RAD;

  setBoneDeltaEuler(rig, 'Neck', neckFlex * 0.74, -neckTwist * 0.65, neckLat * 0.72, 'YXZ');
  setBoneDeltaEuler(rig, 'Head', neckFlex * 0.26, -neckTwist * 0.35, neckLat * 0.28, 'YXZ');

  // 3. Clavicular / Scapular Girdle + Glenohumeral Shoulders
  const rShEntry = rig.bones.get('RightShoulder');
  if (rShEntry) {
    rShEntry.bone.position.set(
      rShEntry.restPos.x,
      rShEntry.restPos.y + (pose.shoulderRElevated ? 0.032 : 0),
      rShEntry.restPos.z,
    );
  }
  const scapUpR = Math.max(0, Math.max(pose.shoulderRFlexionDeg, shRAbdDeg) - 55) * 0.16 * DEG2RAD;
  const scapUpL = Math.max(0, Math.max(pose.shoulderLFlexionDeg, shLAbdDeg) - 55) * 0.16 * DEG2RAD;
  setBoneDeltaEuler(rig, 'RightShoulder', 0, 0, -scapUpR);
  setBoneDeltaEuler(rig, 'LeftShoulder', 0, 0, scapUpL);

  const crossMidR = pose.forearmRCrossMidline ? 26 * DEG2RAD : 0;
  setBoneDeltaEuler(
    rig,
    'RightArm',
    -(pose.shoulderRFlexionDeg * DEG2RAD) * 0.92,
    crossMidR,
    -(shRAbdDeg * DEG2RAD) * 0.92 + (pose.forearmRCrossMidline ? 0.30 : 0),
    'ZXY',
  );
  setBoneDeltaEuler(
    rig,
    'LeftArm',
    -(pose.shoulderLFlexionDeg * DEG2RAD) * 0.92,
    0,
    (shLAbdDeg * DEG2RAD) * 0.92,
    'ZXY',
  );

  // 4. Elbow Flexion & Distributed Forearm Pronation/Supination
  const pronoR = pose.forearmRPronationDeg * DEG2RAD;
  setBoneDeltaEuler(rig, 'RightForeArm', -elbRFlexDeg * DEG2RAD, pronoR * 0.35, 0, 'XYZ');
  setBoneDeltaEuler(rig, 'RightForeArmTwist', 0, pronoR * 0.65, 0, 'XYZ');

  setBoneDeltaEuler(rig, 'LeftForeArm', -elbLFlexDeg * DEG2RAD, 0, 0, 'XYZ');
  setBoneDeltaEuler(rig, 'LeftForeArmTwist', 0, 0, 0, 'XYZ');

  // 5. Wrist Flexion/Extension & Radial/Ulnar Deviation
  setBoneDeltaEuler(
    rig,
    'RightHand',
    pose.wristRFlexionDeg * DEG2RAD,
    0,
    pose.wristRDeviationDeg * DEG2RAD,
    'XYZ',
  );
  setBoneDeltaEuler(rig, 'LeftHand', (pose.wristLFlexionDeg ?? 0) * DEG2RAD, 0, 0, 'XYZ');

  // 6. Articulated Hand Grip (Thumb + Fingers Bones)
  const gripMode =
    pose.handGripMode ||
    (pose.prop && propUsesGrip(pose.prop) ? 'power_grip' : 'relaxed');

  if (gripMode === 'pinch') {
    setBoneDeltaEuler(rig, 'RightHandThumb1', -0.45, 0.12, 0.38);
    setBoneDeltaEuler(rig, 'RightHandThumb2', -0.25, 0, 0.35);
    setBoneDeltaEuler(rig, 'RightHandFingers1', 0, 0, 0.62);
    setBoneDeltaEuler(rig, 'RightHandFingers2', 0, 0, 0.72);
  } else if (gripMode === 'power_grip') {
    setBoneDeltaEuler(rig, 'RightHandThumb1', -0.42, 0.15, 0.45);
    setBoneDeltaEuler(rig, 'RightHandThumb2', -0.22, 0, 0.42);
    setBoneDeltaEuler(rig, 'RightHandFingers1', 0, 0, 0.92);
    setBoneDeltaEuler(rig, 'RightHandFingers2', 0, 0, 1.05);
    setBoneDeltaEuler(rig, 'LeftHandThumb1', -0.42, -0.15, -0.45);
    setBoneDeltaEuler(rig, 'LeftHandThumb2', -0.22, 0, -0.42);
    setBoneDeltaEuler(rig, 'LeftHandFingers1', 0, 0, -0.92);
    setBoneDeltaEuler(rig, 'LeftHandFingers2', 0, 0, -1.05);
  } else {
    setBoneDeltaEuler(rig, 'RightHandThumb1', -0.14, 0, 0.12);
    setBoneDeltaEuler(rig, 'RightHandThumb2', -0.08, 0, 0.10);
    setBoneDeltaEuler(rig, 'RightHandFingers1', 0, 0, 0.18);
    setBoneDeltaEuler(rig, 'RightHandFingers2', 0, 0, 0.16);
    setBoneDeltaEuler(rig, 'LeftHandThumb1', -0.14, 0, -0.12);
    setBoneDeltaEuler(rig, 'LeftHandThumb2', -0.08, 0, -0.10);
    setBoneDeltaEuler(rig, 'LeftHandFingers1', 0, 0, -0.18);
    setBoneDeltaEuler(rig, 'LeftHandFingers2', 0, 0, -0.16);
  }

  // 7. Lower Limbs (Hips, Knees, Ankles)
  setBoneDeltaEuler(rig, 'RightUpLeg', -hipRDeg * DEG2RAD, 0, 0);
  setBoneDeltaEuler(rig, 'RightLeg', kneeRDeg * DEG2RAD, 0, 0);
  setBoneDeltaEuler(rig, 'RightFoot', -pose.ankleRDorsiflexionDeg * DEG2RAD, 0, 0);

  setBoneDeltaEuler(rig, 'LeftUpLeg', -hipLDeg * DEG2RAD, 0, 0);
  setBoneDeltaEuler(rig, 'LeftLeg', kneeLDeg * DEG2RAD, 0, 0);
  setBoneDeltaEuler(rig, 'LeftFoot', -pose.ankleLDorsiflexionDeg * DEG2RAD, 0, 0);

  // 8. Grounding Pelvis Height on Studio Floor (y = 0)
  const hipsEntry = rig.bones.get('Hips');
  if (hipsEntry) {
    rig.avatarContainer.updateMatrixWorld(true);
    if (pose.stanceMode === 'seated') {
      hipsEntry.bone.position.set(0, 0.56, 0);
    } else {
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
        // Foot sole thickness below RightToeBase is ~0.014m
        const desiredLowestJointY = 0.014;
        const deltaY = desiredLowestJointY - minJointY;
        hipsEntry.bone.position.set(0, hipsEntry.restPos.y + deltaY, 0);
      }
    }
  }

  rig.avatarContainer.updateMatrixWorld(true);

  // 9. Update Segment Visibility & Material State
  const activeSegments = new Set<SegmentGroupKey>(FOCUS_ZONE_SEGMENTS[focusZone]);
  const visibleMeshSet = new Set<THREE.SkinnedMesh>();
  (Object.keys(rig.segmentMeshes) as SegmentGroupKey[]).forEach((segKey) => {
    if (activeSegments.has(segKey)) {
      for (const sm of rig.segmentMeshes[segKey]) {
        visibleMeshSet.add(sm);
      }
    }
  });

  const isRulaGroups = pose.highlightGroup === 'rula_groups';
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
    focusZone === 'full_body' || focusZone === 'legs_knees' || focusZone === 'ankle_foot';

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
  if (focusZone === 'full_body') {
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
      const s = new THREE.Vector3();
      meshBox.getCenter(c);
      meshBox.getSize(s);
      return { center: c, halfExtent: Math.max(0.6, Math.max(s.x, s.y, s.z) * 0.54) };
    }
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

  const glScale = engine.isSoftwareRenderer ? Math.max(1, dpiScale) : Math.max(2, dpiScale * 1.5);
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
      const halfW = Math.floor(widthPx / 2);
      renderSingle3DPanelIntoRect(
        ctx,
        engine,
        panels[0],
        { x: 0, y: bodyAreaY, w: halfW - 1, h: bodyAreaH },
        orbitOverride,
        scale,
        transparentBg,
        transparentBg,
      );
      renderSingle3DPanelIntoRect(
        ctx,
        engine,
        panels[1],
        { x: halfW + 1, y: bodyAreaY, w: widthPx - halfW - 1, h: bodyAreaH },
        orbitOverride,
        scale,
        transparentBg,
        transparentBg,
      );

      if (!transparentBg) {
        ctx.save();
        ctx.strokeStyle = PALETTE.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(halfW, topTitleBarH);
        ctx.lineTo(halfW, heightPx);
        ctx.stroke();
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
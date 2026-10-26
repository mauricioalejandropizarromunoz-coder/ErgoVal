import * as THREE from 'three';
import {
  BookFigureFileSpec,
  CameraPreset,
  FocusZone,
  JointKey,
  Panel3DSpec,
  RenderedPngResult,
} from '../types/figurePlan';
import {
  exportCanvasToHighQualityPng,
  exportCanvasToOptimizedPng,
} from './pngOptimizer';

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
}

export const DEFAULT_ORBIT_OVERRIDE: CameraOrbitOverride = {
  azimuthDeg: 0,
  elevationDeg: 0,
  zoom: 1.0,
};

const DEG2RAD = Math.PI / 180;
const PALETTE = { bgHex: 0xffffff, ink: '#0f172a', muted: '#64748b' };

interface GlbAvatarRig {
  avatarContainer: THREE.Group;
  propsRoot: THREE.Group;
  bones: Map<string, any>;
  joints: Record<JointKey, THREE.Object3D>;
  skinnedMeshes: THREE.SkinnedMesh[];
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

export function isAvatarGlbReady(): boolean {
  return Boolean(sharedEngine?.rig.isReady);
}

export function subscribeAvatarGlbloaded(_callback: () => void): () => void {
  if (isAvatarGlbReady()) {
    try { _callback(); } catch {}
  }
  return () => {};
}

export function subscribeAvatarGlbLoaded(callback: () => void): () => void {
  return subscribeAvatarGlbloaded(callback);
}

function createPlaceholderJoints(parent: THREE.Group): Record<JointKey, THREE.Object3D> {
  const keys: JointKey[] = [
    'pelvis', 'l5s1', 't12', 'c7', 'head',
    'shoulderR', 'elbowR', 'wristR', 'handR',
    'shoulderL', 'elbowL', 'wristL', 'handL',
    'hipR', 'kneeR', 'ankleR', 'footR',
    'hipL', 'kneeL', 'ankleL', 'footL',
  ];
  const map = {} as Record<JointKey, THREE.Object3D>;
  for (const k of keys) {
    const o = new THREE.Object3D();
    parent.add(o);
    map[k] = o;
  }
  return map;
}

function buildProceduralFallbackAvatar(engine: StudioEngine3D): void {
  const { rig, avatarContainer } = engine;
  while (avatarContainer.children.length > 0) {
    avatarContainer.remove(avatarContainer.children[0]);
  }

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.5,
    metalness: 0.1,
  });

  const rootGroup = new THREE.Group();
  rootGroup.name = 'ProceduralMannequin';

  const pelvisMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.2), bodyMat);
  pelvisMesh.position.set(0, 0.75, 0);
  rootGroup.add(pelvisMesh);

  const spineMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.35, 0.18), bodyMat);
  spineMesh.position.set(0, 1.02, 0);
  rootGroup.add(spineMesh);

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), bodyMat);
  headMesh.position.set(0, 1.38, 0);
  rootGroup.add(headMesh);

  const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.5), bodyMat);
  armR.position.set(-0.3, 1.05, 0);
  rootGroup.add(armR);

  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.5), bodyMat);
  armL.position.set(0.3, 1.05, 0);
  rootGroup.add(armL);

  const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.65), bodyMat);
  legR.position.set(-0.12, 0.4, 0);
  rootGroup.add(legR);

  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.65), bodyMat);
  legL.position.set(0.12, 0.4, 0);
  rootGroup.add(legL);

  avatarContainer.add(rootGroup);

  rig.joints.pelvis = pelvisMesh;
  rig.joints.head = headMesh;
  rig.joints.shoulderR = armR;
  rig.joints.shoulderL = armL;
  rig.joints.hipR = legR;
  rig.joints.hipL = legL;

  rig.isReady = true;
}

function getSharedEngine(): StudioEngine3D | null {
  if (sharedEngine) return sharedEngine;
  if (engineCreationFailed) return null;

  try {
    const offscreen = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({
      canvas: offscreen,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(1);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PALETTE.bgHex);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(2, 4, 3);
    scene.add(dirLight);

    const avatarContainer = new THREE.Group();
    scene.add(avatarContainer);

    const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 30);
    const perspCam = new THREE.PerspectiveCamera(50, 1, 0.05, 30);

    const rig: GlbAvatarRig = {
      avatarContainer,
      propsRoot: new THREE.Group(),
      bones: new Map(),
      joints: createPlaceholderJoints(avatarContainer),
      skinnedMeshes: [],
      isReady: false,
    };

    sharedEngine = {
      renderer,
      scene,
      orthoCam,
      perspCam,
      rig,
      isSoftwareRenderer: false,
    };

    buildProceduralFallbackAvatar(sharedEngine);
    return sharedEngine;
  } catch (err) {
    console.warn('WebGL init failed:', err);
    engineCreationFailed = true;
    return null;
  }
}

export function ensureAvatarGlbLoaded(): Promise<void> {
  const engine = getSharedEngine();
  if (engine && !engine.isReady) {
    buildProceduralFallbackAvatar(engine);
  }
  return Promise.resolve();
}

function computeVisibleFocusBounds() {
  return { center: new THREE.Vector3(0, 0.85, 0), halfExtent: 0.95 };
}

function configureCameraForPanel(
  engine: StudioEngine3D,
  _preset: CameraPreset,
  center: THREE.Vector3,
  halfExtent: number,
  aspect: number,
  orbit: CameraOrbitOverride,
): THREE.Camera {
  const dist = Math.max(1.8, halfExtent * 3.5) / Math.max(0.35, orbit.zoom);
  const az = (-90 + orbit.azimuthDeg) * DEG2RAD;
  const el = (0 + orbit.elevationDeg) * DEG2RAD;
  const camOffset = new THREE.Vector3(
    dist * Math.cos(el) * Math.sin(az),
    dist * Math.sin(el),
    dist * Math.cos(el) * Math.cos(az),
  );
  const camPos = center.clone().add(camOffset);
  const cam = engine.orthoCam;
  const paddedHalf = (halfExtent * 1.16) / Math.max(0.35, orbit.zoom);
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

function renderSingle3DPanelIntoRect(
  ctx: CanvasRenderingContext2D,
  engine: StudioEngine3D,
  panel: Panel3DSpec | undefined,
  rect: { x: number; y: number; w: number; h: number },
  orbit: CameraOrbitOverride,
  dpiScale: number,
  transparentBg = false,
): void {
  const viewX = rect.x + 6;
  const viewY = rect.y + 6;
  const targetW = ctx.canvas.width / dpiScale;
  const targetH = ctx.canvas.height / dpiScale;
  const viewW = Math.max(100, targetW - 16);
  const viewH = Math.max(100, targetH - 16);

  if (!engine.rig.isReady) return;

  const { center, halfExtent } = computeVisibleFocusBounds();
  const camera = configureCameraForPanel(engine, panel?.cameraPreset || 'frontal', center, halfExtent, viewW / viewH, orbit);

  engine.scene.background = transparentBg ? null : new THREE.Color(PALETTE.bgHex);
  engine.renderer.setClearColor(PALETTE.bgHex, transparentBg ? 0 : 1);
  engine.renderer.setSize(Math.round(viewW * dpiScale), Math.round(viewH * dpiScale), false);

  try {
    engine.renderer.render(engine.scene, camera);
    ctx.clearRect(0, 0, targetW, targetH);
    ctx.drawImage(engine.renderer.domElement, viewX, viewY, viewW, viewH);
  } catch (err) {
    console.warn('Render error:', err);
  }
}

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

  const engine = getSharedEngine();
  if (!engine) return;
  if (!engine.rig.isReady) buildProceduralFallbackAvatar(engine);

  renderSingle3DPanelIntoRect(
    ctx,
    engine,
    panel,
    { x: 0, y: 0, w: widthPx, h: heightPx },
    orbitOverride,
    scale,
    transparentBg,
  );
}

export function renderBookFigureToCanvas(
  spec: BookFigureFileSpec,
  canvas: HTMLCanvasElement,
  orbitOverride: CameraOrbitOverride = DEFAULT_ORBIT_OVERRIDE,
  dpiScale = 2,
  _options?: FigureRenderOptions,
): void {
  const widthPx = spec?.widthPx || 880;
  const heightPx = spec?.heightPx || 640;
  const scale = Math.max(1, dpiScale);
  canvas.width = Math.round(widthPx * scale);
  canvas.height = Math.round(heightPx * scale);

  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  const engine = sharedEngine;
  if (!engine) return;
  if (!engine.rig.isReady) buildProceduralFallbackAvatar(engine);

  renderSingle3DPanelIntoRect(
    ctx,
    engine,
    spec?.panels?.[0],
    { x: 0, y: 0, w: widthPx, h: heightPx },
    orbitOverride,
    scale,
    false,
  );
}

export function renderBookFigureToPng(
  spec: BookFigureFileSpec,
  orbitOverride: CameraOrbitOverride = DEFAULT_ORBIT_OVERRIDE,
  qualityMode: 'hd_lossless' | 'compact_120kb' = 'hd_lossless',
  options?: FigureRenderOptions,
): Promise<RenderedPngResult> {
  const offCanvas = document.createElement('canvas');
  const dpiScale = qualityMode === 'hd_lossless' ? 2 : 1;
  renderBookFigureToCanvas(spec, offCanvas, orbitOverride, dpiScale, options);
  if (qualityMode === 'hd_lossless') {
    return Promise.resolve(exportCanvasToHighQualityPng(offCanvas));
  }
  return Promise.resolve(exportCanvasToOptimizedPng(offCanvas));
}

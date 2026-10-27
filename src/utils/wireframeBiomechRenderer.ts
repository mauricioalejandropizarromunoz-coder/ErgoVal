import * as THREE from 'three';
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
} from '../types/figurePlan';
import { CameraOrbitOverride, DEFAULT_ORBIT_OVERRIDE } from './biomech3dRenderer';
import { renderDiagramVariant } from './diagramRenderer';
import {
  exportCanvasToHighQualityPng,
  exportCanvasToOptimizedPng,
} from './pngOptimizer';
import {
  applyPoseToPhotorealRig,
  createPhotorealMedicalRig,
  drawCenteredManualFooter,
  drawEllipticalStudioShadow,
  FOCUS_ZONE_SEGMENTS_MAP,
  PhotorealMedicalRig,
  sanitizeManualImageText,
  setupMedicalStudioLighting,
} from './realisticHumanRig';

export interface WireframeVisualOptions {
  showWireframe: boolean;
  wireframeOpacity: number;
  skinTranslucency: number;
  showSoftTissues: boolean;
  showGlowingNodes: boolean;
  showBlueAngularSectors: boolean;
  showOrangeCurvedArcs: boolean;
  showDownwardForceF: boolean;
  framingOverride: 'plan_default' | 'full_body_profile' | 'isolated_zone';
}

export const DEFAULT_WIREFRAME_OPTIONS: WireframeVisualOptions = {
  showWireframe: false,
  wireframeOpacity: 0.0,
  skinTranslucency: 1.0,
  showSoftTissues: false,
  showGlowingNodes: true,
  showBlueAngularSectors: true,
  showOrangeCurvedArcs: true,
  showDownwardForceF: true,
  framingOverride: 'plan_default',
};

export interface AngularSectorSpec {
  joint: JointKey;
  zeroRef: 'vertical_down' | 'vertical_up' | 'horizontal_right' | 'trunk_axis';
  minDeg: number;
  maxDeg: number;
  minBoxLabel?: string;
  maxBoxLabel?: string;
  midBoxLabel?: string;
  radiusPx?: number;
}

export interface EnrichedWireframePanel extends Panel3DSpec {
  customSectors?: AngularSectorSpec[];
  subscriptSymbol?: string;
  customForceLabel?: string;
}

const DEG2RAD = Math.PI / 180;

const WF_PALETTE = {
  ink: '#090d16',
  sub: '#1e293b',
  muted: '#64748b',
  border: '#cbd5e1',
  sectorFillInner: 'rgba(96, 165, 250, 0.52)',
  sectorFillOuter: 'rgba(135, 192, 254, 0.42)',
  sectorStroke: '#090d16',
  arcStroke: '#090d16',
  forceSlateBlue: '#090d16',
  nodeBlue: '#0284c7',
};

interface WireframeSingletonEngine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  orthoCam: THREE.OrthographicCamera;
  perspCam: THREE.PerspectiveCamera;
  rig: PhotorealMedicalRig;
  isSoftwareRenderer: boolean;
}

let sharedWfEngine: WireframeSingletonEngine | null = null;
let wfWebglFailed = false;

function detectSoftwareGl(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return false;
    const gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function getWireframeEngine(): WireframeSingletonEngine | null {
  if (wfWebglFailed) return null;
  if (sharedWfEngine) return sharedWfEngine;

  try {
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    const isSoftwareRenderer = detectSoftwareGl(renderer);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.setClearColor(0xffffff, 0);

    const scene = new THREE.Scene();
    setupMedicalStudioLighting(scene, renderer);

    const rig = createPhotorealMedicalRig(renderer, isSoftwareRenderer);
    scene.add(rig.root);

    const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.02, 25);
    const perspCam = new THREE.PerspectiveCamera(48, 1, 0.02, 25);

    sharedWfEngine = {
      renderer,
      scene,
      orthoCam,
      perspCam,
      rig,
      isSoftwareRenderer,
    };
    return sharedWfEngine;
  } catch (err) {
    console.warn('Photoreal sector engine unavailable:', err);
    wfWebglFailed = true;
    return null;
  }
}

function resolveEffectiveFocusZone(
  panelZone: FocusZone,
  options: WireframeVisualOptions,
): FocusZone {
  if (options.framingOverride === 'full_body_profile') return 'full_body';
  if (options.framingOverride === 'isolated_zone' && panelZone === 'full_body') return 'trunk_pelvis';
  return panelZone;
}

function computeWireframeFocusBounds(
  rig: PhotorealMedicalRig,
  focusZone: FocusZone,
  cameraPreset: CameraPreset,
  reserveAnteriorSectorSpace: boolean,
): { center: THREE.Vector3; halfExtent: number } {
  const box = new THREE.Box3();
  const activeSegments = FOCUS_ZONE_SEGMENTS_MAP[focusZone];
  const tempBox = new THREE.Box3();

  for (const segKey of activeSegments) {
    for (const obj of rig.segmentMeshes[segKey]) {
      if (obj.visible) {
        tempBox.setFromObject(obj);
        if (!tempBox.isEmpty()) box.union(tempBox);
      }
    }
  }

  if (focusZone === 'full_body' && rig.propsRoot.children.length > 0) {
    tempBox.setFromObject(rig.propsRoot);
    if (!tempBox.isEmpty()) box.union(tempBox);
  }

  if (box.isEmpty()) {
    return { center: new THREE.Vector3(0, 0.95, 0), halfExtent: 0.95 };
  }

  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = new THREE.Vector3();
  box.getSize(size);

  let halfExt = Math.max(0.35, Math.max(size.x, size.y, size.z) * 0.56);

  if (focusZone === 'wrist_hand') {
    const wPos = new THREE.Vector3();
    rig.joints.wristR.getWorldPosition(wPos);
    center.lerp(wPos, 0.45);
    halfExt = Math.max(0.19, Math.max(size.x, size.y, size.z) * 0.60);
  } else if (focusZone === 'ankle_foot') {
    const aPos = new THREE.Vector3();
    rig.joints.ankleR.getWorldPosition(aPos);
    center.lerp(aPos, 0.35);
    halfExt = Math.max(0.22, Math.max(size.x, size.y, size.z) * 0.60);
  } else if (focusZone === 'elbow_forearm') {
    const ePos = new THREE.Vector3();
    rig.joints.elbowR.getWorldPosition(ePos);
    center.lerp(ePos, 0.38);
    halfExt = Math.max(0.34, Math.max(size.x, size.y, size.z) * 0.58);
  } else if (focusZone === 'neck_cervical') {
    const cPos = new THREE.Vector3();
    rig.joints.c7.getWorldPosition(cPos);
    center.lerp(cPos, 0.32);
    halfExt = Math.max(0.29, Math.max(size.x, size.y, size.z) * 0.58);
  } else if (focusZone === 'lumbar_l5s1') {
    const lPos = new THREE.Vector3();
    rig.joints.l5s1.getWorldPosition(lPos);
    center.lerp(lPos, 0.38);
    halfExt = Math.max(0.35, Math.max(size.x, size.y, size.z) * 0.58);
  }

  if (reserveAnteriorSectorSpace && cameraPreset === 'sagittal_right') {
    center.z += halfExt * 0.24;
  } else if (reserveAnteriorSectorSpace && cameraPreset === 'sagittal_left') {
    center.z -= halfExt * 0.24;
  }

  return { center, halfExtent: halfExt };
}

function configureWireframeCamera(
  engine: WireframeSingletonEngine,
  preset: CameraPreset,
  center: THREE.Vector3,
  halfExtent: number,
  aspect: number,
  orbit: CameraOrbitOverride,
): THREE.Camera {
  const dist = Math.max(1.6, halfExtent * 3.4) / Math.max(0.35, orbit.zoom);

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
      baseElevationDeg = 2;
      break;
    case 'dorsal':
      baseAzimuthDeg = 180;
      baseElevationDeg = 3;
      break;
    case 'top':
      baseAzimuthDeg = -90;
      baseElevationDeg = 82;
      break;
    case 'isometric':
      baseAzimuthDeg = -55;
      baseElevationDeg = 16;
      break;
    case 'perspective_oblique':
      baseAzimuthDeg = -34;
      baseElevationDeg = 28;
      break;
  }

  const az = (baseAzimuthDeg + orbit.azimuthDeg) * DEG2RAD;
  const el = Math.max(-85, Math.min(86, baseElevationDeg + orbit.elevationDeg)) * DEG2RAD;

  const camOffset = new THREE.Vector3(
    dist * Math.cos(el) * Math.sin(az),
    dist * Math.sin(el),
    dist * Math.cos(el) * Math.cos(az),
  );
  const camPos = center.clone().add(camOffset);

  if (preset === 'perspective_oblique') {
    const cam = engine.perspCam;
    cam.fov = 52;
    cam.aspect = aspect;
    cam.position.copy(center).add(camOffset.multiplyScalar(0.62));
    cam.up.set(0, 1, 0);
    cam.lookAt(center);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    return cam;
  }

  const cam = engine.orthoCam;
  const paddedHalf = (halfExtent * 1.18) / Math.max(0.35, orbit.zoom);
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
  rig: PhotorealMedicalRig,
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
      x: rx + ((v.x + 1) * 0.5) * rw,
      y: ry + ((-v.y + 1) * 0.5) * rh,
    };
  });
  return out;
}

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

/**
 * Crisp high-contrast rectangular white text box with #090d16 black border.
 */
function drawTextbookDegreeBox(
  ctx: CanvasRenderingContext2D,
  label: string,
  cx: number,
  cy: number,
  bounds: { x: number; y: number; w: number; h: number },
) {
  ctx.save();
  ctx.font = '800 14.5px "Plus Jakarta Sans", system-ui, sans-serif';
  const tw = Math.ceil(ctx.measureText(label).width) + 14;
  const th = 25;

  const clampedX = Math.round(
    Math.max(bounds.x + tw / 2 + 5, Math.min(bounds.x + bounds.w - tw / 2 - 5, cx)),
  );
  const clampedY = Math.round(
    Math.max(bounds.y + th / 2 + 5, Math.min(bounds.y + bounds.h - th / 2 - 5, cy)),
  );

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(clampedX - tw / 2, clampedY - th / 2, tw, th);

  ctx.strokeStyle = WF_PALETTE.ink;
  ctx.lineWidth = 1.8;
  ctx.strokeRect(clampedX - tw / 2, clampedY - th / 2, tw, th);

  ctx.fillStyle = WF_PALETTE.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, clampedX, clampedY + 0.5);
  ctx.restore();
}

function drawScientificBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  bounds: { x: number; y: number; w: number; h: number },
  font = '700 12px "Plus Jakarta Sans", "Inter", system-ui, sans-serif',
) {
  const clean = sanitizeManualImageText(text) || text.trim();
  if (!clean) return;

  ctx.save();
  ctx.font = font;
  const padX = 8;
  const maxTextW = Math.max(36, bounds.w - padX * 2 - 12);
  const lines = wrapTextLines(ctx, clean, maxTextW);
  const lineH = 14.5;
  let maxLineW = 0;
  for (const ln of lines) {
    maxLineW = Math.max(maxLineW, ctx.measureText(ln).width);
  }
  const tw = Math.ceil(maxLineW) + padX * 2;
  const th = Math.max(22, Math.ceil(lines.length * lineH + 7));
  const cx = Math.round(
    Math.max(bounds.x + tw / 2 + 5, Math.min(bounds.x + bounds.w - tw / 2 - 5, x)),
  );
  const cy = Math.round(
    Math.max(bounds.y + th / 2 + 5, Math.min(bounds.y + bounds.h - th / 2 - 5, y)),
  );

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx - tw / 2, cy - th / 2, tw, th);
  ctx.strokeStyle = WF_PALETTE.ink;
  ctx.lineWidth = 1.7;
  ctx.strokeRect(cx - tw / 2, cy - th / 2, tw, th);

  ctx.fillStyle = WF_PALETTE.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const startY = cy - ((lines.length - 1) * lineH) / 2;
  lines.forEach((ln, idx) => {
    ctx.fillText(ln, cx, startY + idx * lineH + 0.5);
  });
  ctx.restore();
}

function draw2DRotationCenterPin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius = 4.6,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#3b82f6';
  ctx.fill();
  ctx.lineWidth = 1.7;
  ctx.strokeStyle = WF_PALETTE.ink;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, 1.6, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

function drawBlueAngularSectorWedge(
  ctx: CanvasRenderingContext2D,
  sector: AngularSectorSpec,
  pts: Record<JointKey, { x: number; y: number }>,
  bounds: { x: number; y: number; w: number; h: number },
  isFullBody: boolean,
) {
  const origin = pts[sector.joint];
  if (!origin) return;

  let baseZeroRad = Math.PI / 2;
  let dirSign = -1;
  if (sector.zeroRef === 'vertical_down') {
    baseZeroRad = Math.PI / 2;
    dirSign = -1;
  } else if (sector.zeroRef === 'vertical_up') {
    baseZeroRad = -Math.PI / 2;
    dirSign = 1;
  } else if (sector.zeroRef === 'horizontal_right') {
    baseZeroRad = 0;
    dirSign = 1;
  } else if (sector.zeroRef === 'trunk_axis') {
    baseZeroRad = Math.atan2(pts.l5s1.y - pts.c7.y, pts.l5s1.x - pts.c7.x);
    dirSign = -1;
  }

  const rad1 = baseZeroRad + dirSign * sector.minDeg * DEG2RAD;
  const rad2 = baseZeroRad + dirSign * sector.maxDeg * DEG2RAD;
  const startRad = Math.min(rad1, rad2);
  const endRad = Math.max(rad1, rad2);
  const r = sector.radiusPx ?? (isFullBody ? 104 : 88);

  ctx.save();
  const grad = ctx.createRadialGradient(origin.x, origin.y, 4, origin.x, origin.y, r);
  grad.addColorStop(0, WF_PALETTE.sectorFillInner);
  grad.addColorStop(1, WF_PALETTE.sectorFillOuter);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.arc(origin.x, origin.y, r, startRad, endRad, false);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = WF_PALETTE.sectorStroke;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.restore();

  if (sector.minBoxLabel) {
    const bx = origin.x + Math.cos(rad1) * (r + 24);
    const by = origin.y + Math.sin(rad1) * (r + 22);
    drawTextbookDegreeBox(ctx, sector.minBoxLabel, bx, by, bounds);
  }
  if (sector.maxBoxLabel) {
    const bx = origin.x + Math.cos(rad2) * (r + 24);
    const by = origin.y + Math.sin(rad2) * (r + 22);
    drawTextbookDegreeBox(ctx, sector.maxBoxLabel, bx, by, bounds);
  }
  if (sector.midBoxLabel) {
    const mid = (startRad + endRad) * 0.5;
    const bx = origin.x + Math.cos(mid) * (r + 28);
    const by = origin.y + Math.sin(mid) * (r + 18);
    drawTextbookDegreeBox(ctx, sector.midBoxLabel, bx, by, bounds);
  }
}

function formatAlphaSubscriptLabel(rawLabel: string, fallbackSub = 'f'): string {
  const subMap: Record<string, string> = {
    f: 'f',
    e: 'e',
    c: 'c',
    t: 't',
    m: 'm',
    r: 'r',
    abd: 'abd',
  };
  const sub = subMap[fallbackSub] || fallbackSub;
  if (/α_[a-z0-9]+/i.test(rawLabel) || /alpha_/i.test(rawLabel)) {
    return rawLabel.replace(/alpha_/gi, 'α_');
  }
  if (rawLabel.includes('α')) {
    return rawLabel.replace('α', `α_${sub}`);
  }
  return `α_${sub} · ${rawLabel}`;
}

function drawPrecisionMeasurementArc(
  ctx: CanvasRenderingContext2D,
  arc: AngleArcAnnotation,
  pts: Record<JointKey, { x: number; y: number }>,
  bounds: { x: number; y: number; w: number; h: number },
  subscriptSymbol = 'f',
  hasBlueSector = true,
) {
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
    refRad = Math.atan2(pts.l5s1.y - pts.c7.y, pts.l5s1.x - pts.c7.x);
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

  const radius = arc.radiusPx ?? (hasBlueSector ? 46 : 54);
  const rayLen = radius + 14;

  ctx.save();
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = WF_PALETTE.ink;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.lineTo(origin.x + Math.cos(refRad) * rayLen, origin.y + Math.sin(refRad) * rayLen);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = WF_PALETTE.ink;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.lineTo(origin.x + Math.cos(segRad) * rayLen, origin.y + Math.sin(segRad) * rayLen);
  ctx.stroke();

  const diff = normalizeAngleDiff(refRad, segRad);
  const absDiff = Math.abs(diff);
  const effectiveDiff = absDiff < 0.16 ? 0.24 : diff;
  const endRad = refRad + effectiveDiff;

  [refRad, endRad].forEach((ang) => {
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = WF_PALETTE.ink;
    ctx.beginPath();
    ctx.moveTo(origin.x + Math.cos(ang) * (radius - 5), origin.y + Math.sin(ang) * (radius - 5));
    ctx.lineTo(origin.x + Math.cos(ang) * (radius + 5), origin.y + Math.sin(ang) * (radius + 5));
    ctx.stroke();
  });

  ctx.lineWidth = 4.2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.90)';
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, radius, refRad, endRad, effectiveDiff < 0);
  ctx.stroke();

  ctx.lineWidth = 2.2;
  ctx.strokeStyle = WF_PALETTE.ink;
  ctx.fillStyle = WF_PALETTE.ink;
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, radius, refRad, endRad, effectiveDiff < 0);
  ctx.stroke();

  const ex = origin.x + Math.cos(endRad) * radius;
  const ey = origin.y + Math.sin(endRad) * radius;
  const tangent = endRad + (effectiveDiff >= 0 ? Math.PI / 2 : -Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - 8 * Math.cos(tangent - 0.45), ey - 8 * Math.sin(tangent - 0.45));
  ctx.lineTo(ex - 8 * Math.cos(tangent + 0.45), ey - 8 * Math.sin(tangent + 0.45));
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const midRad = refRad + effectiveDiff * 0.5;
  const labelDist = hasBlueSector ? radius + 24 : radius + 26;
  const lx = origin.x + Math.cos(midRad) * labelDist;
  const ly = origin.y + Math.sin(midRad) * labelDist;
  const formatted = formatAlphaSubscriptLabel(arc.label, subscriptSymbol);

  drawScientificBadge(ctx, formatted, lx, ly, bounds);
}

function drawStrongForceVectorF(
  ctx: CanvasRenderingContext2D,
  vec: ForceVectorAnnotation,
  pts: Record<JointKey, { x: number; y: number }>,
  bounds: { x: number; y: number; w: number; h: number },
) {
  const at = pts[vec.atJoint];
  if (!at) return;

  const mag = Math.hypot(vec.dx, vec.dy) || 1;
  const nx = vec.dx / mag;
  const ny = vec.dy / mag;
  const len = vec.lengthPx ?? 58;

  const startX = Math.max(bounds.x + 18, Math.min(bounds.x + bounds.w - 18, at.x));
  const startY = Math.max(bounds.y + 18, Math.min(bounds.y + bounds.h - len - 26, at.y));
  const x2 = startX + nx * len;
  const y2 = startY + ny * len;
  const ang = Math.atan2(y2 - startY, x2 - startX);
  const head = 11.5;

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.lineWidth = 6.0;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(x2 - nx * 4, y2 - ny * 4);
  ctx.stroke();

  ctx.strokeStyle = WF_PALETTE.forceSlateBlue;
  ctx.fillStyle = WF_PALETTE.forceSlateBlue;
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(x2 - nx * 4, y2 - ny * 4);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(startX, startY, 4.0, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = WF_PALETTE.ink;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - head * Math.cos(ang - Math.PI / 6.2),
    y2 - head * Math.sin(ang - Math.PI / 6.2),
  );
  ctx.lineTo(
    x2 - head * Math.cos(ang + Math.PI / 6.2),
    y2 - head * Math.sin(ang + Math.PI / 6.2),
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const labelText = vec.label?.trim() ? vec.label : 'F';
  drawScientificBadge(
    ctx,
    labelText,
    x2 + nx * 18 + (Math.abs(nx) < 0.2 ? 18 : 0),
    y2 + ny * 12,
    bounds,
    '800 12.5px "Plus Jakarta Sans", system-ui, sans-serif',
  );
}

function drawDimensionOverlay(
  ctx: CanvasRenderingContext2D,
  dim: DimensionAnnotation,
  pts: Record<JointKey, { x: number; y: number }>,
  bounds: { x: number; y: number; w: number; h: number },
) {
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
      const yRow = Math.max(p1.y, p2.y) + 28;
      x1 = p1.x;
      y1 = yRow;
      x2 = p2.x;
      y2 = yRow;
    } else if (dim.axis === 'vertical') {
      const xCol = Math.max(p1.x, p2.x) + 34;
      x1 = xCol;
      y1 = p1.y;
      x2 = xCol;
      y2 = p2.y;
    } else {
      x1 = p1.x;
      y1 = p1.y;
      x2 = p2.x;
      y2 = p2.y;
    }
  } else {
    return;
  }

  ctx.save();
  ctx.strokeStyle = WF_PALETTE.ink;
  ctx.lineWidth = 1.9;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();

  drawScientificBadge(ctx, dim.label, (x1 + x2) * 0.5, (y1 + y2) * 0.5 - 12, bounds);
}

function inferTextbookSectorsForPanel(
  specId: string,
  panelIdx: number,
  panel: EnrichedWireframePanel,
): { sectors: AngularSectorSpec[]; subSymbol: string } {
  if (panel.customSectors && panel.customSectors.length > 0) {
    return { sectors: panel.customSectors, subSymbol: panel.subscriptSymbol || 'f' };
  }

  if (specId === 'fig-4-07' || specId === 'fig-4-23') {
    if (panelIdx === 0) {
      return {
        subSymbol: 'f',
        sectors: [
          {
            joint: 'elbowR',
            zeroRef: 'vertical_down',
            minDeg: 60,
            maxDeg: 100,
            minBoxLabel: '60°',
            maxBoxLabel: '100°',
          },
        ],
      };
    }
    return {
      subSymbol: 'f',
      sectors: [
        {
          joint: 'elbowR',
          zeroRef: 'vertical_down',
          minDeg: 100,
          maxDeg: 162,
          midBoxLabel: '>100°',
        },
        {
          joint: 'elbowR',
          zeroRef: 'vertical_down',
          minDeg: 0,
          maxDeg: 60,
          midBoxLabel: '<60°',
        },
      ],
    };
  }

  if (specId === 'fig-4-04a' || specId === 'fig-4-22a') {
    return {
      subSymbol: 'f',
      sectors:
        panelIdx === 0
          ? [{ joint: 'shoulderR', zeroRef: 'vertical_down', minDeg: -20, maxDeg: 20, minBoxLabel: '-20°', maxBoxLabel: '20°' }]
          : [{ joint: 'shoulderR', zeroRef: 'vertical_down', minDeg: 20, maxDeg: 45, minBoxLabel: '20°', maxBoxLabel: '45°' }],
    };
  }
  if (specId === 'fig-4-04b' || specId === 'fig-4-22b') {
    return {
      subSymbol: 'f',
      sectors:
        panelIdx === 0
          ? [{ joint: 'shoulderR', zeroRef: 'vertical_down', minDeg: 45, maxDeg: 90, minBoxLabel: '45°', maxBoxLabel: '90°' }]
          : [{ joint: 'shoulderR', zeroRef: 'vertical_down', minDeg: 90, maxDeg: 155, midBoxLabel: '>90°' }],
    };
  }

  if (specId === 'fig-4-10a' || specId === 'fig-4-24') {
    return {
      subSymbol: 'm',
      sectors:
        panelIdx === 0
          ? [{ joint: 'wristR', zeroRef: 'horizontal_right', minDeg: -15, maxDeg: 15, minBoxLabel: '-15°', maxBoxLabel: '15°' }]
          : [{ joint: 'wristR', zeroRef: 'horizontal_right', minDeg: 15, maxDeg: 48, midBoxLabel: '>15°' }],
    };
  }
  if (specId === 'fig-4-10b') {
    return {
      subSymbol: 'm',
      sectors: [{ joint: 'wristR', zeroRef: 'horizontal_right', minDeg: 15, maxDeg: 50, minBoxLabel: '15°', maxBoxLabel: '>15°' }],
    };
  }

  if (specId === 'fig-4-13a' || specId === 'fig-4-20') {
    return {
      subSymbol: 'c',
      sectors:
        panelIdx === 0
          ? [{ joint: 'c7', zeroRef: 'vertical_up', minDeg: 0, maxDeg: 20, minBoxLabel: '0°', maxBoxLabel: '20°' }]
          : [{ joint: 'c7', zeroRef: 'vertical_up', minDeg: 20, maxDeg: 52, midBoxLabel: '>20°' }],
    };
  }
  if (specId === 'fig-4-13b') {
    return {
      subSymbol: 'c',
      sectors:
        panelIdx === 0
          ? [{ joint: 'c7', zeroRef: 'vertical_up', minDeg: 20, maxDeg: 52, midBoxLabel: '>20°' }]
          : [{ joint: 'c7', zeroRef: 'vertical_up', minDeg: -32, maxDeg: 0, midBoxLabel: '<0°' }],
    };
  }

  if (specId === 'fig-4-15a' || specId === 'fig-4-19a') {
    return {
      subSymbol: 't',
      sectors:
        panelIdx === 0
          ? [{ joint: 'l5s1', zeroRef: 'vertical_up', minDeg: 0, maxDeg: 20, minBoxLabel: '0°', maxBoxLabel: '20°' }]
          : [{ joint: 'l5s1', zeroRef: 'vertical_up', minDeg: 20, maxDeg: 60, minBoxLabel: '20°', maxBoxLabel: '60°' }],
    };
  }
  if (specId === 'fig-4-15b' || specId === 'fig-4-19b') {
    return {
      subSymbol: 't',
      sectors:
        panelIdx === 0
          ? [{ joint: 'l5s1', zeroRef: 'vertical_up', minDeg: 20, maxDeg: 60, minBoxLabel: '20°', maxBoxLabel: '60°' }]
          : [{ joint: 'l5s1', zeroRef: 'vertical_up', minDeg: 60, maxDeg: 95, midBoxLabel: '>60°' }],
    };
  }

  const arc = panel.angleArcs?.[0];
  if (!arc) {
    return { sectors: [], subSymbol: panel.subscriptSymbol || 'f' };
  }

  const subByJoint: Partial<Record<JointKey, string>> = {
    elbowR: 'f',
    shoulderR: 'f',
    wristR: 'm',
    c7: 'c',
    l5s1: 't',
    kneeR: 'r',
    ankleR: 'd',
  };
  const subSymbol = panel.subscriptSymbol || subByJoint[arc.joint] || 'f';

  if (panel.cameraPreset === 'sagittal_right') {
    const degMatch = arc.label.match(/(-?\d+(?:[.,]\d+)?)\s*°/);
    const degVal = degMatch ? parseFloat(degMatch[1].replace(',', '.')) : 0;
    if (Math.abs(degVal) >= 8) {
      const zeroRef =
        arc.refType === 'vertical_up'
          ? 'vertical_up'
          : arc.refType === 'horizontal'
            ? 'horizontal_right'
            : 'vertical_down';
      return {
        subSymbol,
        sectors: [
          {
            joint: arc.joint,
            zeroRef,
            minDeg: Math.min(0, degVal),
            maxDeg: Math.max(0, degVal),
            midBoxLabel: `${Math.round(Math.abs(degVal))}°`,
          },
        ],
      };
    }
  }

  return { sectors: [], subSymbol };
}

function inferDefaultForceJointForZone(zone: FocusZone): JointKey {
  switch (zone) {
    case 'lumbar_l5s1':
    case 'trunk_pelvis':
      return 'l5s1';
    case 'ankle_foot':
      return 'footR';
    case 'legs_knees':
      return 'kneeR';
    case 'neck_cervical':
      return 'head';
    default:
      return 'handR';
  }
}

function renderSingleWireframePanel(
  ctx: CanvasRenderingContext2D,
  engine: WireframeSingletonEngine,
  specId: string,
  panelIdx: number,
  panel: EnrichedWireframePanel,
  rect: { x: number; y: number; w: number; h: number },
  orbit: CameraOrbitOverride,
  options: WireframeVisualOptions,
  dpiScale: number,
) {
  const cleanSubTitle = sanitizeManualImageText(panel.subTitle);
  const cleanBadge = sanitizeManualImageText(panel.scoreBadge);
  const cleanNote = sanitizeManualImageText(panel.noteBottom);

  ctx.save();
  ctx.font = '700 13px "Plus Jakarta Sans", system-ui, sans-serif';
  const subLines = cleanSubTitle ? wrapTextLines(ctx, cleanSubTitle, rect.w - 24).slice(0, 2) : [];
  const subHeight = subLines.length * 16;
  const badgeHeight = cleanBadge ? 17 : 0;
  const headerH = Math.max(38, 12 + subHeight + badgeHeight);

  ctx.font = '600 11px "Public Sans", system-ui, sans-serif';
  const noteLines = cleanNote ? wrapTextLines(ctx, cleanNote, rect.w - 24).slice(0, 2) : [];
  const footerH = noteLines.length > 0 ? 8 + noteLines.length * 14 : 6;
  ctx.restore();

  const viewX = rect.x + 6;
  const viewY = rect.y + headerH;
  const viewW = Math.max(60, rect.w - 12);
  const viewH = Math.max(80, rect.h - headerH - footerH);

  let effectivePanel: EnrichedWireframePanel = panel;
  if ((specId === 'fig-4-07' || specId === 'fig-4-23') && panelIdx === 1) {
    effectivePanel = {
      ...panel,
      pose: {
        ...panel.pose,
        shoulderRFlexionDeg: 8,
        elbowRFlexionDeg: 138,
      },
    };
  }

  const effectiveZone = resolveEffectiveFocusZone(effectivePanel.focusZone, options);
  const { sectors, subSymbol } = inferTextbookSectorsForPanel(specId, panelIdx, effectivePanel);
  const reserveSectorRoom = options.showBlueAngularSectors && sectors.length > 0;

  applyPoseToPhotorealRig(engine.rig, effectivePanel.pose, effectiveZone, false);
  const { center, halfExtent } = computeWireframeFocusBounds(
    engine.rig,
    effectiveZone,
    effectivePanel.cameraPreset,
    reserveSectorRoom,
  );

  const camera = configureWireframeCamera(
    engine,
    effectivePanel.cameraPreset,
    center,
    halfExtent,
    viewW / viewH,
    orbit,
  );

  const pts = projectJoints2D(engine.rig, camera, viewX, viewY, viewW, viewH);

  if (
    effectiveZone === 'full_body' ||
    effectiveZone === 'legs_knees' ||
    effectiveZone === 'ankle_foot'
  ) {
    const soleY = Math.max(pts.ankleR.y, pts.footR.y) + 8;
    const midFootX = (pts.ankleR.x + pts.footR.x) * 0.5;
    drawEllipticalStudioShadow(ctx, midFootX, soleY, Math.min(72, viewW * 0.24), 9);
  }

  const glScale = engine.isSoftwareRenderer ? Math.max(1, dpiScale) : Math.max(2, dpiScale * 1.5);
  engine.renderer.setSize(Math.round(viewW * glScale), Math.round(viewH * glScale), false);
  try {
    engine.renderer.render(engine.scene, camera);
    ctx.drawImage(engine.renderer.domElement, viewX, viewY, viewW, viewH);
  } catch {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(viewX, viewY, viewW, viewH);
  }

  const viewportBounds = { x: viewX, y: viewY, w: viewW, h: viewH };

  if (options.showBlueAngularSectors && sectors.length > 0 && Math.abs(orbit.azimuthDeg) < 25) {
    for (const sec of sectors) {
      drawBlueAngularSectorWedge(
        ctx,
        sec,
        pts,
        viewportBounds,
        effectiveZone === 'full_body',
      );
    }
  }

  if (options.showGlowingNodes) {
    const activePinJoints = new Set<JointKey>();
    sectors.forEach((s) => activePinJoints.add(s.joint));
    effectivePanel.angleArcs?.forEach((a) => activePinJoints.add(a.joint));
    if (activePinJoints.size === 0) {
      activePinJoints.add(inferDefaultForceJointForZone(effectiveZone));
    }
    activePinJoints.forEach((jk) => {
      if (pts[jk]) {
        draw2DRotationCenterPin(ctx, pts[jk].x, pts[jk].y, 4.6);
      }
    });
  }

  if (effectivePanel.dimensions) {
    for (const dim of effectivePanel.dimensions) {
      drawDimensionOverlay(ctx, dim, pts, viewportBounds);
    }
  }

  if (options.showOrangeCurvedArcs && effectivePanel.angleArcs) {
    for (const arc of effectivePanel.angleArcs) {
      drawPrecisionMeasurementArc(
        ctx,
        arc,
        pts,
        viewportBounds,
        subSymbol,
        options.showBlueAngularSectors && sectors.length > 0,
      );
    }
  }

  if (options.showDownwardForceF) {
    const explicitVectors =
      effectivePanel.forceVectors && effectivePanel.forceVectors.length > 0
        ? effectivePanel.forceVectors
        : [
            {
              atJoint: inferDefaultForceJointForZone(effectiveZone),
              dx: 0,
              dy: 1,
              lengthPx: 54,
              label: effectivePanel.customForceLabel || 'F',
            },
          ];

    for (const vec of explicitVectors) {
      drawStrongForceVectorF(ctx, vec, pts, viewportBounds);
    }
  }

  if (effectivePanel.pose.highlightGroup === 'rula_groups') {
    drawScientificBadge(
      ctx,
      'Grupo A: Brazo · Antebrazo · Muñeca',
      viewX + viewW * 0.5,
      viewY + 20,
      viewportBounds,
    );
    drawScientificBadge(
      ctx,
      'Grupo B: Cuello · Tronco · Piernas',
      viewX + viewW * 0.5,
      viewY + viewH - 18,
      viewportBounds,
    );
  }
  if (effectivePanel.pose.highlightGroup === 'sagittal_split') {
    drawScientificBadge(ctx, 'Lado Derecho', viewX + viewW * 0.25, viewY + 24, viewportBounds);
    drawScientificBadge(ctx, 'Lado Izquierdo', viewX + viewW * 0.75, viewY + 24, viewportBounds);
  }

  ctx.save();
  ctx.fillStyle = WF_PALETTE.ink;
  ctx.font = '700 13px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let curY = rect.y + 7;
  for (const line of subLines) {
    ctx.fillText(line, Math.round(rect.x + 12), Math.round(curY));
    curY += 16;
  }

  if (cleanBadge) {
    ctx.fillStyle = WF_PALETTE.nodeBlue;
    ctx.font = '700 11.5px "IBM Plex Mono", monospace';
    ctx.fillText(cleanBadge, Math.round(rect.x + 12), Math.round(curY + 1));
  }

  if (noteLines.length > 0) {
    ctx.fillStyle = WF_PALETTE.sub;
    ctx.font = '600 11px "Public Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    let noteY = rect.y + rect.h - footerH + 2;
    for (const nLine of noteLines) {
      ctx.fillText(nLine, Math.round(rect.x + rect.w / 2), Math.round(noteY));
      noteY += 14;
    }
  }
  ctx.restore();
}

export function renderWireframeFigureToCanvas(
  spec: BookFigureFileSpec,
  canvas: HTMLCanvasElement,
  orbitOverride: CameraOrbitOverride = DEFAULT_ORBIT_OVERRIDE,
  options: WireframeVisualOptions = DEFAULT_WIREFRAME_OPTIONS,
  dpiScale = 2,
): void {
  try {
    const { widthPx, heightPx } = spec;
    const scale = Math.max(1, dpiScale);

    if (spec.renderMode === 'diagram' || spec.renderMode === 'real_chart') {
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

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, widthPx, heightPx);

    // Top Header Bar (Spanish typography, zero model meta-text)
    ctx.save();
    const isCustomFig =
      !spec.figureNumber ||
      spec.figureNumber === '3D' ||
      spec.figureNumber === 'WF-3D' ||
      spec.figureNumber === 'EVAL';
    const figLabel = isCustomFig
      ? 'EVALUACIÓN'
      : `FIG. ${sanitizeManualImageText(spec.figureNumber)}${spec.subPart || ''}`;
    ctx.font = '700 12px "IBM Plex Mono", monospace';
    const figLabelW = Math.ceil(ctx.measureText(figLabel).width);

    const titleStartX = 14 + figLabelW + 10;
    const availTitleW = Math.max(160, widthPx - titleStartX - 14);
    ctx.font = '700 13.5px "Plus Jakarta Sans", system-ui, sans-serif';
    const cleanTitle = sanitizeManualImageText(spec.title) || spec.title;
    const titleLines = wrapTextLines(ctx, cleanTitle, availTitleW).slice(0, 2);
    const topTitleBarH = titleLines.length > 1 ? 54 : 40;

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, widthPx, topTitleBarH);
    ctx.strokeStyle = WF_PALETTE.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, topTitleBarH);
    ctx.lineTo(widthPx, topTitleBarH);
    ctx.stroke();

    ctx.fillStyle = WF_PALETTE.nodeBlue;
    ctx.font = '700 12px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(figLabel, 14, Math.round(topTitleBarH / 2));

    ctx.fillStyle = WF_PALETTE.ink;
    ctx.font = '700 13.5px "Plus Jakarta Sans", system-ui, sans-serif';
    if (titleLines.length <= 1) {
      ctx.fillText(titleLines[0] || '', Math.round(titleStartX), Math.round(topTitleBarH / 2));
    } else {
      ctx.fillText(titleLines[0], Math.round(titleStartX), Math.round(topTitleBarH / 2 - 9));
      ctx.fillText(titleLines[1], Math.round(titleStartX), Math.round(topTitleBarH / 2 + 10));
    }
    ctx.restore();

    const bottomManualFooterH = 26;
    const panels = (spec.panels || []) as EnrichedWireframePanel[];
    const bodyAreaY = topTitleBarH + 2;
    const bodyAreaH = heightPx - bodyAreaY - bottomManualFooterH - 2;

    const engine = getWireframeEngine();

    if (!engine) {
      ctx.save();
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(8, bodyAreaY + 8, widthPx - 16, bodyAreaH - 16);
      ctx.strokeStyle = WF_PALETTE.border;
      ctx.strokeRect(8, bodyAreaY + 8, widthPx - 16, bodyAreaH - 16);
      ctx.fillStyle = WF_PALETTE.ink;
      ctx.font = '700 13px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Ilustración Biomecánica Técnica', widthPx / 2, bodyAreaY + bodyAreaH / 2);
      ctx.restore();
    } else if (panels.length >= 2) {
      // Admite 2 a 4 paneles en columnas iguales (con 2 paneles el resultado es idéntico al anterior).
      const nCols = Math.min(panels.length, 4);
      const colW = Math.floor(widthPx / nCols);
      for (let i = 0; i < nCols; i++) {
        const x0 = i * colW + (i > 0 ? 1 : 0);
        const x1 = i === nCols - 1 ? widthPx : (i + 1) * colW - 1;
        renderSingleWireframePanel(
          ctx,
          engine,
          spec.id,
          i,
          panels[i],
          { x: x0, y: bodyAreaY, w: x1 - x0, h: bodyAreaH },
          orbitOverride,
          options,
          scale,
        );
      }

      ctx.save();
      ctx.strokeStyle = WF_PALETTE.border;
      ctx.lineWidth = 1;
      for (let i = 1; i < nCols; i++) {
        ctx.beginPath();
        ctx.moveTo(i * colW, topTitleBarH);
        ctx.lineTo(i * colW, heightPx - bottomManualFooterH);
        ctx.stroke();
      }
      ctx.restore();
    } else if (panels.length === 1) {
      renderSingleWireframePanel(
        ctx,
        engine,
        spec.id,
        0,
        panels[0],
        { x: 0, y: bodyAreaY, w: widthPx, h: bodyAreaH },
        orbitOverride,
        options,
        scale,
      );
    }

    // Centered Spanish Technical Footer: 'Postura de evaluación · Marcadores de ángulo · Plano Sagital'
    drawCenteredManualFooter(ctx, widthPx, heightPx, bottomManualFooterH);

    // Thin outer manual border
    ctx.save();
    ctx.strokeStyle = WF_PALETTE.border;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(0.7, 0.7, widthPx - 1.4, heightPx - 1.4);
    ctx.restore();
  } catch (err) {
    console.error('Error rendering biomechanical sector figure:', err);
  }
}

export async function renderWireframeFigureToPng(
  spec: BookFigureFileSpec,
  orbitOverride: CameraOrbitOverride = DEFAULT_ORBIT_OVERRIDE,
  options: WireframeVisualOptions = DEFAULT_WIREFRAME_OPTIONS,
  qualityMode: 'hd_lossless' | 'compact_120kb' = 'hd_lossless',
): Promise<RenderedPngResult> {
  const offCanvas = document.createElement('canvas');
  const dpiScale = qualityMode === 'hd_lossless' ? 2 : 1;
  renderWireframeFigureToCanvas(spec, offCanvas, orbitOverride, options, dpiScale);
  if (qualityMode === 'hd_lossless') {
    return exportCanvasToHighQualityPng(offCanvas);
  }
  return exportCanvasToOptimizedPng(offCanvas);
}

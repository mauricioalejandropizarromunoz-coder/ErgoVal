import * as THREE from 'three';
import {
  BookFigureFileSpec,
  JointKey,
  PosturePose3D,
  RenderedPngResult,
} from '../types/figurePlan';
import { renderDiagramVariant } from './diagramRenderer';
import {
  exportCanvasToHighQualityPng,
  exportCanvasToOptimizedPng,
} from './pngOptimizer';
import {
  applyPoseToPhotorealRig,
  createPhotorealMedicalRig,
  drawEllipticalStudioShadow,
  MEDICAL_MANUAL_FOOTER_ES,
  PhotorealMedicalRig,
  sanitizeManualImageText,
  setupMedicalStudioLighting,
} from './realisticHumanRig';

export type EvaluatedJointParam =
  | 'cervical'
  | 'trunk'
  | 'shoulder'
  | 'elbow'
  | 'wrist'
  | 'knee';

export interface SolidComparativeSpec {
  id: string;
  codeLabel: string;
  headerKicker: string;
  headerTitle: string;
  topLeftSegmentLabel: string;
  bottomCaption: string;
  evaluatedParam: EvaluatedJointParam;
  /** Subscript symbol shown after α, e.g. 'c', 't', 'b', 'a', 'm', 'p' */
  alphaSubscript: string;
  /** Evaluated angle in degrees (positive = flexion, negative = extension) */
  angleDeg: number;
  /** English action phrase for synchronized prompt, e.g. 'cervical flexion of 30 degrees' */
  englishActionPhrase: string;
  /** Neutral reference pose for Figure A */
  poseA: PosturePose3D;
  /** Evaluated active pose for Figure B */
  poseB: PosturePose3D;
  /** Master book chapter / method reference */
  methodRef: string;
}

export interface SolidComparativeVisualOptions {
  showHeaderBanner: boolean;
  showTopLeftSegmentText: boolean;
  showBottomCaption: boolean;
  showThinOuterBorder: boolean;
  showBlueFanSector: boolean;
  showDegreeCalloutBoxes: boolean;
  sectorOpacity: number;
  aspectPreset: 'square_1000' | 'plan_800x520';
}

export const DEFAULT_SOLID_COMPARATIVE_OPTIONS: SolidComparativeVisualOptions = {
  showHeaderBanner: true,
  showTopLeftSegmentText: true,
  showBottomCaption: true,
  showThinOuterBorder: true,
  showBlueFanSector: true,
  showDegreeCalloutBoxes: true,
  sectorOpacity: 0.50,
  aspectPreset: 'square_1000',
};

const DEG2RAD = Math.PI / 180;

export function makeSolidStandingNeutralPose(
  overrides: Partial<PosturePose3D> = {},
): PosturePose3D {
  return {
    trunkFlexionDeg: 0,
    trunkLateralDeg: 0,
    trunkTwistDeg: 0,
    neckFlexionDeg: 0,
    neckLateralDeg: 0,
    neckTwistDeg: 0,
    shoulderRFlexionDeg: 2,
    shoulderRAbductionDeg: 2,
    shoulderRElevated: false,
    shoulderLFlexionDeg: 2,
    shoulderLAbductionDeg: 2,
    elbowRFlexionDeg: 11,
    elbowLFlexionDeg: 11,
    forearmRPronationDeg: 0,
    forearmRCrossMidline: false,
    wristRFlexionDeg: 0,
    wristRDeviationDeg: 0,
    wristLFlexionDeg: 0,
    hipRFlexionDeg: 2,
    kneeRFlexionDeg: 5,
    ankleRDorsiflexionDeg: 2,
    hipLFlexionDeg: 2,
    kneeLFlexionDeg: 5,
    ankleLDorsiflexionDeg: 2,
    stanceMode: 'standing',
    prop: 'none',
    loadKg: 0,
    highlightGroup: 'none',
    handGripMode: 'relaxed',
    ...overrides,
  };
}

/**
 * Curated Master-Document Presets covering the book's ergonomic methods
 * (RULA, REBA, OWAS, NIOSH, OCRA, JSI & Chapters 11–13 Case Studies).
 * Standardized to clean Spanish typography with zero model meta-text.
 */
export const MASTER_COMPARATIVE_PRESETS: SolidComparativeSpec[] = [
  {
    id: 'cervical_flex_30',
    codeLabel: 'Cuello αc = 30° (Referencia)',
    headerKicker: 'EVALUACIÓN POSTURAL',
    headerTitle:
      'Columna cervical C1–C7 y cabeza (aislado): flexión cervical sostenida superior a 20° (Postura de Evaluación)',
    topLeftSegmentLabel: 'Columna cervical C1–C7 y cabeza\n(aislado)',
    bottomCaption: MEDICAL_MANUAL_FOOTER_ES,
    evaluatedParam: 'cervical',
    alphaSubscript: 'c',
    angleDeg: 30,
    englishActionPhrase: 'cervical flexion of 30 degrees',
    poseA: makeSolidStandingNeutralPose(),
    poseB: makeSolidStandingNeutralPose({ neckFlexionDeg: 30 }),
    methodRef: 'Cap. 4 · RULA Fig. 4.13b (>20°: 3 ptos) / REBA Fig. 4.20 (>20°: 2 ptos)',
  },
  {
    id: 'cervical_flex_15',
    codeLabel: 'Cuello αc = 15° (10°–20°)',
    headerKicker: 'EVALUACIÓN POSTURAL',
    headerTitle:
      'Columna cervical C1–C7 y cabeza: flexión cervical moderada entre 10° y 20° (Postura de Evaluación)',
    topLeftSegmentLabel: 'Columna cervical C1–C7 y cabeza\n(rango 10°–20°)',
    bottomCaption: MEDICAL_MANUAL_FOOTER_ES,
    evaluatedParam: 'cervical',
    alphaSubscript: 'c',
    angleDeg: 15,
    englishActionPhrase: 'cervical flexion of 15 degrees',
    poseA: makeSolidStandingNeutralPose(),
    poseB: makeSolidStandingNeutralPose({ neckFlexionDeg: 15 }),
    methodRef: 'Cap. 4 · RULA Fig. 4.13a (10°–20°: 2 ptos) / REBA Fig. 4.20 (1 pto)',
  },
  {
    id: 'cervical_ext_20',
    codeLabel: 'Cuello Extensión αc = −20°',
    headerKicker: 'EVALUACIÓN POSTURAL',
    headerTitle:
      'Columna cervical C1–C7 y cabeza: extensión cervical en tarea de control visual superior (Postura de Evaluación)',
    topLeftSegmentLabel: 'Columna cervical C1–C7 y cabeza\n(extensión cervical)',
    bottomCaption: MEDICAL_MANUAL_FOOTER_ES,
    evaluatedParam: 'cervical',
    alphaSubscript: 'c',
    angleDeg: -20,
    englishActionPhrase: 'cervical extension of 20 degrees',
    poseA: makeSolidStandingNeutralPose(),
    poseB: makeSolidStandingNeutralPose({ neckFlexionDeg: -20 }),
    methodRef: 'Cap. 4 · RULA Fig. 4.13b (En extensión: 4 ptos) / REBA Fig. 4.20 (2 ptos)',
  },
  {
    id: 'trunk_flex_35',
    codeLabel: 'Tronco αt = 35° (20°–60°)',
    headerKicker: 'EVALUACIÓN POSTURAL',
    headerTitle:
      'Columna dorsolumbar T1–S1 y pelvis: flexión anterior de tronco entre 20° y 60° (Postura de Evaluación)',
    topLeftSegmentLabel: 'Columna dorsolumbar T1–S1\n(flexión 20°–60°)',
    bottomCaption: MEDICAL_MANUAL_FOOTER_ES,
    evaluatedParam: 'trunk',
    alphaSubscript: 't',
    angleDeg: 35,
    englishActionPhrase: 'anterior trunk flexion of 35 degrees',
    poseA: makeSolidStandingNeutralPose(),
    poseB: makeSolidStandingNeutralPose({
      trunkFlexionDeg: 35,
      neckFlexionDeg: 8,
      shoulderRFlexionDeg: 22,
      shoulderLFlexionDeg: 22,
      elbowRFlexionDeg: 16,
      elbowLFlexionDeg: 16,
    }),
    methodRef: 'Cap. 4 · RULA Fig. 4.15b (20°–60°: 3 ptos) / REBA Fig. 4.19b / OWAS Espalda 2',
  },
  {
    id: 'trunk_flex_65',
    codeLabel: 'Tronco αt = 65° (>60°)',
    headerKicker: 'EVALUACIÓN POSTURAL',
    headerTitle:
      'Columna dorsolumbar L5/S1: flexión pronunciada de tronco superior a 60° (Postura de Evaluación)',
    topLeftSegmentLabel: 'Segmento dorsolumbar L5/S1\n(flexión > 60°)',
    bottomCaption: MEDICAL_MANUAL_FOOTER_ES,
    evaluatedParam: 'trunk',
    alphaSubscript: 't',
    angleDeg: 65,
    englishActionPhrase: 'deep anterior trunk flexion of 65 degrees',
    poseA: makeSolidStandingNeutralPose(),
    poseB: makeSolidStandingNeutralPose({
      trunkFlexionDeg: 65,
      neckFlexionDeg: 6,
      shoulderRFlexionDeg: 48,
      shoulderLFlexionDeg: 48,
      elbowRFlexionDeg: 18,
      elbowLFlexionDeg: 18,
      kneeRFlexionDeg: 10,
      kneeLFlexionDeg: 10,
    }),
    methodRef: 'Cap. 4 & Cap. 12 · RULA Fig. 4.15b (>60°: 4 ptos) / Caso Fig. 12.5',
  },
  {
    id: 'shoulder_flex_60',
    codeLabel: 'Brazo αb = 60° (45°–90°)',
    headerKicker: 'EVALUACIÓN POSTURAL',
    headerTitle:
      'Complejo articular glenohumeral (hombro y brazo): flexión humeral entre 45° y 90° (Postura de Evaluación)',
    topLeftSegmentLabel: 'Hombro y brazo derecho\n(flexión 45°–90°)',
    bottomCaption: MEDICAL_MANUAL_FOOTER_ES,
    evaluatedParam: 'shoulder',
    alphaSubscript: 'b',
    angleDeg: 60,
    englishActionPhrase: 'shoulder flexion of 60 degrees',
    poseA: makeSolidStandingNeutralPose(),
    poseB: makeSolidStandingNeutralPose({
      shoulderRFlexionDeg: 60,
      elbowRFlexionDeg: 32,
    }),
    methodRef: 'Cap. 4 · RULA Fig. 4.4b (45°–90°: 3 ptos) / REBA Fig. 4.22b',
  },
  {
    id: 'shoulder_flex_105',
    codeLabel: 'Brazo αb = 105° (>90°)',
    headerKicker: 'EVALUACIÓN POSTURAL',
    headerTitle:
      'Complejo articular glenohumeral: elevación de brazo en flexión superior a 90° sobre nivel acromial (Postura de Evaluación)',
    topLeftSegmentLabel: 'Hombro y brazo derecho\n(flexión > 90°)',
    bottomCaption: MEDICAL_MANUAL_FOOTER_ES,
    evaluatedParam: 'shoulder',
    alphaSubscript: 'b',
    angleDeg: 105,
    englishActionPhrase: 'overhead shoulder flexion of 105 degrees',
    poseA: makeSolidStandingNeutralPose(),
    poseB: makeSolidStandingNeutralPose({
      shoulderRFlexionDeg: 105,
      elbowRFlexionDeg: 28,
      neckFlexionDeg: -8,
    }),
    methodRef: 'Cap. 4, 6 & 13 · RULA Fig. 4.4b (>90°: 4 ptos) / OCRA Fig. 6.3 / Caso Fig. 13.2',
  },
  {
    id: 'elbow_flex_85',
    codeLabel: 'Antebrazo αa = 85° (60°–100°)',
    headerKicker: 'EVALUACIÓN POSTURAL',
    headerTitle:
      'Articulación humeroulnar (codo y antebrazo): flexión en rango funcional de 60° a 100° (Postura de Evaluación)',
    topLeftSegmentLabel: 'Codo y antebrazo derecho\n(rango 60°–100°)',
    bottomCaption: MEDICAL_MANUAL_FOOTER_ES,
    evaluatedParam: 'elbow',
    alphaSubscript: 'a',
    angleDeg: 85,
    englishActionPhrase: 'elbow flexion of 85 degrees',
    poseA: makeSolidStandingNeutralPose(),
    poseB: makeSolidStandingNeutralPose({
      shoulderRFlexionDeg: 6,
      elbowRFlexionDeg: 85,
    }),
    methodRef: 'Cap. 4 · RULA Fig. 4.7 (60°–100°: 1 pto) / REBA Fig. 4.23 (1 pto)',
  },
  {
    id: 'elbow_flex_115',
    codeLabel: 'Antebrazo αa = 115° (>100°)',
    headerKicker: 'EVALUACIÓN POSTURAL',
    headerTitle:
      'Articulación humeroulnar (codo y antebrazo): flexión aguda superior a 100° fuera de rango óptimo (Postura de Evaluación)',
    topLeftSegmentLabel: 'Codo y antebrazo derecho\n(flexión > 100°)',
    bottomCaption: MEDICAL_MANUAL_FOOTER_ES,
    evaluatedParam: 'elbow',
    alphaSubscript: 'a',
    angleDeg: 115,
    englishActionPhrase: 'acute elbow flexion of 115 degrees',
    poseA: makeSolidStandingNeutralPose(),
    poseB: makeSolidStandingNeutralPose({
      shoulderRFlexionDeg: 10,
      elbowRFlexionDeg: 115,
    }),
    methodRef: 'Cap. 4 · RULA Fig. 4.7 (<60° o >100°: 2 ptos) / REBA Fig. 4.23 (2 ptos)',
  },
  {
    id: 'wrist_flex_25',
    codeLabel: 'Muñeca αm = 25° (>15°)',
    headerKicker: 'EVALUACIÓN POSTURAL',
    headerTitle:
      'Articulación radiocarpiana (muñeca y mano): flexión palmar sostenida superior a 15° (Postura de Evaluación)',
    topLeftSegmentLabel: 'Muñeca y mano derecha\n(flexión > 15°)',
    bottomCaption: MEDICAL_MANUAL_FOOTER_ES,
    evaluatedParam: 'wrist',
    alphaSubscript: 'm',
    angleDeg: 25,
    englishActionPhrase: 'palmar wrist flexion of 25 degrees',
    poseA: makeSolidStandingNeutralPose(),
    poseB: makeSolidStandingNeutralPose({
      shoulderRFlexionDeg: 18,
      elbowRFlexionDeg: 82,
      wristRFlexionDeg: 25,
    }),
    methodRef: 'Cap. 4 & Cap. 6 · RULA Fig. 4.10b (>15°: 3 ptos) / REBA Fig. 4.24 / JSI Fig. 6.4',
  },
  {
    id: 'knee_flex_45',
    codeLabel: 'Rodilla αp = 45° (30°–60°)',
    headerKicker: 'EVALUACIÓN POSTURAL',
    headerTitle:
      'Articulación femorotibial (rodilla y pierna): flexión bilateral entre 30° y 60° en soporte bípedo (Postura de Evaluación)',
    topLeftSegmentLabel: 'Rodillas y miembros inferiores\n(flexión 30°–60°)',
    bottomCaption: MEDICAL_MANUAL_FOOTER_ES,
    evaluatedParam: 'knee',
    alphaSubscript: 'p',
    angleDeg: 45,
    englishActionPhrase: 'bilateral knee flexion of 45 degrees',
    poseA: makeSolidStandingNeutralPose(),
    poseB: makeSolidStandingNeutralPose({
      hipRFlexionDeg: 26,
      kneeRFlexionDeg: 45,
      ankleRDorsiflexionDeg: 18,
      hipLFlexionDeg: 26,
      kneeLFlexionDeg: 45,
      ankleLDorsiflexionDeg: 18,
      trunkFlexionDeg: 12,
    }),
    methodRef: 'Cap. 4 · REBA Fig. 4.21b (Flexión 30°–60°: +1 pto) / OWAS Fig. 4.29b',
  },
  {
    id: 'niosh_lift_45',
    codeLabel: 'Levantamiento L5/S1 αt = 45°',
    headerKicker: 'EVALUACIÓN POSTURAL',
    headerTitle:
      'Segmento lumbosacro L5/S1: flexión sagital de 45° en levantamiento manual de carga (Postura de Evaluación)',
    topLeftSegmentLabel: 'Segmento lumbosacro L5/S1\n(levantamiento NIOSH)',
    bottomCaption: MEDICAL_MANUAL_FOOTER_ES,
    evaluatedParam: 'trunk',
    alphaSubscript: 't',
    angleDeg: 45,
    englishActionPhrase: 'lumbar trunk flexion of 45 degrees during load lifting',
    poseA: makeSolidStandingNeutralPose(),
    poseB: makeSolidStandingNeutralPose({
      trunkFlexionDeg: 45,
      neckFlexionDeg: 10,
      hipRFlexionDeg: 22,
      kneeRFlexionDeg: 32,
      ankleRDorsiflexionDeg: 12,
      hipLFlexionDeg: 22,
      kneeLFlexionDeg: 32,
      ankleLDorsiflexionDeg: 12,
      shoulderRFlexionDeg: 48,
      shoulderLFlexionDeg: 48,
      elbowRFlexionDeg: 35,
      elbowLFlexionDeg: 35,
      prop: 'box_load',
      handGripMode: 'power_grip',
    }),
    methodRef: 'Cap. 5 · Ecuación NIOSH Fig. 5.1–5.2 (Compresión sobre disco L5/S1)',
  },
];

interface SolidComparativeEngine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  orthoCam: THREE.OrthographicCamera;
  rig: PhotorealMedicalRig;
  isSoftwareRenderer: boolean;
}

let sharedSolidEngine: SolidComparativeEngine | null = null;
let solidWebglFailed = false;

function detectSoftwareWebGL(renderer: THREE.WebGLRenderer): boolean {
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

function getSolidComparativeEngine(): SolidComparativeEngine | null {
  if (solidWebglFailed) return null;
  if (sharedSolidEngine) return sharedSolidEngine;

  try {
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    const isSoftwareRenderer = detectSoftwareWebGL(renderer);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.setClearColor(0xffffff, 0);

    const scene = new THREE.Scene();
    setupMedicalStudioLighting(scene, renderer);

    const rig = createPhotorealMedicalRig(renderer, isSoftwareRenderer);
    scene.add(rig.root);

    const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 20);

    sharedSolidEngine = {
      renderer,
      scene,
      orthoCam,
      rig,
      isSoftwareRenderer,
    };
    return sharedSolidEngine;
  } catch (err) {
    console.warn('Comparative WebGL unavailable:', err);
    solidWebglFailed = true;
    return null;
  }
}

function projectJointToSubPanel(
  joint: THREE.Object3D,
  cam: THREE.Camera,
  subX: number,
  subY: number,
  subW: number,
  subH: number,
): { x: number; y: number } {
  const worldPos = new THREE.Vector3();
  joint.getWorldPosition(worldPos);
  worldPos.project(cam);
  return {
    x: subX + (worldPos.x * 0.5 + 0.5) * subW,
    y: subY + (-worldPos.y * 0.5 + 0.5) * subH,
  };
}

function drawSharpArcArrowhead(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  dirAngleRad: number,
  len: number,
  halfWidth: number,
) {
  ctx.save();
  ctx.translate(tipX, tipY);
  ctx.rotate(dirAngleRad);
  ctx.fillStyle = '#090d16';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-len, -halfWidth);
  ctx.lineTo(-len * 0.82, 0);
  ctx.lineTo(-len, halfWidth);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCrispDegreeBox(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  text: string,
  scale: number,
) {
  ctx.save();
  const fontSize = Math.round(24 * scale);
  ctx.font = `700 ${fontSize}px "Plus Jakarta Sans", "Inter", system-ui, sans-serif`;
  const tm = ctx.measureText(text);
  const padX = Math.round(11 * scale);
  const padY = Math.round(7 * scale);
  const boxW = Math.ceil(tm.width + padX * 2);
  const boxH = Math.ceil(fontSize + padY * 2);
  const bx = Math.round(centerX - boxW / 2);
  const by = Math.round(centerY - boxH / 2);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.lineWidth = Math.max(1.6, 2.0 * scale);
  ctx.strokeStyle = '#090d16';
  ctx.strokeRect(bx, by, boxW, boxH);

  ctx.fillStyle = '#090d16';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + boxW / 2, by + boxH / 2 + 1 * scale);
  ctx.restore();

  return { bx, by, boxW, boxH };
}

function drawCrispAlphaEquationBox(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  subscript: string,
  degValueText: string,
  scale: number,
) {
  ctx.save();
  const mainSize = Math.round(24 * scale);
  const subSize = Math.round(16 * scale);
  const mainFont = `700 ${mainSize}px "Plus Jakarta Sans", "Inter", system-ui, sans-serif`;
  const subFont = `700 ${subSize}px "Plus Jakarta Sans", "Inter", system-ui, sans-serif`;

  ctx.font = mainFont;
  const wAlpha = ctx.measureText('α').width;
  const wRhs = ctx.measureText(` = ${degValueText}`).width;
  ctx.font = subFont;
  const wSub = ctx.measureText(subscript).width;

  const totalTextW = wAlpha + wSub + wRhs + 2 * scale;
  const padX = Math.round(12 * scale);
  const padY = Math.round(7 * scale);
  const boxW = Math.ceil(totalTextW + padX * 2);
  const boxH = Math.ceil(mainSize + padY * 2 + 3 * scale);
  const bx = Math.round(centerX - boxW / 2);
  const by = Math.round(centerY - boxH / 2);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.lineWidth = Math.max(1.6, 2.0 * scale);
  ctx.strokeStyle = '#090d16';
  ctx.strokeRect(bx, by, boxW, boxH);

  let curX = bx + padX;
  const midY = by + boxH / 2;

  ctx.fillStyle = '#090d16';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  ctx.font = mainFont;
  ctx.fillText('α', curX, midY - 1 * scale);
  curX += wAlpha + 1 * scale;

  ctx.font = subFont;
  ctx.fillText(subscript, curX, midY + 6 * scale);
  curX += wSub + 1 * scale;

  ctx.font = mainFont;
  ctx.fillText(` = ${degValueText}`, curX, midY - 1 * scale);

  ctx.restore();
}

function drawFigureBScientificFanOverlay(
  ctx: CanvasRenderingContext2D,
  rig: PhotorealMedicalRig,
  cam: THREE.Camera,
  subX: number,
  subY: number,
  subW: number,
  subH: number,
  spec: SolidComparativeSpec,
  options: SolidComparativeVisualOptions,
  scale: number,
) {
  const { evaluatedParam, alphaSubscript, angleDeg, poseB } = spec;
  const absDeg = Math.round(Math.abs(angleDeg));
  const degStr = `${absDeg}°`;

  let jointKey: JointKey = 'c7';
  let refRad = -Math.PI / 2;
  let activeRad = -Math.PI / 2 + angleDeg * DEG2RAD;
  let arcRadius = 152 * scale;
  let eqOffset = { dx: -86 * scale, dy: -46 * scale };

  switch (evaluatedParam) {
    case 'cervical': {
      jointKey = 'c7';
      const trunkRad = poseB.trunkFlexionDeg * DEG2RAD;
      refRad = -Math.PI / 2 + trunkRad;
      activeRad = refRad + angleDeg * DEG2RAD;
      arcRadius = 156 * scale;
      eqOffset =
        angleDeg >= 0
          ? { dx: -88 * scale, dy: -48 * scale }
          : { dx: 92 * scale, dy: -48 * scale };
      break;
    }
    case 'trunk': {
      jointKey = 'l5s1';
      refRad = -Math.PI / 2;
      activeRad = -Math.PI / 2 + angleDeg * DEG2RAD;
      arcRadius = 185 * scale;
      eqOffset = { dx: -96 * scale, dy: -62 * scale };
      break;
    }
    case 'shoulder': {
      jointKey = 'shoulderR';
      const trunkDownRad = Math.PI / 2 - poseB.trunkFlexionDeg * DEG2RAD;
      refRad = trunkDownRad;
      activeRad = trunkDownRad - angleDeg * DEG2RAD;
      arcRadius = 148 * scale;
      eqOffset = { dx: -92 * scale, dy: -28 * scale };
      break;
    }
    case 'elbow': {
      jointKey = 'elbowR';
      const upperArmDownRad =
        Math.PI / 2 - (poseB.trunkFlexionDeg + poseB.shoulderRFlexionDeg) * DEG2RAD;
      refRad = upperArmDownRad;
      activeRad = upperArmDownRad - angleDeg * DEG2RAD;
      arcRadius = 138 * scale;
      eqOffset = { dx: -92 * scale, dy: -22 * scale };
      break;
    }
    case 'wrist': {
      jointKey = 'wristR';
      const forearmRad =
        Math.PI / 2 -
        (poseB.trunkFlexionDeg + poseB.shoulderRFlexionDeg + poseB.elbowRFlexionDeg) * DEG2RAD;
      refRad = forearmRad;
      activeRad = forearmRad + angleDeg * DEG2RAD;
      arcRadius = 112 * scale;
      eqOffset = { dx: -82 * scale, dy: -52 * scale };
      break;
    }
    case 'knee': {
      jointKey = 'kneeR';
      const thighDownRad = Math.PI / 2 - poseB.hipRFlexionDeg * DEG2RAD;
      refRad = thighDownRad;
      activeRad = thighDownRad + angleDeg * DEG2RAD;
      arcRadius = 140 * scale;
      eqOffset = { dx: 92 * scale, dy: -28 * scale };
      break;
    }
  }

  const pivot = projectJointToSubPanel(rig.joints[jointKey], cam, subX, subY, subW, subH);
  const anticlockwise = activeRad < refRad;
  const sweepAbs = Math.abs(activeRad - refRad);

  if (options.showBlueFanSector && sweepAbs > 0.01) {
    ctx.save();

    const alpha = Math.max(0.18, Math.min(0.82, options.sectorOpacity));
    const grad = ctx.createRadialGradient(
      pivot.x,
      pivot.y,
      4 * scale,
      pivot.x,
      pivot.y,
      arcRadius,
    );
    grad.addColorStop(0, `rgba(96, 165, 250, ${(alpha * 1.08).toFixed(2)})`);
    grad.addColorStop(0.7, `rgba(116, 178, 252, ${alpha.toFixed(2)})`);
    grad.addColorStop(1, `rgba(135, 192, 254, ${(alpha * 0.90).toFixed(2)})`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(pivot.x, pivot.y);
    ctx.arc(pivot.x, pivot.y, arcRadius, refRad, activeRad, anticlockwise);
    ctx.closePath();
    ctx.fill();

    // Crisp black radial reference lines
    const rayExtend = arcRadius + 14 * scale;
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = Math.max(1.5, 2.0 * scale);
    ctx.beginPath();
    ctx.moveTo(pivot.x, pivot.y);
    ctx.lineTo(pivot.x + Math.cos(refRad) * rayExtend, pivot.y + Math.sin(refRad) * rayExtend);
    ctx.moveTo(pivot.x, pivot.y);
    ctx.lineTo(
      pivot.x + Math.cos(activeRad) * rayExtend,
      pivot.y + Math.sin(activeRad) * rayExtend,
    );
    ctx.stroke();

    // Crisp black circular arc + double arrowheads
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = Math.max(1.6, 2.1 * scale);
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, arcRadius, refRad, activeRad, anticlockwise);
    ctx.stroke();

    const arrowLen = Math.min(13 * scale, arcRadius * sweepAbs * 0.38);
    const arrowHalfW = Math.max(3.5 * scale, arrowLen * 0.45);
    if (arrowLen >= 4 * scale) {
      const signDir = anticlockwise ? -1 : 1;
      const tipRefX = pivot.x + Math.cos(refRad) * arcRadius;
      const tipRefY = pivot.y + Math.sin(refRad) * arcRadius;
      const tangentAtRef = refRad - signDir * (Math.PI / 2);
      drawSharpArcArrowhead(ctx, tipRefX, tipRefY, tangentAtRef, arrowLen, arrowHalfW);

      const tipActX = pivot.x + Math.cos(activeRad) * arcRadius;
      const tipActY = pivot.y + Math.sin(activeRad) * arcRadius;
      const tangentAtAct = activeRad + signDir * (Math.PI / 2);
      drawSharpArcArrowhead(ctx, tipActX, tipActY, tangentAtAct, arrowLen, arrowHalfW);
    }

    ctx.restore();
  }

  if (options.showDegreeCalloutBoxes) {
    const midRad = (refRad + activeRad) * 0.5;
    const degDist = arcRadius + 34 * scale;
    const rawDegX = pivot.x + Math.cos(midRad) * degDist;
    const rawDegY = pivot.y + Math.sin(midRad) * degDist;
    const clampedDegX = Math.max(subX + 42 * scale, Math.min(subX + subW - 42 * scale, rawDegX));
    const clampedDegY = Math.max(subY + 26 * scale, Math.min(subY + subH - 55 * scale, rawDegY));

    const degRect = drawCrispDegreeBox(ctx, clampedDegX, clampedDegY, degStr, scale);

    let eqX = pivot.x + eqOffset.dx;
    let eqY = pivot.y + eqOffset.dy;
    eqX = Math.max(subX + 68 * scale, Math.min(subX + subW - 76 * scale, eqX));
    eqY = Math.max(subY + 28 * scale, Math.min(subY + subH - 55 * scale, eqY));

    if (
      Math.abs(eqX - clampedDegX) < degRect.boxW + 58 * scale &&
      Math.abs(eqY - clampedDegY) < 42 * scale
    ) {
      eqY = clampedDegY + 48 * scale;
    }

    drawCrispAlphaEquationBox(ctx, eqX, eqY, alphaSubscript, degStr, scale);
  }
}

function wrapLinesToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = text.split('\n');
  const out: string[] = [];
  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let cur = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${cur} ${words[i]}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        cur = candidate;
      } else {
        out.push(cur);
        cur = words[i];
      }
    }
    out.push(cur);
  }
  return out;
}

export function renderSolidComparativeToCanvas(
  spec: SolidComparativeSpec,
  options: SolidComparativeVisualOptions = DEFAULT_SOLID_COMPARATIVE_OPTIONS,
  pixelScale = 1,
): HTMLCanvasElement {
  const baseW = options.aspectPreset === 'square_1000' ? 1000 : 800;
  const baseH = options.aspectPreset === 'square_1000' ? 1000 : 560;
  const W = Math.round(baseW * pixelScale);
  const H = Math.round(baseH * pixelScale);
  const uiScale = (baseH === 1000 ? 1.0 : 0.66) * pixelScale;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = W;
  outCanvas.height = H;
  const ctx = outCanvas.getContext('2d')!;

  // 1. Clean #ffffff white medical manual background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const cleanKicker =
    sanitizeManualImageText(spec.headerKicker) || 'EVALUACIÓN POSTURAL';
  const cleanTitle = sanitizeManualImageText(spec.headerTitle) || spec.codeLabel;
  const cleanTopLeft = sanitizeManualImageText(spec.topLeftSegmentLabel);

  // 2. Top Header Banner (Spanish typography, zero model meta-text)
  let bodyTopY = Math.round(16 * uiScale);
  if (options.showHeaderBanner) {
    const bannerH = Math.round(96 * uiScale);
    ctx.fillStyle = '#f5f8fa';
    ctx.fillRect(0, 0, W, bannerH);

    ctx.strokeStyle = '#d1d9e2';
    ctx.lineWidth = Math.max(1, 1.2 * pixelScale);
    ctx.beginPath();
    ctx.moveTo(0, bannerH);
    ctx.lineTo(W, bannerH);
    ctx.stroke();

    const kickerFontPx = Math.round(18 * uiScale);
    ctx.font = `700 ${kickerFontPx}px "JetBrains Mono", "IBM Plex Mono", monospace`;
    ctx.fillStyle = '#2563eb';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const kickerX = Math.round(24 * uiScale);
    ctx.fillText(cleanKicker, kickerX, Math.round(bannerH * 0.5));
    const kickerW = ctx.measureText(cleanKicker).width;

    const titleX = kickerX + Math.ceil(kickerW + 22 * uiScale);
    const maxTitleW = W - titleX - Math.round(24 * uiScale);
    let titleFontPx = Math.round(24 * uiScale);
    ctx.font = `700 ${titleFontPx}px "Plus Jakarta Sans", "Inter", system-ui, sans-serif`;
    let lines = wrapLinesToWidth(ctx, cleanTitle, maxTitleW);
    if (lines.length > 2) {
      titleFontPx = Math.round(20 * uiScale);
      ctx.font = `700 ${titleFontPx}px "Plus Jakarta Sans", "Inter", system-ui, sans-serif`;
      lines = wrapLinesToWidth(ctx, cleanTitle, maxTitleW).slice(0, 2);
    }

    ctx.fillStyle = '#090d16';
    const lineGap = Math.round(titleFontPx * 1.26);
    const totalTextH = (lines.length - 1) * lineGap;
    const startTitleY = Math.round(bannerH / 2 - totalTextH / 2);
    lines.forEach((ln, idx) => {
      ctx.fillText(ln, titleX, startTitleY + idx * lineGap);
    });

    bodyTopY = bannerH + Math.round(6 * uiScale);
  }

  const bottomFooterH = options.showBottomCaption
    ? Math.round(52 * uiScale)
    : Math.round(16 * uiScale);
  const stageH = H - bodyTopY - bottomFooterH;
  const subW = Math.floor(W * 0.5);
  const subH = stageH;

  const engine = getSolidComparativeEngine();

  if (engine) {
    const { renderer, scene, orthoCam, rig } = engine;
    renderer.setPixelRatio(1);
    renderer.setSize(subW, subH, false);

    const viewHeightMeters = 2.04;
    const halfExtY = viewHeightMeters * 0.5;
    const aspect = subW / Math.max(1, subH);
    const halfExtZ = halfExtY * aspect;
    const centerY = 0.94;
    const centerZFigA = 0.04;
    const centerZFigB = 0.07;

    const renderSingleFigure = (
      pose: PosturePose3D,
      destX: number,
      destY: number,
      centerZ: number,
      labelLetter: 'A' | 'B',
      isFigureB: boolean,
    ) => {
      applyPoseToPhotorealRig(rig, pose, 'full_body', true);

      orthoCam.left = -halfExtZ;
      orthoCam.right = halfExtZ;
      orthoCam.top = halfExtY;
      orthoCam.bottom = -halfExtY;
      orthoCam.near = 0.05;
      orthoCam.far = 16;
      orthoCam.position.set(-4.5, centerY, centerZ);
      orthoCam.up.set(0, 1, 0);
      orthoCam.lookAt(0, centerY, centerZ);
      orthoCam.updateProjectionMatrix();
      orthoCam.updateMatrixWorld(true);

      const ankleScreen = projectJointToSubPanel(
        rig.joints.ankleR,
        orthoCam,
        destX,
        destY,
        subW,
        subH,
      );
      const footScreen = projectJointToSubPanel(
        rig.joints.footR,
        orthoCam,
        destX,
        destY,
        subW,
        subH,
      );
      const soleY = Math.max(ankleScreen.y, footScreen.y) + 12 * uiScale;
      const midFootX = (ankleScreen.x + footScreen.x) * 0.5 + 8 * uiScale;
      drawEllipticalStudioShadow(ctx, midFootX, soleY, 82 * uiScale, 11 * uiScale);

      renderer.render(scene, orthoCam);
      ctx.drawImage(renderer.domElement, destX, destY, subW, subH);

      ctx.save();
      const letterSize = Math.round(38 * uiScale);
      ctx.font = `700 ${letterSize}px "Plus Jakarta Sans", "Inter", system-ui, sans-serif`;
      ctx.fillStyle = '#090d16';
      ctx.textBaseline = 'alphabetic';
      if (labelLetter === 'A') {
        ctx.textAlign = 'right';
        ctx.fillText('A', ankleScreen.x - 36 * uiScale, soleY - 2 * uiScale);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText('B', footScreen.x + 48 * uiScale, soleY - 2 * uiScale);
      }
      ctx.restore();

      if (isFigureB) {
        drawFigureBScientificFanOverlay(
          ctx,
          rig,
          orthoCam,
          destX,
          destY,
          subW,
          subH,
          spec,
          options,
          uiScale,
        );
      }
    };

    renderSingleFigure(spec.poseA, 0, bodyTopY, centerZFigA, 'A', false);

    if (options.showTopLeftSegmentText && cleanTopLeft) {
      ctx.save();
      const segFontPx = Math.round(23 * uiScale);
      ctx.font = `700 ${segFontPx}px "Plus Jakarta Sans", "Inter", system-ui, sans-serif`;
      ctx.fillStyle = '#090d16';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const segLines = wrapLinesToWidth(ctx, cleanTopLeft, subW * 0.92);
      const segStartX = Math.round(22 * uiScale);
      const segStartY = bodyTopY + Math.round(12 * uiScale);
      segLines.slice(0, 3).forEach((ln, idx) => {
        ctx.fillText(ln, segStartX, segStartY + idx * Math.round(segFontPx * 1.28));
      });
      ctx.restore();
    }

    renderSingleFigure(spec.poseB, subW, bodyTopY, centerZFigB, 'B', true);
  } else {
    ctx.fillStyle = '#334155';
    ctx.font = `600 ${Math.round(18 * uiScale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(
      `Comparativa Sagital A (Neutra) vs B (α${spec.alphaSubscript} = ${spec.angleDeg}°)`,
      W / 2,
      H / 2,
    );
  }

  // 3. Centered Technical Footer ('Postura de evaluación · Marcadores de ángulo · Plano Sagital')
  if (options.showBottomCaption) {
    const cleanFooter = sanitizeManualImageText(spec.bottomCaption) || MEDICAL_MANUAL_FOOTER_ES;
    const footerText = cleanFooter.includes('Postura de evaluación')
      ? cleanFooter
      : MEDICAL_MANUAL_FOOTER_ES;

    ctx.save();
    const capFontPx = Math.round(20 * uiScale);
    ctx.font = `600 ${capFontPx}px "Plus Jakarta Sans", "Inter", system-ui, sans-serif`;
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(footerText, W / 2, H - Math.round(bottomFooterH * 0.52));
    ctx.restore();
  }

  // 4. Clean Thin Outer Border
  if (options.showThinOuterBorder) {
    ctx.save();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = Math.max(1.5, 2 * pixelScale);
    ctx.strokeRect(
      ctx.lineWidth * 0.5,
      ctx.lineWidth * 0.5,
      W - ctx.lineWidth,
      H - ctx.lineWidth,
    );
    ctx.restore();
  }

  return outCanvas;
}

export async function exportSolidComparativePng(
  spec: SolidComparativeSpec,
  options: SolidComparativeVisualOptions,
  qualityMode: 'hd_editorial' | 'compact_120kb' = 'hd_editorial',
): Promise<RenderedPngResult> {
  const pixelScale = qualityMode === 'hd_editorial' ? 1.5 : 1.0;
  const canvas = renderSolidComparativeToCanvas(spec, options, pixelScale);
  if (qualityMode === 'hd_editorial') {
    return exportCanvasToHighQualityPng(canvas);
  }
  return exportCanvasToOptimizedPng(canvas);
}

export function buildSolidComparativeSpecFromBookFigure(
  fig: BookFigureFileSpec,
): SolidComparativeSpec {
  const activePanel =
    fig.panels && fig.panels.length > 0
      ? fig.panels[fig.panels.length - 1]
      : undefined;

  if (!activePanel) {
    return MASTER_COMPARATIVE_PRESETS[0];
  }

  const p = activePanel.pose;

  let evaluatedParam: EvaluatedJointParam = 'cervical';
  let alphaSubscript = 'c';
  let angleDeg = 30;
  let segmentEs = 'Columna cervical C1–C7 y cabeza';
  let actionEn = 'cervical flexion of 30 degrees';

  const zone = activePanel.focusZone;
  if (
    zone === 'neck_cervical' ||
    (Math.abs(p.neckFlexionDeg) >= 12 && Math.abs(p.trunkFlexionDeg) < 10)
  ) {
    evaluatedParam = 'cervical';
    alphaSubscript = 'c';
    angleDeg = p.neckFlexionDeg !== 0 ? p.neckFlexionDeg : 25;
    segmentEs = 'Columna cervical C1–C7 y cabeza\n(aislado)';
    actionEn =
      angleDeg >= 0
        ? `cervical flexion of ${Math.abs(angleDeg)} degrees`
        : `cervical extension of ${Math.abs(angleDeg)} degrees`;
  } else if (zone === 'wrist_hand' || Math.abs(p.wristRFlexionDeg) >= 12) {
    evaluatedParam = 'wrist';
    alphaSubscript = 'm';
    angleDeg = p.wristRFlexionDeg !== 0 ? p.wristRFlexionDeg : 20;
    segmentEs = 'Articulación radiocarpiana\n(muñeca y mano)';
    actionEn = `wrist flexion of ${Math.abs(angleDeg)} degrees`;
  } else if (zone === 'elbow_forearm') {
    evaluatedParam = 'elbow';
    alphaSubscript = 'a';
    angleDeg = p.elbowRFlexionDeg !== 0 ? p.elbowRFlexionDeg : 85;
    segmentEs = 'Articulación humeroulnar\n(codo y antebrazo)';
    actionEn = `elbow flexion of ${Math.abs(angleDeg)} degrees`;
  } else if (zone === 'shoulder_arm' || Math.abs(p.shoulderRFlexionDeg) >= 25) {
    evaluatedParam = 'shoulder';
    alphaSubscript = 'b';
    angleDeg = p.shoulderRFlexionDeg !== 0 ? p.shoulderRFlexionDeg : 55;
    segmentEs = 'Complejo glenohumeral\n(hombro y brazo)';
    actionEn = `shoulder flexion of ${Math.abs(angleDeg)} degrees`;
  } else if (
    zone === 'legs_knees' ||
    zone === 'ankle_foot' ||
    Math.abs(p.kneeRFlexionDeg) >= 25
  ) {
    evaluatedParam = 'knee';
    alphaSubscript = 'p';
    angleDeg = p.kneeRFlexionDeg > 8 ? p.kneeRFlexionDeg : 40;
    segmentEs = 'Miembros inferiores\n(rodilla y soporte podal)';
    actionEn = `knee flexion of ${Math.abs(angleDeg)} degrees`;
  } else {
    evaluatedParam = 'trunk';
    alphaSubscript = 't';
    angleDeg = p.trunkFlexionDeg !== 0 ? p.trunkFlexionDeg : 35;
    segmentEs = 'Columna dorsolumbar L5/S1\n(tronco y pelvis)';
    actionEn = `anterior trunk flexion of ${Math.abs(angleDeg)} degrees`;
  }

  const poseB = makeSolidStandingNeutralPose({
    ...p,
    elbowRFlexionDeg:
      evaluatedParam === 'cervical' ||
      (evaluatedParam === 'trunk' && (!p.prop || p.prop === 'none'))
        ? 12
        : p.elbowRFlexionDeg,
    elbowLFlexionDeg:
      evaluatedParam === 'cervical' ||
      (evaluatedParam === 'trunk' && (!p.prop || p.prop === 'none'))
        ? 12
        : p.elbowLFlexionDeg,
    shoulderRFlexionDeg:
      evaluatedParam === 'cervical'
        ? 2
        : evaluatedParam === 'trunk' && (!p.prop || p.prop === 'none')
          ? Math.min(36, Math.max(4, p.trunkFlexionDeg * 0.55))
          : p.shoulderRFlexionDeg,
    shoulderLFlexionDeg:
      evaluatedParam === 'cervical'
        ? 2
        : evaluatedParam === 'trunk' && (!p.prop || p.prop === 'none')
          ? Math.min(36, Math.max(4, p.trunkFlexionDeg * 0.55))
          : p.shoulderLFlexionDeg,
  });

  return {
    id: fig.id,
    codeLabel: `Fig. ${fig.figureNumber}${fig.subPart || ''}`,
    headerKicker: `FIGURA ${fig.figureNumber}${fig.subPart || ''}`,
    headerTitle: `${sanitizeManualImageText(fig.title)} (Postura de Evaluación)`,
    topLeftSegmentLabel: segmentEs,
    bottomCaption: MEDICAL_MANUAL_FOOTER_ES,
    evaluatedParam,
    alphaSubscript,
    angleDeg,
    englishActionPhrase: actionEn,
    poseA: makeSolidStandingNeutralPose(),
    poseB,
    methodRef: `${fig.chapterTitle} · ${fig.fileName}`,
  };
}

export async function renderBookFigureInSolidComparativeStyle(
  fig: BookFigureFileSpec,
  options: SolidComparativeVisualOptions,
  qualityMode: 'hd_editorial' | 'compact_120kb' = 'hd_editorial',
): Promise<RenderedPngResult> {
  if (fig.renderMode === 'diagram' || fig.renderMode === 'real_chart') {
    const scale = qualityMode === 'hd_editorial' ? 2 : 1;
    const canvas = document.createElement('canvas');
    if (fig.diagramId) {
      renderDiagramVariant(canvas, fig.diagramId, fig.widthPx, fig.heightPx, scale);
    }
    return qualityMode === 'hd_editorial'
      ? exportCanvasToHighQualityPng(canvas)
      : exportCanvasToOptimizedPng(canvas);
  }

  const spec = buildSolidComparativeSpecFromBookFigure(fig);
  const effectiveOpts: SolidComparativeVisualOptions = {
    ...options,
    aspectPreset: qualityMode === 'compact_120kb' ? 'plan_800x520' : options.aspectPreset,
  };
  return exportSolidComparativePng(spec, effectiveOpts, qualityMode);
}

/**
 * Generates the synchronized photorealistic medical manual prompt matching the exact specification.
 */
export function buildScientificComparativePrompt(spec: SolidComparativeSpec): string {
  const absDeg = Math.round(Math.abs(spec.angleDeg));
  return `Photorealistic technical ergonomic manual illustration on a clean white background with a thin border. Side-by-side comparative layout ('A' neutral standing reference posture and 'B' evaluated active posture executing ${spec.englishActionPhrase}) of a realistic 3D digital human anatomical model in a precise sagittal (side) profile view, featuring natural skin texture, clean studio lighting, and subtle shadows. The model wears identical solid dark grey short-sleeve scrubs top and solid grey long pants, completely free of patterns, logos, pockets, or drawings. Semi-transparent blue angular sector, measurement arcs, and arrows on Figure B with crisp black outlines and high-contrast white text boxes ('${absDeg}°' and 'α_${spec.alphaSubscript} = ${absDeg}°') in clean Spanish typography. Centered bottom technical footer: '${MEDICAL_MANUAL_FOOTER_ES}'. Clean professional medical manual render style.`;
}

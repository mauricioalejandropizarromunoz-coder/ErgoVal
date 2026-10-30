import * as THREE from 'three';
import {
  createPhotorealSkinTexture,
  createSolidDarkGreyScrubsTopTexture,
  drawEllipticalStudioShadow,
  setupMedicalStudioLighting,
} from './realisticHumanRig';
import { NORMATIVE_JOINT_LIMITS } from './normativeJointLimits';

export type HandGripPresetId =
  | 'niosh_good_handle'
  | 'niosh_fair_hook90'
  | 'niosh_poor_bulky'
  | 'ocra_dynamic_grasp'
  | 'ocra_static_pinch'
  | 'jsi_neutral'
  | 'jsi_flexed'
  | 'jsi_extreme'
  | 'iso5349_power_handle'
  | 'owas_load_grip';

export interface HandGripProjectedLandmarks {
  wrist: { x: number; y: number };
  forearmRef: { x: number; y: number };
  neutralAxisTip: { x: number; y: number };
  mc3Head: { x: number; y: number };
  indexMcp: { x: number; y: number };
  indexPip: { x: number; y: number };
  indexTip: { x: number; y: number };
  thumbTip: { x: number; y: number };
  propCenter: { x: number; y: number };
  isoZhTip: { x: number; y: number };
  isoXhTip: { x: number; y: number };
  isoYhTip: { x: number; y: number };
}

interface FingerJointAngles {
  mcpFlexDeg: number;
  pipFlexDeg: number;
  dipFlexDeg: number;
  splayDeg: number;
}

interface ThumbJointAngles {
  cmcRadialDeg: number;
  cmcPalmarDeg: number;
  opposeRollDeg: number;
  mcpFlexDeg: number;
  ipFlexDeg: number;
}

interface HandPoseConfig {
  rootEulerDeg: [number, number, number];
  pronationDeg: number;
  wristFlexDeg: number; // + palmar flexion (-Y), - dorsal extension (+Y)
  wristDevDeg: number; // + ulnar (-Z), - radial (+Z)
  fingers: [FingerJointAngles, FingerJointAngles, FingerJointAngles, FingerJointAngles]; // Index, Middle, Ring, Little
  thumb: ThumbJointAngles;
  cameraAzimuthDeg: number;
  cameraElevationDeg: number;
  cameraZoom: number;
  highlightMc3?: boolean;
}

interface SpineSample {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  halfWidth: number;
  dorsalThick: number;
  palmarThick: number;
}

interface HandSingletonEngine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  orthoCam: THREE.OrthographicCamera;
  contentRoot: THREE.Group;
  skinMat: THREE.MeshPhysicalMaterial;
  scrubCuffMat: THREE.MeshPhysicalMaterial;
  nodeHighlightMat: THREE.MeshStandardMaterial;
  nailMat: THREE.MeshStandardMaterial;
  isSoftware: boolean;
}

const DEG2RAD = Math.PI / 180;

let sharedHandEngine: HandSingletonEngine | null = null;
let handWebglFailed = false;

function detectSoftwareRenderer(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return false;
    const str = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(str);
  } catch {
    return false;
  }
}

function getHandEngine(): HandSingletonEngine | null {
  if (handWebglFailed) return null;
  if (sharedHandEngine) return sharedHandEngine;

  try {
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    const isSoftware = detectSoftwareRenderer(renderer);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    scene.background = null;

    setupMedicalStudioLighting(scene, renderer);

    const contentRoot = new THREE.Group();
    scene.add(contentRoot);

    const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 15);

    const maxAniso = renderer.capabilities.getMaxAnisotropy() || 1;
    const skinTex = createPhotorealSkinTexture(maxAniso);
    const scrubTex = createSolidDarkGreyScrubsTopTexture(maxAniso, false);

    const skinMat = new THREE.MeshPhysicalMaterial({
      map: skinTex,
      roughness: 0.52,
      metalness: 0.01,
      sheen: 0.22,
      sheenRoughness: 0.65,
      sheenColor: new THREE.Color(0xffe4d6),
      clearcoat: 0.05,
      clearcoatRoughness: 0.48,
    });

    const scrubCuffMat = new THREE.MeshPhysicalMaterial({
      map: scrubTex,
      roughness: 0.80,
      metalness: 0.01,
      sheen: 0.16,
      sheenRoughness: 0.82,
      sheenColor: new THREE.Color(0x9ca3af),
    });

    const nodeHighlightMat = new THREE.MeshStandardMaterial({
      color: 0xea580c,
      roughness: 0.22,
      metalness: 0.12,
      emissive: new THREE.Color(0xc2410c),
      emissiveIntensity: 0.28,
    });

    const nailMat = new THREE.MeshStandardMaterial({
      color: 0xedd5c7,
      roughness: 0.34,
      metalness: 0.02,
    });

    sharedHandEngine = {
      renderer,
      scene,
      orthoCam,
      contentRoot,
      skinMat,
      scrubCuffMat,
      nodeHighlightMat,
      nailMat,
      isSoftware,
    };
    return sharedHandEngine;
  } catch (err) {
    console.warn('Hand WebGL engine unavailable, using 2D fallback:', err);
    handWebglFailed = true;
    return null;
  }
}

function clearGroup(group: THREE.Group, sharedMats: Set<THREE.Material>) {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    child.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => {
          if (!sharedMats.has(m)) m.dispose();
        });
      }
    });
  }
}

/**
 * Builds a seamless organic skin tube along a quaternion-framed spine with asymmetric
 * dorsal vs palmar thickness and hemispherical rounded end-caps.
 */
function buildQuaternionLoftGeometry(
  samples: SpineSample[],
  radialSegs = 24,
  capStart = true,
  capEnd = true,
  radialOutset = 0,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ringStride = radialSegs + 1;
  const n = samples.length;

  const rightVec = new THREE.Vector3();
  const dorsalVec = new THREE.Vector3();

  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    let capFactor = 1.0;
    if (capStart && t < 0.06) {
      capFactor = Math.max(0.08, Math.sin((t / 0.06) * (Math.PI / 2)));
    } else if (capEnd && t > 0.9) {
      const u = (1 - t) / 0.1;
      capFactor = Math.max(0.08, Math.sin(u * (Math.PI / 2)));
    }

    const s = samples[i];
    rightVec.set(0, 0, 1).applyQuaternion(s.quat);
    dorsalVec.set(0, 1, 0).applyQuaternion(s.quat);

    const hw = (s.halfWidth + radialOutset) * capFactor;
    const hd = (s.dorsalThick + radialOutset) * capFactor;
    const hp = (s.palmarThick + radialOutset) * capFactor;

    for (let j = 0; j <= radialSegs; j++) {
      const vUv = j / radialSegs;
      const phi = vUv * Math.PI * 2;
      const cosP = Math.cos(phi);
      const sinP = Math.sin(phi);
      const yThick = sinP >= 0 ? hd : hp;

      const px = s.pos.x + rightVec.x * (cosP * hw) + dorsalVec.x * (sinP * yThick);
      const py = s.pos.y + rightVec.y * (cosP * hw) + dorsalVec.y * (sinP * yThick);
      const pz = s.pos.z + rightVec.z * (cosP * hw) + dorsalVec.z * (sinP * yThick);
      positions.push(px, py, pz);
      uvs.push(vUv, t);
    }
  }

  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * ringStride + j;
      const b = (i + 1) * ringStride + j;
      const c = (i + 1) * ringStride + (j + 1);
      const d = i * ringStride + (j + 1);
      indices.push(a, b, c);
      indices.push(a, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function addCrispPropEdges(mesh: THREE.Mesh, edgeHex = 0x334155, opacity = 0.55) {
  const edges = new THREE.EdgesGeometry(mesh.geometry, 24);
  const line = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: edgeHex, transparent: true, opacity }),
  );
  line.renderOrder = 2;
  mesh.add(line);
}

function getPresetPoseConfig(preset: HandGripPresetId): HandPoseConfig {
  const FL = NORMATIVE_JOINT_LIMITS.fingers;
  const clampDeg = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const makeFinger = (mcp: number, pip: number, dip: number, splay = 0): FingerJointAngles => ({
    mcpFlexDeg: clampDeg(mcp, FL.mcpExtensionMinDeg, FL.mcpFlexionMaxDeg),
    pipFlexDeg: clampDeg(pip, FL.pipExtensionMinDeg, FL.pipFlexionMaxDeg),
    dipFlexDeg: clampDeg(dip, FL.dipExtensionMinDeg, FL.dipFlexionMaxDeg),
    splayDeg: splay,
  });

  switch (preset) {
    case 'niosh_good_handle':
      return {
        rootEulerDeg: [0, 0, -10],
        pronationDeg: 8,
        wristFlexDeg: -6,
        wristDevDeg: 0,
        fingers: [
          makeFinger(68, 83, 56, -3),
          makeFinger(71, 86, 60, 0),
          makeFinger(73, 86, 61, 2),
          makeFinger(75, 85, 62, 5),
        ],
        thumb: {
          cmcRadialDeg: 22,
          cmcPalmarDeg: 40,
          opposeRollDeg: 58,
          mcpFlexDeg: 42,
          ipFlexDeg: 48,
        },
        cameraAzimuthDeg: 36,
        cameraElevationDeg: 22,
        cameraZoom: 1.08,
      };

    case 'niosh_fair_hook90':
      return {
        // Forearm enters from left; supinated palm cradles box underside while 4 fingers flex ~90° (MCF 90.5° máx) up box wall!
        rootEulerDeg: [0, 0, -10],
        pronationDeg: -162,
        wristFlexDeg: 8,
        wristDevDeg: 0,
        fingers: [
          makeFinger(88, 12, 8, -2),
          makeFinger(90.5, 12, 8, 0),
          makeFinger(90.5, 12, 8, 2),
          makeFinger(89, 14, 10, 4),
        ],
        thumb: {
          cmcRadialDeg: 28,
          cmcPalmarDeg: 28,
          opposeRollDeg: 38,
          mcpFlexDeg: 20,
          ipFlexDeg: 16,
        },
        cameraAzimuthDeg: 26,
        cameraElevationDeg: 18,
        cameraZoom: 1.06,
      };

    case 'niosh_poor_bulky':
      return {
        rootEulerDeg: [0, 0, -18],
        pronationDeg: 16,
        wristFlexDeg: 34,
        wristDevDeg: 18,
        fingers: [
          makeFinger(24, 24, 18, -14),
          makeFinger(26, 25, 18, -4),
          makeFinger(28, 25, 18, 6),
          makeFinger(30, 24, 16, 16),
        ],
        thumb: {
          cmcRadialDeg: 38,
          cmcPalmarDeg: 26,
          opposeRollDeg: 32,
          mcpFlexDeg: 16,
          ipFlexDeg: 14,
        },
        cameraAzimuthDeg: 34,
        cameraElevationDeg: 22,
        cameraZoom: 1.02,
      };

    case 'ocra_dynamic_grasp':
      return {
        rootEulerDeg: [0, 0, -14],
        pronationDeg: 18,
        wristFlexDeg: -8,
        wristDevDeg: 0,
        fingers: [
          makeFinger(54, 68, 42, -5),
          makeFinger(58, 70, 44, -1),
          makeFinger(62, 72, 46, 3),
          makeFinger(66, 72, 46, 7),
        ],
        thumb: {
          cmcRadialDeg: 26,
          cmcPalmarDeg: 40,
          opposeRollDeg: 62,
          mcpFlexDeg: 32,
          ipFlexDeg: 36,
        },
        cameraAzimuthDeg: 34,
        cameraElevationDeg: 24,
        cameraZoom: 1.05,
      };

    case 'ocra_static_pinch':
      return {
        rootEulerDeg: [0, 0, -8],
        pronationDeg: 12,
        wristFlexDeg: 16,
        wristDevDeg: 4,
        fingers: [
          makeFinger(38, 52, 30, -3), // Index pinching object opposite thumb!
          makeFinger(42, 54, 32, 0),  // Middle assisting precision pinch
          makeFinger(68, 82, 54, 4),  // Ring curled naturally into palm
          makeFinger(74, 84, 56, 8),  // Little curled naturally into palm
        ],
        thumb: {
          cmcRadialDeg: 16,
          cmcPalmarDeg: 44,
          opposeRollDeg: 68,
          mcpFlexDeg: 22,
          ipFlexDeg: 26,
        },
        cameraAzimuthDeg: 30,
        cameraElevationDeg: 18,
        cameraZoom: 1.12,
      };

    case 'jsi_neutral':
      return {
        rootEulerDeg: [0, 0, 0],
        pronationDeg: 8,
        wristFlexDeg: 0,
        wristDevDeg: 0,
        fingers: [
          makeFinger(68, 82, 56, -2),
          makeFinger(72, 84, 58, 0),
          makeFinger(74, 84, 58, 2),
          makeFinger(76, 82, 56, 4),
        ],
        thumb: {
          cmcRadialDeg: 22,
          cmcPalmarDeg: 38,
          opposeRollDeg: 58,
          mcpFlexDeg: 38,
          ipFlexDeg: 42,
        },
        cameraAzimuthDeg: 26,
        cameraElevationDeg: 18,
        cameraZoom: 1.08,
      };

    case 'jsi_flexed':
      return {
        rootEulerDeg: [0, 0, 0],
        pronationDeg: 8,
        wristFlexDeg: 30,
        wristDevDeg: 6,
        fingers: [
          makeFinger(66, 80, 54, -2),
          makeFinger(70, 82, 56, 0),
          makeFinger(72, 82, 56, 2),
          makeFinger(74, 80, 54, 4),
        ],
        thumb: {
          cmcRadialDeg: 22,
          cmcPalmarDeg: 36,
          opposeRollDeg: 56,
          mcpFlexDeg: 38,
          ipFlexDeg: 42,
        },
        cameraAzimuthDeg: 24,
        cameraElevationDeg: 16,
        cameraZoom: 1.05,
      };

    case 'jsi_extreme':
      return {
        rootEulerDeg: [0, 0, 0],
        pronationDeg: 14,
        wristFlexDeg: 48,
        wristDevDeg: 22,
        fingers: [
          makeFinger(54, 72, 48, -4),
          makeFinger(58, 74, 50, 0),
          makeFinger(62, 76, 52, 4),
          makeFinger(66, 76, 52, 8),
        ],
        thumb: {
          cmcRadialDeg: 24,
          cmcPalmarDeg: 40,
          opposeRollDeg: 60,
          mcpFlexDeg: 34,
          ipFlexDeg: 38,
        },
        cameraAzimuthDeg: 28,
        cameraElevationDeg: 22,
        cameraZoom: 1.02,
      };

    case 'iso5349_power_handle':
      return {
        rootEulerDeg: [0, 0, -4],
        pronationDeg: 10,
        wristFlexDeg: -5,
        wristDevDeg: 0,
        fingers: [
          makeFinger(70, 84, 58, -3),
          makeFinger(74, 86, 60, 0),
          makeFinger(76, 86, 60, 2),
          makeFinger(78, 84, 58, 5),
        ],
        thumb: {
          cmcRadialDeg: 22,
          cmcPalmarDeg: 38,
          opposeRollDeg: 58,
          mcpFlexDeg: 40,
          ipFlexDeg: 44,
        },
        cameraAzimuthDeg: 36,
        cameraElevationDeg: 26,
        cameraZoom: 1.08,
        highlightMc3: true,
      };

    case 'owas_load_grip':
      return {
        rootEulerDeg: [0, 0, -86],
        pronationDeg: 10,
        wristFlexDeg: 0,
        wristDevDeg: 0,
        fingers: [
          makeFinger(72, 84, 58, -2),
          makeFinger(74, 86, 60, 0),
          makeFinger(76, 86, 60, 2),
          makeFinger(78, 84, 58, 4),
        ],
        thumb: {
          cmcRadialDeg: 22,
          cmcPalmarDeg: 38,
          opposeRollDeg: 58,
          mcpFlexDeg: 40,
          ipFlexDeg: 44,
        },
        cameraAzimuthDeg: 34,
        cameraElevationDeg: 16,
        cameraZoom: 1.05,
      };
  }
}

function buildHandAndPropScene(
  engine: HandSingletonEngine,
  preset: HandGripPresetId,
  cfg: HandPoseConfig,
): {
  handGroup: THREE.Group;
  worldPts: Record<keyof HandGripProjectedLandmarks, THREE.Vector3>;
} {
  const segs = engine.isSoftware ? 18 : 26;
  const handGroup = new THREE.Group();
  handGroup.rotation.set(
    cfg.rootEulerDeg[0] * DEG2RAD,
    cfg.rootEulerDeg[1] * DEG2RAD,
    cfg.rootEulerDeg[2] * DEG2RAD,
  );
  engine.contentRoot.add(handGroup);

  const qForearmEnd = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    cfg.pronationDeg * DEG2RAD,
  );
  const qFlex = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    -cfg.wristFlexDeg * DEG2RAD,
  );
  const qDev = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    -cfg.wristDevDeg * DEG2RAD,
  );
  const qWrist = qForearmEnd.clone().multiply(qFlex).multiply(qDev);

  // =========================================================================
  // 1. CONTINUOUS FOREARM -> WRIST -> HUMAN PALM SKIN + INTERNAL BONES
  // =========================================================================
  const armPalmSamples: SpineSample[] = [];
  const forearmLen = 0.165;
  const palmLen = 0.088;
  const totalForearmSteps = 14;
  const totalPalmSteps = 14;

  for (let i = 0; i <= totalForearmSteps; i++) {
    const u = i / totalForearmSteps; // 0 (proximal -0.165) -> 1 (wrist 0)
    const x = -forearmLen * (1 - u);
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      cfg.pronationDeg * (0.35 + 0.65 * u) * DEG2RAD,
    );
    // Natural brachioradialis muscular forearm belly tapering to oval human wrist
    const belly = Math.sin(Math.pow(1 - u, 0.85) * Math.PI * 0.72);
    const hw = 0.028 + 0.011 * belly;
    const hd = 0.019 + 0.014 * belly;
    const hp = 0.02 + 0.015 * belly;
    armPalmSamples.push({
      pos: new THREE.Vector3(x, 0, 0),
      quat: q,
      halfWidth: hw,
      dorsalThick: hd,
      palmarThick: hp,
    });
  }

  const curPalmPos = new THREE.Vector3(0, 0, 0);
  const stepPalm = palmLen / totalPalmSteps;
  const forwardDir = new THREE.Vector3();

  for (let i = 1; i <= totalPalmSteps; i++) {
    const v = i / totalPalmSteps; // 0..1 along human palm
    const blend = Math.min(1, v / 0.28);
    const smoothBlend = 0.5 - 0.5 * Math.cos(blend * Math.PI);
    const q = qForearmEnd.clone().slerp(qWrist, smoothBlend);

    forwardDir.set(1, 0, 0).applyQuaternion(q);
    curPalmPos.addScaledVector(forwardDir, stepPalm);

    // Broadening human metacarpus from carpus (0.029) to 4-knuckle arch (0.043)
    const palmSpread = 0.5 - 0.5 * Math.cos(Math.min(1, v / 0.82) * Math.PI);
    const hw = 0.029 + 0.0145 * palmSpread;
    const hd = 0.018 - 0.0055 * v;
    const hp = 0.02 - 0.004 * v;

    armPalmSamples.push({
      pos: curPalmPos.clone(),
      quat: q,
      halfWidth: hw,
      dorsalThick: hd,
      palmarThick: hp,
    });
  }

  const armPalmMesh = new THREE.Mesh(
    buildQuaternionLoftGeometry(armPalmSamples, segs, true, true, 0),
    engine.skinMat,
  );
  armPalmMesh.renderOrder = 3;
  handGroup.add(armPalmMesh);

  // Clean solid dark-grey medical scrub cuff over proximal forearm entry (100% free of logos/pockets)
  const scrubCuffSamples = armPalmSamples.slice(0, 6);
  const scrubCuffMesh = new THREE.Mesh(
    buildQuaternionLoftGeometry(scrubCuffSamples, segs, true, false, 0.0032),
    engine.scrubCuffMat,
  );
  scrubCuffMesh.renderOrder = 3;
  handGroup.add(scrubCuffMesh);

  // =========================================================================
  // 2. PALM METACARPALS & 4 CONTINUOUS 3-PHALANX HUMAN FINGERS
  // =========================================================================
  const palmLocalToHand = (lx: number, ly: number, lz: number): THREE.Vector3 => {
    return new THREE.Vector3(lx, ly, lz).applyQuaternion(qWrist);
  };

  const fingerDefs = [
    { z: 0.030, xMcp: 0.086, yMcp: 0.000, l1: 0.041, l2: 0.025, l3: 0.018, r0: 0.0088 }, // Index
    { z: 0.010, xMcp: 0.090, yMcp: 0.002, l1: 0.046, l2: 0.028, l3: 0.019, r0: 0.0093 }, // Middle (3rd)
    { z: -0.010, xMcp: 0.085, yMcp: 0.001, l1: 0.042, l2: 0.026, l3: 0.018, r0: 0.0087 }, // Ring
    { z: -0.029, xMcp: 0.077, yMcp: -0.001, l1: 0.034, l2: 0.020, l3: 0.016, r0: 0.0076 }, // Little
  ];

  let mc3HeadLocal = new THREE.Vector3();
  let indexMcpLocal = new THREE.Vector3();
  let indexPipLocal = new THREE.Vector3();
  let indexTipLocal = new THREE.Vector3();

  fingerDefs.forEach((fd, idx) => {
    const fAng = cfg.fingers[idx];
    const mcpPos = palmLocalToHand(fd.xMcp, fd.yMcp, fd.z);

    if (idx === 1 && cfg.highlightMc3) {
      const mc3Pin = new THREE.Mesh(
        new THREE.SphereGeometry(0.0052, 14, 14),
        engine.nodeHighlightMat,
      );
      const dorsalOut = new THREE.Vector3(0, 0.0095, 0).applyQuaternion(qWrist);
      mc3Pin.position.copy(mcpPos).add(dorsalOut);
      mc3Pin.renderOrder = 5;
      handGroup.add(mc3Pin);
    }

    if (idx === 1) mc3HeadLocal = mcpPos.clone();
    if (idx === 0) indexMcpLocal = mcpPos.clone();

    const qSplay = qWrist
      .clone()
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -fAng.splayDeg * DEG2RAD));
    const qProx = qSplay
      .clone()
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -fAng.mcpFlexDeg * DEG2RAD));
    const qMid = qProx
      .clone()
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -fAng.pipFlexDeg * DEG2RAD));
    const qDist = qMid
      .clone()
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -fAng.dipFlexDeg * DEG2RAD));

    const pipPos = mcpPos
      .clone()
      .add(new THREE.Vector3(fd.l1, 0, 0).applyQuaternion(qProx));
    const dipPos = pipPos
      .clone()
      .add(new THREE.Vector3(fd.l2, 0, 0).applyQuaternion(qMid));
    const tipPos = dipPos
      .clone()
      .add(new THREE.Vector3(fd.l3, 0, 0).applyQuaternion(qDist));

    if (idx === 0) {
      indexPipLocal = pipPos.clone();
      indexTipLocal = tipPos.clone();
    }

    // Continuous smooth human finger skin mesh from web root inside palm -> MCP -> PIP -> DIP -> Tip
    const webRoot = palmLocalToHand(fd.xMcp - 0.014, fd.yMcp, fd.z * 0.94);
    const fSamples: SpineSample[] = [];

    const pushSegmentSamples = (
      pA: THREE.Vector3,
      pB: THREE.Vector3,
      qStart: THREE.Quaternion,
      qEnd: THREE.Quaternion,
      steps: number,
      sOffset: number,
      totalLen: number,
      segLen: number,
    ) => {
      for (let k = sOffset === 0 ? 0 : 1; k <= steps; k++) {
        const u = k / steps;
        const pos = new THREE.Vector3().lerpVectors(pA, pB, u);
        const q = qStart.clone().slerp(qEnd, Math.min(1, u / 0.35));
        const globalT = (sOffset + u * segLen) / totalLen;
        const taper = 1 - 0.28 * globalT;
        // Slight anatomical fullness on palmar finger pads
        const padWave = 1 + 0.06 * Math.sin(u * Math.PI);
        fSamples.push({
          pos,
          quat: q,
          halfWidth: fd.r0 * taper,
          dorsalThick: fd.r0 * 0.84 * taper,
          palmarThick: fd.r0 * 0.98 * taper * padWave,
        });
      }
    };

    const webLen = 0.014;
    const sumLen = webLen + fd.l1 + fd.l2 + fd.l3;
    pushSegmentSamples(webRoot, mcpPos, qSplay, qProx, 4, 0, sumLen, webLen);
    pushSegmentSamples(mcpPos, pipPos, qProx, qProx, 8, webLen, sumLen, fd.l1);
    pushSegmentSamples(pipPos, dipPos, qProx, qMid, 7, webLen + fd.l1, sumLen, fd.l2);
    pushSegmentSamples(dipPos, tipPos, qMid, qDist, 7, webLen + fd.l1 + fd.l2, sumLen, fd.l3);

    const fingerSkin = new THREE.Mesh(
      buildQuaternionLoftGeometry(fSamples, 18, false, true),
      engine.skinMat,
    );
    fingerSkin.renderOrder = 3;
    handGroup.add(fingerSkin);

    // Subtle anatomical dorsal fingernail plate on distal phalanx
    const nailGeo = new THREE.BoxGeometry(fd.l3 * 0.56, 0.0014, fd.r0 * 1.05);
    const nailMesh = new THREE.Mesh(nailGeo, engine.nailMat);
    const nailCenter = new THREE.Vector3().lerpVectors(dipPos, tipPos, 0.62);
    const dorsalOffset = new THREE.Vector3(0, fd.r0 * 0.64, 0).applyQuaternion(qDist);
    nailMesh.position.copy(nailCenter).add(dorsalOffset);
    nailMesh.quaternion.copy(qDist);
    nailMesh.renderOrder = 4;
    handGroup.add(nailMesh);
  });

  // =========================================================================
  // 3. OPPOSABLE 3-SEGMENT HUMAN THUMB + FLESHY THENAR EMINENCE
  // =========================================================================
  const cmcPos = palmLocalToHand(0.018, -0.008, 0.025);
  const th = cfg.thumb;
  const TL = NORMATIVE_JOINT_LIMITS.thumb;
  const clampedCmcPalmarDeg = Math.max(-20, Math.min(TL.cmcPalmarAbductionMaxDeg, th.cmcPalmarDeg));
  const clampedThumbMcpDeg = Math.max(-15, Math.min(TL.mcpFlexionMaxDeg, th.mcpFlexDeg));
  const clampedThumbIpDeg = Math.max(-10, Math.min(TL.ipFlexionMaxDeg, th.ipFlexDeg));

  const qThumbCmc = qWrist
    .clone()
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -th.cmcRadialDeg * DEG2RAD))
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -clampedCmcPalmarDeg * DEG2RAD))
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), th.opposeRollDeg * DEG2RAD));

  const qThumbMcp = qThumbCmc
    .clone()
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -clampedThumbMcpDeg * DEG2RAD));
  const qThumbIp = qThumbMcp
    .clone()
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -clampedThumbIpDeg * DEG2RAD));

  const mc1Len = 0.043;
  const thProxLen = 0.032;
  const thDistLen = 0.025;

  const thMcpPos = cmcPos.clone().add(new THREE.Vector3(mc1Len, 0, 0).applyQuaternion(qThumbCmc));
  const thIpPos = thMcpPos.clone().add(new THREE.Vector3(thProxLen, 0, 0).applyQuaternion(qThumbMcp));
  const thTipPos = thIpPos.clone().add(new THREE.Vector3(thDistLen, 0, 0).applyQuaternion(qThumbIp));

  // Continuous Thenar Eminence -> Thumb Proximal -> Thumb Distal Skin Loft
  const thSamples: SpineSample[] = [];
  const pushThumbSeg = (
    pA: THREE.Vector3,
    pB: THREE.Vector3,
    qA: THREE.Quaternion,
    qB: THREE.Quaternion,
    steps: number,
    rStart: number,
    rEnd: number,
  ) => {
    for (let k = thSamples.length === 0 ? 0 : 1; k <= steps; k++) {
      const u = k / steps;
      const r = rStart + (rEnd - rStart) * u;
      thSamples.push({
        pos: new THREE.Vector3().lerpVectors(pA, pB, u),
        quat: qA.clone().slerp(qB, Math.min(1, u / 0.4)),
        halfWidth: r * 1.05,
        dorsalThick: r * 0.85,
        palmarThick: r * 1.12,
      });
    }
  };

  // Start deep inside fleshy thenar mound of palm so thumb blends seamlessly into palm
  const thenarRoot = palmLocalToHand(0.012, -0.011, 0.016);
  pushThumbSeg(thenarRoot, thMcpPos, qThumbCmc, qThumbCmc, 8, 0.0175, 0.0112);
  pushThumbSeg(thMcpPos, thIpPos, qThumbCmc, qThumbMcp, 7, 0.0112, 0.0098);
  pushThumbSeg(thIpPos, thTipPos, qThumbMcp, qThumbIp, 7, 0.0098, 0.0082);

  const thumbSkin = new THREE.Mesh(
    buildQuaternionLoftGeometry(thSamples, 18, true, true),
    engine.skinMat,
  );
  thumbSkin.renderOrder = 3;
  handGroup.add(thumbSkin);

  const thumbNail = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.0014, 0.0105), engine.nailMat);
  thumbNail.position
    .copy(new THREE.Vector3().lerpVectors(thIpPos, thTipPos, 0.6))
    .add(new THREE.Vector3(0, 0.0068, 0).applyQuaternion(qThumbIp));
  thumbNail.quaternion.copy(qThumbIp);
  thumbNail.renderOrder = 4;
  handGroup.add(thumbNail);

  // =========================================================================
  // 4. GRIPPED 3D OBJECTS / HANDLES / BOXES / TOOLS (100% VISIBLE COUPLING)
  // =========================================================================
  const propGroup = new THREE.Group();
  handGroup.add(propGroup);

  const amberMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.48,
    metalness: 0.08,
  });
  const crateMat = new THREE.MeshStandardMaterial({
    color: 0xfde68a,
    roughness: 0.65,
    metalness: 0.04,
  });
  const handleRubberMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.55,
    metalness: 0.15,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.35,
    metalness: 0.45,
  });
  const sensorMat = new THREE.MeshStandardMaterial({
    color: 0xea580c,
    roughness: 0.32,
    metalness: 0.2,
  });

  let propCenterLocal = palmLocalToHand(0.074, -0.032, 0);

  if (preset === 'niosh_good_handle' || preset === 'owas_load_grip') {
    // Cylindrical ergonomic handle bar inside closed fist + attached container wall below
    const wristAnchored = new THREE.Group();
    wristAnchored.quaternion.copy(qWrist);
    propGroup.add(wristAnchored);

    const handleBar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0165, 0.0165, 0.145, 22),
      amberMat,
    );
    handleBar.rotation.x = Math.PI / 2;
    handleBar.position.set(0.073, -0.033, 0);
    handleBar.renderOrder = 1;
    addCrispPropEdges(handleBar, 0x92400e, 0.5);
    wristAnchored.add(handleBar);

    for (const sz of [-0.062, 0.062]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.048, 0.016), steelMat);
      post.position.set(0.073, -0.056, sz);
      post.renderOrder = 1;
      addCrispPropEdges(post);
      wristAnchored.add(post);
    }

    const crateTop = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.068, 0.155), crateMat);
    crateTop.position.set(0.073, -0.108, 0);
    crateTop.renderOrder = 1;
    addCrispPropEdges(crateTop, 0x78350f, 0.65);
    wristAnchored.add(crateTop);

    propCenterLocal = palmLocalToHand(0.073, -0.095, 0);
  } else if (preset === 'niosh_fair_hook90') {
    // Handle-less rectangular box sitting directly inside the 90° L-shaped palm+finger hook!
    const wristAnchored = new THREE.Group();
    wristAnchored.quaternion.copy(qWrist);
    propGroup.add(wristAnchored);

    const boxNoHandles = new THREE.Mesh(new THREE.BoxGeometry(0.118, 0.115, 0.128), crateMat);
    // Palm rests on side (y = -0.015), 4 fingers bend 90° along -Y at x = 0.088 under bottom face (x = 0.081)!
    boxNoHandles.position.set(0.021, -0.074, -0.004);
    boxNoHandles.renderOrder = 1;
    addCrispPropEdges(boxNoHandles, 0x78350f, 0.75);
    wristAnchored.add(boxNoHandles);

    propCenterLocal = palmLocalToHand(0.035, -0.074, 0);
  } else if (preset === 'niosh_poor_bulky') {
    // Bulky smooth curved container/sack without handles or 90° bottom lip
    const wristAnchored = new THREE.Group();
    wristAnchored.quaternion.copy(qWrist);
    propGroup.add(wristAnchored);

    const bulkyDrum = new THREE.Mesh(new THREE.SphereGeometry(0.095, 24, 20), crateMat);
    bulkyDrum.scale.set(1.05, 0.92, 1.15);
    bulkyDrum.position.set(0.112, -0.106, -0.008);
    bulkyDrum.renderOrder = 1;
    addCrispPropEdges(bulkyDrum, 0x78350f, 0.35);
    wristAnchored.add(bulkyDrum);

    propCenterLocal = palmLocalToHand(0.112, -0.09, 0);
  } else if (preset === 'ocra_dynamic_grasp') {
    // Cylindrical assembly part grasped by fingers + workstation fixture base below
    const wristAnchored = new THREE.Group();
    wristAnchored.quaternion.copy(qWrist);
    propGroup.add(wristAnchored);

    const workPeg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.105, 20), amberMat);
    workPeg.rotation.x = Math.PI / 2;
    workPeg.position.set(0.088, -0.032, 0.005);
    workPeg.renderOrder = 1;
    addCrispPropEdges(workPeg, 0x92400e, 0.55);
    wristAnchored.add(workPeg);

    const fixtureBase = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.022, 0.11), steelMat);
    fixtureBase.position.set(0.105, -0.098, 0.005);
    fixtureBase.renderOrder = 1;
    addCrispPropEdges(fixtureBase);
    wristAnchored.add(fixtureBase);

    propCenterLocal = palmLocalToHand(0.088, -0.032, 0.005);
  } else if (preset === 'ocra_static_pinch') {
    // Precision flat component visibly pinched squarely between Thumb pad and Index/Middle pads!
    const pinchMid = new THREE.Vector3().lerpVectors(indexTipLocal, thTipPos, 0.5);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.012, 0.056), amberMat);
    plate.position.copy(pinchMid).add(palmLocalToHand(0.012, -0.002, 0));
    plate.quaternion.copy(qWrist);
    plate.renderOrder = 1;
    addCrispPropEdges(plate, 0x92400e, 0.75);
    propGroup.add(plate);

    propCenterLocal = plate.position.clone();
  } else if (preset === 'jsi_neutral' || preset === 'jsi_flexed' || preset === 'jsi_extreme') {
    const wristAnchored = new THREE.Group();
    wristAnchored.quaternion.copy(qWrist);
    propGroup.add(wristAnchored);

    const toolHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0155, 0.0165, 0.135, 20),
      handleRubberMat,
    );
    toolHandle.rotation.x = Math.PI / 2;
    toolHandle.position.set(0.072, -0.032, 0);
    toolHandle.renderOrder = 1;
    addCrispPropEdges(toolHandle, 0x0f172a, 0.5);
    wristAnchored.add(toolHandle);

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.014, 20), amberMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0.072, -0.032, 0.064);
    collar.renderOrder = 1;
    wristAnchored.add(collar);

    propCenterLocal = palmLocalToHand(0.072, -0.032, 0);
  } else if (preset === 'iso5349_power_handle') {
    // Power-tool cylindrical auxiliary grip handle + guards + triaxial accelerometer block
    const wristAnchored = new THREE.Group();
    wristAnchored.quaternion.copy(qWrist);
    propGroup.add(wristAnchored);

    const gripCyl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.017, 0.017, 0.165, 24),
      handleRubberMat,
    );
    gripCyl.rotation.x = Math.PI / 2;
    gripCyl.position.set(0.073, -0.033, 0);
    gripCyl.renderOrder = 1;
    addCrispPropEdges(gripCyl, 0x0f172a, 0.55);
    wristAnchored.add(gripCyl);

    for (const zFlange of [-0.078, 0.078]) {
      const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.012, 22), steelMat);
      flange.rotation.x = Math.PI / 2;
      flange.position.set(0.073, -0.033, zFlange);
      flange.renderOrder = 1;
      addCrispPropEdges(flange);
      wristAnchored.add(flange);
    }

    // Power tool body stub at -Z end of auxiliary handle
    const toolBody = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.034, 0.075, 22), amberMat);
    toolBody.rotation.x = Math.PI / 2;
    toolBody.position.set(0.073, -0.033, -0.122);
    toolBody.renderOrder = 1;
    addCrispPropEdges(toolBody, 0x92400e, 0.65);
    wristAnchored.add(toolBody);

    // Triaxial ISO 5349 accelerometer sensor cube on handle collar (+Z side)
    const accelCube = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.018), sensorMat);
    accelCube.position.set(0.073, -0.012, 0.062);
    accelCube.renderOrder = 2;
    addCrispPropEdges(accelCube, 0x7c2d12, 0.85);
    wristAnchored.add(accelCube);

    propCenterLocal = palmLocalToHand(0.073, -0.033, 0);
  }

  handGroup.updateMatrixWorld(true);

  const toWorld = (localPt: THREE.Vector3): THREE.Vector3 => {
    return localPt.clone().applyMatrix4(handGroup.matrixWorld);
  };

  // ISO 5349 orthogonal basis vectors originating at 3rd Metacarpal Head (mc3HeadLocal)
  const axisLen = 0.095;
  const zhLocal = mc3HeadLocal.clone().add(new THREE.Vector3(axisLen, 0, 0).applyQuaternion(qWrist));
  const xhLocal = mc3HeadLocal.clone().add(new THREE.Vector3(0, axisLen, 0).applyQuaternion(qWrist));
  const yhLocal = mc3HeadLocal.clone().add(new THREE.Vector3(0, 0, axisLen).applyQuaternion(qWrist));

  return {
    handGroup,
    worldPts: {
      wrist: toWorld(new THREE.Vector3(0, 0, 0)),
      forearmRef: toWorld(new THREE.Vector3(-0.12, 0, 0)),
      neutralAxisTip: toWorld(new THREE.Vector3(0.11, 0, 0)),
      mc3Head: toWorld(mc3HeadLocal),
      indexMcp: toWorld(indexMcpLocal),
      indexPip: toWorld(indexPipLocal),
      indexTip: toWorld(indexTipLocal),
      thumbTip: toWorld(thTipPos),
      propCenter: toWorld(propCenterLocal),
      isoZhTip: toWorld(zhLocal),
      isoXhTip: toWorld(xhLocal),
      isoYhTip: toWorld(yhLocal),
    },
  };
}

function render2DFallbackHandGrip(
  ctx: CanvasRenderingContext2D,
  preset: HandGripPresetId,
  rect: { x: number; y: number; w: number; h: number },
): HandGripProjectedLandmarks {
  const cx = rect.x + rect.w * 0.46;
  const cy = rect.y + rect.h * 0.5;
  ctx.save();
  ctx.translate(cx, cy);

  // Clean multi-finger anatomical 2D fallback silhouette if WebGL is unavailable
  ctx.fillStyle = '#c49379';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-88, -20);
  ctx.bezierCurveTo(-50, -22, -20, -15, 0, -13);
  ctx.quadraticCurveTo(28, -18, 52, -12);
  ctx.quadraticCurveTo(72, -8, 72, 10);
  ctx.quadraticCurveTo(68, 26, 46, 24);
  ctx.quadraticCurveTo(22, 22, 0, 14);
  ctx.bezierCurveTo(-20, 16, -50, 22, -88, 18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Dark grey scrub cuff at proximal forearm
  ctx.fillStyle = '#383f48';
  ctx.fillRect(-88, -21, 26, 40);

  if (preset !== 'ocra_static_pinch') {
    ctx.fillStyle = '#fde68a';
    ctx.strokeStyle = '#92400e';
    ctx.beginPath();
    ctx.arc(52, 8, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  return {
    wrist: { x: cx, y: cy },
    forearmRef: { x: cx - 70, y: cy },
    neutralAxisTip: { x: cx + 75, y: cy },
    mc3Head: { x: cx + 48, y: cy - 4 },
    indexMcp: { x: cx + 48, y: cy - 6 },
    indexPip: { x: cx + 68, y: cy + 4 },
    indexTip: { x: cx + 52, y: cy + 20 },
    thumbTip: { x: cx + 44, y: cy + 12 },
    propCenter: { x: cx + 52, y: cy + 10 },
    isoZhTip: { x: cx + 125, y: cy - 4 },
    isoXhTip: { x: cx + 48, y: cy - 82 },
    isoYhTip: { x: cx + 8, y: cy + 62 },
  };
}

/**
 * Renders a photorealistic 3D human forearm, wrist, 5-finger articulated hand,
 * and gripped object directly into `rect` on a 2D canvas, returning exact projected
 * 2D pixel landmarks for biomechanical arcs, vectors, and orthogonal axes.
 */
export function renderHandGripPanel(
  ctx: CanvasRenderingContext2D,
  preset: HandGripPresetId,
  rect: { x: number; y: number; w: number; h: number },
  dpiScale = 2,
): HandGripProjectedLandmarks {
  const engine = getHandEngine();
  if (!engine) {
    return render2DFallbackHandGrip(ctx, preset, rect);
  }

  const sharedMats = new Set<THREE.Material>([
    engine.skinMat,
    engine.scrubCuffMat,
    engine.nodeHighlightMat,
    engine.nailMat,
  ]);
  clearGroup(engine.contentRoot, sharedMats);

  try {
    const cfg = getPresetPoseConfig(preset);
    const { handGroup, worldPts } = buildHandAndPropScene(engine, preset, cfg);

    const box = new THREE.Box3().setFromObject(handGroup);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    const maxDim = Math.max(0.18, Math.max(size.x, size.y, size.z));
    const halfExtent = (maxDim * 0.58) / Math.max(0.5, cfg.cameraZoom);
    const aspect = Math.max(0.3, rect.w / Math.max(1, rect.h));

    const cam = engine.orthoCam;
    if (aspect >= 1) {
      cam.top = halfExtent;
      cam.bottom = -halfExtent;
      cam.left = -halfExtent * aspect;
      cam.right = halfExtent * aspect;
    } else {
      cam.left = -halfExtent;
      cam.right = halfExtent;
      cam.top = halfExtent / aspect;
      cam.bottom = -halfExtent / aspect;
    }

    const az = cfg.cameraAzimuthDeg * DEG2RAD;
    const el = cfg.cameraElevationDeg * DEG2RAD;
    const dist = 2.2;
    cam.position.set(
      center.x + dist * Math.cos(el) * Math.sin(az),
      center.y + dist * Math.sin(el),
      center.z + dist * Math.cos(el) * Math.cos(az),
    );
    cam.up.set(0, 1, 0);
    cam.lookAt(center);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);

    const glScale = engine.isSoftware ? Math.max(1, dpiScale) : Math.max(2, dpiScale * 1.5);
    engine.renderer.setSize(
      Math.max(32, Math.round(rect.w * glScale)),
      Math.max(32, Math.round(rect.h * glScale)),
      false,
    );
    engine.renderer.render(engine.scene, cam);

    // Subtle clinical studio contact shadow under gripped load/hand on #ffffff background
    drawEllipticalStudioShadow(
      ctx,
      rect.x + rect.w * 0.52,
      rect.y + rect.h * 0.86,
      rect.w * 0.34,
      Math.max(5, rect.h * 0.052),
    );

    ctx.drawImage(engine.renderer.domElement, rect.x, rect.y, rect.w, rect.h);

    const projectPt = (vWorld: THREE.Vector3): { x: number; y: number } => {
      const p = vWorld.clone().project(cam);
      return {
        x: rect.x + ((p.x + 1) * 0.5) * rect.w,
        y: rect.y + ((-p.y + 1) * 0.5) * rect.h,
      };
    };

    const out = {
      wrist: projectPt(worldPts.wrist),
      forearmRef: projectPt(worldPts.forearmRef),
      neutralAxisTip: projectPt(worldPts.neutralAxisTip),
      mc3Head: projectPt(worldPts.mc3Head),
      indexMcp: projectPt(worldPts.indexMcp),
      indexPip: projectPt(worldPts.indexPip),
      indexTip: projectPt(worldPts.indexTip),
      thumbTip: projectPt(worldPts.thumbTip),
      propCenter: projectPt(worldPts.propCenter),
      isoZhTip: projectPt(worldPts.isoZhTip),
      isoXhTip: projectPt(worldPts.isoXhTip),
      isoYhTip: projectPt(worldPts.isoYhTip),
    };

    clearGroup(engine.contentRoot, sharedMats);
    return out;
  } catch (err) {
    console.warn('Error rendering 3D hand grip panel, using 2D fallback:', err);
    clearGroup(engine.contentRoot, sharedMats);
    return render2DFallbackHandGrip(ctx, preset, rect);
  }
}

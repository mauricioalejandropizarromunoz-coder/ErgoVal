import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  FocusZone,
  JointKey,
  PosturePose3D,
  ScenePropType,
} from '../types/figurePlan';

export const MEDICAL_MANUAL_FOOTER_ES =
  'Postura de evaluación · Marcadores de ángulo · Plano Sagital';

const DEG2RAD = Math.PI / 180;

export type SegmentGroupKey =
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

const ALL_HUMAN_SEGMENTS: SegmentGroupKey[] = [
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

/**
 * Anatomical visibility map obeying the strict non-mutilation rule:
 * - Trunk, lumbar, cervical, shoulder/arm, elbow/forearm, and full-body ALWAYS keep the
 *   complete human body visible (head, neck, torso, both arms/hands, pelvis, and legs) so
 *   the figure NEVER looks like an amputated or decapitated mannequin.
 * - Individual extremity crops are ONLY used for wrist/hand, legs/knees, and ankle/foot,
 *   while keeping the adjacent proximal segment so limbs exit the viewport border cleanly.
 */
export const FOCUS_ZONE_SEGMENTS_MAP: Record<FocusZone, SegmentGroupKey[]> = {
  wrist_hand: ['upper_arm_r', 'forearm_r', 'hand_r'],
  ankle_foot: ['thigh_r', 'shank_r', 'foot_r'],
  legs_knees: [
    'pelvis',
    'lumbar',
    'thorax',
    'thigh_r',
    'shank_r',
    'foot_r',
    'thigh_l',
    'shank_l',
    'foot_l',
  ],
  elbow_forearm: ALL_HUMAN_SEGMENTS,
  shoulder_arm: ALL_HUMAN_SEGMENTS,
  neck_cervical: ALL_HUMAN_SEGMENTS,
  lumbar_l5s1: ALL_HUMAN_SEGMENTS,
  trunk_pelvis: ALL_HUMAN_SEGMENTS,
  full_body: ALL_HUMAN_SEGMENTS,
};

/**
 * Strips any prohibited mention of the rendering model/mesh technology
 * from text rendered inside technical manual illustrations.
 */
export function sanitizeManualImageText(raw: string | undefined | null): string {
  if (!raw) return '';
  let s = raw
    .replace(/modelo\s+anat[oó]mico\s+3d\s+s[oó]lido/gi, '')
    .replace(/modelo\s+humano\s+3d\s+s[oó]lido/gi, '')
    .replace(/contorno\s+anat[oó]mico\s+humano\s+3d/gi, '')
    .replace(/3d\s+model\s+posture/gi, 'EVALUACIÓN POSTURAL')
    .replace(/3d\s+wireframe/gi, 'EVALUACIÓN')
    .replace(/wireframe\s+3d/gi, '')
    .replace(/wf-3d/gi, 'EVAL')
    .replace(/motor\s+3d(\s+aislado)?/gi, '')
    .replace(/esqueleto\s+interno\s+y\s+nodos\s+articulares/gi, '')
    .replace(/esqueleto\s+y\s+tejidos\s+blandos/gi, '')
    .replace(/\bwireframe\b/gi, '')
    .replace(/\bmalla\s+3d\b/gi, '')
    .replace(/\bmodelo\s+3d(\s+s[oó]lido)?\b/gi, '')
    .replace(/\bvista\s+isom[eé]trica\s+t[eé]cnica\s+3d\b/gi, 'Vista Isométrica Técnica')
    .replace(/\b3d\b/gi, '');

  s = s
    .replace(/\(\s*\)/g, '')
    .replace(/(?:\s*[·•|-]\s*){2,}/g, ' · ')
    .replace(/^\s*[·•|-]\s*/, '')
    .replace(/\s*[·•|-]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return s;
}

export interface ProfileStation {
  t: number;
  rx: number;
  rz: number;
  cx?: number;
  cz?: number;
}

function sampleStationsSmooth(
  stations: ProfileStation[],
  t: number,
): { rx: number; rz: number; cx: number; cz: number } {
  if (t <= stations[0].t) {
    const s = stations[0];
    return { rx: s.rx, rz: s.rz, cx: s.cx ?? 0, cz: s.cz ?? 0 };
  }
  const last = stations[stations.length - 1];
  if (t >= last.t) {
    return { rx: last.rx, rz: last.rz, cx: last.cx ?? 0, cz: last.cz ?? 0 };
  }
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i];
    const b = stations[i + 1];
    if (t >= a.t && t <= b.t) {
      const u = (t - a.t) / Math.max(1e-5, b.t - a.t);
      const s = 0.5 - 0.5 * Math.cos(u * Math.PI);
      return {
        rx: a.rx + (b.rx - a.rx) * s,
        rz: a.rz + (b.rz - a.rz) * s,
        cx: (a.cx ?? 0) + ((b.cx ?? 0) - (a.cx ?? 0)) * s,
        cz: (a.cz ?? 0) + ((b.cz ?? 0) - (a.cz ?? 0)) * s,
      };
    }
  }
  return { rx: last.rx, rz: last.rz, cx: last.cx ?? 0, cz: last.cz ?? 0 };
}

export function buildUvLoftGeometry(
  length: number,
  stations: ProfileStation[],
  dir: 'up' | 'down' | 'forward',
  radialSegs = 36,
  axialSteps = 26,
  capEnds = true,
  radialOutset = 0,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const stride = radialSegs + 1;

  for (let i = 0; i <= axialSteps; i++) {
    const t = i / axialSteps;
    let endCap = 1;
    if (capEnds) {
      if (t < 0.035) endCap = Math.sin((t / 0.035) * (Math.PI / 2));
      else if (t > 0.965) endCap = Math.sin(((1 - t) / 0.035) * (Math.PI / 2));
      endCap = Math.max(0.05, endCap);
    }

    const st = sampleStationsSmooth(stations, t);
    const rx = (st.rx + radialOutset) * endCap;
    const rz = (st.rz + radialOutset) * endCap;
    const along = t * length;

    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const phi = u * Math.PI * 2;
      const lx = st.cx + Math.cos(phi) * rx;
      const lz = st.cz + Math.sin(phi) * rz;

      if (dir === 'up') {
        positions.push(lx, along, lz);
      } else if (dir === 'down') {
        positions.push(lx, -along, lz);
      } else {
        positions.push(lx, lz, along);
      }
      uvs.push(u, dir === 'down' ? 1 - t : t);
    }
  }

  for (let i = 0; i < axialSteps; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);

      if (dir === 'down') {
        indices.push(a, c, b);
        indices.push(a, d, c);
      } else {
        indices.push(a, b, c);
        indices.push(a, c, d);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Natural matte organic human skin texture (warm epidermal tone + soft dermal micro-grain, zero plastic gloss).
 */
export function createPhotorealSkinTexture(maxAniso = 4): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, '#cca088');
  grad.addColorStop(0.5, '#c3957c');
  grad.addColorStop(1, '#ba8b72');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < 6000; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 0.6 + rand() * 1.5;
    ctx.fillStyle =
      rand() > 0.48 ? 'rgba(242, 208, 188, 0.075)' : 'rgba(148, 96, 74, 0.068)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * High-definition organic craniofacial texture with natural skin warmth, subtle eyebrows,
 * upper/lower eyelids, natural lip tone, and soft short-cropped anatomical scalp hair.
 */
export function createPhotorealHeadTexture(maxAniso = 4): THREE.CanvasTexture {
  const W = 1024;
  const H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;

  const baseGrad = ctx.createLinearGradient(0, H, 0, 0);
  baseGrad.addColorStop(0, '#c09178');
  baseGrad.addColorStop(0.45, '#c99b82');
  baseGrad.addColorStop(0.82, '#cca087');
  baseGrad.addColorStop(1, '#be9077');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, W, H);

  const drawSoftSpot = (u: number, v: number, rx: number, ry: number, color: string) => {
    ctx.save();
    ctx.translate(u * W, (1 - v) * H);
    ctx.scale(rx * W, ry * H);
    const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    rg.addColorStop(0, color);
    rg.addColorStop(1, 'rgba(201,155,130,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // Subtle malar/nasal dermal warmth
  drawSoftSpot(0.25, 0.50, 0.065, 0.045, 'rgba(186, 118, 98, 0.22)');
  drawSoftSpot(0.35, 0.50, 0.075, 0.065, 'rgba(188, 122, 102, 0.16)');
  drawSoftSpot(0.15, 0.50, 0.075, 0.065, 'rgba(188, 122, 102, 0.16)');

  // Natural vermilion lip warmth & gentle commissure line
  drawSoftSpot(0.25, 0.405, 0.044, 0.022, 'rgba(154, 92, 78, 0.44)');
  ctx.strokeStyle = 'rgba(102, 56, 46, 0.40)';
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(0.220 * W, (1 - 0.404) * H);
  ctx.quadraticCurveTo(0.25 * W, (1 - 0.401) * H, 0.280 * W, (1 - 0.404) * H);
  ctx.stroke();

  // Natural eyebrows & calm anatomical eyelid definition
  [0.206, 0.294].forEach((uEye) => {
    const dir = uEye > 0.25 ? 1 : -1;
    ctx.strokeStyle = 'rgba(74, 53, 42, 0.62)';
    ctx.lineWidth = 6.0;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo((uEye - dir * 0.022) * W, (1 - 0.648) * H);
    ctx.quadraticCurveTo(uEye * W, (1 - 0.658) * H, (uEye + dir * 0.030) * W, (1 - 0.642) * H);
    ctx.stroke();

    // Soft iris/lash line
    drawSoftSpot(uEye, 0.612, 0.011, 0.008, 'rgba(68, 48, 38, 0.48)');
    ctx.strokeStyle = 'rgba(68, 46, 36, 0.56)';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo((uEye - dir * 0.016) * W, (1 - 0.613) * H);
    ctx.quadraticCurveTo(uEye * W, (1 - 0.620) * H, (uEye + dir * 0.021) * W, (1 - 0.609) * H);
    ctx.stroke();
  });

  // Short-cropped natural dark-brown/charcoal hair cap with tapered nape & temple hairline
  const imgData = ctx.getImageData(0, 0, W, H);
  const data = imgData.data;
  let seed = 4242;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let py = 0; py < H; py++) {
    const v = 1 - py / H;
    for (let px = 0; px < W; px++) {
      const u = px / W;
      const phi = u * Math.PI * 2;
      const sinP = Math.sin(phi);
      const absCosP = Math.abs(Math.cos(phi));

      let hairlineV = 0.79;
      if (sinP >= 0.24) {
        const t = (sinP - 0.24) / 0.76;
        hairlineV = 0.635 + 0.155 * Math.pow(t, 0.78);
      } else if (sinP >= -0.18) {
        const earArch = Math.exp(-Math.pow((sinP + 0.04) / 0.11, 2)) * 0.072;
        const sideburnDip = Math.exp(-Math.pow((sinP - 0.13) / 0.065, 2)) * -0.052;
        hairlineV = 0.595 + earArch + sideburnDip;
      } else {
        const t = (-sinP - 0.18) / 0.82;
        hairlineV = 0.595 - 0.29 * Math.pow(Math.min(1, t), 0.76);
      }

      const margin = (v - hairlineV) / 0.024;
      if (margin > -1) {
        const blend = Math.max(0, Math.min(1, 0.5 + 0.5 * Math.tanh(margin * 1.55))) * 0.82;
        const stipple = (rand() - 0.5) * 12;
        const hr = 68 + stipple - absCosP * 4;
        const hg = 54 + stipple * 0.85;
        const hb = 47 + stipple * 0.75;

        const idx = (py * W + px) * 4;
        data[idx] = Math.round(data[idx] * (1 - blend) + hr * blend);
        data[idx + 1] = Math.round(data[idx + 1] * (1 - blend) + hg * blend);
        data[idx + 2] = Math.round(data[idx + 2] * (1 - blend) + hb * blend);
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Solid dark grey short-sleeve medical scrubs top texture.
 * Strictly free of patterns, logos, pockets, side panels, stripes, or drawings.
 */
export function createSolidDarkGreyScrubsTopTexture(
  maxAniso = 4,
  withCollarOpening = true,
): THREE.CanvasTexture {
  const W = 512;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;

  const img = ctx.createImageData(W, H);
  const d = img.data;

  let seed = 9001;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let py = 0; py < H; py++) {
    const v = 1 - py / H;
    for (let px = 0; px < W; px++) {
      const u = px / W;
      const phi = u * Math.PI * 2;
      const sinP = Math.sin(phi);
      const idx = (py * W + px) * 4;

      if (withCollarOpening) {
        const frontVNeck = sinP > 0.64 && v > 0.875 + (1 - sinP) * 0.32;
        const backNeck = sinP < -0.70 && v > 0.948 + (1 + sinP) * 0.16;
        if (frontVNeck || backNeck || v > 0.990) {
          d[idx] = 54;
          d[idx + 1] = 61;
          d[idx + 2] = 70;
          d[idx + 3] = 0;
          continue;
        }
      }

      const weave =
        Math.sin(px * 1.5) * 0.8 +
        Math.cos(py * 1.5) * 0.8 +
        (rand() - 0.5) * 2.0;
      const r = 54 + weave;
      const g = 61 + weave;
      const b = 70 + weave;

      d[idx] = Math.max(0, Math.min(255, Math.round(r)));
      d[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      d[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Solid medium grey long medical pants texture.
 * Strictly free of patterns, logos, pockets, black side panels, stripes, or drawings.
 */
export function createSolidGreyPantsTexture(maxAniso = 4): THREE.CanvasTexture {
  const W = 512;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;

  const img = ctx.createImageData(W, H);
  const d = img.data;

  let seed = 7717;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const idx = (py * W + px) * 4;
      const weave =
        Math.sin(px * 1.4) * 0.9 +
        Math.cos(py * 1.4) * 0.9 +
        (rand() - 0.5) * 2.1;
      const r = 109 + weave;
      const g = 117 + weave;
      const b = 128 + weave;

      d[idx] = Math.max(0, Math.min(255, Math.round(r)));
      d[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      d[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// ============================================================================
// POSE-DEFORMABLE CONTINUOUS ORGANIC SPLINE MESH ENGINE (ZERO JOINT SPHERES)
// ============================================================================

interface OrganicRingControl {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  rx: number;
  rzAnt: number;
  rzPost: number;
  cx?: number;
  cz?: number;
  /** Optional extra organic cross-section modulation */
  pectoralGain?: number;
  creaseAnt?: number;
  olecranonPost?: number;
}

interface DynamicOrganicTube {
  mesh: THREE.Mesh;
  radialSegs: number;
  axialSteps: number;
  capStart: boolean;
  capEnd: boolean;
  flipWinding: boolean;
}

function createDynamicOrganicTube(
  material: THREE.Material,
  radialSegs: number,
  axialSteps: number,
  capStart: boolean,
  capEnd: boolean,
  flipWinding = false,
): DynamicOrganicTube {
  const vertCount = (axialSteps + 1) * (radialSegs + 1);
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const indices: number[] = [];
  const stride = radialSegs + 1;

  for (let i = 0; i <= axialSteps; i++) {
    const v = i / axialSteps;
    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const idx2 = (i * stride + j) * 2;
      uvs[idx2] = u;
      uvs[idx2 + 1] = flipWinding ? 1 - v : v;
    }
  }

  for (let i = 0; i < axialSteps; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      if (flipWinding) {
        indices.push(a, c, b);
        indices.push(a, d, c);
      } else {
        indices.push(a, b, c);
        indices.push(a, c, d);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;

  return { mesh, radialSegs, axialSteps, capStart, capEnd, flipWinding };
}

const _tmpRight = new THREE.Vector3();
const _tmpAnt = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();
const _tmpPos = new THREE.Vector3();

function updateDynamicOrganicTube(
  tube: DynamicOrganicTube,
  controls: OrganicRingControl[],
  fabricFoldAmp = 0,
): void {
  const { radialSegs, axialSteps, capStart, capEnd } = tube;
  const stride = radialSegs + 1;
  const posAttr = tube.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const arr = posAttr.array as Float32Array;

  const curvePts = controls.map((c) => c.pos);
  const spline = new THREE.CatmullRomCurve3(curvePts, false, 'centripetal', 0.5);
  const nCtrl = controls.length - 1;

  for (let i = 0; i <= axialSteps; i++) {
    const t = i / axialSteps;
    spline.getPoint(t, _tmpPos);

    const scaled = t * nCtrl;
    const idx0 = Math.min(nCtrl - 1, Math.max(0, Math.floor(scaled)));
    const idx1 = Math.min(nCtrl, idx0 + 1);
    const frac = scaled - idx0;
    const smoothFrac = 0.5 - 0.5 * Math.cos(frac * Math.PI);

    const c0 = controls[idx0];
    const c1 = controls[idx1];

    _tmpQuat.copy(c0.quat).slerp(c1.quat, smoothFrac);
    _tmpRight.set(1, 0, 0).applyQuaternion(_tmpQuat);
    _tmpAnt.set(0, 0, 1).applyQuaternion(_tmpQuat);

    let cap = 1;
    if (capStart && t < 0.045) {
      cap = Math.max(0.04, Math.sin((t / 0.045) * (Math.PI / 2)));
    } else if (capEnd && t > 0.945) {
      cap = Math.max(0.04, Math.sin(((1 - t) / 0.055) * (Math.PI / 2)));
    }

    const rx = (c0.rx + (c1.rx - c0.rx) * smoothFrac) * cap;
    const rzAnt = (c0.rzAnt + (c1.rzAnt - c0.rzAnt) * smoothFrac) * cap;
    const rzPost = (c0.rzPost + (c1.rzPost - c0.rzPost) * smoothFrac) * cap;
    const cx = ((c0.cx ?? 0) + ((c1.cx ?? 0) - (c0.cx ?? 0)) * smoothFrac) * cap;
    const cz = ((c0.cz ?? 0) + ((c1.cz ?? 0) - (c0.cz ?? 0)) * smoothFrac) * cap;
    const pec = (c0.pectoralGain ?? 0) + ((c1.pectoralGain ?? 0) - (c0.pectoralGain ?? 0)) * smoothFrac;
    const crease = (c0.creaseAnt ?? 0) + ((c1.creaseAnt ?? 0) - (c0.creaseAnt ?? 0)) * smoothFrac;
    const olec = (c0.olecranonPost ?? 0) + ((c1.olecranonPost ?? 0) - (c0.olecranonPost ?? 0)) * smoothFrac;

    const foldWave =
      fabricFoldAmp > 0 && t > 0.15 && t < 0.65
        ? Math.sin(t * Math.PI * 10) * fabricFoldAmp
        : 0;

    for (let j = 0; j <= radialSegs; j++) {
      const phi = (j / radialSegs) * Math.PI * 2;
      const cosP = Math.cos(phi);
      const sinP = Math.sin(phi);

      let zRad = sinP >= 0 ? rzAnt : rzPost;
      if (sinP > 0 && pec > 0) {
        // Bilateral pectoral fullness with subtle sternal midline groove
        const biLobe = Math.pow(Math.sin(phi * 2), 2) * pec;
        zRad += biLobe;
      }
      if (sinP > 0 && crease !== 0) {
        // Soft-tissue flexion crease (cubital / abdominal / inguinal)
        zRad -= Math.pow(sinP, 2) * crease;
      }
      if (sinP > 0.25 && foldWave !== 0) {
        zRad += foldWave * sinP;
      }
      if (sinP < 0 && olec > 0) {
        // Natural bony olecranon / patellar contour
        zRad += Math.pow(-sinP, 3) * olec;
      }

      const lx = cx + cosP * rx;
      const lz = cz + sinP * zRad;

      const vIdx = (i * stride + j) * 3;
      arr[vIdx] = _tmpPos.x + _tmpRight.x * lx + _tmpAnt.x * lz;
      arr[vIdx + 1] = _tmpPos.y + _tmpRight.y * lx + _tmpAnt.y * lz;
      arr[vIdx + 2] = _tmpPos.z + _tmpRight.z * lx + _tmpAnt.z * lz;
    }
  }

  posAttr.needsUpdate = true;
  tube.mesh.geometry.computeVertexNormals();
  tube.mesh.geometry.computeBoundingBox();
  tube.mesh.geometry.computeBoundingSphere();
}

/**
 * Builds an organic, continuous pose-deformed cervical-neck + craniofacial head mesh
 * with natural cervicomental angle, jawline, lips, nose, brow, eyelids, and sculpted ears
 * (zero spheres, zero torus rings).
 */
interface DynamicHeadMesh {
  mesh: THREE.Mesh;
  radialSegs: number;
  axialSteps: number;
}

interface HeadProfileSlice {
  v: number;
  rx: number;
  zBack: number;
  zFront: number;
  noseProm: number;
  midFaceProm: number;
}

const ORGANIC_HEAD_SLICES: HeadProfileSlice[] = [
  { v: 0.000, rx: 0.064, zBack: -0.058, zFront: 0.056, noseProm: 0.000, midFaceProm: 0.000 }, // Clavicular neck base inside collar
  { v: 0.110, rx: 0.055, zBack: -0.052, zFront: 0.050, noseProm: 0.000, midFaceProm: 0.002 }, // Mid cervical C5
  { v: 0.235, rx: 0.053, zBack: -0.051, zFront: 0.049, noseProm: 0.000, midFaceProm: 0.003 }, // Submental cervicomental junction
  { v: 0.292, rx: 0.054, zBack: -0.058, zFront: 0.084, noseProm: 0.000, midFaceProm: 0.023 }, // Chin menton & mandible
  { v: 0.335, rx: 0.059, zBack: -0.067, zFront: 0.084, noseProm: 0.000, midFaceProm: 0.013 }, // Labiomental sulcus
  { v: 0.368, rx: 0.063, zBack: -0.076, zFront: 0.088, noseProm: 0.000, midFaceProm: 0.021 }, // Lower lip
  { v: 0.392, rx: 0.065, zBack: -0.081, zFront: 0.086, noseProm: 0.000, midFaceProm: 0.014 }, // Oral commissure
  { v: 0.415, rx: 0.067, zBack: -0.087, zFront: 0.089, noseProm: 0.000, midFaceProm: 0.021 }, // Upper lip
  { v: 0.450, rx: 0.070, zBack: -0.093, zFront: 0.090, noseProm: 0.005, midFaceProm: 0.012 }, // Philtrum & subnasale
  { v: 0.492, rx: 0.073, zBack: -0.099, zFront: 0.092, noseProm: 0.030, midFaceProm: 0.006 }, // Pronasale (nasal tip)
  { v: 0.550, rx: 0.076, zBack: -0.104, zFront: 0.093, noseProm: 0.020, midFaceProm: 0.004 }, // Nasal dorsum
  { v: 0.608, rx: 0.077, zBack: -0.107, zFront: 0.090, noseProm: 0.008, midFaceProm: 0.002 }, // Nasion & orbital plane
  { v: 0.658, rx: 0.078, zBack: -0.106, zFront: 0.096, noseProm: 0.003, midFaceProm: 0.006 }, // Supraorbital brow ridge
  { v: 0.765, rx: 0.076, zBack: -0.100, zFront: 0.093, noseProm: 0.000, midFaceProm: 0.004 }, // Frontal eminence
  { v: 0.870, rx: 0.066, zBack: -0.083, zFront: 0.076, noseProm: 0.000, midFaceProm: 0.000 }, // Parietal vault
  { v: 0.955, rx: 0.042, zBack: -0.050, zFront: 0.046, noseProm: 0.000, midFaceProm: 0.000 }, // Upper crown
  { v: 1.000, rx: 0.003, zBack: -0.003, zFront: 0.003, noseProm: 0.000, midFaceProm: 0.000 }, // Vertex
];

function sampleHeadSlice(v: number): HeadProfileSlice {
  if (v <= ORGANIC_HEAD_SLICES[0].v) return ORGANIC_HEAD_SLICES[0];
  const last = ORGANIC_HEAD_SLICES[ORGANIC_HEAD_SLICES.length - 1];
  if (v >= last.v) return last;
  for (let i = 0; i < ORGANIC_HEAD_SLICES.length - 1; i++) {
    const a = ORGANIC_HEAD_SLICES[i];
    const b = ORGANIC_HEAD_SLICES[i + 1];
    if (v >= a.v && v <= b.v) {
      const u = (v - a.v) / Math.max(1e-5, b.v - a.v);
      const s = 0.5 - 0.5 * Math.cos(u * Math.PI);
      return {
        v,
        rx: a.rx + (b.rx - a.rx) * s,
        zBack: a.zBack + (b.zBack - a.zBack) * s,
        zFront: a.zFront + (b.zFront - a.zFront) * s,
        noseProm: a.noseProm + (b.noseProm - a.noseProm) * s,
        midFaceProm: a.midFaceProm + (b.midFaceProm - a.midFaceProm) * s,
      };
    }
  }
  return last;
}

function createDynamicNeckAndHeadMesh(
  material: THREE.Material,
  radialSegs = 64,
  axialSteps = 60,
): DynamicHeadMesh {
  const stride = radialSegs + 1;
  const vertCount = (axialSteps + 1) * stride;
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const indices: number[] = [];

  for (let i = 0; i <= axialSteps; i++) {
    const v = i / axialSteps;
    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const idx2 = (i * stride + j) * 2;
      uvs[idx2] = u;
      uvs[idx2 + 1] = v;
    }
  }

  for (let i = 0; i < axialSteps; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, b, c);
      indices.push(a, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;

  return { mesh, radialSegs, axialSteps };
}

function updateDynamicNeckAndHeadMesh(
  headObj: DynamicHeadMesh,
  t12Pos: THREE.Vector3,
  t12Quat: THREE.Quaternion,
  c7Pos: THREE.Vector3,
  c7Quat: THREE.Quaternion,
): void {
  const { radialSegs, axialSteps } = headObj;
  const stride = radialSegs + 1;
  const posAttr = headObj.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const arr = posAttr.array as Float32Array;

  // Build smooth cervical spine path from upper chest (inside V-neck) -> C7 -> C3 -> Cranial base -> Crown
  const pBase = new THREE.Vector3(0, 0.256, 0.004).applyQuaternion(t12Quat).add(t12Pos);
  const qMid = new THREE.Quaternion().copy(t12Quat).slerp(c7Quat, 0.55);
  const pMidNeck = new THREE.Vector3(0, 0.044, 0.004).applyQuaternion(qMid).add(c7Pos);
  const pSubmental = new THREE.Vector3(0, 0.082, 0.006).applyQuaternion(c7Quat).add(c7Pos);
  const pCrown = new THREE.Vector3(0, 0.304, 0.006).applyQuaternion(c7Quat).add(c7Pos);

  const neckSpline = new THREE.CatmullRomCurve3(
    [pBase, c7Pos.clone(), pMidNeck, pSubmental],
    false,
    'centripetal',
    0.5,
  );

  for (let i = 0; i <= axialSteps; i++) {
    const v = i / axialSteps;
    const sl = sampleHeadSlice(v);

    if (v <= 0.28) {
      const uNeck = v / 0.28;
      neckSpline.getPoint(uNeck, _tmpPos);
      _tmpQuat.copy(t12Quat).slerp(c7Quat, Math.min(1, Math.pow(uNeck, 0.85)));
    } else {
      const uHead = (v - 0.28) / 0.72;
      _tmpPos.copy(pSubmental).lerp(pCrown, uHead);
      _tmpQuat.copy(c7Quat);
    }

    _tmpRight.set(1, 0, 0).applyQuaternion(_tmpQuat);
    _tmpAnt.set(0, 0, 1).applyQuaternion(_tmpQuat);

    const jawMask = Math.exp(-Math.pow((v - 0.325) / 0.072, 2));
    const orbitMask = Math.exp(-Math.pow((v - 0.612) / 0.026, 2));
    const earMask = Math.exp(-Math.pow((v - 0.525) / 0.068, 2));

    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const phi = u * Math.PI * 2;
      const cosP = Math.cos(phi);
      const sinP = Math.sin(phi);

      // Subtle integrated organic auricle (ear) lateral relief at temporal region
      const lateralEar =
        earMask *
        Math.exp(-Math.pow((sinP + 0.06) / 0.16, 2)) *
        Math.pow(Math.abs(cosP), 6) *
        0.014;

      const lx =
        cosP * (sl.rx * (1 + jawMask * 0.045 * Math.pow(Math.abs(cosP), 2)) + lateralEar);

      let lz: number;
      if (sinP >= 0) {
        const noseGauss = Math.exp(-Math.pow(cosP / 0.185, 2));
        const midFaceGauss = Math.exp(-Math.pow(cosP / 0.45, 2));
        const eyeSocketHollow =
          orbitMask * Math.exp(-Math.pow((Math.abs(cosP) - 0.35) / 0.15, 2)) * -0.0062;
        const zAnterior =
          sl.zFront +
          sl.midFaceProm * midFaceGauss +
          sl.noseProm * noseGauss +
          eyeSocketHollow;
        lz = sinP * zAnterior;
      } else {
        lz = sinP * Math.abs(sl.zBack);
      }

      const vIdx = (i * stride + j) * 3;
      arr[vIdx] = _tmpPos.x + _tmpRight.x * lx + _tmpAnt.x * lz;
      arr[vIdx + 1] = _tmpPos.y + _tmpRight.y * lx + _tmpAnt.y * lz;
      arr[vIdx + 2] = _tmpPos.z + _tmpRight.z * lx + _tmpAnt.z * lz;
    }
  }

  posAttr.needsUpdate = true;
  headObj.mesh.geometry.computeVertexNormals();
  headObj.mesh.geometry.computeBoundingBox();
  headObj.mesh.geometry.computeBoundingSphere();
}

interface ArmOrganicRig {
  side: 'r' | 'l';
  shoulderGrp: THREE.Group;
  elbowGrp: THREE.Group;
  forearmTwistGrp: THREE.Group;
  wristGrp: THREE.Group;
  sleeveTube: DynamicOrganicTube;
  armPalmTube: DynamicOrganicTube;
  thumbTube: DynamicOrganicTube;
  fingerTubes: DynamicOrganicTube[];
  thumbPivot: THREE.Group;
  thumbDistal: THREE.Group;
  fingerMcps: THREE.Group[];
  fingerPips: THREE.Group[];
  fingerDips: THREE.Group[];
  pinchObject: THREE.Mesh;
}

interface LegOrganicRig {
  side: 'r' | 'l';
  hipGrp: THREE.Group;
  kneeGrp: THREE.Group;
  ankleGrp: THREE.Group;
  trouserTube: DynamicOrganicTube;
  footTube: DynamicOrganicTube;
  toeTubes: DynamicOrganicTube[];
}

export interface PhotorealMedicalRig {
  root: THREE.Group;
  joints: Record<JointKey, THREE.Group>;
  segmentMeshes: Record<SegmentGroupKey, THREE.Object3D[]>;
  sagittalPlaneMesh: THREE.Mesh;
  propsRoot: THREE.Group;
  rightHandGrip: {
    thumbPivot: THREE.Group;
    thumbDistal: THREE.Group;
    fingerMcps: THREE.Group[];
    fingerPips: THREE.Group[];
    fingerDips: THREE.Group[];
    pinchObject: THREE.Mesh;
  };
  internalDeformers: {
    torsoScrubsTube: DynamicOrganicTube;
    collarSkinTube: DynamicOrganicTube;
    pelvisPantsTube: DynamicOrganicTube;
    neckHeadObj: DynamicHeadMesh;
    armR: ArmOrganicRig;
    armL: ArmOrganicRig;
    legR: LegOrganicRig;
    legL: LegOrganicRig;
  };
}

/**
 * Configures balanced matte clinical studio lighting on a Three.js scene
 * (natural soft shading on muscle & fabric contours, zero plastic glare).
 */
export function setupMedicalStudioLighting(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
): void {
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture;
    scene.environmentIntensity = 0.22;
    pmrem.dispose();
  } catch {
    // Fallback to direct softbox studio lights
  }

  const hemi = new THREE.HemisphereLight(0xfefcfb, 0xdbe2eb, 1.12);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xfffaf4, 1.28);
  keyLight.position.set(-3.4, 2.85, 2.25);
  scene.add(keyLight);

  const frontLeftFill = new THREE.DirectionalLight(0xf8fafc, 0.74);
  frontLeftFill.position.set(2.9, 2.15, 2.15);
  scene.add(frontLeftFill);

  const backRim = new THREE.DirectionalLight(0xeef4fa, 0.52);
  backRim.position.set(-2.2, 1.75, -2.6);
  scene.add(backRim);
}

/**
 * Creates the high-fidelity continuous organic human anatomical model:
 * - Zero spherical joint caps, zero torus rings, zero plastic segmented limbs, zero blocky hands.
 * - Solid dark grey short-sleeve scrubs top & solid grey long pants (100% free of logos/pockets/patterns).
 */
export function createPhotorealMedicalRig(
  renderer: THREE.WebGLRenderer,
  isSoftware: boolean,
): PhotorealMedicalRig {
  const maxAniso = renderer.capabilities.getMaxAnisotropy() || 1;
  const segs = isSoftware ? 30 : 40;

  const skinTex = createPhotorealSkinTexture(maxAniso);
  const headTex = createPhotorealHeadTexture(maxAniso);
  const scrubsCollarTex = createSolidDarkGreyScrubsTopTexture(maxAniso, true);
  const scrubsSolidTex = createSolidDarkGreyScrubsTopTexture(maxAniso, false);
  const pantsTex = createSolidGreyPantsTexture(maxAniso);

  // Matte organic dermal & woven fabric materials (zero clearcoat plastic sheen)
  const skinMat = new THREE.MeshPhysicalMaterial({
    map: skinTex,
    roughness: 0.66,
    metalness: 0.0,
    sheen: 0.14,
    sheenRoughness: 0.78,
    sheenColor: new THREE.Color(0xffdfd0),
    clearcoat: 0.0,
  });

  const headMat = new THREE.MeshPhysicalMaterial({
    map: headTex,
    roughness: 0.68,
    metalness: 0.0,
    sheen: 0.12,
    sheenRoughness: 0.80,
    sheenColor: new THREE.Color(0xffdfd0),
    clearcoat: 0.0,
  });

  const scrubsCollarMat = new THREE.MeshPhysicalMaterial({
    map: scrubsCollarTex,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.88,
    metalness: 0.0,
    sheen: 0.10,
    sheenRoughness: 0.88,
    sheenColor: new THREE.Color(0x94a3b8),
    clearcoat: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const scrubsSolidMat = new THREE.MeshPhysicalMaterial({
    map: scrubsSolidTex,
    side: THREE.DoubleSide,
    roughness: 0.88,
    metalness: 0.0,
    sheen: 0.10,
    sheenRoughness: 0.88,
    sheenColor: new THREE.Color(0x94a3b8),
    clearcoat: 0.0,
  });

  const pantsMat = new THREE.MeshPhysicalMaterial({
    map: pantsTex,
    side: THREE.DoubleSide,
    roughness: 0.86,
    metalness: 0.0,
    sheen: 0.10,
    sheenRoughness: 0.86,
    sheenColor: new THREE.Color(0xcbd5e1),
    clearcoat: 0.0,
  });

  const root = new THREE.Group();
  const deformLayer = new THREE.Group();
  root.add(deformLayer);

  const propsRoot = new THREE.Group();
  root.add(propsRoot);

  const segmentMeshes: Record<SegmentGroupKey, THREE.Object3D[]> = {
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

  const reg = (key: SegmentGroupKey, obj: THREE.Object3D) => {
    segmentMeshes[key].push(obj);
  };

  // =========================================================================
  // ANATOMICAL 1.74m SKELETAL KINEMATIC HIERARCHY
  // =========================================================================
  const pelvis = new THREE.Group();
  pelvis.position.set(0, 0.94, 0);
  root.add(pelvis);

  const l5s1 = new THREE.Group();
  l5s1.position.set(0, 0.06, 0);
  pelvis.add(l5s1);

  const t12 = new THREE.Group();
  t12.position.set(0, 0.19, 0);
  l5s1.add(t12);

  const c7 = new THREE.Group();
  c7.position.set(0, 0.285, 0.004);
  t12.add(c7);

  const head = new THREE.Group();
  head.position.set(0, 0.135, 0.008);
  c7.add(head);

  const shoulderR = new THREE.Group();
  shoulderR.position.set(-0.174, 0.236, -0.008);
  t12.add(shoulderR);

  const elbowR = new THREE.Group();
  elbowR.position.set(0, -0.30, 0);
  shoulderR.add(elbowR);

  const forearmTwistR = new THREE.Group();
  elbowR.add(forearmTwistR);

  const wristR = new THREE.Group();
  wristR.position.set(0, -0.258, 0);
  forearmTwistR.add(wristR);

  const handR = new THREE.Group();
  handR.position.set(0, -0.092, 0.004);
  wristR.add(handR);

  const shoulderL = new THREE.Group();
  shoulderL.position.set(0.174, 0.236, -0.008);
  t12.add(shoulderL);

  const elbowL = new THREE.Group();
  elbowL.position.set(0, -0.30, 0);
  shoulderL.add(elbowL);

  const forearmTwistL = new THREE.Group();
  elbowL.add(forearmTwistL);

  const wristL = new THREE.Group();
  wristL.position.set(0, -0.258, 0);
  forearmTwistL.add(wristL);

  const handL = new THREE.Group();
  handL.position.set(0, -0.092, 0.004);
  wristL.add(handL);

  const hipR = new THREE.Group();
  hipR.position.set(-0.093, -0.04, 0);
  pelvis.add(hipR);

  const kneeR = new THREE.Group();
  kneeR.position.set(0, -0.43, 0);
  hipR.add(kneeR);

  const ankleR = new THREE.Group();
  ankleR.position.set(0, -0.42, 0);
  kneeR.add(ankleR);

  const footR = new THREE.Group();
  footR.position.set(0, -0.048, 0.138);
  ankleR.add(footR);

  const hipL = new THREE.Group();
  hipL.position.set(0.093, -0.04, 0);
  pelvis.add(hipL);

  const kneeL = new THREE.Group();
  kneeL.position.set(0, -0.43, 0);
  hipL.add(kneeL);

  const ankleL = new THREE.Group();
  ankleL.position.set(0, -0.42, 0);
  kneeL.add(ankleL);

  const footL = new THREE.Group();
  footL.position.set(0, -0.048, 0.138);
  ankleL.add(footL);

  // =========================================================================
  // CONTINUOUS POSE-DEFORMED ORGANIC MESHES (ATTACHED TO deformLayer)
  // =========================================================================

  // 1. Continuous Pelvic Saddle (Solid Grey Trousers)
  const pelvisPantsTube = createDynamicOrganicTube(pantsMat, segs, 18, true, true, false);
  deformLayer.add(pelvisPantsTube.mesh);
  reg('pelvis', pelvisPantsTube.mesh);

  // 2. Continuous Spine-Deformed Dark Grey Scrubs Torso + Clavicular Collar Skin
  const collarSkinTube = createDynamicOrganicTube(skinMat, 28, 12, true, true, false);
  deformLayer.add(collarSkinTube.mesh);
  reg('thorax', collarSkinTube.mesh);

  const torsoScrubsTube = createDynamicOrganicTube(scrubsCollarMat, segs + 6, 36, false, false, false);
  deformLayer.add(torsoScrubsTube.mesh);
  reg('thorax', torsoScrubsTube.mesh);

  // 3. Continuous Cervical Spine + High-Resolution Organic Craniofacial Head
  const neckHeadObj = createDynamicNeckAndHeadMesh(
    headMat,
    isSoftware ? 48 : 64,
    isSoftware ? 48 : 60,
  );
  deformLayer.add(neckHeadObj.mesh);
  reg('neck_head', neckHeadObj.mesh);

  // 4. Continuous Organic Arms (Short Scrub Sleeve + Seamless Biceps-Elbow-Forearm-Wrist-Palm + 5 Organic Fingers)
  const buildOrganicArm = (
    side: 'r' | 'l',
    shoulderGrp: THREE.Group,
    elbowGrp: THREE.Group,
    forearmTwistGrp: THREE.Group,
    wristGrp: THREE.Group,
  ): ArmOrganicRig => {
    const inwardSignX = side === 'r' ? 1 : -1;
    const upperKey: SegmentGroupKey = side === 'r' ? 'upper_arm_r' : 'upper_arm_l';
    const foreKey: SegmentGroupKey = side === 'r' ? 'forearm_r' : 'forearm_l';
    const handKey: SegmentGroupKey = side === 'r' ? 'hand_r' : 'hand_l';

    const sleeveTube = createDynamicOrganicTube(scrubsSolidMat, segs - 4, 18, true, false, true);
    deformLayer.add(sleeveTube.mesh);
    reg(upperKey, sleeveTube.mesh);

    // One continuous bare-skin mesh from mid-humerus through elbow, forearm, wrist, and metacarpal palm!
    const armPalmTube = createDynamicOrganicTube(skinMat, segs - 4, 42, true, true, true);
    deformLayer.add(armPalmTube.mesh);
    reg(foreKey, armPalmTube.mesh);

    // Thumb skeletal chain
    const thumbPivot = new THREE.Group();
    thumbPivot.position.set(inwardSignX * 0.009, -0.026, 0.028);
    wristGrp.add(thumbPivot);

    const thumbDistal = new THREE.Group();
    thumbDistal.position.set(0, -0.039, 0.004);
    thumbPivot.add(thumbDistal);

    const thumbTube = createDynamicOrganicTube(skinMat, 16, 14, true, true, true);
    deformLayer.add(thumbTube.mesh);
    reg(handKey, thumbTube.mesh);

    // 4 Fingers (Index, Middle, Ring, Little) — each a continuous spline-deformed finger mesh
    const fingerSpecs = [
      { oz: 0.027, len: 0.074 },
      { oz: 0.009, len: 0.082 },
      { oz: -0.009, len: 0.076 },
      { oz: -0.026, len: 0.062 },
    ];

    const fingerMcps: THREE.Group[] = [];
    const fingerPips: THREE.Group[] = [];
    const fingerDips: THREE.Group[] = [];
    const fingerTubes: DynamicOrganicTube[] = [];

    fingerSpecs.forEach((fg) => {
      const mcp = new THREE.Group();
      mcp.position.set(inwardSignX * 0.002, -0.082, fg.oz);
      wristGrp.add(mcp);
      fingerMcps.push(mcp);

      const pip = new THREE.Group();
      pip.position.set(0, -fg.len * 0.45, 0);
      mcp.add(pip);
      fingerPips.push(pip);

      const dip = new THREE.Group();
      dip.position.set(0, -fg.len * 0.31, 0);
      pip.add(dip);
      fingerDips.push(dip);

      const fTube = createDynamicOrganicTube(skinMat, 16, 15, true, true, true);
      deformLayer.add(fTube.mesh);
      reg(handKey, fTube.mesh);
      fingerTubes.push(fTube);
    });

    // Precision pinch component (OCRA Fig 6.3b)
    const pinchMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.48,
      metalness: 0.06,
    });
    const pinchObject = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.038, 0.040), pinchMat);
    pinchObject.position.set(inwardSignX * 0.030, -0.094, 0.022);
    pinchObject.visible = false;
    wristGrp.add(pinchObject);
    reg(handKey, pinchObject);

    return {
      side,
      shoulderGrp,
      elbowGrp,
      forearmTwistGrp,
      wristGrp,
      sleeveTube,
      armPalmTube,
      thumbTube,
      fingerTubes,
      thumbPivot,
      thumbDistal,
      fingerMcps,
      fingerPips,
      fingerDips,
      pinchObject,
    };
  };

  const armR = buildOrganicArm('r', shoulderR, elbowR, forearmTwistR, wristR);
  const armL = buildOrganicArm('l', shoulderL, elbowL, forearmTwistL, wristL);

  // 5. Continuous Solid Grey Long Trousers + Continuous Grounded Organic Feet
  const buildOrganicLeg = (
    side: 'r' | 'l',
    hipGrp: THREE.Group,
    kneeGrp: THREE.Group,
    ankleGrp: THREE.Group,
  ): LegOrganicRig => {
    const shankKey: SegmentGroupKey = side === 'r' ? 'shank_r' : 'shank_l';
    const footKey: SegmentGroupKey = side === 'r' ? 'foot_r' : 'foot_l';

    // Continuous trouser mesh from pelvic hip across thigh & knee down to ankle hem
    const trouserTube = createDynamicOrganicTube(pantsMat, segs - 4, 38, true, false, true);
    deformLayer.add(trouserTube.mesh);
    reg(shankKey, trouserTube.mesh);

    // Continuous bare ankle-heel-arch-forefoot skin mesh
    const footTube = createDynamicOrganicTube(skinMat, 28, 26, true, true, false);
    deformLayer.add(footTube.mesh);
    reg(footKey, footTube.mesh);

    const toeTubes: DynamicOrganicTube[] = [];
    for (let tIdx = 0; tIdx < 5; tIdx++) {
      const tt = createDynamicOrganicTube(skinMat, 12, 8, true, true, false);
      deformLayer.add(tt.mesh);
      reg(footKey, tt.mesh);
      toeTubes.push(tt);
    }

    return {
      side,
      hipGrp,
      kneeGrp,
      ankleGrp,
      trouserTube,
      footTube,
      toeTubes,
    };
  };

  const legR = buildOrganicLeg('r', hipR, kneeR, ankleR);
  const legL = buildOrganicLeg('l', hipL, kneeL, ankleL);

  // Subtle median sagittal reference plane (only visible when highlightGroup === 'sagittal_split')
  const sagPlaneMat = new THREE.MeshBasicMaterial({
    color: 0x3b82f6,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const sagittalPlaneMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 1.85), sagPlaneMat);
  sagittalPlaneMesh.rotation.y = Math.PI / 2;
  sagittalPlaneMesh.position.set(0, 0.92, 0.02);
  sagittalPlaneMesh.visible = false;
  root.add(sagittalPlaneMesh);

  return {
    root,
    joints: {
      pelvis,
      l5s1,
      t12,
      c7,
      head,
      shoulderR,
      elbowR,
      wristR,
      handR,
      shoulderL,
      elbowL,
      wristL,
      handL,
      hipR,
      kneeR,
      ankleR,
      footR,
      hipL,
      kneeL,
      ankleL,
      footL,
    },
    segmentMeshes,
    sagittalPlaneMesh,
    propsRoot,
    rightHandGrip: {
      thumbPivot: armR.thumbPivot,
      thumbDistal: armR.thumbDistal,
      fingerMcps: armR.fingerMcps,
      fingerPips: armR.fingerPips,
      fingerDips: armR.fingerDips,
      pinchObject: armR.pinchObject,
    },
    internalDeformers: {
      torsoScrubsTube,
      collarSkinTube,
      pelvisPantsTube,
      neckHeadObj,
      armR,
      armL,
      legR,
      legL,
    },
  };
}

function localToRootFrame(
  rootInv: THREE.Matrix4,
  joint: THREE.Object3D,
  lx: number,
  ly: number,
  lz: number,
): { pos: THREE.Vector3; quat: THREE.Quaternion } {
  const m = new THREE.Matrix4().multiplyMatrices(rootInv, joint.matrixWorld);
  const pos = new THREE.Vector3(lx, ly, lz).applyMatrix4(m);
  const quat = new THREE.Quaternion().setFromRotationMatrix(m);
  return { pos, quat };
}

/**
 * Rebuilds all continuous organic meshes seamlessly for the current joint transforms.
 */
function deformOrganicHumanMeshes(
  rig: PhotorealMedicalRig,
  pose: PosturePose3D,
  focusZone: FocusZone,
): void {
  const rootInv = new THREE.Matrix4().copy(rig.root.matrixWorld).invert();
  const j = rig.joints;
  const def = rig.internalDeformers;

  const fPelvis = localToRootFrame(rootInv, j.pelvis, 0, 0, 0);
  const fL5 = localToRootFrame(rootInv, j.l5s1, 0, 0, 0);
  const fT12 = localToRootFrame(rootInv, j.t12, 0, 0, 0);
  const fC7 = localToRootFrame(rootInv, j.c7, 0, 0, 0);

  // 1. Pelvic Saddle in Solid Grey Pants
  const pBot = localToRootFrame(rootInv, j.pelvis, 0, -0.098, -0.008);
  const pMid = localToRootFrame(rootInv, j.pelvis, 0, -0.032, -0.014);
  const pIliac = localToRootFrame(rootInv, j.pelvis, 0, 0.035, -0.006);
  const pTop = localToRootFrame(rootInv, j.pelvis, 0, 0.080, 0.000);
  updateDynamicOrganicTube(def.pelvisPantsTube, [
    { pos: pBot.pos, quat: pBot.quat, rx: 0.132, rzAnt: 0.090, rzPost: 0.098 },
    { pos: pMid.pos, quat: pMid.quat, rx: 0.156, rzAnt: 0.104, rzPost: 0.122 }, // Gluteal fullness
    { pos: pIliac.pos, quat: pIliac.quat, rx: 0.148, rzAnt: 0.102, rzPost: 0.108 },
    { pos: pTop.pos, quat: pTop.quat, rx: 0.136, rzAnt: 0.094, rzPost: 0.096 },
  ]);

  // 2. Continuous Spine-Deformed Dark Grey Scrubs Torso (Hip Hem -> Waist -> Ribcage/Pectorals -> V-Neck)
  const trunkFlexRatio = Math.max(0, Math.min(1, pose.trunkFlexionDeg / 65));
  const hemInner = localToRootFrame(rootInv, j.pelvis, 0, -0.044, -0.004);
  const hemOuter = localToRootFrame(rootInv, j.pelvis, 0, -0.048, -0.004);
  const waistLow = localToRootFrame(rootInv, j.l5s1, 0, 0.025, 0.002);
  const waistMid = localToRootFrame(rootInv, j.l5s1, 0, 0.115, 0.004);
  const chestLow = localToRootFrame(rootInv, j.t12, 0, 0.065, 0.006);
  const chestPec = localToRootFrame(rootInv, j.t12, 0, 0.165, 0.008);
  const shoulderLevel = localToRootFrame(rootInv, j.t12, 0, 0.236, 0.004);
  const collarTop = localToRootFrame(rootInv, j.t12, 0, 0.292, 0.004);

  const qHem = new THREE.Quaternion().copy(fPelvis.quat).slerp(fL5.quat, 0.28);
  const qWaist = new THREE.Quaternion().copy(fL5.quat).slerp(fT12.quat, 0.45);

  updateDynamicOrganicTube(
    def.torsoScrubsTube,
    [
      // Neat folded scrub hem turn-under over hips
      { pos: hemInner.pos, quat: qHem, rx: 0.148, rzAnt: 0.103, rzPost: 0.114 },
      { pos: hemOuter.pos, quat: qHem, rx: 0.160, rzAnt: 0.112, rzPost: 0.123 },
      {
        pos: waistLow.pos,
        quat: fL5.quat,
        rx: 0.148,
        rzAnt: 0.106,
        rzPost: 0.110,
        creaseAnt: trunkFlexRatio * 0.010,
      },
      {
        pos: waistMid.pos,
        quat: qWaist,
        rx: 0.144,
        rzAnt: 0.105,
        rzPost: 0.106,
        creaseAnt: trunkFlexRatio * 0.012,
      },
      { pos: fT12.pos, quat: fT12.quat, rx: 0.154, rzAnt: 0.112, rzPost: 0.112 },
      {
        pos: chestLow.pos,
        quat: fT12.quat,
        rx: 0.166,
        rzAnt: 0.118,
        rzPost: 0.116,
        pectoralGain: 0.005,
      },
      {
        pos: chestPec.pos,
        quat: fT12.quat,
        rx: 0.178,
        rzAnt: 0.120,
        rzPost: 0.116,
        pectoralGain: 0.008,
      },
      { pos: shoulderLevel.pos, quat: fT12.quat, rx: 0.174, rzAnt: 0.102, rzPost: 0.102 },
      { pos: collarTop.pos, quat: fT12.quat, rx: 0.068, rzAnt: 0.062, rzPost: 0.062 },
    ],
    trunkFlexRatio * 0.0032,
  );

  // Clavicular skin underlay inside V-neck opening
  const skinCollarLow = localToRootFrame(rootInv, j.t12, 0, 0.215, 0.005);
  const skinCollarHigh = localToRootFrame(rootInv, j.t12, 0, 0.288, 0.004);
  updateDynamicOrganicTube(def.collarSkinTube, [
    { pos: skinCollarLow.pos, quat: fT12.quat, rx: 0.125, rzAnt: 0.098, rzPost: 0.094 },
    { pos: shoulderLevel.pos, quat: fT12.quat, rx: 0.112, rzAnt: 0.088, rzPost: 0.086 },
    { pos: skinCollarHigh.pos, quat: fT12.quat, rx: 0.063, rzAnt: 0.058, rzPost: 0.058 },
  ]);

  // 3. Continuous Cervical Spine + Craniofacial Head
  updateDynamicNeckAndHeadMesh(def.neckHeadObj, fT12.pos, fT12.quat, fC7.pos, fC7.quat);

  // 4. Continuous Arms + Hands
  const updateSingleArm = (arm: ArmOrganicRig, elbowFlexDeg: number) => {
    const inwardSign = arm.side === 'r' ? 1 : -1;
    const fSh = localToRootFrame(rootInv, arm.shoulderGrp, 0, 0, 0);
    const fEl = localToRootFrame(rootInv, arm.elbowGrp, 0, 0, 0);
    const fTw = localToRootFrame(rootInv, arm.forearmTwistGrp, 0, 0, 0);
    const fWr = localToRootFrame(rootInv, arm.wristGrp, 0, 0, 0);

    // 4a. Seamless Short Scrub Sleeve (blended from thorax shoulder mass across glenohumeral joint)
    const shMedial = localToRootFrame(
      rootInv,
      arm.shoulderGrp,
      inwardSign * 0.036,
      0.018,
      0.002,
    );
    const qDeltoidRoot = new THREE.Quaternion().copy(fT12.quat).slerp(fSh.quat, 0.55);
    const slMid = localToRootFrame(rootInv, arm.shoulderGrp, 0, -0.068, 0.003);
    const slHemOuter = localToRootFrame(rootInv, arm.shoulderGrp, 0, -0.140, 0.004);
    const slHemTurnIn = localToRootFrame(rootInv, arm.shoulderGrp, 0, -0.136, 0.004);

    updateDynamicOrganicTube(arm.sleeveTube, [
      { pos: shMedial.pos, quat: qDeltoidRoot, rx: 0.058, rzAnt: 0.060, rzPost: 0.060 },
      { pos: fSh.pos, quat: fSh.quat, rx: 0.058, rzAnt: 0.061, rzPost: 0.059 },
      { pos: slMid.pos, quat: fSh.quat, rx: 0.055, rzAnt: 0.058, rzPost: 0.056 },
      { pos: slHemOuter.pos, quat: fSh.quat, rx: 0.053, rzAnt: 0.056, rzPost: 0.054 },
      { pos: slHemTurnIn.pos, quat: fSh.quat, rx: 0.043, rzAnt: 0.046, rzPost: 0.045 },
    ]);

    // 4b. Continuous Bare-Skin Arm + Elbow + Forearm + Wrist + Metacarpal Palm
    // For wrist_hand close-up, start at proximal forearm so upper arm doesn't intrude; otherwise mid-biceps inside sleeve
    const elbowRatio = Math.max(0, Math.min(1, elbowFlexDeg / 120));
    const armStartUpper = localToRootFrame(rootInv, arm.shoulderGrp, 0, -0.095, 0.003);
    const armBiceps = localToRootFrame(rootInv, arm.shoulderGrp, 0, -0.185, 0.004);
    const armDistHum = localToRootFrame(rootInv, arm.shoulderGrp, 0, -0.268, 0.001);

    const qElbowBlend = new THREE.Quaternion().copy(fSh.quat).slerp(fTw.quat, 0.50);
    const qForeProx = new THREE.Quaternion().copy(fEl.quat).slerp(fTw.quat, 0.55);
    const foreBrachio = localToRootFrame(rootInv, arm.forearmTwistGrp, 0, -0.058, 0.004);
    const foreMid = localToRootFrame(rootInv, arm.forearmTwistGrp, 0, -0.148, 0.002);
    const foreDist = localToRootFrame(rootInv, arm.forearmTwistGrp, 0, -0.228, 0.001);

    const qWristBlend = new THREE.Quaternion().copy(fTw.quat).slerp(fWr.quat, 0.55);
    const palmProx = localToRootFrame(
      rootInv,
      arm.wristGrp,
      inwardSign * 0.002,
      -0.028,
      0.003,
    );
    const palmMid = localToRootFrame(
      rootInv,
      arm.wristGrp,
      inwardSign * 0.003,
      -0.058,
      0.002,
    );
    const palmMcp = localToRootFrame(
      rootInv,
      arm.wristGrp,
      inwardSign * 0.002,
      -0.084,
      0.001,
    );

    const armControls: OrganicRingControl[] =
      focusZone === 'wrist_hand' && arm.side === 'r'
        ? [
            { pos: fEl.pos, quat: qForeProx, rx: 0.038, rzAnt: 0.041, rzPost: 0.040 },
            { pos: foreBrachio.pos, quat: fTw.quat, rx: 0.041, rzAnt: 0.045, rzPost: 0.042 },
            { pos: foreMid.pos, quat: fTw.quat, rx: 0.032, rzAnt: 0.036, rzPost: 0.034 },
            { pos: foreDist.pos, quat: fTw.quat, rx: 0.021, rzAnt: 0.029, rzPost: 0.028 },
            { pos: fWr.pos, quat: qWristBlend, rx: 0.018, rzAnt: 0.028, rzPost: 0.028 },
            { pos: palmProx.pos, quat: fWr.quat, rx: 0.017, rzAnt: 0.038, rzPost: 0.034 },
            { pos: palmMid.pos, quat: fWr.quat, rx: 0.015, rzAnt: 0.042, rzPost: 0.039 },
            { pos: palmMcp.pos, quat: fWr.quat, rx: 0.012, rzAnt: 0.040, rzPost: 0.038 },
          ]
        : [
            { pos: armStartUpper.pos, quat: fSh.quat, rx: 0.044, rzAnt: 0.049, rzPost: 0.047 },
            {
              pos: armBiceps.pos,
              quat: fSh.quat,
              rx: 0.043,
              rzAnt: 0.049 + elbowRatio * 0.005, // Natural biceps brachii contraction volume
              rzPost: 0.046,
            },
            { pos: armDistHum.pos, quat: fSh.quat, rx: 0.038, rzAnt: 0.040, rzPost: 0.039 },
            {
              pos: fEl.pos,
              quat: qElbowBlend,
              rx: 0.037,
              rzAnt: 0.038,
              rzPost: 0.040,
              creaseAnt: elbowRatio * 0.008, // Smooth cubital crease
              olecranonPost: elbowRatio * 0.007, // Natural bony olecranon contour
            },
            { pos: foreBrachio.pos, quat: fTw.quat, rx: 0.041, rzAnt: 0.045, rzPost: 0.042 },
            { pos: foreMid.pos, quat: fTw.quat, rx: 0.031, rzAnt: 0.035, rzPost: 0.034 },
            { pos: foreDist.pos, quat: fTw.quat, rx: 0.021, rzAnt: 0.029, rzPost: 0.028 },
            { pos: fWr.pos, quat: qWristBlend, rx: 0.018, rzAnt: 0.028, rzPost: 0.028 },
            { pos: palmProx.pos, quat: fWr.quat, rx: 0.017, rzAnt: 0.038, rzPost: 0.034 },
            { pos: palmMid.pos, quat: fWr.quat, rx: 0.015, rzAnt: 0.042, rzPost: 0.039 },
            { pos: palmMcp.pos, quat: fWr.quat, rx: 0.012, rzAnt: 0.040, rzPost: 0.038 },
          ];

    updateDynamicOrganicTube(arm.armPalmTube, armControls);
    if (focusZone === 'wrist_hand' && arm.side === 'r') {
      arm.sleeveTube.mesh.visible = false;
    }

    // 4c. Continuous Organic Thumb
    const thThenar = localToRootFrame(
      rootInv,
      arm.wristGrp,
      inwardSign * 0.008,
      -0.018,
      0.022,
    );
    const thMcp = localToRootFrame(rootInv, arm.thumbPivot, 0, -0.016, 0.002);
    const thIp = localToRootFrame(rootInv, arm.thumbDistal, 0, 0, 0);
    const thTip = localToRootFrame(rootInv, arm.thumbDistal, 0, -0.030, 0);
    updateDynamicOrganicTube(arm.thumbTube, [
      { pos: thThenar.pos, quat: fWr.quat, rx: 0.014, rzAnt: 0.016, rzPost: 0.014 },
      { pos: thMcp.pos, quat: thMcp.quat, rx: 0.0105, rzAnt: 0.0115, rzPost: 0.0105 },
      { pos: thIp.pos, quat: thIp.quat, rx: 0.0090, rzAnt: 0.0098, rzPost: 0.0090 },
      { pos: thTip.pos, quat: thIp.quat, rx: 0.0068, rzAnt: 0.0074, rzPost: 0.0068 },
    ]);

    // 4d. 4 Continuous Organic Fingers (zero capsules, zero box nails)
    const fingerRadii = [0.0078, 0.0082, 0.0077, 0.0067];
    const distalLens = [0.019, 0.021, 0.019, 0.016];

    arm.fingerTubes.forEach((fTube, idx) => {
      const rBase = fingerRadii[idx];
      const mcpGrp = arm.fingerMcps[idx];
      const pipGrp = arm.fingerPips[idx];
      const dipGrp = arm.fingerDips[idx];

      const fWeb = localToRootFrame(rootInv, mcpGrp, 0, 0.006, 0);
      const fMcp = localToRootFrame(rootInv, mcpGrp, 0, -0.004, 0);
      const fPip = localToRootFrame(rootInv, pipGrp, 0, 0, 0);
      const fDip = localToRootFrame(rootInv, dipGrp, 0, 0, 0);
      const fTip = localToRootFrame(rootInv, dipGrp, 0, -distalLens[idx], 0);

      updateDynamicOrganicTube(fTube, [
        { pos: fWeb.pos, quat: fWr.quat, rx: rBase * 1.05, rzAnt: rBase * 1.08, rzPost: rBase * 1.05 },
        { pos: fMcp.pos, quat: fMcp.quat, rx: rBase * 0.96, rzAnt: rBase * 1.02, rzPost: rBase * 1.00 },
        { pos: fPip.pos, quat: fPip.quat, rx: rBase * 0.85, rzAnt: rBase * 0.90, rzPost: rBase * 0.88 },
        { pos: fDip.pos, quat: fDip.quat, rx: rBase * 0.75, rzAnt: rBase * 0.80, rzPost: rBase * 0.78 },
        { pos: fTip.pos, quat: fDip.quat, rx: rBase * 0.56, rzAnt: rBase * 0.62, rzPost: rBase * 0.58 },
      ]);
    });
  };

  updateSingleArm(def.armR, pose.elbowRFlexionDeg);
  updateSingleArm(def.armL, pose.elbowLFlexionDeg);

  // 5. Continuous Grey Trousers + Grounded Organic Feet
  const updateSingleLeg = (leg: LegOrganicRig, kneeFlexDeg: number) => {
    const signX = leg.side === 'r' ? -1 : 1;
    const fHip = localToRootFrame(rootInv, leg.hipGrp, 0, 0, 0);
    const fKnee = localToRootFrame(rootInv, leg.kneeGrp, 0, 0, 0);
    const fAnk = localToRootFrame(rootInv, leg.ankleGrp, 0, 0, 0);

    const kneeRatio = Math.max(0, Math.min(1, kneeFlexDeg / 95));
    const qHipBlend = new THREE.Quaternion().copy(fPelvis.quat).slerp(fHip.quat, 0.55);
    const qKneeBlend = new THREE.Quaternion().copy(fHip.quat).slerp(fKnee.quat, 0.50);

    const hipTop = localToRootFrame(rootInv, leg.hipGrp, -signX * 0.012, 0.052, -0.006);
    const thighUpper = localToRootFrame(rootInv, leg.hipGrp, 0, -0.115, 0.006);
    const thighLower = localToRootFrame(rootInv, leg.hipGrp, 0, -0.305, 0.004);
    const calfGastroc = localToRootFrame(rootInv, leg.kneeGrp, 0, -0.125, -0.011);
    const calfMid = localToRootFrame(rootInv, leg.kneeGrp, 0, -0.265, -0.005);
    const hemOuter = localToRootFrame(rootInv, leg.kneeGrp, 0, -0.392, -0.002);
    const hemTurnIn = localToRootFrame(rootInv, leg.kneeGrp, 0, -0.388, -0.002);

    updateDynamicOrganicTube(leg.trouserTube, [
      { pos: hipTop.pos, quat: qHipBlend, rx: 0.090, rzAnt: 0.092, rzPost: 0.104 },
      { pos: fHip.pos, quat: fHip.quat, rx: 0.089, rzAnt: 0.094, rzPost: 0.102 },
      { pos: thighUpper.pos, quat: fHip.quat, rx: 0.085, rzAnt: 0.094, rzPost: 0.090 },
      { pos: thighLower.pos, quat: fHip.quat, rx: 0.068, rzAnt: 0.074, rzPost: 0.070 },
      {
        pos: fKnee.pos,
        quat: qKneeBlend,
        rx: 0.058,
        rzAnt: 0.062 + kneeRatio * 0.006, // Patellar contour
        rzPost: 0.058 - kneeRatio * 0.008, // Popliteal crease
      },
      { pos: calfGastroc.pos, quat: fKnee.quat, rx: 0.060, rzAnt: 0.058, rzPost: 0.072 }, // Gastrocnemius muscle volume
      { pos: calfMid.pos, quat: fKnee.quat, rx: 0.052, rzAnt: 0.054, rzPost: 0.058 },
      { pos: hemOuter.pos, quat: fKnee.quat, rx: 0.048, rzAnt: 0.052, rzPost: 0.052 },
      { pos: hemTurnIn.pos, quat: fKnee.quat, rx: 0.036, rzAnt: 0.039, rzPost: 0.039 },
    ]);

    // Continuous Bare Ankle + Calcaneal Heel + Plantar Arch + Forefoot
    const ankProx = localToRootFrame(rootInv, leg.kneeGrp, 0, -0.352, -0.002);
    const qAnkBlend = new THREE.Quaternion().copy(fKnee.quat).slerp(fAnk.quat, 0.65);

    // Build foot frame oriented forward along +Z of ankleGrp (local X = mediolateral, local Z = dorsal/plantar)
    const footRotOffset = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      Math.PI / 2,
    );
    const qFootForward = new THREE.Quaternion().copy(fAnk.quat).multiply(footRotOffset);

    const fHeel = localToRootFrame(rootInv, leg.ankleGrp, 0, -0.030, -0.046);
    const fTalus = localToRootFrame(rootInv, leg.ankleGrp, 0, -0.026, 0.004);
    const fArch = localToRootFrame(rootInv, leg.ankleGrp, 0, -0.032, 0.068);
    const fBall = localToRootFrame(rootInv, leg.ankleGrp, 0, -0.038, 0.136);
    const fForeTip = localToRootFrame(rootInv, leg.ankleGrp, 0, -0.041, 0.156);

    updateDynamicOrganicTube(leg.footTube, [
      { pos: ankProx.pos, quat: fKnee.quat, rx: 0.035, rzAnt: 0.038, rzPost: 0.040 },
      { pos: fAnk.pos, quat: qAnkBlend, rx: 0.036, rzAnt: 0.040, rzPost: 0.042 },
      { pos: fHeel.pos, quat: qFootForward, rx: 0.030, rzAnt: 0.022, rzPost: 0.026 },
      { pos: fTalus.pos, quat: qFootForward, rx: 0.035, rzAnt: 0.024, rzPost: 0.032 },
      { pos: fArch.pos, quat: qFootForward, rx: 0.038, rzAnt: 0.018, rzPost: 0.026 },
      { pos: fBall.pos, quat: qFootForward, rx: 0.045, rzAnt: 0.012, rzPost: 0.018 },
      { pos: fForeTip.pos, quat: qFootForward, rx: 0.041, rzAnt: 0.009, rzPost: 0.012 },
    ]);

    const toeSpecs = [
      { m: -0.026, len: 0.036, r: 0.0100 },
      { m: -0.010, len: 0.033, r: 0.0074 },
      { m: 0.003, len: 0.029, r: 0.0068 },
      { m: 0.015, len: 0.025, r: 0.0063 },
      { m: 0.026, len: 0.021, r: 0.0057 },
    ];
    toeSpecs.forEach((ts, tIdx) => {
      const xOff = -signX * (-ts.m);
      const tStart = localToRootFrame(rootInv, leg.ankleGrp, xOff, -0.039, 0.144);
      const tMid = localToRootFrame(rootInv, leg.ankleGrp, xOff, -0.040, 0.144 + ts.len * 0.55);
      const tEnd = localToRootFrame(rootInv, leg.ankleGrp, xOff, -0.041, 0.144 + ts.len);
      updateDynamicOrganicTube(leg.toeTubes[tIdx], [
        { pos: tStart.pos, quat: qFootForward, rx: ts.r, rzAnt: ts.r * 0.78, rzPost: ts.r * 0.82 },
        { pos: tMid.pos, quat: qFootForward, rx: ts.r * 0.88, rzAnt: ts.r * 0.72, rzPost: ts.r * 0.76 },
        { pos: tEnd.pos, quat: qFootForward, rx: ts.r * 0.68, rzAnt: ts.r * 0.58, rzPost: ts.r * 0.62 },
      ]);
    });
  };

  updateSingleLeg(def.legR, pose.kneeRFlexionDeg);
  updateSingleLeg(def.legL, pose.kneeLFlexionDeg);
}

export function clearMedicalProps(propsRoot: THREE.Group): void {
  while (propsRoot.children.length > 0) {
    const child = propsRoot.children[0];
    propsRoot.remove(child);
    child.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m.dispose());
      }
    });
  }
}

function addCrispPropOutline(group: THREE.Group, mesh: THREE.Mesh, hex = 0x1e293b, opacity = 0.55) {
  group.add(mesh);
  const edges = new THREE.EdgesGeometry(mesh.geometry, 24);
  const line = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: hex, transparent: true, opacity }),
  );
  mesh.add(line);
}

/**
 * Builds clean studio workstation/load props when required by a book figure.
 */
export function buildMedicalSceneProp(
  rig: PhotorealMedicalRig,
  prop: ScenePropType | undefined,
): void {
  clearMedicalProps(rig.propsRoot);
  if (!prop || prop === 'none') return;

  const handWorld = new THREE.Vector3();
  rig.joints.handR.getWorldPosition(handWorld);
  const pelvisWorld = new THREE.Vector3();
  rig.joints.pelvis.getWorldPosition(pelvisWorld);

  const structMat = new THREE.MeshStandardMaterial({
    color: 0xdbe2ea,
    roughness: 0.66,
    metalness: 0.10,
  });
  const loadMat = new THREE.MeshStandardMaterial({
    color: 0xd9b99b,
    roughness: 0.70,
    metalness: 0.02,
  });

  switch (prop) {
    case 'chair':
    case 'bus_driver_seat': {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.42), structMat);
      seat.position.set(0, pelvisWorld.y - 0.08, pelvisWorld.z + 0.04);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 0.04), structMat);
      back.position.set(0, pelvisWorld.y + 0.16, pelvisWorld.z - 0.16);
      const ped = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.04, Math.max(0.2, pelvisWorld.y - 0.1), 12),
        structMat,
      );
      ped.position.set(0, (pelvisWorld.y - 0.1) / 2, pelvisWorld.z);
      addCrispPropOutline(rig.propsRoot, seat);
      addCrispPropOutline(rig.propsRoot, back);
      addCrispPropOutline(rig.propsRoot, ped);
      if (prop === 'bus_driver_seat') {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.016, 12, 24), structMat);
        wheel.rotation.x = Math.PI / 3;
        wheel.position.set(0, pelvisWorld.y + 0.25, pelvisWorld.z + 0.42);
        addCrispPropOutline(rig.propsRoot, wheel);
      }
      break;
    }
    case 'work_desk_support':
    case 'office_desk_corner_monitor':
    case 'office_desk_lateral':
    case 'high_scanner_desk': {
      const deskH = prop === 'high_scanner_desk' ? 1.02 : handWorld.y - 0.03;
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.03, 0.52), structMat);
      top.position.set(0, deskH, handWorld.z + 0.16);
      addCrispPropOutline(rig.propsRoot, top);
      if (prop === 'office_desk_corner_monitor' || prop === 'office_desk_lateral') {
        const mon = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.025), structMat);
        mon.position.set(
          prop === 'office_desk_corner_monitor' ? -0.22 : 0,
          deskH + 0.22,
          handWorld.z + 0.30,
        );
        if (prop === 'office_desk_corner_monitor') mon.rotation.y = 0.55;
        addCrispPropOutline(rig.propsRoot, mon);
      }
      break;
    }
    case 'box_load':
    case 'pallet_cooler':
    case 'bin_to_cart': {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.22, 0.26), loadMat);
      box.position.set(0, handWorld.y + 0.02, handWorld.z + 0.09);
      addCrispPropOutline(rig.propsRoot, box, 0x475569, 0.65);
      break;
    }
    case 'floor_pouches': {
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.22), loadMat);
      pouch.position.set(0, Math.max(0.06, handWorld.y - 0.04), handWorld.z + 0.06);
      addCrispPropOutline(rig.propsRoot, pouch, 0x475569, 0.65);
      break;
    }
    case 'electrical_panel':
    case 'cold_room_high_shelf': {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.55, 0.18), structMat);
      cab.position.set(0, 0.82, handWorld.z + 0.18);
      addCrispPropOutline(rig.propsRoot, cab);
      if (prop === 'cold_room_high_shelf') {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.20, 0.24), loadMat);
        crate.position.set(0, handWorld.y + 0.04, handWorld.z + 0.08);
        addCrispPropOutline(rig.propsRoot, crate, 0x475569, 0.65);
      }
      break;
    }
    case 'trench_shovel': {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.15, 12), structMat);
      shaft.position.set(-0.08, handWorld.y - 0.25, handWorld.z + 0.18);
      shaft.rotation.x = 0.65;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.02), loadMat);
      blade.position.set(-0.08, Math.max(0.06, handWorld.y - 0.68), handWorld.z + 0.52);
      blade.rotation.x = 0.65;
      addCrispPropOutline(rig.propsRoot, shaft);
      addCrispPropOutline(rig.propsRoot, blade);
      break;
    }
    case 'iron_tamper_low':
    case 'iron_tamper_high': {
      const barY = prop === 'iron_tamper_high' ? handWorld.y - 0.35 : handWorld.y - 0.42;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.05, 12), structMat);
      bar.position.set(0, Math.max(0.52, barY), handWorld.z + 0.05);
      const basePlate = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.24), loadMat);
      basePlate.position.set(0, Math.max(0.025, barY - 0.52), handWorld.z + 0.05);
      addCrispPropOutline(rig.propsRoot, bar);
      addCrispPropOutline(rig.propsRoot, basePlate);
      break;
    }
    case 'crane_levers': {
      const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.28), structMat);
      consoleBox.position.set(0, 0.42, handWorld.z + 0.12);
      const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 12), loadMat);
      lever.position.set(-0.08, 0.78, handWorld.z + 0.06);
      lever.rotation.x = -0.35;
      addCrispPropOutline(rig.propsRoot, consoleBox);
      addCrispPropOutline(rig.propsRoot, lever);
      break;
    }
    case 'cart_push_dynamo':
    case 'cart_pull_dynamo': {
      const cart = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.68), structMat);
      cart.position.set(0, 0.46, handWorld.z + 0.44);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 12), loadMat);
      handle.rotation.z = Math.PI / 2;
      handle.position.set(0, handWorld.y, handWorld.z + 0.08);
      addCrispPropOutline(rig.propsRoot, cart);
      addCrispPropOutline(rig.propsRoot, handle);
      break;
    }
    case 'loading_dock_van': {
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.5), structMat);
      step.position.set(0, 0.21, 0.55);
      addCrispPropOutline(rig.propsRoot, step);
      break;
    }
  }
}

/**
 * Applies a biomechanical PosturePose3D, updates all continuous organic pose-deformed meshes,
 * aligns feet flush with y = 0 floor, and enforces non-mutilated segment visibility.
 */
export function applyPoseToPhotorealRig(
  rig: PhotorealMedicalRig,
  pose: PosturePose3D,
  focusZone: FocusZone = 'full_body',
  autoKeepStandingFeetFlat = false,
): void {
  const j = rig.joints;
  const def = rig.internalDeformers;

  const naturalPoise =
    pose.stanceMode === 'standing' &&
    pose.kneeRFlexionDeg === 0 &&
    pose.hipRFlexionDeg === 0 &&
    focusZone === 'full_body'
      ? 3
      : 0;
  const effHipR = pose.hipRFlexionDeg + (naturalPoise ? 1.5 : 0);
  const effKneeR = pose.kneeRFlexionDeg + naturalPoise;
  const effHipL = pose.hipLFlexionDeg + (naturalPoise ? 1.5 : 0);
  const effKneeL = pose.kneeLFlexionDeg + naturalPoise;

  let pelvisY = 0.935;
  if (pose.stanceMode === 'seated') pelvisY = 0.54;
  else if (pose.stanceMode === 'squatting') pelvisY = 0.56;
  else if (pose.stanceMode === 'kneeling') pelvisY = 0.52;
  else {
    const hipRad = Math.abs(effHipR) * DEG2RAD;
    const kneeRad = Math.abs(effKneeR) * DEG2RAD;
    pelvisY =
      0.088 +
      0.43 * Math.cos(hipRad) +
      0.42 * Math.cos(Math.max(0, kneeRad - hipRad * 0.6));
  }

  j.pelvis.position.set(0, pelvisY, 0);
  j.pelvis.rotation.set(0, 0, 0);

  const trunkFlex = pose.trunkFlexionDeg * DEG2RAD;
  const trunkLat = pose.trunkLateralDeg * DEG2RAD;
  const trunkTwist = pose.trunkTwistDeg * DEG2RAD;

  j.l5s1.rotation.set(trunkFlex * 0.60, -trunkTwist * 0.45, trunkLat * 0.6);
  j.t12.rotation.set(trunkFlex * 0.40, -trunkTwist * 0.55, trunkLat * 0.4);

  j.c7.rotation.set(
    pose.neckFlexionDeg * DEG2RAD,
    -pose.neckTwistDeg * DEG2RAD,
    pose.neckLateralDeg * DEG2RAD,
  );
  j.head.rotation.set(0, 0, 0);

  j.shoulderR.position.set(-0.174, pose.shoulderRElevated ? 0.270 : 0.236, -0.008);
  j.shoulderL.position.set(0.174, 0.236, -0.008);

  const crossMidR = pose.forearmRCrossMidline ? 26 * DEG2RAD : 0;
  j.shoulderR.rotation.set(
    -pose.shoulderRFlexionDeg * DEG2RAD,
    crossMidR,
    -pose.shoulderRAbductionDeg * DEG2RAD + (pose.forearmRCrossMidline ? 0.30 : 0),
  );
  j.shoulderL.rotation.set(
    -pose.shoulderLFlexionDeg * DEG2RAD,
    0,
    pose.shoulderLAbductionDeg * DEG2RAD,
  );

  // Separate pure elbow flexion (Rx) from anatomical forearm pronation/supination (Ry)
  j.elbowR.rotation.set(-pose.elbowRFlexionDeg * DEG2RAD, 0, 0);
  j.elbowL.rotation.set(-pose.elbowLFlexionDeg * DEG2RAD, 0, 0);

  // When evaluating palmar/dorsal wrist flexion in sagittal profile or radial/ulnar deviation from top,
  // ensure palm-down pronated orientation if pronation wasn't explicitly set so palmar flexion bends in true sagittal plane!
  const needsPronatedWristRef =
    (Math.abs(pose.wristRFlexionDeg) > 0 ||
      Math.abs(pose.wristRDeviationDeg) > 0 ||
      focusZone === 'wrist_hand') &&
    pose.forearmRPronationDeg === 0;
  const effPronoR = needsPronatedWristRef ? 86 : pose.forearmRPronationDeg;

  def.armR.forearmTwistGrp.rotation.set(0, effPronoR * DEG2RAD, 0);
  def.armL.forearmTwistGrp.rotation.set(0, -(pose.forearmLPronationDeg ?? 0) * DEG2RAD, 0);

  // Exact anatomical radiocarpal axes inside wristGrp:
  // +Z rotation = palmar flexion (+X), -Z rotation = dorsal extension (-X)
  // +X rotation = ulnar deviation (-Z), -X rotation = radial deviation (+Z)
  j.wristR.rotation.set(
    pose.wristRDeviationDeg * DEG2RAD,
    0,
    pose.wristRFlexionDeg * DEG2RAD,
  );
  j.wristL.rotation.set(
    -(pose.wristLDeviationDeg ?? 0) * DEG2RAD,
    0,
    (pose.wristLFlexionDeg ?? 0) * DEG2RAD,
  );

  // Finger articulation (natural organic curvature)
  const applyHandFingerCurl = (
    arm: ArmOrganicRig,
    mode: 'open' | 'relaxed' | 'pinch' | 'power_grip' | 'box_cradle',
  ) => {
    const s = arm.side === 'r' ? 1 : -1;
    if (mode === 'open') {
      arm.thumbPivot.rotation.set(-0.18, 0, s * 0.14);
      arm.thumbDistal.rotation.set(0, 0, 0);
      const spreads = [-0.14, -0.04, 0.05, 0.15];
      arm.fingerMcps.forEach((g, idx) => g.rotation.set(spreads[idx], 0, 0));
      arm.fingerPips.forEach((g) => g.rotation.set(0, 0, 0));
      arm.fingerDips.forEach((g) => g.rotation.set(0, 0, 0));
      arm.pinchObject.visible = false;
    } else if (mode === 'pinch') {
      arm.thumbPivot.rotation.set(0.32, -s * 0.14, -s * 0.46);
      arm.thumbDistal.rotation.set(0, 0, -s * 0.36);
      const mcpCurls = [-0.58, -0.66, -1.04, -1.14];
      const pipCurls = [-0.76, -0.82, -1.18, -1.25];
      const dipCurls = [-0.42, -0.46, -0.76, -0.80];
      arm.fingerMcps.forEach((g, idx) => g.rotation.set(0, 0, s * mcpCurls[idx]));
      arm.fingerPips.forEach((g, idx) => g.rotation.set(0, 0, s * pipCurls[idx]));
      arm.fingerDips.forEach((g, idx) => g.rotation.set(0, 0, s * dipCurls[idx]));
      arm.pinchObject.visible = arm.side === 'r';
    } else if (mode === 'box_cradle') {
      arm.thumbPivot.rotation.set(0.24, 0, -s * 0.22);
      arm.thumbDistal.rotation.set(0, 0, -s * 0.16);
      const cradleCurls = [-0.36, -0.40, -0.44, -0.48];
      arm.fingerMcps.forEach((g, idx) => g.rotation.set(0, 0, s * cradleCurls[idx]));
      arm.fingerPips.forEach((g, idx) => g.rotation.set(0, 0, s * cradleCurls[idx] * 0.9));
      arm.fingerDips.forEach((g, idx) => g.rotation.set(0, 0, s * cradleCurls[idx] * 0.55));
      arm.pinchObject.visible = false;
    } else if (mode === 'power_grip') {
      arm.thumbPivot.rotation.set(0.34, 0, -s * 0.52);
      arm.thumbDistal.rotation.set(0, 0, -s * 0.42);
      arm.fingerMcps.forEach((g) => g.rotation.set(0, 0, -s * 1.00));
      arm.fingerPips.forEach((g) => g.rotation.set(0, 0, -s * 1.15));
      arm.fingerDips.forEach((g) => g.rotation.set(0, 0, -s * 0.72));
      arm.pinchObject.visible = false;
    } else {
      arm.thumbPivot.rotation.set(0.18, 0, -s * 0.12);
      arm.thumbDistal.rotation.set(0, 0, -s * 0.10);
      const gentle = [-0.14, -0.18, -0.22, -0.26];
      arm.fingerMcps.forEach((g, idx) =>
        g.rotation.set((idx - 1.3) * 0.024, 0, s * gentle[idx]),
      );
      arm.fingerPips.forEach((g, idx) => g.rotation.set(0, 0, s * gentle[idx] * 0.85));
      arm.fingerDips.forEach((g, idx) => g.rotation.set(0, 0, s * gentle[idx] * 0.55));
      arm.pinchObject.visible = false;
    }
  };

  const gripMode =
    pose.handGripMode ||
    (pose.prop &&
    pose.prop !== 'none' &&
    pose.prop !== 'chair' &&
    pose.prop !== 'work_desk_support' &&
    pose.prop !== 'office_desk_corner_monitor' &&
    pose.prop !== 'office_desk_lateral'
      ? 'power_grip'
      : 'relaxed');

  applyHandFingerCurl(def.armR, pose.handRGripMode ?? gripMode);
  applyHandFingerCurl(
    def.armL,
    pose.handLGripMode ??
      (gripMode === 'power_grip' || gripMode === 'box_cradle' || gripMode === 'open'
        ? gripMode
        : 'relaxed'),
  );

  j.hipR.rotation.set(-effHipR * DEG2RAD, 0, 0);
  j.kneeR.rotation.set(effKneeR * DEG2RAD, 0, 0);
  const ankleRTarget =
    (autoKeepStandingFeetFlat || pose.stanceMode === 'standing' || pose.stanceMode === 'squatting') &&
    focusZone !== 'ankle_foot'
      ? effKneeR - effHipR
      : pose.ankleRDorsiflexionDeg + (naturalPoise ? 1.5 : 0);
  j.ankleR.rotation.set(-ankleRTarget * DEG2RAD, 0, 0);

  j.hipL.rotation.set(-effHipL * DEG2RAD, 0, 0);
  j.kneeL.rotation.set(effKneeL * DEG2RAD, 0, 0);
  const ankleLTarget =
    (autoKeepStandingFeetFlat || pose.stanceMode === 'standing' || pose.stanceMode === 'squatting') &&
    focusZone !== 'ankle_foot'
      ? effKneeL - effHipL
      : pose.ankleLDorsiflexionDeg + (naturalPoise ? 1.5 : 0);
  j.ankleL.rotation.set(-ankleLTarget * DEG2RAD, 0, 0);

  // Set visibility before deformation
  const activeSegments = new Set<SegmentGroupKey>(FOCUS_ZONE_SEGMENTS_MAP[focusZone]);
  (Object.keys(rig.segmentMeshes) as SegmentGroupKey[]).forEach((segKey) => {
    const visible = activeSegments.has(segKey);
    for (const obj of rig.segmentMeshes[segKey]) {
      if (obj !== def.armR.pinchObject) {
        obj.visible = visible;
      }
    }
  });

  rig.root.updateMatrixWorld(true);
  deformOrganicHumanMeshes(rig, pose, focusZone);

  // Exact world-space floor alignment so feet/knees touch y = 0 cleanly without floating or sinking
  if (focusZone !== 'wrist_hand' && focusZone !== 'ankle_foot') {
    const footBox = new THREE.Box3();
    const tmpB = new THREE.Box3();
    [def.legR.footTube.mesh, def.legL.footTube.mesh, def.legR.trouserTube.mesh].forEach((m) => {
      if (m.visible && m.geometry.boundingBox) {
        tmpB.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
        footBox.union(tmpB);
      }
    });
    if (!footBox.isEmpty() && Math.abs(footBox.min.y) > 0.002) {
      j.pelvis.position.y -= footBox.min.y;
      rig.root.updateMatrixWorld(true);
      deformOrganicHumanMeshes(rig, pose, focusZone);
    }
  }

  rig.sagittalPlaneMesh.visible = pose.highlightGroup === 'sagittal_split';

  buildMedicalSceneProp(rig, pose.prop);
  rig.root.updateMatrixWorld(true);
}

/**
 * Computes clean, non-mutilating camera framing bounds for any FocusZone:
 * - full_body, trunk_pelvis, lumbar_l5s1, shoulder_arm, elbow_forearm: frames the complete human figure
 *   so head, torso, arms, and legs are all visible in proper proportion!
 * - neck_cervical: frames from pelvis/hips up to above the head (upper-body clinical portrait where
 *   arms & torso are complete and trousers exit the bottom border cleanly).
 * - legs_knees: frames from lower waist down to grounded feet (scrub hem exits top border cleanly).
 * - ankle_foot: frames lower shank & foot (trouser leg exits top border cleanly).
 * - wrist_hand: frames distal forearm, wrist, and articulated 5-finger hand (forearm exits proximal border cleanly).
 */
export function computeNonMutilatedZoneBounds(
  rig: PhotorealMedicalRig,
  focusZone: FocusZone,
): { center: THREE.Vector3; halfExtent: number } {
  if (focusZone === 'wrist_hand') {
    const wPos = new THREE.Vector3();
    const hPos = new THREE.Vector3();
    rig.joints.wristR.getWorldPosition(wPos);
    rig.joints.handR.getWorldPosition(hPos);
    const center = wPos.clone().lerp(hPos, 0.36);
    return { center, halfExtent: 0.175 };
  }

  if (focusZone === 'ankle_foot') {
    const aPos = new THREE.Vector3();
    const fPos = new THREE.Vector3();
    rig.joints.ankleR.getWorldPosition(aPos);
    rig.joints.footR.getWorldPosition(fPos);
    const center = aPos.clone().lerp(fPos, 0.42);
    center.y += 0.04;
    return { center, halfExtent: 0.21 };
  }

  if (focusZone === 'legs_knees') {
    const pPos = new THREE.Vector3();
    const aPos = new THREE.Vector3();
    rig.joints.pelvis.getWorldPosition(pPos);
    rig.joints.ankleR.getWorldPosition(aPos);
    const topY = pPos.y + 0.08;
    const botY = Math.min(0, aPos.y - 0.05);
    const center = new THREE.Vector3(0, (topY + botY) * 0.5, (pPos.z + aPos.z) * 0.5 + 0.04);
    return { center, halfExtent: Math.max(0.46, (topY - botY) * 0.54) };
  }

  if (focusZone === 'neck_cervical') {
    // Frame from waist/hips up to crown so head, neck, shoulders, torso & arms are 100% intact
    // while keeping cervical angular sectors large and crisp!
    const cPos = new THREE.Vector3();
    const lPos = new THREE.Vector3();
    rig.joints.c7.getWorldPosition(cPos);
    rig.joints.l5s1.getWorldPosition(lPos);
    const topY = cPos.y + 0.34;
    const botY = lPos.y - 0.12;
    const center = new THREE.Vector3(0, (topY + botY) * 0.5, cPos.z + 0.05);
    return { center, halfExtent: Math.max(0.44, (topY - botY) * 0.54) };
  }

  // Full non-mutilated body framing for full_body, trunk_pelvis, lumbar_l5s1, shoulder_arm, elbow_forearm
  const box = new THREE.Box3();
  const tempBox = new THREE.Box3();
  for (const segKey of ALL_HUMAN_SEGMENTS) {
    for (const obj of rig.segmentMeshes[segKey]) {
      if (obj.visible) {
        tempBox.setFromObject(obj);
        if (!tempBox.isEmpty()) box.union(tempBox);
      }
    }
  }
  if (rig.propsRoot.children.length > 0) {
    tempBox.setFromObject(rig.propsRoot);
    if (!tempBox.isEmpty()) box.union(tempBox);
  }

  if (box.isEmpty()) {
    return { center: new THREE.Vector3(0, 0.90, 0.04), halfExtent: 0.96 };
  }

  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  return { center, halfExtent: Math.max(0.52, maxDim * 0.54) };
}

/**
 * Draws a subtle studio ground contact shadow under visible feet on a #ffffff canvas.
 */
export function drawEllipticalStudioShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): void {
  if (rx <= 1 || ry <= 1) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0.08, 0, 0, 1);
  g.addColorStop(0, 'rgba(15, 23, 42, 0.20)');
  g.addColorStop(0.55, 'rgba(30, 41, 59, 0.09)');
  g.addColorStop(1, 'rgba(30, 41, 59, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draws the standardized centered Spanish technical footer at the bottom of an illustration.
 */
export function drawCenteredManualFooter(
  ctx: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  footerBandH = 26,
  customCaption?: string,
): void {
  const cleanCaption = sanitizeManualImageText(customCaption) || MEDICAL_MANUAL_FOOTER_ES;
  const finalCaption = cleanCaption.includes('Postura de evaluación')
    ? cleanCaption
    : MEDICAL_MANUAL_FOOTER_ES;

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(1, heightPx - footerBandH, widthPx - 2, footerBandH - 1);

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(12, heightPx - footerBandH);
  ctx.lineTo(widthPx - 12, heightPx - footerBandH);
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = '600 11.5px "Plus Jakarta Sans", "Inter", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(finalCaption, widthPx / 2, heightPx - footerBandH * 0.48);
  ctx.restore();
}

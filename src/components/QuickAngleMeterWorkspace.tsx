import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Compass,
  Download,
  FileJson,
  Film,
  ImagePlus,
  MousePointerClick,
  Plus,
  RefreshCw,
  RotateCcw,
  Sliders,
} from 'lucide-react';
import {
  MethodId,
  OwasObservation,
  RebaData,
  RebaSideInput,
  RulaData,
  RulaSideInput,
  StudyPhoto,
  StudyTab,
} from '../types/ergonomics';
import { createNewStudyTab } from '../utils/defaults';
import { evaluateOwas, evaluateReba, evaluateRula } from '../utils/calculations';

interface QuickAngleMeterWorkspaceProps {
  onBackToEvaluator: () => void;
  onAddMeasuredTabToStudy: (newTab: StudyTab) => void;
}

interface NormLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

type SideCode = 'R' | 'L';
type SideMode = 'auto' | 'R' | 'L';
type FacingMode = 'auto' | 'right' | 'left';
type ModelTier = 'full' | 'heavy';
type ElbowVisualMode = 'flexion_anatomica' | 'interno_suplementario';
type CalloutSideMode = 'auto_margins' | 'left' | 'right';

interface MeterOptions {
  kg: number;
  nCrit: number;
  gapCrit: number;
  fps: number;
  neckOff: number;
  verticalCalibDeg: number;
  latMax: number;
  visMin: number;
  incl: boolean;
  smoothMedian: boolean;
  side: SideMode;
  facingMode: FacingMode;
  mdl: ModelTier;
  elbowVisualMode: ElbowVisualMode;
  showDualElbowReadout: boolean;
  calloutSideMode: CalloutSideMode;
  showKneeArc: boolean;
  // Comunes posturales
  seated: boolean;
  oneLeg: boolean;
  trTw: boolean;
  trSb: boolean;
  neckTw: boolean;
  neckSb: boolean;
  abd: boolean;
  shR: boolean;
  armSup: boolean;
  wDev: boolean;
  // RULA
  crossMid: boolean;
  wrist: 1 | 2 | 3;
  wTw: boolean;
  muscle: boolean;
  lt: 'i' | 's';
  // REBA
  wristR: 1 | 2;
  coupling: 0 | 1 | 2 | 3;
  shock: boolean;
  stat: boolean;
  rep: boolean;
  unst: boolean;
  // OWAS
  ob: 'auto' | '1' | '2' | '3' | '4';
  oa: 'auto' | '1' | '2' | '3';
  ol: 'auto' | '1' | '2' | '3' | '4' | '5' | '6' | '7';
}

interface MeasuredAngles {
  ok: boolean;
  why: '' | 'none' | 'vis' | 'face';
  ratio: number;
  lateral: boolean;
  f: number;
  trunk: number;
  upper: number;
  /** Flexión anatómica del codo: 0° = brazo totalmente extendido (prolongación del húmero), 90° = escuadra. Usado por RULA y REBA. */
  elbow: number;
  /** Ángulo interno suplementario entre brazo y antebrazo: 180° = extendido (180° - elbow). */
  elbowInternal: number;
  armLow: boolean;
  neck: number;
  kR: number;
  kL: number;
  kRInternal: number;
  kLInternal: number;
  armsUp: number;
  twist: number;
  side: number;
  abdD: number;
  trTw: boolean;
  trSb: boolean;
  abd: boolean;
}

interface FrameScoreBundle {
  rula: {
    up: number;
    lo: number;
    wr: number;
    tw: number;
    nR: number;
    trR: number;
    lg: number;
    mu: number;
    fo: number;
    A: number;
    B: number;
    C: number;
    D: number;
    final: number;
    lvl: 1 | 2 | 3 | 4;
  };
  reba: {
    tbB: number;
    nbB: number;
    lg: number;
    uR: number;
    lR: number;
    wr: number;
    cp: number;
    ld: number;
    sA: number;
    sB: number;
    act: number;
    final: number;
    lvl: 'despreciable' | 'bajo' | 'medio' | 'alto' | 'muy alto';
    lvlNum: 1 | 2 | 3 | 4;
  };
  ow: {
    back: 1 | 2 | 3 | 4;
    arms: 1 | 2 | 3;
    legs: 1 | 2 | 3 | 4 | 5 | 6 | 7;
    load: 1 | 2 | 3;
    cat: 1 | 2 | 3 | 4;
  };
  inp: {
    up: 1 | 2 | 3 | 4;
    lo: 1 | 2;
    nk: 1 | 2 | 3 | 4;
    tr: 1 | 2 | 3 | 4;
    tb: 1 | 2 | 3 | 4;
    nb: 1 | 2;
    kneeCode: 0 | 1 | 2;
    kMax: number;
  };
}

type EvaluatedFrame = MeasuredAngles & Partial<FrameScoreBundle>;

interface GroupedOwasRow {
  code: string;
  taskPhase: string;
  back: 1 | 2 | 3 | 4;
  arms: 1 | 2 | 3;
  legs: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  load: 1 | 2 | 3;
  frequencyCount: number;
  categoria: 1 | 2 | 3 | 4;
}

const WASM_CANDIDATES = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm',
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm',
];

const modelTaskUrl = (tier: ModelTier) =>
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${tier}/float16/1/pose_landmarker_${tier}.task`;

// Tablas idénticas a calculations.ts y rula-reba-owas-v11.html
const TABLES = {
  rA: [
    [
      [1, 2, 2, 2, 2, 3, 3, 3],
      [2, 2, 2, 2, 3, 3, 3, 3],
      [2, 3, 3, 3, 3, 3, 4, 4],
    ],
    [
      [2, 3, 3, 3, 3, 4, 4, 4],
      [3, 3, 3, 3, 3, 4, 4, 4],
      [3, 4, 4, 4, 4, 4, 5, 5],
    ],
    [
      [3, 3, 4, 4, 4, 4, 5, 5],
      [3, 4, 4, 4, 4, 4, 5, 5],
      [4, 4, 4, 4, 4, 5, 5, 5],
    ],
    [
      [4, 4, 4, 4, 4, 5, 5, 5],
      [4, 4, 4, 4, 4, 5, 5, 5],
      [4, 4, 4, 5, 5, 5, 6, 6],
    ],
    [
      [5, 5, 5, 5, 5, 6, 6, 7],
      [5, 6, 6, 6, 6, 7, 7, 7],
      [6, 6, 6, 7, 7, 7, 7, 8],
    ],
    [
      [7, 7, 7, 7, 7, 8, 8, 9],
      [8, 8, 8, 8, 8, 9, 9, 9],
      [9, 9, 9, 9, 9, 9, 9, 9],
    ],
  ],
  rB: [
    [1, 3, 2, 3, 3, 4, 5, 5, 6, 6, 7, 7],
    [2, 3, 2, 3, 4, 5, 5, 5, 6, 7, 7, 7],
    [3, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 7],
    [5, 5, 5, 6, 6, 7, 7, 7, 7, 7, 8, 8],
    [7, 7, 7, 7, 7, 8, 8, 8, 8, 8, 8, 8],
    [8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9],
  ],
  rC: [
    [1, 2, 3, 3, 4, 5, 5],
    [2, 2, 3, 4, 4, 5, 5],
    [3, 3, 3, 4, 4, 5, 6],
    [3, 3, 3, 4, 5, 6, 6],
    [4, 4, 4, 5, 6, 7, 7],
    [4, 4, 5, 6, 6, 7, 7],
    [5, 5, 6, 6, 7, 7, 7],
    [5, 5, 6, 7, 7, 7, 7],
  ],
  bA: [
    [
      [1, 2, 3, 4],
      [1, 2, 3, 4],
      [3, 3, 5, 6],
    ],
    [
      [2, 3, 4, 5],
      [3, 4, 5, 6],
      [4, 5, 6, 7],
    ],
    [
      [2, 4, 5, 6],
      [4, 5, 6, 7],
      [5, 6, 7, 8],
    ],
    [
      [3, 5, 6, 7],
      [5, 6, 7, 8],
      [6, 7, 8, 9],
    ],
    [
      [4, 6, 7, 8],
      [6, 7, 8, 9],
      [7, 8, 9, 9],
    ],
  ],
  bB: [
    [
      [1, 2, 2],
      [1, 2, 3],
    ],
    [
      [1, 2, 3],
      [2, 3, 4],
    ],
    [
      [3, 4, 5],
      [4, 5, 5],
    ],
    [
      [4, 5, 5],
      [5, 6, 7],
    ],
    [
      [6, 7, 8],
      [7, 8, 8],
    ],
    [
      [7, 8, 8],
      [8, 9, 9],
    ],
  ],
  bC: [
    [1, 1, 1, 2, 3, 3, 4, 5, 6, 7, 7, 7],
    [1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 7, 8],
    [2, 3, 3, 3, 4, 5, 6, 7, 7, 8, 8, 8],
    [3, 4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9],
    [4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9, 9],
    [6, 6, 6, 7, 8, 8, 9, 9, 10, 10, 10, 10],
    [7, 7, 7, 8, 9, 9, 9, 10, 10, 11, 11, 11],
    [8, 8, 8, 9, 10, 10, 10, 10, 10, 11, 11, 11],
    [9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 12],
    [10, 10, 10, 11, 11, 11, 11, 12, 12, 12, 12, 12],
    [11, 11, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12],
    [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12],
  ],
  owas: [
    [
      [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
        [2, 2, 2],
        [2, 2, 2],
        [1, 1, 1],
        [1, 1, 1],
      ],
      [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
        [2, 2, 2],
        [2, 2, 2],
        [1, 1, 1],
        [1, 1, 1],
      ],
      [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
        [2, 2, 3],
        [2, 2, 3],
        [1, 1, 1],
        [1, 1, 2],
      ],
    ],
    [
      [
        [2, 2, 3],
        [2, 2, 3],
        [2, 2, 3],
        [3, 3, 3],
        [3, 3, 3],
        [2, 2, 2],
        [2, 3, 3],
      ],
      [
        [2, 2, 3],
        [2, 2, 3],
        [2, 3, 3],
        [3, 4, 4],
        [3, 4, 4],
        [3, 3, 4],
        [2, 3, 4],
      ],
      [
        [3, 3, 4],
        [2, 2, 3],
        [3, 3, 3],
        [3, 4, 4],
        [4, 4, 4],
        [4, 4, 4],
        [2, 3, 4],
      ],
    ],
    [
      [
        [1, 1, 1],
        [1, 1, 2],
        [1, 2, 2],
        [3, 3, 3],
        [4, 4, 4],
        [1, 1, 1],
        [1, 1, 1],
      ],
      [
        [2, 2, 3],
        [1, 1, 2],
        [1, 1, 2],
        [4, 4, 4],
        [4, 4, 4],
        [3, 3, 3],
        [1, 1, 1],
      ],
      [
        [2, 2, 3],
        [1, 1, 2],
        [2, 3, 3],
        [4, 4, 4],
        [4, 4, 4],
        [4, 4, 4],
        [1, 1, 1],
      ],
    ],
    [
      [
        [2, 3, 3],
        [2, 2, 3],
        [2, 2, 3],
        [4, 4, 4],
        [4, 4, 4],
        [4, 4, 4],
        [2, 3, 4],
      ],
      [
        [3, 3, 4],
        [2, 3, 4],
        [3, 3, 4],
        [4, 4, 4],
        [4, 4, 4],
        [4, 4, 4],
        [2, 3, 4],
      ],
      [
        [4, 4, 4],
        [2, 3, 4],
        [3, 3, 4],
        [4, 4, 4],
        [4, 4, 4],
        [4, 4, 4],
        [2, 3, 4],
      ],
    ],
  ],
};

const SIDE_INDICES: Record<
  SideCode,
  { s: number; e: number; w: number; h: number; k: number; a: number; ear: number }
> = {
  R: { s: 12, e: 14, w: 16, h: 24, k: 26, a: 28, ear: 8 },
  L: { s: 11, e: 13, w: 15, h: 23, k: 25, a: 27, ear: 7 },
};

const EDITABLE_LANDMARK_LABELS: Record<number, string> = {
  7: 'Oreja Izq.',
  8: 'Oreja Der.',
  11: 'Hombro Izq.',
  12: 'Hombro Der.',
  13: 'Codo Izq.',
  14: 'Codo Der.',
  15: 'Muñeca Izq.',
  16: 'Muñeca Der.',
  23: 'Cadera Izq.',
  24: 'Cadera Der.',
  25: 'Rodilla Izq.',
  26: 'Rodilla Der.',
  27: 'Tobillo Izq.',
  28: 'Tobillo Der.',
};

const KG_PRESETS = [0, 1, 2, 3, 5, 7.5, 10, 12.5, 15, 20, 25, 30, 40];

const LEVEL_COLORS: Record<number, string> = {
  1: '#16a34a',
  2: '#eab308',
  3: '#f97316',
  4: '#dc2626',
};

const PRIORITY_NAMES: Record<number, string> = {
  1: 'Baja',
  2: 'Media',
  3: 'Alta',
  4: 'Inmediata',
};

const GENERAL_ACTION_TEXT: Record<number, string> = {
  1: 'Sin acción correctiva inmediata necesaria',
  2: 'Revisar condiciones y programar mejoras a futuro',
  3: 'Actuar pronto: rediseño postural o de tarea necesario',
  4: 'Actuar de inmediato: riesgo biomecánico crítico',
};

const METHOD_ACTION_TEXT = {
  rula: [
    '',
    'Aceptable si no se mantiene ni se repite durante largos períodos',
    'Se requiere investigar más; pueden ser necesarios cambios',
    'Se requiere investigar y cambiar pronto',
    'Se requiere investigar y cambiar de inmediato',
  ],
  reba: [
    '',
    'Actuación no necesaria (riesgo despreciable)',
    'Actuación puede ser necesaria (riesgo bajo)',
    'Actuación necesaria pronto (riesgo medio / alto)',
    'Actuación necesaria de inmediato (riesgo alto / muy alto)',
  ],
  owas: [
    '',
    'Sin medidas correctivas: postura normal',
    'Corrección requerida en un futuro próximo',
    'Corrección requerida lo antes posible',
    'Corrección inmediata de la postura',
  ],
};

const OWAS_BACK_LABELS = ['', 'Recta (<20°)', 'Inclinada (>20°)', 'Girada o lateral', 'Inclinada y girada'];
const OWAS_ARMS_LABELS = [
  '',
  'Ambos bajo nivel de hombros',
  'Un brazo al nivel o sobre hombro',
  'Ambos brazos sobre hombros',
];
const OWAS_LEGS_LABELS = [
  '',
  'Sentado',
  'De pie con ambas piernas rectas',
  'De pie sobre una pierna recta',
  'De pie o cuclillas, ambas flexionadas',
  'De pie o cuclillas, una flexionada',
  'Arrodillado (1 o 2 rodillas)',
  'Caminando o desplazándose',
];
const OWAS_LOAD_LABELS = ['', '< 10 kg', '10 a 20 kg', '> 20 kg'];

const DEFAULT_OPTIONS: MeterOptions = {
  kg: 0,
  nCrit: 3,
  gapCrit: 1.5,
  fps: 6,
  neckOff: 10,
  verticalCalibDeg: 0,
  latMax: 0.5,
  visMin: 0.4,
  incl: false,
  smoothMedian: true,
  side: 'auto',
  facingMode: 'auto',
  mdl: 'full',
  elbowVisualMode: 'interno_suplementario',
  showDualElbowReadout: false,
  calloutSideMode: 'auto_margins',
  showKneeArc: true,
  seated: false,
  oneLeg: false,
  trTw: false,
  trSb: false,
  neckTw: false,
  neckSb: false,
  abd: false,
  shR: false,
  armSup: false,
  wDev: false,
  crossMid: false,
  wrist: 1,
  wTw: false,
  muscle: false,
  lt: 'i',
  wristR: 1,
  coupling: 0,
  shock: false,
  stat: false,
  rep: false,
  unst: false,
  ob: 'auto',
  oa: 'auto',
  ol: 'auto',
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const isFin = Number.isFinite;
const radToDeg = (r: number) => (r * 180) / Math.PI;
const degToRad = (d: number) => (d * Math.PI) / 180;
const dot2 = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x * b.x + a.y * b.y;

/**
 * Calcula tanto el ángulo de flexión anatómica desde la prolongación 0° (ej. 8°)
 * como el ángulo interno incluido entre ambos segmentos (ej. 172°).
 * RULA y REBA definen el codo respecto a la prolongación del húmero (0° = extendido).
 */
function computeJointFlexionAndInternal(
  proximal: { x: number; y: number },
  vertex: { x: number; y: number },
  distal: { x: number; y: number },
): { flexion: number; internal: number } {
  const u = { x: proximal.x - vertex.x, y: proximal.y - vertex.y };
  const v = { x: distal.x - vertex.x, y: distal.y - vertex.y };
  const denom = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y) || 1;
  const internal = radToDeg(Math.acos(clamp(dot2(u, v) / denom, -1, 1)));
  return {
    flexion: 180 - internal,
    internal,
  };
}

function rebaLevelNum(finalScore: number): 1 | 2 | 3 | 4 {
  if (finalScore < 2) return 1;
  if (finalScore < 4) return 2;
  if (finalScore < 8) return 3;
  return 4;
}

function measureSagittalFrame(
  lm: NormLandmark[],
  W: number,
  H: number,
  side: SideCode,
  o: MeterOptions,
  wl: NormLandmark[] | null,
): MeasuredAngles {
  const empty: MeasuredAngles = {
    ok: false,
    why: '',
    ratio: 0,
    lateral: false,
    f: 1,
    trunk: NaN,
    upper: NaN,
    elbow: NaN,
    elbowInternal: NaN,
    armLow: false,
    neck: NaN,
    kR: NaN,
    kL: NaN,
    kRInternal: NaN,
    kLInternal: NaN,
    armsUp: 0,
    twist: NaN,
    side: NaN,
    abdD: NaN,
    trTw: false,
    trSb: false,
    abd: false,
  };

  const I = SIDE_INDICES[side];
  const P = (idx: number) => ({
    x: lm[idx].x * W,
    y: lm[idx].y * H,
    v: lm[idx].visibility ?? 1,
  });

  const s = P(I.s);
  const e = P(I.e);
  const w = P(I.w);
  const h = P(I.h);
  const ear = P(I.ear);
  const Ls = P(11);
  const Rs = P(12);
  const Lh = P(23);
  const Rh = P(24);

  if (Math.min(s.v, h.v) < o.visMin) {
    return { ...empty, why: 'vis' };
  }

  const ms = { x: (Ls.x + Rs.x) / 2, y: (Ls.y + Rs.y) / 2 };
  const mh = { x: (Lh.x + Rh.x) / 2, y: (Lh.y + Rh.y) / 2 };
  const L = Math.hypot(ms.x - mh.x, ms.y - mh.y);
  if (L < 10) {
    return { ...empty, why: 'vis' };
  }

  const u = { x: (ms.x - mh.x) / L, y: (ms.y - mh.y) / L };
  const ratio = Math.abs(Ls.x - Rs.x) / L;
  const lateral = ratio < o.latMax;

  let f = 1;
  if (o.facingMode === 'right') {
    f = 1;
  } else if (o.facingMode === 'left') {
    f = -1;
  } else {
    let fx = 0;
    const nose = P(0);
    if (nose.v > 0.3) {
      fx += nose.x - (P(7).x + P(8).x) / 2;
    }
    for (const [heelIdx, toeIdx] of [
      [29, 31],
      [30, 32],
    ]) {
      if ((lm[heelIdx]?.visibility ?? 1) > 0.3 && (lm[toeIdx]?.visibility ?? 1) > 0.3) {
        fx += (lm[toeIdx].x - lm[heelIdx].x) * W * 0.5;
      }
    }
    if (Math.abs(fx) < 0.01 * W) {
      // Respaldo por orientación de muñeca respecto a hombro si rostro/pies están recortados
      const wristOffset = w.x - s.x;
      if (Math.abs(wristOffset) >= 0.03 * W) {
        fx = wristOffset;
      } else {
        return { ...empty, ratio, lateral, why: 'face' };
      }
    }
    f = Math.sign(fx) || 1;
  }

  const n = { x: -u.y * f, y: u.x * f };
  const d = { x: -u.x, y: -u.y };

  // Eje vertical real con posible compensación de inclinación de cámara
  const calibRad = degToRad(o.verticalCalibDeg || 0);
  const upRef = { x: Math.sin(calibRad), y: -Math.cos(calibRad) };
  const rightRef = { x: Math.cos(calibRad) * f, y: Math.sin(calibRad) * f };
  const trunk = radToDeg(Math.atan2(dot2(u, rightRef), dot2(u, upRef)));

  const armVec = { x: e.x - s.x, y: e.y - s.y };
  if (Math.hypot(armVec.x, armVec.y) < 5) {
    return { ...empty, ratio, lateral, why: 'vis' };
  }
  const upper = radToDeg(Math.atan2(dot2(armVec, n), dot2(armVec, d)));

  const elbAngles = computeJointFlexionAndInternal(s, e, w);
  const armLow = Math.min(e.v, w.v) < o.visMin;

  let neck = NaN;
  if (ear.v >= 0.3) {
    const hv = { x: ear.x - s.x, y: ear.y - s.y };
    neck = radToDeg(Math.atan2(dot2(hv, n), dot2(hv, u))) - o.neckOff;
  }

  const measureKnee = (hipIdx: number, kneeIdx: number, ankIdx: number) => {
    const vMin = Math.min(
      lm[hipIdx]?.visibility ?? 1,
      lm[kneeIdx]?.visibility ?? 1,
      lm[ankIdx]?.visibility ?? 1,
    );
    if (vMin < o.visMin) return { flexion: NaN, internal: NaN };
    return computeJointFlexionAndInternal(P(hipIdx), P(kneeIdx), P(ankIdx));
  };

  const kneeR = measureKnee(24, 26, 28);
  const kneeL = measureKnee(23, 25, 27);

  const armsUp =
    ((lm[15]?.visibility ?? 1) > 0.3 && P(15).y < Ls.y ? 1 : 0) +
    ((lm[16]?.visibility ?? 1) > 0.3 && P(16).y < Rs.y ? 1 : 0);

  let twist = NaN;
  let sideTilt = NaN;
  let abdD = NaN;
  let trTw = false;
  let trSb = false;
  let abd = false;

  if (wl && wl.length >= 29) {
    try {
      const V = (idx: number): [number, number, number] => [wl[idx].x, wl[idx].y, wl[idx].z];
      const sub3 = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      const dot3 = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const unit3 = (a: number[]) => {
        const len = Math.hypot(a[0], a[1], a[2]) || 1;
        return [a[0] / len, a[1] / len, a[2] / len];
      };
      const projPlane = (a: number[], axis: number[]) => {
        const k = dot3(a, axis);
        return sub3(a, [axis[0] * k, axis[1] * k, axis[2] * k]);
      };
      const mid3 = (i: number, j: number) => {
        const a = V(i);
        const b = V(j);
        return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      };

      const up3 = unit3(sub3(mid3(11, 12), mid3(23, 24)));
      const rSh = unit3(projPlane(sub3(V(12), V(11)), up3));
      const hipVec = unit3(sub3(V(24), V(23)));
      const rHip = unit3(projPlane(hipVec, up3));
      const arm3 = sub3(V(I.e), V(I.s));
      const fwd3 = unit3([
        rSh[1] * up3[2] - rSh[2] * up3[1],
        rSh[2] * up3[0] - rSh[0] * up3[2],
        rSh[0] * up3[1] - rSh[1] * up3[0],
      ]);

      twist = radToDeg(Math.acos(clamp(dot3(rSh, rHip), -1, 1)));
      sideTilt = radToDeg(Math.asin(clamp(Math.abs(dot3(up3, hipVec)), 0, 1)));
      abdD = radToDeg(
        Math.atan2(Math.abs(dot3(arm3, rSh)), Math.hypot(dot3(arm3, fwd3), dot3(arm3, up3))),
      );
      trTw = twist > 25;
      trSb = sideTilt > 20;
      abd = abdD > 35;
    } catch {
      // Ignorar si worldLandmarks es incompleto en algún fotograma
    }
  }

  return {
    ok: true,
    why: '',
    ratio,
    lateral,
    f,
    trunk,
    upper,
    elbow: elbAngles.flexion,
    elbowInternal: elbAngles.internal,
    armLow,
    neck,
    kR: kneeR.flexion,
    kL: kneeL.flexion,
    kRInternal: kneeR.internal,
    kLInternal: kneeL.internal,
    armsUp,
    twist,
    side: sideTilt,
    abdD,
    trTw,
    trSb,
    abd,
  };
}

function medianOfFinite(vals: number[]): number {
  const valid = vals.filter(isFin).sort((a, b) => a - b);
  return valid.length ? valid[valid.length >> 1] : NaN;
}

/**
 * Suavizado temporal por mediana de ventana 3 (definido en v11.html pero antes inactivo).
 */
function smoothMeasuredFrames(frames: MeasuredAngles[]): MeasuredAngles[] {
  if (frames.length <= 2) return frames.map((m) => ({ ...m }));
  return frames.map((m, idx) => {
    if (!m.ok) return { ...m };
    const win = [frames[idx - 1], m, frames[idx + 1]].filter((q) => q && q.ok);
    const next: MeasuredAngles = { ...m };
    next.trunk = medianOfFinite(win.map((q) => q.trunk));
    next.upper = medianOfFinite(win.map((q) => q.upper));
    next.elbow = medianOfFinite(win.map((q) => q.elbow));
    next.elbowInternal = isFin(next.elbow) ? 180 - next.elbow : NaN;
    next.neck = medianOfFinite(win.map((q) => q.neck));
    next.kR = medianOfFinite(win.map((q) => q.kR));
    next.kL = medianOfFinite(win.map((q) => q.kL));
    next.kRInternal = isFin(next.kR) ? 180 - next.kR : NaN;
    next.kLInternal = isFin(next.kL) ? 180 - next.kL : NaN;
    return next;
  });
}

function scoreMeasuredFrame(m: MeasuredAngles, o: MeterOptions): FrameScoreBundle {
  const upperBase = (deg: number): 1 | 2 | 3 | 4 =>
    deg > 90 ? 4 : deg > 45 ? 3 : deg > 20 || deg < -20 ? 2 : 1;

  // RULA y REBA: ángulo interno brazo-antebrazo entre 80° y 120° = 1 (equiv. 60°–100° flexión);
  // fuera de ese rango (30°–80° flexión cerrada o 120°–170°+ brazo extendido) = 2
  const loBase: 1 | 2 = m.elbowInternal >= 80 && m.elbowInternal <= 120 ? 1 : 2;
  const absTrunk = Math.abs(m.trunk);
  const kMax = Math.max(isFin(m.kR) ? m.kR : 0, isFin(m.kL) ? m.kL : 0);
  const kneeCode: 0 | 1 | 2 = kMax > 60 ? 2 : kMax >= 30 ? 1 : 0;

  const tw = o.trTw || m.trTw;
  const sb = o.trSb || m.trSb;
  const ab = o.abd || m.abd;
  const neckRotOrSide = o.neckTw || o.neckSb ? 1 : 0;

  // 1. RULA
  const upBaseVal = upperBase(m.upper);
  const up = clamp(upBaseVal + (o.shR ? 1 : 0) + (ab ? 1 : 0) - (o.armSup ? 1 : 0), 1, 6);
  const lo = clamp(loBase + (o.crossMid ? 1 : 0), 1, 3);
  const wr = clamp(o.wrist + (o.wDev ? 1 : 0), 1, 4);
  const tws = o.wTw ? 2 : 1;

  const nkBase: 1 | 2 | 3 | 4 = isFin(m.neck)
    ? m.neck < -5
      ? 4
      : m.neck <= 10
        ? 1
        : m.neck <= 20
          ? 2
          : 3
    : 2;
  const nR = clamp(nkBase + (o.neckTw ? 1 : 0) + (o.neckSb ? 1 : 0), 1, 6);

  // Tronco neutro erguido (<5°) o sentado bien apoyado = 1; 5°–20° = 2; 20°–60° = 3; >60° = 4
  const trBase: 1 | 2 | 3 | 4 =
    o.seated || absTrunk < 5 ? 1 : absTrunk <= 20 ? 2 : absTrunk <= 60 ? 3 : 4;
  const trR = clamp(trBase + (tw ? 1 : 0) + (sb ? 1 : 0), 1, 6);

  const mu = o.muscle ? 1 : 0;
  const fo = o.shock
    ? 3
    : o.kg < 2
      ? 0
      : o.kg < 10
        ? o.lt === 'i'
          ? 1
          : 2
        : o.lt === 'i'
          ? 2
          : 3;
  const lgR = o.oneLeg ? 2 : 1;

  const rulaTableA =
    TABLES.rA[clamp(up, 1, 6) - 1][clamp(lo, 1, 3) - 1][
      (clamp(wr, 1, 4) - 1) * 2 + clamp(tws, 1, 2) - 1
    ];
  const rulaTableB = TABLES.rB[nR - 1][(trR - 1) * 2 + lgR - 1];
  const C = rulaTableA + mu + fo;
  const D = rulaTableB + mu + fo;
  const rFinal = TABLES.rC[clamp(C, 1, 8) - 1][clamp(D, 1, 7) - 1];
  const rLvl: 1 | 2 | 3 | 4 = rFinal <= 2 ? 1 : rFinal <= 4 ? 2 : rFinal <= 6 ? 3 : 4;

  // 2. REBA
  const tbBase: 1 | 2 | 3 | 4 =
    absTrunk < 5 ? 1 : m.trunk > 0 ? (absTrunk <= 20 ? 2 : absTrunk <= 60 ? 3 : 4) : absTrunk <= 20 ? 2 : 3;
  const tbB = clamp(tbBase + (tw || sb ? 1 : 0), 1, 5);
  const nbBase: 1 | 2 = !isFin(m.neck) || (m.neck >= -5 && m.neck <= 20) ? 1 : 2;
  const nbB = clamp(nbBase + neckRotOrSide, 1, 3);
  const lg = clamp((o.oneLeg ? 2 : 1) + kneeCode, 1, 4);
  const rebaTableA = TABLES.bA[tbB - 1][nbB - 1][lg - 1];
  const ld = (o.kg < 5 ? 0 : o.kg <= 10 ? 1 : 2) + (o.shock ? 1 : 0);
  const sA = clamp(rebaTableA + ld, 1, 12);

  const uR = clamp(
    (m.upper < -20 ? 2 : m.upper <= 20 ? 1 : m.upper <= 45 ? 2 : m.upper <= 90 ? 3 : 4) +
      (o.shR ? 1 : 0) +
      (ab ? 1 : 0) -
      (o.armSup ? 1 : 0),
    1,
    6,
  );
  const wrB = clamp(o.wristR + (o.wDev ? 1 : 0), 1, 3);
  const sB = clamp(TABLES.bB[uR - 1][loBase - 1][wrB - 1] + o.coupling, 1, 12);
  const act = (o.stat ? 1 : 0) + (o.rep ? 1 : 0) + (o.unst ? 1 : 0);
  const bFinal = clamp(TABLES.bC[sA - 1][sB - 1] + act, 1, 15);
  const bLvl: FrameScoreBundle['reba']['lvl'] =
    bFinal < 2
      ? 'despreciable'
      : bFinal < 4
        ? 'bajo'
        : bFinal < 8
          ? 'medio'
          : bFinal < 11
            ? 'alto'
            : 'muy alto';

  // 3. OWAS
  const bent = absTrunk > 20;
  const backTw = tw || sb;
  const back = (
    o.ob !== 'auto' ? Number(o.ob) : bent && backTw ? 4 : backTw ? 3 : bent ? 2 : 1
  ) as 1 | 2 | 3 | 4;
  const arms = (
    o.oa !== 'auto' ? Number(o.oa) : clamp(1 + (m.armsUp || 0), 1, 3)
  ) as 1 | 2 | 3;

  let legs: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  if (o.ol !== 'auto') {
    legs = Number(o.ol) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
  } else if (o.seated) {
    legs = 1;
  } else {
    const kRBent = isFin(m.kR) && m.kR > 30;
    const kLBent = isFin(m.kL) && m.kL > 30;
    legs = kRBent && kLBent ? 4 : kRBent || kLBent ? 5 : o.oneLeg ? 3 : 2;
  }
  const load: 1 | 2 | 3 = o.kg < 10 ? 1 : o.kg <= 20 ? 2 : 3;
  const cat = TABLES.owas[back - 1][arms - 1][legs - 1][load - 1] as 1 | 2 | 3 | 4;

  return {
    rula: {
      up,
      lo,
      wr,
      tw: tws,
      nR,
      trR,
      lg: lgR,
      mu,
      fo,
      A: rulaTableA,
      B: rulaTableB,
      C,
      D,
      final: rFinal,
      lvl: rLvl,
    },
    reba: {
      tbB,
      nbB,
      lg,
      uR,
      lR: loBase,
      wr: wrB,
      cp: o.coupling,
      ld,
      sA,
      sB,
      act,
      final: bFinal,
      lvl: bLvl,
      lvlNum: rebaLevelNum(bFinal),
    },
    ow: { back, arms, legs, load, cat },
    inp: {
      up: upBaseVal,
      lo: loBase,
      nk: nkBase,
      tr: trBase,
      tb: tbBase,
      nb: nbBase,
      kneeCode,
      kMax,
    },
  };
}

function drawAngleSector(
  g: CanvasRenderingContext2D,
  center: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  radius: number,
  color: string,
) {
  const a0 = Math.atan2(p1.y - center.y, p1.x - center.x);
  let delta = Math.atan2(p2.y - center.y, p2.x - center.x) - a0;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;

  g.save();
  g.fillStyle = `${color}55`;
  g.strokeStyle = color;
  g.lineWidth = 2.8;
  g.beginPath();
  g.moveTo(center.x, center.y);
  g.arc(center.x, center.y, radius, a0, a0 + delta, delta < 0);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

function sectorBisectorPoint(
  center: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  radius: number,
) {
  const a0 = Math.atan2(p1.y - center.y, p1.x - center.x);
  let delta = Math.atan2(p2.y - center.y, p2.x - center.x) - a0;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return {
    x: center.x + radius * Math.cos(a0 + delta / 2),
    y: center.y + radius * Math.sin(a0 + delta / 2),
  };
}

function drawCanvasBoxLabel(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color: string,
) {
  const fs = Math.max(13, Math.round(g.canvas.width / 46));
  g.save();
  g.font = `700 ${fs}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const textW = g.measureText(text).width;
  g.fillStyle = 'rgba(9, 13, 22, 0.86)';
  g.strokeStyle = `${color}aa`;
  g.lineWidth = 1.2;
  g.beginPath();
  g.roundRect(x - 5, y - fs, textW + 10, fs + 7, 4);
  g.fill();
  g.stroke();
  g.fillStyle = color;
  g.fillText(text, x, y - 1);
  g.restore();
}

/**
 * Dibuja esqueleto, referencias 0° punteadas y arcos goniométricos corregidos.
 * CORRECCIÓN CLAVE DEL CODO:
 * - En modo 'flexion_anatomica' (RULA/REBA), traza la prolongación distal del húmero (e -> eh)
 *   y dibuja el arco entre esa referencia 0° y el antebrazo (w). Así, 8° de flexión pintan un arco de 8°
 *   (y NO el suplementario obtuso de 172° hacia el hombro).
 * - En modo 'interno_suplementario', dibuja el ángulo interno s-e-w (172°) e identifica ambos valores.
 */
function drawAnnotatedFrameOnCanvas(
  g: CanvasRenderingContext2D,
  landmarks: NormLandmark[],
  measured: EvaluatedFrame | null,
  side: SideCode,
  o: MeterOptions,
  showInteractiveHandles = false,
  hoveredJointIdx: number | null = null,
) {
  const Wc = g.canvas.width;
  const Hc = g.canvas.height;
  const X = (i: number) => landmarks[i].x * Wc;
  const Y = (i: number) => landmarks[i].y * Hc;
  const P = (i: number) => ({ x: X(i), y: Y(i) });

  // 1. Esqueleto secundario completo
  g.save();
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(56, 189, 248, 0.72)';
  for (const [a, b] of [
    [11, 12],
    [11, 23],
    [12, 24],
    [23, 24],
    [23, 25],
    [24, 26],
    [25, 27],
    [26, 28],
    [11, 13],
    [13, 15],
    [12, 14],
    [14, 16],
  ]) {
    g.beginPath();
    g.moveTo(X(a), Y(a));
    g.lineTo(X(b), Y(b));
    g.stroke();
  }

  // 2. Segmentos del lado evaluado resaltados
  const I = SIDE_INDICES[side];
  g.lineWidth = 4;
  for (const [a, b, col] of [
    [I.h, I.s, '#facc15'],
    [I.s, I.e, '#ef4444'],
    [I.e, I.w, '#f97316'],
    [I.s, I.ear, '#a78bfa'],
    [I.h, I.k, '#4ade80'],
    [I.k, I.a, '#22c55e'],
  ] as Array<[number, number, string]>) {
    g.strokeStyle = col;
    g.beginPath();
    g.moveTo(X(a), Y(a));
    g.lineTo(X(b), Y(b));
    g.stroke();
  }
  g.restore();

  if (measured && measured.ok) {
    const s = P(I.s);
    const e = P(I.e);
    const w = P(I.w);
    const h = P(I.h);
    const kPt = P(I.k);
    const aPt = P(I.a);
    const ear = P(I.ear);
    const ms = { x: (X(11) + X(12)) / 2, y: (Y(11) + Y(12)) / 2 };
    const mh = { x: (X(23) + X(24)) / 2, y: (Y(23) + Y(24)) / 2 };
    const L = Math.hypot(ms.x - mh.x, ms.y - mh.y) || 80;
    const u = { x: (ms.x - mh.x) / L, y: (ms.y - mh.y) / L };
    const f = measured.f || 1;
    const n = { x: -u.y * f, y: u.x * f };
    const fmtDeg = (v: number) => (isFin(v) ? `${v.toFixed(0)}°` : '—');
    const fs = Math.max(13, Math.round(Wc / 48));

    type PendingCallout = {
      anchor: { x: number; y: number };
      text: string;
      color: string;
      preferredGroup: 'back' | 'front';
    };
    const pendingCallouts: PendingCallout[] = [];

    // A. Línea vertical de gravedad (0° tronco)
    const calibRad = degToRad(o.verticalCalibDeg || 0);
    const upPlumb = {
      x: mh.x + Math.sin(calibRad) * L * 0.82,
      y: mh.y - Math.cos(calibRad) * L * 0.82,
    };
    g.save();
    g.setLineDash([7, 5]);
    g.strokeStyle = 'rgba(255,255,255,0.92)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(mh.x, mh.y);
    g.lineTo(upPlumb.x, upPlumb.y);
    g.stroke();
    g.restore();

    // B. Tronco y Hombro
    const dnTrunk = { x: s.x - u.x * (L * 0.34), y: s.y - u.y * (L * 0.34) };
    drawAngleSector(g, mh, upPlumb, ms, L * 0.38, '#facc15');
    drawAngleSector(g, s, dnTrunk, e, L * 0.27, '#ef4444');
    pendingCallouts.push({
      anchor: sectorBisectorPoint(mh, upPlumb, ms, L * 0.32),
      text: `Tronco ${fmtDeg(measured.trunk)}`,
      color: '#facc15',
      preferredGroup: 'back',
    });
    pendingCallouts.push({
      anchor: sectorBisectorPoint(s, dnTrunk, e, L * 0.24),
      text: `Brazo ${fmtDeg(measured.upper)}`,
      color: '#ef4444',
      preferredGroup: 'front',
    });

    // C. CODO — Por defecto ángulo interno brazo-antebrazo (ej. 172°; rango sano humano 30°–170°)
    const humLen = Math.hypot(e.x - s.x, e.y - s.y) || 1;
    const humUnit = { x: (e.x - s.x) / humLen, y: (e.y - s.y) / humLen };
    const elbowZeroProlongation = {
      x: e.x + humUnit.x * (L * 0.32),
      y: e.y + humUnit.y * (L * 0.32),
    };

    if (o.elbowVisualMode === 'interno_suplementario') {
      drawAngleSector(g, e, s, w, L * 0.18, '#f97316');
      const elbowLabel = o.showDualElbowReadout
        ? `Codo ${fmtDeg(measured.elbowInternal)} (ext. ${fmtDeg(measured.elbow)})`
        : `Codo ${fmtDeg(measured.elbowInternal)}`;
      pendingCallouts.push({
        anchor: sectorBisectorPoint(e, s, w, L * 0.16),
        text: elbowLabel,
        color: '#fb923c',
        preferredGroup: 'front',
      });
    } else {
      g.save();
      g.setLineDash([5, 4]);
      g.strokeStyle = 'rgba(251, 146, 60, 0.92)';
      g.lineWidth = 1.8;
      g.beginPath();
      g.moveTo(e.x, e.y);
      g.lineTo(elbowZeroProlongation.x, elbowZeroProlongation.y);
      g.stroke();
      g.restore();

      drawAngleSector(g, e, elbowZeroProlongation, w, L * 0.21, '#f97316');
      const elbowLabel = o.showDualElbowReadout
        ? `Codo ext. ${fmtDeg(measured.elbow)} (int. ${fmtDeg(measured.elbowInternal)})`
        : `Codo ext. ${fmtDeg(measured.elbow)}`;
      pendingCallouts.push({
        anchor: sectorBisectorPoint(e, elbowZeroProlongation, w, L * 0.19),
        text: elbowLabel,
        color: '#fb923c',
        preferredGroup: 'front',
      });
    }

    // D. CUELLO — Rayo neutro rotado según neckOff
    if (isFin(measured.neck)) {
      const offRad = degToRad(o.neckOff || 0);
      const neckZeroDir = {
        x: u.x * Math.cos(offRad) + n.x * Math.sin(offRad),
        y: u.y * Math.cos(offRad) + n.y * Math.sin(offRad),
      };
      const neckZeroPt = {
        x: s.x + neckZeroDir.x * (L * 0.26),
        y: s.y + neckZeroDir.y * (L * 0.26),
      };
      g.save();
      g.setLineDash([4, 4]);
      g.strokeStyle = 'rgba(196, 181, 253, 0.78)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(s.x, s.y);
      g.lineTo(neckZeroPt.x, neckZeroPt.y);
      g.stroke();
      g.restore();

      drawAngleSector(g, s, neckZeroPt, ear, L * 0.2, '#a78bfa');
      pendingCallouts.push({
        anchor: sectorBisectorPoint(s, neckZeroPt, ear, L * 0.18),
        text: `Cuello ${fmtDeg(measured.neck)}`,
        color: '#c4b5fd',
        preferredGroup: 'front',
      });
    }

    // E. RODILLAS — Arco de flexión para REBA/OWAS
    const activeKneeFlex = side === 'R' ? measured.kR : measured.kL;
    if (o.showKneeArc && isFin(activeKneeFlex)) {
      const femLen = Math.hypot(kPt.x - h.x, kPt.y - h.y) || 1;
      const femUnit = { x: (kPt.x - h.x) / femLen, y: (kPt.y - h.y) / femLen };
      const kneeZeroProlongation = {
        x: kPt.x + femUnit.x * (L * 0.28),
        y: kPt.y + femUnit.y * (L * 0.28),
      };
      g.save();
      g.setLineDash([5, 4]);
      g.strokeStyle = 'rgba(134, 239, 172, 0.85)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(kPt.x, kPt.y);
      g.lineTo(kneeZeroProlongation.x, kneeZeroProlongation.y);
      g.stroke();
      g.restore();
      drawAngleSector(g, kPt, kneeZeroProlongation, aPt, L * 0.18, '#22c55e');
    }

    for (const [kIdx, flexVal, labelPrefix] of [
      [26, measured.kR, 'Rod.D'],
      [25, measured.kL, 'Rod.I'],
    ] as Array<[number, number, string]>) {
      if (isFin(flexVal)) {
        pendingCallouts.push({
          anchor: P(kIdx),
          text: `${labelPrefix} ${fmtDeg(flexVal)}`,
          color: '#86efac',
          preferredGroup: 'back',
        });
      }
    }

    // F. Maquetación ordenada de leyendas en columnas laterales (izquierda / derecha)
    // fuera de los trazos de ángulo para que Tronco, Brazo, Codo y Rodillas nunca queden tapados
    const spanPts = [mh, ms, s, e, w, ear, h, kPt, aPt, P(25), P(26), upPlumb];
    let skelMinX = Wc * 0.5;
    let skelMaxX = Wc * 0.5;
    for (const sp of spanPts) {
      if (sp && isFin(sp.x)) {
        if (sp.x < skelMinX) skelMinX = sp.x;
        if (sp.x > skelMaxX) skelMaxX = sp.x;
      }
    }
    const padX = Math.max(20, L * 0.20);
    const leftBandRightEdge = skelMinX - padX;
    const rightBandLeftEdge = skelMaxX + padX;
    const boxH = fs + 8;

    type ColItem = PendingCallout & { boxW: number; colSide: 'left' | 'right'; cy: number };
    const leftItems: ColItem[] = [];
    const rightItems: ColItem[] = [];

    g.font = `700 ${fs}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    for (const item of pendingCallouts) {
      const boxW = g.measureText(item.text).width + 12;
      let colSide: 'left' | 'right';
      if (o.calloutSideMode === 'left') {
        colSide = 'left';
      } else if (o.calloutSideMode === 'right') {
        colSide = 'right';
      } else {
        const backSide: 'left' | 'right' = f >= 0 ? 'left' : 'right';
        const frontSide: 'left' | 'right' = f >= 0 ? 'right' : 'left';
        colSide = item.preferredGroup === 'back' ? backSide : frontSide;
        const leftAvail = leftBandRightEdge - 8;
        const rightAvail = Wc - rightBandLeftEdge - 8;
        if (colSide === 'left' && leftAvail < boxW && rightAvail > leftAvail + 28) {
          colSide = 'right';
        } else if (colSide === 'right' && rightAvail < boxW && leftAvail > rightAvail + 28) {
          colSide = 'left';
        }
      }

      const entry: ColItem = { ...item, boxW, colSide, cy: item.anchor.y + fs * 0.35 };
      if (colSide === 'left') leftItems.push(entry);
      else rightItems.push(entry);
    }

    const layoutColumn = (items: ColItem[], sideCol: 'left' | 'right') => {
      if (items.length === 0) return;
      items.sort((a, b) => a.anchor.y - b.anchor.y);
      const minGap = boxH + 6;
      const minBaselineY = fs * 2 + 20;
      const maxBaselineY = Hc - 10;

      items[0].cy = clamp(items[0].cy, minBaselineY, maxBaselineY);
      for (let i = 1; i < items.length; i++) {
        items[i].cy = Math.max(items[i].cy, items[i - 1].cy + minGap);
      }
      if (items[items.length - 1].cy > maxBaselineY) {
        items[items.length - 1].cy = maxBaselineY;
        for (let i = items.length - 2; i >= 0; i--) {
          items[i].cy = Math.min(items[i].cy, items[i + 1].cy - minGap);
        }
        if (items[0].cy < minBaselineY) {
          items[0].cy = minBaselineY;
          for (let i = 1; i < items.length; i++) {
            items[i].cy = Math.max(items[i].cy, items[i - 1].cy + minGap);
          }
        }
      }

      for (const it of items) {
        const bx =
          sideCol === 'left'
            ? clamp(leftBandRightEdge - it.boxW, 8, Math.max(8, Wc - it.boxW - 8))
            : clamp(rightBandLeftEdge, 8, Math.max(8, Wc - it.boxW - 8));
        const boxMidY = it.cy - fs * 0.36;
        const connectX = it.anchor.x < bx ? bx - 5 : it.anchor.x > bx + it.boxW ? bx + it.boxW - 5 : bx + it.boxW * 0.5;
        const elbowDoglegX =
          it.anchor.x < bx
            ? bx - 14
            : it.anchor.x > bx + it.boxW
              ? bx + it.boxW + 9
              : connectX;

        g.save();
        g.strokeStyle = 'rgba(15, 23, 42, 0.78)';
        g.lineWidth = 3.2;
        g.beginPath();
        g.moveTo(it.anchor.x, it.anchor.y);
        g.lineTo(elbowDoglegX, boxMidY);
        g.lineTo(connectX, boxMidY);
        g.stroke();

        g.strokeStyle = it.color;
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(it.anchor.x, it.anchor.y);
        g.lineTo(elbowDoglegX, boxMidY);
        g.lineTo(connectX, boxMidY);
        g.stroke();

        g.fillStyle = it.color;
        g.beginPath();
        g.arc(it.anchor.x, it.anchor.y, 2.8, 0, Math.PI * 2);
        g.fill();
        g.restore();

        drawCanvasBoxLabel(g, bx, it.cy, it.text, it.color);
      }
    };

    layoutColumn(leftItems, 'left');
    layoutColumn(rightItems, 'right');
  }

  // 3. Puntos articulares arrastrables si el modo interactivo está activo
  if (showInteractiveHandles) {
    for (const idxStr of Object.keys(EDITABLE_LANDMARK_LABELS)) {
      const idx = Number(idxStr);
      if (!landmarks[idx]) continue;
      const pt = P(idx);
      const isHovered = hoveredJointIdx === idx;
      g.save();
      g.beginPath();
      g.arc(pt.x, pt.y, isHovered ? 8.5 : 5.8, 0, Math.PI * 2);
      g.fillStyle = isHovered ? '#38bdf8' : '#ffffff';
      g.strokeStyle = '#0f172a';
      g.lineWidth = 2;
      g.fill();
      g.stroke();
      g.restore();
    }
  }
}

/**
 * Genera una imagen y landmarks sintéticos de calibración (codo casi extendido 8° / interno 172°)
 * para verificar en 1 clic la diferencia entre flexión anatómica RULA/REBA y ángulo interno.
 */
function buildSyntheticCalibrationCase(): {
  canvas: HTMLCanvasElement;
  landmarks: NormLandmark[];
} {
  const W = 880;
  const H = 560;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;

  // Fondo técnico sobrio con retícula ortogonal de referencia
  g.fillStyle = '#0f172a';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(148, 163, 184, 0.10)';
  g.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H);
    g.stroke();
  }
  for (let y = 0; y <= H; y += 40) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }

  // Mesa / plano de trabajo y carga simulada
  g.fillStyle = '#1e293b';
  g.strokeStyle = '#475569';
  g.lineWidth = 2;
  g.fillRect(520, 325, 250, 18);
  g.strokeRect(520, 325, 250, 18);
  g.fillRect(545, 343, 16, 175);
  g.fillRect(735, 343, 16, 175);

  g.fillStyle = '#b45309';
  g.strokeStyle = '#fbbf24';
  g.fillRect(535, 268, 92, 57);
  g.strokeRect(535, 268, 92, 57);
  g.fillStyle = '#fef3c7';
  g.font = '700 13px ui-monospace, monospace';
  g.fillText('12 kg', 562, 302);

  // Suelo
  g.strokeStyle = '#64748b';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(60, 518);
  g.lineTo(820, 518);
  g.stroke();

  // Silueta lateral esquemática del operario (tronco 24°, hombro 44°, codo 8° flexión / 172° interno)
  const hip = { x: 350, y: 315 };
  const trunkLen = 152;
  const trunkRad = degToRad(24);
  const sh = {
    x: hip.x + Math.sin(trunkRad) * trunkLen,
    y: hip.y - Math.cos(trunkRad) * trunkLen,
  };
  // Dirección abajo del tronco y adelante del tronco
  const uTrunk = { x: (sh.x - hip.x) / trunkLen, y: (sh.y - hip.y) / trunkLen };
  const dTrunk = { x: -uTrunk.x, y: -uTrunk.y };
  const nTrunk = { x: -uTrunk.y, y: uTrunk.x };

  // Brazo superior: 44° adelante respecto al tronco
  const upperRad = degToRad(44);
  const humLen = 96;
  const humDir = {
    x: dTrunk.x * Math.cos(upperRad) + nTrunk.x * Math.sin(upperRad),
    y: dTrunk.y * Math.cos(upperRad) + nTrunk.y * Math.sin(upperRad),
  };
  const elb = { x: sh.x + humDir.x * humLen, y: sh.y + humDir.y * humLen };

  // Antebrazo: flexión anatómica exacta de 8° hacia arriba respecto a la prolongación del húmero (interno = 172°)
  const elbFlexRad = degToRad(-8);
  const foreLen = 88;
  const foreDir = {
    x: humDir.x * Math.cos(elbFlexRad) - humDir.y * Math.sin(elbFlexRad),
    y: humDir.x * Math.sin(elbFlexRad) + humDir.y * Math.cos(elbFlexRad),
  };
  const wr = { x: elb.x + foreDir.x * foreLen, y: elb.y + foreDir.y * foreLen };

  // Cabeza / oreja: 16° flexión cervical + 10° offset = 26° desde eje tronco
  const neckRad = degToRad(26);
  const ear = {
    x: sh.x + (uTrunk.x * Math.cos(neckRad) + nTrunk.x * Math.sin(neckRad)) * 52,
    y: sh.y + (uTrunk.y * Math.cos(neckRad) + nTrunk.y * Math.sin(neckRad)) * 52,
  };
  const nose = { x: ear.x + 26, y: ear.y + 8 };

  // Piernas (rodilla derecha 14° flexión)
  const kneeR = { x: hip.x + 16, y: 416 };
  const ankR = { x: hip.x + 6, y: 508 };
  const heelR = { x: ankR.x - 10, y: 515 };
  const toeR = { x: ankR.x + 28, y: 515 };

  // Dibujar silueta suave detrás del esqueleto
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(148, 163, 184, 0.32)';
  g.lineWidth = 28;
  g.beginPath();
  g.moveTo(hip.x, hip.y);
  g.lineTo(sh.x, sh.y);
  g.stroke();
  g.lineWidth = 20;
  g.beginPath();
  g.moveTo(hip.x, hip.y);
  g.lineTo(kneeR.x, kneeR.y);
  g.lineTo(ankR.x, ankR.y);
  g.stroke();
  g.lineWidth = 16;
  g.beginPath();
  g.moveTo(sh.x, sh.y);
  g.lineTo(elb.x, elb.y);
  g.lineTo(wr.x, wr.y);
  g.stroke();
  g.beginPath();
  g.arc(ear.x + 6, ear.y - 2, 22, 0, Math.PI * 2);
  g.fillStyle = 'rgba(148, 163, 184, 0.32)';
  g.fill();
  g.restore();

  const lm: NormLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0.4,
    y: 0.5,
    z: 0,
    visibility: 0.98,
  }));

  const setPt = (idx: number, pt: { x: number; y: number }, z = 0) => {
    lm[idx] = { x: pt.x / W, y: pt.y / H, z, visibility: 0.99 };
  };

  setPt(0, nose);
  setPt(7, { x: ear.x - 2, y: ear.y }, 0.04);
  setPt(8, ear, -0.04);
  setPt(11, { x: sh.x - 4, y: sh.y }, 0.14);
  setPt(12, sh, -0.14);
  setPt(13, { x: elb.x - 6, y: elb.y + 4 }, 0.14);
  setPt(14, elb, -0.14);
  setPt(15, { x: wr.x - 6, y: wr.y + 4 }, 0.14);
  setPt(16, wr, -0.14);
  setPt(23, { x: hip.x - 4, y: hip.y }, 0.11);
  setPt(24, hip, -0.11);
  setPt(25, { x: kneeR.x - 10, y: kneeR.y }, 0.11);
  setPt(26, kneeR, -0.11);
  setPt(27, { x: ankR.x - 10, y: ankR.y }, 0.11);
  setPt(28, ankR, -0.11);
  setPt(29, { x: heelR.x - 10, y: heelR.y }, 0.11);
  setPt(30, heelR, -0.11);
  setPt(31, { x: toeR.x - 10, y: toeR.y }, 0.11);
  setPt(32, toeR, -0.11);

  return { canvas: cv, landmarks: lm };
}

function PriorityGaugeSvg({ level }: { level: 1 | 2 | 3 | 4 }) {
  const cx = 120;
  const cy = 112;
  const r = 94;
  const ir = 64;
  const ptOnCircle = (rad: number, ang: number): [number, number] => [
    cx + rad * Math.cos(ang),
    cy - rad * Math.sin(ang),
  ];
  const fmt = (n: number) => n.toFixed(1);
  const [nx, ny] = ptOnCircle(82, Math.PI - (level - 0.5) * (Math.PI / 4));
  const segLabels = ['Baja', 'Media', 'Alta', 'Inmed.'];

  return (
    <svg
      viewBox="0 0 240 132"
      role="img"
      aria-label={`Prioridad ${PRIORITY_NAMES[level]}`}
      className="w-full max-w-[230px] mx-auto block text-slate-800"
    >
      {([1, 2, 3, 4] as const).map((k) => {
        const a0 = Math.PI - (k - 1) * (Math.PI / 4);
        const a1 = Math.PI - k * (Math.PI / 4);
        const [x0, y0] = ptOnCircle(r, a0);
        const [x1, y1] = ptOnCircle(r, a1);
        const [x2, y2] = ptOnCircle(ir, a1);
        const [x3, y3] = ptOnCircle(ir, a0);
        return (
          <path
            key={k}
            d={`M${fmt(x0)},${fmt(y0)} A${r},${r} 0 0 1 ${fmt(x1)},${fmt(y1)} L${fmt(x2)},${fmt(y2)} A${ir},${ir} 0 0 0 ${fmt(x3)},${fmt(y3)} Z`}
            fill={LEVEL_COLORS[k]}
            opacity={k === level ? 1 : 0.24}
            stroke="#ffffff"
            strokeWidth="1.5"
          />
        );
      })}
      {segLabels.map((txt, idx) => {
        const [lx, ly] = ptOnCircle(r + 11, Math.PI - (idx + 0.5) * (Math.PI / 4));
        return (
          <text
            key={txt}
            x={fmt(lx)}
            y={fmt(ly)}
            fontSize="9"
            textAnchor="middle"
            fill="currentColor"
            opacity="0.68"
          >
            {txt}
          </text>
        );
      })}
      <line
        x1={cx}
        y1={cy}
        x2={fmt(nx)}
        y2={fmt(ny)}
        stroke="currentColor"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r="7.5" fill="currentColor" />
      <circle cx={cx} cy={cy} r="3" fill={LEVEL_COLORS[level]} />
    </svg>
  );
}

export const QuickAngleMeterWorkspace: React.FC<QuickAngleMeterWorkspaceProps> = ({
  onBackToEvaluator,
  onAddMeasuredTabToStudy,
}) => {
  const [options, setOptions] = useState<MeterOptions>(DEFAULT_OPTIONS);
  const [activeMethodTab, setActiveMethodTab] = useState<'rula' | 'reba' | 'owas'>('rula');
  const [showTechSettings, setShowTechSettings] = useState<boolean>(false);
  const [interactiveJointEdit, setInteractiveJointEdit] = useState<boolean>(true);
  const [hoveredJointIdx, setHoveredJointIdx] = useState<number | null>(null);
  const [draggingJointIdx, setDraggingJointIdx] = useState<number | null>(null);

  const [sourceType, setSourceType] = useState<'none' | 'video' | 'photo' | 'demo'>('none');
  const [sourceInfoText, setSourceInfoText] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>(
    'Sube un video lateral, una fotografía o pulsa "Probar postura ejemplo (Codo 172°)" para verificar el goniómetro al instante.',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exportBanner, setExportBanner] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [progressRatio, setProgressRatio] = useState<number>(0);

  // Datos extraídos por fotograma
  const [frameDims, setFrameDims] = useState<{ w: number; h: number }>({ w: 880, h: 560 });
  const [timestamps, setTimestamps] = useState<number[]>([]);
  const [rawLandmarks, setRawLandmarks] = useState<Array<NormLandmark[] | null>>([]);
  const [worldLandmarks, setWorldLandmarks] = useState<Array<NormLandmark[] | null>>([]);
  const [manualLandmarkOverrides, setManualLandmarkOverrides] = useState<
    Record<number, Record<number, { x: number; y: number }>>
  >({});
  const [visibilitySum, setVisibilitySum] = useState<{ R: number; L: number }>({ R: 0, L: 0 });
  const [selectedFrameIdx, setSelectedFrameIdx] = useState<number>(0);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameCacheRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const seekQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const landmarkerCacheRef = useRef<{ instance: PoseLandmarker | null; tier: ModelTier | '' }>({
    instance: null,
    tier: '',
  });
  const critThumbRefs = useRef<Record<number, HTMLCanvasElement | null>>({});

  const updateOpt = useCallback(<K extends keyof MeterOptions>(key: K, val: MeterOptions[K]) => {
    setOptions((prev) => ({ ...prev, [key]: val }));
  }, []);

  // Obtener instancia MediaPipe PoseLandmarker (IMAGE + CPU para máxima compatibilidad)
  const getPoseLandmarker = useCallback(async (tier: ModelTier): Promise<PoseLandmarker> => {
    if (landmarkerCacheRef.current.instance && landmarkerCacheRef.current.tier === tier) {
      return landmarkerCacheRef.current.instance;
    }
    if (landmarkerCacheRef.current.instance) {
      try {
        landmarkerCacheRef.current.instance.close();
      } catch {
        // Ignorar cierre previo
      }
      landmarkerCacheRef.current = { instance: null, tier: '' };
    }

    let lastErr: unknown = null;
    for (const wasmBase of WASM_CANDIDATES) {
      try {
        const vision = await FilesetResolver.forVisionTasks(wasmBase);
        const lm = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelTaskUrl(tier),
            delegate: 'CPU',
          },
          runningMode: 'IMAGE',
          numPoses: 1,
          minPoseDetectionConfidence: 0.3,
          minPosePresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
        });
        landmarkerCacheRef.current = { instance: lm, tier };
        return lm;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error('No se pudo inicializar MediaPipe PoseLandmarker.');
  }, []);

  const seekVideoTo = useCallback((video: HTMLVideoElement, timeSec: number): Promise<void> => {
    return new Promise((resolve) => {
      if (Math.abs(video.currentTime - timeSec) < 1e-3) {
        resolve();
        return;
      }
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        const rvfc = (video as HTMLVideoElement & {
          requestVideoFrameCallback?: (cb: () => void) => number;
        }).requestVideoFrameCallback;
        if (typeof rvfc === 'function') {
          rvfc.call(video, finish);
          setTimeout(finish, 180);
        } else {
          setTimeout(finish, 75);
        }
      };
      video.addEventListener('seeked', onSeeked);
      setTimeout(finish, 3200);
      video.currentTime = timeSec;
    });
  }, []);

  const getRawFrameCanvas = useCallback(
    (idx: number): Promise<HTMLCanvasElement | null> => {
      if (sourceType === 'photo' || sourceType === 'demo') {
        return Promise.resolve(staticCanvasRef.current);
      }
      if (frameCacheRef.current.has(idx)) {
        return Promise.resolve(frameCacheRef.current.get(idx)!);
      }
      const video = videoElRef.current;
      const tSec = timestamps[idx];
      if (!video || tSec === undefined) return Promise.resolve(null);

      const job = seekQueueRef.current.then(async () => {
        if (frameCacheRef.current.has(idx)) return frameCacheRef.current.get(idx)!;
        await seekVideoTo(video, tSec);
        const cv = document.createElement('canvas');
        cv.width = frameDims.w;
        cv.height = frameDims.h;
        const ctx = cv.getContext('2d');
        if (ctx) ctx.drawImage(video, 0, 0, frameDims.w, frameDims.h);
        frameCacheRef.current.set(idx, cv);
        if (frameCacheRef.current.size > 36) {
          const oldest = frameCacheRef.current.keys().next().value;
          if (oldest !== undefined) frameCacheRef.current.delete(oldest);
        }
        return cv;
      });
      seekQueueRef.current = job.catch(() => null);
      return job;
    },
    [frameDims.h, frameDims.w, seekVideoTo, sourceType, timestamps],
  );

  // Landmarks efectivos combinando detección automática + ajustes manuales con el mouse
  const effectiveLandmarksPerFrame = useMemo(() => {
    return rawLandmarks.map((lm, frameIdx) => {
      if (!lm) return null;
      const edits = manualLandmarkOverrides[frameIdx];
      if (!edits) return lm;
      return lm.map((pt, lmIdx) =>
        edits[lmIdx]
          ? { ...pt, x: edits[lmIdx].x, y: edits[lmIdx].y, visibility: 0.99 }
          : pt,
      );
    });
  }, [manualLandmarkOverrides, rawLandmarks]);

  const effectiveSide: SideCode = useMemo(() => {
    if (options.side !== 'auto') return options.side;
    return visibilitySum.R >= visibilitySum.L ? 'R' : 'L';
  }, [options.side, visibilitySum.L, visibilitySum.R]);

  // Evaluación completa reactiva (ángulos + suavizado opcional + RULA + REBA + OWAS + posturas críticas)
  const analysisSummary = useMemo(() => {
    if (effectiveLandmarksPerFrame.length === 0) return null;

    const rawMeasured: MeasuredAngles[] = effectiveLandmarksPerFrame.map((lm, idx) =>
      lm
        ? measureSagittalFrame(
            lm,
            frameDims.w,
            frameDims.h,
            effectiveSide,
            options,
            worldLandmarks[idx] || null,
          )
        : {
            ok: false,
            why: 'none',
            ratio: 0,
            lateral: false,
            f: 1,
            trunk: NaN,
            upper: NaN,
            elbow: NaN,
            elbowInternal: NaN,
            armLow: false,
            neck: NaN,
            kR: NaN,
            kL: NaN,
            kRInternal: NaN,
            kLInternal: NaN,
            armsUp: 0,
            twist: NaN,
            side: NaN,
            abdD: NaN,
            trTw: false,
            trSb: false,
            abd: false,
          },
    );

    const smoothed =
      options.smoothMedian && rawMeasured.length >= 3
        ? smoothMeasuredFrames(rawMeasured)
        : rawMeasured.map((m) => ({ ...m }));

    const evaluated: EvaluatedFrame[] = smoothed.map((m) => {
      if (!m.ok) return m;
      return {
        ...m,
        ...scoreMeasuredFrame(m, options),
      };
    });

    const eligibleIndices = evaluated
      .map((m, idx) => (m.ok && (m.lateral || options.incl) ? idx : -1))
      .filter((idx) => idx >= 0);

    if (eligibleIndices.length === 0) {
      return {
        rawMeasured,
        evaluated,
        eligibleIndices,
        worstIdx: -1,
        criticalIndices: [] as number[],
        phaseLabels: {} as Record<number, string>,
        owasGroups: [] as GroupedOwasRow[],
        maxOwasCat: 1 as 1 | 2 | 3 | 4,
      };
    }

    const severityRank = (m: EvaluatedFrame) =>
      (m.reba?.final || 0) * 100 +
      (m.rula?.final || 0) * 10 +
      Math.max(0, isFin(m.trunk) ? m.trunk : 0) / 12 +
      Math.max(0, isFin(m.upper) ? m.upper : 0) / 30 +
      (m.ow?.cat || 0) * 5;

    const sortedBySev = eligibleIndices
      .slice()
      .sort((a, b) => severityRank(evaluated[b]) - severityRank(evaluated[a]));

    const worstIdx = sortedBySev[0];
    const picked: number[] = [];
    for (const idx of sortedBySev) {
      if (severityRank(evaluated[idx]) < 0.8 * severityRank(evaluated[worstIdx])) break;
      if (
        picked.every(
          (j) =>
            Math.abs((timestamps[idx] || 0) - (timestamps[j] || 0)) >=
            Math.max(0.3, options.gapCrit),
        )
      ) {
        picked.push(idx);
      }
      if (picked.length >= Math.max(1, Math.round(options.nCrit))) break;
    }

    const criticalIndices = picked.sort((a, b) => (timestamps[a] || 0) - (timestamps[b] || 0));
    const phaseLabels: Record<number, string> = {};
    criticalIndices.forEach((idx, k) => {
      phaseLabels[idx] =
        criticalIndices.length === 1
          ? 'Postura más crítica'
          : k === 0
            ? 'Inicio del ciclo · levantamiento'
            : k === criticalIndices.length - 1
              ? 'Final del ciclo · depósito'
              : 'Traslado / postura intermedia';
    });

    const groupMap: Record<string, GroupedOwasRow> = {};
    eligibleIndices.forEach((idx) => {
      const ow = evaluated[idx].ow!;
      const code = `${ow.back}-${ow.arms}-${ow.legs}-${ow.load}`;
      if (!groupMap[code]) {
        groupMap[code] = {
          code,
          taskPhase: `Código OWAS ${code}`,
          back: ow.back,
          arms: ow.arms,
          legs: ow.legs,
          load: ow.load,
          frequencyCount: 0,
          categoria: ow.cat,
        };
      }
      groupMap[code].frequencyCount += 1;
    });

    const owasGroups = Object.values(groupMap).sort((a, b) => b.frequencyCount - a.frequencyCount);
    const maxOwasCat = Math.max(1, ...owasGroups.map((g) => g.categoria)) as 1 | 2 | 3 | 4;

    return {
      rawMeasured,
      evaluated,
      eligibleIndices,
      worstIdx,
      criticalIndices,
      phaseLabels,
      owasGroups,
      maxOwasCat,
    };
  }, [effectiveLandmarksPerFrame, effectiveSide, frameDims.h, frameDims.w, options, timestamps, worldLandmarks]);

  // Ejecutar análisis sobre el video cargado
  const runVideoAnalysis = useCallback(
    async (videoEl?: HTMLVideoElement) => {
      const v = videoEl || videoElRef.current;
      if (!v) return;
      try {
        setIsAnalyzing(true);
        setErrorMessage(null);
        setProgressRatio(0.02);
        setStatusMessage('Cargando modelo local de pose MediaPipe…');
        frameCacheRef.current.clear();
        setManualLandmarkOverrides({});

        const lm = await getPoseLandmarker(options.mdl);
        const scale = Math.min(1, 960 / (v.videoWidth || 960));
        const W = Math.max(320, Math.round((v.videoWidth || 640) * scale));
        const H = Math.max(240, Math.round((v.videoHeight || 480) * scale));
        setFrameDims({ w: W, h: H });

        const workCv = document.createElement('canvas');
        workCv.width = W;
        workCv.height = H;
        const workCtx = workCv.getContext('2d')!;

        if (previewCanvasRef.current) {
          previewCanvasRef.current.width = W;
          previewCanvasRef.current.height = H;
        }

        const stepSec = 1 / clamp(options.fps || 6, 2, 20);
        const dur = Math.max(0.05, v.duration || 0.1);
        const totalFrames = Math.max(1, Math.floor(dur / stepSec) + 1);

        const nextLandmarks: Array<NormLandmark[] | null> = [];
        const nextWorld: Array<NormLandmark[] | null> = [];
        const nextTs: number[] = [];
        const visAcc = { R: 0, L: 0 };
        let detectedCount = 0;

        for (let k = 0; k < totalFrames; k++) {
          const t = Math.min(Math.max(0, dur - 0.01), k * stepSec);
          await seekVideoTo(v, t);
          workCtx.drawImage(v, 0, 0, W, H);

          const res = lm.detect(workCv);
          const pose2D = (res.landmarks && res.landmarks[0]) as NormLandmark[] | undefined;
          const pose3D = (res.worldLandmarks && res.worldLandmarks[0]) as NormLandmark[] | undefined;

          nextLandmarks.push(pose2D ? pose2D.map((pt) => ({ ...pt })) : null);
          nextWorld.push(pose3D ? pose3D.map((pt) => ({ ...pt })) : null);
          nextTs.push(t);

          if (pose2D) {
            detectedCount++;
            for (const sd of ['R', 'L'] as const) {
              const idxMap = SIDE_INDICES[sd];
              visAcc[sd] +=
                (['s', 'e', 'w', 'h', 'k', 'a'] as const).reduce(
                  (acc, key) => acc + (pose2D[idxMap[key]]?.visibility ?? 1),
                  0,
                ) / 6;
            }
          }

          if (previewCanvasRef.current) {
            const pCtx = previewCanvasRef.current.getContext('2d');
            if (pCtx) {
              pCtx.drawImage(workCv, 0, 0, W, H);
              if (pose2D) {
                const tempSide: SideCode = visAcc.R >= visAcc.L ? 'R' : 'L';
                const tempM = measureSagittalFrame(
                  pose2D,
                  W,
                  H,
                  tempSide,
                  options,
                  pose3D || null,
                );
                drawAnnotatedFrameOnCanvas(pCtx, pose2D, tempM, tempSide, options, false, null);
              }
            }
          }

          setProgressRatio((k + 1) / totalFrames);
          setStatusMessage(
            `Analizando fotograma ${k + 1}/${totalFrames} · posturas detectadas: ${detectedCount}`,
          );
          if (k % 3 === 0) {
            await new Promise((r) => setTimeout(r, 0));
          }
        }

        setTimestamps(nextTs);
        setRawLandmarks(nextLandmarks);
        setWorldLandmarks(nextWorld);
        setVisibilitySum(visAcc);

        if (detectedCount === 0) {
          setErrorMessage(
            'No se detectó ninguna persona en el video. Verifica que el cuerpo sea visible, haya buena iluminación o selecciona el modelo "Pesado".',
          );
          setStatusMessage('Sin detección en los fotogramas muestreados.');
        } else {
          setStatusMessage(
            `Análisis completado: persona detectada en ${detectedCount}/${totalFrames} fotogramas.`,
          );
        }
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Error inesperado al analizar el video.',
        );
      } finally {
        setIsAnalyzing(false);
      }
    },
    [getPoseLandmarker, options, seekVideoTo],
  );

  // Ejecutar análisis sobre una foto estática
  const runPhotoAnalysis = useCallback(
    async (img: HTMLImageElement, labelName: string) => {
      try {
        setIsAnalyzing(true);
        setErrorMessage(null);
        setProgressRatio(0.35);
        setStatusMessage('Detectando articulaciones sobre la fotografía…');
        frameCacheRef.current.clear();
        setManualLandmarkOverrides({});

        const scale = Math.min(1, 1000 / (img.naturalWidth || 1000));
        const W = Math.max(360, Math.round((img.naturalWidth || 800) * scale));
        const H = Math.max(260, Math.round((img.naturalHeight || 600) * scale));

        const cv = document.createElement('canvas');
        cv.width = W;
        cv.height = H;
        const ctx = cv.getContext('2d')!;
        ctx.drawImage(img, 0, 0, W, H);
        staticCanvasRef.current = cv;
        videoElRef.current = null;

        setFrameDims({ w: W, h: H });
        setSourceType('photo');
        setSourceInfoText(`${labelName} · ${img.naturalWidth}×${img.naturalHeight} px · Foto fija`);

        const lm = await getPoseLandmarker(options.mdl);
        const res = lm.detect(cv);
        const pose2D = (res.landmarks && res.landmarks[0]) as NormLandmark[] | undefined;
        const pose3D = (res.worldLandmarks && res.worldLandmarks[0]) as NormLandmark[] | undefined;

        const visAcc = { R: 0, L: 0 };
        if (pose2D) {
          for (const sd of ['R', 'L'] as const) {
            const idxMap = SIDE_INDICES[sd];
            visAcc[sd] +=
              (['s', 'e', 'w', 'h', 'k', 'a'] as const).reduce(
                (acc, key) => acc + (pose2D[idxMap[key]]?.visibility ?? 1),
                0,
              ) / 6;
          }
        }

        setTimestamps([0]);
        setRawLandmarks([pose2D ? pose2D.map((pt) => ({ ...pt })) : null]);
        setWorldLandmarks([pose3D ? pose3D.map((pt) => ({ ...pt })) : null]);
        setVisibilitySum(visAcc);
        setSelectedFrameIdx(0);
        setProgressRatio(1);

        if (!pose2D) {
          setErrorMessage(
            'MediaPipe no detectó el cuerpo completo en la foto. Prueba el modelo "Pesado" en Ajustes técnicos o usa una vista con mayor contraste.',
          );
          setStatusMessage('Sin detección automática en la fotografía.');
        } else {
          setStatusMessage(
            'Fotografía medida. Puedes arrastrar cualquier punto articular con el mouse para afinar la medición.',
          );
        }
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Error al procesar la fotografía.');
      } finally {
        setIsAnalyzing(false);
      }
    },
    [getPoseLandmarker, options.mdl],
  );

  // Cargar postura sintética instantánea de ejemplo (codo extendido 172° internos, rango sano 30°–170°)
  const handleLoadCalibrationDemo = useCallback(() => {
    const { canvas, landmarks } = buildSyntheticCalibrationCase();
    frameCacheRef.current.clear();
    videoElRef.current = null;
    staticCanvasRef.current = canvas;
    setManualLandmarkOverrides({});
    setErrorMessage(null);
    setSourceType('demo');
    setFrameDims({ w: canvas.width, h: canvas.height });
    setSourceInfoText('Postura ejemplo · Codo ángulo interno 172° · Carga 12 kg');
    setOptions((prev) => ({
      ...prev,
      kg: 12,
      incl: true,
      side: 'R',
      facingMode: 'right',
      elbowVisualMode: 'interno_suplementario',
      showDualElbowReadout: false,
    }));
    setTimestamps([0]);
    setRawLandmarks([landmarks]);
    setWorldLandmarks([null]);
    setVisibilitySum({ R: 1, L: 0.8 });
    setSelectedFrameIdx(0);
    setStatusMessage(
      'Postura ejemplo cargada: ángulo interno de codo = 172° (supera apenas el límite sano de 170° por perspectiva 2D) con leyendas ordenadas en los márgenes sin tapar el Tronco.',
    );
  }, []);

  // Subir archivo (Video o Imagen)
  const handleMediaFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setErrorMessage(null);

      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          runPhotoAnalysis(img, file.name);
        };
        img.onerror = () => {
          setErrorMessage('No se pudo decodificar la imagen seleccionada.');
        };
        img.src = url;
        return;
      }

      const vid = document.createElement('video');
      vid.muted = true;
      vid.playsInline = true;
      vid.preload = 'auto';
      vid.src = URL.createObjectURL(file);

      try {
        await new Promise<void>((resolve, reject) => {
          vid.addEventListener('loadeddata', () => resolve(), { once: true });
          vid.addEventListener(
            'error',
            () => reject(new Error('No se pudo leer el video (usa MP4/H.264, MOV o WebM).')),
            { once: true },
          );
        });
        videoElRef.current = vid;
        staticCanvasRef.current = null;
        setSourceType('video');
        setSourceInfoText(
          `${file.name} · ${vid.videoWidth}×${vid.videoHeight} · ${vid.duration.toFixed(1)} s`,
        );
        await runVideoAnalysis(vid);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Error al abrir el video.');
      }
    },
    [runPhotoAnalysis, runVideoAnalysis],
  );

  // Pegar captura con Ctrl+V
  useEffect(() => {
    const onPaste = (ev: ClipboardEvent) => {
      const items = ev.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const blob = items[i].getAsFile();
          if (!blob) continue;
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => runPhotoAnalysis(img, 'Captura pegada (Ctrl+V)');
          img.src = url;
          break;
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [runPhotoAnalysis]);

  // Seleccionar automáticamente el peor fotograma cuando cambia el conjunto de fotogramas
  useEffect(() => {
    if (analysisSummary && analysisSummary.worstIdx >= 0) {
      setSelectedFrameIdx((prev) =>
        prev >= 0 && prev < analysisSummary.evaluated.length ? prev : analysisSummary.worstIdx,
      );
    }
  }, [analysisSummary]);

  // Cuando acaba de terminar un nuevo video, saltar directamente al peor fotograma
  const prevRawLengthRef = useRef<number>(0);
  useEffect(() => {
    if (
      rawLandmarks.length !== prevRawLengthRef.current &&
      analysisSummary &&
      analysisSummary.worstIdx >= 0
    ) {
      prevRawLengthRef.current = rawLandmarks.length;
      setSelectedFrameIdx(analysisSummary.worstIdx);
    }
  }, [analysisSummary, rawLandmarks.length]);

  // Redibujar el canvas principal en el fotograma seleccionado
  useEffect(() => {
    let cancelled = false;
    const renderCurrent = async () => {
      const pv = previewCanvasRef.current;
      if (!pv || !analysisSummary) return;
      const safeIdx = clamp(selectedFrameIdx, 0, Math.max(0, timestamps.length - 1));
      const rawCv = await getRawFrameCanvas(safeIdx);
      if (cancelled || !rawCv || !previewCanvasRef.current) return;

      if (pv.width !== frameDims.w || pv.height !== frameDims.h) {
        pv.width = frameDims.w;
        pv.height = frameDims.h;
      }
      const g = pv.getContext('2d');
      if (!g) return;

      g.clearRect(0, 0, frameDims.w, frameDims.h);
      g.drawImage(rawCv, 0, 0, frameDims.w, frameDims.h);

      const lm = effectiveLandmarksPerFrame[safeIdx];
      const ev = analysisSummary.evaluated[safeIdx] || null;
      if (lm) {
        drawAnnotatedFrameOnCanvas(
          g,
          lm,
          ev,
          effectiveSide,
          options,
          interactiveJointEdit,
          hoveredJointIdx,
        );
      }

      const whyText: Record<string, string> = {
        none: 'sin persona detectada',
        vis: 'tronco/articulaciones poco visibles',
        face: 'orientación sagital ambigua (ajusta "Mirada" arriba)',
      };
      const topBanner =
        ev && ev.ok && ev.rula && ev.reba && ev.ow
          ? `t=${(timestamps[safeIdx] || 0).toFixed(2)} s · RULA ${ev.rula.final} · REBA ${ev.reba.final} · OWAS ${ev.ow.cat}${
              ev.lateral ? '' : ' · VISTA POCO LATERAL'
            }`
          : `t=${(timestamps[safeIdx] || 0).toFixed(2)} s · ${whyText[ev?.why || 'none'] || 'sin datos'}`;
      drawCanvasBoxLabel(g, 10, 24, topBanner, '#ffffff');
    };
    renderCurrent();
    return () => {
      cancelled = true;
    };
  }, [
    analysisSummary,
    effectiveLandmarksPerFrame,
    effectiveSide,
    frameDims.h,
    frameDims.w,
    getRawFrameCanvas,
    hoveredJointIdx,
    interactiveJointEdit,
    options,
    selectedFrameIdx,
    timestamps,
  ]);

  // Redibujar miniaturas de posturas críticas
  useEffect(() => {
    if (!analysisSummary || analysisSummary.criticalIndices.length === 0) return;
    let cancelled = false;
    analysisSummary.criticalIndices.forEach((idx) => {
      getRawFrameCanvas(idx).then((fr) => {
        if (cancelled || !fr) return;
        const thumb = critThumbRefs.current[idx];
        if (!thumb) return;
        const tw = 420;
        const th = Math.max(220, Math.round((tw * frameDims.h) / (frameDims.w || 1)));
        thumb.width = tw;
        thumb.height = th;
        const g = thumb.getContext('2d');
        if (!g) return;
        g.drawImage(fr, 0, 0, tw, th);
        const lm = effectiveLandmarksPerFrame[idx];
        const ev = analysisSummary.evaluated[idx];
        if (lm && ev) {
          drawAnnotatedFrameOnCanvas(g, lm, ev, effectiveSide, options, false, null);
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    analysisSummary,
    effectiveLandmarksPerFrame,
    effectiveSide,
    frameDims.h,
    frameDims.w,
    getRawFrameCanvas,
    options,
  ]);

  // Interacción con el mouse sobre el canvas para arrastrar vértices articulares
  const getCanvasNormalizedPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pv = previewCanvasRef.current;
    if (!pv) return null;
    const rect = pv.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      nx: clamp((e.clientX - rect.left) / rect.width, 0.01, 0.99),
      ny: clamp((e.clientY - rect.top) / rect.height, 0.01, 0.99),
      pxW: rect.width,
      pxH: rect.height,
    };
  };

  const findNearestEditableLandmark = (nx: number, ny: number, pxW: number, pxH: number) => {
    const lm = effectiveLandmarksPerFrame[selectedFrameIdx];
    if (!lm) return null;
    let bestIdx: number | null = null;
    let bestDist = 20; // radio de captura en píxeles CSS
    for (const idxStr of Object.keys(EDITABLE_LANDMARK_LABELS)) {
      const idx = Number(idxStr);
      const pt = lm[idx];
      if (!pt) continue;
      const dist = Math.hypot((pt.x - nx) * pxW, (pt.y - ny) * pxH);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    }
    return bestIdx;
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactiveJointEdit) return;
    const coords = getCanvasNormalizedPoint(e);
    if (!coords) return;
    const nearest = findNearestEditableLandmark(coords.nx, coords.ny, coords.pxW, coords.pxH);
    if (nearest !== null) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDraggingJointIdx(nearest);
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactiveJointEdit) return;
    const coords = getCanvasNormalizedPoint(e);
    if (!coords) return;
    if (draggingJointIdx !== null) {
      setManualLandmarkOverrides((prev) => ({
        ...prev,
        [selectedFrameIdx]: {
          ...(prev[selectedFrameIdx] || {}),
          [draggingJointIdx]: { x: coords.nx, y: coords.ny },
        },
      }));
      return;
    }
    const nearest = findNearestEditableLandmark(coords.nx, coords.ny, coords.pxW, coords.pxH);
    setHoveredJointIdx(nearest);
  };

  const handleCanvasPointerUp = () => {
    setDraggingJointIdx(null);
  };

  const currentFrameHasEdits = Boolean(
    manualLandmarkOverrides[selectedFrameIdx] &&
      Object.keys(manualLandmarkOverrides[selectedFrameIdx]).length > 0,
  );

  const resetCurrentFrameEdits = () => {
    setManualLandmarkOverrides((prev) => {
      const next = { ...prev };
      delete next[selectedFrameIdx];
      return next;
    });
  };

  const currentEval = analysisSummary?.evaluated[selectedFrameIdx] || null;
  const worstEval =
    analysisSummary && analysisSummary.worstIdx >= 0
      ? analysisSummary.evaluated[analysisSummary.worstIdx]
      : null;

  // Construcción de RulaData, RebaData y OwasData oficiales para enviar al Estudio Multipestaña o exportar JSON
  const buildMethodPayloadsForFrame = useCallback(
    (frameIdx: number) => {
      if (!analysisSummary) return null;
      const m = analysisSummary.evaluated[frameIdx];
      if (!m || !m.ok || !m.rula || !m.reba || !m.ow || !m.inp) return null;

      const evaluatedSideEs: 'derecho' | 'izquierdo' =
        effectiveSide === 'R' ? 'derecho' : 'izquierdo';

      const rulaSide: RulaSideInput = {
        upperArmPos: m.inp.up,
        shoulderRaised: options.shR,
        armAbducted: options.abd || m.abd,
        armSupported: options.armSup,
        lowerArmPos: m.inp.lo,
        lowerArmCrossMidline: options.crossMid,
        wristPos: options.wrist,
        wristDeviated: options.wDev,
        wristTwist: options.wTw ? 2 : 1,
        muscleUseA: options.muscle ? 1 : 0,
        forceLoadA: clamp(m.rula.fo, 0, 3) as 0 | 1 | 2 | 3,
      };

      const rulaData: RulaData = {
        evaluatedSide: evaluatedSideEs,
        right: { ...rulaSide },
        left: { ...rulaSide },
        neckPos: m.inp.nk,
        neckRotated: options.neckTw,
        neckSideBending: options.neckSb,
        trunkPos: m.inp.tr,
        trunkTwisted: options.trTw || m.trTw,
        trunkSideBending: options.trSb || m.trSb,
        legsPos: options.oneLeg ? 2 : 1,
        muscleUseB: options.muscle ? 1 : 0,
        forceLoadB: clamp(m.rula.fo, 0, 3) as 0 | 1 | 2 | 3,
        cycleDurationSec: Math.max(
          5,
          Math.round(timestamps[timestamps.length - 1] || 15),
        ),
        postureHoldTimeSec: options.stat ? 65 : 5,
      };

      const rebaSide: RebaSideInput = {
        upperArmPos: (m.upper < -20
          ? 2
          : m.upper <= 20
            ? 1
            : m.upper <= 45
              ? 2
              : m.upper <= 90
                ? 3
                : 4) as 1 | 2 | 3 | 4,
        shoulderRaised: options.shR,
        armAbducted: options.abd || m.abd,
        armSupported: options.armSup,
        lowerArmPos: m.inp.lo,
        wristPos: options.wristR,
        wristTwistedOrDeviated: options.wDev,
        coupling: options.coupling,
      };

      const rebaData: RebaData = {
        evaluatedSide: evaluatedSideEs,
        trunkPos: m.inp.tb,
        trunkTwistedOrSide: options.trTw || m.trTw || options.trSb || m.trSb,
        neckPos: m.inp.nb,
        neckTwistedOrSide: options.neckTw || options.neckSb,
        legsBase: options.oneLeg ? 2 : 1,
        legsKneeFlexion: m.inp.kneeCode,
        loadForce: options.kg < 5 ? 0 : options.kg <= 10 ? 1 : 2,
        shockForce: options.shock,
        right: { ...rebaSide },
        left: { ...rebaSide },
        activityStatic: options.stat,
        activityRepetitive: options.rep,
        activityUnstableChanges: options.unst,
      };

      const owasObservations: OwasObservation[] =
        analysisSummary.owasGroups.length > 0
          ? analysisSummary.owasGroups.map((g, idx) => ({
              id: `owas-vid-${idx + 1}`,
              taskPhase: g.taskPhase,
              back: g.back,
              arms: g.arms,
              legs: g.legs,
              load: g.load,
              frequencyCount: g.frequencyCount,
            }))
          : [
              {
                id: 'owas-vid-1',
                taskPhase: `Fotograma t=${(timestamps[frameIdx] || 0).toFixed(1)}s`,
                back: m.ow.back,
                arms: m.ow.arms,
                legs: m.ow.legs,
                load: m.ow.load,
                frequencyCount: 1,
              },
            ];

      return { rulaData, rebaData, owasData: { observations: owasObservations }, frame: m };
    },
    [analysisSummary, effectiveSide, options, timestamps],
  );

  // Enviar fotograma medido como nueva pestaña real del Estudio Multipestaña (con foto acotada incluida)
  const handleSendToStudy = (methodId: MethodId.RULA | MethodId.REBA | MethodId.OWAS) => {
    const built = buildMethodPayloadsForFrame(selectedFrameIdx);
    const pv = previewCanvasRef.current;
    if (!built || !pv) return;

    const tSec = timestamps[selectedFrameIdx] || 0;
    const fDeg = (v: number) => (isFin(v) ? `${v.toFixed(0)}°` : '—');
    const taskTitle =
      sourceType === 'video'
        ? `Medición video (t=${tSec.toFixed(2)} s · lado ${effectiveSide === 'R' ? 'derecho' : 'izquierdo'})`
        : `Medición goniométrica (${sourceInfoText.split('·')[0].trim() || 'captura'})`;

    const tab = createNewStudyTab(1, methodId, taskTitle);
    tab.payloads[MethodId.RULA] = built.rulaData;
    tab.payloads[MethodId.REBA] = built.rebaData;
    tab.payloads[MethodId.OWAS] = built.owasData;

    const annotatedDataUrl = pv.toDataURL('image/png');
    const photo: StudyPhoto = {
      id: `photo-angle-meter-${Date.now()}`,
      name: `goniómetro_${methodId.toLowerCase()}_t${tSec.toFixed(1)}s.png`,
      dataUrl: annotatedDataUrl,
      annotatedDataUrl,
      caption: `Ángulos medidos (${effectiveSide === 'R' ? 'Lado der.' : 'Lado izq.'}): Tronco ${fDeg(
        built.frame.trunk,
      )} · Brazo ${fDeg(built.frame.upper)} · Codo (interno) ${fDeg(
        built.frame.elbowInternal,
      )} · Cuello ${fDeg(
        built.frame.neck,
      )} · Carga ${options.kg} kg.`,
      annotations: [],
    };
    tab.photos = [photo];

    const officialEval =
      methodId === MethodId.RULA
        ? evaluateRula(built.rulaData)
        : methodId === MethodId.REBA
          ? evaluateReba(built.rebaData)
          : evaluateOwas(built.owasData);

    tab.instrumentsUsed =
      'Medidor Rápido de Ángulos por Visión Computacional (MediaPipe Pose) con goniómetro anatómico calibrado.';
    tab.evaluatorObservations = `Ángulos extraídos en Medidor Rápido: Tronco ${fDeg(
      built.frame.trunk,
    )}, Brazo ${fDeg(built.frame.upper)}, Codo (ángulo interno brazo-antebrazo) ${fDeg(
      built.frame.elbowInternal,
    )}, Cuello ${fDeg(
      built.frame.neck,
    )}. Resultado oficial ${methodId}: ${officialEval.primaryScoreText} (${officialEval.actionLevelText}).`;
    tab.implementationDeadline = officialEval.recommendedDeadline;

    onAddMeasuredTabToStudy(tab);
    setExportBanner(`Pestaña ${methodId} enviada al Estudio Multipestaña con la captura acotada.`);
  };

  // Descargar Ficha Gráfica PNG compuesta (fotograma acotado + resumen de ángulos y métodos)
  const handleDownloadCompositePng = () => {
    const pv = previewCanvasRef.current;
    if (!pv || !currentEval || !analysisSummary || !worstEval) return;

    const fmt = (v: number) => (isFin(v) ? `${v.toFixed(0)}°` : '—');
    const tSec = timestamps[selectedFrameIdx] || 0;
    const lines: Array<[string, boolean]> = [
      [
        `t = ${tSec.toFixed(2)} s · lado ${effectiveSide === 'R' ? 'derecho' : 'izquierdo'}`,
        true,
      ],
      [
        currentEval.lateral
          ? 'Vista lateral válida'
          : 'Vista poco lateral (verificar ángulos en campo)',
        false,
      ],
      ['ÁNGULOS ARTICULARES MEDIDOS', true],
      [`Tronco (vs vertical 0°): ${fmt(currentEval.trunk)}`, false],
      [`Brazo superior (vs tronco): ${fmt(currentEval.upper)}`, false],
      [
        `Codo ángulo interno (sano 30°–170°): ${fmt(currentEval.elbowInternal)}`,
        false,
      ],
      [`Cuello (offset neutro ${options.neckOff}°): ${fmt(currentEval.neck)}`, false],
      [`Rodilla Der. / Izq.: ${fmt(currentEval.kR)} / ${fmt(currentEval.kL)}`, false],
      [`Peso de carga considerado: ${options.kg} kg`, false],
    ];

    if (currentEval.rula && currentEval.reba && currentEval.ow) {
      const r = currentEval.rula;
      const b = currentEval.reba;
      const w = currentEval.ow;
      lines.push(
        [`RULA = ${r.final} · Nivel de acción ${r.lvl}`, true],
        [`Brazo ${r.up} · Antebrazo ${r.lo} · Muñeca ${r.wr} · Giro ${r.tw}`, false],
        [`Cuello ${r.nR} · Tronco ${r.trR} · Piernas ${r.lg}`, false],
        [`Tabla A=${r.A} · B=${r.B} · C=${r.C} · D=${r.D}`, false],
        [`REBA = ${b.final} · Riesgo ${b.lvl}`, true],
        [`Tronco ${b.tbB} · Cuello ${b.nbB} · Piernas ${b.lg}`, false],
        [`Brazo ${b.uR} · Antebrazo ${b.lR} · Muñeca ${b.wr} · Agarre ${b.cp}`, false],
        [`Puntaje A=${b.sA} · B=${b.sB} · Actividad +${b.act}`, false],
        [`OWAS = Categoría ${w.cat} (código ${w.back}-${w.arms}-${w.legs}-${w.load})`, true],
        [METHOD_ACTION_TEXT.owas[w.cat], false],
      );
    }

    const panelW = 500;
    const fs = 15;
    const maxPriority = Math.max(
      worstEval.rula?.lvl || 1,
      worstEval.reba?.lvlNum || 1,
      analysisSummary.maxOwasCat,
    ) as 1 | 2 | 3 | 4;

    const totalH = Math.max(pv.height, lines.length * (fs + 8) + 210);
    const out = document.createElement('canvas');
    out.width = pv.width + panelW;
    out.height = totalH;
    const g = out.getContext('2d')!;

    g.fillStyle = '#0f172a';
    g.fillRect(0, 0, out.width, out.height);
    g.drawImage(pv, 0, 0);

    let y = 32;
    const banners: Array<[string, number]> = [
      ['ErgoEval · Ficha Goniométrica RULA · REBA · OWAS', 0],
      [
        `PRIORIDAD ${PRIORITY_NAMES[maxPriority].toUpperCase()} · ${GENERAL_ACTION_TEXT[maxPriority]}`,
        maxPriority,
      ],
      [
        `RULA ${worstEval.rula?.final ?? '—'} (Nivel ${worstEval.rula?.lvl ?? 1}) · REBA ${
          worstEval.reba?.final ?? '—'
        } (${worstEval.reba?.lvl ?? ''}) · OWAS Cat. ${analysisSummary.maxOwasCat}`,
        maxPriority,
      ],
    ];

    for (const [txt, lvl] of banners) {
      g.fillStyle = lvl ? LEVEL_COLORS[lvl] : '#0369a1';
      g.fillRect(pv.width + 14, y - 20, panelW - 28, 30);
      g.fillStyle = lvl === 2 ? '#0f172a' : '#ffffff';
      g.font = '700 13.5px system-ui, sans-serif';
      g.fillText(txt, pv.width + 22, y);
      y += 38;
    }

    y += 8;
    for (const [txt, isHeader] of lines) {
      g.font = `${isHeader ? '700' : '400'} ${fs}px ui-monospace, SFMono-Regular, monospace`;
      g.fillStyle = isHeader ? '#facc15' : '#f8fafc';
      g.fillText(txt, pv.width + 16, y);
      y += fs + 8;
    }

    const link = document.createElement('a');
    link.href = out.toDataURL('image/png');
    link.download = `medicion_angulos_t${tSec.toFixed(1)}s.png`;
    link.click();
  };

  // Descargar JSON compatible con v11 + ángulos internos y flexión anatómica
  const handleDownloadJson = () => {
    if (!analysisSummary || analysisSummary.worstIdx < 0) return;
    const worstPayload = buildMethodPayloadsForFrame(analysisSummary.worstIdx);
    if (!worstPayload) return;

    const payload = {
      version: 'v4-ergoeval-integrado',
      fuente: sourceInfoText,
      lado: effectiveSide === 'R' ? 'derecho' : 'izquierdo',
      convencionCodo:
        'codoFlexionAnatomica = 0° brazo extendido (usado por RULA/REBA); codoAnguloInterno = 180° - flexion',
      posturasCriticas: analysisSummary.criticalIndices.map((idx) => {
        const m = analysisSummary.evaluated[idx];
        return {
          fase: analysisSummary.phaseLabels[idx],
          t: timestamps[idx],
          rula: m.rula?.final,
          reba: m.reba?.final,
          owas: m.ow?.cat,
          tronco: m.trunk,
          brazo: m.upper,
          codoFlexionAnatomica: m.elbow,
          codoAnguloInterno: m.elbowInternal,
          cuello: m.neck,
        };
      }),
      opciones: options,
      frames: timestamps.map((t, idx) => {
        const m = analysisSummary.evaluated[idx];
        return {
          t: Number(t.toFixed(3)),
          ok: m.ok,
          motivo: m.why || '',
          lateral: Boolean(m.lateral),
          tronco: m.trunk,
          brazo: m.upper,
          codo: m.elbow,
          codoInterno: m.elbowInternal,
          cuello: m.neck,
          rodillaD: m.kR,
          rodillaI: m.kL,
          rula: m.rula?.final ?? null,
          reba: m.reba?.final ?? null,
          owas: m.ow?.cat ?? null,
        };
      }),
      peorFotograma: {
        t: timestamps[analysisSummary.worstIdx],
        rulaData: worstPayload.rulaData,
        rebaData: worstPayload.rebaData,
      },
      owasData: worstPayload.owasData,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'angulos_rula_reba_owas.json';
    link.click();
  };

  const fmtDeg = (v: number | undefined) => (v !== undefined && isFin(v) ? `${v.toFixed(0)}°` : '—');

  const overallMaxPriority: 1 | 2 | 3 | 4 = useMemo(() => {
    if (!worstEval || !analysisSummary) return 1;
    return Math.max(
      worstEval.rula?.lvl || 1,
      worstEval.reba?.lvlNum || 1,
      analysisSummary.maxOwasCat || 1,
    ) as 1 | 2 | 3 | 4;
  }, [analysisSummary, worstEval]);

  return (
    <div className="space-y-5">
      {/* Cabecera limpia de estación de medición */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1 max-w-3xl">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <button
              type="button"
              onClick={onBackToEvaluator}
              className="inline-flex items-center gap-1 font-medium text-sky-700 hover:text-sky-900 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Volver al Estudio
            </button>
            <span aria-hidden="true">·</span>
            <span>Visión local en navegador (MediaPipe Pose)</span>
            <span aria-hidden="true">·</span>
            <span>Tablas sincronizadas con RULA, REBA y OWAS</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Testeo y Medición Rápida de Ángulos (Video y Foto)
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Mide ángulos sagitales en foto o video usando el{' '}
            <strong className="font-semibold text-slate-800">
              ángulo interno brazo-antebrazo (rango anatómico sano 30° a 170°)
            </strong>
            , ordena las leyendas en los márgenes laterales sin tapar los trazos y puntúa RULA, REBA y OWAS al instante.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleLoadCalibrationDemo}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 cursor-pointer transition-colors"
          >
            <Compass className="w-3.5 h-3.5 text-sky-700" />
            Probar postura ejemplo (Codo 172°)
          </button>

          {sourceType === 'video' && (
            <button
              type="button"
              onClick={() => runVideoAnalysis()}
              disabled={isAnalyzing}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-xs font-semibold text-white cursor-pointer transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
              Analizar de nuevo
            </button>
          )}
        </div>
      </div>

      {/* Notificación al exportar pestaña */}
      {exportBanner && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-md px-4 py-2.5 text-xs text-emerald-950 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{exportBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportBanner(null)}
            className="font-semibold text-emerald-800 hover:text-emerald-950 cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Barra Paso 1 y Paso 2: Carga de Video/Foto + Peso + Convención del Arco de Codo */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-5 space-y-1.5">
            <label className="block text-xs font-semibold text-slate-800">
              1. Subir Video lateral (MP4 / WebM / MOV) o Foto (JPG / PNG / Ctrl+V)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <label className="min-h-[40px] inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer transition-colors">
                <Film className="w-3.5 h-3.5" />
                <span>Seleccionar video o foto</span>
                <input
                  type="file"
                  accept="video/*,image/*"
                  onChange={handleMediaFileChange}
                  className="hidden"
                />
              </label>
              {sourceInfoText && (
                <span className="text-xs text-slate-600 font-mono tabular-nums truncate max-w-xs">
                  {sourceInfoText}
                </span>
              )}
            </div>
          </div>

          <div className="lg:col-span-3 space-y-1.5">
            <label className="block text-xs font-semibold text-slate-800">
              2. Peso real de la carga (kg)
            </label>
            <div className="flex items-center gap-2">
              <select
                value={KG_PRESETS.includes(options.kg) ? String(options.kg) : ''}
                onChange={(e) => {
                  if (e.target.value !== '') updateOpt('kg', Number(e.target.value));
                }}
                className="min-h-[40px] px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-xs text-slate-900 font-mono tabular-nums"
              >
                {KG_PRESETS.map((v) => (
                  <option key={v} value={v}>
                    {v === 0 ? 'Sin carga (0 kg)' : `${v} kg`}
                  </option>
                ))}
                <option value="">Otro…</option>
              </select>
              <input
                type="number"
                min={0}
                step={0.5}
                value={options.kg}
                onChange={(e) => updateOpt('kg', Math.max(0, Number(e.target.value) || 0))}
                className="min-h-[40px] w-24 px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-xs text-slate-900 font-mono tabular-nums"
              />
              <span className="text-xs text-slate-600">kg</span>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-1.5">
            <label className="block text-xs font-semibold text-slate-800">
              3. Ubicación de Leyendas (sin tapar ángulos)
            </label>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md border border-slate-200">
              {(
                [
                  ['auto_margins', 'Márgenes Izq / Der'],
                  ['left', 'A la Izquierda'],
                  ['right', 'A la Derecha'],
                ] as const
              ).map(([sideVal, sideLbl]) => (
                <button
                  key={sideVal}
                  type="button"
                  onClick={() => updateOpt('calloutSideMode', sideVal)}
                  className={`flex-1 min-h-[32px] px-2 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                    options.calloutSideMode === sideVal
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {sideLbl}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Estado de progreso + botón de ajustes técnicos */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 min-w-0">
            {isAnalyzing && (
              <progress
                value={progressRatio}
                max={1}
                className="w-40 h-2 accent-sky-600 shrink-0"
              />
            )}
            <span className="text-slate-600">{statusMessage}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1.5 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={options.elbowVisualMode === 'interno_suplementario'}
                onChange={(e) =>
                  updateOpt(
                    'elbowVisualMode',
                    e.target.checked ? 'interno_suplementario' : 'flexion_anatomica',
                  )
                }
              />
              <span>Arco interno de codo (30°–170° sano, ej. 172°)</span>
            </label>

            <button
              type="button"
              onClick={() => setShowTechSettings((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 text-sky-700" />
              <span>{showTechSettings ? 'Ocultar ajustes técnicos' : 'Ajustes técnicos'}</span>
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-800">
            {errorMessage}
          </div>
        )}

        {/* Panel desplegable de ajustes técnicos */}
        {showTechSettings && (
          <div className="pt-3 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
            <label className="space-y-1">
              <span className="block font-medium text-slate-700">Lado evaluado</span>
              <select
                value={options.side}
                onChange={(e) => updateOpt('side', e.target.value as SideMode)}
                className="w-full px-2 py-1.5 rounded border border-slate-300 bg-white"
              >
                <option value="auto">Auto (más visible)</option>
                <option value="R">Derecho</option>
                <option value="L">Izquierdo</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="block font-medium text-slate-700">Dirección mirada</span>
              <select
                value={options.facingMode}
                onChange={(e) => updateOpt('facingMode', e.target.value as FacingMode)}
                className="w-full px-2 py-1.5 rounded border border-slate-300 bg-white"
              >
                <option value="auto">Auto (nariz/pies)</option>
                <option value="right">Hacia la derecha →</option>
                <option value="left">← Hacia la izquierda</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="block font-medium text-slate-700">Modelo IA</span>
              <select
                value={options.mdl}
                onChange={(e) => updateOpt('mdl', e.target.value as ModelTier)}
                className="w-full px-2 py-1.5 rounded border border-slate-300 bg-white"
              >
                <option value="full">Normal (Rápido)</option>
                <option value="heavy">Pesado (Más preciso)</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="block font-medium text-slate-700">Muestreo (fps)</span>
              <input
                type="number"
                min={2}
                max={20}
                step={1}
                value={options.fps}
                onChange={(e) => updateOpt('fps', clamp(Number(e.target.value) || 6, 2, 20))}
                className="w-full px-2 py-1.5 rounded border border-slate-300 bg-white font-mono tabular-nums"
              />
            </label>

            <label className="space-y-1">
              <span className="block font-medium text-slate-700">Cuello neutro (°)</span>
              <input
                type="number"
                min={0}
                max={25}
                step={1}
                value={options.neckOff}
                onChange={(e) => updateOpt('neckOff', Number(e.target.value) || 0)}
                className="w-full px-2 py-1.5 rounded border border-slate-300 bg-white font-mono tabular-nums"
              />
            </label>

            <label className="space-y-1">
              <span className="block font-medium text-slate-700">Plomada cámara (°)</span>
              <input
                type="number"
                min={-15}
                max={15}
                step={0.5}
                value={options.verticalCalibDeg}
                onChange={(e) => updateOpt('verticalCalibDeg', Number(e.target.value) || 0)}
                className="w-full px-2 py-1.5 rounded border border-slate-300 bg-white font-mono tabular-nums"
              />
            </label>

            <label className="space-y-1">
              <span className="block font-medium text-slate-700">Nº posturas críticas</span>
              <input
                type="number"
                min={1}
                max={8}
                step={1}
                value={options.nCrit}
                onChange={(e) => updateOpt('nCrit', Math.max(1, Number(e.target.value) || 3))}
                className="w-full px-2 py-1.5 rounded border border-slate-300 bg-white font-mono tabular-nums"
              />
            </label>

            <label className="space-y-1">
              <span className="block font-medium text-slate-700">Separación mín. (s)</span>
              <input
                type="number"
                min={0.5}
                max={10}
                step={0.5}
                value={options.gapCrit}
                onChange={(e) => updateOpt('gapCrit', Math.max(0.3, Number(e.target.value) || 1.5))}
                className="w-full px-2 py-1.5 rounded border border-slate-300 bg-white font-mono tabular-nums"
              />
            </label>

            <label className="space-y-1">
              <span className="block font-medium text-slate-700">Límite lateralidad</span>
              <input
                type="number"
                min={0.1}
                max={1.2}
                step={0.05}
                value={options.latMax}
                onChange={(e) => updateOpt('latMax', Number(e.target.value) || 0.5)}
                className="w-full px-2 py-1.5 rounded border border-slate-300 bg-white font-mono tabular-nums"
              />
            </label>

            <label className="space-y-1">
              <span className="block font-medium text-slate-700">Visibilidad mín.</span>
              <input
                type="number"
                min={0.1}
                max={0.95}
                step={0.05}
                value={options.visMin}
                onChange={(e) => updateOpt('visMin', Number(e.target.value) || 0.4)}
                className="w-full px-2 py-1.5 rounded border border-slate-300 bg-white font-mono tabular-nums"
              />
            </label>

            <div className="col-span-2 flex flex-wrap items-center gap-4 pt-4">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.incl}
                  onChange={(e) => updateOpt('incl', e.target.checked)}
                />
                <span>Incluir vistas poco laterales</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.smoothMedian}
                  onChange={(e) => updateOpt('smoothMedian', e.target.checked)}
                />
                <span>Suavizado mediana (3 fotogramas)</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Área principal de trabajo cuando hay fotogramas cargados */}
      {analysisSummary && timestamps.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* Columna izquierda: Visor Canvas interactivo + Scrubber */}
          <div className="xl:col-span-6 bg-white border border-slate-200 rounded-lg p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <label className="inline-flex items-center gap-1.5 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={interactiveJointEdit}
                    onChange={(e) => setInteractiveJointEdit(e.target.checked)}
                  />
                  <MousePointerClick className="w-3.5 h-3.5 text-sky-700" />
                  <span>Ajustar puntos articulares con el ratón</span>
                </label>
                {hoveredJointIdx !== null && EDITABLE_LANDMARK_LABELS[hoveredJointIdx] && (
                  <span className="text-sky-700 font-semibold">
                    · {EDITABLE_LANDMARK_LABELS[hoveredJointIdx]}
                  </span>
                )}
              </div>

              {currentFrameHasEdits && (
                <button
                  type="button"
                  onClick={resetCurrentFrameEdits}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Restaurar detección IA
                </button>
              )}
            </div>

            <div className="rounded-md overflow-hidden border border-slate-800 bg-slate-950">
              <canvas
                ref={previewCanvasRef}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerLeave={handleCanvasPointerUp}
                className={`w-full h-auto block select-none touch-none ${
                  interactiveJointEdit && hoveredJointIdx !== null
                    ? 'cursor-grab active:cursor-grabbing'
                    : 'cursor-crosshair'
                }`}
              />
            </div>

            {timestamps.length > 1 && (
              <div className="space-y-1">
                <input
                  type="range"
                  min={0}
                  max={timestamps.length - 1}
                  value={selectedFrameIdx}
                  onChange={(e) => setSelectedFrameIdx(Number(e.target.value))}
                  className="w-full accent-sky-700 cursor-pointer"
                />
                <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
                  <span>
                    Fotograma {selectedFrameIdx + 1}/{timestamps.length} · t ={' '}
                    {(timestamps[selectedFrameIdx] || 0).toFixed(2)} s
                  </span>
                  <span>Línea blanca = vertical 0° · Arco naranja = ángulo interno de codo</span>
                </div>
              </div>
            )}

            {/* Envío directo al Estudio Multipestaña */}
            {currentEval?.ok && (
              <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">
                  Enviar fotograma actual e imagen acotada al Estudio:
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSendToStudy(MethodId.RULA)}
                    className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Pestaña RULA
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendToStudy(MethodId.REBA)}
                    className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Pestaña REBA
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendToStudy(MethodId.OWAS)}
                    className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Pestaña OWAS
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Columna central: Semáforo de prioridad + Tarjetas RULA / REBA / OWAS */}
          <div className="xl:col-span-3 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <div className="text-sm font-bold tracking-tight">Síntesis de Riesgo</div>
                <div className="text-[11px] text-slate-300">
                  {worstEval
                    ? `Peor fotograma: t = ${(timestamps[analysisSummary.worstIdx] || 0).toFixed(2)} s`
                    : 'Sin fotogramas laterales válidos'}
                </div>
              </div>
              {analysisSummary.worstIdx >= 0 && selectedFrameIdx !== analysisSummary.worstIdx && (
                <button
                  type="button"
                  onClick={() => setSelectedFrameIdx(analysisSummary.worstIdx)}
                  className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white cursor-pointer"
                >
                  Ir al peor
                </button>
              )}
            </div>

            {worstEval && worstEval.rula && worstEval.reba && worstEval.ow ? (
              <div className="p-4 space-y-3">
                <PriorityGaugeSvg level={overallMaxPriority} />

                <div className="text-center space-y-0.5">
                  <div
                    className="text-sm font-bold tracking-tight"
                    style={{ color: LEVEL_COLORS[overallMaxPriority] }}
                  >
                    Prioridad {PRIORITY_NAMES[overallMaxPriority]}
                  </div>
                  <div className="text-xs text-slate-600">
                    {GENERAL_ACTION_TEXT[overallMaxPriority]}
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  {[
                    {
                      name: 'RULA',
                      score: `${worstEval.rula.final} / 7`,
                      sub: `Nivel de acción ${worstEval.rula.lvl} · Prioridad ${PRIORITY_NAMES[worstEval.rula.lvl]}`,
                      desc: METHOD_ACTION_TEXT.rula[worstEval.rula.lvl],
                      lvl: worstEval.rula.lvl,
                    },
                    {
                      name: 'REBA',
                      score: `${worstEval.reba.final} / 15`,
                      sub: `Riesgo ${worstEval.reba.lvl} · Prioridad ${PRIORITY_NAMES[worstEval.reba.lvlNum]}`,
                      desc: METHOD_ACTION_TEXT.reba[worstEval.reba.lvlNum],
                      lvl: worstEval.reba.lvlNum,
                    },
                    {
                      name: 'OWAS',
                      score: `Cat. ${analysisSummary.maxOwasCat}`,
                      sub: `Máximo del ciclo · Prioridad ${PRIORITY_NAMES[analysisSummary.maxOwasCat]}`,
                      desc: METHOD_ACTION_TEXT.owas[analysisSummary.maxOwasCat],
                      lvl: analysisSummary.maxOwasCat,
                    },
                  ].map((item) => (
                    <div
                      key={item.name}
                      className="rounded-md border border-slate-200 p-2.5 flex items-start gap-3 bg-slate-50/70"
                    >
                      <div
                        className="w-16 shrink-0 rounded py-1.5 px-1 text-center font-mono font-bold text-sm tabular-nums"
                        style={{
                          backgroundColor: `${LEVEL_COLORS[item.lvl]}20`,
                          color: item.lvl === 2 ? '#854d0e' : LEVEL_COLORS[item.lvl],
                          border: `1px solid ${LEVEL_COLORS[item.lvl]}66`,
                        }}
                      >
                        {item.score}
                      </div>
                      <div className="min-w-0 text-xs space-y-0.5">
                        <div className="font-semibold text-slate-900">
                          {item.name}{' '}
                          <span className="font-normal text-slate-500">· {item.sub}</span>
                        </div>
                        <div className="text-slate-600 leading-snug">{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4 text-xs text-red-700">
                No hay fotogramas utilizables con los filtros actuales. Activa &ldquo;Incluir vistas
                poco laterales&rdquo; en Ajustes técnicos.
              </div>
            )}
          </div>

          {/* Columna derecha: Ficha numérica del fotograma actual */}
          <div className="xl:col-span-3 bg-white border border-slate-200 rounded-lg p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="font-bold text-sm text-slate-900">
                Fotograma actual (t = {(timestamps[selectedFrameIdx] || 0).toFixed(2)} s)
              </span>
              <span className="text-slate-500">
                Lado {effectiveSide === 'R' ? 'derecho' : 'izquierdo'}
              </span>
            </div>

            {currentEval && currentEval.ok ? (
              <div className="space-y-3">
                <div className="space-y-1.5 font-mono tabular-nums">
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-600">Tronco (vs vertical):</span>
                    <span className="font-semibold text-slate-900">
                      {fmtDeg(currentEval.trunk)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-600">Brazo sup. (vs tronco):</span>
                    <span className="font-semibold text-slate-900">
                      {fmtDeg(currentEval.upper)}
                    </span>
                  </div>
                  <div className="flex justify-between bg-amber-50/80 border border-amber-200/80 rounded px-2 py-1">
                    <span className="font-sans font-medium text-amber-950">
                      Codo ángulo interno (30°–170°):
                    </span>
                    <span className="font-bold text-amber-950">
                      {fmtDeg(currentEval.elbowInternal)}
                    </span>
                  </div>
                  {isFin(currentEval.elbowInternal) && currentEval.elbowInternal > 170 && (
                    <div className="px-2 text-[11px] font-sans text-amber-800">
                      Límite anatómico sano: 170° (exceso 2D por perspectiva de cámara).
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-600">Cuello:</span>
                    <span className="font-semibold text-slate-900">{fmtDeg(currentEval.neck)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-600">Rodillas Der. / Izq.:</span>
                    <span className="font-semibold text-slate-900">
                      {fmtDeg(currentEval.kR)} / {fmtDeg(currentEval.kL)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-600">Torsión / Lat. tronco 3D:</span>
                    <span className="text-slate-800">
                      {fmtDeg(currentEval.twist)} / {fmtDeg(currentEval.side)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-600">Abducción brazo 3D:</span>
                    <span className="text-slate-800">{fmtDeg(currentEval.abdD)}</span>
                  </div>
                </div>

                {currentEval.rula && currentEval.reba && currentEval.ow && (
                  <div className="pt-2 border-t border-slate-200 space-y-1.5 text-slate-700">
                    <div>
                      <strong className="text-slate-900">RULA = {currentEval.rula.final}</strong>{' '}
                      (niv. {currentEval.rula.lvl}) · A={currentEval.rula.A} · B=
                      {currentEval.rula.B} · C={currentEval.rula.C} · D={currentEval.rula.D}
                    </div>
                    <div>
                      <strong className="text-slate-900">REBA = {currentEval.reba.final}</strong> (
                      {currentEval.reba.lvl}) · A={currentEval.reba.sA} · B={currentEval.reba.sB} ·
                      act +{currentEval.reba.act}
                    </div>
                    <div>
                      <strong className="text-slate-900">OWAS = Cat. {currentEval.ow.cat}</strong> ·
                      código {currentEval.ow.back}-{currentEval.ow.arms}-{currentEval.ow.legs}-
                      {currentEval.ow.load}
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-200 flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={handleDownloadCompositePng}
                    className="min-h-[36px] w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white font-semibold cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Descargar ficha PNG completa
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadJson}
                    className="min-h-[36px] w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold cursor-pointer"
                  >
                    <FileJson className="w-3.5 h-3.5 text-sky-700" />
                    Descargar JSON (ángulos + entradas)
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-slate-500 py-4">
                Este fotograma no tiene articulaciones suficientes visibles. Prueba otro instante en
                la barra inferior.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Opciones comunes + Pestañas de desglose por método (RULA / REBA / OWAS) */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 space-y-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">
              Modificadores posturales comunes (recalculan al instante)
            </h2>
            <span className="text-xs text-slate-500">
              Torsión, inclinación lateral y abducción también se estiman solas en 3D desde el video
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs text-slate-800">
            {(
              [
                ['seated', 'Sentado con apoyo'],
                ['oneLeg', 'Apoyo en una pierna'],
                ['trTw', 'Tronco girado (+1)'],
                ['trSb', 'Tronco inclinado lat. (+1)'],
                ['neckTw', 'Cuello girado (+1)'],
                ['neckSb', 'Cuello inclinado lat. (+1)'],
                ['abd', 'Brazo abducido (+1)'],
                ['shR', 'Hombro elevado (+1)'],
                ['armSup', 'Brazo apoyado (−1)'],
                ['wDev', 'Muñeca desviada (+1)'],
              ] as Array<[keyof MeterOptions, string]>
            ).map(([key, label]) => (
              <label
                key={key}
                className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded border border-slate-200 bg-slate-50/70 hover:bg-slate-100 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={Boolean(options[key])}
                  onChange={(e) => updateOpt(key, e.target.checked as never)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Selector segmentado de método */}
        <div className="border-t border-slate-200 pt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-md w-fit border border-slate-200">
            {(
              [
                [
                  'rula',
                  `RULA${currentEval?.rula ? ` · ${currentEval.rula.final}` : ''}`,
                ],
                [
                  'reba',
                  `REBA${currentEval?.reba ? ` · ${currentEval.reba.final}` : ''}`,
                ],
                [
                  'owas',
                  `OWAS${currentEval?.ow ? ` · Cat. ${currentEval.ow.cat}` : ''}`,
                ],
              ] as const
            ).map(([tabKey, label]) => (
              <button
                key={tabKey}
                type="button"
                onClick={() => setActiveMethodTab(tabKey)}
                className={`min-h-[34px] px-4 py-1.5 rounded text-xs font-semibold font-mono tabular-nums cursor-pointer transition-colors ${
                  activeMethodTab === tabKey
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Panel RULA */}
          {activeMethodTab === 'rula' && (
            <div className="space-y-3 text-xs">
              <div className="flex flex-wrap items-center gap-4 p-3 rounded-md bg-slate-50 border border-slate-200">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.crossMid}
                    onChange={(e) => updateOpt('crossMid', e.target.checked)}
                  />
                  <span>Antebrazo cruza línea media / hacia afuera (+1)</span>
                </label>

                <label className="inline-flex items-center gap-1.5">
                  <span className="font-medium text-slate-700">Muñeca:</span>
                  <select
                    value={options.wrist}
                    onChange={(e) => updateOpt('wrist', Number(e.target.value) as 1 | 2 | 3)}
                    className="px-2 py-1 rounded border border-slate-300 bg-white"
                  >
                    <option value={1}>1 · Neutra (0°)</option>
                    <option value={2}>2 · Flexión/ext. 0°–15°</option>
                    <option value={3}>3 · Flexión/ext. &gt;15°</option>
                  </select>
                </label>

                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.wTw}
                    onChange={(e) => updateOpt('wTw', e.target.checked)}
                  />
                  <span>Pronosupinación extrema de muñeca (2)</span>
                </label>

                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.muscle}
                    onChange={(e) => updateOpt('muscle', e.target.checked)}
                  />
                  <span>Uso muscular estático &gt;1 min o repetido &gt;4/min (+1)</span>
                </label>

                <label className="inline-flex items-center gap-1.5">
                  <span className="font-medium text-slate-700">Tipo de carga:</span>
                  <select
                    value={options.lt}
                    onChange={(e) => updateOpt('lt', e.target.value as 'i' | 's')}
                    className="px-2 py-1 rounded border border-slate-300 bg-white"
                  >
                    <option value="i">Intermitente</option>
                    <option value="s">Estática o repetida</option>
                  </select>
                </label>
              </div>

              {currentEval?.rula && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse border border-slate-200 font-mono tabular-nums">
                    <thead>
                      <tr className="bg-slate-50 font-sans text-slate-700">
                        <th className="border border-slate-200 px-3 py-2">Segmento RULA</th>
                        <th className="border border-slate-200 px-3 py-2">Ángulo / Dato medido</th>
                        <th className="border border-slate-200 px-3 py-2">Puntaje parcial</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-slate-200 px-3 py-1.5 font-sans">Brazo superior</td>
                        <td className="border border-slate-200 px-3 py-1.5">{fmtDeg(currentEval.upper)}</td>
                        <td className="border border-slate-200 px-3 py-1.5 font-semibold">{currentEval.rula.up}</td>
                      </tr>
                      <tr>
                        <td className="border border-slate-200 px-3 py-1.5 font-sans">
                          Antebrazo / Codo (80°–120° int. = 1; 30°–80° ó 120°–170° = 2)
                        </td>
                        <td className="border border-slate-200 px-3 py-1.5">
                          Ángulo interno {fmtDeg(currentEval.elbowInternal)}
                        </td>
                        <td className="border border-slate-200 px-3 py-1.5 font-semibold">{currentEval.rula.lo}</td>
                      </tr>
                      <tr>
                        <td className="border border-slate-200 px-3 py-1.5 font-sans">Muñeca y giro</td>
                        <td className="border border-slate-200 px-3 py-1.5">Manual</td>
                        <td className="border border-slate-200 px-3 py-1.5 font-semibold">
                          {currentEval.rula.wr} / giro {currentEval.rula.tw}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-slate-200 px-3 py-1.5 font-sans">Cuello</td>
                        <td className="border border-slate-200 px-3 py-1.5">{fmtDeg(currentEval.neck)}</td>
                        <td className="border border-slate-200 px-3 py-1.5 font-semibold">{currentEval.rula.nR}</td>
                      </tr>
                      <tr>
                        <td className="border border-slate-200 px-3 py-1.5 font-sans">Tronco</td>
                        <td className="border border-slate-200 px-3 py-1.5">{fmtDeg(currentEval.trunk)}</td>
                        <td className="border border-slate-200 px-3 py-1.5 font-semibold">{currentEval.rula.trR}</td>
                      </tr>
                      <tr>
                        <td className="border border-slate-200 px-3 py-1.5 font-sans">Piernas · Uso · Fuerza</td>
                        <td className="border border-slate-200 px-3 py-1.5">{options.kg} kg</td>
                        <td className="border border-slate-200 px-3 py-1.5 font-semibold">
                          Piernas {currentEval.rula.lg} · Uso +{currentEval.rula.mu} · Fuerza +{currentEval.rula.fo}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Panel REBA */}
          {activeMethodTab === 'reba' && (
            <div className="space-y-3 text-xs">
              <div className="flex flex-wrap items-center gap-4 p-3 rounded-md bg-slate-50 border border-slate-200">
                <label className="inline-flex items-center gap-1.5">
                  <span className="font-medium text-slate-700">Muñeca:</span>
                  <select
                    value={options.wristR}
                    onChange={(e) => updateOpt('wristR', Number(e.target.value) as 1 | 2)}
                    className="px-2 py-1 rounded border border-slate-300 bg-white"
                  >
                    <option value={1}>1 · 0°–15°</option>
                    <option value={2}>2 · &gt;15°</option>
                  </select>
                </label>

                <label className="inline-flex items-center gap-1.5">
                  <span className="font-medium text-slate-700">Agarre:</span>
                  <select
                    value={options.coupling}
                    onChange={(e) => updateOpt('coupling', Number(e.target.value) as 0 | 1 | 2 | 3)}
                    className="px-2 py-1 rounded border border-slate-300 bg-white"
                  >
                    <option value={0}>0 · Bueno</option>
                    <option value={1}>1 · Regular</option>
                    <option value={2}>2 · Malo</option>
                    <option value={3}>3 · Inaceptable</option>
                  </select>
                </label>

                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.shock}
                    onChange={(e) => updateOpt('shock', e.target.checked)}
                  />
                  <span>Fuerza brusca / sacudidas (+1)</span>
                </label>

                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.stat}
                    onChange={(e) => updateOpt('stat', e.target.checked)}
                  />
                  <span>Postura estática &gt;1 min (+1)</span>
                </label>

                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.rep}
                    onChange={(e) => updateOpt('rep', e.target.checked)}
                  />
                  <span>Acciones repetidas &gt;4/min (+1)</span>
                </label>

                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.unst}
                    onChange={(e) => updateOpt('unst', e.target.checked)}
                  />
                  <span>Cambios posturales bruscos (+1)</span>
                </label>
              </div>

              {currentEval?.reba && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse border border-slate-200 font-mono tabular-nums">
                    <thead>
                      <tr className="bg-slate-50 font-sans text-slate-700">
                        <th className="border border-slate-200 px-3 py-2">Segmento REBA</th>
                        <th className="border border-slate-200 px-3 py-2">Ángulo / Dato medido</th>
                        <th className="border border-slate-200 px-3 py-2">Puntaje parcial</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-slate-200 px-3 py-1.5 font-sans">Tronco</td>
                        <td className="border border-slate-200 px-3 py-1.5">{fmtDeg(currentEval.trunk)}</td>
                        <td className="border border-slate-200 px-3 py-1.5 font-semibold">{currentEval.reba.tbB}</td>
                      </tr>
                      <tr>
                        <td className="border border-slate-200 px-3 py-1.5 font-sans">Cuello</td>
                        <td className="border border-slate-200 px-3 py-1.5">{fmtDeg(currentEval.neck)}</td>
                        <td className="border border-slate-200 px-3 py-1.5 font-semibold">{currentEval.reba.nbB}</td>
                      </tr>
                      <tr>
                        <td className="border border-slate-200 px-3 py-1.5 font-sans">Piernas (máx. flexión rodilla)</td>
                        <td className="border border-slate-200 px-3 py-1.5">{fmtDeg(currentEval.inp?.kMax)}</td>
                        <td className="border border-slate-200 px-3 py-1.5 font-semibold">{currentEval.reba.lg}</td>
                      </tr>
                      <tr>
                        <td className="border border-slate-200 px-3 py-1.5 font-sans">Brazo superior</td>
                        <td className="border border-slate-200 px-3 py-1.5">{fmtDeg(currentEval.upper)}</td>
                        <td className="border border-slate-200 px-3 py-1.5 font-semibold">{currentEval.reba.uR}</td>
                      </tr>
                      <tr>
                        <td className="border border-slate-200 px-3 py-1.5 font-sans">
                          Antebrazo / Codo (80°–120° int. = 1; 30°–80° ó 120°–170° = 2)
                        </td>
                        <td className="border border-slate-200 px-3 py-1.5">
                          Ángulo interno {fmtDeg(currentEval.elbowInternal)}
                        </td>
                        <td className="border border-slate-200 px-3 py-1.5 font-semibold">{currentEval.reba.lR}</td>
                      </tr>
                      <tr>
                        <td className="border border-slate-200 px-3 py-1.5 font-sans">Muñeca · Agarre · Carga · Actividad</td>
                        <td className="border border-slate-200 px-3 py-1.5">{options.kg} kg</td>
                        <td className="border border-slate-200 px-3 py-1.5 font-semibold">
                          A={currentEval.reba.sA} · B={currentEval.reba.sB} · Act +{currentEval.reba.act} → Final {currentEval.reba.final}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Panel OWAS */}
          {activeMethodTab === 'owas' && (
            <div className="space-y-3 text-xs">
              <div className="flex flex-wrap items-center gap-4 p-3 rounded-md bg-slate-50 border border-slate-200">
                <label className="inline-flex items-center gap-1.5">
                  <span className="font-medium text-slate-700">Espalda:</span>
                  <select
                    value={options.ob}
                    onChange={(e) => updateOpt('ob', e.target.value as MeterOptions['ob'])}
                    className="px-2 py-1 rounded border border-slate-300 bg-white"
                  >
                    <option value="auto">Auto (desde ángulo tronco)</option>
                    <option value="1">1 · Recta</option>
                    <option value="2">2 · Inclinada (&gt;20°)</option>
                    <option value="3">3 · Girada / lateral</option>
                    <option value="4">4 · Inclinada y girada</option>
                  </select>
                </label>

                <label className="inline-flex items-center gap-1.5">
                  <span className="font-medium text-slate-700">Brazos:</span>
                  <select
                    value={options.oa}
                    onChange={(e) => updateOpt('oa', e.target.value as MeterOptions['oa'])}
                    className="px-2 py-1 rounded border border-slate-300 bg-white"
                  >
                    <option value="auto">Auto (muñecas vs hombros)</option>
                    <option value="1">1 · Ambos bajo hombros</option>
                    <option value="2">2 · Uno sobre hombro</option>
                    <option value="3">3 · Ambos sobre hombros</option>
                  </select>
                </label>

                <label className="inline-flex items-center gap-1.5">
                  <span className="font-medium text-slate-700">Piernas:</span>
                  <select
                    value={options.ol}
                    onChange={(e) => updateOpt('ol', e.target.value as MeterOptions['ol'])}
                    className="px-2 py-1 rounded border border-slate-300 bg-white"
                  >
                    <option value="auto">Auto (desde rodillas)</option>
                    <option value="1">1 · Sentado</option>
                    <option value="2">2 · De pie 2 piernas rectas</option>
                    <option value="3">3 · De pie 1 pierna recta</option>
                    <option value="4">4 · Ambas flexionadas</option>
                    <option value="5">5 · Una flexionada</option>
                    <option value="6">6 · Arrodillado</option>
                    <option value="7">7 · Caminando</option>
                  </select>
                </label>
              </div>

              {currentEval?.ow && analysisSummary && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <table className="w-full text-left border-collapse border border-slate-200 font-mono tabular-nums">
                    <thead>
                      <tr className="bg-slate-50 font-sans text-slate-700">
                        <th className="border border-slate-200 px-3 py-2">Dígito OWAS</th>
                        <th className="border border-slate-200 px-3 py-2">Descripción</th>
                        <th className="border border-slate-200 px-3 py-2">Código</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-slate-200 px-3 py-1.5 font-sans">Espalda</td>
                        <td className="border border-slate-200 px-3 py-1.5 font-sans">
                          {OWAS_BACK_LABELS[currentEval.ow.back]}
                        </td>
                        <td className="border border-slate-200 px-3 py-1.5 font-semibold">
                          {currentEval.ow.back}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-slate-200 px-3 py-1.5 font-sans">Brazos</td>
                        <td className="border border-slate-200 px-3 py-1.5 font-sans">
                          {OWAS_ARMS_LABELS[currentEval.ow.arms]}
                        </td>
                        <td className="border border-slate-200 px-3 py-1.5 font-semibold">
                          {currentEval.ow.arms}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-slate-200 px-3 py-1.5 font-sans">Piernas</td>
                        <td className="border border-slate-200 px-3 py-1.5 font-sans">
                          {OWAS_LEGS_LABELS[currentEval.ow.legs]}
                        </td>
                        <td className="border border-slate-200 px-3 py-1.5 font-semibold">
                          {currentEval.ow.legs}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-slate-200 px-3 py-1.5 font-sans">Carga</td>
                        <td className="border border-slate-200 px-3 py-1.5 font-sans">
                          {OWAS_LOAD_LABELS[currentEval.ow.load]}
                        </td>
                        <td className="border border-slate-200 px-3 py-1.5 font-semibold">
                          {currentEval.ow.load}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="space-y-2">
                    <div className="font-semibold text-slate-800">
                      Distribución de categorías OWAS en el ciclo muestreado:
                    </div>
                    {([1, 2, 3, 4] as const).map((cat) => {
                      const totalObs =
                        analysisSummary.owasGroups.reduce((acc, g) => acc + g.frequencyCount, 0) ||
                        1;
                      const catObs = analysisSummary.owasGroups
                        .filter((g) => g.categoria === cat)
                        .reduce((acc, g) => acc + g.frequencyCount, 0);
                      const pct = (catObs * 100) / totalObs;
                      return (
                        <div key={cat} className="space-y-1">
                          <div className="flex justify-between text-xs font-mono tabular-nums">
                            <span className="font-sans text-slate-700">
                              Categoría {cat} · {METHOD_ACTION_TEXT.owas[cat]}
                            </span>
                            <span className="font-semibold">{pct.toFixed(0)}%</span>
                          </div>
                          <div className="h-2.5 w-full rounded bg-slate-100 overflow-hidden border border-slate-200">
                            <div
                              className="h-full transition-all"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: LEVEL_COLORS[cat],
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Posturas críticas del ciclo */}
      {analysisSummary && analysisSummary.criticalIndices.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900">
              Posturas críticas detectadas ({analysisSummary.criticalIndices.length})
            </h2>
            <span className="text-xs text-slate-500">
              Haz clic en cualquier captura para inspeccionar o ajustar sus vértices arriba
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {analysisSummary.criticalIndices.map((idx) => {
              const m = analysisSummary.evaluated[idx];
              const isSelected = selectedFrameIdx === idx;
              const isWorst = analysisSummary.worstIdx === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedFrameIdx(idx)}
                  className={`text-left rounded-lg border p-3 space-y-2 cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-sky-600 bg-sky-50/40'
                      : 'border-slate-200 hover:border-slate-400 bg-white'
                  }`}
                >
                  <canvas
                    ref={(el) => {
                      critThumbRefs.current[idx] = el;
                    }}
                    className="w-full h-auto rounded border border-slate-800 bg-slate-950 block"
                  />
                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-slate-900">
                      {analysisSummary.phaseLabels[idx]}
                      {isWorst ? ' · Más desfavorable' : ''}
                    </div>
                    <div className="font-mono tabular-nums text-slate-600">
                      t = {(timestamps[idx] || 0).toFixed(2)} s · RULA {m.rula?.final} · REBA{' '}
                      {m.reba?.final} · OWAS {m.ow?.cat}
                    </div>
                    <div className="font-mono tabular-nums text-slate-500">
                      Tronco {fmtDeg(m.trunk)} · Brazo {fmtDeg(m.upper)} · Codo{' '}
                      {fmtDeg(m.elbowInternal)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabla completa fotograma a fotograma */}
      {analysisSummary && timestamps.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900">
              Registro fotograma a fotograma ({timestamps.length})
            </h2>
            <span className="text-xs text-slate-500">
              Clic en una fila para cargar ese instante en el goniómetro
            </span>
          </div>

          <div className="max-h-80 overflow-auto border border-slate-200 rounded-md">
            <table className="w-full text-xs border-collapse font-mono tabular-nums">
              <thead className="sticky top-0 bg-slate-100 text-slate-700 font-sans">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 text-right">t (s)</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left">Estado</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right">Tronco</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right">Brazo</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right">
                    Codo int.
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right">
                    Ext. (180°−int)
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right">Cuello</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right">Rod. D</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right">Rod. I</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right">RULA</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right">REBA</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right">OWAS</th>
                </tr>
              </thead>
              <tbody>
                {analysisSummary.evaluated.map((m, idx) => {
                  const isSel = selectedFrameIdx === idx;
                  const isCrit = analysisSummary.criticalIndices.includes(idx);
                  const whyLabel: Record<string, string> = {
                    none: 'Sin persona',
                    vis: 'Tronco poco visible',
                    face: 'Orientación ambigua',
                  };
                  return (
                    <tr
                      key={idx}
                      onClick={() => setSelectedFrameIdx(idx)}
                      className={`cursor-pointer border-b border-slate-100 hover:bg-sky-50/70 ${
                        isSel ? 'bg-sky-100/80 font-semibold' : ''
                      }`}
                    >
                      <td className="px-3 py-1.5 text-right">
                        {(timestamps[idx] || 0).toFixed(2)}
                        {isCrit ? ' ★' : ''}
                      </td>
                      {m.ok && m.rula && m.reba && m.ow ? (
                        <>
                          <td className="px-3 py-1.5 font-sans text-slate-600">
                            {m.lateral ? 'Lateral ok' : 'Poco lateral'}
                            {m.armLow ? ' · brazo ocluido' : ''}
                          </td>
                          <td className="px-3 py-1.5 text-right">{fmtDeg(m.trunk)}</td>
                          <td className="px-3 py-1.5 text-right">{fmtDeg(m.upper)}</td>
                          <td className="px-3 py-1.5 text-right font-semibold text-amber-900">
                            {fmtDeg(m.elbowInternal)}
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-500">
                            {fmtDeg(m.elbow)}
                          </td>
                          <td className="px-3 py-1.5 text-right">{fmtDeg(m.neck)}</td>
                          <td className="px-3 py-1.5 text-right">{fmtDeg(m.kR)}</td>
                          <td className="px-3 py-1.5 text-right">{fmtDeg(m.kL)}</td>
                          <td
                            className="px-3 py-1.5 text-right font-bold"
                            style={{ backgroundColor: `${LEVEL_COLORS[m.rula.lvl]}30` }}
                          >
                            {m.rula.final}
                          </td>
                          <td
                            className="px-3 py-1.5 text-right font-bold"
                            style={{ backgroundColor: `${LEVEL_COLORS[m.reba.lvlNum]}30` }}
                          >
                            {m.reba.final}
                          </td>
                          <td
                            className="px-3 py-1.5 text-right font-bold"
                            style={{ backgroundColor: `${LEVEL_COLORS[m.ow.cat]}30` }}
                          >
                            {m.ow.cat}
                          </td>
                        </>
                      ) : (
                        <td colSpan={11} className="px-3 py-1.5 font-sans text-slate-400">
                          {whyLabel[m.why] || '—'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

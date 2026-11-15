import { BookFigureFileSpec, Panel3DSpec } from '../types/figurePlan';
import { BOOK_FIGURE_CATALOG } from './figurePlanCatalog';

export type EnglishEditionMode = 'intl_dual' | 'us_ansi' | 'eu_iso';

export interface EnglishBookTableSpec {
  id: string;
  tableCode: string;
  fileNameStem: string;
  chapter: number;
  chapterTitle: string;
  title: string;
  relatedFigures: string;
  usStandards: string;
  euStandards: string;
  headers: string[];
  colAligns: ('left' | 'center' | 'right')[];
  colRatios: number[];
  colMono?: boolean[];
  rows: string[][];
  highlightRowIndices?: number[];
  footnote: string;
}

export const EDITION_MODE_LABELS: Record<
  EnglishEditionMode,
  { shortLabel: string; fullLabel: string; summary: string }
> = {
  intl_dual: {
    shortLabel: 'International Dual (US + EU)',
    fullLabel: 'Harmonized International Edition — SI Metric + US Customary [in brackets]',
    summary:
      'Recommended for global English edition: SI primary with US Customary equivalents in brackets (e.g., 23 kg [51 lb], 22 cm [8.7 in], 3,400 N [770 lbf]), decimal point (0.82), and side-by-side OSHA/NIOSH/ACGIH + ISO/CEN EN terminology.',
  },
  us_ansi: {
    shortLabel: 'United States (OSHA / NIOSH / ANSI)',
    fullLabel: 'United States Technical Edition — US Customary + SI, ANSI/HFES/ACGIH Style',
    summary:
      'American orthography (Center, Modeling, Analyze, Meter), comma thousands separator (3,400 N), period decimal (0.82), US Customary + SI dual units, and OSHA / NIOSH / ACGIH TLV / ANSI / ASHRAE 55 terminology.',
  },
  eu_iso: {
    shortLabel: 'Europe (EU Directives / CEN EN / ISO)',
    fullLabel: 'European Technical Edition — Strict SI Metric, ISO 80000-1 & CEN Style',
    summary:
      'European/International English orthography (Centre, Modelling, Analyse, Metre), ISO 80000-1 space thousands separator (3 400 N), optional Continental decimal comma (0,82), strict SI units, and EU Directives 89/391/EEC, 90/269/EEC, 2002/44/EC, EN 1005 & ISO 11228/11226 terminology.',
  },
};

// ============================================================================
// EXACT LOOKUP ARRAYS (Verified 1:1 against src/utils/calculations.ts)
// ============================================================================
const RULA_TABLE_A: number[][][] = [
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
];

const RULA_TABLE_B: number[][] = [
  [1, 3, 2, 3, 3, 4, 5, 5, 6, 6, 7, 7],
  [2, 3, 2, 3, 4, 5, 5, 5, 6, 7, 7, 7],
  [3, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 7],
  [5, 5, 5, 6, 6, 7, 7, 7, 7, 7, 8, 8],
  [7, 7, 7, 7, 7, 8, 8, 8, 8, 8, 8, 8],
  [8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9],
];

const RULA_TABLE_C: number[][] = [
  [1, 2, 3, 3, 4, 5, 5],
  [2, 2, 3, 4, 4, 5, 5],
  [3, 3, 3, 4, 4, 5, 6],
  [3, 3, 3, 4, 5, 6, 6],
  [4, 4, 4, 5, 6, 7, 7],
  [4, 4, 5, 6, 6, 7, 7],
  [5, 5, 6, 6, 7, 7, 7],
  [5, 5, 6, 7, 7, 7, 7],
];

const REBA_TABLE_A: number[][][] = [
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
];

const REBA_TABLE_B: number[][][] = [
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
];

const REBA_TABLE_C: number[][] = [
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
];

const OWAS_MATRIX: number[][][][] = [
  [
    [[1, 1, 1], [1, 1, 1], [1, 1, 1], [2, 2, 2], [2, 2, 2], [1, 1, 1], [1, 1, 1]],
    [[1, 1, 1], [1, 1, 1], [1, 1, 1], [2, 2, 2], [2, 2, 2], [1, 1, 1], [1, 1, 1]],
    [[1, 1, 1], [1, 1, 1], [1, 1, 1], [2, 2, 3], [2, 2, 3], [1, 1, 1], [1, 1, 2]],
  ],
  [
    [[2, 2, 3], [2, 2, 3], [2, 2, 3], [3, 3, 3], [3, 3, 3], [2, 2, 2], [2, 3, 3]],
    [[2, 2, 3], [2, 2, 3], [2, 3, 3], [3, 4, 4], [3, 4, 4], [3, 3, 4], [2, 3, 4]],
    [[3, 3, 4], [2, 2, 3], [3, 3, 3], [3, 4, 4], [4, 4, 4], [4, 4, 4], [2, 3, 4]],
  ],
  [
    [[1, 1, 1], [1, 1, 2], [1, 2, 2], [3, 3, 3], [4, 4, 4], [1, 1, 1], [1, 1, 1]],
    [[2, 2, 3], [1, 1, 2], [1, 1, 2], [4, 4, 4], [4, 4, 4], [3, 3, 3], [1, 1, 1]],
    [[2, 2, 3], [1, 1, 2], [2, 3, 3], [4, 4, 4], [4, 4, 4], [4, 4, 4], [1, 1, 1]],
  ],
  [
    [[2, 3, 3], [2, 2, 3], [2, 2, 3], [4, 4, 4], [4, 4, 4], [4, 4, 4], [2, 3, 4]],
    [[3, 3, 4], [2, 3, 4], [3, 3, 4], [4, 4, 4], [4, 4, 4], [4, 4, 4], [2, 3, 4]],
    [[4, 4, 4], [2, 3, 4], [3, 3, 4], [4, 4, 4], [4, 4, 4], [4, 4, 4], [2, 3, 4]],
  ],
];

// ============================================================================
// NUMERIC, UNIT & ORTHOGRAPHY FORMATTERS (US vs. EU vs. International Dual)
// ============================================================================
export function fmtNum(
  val: number,
  decimals: number,
  mode: EnglishEditionMode,
  euComma = false,
): string {
  const fixed = val.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const sign = intPart.startsWith('-') ? '−' : '';
  const absInt = intPart.replace(/^-/, '');
  const thousSep = mode === 'eu_iso' ? ' ' : ',';
  const groupedInt =
    absInt.length >= 4 ? absInt.replace(/\B(?=(\d{3})+(?!\d))/g, thousSep) : absInt;
  if (decimals === 0 || !decPart) return `${sign}${groupedInt}`;
  const decSep = mode === 'eu_iso' && euComma ? ',' : '.';
  return `${sign}${groupedInt}${decSep}${decPart}`;
}

function sp(us: string, eu: string, mode: EnglishEditionMode): string {
  return mode === 'eu_iso' ? eu : us;
}

function massStr(kg: number, lb: number, mode: EnglishEditionMode, decKg = 0, euComma = false): string {
  const k = fmtNum(kg, decKg, mode, euComma);
  const l = fmtNum(lb, decKg > 0 ? 1 : 0, mode, euComma);
  if (mode === 'eu_iso') return `${k} kg`;
  if (mode === 'us_ansi') return `${l} lb (${k} kg)`;
  return `${k} kg [${l} lb]`;
}

function lenCmStr(cm: number, mode: EnglishEditionMode, decIn = 1, euComma = false): string {
  const c = fmtNum(cm, 0, mode, euComma);
  const inches = fmtNum(cm / 2.54, decIn, mode, euComma);
  if (mode === 'eu_iso') return `${c} cm`;
  if (mode === 'us_ansi') return `${inches} in (${c} cm)`;
  return `${c} cm [${inches} in]`;
}

function lenMmStr(mm: number, mode: EnglishEditionMode, decIn = 1, euComma = false): string {
  const m = fmtNum(mm, 0, mode, euComma);
  const inches = fmtNum(mm / 25.4, decIn, mode, euComma);
  if (mode === 'eu_iso') return `${m} mm`;
  if (mode === 'us_ansi') return `${inches} in (${m} mm)`;
  return `${m} mm [${inches} in]`;
}

function forceNStr(n: number, kgf: number, lbf: number, mode: EnglishEditionMode, euComma = false): string {
  const nFmt = fmtNum(n, 0, mode, euComma);
  const kFmt = fmtNum(kgf, 1, mode, euComma);
  const lFmt = fmtNum(lbf, 1, mode, euComma);
  if (mode === 'eu_iso') return `${nFmt} N (${kFmt} kgf)`;
  if (mode === 'us_ansi') return `${lFmt} lbf (${nFmt} N / ${kFmt} kgf)`;
  return `${nFmt} N [${kFmt} kgf · ${lFmt} lbf]`;
}

// ============================================================================
// FIGURE CATALOG ENGLISH TRANSLATOR (ALL 63 PLATES)
// ============================================================================
const CHAPTER_TITLES_EN: Record<number, string> = {
  1: 'Ch. 1 · Fundamentals of Ergonomic Redesign',
  4: 'Ch. 4 · Postural Load Assessment (RULA · REBA · OWAS)',
  5: 'Ch. 5 · Manual Materials Handling (NIOSH · Snook)',
  6: 'Ch. 6 · Upper-Limb Repetitive Tasks (OCRA · JSI)',
  7: 'Ch. 7 · Thermal Environment (Fanger PMV–PPD · WBGT)',
  8: 'Ch. 8 · Mechanical Vibration (WBV ISO 2631 · HAV ISO 5349)',
  9: 'Ch. 9 · Regulatory Screening, Methods & Technical Report',
  10: 'Ch. 10 · Evaluation Cycle & Priority Hierarchy',
  11: 'Ch. 11 · Case Study I: Electrical Utility & Office VDT',
  12: 'Ch. 12 · Case Study II: Healthcare Logistics & Cold Storage',
  13: 'Ch. 13 · Case Study III: Urban Transit Bus Driver Workstation',
};

const FIGURE_TITLES_EN: Record<string, string> = {
  'fig-1-01': 'Ergonomic Risk Reduction Schematic Through Workstation Redesign',
  'fig-4-01': 'Incorrect Oblique Perspective vs. True-Magnitude Orthogonal Angle Measurement',
  'fig-4-02': 'Mid-Sagittal Plane Division Into Right and Left Body Sides',
  'fig-4-03': 'RULA Anatomical Evaluation Groups: Group A (Upper Limb) and Group B (Axial/Legs)',
  'fig-4-04a': 'RULA Base Upper-Arm Posture Scores: Levels 1 to 4 (−20° to >90°)',
  'fig-4-04b': 'RULA Upper-Arm Modifiers: Raised Shoulder (+1) and Abducted Arm (+1)',
  'fig-4-05': 'RULA Upper-Arm Modifier: Leaning Trunk or Supported Arm (−1)',
  'fig-4-06a': 'RULA Base Lower-Arm (Forearm) Posture Scores: 60°–100° (1 pt) vs. Out of Range (2 pts)',
  'fig-4-06b': 'RULA Lower-Arm Supported on Work Surface with Neutral Shoulder Alignment',
  'fig-4-07': 'RULA Lower-Arm Modifier: Working Across Midline or Outside Body Side (+1)',
  'fig-4-08': 'RULA Base Wrist Flexion/Extension Scores: 0° (1 pt), ±15° (2 pts), and >15° (3 pts)',
  'fig-4-09': 'RULA Wrist Modifier: Radial or Ulnar Deviation (+1)',
  'fig-4-10a': 'RULA Forearm Pronation/Supination Mid-Range (1 pt) vs. Extreme Twist (2 pts)',
  'fig-4-10b': 'RULA Extreme Pronation/Supination Detail View (2 pts)',
  'fig-4-12': 'RULA Neck Flexion/Extension Scores: 0°–10° (1 pt), 10°–20° (2 pts), >20° (3 pts), Extension (4 pts)',
  'fig-4-13a': 'RULA Neck Modifier: Cervical Axial Rotation (+1)',
  'fig-4-13b': 'RULA Neck Modifier: Cervical Lateral Bending (+1)',
  'fig-4-15a': 'RULA Trunk Flexion Scores: Upright 0° (1 pt), 0°–20° (2 pts), 20°–60° (3 pts), >60° (4 pts)',
  'fig-4-15b': 'RULA Trunk Modifiers: Axial Twisting (+1) and Lateral Bending (+1)',
  'fig-4-16': 'RULA Leg Support Score: Bilateral Balanced Standing/Sitting (1 pt)',
  'fig-4-17': 'RULA Leg Support Score: Unilateral or Unstable Weight-Bearing (2 pts)',
  'fig-4-18': 'RULA Assessment Method Step-by-Step Application Flowchart',
  'fig-4-19a': 'REBA Trunk Posture Scores: Upright (1 pt), Flexion/Extension Ranges (2 to 4 pts)',
  'fig-4-19b': 'REBA Trunk Modifiers: Axial Twisting or Lateral Side-Bending (+1)',
  'fig-4-20': 'REBA Neck Posture Scores (1–2 pts) and Twisting / Side-Bending Modifier (+1)',
  'fig-4-21a': 'REBA Leg Base Scores: Bilateral Balanced Support (1 pt) vs. Unilateral/Unstable (2 pts)',
  'fig-4-21b': 'REBA Knee Flexion Modifiers: 30°–60° (+1) and >60° Deep Squat/Kneel (+2)',
  'fig-4-22a': 'REBA Upper-Arm Flexion/Extension Scores: Levels 1 to 4 (−20° to >90°)',
  'fig-4-22b': 'REBA Upper-Arm Modifiers: Raised Shoulder (+1), Abducted (+1), Supported (−1)',
  'fig-4-23': 'REBA Lower-Arm (Elbow) Scores: Optimal 60°–100° (1 pt) vs. <60° or >100° (2 pts)',
  'fig-4-24': 'REBA Wrist Flexion/Extension Scores (1–2 pts) and Deviation/Twist Modifier (+1)',
  'fig-4-25': 'REBA Assessment Method Step-by-Step Application Flowchart',
  'fig-4-26': 'OWAS Work-Sampling Observation Log and 4-Digit Posture Coding Example',
  'fig-4-27a': 'OWAS 1st Digit (Back): Code 1 Straight vs. Code 2 Bent Forward/Backward (≥20°)',
  'fig-4-27b': 'OWAS 1st Digit (Back): Code 3 Twisted/Side-Bent vs. Code 4 Bent and Twisted',
  'fig-4-28a': 'OWAS 2nd Digit (Arms): Code 1 Both Below Shoulder Level',
  'fig-4-28b': 'OWAS 2nd Digit (Arms): Code 2 One Arm ≥ Shoulder vs. Code 3 Both Arms ≥ Shoulder',
  'fig-4-29a': 'OWAS 3rd Digit (Legs): Code 1 Sitting and Code 2 Standing on Both Straight Legs',
  'fig-4-29b': 'OWAS 3rd Digit (Legs): Code 3 Standing on One Straight Leg',
  'fig-4-29c': 'OWAS 3rd Digit (Legs): Code 4 Both Knees Bent and Code 5 One Knee Bent',
  'fig-4-29d': 'OWAS 3rd Digit (Legs): Code 6 Kneeling/Crawling and Code 7 Walking/Moving',
  'fig-4-30': 'OWAS 4th Digit Coding: External Load or Force Magnitude Categories (Codes 1–3)',
  'fig-5-01': 'NIOSH Lifting Equation: Ideal Reference Conditions Defining Load Constant (LC = 23 kg [51 lb])',
  'fig-5-02': 'NIOSH Lifting Equation: Horizontal Location (H) and Vertical Location (V) Measurement',
  'fig-5-03': 'NIOSH Lifting Equation: Vertical Travel Distance (D) and Asymmetry Angle (A)',
  'fig-5-04': 'NIOSH Hand-to-Container Coupling Classification (Good, Fair, Poor — Table 5.8)',
  'fig-5-05': 'Psychophysical Manual Materials Handling: Pushing, Pulling, and Carrying Variables (Snook / ISO 11228-2)',
  'fig-6-01': 'OCRA Index Analytical Architecture: Multipliers and Calculation Sequence (ISO 11228-3)',
  'fig-6-02': 'OCRA Dynamic vs. Static Upper-Limb Technical Actions',
  'fig-6-03': 'Strain Index (JSI) Wrist Neutral Alignment vs. Radial and Ulnar Deviations',
  'fig-6-04': 'Strain Index (JSI) Hand and Wrist Posture Categories (Table 6.22)',
  'fig-7-01': 'Fanger Thermal Comfort Method: Environmental and Personal Variables (ISO 7730 / ASHRAE 55)',
  'fig-7-02': 'Analytical Curve Relating Predicted Mean Vote (PMV) and Percentage of Dissatisfied (PPD)',
  'fig-7-03': 'WBGT Heat Stress Monitor: Three-Sensor Arrangement and Equations (ISO 7243 / ACGIH)',
  'fig-8-01': 'Basicentric Orthogonal Coordinate Axes for Whole-Body Vibration (ISO 2631-1 / ANSI S3.18)',
  'fig-8-02': 'Basicentric Orthogonal Coordinate Axes for Hand-Arm Vibration (ISO 5349-1 / ANSI S2.70)',
  'fig-9-01': 'Three-Tier Integration of Regulatory Checklist, Analytical Method, and Ergonomic Report',
  'fig-10-01': 'Continuous Closed-Loop Cycle of Ergonomic Risk Assessment and Intervention',
  'fig-10-02': 'Six Prioritization Decision Criteria and Five-Tier Risk-Factor Hierarchy',
  'fig-11-01': 'Manual Soil Compaction With Iron Tamper: Low vs. Elevated Impact Phases (REBA = 8)',
  'fig-11-02': 'Manual Trench Excavation With Shovel: Stooped Flexion, Axial Twist, and Load',
  'fig-11-03': 'Bucket-Truck Hydraulic Crane Lever Operation: Standing Neck Extension and Sustained Reach',
  'fig-11-04': 'Electrical Metering Cabinet Inspection: Overhead Reach vs. Low Squatting Access',
  'fig-11-05': 'Administrative VDT Office Workstation: Lateral Seated Geometry and Corner Monitor Neck Rotation',
  'fig-11-06': 'ACGIH® Hand Activity Level (HAL) and Normalized Peak Force (NPF) Threshold Chart',
  'fig-12-01': 'Evaluated Healthcare Logistics Sectors Plotted on the PMV–PPD Thermal Curve',
  'fig-12-02': 'Loading Dock Step (+22 cm [8.7 in]) and Delivery Van Cargo Bed (55 cm [21.7 in]) Geometry',
  'fig-12-03': 'Manual Handling Between Warehouse Rack and Pallet vs. Elevated Barcode Scanning Counter',
  'fig-12-04': 'Bin Pick-Up (V1 = 45 cm [17.7 in]) and Cart Placement (V2 = 35 cm [13.8 in]) — NIOSH RNLE',
  'fig-12-05': 'Mail Pouch Sorting Over Rigid Bin Wall vs. Floor-Level Pick-Up Posture',
  'fig-12-06': 'Continuous Vegetable Sorting Conveyor Line: Standing Static Flexion and Repetitive Reach',
  'fig-12-07': 'Manual Sack Lifting and Pouring Into Elevated Stainless-Steel Hopper',
  'fig-12-08': 'Platform Cart Initial Push Force Measurement via Digital Dynamometer',
  'fig-12-09': 'Platform Cart Pull Force Measurement With Backward Walking / Trunk Twist',
  'fig-12-10': 'Cold-Storage Chamber Picking: High Overhead Shelf Reach vs. Low Pallet Insulated Cooler',
  'fig-13-01': 'Transit Bus Driver Suspension Seat: Lateral Dimensions and Adjustment Travel Ranges',
  'fig-13-02': 'Seated Transit Bus Driver Posture With Six Comfort Angle Ranges (A to F — REBA = 2)',
  'fig-13-03': 'Z-Axis Whole-Body Acceleration Spectrum in 1/3-Octave Bands (Unweighted vs. Wk-Weighted)',
  'fig-13-04': 'Triaxial Hand-Arm Acceleration Spectrum on Steering Wheel in 1/3-Octave Bands (2–125 Hz)',
};

function translateOverlayPhrase(raw: string | undefined, mode: EnglishEditionMode, euComma = false): string {
  if (!raw) return '';
  let s = raw;
  const replacements: Array<[RegExp, string]> = [
    [/Incorrecta:\s*Toma oblicua en perspectiva/gi, 'Incorrect: Oblique perspective view'],
    [/Correcta:\s*Plano paralelo \(verdadera magnitud\)/gi, 'Correct: Orthogonal sagittal plane (true angle)'],
    [/Ángulo deformado/gi, 'Foreshortened angle'],
    [/Verdadera magnitud/gi, 'True magnitude'],
    [/α ap\. ≠ real/gi, 'α app. ≠ true'],
    [/α = (\d+)° real/gi, 'α = $1° true'],
    [/El plano óptico no es paralelo al plano del movimiento/gi, 'Optical plane is not parallel to the plane of motion'],
    [/Eje óptico perpendicular al plano sagital del segmento/gi, 'Optical axis perpendicular to the segment sagittal plane'],
    [/Plano Sagital Medio — Evaluación Bilateral/gi, 'Mid-Sagittal Plane — Bilateral Assessment'],
    [/Lado Der\. \/ Izq\./gi, 'Right / Left Side'],
    [/Se evalúa el lado de mayor exigencia o ambos en caso de duda/gi, 'Assess the higher-risk side, or both sides if uncertain'],
    [/Grupo A \(MMSS\) y Grupo B \(Cuello, Tronco, Piernas\)/gi, 'Group A (Upper Limb) & Group B (Neck, Trunk, Legs)'],
    [/Grupos A y B/gi, 'Groups A & B'],
    [/Grupo A: miembro superior · Grupo B: eje axial y soporte podal/gi, 'Group A: upper limb · Group B: axial spine & leg support'],
    [/Ángulos de confort A–F en conducción — REBA = 2/gi, 'Driving Comfort Angles A–F — REBA = 2'],
    [/Ángulos A–F/gi, 'Angles A–F'],
    [/Volante de ómnibus \/ colectivo Ø 430 mm/gi, mode === 'eu_iso' ? 'Transit bus steering wheel Ø 430 mm' : 'Transit bus steering wheel Ø 430 mm [16.9 in]'],
    [/Manos 9 y 3/gi, '9 & 3 o’clock grip'],
    [/Cuerpo ([A-D])/g, 'Body $1'],
    [/(\d+)\s*ptos\b/gi, '$1 pts'],
    [/(\d+)\s*pto\b/gi, '$1 pt'],
    [/\b a \b/g, ' to '],
    [/Hombro elevado/gi, 'Shoulder raised'],
    [/Brazo abducido/gi, 'Arm abducted'],
    [/Brazo apoyado/gi, 'Arm supported'],
    [/Tronco inclinado/gi, 'Trunk leaning'],
    [/Cruza línea media/gi, 'Crosses midline'],
    [/Fuera del cuerpo/gi, 'Outside body'],
    [/Muñeca neutra/gi, 'Neutral wrist'],
    [/Desviación radial\/cubital/gi, 'Radial/ulnar deviation'],
    [/Desviación radial/gi, 'Radial deviation'],
    [/Desviación cubital/gi, 'Ulnar deviation'],
    [/Pronación\/supinación/gi, 'Pronation/supination'],
    [/Giro medio/gi, 'Mid-range twist'],
    [/Giro extremo/gi, 'Extreme twist'],
    [/Rotación cervical/gi, 'Neck rotation'],
    [/Inclinación lateral/gi, 'Lateral bending'],
    [/Extensión cervical/gi, 'Neck extension'],
    [/Flexión de tronco/gi, 'Trunk flexion'],
    [/Torsión axial/gi, 'Axial twist'],
    [/Torsión/gi, 'Twisting'],
    [/Bipedestación equilibrada/gi, 'Balanced bilateral standing'],
    [/Apoyo bilateral/gi, 'Bilateral support'],
    [/Apoyo unilateral/gi, 'Unilateral support'],
    [/Postura inestable/gi, 'Unstable posture'],
    [/Sentado/gi, 'Sitting'],
    [/De pie/gi, 'Standing'],
    [/Arrodillado/gi, 'Kneeling'],
    [/Cuclillas/gi, 'Squatting'],
    [/Caminando/gi, 'Walking'],
    [/Espalda recta/gi, 'Back straight'],
    [/Espalda flexionada/gi, 'Back bent'],
    [/Brazos bajo hombro/gi, 'Arms below shoulder'],
    [/Un brazo ≥ hombro/gi, 'One arm ≥ shoulder'],
    [/Ambos brazos ≥ hombro/gi, 'Both arms ≥ shoulder'],
    [/Condiciones ideales NIOSH/gi, 'Ideal NIOSH RNLE conditions'],
    [/Constante de carga/gi, 'Load Constant'],
    [/Distancia horizontal/gi, 'Horizontal location'],
    [/Altura vertical/gi, 'Vertical location'],
    [/Empuje inicial/gi, 'Initial push'],
    [/Empuje sostenido/gi, 'Sustained push'],
    [/Tracción/gi, 'Pulling'],
    [/Transporte/gi, 'Carrying'],
    [/Eje X/gi, 'X-Axis'],
    [/Eje Y/gi, 'Y-Axis'],
    [/Eje Z/gi, 'Z-Axis'],
    [/Pisón bajo/gi, 'Low tamper phase'],
    [/Pisón elevado/gi, 'Raised tamper phase'],
    [/Zanjeo con pala/gi, 'Shovel trenching'],
    [/Palancas hidrogrúa/gi, 'Crane lever bank'],
    [/Tablero eléctrico/gi, 'Metering cabinet'],
    [/Monitor lateral/gi, 'Aligned monitor'],
    [/Monitor en esquina/gi, 'Corner monitor (neck twist)'],
    [/Estantería/gi, 'Storage rack'],
    [/Mostrador alto/gi, 'High scanner desk'],
    [/Bolsines en suelo/gi, 'Floor-level pouches'],
    [/Cinta transportadora/gi, 'Sorting conveyor'],
    [/Volcado en tolva/gi, 'Hopper sack pouring'],
    [/Cámara frigorífica/gi, 'Cold-storage chamber'],
    [/IL\s*=/g, 'LI ='],
    [/Brazo/gi, 'Upper arm'],
    [/Antebrazo/gi, 'Lower arm'],
    [/Muñeca/gi, 'Wrist'],
    [/Cuello/gi, 'Neck'],
    [/Tronco/gi, 'Trunk'],
    [/Piernas/gi, 'Legs'],
    [/Rodilla/gi, 'Knee'],
    [/Carga/gi, 'Load'],
    [/Fuerza/gi, 'Force'],
    [/Código/gi, 'Code'],
    [/Nivel/gi, 'Level'],
  ];
  for (const [rx, rep] of replacements) {
    s = s.replace(rx, rep);
  }
  if (!(mode === 'eu_iso' && euComma)) {
    s = s.replace(/(\d),(\d)/g, '$1.$2');
  }
  return s;
}

export function translateBookFigureSpecToEnglish(
  spec: BookFigureFileSpec,
  mode: EnglishEditionMode = 'intl_dual',
  euComma = false,
): BookFigureFileSpec {
  const chapterTitle = CHAPTER_TITLES_EN[spec.chapter] || `Chapter ${spec.chapter}`;
  const title = FIGURE_TITLES_EN[spec.id] || translateOverlayPhrase(spec.title, mode, euComma);
  const panels: Panel3DSpec[] | undefined = spec.panels?.map((p) => ({
    ...p,
    subTitle: translateOverlayPhrase(p.subTitle, mode, euComma),
    scoreBadge: p.scoreBadge ? translateOverlayPhrase(p.scoreBadge, mode, euComma) : undefined,
    noteBottom: p.noteBottom ? translateOverlayPhrase(p.noteBottom, mode, euComma) : undefined,
    angleArcs: p.angleArcs?.map((a) => ({
      ...a,
      label: translateOverlayPhrase(a.label, mode, euComma),
    })),
    forceVectors: p.forceVectors?.map((fv) => ({
      ...fv,
      label: translateOverlayPhrase(fv.label, mode, euComma),
    })),
    dimensions: p.dimensions?.map((dm) => ({
      ...dm,
      label: translateOverlayPhrase(dm.label, mode, euComma),
    })),
  }));

  return {
    ...spec,
    chapterTitle,
    title,
    fileName: spec.fileName.replace(/\.png$/i, '_EN.png'),
    panels,
  };
}

// ============================================================================
// COMPLETE TECHNICAL ENGLISH BOOK TABLES BUILDER (34 TABLES ACROSS ALL CHAPTERS)
// ============================================================================
export function buildEnglishBookTablesCatalog(
  mode: EnglishEditionMode = 'intl_dual',
  euComma = false,
): EnglishBookTableSpec[] {
  const n = (val: number, dec = 2) => fmtNum(val, dec, mode, euComma);

  // Build Master Figure Index rows dynamically from all 63 figures
  const masterFigureRows: string[][] = BOOK_FIGURE_CATALOG.map((fig) => {
    const enFig = translateBookFigureSpecToEnglish(fig, mode, euComma);
    const modeLabel =
      fig.renderMode === 'diagram'
        ? '2D Technical Diagram / Table'
        : fig.renderMode === 'real_chart'
          ? '2D Analytical Curve / Spectrum'
          : fig.renderMode === '3d_dual'
            ? `3D Multi-Panel (${fig.panels?.length || 2} Bodies)`
            : '3D Single-Body Posture';
    return [
      `Fig. ${fig.figureNumber}${fig.subPart || ''}`,
      `Ch. ${fig.chapter}`,
      enFig.title,
      modeLabel,
      `${fig.widthPx} × ${fig.heightPx}`,
      enFig.fileName,
    ];
  });

  // Build RULA Table A rows (18 rows = 6 Upper Arm × 3 Lower Arm)
  const rulaTableARows: string[][] = [];
  for (let ua = 1; ua <= 6; ua++) {
    for (let la = 1; la <= 3; la++) {
      const cells = RULA_TABLE_A[ua - 1][la - 1].map(String);
      rulaTableARows.push([`UA = ${ua}`, `LA = ${la}`, ...cells]);
    }
  }

  // Build RULA Table B rows (6 Neck rows × 12 Trunk/Leg columns)
  const rulaTableBRows: string[][] = RULA_TABLE_B.map((row, nIdx) => [
    `Neck = ${nIdx + 1}`,
    ...row.map(String),
  ]);

  // Build RULA Table C rows (8 Score C rows × 7 Score D columns)
  const rulaTableCRows: string[][] = RULA_TABLE_C.map((row, cIdx) => [
    cIdx === 7 ? 'Score C ≥ 8' : `Score C = ${cIdx + 1}`,
    ...row.map(String),
  ]);

  // Build REBA Table A rows (5 Trunk × 3 Neck × 4 Legs -> 15 rows)
  const rebaTableARows: string[][] = [];
  for (let tr = 1; tr <= 5; tr++) {
    for (let nk = 1; nk <= 3; nk++) {
      rebaTableARows.push([
        `Trunk = ${tr}`,
        `Neck = ${nk}`,
        ...REBA_TABLE_A[tr - 1][nk - 1].map(String),
      ]);
    }
  }

  // Build REBA Table B rows (6 Upper Arm × 2 Lower Arm × 3 Wrist -> 12 rows)
  const rebaTableBRows: string[][] = [];
  for (let ua = 1; ua <= 6; ua++) {
    for (let la = 1; la <= 2; la++) {
      rebaTableBRows.push([
        `Upper Arm = ${ua}`,
        la === 1 ? 'LA = 1 (60°–100°)' : 'LA = 2 (<60° / >100°)',
        ...REBA_TABLE_B[ua - 1][la - 1].map(String),
      ]);
    }
  }

  // Build REBA Table C rows (12 × 12)
  const rebaTableCRows: string[][] = REBA_TABLE_C.map((row, aIdx) => [
    `Score A = ${aIdx + 1}`,
    ...row.map(String),
  ]);

  // Build OWAS 252-cell Matrix rows (12 rows = 4 Back × 3 Arms; 7 Leg columns showing L1/L2/L3 triplets)
  const owasMatrixRows: string[][] = [];
  const backShort = [
    '1 · Straight',
    '2 · Bent (≥20°)',
    '3 · Twisted',
    '4 · Bent + Twisted',
  ];
  const armShort = [
    '1 · Both < shoulder',
    '2 · One ≥ shoulder',
    '3 · Both ≥ shoulder',
  ];
  for (let b = 0; b < 4; b++) {
    for (let a = 0; a < 3; a++) {
      const legTriplets = OWAS_MATRIX[b][a].map((loads) => `${loads[0]} / ${loads[1]} / ${loads[2]}`);
      owasMatrixRows.push([backShort[b], armShort[a], ...legTriplets]);
    }
  }

  return [
    // ========================================================================
    // CHAPTER 0 — EDITORIAL CONVENTIONS & MASTER INDEX
    // ========================================================================
    {
      id: 'tbl-00-01',
      tableCode: 'Table 0.1',
      fileNameStem: 'Table_00_01_US_vs_EU_Terminology_Punctuation_Units',
      chapter: 0,
      chapterTitle: 'Editorial Reference & Master Index',
      title:
        'United States vs. European Technical Terminology, Numeric Punctuation, Orthography, and Unit Equivalences',
      relatedFigures: 'All Figures (Ch. 1 & Ch. 4–13)',
      usStandards: 'OSHA 29 CFR 1910 · NIOSH 94-110 · ACGIH® TLV® · ANSI/HFES 100 · ASHRAE 55 · ANSI S3.18 / S2.70',
      euStandards: 'EU Directives 89/391/EEC, 90/269/EEC, 2002/44/EC · EN 1005-1 to -5 · ISO 11226 / 11228 / 7730 / 7243',
      headers: [
        'Ergonomic Domain / Parameter',
        'United States Convention (US)',
        'European Convention (EU / CEN / ISO)',
        'SI ↔ US Customary Exact Conversion',
      ],
      colAligns: ['left', 'left', 'left', 'left'],
      colRatios: [0.22, 0.27, 0.27, 0.24],
      colMono: [false, false, false, true],
      rows: [
        [
          'Decimal & Thousands Punctuation',
          'Period decimal (0.82); comma thousands (3,400 N); en-dash ranges (20°–45°); serial Oxford comma',
          'UK/ISO: period (0.82) or Continental CEN: comma (0,82); thin-space thousands (3 400 N — ISO 80000-1)',
          '3,400 N (US) ≡ 3 400 N (ISO)',
        ],
        [
          'Technical English Orthography',
          'Center, Modeling, Analyze, Meter, Orthopedic, Behavior, Program, Labor',
          'Centre, Modelling, Analyse, Metre, Orthopaedic, Behaviour, Programme, Labour',
          'Harmonized consistently per edition',
        ],
        [
          'Manual Lifting Acronyms (Spanish: PR / IL)',
          'RWL (Recommended Weight Limit) · LI (Lifting Index) · CLI (Composite LI) · LC = 51 lb (23 kg)',
          'RWL / Recommended Mass · LI · Reference Mass mref = 23–25 kg (ISO 11228-1 / EN 1005-2, gender/age stratified)',
          '1 kg = 2.20462 lb · 23 kg = 50.71 lb (51 lb)',
        ],
        [
          'Lumbosacral Compression Criterion',
          'NIOSH Biomechanical Criterion: 3.4 kN (770 lbf) compressive force at L5/S1 intervertebral disc',
          'ISO 11228-1 / EN 1005-2 spinal load threshold aligned with Jäger & Luttmann age/sex limits',
          '1 N = 0.22481 lbf = 0.10197 kgf',
        ],
        [
          'Push / Pull / Carry Psychophysics',
          'Liberty Mutual MMH Equations (formerly Snook & Ciriello, 1991); Design goal ≥ 75% female capability',
          'ISO 11228-2 (Method 1 psychophysical tables & Method 2 biomechanical limits); EN 1005-3',
          '1 kgf = 9.80665 N = 2.20462 lbf',
        ],
        [
          'Upper-Limb Repetitive Work (Spanish: NAM)',
          'ACGIH® Hand Activity Level (HAL, 0–10) + Normalized Peak Force (NPF); Moore & Garg Strain Index (SI / JSI)',
          'OCRA Analytical Index & Checklist (ISO 11228-3 / EN 1005-5): ATA / RTA (Reference Technical Actions)',
          'CF = 30 actions/min (ISO 11228-3)',
        ],
        [
          'Thermal Comfort & Heat Stress (Spanish: TGBH)',
          'ASHRAE Standard 55 (PMV–PPD); ACGIH® TLV® & NIOSH REL for Heat Stress using WBGT (°C or °F)',
          'EN ISO 7730 Categories A/B/C (PMV–PPD); EN ISO 7243 WBGT Screening Reference Values (°C)',
          '°F = (°C × 1.8) + 32 · 1 met = 58.15 W/m²',
        ],
        [
          'Whole-Body & Hand-Arm Vibration',
          'ANSI/ASA S3.18 (WBV) & ANSI/ASA S2.70 (HAV): DEAV = 2.5 m/s², DELV = 5.0 m/s²; ACGIH® TLVs',
          'EU Directive 2002/44/EC + EN ISO 2631-1 & EN ISO 5349-1: WBV EAV = 0.5, ELV = 1.15 m/s²; HAV EAV = 2.5, ELV = 5.0 m/s²',
          '1 m/s² = 3.2808 ft/s² = 0.1020 g',
        ],
        [
          'Linear Anthropometry & Air Velocity',
          'Inches [in] and feet [ft] alongside cm/mm; air speed in fpm (feet per minute) or m/s',
          'Strict millimetres (mm) for furniture/machinery (EN ISO 14738 / ISO 7250) and m/s for air velocity',
          '1 in = 25.4 mm = 2.54 cm · 1 m/s = 196.85 fpm',
        ],
      ],
      highlightRowIndices: [2, 5, 7],
      footnote:
        'Editorial rule: Never translate Spanish "IL" literally as "IL" in English—always use LI (Lifting Index). Likewise, Spanish "NAM" corresponds to ACGIH® HAL (Hand Activity Level), and Spanish "TGBH" corresponds to WBGT (Wet-Bulb Globe Temperature).',
    },
    {
      id: 'tbl-00-02',
      tableCode: 'Table 0.2',
      fileNameStem: 'Table_00_02_Master_Index_63_Motor3D_Figures',
      chapter: 0,
      chapterTitle: 'Editorial Reference & Master Index',
      title: 'Master Index of All 63 Technical Plates in the 3D Figure Studio (Chapters 1 and 4–13)',
      relatedFigures: 'Figs. 1.1 to 13.4 (63 Total Plates: 43 3D Postures + 20 Diagrams/Charts)',
      usStandards: 'OSHA · NIOSH · ACGIH · ANSI/HFES · ASHRAE · SAE',
      euStandards: 'ISO 6385 · ISO 11226 · ISO 11228-1/-2/-3 · ISO 7730 · ISO 7243 · ISO 2631-1 · ISO 5349-1',
      headers: ['Plate #', 'Ch.', 'English Technical Caption', 'Plate Type', 'Size (px)', 'Export File'],
      colAligns: ['center', 'center', 'left', 'left', 'center', 'left'],
      colRatios: [0.10, 0.07, 0.43, 0.18, 0.10, 0.12],
      colMono: [true, true, false, false, true, true],
      rows: masterFigureRows,
      footnote:
        'All 63 plates are included in the downloadable ZIP archive in high-resolution lossless PNG format alongside all 34 editable manuscript tables.',
    },

    // ========================================================================
    // CHAPTER 1 — FUNDAMENTALS OF WORKSTATION REDESIGN
    // ========================================================================
    {
      id: 'tbl-01-01',
      tableCode: 'Table 1.1',
      fileNameStem: 'Table_01_01_Ergonomic_Redesign_Protocol_Ch1',
      chapter: 1,
      chapterTitle: 'Ch. 1 · Fundamentals of Ergonomic Redesign',
      title: `Four-Stage Workstation Redesign & Biomechanical Risk-Reduction Protocol (${sp('Fig. 1.1', 'Fig. 1.1', mode)})`,
      relatedFigures: 'Fig. 1.1',
      usStandards: 'OSHA 3125 Ergonomics Program Management · ANSI/ASSP Z10 · NIOSH Hierarchy of Controls',
      euStandards: 'Framework Directive 89/391/EEC (Art. 6) · EN ISO 6385 · EN 614-1 & EN 614-2',
      headers: [
        'Stage',
        'Phase Designation',
        'Biomechanical State (Demand vs. Capacity)',
        'Required Engineering & Analytical Deliverable',
      ],
      colAligns: ['center', 'left', 'left', 'left'],
      colRatios: [0.09, 0.22, 0.31, 0.38],
      colMono: [true, false, false, false],
      rows: [
        [
          'Stage 1',
          'Baseline Workstation',
          'Task mechanical demand (joint moment M, spinal compression Fc, or cadence) exceeds tissue tolerance threshold',
          'Task decomposition into elementary work cycles, duration profiling, and hazard screening',
        ],
        [
          'Stage 2',
          'Field Measurement & Method',
          'Objective quantification of angles (α), reaches (H, V), forces (F), frequencies, and environmental stressors',
          'Validated risk index computation (LI, RULA, REBA, OWAS, OCRA, JSI, PMV–PPD, WBGT, A(8))',
        ],
        [
          'Stage 3',
          'Engineering Redesign',
          'Reduction of moment arms (H), elimination of vertical steps, mechanical lift assists, and tool handle re-orientation',
          'Prioritized engineering control specification (Hierarchy of Controls: Elimination → Engineering → Administrative)',
        ],
        [
          'Stage 4',
          'Compliant Workstation',
          'Residual biomechanical demand verified strictly below permissible limit (LI ≤ 1.0, OCRA ≤ 2.2, RULA 1–2, REBA 1–3)',
          'Quantitative post-intervention re-evaluation and periodic surveillance audit log',
        ],
      ],
      highlightRowIndices: [2, 3],
      footnote: `Both US (OSHA / NIOSH Hierarchy of Controls) and European (Directive 89/391/EEC Art. 6 & EN 614) frameworks mandate engineering redesign at the source prior to administrative rotation or PPE.`,
    },

    // ========================================================================
    // CHAPTER 4 — POSTURAL LOAD ASSESSMENT (RULA, REBA, OWAS)
    // ========================================================================
    {
      id: 'tbl-04-01',
      tableCode: 'Table 4.1',
      fileNameStem: 'Table_04_01_RULA_Group_A_Upper_Limb_Scoring',
      chapter: 4,
      chapterTitle: 'Ch. 4 · Postural Load Assessment (RULA · REBA · OWAS)',
      title: 'RULA Group A Postural Scoring — Upper Arm, Lower Arm, Wrist, and Forearm Twist (Figs. 4.4–4.10)',
      relatedFigures: 'Figs. 4.1–4.10b',
      usStandards: 'McAtamney & Corlett (1993) · OSHA Ergonomic Assessment Guidelines · ANSI/HFES 100',
      euStandards: 'EN 1005-4 (Evaluation of Working Postures in Machinery) · ISO 11226',
      headers: [
        'Anatomical Segment',
        'Goniometric Range / Posture Criterion',
        'Base Score',
        'Adjustment Modifiers & Clamp Range',
      ],
      colAligns: ['left', 'left', 'center', 'left'],
      colRatios: [0.18, 0.34, 0.11, 0.37],
      colMono: [false, false, true, false],
      rows: [
        [
          'Upper Arm\n(Shoulder)',
          '20° extension to 20° flexion (−20° to +20°)\nExtension > 20° OR flexion 20°–45°\nFlexion 45°–90°\nFlexion > 90° (overhead reach)',
          '1\n2\n3\n4',
          '+1 if shoulder is raised/elevated\n+1 if upper arm is abducted\n−1 if operator leans or arm weight is supported\nFinal Upper Arm range: 1 to 6',
        ],
        [
          'Lower Arm\n(Elbow / Forearm)',
          'Flexion between 60° and 100°\nFlexion < 60° OR flexion > 100°',
          '1\n2',
          '+1 if forearm works across body midline or out to the side of the body\nFinal Lower Arm range: 1 to 3',
        ],
        [
          'Wrist\n(Flexion / Ext.)',
          'Neutral alignment (0°)\nFlexion or extension 1°–15°\nFlexion or extension > 15°',
          '1\n2\n3',
          '+1 if wrist exhibits radial or ulnar deviation\nFinal Wrist range: 1 to 4',
        ],
        [
          'Wrist Twist\n(Pronation / Sup.)',
          'Pronation or supination mainly in mid-range\nWrist at or near extreme end of pronation/supination',
          '1\n2',
          'No additional modifier\nFinal Wrist Twist range: 1 to 2',
        ],
      ],
      footnote:
        'True-magnitude rule (Fig. 4.1): Joint angles must be measured with the optical axis perpendicular to the anatomical plane of motion; evaluate right and left sides separately (Fig. 4.2).',
    },
    {
      id: 'tbl-04-02',
      tableCode: 'Table 4.2',
      fileNameStem: 'Table_04_02_RULA_Group_B_Neck_Trunk_Legs_Scoring',
      chapter: 4,
      chapterTitle: 'Ch. 4 · Postural Load Assessment (RULA · REBA · OWAS)',
      title: 'RULA Group B Postural Scoring — Neck, Trunk, and Leg Support (Figs. 4.12–4.17)',
      relatedFigures: 'Figs. 4.12–4.17',
      usStandards: 'McAtamney & Corlett (1993) · ANSI/HFES 100',
      euStandards: 'ISO 11226 (Static Working Postures) · EN 1005-4',
      headers: [
        'Anatomical Segment',
        'Goniometric Range / Support Criterion',
        'Base Score',
        'Adjustment Modifiers & Clamp Range',
      ],
      colAligns: ['left', 'left', 'center', 'left'],
      colRatios: [0.18, 0.36, 0.11, 0.35],
      colMono: [false, false, true, false],
      rows: [
        [
          'Neck\n(Cervical Spine)',
          'Flexion 0°–10°\nFlexion 10°–20°\nFlexion > 20°\nNeck in extension (< 0°)',
          '1\n2\n3\n4',
          '+1 if neck is axially twisted (rotated)\n+1 if neck is laterally side-bent\nFinal Neck range: 1 to 6',
        ],
        [
          'Trunk\n(Thoracolumbar)',
          'Sitting well supported (hip-trunk ≈ 90°) or standing upright (0°)\nFlexion 1°–20°\nFlexion 20°–60°\nFlexion > 60°',
          '1\n2\n3\n4',
          '+1 if trunk is axially twisted\n+1 if trunk exhibits lateral bending\nFinal Trunk range: 1 to 6',
        ],
        [
          'Legs & Feet',
          'Legs and feet well supported in evenly balanced bilateral posture (standing or seated)\nWeight unevenly distributed, unilateral stance, or unstable support',
          '1\n\n2',
          'No additional modifier\nFinal Legs range: 1 to 2',
        ],
      ],
      footnote:
        'ISO 11226 notes that cervical extension (<0°) and unsupported trunk flexion >60° are unacceptable for sustained static holds; RULA reflects this by assigning maximum base scores of 4.',
    },
    {
      id: 'tbl-04-03',
      tableCode: 'Table 4.3',
      fileNameStem: 'Table_04_03_RULA_Table_A_Lookup_Matrix',
      chapter: 4,
      chapterTitle: 'Ch. 4 · Postural Load Assessment (RULA · REBA · OWAS)',
      title: 'RULA Table A Lookup Matrix — Upper-Limb Posture Score A (Book Table 4.14)',
      relatedFigures: 'Figs. 4.4a–4.10b & Fig. 4.18',
      usStandards: 'McAtamney & Corlett (1993), Applied Ergonomics 24(2), 91–99',
      euStandards: 'EN 1005-4 Annex · ISO 11228-3 Preliminary Postural Screening',
      headers: [
        'Upper Arm',
        'Lower Arm',
        'W1 · T1',
        'W1 · T2',
        'W2 · T1',
        'W2 · T2',
        'W3 · T1',
        'W3 · T2',
        'W4 · T1',
        'W4 · T2',
      ],
      colAligns: ['center', 'center', 'center', 'center', 'center', 'center', 'center', 'center', 'center', 'center'],
      colRatios: [0.12, 0.12, 0.095, 0.095, 0.095, 0.095, 0.095, 0.095, 0.095, 0.095],
      colMono: [true, true, true, true, true, true, true, true, true, true],
      rows: rulaTableARows,
      footnote:
        'Legend: UA = Adjusted Upper Arm (1–6); LA = Adjusted Lower Arm (1–3); W1–W4 = Adjusted Wrist score (1–4); T1 = Mid-range twist (1), T2 = Extreme twist (2). Output is Posture Score A (1–9).',
    },
    {
      id: 'tbl-04-04',
      tableCode: 'Table 4.4',
      fileNameStem: 'Table_04_04_RULA_Table_B_Lookup_Matrix',
      chapter: 4,
      chapterTitle: 'Ch. 4 · Postural Load Assessment (RULA · REBA · OWAS)',
      title: 'RULA Table B Lookup Matrix — Neck, Trunk, and Legs Posture Score B (Book Table 4.15)',
      relatedFigures: 'Figs. 4.12–4.18',
      usStandards: 'McAtamney & Corlett (1993)',
      euStandards: 'ISO 11226 · EN 1005-4',
      headers: [
        'Neck Score',
        'Tr1·L1',
        'Tr1·L2',
        'Tr2·L1',
        'Tr2·L2',
        'Tr3·L1',
        'Tr3·L2',
        'Tr4·L1',
        'Tr4·L2',
        'Tr5·L1',
        'Tr5·L2',
        'Tr6·L1',
        'Tr6·L2',
      ],
      colAligns: [
        'left',
        'center',
        'center',
        'center',
        'center',
        'center',
        'center',
        'center',
        'center',
        'center',
        'center',
        'center',
        'center',
      ],
      colRatios: [0.16, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07],
      colMono: [true, true, true, true, true, true, true, true, true, true, true, true, true],
      rows: rulaTableBRows,
      footnote:
        'Legend: Tr1–Tr6 = Adjusted Trunk score (1–6); L1 = Balanced bilateral leg support (1), L2 = Unilateral or unstable leg support (2). Output is Posture Score B (1–9).',
    },
    {
      id: 'tbl-04-05a',
      tableCode: 'Table 4.5a',
      fileNameStem: 'Table_04_05a_RULA_Muscle_Force_Modifiers_Action_Levels',
      chapter: 4,
      chapterTitle: 'Ch. 4 · Postural Load Assessment (RULA · REBA · OWAS)',
      title: 'RULA Muscle Use Score, Force/Load Score, and Final Action Levels 1–4 (Book Tables 4.16, 4.17 & 4.19)',
      relatedFigures: 'Fig. 4.18',
      usStandards: 'McAtamney & Corlett (1993) · OSHA Ergonomics Screening',
      euStandards: 'EN 1005-4 · ISO 11228-3',
      headers: ['Component / Action Level', 'Threshold / Load Condition', 'Score / Range', 'Engineering Interpretation & Required Action'],
      colAligns: ['left', 'left', 'center', 'left'],
      colRatios: [0.22, 0.33, 0.12, 0.33],
      colMono: [false, false, true, false],
      rows: [
        [
          'Muscle Use Score\n(Added to A & B)',
          'Posture mainly dynamic, <4x/min, not held >1 min\nPosture mainly static (held >1 min) OR repeated >4x/min',
          '0\n+1',
          'Score C = Score A + Muscle + Force\nScore D = Score B + Muscle + Force',
        ],
        [
          'Force / Load Score\n(Added to A & B)',
          `Intermittent load or force < ${massStr(2, 4.4, mode, 0, euComma)}\nIntermittent load ${massStr(2, 4.4, mode, 0, euComma)} to ${massStr(10, 22, mode, 0, euComma)}\nStatic or repeated load ${massStr(2, 4.4, mode, 0, euComma)}–${massStr(10, 22, mode, 0, euComma)}, or intermittent > ${massStr(10, 22, mode, 0, euComma)}\nStatic/repeated load > ${massStr(10, 22, mode, 0, euComma)}, OR shock / rapid force build-up`,
          '0\n+1\n+2\n\n+3',
          'Applies independently to upper limb (Group A → C) and axial/lower body (Group B → D)',
        ],
        [
          'RULA Action Level 1',
          'Grand Score = 1 or 2',
          '1–2 pts',
          'Acceptable posture if it is not maintained or repeated for extended periods',
        ],
        [
          'RULA Action Level 2',
          'Grand Score = 3 or 4',
          '3–4 pts',
          'Further ergonomic investigation is needed and workstation changes may be required',
        ],
        [
          'RULA Action Level 3',
          'Grand Score = 5 or 6',
          '5–6 pts',
          'Investigation and engineering redesign are required soon (short-term CAPA)',
        ],
        [
          'RULA Action Level 4',
          'Grand Score = 7',
          '7 pts',
          'Investigate and implement workstation engineering changes immediately',
        ],
      ],
      highlightRowIndices: [4, 5],
      footnote: `Force thresholds follow McAtamney & Corlett (1993): 2 kgf ≈ 20 N [4.4 lbf] and 10 kgf ≈ 98 N [22 lbf].`,
    },
    {
      id: 'tbl-04-05b',
      tableCode: 'Table 4.5b',
      fileNameStem: 'Table_04_05b_RULA_Table_C_Grand_Score_Matrix',
      chapter: 4,
      chapterTitle: 'Ch. 4 · Postural Load Assessment (RULA · REBA · OWAS)',
      title: 'RULA Table C Grand Score Lookup Matrix (Score C × Score D → Final Score 1–7, Book Table 4.18)',
      relatedFigures: 'Fig. 4.18',
      usStandards: 'McAtamney & Corlett (1993)',
      euStandards: 'EN 1005-4',
      headers: [
        'Wrist & Arm Score C',
        'D = 1',
        'D = 2',
        'D = 3',
        'D = 4',
        'D = 5',
        'D = 6',
        'D ≥ 7',
      ],
      colAligns: ['left', 'center', 'center', 'center', 'center', 'center', 'center', 'center'],
      colRatios: [0.23, 0.11, 0.11, 0.11, 0.11, 0.11, 0.11, 0.11],
      colMono: [true, true, true, true, true, true, true, true],
      rows: rulaTableCRows,
      highlightRowIndices: [6, 7],
      footnote:
        'Any Score C ≥ 8 enters row 8; any Score D ≥ 7 enters column 7. Maximum RULA Grand Score is capped at 7 (Action Level 4).',
    },
    {
      id: 'tbl-04-06',
      tableCode: 'Table 4.6',
      fileNameStem: 'Table_04_06_REBA_Group_A_Trunk_Neck_Legs_Load',
      chapter: 4,
      chapterTitle: 'Ch. 4 · Postural Load Assessment (RULA · REBA · OWAS)',
      title: 'REBA Group A Postural Scoring & Load/Force Modifier (Trunk, Neck, Legs — Figs. 4.19–4.21)',
      relatedFigures: 'Figs. 4.19a–4.21b & Fig. 4.25',
      usStandards: 'Hignett & McAtamney (2000) · NIOSH Healthcare & Field Ergonomics',
      euStandards: 'ISO 11226 · EN 1005-4',
      headers: ['Segment / Factor', 'Postural / Force Criterion', 'Base / Add', 'Adjustment Modifiers & Clamp'],
      colAligns: ['left', 'left', 'center', 'left'],
      colRatios: [0.19, 0.36, 0.11, 0.34],
      colMono: [false, false, true, false],
      rows: [
        [
          'Trunk',
          'Upright neutral (0°)\n0°–20° flexion OR 0°–20° extension\n20°–60° flexion OR > 20° extension\n> 60° flexion',
          '1\n2\n3\n4',
          '+1 if trunk is twisted OR laterally side-bent\nFinal Trunk range: 1 to 5',
        ],
        [
          'Neck',
          '0°–20° flexion\n> 20° flexion OR in extension (< 0°)',
          '1\n2',
          '+1 if neck is twisted OR laterally side-bent\nFinal Neck range: 1 to 3',
        ],
        [
          'Legs',
          'Bilateral weight-bearing, walking, or sitting\nUnilateral weight-bearing, feather weight, or unstable posture',
          '1\n2',
          '+1 if knee flexion is 30°–60°\n+2 if knee flexion is > 60° (not for seated)\nFinal Legs range: 1 to 4',
        ],
        [
          'Load / Force Score\n(Added to Table A)',
          `< ${massStr(5, 11, mode, 0, euComma)}\n${massStr(5, 11, mode, 0, euComma)} to ${massStr(10, 22, mode, 0, euComma)}\n> ${massStr(10, 22, mode, 0, euComma)}`,
          '0\n+1\n+2',
          '+1 if shock or rapid build-up of force is present\nScore A = Table A + Load/Force (clamped 1–12)',
        ],
      ],
      footnote:
        'REBA (Rapid Entire Body Assessment, Hignett & McAtamney, 2000) explicitly captures whole-body lower-limb knee flexion (squatting/kneeling) and shock loads common in construction, utilities, and patient/materials handling.',
    },
    {
      id: 'tbl-04-07',
      tableCode: 'Table 4.7',
      fileNameStem: 'Table_04_07_REBA_Group_B_Upper_Limb_Coupling',
      chapter: 4,
      chapterTitle: 'Ch. 4 · Postural Load Assessment (RULA · REBA · OWAS)',
      title: 'REBA Group B Postural Scoring & Hand-Load Coupling Modifier (Upper Arm, Lower Arm, Wrist — Figs. 4.22–4.24)',
      relatedFigures: 'Figs. 4.22a–4.25',
      usStandards: 'Hignett & McAtamney (2000)',
      euStandards: 'EN 1005-4 · ISO 11226',
      headers: ['Segment / Factor', 'Postural / Coupling Criterion', 'Base / Add', 'Adjustment Modifiers & Clamp'],
      colAligns: ['left', 'left', 'center', 'left'],
      colRatios: [0.19, 0.37, 0.11, 0.33],
      colMono: [false, false, true, false],
      rows: [
        [
          'Upper Arm',
          '20° extension to 20° flexion\n> 20° extension OR 20°–45° flexion\n45°–90° flexion\n> 90° flexion',
          '1\n2\n3\n4',
          '+1 shoulder raised · +1 arm abducted\n−1 leaning, arm supported, or gravity-assisted\nFinal Upper Arm range: 1 to 6',
        ],
        [
          'Lower Arm',
          '60°–100° elbow flexion\n< 60° flexion OR > 100° flexion',
          '1\n2',
          'No additional modifier\nFinal Lower Arm range: 1 to 2',
        ],
        [
          'Wrist',
          '0°–15° flexion or extension\n> 15° flexion or extension',
          '1\n2',
          '+1 if wrist is radially/ulnarly deviated OR twisted\nFinal Wrist range: 1 to 3',
        ],
        [
          'Coupling Score\n(Added to Table B)',
          'Good: well-fitting handle and mid-range power grip\nFair: acceptable handhold or grip via other body part\nPoor: handhold not acceptable although possible\nUnacceptable: awkward, unsafe grip, no handles',
          '0\n+1\n+2\n+3',
          'Score B = Table B + Coupling Score (clamped 1–12)',
        ],
      ],
      footnote:
        'Evaluate the higher-risk limb, or evaluate both right and left upper limbs independently when asymmetry exists.',
    },
    {
      id: 'tbl-04-08a',
      tableCode: 'Table 4.8a',
      fileNameStem: 'Table_04_08a_REBA_Table_A_and_Table_B_Matrices',
      chapter: 4,
      chapterTitle: 'Ch. 4 · Postural Load Assessment (RULA · REBA · OWAS)',
      title: 'REBA Table A Lookup Matrix (Trunk × Neck × Legs, Book Table 4.27) and Table B Summary (Book Table 4.33)',
      relatedFigures: 'Fig. 4.25',
      usStandards: 'Hignett & McAtamney (2000), Applied Ergonomics 31(2), 201–205',
      euStandards: 'EN 1005-4 · ISO 11226',
      headers: ['Trunk Score', 'Neck Score', 'Legs = 1', 'Legs = 2', 'Legs = 3', 'Legs = 4'],
      colAligns: ['center', 'center', 'center', 'center', 'center', 'center'],
      colRatios: [0.20, 0.20, 0.15, 0.15, 0.15, 0.15],
      colMono: [true, true, true, true, true, true],
      rows: rebaTableARows,
      footnote:
        'REBA Table A output ranges from 1 to 9 prior to adding the Load/Force score (0 to +3). See Table 4.8b for REBA Table B.',
    },
    {
      id: 'tbl-04-08b',
      tableCode: 'Table 4.8b',
      fileNameStem: 'Table_04_08b_REBA_Table_B_Lookup_Matrix',
      chapter: 4,
      chapterTitle: 'Ch. 4 · Postural Load Assessment (RULA · REBA · OWAS)',
      title: 'REBA Table B Lookup Matrix — Upper Arm × Lower Arm × Wrist (Book Table 4.33)',
      relatedFigures: 'Figs. 4.22a–4.25',
      usStandards: 'Hignett & McAtamney (2000)',
      euStandards: 'EN 1005-4',
      headers: ['Upper Arm Score', 'Lower Arm Score', 'Wrist = 1', 'Wrist = 2', 'Wrist = 3'],
      colAligns: ['center', 'left', 'center', 'center', 'center'],
      colRatios: [0.22, 0.33, 0.15, 0.15, 0.15],
      colMono: [true, true, true, true, true],
      rows: rebaTableBRows,
      footnote:
        'REBA Table B output ranges from 1 to 9 prior to adding the Coupling Score (0 to +3).',
    },
    {
      id: 'tbl-04-09',
      tableCode: 'Table 4.9',
      fileNameStem: 'Table_04_09_REBA_Table_C_Matrix_and_Action_Levels',
      chapter: 4,
      chapterTitle: 'Ch. 4 · Postural Load Assessment (RULA · REBA · OWAS)',
      title: 'REBA Table C Combined Lookup Matrix (12 × 12 — Book Table 4.37), Activity Score & Action Levels 0–4',
      relatedFigures: 'Fig. 4.25',
      usStandards: 'Hignett & McAtamney (2000)',
      euStandards: 'EN 1005-4 · ISO 11226',
      headers: [
        'Score A \\ B',
        'B1',
        'B2',
        'B3',
        'B4',
        'B5',
        'B6',
        'B7',
        'B8',
        'B9',
        'B10',
        'B11',
        'B12',
      ],
      colAligns: [
        'left',
        'center',
        'center',
        'center',
        'center',
        'center',
        'center',
        'center',
        'center',
        'center',
        'center',
        'center',
        'center',
      ],
      colRatios: [0.16, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07],
      colMono: [true, true, true, true, true, true, true, true, true, true, true, true, true],
      rows: rebaTableCRows,
      highlightRowIndices: [9, 10, 11],
      footnote:
        'Final REBA Score = Table C + Activity Score (+1 static >1 min; +1 repeated >4x/min; +1 rapid large-range posture changes; max 15). Action Levels: Level 0 (1 pt: Negligible) · Level 1 (2–3 pts: Low, may be necessary) · Level 2 (4–7 pts: Medium, necessary) · Level 3 (8–10 pts: High, necessary soon) · Level 4 (11–15 pts: Very High, necessary NOW).',
    },
    {
      id: 'tbl-04-10',
      tableCode: 'Table 4.10',
      fileNameStem: 'Table_04_10_OWAS_4Digit_Posture_Load_Coding',
      chapter: 4,
      chapterTitle: 'Ch. 4 · Postural Load Assessment (RULA · REBA · OWAS)',
      title: 'OWAS Four-Digit Posture & External Load Coding System (Karhu et al., 1977 — Figs. 4.27–4.30)',
      relatedFigures: 'Figs. 4.26–4.30',
      usStandards: 'Karhu, Kansi & Kuorinka (1977) · Louhevaara & Suurnäkki (NIOSH / FIOH Manual)',
      euStandards: 'Finnish Institute of Occupational Health (FIOH) OWAS · ISO 11226',
      headers: ['Digit Position', 'Body Region / Factor', 'Code', 'Operational Definition & Angular / Mass Threshold'],
      colAligns: ['center', 'left', 'center', 'left'],
      colRatios: [0.14, 0.20, 0.10, 0.56],
      colMono: [true, false, true, false],
      rows: [
        [
          '1st Digit',
          'Back (Trunk)',
          '1\n2\n3\n4',
          'Straight upright (< 20° flexion/lateral)\nBent forward or backward (≥ 20° sagittal flexion/extension)\nTwisted or laterally side-bent (≥ 20°)\nSimultaneously bent AND twisted / laterally bent',
        ],
        [
          '2nd Digit',
          'Upper Limbs (Arms)',
          '1\n2\n3',
          'Both arms below shoulder level\nOne arm at or above shoulder level\nBoth arms at or above shoulder level',
        ],
        [
          '3rd Digit',
          'Lower Limbs (Legs)',
          '1\n2\n3\n4\n5\n6\n7',
          'Sitting (hips/thighs supported on seat)\nStanding with weight on both straight legs (knees ≤ 30°)\nStanding with weight on one straight leg\nStanding or squatting with both knees bent (> 30°)\nStanding or squatting with one knee bent (> 30°)\nKneeling on one or both knees\nWalking or moving horizontally',
        ],
        [
          '4th Digit',
          'External Load / Force',
          '1\n2\n3',
          `Load or required force Q ≤ ${massStr(10, 22, mode, 0, euComma)}\n${massStr(10, 22, mode, 0, euComma)} < Q ≤ ${massStr(20, 44, mode, 0, euComma)}\nLoad or required force Q > ${massStr(20, 44, mode, 0, euComma)}`,
        ],
      ],
      footnote:
        'Recommended OWAS work-sampling interval: fixed 30 s to 60 s intervals yielding N ≥ 100 observations per representative shift cycle for narrow 95% confidence bounds.',
    },
    {
      id: 'tbl-04-11',
      tableCode: 'Table 4.11',
      fileNameStem: 'Table_04_11_OWAS_252_Action_Category_Matrix',
      chapter: 4,
      chapterTitle: 'Ch. 4 · Postural Load Assessment (RULA · REBA · OWAS)',
      title: 'OWAS Complete 252-Combination Action Category Matrix (Back 1–4 × Arms 1–3 × Legs 1–7 × Load 1/2/3 — Book Table 4.44)',
      relatedFigures: 'Figs. 4.26–4.30',
      usStandards: 'Karhu et al. (1977) · Louhevaara & Suurnäkki (1992)',
      euStandards: 'FIOH OWAS Standard Matrix · EN 1005-4',
      headers: [
        'Back (1–4)',
        'Arms (1–3)',
        'Leg 1\n(L1/2/3)',
        'Leg 2\n(L1/2/3)',
        'Leg 3\n(L1/2/3)',
        'Leg 4\n(L1/2/3)',
        'Leg 5\n(L1/2/3)',
        'Leg 6\n(L1/2/3)',
        'Leg 7\n(L1/2/3)',
      ],
      colAligns: ['left', 'left', 'center', 'center', 'center', 'center', 'center', 'center', 'center'],
      colRatios: [0.16, 0.17, 0.095, 0.095, 0.095, 0.095, 0.095, 0.095, 0.10],
      colMono: [false, false, true, true, true, true, true, true, true],
      rows: owasMatrixRows,
      highlightRowIndices: [9, 10, 11],
      footnote:
        'Each cell lists the OWAS Action Category (1 to 4) for Load Codes 1 / 2 / 3 (≤10 kg / 10–20 kg / >20 kg). Category 1: No action required · Category 2: Corrective action in near future · Category 3: Corrective action as soon as possible · Category 4: Corrective action IMMEDIATELY.',
    },
    {
      id: 'tbl-04-12',
      tableCode: 'Table 4.12',
      fileNameStem: 'Table_04_12_OWAS_Observation_Log_Example',
      chapter: 4,
      chapterTitle: 'Ch. 4 · Postural Load Assessment (RULA · REBA · OWAS)',
      title: 'OWAS Work-Sampling Observation Log & Relative Frequency Distribution Example (Book Table 4.45 · Fig. 4.26)',
      relatedFigures: 'Fig. 4.26',
      usStandards: 'Louhevaara & Suurnäkki (1992)',
      euStandards: 'FIOH OWAS Protocol · ISO 11226',
      headers: [
        'Observed Task Phase / Posture',
        '4-Digit OWAS Code',
        'Observations (N)',
        'Relative Freq. (%)',
        'OWAS Action Category & Urgency',
      ],
      colAligns: ['left', 'center', 'center', 'center', 'left'],
      colRatios: [0.29, 0.16, 0.13, 0.14, 0.28],
      colMono: [false, true, true, true, false],
      rows: [
        [
          `Pick up heavy sack from floor (> ${massStr(20, 44, mode, 0, euComma)})`,
          '2 - 2 - 4 - 3',
          '30',
          '30%',
          'Category 4 — Immediate engineering redesign required',
        ],
        [
          `Deposit sack onto platform (> ${massStr(20, 44, mode, 0, euComma)})`,
          '3 - 1 - 2 - 3',
          '35',
          '35%',
          'Category 3 — Corrective redesign required soon',
        ],
        ['Walk unloaded between stations', '1 - 1 - 7 - 1', '25', '25%', 'Category 1 — Normal posture, no action required'],
        ['Standing upright awaiting material', '1 - 1 - 2 - 1', '10', '10%', 'Category 1 — Normal posture, no action required'],
        [
          'Total Sampled Work Cycle',
          '4 Postural States',
          '100',
          '100%',
          '65% of cycle in Categories 3–4 (Scissor lift table + vacuum hoist indicated)',
        ],
      ],
      highlightRowIndices: [0, 4],
      footnote:
        'Additionally, OWAS evaluates per-segment relative time exposure (e.g., bent back ≥30% of shift or squatting ≥10% of shift triggers Category 2–3 fatigue controls even at low loads).',
    },

    // ========================================================================
    // CHAPTER 5 — MANUAL MATERIALS HANDLING (NIOSH & SNOOK)
    // ========================================================================
    {
      id: 'tbl-05-01',
      tableCode: 'Table 5.1',
      fileNameStem: 'Table_05_01_NIOSH_RNLE_Multipliers_US_vs_EU',
      chapter: 5,
      chapterTitle: 'Ch. 5 · Manual Materials Handling (NIOSH · Snook)',
      title: 'Revised NIOSH Lifting Equation (RNLE) Multipliers, US vs. EU Reference Mass, and Risk Thresholds (Figs. 5.1–5.3)',
      relatedFigures: 'Figs. 5.1, 5.2 & 5.3',
      usStandards: 'Waters, Putz-Anderson, Garg & Fine (1993) · DHHS (NIOSH) Pub. No. 94-110 · ACGIH® Lifting TLV®',
      euStandards: 'EU Directive 90/269/EEC · EN 1005-2 · ISO 11228-1:2021',
      headers: [
        'Parameter / Multiplier',
        'SI Metric Formula (EU / International)',
        'US Customary Formula (Inches / Pounds)',
        'Reference Value (1.00) & Cut-Off Limits',
      ],
      colAligns: ['left', 'left', 'left', 'left'],
      colRatios: [0.21, 0.27, 0.26, 0.26],
      colMono: [false, true, true, false],
      rows: [
        [
          'Load Constant (LC) /\nReference Mass (mref)',
          `LC = ${n(23, 0)} kg (NIOSH)\nmref = 23–25 kg (ISO 11228-1 / EN 1005-2)`,
          'LC = 51 lb',
          'Biomechanical limit: 3.4 kN [770 lbf] L5/S1 compression; ≥75% F / 99% M protection',
        ],
        [
          'Horizontal Multiplier\n(HM)',
          `HM = ${n(25, 0)} / H   (H in cm)`,
          'HM = 10 / H   (H in inches)',
          `Ideal H ≤ ${lenCmStr(25, mode, 0, euComma)} (HM = ${n(1, 2)}); if H > ${lenCmStr(63, mode, 0, euComma)}, HM = 0`,
        ],
        [
          'Vertical Multiplier\n(VM)',
          `VM = 1 − ${n(0.003, 3)} · |V − 75|   (V in cm)`,
          `VM = 1 − ${n(0.0075, 4)} · |V − 30|   (V in in)`,
          `Knuckle height V = ${lenCmStr(75, mode, 0, euComma)} (VM = ${n(1, 2)}); if V > ${lenCmStr(175, mode, 0, euComma)}, VM = 0`,
        ],
        [
          'Distance Multiplier\n(DM)',
          `DM = ${n(0.82, 2)} + ${n(4.5, 1)} / D   (D = |V2 − V1| cm)`,
          `DM = ${n(0.82, 2)} + ${n(1.8, 1)} / D   (D in inches)`,
          `If D < ${lenCmStr(25, mode, 0, euComma)}, set D = ${lenCmStr(25, mode, 0, euComma)} (DM = ${n(1, 2)}); if D > ${lenCmStr(175, mode, 0, euComma)}, DM = 0`,
        ],
        [
          'Asymmetry Multiplier\n(AM)',
          `AM = 1 − ${n(0.0032, 4)} · A   (A in deg)`,
          `AM = 1 − ${n(0.0032, 4)} · A   (A in deg)`,
          'Mid-sagittal plane A = 0° (AM = 1.00); if A > 135°, AM = 0',
        ],
        [
          'Frequency (FM) &\nCoupling (CM)',
          'Tabular FM(F, V, Duration) · CM(Grip, V)',
          'Tabular FM(F, V, Duration) · CM(Grip, V)',
          'F in lifts/min (≤0.2 to 15/min) for Short (≤1 h), Moderate (1–2 h), or Long (2–8 h)',
        ],
        [
          'RWL & Lifting Index\n(LI = Load / RWL)',
          `RWL = LC × HM × VM × DM × AM × FM × CM\nLI ≤ ${n(1, 1)} Acceptable · ${n(1, 1)}–${n(3, 1)} Moderate · > ${n(3, 1)} High`,
          'RWL = 51 lb × HM × VM × DM × AM × FM × CM\nLI = Load[lb] / RWL[lb]',
          'ISO 11228-1 granular tiers: ≤1.0 Very Low · 1.01–1.5 Low · 1.51–2.0 Moderate · 2.01–3.0 High · >3.0 Very High',
        ],
      ],
      highlightRowIndices: [0, 6],
      footnote:
        'Evaluate both Origin and Destination whenever significant control is required at placement; the governing RWL is min(RWL_origin, RWL_dest). Multi-task lifting uses the Composite Lifting Index (CLI).',
    },
    {
      id: 'tbl-05-02',
      tableCode: 'Table 5.2',
      fileNameStem: 'Table_05_02_NIOSH_Coupling_Classification_CM',
      chapter: 5,
      chapterTitle: 'Ch. 5 · Manual Materials Handling (NIOSH · Snook)',
      title: 'NIOSH Hand-to-Container Coupling Classification and Coupling Multiplier CM (Book Table 5.8 · Fig. 5.4)',
      relatedFigures: 'Fig. 5.4',
      usStandards: 'NIOSH Pub. No. 94-110 (Tables 6 & 7)',
      euStandards: 'ISO 11228-1 Annex C · EN 1005-2',
      headers: [
        'Coupling Quality',
        'Container & Handle / Cut-Out Criteria',
        `CM for V < ${lenCmStr(75, mode, 0, euComma)}`,
        `CM for V ≥ ${lenCmStr(75, mode, 0, euComma)}`,
      ],
      colAligns: ['left', 'left', 'center', 'center'],
      colRatios: [0.16, 0.50, 0.17, 0.17],
      colMono: [false, false, true, true],
      rows: [
        [
          '1. Good',
          `Optimal container length ≤ ${lenCmStr(40, mode, 1, euComma)} and height ≤ ${lenCmStr(30, mode, 1, euComma)} with cylindrical handles (Ø ${lenMmStr(19, mode, 2, euComma)}–${lenMmStr(38, mode, 2, euComma)}) or smooth hand-hold cut-outs permitting full power wrap grip and neutral wrist (0°).`,
          n(1.0, 2),
          n(1.0, 2),
        ],
        [
          '2. Fair',
          'Container of optimal design with non-optimal handles/cut-outs, OR container without handles where fingers can be flexed ~90° underneath the base without excessive wrist deviation.',
          n(0.95, 2),
          n(1.0, 2),
        ],
        [
          '3. Poor',
          'Containers of non-optimal bulky design, loose/shifting center of mass, sagging bags, sharp edges, or awkward objects preventing ~90° finger flexion.',
          n(0.9, 2),
          n(0.9, 2),
        ],
      ],
      footnote:
        'Optimal handle clearance requires ≥ 50 mm [2.0 in] knuckle clearance and smooth, non-slip surfaces.',
    },
    {
      id: 'tbl-05-03',
      tableCode: 'Table 5.3',
      fileNameStem: 'Table_05_03_Snook_LibertyMutual_Push_Pull_Carry',
      chapter: 5,
      chapterTitle: 'Ch. 5 · Manual Materials Handling (NIOSH · Snook)',
      title: 'Psychophysical Push, Pull, and Carry Variables & Risk Criteria — Snook / Liberty Mutual & ISO 11228-2 (Fig. 5.5)',
      relatedFigures: 'Fig. 5.5, Fig. 12.8 & Fig. 12.9',
      usStandards: 'Snook & Ciriello (1991), Ergonomics 34(9) · Potvin et al. (2021) Liberty Mutual MMH Equations',
      euStandards: 'ISO 11228-2:2007 / Amd 1:2022 (Pushing & Pulling) · ISO 11228-1 (Carrying) · EN 1005-3',
      headers: [
        'MMH Task Mode',
        'Measured Field Inputs',
        'Force / Mass Metric',
        'Acceptable Design Criterion (US & EU)',
      ],
      colAligns: ['left', 'left', 'left', 'left'],
      colRatios: [0.17, 0.31, 0.24, 0.28],
      colMono: [false, false, true, false],
      rows: [
        [
          'Initial Push / Pull\n(Breakaway Peak)',
          `Handle height V (${lenCmStr(57, mode, 1, euComma)}–${lenCmStr(144, mode, 1, euComma)}), travel distance (${fmtNum(2.1, 1, mode, euComma)}–${fmtNum(61, 0, mode, euComma)} m), frequency, floor friction μ`,
          'Peak force Fi measured via calibrated inline dynamometer (N [kgf / lbf])',
          'Fi ≤ MAL for ≥75% (optimal ≥90%) of female industrial population; Risk Ratio RR = Fi / MAL ≤ 1.00',
        ],
        [
          'Sustained Push / Pull\n(Rolling Motion)',
          'Same geometry; continuous average rolling force measured at steady walking speed (~1.0 m/s)',
          'Mean sustained force Fs over travel distance (N [kgf / lbf])',
          'Fs ≤ Sustained MAL (90th %ile female protection target in ISO 11228-2 Method 1); RR = Fs / MAL ≤ 1.00',
        ],
        [
          'Two-Handed Carrying',
          `Vertical hand height (${lenCmStr(79, mode, 1, euComma)}–${lenCmStr(111, mode, 1, euComma)}), carry distance (${fmtNum(2.1, 1, mode, euComma)}–${fmtNum(8.5, 1, mode, euComma)} m), cadence`,
          'Carried load mass M (kg [lb]) and cumulative mass per shift (kg/8h)',
          `M ≤ Psychophysical MAL; ISO 11228-1 cumulative carry limit ≤ ${fmtNum(6000, 0, mode, euComma)}–${fmtNum(10000, 0, mode, euComma)} kg/8h depending on distance`,
        ],
      ],
      footnote:
        'Dynamic push is ergonomically preferred over backward pull because forward push leverages body weight, maintains visual line-of-sight, and eliminates thoracolumbar axial torsion.',
    },

    // ========================================================================
    // CHAPTER 6 — UPPER-LIMB REPETITIVE WORK (OCRA & STRAIN INDEX)
    // ========================================================================
    {
      id: 'tbl-06-01',
      tableCode: 'Table 6.1',
      fileNameStem: 'Table_06_01_OCRA_Multipliers_and_Risk_Classification',
      chapter: 6,
      chapterTitle: 'Ch. 6 · Upper-Limb Repetitive Tasks (OCRA · JSI)',
      title: 'OCRA Analytical Index Multipliers, Reference Technical Actions (RTA), and Risk Zones (Book Tables 6.3–6.10 · Figs. 6.1–6.2)',
      relatedFigures: 'Figs. 6.1 & 6.2',
      usStandards: 'Colombini, Occhipinti & Grieco (2002) · Comparable to ACGIH® HAL + Strain Index',
      euStandards: 'ISO 11228-3:2007 · EN 1005-5:2007 (Risk Assessment of High-Frequency Repetitive Handling)',
      headers: [
        'Factor / Risk Zone',
        'Symbol (EU / Book)',
        'Multiplier / Index Range',
        'Biomechanical Definition & Criterion',
      ],
      colAligns: ['left', 'center', 'center', 'left'],
      colRatios: [0.22, 0.16, 0.18, 0.44],
      colMono: [false, true, true, false],
      rows: [
        [
          'Frequency Constant',
          'CF (k)',
          '30 actions/min',
          'Maximal sustainable technical action rate under ideal neutral conditions',
        ],
        [
          'Force Multiplier',
          'FoM (Fm)',
          `${n(0.01, 2)} – ${n(1.0, 2)}`,
          'Weighted time-average perceived exertion on Borg CR-10 scale (FoM = 1.00 when Borg ≤ 0.5)',
        ],
        [
          'Posture & Grip Multiplier',
          'PoM (Fp)',
          `${n(0.1, 2)} – ${n(1.0, 2)}`,
          'Lowest multiplier among shoulder (>80° flex/abd), elbow (>60° sup/pron), wrist (>45°), and pinch/hook grip + stereotypy',
        ],
        [
          'Complementary Factors',
          'AdM (Fa)',
          `${n(0.8, 2)} – ${n(1.0, 2)}`,
          'HAV tool vibration, cold contact (<0 °C), localized compression, counter-shocks, or restrictive gloves',
        ],
        [
          'Recovery & Duration',
          'RcM (Ft) · DuM (Fc)',
          `RcM: ${n(0.1, 2)}–${n(1.0, 2)}\nDuM: ${n(0.5, 2)}–${n(2.0, 2)}`,
          'RcM penalizes each work hour lacking ≥10 min recovery (5:1 ratio); DuM adjusts for net repetitive shift minutes t (420–480 min → 1.00)',
        ],
        [
          'OCRA Index — Green',
          'OCRA = ATA / RTA',
          `≤ ${n(2.2, 1)}`,
          'Optimal / Acceptable Risk (OCRA Checklist equivalent ≤ 7.5): No intervention required',
        ],
        [
          'OCRA Index — Yellow',
          'OCRA = ATA / RTA',
          `${n(2.3, 1)} – ${n(3.5, 1)}`,
          'Uncertain / Very Low Borderline Risk (Checklist 7.6–11.0): Health surveillance & workstation review',
        ],
        [
          'OCRA Index — Red / Purple',
          'OCRA = ATA / RTA',
          `${n(3.6, 1)}–${n(4.5, 1)} Mod.\n${n(4.6, 1)}–${n(9.0, 1)} Med.\n> ${n(9.0, 1)} High`,
          'Unacceptable Risk (Checklist > 11.0; High > 22.5): Engineering redesign of cadence, force, posture, and recovery breaks required',
        ],
      ],
      highlightRowIndices: [5, 7],
      footnote:
        'Dynamic technical actions count discrete cycle grasps/placements; static holds ≥ 5 s continuous count as ATA_static = (4.5 × holding_seconds) / 60 (Fig. 6.2).',
    },
    {
      id: 'tbl-06-02',
      tableCode: 'Table 6.2',
      fileNameStem: 'Table_06_02_Moore_Garg_Strain_Index_JSI',
      chapter: 6,
      chapterTitle: 'Ch. 6 · Upper-Limb Repetitive Tasks (OCRA · JSI)',
      title: 'Moore & Garg Strain Index (JSI / SI) Six Task Multipliers & Risk Thresholds (Book Table 6.22 · Figs. 6.3–6.4)',
      relatedFigures: 'Figs. 6.3 & 6.4',
      usStandards: 'Moore & Garg (1995), AIHA Journal 56(5), 443–458 · Garg, Moore & Kapellusch (2017) Revised SI',
      euStandards: 'ISO 11228-3 Annex A (Recognized Distal Upper-Extremity Assessment Method)',
      headers: [
        'Task Variable',
        'Rating 1\n(Light / Optimal)',
        'Rating 2\n(Somewhat Hard)',
        'Rating 3\n(Hard / Fair)',
        'Rating 4\n(Very Hard / Bad)',
        'Rating 5\n(Near Maximal)',
      ],
      colAligns: ['left', 'center', 'center', 'center', 'center', 'center'],
      colRatios: [0.25, 0.15, 0.15, 0.15, 0.15, 0.15],
      colMono: [false, true, true, true, true, true],
      rows: [
        [
          '1. Intensity of Exertion (IE)\n[%MVC / Borg CR-10]',
          `<10% · Borg ≤2\nIE = ${n(1.0, 1)}`,
          `10–29% · Borg 3\nIE = ${n(3.0, 1)}`,
          `30–49% · Borg 4–5\nIE = ${n(6.0, 1)}`,
          `50–79% · Borg 6–7\nIE = ${n(9.0, 1)}`,
          `≥80% · Borg >7\nIE = ${n(13.0, 1)}`,
        ],
        [
          '2. Duration of Exertion (DE)\n[% of Cycle Time]',
          `<10%\nDE = ${n(0.5, 1)}`,
          `10–29%\nDE = ${n(1.0, 1)}`,
          `30–49%\nDE = ${n(1.5, 1)}`,
          `50–79%\nDE = ${n(2.0, 1)}`,
          `≥80%\nDE = ${n(3.0, 1)}`,
        ],
        [
          '3. Efforts per Minute (EM)\n[Exertions / min]',
          `<4 / min\nEM = ${n(0.5, 1)}`,
          `4–8 / min\nEM = ${n(1.0, 1)}`,
          `9–14 / min\nEM = ${n(1.5, 1)}`,
          `15–19 / min\nEM = ${n(2.0, 1)}`,
          `≥20 / min\nEM = ${n(3.0, 1)}`,
        ],
        [
          '4. Hand/Wrist Posture (HWP)\n[Fig. 6.4 — Neutral 0°]',
          `Very Good (≈0°)\nHWP = ${n(1.0, 1)}`,
          `Good (10°–15°)\nHWP = ${n(1.0, 1)}`,
          `Fair (16°–30°)\nHWP = ${n(1.5, 1)}`,
          `Bad (31°–45°)\nHWP = ${n(2.0, 1)}`,
          `Very Bad (>45°+dev)\nHWP = ${n(3.0, 1)}`,
        ],
        [
          '5. Speed of Work (SW)',
          `Very Slow\nSW = ${n(1.0, 1)}`,
          `Slow\nSW = ${n(1.0, 1)}`,
          `Fair / Normal\nSW = ${n(1.0, 1)}`,
          `Fast\nSW = ${n(1.5, 1)}`,
          `Very Fast\nSW = ${n(2.0, 1)}`,
        ],
        [
          '6. Duration per Day (DD)\n[Hours / shift]',
          `<1 h\nDD = ${n(0.25, 2)}`,
          `1–2 h\nDD = ${n(0.5, 2)}`,
          `2–4 h\nDD = ${n(0.75, 2)}`,
          `4–8 h\nDD = ${n(1.0, 2)}`,
          `>8 h\nDD = ${n(1.5, 2)}`,
        ],
      ],
      highlightRowIndices: [0, 3],
      footnote: `JSI = IE × DE × EM × HWP × SW × DD. Decision thresholds: JSI < ${n(3.0, 1)} Safe · ${n(3.0, 1)} ≤ JSI ≤ ${n(7.0, 1)} Uncertain / Caution Zone · JSI > ${n(7.0, 1)} Hazardous for distal upper-extremity MSDs (carpal tunnel syndrome, epicondylitis, de Quervain tenosynovitis).`,
    },

    // ========================================================================
    // CHAPTER 7 — THERMAL ENVIRONMENT (FANGER PMV-PPD & WBGT)
    // ========================================================================
    {
      id: 'tbl-07-01',
      tableCode: 'Table 7.1',
      fileNameStem: 'Table_07_01_Fanger_PMV_PPD_Variables_Comfort_Categories',
      chapter: 7,
      chapterTitle: 'Ch. 7 · Thermal Environment (Fanger PMV–PPD · WBGT)',
      title: 'Fanger Thermal Balance Variables, Metabolic/Clothing Reference Values, and Comfort Categories (Book Tables 7.3–7.7 · Figs. 7.1–7.2)',
      relatedFigures: 'Figs. 7.1 & 7.2',
      usStandards: 'ANSI/ASHRAE Standard 55-2023 (Thermal Environmental Conditions for Human Occupancy)',
      euStandards: 'EN ISO 7730:2005 · EN ISO 8996 (Metabolic Rate) · EN ISO 9920 (Clothing Insulation)',
      headers: ['Variable / Category', 'Symbol', 'Units (SI & US)', 'Reference Range & Normative Criterion'],
      colAligns: ['left', 'center', 'center', 'left'],
      colRatios: [0.22, 0.12, 0.22, 0.44],
      colMono: [false, true, true, false],
      rows: [
        [
          'Dry-Bulb Air Temp.',
          'ta',
          mode === 'eu_iso' ? '°C' : '°C [°F]',
          mode === 'eu_iso' ? 'Applicable PMV domain: 10 °C to 30 °C' : 'Applicable PMV domain: 10–30 °C [50–86 °F]',
        ],
        [
          'Mean Radiant Temp.',
          'tr',
          mode === 'eu_iso' ? '°C' : '°C [°F]',
          mode === 'eu_iso' ? 'Derived from black globe Tg, ta, and va (10–40 °C)' : 'Derived from black globe Tg, ta, and va (10–40 °C [50–104 °F])',
        ],
        [
          'Relative Air Velocity',
          'va',
          mode === 'eu_iso' ? 'm/s' : 'm/s [fpm]',
          mode === 'eu_iso' ? '0 to 1.0 m/s (draft risk if va > 0.20 m/s in office)' : '0 to 1.0 m/s [0–197 fpm] (draft limit ~0.20 m/s [40 fpm])',
        ],
        [
          'Relative Humidity',
          'RH (pa)',
          '% (kPa)',
          '30% to 70% RH recommended (water vapor partial pressure 0–2.7 kPa)',
        ],
        [
          'Metabolic Rate',
          'M',
          'W/m² · met',
          `1 met = ${n(58.15, 2)} W/m² · Seated office: ${n(1.2, 1)} met (70 W/m²) · Standing light: ${n(1.6, 1)} met (93 W/m²) · Moderate MMH: ${n(2.0, 1)}–${n(2.8, 1)} met`,
        ],
        [
          'Clothing Insulation',
          'Icl',
          'clo · m²·K/W',
          `1 clo = ${n(0.155, 3)} m²·K/W · Summer trousers+shirt: ${n(0.5, 1)} clo · Business/winter workwear: ${n(1.0, 1)} clo · Freezer suit: ${n(2.0, 1)}–${n(2.5, 1)} clo`,
        ],
        [
          'ISO 7730 Category A\nISO 7730 Category B (ASHRAE 55)\nISO 7730 Category C',
          'PMV / PPD',
          'Dimensionless / %',
          `Cat. A: −${n(0.2, 1)} < PMV < +${n(0.2, 1)} (PPD < 6%)\nCat. B (Standard General Comfort): −${n(0.5, 1)} ≤ PMV ≤ +${n(0.5, 1)} (PPD < 10%)\nCat. C: −${n(0.7, 1)} < PMV < +${n(0.7, 1)} (PPD < 15%)`,
        ],
      ],
      highlightRowIndices: [6],
      footnote:
        'Analytical PPD equation: PPD = 100 − 95 · exp(−0.03353 · PMV⁴ − 0.2179 · PMV²). Even at thermal neutrality (PMV = 0), inter-individual variance yields PPD = 5%.',
    },
    {
      id: 'tbl-07-02',
      tableCode: 'Table 7.2',
      fileNameStem: 'Table_07_02_WBGT_Sensors_Equations_ACGIH_ISO7243',
      chapter: 7,
      chapterTitle: 'Ch. 7 · Thermal Environment (Fanger PMV–PPD · WBGT)',
      title: 'WBGT Heat Stress Instrumentation, Equations, and Screening Thresholds (Fig. 7.3 · ISO 7243 / ACGIH® TLV®)',
      relatedFigures: 'Fig. 7.3',
      usStandards: 'ACGIH® Heat Stress and Strain TLV® & Action Limit · NIOSH Criteria Document 2016-106 · OSHA Technical Manual Sec. III Ch. 4',
      euStandards: 'EN ISO 7243:2017 (Ergonomics of the Thermal Environment — WBGT Index) · EN ISO 7933 (PHS)',
      headers: [
        'Metabolic Workload Class',
        'Metabolic Rate M (W · W/m²)',
        `Acclimatized Limit\n(TLV / ISO 7243 Ref.)`,
        `Unacclimatized Limit\n(Action Limit / Ref.)`,
      ],
      colAligns: ['left', 'center', 'center', 'center'],
      colRatios: [0.28, 0.24, 0.24, 0.24],
      colMono: [false, true, true, true],
      rows: [
        [
          'Class 0 · Resting',
          '115 W (~65 W/m² · 1.1 met)',
          mode === 'eu_iso' ? `${n(33.0, 1)} °C` : `${n(33.0, 1)} °C [91.4 °F]`,
          mode === 'eu_iso' ? `${n(32.0, 1)} °C` : `${n(32.0, 1)} °C [89.6 °F]`,
        ],
        [
          'Class 1 · Light Metabolic Rate',
          '180 W (~100 W/m² · 1.7 met)',
          mode === 'eu_iso' ? `${n(30.0, 1)} °C` : `${n(30.0, 1)} °C [86.0 °F]`,
          mode === 'eu_iso' ? `${n(28.0, 1)} °C` : `${n(28.0, 1)} °C [82.4 °F]`,
        ],
        [
          'Class 2 · Moderate Metabolic Rate',
          '300 W (~165 W/m² · 2.8 met)',
          mode === 'eu_iso' ? `${n(28.0, 1)} °C` : `${n(28.0, 1)} °C [82.4 °F]`,
          mode === 'eu_iso' ? `${n(25.0, 1)} °C` : `${n(25.0, 1)} °C [77.0 °F]`,
        ],
        [
          'Class 3 · Heavy Metabolic Rate',
          '415 W (~230 W/m² · 4.0 met)',
          mode === 'eu_iso' ? `${n(26.0, 1)} °C` : `${n(26.0, 1)} °C [78.8 °F]`,
          mode === 'eu_iso' ? `${n(23.0, 1)} °C` : `${n(23.0, 1)} °C [73.4 °F]`,
        ],
        [
          'Class 4 · Very Heavy Metabolic Rate',
          '520 W (~290 W/m² · 5.0 met)',
          mode === 'eu_iso' ? `${n(25.0, 1)} °C` : `${n(25.0, 1)} °C [77.0 °F]`,
          mode === 'eu_iso' ? `${n(20.0, 1)} °C` : `${n(20.0, 1)} °C [68.0 °F]`,
        ],
      ],
      highlightRowIndices: [2, 3],
      footnote: `WBGT equations (Fig. 7.3): Without solar load WBGT_in = 0.7·Tnwb + 0.3·Tg; With direct solar load WBGT_out = 0.7·Tnwb + 0.2·Tg + 0.1·Ta (Ø 150 mm [6 in] matte-black copper globe). Values above assume continuous work (75–100% work/h) in standard cotton workwear (CAV = 0 °C); add Clothing Adjustment Values (CAV) for double-layer or vapor-barrier coveralls.`,
    },

    // ========================================================================
    // CHAPTER 8 — MECHANICAL VIBRATION (WBV & HAV)
    // ========================================================================
    {
      id: 'tbl-08-01',
      tableCode: 'Table 8.1',
      fileNameStem: 'Table_08_01_Whole_Body_Vibration_ISO2631_ANSI_EU',
      chapter: 8,
      chapterTitle: 'Ch. 8 · Mechanical Vibration (WBV ISO 2631 · HAV ISO 5349)',
      title: 'Whole-Body Vibration (WBV) Coordinate Axes, Frequency Weightings, k-Factors, and Daily Exposure Limits (Fig. 8.1)',
      relatedFigures: 'Fig. 8.1 & Fig. 13.3',
      usStandards: 'ANSI/ASA S3.18 (ISO 2631-1 Adoption) · ACGIH® Whole-Body Vibration TLV®',
      euStandards: 'EU Physical Agents (Vibration) Directive 2002/44/EC · EN ISO 2631-1:1997/Amd 1:2010 · EN 14253',
      headers: [
        'Orthogonal Axis / Criterion',
        'Anatomical Direction (Seated / Standing)',
        'Weighting & k-Factor',
        '8-Hour Daily Criterion (EU 2002/44/EC & ISO 2631-1)',
      ],
      colAligns: ['left', 'left', 'center', 'left'],
      colRatios: [0.21, 0.27, 0.18, 0.34],
      colMono: [false, false, true, false],
      rows: [
        [
          'x-Axis (Fore-and-Aft)',
          'Back-to-chest longitudinal horizontal axis',
          `Wd · kx = ${n(1.4, 1)}`,
          `awx_eff = ${n(1.4, 1)} · awx · √(T / 8)`,
        ],
        [
          'y-Axis (Lateral)',
          'Right-to-left side-to-side horizontal axis',
          `Wd · ky = ${n(1.4, 1)}`,
          `awy_eff = ${n(1.4, 1)} · awy · √(T / 8)`,
        ],
        [
          'z-Axis (Vertical)',
          'Buttocks/feet-to-head spinal longitudinal axis (4–8 Hz resonance)',
          `Wk · kz = ${n(1.0, 1)}`,
          `awz_eff = ${n(1.0, 1)} · awz · √(T / 8)`,
        ],
        [
          'Daily Exposure Action Value (EAV)',
          'Governing highest single weighted axis: A(8) = max(1.4·awx, 1.4·awy, 1.0·awz)·√(T/8)',
          `A(8) = ${n(0.5, 2)} m/s²\nVDV = ${n(9.1, 1)} m/s^1.75`,
          'Triggers mandatory vibration reduction program, seat suspension maintenance, and health surveillance',
        ],
        [
          'Daily Exposure Limit Value (ELV)',
          'Maximum permissible 8-h equivalent acceleration (ACGIH Caution Zone ~0.45–0.90 m/s²)',
          `A(8) = ${n(1.15, 2)} m/s²\nVDV = ${n(21.0, 1)} m/s^1.75`,
          'Must NEVER be exceeded; immediate suspension of exposure and engineering isolation required',
        ],
      ],
      highlightRowIndices: [3, 4],
      footnote:
        'Note: Comfort evaluation uses vector sum av = √(1.4²awx² + 1.4²awy² + awz²), whereas EU Directive 2002/44/EC health compliance uses the highest single k-weighted axis max(Ax(8), Ay(8), Az(8)). When crest factor CF > 9, check fourth-power Vibration Dose Value (VDV).',
    },
    {
      id: 'tbl-08-02',
      tableCode: 'Table 8.2',
      fileNameStem: 'Table_08_02_Hand_Arm_Vibration_ISO5349_ANSI_EU',
      chapter: 8,
      chapterTitle: 'Ch. 8 · Mechanical Vibration (WBV ISO 2631 · HAV ISO 5349)',
      title: 'Hand-Arm Vibration (HAV) Basicentric Axes, Wh Weighting, Total Value ahv, and Action/Limit Values (Fig. 8.2)',
      relatedFigures: 'Fig. 8.2 & Fig. 13.4',
      usStandards: 'ANSI/ASA S2.70-2006 (R2021) (DEAV = 2.5 m/s², DELV = 5.0 m/s²) · ACGIH® HAV TLV® · NIOSH Pub. 89-106',
      euStandards: 'EU Directive 2002/44/EC · EN ISO 5349-1:2001 & EN ISO 5349-2:2001/Amd 1:2015',
      headers: [
        'Parameter / Threshold',
        'Symbol / Equation',
        'Standard Value',
        'Anatomical & Regulatory Specification (US & EU Harmonized)',
      ],
      colAligns: ['left', 'center', 'center', 'left'],
      colRatios: [0.22, 0.24, 0.16, 0.38],
      colMono: [false, true, true, false],
      rows: [
        [
          'Basicentric Axes\n(3rd Metacarpal Head)',
          'zh · xh · yh',
          'Wh (8–1000 Hz)',
          'zh: longitudinal along 3rd metacarpal/forearm · xh: dorsopalmar through palm · yh: lateral along cylindrical handle',
        ],
        [
          'Vibration Total Value &\n8-Hour Equivalent A(8)',
          'ahv = √(ahwx² + ahwy² + ahwz²)\nA(8) = ahv · √(T / 8)',
          'm/s² (RMS)',
          'Triaxial root-sum-of-squares across all three equally weighted axes (kx = ky = kz = 1.0); T = daily trigger hours',
        ],
        [
          'Daily Exposure Action Value\n(EU EAV / US ANSI DEAV)',
          'A(8) Action Threshold',
          `${n(2.5, 2)} m/s²`,
          'Initiates technical vibration control plan, low-vibration tool procurement, anti-vibration gloves (EN ISO 10819), and HAVS medical screening',
        ],
        [
          'Daily Exposure Limit Value\n(EU ELV / US ANSI DELV)',
          'A(8) Maximum Limit',
          `${n(5.0, 2)} m/s²`,
          'Absolute ceiling for 8-h shift (aligned across EU 2002/44/EC, ANSI S2.70, and ACGIH TLV) to prevent HAVS / vibration white finger',
        ],
      ],
      highlightRowIndices: [2, 3],
      footnote:
        'At A(8) = 2.5 m/s², ISO 5349-1 Annex C predicts 10% prevalence of vibration-induced white finger (Raynaud phenomenon) after ~12 years of regular exposure; at 5.0 m/s², latency drops to ~5.8 years.',
    },

    // ========================================================================
    // CHAPTER 9 — REGULATORY PROTOCOL, METHOD & REPORT
    // ========================================================================
    {
      id: 'tbl-09-01',
      tableCode: 'Table 9.1',
      fileNameStem: 'Table_09_01_Regulatory_Checklist_Method_Report_Matrix',
      chapter: 9,
      chapterTitle: 'Ch. 9 · Regulatory Screening, Methods & Technical Report',
      title: 'Three-Tier Functional Matrix: Statutory Hazard Checklist, Analytical Assessment Method, and Engineering Report (Fig. 9.1)',
      relatedFigures: 'Fig. 9.1',
      usStandards: 'OSHA 29 CFR 1904 / General Duty Clause Sec. 5(a)(1) · ANSI/ASSP Z10 · AIHA Ergonomics Assessment Toolkit',
      euStandards: 'EU Framework Directive 89/391/EEC (Art. 9 Risk Assessment Documentation) · ISO/TR 12295',
      headers: [
        'Documentation Tier',
        'Core Question Answered',
        'Primary Engineering Content',
        'Consequence if Omitted',
      ],
      colAligns: ['left', 'center', 'left', 'left'],
      colRatios: [0.20, 0.18, 0.36, 0.26],
      colMono: [false, false, false, false],
      rows: [
        [
          '1. Statutory Hazard\nScreening Checklist',
          'WHAT hazards exist &\nWHEN to audit?',
          'Workstation ID, exposed headcount, shift duration, initial hazard triggers (ISO/TR 12295 Key Enters / OSHA screening), worker symptoms, audit signatures',
          'Fails legal/regulatory audit traceability despite technical calculations',
        ],
        [
          '2. Quantitative\nAssessment Method',
          'HOW to measure &\ncompute risk?',
          'Standardized biomechanical equations & lookup tables (NIOSH RNLE, RULA, REBA, OWAS, OCRA, JSI, ISO 7730, WBGT, ISO 2631 / 5349)',
          'Subjective checklist opinions lack scientific validity and cannot size engineering controls',
        ],
        [
          '3. Professional\nErgonomic Report',
          'HOW to redesign &\nverify control?',
          'Instrument calibration certificates, step-by-step calculation sheets, multi-hazard priority matrix, engineering CAPA specs, owners, deadlines & re-evaluation',
          'Assessment stalls at diagnosis without verified workstation risk reduction',
        ],
      ],
      highlightRowIndices: [2],
      footnote:
        'Golden principle (Ch. 9): "A statutory checklist without an analytical method lacks scientific rigor; an analytical method without statutory records fails legal traceability."',
    },

    // ========================================================================
    // CHAPTER 10 — EVALUATION CYCLE & PRIORITY HIERARCHY
    // ========================================================================
    {
      id: 'tbl-10-01',
      tableCode: 'Table 10.1',
      fileNameStem: 'Table_10_01_Six_Prioritization_Decision_Criteria',
      chapter: 10,
      chapterTitle: 'Ch. 10 · Evaluation Cycle & Priority Hierarchy',
      title: 'Six Technical Decision Criteria for Prioritizing Ergonomic Interventions (Book Table 10.1 · Figs. 10.1–10.2)',
      relatedFigures: 'Figs. 10.1 & 10.2',
      usStandards: 'NIOSH Elements of Ergonomics Programs · ANSI/ASSP Z10 Risk Assessment Matrix',
      euStandards: 'EN ISO 6385 · EU-OSHA MSD Prevention Hierarchy',
      headers: [
        'Criterion #',
        'Decision Criterion',
        'Biomechanical & Clinical Rationale',
        'Operational Weighting Rule',
      ],
      colAligns: ['center', 'left', 'left', 'left'],
      colRatios: [0.11, 0.23, 0.36, 0.30],
      colMono: [true, false, false, false],
      rows: [
        [
          'Criterion 1',
          'Structural Nature of Tissue Damage',
          'Distinguishes acute structural overload (L5/S1 endplate microfracture, tendon rupture) from reversible muscular fatigue',
          'Structural tissue injury hazards outrank comfort complaints regardless of score scale',
        ],
        [
          'Criterion 2',
          'Pathophysiological Irreversibility',
          'Intervertebral disc herniation, carpal tunnel axonal neuropathy, and Stage 2–3 HAVS vascular blanching are largely irreversible',
          'Irreversible pathologies demand immediate source engineering controls',
        ],
        [
          'Criterion 3',
          'Exposed Headcount & Cumulative Dose',
          'Total person-hours exposed across shifts and multi-year cumulative biomechanical dose',
          'Multi-shift high-headcount bottlenecks receive accelerated capital allocation',
        ],
        [
          'Criterion 4',
          'Engineering Feasibility & Interim Control',
          'Availability of proven off-the-shelf engineering solutions (scissor lift tables, balancers, handle extensions)',
          'If permanent capital redesign requires lead time, deploy immediate interim controls',
        ],
        [
          'Criterion 5',
          'Multi-Hazard Coexistence & Synergy',
          'Concurrent force + extreme posture + high repetition + cold/vibration multiplies tissue injury odds nonlinearly',
          'Workstations failing ≥2 ergonomic domains escalate one priority tier',
        ],
        [
          'Criterion 6',
          'Documented Clinical / Symptom Evidence',
          'Recorded OSHA 300 / occupational disease cases, absenteeism, or Nordic Musculoskeletal Questionnaire (NMQ) clusters',
          'Confirmed clinical morbidity overrides borderline index uncertainty',
        ],
      ],
      footnote:
        'Because RULA (1–7), REBA (1–15), LI (0–∞), OCRA (0–∞), and A(8) (m/s²) use non-commensurable numeric scales, raw numbers must never be compared directly without these six criteria.',
    },
    {
      id: 'tbl-10-02',
      tableCode: 'Table 10.2',
      fileNameStem: 'Table_10_02_Five_Tier_Biomechanical_Priority_Hierarchy',
      chapter: 10,
      chapterTitle: 'Ch. 10 · Evaluation Cycle & Priority Hierarchy',
      title: 'Five-Tier General Priority Hierarchy Across Ergonomic Risk Domains & CAPA Deadlines (Book Table 10.2 · Fig. 10.2)',
      relatedFigures: 'Fig. 10.2',
      usStandards: 'OSHA / NIOSH / ACGIH TLV Priority Framework',
      euStandards: 'ISO/TR 12295 · EU Directives 90/269/EEC & 2002/44/EC',
      headers: [
        'Priority Rank',
        'Ergonomic Hazard Domain',
        'Governing Quantitative Triggers',
        'Recommended CAPA Target Timeline',
      ],
      colAligns: ['center', 'left', 'left', 'left'],
      colRatios: [0.13, 0.25, 0.34, 0.28],
      colMono: [true, false, true, false],
      rows: [
        [
          'Priority 1',
          'Manual Materials Handling\n(Lifting, Lowering, Push/Pull)',
          `NIOSH LI > ${n(3.0, 1)} (or > ${n(1.5, 1)} sustained) · Liberty Mutual RR > ${n(1.0, 2)} · OWAS Load Code 3 in Cat. 4`,
          'Immediate (0–30 days): Mechanical lift assist, dock leveling, load mass split',
        ],
        [
          'Priority 2',
          'Upper-Limb Repetitive Exertions',
          `OCRA Index > ${n(3.5, 1)} (Checklist > ${n(14.0, 1)}) · JSI > ${n(7.0, 1)} · ACGIH HAL/NPF > TLV`,
          'Short-Term (30–60 days): Tool redesign, force reduction, cycle pacing & 5:1 recovery breaks',
        ],
        [
          'Priority 3',
          'Awkward & Static Working Postures',
          'RULA Level 3–4 (5–7 pts) · REBA Level 3–4 (8–15 pts) · OWAS Category 3–4',
          'Short-to-Medium Term (30–90 days): Adjustable work-surface height & reach geometry',
        ],
        [
          'Priority 4',
          'Mechanical Vibration (WBV & HAV)',
          `WBV A(8) ≥ ${n(0.5, 2)} m/s² (ELV ${n(1.15, 2)}) · HAV A(8) ≥ ${n(2.5, 2)} m/s² (ELV ${n(5.0, 2)})`,
          'Immediate if > ELV; Short/Medium (30–90 days) if between EAV and ELV',
        ],
        [
          'Priority 5*',
          'Thermal Comfort (PMV–PPD)\n[*Exception: Acute WBGT Heat Stress]',
          `|PMV| > ${n(0.5, 1)} (PPD > 10%)\n*If WBGT > ACGIH TLV / ISO 7243 → Escalates to Priority 1!`,
          'Medium-Term (60–120 days) for comfort; Immediate same-shift stop/work-rest for WBGT exceedance',
        ],
      ],
      highlightRowIndices: [0, 4],
      footnote:
        '*Critical exception: Uncompensated metabolic heat stress exceeding WBGT TLV / ISO 7243 reference limits poses acute life-safety risk (heat stroke) and supersedes all musculoskeletal priorities.',
    },

    // ========================================================================
    // CHAPTER 11 — CASE STUDY I: ELECTRICAL UTILITY & OFFICE VDT
    // ========================================================================
    {
      id: 'tbl-11-01',
      tableCode: 'Table 11.1',
      fileNameStem: 'Table_11_01_Case_Study_Electrical_Utility_Operations',
      chapter: 11,
      chapterTitle: 'Ch. 11 · Case Study I: Electrical Utility & Office VDT',
      title: 'Case Study I Synthesis — Electrical Utility Field Operations: Tamper, Trenching, Crane Controls & Metering Cabinet (Figs. 11.1–11.4)',
      relatedFigures: 'Figs. 11.1, 11.2, 11.3 & 11.4',
      usStandards: 'OSHA 29 CFR 1910.269 / 1926 · NIOSH Construction Ergonomics · REBA / RULA / OWAS',
      euStandards: 'EU Directive 92/57/EEC · EN 1005-4 · ISO 11226 · ISO 5349-1',
      headers: [
        'Field Task & Figure',
        'Observed Biomechanical Demand',
        'Quantitative Score & Risk Tier',
        'Engineering Control Specification',
      ],
      colAligns: ['left', 'left', 'center', 'left'],
      colRatios: [0.22, 0.29, 0.20, 0.29],
      colMono: [false, false, true, false],
      rows: [
        [
          'Manual Soil Compaction\nwith Iron Tamper (Fig. 11.1)',
          'Repetitive vertical lifting + impact shock of heavy steel tamper; alternating shoulder elevation (>60°) and trunk flexion (25°–35°)',
          'REBA = 8–10\n(Action Level 3 — High)',
          'Replace manual iron tamper with low-HAV pneumatic/vibratory plate compactor; rotate operators every 20 min',
        ],
        [
          'Manual Trench Excavation\nwith Shovel (Fig. 11.2)',
          `Deep trunk flexion (>50°) combined with axial torsion (30°–45°), knee flexion, and wet soil blade load (${massStr(8, 17.6, mode, 0, euComma)}–${massStr(12, 26.5, mode, 0, euComma)})`,
          'REBA = 11 (Level 4)\nOWAS = 4-1-4-2 (Cat. 4)',
          'Deploy compact mini-excavator / vacuum trencher; use long-handled ergonomic bent-shaft shovel for utility spotting only',
        ],
        [
          'Bucket-Truck Crane\nLever Bank (Fig. 11.3)',
          'Sustained standing cervical extension (−25° to −35°) tracking overhead boom + static forward upper-limb reach on levers',
          'RULA = 6–7\n(Action Level 3–4)',
          'Adopt wireless proportional belly-box remote control allowing operator to stand clear with neutral cervical sightline',
        ],
        [
          'Electrical Metering\nCabinet Access (Fig. 11.4)',
          `Upper busbars require shoulder flexion >110° (${lenCmStr(185, mode, 0, euComma)}); lower terminals force deep squat >90° (${lenCmStr(35, mode, 0, euComma)})`,
          'REBA = 8–9\n(Action Level 3 — High)',
          `Standardize enclosure mounting window between ${lenCmStr(75, mode, 0, euComma)} and ${lenCmStr(155, mode, 0, euComma)} above grade; provide insulated kneeling stool for legacy low cabinets`,
        ],
      ],
      highlightRowIndices: [1, 2],
      footnote:
        'Field utility tasks combine high peak forces, outdoor thermal load (WBGT), and awkward access heights; wireless remote crane controls eliminate sustained neck extension (>25°) completely.',
    },
    {
      id: 'tbl-11-02',
      tableCode: 'Table 11.2',
      fileNameStem: 'Table_11_02_Case_Study_Office_VDT_and_ACGIH_HAL',
      chapter: 11,
      chapterTitle: 'Ch. 11 · Case Study I: Electrical Utility & Office VDT',
      title: 'Case Study I Synthesis — Administrative Office VDT Workstation & ACGIH® Hand Activity Level (Figs. 11.5–11.6)',
      relatedFigures: 'Figs. 11.5 & 11.6',
      usStandards: 'ANSI/HFES 100-2007 (Human Factors Engineering of Computer Workstations) · ACGIH® HAL TLV®',
      euStandards: 'EU Display Screen Equipment Directive 90/270/EEC · EN ISO 9241-5 · EN 1335-1 (Office Chairs)',
      headers: [
        'Evaluated Parameter',
        'Baseline Condition (Fig. 11.5 / 11.6)',
        'Assessment Result',
        'US (ANSI/HFES 100) & EU (ISO 9241-5 / EN 1335) Redesign Target',
      ],
      colAligns: ['left', 'left', 'center', 'left'],
      colRatios: [0.21, 0.28, 0.20, 0.31],
      colMono: [false, false, true, false],
      rows: [
        [
          'Monitor Placement &\nCervical Alignment',
          'Monitor positioned in desk corner forcing sustained 30°–35° cervical axial rotation (+1 RULA neck twist)',
          'RULA = 4 → 2\nafter alignment',
          `Center monitor directly in mid-sagittal plane; top of screen at or 0°–15° below horizontal eye level; viewing distance ${lenCmStr(50, mode, 0, euComma)}–${lenCmStr(75, mode, 0, euComma)}`,
        ],
        [
          'Seated Geometry &\nForearm Support',
          'Desk height slightly elevated relative to elbow; wrists extended ~15° on keyboard edge',
          'RULA Group A = 3\nGroup B = 3',
          `Seat pan height ${lenCmStr(40, mode, 0, euComma)}–${lenCmStr(52, mode, 0, euComma)} (EN 1335 / HFES 100); elbow 90°–100°; forearm supported on height-adjustable armrests`,
        ],
        [
          'Right Hand (Mouse /\nNumeric Keying — Fig. 11.6)',
          `Active keying/mousing cadence: HAL = ${n(5.0, 1)}; Normalized Peak Force NPF = ${n(1.0, 1)} (10% MVC)`,
          `Score Ratio < AL\n(Acceptable Zone)`,
          `Below ACGIH Action Limit (at HAL = ${n(5.0, 1)}, AL NPF ≈ ${n(2.8, 1)}, TLV NPF ≈ ${n(3.9, 1)}); maintain vertical/contoured mouse & micro-breaks`,
        ],
        [
          'Left Hand (Auxiliary\nKeyboard — Fig. 11.6)',
          `Intermittent shortcut/document handling: HAL = ${n(1.0, 1)}; NPF = ${n(0.5, 1)}`,
          `Score Ratio << AL\n(Acceptable Zone)`,
          'Well within safe green zone (< Action Limit); alternate mouse shortcuts bilaterally where practical',
        ],
      ],
      footnote:
        'Note on terminology: In Spanish regulations (e.g., Res. MTESS 295/03), the ACGIH® Hand Activity Level is translated as NAM ("Nivel de Actividad Manual"). In English manuscripts, always cite ACGIH® HAL and Normalized Peak Force (NPF).',
    },

    // ========================================================================
    // CHAPTER 12 — CASE STUDY II: HEALTHCARE LOGISTICS & FOOD PROCESSING
    // ========================================================================
    {
      id: 'tbl-12-01',
      tableCode: 'Table 12.1',
      fileNameStem: 'Table_12_01_Healthcare_Logistics_PMV_Dock_NIOSH_Bin',
      chapter: 12,
      chapterTitle: 'Ch. 12 · Case Study II: Healthcare Logistics & Cold Storage',
      title: 'Case Study II (Part A) — Healthcare Logistics Thermal Comfort (PMV–PPD), Loading Dock Geometry & Bin-to-Cart NIOSH RNLE (Book Table 12.6 · Figs. 12.1–12.4)',
      relatedFigures: 'Figs. 12.1, 12.2, 12.3 & 12.4',
      usStandards: 'ASHRAE 55 · NIOSH RNLE Pub. 94-110 · OSHA Warehousing Ergonomics',
      euStandards: 'EN ISO 7730 · ISO 11228-1 · EN 1005-2',
      headers: [
        'Sector / Sub-Task',
        'Measured Field Variables',
        'Calculated Index',
        'Compliance Status & Engineering Redesign',
      ],
      colAligns: ['left', 'left', 'center', 'left'],
      colRatios: [0.22, 0.30, 0.18, 0.30],
      colMono: [false, false, true, false],
      rows: [
        [
          'Thermal Sector 1:\nShipping & Receiving Dock',
          'Semi-sheltered bay, moderate MMH metabolic rate (~1.8 met), work jacket ensemble (~0.8 clo)',
          `PMV = ${n(-0.38, 2)}\nPPD = ${n(8.0, 1)}%`,
          'Compliant with ISO 7730 Cat. B / ASHRAE 55 (|PMV| ≤ 0.5, PPD < 10%)',
        ],
        [
          'Thermal Sector 2:\nPouch Sorting Area',
          'Indoor sorting hall, standing light-moderate work (~1.6 met)',
          `PMV = ${n(-0.27, 2)}\nPPD = ${n(6.5, 1)}%`,
          'Compliant with ISO 7730 Cat. B / ASHRAE 55 (PPD < 10%)',
        ],
        [
          'Thermal Sector 3:\nMain Healthcare Warehouse',
          'Reduced air movement (va < 0.10 m/s) + elevated summer radiant roof load',
          `PMV = +${n(0.63, 2)}\nPPD = ${n(13.3, 1)}%`,
          'Exceeds Cat. B 10% PPD threshold (Cat. C warm discomfort): increase HVAC air Destratification / HVLS fans (va ≈ 0.25 m/s)',
        ],
        [
          'Loading Dock Step &\nDelivery Van (Fig. 12.2)',
          `Interior dock step +${lenCmStr(22, mode, 1, euComma)}; delivery van cargo bed ${lenCmStr(55, mode, 1, euComma)} above grade (net step ${lenCmStr(33, mode, 1, euComma)})`,
          `ΔV = ${lenCmStr(33, mode, 1, euComma)}`,
          `Install flush hinged dock bridge eliminating the ${lenCmStr(22, mode, 1, euComma)} step and raise transport carts to ≥ ${lenCmStr(55, mode, 1, euComma)}`,
        ],
        [
          'Bin Pick-Up Origin →\nCart Placement (Fig. 12.4)',
          `Parcel M = ${massStr(10, 22, mode, 0, euComma)}; Origin inside ${lenCmStr(95, mode, 1, euComma)} bin wall: V1 = ${lenCmStr(45, mode, 1, euComma)}, H1 ≈ ${lenCmStr(48, mode, 1, euComma)}, F = 3 lifts/min, D = ${lenCmStr(10, mode, 1, euComma)}; Cart V2 = ${lenCmStr(35, mode, 1, euComma)}, H2 = ${lenCmStr(30, mode, 1, euComma)}`,
          `Origin: RWL = ${massStr(7.3, 16.1, mode, 1, euComma)}\nLI_orig = ${n(1.37, 2)}\nDest: LI_dest = ${n(0.89, 2)}`,
          'Moderate L5/S1 risk at bin origin (LI = 1.37 > 1.00): replace rigid bin with spring-loaded self-leveling pallet/bin or drop-side gate',
        ],
      ],
      highlightRowIndices: [2, 4],
      footnote:
        'Notice in Fig. 12.4 how Spanish "IL = 1,37" and "IL = 0,89" translate to LI = 1.37 (origin) and LI = 0.89 (destination) in US/EU technical notation.',
    },
    {
      id: 'tbl-12-02',
      tableCode: 'Table 12.2',
      fileNameStem: 'Table_12_02_Conveyor_Hopper_Dynamometry_ColdStorage',
      chapter: 12,
      chapterTitle: 'Ch. 12 · Case Study II: Healthcare Logistics & Cold Storage',
      title: 'Case Study II (Part B) — Pouch Sorting, Conveyor Line, Hopper Pouring, Cart Push/Pull Dynamometry & Cold Storage (Figs. 12.5–12.10)',
      relatedFigures: 'Figs. 12.5, 12.6, 12.7, 12.8, 12.9 & 12.10',
      usStandards: 'NIOSH RNLE · Liberty Mutual MMH · RULA / REBA · ACGIH Cold Stress & HAL',
      euStandards: 'ISO 11228-1/-2/-3 · EN 1005-2/-3/-5 · ISO 11079 (IREQ Cold Environments)',
      headers: [
        'Workstation & Plate',
        'Critical Biomechanical / Environmental Stressor',
        'Primary Method & Risk Level',
        'Targeted Engineering Intervention',
      ],
      colAligns: ['left', 'left', 'center', 'left'],
      colRatios: [0.22, 0.30, 0.19, 0.29],
      colMono: [false, false, true, false],
      rows: [
        [
          'Rack/Pallet vs. High\nScanner Counter (Fig. 12.3)',
          `Low pallet picking (V < ${lenCmStr(30, mode, 1, euComma)}) + barcode scanning on ${lenCmStr(99, mode, 0, euComma)} counter elevating right shoulder`,
          'REBA = 9 (Pallet)\nRULA = 5 (Scanner)',
          `Place pallets on scissor lift table (${lenCmStr(75, mode, 0, euComma)}) and recess/angle scannergun holder at ${lenCmStr(88, mode, 0, euComma)}–${lenCmStr(92, mode, 0, euComma)}`,
        ],
        [
          'Mail Pouch Sorting:\nBin vs. Floor (Fig. 12.5)',
          'Deep trunk flexion (>65°) picking pouches directly from floor level (V ≈ 10 cm [4 in])',
          'REBA = 10–11\n(Action Level 3–4)',
          `Prohibit floor staging; stage pouches on tilted mobile sorting tables (${lenCmStr(75, mode, 0, euComma)}–${lenCmStr(90, mode, 0, euComma)})`,
        ],
        [
          'Vegetable Sorting\nConveyor Line (Fig. 12.6)',
          'Continuous standing, static 20° trunk lean, bilateral repetitive reach (>40 actions/min), wet/cool contact',
          `OCRA > ${n(3.5, 1)}\nRULA = 5–6`,
          `Narrow conveyor belt reach ≤ ${lenCmStr(40, mode, 1, euComma)}, add sit-stand saddle stools, anti-fatigue mats & 10 min/h recovery rotation`,
        ],
        [
          'Manual Sack Pouring\ninto Hopper (Fig. 12.7)',
          `Lifting ${massStr(25, 55, mode, 0, euComma)} sack above chest height (${lenCmStr(135, mode, 0, euComma)}) with shoulder elevation and wrist deviation`,
          `NIOSH LI > ${n(2.4, 1)}\nREBA = 11 (Level 4)`,
          `Lower hopper rim via sunken pit/platform to ${lenCmStr(85, mode, 0, euComma)} or install vacuum sack lifter / screw feeder`,
        ],
        [
          'Platform Cart Push &\nPull Dynamometry (Figs. 12.8–12.9)',
          `Initial breakaway force Fi and rolling force Fs measured at handle height ~${lenCmStr(95, mode, 0, euComma)}; backward pull adds trunk torsion`,
          'Liberty Mutual /\nISO 11228-2',
          `Specify Ø ${lenMmStr(160, mode, 1, euComma)}–${lenMmStr(200, mode, 1, euComma)} polyurethane ball-bearing casters, cap cart gross mass, and mandate two-hand forward pushing`,
        ],
        [
          'Cold-Storage Chamber\nPicking (Fig. 12.10)',
          `High shelf reach (${lenCmStr(175, mode, 0, euComma)}) + low pallet cooler (${lenCmStr(25, mode, 1, euComma)}) inside refrigerated chamber (2–4 °C [36–39 °F]) with thermal gloves`,
          'REBA = 9–10 · OCRA\nAdM cold penalty',
          `Restrict active picking slots to ${lenCmStr(60, mode, 0, euComma)}–${lenCmStr(145, mode, 0, euComma)}, provide high-dexterity EN 511 thermal grip gloves & warm-room breaks (ISO 11079)`,
        ],
      ],
      highlightRowIndices: [1, 3, 5],
      footnote:
        'Cold environments (<10 °C [50 °F]) reduce manual dexterity and require higher grip pinch force due to insulated gloves, penalizing both NIOSH CM and OCRA AdM multipliers.',
    },

    // ========================================================================
    // CHAPTER 13 — CASE STUDY III: URBAN TRANSIT BUS DRIVER WORKSTATION
    // ========================================================================
    {
      id: 'tbl-13-01',
      tableCode: 'Table 13.1',
      fileNameStem: 'Table_13_01_Bus_Driver_Seat_Dimensions_Comfort_Angles',
      chapter: 13,
      chapterTitle: 'Ch. 13 · Case Study III: Urban Transit Bus Driver Workstation',
      title: 'Urban Transit Bus Driver Suspension Seat Dimensions & Six Seated Comfort Angles A–F (Book Tables 13.3–13.5 · Figs. 13.1–13.2)',
      relatedFigures: 'Figs. 13.1 & 13.2',
      usStandards: 'APTA BTS-BB-RP-001 (Transit Bus Driver Workstation) · SAE J833 / SAE J1100 · ANSI/HFES',
      euStandards: 'VDV 234 (Driver’s Workplace in Urban Buses) · UITP · ISO 16121-1 to -4 (Ergonomic Requirements for Bus Driver’s Workplace)',
      headers: [
        'Seat Dimension / Comfort Angle',
        'Evaluated Bus Seat Value',
        'International Normative Range (VDV 234 / ISO 16121 / APTA)',
        'Compliance & Postural Verdict',
      ],
      colAligns: ['left', 'center', 'center', 'left'],
      colRatios: [0.27, 0.21, 0.26, 0.26],
      colMono: [false, true, true, false],
      rows: [
        [
          'Seat Cushion Pan Depth',
          lenMmStr(400, mode, 1, euComma),
          `${lenMmStr(400, mode, 1, euComma)} – ${lenMmStr(460, mode, 1, euComma)}`,
          'Compliant (prevents popliteal compression for 5th %ile female)',
        ],
        [
          'Seat Cushion Pan Width /\nBackrest Width',
          `Pan: ${lenMmStr(490, mode, 1, euComma)}\nBack: ${lenMmStr(480, mode, 1, euComma)}`,
          `≥ ${lenMmStr(450, mode, 1, euComma)} – ${lenMmStr(500, mode, 1, euComma)}`,
          'Compliant (accommodates 95th %ile male hip breadth)',
        ],
        [
          'Seat Height Above Platform &\nVertical Suspension Stroke',
          `${lenMmStr(600, mode, 1, euComma)}–${lenMmStr(650, mode, 1, euComma)}\n(Adj. ±${lenMmStr(30, mode, 1, euComma)})`,
          `Pedal-to-SRP adapted · Weight adj. ${massStr(50, 110, mode, 0, euComma)}–${massStr(170, 375, mode, 0, euComma)}`,
          'Compliant pneumatic/hydraulic scissor damper (ventilated 6 mm pad)',
        ],
        [
          'Fore-Aft Longitudinal Slide &\nCushion / Backrest Tilt',
          `Slide: ${lenMmStr(300, mode, 1, euComma)} (±150)\nPan: 5°±6° · Back: 90°–104°`,
          `Slide ≥ ${lenMmStr(220, mode, 1, euComma)} · Backrest ≥ 95°–110°`,
          `Steering wheel Ø ${lenMmStr(430, mode, 1, euComma)} at 35° inclination (9 & 3 o’clock grip)`,
        ],
        [
          'Angle A · Trunk–Thigh (Hip)\nAngle B · Thigh–Leg (Knee)\nAngle C · Leg–Foot (Ankle)',
          'A ≈ 102°\nB ≈ 116°\nC ≈ 102°',
          'A: 90° – 110°\nB: 110° – 120°\nC: 100° – 115°',
          'All lower-limb & pelvic comfort angles within optimal ISO 16121 / VDV 234 envelope',
        ],
        [
          'Angle D · Sightline / Neck\nAngle E · Upper Arm Flexion\nAngle F · Elbow Interior Angle',
          'D ≈ 166° (6° flex.)\nE ≈ 22°\nF ≈ 122°',
          'D: 155° – 175°\nE: 10° – 40°\nF: 95° – 135°',
          'Final Postural Score: REBA = 2 (Action Level 1 — Low / Acceptable driving posture)',
        ],
      ],
      highlightRowIndices: [4, 5],
      footnote:
        'Headrest adjustment range: 685–860 mm [27.0–33.9 in] above seat reference point (SRP). Proper driver training on pneumatic weight-dial calibration prevents suspension bottoming-out.',
    },
    {
      id: 'tbl-13-02',
      tableCode: 'Table 13.2',
      fileNameStem: 'Table_13_02_Bus_Driver_WBV_Z_Axis_Spectrum_Table13_7',
      chapter: 13,
      chapterTitle: 'Ch. 13 · Case Study III: Urban Transit Bus Driver Workstation',
      title: 'Z-Axis Whole-Body Vibration 1/3-Octave Band Spectrum on Driver Seat Cushion (Book Table 13.7 · Fig. 13.3)',
      relatedFigures: 'Fig. 13.3',
      usStandards: 'ANSI/ASA S3.18 · ACGIH® Whole-Body Vibration TLV®',
      euStandards: 'EN ISO 2631-1 (Wk Vertical Weighting) · EU Directive 2002/44/EC (EAV = 0.50 m/s², ELV = 1.15 m/s²)',
      headers: [
        '1/3-Octave Band Center Freq. (Hz)',
        'Unweighted RMS Acceleration az,i (m/s²)',
        'ISO 2631-1 Vertical Factor Wk,i',
        'Weighted Band RMS awz,i (m/s²)',
        'Squared Contribution awz,i² (m²/s⁴)',
      ],
      colAligns: ['center', 'right', 'right', 'right', 'right'],
      colRatios: [0.22, 0.20, 0.18, 0.20, 0.20],
      colMono: [true, true, true, true, true],
      rows: [
        [n(1.0, 2), n(0.3994, 4), n(0.5, 3), n(0.1997, 4), n(0.0399, 4)],
        [n(1.25, 2), n(0.4438, 4), n(0.56, 3), n(0.2485, 4), n(0.0618, 4)],
        [n(1.6, 2), n(0.3994, 4), n(0.63, 3), n(0.2516, 4), n(0.0633, 4)],
        [n(2.0, 2), n(0.1775, 4), n(0.71, 3), n(0.126, 4), n(0.0159, 4)],
        [n(2.5, 2), n(0.0444, 4), n(0.8, 3), n(0.0355, 4), n(0.0013, 4)],
        [n(3.2, 2), n(0.0444, 4), n(0.9, 3), n(0.04, 4), n(0.0016, 4)],
        [
          'Overall Seat Summary\n(Full 1–80 Hz Integration)',
          'Peak chassis input at 1.25 Hz',
          `kz = ${n(1.0, 1)}\n(kx, ky = ${n(1.4, 1)})`,
          `awz = ${n(0.4286, 4)} m/s²`,
          `Overall A(8) = ${n(0.4463, 4)} m/s²\n(< EAV ${n(0.5, 2)} m/s² — Compliant)`,
        ],
      ],
      highlightRowIndices: [6],
      footnote:
        'The scissor suspension seat successfully attenuates 4–8 Hz spinal resonance bands; dominant residual energy sits at 1.0–1.6 Hz. Overall daily exposure A(8) = 0.4463 m/s² remains below the EU 2002/44/EC Daily Exposure Action Value (0.50 m/s²), though close enough (~89% of EAV) to warrant periodic damper maintenance.',
    },
    {
      id: 'tbl-13-03',
      tableCode: 'Table 13.3',
      fileNameStem: 'Table_13_03_Bus_Driver_HAV_Steering_Spectrum_Table13_9',
      chapter: 13,
      chapterTitle: 'Ch. 13 · Case Study III: Urban Transit Bus Driver Workstation',
      title: 'Triaxial Hand-Arm Vibration 1/3-Octave Band Spectrum on Steering Wheel Rim (Book Table 13.9 · Fig. 13.4)',
      relatedFigures: 'Fig. 13.4',
      usStandards: 'ANSI/ASA S2.70 (DEAV = 2.5 m/s², DELV = 5.0 m/s²) · ACGIH® HAV TLV®',
      euStandards: 'EN ISO 5349-1 (Wh Weighting) · EU Directive 2002/44/EC (EAV = 2.5 m/s², ELV = 5.0 m/s²)',
      headers: [
        'Octave / Band Center Freq. (Hz)',
        'xh-Axis Acceleration (m/s²)',
        'yh-Axis Acceleration (m/s²)',
        'zh-Axis Acceleration (m/s²)',
        'Dominant Spectral Feature',
      ],
      colAligns: ['center', 'right', 'right', 'right', 'left'],
      colRatios: [0.18, 0.18, 0.18, 0.18, 0.28],
      colMono: [true, true, true, true, false],
      rows: [
        ['2 Hz', n(0.5769, 4), n(0.5325, 4), n(0.2663, 4), 'Low-frequency road/steering column motion'],
        ['4 Hz', n(0.2663, 4), n(0.3106, 4), n(0.0444, 4), 'Attenuated steering column mode'],
        ['8 Hz', n(0.2219, 4), n(0.3994, 4), n(0.0888, 4), 'Peak Wh sensitivity band (Wh ≈ 1.0)'],
        ['16 Hz', n(0.2663, 4), n(0.6656, 4), n(0.2219, 4), 'Engine idle / driveline harmonic onset'],
        ['31.5 Hz', n(0.9763, 4), n(1.0206, 4), n(0.4438, 4), 'Primary diesel engine firing harmonic peak'],
        ['63 Hz', n(0.6656, 4), n(0.0, 4), n(0.0, 4), 'Secondary xh-axis structural harmonic'],
        ['125 Hz', n(0.4438, 4), n(0.0, 4), n(0.0, 4), 'High-frequency rim attenuation'],
        [
          'Wh-Weighted RMS &\nVibration Total Value',
          `ahwx = ${n(0.6271, 4)}`,
          `ahwy = ${n(0.8772, 4)}`,
          `ahwz = ${n(0.3154, 4)}`,
          `ahv = √(ahwx²+ahwy²+ahwz²) = ${n(1.123, 3)} m/s²\n(< EAV / DEAV ${n(2.5, 2)} m/s² — Acceptable)`,
        ],
      ],
      highlightRowIndices: [4, 7],
      footnote:
        'Peak spectral amplitude occurs at 31.5 Hz (diesel engine idle firing order transmitted up the steering column). Even assuming full-shift contact, total value ahv ≈ 1.1 m/s² is less than half of the 2.5 m/s² EU EAV / US ANSI DEAV threshold.',
    },
  ];
}

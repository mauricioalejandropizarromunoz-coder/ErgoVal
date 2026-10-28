import {
  BookFigureFileSpec,
  FocusZone,
  JointKey,
  Panel3DSpec,
  PosturePose3D,
} from '../types/figurePlan';

export function makeNeutralPose(overrides: Partial<PosturePose3D> = {}): PosturePose3D {
  return {
    trunkFlexionDeg: 0,
    trunkLateralDeg: 0,
    trunkTwistDeg: 0,
    neckFlexionDeg: 2,
    neckLateralDeg: 0,
    neckTwistDeg: 0,
    shoulderRFlexionDeg: 2,
    shoulderRAbductionDeg: 4,
    shoulderRElevated: false,
    shoulderLFlexionDeg: 2,
    shoulderLAbductionDeg: 4,
    elbowRFlexionDeg: 10,
    elbowLFlexionDeg: 10,
    forearmRPronationDeg: 0,
    forearmRCrossMidline: false,
    wristRFlexionDeg: 0,
    wristRDeviationDeg: 0,
    wristLFlexionDeg: 0,
    hipRFlexionDeg: 0,
    kneeRFlexionDeg: 2,
    ankleRDorsiflexionDeg: 0,
    hipLFlexionDeg: 0,
    kneeLFlexionDeg: 2,
    ankleLDorsiflexionDeg: 0,
    stanceMode: 'standing',
    prop: 'none',
    loadKg: 0,
    highlightGroup: 'none',
    ...overrides,
  };
}

export const ASSIGNED_CHAPTER4_PHOTOS: Record<string, string> = {
  'fig-4-01': '/assets/aistudio/fig-4-01.png_f18fe52f.jfif',
  'fig-4-02': '/assets/aistudio/fig-4-02.png_3ce6dba3.jfif',
  'fig-4-03': '/assets/aistudio/fig-4-03.png_a7916f2c.jfif',
  'fig-4-04a': '/assets/aistudio/fig-4-04a.png_22f0e7c1.jfif',
  'fig-4-04b': '/assets/aistudio/fig-4-04b_bd4e1564.png',
  'fig-4-05': '/assets/aistudio/fig-4-05.png_ea372a67.jfif',
  'fig-4-06a': '/assets/aistudio/fig-4-06a.png__edeb0b46.jfif',
  'fig-4-07': '/assets/aistudio/fig-4-07.png_a757b1a4.jfif',
  'fig-4-08': '/assets/aistudio/fig-4-08.png_2a2214c0.jfif',
  'fig-4-09': '/assets/aistudio/fig-4-09.png_6ac3483e.jfif',
  'fig-4-10a': '/assets/aistudio/fig-4-10a.png_a62dce20.jfif',
  'fig-4-10b': '/assets/aistudio/fig-4-10b.png_3fa530d4.jpg',
  'fig-4-12': '/assets/aistudio/fig-4-12.png_e738dee6.jfif',
  'fig-4-13a': '/assets/aistudio/fig-4-13a.png_b9821c0d.jfif',
  'fig-4-13b': '/assets/aistudio/fig-4-13b.png_24f2a4e3.jfif',
  'fig-4-15a': '/assets/aistudio/fig-4-15a.png_37980ddf.jfif',
  'fig-4-15b': '/assets/aistudio/fig-4-15b.png_2f790848.jpg',
  'fig-4-16': '/assets/aistudio/fig-4-16_e336c23b.png',
  'fig-4-17': '/assets/aistudio/fig-4-17.png_846a2e07.jfif',
  'fig-4-19a': '/assets/aistudio/fig-4-19a.png_589442c3.jfif',
  'fig-4-19b': '/assets/aistudio/fig-4-19b.png_40322459.jfif',
  'fig-4-20': '/assets/aistudio/fig-4-20.png_35c6ec4d.jfif',
  'fig-4-21a': '/assets/aistudio/fig-4-21a.png_1a505ec8.jfif',
  'fig-4-21b': '/assets/aistudio/fig-4-21b.png_a8eeaecd.jfif',
  'fig-4-22a': '/assets/aistudio/fig-4-22a.png_06bcd7bf.jfif',
  'fig-4-22b': '/assets/aistudio/fig-4-22b.png_b3c574af.jfif',
  'fig-4-23': '/assets/aistudio/fig-4-23.png_2cdad5de.jfif',
  'fig-4-24': '/assets/aistudio/fig-4-24.png_5a26a9fc.jfif',
  'fig-4-27a': '/assets/aistudio/fig-4-27a.png_04be38d2.jfif',
  'fig-4-27b': '/assets/aistudio/fig-4-27b.png_a6504403.jfif',
  'fig-4-28a': '/assets/aistudio/fig-4-28a.png_07c78e5c.jfif',
  'fig-4-28b': '/assets/aistudio/fig-4-28b.png_a3a65247.jfif',
  'fig-4-29a': '/assets/aistudio/fig-4-29a.png_5972eba2.jfif',
  'fig-4-29b': '/assets/aistudio/fig-4-29b.png_c2380107.jfif',
  'fig-4-29c': '/assets/aistudio/fig-4-29c.png_ba2f4b72.jfif',
  'fig-4-29d': '/assets/aistudio/fig-4-29d.png_a7152569.jfif',
};

const RAW_BOOK_FIGURE_CATALOG: BookFigureFileSpec[] = [
  // =========================================================================
  // CAPÍTULO 1. INTRODUCCIÓN
  // =========================================================================
  {
    id: 'fig-1-01',
    figureNumber: '1.1',
    fileName: 'fig-1-01.png',
    chapter: 1,
    chapterTitle: 'Cap. 1 · Introducción',
    title: 'Esquema de reducción del riesgo mediante el rediseño de puestos',
    bookDescription:
      'Flujo metodológico desde la identificación de factores disergonómicos y valoración cuantitativa hasta el rediseño técnico y la verificación del riesgo residual aceptable.',
    bodiesRule: 'diagrama',
    widthPx: 800,
    heightPx: 520,
    renderMode: 'diagram',
    diagramId: 'fig_1_01_redesign_cycle',
  },

  // =========================================================================
  // CAPÍTULO 4. EVALUACIÓN DE LA CARGA POSTURAL (RULA, REBA, OWAS)
  // =========================================================================
  {
    id: 'fig-4-01',
    figureNumber: '4.1',
    fileName: 'fig-4-01.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (RULA)',
    title: 'Medición de ángulo incorrecta frente a medición correcta (en verdadera magnitud)',
    bookDescription:
      'Comparación entre toma oblicua en perspectiva (deforma el ángulo aparente) y toma perpendicular al plano sagital del segmento (verdadera magnitud).',
    bodiesRule: '2',
    widthPx: 800,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: 'Incorrecta: Toma oblicua en perspectiva',
        scoreBadge: 'Ángulo deformado',
        focusZone: 'shoulder_arm',
        cameraPreset: 'perspective_oblique',
        pose: makeNeutralPose({ trunkFlexionDeg: 18, shoulderRFlexionDeg: 55, elbowRFlexionDeg: 65 }),
        angleArcs: [{ joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: 'α ap. ≠ real' }],
        noteBottom: 'El plano óptico no es paralelo al plano del movimiento',
      },
      {
        subTitle: 'Correcta: Plano paralelo (verdadera magnitud)',
        scoreBadge: 'Verdadera magnitud',
        focusZone: 'shoulder_arm',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ trunkFlexionDeg: 18, shoulderRFlexionDeg: 55, elbowRFlexionDeg: 65 }),
        angleArcs: [{ joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: 'α = 55° real' }],
        noteBottom: 'Eje óptico perpendicular al plano sagital del segmento',
      },
    ],
  },
  {
    id: 'fig-4-02',
    figureNumber: '4.2',
    fileName: 'fig-4-02.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (RULA)',
    title: 'División del cuerpo en lado derecho y lado izquierdo por el plano sagital',
    bookDescription:
      'Plano sagital medio que divide simétricamente el cuerpo humano para evaluar por separado el hemicuerpo derecho e izquierdo en RULA.',
    bodiesRule: '1',
    widthPx: 480,
    heightPx: 640,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Plano Sagital Medio — Evaluación Bilateral',
        scoreBadge: 'Lado Der. / Izq.',
        focusZone: 'full_body',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({
          shoulderRFlexionDeg: 3,
          shoulderLFlexionDeg: 3,
          shoulderRAbductionDeg: 5,
          shoulderLAbductionDeg: 5,
          elbowRFlexionDeg: 9,
          elbowLFlexionDeg: 9,
          handGripMode: 'relaxed',
          highlightGroup: 'sagittal_split',
        }),
        noteBottom: 'Se evalúa el lado de mayor exigencia o ambos en caso de duda',
      },
    ],
  },
  {
    id: 'fig-4-03',
    figureNumber: '4.3',
    fileName: 'fig-4-03.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (RULA)',
    title: 'Grupos de evaluación en el método RULA',
    bookDescription:
      'División anatómica del método RULA: Grupo A (brazo, antebrazo, muñeca y giro) y Grupo B (cuello, tronco y piernas).',
    bodiesRule: '1',
    widthPx: 480,
    heightPx: 640,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Grupo A (MMSS) y Grupo B (Cuello, Tronco, Piernas)',
        scoreBadge: 'Grupos A y B',
        focusZone: 'full_body',
        cameraPreset: 'isometric',
        pose: makeNeutralPose({
          trunkFlexionDeg: 12,
          shoulderRFlexionDeg: 38,
          elbowRFlexionDeg: 80,
          highlightGroup: 'rula_groups',
        }),
        noteBottom: 'Grupo A: miembro superior · Grupo B: eje axial y soporte podal',
      },
    ],
  },
  {
    id: 'fig-4-04a',
    figureNumber: '4.4',
    subPart: 'a',
    fileName: 'fig-4-04a.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (RULA)',
    title: 'Posiciones base del brazo en RULA: niveles 1 a 4 (−20° a > 90°)',
    bookDescription:
      'Tabla 4.2 RULA — Puntuaciones base del brazo: 1 pto (−20° a 20°), 2 ptos (ext. >20° o flex. 20°–45°), 3 ptos (45°–90°) y 4 ptos (>90°).',
    bodiesRule: '2',
    widthPx: 1600,
    heightPx: 520,
    renderMode: '3d_dual',
    // ÁNGULOS MEDIDOS SOBRE LA IMAGEN DEL LIBRO (fig-4-04a): brazo superior (hombro→codo) respecto al eje del tronco.
    // Panel 1 ≈ 20° · Panel 2 ≈ 35° · Panel 3 ≈ 79° · Panel 4 ≈ 108°  (±3°).  Codo ≈ 6–8° de flexión.
    // Abducción = 0° para que el brazo quede exactamente en el plano sagital.
    panels: [
      {
        subTitle: '1 pto: −20° a 20°',
        scoreBadge: '1 pto',
        focusZone: 'shoulder_arm',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          shoulderRFlexionDeg: 20, shoulderLFlexionDeg: 20,
          shoulderRAbductionDeg: 0, shoulderLAbductionDeg: 0,
          elbowRFlexionDeg: 8, elbowLFlexionDeg: 8,
        }),
        angleArcs: [{ joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: 'α = 20° (1 pto)' }],
      },
      {
        subTitle: '2 ptos: 20° a 45°',
        scoreBadge: '2 ptos',
        focusZone: 'shoulder_arm',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          shoulderRFlexionDeg: 35, shoulderLFlexionDeg: 35,
          shoulderRAbductionDeg: 0, shoulderLAbductionDeg: 0,
          elbowRFlexionDeg: 8, elbowLFlexionDeg: 8,
        }),
        angleArcs: [{ joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: 'α = 35° (2 ptos)' }],
      },
      {
        subTitle: '3 ptos: 45° a 90°',
        scoreBadge: '3 ptos',
        focusZone: 'shoulder_arm',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          shoulderRFlexionDeg: 79, shoulderLFlexionDeg: 79,
          shoulderRAbductionDeg: 0, shoulderLAbductionDeg: 0,
          elbowRFlexionDeg: 6, elbowLFlexionDeg: 6,
        }),
        angleArcs: [{ joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: 'α = 79° (3 ptos)' }],
      },
      {
        subTitle: '4 ptos: > 90°',
        scoreBadge: '4 ptos',
        focusZone: 'shoulder_arm',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          shoulderRFlexionDeg: 108, shoulderLFlexionDeg: 108,
          shoulderRAbductionDeg: 0, shoulderLAbductionDeg: 0,
          elbowRFlexionDeg: 6, elbowLFlexionDeg: 6,
        }),
        angleArcs: [{ joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: 'α = 108° (4 ptos)' }],
      },
    ],
  },
  {
    id: 'fig-4-04b',
    figureNumber: '4.4',
    subPart: 'b',
    fileName: 'fig-4-04b.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (RULA)',
    title: 'Modificaciones del brazo en RULA: rotación/abducción (+1) y punto de apoyo (−1)',
    bookDescription:
      'Tabla 4.3 RULA — +1 punto por brazo abducido o rotado respecto al eje corporal; −1 punto cuando existe punto de apoyo efectivo del antebrazo.',
    bodiesRule: '2',
    widthPx: 800,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: 'Brazo abducido / rotado (+1 pto)',
        scoreBadge: '+1 pto',
        focusZone: 'shoulder_arm',
        cameraPreset: 'dorsal',
        pose: makeNeutralPose({ shoulderRAbductionDeg: 48, shoulderLAbductionDeg: 48, elbowRFlexionDeg: 75, elbowLFlexionDeg: 75 }),
        angleArcs: [{ joint: 'shoulderR', refType: 'vertical_down', toJoint: 'elbowR', label: 'Abd. (+1)' }],
      },
      {
        subTitle: 'Brazo con punto de apoyo (−1 pto)',
        scoreBadge: '−1 pto',
        focusZone: 'shoulder_arm',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ shoulderRFlexionDeg: 36, elbowRFlexionDeg: 65, prop: 'work_desk_support' }),
        forceVectors: [{ atJoint: 'elbowR', dx: 0, dy: -1, lengthPx: 46, label: 'Apoyo (−1)' }],
      },
    ],
  },
  {
    id: 'fig-4-05',
    figureNumber: '4.5',
    fileName: 'fig-4-05.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (RULA)',
    title: 'Eje de referencia para la medición del ángulo de los brazos',
    bookDescription:
      'Si el tronco está flexionado, el ángulo del brazo se mide respecto al eje longitudinal del tronco y no respecto a la vertical del suelo.',
    bodiesRule: '1',
    widthPx: 480,
    heightPx: 640,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Referencia sobre el eje del tronco inclinado',
        scoreBadge: 'Eje Tronco',
        focusZone: 'shoulder_arm',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ trunkFlexionDeg: 35, shoulderRFlexionDeg: 40, elbowRFlexionDeg: 70 }),
        angleArcs: [{ joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: 'α respecto al tronco' }],
        noteBottom: 'Ángulo medido entre el eje humeral y la proyección del tronco',
      },
    ],
  },
  {
    id: 'fig-4-06a',
    figureNumber: '4.6',
    subPart: 'a',
    fileName: 'fig-4-06a.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (RULA)',
    title: 'Modificaciones sobre la puntuación del brazo (a): elevación (+1), abducción (+1) y apoyo (−1)',
    bookDescription:
      'Tabla 4.3 RULA — +1 punto si el hombro está elevado; +1 punto si el brazo se encuentra abducido; −1 punto si existe punto de apoyo.',
    bodiesRule: '2',
    widthPx: 1200,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: 'Hombro elevado (+1 punto)',
        scoreBadge: '+1 pto',
        focusZone: 'shoulder_arm',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({ shoulderRElevated: true, shoulderRAbductionDeg: 12, elbowRFlexionDeg: 75 }),
        forceVectors: [{ atJoint: 'shoulderR', dx: 0, dy: -1, lengthPx: 48, label: 'Elevación (+1)' }],
      },
      {
        subTitle: 'Brazo abducido (+1 punto)',
        scoreBadge: '+1 pto',
        focusZone: 'shoulder_arm',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({ shoulderRAbductionDeg: 52, elbowRFlexionDeg: 70 }),
        angleArcs: [{ joint: 'shoulderR', refType: 'vertical_down', toJoint: 'elbowR', label: 'α abd. (+1)' }],
      },
      {
        subTitle: 'Brazo con punto de apoyo (−1 punto)',
        scoreBadge: '−1 pto',
        focusZone: 'shoulder_arm',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          trunkFlexionDeg: 8,
          shoulderRFlexionDeg: 28,
          elbowRFlexionDeg: 85,
          prop: 'work_desk_support',
        }),
        forceVectors: [{ atJoint: 'elbowR', dx: 0, dy: -1, lengthPx: 46, label: 'Apoyo (−1)' }],
      },
    ],
  },
  {
    id: 'fig-4-06b',
    figureNumber: '4.6',
    subPart: 'b',
    fileName: 'fig-4-06b.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (RULA)',
    title: 'Modificaciones sobre la puntuación del brazo (b): punto de apoyo',
    bookDescription:
      'Tabla 4.3 RULA — −1 punto cuando el trabajador dispone de apoyo efectivo del brazo/antebrazo que descarga el complejo escapulohumeral.',
    bodiesRule: '1',
    widthPx: 480,
    heightPx: 640,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Brazo con punto de apoyo (−1 punto)',
        scoreBadge: '−1 pto',
        focusZone: 'shoulder_arm',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          trunkFlexionDeg: 8,
          shoulderRFlexionDeg: 28,
          elbowRFlexionDeg: 85,
          prop: 'work_desk_support',
        }),
        forceVectors: [{ atJoint: 'elbowR', dx: 0, dy: -1, lengthPx: 50, label: 'F reacción apoyo (−1)' }],
        noteBottom: 'La reacción normal de la superficie reduce el momento en el hombro',
      },
    ],
  },
  {
    id: 'fig-4-07',
    figureNumber: '4.7',
    fileName: 'fig-4-07.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (RULA)',
    title: 'Posiciones del antebrazo en RULA',
    bookDescription:
      'Tabla 4.4 RULA — Zona aislada de codo y antebrazo: 1 punto para flexión entre 60° y 100°; 2 puntos para flexión <60° o >100°.',
    bodiesRule: '2',
    widthPx: 800,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: '1 punto: flexión entre 60° y 100°',
        scoreBadge: '1 pto',
        focusZone: 'elbow_forearm',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ shoulderRFlexionDeg: 5, elbowRFlexionDeg: 82 }),
        angleArcs: [{ joint: 'elbowR', refType: 'vertical_down', toJoint: 'wristR', label: 'α: 60°–100°' }],
      },
      {
        subTitle: '2 puntos: flexión < 60° o > 100°',
        scoreBadge: '2 ptos',
        focusZone: 'elbow_forearm',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ shoulderRFlexionDeg: 5, elbowRFlexionDeg: 118 }),
        angleArcs: [{ joint: 'elbowR', refType: 'vertical_down', toJoint: 'wristR', label: 'α > 100° / < 60°' }],
      },
    ],
  },
  {
    id: 'fig-4-08',
    figureNumber: '4.8',
    fileName: 'fig-4-08.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (RULA)',
    title: 'Referencia para la medición del ángulo del antebrazo',
    bookDescription:
      'Medición relativa del ángulo de flexión del codo tomando como referencia la prolongación del eje longitudinal del brazo.',
    bodiesRule: '1',
    widthPx: 480,
    heightPx: 640,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Ángulo relativo codo-antebrazo',
        scoreBadge: 'Referencia Codo',
        focusZone: 'elbow_forearm',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ trunkFlexionDeg: 25, shoulderRFlexionDeg: 30, elbowRFlexionDeg: 85 }),
        angleArcs: [{ joint: 'elbowR', refType: 'segment', parentJoint: 'shoulderR', toJoint: 'wristR', label: 'α = 85°' }],
        noteBottom: 'Se mide respecto a la prolongación distal del eje humeral',
      },
    ],
  },
  {
    id: 'fig-4-09',
    figureNumber: '4.9',
    fileName: 'fig-4-09.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (RULA)',
    title: 'Posiciones que modifican la puntuación del antebrazo',
    bookDescription:
      'Tabla 4.5 RULA — +1 punto si el antebrazo cruza la línea media sagital o si se proyecta hacia afuera más allá del codo (excluyentes, máx. +1).',
    bodiesRule: '2',
    widthPx: 800,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: 'Cruza la línea media del cuerpo (+1)',
        scoreBadge: '+1 pto',
        focusZone: 'shoulder_arm',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({
          shoulderRFlexionDeg: 35,
          shoulderRAbductionDeg: -28,
          elbowRFlexionDeg: 85,
          forearmRCrossMidline: true,
        }),
        angleArcs: [{ joint: 'elbowR', refType: 'vertical_down', toJoint: 'wristR', label: 'Cruce medial' }],
      },
      {
        subTitle: 'Proyección exterior al codo (+1)',
        scoreBadge: '+1 pto',
        focusZone: 'shoulder_arm',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({
          shoulderRFlexionDeg: 20,
          shoulderRAbductionDeg: 36,
          elbowRFlexionDeg: 85,
        }),
        angleArcs: [{ joint: 'elbowR', refType: 'vertical_down', toJoint: 'wristR', label: 'Proy. externa' }],
      },
    ],
  },
  {
    id: 'fig-4-10a',
    figureNumber: '4.10',
    subPart: 'a',
    fileName: 'fig-4-10a.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (RULA)',
    title: 'Posiciones de la muñeca en RULA (a): niveles 1, 2 y 3 (0°, ±15° y > 15°)',
    bookDescription:
      'Tabla 4.6 RULA — Articulación radiocarpiana: 1 punto en posición neutra (0°), 2 puntos en flexión/extensión de −15° a 15°, y 3 puntos para >15°.',
    bodiesRule: '2',
    widthPx: 1200,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: '1 pto: posición neutra (0°)',
        scoreBadge: '1 pto',
        focusZone: 'wrist_hand',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ elbowRFlexionDeg: 90, wristRFlexionDeg: 0 }),
        angleArcs: [{ joint: 'wristR', refType: 'horizontal', toJoint: 'handR', label: 'α = 0° (neutra)' }],
      },
      {
        subTitle: '2 ptos: flexión/extensión −15° a 15°',
        scoreBadge: '2 ptos',
        focusZone: 'wrist_hand',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ elbowRFlexionDeg: 90, wristRFlexionDeg: 12 }),
        angleArcs: [{ joint: 'wristR', refType: 'horizontal', toJoint: 'handR', label: 'α: −15° a 15°' }],
      },
      {
        subTitle: '3 ptos: flexión o extensión > 15°',
        scoreBadge: '3 ptos',
        focusZone: 'wrist_hand',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ elbowRFlexionDeg: 90, wristRFlexionDeg: 28 }),
        angleArcs: [{ joint: 'wristR', refType: 'horizontal', toJoint: 'handR', label: 'α > 15° / < −15°' }],
      },
    ],
  },
  {
    id: 'fig-4-10b',
    figureNumber: '4.10',
    subPart: 'b',
    fileName: 'fig-4-10b.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (RULA)',
    title: 'Posiciones de la muñeca en RULA (b): 3 puntos (> 15°)',
    bookDescription:
      'Tabla 4.6 RULA — Articulación mano/muñeca aislada: 3 puntos para flexión palmar o extensión dorsal superior a 15°.',
    bodiesRule: '1',
    widthPx: 480,
    heightPx: 640,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: '3 puntos: flexión o extensión > 15°',
        scoreBadge: '3 ptos',
        focusZone: 'wrist_hand',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ elbowRFlexionDeg: 90, wristRFlexionDeg: 32 }),
        angleArcs: [{ joint: 'wristR', refType: 'horizontal', toJoint: 'handR', label: 'α > 15°' }],
        forceVectors: [{ atJoint: 'handR', dx: 0, dy: 1, lengthPx: 46, label: 'F tendinosa' }],
        noteBottom: 'Incrementa la presión intratúnel sobre el nervio mediano',
      },
    ],
  },
  {
    id: 'fig-4-11',
    figureNumber: '4.11',
    fileName: 'fig-4-11.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (RULA)',
    title: 'Modificación de la puntuación de la muñeca en función de la desviación',
    bookDescription:
      'Tabla 4.7 RULA — +1 punto por desviación radial o desviación cubital de la muñeca respecto al eje del antebrazo.',
    bodiesRule: '2',
    widthPx: 800,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: 'Desviación radial (+1 punto)',
        scoreBadge: '+1 pto',
        focusZone: 'wrist_hand',
        cameraPreset: 'top',
        pose: makeNeutralPose({ elbowRFlexionDeg: 90, wristRDeviationDeg: -18 }),
        angleArcs: [{ joint: 'wristR', refType: 'vertical_down', toJoint: 'handR', label: 'α radial (+1)' }],
      },
      {
        subTitle: 'Desviación cubital (+1 punto)',
        scoreBadge: '+1 pto',
        focusZone: 'wrist_hand',
        cameraPreset: 'top',
        pose: makeNeutralPose({ elbowRFlexionDeg: 90, wristRDeviationDeg: 24 }),
        angleArcs: [{ joint: 'wristR', refType: 'vertical_down', toJoint: 'handR', label: 'α cubital (+1)' }],
      },
    ],
  },
  {
    id: 'fig-4-12',
    figureNumber: '4.12',
    fileName: 'fig-4-12.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (RULA)',
    title: 'Giro de la muñeca (rango medio +1 y supinación/pronosupinación extrema +2)',
    bookDescription:
      'Tabla 4.8 RULA — +1 punto: giro de antebrazo en rango medio (pulgar arriba); +2 puntos: supinación extrema con palma hacia arriba (o pronación extrema).',
    bodiesRule: '2',
    widthPx: 800,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: '+1 punto: giro en rango medio (neutra)',
        scoreBadge: '+1 pto',
        focusZone: 'elbow_forearm',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({
          shoulderRFlexionDeg: 68,
          elbowRFlexionDeg: 22,
          forearmRPronationDeg: 0,
        }),
        angleArcs: [{ joint: 'wristR', refType: 'vertical_up', toJoint: 'handR', label: 'Rango medio (+1)' }],
      },
      {
        subTitle: '+2 puntos: supinación extrema (palma arriba)',
        scoreBadge: '+2 ptos',
        focusZone: 'elbow_forearm',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({
          shoulderRFlexionDeg: 68,
          elbowRFlexionDeg: 22,
          forearmRPronationDeg: -85,
        }),
        angleArcs: [{ joint: 'wristR', refType: 'horizontal', toJoint: 'handR', label: 'Supinada ~90° (+2)' }],
      },
    ],
  },
  {
    id: 'fig-4-13a',
    figureNumber: '4.13',
    subPart: 'a',
    fileName: 'fig-4-13a.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (RULA)',
    title: 'Posiciones base del cuello en RULA (a): niveles 1, 2, 3 y 4 (0°–10°, 10°–20°, > 20° y extensión)',
    bookDescription:
      'Tabla 4.9 RULA — Segmento cervical: 1 pto (0°–10°), 2 ptos (10°–20°), 3 ptos (>20° flexión) y 4 ptos (cuello en extensión).',
    bodiesRule: '2',
    widthPx: 1560,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: '1 pto: flexión cervical 0°–10°',
        scoreBadge: '1 pto',
        focusZone: 'neck_cervical',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ neckFlexionDeg: 6 }),
        angleArcs: [{ joint: 'c7', refType: 'vertical_up', toJoint: 'head', label: '0°–10°' }],
      },
      {
        subTitle: '2 ptos: flexión cervical 10°–20°',
        scoreBadge: '2 ptos',
        focusZone: 'neck_cervical',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ neckFlexionDeg: 16 }),
        angleArcs: [{ joint: 'c7', refType: 'vertical_up', toJoint: 'head', label: '10°–20°' }],
      },
      {
        subTitle: '3 ptos: flexión cervical > 20°',
        scoreBadge: '3 ptos',
        focusZone: 'neck_cervical',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ neckFlexionDeg: 32 }),
        angleArcs: [{ joint: 'c7', refType: 'vertical_up', toJoint: 'head', label: '> 20°' }],
      },
      {
        subTitle: '4 ptos: cuello en extensión (< 0°)',
        scoreBadge: '4 ptos',
        focusZone: 'neck_cervical',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ neckFlexionDeg: -22 }),
        angleArcs: [{ joint: 'c7', refType: 'vertical_up', toJoint: 'head', label: 'Extensión' }],
      },
    ],
  },
  {
    id: 'fig-4-13b',
    figureNumber: '4.13',
    subPart: 'b',
    fileName: 'fig-4-13b.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (RULA)',
    title: 'Modificaciones del cuello en RULA (b): rotación (+1) e inclinación lateral (+1)',
    bookDescription:
      'Tabla 4.10 RULA — +1 punto por rotación axial cervical izquierda/derecha y +1 punto por inclinación lateral cervical.',
    bodiesRule: '2',
    widthPx: 800,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: 'Rotación axial cervical (+1 pto)',
        scoreBadge: '+1 pto',
        focusZone: 'neck_cervical',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({ neckTwistDeg: 36 }),
        angleArcs: [{ joint: 'c7', refType: 'vertical_up', toJoint: 'head', label: 'Rotación (+1)' }],
      },
      {
        subTitle: 'Inclinación lateral cervical (+1 pto)',
        scoreBadge: '+1 pto',
        focusZone: 'neck_cervical',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({ neckLateralDeg: 26 }),
        angleArcs: [{ joint: 'c7', refType: 'vertical_up', toJoint: 'head', label: 'Incl. lat. (+1)' }],
      },
    ],
  },
  {
    id: 'fig-4-14',
    figureNumber: '4.14',
    fileName: 'fig-4-14.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (RULA)',
    title: 'Posiciones que modifican la puntuación del cuello',
    bookDescription:
      'Tabla 4.10 RULA — +1 punto si existe rotación axial del cuello; +1 punto si presenta inclinación lateral.',
    bodiesRule: '2',
    widthPx: 800,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: 'Cuello con rotación axial (+1)',
        scoreBadge: '+1 pto',
        focusZone: 'neck_cervical',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({ neckTwistDeg: 35 }),
        angleArcs: [{ joint: 'c7', refType: 'vertical_up', toJoint: 'head', label: 'Rotación (+1)' }],
      },
      {
        subTitle: 'Cuello con inclinación lateral (+1)',
        scoreBadge: '+1 pto',
        focusZone: 'neck_cervical',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({ neckLateralDeg: 24 }),
        angleArcs: [{ joint: 'c7', refType: 'vertical_up', toJoint: 'head', label: 'α lat. (+1)' }],
      },
    ],
  },
  {
    id: 'fig-4-15a',
    figureNumber: '4.15',
    subPart: 'a',
    fileName: 'fig-4-15a.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (RULA)',
    title: 'Posiciones base del tronco en RULA (a): niveles 1, 2, 3 y 4 (sentado, 0°–20°, 20°–60° y > 60°)',
    bookDescription:
      'Tabla 4.11 RULA — 1 pto: sentado apoyado (>90°); 2 ptos: flexión 0°–20°; 3 ptos: flexión 20°–60°; 4 ptos: flexión >60°.',
    bodiesRule: '2',
    widthPx: 1560,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: '1 pto: sentado apoyado (> 90°)',
        scoreBadge: '1 pto',
        focusZone: 'full_body',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          stanceMode: 'seated',
          prop: 'chair',
          hipRFlexionDeg: 90,
          kneeRFlexionDeg: 90,
          hipLFlexionDeg: 90,
          kneeLFlexionDeg: 90,
          trunkFlexionDeg: 0,
        }),
        angleArcs: [{ joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: 'α ≈ 0°' }],
      },
      {
        subTitle: '2 ptos: flexión de 0° a 20°',
        scoreBadge: '2 ptos',
        focusZone: 'trunk_pelvis',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ trunkFlexionDeg: 14, shoulderRFlexionDeg: 12 }),
        angleArcs: [{ joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: '0°–20°' }],
      },
      {
        subTitle: '3 ptos: flexión de 20° a 60°',
        scoreBadge: '3 ptos',
        focusZone: 'trunk_pelvis',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ trunkFlexionDeg: 40, shoulderRFlexionDeg: 34 }),
        angleArcs: [{ joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: '20°–60°' }],
      },
      {
        subTitle: '4 ptos: flexión > 60°',
        scoreBadge: '4 ptos',
        focusZone: 'trunk_pelvis',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ trunkFlexionDeg: 70, shoulderRFlexionDeg: 62 }),
        angleArcs: [{ joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: '> 60°' }],
      },
    ],
  },
  {
    id: 'fig-4-15b',
    figureNumber: '4.15',
    subPart: 'b',
    fileName: 'fig-4-15b.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (RULA)',
    title: 'Posiciones del tronco en RULA (b): 3 puntos y 4 puntos',
    bookDescription:
      'Tabla 4.11 RULA — 3 puntos: flexión de tronco entre 20° y 60°; 4 puntos: flexión superior a 60°.',
    bodiesRule: '2',
    widthPx: 800,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: '3 ptos: flexión de 20° a 60°',
        scoreBadge: '3 ptos',
        focusZone: 'trunk_pelvis',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ trunkFlexionDeg: 42, shoulderRFlexionDeg: 35 }),
        angleArcs: [{ joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: 'α: 20°–60°' }],
      },
      {
        subTitle: '4 ptos: flexión > 60°',
        scoreBadge: '4 ptos',
        focusZone: 'trunk_pelvis',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ trunkFlexionDeg: 72, shoulderRFlexionDeg: 65 }),
        angleArcs: [{ joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: 'α > 60°' }],
      },
    ],
  },
  {
    id: 'fig-4-16',
    figureNumber: '4.16',
    fileName: 'fig-4-16.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (RULA)',
    title: 'Posiciones que modifican la puntuación del tronco',
    bookDescription:
      'Tabla 4.12 RULA — +1 punto por torsión axial del tronco y +1 punto por inclinación lateral (acumulables hasta +2).',
    bodiesRule: '2',
    widthPx: 800,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: 'Torsión axial del tronco (+1)',
        scoreBadge: '+1 pto',
        focusZone: 'trunk_pelvis',
        cameraPreset: 'isometric',
        pose: makeNeutralPose({ trunkTwistDeg: 35, trunkFlexionDeg: 14 }),
        angleArcs: [{ joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: 'Torsión (+1)' }],
      },
      {
        subTitle: 'Inclinación lateral del tronco (+1)',
        scoreBadge: '+1 pto',
        focusZone: 'trunk_pelvis',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({ trunkLateralDeg: 24 }),
        angleArcs: [{ joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: 'α lat. (+1)' }],
      },
    ],
  },
  {
    id: 'fig-4-17',
    figureNumber: '4.17',
    fileName: 'fig-4-17.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (RULA)',
    title: 'Posiciones de las piernas en RULA: sentado (1), bilateral (1) y unipodal (2)',
    bookDescription:
      'Tabla 4.13 RULA — 1 punto: sentado equilibrado o de pie con apoyo bilateral simétrico; 2 puntos: apoyo unipodal o distribución asimétrica.',
    bodiesRule: '2',
    widthPx: 1200,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: '1 pto: sentado equilibrado',
        scoreBadge: '1 pto',
        focusZone: 'full_body',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          stanceMode: 'seated',
          prop: 'chair',
          hipRFlexionDeg: 90,
          kneeRFlexionDeg: 90,
          hipLFlexionDeg: 90,
          kneeLFlexionDeg: 90,
        }),
      },
      {
        subTitle: '1 pto: apoyo bilateral simétrico',
        scoreBadge: '1 pto',
        focusZone: 'full_body',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({
          stanceMode: 'standing',
          shoulderRFlexionDeg: 3,
          shoulderLFlexionDeg: 3,
          shoulderRAbductionDeg: 4,
          shoulderLAbductionDeg: 4,
          elbowRFlexionDeg: 9,
          elbowLFlexionDeg: 9,
          handGripMode: 'relaxed',
        }),
        forceVectors: [
          { atJoint: 'ankleR', dx: 0, dy: -1, lengthPx: 42, label: 'F/2' },
          { atJoint: 'ankleL', dx: 0, dy: -1, lengthPx: 42, label: 'F/2' },
        ],
      },
      {
        subTitle: '2 ptos: apoyo asimétrico / unipodal',
        scoreBadge: '2 ptos',
        focusZone: 'full_body',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({
          stanceMode: 'one_leg',
          trunkLateralDeg: 4,
          shoulderRAbductionDeg: 6,
          shoulderLAbductionDeg: 6,
          elbowRFlexionDeg: 12,
          elbowLFlexionDeg: 12,
          hipLFlexionDeg: 26,
          kneeLFlexionDeg: 54,
        }),
        forceVectors: [{ atJoint: 'ankleR', dx: 0, dy: -1, lengthPx: 56, label: 'F total (100%)' }],
      },
    ],
  },
  {
    id: 'fig-4-18',
    figureNumber: '4.18',
    fileName: 'fig-4-18.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (RULA)',
    title: 'Procedimiento de aplicación del método RULA',
    bookDescription:
      'Flujograma completo de integración de Grupo A (Tabla 4.14) y Grupo B (Tabla 4.15), correcciones por actividad muscular y fuerza, Puntuación C y D, y Tabla 4.18.',
    bodiesRule: 'diagrama',
    widthPx: 640,
    heightPx: 800,
    renderMode: 'diagram',
    diagramId: 'fig_4_18_rula_flow',
  },
  {
    id: 'fig-4-19a',
    figureNumber: '4.19',
    subPart: 'a',
    fileName: 'fig-4-19a.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (REBA)',
    title: 'Posiciones base del tronco en REBA (a): niveles 1, 2, 3 y 4 (erguido a > 60°)',
    bookDescription:
      'Tabla 4.21 REBA — 1 pto: erguido (0°); 2 ptos: flex./ext. −20° a 20°; 3 ptos: flex. 20°–60° o ext. >20°; 4 ptos: flexión >60°.',
    bodiesRule: '2',
    widthPx: 1560,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: '1 pto: erguido alineado (0°)',
        scoreBadge: '1 pto',
        focusZone: 'trunk_pelvis',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ trunkFlexionDeg: 0 }),
        angleArcs: [{ joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: '0°' }],
      },
      {
        subTitle: '2 ptos: flexión/extensión −20° a 20°',
        scoreBadge: '2 ptos',
        focusZone: 'trunk_pelvis',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ trunkFlexionDeg: 15, shoulderRFlexionDeg: 12 }),
        angleArcs: [{ joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: '−20° a 20°' }],
      },
      {
        subTitle: '3 ptos: flexión 20°–60° o ext. > 20°',
        scoreBadge: '3 ptos',
        focusZone: 'trunk_pelvis',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ trunkFlexionDeg: 42, shoulderRFlexionDeg: 35 }),
        angleArcs: [{ joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: '20°–60°' }],
      },
      {
        subTitle: '4 ptos: flexión > 60°',
        scoreBadge: '4 ptos',
        focusZone: 'trunk_pelvis',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ trunkFlexionDeg: 70, shoulderRFlexionDeg: 60 }),
        angleArcs: [{ joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: '> 60°' }],
      },
    ],
  },
  {
    id: 'fig-4-19b',
    figureNumber: '4.19',
    subPart: 'b',
    fileName: 'fig-4-19b.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (REBA)',
    title: 'Modificaciones del tronco en REBA (b): torsión (+1) e inclinación lateral (+1)',
    bookDescription:
      'Tabla 4.22 REBA — +1 punto cuando existe torsión axial del tronco o inclinación lateral respecto al eje vertebral.',
    bodiesRule: '2',
    widthPx: 800,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: 'Torsión axial del tronco (+1 pto)',
        scoreBadge: '+1 pto',
        focusZone: 'trunk_pelvis',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({ trunkTwistDeg: 36, shoulderRFlexionDeg: 12 }),
        angleArcs: [{ joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: 'Torsión (+1)' }],
      },
      {
        subTitle: 'Inclinación lateral del tronco (+1 pto)',
        scoreBadge: '+1 pto',
        focusZone: 'trunk_pelvis',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({ trunkLateralDeg: 26, shoulderRAbductionDeg: 18 }),
        angleArcs: [{ joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: 'Incl. lat. (+1)' }],
      },
    ],
  },
  {
    id: 'fig-4-20',
    figureNumber: '4.20',
    fileName: 'fig-4-20.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (REBA)',
    title: 'Posiciones del cuello en el método REBA (+1: 0°–20° · +2: > 20° o < 0°)',
    bookDescription:
      'Tabla 4.23 REBA — Segmento cervical aislado: 1 punto para flexión de 0° a 20°; 2 puntos para flexión >20° o extensión (<0°).',
    bodiesRule: '2',
    widthPx: 800,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: '1 punto: flexión de 0° a 20°',
        scoreBadge: '1 pto',
        focusZone: 'neck_cervical',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ neckFlexionDeg: 14 }),
        angleArcs: [{ joint: 'c7', refType: 'vertical_up', toJoint: 'head', label: 'α: 0°–20°' }],
      },
      {
        subTitle: '2 puntos: flexión > 20° o extensión',
        scoreBadge: '2 ptos',
        focusZone: 'neck_cervical',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ neckFlexionDeg: 32 }),
        angleArcs: [{ joint: 'c7', refType: 'vertical_up', toJoint: 'head', label: 'α > 20° / < 0°' }],
      },
    ],
  },
  {
    id: 'fig-4-21a',
    figureNumber: '4.21',
    subPart: 'a',
    fileName: 'fig-4-21a.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (REBA)',
    title: 'Soporte base de las piernas en REBA (a): sentado (+1), bilateral (+1) y unipodal (+2)',
    bookDescription:
      'Tabla 4.25 REBA — 1 punto: sentado o de pie con soporte bilateral simétrico; 2 puntos: soporte unilateral, asimétrico o inestable.',
    bodiesRule: '2',
    widthPx: 1200,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: '1 pto: sentado equilibrado',
        scoreBadge: '+1 pto',
        focusZone: 'full_body',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          stanceMode: 'seated',
          prop: 'chair',
          hipRFlexionDeg: 90,
          kneeRFlexionDeg: 90,
          hipLFlexionDeg: 90,
          kneeLFlexionDeg: 90,
        }),
      },
      {
        subTitle: '1 pto: bipedestación bilateral simétrica',
        scoreBadge: '+1 pto',
        focusZone: 'full_body',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({
          stanceMode: 'standing',
          shoulderRFlexionDeg: 3,
          shoulderLFlexionDeg: 3,
          shoulderRAbductionDeg: 4,
          shoulderLAbductionDeg: 4,
          elbowRFlexionDeg: 9,
          elbowLFlexionDeg: 9,
          handGripMode: 'relaxed',
        }),
        forceVectors: [
          { atJoint: 'ankleR', dx: 0, dy: -1, lengthPx: 40, label: 'F/2' },
          { atJoint: 'ankleL', dx: 0, dy: -1, lengthPx: 40, label: 'F/2' },
        ],
      },
      {
        subTitle: '2 ptos: apoyo unipodal / inestable',
        scoreBadge: '+2 ptos',
        focusZone: 'full_body',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({
          stanceMode: 'one_leg',
          trunkLateralDeg: -4,
          shoulderRAbductionDeg: 6,
          shoulderLAbductionDeg: 6,
          elbowRFlexionDeg: 12,
          elbowLFlexionDeg: 12,
          hipRFlexionDeg: 26,
          kneeRFlexionDeg: 52,
        }),
        forceVectors: [{ atJoint: 'ankleL', dx: 0, dy: -1, lengthPx: 52, label: 'Apoyo 1 pie (+2)' }],
      },
    ],
  },
  {
    id: 'fig-4-21b',
    figureNumber: '4.21',
    subPart: 'b',
    fileName: 'fig-4-21b.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (REBA)',
    title: 'Flexión adicional de rodillas en REBA (b): 30°–60° (+1) y > 60° (+2)',
    bookDescription:
      'Tabla 4.26 REBA — Penalización adicional sobre piernas: +1 punto para flexión de rodillas entre 30° y 60°; +2 puntos para flexión superior a 60°.',
    bodiesRule: '2',
    widthPx: 800,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: 'Flexión de rodilla 30°–60° (+1)',
        scoreBadge: '+1 pto',
        focusZone: 'legs_knees',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ hipRFlexionDeg: 26, kneeRFlexionDeg: 46, hipLFlexionDeg: 8, kneeLFlexionDeg: 10 }),
        angleArcs: [{ joint: 'kneeR', refType: 'vertical_down', toJoint: 'ankleR', label: 'α: 30°–60°' }],
      },
      {
        subTitle: 'Flexión de rodilla > 60° (+2)',
        scoreBadge: '+2 ptos',
        focusZone: 'legs_knees',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ hipRFlexionDeg: 58, kneeRFlexionDeg: 82, hipLFlexionDeg: 8, kneeLFlexionDeg: 10 }),
        angleArcs: [{ joint: 'kneeR', refType: 'vertical_down', toJoint: 'ankleR', label: 'α > 60°' }],
      },
    ],
  },
  {
    id: 'fig-4-22a',
    figureNumber: '4.22',
    subPart: 'a',
    fileName: 'fig-4-22a.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (REBA)',
    title: 'Posiciones base del brazo en REBA (a): niveles 1, 2, 3 y 4 (−20° a > 90°)',
    bookDescription:
      'Tabla 4.29 REBA — Hombro/brazo: 1 pto (−20° a 20°), 2 ptos (ext. >20° o flex. 20°–45°), 3 ptos (45°–90°) y 4 ptos (>90°).',
    bodiesRule: '2',
    widthPx: 1560,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: '1 pto: −20° a 20°',
        scoreBadge: '1 pto',
        focusZone: 'shoulder_arm',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ shoulderRFlexionDeg: 12, elbowRFlexionDeg: 18 }),
        angleArcs: [{ joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: '−20° a 20°' }],
      },
      {
        subTitle: '2 ptos: 20°–45° (o ext. > 20°)',
        scoreBadge: '2 ptos',
        focusZone: 'shoulder_arm',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ shoulderRFlexionDeg: 35, elbowRFlexionDeg: 22 }),
        angleArcs: [{ joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: '20°–45°' }],
      },
      {
        subTitle: '3 ptos: flexión 45°–90°',
        scoreBadge: '3 ptos',
        focusZone: 'shoulder_arm',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ shoulderRFlexionDeg: 70, elbowRFlexionDeg: 20 }),
        angleArcs: [{ joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: '45°–90°' }],
      },
      {
        subTitle: '4 ptos: flexión > 90°',
        scoreBadge: '4 ptos',
        focusZone: 'shoulder_arm',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ shoulderRFlexionDeg: 112, elbowRFlexionDeg: 16 }),
        angleArcs: [{ joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: '> 90°' }],
      },
    ],
  },
  {
    id: 'fig-4-22b',
    figureNumber: '4.22',
    subPart: 'b',
    fileName: 'fig-4-22b.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (REBA)',
    title: 'Modificaciones del brazo en REBA (b): hombro elevado (+1), abducido/rotado (+1) y apoyo (−1)',
    bookDescription:
      'Tabla 4.30 REBA — +1 punto si el hombro está elevado; +1 punto si el brazo está abducido/rotado; −1 punto si existe apoyo o postura a favor de la gravedad.',
    bodiesRule: '2',
    widthPx: 1200,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: 'Hombro elevado (+1)',
        scoreBadge: '+1 pto',
        focusZone: 'shoulder_arm',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({ shoulderRElevated: true, shoulderRAbductionDeg: 16, elbowRFlexionDeg: 55 }),
        forceVectors: [{ atJoint: 'shoulderR', dx: 0, dy: -1, lengthPx: 46, label: 'Elev. (+1)' }],
      },
      {
        subTitle: 'Brazo abducido / rotado (+1)',
        scoreBadge: '+1 pto',
        focusZone: 'shoulder_arm',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({ shoulderRAbductionDeg: 50, shoulderRRotationDeg: 28, elbowRFlexionDeg: 45 }),
        angleArcs: [{ joint: 'shoulderR', refType: 'vertical_down', toJoint: 'elbowR', label: 'Abd. (+1)' }],
      },
      {
        subTitle: 'Brazo con punto de apoyo (−1)',
        scoreBadge: '−1 pto',
        focusZone: 'shoulder_arm',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ shoulderRFlexionDeg: 35, elbowRFlexionDeg: 78, prop: 'work_desk_support' }),
        forceVectors: [{ atJoint: 'elbowR', dx: 0, dy: -1, lengthPx: 46, label: 'Apoyo (−1)' }],
      },
    ],
  },
  {
    id: 'fig-4-23',
    figureNumber: '4.23',
    fileName: 'fig-4-23.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (REBA)',
    title: 'Posiciones del antebrazo en el método REBA',
    bookDescription:
      'Tabla 4.30 REBA — Codo/antebrazo aislado: 1 punto para flexión de 60° a 100°; 2 puntos para flexión <60° o >100°.',
    bodiesRule: '2',
    widthPx: 800,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: '1 punto: flexión de 60° a 100°',
        scoreBadge: '1 pto',
        focusZone: 'elbow_forearm',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ shoulderRFlexionDeg: 8, elbowRFlexionDeg: 80 }),
        angleArcs: [{ joint: 'elbowR', refType: 'vertical_down', toJoint: 'wristR', label: 'α: 60°–100°' }],
      },
      {
        subTitle: '2 puntos: flexión < 60° o > 100°',
        scoreBadge: '2 ptos',
        focusZone: 'elbow_forearm',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ shoulderRFlexionDeg: 8, elbowRFlexionDeg: 35 }),
        angleArcs: [{ joint: 'elbowR', refType: 'vertical_down', toJoint: 'wristR', label: 'α < 60° / > 100°' }],
      },
    ],
  },
  {
    id: 'fig-4-24',
    figureNumber: '4.24',
    fileName: 'fig-4-24.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (REBA)',
    title: 'Posiciones de la muñeca en el método REBA',
    bookDescription:
      'Tablas 4.31 y 4.32 REBA — Mano/muñeca aislada: 1 punto para flexión/extensión 0°–15°; 2 puntos para >15° (+1 si desviación o torsión).',
    bodiesRule: '2',
    widthPx: 800,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: '1 punto: flexión/extensión 0°–15°',
        scoreBadge: '1 pto',
        focusZone: 'wrist_hand',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ elbowRFlexionDeg: 90, wristRFlexionDeg: 10 }),
        angleArcs: [{ joint: 'wristR', refType: 'horizontal', toJoint: 'handR', label: 'α: 0°–15°' }],
      },
      {
        subTitle: '2 puntos: > 15° (+1 si desviación)',
        scoreBadge: '2 (+1) ptos',
        focusZone: 'wrist_hand',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ elbowRFlexionDeg: 90, wristRFlexionDeg: -28, wristRDeviationDeg: 15 }),
        angleArcs: [{ joint: 'wristR', refType: 'horizontal', toJoint: 'handR', label: 'α > 15°' }],
      },
    ],
  },
  {
    id: 'fig-4-25',
    figureNumber: '4.25',
    fileName: 'fig-4-25.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (REBA)',
    title: 'Procedimiento de aplicación del método REBA',
    bookDescription:
      'Flujograma técnico del método REBA: Grupo A (Tronco, Cuello, Piernas) + Carga = C; Grupo B (Brazo, Antebrazo, Muñeca) + Agarre = D; Tabla 4.37 + Actividad Muscular = Puntuación Final (1–15).',
    bodiesRule: 'diagrama',
    widthPx: 640,
    heightPx: 800,
    renderMode: 'diagram',
    diagramId: 'fig_4_25_reba_flow',
  },
  {
    id: 'fig-4-26',
    figureNumber: '4.26',
    fileName: 'fig-4-26.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (OWAS)',
    title: 'Ejemplo de registro de observaciones del método OWAS',
    bookDescription:
      'Estructura de codificación de 4 dígitos (Espalda-Brazos-Piernas-Carga), conteo muestral de frecuencias y clasificación en Categorías de Acción 1 a 4.',
    bodiesRule: 'diagrama',
    widthPx: 800,
    heightPx: 520,
    renderMode: 'diagram',
    diagramId: 'fig_4_26_owas_table',
  },
  {
    id: 'fig-4-27a',
    figureNumber: '4.27',
    subPart: 'a',
    fileName: 'fig-4-27a.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (OWAS)',
    title: 'Posiciones de la espalda en OWAS (a): Espalda recta (Código 1)',
    bookDescription:
      'Tabla 4.38 OWAS — Código 1: espalda recta y alineada en el plano frontal/sagital (< 20° de inclinación o giro).',
    bodiesRule: '1',
    widthPx: 480,
    heightPx: 640,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Código 1: Espalda recta (< 20°)',
        scoreBadge: 'Dígito 1',
        focusZone: 'full_body',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          trunkFlexionDeg: 3,
          shoulderRFlexionDeg: 4,
          shoulderLFlexionDeg: 4,
          shoulderRAbductionDeg: 4,
          shoulderLAbductionDeg: 4,
          elbowRFlexionDeg: 9,
          elbowLFlexionDeg: 9,
          handGripMode: 'relaxed',
        }),
        angleArcs: [{ joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: 'α < 20°' }],
      },
    ],
  },
  {
    id: 'fig-4-27b',
    figureNumber: '4.27',
    subPart: 'b',
    fileName: 'fig-4-27b.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (OWAS)',
    title: 'Posiciones de la espalda en OWAS (b): Flexionada y/o con torsión (Códigos 2 a 4)',
    bookDescription:
      'Tabla 4.38 OWAS — Código 2: flexionada (≥20°); Código 3: con torsión o inclinación lateral; Código 4: flexionada y girada simultáneamente.',
    bodiesRule: '2',
    widthPx: 1200,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: 'Código 2: Espalda flexionada (≥ 20°)',
        scoreBadge: 'Dígito 2',
        focusZone: 'full_body',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          trunkFlexionDeg: 38,
          neckFlexionDeg: 8,
          shoulderRFlexionDeg: 34,
          shoulderLFlexionDeg: 34,
          elbowRFlexionDeg: 24,
          elbowLFlexionDeg: 24,
        }),
        angleArcs: [{ joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: '≥ 20°' }],
      },
      {
        subTitle: 'Código 3: Con giro o inclinación lateral',
        scoreBadge: 'Dígito 3',
        focusZone: 'full_body',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({
          trunkFlexionDeg: 6,
          trunkLateralDeg: 18,
          trunkTwistDeg: 26,
          shoulderRFlexionDeg: 14,
          shoulderLFlexionDeg: 10,
          elbowRFlexionDeg: 22,
          elbowLFlexionDeg: 18,
        }),
      },
      {
        subTitle: 'Código 4: Flexionada y girada',
        scoreBadge: 'Dígito 4',
        focusZone: 'full_body',
        cameraPreset: 'isometric',
        pose: makeNeutralPose({
          trunkFlexionDeg: 42,
          trunkLateralDeg: 14,
          trunkTwistDeg: 28,
          shoulderRFlexionDeg: 38,
          shoulderLFlexionDeg: 32,
          elbowRFlexionDeg: 28,
          elbowLFlexionDeg: 26,
        }),
        angleArcs: [{ joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: 'Flex. + Giro' }],
      },
    ],
  },
  {
    id: 'fig-4-28a',
    figureNumber: '4.28',
    subPart: 'a',
    fileName: 'fig-4-28a.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (OWAS)',
    title: 'Posiciones de los brazos en OWAS (a): Ambos bajo nivel de hombros (Código 1)',
    bookDescription:
      'Tabla 4.39 OWAS — Código 1: ambos brazos situados íntegramente por debajo del nivel de los hombros.',
    bodiesRule: '1',
    widthPx: 480,
    heightPx: 640,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Código 1: Ambos brazos bajo hombros',
        scoreBadge: 'Dígito 1',
        focusZone: 'full_body',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({
          shoulderRFlexionDeg: 8,
          shoulderLFlexionDeg: 8,
          shoulderRAbductionDeg: 5,
          shoulderLAbductionDeg: 5,
          elbowRFlexionDeg: 14,
          elbowLFlexionDeg: 14,
          handGripMode: 'relaxed',
        }),
      },
    ],
  },
  {
    id: 'fig-4-28b',
    figureNumber: '4.28',
    subPart: 'b',
    fileName: 'fig-4-28b.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (OWAS)',
    title: 'Posiciones de los brazos en OWAS (b): Brazo(s) sobre nivel del hombro (Códigos 2 y 3)',
    bookDescription:
      'Tabla 4.39 OWAS — Código 2: un brazo al nivel o sobre el hombro; Código 3: ambos brazos al nivel o por encima de los hombros.',
    bodiesRule: '2',
    widthPx: 800,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: 'Código 2: Un brazo al nivel o sobre hombro',
        scoreBadge: 'Dígito 2',
        focusZone: 'full_body',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({
          shoulderLFlexionDeg: 132,
          shoulderLAbductionDeg: 36,
          elbowLFlexionDeg: 34,
          shoulderRFlexionDeg: 4,
          shoulderRAbductionDeg: 5,
          elbowRFlexionDeg: 10,
          handGripMode: 'relaxed',
        }),
        angleArcs: [{ joint: 'shoulderL', refType: 'vertical_down', toJoint: 'elbowL', label: '1 brazo ↑' }],
      },
      {
        subTitle: 'Código 3: Ambos brazos sobre nivel de hombros',
        scoreBadge: 'Dígito 3',
        focusZone: 'full_body',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({
          shoulderLFlexionDeg: 138,
          shoulderLAbductionDeg: 34,
          elbowLFlexionDeg: 32,
          shoulderRFlexionDeg: 138,
          shoulderRAbductionDeg: 34,
          elbowRFlexionDeg: 32,
          handGripMode: 'relaxed',
        }),
        angleArcs: [{ joint: 'shoulderR', refType: 'vertical_down', toJoint: 'elbowR', label: '2 brazos ↑' }],
      },
    ],
  },
  {
    id: 'fig-4-29a',
    figureNumber: '4.29',
    subPart: 'a',
    fileName: 'fig-4-29a.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (OWAS)',
    title: 'Posiciones de las piernas en OWAS (a): Sentado (Código 1)',
    bookDescription:
      'Tabla 4.40 OWAS — Código 1: trabajador en sedestación con piernas libres y tronco equilibrado.',
    bodiesRule: '1',
    widthPx: 480,
    heightPx: 640,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Código 1: Sentado',
        scoreBadge: 'Dígito 1',
        focusZone: 'full_body',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ stanceMode: 'seated', prop: 'chair', hipRFlexionDeg: 90, kneeRFlexionDeg: 90, hipLFlexionDeg: 90, kneeLFlexionDeg: 90 }),
      },
    ],
  },
  {
    id: 'fig-4-29b',
    figureNumber: '4.29',
    subPart: 'b',
    fileName: 'fig-4-29b.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (OWAS)',
    title: 'Posiciones de las piernas en OWAS (b): De pie con dos piernas rectas (Código 2)',
    bookDescription:
      'Tabla 4.40 OWAS — Código 2: bipedestación estática natural con ambas piernas extendidas y apoyo plantar simétrico.',
    bodiesRule: '1',
    widthPx: 480,
    heightPx: 640,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Código 2: Bipedestación con 2 piernas rectas',
        scoreBadge: 'Dígito 2',
        focusZone: 'full_body',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({
          stanceMode: 'standing',
          trunkFlexionDeg: 1,
          neckFlexionDeg: 2,
          shoulderRFlexionDeg: 3,
          shoulderLFlexionDeg: 3,
          shoulderRAbductionDeg: 4,
          shoulderLAbductionDeg: 4,
          elbowRFlexionDeg: 9,
          elbowLFlexionDeg: 9,
          kneeRFlexionDeg: 2,
          kneeLFlexionDeg: 2,
          handGripMode: 'relaxed',
        }),
        forceVectors: [
          { atJoint: 'ankleR', dx: 0, dy: -1, lengthPx: 42, label: 'F/2' },
          { atJoint: 'ankleL', dx: 0, dy: -1, lengthPx: 42, label: 'F/2' },
        ],
        noteBottom: 'Bipedestación neutra equilibrada: eje raquídeo alineado y reparto podal 50% / 50%',
      },
    ],
  },
  {
    id: 'fig-4-29c',
    figureNumber: '4.29',
    subPart: 'c',
    fileName: 'fig-4-29c.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (OWAS)',
    title: 'Posiciones de las piernas en OWAS (c): De pie con peso en una pierna recta (Código 3)',
    bookDescription:
      'Tabla 4.40 OWAS — Código 3: de pie descargando el peso corporal sobre una pierna extendida.',
    bodiesRule: '1',
    widthPx: 480,
    heightPx: 640,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Código 3: Peso sobre 1 pierna recta',
        scoreBadge: 'Dígito 3',
        focusZone: 'full_body',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({
          stanceMode: 'one_leg',
          trunkLateralDeg: 4,
          shoulderRAbductionDeg: 5,
          shoulderLAbductionDeg: 5,
          elbowRFlexionDeg: 11,
          elbowLFlexionDeg: 11,
          hipLFlexionDeg: 22,
          kneeLFlexionDeg: 42,
          handGripMode: 'relaxed',
        }),
        forceVectors: [{ atJoint: 'ankleR', dx: 0, dy: -1, lengthPx: 48, label: 'Apoyo principal' }],
      },
    ],
  },
  {
    id: 'fig-4-29d',
    figureNumber: '4.29',
    subPart: 'd',
    fileName: 'fig-4-29d.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (OWAS)',
    title: 'Posiciones de las piernas en OWAS (d): Códigos 4, 5, 6 y 7',
    bookDescription:
      'Tabla 4.40 OWAS — Código 4 (2 piernas flexionadas), Código 5 (1 pierna flexionada), Código 6 (de rodillas) y Código 7 (caminando).',
    bodiesRule: '2',
    widthPx: 1560,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: 'Código 4: 2 piernas flexionadas',
        scoreBadge: 'Dígito 4',
        focusZone: 'legs_knees',
        cameraPreset: 'isometric',
        pose: makeNeutralPose({
          stanceMode: 'squatting',
          trunkFlexionDeg: 14,
          hipRFlexionDeg: 64,
          kneeRFlexionDeg: 88,
          ankleRDorsiflexionDeg: 24,
          hipLFlexionDeg: 64,
          kneeLFlexionDeg: 88,
          ankleLDorsiflexionDeg: 24,
        }),
        angleArcs: [{ joint: 'kneeR', refType: 'vertical_down', toJoint: 'ankleR', label: '2 flex. > 30°' }],
      },
      {
        subTitle: 'Código 5: 1 pierna flexionada',
        scoreBadge: 'Dígito 5',
        focusZone: 'legs_knees',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          stanceMode: 'one_leg',
          trunkFlexionDeg: 10,
          hipRFlexionDeg: 48,
          kneeRFlexionDeg: 74,
          hipLFlexionDeg: 12,
          kneeLFlexionDeg: 16,
        }),
        angleArcs: [{ joint: 'kneeR', refType: 'vertical_down', toJoint: 'ankleR', label: '1 flex.' }],
      },
      {
        subTitle: 'Código 6: Arrodillado',
        scoreBadge: 'Dígito 6',
        focusZone: 'legs_knees',
        cameraPreset: 'isometric',
        pose: makeNeutralPose({
          stanceMode: 'kneeling',
          trunkFlexionDeg: 6,
          hipRFlexionDeg: 2,
          kneeRFlexionDeg: 92,
          ankleRDorsiflexionDeg: -38,
          hipLFlexionDeg: 2,
          kneeLFlexionDeg: 92,
          ankleLDorsiflexionDeg: -38,
        }),
      },
      {
        subTitle: 'Código 7: Caminando / desplazamiento',
        scoreBadge: 'Dígito 7',
        focusZone: 'full_body',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          stanceMode: 'walking',
          trunkFlexionDeg: 4,
          shoulderRFlexionDeg: -16,
          shoulderLFlexionDeg: 22,
          elbowRFlexionDeg: 26,
          elbowLFlexionDeg: 28,
          hipRFlexionDeg: 24,
          kneeRFlexionDeg: 14,
          hipLFlexionDeg: -16,
          kneeLFlexionDeg: 28,
        }),
      },
    ],
  },
  {
    id: 'fig-4-30',
    figureNumber: '4.30',
    fileName: 'fig-4-30.png',
    chapter: 4,
    chapterTitle: 'Cap. 4 · Carga Postural (OWAS)',
    title: 'Magnitud de la carga o fuerza en el método OWAS',
    bookDescription:
      'Tabla 4.42 OWAS — cuarto dígito del código postural: Código 1 (< 10 kg), Código 2 (10 a 20 kg) y Código 3 (> 20 kg).',
    bodiesRule: 'diagrama',
    widthPx: 800,
    heightPx: 520,
    renderMode: 'diagram',
    diagramId: 'fig_4_30_owas_loads',
  },

  // =========================================================================
  // CAPÍTULO 5. MANIPULACIÓN MANUAL DE CARGAS (NIOSH Y SNOOK-CIRIELLO)
  // =========================================================================
  {
    id: 'fig-5-01',
    figureNumber: '5.1',
    fileName: 'fig-5-01.png',
    chapter: 5,
    chapterTitle: 'Cap. 5 · Manipulación de Cargas',
    title: 'Fuerza de compresión sobre el disco L5/S1 según el brazo de palanca',
    bookDescription:
      'Segmento lumbosacro L5/S1 aislado: efecto multiplicador del brazo de palanca horizontal sobre el momento flexor y la fuerza compresiva intradiscal.',
    bodiesRule: '1',
    widthPx: 480,
    heightPx: 640,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Palanca biomecánica y compresión en disco L5/S1',
        scoreBadge: 'Foco L5/S1',
        focusZone: 'lumbar_l5s1',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          trunkFlexionDeg: 45,
          neckFlexionDeg: -8,
          shoulderRFlexionDeg: 55,
          shoulderLFlexionDeg: 55,
          shoulderRAbductionDeg: -6,
          shoulderLAbductionDeg: -6,
          elbowRFlexionDeg: 35,
          elbowLFlexionDeg: 35,
          hipRFlexionDeg: 14,
          kneeRFlexionDeg: 18,
          ankleRDorsiflexionDeg: 4,
          hipLFlexionDeg: 14,
          kneeLFlexionDeg: 18,
          ankleLDorsiflexionDeg: 4,
          prop: 'box_load',
          handGripMode: 'box_cradle',
          loadKg: 18,
          highlightGroup: 'l5s1_disc',
        }),
        angleArcs: [{ joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: 'α = 45°' }],
        forceVectors: [
          { atJoint: 'l5s1', dx: 0.4, dy: 0.9, lengthPx: 62, label: 'Fc disco L5/S1 (>3,4 kN)' },
          { atJoint: 'handR', dx: 0, dy: 1, lengthPx: 52, label: 'F carga (P · g)' },
        ],
        noteBottom: 'M = F · H → A mayor distancia H, mayor compresión sobre L5/S1',
      },
    ],
  },
  {
    id: 'fig-5-02',
    figureNumber: '5.2',
    fileName: 'fig-5-02.png',
    chapter: 5,
    chapterTitle: 'Cap. 5 · Manipulación de Cargas',
    title: 'Medición de la distancia horizontal (H) y de la altura de la carga (V) en NIOSH',
    bookDescription:
      'Definición geométrica de H (punto medio entre tobillos a proyección del agarre, 25–63 cm) y V (altura vertical de las manos respecto al suelo, 0–175 cm).',
    bodiesRule: '1',
    widthPx: 480,
    heightPx: 640,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Variables geométricas H y V en el origen',
        scoreBadge: 'HM = 25/H',
        focusZone: 'full_body',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          stanceMode: 'squatting',
          trunkFlexionDeg: 16,
          neckFlexionDeg: 6,
          hipRFlexionDeg: 68,
          kneeRFlexionDeg: 94,
          ankleRDorsiflexionDeg: 26,
          hipLFlexionDeg: 68,
          kneeLFlexionDeg: 94,
          ankleLDorsiflexionDeg: 26,
          shoulderRFlexionDeg: 34,
          shoulderLFlexionDeg: 34,
          shoulderRAbductionDeg: -8,
          shoulderLAbductionDeg: -8,
          elbowRFlexionDeg: 32,
          elbowLFlexionDeg: 32,
          prop: 'box_load',
          handGripMode: 'box_cradle',
          loadKg: 15,
        }),
        dimensions: [
          { fromJoint: 'ankleR', toJoint: 'handR', label: 'H (25–63 cm)', axis: 'horizontal' },
          { fromJoint: 'ankleR', toJoint: 'handR', label: 'V (altura al suelo)', axis: 'vertical' },
        ],
        forceVectors: [{ atJoint: 'handR', dx: 0, dy: 1, lengthPx: 44, label: 'F = m·g' }],
        noteBottom: 'Regla higiénica: espalda recta + rodillas flexionadas · Óptimo H ≤ 25 cm y V = 75 cm',
      },
    ],
  },
  {
    id: 'fig-5-03',
    figureNumber: '5.3',
    fileName: 'fig-5-03.png',
    chapter: 5,
    chapterTitle: 'Cap. 5 · Manipulación de Cargas',
    title: 'Desplazamiento vertical (D) en vista lateral y ángulo de asimetría (A) en vista superior',
    bookDescription:
      'Definición de D = |V₂ − V₁| para el multiplicador DM y ángulo de torsión asimétrica A (0°–135°) respecto al plano sagital neutro para AM.',
    bodiesRule: 'diagrama',
    widthPx: 800,
    heightPx: 520,
    renderMode: 'diagram',
    diagramId: 'fig_5_03_niosh_d_a',
  },
  {
    id: 'fig-5-04',
    figureNumber: '5.4',
    fileName: 'fig-5-04.png',
    chapter: 5,
    chapterTitle: 'Cap. 5 · Manipulación de Cargas',
    title: 'Clasificación del agarre en NIOSH: bueno, regular y malo',
    bookDescription:
      'Tabla 5.8 NIOSH — Agarre Bueno (CM = 1,00, asas anatómicas), Regular (CM = 0,95/1,00, flexión digital 90° sin asas) y Malo (CM = 0,90, bulto irregular).',
    bodiesRule: 'diagrama',
    widthPx: 800,
    heightPx: 520,
    renderMode: 'diagram',
    diagramId: 'fig_5_04_niosh_couplings',
  },
  {
    id: 'fig-5-05',
    figureNumber: '5.5',
    fileName: 'fig-5-05.png',
    chapter: 5,
    chapterTitle: 'Cap. 5 · Manipulación de Cargas',
    title: 'Alturas de referencia en las tablas de Snook y Ciriello',
    bookDescription:
      'Zonas verticales de referencia psicofísica: desde el suelo hasta las rodillas/nudillos, entre nudillos y hombros, y por encima de los hombros/cabeza.',
    bodiesRule: '1',
    widthPx: 480,
    heightPx: 640,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Zonas verticales: Nudillos · Hombros · Alcance sup.',
        scoreBadge: 'Snook y Ciriello',
        focusZone: 'full_body',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ shoulderRFlexionDeg: 25, elbowRFlexionDeg: 65 }),
        dimensions: [
          { fromJoint: 'ankleR', toJoint: 'wristR', label: 'Suelo a nudillos (~75 cm)', axis: 'vertical' },
          { fromJoint: 'wristR', toJoint: 'shoulderR', label: 'Nudillos a hombros (~140 cm)', axis: 'vertical' },
          { fromJoint: 'shoulderR', toJoint: 'head', label: 'Sobre hombros / cabeza', axis: 'vertical' },
        ],
        noteBottom: 'Tablas 5.11 a 5.15: pesos y fuerzas máximas aceptables',
      },
    ],
  },

  // =========================================================================
  // CAPÍTULO 6. MOVIMIENTOS REPETITIVOS (OCRA Y JSI)
  // =========================================================================
  {
    id: 'fig-6-01',
    figureNumber: '6.1',
    fileName: 'fig-6-01.png',
    chapter: 6,
    chapterTitle: 'Cap. 6 · Movimientos Repetitivos',
    title: 'Estructura del método OCRA: factores y cálculo del índice de exposición',
    bookDescription:
      'Relación entre Acciones Técnicas Actuales (ATA) y Acciones de Referencia (30 × Fm × Fp × Ff × Fe × Fa × Ft × Fc) para determinar el Índice OCRA.',
    bodiesRule: 'diagrama',
    widthPx: 640,
    heightPx: 800,
    renderMode: 'diagram',
    diagramId: 'fig_6_01_ocra_structure',
  },
  {
    id: 'fig-6-02',
    figureNumber: '6.2',
    fileName: 'fig-6-02.png',
    chapter: 6,
    chapterTitle: 'Cap. 6 · Movimientos Repetitivos',
    title: 'Ejemplos de acciones técnicas dinámicas y estáticas en OCRA',
    bookDescription:
      'Diferenciación entre acciones técnicas dinámicas (alcanzar, tomar, posicionar, insertar) y prensión estática sostenida (pinza o agarre palmar ≥ 5 s).',
    bodiesRule: 'diagrama',
    widthPx: 800,
    heightPx: 520,
    renderMode: 'diagram',
    diagramId: 'fig_6_02_ocra_actions',
  },
  {
    id: 'fig-6-03a',
    figureNumber: '6.3',
    subPart: 'a',
    fileName: 'fig-6-03a.png',
    chapter: 6,
    chapterTitle: 'Cap. 6 · Movimientos Repetitivos',
    title: 'Posturas forzadas en lista de verificación OCRA (a): hombro y codo',
    bookDescription:
      'Evaluación articular aislada en Check-List OCRA: elevación/abducción de hombro >80° y pronosupinación o flexo-extensión amplia de codo (>60°).',
    bodiesRule: '2',
    widthPx: 800,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: 'Hombro en flexión/abducción > 80°',
        scoreBadge: 'Hombro OCRA',
        focusZone: 'shoulder_arm',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({ shoulderRFlexionDeg: 88, shoulderRAbductionDeg: 25, elbowRFlexionDeg: 45 }),
        angleArcs: [{ joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: 'α > 80°' }],
      },
      {
        subTitle: 'Codo: flexo-extensión / giro > 60°',
        scoreBadge: 'Codo OCRA',
        focusZone: 'elbow_forearm',
        cameraPreset: 'isometric',
        pose: makeNeutralPose({ elbowRFlexionDeg: 105, forearmRPronationDeg: 75 }),
        angleArcs: [{ joint: 'elbowR', refType: 'vertical_down', toJoint: 'wristR', label: 'α > 60°' }],
      },
    ],
  },
  {
    id: 'fig-6-03b',
    figureNumber: '6.3',
    subPart: 'b',
    fileName: 'fig-6-03b.png',
    chapter: 6,
    chapterTitle: 'Cap. 6 · Movimientos Repetitivos',
    title: 'Posturas forzadas en lista de verificación OCRA (b): muñeca y prensión digital',
    bookDescription:
      'Segmento distal mano/muñeca aislado: flexión o extensión radiocarpiana >45°, desviación >20° y prensión en pinza mantenida.',
    bodiesRule: '1',
    widthPx: 480,
    heightPx: 640,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Muñeca > 45° y prensión digital en pinza',
        scoreBadge: 'Muñeca / Mano OCRA',
        focusZone: 'wrist_hand',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          elbowRFlexionDeg: 90,
          wristRFlexionDeg: 48,
          wristRDeviationDeg: 18,
          handGripMode: 'pinch',
        }),
        angleArcs: [{ joint: 'wristR', refType: 'horizontal', toJoint: 'handR', label: 'α > 45°' }],
        forceVectors: [{ atJoint: 'handR', dx: 0, dy: -1, lengthPx: 46, label: 'F pinza digital' }],
        noteBottom: 'Penaliza según fracción del tiempo de ciclo (1/3, 2/3 o 3/3)',
      },
    ],
  },
  {
    id: 'fig-6-04',
    figureNumber: '6.4',
    fileName: 'fig-6-04.png',
    chapter: 6,
    chapterTitle: 'Cap. 6 · Movimientos Repetitivos',
    title: 'Posturas de la mano y de la muñeca consideradas en el método JSI',
    bookDescription:
      'Tabla 6.22 Job Strain Index (Moore y Garg): gradación desde muñeca neutra (PM = 1) hasta extensión/flexión marcada y desviación extrema (PM = 4–5).',
    bodiesRule: 'diagrama',
    widthPx: 800,
    heightPx: 520,
    renderMode: 'diagram',
    diagramId: 'fig_6_04_jsi_wrists',
  },

  // =========================================================================
  // CAPÍTULO 7. AMBIENTE TÉRMICO (FANGER Y WBGT)
  // =========================================================================
  {
    id: 'fig-7-01',
    figureNumber: '7.1',
    fileName: 'fig-7-01.png',
    chapter: 7,
    chapterTitle: 'Cap. 7 · Ambiente Térmico',
    title: 'Variables ambientales y personales que intervienen en el método de Fanger',
    bookDescription:
      'Balance térmico humano (ISO 7730): cuatro variables ambientales (ta, tr, HR, va) y dos variables personales (tasa metabólica M y aislamiento clo).',
    bodiesRule: 'diagrama',
    widthPx: 800,
    heightPx: 520,
    renderMode: 'diagram',
    diagramId: 'fig_7_01_fanger_vars',
  },
  {
    id: 'fig-7-02',
    figureNumber: '7.2',
    fileName: 'fig-7-02.png',
    chapter: 7,
    chapterTitle: 'Cap. 7 · Ambiente Térmico',
    title: 'Relación entre el voto medio estimado (PMV) y el porcentaje de insatisfechos (PPD)',
    bookDescription:
      'Gráfico real calculado con la ecuación analítica de Fanger (ISO 7730): PPD = 100 − 95·exp(−0,03353·PMV⁴ − 0,2179·PMV²), mínimo 5% en PMV = 0.',
    bodiesRule: 'diagrama',
    widthPx: 800,
    heightPx: 520,
    isExistingRealChart: true,
    renderMode: 'real_chart',
    diagramId: 'fig_7_02_pmv_ppd_real',
  },
  {
    id: 'fig-7-03',
    figureNumber: '7.3',
    fileName: 'fig-7-03.png',
    chapter: 7,
    chapterTitle: 'Cap. 7 · Ambiente Térmico',
    title: 'Instrumento de medición del índice WBGT: tres sensores térmicos',
    bookDescription:
      'Esquema técnico del monitor de estrés térmico TGBH/WBGT: esfera negra mate de cobre (Tg, Ø 150 mm), bulbo húmedo natural con mecha (Tbh) y bulbo seco (Ta).',
    bodiesRule: 'diagrama',
    widthPx: 800,
    heightPx: 520,
    renderMode: 'diagram',
    diagramId: 'fig_7_03_wbgt_sensors',
  },

  // =========================================================================
  // CAPÍTULO 8. VIBRACIONES MECÁNICAS (ISO 2631 E ISO 5349)
  // =========================================================================
  {
    id: 'fig-8-01',
    figureNumber: '8.1',
    fileName: 'fig-8-01.png',
    chapter: 8,
    chapterTitle: 'Cap. 8 · Vibraciones Mecánicas',
    title: 'Ejes de vibración en el cuerpo entero con el trabajador sentado y de pie',
    bookDescription:
      'Norma ISO 2631: ejes ortogonales X (anteroposterior, k=1,4 sentado), Y (lateral, k=1,4 sentado) y Z (vertical cráneo-caudal, k=1,0).',
    bodiesRule: '2',
    widthPx: 800,
    heightPx: 520,
    renderMode: '3d_dual',
    panels: [
      {
        subTitle: 'Trabajador sentado (Z=1,0 · X,Y=1,4)',
        scoreBadge: 'ISO 2631 Sentado',
        focusZone: 'full_body',
        cameraPreset: 'isometric',
        pose: makeNeutralPose({ stanceMode: 'seated', prop: 'chair', hipRFlexionDeg: 90, kneeRFlexionDeg: 90, hipLFlexionDeg: 90, kneeLFlexionDeg: 90 }),
        forceVectors: [
          { atJoint: 'pelvis', dx: 0, dy: -1, lengthPx: 58, label: 'Eje Z (vertical)' },
          { atJoint: 'pelvis', dx: 0.85, dy: 0.35, lengthPx: 52, label: 'Eje X (1,4)' },
          { atJoint: 'pelvis', dx: -0.75, dy: 0.4, lengthPx: 48, label: 'Eje Y (1,4)' },
        ],
      },
      {
        subTitle: 'Trabajador de pie (X, Y, Z = 1,0)',
        scoreBadge: 'ISO 2631 De pie',
        focusZone: 'full_body',
        cameraPreset: 'isometric',
        pose: makeNeutralPose({ stanceMode: 'standing' }),
        forceVectors: [
          { atJoint: 'ankleR', dx: 0, dy: -1, lengthPx: 58, label: 'Eje Z (vertical)' },
          { atJoint: 'ankleR', dx: 0.85, dy: 0.35, lengthPx: 50, label: 'Eje X' },
          { atJoint: 'ankleR', dx: -0.75, dy: 0.4, lengthPx: 46, label: 'Eje Y' },
        ],
      },
    ],
  },
  {
    id: 'fig-8-02',
    figureNumber: '8.2',
    fileName: 'fig-8-02.png',
    chapter: 8,
    chapterTitle: 'Cap. 8 · Vibraciones Mecánicas',
    title: 'Ejes de medición de la vibración mano-brazo (ISO 5349)',
    bookDescription:
      'Sistema de coordenadas biodinámico y basicéntrico centrado en la cabeza del tercer metacarpiano sobre empuñadura vibrante (Xh, Yh, Zh, ponderación Wh).',
    bodiesRule: 'diagrama',
    widthPx: 800,
    heightPx: 520,
    renderMode: 'diagram',
    diagramId: 'fig_8_02_hand_arm_axes',
  },

  // =========================================================================
  // CAPÍTULO 9 Y CAPÍTULO 10. PROTOCOLOS, CICLO Y PRIORIZACIÓN
  // =========================================================================
  {
    id: 'fig-9-01',
    figureNumber: '9.1',
    fileName: 'fig-9-01.png',
    chapter: 9,
    chapterTitle: 'Cap. 9 · Planillas y Protocolos',
    title: 'Relación entre la planilla de registro, el método de evaluación y el informe',
    bookDescription:
      'Articulación documental: la planilla local indica qué registrar y cada cuánto; el método internacional define cómo medir y valorar; el informe integra y fundamenta.',
    bodiesRule: 'diagrama',
    widthPx: 640,
    heightPx: 800,
    renderMode: 'diagram',
    diagramId: 'fig_9_01_protocol_relation',
  },
  {
    id: 'fig-10-01',
    figureNumber: '10.1',
    fileName: 'fig-10-01.png',
    chapter: 10,
    chapterTitle: 'Cap. 10 · Priorización e Informe',
    title: 'Ciclo de la evaluación ergonómica: identificación, evaluación, medidas y verificación',
    bookDescription:
      'Proceso continuo cerrado en cuatro etapas obligatorias: ninguna evaluación concluye sin implementación de mejoras y reevaluación de eficacia.',
    bodiesRule: 'diagrama',
    widthPx: 640,
    heightPx: 800,
    renderMode: 'diagram',
    diagramId: 'fig_10_01_eval_cycle',
  },
  {
    id: 'fig-10-02',
    figureNumber: '10.2',
    fileName: 'fig-10-02.png',
    chapter: 10,
    chapterTitle: 'Cap. 10 · Priorización e Informe',
    title: 'Criterios de priorización de las intervenciones ergonómicas',
    bookDescription:
      'Los seis criterios técnicos de decisión (Tabla 10.1) y la jerarquía biomecánica de los 5 factores de riesgo (Tabla 10.2: 1° MMC, 2° Repetitivos, 3° Posturas, 4° Vibraciones, 5° Térmico).',
    bodiesRule: 'diagrama',
    widthPx: 640,
    heightPx: 800,
    renderMode: 'diagram',
    diagramId: 'fig_10_02_priority_criteria',
  },

  // =========================================================================
  // CAPÍTULO 11. INFORME MODELO 1: TENDIDO ELÉCTRICO (ESQUEMAS ANÓNIMOS)
  // =========================================================================
  {
    id: 'fig-11-01',
    figureNumber: '11.1',
    fileName: 'fig-11-01.png',
    chapter: 11,
    chapterTitle: 'Cap. 11 · Informe Redes Eléctricas',
    title: 'Postura del montador al extraer fusibles de un tablero, con los ángulos medidos',
    bookDescription:
      'Esquema sin rasgos identificables (apartado 11.3): operario arrodillado frente a tablero eléctrico con brazo extendido (REBA = 5, riesgo medio).',
    bodiesRule: '1',
    widthPx: 800,
    heightPx: 520,
    isAnonymousCaseSchema: true,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Oficial montador frente a tablero — Ángulos REBA (Punt. = 5)',
        scoreBadge: 'REBA = 5',
        focusZone: 'full_body',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          stanceMode: 'kneeling',
          prop: 'electrical_panel',
          trunkFlexionDeg: 8,
          neckFlexionDeg: 12,
          shoulderRFlexionDeg: 68,
          shoulderLFlexionDeg: 52,
          elbowRFlexionDeg: 35,
          elbowLFlexionDeg: 46,
          hipRFlexionDeg: 2,
          kneeRFlexionDeg: 92,
          ankleRDorsiflexionDeg: -38,
          hipLFlexionDeg: 96,
          kneeLFlexionDeg: 96,
          ankleLDorsiflexionDeg: 0,
        }),
        angleArcs: [
          { joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: 'Brazo 68° (3)' },
          { joint: 'elbowR', refType: 'vertical_down', toJoint: 'wristR', label: 'Antebr. <60° (2)' },
        ],
        forceVectors: [{ atJoint: 'kneeR', dx: 0, dy: -1, lengthPx: 44, label: 'F apoyo rodilla (Piernas=4)' }],
        noteBottom: 'Esquema técnico anónimo en apoyo de caballero sobre suelo (Cap. 11)',
      },
    ],
  },
  {
    id: 'fig-11-02',
    figureNumber: '11.2',
    fileName: 'fig-11-02.png',
    chapter: 11,
    chapterTitle: 'Cap. 11 · Informe Redes Eléctricas',
    title: 'Postura del zanjero durante la extracción de tierra, con los ángulos medidos',
    bookDescription:
      'Esquema anónimo (apartado 11.4.1): apertura de canal de 1,10 m con pala manual, flexión severa de tronco >60° (Tronco=4, RULA Final = 7, actuación urgente).',
    bodiesRule: '1',
    widthPx: 800,
    heightPx: 520,
    isAnonymousCaseSchema: true,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Zanjero en canalización (1,10 m) — RULA = 7 (Nivel 4 Urgente)',
        scoreBadge: 'RULA = 7',
        focusZone: 'full_body',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          prop: 'trench_shovel',
          trunkFlexionDeg: 62,
          trunkTwistDeg: 12,
          neckFlexionDeg: 2,
          shoulderRFlexionDeg: 44,
          shoulderRAbductionDeg: 6,
          elbowRFlexionDeg: 58,
          wristRFlexionDeg: 10,
          shoulderLFlexionDeg: 68,
          shoulderLAbductionDeg: -6,
          elbowLFlexionDeg: 28,
          wristLFlexionDeg: 12,
          handGripMode: 'power_grip',
          hipRFlexionDeg: 38,
          kneeRFlexionDeg: 48,
          ankleRDorsiflexionDeg: 10,
          hipLFlexionDeg: 28,
          kneeLFlexionDeg: 40,
          ankleLDorsiflexionDeg: 12,
        }),
        angleArcs: [
          { joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: 'Tronco 62° (4)' },
          { joint: 'kneeR', refType: 'vertical_down', toJoint: 'ankleR', label: 'Rodilla 48° (2)' },
        ],
        forceVectors: [{ atJoint: 'l5s1', dx: 0.35, dy: 0.9, lengthPx: 54, label: 'Fc L5/S1 elevada' }],
        noteBottom: 'Esquema técnico anónimo — Puntuación C=6, D=7 → RULA Final = 7',
      },
    ],
  },
  {
    id: 'fig-11-03a',
    figureNumber: '11.3',
    subPart: 'a',
    fileName: 'fig-11-03a.png',
    chapter: 11,
    chapterTitle: 'Cap. 11 · Informe Redes Eléctricas',
    title: 'Apisonamiento con pisón de hierro (a): altura de agarre inicial (80–90 cm)',
    bookDescription:
      'Esquema anónimo (apartado 11.4.3): pisón de hierro de 13,2 kg en posición baja de impacto, altura de agarre inicial V₁ = 85 cm respecto al suelo.',
    bodiesRule: '1',
    widthPx: 800,
    heightPx: 520,
    isAnonymousCaseSchema: true,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Fase inicial de agarre: V₁ = 85 cm (80–90 cm) · Pisón 13,2 kg',
        scoreBadge: 'Origen 85 cm',
        focusZone: 'full_body',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          prop: 'iron_tamper_low',
          trunkFlexionDeg: 10,
          shoulderRFlexionDeg: 28,
          shoulderLFlexionDeg: 28,
          elbowRFlexionDeg: 72,
          elbowLFlexionDeg: 72,
          loadKg: 13.2,
        }),
        dimensions: [{ fromJoint: 'ankleR', toJoint: 'handR', label: 'V₁ = 85 cm', axis: 'vertical' }],
        forceVectors: [{ atJoint: 'handR', dx: 0, dy: 1, lengthPx: 48, label: 'F = 13,2 kgf (Lím. 32 kg)' }],
        noteBottom: 'LMC Res. 295/03 Tabla 1: 13,2 kg < 32 kg (Aceptable bajo nivel de hombros)',
      },
    ],
  },
  {
    id: 'fig-11-03b',
    figureNumber: '11.3',
    subPart: 'b',
    fileName: 'fig-11-03b.png',
    chapter: 11,
    chapterTitle: 'Cap. 11 · Informe Redes Eléctricas',
    title: 'Apisonamiento con pisón de hierro (b): altura de agarre final (135–160 cm)',
    bookDescription:
      'Esquema anónimo (apartado 11.4.3): elevación del pisón de 13,2 kg hasta altura final de manos V₂ = 155 cm antes de la caída.',
    bodiesRule: '1',
    widthPx: 800,
    heightPx: 520,
    isAnonymousCaseSchema: true,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Fase final de elevación: V₂ = 155 cm (135–160 cm)',
        scoreBadge: 'Final 155 cm',
        focusZone: 'full_body',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          prop: 'iron_tamper_high',
          trunkFlexionDeg: 4,
          shoulderRFlexionDeg: 96,
          shoulderLFlexionDeg: 96,
          elbowRFlexionDeg: 82,
          elbowLFlexionDeg: 82,
          loadKg: 13.2,
        }),
        dimensions: [{ fromJoint: 'ankleR', toJoint: 'handR', label: 'V₂ = 155 cm', axis: 'vertical' }],
        angleArcs: [{ joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: 'No superar hombros' }],
        noteBottom: 'Condición crítica: evitar elevar las manos por encima del nivel acromial',
      },
    ],
  },
  {
    id: 'fig-11-04',
    figureNumber: '11.4',
    fileName: 'fig-11-04.png',
    chapter: 11,
    chapterTitle: 'Cap. 11 · Informe Redes Eléctricas',
    title: 'Postura del chofer al manipular los comandos de la hidrogrúa, con ángulos medidos',
    bookDescription:
      'Esquema anónimo (apartado 11.5): operador inclinado al costado del camión con rodillas flexionadas y brazo extendido hacia palancas (REBA = 3, riesgo bajo).',
    bodiesRule: '1',
    widthPx: 800,
    heightPx: 520,
    isAnonymousCaseSchema: true,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Operación de palancas de hidrogrúa — REBA = 3 (Riesgo bajo)',
        scoreBadge: 'REBA = 3',
        focusZone: 'full_body',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          prop: 'crane_levers',
          trunkFlexionDeg: 12,
          trunkLateralDeg: 8,
          neckFlexionDeg: -10,
          shoulderRFlexionDeg: 58,
          shoulderRAbductionDeg: 4,
          elbowRFlexionDeg: 44,
          forearmRPronationDeg: 45,
          shoulderLFlexionDeg: 54,
          shoulderLAbductionDeg: 4,
          elbowLFlexionDeg: 48,
          forearmLPronationDeg: -45,
          handGripMode: 'power_grip',
          hipRFlexionDeg: 22,
          kneeRFlexionDeg: 36,
          ankleRDorsiflexionDeg: 14,
          hipLFlexionDeg: 22,
          kneeLFlexionDeg: 36,
          ankleLDorsiflexionDeg: 14,
        }),
        angleArcs: [
          { joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: 'Brazos 54°–58° (3)' },
          { joint: 'kneeR', refType: 'vertical_down', toJoint: 'ankleR', label: 'Rodillas 36° (3)' },
        ],
        noteBottom: 'Grupo A = 3 · Grupo B = 4 · Actividad = 0 → Puntuación Final REBA = 3',
      },
    ],
  },
  {
    id: 'fig-11-05a',
    figureNumber: '11.5',
    subPart: 'a',
    fileName: 'fig-11-05a.png',
    chapter: 11,
    chapterTitle: 'Cap. 11 · Informe Redes Eléctricas',
    title: 'Puesto administrativo (a): vista frontal con rotación cervical hacia el monitor',
    bookDescription:
      'Esquema anónimo (apartado 11.6): monitor ubicado en un extremo del escritorio (1,80 × 1,20 m, h=0,75 m), obligando a rotación sostenida de cabeza y cuello.',
    bodiesRule: '1',
    widthPx: 800,
    heightPx: 520,
    isAnonymousCaseSchema: true,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Vista frontal: rotación cervical sostenida hacia monitor lateral',
        scoreBadge: 'IRAM 3753',
        focusZone: 'full_body',
        cameraPreset: 'frontal',
        pose: makeNeutralPose({
          stanceMode: 'seated',
          prop: 'office_desk_corner_monitor',
          hipRFlexionDeg: 90,
          kneeRFlexionDeg: 90,
          hipLFlexionDeg: 90,
          kneeLFlexionDeg: 90,
          neckTwistDeg: 34,
          shoulderRFlexionDeg: 22,
          shoulderRAbductionDeg: 18,
          elbowRFlexionDeg: 85,
          elbowLFlexionDeg: 85,
        }),
        angleArcs: [{ joint: 'c7', refType: 'vertical_up', toJoint: 'head', label: 'Rotación > 30°' }],
        noteBottom: 'Recomendación: alinear monitor frente al eje sagital del usuario',
      },
    ],
  },
  {
    id: 'fig-11-05b',
    figureNumber: '11.5',
    subPart: 'b',
    fileName: 'fig-11-05b.png',
    chapter: 11,
    chapterTitle: 'Cap. 11 · Informe Redes Eléctricas',
    title: 'Puesto administrativo (b): vista lateral con cotas y ángulos medidos',
    bookDescription:
      'Esquema anónimo lateral (Tabla 11.9): silla fija h=44 cm, prof.=40 cm, apoyabrazos 64 cm, escritorio 75 cm y cono visual entre horizontal y −60°.',
    bodiesRule: '1',
    widthPx: 800,
    heightPx: 520,
    isAnonymousCaseSchema: true,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Vista lateral: silla fija (44 cm), escritorio (75 cm) y línea visual',
        scoreBadge: 'Vista Lateral',
        focusZone: 'full_body',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          stanceMode: 'seated',
          prop: 'office_desk_lateral',
          hipRFlexionDeg: 90,
          kneeRFlexionDeg: 90,
          hipLFlexionDeg: 90,
          kneeLFlexionDeg: 90,
          neckFlexionDeg: 10,
          shoulderRFlexionDeg: 14,
          shoulderLFlexionDeg: 14,
          elbowRFlexionDeg: 88,
          elbowLFlexionDeg: 88,
          forearmRPronationDeg: 65,
          forearmLPronationDeg: -65,
        }),
        angleArcs: [
          { joint: 'elbowR', refType: 'vertical_down', toJoint: 'wristR', label: 'Codo ~90°' },
          { joint: 'kneeR', refType: 'vertical_down', toJoint: 'ankleR', label: 'Rodilla 90°' },
        ],
        dimensions: [{ fromJoint: 'ankleR', toJoint: 'kneeR', label: 'Asiento 44 cm (fijo)', axis: 'vertical' }],
        noteBottom: 'Se recomienda silla regulable (38–54 cm) con soporte lumbar ajustable',
      },
    ],
  },
  {
    id: 'fig-11-06',
    figureNumber: '11.6',
    fileName: 'fig-11-06.png',
    chapter: 11,
    chapterTitle: 'Cap. 11 · Informe Redes Eléctricas',
    title: 'Valores límite umbral para la actividad manual (gráfico NAM)',
    bookDescription:
      'Gráfico de la Resolución 295/03 (ACGIH TLV/AL) ubicando Mano Derecha (NAM = 5, Fuerza Borg = 1) y Mano Izquierda (NAM = 1, Fuerza = 0,5) en Zona de Seguridad.',
    bodiesRule: 'diagrama',
    widthPx: 800,
    heightPx: 520,
    renderMode: 'diagram',
    diagramId: 'fig_11_06_nam_chart',
  },

  // =========================================================================
  // CAPÍTULO 12. INFORME MODELO 2: EMPRESA DE LOGÍSTICA (ESQUEMAS ANÓNIMOS)
  // =========================================================================
  {
    id: 'fig-12-01',
    figureNumber: '12.1',
    fileName: 'fig-12-01.png',
    chapter: 12,
    chapterTitle: 'Cap. 12 · Informe Logística',
    title: 'Ubicación de los tres sectores sobre la curva PMV–PPD, con el límite del 10 %',
    bookDescription:
      'Gráfico real (Tabla 12.4): Carga/descarga (PMV −0,38; PPD 8,0%), Bolsines (PMV −0,27; PPD 6,5%) y Almacén de salud (PMV +0,63; PPD 13,3% > 10%).',
    bodiesRule: 'diagrama',
    widthPx: 800,
    heightPx: 520,
    isExistingRealChart: true,
    renderMode: 'real_chart',
    diagramId: 'fig_12_01_logistics_pmv_real',
  },
  {
    id: 'fig-12-02',
    figureNumber: '12.2',
    fileName: 'fig-12-02.png',
    chapter: 12,
    chapterTitle: 'Cap. 12 · Informe Logística',
    title: 'Muelle de carga con desnivel de 22 cm y caja de camioneta a 55 cm del suelo',
    bookDescription:
      'Esquema acotado (apartado 12.4.2): el desnivel de 22 cm reduce la altura relativa de toma/depósito en la caja del vehículo (55 cm) a solo 33 cm.',
    bodiesRule: 'diagrama',
    widthPx: 800,
    heightPx: 520,
    isAnonymousCaseSchema: true,
    renderMode: 'diagram',
    diagramId: 'fig_12_02_dock_step',
  },
  {
    id: 'fig-12-03',
    figureNumber: '12.3',
    fileName: 'fig-12-03.png',
    chapter: 12,
    chapterTitle: 'Cap. 12 · Informe Logística',
    title: 'Postura del operador al traspasar bultos desde el bin al carro (ángulos REBA)',
    bookDescription:
      'Esquema anónimo (apartado 12.4.2): extracción de bultos de 10 kg dentro del contenedor hacia el carro, obteniendo REBA = 8 (Nivel 3: cambios urgentes).',
    bodiesRule: '1',
    widthPx: 800,
    heightPx: 520,
    isAnonymousCaseSchema: true,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Extracción de bultos (10 kg) dentro del bin hacia el carro — REBA = 8 (Nivel 3)',
        scoreBadge: 'REBA = 8',
        focusZone: 'full_body',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          prop: 'bin_to_cart',
          trunkFlexionDeg: 54,
          trunkTwistDeg: 22,
          neckFlexionDeg: -6,
          shoulderRFlexionDeg: 62,
          shoulderLFlexionDeg: 58,
          shoulderRAbductionDeg: -6,
          shoulderLAbductionDeg: -6,
          elbowRFlexionDeg: 28,
          elbowLFlexionDeg: 30,
          wristRFlexionDeg: 8,
          wristLFlexionDeg: 8,
          handGripMode: 'box_cradle',
          hipRFlexionDeg: 32,
          kneeRFlexionDeg: 42,
          ankleRDorsiflexionDeg: 10,
          hipLFlexionDeg: 26,
          kneeLFlexionDeg: 34,
          ankleLDorsiflexionDeg: 8,
          loadKg: 10,
        }),
        angleArcs: [
          { joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: 'Tronco 54° (+giro)' },
          { joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: 'Brazos 58°–62°' },
          { joint: 'kneeR', refType: 'vertical_down', toJoint: 'ankleR', label: 'Rodilla 42°' },
        ],
        forceVectors: [{ atJoint: 'handR', dx: 0, dy: 1, lengthPx: 46, label: 'Bulto 10 kg (V₁=45 cm → carro 35 cm)' }],
        noteBottom: 'Extracción bimanual en contenedor bin hacia carro · Grupo A=6, Grupo B=6 → REBA = 8 (Nivel 3)',
      },
    ],
  },
  {
    id: 'fig-12-04',
    figureNumber: '12.4',
    fileName: 'fig-12-04.png',
    chapter: 12,
    chapterTitle: 'Cap. 12 · Informe Logística',
    title: 'Alturas de toma (45 cm) y de depósito (35 cm) consideradas en el cálculo NIOSH',
    bookDescription:
      'Esquema comparativo origen-destino (Tabla 12.6): toma dentro del bin a V₁ = 45 cm (IL = 1,37, riesgo moderado) y depósito en carro a V₂ = 35 cm (IL = 0,89).',
    bodiesRule: 'diagrama',
    widthPx: 800,
    heightPx: 520,
    isAnonymousCaseSchema: true,
    renderMode: 'diagram',
    diagramId: 'fig_12_04_niosh_heights',
  },
  {
    id: 'fig-12-05',
    figureNumber: '12.5',
    fileName: 'fig-12-05.png',
    chapter: 12,
    chapterTitle: 'Cap. 12 · Informe Logística',
    title: 'Separación de bolsines con las piernas extendidas y el tronco flexionado',
    bookDescription:
      'Esquema anónimo (apartado 12.4.3): clasificación sobre el suelo incumpliendo la hipótesis postural de rodillas flexionadas y espalda recta; se recomiendan mesas de 70 cm.',
    bodiesRule: '1',
    widthPx: 800,
    heightPx: 520,
    isAnonymousCaseSchema: true,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Clasificación de bolsines en suelo: piernas rectas y tronco flexionado',
        scoreBadge: 'Postura no conforme',
        focusZone: 'full_body',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          prop: 'floor_pouches',
          trunkFlexionDeg: 66,
          neckFlexionDeg: -14,
          shoulderRFlexionDeg: 68,
          shoulderLFlexionDeg: 64,
          shoulderRAbductionDeg: 4,
          shoulderLAbductionDeg: 4,
          elbowRFlexionDeg: 26,
          elbowLFlexionDeg: 28,
          forearmRPronationDeg: 55,
          forearmLPronationDeg: -55,
          handGripMode: 'pinch',
          hipRFlexionDeg: 6,
          kneeRFlexionDeg: 8,
          ankleRDorsiflexionDeg: 2,
          hipLFlexionDeg: 6,
          kneeLFlexionDeg: 8,
          ankleLDorsiflexionDeg: 2,
        }),
        angleArcs: [
          { joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: 'Tronco 66° (>60°)' },
          { joint: 'kneeR', refType: 'vertical_down', toJoint: 'ankleR', label: 'Rodillas ~8° (extendidas)' },
        ],
        forceVectors: [{ atJoint: 'l5s1', dx: 0.4, dy: 0.9, lengthPx: 52, label: 'Fc L5/S1' }],
        noteBottom: 'Medida correctora: incorporar mesas de clasificación de 70 cm de altura',
      },
    ],
  },
  {
    id: 'fig-12-06a',
    figureNumber: '12.6',
    subPart: 'a',
    fileName: 'fig-12-06a.png',
    chapter: 12,
    chapterTitle: 'Cap. 12 · Informe Logística',
    title: 'Medición con dinamómetro de la fuerza de empuje de un carro (a)',
    bookDescription:
      'Esquema anónimo (Tabla 12.8): medición con dinamómetro analógico (0–500 N) a altura de agarre 93–96 cm; fuerza inicial de empuje = 10,5 kgf (102,9 N).',
    bodiesRule: '1',
    widthPx: 800,
    heightPx: 520,
    isAnonymousCaseSchema: true,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Dinamometría en empuje de carro: F inicial = 10,5 kgf (102,9 N)',
        scoreBadge: 'Empuje 102,9 N',
        focusZone: 'full_body',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          stanceMode: 'walking',
          prop: 'cart_push_dynamo',
          trunkFlexionDeg: 18,
          shoulderRFlexionDeg: 48,
          shoulderLFlexionDeg: 48,
          elbowRFlexionDeg: 55,
          elbowLFlexionDeg: 55,
          hipRFlexionDeg: 22,
          kneeRFlexionDeg: 24,
          hipLFlexionDeg: -16,
          kneeLFlexionDeg: 18,
        }),
        forceVectors: [{ atJoint: 'handR', dx: 1, dy: 0, lengthPx: 68, label: 'F empuje = 102,9 N' }],
        dimensions: [{ fromJoint: 'ankleR', toJoint: 'handR', label: 'Agarre 93–96 cm', axis: 'vertical' }],
        noteBottom: 'Inferior al valor límite máximo de la tabla (Res. 3345/15 / Snook)',
      },
    ],
  },
  {
    id: 'fig-12-06b',
    figureNumber: '12.6',
    subPart: 'b',
    fileName: 'fig-12-06b.png',
    chapter: 12,
    chapterTitle: 'Cap. 12 · Informe Logística',
    title: 'Medición con dinamómetro de la fuerza de arrastre de un carro (b)',
    bookDescription:
      'Esquema anónimo (Tabla 12.8): tracción/arrastre de carro con dinamómetro; F inicial = 10 kgf (98 N) y F sostenida = 7,3 kgf (71,5 N) frente a límite 240–270 N.',
    bodiesRule: '1',
    widthPx: 800,
    heightPx: 520,
    isAnonymousCaseSchema: true,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Dinamometría en arrastre: F inic. = 98 N · F sost. = 71,5 N',
        scoreBadge: 'Arrastre 98 N',
        focusZone: 'full_body',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          stanceMode: 'walking',
          prop: 'cart_pull_dynamo',
          trunkFlexionDeg: -8,
          shoulderRFlexionDeg: 38,
          shoulderLFlexionDeg: 38,
          elbowRFlexionDeg: 40,
          elbowLFlexionDeg: 40,
          hipRFlexionDeg: -12,
          kneeRFlexionDeg: 16,
          hipLFlexionDeg: 20,
          kneeLFlexionDeg: 22,
        }),
        forceVectors: [{ atJoint: 'handR', dx: -1, dy: 0, lengthPx: 68, label: 'F tracción = 98 N (< 240 N)' }],
        noteBottom: 'Fuerzas iniciales y sostenidas por debajo de los límites reglamentarios',
      },
    ],
  },
  {
    id: 'fig-12-07',
    figureNumber: '12.7',
    fileName: 'fig-12-07.png',
    chapter: 12,
    chapterTitle: 'Cap. 12 · Informe Logística',
    title: 'Postura del operador al registrar bultos en el sistema (ángulos RULA)',
    bookDescription:
      'Esquema anónimo (apartado 12.4.5): puesto de pie frente a mueble de 99 cm de altura sin espacio para piernas, flexión cervical hacia pantalla baja (RULA = 4, Nivel 2).',
    bodiesRule: '1',
    widthPx: 800,
    heightPx: 520,
    isAnonymousCaseSchema: true,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Escaneo y registro en mueble de 99 cm — RULA = 4 (Nivel 2)',
        scoreBadge: 'RULA = 4',
        focusZone: 'full_body',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          prop: 'high_scanner_desk',
          trunkFlexionDeg: 12,
          neckFlexionDeg: 22,
          shoulderRFlexionDeg: 36,
          shoulderLFlexionDeg: 30,
          elbowRFlexionDeg: 78,
          elbowLFlexionDeg: 82,
          wristRFlexionDeg: 12,
          wristLFlexionDeg: 8,
          handGripMode: 'power_grip',
        }),
        angleArcs: [
          { joint: 'c7', refType: 'vertical_up', toJoint: 'head', label: 'Cuello > 20° (3)' },
          { joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: 'Brazo 36° (2)' },
        ],
        dimensions: [{ fromJoint: 'ankleR', toJoint: 'wristR', label: 'Plano 99 cm (sin hueco)', axis: 'vertical' }],
        noteBottom: 'Mejora: elevar borde superior del monitor a la altura de los ojos',
      },
    ],
  },
  {
    id: 'fig-12-08',
    figureNumber: '12.8',
    fileName: 'fig-12-08.png',
    chapter: 12,
    chapterTitle: 'Cap. 12 · Informe Logística',
    title: 'Nevera con el pedido preparado sobre el pallet en el momento de levantarla',
    bookDescription:
      'Esquema anónimo (apartado 12.5.2): nevera de 40×50×50 cm (hasta 15 kg) tomada sobre pallet bajo; NIOSH IL = 1,07 y LMC Res. 295/03 no aceptable (15 kg > 14 kg).',
    bodiesRule: '1',
    widthPx: 800,
    heightPx: 520,
    isAnonymousCaseSchema: true,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Levantamiento de nevera (15 kg) desde pallet — IL = 1,07 / LMC > 14 kg',
        scoreBadge: 'IL = 1,07',
        focusZone: 'full_body',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          prop: 'pallet_cooler',
          trunkFlexionDeg: 44,
          neckFlexionDeg: -6,
          hipRFlexionDeg: 38,
          kneeRFlexionDeg: 48,
          ankleRDorsiflexionDeg: 10,
          hipLFlexionDeg: 38,
          kneeLFlexionDeg: 48,
          ankleLDorsiflexionDeg: 10,
          shoulderRFlexionDeg: 48,
          shoulderLFlexionDeg: 48,
          shoulderRAbductionDeg: -6,
          shoulderLAbductionDeg: -6,
          elbowRFlexionDeg: 28,
          elbowLFlexionDeg: 28,
          handGripMode: 'box_cradle',
          loadKg: 15,
        }),
        angleArcs: [{ joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: 'Tronco 44°' }],
        forceVectors: [{ atJoint: 'handR', dx: 0, dy: 1, lengthPx: 50, label: 'F = 15 kgf (Lím. LMC 14 kg)' }],
        noteBottom: 'Recomendación: elevar la base de preparación al nivel de los nudillos (~75 cm)',
      },
    ],
  },
  {
    id: 'fig-12-09',
    figureNumber: '12.9',
    fileName: 'fig-12-09.png',
    chapter: 12,
    chapterTitle: 'Cap. 12 · Informe Logística',
    title: 'Cajas de geles de 12 kg almacenadas en cámara de frío por encima de los hombros',
    bookDescription:
      'Esquema anónimo (apartado 12.5.3): almacenamiento en estantería superior (> altura acromial) en cámara entre 2 y 8 °C; requiere reubicación inmediata al nivel inferior.',
    bodiesRule: '1',
    widthPx: 800,
    heightPx: 520,
    isAnonymousCaseSchema: true,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Cámara de frío (2–8 °C): cajas de 12 kg sobre altura de hombros',
        scoreBadge: 'Prioridad Inmediata',
        focusZone: 'full_body',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          prop: 'cold_room_high_shelf',
          trunkFlexionDeg: -6,
          neckFlexionDeg: -16,
          shoulderRFlexionDeg: 118,
          shoulderLFlexionDeg: 118,
          shoulderRAbductionDeg: -6,
          shoulderLAbductionDeg: -6,
          elbowRFlexionDeg: 38,
          elbowLFlexionDeg: 38,
          handGripMode: 'box_cradle',
          loadKg: 12,
        }),
        angleArcs: [{ joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: 'Brazo > 115°' }],
        forceVectors: [{ atJoint: 'handR', dx: 0, dy: 1, lengthPx: 50, label: 'F = 12 kgf sobre hombros' }],
        noteBottom: 'Acción inmediata: bajar cajas al estante inferior para toma bimanual segura',
      },
    ],
  },

  // =========================================================================
  // CAPÍTULO 13. CASO DE ESTUDIO: ASIENTO DE CONDUCTOR DE TRANSPORTE
  // =========================================================================
  {
    id: 'fig-13-01',
    figureNumber: '13.1',
    fileName: 'fig-13-01.png',
    chapter: 13,
    chapterTitle: 'Cap. 13 · Caso Asiento Conductor',
    title: 'Esquema lateral del asiento con sus dimensiones principales y recorridos de ajuste',
    bookDescription:
      'Comparación normativa VDV 234 / APTA / UITP / ISO 16121 (Tabla 13.3): profundidad 400 mm, ancho 490 mm, altura 600–650 mm (reg. 30 mm), corredera ±150 mm, respaldo 90°–104°.',
    bodiesRule: 'diagrama',
    widthPx: 800,
    heightPx: 520,
    isAnonymousCaseSchema: true,
    renderMode: 'diagram',
    diagramId: 'fig_13_01_seat_dimensions',
  },
  {
    id: 'fig-13-02',
    figureNumber: '13.2',
    fileName: 'fig-13-02.png',
    chapter: 13,
    chapterTitle: 'Cap. 13 · Caso Asiento Conductor',
    title: 'Esquema de la postura del conductor sentado con los seis ángulos de confort (A a F)',
    bookDescription:
      'Tabla 13.4 y 13.5: Ángulos de confort A (90°–110° cadera), B (110°–120° rodilla), C (100°–115° tobillo), D (155°–175° visión/cuello), E (10°–40° hombro), F (95°–135° codo). REBA = 2.',
    bodiesRule: '1',
    widthPx: 480,
    heightPx: 640,
    isAnonymousCaseSchema: true,
    renderMode: '3d_single',
    panels: [
      {
        subTitle: 'Ángulos de confort A–F en conducción — REBA = 2',
        scoreBadge: 'Ángulos A–F',
        focusZone: 'full_body',
        cameraPreset: 'sagittal_right',
        pose: makeNeutralPose({
          stanceMode: 'seated',
          prop: 'bus_driver_seat',
          trunkFlexionDeg: -8,
          neckFlexionDeg: 6,
          shoulderRFlexionDeg: 22,
          shoulderLFlexionDeg: 22,
          shoulderRAbductionDeg: 6,
          shoulderLAbductionDeg: 6,
          elbowRFlexionDeg: 58, // apertura interior F ~122° (95°-135°)
          elbowLFlexionDeg: 58,
          forearmRPronationDeg: 34,
          forearmLPronationDeg: -34,
          wristRFlexionDeg: -4,
          wristRDeviationDeg: -6,
          wristLFlexionDeg: -4,
          wristLDeviationDeg: -6,
          handGripMode: 'power_grip',
          hipRFlexionDeg: 86, // apertura tronco-muslo A ~102° (90°-110°)
          kneeRFlexionDeg: 64, // apertura interior B ~116° (110°-120°)
          ankleRDorsiflexionDeg: -12, // apertura C ~102° (100°-115°) sobre pedal
          hipLFlexionDeg: 86,
          kneeLFlexionDeg: 64,
          ankleLDorsiflexionDeg: -8,
        }),
        angleArcs: [
          { joint: 'hipR', refType: 'segment', parentJoint: 'c7', toJoint: 'kneeR', label: 'A: 90°–110°' },
          { joint: 'kneeR', refType: 'segment', parentJoint: 'hipR', toJoint: 'ankleR', label: 'B: 110°–120°' },
          { joint: 'ankleR', refType: 'segment', parentJoint: 'kneeR', toJoint: 'footR', label: 'C: 100°–115°' },
          { joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: 'E: 10°–40°' },
          { joint: 'elbowR', refType: 'segment', parentJoint: 'shoulderR', toJoint: 'wristR', label: 'F: 95°–135°' },
        ],
        noteBottom: 'Volante de ómnibus / colectivo Ø 430 mm (VDV 234 / ISO 16121, 35°) · Manos 9 y 3 · REBA = 2',
      },
    ],
  },
  {
    id: 'fig-13-03',
    figureNumber: '13.3',
    fileName: 'fig-13-03.png',
    chapter: 13,
    chapterTitle: 'Cap. 13 · Caso Asiento Conductor',
    title: 'Espectro de aceleración del eje Z en bandas de 1/3 de octava, medido y ponderado',
    bookDescription:
      'Gráfico real (Tabla 13.7): aceleraciones medidas y ponderadas en 1; 1,25; 1,6; 2; 2,5 y 3,2 Hz (Apz = 0,4286 m/s², Ap global = 0,4463 m/s² < 0,5 m/s²).',
    bodiesRule: 'diagrama',
    widthPx: 800,
    heightPx: 520,
    isExistingRealChart: true,
    renderMode: 'real_chart',
    diagramId: 'fig_13_03_vib_z_spectrum_real',
  },
  {
    id: 'fig-13-04',
    figureNumber: '13.4',
    fileName: 'fig-13-04.png',
    chapter: 13,
    chapterTitle: 'Cap. 13 · Caso Asiento Conductor',
    title: 'Espectro de aceleración de mano-brazo por eje en bandas de 1/3 de octava',
    bookDescription:
      'Gráfico real (Tabla 13.9): curvas espectrales en ejes X, Y y Z desde 2 hasta 125 Hz con pico en 31 Hz (VTV = 1,1 m/s² < 2,5 m/s²).',
    bodiesRule: 'diagrama',
    widthPx: 800,
    heightPx: 520,
    isExistingRealChart: true,
    renderMode: 'real_chart',
    diagramId: 'fig_13_04_vib_ha_spectrum_real',
  },
];

export const BOOK_FIGURE_CATALOG: BookFigureFileSpec[] = RAW_BOOK_FIGURE_CATALOG.map((item) => {
  const baseKey = item.fileName.replace(/\.png$/i, '');
  const assignedPhotoUrl = ASSIGNED_CHAPTER4_PHOTOS[item.id] || ASSIGNED_CHAPTER4_PHOTOS[baseKey];
  return assignedPhotoUrl ? { ...item, assignedPhotoUrl } : item;
});

const FIGURE_PHOTO_OVERRIDES_KEY = 'ergoeval_figure_photo_overrides_v1';
let cachedPhotoOverrides: Record<string, string> | null = null;
let serverOverridesHydrated = false;
const photoOverrideListeners = new Set<() => void>();

function persistOverridesToLocalStorage(map: Record<string, string>): void {
  try {
    if (Object.keys(map).length === 0) {
      localStorage.removeItem(FIGURE_PHOTO_OVERRIDES_KEY);
    } else {
      localStorage.setItem(FIGURE_PHOTO_OVERRIDES_KEY, JSON.stringify(map));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function hydrateServerFigureOverrides(): void {
  if (serverOverridesHydrated || typeof window === 'undefined') return;
  serverOverridesHydrated = true;
  fetch('/api/figures/overrides')
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { overrides?: Record<string, string> } | null) => {
      if (!data?.overrides || typeof data.overrides !== 'object') return;
      const serverEntries = Object.entries(data.overrides);
      if (serverEntries.length === 0) return;
      const current = readPhotoOverrides();
      const merged = { ...current, ...data.overrides };
      cachedPhotoOverrides = merged;
      persistOverridesToLocalStorage(merged);
      photoOverrideListeners.forEach((fn) => fn());
    })
    .catch(() => {
      // Ignore network fallback in offline mode
    });
}

function readPhotoOverrides(): Record<string, string> {
  if (!serverOverridesHydrated && typeof window !== 'undefined') {
    hydrateServerFigureOverrides();
  }
  if (cachedPhotoOverrides) return cachedPhotoOverrides;
  try {
    const raw = localStorage.getItem(FIGURE_PHOTO_OVERRIDES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (parsed && typeof parsed === 'object') {
        cachedPhotoOverrides = parsed;
        return cachedPhotoOverrides;
      }
    }
  } catch {
    // Ignore storage errors
  }
  cachedPhotoOverrides = {};
  return cachedPhotoOverrides;
}

export function getEffectiveFigurePhotoUrl(spec: BookFigureFileSpec): string | undefined {
  const overrides = readPhotoOverrides();
  if (overrides[spec.id]) return overrides[spec.id];
  const baseKey = spec.fileName.replace(/\.png$/i, '');
  return spec.assignedPhotoUrl || ASSIGNED_CHAPTER4_PHOTOS[spec.id] || ASSIGNED_CHAPTER4_PHOTOS[baseKey];
}

export function hasCustomFigurePhotoOverride(figId: string): boolean {
  const overrides = readPhotoOverrides();
  return Boolean(overrides[figId]);
}

export function setCustomFigurePhotoOverride(figId: string, dataUrl: string): void {
  const next = { ...readPhotoOverrides(), [figId]: dataUrl };
  cachedPhotoOverrides = next;
  persistOverridesToLocalStorage(next);
  photoOverrideListeners.forEach((fn) => fn());
}

/**
 * Sube y almacena en el servidor de la app una imagen definitiva para reemplazar una figura del catálogo,
 * sincronizando tanto el almacenamiento persistente `/public/assets/custom-figures/` como la sesión local.
 */
export async function saveDefinitiveFigureImageToApp(
  figId: string,
  dataUrl: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  setCustomFigurePhotoOverride(figId, dataUrl);
  try {
    const res = await fetch('/api/figures/override', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ figId, dataUrl }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        ok: false,
        url: dataUrl,
        error: errBody?.error || 'Guardado localmente; el servidor no pudo almacenar el archivo.',
      };
    }
    const payload = (await res.json()) as { ok?: boolean; url?: string };
    if (payload.url) {
      setCustomFigurePhotoOverride(figId, payload.url);
      return { ok: true, url: payload.url };
    }
    return { ok: true, url: dataUrl };
  } catch {
    return {
      ok: true,
      url: dataUrl,
      error: 'Guardado en navegador local (modo sin conexión al servidor).',
    };
  }
}

export function clearCustomFigurePhotoOverride(figId: string): void {
  const next = { ...readPhotoOverrides() };
  delete next[figId];
  cachedPhotoOverrides = next;
  persistOverridesToLocalStorage(next);
  photoOverrideListeners.forEach((fn) => fn());
  if (typeof window !== 'undefined') {
    fetch(`/api/figures/override/${encodeURIComponent(figId)}`, {
      method: 'DELETE',
    }).catch(() => {
      // Ignore network errors
    });
  }
}

export function subscribeFigurePhotoOverrides(listener: () => void): () => void {
  hydrateServerFigureOverrides();
  photoOverrideListeners.add(listener);
  return () => {
    photoOverrideListeners.delete(listener);
  };
}

export function countAssignedFigurePhotos(): number {
  return BOOK_FIGURE_CATALOG.filter((f) => Boolean(getEffectiveFigurePhotoUrl(f))).length;
}

// =========================================================================
// CALIBRACIÓN Y PERSISTENCIA DE POSTURAS DE REFERENCIA EN CATÁLOGO 3D
// =========================================================================

export interface CatalogFigurePoseOverride {
  bodiesRule: '1' | '2' | 'diagrama';
  widthPx: number;
  heightPx: number;
  renderMode: '3d_single' | '3d_dual' | 'diagram' | 'real_chart';
  panels: Panel3DSpec[];
  updatedAt?: string;
}

const FIGURE_POSE_OVERRIDES_KEY = 'ergoeval_figure_pose_overrides_v1';
let cachedPoseOverrides: Record<string, CatalogFigurePoseOverride> | null = null;
let serverPoseOverridesHydrated = false;
const poseOverrideListeners = new Set<() => void>();

function clonePanelsDeep(panels: Panel3DSpec[] | undefined): Panel3DSpec[] | undefined {
  if (!panels) return undefined;
  return JSON.parse(JSON.stringify(panels)) as Panel3DSpec[];
}

const ORIGINAL_CATALOG_SNAPSHOT = new Map<
  string,
  {
    bodiesRule: BookFigureFileSpec['bodiesRule'];
    widthPx: number;
    heightPx: number;
    renderMode: BookFigureFileSpec['renderMode'];
    panels?: Panel3DSpec[];
  }
>(
  BOOK_FIGURE_CATALOG.map((item) => [
    item.id,
    {
      bodiesRule: item.bodiesRule,
      widthPx: item.widthPx,
      heightPx: item.heightPx,
      renderMode: item.renderMode,
      panels: clonePanelsDeep(item.panels),
    },
  ]),
);

function applyPoseOverrideToCatalogEntry(figId: string, override: CatalogFigurePoseOverride): void {
  const target = BOOK_FIGURE_CATALOG.find((f) => f.id === figId);
  if (!target || !Array.isArray(override.panels) || override.panels.length === 0) return;
  const cloned = clonePanelsDeep(override.panels) || [];
  const isMulti = cloned.length >= 2;
  target.bodiesRule = isMulti ? '2' : '1';
  target.renderMode = isMulti ? '3d_dual' : '3d_single';
  target.widthPx = override.widthPx || (isMulti ? 800 : 480);
  target.heightPx = override.heightPx || (isMulti ? 520 : 640);
  target.panels = cloned;
}

function restoreCatalogEntryFromSnapshot(figId: string): CatalogFigurePoseOverride | null {
  const snap = ORIGINAL_CATALOG_SNAPSHOT.get(figId);
  const target = BOOK_FIGURE_CATALOG.find((f) => f.id === figId);
  if (!snap || !target) return null;
  target.bodiesRule = snap.bodiesRule;
  target.widthPx = snap.widthPx;
  target.heightPx = snap.heightPx;
  target.renderMode = snap.renderMode;
  target.panels = clonePanelsDeep(snap.panels);
  if (!target.panels) return null;
  return {
    bodiesRule: snap.bodiesRule,
    widthPx: snap.widthPx,
    heightPx: snap.heightPx,
    renderMode: snap.renderMode,
    panels: clonePanelsDeep(snap.panels) || [],
  };
}

function persistPoseOverridesToLocalStorage(map: Record<string, CatalogFigurePoseOverride>): void {
  try {
    if (Object.keys(map).length === 0) {
      localStorage.removeItem(FIGURE_POSE_OVERRIDES_KEY);
    } else {
      localStorage.setItem(FIGURE_POSE_OVERRIDES_KEY, JSON.stringify(map));
    }
  } catch {
    // Ignore storage quota errors
  }
}

function readPoseOverrides(): Record<string, CatalogFigurePoseOverride> {
  if (cachedPoseOverrides) return cachedPoseOverrides;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(FIGURE_POSE_OVERRIDES_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, CatalogFigurePoseOverride>;
      if (parsed && typeof parsed === 'object') {
        cachedPoseOverrides = parsed;
        Object.entries(parsed).forEach(([figId, ov]) => applyPoseOverrideToCatalogEntry(figId, ov));
        return cachedPoseOverrides;
      }
    }
  } catch {
    // Ignore storage errors
  }
  cachedPoseOverrides = {};
  return cachedPoseOverrides;
}

export function hydrateServerFigurePoseOverrides(): void {
  if (serverPoseOverridesHydrated || typeof window === 'undefined') return;
  serverPoseOverridesHydrated = true;
  // Aplicar primero caché local inmediato
  readPoseOverrides();
  fetch('/api/figures/pose-overrides')
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { overrides?: Record<string, CatalogFigurePoseOverride> } | null) => {
      if (!data?.overrides || typeof data.overrides !== 'object') return;
      const entries = Object.entries(data.overrides);
      if (entries.length === 0) return;
      const current = readPoseOverrides();
      const merged = { ...current, ...data.overrides };
      cachedPoseOverrides = merged;
      Object.entries(merged).forEach(([figId, ov]) => applyPoseOverrideToCatalogEntry(figId, ov));
      persistPoseOverridesToLocalStorage(merged);
      poseOverrideListeners.forEach((fn) => fn());
      photoOverrideListeners.forEach((fn) => fn());
    })
    .catch(() => {
      // Ignore network fallback in offline mode
    });
}

export function hasCustomFigurePoseOverride(figId: string): boolean {
  if (!serverPoseOverridesHydrated && typeof window !== 'undefined') {
    hydrateServerFigurePoseOverrides();
  }
  const map = readPoseOverrides();
  return Boolean(map[figId]);
}

export function subscribeFigurePoseOverrides(listener: () => void): () => void {
  hydrateServerFigurePoseOverrides();
  poseOverrideListeners.add(listener);
  return () => {
    poseOverrideListeners.delete(listener);
  };
}

export async function saveDefinitiveFigurePoseToCatalog(
  figId: string,
  panels: Panel3DSpec[],
  dimensions?: { widthPx?: number; heightPx?: number },
): Promise<{ ok: boolean; catalogFileUpdated?: boolean; error?: string }> {
  const clonedPanels = clonePanelsDeep(panels) || [];
  const isMulti = clonedPanels.length >= 2;
  const overrideEntry: CatalogFigurePoseOverride = {
    bodiesRule: isMulti ? '2' : '1',
    widthPx:
      dimensions?.widthPx ||
      (clonedPanels.length >= 4
        ? 1560
        : clonedPanels.length === 3
          ? 1200
          : isMulti
            ? 800
            : 480),
    heightPx: dimensions?.heightPx || (isMulti ? 520 : 640),
    renderMode: isMulti ? '3d_dual' : '3d_single',
    panels: clonedPanels,
    updatedAt: new Date().toISOString(),
  };

  applyPoseOverrideToCatalogEntry(figId, overrideEntry);
  const nextMap = { ...readPoseOverrides(), [figId]: overrideEntry };
  cachedPoseOverrides = nextMap;
  persistPoseOverridesToLocalStorage(nextMap);
  poseOverrideListeners.forEach((fn) => fn());
  photoOverrideListeners.forEach((fn) => fn());

  try {
    const res = await fetch('/api/figures/pose-override', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        figId,
        panels: clonedPanels,
        widthPx: overrideEntry.widthPx,
        heightPx: overrideEntry.heightPx,
      }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        ok: false,
        error: errBody?.error || 'Guardado en sesión local; el servidor no pudo actualizar figurePlanCatalog.ts.',
      };
    }
    const payload = (await res.json()) as {
      ok?: boolean;
      catalogFileUpdated?: boolean;
      override?: CatalogFigurePoseOverride;
    };
    if (payload.override) {
      applyPoseOverrideToCatalogEntry(figId, payload.override);
    }
    poseOverrideListeners.forEach((fn) => fn());
    return { ok: true, catalogFileUpdated: Boolean(payload.catalogFileUpdated) };
  } catch {
    return {
      ok: true,
      catalogFileUpdated: false,
      error: 'Postura guardada en memoria local (sin conexión al servidor).',
    };
  }
}

export async function clearCustomFigurePoseOverride(figId: string): Promise<void> {
  const restored = restoreCatalogEntryFromSnapshot(figId);
  const next = { ...readPoseOverrides() };
  delete next[figId];
  cachedPoseOverrides = next;
  persistPoseOverridesToLocalStorage(next);
  poseOverrideListeners.forEach((fn) => fn());
  photoOverrideListeners.forEach((fn) => fn());

  if (typeof window !== 'undefined') {
    if (restored) {
      // Restaurar también el bloque fuente en figurePlanCatalog.ts y luego limpiar el override activo
      await fetch('/api/figures/pose-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          figId,
          panels: restored.panels,
          widthPx: restored.widthPx,
          heightPx: restored.heightPx,
        }),
      }).catch(() => undefined);
    }
    await fetch(`/api/figures/pose-override/${encodeURIComponent(figId)}`, {
      method: 'DELETE',
    }).catch(() => undefined);
  }
}

export async function extractFigurePoseFromImage(params: {
  imageDataUrl: string;
  figId: string;
  title: string;
  bookDescription: string;
  expectedBodiesCount?: number;
}): Promise<{ ok: boolean; bodiesCount?: number; panels?: Panel3DSpec[]; error?: string }> {
  try {
    const res = await fetch('/api/figures/extract-pose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      bodiesCount?: number;
      panels?: Panel3DSpec[];
      error?: string;
    };
    if (!res.ok || !data.panels || data.panels.length === 0) {
      return {
        ok: false,
        error: data.error || 'No fue posible extraer automáticamente la postura desde la imagen.',
      };
    }
    return {
      ok: true,
      bodiesCount: data.bodiesCount || data.panels.length,
      panels: data.panels,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error de red al analizar la imagen.',
    };
  }
}

/**
 * Parses a natural-language biomechanical prompt in Spanish and produces an isolated
 * 3D Panel specification strictly obeying the System Instruction rules:
 * - Isolates ONLY the requested joint/segment unless full body is explicitly asked.
 * - Sets exact joint angle(s) (alpha) and force vector(s) (F).
 */
export function parseBiomechanicalPromptToPanel(promptText: string): {
  focusZone: FocusZone;
  widthPx: number;
  heightPx: number;
  panel: Panel3DSpec;
} {
  const txt = promptText.toLowerCase();

  // 1. Detect isolated anatomical focus zone (Default to isolated segment, NEVER full_body unless specified!)
  let focusZone: FocusZone = 'lumbar_l5s1';
  if (/cuerpo entero|cuerpo completo|global|owas|todo el cuerpo/.test(txt)) {
    focusZone = 'full_body';
  } else if (/mu[ñn]eca|mano|carpo|tunel carpiano|t[úu]nel carpiano|pinza|agarre|radial|cubital/.test(txt)) {
    focusZone = 'wrist_hand';
  } else if (/pie|tobillo|calc[áa]neo|aquiles|plantar|dorsiflex/.test(txt)) {
    focusZone = 'ankle_foot';
  } else if (/codo|antebrazo|epicondil|prono|supina/.test(txt)) {
    focusZone = 'elbow_forearm';
  } else if (/hombro|brazo|glenohumeral|manguito|abducci[óo]n/.test(txt)) {
    focusZone = 'shoulder_arm';
  } else if (/cuello|cervical|cabeza|nuc/.test(txt)) {
    focusZone = 'neck_cervical';
  } else if (/rodilla|pierna|cuclilla|f[ée]mur|tibia/.test(txt)) {
    focusZone = 'legs_knees';
  } else if (/l5|s1|lumbar|disco|sacro|columna baja/.test(txt)) {
    focusZone = 'lumbar_l5s1';
  } else if (/tronco|espalda|toracolumbar/.test(txt)) {
    focusZone = 'trunk_pelvis';
  }

  // Extract primary angle in degrees if mentioned (e.g. "45°" or "45 grados")
  const degMatch = txt.match(/(-?\d+(?:[.,]\d+)?)\s*(?:°|º|grados)/);
  const extractedDeg = degMatch ? parseFloat(degMatch[1].replace(',', '.')) : null;

  // Extract force magnitude if mentioned (e.g. "120 N", "18 kg", "25 kgf")
  const forceMatch = txt.match(/(\d+(?:[.,]\d+)?)\s*(n|kn|kgf|kg)\b/i);
  const forceText = forceMatch ? `F = ${forceMatch[1]} ${forceMatch[2].toUpperCase()}` : 'F';

  const pose = makeNeutralPose();
  const isExtension = /extensi[óo]n/.test(txt);
  const sign = isExtension ? -1 : 1;

  const panel: Panel3DSpec = {
    subTitle: promptText.trim().slice(0, 68) || 'Renderizado Biomecánico 3D Aislado',
    scoreBadge: focusZone === 'full_body' ? 'Cuerpo Completo' : 'Segmento Aislado',
    focusZone,
    cameraPreset: /frontal|abducci[óo]n|lateral/.test(txt)
      ? 'frontal'
      : /superior|planta|cenital|radial|cubital/.test(txt)
        ? 'top'
        : /isom[ée]tric|3d|rotaci[óo]n|torsi[óo]n/.test(txt)
          ? 'isometric'
          : 'sagittal_right',
    pose,
    angleArcs: [],
    forceVectors: [],
    noteBottom: 'Malla 3D translúcida · Estructura ósea interna · Nodos articulares azules',
  };

  switch (focusZone) {
    case 'wrist_hand': {
      const a = extractedDeg ?? 28;
      pose.elbowRFlexionDeg = 90;
      pose.wristRFlexionDeg = sign * Math.abs(a);
      if (/cubital/.test(txt)) pose.wristRDeviationDeg = 22;
      if (/radial/.test(txt)) pose.wristRDeviationDeg = -18;
      panel.angleArcs = [{ joint: 'wristR', refType: 'horizontal', toJoint: 'handR', label: `α = ${Math.abs(a)}°` }];
      panel.forceVectors = [{ atJoint: 'handR', dx: 0, dy: 1, lengthPx: 50, label: forceText }];
      break;
    }
    case 'ankle_foot': {
      const a = extractedDeg ?? 18;
      pose.ankleRDorsiflexionDeg = /plantar/.test(txt) ? -Math.abs(a) : Math.abs(a);
      panel.angleArcs = [{ joint: 'ankleR', refType: 'horizontal', toJoint: 'footR', label: `α = ${Math.abs(a)}°` }];
      panel.forceVectors = [{ atJoint: 'ankleR', dx: 0, dy: -1, lengthPx: 52, label: forceText === 'F' ? 'F reacción' : forceText }];
      break;
    }
    case 'elbow_forearm': {
      const a = extractedDeg ?? 85;
      pose.elbowRFlexionDeg = Math.abs(a);
      panel.angleArcs = [{ joint: 'elbowR', refType: 'vertical_down', toJoint: 'wristR', label: `α = ${Math.abs(a)}°` }];
      panel.forceVectors = [{ atJoint: 'handR', dx: 0, dy: 1, lengthPx: 50, label: forceText }];
      break;
    }
    case 'shoulder_arm': {
      const a = extractedDeg ?? 65;
      if (/abducci[óo]n/.test(txt)) {
        pose.shoulderRAbductionDeg = Math.abs(a);
        panel.cameraPreset = 'frontal';
      } else {
        pose.shoulderRFlexionDeg = sign * Math.abs(a);
      }
      panel.angleArcs = [{ joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: `α = ${Math.abs(a)}°` }];
      panel.forceVectors = [{ atJoint: 'elbowR', dx: 0, dy: 1, lengthPx: 48, label: forceText }];
      break;
    }
    case 'neck_cervical': {
      const a = extractedDeg ?? 25;
      pose.neckFlexionDeg = sign * Math.abs(a);
      panel.angleArcs = [{ joint: 'c7', refType: 'vertical_up', toJoint: 'head', label: `α = ${Math.abs(a)}°` }];
      panel.forceVectors = [{ atJoint: 'head', dx: 0, dy: 1, lengthPx: 44, label: forceText === 'F' ? 'F cabeza' : forceText }];
      break;
    }
    case 'lumbar_l5s1':
    case 'trunk_pelvis': {
      const a = extractedDeg ?? 45;
      pose.trunkFlexionDeg = sign * Math.abs(a);
      pose.shoulderRFlexionDeg = Math.max(15, Math.abs(a));
      pose.highlightGroup = 'l5s1_disc';
      if (forceMatch) pose.prop = 'box_load';
      panel.angleArcs = [{ joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: `α = ${Math.abs(a)}°` }];
      panel.forceVectors = [
        { atJoint: 'l5s1', dx: 0.35, dy: 0.9, lengthPx: 58, label: `Fc L5/S1 (${forceText})` },
      ];
      break;
    }
    case 'legs_knees': {
      const a = extractedDeg ?? 55;
      pose.hipRFlexionDeg = Math.abs(a) * 0.65;
      pose.kneeRFlexionDeg = Math.abs(a);
      pose.hipLFlexionDeg = Math.abs(a) * 0.65;
      pose.kneeLFlexionDeg = Math.abs(a);
      panel.angleArcs = [{ joint: 'kneeR', refType: 'vertical_down', toJoint: 'ankleR', label: `α = ${Math.abs(a)}°` }];
      panel.forceVectors = [{ atJoint: 'kneeR', dx: 0, dy: -1, lengthPx: 50, label: forceText }];
      break;
    }
    case 'full_body': {
      const a = extractedDeg ?? 35;
      pose.trunkFlexionDeg = Math.abs(a);
      pose.shoulderRFlexionDeg = 50;
      panel.angleArcs = [{ joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: `α = ${Math.abs(a)}°` }];
      panel.forceVectors = [{ atJoint: 'handR', dx: 0, dy: 1, lengthPx: 48, label: forceText }];
      break;
    }
  }

  return {
    focusZone,
    widthPx: 480,
    heightPx: 640,
    panel,
  };
}

export type BiomechSegmentCategory =
  | 'general'
  | 'upper_arm'
  | 'lower_arm'
  | 'wrist'
  | 'neck'
  | 'trunk'
  | 'legs';

export interface Chapter4SentPlateMeta {
  figId: string;
  figCode: string;
  method: 'RULA' | 'REBA' | 'OWAS';
  segment: BiomechSegmentCategory;
  shortLabel: string;
  url: string;
  columns: 1 | 2 | 3 | 4;
  anchorJoint: JointKey;
  planeAxis: 'sagittal' | 'coronal';
}

export const CHAPTER4_SENT_PLATES: Chapter4SentPlateMeta[] = [
  { figId: 'fig-4-01', figCode: 'Fig. 4.1', method: 'RULA', segment: 'general', shortLabel: 'Verdadera magnitud vs oblicua', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-01'], columns: 2, anchorJoint: 'shoulderR', planeAxis: 'sagittal' },
  { figId: 'fig-4-02', figCode: 'Fig. 4.2', method: 'RULA', segment: 'general', shortLabel: 'División por plano sagital', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-02'], columns: 1, anchorJoint: 'pelvis', planeAxis: 'coronal' },
  { figId: 'fig-4-03', figCode: 'Fig. 4.3', method: 'RULA', segment: 'general', shortLabel: 'Grupos A y B en RULA', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-03'], columns: 1, anchorJoint: 'pelvis', planeAxis: 'sagittal' },
  { figId: 'fig-4-04a', figCode: 'Fig. 4.4a', method: 'RULA', segment: 'upper_arm', shortLabel: 'Brazo RULA (1 a 4 ptos)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-04a'], columns: 4, anchorJoint: 'shoulderR', planeAxis: 'sagittal' },
  { figId: 'fig-4-04b', figCode: 'Fig. 4.4b', method: 'RULA', segment: 'upper_arm', shortLabel: 'Brazo mod. (+1 / −1)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-04b'], columns: 2, anchorJoint: 'shoulderR', planeAxis: 'coronal' },
  { figId: 'fig-4-05', figCode: 'Fig. 4.5', method: 'RULA', segment: 'upper_arm', shortLabel: 'Referencia eje tronco-brazo', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-05'], columns: 1, anchorJoint: 'shoulderR', planeAxis: 'sagittal' },
  { figId: 'fig-4-06a', figCode: 'Fig. 4.6a', method: 'RULA', segment: 'upper_arm', shortLabel: 'Elevación, abducción y apoyo', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-06a'], columns: 3, anchorJoint: 'shoulderR', planeAxis: 'coronal' },
  { figId: 'fig-4-07', figCode: 'Fig. 4.7', method: 'RULA', segment: 'lower_arm', shortLabel: 'Antebrazo RULA (1 y 2 ptos)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-07'], columns: 2, anchorJoint: 'elbowR', planeAxis: 'sagittal' },
  { figId: 'fig-4-08', figCode: 'Fig. 4.8', method: 'RULA', segment: 'lower_arm', shortLabel: 'Referencia eje antebrazo', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-08'], columns: 1, anchorJoint: 'elbowR', planeAxis: 'sagittal' },
  { figId: 'fig-4-09', figCode: 'Fig. 4.9', method: 'RULA', segment: 'lower_arm', shortLabel: 'Cruce medial / proy. exterior (+1)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-09'], columns: 2, anchorJoint: 'elbowR', planeAxis: 'coronal' },
  { figId: 'fig-4-10a', figCode: 'Fig. 4.10a', method: 'RULA', segment: 'wrist', shortLabel: 'Muñeca RULA (1, 2 y 3 ptos)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-10a'], columns: 3, anchorJoint: 'wristR', planeAxis: 'sagittal' },
  { figId: 'fig-4-10b', figCode: 'Fig. 4.10b', method: 'RULA', segment: 'wrist', shortLabel: 'Detalle muñeca > 15° (3 ptos)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-10b'], columns: 1, anchorJoint: 'wristR', planeAxis: 'sagittal' },
  { figId: 'fig-4-12', figCode: 'Fig. 4.12', method: 'RULA', segment: 'wrist', shortLabel: 'Pronosupinación (+1 / +2)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-12'], columns: 2, anchorJoint: 'wristR', planeAxis: 'coronal' },
  { figId: 'fig-4-13a', figCode: 'Fig. 4.13a', method: 'RULA', segment: 'neck', shortLabel: 'Cuello RULA (1 a 4 ptos)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-13a'], columns: 4, anchorJoint: 'c7', planeAxis: 'sagittal' },
  { figId: 'fig-4-13b', figCode: 'Fig. 4.13b', method: 'RULA', segment: 'neck', shortLabel: 'Cuello rotación / lateral (+1)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-13b'], columns: 2, anchorJoint: 'c7', planeAxis: 'coronal' },
  { figId: 'fig-4-15a', figCode: 'Fig. 4.15a', method: 'RULA', segment: 'trunk', shortLabel: 'Tronco RULA (1 a 4 ptos)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-15a'], columns: 4, anchorJoint: 'l5s1', planeAxis: 'sagittal' },
  { figId: 'fig-4-15b', figCode: 'Fig. 4.15b', method: 'RULA', segment: 'trunk', shortLabel: 'Detalle tronco 20°–60° y > 60°', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-15b'], columns: 2, anchorJoint: 'l5s1', planeAxis: 'sagittal' },
  { figId: 'fig-4-16', figCode: 'Fig. 4.16', method: 'RULA', segment: 'trunk', shortLabel: 'Tronco torsión / lateral (+1)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-16'], columns: 2, anchorJoint: 'l5s1', planeAxis: 'coronal' },
  { figId: 'fig-4-17', figCode: 'Fig. 4.17', method: 'RULA', segment: 'legs', shortLabel: 'Piernas RULA (+1 y +2)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-17'], columns: 3, anchorJoint: 'kneeR', planeAxis: 'sagittal' },
  { figId: 'fig-4-19a', figCode: 'Fig. 4.19a', method: 'REBA', segment: 'trunk', shortLabel: 'Tronco REBA (1 a 4 ptos)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-19a'], columns: 4, anchorJoint: 'l5s1', planeAxis: 'sagittal' },
  { figId: 'fig-4-19b', figCode: 'Fig. 4.19b', method: 'REBA', segment: 'trunk', shortLabel: 'Tronco REBA torsión / lat. (+1)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-19b'], columns: 2, anchorJoint: 'l5s1', planeAxis: 'coronal' },
  { figId: 'fig-4-20', figCode: 'Fig. 4.20', method: 'REBA', segment: 'neck', shortLabel: 'Cuello REBA (+1 y +2)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-20'], columns: 2, anchorJoint: 'c7', planeAxis: 'sagittal' },
  { figId: 'fig-4-21a', figCode: 'Fig. 4.21a', method: 'REBA', segment: 'legs', shortLabel: 'Piernas REBA soporte (+1 / +2)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-21a'], columns: 3, anchorJoint: 'kneeR', planeAxis: 'sagittal' },
  { figId: 'fig-4-21b', figCode: 'Fig. 4.21b', method: 'REBA', segment: 'legs', shortLabel: 'Rodillas REBA 30°–60° y > 60°', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-21b'], columns: 2, anchorJoint: 'kneeR', planeAxis: 'sagittal' },
  { figId: 'fig-4-22a', figCode: 'Fig. 4.22a', method: 'REBA', segment: 'upper_arm', shortLabel: 'Brazo REBA (1 a 4 ptos)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-22a'], columns: 4, anchorJoint: 'shoulderR', planeAxis: 'sagittal' },
  { figId: 'fig-4-22b', figCode: 'Fig. 4.22b', method: 'REBA', segment: 'upper_arm', shortLabel: 'Brazo REBA mod. (+1 / −1)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-22b'], columns: 3, anchorJoint: 'shoulderR', planeAxis: 'coronal' },
  { figId: 'fig-4-23', figCode: 'Fig. 4.23', method: 'REBA', segment: 'lower_arm', shortLabel: 'Antebrazo REBA (1 y 2 ptos)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-23'], columns: 2, anchorJoint: 'elbowR', planeAxis: 'sagittal' },
  { figId: 'fig-4-24', figCode: 'Fig. 4.24', method: 'REBA', segment: 'wrist', shortLabel: 'Muñeca REBA (1 y 2 ptos)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-24'], columns: 2, anchorJoint: 'wristR', planeAxis: 'sagittal' },
  { figId: 'fig-4-27a', figCode: 'Fig. 4.27a', method: 'OWAS', segment: 'trunk', shortLabel: 'Espalda OWAS Cód. 1 (recta)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-27a'], columns: 1, anchorJoint: 'l5s1', planeAxis: 'sagittal' },
  { figId: 'fig-4-27b', figCode: 'Fig. 4.27b', method: 'OWAS', segment: 'trunk', shortLabel: 'Espalda OWAS Cód. 2–4 (flex./giro)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-27b'], columns: 3, anchorJoint: 'l5s1', planeAxis: 'sagittal' },
  { figId: 'fig-4-28a', figCode: 'Fig. 4.28a', method: 'OWAS', segment: 'upper_arm', shortLabel: 'Brazos OWAS Cód. 1 (bajo hombros)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-28a'], columns: 1, anchorJoint: 'shoulderR', planeAxis: 'coronal' },
  { figId: 'fig-4-28b', figCode: 'Fig. 4.28b', method: 'OWAS', segment: 'upper_arm', shortLabel: 'Brazos OWAS Cód. 2–3 (elevados)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-28b'], columns: 2, anchorJoint: 'shoulderR', planeAxis: 'coronal' },
  { figId: 'fig-4-29a', figCode: 'Fig. 4.29a', method: 'OWAS', segment: 'legs', shortLabel: 'Piernas OWAS Cód. 1 (sentado)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-29a'], columns: 1, anchorJoint: 'kneeR', planeAxis: 'sagittal' },
  { figId: 'fig-4-29b', figCode: 'Fig. 4.29b', method: 'OWAS', segment: 'legs', shortLabel: 'Piernas OWAS Cód. 2 (2 rectas)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-29b'], columns: 1, anchorJoint: 'kneeR', planeAxis: 'sagittal' },
  { figId: 'fig-4-29c', figCode: 'Fig. 4.29c', method: 'OWAS', segment: 'legs', shortLabel: 'Piernas OWAS Cód. 3 (1 pierna)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-29c'], columns: 1, anchorJoint: 'kneeR', planeAxis: 'sagittal' },
  { figId: 'fig-4-29d', figCode: 'Fig. 4.29d', method: 'OWAS', segment: 'legs', shortLabel: 'Piernas OWAS Cód. 4–7 (flex./rod./cam.)', url: ASSIGNED_CHAPTER4_PHOTOS['fig-4-29d'], columns: 4, anchorJoint: 'kneeR', planeAxis: 'sagittal' },
];

export function getChapter4PlateByFigId(figId: string): Chapter4SentPlateMeta | undefined {
  return CHAPTER4_SENT_PLATES.find((p) => p.figId === figId);
}


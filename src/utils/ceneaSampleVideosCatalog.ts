import { CameraPreset, Panel3DSpec, PosturePose3D, ScenePropType } from '../types/figurePlan';
import { CameraOrbitOverride } from './biomech3dRenderer';
import { LiftPostureStyle, solveAvatarLiftPoseForTarget } from './avatarPoseInverseKinematics';
import { makeNeutralPose } from './figurePlanCatalog';

export const CENEA_PLAYLIST_URL =
  'https://www.youtube.com/playlist?list=PLGWF77edtuwIarroBXtYXFQqPuXc-gwoe';

export type CeneaSampleCaseId =
  | 'cenea_mmc_almacen'
  | 'cenea_mmc_giro_riesgo'
  | 'cenea_transformando_higienico'
  | 'cenea_formulacion_pfm'
  | 'cenea_verduras_alimenticia'
  | 'cenea_empuje_traccion'
  | 'cenea_ocra_repetitivos'
  | 'cenea_diagnostico_bin';

export interface CeneaSampleVideoSpec {
  id: CeneaSampleCaseId;
  shortLabel: string;
  title: string;
  youtubeVideoId: string;
  sector: string;
  normativeFocus: string;
  movementDirection: 'levantamiento' | 'descenso' | 'bidireccional';
  loadWeightKg: number;
  frequencyPerMin: number;
  durationCategory: 'le_1h' | '1_to_2h' | '2_to_8h';
  couplingQuality: 'bueno' | 'regular' | 'malo';
  vOriginCm: number;
  hOriginCm: number;
  vDestCm: number;
  hDestCm: number;
  asymmetryOriginDeg: number;
  asymmetryDestDeg: number;
  trunkOriginDeg: number;
  kneeOriginDeg: number;
  trunkDestDeg: number;
  kneeDestDeg: number;
  liftStyleOrigin: LiftPostureStyle;
  liftStyleDest: LiftPostureStyle;
  prop: ScenePropType;
  cameraPreset: CameraPreset;
  orbit: CameraOrbitOverride;
  taskSummary: string;
}

export const CENEA_SAMPLE_VIDEOS_CATALOG: CeneaSampleVideoSpec[] = [
  {
    id: 'cenea_mmc_almacen',
    shortLabel: 'Muestra 1 · Almacén y Paletizado (18 kg · V=26→112 cm)',
    title: 'Caso Práctico 1 · Manejo Manual de Cargas en Almacén Logístico',
    youtubeVideoId: 'Jmid2s3XySI',
    sector: 'Logística y Expedición',
    normativeFocus: 'Ecuación NIOSH / ISO 11228-1 + REBA',
    movementDirection: 'levantamiento',
    loadWeightKg: 18,
    frequencyPerMin: 4,
    durationCategory: '1_to_2h',
    couplingQuality: 'regular',
    vOriginCm: 26,
    hOriginCm: 36,
    vDestCm: 112,
    hDestCm: 34,
    asymmetryOriginDeg: 15,
    asymmetryDestDeg: 10,
    trunkOriginDeg: 34,
    kneeOriginDeg: 78,
    trunkDestDeg: 8,
    kneeDestDeg: 10,
    liftStyleOrigin: 'observed',
    liftStyleDest: 'hygienic_squat',
    prop: 'pallet_jack_rack',
    cameraPreset: 'sagittal_right',
    orbit: { azimuthDeg: -18, elevationDeg: 8, zoom: 1.02 },
    taskSummary:
      'Toma bimanual de caja de 18 kg desde primer nivel de pallet sobre transpaleta (V=26 cm, H=36 cm) y estiba en nivel medio de estantería (V=112 cm).',
  },
  {
    id: 'cenea_mmc_giro_riesgo',
    shortLabel: 'Muestra 2 · Toma Baja con Giro Axial A=35° (16 kg)',
    title: 'Caso Práctico 2 · Evaluación de Riesgo por MMC con Asimetría Axial',
    youtubeVideoId: '64a4AvZiGQo',
    sector: ' Manufactura y Empaque',
    normativeFocus: 'Ecuación NIOSH (Factor AM) + REBA',
    movementDirection: 'levantamiento',
    loadWeightKg: 16,
    frequencyPerMin: 5,
    durationCategory: '2_to_8h',
    couplingQuality: 'regular',
    vOriginCm: 24,
    hOriginCm: 44,
    vDestCm: 92,
    hDestCm: 38,
    asymmetryOriginDeg: 35,
    asymmetryDestDeg: 12,
    trunkOriginDeg: 52,
    kneeOriginDeg: 34,
    trunkDestDeg: 12,
    kneeDestDeg: 12,
    liftStyleOrigin: 'stoop',
    liftStyleDest: 'observed',
    prop: 'box_load',
    cameraPreset: 'sagittal_right',
    orbit: { azimuthDeg: -24, elevationDeg: 9, zoom: 1.04 },
    taskSummary:
      'Levantamiento con flexión dorsolumbar pronunciada, alcance horizontal alejado (H=44 cm) y torsión axial del tronco de 35° en el origen.',
  },
  {
    id: 'cenea_transformando_higienico',
    shortLabel: 'Muestra 3 · Transformando el Trabajo: Técnica Higiénica (12 kg)',
    title: 'Caso Práctico 3 · Rediseño Postural: Rodillas Flexionadas + Espalda Recta',
    youtubeVideoId: 'hBzq8NdJUn0',
    sector: 'Mejora Ergonómica Aplicada',
    normativeFocus: 'Técnica Higiénica NIOSH / ISO 11228-1',
    movementDirection: 'levantamiento',
    loadWeightKg: 12,
    frequencyPerMin: 3,
    durationCategory: 'le_1h',
    couplingQuality: 'bueno',
    vOriginCm: 30,
    hOriginCm: 28,
    vDestCm: 105,
    hDestCm: 30,
    asymmetryOriginDeg: 0,
    asymmetryDestDeg: 0,
    trunkOriginDeg: 16,
    kneeOriginDeg: 110,
    trunkDestDeg: 4,
    kneeDestDeg: 6,
    liftStyleOrigin: 'hygienic_squat',
    liftStyleDest: 'hygienic_squat',
    prop: 'box_load',
    cameraPreset: 'sagittal_right',
    orbit: { azimuthDeg: -14, elevationDeg: 6, zoom: 1.05 },
    taskSummary:
      'Levantamiento bimanual pegado al cuerpo (H=28 cm) aplicando flexión profunda de rodillas (110°) y columna neutra alineada (16°) sin giro axial.',
  },
  {
    id: 'cenea_formulacion_pfm',
    shortLabel: 'Muestra 4 · Formulación PFM: Vaciado de Sacos en Tolva (20 kg)',
    title: 'Caso Práctico 4 · Alimentación y Vaciado Manual de Sacos en Tolva Industrial',
    youtubeVideoId: 'IeWgE04q88g',
    sector: 'Industria Química / Formulación',
    normativeFocus: 'NIOSH + OWAS / REBA',
    movementDirection: 'levantamiento',
    loadWeightKg: 20,
    frequencyPerMin: 2.5,
    durationCategory: '1_to_2h',
    couplingQuality: 'malo',
    vOriginCm: 30,
    hOriginCm: 38,
    vDestCm: 102,
    hDestCm: 42,
    asymmetryOriginDeg: 18,
    asymmetryDestDeg: 10,
    trunkOriginDeg: 28,
    kneeOriginDeg: 86,
    trunkDestDeg: 18,
    kneeDestDeg: 16,
    liftStyleOrigin: 'observed',
    liftStyleDest: 'observed',
    prop: 'hopper_sack_pour',
    cameraPreset: 'sagittal_right',
    orbit: { azimuthDeg: -20, elevationDeg: 8, zoom: 1.0 },
    taskSummary:
      'Toma de saco flexible de materia prima de 20 kg desde estiba baja (V=30 cm) y elevación hasta el borde de descarga de tolva inoxidable (V=102 cm, H=42 cm).',
  },
  {
    id: 'cenea_verduras_alimenticia',
    shortLabel: 'Muestra 5 · Industria Alimenticia: Cajas en Cinta de Verduras (11 kg)',
    title: 'Caso Práctico 5 · Selección y Descenso de Cajas en Línea Hortofrutícola',
    youtubeVideoId: 'nOTqybxivYs',
    sector: 'Industria Agroalimentaria',
    normativeFocus: 'NIOSH Descenso + OCRA / RULA',
    movementDirection: 'descenso',
    loadWeightKg: 11,
    frequencyPerMin: 5,
    durationCategory: '2_to_8h',
    couplingQuality: 'bueno',
    vOriginCm: 86,
    hOriginCm: 34,
    vDestCm: 50,
    hDestCm: 36,
    asymmetryOriginDeg: 10,
    asymmetryDestDeg: 20,
    trunkOriginDeg: 12,
    kneeOriginDeg: 10,
    trunkDestDeg: 24,
    kneeDestDeg: 68,
    liftStyleOrigin: 'hygienic_squat',
    liftStyleDest: 'hygienic_squat',
    prop: 'conveyor_veg_line',
    cameraPreset: 'sagittal_right',
    orbit: { azimuthDeg: -18, elevationDeg: 8, zoom: 1.02 },
    taskSummary:
      'Retiro de gaveta plástica ventilada con producto fresco (11 kg) desde cinta transportadora (V=86 cm) y descenso controlado hacia estiba media-baja (V=50 cm).',
  },
  {
    id: 'cenea_empuje_traccion',
    shortLabel: 'Muestra 6 · Empuje y Tracción de Carro Logístico (Snook / ISO 11228-2)',
    title: 'Caso Práctico 6 · Empuje Bimanual de Carro Plataforma Cargado',
    youtubeVideoId: 'yBUzQV30s6w',
    sector: 'Abastecimiento Interno de Planta',
    normativeFocus: 'Tablas Snook y Ciriello / ISO 11228-2 + REBA',
    movementDirection: 'bidireccional',
    loadWeightKg: 15,
    frequencyPerMin: 2,
    durationCategory: '1_to_2h',
    couplingQuality: 'bueno',
    vOriginCm: 96,
    hOriginCm: 38,
    vDestCm: 96,
    hDestCm: 44,
    asymmetryOriginDeg: 0,
    asymmetryDestDeg: 0,
    trunkOriginDeg: 14,
    kneeOriginDeg: 26,
    trunkDestDeg: 10,
    kneeDestDeg: 14,
    liftStyleOrigin: 'hygienic_squat',
    liftStyleDest: 'hygienic_squat',
    prop: 'cart_push_dynamo',
    cameraPreset: 'sagittal_right',
    orbit: { azimuthDeg: -14, elevationDeg: 7, zoom: 1.0 },
    taskSummary:
      'Impulso inicial y fuerza sostenida sobre manillar a 96 cm de altura con postura en paso asimétrico y tronco alineado transmitiendo fuerza con el peso corporal.',
  },
  {
    id: 'cenea_ocra_repetitivos',
    shortLabel: 'Muestra 7 · Movimientos Repetitivos en Cinta (OCRA Check List / RULA)',
    title: 'Caso Práctico 7 · Clasificación y Acondicionamiento Repetitivo en Banda',
    youtubeVideoId: 'kIL3T0zsjfU',
    sector: 'Línea Continua de Acondicionamiento',
    normativeFocus: 'OCRA Check List / RULA Miembros Superiores',
    movementDirection: 'bidireccional',
    loadWeightKg: 3,
    frequencyPerMin: 12,
    durationCategory: '2_to_8h',
    couplingQuality: 'bueno',
    vOriginCm: 88,
    hOriginCm: 32,
    vDestCm: 92,
    hDestCm: 42,
    asymmetryOriginDeg: 8,
    asymmetryDestDeg: 14,
    trunkOriginDeg: 10,
    kneeOriginDeg: 6,
    trunkDestDeg: 16,
    kneeDestDeg: 8,
    liftStyleOrigin: 'observed',
    liftStyleDest: 'observed',
    prop: 'conveyor_veg_line',
    cameraPreset: 'isometric',
    orbit: { azimuthDeg: -28, elevationDeg: 12, zoom: 1.06 },
    taskSummary:
      'Bipedestación frente a cinta continua a 88 cm ejecutando ciclos rápidos de alcance, prensión palmar y reubicación de unidades ligeras.',
  },
  {
    id: 'cenea_diagnostico_bin',
    shortLabel: 'Muestra 8 · Diagnóstico Biomecánico: Extracción de Bin a Carro (10 kg)',
    title: 'Caso Práctico 8 · Extracción desde Contenedor Bin Profundo hacia Carro',
    youtubeVideoId: 'jRDQMWi1Fwc',
    sector: 'Recepción de Componentes Industriales',
    normativeFocus: 'NIOSH + REBA (Compromiso Lumbar y Hombros)',
    movementDirection: 'levantamiento',
    loadWeightKg: 10,
    frequencyPerMin: 4,
    durationCategory: '1_to_2h',
    couplingQuality: 'regular',
    vOriginCm: 44,
    hOriginCm: 46,
    vDestCm: 86,
    hDestCm: 34,
    asymmetryOriginDeg: 20,
    asymmetryDestDeg: 10,
    trunkOriginDeg: 46,
    kneeOriginDeg: 32,
    trunkDestDeg: 10,
    kneeDestDeg: 12,
    liftStyleOrigin: 'observed',
    liftStyleDest: 'hygienic_squat',
    prop: 'bin_to_cart',
    cameraPreset: 'sagittal_right',
    orbit: { azimuthDeg: -16, elevationDeg: 8, zoom: 1.02 },
    taskSummary:
      'Extracción de pieza por encima de la pared del contenedor Bin (flexión de tronco 46°, H=46 cm) y traslado hacia plataforma de carro lateral (V=86 cm).',
  },
];

export function getCeneaSampleCaseById(id: CeneaSampleCaseId): CeneaSampleVideoSpec {
  return CENEA_SAMPLE_VIDEOS_CATALOG.find((c) => c.id === id) || CENEA_SAMPLE_VIDEOS_CATALOG[0];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothStep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/**
 * Interpola cuadro a cuadro la cinemática 3D de cualquiera de los 8 casos prácticos
 * para generar un video sintético realista o previsualizar Origen y Destino en el Avatar.
 */
export function buildCeneaSampleFrameSpec(
  spec: CeneaSampleVideoSpec,
  progress0to1: number,
  workerHeightCm = 172,
): {
  panelSpec: Panel3DSpec;
  orbit: CameraOrbitOverride;
  currentVCm: number;
  currentHCm: number;
} {
  const p = Math.max(0, Math.min(1, progress0to1));

  // Fase temporal suave: 0..0.22 pausa en Origen, 0.22..0.80 transición suave, 0.80..1.00 pausa en Destino
  let phase = 0;
  if (p < 0.22) {
    phase = 0;
  } else if (p <= 0.80) {
    phase = smoothStep((p - 0.22) / 0.58);
  } else {
    phase = 1;
  }

  // Casos cíclicos especiales: Empuje de carro (6) y OCRA repetitivos en banda (7)
  if (spec.id === 'cenea_empuje_traccion') {
    const stride = Math.sin(p * Math.PI * 2);
    const impulseFactor = p < 0.35 ? smoothStep(p / 0.35) : 1;
    const pose: PosturePose3D = makeNeutralPose({
      trunkFlexionDeg: Math.round(14 - 4 * impulseFactor),
      neckFlexionDeg: 6,
      shoulderRFlexionDeg: Math.round(52 + 8 * impulseFactor),
      shoulderLFlexionDeg: Math.round(52 + 8 * impulseFactor),
      shoulderRAbductionDeg: 10,
      shoulderLAbductionDeg: 10,
      elbowRFlexionDeg: Math.round(68 - 14 * impulseFactor),
      elbowLFlexionDeg: Math.round(68 - 14 * impulseFactor),
      forearmRPronationDeg: 65,
      wristRFlexionDeg: 4,
      wristLFlexionDeg: 4,
      hipRFlexionDeg: Math.round(28 + 14 * stride),
      kneeRFlexionDeg: Math.round(24 + 12 * Math.max(0, stride)),
      ankleRDorsiflexionDeg: Math.round(10 + 6 * stride),
      hipLFlexionDeg: Math.round(18 - 14 * stride),
      kneeLFlexionDeg: Math.round(18 + 12 * Math.max(0, -stride)),
      ankleLDorsiflexionDeg: Math.round(8 - 5 * stride),
      prop: 'cart_push_dynamo',
    });

    const stageLabel =
      p < 0.32
        ? 'Fase Inicial: Vencimiento de Inercia (F inicial)'
        : 'Fase Sostenida: Empuje Continuo (V=96 cm)';

    return {
      panelSpec: {
        subTitle: spec.title,
        scoreBadge: stageLabel,
        focusZone: 'full_body',
        cameraPreset: spec.cameraPreset,
        pose,
        angleArcs: [],
        forceVectors: [
          {
            atJoint: 'handR',
            dx: 1,
            dy: 0,
            lengthPx: 48,
            label: p < 0.32 ? 'F inic. 240 N' : 'F sost. 145 N',
            color: 'blue',
          },
        ],
        noteBottom: `${spec.sector} · Manillar V=96 cm · ${spec.normativeFocus}`,
      },
      orbit: {
        azimuthDeg: Math.round(spec.orbit.azimuthDeg + 5 * Math.sin(p * Math.PI)),
        elevationDeg: spec.orbit.elevationDeg,
        zoom: spec.orbit.zoom,
      },
      currentVCm: 96,
      currentHCm: Math.round(lerp(spec.hOriginCm, spec.hDestCm, impulseFactor)),
    };
  }

  if (spec.id === 'cenea_ocra_repetitivos') {
    const cycleWave = 0.5 - 0.5 * Math.cos(p * Math.PI * 4); // 2 ciclos completos de alcance-prensión
    const curV = Math.round(lerp(spec.vOriginCm, spec.vDestCm, cycleWave));
    const curH = Math.round(lerp(spec.hOriginCm, spec.hDestCm, cycleWave));
    const pose: PosturePose3D = makeNeutralPose({
      trunkFlexionDeg: Math.round(lerp(8, 16, cycleWave)),
      trunkTwistDeg: Math.round(lerp(-8, 14, cycleWave)),
      neckFlexionDeg: Math.round(lerp(14, 22, cycleWave)),
      shoulderRFlexionDeg: Math.round(lerp(28, 56, cycleWave)),
      shoulderLFlexionDeg: Math.round(lerp(22, 42, 1 - cycleWave)),
      shoulderRAbductionDeg: Math.round(lerp(12, 26, cycleWave)),
      shoulderLAbductionDeg: Math.round(lerp(10, 18, 1 - cycleWave)),
      elbowRFlexionDeg: Math.round(lerp(86, 48, cycleWave)),
      elbowLFlexionDeg: Math.round(lerp(82, 62, 1 - cycleWave)),
      forearmRPronationDeg: 65,
      wristRFlexionDeg: Math.round(lerp(6, 22, cycleWave)),
      wristRDeviationDeg: Math.round(lerp(4, 14, cycleWave)),
      kneeRFlexionDeg: 6,
      kneeLFlexionDeg: 6,
      hipRFlexionDeg: 4,
      hipLFlexionDeg: 4,
      prop: 'conveyor_veg_line',
    });

    return {
      panelSpec: {
        subTitle: spec.title,
        scoreBadge:
          cycleWave < 0.5
            ? `Toma en Banda (V=${curV} cm · H=${curH} cm)`
            : `Alcance y Clasificación (Hombro ${pose.shoulderRFlexionDeg}°)`,
        focusZone: 'full_body',
        cameraPreset: spec.cameraPreset,
        pose,
        angleArcs: [],
        forceVectors: [],
        noteBottom: `${spec.sector} · Cadencia alta · ${spec.normativeFocus}`,
      },
      orbit: {
        azimuthDeg: Math.round(spec.orbit.azimuthDeg + 6 * Math.sin(p * Math.PI)),
        elevationDeg: spec.orbit.elevationDeg,
        zoom: spec.orbit.zoom,
      },
      currentVCm: curV,
      currentHCm: curH,
    };
  }

  // Casos de Manipulación Manual de Cargas (Levantamiento o Descenso entre V_origen y V_destino)
  const curVCm = Math.round(lerp(spec.vOriginCm, spec.vDestCm, phase));
  const curHCm = Math.round(lerp(spec.hOriginCm, spec.hDestCm, phase));
  const curTrunkDeg = Math.round(lerp(spec.trunkOriginDeg, spec.trunkDestDeg, phase));
  const curKneeDeg = Math.round(lerp(spec.kneeOriginDeg, spec.kneeDestDeg, phase));
  const curTwistDeg = Math.round(lerp(spec.asymmetryOriginDeg, spec.asymmetryDestDeg, phase));
  const activeStyle: LiftPostureStyle = phase < 0.5 ? spec.liftStyleOrigin : spec.liftStyleDest;

  const solved = solveAvatarLiftPoseForTarget({
    vCm: curVCm,
    hCm: curHCm,
    workerHeightCm,
    trunkFlexHintDeg: curTrunkDeg,
    kneeFlexHintDeg: curKneeDeg,
    asymmetryDeg: curTwistDeg,
    loadKg: spec.loadWeightKg,
    liftStyle: activeStyle,
  });

  const poseWithProp: PosturePose3D = {
    ...solved.pose,
    prop: spec.prop,
  };

  const badgeText =
    p < 0.25
      ? `Origen: V=${curVCm} cm · H=${curHCm} cm`
      : p < 0.78
        ? spec.movementDirection === 'descenso'
          ? `Descenso de Carga (${spec.loadWeightKg} kg)`
          : `Elevación de Carga (${spec.loadWeightKg} kg)`
        : `Destino: V=${curVCm} cm · H=${curHCm} cm`;

  return {
    panelSpec: {
      subTitle: spec.title,
      scoreBadge: badgeText,
      focusZone: 'full_body',
      cameraPreset: spec.cameraPreset,
      pose: poseWithProp,
      angleArcs: [],
      forceVectors: [],
      noteBottom: `${spec.sector} · Carga ${spec.loadWeightKg} kg · V=${curVCm} cm · H=${curHCm} cm`,
    },
    orbit: {
      azimuthDeg: Math.round(spec.orbit.azimuthDeg + 6 * phase),
      elevationDeg: spec.orbit.elevationDeg,
      zoom: spec.orbit.zoom,
    },
    currentVCm: curVCm,
    currentHCm: curHCm,
  };
}

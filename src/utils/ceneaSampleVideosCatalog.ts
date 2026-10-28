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

function getCaseSpatialTrajectory(spec: CeneaSampleVideoSpec): {
  approachStartX: number;
  approachStartZ: number;
  originX: number;
  originZ: number;
  originYawDeg: number;
  destX: number;
  destZ: number;
  destYawDeg: number;
} {
  switch (spec.prop) {
    case 'pallet_jack_rack':
      return {
        approachStartX: -0.18,
        approachStartZ: -0.34,
        originX: -0.04,
        originZ: -0.06,
        originYawDeg: -8,
        destX: 0.08,
        destZ: 0.14,
        destYawDeg: 24,
      };
    case 'hopper_sack_pour':
      return {
        approachStartX: -0.16,
        approachStartZ: -0.32,
        originX: -0.04,
        originZ: -0.06,
        originYawDeg: -10,
        destX: 0.04,
        destZ: 0.12,
        destYawDeg: 18,
      };
    case 'conveyor_veg_line':
      return {
        approachStartX: -0.14,
        approachStartZ: -0.26,
        originX: 0.0,
        originZ: -0.02,
        originYawDeg: 6,
        destX: 0.12,
        destZ: 0.10,
        destYawDeg: -26,
      };
    case 'bin_to_cart':
      return {
        approachStartX: -0.16,
        approachStartZ: -0.28,
        originX: -0.02,
        originZ: -0.02,
        originYawDeg: -6,
        destX: 0.12,
        destZ: 0.08,
        destYawDeg: 30,
      };
    default:
      return {
        approachStartX: -0.18,
        approachStartZ: -0.34,
        originX: -0.02,
        originZ: -0.04,
        originYawDeg: -6,
        destX: 0.12,
        destZ: 0.16,
        destYawDeg: 28,
      };
  }
}

/**
 * Interpola cuadro a cuadro la cinemática 3D humanizada de cualquiera de los 8 casos prácticos
 * inspirados en la playlist de ergonomía aplicada (aproximación caminando, toma bimanual en origen,
 * acercamiento al centro de masa, caminata corta con giro corporal parcial, depósito en destino
 * sin arrastrar el mobiliario fijo y recuperación postural erguida).
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

  // Caso 6: Empuje bimanual de carro con caminata real progresiva sobre la planta
  if (spec.id === 'cenea_empuje_traccion') {
    const stride = Math.sin(p * Math.PI * 4);
    const impulseFactor = p < 0.28 ? smoothStep(p / 0.28) : 1;
    const travelZ = lerp(-0.36, 0.34, smoothStep(p));
    const travelYaw = Math.round(lerp(0, 8, smoothStep(Math.max(0, (p - 0.55) / 0.45))));

    const pose: PosturePose3D = makeNeutralPose({
      stanceMode: 'walking',
      trunkFlexionDeg: Math.round(16 - 5 * impulseFactor),
      neckFlexionDeg: 4,
      shoulderRFlexionDeg: Math.round(50 + 8 * impulseFactor),
      shoulderLFlexionDeg: Math.round(50 + 8 * impulseFactor),
      shoulderRAbductionDeg: 8,
      shoulderLAbductionDeg: 8,
      elbowRFlexionDeg: Math.round(66 - 14 * impulseFactor),
      elbowLFlexionDeg: Math.round(66 - 14 * impulseFactor),
      forearmRPronationDeg: 65,
      forearmLPronationDeg: -65,
      wristRFlexionDeg: 4,
      wristLFlexionDeg: 4,
      handGripMode: 'power_grip',
      hipRFlexionDeg: Math.round(24 + 16 * stride),
      kneeRFlexionDeg: Math.round(22 + 14 * Math.max(0, stride)),
      ankleRDorsiflexionDeg: Math.round(8 + 6 * stride),
      hipLFlexionDeg: Math.round(20 - 16 * stride),
      kneeLFlexionDeg: Math.round(20 + 14 * Math.max(0, -stride)),
      ankleLDorsiflexionDeg: Math.round(8 - 6 * stride),
      prop: 'cart_push_dynamo',
      rootOffsetX: 0,
      rootOffsetZ: Number(travelZ.toFixed(3)),
      rootYawDeg: travelYaw,
    });

    const stageLabel =
      p < 0.28
        ? '1. Impulso Inicial: Vencimiento de Inercia (240 N)'
        : p < 0.72
          ? '2. Marcha Continua: Empuje Sostenido (145 N)'
          : '3. Maniobra de Alineación y Frenado Controlado';

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
            label: p < 0.28 ? 'F inic. 240 N' : 'F sost. 145 N',
            color: 'blue',
          },
        ],
        noteBottom: `${spec.sector} · Traslado real 2,5 m · Manillar V=96 cm · ${spec.normativeFocus}`,
      },
      orbit: {
        azimuthDeg: Math.round(spec.orbit.azimuthDeg + 6 * Math.sin(p * Math.PI)),
        elevationDeg: spec.orbit.elevationDeg,
        zoom: spec.orbit.zoom,
      },
      currentVCm: 96,
      currentHCm: Math.round(lerp(spec.hOriginCm, spec.hDestCm, impulseFactor)),
    };
  }

  // Caso 7: Ciclos repetitivos bimanuales frente a banda continua con transferencia lateral y cambio de peso
  if (spec.id === 'cenea_ocra_repetitivos') {
    const cycleWave = 0.5 - 0.5 * Math.cos(p * Math.PI * 4);
    const weightShift = Math.sin(p * Math.PI * 2);
    const curV = Math.round(lerp(spec.vOriginCm, spec.vDestCm, cycleWave));
    const curH = Math.round(lerp(spec.hOriginCm, spec.hDestCm, cycleWave));
    const pose: PosturePose3D = makeNeutralPose({
      trunkFlexionDeg: Math.round(lerp(8, 15, cycleWave)),
      trunkTwistDeg: Math.round(lerp(-6, 10, cycleWave)),
      neckFlexionDeg: Math.round(lerp(12, 18, cycleWave)),
      neckTwistDeg: Math.round(lerp(-8, 12, cycleWave)),
      shoulderRFlexionDeg: Math.round(lerp(32, 58, cycleWave)),
      shoulderLFlexionDeg: Math.round(lerp(28, 52, 1 - cycleWave * 0.6)),
      shoulderRAbductionDeg: Math.round(lerp(8, 22, cycleWave)),
      shoulderLAbductionDeg: Math.round(lerp(8, 18, 1 - cycleWave)),
      elbowRFlexionDeg: Math.round(lerp(82, 46, cycleWave)),
      elbowLFlexionDeg: Math.round(lerp(78, 52, 1 - cycleWave * 0.6)),
      forearmRPronationDeg: 55,
      forearmLPronationDeg: -55,
      wristRFlexionDeg: Math.round(lerp(6, 20, cycleWave)),
      wristRDeviationDeg: Math.round(lerp(4, 14, cycleWave)),
      wristLFlexionDeg: Math.round(lerp(4, 14, 1 - cycleWave)),
      handGripMode: cycleWave > 0.35 ? 'box_cradle' : 'pinch',
      kneeRFlexionDeg: Math.round(8 + 4 * Math.max(0, weightShift)),
      hipRFlexionDeg: Math.round(6 + 3 * Math.max(0, weightShift)),
      ankleRDorsiflexionDeg: 2,
      kneeLFlexionDeg: Math.round(8 + 4 * Math.max(0, -weightShift)),
      hipLFlexionDeg: Math.round(6 + 3 * Math.max(0, -weightShift)),
      ankleLDorsiflexionDeg: 2,
      prop: 'conveyor_veg_line',
      loadDetachedPhase: cycleWave > 0.25 && cycleWave < 0.85 ? 'carried' : 'origin_rest',
      rootOffsetX: Number((0.05 * weightShift).toFixed(3)),
      rootOffsetZ: 0,
      rootYawDeg: Math.round(12 * weightShift),
    });

    return {
      panelSpec: {
        subTitle: spec.title,
        scoreBadge:
          cycleWave < 0.45
            ? `1. Alcance y Selección en Banda (V=${curV} cm)`
            : `2. Clasificación Bimanual y Giro Parcial (${pose.shoulderRFlexionDeg}°)`,
        focusZone: 'full_body',
        cameraPreset: spec.cameraPreset,
        pose,
        angleArcs: [],
        forceVectors: [],
        noteBottom: `${spec.sector} · Tarea bimanual continua · ${spec.normativeFocus}`,
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

  // =========================================================================
  // TAREA HUMANIZADA DE 5 ETAPAS (APROXIMACIÓN -> TOMA -> PORTE -> TRASLADO/GIRO -> DEPÓSITO)
  // =========================================================================
  const traj = getCaseSpatialTrajectory(spec);
  const vCarryCm = Math.round(Math.max(72, Math.min(84, (spec.vOriginCm + spec.vDestCm) * 0.52)));
  const hCarryCm = 27;

  // Pose de origen exacta (cuando el operario toma la carga)
  const originSolved = solveAvatarLiftPoseForTarget({
    vCm: spec.vOriginCm,
    hCm: spec.hOriginCm,
    workerHeightCm,
    trunkFlexHintDeg: spec.trunkOriginDeg,
    kneeFlexHintDeg: spec.kneeOriginDeg,
    asymmetryDeg: spec.asymmetryOriginDeg,
    loadKg: spec.loadWeightKg,
    liftStyle: spec.liftStyleOrigin,
  });

  // Pose intermedia de porte pegado al cuerpo (cintura-nudillos) para caminar y girar de forma humana
  const carrySolved = solveAvatarLiftPoseForTarget({
    vCm: vCarryCm,
    hCm: hCarryCm,
    workerHeightCm,
    trunkFlexHintDeg: 8,
    kneeFlexHintDeg: 14,
    asymmetryDeg: 0,
    loadKg: spec.loadWeightKg,
    liftStyle: 'hygienic_squat',
  });

  // Pose de destino exacta (cuando el operario deposita la carga en el mueble receptor)
  const destSolved = solveAvatarLiftPoseForTarget({
    vCm: spec.vDestCm,
    hCm: spec.hDestCm,
    workerHeightCm,
    trunkFlexHintDeg: spec.trunkDestDeg,
    kneeFlexHintDeg: spec.kneeDestDeg,
    asymmetryDeg: spec.asymmetryDestDeg,
    loadKg: spec.loadWeightKg,
    liftStyle: spec.liftStyleDest,
  });

  function blendPoses(a: PosturePose3D, b: PosturePose3D, tRaw: number): PosturePose3D {
    const t = smoothStep(tRaw);
    return {
      ...b,
      trunkFlexionDeg: Math.round(lerp(a.trunkFlexionDeg, b.trunkFlexionDeg, t)),
      trunkLateralDeg: Math.round(lerp(a.trunkLateralDeg, b.trunkLateralDeg, t)),
      trunkTwistDeg: Math.round(lerp(a.trunkTwistDeg, b.trunkTwistDeg, t)),
      neckFlexionDeg: Math.round(lerp(a.neckFlexionDeg, b.neckFlexionDeg, t)),
      neckLateralDeg: Math.round(lerp(a.neckLateralDeg, b.neckLateralDeg, t)),
      neckTwistDeg: Math.round(lerp(a.neckTwistDeg, b.neckTwistDeg, t)),
      shoulderRFlexionDeg: Math.round(lerp(a.shoulderRFlexionDeg, b.shoulderRFlexionDeg, t)),
      shoulderRAbductionDeg: Math.round(lerp(a.shoulderRAbductionDeg, b.shoulderRAbductionDeg, t)),
      shoulderLFlexionDeg: Math.round(lerp(a.shoulderLFlexionDeg, b.shoulderLFlexionDeg, t)),
      shoulderLAbductionDeg: Math.round(lerp(a.shoulderLAbductionDeg, b.shoulderLAbductionDeg, t)),
      elbowRFlexionDeg: Math.round(lerp(a.elbowRFlexionDeg, b.elbowRFlexionDeg, t)),
      elbowLFlexionDeg: Math.round(lerp(a.elbowLFlexionDeg, b.elbowLFlexionDeg, t)),
      forearmRPronationDeg: Math.round(lerp(a.forearmRPronationDeg, b.forearmRPronationDeg, t)),
      forearmLPronationDeg: Math.round(
        lerp(a.forearmLPronationDeg ?? -a.forearmRPronationDeg, b.forearmLPronationDeg ?? -b.forearmRPronationDeg, t),
      ),
      wristRFlexionDeg: Math.round(lerp(a.wristRFlexionDeg, b.wristRFlexionDeg, t)),
      wristRDeviationDeg: Math.round(lerp(a.wristRDeviationDeg, b.wristRDeviationDeg, t)),
      wristLFlexionDeg: Math.round(lerp(a.wristLFlexionDeg ?? a.wristRFlexionDeg, b.wristLFlexionDeg ?? b.wristRFlexionDeg, t)),
      wristLDeviationDeg: Math.round(
        lerp(a.wristLDeviationDeg ?? a.wristRDeviationDeg, b.wristLDeviationDeg ?? b.wristRDeviationDeg, t),
      ),
      hipRFlexionDeg: Math.round(lerp(a.hipRFlexionDeg, b.hipRFlexionDeg, t)),
      kneeRFlexionDeg: Math.round(lerp(a.kneeRFlexionDeg, b.kneeRFlexionDeg, t)),
      ankleRDorsiflexionDeg: Math.round(lerp(a.ankleRDorsiflexionDeg, b.ankleRDorsiflexionDeg, t)),
      hipLFlexionDeg: Math.round(lerp(a.hipLFlexionDeg, b.hipLFlexionDeg, t)),
      kneeLFlexionDeg: Math.round(lerp(a.kneeLFlexionDeg, b.kneeLFlexionDeg, t)),
      ankleLDorsiflexionDeg: Math.round(lerp(a.ankleLDorsiflexionDeg, b.ankleLDorsiflexionDeg, t)),
      stanceMode: t < 0.5 ? a.stanceMode : b.stanceMode,
      handGripMode: t < 0.5 ? a.handGripMode : b.handGripMode,
    };
  }

  const standingApproachBase = makeNeutralPose({
    stanceMode: 'walking',
    trunkFlexionDeg: 6,
    neckFlexionDeg: 8,
    shoulderRFlexionDeg: 18,
    shoulderLFlexionDeg: 18,
    shoulderRAbductionDeg: 5,
    shoulderLAbductionDeg: 5,
    elbowRFlexionDeg: 28,
    elbowLFlexionDeg: 28,
    handGripMode: 'relaxed',
    hipRFlexionDeg: 10,
    kneeRFlexionDeg: 14,
    ankleRDorsiflexionDeg: 4,
    hipLFlexionDeg: -6,
    kneeLFlexionDeg: 10,
    ankleLDorsiflexionDeg: 2,
    loadKg: spec.loadWeightKg,
  });

  let activePose: PosturePose3D;
  let curVCm = spec.vOriginCm;
  let curHCm = spec.hOriginCm;
  let badgeText = '';
  let rootX = traj.originX;
  let rootZ = traj.originZ;
  let rootYaw = traj.originYawDeg;
  let detachedPhase: 'origin_rest' | 'carried' | 'dest_rest' = 'carried';

  if (p < 0.14) {
    // Etapa 1: Caminata de aproximación (carga quieta en el mueble de origen)
    const u = p / 0.14;
    const gait = Math.sin(u * Math.PI * 2);
    const baseBlend = blendPoses(standingApproachBase, originSolved.pose, u * 0.45);
    activePose = {
      ...baseBlend,
      stanceMode: 'walking',
      handGripMode: 'relaxed',
      hipRFlexionDeg: Math.round(baseBlend.hipRFlexionDeg + 12 * gait),
      kneeRFlexionDeg: Math.round(baseBlend.kneeRFlexionDeg + 10 * Math.max(0, gait)),
      hipLFlexionDeg: Math.round(baseBlend.hipLFlexionDeg - 12 * gait),
      kneeLFlexionDeg: Math.round(baseBlend.kneeLFlexionDeg + 10 * Math.max(0, -gait)),
    };
    rootX = lerp(traj.approachStartX, traj.originX, smoothStep(u));
    rootZ = lerp(traj.approachStartZ, traj.originZ, smoothStep(u));
    rootYaw = Math.round(lerp(0, traj.originYawDeg, smoothStep(u)));
    detachedPhase = 'origin_rest';
    curVCm = spec.vOriginCm;
    curHCm = spec.hOriginCm;
    badgeText = `1. Aproximación al puesto (V=${spec.vOriginCm} cm)`;
  } else if (p < 0.30) {
    // Etapa 2: Descenso postural y acople bimanual en Origen (ventana clave para captura de Origen)
    const u = (p - 0.14) / 0.16;
    const reachIn = u < 0.35 ? u / 0.35 : 1;
    activePose = reachIn < 1 ? blendPoses(standingApproachBase, originSolved.pose, 0.45 + 0.55 * reachIn) : originSolved.pose;
    activePose.handGripMode = 'box_cradle';
    rootX = traj.originX;
    rootZ = traj.originZ;
    rootYaw = traj.originYawDeg;
    detachedPhase = u < 0.25 ? 'origin_rest' : 'carried';
    curVCm = spec.vOriginCm;
    curHCm = spec.hOriginCm;
    badgeText = `2. Toma Bimanual en Origen (V=${curVCm} cm · H=${curHCm} cm)`;
  } else if (p < 0.50) {
    // Etapa 3: Levantamiento / acercamiento de la carga hacia la pelvis (zona de porte segura)
    const u = (p - 0.30) / 0.20;
    activePose = blendPoses(originSolved.pose, carrySolved.pose, u);
    activePose.handGripMode = 'box_cradle';
    rootX = lerp(traj.originX, (traj.originX + traj.destX) * 0.35, smoothStep(u));
    rootZ = lerp(traj.originZ, (traj.originZ + traj.destZ) * 0.35, smoothStep(u));
    rootYaw = Math.round(lerp(traj.originYawDeg, (traj.originYawDeg + traj.destYawDeg) * 0.35, smoothStep(u)));
    detachedPhase = 'carried';
    curVCm = Math.round(lerp(spec.vOriginCm, vCarryCm, smoothStep(u)));
    curHCm = Math.round(lerp(spec.hOriginCm, hCarryCm, smoothStep(u)));
    badgeText = `3. Acercamiento al Cuerpo (${spec.loadWeightKg} kg · V=${curVCm} cm)`;
  } else if (p < 0.72) {
    // Etapa 4: Caminata corta de traslado + giro corporal parcial hacia el mueble de destino
    const u = (p - 0.50) / 0.22;
    const stepWave = Math.sin(u * Math.PI * 2);
    const carryWalk = blendPoses(carrySolved.pose, destSolved.pose, u * 0.35);
    activePose = {
      ...carryWalk,
      stanceMode: 'walking',
      handGripMode: 'box_cradle',
      hipRFlexionDeg: Math.round(carryWalk.hipRFlexionDeg + 14 * stepWave),
      kneeRFlexionDeg: Math.round(carryWalk.kneeRFlexionDeg + 12 * Math.max(0, stepWave)),
      ankleRDorsiflexionDeg: Math.round(carryWalk.ankleRDorsiflexionDeg + 4 * stepWave),
      hipLFlexionDeg: Math.round(carryWalk.hipLFlexionDeg - 14 * stepWave),
      kneeLFlexionDeg: Math.round(carryWalk.kneeLFlexionDeg + 12 * Math.max(0, -stepWave)),
      ankleLDorsiflexionDeg: Math.round(carryWalk.ankleLDorsiflexionDeg - 4 * stepWave),
    };
    rootX = lerp((traj.originX + traj.destX) * 0.35, traj.destX, smoothStep(u));
    rootZ = lerp((traj.originZ + traj.destZ) * 0.35, traj.destZ, smoothStep(u));
    rootYaw = Math.round(lerp((traj.originYawDeg + traj.destYawDeg) * 0.35, traj.destYawDeg, smoothStep(u)));
    detachedPhase = 'carried';
    curVCm = Math.round(lerp(vCarryCm, spec.vDestCm, smoothStep(u) * 0.45));
    curHCm = Math.round(lerp(hCarryCm, spec.hDestCm, smoothStep(u) * 0.45));
    badgeText = `4. Caminata y Giro Corporal (${rootYaw > 0 ? '+' : ''}${rootYaw}°)`;
  } else if (p < 0.90) {
    // Etapa 5a: Posicionamiento y depósito controlado sobre el destino fijo (ventana clave para Destino)
    const u = (p - 0.72) / 0.18;
    const settle = u < 0.45 ? u / 0.45 : 1;
    activePose = settle < 1 ? blendPoses(carrySolved.pose, destSolved.pose, 0.35 + 0.65 * settle) : destSolved.pose;
    activePose.handGripMode = 'box_cradle';
    rootX = traj.destX;
    rootZ = traj.destZ;
    rootYaw = traj.destYawDeg;
    detachedPhase = 'carried';
    curVCm = spec.vDestCm;
    curHCm = spec.hDestCm;
    badgeText = `5. Depósito en Destino (V=${curVCm} cm · H=${curHCm} cm)`;
  } else {
    // Etapa 5b: Liberación de la carga en destino y recuperación erguida del operario
    const u = (p - 0.90) / 0.10;
    activePose = blendPoses(destSolved.pose, standingApproachBase, u);
    activePose.stanceMode = 'standing';
    activePose.handGripMode = 'relaxed';
    rootX = lerp(traj.destX, traj.destX - 0.05, smoothStep(u));
    rootZ = lerp(traj.destZ, traj.destZ - 0.08, smoothStep(u));
    rootYaw = traj.destYawDeg;
    detachedPhase = 'dest_rest';
    curVCm = spec.vDestCm;
    curHCm = spec.hDestCm;
    badgeText = `Ciclo Completado · Recuperación Postural`;
  }

  const poseWithProp: PosturePose3D = {
    ...activePose,
    prop: spec.prop,
    loadKg: spec.loadWeightKg,
    rootOffsetX: Number(rootX.toFixed(3)),
    rootOffsetZ: Number(rootZ.toFixed(3)),
    rootYawDeg: rootYaw,
    loadDetachedPhase: detachedPhase,
  };

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
      azimuthDeg: Math.round(spec.orbit.azimuthDeg + 8 * smoothStep(p)),
      elevationDeg: spec.orbit.elevationDeg,
      zoom: spec.orbit.zoom,
    },
    currentVCm: curVCm,
    currentHCm: curHCm,
  };
}

import { PosturePose3D } from '../types/figurePlan';

export interface NormativeKinoveaJointRow {
  id: string;
  kinoveaSegments: string;
  p5Deg: number;
  p50Deg: number;
  p95Deg: number;
  /** Criterio adoptado: Promedio entre Percentil 50 y Percentil 95 -> (P50 + P95) / 2 (~P80 laboral unisex) */
  adoptedMeanP50P95Deg: number;
  /** Equivalencia directa en el motor cinemático 3D del Avatar (0° = postura anatómica neutra) */
  engine3DEquivalentLabel: string;
  standardRef: 'DIN_33402-2' | 'ISO_7250-1';
  realMechanicalStop: string;
  measurementPlane: 'Sagital (Perfil 90°)' | 'Detalle Lateral Mano' | 'Detalle Lateral Pie';
}

/**
 * Tabla maestra de 21 topes goniométricos reales medidos con convención de 3 puntos (Kinovea)
 * bajo normas DIN 33402-2 e ISO 7250-1 para población adulta en edad laboral activa (20–59 / 18–65 años).
 */
export const NORMATIVE_KINOVEA_ROWS: readonly NormativeKinoveaJointRow[] = [
  {
    id: 'CODO_EXT',
    kinoveaSegments: 'Hombro-Codo-Muñeca',
    p5Deg: 162.0,
    p50Deg: 168.0,
    p95Deg: 175.0,
    adoptedMeanP50P95Deg: 171.5,
    engine3DEquivalentLabel: '8.5° flexión mín. (tope olécranon)',
    standardRef: 'DIN_33402-2',
    realMechanicalStop: 'Desviación por ángulo de carga lateral',
    measurementPlane: 'Sagital (Perfil 90°)',
  },
  {
    id: 'CODO_FLE',
    kinoveaSegments: 'Hombro-Codo-Muñeca',
    p5Deg: 40.0,
    p50Deg: 33.0,
    p95Deg: 28.0,
    adoptedMeanP50P95Deg: 30.5,
    engine3DEquivalentLabel: '149.5° flexión máx.',
    standardRef: 'DIN_33402-2',
    realMechanicalStop: 'Choque de masas (Bíceps-Antebrazo)',
    measurementPlane: 'Sagital (Perfil 90°)',
  },
  {
    id: 'RODILLA_EXT',
    kinoveaSegments: 'Cadera-Rodilla-Tobillo',
    p5Deg: 171.0,
    p50Deg: 176.0,
    p95Deg: 183.0,
    adoptedMeanP50P95Deg: 179.5,
    engine3DEquivalentLabel: '0.5° flexión mín. (0% genu recurvatum anterior)',
    standardRef: 'DIN_33402-2',
    realMechanicalStop: 'Tensión ligamentosa posterior',
    measurementPlane: 'Sagital (Perfil 90°)',
  },
  {
    id: 'RODILLA_FLE',
    kinoveaSegments: 'Cadera-Rodilla-Tobillo',
    p5Deg: 46.0,
    p50Deg: 41.0,
    p95Deg: 35.0,
    adoptedMeanP50P95Deg: 38.0,
    engine3DEquivalentLabel: '142.0° flexión máx.',
    standardRef: 'DIN_33402-2',
    realMechanicalStop: 'Choque de masas (Gemelo-Isquiotibial)',
    measurementPlane: 'Sagital (Perfil 90°)',
  },
  {
    id: 'CADERA_FLE',
    kinoveaSegments: 'Hombro-Cadera-Rodilla',
    p5Deg: 75.0,
    p50Deg: 66.0,
    p95Deg: 57.0,
    adoptedMeanP50P95Deg: 61.5,
    engine3DEquivalentLabel: '118.5° cierre suave (tope P95: 57.0° / 123.0°)',
    standardRef: 'DIN_33402-2',
    realMechanicalStop: 'Impacto de muslo contra abdomen',
    measurementPlane: 'Sagital (Perfil 90°)',
  },
  {
    id: 'CADERA_EXT',
    kinoveaSegments: 'Hombro-Cadera-Rodilla',
    p5Deg: 192.0,
    p50Deg: 200.0,
    p95Deg: 206.0,
    adoptedMeanP50P95Deg: 203.0,
    engine3DEquivalentLabel: '-23.0° extensión coxofemoral posterior',
    standardRef: 'DIN_33402-2',
    realMechanicalStop: 'Tensión del ligamento iliofemoral',
    measurementPlane: 'Sagital (Perfil 90°)',
  },
  {
    id: 'TOB_DORSI',
    kinoveaSegments: 'Rodilla-Maléolo-5Metatarso',
    p5Deg: 85.0,
    p50Deg: 78.0,
    p95Deg: 71.0,
    adoptedMeanP50P95Deg: 74.5,
    engine3DEquivalentLabel: '+31.0° dorsiflexión (neutro plantígrado 105.5°)',
    standardRef: 'ISO_7250-1',
    realMechanicalStop: 'Tensión del tendón de Aquiles',
    measurementPlane: 'Sagital (Perfil 90°)',
  },
  {
    id: 'TOB_PLANT',
    kinoveaSegments: 'Rodilla-Maléolo-5Metatarso',
    p5Deg: 136.0,
    p50Deg: 143.0,
    p95Deg: 149.0,
    adoptedMeanP50P95Deg: 146.0,
    engine3DEquivalentLabel: '-40.5° flexión plantar (suela en apoyo ≤ 20°)',
    standardRef: 'ISO_7250-1',
    realMechanicalStop: 'Tensión de la cápsula anterior',
    measurementPlane: 'Sagital (Perfil 90°)',
  },
  {
    id: 'MUN_EXT',
    kinoveaSegments: 'Antebrazo-Carpo-3Metacarpiano',
    p5Deg: 222.0,
    p50Deg: 236.0,
    p95Deg: 245.0,
    adoptedMeanP50P95Deg: 240.5,
    engine3DEquivalentLabel: '-60.5° extensión dorsal (neutro 180°)',
    standardRef: 'ISO_7250-1',
    realMechanicalStop: 'Tensión capsular dorsal de muñeca',
    measurementPlane: 'Detalle Lateral Mano',
  },
  {
    id: 'MUN_FLE',
    kinoveaSegments: 'Antebrazo-Carpo-3Metacarpiano',
    p5Deg: 116.0,
    p50Deg: 108.0,
    p95Deg: 101.0,
    adoptedMeanP50P95Deg: 104.5,
    engine3DEquivalentLabel: '+75.5° flexión palmar (neutro 180°)',
    standardRef: 'ISO_7250-1',
    realMechanicalStop: 'Tensión capsular palmar de muñeca',
    measurementPlane: 'Detalle Lateral Mano',
  },
  {
    id: 'CERVICAL_FLE',
    kinoveaSegments: 'Oreja-CentroCuello-Hombro',
    p5Deg: 128.0,
    p50Deg: 124.0,
    p95Deg: 118.0,
    adoptedMeanP50P95Deg: 121.0,
    engine3DEquivalentLabel: '+59.0° flexión cervical anterior',
    standardRef: 'DIN_33402-2',
    realMechanicalStop: 'De perfil. Mentón contra el esternón',
    measurementPlane: 'Sagital (Perfil 90°)',
  },
  {
    id: 'CERVICAL_EXT',
    kinoveaSegments: 'Oreja-CentroCuello-Hombro',
    p5Deg: 64.0,
    p50Deg: 58.0,
    p95Deg: 50.0,
    adoptedMeanP50P95Deg: 54.0,
    engine3DEquivalentLabel: '-60.0° extensión cervical posterior',
    standardRef: 'DIN_33402-2',
    realMechanicalStop: 'De perfil. Occipital contra trapecio',
    measurementPlane: 'Sagital (Perfil 90°)',
  },
  {
    id: 'LUMBAR_FLE',
    kinoveaSegments: 'Hombro-CrestaIliaca-Fémur',
    p5Deg: 112.0,
    p50Deg: 104.0,
    p95Deg: 94.0,
    adoptedMeanP50P95Deg: 99.0,
    engine3DEquivalentLabel: '+81.0° flexión tronco activa (tope P95: 86.0°)',
    standardRef: 'DIN_33402-2',
    realMechanicalStop: 'Flexión de tronco (Ángulo lumbar real)',
    measurementPlane: 'Sagital (Perfil 90°)',
  },
  {
    id: 'MANO_MCP_FLE',
    kinoveaSegments: 'Metacarpiano-Nudillo-FalangeProx',
    p5Deg: 104.0,
    p50Deg: 94.0,
    p95Deg: 87.0,
    adoptedMeanP50P95Deg: 90.5,
    engine3DEquivalentLabel: '89.5° flexión MCF (ext. dorsal -29.7°)',
    standardRef: 'ISO_7250-1',
    realMechanicalStop: 'Impacto contra la almohadilla palmar',
    measurementPlane: 'Detalle Lateral Mano',
  },
  {
    id: 'MANO_PIP_FLE',
    kinoveaSegments: 'FalangeProx-ArtMedia-FalangeDist',
    p5Deg: 96.0,
    p50Deg: 85.0,
    p95Deg: 78.0,
    adoptedMeanP50P95Deg: 81.5,
    engine3DEquivalentLabel: '98.5° flexión IFP (ext. dorsal -1.0°)',
    standardRef: 'ISO_7250-1',
    realMechanicalStop: 'Tope óseo / articular interfalángico',
    measurementPlane: 'Detalle Lateral Mano',
  },
  {
    id: 'MANO_DIP_FLE',
    kinoveaSegments: 'ArtMedia-ArtDistal-PuntaDedo',
    p5Deg: 115.0,
    p50Deg: 102.0,
    p95Deg: 94.0,
    adoptedMeanP50P95Deg: 98.0,
    engine3DEquivalentLabel: '82.0° flexión IFD (ext. dorsal -3.2°)',
    standardRef: 'ISO_7250-1',
    realMechanicalStop: 'Tensión del tendón extensor profundo',
    measurementPlane: 'Detalle Lateral Mano',
  },
  {
    id: 'PIE_MTP_1_EXT',
    kinoveaSegments: '1erMetatarso-NudilloPie-FalangeGorda',
    p5Deg: 215.0,
    p50Deg: 226.0,
    p95Deg: 238.0,
    adoptedMeanP50P95Deg: 232.0,
    engine3DEquivalentLabel: '+52.0° extensión dorsal MTF hallux (despegue)',
    standardRef: 'ISO_7250-1',
    realMechanicalStop: 'Extensión dedo gordo (Fase de despegue)',
    measurementPlane: 'Detalle Lateral Pie',
  },
  {
    id: 'PIE_MTP_1_FLE',
    kinoveaSegments: '1erMetatarso-NudilloPie-FalangeGorda',
    p5Deg: 148.0,
    p50Deg: 140.0,
    p95Deg: 132.0,
    adoptedMeanP50P95Deg: 136.0,
    engine3DEquivalentLabel: '-44.0° flexión plantar MTF hallux',
    standardRef: 'ISO_7250-1',
    realMechanicalStop: 'Flexión dedo gordo (Hacia el suelo)',
    measurementPlane: 'Detalle Lateral Pie',
  },
  {
    id: 'PIE_MTP_2_5_FLE',
    kinoveaSegments: 'Metatarso-NudilloComún-FalangeProx',
    p5Deg: 150.0,
    p50Deg: 142.0,
    p95Deg: 134.0,
    adoptedMeanP50P95Deg: 138.0,
    engine3DEquivalentLabel: '-42.0° flexión plantar MTF 2°–5°',
    standardRef: 'ISO_7250-1',
    realMechanicalStop: 'Flexión nudillos menores en garra',
    measurementPlane: 'Detalle Lateral Pie',
  },
  {
    id: 'PIE_MTP_2_5_EXT',
    kinoveaSegments: 'Metatarso-NudilloComún-FalangeProx',
    p5Deg: 208.0,
    p50Deg: 218.0,
    p95Deg: 226.0,
    adoptedMeanP50P95Deg: 222.0,
    engine3DEquivalentLabel: '+42.0° extensión dorsal MTF 2°–5°',
    standardRef: 'ISO_7250-1',
    realMechanicalStop: 'Extensión nudillos menores hacia arriba',
    measurementPlane: 'Detalle Lateral Pie',
  },
  {
    id: 'PIE_IP_FLE',
    kinoveaSegments: 'FalangeProx-ArtMediaDistal-PuntaPie',
    p5Deg: 124.0,
    p50Deg: 112.0,
    p95Deg: 102.0,
    adoptedMeanP50P95Deg: 107.0,
    engine3DEquivalentLabel: '73.0° flexión interfalángica podal',
    standardRef: 'ISO_7250-1',
    realMechanicalStop: 'Flexión interfalángica de los dedos del pie',
    measurementPlane: 'Detalle Lateral Pie',
  },
] as const;

/**
 * Matriz maestra unificada de límites articulares biomecánicos reales para edad laboral activa (20–59 / 18–65 años, unisex).
 *
 * Fundamentación científica y criterio estadístico:
 * - Normas antropométricas y goniométricas: DIN 33402-2 (21 segmentos Kinovea de cuerpo y raquis) + ISO 7250-1 (muñeca, mano y pie),
 *   integradas con McKay et al., Neurology 2017;88:36–43 ("1000 Norms Project", N = 400 adultos 20–59 años),
 *   ISSH Normative Hand Study (N = 390 manos sanas) y arcos funcionales de agarre de Sollerman (90% AVD/trabajo).
 * - Criterio adoptado: Promedio entre Percentil 50 y Percentil 95 -> `(P50 + P95) / 2`
 *   (equivalente a `Media + 0.8225 × DE`, ~Percentil 80 de la población laboral sana: cubre la movilidad activa real
 *   de operadores industriales sin deformar el Avatar 3D con el 5% extremo de hiperlaxitud ligamentaria).
 */
export const NORMATIVE_JOINT_LIMITS = {
  cohortAgeRangeYears: [20, 59] as const,
  extendedWorkAgeRangeYears: [18, 65] as const,
  percentileCriterionLabel: 'Promedio (P50 + P95) / 2 (~P80 laboral unisex, DIN 33402-2 · ISO 7250-1 · 20–59 años)',

  /** TRONCO / LUMBAR (DIN 33402-2 LUMBAR_FLE: Hombro–CrestaIliaca–Fémur · P50=104°, P95=94° -> 99.0° Kinovea = 81.0° activa, 86.0° P95) */
  trunk: {
    kinoveaLumbarFlexSoftMinDeg: 99.0,
    kinoveaLumbarFlexHardMinDeg: 94.0,
    extensionMinDeg: -30.0,
    activeFlexionMaxDeg: 81.0,
    hardFlexionMaxDeg: 86.0,
  },

  /** CODO (DIN 33402-2: CODO_EXT = 171.5° Kinovea [8.5° flex], CODO_FLE = 30.5° Kinovea [149.5° flex]) */
  elbow: {
    kinoveaExtMaxDeg: 171.5,
    kinoveaFlexMinDeg: 30.5,
    flexionMinDeg: 8.5,
    flexionMaxDeg: 149.5,
  },

  /** RODILLA (DIN 33402-2: RODILLA_EXT = 179.5° Kinovea [0.5° flex], RODILLA_FLE = 38.0° Kinovea [142.0° flex]) */
  knee: {
    kinoveaExtMaxDeg: 179.5,
    kinoveaFlexMinDeg: 38.0,
    flexionMinDeg: 0.5,
    flexionMaxDeg: 142.0,
  },

  /**
   * CADERA Y CIERRE TRONCO–MUSLO (DIN 33402-2: Hombro–Cadera–Rodilla):
   * - CADERA_FLE: (66.0° + 57.0°)/2 = 61.5° Kinovea (118.5° cierre suave) -> P95 = 57.0° Kinovea (123.0° tope rígido muslo-abdomen).
   * - CADERA_EXT: (200.0° + 206.0°)/2 = 203.0° Kinovea (-23.0° extensión posterior por tensión del ligamento iliofemoral).
   */
  hip: {
    kinoveaTrunkThighSoftMinDeg: 61.5,
    kinoveaTrunkThighHardMinDeg: 57.0,
    kinoveaExtMaxDeg: 203.0,
    maxTrunkPlusHipClosureSoftDeg: 118.5,
    maxTrunkPlusHipClosureHardDeg: 123.0,
    extensionMaxDeg: -23.0,
    flexionMaxDeg: 118.5,
    internalRotationMaxDeg: 45.0,
    externalRotationMaxDeg: 35.4,
  },

  /**
   * TOBILLO Y ANTEPIÉ MTF (ISO 7250-1: Rodilla–Maléolo–5°Metatarso + 1°/2°–5° Metatarso–Falange):
   * - Neutro plantígrado anatómico Rodilla–Maléolo–5°Metatarso ≈ 105.5°.
   * - TOB_DORSI: (78.0° + 71.0°)/2 = 74.5° Kinovea -> +31.0° dorsiflexión funcional.
   * - TOB_PLANT: (143.0° + 149.0°)/2 = 146.0° Kinovea -> -40.5° flexión plantar funcional.
   * - PIE_MTP_1_EXT: (226.0° + 238.0°)/2 = 232.0° Kinovea -> +52.0° extensión dorsal de despegue (hallux).
   * - PIE_MTP_1_FLE: (140.0° + 132.0°)/2 = 136.0° Kinovea -> -44.0° flexión plantar hallux.
   * - PIE_MTP_2_5: extensión +42.0° (222.0° Kinovea) · flexión en garra -42.0° (138.0° Kinovea) · PIE_IP_FLE 73.0° (107.0° Kinovea).
   */
  ankle: {
    kinoveaNeutralStandingDeg: 105.5,
    kinoveaDorsiMinDeg: 74.5,
    kinoveaPlantarMaxDeg: 146.0,
    dorsiflexionMaxDeg: 31.0,
    plantarflexionMinDeg: -40.5,
    maxPlantedSoleAngleToFloorDeg: 20.0,
  },

  footToes: {
    kinoveaMtp1ExtMaxDeg: 232.0,
    kinoveaMtp1FlexMinDeg: 136.0,
    kinoveaMtp25ExtMaxDeg: 222.0,
    kinoveaMtp25FlexMinDeg: 138.0,
    kinoveaIpFlexMinDeg: 107.0,
    mtpHalluxExtensionMaxDeg: 52.0,
    mtpHalluxFlexionMinDeg: -44.0,
    mtpLesserExtensionMaxDeg: 42.0,
    mtpLesserFlexionMinDeg: -42.0,
    mtpCompositeExtensionMaxDeg: 52.0,
    mtpCompositeFlexionMinDeg: -42.0,
    toeIpFlexionMaxDeg: 73.0,
  },

  /**
   * MUÑECA (ISO 7250-1: Antebrazo–Carpo–3°Metacarpiano, 180° = neutra):
   * - MUN_EXT (dorsal): (236.0° + 245.0°)/2 = 240.5° Kinovea -> -60.5° en motor 3D.
   * - MUN_FLE (palmar): (108.0° + 101.0°)/2 = 104.5° Kinovea -> +75.5° en motor 3D.
   */
  wrist: {
    kinoveaDorsalExtMaxDeg: 240.5,
    kinoveaPalmarFlexMinDeg: 104.5,
    dorsalExtensionMinDeg: -60.5,
    palmarFlexionMaxDeg: 75.5,
    radialDeviationMinDeg: -25.0,
    ulnarDeviationMaxDeg: 32.0,
  },

  /**
   * DEDOS TRIFALÁNGICOS — ÍNDICE A MEÑIQUE (ISO 7250-1 + ISSH N=390 manos + Sollerman 90% AVD):
   * - MANO_MCP_FLE: (94.0° + 87.0°)/2 = 90.5° Kinovea -> 89.5° flexión máx. · Extensión dorsal activa -29.7°.
   * - MANO_PIP_FLE: (85.0° + 78.0°)/2 = 81.5° Kinovea -> 98.5° flexión máx. · Extensión dorsal -1.0°.
   * - MANO_DIP_FLE: (102.0° + 94.0°)/2 = 98.0° Kinovea -> 82.0° flexión máx. · Extensión dorsal -3.2°.
   * - Arco funcional de agarre (90% tareas Sollerman): MCF 19°–71°, IFP 23°–87°, IFD 10°–64° con cascada cubital ISSH.
   */
  fingers: {
    kinoveaMcpFlexMinDeg: 90.5,
    kinoveaPipFlexMinDeg: 81.5,
    kinoveaDipFlexMinDeg: 98.0,
    mcpFlexionMaxDeg: 89.5,
    mcpExtensionMinDeg: -29.7,
    pipFlexionMaxDeg: 98.5,
    pipExtensionMinDeg: -1.0,
    dipFlexionMaxDeg: 82.0,
    dipExtensionMinDeg: -3.2,
    mcpFlexionMaxRad: (89.5 * Math.PI) / 180,
    mcpExtensionMinRad: (-29.7 * Math.PI) / 180,
    pipFlexionMaxRad: (98.5 * Math.PI) / 180,
    pipExtensionMinRad: (-1.0 * Math.PI) / 180,
    dipFlexionMaxRad: (82.0 * Math.PI) / 180,
    dipExtensionMinRad: (-3.2 * Math.PI) / 180,
    functionalGraspArcDeg: {
      mcp: [19.0, 71.0] as const,
      pip: [23.0, 87.0] as const,
      dip: [10.0, 64.0] as const,
    },
  },

  /**
   * PULGAR — DÍGITO I (Adultos 18–65 años, Criterio (P50 + P95) / 2):
   * - Carpometacarpiana (CMC) · Abducción palmar: (58.0° + 66.7°)/2 = 62.4°.
   * - Metacarpofalángica (MCF) · Flexión: (51.0° + 58.9°)/2 = 55.0°.
   * - Interfalángica (IF) · Flexión: (82.0° + 90.7°)/2 = 86.4°.
   */
  thumb: {
    cmcPalmarAbductionMaxDeg: 62.4,
    mcpFlexionMaxDeg: 55.0,
    ipFlexionMaxDeg: 86.4,
    cmcPalmarAbductionMaxRad: (62.4 * Math.PI) / 180,
    mcpFlexionMaxRad: (55.0 * Math.PI) / 180,
    ipFlexionMaxRad: (86.4 * Math.PI) / 180,
  },

  /**
   * COLUMNA CERVICAL (DIN 33402-2 Oreja–CentroCuello–Hombro) Y HOMBRO ROTACIONAL (McKay et al., Neurology 2017):
   * - CERVICAL_FLE: (124.0° + 118.0°)/2 = 121.0° Kinovea -> +59.0° flexión cervical (mentón-esternón).
   * - CERVICAL_EXT: (58.0° + 50.0°)/2 = 54.0° Kinovea -> -60.0° extensión cervical (occipital-trapecio).
   * - Rotación hombro (McKay 20–59): interna 71.3°, externa 94.9°.
   */
  cervicalAndShoulder: {
    kinoveaCervicalFlexMinDeg: 121.0,
    kinoveaCervicalExtMinDeg: 54.0,
    neckFlexionMaxDeg: 59.0,
    neckExtensionMinDeg: -60.0,
    shoulderInternalRotMaxDeg: 71.3,
    shoulderExternalRotMaxDeg: 94.9,
  },

  /**
   * FUERZA ISOMÉTRICA DE REFERENCIA EN EDAD LABORAL (20–59 años · McKay et al., Neurology 2017, Tabla 1):
   * Expresada como Media (DE) para Varones y Mujeres adultos sanos.
   */
  isometricForceWorkAge20To59: [
    { group: 'Agarre palmar (Grip)', unit: 'N', maleMean: 305.0, maleSd: 73.0, femaleMean: 190.2, femaleSd: 50.4 },
    { group: 'Flexores de codo', unit: 'N', maleMean: 270.2, maleSd: 59.6, femaleMean: 164.4, femaleSd: 42.3 },
    { group: 'Extensores de codo', unit: 'N', maleMean: 203.2, maleSd: 46.1, femaleMean: 121.2, femaleSd: 30.2 },
    { group: 'Rotadores internos de hombro', unit: 'N', maleMean: 202.4, maleSd: 55.9, femaleMean: 109.7, femaleSd: 33.6 },
    { group: 'Rotadores externos de hombro', unit: 'N', maleMean: 134.7, maleSd: 39.6, femaleMean: 82.2, femaleSd: 20.9 },
    { group: 'Extensores de rodilla', unit: 'Nm', maleMean: 202.1, maleSd: 56.1, femaleMean: 122.6, femaleSd: 33.6 },
    { group: 'Flexores de rodilla', unit: 'Nm', maleMean: 106.3, maleSd: 28.6, femaleMean: 64.4, femaleSd: 18.9 },
    { group: 'Flexores plantares del tobillo', unit: 'N', maleMean: 338.8, maleSd: 66.8, femaleMean: 243.9, femaleSd: 59.2 },
    { group: 'Dorsiflexores del tobillo', unit: 'N', maleMean: 224.6, maleSd: 48.9, femaleMean: 166.5, femaleSd: 41.6 },
    { group: 'Abductores de cadera', unit: 'N', maleMean: 170.7, maleSd: 43.9, femaleMean: 113.1, femaleSd: 32.4 },
  ] as const,
} as const;

function clampNum(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

/**
 * Amortiguador elástico del ángulo interno Hombro–Cadera–Rodilla (`trunkThighDeg` en grados Kinovea, DIN 33402-2):
 * - Si >= 61.5° ((P50+P95)/2): libre sin intervención.
 * - Entre 61.5° y 57.0°: compresión progresiva por contacto blando muslo-abdomen que converge asintóticamente a 57.0° (P95).
 * - Bajo oclusión severa (`occludedWeight >= 0.65`): aplica directamente el freno en 61.5° para impedir que la rodilla suba al pecho.
 */
export function resolveTrunkThighMinAngleDeg(
  rawTrunkThighDeg: number,
  occludedWeight = 0,
): number {
  const softMin = NORMATIVE_JOINT_LIMITS.hip.kinoveaTrunkThighSoftMinDeg; // 61.5°
  const hardMin = NORMATIVE_JOINT_LIMITS.hip.kinoveaTrunkThighHardMinDeg; // 57.0°
  const effectiveFloor =
    hardMin + (softMin - hardMin) * clampNum(occludedWeight, 0, 1);

  if (rawTrunkThighDeg >= softMin) return rawTrunkThighDeg;
  if (occludedWeight >= 0.65) return softMin;

  const deficit = softMin - rawTrunkThighDeg;
  const cushioned = softMin - (softMin - effectiveFloor) * Math.tanh(deficit / 6.0);
  return Math.max(effectiveFloor, cushioned);
}

/**
 * Acota cualquier `PosturePose3D` a los límites anatómicos reales de edad laboral (DIN 33402-2 · ISO 7250-1 · 20–59 años),
 * incluyendo flexión lumbar activa (`LUMBAR_FLE`), cierre muslo-abdomen (`CADERA_FLE`), extensión iliofemoral (`CADERA_EXT`)
 * y articulación metatarsofalángica del antepié (`PIE_MTP`).
 */
export function clampPoseToNormativeWorkAgeLimits(pose: PosturePose3D): PosturePose3D {
  const L = NORMATIVE_JOINT_LIMITS;
  const isStandingOrSquat =
    pose.stanceMode !== 'seated' && pose.stanceMode !== 'kneeling';

  const trunkFlexionDeg = clampNum(
    pose.trunkFlexionDeg,
    L.trunk.extensionMinDeg,
    L.trunk.hardFlexionMaxDeg,
  );
  const neckFlexionDeg = clampNum(
    pose.neckFlexionDeg,
    L.cervicalAndShoulder.neckExtensionMinDeg,
    L.cervicalAndShoulder.neckFlexionMaxDeg,
  );

  const elbowRFlexionDeg = clampNum(
    pose.elbowRFlexionDeg,
    L.elbow.flexionMinDeg,
    L.elbow.flexionMaxDeg,
  );
  const elbowLFlexionDeg = clampNum(
    pose.elbowLFlexionDeg,
    L.elbow.flexionMinDeg,
    L.elbow.flexionMaxDeg,
  );

  const wristRFlexionDeg = clampNum(
    pose.wristRFlexionDeg,
    L.wrist.dorsalExtensionMinDeg,
    L.wrist.palmarFlexionMaxDeg,
  );
  const wristLFlexionDeg =
    pose.wristLFlexionDeg !== undefined
      ? clampNum(
          pose.wristLFlexionDeg,
          L.wrist.dorsalExtensionMinDeg,
          L.wrist.palmarFlexionMaxDeg,
        )
      : undefined;

  const wristRDeviationDeg = clampNum(
    pose.wristRDeviationDeg,
    L.wrist.radialDeviationMinDeg,
    L.wrist.ulnarDeviationMaxDeg,
  );
  const wristLDeviationDeg =
    pose.wristLDeviationDeg !== undefined
      ? clampNum(
          pose.wristLDeviationDeg,
          L.wrist.radialDeviationMinDeg,
          L.wrist.ulnarDeviationMaxDeg,
        )
      : undefined;

  const kneeMin = isStandingOrSquat ? L.knee.flexionMinDeg : 0;
  const kneeRFlexionDeg = clampNum(pose.kneeRFlexionDeg, kneeMin, L.knee.flexionMaxDeg);
  const kneeLFlexionDeg = clampNum(pose.kneeLFlexionDeg, kneeMin, L.knee.flexionMaxDeg);

  let hipRFlexionDeg = clampNum(
    pose.hipRFlexionDeg,
    L.hip.extensionMaxDeg,
    L.hip.flexionMaxDeg,
  );
  let hipLFlexionDeg = clampNum(
    pose.hipLFlexionDeg,
    L.hip.extensionMaxDeg,
    L.hip.flexionMaxDeg,
  );

  // Freno mecánico blando Hombro–Cadera–Rodilla >= 57.0°..61.5° (cierre tronco + cadera <= 118.5°..123.0°)
  const maxHipGivenTrunk =
    L.hip.maxTrunkPlusHipClosureHardDeg - Math.max(0, trunkFlexionDeg);
  if (hipRFlexionDeg > maxHipGivenTrunk) {
    hipRFlexionDeg = clampNum(maxHipGivenTrunk, L.hip.extensionMaxDeg, L.hip.flexionMaxDeg);
  }
  if (hipLFlexionDeg > maxHipGivenTrunk) {
    hipLFlexionDeg = clampNum(maxHipGivenTrunk, L.hip.extensionMaxDeg, L.hip.flexionMaxDeg);
  }

  const ankleRDorsiflexionDeg = clampNum(
    pose.ankleRDorsiflexionDeg,
    L.ankle.plantarflexionMinDeg,
    L.ankle.dorsiflexionMaxDeg,
  );
  const ankleLDorsiflexionDeg = clampNum(
    pose.ankleLDorsiflexionDeg,
    L.ankle.plantarflexionMinDeg,
    L.ankle.dorsiflexionMaxDeg,
  );

  const toeRExtensionDeg =
    pose.toeRExtensionDeg !== undefined
      ? clampNum(
          pose.toeRExtensionDeg,
          L.footToes.mtpCompositeFlexionMinDeg,
          L.footToes.mtpCompositeExtensionMaxDeg,
        )
      : undefined;
  const toeLExtensionDeg =
    pose.toeLExtensionDeg !== undefined
      ? clampNum(
          pose.toeLExtensionDeg,
          L.footToes.mtpCompositeFlexionMinDeg,
          L.footToes.mtpCompositeExtensionMaxDeg,
        )
      : undefined;

  return {
    ...pose,
    trunkFlexionDeg,
    neckFlexionDeg,
    elbowRFlexionDeg,
    elbowLFlexionDeg,
    wristRFlexionDeg,
    ...(wristLFlexionDeg !== undefined ? { wristLFlexionDeg } : {}),
    wristRDeviationDeg,
    ...(wristLDeviationDeg !== undefined ? { wristLDeviationDeg } : {}),
    hipRFlexionDeg,
    hipLFlexionDeg,
    kneeRFlexionDeg,
    kneeLFlexionDeg,
    ankleRDorsiflexionDeg,
    ankleLDorsiflexionDeg,
    ...(toeRExtensionDeg !== undefined ? { toeRExtensionDeg } : {}),
    ...(toeLExtensionDeg !== undefined ? { toeLExtensionDeg } : {}),
  };
}

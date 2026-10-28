import { MethodId } from '../types/ergonomics';
import { CameraPreset, FocusZone, PosturePose3D } from '../types/figurePlan';
import { solveAvatarLiftPoseForTarget } from './avatarPoseInverseKinematics';
import { makeNeutralPose } from './figurePlanCatalog';

export type IdealPostureId =
  | 'ideal_lift_squat'
  | 'ideal_carry_waist'
  | 'ideal_kneeling_bilateral'
  | 'ideal_kneeling_knight'
  | 'ideal_seated_office'
  | 'ideal_driver_comfort'
  | 'ideal_standing_neutral'
  | 'ideal_standing_bench'
  | 'ideal_cart_push'
  | 'ideal_shelf_reach'
  | 'contrast_bad_stoop_lift';

export interface IdealPostureSpec {
  id: IdealPostureId;
  shortName: string;
  category: 'Ideal / Higiénica' | 'Referencia Confort' | 'Contraste Disergonómico';
  normativeRef: string;
  recommendedMethod: MethodId;
  recommendedCamera: CameraPreset;
  focusZone: FocusZone;
  vCm: number;
  hCm: number;
  loadKg: number;
  ergonomicRules: string[];
  description: string;
  buildPose: (workerHeightCm?: number, loadKgOverride?: number) => PosturePose3D;
}

export const IDEAL_POSTURE_CATALOG: IdealPostureSpec[] = [
  {
    id: 'ideal_lift_squat',
    shortName: '1. Levantamiento Ideal de Cargas (Rodillas Flexionadas + Espalda Recta)',
    category: 'Ideal / Higiénica',
    normativeRef: 'ISO 11228-1 · NIOSH (1993) · Res. 295/03',
    recommendedMethod: MethodId.NIOSH,
    recommendedCamera: 'sagittal_right',
    focusZone: 'full_body',
    vCm: 28,
    hCm: 28,
    loadKg: 12,
    ergonomicRules: [
      'Espalda recta y alineada (inclinación sagital ≤ 20°, sin cifosis lumbar)',
      'Rodillas ampliamente flexionadas (95°–120°) absorbiendo el descenso vertical con los cuádriceps',
      'Carga pegada al eje corporal entre las rodillas (H ≤ 28–30 cm) y agarre palmar simétrico',
      'Pies apoyados firmemente separados al ancho de hombros, sin torsión axial de tronco (A = 0°)',
    ],
    description:
      'Técnica higiénica fundamental para levantamiento manual desde nivel bajo: descenso mediante flexión profunda de rodillas y bisagra coxofemoral conservando la columna lumbar neutra y recta.',
    buildPose: (workerHeightCm = 172, loadKgOverride = 12) =>
      solveAvatarLiftPoseForTarget({
        vCm: 28,
        hCm: 28,
        workerHeightCm,
        trunkFlexHintDeg: 16,
        kneeFlexHintDeg: 112,
        asymmetryDeg: 0,
        loadKg: loadKgOverride,
        liftStyle: 'hygienic_squat',
      }).pose,
  },
  {
    id: 'ideal_carry_waist',
    shortName: '2. Sostenimiento / Transporte Ideal en Zona de Nudillos-Cintura (V = 78 cm)',
    category: 'Ideal / Higiénica',
    normativeRef: 'NIOSH Óptimo (HM = 1,00 · VM ≈ 0,99) · ISO 11228-1',
    recommendedMethod: MethodId.NIOSH,
    recommendedCamera: 'sagittal_right',
    focusZone: 'full_body',
    vCm: 78,
    hCm: 26,
    loadKg: 12,
    ergonomicRules: [
      'Altura vertical óptima de manipulación próxima a nudillos-cintura (V = 75–80 cm)',
      'Centro de gravedad de la caja próximo a L5/S1 (H = 25–26 cm)',
      'Tronco erguido neutro (4°), hombros bajos y codos flexionados ~75°–85° junto al torso',
    ],
    description:
      'Postura de referencia de mínima compresión intradiscal L5/S1 para recepción, pesaje o transporte corto bimanual.',
    buildPose: (workerHeightCm = 172, loadKgOverride = 12) =>
      solveAvatarLiftPoseForTarget({
        vCm: 78,
        hCm: 26,
        workerHeightCm,
        trunkFlexHintDeg: 4,
        kneeFlexHintDeg: 6,
        asymmetryDeg: 0,
        loadKg: loadKgOverride,
        liftStyle: 'hygienic_squat',
      }).pose,
  },
  {
    id: 'ideal_kneeling_bilateral',
    shortName: '3. Arrodillado Bilateral Ergonómico (Espalda Recta sobre Rodillas)',
    category: 'Ideal / Higiénica',
    normativeRef: 'OWAS Cód. 1161 · EN 1005-4 · Uso obligatorio de rodilleras',
    recommendedMethod: MethodId.OWAS,
    recommendedCamera: 'sagittal_right',
    focusZone: 'full_body',
    vCm: 55,
    hCm: 34,
    loadKg: 0,
    ergonomicRules: [
      'Ambas rodillas y tibias apoyadas horizontalmente sobre superficie acolchada (suelo y = 0)',
      'Columna vertebral erguida y recta (tronco 6° < 20°, OWAS Espalda Código 1)',
      'Brazos por debajo del nivel acromial (hombros 32°, codos 74°) evitando alcance lejano',
    ],
    description:
      'Postura arrodillada simétrica para tareas breves a ras de suelo o zócalos bajos manteniendo el eje raquídeo alineado.',
    buildPose: () =>
      makeNeutralPose({
        stanceMode: 'kneeling',
        prop: 'none',
        trunkFlexionDeg: 6,
        neckFlexionDeg: 10,
        shoulderRFlexionDeg: 32,
        shoulderLFlexionDeg: 32,
        shoulderRAbductionDeg: 6,
        shoulderLAbductionDeg: 6,
        elbowRFlexionDeg: 74,
        elbowLFlexionDeg: 74,
        hipRFlexionDeg: 2,
        kneeRFlexionDeg: 92,
        ankleRDorsiflexionDeg: -38,
        hipLFlexionDeg: 2,
        kneeLFlexionDeg: 92,
        ankleLDorsiflexionDeg: -38,
        loadKg: 0,
      }),
  },
  {
    id: 'ideal_kneeling_knight',
    shortName: '4. Arrodillado Unilateral «Posición de Caballero» (Semi-arrodillado Estable)',
    category: 'Ideal / Higiénica',
    normativeRef: 'RULA / REBA · Cap. 11 Fig. 11.1 · Higiene Postural Industrial',
    recommendedMethod: MethodId.RULA,
    recommendedCamera: 'sagittal_right',
    focusZone: 'full_body',
    vCm: 68,
    hCm: 36,
    loadKg: 2,
    ergonomicRules: [
      'Rodilla posterior apoyada en tierra (92°) y pie anterior apoyado plano con tibia vertical (~96°)',
      'Triángulo de sustentación amplio que estabiliza la pelvis sin curvar la zona lumbar (tronco 6°)',
      'Transición segura hacia bipedestación impulsando con el miembro inferior adelantado',
    ],
    description:
      'Postura de caballero recomendada para mantenimiento de tableros bajos, instalaciones eléctricas e inspección a media-baja altura.',
    buildPose: () =>
      makeNeutralPose({
        stanceMode: 'kneeling',
        prop: 'electrical_panel',
        trunkFlexionDeg: 6,
        neckFlexionDeg: 10,
        shoulderRFlexionDeg: 44,
        shoulderLFlexionDeg: 38,
        shoulderRAbductionDeg: 6,
        shoulderLAbductionDeg: 6,
        elbowRFlexionDeg: 58,
        elbowLFlexionDeg: 64,
        hipRFlexionDeg: 2,
        kneeRFlexionDeg: 92,
        ankleRDorsiflexionDeg: -38,
        hipLFlexionDeg: 96,
        kneeLFlexionDeg: 96,
        ankleLDorsiflexionDeg: 0,
        loadKg: 2,
      }),
  },
  {
    id: 'ideal_seated_office',
    shortName: '5. Sedestación Ergonómica en Escritorio / PVD (Regla 90°–90°–90°)',
    category: 'Ideal / Higiénica',
    normativeRef: 'ISO 9241-5 · IRAM 3753 · RULA Nivel 1 (1–2 ptos)',
    recommendedMethod: MethodId.RULA,
    recommendedCamera: 'sagittal_right',
    focusZone: 'full_body',
    vCm: 74,
    hCm: 34,
    loadKg: 0,
    ergonomicRules: [
      'Espalda recta con soporte lumbar completo (tronco 0°–2°) y cabeza alineada (cuello 6° ≤ 10°)',
      'Hombros relajados (flexión 14°), codos a 90° apoyados a nivel del plano y muñecas neutras (0°)',
      'Caderas a 90°, rodillas a 90° con hueco poplíteo libre y plantas de los pies apoyadas',
    ],
    description:
      'Postura sedente neutra de referencia para puestos administrativos e informáticos con monitor frente al eje sagital.',
    buildPose: () =>
      makeNeutralPose({
        stanceMode: 'seated',
        prop: 'office_desk_lateral',
        trunkFlexionDeg: 2,
        neckFlexionDeg: 6,
        shoulderRFlexionDeg: 14,
        shoulderLFlexionDeg: 14,
        shoulderRAbductionDeg: 5,
        shoulderLAbductionDeg: 5,
        elbowRFlexionDeg: 88,
        elbowLFlexionDeg: 88,
        forearmRPronationDeg: 65,
        wristRFlexionDeg: 0,
        wristLFlexionDeg: 0,
        hipRFlexionDeg: 90,
        hipLFlexionDeg: 90,
        kneeRFlexionDeg: 90,
        kneeLFlexionDeg: 90,
        ankleRDorsiflexionDeg: 0,
        ankleLDorsiflexionDeg: 0,
        loadKg: 0,
      }),
  },
  {
    id: 'ideal_driver_comfort',
    shortName: '6. Postura de Confort de Chofer de Ómnibus / Colectivo (Ángulos A–F, Fig. 13.2)',
    category: 'Referencia Confort',
    normativeRef: 'VDV 234 · ISO 16121 · Cap. 13 Tabla 13.4 (REBA = 2)',
    recommendedMethod: MethodId.REBA,
    recommendedCamera: 'sagittal_right',
    focusZone: 'full_body',
    vCm: 76,
    hCm: 36,
    loadKg: 1,
    ergonomicRules: [
      'Volante de ómnibus / colectivo Ø 430 mm inclinado 35° respecto de la horizontal con columna al piso de cabina (VDV 234 / ISO 16121)',
      'Respaldo reclinado 8° (Ángulo A tronco-muslo ≈ 102°, dentro de 90°–110°) y apertura de rodillas B ≈ 116°',
      'Hombros bajos relajados E = 22° (10°–40°), codos F = 122° y ambas manos acopladas en 9 y 3 sin elevar los brazos',
    ],
    description:
      'Geometría ergonómica de puesto de conducción de transporte colectivo de pasajeros (VDV 234 / ISO 16121) con volante bajo Ø 430 mm a 35°, columna de dirección al piso y manos acopladas en 9 y 3.',
    buildPose: () =>
      makeNeutralPose({
        stanceMode: 'seated',
        prop: 'bus_driver_seat',
        trunkFlexionDeg: -8,
        neckFlexionDeg: 6,
        shoulderRFlexionDeg: 22,
        shoulderLFlexionDeg: 22,
        shoulderRAbductionDeg: 6,
        shoulderLAbductionDeg: 6,
        elbowRFlexionDeg: 58,
        elbowLFlexionDeg: 58,
        forearmRPronationDeg: 34,
        forearmLPronationDeg: -34,
        wristRFlexionDeg: -4,
        wristRDeviationDeg: -6,
        wristLFlexionDeg: -4,
        wristLDeviationDeg: -6,
        handGripMode: 'power_grip',
        hipRFlexionDeg: 86,
        hipLFlexionDeg: 86,
        kneeRFlexionDeg: 64,
        kneeLFlexionDeg: 64,
        ankleRDorsiflexionDeg: -12,
        ankleLDorsiflexionDeg: -8,
        loadKg: 1,
      }),
  },
  {
    id: 'ideal_standing_neutral',
    shortName: '6b. Bipedestación Neutra de Referencia Anatómica (De Pie Libre Simétrico)',
    category: 'Ideal / Higiénica',
    normativeRef: 'OWAS Cód. 1121 · ISO 11226 · REBA = 1',
    recommendedMethod: MethodId.OWAS,
    recommendedCamera: 'frontal',
    focusZone: 'full_body',
    vCm: 78,
    hCm: 25,
    loadKg: 0,
    ergonomicRules: [
      'Eje raquídeo vertical alineado (tronco 1°, cuello 2°) con mirada horizontal libre de tensión',
      'Brazos relajados cayendo naturalmente junto a los muslos (abducción 4°, codo 9°) con palmas mediales',
      'Reparto simétrico 50% / 50% sobre ambos pies con desbloqueo fisiológico de rodillas (2°)',
    ],
    description:
      'Postura humana de pie en reposo equilibrado (bipedestación neutra) para referencia basal en métodos OWAS, RULA y REBA.',
    buildPose: () =>
      makeNeutralPose({
        stanceMode: 'standing',
        prop: 'none',
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
        loadKg: 0,
      }),
  },
  {
    id: 'ideal_standing_bench',
    shortName: '7. Bipedestación Ergonómica en Banco de Trabajo (Plano a Altura de Codo)',
    category: 'Ideal / Higiénica',
    normativeRef: 'ISO 14738 · EN 1005-4 · RULA Nivel 1',
    recommendedMethod: MethodId.RULA,
    recommendedCamera: 'sagittal_right',
    focusZone: 'full_body',
    vCm: 98,
    hCm: 30,
    loadKg: 2,
    ergonomicRules: [
      'Superficie de trabajo situada 5–10 cm por debajo de la altura del codo en bipedestación',
      'Tronco vertical alineado (4°), cuello con inclinación visual mínima (8° ≤ 10°)',
      'Hombros descendidos (16°) y antebrazos a ~85° próximos al cuerpo con apoyo simétrico podal',
    ],
    description:
      'Trabajo ligero o de precisión de pie frente a banco regulado a la antropometría del operador.',
    buildPose: () =>
      makeNeutralPose({
        stanceMode: 'standing',
        prop: 'work_desk_support',
        trunkFlexionDeg: 4,
        neckFlexionDeg: 8,
        shoulderRFlexionDeg: 18,
        shoulderLFlexionDeg: 18,
        shoulderRAbductionDeg: 6,
        shoulderLAbductionDeg: 6,
        elbowRFlexionDeg: 84,
        elbowLFlexionDeg: 84,
        wristRFlexionDeg: 0,
        wristLFlexionDeg: 0,
        hipRFlexionDeg: 2,
        hipLFlexionDeg: 2,
        kneeRFlexionDeg: 4,
        kneeLFlexionDeg: 4,
        loadKg: 2,
      }),
  },
  {
    id: 'ideal_cart_push',
    shortName: '8. Empuje Bimanual Ideal de Carro (Agarre entre Cintura y Pecho)',
    category: 'Ideal / Higiénica',
    normativeRef: 'ISO 11228-2 · Tablas Snook y Ciriello · Res. 3345/15',
    recommendedMethod: MethodId.SNOOK,
    recommendedCamera: 'sagittal_right',
    focusZone: 'full_body',
    vCm: 95,
    hCm: 38,
    loadKg: 10,
    ergonomicRules: [
      'Preferir siempre el empuje frontal bimanual frente al arrastre en retroceso',
      'Barra de empuje a altura entre cintura y esternón (90–105 cm) con muñecas neutras',
      'Espalda recta con leve traslación corporal (12°), codos flexionados ~65° y paso equilibrado sin giro',
    ],
    description:
      'Técnica higiénica para empuje inicial y sostenido de carros logísticos aprovechando el peso corporal con columna alineada.',
    buildPose: () =>
      makeNeutralPose({
        stanceMode: 'walking',
        prop: 'cart_push_dynamo',
        trunkFlexionDeg: 12,
        neckFlexionDeg: 4,
        shoulderRFlexionDeg: 44,
        shoulderLFlexionDeg: 44,
        shoulderRAbductionDeg: -6,
        shoulderLAbductionDeg: -6,
        elbowRFlexionDeg: 62,
        elbowLFlexionDeg: 62,
        handGripMode: 'power_grip',
        hipRFlexionDeg: 20,
        kneeRFlexionDeg: 22,
        ankleRDorsiflexionDeg: 10,
        hipLFlexionDeg: -14,
        kneeLFlexionDeg: 12,
        ankleLDorsiflexionDeg: -8,
        loadKg: 10,
      }),
  },
  {
    id: 'ideal_shelf_reach',
    shortName: '9. Depósito Seguro en Estantería Media (Bajo Nivel de Hombros, V = 122 cm)',
    category: 'Ideal / Higiénica',
    normativeRef: 'ISO 11228-1 · Res. 295/03 · Prevención Síndrome Subacromial',
    recommendedMethod: MethodId.NIOSH,
    recommendedCamera: 'sagittal_right',
    focusZone: 'full_body',
    vCm: 122,
    hCm: 32,
    loadKg: 10,
    ergonomicRules: [
      'Depositar cargas pesadas siempre por debajo del nivel acromial (< 135 cm; hombros < 90°)',
      'Tronco erguido neutro (4°) evitando hiperextensión lumbar compensatoria',
      'Aproximarse al estante (H ≤ 32 cm) antes de liberar el peso',
    ],
    description:
      'Colocación bimanual segura en estante a altura torácica sin superar la horizontal de los hombros.',
    buildPose: (workerHeightCm = 172, loadKgOverride = 10) =>
      solveAvatarLiftPoseForTarget({
        vCm: 122,
        hCm: 32,
        workerHeightCm,
        trunkFlexHintDeg: 4,
        kneeFlexHintDeg: 6,
        asymmetryDeg: 0,
        loadKg: loadKgOverride,
        liftStyle: 'hygienic_squat',
      }).pose,
  },
  {
    id: 'contrast_bad_stoop_lift',
    shortName: '10. Contraste Incorrecto: Piernas Rectas + Espalda Doblada (Stoop Riesgo L5/S1)',
    category: 'Contraste Disergonómico',
    normativeRef: 'Incumplimiento Regla Básica MMC · Compresión L5/S1 > 3,4 kN',
    recommendedMethod: MethodId.REBA,
    recommendedCamera: 'sagittal_right',
    focusZone: 'full_body',
    vCm: 24,
    hCm: 44,
    loadKg: 16,
    ergonomicRules: [
      'INCORRECTO: Rodillas bloqueadas en extensión (~8°) anulando la musculatura crural',
      'INCORRECTO: Flexión severa del tronco (> 65°) con inversión de la lordosis lumbar',
      'INCORRECTO: Aumento del brazo de palanca horizontal (H = 44 cm) multiplicando el momento en L5/S1',
    ],
    description:
      'Postura disergonómica de comparación didáctica para contrastar directamente frente al Levantamiento Ideal con rodillas flexionadas y espalda recta.',
    buildPose: (workerHeightCm = 172, loadKgOverride = 16) =>
      solveAvatarLiftPoseForTarget({
        vCm: 24,
        hCm: 44,
        workerHeightCm,
        trunkFlexHintDeg: 68,
        kneeFlexHintDeg: 8,
        asymmetryDeg: 0,
        loadKg: loadKgOverride,
        liftStyle: 'stoop',
      }).pose,
  },
];

export function getIdealPostureById(id: IdealPostureId): IdealPostureSpec {
  return IDEAL_POSTURE_CATALOG.find((item) => item.id === id) || IDEAL_POSTURE_CATALOG[0];
}

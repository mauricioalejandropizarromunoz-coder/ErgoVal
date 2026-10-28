import { CameraPreset, PosturePose3D, ScenePropType } from '../types/figurePlan';
import { makeNeutralPose } from './figurePlanCatalog';

/**
 * FORMATO DE SALIDA OBLIGATORIO (JSON ESTRICTO)
 * Motor Experto en Análisis Ergonómico Computacional y Gemelo Digital Biomecánico
 * Basado en principios de RULA, REBA, NIOSH y modelización anatómica de 16 segmentos y 14 articulaciones
 * alineado con Ergoniza Intelligent (Diego-Más, UPV V.2026).
 */
export interface ErgonizaDigitalTwinJson {
  analisis_exitoso: boolean;
  fotograma_critico_segundo: number;
  condiciones_apoyo_detectadas: string;
  sincronizacion_avatar_3d: {
    plano_referencia: string;
    articulaciones_principales: {
      tronco: {
        flexion_extension_grados: number;
        lateralizacion_grados: number;
        rotacion_axial_grados: number;
      };
      hombro_derecho: {
        flexion_anteroposterior_grados: number;
        abduccion_aduccion_grados: number;
        rotacion_humeral_grados: number;
      };
      codo_derecho: {
        flexion_extension_grados: number;
      };
      cadera_derecha: {
        flexion_extension_grados: number;
      };
      rodilla_derecha: {
        flexion_extension_grados: number;
      };
    };
  };
  datos_faltantes_requeridos: string[];
}

export type BiologicalSex = 'masculino' | 'femenino';
export type OperatorComplexion = 'delgada_p5' | 'media_p50' | 'robusta_p95';

export interface InvisibleErgonizaParameters {
  /** Peso exacto de la carga externa manipulada en kg (variable invisible a visión) */
  loadMassKg: number | null;
  /** Sexo biológico del operario para antropometría de masas segmentarias y umbrales L4/L5 */
  sex: BiologicalSex;
  /** Edad del operario en años para umbral compresivo discal Tabla 6 (20-40, 40-50, >50) */
  ageYears: number;
  /** Estatura del operario en cm */
  statureCm: number;
  /** Masa corporal total del operario en kg */
  bodyMassKg: number;
  /** Complexión / percentil de fuerza muscular isométrica */
  complexion: OperatorComplexion;
  /** Frecuencia de la tarea (acciones o levantamientos por minuto) */
  frequencyPerMin: number;
  /** Porcentaje de ciclo activo (Duty Cycle %) para límite ACGIH %MVC_TLV */
  dutyCyclePercent: number;
  /** Distancia horizontal real desde L5/S1 / tobillos al centro de masa de la carga (cm) */
  horizontalReachCm: number;
  /** Calidad del acoplamiento mano-carga */
  gripCoupling: 'bueno' | 'regular' | 'malo';
  /** Coeficiente de fricción estático suelo-calzado (μ) */
  floorFrictionMu: number;
  /** Reparto bimanual (true = carga repartida entre ambas manos; false = unilateral derecha) */
  isBimanualLoad: boolean;
  /** Confirmación explícita del evaluador de haber verificado parámetros invisibles */
  userConfirmedInvisibleParams: boolean;
}

export interface JointMomentEvaluation {
  jointId: 'l5s1' | 'shoulder_r' | 'elbow_r' | 'hip_r' | 'knee_r';
  jointLabel: string;
  angleSummary: string;
  momentNm: number;
  mvcCapacityNm: number;
  percentMvc: number;
  acgihTlvPercentMvc: number;
  protectedPopulationPct: number;
  status: 'aceptable' | 'condicional' | 'critico';
}

export interface ErgonizaBiomechanicalReport {
  /** Compresión intervertebral estimada en disco L4/L5 (Newton) */
  l4l5CompressionN: number;
  /** Límite compresivo recomendado según sexo y edad (Tabla 6 Ergoniza / Jäger & Luttmann / NIOSH) */
  l4l5CompressionLimitN: number;
  /** Fuerza de cizalladura anteroposterior en L4/L5 (Newton) */
  l4l5ShearN: number;
  /** Límite de cribado de cizalladura lumbar (500 N McGill / Gallagher) */
  l4l5ShearLimitN: number;
  /** Fuerza de alivio por presión intraabdominal F_A (Ec. 53 Ergoniza) en Newton */
  intraAbdominalReliefN: number;
  /** Tensión estimada de musculatura erectora espinal en Newton */
  erectorSpinaeForceN: number;
  /** Evaluación articular de momentos estáticos y %MVC */
  joints: JointMomentEvaluation[];
  /** Coeficiente de rozamiento requerido en pies vs disponible */
  requiredFrictionMu: number;
  /** Estado global biomecánico */
  overallRisk: 'bajo' | 'medio' | 'alto';
  /** Diagnóstico técnico resumido para informe */
  technicalSummary: string;
}

const DEG2RAD = Math.PI / 180;

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(min, Math.min(max, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * Rangos fisiológicos ROM basados en Tabla 1 de Ergoniza Intelligent (UPV V.2026)
 * para garantizar que el JSON nunca colapse la cinemática del avatar 3D.
 */
export function sanitizeErgonizaAngles(
  raw: ErgonizaDigitalTwinJson['sincronizacion_avatar_3d']['articulaciones_principales'],
): ErgonizaDigitalTwinJson['sincronizacion_avatar_3d']['articulaciones_principales'] {
  return {
    tronco: {
      flexion_extension_grados: round1(clamp(raw.tronco?.flexion_extension_grados ?? 0, -30, 140)),
      lateralizacion_grados: round1(clamp(raw.tronco?.lateralizacion_grados ?? 0, -35, 35)),
      rotacion_axial_grados: round1(clamp(raw.tronco?.rotacion_axial_grados ?? 0, -60, 60)),
    },
    hombro_derecho: {
      flexion_anteroposterior_grados: round1(
        clamp(raw.hombro_derecho?.flexion_anteroposterior_grados ?? 0, -49, 198),
      ),
      abduccion_aduccion_grados: round1(
        clamp(raw.hombro_derecho?.abduccion_aduccion_grados ?? 0, -26, 135),
      ),
      rotacion_humeral_grados: round1(
        clamp(raw.hombro_derecho?.rotacion_humeral_grados ?? 0, -90, 90),
      ),
    },
    codo_derecho: {
      flexion_extension_grados: round1(
        clamp(raw.codo_derecho?.flexion_extension_grados ?? 0, 0, 165),
      ),
    },
    cadera_derecha: {
      flexion_extension_grados: round1(
        clamp(raw.cadera_derecha?.flexion_extension_grados ?? 0, -40, 130),
      ),
    },
    rodilla_derecha: {
      flexion_extension_grados: round1(
        clamp(raw.rodilla_derecha?.flexion_extension_grados ?? 0, 0, 160),
      ),
    },
  };
}

/**
 * Detecta explícitamente las variables ocultas que la visión por computadora no puede deducir
 * y que el sistema exige confirmar antes del cálculo final de momentos y compresión L4/L5.
 */
export function detectMissingInvisibleParameters(
  params?: Partial<InvisibleErgonizaParameters>,
): string[] {
  const missing: string[] = [];
  if (!params || params.loadMassKg === null || params.loadMassKg === undefined || params.loadMassKg < 0) {
    missing.push('Peso exacto de la carga manipulada en kg (fuerza externa en manos)');
  }
  if (!params?.userConfirmedInvisibleParams) {
    missing.push(
      'Datos antropométricos reales del operario (sexo biológico, edad, estatura en cm, peso corporal en kg y complexión)',
    );
    missing.push(
      'Frecuencia de la tarea (levantamientos/min) y duración efectiva del ciclo (% ciclo activo)',
    );
    missing.push(
      'Calidad real del acoplamiento mano-carga y coeficiente de fricción estático suelo-calzado (μ)',
    );
  }
  return missing;
}

/**
 * Construye el objeto JSON estricto obligatorio garantizando validez estructural y numérica.
 */
export function buildErgonizaDigitalTwinJson(input: {
  analisisExitoso?: boolean;
  fotogramaCriticoSegundo: number;
  condicionesApoyo: string;
  planoReferencia: string;
  articulaciones: ErgonizaDigitalTwinJson['sincronizacion_avatar_3d']['articulaciones_principales'];
  invisibleParams?: Partial<InvisibleErgonizaParameters>;
  verticalCalibrationOffsetDeg?: number;
}): ErgonizaDigitalTwinJson {
  const calOffset = input.verticalCalibrationOffsetDeg ?? 0;
  const adjustedRaw: ErgonizaDigitalTwinJson['sincronizacion_avatar_3d']['articulaciones_principales'] = {
    ...input.articulaciones,
    tronco: {
      ...input.articulaciones.tronco,
      flexion_extension_grados:
        (input.articulaciones.tronco?.flexion_extension_grados ?? 0) + calOffset,
    },
  };

  const sanitized = sanitizeErgonizaAngles(adjustedRaw);
  const missing = detectMissingInvisibleParameters(input.invisibleParams);

  // Siempre conservar en el JSON exportado de visión la trazabilidad explícita de parámetros invisibles al vídeo
  const mandatoryVisionMissing =
    missing.length > 0
      ? missing
      : [
          'Peso exacto de la carga manipulada en kg (confirmado manualmente por el evaluador)',
          'Datos antropométricos del operario: sexo, edad, estatura y peso corporal (confirmados manualmente)',
        ];

  return {
    analisis_exitoso: input.analisisExitoso !== false,
    fotograma_critico_segundo: Math.max(0, Math.round(input.fotogramaCriticoSegundo * 100) / 100),
    condiciones_apoyo_detectadas:
      input.condicionesApoyo?.trim() || 'Bipedestación bilateral',
    sincronizacion_avatar_3d: {
      plano_referencia: input.planoReferencia?.trim() || 'Sagital',
      articulaciones_principales: sanitized,
    },
    datos_faltantes_requeridos: mandatoryVisionMissing,
  };
}

/**
 * Sincroniza el JSON estricto del Gemelo Digital directamente con `PosturePose3D` del motor 3D `.glb`
 * (16 segmentos / 14 articulaciones) evitando posturas imposibles, talones flotantes o colapso de malla.
 */
export function syncAvatarPoseFromErgonizaJson(
  json: ErgonizaDigitalTwinJson,
  options?: {
    isBimanual?: boolean;
    loadKg?: number;
    prop?: ScenePropType;
    leftElbowDeg?: number;
    neckFlexionDeg?: number;
  },
): {
  pose: PosturePose3D;
  recommendedCamera: CameraPreset;
} {
  const art = sanitizeErgonizaAngles(json.sincronizacion_avatar_3d.articulaciones_principales);
  const apoyoLower = (json.condiciones_apoyo_detectadas || '').toLowerCase();

  let stanceMode: NonNullable<PosturePose3D['stanceMode']> = 'standing';
  if (apoyoLower.includes('sedest') || apoyoLower.includes('sentad')) {
    stanceMode = 'seated';
  } else if (apoyoLower.includes('arrodill') || apoyoLower.includes('rodillas en suelo')) {
    stanceMode = 'kneeling';
  } else if (apoyoLower.includes('monoped') || apoyoLower.includes('unipodal') || apoyoLower.includes('una pierna')) {
    stanceMode = 'one_leg';
  } else if (art.rodilla_derecha.flexion_extension_grados >= 65) {
    stanceMode = 'squatting';
  }

  const isBimanual = options?.isBimanual !== false;
  const trunkFlex = art.tronco.flexion_extension_grados;
  const kneeR = art.rodilla_derecha.flexion_extension_grados;
  const hipR =
    Math.abs(art.cadera_derecha.flexion_extension_grados) > 0.5
      ? art.cadera_derecha.flexion_extension_grados
      : clamp(kneeR * 0.72 + Math.max(0, trunkFlex) * 0.3, -20, 118);

  // Equilibrio plantígrado (planta apoyada horizontal en suelo y=0)
  const ankleR =
    stanceMode === 'seated'
      ? 0
      : clamp(kneeR - hipR, -24, 34);

  // Alineación cervical fisiológica compensada (mirada hacia la tarea sin hiperflexión irreal)
  const autoNeck =
    options?.neckFlexionDeg !== undefined
      ? clamp(options.neckFlexionDeg, -35, 45)
      : trunkFlex > 35
        ? clamp(-Math.round(trunkFlex * 0.24), -22, 18)
        : clamp(Math.round(trunkFlex * 0.18 + 6), -15, 25);

  const shRFlex = art.hombro_derecho.flexion_anteroposterior_grados;
  const shRAbd = Math.max(0, art.hombro_derecho.abduccion_aduccion_grados);
  const shRRot = art.hombro_derecho.rotacion_humeral_grados;
  const elbR = art.codo_derecho.flexion_extension_grados;

  const propToUse: ScenePropType =
    options?.prop ??
    (stanceMode === 'seated'
      ? 'chair'
      : (options?.loadKg ?? 0) > 0.5
        ? 'box_load'
        : 'none');

  const pose = makeNeutralPose({
    trunkFlexionDeg: trunkFlex,
    trunkLateralDeg: art.tronco.lateralizacion_grados,
    trunkTwistDeg: art.tronco.rotacion_axial_grados,
    neckFlexionDeg: autoNeck,
    neckLateralDeg: round1(art.tronco.lateralizacion_grados * 0.25),
    neckTwistDeg: round1(art.tronco.rotacion_axial_grados * 0.3),
    shoulderRFlexionDeg: shRFlex,
    shoulderRAbductionDeg: shRAbd,
    shoulderRRotationDeg: shRRot,
    shoulderLFlexionDeg: isBimanual ? shRFlex : 10,
    shoulderLAbductionDeg: isBimanual ? shRAbd : 6,
    shoulderLRotationDeg: isBimanual ? shRRot : 0,
    elbowRFlexionDeg: elbR,
    elbowLFlexionDeg:
      options?.leftElbowDeg !== undefined
        ? clamp(options.leftElbowDeg, 0, 160)
        : isBimanual
          ? elbR
          : 16,
    hipRFlexionDeg: hipR,
    kneeRFlexionDeg: kneeR,
    ankleRDorsiflexionDeg: ankleR,
    hipLFlexionDeg: stanceMode === 'one_leg' ? Math.max(20, hipR * 0.45) : hipR,
    kneeLFlexionDeg: stanceMode === 'one_leg' ? Math.max(42, kneeR + 28) : kneeR,
    ankleLDorsiflexionDeg: ankleR,
    stanceMode,
    prop: propToUse,
    loadKg: options?.loadKg ?? 0,
    handGripMode: (options?.loadKg ?? 0) > 0.5 ? 'box_cradle' : 'relaxed',
  });

  const planeLower = (json.sincronizacion_avatar_3d.plano_referencia || '').toLowerCase();
  const recommendedCamera: CameraPreset =
    planeLower === 'frontal'
      ? 'frontal'
      : planeLower.includes('frontal') && planeLower.includes('sagital')
        ? 'isometric'
        : 'sagittal_right';

  return { pose, recommendedCamera };
}

/**
 * Calcula una función de distribución normal estándar acumulada Φ(z) (aproximación Abramowitz & Stegun)
 * para estimar el % de Población Protegida frente al momento articular requerido (Sección 10 Ergoniza).
 */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const prob =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - prob : prob;
}

/**
 * Motor Biomecánico Estático 3D de 16 Segmentos / 14 Articulaciones (basado en Ergoniza Intelligent UPV V.2026):
 * Calcula momentos articulares estáticos (N·m), %MVC frente a ACGIH TLV, % Población Protegida,
 * compresión intervertebral L4/L5 (N) con presión intraabdominal F_A (Ec. 53-54) y cizalladura lumbar (N).
 */
export function computeErgonizaStaticBiomechanics(
  json: ErgonizaDigitalTwinJson,
  params: InvisibleErgonizaParameters,
): ErgonizaBiomechanicalReport {
  const g = 9.81;
  const art = sanitizeErgonizaAngles(json.sincronizacion_avatar_3d.articulaciones_principales);

  const statureM = clamp(params.statureCm / 100, 1.42, 2.08);
  const bodyMassKg = clamp(params.bodyMassKg, 42, 145);
  const loadKg = Math.max(0, params.loadMassKg ?? 0);
  const handShare = params.isBimanualLoad ? 0.5 : 1.0;

  // Escalado de fuerza isométrica según sexo, edad y complexión (Sección 10 Ergoniza / Chaffin)
  const sexFactor = params.sex === 'femenino' ? 0.68 : 1.0;
  const ageFactor =
    params.ageYears <= 30
      ? 1.0
      : params.ageYears <= 45
        ? 0.94
        : params.ageYears <= 55
          ? 0.86
          : 0.78;
  const compFactor =
    params.complexion === 'delgada_p5'
      ? 0.82
      : params.complexion === 'robusta_p95'
        ? 1.18
        : 1.0;
  const strengthScale = sexFactor * ageFactor * compFactor;

  // Límite ACGIH %MVC_TLV en función del Duty Cycle DC% (Ec. 11 Ergoniza):
  // %MVC_TLV = 100 * (-0.143 * ln(DC/100) + 0.066)
  const dcClamped = clamp(params.dutyCyclePercent, 1, 90);
  const acgihTlvPct = clamp(
    round1(100 * (-0.143 * Math.log(dcClamped / 100) + 0.066)),
    12,
    85,
  );

  // Fracciones antropométricas de masa y longitud (Drillis & Contini / Winter / Sección 5.2 Ergoniza)
  const mUpperArm = 0.028 * bodyMassKg;
  const mForearmHand = (0.016 + 0.006) * bodyMassKg;
  const mHeadNeckTorsoAboveL5 = 0.365 * bodyMassKg; // Cabeza-cuello (8.1%) + Torso supralumbar (28.4%)
  const mUpperBodyAboveHip = 0.54 * bodyMassKg;
  const mAboveKnee = 0.74 * bodyMassKg;

  const lUpperArm = 0.186 * statureM;
  const lForearmHand = 0.254 * statureM;
  const lTrunkCoM = 0.215 * statureM;
  const lThigh = 0.245 * statureM;

  // Ángulos en radianes respecto a la vertical gravitatoria (0°)
  const thetaTrunkDeg = art.tronco.flexion_extension_grados;
  const thetaTrunkRad = thetaTrunkDeg * DEG2RAD;
  const latRad = Math.abs(art.tronco.lateralizacion_grados) * DEG2RAD;
  const twistFactor = 1 + (Math.abs(art.tronco.rotacion_axial_grados) / 90) * 0.18;

  // Ángulo global del húmero y antebrazo en plano sagital/frontal
  const shWorldDeg = thetaTrunkDeg + art.hombro_derecho.flexion_anteroposterior_grados;
  const shWorldRad = shWorldDeg * DEG2RAD;
  const shAbdRad = Math.abs(art.hombro_derecho.abduccion_aduccion_grados) * DEG2RAD;
  const forearmWorldDeg = shWorldDeg + art.codo_derecho.flexion_extension_grados;
  const forearmWorldRad = forearmWorldDeg * DEG2RAD;

  // 1. Momento en Codo Derecho (N·m)
  const fHandRightN = loadKg * handShare * g;
  const armForearmLever = Math.max(0.05, Math.abs(Math.sin(forearmWorldRad))) * lForearmHand;
  const mElbowReq =
    mForearmHand * g * (armForearmLever * 0.48) + fHandRightN * armForearmLever;
  const mvcElbow = 68 * strengthScale;

  // 2. Momento en Hombro Derecho (N·m) — proyección combinada sagital + abducción frontal
  const upperArmSin = Math.hypot(Math.sin(shWorldRad), Math.sin(shAbdRad) * 0.85);
  const rUpperCoM = lUpperArm * 0.436 * Math.min(1, upperArmSin);
  const rElbowFromSh = lUpperArm * Math.min(1, upperArmSin);
  const rHandFromSh = Math.min(
    lUpperArm + lForearmHand,
    rElbowFromSh + armForearmLever,
  );
  const mShoulderReq =
    mUpperArm * g * rUpperCoM +
    mForearmHand * g * (rElbowFromSh + armForearmLever * 0.48) +
    fHandRightN * rHandFromSh;
  const mvcShoulder = 86 * strengthScale;

  // 3. Momento en L5/S1 / L4/L5 (N·m) y Compresión / Cizalladura Discal (Sección 12 Ergoniza)
  const hLoadM = clamp(params.horizontalReachCm / 100, 0.18, 0.92);
  const rTorsoL5 = Math.hypot(lTrunkCoM * Math.sin(thetaTrunkRad), lTrunkCoM * 0.45 * Math.sin(latRad));
  const fLoadTotalN = loadKg * g;
  const mL5S1Base =
    mHeadNeckTorsoAboveL5 * g * Math.abs(rTorsoL5) +
    2 * mUpperArm * g * Math.max(0.08, Math.abs(rTorsoL5) + rUpperCoM * 0.6) +
    2 * mForearmHand * g * Math.max(0.12, hLoadM * 0.72) +
    fLoadTotalN * hLoadM;
  const mL5S1Req = mL5S1Base * twistFactor;
  const mvcTrunk = 245 * strengthScale;

  // Presión Intraabdominal y Fuerza de Alivio F_A (Ecuación 53-54 de Ergoniza Intelligent, pág. 62):
  // F_A = 6.199473e-4 * (43 - 0.36 * theta_t) * M_L5S1^1.8
  // D_FA = 0.066 + 0.082 * |sin(theta_t)|
  const thetaPosDeg = clamp(Math.abs(thetaTrunkDeg), 0, 95);
  const rawFa =
    6.199473e-4 *
    Math.max(5, 43 - 0.36 * thetaPosDeg) *
    Math.pow(Math.max(1, mL5S1Req), 1.8);
  const fAbdominalN = clamp(rawFa, 0, 580);
  const dFaM = 0.066 + 0.082 * Math.abs(Math.sin(thetaTrunkRad));
  const mReliefFa = fAbdominalN * dFaM;

  // Brazo de palanca efectivo del erector espinal lumbar D_E ≈ 0.058 m (Chaffin / McGill)
  const dErectorM = 0.058;
  const fErectorN = Math.max(0, (mL5S1Req - mReliefFa) / dErectorM);

  // Inclinación del platillo vertebral L4/L5 respecto a la horizontal: α_disc ≈ 0.62 * θ_tronco + 14°
  const discInclinationRad = (0.62 * thetaPosDeg + 14) * DEG2RAD;
  const upperWeightAndLoadN = (mHeadNeckTorsoAboveL5 + 2 * (mUpperArm + mForearmHand)) * g + fLoadTotalN;

  const axialGravityCompN = upperWeightAndLoadN * Math.cos(discInclinationRad);
  const shearGravityN = upperWeightAndLoadN * Math.sin(discInclinationRad);

  // Penalización compresiva adicional por co-contracción en asimetría/lateralización (>15°)
  const coContractionFactor =
    1 +
    Math.max(0, Math.abs(art.tronco.rotacion_axial_grados) - 10) * 0.0045 +
    Math.max(0, Math.abs(art.tronco.lateralizacion_grados) - 8) * 0.005;

  const l4l5CompressionN = Math.round(
    Math.max(320, (axialGravityCompN + fErectorN - fAbdominalN) * coContractionFactor),
  );
  const l4l5ShearN = Math.round(
    Math.max(35, shearGravityN + Math.abs(Math.sin(latRad)) * upperWeightAndLoadN * 0.22),
  );

  // Umbral compresivo L4/L5 según Sexo y Edad (Tabla 6 Ergoniza Intelligent / Dortmund Lumbar Load):
  // Hombres: 20-40a = 3400 N | 40-50a = 3100 N | >50a = 2650 N
  // Mujeres: 20-40a = 3100 N | 40-50a = 2800 N | >50a = 2500 N
  let l4l5CompressionLimitN = 3400;
  if (params.sex === 'masculino') {
    l4l5CompressionLimitN =
      params.ageYears <= 40 ? 3400 : params.ageYears <= 50 ? 3100 : 2650;
  } else {
    l4l5CompressionLimitN =
      params.ageYears <= 40 ? 3100 : params.ageYears <= 50 ? 2800 : 2500;
  }
  const l4l5ShearLimitN = 500;

  // 4. Momentos en Cadera y Rodilla Derecha (reparto según condición de apoyo)
  const isSeated = json.condiciones_apoyo_detectadas.toLowerCase().includes('sedest');
  const isOneLeg = json.condiciones_apoyo_detectadas.toLowerCase().includes('monoped');
  const legLoadShare = isSeated ? 0.15 : isOneLeg ? 1.0 : 0.52;

  const hipRad = art.cadera_derecha.flexion_extension_grados * DEG2RAD;
  const kneeRad = art.rodilla_derecha.flexion_extension_grados * DEG2RAD;

  const mHipReq = isSeated
    ? mL5S1Req * 0.28
    : legLoadShare * ((mUpperBodyAboveHip * g + fLoadTotalN) * Math.max(0.05, 0.18 * Math.abs(Math.sin(hipRad)) + hLoadM * 0.25));
  const mvcHip = 195 * strengthScale;

  const kneeLeverM = lThigh * 0.42 * Math.abs(Math.sin(kneeRad));
  const mKneeReq = isSeated
    ? 12
    : legLoadShare * (mAboveKnee * g + fLoadTotalN) * Math.max(0.03, kneeLeverM);
  const mvcKnee = 168 * strengthScale;

  const buildJointEval = (
    jointId: JointMomentEvaluation['jointId'],
    jointLabel: string,
    angleSummary: string,
    momentNm: number,
    mvcCapacityNm: number,
    cv = 0.26,
  ): JointMomentEvaluation => {
    const pctMvc = round1((momentNm / Math.max(1, mvcCapacityNm)) * 100);
    // z = (Media_MVC - Momento_Requerido) / (CV * Media_MVC)
    const sd = Math.max(2, mvcCapacityNm * cv);
    const z = (mvcCapacityNm - momentNm) / sd;
    const protectedPct = round1(clamp(normalCdf(z) * 100, 1, 99.9));
    const status: JointMomentEvaluation['status'] =
      pctMvc > Math.max(acgihTlvPct * 1.25, 65) || protectedPct < 75
        ? 'critico'
        : pctMvc > acgihTlvPct || protectedPct < 90
          ? 'condicional'
          : 'aceptable';

    return {
      jointId,
      jointLabel,
      angleSummary,
      momentNm: round1(momentNm),
      mvcCapacityNm: round1(mvcCapacityNm),
      percentMvc: pctMvc,
      acgihTlvPercentMvc: acgihTlvPct,
      protectedPopulationPct: protectedPct,
      status,
    };
  };

  const joints: JointMomentEvaluation[] = [
    buildJointEval(
      'l5s1',
      'Tronco Lumbosacro (L4/L5 – L5/S1)',
      `Flex ${art.tronco.flexion_extension_grados}° · Lat ${art.tronco.lateralizacion_grados}° · Rot ${art.tronco.rotacion_axial_grados}°`,
      mL5S1Req,
      mvcTrunk,
      0.27,
    ),
    buildJointEval(
      'shoulder_r',
      'Hombro Derecho (Glenohumeral)',
      `Flex ${art.hombro_derecho.flexion_anteroposterior_grados}° · Abd ${art.hombro_derecho.abduccion_aduccion_grados}° · RotHum ${art.hombro_derecho.rotacion_humeral_grados}°`,
      mShoulderReq,
      mvcShoulder,
      0.25,
    ),
    buildJointEval(
      'elbow_r',
      'Codo Derecho (Humeroulnar)',
      `Flex ${art.codo_derecho.flexion_extension_grados}°`,
      mElbowReq,
      mvcElbow,
      0.23,
    ),
    buildJointEval(
      'hip_r',
      'Cadera Derecha (Coxofemoral)',
      `Flex ${art.cadera_derecha.flexion_extension_grados}°`,
      mHipReq,
      mvcHip,
      0.26,
    ),
    buildJointEval(
      'knee_r',
      'Rodilla Derecha (Tibiofemoral)',
      `Flex ${art.rodilla_derecha.flexion_extension_grados}°`,
      mKneeReq,
      mvcKnee,
      0.25,
    ),
  ];

  const requiredFrictionMu = round1(
    0.12 + (Math.abs(art.tronco.rotacion_axial_grados) / 90) * 0.14 + (loadKg / Math.max(45, bodyMassKg)) * 0.22,
  );

  const hasCriticalJoint = joints.some((j) => j.status === 'critico');
  const hasConditionalJoint = joints.some((j) => j.status === 'condicional');

  const overallRisk: ErgonizaBiomechanicalReport['overallRisk'] =
    l4l5CompressionN >= l4l5CompressionLimitN ||
    l4l5ShearN >= l4l5ShearLimitN ||
    hasCriticalJoint ||
    requiredFrictionMu > params.floorFrictionMu
      ? 'alto'
      : l4l5CompressionN >= l4l5CompressionLimitN * 0.78 ||
          l4l5ShearN >= 380 ||
          hasConditionalJoint
        ? 'medio'
        : 'bajo';

  const compPct = Math.round((l4l5CompressionN / l4l5CompressionLimitN) * 100);
  const technicalSummary =
    overallRisk === 'alto'
      ? `Sobrecarga biomecánica detectada en t = ${json.fotograma_critico_segundo.toFixed(2)} s: compresión discal L4/L5 de ${l4l5CompressionN} N (${compPct}% del umbral de ${l4l5CompressionLimitN} N para ${params.sex}, ${params.ageYears} años) y cizalladura de ${l4l5ShearN} N. Se recomienda rediseño de altura de origen/alcance H o asistencia mecánica.`
      : overallRisk === 'medio'
        ? `Exigencia biomecánica moderada/condicional en t = ${json.fotograma_critico_segundo.toFixed(2)} s: compresión L4/L5 de ${l4l5CompressionN} N (${compPct}% del umbral de ${l4l5CompressionLimitN} N) y cizalladura de ${l4l5ShearN} N. Vigilar frecuencia y aproximar la carga al eje corporal.`
        : `Solicitación biomecánica dentro de márgenes admisibles en t = ${json.fotograma_critico_segundo.toFixed(2)} s: compresión L4/L5 de ${l4l5CompressionN} N (< ${l4l5CompressionLimitN} N) y cizalladura de ${l4l5ShearN} N (< 500 N), con capacidad articular preservada.`;

  return {
    l4l5CompressionN,
    l4l5CompressionLimitN,
    l4l5ShearN,
    l4l5ShearLimitN,
    intraAbdominalReliefN: Math.round(fAbdominalN),
    erectorSpinaeForceN: Math.round(fErectorN),
    joints,
    requiredFrictionMu,
    overallRisk,
    technicalSummary,
  };
}

import {
  BIPOLAR_ITEMS,
  METHOD_CATALOG,
  createDefaultPayloads,
} from './defaults';
import { evalMethodExpr, getMethodParam } from './formulaConfig';
import {
  FangerData,
  Iso2631Data,
  Iso5349Data,
  JsiData,
  Lmc295Data,
  MethodEvaluationResult,
  MethodId,
  Nam295Data,
  NioshData,
  OcraChecklistData,
  OcraChecklistSide,
  OcraCompletoData,
  OwasData,
  RebaData,
  RebaSideInput,
  RiskSeverity,
  RulaData,
  RulaSideInput,
  SnookData,
  StudyTab,
  WbgtData,
} from '../types/ergonomics';

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

// ============================================================================
// 1. MÉTODO RULA (Capítulo 4.2 - Tablas 4.14, 4.15, 4.18, 4.19)
// ============================================================================
const RULA_TABLE_A: number[][][] = [
  // Brazo 1
  [
    [1, 2, 2, 2, 2, 3, 3, 3], // Antebrazo 1
    [2, 2, 2, 2, 3, 3, 3, 3], // Antebrazo 2
    [2, 3, 3, 3, 3, 3, 4, 4], // Antebrazo 3
  ],
  // Brazo 2
  [
    [2, 3, 3, 3, 3, 4, 4, 4],
    [3, 3, 3, 3, 3, 4, 4, 4],
    [3, 4, 4, 4, 4, 4, 5, 5],
  ],
  // Brazo 3
  [
    [3, 3, 4, 4, 4, 4, 5, 5],
    [3, 4, 4, 4, 4, 4, 5, 5],
    [4, 4, 4, 4, 4, 5, 5, 5],
  ],
  // Brazo 4
  [
    [4, 4, 4, 4, 4, 5, 5, 5],
    [4, 4, 4, 4, 4, 5, 5, 5],
    [4, 4, 4, 5, 5, 5, 6, 6],
  ],
  // Brazo 5
  [
    [5, 5, 5, 5, 5, 6, 6, 7],
    [5, 6, 6, 6, 6, 7, 7, 7],
    [6, 6, 6, 7, 7, 7, 7, 8],
  ],
  // Brazo 6
  [
    [7, 7, 7, 7, 7, 8, 8, 9],
    [8, 8, 8, 8, 8, 9, 9, 9],
    [9, 9, 9, 9, 9, 9, 9, 9],
  ],
];

const RULA_TABLE_B: number[][] = [
  // Cuello 1..6; cols: (Tronco 1..6) x (Piernas 1..2) -> 12 cols
  [1, 3, 2, 3, 3, 4, 5, 5, 6, 6, 7, 7],
  [2, 3, 2, 3, 4, 5, 5, 5, 6, 7, 7, 7],
  [3, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 7],
  [5, 5, 5, 6, 6, 7, 7, 7, 7, 7, 8, 8],
  [7, 7, 7, 7, 7, 8, 8, 8, 8, 8, 8, 8],
  [8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9],
];

const RULA_TABLE_C: number[][] = [
  // C = 1..8+; D = 1..7+
  [1, 2, 3, 3, 4, 5, 5],
  [2, 2, 3, 4, 4, 5, 5],
  [3, 3, 3, 4, 4, 5, 6],
  [3, 3, 3, 4, 5, 6, 6],
  [4, 4, 4, 5, 6, 7, 7],
  [4, 4, 5, 6, 6, 7, 7],
  [5, 5, 6, 6, 7, 7, 7],
  [5, 5, 6, 7, 7, 7, 7],
];

function computeRulaSide(side: RulaSideInput, scoreD: number) {
  const upperArm = clamp(
    side.upperArmPos + (side.shoulderRaised ? 1 : 0) + (side.armAbducted ? 1 : 0) - (side.armSupported ? 1 : 0),
    1,
    6,
  );
  const lowerArm = clamp(side.lowerArmPos + (side.lowerArmCrossMidline ? 1 : 0), 1, 3);
  const wrist = clamp(side.wristPos + (side.wristDeviated ? 1 : 0), 1, 4);
  const wristTwist = clamp(side.wristTwist, 1, 2);

  const colIdx = (wrist - 1) * 2 + (wristTwist - 1);
  const scoreA = RULA_TABLE_A[upperArm - 1][lowerArm - 1][colIdx];
  const scoreC = Math.round(
    evalMethodExpr(
      MethodId.RULA,
      'scoreC',
      { scoreA, muscleUseA: side.muscleUseA, forceLoadA: side.forceLoadA },
      scoreA + side.muscleUseA + side.forceLoadA,
    ),
  );
  const cIdx = clamp(scoreC, 1, 8) - 1;
  const dIdx = clamp(scoreD, 1, 7) - 1;
  const tableC = RULA_TABLE_C[cIdx][dIdx];
  const finalScore = Math.round(
    evalMethodExpr(MethodId.RULA, 'finalScore', { tableC, scoreC, scoreD }, tableC),
  );

  return { upperArm, lowerArm, wrist, wristTwist, scoreA, scoreC, finalScore };
}

export function evaluateRula(data: RulaData): MethodEvaluationResult {
  const neck = clamp(data.neckPos + (data.neckRotated ? 1 : 0) + (data.neckSideBending ? 1 : 0), 1, 6);
  const trunk = clamp(data.trunkPos + (data.trunkTwisted ? 1 : 0) + (data.trunkSideBending ? 1 : 0), 1, 6);
  const legs = clamp(data.legsPos, 1, 2);
  const colB = (trunk - 1) * 2 + (legs - 1);
  const scoreB = RULA_TABLE_B[neck - 1][colB];
  const scoreD = Math.round(
    evalMethodExpr(
      MethodId.RULA,
      'scoreD',
      { scoreB, muscleUseB: data.muscleUseB, forceLoadB: data.forceLoadB },
      scoreB + data.muscleUseB + data.forceLoadB,
    ),
  );

  const rightRes = computeRulaSide(data.right, scoreD);
  const leftRes = computeRulaSide(data.left, scoreD);

  let worstScore = rightRes.finalScore;
  let secondary = '';
  if (data.evaluatedSide === 'derecho') {
    worstScore = rightRes.finalScore;
    secondary = `Lado Derecho: ${rightRes.finalScore} / 7`;
  } else if (data.evaluatedSide === 'izquierdo') {
    worstScore = leftRes.finalScore;
    secondary = `Lado Izquierdo: ${leftRes.finalScore} / 7`;
  } else {
    worstScore = Math.max(rightRes.finalScore, leftRes.finalScore);
    secondary = `Der: ${rightRes.finalScore} · Izq: ${leftRes.finalScore}`;
  }

  const modMin = getMethodParam(MethodId.RULA, 'modMin', 3);
  const highMin = getMethodParam(MethodId.RULA, 'highMin', 5);
  const veryHighMin = getMethodParam(MethodId.RULA, 'veryHighMin', 7);

  let severity: RiskSeverity = 'bajo';
  let riskLabel = 'Postura aceptable';
  let actionLevelText = 'Nivel de Actuación 1 — No requiere cambios';
  let deadline: MethodEvaluationResult['recommendedDeadline'] = 'Sin plazo específico';
  let interpretation =
    'La puntuación final corresponde al Nivel de Actuación 1. La postura evaluada resulta aceptable si no se mantiene o repite por largos períodos.';

  if (worstScore >= veryHighMin) {
    severity = 'muy_alto';
    riskLabel = 'Riesgo muy alto';
    actionLevelText = 'Nivel de Actuación 4 — Cambios urgentes';
    deadline = 'Inmediato';
    interpretation =
      'Puntuación final en Nivel de Actuación 4. Se requieren cambios urgentes en el diseño del puesto o en la ejecución de la tarea.';
  } else if (worstScore >= highMin) {
    severity = 'alto';
    riskLabel = 'Riesgo alto';
    actionLevelText = 'Nivel de Actuación 3 — Rediseño de la tarea pronto';
    deadline = 'Corto plazo';
    interpretation =
      'Puntuación final en Nivel de Actuación 3. Se requiere el rediseño de la tarea y realizar actividades de investigación ergonómica.';
  } else if (worstScore >= modMin) {
    severity = 'moderado';
    riskLabel = 'Riesgo moderado';
    actionLevelText = 'Nivel de Actuación 2 — Profundizar estudio / posibles cambios';
    deadline = 'Medio plazo';
    interpretation =
      'Puntuación final en Nivel de Actuación 2. Pueden requerirse cambios en la tarea; es necesario profundizar en el estudio postural.';
  }

  const suggestions: string[] = [];
  if (trunk >= 3) suggestions.push('Adecuar la altura del plano de trabajo para evitar la flexión mayor a 20° y eliminar torsiones del tronco.');
  if (neck >= 3) suggestions.push('Reubicar el punto de atención visual para reducir la flexión o extensión cervical.');
  if (rightRes.upperArm >= 3 || leftRes.upperArm >= 3)
    suggestions.push('Acercar los elementos de trabajo al cuerpo para disminuir la flexión y abducción de brazos e incorporar apoyabrazos si procede.');
  if (rightRes.wrist >= 3 || leftRes.wrist >= 3)
    suggestions.push('Rediseñar la orientación de herramientas o piezas para mantener la muñeca alineada sin desviación radial/cubital.');
  if (data.right.muscleUseA > 0 || data.left.muscleUseA > 0 || data.muscleUseB > 0)
    suggestions.push('Incorporar pausas activas o rotación de puestos para interrumpir el mantenimiento estático o la alta repetitividad.');
  if (suggestions.length === 0) suggestions.push('Mantener las condiciones posturales actuales y realizar seguimiento periódico.');

  const rows = [
    { parameter: 'Lado evaluado', value: data.evaluatedSide.toUpperCase(), reference: `Ciclo: ${data.cycleDurationSec}s` },
    ...(data.evaluatedSide !== 'izquierdo'
      ? [
          {
            parameter: 'Grupo A (Derecho)',
            value: `Puntuación A = ${rightRes.scoreA} → C = ${rightRes.scoreC}`,
            reference: `Brazo ${rightRes.upperArm} · Anteb. ${rightRes.lowerArm} · Muñeca ${rightRes.wrist} · Giro ${rightRes.wristTwist}`,
          },
        ]
      : []),
    ...(data.evaluatedSide !== 'derecho'
      ? [
          {
            parameter: 'Grupo A (Izquierdo)',
            value: `Puntuación A = ${leftRes.scoreA} → C = ${leftRes.scoreC}`,
            reference: `Brazo ${leftRes.upperArm} · Anteb. ${leftRes.lowerArm} · Muñeca ${leftRes.wrist} · Giro ${leftRes.wristTwist}`,
          },
        ]
      : []),
    {
      parameter: 'Grupo B (Cuello, Tronco, Piernas)',
      value: `Puntuación B = ${scoreB} → D = ${scoreD}`,
      reference: `Cuello ${neck} · Tronco ${trunk} · Piernas ${legs}`,
    },
    {
      parameter: 'Actividad Muscular / Fuerza',
      value: `+${data.muscleUseB} musc. / +${data.forceLoadB} fuerza`,
      reference: 'Tablas 4.16 y 4.17',
    },
    {
      parameter: 'Puntuación Final RULA',
      value: `${worstScore} puntos`,
      reference: actionLevelText,
    },
  ];

  const meta = METHOD_CATALOG.find((m) => m.id === MethodId.RULA)!;
  return {
    methodId: MethodId.RULA,
    methodName: meta.fullName,
    category: meta.category,
    categoryLabel: meta.categoryLabel,
    hierarchyOrder: meta.hierarchyOrder,
    primaryScoreText: `${worstScore} / 7`,
    secondaryScoreText: secondary,
    severity,
    riskLabel,
    actionLevelText,
    recommendedDeadline: deadline,
    interpretation,
    breakdownRows: rows,
    suggestedMeasures: suggestions,
  };
}

// ============================================================================
// 2. MÉTODO REBA (Capítulo 4.3 + Tabla Oficial Hignett & McAtamney)
// ============================================================================
const REBA_TABLE_A: number[][][] = [
  // Tronco 1..5 -> Cuello 1..3 -> Piernas 1..4
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
  // Brazo 1..6 -> Antebrazo 1..2 -> Muñeca 1..3
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

function computeRebaSide(side: RebaSideInput, scoreA: number, activityScore: number) {
  const upperArm = clamp(
    side.upperArmPos + (side.shoulderRaised ? 1 : 0) + (side.armAbducted ? 1 : 0) - (side.armSupported ? 1 : 0),
    1,
    6,
  );
  const lowerArm = clamp(side.lowerArmPos, 1, 2);
  const wrist = clamp(side.wristPos + (side.wristTwistedOrDeviated ? 1 : 0), 1, 3);
  const tableB = REBA_TABLE_B[upperArm - 1][lowerArm - 1][wrist - 1];
  const scoreB = Math.round(
    evalMethodExpr(
      MethodId.REBA,
      'scoreB',
      { tableB, coupling: side.coupling },
      clamp(tableB + side.coupling, 1, 12),
    ),
  );
  const tableC = REBA_TABLE_C[clamp(scoreA, 1, 12) - 1][clamp(scoreB, 1, 12) - 1];
  const finalReba = Math.round(
    evalMethodExpr(
      MethodId.REBA,
      'finalReba',
      { tableC, activityScore, scoreA, scoreB },
      clamp(tableC + activityScore, 1, 15),
    ),
  );
  return { upperArm, lowerArm, wrist, tableB, scoreB, tableC, finalReba };
}

export function evaluateReba(data: RebaData): MethodEvaluationResult {
  const trunk = clamp(data.trunkPos + (data.trunkTwistedOrSide ? 1 : 0), 1, 5);
  const neck = clamp(data.neckPos + (data.neckTwistedOrSide ? 1 : 0), 1, 3);
  const legs = clamp(data.legsBase + data.legsKneeFlexion, 1, 4);

  const tableA = REBA_TABLE_A[trunk - 1][neck - 1][legs - 1];
  const loadPoints = data.loadForce + (data.shockForce ? 1 : 0);
  const scoreA = Math.round(
    evalMethodExpr(
      MethodId.REBA,
      'scoreA',
      { tableA, loadPoints },
      clamp(tableA + loadPoints, 1, 12),
    ),
  );
  const activityScore =
    (data.activityStatic ? 1 : 0) + (data.activityRepetitive ? 1 : 0) + (data.activityUnstableChanges ? 1 : 0);

  const rightRes = computeRebaSide(data.right, scoreA, activityScore);
  const leftRes = computeRebaSide(data.left, scoreA, activityScore);

  let worstScore = rightRes.finalReba;
  let secondary = '';
  if (data.evaluatedSide === 'derecho') {
    worstScore = rightRes.finalReba;
    secondary = `Lado Derecho: ${rightRes.finalReba} / 15`;
  } else if (data.evaluatedSide === 'izquierdo') {
    worstScore = leftRes.finalReba;
    secondary = `Lado Izquierdo: ${leftRes.finalReba} / 15`;
  } else {
    worstScore = Math.max(rightRes.finalReba, leftRes.finalReba);
    secondary = `Der: ${rightRes.finalReba} · Izq: ${leftRes.finalReba}`;
  }

  const lowMin = getMethodParam(MethodId.REBA, 'lowMin', 2);
  const modMin = getMethodParam(MethodId.REBA, 'modMin', 4);
  const highMin = getMethodParam(MethodId.REBA, 'highMin', 8);
  const veryHighMin = getMethodParam(MethodId.REBA, 'veryHighMin', 11);

  let severity: RiskSeverity = 'bajo';
  let riskLabel = 'Riesgo inapreciable';
  let actionLevelText = 'Nivel de Actuación 0 — No es necesaria la actuación';
  let deadline: MethodEvaluationResult['recommendedDeadline'] = 'Sin plazo específico';
  let interpretation = 'Puntuación final REBA en Nivel 0. El riesgo postural es inapreciable y no requiere intervención.';

  if (worstScore >= veryHighMin) {
    severity = 'muy_alto';
    riskLabel = 'Riesgo muy alto';
    actionLevelText = 'Nivel de Actuación 4 — Actuar de inmediato';
    deadline = 'Inmediato';
    interpretation = 'Puntuación REBA en Nivel 4. Riesgo muy alto; exige intervención correctora de inmediato.';
  } else if (worstScore >= highMin) {
    severity = 'alto';
    riskLabel = 'Riesgo alto';
    actionLevelText = 'Nivel de Actuación 3 — Es necesaria la actuación cuanto antes';
    deadline = 'Corto plazo';
    interpretation = 'Puntuación REBA en Nivel 3. Riesgo alto; se requieren cambios a corto plazo sobre el puesto.';
  } else if (worstScore >= modMin) {
    severity = 'moderado';
    riskLabel = 'Riesgo medio';
    actionLevelText = 'Nivel de Actuación 2 — Es necesaria la actuación';
    deadline = 'Medio plazo';
    interpretation = 'Puntuación REBA en Nivel 2. Riesgo medio; se requiere rediseñar condiciones de la tarea.';
  } else if (worstScore >= lowMin) {
    severity = 'bajo';
    riskLabel = 'Riesgo bajo';
    actionLevelText = 'Nivel de Actuación 1 — Puede ser necesaria la actuación';
    deadline = 'Medio plazo';
    interpretation = 'Puntuación REBA en Nivel 1. Riesgo bajo; puede requerirse profundizar el estudio o ajustes menores.';
  }

  const suggestions: string[] = [];
  if (trunk >= 3) suggestions.push('Regular la altura operativa entre caderas y pecho para evitar flexión de tronco > 20° y eliminar giros.');
  if (legs >= 3) suggestions.push('Evitar posturas en cuclillas, de rodillas o con apoyo asimétrico; proveer plataforma estable o apoyo acolchado si es ocasional.');
  if (rightRes.upperArm >= 3 || leftRes.upperArm >= 3)
    suggestions.push('Disminuir el alcance elevado o abducido de brazos acercando herramientas y comandos a la zona neutra.');
  if (data.right.coupling >= 2 || data.left.coupling >= 2)
    suggestions.push('Mejorar la sujeción incorporando asas ergonómicas o revisando guantes que dificultan el agarre.');
  if (activityScore >= 2)
    suggestions.push('Introducir rotación de tareas y pausas programadas para reducir posturas estáticas y ciclos repetitivos.');
  if (suggestions.length === 0) suggestions.push('Conservar las condiciones actuales del puesto y verificar periódicamente.');

  const activeSide = data.evaluatedSide === 'izquierdo' ? leftRes : rightRes;
  const rows = [
    {
      parameter: 'Grupo A (Tronco, Cuello, Piernas)',
      value: `Tabla A = ${tableA} + Carga (${loadPoints}) → Puntaje A = ${scoreA}`,
      reference: `Tronco ${trunk} · Cuello ${neck} · Piernas ${legs}`,
    },
    ...(data.evaluatedSide !== 'izquierdo'
      ? [
          {
            parameter: 'Grupo B (Derecho)',
            value: `Tabla B = ${rightRes.tableB} + Agarre (${data.right.coupling}) → Puntaje B = ${rightRes.scoreB}`,
            reference: `Brazo ${rightRes.upperArm} · Anteb. ${rightRes.lowerArm} · Muñeca ${rightRes.wrist}`,
          },
        ]
      : []),
    ...(data.evaluatedSide !== 'derecho'
      ? [
          {
            parameter: 'Grupo B (Izquierdo)',
            value: `Tabla B = ${leftRes.tableB} + Agarre (${data.left.coupling}) → Puntaje B = ${leftRes.scoreB}`,
            reference: `Brazo ${leftRes.upperArm} · Anteb. ${leftRes.lowerArm} · Muñeca ${leftRes.wrist}`,
          },
        ]
      : []),
    {
      parameter: 'Tabla C + Actividad Muscular',
      value: `Tabla C = ${activeSide.tableC} + Actividad (${activityScore})`,
      reference: `Estática ${data.activityStatic ? '+1' : '0'} · Repetitiva ${data.activityRepetitive ? '+1' : '0'} · Inestable ${data.activityUnstableChanges ? '+1' : '0'}`,
    },
    {
      parameter: 'Puntuación Final REBA',
      value: `${worstScore} puntos`,
      reference: actionLevelText,
    },
  ];

  const meta = METHOD_CATALOG.find((m) => m.id === MethodId.REBA)!;
  return {
    methodId: MethodId.REBA,
    methodName: meta.fullName,
    category: meta.category,
    categoryLabel: meta.categoryLabel,
    hierarchyOrder: meta.hierarchyOrder,
    primaryScoreText: `${worstScore} / 15`,
    secondaryScoreText: secondary,
    severity,
    riskLabel,
    actionLevelText,
    recommendedDeadline: deadline,
    interpretation,
    breakdownRows: rows,
    suggestedMeasures: suggestions,
  };
}

// ============================================================================
// 3. MÉTODO OWAS (Capítulo 4.4 - Matriz oficial 4 x 3 x 7 x 3 = 252 celdas)
// ============================================================================
// OWAS_MATRIX[back 1..4][arms 1..3][legs 1..7][load 1..3]
const OWAS_MATRIX: number[][][][] = [
  // Espalda 1 (Recta)
  [
    // Brazos 1
    [[1, 1, 1], [1, 1, 1], [1, 1, 1], [2, 2, 2], [2, 2, 2], [1, 1, 1], [1, 1, 1]],
    // Brazos 2
    [[1, 1, 1], [1, 1, 1], [1, 1, 1], [2, 2, 2], [2, 2, 2], [1, 1, 1], [1, 1, 1]],
    // Brazos 3
    [[1, 1, 1], [1, 1, 1], [1, 1, 1], [2, 2, 3], [2, 2, 3], [1, 1, 1], [1, 1, 2]],
  ],
  // Espalda 2 (Flexionada)
  [
    // Brazos 1
    [[2, 2, 3], [2, 2, 3], [2, 2, 3], [3, 3, 3], [3, 3, 3], [2, 2, 2], [2, 3, 3]],
    // Brazos 2
    [[2, 2, 3], [2, 2, 3], [2, 3, 3], [3, 4, 4], [3, 4, 4], [3, 3, 4], [2, 3, 4]],
    // Brazos 3
    [[3, 3, 4], [2, 2, 3], [3, 3, 3], [3, 4, 4], [4, 4, 4], [4, 4, 4], [2, 3, 4]],
  ],
  // Espalda 3 (Con torsión)
  [
    // Brazos 1
    [[1, 1, 1], [1, 1, 2], [1, 2, 2], [3, 3, 3], [4, 4, 4], [1, 1, 1], [1, 1, 1]],
    // Brazos 2
    [[2, 2, 3], [1, 1, 2], [1, 1, 2], [4, 4, 4], [4, 4, 4], [3, 3, 3], [1, 1, 1]],
    // Brazos 3
    [[2, 2, 3], [1, 1, 2], [2, 3, 3], [4, 4, 4], [4, 4, 4], [4, 4, 4], [1, 1, 1]],
  ],
  // Espalda 4 (Flexionada con torsión)
  [
    // Brazos 1
    [[2, 3, 3], [2, 2, 3], [2, 2, 3], [4, 4, 4], [4, 4, 4], [4, 4, 4], [2, 3, 4]],
    // Brazos 2
    [[3, 3, 4], [2, 3, 4], [3, 3, 4], [4, 4, 4], [4, 4, 4], [4, 4, 4], [2, 3, 4]],
    // Brazos 3
    [[4, 4, 4], [2, 3, 4], [3, 3, 4], [4, 4, 4], [4, 4, 4], [4, 4, 4], [2, 3, 4]],
  ],
];

export function getOwasCategory(back: number, arms: number, legs: number, load: number): 1 | 2 | 3 | 4 {
  const b = clamp(back, 1, 4) - 1;
  const a = clamp(arms, 1, 3) - 1;
  const l = clamp(legs, 1, 7) - 1;
  const c = clamp(load, 1, 3) - 1;
  return OWAS_MATRIX[b][a][l][c] as 1 | 2 | 3 | 4;
}

export function evaluateOwas(data: OwasData): MethodEvaluationResult {
  const obs = data.observations.length > 0 ? data.observations : [];
  const totalFreq = obs.reduce((acc, o) => acc + Math.max(0, o.frequencyCount), 0) || 1;

  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let maxCat: 1 | 2 | 3 | 4 = 1;

  const obsRows = obs.map((o) => {
    const cat = getOwasCategory(o.back, o.arms, o.legs, o.load);
    counts[cat] += Math.max(0, o.frequencyCount);
    if (cat > maxCat) maxCat = cat;
    const pct = ((Math.max(0, o.frequencyCount) / totalFreq) * 100).toFixed(1);
    return {
      parameter: `${o.taskPhase} (${o.back}-${o.arms}-${o.legs}-${o.load})`,
      value: `Categoría ${cat}`,
      reference: `${o.frequencyCount} obs. (${pct}%)`,
    };
  });

  const cat1Pct = (counts[1] / totalFreq) * 100;
  const cat2Pct = (counts[2] / totalFreq) * 100;
  const cat3Pct = (counts[3] / totalFreq) * 100;
  const cat4Pct = (counts[4] / totalFreq) * 100;

  const weightedIndex = evalMethodExpr(
    MethodId.OWAS,
    'weightedIndex',
    { cat1Pct, cat2Pct, cat3Pct, cat4Pct, totalObs: totalFreq },
    (cat1Pct * 1 + cat2Pct * 2 + cat3Pct * 3 + cat4Pct * 4) / 100,
  );
  const cat4MinPct = getMethodParam(MethodId.OWAS, 'cat4MinPct', 0.01);
  const cat3MinPct = getMethodParam(MethodId.OWAS, 'cat3MinPct', 0.01);
  const cat2MinPct = getMethodParam(MethodId.OWAS, 'cat2MinPct', 0.01);

  let severity: RiskSeverity = 'bajo';
  let riskLabel = 'Categoría 1 — Posturas normales';
  let actionLevelText = 'Categoría de Acción 1 — No requiere medidas';
  let deadline: MethodEvaluationResult['recommendedDeadline'] = 'Sin plazo específico';
  let interpretation =
    'Predominan posturas normales y naturales sin efectos dañinos sobre el aparato locomotor (Tabla 4.43).';

  if (counts[4] > 0 && cat4Pct >= cat4MinPct) {
    severity = 'muy_alto';
    riskLabel = 'Categoría 4 — Efectos altamente dañinos';
    actionLevelText = 'Categoría de Acción 4 — Corrección inmediata';
    deadline = 'Inmediato';
    interpretation = `Se registran posturas de Categoría 4 (${cat4Pct.toFixed(1)}% del ciclo). Conforme a la Tabla 4.44, exige medidas correctoras de forma inmediata.`;
  } else if (counts[3] > 0 && cat3Pct >= cat3MinPct) {
    severity = 'alto';
    riskLabel = 'Categoría 3 — Efectos dañinos';
    actionLevelText = 'Categoría de Acción 3 — Corrección a corto plazo';
    deadline = 'Corto plazo';
    interpretation = `Se registran posturas de Categoría 3 (${cat3Pct.toFixed(1)}% del ciclo). Se requieren medidas correctoras a corto plazo sobre las fases críticas.`;
  } else if (counts[2] > 0 && cat2Pct >= cat2MinPct) {
    severity = 'moderado';
    riskLabel = 'Categoría 2 — Posibilidad de daño';
    actionLevelText = 'Categoría de Acción 2 — Corrección a medio plazo';
    deadline = 'Medio plazo';
    interpretation = `Predominan posturas de Categoría 2 (${cat2Pct.toFixed(1)}% del ciclo). Se requieren medidas correctoras a medio plazo.`;
  }

  const suggestions: string[] = [];
  if (obs.some((o) => o.back >= 3)) suggestions.push('Reubicar zonas de toma y depósito para suprimir giros y flexiones simultáneas de espalda.');
  if (obs.some((o) => o.legs === 4 || o.legs === 5 || o.legs === 6))
    suggestions.push('Elevar el plano de origen de cargas para eliminar flexión profunda de rodillas o posturas arrodilladas.');
  if (obs.some((o) => o.arms >= 2)) suggestions.push('Situar controles y estantes por debajo del nivel de los hombros.');
  if (obs.some((o) => o.load === 3)) suggestions.push('Incorporar ayudas mecánicas o fraccionar cargas superiores a 20 kg.');
  if (suggestions.length === 0) suggestions.push('Mantener el esquema postural actual y verificar ante cambios del proceso.');

  const meta = METHOD_CATALOG.find((m) => m.id === MethodId.OWAS)!;
  return {
    methodId: MethodId.OWAS,
    methodName: meta.fullName,
    category: meta.category,
    categoryLabel: meta.categoryLabel,
    hierarchyOrder: meta.hierarchyOrder,
    primaryScoreText: `Cat. ${maxCat}`,
    secondaryScoreText: `C4: ${cat4Pct.toFixed(0)}% · C3: ${cat3Pct.toFixed(0)}% · I=${weightedIndex.toFixed(2)}`,
    severity,
    riskLabel,
    actionLevelText,
    recommendedDeadline: deadline,
    interpretation,
    breakdownRows: [
      ...obsRows,
      {
        parameter: 'Distribución por Categoría de Acción',
        value: `C1: ${cat1Pct.toFixed(1)}% | C2: ${cat2Pct.toFixed(1)}% | C3: ${cat3Pct.toFixed(1)}% | C4: ${cat4Pct.toFixed(1)}%`,
        reference: `Total: ${totalFreq} obs. · Índice ponderado: ${weightedIndex.toFixed(2)}`,
      },
    ],
    suggestedMeasures: suggestions,
    owasDistribution: {
      cat1Pct,
      cat2Pct,
      cat3Pct,
      cat4Pct,
      totalObs: totalFreq,
    },
  };
}

// ============================================================================
// 4. ECUACIÓN NIOSH REVISADA (Capítulo 5.3 - 5.5)
// ============================================================================
const NIOSH_FM_TABLE: { maxFreq: number; le_1h: number; '1_to_2h': number; '2_to_8h': number }[] = [
  { maxFreq: 0.2, le_1h: 1.0, '1_to_2h': 0.95, '2_to_8h': 0.85 },
  { maxFreq: 0.5, le_1h: 0.97, '1_to_2h': 0.92, '2_to_8h': 0.81 },
  { maxFreq: 1, le_1h: 0.94, '1_to_2h': 0.88, '2_to_8h': 0.75 },
  { maxFreq: 2, le_1h: 0.91, '1_to_2h': 0.84, '2_to_8h': 0.65 },
  { maxFreq: 3, le_1h: 0.88, '1_to_2h': 0.79, '2_to_8h': 0.55 },
  { maxFreq: 4, le_1h: 0.84, '1_to_2h': 0.72, '2_to_8h': 0.45 },
  { maxFreq: 5, le_1h: 0.8, '1_to_2h': 0.6, '2_to_8h': 0.35 },
  { maxFreq: 6, le_1h: 0.75, '1_to_2h': 0.5, '2_to_8h': 0.27 },
  { maxFreq: 7, le_1h: 0.7, '1_to_2h': 0.42, '2_to_8h': 0.22 },
  { maxFreq: 8, le_1h: 0.6, '1_to_2h': 0.35, '2_to_8h': 0.18 },
  { maxFreq: 9, le_1h: 0.52, '1_to_2h': 0.3, '2_to_8h': 0.0 },
  { maxFreq: 10, le_1h: 0.45, '1_to_2h': 0.26, '2_to_8h': 0.0 },
  { maxFreq: 11, le_1h: 0.41, '1_to_2h': 0.23, '2_to_8h': 0.0 },
  { maxFreq: 12, le_1h: 0.37, '1_to_2h': 0.21, '2_to_8h': 0.0 },
];

export function evaluateNiosh(data: NioshData): MethodEvaluationResult {
  const LC = getMethodParam(MethodId.NIOSH, 'LC', 23);
  const hOpt = getMethodParam(MethodId.NIOSH, 'hOpt', 25);
  const hMax = getMethodParam(MethodId.NIOSH, 'hMax', 63);
  const vOpt = getMethodParam(MethodId.NIOSH, 'vOpt', 75);
  const vMax = getMethodParam(MethodId.NIOSH, 'vMax', 175);
  const aMax = getMethodParam(MethodId.NIOSH, 'aMax', 135);

  const hWorst = data.evaluateDestination ? Math.max(data.hOriginCm, data.hDestCm) : data.hOriginCm;
  const hmDefault = hWorst <= hOpt ? 1.0 : hWorst > hMax ? 0 : hOpt / hWorst;
  const hm = evalMethodExpr(MethodId.NIOSH, 'hm', { H: hWorst, hOpt, hMax }, hmDefault);

  const vmOrigDef = data.vOriginCm < 0 || data.vOriginCm > vMax ? 0 : 1 - 0.003 * Math.abs(data.vOriginCm - vOpt);
  const vmDestDef = data.vDestCm < 0 || data.vDestCm > vMax ? 0 : 1 - 0.003 * Math.abs(data.vDestCm - vOpt);
  const vmOrigin = evalMethodExpr(MethodId.NIOSH, 'vm', { V: data.vOriginCm, vOpt, vMax }, vmOrigDef);
  const vmDest = evalMethodExpr(MethodId.NIOSH, 'vm', { V: data.vDestCm, vOpt, vMax }, vmDestDef);
  const vm = data.evaluateDestination ? Math.min(vmOrigin, vmDest) : vmOrigin;
  const vWorst = data.evaluateDestination && vmDest < vmOrigin ? data.vDestCm : data.vOriginCm;

  const d = Math.abs(data.vDestCm - data.vOriginCm);
  const dmDef = d < 25 ? 1.0 : d > 175 ? 0 : 0.82 + 4.5 / d;
  const dm = evalMethodExpr(MethodId.NIOSH, 'dm', { D: d }, dmDef);

  const aWorst = data.evaluateDestination ? Math.max(data.asymmetryOriginDeg, data.asymmetryDestDeg) : data.asymmetryOriginDeg;
  const amDef = aWorst >= aMax ? 0 : Math.max(0, 1 - 0.0032 * aWorst);
  const am = evalMethodExpr(MethodId.NIOSH, 'am', { A: aWorst, aMax }, amDef);

  const fmRow = NIOSH_FM_TABLE.find((r) => data.frequencyLiftsPerMin <= r.maxFreq);
  const fm = fmRow ? fmRow[data.durationCategory] : 0;

  let cm = 1.0;
  if (data.couplingQuality === 'bueno') cm = 1.0;
  else if (data.couplingQuality === 'regular') cm = vWorst < vOpt ? 0.95 : 1.0;
  else cm = 0.9;

  const hmR = Number(hm.toFixed(2));
  const vmR = Number(vm.toFixed(2));
  const dmR = Number(dm.toFixed(2));
  const amR = Number(am.toFixed(2));
  const fmR = Number(fm.toFixed(2));
  const cmR = Number(cm.toFixed(2));

  const rwl = evalMethodExpr(
    MethodId.NIOSH,
    'rwl',
    { LC, HM: hmR, VM: vmR, DM: dmR, AM: amR, FM: fmR, CM: cmR },
    LC * hmR * vmR * dmR * amR * fmR * cmR,
  );
  const il =
    rwl > 0
      ? evalMethodExpr(MethodId.NIOSH, 'il', { L: data.loadWeightKg, RWL: rwl }, data.loadWeightKg / rwl)
      : 99.9;

  const modLimit = getMethodParam(MethodId.NIOSH, 'modLimit', 1.0);
  const highLimit = getMethodParam(MethodId.NIOSH, 'highLimit', 2.0);
  const veryHighLimit = getMethodParam(MethodId.NIOSH, 'veryHighLimit', 3.0);

  let severity: RiskSeverity = 'bajo';
  let riskLabel = 'Riesgo bajo';
  let actionLevelText = `IL ≤ ${modLimit.toFixed(1)} — Dentro de límites recomendados`;
  let deadline: MethodEvaluationResult['recommendedDeadline'] = 'Sin plazo específico';
  let interpretation =
    `El Índice de Levantamiento es igual o inferior a ${modLimit.toFixed(1)}. La operación se encuentra dentro de los límites recomendados para la mayoría de los trabajadores.`;

  if (rwl <= 0 || il > veryHighLimit) {
    severity = 'muy_alto';
    riskLabel = 'Riesgo muy alto';
    actionLevelText = `IL > ${veryHighLimit.toFixed(1)} — Corrección inmediata`;
    deadline = 'Inmediato';
    interpretation =
      rwl <= 0
        ? 'Alguno de los factores multiplicadores es nulo (fuera del ámbito admisible de la ecuación). La operación es inaceptable y debe corregirse de inmediato.'
        : `El Índice de Levantamiento supera el valor de ${veryHighLimit.toFixed(1)}. La exposición es incompatible con la protección de la salud lumbar y exige intervención inmediata.`;
  } else if (il > highLimit) {
    severity = 'alto';
    riskLabel = 'Riesgo alto';
    actionLevelText = `${highLimit.toFixed(1)} < IL ≤ ${veryHighLimit.toFixed(1)} — Corrección a corto plazo`;
    deadline = 'Corto plazo';
    interpretation =
      `El Índice de Levantamiento se sitúa entre ${highLimit.toFixed(1)} y ${veryHighLimit.toFixed(1)}. Es necesario intervenir a corto plazo sobre el diseño geométrico del puesto y la organización del trabajo.`;
  } else if (il > modLimit) {
    severity = 'moderado';
    riskLabel = 'Riesgo moderado';
    actionLevelText = `${modLimit.toFixed(1)} < IL ≤ ${highLimit.toFixed(1)} — Requiere corrección programada`;
    deadline = 'Medio plazo';
    interpretation =
      `El Índice de Levantamiento supera ${modLimit.toFixed(1)} (hasta ${highLimit.toFixed(1)}). Se recomienda modificar las condiciones de manipulación para descender el índice.`;
  }

  const suggestions: string[] = [];
  if (hmR < 0.8) suggestions.push(`Reducir la distancia horizontal H (${hWorst} cm) acercando la carga al cuerpo y eliminando barreras físicas.`);
  if (fmR < 0.75) suggestions.push('Disminuir la frecuencia de levantamientos por minuto o rotar personal para reducir la duración de exposición.');
  if (vmR < 0.9) suggestions.push(`Adecuar la altura vertical (${vWorst} cm) empleando mesas elevadoras o plataformas próximas a ${vOpt} cm.`);
  if (amR < 0.95) suggestions.push(`Eliminar el giro de tronco (${aWorst}°) reubicando origen/destino para operar en el plano sagital.`);
  if (cmR < 1.0) suggestions.push('Incorporar asas o asideros anatómicos en los envases para asegurar un agarre firme.');
  if (il > modLimit) suggestions.push('Evaluar la incorporación de ayudas mecánicas (aparejos, carros elevadores) o reducir la masa unitaria.');
  if (suggestions.length === 0) suggestions.push('Mantener la carga próxima al eje corporal y capacitar en técnica de levantamiento con piernas.');

  const deltaV = Math.round((data.vDestCm - data.vOriginCm) * 10) / 10;
  const trajectoryLabel =
    deltaV >= 10
      ? `Levantamiento ascendente (nivel bajo ${data.vOriginCm} cm → estantería/plano alto ${data.vDestCm} cm)`
      : deltaV <= -10
        ? `Descenso de carga (altura superior ${data.vOriginCm} cm → altura menor ${data.vDestCm} cm)`
        : `Traslado horizontal / nivel similar (${data.vOriginCm} cm ↔ ${data.vDestCm} cm)`;

  const reversibleNote =
    'Nota metodológica: el punto de origen puede actuar también como destino en ciclos reversibles (estiba/desestiba); se adopta el RWL más restrictivo entre ambos extremos.';

  const loss = (f: number) => `Pérdida de capacidad: ${Math.round((1 - f) * 100)}%`;

  const meta = METHOD_CATALOG.find((m) => m.id === MethodId.NIOSH)!;
  return {
    methodId: MethodId.NIOSH,
    methodName: meta.fullName,
    category: meta.category,
    categoryLabel: meta.categoryLabel,
    hierarchyOrder: meta.hierarchyOrder,
    primaryScoreText: rwl > 0 ? `IL = ${il.toFixed(2)}` : 'Fuera límite',
    secondaryScoreText: `Peso: ${data.loadWeightKg} kg · RWL: ${rwl.toFixed(2)} kg`,
    severity,
    riskLabel,
    actionLevelText,
    recommendedDeadline: deadline,
    interpretation: `${interpretation} Sentido evaluado: ${trajectoryLabel}. ${reversibleNote}`,
    breakdownRows: [
      {
        parameter: 'Sentido Cinemático (Origen ↔ Destino)',
        value: trajectoryLabel,
        reference: 'Origen y destino intercambiables en ciclo reversible',
      },
      { parameter: 'Constante de Carga (LC)', value: `${LC.toFixed(2)} kg`, reference: 'Condiciones ideales' },
      { parameter: `Factor Horizontal HM (H = ${hWorst} cm)`, value: hmR.toFixed(2), reference: loss(hmR) },
      { parameter: `Factor Vertical VM (V crít. = ${vWorst} cm)`, value: vmR.toFixed(2), reference: `${loss(vmR)} (Orig ${data.vOriginCm} / Dest ${data.vDestCm} cm)` },
      { parameter: `Factor Desplazamiento DM (D = ${d} cm)`, value: dmR.toFixed(2), reference: loss(dmR) },
      { parameter: `Factor Asimetría AM (A = ${aWorst}°)`, value: amR.toFixed(2), reference: loss(amR) },
      { parameter: `Factor Frecuencia FM (${data.frequencyLiftsPerMin} lev/min)`, value: fmR.toFixed(2), reference: loss(fmR) },
      { parameter: `Factor Agarre CM (${data.couplingQuality})`, value: cmR.toFixed(2), reference: loss(cmR) },
      { parameter: 'Límite de Peso Recomendado (RWL)', value: `${rwl.toFixed(2)} kg`, reference: `Peso real: ${data.loadWeightKg} kg` },
      { parameter: 'Índice de Levantamiento (IL)', value: rwl > 0 ? il.toFixed(2) : 'Inadmisible (RWL = 0)', reference: actionLevelText },
    ],
    suggestedMeasures: suggestions,
  };
}

// ============================================================================
// 5. TABLAS DE SNOOK Y CIRIELLO (Capítulo 5.9 - Tablas 5.11 a 5.16)
// ============================================================================
const SNOOK_FREQS = [0.2, 0.5, 1, 2, 3, 4, 5, 6, 8];
const SNOOK_LIFT_MALE: Record<SnookData['liftHeightZone'], number[]> = {
  sobre_cabeza: [11, 10, 9, 8, 7, 6, 6, 5, 4],
  hombros: [17, 16, 15, 14, 13, 12, 11, 10, 8],
  rodillas_o_inferior: [16, 15, 14, 13, 12, 11, 10, 9, 8],
};
const SNOOK_LIFT_FEMALE: Record<SnookData['liftHeightZone'], number[]> = {
  sobre_cabeza: [7, 7, 6, 5, 5, 4, 4, 3, 3],
  hombros: [11, 11, 10, 9, 8, 8, 7, 6, 5],
  rodillas_o_inferior: [11, 10, 10, 9, 8, 7, 7, 6, 6],
};
const SNOOK_KG_MIN_LIMIT: Record<SnookData['liftHeightZone'], { masculina: number; femenina: number }> = {
  sobre_cabeza: { masculina: 70, femenina: 40 },
  hombros: { masculina: 180, femenina: 110 },
  rodillas_o_inferior: { masculina: 160, femenina: 90 },
};

export function evaluateSnook(data: SnookData): MethodEvaluationResult {
  const meta = METHOD_CATALOG.find((m) => m.id === MethodId.SNOOK)!;
  const modLimit = getMethodParam(MethodId.SNOOK, 'modLimit', 1.0);
  const highLimit = getMethodParam(MethodId.SNOOK, 'highLimit', 1.25);
  const veryHighLimit = getMethodParam(MethodId.SNOOK, 'veryHighLimit', 1.5);

  if (data.operationType === 'levantamiento') {
    const fIdx = Math.max(0, SNOOK_FREQS.indexOf(data.liftFrequencyPerMin));
    const maxWeight =
      data.population === 'masculina'
        ? SNOOK_LIFT_MALE[data.liftHeightZone][fIdx]
        : SNOOK_LIFT_FEMALE[data.liftHeightZone][fIdx];
    const kgPerMin = evalMethodExpr(
      MethodId.SNOOK,
      'kgPerMin',
      { actualWeight: data.actualWeightKg, freq: data.liftFrequencyPerMin },
      data.actualWeightKg * data.liftFrequencyPerMin,
    );
    const maxKgMin = SNOOK_KG_MIN_LIMIT[data.liftHeightZone][data.population];
    const ratioUnit = data.actualWeightKg / maxWeight;
    const ratioAccum = kgPerMin / maxKgMin;
    const worstRatio = evalMethodExpr(
      MethodId.SNOOK,
      'liftRatio',
      { actualWeight: data.actualWeightKg, maxWeight, kgPerMin, maxKgMin },
      Math.max(ratioUnit, ratioAccum),
    );

    const severity: RiskSeverity =
      worstRatio <= modLimit ? 'bajo' : worstRatio <= highLimit ? 'moderado' : worstRatio <= veryHighLimit ? 'alto' : 'muy_alto';
    const deadline: MethodEvaluationResult['recommendedDeadline'] =
      severity === 'bajo' ? 'Sin plazo específico' : severity === 'moderado' ? 'Medio plazo' : severity === 'alto' ? 'Corto plazo' : 'Inmediato';

    return {
      methodId: MethodId.SNOOK,
      methodName: meta.fullName,
      category: meta.category,
      categoryLabel: meta.categoryLabel,
      hierarchyOrder: meta.hierarchyOrder,
      primaryScoreText: `${data.actualWeightKg} / ${maxWeight} kg`,
      secondaryScoreText: `Acumulado: ${kgPerMin.toFixed(1)} / ${maxKgMin} kg/min`,
      severity,
      riskLabel: worstRatio <= modLimit ? 'Operación admisible' : 'Supera peso máximo aceptable',
      actionLevelText: worstRatio <= modLimit ? 'Dentro del límite Snook y Ciriello' : `Razón exigencia = ${worstRatio.toFixed(2)}`,
      recommendedDeadline: deadline,
      interpretation:
        worstRatio <= modLimit
          ? 'Tanto el peso unitario como la masa acumulada por minuto se mantienen dentro de los valores aceptables tabulados.'
          : 'Se supera el límite psicofísico aceptable (por peso unitario o exigencia acumulada en kg/min), requiriendo rediseño de altura, frecuencia o masa.',
      breakdownRows: [
        { parameter: 'Modalidad evaluada', value: `Levantamiento (Población ${data.population})`, reference: 'Tablas 5.11 a 5.13' },
        { parameter: 'Peso real vs. Máximo aceptable', value: `${data.actualWeightKg} kg vs. ${maxWeight} kg`, reference: `Índice: ${ratioUnit.toFixed(2)}` },
        { parameter: 'Exigencia acumulada (kg/min)', value: `${kgPerMin.toFixed(1)} kg/min vs. ${maxKgMin} kg/min`, reference: `Índice combinado: ${worstRatio.toFixed(2)}` },
      ],
      suggestedMeasures:
        worstRatio <= modLimit
          ? ['Mantener condiciones actuales de agarre, iluminación y superficie de tránsito.']
          : [
              'Modificar la altura de toma hacia la zona media (entre rodillas y hombros).',
              'Disminuir el peso unitario o reducir la cadencia por minuto.',
              'Incorporar medios mecánicos de asistencia para el levantamiento.',
            ],
    };
  }

  if (data.operationType === 'empuje' || data.operationType === 'traccion') {
    const pushTable: Record<SnookData['handHeightZone'], { '2m': [number, number]; '60m': [number, number] }> = {
      hombros: { '2m': [370, 240], '60m': [200, 130] },
      codo: { '2m': [390, 250], '60m': [220, 140] },
      pies: { '2m': [280, 180], '60m': [160, 100] },
    };
    const pullTable: Record<SnookData['handHeightZone'], { '2m': [number, number]; '60m': [number, number] }> = {
      hombros: { '2m': [360, 230], '60m': [190, 120] },
      codo: { '2m': [380, 240], '60m': [210, 130] },
      pies: { '2m': [260, 170], '60m': [150, 90] },
    };
    const baseLimits = (data.operationType === 'empuje' ? pushTable : pullTable)[data.handHeightZone][data.pushPullDistance];
    const femFactor = data.population === 'femenina' ? getMethodParam(MethodId.SNOOK, 'femFactor', 0.72) : 1.0;
    const maxInit = Math.round(baseLimits[0] * femFactor);
    const maxSust = Math.round(baseLimits[1] * femFactor);

    const ratioInit = data.actualInitialForceN / Math.max(1, maxInit);
    const ratioSust = data.actualSustainedForceN / Math.max(1, maxSust);
    const worst = evalMethodExpr(
      MethodId.SNOOK,
      'pushPullRatio',
      {
        actualInit: data.actualInitialForceN,
        maxInit: Math.max(1, maxInit),
        actualSust: data.actualSustainedForceN,
        maxSust: Math.max(1, maxSust),
      },
      Math.max(ratioInit, ratioSust),
    );
    const severity: RiskSeverity = worst <= modLimit ? 'bajo' : worst <= highLimit ? 'moderado' : worst <= veryHighLimit ? 'alto' : 'muy_alto';

    return {
      methodId: MethodId.SNOOK,
      methodName: meta.fullName,
      category: meta.category,
      categoryLabel: meta.categoryLabel,
      hierarchyOrder: meta.hierarchyOrder,
      primaryScoreText: `${data.actualInitialForceN} / ${maxInit} N`,
      secondaryScoreText: `Mantenimiento: ${data.actualSustainedForceN} / ${maxSust} N`,
      severity,
      riskLabel: worst <= modLimit ? 'Fuerzas admisibles' : 'Supera fuerza máxima aceptable',
      actionLevelText: worst <= modLimit ? 'Dentro de límites de empuje/tracción' : 'Requiere reducción de esfuerzo dinámico',
      recommendedDeadline:
        severity === 'bajo' ? 'Sin plazo específico' : severity === 'moderado' ? 'Medio plazo' : severity === 'alto' ? 'Corto plazo' : 'Inmediato',
      interpretation:
        worst <= modLimit
          ? 'Tanto la fuerza inicial de arranque como la fuerza sostenida se encuentran por debajo de los límites máximos aceptables.'
          : 'Las fuerzas medidas con dinamómetro superan los valores aceptables tabulados para la altura de manos y distancia evaluadas.',
      breakdownRows: [
        { parameter: 'Acción evaluada', value: `${data.operationType.toUpperCase()} (${data.pushPullDistance})`, reference: `Altura manos: ${data.handHeightZone}` },
        { parameter: 'Fuerza de arranque (N)', value: `${data.actualInitialForceN} N vs. máx. ${maxInit} N`, reference: `Relación: ${ratioInit.toFixed(2)}` },
        { parameter: 'Fuerza de mantenimiento (N)', value: `${data.actualSustainedForceN} N vs. máx. ${maxSust} N`, reference: `Relación combinada: ${worst.toFixed(2)}` },
      ],
      suggestedMeasures: [
        'Verificar el estado de rodamientos, ruedas de mayor diámetro y nivelación del pavimento.',
        'Ubicar la empuñadura del carro a la altura del codo (zona de máxima eficiencia biomecánica).',
        'Priorizar el empuje frente a la tracción e incorporar carros motorizados si las fuerzas persisten elevadas.',
      ],
    };
  }

  // Transporte (Tabla 5.16)
  const carryLimits: Record<SnookData['carryDistance'], { masculina: number; femenina: number }> = {
    hasta_2m: { masculina: 33, femenina: 20 },
    '2_a_10m': { masculina: 27, femenina: 16 },
    mas_10m: { masculina: 23, femenina: 14 },
  };
  const maxCarry = carryLimits[data.carryDistance][data.population];
  const ratio = evalMethodExpr(
    MethodId.SNOOK,
    'carryRatio',
    { actualWeight: data.actualWeightKg, maxCarry },
    data.actualWeightKg / maxCarry,
  );
  const severity: RiskSeverity = ratio <= modLimit ? 'bajo' : ratio <= highLimit ? 'moderado' : ratio <= veryHighLimit ? 'alto' : 'muy_alto';

  return {
    methodId: MethodId.SNOOK,
    methodName: meta.fullName,
    category: meta.category,
    categoryLabel: meta.categoryLabel,
    hierarchyOrder: meta.hierarchyOrder,
    primaryScoreText: `${data.actualWeightKg} / ${maxCarry} kg`,
    secondaryScoreText: `Transporte (${data.carryDistance.replace(/_/g, ' ')})`,
    severity,
    riskLabel: ratio <= 1 ? 'Transporte admisible' : 'Supera peso admisible de transporte',
    actionLevelText: ratio <= 1 ? 'Dentro de Tabla 5.16' : 'Excede peso máximo de transporte',
    recommendedDeadline:
      severity === 'bajo' ? 'Sin plazo específico' : severity === 'moderado' ? 'Medio plazo' : severity === 'alto' ? 'Corto plazo' : 'Inmediato',
    interpretation:
      ratio <= 1
        ? 'El peso transportado no supera el valor máximo aceptable para la distancia recorrida.'
        : 'El peso transportado excede el valor máximo aceptable de la Tabla 5.16, incrementando la fatiga estática de tronco y miembros.',
    breakdownRows: [
      { parameter: 'Modalidad', value: `Transporte horizontal (${data.population})`, reference: 'Tabla 5.16' },
      { parameter: 'Peso transportado vs. Límite', value: `${data.actualWeightKg} kg vs. ${maxCarry} kg`, reference: `Índice: ${ratio.toFixed(2)}` },
    ],
    suggestedMeasures: [
      'Acortar el recorrido de transporte o emplear carros/cintas transportadoras.',
      'Fraccionar el peso unitario de los bultos trasladados.',
    ],
  };
}

// ============================================================================
// 6. LMC RESOLUCIÓN 295/03 (Informe pág. 18-20)
// ============================================================================
const LMC_TABLES: Record<1 | 2 | 3, Record<Lmc295Data['verticalZone'], Record<Lmc295Data['horizontalZone'], number | null>>> = {
  1: {
    sobre_hombro: { proximo_30: 16, intermedio_30_60: 7, alejado_60_80: null },
    nudillos_a_hombro: { proximo_30: 32, intermedio_30_60: 16, alejado_60_80: 9 },
    espinilla_a_nudillos: { proximo_30: 18, intermedio_30_60: 11, alejado_60_80: 7 },
    suelo_a_espinilla: { proximo_30: 14, intermedio_30_60: null, alejado_60_80: null },
  },
  2: {
    sobre_hombro: { proximo_30: 14, intermedio_30_60: 5, alejado_60_80: null },
    nudillos_a_hombro: { proximo_30: 27, intermedio_30_60: 14, alejado_60_80: 7 },
    espinilla_a_nudillos: { proximo_30: 16, intermedio_30_60: 11, alejado_60_80: 5 },
    suelo_a_espinilla: { proximo_30: 14, intermedio_30_60: null, alejado_60_80: null },
  },
  3: {
    sobre_hombro: { proximo_30: 11, intermedio_30_60: null, alejado_60_80: null },
    nudillos_a_hombro: { proximo_30: 14, intermedio_30_60: 9, alejado_60_80: 5 },
    espinilla_a_nudillos: { proximo_30: 9, intermedio_30_60: 7, alejado_60_80: 5 },
    suelo_a_espinilla: { proximo_30: null, intermedio_30_60: null, alejado_60_80: null },
  },
};

export function evaluateLmc295(data: Lmc295Data): MethodEvaluationResult {
  const maxLiftsPerHour = getMethodParam(MethodId.LMC_295, 'maxLiftsPerHour', 360);
  const precautionRatio = getMethodParam(MethodId.LMC_295, 'precautionRatio', 0.85);
  const criticalRatio = getMethodParam(MethodId.LMC_295, 'criticalRatio', 1.3);

  let selectedTable: 1 | 2 | 3 | null = 1;
  if (data.liftsPerHour > maxLiftsPerHour) {
    selectedTable = null;
  } else if (data.durationHours === 'hasta_2h') {
    selectedTable = data.liftsPerHour <= 60 ? 1 : 2;
  } else {
    if (data.liftsPerHour <= 12) selectedTable = 1;
    else if (data.liftsPerHour <= 30) selectedTable = 2;
    else selectedTable = 3;
  }

  const limitKg = selectedTable ? LMC_TABLES[selectedTable][data.verticalZone][data.horizontalZone] : null;
  const aggravating = [
    data.asymmetryOver30Deg && 'Asimetría > 30° del plano sagital',
    data.oneHandedLift && 'Levantamiento con una sola mano',
    data.constrainedCrouchedPosture && 'Postura agachada/arrodillada obligada',
    data.poorCoupling && 'Sujeción deficiente (sin asas)',
    data.unstableLoadOrFooting && 'Objeto inestable o inestabilidad de pies',
    data.highHeatHumidity && 'Calor y humedad elevados',
  ].filter(Boolean) as string[];

  const weightRatio =
    limitKg !== null && limitKg > 0
      ? evalMethodExpr(
          MethodId.LMC_295,
          'weightRatio',
          { actualWeight: data.actualWeightKg, limitKg, aggravatingCount: aggravating.length },
          data.actualWeightKg / limitKg,
        )
      : 99.9;

  let severity: RiskSeverity = 'bajo';
  let riskLabel = 'Aceptable';
  let actionLevelText = 'Debajo del Valor Límite Umbral';
  let deadline: MethodEvaluationResult['recommendedDeadline'] = 'Sin plazo específico';

  if (limitKg === null) {
    severity = 'muy_alto';
    riskLabel = 'Sin límite seguro conocido';
    actionLevelText = 'Zona sin límite seguro para levantamientos repetidos';
    deadline = 'Inmediato';
  } else if (weightRatio > 1.0) {
    severity = weightRatio > criticalRatio ? 'muy_alto' : 'alto';
    riskLabel = 'No Aceptable — Supera VLU';
    actionLevelText = `Peso real (${data.actualWeightKg} kg) > Límite (${limitKg} kg) · R=${weightRatio.toFixed(2)}`;
    deadline = severity === 'muy_alto' ? 'Inmediato' : 'Corto plazo';
  } else if (aggravating.length > 0 || weightRatio > precautionRatio) {
    severity = 'moderado';
    riskLabel = 'Aceptable con precaución';
    actionLevelText = 'Próximo al límite o con factores agravantes presentes';
    deadline = 'Medio plazo';
  }

  const meta = METHOD_CATALOG.find((m) => m.id === MethodId.LMC_295)!;
  return {
    methodId: MethodId.LMC_295,
    methodName: meta.fullName,
    category: meta.category,
    categoryLabel: meta.categoryLabel,
    hierarchyOrder: meta.hierarchyOrder,
    primaryScoreText: limitKg !== null ? `${data.actualWeightKg} / ${limitKg} kg` : 'Sin límite seguro',
    secondaryScoreText: selectedTable ? `Tabla ${selectedTable} · ${data.liftsPerHour} lev/h` : '> 360 lev/h',
    severity,
    riskLabel,
    actionLevelText,
    recommendedDeadline: deadline,
    interpretation:
      limitKg === null
        ? 'No se conoce límite seguro para levantamientos repetidos en la combinación geométrica/frecuencial seleccionada.'
        : data.actualWeightKg <= limitKg
          ? `El peso real del objeto (${data.actualWeightKg} kg) no supera el valor límite obtenido de la Tabla ${selectedTable} (${limitKg} kg).${aggravating.length ? ' Se advierten factores agravantes que exigen reducir el peso por debajo del valor recomendado.' : ''}`
          : `El peso real (${data.actualWeightKg} kg) excede el Valor Límite Umbral (${limitKg} kg) de la Resolución 295/03. Deben implantarse controles de ingeniería u organizativos.`,
    breakdownRows: [
      { parameter: 'Tabla seleccionada', value: selectedTable ? `Tabla ${selectedTable}` : 'Excede 360 lev/h', reference: `${data.durationHours === 'hasta_2h' ? '≤ 2 hs/día' : '> 2 hs/día'} · ${data.liftsPerHour} lev/h` },
      { parameter: 'Alturas inicio / destino', value: `${data.originHeightCm} cm → ${data.destHeightCm} cm`, reference: data.verticalZone.replace(/_/g, ' ') },
      { parameter: 'Valor límite de tabla vs. Peso real', value: limitKg !== null ? `${limitKg} kg vs. ${data.actualWeightKg} kg` : `Sin límite seguro vs. ${data.actualWeightKg} kg`, reference: riskLabel },
      { parameter: 'Factores agravantes presentes', value: aggravating.length > 0 ? aggravating.join('; ') : 'Ninguno (plano neutro < 30°)', reference: 'Res. 295/03 Anexo I' },
    ],
    suggestedMeasures:
      severity === 'bajo'
        ? ['Asegurar que la elevación no sobrepase la altura de los hombros y utilizar carro auxiliar para traslados largos.']
        : [
            'Acercar la carga a menos de 30 cm del punto medio entre tobillos y ubicarla entre nudillos y hombros.',
            'Incorporar carro de transporte o ayuda mecánica y suprimir giros mayores a 30°.',
          ],
  };
}

// ============================================================================
// 7. MÉTODO OCRA — ANÁLISIS COMPLETO (Capítulo 6.2 y 6.5)
// ============================================================================
export function evaluateOcraCompleto(data: OcraCompletoData): MethodEvaluationResult {
  const cycleSec = Math.max(1, data.cycleDurationSec);
  const CF = getMethodParam(MethodId.OCRA_COMPLETO, 'CF', 30);
  const modLimit = getMethodParam(MethodId.OCRA_COMPLETO, 'modLimit', 2.2);
  const highLimit = getMethodParam(MethodId.OCRA_COMPLETO, 'highLimit', 3.5);
  const veryHighLimit = getMethodParam(MethodId.OCRA_COMPLETO, 'veryHighLimit', 4.5);

  const frequencyPerMin = evalMethodExpr(
    MethodId.OCRA_COMPLETO,
    'freqPerMin',
    { actionsPerCycle: data.actionsPerCycle, cycleSec },
    (data.actionsPerCycle / cycleSec) * 60,
  );
  const ataPerformed = evalMethodExpr(
    MethodId.OCRA_COMPLETO,
    'ataPerformed',
    { freqPerMin: frequencyPerMin, netMin: data.netRepetitiveMinutes },
    frequencyPerMin * data.netRepetitiveMinutes,
  );
  const ataRefPerMin = evalMethodExpr(
    MethodId.OCRA_COMPLETO,
    'ataRefPerMin',
    {
      CF,
      Fm: data.fmForce,
      Fp: data.fpPosture,
      Ff: data.ffRepetitiveness,
      Fe: data.feStereotypy,
      Fa: data.faPhysicalAgents,
      Ft: data.ftRecovery,
      Fc: data.fcDuration,
    },
    CF *
      data.fmForce *
      data.fpPosture *
      data.ffRepetitiveness *
      data.feStereotypy *
      data.faPhysicalAgents *
      data.ftRecovery *
      data.fcDuration,
  );
  const ataReference = ataRefPerMin * data.netRepetitiveMinutes;
  const ocraIndex =
    ataReference > 0
      ? evalMethodExpr(
          MethodId.OCRA_COMPLETO,
          'ocraIndex',
          { ataPerformed, ataRefPerMin, netMin: data.netRepetitiveMinutes },
          ataPerformed / ataReference,
        )
      : 99.9;

  let severity: RiskSeverity = 'bajo';
  let riskLabel = 'Riesgo aceptable';
  let actionLevelText = `Índice ≤ ${modLimit.toFixed(1)} — Exposición admisible`;
  let deadline: MethodEvaluationResult['recommendedDeadline'] = 'Sin plazo específico';

  if (ocraIndex > veryHighLimit) {
    severity = 'muy_alto';
    riskLabel = 'Riesgo muy alto';
    actionLevelText = `Índice > ${veryHighLimit.toFixed(1)} — Reducción inmediata`;
    deadline = 'Inmediato';
  } else if (ocraIndex > highLimit) {
    severity = 'alto';
    riskLabel = 'Riesgo alto';
    actionLevelText = `Índice ${highLimit.toFixed(1)} a ${veryHighLimit.toFixed(1)} — Reducción a corto plazo`;
    deadline = 'Corto plazo';
  } else if (ocraIndex > modLimit) {
    severity = 'moderado';
    riskLabel = 'Riesgo límite / leve';
    actionLevelText = `Índice ${modLimit.toFixed(1)} a ${highLimit.toFixed(1)} — Revisión organizativa y pausas`;
    deadline = 'Medio plazo';
  }

  const meta = METHOD_CATALOG.find((m) => m.id === MethodId.OCRA_COMPLETO)!;
  return {
    methodId: MethodId.OCRA_COMPLETO,
    methodName: meta.fullName,
    category: meta.category,
    categoryLabel: meta.categoryLabel,
    hierarchyOrder: meta.hierarchyOrder,
    primaryScoreText: `OCRA = ${ocraIndex.toFixed(1)}`,
    secondaryScoreText: `${Math.round(ataPerformed)} / ${Math.round(ataReference)} ATA`,
    severity,
    riskLabel,
    actionLevelText,
    recommendedDeadline: deadline,
    interpretation:
      ocraIndex <= modLimit
        ? `El índice de exposición OCRA se mantiene hasta ${modLimit.toFixed(1)} (Tabla 6.10). La exposición repetitiva resulta aceptable.`
        : `El trabajador efectúa ${ocraIndex.toFixed(1)} veces las acciones técnicas recomendadas para estas condiciones. Se requiere actuar sobre pausas, frecuencia y posturas.`,
    breakdownRows: [
      { parameter: 'Frecuencia de acciones técnicas', value: `${frequencyPerMin.toFixed(1)} acciones/min`, reference: `${data.actionsPerCycle} acc. / ${cycleSec}s` },
      { parameter: 'Acciones realizadas (ATA)', value: `${Math.round(ataPerformed).toLocaleString('es-AR')} acciones`, reference: `${data.netRepetitiveMinutes} min netos` },
      {
        parameter: 'Multiplicadores (Fm·Fp·Ff·Fe·Fa·Ft·Fc)',
        value: `${data.fmForce} × ${data.fpPosture} × ${data.ffRepetitiveness} × ${data.feStereotypy} × ${data.faPhysicalAgents} × ${data.ftRecovery} × ${data.fcDuration}`,
        reference: `${ataRefPerMin.toFixed(2)} acc/min ref.`,
      },
      { parameter: 'Acciones de referencia (ATA ref)', value: `${Math.round(ataReference).toLocaleString('es-AR')} acciones`, reference: `Constante base ${CF} acc/min` },
      { parameter: 'Índice de Exposición OCRA', value: ocraIndex.toFixed(2), reference: actionLevelText },
    ],
    suggestedMeasures: [
      'Distribuir pausas de recuperación de 8-10 minutos cada hora y establecer rotación entre puestos.',
      'Ampliar la duración del ciclo o repartir las acciones técnicas para disminuir la cadencia por minuto.',
      'Mejorar la orientación de la superficie de trabajo y empuñaduras para acercar muñeca, codo y hombro a posición neutra.',
    ],
  };
}

// ============================================================================
// 8. LISTA DE VERIFICACIÓN OCRA / CHECK LIST (Cap. 6.3 + Ficha Bilateral)
// ============================================================================
function getDurationMultiplierClassic(netMin: number): number {
  if (netMin <= 120) return 0.5;
  if (netMin <= 180) return 0.65;
  if (netMin <= 240) return 0.75;
  if (netMin <= 300) return 0.85;
  if (netMin <= 360) return 0.925;
  if (netMin <= 420) return 0.95;
  if (netMin <= 480) return 1.0;
  return 1.2;
}

export function evaluateOcraChecklist(data: OcraChecklistData): MethodEvaluationResult {
  const meta = METHOD_CATALOG.find((m) => m.id === MethodId.OCRA_CHECKLIST)!;
  const CF = getMethodParam(MethodId.OCRA_CHECKLIST, 'CF', 30);

  if (data.mode === 'libro_coeficientes') {
    const cycleSec = Math.max(1, data.cycleDurationSec);
    const freq = (data.actionsPerCycle / cycleSec) * 60;
    const ataReal = freq * data.netRepetitiveMinutes;
    const ataRefMin =
      CF *
      data.coefRecovery *
      data.coefFrequency *
      data.coefForce *
      data.coefPosture *
      data.coefComplementary *
      data.coefStereotypy *
      data.coefDuration;
    const ataRef = ataRefMin * data.netRepetitiveMinutes;
    const estIndex =
      ataRef > 0
        ? evalMethodExpr(
            MethodId.OCRA_CHECKLIST,
            'estIndexCoef',
            {
              actionsPerCycle: data.actionsPerCycle,
              cycleSec,
              CF,
              coefRec: data.coefRecovery,
              coefFreq: data.coefFrequency,
              coefForce: data.coefForce,
              coefPost: data.coefPosture,
              coefComp: data.coefComplementary,
              coefStereo: data.coefStereotypy,
              coefDur: data.coefDuration,
            },
            ataReal / ataRef,
          )
        : 99.9;

    const severity: RiskSeverity =
      estIndex <= 2.2 ? 'bajo' : estIndex <= 3.5 ? 'moderado' : estIndex <= 4.5 ? 'alto' : 'muy_alto';

    return {
      methodId: MethodId.OCRA_CHECKLIST,
      methodName: meta.fullName,
      category: meta.category,
      categoryLabel: meta.categoryLabel,
      hierarchyOrder: meta.hierarchyOrder,
      primaryScoreText: `Est. = ${estIndex.toFixed(2)}`,
      secondaryScoreText: `${freq.toFixed(1)} acc/min · Modo Coeficientes (Cap. 6.3)`,
      severity,
      riskLabel: estIndex <= 2.2 ? 'Riesgo aceptable' : estIndex <= 3.5 ? 'Riesgo límite' : estIndex <= 4.5 ? 'Riesgo alto' : 'Riesgo muy alto',
      actionLevelText: estIndex <= 2.2 ? '≤ 2,2 Aceptable' : 'Supera umbral 2,2 — Aplicar OCRA Completo y corregir',
      recommendedDeadline:
        severity === 'bajo' ? 'Sin plazo específico' : severity === 'moderado' ? 'Medio plazo' : severity === 'alto' ? 'Corto plazo' : 'Inmediato',
      interpretation:
        estIndex <= 2.2
          ? 'El índice estimado por lista de verificación es ≤ 2,2. El riesgo repetitivo puede considerarse aceptable.'
          : 'El índice estimado supera 2,2. Conforme al apartado 6.3.4, se requiere profundizar con análisis OCRA completo e implantar mejoras.',
      breakdownRows: [
        { parameter: 'Acciones realizadas', value: `${Math.round(ataReal)} ATA`, reference: `${freq.toFixed(1)} acc/min × ${data.netRepetitiveMinutes} min` },
        {
          parameter: 'Coeficientes (Rec·Frec·Fza·Post·Comp·Est·Dur)',
          value: `${data.coefRecovery} × ${data.coefFrequency} × ${data.coefForce} × ${data.coefPosture} × ${data.coefComplementary} × ${data.coefStereotypy} × ${data.coefDuration}`,
          reference: `Tablas 6.12 a 6.17 (CF=${CF})`,
        },
        { parameter: 'Índice OCRA Estimado', value: estIndex.toFixed(2), reference: 'Corte admisible: 2,2' },
      ],
      suggestedMeasures: [
        'Reorganizar el régimen de pausas horarias y reducir la estereotipia mediante rotación.',
        'Disminuir posturas forzadas de hombro (>80°), codo (>60°) y muñeca (>45°).',
      ],
    };
  }

  // Modo Clásico Bilateral (Fichas 1 a 6 del Informe PDF)
  const netRepMin = evalMethodExpr(
    MethodId.OCRA_CHECKLIST,
    'netRepMin',
    {
      shiftMin: data.shiftMinutes,
      breaksMin: data.officialBreaksMinutes,
      lunchMin: data.lunchBreakMinutes,
      nonRepMin: data.nonRepetitiveMinutes,
    },
    Math.max(0, data.shiftMinutes - data.officialBreaksMinutes - data.lunchBreakMinutes - data.nonRepetitiveMinutes),
  );
  const fd = getDurationMultiplierClassic(netRepMin);

  const calcSide = (s: OcraChecklistSide) => {
    const postureMax = Math.max(s.shoulderScore, s.elbowScore, s.wristScore, s.handGripScore) + s.stereotypyScore;
    const comp = s.complementaryPhysicalScore + s.complementaryOrganizationalScore;
    const raw = data.recoveryFactorScore + s.frequencyFactor + s.forceFactor + postureMax + comp;
    const computedIcl = evalMethodExpr(
      MethodId.OCRA_CHECKLIST,
      'iclSide',
      {
        FR: data.recoveryFactorScore,
        FF: s.frequencyFactor,
        FFz: s.forceFactor,
        FP: postureMax,
        FC: comp,
        FD: fd,
      },
      raw * fd,
    );
    return { postureMax, comp, index: Number(computedIcl.toFixed(2)) };
  };

  const rRes = calcSide(data.right);
  const lRes = calcSide(data.left);
  const maxIdx = Math.max(rRes.index, lRes.index);

  const greenLimit = getMethodParam(MethodId.OCRA_CHECKLIST, 'greenLimit', 7.5);
  const yellowLimit = getMethodParam(MethodId.OCRA_CHECKLIST, 'yellowLimit', 11.0);
  const redLightLimit = getMethodParam(MethodId.OCRA_CHECKLIST, 'redLightLimit', 14.0);
  const redMedLimit = getMethodParam(MethodId.OCRA_CHECKLIST, 'redMedLimit', 22.5);

  let severity: RiskSeverity = 'bajo';
  let riskLabel = 'Aceptable (Verde)';
  let actionLevelText = `Hasta ${greenLimit.toFixed(1)} — Riesgo aceptable`;
  let deadline: MethodEvaluationResult['recommendedDeadline'] = 'Sin plazo específico';

  if (maxIdx > redMedLimit) {
    severity = 'muy_alto';
    riskLabel = 'No aceptable: Nivel Alto (Morado)';
    actionLevelText = `> ${redMedLimit.toFixed(1)} — Mejora urgente del puesto y supervisión médica`;
    deadline = 'Inmediato';
  } else if (maxIdx > redLightLimit) {
    severity = 'alto';
    riskLabel = 'No aceptable: Nivel Medio (Rojo intenso)';
    actionLevelText = `${redLightLimit.toFixed(1)} a ${redMedLimit.toFixed(1)} — Mejora del puesto, supervisión y entrenamiento`;
    deadline = 'Corto plazo';
  } else if (maxIdx > yellowLimit) {
    severity = 'moderado';
    riskLabel = 'No aceptable: Nivel Leve (Rojo suave)';
    actionLevelText = `${yellowLimit.toFixed(1)} a ${redLightLimit.toFixed(1)} — Mejora del puesto y supervisión`;
    deadline = 'Medio plazo';
  } else if (maxIdx > greenLimit) {
    severity = 'moderado';
    riskLabel = 'Muy leve o incierto (Amarillo)';
    actionLevelText = `${greenLimit.toFixed(1)} a ${yellowLimit.toFixed(1)} — Se recomienda nuevo análisis o mejora`;
    deadline = 'Medio plazo';
  }

  return {
    methodId: MethodId.OCRA_CHECKLIST,
    methodName: meta.fullName,
    category: meta.category,
    categoryLabel: meta.categoryLabel,
    hierarchyOrder: meta.hierarchyOrder,
    primaryScoreText: `ICL = ${maxIdx.toFixed(2)}`,
    secondaryScoreText: `Dch: ${rRes.index.toFixed(2)} · Izd: ${lRes.index.toFixed(2)}`,
    severity,
    riskLabel,
    actionLevelText,
    recommendedDeadline: deadline,
    interpretation:
      maxIdx <= greenLimit
        ? `El Índice Check List OCRA máximo (${maxIdx.toFixed(2)}) es ≤ ${greenLimit.toFixed(1)}. La repetitividad de movimientos en las tareas evaluadas resulta aceptable.`
        : `El Índice Check List OCRA (${maxIdx.toFixed(2)}) se clasifica como "${riskLabel}", requiriendo intervención sobre pausas, frecuencia y posturas forzadas.`,
    breakdownRows: [
      { parameter: 'Tiempo neto de trabajo repetitivo', value: `${Math.round(netRepMin)} min`, reference: `Factor Duración FD = ${fd}` },
      { parameter: 'Factor Recuperación (FR)', value: `${data.recoveryFactorScore} pts`, reference: 'Ficha 2 — Régimen de pausas' },
      {
        parameter: 'Factores Mano Derecha',
        value: `Índice Dch = ${rRes.index.toFixed(2)}`,
        reference: `FF=${data.right.frequencyFactor} · FFz=${data.right.forceFactor} · FP=${rRes.postureMax} · FC=${rRes.comp}`,
      },
      {
        parameter: 'Factores Mano Izquierda',
        value: `Índice Izd = ${lRes.index.toFixed(2)}`,
        reference: `FF=${data.left.frequencyFactor} · FFz=${data.left.forceFactor} · FP=${lRes.postureMax} · FC=${lRes.comp}`,
      },
    ],
    suggestedMeasures:
      maxIdx <= greenLimit
        ? ['Mantener la distribución actual de pausas y alternancia con tareas no repetitivas.']
        : [
            'Incorporar pausas de 8-10 minutos por cada hora de tarea repetitiva.',
            'Corregir elevación de hombros (>80°), pronosupinación amplia de codo (>60°) y flexo-extensión de muñeca (>45°).',
            'Sustituir guantes inadecuados o herramientas vibratorias que suman penalización complementaria.',
          ],
  };
}

// ============================================================================
// 9. MÉTODO JSI — JOB STRAIN INDEX (Capítulo 6.4 y 6.6)
// ============================================================================
export function evaluateJsi(data: JsiData): MethodEvaluationResult {
  const cycleSec = Math.max(1, data.cycleDurationSec);
  const pctCycle = evalMethodExpr(
    MethodId.JSI,
    'pctCycle',
    { effortSec: data.effortDurationSec, cycleSec },
    (data.effortDurationSec / cycleSec) * 100,
  );
  const effortsPerMin = evalMethodExpr(
    MethodId.JSI,
    'effortsPerMin',
    { cycleSec },
    60 / cycleSec,
  );

  let de: 1 | 2 | 3 | 4 | 5 = data.deDurationScore;
  let epm: 1 | 2 | 3 | 4 | 5 = data.epmEffortsScore;

  if (data.autoComputeCycleScores) {
    de = pctCycle < 10 ? 1 : pctCycle < 30 ? 2 : pctCycle < 50 ? 3 : pctCycle < 80 ? 4 : 5;
    epm = effortsPerMin < 4 ? 1 : effortsPerMin <= 8 ? 2 : effortsPerMin <= 14 ? 3 : effortsPerMin <= 19 ? 4 : 5;
  }

  const jsiScore = Number(
    evalMethodExpr(
      MethodId.JSI,
      'jsiScore',
      {
        IE: data.ieIntensity,
        DE: de,
        EPM: epm,
        PM: data.pmWristPosture,
        HT: data.htHoursPerDay,
        NP: data.npSpeedWork,
      },
      data.ieIntensity * de * epm * data.pmWristPosture * data.htHoursPerDay * data.npSpeedWork,
    ).toFixed(2),
  );

  const modLimit = getMethodParam(MethodId.JSI, 'modLimit', 3.0);
  const highLimit = getMethodParam(MethodId.JSI, 'highLimit', 7.0);
  const veryHighLimit = getMethodParam(MethodId.JSI, 'veryHighLimit', 30.0);

  let severity: RiskSeverity = 'bajo';
  let riskLabel = 'Riesgo bajo';
  let actionLevelText = `JSI ≤ ${modLimit} — Dentro de límites admisibles`;
  let deadline: MethodEvaluationResult['recommendedDeadline'] = 'Sin plazo específico';

  if (jsiScore > highLimit) {
    severity = jsiScore > veryHighLimit ? 'muy_alto' : 'alto';
    riskLabel = 'Riesgo alto';
    actionLevelText = `JSI > ${highLimit} — Rediseño prioritario de la tarea`;
    deadline = severity === 'muy_alto' ? 'Inmediato' : 'Corto plazo';
  } else if (jsiScore > modLimit) {
    severity = 'moderado';
    riskLabel = 'Riesgo moderado';
    actionLevelText = `${modLimit} < JSI ≤ ${highLimit} — Revisión de la tarea`;
    deadline = 'Medio plazo';
  }

  const meta = METHOD_CATALOG.find((m) => m.id === MethodId.JSI)!;
  return {
    methodId: MethodId.JSI,
    methodName: meta.fullName,
    category: meta.category,
    categoryLabel: meta.categoryLabel,
    hierarchyOrder: meta.hierarchyOrder,
    primaryScoreText: `JSI = ${jsiScore}`,
    secondaryScoreText: `${pctCycle.toFixed(1)}% ciclo · ${effortsPerMin.toFixed(1)} esf/min`,
    severity,
    riskLabel,
    actionLevelText,
    recommendedDeadline: deadline,
    interpretation:
      jsiScore <= modLimit
        ? `El índice de tensión JSI es igual o inferior a ${modLimit} (Tabla 6.25). Es poco probable que se produzcan trastornos distales.`
        : jsiScore <= highLimit
          ? `El índice JSI se ubica entre ${modLimit} y ${highLimit}. Existe riesgo moderado en trabajadores sensibles; se recomienda revisar el puesto.`
          : `El índice JSI (${jsiScore}) supera el punto de corte de ${highLimit} (Tabla 6.25). Alta probabilidad de TME en muñeca y mano; requiere rediseño prioritario.`,
    breakdownRows: [
      { parameter: 'Intensidad del Esfuerzo (IE)', value: `${data.ieIntensity}`, reference: 'Tabla 6.19 (Escala 1–5)' },
      { parameter: 'Duración del Esfuerzo (DE)', value: `${de}`, reference: `${pctCycle.toFixed(1)}% del ciclo (Tabla 6.20)` },
      { parameter: 'Esfuerzos por Minuto (EPM)', value: `${epm}`, reference: `${effortsPerMin.toFixed(1)} esf/min (Tabla 6.21)` },
      { parameter: 'Postura Mano-Muñeca (PM)', value: `${data.pmWristPosture}`, reference: 'Tabla 6.22 (Escala 1–5)' },
      { parameter: 'Horas de Trabajo al Día (HT)', value: `${data.htHoursPerDay}`, reference: 'Tabla 6.23 (Escala 1–5)' },
      { parameter: 'Nivel de Productividad / Ritmo (NP)', value: `${data.npSpeedWork}`, reference: 'Tabla 6.24 (Escala 1–5)' },
      { parameter: 'Índice de Tensión (JSI)', value: `${jsiScore}`, reference: actionLevelText },
    ],
    suggestedMeasures: [
      'Rediseñar útiles o herramientas para que la muñeca trabaje alineada en posición neutra.',
      'Disminuir la fuerza de prensión requerida mediante mantenimiento de filos, mangos anatómicos o asistencia neumática/eléctrica.',
      'Flexibilizar la cadencia de línea e introducir rotación de tareas.',
    ],
  };
}

// ============================================================================
// 10. NAM RESOLUCIÓN 295/03 (Informe págs. 28 a 32)
// ============================================================================
const NAM_TABLE_1: (number | null)[][] = [
  // rows: freq [0.125, 0.25, 0.5, 1.0, 2.0]; cols: duty [0-20, 20-40, 40-60, 60-80, 80-100]
  [1, 1, null, null, null],
  [2, 2, 3, null, null],
  [3, 4, 5, 5, 6],
  [4, 5, 5, 6, 7],
  [null, 5, 6, 7, 8],
];
const NAM_FREQS = [0.125, 0.25, 0.5, 1.0, 2.0];

function computeNamHand(h: Nam295Data['right']) {
  const period = Math.max(1, h.observationPeriodSec);
  const dutyPct = evalMethodExpr(
    MethodId.NAM_295,
    'dutyPct',
    { effortSec: h.effortTimeSec, periodSec: period },
    clamp((h.effortTimeSec / period) * 100, 0, 100),
  );
  const freq = h.effortsCount / period;
  const namMax = getMethodParam(MethodId.NAM_295, 'namMax', 9);

  let fIdx = 0;
  let minDiff = Infinity;
  NAM_FREQS.forEach((f, idx) => {
    const diff = Math.abs(freq - f);
    if (diff < minDiff) {
      minDiff = diff;
      fIdx = idx;
    }
  });
  const colIdx = dutyPct < 20 ? 0 : dutyPct < 40 ? 1 : dutyPct < 60 ? 2 : dutyPct < 80 ? 3 : 4;
  let nam = NAM_TABLE_1[fIdx][colIdx];
  if (nam === null) {
    nam = clamp(Math.round(Math.log10(Math.max(0.05, freq) * 10) * 3 + dutyPct / 22), 1, namMax);
  }

  const tlvLimit = evalMethodExpr(
    MethodId.NAM_295,
    'tlvLimit',
    { NAM: nam },
    Math.max(0, 7.8 - 0.78 * nam),
  );
  const actionLimit = evalMethodExpr(
    MethodId.NAM_295,
    'actionLimit',
    { NAM: nam },
    Math.max(0, 5.56 - 0.556 * nam),
  );

  let zone: 'Zona de Seguridad' | 'Zona de Control' | 'Zona de Peligro TME' = 'Zona de Seguridad';
  if (h.borgPeakForce > tlvLimit) zone = 'Zona de Peligro TME';
  else if (h.borgPeakForce > actionLimit) zone = 'Zona de Control';

  return { dutyPct, freq, adoptedFreq: NAM_FREQS[fIdx], nam, tlvLimit, actionLimit, zone };
}

export function evaluateNam295(data: Nam295Data): MethodEvaluationResult {
  const r = computeNamHand(data.right);
  const l = computeNamHand(data.left);

  const zones = [r.zone, l.zone];
  let severity: RiskSeverity = 'bajo';
  let riskLabel = 'Zona de Seguridad';
  let actionLevelText = 'Debajo del Límite de Acción';
  let deadline: MethodEvaluationResult['recommendedDeadline'] = 'Sin plazo específico';

  if (zones.includes('Zona de Peligro TME')) {
    severity = 'alto';
    riskLabel = 'Zona de Peligro TME — Supera Valor Límite Umbral';
    actionLevelText = 'Excede VLU — Controles de ingeniería obligatorios';
    deadline = 'Corto plazo';
  } else if (zones.includes('Zona de Control') || data.prolongedAwkwardWrist || data.contactStress) {
    severity = 'moderado';
    riskLabel = 'Zona de Control — Supera Límite de Acción';
    actionLevelText = 'Vigilancia y controles generales recomendados';
    deadline = 'Medio plazo';
  }

  const meta = METHOD_CATALOG.find((m) => m.id === MethodId.NAM_295)!;
  return {
    methodId: MethodId.NAM_295,
    methodName: meta.fullName,
    category: meta.category,
    categoryLabel: meta.categoryLabel,
    hierarchyOrder: meta.hierarchyOrder,
    primaryScoreText: `NAM D:${r.nam} · I:${l.nam}`,
    secondaryScoreText: `Borg D:${data.right.borgPeakForce} · I:${data.left.borgPeakForce}`,
    severity,
    riskLabel,
    actionLevelText,
    recommendedDeadline: deadline,
    interpretation:
      severity === 'bajo'
        ? 'Ambas manos se ubican dentro de la Zona de Seguridad (debajo de la línea punteada del Límite de Acción). No se prevén TME en mano, muñeca ni antebrazo.'
        : `La combinación de Nivel de Actividad Manual y Fuerza Pico ubica la tarea en ${riskLabel}.`,
    breakdownRows: [
      {
        parameter: 'Mano Derecha',
        value: `NAM = ${r.nam} · Fuerza Borg = ${data.right.borgPeakForce} → ${r.zone}`,
        reference: `LA=${r.actionLimit.toFixed(2)} · VLU=${r.tlvLimit.toFixed(2)} · Ocup. ${r.dutyPct.toFixed(1)}%`,
      },
      {
        parameter: 'Mano Izquierda',
        value: `NAM = ${l.nam} · Fuerza Borg = ${data.left.borgPeakForce} → ${l.zone}`,
        reference: `LA=${l.actionLimit.toFixed(2)} · VLU=${l.tlvLimit.toFixed(2)} · Ocup. ${l.dutyPct.toFixed(1)}%`,
      },
      {
        parameter: 'Factores adicionales Res. 295/03',
        value:
          data.prolongedAwkwardWrist || data.contactStress
            ? `${data.prolongedAwkwardWrist ? 'Posturas obligadas de muñeca ' : ''}${data.contactStress ? 'Estrés de contacto' : ''}`
            : 'Sin estrés de contacto ni desviación prolongada',
        reference: 'Reducir umbral si están presentes',
      },
    ],
    suggestedMeasures:
      severity === 'bajo'
        ? ['Mantener diseño ergonómico de periféricos/herramientas y apoyos sin aristas vivas.']
        : [
            'Reducir la fuerza pico empleando herramientas de menor resistencia o mejor ventaja mecánica.',
            'Disminuir el ciclo de ocupación introduciendo micropausas de recuperación.',
          ],
    namPoints: {
      right: { nam: r.nam, borg: data.right.borgPeakForce, zone: r.zone },
      left: { nam: l.nam, borg: data.left.borgPeakForce, zone: l.zone },
    },
  };
}

// ============================================================================
// 11. CUESTIONARIO BIPOLAR (Informe págs. 26-27)
// ============================================================================
export function evaluateBipolar(scores: number[]): MethodEvaluationResult {
  const cleanScores = BIPOLAR_ITEMS.map((_, idx) => clamp(scores[idx] ?? 0, 0, 10));
  const sumScores = cleanScores.reduce((a, b) => a + b, 0);
  const maxItem = Math.max(...cleanScores);

  const modTotalLimit = getMethodParam(MethodId.BIPOLAR, 'modTotalLimit', 25);
  const highTotalLimit = getMethodParam(MethodId.BIPOLAR, 'highTotalLimit', 50);
  const highItemLimit = getMethodParam(MethodId.BIPOLAR, 'highItemLimit', 6);
  const criticalItemLimit = getMethodParam(MethodId.BIPOLAR, 'criticalItemLimit', 8);

  const total = Number(
    evalMethodExpr(
      MethodId.BIPOLAR,
      'totalScore',
      { sumScores, itemCount: BIPOLAR_ITEMS.length, maxItem },
      sumScores,
    ).toFixed(1),
  );
  const meanScore = evalMethodExpr(
    MethodId.BIPOLAR,
    'meanScore',
    { sumScores, itemCount: BIPOLAR_ITEMS.length },
    sumScores / BIPOLAR_ITEMS.length,
  );

  const highItems = BIPOLAR_ITEMS.filter((_, idx) => cleanScores[idx] >= highItemLimit).map(
    (it) => `${it.rightPole} (${cleanScores[it.id - 1]})`,
  );

  let severity: RiskSeverity = 'bajo';
  let riskLabel = total === 0 ? 'Puesto ideal (0 pts)' : 'Conforme — No requiere actuación';
  let actionLevelText = `Sumatoria ≤ ${highTotalLimit} y ningún ítem ≥ ${highItemLimit}`;
  let deadline: MethodEvaluationResult['recommendedDeadline'] = 'Sin plazo específico';

  if (maxItem >= criticalItemLimit) {
    severity = 'muy_alto';
    riskLabel = `Ítem crítico ≥ ${criticalItemLimit} — Suspender y corregir tarea`;
    actionLevelText = `Puntuación individual ≥ ${criticalItemLimit} puntos`;
    deadline = 'Inmediato';
  } else if (maxItem >= highItemLimit || total > highTotalLimit) {
    severity = 'alto';
    riskLabel = 'Corrección urgente de variable';
    actionLevelText =
      maxItem >= highItemLimit ? `Puntuación individual ≥ ${highItemLimit} puntos` : `Sumatoria total > ${highTotalLimit} puntos`;
    deadline = 'Corto plazo';
  } else if (total > modTotalLimit) {
    severity = 'moderado';
    riskLabel = 'Disconformidad leve';
    actionLevelText = 'Seguimiento preventivo de confort';
    deadline = 'Medio plazo';
  }

  const meta = METHOD_CATALOG.find((m) => m.id === MethodId.BIPOLAR)!;
  return {
    methodId: MethodId.BIPOLAR,
    methodName: meta.fullName,
    category: meta.category,
    categoryLabel: meta.categoryLabel,
    hierarchyOrder: meta.hierarchyOrder,
    primaryScoreText: `${total} / 150 pts`,
    secondaryScoreText: `Media: ${meanScore.toFixed(2)} · Máx. ítem: ${maxItem}/10`,
    severity,
    riskLabel,
    actionLevelText,
    recommendedDeadline: deadline,
    interpretation:
      maxItem >= criticalItemLimit
        ? `Alguna de las puntuaciones individuales es ${criticalItemLimit} o superior: corresponde suspender la tarea y adecuar el factor crítico.`
        : maxItem >= highItemLimit || total > highTotalLimit
          ? `Se registran variables con puntaje ≥ ${highItemLimit} o sumatoria > ${highTotalLimit}: se debe corregir la variable afectada en forma urgente.`
          : `Sumatoria total de ${total} puntos (≤ ${highTotalLimit}) sin ítems críticos. De acuerdo al método Bipolar no se requieren modificaciones en la tarea, sin perjuicio de mejoras en mobiliario (IRAM 3753).`,
    breakdownRows: [
      { parameter: 'Sumatoria Total Bipolar', value: `${total} puntos`, reference: `Media: ${meanScore.toFixed(2)} · Umbral: > ${highTotalLimit} pts` },
      { parameter: 'Puntuación individual máxima', value: `${maxItem} puntos`, reference: `≥${highItemLimit} urgente · ≥${criticalItemLimit} suspender` },
      { parameter: `Dimensiones con alerta (≥ ${highItemLimit})`, value: highItems.length ? highItems.join(', ') : 'Ninguna', reference: '15 indicadores evaluados' },
    ],
    suggestedMeasures: [
      'Adecuar silla con regulación de altura (38 a 54 cm), apoyo lumbar y respaldo regulable conforme a IRAM 3753.',
      'Alinear el monitor frente al usuario en ángulo de visión entre 0° y 60° bajo la horizontal para evitar rotación cervical.',
    ],
  };
}

// ============================================================================
// 12. MÉTODO DE FANGER — PMV / PPD (Capítulo 7.2, 7.4 y Planilla Cap. 12 Tabla 12.4)
// ============================================================================
export interface FangerComputedPoint {
  pmv: number;
  ppd: number;
  mWm2: number;
  tclC: number;
  categoryCode: 'A' | 'B' | 'C' | 'Disconfort';
  categoryThermal: string;
  sensation: string;
  severity: RiskSeverity;
  deadline: MethodEvaluationResult['recommendedDeadline'];
}

export function computeFangerMetrics(input: {
  airTempC: number;
  radiantTempC: number;
  relativeHumidityPct: number;
  airVelocityMs: number;
  metabolicRateMet: number;
  clothingInsulationClo: number;
}): FangerComputedPoint {
  const ta = input.airTempC;
  const tr = input.radiantTempC;
  const vel = Math.max(0.0, input.airVelocityMs);
  const rh = clamp(input.relativeHumidityPct, 0, 100);
  const met = Math.max(0.8, input.metabolicRateMet);
  const clo = clamp(input.clothingInsulationClo, 0, 3);

  const metToWm2 = getMethodParam(MethodId.FANGER, 'metToWm2', 58.15);
  const cloToM2KW = getMethodParam(MethodId.FANGER, 'cloToM2KW', 0.155);
  const catALimit = getMethodParam(MethodId.FANGER, 'catALimit', 0.2);
  const catBLimit = getMethodParam(MethodId.FANGER, 'catBLimit', 0.5);
  const catCLimit = getMethodParam(MethodId.FANGER, 'catCLimit', 0.7);
  const highLimit = getMethodParam(MethodId.FANGER, 'highLimit', 1.5);

  const pa = rh * 10 * Math.exp(16.6536 - 4030.183 / (ta + 235));
  const icl = cloToM2KW * clo;
  const m = met * metToWm2;
  const mw = m;
  const fcl = icl <= 0.078 ? 1.0 + 1.29 * icl : 1.05 + 0.645 * icl;
  const hcf = 12.1 * Math.sqrt(vel);
  const taa = ta + 273;
  const tra = tr + 273;

  const tcla = taa + (35.5 - ta) / (3.5 * icl + 0.1);
  const p1 = icl * fcl;
  const p2 = p1 * 3.96;
  const p3 = p1 * 100;
  const p4 = p1 * taa;
  const p5 = 308.7 - 0.028 * mw + p2 * Math.pow(tra / 100, 4);

  let xn = tcla / 100;
  let xf = xn;
  let hc = hcf;
  for (let i = 0; i < 150; i++) {
    xf = (xf + xn) / 2;
    const hcn = 2.38 * Math.pow(Math.abs(100 * xf - taa), 0.25);
    hc = Math.max(hcf, hcn);
    xn = (p5 + p4 * hc - p2 * Math.pow(xf, 4)) / (100 + p3 * hc);
    if (Math.abs(xn - xf) < 0.00015) break;
  }
  const tcl = 100 * xn - 273;

  const hl1 = 3.05 * 0.001 * (5733 - 6.99 * mw - pa);
  const hl2 = mw > metToWm2 ? 0.42 * (mw - metToWm2) : 0;
  const hl3 = 1.7 * 0.00001 * m * (5867 - pa);
  const hl4 = 0.0014 * m * (34 - ta);
  const hl5 = 3.96 * fcl * (Math.pow(xn, 4) - Math.pow(tra / 100, 4));
  const hl6 = fcl * hc * (tcl - ta);

  const thermalLoad = mw - hl1 - hl2 - hl3 - hl4 - hl5 - hl6;
  const ts = evalMethodExpr(
    MethodId.FANGER,
    'ts',
    { M: m, met },
    0.303 * Math.exp(-0.036 * m) + 0.028,
  );
  const pmv = evalMethodExpr(
    MethodId.FANGER,
    'pmv',
    { ts, thermalLoad, M: m, ta, tr },
    clamp(ts * thermalLoad, -3, 3),
  );
  const ppd = evalMethodExpr(
    MethodId.FANGER,
    'ppd',
    { PMV: pmv },
    clamp(100 - 95 * Math.exp(-0.03353 * Math.pow(pmv, 4) - 0.2179 * Math.pow(pmv, 2)), 5, 100),
  );

  const absPmv = Math.abs(pmv);
  let categoryCode: FangerComputedPoint['categoryCode'] = 'A';
  let categoryThermal = 'Categoría A — Alta calidad térmica (PPD < 6%)';
  let severity: RiskSeverity = 'bajo';
  let deadline: MethodEvaluationResult['recommendedDeadline'] = 'Sin plazo específico';

  if (absPmv <= catALimit) {
    categoryCode = 'A';
    categoryThermal = 'Categoría A — Alta calidad térmica (PPD < 6%)';
    severity = 'bajo';
  } else if (absPmv <= catBLimit) {
    categoryCode = 'B';
    categoryThermal = 'Categoría B — Ambiente aceptable (PPD < 10%)';
    severity = 'bajo';
  } else if (absPmv <= catCLimit) {
    categoryCode = 'C';
    categoryThermal = 'Categoría C — Aceptable con reservas (PPD < 15%)';
    severity = 'moderado';
    deadline = 'Medio plazo';
  } else {
    categoryCode = 'Disconfort';
    categoryThermal =
      pmv > 0 ? 'Fuera de criterio — Disconfort por calor' : 'Fuera de criterio — Disconfort por frío';
    severity = absPmv > highLimit ? 'alto' : 'moderado';
    deadline = absPmv > highLimit ? 'Corto plazo' : 'Medio plazo';
  }

  const sensation =
    pmv >= 2.5
      ? 'Mucho calor (+3)'
      : pmv >= 1.5
        ? 'Calor (+2)'
        : pmv >= 0.5
          ? 'Ligeramente cálido (+1)'
          : pmv > -0.5
            ? 'Neutro / Confort (0)'
            : pmv > -1.5
              ? 'Ligeramente fresco (-1)'
              : pmv > -2.5
                ? 'Frío (-2)'
                : 'Mucho frío (-3)';

  return {
    pmv,
    ppd,
    mWm2: m,
    tclC: tcl,
    categoryCode,
    categoryThermal,
    sensation,
    severity,
    deadline,
  };
}

export function evaluateFanger(data: FangerData): MethodEvaluationResult {
  const catBLimit = getMethodParam(MethodId.FANGER, 'catBLimit', 0.5);
  const meta = METHOD_CATALOG.find((m) => m.id === MethodId.FANGER)!;

  if (data.useMultiSectorSheet && Array.isArray(data.multiSectorSamples) && data.multiSectorSamples.length > 0) {
    const evaluatedRows = data.multiSectorSamples.map((row) => ({
      row,
      metrics: computeFangerMetrics(row),
    }));

    const worstEntry = evaluatedRows.reduce((worst, cur) =>
      Math.abs(cur.metrics.pmv) > Math.abs(worst.metrics.pmv) ? cur : worst,
    );
    const outOfComfortCount = evaluatedRows.filter((e) => Math.abs(e.metrics.pmv) > catBLimit).length;

    const pmv = worstEntry.metrics.pmv;
    const ppd = worstEntry.metrics.ppd;
    const absPmv = Math.abs(pmv);

    const sectorBreakdownRows: MethodEvaluationResult['breakdownRows'] = evaluatedRows.map((entry, idx) => ({
      parameter: `${idx + 1}. ${entry.row.sectorLabel || `Sector ${idx + 1}`}`,
      value: `PMV = ${entry.metrics.pmv >= 0 ? '+' : ''}${entry.metrics.pmv.toFixed(2)} · PPD = ${entry.metrics.ppd.toFixed(1)}%`,
      reference: `ta=${entry.row.airTempC}°C, tr=${entry.row.radiantTempC}°C, HR=${entry.row.relativeHumidityPct}%, va=${entry.row.airVelocityMs} m/s, ${entry.row.metabolicRateMet} met, ${entry.row.clothingInsulationClo} clo → Cat. ${entry.metrics.categoryCode}`,
    }));

    return {
      methodId: MethodId.FANGER,
      methodName: meta.fullName,
      category: meta.category,
      categoryLabel: meta.categoryLabel,
      hierarchyOrder: meta.hierarchyOrder,
      primaryScoreText: `PMV = ${pmv >= 0 ? '+' : ''}${pmv.toFixed(2)}`,
      secondaryScoreText: `PPD máx. = ${ppd.toFixed(1)}% (${evaluatedRows.length} sectores · ${outOfComfortCount === 0 ? 'Todos en confort' : `${outOfComfortCount} fuera de ±${catBLimit.toFixed(1)}`})`,
      severity: worstEntry.metrics.severity,
      riskLabel: `${worstEntry.metrics.categoryThermal} (${worstEntry.row.sectorLabel})`,
      actionLevelText:
        absPmv <= catBLimit
          ? `Planilla conforme: todos los sectores en ±${catBLimit.toFixed(2)} (PPD < 10%)`
          : `Sector crítico fuera de intervalo óptimo (±${catBLimit.toFixed(2)})`,
      recommendedDeadline: worstEntry.metrics.deadline,
      interpretation:
        outOfComfortCount === 0
          ? `Se relevaron ${evaluatedRows.length} sectores en planilla de confort térmico ISO 7730, ubicándose todos dentro del intervalo de confort aceptable (±${catBLimit.toFixed(2)}, PPD ≤ 10%).`
          : `De los ${evaluatedRows.length} sectores relevados en planilla, ${outOfComfortCount} supera(n) el límite del 10% de insatisfechos (±${catBLimit.toFixed(2)}). El punto más desfavorable corresponde a "${worstEntry.row.sectorLabel}" con PMV = ${pmv >= 0 ? '+' : ''}${pmv.toFixed(2)} y PPD = ${ppd.toFixed(1)}%.`,
      breakdownRows: [
        ...sectorBreakdownRows,
        {
          parameter: 'Resumen Global de Planilla Térmica',
          value: `${evaluatedRows.length - outOfComfortCount}/${evaluatedRows.length} sectores en confort (PPD ≤ 10%)`,
          reference: `Crítico: ${worstEntry.row.sectorLabel} (PPD ${ppd.toFixed(1)}%)`,
        },
      ],
      suggestedMeasures:
        pmv > catBLimit
          ? [
              `Mejorar ventilación/climatización y aislamiento de cubiertas en "${worstEntry.row.sectorLabel}" para reducir PMV bajo +${catBLimit.toFixed(1)}.`,
              'Adecuar aislamiento térmico de vestimenta laboral (clo) según estación y carga metabólica de cada sector.',
            ]
          : pmv < -catBLimit
            ? [
                `Reducir infiltraciones/corrientes de aire frío en "${worstEntry.row.sectorLabel}" y proveer abrigo laboral calibrado en clo.`,
              ]
            : ['Mantener registro estacional en planilla de confort térmico (invierno/verano) y limpieza de sistemas HVAC.'],
    };
  }

  const single = computeFangerMetrics(data);
  const { pmv, ppd, mWm2, categoryThermal, sensation, severity, deadline } = single;
  const absPmv = Math.abs(pmv);

  return {
    methodId: MethodId.FANGER,
    methodName: meta.fullName,
    category: meta.category,
    categoryLabel: meta.categoryLabel,
    hierarchyOrder: meta.hierarchyOrder,
    primaryScoreText: `PMV = ${pmv >= 0 ? '+' : ''}${pmv.toFixed(2)}`,
    secondaryScoreText: `PPD = ${ppd.toFixed(1)}% · ${sensation}`,
    severity,
    riskLabel: categoryThermal,
    actionLevelText:
      absPmv <= catBLimit
        ? `Confort térmico aceptable (−${catBLimit.toFixed(2)} a +${catBLimit.toFixed(2)})`
        : `Fuera del intervalo óptimo (−${catBLimit.toFixed(2)} a +${catBLimit.toFixed(2)})`,
    recommendedDeadline: deadline,
    interpretation:
      absPmv <= catBLimit
        ? `El Voto Medio Estimado (${pmv.toFixed(2)}) se ubica dentro del rango de aceptabilidad (±${catBLimit.toFixed(2)}) de la Tabla 7.7, con un ${ppd.toFixed(1)}% de insatisfechos.`
        : `El PMV (${pmv.toFixed(2)}) y el PPD (${ppd.toFixed(1)}%) superan el umbral de confort, indicando ${pmv > 0 ? 'exceso térmico cálido' : 'ambiente frío'}.`,
    breakdownRows: [
      { parameter: 'Temperaturas (Aire ta / Radiante tr)', value: `${data.airTempC.toFixed(1)} °C / ${data.radiantTempC.toFixed(1)} °C`, reference: `HR: ${clamp(data.relativeHumidityPct, 0, 100)}% · va: ${Math.max(0, data.airVelocityMs).toFixed(2)} m/s` },
      { parameter: 'Variables personales (M / Ropa)', value: `${Math.max(0.8, data.metabolicRateMet).toFixed(1)} met (${Math.round(mWm2)} W/m²) · ${clamp(data.clothingInsulationClo, 0, 3).toFixed(2)} clo`, reference: 'Tablas 7.3 y 7.4' },
      { parameter: 'Voto Medio Estimado (PMV)', value: `${pmv >= 0 ? '+' : ''}${pmv.toFixed(2)}`, reference: sensation },
      { parameter: 'Porcentaje de Insatisfechos (PPD)', value: `${ppd.toFixed(1)} %`, reference: categoryThermal },
    ],
    suggestedMeasures:
      pmv > catBLimit
        ? [
            'Aislar superficies radiantes calientes y mejorar el caudal de impulsión de aire climatizado.',
            'Permitir atuendo más ligero (menor resistencia clo) y regulación térmica local.',
          ]
        : pmv < -catBLimit
          ? [
              'Reducir corrientes de aire frío, elevar la temperatura de climatización y adecuar el aislamiento térmico del vestuario.',
            ]
          : ['Mantener el mantenimiento periódico de filtros y el monitoreo estacional de climatización.'],
  };
}

// ============================================================================
// 13. ÍNDICE WBGT — ESTRÉS TÉRMICO (Capítulo 7.3 y 7.5)
// ============================================================================
export function evaluateWbgt(data: WbgtData): MethodEvaluationResult {
  const calcSingle = (tbh: number, tg: number, ta: number, solar: boolean) =>
    solar
      ? evalMethodExpr(MethodId.WBGT, 'wbgtSolar', { Tbh: tbh, Tg: tg, Ta: ta }, 0.7 * tbh + 0.2 * tg + 0.1 * ta)
      : evalMethodExpr(MethodId.WBGT, 'wbgtIndoor', { Tbh: tbh, Tg: tg, Ta: ta }, 0.7 * tbh + 0.3 * tg);

  let wbgtWorkplace = calcSingle(data.tbhC, data.tgC, data.taC, data.solarLoad);
  if (data.useMultiZone && data.multiZoneSamples.length > 0) {
    const totMin = data.multiZoneSamples.reduce((a, r) => a + Math.max(1, r.durationMin), 0);
    wbgtWorkplace =
      data.multiZoneSamples.reduce(
        (acc, r) => acc + calcSingle(r.tbhC, r.tgC, r.taC, data.solarLoad) * Math.max(1, r.durationMin),
        0,
      ) / totMin;
  }

  const w = data.metabolicWatts;
  const bandLabel =
    w <= 200 ? 'Ligero (≤ 200 W)' : w <= 350 ? 'Moderado (200–350 W)' : w <= 500 ? 'Pesado (350–500 W)' : 'Muy pesado (> 500 W)';

  let limitCont = 30.0;
  let limitCycle = 30.0;
  if (data.acclimatized) {
    if (w <= 200) [limitCycle, limitCont] = [30.0, 30.0];
    else if (w <= 350) [limitCycle, limitCont] = [30.0, 28.0];
    else if (w <= 500) [limitCycle, limitCont] = [28.0, 25.0];
    else [limitCycle, limitCont] = [25.0, 22.5];
  } else {
    if (w <= 200) [limitCycle, limitCont] = [29.0, 29.0];
    else if (w <= 350) [limitCycle, limitCont] = [28.5, 26.5];
    else if (w <= 500) [limitCycle, limitCont] = [27.5, 24.5];
    else [limitCycle, limitCont] = [24.5, 21.5];
  }

  const weightedCycleWbgt = evalMethodExpr(
    MethodId.WBGT,
    'wbgtCycle',
    { wbgtWork: wbgtWorkplace, tWork: data.workMinutesPerHour, wbgtRest: data.restWbgtC },
    (wbgtWorkplace * data.workMinutesPerHour + data.restWbgtC * (60 - data.workMinutesPerHour)) / 60,
  );
  const criticalDeltaC = getMethodParam(MethodId.WBGT, 'criticalDeltaC', 2.0);

  let recommendedRegime = 'Trabajo continuo';
  if (wbgtWorkplace > limitCont) {
    if (w <= 200) {
      recommendedRegime =
        wbgtWorkplace <= 30
          ? 'Trabajo continuo'
          : wbgtWorkplace <= 32
            ? '45 min trabajo / 15 min descanso'
            : wbgtWorkplace <= 34
              ? '30 min trabajo / 30 min descanso'
              : '15 min trabajo / 45 min descanso';
    } else if (w <= 350) {
      recommendedRegime =
        wbgtWorkplace <= 28
          ? 'Trabajo continuo'
          : wbgtWorkplace <= 30
            ? '45 min trabajo / 15 min descanso'
            : wbgtWorkplace <= 32
              ? '30 min trabajo / 30 min descanso'
              : wbgtWorkplace <= 34
                ? '15 min trabajo / 45 min descanso'
                : 'No admisible — Intervenir foco térmico';
    } else if (w <= 500) {
      recommendedRegime =
        wbgtWorkplace <= 28
          ? '45 min trabajo / 15 min descanso'
          : wbgtWorkplace <= 30
            ? '30 min trabajo / 30 min descanso'
            : wbgtWorkplace <= 32
              ? '15 min trabajo / 45 min descanso'
              : 'No admisible — Intervenir foco térmico';
    } else {
      recommendedRegime =
        wbgtWorkplace <= 28
          ? '30 min trabajo / 30 min descanso'
          : wbgtWorkplace <= 30
            ? '15 min trabajo / 45 min descanso'
            : 'No admisible — Intervenir foco térmico';
    }
  }

  let severity: RiskSeverity = 'bajo';
  let riskLabel = 'Exposición térmica admisible';
  let deadline: MethodEvaluationResult['recommendedDeadline'] = 'Sin plazo específico';

  if (wbgtWorkplace > limitCycle) {
    severity = wbgtWorkplace > limitCycle + criticalDeltaC ? 'muy_alto' : 'alto';
    riskLabel = 'Exposición NO admisible — Estrés térmico';
    deadline = severity === 'muy_alto' ? 'Inmediato' : 'Corto plazo';
  } else if (wbgtWorkplace > limitCont) {
    severity = 'moderado';
    riskLabel = 'Exige régimen de trabajo y descanso';
    deadline = 'Corto plazo';
  }

  const meta = METHOD_CATALOG.find((m) => m.id === MethodId.WBGT)!;
  return {
    methodId: MethodId.WBGT,
    methodName: meta.fullName,
    category: meta.category,
    categoryLabel: meta.categoryLabel,
    hierarchyOrder: meta.hierarchyOrder,
    primaryScoreText: `${wbgtWorkplace.toFixed(1)} °C`,
    secondaryScoreText: `Límite cont.: ${limitCont.toFixed(1)} °C · Ciclo: ${limitCycle.toFixed(1)} °C`,
    severity,
    riskLabel,
    actionLevelText: `Régimen aplicable: ${recommendedRegime}`,
    recommendedDeadline: deadline,
    interpretation:
      wbgtWorkplace <= limitCont
        ? `El índice WBGT (${wbgtWorkplace.toFixed(1)} °C) es inferior al valor límite para trabajo continuo (${limitCont.toFixed(1)} °C). Exposición admisible.`
        : `El índice WBGT (${wbgtWorkplace.toFixed(1)} °C) supera el valor límite de trabajo continuo (${limitCont.toFixed(1)} °C). Régimen de referencia (Tabla 7.11): ${recommendedRegime}.`,
    breakdownRows: [
      { parameter: 'Modalidad de radiación', value: data.solarLoad ? 'Exterior con carga solar' : 'Interior o exterior sin carga solar', reference: data.solarLoad ? 'WBGT_sol' : 'WBGT_int' },
      { parameter: 'Índice WBGT del puesto', value: `${wbgtWorkplace.toFixed(2)} °C`, reference: `Tbh=${data.tbhC}°C · Tg=${data.tgC}°C · Ta=${data.taC}°C` },
      { parameter: 'Consumo metabólico y aclimatación', value: `${w} W (${bandLabel})`, reference: data.acclimatized ? 'Aclimatado (Tabla 7.8)' : 'No aclimatado (Tabla 7.9)' },
      { parameter: 'Valores límite WBGT', value: `Continuo: ${limitCont.toFixed(1)} °C | Ciclo: ${limitCycle.toFixed(1)} °C`, reference: `Ponderado actual: ${weightedCycleWbgt.toFixed(1)} °C` },
      { parameter: 'Régimen Trabajo / Descanso (Tabla 7.11)', value: recommendedRegime, reference: riskLabel },
    ],
    suggestedMeasures: [
      'Apantallar o aislar térmicamente las fuentes de calor radiante (reducción de temperatura de globo Tg).',
      'Instalar extracción localizada, mejorar ventilación e impulsar aire cuando Ta lo permita.',
      'Garantizar provisión permanente de agua fresca, zona de descanso climatizada y vigilancia de aclimatación.',
    ],
  };
}

// ============================================================================
// 14. VIBRACIONES CUERPO ENTERO — ISO 2631 (Capítulo 8.3 y 8.5)
// ============================================================================
export function evaluateIso2631(data: Iso2631Data): MethodEvaluationResult {
  const periods = data.periods.length > 0 ? data.periods : [];
  const kxSeated = getMethodParam(MethodId.ISO_2631, 'kxSeated', 1.4);
  const kySeated = getMethodParam(MethodId.ISO_2631, 'kySeated', 1.4);
  const kzVal = getMethodParam(MethodId.ISO_2631, 'kz', 1.0);
  const T0 = Math.max(0.5, getMethodParam(MethodId.ISO_2631, 'T0', 8.0));
  const actionLower = getMethodParam(MethodId.ISO_2631, 'actionLower', 0.5);
  const actionUpper = getMethodParam(MethodId.ISO_2631, 'actionUpper', 1.15);

  let sumA8Sq = 0;

  const pRows = periods.map((p) => {
    const kx = p.posture === 'sentado' ? kxSeated : 1.0;
    const ky = p.posture === 'sentado' ? kySeated : 1.0;
    const kz = kzVal;
    const aw = evalMethodExpr(
      MethodId.ISO_2631,
      'aw',
      { kx, ky, kz, awx: p.awx, awy: p.awy, awz: p.awz },
      Math.sqrt(Math.pow(kx * p.awx, 2) + Math.pow(ky * p.awy, 2) + Math.pow(kz * p.awz, 2)),
    );
    const expH = Math.max(0, p.exposureHours);
    const a8Partial = evalMethodExpr(
      MethodId.ISO_2631,
      'a8Partial',
      { aw, T: expH, T0 },
      aw * Math.sqrt(expH / T0),
    );
    sumA8Sq += Math.pow(a8Partial, 2);
    return {
      parameter: `${p.equipmentName} (${p.posture === 'sentado' ? 'Sentado' : 'De pie'})`,
      value: `aw = ${aw.toFixed(2)} m/s² → A(8) parcial = ${a8Partial.toFixed(2)} m/s²`,
      reference: `X:${p.awx} (×${kx}) · Y:${p.awy} (×${ky}) · Z:${p.awz} (×${kz}) · T=${p.exposureHours}h`,
    };
  });

  const a8 = Math.sqrt(sumA8Sq);
  let severity: RiskSeverity = 'bajo';
  let riskLabel = 'Debajo del Nivel de Acción Inferior';
  let actionLevelText = `A(8) ≤ ${actionLower.toFixed(2)} m/s² — Exposición admisible`;
  let deadline: MethodEvaluationResult['recommendedDeadline'] = 'Sin plazo específico';

  if (a8 > actionUpper) {
    severity = 'muy_alto';
    riskLabel = `Supera Nivel de Acción Superior (${actionUpper.toFixed(2)} m/s²)`;
    actionLevelText = `A(8) > ${actionUpper.toFixed(2)} m/s² — Prohibido superar / Reducción prioritaria`;
    deadline = 'Inmediato';
  } else if (a8 > actionLower) {
    severity = 'moderado';
    riskLabel = `Entre Niveles de Acción (${actionLower.toFixed(2)} a ${actionUpper.toFixed(2)} m/s²)`;
    actionLevelText = 'Medidas técnicas, organizativas y vigilancia de salud';
    deadline = 'Corto plazo';
  }

  const meta = METHOD_CATALOG.find((m) => m.id === MethodId.ISO_2631)!;
  return {
    methodId: MethodId.ISO_2631,
    methodName: meta.fullName,
    category: meta.category,
    categoryLabel: meta.categoryLabel,
    hierarchyOrder: meta.hierarchyOrder,
    primaryScoreText: `A(8) = ${a8.toFixed(2)} m/s²`,
    secondaryScoreText: `Límites: ${actionLower.toFixed(2)} / ${actionUpper.toFixed(2)} m/s²`,
    severity,
    riskLabel,
    actionLevelText,
    recommendedDeadline: deadline,
    interpretation:
      a8 <= actionLower
        ? `El valor de exposición diaria A(8) = ${a8.toFixed(2)} m/s² no supera el nivel de acción inferior (${actionLower.toFixed(2)} m/s², Tabla 8.3).`
        : a8 <= actionUpper
          ? `El valor diario A(8) = ${a8.toFixed(2)} m/s² supera el nivel de acción inferior (${actionLower.toFixed(2)} m/s²) sin exceder el límite superior (${actionUpper.toFixed(2)} m/s²). Exige medidas técnicas, organizativas y vigilancia médica lumbar.`
          : `El valor diario A(8) = ${a8.toFixed(2)} m/s² supera el Nivel de Acción Superior (${actionUpper.toFixed(2)} m/s²). Debe reducirse la exposición de inmediato.`,
    breakdownRows: [
      ...pRows,
      { parameter: 'Exposición Diaria Total A(8)', value: `${a8.toFixed(2)} m/s²`, reference: `NAI: ${actionLower.toFixed(2)} m/s² · NAS: ${actionUpper.toFixed(2)} m/s² (T0=${T0}h)` },
    ],
    suggestedMeasures: [
      'Verificar amortiguación y regulación antropométrica del asiento con soporte lumbar.',
      'Nivelar irregularidades del pavimento de circulación y revisar neumáticos/suspensión.',
      'Limitar las horas de conducción mediante rotación con tareas sin exposición a vibraciones.',
    ],
  };
}

// ============================================================================
// 15. VIBRACIONES MANO-BRAZO — ISO 5349 (Capítulo 8.4 y 8.6)
// ============================================================================
export function evaluateIso5349(data: Iso5349Data): MethodEvaluationResult {
  const periods = data.periods.length > 0 ? data.periods : [];
  const T0 = Math.max(0.5, getMethodParam(MethodId.ISO_5349, 'T0', 8.0));
  const actionLower = getMethodParam(MethodId.ISO_5349, 'actionLower', 2.5);
  const highThreshold = getMethodParam(MethodId.ISO_5349, 'highThreshold', 4.0);
  const actionUpper = getMethodParam(MethodId.ISO_5349, 'actionUpper', 5.0);

  let sumA8Sq = 0;

  const pRows = periods.map((p) => {
    const ahv = evalMethodExpr(
      MethodId.ISO_5349,
      'ahv',
      { ahwx: p.ahwx, ahwy: p.ahwy, ahwz: p.ahwz },
      Math.sqrt(Math.pow(p.ahwx, 2) + Math.pow(p.ahwy, 2) + Math.pow(p.ahwz, 2)),
    );
    const expH = Math.max(0, p.exposureHours);
    const a8Part = evalMethodExpr(
      MethodId.ISO_5349,
      'a8Partial',
      { ahv, T: expH, T0 },
      ahv * Math.sqrt(expH / T0),
    );
    sumA8Sq += Math.pow(a8Part, 2);
    return {
      parameter: p.toolName,
      value: `ahv = ${ahv.toFixed(2)} m/s² → A(8) parcial = ${a8Part.toFixed(2)} m/s²`,
      reference: `X:${p.ahwx} · Y:${p.ahwy} · Z:${p.ahwz} m/s² · T=${p.exposureHours}h`,
    };
  });

  const a8 = Math.sqrt(sumA8Sq);
  const dyYears = evalMethodExpr(
    MethodId.ISO_5349,
    'latencyYears',
    { A8: Math.max(0.1, a8) },
    31.8 * Math.pow(Math.max(0.1, a8), -1.06),
  );

  let latencyText = 'No previsible (> 20 años)';
  if (a8 >= actionLower) {
    latencyText = dyYears > 25 ? '> 25 años' : `${dyYears.toFixed(1)} años`;
  }

  let severity: RiskSeverity = 'bajo';
  let riskLabel = 'Debajo del Nivel de Acción Inferior';
  let actionLevelText = `A(8) ≤ ${actionLower.toFixed(2)} m/s² — Exposición admisible`;
  let deadline: MethodEvaluationResult['recommendedDeadline'] = 'Sin plazo específico';

  if (a8 > actionUpper) {
    severity = 'muy_alto';
    riskLabel = `Supera Nivel de Acción Superior (${actionUpper.toFixed(2)} m/s²)`;
    actionLevelText = `A(8) > ${actionUpper.toFixed(2)} m/s² — Reducción inmediata obligatoria`;
    deadline = 'Inmediato';
  } else if (a8 > actionLower) {
    severity = a8 >= highThreshold ? 'alto' : 'moderado';
    riskLabel = `Entre Niveles de Acción (${actionLower.toFixed(2)} a ${actionUpper.toFixed(2)} m/s²)`;
    actionLevelText = `Vigilancia médica y reducción técnica (Latencia Dy: ${latencyText})`;
    deadline = 'Corto plazo';
  }

  const meta = METHOD_CATALOG.find((m) => m.id === MethodId.ISO_5349)!;
  return {
    methodId: MethodId.ISO_5349,
    methodName: meta.fullName,
    category: meta.category,
    categoryLabel: meta.categoryLabel,
    hierarchyOrder: meta.hierarchyOrder,
    primaryScoreText: `A(8) = ${a8.toFixed(2)} m/s²`,
    secondaryScoreText: `Latencia Raynaud: ${latencyText}`,
    severity,
    riskLabel,
    actionLevelText,
    recommendedDeadline: deadline,
    interpretation:
      a8 <= actionLower
        ? `El valor diario A(8) = ${a8.toFixed(2)} m/s² se sitúa por debajo del Nivel de Acción Inferior (${actionLower.toFixed(2)} m/s², Tabla 8.4).`
        : a8 <= actionUpper
          ? `El valor diario A(8) = ${a8.toFixed(2)} m/s² supera el Nivel de Acción Inferior (${actionLower.toFixed(2)} m/s²). Tiempo estimado de aparición de manifestaciones vasculares (ISO 5349-1): ${latencyText}.`
          : `El valor diario A(8) = ${a8.toFixed(2)} m/s² excede el Nivel de Acción Superior (${actionUpper.toFixed(2)} m/s²). Alto riesgo de síndrome de vibración mano-brazo; exige intervención inmediata.`,
    breakdownRows: [
      ...pRows,
      { parameter: 'Exposición Diaria Total A(8)', value: `${a8.toFixed(2)} m/s²`, reference: `NAI: ${actionLower.toFixed(2)} m/s² · NAS: ${actionUpper.toFixed(2)} m/s² (T0=${T0}h)` },
      { parameter: 'Latencia estimada manifestaciones vasculares (Dy)', value: latencyText, reference: 'ISO 5349-1 — Fenómeno de Raynaud (10%)' },
    ],
    suggestedMeasures: [
      'Seleccionar herramientas con menor emisión vibratoria y mantener útiles de corte/percusión equilibrados.',
      'Limitar el tiempo diario de uso por operario mediante rotación y pausas de recuperación circulatoria.',
      'Capacitar sobre fuerza mínima de prensión, resguardar manos del frío y proveer guantes antivibración certificados.',
    ],
  };
}

function makeFallbackResult(method: MethodId, interpretation: string): MethodEvaluationResult {
  return {
    methodId: method,
    methodName: 'Método en Evaluación',
    category: 'posturas_forzadas',
    categoryLabel: 'Ergonomía',
    hierarchyOrder: 3,
    primaryScoreText: '-',
    severity: 'bajo',
    riskLabel: 'Bajo / Aceptable',
    actionLevelText: 'Nivel 1 - No requiere acción inmediata',
    recommendedDeadline: 'Sin plazo específico',
    interpretation,
    breakdownRows: [],
    suggestedMeasures: [],
  };
}

// ============================================================================
// DISPATCHER GENERAL POR PESTAÑA (100% Fail-Safe)
// ============================================================================
export function evaluateStudyTab(tab: StudyTab): MethodEvaluationResult {
  try {
    if (!tab || !tab.method) {
      return makeFallbackResult(MethodId.RULA, 'Pestaña sin método asignado');
    }
    const defPayloads = createDefaultPayloads();
    const p = tab.payloads || defPayloads;

    switch (tab.method) {
      case MethodId.RULA:
        return evaluateRula(p[MethodId.RULA] || defPayloads[MethodId.RULA]);
      case MethodId.REBA:
        return evaluateReba(p[MethodId.REBA] || defPayloads[MethodId.REBA]);
      case MethodId.OWAS:
        return evaluateOwas(p[MethodId.OWAS] || defPayloads[MethodId.OWAS]);
      case MethodId.NIOSH:
        return evaluateNiosh(p[MethodId.NIOSH] || defPayloads[MethodId.NIOSH]);
      case MethodId.SNOOK:
        return evaluateSnook(p[MethodId.SNOOK] || defPayloads[MethodId.SNOOK]);
      case MethodId.LMC_295:
        return evaluateLmc295(p[MethodId.LMC_295] || defPayloads[MethodId.LMC_295]);
      case MethodId.OCRA_COMPLETO:
        return evaluateOcraCompleto(p[MethodId.OCRA_COMPLETO] || defPayloads[MethodId.OCRA_COMPLETO]);
      case MethodId.OCRA_CHECKLIST:
        return evaluateOcraChecklist(p[MethodId.OCRA_CHECKLIST] || defPayloads[MethodId.OCRA_CHECKLIST]);
      case MethodId.JSI:
        return evaluateJsi(p[MethodId.JSI] || defPayloads[MethodId.JSI]);
      case MethodId.NAM_295:
        return evaluateNam295(p[MethodId.NAM_295] || defPayloads[MethodId.NAM_295]);
      case MethodId.BIPOLAR:
        return evaluateBipolar(p[MethodId.BIPOLAR]?.scores || defPayloads[MethodId.BIPOLAR].scores);
      case MethodId.FANGER:
        return evaluateFanger(p[MethodId.FANGER] || defPayloads[MethodId.FANGER]);
      case MethodId.WBGT:
        return evaluateWbgt(p[MethodId.WBGT] || defPayloads[MethodId.WBGT]);
      case MethodId.ISO_2631:
        return evaluateIso2631(p[MethodId.ISO_2631] || defPayloads[MethodId.ISO_2631]);
      case MethodId.ISO_5349:
        return evaluateIso5349(p[MethodId.ISO_5349] || defPayloads[MethodId.ISO_5349]);
      default:
        return makeFallbackResult(tab.method, 'Método no reconocido');
    }
  } catch (err) {
    console.warn('evaluateStudyTab fallback error:', err);
    return makeFallbackResult(tab?.method || MethodId.RULA, 'Pendiente de datos');
  }
}


import {
  GeneralStudyData,
  MethodEvaluationResult,
  MethodId,
  NioshData,
  RiskSeverity,
  StudyTab,
} from '../types/ergonomics';
import { METHOD_CATALOG } from './defaults';
import { buildPrioritizedStudies } from '../components/SummarySection';

export type TrafficLightColor = 'rojo' | 'ambar' | 'verde';

export interface TrafficLightRow {
  id: string;
  color: TrafficLightColor;
  statusLabel: string;
  shortBadge: string;
  indicator: string;
  contextLabel: string;
  measuredValue: string;
  normativeThreshold: string;
  actionRequired: string;
  deadline: string;
  isImmediateAlert: boolean;
}

export interface TrafficLightSummary {
  rows: TrafficLightRow[];
  immediateAlerts: TrafficLightRow[];
  redCount: number;
  amberCount: number;
  greenCount: number;
}

export function mapSeverityToTrafficLight(severity: RiskSeverity): {
  color: TrafficLightColor;
  statusLabel: string;
  shortBadge: string;
  isImmediateAlert: boolean;
} {
  if (severity === 'muy_alto' || severity === 'alto') {
    return {
      color: 'rojo',
      statusLabel:
        severity === 'muy_alto'
          ? 'ROJO · ATENCIÓN INMEDIATA'
          : 'ROJO · INTERVENCIÓN PRIORITARIA',
      shortBadge: 'ROJO · CRÍTICO',
      isImmediateAlert: true,
    };
  }
  if (severity === 'moderado') {
    return {
      color: 'ambar',
      statusLabel: 'ÁMBAR · VIGILANCIA / REDISEÑO',
      shortBadge: 'ÁMBAR · PRECAUCIÓN',
      isImmediateAlert: false,
    };
  }
  return {
    color: 'verde',
    statusLabel: 'VERDE · CONDICIÓN ACEPTABLE',
    shortBadge: 'VERDE · SEGURO',
    isImmediateAlert: false,
  };
}

export function describeNioshTrajectory(vOriginCm: number, vDestCm: number): {
  mode: 'levantamiento' | 'descenso' | 'horizontal';
  shortTitle: string;
  technicalExplanation: string;
} {
  const delta = Math.round((vDestCm - vOriginCm) * 10) / 10;
  const absD = Math.round(Math.abs(delta) * 10) / 10;

  if (delta >= 10) {
    return {
      mode: 'levantamiento',
      shortTitle: `Levantamiento ascendente (${vOriginCm} cm → ${vDestCm} cm, D = ${absD} cm)`,
      technicalExplanation:
        `Maniobra de LEVANTAMIENTO ASCENDENTE: la carga se toma desde un nivel inferior (${vOriginCm} cm, ej. suelo/tarima) y se eleva hasta una estantería o plano superior (${vDestCm} cm). ` +
        `Nota de dualidad Origen ↔ Destino: en ciclos reversibles de estiba/desestiba, el punto de origen puede constituir también el destino de la carga (y viceversa); la ecuación evalúa ambos extremos y adopta el RWL más restrictivo.`,
    };
  }

  if (delta <= -10) {
    return {
      mode: 'descenso',
      shortTitle: `Descenso / bajada de carga (${vOriginCm} cm → ${vDestCm} cm, D = ${absD} cm)`,
      technicalExplanation:
        `Maniobra de DESCENSO DE CARGA: el operario retira la carga desde una altura mayor (${vOriginCm} cm, ej. estantería superior) y la deposita en una altura menor (${vDestCm} cm, ej. suelo/tarima). ` +
        `Nota de dualidad Origen ↔ Destino: el descenso exige control excéntrico dorsolumbar en la deposición baja, y en ciclos reversibles ambos puntos alternan su rol de origen y destino.`,
    };
  }

  return {
    mode: 'horizontal',
    shortTitle: `Traslado a nivel equivalente (${vOriginCm} cm ↔ ${vDestCm} cm, D = ${absD} cm)`,
    technicalExplanation:
      `Maniobra de TRASLADO HORIZONTAL / MISMO NIVEL (${vOriginCm} cm a ${vDestCm} cm). ` +
      `En operaciones bidireccionales, el punto de origen puede actuar indistintamente como destino de la carga.`,
  };
}

function getNormativeThresholdForMethod(method: MethodId): string {
  switch (method) {
    case MethodId.NIOSH:
      return 'IL ≤ 1,00 (Masa ≤ RWL)';
    case MethodId.REBA:
      return 'Puntuación ≤ 3 / 15';
    case MethodId.RULA:
      return 'Puntuación ≤ 2 / 7 (Nivel 1)';
    case MethodId.OWAS:
      return 'Categoría de Acción 1';
    case MethodId.SNOOK:
      return 'Razón ≤ 1,00 (≥ 75% pob.)';
    case MethodId.LMC_295:
      return 'Masa real ≤ Límite Tabla Res. 295';
    case MethodId.OCRA_COMPLETO:
      return 'Índice OCRA ≤ 2,2';
    case MethodId.OCRA_CHECKLIST:
      return 'Puntaje Check List ≤ 7,5';
    case MethodId.JSI:
      return 'Índice JSI ≤ 3,0';
    case MethodId.NAM_295:
      return 'Zona Segura (TLV Res. 295/03)';
    case MethodId.BIPOLAR:
      return 'Media ≤ 3,0 / 10';
    case MethodId.FANGER:
      return '-0,5 ≤ PMV ≤ +0,5 (PPD ≤ 10%)';
    case MethodId.WBGT:
      return 'WBGT efectivo ≤ Límite admisible';
    case MethodId.ISO_2631:
      return 'A(8) ≤ 0,50 m/s²';
    case MethodId.ISO_5349:
      return 'A(8) ≤ 2,50 m/s²';
  }
}

export function buildStudyTrafficLightMatrix(
  general: GeneralStudyData,
  tabs: StudyTab[],
): TrafficLightSummary {
  const prioritized = buildPrioritizedStudies(general, tabs);
  const rows: TrafficLightRow[] = [];

  for (const entry of prioritized) {
    const { tab, result } = entry;
    const mapped = mapSeverityToTrafficLight(result.severity);
    const catalog = METHOD_CATALOG.find((m) => m.id === tab.method);
    const topSuggestion =
      result.suggestedMeasures[0] ||
      (mapped.color === 'verde'
        ? 'Mantener condiciones operativas y vigilancia periódica.'
        : 'Aplicar rediseño ergonómico sobre el factor crítico.');

    rows.push({
      id: `tl-tab-${tab.id}`,
      color: mapped.color,
      statusLabel: mapped.statusLabel,
      shortBadge: mapped.shortBadge,
      indicator: `${tab.tabLabel} (${catalog?.shortName || tab.method})`,
      contextLabel: tab.taskEvaluated || 'Subtarea principal del puesto',
      measuredValue: `${result.primaryScoreText}${result.secondaryScoreText ? ` · ${result.secondaryScoreText}` : ''}`,
      normativeThreshold: getNormativeThresholdForMethod(tab.method),
      actionRequired: topSuggestion,
      deadline: tab.implementationDeadline || result.recommendedDeadline,
      isImmediateAlert: mapped.isImmediateAlert,
    });

    // Si es NIOSH, desglosar subfactores geométricos críticos en el semáforo si penalizan significativamente
    if (tab.method === MethodId.NIOSH) {
      const nd = tab.payloads[MethodId.NIOSH];
      const hWorst = nd.evaluateDestination ? Math.max(nd.hOriginCm, nd.hDestCm) : nd.hOriginCm;
      const vMin = nd.evaluateDestination ? Math.min(nd.vOriginCm, nd.vDestCm) : nd.vOriginCm;
      const vMax = nd.evaluateDestination ? Math.max(nd.vOriginCm, nd.vDestCm) : nd.vOriginCm;
      const aWorst = nd.evaluateDestination
        ? Math.max(nd.asymmetryOriginDeg, nd.asymmetryDestDeg)
        : nd.asymmetryOriginDeg;
      const traj = describeNioshTrajectory(nd.vOriginCm, nd.vDestCm);

      if (hWorst > 42) {
        const isRed = hWorst >= 55;
        rows.push({
          id: `tl-niosh-h-${tab.id}`,
          color: isRed ? 'rojo' : 'ambar',
          statusLabel: isRed ? 'ROJO · ATENCIÓN INMEDIATA' : 'ÁMBAR · VIGILANCIA / REDISEÑO',
          shortBadge: isRed ? 'ROJO · CRÍTICO' : 'ÁMBAR · PRECAUCIÓN',
          indicator: `Alcance Horizontal H (${tab.tabLabel})`,
          contextLabel: traj.shortTitle,
          measuredValue: `H máx = ${hWorst} cm`,
          normativeThreshold: 'Óptimo ≤ 25 cm (Máx. 63 cm)',
          actionRequired: 'Acercar la carga al eje corporal eliminando barreras entre operario y estiba.',
          deadline: isRed ? 'Inmediato' : 'Corto plazo',
          isImmediateAlert: isRed,
        });
      }

      if (vMin < 30 || vMax > 145) {
        const isRed = vMin < 18 || vMax > 165;
        rows.push({
          id: `tl-niosh-v-${tab.id}`,
          color: isRed ? 'rojo' : 'ambar',
          statusLabel: isRed ? 'ROJO · ATENCIÓN INMEDIATA' : 'ÁMBAR · VIGILANCIA / REDISEÑO',
          shortBadge: isRed ? 'ROJO · CRÍTICO' : 'ÁMBAR · PRECAUCIÓN',
          indicator: `Altura Vertical V (${traj.mode === 'descenso' ? 'Descenso' : 'Levantamiento'})`,
          contextLabel: `Origen ${nd.vOriginCm} cm ↔ Destino ${nd.vDestCm} cm`,
          measuredValue: `V rango: ${nd.vOriginCm} → ${nd.vDestCm} cm`,
          normativeThreshold: 'Zona óptima: 50 – 110 cm (Ideal 75 cm)',
          actionRequired:
            vMin < 30
              ? 'Elevar nivel inferior con plataforma/mesa tijera para evitar toma/depósito a ras de suelo.'
              : 'Descender nivel de estantería superior por debajo de la altura acromial (hombros).',
          deadline: isRed ? 'Inmediato' : 'Corto plazo',
          isImmediateAlert: isRed,
        });
      }

      if (aWorst >= 30) {
        const isRed = aWorst >= 45;
        rows.push({
          id: `tl-niosh-a-${tab.id}`,
          color: isRed ? 'rojo' : 'ambar',
          statusLabel: isRed ? 'ROJO · ATENCIÓN INMEDIATA' : 'ÁMBAR · VIGILANCIA / REDISEÑO',
          shortBadge: isRed ? 'ROJO · CRÍTICO' : 'ÁMBAR · PRECAUCIÓN',
          indicator: `Giro / Asimetría Torácica A (${tab.tabLabel})`,
          contextLabel: 'Rotación entre origen y destino',
          measuredValue: `A = ${aWorst}°`,
          normativeThreshold: 'A ≤ 15° (Plano sagital 0°)',
          actionRequired: 'Reorientar tarima o estantería a 90° e instruir pivotar con los pies sin rotar columna.',
          deadline: isRed ? 'Inmediato' : 'Corto plazo',
          isImmediateAlert: isRed,
        });
      }
    }
  }

  const orderWeight: Record<TrafficLightColor, number> = { rojo: 0, ambar: 1, verde: 2 };
  rows.sort((a, b) => orderWeight[a.color] - orderWeight[b.color]);

  const immediateAlerts = rows.filter((r) => r.isImmediateAlert);
  const redCount = rows.filter((r) => r.color === 'rojo').length;
  const amberCount = rows.filter((r) => r.color === 'ambar').length;
  const greenCount = rows.filter((r) => r.color === 'verde').length;

  return {
    rows,
    immediateAlerts,
    redCount,
    amberCount,
    greenCount,
  };
}

export function buildVideoBiomechTrafficLight(params: {
  nioshData: NioshData;
  nioshResult: MethodEvaluationResult;
  rebaResult: MethodEvaluationResult;
  trunkFlexionDeg: number;
  kneeFlexionDeg: number;
  rightElbowDeg: number;
  leftElbowDeg: number;
}): TrafficLightSummary {
  const {
    nioshData,
    nioshResult,
    rebaResult,
    trunkFlexionDeg,
    kneeFlexionDeg,
    rightElbowDeg,
    leftElbowDeg,
  } = params;

  const rows: TrafficLightRow[] = [];
  const traj = describeNioshTrajectory(nioshData.vOriginCm, nioshData.vDestCm);

  // 1. NIOSH Global
  const nioshMapped = mapSeverityToTrafficLight(nioshResult.severity);
  rows.push({
    id: 'vid-niosh',
    color: nioshMapped.color,
    statusLabel: nioshMapped.statusLabel,
    shortBadge: nioshMapped.shortBadge,
    indicator: 'Ecuación NIOSH (Origen ↔ Destino)',
    contextLabel: traj.shortTitle,
    measuredValue: `${nioshResult.primaryScoreText} (${nioshResult.secondaryScoreText || ''})`,
    normativeThreshold: 'IL ≤ 1,00 (Masa ≤ RWL)',
    actionRequired:
      nioshResult.suggestedMeasures[0] ||
      'Conservar masa y geometría dentro del Límite de Peso Recomendado (RWL).',
    deadline: nioshResult.recommendedDeadline,
    isImmediateAlert: nioshMapped.isImmediateAlert,
  });

  // 2. REBA Global
  const rebaMapped = mapSeverityToTrafficLight(rebaResult.severity);
  rows.push({
    id: 'vid-reba',
    color: rebaMapped.color,
    statusLabel: rebaMapped.statusLabel,
    shortBadge: rebaMapped.shortBadge,
    indicator: 'Carga Postural Cuerpo Entero (REBA)',
    contextLabel: 'Instante crítico de mayor solicitación articular',
    measuredValue: rebaResult.primaryScoreText,
    normativeThreshold: 'Puntuación ≤ 3 / 15',
    actionRequired:
      rebaResult.suggestedMeasures[0] ||
      'Corregir flexión vertebral y alcances distales en el instante crítico.',
    deadline: rebaResult.recommendedDeadline,
    isImmediateAlert: rebaMapped.isImmediateAlert,
  });

  // 3. Flexión de Tronco
  const absTrunk = Math.abs(trunkFlexionDeg);
  const trunkColor: TrafficLightColor =
    absTrunk > 60 ? 'rojo' : absTrunk > 20 ? 'ambar' : 'verde';
  rows.push({
    id: 'vid-trunk',
    color: trunkColor,
    statusLabel:
      trunkColor === 'rojo'
        ? 'ROJO · ATENCIÓN INMEDIATA'
        : trunkColor === 'ambar'
          ? 'ÁMBAR · VIGILANCIA / REDISEÑO'
          : 'VERDE · CONDICIÓN ACEPTABLE',
    shortBadge:
      trunkColor === 'rojo'
        ? 'ROJO · CRÍTICO'
        : trunkColor === 'ambar'
          ? 'ÁMBAR · PRECAUCIÓN'
          : 'VERDE · SEGURO',
    indicator: 'Flexión Sagital de Tronco (L5/S1 – C7)',
    contextLabel: 'Compresión y cizalladura intradiscal lumbar',
    measuredValue: `${trunkFlexionDeg}°`,
    normativeThreshold: '0° – 20° (Crítico > 60°)',
    actionRequired:
      trunkColor === 'rojo'
        ? 'Elevar de inmediato el plano inferior de carga para suprimir flexión lumbar > 60°.'
        : trunkColor === 'ambar'
          ? 'Regular altura de estiba/mesa entre 60 y 90 cm para reducir inclinación del tronco.'
          : 'Postura de tronco dentro del margen ergonómico neutro.',
    deadline: trunkColor === 'rojo' ? 'Inmediato' : trunkColor === 'ambar' ? 'Corto plazo' : 'Sin plazo específico',
    isImmediateAlert: trunkColor === 'rojo',
  });

  // 4. Distancia Horizontal H
  const hWorst = Math.max(nioshData.hOriginCm, nioshData.hDestCm);
  const hColor: TrafficLightColor = hWorst >= 50 ? 'rojo' : hWorst > 30 ? 'ambar' : 'verde';
  rows.push({
    id: 'vid-h',
    color: hColor,
    statusLabel:
      hColor === 'rojo'
        ? 'ROJO · ATENCIÓN INMEDIATA'
        : hColor === 'ambar'
          ? 'ÁMBAR · VIGILANCIA / REDISEÑO'
          : 'VERDE · CONDICIÓN ACEPTABLE',
    shortBadge:
      hColor === 'rojo'
        ? 'ROJO · CRÍTICO'
        : hColor === 'ambar'
          ? 'ÁMBAR · PRECAUCIÓN'
          : 'VERDE · SEGURO',
    indicator: 'Distancia Horizontal al Agarre (H)',
    contextLabel: 'Brazo de palanca respecto a tobillos',
    measuredValue: `H = ${hWorst} cm`,
    normativeThreshold: 'H ≤ 25 cm (Máx. 63 cm)',
    actionRequired:
      hColor === 'rojo'
        ? 'Eliminar obstáculos frontales o profundidad excesiva de estantería/tarima (H ≥ 50 cm).'
        : hColor === 'ambar'
          ? 'Aproximar la caja al abdomen antes de iniciar el desplazamiento vertical.'
          : 'Distancia horizontal óptima próxima al centro de gravedad corporal.',
    deadline: hColor === 'rojo' ? 'Inmediato' : hColor === 'ambar' ? 'Medio plazo' : 'Sin plazo específico',
    isImmediateAlert: hColor === 'rojo',
  });

  // 5. Alturas Verticales y Sentido (Origen ↔ Destino)
  const vMin = Math.min(nioshData.vOriginCm, nioshData.vDestCm);
  const vMax = Math.max(nioshData.vOriginCm, nioshData.vDestCm);
  const vColor: TrafficLightColor =
    vMin < 22 || vMax > 155 ? 'rojo' : vMin < 45 || vMax > 125 ? 'ambar' : 'verde';
  rows.push({
    id: 'vid-v',
    color: vColor,
    statusLabel:
      vColor === 'rojo'
        ? 'ROJO · ATENCIÓN INMEDIATA'
        : vColor === 'ambar'
          ? 'ÁMBAR · VIGILANCIA / REDISEÑO'
          : 'VERDE · CONDICIÓN ACEPTABLE',
    shortBadge:
      vColor === 'rojo'
        ? 'ROJO · CRÍTICO'
        : vColor === 'ambar'
          ? 'ÁMBAR · PRECAUCIÓN'
          : 'VERDE · SEGURO',
    indicator: `Cota Vertical V (${traj.mode === 'descenso' ? 'Descenso' : traj.mode === 'levantamiento' ? 'Levantamiento' : 'Traslado'})`,
    contextLabel: 'Origen y destino intercambiables en ciclo reversible',
    measuredValue: `${nioshData.vOriginCm} cm → ${nioshData.vDestCm} cm`,
    normativeThreshold: '50 – 110 cm (Óptimo 75 cm)',
    actionRequired:
      vMin < 22
        ? 'Suprimir manipulación a ras de piso (< 22 cm) mediante plataforma o mesa elevadora.'
        : vMax > 155
          ? 'Suprimir depósito o toma por encima de hombros (> 155 cm) reubicando nivel de estantería.'
          : vColor === 'ambar'
            ? 'Acercar ambos niveles (origen y destino) a la franja nudillos-codos (75 cm).'
            : 'Recorrido vertical contenido en franja anatómica confortable.',
    deadline: vColor === 'rojo' ? 'Inmediato' : vColor === 'ambar' ? 'Corto plazo' : 'Sin plazo específico',
    isImmediateAlert: vColor === 'rojo',
  });

  // 6. Asimetría y Articulaciones Periféricas (Rodillas / Codos)
  const aWorst = Math.max(nioshData.asymmetryOriginDeg, nioshData.asymmetryDestDeg);
  const elbowOut =
    rightElbowDeg < 60 || rightElbowDeg > 100 || leftElbowDeg < 60 || leftElbowDeg > 100;
  const asymColor: TrafficLightColor =
    aWorst >= 45 || kneeFlexionDeg > 90
      ? 'rojo'
      : aWorst >= 20 || kneeFlexionDeg > 60 || elbowOut
        ? 'ambar'
        : 'verde';
  rows.push({
    id: 'vid-asym-joints',
    color: asymColor,
    statusLabel:
      asymColor === 'rojo'
        ? 'ROJO · ATENCIÓN INMEDIATA'
        : asymColor === 'ambar'
          ? 'ÁMBAR · VIGILANCIA / REDISEÑO'
          : 'VERDE · CONDICIÓN ACEPTABLE',
    shortBadge:
      asymColor === 'rojo'
        ? 'ROJO · CRÍTICO'
        : asymColor === 'ambar'
          ? 'ÁMBAR · PRECAUCIÓN'
          : 'VERDE · SEGURO',
    indicator: 'Asimetría A, Rodillas y Codos',
    contextLabel: 'Alineación axial y reparto articular',
    measuredValue: `A=${aWorst}° · Rod=${kneeFlexionDeg}° · Codos=${rightElbowDeg}°/${leftElbowDeg}°`,
    normativeThreshold: 'A ≤ 15° · Rod ≤ 60° · Codos 60°–100°',
    actionRequired:
      asymColor === 'rojo'
        ? 'Eliminar torsión axial severa o cuclillas profundas rediseñando la disposición angular de estantería/tarima.'
        : asymColor === 'ambar'
          ? 'Alinear planos de origen y destino para operar en plano sagital con codos próximos a 80°–90°.'
          : 'Alineación simétrica adecuada en tren inferior y miembros superiores.',
    deadline: asymColor === 'rojo' ? 'Inmediato' : asymColor === 'ambar' ? 'Medio plazo' : 'Sin plazo específico',
    isImmediateAlert: asymColor === 'rojo',
  });

  const orderWeight: Record<TrafficLightColor, number> = { rojo: 0, ambar: 1, verde: 2 };
  rows.sort((a, b) => orderWeight[a.color] - orderWeight[b.color]);

  return {
    rows,
    immediateAlerts: rows.filter((r) => r.isImmediateAlert),
    redCount: rows.filter((r) => r.color === 'rojo').length,
    amberCount: rows.filter((r) => r.color === 'ambar').length,
    greenCount: rows.filter((r) => r.color === 'verde').length,
  };
}

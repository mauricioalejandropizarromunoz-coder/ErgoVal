import { GeneralStudyData, MethodId, StudyTab } from '../types/ergonomics';
import { createDefaultPayloads, createInitialGeneralData, createNewStudyTab } from './defaults';

export interface StudyPreset {
  id: string;
  title: string;
  subtitle: string;
  general: GeneralStudyData;
  tabs: StudyTab[];
}

export function buildPresetEmpresaX(): { general: GeneralStudyData; tabs: StudyTab[] } {
  const general = createInitialGeneralData();

  const tab1 = createNewStudyTab(1, MethodId.OCRA_CHECKLIST, 'Extracción de tierra y apisonado manual en canalización');
  tab1.tabLabel = '1. OCRA Check List';
  tab1.evaluatorObservations =
    'Se observa alternancia entre uso de pala manual y pisón metálico durante la jornada, con pausas operativas de recuperación distribuidas cada hora.';
  tab1.correctiveMeasures =
    'Mantener el esquema de rotación entre apertura de zanja, tendido y tapado para conservar el índice Check List en zona aceptable.';
  tab1.implementationDeadline = 'Sin plazo específico';

  const tab2 = createNewStudyTab(2, MethodId.LMC_295, 'Levantamiento vertical de pisón manual de hierro (13,2 kg)');
  tab2.tabLabel = '2. LMC Res. 295/03';
  tab2.evaluatorObservations =
    'El pisón manual pesa 13,2 kg, manteniéndose próximo al cuerpo (< 30 cm desde punto medio entre tobillos) entre altura de nudillos y hombros, con menos de 2 horas acumuladas por jornada.';
  tab2.correctiveMeasures =
    'Verificar el estado del mango cilíndrico y utilizar guantes con buen coeficiente de fricción para sostener un acoplamiento seguro.';
  tab2.implementationDeadline = 'Sin plazo específico';

  const tab3 = createNewStudyTab(3, MethodId.REBA, 'Postura de excavación y perfilado en fondo de zanja (1,10 m)');
  tab3.tabLabel = '3. REBA Cuerpo Entero';
  tab3.payloads[MethodId.REBA] = {
    ...createDefaultPayloads()[MethodId.REBA],
    evaluatedSide: 'derecho',
    trunkPos: 3,
    trunkTwistedOrSide: true,
    neckPos: 2,
    neckTwistedOrSide: false,
    legsBase: 2,
    legsKneeFlexion: 1,
    loadForce: 1,
    shockForce: false,
    right: {
      upperArmPos: 3,
      shoulderRaised: false,
      armAbducted: true,
      armSupported: false,
      lowerArmPos: 2,
      wristPos: 2,
      wristTwistedOrDeviated: true,
      coupling: 1,
    },
    left: {
      upperArmPos: 2,
      shoulderRaised: false,
      armAbducted: false,
      armSupported: false,
      lowerArmPos: 1,
      wristPos: 1,
      wristTwistedOrDeviated: false,
      coupling: 1,
    },
    activityStatic: false,
    activityRepetitive: true,
    activityUnstableChanges: true,
  };
  tab3.evaluatorObservations =
    'Durante la extracción de tierra en zanja estrecha se registra flexión de tronco entre 20° y 60° combinada con torsión axial al arrojar el material hacia el borde superior.';
  tab3.correctiveMeasures =
    'Emplear palas de cabo largo adaptado a la profundidad de zanja, alternar el perfil de descarga (derecha/izquierda) e incorporar equipos mecánicos zanjadores en tramos extensos.';
  tab3.implementationDeadline = 'Corto plazo';

  const tab4 = createNewStudyTab(4, MethodId.NAM_295, 'Actividad manual distal en uso de herramientas de mano');
  tab4.tabLabel = '4. NAM Res. 295/03';
  tab4.evaluatorObservations =
    'Mano derecha presenta mayor solicitación que mano izquierda (NAM = 3,0; Fuerza pico Borg = 1,0), ubicándose ambas dentro de la Zona de Seguridad.';
  tab4.correctiveMeasures =
    'Conservar mangos ergonómicos recubiertos y evitar compresión mecánica localizada en palma de la mano.';
  tab4.implementationDeadline = 'Sin plazo específico';

  const tab5 = createNewStudyTab(5, MethodId.BIPOLAR, 'Relevamiento subjetivo de fatiga y confort osteomuscular');
  tab5.tabLabel = '5. Cuestionario Bipolar';
  tab5.evaluatorObservations =
    'El relevamiento psicofísico evidencia fatiga leve al cierre de la jornada sin manifestaciones dolorosas agudas en segmentos vertebrales ni miembros superiores.';
  tab5.correctiveMeasures =
    'Sostener hidratación en frente de obra y ejercicios breves de elongación dorso-lumbar previos al inicio de tarea.';
  tab5.implementationDeadline = 'Sin plazo específico';

  return { general, tabs: [tab1, tab2, tab3, tab4, tab5] };
}

export function buildPresetLibroEjemplos(): { general: GeneralStudyData; tabs: StudyTab[] } {
  const base = createInitialGeneralData();
  const general: GeneralStudyData = {
    ...base,
    companyName: 'Industrias Metalmecánicas y Logísticas del Sur S.A.',
    companyTaxId: '30-68914022-4',
    companyActivity: 'Manufactura industrial, ensamble electromecánico, hornos y expedición logística',
    companyAddress: 'Ruta Provincial 24 Km 8,5 — Parque Industrial',
    companyTotalWorkers: 145,
    workstationName: 'Línea Integral de Producción, Ensamble y Expedición (Casos del Libro)',
    department: 'Planta Industrial',
    supervisorName: 'Gerencia de Producción y Mantenimiento',
    exposedWorkersCount: 12,
    shiftDurationHours: 8,
    workScheduleAndBreaks: 'Turno rotativo de 8 h (480 min) con 30 min de comedor y dos pausas de 15 min.',
    workstationDescription:
      'Conjunto de puestos representativos desarrollados en los Capítulos 4 a 8 del libro: ensamble de componentes, paletizado manual de cajas de 18 kg, empaque repetitivo, atención de horno y demolición/rebarbado.',
    mainTasks:
      '1. Paletizado manual de cajas desde tarima baja a cinta transportadora (18 kg).\n2. Empaque repetitivo de unidades en línea continua.\n3. Ensamble electrónico sobre banco.\n4. Operación frente a horno de tratamiento térmico y uso de martillo neumático.',
    equipmentAndFurniture:
      'Cinta transportadora a 80 cm, tarimas de madera, banco fijo de ensamble, horno industrial y herramientas neumáticas.',
    previousInjuriesOrSymptoms: true,
    previousInjuriesDetail: 'Antecedentes de lumbalgia mecánica en sector de expedición y parestesias distales en línea de empaque.',
    hazardsIdentified: {
      posturas_forzadas: true,
      manipulacion_cargas: true,
      movimientos_repetitivos: true,
      ambiente_termico: true,
      vibraciones: true,
    },
    customGlobalConclusion: '',
  };

  const tNiosh = createNewStudyTab(1, MethodId.NIOSH, 'Paletizado manual de cajas de 18 kg (Ejemplo Cap. 5.5)');
  tNiosh.tabLabel = '1. NIOSH (Cap. 5.5)';
  tNiosh.evaluatorObservations =
    'El Índice de Levantamiento alcanza 3,13 en destino debido a la combinación de frecuencia (4 lev/min en jornada larga), altura inicial baja (20 cm) y asimetría de 45°.';
  tNiosh.correctiveMeasures =
    'Instalar mesa elevadora de tijera para elevar el origen a 75 cm y reorientar la tarima a 90° para eliminar el giro axial de 45°.';
  tNiosh.implementationDeadline = 'Inmediato';

  const tOcra = createNewStudyTab(2, MethodId.OCRA_COMPLETO, 'Línea de empaque repetitivo de alta cadencia (Ejemplo Cap. 6.5)');
  tOcra.tabLabel = '2. OCRA Completo (Cap. 6.5)';
  tOcra.evaluatorObservations =
    'Con 60 acciones técnicas/min durante 420 minutos netos y pausas insuficientes, el índice OCRA resulta crítico (21,1), superando ampliamente el umbral de 4,5.';
  tOcra.correctiveMeasures =
    'Rediseñar el ciclo para disminuir acciones técnicas por unidad, introducir pausas de recuperación de 8–10 min cada hora y rotar con tareas no repetitivas.';
  tOcra.implementationDeadline = 'Inmediato';

  const tRula = createNewStudyTab(3, MethodId.RULA, 'Ensamblaje manual de tarjetas electrónicas (Ejemplo Cap. 4.2.7)');
  tRula.tabLabel = '3. RULA (Cap. 4.2)';
  tRula.evaluatorObservations =
    'La altura baja del banco obliga a sostener flexión cervical y de tronco con abducción braquial durante más del 50 % del ciclo.';
  tRula.correctiveMeasures =
    'Incorporar plano inclinado regulable, apoyabrazos acolchados y portaherramientas suspendido dentro del alcance neutro.';
  tRula.implementationDeadline = 'Corto plazo';

  const tOwas = createNewStudyTab(4, MethodId.OWAS, 'Muestreo de 100 observaciones en carga logística (Ejemplo Cap. 4.4.8)');
  tOwas.tabLabel = '4. OWAS (Cap. 4.4)';
  tOwas.evaluatorObservations =
    'El 30 % del ciclo transcurre en Categoría de Acción 4 (espalda flexionada con rodillas flexionadas y carga > 20 kg) y 35 % en Categoría 3.';
  tOwas.correctiveMeasures =
    'Incorporar ayudas mecánicas de izaje por vacío y elevar las estibas sobre plataformas a nivel de cadera.';
  tOwas.implementationDeadline = 'Inmediato';

  const tWbgt = createNewStudyTab(5, MethodId.WBGT, 'Carga y descarga frente a horno industrial (Ejemplo Cap. 7.5)');
  tWbgt.tabLabel = '5. WBGT Calor (Cap. 7.5)';
  tWbgt.evaluatorObservations =
    'El índice WBGT calculado (31,7 °C) excede el límite de 26,0 °C para metabolismo alto (400 W), exigiendo régimen estricto de trabajo-descanso.';
  tWbgt.correctiveMeasures =
    'Instalar pantallas reflectantes de radiación infrarroja frente al horno y aplicar ciclo de descanso en sala climatizada (WBGT ≤ 24 °C).';
  tWbgt.implementationDeadline = 'Inmediato';

  const tIso5349 = createNewStudyTab(6, MethodId.ISO_5349, 'Operación con martillo neumático (Ejemplo Cap. 8.6)');
  tIso5349.tabLabel = '6. ISO 5349 Vibración (Cap. 8.6)';
  tIso5349.evaluatorObservations =
    'La aceleración triaxial ahv = 6,16 m/s² durante 3 h produce A(8) = 3,77 m/s², superando el Nivel de Acción Inferior de 2,50 m/s².';
  tIso5349.correctiveMeasures =
    'Sustituir útil por modelo con amortiguación activa y limitar exposición diaria individual por debajo de 1 h 20 min.';
  tIso5349.implementationDeadline = 'Corto plazo';

  return { general, tabs: [tNiosh, tOcra, tRula, tOwas, tWbgt, tIso5349] };
}

export function buildBlankStudy(): { general: GeneralStudyData; tabs: StudyTab[] } {
  const today = new Date().toISOString().slice(0, 10);
  const nextYear = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const general: GeneralStudyData = {
    companyName: '',
    companyTaxId: '',
    companyActivity: '',
    companyAddress: '',
    companyTotalWorkers: 1,
    evaluatorName: '',
    evaluatorTitle: '',
    evaluatorLicense: '',
    evaluatorRegistry: '',
    evaluationDate: today,
    reportDate: today,
    nextReevaluationDate: nextYear,
    workstationName: '',
    department: '',
    supervisorName: '',
    exposedWorkersCount: 1,
    shiftDurationHours: 8,
    workScheduleAndBreaks: '',
    workstationDescription: '',
    mainTasks: '',
    equipmentAndFurniture: '',
    previousInjuriesOrSymptoms: false,
    previousInjuriesDetail: '',
    hazardsIdentified: {
      posturas_forzadas: true,
      manipulacion_cargas: false,
      movimientos_repetitivos: false,
      ambiente_termico: false,
      vibraciones: false,
    },
    customGlobalConclusion: '',
  };

  const tab1 = createNewStudyTab(1, MethodId.RULA, '');
  tab1.tabLabel = 'Estudio 1: RULA';
  return { general, tabs: [tab1] };
}

export const buildPresetPoseSa = buildPresetEmpresaX;


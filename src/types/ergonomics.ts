export enum MethodId {
  RULA = 'RULA',
  REBA = 'REBA',
  OWAS = 'OWAS',
  NIOSH = 'NIOSH',
  SNOOK = 'SNOOK',
  LMC_295 = 'LMC_295',
  OCRA_COMPLETO = 'OCRA_COMPLETO',
  OCRA_CHECKLIST = 'OCRA_CHECKLIST',
  JSI = 'JSI',
  NAM_295 = 'NAM_295',
  BIPOLAR = 'BIPOLAR',
  FANGER = 'FANGER',
  WBGT = 'WBGT',
  ISO_2631 = 'ISO_2631',
  ISO_5349 = 'ISO_5349',
}

export type RiskCategory =
  | 'posturas_forzadas'
  | 'manipulacion_cargas'
  | 'movimientos_repetitivos'
  | 'ambiente_termico'
  | 'vibraciones';

export type RiskSeverity = 'bajo' | 'moderado' | 'alto' | 'muy_alto';

export interface MethodCatalogItem {
  id: MethodId;
  shortName: string;
  fullName: string;
  chapterRef: string;
  category: RiskCategory;
  categoryLabel: string;
  hierarchyOrder: 1 | 2 | 3 | 4 | 5;
  needsAngleGuides: boolean;
  needsDataTableUpload: boolean;
  description: string;
  justificationTemplate: string;
}

export interface GeneralStudyData {
  // Empresa evaluada
  companyName: string;
  companyTaxId: string;
  companyActivity: string;
  companyAddress: string;
  companyTotalWorkers: number;
  companyLogoDataUrl?: string;

  // Evaluador
  evaluatorName: string;
  evaluatorTitle: string;
  evaluatorLicense: string;
  evaluatorRegistry: string;
  evaluationDate: string;
  reportDate: string;
  nextReevaluationDate: string;

  // Puesto de trabajo evaluado
  workstationName: string;
  department: string;
  supervisorName: string;
  exposedWorkersCount: number;
  shiftDurationHours: number;
  workScheduleAndBreaks: string;
  workstationDescription: string;
  mainTasks: string;
  equipmentAndFurniture: string;
  previousInjuriesOrSymptoms: boolean;
  previousInjuriesDetail: string;

  // Peligros identificados (Paso 1 Protocolo)
  hazardsIdentified: {
    posturas_forzadas: boolean;
    manipulacion_cargas: boolean;
    movimientos_repetitivos: boolean;
    ambiente_termico: boolean;
    vibraciones: boolean;
  };

  // Conclusión global personalizada opcional
  customGlobalConclusion: string;
}

export interface AngleAnnotation {
  id: string;
  label: string;
  // Normalized coordinates (0..1) relative to image width/height
  p1: { x: number; y: number };
  vertex: { x: number; y: number };
  p2: { x: number; y: number };
  degrees: number;
}

export interface StudyPhoto {
  id: string;
  name: string;
  dataUrl: string;
  annotatedDataUrl?: string;
  caption: string;
  annotations: AngleAnnotation[];
}

// 1. RULA
export interface RulaSideInput {
  upperArmPos: 1 | 2 | 3 | 4;
  shoulderRaised: boolean;
  armAbducted: boolean;
  armSupported: boolean;
  lowerArmPos: 1 | 2;
  lowerArmCrossMidline: boolean;
  wristPos: 1 | 2 | 3;
  wristDeviated: boolean;
  wristTwist: 1 | 2;
  muscleUseA: 0 | 1;
  forceLoadA: 0 | 1 | 2 | 3;
}

export interface RulaData {
  evaluatedSide: 'derecho' | 'izquierdo' | 'ambos';
  right: RulaSideInput;
  left: RulaSideInput;
  neckPos: 1 | 2 | 3 | 4;
  neckRotated: boolean;
  neckSideBending: boolean;
  trunkPos: 1 | 2 | 3 | 4;
  trunkTwisted: boolean;
  trunkSideBending: boolean;
  legsPos: 1 | 2;
  muscleUseB: 0 | 1;
  forceLoadB: 0 | 1 | 2 | 3;
  cycleDurationSec: number;
  postureHoldTimeSec: number;
}

// 2. REBA
export interface RebaSideInput {
  upperArmPos: 1 | 2 | 3 | 4;
  shoulderRaised: boolean;
  armAbducted: boolean;
  armSupported: boolean;
  lowerArmPos: 1 | 2;
  wristPos: 1 | 2;
  wristTwistedOrDeviated: boolean;
  coupling: 0 | 1 | 2 | 3;
}

export interface RebaData {
  evaluatedSide: 'derecho' | 'izquierdo' | 'ambos';
  trunkPos: 1 | 2 | 3 | 4;
  trunkTwistedOrSide: boolean;
  neckPos: 1 | 2;
  neckTwistedOrSide: boolean;
  legsBase: 1 | 2;
  legsKneeFlexion: 0 | 1 | 2; // 0: <30°, +1: 30°-60°, +2: >60° o cuclillas/rodillas
  loadForce: 0 | 1 | 2;
  shockForce: boolean;
  right: RebaSideInput;
  left: RebaSideInput;
  activityStatic: boolean;
  activityRepetitive: boolean;
  activityUnstableChanges: boolean;
}

// 3. OWAS
export interface OwasObservation {
  id: string;
  taskPhase: string;
  back: 1 | 2 | 3 | 4;
  arms: 1 | 2 | 3;
  legs: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  load: 1 | 2 | 3;
  frequencyCount: number;
}

export interface OwasData {
  observations: OwasObservation[];
}

// 4. NIOSH
export interface NioshData {
  loadWeightKg: number;
  evaluateDestination: boolean;
  hOriginCm: number;
  hDestCm: number;
  vOriginCm: number;
  vDestCm: number;
  asymmetryOriginDeg: number;
  asymmetryDestDeg: number;
  frequencyLiftsPerMin: number;
  durationCategory: 'le_1h' | '1_to_2h' | '2_to_8h';
  couplingQuality: 'bueno' | 'regular' | 'malo';
}

// 5. Snook y Ciriello
export interface SnookData {
  operationType: 'levantamiento' | 'empuje' | 'traccion' | 'transporte';
  population: 'masculina' | 'femenina';
  // Levantamiento
  liftHeightZone: 'sobre_cabeza' | 'hombros' | 'rodillas_o_inferior';
  liftFrequencyPerMin: 0.2 | 0.5 | 1 | 2 | 3 | 4 | 5 | 6 | 8;
  actualWeightKg: number;
  // Empuje / Tracción
  handHeightZone: 'hombros' | 'codo' | 'pies';
  pushPullDistance: '2m' | '60m';
  actualInitialForceN: number;
  actualSustainedForceN: number;
  // Transporte
  carryDistance: 'hasta_2m' | '2_a_10m' | 'mas_10m';
}

// 6. LMC Res. 295/03
export interface Lmc295Data {
  actualWeightKg: number;
  durationHours: 'hasta_2h' | 'mayor_2h';
  liftsPerHour: number;
  verticalZone: 'sobre_hombro' | 'nudillos_a_hombro' | 'espinilla_a_nudillos' | 'suelo_a_espinilla';
  horizontalZone: 'proximo_30' | 'intermedio_30_60' | 'alejado_60_80';
  originHeightCm: number;
  destHeightCm: number;
  asymmetryOver30Deg: boolean;
  oneHandedLift: boolean;
  constrainedCrouchedPosture: boolean;
  poorCoupling: boolean;
  unstableLoadOrFooting: boolean;
  highHeatHumidity: boolean;
}

// 7. OCRA Análisis Completo (Cap. 6.2)
export interface OcraCompletoData {
  actionsPerCycle: number;
  cycleDurationSec: number;
  netRepetitiveMinutes: number;
  fmForce: 1.0 | 0.85 | 0.65 | 0.35 | 0.15;
  fpPosture: 1.0 | 0.85 | 0.7 | 0.5;
  ffRepetitiveness: 1.0 | 0.9 | 0.7 | 0.5 | 0.3;
  feStereotypy: 1.0 | 0.85 | 0.7;
  faPhysicalAgents: 1.0 | 0.9 | 0.8;
  ftRecovery: 1.0 | 0.85 | 0.7;
  fcDuration: 1.0 | 0.9 | 0.8 | 0.7 | 0.6;
}

// 8. OCRA Lista de Verificación (Cap. 6.3 + Ficha Bilateral)
export interface OcraChecklistSide {
  frequencyFactor: number; // 0..10
  forceFactor: number; // 0..24
  shoulderScore: number; // 0..24
  elbowScore: number; // 0..8
  wristScore: number; // 0..8
  handGripScore: number; // 0..8
  stereotypyScore: number; // 0 | 1.5 | 3
  complementaryPhysicalScore: number; // 0..3
  complementaryOrganizationalScore: number; // 0 | 1 | 2
}

export interface OcraChecklistData {
  mode: 'libro_coeficientes' | 'clasico_bilateral';
  // Modo libro (Tabla 6.11 - 6.17)
  actionsPerCycle: number;
  cycleDurationSec: number;
  netRepetitiveMinutes: number;
  coefRecovery: 1.0 | 0.8 | 0.6;
  coefFrequency: 1.0 | 0.8 | 0.6 | 0.4;
  coefForce: 1.0 | 0.85 | 0.65 | 0.35 | 0.15;
  coefPosture: 1.0 | 0.85 | 0.7 | 0.5;
  coefComplementary: 1.0 | 0.9 | 0.8 | 0.7;
  coefStereotypy: 1.0 | 0.85 | 0.7;
  coefDuration: 1.0 | 0.9 | 0.8 | 0.7 | 0.6;
  // Modo clásico bilateral (Fichas 1-6 del Informe)
  shiftMinutes: number;
  officialBreaksMinutes: number;
  lunchBreakMinutes: number;
  nonRepetitiveMinutes: number;
  recoveryFactorScore: 0 | 2 | 3 | 4 | 6 | 10;
  right: OcraChecklistSide;
  left: OcraChecklistSide;
}

// 9. JSI (Cap. 6.4)
export interface JsiData {
  ieIntensity: 1 | 2 | 3 | 4 | 5;
  effortDurationSec: number;
  cycleDurationSec: number;
  deDurationScore: 1 | 2 | 3 | 4 | 5;
  epmEffortsScore: 1 | 2 | 3 | 4 | 5;
  pmWristPosture: 1 | 2 | 3 | 4 | 5;
  htHoursPerDay: 1 | 2 | 3 | 4 | 5;
  npSpeedWork: 1 | 2 | 3 | 4 | 5;
  autoComputeCycleScores: boolean;
}

// 10. NAM Res. 295/03
export interface NamHandInput {
  effortsCount: number;
  observationPeriodSec: number;
  effortTimeSec: number;
  borgPeakForce: number; // 0 to 10
}

export interface Nam295Data {
  right: NamHandInput;
  left: NamHandInput;
  prolongedAwkwardWrist: boolean;
  contactStress: boolean;
}

// 11. Cuestionario Bipolar
export interface BipolarData {
  scores: number[]; // 15 items from 0 to 10
}

// 12. Fanger (Cap. 7.2 y Planilla Multipunto Cap. 12 Tabla 12.4)
export interface FangerSampleRow {
  id: string;
  sectorLabel: string;
  airTempC: number;
  radiantTempC: number;
  relativeHumidityPct: number;
  airVelocityMs: number;
  metabolicRateMet: number;
  clothingInsulationClo: number;
}

export interface FangerData {
  airTempC: number;
  radiantTempC: number;
  relativeHumidityPct: number;
  airVelocityMs: number;
  metabolicRateMet: number;
  clothingInsulationClo: number;
  useMultiSectorSheet?: boolean;
  multiSectorSamples?: FangerSampleRow[];
  selectedSampleId?: string;
}

// 13. WBGT (Cap. 7.3)
export interface WbgtSampleRow {
  id: string;
  zoneLabel: string;
  durationMin: number;
  tbhC: number;
  tgC: number;
  taC: number;
}

export interface WbgtData {
  solarLoad: boolean;
  tbhC: number;
  tgC: number;
  taC: number;
  metabolicWatts: number;
  acclimatized: boolean;
  workRegime: 'continuo' | 'ciclo_descanso';
  workMinutesPerHour: number;
  restWbgtC: number;
  multiZoneSamples: WbgtSampleRow[];
  useMultiZone: boolean;
}

// 14. ISO 2631 Cuerpo Entero (Cap. 8.3)
export interface Iso2631TaskPeriod {
  id: string;
  equipmentName: string;
  posture: 'sentado' | 'de_pie';
  awx: number;
  awy: number;
  awz: number;
  exposureHours: number;
}

export interface Iso2631Data {
  periods: Iso2631TaskPeriod[];
}

// 15. ISO 5349 Mano-Brazo (Cap. 8.4)
export interface Iso5349ToolPeriod {
  id: string;
  toolName: string;
  ahwx: number;
  ahwy: number;
  ahwz: number;
  exposureHours: number;
}

export interface Iso5349Data {
  periods: Iso5349ToolPeriod[];
}

export interface AllMethodPayloads {
  [MethodId.RULA]: RulaData;
  [MethodId.REBA]: RebaData;
  [MethodId.OWAS]: OwasData;
  [MethodId.NIOSH]: NioshData;
  [MethodId.SNOOK]: SnookData;
  [MethodId.LMC_295]: Lmc295Data;
  [MethodId.OCRA_COMPLETO]: OcraCompletoData;
  [MethodId.OCRA_CHECKLIST]: OcraChecklistData;
  [MethodId.JSI]: JsiData;
  [MethodId.NAM_295]: Nam295Data;
  [MethodId.BIPOLAR]: BipolarData;
  [MethodId.FANGER]: FangerData;
  [MethodId.WBGT]: WbgtData;
  [MethodId.ISO_2631]: Iso2631Data;
  [MethodId.ISO_5349]: Iso5349Data;
}

export interface StudyTab {
  id: string;
  tabLabel: string;
  taskEvaluated: string;
  method: MethodId;
  payloads: AllMethodPayloads;
  photos: StudyPhoto[];
  instrumentsUsed: string;
  evaluatorObservations: string;
  correctiveMeasures: string;
  responsiblePerson: string;
  implementationDeadline: 'Inmediato' | 'Corto plazo' | 'Medio plazo' | 'Sin plazo específico';
}

export interface MethodResultRow {
  parameter: string;
  value: string;
  reference?: string;
  refKey?: string;
}

export type CanvasTheme = 'pizarra' | 'blanco' | 'calido' | 'gris' | 'oscuro';
export type TextContrast = 'normal' | 'alto';
export type FontSize = 'normal' | 'grande';

export interface DisplayPreferences {
  theme: CanvasTheme;
  textContrast: TextContrast;
  fontSize: FontSize;
  highlightInputs: boolean;
}

export interface MethodEvaluationResult {
  methodId: MethodId;
  methodName: string;
  category: RiskCategory;
  categoryLabel: string;
  hierarchyOrder: 1 | 2 | 3 | 4 | 5;
  primaryScoreText: string;
  secondaryScoreText?: string;
  severity: RiskSeverity;
  riskLabel: string;
  actionLevelText: string;
  recommendedDeadline: 'Inmediato' | 'Corto plazo' | 'Medio plazo' | 'Sin plazo específico';
  interpretation: string;
  breakdownRows: MethodResultRow[];
  suggestedMeasures: string[];
  // Extra data for charts (e.g. NAM 295 or OWAS bars)
  namPoints?: {
    right: { nam: number; borg: number; zone: string };
    left: { nam: number; borg: number; zone: string };
  };
  owasDistribution?: {
    cat1Pct: number;
    cat2Pct: number;
    cat3Pct: number;
    cat4Pct: number;
    totalObs: number;
  };
}

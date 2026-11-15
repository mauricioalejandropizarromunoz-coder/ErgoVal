import {
  createDefaultFootPose,
  createDefaultHandPose,
  createDefaultKatePoseParams,
  KatePoseParams,
} from './kateAvatarEngine';
import {
  createDefaultKateErgonomicModifiers,
  KateErgonomicModifiers,
} from './kateErgonomicScoring';

export type KateBasePosturalId =
  | 'lotus'
  | 'stand'
  | 'supine_37'
  | 'supine'
  | 'prone_bridge'
  | 'seated_open'
  | 'seated_stool'
  | 'seated_straight'
  | 'kneel_asym'
  | 'kneel_heels'
  | 'kneel_wide'
  | 'squat';

export interface KateCanonicalPostureRow {
  n: number;
  postura: string;
  basePostural: KateBasePosturalId;
  A_Cuello: number;
  B_Tronco: number;
  C_Brazo_Izq: number;
  D_Brazo_Der: number;
  E_Antebrazo_Izq: number;
  F_Antebrazo_Der: number;
  G_Pierna_Izq: number;
  H_Pierna_Der: number;
  MI_Muneca_Izq: number;
  MD_Muneca_Der: number;
}

export const KATE_BASE_POSTURAL_LABELS_ES: Record<KateBasePosturalId, string> = {
  lotus: 'Sedente con piernas cruzadas',
  stand: 'De pie',
  supine_37: 'Decúbito supino inclinado (37°)',
  supine: 'Decúbito supino',
  prone_bridge: 'Decúbito prono / puente',
  seated_open: 'Sedente con piernas abiertas',
  seated_stool: 'Sedente en banco / silla',
  seated_straight: 'Sedente con piernas extendidas',
  kneel_asym: 'Arrodillado asimétrico',
  kneel_heels: 'Arrodillado sobre talones',
  kneel_wide: 'Arrodillado piernas abiertas',
  squat: 'Cuclillas',
};

export function normalizeBasePosturalId(raw: string | undefined): KateBasePosturalId | null {
  if (!raw) return null;
  const s = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '_');

  if (s === 'lotus' || s.includes('loto') || s.includes('cruz')) return 'lotus';
  if (s === 'stand' || s === 'standing' || s.includes('de_pie') || s === 'pie') return 'stand';
  if (s === 'supine_37' || s.includes('37') || s.includes('rampa')) return 'supine_37';
  if (s === 'supine' || s.includes('supino')) return 'supine';
  if (s === 'prone_bridge' || s.includes('prone') || s.includes('prono') || s.includes('puente')) return 'prone_bridge';
  if (s === 'seated_open' || s.includes('abiert')) return 'seated_open';
  if (s === 'seated_stool' || s.includes('banco') || s.includes('stool') || s.includes('silla')) return 'seated_stool';
  if (s === 'seated_straight' || s.includes('extend')) return 'seated_straight';
  if (s === 'kneel_asym' || s.includes('asim')) return 'kneel_asym';
  if (s === 'kneel_heels' || s.includes('talon')) return 'kneel_heels';
  if (s === 'kneel_wide' || s.includes('wide')) return 'kneel_wide';
  if (s === 'squat' || s.includes('cuclill')) return 'squat';
  if (s.includes('kneel') || s.includes('rodill')) return 'kneel_heels';
  if (s.includes('seat') || s.includes('sedent') || s.includes('sentad')) return 'seated_open';
  return null;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function buildKatePoseFromCanonicalRow(row: KateCanonicalPostureRow): {
  plateTitle: string;
  basePosturalLabel: string;
  params: KatePoseParams;
  ergoModifiers: KateErgonomicModifiers;
} {
  const base = createDefaultKatePoseParams();
  const modifiers = createDefaultKateErgonomicModifiers();

  const params: KatePoseParams = {
    ...base,
    show: { ...base.show },
    handL: {
      ...createDefaultHandPose('relaxed'),
      wristPitchDeg: row.MI_Muneca_Izq,
    },
    handR: {
      ...createDefaultHandPose('relaxed'),
      wristPitchDeg: row.MD_Muneca_Der,
    },
    footL: createDefaultFootPose('flat'),
    footR: createDefaultFootPose('flat'),
    apoL: 'none',
    apoR: 'none',
    fists: false,
    useRawLandmarks: false,
    overriddenJoints: {},
    boneOverrides: {},

    // Ángulos exactos pre-cargados (sin importar puntajes RULA/REBA/OWAS del CSV)
    neckFlexDeg: row.A_Cuello,
    trunkFlexDeg: row.B_Tronco,
    shoulderLFlexDeg: row.C_Brazo_Izq,
    shoulderRFlexDeg: row.D_Brazo_Der,
    shoulderLAbdDeg: 8,
    shoulderRAbdDeg: 8,
    elbowLFlexDeg: row.E_Antebrazo_Izq,
    elbowRFlexDeg: row.F_Antebrazo_Der,
    kneeLFlexDeg: row.G_Pierna_Izq,
    kneeRFlexDeg: row.H_Pierna_Der,
  };

  modifiers.staticPosture = true;
  modifiers.loadKg = 0;
  modifiers.coupling = 0;
  modifiers.legsBalanced = true;

  switch (row.basePostural) {
    case 'lotus':
      params.hipLFlexDeg = 84;
      params.hipLAbdDeg = 46;
      params.hipLRotDeg = 42;
      params.hipRFlexDeg = 84;
      params.hipRAbdDeg = 46;
      params.hipRRotDeg = 42;
      params.footL = createDefaultFootPose('lotus');
      params.footR = createDefaultFootPose('lotus');
      modifiers.postureBase = 'sitting';
      break;

    case 'stand':
      params.hipLFlexDeg = Math.round(clamp(row.G_Pierna_Izq * 0.45, 0, 38));
      params.hipRFlexDeg = Math.round(clamp(row.H_Pierna_Der * 0.45, 0, 38));
      params.hipLAbdDeg = 4;
      params.hipRAbdDeg = 4;
      modifiers.postureBase = 'standing';
      break;

    case 'supine_37':
      params.bodyPitchDeg = row.B_Tronco;
      params.trunkFlexDeg = 0;
      params.hipLFlexDeg = 48;
      params.hipRFlexDeg = 48;
      params.hipLAbdDeg = 10;
      params.hipRAbdDeg = 10;
      params.footL = createDefaultFootPose('plantar');
      params.footR = createDefaultFootPose('plantar');
      modifiers.postureBase = 'sitting';
      break;

    case 'supine':
      params.bodyPitchDeg = row.B_Tronco;
      params.trunkFlexDeg = 0;
      params.hipLFlexDeg = 4;
      params.hipRFlexDeg = 4;
      params.hipLAbdDeg = 8;
      params.hipRAbdDeg = 8;
      params.footL = createDefaultFootPose('plantar');
      params.footR = createDefaultFootPose('plantar');
      modifiers.postureBase = 'sitting';
      break;

    case 'prone_bridge':
      params.bodyPitchDeg = row.B_Tronco;
      params.trunkFlexDeg = 0;
      params.hipLFlexDeg = 0;
      params.hipRFlexDeg = 0;
      params.hipLAbdDeg = 6;
      params.hipRAbdDeg = 6;
      params.footL = createDefaultFootPose('plantar');
      params.footR = createDefaultFootPose('plantar');
      modifiers.postureBase = 'kneeling';
      break;

    case 'seated_open':
      params.hipLFlexDeg = 82;
      params.hipLAbdDeg = 32;
      params.hipLRotDeg = 22;
      params.hipRFlexDeg = 82;
      params.hipRAbdDeg = 32;
      params.hipRRotDeg = 22;
      modifiers.postureBase = 'sitting';
      break;

    case 'seated_stool':
      params.hipLFlexDeg = 88;
      params.hipLAbdDeg = 14;
      params.hipLRotDeg = 8;
      params.hipRFlexDeg = 88;
      params.hipRAbdDeg = 14;
      params.hipRRotDeg = 8;
      modifiers.postureBase = 'sitting';
      break;

    case 'seated_straight':
      params.hipLFlexDeg = 90;
      params.hipLAbdDeg = 10;
      params.hipLRotDeg = 0;
      params.hipRFlexDeg = 90;
      params.hipRAbdDeg = 10;
      params.hipRRotDeg = 0;
      params.footL = createDefaultFootPose('dorsal');
      params.footR = createDefaultFootPose('dorsal');
      modifiers.postureBase = 'sitting';
      break;

    case 'kneel_asym':
      params.hipLFlexDeg = 68;
      params.hipLAbdDeg = 24;
      params.hipLRotDeg = 20;
      params.hipRFlexDeg = 18;
      params.hipRAbdDeg = 16;
      params.hipRRotDeg = 10;
      params.footL = createDefaultFootPose('flat');
      params.footR = createDefaultFootPose('plantar');
      modifiers.legsBalanced = false;
      modifiers.postureBase = 'kneeling';
      break;

    case 'kneel_heels':
      params.hipLFlexDeg = 18;
      params.hipLAbdDeg = 10;
      params.hipLRotDeg = 8;
      params.hipRFlexDeg = 18;
      params.hipRAbdDeg = 10;
      params.hipRRotDeg = 8;
      params.footL = createDefaultFootPose('plantar');
      params.footR = createDefaultFootPose('plantar');
      modifiers.postureBase = 'kneeling';
      break;

    case 'kneel_wide':
      params.hipLFlexDeg = 28;
      params.hipLAbdDeg = 24;
      params.hipLRotDeg = 18;
      params.hipRFlexDeg = 28;
      params.hipRAbdDeg = 24;
      params.hipRRotDeg = 18;
      params.footL = createDefaultFootPose('plantar');
      params.footR = createDefaultFootPose('plantar');
      modifiers.postureBase = 'kneeling';
      break;

    case 'squat':
      params.hipLFlexDeg = 110;
      params.hipLAbdDeg = 22;
      params.hipLRotDeg = 14;
      params.hipRFlexDeg = 110;
      params.hipRAbdDeg = 22;
      params.hipRRotDeg = 14;
      modifiers.postureBase = 'squat';
      break;
  }

  return {
    plateTitle: `${row.n}. ${row.postura}`,
    basePosturalLabel: KATE_BASE_POSTURAL_LABELS_ES[row.basePostural],
    params,
    ergoModifiers: modifiers,
  };
}

export const KATE_53_CANONICAL_POSTURES: KateCanonicalPostureRow[] = [
  { n: 1, postura: 'EL ALBATROS', basePostural: 'lotus', A_Cuello: -28, B_Tronco: 18, C_Brazo_Izq: -29, D_Brazo_Der: -26, E_Antebrazo_Izq: 51, F_Antebrazo_Der: 50, G_Pierna_Izq: 145, H_Pierna_Der: 142, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 2, postura: 'LLAMADA DE LOS ESPÍRITUS', basePostural: 'stand', A_Cuello: -20, B_Tronco: 10, C_Brazo_Izq: -28, D_Brazo_Der: -25, E_Antebrazo_Izq: 65, F_Antebrazo_Der: 60, G_Pierna_Izq: 22, H_Pierna_Der: 18, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 3, postura: 'EL HOMBRE CORNUDO DE GUNDESTRUP', basePostural: 'lotus', A_Cuello: 2, B_Tronco: 0, C_Brazo_Izq: 40, D_Brazo_Der: 40, E_Antebrazo_Izq: 78, F_Antebrazo_Der: 78, G_Pierna_Izq: 145, H_Pierna_Der: 145, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 4, postura: 'VIAJE AL REINO DE LOS MUERTOS', basePostural: 'stand', A_Cuello: -5, B_Tronco: 2, C_Brazo_Izq: 13, D_Brazo_Der: 18, E_Antebrazo_Izq: 83, F_Antebrazo_Der: 79, G_Pierna_Izq: 41, H_Pierna_Der: 22, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 5, postura: 'EL HOMBRE DE LASCAUX', basePostural: 'supine_37', A_Cuello: 34, B_Tronco: -44, C_Brazo_Izq: 52, D_Brazo_Der: 21, E_Antebrazo_Izq: 20, F_Antebrazo_Der: 9, G_Pierna_Izq: 57, H_Pierna_Der: 55, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 6, postura: 'EL OLMECA DE RÍO ZUMPANGO', basePostural: 'seated_open', A_Cuello: -16, B_Tronco: 25, C_Brazo_Izq: 87, D_Brazo_Der: -36, E_Antebrazo_Izq: 64, F_Antebrazo_Der: 17, G_Pierna_Izq: 92, H_Pierna_Der: 8, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 7, postura: 'EL SAMI RECLINADO', basePostural: 'prone_bridge', A_Cuello: 0, B_Tronco: 66, C_Brazo_Izq: 114, D_Brazo_Der: 126, E_Antebrazo_Izq: 95, F_Antebrazo_Der: 52, G_Pierna_Izq: 3, H_Pierna_Der: 3, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 8, postura: 'VIAJE ESPIRITUAL SUDAMERICANO', basePostural: 'supine', A_Cuello: 148, B_Tronco: -85, C_Brazo_Izq: -96, D_Brazo_Der: 19, E_Antebrazo_Izq: 108, F_Antebrazo_Der: 0, G_Pierna_Izq: 3, H_Pierna_Der: 3, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 9, postura: 'LA MUJER DE GALGENBERG (VENUS DANZANTE)', basePostural: 'stand', A_Cuello: 16, B_Tronco: -3, C_Brazo_Izq: 87, D_Brazo_Der: 8, E_Antebrazo_Izq: 41, F_Antebrazo_Der: 9, G_Pierna_Izq: 16, H_Pierna_Der: 15, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 10, postura: 'LA MUJER DE MALTA', basePostural: 'stand', A_Cuello: -27, B_Tronco: 19, C_Brazo_Izq: 29, D_Brazo_Der: -3, E_Antebrazo_Izq: 59, F_Antebrazo_Der: 29, G_Pierna_Izq: 33, H_Pierna_Der: 26, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 11, postura: 'EL ZAPOTECA DE MONTE ALBÁN', basePostural: 'lotus', A_Cuello: -31, B_Tronco: 17, C_Brazo_Izq: 38, D_Brazo_Der: 41, E_Antebrazo_Izq: 41, F_Antebrazo_Der: 72, G_Pierna_Izq: 131, H_Pierna_Der: 136, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 12, postura: 'LA MUJER PÁJARO DE TESALIA', basePostural: 'kneel_asym', A_Cuello: -42, B_Tronco: 22, C_Brazo_Izq: 34, D_Brazo_Der: 30, E_Antebrazo_Izq: 16, F_Antebrazo_Der: 25, G_Pierna_Izq: 157, H_Pierna_Der: 145, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 13, postura: 'POSTURA DE PARTO RITUAL', basePostural: 'stand', A_Cuello: -12, B_Tronco: 2, C_Brazo_Izq: 30, D_Brazo_Der: 13, E_Antebrazo_Izq: 80, F_Antebrazo_Der: 71, G_Pierna_Izq: 24, H_Pierna_Der: 19, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 14, postura: 'PAREJA DE JALISCO', basePostural: 'kneel_heels', A_Cuello: -30, B_Tronco: 15, C_Brazo_Izq: 165, D_Brazo_Der: 107, E_Antebrazo_Izq: 87, F_Antebrazo_Der: 48, G_Pierna_Izq: 104, H_Pierna_Der: 104, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 15, postura: 'LA MUJER DE LA AMAPOLA DE GAZI', basePostural: 'stand', A_Cuello: -27, B_Tronco: -28, C_Brazo_Izq: 57, D_Brazo_Der: 65, E_Antebrazo_Izq: 76, F_Antebrazo_Der: 85, G_Pierna_Izq: 14, H_Pierna_Der: 8, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 16, postura: 'LA SERPIENTE EMPLUMADA', basePostural: 'stand', A_Cuello: -20, B_Tronco: 7, C_Brazo_Izq: 47, D_Brazo_Der: 44, E_Antebrazo_Izq: 75, F_Antebrazo_Der: 78, G_Pierna_Izq: 14, H_Pierna_Der: 23, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 17, postura: 'LA MUJER ESQUELETO DE SANTA CRUZ', basePostural: 'kneel_wide', A_Cuello: -53, B_Tronco: 35, C_Brazo_Izq: 42, D_Brazo_Der: 40, E_Antebrazo_Izq: 30, F_Antebrazo_Der: 38, G_Pierna_Izq: 153, H_Pierna_Der: 143, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 18, postura: 'LA MUJER SERPIENTE DE MYRTOS', basePostural: 'lotus', A_Cuello: -22, B_Tronco: 6, C_Brazo_Izq: -17, D_Brazo_Der: -16, E_Antebrazo_Izq: 53, F_Antebrazo_Der: 55, G_Pierna_Izq: 154, H_Pierna_Der: 149, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 19, postura: 'LA MUJER DE LAUSSEL (VENUS DEL CUERNO)', basePostural: 'stand', A_Cuello: -41, B_Tronco: 21, C_Brazo_Izq: 38, D_Brazo_Der: 44, E_Antebrazo_Izq: 77, F_Antebrazo_Der: 50, G_Pierna_Izq: 43, H_Pierna_Der: 37, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 20, postura: 'PIPA ANTROPOMORFA ADENA', basePostural: 'stand', A_Cuello: -60, B_Tronco: -29, C_Brazo_Izq: -156, D_Brazo_Der: 95, E_Antebrazo_Izq: 64, F_Antebrazo_Der: 13, G_Pierna_Izq: 62, H_Pierna_Der: 32, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 21, postura: 'LA POSTURA DEL OSO SEDENTE', basePostural: 'stand', A_Cuello: -21, B_Tronco: 10, C_Brazo_Izq: 23, D_Brazo_Der: 22, E_Antebrazo_Izq: 54, F_Antebrazo_Der: 71, G_Pierna_Izq: 36, H_Pierna_Der: 27, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 22, postura: 'LA POSTURA CHILTAN', basePostural: 'lotus', A_Cuello: -15, B_Tronco: 15, C_Brazo_Izq: -7, D_Brazo_Der: 28, E_Antebrazo_Izq: 28, F_Antebrazo_Der: 92, G_Pierna_Izq: 29, H_Pierna_Der: 17, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 23, postura: 'LA PAREJA DE CERNAVODA (LOS PENSADORES)', basePostural: 'seated_stool', A_Cuello: -42, B_Tronco: 21, C_Brazo_Izq: 86, D_Brazo_Der: 82, E_Antebrazo_Izq: 83, F_Antebrazo_Der: 88, G_Pierna_Izq: 93, H_Pierna_Der: 119, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 24, postura: 'LA DIOSA TLAZOLTÉOTL', basePostural: 'stand', A_Cuello: 4, B_Tronco: -6, C_Brazo_Izq: 33, D_Brazo_Der: 41, E_Antebrazo_Izq: 85, F_Antebrazo_Der: 84, G_Pierna_Izq: 36, H_Pierna_Der: 32, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 25, postura: 'EL HOMBRE CORNUDO DE COLIMA', basePostural: 'seated_open', A_Cuello: -20, B_Tronco: 7, C_Brazo_Izq: 36, D_Brazo_Der: 33, E_Antebrazo_Izq: 38, F_Antebrazo_Der: 50, G_Pierna_Izq: 134, H_Pierna_Der: 139, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 26, postura: 'EL BEBÉ OLMECA', basePostural: 'seated_open', A_Cuello: -12, B_Tronco: -4, C_Brazo_Izq: 25, D_Brazo_Der: 29, E_Antebrazo_Izq: 28, F_Antebrazo_Der: 41, G_Pierna_Izq: 14, H_Pierna_Der: 51, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 27, postura: 'FIGURA PINTADA DE MACHALILLA', basePostural: 'seated_open', A_Cuello: 8, B_Tronco: -17, C_Brazo_Izq: 48, D_Brazo_Der: 31, E_Antebrazo_Izq: 50, F_Antebrazo_Der: 43, G_Pierna_Izq: 106, H_Pierna_Der: 116, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 28, postura: 'EL CHAMÁN CANTOR', basePostural: 'stand', A_Cuello: -12, B_Tronco: 5, C_Brazo_Izq: 16, D_Brazo_Der: 21, E_Antebrazo_Izq: 91, F_Antebrazo_Der: 94, G_Pierna_Izq: 33, H_Pierna_Der: 25, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 29, postura: 'LA MUJER SERPIENTE DE FAARDAL', basePostural: 'kneel_heels', A_Cuello: -32, B_Tronco: 20, C_Brazo_Izq: 64, D_Brazo_Der: 93, E_Antebrazo_Izq: 73, F_Antebrazo_Der: 73, G_Pierna_Izq: 129, H_Pierna_Der: 128, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 30, postura: 'LA MUJER DE ATOTONILCO', basePostural: 'kneel_asym', A_Cuello: -11, B_Tronco: 3, C_Brazo_Izq: 20, D_Brazo_Der: 27, E_Antebrazo_Izq: 29, F_Antebrazo_Der: 118, G_Pierna_Izq: 139, H_Pierna_Der: 134, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 31, postura: 'LA MUJER DE CARCHI', basePostural: 'seated_straight', A_Cuello: 2, B_Tronco: 0, C_Brazo_Izq: 28, D_Brazo_Der: -24, E_Antebrazo_Izq: 92, F_Antebrazo_Der: 88, G_Pierna_Izq: 0, H_Pierna_Der: 0, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 32, postura: 'LA MUJER DE HACILAR', basePostural: 'stand', A_Cuello: 4, B_Tronco: -6, C_Brazo_Izq: 33, D_Brazo_Der: 41, E_Antebrazo_Izq: 85, F_Antebrazo_Der: 84, G_Pierna_Izq: 36, H_Pierna_Der: 32, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 33, postura: 'LA MUJER DE MORAVIA (HLUBOKÉ MAŠŮVKY)', basePostural: 'stand', A_Cuello: -10, B_Tronco: 2, C_Brazo_Izq: 28, D_Brazo_Der: 31, E_Antebrazo_Izq: 96, F_Antebrazo_Der: 87, G_Pierna_Izq: 31, H_Pierna_Der: 25, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 34, postura: 'JAGUAR AGAZAPADO', basePostural: 'kneel_asym', A_Cuello: -22, B_Tronco: 11, C_Brazo_Izq: 56, D_Brazo_Der: 23, E_Antebrazo_Izq: 86, F_Antebrazo_Der: 50, G_Pierna_Izq: 128, H_Pierna_Der: 110, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 35, postura: 'FIGURA DE LA TOLITA', basePostural: 'lotus', A_Cuello: -10, B_Tronco: 8, C_Brazo_Izq: 29, D_Brazo_Der: 39, E_Antebrazo_Izq: 48, F_Antebrazo_Der: 43, G_Pierna_Izq: 130, H_Pierna_Der: 136, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 36, postura: 'DIOSA XOCHIQUETZAL', basePostural: 'kneel_heels', A_Cuello: -46, B_Tronco: 35, C_Brazo_Izq: 43, D_Brazo_Der: 37, E_Antebrazo_Izq: 27, F_Antebrazo_Der: 38, G_Pierna_Izq: 135, H_Pierna_Der: 121, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 37, postura: 'EL HOMBRE DE BAHÍA', basePostural: 'lotus', A_Cuello: -26, B_Tronco: 9, C_Brazo_Izq: 20, D_Brazo_Der: 14, E_Antebrazo_Izq: 23, F_Antebrazo_Der: 32, G_Pierna_Izq: 149, H_Pierna_Der: 144, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 38, postura: 'EL HOMBRE DE JAMA-COAQUE', basePostural: 'seated_open', A_Cuello: -3, B_Tronco: 0, C_Brazo_Izq: 26, D_Brazo_Der: 20, E_Antebrazo_Izq: 38, F_Antebrazo_Der: 54, G_Pierna_Izq: 19, H_Pierna_Der: 66, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 39, postura: 'EL PRÍNCIPE OLMECA (CRUZ DEL MILAGRO)', basePostural: 'lotus', A_Cuello: -28, B_Tronco: 22, C_Brazo_Izq: 26, D_Brazo_Der: 23, E_Antebrazo_Izq: 27, F_Antebrazo_Der: 24, G_Pierna_Izq: 143, H_Pierna_Der: 143, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 40, postura: 'MUJER DE CHALCHIHUITLICUE', basePostural: 'lotus', A_Cuello: -13, B_Tronco: -1, C_Brazo_Izq: 27, D_Brazo_Der: 30, E_Antebrazo_Izq: 32, F_Antebrazo_Der: 29, G_Pierna_Izq: 133, H_Pierna_Der: 135, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 41, postura: 'EL JAGUAR TATUADO', basePostural: 'kneel_wide', A_Cuello: -38, B_Tronco: 39, C_Brazo_Izq: -35, D_Brazo_Der: -34, E_Antebrazo_Izq: 21, F_Antebrazo_Der: 21, G_Pierna_Izq: 104, H_Pierna_Der: 79, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 42, postura: 'PIPA EFIGIE DE ALABAMA (MOUNDVILLE)', basePostural: 'squat', A_Cuello: -3, B_Tronco: 10, C_Brazo_Izq: 31, D_Brazo_Der: 21, E_Antebrazo_Izq: 72, F_Antebrazo_Der: 86, G_Pierna_Izq: 147, H_Pierna_Der: 147, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 43, postura: 'EL HOMBRE DE CUAUTLA', basePostural: 'seated_open', A_Cuello: -15, B_Tronco: -4, C_Brazo_Izq: 40, D_Brazo_Der: 29, E_Antebrazo_Izq: 76, F_Antebrazo_Der: 83, G_Pierna_Izq: 144, H_Pierna_Der: 147, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 44, postura: 'LA FLAUTA MAYA (MAYA FLUTE PLAYER)', basePostural: 'lotus', A_Cuello: -38, B_Tronco: 17, C_Brazo_Izq: 116, D_Brazo_Der: 115, E_Antebrazo_Izq: 110, F_Antebrazo_Der: 103, G_Pierna_Izq: 133, H_Pierna_Der: 123, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 45, postura: 'LA MUJER LUNAR DE IXCHEL', basePostural: 'lotus', A_Cuello: 7, B_Tronco: -7, C_Brazo_Izq: 35, D_Brazo_Der: 20, E_Antebrazo_Izq: 80, F_Antebrazo_Der: 55, G_Pierna_Izq: 148, H_Pierna_Der: 89, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 46, postura: 'EL HOMBRE PÁJARO DE VERACRUZ', basePostural: 'stand', A_Cuello: -11, B_Tronco: 2, C_Brazo_Izq: 14, D_Brazo_Der: -16, E_Antebrazo_Izq: 29, F_Antebrazo_Der: 33, G_Pierna_Izq: 19, H_Pierna_Der: 18, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 47, postura: 'EL MALLAM NUPE (SOUTHERN SAHARA)', basePostural: 'kneel_asym', A_Cuello: -22, B_Tronco: 22, C_Brazo_Izq: 23, D_Brazo_Der: -18, E_Antebrazo_Izq: 18, F_Antebrazo_Der: 32, G_Pierna_Izq: 146, H_Pierna_Der: 120, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 48, postura: 'EL ADIVINO OLMECA DE PUEBLA', basePostural: 'seated_open', A_Cuello: -22, B_Tronco: 11, C_Brazo_Izq: 50, D_Brazo_Der: 59, E_Antebrazo_Izq: 33, F_Antebrazo_Der: 77, G_Pierna_Izq: 144, H_Pierna_Der: 153, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 49, postura: 'EL ADIVINO DE TENNESSEE', basePostural: 'kneel_asym', A_Cuello: -26, B_Tronco: 16, C_Brazo_Izq: -19, D_Brazo_Der: 35, E_Antebrazo_Izq: 20, F_Antebrazo_Der: 76, G_Pierna_Izq: 136, H_Pierna_Der: 132, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 50, postura: 'LA MUJER CON TURBANTE DE TLATILCO', basePostural: 'seated_open', A_Cuello: -16, B_Tronco: 14, C_Brazo_Izq: 58, D_Brazo_Der: 27, E_Antebrazo_Izq: 109, F_Antebrazo_Der: 25, G_Pierna_Izq: 136, H_Pierna_Der: 130, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 51, postura: 'LA MUJER DE CHOLULA', basePostural: 'seated_stool', A_Cuello: 2, B_Tronco: 12, C_Brazo_Izq: 39, D_Brazo_Der: 39, E_Antebrazo_Izq: 32, F_Antebrazo_Der: 44, G_Pierna_Izq: 90, H_Pierna_Der: 90, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 52, postura: 'LLAMADA DE LOS ANIMALES', basePostural: 'stand', A_Cuello: -24, B_Tronco: 12, C_Brazo_Izq: 106, D_Brazo_Der: 87, E_Antebrazo_Izq: 52, F_Antebrazo_Der: 57, G_Pierna_Izq: 32, H_Pierna_Der: 12, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
  { n: 53, postura: 'EL CAZADOR ADIVINO', basePostural: 'stand', A_Cuello: 12, B_Tronco: -3, C_Brazo_Izq: 60, D_Brazo_Der: -63, E_Antebrazo_Izq: 44, F_Antebrazo_Der: 51, G_Pierna_Izq: 18, H_Pierna_Der: 14, MI_Muneca_Izq: 0, MD_Muneca_Der: 0 },
];

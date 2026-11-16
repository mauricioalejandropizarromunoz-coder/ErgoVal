import {
  createDefaultKatePoseParams,
  getPresetKatePoseParams,
  KateBoneOverride,
  KatePoseParams,
  KatePresetId,
  KateRigExportSnapshot,
} from './kateAvatarEngine';
import {
  createDefaultKateErgonomicModifiers,
  KateErgonomicModifiers,
} from './kateErgonomicScoring';
import {
  buildKatePoseFromCanonicalRow,
  KATE_BASE_POSTURAL_LABELS_ES,
  KateBasePosturalId,
  normalizeBasePosturalId,
} from './kate53PosturesCatalog';

export interface ParsedKateCsvRow {
  rowIndex: number;
  nVal?: number;
  plateTitle: string;
  basePosturalLabel?: string;
  referenceImageUrl?: string;
  params: KatePoseParams;
  ergoModifiers: KateErgonomicModifiers;
  hasCustomAngles: boolean;
}

function normalizeHeader(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function detectDelimiter(firstNonEmptyLine: string): ',' | ';' | '\t' {
  let commas = 0;
  let semis = 0;
  let tabs = 0;
  let inQuotes = false;
  for (let i = 0; i < firstNonEmptyLine.length; i++) {
    const ch = firstNonEmptyLine[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (ch === ',') commas++;
      else if (ch === ';') semis++;
      else if (ch === '\t') tabs++;
    }
  }
  if (tabs >= semis && tabs >= commas && tabs > 0) return '\t';
  if (semis >= commas && semis > 0) return ';';
  return ',';
}

function splitCsvRows(text: string, delimiter: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const next = clean[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(cell.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      cell = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

function parseOptionalNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/°/g, '').replace('−', '-').replace(',', '.').trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parsePresetName(raw: string | undefined): KatePresetId | null {
  if (!raw) return null;
  const s = normalizeHeader(raw);
  if (!s) return null;
  if (s.includes('loto') || s.includes('lotus') || s.includes('cruz')) return 'lotus';
  if (s.includes('rodilla') || s.includes('kneel')) return 'kneeling';
  if (s.includes('talon') || s.includes('heel')) return 'heels';
  if (s.includes('rampa') || s.includes('ramp') || s.includes('45')) return 'ramp45';
  if (s.includes('abdomen') || s.includes('belly')) return 'hands_belly';
  if (s.includes('cintura') || s.includes('hips')) return 'hands_hips';
  if (s.includes('pecho') || s.includes('chest')) return 'elbows_chest';
  if (s.includes('neutr') || s.includes('pie')) return 'neutral';
  return null;
}

const KNOWN_HEADER_TOKENS = new Set([
  'n',
  'nombre',
  'lamina',
  'nombre_lamina',
  'titulo',
  'postura',
  'figura',
  'codigo',
  'code',
  'id',
  'name',
  'title',
  'plate',
  'referencia',
  'ref',
  'pagina',
  'page',
  'imagen',
  'image',
  'archivo',
  'preset',
  'base_postural',
  'a_cuello',
  'b_tronco',
  'c_brazo_izq',
  'd_brazo_der',
  'e_antebrazo_izq',
  'f_antebrazo_der',
  'g_pierna_izq',
  'h_pierna_der',
  'mi_muneca_izq',
  'md_muneca_der',
  'cuello',
  'tronco',
  'brazo_i',
  'brazo_d',
  'codo_i',
  'codo_d',
  'antebrazo_i',
  'antebrazo_d',
  'cadera_i',
  'cadera_d',
  'cadera_i_abd',
  'cadera_d_abd',
  'cadera_i_rot',
  'cadera_d_rot',
  'brazo_i_rot',
  'brazo_d_rot',
  'antebrazo_i_pron',
  'antebrazo_d_pron',
  'pie_i_flex',
  'pie_d_flex',
  'pie_i_inv',
  'pie_d_inv',
  'pie_i_rot',
  'pie_d_rot',
  'mi_muneca_desv',
  'md_muneca_desv',
  'pelvis_pos_x',
  'pelvis_pos_y',
  'pelvis_pos_z',
  'huesos_gizmo_xyz',
  'rig_euler_rad',
  'rodilla_i',
  'rodilla_d',
  'neck',
  'trunk',
]);

export function parseKatePlatesCsv(csvText: string): ParsedKateCsvRow[] {
  const trimmed = csvText.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return [];

  const firstLine = trimmed.split(/\r?\n/).find((l) => l.trim().length > 0) || '';
  const delimiter = detectDelimiter(firstLine);
  const rawRows = splitCsvRows(trimmed, delimiter);
  if (rawRows.length === 0) return [];

  const firstNorm = rawRows[0].map(normalizeHeader);
  const hasHeader = firstNorm.some(
    (h) =>
      KNOWN_HEADER_TOKENS.has(h) ||
      h.includes('lamina') ||
      h.includes('nombre') ||
      h.includes('titulo') ||
      h.includes('postura') ||
      h.includes('figura') ||
      h.includes('cuello') ||
      h.includes('tronco') ||
      h.includes('brazo') ||
      h.includes('antebrazo') ||
      h.includes('codo') ||
      h.includes('muneca') ||
      h.includes('cadera') ||
      h.includes('pierna') ||
      h.includes('rodilla') ||
      h.includes('pie_') ||
      h.includes('pelvis_') ||
      h.includes('huesos_') ||
      h.includes('rig_euler') ||
      h.includes('base_postural'),
  );

  const headers = hasHeader
    ? firstNorm
    : rawRows[0].map((_, idx) => (idx === 0 ? 'nombre' : `col_${idx}`));
  const dataRows = hasHeader ? rawRows.slice(1) : rawRows;

  // NOTA: Ignoramos explícitamente RULA_*, REBA_*, OWAS_*, Axis_Mundi, Elemento del CSV
  // porque los puntajes ergonómicos se calculan en vivo desde Kate.
  const findColIdx = (predicates: string[]): number => {
    for (const p of predicates) {
      const exact = headers.findIndex((h) => h === p);
      if (exact >= 0) return exact;
    }
    return headers.findIndex((h) => predicates.some((p) => h.includes(p)));
  };

  const numCol = findColIdx(['n', 'num', 'nro', 'numero']);
  const codeCol = findColIdx(['codigo', 'cod', 'code', 'id']);
  const titleCol = findColIdx([
    'postura',
    'nombre_lamina',
    'lamina',
    'titulo',
    'title',
    'nombre',
    'name',
    'figura',
    'plate',
    'referencia',
  ]);
  const pageCol = findColIdx(['pagina', 'page']);
  const basePosturalCol = findColIdx(['base_postural', 'postura_base']);
  const presetCol = findColIdx(['preset']);
  const imgCol = findColIdx(['imagen', 'image', 'foto', 'archivo_img', 'src', 'url']);

  const parsed: ParsedKateCsvRow[] = [];

  for (let rIdx = 0; rIdx < dataRows.length; rIdx++) {
    const cols = dataRows[rIdx];
    if (!cols.some((c) => c.trim().length > 0)) continue;

    const valAt = (idx: number) => (idx >= 0 && idx < cols.length ? cols[idx].trim() : '');
    const getTextByHeader = (exactKeys: string[]): string => {
      for (const k of exactKeys) {
        const exactIdx = headers.findIndex((h) => h === k);
        if (exactIdx >= 0) {
          const v = valAt(exactIdx);
          if (v.length > 0) return v;
        }
      }
      return '';
    };
    const getNumByHeader = (exactKeys: string[], fuzzyKeys?: string[]): number | null => {
      let hasAnyExactCol = false;
      for (const k of exactKeys) {
        const exactIdx = headers.findIndex((h) => h === k);
        if (exactIdx >= 0) {
          hasAnyExactCol = true;
          const n = parseOptionalNumber(cols[exactIdx]);
          if (n !== null) return n;
        }
      }
      if (hasAnyExactCol || !fuzzyKeys || fuzzyKeys.length === 0) {
        return null;
      }
      for (let ci = 0; ci < headers.length; ci++) {
        const h = headers[ci];
        if (fuzzyKeys.some((k) => h.includes(k))) {
          const n = parseOptionalNumber(cols[ci]);
          if (n !== null) return n;
        }
      }
      return null;
    };

    const nVal = parseOptionalNumber(valAt(numCol));
    const codeVal = codeCol >= 0 && codeCol !== titleCol ? valAt(codeCol) : '';
    let titleVal = titleCol >= 0 ? valAt(titleCol) : valAt(0);
    if (!titleVal) {
      titleVal =
        cols.find((c) => c.length > 0) ||
        `Lámina ${String(parsed.length + 1).padStart(2, '0')}`;
    }

    const pageVal =
      pageCol >= 0 && pageCol !== titleCol && pageCol !== codeCol ? valAt(pageCol) : '';

    // Detectar si viene en el esquema canónico de 53 posturas (Base_Postural + A_Cuello..MD_Muneca_Der)
    const rawBasePostural = valAt(basePosturalCol);
    const canonicalBase: KateBasePosturalId | null = normalizeBasePosturalId(rawBasePostural);
    const neckFlex = getNumByHeader([
      'a_cuello',
      'cuello_flex',
      'cuello',
      'neck_flex',
      'neckflex',
      'angulo_a',
    ]);
    const trunkFlex = getNumByHeader([
      'b_tronco',
      'tronco_flex',
      'tronco',
      'trunk_flex',
      'trunkflex',
      'espalda',
      'angulo_b',
    ]);
    const armL = getNumByHeader([
      'c_brazo_izq',
      'brazo_izq',
      'brazo_i',
      'hombro_i',
      'shoulder_l_flex',
      'arml',
      'angulo_c',
    ]);
    const armR = getNumByHeader([
      'd_brazo_der',
      'brazo_der',
      'brazo_d',
      'hombro_d',
      'shoulder_r_flex',
      'armr',
      'angulo_d',
    ]);
    const elbL = getNumByHeader([
      'e_antebrazo_izq',
      'antebrazo_izq',
      'antebrazo_i',
      'codo_izq',
      'codo_i',
      'elbow_l',
      'forearml',
      'angulo_e',
    ]);
    const elbR = getNumByHeader([
      'f_antebrazo_der',
      'antebrazo_der',
      'antebrazo_d',
      'codo_der',
      'codo_d',
      'elbow_r',
      'forearmr',
      'angulo_f',
    ]);
    const kneeL = getNumByHeader([
      'g_pierna_izq',
      'pierna_izq',
      'pierna_i',
      'rodilla_izq',
      'rodilla_i',
      'knee_l',
      'kneel',
      'angulo_g',
    ]);
    const kneeR = getNumByHeader([
      'h_pierna_der',
      'pierna_der',
      'pierna_d',
      'rodilla_der',
      'rodilla_d',
      'knee_r',
      'kneer',
      'angulo_h',
    ]);
    const wristL = getNumByHeader([
      'mi_muneca_izq',
      'm_i_muneca_izq',
      'muneca_izq',
      'muneca_i',
      'wrist_l',
    ]);
    const wristR = getNumByHeader([
      'md_muneca_der',
      'm_d_muneca_der',
      'muneca_der',
      'muneca_d',
      'wrist_r',
    ]);

    const refUrl = imgCol >= 0 ? valAt(imgCol) : '';

    const neckSide = getNumByHeader(['cuello_lat', 'neck_side', 'neckside']);
    const neckTwist = getNumByHeader(['cuello_giro', 'cuello_rot', 'neck_twist']);
    const trunkSide = getNumByHeader(['tronco_lat', 'trunk_side']);
    const trunkTwist = getNumByHeader(['tronco_tors', 'torsion', 'trunk_twist']);
    const armLAbd = getNumByHeader(['brazo_i_abd', 'hombro_i_abd', 'shoulder_l_abd']);
    const armRAbd = getNumByHeader(['brazo_d_abd', 'hombro_d_abd', 'shoulder_r_abd']);
    const armLRot = getNumByHeader(['brazo_i_rot', 'hombro_i_rot', 'shoulder_l_rot']);
    const armRRot = getNumByHeader(['brazo_d_rot', 'hombro_d_rot', 'shoulder_r_rot']);
    const forearmLPron = getNumByHeader(['antebrazo_i_pron', 'forearm_l_pron', 'pron_i', 'sup_i']);
    const forearmRPron = getNumByHeader(['antebrazo_d_pron', 'forearm_r_pron', 'pron_d', 'sup_d']);
    const hipL = getNumByHeader(['muslo_i', 'cadera_i', 'cadera_izq', 'hip_l_flex', 'hipl']);
    const hipLAbd = getNumByHeader(['cadera_i_abd', 'hip_l_abd']);
    const hipLRot = getNumByHeader(['cadera_i_rot', 'hip_l_rot', 'muslo_i_rot']);
    const hipR = getNumByHeader(['muslo_d', 'cadera_d', 'cadera_der', 'hip_r_flex', 'hipr']);
    const hipRAbd = getNumByHeader(['cadera_d_abd', 'hip_r_abd']);
    const hipRRot = getNumByHeader(['cadera_d_rot', 'hip_r_rot', 'muslo_d_rot']);
    const footLFlex = getNumByHeader(['pie_i_flex', 'pie_izq_flex', 'foot_l_pitch']);
    const footRFlex = getNumByHeader(['pie_d_flex', 'pie_der_flex', 'foot_r_pitch']);
    const footLInv = getNumByHeader(['pie_i_inv', 'pie_izq_inv', 'foot_l_roll']);
    const footRInv = getNumByHeader(['pie_d_inv', 'pie_der_inv', 'foot_r_roll']);
    const footLRot = getNumByHeader(['pie_i_rot', 'pie_izq_rot', 'foot_l_yaw']);
    const footRRot = getNumByHeader(['pie_d_rot', 'pie_der_rot', 'foot_r_yaw']);
    const wristLDev = getNumByHeader(['mi_muneca_desv', 'muneca_i_desv', 'wrist_l_yaw']);
    const wristRDev = getNumByHeader(['md_muneca_desv', 'muneca_d_desv', 'wrist_r_yaw']);
    const pelvisPosX = getNumByHeader(['pelvis_pos_x', 'hips_pos_x', 'pelvis_x']);
    const pelvisPosY = getNumByHeader(['pelvis_pos_y', 'hips_pos_y', 'pelvis_y']);
    const pelvisPosZ = getNumByHeader(['pelvis_pos_z', 'hips_pos_z', 'pelvis_z']);
    const rawBoneOverridesJson = getTextByHeader(['huesos_gizmo_xyz', 'bone_overrides_json', 'gizmo_xyz']);
    const rawRigEulerRadJson = getTextByHeader(['rig_euler_rad', 'rig_euler', 'bones_euler_rad']);
    const yaw = getNumByHeader(['giro_avatar', 'yaw', 'general_yaw']);
    const loadKg = getNumByHeader(['carga_kg', 'carga', 'load_kg']);

    const parsedPelvisWorldPos: { x: number; y: number; z: number } | null =
      pelvisPosX !== null || pelvisPosY !== null || pelvisPosZ !== null
        ? {
            x: pelvisPosX ?? 0,
            y: pelvisPosY ?? 0.9,
            z: pelvisPosZ ?? 0,
          }
        : null;

    let parsedBoneOverrides: Record<string, KateBoneOverride> | null = null;
    if (rawBoneOverridesJson) {
      try {
        const obj = JSON.parse(rawBoneOverridesJson) as Record<string, Record<string, unknown>>;
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          const out: Record<string, KateBoneOverride> = {};
          for (const [bName, v] of Object.entries(obj)) {
            if (!v || typeof v !== 'object') continue;
            const toDeg = (degVal: unknown, radVal: unknown) => {
              if (typeof degVal === 'number' && Number.isFinite(degVal)) return degVal;
              if (typeof radVal === 'number' && Number.isFinite(radVal)) return (radVal * 180) / Math.PI;
              return 0;
            };
            const rx = toDeg(v.rx, v.rxRad);
            const ry = toDeg(v.ry, v.ryRad);
            const rz = toDeg(v.rz, v.rzRad);
            const lenScale =
              typeof v.lenScale === 'number' && Number.isFinite(v.lenScale) ? v.lenScale : 1;
            const ov: KateBoneOverride = { rx, ry, rz, lenScale };
            if (!(bName === 'Hips' && parsedPelvisWorldPos)) {
              if (typeof v.tx === 'number' && Number.isFinite(v.tx)) ov.tx = v.tx;
              if (typeof v.ty === 'number' && Number.isFinite(v.ty)) ov.ty = v.ty;
              if (typeof v.tz === 'number' && Number.isFinite(v.tz)) ov.tz = v.tz;
            }
            out[bName] = ov;
          }
          if (Object.keys(out).length > 0) {
            parsedBoneOverrides = out;
          }
        }
      } catch {
        parsedBoneOverrides = null;
      }
    }

    let parsedExactBoneEulerRad: Record<string, [number, number, number]> | null = null;
    if (rawRigEulerRadJson) {
      try {
        const obj = JSON.parse(rawRigEulerRadJson) as Record<string, unknown>;
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          const out: Record<string, [number, number, number]> = {};
          for (const [bName, arr] of Object.entries(obj)) {
            if (
              Array.isArray(arr) &&
              arr.length >= 3 &&
              typeof arr[0] === 'number' &&
              typeof arr[1] === 'number' &&
              typeof arr[2] === 'number' &&
              Number.isFinite(arr[0]) &&
              Number.isFinite(arr[1]) &&
              Number.isFinite(arr[2])
            ) {
              out[bName] = [arr[0], arr[1], arr[2]];
            }
          }
          if (Object.keys(out).length > 0) {
            parsedExactBoneEulerRad = out;
          }
        }
      } catch {
        parsedExactBoneEulerRad = null;
      }
    }

    const applyExtendedDofFields = (target: KatePoseParams) => {
      if (armLRot !== null) target.shoulderLRotDeg = armLRot;
      if (armRRot !== null) target.shoulderRRotDeg = armRRot;
      if (forearmLPron !== null) {
        target.forearmLPronDeg = forearmLPron;
        target.handL.wristRollDeg = 0;
      }
      if (forearmRPron !== null) {
        target.forearmRPronDeg = forearmRPron;
        target.handR.wristRollDeg = 0;
      }
      if (hipLRot !== null) target.hipLRotDeg = hipLRot;
      if (hipRRot !== null) target.hipRRotDeg = hipRRot;
      if (footLFlex !== null) target.footL.pitchDeg = footLFlex;
      if (footRFlex !== null) target.footR.pitchDeg = footRFlex;
      if (footLInv !== null) target.footL.rollDeg = footLInv;
      if (footRInv !== null) target.footR.rollDeg = footRInv;
      if (footLRot !== null) target.footL.yawDeg = footLRot;
      if (footRRot !== null) target.footR.yawDeg = footRRot;
      if (wristLDev !== null) target.handL.wristYawDeg = wristLDev;
      if (wristRDev !== null) target.handR.wristYawDeg = wristRDev;
      if (parsedPelvisWorldPos) {
        target.pelvisWorldPos = parsedPelvisWorldPos;
      }
      if (parsedBoneOverrides) {
        target.boneOverrides = { ...(target.boneOverrides || {}), ...parsedBoneOverrides };
      }
      if (parsedExactBoneEulerRad) {
        target.exactBoneEulerRad = parsedExactBoneEulerRad;
      }
    };

    if (canonicalBase) {
      const built = buildKatePoseFromCanonicalRow({
        n: nVal !== null ? Math.round(nVal) : parsed.length + 1,
        postura: titleVal,
        basePostural: canonicalBase,
        A_Cuello: neckFlex ?? 0,
        B_Tronco: trunkFlex ?? 0,
        C_Brazo_Izq: armL ?? 0,
        D_Brazo_Der: armR ?? 0,
        E_Antebrazo_Izq: elbL ?? 0,
        F_Antebrazo_Der: elbR ?? 0,
        G_Pierna_Izq: kneeL ?? 0,
        H_Pierna_Der: kneeR ?? 0,
        MI_Muneca_Izq: wristL ?? 0,
        MD_Muneca_Der: wristR ?? 0,
      });

      if (neckSide !== null) built.params.neckSideDeg = neckSide;
      if (neckTwist !== null) built.params.neckTwistDeg = neckTwist;
      if (trunkSide !== null) built.params.trunkSideDeg = trunkSide;
      if (trunkTwist !== null) built.params.trunkTwistDeg = trunkTwist;
      if (armLAbd !== null) built.params.shoulderLAbdDeg = armLAbd;
      if (armRAbd !== null) built.params.shoulderRAbdDeg = armRAbd;
      if (hipL !== null) built.params.hipLFlexDeg = hipL;
      if (hipLAbd !== null) built.params.hipLAbdDeg = hipLAbd;
      if (hipR !== null) built.params.hipRFlexDeg = hipR;
      if (hipRAbd !== null) built.params.hipRAbdDeg = hipRAbd;
      if (yaw !== null) built.params.generalYawDeg = yaw;
      if (loadKg !== null) built.ergoModifiers.loadKg = Math.max(0, Math.min(60, loadKg));
      applyExtendedDofFields(built.params);

      parsed.push({
        rowIndex: parsed.length,
        nVal: nVal !== null ? Math.round(nVal) : undefined,
        plateTitle: built.plateTitle,
        basePosturalLabel: built.basePosturalLabel,
        referenceImageUrl: refUrl || undefined,
        params: built.params,
        ergoModifiers: built.ergoModifiers,
        hasCustomAngles: true,
      });
      continue;
    }

    // Fallback genérico para CSV personalizados
    let plateTitle = titleVal;
    if (nVal !== null && !titleVal.startsWith(`${nVal}.`)) {
      plateTitle = `${nVal}. ${titleVal}`;
    } else if (codeVal && !titleVal.toLowerCase().includes(codeVal.toLowerCase())) {
      plateTitle = `${codeVal} · ${titleVal}`;
    }
    if (pageVal && !plateTitle.toLowerCase().includes(pageVal.toLowerCase())) {
      plateTitle = `${plateTitle} (p. ${pageVal})`;
    }

    const preset = parsePresetName(valAt(presetCol) || rawBasePostural);
    const base = preset ? getPresetKatePoseParams(preset) : createDefaultKatePoseParams();
    const params: KatePoseParams = {
      ...base,
      show: { ...base.show },
      handL: { ...base.handL },
      handR: { ...base.handR },
      footL: { ...base.footL },
      footR: { ...base.footR },
      overriddenJoints: { ...(base.overriddenJoints || {}) },
      boneOverrides: { ...(base.boneOverrides || {}) },
      pelvisWorldPos: null,
      exactBoneEulerRad: null,
      useRawLandmarks: false,
    };

    const modifiers = createDefaultKateErgonomicModifiers();
    let hasCustomAngles = preset !== null;

    if (neckFlex !== null) {
      params.neckFlexDeg = neckFlex;
      hasCustomAngles = true;
    }
    if (neckSide !== null) {
      params.neckSideDeg = neckSide;
      hasCustomAngles = true;
    }
    if (neckTwist !== null) {
      params.neckTwistDeg = neckTwist;
      hasCustomAngles = true;
    }

    if (trunkFlex !== null) {
      params.trunkFlexDeg = trunkFlex;
      hasCustomAngles = true;
    }
    if (trunkSide !== null) {
      params.trunkSideDeg = trunkSide;
      hasCustomAngles = true;
    }
    if (trunkTwist !== null) {
      params.trunkTwistDeg = trunkTwist;
      hasCustomAngles = true;
    }

    if (armL !== null) {
      params.shoulderLFlexDeg = armL;
      hasCustomAngles = true;
    }
    if (armLAbd !== null) {
      params.shoulderLAbdDeg = armLAbd;
      hasCustomAngles = true;
    }
    if (armR !== null) {
      params.shoulderRFlexDeg = armR;
      hasCustomAngles = true;
    }
    if (armRAbd !== null) {
      params.shoulderRAbdDeg = armRAbd;
      hasCustomAngles = true;
    }

    if (elbL !== null) {
      params.elbowLFlexDeg = elbL;
      hasCustomAngles = true;
    }
    if (elbR !== null) {
      params.elbowRFlexDeg = elbR;
      hasCustomAngles = true;
    }

    if (hipL !== null) {
      params.hipLFlexDeg = hipL;
      hasCustomAngles = true;
    }
    if (hipLAbd !== null) {
      params.hipLAbdDeg = hipLAbd;
      hasCustomAngles = true;
    }
    if (hipR !== null) {
      params.hipRFlexDeg = hipR;
      hasCustomAngles = true;
    }
    if (hipRAbd !== null) {
      params.hipRAbdDeg = hipRAbd;
      hasCustomAngles = true;
    }

    if (kneeL !== null) {
      params.kneeLFlexDeg = kneeL;
      hasCustomAngles = true;
    }
    if (kneeR !== null) {
      params.kneeRFlexDeg = kneeR;
      hasCustomAngles = true;
    }

    if (wristL !== null) {
      params.handL.wristPitchDeg = wristL;
      hasCustomAngles = true;
    }
    if (wristR !== null) {
      params.handR.wristPitchDeg = wristR;
      hasCustomAngles = true;
    }

    if (
      armLRot !== null ||
      armRRot !== null ||
      forearmLPron !== null ||
      forearmRPron !== null ||
      hipLRot !== null ||
      hipRRot !== null ||
      footLFlex !== null ||
      footRFlex !== null ||
      footLInv !== null ||
      footRInv !== null ||
      footLRot !== null ||
      footRRot !== null ||
      wristLDev !== null ||
      wristRDev !== null ||
      parsedPelvisWorldPos !== null ||
      parsedBoneOverrides !== null ||
      parsedExactBoneEulerRad !== null
    ) {
      hasCustomAngles = true;
    }
    applyExtendedDofFields(params);

    if (yaw !== null) {
      params.generalYawDeg = yaw;
    }

    if (loadKg !== null) {
      modifiers.loadKg = Math.max(0, Math.min(60, loadKg));
    }

    parsed.push({
      rowIndex: parsed.length,
      nVal: nVal !== null ? Math.round(nVal) : undefined,
      plateTitle,
      referenceImageUrl: refUrl || undefined,
      params,
      ergoModifiers: modifiers,
      hasCustomAngles,
    });
  }

  return parsed;
}

export interface KateCsvExportRowInput {
  n: number;
  plateTitle: string;
  basePosturalLabel?: string;
  params: KatePoseParams;
  ergoModifiers: KateErgonomicModifiers;
  measuredAngles?: {
    neckFlexDeg: number;
    trunkFlexDeg: number;
    shoulderLFlexDeg: number;
    shoulderRFlexDeg: number;
    elbowLFlexDeg: number;
    elbowRFlexDeg: number;
    kneeLFlexDeg: number;
    kneeRFlexDeg: number;
    wristLFlexDeg: number;
    wristRFlexDeg: number;
  };
  rigSnapshot?: KateRigExportSnapshot;
}

function escapeCsvCell(value: string | number): string {
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function inferKateBasePosturalId(
  params: KatePoseParams,
  modifiers: KateErgonomicModifiers,
  basePosturalLabel?: string,
): KateBasePosturalId {
  if (basePosturalLabel) {
    const entry = (Object.entries(KATE_BASE_POSTURAL_LABELS_ES) as Array<[KateBasePosturalId, string]>).find(
      ([, lbl]) => lbl.toLowerCase() === basePosturalLabel.trim().toLowerCase(),
    );
    if (entry) return entry[0];
    const norm = normalizeBasePosturalId(basePosturalLabel);
    if (norm) return norm;
  }

  if (params.bodyPitchDeg <= -60) return 'supine';
  if (params.bodyPitchDeg <= -20) return 'supine_37';
  if (params.bodyPitchDeg >= 25) return 'prone_bridge';

  if (modifiers.postureBase === 'squat') return 'squat';
  if (modifiers.postureBase === 'kneeling') {
    if (Math.abs(params.hipLFlexDeg - params.hipRFlexDeg) > 20) return 'kneel_asym';
    if (params.hipLAbdDeg >= 18) return 'kneel_wide';
    return 'kneel_heels';
  }
  if (modifiers.postureBase === 'sitting') {
    if (params.hipLRotDeg >= 30 && params.hipLAbdDeg >= 35) return 'lotus';
    if (params.kneeLFlexDeg <= 25 && params.kneeRFlexDeg <= 25) return 'seated_straight';
    if (params.hipLAbdDeg >= 24) return 'seated_open';
    return 'seated_stool';
  }

  return 'stand';
}

function serializeBoneOverridesForCsv(overrides: Record<string, KateBoneOverride> | undefined): string {
  if (!overrides) return '';
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  const r5 = (v: number) => Math.round(v * 100000) / 100000;

  const compact: Record<string, Record<string, number>> = {};
  for (const [bName, ov] of Object.entries(overrides)) {
    if (!ov) continue;
    const hasRot = Math.abs(ov.rx || 0) > 0.05 || Math.abs(ov.ry || 0) > 0.05 || Math.abs(ov.rz || 0) > 0.05;
    const hasScale = Math.abs((ov.lenScale ?? 1) - 1) > 0.005;
    const hasTrans = Math.abs(ov.tx || 0) > 1e-4 || Math.abs(ov.ty || 0) > 1e-4 || Math.abs(ov.tz || 0) > 1e-4;
    if (!hasRot && !hasScale && !hasTrans) continue;

    const entry: Record<string, number> = {
      rx: r2(ov.rx || 0),
      ry: r2(ov.ry || 0),
      rz: r2(ov.rz || 0),
      rxRad: r5(((ov.rx || 0) * Math.PI) / 180),
      ryRad: r5(((ov.ry || 0) * Math.PI) / 180),
      rzRad: r5(((ov.rz || 0) * Math.PI) / 180),
      lenScale: r3(ov.lenScale ?? 1),
    };
    if (hasTrans) {
      entry.tx = r4(ov.tx || 0);
      entry.ty = r4(ov.ty || 0);
      entry.tz = r4(ov.tz || 0);
    }
    compact[bName] = entry;
  }
  return Object.keys(compact).length > 0 ? JSON.stringify(compact) : '';
}

export function serializeKatePlatesToCsv(rows: KateCsvExportRowInput[]): string {
  const headers = [
    'N',
    'Postura',
    'Base_Postural',
    'A_Cuello',
    'B_Tronco',
    'C_Brazo_Izq',
    'D_Brazo_Der',
    'E_Antebrazo_Izq',
    'F_Antebrazo_Der',
    'G_Pierna_Izq',
    'H_Pierna_Der',
    'MI_Muneca_Izq',
    'MD_Muneca_Der',
    'Cuello_Lat',
    'Cuello_Giro',
    'Tronco_Lat',
    'Tronco_Tors',
    'Brazo_I_Abd',
    'Brazo_D_Abd',
    'Cadera_I',
    'Cadera_D',
    'Cadera_I_Abd',
    'Cadera_D_Abd',
    'Giro_Avatar',
    'Carga_Kg',
    // Columnas ampliadas 3D DOF (compatibles hacia atrás con CSV de 25 columnas)
    'Cadera_I_Rot',
    'Cadera_D_Rot',
    'Brazo_I_Rot',
    'Brazo_D_Rot',
    'Antebrazo_I_Pron',
    'Antebrazo_D_Pron',
    'Pie_I_Flex',
    'Pie_D_Flex',
    'Pie_I_Inv',
    'Pie_D_Inv',
    'Pie_I_Rot',
    'Pie_D_Rot',
    'MI_Muneca_Desv',
    'MD_Muneca_Desv',
    'Pelvis_Pos_X',
    'Pelvis_Pos_Y',
    'Pelvis_Pos_Z',
    'Huesos_Gizmo_XYZ',
    'Rig_Euler_Rad',
  ];

  const lines: string[] = [headers.join(',')];
  const round2 = (v: number) => Math.round(v * 100) / 100;
  const round4 = (v: number) => Math.round(v * 10000) / 10000;

  for (const r of rows) {
    const p = r.params;
    const m = r.measuredAngles;
    const s = r.rigSnapshot;
    const baseId = inferKateBasePosturalId(p, r.ergoModifiers, r.basePosturalLabel);
    const cleanPostura = r.plateTitle.replace(/^\s*\d+\.\s*/, '').trim() || r.plateTitle;
    const trunkB =
      m !== undefined
        ? m.trunkFlexDeg
        : Math.abs(p.bodyPitchDeg) > 0.5 && Math.abs(p.trunkFlexDeg) < 0.5
          ? p.bodyPitchDeg
          : p.trunkFlexDeg;

    const pelvisPos = s?.pelvisWorldPos ?? p.pelvisWorldPos ?? null;
    const gizmoJson = serializeBoneOverridesForCsv(p.boneOverrides);
    const eulerMap = s?.boneEulerRad ?? p.exactBoneEulerRad ?? null;
    const eulerJson = eulerMap && Object.keys(eulerMap).length > 0 ? JSON.stringify(eulerMap) : '';

    const rowCells: Array<string | number> = [
      r.n,
      cleanPostura,
      baseId,
      Math.round(m ? m.neckFlexDeg : p.neckFlexDeg),
      Math.round(trunkB),
      Math.round(m ? m.shoulderLFlexDeg : p.shoulderLFlexDeg),
      Math.round(m ? m.shoulderRFlexDeg : p.shoulderRFlexDeg),
      Math.round(m ? m.elbowLFlexDeg : p.elbowLFlexDeg),
      Math.round(m ? m.elbowRFlexDeg : p.elbowRFlexDeg),
      Math.round(m ? m.kneeLFlexDeg : p.kneeLFlexDeg),
      Math.round(m ? m.kneeRFlexDeg : p.kneeRFlexDeg),
      Math.round(m ? m.wristLFlexDeg : p.handL.wristPitchDeg),
      Math.round(m ? m.wristRFlexDeg : p.handR.wristPitchDeg),
      Math.round(p.neckSideDeg),
      Math.round(p.neckTwistDeg),
      Math.round(p.trunkSideDeg),
      Math.round(p.trunkTwistDeg),
      Math.round(p.shoulderLAbdDeg),
      Math.round(p.shoulderRAbdDeg),
      Math.round(p.hipLFlexDeg),
      Math.round(p.hipRFlexDeg),
      Math.round(p.hipLAbdDeg),
      Math.round(p.hipRAbdDeg),
      Math.round(p.generalYawDeg),
      r.ergoModifiers.loadKg,
      // 3D DOF ampliados
      round2(s ? s.hipLRotDeg : p.hipLRotDeg),
      round2(s ? s.hipRRotDeg : p.hipRRotDeg),
      round2(s ? s.shoulderLRotDeg : (p.shoulderLRotDeg ?? 0)),
      round2(s ? s.shoulderRRotDeg : (p.shoulderRRotDeg ?? 0)),
      round2(s ? s.forearmLPronDeg : ((p.forearmLPronDeg ?? 0) + p.handL.wristRollDeg)),
      round2(s ? s.forearmRPronDeg : ((p.forearmRPronDeg ?? 0) + p.handR.wristRollDeg)),
      round2(s ? s.footL.pitchDeg : p.footL.pitchDeg),
      round2(s ? s.footR.pitchDeg : p.footR.pitchDeg),
      round2(s ? s.footL.rollDeg : p.footL.rollDeg),
      round2(s ? s.footR.rollDeg : p.footR.rollDeg),
      round2(s ? s.footL.yawDeg : p.footL.yawDeg),
      round2(s ? s.footR.yawDeg : p.footR.yawDeg),
      round2(s ? s.wristLYawDeg : p.handL.wristYawDeg),
      round2(s ? s.wristRYawDeg : p.handR.wristYawDeg),
      pelvisPos ? round4(pelvisPos.x) : '',
      pelvisPos ? round4(pelvisPos.y) : '',
      pelvisPos ? round4(pelvisPos.z) : '',
      gizmoJson,
      eulerJson,
    ];

    lines.push(rowCells.map(escapeCsvCell).join(','));
  }

  return `\uFEFF${lines.join('\r\n')}`;
}

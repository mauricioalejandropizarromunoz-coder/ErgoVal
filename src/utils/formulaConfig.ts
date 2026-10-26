import { MethodId } from '../types/ergonomics';

export interface FormulaVariableMeta {
  name: string;
  description: string;
  sampleValue: number;
}

export interface MethodFormulaExpression {
  key: string;
  symbol: string;
  label: string;
  expression: string;
  defaultExpression: string;
  description: string;
  unit?: string;
  variables: FormulaVariableMeta[];
}

export interface MethodFormulaParameter {
  key: string;
  symbol: string;
  label: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  description: string;
}

export interface MethodFormulaProfile {
  methodId: MethodId;
  formulaSummary: string;
  defaultFormulaSummary: string;
  expressions: MethodFormulaExpression[];
  parameters: MethodFormulaParameter[];
}

export interface SavedFormulaOverrides {
  version: number;
  methods: Partial<
    Record<
      MethodId,
      {
        formulaSummary?: string;
        expressions?: Record<string, string>;
        parameters?: Record<string, number>;
      }
    >
  >;
}

const FORMULA_STORAGE_KEY = 'ergoeval_method_formulas_v1';

// ============================================================================
// SAFE RECURSIVE-DESCENT MATHEMATICAL EXPRESSION PARSER & EVALUATOR
// ============================================================================
type TokenType = 'num' | 'id' | 'op' | 'lparen' | 'rparen' | 'comma' | 'eof';

interface Token {
  type: TokenType;
  value: string;
  numValue?: number;
}

const BUILTIN_FUNCTIONS = new Set([
  'abs',
  'sqrt',
  'exp',
  'ln',
  'log',
  'log10',
  'pow',
  'min',
  'max',
  'round',
  'floor',
  'ceil',
  'clamp',
  'ifelse',
]);

function tokenizeExpression(rawInput: string): Token[] {
  const src = rawInput.trim();
  const tokens: Token[] = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Numbers: integer or decimal (e.g. 23, 0.003, .5)
    if (/[0-9]/.test(ch) || (ch === '.' && i + 1 < src.length && /[0-9]/.test(src[i + 1]))) {
      let numStr = '';
      while (i < src.length && /[0-9.]/.test(src[i])) {
        numStr += src[i++];
      }
      const parsed = Number(numStr);
      if (Number.isNaN(parsed)) {
        throw new Error(`Número inválido: "${numStr}"`);
      }
      tokens.push({ type: 'num', value: numStr, numValue: parsed });
      continue;
    }

    // Identifiers (variables, constants, functions)
    if (/[a-zA-Z_]/.test(ch)) {
      let id = '';
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) {
        id += src[i++];
      }
      tokens.push({ type: 'id', value: id });
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen', value: '(' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ')' });
      i++;
      continue;
    }
    if (ch === ',' || ch === ';') {
      tokens.push({ type: 'comma', value: ',' });
      i++;
      continue;
    }

    // Two-character operators
    const two = src.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '==' || two === '!=' || two === '**') {
      tokens.push({ type: 'op', value: two === '**' ? '^' : two });
      i += 2;
      continue;
    }

    // Single-character operators (including × and ÷)
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^' || ch === '<' || ch === '>') {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    if (ch === '×' || ch === '·') {
      tokens.push({ type: 'op', value: '*' });
      i++;
      continue;
    }
    if (ch === '÷') {
      tokens.push({ type: 'op', value: '/' });
      i++;
      continue;
    }

    throw new Error(`Carácter no reconocido en la fórmula: "${ch}"`);
  }

  tokens.push({ type: 'eof', value: '' });
  return tokens;
}

class FormulaParser {
  private pos = 0;
  public referencedVars = new Set<string>();

  constructor(
    private tokens: Token[],
    private vars: Record<string, number>,
  ) {}

  private peek(): Token {
    return this.tokens[this.pos] || { type: 'eof', value: '' };
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  public parseRoot(): number {
    const val = this.parseComparison();
    if (this.peek().type !== 'eof') {
      throw new Error(`Símbolo inesperado cerca de "${this.peek().value}"`);
    }
    return val;
  }

  private parseComparison(): number {
    let left = this.parseAddSub();
    while (
      this.peek().type === 'op' &&
      ['<', '<=', '>', '>=', '==', '!='].includes(this.peek().value)
    ) {
      const op = this.consume().value;
      const right = this.parseAddSub();
      if (op === '<') left = left < right ? 1 : 0;
      else if (op === '<=') left = left <= right ? 1 : 0;
      else if (op === '>') left = left > right ? 1 : 0;
      else if (op === '>=') left = left >= right ? 1 : 0;
      else if (op === '==') left = Math.abs(left - right) < 1e-9 ? 1 : 0;
      else if (op === '!=') left = Math.abs(left - right) >= 1e-9 ? 1 : 0;
    }
    return left;
  }

  private parseAddSub(): number {
    let left = this.parseMulDiv();
    while (this.peek().type === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.consume().value;
      const right = this.parseMulDiv();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  private parseMulDiv(): number {
    let left = this.parsePower();
    while (this.peek().type === 'op' && (this.peek().value === '*' || this.peek().value === '/')) {
      const op = this.consume().value;
      const right = this.parsePower();
      if (op === '*') {
        left = left * right;
      } else {
        left = right === 0 ? 0 : left / right;
      }
    }
    return left;
  }

  private parsePower(): number {
    const base = this.parseUnary();
    if (this.peek().type === 'op' && this.peek().value === '^') {
      this.consume();
      const exp = this.parsePower();
      return Math.pow(base, exp);
    }
    return base;
  }

  private parseUnary(): number {
    if (this.peek().type === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.consume().value;
      const val = this.parseUnary();
      return op === '-' ? -val : val;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const tok = this.peek();

    if (tok.type === 'num') {
      this.consume();
      return tok.numValue ?? 0;
    }

    if (tok.type === 'lparen') {
      this.consume();
      const inner = this.parseComparison();
      if (this.peek().type !== 'rparen') {
        throw new Error('Falta paréntesis de cierre ")"');
      }
      this.consume();
      return inner;
    }

    if (tok.type === 'id') {
      this.consume();
      const name = tok.value;
      const lower = name.toLowerCase();

      // Function call
      if (this.peek().type === 'lparen') {
        this.consume(); // '('
        const args: number[] = [];
        if (this.peek().type !== 'rparen') {
          args.push(this.parseComparison());
          while (this.peek().type === 'comma') {
            this.consume();
            args.push(this.parseComparison());
          }
        }
        if (this.peek().type !== 'rparen') {
          throw new Error(`Falta ")" al cerrar la función ${name}()`);
        }
        this.consume();
        return this.invokeFunction(lower, args);
      }

      // Mathematical constants
      if (lower === 'pi') return Math.PI;
      if (lower === 'e') return Math.E;

      this.referencedVars.add(name);
      if (Object.prototype.hasOwnProperty.call(this.vars, name)) {
        return this.vars[name];
      }
      const ciKey = Object.keys(this.vars).find((k) => k.toLowerCase() === lower);
      if (ciKey !== undefined) {
        return this.vars[ciKey];
      }
      throw new Error(`Variable desconocida: "${name}"`);
    }

    throw new Error(tok.type === 'eof' ? 'Expresión incompleta' : `Token inesperado: "${tok.value}"`);
  }

  private invokeFunction(fn: string, args: number[]): number {
    if (!BUILTIN_FUNCTIONS.has(fn)) {
      throw new Error(`Función no reconocida: "${fn}()". Use min, max, abs, sqrt, exp, pow, clamp o ifelse.`);
    }
    switch (fn) {
      case 'abs':
        if (args.length !== 1) throw new Error('abs(x) requiere 1 argumento');
        return Math.abs(args[0]);
      case 'sqrt':
        if (args.length !== 1) throw new Error('sqrt(x) requiere 1 argumento');
        return Math.sqrt(Math.max(0, args[0]));
      case 'exp':
        if (args.length !== 1) throw new Error('exp(x) requiere 1 argumento');
        return Math.exp(args[0]);
      case 'ln':
      case 'log':
        if (args.length !== 1) throw new Error(`${fn}(x) requiere 1 argumento`);
        return Math.log(Math.max(1e-9, args[0]));
      case 'log10':
        if (args.length !== 1) throw new Error('log10(x) requiere 1 argumento');
        return Math.log10(Math.max(1e-9, args[0]));
      case 'pow':
        if (args.length !== 2) throw new Error('pow(base, exp) requiere 2 argumentos');
        return Math.pow(args[0], args[1]);
      case 'min':
        if (args.length < 1) throw new Error('min(...) requiere al menos 1 argumento');
        return Math.min(...args);
      case 'max':
        if (args.length < 1) throw new Error('max(...) requiere al menos 1 argumento');
        return Math.max(...args);
      case 'round':
        if (args.length !== 1) throw new Error('round(x) requiere 1 argumento');
        return Math.round(args[0]);
      case 'floor':
        if (args.length !== 1) throw new Error('floor(x) requiere 1 argumento');
        return Math.floor(args[0]);
      case 'ceil':
        if (args.length !== 1) throw new Error('ceil(x) requiere 1 argumento');
        return Math.ceil(args[0]);
      case 'clamp':
        if (args.length !== 3) throw new Error('clamp(valor, min, max) requiere 3 argumentos');
        return Math.max(args[1], Math.min(args[2], args[0]));
      case 'ifelse':
        if (args.length !== 3) throw new Error('ifelse(condicion, valorSi, valorNo) requiere 3 argumentos');
        return args[0] !== 0 ? args[1] : args[2];
      default:
        return 0;
    }
  }
}

export function evaluateFormulaExpression(
  expression: string,
  vars: Record<string, number>,
  fallback: number,
): number {
  try {
    if (!expression || !expression.trim()) return fallback;
    const tokens = tokenizeExpression(expression);
    const parser = new FormulaParser(tokens, vars);
    const result = parser.parseRoot();
    if (!Number.isFinite(result) || Number.isNaN(result)) {
      return fallback;
    }
    return result;
  } catch {
    return fallback;
  }
}

export function validateFormulaExpression(
  expression: string,
  variables: FormulaVariableMeta[],
  extraVars: Record<string, number> = {},
): { valid: boolean; error?: string; sampleResult?: number } {
  try {
    if (!expression || !expression.trim()) {
      return { valid: false, error: 'La expresión no puede estar vacía.' };
    }
    const sampleMap: Record<string, number> = { ...extraVars };
    for (const v of variables) {
      sampleMap[v.name] = v.sampleValue;
    }
    const tokens = tokenizeExpression(expression);
    const parser = new FormulaParser(tokens, sampleMap);
    const val = parser.parseRoot();
    if (!Number.isFinite(val) || Number.isNaN(val)) {
      return { valid: false, error: 'El resultado numérico es indefinido (NaN o Infinito).' };
    }
    return { valid: true, sampleResult: val };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Error de sintaxis matemática',
    };
  }
}

// ============================================================================
// DEFAULT FORMULA PROFILES FOR ALL 15 ERGONOMIC METHODS
// ============================================================================
export function createDefaultFormulaProfiles(): Record<MethodId, MethodFormulaProfile> {
  const build = (
    methodId: MethodId,
    formulaSummary: string,
    expressions: Omit<MethodFormulaExpression, 'defaultExpression'>[],
    parameters: Omit<MethodFormulaParameter, 'defaultValue'>[],
  ): MethodFormulaProfile => ({
    methodId,
    formulaSummary,
    defaultFormulaSummary: formulaSummary,
    expressions: expressions.map((e) => ({ ...e, defaultExpression: e.expression })),
    parameters: parameters.map((p) => ({ ...p, defaultValue: p.value })),
  });

  return {
    [MethodId.RULA]: build(
      MethodId.RULA,
      'Puntuación C = Tabla A(Brazo, Antebrazo, Muñeca, Giro) + Uso Muscular A + Fuerza/Carga A\nPuntuación D = Tabla B(Cuello, Tronco, Piernas) + Uso Muscular B + Fuerza/Carga B\nPuntuación Final RULA = Tabla C(Puntuación C, Puntuación D) [Escala 1 a 7]',
      [
        {
          key: 'scoreC',
          symbol: 'C',
          label: 'Puntuación Grupo A Corregida (C)',
          expression: 'scoreA + muscleUseA + forceLoadA',
          description: 'Suma la postura del miembro superior (Tabla A) con uso muscular y carga.',
          unit: 'pts',
          variables: [
            { name: 'scoreA', description: 'Valor postural de Tabla A (1 a 9)', sampleValue: 4 },
            { name: 'muscleUseA', description: 'Uso muscular Grupo A (0 o 1)', sampleValue: 1 },
            { name: 'forceLoadA', description: 'Carga/fuerza Grupo A (0 a 3)', sampleValue: 1 },
          ],
        },
        {
          key: 'scoreD',
          symbol: 'D',
          label: 'Puntuación Grupo B Corregida (D)',
          expression: 'scoreB + muscleUseB + forceLoadB',
          description: 'Suma la postura de cuello, tronco y piernas (Tabla B) con uso muscular y carga.',
          unit: 'pts',
          variables: [
            { name: 'scoreB', description: 'Valor postural de Tabla B (1 a 9)', sampleValue: 4 },
            { name: 'muscleUseB', description: 'Uso muscular Grupo B (0 o 1)', sampleValue: 1 },
            { name: 'forceLoadB', description: 'Carga/fuerza Grupo B (0 a 3)', sampleValue: 1 },
          ],
        },
        {
          key: 'finalScore',
          symbol: 'RULA_final',
          label: 'Puntuación Final RULA',
          expression: 'tableC',
          description: 'Puntuación final obtenida del cruce en Tabla C (permite añadir factor corrector si se requiere).',
          unit: 'pts',
          variables: [
            { name: 'tableC', description: 'Cruce matricial Tabla C (1 a 7)', sampleValue: 6 },
            { name: 'scoreC', description: 'Subtotal Grupo A (C)', sampleValue: 6 },
            { name: 'scoreD', description: 'Subtotal Grupo B (D)', sampleValue: 6 },
          ],
        },
      ],
      [
        {
          key: 'modMin',
          symbol: 'N2_min',
          label: 'Umbral Nivel 2 — Riesgo Moderado',
          value: 3,
          min: 2,
          max: 6,
          step: 1,
          unit: 'pts',
          description: 'Puntuación mínima para clasificar como Nivel de Actuación 2 (Moderado).',
        },
        {
          key: 'highMin',
          symbol: 'N3_min',
          label: 'Umbral Nivel 3 — Riesgo Alto',
          value: 5,
          min: 3,
          max: 7,
          step: 1,
          unit: 'pts',
          description: 'Puntuación mínima para clasificar como Nivel de Actuación 3 (Alto).',
        },
        {
          key: 'veryHighMin',
          symbol: 'N4_min',
          label: 'Umbral Nivel 4 — Riesgo Muy Alto',
          value: 7,
          min: 4,
          max: 10,
          step: 1,
          unit: 'pts',
          description: 'Puntuación mínima para clasificar como Nivel de Actuación 4 (Muy Alto).',
        },
      ],
    ),

    [MethodId.REBA]: build(
      MethodId.REBA,
      'Puntuación A = Tabla A(Tronco, Cuello, Piernas) + Carga/Fuerza\nPuntuación B = Tabla B(Brazo, Antebrazo, Muñeca) + Acoplamiento/Agarre\nPuntuación Final REBA = Tabla C(Puntuación A, Puntuación B) + Actividad Muscular [Escala 1 a 15]',
      [
        {
          key: 'scoreA',
          symbol: 'A',
          label: 'Puntuación Grupo A (Tronco, Cuello, Piernas + Carga)',
          expression: 'clamp(tableA + loadPoints, 1, 12)',
          description: 'Combina el resultado de Tabla A con los puntos por fuerza o carga brusca.',
          unit: 'pts',
          variables: [
            { name: 'tableA', description: 'Valor Tabla A (1 a 9)', sampleValue: 6 },
            { name: 'loadPoints', description: 'Puntos de fuerza/carga (0 a 3)', sampleValue: 1 },
          ],
        },
        {
          key: 'scoreB',
          symbol: 'B',
          label: 'Puntuación Grupo B (MMSS + Agarre)',
          expression: 'clamp(tableB + coupling, 1, 12)',
          description: 'Combina el resultado de Tabla B con la penalización por calidad de agarre.',
          unit: 'pts',
          variables: [
            { name: 'tableB', description: 'Valor Tabla B (1 a 9)', sampleValue: 5 },
            { name: 'coupling', description: 'Penalización por agarre (0 a 3)', sampleValue: 1 },
          ],
        },
        {
          key: 'finalReba',
          symbol: 'REBA_final',
          label: 'Puntuación Final REBA',
          expression: 'clamp(tableC + activityScore, 1, 15)',
          description: 'Suma la puntuación combinada de Tabla C y los puntos de actividad muscular.',
          unit: 'pts',
          variables: [
            { name: 'tableC', description: 'Valor Tabla C (1 a 12)', sampleValue: 9 },
            { name: 'activityScore', description: 'Actividad muscular (0 a 3)', sampleValue: 2 },
            { name: 'scoreA', description: 'Subtotal Grupo A', sampleValue: 7 },
            { name: 'scoreB', description: 'Subtotal Grupo B', sampleValue: 6 },
          ],
        },
      ],
      [
        {
          key: 'lowMin',
          symbol: 'N1_min',
          label: 'Umbral Nivel 1 — Riesgo Bajo',
          value: 2,
          min: 1,
          max: 5,
          step: 1,
          unit: 'pts',
          description: 'Puntuación desde la cual pasa de inapreciable (Nivel 0) a bajo (Nivel 1).',
        },
        {
          key: 'modMin',
          symbol: 'N2_min',
          label: 'Umbral Nivel 2 — Riesgo Medio',
          value: 4,
          min: 2,
          max: 8,
          step: 1,
          unit: 'pts',
          description: 'Puntuación mínima para Nivel de Actuación 2 (Riesgo Medio).',
        },
        {
          key: 'highMin',
          symbol: 'N3_min',
          label: 'Umbral Nivel 3 — Riesgo Alto',
          value: 8,
          min: 5,
          max: 12,
          step: 1,
          unit: 'pts',
          description: 'Puntuación mínima para Nivel de Actuación 3 (Riesgo Alto).',
        },
        {
          key: 'veryHighMin',
          symbol: 'N4_min',
          label: 'Umbral Nivel 4 — Riesgo Muy Alto',
          value: 11,
          min: 8,
          max: 15,
          step: 1,
          unit: 'pts',
          description: 'Puntuación mínima para Nivel de Actuación 4 (Actuación Inmediata).',
        },
      ],
    ),

    [MethodId.OWAS]: build(
      MethodId.OWAS,
      'Código Postural = [Espalda 1..4][Brazos 1..3][Piernas 1..7][Carga 1..3] → Categoría de Acción (1 a 4)\nÍndice Ponderado OWAS = (Cat1%·1 + Cat2%·2 + Cat3%·3 + Cat4%·4) / 100',
      [
        {
          key: 'weightedIndex',
          symbol: 'I_OWAS',
          label: 'Índice Ponderado de Categorías de Acción',
          expression: '(cat1Pct * 1 + cat2Pct * 2 + cat3Pct * 3 + cat4Pct * 4) / 100',
          description: 'Promedio ponderado de las cuatro categorías de acción según su frecuencia relativa.',
          unit: 'cat.',
          variables: [
            { name: 'cat1Pct', description: 'Porcentaje en Categoría 1 (0–100)', sampleValue: 35 },
            { name: 'cat2Pct', description: 'Porcentaje en Categoría 2 (0–100)', sampleValue: 0 },
            { name: 'cat3Pct', description: 'Porcentaje en Categoría 3 (0–100)', sampleValue: 35 },
            { name: 'cat4Pct', description: 'Porcentaje en Categoría 4 (0–100)', sampleValue: 30 },
            { name: 'totalObs', description: 'Total de observaciones muestreadas', sampleValue: 100 },
          ],
        },
      ],
      [
        {
          key: 'cat4MinPct',
          symbol: 'Umbral_C4%',
          label: 'Frecuencia mínima en Cat. 4 para Riesgo Muy Alto',
          value: 0.01,
          min: 0.01,
          max: 50,
          step: 0.5,
          unit: '%',
          description: 'Porcentaje mínimo de observaciones en Categoría 4 que dispara corrección inmediata.',
        },
        {
          key: 'cat3MinPct',
          symbol: 'Umbral_C3%',
          label: 'Frecuencia mínima en Cat. 3 para Riesgo Alto',
          value: 0.01,
          min: 0.01,
          max: 50,
          step: 0.5,
          unit: '%',
          description: 'Porcentaje mínimo de observaciones en Categoría 3 que dispara riesgo alto.',
        },
        {
          key: 'cat2MinPct',
          symbol: 'Umbral_C2%',
          label: 'Frecuencia mínima en Cat. 2 para Riesgo Moderado',
          value: 0.01,
          min: 0.01,
          max: 50,
          step: 0.5,
          unit: '%',
          description: 'Porcentaje mínimo de observaciones en Categoría 2 que dispara riesgo moderado.',
        },
      ],
    ),

    [MethodId.NIOSH]: build(
      MethodId.NIOSH,
      'RWL = LC · HM · VM · DM · AM · FM · CM\nLC = 23 kg | HM = 25 / H | VM = 1 - 0.003 · |V - 75| | DM = 0.82 + 4.5 / D | AM = 1 - 0.0032 · A\nÍndice de Levantamiento (IL) = L / RWL',
      [
        {
          key: 'hm',
          symbol: 'HM',
          label: 'Multiplicador Horizontal (HM)',
          expression: 'ifelse(H <= hOpt, 1, ifelse(H > hMax, 0, hOpt / H))',
          description: 'Penalización por distancia horizontal desde el punto medio entre tobillos.',
          variables: [
            { name: 'H', description: 'Distancia horizontal medida (cm)', sampleValue: 40 },
            { name: 'hOpt', description: 'Distancia óptima (25 cm)', sampleValue: 25 },
            { name: 'hMax', description: 'Alcance máximo admisible (63 cm)', sampleValue: 63 },
          ],
        },
        {
          key: 'vm',
          symbol: 'VM',
          label: 'Multiplicador Vertical (VM)',
          expression: 'ifelse(V < 0, 0, ifelse(V > vMax, 0, 1 - 0.003 * abs(V - vOpt)))',
          description: 'Penalización por desviación respecto a la altura óptima de nudillos (75 cm).',
          variables: [
            { name: 'V', description: 'Altura vertical de manos (cm)', sampleValue: 20 },
            { name: 'vOpt', description: 'Altura óptima (75 cm)', sampleValue: 75 },
            { name: 'vMax', description: 'Altura vertical máxima (175 cm)', sampleValue: 175 },
          ],
        },
        {
          key: 'dm',
          symbol: 'DM',
          label: 'Multiplicador de Desplazamiento Vertical (DM)',
          expression: 'ifelse(D < 25, 1, ifelse(D > 175, 0, 0.82 + 4.5 / D))',
          description: 'Factor según recorrido vertical neto D = |Vdest - Vorig|.',
          variables: [
            { name: 'D', description: 'Desplazamiento vertical neto (cm)', sampleValue: 60 },
          ],
        },
        {
          key: 'am',
          symbol: 'AM',
          label: 'Multiplicador de Asimetría (AM)',
          expression: 'ifelse(A >= aMax, 0, max(0, 1 - 0.0032 * A))',
          description: 'Penalización por ángulo de giro o torsión fuera del plano sagital.',
          variables: [
            { name: 'A', description: 'Ángulo de asimetría (°)', sampleValue: 45 },
            { name: 'aMax', description: 'Ángulo máximo admisible (135°)', sampleValue: 135 },
          ],
        },
        {
          key: 'rwl',
          symbol: 'RWL',
          label: 'Límite de Peso Recomendado (RWL)',
          expression: 'LC * HM * VM * DM * AM * FM * CM',
          description: 'Producto de la constante de carga por los seis factores multiplicadores.',
          unit: 'kg',
          variables: [
            { name: 'LC', description: 'Constante de carga (23 kg)', sampleValue: 23 },
            { name: 'HM', description: 'Factor horizontal', sampleValue: 0.63 },
            { name: 'VM', description: 'Factor vertical', sampleValue: 0.84 },
            { name: 'DM', description: 'Factor desplazamiento', sampleValue: 0.9 },
            { name: 'AM', description: 'Factor asimetría', sampleValue: 0.86 },
            { name: 'FM', description: 'Factor frecuencia (Tabla 5.1)', sampleValue: 0.45 },
            { name: 'CM', description: 'Factor agarre (Tabla 5.2)', sampleValue: 0.95 },
          ],
        },
        {
          key: 'il',
          symbol: 'IL',
          label: 'Índice de Levantamiento (IL)',
          expression: 'L / RWL',
          description: 'Relación entre la masa real manipulada (L) y el límite recomendado (RWL).',
          variables: [
            { name: 'L', description: 'Peso real de la carga (kg)', sampleValue: 18 },
            { name: 'RWL', description: 'Límite de Peso Recomendado (kg)', sampleValue: 5.5 },
          ],
        },
      ],
      [
        {
          key: 'LC',
          symbol: 'LC',
          label: 'Constante de Carga Ideal (LC)',
          value: 23,
          min: 10,
          max: 40,
          step: 0.5,
          unit: 'kg',
          description: 'Masa máxima en condiciones ideales (23 kg NIOSH / 25 kg EN 1005-2).',
        },
        {
          key: 'hOpt',
          symbol: 'H_opt',
          label: 'Distancia Horizontal Óptima',
          value: 25,
          min: 15,
          max: 35,
          step: 1,
          unit: 'cm',
          description: 'Distancia horizontal sin penalización (HM = 1,00).',
        },
        {
          key: 'hMax',
          symbol: 'H_max',
          label: 'Distancia Horizontal Máxima',
          value: 63,
          min: 50,
          max: 80,
          step: 1,
          unit: 'cm',
          description: 'Distancia a partir de la cual HM se anula (HM = 0).',
        },
        {
          key: 'vOpt',
          symbol: 'V_opt',
          label: 'Altura Vertical Óptima',
          value: 75,
          min: 60,
          max: 90,
          step: 1,
          unit: 'cm',
          description: 'Altura media de nudillos donde VM = 1,00.',
        },
        {
          key: 'vMax',
          symbol: 'V_max',
          label: 'Altura Vertical Máxima',
          value: 175,
          min: 140,
          max: 210,
          step: 1,
          unit: 'cm',
          description: 'Altura vertical máxima admisible antes de anular VM.',
        },
        {
          key: 'aMax',
          symbol: 'A_max',
          label: 'Ángulo de Asimetría Máximo',
          value: 135,
          min: 90,
          max: 180,
          step: 5,
          unit: '°',
          description: 'Giro máximo a partir del cual AM = 0.',
        },
        {
          key: 'modLimit',
          symbol: 'IL_mod',
          label: 'Corte IL Aceptable / Moderado',
          value: 1.0,
          min: 0.5,
          max: 2.0,
          step: 0.05,
          description: 'Por encima de este valor el riesgo pasa a Moderado.',
        },
        {
          key: 'highLimit',
          symbol: 'IL_alto',
          label: 'Corte IL Riesgo Alto',
          value: 2.0,
          min: 1.2,
          max: 3.5,
          step: 0.1,
          description: 'Por encima de este valor el riesgo pasa a Alto.',
        },
        {
          key: 'veryHighLimit',
          symbol: 'IL_crit',
          label: 'Corte IL Riesgo Muy Alto',
          value: 3.0,
          min: 1.5,
          max: 5.0,
          step: 0.1,
          description: 'Por encima de este valor la tarea exige corrección inmediata.',
        },
      ],
    ),

    [MethodId.SNOOK]: build(
      MethodId.SNOOK,
      'Levantamiento: Índice = max(Peso_real / Peso_máx, (Peso_real · Frec) / KgMin_máx)\nEmpuje / Tracción: Índice = max(F_inicial / F_ini_máx, F_sostenida / F_sost_máx)\nTransporte: Índice = Peso_real / Peso_transporte_máx',
      [
        {
          key: 'kgPerMin',
          symbol: 'M_min',
          label: 'Masa Acumulada por Minuto (Levantamiento)',
          expression: 'actualWeight * freq',
          description: 'Producto del peso unitario por la frecuencia de levantamientos por minuto.',
          unit: 'kg/min',
          variables: [
            { name: 'actualWeight', description: 'Peso real del objeto (kg)', sampleValue: 14 },
            { name: 'freq', description: 'Frecuencia (lev/min)', sampleValue: 4 },
          ],
        },
        {
          key: 'liftRatio',
          symbol: 'R_lev',
          label: 'Razón de Exigencia en Levantamiento',
          expression: 'max(actualWeight / maxWeight, kgPerMin / maxKgMin)',
          description: 'Adopta la relación más exigente entre límite unitario y acumulado por minuto.',
          variables: [
            { name: 'actualWeight', description: 'Peso real (kg)', sampleValue: 14 },
            { name: 'maxWeight', description: 'Peso máximo aceptable tabulado (kg)', sampleValue: 11 },
            { name: 'kgPerMin', description: 'Masa por minuto real (kg/min)', sampleValue: 56 },
            { name: 'maxKgMin', description: 'Masa por minuto máxima tabulada (kg/min)', sampleValue: 160 },
          ],
        },
        {
          key: 'pushPullRatio',
          symbol: 'R_emp',
          label: 'Razón de Exigencia en Empuje / Tracción',
          expression: 'max(actualInit / maxInit, actualSust / maxSust)',
          description: 'Compara simultáneamente la fuerza inicial de arranque y la fuerza sostenida.',
          variables: [
            { name: 'actualInit', description: 'Fuerza inicial medida (N)', sampleValue: 310 },
            { name: 'maxInit', description: 'Fuerza inicial máxima aceptable (N)', sampleValue: 281 },
            { name: 'actualSust', description: 'Fuerza sostenida medida (N)', sampleValue: 190 },
            { name: 'maxSust', description: 'Fuerza sostenida máxima aceptable (N)', sampleValue: 180 },
          ],
        },
        {
          key: 'carryRatio',
          symbol: 'R_trans',
          label: 'Razón de Exigencia en Transporte Horizontal',
          expression: 'actualWeight / maxCarry',
          description: 'Relación entre masa transportada y límite psicofísico de la Tabla 5.16.',
          variables: [
            { name: 'actualWeight', description: 'Peso transportado (kg)', sampleValue: 20 },
            { name: 'maxCarry', description: 'Peso máximo de transporte (kg)', sampleValue: 27 },
          ],
        },
      ],
      [
        {
          key: 'femFactor',
          symbol: 'k_fem',
          label: 'Factor Poblacional Femenino (Empuje/Tracción)',
          value: 0.72,
          min: 0.5,
          max: 1.0,
          step: 0.01,
          description: 'Coeficiente reductor de límites de fuerza para proteger al 90% de población femenina.',
        },
        {
          key: 'modLimit',
          symbol: 'R_adm',
          label: 'Razón Máxima Admisible (Corte Moderado)',
          value: 1.0,
          min: 0.7,
          max: 1.2,
          step: 0.05,
          description: 'Hasta este valor la operación se considera psicofísicamente admisible.',
        },
        {
          key: 'highLimit',
          symbol: 'R_alto',
          label: 'Corte de Riesgo Alto',
          value: 1.25,
          min: 1.05,
          max: 1.6,
          step: 0.05,
          description: 'Razón a partir de la cual la exigencia pasa a Riesgo Alto.',
        },
        {
          key: 'veryHighLimit',
          symbol: 'R_crit',
          label: 'Corte de Riesgo Muy Alto',
          value: 1.5,
          min: 1.2,
          max: 2.5,
          step: 0.05,
          description: 'Razón a partir de la cual exige intervención inmediata.',
        },
      ],
    ),

    [MethodId.LMC_295]: build(
      MethodId.LMC_295,
      'Selecciona Tabla 1, 2 o 3 según duración diaria (≤2h o >2h) y levantamientos/hora (máx. 360 lev/h)\nRazón VLU = Peso_real / VLU_tabla [Cumple si Peso_real ≤ VLU_tabla]',
      [
        {
          key: 'weightRatio',
          symbol: 'R_VLU',
          label: 'Razón respecto al Valor Límite Umbral (VLU)',
          expression: 'actualWeight / limitKg',
          description: 'Cociente entre la masa real del objeto y el VLU en kg de la tabla legal aplicable.',
          variables: [
            { name: 'actualWeight', description: 'Peso real levantado (kg)', sampleValue: 13.2 },
            { name: 'limitKg', description: 'Valor Límite Umbral de la celda (kg)', sampleValue: 32 },
            { name: 'aggravatingCount', description: 'Cantidad de factores agravantes presentes', sampleValue: 0 },
          ],
        },
      ],
      [
        {
          key: 'maxLiftsPerHour',
          symbol: 'F_max_h',
          label: 'Tope Máximo de Levantamientos por Hora',
          value: 360,
          min: 120,
          max: 720,
          step: 10,
          unit: 'lev/h',
          description: 'Por encima de esta frecuencia horaria no existe límite seguro en las tablas Res. 295/03.',
        },
        {
          key: 'precautionRatio',
          symbol: 'k_prec',
          label: 'Fracción de Precaución sobre el VLU',
          value: 0.85,
          min: 0.5,
          max: 1.0,
          step: 0.05,
          description: 'Fracción del VLU a partir de la cual se advierte proximidad al límite.',
        },
        {
          key: 'criticalRatio',
          symbol: 'k_crit',
          label: 'Múltiplo de Superación Crítica del VLU',
          value: 1.3,
          min: 1.05,
          max: 2.0,
          step: 0.05,
          description: 'Relación Peso/VLU por encima de la cual se clasifica como Riesgo Muy Alto.',
        },
      ],
    ),

    [MethodId.OCRA_COMPLETO]: build(
      MethodId.OCRA_COMPLETO,
      'Frecuencia (acc/min) = (Acciones_ciclo / Duración_ciclo_s) · 60\nATA_realizadas = Frecuencia · Minutos_netos\nATA_ref = (CF · Fm · Fp · Ff · Fe · Fa · Ft · Fc) · Minutos_netos\nÍndice OCRA = ATA_realizadas / ATA_ref',
      [
        {
          key: 'freqPerMin',
          symbol: 'F_acc',
          label: 'Frecuencia de Acciones Técnicas por Minuto',
          expression: '(actionsPerCycle / cycleSec) * 60',
          description: 'Cantidad de acciones técnicas dinámicas o estáticas ejecutadas por minuto.',
          unit: 'acc/min',
          variables: [
            { name: 'actionsPerCycle', description: 'Acciones técnicas por ciclo', sampleValue: 6 },
            { name: 'cycleSec', description: 'Duración del ciclo (s)', sampleValue: 6 },
          ],
        },
        {
          key: 'ataPerformed',
          symbol: 'ATA_real',
          label: 'Acciones Técnicas Realizadas en el Turno (ATA)',
          expression: 'freqPerMin * netMin',
          description: 'Total de acciones técnicas efectuadas durante el tiempo neto repetitivo.',
          unit: 'ATA',
          variables: [
            { name: 'freqPerMin', description: 'Frecuencia calculada (acc/min)', sampleValue: 60 },
            { name: 'netMin', description: 'Minutos netos de tarea repetitiva', sampleValue: 420 },
          ],
        },
        {
          key: 'ataRefPerMin',
          symbol: 'ATA_ref_min',
          label: 'Acciones de Referencia por Minuto',
          expression: 'CF * Fm * Fp * Ff * Fe * Fa * Ft * Fc',
          description: 'Capacidad de referencia por minuto corregida por los 7 multiplicadores.',
          unit: 'acc/min',
          variables: [
            { name: 'CF', description: 'Constante de frecuencia (30 acc/min)', sampleValue: 30 },
            { name: 'Fm', description: 'Factor fuerza', sampleValue: 0.65 },
            { name: 'Fp', description: 'Factor postura', sampleValue: 0.7 },
            { name: 'Ff', description: 'Factor repetitividad', sampleValue: 0.5 },
            { name: 'Fe', description: 'Factor estereotipia', sampleValue: 0.7 },
            { name: 'Fa', description: 'Factor agentes físicos', sampleValue: 1.0 },
            { name: 'Ft', description: 'Factor recuperación', sampleValue: 0.85 },
            { name: 'Fc', description: 'Factor duración', sampleValue: 0.7 },
          ],
        },
        {
          key: 'ocraIndex',
          symbol: 'OCRA',
          label: 'Índice de Exposición OCRA',
          expression: 'ataPerformed / (ataRefPerMin * netMin)',
          description: 'Cociente entre acciones técnicas realizadas y acciones técnicas recomendadas.',
          variables: [
            { name: 'ataPerformed', description: 'Total ATA realizadas', sampleValue: 25200 },
            { name: 'ataRefPerMin', description: 'Acciones de referencia por minuto', sampleValue: 2.84 },
            { name: 'netMin', description: 'Minutos netos repetitivos', sampleValue: 420 },
          ],
        },
      ],
      [
        {
          key: 'CF',
          symbol: 'CF',
          label: 'Constante Basal de Frecuencia (CF)',
          value: 30,
          min: 15,
          max: 45,
          step: 1,
          unit: 'acc/min',
          description: 'Constante estándar ISO 11228-3 en condiciones óptimas (30 acciones/min).',
        },
        {
          key: 'modLimit',
          symbol: 'OCRA_adm',
          label: 'Umbral Aceptable (Verde / Amarillo)',
          value: 2.2,
          min: 1.0,
          max: 3.0,
          step: 0.1,
          description: 'Hasta este valor la exposición se considera aceptable.',
        },
        {
          key: 'highLimit',
          symbol: 'OCRA_alto',
          label: 'Umbral Riesgo Alto (Rojo Leve)',
          value: 3.5,
          min: 2.3,
          max: 5.0,
          step: 0.1,
          description: 'Por encima de este valor pasa a Riesgo Alto.',
        },
        {
          key: 'veryHighLimit',
          symbol: 'OCRA_crit',
          label: 'Umbral Riesgo Muy Alto (Rojo Intenso)',
          value: 4.5,
          min: 3.5,
          max: 9.0,
          step: 0.1,
          description: 'Por encima de este valor exige reducción inmediata.',
        },
      ],
    ),

    [MethodId.OCRA_CHECKLIST]: build(
      MethodId.OCRA_CHECKLIST,
      'Tiempo Neto (TNTR) = Jornada - Pausas Oficiales - Almuerzo - Tareas No Repetitivas\nICL = (FR + FF + FFz + FP + FC) · FD [Modo Bilateral Res. 886/15]\nModo Coeficientes (Cap. 6.3): Est = Frec_real / (CF · cRec · cFrec · cFza · cPost · cComp · cEst · cDur)',
      [
        {
          key: 'netRepMin',
          symbol: 'TNTR',
          label: 'Tiempo Neto de Trabajo Repetitivo (Modo Bilateral)',
          expression: 'max(0, shiftMin - breaksMin - lunchMin - nonRepMin)',
          description: 'Minutos efectivos de exposición a movimientos repetitivos en la jornada.',
          unit: 'min',
          variables: [
            { name: 'shiftMin', description: 'Duración total del turno (min)', sampleValue: 600 },
            { name: 'breaksMin', description: 'Pausas oficiales (min)', sampleValue: 30 },
            { name: 'lunchMin', description: 'Pausa de comedor (min)', sampleValue: 60 },
            { name: 'nonRepMin', description: 'Tareas no repetitivas (min)', sampleValue: 360 },
          ],
        },
        {
          key: 'iclSide',
          symbol: 'ICL',
          label: 'Índice Check List OCRA por Extremidad',
          expression: '(FR + FF + FFz + FP + FC) * FD',
          description: 'Suma los factores de recuperación, frecuencia, fuerza, postura y complementarios multiplicados por duración.',
          unit: 'pts',
          variables: [
            { name: 'FR', description: 'Factor Recuperación (0 a 10)', sampleValue: 3 },
            { name: 'FF', description: 'Factor Frecuencia (0 a 10)', sampleValue: 1 },
            { name: 'FFz', description: 'Factor Fuerza (0 a 24)', sampleValue: 2 },
            { name: 'FP', description: 'Factor Postura máximo + estereotipia', sampleValue: 2 },
            { name: 'FC', description: 'Factores Complementarios (0 a 5)', sampleValue: 3 },
            { name: 'FD', description: 'Multiplicador de Duración Neta', sampleValue: 0.65 },
          ],
        },
        {
          key: 'estIndexCoef',
          symbol: 'Est_OCRA',
          label: 'Índice OCRA Estimado (Modo Coeficientes Cap. 6.3)',
          expression:
            '((actionsPerCycle / cycleSec) * 60) / (CF * coefRec * coefFreq * coefForce * coefPost * coefComp * coefStereo * coefDur)',
          description: 'Estimación rápida mediante tablas de coeficientes multiplicativos del Capítulo 6.3.',
          variables: [
            { name: 'actionsPerCycle', description: 'Acciones por ciclo', sampleValue: 6 },
            { name: 'cycleSec', description: 'Duración del ciclo (s)', sampleValue: 12 },
            { name: 'CF', description: 'Constante basal (30)', sampleValue: 30 },
            { name: 'coefRec', description: 'Coeficiente recuperación', sampleValue: 0.8 },
            { name: 'coefFreq', description: 'Coeficiente frecuencia', sampleValue: 0.6 },
            { name: 'coefForce', description: 'Coeficiente fuerza', sampleValue: 0.85 },
            { name: 'coefPost', description: 'Coeficiente postura', sampleValue: 0.7 },
            { name: 'coefComp', description: 'Coeficiente complementario', sampleValue: 0.9 },
            { name: 'coefStereo', description: 'Coeficiente estereotipia', sampleValue: 0.85 },
            { name: 'coefDur', description: 'Coeficiente duración', sampleValue: 0.8 },
          ],
        },
      ],
      [
        {
          key: 'CF',
          symbol: 'CF',
          label: 'Constante de Frecuencia (Modo Coeficientes)',
          value: 30,
          min: 15,
          max: 45,
          step: 1,
          unit: 'acc/min',
          description: 'Constante de referencia para el modo coeficientes del libro.',
        },
        {
          key: 'greenLimit',
          symbol: 'ICL_verde',
          label: 'Corte Zona Verde Aceptable (ICL ≤)',
          value: 7.5,
          min: 4.0,
          max: 10.0,
          step: 0.5,
          unit: 'pts',
          description: 'Hasta este valor el riesgo Check List es Aceptable.',
        },
        {
          key: 'yellowLimit',
          symbol: 'ICL_amarillo',
          label: 'Corte Zona Amarilla Dudosa (ICL ≤)',
          value: 11.0,
          min: 7.6,
          max: 14.0,
          step: 0.5,
          unit: 'pts',
          description: 'Límite superior de la franja amarilla (muy leve / incierto).',
        },
        {
          key: 'redLightLimit',
          symbol: 'ICL_rojo_leve',
          label: 'Corte Rojo Suave — Nivel Leve (ICL ≤)',
          value: 14.0,
          min: 11.1,
          max: 18.0,
          step: 0.5,
          unit: 'pts',
          description: 'Límite superior de la franja roja leve.',
        },
        {
          key: 'redMedLimit',
          symbol: 'ICL_morado',
          label: 'Corte Morado — Nivel Muy Alto (ICL >)',
          value: 22.5,
          min: 15.0,
          max: 35.0,
          step: 0.5,
          unit: 'pts',
          description: 'Por encima de este puntaje se clasifica como Nivel Alto (Morado).',
        },
      ],
    ),

    [MethodId.JSI]: build(
      MethodId.JSI,
      'JSI = IE · DE · EPM · PM · HT · NP\n% Ciclo = (Duración_esfuerzo / Duración_ciclo) · 100 | Esfuerzos/min = 60 / Duración_ciclo',
      [
        {
          key: 'pctCycle',
          symbol: '%Ciclo',
          label: 'Porcentaje de Duración del Esfuerzo en el Ciclo',
          expression: '(effortSec / cycleSec) * 100',
          description: 'Proporción porcentual del ciclo ocupada por esfuerzo distal.',
          unit: '%',
          variables: [
            { name: 'effortSec', description: 'Duración del esfuerzo (s)', sampleValue: 3 },
            { name: 'cycleSec', description: 'Duración total del ciclo (s)', sampleValue: 8 },
          ],
        },
        {
          key: 'effortsPerMin',
          symbol: 'Esf_min',
          label: 'Frecuencia de Esfuerzos por Minuto',
          expression: '60 / cycleSec',
          description: 'Cantidad de esfuerzos por minuto calculada a partir del ciclo.',
          unit: 'esf/min',
          variables: [
            { name: 'cycleSec', description: 'Duración del ciclo (s)', sampleValue: 8 },
          ],
        },
        {
          key: 'jsiScore',
          symbol: 'JSI',
          label: 'Índice de Tensión Distal (Job Strain Index)',
          expression: 'IE * DE * EPM * PM * HT * NP',
          description: 'Producto de los seis factores de valoración de mano y muñeca.',
          variables: [
            { name: 'IE', description: 'Intensidad del esfuerzo (1–5)', sampleValue: 3 },
            { name: 'DE', description: 'Duración del esfuerzo (1–5)', sampleValue: 2 },
            { name: 'EPM', description: 'Esfuerzos por minuto (1–5)', sampleValue: 2 },
            { name: 'PM', description: 'Postura mano-muñeca (1–5)', sampleValue: 4 },
            { name: 'HT', description: 'Horas de trabajo al día (1–5)', sampleValue: 4 },
            { name: 'NP', description: 'Ritmo de trabajo (1–5)', sampleValue: 4 },
          ],
        },
      ],
      [
        {
          key: 'modLimit',
          symbol: 'JSI_seguro',
          label: 'Umbral Seguro / Bajo (JSI ≤)',
          value: 3.0,
          min: 1.0,
          max: 6.0,
          step: 0.5,
          description: 'Valores menores o iguales se consideran seguros.',
        },
        {
          key: 'highLimit',
          symbol: 'JSI_alto',
          label: 'Umbral de Peligro Distal (JSI >)',
          value: 7.0,
          min: 4.0,
          max: 15.0,
          step: 0.5,
          description: 'Por encima de este valor existe alta probabilidad de TME distal.',
        },
        {
          key: 'veryHighLimit',
          symbol: 'JSI_crit',
          label: 'Umbral de Riesgo Muy Alto / Extremo (JSI >)',
          value: 30.0,
          min: 10.0,
          max: 80.0,
          step: 1.0,
          description: 'Escala crítica que exige rediseño inmediato.',
        },
      ],
    ),

    [MethodId.NAM_295]: build(
      MethodId.NAM_295,
      'Ciclo de Ocupación (%) = (Tiempo_esfuerzo / Tiempo_observación) · 100\nLímite de Acción (Fuerza Borg) = 5.56 - 0.556 · NAM\nValor Límite Umbral VLU (Fuerza Borg) = 7.80 - 0.780 · NAM',
      [
        {
          key: 'dutyPct',
          symbol: '%Ocup',
          label: 'Ciclo de Ocupación Manual (%)',
          expression: 'clamp((effortSec / periodSec) * 100, 0, 100)',
          description: 'Porcentaje del período de observación con tensión activa en mano/antebrazo.',
          unit: '%',
          variables: [
            { name: 'effortSec', description: 'Tiempo total en esfuerzo (s)', sampleValue: 62 },
            { name: 'periodSec', description: 'Período total observado (s)', sampleValue: 120 },
          ],
        },
        {
          key: 'actionLimit',
          symbol: 'LA_Borg',
          label: 'Recta del Límite de Acción (Escala Borg)',
          expression: 'max(0, 5.56 - 0.556 * NAM)',
          description: 'Fuerza pico máxima para permanecer en Zona de Seguridad dado el NAM.',
          unit: 'Borg',
          variables: [
            { name: 'NAM', description: 'Nivel de Actividad Manual (0 a 10)', sampleValue: 3 },
          ],
        },
        {
          key: 'tlvLimit',
          symbol: 'VLU_Borg',
          label: 'Recta del Valor Límite Umbral VLU (Escala Borg)',
          expression: 'max(0, 7.8 - 0.78 * NAM)',
          description: 'Fuerza pico umbral legal por encima de la cual ingresa en Zona de Peligro TME.',
          unit: 'Borg',
          variables: [
            { name: 'NAM', description: 'Nivel de Actividad Manual (0 a 10)', sampleValue: 3 },
          ],
        },
      ],
      [
        {
          key: 'namMax',
          symbol: 'NAM_max',
          label: 'Tope Superior de Escala NAM',
          value: 9,
          min: 8,
          max: 10,
          step: 1,
          description: 'Cota superior adoptada en la aproximación continua del NAM.',
        },
      ],
    ),

    [MethodId.BIPOLAR]: build(
      MethodId.BIPOLAR,
      'Sumatoria Total = Suma(Ítems 1..15) [Rango 0 a 150 puntos]\nMedia Subjetiva = Sumatoria Total / 15\nCriterio: Sumatoria > 50 o ítem ≥ 6 exige corrección urgente; ítem ≥ 8 exige suspender y adecuar.',
      [
        {
          key: 'totalScore',
          symbol: 'S_total',
          label: 'Puntuación Total Acumulada',
          expression: 'sumScores',
          description: 'Sumatoria de las 15 escalas bipolares graduadas de 0 a 10.',
          unit: 'pts',
          variables: [
            { name: 'sumScores', description: 'Suma bruta de los 15 ítems', sampleValue: 6 },
            { name: 'itemCount', description: 'Cantidad de dimensiones (15)', sampleValue: 15 },
            { name: 'maxItem', description: 'Puntaje individual más alto', sampleValue: 2 },
          ],
        },
        {
          key: 'meanScore',
          symbol: 'Media',
          label: 'Puntuación Media de Disconformidad',
          expression: 'sumScores / itemCount',
          description: 'Promedio aritmético sobre las 15 dimensiones evaluadas.',
          unit: 'pts',
          variables: [
            { name: 'sumScores', description: 'Suma de los 15 ítems', sampleValue: 6 },
            { name: 'itemCount', description: 'Número de ítems (15)', sampleValue: 15 },
          ],
        },
      ],
      [
        {
          key: 'modTotalLimit',
          symbol: 'S_leve',
          label: 'Umbral de Disconformidad Leve (Suma >)',
          value: 25,
          min: 10,
          max: 60,
          step: 1,
          unit: 'pts',
          description: 'Sumatoria a partir de la cual se clasifica como disconformidad moderada.',
        },
        {
          key: 'highTotalLimit',
          symbol: 'S_urg',
          label: 'Umbral de Corrección por Sumatoria (Suma >)',
          value: 50,
          min: 25,
          max: 100,
          step: 1,
          unit: 'pts',
          description: 'Sumatoria total que exige corrección urgente del puesto.',
        },
        {
          key: 'highItemLimit',
          symbol: 'Item_urg',
          label: 'Puntaje Individual de Alerta Urgente (≥)',
          value: 6,
          min: 4,
          max: 9,
          step: 1,
          unit: 'pts',
          description: 'Valor en cualquier ítem individual que dispara alerta urgente.',
        },
        {
          key: 'criticalItemLimit',
          symbol: 'Item_crit',
          label: 'Puntaje Individual Crítico (≥)',
          value: 8,
          min: 6,
          max: 10,
          step: 1,
          unit: 'pts',
          description: 'Valor individual que exige intervención inmediata sobre el factor.',
        },
      ],
    ),

    [MethodId.FANGER]: build(
      MethodId.FANGER,
      'ts = 0.303 · exp(-0.036 · M) + 0.028\nPMV = ts · L_termica [Escala ISO 7730 de -3 a +3]\nPPD (%) = 100 - 95 · exp(-0.03353 · PMV^4 - 0.2179 · PMV^2)',
      [
        {
          key: 'ts',
          symbol: 'ts',
          label: 'Coeficiente de Sensación Térmica (ts)',
          expression: '0.303 * exp(-0.036 * M) + 0.028',
          description: 'Factor de transferencia metabólica de la ecuación de Fanger (ISO 7730).',
          variables: [
            { name: 'M', description: 'Tasa metabólica en W/m²', sampleValue: 69.78 },
            { name: 'met', description: 'Tasa metabólica en met', sampleValue: 1.2 },
          ],
        },
        {
          key: 'pmv',
          symbol: 'PMV',
          label: 'Voto Medio Estimado (PMV)',
          expression: 'clamp(ts * thermalLoad, -3, 3)',
          description: 'Índice de sensación térmica media acotado entre -3 (mucho frío) y +3 (mucho calor).',
          variables: [
            { name: 'ts', description: 'Coeficiente ts calculado', sampleValue: 0.0526 },
            { name: 'thermalLoad', description: 'Carga térmica neta de balance L (W/m²)', sampleValue: 2.8 },
            { name: 'M', description: 'Metabolismo (W/m²)', sampleValue: 69.78 },
            { name: 'ta', description: 'Temperatura del aire (°C)', sampleValue: 24.5 },
            { name: 'tr', description: 'Temperatura radiante media (°C)', sampleValue: 26.0 },
          ],
        },
        {
          key: 'ppd',
          symbol: 'PPD',
          label: 'Porcentaje Estimado de Insatisfechos (PPD)',
          expression: 'clamp(100 - 95 * exp(-0.03353 * pow(PMV, 4) - 0.2179 * pow(PMV, 2)), 5, 100)',
          description: 'Curva simétrica ISO 7730 de personas térmicamente insatisfechas (mínimo 5%).',
          unit: '%',
          variables: [
            { name: 'PMV', description: 'Voto Medio Estimado', sampleValue: 0.15 },
          ],
        },
      ],
      [
        {
          key: 'metToWm2',
          symbol: 'k_met',
          label: 'Equivalencia Energética de 1 met',
          value: 58.15,
          min: 50,
          max: 65,
          step: 0.05,
          unit: 'W/m²',
          description: 'Factor de conversión estándar ISO de unidades met a W/m².',
        },
        {
          key: 'cloToM2KW',
          symbol: 'k_clo',
          label: 'Equivalencia Térmica de 1 clo',
          value: 0.155,
          min: 0.1,
          max: 0.2,
          step: 0.005,
          unit: 'm²K/W',
          description: 'Factor de conversión de aislamiento textil clo a m²K/W.',
        },
        {
          key: 'catALimit',
          symbol: '|PMV|_A',
          label: 'Límite Categoría A — Alta Calidad (|PMV| ≤)',
          value: 0.2,
          min: 0.1,
          max: 0.4,
          step: 0.05,
          description: 'Intervalo óptimo de confort Categoría A (PPD < 6%).',
        },
        {
          key: 'catBLimit',
          symbol: '|PMV|_B',
          label: 'Límite Categoría B — Confort Aceptable (|PMV| ≤)',
          value: 0.5,
          min: 0.25,
          max: 0.7,
          step: 0.05,
          description: 'Intervalo estándar de confort térmico aceptable (PPD < 10%).',
        },
        {
          key: 'catCLimit',
          symbol: '|PMV|_C',
          label: 'Límite Categoría C — Aceptable con Reservas (|PMV| ≤)',
          value: 0.7,
          min: 0.5,
          max: 1.2,
          step: 0.05,
          description: 'Intervalo marginal admisible (PPD < 15%).',
        },
        {
          key: 'highLimit',
          symbol: '|PMV|_alto',
          label: 'Umbral de Disconfort Severo (|PMV| >)',
          value: 1.5,
          min: 0.8,
          max: 2.5,
          step: 0.1,
          description: 'Por encima de este módulo el riesgo térmico pasa a Alto.',
        },
      ],
    ),

    [MethodId.WBGT]: build(
      MethodId.WBGT,
      'Interior / Sin carga solar: WBGT = 0.7 · Tbh + 0.3 · Tg\nExterior con carga solar: WBGT = 0.7 · Tbh + 0.2 · Tg + 0.1 · Ta\nCiclo Trabajo-Descanso: WBGT_ponderado = (WBGT_trab · t_trab + WBGT_desc · (60 - t_trab)) / 60',
      [
        {
          key: 'wbgtIndoor',
          symbol: 'WBGT_int',
          label: 'Índice WBGT Sin Carga Solar (Interior / Sombra)',
          expression: '0.7 * Tbh + 0.3 * Tg',
          description: 'Ecuación ISO 7243 / Res. 295/03 para interiores o exteriores sin radiación solar directa.',
          unit: '°C',
          variables: [
            { name: 'Tbh', description: 'Temperatura de bulbo húmedo natural (°C)', sampleValue: 26 },
            { name: 'Tg', description: 'Temperatura de globo (°C)', sampleValue: 45 },
            { name: 'Ta', description: 'Temperatura seca del aire (°C)', sampleValue: 34 },
          ],
        },
        {
          key: 'wbgtSolar',
          symbol: 'WBGT_sol',
          label: 'Índice WBGT Con Carga Solar Directa',
          expression: '0.7 * Tbh + 0.2 * Tg + 0.1 * Ta',
          description: 'Ecuación ISO 7243 / Res. 295/03 para exposición al aire libre bajo carga solar.',
          unit: '°C',
          variables: [
            { name: 'Tbh', description: 'Temperatura de bulbo húmedo natural (°C)', sampleValue: 26 },
            { name: 'Tg', description: 'Temperatura de globo (°C)', sampleValue: 45 },
            { name: 'Ta', description: 'Temperatura seca del aire (°C)', sampleValue: 34 },
          ],
        },
        {
          key: 'wbgtCycle',
          symbol: 'WBGT_ciclo',
          label: 'WBGT Ponderado Horario (Trabajo / Descanso)',
          expression: '(wbgtWork * tWork + wbgtRest * (60 - tWork)) / 60',
          description: 'Promedio ponderado en base horaria de 60 minutos entre puesto y zona de descanso.',
          unit: '°C',
          variables: [
            { name: 'wbgtWork', description: 'WBGT en el puesto de trabajo (°C)', sampleValue: 31.7 },
            { name: 'tWork', description: 'Minutos de trabajo por hora', sampleValue: 45 },
            { name: 'wbgtRest', description: 'WBGT en el sector de descanso (°C)', sampleValue: 24 },
          ],
        },
      ],
      [
        {
          key: 'criticalDeltaC',
          symbol: 'ΔT_crit',
          label: 'Exceso Térmico Crítico sobre Límite de Ciclo',
          value: 2.0,
          min: 0.5,
          max: 5.0,
          step: 0.5,
          unit: '°C',
          description: 'Grados por encima del límite de ciclo que elevan la severidad a Muy Alto.',
        },
      ],
    ),

    [MethodId.ISO_2631]: build(
      MethodId.ISO_2631,
      'Aceleración ponderada triaxial: aw = sqrt((kx · awx)^2 + (ky · awy)^2 + (kz · awz)^2)\nExposición diaria normalizada: A(8) = aw · sqrt(T / T0) [con T0 = 8 h]\nNiveles de referencia: NAI = 0.50 m/s² · NAS (Límite) = 1.15 m/s²',
      [
        {
          key: 'aw',
          symbol: 'aw',
          label: 'Aceleración Eficaz Ponderada Triaxial (aw)',
          expression: 'sqrt(pow(kx * awx, 2) + pow(ky * awy, 2) + pow(kz * awz, 2))',
          description: 'Combinación triaxial ponderada (puede cambiarse a max(kx*awx, ky*awy, kz*awz) si se desea criterio de eje dominante).',
          unit: 'm/s²',
          variables: [
            { name: 'kx', description: 'Factor ponderación eje X', sampleValue: 1.4 },
            { name: 'ky', description: 'Factor ponderación eje Y', sampleValue: 1.4 },
            { name: 'kz', description: 'Factor ponderación eje Z', sampleValue: 1.0 },
            { name: 'awx', description: 'Aceleración eficaz eje X (m/s²)', sampleValue: 0.35 },
            { name: 'awy', description: 'Aceleración eficaz eje Y (m/s²)', sampleValue: 0.25 },
            { name: 'awz', description: 'Aceleración eficaz eje Z (m/s²)', sampleValue: 0.8 },
          ],
        },
        {
          key: 'a8Partial',
          symbol: 'A(8)_i',
          label: 'Exposición Diaria Parcial Normalizada A(8)',
          expression: 'aw * sqrt(T / T0)',
          description: 'Aceleración equivalente referida a una jornada estándar T0 de 8 horas.',
          unit: 'm/s²',
          variables: [
            { name: 'aw', description: 'Aceleración ponderada del período (m/s²)', sampleValue: 0.98 },
            { name: 'T', description: 'Horas de exposición en el período', sampleValue: 5 },
            { name: 'T0', description: 'Jornada de referencia (8 h)', sampleValue: 8 },
          ],
        },
      ],
      [
        {
          key: 'kxSeated',
          symbol: 'kx_sent',
          label: 'Factor Ponderación Eje X (Sentado)',
          value: 1.4,
          min: 1.0,
          max: 2.0,
          step: 0.05,
          description: 'Multiplicador normativo eje anteroposterior en postura sentada.',
        },
        {
          key: 'kySeated',
          symbol: 'ky_sent',
          label: 'Factor Ponderación Eje Y (Sentado)',
          value: 1.4,
          min: 1.0,
          max: 2.0,
          step: 0.05,
          description: 'Multiplicador normativo eje lateral en postura sentada.',
        },
        {
          key: 'kz',
          symbol: 'kz',
          label: 'Factor Ponderación Eje Z (Vertical)',
          value: 1.0,
          min: 0.5,
          max: 2.0,
          step: 0.05,
          description: 'Multiplicador normativo eje vertical columna.',
        },
        {
          key: 'T0',
          symbol: 'T0',
          label: 'Duración de Referencia Diaria (T0)',
          value: 8.0,
          min: 4.0,
          max: 12.0,
          step: 0.5,
          unit: 'h',
          description: 'Horas de referencia para normalizar A(8).',
        },
        {
          key: 'actionLower',
          symbol: 'NAI',
          label: 'Nivel de Acción Inferior (NAI)',
          value: 0.5,
          min: 0.2,
          max: 1.0,
          step: 0.05,
          unit: 'm/s²',
          description: 'Valor diario A(8) a partir del cual se activan medidas preventivas.',
        },
        {
          key: 'actionUpper',
          symbol: 'NAS',
          label: 'Nivel de Acción Superior / Límite (NAS)',
          value: 1.15,
          min: 0.6,
          max: 2.5,
          step: 0.05,
          unit: 'm/s²',
          description: 'Valor límite de exposición diaria A(8) que no debe superarse.',
        },
      ],
    ),

    [MethodId.ISO_5349]: build(
      MethodId.ISO_5349,
      'Suma vectorial triaxial: ahv = sqrt(ahwx^2 + ahwy^2 + ahwz^2)\nExposición diaria: A(8) = ahv · sqrt(T / T0) [con T0 = 8 h]\nLatencia vascular Raynaud (10%): Dy = 31.8 · A(8)^(-1.06) años',
      [
        {
          key: 'ahv',
          symbol: 'ahv',
          label: 'Aceleración Total Triaxial Mano-Brazo (ahv)',
          expression: 'sqrt(pow(ahwx, 2) + pow(ahwy, 2) + pow(ahwz, 2))',
          description: 'Raíz de la suma de cuadrados de las aceleraciones eficaces ponderadas Wh en los tres ejes.',
          unit: 'm/s²',
          variables: [
            { name: 'ahwx', description: 'Aceleración ponderada eje X (m/s²)', sampleValue: 3.0 },
            { name: 'ahwy', description: 'Aceleración ponderada eje Y (m/s²)', sampleValue: 2.0 },
            { name: 'ahwz', description: 'Aceleración ponderada eje Z (m/s²)', sampleValue: 5.0 },
          ],
        },
        {
          key: 'a8Partial',
          symbol: 'A(8)_i',
          label: 'Exposición Diaria Parcial Mano-Brazo A(8)',
          expression: 'ahv * sqrt(T / T0)',
          description: 'Contribución energética de la herramienta normalizada a T0 = 8 horas.',
          unit: 'm/s²',
          variables: [
            { name: 'ahv', description: 'Aceleración triaxial de la herramienta (m/s²)', sampleValue: 6.16 },
            { name: 'T', description: 'Tiempo diario de accionamiento (h)', sampleValue: 3.0 },
            { name: 'T0', description: 'Jornada de referencia (8 h)', sampleValue: 8.0 },
          ],
        },
        {
          key: 'latencyYears',
          symbol: 'Dy',
          label: 'Latencia Vascular Estimada (Fenómeno de Raynaud 10%)',
          expression: '31.8 * pow(max(A8, 0.1), -1.06)',
          description: 'Años estimados hasta blanqueamiento digital en el 10% de expuestos según ISO 5349-1.',
          unit: 'años',
          variables: [
            { name: 'A8', description: 'Exposición diaria total A(8) (m/s²)', sampleValue: 3.77 },
          ],
        },
      ],
      [
        {
          key: 'T0',
          symbol: 'T0',
          label: 'Duración de Referencia Diaria (T0)',
          value: 8.0,
          min: 4.0,
          max: 12.0,
          step: 0.5,
          unit: 'h',
          description: 'Jornada estándar de normalización energética.',
        },
        {
          key: 'actionLower',
          symbol: 'NAI',
          label: 'Nivel de Acción Inferior (NAI)',
          value: 2.5,
          min: 1.0,
          max: 4.0,
          step: 0.1,
          unit: 'm/s²',
          description: 'Umbral de acción preventiva para vibraciones mano-brazo.',
        },
        {
          key: 'highThreshold',
          symbol: 'A8_alto',
          label: 'Escalón de Riesgo Alto',
          value: 4.0,
          min: 2.5,
          max: 5.0,
          step: 0.1,
          unit: 'm/s²',
          description: 'Valor intermedio donde la severidad escala de Moderado a Alto.',
        },
        {
          key: 'actionUpper',
          symbol: 'NAS',
          label: 'Nivel de Acción Superior / Límite (NAS)',
          value: 5.0,
          min: 3.0,
          max: 10.0,
          step: 0.1,
          unit: 'm/s²',
          description: 'Valor límite diario A(8) cuya superación exige intervención inmediata.',
        },
      ],
    ),
  };
}

// ============================================================================
// IN-MEMORY CACHE + LOCALSTORAGE PERSISTENCE + SUBSCRIPTION
// ============================================================================
let cachedProfiles: Record<MethodId, MethodFormulaProfile> | null = null;
const listeners = new Set<() => void>();

function applyOverridesToDefaults(
  defaults: Record<MethodId, MethodFormulaProfile>,
  overrides: SavedFormulaOverrides | null,
): Record<MethodId, MethodFormulaProfile> {
  if (!overrides || !overrides.methods) return defaults;
  const next = { ...defaults };

  (Object.keys(defaults) as MethodId[]).forEach((mId) => {
    const ov = overrides.methods[mId];
    if (!ov) return;
    const base = defaults[mId];
    next[mId] = {
      ...base,
      formulaSummary:
        typeof ov.formulaSummary === 'string' && ov.formulaSummary.trim().length > 0
          ? ov.formulaSummary
          : base.defaultFormulaSummary,
      expressions: base.expressions.map((expr) => ({
        ...expr,
        expression:
          ov.expressions && typeof ov.expressions[expr.key] === 'string' && ov.expressions[expr.key].trim().length > 0
            ? ov.expressions[expr.key]
            : expr.defaultExpression,
      })),
      parameters: base.parameters.map((param) => ({
        ...param,
        value:
          ov.parameters && typeof ov.parameters[param.key] === 'number' && Number.isFinite(ov.parameters[param.key])
            ? ov.parameters[param.key]
            : param.defaultValue,
      })),
    };
  });

  return next;
}

function serializeOverrides(profiles: Record<MethodId, MethodFormulaProfile>): SavedFormulaOverrides {
  const out: SavedFormulaOverrides = { version: 1, methods: {} };
  (Object.keys(profiles) as MethodId[]).forEach((mId) => {
    const prof = profiles[mId];
    const exprOverrides: Record<string, string> = {};
    const paramOverrides: Record<string, number> = {};
    let hasDiff = false;

    if (prof.formulaSummary.trim() !== prof.defaultFormulaSummary.trim()) {
      hasDiff = true;
    }
    for (const e of prof.expressions) {
      if (e.expression.trim() !== e.defaultExpression.trim()) {
        exprOverrides[e.key] = e.expression;
        hasDiff = true;
      }
    }
    for (const p of prof.parameters) {
      if (Math.abs(p.value - p.defaultValue) > 1e-9) {
        paramOverrides[p.key] = p.value;
        hasDiff = true;
      }
    }

    if (hasDiff) {
      out.methods[mId] = {
        ...(prof.formulaSummary.trim() !== prof.defaultFormulaSummary.trim()
          ? { formulaSummary: prof.formulaSummary }
          : {}),
        ...(Object.keys(exprOverrides).length > 0 ? { expressions: exprOverrides } : {}),
        ...(Object.keys(paramOverrides).length > 0 ? { parameters: paramOverrides } : {}),
      };
    }
  });
  return out;
}

function persistAndNotify(profiles: Record<MethodId, MethodFormulaProfile>): void {
  cachedProfiles = profiles;
  try {
    const serialized = serializeOverrides(profiles);
    if (Object.keys(serialized.methods).length === 0) {
      localStorage.removeItem(FORMULA_STORAGE_KEY);
    } else {
      localStorage.setItem(FORMULA_STORAGE_KEY, JSON.stringify(serialized));
    }
  } catch {
    // Ignore storage errors
  }
  listeners.forEach((fn) => fn());
}

export function getAllFormulaProfiles(): Record<MethodId, MethodFormulaProfile> {
  if (cachedProfiles) return cachedProfiles;
  const defaults = createDefaultFormulaProfiles();
  try {
    const raw = localStorage.getItem(FORMULA_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SavedFormulaOverrides;
      cachedProfiles = applyOverridesToDefaults(defaults, parsed);
      return cachedProfiles;
    }
  } catch {
    // Fallback to defaults
  }
  cachedProfiles = defaults;
  return cachedProfiles;
}

export function getMethodFormulaProfile(methodId: MethodId): MethodFormulaProfile {
  return getAllFormulaProfiles()[methodId];
}

export function getMethodParam(methodId: MethodId, paramKey: string, fallback: number): number {
  const prof = getMethodFormulaProfile(methodId);
  const found = prof?.parameters.find((p) => p.key === paramKey);
  return found && Number.isFinite(found.value) ? found.value : fallback;
}

export function evalMethodExpr(
  methodId: MethodId,
  exprKey: string,
  vars: Record<string, number>,
  fallback: number,
): number {
  const prof = getMethodFormulaProfile(methodId);
  const found = prof?.expressions.find((e) => e.key === exprKey);
  if (!found) return fallback;
  // Also expose all parameters of the method inside expression variables automatically
  const mergedVars: Record<string, number> = {};
  for (const p of prof.parameters) {
    mergedVars[p.key] = p.value;
    mergedVars[p.symbol] = p.value;
  }
  Object.assign(mergedVars, vars);
  return evaluateFormulaExpression(found.expression, mergedVars, fallback);
}

export function isMethodFormulaModified(methodId: MethodId): boolean {
  const prof = getMethodFormulaProfile(methodId);
  if (!prof) return false;
  if (prof.formulaSummary.trim() !== prof.defaultFormulaSummary.trim()) return true;
  if (prof.expressions.some((e) => e.expression.trim() !== e.defaultExpression.trim())) return true;
  if (prof.parameters.some((p) => Math.abs(p.value - p.defaultValue) > 1e-9)) return true;
  return false;
}

export function countModifiedFormulaMethods(): number {
  const all = getAllFormulaProfiles();
  return (Object.keys(all) as MethodId[]).filter((mId) => isMethodFormulaModified(mId)).length;
}

export function updateMethodExpression(methodId: MethodId, exprKey: string, nextExpression: string): void {
  const all = getAllFormulaProfiles();
  const cur = all[methodId];
  const updated: Record<MethodId, MethodFormulaProfile> = {
    ...all,
    [methodId]: {
      ...cur,
      expressions: cur.expressions.map((e) => (e.key === exprKey ? { ...e, expression: nextExpression } : e)),
    },
  };
  persistAndNotify(updated);
}

export function updateMethodParameter(methodId: MethodId, paramKey: string, nextValue: number): void {
  if (!Number.isFinite(nextValue)) return;
  const all = getAllFormulaProfiles();
  const cur = all[methodId];
  const updated: Record<MethodId, MethodFormulaProfile> = {
    ...all,
    [methodId]: {
      ...cur,
      parameters: cur.parameters.map((p) => (p.key === paramKey ? { ...p, value: nextValue } : p)),
    },
  };
  persistAndNotify(updated);
}

export function updateMethodFormulaSummary(methodId: MethodId, nextSummary: string): void {
  const all = getAllFormulaProfiles();
  const cur = all[methodId];
  const updated: Record<MethodId, MethodFormulaProfile> = {
    ...all,
    [methodId]: {
      ...cur,
      formulaSummary: nextSummary,
    },
  };
  persistAndNotify(updated);
}

export function resetMethodFormulaProfile(methodId: MethodId): void {
  const defaults = createDefaultFormulaProfiles();
  const all = getAllFormulaProfiles();
  const updated: Record<MethodId, MethodFormulaProfile> = {
    ...all,
    [methodId]: defaults[methodId],
  };
  persistAndNotify(updated);
}

export function resetAllFormulaProfiles(): void {
  const defaults = createDefaultFormulaProfiles();
  persistAndNotify(defaults);
}

export function exportFormulaOverridesJson(): string {
  const all = getAllFormulaProfiles();
  return JSON.stringify(serializeOverrides(all), null, 2);
}

export function importFormulaOverridesJson(jsonText: string): { ok: boolean; message: string } {
  try {
    const parsed = JSON.parse(jsonText) as SavedFormulaOverrides;
    if (!parsed || typeof parsed !== 'object' || !parsed.methods) {
      return { ok: false, message: 'El archivo JSON no contiene un bloque válido de fórmulas de métodos.' };
    }
    const defaults = createDefaultFormulaProfiles();
    const merged = applyOverridesToDefaults(defaults, parsed);
    persistAndNotify(merged);
    return { ok: true, message: 'Configuración de fórmulas importada y aplicada correctamente.' };
  } catch {
    return { ok: false, message: 'No se pudo leer el archivo JSON de fórmulas.' };
  }
}

export function subscribeFormulaChanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

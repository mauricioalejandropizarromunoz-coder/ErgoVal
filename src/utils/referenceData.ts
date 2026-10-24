import { MethodId } from '../types/ergonomics';

export interface MethodTableRef {
  tableNumber: string;
  title: string;
  description: string;
  keyValues?: string;
}

export interface VariableEffectRef {
  variable: string;
  name: string;
  meaning: string;
  formulaOrValues: string;
  impactOnResult: string;
}

export interface ActionLevelRef {
  level: string;
  scoreRange: string;
  risk: string;
  action: string;
  deadline: string;
}

export interface MethodReferenceDoc {
  id: MethodId;
  shortName: string;
  fullName: string;
  chapter: string;
  chapterTitle: string;
  authorReference: string;
  normativeContext: string;
  formulaSummary: string;
  conceptualBasis: string;
  tables: MethodTableRef[];
  variables: VariableEffectRef[];
  actionLevels: ActionLevelRef[];
  workedExample: {
    title: string;
    description: string;
    inputs: string;
    calculations: string;
    finalScore: string;
    conclusion: string;
  };
  authorNotes: string;
}

export const BOOK_METADATA = {
  title: 'Ergonomía de Puestos de Trabajo — Métodos de Evaluación y Protocolo de Intervención',
  author: 'Mauricio Alejandro Pizarro Muñoz',
  authorCredentials:
    'Licenciado en Higiene y Seguridad en el Trabajo · Matrícula C.P.I.Q LHST 145 · Registro de Ergonomía RE 001',
  copyright: '© Mauricio Alejandro Pizarro Muñoz. Todos los derechos reservados.',
  legalDisclaimer:
    'Herramienta técnica de cálculo ergonómico destinada exclusivamente a profesionales capacitados con conocimiento de los métodos. El software y los informes generados constituyen un soporte técnico cuantitativo y no sustituyen el análisis crítico, la verificación en campo ni la validación obligatoria de resultados por parte del propio profesional actuante.',
};

export const METHOD_REFERENCES: Record<MethodId, MethodReferenceDoc> = {
  [MethodId.RULA]: {
    id: MethodId.RULA,
    shortName: 'RULA',
    fullName: 'Método RULA (Rapid Upper Limb Assessment — McAtamney y Corlett)',
    chapter: 'Capítulo 4 · Apartado 4.2',
    chapterTitle: 'Evaluación de la Carga Postural: Miembros Superiores',
    authorReference: 'Libro-Proyecto Mauricio Pizarro · Capítulo 4.2.1 a 4.2.8',
    normativeContext: 'Norma ISO 11226 e IRAM 3753. Específico para cuello, tronco y extremidades superiores.',
    formulaSummary:
      'Puntuación A = Tabla A(Brazo, Antebrazo, Muñeca, Giro) + Uso Muscular A + Carga A -> Puntuación C.\nPuntuación B = Tabla B(Cuello, Tronco, Piernas) + Uso Muscular B + Carga B -> Puntuación D.\nPuntuación Final = Tabla C(Puntuación C, Puntuación D). Rango final de 1 a 7.',
    conceptualBasis:
      'Evalúa el esfuerzo postural enfocado en el miembro superior, cuello y tronco. Cada postura recibe una penalización creciente según se aleje de la posición anatómica neutra y se corrigen con factores de mantenimiento estático/frecuencial y fuerzas aplicadas.',
    tables: [
      {
        tableNumber: 'Tabla 4.14',
        title: 'Tabla A — Puntuación del Grupo A',
        description: 'Cruza Brazo (1 a 6), Antebrazo (1 a 3), Muñeca (1 a 4) y Giro de Muñeca (1 a 2).',
        keyValues: 'Valores resultantes de 1 a 9.',
      },
      {
        tableNumber: 'Tabla 4.15',
        title: 'Tabla B — Puntuación del Grupo B',
        description: 'Cruza Cuello (1 a 6) con columnas de Tronco (1 a 6) x Piernas (1 a 2).',
        keyValues: 'Valores resultantes de 1 a 9.',
      },
      {
        tableNumber: 'Tabla 4.16',
        title: 'Puntuación por Uso Muscular',
        description: 'Añade +1 punto si la postura es principalmente estática (> 1 min) o altamente repetitiva (> 4 veces/min).',
      },
      {
        tableNumber: 'Tabla 4.17',
        title: 'Puntuación por Carga o Fuerza',
        description: '0 pt (< 2 kg intermitente), +1 pt (2–10 kg intermitente), +2 pt (2–10 kg estático o > 10 kg intermitente), +3 pt (> 10 kg estático/repetitivo o golpes).',
      },
      {
        tableNumber: 'Tabla 4.18 / 4.19',
        title: 'Tabla C — Puntuación Final RULA',
        description: 'Matriz bidimensional que combina Puntuación C (1 a 8+) con Puntuación D (1 a 7+).',
        keyValues: 'Escala final de 1 a 7 puntos.',
      },
    ],
    variables: [
      {
        variable: 'upperArmPos (Brazo)',
        name: 'Ángulo de elevación del brazo',
        meaning: 'Flexión o extensión sagital del húmero respecto al eje del tronco.',
        formulaOrValues: '1 (-20° a 20°), 2 (20°–45° ó <-20°), 3 (45°–90°), 4 (> 90°)',
        impactOnResult: 'Un incremento eleva directamente la fila en Tabla A; flexiones > 90° disparan la puntuación del Grupo A.',
      },
      {
        variable: 'shoulderRaised / armAbducted',
        name: 'Modificadores de hombro y brazo',
        meaning: 'Hombro elevado (+1 pt), abducción del brazo (+1 pt), brazo apoyado (-1 pt).',
        formulaOrValues: 'Suma algebraica sobre upperArmPos (mín. 1, máx. 6)',
        impactOnResult: 'Eleva el índice de fila en Tabla A, penalizando posturas con pérdida de gravedad o brazos abiertos.',
      },
      {
        variable: 'lowerArmPos (Antebrazo)',
        name: 'Flexión de codo',
        meaning: 'Ángulo entre antebrazo y brazo.',
        formulaOrValues: '1 (60° a 100°), 2 (< 60° ó > 100°)',
        impactOnResult: 'Mantiene la puntuación en rango óptimo en 60°–100°. Fuera de este rango incrementa en +1 la columna de Tabla A.',
      },
      {
        variable: 'wristPos / wristDeviated',
        name: 'Ángulo y desviación de muñeca',
        meaning: 'Flexo-extensión y desviación radial o cubital.',
        formulaOrValues: '1 (0°), 2 (0°–15°), 3 (> 15°); desviación suma +1 pt',
        impactOnResult: 'Aumenta significativamente el subtotal del Grupo A; las desviaciones con flexión > 15° alcanzan columna máxima (4).',
      },
      {
        variable: 'neckPos (Cuello)',
        name: 'Flexo-extensión cervical',
        meaning: 'Inclinación de la cabeza respecto al tronco vertical.',
        formulaOrValues: '1 (0°–10°), 2 (10°–20°), 3 (> 20° flexión), 4 (extensión > 0°)',
        impactOnResult: 'La extensión o flexión > 20° sitúa la fila de Tabla B en valores de 3 a 8, acelerando el paso a Niveles de Acción 3 y 4.',
      },
      {
        variable: 'trunkPos (Tronco)',
        name: 'Inclinación vertebral',
        meaning: 'Ángulo sagital del tronco respecto a la pelvis.',
        formulaOrValues: '1 (sentado >90° apoyado), 2 (0°–20°), 3 (20°–60°), 4 (> 60°)',
        impactOnResult: 'Flexiones > 20° multiplican la carga en discos L5-S1; combinada con torsión (+1) o lateralización (+1) duplica el valor en Tabla B.',
      },
      {
        variable: 'muscleUse / forceLoad',
        name: 'Factores complementarios',
        meaning: 'Mantenimiento estático y fuerza ejercida por extremidad y tronco.',
        formulaOrValues: 'Uso: 0 o +1 pt; Fuerza: 0 a +3 pt',
        impactOnResult: 'Pasa directamente sumado a las puntuaciones intermedias C y D, empujando la casilla en Tabla C hacia el límite crítico de 7 puntos.',
      },
    ],
    actionLevels: [
      { level: 'Nivel 1', scoreRange: '1 a 2', risk: 'Aceptable', action: 'No requiere modificaciones si no se mantiene por largos periodos.', deadline: 'Sin plazo específico' },
      { level: 'Nivel 2', scoreRange: '3 a 4', risk: 'Bajo a Moderado', action: 'Pueden requerirse cambios en la tarea; profundizar investigación.', deadline: 'Medio plazo' },
      { level: 'Nivel 3', scoreRange: '5 a 6', risk: 'Alto', action: 'Se requiere el rediseño de la tarea en breve plazo.', deadline: 'Corto plazo' },
      { level: 'Nivel 4', scoreRange: '7', risk: 'Muy Alto / Crítico', action: 'Se requieren cambios urgentes en el diseño del puesto.', deadline: 'Inmediato' },
    ],
    workedExample: {
      title: 'Ejemplo 4.2.7 — Ensamblaje Manual de Componentes Electrónicos',
      description: 'Operario sentado en banco fijo sin apoyabrazos realizando soldadura de precisión en tarjetas electrónicas.',
      inputs: 'Brazo flexionado 35° (2 pt) abducido (+1 pt) = 3; Antebrazo 110° (2 pt); Muñeca flexionada 20° (3 pt) con desviación cubital (+1 pt) = 4; Giro extremo (2 pt); Uso muscular estático (+1 pt); Cuello flexionado 28° (3 pt); Tronco flexionado 25° (3 pt); Piernas apoyadas (1 pt).',
      calculations: 'Grupo A: Tabla A[3][2][(4-1)*2+2] = 5; +1 uso muscular = Score C = 6.\nGrupo B: Cuello 3, Tronco 3, Piernas 1 -> Tabla B = 4; +1 uso muscular = Score D = 5.\nTabla C[6-1][5-1] = 6.',
      finalScore: 'Puntuación Final = 6 (Nivel de Actuación 3 · Riesgo Alto)',
      conclusion: 'Exige rediseño a corto plazo: elevar plano con inclinación de 15°, proveer apoyabrazos regulables y lente con iluminación cenital para corregir postura cervical.',
    },
    authorNotes:
      'En auditorías de campo, evaluar siempre ambos miembros superiores si la tarea no es estrictamente unilateral. Un error habitual es subestimar el factor estático: si una postura se mantiene más de 1 minuto continuo, la suma de +1 es obligatoria.',
  },

  [MethodId.REBA]: {
    id: MethodId.REBA,
    shortName: 'REBA',
    fullName: 'Método REBA (Rapid Entire Body Assessment — Hignett y McAtamney)',
    chapter: 'Capítulo 4 · Apartado 4.3',
    chapterTitle: 'Evaluación de Posturas de Cuerpo Entero',
    authorReference: 'Libro-Proyecto Mauricio Pizarro · Capítulo 4.3.1 a 4.3.8',
    normativeContext: 'Norma ISO 11226. Especialmente adecuado para tareas dinámicas, asistenciales, carga y posturas inestables.',
    formulaSummary:
      'Puntuación A = Tabla A(Tronco, Cuello, Piernas) + Carga/Fuerza.\nPuntuación B = Tabla B(Brazo, Antebrazo, Muñeca) + Agarre.\nPuntuación C = Tabla C(Puntuación A, Puntuación B) + Actividad Muscular (estática +1, repetitiva +1, inestable +1). Rango final de 1 a 15.',
    conceptualBasis:
      'Analiza la postura corporal completa integrando miembros inferiores, calidad del agarre de la carga y tres modos independientes de actividad muscular (estática, repetitiva y cambios bruscos).',
    tables: [
      {
        tableNumber: 'Tabla 4.20',
        title: 'Tabla A — Tronco, Cuello y Piernas',
        description: 'Matriz 3D que cruza Tronco (1 a 5), Cuello (1 a 3) y Piernas (1 a 4).',
        keyValues: 'Puntajes de 1 a 9.',
      },
      {
        tableNumber: 'Tabla 4.28',
        title: 'Carga o Fuerza (Grupo A)',
        description: '0 pt (< 5 kg), 1 pt (5–10 kg), 2 pt (> 10 kg); +1 si es fuerza brusca.',
      },
      {
        tableNumber: 'Tabla 4.34',
        title: 'Tabla B — Brazo, Antebrazo y Muñeca',
        description: 'Cruza Brazo (1 a 6), Antebrazo (1 a 2) y Muñeca (1 a 3).',
        keyValues: 'Puntajes de 1 a 9.',
      },
      {
        tableNumber: 'Tabla 4.35',
        title: 'Acoplamiento y Agarre (Grupo B)',
        description: '0 pt (Bueno: asas de potencia), 1 pt (Regular: aceptable), 2 pt (Malo: sin asas), 3 pt (Inaceptable).',
      },
      {
        tableNumber: 'Tabla 4.36',
        title: 'Tabla C — Puntuación Combinada REBA',
        description: 'Matriz 12x12 combinando Puntuación A y B. Rango base de 1 a 12.',
      },
      {
        tableNumber: 'Tabla 4.37',
        title: 'Puntuación por Actividad Muscular',
        description: 'Suma +1 si hay mantenimiento estático (>1 min), +1 si es repetitivo (>4/min), +1 si hay cambios bruscos o inestabilidad.',
      },
    ],
    variables: [
      {
        variable: 'trunkPos / trunkTwistedOrSide',
        name: 'Tronco y torsión',
        meaning: 'Inclinación y flexión lateral o rotación axial del tronco.',
        formulaOrValues: '1 (erguido), 2 (0°–20°), 3 (20°–60° ó >20° ext.), 4 (>60°); torsión/lado suma +1',
        impactOnResult: 'Flexiones > 20° combinadas con torsión elevan la Puntuación A de forma crítica en Tabla A.',
      },
      {
        variable: 'legsBase / legsKneeFlexion',
        name: 'Base y flexión de rodillas',
        meaning: 'Apoyo bilateral simétrico vs asimétrico y grado de flexión de rodilla.',
        formulaOrValues: 'Base: 1 (apoyo bilateral), 2 (unipodal/inestable); Rodillas: 0 (<30°), +1 (30°–60°), +2 (>60° / cuclillas)',
        impactOnResult: 'Estar en cuclillas suma +2 a piernas, elevando el valor de entrada a Tabla A.',
      },
      {
        variable: 'coupling (Agarre)',
        name: 'Calidad de acoplamiento de la carga',
        meaning: 'Facilidad de sujeción manual de piezas u objetos.',
        formulaOrValues: '0 (bueno), 1 (regular), 2 (malo), 3 (inaceptable/peligroso)',
        impactOnResult: 'Suma hasta +3 directamente sobre el Score B, castigando severamente el trabajo con cajas sin asas.',
      },
      {
        variable: 'activity (Actividad muscular)',
        name: 'Condiciones dinámicas del ciclo',
        meaning: 'Suma acumulativa de hasta +3 puntos en la puntuación final C.',
        formulaOrValues: '+1 estática, +1 repetitiva, +1 inestable/brusca',
        impactOnResult: 'Es el factor decisivo que puede convertir una puntuación moderada (6–7) en riesgo alto o muy alto (8–11+).',
      },
    ],
    actionLevels: [
      { level: 'Nivel 0', scoreRange: '1', risk: 'Inapreciable', action: 'No es necesaria acción correctiva.', deadline: 'Sin plazo específico' },
      { level: 'Nivel 1', scoreRange: '2 a 3', risk: 'Bajo', action: 'Puede ser necesario el cambio.', deadline: 'Medio plazo' },
      { level: 'Nivel 2', scoreRange: '4 a 7', risk: 'Medio', action: 'Es necesaria la intervención y rediseño.', deadline: 'Corto plazo' },
      { level: 'Nivel 3', scoreRange: '8 a 10', risk: 'Alto', action: 'Es necesaria la intervención pronto.', deadline: 'Pronto / Prioritario' },
      { level: 'Nivel 4', scoreRange: '11 a 15', risk: 'Muy Alto / Crítico', action: 'Actuación inmediata indispensable.', deadline: 'Inmediato' },
    ],
    workedExample: {
      title: 'Ejemplo de Aplicación en Construcción / Zanja (Informe POSE S.A.)',
      description: 'Zanjero perfilando fondo de zanja a 1,10 m arrojando tierra con pala hacia el borde superior.',
      inputs: 'Tronco 3 (20°–60°) con torsión (+1) = 4; Cuello 2 (>20°); Piernas 2 (base inestable) con flexión rodillas 30°–60° (+1) = 3; Carga 5–10 kg (1 pt); Brazo 3 (45°–90°) abducido (+1) = 4; Antebrazo 2 (<60°); Muñeca 2 (>15°) con torsión (+1) = 3; Agarre regular (+1); Actividad repetitiva (+1) e inestable (+1) = +2.',
      calculations: 'Grupo A: Tabla A[4][2][3] = 7; +1 carga = 8.\nGrupo B: Tabla B[4][2][3] = 6; +1 agarre = 7.\nTabla C[8][7] = 10; +2 actividad = 12.',
      finalScore: 'Puntuación Final = 12 (Nivel de Actuación 4 · Muy Alto)',
      conclusion: 'Exige intervención inmediata: sustituir la excavación manual por zanjadora mecánica o entibar y escalonar la profundidad con descansos.',
    },
    authorNotes:
      'REBA es el método más versátil para evaluar mantenimiento, construcción y enfermería porque pondera la inestabilidad de piernas y la aceleración brusca de fuerzas.',
  },

  [MethodId.OWAS]: {
    id: MethodId.OWAS,
    shortName: 'OWAS',
    fullName: 'Método OWAS (Ovako Working Posture Analysing System — Karhu et al.)',
    chapter: 'Capítulo 4 · Apartado 4.4',
    chapterTitle: 'Sistema de Análisis de Posturas de Trabajo',
    authorReference: 'Libro-Proyecto Mauricio Pizarro · Capítulo 4.4.1 a 4.4.9',
    normativeContext: 'Norma UNE-EN 1005-4. Diseñado para registrar variabilidad postural mediante muestreo representativo.',
    formulaSummary:
      'Código Postural = [Espalda 1..4] [Brazos 1..3] [Piernas 1..7] [Carga 1..3].\nCada código se asigna a una Categoría de Acción (1 a 4) según Tabla 4.42.\nLa evaluación global pondera la frecuencia porcentual de cada código y postura individual (Tabla 4.43).',
    conceptualBasis:
      'Identifica 252 combinaciones posturales instantáneas. A diferencia de RULA o REBA que analizan una postura estática singular, OWAS permite un análisis temporal muestreado del ciclo completo.',
    tables: [
      {
        tableNumber: 'Tabla 4.38',
        title: 'Espalda (1° Dígito)',
        description: '1 (recta), 2 (inclinada ≥20°), 3 (girada o con inclinación lateral), 4 (inclinada con giro simultáneo).',
      },
      {
        tableNumber: 'Tabla 4.39',
        title: 'Brazos (2° Dígito)',
        description: '1 (ambos bajo hombros), 2 (un brazo al nivel o sobre hombros), 3 (ambos brazos sobre hombros).',
      },
      {
        tableNumber: 'Tabla 4.40',
        title: 'Piernas (3° Dígito)',
        description: '1 (sentado), 2 (de pie 2 piernas rectas), 3 (de pie 1 recta), 4 (2 rodillas flexionadas), 5 (1 rodilla flex.), 6 (arrodillado), 7 (caminando).',
      },
      {
        tableNumber: 'Tabla 4.41',
        title: 'Carga / Fuerza (4° Dígito)',
        description: '1 (≤ 10 kg), 2 (> 10 a ≤ 20 kg), 3 (> 20 kg).',
      },
      {
        tableNumber: 'Tabla 4.42',
        title: 'Categorías de Acción por Postura',
        description: 'Determina si la combinación es Cat. 1 (normal), Cat. 2 (posible daño), Cat. 3 (dañino a corto plazo) o Cat. 4 (sumamente dañino).',
      },
      {
        tableNumber: 'Tabla 4.43',
        title: 'Categorías de Acción por Frecuencia Relativa',
        description: 'Pondera el porcentaje de permanencia en cada una de las posiciones de espalda, brazos y piernas a lo largo del tiempo de observación.',
      },
    ],
    variables: [
      {
        variable: 'back (Espalda)',
        name: 'Postura de la columna vertebral',
        meaning: 'Alineación vertebral en el instante de muestreo.',
        formulaOrValues: '1 (recta), 2 (flexionada), 3 (girada), 4 (flexionada + girada)',
        impactOnResult: 'El código 4 (flexión + torsión) genera casi siempre Categoría 3 o 4 cuando se combina con cargas > 10 kg.',
      },
      {
        variable: 'arms (Brazos)',
        name: 'Altura de los brazos',
        meaning: 'Elevación de brazos por encima de la línea clavicular.',
        formulaOrValues: '1 (bajos), 2 (uno elevado), 3 (ambos elevados)',
        impactOnResult: 'Brazos elevados aumentan la exigencia en hombros y trapecios, pasando a Cat. 2 o 3 aún con espalda recta.',
      },
      {
        variable: 'legs (Piernas)',
        name: 'Sustentación de miembros inferiores',
        meaning: 'Distribución del peso corporal y ángulo de rodillas.',
        formulaOrValues: '1 a 7 (sentado, rectas, cuclillas, arrodillado, marcha)',
        impactOnResult: 'Códigos 4 (cuclillas) y 6 (arrodillado) concentran tensión patelar y compresión meniscal grave.',
      },
      {
        variable: 'load (Carga)',
        name: 'Masa manipulada o fuerza de oposición',
        meaning: 'Magnitud de la carga en kg durante la observación.',
        formulaOrValues: '1 (≤10 kg), 2 (10–20 kg), 3 (>20 kg)',
        impactOnResult: 'Eleva el multiplicador de gravedad en la matriz de la Tabla 4.42.',
      },
    ],
    actionLevels: [
      { level: 'Categoría 1', scoreRange: 'Cat. 1', risk: 'Normal', action: 'Postura normal sin efectos dañinos en el sistema osteomuscular.', deadline: 'Sin plazo específico' },
      { level: 'Categoría 2', scoreRange: 'Cat. 2', risk: 'Ligeramente dañino', action: 'Pueden requerirse modificaciones en el diseño en futuras revisiones.', deadline: 'Medio plazo' },
      { level: 'Categoría 3', scoreRange: 'Cat. 3', risk: 'Dañino', action: 'Se requieren medidas correctivas en breve.', deadline: 'Corto plazo' },
      { level: 'Categoría 4', scoreRange: 'Cat. 4', risk: 'Sumamente dañino', action: 'Efectos muy dañinos sobre el aparato locomotor; corrección inmediata.', deadline: 'Inmediato' },
    ],
    workedExample: {
      title: 'Ejemplo 4.4.8 — Carga y Descarga en Centro Logístico (100 Observaciones)',
      description: 'Muestreo aleatorio sistemático durante 2 horas de ciclo continuo en expedición de paquetería pesada.',
      inputs: '30 observaciones en código 2243 (espalda flexionada, brazos bajos, cuclillas, carga >20 kg = Cat. 4);\n35 observaciones en código 3123 (espalda con giro, de pie, carga >20 kg = Cat. 3);\n25 observaciones en código 1171 (marcha sin carga = Cat. 1);\n10 observaciones en código 1121 (espera de pie = Cat. 1).',
      calculations: 'Total 100 obs. Cat. 1: 35 %; Cat. 2: 0 %; Cat. 3: 35 %; Cat. 4: 30 %.',
      finalScore: 'Categoría Crítica Global = 4 (30 % del tiempo en Cat. 4)',
      conclusion: 'El puesto resulta inadmisible. Requiere elevación de tarimas a 75 cm y manipulador neumático por vacío de forma prioritaria.',
    },
    authorNotes:
      'OWAS es el método por excelencia para fundamentar inversiones de ingeniería mecánica cuando hay alta variabilidad gestual durante la jornada.',
  },

  [MethodId.NIOSH]: {
    id: MethodId.NIOSH,
    shortName: 'NIOSH',
    fullName: 'Ecuación NIOSH Revisada (1993) — Levantamiento Manual de Cargas',
    chapter: 'Capítulo 5 · Apartados 5.3 a 5.5',
    chapterTitle: 'Manipulación Manual de Cargas y Límites Biomecánicos',
    authorReference: 'Libro-Proyecto Mauricio Pizarro · Capítulo 5.3 a 5.5.3',
    normativeContext: 'Norma ISO 11228-1, UNE-EN 1005-2 y Resolución MTESS 295/03 (Anexo I).',
    formulaSummary:
      'RWL = LC · HM · VM · DM · AM · FM · CM\nLC = 23 kg\nHM = 25 / H (con 25 ≤ H ≤ 63 cm)\nVM = 1 - 0.003 · |V - 75| (con V ≤ 175 cm)\nDM = 0.82 + 4.5 / D (con 25 ≤ D ≤ 175 cm)\nAM = 1 - 0.0032 · A (con 0° ≤ A ≤ 135°)\nFM = Factor de Frecuencia (Tabla 5.1 según duración y F rec.)\nCM = Factor de Agarre (Tabla 5.2)\nIL = Peso Real (L) / RWL.',
    conceptualBasis:
      'El modelo define el Límite de Peso Recomendado (RWL) que el 90 % de los trabajadores (el 99 % de los varones y el 75 % de las mujeres) puede levantar durante una jornada de 8 horas sin desarrollar dolor lumbar o lesiones por compresión discoradicular en L5-S1 (límite de compresión de 3,4 kN).',
    tables: [
      {
        tableNumber: 'Tabla 5.1',
        title: 'Multiplicador de Frecuencia (FM)',
        description: 'Depende de la frecuencia de levantamientos/min, duración acumulada diaria (≤1h, 1-2h, 2-8h) y altura V (<75 cm o ≥75 cm).',
        keyValues: 'Valores entre 0.00 y 1.00.',
      },
      {
        tableNumber: 'Tabla 5.2',
        title: 'Multiplicador de Acoplamiento y Agarre (CM)',
        description: 'Bueno (asas de diseño óptimo, CM=1.00); Regular (asas no ideales o caja deformable, CM=0.95/1.00); Malo (sin asas o bordes cortantes, CM=0.90).',
      },
    ],
    variables: [
      {
        variable: 'H (Distancia Horizontal)',
        name: 'Alcance horizontal desde punto medio de tobillos',
        meaning: 'Distancia en cm desde los tobillos al centro de gravedad de la carga.',
        formulaOrValues: 'HM = 25 / H (rango 25 a 63 cm)',
        impactOnResult: 'Es el factor más penalizador: duplicar H de 25 a 50 cm reduce la capacidad de carga exactamente a la mitad (HM pasa de 1,00 a 0,50).',
      },
      {
        variable: 'V (Altura Vertical)',
        name: 'Altura del origen de las manos respecto al suelo',
        meaning: 'Punto vertical al inicio del levantamiento.',
        formulaOrValues: 'VM = 1 - 0.003 · |V - 75|',
        impactOnResult: 'El óptimo es 75 cm (VM=1,00). Levantar desde el suelo (V=0) penaliza un 22,5 % la capacidad (VM=0,775).',
      },
      {
        variable: 'D (Desplazamiento Vertical)',
        name: 'Distancia neta de izaje |V_dest - V_orig|',
        meaning: 'Recorrido en cm que se traslada verticalmente la carga.',
        formulaOrValues: 'DM = 0.82 + 4.5 / D (si D < 25 cm, DM=1,00)',
        impactOnResult: 'Desplazamientos muy largos reducen el factor DM hasta un mínimo de 0,85.',
      },
      {
        variable: 'A (Ángulo de Asimetría)',
        name: 'Torsión del tronco respecto al plano sagital',
        meaning: 'Desviación en grados respecto a la línea neutra media de los pies.',
        formulaOrValues: 'AM = 1 - 0.0032 · A (si A > 135°, AM=0)',
        impactOnResult: 'Un giro de 45° reduce la capacidad en un 14,4 % (AM=0,856); a 90° reduce casi un 30 %.',
      },
      {
        variable: 'F (Frecuencia) y Duración',
        name: 'Cadencia de levantamientos por minuto',
        meaning: 'Tasa de repetición y tiempo diario continuo.',
        formulaOrValues: 'FM extraído de Tabla 5.1',
        impactOnResult: 'Frecuencias elevadas (> 4 lev/min en turnos largos) desploman FM por debajo de 0,45, disparando el Índice de Levantamiento.',
      },
    ],
    actionLevels: [
      { level: 'Riesgo Aceptable', scoreRange: 'IL ≤ 1.0', risk: 'Seguro para el 90 % de la población', action: 'Puesto admisible. Monitoreo regular preventivo.', deadline: 'Sin plazo específico' },
      { level: 'Riesgo Moderado', scoreRange: '1.0 < IL ≤ 3.0', risk: 'Incremento moderado de lesiones dorsolumbares', action: 'Rediseñar el puesto y optimizar geometría en corto a mediano plazo.', deadline: 'Medio a Corto plazo' },
      { level: 'Riesgo Muy Alto', scoreRange: 'IL > 3.0', risk: 'Peligro grave de lesión lumbar (compresión > 3,4 kN)', action: 'Intervención de ingeniería urgente y obligatoria.', deadline: 'Inmediato' },
    ],
    workedExample: {
      title: 'Ejemplo 5.5 — Paletizado Manual de Cajas de 18 kg (Cap. 5.5 del Libro)',
      description: 'Traslado de cajas de 18 kg desde una tarima en el suelo (origen) hasta una cinta a 80 cm con giro de 45° (destino). Frecuencia: 4 lev/min, jornada de 8 h, agarre regular.',
      inputs: 'L = 18 kg; Origen: H=35 cm, V=20 cm, A=0°; Destino: H=40 cm, V=80 cm, A=45°; D = 60 cm; F = 4 lev/min; Duración > 2 h; Agarre regular.',
      calculations: 'Multiplicadores en Destino: LC=23, HM=25/40=0.625, VM=1-0.003*|80-75|=0.985, DM=0.82+4.5/60=0.895, AM=1-0.0032*45=0.856, FM=0.45, CM=1.00.\nRWL_dest = 23 * 0.625 * 0.985 * 0.895 * 0.856 * 0.45 * 1.00 = 4.88 kg.\nIL_dest = 18 / 4.88 = 3.69 (en Origen IL = 2.81). Adoptado = 3.69.',
      finalScore: 'IL = 3.69 (Riesgo Muy Alto · IL > 3)',
      conclusion: 'El peso de 18 kg supera casi 4 veces el límite admisible. Medida indispensable: elevar tarima origen a 75 cm con mesa tijera y eliminar el giro con mesa giratoria (IL bajaría a 1.04).',
    },
    authorNotes:
      'Cuando un puesto requiere control significativo en destino, SIEMPRE calcular RWL tanto en origen como en destino y adoptar el menor. La asimetría en destino suele ser el factor más destructivo del límite.',
  },

  [MethodId.SNOOK]: {
    id: MethodId.SNOOK,
    shortName: 'Snook y Ciriello',
    fullName: 'Tablas Psicofísicas de Snook y Ciriello (Liberty Mutual, 1991)',
    chapter: 'Capítulo 5 · Apartado 5.9',
    chapterTitle: 'Fuerzas y Pesos Máximos Aceptables (Empuje, Tracción y Transporte)',
    authorReference: 'Libro-Proyecto Mauricio Pizarro · Capítulo 5.9',
    normativeContext: 'Norma ISO 11228-2 (Fuerzas de empuje y tracción) e ISO 11228-1 (Transporte).',
    formulaSummary:
      'Compara la fuerza inicial (Fi) y sostenida (Fs) o masa real con los Valores Límites Psicofísicos aceptables para el 90 % de la población femenina y masculina.',
    conceptualBasis:
      'Determina la capacidad de trabajo continuo sin fatiga excesiva para operaciones horizontales (empuje de zorras, carros, arrastre) y transporte que la Ecuación NIOSH no cubre.',
    tables: [
      { tableNumber: 'Tabla 5.6', title: 'Fuerzas Máximas Aceptables de Empuje y Tracción', description: 'Valores en Newtons (N) de fuerza inicial y fuerza sostenida según altura de agarre y distancia de recorrido.' },
      { tableNumber: 'Tabla 5.9', title: 'Pesos Máximos Aceptables de Transporte Horizontal', description: 'Valores en kg para transporte bimanual a distancias de 2 m, 5 m y >10 m.' },
    ],
    variables: [
      { variable: 'operationType', name: 'Modalidad de tarea', meaning: 'Levantamiento, empuje, tracción o transporte.', formulaOrValues: 'Selección de la tarea', impactOnResult: 'Determina si la comparación es contra fuerza (N) o masa (kg).' },
      { variable: 'population', name: 'Criterio de diseño poblacional', meaning: 'Referencia percentil 90 % femenino (más exigente y protector) o masculino.', formulaOrValues: 'femenina / masculina', impactOnResult: 'El percentil femenino exige límites un 30–40 % menores, garantizando protección universal.' },
      { variable: 'actualForceN / actualWeightKg', name: 'Magnitud real medida con dinamómetro', meaning: 'Fuerza requerida para romper la inercia (inicial) y mantener el movimiento (sostenida).', formulaOrValues: 'Medición dinamométrica en Newtons', impactOnResult: 'Superar la fuerza límite sitúa la tarea en Nivel 3 o 4.' },
    ],
    actionLevels: [
      { level: 'Aceptable', scoreRange: 'Valor Real ≤ Límite 90 %', risk: 'Aceptable', action: 'Tarea compatible con la población evaluada.', deadline: 'Sin plazo específico' },
      { level: 'No Aceptable', scoreRange: 'Valor Real > Límite 90 %', risk: 'Riesgo Elevado', action: 'Reducir la carga, reparar ruedas de carros o motorizar el empuje.', deadline: 'Corto plazo' },
    ],
    workedExample: {
      title: 'Ejemplo de Empuje de Carro Manual en Fábrica',
      description: 'Operario empuja carro portabobinas en recorrido de 60 metros sobre piso industrial.',
      inputs: 'Fuerza inicial medida: 310 N; Fuerza sostenida medida: 190 N; Altura de empuñadura: 95 cm (nivel de codos); Población de referencia: femenina 90 %.',
      calculations: 'Límites Tablas Snook: Fuerza inicial máxima = 220 N; Fuerza sostenida máxima = 110 N.\nComparación: 310 > 220 N (+40 %) y 190 > 110 N (+72 %).',
      finalScore: 'No Aceptable (Supera límites psicofísicos de fuerza inicial y sostenida)',
      conclusion: 'Riesgo alto de fatiga y sobreesfuerzo de miembros inferiores y columna. Requiere ruedas de poliuretano de mayor diámetro con rodamientos sellados o tractor de arrastre eléctrico.',
    },
    authorNotes:
      'Para mediciones de empuje y tracción, usar dinamómetro digital en el eje de avance efectivo. Nunca asumir el peso del carro como fuerza de empuje.',
  },

  [MethodId.LMC_295]: {
    id: MethodId.LMC_295,
    shortName: 'LMC Res. 295/03',
    fullName: 'Levantamiento Manual de Cargas — Resolución MTESS 295/03 (Anexo I)',
    chapter: 'Capítulo 9 · Apartado 9.2.3',
    chapterTitle: 'Marco Normativo Legal: Resolución 295/03',
    authorReference: 'Libro-Proyecto Mauricio Pizarro · Capítulo 9.2.3 y Protocolo POSE S.A.',
    normativeContext: 'Legislación argentina vigente obligatoria (Res. MTESS 295/03 y Res. SRT 886/15).',
    formulaSummary:
      'Selecciona Tabla 1, 2 o 3 según duración diaria (<2h ó >2h) y levantamientos/hora.\nUbica cuadrante de altura vertical (suelo a espinilla, espinilla a nudillo, nudillo a hombro, sobre hombro) y distancia horizontal (próximo ≤30, intermedio 30-60, alejado 60-80 cm).\nCompara Peso Real con el Valor Límite Umbral (VLU en kg).',
    conceptualBasis:
      'Establece límites umbral de peso para tareas de levantamiento monótonas en dos manos. Si concurren factores desfavorables (asimetría >30°, agarre malo, una mano), invalida el uso directo y remite a NIOSH.',
    tables: [
      { tableNumber: 'Tabla 1 Res. 295/03', title: 'Levantamientos ≤ 2 horas/día y ≤ 60 lev/hora (o > 2 h y ≤ 12 lev/h)', description: 'Valores máximos de hasta 32 kg en zona óptima próxima.' },
      { tableNumber: 'Tabla 2 Res. 295/03', title: 'Levantamientos ≤ 2 horas/día y > 60 lev/h (o > 2 h y 12 a 30 lev/h)', description: 'Valores máximos de hasta 28 kg en zona óptima.' },
      { tableNumber: 'Tabla 3 Res. 295/03', title: 'Levantamientos > 2 horas/día y 30 a 360 lev/hora', description: 'Valores máximos de hasta 18 kg en zona óptima (mayor exigencia temporal).' },
    ],
    variables: [
      { variable: 'actualWeightKg', name: 'Masa de la carga levantada', meaning: 'Peso en balanza del objeto.', formulaOrValues: 'kg', impactOnResult: 'Se compara contra el VLU de la celda de la tabla seleccionada.' },
      { variable: 'verticalZone / horizontalZone', name: 'Cuadrante espacial', meaning: 'Altura de las manos y distancia respecto a los tobillos.', formulaOrValues: '4 franjas verticales x 3 horizontales', impactOnResult: 'El VLU cae a 0 kg (prohibido) en distancias alejadas >60 cm en el suelo o sobre hombros.' },
    ],
    actionLevels: [
      { level: 'Cumple VLU', scoreRange: 'Peso ≤ VLU', risk: 'Dentro de norma', action: 'Cumple el valor legal de la Resolución 295/03.', deadline: 'Sin plazo específico' },
      { level: 'Excede VLU', scoreRange: 'Peso > VLU', risk: 'Incumplimiento legal', action: 'Inadmisible bajo la normativa. Reducir carga o aplicar ayuda mecánica.', deadline: 'Inmediato' },
    ],
    workedExample: {
      title: 'Ejemplo de Informe POSE S.A. — Pisón Manual de 13,2 kg',
      description: 'Apisonado en fondo de canalización con pisón de hierro de 13,2 kg en jornada menor a 2 horas acumuladas.',
      inputs: 'Peso = 13,2 kg; Duración: ≤ 2 h/día; Frecuencia: 45 lev/h -> Tabla 1; Zona vertical: nudillos a hombro; Zona horizontal: próximo (≤ 30 cm).',
      calculations: 'VLU en Tabla 1 para franja nudillos a hombro y próximo = 28 kg.\nPeso real = 13,2 kg < 28 kg (Ratio = 0,47).',
      finalScore: 'Cumple Valor Límite Umbral (VLU = 28 kg)',
      conclusion: 'La operación cumple holgadamente con los límites legales de la Resolución 295/03.',
    },
    authorNotes:
      'En Argentina, la Resolución 295/03 tiene fuerza de ley obligatoria ante la Superintendencia de Riesgos del Trabajo (SRT).',
  },

  [MethodId.OCRA_COMPLETO]: {
    id: MethodId.OCRA_COMPLETO,
    shortName: 'OCRA Completo',
    fullName: 'Método OCRA — Análisis Completo de Acciones Técnicas (Colombini et al.)',
    chapter: 'Capítulo 6 · Apartados 6.2 y 6.5',
    chapterTitle: 'Movimientos Repetitivos: Exposición de Miembros Superiores',
    authorReference: 'Libro-Proyecto Mauricio Pizarro · Capítulo 6.2 a 6.2.8 y Ejemplo 6.5',
    normativeContext: 'Norma ISO 11228-3 y UNE-EN 1005-5. Método de referencia ISO para movimientos repetitivos.',
    formulaSummary:
      'Índice OCRA = ATA_realizadas / ATA_referencia\nATA_realizadas = (Acciones Técnicas / Ciclo) · (60 / Duración Ciclo) · Minutos Netos Repetitivos\nATA_ref = [30 · Fm · Fp · Ff · Fe · Fa · Ft · Fc] · Minutos Netos Repetitivos',
    conceptualBasis:
      'Compara el número real de acciones técnicas ejecutadas por minuto con un valor de referencia basal de 30 acciones/min que se reduce progresivamente mediante 7 factores multiplicadores desfavorables.',
    tables: [
      { tableNumber: 'Tabla 6.3', title: 'Factor de Fuerza Fm (Borg)', description: '1.00 (Borg 0–1), 0.85 (Borg 2), 0.65 (Borg 3–4), 0.35 (Borg 5–6), 0.15 (Borg ≥7).' },
      { tableNumber: 'Tabla 6.4', title: 'Factor de Postura Fp', description: '1.00 (neutra), 0.85 (desviaciones leves), 0.70 (1/3 a 2/3 del ciclo forzado), 0.50 (>2/3 forzado).' },
      { tableNumber: 'Tabla 6.5', title: 'Factor de Frecuencia Ff', description: '1.00 (≤20 acc/min), 0.90 (21–30), 0.70 (31–40), 0.50 (41–60), 0.30 (>60 acc/min).' },
      { tableNumber: 'Tabla 6.6', title: 'Factor de Estereotipia Fe', description: '1.00 (variedad gestual), 0.85 (gestos idénticos 50–80 %), 0.70 (ciclo < 8 s o > 80 % idéntico).' },
      { tableNumber: 'Tabla 6.7', title: 'Factor Agentes Físicos Fa', description: '1.00 (ausentes), 0.90 (guantes, frío, compresión moderada), 0.80 (vibraciones o impactos).' },
      { tableNumber: 'Tabla 6.8', title: 'Factor de Recuperación Ft', description: '1.00 (pausa cada hora), 0.85 (1–2 h sin pausa), 0.70 (≥3 h sin pausa adecuada).' },
      { tableNumber: 'Tabla 6.9', title: 'Factor de Duración Acumulada Fc', description: '1.00 (<120 min), 0.90 (120–239), 0.80 (240–359), 0.70 (360–480 min), 0.60 (>480 min).' },
    ],
    variables: [
      { variable: 'actionsPerCycle / cycleDurationSec', name: 'Cadencia de acciones técnicas', meaning: 'Acciones técnicas elementales realizadas por unidad de tiempo.', formulaOrValues: 'acciones / ciclo y segundos', impactOnResult: 'Determina las acciones realizadas por minuto; si supera 40 acc/min, el índice crece rápidamente.' },
      { variable: 'Fm (Fuerza Borg)', name: 'Esfuerzo muscular percibido', meaning: 'Nivel de fuerza media en escala Borg CR-10.', formulaOrValues: '0.15 a 1.00', impactOnResult: 'Es el multiplicador con mayor rango de castigo (puede reducir el denominador hasta un 85 %).' },
      { variable: 'Ft (Recuperación)', name: 'Distribución de pausas por hora', meaning: 'Existencia de 10 minutos de recuperación por cada 50 de trabajo repetitivo.', formulaOrValues: '0.70 a 1.00', impactOnResult: 'La ausencia de pausas reduce la capacidad de referencia un 30 % adicional.' },
    ],
    actionLevels: [
      { level: 'Verde (Óptimo / Aceptable)', scoreRange: 'OCRA ≤ 1.5', risk: 'Riesgo Inapreciable', action: 'Condiciones de trabajo aceptables.', deadline: 'Sin plazo específico' },
      { level: 'Amarillo (Dudoso)', scoreRange: '1.5 < OCRA ≤ 2.2', risk: 'Riesgo Muy Leve', action: 'Monitorear y realizar seguimiento médico.', deadline: 'Medio plazo' },
      { level: 'Rojo Leve (Medio)', scoreRange: '2.2 < OCRA ≤ 3.5', risk: 'Riesgo Medio', action: 'Rediseño de tareas y pausas de recuperación.', deadline: 'Corto plazo' },
      { level: 'Rojo Alto (Crítico)', scoreRange: 'OCRA > 3.5', risk: 'Riesgo Alto / Crítico', action: 'Intervención inmediata obligatoria.', deadline: 'Inmediato' },
    ],
    workedExample: {
      title: 'Ejemplo 6.5 — Línea de Empaque Repetitivo de Alta Cadencia (Cap. 6.5 del Libro)',
      description: 'Línea continua con ciclo de 6 segundos y 6 acciones técnicas elementales durante 420 minutos netos por turno.',
      inputs: '6 acciones en 6 s (60 acc/min); 420 min netos; Fm=0.65; Fp=0.70; Ff=0.50; Fe=0.70; Fa=1.00; Ft=0.85; Fc=0.70.',
      calculations: 'ATA_realizadas = (6/6)*60 * 420 = 25.200 acciones.\nATA_ref_min = 30 * 0.65 * 0.70 * 0.50 * 0.70 * 1.00 * 0.85 * 0.70 = 2.85 acciones/min.\nATA_ref_total = 2.85 * 420 = 1.197 acciones.\nÍndice OCRA = 25.200 / 1.197 = 21.1.',
      finalScore: 'Índice OCRA = 21.1 (Riesgo Crítico Muy Alto · Umbral 3.5 superado 6 veces)',
      conclusion: 'Situación altamente lesiva. Se requiere reducir a la mitad las acciones por ciclo mediante alimentador automático e incorporar pausas horarias.',
    },
    authorNotes:
      'OCRA es el método estándar europeo más riguroso para acreditar patologías profesionales por movimientos repetitivos (túnel carpiano, tendinitis de manguito rotador).',
  },

  [MethodId.OCRA_CHECKLIST]: {
    id: MethodId.OCRA_CHECKLIST,
    shortName: 'OCRA Check List',
    fullName: 'Lista de Verificación OCRA (Check List — Fichas Bilaterales Res. 886/15)',
    chapter: 'Capítulo 6 · Apartado 6.3',
    chapterTitle: 'Check List de Movimientos Repetitivos de Miembros Superiores',
    authorReference: 'Libro-Proyecto Mauricio Pizarro · Capítulo 6.3 y Protocolos SRT 886/15',
    normativeContext: 'Resolución SRT 886/15 (Protocolo de Ergonomía — Estudio 2).',
    formulaSummary:
      'Puntuación Check List = (Ficha 3 Frecuencia + Ficha 4 Fuerza + Ficha 5 Postura + Ficha 6 Complementarios) · Multiplicador Recuperación (Ficha 2) · Multiplicador Duración (Ficha 1). Rango 0 a 50+.',
    conceptualBasis:
      'Versión simplificada y aditiva del método OCRA con evaluación independiente para miembro superior derecho e izquierdo.',
    tables: [
      { tableNumber: 'Ficha 1', title: 'Duración neta del trabajo repetitivo', description: 'Calcula minutos netos y asigna el multiplicador horario.' },
      { tableNumber: 'Ficha 2', title: 'Distribución de la recuperación', description: 'Puntúa de 0 a 10 las horas de la jornada sin descanso adecuado.' },
      { tableNumber: 'Ficha 3', title: 'Frecuencia de acciones', description: 'Puntúa de 0 a 10 según la rapidez gestual.' },
      { tableNumber: 'Ficha 4', title: 'Fuerza', description: 'Puntúa de 0 a 24 según nivel Borg y porcentaje de ocupación.' },
      { tableNumber: 'Ficha 5', title: 'Posturas y movimientos articulares', description: 'Hombro (0–24), codo (0–8), muñeca (0–8) y mano/dedos (0–8).' },
      { tableNumber: 'Ficha 6', title: 'Factores complementarios', description: 'Físico-mecánicos (0–3) y organizativos (0–2).' },
    ],
    variables: [
      { variable: 'shoulderScore', name: 'Postura de hombro', meaning: 'Brazos elevados o en abducción > 80°.', formulaOrValues: '0 a 24 pt', impactOnResult: 'Suma directamente a la Ficha 5 de postura articular.' },
      { variable: 'handGripScore', name: 'Agarre mano/dedos', meaning: 'Pinza digital (pinch), gancho o palmar.', formulaOrValues: '0 a 8 pt', impactOnResult: 'Eleva el riesgo distal de tendinitis y síndrome de túnel carpiano.' },
    ],
    actionLevels: [
      { level: 'Verde (Aceptable)', scoreRange: '≤ 7.5', risk: 'Riesgo Aceptable', action: 'No requiere medidas correctivas.', deadline: 'Sin plazo específico' },
      { level: 'Amarillo (Dudoso)', scoreRange: '7.6 a 11.0', risk: 'Riesgo Muy Leve / Alerta', action: 'Mejoras organizativas recomendadas.', deadline: 'Medio plazo' },
      { level: 'Rojo Ligero', scoreRange: '11.1 a 14.0', risk: 'Riesgo Medio', action: 'Modificaciones y control en corto plazo.', deadline: 'Corto plazo' },
      { level: 'Rojo Medio', scoreRange: '14.1 a 22.5', risk: 'Riesgo Alto', action: 'Intervención prioritaria.', deadline: 'Corto plazo' },
      { level: 'Rojo Alto', scoreRange: '> 22.5', risk: 'Riesgo Muy Alto', action: 'Intervención inmediata.', deadline: 'Inmediato' },
    ],
    workedExample: {
      title: 'Ejemplo de Estudio Bilateral en Envasado',
      description: 'Envasado manual en frascos con ciclo de 12 segundos durante 6 horas netas.',
      inputs: 'Ficha 1: 360 min; Ficha 2: 3 h sin recuperación (Score=3); Mano der: Frec=1, Fuerza=2, Hombro=2, Codo=2, Muñeca=2, Mano=2, Compl=3; Mano izq: similar.',
      calculations: 'Suma factores = 1 + 2 + (2+2+2+2) + 3 = 14.\nMultiplicador = 1.05.\nPuntaje final = 14.7.',
      finalScore: 'Check List = 14.7 (Rojo Medio · Riesgo Alto)',
      conclusion: 'Requiere balancear el esfuerzo entre manos y asegurar una pausa de 10 min por hora.',
    },
    authorNotes: 'Requerido en el Anexo I de la Resolución SRT 886/15 en Argentina.',
  },

  [MethodId.JSI]: {
    id: MethodId.JSI,
    shortName: 'JSI',
    fullName: 'Método JSI (Job Strain Index — Moore y Garg)',
    chapter: 'Capítulo 6 · Apartado 6.4',
    chapterTitle: 'Índice de Tensión en la Extremidad Superior Distal (Mano y Muñeca)',
    authorReference: 'Libro-Proyecto Mauricio Pizarro · Capítulo 6.4 y 6.6',
    normativeContext: 'Referencia internacional en biomecánica ocupacional de mano y muñeca.',
    formulaSummary:
      'JSI = IE · DE · EPM · PM · HT · NP\nMultiplica seis multiplicadores extraídos de las Tablas 6.19 a 6.24 a partir de clasificaciones de 1 a 5.',
    conceptualBasis:
      'Focalizado en los trastornos musculoesqueléticos de la extremidad distal (tendinitis flexora, túnel carpiano, epicondilitis).',
    tables: [
      { tableNumber: 'Tabla 6.19', title: 'Intensidad del Esfuerzo (IE)', description: 'Ligero (1.0), Un poco duro (3.0), Duro (6.0), Muy duro (9.0), Máximo (13.0).' },
      { tableNumber: 'Tabla 6.20', title: 'Duración del Esfuerzo (DE)', description: '<10% (0.5), 10-29% (1.0), 30-49% (1.5), 50-79% (2.0), ≥80% (3.0).' },
      { tableNumber: 'Tabla 6.21', title: 'Esfuerzos por Minuto (EPM)', description: '<4 (0.5), 4-8 (1.0), 9-14 (1.5), 15-19 (2.0), ≥20 (3.0).' },
      { tableNumber: 'Tabla 6.22', title: 'Postura de Muñeca (PM)', description: 'Muy buena (1.0), Buena (1.0), Regular (1.5), Mala (2.0), Muy mala (3.0).' },
      { tableNumber: 'Tabla 6.23', title: 'Horas por Día (HT)', description: '≤1h (0.25), 1-2h (0.5), 2-4h (0.75), 4-8h (1.0), >8h (1.5).' },
      { tableNumber: 'Tabla 6.24', title: 'Velocidad de Trabajo (NP)', description: 'Muy lenta (1.0), Lenta (1.0), Regular (1.0), Rápida (1.5), Muy rápida (2.0).' },
    ],
    variables: [
      { variable: 'IE (Intensidad)', name: 'Esfuerzo muscular distal', meaning: 'Magnitud subjetiva de prensión o tracción.', formulaOrValues: '1.0 a 13.0', impactOnResult: 'Un esfuerzo "Duro" (6.0) o "Muy duro" (9.0) multiplica drásticamente todo el índice.' },
      { variable: 'PM (Postura)', name: 'Desviación de muñeca', meaning: 'Flexión, extensión o desviación radial/cubital.', formulaOrValues: '1.0 a 3.0', impactOnResult: 'Multiplica por hasta 3.0 si la muñeca trabaja en flexión extrema.' },
    ],
    actionLevels: [
      { level: 'Bajo', scoreRange: 'JSI ≤ 3.0', risk: 'Poco probable que cause trastornos', action: 'Condiciones seguras.', deadline: 'Sin plazo específico' },
      { level: 'Moderado / Dudoso', scoreRange: '3.0 < JSI ≤ 7.0', risk: 'Riesgo moderado', action: 'Acción preventiva y vigilancia médica.', deadline: 'Medio plazo' },
      { level: 'Alto / Peligroso', scoreRange: 'JSI > 7.0', risk: 'Puesto asociado a lesiones distales', action: 'Rediseño urgente indispensable.', deadline: 'Inmediato' },
    ],
    workedExample: {
      title: 'Ejemplo 6.6 — Despiece con Cuchillo en Industria Frigorífica',
      description: 'Corte repetitivo de carne con cuchillo manual durante 8 horas diarias.',
      inputs: 'IE=Duro (6.0); DE=50-79% (2.0); EPM=≥20 (3.0); PM=Mala (2.0); HT=4-8h (1.0); NP=Rápido (1.5).',
      calculations: 'JSI = 6.0 * 2.0 * 3.0 * 2.0 * 1.0 * 1.5 = 108.0.',
      finalScore: 'JSI = 108.0 (Riesgo Crítico Extremo · Límite 7.0 ampliamente superado)',
      conclusion: 'Altísima probabilidad de síndrome de túnel carpiano. Requiere cuchillos neumáticos vibratorios o sierras fijas con protector.',
    },
    authorNotes: 'El JSI es multiplicativo puro: cualquier factor alto combinado con otro eleva exponencialmente el valor final.',
  },

  [MethodId.NAM_295]: {
    id: MethodId.NAM_295,
    shortName: 'NAM Res. 295/03',
    fullName: 'Nivel de Actividad Manual (NAM — ACGIH / Resolución MTESS 295/03)',
    chapter: 'Capítulo 9 · Apartado 9.2.3',
    chapterTitle: 'Valores Límite Umbral para la Actividad Manual en Trabajo Repetitivo',
    authorReference: 'Libro-Proyecto Mauricio Pizarro · Capítulo 9.2.3 y Protocolo POSE S.A.',
    normativeContext: 'Resolución MTESS 295/03 (Anexo I — Monotareas de 4 o más horas diarias).',
    formulaSummary:
      'NAM = Función(Frecuencia de esfuerzos, Ciclo de ocupación %).\nFuerza Pico Normalizada = Escala de Borg CR-10 (0 a 10).\nLímite de Acción = 0.56 · (10 - NAM) [para NAM entre 0.5 y 10].\nValor Límite Umbral (VLU) = 0.78 · (10 - NAM).',
    conceptualBasis:
      'Gráfico bidimensional que divide el plano NAM vs Fuerza Borg en tres zonas: Zona de Seguridad (bajo Límite de Acción), Zona de Control (entre Límite de Acción y VLU) y Zona de Peligro TME (sobre VLU).',
    tables: [
      { tableNumber: 'Figura 1 Res. 295/03', title: 'Gráfico de Valores Límite Umbral NAM', description: 'Curvas de Límite de Acción y VLU para mono-tareas.' },
      { tableNumber: 'Escala Borg CR-10', title: 'Fuerza Pico Normalizada', description: '0 (nada), 1 (muy débil), 3 (moderado), 5 (fuerte), 7 (muy fuerte), 10 (máximo).' },
    ],
    variables: [
      { variable: 'effortsCount / observationPeriodSec', name: 'Frecuencia de esfuerzos', meaning: 'Esfuerzos por segundo observados en el puesto.', formulaOrValues: 'Esfuerzos / segundos', impactOnResult: 'Determina el valor del eje X (NAM).' },
      { variable: 'borgPeakForce', name: 'Fuerza pico en Escala de Borg', meaning: 'Fuerza máxima requerida en la acción.', formulaOrValues: '0 a 10', impactOnResult: 'Determina el eje Y del gráfico; a mayor Borg, menor es el NAM tolerado.' },
    ],
    actionLevels: [
      { level: 'Zona de Seguridad', scoreRange: 'Bajo Límite de Acción', risk: 'Seguro', action: 'Puesto conforme a norma.', deadline: 'Sin plazo específico' },
      { level: 'Zona de Control', scoreRange: 'Entre Límite de Acción y VLU', risk: 'Moderado', action: 'Vigilancia médica activa y control de ingeniería.', deadline: 'Corto plazo' },
      { level: 'Zona de Peligro TME', scoreRange: 'Sobre VLU', risk: 'Peligro Inadmisible', action: 'Incumplimiento legal. Reducción inmediata de fuerza y cadencia.', deadline: 'Inmediato' },
    ],
    workedExample: {
      title: 'Ejemplo del Informe POSE S.A. — Uso de Herramientas de Mano',
      description: 'Operario usando alicates y llaves manuales en conexionado de tableros eléctricos.',
      inputs: 'Mano derecha: 62 esfuerzos en 120 s (NAM = 3.0), Fuerza Borg = 1.0; Mano izquierda: 7 esfuerzos en 120 s (NAM = 0.5), Fuerza Borg = 0.5.',
      calculations: 'Para NAM = 3.0: Límite de Acción = 0.56*(10-3) = 3.92; VLU = 0.78*(10-3) = 5.46.\nFuerza real = 1.0 < 3.92 (Bajo Límite de Acción).',
      finalScore: 'Zona de Seguridad (Ambas manos conformes)',
      conclusion: 'La exposición cumple los requisitos legales vigentes de la Resolución 295/03.',
    },
    authorNotes: 'Obligatorio en Argentina para monotareas de más de 4 horas diarias.',
  },

  [MethodId.BIPOLAR]: {
    id: MethodId.BIPOLAR,
    shortName: 'Cuestionario Bipolar',
    fullName: 'Cuestionario Bipolar de Fatiga y Confort Subjetivo (IRAM 3753)',
    chapter: 'Protocolo Complementario · IRAM 3753',
    chapterTitle: 'Evaluación de la Percepción Psicofísica y Disconfort',
    authorReference: 'Libro-Proyecto Mauricio Pizarro · Apartado Complementario y Protocolo POSE S.A.',
    normativeContext: 'Norma IRAM 3753 e ISO 10075. Evaluación cualitativa de síntomas precoces.',
    formulaSummary: 'Puntuación Media = Suma(15 ítems) / 15. Valores por ítem de 0 (pleno confort) a 10 (máxima molestia/dolor).',
    conceptualBasis: 'Trata la respuesta del trabajador como dato empírico cualitativo de alerta temprana antes de la aparición de patología diagnosticable.',
    tables: [{ tableNumber: '15 Dimensiones', title: 'Pares Bipolares de Fatiga y Dolor', description: 'Evalúa fatiga general, concentración, cuello, dorsales, lumbares, miembros inferiores y miembros superiores.' }],
    variables: [{ variable: 'scores[0..14]', name: 'Puntuación por dimensión', meaning: 'Grado de molestia percibida.', formulaOrValues: '0 a 10', impactOnResult: 'Valores ≥ 7 en segmentos articulares específicos indican sufrimiento biomecánico localizado.' }],
    actionLevels: [
      { level: 'Bajo', scoreRange: 'Media < 2.5', risk: 'Confort aceptable', action: 'Seguimiento preventivo regular.', deadline: 'Sin plazo específico' },
      { level: 'Moderado', scoreRange: '2.5 a 5.0', risk: 'Molestias perceptibles', action: 'Revisión ergonómica del puesto y pausas activas.', deadline: 'Medio plazo' },
      { level: 'Alto', scoreRange: '> 5.0', risk: 'Fatiga severa reportada', action: 'Intervención y evaluación médica laboral.', deadline: 'Corto plazo' },
    ],
    workedExample: {
      title: 'Relevamiento en Obra POSE S.A.',
      description: 'Encuesta anónima a operarios de tendido tras completar la jornada.',
      inputs: 'Ítems 1 a 4 con valores 1 a 2 (cansancio físico leve al final del día), ítems 5 a 15 con valor 0 (ausencia de dolor osteomuscular).',
      calculations: 'Suma = 6 / 15 = Media 0.40.',
      finalScore: 'Media = 0.4 / 10 (Confort Aceptable · Riesgo Bajo)',
      conclusion: 'Confirma que el régimen de pausas e hidratación previene la acumulación de fatiga dolorosa.',
    },
    authorNotes: 'Nunca descartar la queja del trabajador: es el primer biomarcador de desajuste dimensional del puesto.',
  },

  [MethodId.FANGER]: {
    id: MethodId.FANGER,
    shortName: 'Fanger PMV/PPD',
    fullName: 'Método de Fanger — Confort Térmico en Ambientes Moderados (ISO 7730)',
    chapter: 'Capítulo 7 · Apartados 7.2 y 7.4',
    chapterTitle: 'Evaluación del Ambiente Térmico: Confort Térmico',
    authorReference: 'Libro-Proyecto Mauricio Pizarro · Capítulo 7.2 a 7.4.3',
    normativeContext: 'Norma ISO 7730 y UNE-EN ISO 7730.',
    formulaSummary:
      'PMV = (0.303 · e^(-0.036 · M) + 0.028) · L\nPPD = 100 - 95 · exp(-0.03353 · PMV^4 - 0.2179 · PMV^2)\nL = Carga térmica balanceada en función de ta, tr, va, HR, M e Icl.',
    conceptualBasis:
      'Determina el Voto Medio Estimado (-3 frío a +3 calor) y el Porcentaje de Personas Insatisfechas en puestos de trabajo sedentarios o de actividad moderada interior.',
    tables: [
      { tableNumber: 'Tabla 7.3', title: 'Tasa Metabólica M según Actividad', description: 'Valores en met (1 met = 58.2 W/m²). Sentado reposo: 1.0; Oficina: 1.2; De pie ligero: 1.6; Taller: 2.0.' },
      { tableNumber: 'Tabla 7.4', title: 'Aislamiento de la Vestimenta Icl', description: 'Valores en clo (1 clo = 0.155 m²K/W). Ropa ligera: 0.5; Ropa laboral estándar: 0.7–1.0.' },
    ],
    variables: [
      { variable: 'ta / tr', name: 'Temperatura seca y radiante', meaning: 'Temperatura del aire y radiación superficial circundante.', formulaOrValues: '°C', impactOnResult: 'Diferencias marcadas provocan asimetría radiante molesta.' },
      { variable: 'va', name: 'Velocidad del aire', meaning: 'Flujo convectivo en m/s.', formulaOrValues: 'm/s', impactOnResult: 'Valores > 0.25 m/s causan sensación de corriente de aire (draft).' },
      { variable: 'M / Icl', name: 'Metabolismo y ropa', meaning: 'Consumo energético personal y resistencia térmica textil.', formulaOrValues: 'met y clo', impactOnResult: 'Condicionan directamente el punto térmico neutro.' },
    ],
    actionLevels: [
      { level: 'Categoría A (Óptimo)', scoreRange: '-0.2 ≤ PMV ≤ +0.2', risk: 'PPD < 6 %', action: 'Confort térmico sobresaliente.', deadline: 'Sin plazo específico' },
      { level: 'Categoría B (Conforme ISO)', scoreRange: '-0.5 ≤ PMV ≤ +0.5', risk: 'PPD < 10 %', action: 'Rango de confort admisible para oficinas y manufactura ligera.', deadline: 'Sin plazo específico' },
      { level: 'Categoría C (Marginal)', scoreRange: '-0.7 ≤ PMV ≤ +0.7', risk: 'PPD < 15 %', action: 'Aceptable en edificios existentes.', deadline: 'Medio plazo' },
      { level: 'Disconfort', scoreRange: '|PMV| > 0.7', risk: 'PPD > 15 %', action: 'Ajustar climatización o vestimenta.', deadline: 'Corto plazo' },
    ],
    workedExample: {
      title: 'Ejemplo de Oficina Técnica de Ingeniería',
      description: 'Ambiente climatizado en verano con trabajo de diseño frente a pantalla.',
      inputs: 'ta = 24.5 °C, tr = 26.0 °C, HR = 55 %, va = 0.10 m/s, M = 1.2 met, Icl = 0.60 clo.',
      calculations: 'Balance térmico L = +0.12 W/m² -> PMV = +0.15 -> PPD = 5.5 %.',
      finalScore: 'PMV = +0.15 · PPD = 5.5 % (Categoría A · Confort Pleno)',
      conclusion: 'Excelente nivel de confort; menos del 6 % de las personas reportarán disconformidad térmica.',
    },
    authorNotes: 'Para puestos industriales con hornos o intemperie, NUNCA usar Fanger; usar WBGT.',
  },

  [MethodId.WBGT]: {
    id: MethodId.WBGT,
    shortName: 'Índice WBGT',
    fullName: 'Índice WBGT — Estrés Térmico por Exposición al Calor (ISO 7243 / Res. 295/03)',
    chapter: 'Capítulo 7 · Apartados 7.3 y 7.5',
    chapterTitle: 'Estrés Térmico en Ambientes Calurosos',
    authorReference: 'Libro-Proyecto Mauricio Pizarro · Capítulo 7.3 a 7.5 y Ejemplo 7.5',
    normativeContext: 'Norma ISO 7243 y Resolución MTESS 295/03 (Anexo II — Estrés Térmico).',
    formulaSummary:
      'Sin carga solar: WBGT = 0.7 · Tbh + 0.3 · Tg\nCon carga solar: WBGT = 0.7 · Tbh + 0.2 · Tg + 0.1 · Ta\nPonderación horaria: WBGT_media = Suma(WBGT_i · t_i) / Suma(t_i)\nCompara con Límite según Consumo Metabólico (Watts) y Aclimatación.',
    conceptualBasis:
      'Evalúa el riesgo de sobrecarga térmica interna para prevenir el golpe de calor en fundiciones, calderas, hornos o agricultura.',
    tables: [
      { tableNumber: 'Tabla 7.6', title: 'Tasa Metabólica según Clase de Trabajo', description: 'Reposo (115 W), Ligero (180 W), Moderado (300 W), Alto (400 W), Muy Alto (520 W).' },
      { tableNumber: 'Tabla 7.7 / Res. 295', title: 'Valores Límite WBGT (°C)', description: 'Para aclimatados: Ligero (30.0 °C), Moderado (28.0 °C), Alto (26.0 °C), Muy alto (25.0 °C).' },
    ],
    variables: [
      { variable: 'tbh / tg / ta', name: 'Temperaturas de bulbo húmedo, globo y seca', meaning: 'Variables psicrométricas y radiantes.', formulaOrValues: '°C', impactOnResult: 'Tbh representa el 70 % del índice; la humedad alta es el factor más letal ante el calor.' },
      { variable: 'metabolicWatts', name: 'Consumo metabólico del trabajo', meaning: 'Calor metabólico interno producido por el esfuerzo muscular.', formulaOrValues: 'Watts', impactOnResult: 'A mayor metabolismo, menor es la temperatura WBGT admisible.' },
    ],
    actionLevels: [
      { level: 'Admisible', scoreRange: 'WBGT ≤ Límite', risk: 'Seguro', action: 'Trabajo continuo permitido con hidratación.', deadline: 'Sin plazo específico' },
      { level: 'Excede Límite', scoreRange: 'WBGT > Límite', risk: 'Riesgo de Estrés Térmico', action: 'Régimen obligatorio de trabajo-descanso y pantallas radiantes.', deadline: 'Inmediato' },
    ],
    workedExample: {
      title: 'Ejemplo 7.5 — Frente de Horno Industrial de Tratamiento Térmico',
      description: 'Operario cargando piezas pesadas frente a boca de horno sin pantalla reflectante.',
      inputs: 'Sin carga solar directa. Tbh = 26.0 °C, Tg = 45.0 °C, Ta = 34.0 °C; Consumo metabólico alto = 400 W; Trabajador aclimatado.',
      calculations: 'WBGT = 0.7 * 26.0 + 0.3 * 45.0 = 18.2 + 13.5 = 31.7 °C.\nLímite Tabla 7.7 para 400 W aclimatado = 26.0 °C.\nExceso = 31.7 - 26.0 = +5.7 °C.',
      finalScore: 'WBGT = 31.7 °C (Supera límite de 26.0 °C en +5.7 °C)',
      conclusion: 'Inadmisible en régimen continuo. Requiere ciclo de 15 min de trabajo x 45 min de descanso en sala climatizada (WBGT ≤ 24 °C) y pantalla reflectante de radiación.',
    },
    authorNotes: 'En caso de superar el límite, la hidratación con sales y el control de frecuencia cardíaca son obligatorios.',
  },

  [MethodId.ISO_2631]: {
    id: MethodId.ISO_2631,
    shortName: 'ISO 2631',
    fullName: 'Norma ISO 2631-1 — Vibraciones Mecánicas de Cuerpo Entero',
    chapter: 'Capítulo 8 · Apartados 8.3 y 8.5',
    chapterTitle: 'Vibraciones Mecánicas: Transmisión a Cuerpo Entero',
    authorReference: 'Libro-Proyecto Mauricio Pizarro · Capítulo 8.3 a 8.5',
    normativeContext: 'Norma ISO 2631-1, Directiva Europea 2002/44/CE y Res. MTESS 295/03.',
    formulaSummary:
      'aw = max(1.4 · awx, 1.4 · awy, 1.0 · awz) [para postura sentada]\nA(8) = aw · sqrt(T / 8)\nNivel de Acción: 0.50 m/s² · Valor Límite de Exposición: 1.15 m/s².',
    conceptualBasis:
      'Evalúa las vibraciones que ingresan a través del asiento o plataforma de pie, con riesgo directo de microfracturas trabeculares en vértebras lumbares y hernia de disco.',
    tables: [
      { tableNumber: 'Tabla 8.1', title: 'Factores de Ponderación según Eje y Postura', description: 'Sentado: kx=1.4, ky=1.4, kz=1.0; De pie: kx=1.0, ky=1.0, kz=1.0.' },
      { tableNumber: 'Tabla 8.2', title: 'Valores de Referencia A(8)', description: 'Nivel de Acción = 0.50 m/s²; Valor Límite = 1.15 m/s².' },
    ],
    variables: [
      { variable: 'awx, awy, awz', name: 'Aceleraciones eficaces ponderadas triaxiales', meaning: 'Medidas con acelerómetro triaxial de asiento (almohadilla ISO 8041).', formulaOrValues: 'm/s²', impactOnResult: 'El eje más desfavorable determina el valor diario A(8).' },
      { variable: 'exposureHours', name: 'Tiempo de exposición efectiva diaria', meaning: 'Horas reales de operación de la máquina.', formulaOrValues: 'Horas', impactOnResult: 'Modula la energía absorbida por la raíz cuadrada del tiempo sobre 8 horas.' },
    ],
    actionLevels: [
      { level: 'Bajo', scoreRange: 'A(8) ≤ 0.50 m/s²', risk: 'Aceptable', action: 'Riesgo bajo para la salud.', deadline: 'Sin plazo específico' },
      { level: 'Moderado', scoreRange: '0.50 < A(8) ≤ 1.15 m/s²', risk: 'Supera Nivel de Acción', action: 'Vigilancia médica activa y medidas técnicas de amortiguación.', deadline: 'Corto plazo' },
      { level: 'Crítico', scoreRange: 'A(8) > 1.15 m/s²', risk: 'Supera Límite de Exposición', action: 'Prohibida la exposición continua. Intervención inmediata obligatoria.', deadline: 'Inmediato' },
    ],
    workedExample: {
      title: 'Ejemplo de Carretilla Elevadora / Autoelevador en Depósito',
      description: 'Conducción de autoelevador en pavimento de hormigón con juntas durante 5 horas diarias.',
      inputs: 'Postura sentada; awx = 0.35 m/s², awy = 0.25 m/s², awz = 0.80 m/s²; Exposición T = 5.0 h.',
      calculations: 'awx_pond = 1.4 * 0.35 = 0.49; awy_pond = 1.4 * 0.25 = 0.35; awz_pond = 1.0 * 0.80 = 0.80 m/s².\naw = max(0.49, 0.35, 0.80) = 0.80 m/s².\nA(8) = 0.80 * sqrt(5 / 8) = 0.80 * 0.79 = 0.63 m/s².',
      finalScore: 'A(8) = 0.63 m/s² (Supera Nivel de Acción de 0.50 m/s²)',
      conclusion: 'Exige instalar asiento neumático ergonómico regulable al peso del conductor y reparar juntas de dilatación del piso.',
    },
    authorNotes: 'El eje Z suele ser el predominante en autoelevadores, pero baches o giros bruscos pueden disparar los ejes X e Y.',
  },

  [MethodId.ISO_5349]: {
    id: MethodId.ISO_5349,
    shortName: 'ISO 5349',
    fullName: 'Norma ISO 5349 — Vibraciones Transmitidas al Sistema Mano-Brazo',
    chapter: 'Capítulo 8 · Apartados 8.4 y 8.6',
    chapterTitle: 'Vibraciones Segmentarias: Mano-Brazo y Síndrome de Raynaud',
    authorReference: 'Libro-Proyecto Mauricio Pizarro · Capítulo 8.4 a 8.6 y Ejemplo 8.6',
    normativeContext: 'Norma ISO 5349-1, ISO 5349-2 y Resolución MTESS 295/03.',
    formulaSummary:
      'ahv = sqrt(ahwx² + ahwy² + ahwz²)\nA(8) = ahv · sqrt(T / 8)\nLatencia vascular estimada: Dy = 31.8 · (A(8))^(-1.06) años para el 10 % de la población expuesta.\nNivel de Acción Inferior = 2.50 m/s² · Nivel de Acción Superior = 5.00 m/s².',
    conceptualBasis:
      'Evalúa la vibración transmitida por empuñaduras de herramientas neumáticas o eléctricas (martillos, amoladoras, motosierras). Previene el Síndrome del Dedo Blanco por Vibración (Raynaud ocupacional).',
    tables: [
      { tableNumber: 'Tabla 8.4', title: 'Valores Límite Mano-Brazo A(8)', description: 'Nivel de Acción Inferior = 2.50 m/s²; Nivel de Acción Superior = 5.00 m/s².' },
      { tableNumber: 'Tabla 8.5', title: 'Latencia Estimada para Manifestaciones Vasculares', description: 'Años hasta la aparición del Síndrome de Raynaud en el 10 % de los trabajadores expuestos.' },
    ],
    variables: [
      { variable: 'ahwx, ahwy, ahwz', name: 'Aceleraciones ponderadas en empuñadura', meaning: 'Medidas conforme a ISO 5349 con filtro Wh.', formulaOrValues: 'm/s²', impactOnResult: 'Se combinan vectorialmente en la suma cuadrática ahv.' },
      { variable: 'exposureHours', name: 'Tiempo diario de gatilleo/accionamiento', meaning: 'Horas reales con la herramienta vibrando en la mano.', formulaOrValues: 'Horas', impactOnResult: 'Determina el valor A(8) y la latencia calculada en años.' },
    ],
    actionLevels: [
      { level: 'Bajo', scoreRange: 'A(8) ≤ 2.50 m/s²', risk: 'Aceptable', action: 'Riesgo bajo. Monitoreo regular.', deadline: 'Sin plazo específico' },
      { level: 'Moderado', scoreRange: '2.50 < A(8) ≤ 5.00 m/s²', risk: 'Alerta / Vigilancia Médica', action: 'Capacitación, guantes antivibración y rotación para limitar tiempo.', deadline: 'Corto plazo' },
      { level: 'Crítico', scoreRange: 'A(8) > 5.00 m/s²', risk: 'Supera Nivel Superior', action: 'Reducción técnica inmediata obligatoria. Latencia vascular muy corta.', deadline: 'Inmediato' },
    ],
    workedExample: {
      title: 'Ejemplo 8.6 — Operación con Martillo Neumático de Demolición (Cap. 8.6 del Libro)',
      description: 'Picado de hormigón en obra civil con martillo neumático de 12 kg durante 3 horas diarias.',
      inputs: 'ahwx = 3.0 m/s², ahwy = 2.0 m/s², ahwz = 5.0 m/s²; Tiempo efectivo T = 3.0 horas.',
      calculations: 'ahv = sqrt(3.0² + 2.0² + 5.0²) = sqrt(9 + 4 + 25) = sqrt(38) = 6.16 m/s².\nA(8) = 6.16 * sqrt(3 / 8) = 6.16 * 0.612 = 3.77 m/s².\nLatencia vascular Dy = 31.8 * (3.77)^(-1.06) = 7.8 años.',
      finalScore: 'A(8) = 3.77 m/s² (Supera Nivel de Acción Inferior de 2.50 m/s² · Latencia: 7.8 años)',
      conclusion: 'El 10 % de los trabajadores manifestará el Síndrome de Raynaud en menos de 8 años si no se interviene. Requiere útil con amortiguación antivibratoria y limitar el uso a 1 hora diaria.',
    },
    authorNotes:
      'El frío ambiental agrava drásticamente el fenómeno de Raynaud al potenciar el vasoespasmo. Mantener manos calientes y secas es vital.',
  },
};

export function getMethodReference(id: MethodId): MethodReferenceDoc {
  return METHOD_REFERENCES[id];
}

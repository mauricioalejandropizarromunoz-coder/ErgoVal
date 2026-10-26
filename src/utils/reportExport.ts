import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { GeneralStudyData, MethodId, RiskSeverity, StudyTab } from '../types/ergonomics';
import { METHOD_CATALOG } from './defaults';
import { getMethodFormulaProfile, isMethodFormulaModified } from './formulaConfig';
import {
  buildPrioritizedStudies,
  generateAutomaticExecutiveSynthesis,
} from '../components/SummarySection';
import {
  TrafficLightColor,
  buildStudyTrafficLightMatrix,
  describeNioshTrajectory,
} from './trafficLightAlerts';

export const PROFESSIONAL_DISCLAIMER_TEXT =
  'AVISO Y DESCARGO DE RESPONSABILIDAD PROFESIONAL: Esta herramienta informática fue desarrollada para el uso exclusivo de profesionales con formación y competencia técnica en ergonomía laboral y salud ocupacional. Los cálculos, estimaciones y ponderaciones algorítmicas emitidos por este sistema constituyen un soporte técnico de cálculo y NO sustituyen en modo alguno el análisis crítico, la inspección presencial de campo ni la verificación obligatoria de los resultados obtenidos que debe efectuar el propio profesional evaluador en ejercicio de su responsabilidad legal.';

export const COPYRIGHT_NOTICE =
  '© Mauricio Alejandro Pizarro Muñoz · ErgoEval · Todos los derechos reservados';

interface NormalizedImageAsset {
  pngDataUrl: string;
  uint8: Uint8Array;
  widthPx: number;
  heightPx: number;
}

const SUBSCRIPT_MAP: Record<string, string> = {
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
};

/**
 * Normaliza cualquier cadena a caracteres WinAnsi / Latin-1 (charCode <= 255) compatibles con
 * la fuente Helvetica nativa de jsPDF (evitando que símbolos Unicode > 255 como '—', '↔', '→', '≤', '≥'
 * activen codificación UTF-16BE y dupliquen el ancho provocando desborde fuera de las tablas)
 * e inserta puntos de corte seguros en identificadores largos sin espacios.
 */
function sanitizePdfText(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  let text = String(raw)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, '  ')
    .replace(/\u2194/g, '<->')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/\u2191/g, '^')
    .replace(/\u2193/g, 'v')
    .replace(/\u2264/g, '<=')
    .replace(/\u2265/g, '>=')
    .replace(/\u2260/g, '!=')
    .replace(/\u2248/g, '~')
    .replace(/[\u2212\u2013\u2014\u2015]/g, '-')
    .replace(/[\u2022\u25cf\u25aa\u25e6]/g, '\u00b7')
    .replace(/\u25b8/g, '>')
    .replace(/\u2026/g, '...')
    .replace(/[\u201c\u201d\u201e]/g, '"')
    .replace(/[\u2018\u2019\u201a]/g, "'")
    .replace(/\u03b1/g, 'alfa')
    .replace(/\u03b2/g, 'beta')
    .replace(/\u0394/g, 'Delta')
    .replace(/[\u03a3\u2211]/g, 'Suma')
    .replace(/\u221a/g, 'sqrt')
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (m) => SUBSCRIPT_MAP[m] || '');

  // Garantizar charCode <= 255 (conserva acentos españoles áéíóúñü¿¡°±²³·×©)
  let clean = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 10 || (code >= 32 && code <= 255)) {
      clean += text[i];
    } else if (code > 255) {
      const decomp = text[i].normalize('NFKD');
      for (let j = 0; j < decomp.length; j++) {
        const dc = decomp.charCodeAt(j);
        if (dc >= 32 && dc <= 255) clean += decomp[j];
      }
    }
  }

  // Evitar palabras/identificadores larguísimos sin espacios (ej. nombres de archivo o fórmulas compactas)
  return clean
    .split('\n')
    .map((line) =>
      line
        .split(' ')
        .map((token) => {
          if (token.length <= 26) return token;
          const withBreaks = token.replace(/([_/|])/g, '$1 ');
          return withBreaks
            .split(' ')
            .map((sub) => (sub.length > 30 ? sub.replace(/(.{26})/g, '$1 ') : sub))
            .join(' ');
        })
        .join(' '),
    )
    .join('\n');
}

async function normalizeDataUrlToPng(dataUrl: string, maxWidthPx = 900): Promise<NormalizedImageAsset | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidthPx / Math.max(1, img.width));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const pngDataUrl = canvas.toDataURL('image/png');
      const base64 = pngDataUrl.split(',')[1] || '';
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      resolve({ pngDataUrl, uint8: bytes, widthPx: w, heightPx: h });
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function getSafeFilename(general: GeneralStudyData, ext: 'pdf' | 'docx'): string {
  const raw = `${general.companyName || 'empresa'}_${general.workstationName || 'puesto'}_${general.reportDate || 'informe'}`;
  const clean = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 65);
  return `informe_ergonomico_${clean || 'estudio'}.${ext}`;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function severityBadgeColors(sev: RiskSeverity): { rgb: [number, number, number]; hexFill: string; hexText: string } {
  switch (sev) {
    case 'muy_alto':
      return { rgb: [185, 28, 28], hexFill: 'FEE2E2', hexText: '991B1B' };
    case 'alto':
      return { rgb: [194, 65, 12], hexFill: 'FFEDD5', hexText: '9A3412' };
    case 'moderado':
      return { rgb: [180, 83, 9], hexFill: 'FEF3C7', hexText: '92400E' };
    case 'bajo':
      return { rgb: [21, 128, 61], hexFill: 'DCFCE7', hexText: '166534' };
  }
}

function trafficLightPalette(color: TrafficLightColor): {
  dotRgb: [number, number, number];
  fillRgb: [number, number, number];
  textRgb: [number, number, number];
  hexFill: string;
  hexText: string;
} {
  switch (color) {
    case 'rojo':
      return {
        dotRgb: [220, 38, 38],
        fillRgb: [254, 226, 226],
        textRgb: [153, 27, 27],
        hexFill: 'FEE2E2',
        hexText: '991B1B',
      };
    case 'ambar':
      return {
        dotRgb: [217, 119, 6],
        fillRgb: [254, 243, 199],
        textRgb: [146, 64, 14],
        hexFill: 'FEF3C7',
        hexText: '92400E',
      };
    case 'verde':
      return {
        dotRgb: [22, 163, 74],
        fillRgb: [220, 252, 231],
        textRgb: [22, 101, 52],
        hexFill: 'DCFCE7',
        hexText: '166534',
      };
  }
}

function extractRawSeriesRows(tab: StudyTab): { headers: string[]; rows: string[][] } | null {
  if (tab.method === MethodId.OWAS) {
    const obs = tab.payloads[MethodId.OWAS].observations;
    return {
      headers: ['Fase Observada', 'Espalda', 'Brazos', 'Piernas', 'Carga', 'Código', 'Frec. (N)'],
      rows: obs.map((o) => [
        o.taskPhase,
        String(o.back),
        String(o.arms),
        String(o.legs),
        String(o.load),
        `${o.back}${o.arms}${o.legs}${o.load}`,
        String(o.frequencyCount),
      ]),
    };
  }
  if (tab.method === MethodId.WBGT && tab.payloads[MethodId.WBGT].useMultiZone) {
    const samples = tab.payloads[MethodId.WBGT].multiZoneSamples;
    return {
      headers: ['Zona / Subtarea', 'Duración (min)', 'Tbh (°C)', 'Tg (°C)', 'Ta (°C)'],
      rows: samples.map((s) => [
        s.zoneLabel,
        String(s.durationMin),
        s.tbhC.toFixed(1),
        s.tgC.toFixed(1),
        s.taC.toFixed(1),
      ]),
    };
  }
  if (tab.method === MethodId.ISO_2631) {
    const periods = tab.payloads[MethodId.ISO_2631].periods;
    return {
      headers: ['Equipo / Plataforma', 'Postura', 'awx (m/s²)', 'awy (m/s²)', 'awz (m/s²)', 'Exposición (h)'],
      rows: periods.map((p) => [
        p.equipmentName,
        p.posture === 'sentado' ? 'Sentado' : 'De pie',
        p.awx.toFixed(2),
        p.awy.toFixed(2),
        p.awz.toFixed(2),
        p.exposureHours.toFixed(2),
      ]),
    };
  }
  if (tab.method === MethodId.ISO_5349) {
    const periods = tab.payloads[MethodId.ISO_5349].periods;
    return {
      headers: ['Herramienta Motorizada', 'ahwx (m/s²)', 'ahwy (m/s²)', 'ahwz (m/s²)', 'Uso Efectivo (h)'],
      rows: periods.map((p) => [
        p.toolName,
        p.ahwx.toFixed(2),
        p.ahwy.toFixed(2),
        p.ahwz.toFixed(2),
        p.exposureHours.toFixed(2),
      ]),
    };
  }
  return null;
}

function getTabTrajectoryClarification(tab: StudyTab): string | null {
  if (tab.method === MethodId.NIOSH) {
    const nd = tab.payloads[MethodId.NIOSH];
    return describeNioshTrajectory(nd.vOriginCm, nd.vDestCm).technicalExplanation;
  }
  if (tab.method === MethodId.LMC_295) {
    const ld = tab.payloads[MethodId.LMC_295];
    return describeNioshTrajectory(ld.originHeightCm, ld.destHeightCm).technicalExplanation;
  }
  return null;
}

// ============================================================================
// 1. EXPORTACIÓN A PDF DETALLADO (jsPDF + jspdf-autotable)
// ============================================================================
export async function exportStudyToPdf(general: GeneralStudyData, tabs: StudyTab[]): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const pageTopY = 34;
  const pageBottomMargin = 18;
  const contentWidth = pageWidth - margin * 2;
  const safeTableMargin = {
    top: pageTopY,
    bottom: pageBottomMargin,
    left: margin,
    right: margin,
  };

  const prioritized = buildPrioritizedStudies(general, tabs);
  const trafficSummary = buildStudyTrafficLightMatrix(general, tabs);
  const executiveSummary =
    general.customGlobalConclusion.trim() || generateAutomaticExecutiveSynthesis(general, prioritized);

  const logoAsset = general.companyLogoDataUrl
    ? await normalizeDataUrlToPng(general.companyLogoDataUrl, 320)
    : null;

  let currentY = pageTopY + 2;

  const ensureSpace = (neededMm: number) => {
    if (currentY + neededMm > pageHeight - pageBottomMargin) {
      doc.addPage();
      currentY = pageTopY + 2;
    }
  };

  const getLastAutoTableY = (): number => {
    const anyDoc = doc as unknown as { lastAutoTable?: { finalY?: number } };
    return (anyDoc.lastAutoTable?.finalY ?? currentY) + 6;
  };

  const runBoundedTable = (options: Parameters<typeof autoTable>[1]) => {
    const cleanRows = (rows: unknown): string[][] | undefined => {
      if (!Array.isArray(rows)) return undefined;
      return rows.map((row) =>
        Array.isArray(row) ? row.map((cell) => sanitizePdfText(cell)) : [sanitizePdfText(row)],
      );
    };

    autoTable(doc, {
      ...options,
      margin: safeTableMargin,
      tableWidth: contentWidth,
      styles: {
        overflow: 'linebreak',
        cellWidth: 'wrap',
        valign: 'top',
        ...(options.styles || {}),
        // Forzar linebreak y ancho automático acotado por columnStyles/tableWidth
      },
      head: cleanRows(options.head),
      body: cleanRows(options.body) || [],
    });
    currentY = getLastAutoTableY();
  };

  // Sobrescribir cellWidth: 'auto' por defecto dentro de styles para nunca expandir fuera de contentWidth
  const runPdfTable = (options: Parameters<typeof autoTable>[1]) => {
    const cleanRows = (rows: unknown): string[][] | undefined => {
      if (!Array.isArray(rows)) return undefined;
      return rows.map((row) =>
        Array.isArray(row) ? row.map((cell) => sanitizePdfText(cell)) : [sanitizePdfText(row)],
      );
    };

    autoTable(doc, {
      ...options,
      margin: safeTableMargin,
      tableWidth: contentWidth,
      styles: {
        overflow: 'linebreak',
        cellWidth: 'auto',
        valign: 'top',
        ...(options.styles || {}),
      },
      head: cleanRows(options.head),
      body: cleanRows(options.body) || [],
    });
    currentY = getLastAutoTableY();
  };
  void runBoundedTable;

  // ALERTA ROJA SUPERIOR DE GRAVEDAD EVALUADA (ARRIBA DEL TÍTULO PRINCIPAL DEL INFORME)
  const topStudy = prioritized[0];
  const topSeverity: RiskSeverity = topStudy?.result.severity || 'bajo';
  const isCriticalOrHigh =
    trafficSummary.immediateAlerts.length > 0 ||
    trafficSummary.redCount > 0 ||
    topSeverity === 'muy_alto' ||
    topSeverity === 'alto';
  const isModerate = !isCriticalOrHigh && (trafficSummary.amberCount > 0 || topSeverity === 'moderado');

  const topAlertHeaderText = isCriticalOrHigh
    ? `ALERTA CRÍTICA DE RIESGO ERGONÓMICO - GRAVEDAD: ${(topStudy?.result.riskLabel || 'MUY ALTA / ALTA').toUpperCase()} (ACCIÓN INMEDIATA)`
    : isModerate
      ? `ALERTA PREVENTIVA DE GRAVEDAD ERGONÓMICA - NIVEL: ${(topStudy?.result.riskLabel || 'MODERADO').toUpperCase()}`
      : 'ESTADO ERGONÓMICO DEL PUESTO EVALUADO - GRAVEDAD BAJA / RIESGO CONTROLADO';

  const topAlertSummaryText = isCriticalOrHigh
    ? [
        topStudy
          ? `Hallazgo de mayor gravedad: ${topStudy.tab.tabLabel} -> ${topStudy.result.primaryScoreText} (${topStudy.result.riskLabel} - ${topStudy.result.actionLevelText}).`
          : '',
        trafficSummary.immediateAlerts.length > 0
          ? `Indicadores críticos fuera de norma (${trafficSummary.immediateAlerts.length} en Semáforo Rojo): ${trafficSummary.immediateAlerts
              .slice(0, 3)
              .map((a) => `${a.indicator} [${a.measuredValue}]`)
              .join(' | ')}. Plazo de intervención exigido: ${topStudy?.tab.implementationDeadline || 'Inmediato'}.`
          : 'Se superan los umbrales admisibles de carga biomecánica; se requiere rediseño técnico prioritario del puesto.',
      ]
        .filter(Boolean)
        .join('\n')
    : isModerate
      ? `Gravedad máxima relevada: ${topStudy?.result.primaryScoreText || 'Moderada'} (${topStudy?.result.riskLabel || 'Riesgo Moderado'}). Se registran ${trafficSummary.amberCount} indicador(es) en Semáforo Ámbar que requieren mejoras programadas en ingeniería u organización.`
      : 'Todos los factores biomecánicos y métodos normativos evaluados se encuentran dentro de rangos seguros (Semáforo Verde).';

  runPdfTable({
    startY: currentY,
    theme: 'grid',
    columnStyles: { 0: { cellWidth: contentWidth } },
    headStyles: {
      fillColor: isCriticalOrHigh || isModerate ? [185, 28, 28] : [21, 128, 61],
      textColor: [255, 255, 255],
      fontSize: 8.6,
      fontStyle: 'bold',
      cellPadding: 2.2,
    },
    bodyStyles: {
      fillColor: isCriticalOrHigh || isModerate ? [254, 226, 226] : [240, 253, 244],
      textColor: isCriticalOrHigh || isModerate ? [127, 29, 29] : [20, 83, 45],
      fontSize: 8.0,
      fontStyle: 'bold',
      cellPadding: 2.3,
      lineColor: isCriticalOrHigh || isModerate ? [220, 38, 38] : [134, 239, 172],
      lineWidth: 0.35,
    },
    head: [[topAlertHeaderText]],
    body: [[topAlertSummaryText]],
  });

  // SECCIÓN 1: IDENTIFICACIÓN INSTITUCIONAL Y DEL EVALUADOR
  ensureSpace(22);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.2);
  doc.setTextColor(15, 23, 42);
  doc.text(
    sanitizePdfText('INFORME TÉCNICO DE EVALUACIÓN ERGONÓMICA DE PUESTO DE TRABAJO'),
    margin,
    currentY,
  );
  currentY += 5.2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.6);
  doc.setTextColor(71, 85, 105);
  doc.text(
    sanitizePdfText(
      'Desarrollado conforme a metodologías ergonómicas validadas (Capítulos 4 a 10 - Protocolo de Evaluación Integral)',
    ),
    margin,
    currentY,
  );
  currentY += 4.2;

  runPdfTable({
    startY: currentY,
    theme: 'grid',
    columnStyles: {
      0: { cellWidth: contentWidth / 2 },
      1: { cellWidth: contentWidth / 2 },
    },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.4, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.1, textColor: [30, 41, 59], cellPadding: 2.2 },
    head: [['1. DATOS DE LA EMPRESA EVALUADA', '2. DATOS DEL PROFESIONAL EVALUADOR']],
    body: [
      [
        `Razón Social: ${general.companyName || '-'}\nCUIT / ID Fiscal: ${general.companyTaxId || '-'}\nActividad: ${general.companyActivity || '-'}\nDomicilio: ${general.companyAddress || '-'}\nDotación Total: ${general.companyTotalWorkers} trabajadores`,
        `Evaluador: ${general.evaluatorName || '-'}\nTítulo: ${general.evaluatorTitle || '-'}\nMatrícula: ${general.evaluatorLicense || '-'}\nRegistro Ergonomía: ${general.evaluatorRegistry || '-'}\nRelevamiento: ${general.evaluationDate} | Emisión: ${general.reportDate}`,
      ],
    ],
  });

  // ADVERTENCIA DE RESPONSABILIDAD PROFESIONAL Y COPYRIGHT
  runPdfTable({
    startY: currentY,
    theme: 'plain',
    columnStyles: { 0: { cellWidth: contentWidth } },
    styles: {
      fillColor: [248, 250, 252],
      textColor: [71, 85, 105],
      fontSize: 6.9,
      cellPadding: 2,
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
    },
    body: [
      [
        `AVISO DE RESPONSABILIDAD TÉCNICA Y COPYRIGHT:\n${PROFESSIONAL_DISCLAIMER_TEXT}\n© Mauricio Alejandro Pizarro Muñoz - Software ErgoEval. Todos los derechos reservados.`,
      ],
    ],
  });

  // SECCIÓN 2: DESCRIPCIÓN DEL PUESTO Y PELIGROS IDENTIFICADOS
  const activeHazardsList = [
    general.hazardsIdentified.manipulacion_cargas ? 'Manipulación Manual de Cargas' : null,
    general.hazardsIdentified.movimientos_repetitivos ? 'Movimientos Repetitivos MMSS' : null,
    general.hazardsIdentified.posturas_forzadas ? 'Posturas Forzadas / Estáticas' : null,
    general.hazardsIdentified.vibraciones ? 'Vibraciones Mecánicas' : null,
    general.hazardsIdentified.ambiente_termico ? 'Ambiente Térmico' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  runPdfTable({
    startY: currentY,
    theme: 'grid',
    headStyles: { fillColor: [2, 132, 199], textColor: 255, fontSize: 8.4, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.1, textColor: [30, 41, 59], cellPadding: 2.2 },
    head: [['3. DESCRIPCIÓN TÉCNICA DEL PUESTO', 'DETALLE RELEVADO']],
    columnStyles: {
      0: { cellWidth: 50, fontStyle: 'bold' },
      1: { cellWidth: contentWidth - 50 },
    },
    body: [
      ['Puesto de Trabajo', `${general.workstationName || '-'} (Sector: ${general.department || '-'})`],
      [
        'Personal y Jornada',
        `${general.exposedWorkersCount} trabajador(es) expuesto(s) · Jornada: ${general.shiftDurationHours} h/día · Supervisor: ${general.supervisorName || '-'}`,
      ],
      ['Turnos y Pausas', general.workScheduleAndBreaks || '-'],
      ['Descripción del Puesto', general.workstationDescription || '-'],
      ['Tareas del Ciclo', general.mainTasks || '-'],
      ['Equipos y Mobiliario', general.equipmentAndFurniture || '-'],
      [
        'Antecedentes / Lesiones',
        general.previousInjuriesOrSymptoms
          ? `SÍ - ${general.previousInjuriesDetail || 'Sintomatología osteomuscular registrada'}`
          : 'Sin antecedentes de lesiones o manifestaciones clínicas reportadas',
      ],
      ['Factores Identificados (Paso 1)', activeHazardsList || 'Evaluación preventiva general'],
    ],
  });

  // SECCIÓN 3: ALERTA DE ATENCIÓN INMEDIATA + TABLA SEMÁFORO DE COLORES
  ensureSpace(42);
  if (trafficSummary.immediateAlerts.length > 0) {
    runPdfTable({
      startY: currentY,
      theme: 'grid',
      columnStyles: { 0: { cellWidth: contentWidth } },
      headStyles: {
        fillColor: [185, 28, 28],
        textColor: [255, 255, 255],
        fontSize: 8.6,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fillColor: [254, 242, 242],
        textColor: [127, 29, 29],
        fontSize: 8.0,
        cellPadding: 2.2,
        lineColor: [252, 165, 165],
      },
      head: [
        [
          `ALERTA ERGONÓMICA DE ATENCIÓN INMEDIATA - ${trafficSummary.immediateAlerts.length} HALLAZGO(S) EN ZONA CRÍTICA (SEMÁFORO ROJO)`,
        ],
      ],
      body: trafficSummary.immediateAlerts.map((al, idx) => [
        `${idx + 1}. ${al.indicator} - Medido: ${al.measuredValue} (Límite normativo: ${al.normativeThreshold}).\nAcción inmediata requerida (${al.deadline}): ${al.actionRequired}`,
      ]),
    });
  } else {
    const isAmber = trafficSummary.amberCount > 0;
    runPdfTable({
      startY: currentY,
      theme: 'grid',
      columnStyles: { 0: { cellWidth: contentWidth } },
      headStyles: {
        fillColor: isAmber ? [180, 83, 9] : [21, 128, 61],
        textColor: [255, 255, 255],
        fontSize: 8.4,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fillColor: isAmber ? [254, 252, 232] : [240, 253, 244],
        textColor: isAmber ? [120, 53, 15] : [20, 83, 45],
        fontSize: 8.0,
        cellPadding: 2.2,
      },
      head: [
        [
          isAmber
            ? `AVISO PREVENTIVO - SIN ALERTAS ROJAS INMEDIATAS (${trafficSummary.amberCount} INDICADOR(ES) EN ÁMBAR)`
            : 'ESTADO DE CONTROL ERGONÓMICO - SIN ALERTAS DE ATENCIÓN INMEDIATA (TODOS LOS INDICADORES EN VERDE)',
        ],
      ],
      body: [
        [
          isAmber
            ? 'No se detectan exposiciones intolerables de acción inmediata, pero existen condiciones en nivel ÁMBAR que requieren ajustes programados de ingeniería u organización.'
            : 'La totalidad de los métodos y parámetros biomecánicos evaluados se mantiene dentro de los umbrales ergonómicos aceptables.',
        ],
      ],
    });
  }

  ensureSpace(44);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(
    sanitizePdfText(
      `4. TABLA SEMÁFORO DE CONTROL ERGONÓMICO (Rojo: ${trafficSummary.redCount} · Ámbar: ${trafficSummary.amberCount} · Verde: ${trafficSummary.greenCount})`,
    ),
    margin,
    currentY,
  );
  currentY += 3.5;

  runPdfTable({
    startY: currentY,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 7.7, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59], cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 26, fontStyle: 'bold' },
      1: { cellWidth: 42 },
      2: { cellWidth: 32, fontStyle: 'bold' },
      3: { cellWidth: 28 },
      4: { cellWidth: contentWidth - 128 },
    },
    head: [['Semáforo', 'Dimensión / Método', 'Valor Medido', 'Límite Normativo', 'Acción Requerida y Plazo']],
    body: trafficSummary.rows.map((r) => [
      `    ${r.shortBadge}`,
      `${r.indicator}\n${r.contextLabel}`,
      r.measuredValue,
      r.normativeThreshold,
      `${r.actionRequired} (${r.deadline})`,
    ]),
    didParseCell: (hookData) => {
      if (hookData.section === 'body' && hookData.column.index === 0) {
        const rowData = trafficSummary.rows[hookData.row.index];
        if (rowData) {
          const pal = trafficLightPalette(rowData.color);
          hookData.cell.styles.fillColor = pal.fillRgb;
          hookData.cell.styles.textColor = pal.textRgb;
        }
      }
    },
    didDrawCell: (hookData) => {
      if (hookData.section === 'body' && hookData.column.index === 0) {
        const rowData = trafficSummary.rows[hookData.row.index];
        if (rowData) {
          const pal = trafficLightPalette(rowData.color);
          doc.setFillColor(pal.dotRgb[0], pal.dotRgb[1], pal.dotRgb[2]);
          doc.circle(hookData.cell.x + 3.4, hookData.cell.y + hookData.cell.height / 2, 1.4, 'F');
        }
      }
    },
  });

  // SECCIÓN 4: RESUMEN EJECUTIVO Y TABLA DE PRIORIZACIÓN (CAPÍTULO 10)
  ensureSpace(42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(
    sanitizePdfText('5. RESUMEN EJECUTIVO Y JERARQUIZACIÓN BIOMECÁNICA DE INTERVENCIONES'),
    margin,
    currentY,
  );
  currentY += 3.5;

  runPdfTable({
    startY: currentY,
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7.7, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7.6, textColor: [30, 41, 59], cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 15, fontStyle: 'bold' },
      1: { cellWidth: 50 },
      2: { cellWidth: 29 },
      3: { cellWidth: 34, fontStyle: 'bold' },
      4: { cellWidth: 28 },
      5: { cellWidth: contentWidth - 156 },
    },
    head: [['Prior.', 'Pestaña / Subtarea', 'Método', 'Resultado', 'Nivel de Riesgo', 'Plazo Propuesto']],
    body: prioritized.map((p) => [
      `#${p.rank}`,
      `${p.tab.tabLabel}\n${p.tab.taskEvaluated || ''}`,
      METHOD_CATALOG.find((m) => m.id === p.tab.method)?.shortName || p.tab.method,
      p.result.primaryScoreText,
      p.result.riskLabel,
      p.tab.implementationDeadline,
    ]),
  });

  // Síntesis ejecutiva escrita con control estricto de salto de página por párrafo
  const execParagraphs = sanitizePdfText(executiveSummary)
    .split('\n\n')
    .filter((p) => p.trim().length > 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  for (const para of execParagraphs) {
    const lines = doc.splitTextToSize(para.trim(), contentWidth - 4);
    const blockH = lines.length * 4.1 + 3;
    ensureSpace(blockH);
    doc.text(lines, margin + 1, currentY + 3);
    currentY += blockH;
  }
  currentY += 3;

  // SECCIÓN 5: DESARROLLO DETALLADO PESTAÑA POR PESTAÑA
  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    const pEntry = prioritized.find((p) => p.tab.id === tab.id)!;
    const res = pEntry.result;
    const catalog = METHOD_CATALOG.find((m) => m.id === tab.method)!;
    const sevColor = severityBadgeColors(res.severity);
    const trajectoryNote = getTabTrajectoryClarification(tab);

    doc.addPage();
    currentY = pageTopY + 2;

    // Título de pestaña
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, currentY - 4, contentWidth, 14, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.2);
    doc.setTextColor(15, 23, 42);
    const studyTitleLine = doc.splitTextToSize(
      sanitizePdfText(`ESTUDIO ${i + 1} DE ${tabs.length}: ${tab.tabLabel.toUpperCase()}`),
      contentWidth - 6,
    )[0];
    doc.text(studyTitleLine, margin + 3, currentY + 1.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(71, 85, 105);
    const studySubtitleLine = doc.splitTextToSize(
      sanitizePdfText(`${catalog.fullName} (${catalog.chapterRef})`),
      contentWidth - 6,
    )[0];
    doc.text(studySubtitleLine, margin + 3, currentY + 7);
    currentY += 14;

    const summaryBodyRows: string[][] = [
      ['Subtarea Evaluada', tab.taskEvaluated || 'Ciclo operativo del puesto'],
      ['Justificación del Método', catalog.justificationTemplate],
      ['Instrumental / Relevamiento', tab.instrumentsUsed || 'Observación directa y medición angular'],
      [
        'Formulación Aplicada',
        `${getMethodFormulaProfile(tab.method).expressions.map((e) => `${e.symbol} = ${e.expression}`).join(' | ')}${
          isMethodFormulaModified(tab.method) ? ' (Fórmula personalizada activa)' : ''
        }`,
      ],
      [
        'Resultado Principal',
        `${res.primaryScoreText}${res.secondaryScoreText ? ` (${res.secondaryScoreText})` : ''}`,
      ],
      ['Nivel de Riesgo y Acción', `${res.riskLabel.toUpperCase()} - ${res.actionLevelText}`],
    ];

    if (trajectoryNote) {
      summaryBodyRows.push(['Sentido Origen <-> Destino', trajectoryNote]);
    }

    // Ficha resumen de la pestaña
    runPdfTable({
      startY: currentY,
      theme: 'grid',
      bodyStyles: { fontSize: 8.1, textColor: [30, 41, 59], cellPadding: 2.1 },
      columnStyles: {
        0: { cellWidth: 48, fontStyle: 'bold', fillColor: [248, 250, 252] },
        1: { cellWidth: contentWidth - 48 },
      },
      body: summaryBodyRows,
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.row.index === 5 && hookData.column.index === 1) {
          hookData.cell.styles.textColor = sevColor.rgb;
          hookData.cell.styles.fontStyle = 'bold';
        }
      },
    });

    // Tabla de desglose técnico de variables y fórmulas con anchos estrictos por columna
    runPdfTable({
      startY: currentY,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.0, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.8, textColor: [30, 41, 59], cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 60, fontStyle: 'bold' },
        1: { cellWidth: 42 },
        2: { cellWidth: contentWidth - 102 },
      },
      head: [['Parámetro / Factor del Método', 'Valor Calculado', 'Referencia / Criterio Normativo']],
      body: res.breakdownRows.map((r) => [r.parameter, r.value, r.reference || '-']),
    });

    // Si el método tiene tabla de datos cargada (OWAS, WBGT multizona, ISO 2631, ISO 5349)
    const seriesTable = extractRawSeriesRows(tab);
    if (seriesTable && seriesTable.rows.length > 0) {
      ensureSpace(30);
      const colCount = Math.max(1, seriesTable.headers.length);
      const eachW = contentWidth / colCount;
      const dynCols: Record<number, { cellWidth: number }> = {};
      for (let c = 0; c < colCount; c++) {
        dynCols[c] = { cellWidth: eachW };
      }
      runPdfTable({
        startY: currentY,
        theme: 'grid',
        columnStyles: dynCols,
        headStyles: { fillColor: [51, 65, 85], textColor: 255, fontSize: 7.6, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59], cellPadding: 1.8 },
        head: [seriesTable.headers],
        body: seriesTable.rows,
      });
    }

    // Fotografías y Reconstrucciones 3D en grilla enmarcada de 2 columnas SIN SOLAPAMIENTO
    if (tab.photos.length > 0) {
      const preparedPhotos: Array<{
        asset: NormalizedImageAsset;
        fullCaption: string;
      }> = [];

      for (const photo of tab.photos) {
        const asset = await normalizeDataUrlToPng(photo.annotatedDataUrl || photo.dataUrl, 900);
        if (!asset) continue;
        const angleSummary =
          photo.annotations.length > 0
            ? ` | Ángulos medidos: ${photo.annotations.map((a) => `${a.label}: ${a.degrees}°`).join(', ')}`
            : '';
        preparedPhotos.push({
          asset,
          fullCaption: sanitizePdfText(`${photo.caption}${angleSummary}`),
        });
      }

      if (preparedPhotos.length > 0) {
        ensureSpace(78);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.2);
        doc.setTextColor(15, 23, 42);
        doc.text(
          sanitizePdfText('Registro Fotográfico, Fotogramas Críticos y Modelización 3D:'),
          margin,
          currentY,
        );
        currentY += 4;

        const gapMm = 5;
        const isSingleTotal = preparedPhotos.length === 1;
        const colW = isSingleTotal ? Math.min(126, contentWidth) : (contentWidth - gapMm) / 2;
        const imgBoxH = 54;

        for (let pIdx = 0; pIdx < preparedPhotos.length; pIdx += isSingleTotal ? 1 : 2) {
          const rowItems = isSingleTotal
            ? [preparedPhotos[pIdx]]
            : preparedPhotos.slice(pIdx, pIdx + 2);

          doc.setFont('helvetica', 'italic');
          doc.setFontSize(7.4);
          const captionLinesList = rowItems.map((item) =>
            doc.splitTextToSize(item.fullCaption, colW - 6),
          );
          const maxCaptionLines = Math.max(...captionLinesList.map((lines) => lines.length), 1);
          const cardH = imgBoxH + 5 + maxCaptionLines * 3.4 + 3.5;

          ensureSpace(cardH + 5);

          rowItems.forEach((item, colOffset) => {
            const cardX = isSingleTotal
              ? margin + (contentWidth - colW) / 2
              : margin + colOffset * (colW + gapMm);

            doc.setDrawColor(203, 213, 225);
            doc.setFillColor(248, 250, 252);
            doc.rect(cardX, currentY, colW, cardH, 'FD');

            const innerX = cardX + 2.5;
            const innerY = currentY + 2.5;
            const innerW = colW - 5;
            const innerH = imgBoxH - 2;
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(226, 232, 240);
            doc.rect(innerX, innerY, innerW, innerH, 'FD');

            const fitRatio = Math.min(
              (innerW - 2) / Math.max(1, item.asset.widthPx),
              (innerH - 2) / Math.max(1, item.asset.heightPx),
            );
            const drawW = item.asset.widthPx * fitRatio;
            const drawH = item.asset.heightPx * fitRatio;
            const drawX = innerX + (innerW - drawW) / 2;
            const drawY = innerY + (innerH - drawH) / 2;

            doc.addImage(item.asset.pngDataUrl, 'PNG', drawX, drawY, drawW, drawH);

            doc.setFont('helvetica', 'italic');
            doc.setFontSize(7.4);
            doc.setTextColor(51, 65, 85);
            doc.text(captionLinesList[colOffset], cardX + 3, currentY + imgBoxH + 4.5);
          });

          currentY += cardH + 5;
        }
      }
    }

    // CIERRE DE HOJA: OBSERVACIONES DEL EVALUADOR Y MEDIDAS CORRECTIVAS
    ensureSpace(42);
    const obsText =
      tab.evaluatorObservations.trim() ||
      `${res.interpretation} (Sin observaciones adicionales consignadas manualmente por el evaluador).`;
    const measuresText =
      tab.correctiveMeasures.trim() || res.suggestedMeasures.map((s, idx) => `${idx + 1}. ${s}`).join('\n');

    runPdfTable({
      startY: currentY,
      theme: 'grid',
      columnStyles: { 0: { cellWidth: contentWidth } },
      headStyles: { fillColor: [2, 132, 199], textColor: 255, fontSize: 8.4, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8.1, textColor: [15, 23, 42], cellPadding: 2.4 },
      head: [['OBSERVACIONES DEL EVALUADOR Y PLAN DE ACCIÓN DE LA HOJA']],
      body: [
        [`Observaciones del Evaluador:\n${obsText}`],
        [`Medidas Correctivas Propuestas:\n${measuresText}`],
        [
          `Responsable Designado: ${tab.responsiblePerson || '-'} | Plazo de Implementación: ${tab.implementationDeadline} | Orden de Prioridad Global: #${pEntry.rank}`,
        ],
      ],
    });
  }

  // FIRMA PROFESIONAL AL FINAL DEL ÚLTIMO FOLIO
  ensureSpace(36);
  currentY += 6;
  doc.setDrawColor(100, 116, 139);
  doc.line(pageWidth - margin - 72, currentY + 14, pageWidth - margin, currentY + 14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(
    sanitizePdfText(general.evaluatorName || 'Firma del Profesional Evaluador'),
    pageWidth - margin - 36,
    currentY + 19,
    { align: 'center' },
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    sanitizePdfText(
      `${general.evaluatorTitle || ''} ${general.evaluatorLicense ? `· ${general.evaluatorLicense}` : ''}`,
    ),
    pageWidth - margin - 36,
    currentY + 23.5,
    { align: 'center' },
  );
  doc.text(
    sanitizePdfText(`Próxima Reevaluación Sugerida: ${general.nextReevaluationDate || 'Anual'}`),
    margin,
    currentY + 19,
  );

  // Numeración y encabezado institucional en todas las páginas
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, 10, contentWidth, 18, 'FD');

    if (logoAsset) {
      const ratio = Math.min(26 / logoAsset.widthPx, 13 / logoAsset.heightPx);
      doc.addImage(
        logoAsset.pngDataUrl,
        'PNG',
        margin + 2.5,
        12.5,
        logoAsset.widthPx * ratio,
        logoAsset.heightPx * ratio,
      );
    }

    const textStartX = logoAsset ? margin + 32 : margin + 3;
    const maxLeftHeaderW = Math.max(60, pageWidth - margin - 38 - textStartX);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.4);
    doc.setTextColor(15, 23, 42);
    const headerCompanyLine = doc.splitTextToSize(
      sanitizePdfText(general.companyName || 'ESTUDIO ERGONÓMICO INTEGRAL'),
      maxLeftHeaderW,
    )[0];
    doc.text(headerCompanyLine, textStartX, 15.8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(71, 85, 105);
    const headerWorkstationLine = doc.splitTextToSize(
      sanitizePdfText(`Puesto: ${general.workstationName || '-'} · Sector: ${general.department || '-'}`),
      maxLeftHeaderW,
    )[0];
    const headerEvaluatorLine = doc.splitTextToSize(
      sanitizePdfText(`Evaluador: ${general.evaluatorName || '-'}`),
      maxLeftHeaderW,
    )[0];
    doc.text(headerWorkstationLine, textStartX, 20.8);
    doc.text(headerEvaluatorLine, textStartX, 25.2);

    doc.setFont('helvetica', 'bold');
    doc.text(`Hoja ${p} de ${totalPages}`, pageWidth - margin - 3, 15.8, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(sanitizePdfText(`Fecha: ${general.reportDate}`), pageWidth - margin - 3, 20.8, {
      align: 'right',
    });

    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      sanitizePdfText(
        '© Mauricio Alejandro Pizarro Muñoz · ErgoEval · Herramienta técnica para uso exclusivo de profesionales calificados',
      ),
      margin,
      pageHeight - 7.5,
    );
    doc.text(`Hoja ${p} de ${totalPages}`, pageWidth - margin, pageHeight - 7.5, { align: 'right' });
  }

  doc.save(getSafeFilename(general, 'pdf'));
}

// ============================================================================
// 2. EXPORTACIÓN A WORD EDITABLE DETALLADO (.DOCX)
// ============================================================================
function createCell(
  text: string,
  opts?: { bold?: boolean; fillHex?: string; colorHex?: string; widthPct?: number },
): TableCell {
  const lines = text.split('\n');
  return new TableCell({
    width: opts?.widthPct ? { size: opts.widthPct, type: WidthType.PERCENTAGE } : undefined,
    shading: opts?.fillHex
      ? { type: ShadingType.CLEAR, color: 'auto', fill: opts.fillHex }
      : undefined,
    margins: { top: 90, bottom: 90, left: 130, right: 130 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
    },
    children: lines.map(
      (line) =>
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({
              text: line,
              bold: opts?.bold,
              color: opts?.colorHex || '1E293B',
              size: 19,
              font: 'Calibri',
            }),
          ],
        }),
    ),
  });
}

export async function exportStudyToWord(general: GeneralStudyData, tabs: StudyTab[]): Promise<void> {
  const prioritized = buildPrioritizedStudies(general, tabs);
  const trafficSummary = buildStudyTrafficLightMatrix(general, tabs);
  const executiveSummary =
    general.customGlobalConclusion.trim() || generateAutomaticExecutiveSynthesis(general, prioritized);

  const docChildren: (Paragraph | Table)[] = [];

  const topWordStudy = prioritized[0];
  const topWordSev: RiskSeverity = topWordStudy?.result.severity || 'bajo';
  const wordRedOrAmber =
    trafficSummary.immediateAlerts.length > 0 ||
    trafficSummary.redCount > 0 ||
    trafficSummary.amberCount > 0 ||
    topWordSev !== 'bajo';

  docChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createCell(
              wordRedOrAmber
                ? `ALERTA DE GRAVEDAD ERGONÓMICA DEL PUESTO EVALUADO: ${(topWordStudy?.result.riskLabel || 'CRÍTICA / ALTA').toUpperCase()} (${trafficSummary.redCount} indicador(es) en Rojo · ${trafficSummary.amberCount} en Ámbar)`
                : 'ESTADO ERGONÓMICO DEL PUESTO EVALUADO: GRAVEDAD BAJA / RIESGO CONTROLADO',
              {
                bold: true,
                fillHex: wordRedOrAmber ? 'B91C1C' : '15803D',
                colorHex: 'FFFFFF',
              },
            ),
          ],
        }),
        new TableRow({
          children: [
            createCell(
              topWordStudy
                ? `Hallazgo principal: ${topWordStudy.tab.tabLabel} — ${topWordStudy.result.primaryScoreText} (${topWordStudy.result.actionLevelText}). Plazo requerido: ${topWordStudy.tab.implementationDeadline}.`
                : 'Todos los parámetros evaluados se encuentran dentro de umbrales admisibles.',
              {
                bold: true,
                fillHex: wordRedOrAmber ? 'FEE2E2' : 'DCFCE7',
                colorHex: wordRedOrAmber ? '7F1D1D' : '166534',
              },
            ),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 140 }, children: [] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: 'INFORME TÉCNICO DE EVALUACIÓN ERGONÓMICA DE PUESTO DE TRABAJO',
          bold: true,
          size: 28,
          color: '0F172A',
          font: 'Calibri',
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 180 },
      children: [
        new TextRun({
          text: `Empresa: ${general.companyName || '—'}  |  Puesto: ${general.workstationName || '—'}  |  Fecha de Informe: ${general.reportDate}`,
          size: 20,
          color: '475569',
          font: 'Calibri',
        }),
      ],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createCell(
              `AVISO Y DESCARGO DE RESPONSABILIDAD PROFESIONAL:\n${PROFESSIONAL_DISCLAIMER_TEXT}\n\n© Mauricio Alejandro Pizarro Muñoz — Software ErgoEval. Todos los derechos reservados.`,
              { fillHex: 'F8FAFC', colorHex: '334155' },
            ),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 140 }, children: [] }),
  );

  // Tabla 1: Empresa, Evaluador y Puesto
  docChildren.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 140, after: 100 },
      children: [
        new TextRun({
          text: '1. Datos de la Empresa, del Evaluador y del Puesto de Trabajo',
          bold: true,
          size: 23,
          color: '0284C7',
          font: 'Calibri',
        }),
      ],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createCell('Campo Institucional / Técnico', { bold: true, fillHex: '0F172A', colorHex: 'FFFFFF', widthPct: 32 }),
            createCell('Información Registrada', { bold: true, fillHex: '0F172A', colorHex: 'FFFFFF', widthPct: 68 }),
          ],
        }),
        new TableRow({
          children: [
            createCell('Razón Social y CUIT', { bold: true, fillHex: 'F8FAFC' }),
            createCell(`${general.companyName || '—'} (CUIT: ${general.companyTaxId || '—'})`),
          ],
        }),
        new TableRow({
          children: [
            createCell('Actividad y Domicilio', { bold: true, fillHex: 'F8FAFC' }),
            createCell(`${general.companyActivity || '—'} — ${general.companyAddress || '—'} (Dotación: ${general.companyTotalWorkers})`),
          ],
        }),
        new TableRow({
          children: [
            createCell('Profesional Evaluador', { bold: true, fillHex: 'F8FAFC' }),
            createCell(
              `${general.evaluatorName || '—'} · ${general.evaluatorTitle || '—'}\n${general.evaluatorLicense || ''} ${general.evaluatorRegistry ? `| ${general.evaluatorRegistry}` : ''}`,
            ),
          ],
        }),
        new TableRow({
          children: [
            createCell('Fechas del Estudio', { bold: true, fillHex: 'F8FAFC' }),
            createCell(
              `Relevamiento: ${general.evaluationDate}  |  Emisión: ${general.reportDate}  |  Próxima Reevaluación: ${general.nextReevaluationDate}`,
            ),
          ],
        }),
        new TableRow({
          children: [
            createCell('Puesto y Sector Evaluado', { bold: true, fillHex: 'F8FAFC' }),
            createCell(
              `${general.workstationName || '—'} (Sector: ${general.department || '—'} · Supervisor: ${general.supervisorName || '—'})`,
            ),
          ],
        }),
        new TableRow({
          children: [
            createCell('Expuestos y Jornada', { bold: true, fillHex: 'F8FAFC' }),
            createCell(
              `${general.exposedWorkersCount} trabajador(es) expuesto(s) · ${general.shiftDurationHours} h diarias\nRégimen de pausas: ${general.workScheduleAndBreaks || '—'}`,
            ),
          ],
        }),
        new TableRow({
          children: [
            createCell('Descripción y Tareas del Ciclo', { bold: true, fillHex: 'F8FAFC' }),
            createCell(`${general.workstationDescription || '—'}\nTareas: ${general.mainTasks || '—'}`),
          ],
        }),
        new TableRow({
          children: [
            createCell('Equipos, Cargas y Mobiliario', { bold: true, fillHex: 'F8FAFC' }),
            createCell(general.equipmentAndFurniture || '—'),
          ],
        }),
        new TableRow({
          children: [
            createCell('Antecedentes Osteomusculares', { bold: true, fillHex: 'F8FAFC' }),
            createCell(
              general.previousInjuriesOrSymptoms
                ? `Sí — ${general.previousInjuriesDetail || 'Reportados en el sector'}`
                : 'No se registran antecedentes clínicos previos en el puesto',
            ),
          ],
        }),
      ],
    }),
  );

  // Tabla 2: Alerta de Atención Inmediata y Semáforo de Colores
  docChildren.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 100 },
      children: [
        new TextRun({
          text: '2. Alerta de Atención Inmediata y Tabla Semáforo de Control Ergonómico',
          bold: true,
          size: 23,
          color: trafficSummary.immediateAlerts.length > 0 ? 'B91C1C' : '0284C7',
          font: 'Calibri',
        }),
      ],
    }),
  );

  if (trafficSummary.immediateAlerts.length > 0) {
    docChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              createCell(
                `ALERTA ERGONÓMICA DE ATENCIÓN INMEDIATA (${trafficSummary.immediateAlerts.length} HALLAZGO(S) EN SEMÁFORO ROJO)`,
                { bold: true, fillHex: 'B91C1C', colorHex: 'FFFFFF' },
              ),
            ],
          }),
          ...trafficSummary.immediateAlerts.map((al, idx) =>
            new TableRow({
              children: [
                createCell(
                  `${idx + 1}. ${al.indicator} — Medido: ${al.measuredValue} (Umbral: ${al.normativeThreshold})\nAcción requerida (${al.deadline}): ${al.actionRequired}`,
                  { fillHex: 'FEF2F2', colorHex: '7F1D1D', bold: idx === 0 },
                ),
              ],
            }),
          ),
        ],
      }),
      new Paragraph({ spacing: { after: 120 }, children: [] }),
    );
  }

  docChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createCell('Semáforo', { bold: true, fillHex: '0F172A', colorHex: 'FFFFFF', widthPct: 16 }),
            createCell('Indicador / Método', { bold: true, fillHex: '0F172A', colorHex: 'FFFFFF', widthPct: 24 }),
            createCell('Valor Medido', { bold: true, fillHex: '0F172A', colorHex: 'FFFFFF', widthPct: 20 }),
            createCell('Límite Normativo', { bold: true, fillHex: '0F172A', colorHex: 'FFFFFF', widthPct: 16 }),
            createCell('Acción Requerida y Plazo', { bold: true, fillHex: '0F172A', colorHex: 'FFFFFF', widthPct: 24 }),
          ],
        }),
        ...trafficSummary.rows.map((r) => {
          const pal = trafficLightPalette(r.color);
          return new TableRow({
            children: [
              createCell(`● ${r.shortBadge}`, { bold: true, fillHex: pal.hexFill, colorHex: pal.hexText }),
              createCell(`${r.indicator}\n${r.contextLabel}`),
              createCell(r.measuredValue, { bold: true }),
              createCell(r.normativeThreshold),
              createCell(`${r.actionRequired} (${r.deadline})`),
            ],
          });
        }),
      ],
    }),
  );

  // Tabla 3: Resumen Ejecutivo y Matriz Priorizada
  docChildren.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 260, after: 100 },
      children: [
        new TextRun({
          text: '3. Resumen Ejecutivo Automático y Priorización de Intervenciones (Cap. 10)',
          bold: true,
          size: 23,
          color: '0284C7',
          font: 'Calibri',
        }),
      ],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createCell('Orden', { bold: true, fillHex: '0F172A', colorHex: 'FFFFFF', widthPct: 8 }),
            createCell('Pestaña / Tarea', { bold: true, fillHex: '0F172A', colorHex: 'FFFFFF', widthPct: 28 }),
            createCell('Método', { bold: true, fillHex: '0F172A', colorHex: 'FFFFFF', widthPct: 18 }),
            createCell('Resultado', { bold: true, fillHex: '0F172A', colorHex: 'FFFFFF', widthPct: 18 }),
            createCell('Nivel de Riesgo', { bold: true, fillHex: '0F172A', colorHex: 'FFFFFF', widthPct: 15 }),
            createCell('Plazo', { bold: true, fillHex: '0F172A', colorHex: 'FFFFFF', widthPct: 13 }),
          ],
        }),
        ...prioritized.map((p) => {
          const sev = severityBadgeColors(p.result.severity);
          return new TableRow({
            children: [
              createCell(`#${p.rank}`, { bold: true }),
              createCell(`${p.tab.tabLabel}\n${p.tab.taskEvaluated || ''}`),
              createCell(METHOD_CATALOG.find((m) => m.id === p.tab.method)?.shortName || p.tab.method),
              createCell(p.result.primaryScoreText, { bold: true }),
              createCell(p.result.riskLabel, { bold: true, fillHex: sev.hexFill, colorHex: sev.hexText }),
              createCell(p.tab.implementationDeadline),
            ],
          });
        }),
      ],
    }),
  );

  executiveSummary.split('\n\n').forEach((para) => {
    docChildren.push(
      new Paragraph({
        spacing: { before: 140, after: 80 },
        children: [new TextRun({ text: para, size: 20, color: '1E293B', font: 'Calibri' })],
      }),
    );
  });

  // SECCIÓN 4: DESARROLLO INDIVIDUAL DE CADA PESTAÑA
  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    const pEntry = prioritized.find((p) => p.tab.id === tab.id)!;
    const res = pEntry.result;
    const catalog = METHOD_CATALOG.find((m) => m.id === tab.method)!;
    const sev = severityBadgeColors(res.severity);
    const trajectoryNote = getTabTrajectoryClarification(tab);

    const studyRows: TableRow[] = [
      new TableRow({
        children: [
          createCell('Resultado Principal', { bold: true, fillHex: 'F8FAFC', widthPct: 30 }),
          createCell(
            `${res.primaryScoreText}${res.secondaryScoreText ? ` (${res.secondaryScoreText})` : ''}`,
            { bold: true, widthPct: 70 },
          ),
        ],
      }),
      new TableRow({
        children: [
          createCell('Valoración y Nivel de Actuación', { bold: true, fillHex: 'F8FAFC' }),
          createCell(`${res.riskLabel.toUpperCase()} — ${res.actionLevelText}`, {
            bold: true,
            fillHex: sev.hexFill,
            colorHex: sev.hexText,
          }),
        ],
      }),
      new TableRow({
        children: [
          createCell('Instrumental y Técnica', { bold: true, fillHex: 'F8FAFC' }),
          createCell(tab.instrumentsUsed || 'Observación directa y medición angular'),
        ],
      }),
      new TableRow({
        children: [
          createCell('Formulación Aplicada', { bold: true, fillHex: 'F8FAFC' }),
          createCell(
            `${getMethodFormulaProfile(tab.method).expressions.map((e) => `${e.symbol} = ${e.expression}`).join('  |  ')}${
              isMethodFormulaModified(tab.method) ? ' (Fórmula personalizada activa)' : ''
            }`,
          ),
        ],
      }),
      new TableRow({
        children: [
          createCell('Interpretación Técnica', { bold: true, fillHex: 'F8FAFC' }),
          createCell(res.interpretation),
        ],
      }),
    ];

    if (trajectoryNote) {
      studyRows.push(
        new TableRow({
          children: [
            createCell('Sentido y Dualidad Origen ↔ Destino', { bold: true, fillHex: 'F0F9FF' }),
            createCell(trajectoryNote),
          ],
        }),
      );
    }

    docChildren.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 100, after: 100 },
        children: [
          new TextRun({
            text: `Estudio ${i + 1}: ${tab.tabLabel} — ${catalog.fullName}`,
            bold: true,
            size: 24,
            color: '0F172A',
            font: 'Calibri',
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 140 },
        children: [
          new TextRun({
            text: `Referencia metodológica: ${catalog.chapterRef}  |  Subtarea evaluada: ${tab.taskEvaluated || 'Ciclo principal'}`,
            italics: true,
            size: 19,
            color: '475569',
            font: 'Calibri',
          }),
        ],
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: studyRows,
      }),
      new Paragraph({
        spacing: { before: 180, after: 80 },
        children: [
          new TextRun({
            text: 'Desglose de Variables, Coeficientes y Desarrollo del Método:',
            bold: true,
            size: 20,
            color: '0F172A',
            font: 'Calibri',
          }),
        ],
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              createCell('Parámetro / Factor', { bold: true, fillHex: '1E293B', colorHex: 'FFFFFF', widthPct: 36 }),
              createCell('Valor Calculado', { bold: true, fillHex: '1E293B', colorHex: 'FFFFFF', widthPct: 28 }),
              createCell('Referencia / Detalle', { bold: true, fillHex: '1E293B', colorHex: 'FFFFFF', widthPct: 36 }),
            ],
          }),
          ...res.breakdownRows.map(
            (r) =>
              new TableRow({
                children: [
                  createCell(r.parameter, { bold: true }),
                  createCell(r.value),
                  createCell(r.reference || '—'),
                ],
              }),
          ),
        ],
      }),
    );

    // Serie de datos cargada si aplica
    const series = extractRawSeriesRows(tab);
    if (series && series.rows.length > 0) {
      docChildren.push(
        new Paragraph({
          spacing: { before: 160, after: 80 },
          children: [
            new TextRun({
              text: 'Serie de Datos y Muestreo Registrado en la Pestaña:',
              bold: true,
              size: 20,
              color: '0F172A',
              font: 'Calibri',
            }),
          ],
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: series.headers.map((h) => createCell(h, { bold: true, fillHex: '334155', colorHex: 'FFFFFF' })),
            }),
            ...series.rows.map(
              (row) =>
                new TableRow({
                  children: row.map((cellVal) => createCell(cellVal)),
                }),
            ),
          ],
        }),
      );
    }

    // Imágenes anotadas con espaciado protegido
    if (tab.photos.length > 0) {
      docChildren.push(
        new Paragraph({
          spacing: { before: 180, after: 80 },
          children: [
            new TextRun({
              text: 'Registro Fotográfico y Modelización 3D:',
              bold: true,
              size: 20,
              color: '0F172A',
              font: 'Calibri',
            }),
          ],
        }),
      );

      for (const photo of tab.photos) {
        const asset = await normalizeDataUrlToPng(photo.annotatedDataUrl || photo.dataUrl, 800);
        if (!asset) continue;
        const maxWidthDocx = 390;
        const maxHeightDocx = 260;
        const scale = Math.min(maxWidthDocx / asset.widthPx, maxHeightDocx / asset.heightPx);

        docChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 120, after: 50 },
            children: [
              new ImageRun({
                data: asset.uint8,
                type: 'png',
                transformation: {
                  width: Math.round(asset.widthPx * scale),
                  height: Math.round(asset.heightPx * scale),
                },
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
            children: [
              new TextRun({
                text: `${photo.caption}${
                  photo.annotations.length > 0
                    ? ` — Ángulos: ${photo.annotations.map((a) => `${a.label}: ${a.degrees}°`).join(', ')}`
                    : ''
                }`,
                italics: true,
                size: 18,
                color: '475569',
                font: 'Calibri',
              }),
            ],
          }),
        );
      }
    }

    // Observaciones del Evaluador al final de cada hoja
    const obsText =
      tab.evaluatorObservations.trim() ||
      `${res.interpretation} (Sin observaciones complementarias consignadas manualmente).`;
    const measuresText =
      tab.correctiveMeasures.trim() || res.suggestedMeasures.map((s, idx) => `${idx + 1}. ${s}`).join('\n');

    docChildren.push(
      new Paragraph({
        spacing: { before: 180, after: 80 },
        children: [
          new TextRun({
            text: 'Observaciones del Evaluador y Plan de Acción de la Hoja:',
            bold: true,
            size: 20,
            color: '0284C7',
            font: 'Calibri',
          }),
        ],
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              createCell('Observaciones del Evaluador', { bold: true, fillHex: 'F0F9FF', widthPct: 28 }),
              createCell(obsText, { widthPct: 72 }),
            ],
          }),
          new TableRow({
            children: [
              createCell('Medidas Correctivas Propuestas', { bold: true, fillHex: 'F0F9FF' }),
              createCell(measuresText),
            ],
          }),
          new TableRow({
            children: [
              createCell('Responsable y Plazo', { bold: true, fillHex: 'F0F9FF' }),
              createCell(
                `Responsable: ${tab.responsiblePerson || '—'}   |   Plazo: ${tab.implementationDeadline}   |   Prioridad Global: #${pEntry.rank}`,
                { bold: true },
              ),
            ],
          }),
        ],
      }),
    );
  }

  // Firma Final del Evaluador
  docChildren.push(
    new Paragraph({
      spacing: { before: 420, after: 60 },
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({
          text: '______________________________________________',
          color: '64748B',
          size: 20,
          font: 'Calibri',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({
          text: general.evaluatorName || 'Firma del Profesional Evaluador',
          bold: true,
          size: 21,
          color: '0F172A',
          font: 'Calibri',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({
          text: `${general.evaluatorTitle || ''} ${general.evaluatorLicense ? `· ${general.evaluatorLicense}` : ''} ${
            general.evaluatorRegistry ? `· ${general.evaluatorRegistry}` : ''
          }`,
          size: 18,
          color: '475569',
          font: 'Calibri',
        }),
      ],
    }),
    new Paragraph({
      spacing: { before: 240, after: 60 },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: '© Mauricio Alejandro Pizarro Muñoz · ErgoEval · Herramienta desarrollada para uso exclusivo de profesionales calificados.',
          italics: true,
          size: 16,
          color: '64748B',
          font: 'Calibri',
        }),
      ],
    }),
  );

  const wordDoc = new Document({
    sections: [
      {
        properties: {},
        children: docChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(wordDoc);
  triggerBlobDownload(blob, getSafeFilename(general, 'docx'));
}

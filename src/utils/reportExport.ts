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
import {
  buildPrioritizedStudies,
  generateAutomaticExecutiveSynthesis,
} from '../components/SummarySection';

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

// ============================================================================
// 1. EXPORTACIÓN A PDF DETALLADO (jsPDF + jspdf-autotable)
// ============================================================================
export async function exportStudyToPdf(general: GeneralStudyData, tabs: StudyTab[]): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  const prioritized = buildPrioritizedStudies(general, tabs);
  const executiveSummary =
    general.customGlobalConclusion.trim() || generateAutomaticExecutiveSynthesis(general, prioritized);

  const logoAsset = general.companyLogoDataUrl
    ? await normalizeDataUrlToPng(general.companyLogoDataUrl, 320)
    : null;

  let currentY = 36;

  const ensureSpace = (neededMm: number) => {
    if (currentY + neededMm > pageHeight - 18) {
      doc.addPage();
      currentY = 36;
    }
  };

  const getLastAutoTableY = (): number => {
    const anyDoc = doc as unknown as { lastAutoTable?: { finalY?: number } };
    return (anyDoc.lastAutoTable?.finalY ?? currentY) + 6;
  };

  // SECCIÓN 1: IDENTIFICACIÓN INSTITUCIONAL Y DEL EVALUADOR
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('INFORME TÉCNICO DE EVALUACIÓN ERGONÓMICA DE PUESTO DE TRABAJO', margin, currentY);
  currentY += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(
    'Desarrollado conforme a metodologías ergonómicas validadas (Capítulos 4 a 10 — Protocolo de Evaluación Integral)',
    margin,
    currentY,
  );
  currentY += 5;

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59], cellPadding: 2.3 },
    head: [['1. DATOS DE LA EMPRESA EVALUADA', '2. DATOS DEL PROFESIONAL EVALUADOR']],
    body: [
      [
        `Razón Social: ${general.companyName || '—'}\nCUIT / ID Fiscal: ${general.companyTaxId || '—'}\nActividad: ${general.companyActivity || '—'}\nDomicilio: ${general.companyAddress || '—'}\nDotación Total: ${general.companyTotalWorkers} trabajadores`,
        `Evaluador: ${general.evaluatorName || '—'}\nTítulo: ${general.evaluatorTitle || '—'}\nMatrícula: ${general.evaluatorLicense || '—'}\nRegistro Ergonomía: ${general.evaluatorRegistry || '—'}\nRelevamiento: ${general.evaluationDate} | Emisión: ${general.reportDate}`,
      ],
    ],
  });
  currentY = getLastAutoTableY();

  // ADVERTENCIA DE RESPONSABILIDAD PROFESIONAL Y COPYRIGHT
  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: 'plain',
    styles: {
      fillColor: [248, 250, 252],
      textColor: [71, 85, 105],
      fontSize: 7,
      cellPadding: 2,
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
    },
    body: [
      [
        `AVISO DE RESPONSABILIDAD TÉCNICA Y COPYRIGHT:\n${PROFESSIONAL_DISCLAIMER_TEXT}\n© Mauricio Alejandro Pizarro Muñoz — Software ErgoEval. Todos los derechos reservados.`,
      ],
    ],
  });
  currentY = getLastAutoTableY();

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

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: { fillColor: [2, 132, 199], textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59], cellPadding: 2.3 },
    head: [['3. DESCRIPCIÓN TÉCNICA DEL PUESTO DE TRABAJO EVALUADO', 'DETALLE RELEVADO']],
    columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold' } },
    body: [
      ['Puesto de Trabajo', `${general.workstationName || '—'} (Sector: ${general.department || '—'})`],
      [
        'Personal y Jornada',
        `${general.exposedWorkersCount} trabajador(es) expuesto(s) · Jornada: ${general.shiftDurationHours} h/día · Supervisor: ${general.supervisorName || '—'}`,
      ],
      ['Turnos y Pausas', general.workScheduleAndBreaks || '—'],
      ['Descripción del Puesto', general.workstationDescription || '—'],
      ['Tareas del Ciclo', general.mainTasks || '—'],
      ['Equipos y Mobiliario', general.equipmentAndFurniture || '—'],
      [
        'Antecedentes / Lesiones',
        general.previousInjuriesOrSymptoms
          ? `SÍ — ${general.previousInjuriesDetail || 'Sintomatología osteomuscular registrada'}`
          : 'Sin antecedentes de lesiones o manifestaciones clínicas reportadas',
      ],
      ['Factores Identificados (Paso 1)', activeHazardsList || 'Evaluación preventiva general'],
    ],
  });
  currentY = getLastAutoTableY();

  // SECCIÓN 3: RESUMEN EJECUTIVO Y TABLA DE PRIORIZACIÓN (CAPÍTULO 10)
  ensureSpace(45);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('4. RESUMEN EJECUTIVO Y JERARQUIZACIÓN BIOMECÁNICA DE INTERVENCIONES', margin, currentY);
  currentY += 4;

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: [30, 41, 59], cellPadding: 2 },
    head: [['Prioridad', 'Pestaña / Subtarea', 'Método', 'Resultado', 'Nivel de Riesgo', 'Plazo Propuesto']],
    body: prioritized.map((p) => [
      `#${p.rank}`,
      `${p.tab.tabLabel}\n${p.tab.taskEvaluated || ''}`,
      METHOD_CATALOG.find((m) => m.id === p.tab.method)?.shortName || p.tab.method,
      p.result.primaryScoreText,
      p.result.riskLabel,
      p.tab.implementationDeadline,
    ]),
  });
  currentY = getLastAutoTableY();

  // Síntesis ejecutiva escrita
  ensureSpace(28);
  const splitExec = doc.splitTextToSize(executiveSummary, contentWidth - 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(30, 41, 59);
  doc.text(splitExec, margin + 2, currentY + 2);
  currentY += splitExec.length * 4.2 + 8;

  // SECCIÓN 4: DESARROLLO DETALLADO PESTAÑA POR PESTAÑA
  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    const pEntry = prioritized.find((p) => p.tab.id === tab.id)!;
    const res = pEntry.result;
    const catalog = METHOD_CATALOG.find((m) => m.id === tab.method)!;
    const sevColor = severityBadgeColors(res.severity);

    doc.addPage();
    currentY = 36;

    // Título de pestaña
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, currentY - 5, contentWidth, 14, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`ESTUDIO ${i + 1} DE ${tabs.length}: ${tab.tabLabel.toUpperCase()}`, margin + 3, currentY + 1);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`${catalog.fullName} (${catalog.chapterRef})`, margin + 3, currentY + 6.5);
    currentY += 14;

    // Ficha resumen de la pestaña
    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      theme: 'grid',
      bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59], cellPadding: 2.2 },
      columnStyles: { 0: { cellWidth: 48, fontStyle: 'bold', fillColor: [248, 250, 252] } },
      body: [
        ['Subtarea Evaluada', tab.taskEvaluated || 'Ciclo operativo del puesto'],
        ['Justificación del Método', catalog.justificationTemplate],
        ['Instrumental / Relevamiento', tab.instrumentsUsed || 'Observación directa y medición angular'],
        [
          'Resultado Principal',
          `${res.primaryScoreText}${res.secondaryScoreText ? ` (${res.secondaryScoreText})` : ''}`,
        ],
        ['Nivel de Riesgo y Acción', `${res.riskLabel.toUpperCase()} — ${res.actionLevelText}`],
      ],
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.row.index === 4 && hookData.column.index === 1) {
          hookData.cell.styles.textColor = sevColor.rgb;
          hookData.cell.styles.fontStyle = 'bold';
        }
      },
    });
    currentY = getLastAutoTableY();

    // Tabla de desglose técnico de variables y fórmulas
    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.2, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8.2, textColor: [30, 41, 59], cellPadding: 2 },
      head: [['Parámetro / Factor del Método', 'Valor Calculado', 'Referencia / Criterio Normativo']],
      body: res.breakdownRows.map((r) => [r.parameter, r.value, r.reference || '—']),
    });
    currentY = getLastAutoTableY();

    // Si el método tiene tabla de datos cargada (OWAS, WBGT multizona, ISO 2631, ISO 5349)
    const seriesTable = extractRawSeriesRows(tab);
    if (seriesTable && seriesTable.rows.length > 0) {
      ensureSpace(30);
      autoTable(doc, {
        startY: currentY,
        margin: { left: margin, right: margin },
        theme: 'grid',
        headStyles: { fillColor: [51, 65, 85], textColor: 255, fontSize: 7.8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7.8, textColor: [30, 41, 59], cellPadding: 1.8 },
        head: [seriesTable.headers],
        body: seriesTable.rows,
      });
      currentY = getLastAutoTableY();
    }

    // Fotografías anotadas con goniómetro
    if (tab.photos.length > 0) {
      ensureSpace(68);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text('Registro Fotográfico y Medición Angular en Puesto:', margin, currentY);
      currentY += 4;

      for (const photo of tab.photos) {
        const asset = await normalizeDataUrlToPng(photo.annotatedDataUrl || photo.dataUrl, 850);
        if (!asset) continue;
        const maxW = 88;
        const maxH = 62;
        const ratio = Math.min(maxW / asset.widthPx, maxH / asset.heightPx);
        const drawW = asset.widthPx * ratio;
        const drawH = asset.heightPx * ratio;

        ensureSpace(drawH + 14);
        doc.addImage(asset.pngDataUrl, 'PNG', margin, currentY, drawW, drawH);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        const angleSummary =
          photo.annotations.length > 0
            ? ` | Ángulos medidos: ${photo.annotations.map((a) => `${a.label}: ${a.degrees}°`).join(', ')}`
            : '';
        doc.text(`${photo.caption}${angleSummary}`, margin, currentY + drawH + 4.5);
        currentY += drawH + 10;
      }
    }

    // CIERRE DE HOJA: OBSERVACIONES DEL EVALUADOR Y MEDIDAS CORRECTIVAS
    ensureSpace(42);
    const obsText =
      tab.evaluatorObservations.trim() ||
      `${res.interpretation} (Sin observaciones adicionales consignadas manualmente por el evaluador).`;
    const measuresText =
      tab.correctiveMeasures.trim() || res.suggestedMeasures.map((s, idx) => `${idx + 1}. ${s}`).join('\n');

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      theme: 'grid',
      headStyles: { fillColor: [2, 132, 199], textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8.5, textColor: [15, 23, 42], cellPadding: 2.5 },
      head: [['OBSERVACIONES DEL EVALUADOR Y PLAN DE ACCIÓN DE LA HOJA']],
      body: [
        [`Observaciones del Evaluador:\n${obsText}`],
        [`Medidas Correctivas Propuestas:\n${measuresText}`],
        [
          `Responsable Designado: ${tab.responsiblePerson || '—'}   |   Plazo de Implementación: ${tab.implementationDeadline}   |   Orden de Prioridad Global: #${pEntry.rank}`,
        ],
      ],
    });
    currentY = getLastAutoTableY();
  }

  // FIRMA PROFESIONAL AL FINAL DEL ÚLTIMO FOLIO
  ensureSpace(38);
  currentY += 8;
  doc.setDrawColor(100, 116, 139);
  doc.line(pageWidth - margin - 72, currentY + 14, pageWidth - margin, currentY + 14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(general.evaluatorName || 'Firma del Profesional Evaluador', pageWidth - margin - 36, currentY + 19, {
    align: 'center',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `${general.evaluatorTitle || ''} ${general.evaluatorLicense ? `· ${general.evaluatorLicense}` : ''}`,
    pageWidth - margin - 36,
    currentY + 23.5,
    { align: 'center' },
  );
  doc.text(`Próxima Reevaluación Sugerida: ${general.nextReevaluationDate || 'Anual'}`, margin, currentY + 19);

  // Numeración y encabezado institucional en todas las páginas (estilo Informe Técnico)
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
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(general.companyName || 'ESTUDIO ERGONÓMICO INTEGRAL', textStartX, 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(71, 85, 105);
    doc.text(`Puesto: ${general.workstationName || '—'} · Sector: ${general.department || '—'}`, textStartX, 21);
    doc.text(`Evaluador: ${general.evaluatorName || '—'}`, textStartX, 25.2);

    doc.setFont('helvetica', 'bold');
    doc.text(`Hoja ${p} de ${totalPages}`, pageWidth - margin - 3, 16, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${general.reportDate}`, pageWidth - margin - 3, 21, { align: 'right' });

    // Pie de página institucional con Copyright y aviso profesional
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      '© Mauricio Alejandro Pizarro Muñoz · ErgoEval · Herramienta técnica para uso exclusivo de profesionales calificados',
      margin,
      pageHeight - 7.5,
    );
    doc.text(
      `Hoja ${p} de ${totalPages}`,
      pageWidth - margin,
      pageHeight - 7.5,
      { align: 'right' },
    );
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
  const executiveSummary =
    general.customGlobalConclusion.trim() || generateAutomaticExecutiveSynthesis(general, prioritized);

  const docChildren: (Paragraph | Table)[] = [];

  // Título Principal
  docChildren.push(
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

  // Tabla 2: Resumen Ejecutivo y Matriz Priorizada
  docChildren.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 260, after: 100 },
      children: [
        new TextRun({
          text: '2. Resumen Ejecutivo Automático y Priorización de Intervenciones (Cap. 10)',
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

  // SECCIÓN 3: DESARROLLO INDIVIDUAL DE CADA PESTAÑA
  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    const pEntry = prioritized.find((p) => p.tab.id === tab.id)!;
    const res = pEntry.result;
    const catalog = METHOD_CATALOG.find((m) => m.id === tab.method)!;
    const sev = severityBadgeColors(res.severity);

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
        rows: [
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
              createCell('Interpretación Técnica', { bold: true, fillHex: 'F8FAFC' }),
              createCell(res.interpretation),
            ],
          }),
        ],
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

    // Imágenes anotadas
    if (tab.photos.length > 0) {
      docChildren.push(
        new Paragraph({
          spacing: { before: 180, after: 80 },
          children: [
            new TextRun({
              text: 'Registro Fotográfico y Ángulos Relevados:',
              bold: true,
              size: 20,
              color: '0F172A',
              font: 'Calibri',
            }),
          ],
        }),
      );

      for (const photo of tab.photos) {
        const asset = await normalizeDataUrlToPng(photo.annotatedDataUrl || photo.dataUrl, 750);
        if (!asset) continue;
        const maxWidthDocx = 420;
        const maxHeightDocx = 290;
        const scale = Math.min(maxWidthDocx / asset.widthPx, maxHeightDocx / asset.heightPx);

        docChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 80, after: 40 },
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
            spacing: { after: 120 },
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

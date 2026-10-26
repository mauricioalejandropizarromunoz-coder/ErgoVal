import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MethodId } from '../types/ergonomics';
import { BOOK_METADATA, METHOD_REFERENCES, getEffectiveMethodReference } from './referenceData';
import { getMethodFormulaProfile, isMethodFormulaModified } from './formulaConfig';

export async function exportUserManualPdf(): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

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

  // ==========================================================================
  // PORTADA INSTITUCIONAL DEL MANUAL
  // ==========================================================================
  doc.setFillColor(15, 23, 42);
  doc.rect(margin, 35, contentWidth, 38, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text('MANUAL DE USO Y PROCEDIMIENTO DESCRIPTIVO', margin + 6, 47);
  doc.setFontSize(11);
  doc.setTextColor(186, 230, 253);
  doc.text('Plataforma ErgoEval — Métodos Ergonómicos y Ponderación de Datos', margin + 6, 56);
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    'Guía operativa detallada para la evaluación ergonómica de puestos de trabajo conforme a normativas vigentes.',
    margin + 6,
    64,
  );

  currentY = 82;

  // Ficha de autoría y derechos
  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: { fillColor: [2, 132, 199], textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59], cellPadding: 2.5 },
    head: [['DATOS DEL AUTOR, TITULAR DE DERECHOS Y DESARROLLO TÉCNICO', '']],
    body: [
      ['Autor y Desarrollo Metodológico', BOOK_METADATA.author],
      ['Habilitación Profesional', BOOK_METADATA.authorCredentials],
      ['Obra y Libro de Referencia', BOOK_METADATA.title],
      ['Derechos de Autor (Copyright)', BOOK_METADATA.copyright],
      [
        'Advertencia de Responsabilidad Profesional',
        BOOK_METADATA.legalDisclaimer,
      ],
    ],
    columnStyles: { 0: { cellWidth: 55, fontStyle: 'bold', fillColor: [248, 250, 252] } },
  });
  currentY = getLastAutoTableY() + 4;

  // CAPÍTULO 1: INTRODUCCIÓN Y ALCANCE
  ensureSpace(40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('CAPÍTULO 1: OBJETIVO, ALCANCE Y ADVERTENCIA OBLIGATORIA', margin, currentY);
  currentY += 5;

  const introText = [
    'El presente documento constituye el manual de procedimiento técnico y operativo de la aplicación ErgoEval.',
    'La plataforma ha sido concebida para brindar a los profesionales en Higiene, Seguridad y Ergonomía un entorno riguroso, ágil y transparente para evaluar puestos de trabajo mediante 15 métodos internacionales y normativos.',
    'ADVERTENCIA OBLIGATORIA: ErgoEval es una herramienta técnica de cálculo y sistematización ergonómica desarrollada exclusivamente para profesionales con capacitación y competencia en la materia. El informe generado es un soporte técnico de valoración cuantitativa y NO sustituye el análisis crítico, la observación presencial en campo ni la verificación obligatoria de resultados que debe efectuar el propio profesional actuante antes de emitir su dictamen pericial o plan de mejoras.',
    'ADVERTENCIA SOBRE ENLACES COMPARTIDOS (GOOGLE AI STUDIO): Al compartir el enlace de la aplicación (URL con dominio ais-pre-*.run.app o ais-dev-*.run.app), la infraestructura de Google AI Studio muestra un aviso de seguridad automático que indica que se trata de una aplicación experimental generada en sandbox. Esto es un protocolo habitual de la plataforma de desarrollo que no compromete en modo alguno la veracidad de los cálculos matemáticos ni la seguridad de los datos ingresados en el navegador.',
  ];

  introText.forEach((p) => {
    ensureSpace(16);
    const split = doc.splitTextToSize(p, contentWidth);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(30, 41, 59);
    doc.text(split, margin, currentY);
    currentY += split.length * 3.8 + 2.5;
  });

  currentY += 4;

  // CAPÍTULO 2: PROCEDIMIENTO OPERATIVO PASO A PASO
  ensureSpace(40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('CAPÍTULO 2: PROCEDIMIENTO OPERATIVO PASO A PASO EN LA APLICACIÓN', margin, currentY);
  currentY += 4;

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: [30, 41, 59], cellPadding: 2.2 },
    head: [['Paso', 'Módulo', 'Acción del Evaluador', 'Impacto en el Informe Final']],
    body: [
      [
        'Paso 1',
        'Datos Generales',
        'Cargar razón social, CUIT, domicilio, dotación, evaluador (matrícula, registro), puesto, descripción, tareas y antecedentes.',
        'Estructura la carátula y membrete institucional de todas las páginas del PDF y Word.',
      ],
      [
        'Paso 2',
        'Identificación Inicial',
        'Marcar los 5 peligros ergonómicos presentes según el Protocolo del Capítulo 9.2.',
        'Verifica cobertura de peligros y sugiere crear pestañas específicas para cada factor identificado.',
      ],
      [
        'Paso 3',
        'Pestañas de Estudio',
        'Añadir pestañas para cada subtarea o ciclo y seleccionar el método específico (RULA, REBA, NIOSH, OCRA, etc.).',
        'Cada pestaña genera un folio independiente de cálculo con desglose completo en el informe.',
      ],
      [
        'Paso 4',
        'Guías y Goniómetro',
        'Seleccionar ángulos en las tarjetas anatómicas o cargar fotos del puesto y medir ángulos con el goniómetro de 3 puntos.',
        'Las fotos con cotas angulares se incrustan directamente en el informe técnico descargado.',
      ],
      [
        'Paso 5',
        'Carga de Datos CSV',
        'En métodos multizona (OWAS, WBGT, ISO 2631, ISO 5349), cargar o editar tablas de mediciones puntuales.',
        'Realiza la ponderación temporal y añade la tabla de muestreo completa en el reporte.',
      ],
      [
        'Paso 6',
        'Cierre de Hoja',
        'Completar al final de cada hoja: Instrumental, Observaciones del Evaluador, Medidas y Plazo de Ejecución.',
        'Sección obligatoria que fundamenta el criterio profesional al pie de cada evaluación.',
      ],
      [
        'Paso 7',
        'Resumen y Priorización',
        'Ver la matriz de jerarquización biomecánica (Capítulo 10) y revisar o personalizar la conclusión técnica.',
        'Ordena las prioridades de intervención de 1° a 5° considerando factores concurrentes y lesiones previas.',
      ],
      [
        'Paso 8',
        'Exportación',
        'Descargar el informe técnico completo en formato PDF institucional o Word (.docx) editable.',
        'Documento formal firmado listo para presentación ante auditorías, aseguradoras o SRT.',
      ],
    ],
    columnStyles: {
      0: { cellWidth: 16, fontStyle: 'bold' },
      1: { cellWidth: 32, fontStyle: 'bold' },
      2: { cellWidth: 68 },
      3: { cellWidth: 66 },
    },
  });
  currentY = getLastAutoTableY() + 4;

  // CAPÍTULO 3: GUÍA MÉTODO POR MÉTODO Y EFECTO DE CADA DATO
  const methodKeys = Object.keys(METHOD_REFERENCES) as MethodId[];

  for (let i = 0; i < methodKeys.length; i++) {
    const mId = methodKeys[i];
    const ref = getEffectiveMethodReference(mId);
    const fProf = getMethodFormulaProfile(mId);
    const modifiedFormulaNote = isMethodFormulaModified(mId)
      ? ' (Personalizada por el evaluador)'
      : ' (Estándar normativa)';
    const activeExprLines = fProf
      ? fProf.expressions.map((e) => `${e.symbol} = ${e.expression}`).join('\n')
      : ref.formulaSummary;

    doc.addPage();
    currentY = 36;

    // Encabezado de Método
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, currentY - 5, contentWidth, 14, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`${i + 1}. ${ref.fullName.toUpperCase()}`, margin + 3, currentY + 1.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`${ref.chapter} · ${ref.normativeContext}`, margin + 3, currentY + 6.8);
    currentY += 15;

    // Fundamento y fórmula
    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: [30, 41, 59], cellPadding: 2 },
      head: [['ASPECTO TÉCNICO', 'DETALLE Y FORMULACIÓN MATEMÁTICA']],
      body: [
        ['Fundamento Conceptual', ref.conceptualBasis],
        [`Formulación Resumen${modifiedFormulaNote}`, ref.formulaSummary],
        ['Ecuaciones Algebraicas Activas', activeExprLines],
        ['Tablas del Libro Citadas', ref.tables.map((t) => `${t.tableNumber}: ${t.title}`).join(' | ')],
      ],
      columnStyles: { 0: { cellWidth: 45, fontStyle: 'bold', fillColor: [248, 250, 252] } },
    });
    currentY = getLastAutoTableY() + 3;

    // TABLA: QUÉ HACE CADA DATO SELECCIONADO SOBRE EL RESULTADO FINAL
    ensureSpace(35);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(2, 132, 199);
    doc.text('¿QUÉ HACE CADA DATO SELECCIONADO SOBRE EL RESULTADO FINAL?', margin, currentY);
    currentY += 3.5;

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      theme: 'striped',
      headStyles: { fillColor: [2, 132, 199], textColor: 255, fontSize: 7.8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.8, textColor: [30, 41, 59], cellPadding: 2 },
      head: [['Variable / Dato Seleccionado', 'Significado Físico en Puesto', 'Efecto Directo sobre el Cálculo y Nivel de Riesgo']],
      body: ref.variables.map((v) => [v.name, v.meaning, v.impactOnResult]),
      columnStyles: {
        0: { cellWidth: 46, fontStyle: 'bold' },
        1: { cellWidth: 56 },
        2: { cellWidth: 80 },
      },
    });
    currentY = getLastAutoTableY() + 3;

    // Escala de Puntuación y Niveles de Actuación
    ensureSpace(30);
    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      theme: 'grid',
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontSize: 7.8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.8, textColor: [30, 41, 59], cellPadding: 1.8 },
      head: [['Nivel de Actuación', 'Puntuación / Rango', 'Diagnóstico de Riesgo', 'Medida Técnica Requerida', 'Plazo Sugerido']],
      body: ref.actionLevels.map((al) => [al.level, al.scoreRange, al.risk, al.action, al.deadline]),
      columnStyles: {
        0: { cellWidth: 30, fontStyle: 'bold' },
        1: { cellWidth: 28, fontStyle: 'bold' },
        2: { cellWidth: 40 },
        3: { cellWidth: 58 },
        4: { cellWidth: 26 },
      },
    });
    currentY = getLastAutoTableY() + 3;

    // Ejemplo Resuelto del Libro y Notas del Autor
    ensureSpace(28);
    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      theme: 'grid',
      bodyStyles: { fontSize: 7.8, textColor: [30, 41, 59], cellPadding: 2 },
      body: [
        [
          `Ejemplo del Libro (${ref.workedExample.title}):\n${ref.workedExample.description}\nCálculo: ${ref.workedExample.calculations}\nResultado: ${ref.workedExample.finalScore}`,
        ],
        [`Recomendación Práctica del Autor (Lic. Mauricio Pizarro):\n${ref.authorNotes}`],
      ],
    });
    currentY = getLastAutoTableY();
  }

  // ==========================================================================
  // ÚLTIMO CAPÍTULO: CLÁUSULAS LEGALES, FIRMA Y CONTACTO
  // ==========================================================================
  doc.addPage();
  currentY = 36;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('CAPÍTULO 4: PROPIEDAD INTELECTUAL, CONDICIONES DE USO Y SOPORTE', margin, currentY);
  currentY += 6;

  const legalParas = [
    '1. Propiedad Intelectual: La metodología integrada, criterios de ponderación cruzada, algoritmo de jerarquización biomecánica y desarrollos didácticos contenidos en la aplicación ErgoEval y en este manual son propiedad intelectual de Mauricio Alejandro Pizarro Muñoz, amparados por la legislación vigente de propiedad intelectual.',
    '2. Licencia de Uso Profesional: Se concede autorización para la aplicación técnica de ErgoEval en el ámbito de la evaluación ergonómica y emisión de dictámenes periciales y de gestión preventiva.',
    '3. Independencia del Dictamen: El evaluador que suscribe cada informe asume en forma plena y exclusiva la responsabilidad técnica y legal de los datos ingresados, las mediciones angulares realizadas y las medidas correctivas propuestas en el informe final.',
    '4. Advertencia de la Plataforma Google AI Studio: Toda advertencia originada por la apertura de enlaces *.run.app corresponde a los controles estándar de previsualización de prototipos de Google Cloud Run / AI Studio.',
  ];

  legalParas.forEach((p) => {
    ensureSpace(14);
    const split = doc.splitTextToSize(p, contentWidth);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(30, 41, 59);
    doc.text(split, margin, currentY);
    currentY += split.length * 3.8 + 2.5;
  });

  currentY += 10;
  ensureSpace(35);

  doc.setDrawColor(100, 116, 139);
  doc.line(pageWidth - margin - 75, currentY + 15, pageWidth - margin, currentY + 15);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(BOOK_METADATA.author, pageWidth - margin - 37.5, currentY + 20, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(71, 85, 105);
  doc.text(BOOK_METADATA.authorCredentials, pageWidth - margin - 37.5, currentY + 24.5, { align: 'center' });
  doc.text(BOOK_METADATA.copyright, margin, currentY + 20);

  // Encabezados y pies de página institucionales en todas las hojas
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);

    // Header institucional
    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, 10, contentWidth, 18, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('ERGOEVAL — MANUAL DE USO Y PROCEDIMIENTO DESCRIPTIVO DE MÉTODOS', margin + 3, 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Autor y Titular de Derechos: ${BOOK_METADATA.author}`, margin + 3, 21);
    doc.text('Guía Técnica Método por Método y Ponderación de Datos de Entrada', margin + 3, 25.2);

    doc.setFont('helvetica', 'bold');
    doc.text(`Hoja ${p} de ${totalPages}`, pageWidth - margin - 3, 16, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text('Edición 2026', pageWidth - margin - 3, 21, { align: 'right' });

    // Footer de cada página
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${BOOK_METADATA.copyright} — Herramienta técnica profesional. No sustituye la verificación por el evaluador.`,
      margin,
      pageHeight - 8,
    );
  }

  doc.save('manual_procedimiento_ergonomico_ergoeval.pdf');
}

import JSZip from 'jszip';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  PageBreak,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { BOOK_FIGURE_CATALOG } from './figurePlanCatalog';
import { DEFAULT_ORBIT_OVERRIDE, renderBookFigureToPng } from './biomech3dRenderer';
import { exportCanvasToHighQualityPng } from './pngOptimizer';
import {
  EDITION_MODE_LABELS,
  EnglishBookTableSpec,
  EnglishEditionMode,
  buildEnglishBookTablesCatalog,
  translateBookFigureSpecToEnglish,
} from './englishBookTablesCatalog';

export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function wrapCanvasTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const safeMax = Math.max(24, maxWidth);
  const paragraphs = (text || '').split('\n');
  const out: string[] = [];

  const splitToken = (tok: string): string[] => {
    if (ctx.measureText(tok).width <= safeMax) return [tok];
    const parts: string[] = [];
    let cur = '';
    for (const ch of tok) {
      if (cur.length > 0 && ctx.measureText(cur + ch).width > safeMax) {
        parts.push(cur);
        cur = ch;
      } else {
        cur += ch;
      }
    }
    if (cur) parts.push(cur);
    return parts;
  };

  for (const p of paragraphs) {
    const rawWords = p.trim().split(/\s+/).filter(Boolean);
    if (rawWords.length === 0) continue;
    const words: string[] = [];
    for (const w of rawWords) words.push(...splitToken(w));

    let cur = words[0];
    for (let i = 1; i < words.length; i++) {
      const next = `${cur} ${words[i]}`;
      if (ctx.measureText(next).width <= safeMax) {
        cur = next;
      } else {
        out.push(cur);
        cur = words[i];
      }
    }
    out.push(cur);
  }
  return out.length > 0 ? out : [''];
}

/**
 * Renders any EnglishBookTableSpec onto an HTMLCanvasElement at print-ready resolution
 * with dynamic height calculation so zero cells or footnotes ever clip or overflow.
 */
export function renderTechnicalTableToCanvas(
  table: EnglishBookTableSpec,
  canvas: HTMLCanvasElement,
  dpiScale = 2,
): void {
  const logicalW = 1280;
  const padOuterX = 28;
  const contentW = logicalW - padOuterX * 2;
  const scale = Math.max(1, dpiScale);

  const probe = document.createElement('canvas').getContext('2d')!;

  // 1. Measure Title lines
  probe.font = 'bold 16px "Plus Jakarta Sans", system-ui, sans-serif';
  const titleLines = wrapCanvasTextLines(probe, table.title, contentW - 150);
  const topBannerH = Math.max(54, titleLines.length * 22 + 22);

  // 2. Measure Standards bar lines
  probe.font = '11.5px "Public Sans", system-ui, sans-serif';
  const stdLineText = `US Reference: ${table.usStandards}   |   EU / ISO Reference: ${table.euStandards}   |   Plates: ${table.relatedFigures}`;
  const stdLines = wrapCanvasTextLines(probe, stdLineText, contentW - 24);
  const stdBoxH = Math.max(32, stdLines.length * 16 + 14);

  // 3. Column widths
  const ratioSum = table.colRatios.reduce((a, b) => a + b, 0) || 1;
  const colWidths = table.colRatios.map((r) => Math.floor((r / ratioSum) * contentW));
  const usedW = colWidths.reduce((a, b) => a + b, 0);
  colWidths[colWidths.length - 1] += contentW - usedW;

  const fontSize = table.headers.length >= 10 ? 10.6 : 11.6;
  const cellPadX = table.headers.length >= 10 ? 6 : 10;
  const cellPadY = 7;
  const headLH = Math.round(fontSize * 1.28 * 10) / 10;
  const bodyLH = Math.round(fontSize * 1.32 * 10) / 10;

  probe.font = `bold ${fontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
  const wrappedHeaders = table.headers.map((h, i) =>
    wrapCanvasTextLines(probe, h, Math.max(18, colWidths[i] - cellPadX * 2)),
  );
  const maxHeadLines = Math.max(1, ...wrappedHeaders.map((l) => l.length));
  const tableHeaderH = Math.max(36, Math.ceil(maxHeadLines * headLH + cellPadY * 2));

  const hiSet = new Set(table.highlightRowIndices || []);
  const measuredRows = table.rows.map((row, rIdx) => {
    const isHi = hiSet.has(rIdx);
    const wrappedCells = row.map((cell, cIdx) => {
      const isMono = Boolean(table.colMono?.[cIdx]);
      const fam = isMono
        ? '"IBM Plex Mono", monospace'
        : '"Public Sans", system-ui, sans-serif';
      probe.font = `${isHi ? 'bold ' : ''}${fontSize}px ${fam}`;
      return wrapCanvasTextLines(probe, cell, Math.max(18, colWidths[cIdx] - cellPadX * 2));
    });
    const maxLines = Math.max(1, ...wrappedCells.map((l) => l.length));
    const rowH = Math.max(32, Math.ceil(maxLines * bodyLH + cellPadY * 2));
    return { wrappedCells, rowH, isHi };
  });

  const rowsTotalH = measuredRows.reduce((acc, r) => acc + r.rowH, 0);

  // 4. Footnote height
  probe.font = '11.2px "Public Sans", system-ui, sans-serif';
  const footLines = wrapCanvasTextLines(probe, `Note: ${table.footnote}`, contentW - 24);
  const footBoxH = Math.max(34, footLines.length * 15.5 + 14);

  const logicalH =
    topBannerH +
    12 +
    stdBoxH +
    12 +
    tableHeaderH +
    rowsTotalH +
    12 +
    footBoxH +
    34;

  canvas.width = Math.round(logicalW * scale);
  canvas.height = Math.round(logicalH * scale);

  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // White publication background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, logicalW, logicalH);

  // Top Header Bar
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, logicalW, topBannerH);

  // Table badge
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 13px "IBM Plex Mono", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(table.tableCode.toUpperCase(), padOuterX, topBannerH / 2);

  // Title lines
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px "Plus Jakarta Sans", system-ui, sans-serif';
  const titleStartX = padOuterX + 128;
  const titleStartY = topBannerH / 2 - ((titleLines.length - 1) * 21) / 2;
  titleLines.forEach((ln, idx) => {
    ctx.fillText(ln, titleStartX, titleStartY + idx * 21);
  });

  // Normative strip
  let curY = topBannerH + 12;
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(padOuterX, curY, contentW, stdBoxH, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#334155';
  ctx.font = '11.5px "Public Sans", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const stdStartY = curY + stdBoxH / 2 - ((stdLines.length - 1) * 16) / 2;
  stdLines.forEach((ln, idx) => {
    ctx.fillText(ln, padOuterX + 12, stdStartY + idx * 16);
  });

  curY += stdBoxH + 12;
  const tableTopY = curY;

  const colX: number[] = [];
  let accX = padOuterX;
  for (const cw of colWidths) {
    colX.push(accX);
    accX += cw;
  }

  // Draw Table Header
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(padOuterX, curY, contentW, tableHeaderH);
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  for (let i = 0; i < colWidths.length; i++) {
    ctx.strokeRect(colX[i], curY, colWidths[i], tableHeaderH);
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${fontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  wrappedHeaders.forEach((lines, cIdx) => {
    const align = table.colAligns[cIdx] || 'left';
    ctx.textAlign = align;
    const tx =
      align === 'center'
        ? colX[cIdx] + colWidths[cIdx] / 2
        : align === 'right'
          ? colX[cIdx] + colWidths[cIdx] - cellPadX
          : colX[cIdx] + cellPadX;
    const sy = curY + tableHeaderH / 2 - ((lines.length - 1) * headLH) / 2;
    lines.forEach((ln, li) => {
      ctx.fillText(ln, tx, sy + li * headLH + 0.5);
    });
  });

  curY += tableHeaderH;

  // Draw Data Rows
  measuredRows.forEach((mr, rIdx) => {
    ctx.fillStyle = mr.isHi ? '#fff7ed' : rIdx % 2 === 0 ? '#f8fafc' : '#ffffff';
    ctx.fillRect(padOuterX, curY, contentW, mr.rowH);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    for (let cIdx = 0; cIdx < colWidths.length; cIdx++) {
      ctx.strokeRect(colX[cIdx], curY, colWidths[cIdx], mr.rowH);
    }

    mr.wrappedCells.forEach((lines, cIdx) => {
      const align = table.colAligns[cIdx] || 'left';
      const isMono = Boolean(table.colMono?.[cIdx]);
      const fam = isMono
        ? '"IBM Plex Mono", monospace'
        : '"Public Sans", system-ui, sans-serif';
      ctx.font = `${mr.isHi ? 'bold ' : ''}${fontSize}px ${fam}`;
      ctx.fillStyle = mr.isHi ? '#9a3412' : '#0f172a';
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      const tx =
        align === 'center'
          ? colX[cIdx] + colWidths[cIdx] / 2
          : align === 'right'
            ? colX[cIdx] + colWidths[cIdx] - cellPadX
            : colX[cIdx] + cellPadX;
      const sy = curY + mr.rowH / 2 - ((lines.length - 1) * bodyLH) / 2;
      lines.forEach((ln, li) => {
        ctx.fillText(ln, tx, sy + li * bodyLH + 0.5);
      });
    });

    curY += mr.rowH;
  });

  // Outer Table Frame
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(padOuterX, tableTopY, contentW, curY - tableTopY);

  // Footnote Box
  curY += 12;
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(padOuterX, curY, contentW, footBoxH, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#334155';
  ctx.font = '11.2px "Public Sans", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const footStartY = curY + footBoxH / 2 - ((footLines.length - 1) * 15.5) / 2;
  footLines.forEach((ln, idx) => {
    ctx.fillText(ln, padOuterX + 12, footStartY + idx * 15.5);
  });

  // Attribution Footer
  ctx.fillStyle = '#64748b';
  ctx.font = '10.5px "IBM Plex Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(
    `${table.chapterTitle} · Workplace Ergonomics — Assessment Methods and Intervention Protocol`,
    padOuterX,
    logicalH - 12,
  );
  ctx.textAlign = 'right';
  ctx.fillText('Mauricio Alejandro Pizarro Muñoz', logicalW - padOuterX, logicalH - 12);

  // Outer Plate Border
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0.75, 0.75, logicalW - 1.5, logicalH - 1.5);
}

export async function renderTechnicalTableToPngDataUrl(
  table: EnglishBookTableSpec,
  dpiScale = 2,
): Promise<string> {
  const off = document.createElement('canvas');
  renderTechnicalTableToCanvas(table, off, dpiScale);
  const res = await exportCanvasToHighQualityPng(off);
  return res.dataUrl;
}

// ============================================================================
// CSV & MARKDOWN BUILDERS
// ============================================================================
export function buildTableCsvContent(table: EnglishBookTableSpec, euComma = false): string {
  const delim = euComma ? ';' : ',';
  const esc = (cell: string) => {
    const normalized = (cell || '').replace(/\r?\n/g, ' | ');
    if (normalized.includes('"') || normalized.includes(delim) || normalized.includes('\n')) {
      return `"${normalized.replace(/"/g, '""')}"`;
    }
    return normalized;
  };

  const metaLines = [
    [table.tableCode, table.title].map(esc).join(delim),
    ['Chapter', table.chapterTitle, 'Related Figures', table.relatedFigures].map(esc).join(delim),
    ['US Standards', table.usStandards, 'EU / ISO Standards', table.euStandards].map(esc).join(delim),
    '',
    table.headers.map(esc).join(delim),
    ...table.rows.map((r) => r.map(esc).join(delim)),
    '',
    ['Footnote', table.footnote].map(esc).join(delim),
  ];

  return '\uFEFF' + metaLines.join('\r\n');
}

export function buildAllTablesMarkdown(
  tables: EnglishBookTableSpec[],
  mode: EnglishEditionMode,
  euComma = false,
): string {
  const modeInfo = EDITION_MODE_LABELS[mode];
  const lines: string[] = [
    '# Workplace Ergonomics — Technical Tables of the 3D Figure Studio (English Edition)',
    '',
    `- **Author:** Mauricio Alejandro Pizarro Muñoz`,
    `- **Editorial Convention:** ${modeInfo.fullLabel}${euComma && mode === 'eu_iso' ? ' (Continental Decimal Comma)' : ''}`,
    `- **Total Tables:** ${tables.length}`,
    '',
    '---',
    '',
  ];

  const escMd = (s: string) => (s || '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br/>');

  for (const tbl of tables) {
    lines.push(`## ${tbl.tableCode} — ${tbl.title}`);
    lines.push(`- **Chapter:** ${tbl.chapterTitle}`);
    lines.push(`- **Related Plates:** ${tbl.relatedFigures}`);
    lines.push(`- **US Standards:** ${tbl.usStandards}`);
    lines.push(`- **EU / ISO Standards:** ${tbl.euStandards}`);
    lines.push('');
    lines.push(`| ${tbl.headers.map(escMd).join(' | ')} |`);
    const alignRow = tbl.headers.map((_, idx) => {
      const al = tbl.colAligns[idx] || 'left';
      return al === 'center' ? ':---:' : al === 'right' ? '---:' : ':---';
    });
    lines.push(`| ${alignRow.join(' | ')} |`);
    for (const r of tbl.rows) {
      lines.push(`| ${r.map(escMd).join(' | ')} |`);
    }
    lines.push('');
    lines.push(`> **Note:** ${tbl.footnote}`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// EDITABLE WORD (.DOCX) MANUSCRIPT BUILDER
// ============================================================================
export async function buildEnglishTablesDocxBlob(
  tables: EnglishBookTableSpec[],
  mode: EnglishEditionMode,
  euComma = false,
): Promise<Blob> {
  const modeInfo = EDITION_MODE_LABELS[mode];
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({
          text: 'WORKPLACE ERGONOMICS — TECHNICAL TABLES (MOTOR 3D FIGURES)',
          bold: true,
          size: 30,
          color: '0F172A',
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 140 },
      children: [
        new TextRun({
          text: `Author: Mauricio Alejandro Pizarro Muñoz   |   Edition Profile: ${modeInfo.fullLabel}${
            mode === 'eu_iso' && euComma ? ' (Decimal Comma)' : ''
          }`,
          size: 20,
          color: '334155',
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 260 },
      children: [
        new TextRun({
          text: modeInfo.summary,
          italics: true,
          size: 18,
          color: '475569',
        }),
      ],
    }),
  ];

  tables.forEach((tbl, tIdx) => {
    if (tIdx > 0) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 80, after: 80 },
        children: [
          new TextRun({
            text: `${tbl.tableCode} — ${tbl.title}`,
            bold: true,
            size: 23,
            color: '0F172A',
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 60 },
        children: [
          new TextRun({ text: 'US Standards: ', bold: true, size: 17, color: '0369A1' }),
          new TextRun({ text: `${tbl.usStandards}   |   `, size: 17, color: '334155' }),
          new TextRun({ text: 'EU / ISO Standards: ', bold: true, size: 17, color: '0369A1' }),
          new TextRun({ text: `${tbl.euStandards}   |   `, size: 17, color: '334155' }),
          new TextRun({ text: 'Plates: ', bold: true, size: 17, color: '0F172A' }),
          new TextRun({ text: tbl.relatedFigures, size: 17, color: '334155' }),
        ],
      }),
    );

    const ratioSum = tbl.colRatios.reduce((a, b) => a + b, 0) || 1;
    const pctCols = tbl.colRatios.map((r) => Math.max(5, Math.round((r / ratioSum) * 100)));
    const hiSet = new Set(tbl.highlightRowIndices || []);

    const headerRow = new TableRow({
      tableHeader: true,
      children: tbl.headers.map((h, cIdx) => {
        const align =
          tbl.colAligns[cIdx] === 'center'
            ? AlignmentType.CENTER
            : tbl.colAligns[cIdx] === 'right'
              ? AlignmentType.RIGHT
              : AlignmentType.LEFT;
        return new TableCell({
          width: { size: pctCols[cIdx], type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: '0F172A', color: 'auto' },
          children: h.split('\n').map(
            (ln) =>
              new Paragraph({
                alignment: align,
                spacing: { before: 40, after: 40 },
                children: [
                  new TextRun({
                    text: ln,
                    bold: true,
                    size: tbl.headers.length >= 10 ? 16 : 18,
                    color: 'FFFFFF',
                  }),
                ],
              }),
          ),
        });
      }),
    });

    const dataRows = tbl.rows.map((row, rIdx) => {
      const isHi = hiSet.has(rIdx);
      const fillHex = isHi ? 'FFF7ED' : rIdx % 2 === 0 ? 'F8FAFC' : 'FFFFFF';
      return new TableRow({
        children: row.map((cell, cIdx) => {
          const align =
            tbl.colAligns[cIdx] === 'center'
              ? AlignmentType.CENTER
              : tbl.colAligns[cIdx] === 'right'
                ? AlignmentType.RIGHT
                : AlignmentType.LEFT;
          const isMono = Boolean(tbl.colMono?.[cIdx]);
          return new TableCell({
            width: { size: pctCols[cIdx], type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: fillHex, color: 'auto' },
            children: (cell || '').split('\n').map(
              (ln) =>
                new Paragraph({
                  alignment: align,
                  spacing: { before: 35, after: 35 },
                  children: [
                    new TextRun({
                      text: ln,
                      bold: isHi,
                      font: isMono ? 'Courier New' : 'Calibri',
                      size: tbl.headers.length >= 10 ? 15 : 17,
                      color: isHi ? '9A3412' : '0F172A',
                    }),
                  ],
                }),
            ),
          });
        }),
      });
    });

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 4, color: '94A3B8' },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: '94A3B8' },
          left: { style: BorderStyle.SINGLE, size: 4, color: '94A3B8' },
          right: { style: BorderStyle.SINGLE, size: 4, color: '94A3B8' },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
          insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
        },
        rows: [headerRow, ...dataRows],
      }),
      new Paragraph({
        spacing: { before: 90, after: 140 },
        children: [
          new TextRun({ text: 'Note: ', bold: true, italics: true, size: 17, color: '334155' }),
          new TextRun({ text: tbl.footnote, italics: true, size: 17, color: '334155' }),
        ],
      }),
    );
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE },
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}

// ============================================================================
// VECTOR LANDSCAPE PDF BUILDER (WinAnsi Safe)
// ============================================================================
function sanitizePdfWinAnsi(input: string): string {
  if (!input) return '';
  return input
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/≠/g, '!=')
    .replace(/≈/g, '~')
    .replace(/[−–—]/g, '-')
    .replace(/√/g, 'sqrt')
    .replace(/∞/g, 'inf')
    .replace(/α/g, 'alpha')
    .replace(/μ/g, 'mu')
    .replace(/Δ/g, 'Delta')
    .replace(/₀/g, '0')
    .replace(/₁/g, '1')
    .replace(/₂/g, '2')
    .replace(/₃/g, '3')
    .replace(/₄/g, '4')
    .replace(/⁴/g, '^4')
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '');
}

export function buildEnglishTablesPdfBlob(
  tables: EnglishBookTableSpec[],
  mode: EnglishEditionMode,
  euComma = false,
): Blob {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const modeInfo = EDITION_MODE_LABELS[mode];
  const pageW = pdf.internal.pageSize.getWidth();

  tables.forEach((tbl, idx) => {
    if (idx > 0) pdf.addPage('a4', 'landscape');

    // Header band
    pdf.setFillColor(15, 23, 42);
    pdf.rect(10, 10, pageW - 20, 14, 'F');
    pdf.setTextColor(56, 189, 248);
    pdf.setFont('courier', 'bold');
    pdf.setFontSize(10);
    pdf.text(sanitizePdfWinAnsi(tbl.tableCode.toUpperCase()), 14, 18.5);

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10.5);
    const titleLines = pdf.splitTextToSize(sanitizePdfWinAnsi(tbl.title), pageW - 62);
    pdf.text(titleLines.slice(0, 2), 42, titleLines.length > 1 ? 16 : 18.5);

    // Standards subtitle
    pdf.setTextColor(51, 65, 85);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    const stdStr = sanitizePdfWinAnsi(
      `US: ${tbl.usStandards}  |  EU/ISO: ${tbl.euStandards}  |  Plates: ${tbl.relatedFigures}`,
    );
    const stdWrapped = pdf.splitTextToSize(stdStr, pageW - 20);
    pdf.text(stdWrapped.slice(0, 2), 10, 28.5);

    const hiSet = new Set(tbl.highlightRowIndices || []);
    const startTableY = stdWrapped.length > 1 ? 34 : 31.5;

    autoTable(pdf, {
      startY: startTableY,
      margin: { left: 10, right: 10, bottom: 16 },
      head: [tbl.headers.map(sanitizePdfWinAnsi)],
      body: tbl.rows.map((r) => r.map(sanitizePdfWinAnsi)),
      styles: {
        fontSize: tbl.headers.length >= 10 ? 7.2 : 8.2,
        cellPadding: tbl.headers.length >= 10 ? 1.6 : 2.2,
        lineColor: [203, 213, 225],
        lineWidth: 0.2,
        textColor: [15, 23, 42],
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      didParseCell: (hookData) => {
        const cIdx = hookData.column.index;
        const al = tbl.colAligns[cIdx];
        if (al) hookData.cell.styles.halign = al;
        if (hookData.section === 'body') {
          if (tbl.colMono?.[cIdx]) {
            hookData.cell.styles.font = 'courier';
          }
          if (hiSet.has(hookData.row.index)) {
            hookData.cell.styles.fillColor = [255, 247, 237];
            hookData.cell.styles.textColor = [154, 52, 18];
            hookData.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });

    const finalY = (pdf as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 175;
    if (finalY < 192) {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(7.8);
      pdf.setTextColor(71, 85, 105);
      const footWrapped = pdf.splitTextToSize(
        sanitizePdfWinAnsi(`Note: ${tbl.footnote}`),
        pageW - 20,
      );
      pdf.text(footWrapped.slice(0, 3), 10, finalY + 5);
    }

    pdf.setFont('courier', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(
      sanitizePdfWinAnsi(
        `${modeInfo.shortLabel} | Workplace Ergonomics — Mauricio Alejandro Pizarro Munoz | Page ${idx + 1} of ${tables.length}`,
      ),
      10,
      204,
    );
  });

  return pdf.output('blob');
}

// ============================================================================
// MASTER 1-CLICK .ZIP PACKAGE GENERATOR
// ============================================================================
export interface EnglishZipExportOptions {
  mode: EnglishEditionMode;
  euComma: boolean;
  includeDiagramsPng?: boolean;
  includeAll3DPosturesPng?: boolean;
}

export interface EnglishZipExportResult {
  blob: Blob;
  suggestedFileName: string;
  tablesCount: number;
  diagramsCount: number;
  posturesCount: number;
}

export async function exportEnglishMotor3DPackageZip(
  opts: EnglishZipExportOptions,
  onProgress?: (pct: number, stepLabel: string) => void,
): Promise<EnglishZipExportResult> {
  const {
    mode,
    euComma,
    includeDiagramsPng = true,
    includeAll3DPosturesPng = false,
  } = opts;

  const zip = new JSZip();
  const tables = buildEnglishBookTablesCatalog(mode, euComma);
  const diagramSpecs = includeDiagramsPng
    ? BOOK_FIGURE_CATALOG.filter((f) => f.renderMode === 'diagram' || f.renderMode === 'real_chart')
    : [];
  const postureSpecs = includeAll3DPosturesPng
    ? BOOK_FIGURE_CATALOG.filter((f) => f.renderMode === '3d_single' || f.renderMode === '3d_dual')
    : [];

  const totalWorkUnits = 3 + tables.length + diagramSpecs.length + postureSpecs.length;
  let doneUnits = 0;
  const report = (label: string) => {
    const pct = Math.min(99, Math.round((doneUnits / Math.max(1, totalWorkUnits)) * 100));
    onProgress?.(pct, label);
  };

  const yieldFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  // 1. Editorial README
  const modeInfo = EDITION_MODE_LABELS[mode];
  const readmeContent = [
    '# WORKPLACE ERGONOMICS — ENGLISH TECHNICAL TABLES & MOTOR 3D PLATES PACKAGE',
    '',
    `**Book:** *Workplace Ergonomics — Assessment Methods and Intervention Protocol*`,
    `**Original Spanish Title:** *Ergonomía de Puestos de Trabajo — Métodos de Evaluación y Protocolo de Intervención*`,
    `**Author:** Mauricio Alejandro Pizarro Muñoz`,
    `**Selected Editorial Profile:** ${modeInfo.fullLabel}${mode === 'eu_iso' && euComma ? ' (Continental Decimal Comma)' : ''}`,
    '',
    '## Folder Structure Inside This Archive',
    '1. `01_Editable_Manuscript_Tables/`',
    '   - `Workplace_Ergonomics_All_34_Technical_Tables.docx` — Editable Microsoft Word / LibreOffice / Google Docs manuscript tables (landscape layout).',
    '   - `Workplace_Ergonomics_All_34_Technical_Tables.pdf` — Print-ready vector PDF compendium.',
    '   - `Workplace_Ergonomics_All_34_Technical_Tables.md` — Markdown / Pandoc / LaTeX source tables.',
    '   - `CSV/` — Individual UTF-8 (with BOM) spreadsheet files for all 34 tables.',
    '2. `02_Tables_HighRes_PNG/`',
    `   - High-resolution lossless 2x PNG plates for all ${tables.length} technical tables, ready for direct insertion into book page layouts.`,
    ...(diagramSpecs.length > 0
      ? [
          '3. `03_Motor3D_Diagrams_and_Charts_EN_PNG/`',
          `   - All ${diagramSpecs.length} methodological flowcharts, OWAS observation tables, NIOSH geometry/coupling cards, OCRA/JSI hand cards, PMV–PPD curves, WBGT sensor schematics, and WBV/HAV 1/3-octave vibration spectra rendered in Technical English.`,
        ]
      : []),
    ...(postureSpecs.length > 0
      ? [
          '4. `04_Motor3D_3D_Posture_Figures_EN_PNG/`',
          `   - All ${postureSpecs.length} 3D biomechanical avatar posture plates rendered in Technical English with goniometric markers and US/EU dual units.`,
        ]
      : []),
    '',
    '## Summary of US vs. European Conventions Applied',
    `- ${modeInfo.summary}`,
    '- Acronym harmonization: `LI` (Lifting Index, never literal `IL`), `RWL` (Recommended Weight Limit), `LC = 23 kg [51 lb]` (NIOSH) & `mref = 23–25 kg` (ISO 11228-1 / EN 1005-2), `ACGIH® HAL & NPF` (for Spanish `NAM`), `WBGT` (for Spanish `TGBH`), `EAV / DEAV` and `ELV / DELV` for ISO 2631-1 / ISO 5349-1 / ANSI S3.18 / ANSI S2.70 / EU Directive 2002/44/EC.',
    '',
  ].join('\n');

  zip.file('00_README_US_EU_Editorial_Guide.md', readmeContent);

  // 2. Editable Manuscript Files (.docx, .pdf, .md, .csv)
  report('Generating editable Word (.docx) manuscript tables...');
  await yieldFrame();
  const docxBlob = await buildEnglishTablesDocxBlob(tables, mode, euComma);
  zip.file(
    '01_Editable_Manuscript_Tables/Workplace_Ergonomics_All_34_Technical_Tables.docx',
    docxBlob,
  );
  doneUnits++;

  report('Generating vector PDF compendium...');
  await yieldFrame();
  const pdfBlob = buildEnglishTablesPdfBlob(tables, mode, euComma);
  zip.file(
    '01_Editable_Manuscript_Tables/Workplace_Ergonomics_All_34_Technical_Tables.pdf',
    pdfBlob,
  );
  doneUnits++;

  report('Generating Markdown & UTF-8 CSV spreadsheets...');
  const mdText = buildAllTablesMarkdown(tables, mode, euComma);
  zip.file(
    '01_Editable_Manuscript_Tables/Workplace_Ergonomics_All_34_Technical_Tables.md',
    mdText,
  );
  for (const tbl of tables) {
    zip.file(
      `01_Editable_Manuscript_Tables/CSV/${tbl.fileNameStem}.csv`,
      buildTableCsvContent(tbl, euComma),
    );
  }
  doneUnits++;

  // 3. Render all 34 High-Res Table PNGs
  for (let i = 0; i < tables.length; i++) {
    const tbl = tables[i];
    report(`Rendering high-res table plate ${i + 1}/${tables.length} (${tbl.tableCode})...`);
    await yieldFrame();
    const dataUrl = await renderTechnicalTableToPngDataUrl(tbl, 2);
    const b64 = dataUrl.split(',')[1] || '';
    zip.file(`02_Tables_HighRes_PNG/${tbl.fileNameStem}.png`, b64, { base64: true });
    doneUnits++;
  }

  // 4. Render all 20 English Diagram / Chart / Table Plates from Motor 3D
  for (let i = 0; i < diagramSpecs.length; i++) {
    const rawSpec = diagramSpecs[i];
    const enSpec = translateBookFigureSpecToEnglish(rawSpec, mode, euComma);
    report(`Rendering English diagram plate ${i + 1}/${diagramSpecs.length} (Fig. ${enSpec.figureNumber})...`);
    await yieldFrame();
    const rendered = await renderBookFigureToPng(enSpec, DEFAULT_ORBIT_OVERRIDE, 'hd_lossless', {
      preferSynthetic3D: true,
      diagramLocale: { lang: 'en', mode, euComma },
    });
    const b64 = rendered.dataUrl.split(',')[1] || '';
    zip.file(`03_Motor3D_Diagrams_and_Charts_EN_PNG/${enSpec.fileName}`, b64, { base64: true });
    doneUnits++;
  }

  // 5. Optional: Render all 43 English 3D Avatar Posture Plates
  for (let i = 0; i < postureSpecs.length; i++) {
    const rawSpec = postureSpecs[i];
    const enSpec = translateBookFigureSpecToEnglish(rawSpec, mode, euComma);
    report(`Rendering English 3D posture plate ${i + 1}/${postureSpecs.length} (Fig. ${enSpec.figureNumber}${enSpec.subPart || ''})...`);
    await yieldFrame();
    const rendered = await renderBookFigureToPng(enSpec, DEFAULT_ORBIT_OVERRIDE, 'hd_lossless', {
      preferSynthetic3D: true,
      diagramLocale: { lang: 'en', mode, euComma },
    });
    const b64 = rendered.dataUrl.split(',')[1] || '';
    zip.file(`04_Motor3D_3D_Posture_Figures_EN_PNG/${enSpec.fileName}`, b64, { base64: true });
    doneUnits++;
  }

  onProgress?.(99, 'Compressing ZIP archive...');
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  onProgress?.(100, 'Complete');

  const suffix =
    mode === 'us_ansi'
      ? 'US_ANSI_OSHA'
      : mode === 'eu_iso'
        ? euComma
          ? 'EU_ISO_CEN_Comma'
          : 'EU_ISO_CEN'
        : 'US_EU_International_Dual';

  return {
    blob,
    suggestedFileName: includeAll3DPosturesPng
      ? `Motor3D_English_Tables_and_All_63_Figures_${suffix}.zip`
      : `Motor3D_English_Tables_and_Diagrams_${suffix}.zip`,
    tablesCount: tables.length,
    diagramsCount: diagramSpecs.length,
    posturesCount: postureSpecs.length,
  };
}

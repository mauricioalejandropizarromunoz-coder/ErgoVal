import { DiagramVariantId } from '../types/figurePlan';
import { HandGripPresetId, renderHandGripPanel } from './handGrip3dRenderer';
import { drawCenteredManualFooter, sanitizeManualImageText } from './realisticHumanRig';

const C = {
  bg: '#ffffff',
  ink: '#0f172a',
  sub: '#334155',
  muted: '#64748b',
  border: '#cbd5e1',
  grid: '#e2e8f0',
  meshFill: 'rgba(186, 230, 253, 0.36)',
  meshStroke: '#475569',
  bone: '#cbd5e1',
  boneStroke: '#475569',
  nodeBlue: '#0284c7',
  nodeRing: '#0369a1',
  arcOrange: '#ea580c',
  vecBlue: '#1d4ed8',
  boxFill: '#f8fafc',
  accentBox: '#f0f9ff',
  warnBox: '#fff7ed',
};

/**
 * Strictly wraps text within `maxWidth`, respecting explicit `\n` line breaks
 * and splitting any oversized token so `measureText(line).width <= maxWidth` always holds.
 */
function wrapDiagramText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const safeMax = Math.max(24, maxWidth);
  const paragraphs = text.split('\n');
  const allLines: string[] = [];

  const splitLongWord = (word: string): string[] => {
    if (ctx.measureText(word).width <= safeMax) return [word];
    const chunks: string[] = [];
    let cur = '';
    for (const ch of word) {
      if (cur.length > 0 && ctx.measureText(cur + ch).width > safeMax) {
        chunks.push(cur);
        cur = ch;
      } else {
        cur += ch;
      }
    }
    if (cur) chunks.push(cur);
    return chunks;
  };

  for (const para of paragraphs) {
    const rawWords = para.trim().split(/\s+/).filter(Boolean);
    if (rawWords.length === 0) {
      continue;
    }
    const words: string[] = [];
    for (const w of rawWords) {
      words.push(...splitLongWord(w));
    }

    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${current} ${words[i]}`;
      if (ctx.measureText(candidate).width <= safeMax) {
        current = candidate;
      } else {
        allLines.push(current);
        current = words[i];
      }
    }
    allLines.push(current);
  }

  return allLines.length > 0 ? allLines : [''];
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color = C.vecBlue,
  width = 2.4,
  headLen = 9,
) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawContainedTag(
  ctx: CanvasRenderingContext2D,
  label: string,
  cx: number,
  cy: number,
  borderColor: string,
  textColor: string,
  bounds: { x: number; y: number; w: number; h: number },
  font = 'bold 11px "Public Sans", sans-serif',
) {
  const cleanLabel = sanitizeManualImageText(label) || label;
  ctx.save();
  ctx.font = font;
  const maxTextW = Math.max(48, bounds.w - 22);
  const lines = wrapDiagramText(ctx, cleanLabel, maxTextW);
  const lineH = 14;
  let maxLineW = 0;
  for (const ln of lines) {
    maxLineW = Math.max(maxLineW, ctx.measureText(ln).width);
  }
  const boxW = Math.ceil(maxLineW) + 14;
  const boxH = lines.length * lineH + 8;

  const clampedX = Math.max(
    bounds.x + boxW / 2 + 4,
    Math.min(bounds.x + bounds.w - boxW / 2 - 4, cx),
  );
  const clampedY = Math.max(
    bounds.y + boxH / 2 + 4,
    Math.min(bounds.y + bounds.h - boxH / 2 - 4, cy),
  );

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(clampedX - boxW / 2, clampedY - boxH / 2, boxW, boxH, 3);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const startY = clampedY - ((lines.length - 1) * lineH) / 2;
  lines.forEach((ln, idx) => {
    ctx.fillText(ln, clampedX, startY + idx * lineH + 0.5);
  });
  ctx.restore();
}

function drawCurvedAngleArc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  startRad: number,
  endRad: number,
  label: string,
  bounds?: { x: number; y: number; w: number; h: number },
) {
  const anticlockwise = startRad > endRad;
  ctx.save();

  // Semi-transparent blue angular sector fan with crisp black radial rays
  ctx.fillStyle = 'rgba(96, 165, 250, 0.38)';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, radius, startRad, endRad, anticlockwise);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#090d16';
  ctx.lineWidth = 1.35;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + radius * Math.cos(startRad), cy + radius * Math.sin(startRad));
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + radius * Math.cos(endRad), cy + radius * Math.sin(endRad));
  ctx.stroke();

  // Crisp black outer measurement arc + arrowhead
  ctx.strokeStyle = '#090d16';
  ctx.fillStyle = '#090d16';
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startRad, endRad, anticlockwise);
  ctx.stroke();

  const dir = anticlockwise ? -1 : 1;
  const ex = cx + radius * Math.cos(endRad);
  const ey = cy + radius * Math.sin(endRad);
  const tang = endRad + dir * (Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - 7.5 * Math.cos(tang - 0.45), ey - 7.5 * Math.sin(tang - 0.45));
  ctx.lineTo(ex - 7.5 * Math.cos(tang + 0.45), ey - 7.5 * Math.sin(tang + 0.45));
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const mid = (startRad + endRad) / 2;
  const lx = cx + (radius + 24) * Math.cos(mid);
  const ly = cy + (radius + 20) * Math.sin(mid);
  drawContainedTag(
    ctx,
    label,
    lx,
    ly,
    '#090d16',
    '#090d16',
    bounds ?? { x: 8, y: 46, w: ctx.canvas.width, h: ctx.canvas.height },
    'bold 11px "IBM Plex Mono", monospace',
  );
}

function drawNode(ctx: CanvasRenderingContext2D, x: number, y: number, r = 6) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r + 2.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(2, 132, 199, 0.2)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = C.nodeBlue;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.restore();
}

/**
 * Universal multi-line auto-fitting Flow Box.
 * Splits `\n`, wraps every line strictly inside `w - padX*2`, scales font down if needed,
 * and dynamically expands height if required so ZERO text can ever cross a box border.
 */
function drawFlowBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  sub?: string,
  accent: 'default' | 'blue' | 'orange' | 'dark' | 'green' = 'default',
  align: 'center' | 'left' = 'center',
): number {
  ctx.save();
  const padX = 11;
  const padY = 7;
  const availW = Math.max(36, w - padX * 2);
  const availH = Math.max(18, h - padY * 2);

  let chosenScale = 1.0;
  let titleLines: string[] = [];
  let subLines: string[] = [];
  let titleLH = 15;
  let subLH = 13.5;
  let gap = 4;

  for (let scale = 1.0; scale >= 0.68; scale -= 0.04) {
    chosenScale = scale;
    const tFontPx = +(12.4 * scale).toFixed(2);
    const sFontPx = +(11.0 * scale).toFixed(2);
    titleLH = Math.round(tFontPx * 1.24 * 10) / 10;
    subLH = Math.round(sFontPx * 1.26 * 10) / 10;
    gap = sub ? Math.max(3, Math.round(4.5 * scale)) : 0;

    ctx.font = `bold ${tFontPx}px "Plus Jakarta Sans", system-ui, sans-serif`;
    titleLines = title ? wrapDiagramText(ctx, title, availW) : [];

    ctx.font = `${sFontPx}px "Public Sans", system-ui, sans-serif`;
    subLines = sub ? wrapDiagramText(ctx, sub, availW) : [];

    const totalTextH =
      titleLines.length * titleLH + (subLines.length > 0 ? gap + subLines.length * subLH : 0);
    if (totalTextH <= availH) {
      break;
    }
  }

  const totalTextH =
    titleLines.length * titleLH + (subLines.length > 0 ? gap + subLines.length * subLH : 0);
  const finalH = Math.max(h, Math.ceil(totalTextH + padY * 2));

  ctx.fillStyle =
    accent === 'dark'
      ? '#0f172a'
      : accent === 'blue'
        ? '#f0f9ff'
        : accent === 'orange'
          ? '#fff7ed'
          : accent === 'green'
            ? '#f0fdf4'
            : '#f8fafc';
  ctx.strokeStyle =
    accent === 'dark'
      ? '#0f172a'
      : accent === 'blue'
        ? '#0284c7'
        : accent === 'orange'
          ? '#ea580c'
          : accent === 'green'
            ? '#16a34a'
            : '#94a3b8';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.roundRect(x, y, w, finalH, 6);
  ctx.fill();
  ctx.stroke();

  const tFontPx = +(12.4 * chosenScale).toFixed(2);
  const sFontPx = +(11.0 * chosenScale).toFixed(2);

  let curY = y + (finalH - totalTextH) / 2;
  const textX = align === 'left' ? x + padX : x + w / 2;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';

  ctx.fillStyle = accent === 'dark' ? '#ffffff' : C.ink;
  ctx.font = `bold ${tFontPx}px "Plus Jakarta Sans", system-ui, sans-serif`;
  for (const ln of titleLines) {
    ctx.fillText(ln, textX, curY);
    curY += titleLH;
  }

  if (subLines.length > 0) {
    curY += gap;
    ctx.fillStyle = accent === 'dark' ? '#e2e8f0' : C.sub;
    ctx.font = `${sFontPx}px "Public Sans", system-ui, sans-serif`;
    for (const ln of subLines) {
      ctx.fillText(ln, textX, curY);
      curY += subLH;
    }
  }

  ctx.restore();
  return finalH;
}

function drawContainedBanner(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  fill: string,
  border: string,
  textColor = C.ink,
  align: 'center' | 'left' = 'center',
) {
  ctx.save();
  const padX = 12;
  const availW = Math.max(40, w - padX * 2);

  let fontPx = 11.4;
  let lines: string[] = [text];
  for (let s = 11.4; s >= 8.6; s -= 0.4) {
    fontPx = +s.toFixed(1);
    ctx.font = `bold ${fontPx}px "Public Sans", system-ui, sans-serif`;
    lines = wrapDiagramText(ctx, text, availW);
    if (lines.length * (fontPx * 1.2) <= h - 4) break;
  }

  const lineH = fontPx * 1.22;
  const finalH = Math.max(h, Math.ceil(lines.length * lineH + 6));

  ctx.fillStyle = fill;
  ctx.strokeStyle = border;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.roundRect(x, y, w, finalH, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.font = `bold ${fontPx}px "Public Sans", system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const tx = align === 'left' ? x + padX : x + w / 2;
  const startY = y + finalH / 2 - ((lines.length - 1) * lineH) / 2;
  lines.forEach((ln, idx) => {
    ctx.fillText(ln, tx, startY + idx * lineH + 0.5);
  });
  ctx.restore();
}

/**
 * Universal Contained Table Renderer.
 * Guarantees every column header and every cell wraps strictly inside its column width,
 * draws crisp full grid borders, and expands row heights dynamically so ZERO text ever escapes.
 */
function drawContainedTable(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    totalWidth: number;
    colRatios: number[];
    colAligns?: ('left' | 'center' | 'right')[];
    colMono?: boolean[];
    headers: string[];
    rows: string[][];
    highlightRowIdx?: number;
    minRowH?: number;
    fontSize?: number;
  },
): number {
  const {
    x,
    y,
    totalWidth,
    colRatios,
    colAligns = [],
    colMono = [],
    headers,
    rows,
    highlightRowIdx = -1,
    minRowH = 34,
    fontSize = 11.2,
  } = opts;

  ctx.save();
  const ratioSum = colRatios.reduce((acc, v) => acc + v, 0) || 1;
  const colWidths = colRatios.map((r) => Math.floor((r / ratioSum) * totalWidth));
  const usedW = colWidths.reduce((acc, v) => acc + v, 0);
  colWidths[colWidths.length - 1] += totalWidth - usedW;

  const colX: number[] = [];
  let accX = x;
  for (const cw of colWidths) {
    colX.push(accX);
    accX += cw;
  }

  const cellPadX = 8;
  const cellPadY = 6;
  const headLineH = Math.round(fontSize * 1.24 * 10) / 10;

  // Measure header wrapped lines
  ctx.font = `bold ${fontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
  const wrappedHeaders = headers.map((h, i) =>
    wrapDiagramText(ctx, h, Math.max(20, colWidths[i] - cellPadX * 2)),
  );
  const maxHeadLines = Math.max(1, ...wrappedHeaders.map((l) => l.length));
  const headerH = Math.max(32, Math.ceil(maxHeadLines * headLineH + cellPadY * 2));

  let curY = y;

  // Draw Header Background & Borders
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x, curY, totalWidth, headerH);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  for (let i = 0; i < colWidths.length; i++) {
    ctx.strokeRect(colX[i], curY, colWidths[i], headerH);
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${fontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  wrappedHeaders.forEach((lines, i) => {
    const align = colAligns[i] || 'left';
    ctx.textAlign = align;
    const tx =
      align === 'center'
        ? colX[i] + colWidths[i] / 2
        : align === 'right'
          ? colX[i] + colWidths[i] - cellPadX
          : colX[i] + cellPadX;
    const startY = curY + headerH / 2 - ((lines.length - 1) * headLineH) / 2;
    lines.forEach((ln, li) => {
      ctx.fillText(ln, tx, startY + li * headLineH + 0.5);
    });
  });

  curY += headerH;

  // Draw Data Rows
  const bodyLineH = Math.round(fontSize * 1.26 * 10) / 10;
  rows.forEach((row, rIdx) => {
    const isHi = rIdx === highlightRowIdx;
    const wrappedCells = row.map((cell, cIdx) => {
      const family = colMono[cIdx]
        ? '"IBM Plex Mono", monospace'
        : '"Public Sans", system-ui, sans-serif';
      ctx.font = `${isHi ? 'bold ' : ''}${fontSize}px ${family}`;
      return wrapDiagramText(ctx, cell, Math.max(20, colWidths[cIdx] - cellPadX * 2));
    });

    const maxLines = Math.max(1, ...wrappedCells.map((l) => l.length));
    const rowH = Math.max(minRowH, Math.ceil(maxLines * bodyLineH + cellPadY * 2));

    ctx.fillStyle = isHi ? '#fff7ed' : rIdx % 2 === 0 ? '#f8fafc' : '#ffffff';
    ctx.fillRect(x, curY, totalWidth, rowH);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    for (let cIdx = 0; cIdx < colWidths.length; cIdx++) {
      ctx.strokeRect(colX[cIdx], curY, colWidths[cIdx], rowH);
    }

    wrappedCells.forEach((lines, cIdx) => {
      const align = colAligns[cIdx] || 'left';
      const family = colMono[cIdx]
        ? '"IBM Plex Mono", monospace'
        : '"Public Sans", system-ui, sans-serif';
      ctx.font = `${isHi ? 'bold ' : ''}${fontSize}px ${family}`;
      ctx.fillStyle = isHi ? '#c2410c' : C.ink;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';

      const tx =
        align === 'center'
          ? colX[cIdx] + colWidths[cIdx] / 2
          : align === 'right'
            ? colX[cIdx] + colWidths[cIdx] - cellPadX
            : colX[cIdx] + cellPadX;
      const startY = curY + rowH / 2 - ((lines.length - 1) * bodyLineH) / 2;
      lines.forEach((ln, li) => {
        ctx.fillText(ln, tx, startY + li * bodyLineH + 0.5);
      });
    });

    curY += rowH;
  });

  // Crisp outer table frame
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(x, y, totalWidth, curY - y);

  ctx.restore();
  return curY;
}

function drawHeader(ctx: CanvasRenderingContext2D, w: number, figLabel: string, title: string): number {
  const cleanFigLabel = sanitizeManualImageText(figLabel) || figLabel;
  const cleanTitle = sanitizeManualImageText(title) || title;
  ctx.save();
  ctx.font = 'bold 12px "IBM Plex Mono", monospace';
  const badgeW = Math.ceil(ctx.measureText(cleanFigLabel).width) + 14;
  const availW = Math.max(140, w - 32 - badgeW);

  let titlePx = 13.5;
  ctx.font = `bold ${titlePx}px "Plus Jakarta Sans", system-ui, sans-serif`;
  let lines = wrapDiagramText(ctx, cleanTitle, availW);
  if (lines.length > 2) {
    titlePx = 12;
    ctx.font = `bold ${titlePx}px "Plus Jakarta Sans", system-ui, sans-serif`;
    lines = wrapDiagramText(ctx, cleanTitle, availW);
  }
  const lineH = Math.round(titlePx * 1.25);
  const headerH = Math.max(44, lines.length * lineH + 16);

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, w, headerH);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, headerH);
  ctx.lineTo(w, headerH);
  ctx.stroke();

  ctx.fillStyle = '#090d16';
  ctx.font = 'bold 12px "IBM Plex Mono", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(cleanFigLabel, 16, headerH / 2);

  ctx.fillStyle = C.ink;
  ctx.font = `bold ${titlePx}px "Plus Jakarta Sans", system-ui, sans-serif`;
  const startY = headerH / 2 - ((lines.length - 1) * lineH) / 2;
  lines.forEach((ln, idx) => {
    ctx.fillText(ln, 16 + badgeW, startY + idx * lineH + 0.5);
  });

  ctx.restore();
  return headerH;
}

/**
 * Renders a complete 3D humanized hand+grip card with header badge, 3D WebGL viewport,
 * biomechanical overlays, and a strictly contained bottom summary box.
 */
function drawHumanHandCard(
  ctx: CanvasRenderingContext2D,
  cardRect: { x: number; y: number; w: number; h: number },
  preset: HandGripPresetId,
  title: string,
  badge: string,
  detailNote: string,
  badgeAccent: 'blue' | 'orange' | 'green',
  dpiScale: number,
  overlayCb?: (
    pts: ReturnType<typeof renderHandGripPanel>,
    viewBounds: { x: number; y: number; w: number; h: number },
  ) => void,
) {
  const { x, y, w, h } = cardRect;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();

  const topBarH = 54;
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, w - 2, topBarH, [7, 7, 0, 0]);
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + topBarH);
  ctx.lineTo(x + w, y + topBarH);
  ctx.stroke();

  ctx.fillStyle = C.ink;
  ctx.font = 'bold 12.5px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tLines = wrapDiagramText(ctx, title, w - 16);
  ctx.fillText(tLines[0], x + w / 2, y + 17);

  const badgeCol =
    badgeAccent === 'green' ? '#15803d' : badgeAccent === 'orange' ? '#c2410c' : '#0369a1';
  const badgeBg =
    badgeAccent === 'green' ? '#f0fdf4' : badgeAccent === 'orange' ? '#fff7ed' : '#f0f9ff';
  drawContainedBanner(ctx, x + 12, y + 29, w - 24, 20, badge, badgeBg, badgeCol, badgeCol, 'center');

  const bottomBoxH = 68;
  const viewRect = {
    x: x + 6,
    y: y + topBarH + 4,
    w: w - 12,
    h: h - topBarH - bottomBoxH - 12,
  };

  const pts = renderHandGripPanel(ctx, preset, viewRect, dpiScale);
  if (overlayCb) {
    overlayCb(pts, viewRect);
  }

  drawFlowBox(
    ctx,
    x + 8,
    y + h - bottomBoxH - 6,
    w - 16,
    bottomBoxH,
    '',
    detailNote,
    badgeAccent === 'orange' ? 'orange' : badgeAccent === 'green' ? 'green' : 'blue',
    'center',
  );

  ctx.restore();
}

export function renderDiagramVariant(
  canvas: HTMLCanvasElement,
  variant: DiagramVariantId,
  width: number,
  height: number,
  dpiScale = 1,
) {
  const scale = Math.max(1, dpiScale);
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, width, height);

  const fullBounds = { x: 8, y: 50, w: width - 16, h: height - 58 };

  switch (variant) {
    case 'fig_1_01_redesign_cycle': {
      const headerH = drawHeader(
        ctx,
        width,
        'FIGURA 1.1',
        'Reducción del riesgo ergonómico mediante el rediseño del puesto',
      );
      const topY = headerH + 18;
      const boxW = 172;
      const boxH = 86;
      const gap = 21;
      const startX = 24;

      const steps = [
        {
          t: '1. Puesto Original',
          s: 'Exigencia biomecánica\nsuperior a la capacidad',
          acc: 'orange' as const,
        },
        {
          t: '2. Medición y Método',
          s: 'Toma de datos e índice\ncuantitativo de riesgo',
          acc: 'blue' as const,
        },
        {
          t: '3. Rediseño Técnico',
          s: 'Ingeniería · alturas\nayudas · pausas',
          acc: 'dark' as const,
        },
        {
          t: '4. Puesto Seguro',
          s: 'Reevaluación: nivel de\nriesgo aceptable',
          acc: 'green' as const,
        },
      ];

      steps.forEach((st, idx) => {
        const bx = startX + idx * (boxW + gap);
        drawFlowBox(ctx, bx, topY, boxW, boxH, st.t, st.s, st.acc);
        if (idx < steps.length - 1) {
          drawArrow(
            ctx,
            bx + boxW + 2,
            topY + boxH / 2,
            bx + boxW + gap - 3,
            topY + boxH / 2,
            C.vecBlue,
            2.4,
            7.5,
          );
        }
      });

      // Lower comparative risk reduction chart panel
      const panelX = 24;
      const panelY = topY + boxH + 20;
      const panelW = width - 48;
      const panelH = height - panelY - 16;

      ctx.save();
      ctx.strokeStyle = C.border;
      ctx.fillStyle = '#f8fafc';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(panelX, panelY, panelW, panelH, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = C.ink;
      ctx.font = 'bold 12px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        'Evolución de la carga biomecánica (Momento / Fuerza F vs. Umbral admisible)',
        panelX + 20,
        panelY + 22,
      );

      const baseY = panelY + panelH - 42;
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(panelX + 50, panelY + 44);
      ctx.lineTo(panelX + 50, baseY);
      ctx.lineTo(panelX + panelW - 36, baseY);
      ctx.stroke();

      // Bar 1: Before redesign
      const bar1X = 135;
      const barW = 148;
      const bar1H = 178;
      const bar1Y = baseY - bar1H;
      ctx.fillStyle = '#ea580c';
      ctx.beginPath();
      ctx.roundRect(bar1X, bar1Y, barW, bar1H, [6, 6, 0, 0]);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 12px "IBM Plex Mono", monospace';
      ctx.fillText('RIESGO ALTO', bar1X + barW / 2, bar1Y + 46);
      ctx.font = '11px "Public Sans", system-ui, sans-serif';
      ctx.fillText('Demanda > Capacidad', bar1X + barW / 2, bar1Y + 66);

      // Threshold line (drawn across chart with contained tag on right)
      const threshY = baseY - 82;
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(panelX + 50, threshY);
      ctx.lineTo(panelX + panelW - 36, threshY);
      ctx.stroke();
      ctx.restore();

      drawContainedTag(
        ctx,
        'Límite de tolerancia tisular (RWL / TLV)',
        595,
        threshY - 18,
        '#16a34a',
        '#15803d',
        { x: panelX + 60, y: panelY + 36, w: panelW - 80, h: panelH - 60 },
        'bold 10.5px "IBM Plex Mono", monospace',
      );

      // Intervention arrow & contained box between bars
      drawArrow(ctx, bar1X + barW + 18, baseY - 112, 474, baseY - 112, C.arcOrange, 2.8, 9);
      drawFlowBox(
        ctx,
        304,
        baseY - 100,
        166,
        54,
        'Intervención técnica',
        'Distancias (H) y ángulos (α)',
        'orange',
      );

      // Bar 2: After redesign
      const bar2X = 492;
      const bar2H = 54;
      const bar2Y = baseY - bar2H;
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.roundRect(bar2X, bar2Y, barW, bar2H, [6, 6, 0, 0]);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 11.5px "IBM Plex Mono", monospace';
      ctx.fillText('RIESGO ACEPTABLE', bar2X + barW / 2, bar2Y + bar2H / 2 + 1);

      // X-axis captions
      ctx.fillStyle = C.ink;
      ctx.font = 'bold 11.5px "Public Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Antes del rediseño', bar1X + barW / 2, baseY + 20);
      ctx.fillText('Después del rediseño', bar2X + barW / 2, baseY + 20);
      ctx.restore();
      break;
    }

    case 'fig_4_18_rula_flow': {
      drawHeader(ctx, width, 'FIGURA 4.18', 'Procedimiento de aplicación del método RULA');
      drawFlowBox(ctx, 32, 68, 276, 62, 'GRUPO A: Miembro Superior', 'Brazo · Antebrazo · Muñeca · Giro', 'blue');
      drawFlowBox(ctx, 332, 68, 276, 62, 'GRUPO B: Cuello, Tronco y Piernas', 'Ángulos respecto a ejes de referencia', 'blue');

      drawArrow(ctx, 170, 130, 170, 172, C.vecBlue);
      drawArrow(ctx, 470, 130, 470, 172, C.vecBlue);

      drawFlowBox(ctx, 48, 175, 244, 56, 'Puntuación Global Grupo A', 'Tabla 4.14 (valores de 1 a 9)');
      drawFlowBox(ctx, 348, 175, 244, 56, 'Puntuación Global Grupo B', 'Tabla 4.15 (valores de 1 a 9)');

      drawArrow(ctx, 170, 231, 170, 280, C.vecBlue);
      drawArrow(ctx, 470, 231, 470, 280, C.vecBlue);

      drawFlowBox(
        ctx,
        100,
        284,
        440,
        66,
        'Correcciones: Actividad Muscular y Fuerza',
        'Tabla 4.16 (+1 estática o repetitiva) + Tabla 4.17 (0 a +3 por carga/fuerza)',
        'orange',
      );

      drawArrow(ctx, 220, 350, 170, 402, C.arcOrange);
      drawArrow(ctx, 420, 350, 470, 402, C.arcOrange);

      drawFlowBox(ctx, 48, 406, 244, 58, 'Puntuación C', 'Grupo A + Actividad + Fuerza', 'blue');
      drawFlowBox(ctx, 348, 406, 244, 58, 'Puntuación D', 'Grupo B + Actividad + Fuerza', 'blue');

      drawArrow(ctx, 170, 464, 275, 518, C.vecBlue);
      drawArrow(ctx, 470, 464, 365, 518, C.vecBlue);

      drawFlowBox(
        ctx,
        130,
        522,
        380,
        62,
        'PUNTUACIÓN FINAL RULA (1 a 7)',
        'Tabla 4.18 (cruce de Puntuación C y Puntuación D)',
        'dark',
      );
      drawArrow(ctx, 320, 584, 320, 622, C.vecBlue);

      const levels = [
        { y: 628, t: 'Nivel 1 (1–2 ptos): Postura aceptable si no se repite o mantiene', c: '#f0fdf4', b: '#16a34a' },
        { y: 666, t: 'Nivel 2 (3–4 ptos): Pueden requerirse cambios · Investigar tarea', c: '#fefce8', b: '#ca8a04' },
        { y: 704, t: 'Nivel 3 (5–6 ptos): Se requiere rediseño pronto de la tarea', c: '#fff7ed', b: '#ea580c' },
        { y: 742, t: 'Nivel 4 (7 ptos): Se requieren cambios urgentes en el puesto', c: '#fef2f2', b: '#dc2626' },
      ];
      levels.forEach((lv) => {
        drawContainedBanner(ctx, 56, lv.y, 528, 31, lv.t, lv.c, lv.b);
      });
      break;
    }

    case 'fig_4_25_reba_flow': {
      drawHeader(ctx, width, 'FIGURA 4.25', 'Procedimiento de aplicación del método REBA');
      drawFlowBox(ctx, 30, 68, 278, 60, 'GRUPO A: Tronco, Cuello y Piernas', 'Tablas 4.21 a 4.26 → Tabla 4.27 (1–8)', 'blue');
      drawFlowBox(ctx, 332, 68, 278, 60, 'GRUPO B: Brazo, Antebrazo y Muñeca', 'Tablas 4.28 a 4.32 → Tabla 4.33 (1–8)', 'blue');

      drawArrow(ctx, 169, 128, 169, 170, C.vecBlue);
      drawArrow(ctx, 471, 128, 471, 170, C.vecBlue);

      drawFlowBox(
        ctx,
        34,
        174,
        270,
        62,
        '+ Carga / Fuerza (Tabla 4.34)',
        '0 (<5 kg) · +1 (5–10 kg) · +2 (>10 kg)\n+1 si fuerza brusca o repentina',
        'orange',
      );
      drawFlowBox(
        ctx,
        336,
        174,
        270,
        62,
        '+ Tipo de Agarre (Tabla 4.35)',
        '0 (bueno) · +1 (aceptable)\n+2 (malo) · +3 (inaceptable)',
        'orange',
      );

      drawArrow(ctx, 169, 236, 169, 278, C.arcOrange);
      drawArrow(ctx, 471, 236, 471, 278, C.arcOrange);

      drawFlowBox(ctx, 52, 282, 234, 52, 'Puntuación A corregida', 'Entrada por filas en Tabla C');
      drawFlowBox(ctx, 354, 282, 234, 52, 'Puntuación B corregida', 'Entrada por columnas en Tabla C');

      drawArrow(ctx, 169, 334, 275, 384, C.vecBlue);
      drawArrow(ctx, 471, 334, 365, 384, C.vecBlue);

      drawFlowBox(
        ctx,
        135,
        388,
        370,
        54,
        'Puntuación Tabla C (Tabla 4.37)',
        'Combinación biomecánica global de ambos grupos',
        'blue',
      );
      drawArrow(ctx, 320, 442, 320, 478, C.vecBlue);

      drawFlowBox(
        ctx,
        95,
        482,
        450,
        56,
        '+ Actividad Muscular (Tabla 4.36)',
        '+1 estática >1 min · +1 repetitiva >4/min · +1 cambio postural brusco',
        'orange',
      );
      drawArrow(ctx, 320, 538, 320, 572, C.arcOrange);

      drawFlowBox(
        ctx,
        125,
        576,
        390,
        52,
        'PUNTUACIÓN FINAL REBA (1 a 15)',
        'Determinación del Nivel de Actuación (Tabla 4.38)',
        'dark',
      );

      const rebaLv = [
        'Nivel 0 (1 pto): Riesgo inapreciable — No es necesaria actuación',
        'Nivel 1 (2–3 ptos): Riesgo bajo — Puede ser necesaria la actuación',
        'Nivel 2 (4–7 ptos): Riesgo medio — Es necesaria la actuación',
        'Nivel 3 (8–10 ptos): Riesgo alto — Es necesaria actuación cuanto antes',
        'Nivel 4 (11–15 ptos): Riesgo muy alto — Es necesaria actuación inmediata',
      ];
      rebaLv.forEach((txt, idx) => {
        const y = 640 + idx * 30;
        drawContainedBanner(
          ctx,
          52,
          y,
          536,
          25,
          txt,
          idx >= 3 ? '#fff7ed' : '#f8fafc',
          idx >= 3 ? '#ea580c' : '#cbd5e1',
        );
      });
      break;
    }

    case 'fig_4_26_owas_table': {
      const headerH = drawHeader(
        ctx,
        width,
        'FIGURA 4.26',
        'Ejemplo de registro de observaciones y codificación OWAS',
      );

      // 4-digit OWAS structure cards across 752px width
      const digits = [
        { d: '2', name: '1° Dígito: Espalda', r: 'Códigos 1 a 4 (Flexionada)' },
        { d: '2', name: '2° Dígito: Brazos', r: 'Códigos 1 a 3 (1 sobre hombro)' },
        { d: '4', name: '3° Dígito: Piernas', r: 'Códigos 1 a 7 (Flexionadas)' },
        { d: '3', name: '4° Dígito: Carga', r: 'Códigos 1 a 3 (> 20 kg)' },
      ];
      const cardW = 176;
      const cardGap = 16;
      const cardY = headerH + 14;
      const cardH = 86;

      digits.forEach((dg, idx) => {
        const cx = 24 + idx * (cardW + cardGap);
        ctx.save();
        ctx.fillStyle = '#f0f9ff';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.roundRect(cx, cardY, cardW, cardH, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = C.nodeBlue;
        ctx.font = 'bold 24px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(dg.d, cx + cardW / 2, cardY + 26);

        ctx.fillStyle = C.ink;
        ctx.font = 'bold 11.5px "Plus Jakarta Sans", system-ui, sans-serif';
        const nLines = wrapDiagramText(ctx, dg.name, cardW - 14);
        ctx.fillText(nLines[0], cx + cardW / 2, cardY + 52);

        ctx.fillStyle = C.sub;
        ctx.font = '10.5px "Public Sans", system-ui, sans-serif';
        const rLines = wrapDiagramText(ctx, dg.r, cardW - 14);
        ctx.fillText(rLines[0], cx + cardW / 2, cardY + 70);
        ctx.restore();
      });

      // Contained Observation Table (Tabla 4.45) — zero cell or border overflow
      const tableBottomY = drawContainedTable(ctx, {
        x: 24,
        y: cardY + cardH + 16,
        totalWidth: 752,
        colRatios: [0.31, 0.16, 0.12, 0.12, 0.29],
        colAligns: ['left', 'center', 'center', 'center', 'left'],
        colMono: [false, true, true, true, false],
        headers: [
          'Fase / Postura observada',
          'Código OWAS',
          'Frec. (N)',
          'Frec. (%)',
          'Categoría de Acción',
        ],
        rows: [
          ['Tomar saco desde el suelo', '2 - 2 - 4 - 3', '30', '30 %', 'Categoría 4 (Inmediata)'],
          ['Depositar saco en plataforma', '3 - 1 - 2 - 3', '35', '35 %', 'Categoría 3 (Corto plazo)'],
          ['Caminar sin carga', '1 - 1 - 7 - 1', '25', '25 %', 'Categoría 1 (Aceptable)'],
          ['Espera de material de pie', '1 - 1 - 2 - 1', '10', '10 %', 'Categoría 1 (Aceptable)'],
        ],
        highlightRowIdx: 0,
        minRowH: 36,
        fontSize: 11.2,
      });

      // Frequency distribution stacked bar
      const barLabelY = Math.min(height - 56, tableBottomY + 22);
      ctx.save();
      ctx.fillStyle = C.ink;
      ctx.font = 'bold 11.8px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('Distribución porcentual del ciclo (N = 100 observaciones):', 24, barLabelY);

      const barY = barLabelY + 14;
      const barH = 30;
      const totalBarW = 752;
      const w1 = Math.round(totalBarW * 0.35);
      const w2 = Math.round(totalBarW * 0.35);
      const w3 = totalBarW - w1 - w2;

      ctx.fillStyle = '#16a34a';
      ctx.fillRect(24, barY, w1, barH);
      ctx.fillStyle = '#f97316';
      ctx.fillRect(24 + w1, barY, w2, barH);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(24 + w1 + w2, barY, w3, barH);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(24, barY, totalBarW, barH);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Cat. 1 (Aceptable): 35%', 24 + w1 / 2, barY + barH / 2 + 0.5);
      ctx.fillText('Cat. 3 (Pronto): 35%', 24 + w1 + w2 / 2, barY + barH / 2 + 0.5);
      ctx.fillText('Cat. 4 (Inmediata): 30%', 24 + w1 + w2 + w3 / 2, barY + barH / 2 + 0.5);
      ctx.restore();
      break;
    }

    case 'fig_4_30_owas_loads': {
      const headerH = drawHeader(
        ctx,
        width,
        'FIGURA 4.30',
        'Codificación del cuarto dígito OWAS: magnitud de la carga o fuerza',
      );
      const cards = [
        {
          code: 'Código 1',
          wLabel: 'Q < 10 kg',
          sub: 'Carga ligera o sin esfuerzo significativo',
          vec: 30,
          acc: 'blue' as const,
          col: '#0284c7',
        },
        {
          code: 'Código 2',
          wLabel: '10 kg ≤ Q ≤ 20 kg',
          sub: 'Esfuerzo moderado sostenido o repetido',
          vec: 48,
          acc: 'orange' as const,
          col: '#ea580c',
        },
        {
          code: 'Código 3',
          wLabel: 'Q > 20 kg',
          sub: 'Carga elevada con alta exigencia raquídea',
          vec: 66,
          acc: 'orange' as const,
          col: '#dc2626',
        },
      ];

      const cardW = 240;
      const gap = 16;
      const startX = 24;
      const cardY = headerH + 12;
      const cardH = height - cardY - 34;

      cards.forEach((c, idx) => {
        const x = startX + idx * (cardW + gap);
        drawHumanHandCard(
          ctx,
          { x, y: cardY, w: cardW, h: cardH },
          'owas_load_grip',
          `${c.code} — ${c.wLabel}`,
          `4° Dígito OWAS = ${idx + 1}`,
          c.sub,
          c.acc,
          scale,
          (pts, viewBounds) => {
            const pX = pts.propCenter.x;
            const pY = Math.min(viewBounds.y + viewBounds.h - c.vec - 14, pts.propCenter.y + 8);
            drawArrow(ctx, pX, pY, pX, pY + c.vec, '#090d16', 2.8, 9);
            drawContainedTag(
              ctx,
              `F (${c.wLabel})`,
              pX,
              pY + c.vec + 14,
              '#090d16',
              '#090d16',
              viewBounds,
              'bold 10.5px "IBM Plex Mono", monospace',
            );
          },
        );
      });
      drawCenteredManualFooter(ctx, width, height, 26);
      break;
    }

    case 'fig_5_03_niosh_d_a': {
      const headerH = drawHeader(
        ctx,
        width,
        'FIGURA 5.3',
        'Desplazamiento vertical (D) en vista lateral y ángulo de asimetría (A)',
      );
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(400, headerH);
      ctx.lineTo(400, height - 26);
      ctx.stroke();

      const rightBounds = { x: 410, y: headerH + 6, w: 376, h: height - headerH - 34 };

      ctx.fillStyle = C.ink;
      ctx.font = 'bold 12.5px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Vista Lateral: Desplazamiento D = |V₂ − V₁|', 200, headerH + 24);
      ctx.fillText('Vista Superior: Ángulo de Asimetría A (°)', 600, headerH + 24);

      // Left panel: Floor & boxes V1, V2
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(40, 428);
      ctx.lineTo(360, 428);
      ctx.stroke();

      ctx.fillStyle = C.meshFill;
      ctx.strokeStyle = C.nodeBlue;
      ctx.fillRect(96, 350, 88, 48);
      ctx.strokeRect(96, 350, 88, 48);
      ctx.fillStyle = C.ink;
      ctx.font = 'bold 11px "IBM Plex Mono", monospace';
      ctx.fillText('Origen (V₁)', 140, 378);

      ctx.fillStyle = 'rgba(234, 88, 12, 0.14)';
      ctx.strokeStyle = C.arcOrange;
      ctx.fillRect(96, 170, 88, 48);
      ctx.strokeRect(96, 170, 88, 48);
      ctx.fillStyle = C.ink;
      ctx.fillText('Destino (V₂)', 140, 198);

      drawArrow(ctx, 218, 374, 218, 194, '#090d16', 2.4);
      drawArrow(ctx, 218, 194, 218, 374, '#090d16', 2.4);
      drawFlowBox(
        ctx,
        236,
        250,
        142,
        66,
        'D = |V₂ − V₁|',
        'DM = 0,82 + 4,5 / D',
        'orange',
      );

      // Right panel: Photorealistic top-down worker (dark-grey short-sleeve scrubs, natural skin forearms/head)
      const tx = 568;
      const ty = 286;

      // Grounded anatomical feet aligned with sagittal neutral axis
      ctx.fillStyle = '#6b737e';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect(tx - 38, ty - 42, 22, 48, 10);
      ctx.roundRect(tx + 16, ty - 42, 22, 48, 10);
      ctx.fill();
      ctx.stroke();

      const asymRad = -Math.PI / 2 + (45 * Math.PI) / 180;
      const lx = tx + 134 * Math.cos(asymRad);
      const ly = ty + 134 * Math.sin(asymRad);

      // Rotated shoulders (dark-grey scrubs) + skin forearms reaching toward load
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate((45 * Math.PI) / 180);

      // Natural warm skin forearms & hands
      ctx.fillStyle = '#c49379';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-48, -116, 18, 108, 9);
      ctx.roundRect(30, -116, 18, 108, 9);
      ctx.fill();
      ctx.stroke();

      // Solid dark-grey short-sleeve scrub sleeves over deltoids/proximal humerus
      ctx.fillStyle = '#383f48';
      ctx.strokeStyle = '#1e293b';
      ctx.beginPath();
      ctx.roundRect(-50, -48, 22, 46, 8);
      ctx.roundRect(28, -48, 22, 46, 8);
      ctx.fill();
      ctx.stroke();

      // Solid dark-grey scrubs top across shoulders & thorax
      ctx.beginPath();
      ctx.ellipse(0, 0, 56, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Human head crown (warm skin + neat dark cropped hair)
      ctx.fillStyle = '#c49379';
      ctx.beginPath();
      ctx.ellipse(0, -4, 22, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#2f2723';
      ctx.beginPath();
      ctx.ellipse(0, 2, 21, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      drawNode(ctx, tx, ty, 6);

      // Sagittal neutral axis (up)
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx, ty - 160);
      ctx.stroke();
      ctx.restore();
      drawContainedTag(ctx, 'Plano sagital neutro (0°)', tx - 14, ty - 174, '#090d16', '#090d16', rightBounds);

      // Asymmetric load line & box
      drawArrow(ctx, tx, ty, lx, ly, '#090d16', 2.4);
      ctx.fillStyle = '#fde68a';
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 1.8;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate((45 * Math.PI) / 180);
      ctx.fillRect(-30, -20, 60, 40);
      ctx.strokeRect(-30, -20, 60, 40);
      ctx.restore();
      drawContainedTag(ctx, 'Carga', lx, ly, '#090d16', '#090d16', rightBounds, 'bold 10.5px "IBM Plex Mono", monospace');

      drawCurvedAngleArc(ctx, tx, ty, 76, -Math.PI / 2, asymRad, 'A = 45°', rightBounds);
      drawFlowBox(ctx, 465, 424, 260, 52, 'Multiplicador de Asimetría', 'AM = 1 − 0,0032 · A', 'blue');
      drawCenteredManualFooter(ctx, width, height, 26);
      break;
    }

    case 'fig_5_04_niosh_couplings': {
      const headerH = drawHeader(
        ctx,
        width,
        'FIGURA 5.4',
        'Clasificación de la calidad del agarre mano-carga en NIOSH (Tabla 5.8)',
      );
      const cardW = 242;
      const gap = 15;
      const startX = 22;
      const cardY = headerH + 12;
      const cardH = height - cardY - 34;

      // 1. AGARRE BUENO
      drawHumanHandCard(
        ctx,
        { x: startX, y: cardY, w: cardW, h: cardH },
        'niosh_good_handle',
        '1. Agarre Bueno',
        'CM = 1,00 · Con asas anatómicas',
        'Dedos y pulgar en oposición envuelven el asa cilíndrica con muñeca neutra (0°).',
        'green',
        scale,
        (pts, vb) => {
          drawArrow(ctx, pts.propCenter.x, pts.propCenter.y - 10, pts.propCenter.x, pts.propCenter.y - 54, '#090d16', 2.6, 8.5);
          drawContainedTag(ctx, 'F sujeción firme', pts.propCenter.x, pts.propCenter.y - 68, '#090d16', '#090d16', vb);
        },
      );

      // 2. AGARRE REGULAR
      drawHumanHandCard(
        ctx,
        { x: startX + cardW + gap, y: cardY, w: cardW, h: cardH },
        'niosh_fair_hook90',
        '2. Agarre Regular',
        'CM = 0,95 (V<75) / 1,00',
        'Caja sin asas: palma en base y los 4 dedos flexionados a 90° sujetando el borde.',
        'blue',
        scale,
        (pts, vb) => {
          drawCurvedAngleArc(ctx, pts.indexMcp.x - 6, pts.indexMcp.y + 4, 28, -Math.PI, -Math.PI / 2, 'α ≈ 90°', vb);
        },
      );

      // 3. AGARRE MALO
      drawHumanHandCard(
        ctx,
        { x: startX + (cardW + gap) * 2, y: cardY, w: cardW, h: cardH },
        'niosh_poor_bulky',
        '3. Agarre Malo',
        'CM = 0,90 · Sin asideros',
        'Bulto voluminoso o irregular: dedos abiertos por fricción y muñeca desviada.',
        'orange',
        scale,
        (pts, vb) => {
          const wAng = Math.atan2(pts.indexMcp.y - pts.wrist.y, pts.indexMcp.x - pts.wrist.x);
          drawCurvedAngleArc(ctx, pts.wrist.x, pts.wrist.y, 34, -0.25, wAng, 'α > 25°', vb);
        },
      );
      drawCenteredManualFooter(ctx, width, height, 26);
      break;
    }

    case 'fig_6_01_ocra_structure': {
      drawHeader(ctx, width, 'FIGURA 6.1', 'Estructura del método OCRA: factores y cálculo del índice');
      drawFlowBox(ctx, 36, 68, 272, 62, 'Acciones Realizadas (ATA)', 'Frecuencia × Duración neta (min)', 'orange');
      drawFlowBox(ctx, 332, 68, 272, 62, 'Constante de Referencia', '30 acciones técnicas / minuto', 'blue');

      const mults = [
        ['Fm · Fuerza', 'Escala de Borg CR-10 (0,15 a 1,00) — Tabla 6.3'],
        ['Fp · Postura', 'Hombro, codo, muñeca y tipo de prensión (0,50 a 1,00) — Tabla 6.4'],
        ['Ff · Repetitividad', 'Duración del ciclo y cadencia (0,30 a 1,00) — Tabla 6.5'],
        ['Fe · Estereotipia', 'Identidad gestual entre ciclos (0,70 a 1,00) — Tabla 6.6'],
        ['Fa · Agentes físicos', 'Vibraciones, frío, guantes o golpes (0,80 a 1,00) — Tabla 6.7'],
        ['Ft · Recuperación', 'Distribución de pausas por hora (0,70 a 1,00) — Tabla 6.8'],
        ['Fc · Duración', 'Tiempo total repetitivo en jornada (0,60 a 1,00) — Tabla 6.9'],
      ];
      mults.forEach(([m, desc], idx) => {
        const y = 152 + idx * 55;
        drawFlowBox(ctx, 64, y, 512, 46, m, desc);
      });

      drawArrow(ctx, 320, 538, 320, 574, C.vecBlue, 2.5);
      drawFlowBox(
        ctx,
        48,
        578,
        544,
        62,
        'ATA de referencia = 30 × Fm × Fp × Ff × Fe × Fa × Ft × Fc × t',
        'Capacidad admisible corregida para las condiciones reales del puesto',
        'blue',
      );
      drawArrow(ctx, 320, 640, 320, 676, C.arcOrange, 2.6);
      drawFlowBox(
        ctx,
        58,
        680,
        524,
        78,
        'ÍNDICE OCRA = ATA realizadas / ATA de referencia',
        '≤ 2,2 Aceptable · 2,3–3,5 Límite · 3,6–4,5 Riesgo Alto · > 4,5 Riesgo Muy Alto',
        'dark',
      );
      break;
    }

    case 'fig_6_02_ocra_actions': {
      const headerH = drawHeader(
        ctx,
        width,
        'FIGURA 6.2',
        'Ejemplos de acciones técnicas dinámicas y estáticas en OCRA',
      );
      const cardW = 366;
      const gap = 20;
      const startX = 24;
      const cardY = headerH + 12;
      const cardH = height - cardY - 34;

      // Left: Dynamic Technical Action
      drawHumanHandCard(
        ctx,
        { x: startX, y: cardY, w: cardW, h: cardH },
        'ocra_dynamic_grasp',
        'Acción Técnica Dinámica',
        'Conteo cíclico: Alcanzar · Tomar · Colocar',
        'Contracción isotónica breve con alternancia entre prensión de la pieza y relajación muscular.',
        'blue',
        scale,
        (pts, vb) => {
          drawCurvedAngleArc(ctx, pts.propCenter.x, pts.propCenter.y + 8, 48, -1.9, -0.5, 'Ciclo dinámico', vb);
          drawArrow(ctx, pts.propCenter.x + 8, pts.propCenter.y + 10, pts.propCenter.x + 14, pts.propCenter.y + 48, '#090d16', 2.4, 8);
        },
      );

      // Right: Static Technical Action (Pinch >= 5s)
      drawHumanHandCard(
        ctx,
        { x: startX + cardW + gap, y: cardY, w: cardW, h: cardH },
        'ocra_static_pinch',
        'Acción Técnica Estática',
        'Prensión en pinza sostenida ≥ 5 s continuos',
        'Contracción isométrica continua: pulgar e índice sujetan la pieza sin soltarla (penaliza recuperación).',
        'orange',
        scale,
        (pts, vb) => {
          drawArrow(ctx, pts.indexTip.x, pts.indexTip.y - 34, pts.indexTip.x, pts.indexTip.y - 4, '#090d16', 2.5, 8);
          drawArrow(ctx, pts.thumbTip.x, pts.thumbTip.y + 34, pts.thumbTip.x, pts.thumbTip.y + 4, '#090d16', 2.5, 8);
          drawContainedTag(ctx, 'F pinza isométrica (t ≥ 5 s)', pts.propCenter.x + 18, pts.indexTip.y - 46, '#090d16', '#090d16', vb);
        },
      );
      drawCenteredManualFooter(ctx, width, height, 26);
      break;
    }

    case 'fig_6_04_jsi_wrists': {
      const headerH = drawHeader(
        ctx,
        width,
        'FIGURA 6.4',
        'Posturas de la mano y de la muñeca en el método JSI (Tabla 6.22)',
      );
      const cardW = 242;
      const gap = 15;
      const startX = 22;
      const cardY = headerH + 12;
      const cardH = height - cardY - 34;

      // 1. Neutra (PM = 1)
      drawHumanHandCard(
        ctx,
        { x: startX, y: cardY, w: cardW, h: cardH },
        'jsi_neutral',
        '1. Muñeca Neutra Alineada',
        'PM = 1,0 · Postura muy buena',
        'Eje del antebrazo y 3er metacarpiano colineales (α ≈ 0°) sujetando empuñadura.',
        'green',
        scale,
        (pts, vb) => {
          ctx.save();
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = '#090d16';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(pts.forearmRef.x, pts.forearmRef.y);
          ctx.lineTo(pts.mc3Head.x + 18, pts.mc3Head.y);
          ctx.stroke();
          ctx.restore();
          drawContainedTag(ctx, 'α ≈ 0° (neutra)', pts.wrist.x + 16, pts.wrist.y - 36, '#090d16', '#090d16', vb);
        },
      );

      // 2. Flexión / Extensión Marcada (PM = 3)
      drawHumanHandCard(
        ctx,
        { x: startX + cardW + gap, y: cardY, w: cardW, h: cardH },
        'jsi_flexed',
        '2. Flexión / Ext. Marcada',
        'PM = 3,0 · Riesgo moderado',
        'Agarre con flexión o extensión radiocarpiana evidente (25°–35°) sobre herramienta.',
        'blue',
        scale,
        (pts, vb) => {
          const refAng = Math.atan2(pts.wrist.y - pts.forearmRef.y, pts.wrist.x - pts.forearmRef.x);
          const handAng = Math.atan2(pts.mc3Head.y - pts.wrist.y, pts.mc3Head.x - pts.wrist.x);
          ctx.save();
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = '#090d16';
          ctx.beginPath();
          ctx.moveTo(pts.wrist.x, pts.wrist.y);
          ctx.lineTo(pts.wrist.x + Math.cos(refAng) * 58, pts.wrist.y + Math.sin(refAng) * 58);
          ctx.stroke();
          ctx.restore();
          drawCurvedAngleArc(ctx, pts.wrist.x, pts.wrist.y, 34, refAng, handAng, 'α ≈ 30°', vb);
        },
      );

      // 3. Extrema + Desviación (PM = 4 a 5)
      drawHumanHandCard(
        ctx,
        { x: startX + (cardW + gap) * 2, y: cardY, w: cardW, h: cardH },
        'jsi_extreme',
        '3. Extrema + Desviación',
        'PM = 4,0 a 5,0 · Postura crítica',
        'Prensión con flexión/extensión > 45° combinada con desviación cubital pronunciada.',
        'orange',
        scale,
        (pts, vb) => {
          const refAng = Math.atan2(pts.wrist.y - pts.forearmRef.y, pts.wrist.x - pts.forearmRef.x);
          const handAng = Math.atan2(pts.mc3Head.y - pts.wrist.y, pts.mc3Head.x - pts.wrist.x);
          ctx.save();
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = '#090d16';
          ctx.beginPath();
          ctx.moveTo(pts.wrist.x, pts.wrist.y);
          ctx.lineTo(pts.wrist.x + Math.cos(refAng) * 58, pts.wrist.y + Math.sin(refAng) * 58);
          ctx.stroke();
          ctx.restore();
          drawCurvedAngleArc(ctx, pts.wrist.x, pts.wrist.y, 34, refAng, handAng, 'α > 45° + desv.', vb);
        },
      );
      drawCenteredManualFooter(ctx, width, height, 26);
      break;
    }

    case 'fig_7_01_fanger_vars': {
      const headerH = drawHeader(
        ctx,
        width,
        'FIGURA 7.1',
        'Variables ambientales y personales del método de Fanger (ISO 7730)',
      );

      // Central thermal balance node (spacious & multi-line wrapped)
      const centerX = 294;
      const centerY = headerH + 84;
      const centerW = 212;
      const centerH = 162;
      drawFlowBox(
        ctx,
        centerX,
        centerY,
        centerW,
        centerH,
        'Balance Térmico Humano',
        'Ecuación de Fanger (ISO 7730)\n↓\nÍndices PMV (−3 a +3)\ny PPD (% insatisfechos)',
        'dark',
      );

      const leftX = 22;
      const rightX = 534;
      const sideW = 244;
      const sideH = 82;
      const rowYs = [headerH + 18, headerH + 118, headerH + 218];

      const inputs = [
        {
          x: leftX,
          y: rowYs[0],
          t: 'ta · Temperatura seca del aire (°C)',
          s: 'Variable ambiental: convección respiratoria y cutánea',
          acc: 'blue' as const,
          ax: centerX,
          ay: centerY + 34,
        },
        {
          x: leftX,
          y: rowYs[1],
          t: 'tr · Temperatura radiante media (°C)',
          s: 'Variable ambiental: intercambio por radiación térmica',
          acc: 'blue' as const,
          ax: centerX,
          ay: centerY + 81,
        },
        {
          x: leftX,
          y: rowYs[2],
          t: 'va · Velocidad relativa del aire (m/s)',
          s: 'Variable ambiental: transferencia convectiva (anemómetro)',
          acc: 'blue' as const,
          ax: centerX,
          ay: centerY + 128,
        },
        {
          x: rightX,
          y: rowYs[0],
          t: 'HR · Humedad relativa (%)',
          s: 'Variable ambiental: presión de vapor y evaporación sudoral',
          acc: 'blue' as const,
          ax: centerX + centerW,
          ay: centerY + 34,
        },
        {
          x: rightX,
          y: rowYs[1],
          t: 'M · Metabolismo energético (W/m² · met)',
          s: 'Variable personal: carga física de la tarea (Tabla 7.3)',
          acc: 'orange' as const,
          ax: centerX + centerW,
          ay: centerY + 81,
        },
        {
          x: rightX,
          y: rowYs[2],
          t: 'Icl · Aislamiento térmico de ropa (clo)',
          s: 'Variable personal: resistencia térmica indumentaria (Tabla 7.4)',
          acc: 'orange' as const,
          ax: centerX + centerW,
          ay: centerY + 128,
        },
      ];

      inputs.forEach((inp) => {
        drawFlowBox(ctx, inp.x, inp.y, sideW, sideH, inp.t, inp.s, inp.acc);
        const startX = inp.x < 300 ? inp.x + sideW + 2 : inp.x - 2;
        drawArrow(
          ctx,
          startX,
          inp.y + sideH / 2,
          inp.ax,
          inp.ay,
          inp.acc === 'orange' ? C.arcOrange : C.vecBlue,
          2.1,
          8,
        );
      });

      drawFlowBox(
        ctx,
        120,
        height - 76,
        560,
        58,
        'Criterio de Confort Térmico Aceptable (Categoría B — Tabla 7.7)',
        '−0,5 ≤ PMV ≤ +0,5     ·     PPD < 10 % de personas insatisfechas',
        'green',
      );
      break;
    }

    case 'fig_7_02_pmv_ppd_real':
    case 'fig_12_01_logistics_pmv_real': {
      const isCap12 = variant === 'fig_12_01_logistics_pmv_real';
      const headerH = drawHeader(
        ctx,
        width,
        isCap12 ? 'FIGURA 12.1' : 'FIGURA 7.2',
        isCap12
          ? 'Ubicación de los tres sectores evaluados sobre la curva PMV–PPD (límite 10 %)'
          : 'Relación analítica entre voto medio estimado (PMV) y porcentaje de insatisfechos (PPD)',
      );
      const gx = 92;
      const gy = headerH + 26;
      const gw = 656;
      const gh = height - gy - 54;
      const chartBounds = { x: gx + 4, y: gy + 4, w: gw - 8, h: gh - 8 };

      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 1;
      const minPmv = isCap12 ? -1.5 : -3;
      const maxPmv = isCap12 ? 1.5 : 3;
      const maxPpd = isCap12 ? 60 : 100;

      const xOf = (pmv: number) => gx + ((pmv - minPmv) / (maxPmv - minPmv)) * gw;
      const yOf = (ppd: number) => gy + gh - (ppd / maxPpd) * gh;

      for (let p = 0; p <= maxPpd; p += isCap12 ? 10 : 20) {
        const y = yOf(p);
        ctx.beginPath();
        ctx.moveTo(gx, y);
        ctx.lineTo(gx + gw, y);
        ctx.stroke();
        ctx.fillStyle = C.sub;
        ctx.font = '11px "IBM Plex Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${p}`, gx - 8, y + 4);
      }

      const stepPmv = isCap12 ? 0.5 : 1;
      for (let m = minPmv; m <= maxPmv + 0.001; m += stepPmv) {
        const x = xOf(m);
        ctx.beginPath();
        ctx.moveTo(x, gy);
        ctx.lineTo(x, gy + gh);
        ctx.stroke();
        ctx.fillStyle = C.sub;
        ctx.font = '11px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(m > 0 ? `+${m}` : `${m}`, x, gy + gh + 18);
      }

      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.6;
      ctx.strokeRect(gx, gy, gw, gh);

      const calcPpd = (pmv: number) =>
        100 - 95 * Math.exp(-0.03353 * Math.pow(pmv, 4) - 0.2179 * Math.pow(pmv, 2));
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const pmv = minPmv + (i / 200) * (maxPmv - minPmv);
        const ppd = Math.min(maxPpd, calcPpd(pmv));
        const px = xOf(pmv);
        const py = yOf(ppd);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = C.arcOrange;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(gx, yOf(10));
      ctx.lineTo(gx + gw, yOf(10));
      ctx.stroke();
      ctx.restore();

      drawContainedTag(
        ctx,
        'Límite de confort PPD = 10 %',
        gx + gw - 115,
        yOf(10) - 16,
        C.arcOrange,
        '#c2410c',
        chartBounds,
      );

      if (isCap12) {
        const pts = [
          { pmv: -0.38, ppd: 8.0, name: 'Carga y descarga (−0,38 · 8,0%)', lx: xOf(-0.88), ly: yOf(24), col: C.nodeBlue },
          { pmv: -0.27, ppd: 6.5, name: 'Separación bolsines (−0,27 · 6,5%)', lx: xOf(-0.18), ly: yOf(36), col: '#0369a1' },
          { pmv: 0.63, ppd: 13.3, name: 'Almacén salud (+0,63 · 13,3% > 10%)', lx: xOf(0.58), ly: yOf(46), col: '#dc2626' },
        ];
        pts.forEach((pt) => {
          const px = xOf(pt.pmv);
          const py = yOf(pt.ppd);
          ctx.strokeStyle = pt.col;
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(pt.lx, pt.ly + 10);
          ctx.lineTo(px, py - 6);
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(px, py, 5.5, 0, Math.PI * 2);
          ctx.fillStyle = pt.col;
          ctx.fill();

          drawContainedTag(ctx, pt.name, pt.lx, pt.ly, pt.col, pt.col, chartBounds);
        });
      } else {
        [-2, -1, -0.5, 0, 0.5, 1, 2].forEach((m) => {
          const p = calcPpd(m);
          drawNode(ctx, xOf(m), yOf(p), 4.5);
        });
      }

      ctx.fillStyle = C.ink;
      ctx.font = 'bold 12px "Public Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PMV (Voto Medio Estimado)', gx + gw / 2, height - 14);
      ctx.save();
      ctx.translate(26, gy + gh / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('PPD (% de insatisfechos)', 0, 0);
      ctx.restore();
      break;
    }

    case 'fig_7_03_wbgt_sensors': {
      const headerH = drawHeader(
        ctx,
        width,
        'FIGURA 7.3',
        'Instrumento de medición del índice WBGT / TGBH: disposición de sus tres sensores',
      );

      // Top row of 3 spacious, multi-line wrapped callout boxes (width = 236 each)
      const topBoxY = headerH + 14;
      const topBoxH = 82;
      drawFlowBox(
        ctx,
        22,
        topBoxY,
        236,
        topBoxH,
        '1. Termómetro de Globo (Tg)',
        'Esfera hueca de cobre negro mate Ø 150 mm (carga radiante)',
        'orange',
      );
      drawFlowBox(
        ctx,
        282,
        topBoxY,
        236,
        topBoxH,
        '2. Bulbo Húmedo Natural (Tbh)',
        'Mecha de algodón en agua destilada (evaporación · peso 70 %)',
        'blue',
      );
      drawFlowBox(
        ctx,
        542,
        topBoxY,
        236,
        topBoxH,
        '3. Bulbo Seco del Aire (Ta)',
        'Temperatura seca del aire protegida de la radiación solar',
        'default',
      );

      // Physical 3-sensor manifold + central WBGT datalogger unit
      const unitX = 160;
      const unitY = 308;
      const unitW = 480;
      const unitH = 114;

      // Sensor 1: Matte black copper globe Tg at x = 235
      ctx.save();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(235, unitY);
      ctx.lineTo(235, 222);
      ctx.stroke();

      const grad = ctx.createRadialGradient(222, 188, 6, 235, 200, 38);
      grad.addColorStop(0, '#64748b');
      grad.addColorStop(0.45, '#1e293b');
      grad.addColorStop(1, '#0f172a');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(235, 200, 36, 0, Math.PI * 2);
      ctx.fill();
      drawArrow(ctx, 140, topBoxY + topBoxH + 2, 196, 192, C.arcOrange, 1.8, 7);

      // Sensor 2: Wet Bulb Natural Tbh at x = 400 (reservoir flask + wet cotton wick)
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(400, unitY);
      ctx.lineTo(400, 268);
      ctx.stroke();

      ctx.fillStyle = '#bae6fd';
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(380, 226, 40, 44, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect(392, 174, 16, 62, 6);
      ctx.fill();
      ctx.stroke();
      drawArrow(ctx, 400, topBoxY + topBoxH + 2, 400, 170, C.vecBlue, 1.8, 7);

      // Sensor 3: Shielded Dry Bulb Ta at x = 565
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(565, unitY);
      ctx.lineTo(565, 226);
      ctx.stroke();

      // Radiation shield plates
      ctx.fillStyle = '#e2e8f0';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.roundRect(543, 178 + i * 12, 44, 7, 3);
        ctx.fill();
        ctx.stroke();
      }
      drawArrow(ctx, 660, topBoxY + topBoxH + 2, 592, 192, '#475569', 1.8, 7);
      ctx.restore();

      // Central WBGT Datalogger Box (480px wide — both equations strictly contained on separate lines!)
      drawFlowBox(
        ctx,
        unitX,
        unitY,
        unitW,
        unitH,
        'UNIDAD REGISTRADORA DE ESTRÉS TÉRMICO (WBGT / TGBH)',
        'Interior o exterior sin carga solar:   WBGT = 0,7 · Tbh + 0,3 · Tg\nExterior con carga solar:   WBGT = 0,7 · Tbh + 0,2 · Tg + 0,1 · Ta',
        'dark',
      );

      drawContainedBanner(
        ctx,
        40,
        height - 54,
        720,
        36,
        'Ubicación a la altura del centro de gravedad del trabajador · Estabilización previa obligatoria del bulbo y globo',
        '#f8fafc',
        '#cbd5e1',
        C.sub,
      );
      break;
    }

    case 'fig_8_02_hand_arm_axes': {
      const headerH = drawHeader(
        ctx,
        width,
        'FIGURA 8.2',
        'Sistema de ejes ortogonales para vibración mano-brazo (ISO 5349)',
      );

      // Left / Main Viewport: Photorealistic forearm, wrist, palm, thumb & 4 fingers gripping cylindrical tool handle!
      const viewArea = {
        x: 22,
        y: headerH + 12,
        w: 472,
        h: height - headerH - 96,
      };
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(viewArea.x, viewArea.y, viewArea.w, viewArea.h, 8);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      const pts = renderHandGripPanel(
        ctx,
        'iso5349_power_handle',
        { x: viewArea.x + 12, y: viewArea.y + 14, w: viewArea.w - 24, h: viewArea.h - 28 },
        scale,
      );

      // Project exact orthogonal triaxial vectors (Zh, Xh, Yh) from 3rd Metacarpal Head!
      const orig = pts.mc3Head;
      const drawAxisVec = (
        tip: { x: number; y: number },
        lenPx: number,
        col: string,
        label: string,
      ) => {
        const dx = tip.x - orig.x;
        const dy = tip.y - orig.y;
        const mag = Math.hypot(dx, dy) || 1;
        const ex = orig.x + (dx / mag) * lenPx;
        const ey = orig.y + (dy / mag) * lenPx;
        drawArrow(ctx, orig.x, orig.y, ex, ey, col, 3, 10);
        drawContainedTag(
          ctx,
          label,
          ex + (dx / mag) * 28,
          ey + (dy / mag) * 18,
          '#090d16',
          '#090d16',
          viewArea,
          'bold 11px "IBM Plex Mono", monospace',
        );
      };

      drawAxisVec(pts.isoZhTip, 102, '#090d16', 'Eje Zh (longitudinal)');
      drawAxisVec(pts.isoXhTip, 94, C.vecBlue, 'Eje Xh (dorsopalmar)');
      drawAxisVec(pts.isoYhTip, 92, C.arcOrange, 'Eje Yh (empuñadura)');
      drawNode(ctx, orig.x, orig.y, 5.5);

      // Right Panel: Contained ISO 5349 Anatomical & Technical Specification Cards
      const rightX = 508;
      const rightW = 270;
      drawFlowBox(
        ctx,
        rightX,
        headerH + 12,
        rightW,
        112,
        'Origen Biodinámico (ISO 5349)',
        'Centrado en la cabeza del 3er metacarpiano (nudillo medio) de la mano acoplada a la empuñadura vibrante.',
        'blue',
        'left',
      );
      drawFlowBox(
        ctx,
        rightX,
        headerH + 134,
        rightW,
        128,
        'Definición de los Tres Ejes',
        '• Zh: Longitudinal al 3er metacarpiano y eje del antebrazo.\n• Xh: Perpendicular dorsopalmar a través de la palma.\n• Yh: Lateral paralelo al eje cilíndrico del mango.',
        'orange',
        'left',
      );
      drawFlowBox(
        ctx,
        rightX,
        headerH + 272,
        rightW,
        88,
        'Criterio Res. 295/03 / UE',
        'Nivel de Acción A(8) = 2,5 m/s²\nValor Límite Exposición = 5,0 m/s²\nPonderación frecuencial: Wh',
        'default',
        'left',
      );

      // Contained Bottom Formula Banner + Standardized Technical Footer
      drawContainedBanner(
        ctx,
        22,
        height - 68,
        width - 44,
        36,
        'Valor Total de Vibración:  ahv = √(ahwx² + ahwy² + ahwz²)    ·    Exposición diaria:  A(8) = ahv · √(T / 8)',
        '#0f172a',
        '#0f172a',
        '#ffffff',
      );
      drawCenteredManualFooter(ctx, width, height, 26);
      break;
    }

    case 'fig_9_01_protocol_relation': {
      const headerH = drawHeader(
        ctx,
        width,
        'FIGURA 9.1',
        'Articulación entre la planilla de registro, el método y el informe',
      );

      const boxX = 32;
      const boxW = width - 64; // 576px wide on 640px canvas

      drawFlowBox(
        ctx,
        boxX,
        headerH + 14,
        boxW,
        98,
        '1. PLANILLA / PROTOCOLO LEGAL (ej. Res. SRT 886/15)',
        'Define QUÉ factores relevar, QUÉ datos administrativos y laborales asentar\ny CON QUÉ periodicidad mínima documentar el seguimiento.',
        'blue',
      );

      const a1Y = headerH + 112;
      drawArrow(ctx, width / 2, a1Y, width / 2, a1Y + 34, C.vecBlue, 2.8, 9);
      drawContainedTag(
        ctx,
        'Remite para la cuantificación objetiva a',
        width / 2 + 128,
        a1Y + 17,
        '#94a3b8',
        C.sub,
        fullBounds,
      );

      drawFlowBox(
        ctx,
        boxX,
        a1Y + 36,
        boxW,
        108,
        '2. MÉTODO TÉCNICO INTERNACIONAL DE EVALUACIÓN',
        'RULA · REBA · OWAS · NIOSH · Snook · OCRA · JSI · Fanger · WBGT · ISO 2631 / 5349\nDefine CÓMO medir las variables biomecánicas y CÓMO interpretar la escala de riesgo.',
        'orange',
      );

      const a2Y = a1Y + 144;
      drawArrow(ctx, width / 2, a2Y, width / 2, a2Y + 34, C.arcOrange, 2.8, 9);
      drawContainedTag(
        ctx,
        'Fundamenta técnicamente el dictamen en',
        width / 2 + 128,
        a2Y + 17,
        '#fdba74',
        '#c2410c',
        fullBounds,
      );

      drawFlowBox(
        ctx,
        boxX,
        a2Y + 36,
        boxW,
        106,
        '3. INFORME TÉCNICO ERGONÓMICO PROFESIONAL',
        'Integra trazabilidad instrumental, memoria de cálculo, priorización de mejoras,\nmedidas de ingeniería concretas, responsables, plazos y verificación posterior.',
        'dark',
      );

      // Comparative Synthesis Table (100% contained columns & wrapped rows)
      const tblEnd = drawContainedTable(ctx, {
        x: boxX,
        y: a2Y + 156,
        totalWidth: boxW,
        colRatios: [0.24, 0.40, 0.36],
        colAligns: ['left', 'left', 'left'],
        headers: ['Documento', 'Función Específica', 'Resultado / Exigencia'],
        rows: [
          ['1. Planilla Legal', 'Identificación inicial y registro formal auditable', 'Trazabilidad normativa por puesto'],
          ['2. Método Técnico', 'Modelización biomecánica y cálculo de índices', 'Nivel cuantitativo de riesgo'],
          ['3. Informe Final', 'Diagnóstico integral y plan de ingeniería priorizado', 'Reducción verificable del riesgo'],
        ],
        minRowH: 38,
        fontSize: 10.6,
      });

      const footY = Math.min(height - 54, tblEnd + 12);
      drawContainedBanner(
        ctx,
        boxX,
        footY,
        boxW,
        42,
        '«La planilla sin método carece de rigor técnico; el método sin registro incumple la trazabilidad documental»',
        '#f8fafc',
        '#94a3b8',
        C.sub,
      );
      break;
    }

    case 'fig_10_01_eval_cycle': {
      drawHeader(ctx, width, 'FIGURA 10.1', 'Ciclo continuo de la evaluación e intervención ergonómica');
      const cx = 320;
      const cy = 420;

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 198, 0, Math.PI * 2);
      ctx.stroke();

      drawFlowBox(ctx, cx - 150, 96, 300, 82, '1. Identificación de Peligros', 'Observación de tareas, ciclos e indicadores', 'blue');
      drawFlowBox(ctx, cx + 80, cy - 44, 222, 88, '2. Evaluación de Riesgos', 'Medición instrumental y aplicación de métodos', 'orange');
      drawFlowBox(ctx, cx - 150, 650, 300, 82, '3. Medidas Correctoras', 'Rediseño técnico priorizado con plazos', 'dark');
      drawFlowBox(ctx, 18, cy - 44, 222, 88, '4. Verificación / Reevaluación', 'Comprobación cuantitativa del descenso del riesgo', 'green');

      drawCurvedAngleArc(ctx, cx, cy, 198, -1.08, -0.38, 'Cuantificar', fullBounds);
      drawCurvedAngleArc(ctx, cx, cy, 198, 0.38, 1.12, 'Priorizar', fullBounds);
      drawCurvedAngleArc(ctx, cx, cy, 198, 1.98, 2.74, 'Controlar', fullBounds);
      drawCurvedAngleArc(ctx, cx, cy, 198, -2.74, -1.98, 'Mejora continua', fullBounds);
      break;
    }

    case 'fig_10_02_priority_criteria': {
      const headerH = drawHeader(
        ctx,
        width,
        'FIGURA 10.2',
        'Seis criterios de decisión y jerarquía de prioridades (Cap. 10)',
      );
      const crit = [
        '1. Naturaleza estructural del daño (lesión permanente vs. fatiga transitoria)',
        '2. Irreversibilidad anatomopatológica (hernia discal, STC, síndrome de Raynaud)',
        '3. Número de trabajadores expuestos y acumulación histórica de exposición',
        '4. Posibilidad técnica efectiva de intervención (o medida provisional inmediata)',
        '5. Coexistencia y sinergia de múltiples factores de riesgo en el mismo puesto',
        '6. Antecedentes clínicos o sintomatología ya registrada en el puesto',
      ];
      ctx.fillStyle = C.ink;
      ctx.font = 'bold 12px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('A. Criterios Técnicos de Priorización (Tabla 10.1):', 36, headerH + 22);

      crit.forEach((c, i) => {
        const y = headerH + 34 + i * 38;
        drawContainedBanner(ctx, 36, y, 568, 32, c, '#f8fafc', '#94a3b8', C.ink, 'left');
      });

      const arrowTop = headerH + 34 + crit.length * 38 + 4;
      drawArrow(ctx, 320, arrowTop, 320, arrowTop + 32, C.arcOrange, 2.8);

      const secBY = arrowTop + 48;
      ctx.fillStyle = C.ink;
      ctx.font = 'bold 12px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('B. Jerarquía General entre Factores de Riesgo (Tabla 10.2):', 36, secBY);

      // Full-width 568px priority cards so Priority 5 text NEVER overflows its box!
      const ranks = [
        { r: 'Prioridad 1°', f: 'Manipulación Manual de Cargas (NIOSH / Snook)', pct: 1.0, col: '#dc2626', bg: '#fef2f2' },
        { r: 'Prioridad 2°', f: 'Movimientos Repetitivos de MMSS (OCRA / JSI)', pct: 0.86, col: '#ea580c', bg: '#fff7ed' },
        { r: 'Prioridad 3°', f: 'Posturas Forzadas y Estáticas (RULA / REBA / OWAS)', pct: 0.72, col: '#d97706', bg: '#fefce8' },
        { r: 'Prioridad 4°', f: 'Vibraciones Mecánicas (ISO 2631 / ISO 5349)', pct: 0.58, col: '#0284c7', bg: '#f0f9ff' },
        { r: 'Prioridad 5°', f: 'Ambiente Térmico (WBGT / Fanger — salvo estrés térmico agudo)', pct: 0.44, col: '#0f172a', bg: '#f8fafc' },
      ];
      ranks.forEach((rk, idx) => {
        const y = secBY + 14 + idx * 64;
        const cardX = 36;
        const cardW = 568;
        const cardH = 54;

        ctx.save();
        ctx.fillStyle = rk.bg;
        ctx.strokeStyle = rk.col;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(cardX, y, cardW, cardH, 6);
        ctx.fill();
        ctx.stroke();

        // Left colored priority badge pill inside card
        ctx.fillStyle = rk.col;
        ctx.beginPath();
        ctx.roundRect(cardX, y, 118, cardH, [6, 0, 0, 6]);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rk.r, cardX + 59, y + cardH / 2);

        // Wrapped factor description strictly inside right portion (426px wide)
        ctx.fillStyle = C.ink;
        ctx.font = 'bold 11.5px "Public Sans", system-ui, sans-serif';
        ctx.textAlign = 'left';
        const fLines = wrapDiagramText(ctx, rk.f, cardW - 140);
        ctx.fillText(fLines[0], cardX + 130, y + 20);
        if (fLines[1]) {
          ctx.fillText(fLines[1], cardX + 130, y + 34);
        }

        // Subtle proportional urgency bar at bottom of card
        ctx.fillStyle = rk.col;
        ctx.globalAlpha = 0.25;
        ctx.fillRect(cardX + 130, y + cardH - 10, Math.round((cardW - 144) * rk.pct), 5);
        ctx.restore();
      });
      break;
    }

    case 'fig_11_06_nam_chart': {
      const headerH = drawHeader(
        ctx,
        width,
        'FIGURA 11.6',
        'Valores límite umbral para la actividad manual (NAM — Res. 295/03)',
      );
      const gx = 95;
      const gy = headerH + 24;
      const gw = 648;
      const gh = height - gy - 54;
      const chartBounds = { x: gx + 4, y: gy + 4, w: gw - 8, h: gh - 8 };

      const xOf = (nam: number) => gx + (nam / 10) * gw;
      const yOf = (fp: number) => gy + gh - (fp / 10) * gh;

      ctx.fillStyle = '#f0fdf4';
      ctx.fillRect(gx, gy, gw, gh);

      ctx.fillStyle = '#fefce8';
      ctx.beginPath();
      ctx.moveTo(xOf(0), yOf(5.6));
      ctx.lineTo(xOf(10), yOf(0));
      ctx.lineTo(xOf(10), yOf(7.8));
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#fef2f2';
      ctx.beginPath();
      ctx.moveTo(xOf(0), yOf(7.8));
      ctx.lineTo(xOf(10), yOf(0));
      ctx.lineTo(xOf(10), yOf(10));
      ctx.lineTo(xOf(0), yOf(10));
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = C.grid;
      for (let i = 0; i <= 10; i += 2) {
        ctx.beginPath();
        ctx.moveTo(xOf(i), gy);
        ctx.lineTo(xOf(i), gy + gh);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(gx, yOf(i));
        ctx.lineTo(gx + gw, yOf(i));
        ctx.stroke();

        ctx.fillStyle = C.sub;
        ctx.font = '11px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${i}`, xOf(i), gy + gh + 18);
        ctx.textAlign = 'right';
        ctx.fillText(`${i}`, gx - 8, yOf(i) + 4);
      }

      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(xOf(0), yOf(7.8));
      ctx.lineTo(xOf(10), yOf(0));
      ctx.stroke();

      ctx.save();
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(xOf(0), yOf(5.6));
      ctx.lineTo(xOf(10), yOf(0));
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.6;
      ctx.strokeRect(gx, gy, gw, gh);

      drawNode(ctx, xOf(5), yOf(1), 6.5);
      drawNode(ctx, xOf(1), yOf(0.5), 6.5);

      drawContainedTag(ctx, 'Mano derecha (NAM = 5; Fuerza = 1)', xOf(5) + 125, yOf(1), C.nodeBlue, C.ink, chartBounds);
      drawContainedTag(ctx, 'Mano izquierda (NAM = 1; Fuerza = 0,5)', xOf(1) + 135, yOf(0.5) - 18, C.nodeBlue, C.ink, chartBounds);
      drawContainedTag(ctx, 'ZONA DE RIESGO (> TLV)', xOf(7.2), yOf(7.6), '#dc2626', '#dc2626', chartBounds);
      drawContainedTag(ctx, 'Zona de precaución (> Límite Acción)', xOf(3.8), yOf(4.2), '#ca8a04', '#a16207', chartBounds);
      drawContainedTag(ctx, 'ZONA DE SEGURIDAD', xOf(2.2), yOf(2.1), '#16a34a', '#15803d', chartBounds);

      ctx.fillStyle = C.ink;
      ctx.font = 'bold 12px "Public Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Nivel de Actividad Manual — NAM (0 a 10)', gx + gw / 2, height - 14);
      ctx.save();
      ctx.translate(26, gy + gh / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('Fuerza Pico Normalizada (Escala de Borg 0–10)', 0, 0);
      ctx.restore();
      break;
    }

    case 'fig_12_02_dock_step': {
      const headerH = drawHeader(
        ctx,
        width,
        'FIGURA 12.2',
        'Esquema geométrico del muelle de carga (desnivel 22 cm) y camioneta (55 cm)',
      );
      const floorY = 408;
      const pxPerCm = 3.6;
      const dockY = floorY - 22 * pxPerCm;
      const vanBedY = floorY - 55 * pxPerCm;

      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(36, floorY, 728, 36);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(36, floorY);
      ctx.lineTo(764, floorY);
      ctx.stroke();

      ctx.fillStyle = '#e2e8f0';
      ctx.strokeStyle = '#475569';
      ctx.fillRect(54, dockY, 300, 22 * pxPerCm);
      ctx.strokeRect(54, dockY, 300, 22 * pxPerCm);
      drawFlowBox(ctx, 78, dockY + 18, 252, 44, 'Muelle interior elevado (+22 cm)', undefined, 'default');

      ctx.fillStyle = C.meshFill;
      ctx.strokeStyle = C.nodeBlue;
      ctx.lineWidth = 2;
      ctx.fillRect(420, vanBedY - 112, 260, 112);
      ctx.strokeRect(420, vanBedY - 112, 260, 112);

      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(420, vanBedY, 260, 22);
      ctx.beginPath();
      ctx.arc(560, floorY - 34, 34, 0, Math.PI * 2);
      ctx.fillStyle = '#475569';
      ctx.fill();
      drawFlowBox(ctx, 445, vanBedY - 78, 210, 44, 'Caja de carga camioneta', undefined, 'blue');

      drawArrow(ctx, 384, floorY, 384, dockY, C.arcOrange, 2.2);
      drawArrow(ctx, 384, dockY, 384, floorY, C.arcOrange, 2.2);
      drawContainedTag(ctx, 'Desnivel 22 cm', 384, dockY - 18, C.arcOrange, '#c2410c', fullBounds);

      drawArrow(ctx, 704, floorY, 704, vanBedY, C.vecBlue, 2.2);
      drawArrow(ctx, 704, vanBedY, 704, floorY, C.vecBlue, 2.2);
      drawContainedTag(ctx, '55 cm al suelo', 704, vanBedY - 18, C.vecBlue, C.vecBlue, fullBounds);

      drawArrow(ctx, 336, dockY, 336, vanBedY, '#dc2626', 2.6);
      drawArrow(ctx, 336, vanBedY, 336, dockY, '#dc2626', 2.6);
      drawContainedTag(ctx, 'Altura relativa = 33 cm', 235, (dockY + vanBedY) / 2, '#dc2626', '#dc2626', fullBounds);

      drawContainedBanner(
        ctx,
        36,
        height - 54,
        728,
        38,
        'Al eliminar el desnivel de 22 cm y elevar carros a ≥ 55 cm, la manipulación queda entre nudillos y hombros',
        '#f8fafc',
        '#cbd5e1',
        C.sub,
      );
      break;
    }

    case 'fig_12_04_niosh_heights': {
      const headerH = drawHeader(
        ctx,
        width,
        'FIGURA 12.4',
        'Alturas de toma en el bin (45 cm) y depósito en carro (35 cm) — Cálculo NIOSH',
      );
      const floorY = 414;
      const pxPerCm = 3.2;

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(44, floorY);
      ctx.lineTo(756, floorY);
      ctx.stroke();

      const v1Y = floorY - 45 * pxPerCm;
      ctx.fillStyle = '#f1f5f9';
      ctx.strokeStyle = '#64748b';
      ctx.fillRect(112, floorY - 95 * pxPerCm, 204, 95 * pxPerCm);
      ctx.strokeRect(112, floorY - 95 * pxPerCm, 204, 95 * pxPerCm);

      ctx.fillStyle = '#fff7ed';
      ctx.strokeStyle = C.arcOrange;
      ctx.lineWidth = 2;
      ctx.fillRect(158, v1Y - 24, 112, 48);
      ctx.strokeRect(158, v1Y - 24, 112, 48);
      drawNode(ctx, 214, v1Y, 6);
      drawContainedTag(ctx, 'Bulto 10 kg (IL = 1,37)', 214, v1Y - 40, C.arcOrange, C.ink, fullBounds);
      drawContainedTag(ctx, 'CONTENEDOR (BIN)', 214, floorY - 95 * pxPerCm - 16, '#64748b', C.ink, fullBounds);

      drawArrow(ctx, 84, floorY, 84, v1Y, C.arcOrange, 2.4);
      drawContainedTag(ctx, 'V₁ = 45 cm', 84, v1Y - 18, C.arcOrange, '#c2410c', fullBounds);

      drawCurvedAngleArc(ctx, 400, 315, 110, -2.35, -0.78, '3 lev./min (D = 10 cm)', fullBounds);

      const v2Y = floorY - 35 * pxPerCm;
      ctx.fillStyle = '#e2e8f0';
      ctx.strokeStyle = '#475569';
      ctx.fillRect(482, floorY - 23 * pxPerCm, 196, 14);
      ctx.strokeRect(482, floorY - 23 * pxPerCm, 196, 14);
      ctx.beginPath();
      ctx.moveTo(678, floorY - 23 * pxPerCm);
      ctx.lineTo(678, floorY - 93 * pxPerCm);
      ctx.stroke();

      ctx.fillStyle = C.meshFill;
      ctx.strokeStyle = C.nodeBlue;
      ctx.fillRect(520, v2Y - 24, 112, 48);
      ctx.strokeRect(520, v2Y - 24, 112, 48);
      drawNode(ctx, 576, v2Y, 6);
      drawContainedTag(ctx, 'Depósito (IL = 0,89)', 576, v2Y - 40, C.nodeBlue, C.ink, fullBounds);

      drawArrow(ctx, 718, floorY, 718, v2Y, C.vecBlue, 2.4);
      drawContainedTag(ctx, 'V₂ = 35 cm', 718, v2Y - 18, C.vecBlue, C.vecBlue, fullBounds);

      drawContainedBanner(
        ctx,
        36,
        height - 54,
        728,
        38,
        'Tabla 12.6: En origen IL = 1,37 (riesgo moderado sobre L5/S1) por postura forzada dentro del lateral del bin',
        '#f8fafc',
        '#cbd5e1',
        C.sub,
      );
      break;
    }

    case 'fig_13_01_seat_dimensions': {
      const headerH = drawHeader(
        ctx,
        width,
        'FIGURA 13.1',
        'Esquema lateral del asiento del conductor con dimensiones y ajustes',
      );
      const leftZone = { x: 18, y: headerH + 8, w: 472, h: height - headerH - 16 };
      const floorY = 418;

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(36, floorY);
      ctx.lineTo(482, floorY);
      ctx.stroke();

      // Ergonomic driver seat profile (contoured cushion, lumbar backrest, headrest, scissor damper)
      const seatX = 248;
      const seatY = 268;

      // Scissor suspension + central hydraulic damper
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(seatX + 18, floorY);
      ctx.lineTo(seatX + 138, seatY + 22);
      ctx.moveTo(seatX + 138, floorY);
      ctx.lineTo(seatX + 18, seatY + 22);
      ctx.stroke();

      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(seatX + 78, floorY - 4);
      ctx.lineTo(seatX + 78, seatY + 24);
      ctx.stroke();
      drawNode(ctx, seatX + 78, (floorY + seatY + 22) / 2, 5.5);

      // Contoured seat pan (waterfall front edge)
      ctx.fillStyle = C.meshFill;
      ctx.strokeStyle = C.nodeBlue;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.roundRect(seatX, seatY, 168, 24, [6, 12, 8, 6]);
      ctx.fill();
      ctx.stroke();

      // Reclined contoured lumbar backrest + integrated adjustable headrest
      ctx.save();
      ctx.translate(seatX + 14, seatY + 8);
      ctx.rotate(-0.18);
      ctx.fillStyle = C.meshFill;
      ctx.strokeStyle = C.nodeBlue;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.roundRect(-13, -158, 26, 158, 9);
      ctx.fill();
      ctx.stroke();

      // Headrest pad above backrest
      ctx.beginPath();
      ctx.roundRect(-11, -198, 22, 34, 8);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      drawNode(ctx, seatX + 14, seatY + 8, 6.5);
      drawCurvedAngleArc(ctx, seatX + 14, seatY + 8, 52, -Math.PI / 2 - 0.18, 0, '90°–104°', leftZone);

      // Contained Technical Dimension Callouts
      drawArrow(ctx, seatX, seatY + 42, seatX + 168, seatY + 42, C.vecBlue, 2);
      drawArrow(ctx, seatX + 168, seatY + 42, seatX, seatY + 42, C.vecBlue, 2);
      drawContainedTag(
        ctx,
        'Profundidad: 400 mm (Ancho: 490 mm)',
        seatX + 84,
        seatY + 64,
        C.vecBlue,
        C.vecBlue,
        leftZone,
        'bold 10.8px "IBM Plex Mono", monospace',
      );

      drawArrow(ctx, 184, floorY, 184, seatY, C.arcOrange, 2.2);
      drawArrow(ctx, 184, seatY, 184, floorY, C.arcOrange, 2.2);
      drawContainedTag(
        ctx,
        'Altura: 600–650 mm\n(Reg. vert.: ±30 mm)',
        102,
        (floorY + seatY) / 2,
        C.arcOrange,
        '#c2410c',
        leftZone,
        'bold 10.8px "IBM Plex Mono", monospace',
      );

      drawArrow(ctx, seatX - 24, floorY + 22, seatX + 194, floorY + 22, '#0f172a', 2);
      drawArrow(ctx, seatX + 194, floorY + 22, seatX - 24, floorY + 22, '#0f172a', 2);
      drawContainedTag(
        ctx,
        'Corredera longitudinal: 300 mm (±150 mm)',
        seatX + 85,
        floorY + 46,
        '#0f172a',
        '#0f172a',
        leftZone,
        'bold 10.8px "IBM Plex Mono", monospace',
      );

      // Right Specification Box (multi-line wrapped & strictly contained!)
      drawFlowBox(
        ctx,
        500,
        headerH + 24,
        276,
        228,
        'Especificaciones Tabla 13.3',
        '• Regulación de peso (suspensión):\n   50 a 150 / 170 kg\n• Inclinación de banqueta: 5° ± 6°\n• Altura apoyacabezas: 685–860 mm\n• Ancho útil respaldo: 480 mm\n• Tapizado: esterilla PVC ventilada (6 mm)',
        'blue',
        'left',
      );

      drawFlowBox(
        ctx,
        500,
        headerH + 268,
        276,
        118,
        'Atenuación de Vibración Eje Z',
        'El sistema neumático/hidráulico en tijera desacopla las resonancias de baja frecuencia (1–4 Hz) del chasis.',
        'default',
        'left',
      );
      break;
    }

    case 'fig_13_03_vib_z_spectrum_real': {
      const headerH = drawHeader(
        ctx,
        width,
        'FIGURA 13.3',
        'Espectro de aceleración del eje Z en bandas de 1/3 de octava (Tabla 13.7)',
      );
      const gx = 95;
      const gy = headerH + 26;
      const gw = 650;
      const gh = height - gy - 56;
      const freqs = ['1', '1,25', '1,6', '2', '2,5', '3,2'];
      const medido = [0.3994, 0.4438, 0.3994, 0.1775, 0.0444, 0.0444];
      const pond = [0.1997, 0.2485, 0.2516, 0.126, 0.0355, 0.04];

      for (let v = 0; v <= 0.501; v += 0.1) {
        const y = gy + gh - (v / 0.5) * gh;
        ctx.strokeStyle = C.grid;
        ctx.beginPath();
        ctx.moveTo(gx, y);
        ctx.lineTo(gx + gw, y);
        ctx.stroke();
        ctx.fillStyle = C.sub;
        ctx.font = '11px "IBM Plex Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(v.toFixed(1).replace('.', ','), gx - 8, y + 4);
      }

      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(gx, gy, gw, gh);

      const slotW = gw / freqs.length;
      freqs.forEach((f, idx) => {
        const x0 = gx + idx * slotW + 20;
        const bw = 30;
        const h1 = (medido[idx] / 0.5) * gh;
        const h2 = (pond[idx] / 0.5) * gh;

        ctx.fillStyle = '#93c5fd';
        ctx.fillRect(x0, gy + gh - h1, bw, h1);
        ctx.fillStyle = '#1e3a8a';
        ctx.fillRect(x0 + bw + 4, gy + gh - h2, bw, h2);

        ctx.fillStyle = C.ink;
        ctx.font = '10px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(medido[idx].toFixed(2).replace('.', ','), x0 + bw / 2, gy + gh - h1 - 6);
        ctx.fillText(pond[idx].toFixed(2).replace('.', ','), x0 + bw + 4 + bw / 2, gy + gh - h2 - 6);
        ctx.font = 'bold 11.5px "IBM Plex Mono", monospace';
        ctx.fillText(`${f} Hz`, x0 + bw + 2, gy + gh + 18);
      });

      // Contained Legend Card
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.strokeStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.roundRect(436, gy + 12, 298, 52, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#93c5fd';
      ctx.fillRect(448, gy + 22, 16, 12);
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(448, gy + 42, 16, 12);
      ctx.fillStyle = C.ink;
      ctx.font = '11px "Public Sans", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Medido sin ponderar (m/s²)', 472, gy + 32);
      ctx.fillText('Ponderado Res. 295/03 (Apz = 0,4286 m/s²)', 472, gy + 52);
      ctx.restore();

      ctx.textAlign = 'center';
      ctx.fillStyle = C.ink;
      ctx.font = 'bold 11.5px "Public Sans", system-ui, sans-serif';
      ctx.fillText(
        'Frecuencia central de banda de 1/3 de octava (Hz) · Ap global = 0,4463 m/s² (< 0,5 m/s²)',
        gx + gw / 2,
        height - 14,
      );
      break;
    }

    case 'fig_13_04_vib_ha_spectrum_real': {
      const headerH = drawHeader(
        ctx,
        width,
        'FIGURA 13.4',
        'Espectro de aceleración mano-brazo por eje en bandas de 1/3 de octava (Tabla 13.9)',
      );
      const gx = 95;
      const gy = headerH + 26;
      const gw = 650;
      const gh = height - gy - 56;
      const freqs = ['2', '4', '8', '16', '31', '63', '125'];
      const ez = [0.2663, 0.0444, 0.0888, 0.2219, 0.4438, 0.0, 0.0];
      const ex = [0.5769, 0.2663, 0.2219, 0.2663, 0.9763, 0.6656, 0.4438];
      const ey = [0.5325, 0.3106, 0.3994, 0.6656, 1.0206, 0.0, 0.0];

      const xOf = (i: number) => gx + 35 + (i / (freqs.length - 1)) * (gw - 70);
      const yOf = (val: number) => gy + gh - (val / 1.15) * gh;

      for (let v = 0; v <= 1.11; v += 0.2) {
        const y = yOf(v);
        ctx.strokeStyle = C.grid;
        ctx.beginPath();
        ctx.moveTo(gx, y);
        ctx.lineTo(gx + gw, y);
        ctx.stroke();
        ctx.fillStyle = C.sub;
        ctx.font = '11px "IBM Plex Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(v.toFixed(1).replace('.', ','), gx - 8, y + 4);
      }

      freqs.forEach((f, i) => {
        const x = xOf(i);
        ctx.strokeStyle = C.grid;
        ctx.beginPath();
        ctx.moveTo(x, gy);
        ctx.lineTo(x, gy + gh);
        ctx.stroke();
        ctx.fillStyle = C.ink;
        ctx.font = 'bold 11px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${f}`, x, gy + gh + 18);
      });

      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(gx, gy, gw, gh);

      const plotSeries = (arr: number[], col: string) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        arr.forEach((val, idx) => {
          const px = xOf(idx);
          const py = yOf(val);
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
        arr.forEach((val, idx) => {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(xOf(idx), yOf(val), 4.2, 0, Math.PI * 2);
          ctx.fill();
        });
      };

      plotSeries(ex, '#1d4ed8');
      plotSeries(ey, '#dc2626');
      plotSeries(ez, '#d97706');

      const leg = [
        { name: 'Eje X (ahwx = 0,6271 m/s²)', c: '#1d4ed8' },
        { name: 'Eje Y (ahwy = 0,8772 m/s²)', c: '#dc2626' },
        { name: 'Eje Z (ahwz = 0,3154 m/s²)', c: '#d97706' },
      ];
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.strokeStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.roundRect(gx + 14, gy + 12, 258, 70, 6);
      ctx.fill();
      ctx.stroke();
      leg.forEach((l, idx) => {
        ctx.fillStyle = l.c;
        ctx.fillRect(gx + 26, gy + 24 + idx * 20, 16, 4);
        ctx.fillStyle = C.ink;
        ctx.font = '11px "Public Sans", system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(l.name, gx + 48, gy + 29 + idx * 20);
      });
      ctx.restore();

      ctx.textAlign = 'center';
      ctx.fillStyle = C.ink;
      ctx.font = 'bold 11.5px "Public Sans", system-ui, sans-serif';
      ctx.fillText(
        'Frecuencia central 1/3 octava (Hz) · Valor Total VTV = 1,1 m/s² (< Nivel Acción 2,5 m/s²)',
        gx + gw / 2,
        height - 14,
      );
      break;
    }
  }

  // Thin crisp outer manual border around every rendered illustration
  ctx.save();
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0.75, 0.75, width - 1.5, height - 1.5);
  ctx.restore();
}

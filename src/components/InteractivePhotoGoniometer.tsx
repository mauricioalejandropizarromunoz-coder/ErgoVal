import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Compass,
  Crosshair,
  Lock,
  Move,
  Plus,
  RotateCcw,
  Trash2,
  Unlock,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface Point2D {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
}

export interface GoniometerInstance {
  id: string;
  label: string;
  colorHex: string;
  fillRgba: string;
  vertexPt: Point2D;
  refPt: Point2D;
  segPt: Point2D;
  /** Si está activo, al mover el vértice se traslada solidariamente el eje de referencia manteniendo fijo su ángulo */
  fixedRefDirection: boolean;
  /** Si está bloqueado, queda fijo en pantalla sin moverse accidentalmente mientras se usa otro goniómetro */
  locked: boolean;
}

export interface InteractivePhotoGoniometerProps {
  imageUrl?: string;
  figureCode?: string;
  figureLabel?: string;
  onApplyAngle?: (degrees: number, goniometerLabel?: string) => void;
  applyButtonLabel?: string;
  compact?: boolean;
  /** Permite superponer los goniómetros libres directamente sobre un lienzo 3D sin imagen de fondo */
  transparentOverlay?: boolean;
}

type DragPart = 'ref' | 'vertex' | 'seg' | 'whole';

interface ActiveDragState {
  gonioId: string;
  part: DragPart;
  lastPt: Point2D;
}

const GONIO_PALETTE: Array<{ colorHex: string; fillRgba: string }> = [
  { colorHex: '#0284c7', fillRgba: 'rgba(2, 132, 199, 0.22)' },
  { colorHex: '#059669', fillRgba: 'rgba(5, 150, 105, 0.22)' },
  { colorHex: '#d97706', fillRgba: 'rgba(217, 119, 6, 0.22)' },
  { colorHex: '#7c3aed', fillRgba: 'rgba(124, 58, 237, 0.22)' },
  { colorHex: '#dc2626', fillRgba: 'rgba(220, 38, 38, 0.22)' },
  { colorHex: '#0f766e', fillRgba: 'rgba(15, 118, 110, 0.22)' },
];

function clamp01(val: number): number {
  return Math.max(0.02, Math.min(0.98, val));
}

function snapPointToOrtho(
  anchor: Point2D,
  raw: Point2D,
  viewW: number,
  viewH: number,
  enableSnap: boolean,
): Point2D {
  if (!enableSnap) return raw;
  const dx = (raw.x - anchor.x) * viewW;
  const dy = (raw.y - anchor.y) * viewH;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) return raw;
  const step = Math.PI / 4; // 0°, 45°, 90°, 135°, 180°
  const snapped = Math.round(Math.atan2(dy, dx) / step) * step;
  return {
    x: clamp01(anchor.x + (Math.cos(snapped) * dist) / Math.max(1, viewW)),
    y: clamp01(anchor.y + (Math.sin(snapped) * dist) / Math.max(1, viewH)),
  };
}

function makeDefaultGoniometer(index: number): GoniometerInstance {
  const palette = GONIO_PALETTE[index % GONIO_PALETTE.length];
  const offsetX = ((index % 3) - 0.5) * 0.12;
  const offsetY = (Math.floor(index / 3) % 2) * 0.14;
  const vx = clamp01(0.46 + offsetX);
  const vy = clamp01(0.36 + offsetY);

  return {
    id: `gonio-${Date.now()}-${index}`,
    label: `G${index + 1}`,
    colorHex: palette.colorHex,
    fillRgba: palette.fillRgba,
    vertexPt: { x: vx, y: vy },
    refPt: { x: vx, y: clamp01(vy + 0.32) },
    segPt: { x: clamp01(vx + 0.2), y: clamp01(vy + 0.16) },
    fixedRefDirection: false,
    locked: false,
  };
}

function computeGonioGeometry(g: GoniometerInstance, viewW: number, viewH: number) {
  const vx = g.vertexPt.x * viewW;
  const vy = g.vertexPt.y * viewH;
  const rx = g.refPt.x * viewW;
  const ry = g.refPt.y * viewH;
  const sx = g.segPt.x * viewW;
  const sy = g.segPt.y * viewH;

  const aRef = Math.atan2(ry - vy, rx - vx);
  const aSeg = Math.atan2(sy - vy, sx - vx);

  let diff = aSeg - aRef;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  const absDeg = Math.round(Math.abs((diff * 180) / Math.PI) * 10) / 10;
  const signedDeg = Math.round(((diff * 180) / Math.PI) * 10) / 10;

  const lenRef = Math.hypot(rx - vx, ry - vy);
  const lenSeg = Math.hypot(sx - vx, sy - vy);
  const radius = Math.max(24, Math.min(92, Math.min(lenRef, lenSeg) * 0.52));

  const startX = vx + Math.cos(aRef) * radius;
  const startY = vy + Math.sin(aRef) * radius;
  const endX = vx + Math.cos(aRef + diff) * radius;
  const endY = vy + Math.sin(aRef + diff) * radius;
  const sweepFlag = diff >= 0 ? 1 : 0;
  const largeArcFlag = Math.abs(diff) > Math.PI ? 1 : 0;

  const sectorPath =
    Math.abs(diff) < 0.015
      ? ''
      : `M ${vx.toFixed(1)} ${vy.toFixed(1)} L ${startX.toFixed(1)} ${startY.toFixed(1)} A ${radius.toFixed(1)} ${radius.toFixed(1)} 0 ${largeArcFlag} ${sweepFlag} ${endX.toFixed(1)} ${endY.toFixed(1)} Z`;

  const arcPath =
    Math.abs(diff) < 0.015
      ? ''
      : `M ${startX.toFixed(1)} ${startY.toFixed(1)} A ${radius.toFixed(1)} ${radius.toFixed(1)} 0 ${largeArcFlag} ${sweepFlag} ${endX.toFixed(1)} ${endY.toFixed(1)}`;

  // Prolongación recta de referencia más allá del vértice para lectura visual inmediata
  const extRefX = vx - Math.cos(aRef) * Math.min(54, lenRef * 0.36);
  const extRefY = vy - Math.sin(aRef) * Math.min(54, lenRef * 0.36);

  const midAngle = aRef + diff * 0.5;
  const badgeDist = radius + 36;
  const bx = Math.max(66, Math.min(viewW - 66, vx + Math.cos(midAngle) * badgeDist));
  const by = Math.max(24, Math.min(viewH - 24, vy + Math.sin(midAngle) * badgeDist));

  return {
    vx,
    vy,
    rx,
    ry,
    sx,
    sy,
    extRefX,
    extRefY,
    absDeg,
    signedDeg,
    sectorPath,
    arcPath,
    bx,
    by,
  };
}

export const InteractivePhotoGoniometer: React.FC<InteractivePhotoGoniometerProps> = ({
  imageUrl,
  figureCode,
  figureLabel,
  onApplyAngle,
  applyButtonLabel,
  compact = false,
  transparentOverlay = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [goniometers, setGoniometers] = useState<GoniometerInstance[]>(() => [
    makeDefaultGoniometer(0),
  ]);
  const [activeId, setActiveId] = useState<string>(() => goniometers[0].id);
  const [dragState, setDragState] = useState<ActiveDragState | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [imgError, setImgError] = useState<boolean>(false);
  const [viewSize, setViewSize] = useState<{ w: number; h: number }>({ w: 800, h: 520 });

  // Modo rápido de trazo directo por 3 clics (Referencia -> Vértice -> Segmento)
  const [traceMode, setTraceMode] = useState<boolean>(false);
  const [traceDraftPts, setTraceDraftPts] = useState<Point2D[]>([]);
  const [traceHoverPt, setTraceHoverPt] = useState<Point2D | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const syncSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 10 && rect.height > 10) {
        setViewSize({ w: Math.round(rect.width), h: Math.round(rect.height) });
      }
    };
    syncSize();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(syncSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [zoom, imageUrl]);

  const VIEW_W = viewSize.w;
  const VIEW_H = viewSize.h;

  const activeGonio = useMemo(
    () => goniometers.find((g) => g.id === activeId) || goniometers[0],
    [goniometers, activeId],
  );

  const computedList = useMemo(
    () =>
      goniometers.map((g) => ({
        instance: g,
        geom: computeGonioGeometry(g, VIEW_W, VIEW_H),
      })),
    [goniometers, VIEW_W, VIEW_H],
  );

  const activeComputed = useMemo(
    () => computedList.find((c) => c.instance.id === activeGonio.id) || computedList[0],
    [computedList, activeGonio.id],
  );

  const getNormalizedPointer = (clientX: number, clientY: number): Point2D | null => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    };
  };

  const handleStartDrag =
    (gonioId: string, part: DragPart) => (e: React.PointerEvent<SVGGElement>) => {
      if (traceMode) return;
      e.stopPropagation();
      setActiveId(gonioId);
      const targetGonio = goniometers.find((g) => g.id === gonioId);
      if (!targetGonio || targetGonio.locked) return;

      const pt = getNormalizedPointer(e.clientX, e.clientY);
      if (!pt) return;

      setDragState({ gonioId, part, lastPt: pt });
      const svg = e.currentTarget.ownerSVGElement;
      if (svg) {
        try {
          svg.setPointerCapture(e.pointerId);
        } catch {
          // Ignore capture error
        }
      }
    };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!traceMode || dragState) return;
    const rawPt = getNormalizedPointer(e.clientX, e.clientY);
    if (!rawPt) return;

    const snapAnchor =
      traceDraftPts.length === 1
        ? traceDraftPts[0]
        : traceDraftPts.length === 2
          ? traceDraftPts[1]
          : null;
    const pt = snapAnchor
      ? snapPointToOrtho(snapAnchor, rawPt, VIEW_W, VIEW_H, e.shiftKey)
      : rawPt;

    const nextPts = [...traceDraftPts, pt];
    if (nextPts.length < 3) {
      setTraceDraftPts(nextPts);
      return;
    }

    // Fijar los 3 puntos trazados (Ref -> Vértice -> Segmento) sobre el goniómetro activo
    setGoniometers((prev) =>
      prev.map((g) =>
        g.id === activeGonio.id && !g.locked
          ? {
              ...g,
              refPt: nextPts[0],
              vertexPt: nextPts[1],
              segPt: nextPts[2],
            }
          : g,
      ),
    );
    setTraceDraftPts([]);
    setTraceHoverPt(null);
    setTraceMode(false);
  };

  const handleSvgMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (traceMode && !dragState) {
      const rawPt = getNormalizedPointer(e.clientX, e.clientY);
      if (!rawPt) return;
      const snapAnchor =
        traceDraftPts.length === 1
          ? traceDraftPts[0]
          : traceDraftPts.length === 2
            ? traceDraftPts[1]
            : null;
      const pt = snapAnchor
        ? snapPointToOrtho(snapAnchor, rawPt, VIEW_W, VIEW_H, e.shiftKey)
        : rawPt;
      setTraceHoverPt(pt);
      return;
    }

    if (!dragState) return;
    const rawPt = getNormalizedPointer(e.clientX, e.clientY);
    if (!rawPt) return;

    const dx = rawPt.x - dragState.lastPt.x;
    const dy = rawPt.y - dragState.lastPt.y;

    setGoniometers((prev) =>
      prev.map((g) => {
        if (g.id !== dragState.gonioId || g.locked) return g;

        if (dragState.part === 'whole') {
          return {
            ...g,
            vertexPt: { x: clamp01(g.vertexPt.x + dx), y: clamp01(g.vertexPt.y + dy) },
            refPt: { x: clamp01(g.refPt.x + dx), y: clamp01(g.refPt.y + dy) },
            segPt: { x: clamp01(g.segPt.x + dx), y: clamp01(g.segPt.y + dy) },
          };
        }

        if (dragState.part === 'vertex') {
          if (g.fixedRefDirection) {
            const refOffX = g.refPt.x - g.vertexPt.x;
            const refOffY = g.refPt.y - g.vertexPt.y;
            return {
              ...g,
              vertexPt: rawPt,
              refPt: { x: clamp01(rawPt.x + refOffX), y: clamp01(rawPt.y + refOffY) },
            };
          }
          return { ...g, vertexPt: rawPt };
        }

        if (dragState.part === 'ref') {
          if (g.fixedRefDirection) return g;
          const snapped = snapPointToOrtho(g.vertexPt, rawPt, VIEW_W, VIEW_H, e.shiftKey);
          return { ...g, refPt: snapped };
        }

        if (dragState.part === 'seg') {
          const snapped = snapPointToOrtho(g.vertexPt, rawPt, VIEW_W, VIEW_H, e.shiftKey);
          return { ...g, segPt: snapped };
        }

        return g;
      }),
    );

    setDragState((prev) => (prev ? { ...prev, lastPt: rawPt } : null));
  };

  const handleSvgUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragState) return;
    setDragState(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore release error
    }
  };

  const updateActiveGonio = (updater: (g: GoniometerInstance) => GoniometerInstance) => {
    setGoniometers((prev) =>
      prev.map((g) => (g.id === activeGonio.id ? updater(g) : g)),
    );
  };

  const handleAddGoniometer = () => {
    const nextIdx = goniometers.length;
    const created = makeDefaultGoniometer(nextIdx);
    setGoniometers((prev) => [...prev, created]);
    setActiveId(created.id);
  };

  const handleDeleteActiveGoniometer = () => {
    if (goniometers.length <= 1) return;
    const remaining = goniometers.filter((g) => g.id !== activeGonio.id);
    setGoniometers(remaining);
    setActiveId(remaining[remaining.length - 1].id);
  };

  const alignActiveRef = (mode: 'down' | 'up' | 'horiz') => {
    updateActiveGonio((g) => {
      if (g.locked) return g;
      const refPt =
        mode === 'down'
          ? { x: g.vertexPt.x, y: clamp01(g.vertexPt.y + 0.32) }
          : mode === 'up'
            ? { x: g.vertexPt.x, y: clamp01(g.vertexPt.y - 0.32) }
            : { x: clamp01(g.vertexPt.x + 0.3), y: g.vertexPt.y };
      return { ...g, refPt };
    });
  };

  const resetAllGoniometers = () => {
    const first = makeDefaultGoniometer(0);
    setGoniometers([first]);
    setActiveId(first.id);
    setTraceMode(false);
    setTraceDraftPts([]);
    setZoom(1);
  };

  const liveTraceGeom = useMemo(() => {
    if (!traceMode || traceDraftPts.length < 2 || !traceHoverPt) return null;
    return computeGonioGeometry(
      {
        ...activeGonio,
        refPt: traceDraftPts[0],
        vertexPt: traceDraftPts[1],
        segPt: traceHoverPt,
      },
      VIEW_W,
      VIEW_H,
    );
  }, [activeGonio, traceDraftPts, traceHoverPt, traceMode, VIEW_W, VIEW_H]);

  const renderGonioVectors = () => (
    <>
      {computedList.map(({ instance, geom }) => {
        const isSelected = instance.id === activeGonio.id;
        const opacity = isSelected ? 1 : 0.8;
        return (
          <g key={instance.id} opacity={opacity}>
            {geom.sectorPath && <path d={geom.sectorPath} fill={instance.fillRgba} />}
            {geom.arcPath && (
              <path
                d={geom.arcPath}
                fill="none"
                stroke={instance.colorHex}
                strokeWidth={isSelected ? 3.2 : 2.4}
              />
            )}

            {/* Prolongación sutil detrás del vértice */}
            <line
              x1={geom.vx}
              y1={geom.vy}
              x2={geom.extRefX}
              y2={geom.extRefY}
              stroke="rgba(148, 163, 184, 0.75)"
              strokeWidth="1.6"
              strokeDasharray="4 4"
              strokeLinecap="round"
            />

            {/* Recta de Referencia (doble trazo de alto contraste) */}
            <line
              x1={geom.vx}
              y1={geom.vy}
              x2={geom.rx}
              y2={geom.ry}
              stroke="rgba(15, 23, 42, 0.92)"
              strokeWidth={isSelected ? 6 : 5}
              strokeLinecap="round"
            />
            <line
              x1={geom.vx}
              y1={geom.vy}
              x2={geom.rx}
              y2={geom.ry}
              stroke="#e2e8f0"
              strokeWidth={isSelected ? 2.8 : 2.2}
              strokeDasharray="8 5"
              strokeLinecap="round"
            />

            {/* Recta del Segmento Corporal (doble trazo nítido) */}
            <line
              x1={geom.vx}
              y1={geom.vy}
              x2={geom.sx}
              y2={geom.sy}
              stroke="rgba(15, 23, 42, 0.92)"
              strokeWidth={isSelected ? 6.6 : 5.4}
              strokeLinecap="round"
            />
            <line
              x1={geom.vx}
              y1={geom.vy}
              x2={geom.sx}
              y2={geom.sy}
              stroke={instance.colorHex}
              strokeWidth={isSelected ? 3.4 : 2.6}
              strokeLinecap="round"
            />

            {/* Etiqueta flotante arrastrable (traslada todo el goniómetro solidariamente) */}
            <g
              transform={`translate(${geom.bx.toFixed(1)}, ${geom.by.toFixed(1)})`}
              onPointerDown={handleStartDrag(instance.id, 'whole')}
              className={`pointer-events-auto ${instance.locked ? 'cursor-not-allowed' : 'cursor-move'}`}
            >
              <rect
                x="-58"
                y="-16"
                width="116"
                height="32"
                rx="5"
                fill="#0f172a"
                fillOpacity="0.93"
                stroke={instance.colorHex}
                strokeWidth={isSelected ? 2 : 1.2}
              />
              <text
                x="0"
                y="4.5"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="13"
                fontWeight="700"
                fontFamily="ui-monospace, SFMono-Regular, monospace"
              >
                {instance.label}: {geom.absDeg.toFixed(1)}°
              </text>
            </g>

            {/* Nodo Ref */}
            <g
              transform={`translate(${geom.rx.toFixed(1)}, ${geom.ry.toFixed(1)})`}
              onPointerDown={handleStartDrag(instance.id, 'ref')}
              className={`pointer-events-auto ${
                instance.locked || instance.fixedRefDirection
                  ? 'cursor-not-allowed'
                  : 'cursor-grab active:cursor-grabbing'
              }`}
            >
              <circle r="20" fill="transparent" />
              <circle r="9.5" fill="#ffffff" stroke="#0f172a" strokeWidth="2.8" />
              <text x="0" y="3.5" textAnchor="middle" fill="#0f172a" fontSize="9.5" fontWeight="800">
                R
              </text>
            </g>

            {/* Nodo Vértice */}
            <g
              transform={`translate(${geom.vx.toFixed(1)}, ${geom.vy.toFixed(1)})`}
              onPointerDown={handleStartDrag(instance.id, 'vertex')}
              className={`pointer-events-auto ${
                instance.locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'
              }`}
            >
              <circle r="22" fill="transparent" />
              <circle r="11" fill="#0f172a" stroke="#ffffff" strokeWidth="2.8" />
              <circle r="3.8" fill="#38bdf8" />
            </g>

            {/* Nodo Segmento */}
            <g
              transform={`translate(${geom.sx.toFixed(1)}, ${geom.sy.toFixed(1)})`}
              onPointerDown={handleStartDrag(instance.id, 'seg')}
              className={`pointer-events-auto ${
                instance.locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'
              }`}
            >
              <circle r="20" fill="transparent" />
              <circle r="10" fill={instance.colorHex} stroke="#ffffff" strokeWidth="2.8" />
              <text x="0" y="3.5" textAnchor="middle" fill="#ffffff" fontSize="9.5" fontWeight="800">
                S
              </text>
            </g>
          </g>
        );
      })}

      {/* Vista previa elástica en modo Trazar 3 clics */}
      {traceMode && traceDraftPts.length === 1 && traceHoverPt && (
        <g className="pointer-events-none">
          <line
            x1={traceDraftPts[0].x * VIEW_W}
            y1={traceDraftPts[0].y * VIEW_H}
            x2={traceHoverPt.x * VIEW_W}
            y2={traceHoverPt.y * VIEW_H}
            stroke="rgba(15, 23, 42, 0.92)"
            strokeWidth="5.5"
            strokeLinecap="round"
          />
          <line
            x1={traceDraftPts[0].x * VIEW_W}
            y1={traceDraftPts[0].y * VIEW_H}
            x2={traceHoverPt.x * VIEW_W}
            y2={traceHoverPt.y * VIEW_H}
            stroke="#facc15"
            strokeWidth="2.8"
            strokeDasharray="7 4"
            strokeLinecap="round"
          />
          <circle
            cx={traceDraftPts[0].x * VIEW_W}
            cy={traceDraftPts[0].y * VIEW_H}
            r="6"
            fill="#facc15"
            stroke="#0f172a"
            strokeWidth="2"
          />
        </g>
      )}

      {traceMode && traceDraftPts.length === 2 && (
        <g className="pointer-events-none">
          {liveTraceGeom?.sectorPath && (
            <path d={liveTraceGeom.sectorPath} fill="rgba(250, 204, 21, 0.25)" />
          )}
          {liveTraceGeom?.arcPath && (
            <path d={liveTraceGeom.arcPath} fill="none" stroke="#facc15" strokeWidth="2.8" />
          )}
          <line
            x1={traceDraftPts[0].x * VIEW_W}
            y1={traceDraftPts[0].y * VIEW_H}
            x2={traceDraftPts[1].x * VIEW_W}
            y2={traceDraftPts[1].y * VIEW_H}
            stroke="rgba(15, 23, 42, 0.92)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <line
            x1={traceDraftPts[0].x * VIEW_W}
            y1={traceDraftPts[0].y * VIEW_H}
            x2={traceDraftPts[1].x * VIEW_W}
            y2={traceDraftPts[1].y * VIEW_H}
            stroke="#e2e8f0"
            strokeWidth="2.8"
            strokeDasharray="7 4"
            strokeLinecap="round"
          />
          {traceHoverPt && (
            <>
              <line
                x1={traceDraftPts[1].x * VIEW_W}
                y1={traceDraftPts[1].y * VIEW_H}
                x2={traceHoverPt.x * VIEW_W}
                y2={traceHoverPt.y * VIEW_H}
                stroke="rgba(15, 23, 42, 0.92)"
                strokeWidth="6"
                strokeLinecap="round"
              />
              <line
                x1={traceDraftPts[1].x * VIEW_W}
                y1={traceDraftPts[1].y * VIEW_H}
                x2={traceHoverPt.x * VIEW_W}
                y2={traceHoverPt.y * VIEW_H}
                stroke="#38bdf8"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </>
          )}
          {liveTraceGeom && (
            <g transform={`translate(${liveTraceGeom.bx.toFixed(1)}, ${liveTraceGeom.by.toFixed(1)})`}>
              <rect
                x="-52"
                y="-15"
                width="104"
                height="30"
                rx="5"
                fill="#0f172a"
                stroke="#facc15"
                strokeWidth="1.6"
              />
              <text
                x="0"
                y="4.5"
                textAnchor="middle"
                fill="#fef08a"
                fontSize="12.5"
                fontWeight="700"
                fontFamily="ui-monospace, SFMono-Regular, monospace"
              >
                {liveTraceGeom.absDeg.toFixed(1)}°
              </text>
            </g>
          )}
          <circle
            cx={traceDraftPts[0].x * VIEW_W}
            cy={traceDraftPts[0].y * VIEW_H}
            r="5.5"
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth="2"
          />
          <circle
            cx={traceDraftPts[1].x * VIEW_W}
            cy={traceDraftPts[1].y * VIEW_H}
            r="6.5"
            fill="#38bdf8"
            stroke="#0f172a"
            strokeWidth="2"
          />
        </g>
      )}
    </>
  );

  if (transparentOverlay) {
    return (
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between z-20">
        {/* Barra flotante superior para goniómetros superpuestos sobre el visor 3D */}
        <div className="pointer-events-auto m-2 px-2.5 py-1.5 rounded bg-slate-900/92 text-white border border-slate-700 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <Crosshair className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="font-semibold">Goniómetro Libre 3D:</span>
            {computedList.map(({ instance, geom }) => {
              const isSel = instance.id === activeGonio.id;
              return (
                <button
                  key={instance.id}
                  type="button"
                  onClick={() => setActiveId(instance.id)}
                  className={`px-2 py-0.5 rounded font-mono tabular-nums text-[11px] border cursor-pointer transition-colors ${
                    isSel
                      ? 'bg-sky-600 text-white border-sky-400 font-bold'
                      : 'bg-slate-800 text-slate-200 border-slate-600 hover:bg-slate-700'
                  }`}
                >
                  {instance.label}: {geom.absDeg.toFixed(1)}°
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setTraceMode((v) => !v);
                setTraceDraftPts([]);
                setTraceHoverPt(null);
              }}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold cursor-pointer border ${
                traceMode
                  ? 'bg-amber-500 text-slate-950 border-amber-300'
                  : 'bg-slate-800 text-slate-100 border-slate-600 hover:bg-slate-700'
              }`}
              title="Trazar las dos rectas directamente haciendo 3 clics (Ref → Vértice → Segmento)"
            >
              <Compass className="w-3 h-3" />
              {traceMode ? `Clic ${traceDraftPts.length + 1}/3` : 'Trazar 3 clics'}
            </button>
            <button
              type="button"
              onClick={handleAddGoniometer}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
              title="Agregar otro goniómetro independiente en pantalla"
            >
              <Plus className="w-3 h-3" />
              Otro
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => alignActiveRef('down')}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 cursor-pointer"
              title="Alinear referencia vertical abajo (0° gravedad)"
            >
              Ref ↓
            </button>
            <button
              type="button"
              onClick={() => alignActiveRef('up')}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 cursor-pointer"
              title="Alinear referencia vertical arriba (tronco/cuello)"
            >
              Ref ↑
            </button>
            <button
              type="button"
              onClick={() =>
                updateActiveGonio((g) => ({ ...g, fixedRefDirection: !g.fixedRefDirection }))
              }
              className={`px-1.5 py-0.5 rounded border cursor-pointer ${
                activeGonio.fixedRefDirection
                  ? 'bg-amber-600 text-white border-amber-400'
                  : 'bg-slate-800 text-slate-200 border-slate-600 hover:bg-slate-700'
              }`}
              title="Fijar orientación del brazo de referencia mientras traslada el goniómetro libremente"
            >
              {activeGonio.fixedRefDirection ? 'Eje Ref Fijo' : 'Eje Ref Libre'}
            </button>
            <button
              type="button"
              onClick={() => updateActiveGonio((g) => ({ ...g, locked: !g.locked }))}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border cursor-pointer ${
                activeGonio.locked
                  ? 'bg-rose-600 text-white border-rose-400'
                  : 'bg-slate-800 text-slate-200 border-slate-600 hover:bg-slate-700'
              }`}
              title="Bloquear/Fijar este goniómetro en su posición actual"
            >
              {activeGonio.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
              {activeGonio.locked ? 'Fijo' : 'Libre'}
            </button>
            {goniometers.length > 1 && (
              <button
                type="button"
                onClick={handleDeleteActiveGoniometer}
                className="p-1 rounded bg-slate-800 hover:bg-rose-700 border border-slate-600 cursor-pointer"
                title="Quitar goniómetro seleccionado"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
            {onApplyAngle && (
              <button
                type="button"
                onClick={() =>
                  onApplyAngle(Math.round(activeComputed.geom.absDeg), activeGonio.label)
                }
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold cursor-pointer tabular-nums"
              >
                <Check className="w-3 h-3" />
                Aplicar {Math.round(activeComputed.geom.absDeg)}°
              </button>
            )}
          </div>
        </div>

        <div ref={containerRef} className="relative flex-1 w-full h-full pointer-events-none">
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            onClick={handleSvgClick}
            onPointerMove={handleSvgMove}
            onPointerUp={handleSvgUp}
            onPointerCancel={handleSvgUp}
            className={`w-full h-full touch-none ${
              traceMode ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'
            }`}
          >
            {renderGonioVectors()}
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Barra superior multi-goniómetro fijo / libre */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
            <Crosshair className="w-3.5 h-3.5 text-sky-700" />
            Goniómetros de Rectas
          </span>
          {figureCode && (
            <span className="font-mono text-[11px] font-semibold text-sky-800">
              · {figureCode}
            </span>
          )}

          {computedList.map(({ instance, geom }) => {
            const isSel = instance.id === activeGonio.id;
            return (
              <button
                key={instance.id}
                type="button"
                onClick={() => setActiveId(instance.id)}
                className={`min-h-[32px] inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-xs border cursor-pointer tabular-nums transition-colors ${
                  isSel
                    ? 'bg-slate-900 text-white border-slate-900 font-bold'
                    : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100 font-semibold'
                }`}
                title="Seleccionar este goniómetro para editarlo o transferir su ángulo"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: instance.colorHex }}
                />
                <span>
                  {instance.label}: {geom.absDeg.toFixed(1)}°
                </span>
                {instance.locked && <Lock className="w-3 h-3 text-amber-400" />}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => {
              setTraceMode((v) => !v);
              setTraceDraftPts([]);
              setTraceHoverPt(null);
            }}
            className={`min-h-[32px] inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer border transition-colors ${
              traceMode
                ? 'bg-sky-700 text-white border-sky-700'
                : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
            }`}
            title="Trazar las dos rectas en 3 clics (Referencia → Vértice → Segmento); Shift bloquea 0°/90°/45°"
          >
            <Compass className="w-3.5 h-3.5" />
            {traceMode ? `Trazando (${traceDraftPts.length + 1}/3)…` : 'Trazar 3 clics'}
          </button>

          <button
            type="button"
            onClick={handleAddGoniometer}
            className="min-h-[32px] inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold cursor-pointer shadow-2xs"
            title="Agregar otro goniómetro independiente sobre la misma imagen"
          >
            <Plus className="w-3.5 h-3.5" />
            Otro goniómetro
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => alignActiveRef('down')}
            className="px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-medium text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
            title="Alinear eje de referencia vertical hacia abajo (gravedad 0°)"
          >
            Ref. Vertical ↓
          </button>
          <button
            type="button"
            onClick={() => alignActiveRef('up')}
            className="px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-medium text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
            title="Alinear eje de referencia vertical hacia arriba (tronco/cuello)"
          >
            Ref. Vertical ↑
          </button>
          <button
            type="button"
            onClick={() => alignActiveRef('horiz')}
            className="px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-medium text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
            title="Alinear eje de referencia horizontal"
          >
            Ref. Horizontal
          </button>
          <button
            type="button"
            onClick={() =>
              updateActiveGonio((g) => ({ ...g, fixedRefDirection: !g.fixedRefDirection }))
            }
            className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-semibold cursor-pointer ${
              activeGonio.fixedRefDirection
                ? 'bg-amber-100 border-amber-400 text-amber-950'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
            title="Mantener fijo el ángulo del eje de referencia al mover el vértice libremente"
          >
            <Move className="w-3 h-3" />
            {activeGonio.fixedRefDirection ? 'Ref. Fija' : 'Ref. Libre'}
          </button>
          <button
            type="button"
            onClick={() => updateActiveGonio((g) => ({ ...g, locked: !g.locked }))}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-semibold cursor-pointer ${
              activeGonio.locked
                ? 'bg-rose-100 border-rose-400 text-rose-950'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
            title="Fijar/Bloquear el goniómetro activo para que no se mueva mientras agrega otro"
          >
            {activeGonio.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            {activeGonio.locked ? `${activeGonio.label} Fijo` : `${activeGonio.label} Libre`}
          </button>
          {goniometers.length > 1 && (
            <button
              type="button"
              onClick={handleDeleteActiveGoniometer}
              className="p-1.5 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 shrink-0 cursor-pointer"
              title="Eliminar el goniómetro seleccionado"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1, Number((z - 0.25).toFixed(2))))}
            disabled={zoom <= 1}
            className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 shrink-0 cursor-pointer"
            title="Reducir zoom"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[11px] text-slate-600 px-1 tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.25).toFixed(2))))}
            disabled={zoom >= 2.5}
            className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 shrink-0 cursor-pointer"
            title="Ampliar lámina para mayor precisión"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={resetAllGoniometers}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-medium text-slate-700 shrink-0 cursor-pointer"
            title="Restablecer goniómetros"
          >
            <RotateCcw className="w-3 h-3" />
            Reiniciar
          </button>
        </div>
      </div>

      {/* Lienzo interactivo con múltiples goniómetros sin distorsión de relación de aspecto */}
      <div className="border border-slate-300 rounded-md bg-white overflow-auto max-h-[560px]">
        <div
          ref={containerRef}
          style={{ width: `${zoom * 100}%` }}
          className={`relative mx-auto select-none bg-white ${
            compact ? 'min-h-[260px]' : 'min-h-[340px]'
          }`}
        >
          {imageUrl && !imgError ? (
            <img
              src={imageUrl}
              alt={figureLabel || 'Lámina anatómica de referencia'}
              onError={() => setImgError(true)}
              onLoad={() => {
                if (containerRef.current) {
                  const r = containerRef.current.getBoundingClientRect();
                  if (r.width > 10 && r.height > 10) {
                    setViewSize({ w: Math.round(r.width), h: Math.round(r.height) });
                  }
                }
              }}
              referrerPolicy="no-referrer"
              draggable={false}
              className="w-full h-auto block object-contain pointer-events-none select-none"
            />
          ) : (
            <div className="p-8 text-center text-xs text-slate-500">
              No se pudo cargar la lámina de referencia ({imageUrl || 'sin ruta'}).
            </div>
          )}

          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            onClick={handleSvgClick}
            onPointerMove={handleSvgMove}
            onPointerUp={handleSvgUp}
            onPointerCancel={handleSvgUp}
            className={`absolute inset-0 w-full h-full touch-none ${
              traceMode ? 'cursor-crosshair' : ''
            }`}
          >
            {renderGonioVectors()}
          </svg>
        </div>
      </div>

      {/* Pie explicativo + botón de transferencia directa del goniómetro seleccionado */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            <strong>Centro:</strong> Vértice articular
          </span>
          <span>·</span>
          <span>
            <strong>R:</strong> Recta referencia (Shift = 0°/90°/45°)
          </span>
          <span>·</span>
          <span>
            <strong>S:</strong> Recta segmento · Arrastrar etiqueta traslada todo {activeGonio.label}
          </span>
        </div>

        {onApplyAngle && (
          <button
            type="button"
            onClick={() =>
              onApplyAngle(Math.round(activeComputed.geom.absDeg), activeGonio.label)
            }
            className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold shadow-2xs transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
          >
            <Check className="w-3.5 h-3.5" />
            {applyButtonLabel || `Transferir ${activeGonio.label} (${Math.round(activeComputed.geom.absDeg)}°) al campo`}
          </button>
        )}
      </div>
    </div>
  );
};


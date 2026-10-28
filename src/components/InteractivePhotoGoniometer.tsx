import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
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
  { colorHex: '#0284c7', fillRgba: 'rgba(2, 132, 199, 0.18)' },
  { colorHex: '#059669', fillRgba: 'rgba(5, 150, 105, 0.18)' },
  { colorHex: '#d97706', fillRgba: 'rgba(217, 119, 6, 0.18)' },
  { colorHex: '#7c3aed', fillRgba: 'rgba(124, 58, 237, 0.18)' },
  { colorHex: '#dc2626', fillRgba: 'rgba(220, 38, 38, 0.18)' },
  { colorHex: '#0f766e', fillRgba: 'rgba(15, 118, 110, 0.18)' },
];

function clamp01(val: number): number {
  return Math.max(0.03, Math.min(0.97, val));
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
  const radius = Math.max(34, Math.min(110, Math.min(lenRef, lenSeg) * 0.56));

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

  const midAngle = aRef + diff * 0.5;
  const badgeDist = radius + 42;
  const bx = Math.max(84, Math.min(viewW - 84, vx + Math.cos(midAngle) * badgeDist));
  const by = Math.max(34, Math.min(viewH - 34, vy + Math.sin(midAngle) * badgeDist));

  return {
    vx,
    vy,
    rx,
    ry,
    sx,
    sy,
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

  const VIEW_W = 1000;
  const VIEW_H = 650;

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
    [goniometers],
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

  const handleSvgMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragState) return;
    const pt = getNormalizedPointer(e.clientX, e.clientY);
    if (!pt) return;

    const dx = pt.x - dragState.lastPt.x;
    const dy = pt.y - dragState.lastPt.y;

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
              vertexPt: pt,
              refPt: { x: clamp01(pt.x + refOffX), y: clamp01(pt.y + refOffY) },
            };
          }
          return { ...g, vertexPt: pt };
        }

        if (dragState.part === 'ref') {
          if (g.fixedRefDirection) return g;
          return { ...g, refPt: pt };
        }

        if (dragState.part === 'seg') {
          return { ...g, segPt: pt };
        }

        return g;
      }),
    );

    setDragState((prev) => (prev ? { ...prev, lastPt: pt } : null));
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
    setZoom(1);
  };

  if (transparentOverlay) {
    return (
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between z-20">
        {/* Barra flotante superior para goniómetros superpuestos sobre el visor 3D */}
        <div className="pointer-events-auto m-2 px-2.5 py-1.5 rounded bg-slate-900/90 text-white border border-slate-700 flex flex-wrap items-center justify-between gap-2 text-[11px]">
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
                  {instance.locked ? ' 🔒' : ''}
                </button>
              );
            })}
            <button
              type="button"
              onClick={handleAddGoniometer}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
              title="Agregar otro goniómetro independiente en pantalla"
            >
              <Plus className="w-3 h-3" />
              Otro goniómetro
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
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold cursor-pointer"
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
            preserveAspectRatio="none"
            onPointerMove={handleSvgMove}
            onPointerUp={handleSvgUp}
            onPointerCancel={handleSvgUp}
            className="w-full h-full touch-none pointer-events-none"
          >
            {computedList.map(({ instance, geom }) => {
              const isSelected = instance.id === activeGonio.id;
              const opacity = isSelected ? 1 : 0.78;
              return (
                <g key={instance.id} opacity={opacity}>
                  {geom.sectorPath && <path d={geom.sectorPath} fill={instance.fillRgba} />}
                  {geom.arcPath && (
                    <path
                      d={geom.arcPath}
                      fill="none"
                      stroke={instance.colorHex}
                      strokeWidth={isSelected ? 3.5 : 2.5}
                    />
                  )}
                  <line
                    x1={geom.vx}
                    y1={geom.vy}
                    x2={geom.rx}
                    y2={geom.ry}
                    stroke="#334155"
                    strokeWidth={3}
                    strokeDasharray="9 6"
                  />
                  <line
                    x1={geom.vx}
                    y1={geom.vy}
                    x2={geom.sx}
                    y2={geom.sy}
                    stroke={instance.colorHex}
                    strokeWidth={isSelected ? 4 : 3}
                  />

                  {/* Etiqueta flotante arrastrable (traslada todo el goniómetro solidariamente) */}
                  <g
                    transform={`translate(${geom.bx.toFixed(1)}, ${geom.by.toFixed(1)})`}
                    onPointerDown={handleStartDrag(instance.id, 'whole')}
                    className="pointer-events-auto cursor-move"
                  >
                    <rect
                      x="-58"
                      y="-17"
                      width="116"
                      height="34"
                      rx="6"
                      fill="#0f172a"
                      fillOpacity="0.92"
                      stroke={instance.colorHex}
                      strokeWidth={isSelected ? 2 : 1.2}
                    />
                    <text
                      x="0"
                      y="5"
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="13.5"
                      fontWeight="700"
                      fontFamily="monospace"
                    >
                      {instance.label}: {geom.absDeg.toFixed(1)}°
                    </text>
                  </g>

                  {/* Nodo Ref */}
                  <g
                    transform={`translate(${geom.rx.toFixed(1)}, ${geom.ry.toFixed(1)})`}
                    onPointerDown={handleStartDrag(instance.id, 'ref')}
                    className={`pointer-events-auto ${instance.locked || instance.fixedRefDirection ? 'cursor-not-allowed' : 'cursor-grab'}`}
                  >
                    <circle r="22" fill="transparent" />
                    <circle r="10" fill="#ffffff" stroke="#334155" strokeWidth="3" />
                    <text y="3.5" textAnchor="middle" fill="#0f172a" fontSize="9.5" fontWeight="800">
                      R
                    </text>
                  </g>

                  {/* Nodo Vértice */}
                  <g
                    transform={`translate(${geom.vx.toFixed(1)}, ${geom.vy.toFixed(1)})`}
                    onPointerDown={handleStartDrag(instance.id, 'vertex')}
                    className={`pointer-events-auto ${instance.locked ? 'cursor-not-allowed' : 'cursor-grab'}`}
                  >
                    <circle r="24" fill="transparent" />
                    <circle r="12" fill="#0f172a" stroke="#ffffff" strokeWidth="3" />
                    <circle r="4" fill="#38bdf8" />
                  </g>

                  {/* Nodo Segmento */}
                  <g
                    transform={`translate(${geom.sx.toFixed(1)}, ${geom.sy.toFixed(1)})`}
                    onPointerDown={handleStartDrag(instance.id, 'seg')}
                    className={`pointer-events-auto ${instance.locked ? 'cursor-not-allowed' : 'cursor-grab'}`}
                  >
                    <circle r="22" fill="transparent" />
                    <circle r="11" fill={instance.colorHex} stroke="#ffffff" strokeWidth="3" />
                    <text y="3.5" textAnchor="middle" fill="#ffffff" fontSize="9.5" fontWeight="800">
                      S
                    </text>
                  </g>
                </g>
              );
            })}
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
            Goniómetros Libres / Fijos
          </span>
          {figureCode && (
            <span className="font-mono text-[11px] font-semibold text-sky-800 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded">
              {figureCode}
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
            onClick={handleAddGoniometer}
            className="min-h-[32px] inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold cursor-pointer shadow-2xs"
            title="Agregar otro goniómetro independiente sobre la misma imagen"
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar otro goniómetro
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
            {activeGonio.fixedRefDirection ? 'Ref. Fija Libre' : 'Ref. Libre'}
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

      {/* Lienzo interactivo con múltiples goniómetros */}
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
            preserveAspectRatio="none"
            onPointerMove={handleSvgMove}
            onPointerUp={handleSvgUp}
            onPointerCancel={handleSvgUp}
            className="absolute inset-0 w-full h-full touch-none"
          >
            {computedList.map(({ instance, geom }) => {
              const isSelected = instance.id === activeGonio.id;
              return (
                <g key={instance.id} opacity={isSelected ? 1 : 0.8}>
                  {geom.sectorPath && <path d={geom.sectorPath} fill={instance.fillRgba} />}
                  {geom.arcPath && (
                    <path
                      d={geom.arcPath}
                      fill="none"
                      stroke={instance.colorHex}
                      strokeWidth={isSelected ? 3.5 : 2.5}
                    />
                  )}

                  {/* Brazo Referencia */}
                  <line
                    x1={geom.vx}
                    y1={geom.vy}
                    x2={geom.rx}
                    y2={geom.ry}
                    stroke="#334155"
                    strokeWidth={3.2}
                    strokeDasharray="10 6"
                  />

                  {/* Brazo Segmento */}
                  <line
                    x1={geom.vx}
                    y1={geom.vy}
                    x2={geom.sx}
                    y2={geom.sy}
                    stroke={instance.colorHex}
                    strokeWidth={isSelected ? 4 : 3}
                  />

                  {/* Etiqueta arrastrable para mover todo el goniómetro libremente */}
                  <g
                    transform={`translate(${geom.bx.toFixed(1)}, ${geom.by.toFixed(1)})`}
                    onPointerDown={handleStartDrag(instance.id, 'whole')}
                    className={instance.locked ? 'cursor-not-allowed' : 'cursor-move'}
                  >
                    <rect
                      x="-62"
                      y="-18"
                      width="124"
                      height="36"
                      rx="6"
                      fill="#0f172a"
                      fillOpacity="0.93"
                      stroke={instance.colorHex}
                      strokeWidth={isSelected ? 2.2 : 1.3}
                    />
                    <text
                      x="0"
                      y="5"
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="14.5"
                      fontWeight="700"
                      fontFamily="monospace"
                    >
                      {instance.label}: {geom.absDeg.toFixed(1)}°
                    </text>
                  </g>

                  {/* Nodo 1: Eje de Referencia */}
                  <g
                    transform={`translate(${geom.rx.toFixed(1)}, ${geom.ry.toFixed(1)})`}
                    onPointerDown={handleStartDrag(instance.id, 'ref')}
                    className={
                      instance.locked || instance.fixedRefDirection
                        ? 'cursor-not-allowed'
                        : 'cursor-grab active:cursor-grabbing'
                    }
                  >
                    <circle r="24" fill="transparent" />
                    <circle r="11" fill="#ffffff" stroke="#334155" strokeWidth="3.5" />
                    <text x="0" y="4" textAnchor="middle" fill="#0f172a" fontSize="10" fontWeight="800">
                      R
                    </text>
                  </g>

                  {/* Nodo 2: Vértice Articular */}
                  <g
                    transform={`translate(${geom.vx.toFixed(1)}, ${geom.vy.toFixed(1)})`}
                    onPointerDown={handleStartDrag(instance.id, 'vertex')}
                    className={
                      instance.locked
                        ? 'cursor-not-allowed'
                        : 'cursor-grab active:cursor-grabbing'
                    }
                  >
                    <circle r="26" fill="transparent" />
                    <circle r="13" fill="#0f172a" stroke="#ffffff" strokeWidth="3.5" />
                    <circle r="4.5" fill="#38bdf8" />
                  </g>

                  {/* Nodo 3: Segmento */}
                  <g
                    transform={`translate(${geom.sx.toFixed(1)}, ${geom.sy.toFixed(1)})`}
                    onPointerDown={handleStartDrag(instance.id, 'seg')}
                    className={
                      instance.locked
                        ? 'cursor-not-allowed'
                        : 'cursor-grab active:cursor-grabbing'
                    }
                  >
                    <circle r="24" fill="transparent" />
                    <circle r="11.5" fill={instance.colorHex} stroke="#ffffff" strokeWidth="3.5" />
                    <text x="0" y="4" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="800">
                      S
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Pie explicativo + botón de transferencia directa del goniómetro seleccionado */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-slate-900 border-2 border-sky-400 inline-block" />
            <strong>Centro:</strong> Vértice articular
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-white border-2 border-slate-700 inline-block" />
            <strong>R:</strong> Eje referencia (libre o fijo)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-full border border-white inline-block"
              style={{ backgroundColor: activeGonio.colorHex }}
            />
            <strong>S:</strong> Segmento corporal · Arrastrar etiqueta traslada todo {activeGonio.label}
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

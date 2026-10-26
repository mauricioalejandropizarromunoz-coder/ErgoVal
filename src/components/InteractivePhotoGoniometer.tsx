import React, { useMemo, useRef, useState } from 'react';
import { Check, Crosshair, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';

interface Point2D {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
}

export interface InteractivePhotoGoniometerProps {
  imageUrl: string;
  figureCode?: string;
  figureLabel?: string;
  onApplyAngle?: (degrees: number) => void;
  applyButtonLabel?: string;
  compact?: boolean;
}

type DragTarget = 'ref' | 'vertex' | 'seg' | null;

const INITIAL_VERTEX: Point2D = { x: 0.48, y: 0.36 };
const INITIAL_REF: Point2D = { x: 0.48, y: 0.72 };
const INITIAL_SEG: Point2D = { x: 0.68, y: 0.54 };

function clamp01(val: number): number {
  return Math.max(0.03, Math.min(0.97, val));
}

export const InteractivePhotoGoniometer: React.FC<InteractivePhotoGoniometerProps> = ({
  imageUrl,
  figureCode,
  figureLabel,
  onApplyAngle,
  applyButtonLabel,
  compact = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [vertexPt, setVertexPt] = useState<Point2D>(INITIAL_VERTEX);
  const [refPt, setRefPt] = useState<Point2D>(INITIAL_REF);
  const [segPt, setSegPt] = useState<Point2D>(INITIAL_SEG);
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [imgError, setImgError] = useState<boolean>(false);

  // Compute angle in degrees using 1000x650 virtual coordinate system so circles/arcs stay proportional
  const VIEW_W = 1000;
  const VIEW_H = 650;

  const geometry = useMemo(() => {
    const vx = vertexPt.x * VIEW_W;
    const vy = vertexPt.y * VIEW_H;
    const rx = refPt.x * VIEW_W;
    const ry = refPt.y * VIEW_H;
    const sx = segPt.x * VIEW_W;
    const sy = segPt.y * VIEW_H;

    const aRef = Math.atan2(ry - vy, rx - vx);
    const aSeg = Math.atan2(sy - vy, sx - vx);

    let diff = aSeg - aRef;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const absDeg = Math.round(Math.abs((diff * 180) / Math.PI) * 10) / 10;
    const signedDeg = Math.round(((diff * 180) / Math.PI) * 10) / 10;

    const lenRef = Math.hypot(rx - vx, ry - vy);
    const lenSeg = Math.hypot(sx - vx, sy - vy);
    const radius = Math.max(36, Math.min(115, Math.min(lenRef, lenSeg) * 0.58));

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
    const badgeDist = radius + 44;
    const bx = Math.max(90, Math.min(VIEW_W - 90, vx + Math.cos(midAngle) * badgeDist));
    const by = Math.max(38, Math.min(VIEW_H - 38, vy + Math.sin(midAngle) * badgeDist));

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
  }, [vertexPt, refPt, segPt]);

  const updatePointFromEvent = (e: React.PointerEvent<SVGSVGElement>, target: DragTarget) => {
    if (!target || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const nx = clamp01((e.clientX - rect.left) / rect.width);
    const ny = clamp01((e.clientY - rect.top) / rect.height);

    if (target === 'vertex') {
      setVertexPt({ x: nx, y: ny });
    } else if (target === 'ref') {
      setRefPt({ x: nx, y: ny });
    } else if (target === 'seg') {
      setSegPt({ x: nx, y: ny });
    }
  };

  const handleHandleDown = (target: DragTarget) => (e: React.PointerEvent<SVGGElement>) => {
    e.stopPropagation();
    setDragTarget(target);
    const svg = e.currentTarget.ownerSVGElement;
    if (svg) {
      try {
        svg.setPointerCapture(e.pointerId);
      } catch {
        // Ignore capture failure
      }
    }
  };

  const handleSvgMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragTarget) return;
    updatePointFromEvent(e, dragTarget);
  };

  const handleSvgUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragTarget) return;
    setDragTarget(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  const alignReferenceVerticalDown = () => {
    setRefPt({ x: vertexPt.x, y: clamp01(vertexPt.y + 0.34) });
  };

  const alignReferenceVerticalUp = () => {
    setRefPt({ x: vertexPt.x, y: clamp01(vertexPt.y - 0.34) });
  };

  const alignReferenceHorizontal = () => {
    setRefPt({ x: clamp01(vertexPt.x + 0.32), y: vertexPt.y });
  };

  const resetGoniometer = () => {
    setVertexPt(INITIAL_VERTEX);
    setRefPt(INITIAL_REF);
    setSegPt(INITIAL_SEG);
    setZoom(1);
  };

  return (
    <div className="space-y-2.5">
      {/* Barra de herramientas del goniómetro */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
            <Crosshair className="w-3.5 h-3.5 text-sky-700" />
            Goniómetro Digital de 3 Puntos
          </span>
          {figureCode && (
            <span className="font-mono text-[11px] font-semibold text-sky-800 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded">
              {figureCode}
            </span>
          )}
          <span className="font-mono text-xs font-bold text-slate-900 bg-white border border-slate-300 px-2 py-0.5 rounded tabular-nums">
            α = {geometry.absDeg.toFixed(1)}°
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={alignReferenceVerticalDown}
            className="px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-medium text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
            title="Alinear eje de referencia vertical hacia abajo (hombro/codo/rodilla)"
          >
            Ref. Vertical ↓
          </button>
          <button
            type="button"
            onClick={alignReferenceVerticalUp}
            className="px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-medium text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
            title="Alinear eje de referencia vertical hacia arriba (tronco/cuello)"
          >
            Ref. Vertical ↑
          </button>
          <button
            type="button"
            onClick={alignReferenceHorizontal}
            className="px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-medium text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
            title="Alinear eje de referencia horizontal (muñeca)"
          >
            Ref. Horizontal
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1, Number((z - 0.25).toFixed(2))))}
            disabled={zoom <= 1}
            className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 shrink-0 cursor-pointer"
            title="Reducir zoom"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[11px] text-slate-600 tabular-nums px-0.5">{zoom.toFixed(2)}×</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.25, Number((z + 0.25).toFixed(2))))}
            disabled={zoom >= 2.25}
            className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 shrink-0 cursor-pointer"
            title="Ampliar lámina"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={resetGoniometer}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-medium text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            Reiniciar
          </button>
        </div>
      </div>

      {/* Visor de lámina con goniómetro superpuesto */}
      <div className="overflow-auto rounded-md border border-slate-300 bg-white">
        <div
          ref={containerRef}
          className={`relative mx-auto select-none bg-white ${
            zoom <= 1
              ? 'w-full'
              : zoom <= 1.25
                ? 'w-[125%]'
                : zoom <= 1.5
                  ? 'w-[150%]'
                  : zoom <= 1.75
                    ? 'w-[175%]'
                    : zoom <= 2
                      ? 'w-[200%]'
                      : 'w-[225%]'
          } ${compact ? 'min-h-[260px]' : 'min-h-[340px]'}`}
        >
          {!imgError ? (
            <img
              src={imageUrl}
              alt={figureLabel || figureCode || 'Lámina anatómica de referencia'}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              draggable={false}
              className="block w-full h-auto object-contain pointer-events-none"
            />
          ) : (
            <div className="w-full h-72 flex items-center justify-center text-xs text-slate-500 bg-slate-50">
              Lámina de referencia no disponible temporalmente
            </div>
          )}

          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="none"
            onPointerMove={handleSvgMove}
            onPointerUp={handleSvgUp}
            className="absolute inset-0 w-full h-full touch-none"
          >
            {/* Sector angular translúcido estilo Cap. 4 */}
            {geometry.sectorPath && (
              <path d={geometry.sectorPath} fill="rgba(59, 130, 246, 0.34)" stroke="none" />
            )}
            {geometry.arcPath && (
              <path d={geometry.arcPath} fill="none" stroke="#1d4ed8" strokeWidth="3.2" />
            )}

            {/* Vector de Referencia (punteado) */}
            <line
              x1={geometry.vx}
              y1={geometry.vy}
              x2={geometry.rx}
              y2={geometry.ry}
              stroke="#334155"
              strokeWidth="3.2"
              strokeDasharray="9 6"
            />

            {/* Vector del Segmento Anatómico (azul sólido) */}
            <line
              x1={geometry.vx}
              y1={geometry.vy}
              x2={geometry.sx}
              y2={geometry.sy}
              stroke="#1d4ed8"
              strokeWidth="4.2"
              strokeLinecap="round"
            />

            {/* Etiqueta flotante del ángulo medido */}
            <g transform={`translate(${geometry.bx}, ${geometry.by})`} className="pointer-events-none">
              <rect
                x="-64"
                y="-18"
                width="128"
                height="34"
                rx="5"
                fill="rgba(255, 255, 255, 0.96)"
                stroke="#1d4ed8"
                strokeWidth="2"
              />
              <text
                x="0"
                y="4"
                textAnchor="middle"
                className="font-mono text-[19px] font-bold fill-[#1e3a8a]"
              >
                {geometry.absDeg.toFixed(1)}°
              </text>
            </g>

            {/* Nodo 1: Eje de Referencia */}
            <g
              transform={`translate(${geometry.rx}, ${geometry.ry})`}
              onPointerDown={handleHandleDown('ref')}
              className="cursor-grab active:cursor-grabbing"
            >
              <circle r="22" fill="transparent" />
              <circle r="11" fill="#ffffff" stroke="#334155" strokeWidth="3" />
              <text
                x="0"
                y="-17"
                textAnchor="middle"
                className="font-mono text-[15px] font-bold fill-slate-800 pointer-events-none"
              >
                Ref
              </text>
            </g>

            {/* Nodo 2: Vértice Articular */}
            <g
              transform={`translate(${geometry.vx}, ${geometry.vy})`}
              onPointerDown={handleHandleDown('vertex')}
              className="cursor-grab active:cursor-grabbing"
            >
              <circle r="24" fill="transparent" />
              <circle r="12.5" fill="#1d4ed8" stroke="#ffffff" strokeWidth="3" />
              <circle r="4" fill="#ffffff" />
              <text
                x="0"
                y="-19"
                textAnchor="middle"
                className="font-mono text-[15px] font-bold fill-[#1e3a8a] pointer-events-none"
              >
                Vértice
              </text>
            </g>

            {/* Nodo 3: Segmento Evaluado */}
            <g
              transform={`translate(${geometry.sx}, ${geometry.sy})`}
              onPointerDown={handleHandleDown('seg')}
              className="cursor-grab active:cursor-grabbing"
            >
              <circle r="22" fill="transparent" />
              <circle r="11.5" fill="#0284c7" stroke="#ffffff" strokeWidth="3" />
              <text
                x="0"
                y="-17"
                textAnchor="middle"
                className="font-mono text-[15px] font-bold fill-sky-900 pointer-events-none"
              >
                Seg
              </text>
            </g>
          </svg>
        </div>
      </div>

      {/* Pie informativo y transferencia directa al modelo 3D / formulario */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>
          Arrastre <strong>Vértice</strong> al centro articular, <strong>Ref</strong> sobre el eje neutro y{' '}
          <strong>Seg</strong> sobre el segmento corporal.
        </span>
        {onApplyAngle && (
          <button
            type="button"
            onClick={() => onApplyAngle(Math.round(geometry.absDeg))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            {applyButtonLabel || `Aplicar ${Math.round(geometry.absDeg)}° al Modelo 3D`}
          </button>
        )}
      </div>
    </div>
  );
};

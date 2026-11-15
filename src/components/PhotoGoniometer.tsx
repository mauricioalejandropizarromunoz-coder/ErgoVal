import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Camera, Compass, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import { AngleAnnotation, StudyPhoto, StudyTab } from '../types/ergonomics';
import {
  isAvatarReplicaPhoto,
  isBiomechanicalVisualMethod,
  renderMethodAvatarStudyPhotos,
} from '../utils/methodAvatarReportHelper';

interface PhotoGoniometerProps {
  photos: StudyPhoto[];
  onChange: (photos: StudyPhoto[]) => void;
  tab?: StudyTab;
}

interface NormPt {
  x: number;
  y: number;
}

function clamp01(v: number): number {
  return Math.max(0.005, Math.min(0.995, v));
}

function snapNormalizedPoint(
  anchor: NormPt,
  raw: NormPt,
  aspectRatio: number,
  enableSnap: boolean,
): NormPt {
  if (!enableSnap) return raw;
  const dxPx = (raw.x - anchor.x) * aspectRatio;
  const dyPx = raw.y - anchor.y;
  const dist = Math.hypot(dxPx, dyPx);
  if (dist < 1e-4) return raw;
  const rawAng = Math.atan2(dyPx, dxPx);
  const snapStep = Math.PI / 4; // 0°, 45°, 90°, 135°, 180°
  const snappedAng = Math.round(rawAng / snapStep) * snapStep;
  return {
    x: clamp01(anchor.x + (Math.cos(snappedAng) * dist) / Math.max(0.05, aspectRatio)),
    y: clamp01(anchor.y + Math.sin(snappedAng) * dist),
  };
}

function calculateAngleDegrees(
  p1: NormPt,
  vertex: NormPt,
  p2: NormPt,
  aspectRatio: number,
): number {
  const v1x = (p1.x - vertex.x) * aspectRatio;
  const v1y = p1.y - vertex.y;
  const v2x = (p2.x - vertex.x) * aspectRatio;
  const v2y = p2.y - vertex.y;
  const dot = v1x * v2x + v1y * v2y;
  const mag1 = Math.hypot(v1x, v1y);
  const mag2 = Math.hypot(v2x, v2y);
  if (mag1 === 0 || mag2 === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return Math.round(((Math.acos(cos) * 180) / Math.PI) * 10) / 10;
}

function buildSvgArcSector(
  p1Px: NormPt,
  vPx: NormPt,
  p2Px: NormPt,
): { sectorPath: string; arcPath: string } {
  const a1 = Math.atan2(p1Px.y - vPx.y, p1Px.x - vPx.x);
  const a2 = Math.atan2(p2Px.y - vPx.y, p2Px.x - vPx.x);
  let diff = a2 - a1;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const len1 = Math.hypot(p1Px.x - vPx.x, p1Px.y - vPx.y);
  const len2 = Math.hypot(p2Px.x - vPx.x, p2Px.y - vPx.y);
  const r = Math.max(18, Math.min(58, Math.min(len1, len2) * 0.42));
  if (Math.abs(diff) < 0.015 || len1 < 8 || len2 < 8) {
    return { sectorPath: '', arcPath: '' };
  }
  const sx = vPx.x + Math.cos(a1) * r;
  const sy = vPx.y + Math.sin(a1) * r;
  const ex = vPx.x + Math.cos(a1 + diff) * r;
  const ey = vPx.y + Math.sin(a1 + diff) * r;
  const sweep = diff >= 0 ? 1 : 0;
  return {
    sectorPath: `M ${vPx.x.toFixed(1)} ${vPx.y.toFixed(1)} L ${sx.toFixed(1)} ${sy.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 ${sweep} ${ex.toFixed(1)} ${ey.toFixed(1)} Z`,
    arcPath: `M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 ${sweep} ${ex.toFixed(1)} ${ey.toFixed(1)}`,
  };
}

async function renderAnnotatedImage(dataUrl: string, annotations: AngleAnnotation[]): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxDim = 1200;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const placedTagRects: Array<{ x: number; y: number; w: number; h: number }> = [];

      annotations.forEach((ann) => {
        const x1 = ann.p1.x * canvas.width;
        const y1 = ann.p1.y * canvas.height;
        const vx = ann.vertex.x * canvas.width;
        const vy = ann.vertex.y * canvas.height;
        const x2 = ann.p2.x * canvas.width;
        const y2 = ann.p2.y * canvas.height;

        // 1. Arco goniométrico sombreado
        const a1 = Math.atan2(y1 - vy, x1 - vx);
        let delta = Math.atan2(y2 - vy, x2 - vx) - a1;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        const segMin = Math.min(Math.hypot(x1 - vx, y1 - vy), Math.hypot(x2 - vx, y2 - vy));
        const arcR = Math.max(18, Math.min(canvas.width * 0.075, segMin * 0.42));

        if (segMin > 8 && Math.abs(delta) > 0.015) {
          ctx.save();
          ctx.fillStyle = 'rgba(56, 189, 248, 0.26)';
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = Math.max(2, canvas.width * 0.0028);
          ctx.beginPath();
          ctx.moveTo(vx, vy);
          ctx.arc(vx, vy, arcR, a1, a1 + delta, delta < 0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }

        // 2. Trazo doble de alta nitidez para ambas rectas (camisa oscura + vector luminoso)
        const innerW = Math.max(2.8, canvas.width * 0.0038);
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.lineWidth = innerW + 3.2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(vx, vy);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = innerW;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(vx, vy);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();

        // 3. Vértices con borde de precisión
        [
          [x1, y1],
          [vx, vy],
          [x2, y2],
        ].forEach(([px, py], idx) => {
          const rPt = Math.max(4.5, canvas.width * 0.0058);
          ctx.save();
          ctx.fillStyle = idx === 1 ? '#0284c7' : '#facc15';
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = Math.max(1.8, canvas.width * 0.0022);
          ctx.beginPath();
          ctx.arc(px, py, rPt, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        });

        const degVal = Math.round(ann.degrees * 10) / 10;
        const tag = `${ann.label ? `${ann.label}: ` : ''}${degVal}°`;
        const fontSize = Math.max(12, Math.round(canvas.width * 0.019));
        ctx.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        const textWidth = ctx.measureText(tag).width;
        const boxW = textWidth + 14;
        const boxH = fontSize + 9;

        const offsets = [
          [16, -(boxH + 10)],
          [16, 16],
          [-(boxW + 16), -(boxH + 10)],
          [-(boxW + 16), 16],
          [0, -(boxH + 36)],
          [0, 40],
        ];

        let chosenX = Math.min(canvas.width - boxW - 6, Math.max(6, vx + 16));
        let chosenY = Math.min(canvas.height - boxH - 6, Math.max(6, vy - boxH - 10));

        for (const [dx, dy] of offsets) {
          const candX = Math.min(canvas.width - boxW - 6, Math.max(6, vx + dx));
          const candY = Math.min(canvas.height - boxH - 6, Math.max(6, vy + dy));
          const collides = placedTagRects.some(
            (r) =>
              candX < r.x + r.w + 6 &&
              candX + boxW + 6 > r.x &&
              candY < r.y + r.h + 6 &&
              candY + boxH + 6 > r.y,
          );
          if (!collides) {
            chosenX = candX;
            chosenY = candY;
            break;
          }
        }

        placedTagRects.push({ x: chosenX, y: chosenY, w: boxW, h: boxH });

        ctx.save();
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(vx, vy);
        ctx.lineTo(chosenX + boxW / 2, chosenY + boxH / 2);
        ctx.stroke();

        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(vx, vy);
        ctx.lineTo(chosenX + boxW / 2, chosenY + boxH / 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.fillRect(chosenX, chosenY, boxW, boxH);
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(chosenX, chosenY, boxW, boxH);

        ctx.fillStyle = '#fef08a';
        ctx.textBaseline = 'middle';
        ctx.fillText(tag, chosenX + 7, chosenY + boxH / 2 + 0.5);
        ctx.restore();
      });

      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function PhotoGoniometer({ photos, onChange, tab }: PhotoGoniometerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [activePhotoId, setActivePhotoId] = useState<string | null>(photos[0]?.id ?? null);
  const [goniometerActive, setGoniometerActive] = useState(false);
  const [draftPoints, setDraftPoints] = useState<NormPt[]>([]);
  const [hoverPoint, setHoverPoint] = useState<NormPt | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<{
    annId: string;
    part: 'p1' | 'vertex' | 'p2';
  } | null>(null);
  const [imgBox, setImgBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>({ left: 0, top: 0, width: 640, height: 420 });
  const [segmentLabel, setSegmentLabel] = useState('Tronco / Brazo');
  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);

  const activePhoto = photos.find((p) => p.id === activePhotoId) || photos[0] || null;

  const measureRenderedImageBox = useCallback(() => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img) return;
    const stageRect = stage.getBoundingClientRect();
    if (stageRect.width <= 0 || stageRect.height <= 0) return;

    const natW = img.naturalWidth || stageRect.width;
    const natH = img.naturalHeight || stageRect.height;
    const imgRatio = natW / Math.max(1, natH);
    const boxRatio = stageRect.width / Math.max(1, stageRect.height);

    let renderW = stageRect.width;
    let renderH = stageRect.height;
    let offsetLeft = 0;
    let offsetTop = 0;

    if (imgRatio > boxRatio) {
      renderW = stageRect.width;
      renderH = stageRect.width / imgRatio;
      offsetTop = (stageRect.height - renderH) * 0.5;
    } else {
      renderH = stageRect.height;
      renderW = stageRect.height * imgRatio;
      offsetLeft = (stageRect.width - renderW) * 0.5;
    }

    setImgBox({
      left: offsetLeft,
      top: offsetTop,
      width: Math.max(1, renderW),
      height: Math.max(1, renderH),
    });
  }, []);

  useEffect(() => {
    measureRenderedImageBox();
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measureRenderedImageBox());
    ro.observe(stage);
    return () => ro.disconnect();
  }, [activePhoto?.id, measureRenderedImageBox]);

  const pointerToImageNorm = (
    clientX: number,
    clientY: number,
    shiftKey: boolean,
    anchorForSnap: NormPt | null,
  ): NormPt | null => {
    const stage = stageRef.current;
    if (!stage || imgBox.width <= 0 || imgBox.height <= 0) return null;
    const stageRect = stage.getBoundingClientRect();
    const raw: NormPt = {
      x: clamp01((clientX - stageRect.left - imgBox.left) / imgBox.width),
      y: clamp01((clientY - stageRect.top - imgBox.top) / imgBox.height),
    };
    const aspect = imgBox.width / Math.max(1, imgBox.height);
    return anchorForSnap ? snapNormalizedPoint(anchorForSnap, raw, aspect, shiftKey) : raw;
  };

  const handleGenerateAvatarReplica = async () => {
    if (!tab || !isBiomechanicalVisualMethod(tab.method)) return;
    setIsGeneratingAvatar(true);
    try {
      const generated = await renderMethodAvatarStudyPhotos(tab);
      if (generated.length > 0) {
        const realOperatorPhotos = photos.filter((p) => !isAvatarReplicaPhoto(p));
        const nextPhotos = [...realOperatorPhotos, ...generated];
        onChange(nextPhotos);
        setActivePhotoId(generated[0].id);
      }
    } finally {
      setIsGeneratingAvatar(false);
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const newPhoto: StudyPhoto = {
          id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          dataUrl,
          annotatedDataUrl: dataUrl,
          caption: `Postura relevada (${file.name.replace(/\.[^.]+$/, '')})`,
          annotations: [],
        };
        onChange([...photos, newPhoto]);
        setActivePhotoId(newPhoto.id);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const commitAnnotations = async (photo: StudyPhoto, nextAnns: AngleAnnotation[]) => {
    const annotatedDataUrl = await renderAnnotatedImage(photo.dataUrl, nextAnns);
    onChange(
      photos.map((p) =>
        p.id === photo.id ? { ...p, annotations: nextAnns, annotatedDataUrl } : p,
      ),
    );
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!goniometerActive || !activePhoto) return;

    if (draggingHandle) {
      const targetAnn = activePhoto.annotations.find((a) => a.id === draggingHandle.annId);
      if (!targetAnn) return;
      const snapAnchor =
        draggingHandle.part === 'p1' || draggingHandle.part === 'p2' ? targetAnn.vertex : null;
      const pt = pointerToImageNorm(e.clientX, e.clientY, e.shiftKey, snapAnchor);
      if (!pt) return;

      const aspect = imgBox.width / Math.max(1, imgBox.height);
      const updatedAnns = activePhoto.annotations.map((ann) => {
        if (ann.id !== draggingHandle.annId) return ann;
        const nextP1 = draggingHandle.part === 'p1' ? pt : ann.p1;
        const nextV = draggingHandle.part === 'vertex' ? pt : ann.vertex;
        const nextP2 = draggingHandle.part === 'p2' ? pt : ann.p2;
        return {
          ...ann,
          p1: nextP1,
          vertex: nextV,
          p2: nextP2,
          degrees: Math.round(calculateAngleDegrees(nextP1, nextV, nextP2, aspect)),
        };
      });

      onChange(
        photos.map((p) => (p.id === activePhoto.id ? { ...p, annotations: updatedAnns } : p)),
      );
      return;
    }

    const snapAnchor =
      draftPoints.length === 1
        ? draftPoints[0]
        : draftPoints.length === 2
          ? draftPoints[1]
          : null;
    const pt = pointerToImageNorm(e.clientX, e.clientY, e.shiftKey, snapAnchor);
    setHoverPoint(pt);
  };

  const handleStagePointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingHandle && activePhoto) {
      setDraggingHandle(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignorar
      }
      await commitAnnotations(activePhoto, activePhoto.annotations);
    }
  };

  const handleStageClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!goniometerActive || !activePhoto || draggingHandle) return;
    const snapAnchor =
      draftPoints.length === 1
        ? draftPoints[0]
        : draftPoints.length === 2
          ? draftPoints[1]
          : null;
    const pt = pointerToImageNorm(e.clientX, e.clientY, e.shiftKey, snapAnchor);
    if (!pt) return;

    const nextPts = [...draftPoints, pt];
    if (nextPts.length < 3) {
      setDraftPoints(nextPts);
      return;
    }

    const aspectRatio = imgBox.width / Math.max(1, imgBox.height);
    const degrees = Math.round(calculateAngleDegrees(nextPts[0], nextPts[1], nextPts[2], aspectRatio));
    const newAnn: AngleAnnotation = {
      id: `ann-${Date.now()}`,
      label: segmentLabel || 'Ángulo',
      p1: nextPts[0],
      vertex: nextPts[1],
      p2: nextPts[2],
      degrees,
    };

    const nextAnns = [...activePhoto.annotations, newAnn];
    setDraftPoints([]);
    setHoverPoint(null);
    await commitAnnotations(activePhoto, nextAnns);
  };

  const handleClearLastAngle = async () => {
    if (draftPoints.length > 0) {
      setDraftPoints((prev) => prev.slice(0, -1));
      return;
    }
    if (!activePhoto || activePhoto.annotations.length === 0) return;
    const nextAnns = activePhoto.annotations.slice(0, -1);
    await commitAnnotations(activePhoto, nextAnns);
  };

  const handleDeleteSingleAnnotation = async (annId: string) => {
    if (!activePhoto) return;
    const nextAnns = activePhoto.annotations.filter((a) => a.id !== annId);
    await commitAnnotations(activePhoto, nextAnns);
  };

  const handleRemovePhoto = (id: string) => {
    const filtered = photos.filter((p) => p.id !== id);
    onChange(filtered);
    if (activePhotoId === id) {
      setActivePhotoId(filtered[0]?.id ?? null);
    }
  };

  const toStagePx = (pt: NormPt): NormPt => ({
    x: imgBox.left + pt.x * imgBox.width,
    y: imgBox.top + pt.y * imgBox.height,
  });

  const aspect = imgBox.width / Math.max(1, imgBox.height);
  const liveDraftDeg =
    draftPoints.length === 2 && hoverPoint
      ? calculateAngleDegrees(draftPoints[0], draftPoints[1], hoverPoint, aspect)
      : null;

  return (
    <div className="p-5 rounded-lg border border-slate-200 bg-white space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            Registro Fotográfico del Puesto y Goniómetro Digital de Rectas
          </h4>
          <p className="text-xs text-slate-500">
            Trace rectas de alta precisión marcando 3 puntos (Extremo 1 → Vértice → Extremo 2), mantenga{' '}
            <strong className="font-semibold text-slate-700">Shift</strong> para plomada 0°/90°/45° o arrastre cualquier punto ya trazado.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            Cargar Foto Operario
          </button>
          {tab && isBiomechanicalVisualMethod(tab.method) && (
            <button
              type="button"
              disabled={isGeneratingAvatar}
              onClick={() => void handleGenerateAvatarReplica()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-50 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Genera e inserta la réplica del Avatar 3D con los ángulos exactos cargados en este método para el informe"
            >
              <Box className="w-3.5 h-3.5" />
              {isGeneratingAvatar ? 'Generando 3D...' : 'Generar Réplica Avatar 3D'}
            </button>
          )}
          {activePhoto && (
            <button
              type="button"
              onClick={() => {
                setGoniometerActive(!goniometerActive);
                setDraftPoints([]);
                setHoverPoint(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                goniometerActive
                  ? 'bg-sky-600 text-white'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              {goniometerActive ? 'Tramo de Rectas Activo' : 'Trazar Rectas y Medir'}
            </button>
          )}
        </div>
      </div>

      {!activePhoto ? (
        <div className="flex flex-col items-center justify-center py-7 px-4 rounded-lg border border-dashed border-slate-300 bg-slate-50/70 text-center">
          <Camera className="w-6 h-6 text-slate-400 mb-2" />
          <p className="text-xs font-medium text-slate-700">
            Sin fotografías adjuntas en esta pestaña
          </p>
          <p className="text-xs text-slate-500 mt-0.5 max-w-md">
            Las imágenes cargadas y sus trazos goniométricos se incorporan automáticamente al exportar el informe en PDF y Word.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {goniometerActive && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 rounded-md bg-sky-50 border border-sky-200 text-xs text-sky-950">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">
                  Paso {draftPoints.length + 1} de 3:
                </span>
                <span>
                  {draftPoints.length === 0
                    ? 'Clic en Extremo 1 de la primera recta (o arrastre vértices existentes)'
                    : draftPoints.length === 1
                      ? 'Clic en el Vértice articular (Shift = bloquear plomada 0°/90°)'
                      : 'Mueva la segunda recta y haga clic en Extremo 2 para fijar el ángulo'}
                </span>
                {liveDraftDeg !== null && (
                  <span className="font-mono font-bold tabular-nums text-sky-900 bg-white px-2 py-0.5 rounded border border-sky-300">
                    Interno {liveDraftDeg.toFixed(1)}° · Supl. {(180 - liveDraftDeg).toFixed(1)}°
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={segmentLabel}
                  onChange={(e) => setSegmentLabel(e.target.value)}
                  placeholder="Etiqueta (ej. Brazo)"
                  className="px-2 py-1 text-xs bg-white border border-sky-200 rounded w-36"
                />
                <button
                  type="button"
                  onClick={() => void handleClearLastAngle()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3 h-3" /> Deshacer
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            <div
              ref={stageRef}
              onClick={(e) => void handleStageClick(e)}
              onPointerMove={handleStagePointerMove}
              onPointerUp={(e) => void handleStagePointerUp(e)}
              onPointerLeave={() => {
                if (!draggingHandle) setHoverPoint(null);
              }}
              className={`lg:col-span-2 relative rounded-lg overflow-hidden border border-slate-200 bg-slate-950 select-none touch-none ${
                goniometerActive ? 'cursor-crosshair' : ''
              }`}
            >
              <img
                ref={imgRef}
                src={
                  goniometerActive
                    ? activePhoto.dataUrl
                    : activePhoto.annotatedDataUrl || activePhoto.dataUrl
                }
                onLoad={measureRenderedImageBox}
                alt={activePhoto.caption}
                referrerPolicy="no-referrer"
                draggable={false}
                className="w-full max-h-[440px] object-contain mx-auto block pointer-events-none"
              />

              {goniometerActive && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                  {/* Anotaciones confirmadas con vértices arrastrables en vivo */}
                  {activePhoto.annotations.map((ann) => {
                    const p1Px = toStagePx(ann.p1);
                    const vPx = toStagePx(ann.vertex);
                    const p2Px = toStagePx(ann.p2);
                    const { sectorPath, arcPath } = buildSvgArcSector(p1Px, vPx, p2Px);

                    return (
                      <g key={ann.id}>
                        {sectorPath && <path d={sectorPath} fill="rgba(56, 189, 248, 0.24)" />}
                        {arcPath && (
                          <path d={arcPath} fill="none" stroke="#38bdf8" strokeWidth="2.4" />
                        )}
                        <polyline
                          points={`${p1Px.x},${p1Px.y} ${vPx.x},${vPx.y} ${p2Px.x},${p2Px.y}`}
                          fill="none"
                          stroke="rgba(15, 23, 42, 0.92)"
                          strokeWidth="6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <polyline
                          points={`${p1Px.x},${p1Px.y} ${vPx.x},${vPx.y} ${p2Px.x},${p2Px.y}`}
                          fill="none"
                          stroke="#facc15"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />

                        <g transform={`translate(${vPx.x + 12}, ${Math.max(22, vPx.y - 12)})`}>
                          <rect
                            x="0"
                            y="-16"
                            width={Math.max(58, (ann.label.length + 6) * 7.4)}
                            height="22"
                            rx="4"
                            fill="rgba(15, 23, 42, 0.92)"
                            stroke="#facc15"
                            strokeWidth="1.2"
                          />
                          <text
                            x="6"
                            y="-1"
                            fill="#fef08a"
                            fontSize="11.5"
                            fontWeight="700"
                            fontFamily="ui-monospace, SFMono-Regular, monospace"
                          >
                            {ann.label}: {ann.degrees}°
                          </text>
                        </g>

                        {(
                          [
                            ['p1', p1Px, '#facc15'],
                            ['vertex', vPx, '#38bdf8'],
                            ['p2', p2Px, '#facc15'],
                          ] as const
                        ).map(([partKey, ptPx, fillCol]) => (
                          <g
                            key={partKey}
                            transform={`translate(${ptPx.x}, ${ptPx.y})`}
                            onPointerDown={(ev) => {
                              ev.stopPropagation();
                              setDraftPoints([]);
                              setDraggingHandle({ annId: ann.id, part: partKey });
                              try {
                                stageRef.current?.setPointerCapture(ev.pointerId);
                              } catch {
                                // Ignorar
                              }
                            }}
                            className="pointer-events-auto cursor-grab active:cursor-grabbing"
                          >
                            <circle r="14" fill="transparent" />
                            <circle
                              r={partKey === 'vertex' ? 6.5 : 5.5}
                              fill={fillCol}
                              stroke="#0f172a"
                              strokeWidth="2"
                            />
                          </g>
                        ))}
                      </g>
                    );
                  })}

                  {/* Trazo elástico en vivo mientras se colocan los 3 puntos */}
                  {draftPoints.length === 1 && hoverPoint && (() => {
                    const a = toStagePx(draftPoints[0]);
                    const b = toStagePx(hoverPoint);
                    return (
                      <g>
                        <line
                          x1={a.x}
                          y1={a.y}
                          x2={b.x}
                          y2={b.y}
                          stroke="rgba(15, 23, 42, 0.9)"
                          strokeWidth="5.5"
                          strokeLinecap="round"
                        />
                        <line
                          x1={a.x}
                          y1={a.y}
                          x2={b.x}
                          y2={b.y}
                          stroke="#38bdf8"
                          strokeWidth="2.8"
                          strokeDasharray="7 4"
                          strokeLinecap="round"
                        />
                      </g>
                    );
                  })()}

                  {draftPoints.length === 2 && (() => {
                    const p1Px = toStagePx(draftPoints[0]);
                    const vPx = toStagePx(draftPoints[1]);
                    const p2Px = hoverPoint ? toStagePx(hoverPoint) : null;
                    const sector = p2Px ? buildSvgArcSector(p1Px, vPx, p2Px) : null;

                    return (
                      <g>
                        {sector?.sectorPath && (
                          <path d={sector.sectorPath} fill="rgba(250, 204, 21, 0.25)" />
                        )}
                        {sector?.arcPath && (
                          <path d={sector.arcPath} fill="none" stroke="#facc15" strokeWidth="2.5" />
                        )}
                        <line
                          x1={p1Px.x}
                          y1={p1Px.y}
                          x2={vPx.x}
                          y2={vPx.y}
                          stroke="rgba(15, 23, 42, 0.92)"
                          strokeWidth="6"
                          strokeLinecap="round"
                        />
                        <line
                          x1={p1Px.x}
                          y1={p1Px.y}
                          x2={vPx.x}
                          y2={vPx.y}
                          stroke="#facc15"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                        {p2Px && (
                          <>
                            <line
                              x1={vPx.x}
                              y1={vPx.y}
                              x2={p2Px.x}
                              y2={p2Px.y}
                              stroke="rgba(15, 23, 42, 0.92)"
                              strokeWidth="5.5"
                              strokeLinecap="round"
                            />
                            <line
                              x1={vPx.x}
                              y1={vPx.y}
                              x2={p2Px.x}
                              y2={p2Px.y}
                              stroke="#38bdf8"
                              strokeWidth="2.8"
                              strokeLinecap="round"
                            />
                          </>
                        )}
                      </g>
                    );
                  })()}

                  {draftPoints.map((pt, idx) => {
                    const px = toStagePx(pt);
                    return (
                      <circle
                        key={idx}
                        cx={px.x}
                        cy={px.y}
                        r={idx === 1 ? 6.5 : 5.5}
                        fill={idx === 1 ? '#38bdf8' : '#facc15'}
                        stroke="#0f172a"
                        strokeWidth="2"
                      />
                    );
                  })}
                </svg>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Epígrafe de la fotografía para el informe
                </label>
                <input
                  type="text"
                  value={activePhoto.caption}
                  onChange={(e) =>
                    onChange(
                      photos.map((p) =>
                        p.id === activePhoto.id ? { ...p, caption: e.target.value } : p,
                      ),
                    )
                  }
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
                />
              </div>

              {activePhoto.annotations.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-800">
                    Rectas y ángulos medidos ({activePhoto.annotations.length})
                  </span>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-md bg-slate-50">
                    {activePhoto.annotations.map((ann) => (
                      <div
                        key={ann.id}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs"
                      >
                        <span className="text-slate-700 truncate">{ann.label}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono font-semibold tabular-nums text-slate-900">
                            {ann.degrees}°{' '}
                            <span className="text-slate-400 font-normal">
                              (supl. {Math.max(0, 180 - ann.degrees)}°)
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleDeleteSingleAnnotation(ann.id)}
                            className="p-0.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                            title="Eliminar este ángulo"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {photos.length > 1 && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">Fotografías en esta pestaña</span>
                  <div className="flex flex-wrap gap-1.5">
                    {photos.map((ph, idx) => (
                      <button
                        key={ph.id}
                        type="button"
                        onClick={() => {
                          setActivePhotoId(ph.id);
                          setDraftPoints([]);
                          setHoverPoint(null);
                        }}
                        className={`px-2.5 py-1 text-xs rounded border cursor-pointer ${
                          ph.id === activePhoto.id
                            ? 'border-sky-600 bg-sky-50 text-sky-900 font-semibold'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        Foto #{idx + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => handleRemovePhoto(activePhoto.id)}
                className="inline-flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 font-medium cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Quitar esta fotografía
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


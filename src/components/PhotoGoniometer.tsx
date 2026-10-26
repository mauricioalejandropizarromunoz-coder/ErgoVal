import React, { useRef, useState } from 'react';
import { Camera, Compass, RotateCcw, Trash2, Upload } from 'lucide-react';
import { AngleAnnotation, StudyPhoto } from '../types/ergonomics';

interface PhotoGoniometerProps {
  photos: StudyPhoto[];
  onChange: (photos: StudyPhoto[]) => void;
}

function calculateAngleDegrees(
  p1: { x: number; y: number },
  vertex: { x: number; y: number },
  p2: { x: number; y: number },
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
  return Math.round((Math.acos(cos) * 180) / Math.PI);
}

async function renderAnnotatedImage(dataUrl: string, annotations: AngleAnnotation[]): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxDim = 1000;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const placedTagRects: Array<{ x: number; y: number; w: number; h: number }> = [];

      annotations.forEach((ann) => {
        const x1 = ann.p1.x * canvas.width;
        const y1 = ann.p1.y * canvas.height;
        const vx = ann.vertex.x * canvas.width;
        const vy = ann.vertex.y * canvas.height;
        const x2 = ann.p2.x * canvas.width;
        const y2 = ann.p2.y * canvas.height;

        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = Math.max(2.5, canvas.width * 0.004);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(vx, vy);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        [
          [x1, y1],
          [vx, vy],
          [x2, y2],
        ].forEach(([px, py], idx) => {
          ctx.fillStyle = idx === 1 ? '#0284c7' : '#facc15';
          ctx.beginPath();
          ctx.arc(px, py, Math.max(4, canvas.width * 0.006), 0, Math.PI * 2);
          ctx.fill();
        });

        const tag = `${ann.label ? `${ann.label}: ` : ''}${ann.degrees}°`;
        const fontSize = Math.max(12, Math.round(canvas.width * 0.02));
        ctx.font = `bold ${fontSize}px monospace`;
        const textWidth = ctx.measureText(tag).width;
        const boxW = textWidth + 12;
        const boxH = fontSize + 8;

        const offsets = [
          [14, -(boxH + 8)],
          [14, 14],
          [-(boxW + 14), -(boxH + 8)],
          [-(boxW + 14), 14],
          [0, -(boxH + 34)],
          [0, 38],
        ];

        let chosenX = Math.min(canvas.width - boxW - 6, Math.max(6, vx + 14));
        let chosenY = Math.min(canvas.height - boxH - 6, Math.max(6, vy - boxH - 8));

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

        ctx.strokeStyle = '#854d0e';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(vx, vy);
        ctx.lineTo(chosenX + boxW / 2, chosenY + boxH / 2);
        ctx.stroke();

        ctx.fillStyle = '#fef08a';
        ctx.fillRect(chosenX, chosenY, boxW, boxH);
        ctx.strokeStyle = '#854d0e';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(chosenX, chosenY, boxW, boxH);

        ctx.fillStyle = '#0f172a';
        ctx.textBaseline = 'middle';
        ctx.fillText(tag, chosenX + 6, chosenY + boxH / 2 + 0.5);
      });

      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function PhotoGoniometer({ photos, onChange }: PhotoGoniometerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(photos[0]?.id ?? null);
  const [goniometerActive, setGoniometerActive] = useState(false);
  const [draftPoints, setDraftPoints] = useState<{ x: number; y: number }[]>([]);
  const [segmentLabel, setSegmentLabel] = useState('Tronco / Brazo');

  const activePhoto = photos.find((p) => p.id === activePhotoId) || photos[0] || null;

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

  const handleImageClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!goniometerActive || !activePhoto) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const nextPts = [...draftPoints, { x, y }];

    if (nextPts.length < 3) {
      setDraftPoints(nextPts);
      return;
    }

    const aspectRatio = rect.width / Math.max(1, rect.height);
    const degrees = calculateAngleDegrees(nextPts[0], nextPts[1], nextPts[2], aspectRatio);
    const newAnn: AngleAnnotation = {
      id: `ann-${Date.now()}`,
      label: segmentLabel || 'Ángulo',
      p1: nextPts[0],
      vertex: nextPts[1],
      p2: nextPts[2],
      degrees,
    };

    const nextAnns = [...activePhoto.annotations, newAnn];
    const annotatedDataUrl = await renderAnnotatedImage(activePhoto.dataUrl, nextAnns);

    onChange(
      photos.map((p) =>
        p.id === activePhoto.id ? { ...p, annotations: nextAnns, annotatedDataUrl } : p,
      ),
    );
    setDraftPoints([]);
  };

  const handleClearLastAngle = async () => {
    if (!activePhoto || activePhoto.annotations.length === 0) {
      setDraftPoints([]);
      return;
    }
    const nextAnns = activePhoto.annotations.slice(0, -1);
    const annotatedDataUrl = await renderAnnotatedImage(activePhoto.dataUrl, nextAnns);
    onChange(
      photos.map((p) =>
        p.id === activePhoto.id ? { ...p, annotations: nextAnns, annotatedDataUrl } : p,
      ),
    );
  };

  const handleRemovePhoto = (id: string) => {
    const filtered = photos.filter((p) => p.id !== id);
    onChange(filtered);
    if (activePhotoId === id) {
      setActivePhotoId(filtered[0]?.id ?? null);
    }
  };

  return (
    <div className="p-5 rounded-lg border border-slate-200 bg-white space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            Registro Fotográfico del Puesto y Goniómetro Digital
          </h4>
          <p className="text-xs text-slate-500">
            Cargue fotografías en verdadera magnitud (plano sagital) y mida ángulos marcando 3 puntos (Extremo 1 → Vértice → Extremo 2).
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
            Cargar Fotografía
          </button>
          {activePhoto && (
            <button
              type="button"
              onClick={() => {
                setGoniometerActive(!goniometerActive);
                setDraftPoints([]);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                goniometerActive
                  ? 'bg-sky-600 text-white'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              {goniometerActive ? 'Goniómetro Activo' : 'Medir Ángulos en Foto'}
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
            Las imágenes cargadas y sus mediciones angulares se incorporarán automáticamente al exportar el informe en PDF y Word.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {goniometerActive && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 rounded-md bg-sky-50 border border-sky-200 text-xs text-sky-950">
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  Paso {draftPoints.length + 1} de 3:
                </span>
                <span>
                  {draftPoints.length === 0
                    ? 'Haga clic en el primer extremo del segmento'
                    : draftPoints.length === 1
                      ? 'Haga clic en el vértice articular (hombro, codo, cadera, rodilla)'
                      : 'Haga clic en el segundo extremo para obtener el ángulo'}
                </span>
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
                  onClick={handleClearLastAngle}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Deshacer
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            <div
              onClick={handleImageClick}
              className={`lg:col-span-2 relative rounded-lg overflow-hidden border border-slate-200 bg-slate-900 select-none ${
                goniometerActive ? 'cursor-crosshair' : ''
              }`}
            >
              <img
                src={activePhoto.annotatedDataUrl || activePhoto.dataUrl}
                alt={activePhoto.caption}
                referrerPolicy="no-referrer"
                className="w-full max-h-96 object-contain mx-auto block"
              />
              {goniometerActive && draftPoints.length > 0 && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                  {draftPoints.map((pt, idx) => (
                    <circle
                      key={idx}
                      cx={`${pt.x * 100}%`}
                      cy={`${pt.y * 100}%`}
                      r="5"
                      fill={idx === 1 ? '#0284c7' : '#facc15'}
                      stroke="#0f172a"
                      strokeWidth="1.5"
                    />
                  ))}
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
                    Ángulos medidos ({activePhoto.annotations.length})
                  </span>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-md bg-slate-50">
                    {activePhoto.annotations.map((ann) => (
                      <div key={ann.id} className="flex items-center justify-between px-2.5 py-1.5 text-xs">
                        <span className="text-slate-700">{ann.label}</span>
                        <span className="font-mono font-semibold tabular-nums text-slate-900">
                          {ann.degrees}°
                        </span>
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
                        onClick={() => setActivePhotoId(ph.id)}
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  BookOpen,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Copy,
  Download,
  Eye,
  FileCheck2,
  FileJson,
  Flame,
  Globe,
  Grid,
  Image as ImageIcon,
  Layers,
  Maximize2,
  Mountain,
  Move3d,
  Plus,
  RefreshCw,
  RotateCcw,
  Sliders,
  Sparkles,
  Sun,
  Wind,
  Zap,
  ZoomIn,
} from 'lucide-react';
import { MethodId, StudyTab } from '../types/ergonomics';
import { createNewStudyTab } from '../utils/defaults';
import {
  CosmologicalElement,
  MagneticPolarity,
  RITUAL_POSTURES_CATALOG,
  RitualPostureItem,
} from '../utils/ritualPosturesCatalog';
import {
  ensureAvatarGlbLoaded,
  renderInteractivePose3DToCanvas,
  subscribeAvatarGlbLoaded,
} from '../utils/biomech3dRenderer';
import { exportCanvasToHighQualityPng } from '../utils/pngOptimizer';

interface RitualPosturesBiomechWorkspaceProps {
  onBackToEvaluator: () => void;
  onAddPoseTabToStudy: (newTab: StudyTab) => void;
}

type ViewportRenderMode =
  | 'kdp_editorial_b_w' // Ficha completa KDP 6x9 vertical con dibujo contorno + 3D + ángulos + RULA/REBA + Goodman
  | 'split_50_50' // Lámina panorámica 50/50 horizontal (Estatua contorno izquierdo + Avatar 3D derecho)
  | 'book_page_source'; // Visualización de la página original del PDF

type ExportResolution = 1 | 2 | 4;

export const RitualPosturesBiomechWorkspace: React.FC<RitualPosturesBiomechWorkspaceProps> = ({
  onBackToEvaluator,
  onAddPoseTabToStudy,
}) => {
  // Postura activa seleccionada del catálogo
  const [selectedPostureId, setSelectedPostureId] = useState<string>('olmec_baby');
  const activePosture = useMemo(() => {
    return (
      RITUAL_POSTURES_CATALOG.find((p) => p.id === selectedPostureId) ||
      RITUAL_POSTURES_CATALOG[0]
    );
  }, [selectedPostureId]);

  // Modo de renderizado visual
  const [renderMode, setRenderMode] = useState<ViewportRenderMode>('split_50_50');
  const [exportResolution, setExportResolution] = useState<ExportResolution>(2);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState<boolean>(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Opciones de visualización técnica
  const [showAngleVectors, setShowAngleVectors] = useState<boolean>(true);
  const [showAngleBadges, setShowAngleBadges] = useState<boolean>(true);
  const [showTechnicalGrid, setShowTechnicalGrid] = useState<boolean>(true);

  // Imagen personalizada subida por el usuario
  const [customStatueImage, setCustomStatueImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Referencias a los canvas e imágenes cacheadas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cachedOutlineImgRef = useRef<HTMLImageElement | null>(null);
  const cached3dImgRef = useRef<HTMLImageElement | null>(null);

  // Estado del motor 3D GLB
  const [glbReady, setGlbReady] = useState<boolean>(false);
  useEffect(() => {
    ensureAvatarGlbLoaded();
    const unsub = subscribeAvatarGlbLoaded(() => {
      setGlbReady(true);
    });
    return unsub;
  }, []);

  // Ángulos calibrables interactivos
  const [angles, setAngles] = useState(activePosture.defaultAngles);

  useEffect(() => {
    setAngles(activePosture.defaultAngles);
  }, [activePosture]);

  // Precargar imagen de contorno limpio (Lado Izquierdo) y render 3D (Lado Derecho)
  useEffect(() => {
    let active = true;

    // 1. Imagen de contorno izquierda
    const targetOutlineUrl =
      customStatueImage ||
      activePosture.outlineImageUrl ||
      activePosture.referenceImageUrl;

    const outlineImg = new Image();
    outlineImg.crossOrigin = 'anonymous';
    outlineImg.onload = () => {
      if (!active) return;
      cachedOutlineImgRef.current = outlineImg;
      renderEditorialKdpCanvas();
    };
    outlineImg.onerror = () => {
      if (!active) return;
      cachedOutlineImgRef.current = null;
      renderEditorialKdpCanvas();
    };
    outlineImg.src = targetOutlineUrl;

    // 2. Imagen de render 3D derecha (si existe pre-renderizada como en olmec_baby)
    if (activePosture.render3dImageUrl) {
      const render3dImg = new Image();
      render3dImg.crossOrigin = 'anonymous';
      render3dImg.onload = () => {
        if (!active) return;
        cached3dImgRef.current = render3dImg;
        renderEditorialKdpCanvas();
      };
      render3dImg.onerror = () => {
        if (!active) return;
        cached3dImgRef.current = null;
        renderEditorialKdpCanvas();
      };
      render3dImg.src = activePosture.render3dImageUrl;
    } else {
      cached3dImgRef.current = null;
      renderEditorialKdpCanvas();
    }

    return () => {
      active = false;
    };
  }, [activePosture, customStatueImage]);

  // Cargar imagen de estatua desde el PC
  const handleUploadCustomStatue = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomStatueImage(reader.result);
        setExportNotice('Nueva estatua/figura cargada para cotejo 1:1.');
        setTimeout(() => setExportNotice(null), 3500);
      }
    };
    reader.readAsDataURL(file);
  };

  // --------------------------------------------------------------------------
  // DIBUJO DE LA LÁMINA: DIBUJO DE CONTORNO LIMPIO + AVATAR 3D + MEDIDOR DE ÁNGULOS
  // --------------------------------------------------------------------------
  const renderEditorialKdpCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isVerticalKdp = renderMode === 'kdp_editorial_b_w';
    const isBookPageMode = renderMode === 'book_page_source';

    // Dimensiones en proporción exacta
    const W = isVerticalKdp ? 1800 : 1600;
    const H = isVerticalKdp ? 2400 : 900;
    canvas.width = W;
    canvas.height = H;

    // Fondo blanco puro #FFFFFF absoluto (norma editorial KDP)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    if (isBookPageMode) {
      // Modo visor de página fuente original del PDF
      const pageImg = cachedOutlineImgRef.current;
      if (pageImg) {
        ctx.drawImage(pageImg, 50, 40, W - 100, H - 80);
      }
      return;
    }

    if (isVerticalKdp) {
      // ----------------------------------------------------------------------
      // MAQUETA VERTICAL KDP 6×9 PULGADAS (FICHA EDITORIAL COMPLETA)
      // ----------------------------------------------------------------------
      const margin = 70;
      const contentW = W - margin * 2;

      // Filete perimetral editorial KDP
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(margin, margin, contentW, H - margin * 2);

      // Filete secundario interior fino
      ctx.lineWidth = 1;
      ctx.strokeRect(margin + 6, margin + 6, contentW - 12, H - margin * 2 - 12);

      // CABECERA EDITORIAL
      const headerTop = margin + 20;
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 22px "Courier New", monospace';
      ctx.fillText(`ERGOEVAL · FICHA TÉCNICA BIOMECÁNICA & TRANCE RITUAL`, margin + 25, headerTop + 24);

      ctx.font = 'bold 36px "Helvetica Neue", Helvetica, Arial, sans-serif';
      ctx.fillText(`${activePosture.name.toUpperCase()}`, margin + 25, headerTop + 68);

      ctx.font = 'italic 18px "Georgia", serif';
      ctx.fillStyle = '#475569';
      ctx.fillText(
        `«${activePosture.englishName}» · Pág. ${activePosture.bookPage} · ${activePosture.culturalOrigin}`,
        margin + 25,
        headerTop + 96,
      );

      // BADGES EN CABECERA: ELEMENTO COSMOLÓGICO & POLARIDAD MAGNÉTICA
      const badgeX = W - margin - 380;
      const badgeY = headerTop + 14;

      // Caja Elemento Cosmológico
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(badgeX, badgeY, 175, 42);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(badgeX, badgeY, 175, 42);

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 12px "Helvetica Neue", sans-serif';
      ctx.fillText('ELEMENTO:', badgeX + 12, badgeY + 18);
      ctx.font = 'bold 15px "Helvetica Neue", sans-serif';
      ctx.fillText(activePosture.cosmologicalElement.toUpperCase(), badgeX + 12, badgeY + 35);

      // Caja Polaridad Magnética
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(badgeX + 185, badgeY, 175, 42);
      ctx.strokeRect(badgeX + 185, badgeY, 175, 42);

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 12px "Helvetica Neue", sans-serif';
      ctx.fillText('POLARIDAD:', badgeX + 197, badgeY + 18);
      ctx.font = 'bold 13px "Helvetica Neue", sans-serif';
      ctx.fillText(
        activePosture.magneticPolarity.includes('Activa') ? 'ACTIVA (+)' : 'RECEPTIVA (-)',
        badgeX + 197,
        badgeY + 35,
      );

      // Línea divisoria de cabecera
      ctx.beginPath();
      ctx.moveTo(margin + 6, headerTop + 118);
      ctx.lineTo(W - margin - 6, headerTop + 118);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.stroke();

      // ZONA COMPARATIVA 50/50
      const stageTop = headerTop + 130;
      const stageH = 1120;
      const halfW = (contentW - 12) / 2;

      // 1. PANEL IZQUIERDO: DIBUJO DE CONTORNO VECTORIAL LIMPIO
      const leftX = margin + 6;
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.strokeRect(leftX, stageTop, halfW, stageH);

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 15px "Courier New", monospace';
      ctx.fillText('LADO IZQUIERDO · ESCULTURA ORIGINAL (CONTORNO 90°)', leftX + 18, stageTop + 28);

      const outlineImg = cachedOutlineImgRef.current;
      if (outlineImg && outlineImg.naturalWidth > 0) {
        const destX = leftX + 25;
        const destY = stageTop + 50;
        const destW = halfW - 50;
        const destH = stageH - 70;

        const imgAspect = outlineImg.naturalWidth / outlineImg.naturalHeight;
        const boxAspect = destW / destH;
        let drawW = destW;
        let drawH = destH;
        let drawX = destX;
        let drawY = destY;

        if (imgAspect > boxAspect) {
          drawH = destW / imgAspect;
          drawY = destY + (destH - drawH) / 2;
        } else {
          drawW = destH * imgAspect;
          drawX = destX + (destW - drawW) / 2;
        }

        ctx.save();
        ctx.drawImage(outlineImg, drawX, drawY, drawW, drawH);
        ctx.restore();

        // Malla de alineación horizontal 1:1
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        const crownY = drawY + drawH * 0.12;
        ctx.beginPath();
        ctx.moveTo(leftX, crownY);
        ctx.lineTo(leftX + halfW * 2, crownY);
        ctx.stroke();

        const baseIsquialY = drawY + drawH * 0.92;
        ctx.beginPath();
        ctx.moveTo(leftX, baseIsquialY);
        ctx.lineTo(leftX + halfW * 2, baseIsquialY);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 2. PANEL DERECHO: AVATAR 3D REAL CON MEDIDOR DE ÁNGULOS
      const rightX = leftX + halfW;
      ctx.strokeRect(rightX, stageTop, halfW, stageH);

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 15px "Courier New", monospace';
      ctx.fillText('LADO DERECHO · AVATAR 3D 1:1 CON MEDIDOR DE ÁNGULOS', rightX + 18, stageTop + 28);

      const destX = rightX + 25;
      const destY = stageTop + 50;
      const destW = halfW - 50;
      const destH = stageH - 70;

      // Dibujar Avatar 3D (Render 3D dedicado o Render con Three.js GLB)
      const cached3d = cached3dImgRef.current;
      if (cached3d && cached3d.naturalWidth > 0) {
        const imgAspect = cached3d.naturalWidth / cached3d.naturalHeight;
        const boxAspect = destW / destH;
        let drawW = destW;
        let drawH = destH;
        let drawX = destX;
        let drawY = destY;

        if (imgAspect > boxAspect) {
          drawH = destW / imgAspect;
          drawY = destY + (destH - drawH) / 2;
        } else {
          drawW = destH * imgAspect;
          drawX = destX + (destW - drawW) / 2;
        }

        ctx.save();
        ctx.drawImage(cached3d, drawX, drawY, drawW, drawH);
        ctx.restore();
      } else {
        // Renderizado del Avatar 3D en tiempo real con Three.js
        const offCanvas = document.createElement('canvas');
        renderInteractivePose3DToCanvas(
          {
            subTitle: activePosture.name,
            focusZone: 'full_body',
            cameraPreset: 'sagittal_left',
            pose: activePosture.pose3D,
            orbitOverride: activePosture.cameraPreset,
          },
          offCanvas,
          Math.round(destW),
          Math.round(destH),
          activePosture.cameraPreset,
          2,
          'anatomical_skin',
          true,
          true,
        );

        ctx.save();
        ctx.filter = 'grayscale(100%) contrast(125%)';
        ctx.drawImage(offCanvas, destX, destY, destW, destH);
        ctx.restore();
      }

      // CAPA DEL MEDIDOR DE ÁNGULOS (Vectores, Arcos y Cartelas Blancas)
      if (showAngleVectors || showAngleBadges) {
        activePosture.goniometryLabels.forEach((item) => {
          const jointCanvasX = rightX + (item.jointX / 100) * (halfW - 50);
          const jointCanvasY = stageTop + 60 + (item.jointY / 100) * (stageH - 120);

          const badgeX = jointCanvasX + item.calloutDx * 1.8;
          const badgeY = jointCanvasY + item.calloutDy * 1.5;

          // Nodo articular concéntrico
          ctx.save();
          ctx.fillStyle = '#000000';
          ctx.beginPath();
          ctx.arc(jointCanvasX, jointCanvasY, 6, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(jointCanvasX, jointCanvasY, 8, 0, Math.PI * 2);
          ctx.stroke();

          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(jointCanvasX, jointCanvasY, 11, 0, Math.PI * 2);
          ctx.stroke();

          // Línea directriz hacia zonas libres (Cero colisión)
          ctx.beginPath();
          ctx.moveTo(jointCanvasX, jointCanvasY);
          const elbowX = item.calloutDx > 0 ? badgeX - 20 : badgeX + 20;
          ctx.lineTo(elbowX, badgeY);
          ctx.lineTo(badgeX, badgeY);
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.restore();

          // Cartela blanca sólida con reborde negro nítido
          if (showAngleBadges) {
            ctx.save();
            const title = item.jointName;
            const val = item.angleValue;

            ctx.font = 'bold 15px "Helvetica Neue", sans-serif';
            const tW = ctx.measureText(title).width;
            ctx.font = 'bold 20px "Courier New", monospace';
            const vW = ctx.measureText(val).width;
            const bW = Math.max(tW, vW) + 32;
            const bH = 50;

            const bLeft = item.calloutDx > 0 ? badgeX : badgeX - bW;
            const bTop = badgeY - bH / 2;

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(bLeft, bTop, bW, bH);

            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2.5;
            ctx.strokeRect(bLeft, bTop, bW, bH);

            ctx.fillStyle = '#000000';
            ctx.font = 'bold 13px "Helvetica Neue", sans-serif';
            ctx.fillText(title, bLeft + 12, bTop + 20);

            ctx.fillStyle = '#000000';
            ctx.font = 'bold 20px "Courier New", monospace';
            ctx.fillText(val, bLeft + 12, bTop + 42);
            ctx.restore();
          }
        });
      }

      // TARJETAS RULA / REBA SIN CARGA (COMO EN LA FOTO image_9ed918f7.png)
      const ergoTop = stageTop + stageH + 18;
      const ergoH = 110;

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(margin + 6, ergoTop, contentW - 12, ergoH);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(margin + 6, ergoTop, contentW - 12, ergoH);

      const colW = (contentW - 12) / 3;

      // RULA SIN CARGA
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 14px "Helvetica Neue", sans-serif';
      ctx.fillText('MÉTODO RULA (SIN CARGA)', margin + 24, ergoTop + 28);
      ctx.font = 'bold 32px "Courier New", monospace';
      ctx.fillText(`${activePosture.rulaScoreSinCarga.score} / 7`, margin + 24, ergoTop + 68);
      ctx.font = '13px "Helvetica Neue", sans-serif';
      ctx.fillStyle = '#334155';
      ctx.fillText(activePosture.rulaScoreSinCarga.actionLevel, margin + 24, ergoTop + 92);

      // REBA SIN CARGA
      const col2X = margin + 6 + colW;
      ctx.beginPath();
      ctx.moveTo(col2X, ergoTop);
      ctx.lineTo(col2X, ergoTop + ergoH);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 14px "Helvetica Neue", sans-serif';
      ctx.fillText('MÉTODO REBA (ESTÁTICA)', col2X + 24, ergoTop + 28);
      ctx.font = 'bold 32px "Courier New", monospace';
      ctx.fillText(`${activePosture.rebaScoreSinCarga.score} / 15`, col2X + 24, ergoTop + 68);
      ctx.font = '13px "Helvetica Neue", sans-serif';
      ctx.fillStyle = '#334155';
      ctx.fillText(
        activePosture.rebaScoreSinCarga.actionLevel || activePosture.rebaScoreSinCarga.riskLevel,
        col2X + 24,
        ergoTop + 92,
      );

      // OWAS & CARGA EXTERNA
      const col3X = margin + 6 + colW * 2;
      ctx.beginPath();
      ctx.moveTo(col3X, ergoTop);
      ctx.lineTo(col3X, ergoTop + ergoH);
      ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 14px "Helvetica Neue", sans-serif';
      ctx.fillText('MÉTODO OWAS & CARGA MANUAL', col3X + 24, ergoTop + 28);
      ctx.font = 'bold 32px "Courier New", monospace';
      ctx.fillText(`Cat. ${activePosture.owasScoreSinCarga.category}`, col3X + 24, ergoTop + 68);
      ctx.font = '13px "Helvetica Neue", sans-serif';
      ctx.fillStyle = '#334155';
      ctx.fillText('Carga Externa: 0 kg (Postura Meditativa)', col3X + 24, ergoTop + 92);

      // FICHA TÉCNICA INFERIOR: RESUMEN GOODMAN & NAUWALD
      const descTop = ergoTop + ergoH + 18;
      const descH = H - margin - descTop - 18;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(margin + 6, descTop, contentW - 12, descH);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(margin + 6, descTop, contentW - 12, descH);

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 15px "Courier New", monospace';
      ctx.fillText(
        'INVESTIGACIÓN DE FELICITAS D. GOODMAN & NANA NAUWALD · NEUROFISIOLOGÍA Y SOMÁTICA',
        margin + 24,
        descTop + 32,
      );

      ctx.font = 'bold 14px "Helvetica Neue", sans-serif';
      ctx.fillText('Propósito y Flujo Energético Somático:', margin + 24, descTop + 64);
      ctx.font = '14px "Helvetica Neue", sans-serif';
      ctx.fillStyle = '#1e293b';

      const purposeText = `${activePosture.energeticSummary.primaryPurpose} ${activePosture.energeticSummary.somaticFlow}`;
      const words = purposeText.split(' ');
      let line = '';
      let textY = descTop + 86;
      for (const w of words) {
        const testLine = line + w + ' ';
        if (ctx.measureText(testLine).width > contentW - 60) {
          ctx.fillText(line, margin + 24, textY);
          line = w + ' ';
          textY += 22;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, margin + 24, textY);

      textY += 34;
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 14px "Helvetica Neue", sans-serif';
      ctx.fillText('Hallazgos Neurofisiológicos EEG (Univ. de Viena):', margin + 24, textY);

      textY += 22;
      ctx.font = '14px "Helvetica Neue", sans-serif';
      ctx.fillStyle = '#1e293b';
      const neuroWords = activePosture.energeticSummary.brainPhysiology.split(' ');
      let nLine = '';
      for (const nw of neuroWords) {
        const testLine = nLine + nw + ' ';
        if (ctx.measureText(testLine).width > contentW - 60) {
          ctx.fillText(nLine, margin + 24, textY);
          nLine = nw + ' ';
          textY += 22;
        } else {
          nLine = testLine;
        }
      }
      ctx.fillText(nLine, margin + 24, textY);

      textY += 34;
      ctx.fillStyle = '#000000';
      ctx.font = 'italic 14px "Georgia", serif';
      ctx.fillText(
        `«Protocolo Cuyamungue: Sonajero a 210 bpm durante 15 minutos en postura ritual y respiración continua.»`,
        margin + 24,
        textY,
      );
    } else {
      // ----------------------------------------------------------------------
      // MODO HORIZONTAL 50/50 (EXACTAMENTE COMO LA IMAGEN ENVIADA image_abf9b2aa.png)
      // ----------------------------------------------------------------------
      const midX = W / 2;

      // Filete perimetral
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.strokeRect(20, 20, midX - 30, H - 40);
      ctx.strokeRect(midX + 10, 20, midX - 30, H - 40);

      // Rótulos de panel
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 14px "Courier New", monospace';
      ctx.fillText('LADO IZQUIERDO · ESCULTURA ORIGINAL (CONTORNO 90°)', 35, 48);
      ctx.fillText('LADO DERECHO · AVATAR 3D 1:1 CON MEDIDOR DE ÁNGULOS', midX + 25, 48);

      const destW = midX - 60;
      const destH = H - 90;

      // 1. DIBUJAR LADO IZQUIERDO: CONTORNO LIMPIO DE LA FIGURA
      const outlineImg = cachedOutlineImgRef.current;
      if (outlineImg && outlineImg.naturalWidth > 0) {
        const imgAspect = outlineImg.naturalWidth / outlineImg.naturalHeight;
        const boxAspect = destW / destH;
        let drawW = destW;
        let drawH = destH;
        let drawX = 35;
        let drawY = 65;

        if (imgAspect > boxAspect) {
          drawH = destW / imgAspect;
          drawY = 65 + (destH - drawH) / 2;
        } else {
          drawW = destH * imgAspect;
          drawX = 35 + (destW - drawW) / 2;
        }

        ctx.save();
        ctx.drawImage(outlineImg, drawX, drawY, drawW, drawH);
        ctx.restore();
      }

      // 2. DIBUJAR LADO DERECHO: AVATAR 3D TÉCNICO
      const cached3d = cached3dImgRef.current;
      if (cached3d && cached3d.naturalWidth > 0) {
        const imgAspect = cached3d.naturalWidth / cached3d.naturalHeight;
        const boxAspect = destW / destH;
        let drawW = destW;
        let drawH = destH;
        let drawX = midX + 25;
        let drawY = 65;

        if (imgAspect > boxAspect) {
          drawH = destW / imgAspect;
          drawY = 65 + (destH - drawH) / 2;
        } else {
          drawW = destH * imgAspect;
          drawX = midX + 25 + (destW - drawW) / 2;
        }

        ctx.save();
        ctx.drawImage(cached3d, drawX, drawY, drawW, drawH);
        ctx.restore();
      } else {
        // Render 3D con Three.js
        const offCanvas = document.createElement('canvas');
        renderInteractivePose3DToCanvas(
          {
            subTitle: activePosture.name,
            focusZone: 'full_body',
            cameraPreset: 'sagittal_left',
            pose: activePosture.pose3D,
            orbitOverride: activePosture.cameraPreset,
          },
          offCanvas,
          Math.round(destW),
          Math.round(destH),
          activePosture.cameraPreset,
          2,
          'anatomical_skin',
          true,
          true,
        );

        ctx.save();
        ctx.filter = 'grayscale(100%) contrast(125%)';
        ctx.drawImage(offCanvas, midX + 25, 65, destW, destH);
        ctx.restore();
      }

      // 3. CAPA DE ÁNGULOS CON CARTELAS BLANCAS (Anti-Colisión)
      if (showAngleVectors || showAngleBadges) {
        activePosture.goniometryLabels.forEach((item) => {
          const jointCanvasX = midX + 10 + (item.jointX / 100) * (midX - 40);
          const jointCanvasY = 80 + (item.jointY / 100) * (H - 120);
          const badgeX = jointCanvasX + item.calloutDx * 1.5;
          const badgeY = jointCanvasY + item.calloutDy * 1.3;

          // Nodo
          ctx.fillStyle = '#000000';
          ctx.beginPath();
          ctx.arc(jointCanvasX, jointCanvasY, 5, 0, Math.PI * 2);
          ctx.fill();

          // Línea directriz
          ctx.beginPath();
          ctx.moveTo(jointCanvasX, jointCanvasY);
          ctx.lineTo(badgeX, badgeY);
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Cartela blanca sólida
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(badgeX - 10, badgeY - 18, 120, 36);
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.strokeRect(badgeX - 10, badgeY - 18, 120, 36);

          ctx.fillStyle = '#000000';
          ctx.font = 'bold 11px system-ui';
          ctx.fillText(item.jointName, badgeX - 2, badgeY - 3);
          ctx.font = 'bold 15px monospace';
          ctx.fillText(item.angleValue, badgeX - 2, badgeY + 13);
        });
      }
    }
  }, [activePosture, renderMode, showAngleVectors, showAngleBadges, glbReady]);

  useEffect(() => {
    renderEditorialKdpCanvas();
  }, [renderEditorialKdpCanvas]);

  // --------------------------------------------------------------------------
  // DESCARGA DE LA FICHA KDP 6×9" A 300 DPI
  // --------------------------------------------------------------------------
  const handleDownloadKdpSheetPng = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      setIsExporting(true);
      const isVertical = renderMode === 'kdp_editorial_b_w';
      const modeTag = isVertical ? 'kdp_vertical_6x9' : 'lamina_50_50_horizontal';
      const fileName = `ficha_${activePosture.id}_${modeTag}_300dpi.png`;

      const result = await exportCanvasToHighQualityPng(canvas);
      const a = document.createElement('a');
      a.href = result.dataUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setExportNotice(`Lámina de "${activePosture.name}" descargada a 300 DPI lista para imprenta.`);
      setTimeout(() => setExportNotice(null), 4500);
    } finally {
      setIsExporting(false);
    }
  };

  // Descarga de JSON de ángulos y entradas
  const handleDownloadJson = () => {
    const payload = {
      posture: activePosture.name,
      englishName: activePosture.englishName,
      bookPage: activePosture.bookPage,
      culturalOrigin: activePosture.culturalOrigin,
      cosmologicalElement: activePosture.cosmologicalElement,
      magneticPolarity: activePosture.magneticPolarity,
      angles,
      rulaScoreSinCarga: activePosture.rulaScoreSinCarga,
      rebaScoreSinCarga: activePosture.rebaScoreSinCarga,
      owasScoreSinCarga: activePosture.owasScoreSinCarga,
      energeticSummary: activePosture.energeticSummary,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calibracion_postura_${activePosture.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportNotice(`Archivo JSON descargado con éxito.`);
    setTimeout(() => setExportNotice(null), 3000);
  };

  // Descarga verificada del archivo ZIP completo (16 MB)
  const handleDownloadZipFile = async () => {
    setIsDownloadingZip(true);
    setExportNotice('Descargando archivo ZIP con los 53 dibujos (16.05 MB)...');
    try {
      const endpoints = [
        '/api/download/posturas-rituales-zip',
        '/downloads/posturas_rituales_dibujos_kdp.zip',
      ];
      let response: globalThis.Response | null = null;
      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint, {
            credentials: 'same-origin',
            headers: {
              Accept: 'application/zip, application/octet-stream, */*',
            },
          });
          if (res.ok && res.status === 200) {
            response = res;
            break;
          }
        } catch {
          // fallback to next
        }
      }

      if (!response) {
        throw new Error('No se pudo conectar con el servidor.');
      }

      const blob = await response.blob();
      if (blob.size < 500000) {
        // Less than 500KB means an error/auth redirect page was received
        throw new Error(`Respuesta inválida (${(blob.size / 1024).toFixed(1)} KB). Reintente en unos instantes.`);
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'posturas_rituales_dibujos_kdp.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);

      setExportNotice(`¡Descarga completada! Archivo ZIP de ${(blob.size / 1024 / 1024).toFixed(2)} MB verificado.`);
      setTimeout(() => setExportNotice(null), 6000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error durante la descarga.';
      setExportNotice(`Error: ${msg}`);
      setTimeout(() => setExportNotice(null), 6000);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // Transferir al estudio multipestaña formal
  const handleTransferToStudyTab = () => {
    const newTab = createNewStudyTab(
      99,
      MethodId.RULA,
      `Postura Ritual: ${activePosture.name} (Pág. ${activePosture.bookPage})`,
    );

    const rula = newTab.payloads[MethodId.RULA];
    if (rula) {
      rula.evaluatedSide = 'derecho';
      rula.neckPos = Math.max(1, Math.min(4, Math.round(angles.neckFlexionDeg / 10))) as 1 | 2 | 3 | 4;
      rula.trunkPos = Math.max(1, Math.min(4, Math.round(angles.trunkFlexionDeg / 20))) as 1 | 2 | 3 | 4;
      rula.right.upperArmPos = Math.max(1, Math.min(4, Math.round(angles.shoulderR / 20))) as 1 | 2 | 3 | 4;
      rula.right.lowerArmPos = (angles.elbowR < 60 ? 2 : 1) as 1 | 2;
      rula.legsPos = 1; // Sentado con soporte
    }

    onAddPoseTabToStudy(newTab);
    setExportNotice(`Pestaña formal de estudio para "${activePosture.name}" añadida.`);
  };

  // Helper de icono cosmologico
  const renderElementIcon = (elem: CosmologicalElement) => {
    switch (elem) {
      case 'Tierra':
        return <Mountain className="w-4 h-4 text-emerald-700" />;
      case 'Agua':
        return <Globe className="w-4 h-4 text-sky-700" />;
      case 'Fuego':
        return <Flame className="w-4 h-4 text-amber-700" />;
      case 'Aire':
        return <Wind className="w-4 h-4 text-indigo-700" />;
      case 'Éter':
        return <Sparkles className="w-4 h-4 text-violet-700" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* BARRA SUPERIOR DE ACCIONES */}
      <div className="bg-white border border-slate-300 rounded-lg p-3 sm:p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackToEvaluator}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al Estudio</span>
          </button>

          <div className="h-5 w-px bg-slate-300 hidden sm:block" />

          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-900 animate-pulse" />
              <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>Ficha KDP 6×9" · Posturas Rituales Felicitas Goodman</span>
                <span className="text-[11px] font-mono bg-slate-900 text-white px-2 py-0.5 rounded font-bold">
                  B&W 300 DPI
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-500 hidden md:block">
              Contorno limpio 90° + Avatar 3D con Medidor de Ángulos, evaluación RULA/REBA sin carga y polaridad magnética.
            </p>
          </div>
        </div>

        {/* ACCIONES DE DESCARGA */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadZipFile}
            disabled={isDownloadingZip}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-60"
            title="Descargar archivo ZIP con los 53 dibujos a lápiz en alta resolución 300 DPI para KDP (16 MB)"
          >
            <Download className="w-4 h-4 text-emerald-200" />
            <span>{isDownloadingZip ? 'Descargando (16 MB)...' : 'Descargar ZIP (53 Dibujos · 16 MB)'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadKdpSheetPng}
            disabled={isExporting}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs cursor-pointer transition-colors"
            title="Descargar lámina actual en alta resolución 300 DPI para publicación KDP"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>{isExporting ? 'Procesando...' : 'Descargar Lámina Actual'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadJson}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold shadow-xs cursor-pointer"
          >
            <FileJson className="w-4 h-4 text-sky-600" />
            <span className="hidden sm:inline">Descargar JSON</span>
          </button>

          <button
            type="button"
            onClick={handleTransferToStudyTab}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-xs cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Añadir al Estudio</span>
          </button>
        </div>
      </div>

      {/* BANNER DE NOTIFICACIÓN */}
      {exportNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-md text-emerald-900 text-xs font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            {exportNotice}
          </span>
          <button
            type="button"
            onClick={() => setExportNotice(null)}
            className="text-emerald-700 hover:text-emerald-950 font-bold ml-4"
          >
            ×
          </button>
        </div>
      )}

      {/* CUERPO PRINCIPAL */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* COLUMNA LATERAL: CATÁLOGO DE POSTURAS */}
        <div className="lg:col-span-1 bg-white border border-slate-300 rounded-lg p-3 sm:p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-sky-600" />
              Catálogo de Posturas del PDF
            </h2>
            <span className="text-[11px] font-mono text-slate-500">{RITUAL_POSTURES_CATALOG.length} posturas</span>
          </div>

          <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
            {RITUAL_POSTURES_CATALOG.map((item) => {
              const isSelected = item.id === selectedPostureId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedPostureId(item.id);
                    setCustomStatueImage(null);
                  }}
                  className={`w-full text-left p-2.5 rounded-md border text-xs font-medium transition-all cursor-pointer flex flex-col gap-1 ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 shadow-2xs font-semibold ring-1 ring-slate-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold truncate">{item.name}</span>
                    <span
                      className={`text-[10px] font-mono ${
                        isSelected ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      Pág. {item.bookPage}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span
                      className={`px-1.5 py-0.2 rounded font-semibold ${
                        isSelected ? 'bg-slate-800 text-slate-200' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {item.cosmologicalElement}
                    </span>
                    <span
                      className={`px-1.5 py-0.2 rounded font-semibold ${
                        isSelected ? 'bg-slate-800 text-slate-200' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {item.magneticPolarity.includes('Activa') ? 'Polaridad (+)' : 'Polaridad (-)'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Subir foto externa */}
          <div className="pt-2 border-t border-slate-200">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleUploadCustomStatue}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full min-h-[36px] inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-md border border-dashed border-slate-400 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-semibold cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 text-sky-600" />
              <span>Subir Foto Externa / Nueva Estatua</span>
            </button>
            {customStatueImage && (
              <button
                type="button"
                onClick={() => setCustomStatueImage(null)}
                className="w-full text-center text-[11px] text-red-600 hover:underline mt-1 cursor-pointer"
              >
                Restablecer a figura limpia del libro
              </button>
            )}
          </div>

          {/* TARJETA DE EVALUACIÓN BIOMECÁNICA RULA / REBA SIN CARGA */}
          <div className="bg-slate-900 text-slate-100 rounded-md p-3 space-y-2 text-xs">
            <span className="font-bold text-[11px] uppercase tracking-wider text-slate-400 block border-b border-slate-800 pb-1">
              Resultados de Cinemática Postural
            </span>

            {/* RULA */}
            <div className="flex items-center justify-between p-2 rounded bg-slate-800/80 border border-slate-700">
              <div>
                <span className="font-bold text-white block">RULA (Sin Carga)</span>
                <span className="text-[11px] text-slate-300">Nivel de Acción 1</span>
              </div>
              <span className="text-xl font-bold font-mono text-emerald-400">
                {activePosture.rulaScoreSinCarga.score} / 7
              </span>
            </div>

            {/* REBA */}
            <div className="flex items-center justify-between p-2 rounded bg-slate-800/80 border border-slate-700">
              <div>
                <span className="font-bold text-white block">REBA (Estática)</span>
                <span className="text-[11px] text-slate-300">Riesgo postural bajo</span>
              </div>
              <span className="text-xl font-bold font-mono text-amber-400">
                {activePosture.rebaScoreSinCarga.score} / 15
              </span>
            </div>

            {/* OWAS */}
            <div className="flex items-center justify-between p-2 rounded bg-slate-800/80 border border-slate-700">
              <div>
                <span className="font-bold text-white block">OWAS (Carga 0 kg)</span>
                <span className="text-[11px] text-slate-300">Postura normal de trance</span>
              </div>
              <span className="text-lg font-bold font-mono text-sky-400">
                Cat. {activePosture.owasScoreSinCarga.category}
              </span>
            </div>
          </div>
        </div>

        {/* COLUMNA CENTRAL Y DERECHA: VISOR */}
        <div className="lg:col-span-3 space-y-3">
          {/* Selector de modo visual */}
          <div className="bg-white border border-slate-300 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-slate-700 mr-1">Formato Editorial:</span>
              <button
                type="button"
                onClick={() => setRenderMode('split_50_50')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer border transition-colors ${
                  renderMode === 'split_50_50'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                    : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                }`}
                title="Lámina 50/50 horizontal (Contorno limpio izquierdo + Avatar 3D derecho)"
              >
                Lámina 50/50 Horizontal (Objetivo)
              </button>

              <button
                type="button"
                onClick={() => setRenderMode('kdp_editorial_b_w')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer border transition-colors ${
                  renderMode === 'kdp_editorial_b_w'
                    ? 'bg-sky-600 text-white border-sky-700 shadow-2xs'
                    : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                }`}
                title="Ficha completa vertical para página entera KDP 6x9"
              >
                Ficha Completa KDP 6×9" Vertical
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                {renderElementIcon(activePosture.cosmologicalElement)}
                <span className="font-bold">{activePosture.cosmologicalElement}</span>
                <span className="text-slate-400">|</span>
                <span className="font-mono text-slate-600">{activePosture.magneticPolarity}</span>
              </div>
            </div>
          </div>

          {/* VISOR CANVAS */}
          <div className="relative bg-slate-100 rounded-lg border-2 border-slate-300 p-2 sm:p-4 overflow-hidden shadow-inner flex items-center justify-center min-h-[520px]">
            <canvas
              ref={canvasRef}
              className="w-full h-auto max-h-[820px] object-contain block bg-white shadow-md border border-slate-400"
            />
          </div>
        </div>
      </div>

      {/* DESGLOSE DOCUMENTAL INFERIOR */}
      <div className="bg-white border border-slate-300 rounded-lg shadow-2xs overflow-hidden">
        <div className="bg-slate-100 border-b border-slate-300 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-xs uppercase tracking-wider text-slate-900">
              Datos Biomecánicos & Cosmológicos Cuyamungue: {activePosture.name}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-slate-700">Pág. Libro: {activePosture.bookPage}</span>
            <span className="text-slate-400">·</span>
            <span className="font-bold text-slate-700">Pág. PDF: {activePosture.pdfPage}</span>
          </div>
        </div>

        <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-800">
          <div className="space-y-2 border-l-2 border-slate-900 pl-3">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
              {renderElementIcon(activePosture.cosmologicalElement)}
              Cosmología y Polaridad Magnética
            </h3>
            <p className="text-slate-600 leading-relaxed">
              <strong>Elemento Primordial:</strong> {activePosture.cosmologicalElement}.<br />
              <strong>Polaridad Energética:</strong> {activePosture.magneticPolarity}.<br />
              <strong>Categoría Trance:</strong> {activePosture.category}.
            </p>
          </div>

          <div className="space-y-2 border-l-2 border-sky-600 pl-3">
            <h3 className="font-bold text-sm text-sky-950 flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-sky-600" />
              Ángulos Canónicos Medidos
            </h3>
            <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
              <div>Cuello: <strong>{activePosture.defaultAngles.neckFlexionDeg}°</strong></div>
              <div>Tronco: <strong>{activePosture.defaultAngles.trunkFlexionDeg}°</strong></div>
              <div>Brazo D: <strong>{activePosture.defaultAngles.shoulderR}°</strong></div>
              <div>Codo D: <strong>{activePosture.defaultAngles.elbowR}°</strong></div>
              <div>Rodilla D: <strong>{activePosture.defaultAngles.kneeR}°</strong></div>
              <div>Rodilla I: <strong>{activePosture.defaultAngles.kneeL}°</strong></div>
            </div>
          </div>

          <div className="space-y-2 border-l-2 border-emerald-600 pl-3">
            <h3 className="font-bold text-sm text-emerald-950 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              Neurofisiología EEG (Univ. Viena)
            </h3>
            <p className="text-slate-600 leading-relaxed">
              Ondas Theta sincrónicas (4-7 Hz), viraje del potencial continuo DC cerebral hacia polaridad negativa sostenida (-350 a -500 µV) y aumento de beta-endorfinas (+180%).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

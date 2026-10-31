import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  Check,
  Download,
  Hand,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  SkipBack,
  SkipForward,
  Upload,
} from 'lucide-react';
import {
  GeneralStudyData,
  MethodId,
  StudyPhoto,
  StudyTab,
} from '../types/ergonomics';
import { createNewStudyTab } from '../utils/defaults';
import { evaluateStudyTab } from '../utils/calculations';
import {
  buildCalibratedHandRepetitionDemo,
  deduceHandRepetitiveMovements,
  drawHandRepetitionOverlay,
  extractHandRepetitionTimeline,
  HandCountingMode,
  HandDeductionParams,
  HandMovementEvent,
  HandRepetitionRawTrace,
  ManualHandAdjustments,
} from '../utils/handRepetitionAnalyzer';

interface HandRepetitionTesterWorkspaceProps {
  general: GeneralStudyData;
  onBackToEvaluator: () => void;
  onAddRepetitionTabToStudy: (newTab: StudyTab) => void;
}

type TargetRepetitiveMethod =
  | MethodId.OCRA_CHECKLIST
  | MethodId.OCRA_COMPLETO
  | MethodId.JSI
  | MethodId.NAM_295;

type TimelineClickTool = 'scrub' | 'edit_right' | 'edit_left';

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function formatSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0.00s';
  return `${sec.toFixed(2)}s`;
}

function kindLabel(kind: HandMovementEvent['kind']): string {
  switch (kind) {
    case 'alcance_ciclo':
      return 'Ciclo ida-vuelta';
    case 'accion_ida':
      return 'Alcance / Ida';
    case 'accion_retorno':
      return 'Traslado / Retorno';
    case 'pinza_digital':
      return 'Pinza digital';
    case 'manual':
      return 'Marca manual';
  }
}

async function waitForVideoReady(video: HTMLVideoElement, timeoutMs = 6500): Promise<boolean> {
  if (video.readyState >= 2 && video.videoWidth > 0 && Number.isFinite(video.duration) && video.duration > 0) {
    return true;
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('error', onErr);
      clearTimeout(timer);
      resolve(ok);
    };
    const onReady = () => {
      if (video.videoWidth > 0 && Number.isFinite(video.duration) && video.duration > 0) {
        finish(true);
      }
    };
    const onErr = () => finish(false);
    const timer = setTimeout(() => {
      finish(video.videoWidth > 0 && Number.isFinite(video.duration) && video.duration > 0);
    }, timeoutMs);

    video.addEventListener('loadeddata', onReady);
    video.addEventListener('canplay', onReady);
    video.addEventListener('error', onErr);
  });
}

async function normalizeVideoViaServer(file: File, timeoutMs = 22000): Promise<Blob | null> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch('/api/biomech/normalize-video', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-file-name': encodeURIComponent(file.name || 'upload.mp4'),
      },
      body: file,
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('video')) return null;
    const blob = await resp.blob();
    return blob.size > 512 ? blob : null;
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export const HandRepetitionTesterWorkspace: React.FC<HandRepetitionTesterWorkspaceProps> = ({
  general,
  onBackToEvaluator,
  onAddRepetitionTabToStudy,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const oscillogramCanvasRef = useRef<HTMLCanvasElement>(null);

  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null);
  const [uploadedFileRef, setUploadedFileRef] = useState<File | null>(null);
  const [rawTrace, setRawTrace] = useState<HandRepetitionRawTrace | null>(null);

  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanProgressPct, setScanProgressPct] = useState<number>(0);
  const [scanStatusMsg, setScanStatusMsg] = useState<string>('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [targetScanFps, setTargetScanFps] = useState<12 | 15 | 20 | 24>(20);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<0.25 | 0.5 | 1>(1);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);

  const [showSkeleton21, setShowSkeleton21] = useState<boolean>(true);
  const [showTrails, setShowTrails] = useState<boolean>(true);
  const [handFocus, setHandFocus] = useState<'both' | 'right' | 'left'>('both');
  const [timelineTool, setTimelineTool] = useState<TimelineClickTool>('scrub');

  const [params, setParams] = useState<HandDeductionParams>({
    windowStartSec: 0,
    windowEndSec: 20,
    countingMode: 'repeticiones_ciclicas',
    minExcursionCm: 3.0,
    minIntervalMs: 280,
    activeSpeedThresholdCmS: 6.5,
    includeFingerPinch: false,
    pinchProminenceRatio: 0.28,
    swapHands: false,
  });

  const [manualAdjustments, setManualAdjustments] = useState<ManualHandAdjustments>({
    suppressedEventIds: [],
    addedEvents: [],
  });

  const [targetMethod, setTargetMethod] = useState<TargetRepetitiveMethod>(
    MethodId.OCRA_CHECKLIST,
  );
  const [borgForceInput, setBorgForceInput] = useState<number>(2);
  const [taskNameInput, setTaskNameInput] = useState<string>(
    general.workstationName
      ? `Conteo repetitivo de manos — ${general.workstationName}`
      : 'Ciclo repetitivo centrado en manos',
  );
  const [sentConfirmation, setSentConfirmation] = useState<string | null>(null);

  // Limpiar URL blob anterior al desmontar o reemplazar vídeo
  useEffect(() => {
    return () => {
      if (videoObjectUrl) {
        URL.revokeObjectURL(videoObjectUrl);
      }
    };
  }, [videoObjectUrl]);

  // Deducción en tiempo real (< 2 ms) ante cualquier ajuste de sensibilidad o ventana
  const deduction = useMemo(() => {
    if (!rawTrace) return null;
    return deduceHandRepetitiveMovements(rawTrace, params, manualAdjustments);
  }, [rawTrace, params, manualAdjustments]);

  const runAnalysisOnFile = useCallback(
    async (file: File, fpsToUse: 12 | 15 | 20 | 24) => {
      setIsScanning(true);
      setScanError(null);
      setSentConfirmation(null);
      setIsPlaying(false);
      setRawTrace(null);
      setScanProgressPct(3);
      setScanStatusMsg('Preparando vídeo con fotogramas clave densos (24 fps H.264)...');

      let workingUrl: string | null = null;
      const probeVid = document.createElement('video');
      probeVid.style.position = 'fixed';
      probeVid.style.left = '0px';
      probeVid.style.top = '0px';
      probeVid.style.width = '2px';
      probeVid.style.height = '2px';
      probeVid.style.opacity = '0.01';
      probeVid.style.zIndex = '-1';
      probeVid.style.pointerEvents = 'none';
      probeVid.muted = true;
      probeVid.playsInline = true;
      probeVid.setAttribute('playsinline', 'true');
      probeVid.setAttribute('webkit-playsinline', 'true');
      probeVid.preload = 'auto';
      document.body.appendChild(probeVid);

      try {
        // 1. Si el vídeo <= 120 MB, normalizar primero en servidor con FFmpeg (-g 6 -r 24)
        //    para garantizar decodificación exacta cuadro a cuadro sin congelamiento de GOP/B-frames.
        if (file.size <= 120 * 1024 * 1024) {
          const normBlob = await normalizeVideoViaServer(file);
          if (normBlob) {
            workingUrl = URL.createObjectURL(normBlob);
          }
        }
        if (!workingUrl) {
          workingUrl = URL.createObjectURL(file);
        }

        probeVid.src = workingUrl;
        probeVid.load();
        let ready = await waitForVideoReady(probeVid, 7500);

        if (!ready) {
          setScanProgressPct(7);
          setScanStatusMsg('Recodificando códec de vídeo (MOV/HEVC → H.264 compatible)...');
          const retryBlob = await normalizeVideoViaServer(file, 35000);
          if (retryBlob) {
            URL.revokeObjectURL(workingUrl);
            workingUrl = URL.createObjectURL(retryBlob);
            probeVid.src = workingUrl;
            probeVid.load();
            ready = await waitForVideoReady(probeVid, 9000);
          }
        }

        if (!ready) {
          URL.revokeObjectURL(workingUrl);
          setScanError(
            'El navegador no pudo decodificar este formato de vídeo. Pruebe convirtiéndolo a MP4 (H.264) o WebM.',
          );
          return;
        }

        const finalUrl = workingUrl;
        setVideoObjectUrl((prev) => {
          if (prev && prev !== finalUrl) URL.revokeObjectURL(prev);
          return finalUrl;
        });

        const trace = await extractHandRepetitionTimeline(probeVid, {
          targetFps: fpsToUse,
          maxDurationSec: 90,
          sourceLabel: file.name,
          onProgress: (pct, msg) => {
            setScanProgressPct(pct);
            setScanStatusMsg(msg);
          },
        });

        // Verificar con parámetros base (3.0 cm); si ambas manos tienen 0 en 3.0 cm pero presentan
        // micro-oscilaciones reales repetitivas verificadas (1.2..2.9 cm), adaptar el umbral inicial.
        const defaultNextParams: HandDeductionParams = {
          windowStartSec: 0,
          windowEndSec: Number(trace.durationSec.toFixed(2)),
          countingMode: 'repeticiones_ciclicas',
          minExcursionCm: 3.0,
          minIntervalMs: 280,
          activeSpeedThresholdCmS: 6.5,
          includeFingerPinch: false,
          pinchProminenceRatio: 0.28,
          swapHands: false,
        };
        const initialEval = deduceHandRepetitiveMovements(trace, defaultNextParams);
        if (initialEval.right.count === 0 && initialEval.left.count === 0) {
          const candidates = [
            initialEval.right.subThresholdSuggestedCm,
            initialEval.left.subThresholdSuggestedCm,
          ].filter((v): v is number => v !== null && Number.isFinite(v));
          if (candidates.length > 0) {
            defaultNextParams.minExcursionCm = Math.min(...candidates);
          }
        }

        setRawTrace(trace);
        setManualAdjustments({ suppressedEventIds: [], addedEvents: [] });
        setParams(defaultNextParams);
        setCurrentTimeSec(0);
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
        }
      } catch (err) {
        if (workingUrl) {
          URL.revokeObjectURL(workingUrl);
        }
        const msg =
          err instanceof Error
            ? err.message
            : 'Error durante el rastreo óptico de manos en el vídeo.';
        setScanError(msg);
      } finally {
        try {
          probeVid.pause();
          probeVid.removeAttribute('src');
          probeVid.load();
          probeVid.remove();
        } catch {
          // Ignorar limpieza de probeVid
        }
        setIsScanning(false);
      }
    },
    [],
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadedFileRef(file);
    await runAnalysisOnFile(file, targetScanFps);
  };

  const handleReanalyze = async () => {
    if (!uploadedFileRef || isScanning) return;
    await runAnalysisOnFile(uploadedFileRef, targetScanFps);
  };

  const handleLoadCalibratedDemo = () => {
    if (isScanning) return;
    setScanError(null);
    setSentConfirmation(null);
    setIsPlaying(false);
    setUploadedFileRef(null);
    setVideoObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    const demo = buildCalibratedHandRepetitionDemo();
    setRawTrace(demo);
    setManualAdjustments({ suppressedEventIds: [], addedEvents: [] });
    setParams((prev) => ({
      ...prev,
      windowStartSec: 0,
      windowEndSec: demo.durationSec,
      countingMode: 'repeticiones_ciclicas',
      minExcursionCm: 3.0,
      minIntervalMs: 280,
      activeSpeedThresholdCmS: 6.5,
      swapHands: false,
    }));
    setCurrentTimeSec(0);
  };

  // Sincronizar velocidad de reproducción del `<video>`
  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      v.playbackRate = playbackRate;
    }
  }, [playbackRate, videoObjectUrl]);

  // Bucle de tiempo para modo demo sintético o reproducción de vídeo real
  useEffect(() => {
    if (!rawTrace) return;

    if (rawTrace.isSyntheticDemo) {
      if (!isPlaying) return;
      let rafId = 0;
      let lastTs = performance.now();
      const loop = (now: number) => {
        const dt = ((now - lastTs) / 1000) * playbackRate;
        lastTs = now;
        setCurrentTimeSec((prev) => {
          const next = prev + dt;
          const endLim = params.windowEndSec > params.windowStartSec + 0.3
            ? params.windowEndSec
            : rawTrace.durationSec;
          return next >= endLim ? params.windowStartSec : next;
        });
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(rafId);
    }

    const v = videoRef.current;
    if (!v) return;
    let rafId = 0;
    const syncTime = () => {
      setCurrentTimeSec(v.currentTime || 0);
      if (!v.paused && !v.ended) {
        // Respetar bucle dentro de la ventana activa si terminó `windowEndSec`
        if (
          params.windowEndSec < rawTrace.durationSec - 0.1 &&
          v.currentTime >= params.windowEndSec
        ) {
          v.currentTime = params.windowStartSec;
        }
        rafId = requestAnimationFrame(syncTime);
      }
    };

    const onPlay = () => {
      setIsPlaying(true);
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(syncTime);
    };
    const onPause = () => {
      setIsPlaying(false);
      cancelAnimationFrame(rafId);
      setCurrentTimeSec(v.currentTime || 0);
    };
    const onSeeked = () => {
      setCurrentTimeSec(v.currentTime || 0);
    };

    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onPause);
    v.addEventListener('seeked', onSeeked);
    v.addEventListener('timeupdate', onSeeked);

    return () => {
      cancelAnimationFrame(rafId);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onPause);
      v.removeEventListener('seeked', onSeeked);
      v.removeEventListener('timeupdate', onSeeked);
    };
  }, [rawTrace, isPlaying, playbackRate, params.windowStartSec, params.windowEndSec]);

  const scrubToTime = useCallback(
    (targetSec: number) => {
      if (!rawTrace) return;
      const clamped = clamp(targetSec, 0, rawTrace.durationSec);
      setCurrentTimeSec(clamped);
      if (!rawTrace.isSyntheticDemo && videoRef.current) {
        try {
          videoRef.current.currentTime = clamped;
        } catch {
          // Ignorar si aún no está listo
        }
      }
    },
    [rawTrace],
  );

  const togglePlayPause = () => {
    if (!rawTrace) return;
    if (rawTrace.isSyntheticDemo) {
      setIsPlaying((prev) => !prev);
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) {
      if (v.currentTime >= params.windowEndSec - 0.05) {
        v.currentTime = params.windowStartSec;
      }
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  };

  // Saltar al movimiento anterior o siguiente detectado
  const combinedSortedEvents = useMemo(() => {
    if (!deduction) return [];
    const list: HandMovementEvent[] = [];
    if (handFocus === 'both' || handFocus === 'right') list.push(...deduction.right.events);
    if (handFocus === 'both' || handFocus === 'left') list.push(...deduction.left.events);
    return list.sort((a, b) => a.timeSec - b.timeSec);
  }, [deduction, handFocus]);

  const jumpToAdjacentEvent = (dir: -1 | 1) => {
    if (combinedSortedEvents.length === 0) return;
    if (dir > 0) {
      const next = combinedSortedEvents.find((e) => e.timeSec > currentTimeSec + 0.06);
      scrubToTime((next ?? combinedSortedEvents[0]).timeSec);
    } else {
      const prevList = combinedSortedEvents.filter((e) => e.timeSec < currentTimeSec - 0.06);
      const prev =
        prevList.length > 0
          ? prevList[prevList.length - 1]
          : combinedSortedEvents[combinedSortedEvents.length - 1];
      scrubToTime(prev.timeSec);
    }
  };

  // Dibujar superposición 2D de manos sobre el fotograma de vídeo o escenario calibrado
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !rawTrace || !deduction) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    const cw = Math.max(240, parent.clientWidth);
    const ch = Math.max(200, parent.clientHeight);
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    // Calcular rectángulo letterbox exacto del vídeo dentro del contenedor `object-contain`
    const vidAspect = rawTrace.videoAspect || 16 / 9;
    const boxAspect = cw / ch;
    let rw = cw;
    let rh = ch;
    let rx = 0;
    let ry = 0;
    if (vidAspect > boxAspect) {
      rw = cw;
      rh = cw / vidAspect;
      ry = (ch - rh) * 0.5;
    } else {
      rh = ch;
      rw = ch * vidAspect;
      rx = (cw - rw) * 0.5;
    }

    if (rawTrace.isSyntheticDemo) {
      // Escenario esquemático limpio de banco de ensamble para la señal calibrada
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(rx, ry, rw, rh);

      // Mesa y bandejas de alimentación laterales
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
      ctx.fillRect(rx + rw * 0.14, ry + rh * 0.36, rw * 0.72, rh * 0.48);
      ctx.strokeRect(rx + rw * 0.14, ry + rh * 0.36, rw * 0.72, rh * 0.48);

      // Bandeja piezas Derecha (en imagen lado izquierdo del operario visto de frente) y Bandeja Izquierda
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.strokeRect(rx + rw * 0.2, ry + rh * 0.41, rw * 0.16, rh * 0.16);
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
      ctx.strokeRect(rx + rw * 0.64, ry + rh * 0.43, rw * 0.16, rh * 0.16);
      ctx.setLineDash([]);

      ctx.font = '500 11px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Bandeja Toma Der (36/min)', rx + rw * 0.2, ry + rh * 0.39);
      ctx.fillText('Bandeja Toma Izq (18/min)', rx + rw * 0.64, ry + rh * 0.41);
      ctx.fillText('Zona Central de Ensamble', rx + rw * 0.42, ry + rh * 0.78);
    }

    drawHandRepetitionOverlay(
      ctx,
      rawTrace,
      deduction,
      currentTimeSec,
      { x: rx, y: ry, w: rw, h: rh },
      {
        swapHands: params.swapHands,
        showTrails,
        showSkeleton21,
        handFocus,
      },
    );
  }, [
    rawTrace,
    deduction,
    currentTimeSec,
    params.swapHands,
    showTrails,
    showSkeleton21,
    handFocus,
  ]);

  // Dibujar oscilograma interactivo bimanual (Excursión de Mano Derecha e Izquierda + Marcas de Conteo)
  useEffect(() => {
    const canvas = oscillogramCanvasRef.current;
    if (!canvas || !rawTrace || !deduction) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    const cw = Math.max(280, parent.clientWidth);
    const ch = 186;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    const padL = 42;
    const padR = 14;
    const padT = 18;
    const padB = 24;
    const plotW = Math.max(40, cw - padL - padR);
    const plotH = Math.max(40, ch - padT - padB);
    const dur = Math.max(0.2, rawTrace.durationSec);

    const xOfSec = (t: number) => padL + clamp(t / dur, 0, 1) * plotW;

    const maxR = Math.max(...deduction.right.excursionSeriesCm, 0);
    const maxL = Math.max(...deduction.left.excursionSeriesCm, 0);
    const maxYCm = Math.max(12, params.minExcursionCm * 1.6, maxR * 1.12, maxL * 1.12);
    const yOfCm = (cm: number) => padT + plotH - clamp(cm / maxYCm, 0, 1) * plotH;

    // Fondo del área gráfica
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(padL, padT, plotW, plotH);

    // Sombrear zonas excluidas fuera de [windowStartSec .. windowEndSec]
    const xWinStart = xOfSec(deduction.windowStartSec);
    const xWinEnd = xOfSec(deduction.windowEndSec);
    if (xWinStart > padL) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.08)';
      ctx.fillRect(padL, padT, xWinStart - padL, plotH);
    }
    if (xWinEnd < padL + plotW) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.08)';
      ctx.fillRect(xWinEnd, padT, padL + plotW - xWinEnd, plotH);
    }

    // Líneas guía horizontales + etiquetas de cm
    ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const frac of [0, 0.5, 1]) {
      const val = Math.round(maxYCm * frac);
      const y = yOfCm(val);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.fillText(`${val}cm`, padL - 6, y);
    }

    // Umbral mínimo de excursión (`minExcursionCm`)
    const yThresh = yOfCm(params.minExcursionCm);
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(padL, yThresh);
    ctx.lineTo(padL + plotW, yThresh);
    ctx.stroke();
    ctx.restore();

    // Curvas de excursión de ambas manos
    const drawCurve = (series: number[], color: string, enabled: boolean) => {
      if (!enabled || series.length < 2) return;
      ctx.beginPath();
      for (let i = 0; i < series.length; i++) {
        const x = xOfSec(rawTrace.samples[i].timeSec);
        const y = yOfCm(series[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.9;
      ctx.lineJoin = 'round';
      ctx.stroke();
    };

    drawCurve(
      deduction.left.excursionSeriesCm,
      '#d97706',
      handFocus === 'both' || handFocus === 'left',
    );
    drawCurve(
      deduction.right.excursionSeriesCm,
      '#0284c7',
      handFocus === 'both' || handFocus === 'right',
    );

    // Marcas verticales de cada movimiento contado
    const drawEvents = (
      events: HandMovementEvent[],
      suppressed: HandMovementEvent[],
      color: string,
      rowY: number,
      enabled: boolean,
    ) => {
      if (!enabled) return;

      // Eventos silenciados manualmente (gris tenue con X)
      for (const sev of suppressed) {
        const x = xOfSec(sev.timeSec);
        ctx.save();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, padT + plotH);
        ctx.stroke();
        ctx.restore();
      }

      events.forEach((ev, idx) => {
        const x = xOfSec(ev.timeSec);
        ctx.save();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.42;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, padT + plotH);
        ctx.stroke();
        ctx.globalAlpha = 1;

        const yDot = yOfCm(ev.amplitudeCm);
        ctx.beginPath();
        ctx.arc(x, clamp(yDot, padT + 4, padT + plotH - 4), 3.4, 0, Math.PI * 2);
        ctx.fillStyle = ev.kind === 'pinza_digital' ? '#7c3aed' : color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Índice compacto arriba
        if (events.length <= 36 || idx % 2 === 0) {
          ctx.font = '600 9px "JetBrains Mono", ui-monospace, monospace';
          ctx.fillStyle = color;
          ctx.textAlign = 'center';
          ctx.fillText(`${idx + 1}`, x, rowY);
        }
        ctx.restore();
      });
    };

    drawEvents(
      deduction.right.events,
      deduction.right.suppressedEvents,
      '#0284c7',
      padT - 7,
      handFocus === 'both' || handFocus === 'right',
    );
    drawEvents(
      deduction.left.events,
      deduction.left.suppressedEvents,
      '#b45309',
      padT + 9,
      handFocus === 'both' || handFocus === 'left',
    );

    // Bordes de la ventana activa [windowStartSec .. windowEndSec]
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(xWinStart, padT);
    ctx.lineTo(xWinStart, padT + plotH);
    ctx.moveTo(xWinEnd, padT);
    ctx.lineTo(xWinEnd, padT + plotH);
    ctx.stroke();

    // Cursor de reproducción actual
    const xPlay = xOfSec(currentTimeSec);
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(xPlay, padT - 2);
    ctx.lineTo(xPlay, padT + plotH + 2);
    ctx.stroke();

    // Escala de tiempo inferior (segundos)
    ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const stepCount = 5;
    for (let s = 0; s <= stepCount; s++) {
      const tVal = (dur * s) / stepCount;
      const x = xOfSec(tVal);
      ctx.fillText(`${tVal.toFixed(1)}s`, x, padT + plotH + 6);
    }

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(padL, padT, plotW, plotH);
  }, [rawTrace, deduction, currentTimeSec, params.minExcursionCm, handFocus]);

  const handleOscillogramClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!rawTrace || !deduction || !oscillogramCanvasRef.current) return;
    const rect = oscillogramCanvasRef.current.getBoundingClientRect();
    const padL = 42;
    const padR = 14;
    const plotW = Math.max(40, rect.width - padL - padR);
    const clickX = e.clientX - rect.left;
    const frac = clamp((clickX - padL) / plotW, 0, 1);
    const clickedSec = Number((frac * rawTrace.durationSec).toFixed(2));

    if (timelineTool === 'scrub') {
      scrubToTime(clickedSec);
      return;
    }

    const editSide: 'right' | 'left' = timelineTool === 'edit_right' ? 'right' : 'left';
    const sideSummary = deduction[editSide];
    const hitTolSec = Math.max(0.22, rawTrace.durationSec * 0.018);

    // 1. ¿Hizo clic sobre una marca manual existente? -> eliminarla
    const manualHit = manualAdjustments.addedEvents.find(
      (m) => m.hand === editSide && Math.abs(m.timeSec - clickedSec) <= hitTolSec,
    );
    if (manualHit) {
      setManualAdjustments((prev) => ({
        ...prev,
        addedEvents: prev.addedEvents.filter((m) => m.id !== manualHit.id),
      }));
      scrubToTime(clickedSec);
      return;
    }

    // 2. ¿Hizo clic sobre un evento automático activo? -> silenciarlo
    const activeAutoHit = sideSummary.events.find(
      (ev) => ev.kind !== 'manual' && Math.abs(ev.timeSec - clickedSec) <= hitTolSec,
    );
    if (activeAutoHit) {
      setManualAdjustments((prev) => ({
        ...prev,
        suppressedEventIds: [...prev.suppressedEventIds, activeAutoHit.id],
      }));
      scrubToTime(activeAutoHit.timeSec);
      return;
    }

    // 3. ¿Hizo clic sobre un evento automático silenciado? -> restaurarlo
    const suppressedHit = sideSummary.suppressedEvents.find(
      (ev) => Math.abs(ev.timeSec - clickedSec) <= hitTolSec,
    );
    if (suppressedHit) {
      setManualAdjustments((prev) => ({
        ...prev,
        suppressedEventIds: prev.suppressedEventIds.filter((id) => id !== suppressedHit.id),
      }));
      scrubToTime(suppressedHit.timeSec);
      return;
    }

    // 4. Caso contrario: agregar nueva marca manual en ese instante
    setManualAdjustments((prev) => ({
      ...prev,
      addedEvents: [
        ...prev.addedEvents,
        {
          id: `manual-${editSide}-${Date.now()}-${Math.round(clickedSec * 100)}`,
          hand: editSide,
          timeSec: clickedSec,
        },
      ],
    }));
    scrubToTime(clickedSec);
  };

  const handleExportCsv = () => {
    if (!rawTrace || !deduction) return;
    const rows: string[] = [
      'Indice,Mano,Tiempo_s,Inicio_s,Fin_s,Tipo_Movimiento,Amplitud_cm,Velocidad_Pico_cm_s',
    ];
    const all = [...deduction.right.events, ...deduction.left.events].sort(
      (a, b) => a.timeSec - b.timeSec,
    );
    all.forEach((ev, idx) => {
      rows.push(
        [
          idx + 1,
          ev.hand === 'right' ? 'Derecha' : 'Izquierda',
          ev.timeSec.toFixed(2),
          ev.startSec.toFixed(2),
          ev.endSec.toFixed(2),
          kindLabel(ev.kind),
          ev.amplitudeCm.toFixed(1),
          ev.peakSpeedCmPerSec.toFixed(1),
        ].join(','),
      );
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conteo_manos_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const captureAnnotatedSnapshotDataUrl = (): string | null => {
    if (!rawTrace || !deduction) return null;
    const outCanvas = document.createElement('canvas');
    const w = 960;
    const h = Math.round(w / clamp(rawTrace.videoAspect || 16 / 9, 0.56, 2.2));
    outCanvas.width = w;
    outCanvas.height = h;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    if (!rawTrace.isSyntheticDemo && videoRef.current && videoRef.current.readyState >= 2) {
      try {
        ctx.drawImage(videoRef.current, 0, 0, w, h);
      } catch {
        // Continuar con fondo oscuro si hay restricción
      }
    }

    drawHandRepetitionOverlay(
      ctx,
      rawTrace,
      deduction,
      currentTimeSec,
      { x: 0, y: 0, w, h },
      {
        swapHands: params.swapHands,
        showTrails: true,
        showSkeleton21: true,
        handFocus: 'both',
      },
    );

    return outCanvas.toDataURL('image/png');
  };

  const handleSendToStudy = () => {
    if (!rawTrace || !deduction) return;

    const newTab = createNewStudyTab(1, targetMethod, taskNameInput.trim() || 'Ciclo repetitivo de manos');
    const winSec = Math.max(1, Math.round(deduction.windowDurationSec));
    const domSide =
      deduction.right.ratePerMin >= deduction.left.ratePerMin
        ? deduction.right
        : deduction.left;

    // 1. Poblar parámetros exactos según el método ergonómico elegido
    if (targetMethod === MethodId.OCRA_CHECKLIST) {
      const ocra = newTab.payloads[MethodId.OCRA_CHECKLIST];
      ocra.mode = 'clasico_bilateral';
      ocra.actionsPerCycle = Math.max(1, domSide.technicalActionsCount);
      ocra.cycleDurationSec = winSec;
      ocra.right.frequencyFactor = deduction.right.ocraDynamicFreqFactor;
      ocra.right.stereotypyScore = deduction.right.ocraStereotypyScore;
      ocra.left.frequencyFactor = deduction.left.ocraDynamicFreqFactor;
      ocra.left.stereotypyScore = deduction.left.ocraStereotypyScore;
      ocra.coefFrequency =
        domSide.technicalActionsPerMin > 50
          ? 0.4
          : domSide.technicalActionsPerMin > 35
            ? 0.6
            : domSide.technicalActionsPerMin > 25
              ? 0.8
              : 1.0;
      ocra.coefStereotypy =
        domSide.ocraStereotypyScore === 3
          ? 0.7
          : domSide.ocraStereotypyScore === 1.5
            ? 0.85
            : 1.0;
    } else if (targetMethod === MethodId.OCRA_COMPLETO) {
      const ocraComp = newTab.payloads[MethodId.OCRA_COMPLETO];
      ocraComp.actionsPerCycle = Math.max(1, domSide.technicalActionsCount);
      ocraComp.cycleDurationSec = winSec;
      ocraComp.ffRepetitiveness =
        domSide.technicalActionsPerMin > 55
          ? 0.3
          : domSide.technicalActionsPerMin > 42
            ? 0.5
            : domSide.technicalActionsPerMin > 32
              ? 0.7
              : domSide.technicalActionsPerMin > 24
                ? 0.9
                : 1.0;
      ocraComp.feStereotypy =
        domSide.ocraStereotypyScore === 3
          ? 0.7
          : domSide.ocraStereotypyScore === 1.5
            ? 0.85
            : 1.0;
    } else if (targetMethod === MethodId.JSI) {
      const jsi = newTab.payloads[MethodId.JSI];
      const cyclesDom = Math.max(1, domSide.cyclesCount);
      const meanCycleSec = Number((deduction.windowDurationSec / cyclesDom).toFixed(2));
      jsi.cycleDurationSec = Math.max(1, meanCycleSec);
      jsi.effortDurationSec = Number(
        Math.max(0.3, (domSide.activeDutyPct / 100) * jsi.cycleDurationSec).toFixed(2),
      );
      jsi.epmEffortsScore = domSide.jsiEpmScore;
      jsi.deDurationScore = domSide.jsiDeScore;
      jsi.autoComputeCycleScores = true;
    } else if (targetMethod === MethodId.NAM_295) {
      const nam = newTab.payloads[MethodId.NAM_295];
      nam.right = {
        effortsCount: deduction.right.count,
        observationPeriodSec: Number(deduction.windowDurationSec.toFixed(1)),
        effortTimeSec: Number(
          ((deduction.right.activeDutyPct / 100) * deduction.windowDurationSec).toFixed(1),
        ),
        borgPeakForce: borgForceInput,
      };
      nam.left = {
        effortsCount: deduction.left.count,
        observationPeriodSec: Number(deduction.windowDurationSec.toFixed(1)),
        effortTimeSec: Number(
          ((deduction.left.activeDutyPct / 100) * deduction.windowDurationSec).toFixed(1),
        ),
        borgPeakForce: Math.max(0.5, Number((borgForceInput * 0.8).toFixed(1))),
      };
    }

    const snapUrl = captureAnnotatedSnapshotDataUrl();
    if (snapUrl) {
      const photo: StudyPhoto = {
        id: `photo-hand-rep-${Date.now()}`,
        name: 'Conteo cinemático de manos (21 puntos)',
        dataUrl: snapUrl,
        annotatedDataUrl: snapUrl,
        caption: `Ventana ${deduction.windowStartSec.toFixed(1)}s–${deduction.windowEndSec.toFixed(1)}s (${deduction.windowDurationSec.toFixed(1)}s) · Mano Der: ${deduction.right.count} mov (${deduction.right.ratePerMin} mov/min, ${deduction.right.technicalActionsPerMin} ATA/min) · Mano Izq: ${deduction.left.count} mov (${deduction.left.ratePerMin} mov/min, ${deduction.left.technicalActionsPerMin} ATA/min).`,
        annotations: [],
      };
      newTab.photos = [photo];
    }

    newTab.instrumentsUsed =
      'Rastreo óptico de manos por visión artificial (21 articulaciones palmares y falanges) con verificación cronométrica cuadro a cuadro';
    newTab.evaluatorObservations =
      `Deducción centrada en el movimiento de las manos sobre ventana observada de ${deduction.windowDurationSec.toFixed(2)} s (${rawTrace.sourceLabel}). ` +
      `Mano Derecha: ${deduction.right.cyclesCount} ciclos repetitivos (${deduction.right.cyclesPerMin} rep/min) / ${deduction.right.technicalActionsCount} acciones técnicas (${deduction.right.technicalActionsPerMin} ATA/min), tiempo activo ${deduction.right.activeDutyPct}%. ` +
      `Mano Izquierda: ${deduction.left.cyclesCount} ciclos repetitivos (${deduction.left.cyclesPerMin} rep/min) / ${deduction.left.technicalActionsCount} acciones técnicas (${deduction.left.technicalActionsPerMin} ATA/min), tiempo activo ${deduction.left.activeDutyPct}%.`;

    const evalRes = evaluateStudyTab(newTab);
    newTab.implementationDeadline = evalRes.recommendedDeadline;

    onAddRepetitionTabToStudy(newTab);
    setSentConfirmation(
      `Pestaña "${newTab.tabLabel}" incorporada al Estudio Multipestaña (${evalRes.primaryScoreText}).`,
    );
  };

  const hasManualEdits =
    manualAdjustments.suppressedEventIds.length > 0 ||
    manualAdjustments.addedEvents.length > 0;

  return (
    <div className="space-y-4">
      {/* CABECERA DE INSTRUMENTO */}
      <div className="bg-white border border-slate-300 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Hand className="w-4 h-4 text-rose-600 shrink-0" />
            <h1 className="text-base font-bold text-slate-900 tracking-tight">
              Deducción de Movimientos Repetitivos · Foco en Manos
            </h1>
          </div>
          <p className="text-xs text-slate-600 mt-0.5">
            Conteo cinemático independiente de Mano Derecha e Izquierda (21 puntos palmares y digitales + filtro anti-vibración de cámara)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="inline-flex items-center rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700">
            <span className="mr-1.5 text-slate-500">Muestreo:</span>
            <select
              value={targetScanFps}
              onChange={(e) => setTargetScanFps(Number(e.target.value) as 12 | 15 | 20 | 24)}
              disabled={isScanning}
              className="bg-transparent font-mono font-semibold text-slate-900 focus:outline-none cursor-pointer tabular-nums"
              title="Fotogramas por segundo analizados sobre las manos"
            >
              <option value={12}>12 fps</option>
              <option value={15}>15 fps</option>
              <option value={20}>20 fps</option>
              <option value={24}>24 fps (máx.)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isScanning}
            className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Subir Vídeo PC</span>
          </button>

          {uploadedFileRef && (
            <button
              type="button"
              onClick={handleReanalyze}
              disabled={isScanning}
              className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-800 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              title="Re-ejecutar el rastreo óptico de manos desde cero sobre el vídeo cargado"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              <span>Re-analizar</span>
            </button>
          )}

          <button
            type="button"
            onClick={onBackToEvaluator}
            className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Volver al Estudio</span>
          </button>
        </div>
      </div>

      {/* BARRA DE PROGRESO O ERROR DE ESCANEO */}
      {isScanning && (
        <div className="bg-slate-900 text-white border border-slate-800 rounded-lg px-4 py-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-200">{scanStatusMsg}</span>
            <span className="font-mono font-bold text-sky-400 tabular-nums">{scanProgressPct}%</span>
          </div>
          <progress
            value={scanProgressPct}
            max={100}
            className="w-full h-2 rounded-full overflow-hidden accent-sky-500 [&::-webkit-progress-bar]:bg-slate-800 [&::-webkit-progress-value]:bg-sky-500 [&::-moz-progress-bar]:bg-sky-500"
          />
        </div>
      )}

      {scanError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-red-900">
          <span>{scanError}</span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1 rounded border border-red-300 bg-white hover:bg-red-100 font-semibold text-red-800 cursor-pointer"
          >
            Probar otro vídeo
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* COLUMNA IZQUIERDA (7 cols): VISOR CON ESQUELETO DE MANOS + OSCILOGRAMA INTERACTIVO */}
        <div className="lg:col-span-7 space-y-3">
          {/* Visor de vídeo persistente (misma posición en el árbol React para evitar doble decodificación) */}
          <div className="bg-white border border-slate-300 rounded-lg overflow-hidden">
            <div className="px-3.5 py-2 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs">
              {rawTrace ? (
                <>
                  <div className="flex items-center gap-1.5 min-w-0 text-slate-700 truncate">
                    <span className="font-semibold text-slate-900 truncate">
                      {rawTrace.sourceLabel}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-mono tabular-nums text-slate-600">
                      {rawTrace.durationSec.toFixed(1)}s @ {rawTrace.sampledFps} fps
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-mono tabular-nums text-slate-600">
                      Rastreo D:{rawTrace.trackedCoverageRightPct ?? rawTrace.hand21CoverageRightPct}% I:{rawTrace.trackedCoverageLeftPct ?? rawTrace.hand21CoverageLeftPct}% (21-pts D:{rawTrace.hand21CoverageRightPct}% I:{rawTrace.hand21CoverageLeftPct}%)
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setParams((prev) => ({ ...prev, swapHands: !prev.swapHands }))
                      }
                      className={`px-2 py-1 rounded border text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                        params.swapHands
                          ? 'bg-amber-600 text-white border-amber-700'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                      title="Intercambiar asignación Mano Derecha ↔ Mano Izquierda si el vídeo fue grabado en modo espejo o cenital"
                    >
                      <ArrowLeftRight className="w-3 h-3" />
                      <span>Der ↔ Izq</span>
                    </button>

                    {!rawTrace.isSyntheticDemo && (
                      <button
                        type="button"
                        onClick={handleLoadCalibratedDemo}
                        className="px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-medium text-slate-700 cursor-pointer"
                        title="Ver señal matemática de referencia para comparar"
                      >
                        Señal Ref.
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <span className="font-semibold text-slate-700">
                  Visor Óptico de Manos (21 puntos palmares y digitales)
                </span>
              )}
            </div>

            <div className="relative w-full aspect-video bg-slate-950 flex items-center justify-center overflow-hidden">
              <video
                ref={videoRef}
                src={videoObjectUrl ?? undefined}
                preload="auto"
                playsInline
                muted
                className={`w-full h-full object-contain ${
                  videoObjectUrl && (isScanning || (rawTrace && !rawTrace.isSyntheticDemo))
                    ? 'block'
                    : 'hidden'
                }`}
              />
              <canvas
                ref={overlayCanvasRef}
                className={`absolute inset-0 w-full h-full pointer-events-none ${
                  rawTrace ? 'block' : 'hidden'
                }`}
              />

              {!rawTrace && !isScanning && (
                <div className="px-6 py-8 text-center space-y-3.5 max-w-md">
                  <div className="w-11 h-11 rounded-lg bg-slate-900 border border-slate-700 text-rose-400 mx-auto flex items-center justify-center">
                    <Hand className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-sm font-bold text-white">
                      Suba un vídeo de la tarea para deducir los movimientos de las manos
                    </h2>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Rastrea por separado Mano Derecha e Izquierda, estabiliza la vibración de cámara y contabiliza ciclos ida-vuelta, acciones técnicas OCRA y pinzas digitales.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Subir Vídeo desde PC</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleLoadCalibratedDemo}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold cursor-pointer transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 text-sky-400" />
                      <span>Probar Señal Calibrada (36 / 18 min)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {rawTrace && (
              <div className="px-3.5 py-2.5 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={togglePlayPause}
                    className="min-h-[34px] px-3 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isPlaying ? 'Pausar' : 'Reproducir'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => jumpToAdjacentEvent(-1)}
                    className="min-h-[34px] px-2 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-medium inline-flex items-center gap-1 cursor-pointer"
                    title="Ir al movimiento de mano anterior"
                  >
                    <SkipBack className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Mov. ant.</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => jumpToAdjacentEvent(1)}
                    className="min-h-[34px] px-2 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-medium inline-flex items-center gap-1 cursor-pointer"
                    title="Saltar al siguiente movimiento de mano detectado"
                  >
                    <span className="hidden sm:inline">Sig. mov.</span>
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>

                  <span className="font-mono font-semibold text-slate-800 tabular-nums ml-1">
                    {formatSec(currentTimeSec)} / {formatSec(rawTrace.durationSec)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="inline-flex rounded-md border border-slate-300 overflow-hidden">
                    {([0.25, 0.5, 1] as const).map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => setPlaybackRate(spd)}
                        className={`px-2 py-1 text-[11px] font-mono font-semibold cursor-pointer tabular-nums ${
                          playbackRate === spd
                            ? 'bg-sky-600 text-white'
                            : 'bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {spd}×
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowSkeleton21((v) => !v)}
                    className={`px-2 py-1 rounded border text-[11px] font-medium cursor-pointer ${
                      showSkeleton21
                        ? 'bg-sky-50 text-sky-900 border-sky-300'
                        : 'bg-white text-slate-600 border-slate-300'
                    }`}
                  >
                    21-pts
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowTrails((v) => !v)}
                    className={`px-2 py-1 rounded border text-[11px] font-medium cursor-pointer ${
                      showTrails
                        ? 'bg-sky-50 text-sky-900 border-sky-300'
                        : 'bg-white text-slate-600 border-slate-300'
                    }`}
                  >
                    Estela
                  </button>
                </div>
              </div>
            )}
            </div>

          {rawTrace &&
            !rawTrace.isSyntheticDemo &&
            ((rawTrace.estimatedHandSizePx !== undefined && rawTrace.estimatedHandSizePx < 62) ||
              rawTrace.isLateralProfile ||
              rawTrace.durationSec < 8) && (
              <div className="bg-amber-50/90 border border-amber-300 rounded-lg px-3.5 py-2.5 space-y-2 text-xs text-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-amber-950">
                    Diagnóstico Óptico del Encuadre
                    <span className="font-mono font-normal text-amber-900 ml-2 tabular-nums">
                      {rawTrace.estimatedHandSizePx !== undefined
                        ? `Mano ~${rawTrace.estimatedHandSizePx} px`
                        : ''}
                      {rawTrace.isLateralProfile ? ' · Perfil lateral 90°' : ''}
                      {rawTrace.roiZoomFramesPct
                        ? ` · Auto-Zoom IA ${rawTrace.roiZoomFramesPct}%`
                        : ''}
                      {rawTrace.durationSec < 8
                        ? ` · Muestra corta (${rawTrace.durationSec.toFixed(1)}s)`
                        : ''}
                    </span>
                  </div>

                  {(params.countingMode !== 'acciones_tecnicas' || params.minExcursionCm > 2.0) && (
                    <button
                      type="button"
                      onClick={() =>
                        setParams((prev) => ({
                          ...prev,
                          countingMode: 'acciones_tecnicas',
                          minExcursionCm: Math.min(prev.minExcursionCm, 1.8),
                          activeSpeedThresholdCmS: Math.min(prev.activeSpeedThresholdCmS, 4.5),
                        }))
                      }
                      className="px-2.5 py-1 rounded-md bg-amber-800 hover:bg-amber-900 text-white text-[11px] font-semibold cursor-pointer transition-colors shrink-0"
                    >
                      Activar modo Banco / Toma Lejana (Acciones OCRA · 1.8 cm)
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-slate-700 leading-relaxed">
                  {rawTrace.estimatedHandSizePx !== undefined && rawTrace.estimatedHandSizePx < 62
                    ? 'Toma de cuerpo entero o lejana detectada: el motor activó recorte dinámico Auto-Zoom IA sobre muñecas. '
                    : ''}
                  {rawTrace.isLateralProfile
                    ? 'En perfil estricto a 90°, el antebrazo cercano puede ocultar parcialmente la mano opuesta. '
                    : ''}
                  {rawTrace.durationSec < 8
                    ? 'En clips breves con alcances entre distintas estaciones de mesa (sin retorno cerrado A→B→A), use «Acciones Técnicas (OCRA)» para contabilizar cada alcance. '
                    : ''}
                  <span className="font-medium text-slate-900">
                    Requisito óptimo para precisión máxima (pinza digital): encuadre cintura-mesa a 30°–45° oblicuo o frontal (manos ≥ 75 px) durante ≥ 10–15 s continuos.
                  </span>
                </p>
              </div>
            )}

          {rawTrace && (
            <>
              {/* Oscilograma interactivo bimanual */}
            <div className="bg-white border border-slate-300 rounded-lg p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-xs font-bold text-slate-900">
                    Oscilograma de Excursión de Manos y Marcas de Movimiento
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Azul: Mano Derecha · Ámbar: Mano Izquierda · Línea punteada: umbral mínimo ({params.minExcursionCm.toFixed(1)} cm)
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-[11px]">
                    <button
                      type="button"
                      onClick={() => setHandFocus('both')}
                      className={`px-2 py-1 font-semibold cursor-pointer ${
                        handFocus === 'both'
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Ambas
                    </button>
                    <button
                      type="button"
                      onClick={() => setHandFocus('right')}
                      className={`px-2 py-1 font-semibold cursor-pointer ${
                        handFocus === 'right'
                          ? 'bg-sky-600 text-white'
                          : 'bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Der
                    </button>
                    <button
                      type="button"
                      onClick={() => setHandFocus('left')}
                      className={`px-2 py-1 font-semibold cursor-pointer ${
                        handFocus === 'left'
                          ? 'bg-amber-600 text-white'
                          : 'bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Izq
                    </button>
                  </div>
                </div>
              </div>

              <div className="w-full">
                <canvas
                  ref={oscillogramCanvasRef}
                  onClick={handleOscillogramClick}
                  className="w-full h-[186px] block cursor-crosshair rounded border border-slate-200"
                />
              </div>

              {/* Barra de herramienta de clic sobre el oscilograma */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-slate-500 font-medium">Al hacer clic en curva:</span>
                  <button
                    type="button"
                    onClick={() => setTimelineTool('scrub')}
                    className={`px-2 py-1 rounded border font-semibold cursor-pointer ${
                      timelineTool === 'scrub'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    Ir al fotograma
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimelineTool('edit_right')}
                    className={`px-2 py-1 rounded border font-semibold inline-flex items-center gap-1 cursor-pointer ${
                      timelineTool === 'edit_right'
                        ? 'bg-sky-600 text-white border-sky-700'
                        : 'bg-white text-sky-800 border-slate-300 hover:bg-sky-50'
                    }`}
                  >
                    <Plus className="w-3 h-3" />
                    <span>Agregar / Quitar Der</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimelineTool('edit_left')}
                    className={`px-2 py-1 rounded border font-semibold inline-flex items-center gap-1 cursor-pointer ${
                      timelineTool === 'edit_left'
                        ? 'bg-amber-600 text-white border-amber-700'
                        : 'bg-white text-amber-800 border-slate-300 hover:bg-amber-50'
                    }`}
                  >
                    <Plus className="w-3 h-3" />
                    <span>Agregar / Quitar Izq</span>
                  </button>
                </div>

                {hasManualEdits && (
                  <button
                    type="button"
                    onClick={() =>
                      setManualAdjustments({ suppressedEventIds: [], addedEvents: [] })
                    }
                    className="px-2 py-1 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restaurar conteo automático</span>
                  </button>
                )}
              </div>
            </div>

            {/* Registro cronológico auditable de cada movimiento detectado */}
            {deduction && (
              <div className="bg-white border border-slate-300 rounded-lg overflow-hidden">
                <div className="px-3.5 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900">
                    Detalle Cronológico de Movimientos Contados ({combinedSortedEvents.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    disabled={combinedSortedEvents.length === 0}
                    className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 text-[11px] font-semibold text-slate-800 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    <span>Exportar CSV</span>
                  </button>
                </div>

                {combinedSortedEvents.length === 0 ? (
                  <div className="p-4 text-xs text-slate-600 text-center space-y-2">
                    <p>
                      No se registraron movimientos que superen el umbral actual ({params.minExcursionCm.toFixed(1)} cm) en la ventana seleccionada (excursión máxima medida: Der {deduction.right.maxExcursionCm.toFixed(1)} cm · Izq {deduction.left.maxExcursionCm.toFixed(1)} cm).
                    </p>
                    {(deduction.right.subThresholdSuggestedCm !== null ||
                      deduction.left.subThresholdSuggestedCm !== null) && (
                      <button
                        type="button"
                        onClick={() => {
                          const cands = [
                            deduction.right.subThresholdSuggestedCm,
                            deduction.left.subThresholdSuggestedCm,
                          ].filter((v): v is number => v !== null);
                          if (cands.length > 0) {
                            setParams((prev) => ({
                              ...prev,
                              minExcursionCm: Math.min(...cands),
                            }));
                          }
                        }}
                        className="px-3 py-1.5 rounded-md bg-sky-600 hover:bg-sky-700 text-white font-semibold cursor-pointer transition-colors"
                      >
                        Ajustar umbral a micro-movimientos detectados (
                        {Math.min(
                          ...[
                            deduction.right.subThresholdSuggestedCm,
                            deduction.left.subThresholdSuggestedCm,
                          ].filter((v): v is number => v !== null),
                        ).toFixed(1)}{' '}
                        cm)
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="max-h-[196px] overflow-y-auto divide-y divide-slate-100">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-600 sticky top-0">
                        <tr>
                          <th className="py-1.5 px-3 text-left font-semibold">#</th>
                          <th className="py-1.5 px-3 text-left font-semibold">Mano</th>
                          <th className="py-1.5 px-3 text-right font-semibold">Instante</th>
                          <th className="py-1.5 px-3 text-left font-semibold">Tipo</th>
                          <th className="py-1.5 px-3 text-right font-semibold">Excursión</th>
                          <th className="py-1.5 px-3 text-right font-semibold">Vel. pico</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {combinedSortedEvents.map((ev, idx) => {
                          const isNear = Math.abs(ev.timeSec - currentTimeSec) <= 0.16;
                          return (
                            <tr
                              key={ev.id}
                              onClick={() => scrubToTime(ev.timeSec)}
                              className={`cursor-pointer transition-colors ${
                                isNear ? 'bg-sky-50' : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="py-1.5 px-3 font-mono text-slate-500 tabular-nums">
                                {idx + 1}
                              </td>
                              <td className="py-1.5 px-3 font-semibold">
                                <span
                                  className={
                                    ev.hand === 'right' ? 'text-sky-700' : 'text-amber-700'
                                  }
                                >
                                  {ev.hand === 'right' ? 'Derecha' : 'Izquierda'}
                                </span>
                              </td>
                              <td className="py-1.5 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                                {ev.timeSec.toFixed(2)}s
                              </td>
                              <td className="py-1.5 px-3 text-slate-700">{kindLabel(ev.kind)}</td>
                              <td className="py-1.5 px-3 text-right font-mono text-slate-800 tabular-nums">
                                {ev.amplitudeCm.toFixed(1)} cm
                              </td>
                              <td className="py-1.5 px-3 text-right font-mono text-slate-600 tabular-nums">
                                {ev.peakSpeedCmPerSec.toFixed(0)} cm/s
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            </>
          )}
        </div>

        {/* COLUMNA DERECHA (5 cols): CONTADORES DIGITALES, CALIBRACIÓN EN VIVO Y ENVÍO AL ESTUDIO */}
        {deduction && rawTrace ? (
            <div className="lg:col-span-5 space-y-3">
              {/* Panel de Instrumento Digital Bimanual */}
              <div className="bg-slate-900 text-white border border-slate-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-300">
                    Criterio de Conteo sobre las Manos
                  </span>
                  <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                    Ventana: {deduction.windowDurationSec.toFixed(1)}s · Simult.: {deduction.simultaneityPct}%
                  </span>
                </div>

                {/* Selector de criterio: Ciclos completos vs Acciones técnicas OCRA */}
                <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 rounded-md border border-slate-800">
                  <button
                    type="button"
                    onClick={() =>
                      setParams((prev) => ({
                        ...prev,
                        countingMode: 'repeticiones_ciclicas' as HandCountingMode,
                      }))
                    }
                    className={`py-1.5 px-2 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                      params.countingMode === 'repeticiones_ciclicas'
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Ciclos de Mano (Ida-Vuelta)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setParams((prev) => ({
                        ...prev,
                        countingMode: 'acciones_tecnicas' as HandCountingMode,
                      }))
                    }
                    className={`py-1.5 px-2 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                      params.countingMode === 'acciones_tecnicas'
                        ? 'bg-rose-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Acciones Técnicas (OCRA)
                  </button>
                </div>

                {/* Lectura principal Mano Derecha vs Mano Izquierda */}
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Mano Derecha */}
                  <div className="bg-slate-950/90 border border-sky-900/80 rounded-md p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-sky-400">Mano Derecha</span>
                      <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                        Activa {deduction.right.activeDutyPct}%
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-bold font-mono text-white tabular-nums">
                        {deduction.right.count}
                      </span>
                      <span className="text-xs text-slate-400">mov</span>
                    </div>
                    <div className="text-sm font-mono font-bold text-sky-300 tabular-nums">
                      {deduction.right.ratePerMin.toFixed(1)} mov/min
                    </div>
                    <div className="pt-1 border-t border-slate-800 text-[11px] text-slate-400 space-y-0.5 font-mono tabular-nums">
                      <div>Ciclos: {deduction.right.cyclesCount} ({deduction.right.cyclesPerMin}/min)</div>
                      <div>ATA OCRA: {deduction.right.technicalActionsCount} ({deduction.right.technicalActionsPerMin}/min)</div>
                      <div>
                        Máx: {deduction.right.maxExcursionCm.toFixed(1)} cm · Rastreo: {deduction.right.detectedCoveragePct}%
                      </div>
                      <div>
                        Cadencia:{' '}
                        {deduction.right.meanIntervalSec > 0
                          ? `1 c/${deduction.right.meanIntervalSec}s`
                          : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Mano Izquierda */}
                  <div className="bg-slate-950/90 border border-amber-900/80 rounded-md p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-amber-400">Mano Izquierda</span>
                      <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                        Activa {deduction.left.activeDutyPct}%
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-bold font-mono text-white tabular-nums">
                        {deduction.left.count}
                      </span>
                      <span className="text-xs text-slate-400">mov</span>
                    </div>
                    <div className="text-sm font-mono font-bold text-amber-300 tabular-nums">
                      {deduction.left.ratePerMin.toFixed(1)} mov/min
                    </div>
                    <div className="pt-1 border-t border-slate-800 text-[11px] text-slate-400 space-y-0.5 font-mono tabular-nums">
                      <div>Ciclos: {deduction.left.cyclesCount} ({deduction.left.cyclesPerMin}/min)</div>
                      <div>ATA OCRA: {deduction.left.technicalActionsCount} ({deduction.left.technicalActionsPerMin}/min)</div>
                      <div>
                        Máx: {deduction.left.maxExcursionCm.toFixed(1)} cm · Rastreo: {deduction.left.detectedCoveragePct}%
                      </div>
                      <div>
                        Cadencia:{' '}
                        {deduction.left.meanIntervalSec > 0
                          ? `1 c/${deduction.left.meanIntervalSec}s`
                          : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Calibración instantánea de ventana y sensibilidad */}
              <div className="bg-white border border-slate-300 rounded-lg p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold text-slate-900">
                    Calibración Cinemática de Manos (Recálculo Instantáneo)
                  </h2>
                  <button
                    type="button"
                    onClick={() =>
                      setParams((prev) => ({
                        ...prev,
                        windowStartSec: 0,
                        windowEndSec: Number(rawTrace.durationSec.toFixed(2)),
                        minExcursionCm: 3.0,
                        minIntervalMs: 280,
                        activeSpeedThresholdCmS: 6.5,
                        includeFingerPinch: false,
                        pinchProminenceRatio: 0.28,
                      }))
                    }
                    className="text-[11px] text-sky-700 hover:text-sky-900 font-semibold cursor-pointer"
                  >
                    Valores base
                  </button>
                </div>

                {/* Recorte de ventana del ciclo */}
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-600 font-medium">Inicio ventana (s)</label>
                      <button
                        type="button"
                        onClick={() =>
                          setParams((prev) => ({
                            ...prev,
                            windowStartSec: Number(
                              Math.min(currentTimeSec, prev.windowEndSec - 0.4).toFixed(2),
                            ),
                          }))
                        }
                        className="text-[10px] text-sky-700 hover:underline font-semibold cursor-pointer"
                      >
                        Usar actual
                      </button>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={Math.max(0, params.windowEndSec - 0.3)}
                      step={0.1}
                      value={params.windowStartSec}
                      onChange={(e) =>
                        setParams((prev) => ({
                          ...prev,
                          windowStartSec: clamp(
                            Number(e.target.value),
                            0,
                            Math.max(0, prev.windowEndSec - 0.3),
                          ),
                        }))
                      }
                      className="w-full px-2.5 py-1.5 rounded border border-slate-300 font-mono text-xs tabular-nums"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-600 font-medium">Fin ventana (s)</label>
                      <button
                        type="button"
                        onClick={() =>
                          setParams((prev) => ({
                            ...prev,
                            windowEndSec: Number(
                              Math.max(currentTimeSec, prev.windowStartSec + 0.4).toFixed(2),
                            ),
                          }))
                        }
                        className="text-[10px] text-sky-700 hover:underline font-semibold cursor-pointer"
                      >
                        Usar actual
                      </button>
                    </div>
                    <input
                      type="number"
                      min={params.windowStartSec + 0.3}
                      max={rawTrace.durationSec}
                      step={0.1}
                      value={params.windowEndSec}
                      onChange={(e) =>
                        setParams((prev) => ({
                          ...prev,
                          windowEndSec: clamp(
                            Number(e.target.value),
                            prev.windowStartSec + 0.3,
                            rawTrace.durationSec,
                          ),
                        }))
                      }
                      className="w-full px-2.5 py-1.5 rounded border border-slate-300 font-mono text-xs tabular-nums"
                    />
                  </div>
                </div>

                {/* Desplazamiento mínimo de la mano */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-700 font-medium">
                      Excursión mínima de mano para contar
                    </span>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {params.minExcursionCm.toFixed(1)} cm
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1.0}
                    max={22}
                    step={0.5}
                    value={params.minExcursionCm}
                    onChange={(e) =>
                      setParams((prev) => ({
                        ...prev,
                        minExcursionCm: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-sky-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>1 cm (muñeca/dedos)</span>
                    <span>3 cm (mano estándar)</span>
                    <span>20 cm (alcance amplio)</span>
                  </div>
                </div>

                {/* Separación temporal mínima */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-700 font-medium">
                      Tiempo mínimo entre repeticiones
                    </span>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {params.minIntervalMs} ms
                    </span>
                  </div>
                  <input
                    type="range"
                    min={180}
                    max={1400}
                    step={20}
                    value={params.minIntervalMs}
                    onChange={(e) =>
                      setParams((prev) => ({
                        ...prev,
                        minIntervalMs: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-sky-600 cursor-pointer"
                  />
                </div>

                {/* Detección digital de pinza pulgar-índice */}
                <div className="pt-1 border-t border-slate-200 space-y-2">
                  <label className="flex items-center justify-between gap-2 text-xs cursor-pointer">
                    <span className="text-slate-700 font-medium">
                      Sumar cierres de pinza digital (pulgar-índice) en el lugar
                    </span>
                    <input
                      type="checkbox"
                      checked={params.includeFingerPinch}
                      onChange={(e) =>
                        setParams((prev) => ({
                          ...prev,
                          includeFingerPinch: e.target.checked,
                        }))
                      }
                      className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                    />
                  </label>

                  {params.includeFingerPinch && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-600">Umbral de cierre digital</span>
                        <span className="font-mono font-semibold text-slate-800 tabular-nums">
                          {Math.round(params.pinchProminenceRatio * 100)}% apertura palmar
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.15}
                        max={0.5}
                        step={0.02}
                        value={params.pinchProminenceRatio}
                        onChange={(e) =>
                          setParams((prev) => ({
                            ...prev,
                            pinchProminenceRatio: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-violet-600 cursor-pointer"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Traducción directa a métodos ergonómicos y envío al Estudio */}
              <div className="bg-white border border-slate-300 rounded-lg p-3.5 space-y-3">
                <h2 className="text-xs font-bold text-slate-900">
                  Parámetros Deducidos para Métodos de Repetitividad
                </h2>

                <div className="border border-slate-200 rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-1.5 px-2.5 text-left font-semibold">Método / Factor</th>
                        <th className="py-1.5 px-2.5 text-right font-semibold text-sky-800">Mano Der</th>
                        <th className="py-1.5 px-2.5 text-right font-semibold text-amber-800">Mano Izq</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                      <tr>
                        <td className="py-1.5 px-2.5 font-sans text-slate-700">
                          OCRA Check List · Frec. Dinámica (FF)
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-semibold text-slate-900">
                          {deduction.right.ocraDynamicFreqFactor} pts
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-semibold text-slate-900">
                          {deduction.left.ocraDynamicFreqFactor} pts
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-2.5 font-sans text-slate-700">
                          OCRA Check List · Estereotipia
                        </td>
                        <td className="py-1.5 px-2.5 text-right text-slate-800">
                          {deduction.right.ocraStereotypyScore} pts
                        </td>
                        <td className="py-1.5 px-2.5 text-right text-slate-800">
                          {deduction.left.ocraStereotypyScore} pts
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-2.5 font-sans text-slate-700">
                          Job Strain Index · EPM / DE
                        </td>
                        <td className="py-1.5 px-2.5 text-right text-slate-800">
                          EPM {deduction.right.jsiEpmScore} · DE {deduction.right.jsiDeScore}
                        </td>
                        <td className="py-1.5 px-2.5 text-right text-slate-800">
                          EPM {deduction.left.jsiEpmScore} · DE {deduction.left.jsiDeScore}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-2.5 font-sans text-slate-700">
                          NAM Res. 295/03 · Nivel Actividad
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-semibold text-slate-900">
                          NAM {deduction.right.namHalScore}
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-semibold text-slate-900">
                          NAM {deduction.left.namHalScore}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Formulario compacto de envío al estudio multipestaña */}
                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-slate-600 font-medium">Método destino en el Estudio</label>
                      <select
                        value={targetMethod}
                        onChange={(e) => setTargetMethod(e.target.value as TargetRepetitiveMethod)}
                        className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white font-semibold text-slate-900 cursor-pointer"
                      >
                        <option value={MethodId.OCRA_CHECKLIST}>OCRA Check List (Bilateral)</option>
                        <option value={MethodId.OCRA_COMPLETO}>OCRA Análisis Completo</option>
                        <option value={MethodId.JSI}>Job Strain Index (JSI)</option>
                        <option value={MethodId.NAM_295}>NAM Resolución 295/03</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-slate-600 font-medium">Fuerza Borg (0–10)</label>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        step={0.5}
                        value={borgForceInput}
                        onChange={(e) =>
                          setBorgForceInput(clamp(Number(e.target.value), 0, 10))
                        }
                        className="w-full px-2.5 py-1.5 rounded border border-slate-300 font-mono text-xs tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="space-y-1 text-xs">
                    <label className="text-slate-600 font-medium">Tarea evaluada</label>
                    <input
                      type="text"
                      value={taskNameInput}
                      onChange={(e) => setTaskNameInput(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs text-slate-900"
                      placeholder="Ej.: Ensamble y empaque manual de piezas"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSendToStudy}
                    className="w-full min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer transition-colors"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Enviar Conteo de Manos al Estudio Multipestaña</span>
                  </button>

                  {sentConfirmation && (
                    <div className="px-3 py-2 rounded border border-emerald-200 bg-emerald-50 text-[11px] font-medium text-emerald-900">
                      {sentConfirmation}
                    </div>
                  )}
                </div>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-5 space-y-3">
            <div className="bg-slate-900 text-white border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  Contador Bimanual en Espera
                </span>
                <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                  0.0s
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-slate-950/90 border border-slate-800 rounded-md p-3 space-y-1">
                  <div className="text-xs font-semibold text-sky-400">Mano Derecha</div>
                  <div className="text-2xl font-bold font-mono text-slate-500 tabular-nums">—</div>
                  <div className="text-[11px] font-mono text-slate-500 tabular-nums">0.0 mov/min</div>
                </div>
                <div className="bg-slate-950/90 border border-slate-800 rounded-md p-3 space-y-1">
                  <div className="text-xs font-semibold text-amber-400">Mano Izquierda</div>
                  <div className="text-2xl font-bold font-mono text-slate-500 tabular-nums">—</div>
                  <div className="text-[11px] font-mono text-slate-500 tabular-nums">0.0 mov/min</div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 text-xs text-slate-400 leading-relaxed space-y-1.5">
                <p>
                  1. Suba un vídeo de trabajo desde su PC para rastrear las 21 articulaciones de ambas manos.
                </p>
                <p>
                  2. Ajuste la ventana del ciclo y el umbral mínimo en centímetros sin volver a procesar el vídeo.
                </p>
                <p>
                  3. Envíe el conteo deducido directamente a OCRA Check List, OCRA Completo, JSI o NAM Res. 295/03.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

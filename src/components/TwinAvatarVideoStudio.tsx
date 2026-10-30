import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  Film,
  Pause,
  Pin,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import {
  AngleAnnotation,
  GeneralStudyData,
  MethodId,
  StudyPhoto,
  StudyTab,
} from '../types/ergonomics';
import {
  CameraPreset,
  Panel3DSpec,
  PosturePose3D,
  ScenePropType,
} from '../types/figurePlan';
import {
  CameraOrbitOverride,
  DEFAULT_ORBIT_OVERRIDE,
  ensureAvatarGlbLoaded,
  renderInteractivePose3DToCanvas,
  renderMocapTwinFrameToCanvas,
  subscribeAvatarGlbLoaded,
} from '../utils/biomech3dRenderer';
import {
  MocapCorrectionPin,
  MocapFrameSample,
  MocapTimelineResult,
  drawDetectedSkeletonOverlay,
  extractTrueMocapTimeline,
  interpolateMocapFrameAtTime,
} from '../utils/mocapRetargeter';
import {
  CENEA_SAMPLE_VIDEOS_CATALOG,
  CeneaSampleCaseId,
  buildCeneaSampleFrameSpec,
} from '../utils/ceneaSampleVideosCatalog';
import { makeNeutralPose } from '../utils/figurePlanCatalog';
import { createNewStudyTab } from '../utils/defaults';
import { renderAnnotatedOperatorFrameJpeg } from '../utils/methodAvatarReportHelper';

export interface TwinAvatarVideoStudioProps {
  general: GeneralStudyData;
  onBackToEvaluator: () => void;
  onEmitTwinFramesToStudy?: (tab: StudyTab) => void;
}

type ExportVideoLayout = 'side_by_side' | 'avatar_only';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const str = String(reader.result || '');
      const commaIdx = str.indexOf(',');
      resolve(commaIdx >= 0 ? str.slice(commaIdx + 1) : str);
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo desde la PC.'));
    reader.readAsDataURL(file);
  });
}

function seekVideoFrame(video: HTMLVideoElement, tSec: number): Promise<void> {
  return new Promise((resolve) => {
    const clamped = Math.max(0, Math.min(Math.max(0, (video.duration || 1) - 0.03), tSec));
    if (Math.abs(video.currentTime - clamped) < 0.012 && video.readyState >= 2) {
      resolve();
      return;
    }
    const timer = window.setTimeout(() => {
      video.onseeked = null;
      resolve();
    }, 350);
    video.onseeked = () => {
      window.clearTimeout(timer);
      video.onseeked = null;
      resolve();
    };
    try {
      video.currentTime = clamped;
    } catch {
      window.clearTimeout(timer);
      resolve();
    }
  });
}

function pickSupportedRecorderMime(): { mimeType: string; ext: 'mp4' | 'webm' } {
  if (typeof MediaRecorder === 'undefined') {
    return { mimeType: '', ext: 'webm' };
  }
  const mp4Candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/mp4',
  ];
  for (const c of mp4Candidates) {
    if (MediaRecorder.isTypeSupported(c)) {
      return { mimeType: c, ext: 'mp4' };
    }
  }
  const webmCandidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const c of webmCandidates) {
    if (MediaRecorder.isTypeSupported(c)) {
      return { mimeType: c, ext: 'webm' };
    }
  }
  return { mimeType: '', ext: 'webm' };
}

function computeContainedVideoRect(
  containerW: number,
  containerH: number,
  videoW: number,
  videoH: number,
): { x: number; y: number; w: number; h: number } {
  if (videoW <= 0 || videoH <= 0) {
    return { x: 0, y: 0, w: containerW, h: containerH };
  }
  const scale = Math.min(containerW / videoW, containerH / videoH);
  const w = videoW * scale;
  const h = videoH * scale;
  return {
    x: (containerW - w) * 0.5,
    y: (containerH - h) * 0.5,
    w,
    h,
  };
}

export const TwinAvatarVideoStudio: React.FC<TwinAvatarVideoStudioProps> = ({
  general,
  onBackToEvaluator,
  onEmitTwinFramesToStudy,
}) => {
  const [mode, setMode] = useState<'pc_upload' | 'demo_cycle'>('pc_upload');
  const [demoSampleId, setDemoSampleId] = useState<CeneaSampleCaseId>('cenea_mmc_almacen');
  const activeDemoSample = useMemo(
    () =>
      CENEA_SAMPLE_VIDEOS_CATALOG.find((s) => s.id === demoSampleId) ||
      CENEA_SAMPLE_VIDEOS_CATALOG[0],
    [demoSampleId],
  );

  // Vídeo subido desde PC
  const [pcVideoName, setPcVideoName] = useState<string>('');
  const [pcVideoUrl, setPcVideoUrl] = useState<string | null>(null);
  const [videoDurationSec, setVideoDurationSec] = useState<number>(5.0);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Secuencia 3D MoCap Heavy + Filtro 1€
  const [mocapTimeline, setMocapTimeline] = useState<MocapTimelineResult | null>(null);
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [trackingProgressPct, setTrackingProgressPct] = useState<number>(0);
  const [trackingMsg, setTrackingMsg] = useState<string>('');
  const [showVideoSkeletonOverlay, setShowVideoSkeletonOverlay] = useState<boolean>(true);
  const [showAvatarAngleHUD, setShowAvatarAngleHUD] = useState<boolean>(true);
  const [autoAssistSevereOcclusion, setAutoAssistSevereOcclusion] = useState<boolean>(true);

  // Opción C: Pines híbridos de corrección asistida en oclusiones
  const [correctionPins, setCorrectionPins] = useState<MocapCorrectionPin[]>([]);
  const [draftMirrorArm, setDraftMirrorArm] = useState<
    'none' | 'left_from_right' | 'right_from_left'
  >('none');
  const [draftTrunkPitchDeg, setDraftTrunkPitchDeg] = useState<number>(0);
  const [draftRootYawDeg, setDraftRootYawDeg] = useState<number>(0);
  const [draftShoulderRDeg, setDraftShoulderRDeg] = useState<number>(0);
  const [draftElbowRDeg, setDraftElbowRDeg] = useState<number>(0);
  const [draftShoulderLDeg, setDraftShoulderLDeg] = useState<number>(0);
  const [draftElbowLDeg, setDraftElbowLDeg] = useState<number>(0);
  const [draftKneeDeg, setDraftKneeDeg] = useState<number>(0);
  const [draftRadiusSec, setDraftRadiusSec] = useState<number>(0.65);

  // Cámara 3D (por defecto 'frontal' = alineada 1:1 con el eje óptico de la cámara del vídeo)
  const [avatarReady, setAvatarReady] = useState<boolean>(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('frontal');
  const [orbit, setOrbit] = useState<CameraOrbitOverride>(DEFAULT_ORBIT_OVERRIDE);
  const [sceneProp, setSceneProp] = useState<ScenePropType>('none');
  const [propVisibilityMode, setPropVisibilityMode] = useState<'always' | 'hidden' | 'final_photo_only'>('always');
  const [previewFinalPhotoProp, setPreviewFinalPhotoProp] = useState<boolean>(false);
  const [propOffsetX, setPropOffsetX] = useState<number>(0);
  const [propOffsetY, setPropOffsetY] = useState<number>(0);
  const [propOffsetZ, setPropOffsetZ] = useState<number>(0);
  const [propRotYDeg, setPropRotYDeg] = useState<number>(0);
  const [propScale, setPropScale] = useState<number>(1);
  const [shelfBoxOnRack, setShelfBoxOnRack] = useState<boolean>(true);

  // Grabación y descarga del Vídeo Mellizo
  const [exportLayout, setExportLayout] = useState<ExportVideoLayout>('side_by_side');
  const [exportFps, setExportFps] = useState<24 | 30>(24);
  const [includeOverlayInExport, setIncludeOverlayInExport] = useState<boolean>(false);
  const [isRecordingTwin, setIsRecordingTwin] = useState<boolean>(false);
  const [recordingPct, setRecordingPct] = useState<number>(0);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [recordedVideoExt, setRecordedVideoExt] = useState<'mp4' | 'webm'>('webm');
  const [notice, setNotice] = useState<{
    tone: 'info' | 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sourceVideoRef = useRef<HTMLVideoElement | null>(null);
  const videoOverlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const avatarCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragOrbitRef = useRef<{
    startX: number;
    startY: number;
    startOrbit: CameraOrbitOverride;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    ensureAvatarGlbLoaded().then(() => {
      if (mounted) setAvatarReady(true);
    });
    const unsub = subscribeAvatarGlbLoaded(() => {
      if (mounted) setAvatarReady(true);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pcVideoUrl) URL.revokeObjectURL(pcVideoUrl);
    };
  }, [pcVideoUrl]);

  useEffect(() => {
    return () => {
      if (recordedVideoUrl) URL.revokeObjectURL(recordedVideoUrl);
    };
  }, [recordedVideoUrl]);

  const hasDraftAdjustments =
    draftMirrorArm !== 'none' ||
    Math.abs(draftTrunkPitchDeg) > 0.1 ||
    Math.abs(draftRootYawDeg) > 0.1 ||
    Math.abs(draftShoulderRDeg) > 0.1 ||
    Math.abs(draftElbowRDeg) > 0.1 ||
    Math.abs(draftShoulderLDeg) > 0.1 ||
    Math.abs(draftElbowLDeg) > 0.1 ||
    Math.abs(draftKneeDeg) > 0.1;

  // Combina pines guardados + borrador activo (cuando el vídeo está en pausa) para previsualización inmediata
  const effectivePins = useMemo<MocapCorrectionPin[]>(() => {
    if (isPlaying || !hasDraftAdjustments) return correctionPins;
    const previewPin: MocapCorrectionPin = {
      id: '__live_draft__',
      timeSec: currentTimeSec,
      radiusSec: draftRadiusSec,
      mirrorArm: draftMirrorArm,
      trunkPitchOffsetDeg: draftTrunkPitchDeg,
      rootYawOffsetDeg: draftRootYawDeg,
      shoulderROffsetDeg: draftShoulderRDeg,
      elbowROffsetDeg: draftElbowRDeg,
      shoulderLOffsetDeg: draftShoulderLDeg,
      elbowLOffsetDeg: draftElbowLDeg,
      kneeOffsetDeg: draftKneeDeg,
    };
    return [...correctionPins, previewPin];
  }, [
    correctionPins,
    isPlaying,
    hasDraftAdjustments,
    currentTimeSec,
    draftRadiusSec,
    draftMirrorArm,
    draftTrunkPitchDeg,
    draftRootYawDeg,
    draftShoulderRDeg,
    draftElbowRDeg,
    draftShoulderLDeg,
    draftElbowLDeg,
    draftKneeDeg,
  ]);

  const getMocapSampleAtTime = useCallback(
    (tSec: number, pinsOverride?: MocapCorrectionPin[]): MocapFrameSample | null => {
      if (mode !== 'pc_upload' || !mocapTimeline) return null;
      return interpolateMocapFrameAtTime(
        mocapTimeline,
        tSec,
        pinsOverride ?? effectivePins,
        autoAssistSevereOcclusion,
      );
    },
    [mode, mocapTimeline, effectivePins, autoAssistSevereOcclusion],
  );

  const liveEffectiveProp: ScenePropType =
    propVisibilityMode === 'hidden'
      ? 'none'
      : propVisibilityMode === 'final_photo_only' && !previewFinalPhotoProp
        ? 'none'
        : sceneProp;

  const finalPhotoProp: ScenePropType = propVisibilityMode === 'hidden' ? 'none' : sceneProp;

  const propPlacementConfig = useMemo(
    () => ({
      propOffsetX,
      propOffsetY,
      propOffsetZ,
      propRotYDeg,
      propScale,
      loadKg:
        shelfBoxOnRack && (sceneProp === 'cold_room_high_shelf' || sceneProp === 'pallet_jack_rack')
          ? 0
          : undefined,
      loadDetachedPhase:
        shelfBoxOnRack && (sceneProp === 'cold_room_high_shelf' || sceneProp === 'pallet_jack_rack')
          ? ('dest_rest' as const)
          : undefined,
    }),
    [propOffsetX, propOffsetY, propOffsetZ, propRotYDeg, propScale, shelfBoxOnRack, sceneProp],
  );

  // Dibuja un instante exacto tanto en el Avatar 3D como en la capa de esqueleto sobre el vídeo real
  const drawFrameAtTime = useCallback(
    (tSec: number, pinsOverride?: MocapCorrectionPin[]) => {
      if (!avatarCanvasRef.current || isRecordingTwin) return;

      if (mode === 'pc_upload') {
        if (mocapTimeline) {
          const sample = getMocapSampleAtTime(tSec, pinsOverride);
          if (sample) {
            renderMocapTwinFrameToCanvas(sample, avatarCanvasRef.current, 640, 480, orbit, {
              cameraPreset,
              sceneProp: liveEffectiveProp,
              propPlacement: propPlacementConfig,
              showAngleHUD: showAvatarAngleHUD,
              dpiScale: 1.65,
            });

            const ovCanvas = videoOverlayCanvasRef.current;
            const vidEl = sourceVideoRef.current;
            if (ovCanvas) {
              const cw = ovCanvas.clientWidth || 640;
              const ch = ovCanvas.clientHeight || 480;
              const dpr = Math.min(2, window.devicePixelRatio || 1);
              if (
                ovCanvas.width !== Math.round(cw * dpr) ||
                ovCanvas.height !== Math.round(ch * dpr)
              ) {
                ovCanvas.width = Math.round(cw * dpr);
                ovCanvas.height = Math.round(ch * dpr);
              }
              const octx = ovCanvas.getContext('2d');
              if (octx) {
                octx.setTransform(dpr, 0, 0, dpr, 0, 0);
                octx.clearRect(0, 0, cw, ch);
                if (showVideoSkeletonOverlay && vidEl && vidEl.videoWidth > 0) {
                  const vRect = computeContainedVideoRect(
                    cw,
                    ch,
                    vidEl.videoWidth,
                    vidEl.videoHeight,
                  );
                  drawDetectedSkeletonOverlay(octx, sample, vRect);
                }
              }
            }
            return;
          }
        }

        // En modo Vídeo Subido desde PC sin secuencia aún: mostrar postura neutra estática (jamás simular el ciclo de levantamiento de Video IA)
        const ovCanvas = videoOverlayCanvasRef.current;
        if (ovCanvas) {
          const octx = ovCanvas.getContext('2d');
          if (octx) octx.clearRect(0, 0, ovCanvas.width, ovCanvas.height);
        }
        const standbyPose = makeNeutralPose({
          stanceMode: 'standing',
          prop: liveEffectiveProp,
          ...propPlacementConfig,
        });
        renderInteractivePose3DToCanvas(
          {
            subTitle: isTracking
              ? 'Rastreando vídeo real fotograma a fotograma...'
              : pcVideoUrl
                ? 'Pulse "Re-analizar Vídeo" para reconstruir el Mellizo 3D'
                : 'Suba un vídeo desde su PC para iniciar el Mellizo 3D',
            focusZone: 'full_body',
            cameraPreset: cameraPreset === 'frontal' ? 'isometric' : cameraPreset,
            pose: standbyPose,
          },
          avatarCanvasRef.current,
          640,
          480,
          orbit,
          1.65,
        );
        return;
      }

      // Modo Ciclo de Prueba (exclusivo cuando el usuario selecciona la pestaña Ciclo de Prueba)
      const dur = Math.max(1, videoDurationSec || 5);
      const progress = Math.max(0, Math.min(1, tSec / dur));
      const built = buildCeneaSampleFrameSpec(activeDemoSample, progress, 172);
      const poseWithProp: PosturePose3D = {
        ...built.panelSpec.pose,
        prop: liveEffectiveProp !== 'none' ? liveEffectiveProp : built.panelSpec.pose.prop,
        ...propPlacementConfig,
      };
      if (propVisibilityMode === 'hidden' || (propVisibilityMode === 'final_photo_only' && !previewFinalPhotoProp)) {
        poseWithProp.prop = 'none';
      }
      const demoSpec: Panel3DSpec = {
        subTitle: `Ciclo Demostración · t = ${tSec.toFixed(2)} s`,
        scoreBadge: `Tronco ${Math.round(poseWithProp.trunkFlexionDeg)}°`,
        focusZone: 'full_body',
        cameraPreset: cameraPreset === 'frontal' ? 'isometric' : cameraPreset,
        pose: poseWithProp,
      };
      renderInteractivePose3DToCanvas(
        demoSpec,
        avatarCanvasRef.current,
        640,
        480,
        orbit,
        1.75,
      );
    },
    [
      isRecordingTwin,
      isTracking,
      pcVideoUrl,
      mode,
      mocapTimeline,
      getMocapSampleAtTime,
      orbit,
      cameraPreset,
      liveEffectiveProp,
      propPlacementConfig,
      propVisibilityMode,
      previewFinalPhotoProp,
      showAvatarAngleHUD,
      showVideoSkeletonOverlay,
      videoDurationSec,
      activeDemoSample,
    ],
  );

  // Actualizar lienzos cuando el vídeo está en pausa o cambian controles/órbita/pines
  useEffect(() => {
    if (isPlaying || isRecordingTwin) return;
    drawFrameAtTime(currentTimeSec);
  }, [
    currentTimeSec,
    isPlaying,
    isRecordingTwin,
    avatarReady,
    drawFrameAtTime,
  ]);

  // Bucle de reproducción fluida a 60 Hz directamente acoplado a video.currentTime (cero lag de React)
  useEffect(() => {
    if (!isPlaying || isRecordingTwin) return;

    if (mode === 'pc_upload' && sourceVideoRef.current && pcVideoUrl) {
      const vid = sourceVideoRef.current;
      vid.play().catch(() => {
        setIsPlaying(false);
      });
      let raf = 0;
      let lastStatePushMs = 0;

      const syncLoop = (nowMs: number) => {
        const t = vid.currentTime || 0;
        drawFrameAtTime(t, correctionPins);
        if (nowMs - lastStatePushMs >= 65) {
          lastStatePushMs = nowMs;
          setCurrentTimeSec(t);
        }
        if (vid.ended) {
          setCurrentTimeSec(vid.duration || t);
          setIsPlaying(false);
          return;
        }
        raf = requestAnimationFrame(syncLoop);
      };
      raf = requestAnimationFrame(syncLoop);
      return () => {
        cancelAnimationFrame(raf);
        vid.pause();
      };
    }

    let raf = 0;
    let prev = performance.now();
    let tLocal = currentTimeSec;
    let lastPush = 0;
    const dur = Math.max(2, videoDurationSec || 5);
    const loopDemo = (now: number) => {
      const dt = (now - prev) / 1000;
      prev = now;
      tLocal = tLocal + dt >= dur ? 0 : tLocal + dt;
      drawFrameAtTime(tLocal, correctionPins);
      if (now - lastPush >= 65) {
        lastPush = now;
        setCurrentTimeSec(tLocal);
      }
      raf = requestAnimationFrame(loopDemo);
    };
    raf = requestAnimationFrame(loopDemo);
    return () => cancelAnimationFrame(raf);
  }, [
    isPlaying,
    isRecordingTwin,
    mode,
    pcVideoUrl,
    videoDurationSec,
    drawFrameAtTime,
    correctionPins,
  ]);

  const activeLiveSample = useMemo(
    () => getMocapSampleAtTime(currentTimeSec),
    [getMocapSampleAtTime, currentTimeSec],
  );

  const currentReadoutPose = useMemo<PosturePose3D>(() => {
    if (activeLiveSample) return activeLiveSample.ergonomicPose;
    if (mode === 'pc_upload') return makeNeutralPose({ stanceMode: 'standing' });
    const dur = Math.max(1, videoDurationSec || 5);
    return buildCeneaSampleFrameSpec(
      activeDemoSample,
      Math.max(0, Math.min(1, currentTimeSec / dur)),
      172,
    ).panelSpec.pose;
  }, [activeLiveSample, mode, videoDurationSec, activeDemoSample, currentTimeSec]);

  const resetDraftControls = () => {
    setDraftMirrorArm('none');
    setDraftTrunkPitchDeg(0);
    setDraftRootYawDeg(0);
    setDraftShoulderRDeg(0);
    setDraftElbowRDeg(0);
    setDraftShoulderLDeg(0);
    setDraftElbowLDeg(0);
    setDraftKneeDeg(0);
  };

  const handleSaveCorrectionPin = () => {
    const tRounded = Math.round(currentTimeSec * 100) / 100;
    const newPin: MocapCorrectionPin = {
      id: `pin-${Date.now()}`,
      timeSec: tRounded,
      radiusSec: draftRadiusSec,
      mirrorArm: draftMirrorArm,
      trunkPitchOffsetDeg: draftTrunkPitchDeg,
      rootYawOffsetDeg: draftRootYawDeg,
      shoulderROffsetDeg: draftShoulderRDeg,
      elbowROffsetDeg: draftElbowRDeg,
      shoulderLOffsetDeg: draftShoulderLDeg,
      elbowLOffsetDeg: draftElbowLDeg,
      kneeOffsetDeg: draftKneeDeg,
    };
    setCorrectionPins((prev) => {
      // Si ya había un pin muy cercano (< 0.18 s), reemplazarlo
      const filtered = prev.filter((p) => Math.abs(p.timeSec - tRounded) >= 0.18);
      return [...filtered, newPin].sort((a, b) => a.timeSec - b.timeSec);
    });
    resetDraftControls();
    setNotice({
      tone: 'success',
      text: `Corrección asistida fijada en t = ${tRounded.toFixed(2)} s con transición suave de ±${draftRadiusSec.toFixed(2)} s.`,
    });
  };

  const handleScrubToTime = (t: number) => {
    setIsPlaying(false);
    setCurrentTimeSec(t);
    if (sourceVideoRef.current && mode === 'pc_upload') {
      sourceVideoRef.current.currentTime = t;
    }
  };

  // Subida desde PC + Rastreo 3D Heavy a 24 fps con filtro 1€
  const handleUploadPcVideo = async (file: File) => {
    setIsPlaying(false);
    setIsTracking(true);
    setMocapTimeline(null);
    setTrackingProgressPct(4);
    setTrackingMsg('Abriendo vídeo y verificando códec de vídeo...');
    setNotice(null);
    setCorrectionPins([]);
    resetDraftControls();

    if (recordedVideoUrl) {
      URL.revokeObjectURL(recordedVideoUrl);
      setRecordedVideoUrl(null);
    }

    setMode('pc_upload');
    setCameraPreset('frontal');
    setOrbit(DEFAULT_ORBIT_OVERRIDE);
    setPcVideoName(file.name);

    if (pcVideoUrl) URL.revokeObjectURL(pcVideoUrl);
    let workingUrl = URL.createObjectURL(file);

    try {
      const probeVid = document.createElement('video');
      probeVid.muted = true;
      probeVid.playsInline = true;
      probeVid.preload = 'auto';
      probeVid.src = workingUrl;

      let loadedOk = false;
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => reject(new Error('timeout')), 9000);
          probeVid.onloadeddata = () => {
            window.clearTimeout(timer);
            resolve();
          };
          probeVid.onerror = () => {
            window.clearTimeout(timer);
            reject(new Error('codec_error'));
          };
        });
        loadedOk = probeVid.videoWidth > 0;
      } catch {
        loadedOk = false;
      }

      if (!loadedOk) {
        setTrackingMsg('Normalizando vídeo MOV/HEVC a MP4 H.264 compatible con navegador...');
        const b64 = await fileToBase64(file);
        const normResp = await fetch('/api/biomech/normalize-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, videoBase64: b64 }),
        });
        if (!normResp.ok) {
          throw new Error('No se pudo decodificar este formato de vídeo. Suba un archivo MP4 o WebM.');
        }
        const normJson = await normResp.json();
        const binStr = atob(String(normJson.mp4Base64 || ''));
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
        const mp4Blob = new Blob([bytes], { type: 'video/mp4' });
        URL.revokeObjectURL(workingUrl);
        workingUrl = URL.createObjectURL(mp4Blob);
        probeVid.src = workingUrl;
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(
            () => reject(new Error('Tiempo agotado al abrir MP4 normalizado.')),
            9000,
          );
          probeVid.onloadeddata = () => {
            window.clearTimeout(timer);
            resolve();
          };
          probeVid.onerror = () => {
            window.clearTimeout(timer);
            reject(new Error('Formato de vídeo no reproducible en el navegador.'));
          };
        });
      }

      setPcVideoUrl(workingUrl);
      const dur =
        Number.isFinite(probeVid.duration) && probeVid.duration > 0.2
          ? Math.min(25, probeVid.duration)
          : 5.0;
      setVideoDurationSec(dur);
      setCurrentTimeSec(0);

      const timeline = await extractTrueMocapTimeline(probeVid, {
        targetFps: dur <= 14 ? 24 : 18,
        onProgress: (pct, phaseText) => {
          setTrackingProgressPct(pct);
          if (phaseText) setTrackingMsg(phaseText);
        },
      });

      if (timeline && timeline.frames.length > 0) {
        setMocapTimeline(timeline);
        const occCount = timeline.occlusionSegments.length;
        setNotice({
          tone: 'success',
          text:
            occCount > 0
              ? `Captura 3D completada con modelo ${timeline.modelTier.toUpperCase()} (${timeline.frames.length} cuadros a ${timeline.sampledFps} fps + filtro 1€). Se detectaron ${occCount} tramo(s) con brazo parcialmente tapado; puede revisarlos debajo en el panel de Corrección de Oclusiones.`
              : `Captura de movimiento 3D completada con modelo ${timeline.modelTier.toUpperCase()} (${timeline.frames.length} cuadros a ${timeline.sampledFps} fps + filtro 1€ + Root Motion). Pulse Reproducir o Descargar Vídeo Mellizo.`,
        });
      } else {
        setMocapTimeline(null);
        setNotice({
          tone: 'warning',
          text: 'No se pudo detectar una figura humana clara en el vídeo. Pulse "Re-analizar Vídeo" o verifique que el operario sea visible.',
        });
      }
    } catch (err) {
      setNotice({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Error al procesar el vídeo subido.',
      });
    } finally {
      setIsTracking(false);
      setTrackingMsg('');
    }
  };

  // Re-analizar en 1 clic el vídeo actualmente cargado en pantalla
  const handleReanalyzeCurrentVideo = async () => {
    const vidEl = sourceVideoRef.current;
    if (!vidEl || !pcVideoUrl || isTracking || isRecordingTwin) return;
    setIsPlaying(false);
    vidEl.pause();
    setIsTracking(true);
    setMocapTimeline(null);
    setTrackingProgressPct(6);
    setTrackingMsg('Reiniciando motor 3D y rastreando vídeo actual...');
    setNotice(null);

    try {
      const dur =
        Number.isFinite(vidEl.duration) && vidEl.duration > 0.2
          ? Math.min(25, vidEl.duration)
          : videoDurationSec || 5.0;
      setVideoDurationSec(dur);
      const timeline = await extractTrueMocapTimeline(vidEl, {
        targetFps: dur <= 14 ? 24 : 18,
        onProgress: (pct, phaseText) => {
          setTrackingProgressPct(pct);
          if (phaseText) setTrackingMsg(phaseText);
        },
      });
      await seekVideoFrame(vidEl, 0);
      setCurrentTimeSec(0);
      if (timeline && timeline.frames.length > 0) {
        setMocapTimeline(timeline);
        setNotice({
          tone: 'success',
          text: `Re-análisis 3D completado (${timeline.frames.length} cuadros a ${timeline.sampledFps} fps).`,
        });
      } else {
        setNotice({
          tone: 'warning',
          text: 'No se detectó esqueleto 3D en el vídeo actual. Verifique que el vídeo esté cargado y muestre al operario.',
        });
      }
    } catch (err) {
      setNotice({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Error al re-analizar el vídeo.',
      });
    } finally {
      setIsTracking(false);
      setTrackingMsg('');
    }
  };

  // Grabación y exportación del Vídeo Mellizo con el motor directo de cuaterniones 3D
  const handleRecordAndDownloadTwinVideo = async () => {
    if (mode === 'pc_upload' && !mocapTimeline) {
      setNotice({
        tone: 'warning',
        text: pcVideoUrl
          ? 'Pulse primero "Re-analizar Vídeo" para completar el rastreo 3D antes de grabar.'
          : 'Suba primero un vídeo desde su PC para grabar el Vídeo Mellizo 3D.',
      });
      return;
    }
    await ensureAvatarGlbLoaded();
    setIsPlaying(false);
    setIsRecordingTwin(true);
    setRecordingPct(0);
    setNotice(null);

    if (recordedVideoUrl) {
      URL.revokeObjectURL(recordedVideoUrl);
      setRecordedVideoUrl(null);
    }

    try {
      const dur = Math.max(1.5, Math.min(25, videoDurationSec || 5));
      const fps = exportFps;
      const totalFrames = Math.max(24, Math.round(dur * fps));

      const outW = exportLayout === 'side_by_side' ? 1280 : 900;
      const outH = 600;
      const compositeCanvas = document.createElement('canvas');
      compositeCanvas.width = outW;
      compositeCanvas.height = outH;
      const ctx = compositeCanvas.getContext('2d');
      if (!ctx) {
        throw new Error('No se pudo inicializar el lienzo de grabación de vídeo.');
      }

      const rawAvatarCanvas = document.createElement('canvas');
      const avatarRenderW = exportLayout === 'side_by_side' ? 616 : 860;
      const avatarRenderH = 504;

      const { mimeType, ext } = pickSupportedRecorderMime();
      const stream = compositeCanvas.captureStream(fps);
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_200_000 })
        : new MediaRecorder(stream);

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      const stoppedPromise = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          const finalMime = mimeType || (ext === 'mp4' ? 'video/mp4' : 'video/webm');
          resolve(new Blob(chunks, { type: finalMime }));
        };
      });

      const vidEl = mode === 'pc_upload' && pcVideoUrl ? sourceVideoRef.current : null;
      if (vidEl) vidEl.pause();

      recorder.start(120);

      for (let f = 0; f < totalFrames; f++) {
        const tSec = totalFrames <= 1 ? 0 : (f / (totalFrames - 1)) * dur;
        setCurrentTimeSec(tSec);

        if (vidEl) {
          await seekVideoFrame(vidEl, tSec);
        }

        const sample =
          mode === 'pc_upload' && mocapTimeline
            ? interpolateMocapFrameAtTime(
                mocapTimeline,
                tSec,
                correctionPins,
                autoAssistSevereOcclusion,
              )
            : null;

        let poseForFooter: PosturePose3D;
        if (sample) {
          poseForFooter = sample.ergonomicPose;
          renderMocapTwinFrameToCanvas(
            sample,
            rawAvatarCanvas,
            avatarRenderW,
            avatarRenderH,
            orbit,
            {
              cameraPreset,
              sceneProp: liveEffectiveProp,
              propPlacement: propPlacementConfig,
              showAngleHUD: showAvatarAngleHUD,
              dpiScale: 1.5,
            },
          );
        } else {
          const built = buildCeneaSampleFrameSpec(activeDemoSample, tSec / dur, 172);
          poseForFooter = {
            ...built.panelSpec.pose,
            prop: liveEffectiveProp !== 'none' ? liveEffectiveProp : built.panelSpec.pose.prop,
            ...propPlacementConfig,
          };
          if (propVisibilityMode === 'hidden' || (propVisibilityMode === 'final_photo_only' && !previewFinalPhotoProp)) {
            poseForFooter.prop = 'none';
          }
          renderInteractivePose3DToCanvas(
            {
              subTitle: `Avatar 3D Mellizo · t = ${tSec.toFixed(2)} s`,
              focusZone: 'full_body',
              cameraPreset: cameraPreset === 'frontal' ? 'isometric' : cameraPreset,
              pose: poseForFooter,
            },
            rawAvatarCanvas,
            avatarRenderW,
            avatarRenderH,
            orbit,
            1.5,
          );
        }

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, outW, outH);

        // Cabecera
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 14px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          `ERGOEVAL · VÍDEO MELLIZO 3D (RETARGETING CUATERNIONES + 1€) — ${(general.workstationName || 'PUESTO EVALUADO').toUpperCase()}`,
          16,
          20,
        );
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 12px "IBM Plex Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`t = ${tSec.toFixed(2)} s / ${dur.toFixed(2)} s`, outW - 16, 20);
        ctx.textAlign = 'left';

        if (exportLayout === 'side_by_side') {
          const boxW = 616;
          const boxH = 504;
          ctx.fillStyle = '#020617';
          ctx.fillRect(16, 40, boxW, boxH);
          if (vidEl && vidEl.videoWidth > 0 && vidEl.videoHeight > 0) {
            const vRect = computeContainedVideoRect(
              boxW,
              boxH,
              vidEl.videoWidth,
              vidEl.videoHeight,
            );
            ctx.drawImage(vidEl, 16 + vRect.x, 40 + vRect.y, vRect.w, vRect.h);
            if (includeOverlayInExport && sample) {
              drawDetectedSkeletonOverlay(ctx, sample, {
                x: 16 + vRect.x,
                y: 40 + vRect.y,
                w: vRect.w,
                h: vRect.h,
              });
            }
          } else {
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(16, 40, boxW, boxH);
            ctx.fillStyle = '#e2e8f0';
            ctx.font = 'bold 15px "Plus Jakarta Sans", sans-serif';
            ctx.fillText(activeDemoSample.title, 36, 110);
          }
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(16, 40, boxW, boxH);

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(648, 40, boxW, boxH);
          ctx.drawImage(rawAvatarCanvas, 648, 40, boxW, boxH);
          ctx.strokeRect(648, 40, boxW, boxH);
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(20, 40, avatarRenderW, avatarRenderH);
          ctx.drawImage(rawAvatarCanvas, 20, 40, avatarRenderW, avatarRenderH);
        }

        // Pie métrico (codo en ángulo interno anatómico 30°–170°)
        const elbDIntFooter = Math.max(30, Math.min(170, Math.round(180 - poseForFooter.elbowRFlexionDeg)));
        const elbIIntFooter = Math.max(30, Math.min(170, Math.round(180 - poseForFooter.elbowLFlexionDeg)));
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, outH - 42, outW, 42);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 12px "IBM Plex Mono", monospace';
        ctx.fillText(
          `Tronco ${Math.round(poseForFooter.trunkFlexionDeg)}° · Giro Pelvis ${Math.round(poseForFooter.rootYawDeg ?? 0)}° · Brazo D ${Math.round(poseForFooter.shoulderRFlexionDeg)}° / Codo D ${elbDIntFooter}° · Brazo I ${Math.round(poseForFooter.shoulderLFlexionDeg)}° / Codo I ${elbIIntFooter}° · Rodilla ${Math.round(Math.max(poseForFooter.kneeRFlexionDeg, poseForFooter.kneeLFlexionDeg))}°`,
          16,
          outH - 21,
        );

        setRecordingPct(Math.round(((f + 1) / totalFrames) * 100));
        await new Promise((r) => window.setTimeout(r, Math.round(1000 / fps)));
      }

      recorder.stop();
      const videoBlob = await stoppedPromise;
      stream.getTracks().forEach((tr) => tr.stop());

      const dlUrl = URL.createObjectURL(videoBlob);
      setRecordedVideoUrl(dlUrl);
      setRecordedVideoExt(ext);

      const safeBase = (pcVideoName ? pcVideoName.replace(/\.[^.]+$/, '') : 'ciclo_ergoeval')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .slice(0, 40);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `avatar_mellizo_3d_${safeBase}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setNotice({
        tone: 'success',
        text: `Vídeo Mellizo 3D generado y descargado como "avatar_mellizo_3d_${safeBase}.${ext}".`,
      });
    } catch (err) {
      setNotice({
        tone: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'No se pudo completar la grabación del Vídeo Mellizo.',
      });
    } finally {
      setIsRecordingTwin(false);
    }
  };

  // Emitir capturas de Toma de Carga y Destino al estudio usando el retargeting 3D real
  const handleSendKeyPosturesToStudy = async () => {
    if (!onEmitTwinFramesToStudy) return;
    if (mode === 'pc_upload' && !mocapTimeline) {
      setNotice({
        tone: 'warning',
        text: pcVideoUrl
          ? 'Pulse primero "Re-analizar Vídeo" antes de enviar las posturas al estudio.'
          : 'Suba primero un vídeo desde su PC.',
      });
      return;
    }
    await ensureAvatarGlbLoaded();
    const dur = Math.max(1, videoDurationSec || 5);

    let tOrigin = dur * 0.2;
    let tDest = dur * 0.8;
    if (mocapTimeline && mocapTimeline.frames.length >= 4) {
      const mid = Math.floor(mocapTimeline.frames.length / 2);
      const firstHalf = mocapTimeline.frames.slice(0, mid);
      const secondHalf = mocapTimeline.frames.slice(mid);
      tOrigin = firstHalf.reduce((best, cur) =>
        Math.abs(cur.ergonomicPose.trunkFlexionDeg) + cur.ergonomicPose.kneeRFlexionDeg >
        Math.abs(best.ergonomicPose.trunkFlexionDeg) + best.ergonomicPose.kneeRFlexionDeg
          ? cur
          : best,
      ).timeSec;
      tDest = secondHalf.reduce((best, cur) =>
        Math.abs(cur.ergonomicPose.shoulderRFlexionDeg) +
          Math.abs(cur.ergonomicPose.trunkFlexionDeg) >
        Math.abs(best.ergonomicPose.shoulderRFlexionDeg) +
          Math.abs(best.ergonomicPose.trunkFlexionDeg)
          ? cur
          : best,
      ).timeSec;
    }

    const origSample = getMocapSampleAtTime(tOrigin, correctionPins);
    const destSample = getMocapSampleAtTime(tDest, correctionPins);
    const origPose =
      origSample?.ergonomicPose ||
      buildCeneaSampleFrameSpec(activeDemoSample, 0.2, 172).panelSpec.pose;
    const destPose =
      destSample?.ergonomicPose ||
      buildCeneaSampleFrameSpec(activeDemoSample, 0.8, 172).panelSpec.pose;

    const renderTwinReportJpeg = (
      sample: MocapFrameSample | null,
      fallbackPose: PosturePose3D,
      headerTitle: string,
      footerText: string,
    ): string => {
      const sheetW = 680;
      const sheetH = 540;
      const sheet = document.createElement('canvas');
      sheet.width = sheetW;
      sheet.height = sheetH;
      const sctx = sheet.getContext('2d')!;
      sctx.fillStyle = '#ffffff';
      sctx.fillRect(0, 0, sheetW, sheetH);

      sctx.fillStyle = '#0f172a';
      sctx.fillRect(0, 0, sheetW, 38);
      sctx.fillStyle = '#ffffff';
      sctx.font = 'bold 12.5px "Plus Jakarta Sans", sans-serif';
      sctx.textBaseline = 'middle';
      sctx.fillText(headerTitle, 14, 19);

      const subCanvas = document.createElement('canvas');
      if (sample) {
        renderMocapTwinFrameToCanvas(sample, subCanvas, sheetW, sheetH - 74, orbit, {
          cameraPreset,
          sceneProp: finalPhotoProp,
          propPlacement: propPlacementConfig,
          showAngleHUD: true,
          dpiScale: 1.75,
        });
      } else {
        const finalFallbackPose: PosturePose3D = {
          ...fallbackPose,
          prop: finalPhotoProp !== 'none' ? finalPhotoProp : fallbackPose.prop,
          ...propPlacementConfig,
        };
        if (propVisibilityMode === 'hidden') finalFallbackPose.prop = 'none';
        renderInteractivePose3DToCanvas(
          {
            subTitle: headerTitle,
            focusZone: 'full_body',
            cameraPreset: 'isometric',
            pose: finalFallbackPose,
          },
          subCanvas,
          sheetW,
          sheetH - 74,
          orbit,
          1.75,
        );
      }
      sctx.drawImage(subCanvas, 0, 38, sheetW, sheetH - 74);

      sctx.fillStyle = '#f8fafc';
      sctx.fillRect(0, sheetH - 36, sheetW, 36);
      sctx.strokeStyle = '#cbd5e1';
      sctx.beginPath();
      sctx.moveTo(0, sheetH - 36);
      sctx.lineTo(sheetW, sheetH - 36);
      sctx.stroke();
      sctx.fillStyle = '#1e293b';
      sctx.font = '600 11px "IBM Plex Mono", monospace';
      sctx.fillText(footerText, 14, sheetH - 18);

      return sheet.toDataURL('image/jpeg', 0.9);
    };

    const photos: StudyPhoto[] = [];
    const vidEl = mode === 'pc_upload' && pcVideoUrl ? sourceVideoRef.current : null;

    if (vidEl && vidEl.videoWidth > 0) {
      const capCanvas = document.createElement('canvas');
      capCanvas.width = 640;
      capCanvas.height = Math.max(260, Math.round((640 * vidEl.videoHeight) / vidEl.videoWidth));
      const cctx = capCanvas.getContext('2d');

      await seekVideoFrame(vidEl, tOrigin);
      if (cctx) {
        cctx.drawImage(vidEl, 0, 0, capCanvas.width, capCanvas.height);
        const opOrigJpeg = await renderAnnotatedOperatorFrameJpeg(
          capCanvas.toDataURL('image/jpeg', 0.88),
          `OPERARIO REAL · TOMA DE CARGA (t = ${tOrigin.toFixed(2)} s)`,
          [
            `Tronco ${Math.round(origPose.trunkFlexionDeg)}°`,
            `Hombro D ${Math.round(origPose.shoulderRFlexionDeg)}°`,
            `Rodilla ${Math.round(origPose.kneeRFlexionDeg)}°`,
          ],
        );
        photos.push({
          id: `twin-op-orig-${Date.now()}`,
          name: 'Operario Real — Toma de Carga',
          dataUrl: opOrigJpeg,
          annotatedDataUrl: opOrigJpeg,
          caption: `Fotograma real del vídeo subido en Toma de Carga (t = ${tOrigin.toFixed(2)} s)`,
          annotations: [],
        });
      }

      await seekVideoFrame(vidEl, tDest);
      if (cctx) {
        cctx.drawImage(vidEl, 0, 0, capCanvas.width, capCanvas.height);
        const opDestJpeg = await renderAnnotatedOperatorFrameJpeg(
          capCanvas.toDataURL('image/jpeg', 0.88),
          `OPERARIO REAL · DESTINO (t = ${tDest.toFixed(2)} s)`,
          [
            `Tronco ${Math.round(destPose.trunkFlexionDeg)}°`,
            `Hombro D ${Math.round(destPose.shoulderRFlexionDeg)}°`,
            `Rodilla ${Math.round(destPose.kneeRFlexionDeg)}°`,
          ],
        );
        photos.push({
          id: `twin-op-dest-${Date.now() + 1}`,
          name: 'Operario Real — Destino',
          dataUrl: opDestJpeg,
          annotatedDataUrl: opDestJpeg,
          caption: `Fotograma real del vídeo subido en Destino (t = ${tDest.toFixed(2)} s)`,
          annotations: [],
        });
      }
    }

    const origElbInt = Math.max(30, Math.min(170, Math.round(180 - origPose.elbowRFlexionDeg)));
    const destElbInt = Math.max(30, Math.min(170, Math.round(180 - destPose.elbowRFlexionDeg)));

    const origAvatarJpeg = renderTwinReportJpeg(
      origSample,
      origPose,
      `AVATAR 3D MELLIZO · 1. TOMA DE CARGA (t = ${tOrigin.toFixed(2)} s)`,
      `Tronco ${Math.round(origPose.trunkFlexionDeg)}° | Giro ${Math.round(origPose.rootYawDeg ?? 0)}° | Hombro D ${Math.round(origPose.shoulderRFlexionDeg)}° | Codo D ${origElbInt}° | Rodilla ${Math.round(origPose.kneeRFlexionDeg)}°`,
    );
    const destAvatarJpeg = renderTwinReportJpeg(
      destSample,
      destPose,
      `AVATAR 3D MELLIZO · 2. DESTINO (t = ${tDest.toFixed(2)} s)`,
      `Tronco ${Math.round(destPose.trunkFlexionDeg)}° | Giro ${Math.round(destPose.rootYawDeg ?? 0)}° | Hombro D ${Math.round(destPose.shoulderRFlexionDeg)}° | Codo D ${destElbInt}° | Rodilla ${Math.round(destPose.kneeRFlexionDeg)}°`,
    );

    const makeAnns = (p: PosturePose3D): AngleAnnotation[] => [
      {
        id: 'ann-tr',
        label: 'Tronco',
        p1: { x: 0.5, y: 0.2 },
        vertex: { x: 0.5, y: 0.5 },
        p2: { x: 0.5, y: 0.8 },
        degrees: Math.round(p.trunkFlexionDeg),
      },
      {
        id: 'ann-sh',
        label: 'Hombro D',
        p1: { x: 0.5, y: 0.3 },
        vertex: { x: 0.5, y: 0.4 },
        p2: { x: 0.7, y: 0.5 },
        degrees: Math.round(p.shoulderRFlexionDeg),
      },
      {
        id: 'ann-el',
        label: 'Codo D (int.)',
        p1: { x: 0.5, y: 0.3 },
        vertex: { x: 0.6, y: 0.5 },
        p2: { x: 0.8, y: 0.5 },
        degrees: Math.max(30, Math.min(170, Math.round(180 - p.elbowRFlexionDeg))),
      },
    ];

    photos.push(
      {
        id: `twin-av-orig-${Date.now() + 2}`,
        name: 'Avatar 3D Mellizo — Toma de Carga',
        dataUrl: origAvatarJpeg,
        annotatedDataUrl: origAvatarJpeg,
        caption: `Réplica exacta Avatar 3D por cuaterniones en Toma de Carga (t = ${tOrigin.toFixed(2)} s)`,
        annotations: makeAnns(origPose),
      },
      {
        id: `twin-av-dest-${Date.now() + 3}`,
        name: 'Avatar 3D Mellizo — Destino',
        dataUrl: destAvatarJpeg,
        annotatedDataUrl: destAvatarJpeg,
        caption: `Réplica exacta Avatar 3D por cuaterniones en Destino (t = ${tDest.toFixed(2)} s)`,
        annotations: makeAnns(destPose),
      },
    );

    const tab = createNewStudyTab(1, MethodId.REBA, 'REBA — Vídeo Mellizo 3D');
    tab.taskEvaluated =
      general.mainTasks ||
      `Evaluación desde Vídeo Mellizo 3D (${pcVideoName || activeDemoSample.title})`;
    tab.photos = photos;
    tab.evaluatorObservations = `Captura de movimiento 3D por cuaterniones (MediaPipe Heavy + Filtro 1€). Toma de carga en t=${tOrigin.toFixed(2)} s (Tronco ${Math.round(origPose.trunkFlexionDeg)}°, Rodilla ${Math.round(origPose.kneeRFlexionDeg)}°) y Destino en t=${tDest.toFixed(2)} s (Tronco ${Math.round(destPose.trunkFlexionDeg)}°, Hombro ${Math.round(destPose.shoulderRFlexionDeg)}°).`;
    onEmitTwinFramesToStudy(tab);

    setNotice({
      tone: 'success',
      text: 'Se incorporaron las fotos reales del operario y las réplicas 3D por cuaterniones (Toma y Destino) como nueva pestaña en el estudio.',
    });
  };

  const handleDownloadFinalPhotoPng = async () => {
    if (mode === 'pc_upload' && !mocapTimeline) {
      setNotice({
        tone: 'warning',
        text: pcVideoUrl
          ? 'Pulse primero "Re-analizar Vídeo" para reconstruir la postura del operario antes de descargar.'
          : 'Suba primero un vídeo desde su PC.',
      });
      return;
    }
    await ensureAvatarGlbLoaded();
    const outCanvas = document.createElement('canvas');
    const sample = getMocapSampleAtTime(currentTimeSec, effectivePins);
    if (sample) {
      renderMocapTwinFrameToCanvas(sample, outCanvas, 920, 680, orbit, {
        cameraPreset,
        sceneProp: finalPhotoProp,
        propPlacement: propPlacementConfig,
        showAngleHUD: showAvatarAngleHUD,
        dpiScale: 2,
      });
    } else {
      const dur = Math.max(1, videoDurationSec || 5);
      const built = buildCeneaSampleFrameSpec(
        activeDemoSample,
        Math.max(0, Math.min(1, currentTimeSec / dur)),
        172,
      );
      const poseFinal: PosturePose3D = {
        ...built.panelSpec.pose,
        prop: finalPhotoProp !== 'none' ? finalPhotoProp : built.panelSpec.pose.prop,
        ...propPlacementConfig,
      };
      if (propVisibilityMode === 'hidden') poseFinal.prop = 'none';
      renderInteractivePose3DToCanvas(
        {
          subTitle: `Foto Final Avatar 3D · t = ${currentTimeSec.toFixed(2)} s`,
          focusZone: 'full_body',
          cameraPreset: cameraPreset === 'frontal' ? 'isometric' : cameraPreset,
          pose: poseFinal,
        },
        outCanvas,
        920,
        680,
        orbit,
        2,
      );
    }
    const a = document.createElement('a');
    a.href = outCanvas.toDataURL('image/png');
    a.download = `avatar_mellizo_foto_final_t${currentTimeSec.toFixed(1)}s.png`;
    a.click();
    setNotice({
      tone: 'success',
      text: `Foto final PNG descargada (t = ${currentTimeSec.toFixed(2)} s) con la configuración de mobiliario seleccionada.`,
    });
  };

  return (
    <div className="space-y-4">
      {/* Encabezado y controles de subida / modo */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-wider text-sky-700 font-semibold">
              RETARGETING ESQUELÉTICO 3D POR CUATERNIONES · MEDIAPIPE HEAVY · FILTRO 1€
            </p>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5 flex items-center gap-2">
              <Film className="w-5 h-5 text-sky-700 shrink-0" />
              Estudio de Vídeo Mellizo 3D + Corrección Asistida de Oclusiones
            </h2>
            <p className="text-xs text-slate-600 mt-1 max-w-3xl">
              Rastrea los 33 marcadores 3D a 24 fps, transfiere rotaciones reales por cuaterniones hueso a hueso sobre el avatar <code>.glb</code> con giro y desplazamiento de pelvis (<em>Root Motion</em>), ancla los pies al piso y permite corregir tramos tapados por cargas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBackToEvaluator}
              className="px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Volver al Evaluador
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUploadPcVideo(f);
                e.currentTarget.value = '';
              }}
            />
            {mode === 'pc_upload' && pcVideoUrl && (
              <button
                type="button"
                disabled={isTracking || isRecordingTwin}
                onClick={() => void handleReanalyzeCurrentVideo()}
                className="px-3 py-2 rounded-md border border-sky-300 bg-sky-50 hover:bg-sky-100 disabled:opacity-50 text-sky-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTracking ? 'animate-spin' : ''}`} />
                Re-analizar Vídeo
              </button>
            )}
            <button
              type="button"
              disabled={isTracking || isRecordingTwin}
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-md bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Subir Vídeo desde PC (MP4 / MOV / WebM)
            </button>
          </div>
        </div>

        {/* Selector modo PC vs Ciclo Demo + barra de progreso */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
            <button
              type="button"
              onClick={() => setMode('pc_upload')}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                mode === 'pc_upload'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Vídeo Subido desde PC {pcVideoName ? `(${pcVideoName})` : ''}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setMode('demo_cycle');
                setVideoDurationSec(5.0);
                setCurrentTimeSec(0);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                mode === 'demo_cycle'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ciclo de Prueba
            </button>
          </div>

          {mode === 'demo_cycle' && (
            <select
              value={demoSampleId}
              onChange={(e) => setDemoSampleId(e.target.value as CeneaSampleCaseId)}
              className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs bg-white text-slate-800"
            >
              {CENEA_SAMPLE_VIDEOS_CATALOG.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          )}

          {mocapTimeline && mode === 'pc_upload' && (
            <div className="text-xs font-mono tabular-nums text-slate-600">
              <span>Modelo {mocapTimeline.modelTier.toUpperCase()}</span>
              <span className="mx-1.5 text-slate-300">·</span>
              <span>{mocapTimeline.frames.length} cuadros</span>
              <span className="mx-1.5 text-slate-300">·</span>
              <span>{mocapTimeline.sampledFps} fps</span>
              <span className="mx-1.5 text-slate-300">·</span>
              <span> Pines C: {correctionPins.length}</span>
            </div>
          )}
        </div>

        {isTracking && (
          <div className="mt-3 bg-slate-50 border border-slate-200 rounded-md p-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
              <span className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-700" />
                {trackingMsg || 'Extrayendo cinemática 3D...'}
              </span>
              <span className="font-mono tabular-nums">{trackingProgressPct}%</span>
            </div>
            <div className="w-full h-2 bg-slate-200 rounded overflow-hidden">
              <div
                className="h-full bg-sky-600 transition-all duration-150"
                style={{ width: `${trackingProgressPct}%` }}
              />
            </div>
          </div>
        )}

        {notice && (
          <div
            className={`mt-3 rounded-md border px-3 py-2 text-xs font-medium ${
              notice.tone === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : notice.tone === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : notice.tone === 'error'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-sky-50 border-sky-200 text-sky-900'
            }`}
          >
            {notice.text}
          </div>
        )}
      </div>

      {/* Visor Dual Sincronizado 1:1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Panel Izquierdo: Vídeo Original PC + Malla 2D detectada */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
          <div className="px-3.5 py-2.5 bg-slate-900 text-white flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Video className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="text-xs font-bold truncate">
                1. Vídeo Original Subido {pcVideoName ? `· ${pcVideoName}` : ''}
              </span>
            </div>
            {mode === 'pc_upload' && pcVideoUrl && (
              <button
                type="button"
                onClick={() => setShowVideoSkeletonOverlay((v) => !v)}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-sky-300 flex items-center gap-1 cursor-pointer shrink-0"
              >
                {showVideoSkeletonOverlay ? (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    Vectores ON
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    Vectores OFF
                  </>
                )}
              </button>
            )}
          </div>

          <div className="relative bg-slate-950 aspect-4/3 w-full flex items-center justify-center overflow-hidden">
            {mode === 'pc_upload' && pcVideoUrl ? (
              <>
                <video
                  ref={sourceVideoRef}
                  src={pcVideoUrl}
                  muted
                  playsInline
                  preload="auto"
                  onLoadedData={() => drawFrameAtTime(currentTimeSec)}
                  className="w-full h-full object-contain"
                />
                <canvas
                  ref={videoOverlayCanvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                />
              </>
            ) : (
              <div className="p-6 text-center max-w-sm">
                <Upload className="w-9 h-9 text-slate-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-200">
                  {mode === 'demo_cycle'
                    ? activeDemoSample.title
                    : 'Suba un vídeo desde su PC para ver la captura de movimiento 1:1'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  El motor MediaPipe Pose Heavy rastrea 33 marcadores 3D (hombros, codos, muñecas, pelvis, rodillas, talones y puntas de pie) a 24 fps.
                </p>
                {mode === 'pc_upload' && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-3 px-4 py-2 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold cursor-pointer"
                  >
                    Seleccionar vídeo en mi PC
                  </button>
                )}
              </div>
            )}
          </div>

          {activeLiveSample && (
            <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-600">
              <span>
                Confianza Brazo Der: {Math.round(activeLiveSample.rightArmConfidence * 100)}%
                {' · '}
                Brazo Izq: {Math.round(activeLiveSample.leftArmConfidence * 100)}%
              </span>
              <span
                className={
                  activeLiveSample.hasOcclusion
                    ? 'text-amber-700 font-semibold'
                    : 'text-emerald-700 font-semibold'
                }
              >
                {activeLiveSample.hasOcclusion
                  ? 'Oclusión parcial detectada (use Opción C si requiere ajuste)'
                  : 'Visibilidad articular óptima'}
              </span>
            </div>
          )}
        </div>

        {/* Panel Derecho: Avatar 3D Mellizo con Cámara Fija 1:1 + Órbita Libre */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
          <div className="px-3.5 py-2.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold">
              2. Avatar 3D Mellizo (Cuaterniones 3D + Suelo Estacionario)
            </span>
            <div className="flex items-center gap-1.5">
              <select
                value={cameraPreset}
                onChange={(e) => {
                  setCameraPreset(e.target.value as CameraPreset);
                  setOrbit(DEFAULT_ORBIT_OVERRIDE);
                }}
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-100"
              >
                <option value="frontal">Vista 1:1 Cámara del Vídeo</option>
                <option value="sagittal_right">Perfil Derecho (90°)</option>
                <option value="sagittal_left">Perfil Izquierdo (-90°)</option>
                <option value="isometric">Isométrica 3D</option>
                <option value="dorsal">Posterior (Espalda)</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  setCameraPreset('frontal');
                  setOrbit(DEFAULT_ORBIT_OVERRIDE);
                }}
                title="Alinear exactamente con el eje óptico del vídeo"
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-sky-300 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                1:1
              </button>
            </div>
          </div>

          <div
            className="relative bg-white aspect-4/3 w-full flex items-center justify-center select-none cursor-grab active:cursor-grabbing"
            onPointerDown={(e) => {
              (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
              dragOrbitRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                startOrbit: { ...orbit },
              };
            }}
            onPointerMove={(e) => {
              if (!dragOrbitRef.current) return;
              const dx = e.clientX - dragOrbitRef.current.startX;
              const dy = e.clientY - dragOrbitRef.current.startY;
              setOrbit({
                ...dragOrbitRef.current.startOrbit,
                azimuthDeg: dragOrbitRef.current.startOrbit.azimuthDeg - dx * 0.45,
                elevationDeg: Math.max(
                  -35,
                  Math.min(55, dragOrbitRef.current.startOrbit.elevationDeg + dy * 0.35),
                ),
              });
            }}
            onPointerUp={() => {
              dragOrbitRef.current = null;
            }}
          >
            <canvas ref={avatarCanvasRef} className="w-full h-full object-contain" />
          </div>

          <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-700">
            <span>
              Tronco {Math.round(currentReadoutPose.trunkFlexionDeg)}° · Giro{' '}
              {Math.round(currentReadoutPose.rootYawDeg ?? 0)}° · Brazo D{' '}
              {Math.round(currentReadoutPose.shoulderRFlexionDeg)}° · Codo D{' '}
              {Math.max(30, Math.min(170, Math.round(180 - currentReadoutPose.elbowRFlexionDeg)))}° ·
              Rodilla{' '}
              {Math.round(
                Math.max(
                  currentReadoutPose.kneeRFlexionDeg,
                  currentReadoutPose.kneeLFlexionDeg,
                ),
              )}
              °
            </span>
            <label className="flex items-center gap-1.5 font-sans text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showAvatarAngleHUD}
                onChange={(e) => setShowAvatarAngleHUD(e.target.checked)}
              />
              Goniómetros 3D
            </label>
          </div>
        </div>
      </div>

      {/* Línea de tiempo sincronizada + Mobiliario / Estanterías movibles o solo foto final */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={isTracking || isRecordingTwin || (mode === 'pc_upload' && !pcVideoUrl)}
            onClick={() => setIsPlaying((p) => !p)}
            className="px-4 py-2 rounded-md bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isPlaying ? 'Pausar Sincronía' : 'Reproducir Sincronizado'}
          </button>

          <div className="flex-1 min-w-[200px]">
            <input
              type="range"
              min={0}
              max={Math.max(0.5, videoDurationSec)}
              step={0.02}
              value={Math.min(currentTimeSec, videoDurationSec)}
              onChange={(e) => handleScrubToTime(parseFloat(e.target.value))}
              className="w-full accent-sky-700 cursor-pointer"
            />
          </div>

          <span className="text-xs font-mono tabular-nums font-semibold text-slate-700">
            {currentTimeSec.toFixed(2)} s / {videoDurationSec.toFixed(2)} s
          </span>
        </div>

        {/* Control de Mobiliario / Estanterías: Mover, Quitar o Solo para la Foto Final */}
        <div className="pt-3 border-t border-slate-100 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-900">Mobiliario / Estanterías:</span>
              <select
                value={sceneProp}
                onChange={(e) => setSceneProp(e.target.value as ScenePropType)}
                className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs bg-white text-slate-800"
              >
                <option value="none">Sin muebles (Quitar todo)</option>
                <option value="cold_room_high_shelf">Estantería regulable (4 niveles)</option>
                <option value="pallet_jack_rack">Estantería industrial + tarima</option>
                <option value="work_desk_support">Mesa / Banco de apoyo</option>
                <option value="box_load">Caja industrial en manos</option>
                <option value="conveyor_veg_line">Línea / Cinta transportadora</option>
                <option value="hopper_sack_pour">Tolva + Saco</option>
                <option value="trench_shovel">Pala / Herramienta</option>
              </select>

              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded border border-slate-200">
                {(
                  [
                    ['always', 'Siempre visible'],
                    ['hidden', 'Quitar / Ocultar'],
                    ['final_photo_only', 'Solo para la foto final'],
                  ] as const
                ).map(([vMode, vLabel]) => (
                  <button
                    key={vMode}
                    type="button"
                    onClick={() => setPropVisibilityMode(vMode)}
                    className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                      propVisibilityMode === vMode
                        ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {vLabel}
                  </button>
                ))}
              </div>

              {propVisibilityMode === 'final_photo_only' && (
                <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-50 border border-amber-200 text-amber-950 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={previewFinalPhotoProp}
                    onChange={(e) => setPreviewFinalPhotoProp(e.target.checked)}
                  />
                  <span>Mostrar ahora para acomodarlo</span>
                </label>
              )}

              {(sceneProp === 'cold_room_high_shelf' || sceneProp === 'pallet_jack_rack') &&
                propVisibilityMode !== 'hidden' && (
                  <label className="inline-flex items-center gap-1.5 text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shelfBoxOnRack}
                      onChange={(e) => setShelfBoxOnRack(e.target.checked)}
                    />
                    <span>Caja apoyada en estante</span>
                  </label>
                )}
            </div>

            <div className="flex items-center gap-2">
              {(propOffsetX !== 0 ||
                propOffsetY !== 0 ||
                propOffsetZ !== 0 ||
                propRotYDeg !== 0 ||
                propScale !== 1) && (
                <button
                  type="button"
                  onClick={() => {
                    setPropOffsetX(0);
                    setPropOffsetY(0);
                    setPropOffsetZ(0);
                    setPropRotYDeg(0);
                    setPropScale(1);
                  }}
                  className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
                >
                  Restablecer posición
                </button>
              )}
              <button
                type="button"
                disabled={isRecordingTwin || isTracking}
                onClick={() => void handleDownloadFinalPhotoPng()}
                className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Descargar Foto Final PNG
              </button>
            </div>
          </div>

          {sceneProp !== 'none' &&
            propVisibilityMode !== 'hidden' &&
            (propVisibilityMode === 'always' || previewFinalPhotoProp) && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1 text-[11px]">
                <label className="space-y-0.5">
                  <span className="flex justify-between text-slate-600">
                    <span>Lateral X</span>
                    <span className="font-mono tabular-nums">{propOffsetX.toFixed(2)} m</span>
                  </span>
                  <input
                    type="range"
                    min={-1.5}
                    max={1.5}
                    step={0.04}
                    value={propOffsetX}
                    onChange={(e) => setPropOffsetX(Number(e.target.value))}
                    className="w-full accent-sky-700"
                  />
                </label>

                <label className="space-y-0.5">
                  <span className="flex justify-between text-slate-600">
                    <span>Profundidad Z</span>
                    <span className="font-mono tabular-nums">{propOffsetZ.toFixed(2)} m</span>
                  </span>
                  <input
                    type="range"
                    min={-1.0}
                    max={1.5}
                    step={0.04}
                    value={propOffsetZ}
                    onChange={(e) => setPropOffsetZ(Number(e.target.value))}
                    className="w-full accent-sky-700"
                  />
                </label>

                <label className="space-y-0.5">
                  <span className="flex justify-between text-slate-600">
                    <span>Altura Y</span>
                    <span className="font-mono tabular-nums">{propOffsetY.toFixed(2)} m</span>
                  </span>
                  <input
                    type="range"
                    min={-0.5}
                    max={1.0}
                    step={0.03}
                    value={propOffsetY}
                    onChange={(e) => setPropOffsetY(Number(e.target.value))}
                    className="w-full accent-sky-700"
                  />
                </label>

                <label className="space-y-0.5">
                  <span className="flex justify-between text-slate-600">
                    <span>Giro °</span>
                    <span className="font-mono tabular-nums">{propRotYDeg}°</span>
                  </span>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={5}
                    value={propRotYDeg}
                    onChange={(e) => setPropRotYDeg(Number(e.target.value))}
                    className="w-full accent-sky-700"
                  />
                </label>

                <label className="space-y-0.5">
                  <span className="flex justify-between text-slate-600">
                    <span>Escala</span>
                    <span className="font-mono tabular-nums">{propScale.toFixed(2)}×</span>
                  </span>
                  <input
                    type="range"
                    min={0.6}
                    max={1.6}
                    step={0.05}
                    value={propScale}
                    onChange={(e) => setPropScale(Number(e.target.value))}
                    className="w-full accent-sky-700"
                  />
                </label>
              </div>
            )}
        </div>

        {/* Tramos de oclusión detectados automáticamente */}
        {mode === 'pc_upload' &&
          mocapTimeline &&
          mocapTimeline.occlusionSegments.length > 0 && (
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-amber-800 flex items-center gap-1">
                <Crosshair className="w-3.5 h-3.5" />
                Tramos con brazo oculto por caja/cuerpo:
              </span>
              {mocapTimeline.occlusionSegments.map((seg, i) => (
                <button
                  key={`${seg.startSec}-${i}`}
                  type="button"
                  onClick={() => handleScrubToTime((seg.startSec + seg.endSec) * 0.5)}
                  className="px-2.5 py-1 rounded border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-mono tabular-nums text-[11px] cursor-pointer"
                >
                  {seg.startSec.toFixed(1)}s–{seg.endSec.toFixed(1)}s (
                  {seg.occludedSide === 'left'
                    ? 'Izq'
                    : seg.occludedSide === 'right'
                      ? 'Der'
                      : 'Ambos'}
                  )
                </button>
              ))}
            </div>
          )}
      </div>

      {/* OPCIÓN C: Panel de Corrección Asistida en Oclusiones (Keyframes Híbridos) */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Pin className="w-4 h-4 text-sky-700" />
              Corrección Asistida en Oclusiones (Keyframes Híbridos · Opción C)
            </h3>
            <p className="text-xs text-slate-600">
              Si una caja grande o máquina tapa una mano en un segundo puntual, pause el vídeo en ese instante, espeje el brazo oculto o ajuste el ángulo y pulse <strong>Fijar Corrección</strong>. El sistema interpola una curva suave sin saltos bruscos.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={autoAssistSevereOcclusion}
              onChange={(e) => setAutoAssistSevereOcclusion(e.target.checked)}
            />
            Auto-espejar cuando un brazo queda totalmente oculto (&lt;26%)
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-slate-700">
              Espejado bimanual en t = {currentTimeSec.toFixed(2)} s
            </label>
            <select
              value={draftMirrorArm}
              onChange={(e) =>
                setDraftMirrorArm(
                  e.target.value as 'none' | 'left_from_right' | 'right_from_left',
                )
              }
              className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-xs bg-white text-slate-800"
            >
              <option value="none">Sin espejado manual</option>
              <option value="left_from_right">
                Copiar Brazo Derecho → Izquierdo (oculto)
              </option>
              <option value="right_from_left">
                Copiar Brazo Izquierdo → Derecho (oculto)
              </option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="flex justify-between text-[11px] font-semibold text-slate-700">
              <span>Ajuste Tronco</span>
              <span className="font-mono tabular-nums">{draftTrunkPitchDeg > 0 ? `+${draftTrunkPitchDeg}` : draftTrunkPitchDeg}°</span>
            </label>
            <input
              type="range"
              min={-35}
              max={35}
              step={1}
              value={draftTrunkPitchDeg}
              onChange={(e) => setDraftTrunkPitchDeg(Number(e.target.value))}
              className="w-full accent-sky-700"
            />
          </div>

          <div className="space-y-1">
            <label className="flex justify-between text-[11px] font-semibold text-slate-700">
              <span>Ajuste Giro Pelvis</span>
              <span className="font-mono tabular-nums">{draftRootYawDeg > 0 ? `+${draftRootYawDeg}` : draftRootYawDeg}°</span>
            </label>
            <input
              type="range"
              min={-60}
              max={60}
              step={1}
              value={draftRootYawDeg}
              onChange={(e) => setDraftRootYawDeg(Number(e.target.value))}
              className="w-full accent-sky-700"
            />
          </div>

          <div className="space-y-1">
            <label className="flex justify-between text-[11px] font-semibold text-slate-700">
              <span>Ventana suave (±s)</span>
              <span className="font-mono tabular-nums">±{draftRadiusSec.toFixed(2)} s</span>
            </label>
            <input
              type="range"
              min={0.25}
              max={2.0}
              step={0.05}
              value={draftRadiusSec}
              onChange={(e) => setDraftRadiusSec(Number(e.target.value))}
              className="w-full accent-sky-700"
            />
          </div>

          <div className="space-y-1">
            <label className="flex justify-between text-[11px] font-semibold text-slate-700">
              <span>Ajuste Hombro Der</span>
              <span className="font-mono tabular-nums">{draftShoulderRDeg > 0 ? `+${draftShoulderRDeg}` : draftShoulderRDeg}°</span>
            </label>
            <input
              type="range"
              min={-45}
              max={45}
              step={1}
              value={draftShoulderRDeg}
              onChange={(e) => setDraftShoulderRDeg(Number(e.target.value))}
              className="w-full accent-sky-700"
            />
          </div>

          <div className="space-y-1">
            <label className="flex justify-between text-[11px] font-semibold text-slate-700">
              <span>Ajuste Codo Der</span>
              <span className="font-mono tabular-nums">{draftElbowRDeg > 0 ? `+${draftElbowRDeg}` : draftElbowRDeg}°</span>
            </label>
            <input
              type="range"
              min={-45}
              max={45}
              step={1}
              value={draftElbowRDeg}
              onChange={(e) => setDraftElbowRDeg(Number(e.target.value))}
              className="w-full accent-sky-700"
            />
          </div>

          <div className="space-y-1">
            <label className="flex justify-between text-[11px] font-semibold text-slate-700">
              <span>Ajuste Hombro Izq</span>
              <span className="font-mono tabular-nums">{draftShoulderLDeg > 0 ? `+${draftShoulderLDeg}` : draftShoulderLDeg}°</span>
            </label>
            <input
              type="range"
              min={-45}
              max={45}
              step={1}
              value={draftShoulderLDeg}
              onChange={(e) => setDraftShoulderLDeg(Number(e.target.value))}
              className="w-full accent-sky-700"
            />
          </div>

          <div className="space-y-1">
            <label className="flex justify-between text-[11px] font-semibold text-slate-700">
              <span>Ajuste Rodillas</span>
              <span className="font-mono tabular-nums">{draftKneeDeg > 0 ? `+${draftKneeDeg}` : draftKneeDeg}°</span>
            </label>
            <input
              type="range"
              min={-40}
              max={40}
              step={1}
              value={draftKneeDeg}
              onChange={(e) => setDraftKneeDeg(Number(e.target.value))}
              className="w-full accent-sky-700"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!hasDraftAdjustments}
              onClick={handleSaveCorrectionPin}
              className="px-3.5 py-2 rounded-md bg-sky-700 hover:bg-sky-800 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Pin className="w-3.5 h-3.5" />
              Fijar Corrección en t = {currentTimeSec.toFixed(2)} s
            </button>
            {hasDraftAdjustments && (
              <button
                type="button"
                onClick={resetDraftControls}
                className="px-3 py-2 rounded-md border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Limpiar ajuste actual
              </button>
            )}
          </div>

          {correctionPins.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {correctionPins.map((pin) => (
                <div
                  key={pin.id}
                  className="inline-flex items-center gap-1 border border-slate-300 bg-slate-50 rounded px-2 py-1 text-[11px] font-mono tabular-nums text-slate-800"
                >
                  <button
                    type="button"
                    onClick={() => handleScrubToTime(pin.timeSec)}
                    className="hover:text-sky-700 font-semibold cursor-pointer"
                  >
                    Pin {pin.timeSec.toFixed(2)}s (±{pin.radiusSec.toFixed(1)}s)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCorrectionPins((prev) => prev.filter((p) => p.id !== pin.id))
                    }
                    className="text-slate-400 hover:text-rose-600 cursor-pointer ml-1"
                    title="Eliminar pin"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Exportación de Vídeo Mellizo y Envío al Informe */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={exportLayout}
              onChange={(e) => setExportLayout(e.target.value as ExportVideoLayout)}
              className="border border-slate-300 rounded-md px-3 py-2 text-xs bg-white text-slate-800 font-medium"
            >
              <option value="side_by_side">
                Exportar Lado a Lado (Vídeo Original + Avatar 3D Mellizo)
              </option>
              <option value="avatar_only">Exportar Solo Avatar 3D Mellizo</option>
            </select>

            <select
              value={exportFps}
              onChange={(e) => setExportFps(Number(e.target.value) as 24 | 30)}
              className="border border-slate-300 rounded-md px-3 py-2 text-xs bg-white text-slate-800 font-mono tabular-nums"
            >
              <option value={24}>24 fps</option>
              <option value={30}>30 fps</option>
            </select>

            {exportLayout === 'side_by_side' && (
              <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeOverlayInExport}
                  onChange={(e) => setIncludeOverlayInExport(e.target.checked)}
                />
                Incluir vectores sobre vídeo real
              </label>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onEmitTwinFramesToStudy && (
              <button
                type="button"
                disabled={isRecordingTwin || isTracking}
                onClick={() => void handleSendKeyPosturesToStudy()}
                className="px-3.5 py-2 rounded-md border border-sky-700 text-sky-800 hover:bg-sky-50 disabled:opacity-40 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                Incorporar Toma y Destino al Informe
              </button>
            )}

            <button
              type="button"
              disabled={isRecordingTwin || isTracking}
              onClick={() => void handleRecordAndDownloadTwinVideo()}
              className="px-4 py-2 rounded-md bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              {isRecordingTwin
                ? `Grabando Vídeo Mellizo (${recordingPct}%)...`
                : 'Generar y Descargar Vídeo Mellizo 3D'}
            </button>
          </div>
        </div>

        {recordedVideoUrl && (
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Vista previa del Vídeo Mellizo generado (.{recordedVideoExt})
              </span>
              <a
                href={recordedVideoUrl}
                download={`avatar_mellizo_3d.${recordedVideoExt}`}
                className="text-xs font-bold text-sky-700 hover:underline flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                Volver a descargar archivo
              </a>
            </div>
            <video
              src={recordedVideoUrl}
              controls
              playsInline
              className="w-full max-h-[420px] rounded-md bg-slate-950 border border-slate-200"
            />
          </div>
        )}
      </div>
    </div>
  );
};

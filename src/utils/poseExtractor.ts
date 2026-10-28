import { PoseLandmarker } from '@mediapipe/tasks-vision';
import { PosturePose3D } from '../types/figurePlan';
import {
  buildErgonizaDigitalTwinJson,
  ErgonizaDigitalTwinJson,
  InvisibleErgonizaParameters,
} from './ergonizaBiomechEngine';
import { makeNeutralPose } from './figurePlanCatalog';
import { initHeavyPoseMoCap } from './mocapRetargeter';

interface Vec3 {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface SampledPoseKeyframe {
  timeSec: number;
  pose: PosturePose3D;
  compositeEffortScore: number;
  handHeightNorm: number;
  handHorizReachM: number;
  ergonizaAngles: ErgonizaDigitalTwinJson['sincronizacion_avatar_3d']['articulaciones_principales'];
  supportCondition: string;
  referencePlane: string;
  leftElbowDeg: number;
}

export interface RepetitiveVideoMetrics {
  cycleDurationSec: number;
  technicalActionsCountR: number;
  technicalActionsCountL: number;
  actionsPerMinR: number;
  actionsPerMinL: number;
  effortDurationSec: number;
  pctShoulderHigh: number;
  pctElbowWide: number;
  pctWristAwkward: number;
  recommendedOcraFreqScore: number;
  recommendedStereotypyScore: 0 | 1.5 | 3;
  estimatedHOriginCm: number;
  estimatedVOriginCm: number;
  estimatedHDestCm: number;
  estimatedVDestCm: number;
}

export interface VideoPoseTrackingResult {
  keyframes: SampledPoseKeyframe[];
  posesPorFrame: PosturePose3D[];
  peorPoseREBA: PosturePose3D;
  criticalKeyframe: SampledPoseKeyframe;
  originKeyframe: SampledPoseKeyframe;
  destKeyframe: SampledPoseKeyframe;
  originDigitalTwin: ErgonizaDigitalTwinJson;
  destDigitalTwin: ErgonizaDigitalTwinJson;
  ergonizaDigitalTwin: ErgonizaDigitalTwinJson;
  repetitiveMetrics: RepetitiveVideoMetrics;
}

// Reutiliza la instancia compartida Heavy -> Full -> Lite de mocapRetargeter

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(min, Math.min(max, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function mid3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
    z: (a.z + b.z) * 0.5,
    visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1),
  };
}

function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function norm3(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function normalize3(v: Vec3): Vec3 {
  const m = norm3(v);
  if (m < 1e-6) return { x: 0, y: 1, z: 0 };
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

function angleBetweenDeg(a: Vec3, b: Vec3): number {
  const na = norm3(a);
  const nb = norm3(b);
  if (na < 1e-6 || nb < 1e-6) return 0;
  const c = clamp(dot3(a, b) / (na * nb), -1, 1);
  return (Math.acos(c) * 180) / Math.PI;
}

/**
 * Inicializa MediaPipe PoseLandmarker 3D con respaldo automático GPU -> CPU.
 */
export async function initMediaPipeMoCap(): Promise<PoseLandmarker | null> {
  const loaded = await initHeavyPoseMoCap();
  return loaded ? loaded.landmarker : null;
}

function analyzeWorldLandmarksFrame(
  worldLm: Vec3[],
  normLm: Vec3[],
  verticalCalibrationDeg = 0,
): Omit<SampledPoseKeyframe, 'timeSec'> {
  const upGravity: Vec3 = { x: 0, y: -1, z: 0 };
  const downGravity: Vec3 = { x: 0, y: 1, z: 0 };

  const earL = worldLm[7] || { x: 0, y: -0.65, z: 0 };
  const earR = worldLm[8] || { x: 0, y: -0.65, z: 0 };
  const shL = worldLm[11];
  const shR = worldLm[12];
  const elbL = worldLm[13];
  const elbR = worldLm[14];
  const wrL = worldLm[15];
  const wrR = worldLm[16];
  const idxL = worldLm[19] || wrL;
  const idxR = worldLm[20] || wrR;
  const hipL = worldLm[23];
  const hipR = worldLm[24];
  const kneeL = worldLm[25];
  const kneeR = worldLm[26];
  const ankL = worldLm[27];
  const ankR = worldLm[28];

  const midHip = mid3(hipL, hipR);
  const midShoulder = mid3(shL, shR);
  const midEar = mid3(earL, earR);
  const midAnk = mid3(ankL, ankR);

  const lateralAxis = normalize3(sub3(shL, shR));
  const hipLateralAxis = normalize3(sub3(hipL, hipR));
  const trunkUpVec = sub3(midShoulder, midHip);
  const subjectForward = normalize3(cross3(lateralAxis, upGravity));

  const trunkTiltTotalDeg = angleBetweenDeg(trunkUpVec, upGravity);
  const forwardProj = dot3(normalize3(trunkUpVec), subjectForward);
  const signFlex = forwardProj >= -0.08 ? 1 : -1;
  const trunkFlexDeg = clamp(
    round1(signFlex * trunkTiltTotalDeg + verticalCalibrationDeg),
    -30,
    130,
  );

  const latProj = dot3(normalize3(trunkUpVec), hipLateralAxis);
  const trunkLatDeg = clamp(round1(-(Math.asin(clamp(latProj, -1, 1)) * 180) / Math.PI), -35, 35);

  const shHoriz = normalize3({ x: lateralAxis.x, y: 0, z: lateralAxis.z });
  const hipHoriz = normalize3({ x: hipLateralAxis.x, y: 0, z: hipLateralAxis.z });
  const twistMag = angleBetweenDeg(shHoriz, hipHoriz);
  const twistSign = cross3(hipHoriz, shHoriz).y >= 0 ? 1 : -1;
  const trunkTwistDeg = clamp(round1(twistSign * twistMag), -60, 60);

  const neckVec = sub3(midEar, midShoulder);
  const neckFlexDeg = clamp(round1(angleBetweenDeg(neckVec, trunkUpVec) - 8), -35, 45);

  const humerusR = sub3(elbR, shR);
  const forearmR = sub3(wrR, elbR);
  const handVecR = sub3(idxR, wrR);
  const humerusL = sub3(elbL, shL);
  const forearmL = sub3(wrL, elbL);
  const handVecL = sub3(idxL, wrL);
  const trunkDownVec = normalize3(sub3(midHip, midShoulder));

  const armElevationRDeg = angleBetweenDeg(humerusR, trunkDownVec);
  const armFwdComp = dot3(normalize3(humerusR), subjectForward);
  const armOutComp = -dot3(normalize3(humerusR), lateralAxis);

  const shoulderRFlexDeg = clamp(
    round1(
      armFwdComp >= -0.05
        ? armElevationRDeg *
            clamp(Math.abs(armFwdComp) / Math.max(0.25, Math.hypot(armFwdComp, armOutComp)), 0.35, 1)
        : -armElevationRDeg * 0.65,
    ),
    -49,
    185,
  );
  const shoulderRAbdDeg = clamp(
    round1(Math.max(0, (Math.asin(clamp(armOutComp, -1, 1)) * 180) / Math.PI)),
    0,
    135,
  );

  const elbowRFlexDeg = clamp(round1(angleBetweenDeg(humerusR, forearmR)), 0, 160);
  const elbowLFlexDeg = clamp(round1(angleBetweenDeg(humerusL, forearmL)), 0, 160);

  const wristRFlexDeg = clamp(round1(angleBetweenDeg(forearmR, handVecR) * 0.7), -35, 45);
  const wristLFlexDeg = clamp(round1(angleBetweenDeg(forearmL, handVecL) * 0.7), -35, 45);

  let humeralRotRDeg = 0;
  const nPlaneTorsoArm = cross3(trunkDownVec, normalize3(humerusR));
  const nPlaneArmFore = cross3(normalize3(humerusR), normalize3(forearmR));
  if (norm3(nPlaneTorsoArm) > 0.16 && norm3(nPlaneArmFore) > 0.16 && elbowRFlexDeg >= 12) {
    const rawDihedral = angleBetweenDeg(nPlaneTorsoArm, nPlaneArmFore);
    humeralRotRDeg = clamp(round1(rawDihedral - 90), -90, 90);
  }

  const thighR = sub3(kneeR, hipR);
  const shankR = sub3(ankR, kneeR);
  const thighL = sub3(kneeL, hipL);
  const shankL = sub3(ankL, kneeL);

  const kneeRFlexDeg = clamp(round1(angleBetweenDeg(thighR, shankR)), 0, 155);
  const kneeLFlexDeg = clamp(round1(angleBetweenDeg(thighL, shankL)), 0, 155);
  const hipRFlexDeg = clamp(round1(angleBetweenDeg(thighR, downGravity)), -25, 128);
  const hipLFlexDeg = clamp(round1(angleBetweenDeg(thighL, downGravity)), -25, 128);

  const ankDiffY = Math.abs((ankR.y ?? 0) - (ankL.y ?? 0));
  let supportCondition = 'Bipedestación bilateral';
  let stanceMode: NonNullable<PosturePose3D['stanceMode']> = 'standing';

  if (hipRFlexDeg >= 68 && kneeRFlexDeg >= 68 && Math.abs(thighR.y) < 0.18 && trunkFlexDeg <= 28) {
    supportCondition = 'Sedestación (apoyo isquiático y podal)';
    stanceMode = 'seated';
  } else if (ankDiffY > 0.14) {
    supportCondition = 'Monopedestación / Apoyo podal asimétrico';
    stanceMode = 'one_leg';
  } else if (Math.max(kneeRFlexDeg, kneeLFlexDeg) >= 70) {
    supportCondition = 'Bipedestación bilateral con flexión profunda de rodillas (cuclillas)';
    stanceMode = 'squatting';
  } else if (Math.abs(ankR.z - ankL.z) > 0.22) {
    supportCondition = 'Bipedestación asimétrica (paso adelantado)';
    stanceMode = 'standing';
  }

  const shSpan2D = Math.abs((normLm[11]?.x ?? 0.4) - (normLm[12]?.x ?? 0.6));
  const referencePlane =
    shSpan2D > 0.19 ? 'Frontal' : shSpan2D > 0.11 ? 'Sagital/Frontal' : 'Sagital';

  const armElevationLDeg = angleBetweenDeg(humerusL, trunkDownVec);
  const armFwdCompL = dot3(normalize3(humerusL), subjectForward);
  const armOutCompL = dot3(normalize3(humerusL), lateralAxis);
  const shoulderLFlexDeg = clamp(
    round1(
      armFwdCompL >= -0.05
        ? armElevationLDeg *
            clamp(Math.abs(armFwdCompL) / Math.max(0.25, Math.hypot(armFwdCompL, armOutCompL)), 0.35, 1)
        : -armElevationLDeg * 0.65,
    ),
    -40,
    180,
  );
  const shoulderLAbdDeg = clamp(
    round1(Math.max(0, (Math.asin(clamp(armOutCompL, -1, 1)) * 180) / Math.PI)),
    0,
    130,
  );

  const poseFrame = makeNeutralPose({
    trunkFlexionDeg: trunkFlexDeg,
    trunkLateralDeg: trunkLatDeg,
    trunkTwistDeg: trunkTwistDeg,
    neckFlexionDeg: neckFlexDeg,
    shoulderRFlexionDeg: shoulderRFlexDeg,
    shoulderRAbductionDeg: shoulderRAbdDeg,
    shoulderRRotationDeg: humeralRotRDeg,
    shoulderLFlexionDeg: shoulderLFlexDeg,
    shoulderLAbductionDeg: shoulderLAbdDeg,
    elbowRFlexionDeg: elbowRFlexDeg,
    elbowLFlexionDeg: elbowLFlexDeg,
    wristRFlexionDeg: wristRFlexDeg,
    wristLFlexionDeg: wristLFlexDeg,
    hipRFlexionDeg: hipRFlexDeg,
    kneeRFlexionDeg: kneeRFlexDeg,
    ankleRDorsiflexionDeg: clamp(round1(kneeRFlexDeg - hipRFlexDeg), -24, 34),
    hipLFlexionDeg: hipLFlexDeg,
    kneeLFlexionDeg: kneeLFlexDeg,
    ankleLDorsiflexionDeg: clamp(round1(kneeLFlexDeg - hipLFlexDeg), -24, 34),
    stanceMode,
  });

  const midWrist = mid3(wrR, wrL);
  const handReachHoriz = Math.hypot(midWrist.x - midAnk.x, midWrist.z - midAnk.z);
  const compositeEffortScore =
    Math.abs(trunkFlexDeg) * 1.35 +
    Math.abs(trunkLatDeg) * 0.9 +
    Math.abs(trunkTwistDeg) * 0.85 +
    Math.max(kneeRFlexDeg, kneeLFlexDeg) * 0.42 +
    Math.abs(shoulderRFlexDeg) * 0.55 +
    handReachHoriz * 85;

  const avgWristNormY = 1 - ((normLm[15]?.y ?? 0.5) + (normLm[16]?.y ?? 0.5)) * 0.5;

  return {
    pose: poseFrame,
    compositeEffortScore,
    handHeightNorm: clamp(avgWristNormY, 0.05, 0.95),
    handHorizReachM: clamp(handReachHoriz, 0.22, 0.82),
    ergonizaAngles: {
      tronco: {
        flexion_extension_grados: trunkFlexDeg,
        lateralizacion_grados: trunkLatDeg,
        rotacion_axial_grados: trunkTwistDeg,
      },
      hombro_derecho: {
        flexion_anteroposterior_grados: shoulderRFlexDeg,
        abduccion_aduccion_grados: shoulderRAbdDeg,
        rotacion_humeral_grados: humeralRotRDeg,
      },
      codo_derecho: {
        flexion_extension_grados: elbowRFlexDeg,
      },
      cadera_derecha: {
        flexion_extension_grados: hipRFlexDeg,
      },
      rodilla_derecha: {
        flexion_extension_grados: kneeRFlexDeg,
      },
    },
    supportCondition,
    referencePlane,
    leftElbowDeg: elbowLFlexDeg,
  };
}

function seekVideoSafe(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve) => {
    const clamped = Math.max(0, Math.min(Math.max(0, (video.duration || 1) - 0.04), timeSec));
    if (Math.abs(video.currentTime - clamped) < 0.015) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', finish);
      resolve();
    };
    const timer = window.setTimeout(finish, 450);
    video.addEventListener(
      'seeked',
      () => {
        window.clearTimeout(timer);
        finish();
      },
      { once: true },
    );
    video.currentTime = clamped;
  });
}

function countAngularReversals(values: number[], minDeltaDeg = 12): number {
  if (values.length < 2) return 1;
  let actions = 0;
  let anchor = values[0];
  let dir: -1 | 0 | 1 = 0;

  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - anchor;
    if (Math.abs(diff) >= minDeltaDeg) {
      const nextDir: -1 | 1 = diff > 0 ? 1 : -1;
      if (nextDir !== dir) {
        actions += 1;
        dir = nextDir;
      }
      anchor = values[i];
    }
  }
  return Math.max(1, actions);
}

function computeRepetitiveVideoMetrics(
  keyframes: SampledPoseKeyframe[],
  durationSec: number,
  originKf: SampledPoseKeyframe,
  destKf: SampledPoseKeyframe,
  statureCm = 172,
): RepetitiveVideoMetrics {
  const safeDur = Math.max(1.5, round1(durationSec));
  const seriesR = keyframes.map(
    (k) => k.pose.shoulderRFlexionDeg * 0.65 + k.pose.elbowRFlexionDeg * 0.85 + Math.abs(k.pose.wristRFlexionDeg),
  );
  const seriesL = keyframes.map(
    (k) => k.pose.shoulderLFlexionDeg * 0.65 + k.pose.elbowLFlexionDeg * 0.85 + Math.abs(k.pose.wristLFlexionDeg ?? 0),
  );

  const technicalActionsCountR = countAngularReversals(seriesR, 11);
  const technicalActionsCountL = countAngularReversals(seriesL, 11);
  const actionsPerMinR = round1((technicalActionsCountR / safeDur) * 60);
  const actionsPerMinL = round1((technicalActionsCountL / safeDur) * 60);

  const n = Math.max(1, keyframes.length);
  const shHighCount = keyframes.filter(
    (k) => k.pose.shoulderRFlexionDeg >= 80 || k.pose.shoulderRAbductionDeg >= 80,
  ).length;
  const elbWideCount = keyframes.filter(
    (k) => k.pose.elbowRFlexionDeg >= 100 || k.pose.elbowRFlexionDeg <= 45,
  ).length;
  const wrAwkwardCount = keyframes.filter((k) => Math.abs(k.pose.wristRFlexionDeg) >= 20).length;
  const activeEffortFrames = keyframes.filter((k) => k.compositeEffortScore >= 38).length;

  const pctShoulderHigh = Math.round((shHighCount / n) * 100);
  const pctElbowWide = Math.round((elbWideCount / n) * 100);
  const pctWristAwkward = Math.round((wrAwkwardCount / n) * 100);
  const effortDurationSec = round1(Math.max(0.6, (activeEffortFrames / n) * safeDur));

  const recommendedOcraFreqScore =
    actionsPerMinR >= 70
      ? 10
      : actionsPerMinR >= 60
        ? 8
        : actionsPerMinR >= 50
          ? 6
          : actionsPerMinR >= 40
            ? 3
            : actionsPerMinR >= 25
              ? 1
              : 0;

  const recommendedStereotypyScore: 0 | 1.5 | 3 =
    safeDur < 8 ? 3 : safeDur <= 15 ? 1.5 : 0;

  const scaleHeight = statureCm / 172;
  const estimatedVOriginCm = Math.round(clamp(originKf.handHeightNorm * 165 * scaleHeight, 12, 175));
  const estimatedVDestCm = Math.round(clamp(destKf.handHeightNorm * 165 * scaleHeight, 12, 175));
  const estimatedHOriginCm = Math.round(clamp(originKf.handHorizReachM * 100, 25, 72));
  const estimatedHDestCm = Math.round(clamp(destKf.handHorizReachM * 100, 25, 72));

  return {
    cycleDurationSec: safeDur,
    technicalActionsCountR,
    technicalActionsCountL,
    actionsPerMinR,
    actionsPerMinL,
    effortDurationSec,
    pctShoulderHigh,
    pctElbowWide,
    pctWristAwkward,
    recommendedOcraFreqScore,
    recommendedStereotypyScore,
    estimatedHOriginCm,
    estimatedVOriginCm,
    estimatedHDestCm,
    estimatedVDestCm,
  };
}

/**
 * Recorre el vídeo muestreado uniformemente y extrae:
 * - Postura de Toma de Carga (Origen) + su JSON 3D exacto
 * - Postura de Destino + su JSON 3D exacto
 * - Fotograma Crítico (pico biomecánico)
 * - Métricas de Movimientos Repetitivos (OCRA / JSI / NAM)
 */
export async function trackVideoFrames(
  videoElement: HTMLVideoElement,
  options?: {
    maxSamples?: number;
    verticalCalibrationDeg?: number;
    invisibleParams?: Partial<InvisibleErgonizaParameters>;
    onProgress?: (pct: number) => void;
  },
): Promise<VideoPoseTrackingResult | null> {
  const landmarker = await initMediaPipeMoCap();
  if (!landmarker) return null;

  const duration =
    Number.isFinite(videoElement.duration) && videoElement.duration > 0.2
      ? videoElement.duration
      : 4;
  const sampleCount = Math.max(10, Math.min(options?.maxSamples ?? 22, Math.ceil(duration * 5)));
  const keyframes: SampledPoseKeyframe[] = [];
  let monotonicTsMs = Math.round(performance.now());

  for (let i = 0; i < sampleCount; i++) {
    const tSec =
      sampleCount <= 1
        ? duration * 0.5
        : 0.04 * duration + (i / (sampleCount - 1)) * (duration * 0.92);
    await seekVideoSafe(videoElement, tSec);

    monotonicTsMs += 42;
    try {
      const result = landmarker.detectForVideo(videoElement, monotonicTsMs);
      if (
        result.worldLandmarks &&
        result.worldLandmarks.length > 0 &&
        result.landmarks &&
        result.landmarks.length > 0
      ) {
        const analyzed = analyzeWorldLandmarksFrame(
          result.worldLandmarks[0] as Vec3[],
          result.landmarks[0] as Vec3[],
          options?.verticalCalibrationDeg ?? 0,
        );
        keyframes.push({
          timeSec: round1(tSec),
          ...analyzed,
        });
      }
    } catch {
      // Continuar con el siguiente fotograma
    }

    options?.onProgress?.(Math.round(((i + 1) / sampleCount) * 100));
  }

  if (keyframes.length === 0) return null;

  let criticalKeyframe = keyframes[0];
  let minHandKf = keyframes[0];
  let maxHandKf = keyframes[keyframes.length - 1];

  for (const kf of keyframes) {
    if (kf.compositeEffortScore > criticalKeyframe.compositeEffortScore) {
      criticalKeyframe = kf;
    }
    if (kf.handHeightNorm < minHandKf.handHeightNorm) {
      minHandKf = kf;
    }
    if (kf.handHeightNorm > maxHandKf.handHeightNorm) {
      maxHandKf = kf;
    }
  }

  let originKeyframe = minHandKf.timeSec <= maxHandKf.timeSec ? minHandKf : maxHandKf;
  let destKeyframe = minHandKf.timeSec <= maxHandKf.timeSec ? maxHandKf : minHandKf;

  // Garantizar que Toma de Carga (Origen) y Destino sean dos instantes diferenciados del ciclo
  if (Math.abs(destKeyframe.timeSec - originKeyframe.timeSec) < 0.35 && keyframes.length >= 4) {
    const midIdx = Math.max(1, Math.floor(keyframes.length / 2));
    const firstHalf = keyframes.slice(0, midIdx);
    const secondHalf = keyframes.slice(midIdx);
    originKeyframe = firstHalf.reduce((best, cur) =>
      cur.compositeEffortScore > best.compositeEffortScore ? cur : best,
    );
    destKeyframe = secondHalf.reduce((best, cur) =>
      cur.compositeEffortScore > best.compositeEffortScore ? cur : best,
    );
  }

  const ergonizaDigitalTwin = buildErgonizaDigitalTwinJson({
    analisisExitoso: true,
    fotogramaCriticoSegundo: criticalKeyframe.timeSec,
    condicionesApoyo: criticalKeyframe.supportCondition,
    planoReferencia: criticalKeyframe.referencePlane,
    articulaciones: criticalKeyframe.ergonizaAngles,
    invisibleParams: options?.invisibleParams,
    verticalCalibrationOffsetDeg: 0,
  });

  const originDigitalTwin = buildErgonizaDigitalTwinJson({
    analisisExitoso: true,
    fotogramaCriticoSegundo: originKeyframe.timeSec,
    condicionesApoyo: originKeyframe.supportCondition,
    planoReferencia: originKeyframe.referencePlane,
    articulaciones: originKeyframe.ergonizaAngles,
    invisibleParams: options?.invisibleParams,
    verticalCalibrationOffsetDeg: 0,
  });

  const destDigitalTwin = buildErgonizaDigitalTwinJson({
    analisisExitoso: true,
    fotogramaCriticoSegundo: destKeyframe.timeSec,
    condicionesApoyo: destKeyframe.supportCondition,
    planoReferencia: destKeyframe.referencePlane,
    articulaciones: destKeyframe.ergonizaAngles,
    invisibleParams: options?.invisibleParams,
    verticalCalibrationOffsetDeg: 0,
  });

  const repetitiveMetrics = computeRepetitiveVideoMetrics(
    keyframes,
    duration,
    originKeyframe,
    destKeyframe,
    options?.invisibleParams?.statureCm ?? 172,
  );

  return {
    keyframes,
    posesPorFrame: keyframes.map((k) => k.pose),
    peorPoseREBA: criticalKeyframe.pose,
    criticalKeyframe,
    originKeyframe,
    destKeyframe,
    originDigitalTwin,
    destDigitalTwin,
    ergonizaDigitalTwin,
    repetitiveMetrics,
  };
}

function lerpNum(a: number, b: number, t: number): number {
  return round1(a + (b - a) * t);
}

export function interpolatePosturePose3D(
  a: PosturePose3D,
  b: PosturePose3D,
  tRaw: number,
): PosturePose3D {
  const t = clamp(tRaw, 0, 1);
  return {
    ...a,
    trunkFlexionDeg: lerpNum(a.trunkFlexionDeg, b.trunkFlexionDeg, t),
    trunkLateralDeg: lerpNum(a.trunkLateralDeg, b.trunkLateralDeg, t),
    trunkTwistDeg: lerpNum(a.trunkTwistDeg, b.trunkTwistDeg, t),
    neckFlexionDeg: lerpNum(a.neckFlexionDeg, b.neckFlexionDeg, t),
    neckLateralDeg: lerpNum(a.neckLateralDeg, b.neckLateralDeg, t),
    neckTwistDeg: lerpNum(a.neckTwistDeg, b.neckTwistDeg, t),
    shoulderRFlexionDeg: lerpNum(a.shoulderRFlexionDeg, b.shoulderRFlexionDeg, t),
    shoulderRAbductionDeg: lerpNum(a.shoulderRAbductionDeg, b.shoulderRAbductionDeg, t),
    shoulderRRotationDeg: lerpNum(a.shoulderRRotationDeg ?? 0, b.shoulderRRotationDeg ?? 0, t),
    shoulderLFlexionDeg: lerpNum(a.shoulderLFlexionDeg, b.shoulderLFlexionDeg, t),
    shoulderLAbductionDeg: lerpNum(a.shoulderLAbductionDeg, b.shoulderLAbductionDeg, t),
    shoulderLRotationDeg: lerpNum(a.shoulderLRotationDeg ?? 0, b.shoulderLRotationDeg ?? 0, t),
    elbowRFlexionDeg: lerpNum(a.elbowRFlexionDeg, b.elbowRFlexionDeg, t),
    elbowLFlexionDeg: lerpNum(a.elbowLFlexionDeg, b.elbowLFlexionDeg, t),
    forearmRPronationDeg: lerpNum(a.forearmRPronationDeg, b.forearmRPronationDeg, t),
    forearmLPronationDeg: lerpNum(a.forearmLPronationDeg ?? 0, b.forearmLPronationDeg ?? 0, t),
    wristRFlexionDeg: lerpNum(a.wristRFlexionDeg, b.wristRFlexionDeg, t),
    wristRDeviationDeg: lerpNum(a.wristRDeviationDeg, b.wristRDeviationDeg, t),
    wristLFlexionDeg: lerpNum(a.wristLFlexionDeg ?? 0, b.wristLFlexionDeg ?? 0, t),
    hipRFlexionDeg: lerpNum(a.hipRFlexionDeg, b.hipRFlexionDeg, t),
    kneeRFlexionDeg: lerpNum(a.kneeRFlexionDeg, b.kneeRFlexionDeg, t),
    ankleRDorsiflexionDeg: lerpNum(a.ankleRDorsiflexionDeg, b.ankleRDorsiflexionDeg, t),
    hipLFlexionDeg: lerpNum(a.hipLFlexionDeg, b.hipLFlexionDeg, t),
    kneeLFlexionDeg: lerpNum(a.kneeLFlexionDeg, b.kneeLFlexionDeg, t),
    ankleLDorsiflexionDeg: lerpNum(a.ankleLDorsiflexionDeg, b.ankleLDorsiflexionDeg, t),
    stanceMode: t < 0.5 ? a.stanceMode : b.stanceMode,
    prop: t < 0.5 ? a.prop : b.prop,
  };
}

/**
 * Rastreo cinemático denso con suavizado EMA temporal para generar un Vídeo Mellizo 3D
 * que copia la trayectoria exacta del vídeo subido desde la PC.
 */
export async function trackDenseVideoTimeline(
  videoElement: HTMLVideoElement,
  options?: {
    targetFps?: number;
    verticalCalibrationDeg?: number;
    onProgress?: (pct: number) => void;
  },
): Promise<SampledPoseKeyframe[]> {
  const landmarker = await initMediaPipeMoCap();
  if (!landmarker) return [];

  const duration =
    Number.isFinite(videoElement.duration) && videoElement.duration > 0.2
      ? videoElement.duration
      : 4;
  const fps = clamp(options?.targetFps ?? 12, 6, 20);
  const totalSamples = Math.max(12, Math.min(220, Math.ceil(duration * fps)));
  const rawFrames: SampledPoseKeyframe[] = [];
  let monotonicTsMs = Math.round(performance.now());

  for (let i = 0; i < totalSamples; i++) {
    const tSec = totalSamples <= 1 ? 0 : (i / (totalSamples - 1)) * Math.max(0.1, duration - 0.05);
    await seekVideoSafe(videoElement, tSec);
    monotonicTsMs += Math.round(1000 / fps);
    try {
      const result = landmarker.detectForVideo(videoElement, monotonicTsMs);
      if (
        result.worldLandmarks &&
        result.worldLandmarks.length > 0 &&
        result.landmarks &&
        result.landmarks.length > 0
      ) {
        const analyzed = analyzeWorldLandmarksFrame(
          result.worldLandmarks[0] as Vec3[],
          result.landmarks[0] as Vec3[],
          options?.verticalCalibrationDeg ?? 0,
        );
        rawFrames.push({
          timeSec: Math.round(tSec * 100) / 100,
          ...analyzed,
        });
      } else if (rawFrames.length > 0) {
        rawFrames.push({
          ...rawFrames[rawFrames.length - 1],
          timeSec: Math.round(tSec * 100) / 100,
        });
      }
    } catch {
      if (rawFrames.length > 0) {
        rawFrames.push({
          ...rawFrames[rawFrames.length - 1],
          timeSec: Math.round(tSec * 100) / 100,
        });
      }
    }
    options?.onProgress?.(Math.round(((i + 1) / totalSamples) * 100));
  }

  if (rawFrames.length <= 1) return rawFrames;

  // Suavizado exponencial temporal (EMA alpha = 0.44) para evitar saltos de cámara/ruido sin perder picos reales
  const smoothed: SampledPoseKeyframe[] = [rawFrames[0]];
  for (let i = 1; i < rawFrames.length; i++) {
    const prevPose = smoothed[i - 1].pose;
    const cur = rawFrames[i];
    const smoothPose = interpolatePosturePose3D(prevPose, cur.pose, 0.44);
    smoothed.push({
      ...cur,
      pose: smoothPose,
    });
  }
  return smoothed;
}

import {
  AngleAnnotation,
  MethodId,
  StudyPhoto,
  StudyTab,
} from '../types/ergonomics';
import {
  BookFigureFileSpec,
  Panel3DSpec,
  PosturePose3D,
} from '../types/figurePlan';
import {
  DEFAULT_ORBIT_OVERRIDE,
  ensureAvatarGlbLoaded,
  renderBookFigureToCanvas,
  renderInteractivePose3DToCanvas,
} from './biomech3dRenderer';
import { makeNeutralPose } from './figurePlanCatalog';

export interface MethodAvatarSheetSpec {
  idSuffix: string;
  title: string;
  caption: string;
  widthPx: number;
  heightPx: number;
  panels: Panel3DSpec[];
  angleSummary: Array<{ label: string; degrees: number }>;
}

const BIOMECH_VISUAL_METHODS = new Set<MethodId>([
  MethodId.RULA,
  MethodId.REBA,
  MethodId.OWAS,
  MethodId.NIOSH,
  MethodId.SNOOK,
  MethodId.LMC_295,
  MethodId.OCRA_COMPLETO,
  MethodId.OCRA_CHECKLIST,
  MethodId.JSI,
  MethodId.NAM_295,
]);

export function isBiomechanicalVisualMethod(method: MethodId): boolean {
  return BIOMECH_VISUAL_METHODS.has(method);
}

export function isAvatarReplicaPhoto(photo: StudyPhoto): boolean {
  const id = (photo.id || '').toLowerCase();
  const name = (photo.name || '').toLowerCase();
  const cap = (photo.caption || '').toLowerCase();
  return (
    id.includes('avatar') ||
    id.includes('twin') ||
    id.includes('3d-auto') ||
    name.includes('avatar 3d') ||
    name.includes('gemelo digital') ||
    name.includes('réplica 3d') ||
    name.includes('replica 3d') ||
    cap.includes('gemelo digital 3d') ||
    cap.includes('avatar 3d')
  );
}

function buildLiftPoseFromGeometry(
  vCm: number,
  hCm: number,
  asymDeg: number,
  loadKg: number,
  phase: 'origin' | 'dest',
): {
  pose: PosturePose3D;
  trunkDeg: number;
  shoulderDeg: number;
  elbowDeg: number;
  kneeDeg: number;
  hipDeg: number;
} {
  const vClamped = Math.max(0, Math.min(185, vCm));
  const hClamped = Math.max(20, Math.min(80, hCm));
  const reachFactor = Math.max(0, (hClamped - 25) / 40);

  let trunkDeg = 8;
  let kneeDeg = 8;
  let hipDeg = 12;
  let shoulderDeg = 35;
  let elbowDeg = 68;
  let stanceMode: NonNullable<PosturePose3D['stanceMode']> = 'standing';

  if (vClamped < 35) {
    // Toma baja cerca del suelo/tarima: flexión combinada de rodillas y bisagra coxofemoral
    kneeDeg = Math.round(62 + (35 - vClamped) * 0.65);
    trunkDeg = Math.round(34 + reachFactor * 16);
    hipDeg = Math.round(Math.min(108, kneeDeg * 0.72 + trunkDeg * 0.45));
    shoulderDeg = Math.round(44 + reachFactor * 18);
    elbowDeg = Math.round(28 + reachFactor * 10);
    stanceMode = kneeDeg >= 68 ? 'squatting' : 'standing';
  } else if (vClamped < 75) {
    // Zona entre espinilla y nudillos
    const ratio = (75 - vClamped) / 40;
    kneeDeg = Math.round(18 + ratio * 34);
    trunkDeg = Math.round(14 + ratio * 24 + reachFactor * 12);
    hipDeg = Math.round(kneeDeg * 0.65 + trunkDeg * 0.45);
    shoulderDeg = Math.round(32 + reachFactor * 22);
    elbowDeg = Math.round(58 - ratio * 20);
  } else if (vClamped <= 115) {
    // Zona óptima nudillos a pecho
    const ratio = (vClamped - 75) / 40;
    kneeDeg = 6;
    trunkDeg = Math.round(6 + reachFactor * 10);
    hipDeg = 8;
    shoulderDeg = Math.round(36 + ratio * 28 + reachFactor * 14);
    elbowDeg = Math.round(78 - ratio * 12);
  } else {
    // Estantería alta / sobre hombro
    const ratio = Math.min(1, (vClamped - 115) / 55);
    kneeDeg = 4;
    trunkDeg = Math.round(-4 + reachFactor * 6);
    hipDeg = 4;
    shoulderDeg = Math.round(78 + ratio * 48);
    elbowDeg = Math.round(52 - ratio * 18);
  }

  const twistDeg = Math.max(-60, Math.min(60, Math.round(asymDeg * 0.65)));
  const pose = makeNeutralPose({
    stanceMode,
    trunkFlexionDeg: trunkDeg,
    trunkTwistDeg: twistDeg,
    trunkLateralDeg: Math.abs(asymDeg) >= 30 ? 6 : 0,
    neckFlexionDeg: vClamped > 125 ? -12 : trunkDeg > 28 ? 8 : 4,
    shoulderRFlexionDeg: shoulderDeg,
    shoulderLFlexionDeg: shoulderDeg,
    shoulderRAbductionDeg: 10,
    shoulderLAbductionDeg: 10,
    elbowRFlexionDeg: elbowDeg,
    elbowLFlexionDeg: elbowDeg,
    forearmRPronationDeg: -16,
    forearmLPronationDeg: 16,
    hipRFlexionDeg: hipDeg,
    hipLFlexionDeg: hipDeg,
    kneeRFlexionDeg: kneeDeg,
    kneeLFlexionDeg: kneeDeg,
    ankleRDorsiflexionDeg: Math.max(-18, Math.min(28, kneeDeg - hipDeg)),
    ankleLDorsiflexionDeg: Math.max(-18, Math.min(28, kneeDeg - hipDeg)),
    prop: 'box_load',
    loadKg,
    handGripMode: 'box_cradle',
    loadDetachedPhase: phase === 'origin' ? 'carried' : 'carried',
  });

  return { pose, trunkDeg, shoulderDeg, elbowDeg, kneeDeg, hipDeg };
}

export function buildMethodAvatarSheetSpecs(tab: StudyTab): MethodAvatarSheetSpec[] {
  switch (tab.method) {
    case MethodId.RULA: {
      const d = tab.payloads[MethodId.RULA];
      const side = d.evaluatedSide === 'izquierdo' ? d.left : d.right;
      const shDeg =
        side.upperArmPos === 1 ? 12 : side.upperArmPos === 2 ? 34 : side.upperArmPos === 3 ? 68 : 108;
      const elbDeg = side.lowerArmPos === 1 ? 84 : 18;
      const elbIntDeg = 180 - elbDeg;
      const wrDeg = side.wristPos === 1 ? 0 : side.wristPos === 2 ? 12 : 28;
      const nkDeg = d.neckPos === 1 ? 6 : d.neckPos === 2 ? 16 : d.neckPos === 3 ? 30 : -18;
      const trDeg = d.trunkPos === 1 ? 0 : d.trunkPos === 2 ? 14 : d.trunkPos === 3 ? 40 : 68;
      const isSeated = d.trunkPos === 1 && d.legsPos === 1;

      const pose = makeNeutralPose({
        stanceMode: isSeated ? 'seated' : d.legsPos === 2 ? 'one_leg' : 'standing',
        prop: side.armSupported ? 'work_desk_support' : isSeated ? 'chair' : 'none',
        trunkFlexionDeg: trDeg,
        trunkTwistDeg: d.trunkTwisted ? 24 : 0,
        trunkLateralDeg: d.trunkSideBending ? 16 : 0,
        neckFlexionDeg: nkDeg,
        neckTwistDeg: d.neckRotated ? 26 : 0,
        neckLateralDeg: d.neckSideBending ? 18 : 0,
        shoulderRFlexionDeg: shDeg,
        shoulderRAbductionDeg: side.armAbducted ? 38 : 6,
        shoulderRElevated: side.shoulderRaised,
        shoulderLFlexionDeg: d.evaluatedSide === 'ambos' ? shDeg : 10,
        elbowRFlexionDeg: elbDeg,
        elbowLFlexionDeg: d.evaluatedSide === 'ambos' ? elbDeg : 16,
        forearmRCrossMidline: side.lowerArmCrossMidline,
        forearmRPronationDeg: side.wristTwist === 2 ? -80 : 15,
        wristRFlexionDeg: wrDeg,
        wristRDeviationDeg: side.wristDeviated ? 18 : 0,
        hipRFlexionDeg: isSeated ? 90 : 4,
        kneeRFlexionDeg: isSeated ? 90 : 4,
        hipLFlexionDeg: isSeated ? 90 : d.legsPos === 2 ? 24 : 4,
        kneeLFlexionDeg: isSeated ? 90 : d.legsPos === 2 ? 48 : 4,
      });

      return [
        {
          idSuffix: 'rula-3d',
          title: `Réplica Avatar 3D · RULA (${tab.tabLabel})`,
          caption: `Réplica Avatar 3D con ángulos exactos RULA · Tronco ${trDeg}°, Cuello ${nkDeg}°, Hombro ${shDeg}°, Codo int. ${elbIntDeg}°, Muñeca ${wrDeg}°`,
          widthPx: 680,
          heightPx: 520,
          panels: [
            {
              subTitle: `Postura RULA · Tronco ${trDeg}° · Brazo ${shDeg}° · Codo ${elbIntDeg}°`,
              scoreBadge: `Muñeca ${wrDeg}° · Cuello ${nkDeg}°`,
              focusZone: 'full_body',
              cameraPreset: d.trunkTwisted || side.armAbducted ? 'isometric' : 'sagittal_right',
              pose,
              angleArcs: [
                { joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: `Tronco ${trDeg}°` },
                { joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: `Hombro ${shDeg}°` },
                { joint: 'elbowR', refType: 'internal_segment', parentJoint: 'shoulderR', toJoint: 'wristR', label: `Codo ${elbIntDeg}°` },
              ],
            },
          ],
          angleSummary: [
            { label: 'Tronco', degrees: trDeg },
            { label: 'Cuello', degrees: nkDeg },
            { label: 'Hombro', degrees: shDeg },
            { label: 'Codo (int.)', degrees: elbIntDeg },
            { label: 'Muñeca', degrees: wrDeg },
          ],
        },
      ];
    }

    case MethodId.REBA: {
      const d = tab.payloads[MethodId.REBA];
      const side = d.evaluatedSide === 'izquierdo' ? d.left : d.right;
      const trDeg = d.trunkPos === 1 ? 0 : d.trunkPos === 2 ? 15 : d.trunkPos === 3 ? 42 : 70;
      const nkDeg = d.neckPos === 1 ? 10 : 28;
      const shDeg =
        side.upperArmPos === 1 ? 12 : side.upperArmPos === 2 ? 34 : side.upperArmPos === 3 ? 68 : 106;
      const elbDeg = side.lowerArmPos === 1 ? 84 : 18;
      const elbIntDeg = 180 - elbDeg;
      const wrDeg = side.wristPos === 1 ? 8 : 26;
      const knDeg = d.legsKneeFlexion === 0 ? 8 : d.legsKneeFlexion === 1 ? 46 : 78;
      const hpDeg = Math.round(knDeg * 0.68 + trDeg * 0.28);

      const pose = makeNeutralPose({
        stanceMode: d.legsBase === 2 ? 'one_leg' : knDeg >= 68 ? 'squatting' : 'standing',
        prop: side.armSupported ? 'work_desk_support' : d.loadForce > 0 ? 'box_load' : 'none',
        trunkFlexionDeg: trDeg,
        trunkTwistDeg: d.trunkTwistedOrSide ? 24 : 0,
        neckFlexionDeg: nkDeg,
        neckTwistDeg: d.neckTwistedOrSide ? 20 : 0,
        shoulderRFlexionDeg: shDeg,
        shoulderLFlexionDeg: d.loadForce > 0 ? shDeg : 12,
        shoulderRAbductionDeg: side.armAbducted ? 34 : 8,
        shoulderRElevated: side.shoulderRaised,
        elbowRFlexionDeg: elbDeg,
        elbowLFlexionDeg: d.loadForce > 0 ? elbDeg : 16,
        wristRFlexionDeg: wrDeg,
        wristRDeviationDeg: side.wristTwistedOrDeviated ? 16 : 0,
        hipRFlexionDeg: hpDeg,
        kneeRFlexionDeg: knDeg,
        hipLFlexionDeg: d.legsBase === 2 ? 32 : hpDeg,
        kneeLFlexionDeg: d.legsBase === 2 ? 56 : knDeg,
      });

      return [
        {
          idSuffix: 'reba-3d',
          title: `Réplica Avatar 3D · REBA (${tab.tabLabel})`,
          caption: `Réplica Avatar 3D con ángulos exactos REBA · Tronco ${trDeg}°, Cuello ${nkDeg}°, Hombro ${shDeg}°, Codo int. ${elbIntDeg}°, Rodilla ${knDeg}°`,
          widthPx: 680,
          heightPx: 520,
          panels: [
            {
              subTitle: `Postura REBA · Tronco ${trDeg}° · Rodilla ${knDeg}°`,
              scoreBadge: `Hombro ${shDeg}° · Codo ${elbIntDeg}°`,
              focusZone: 'full_body',
              cameraPreset: d.trunkTwistedOrSide ? 'isometric' : 'sagittal_right',
              pose,
              angleArcs: [
                { joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: `Tronco ${trDeg}°` },
                { joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: `Hombro ${shDeg}°` },
                { joint: 'elbowR', refType: 'internal_segment', parentJoint: 'shoulderR', toJoint: 'wristR', label: `Codo ${elbIntDeg}°` },
                { joint: 'kneeR', refType: 'vertical_down', toJoint: 'ankleR', label: `Rodilla ${knDeg}°` },
              ],
            },
          ],
          angleSummary: [
            { label: 'Tronco', degrees: trDeg },
            { label: 'Cuello', degrees: nkDeg },
            { label: 'Hombro', degrees: shDeg },
            { label: 'Codo (int.)', degrees: elbIntDeg },
            { label: 'Rodilla', degrees: knDeg },
          ],
        },
      ];
    }

    case MethodId.OWAS: {
      const obsList = tab.payloads[MethodId.OWAS].observations || [];
      const topObs = obsList[0] || {
        id: '1',
        taskPhase: 'Fase principal',
        back: 2 as const,
        arms: 1 as const,
        legs: 4 as const,
        load: 2 as const,
        frequencyCount: 1,
      };
      const trDeg = topObs.back === 1 ? 4 : topObs.back === 2 ? 38 : topObs.back === 3 ? 8 : 42;
      const twDeg = topObs.back === 3 || topObs.back === 4 ? 28 : 0;
      const shR = topObs.arms === 1 ? 26 : 124;
      const shL = topObs.arms === 3 ? 124 : 24;
      const knDeg =
        topObs.legs === 1
          ? 90
          : topObs.legs === 4 || topObs.legs === 5
            ? 74
            : topObs.legs === 6
              ? 92
              : 8;
      const stance: NonNullable<PosturePose3D['stanceMode']> =
        topObs.legs === 1
          ? 'seated'
          : topObs.legs === 3 || topObs.legs === 5
            ? 'one_leg'
            : topObs.legs === 4
              ? 'squatting'
              : topObs.legs === 6
                ? 'kneeling'
                : topObs.legs === 7
                  ? 'walking'
                  : 'standing';

      const pose = makeNeutralPose({
        stanceMode: stance,
        prop: topObs.legs === 1 ? 'chair' : topObs.load >= 2 ? 'box_load' : 'none',
        trunkFlexionDeg: trDeg,
        trunkTwistDeg: twDeg,
        shoulderRFlexionDeg: shR,
        shoulderLFlexionDeg: shL,
        elbowRFlexionDeg: 42,
        elbowLFlexionDeg: 42,
        hipRFlexionDeg: topObs.legs === 1 ? 90 : Math.round(knDeg * 0.68),
        kneeRFlexionDeg: knDeg,
        hipLFlexionDeg: topObs.legs === 1 ? 90 : Math.round(knDeg * 0.68),
        kneeLFlexionDeg: topObs.legs === 5 ? 14 : knDeg,
      });

      const codeStr = `${topObs.back}${topObs.arms}${topObs.legs}${topObs.load}`;
      return [
        {
          idSuffix: 'owas-3d',
          title: `Réplica Avatar 3D · OWAS Código ${codeStr}`,
          caption: `Réplica Avatar 3D OWAS (Código ${codeStr} · ${topObs.taskPhase}) · Espalda ${trDeg}°, Hombro ${shR}°, Rodilla ${knDeg}°`,
          widthPx: 680,
          heightPx: 520,
          panels: [
            {
              subTitle: `Código OWAS ${codeStr} (${topObs.taskPhase})`,
              scoreBadge: `Espalda ${trDeg}° · Rodilla ${knDeg}°`,
              focusZone: 'full_body',
              cameraPreset: twDeg > 0 ? 'isometric' : 'sagittal_right',
              pose,
              angleArcs: [
                { joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: `Espalda ${trDeg}°` },
                { joint: 'kneeR', refType: 'vertical_down', toJoint: 'ankleR', label: `Rodilla ${knDeg}°` },
              ],
            },
          ],
          angleSummary: [
            { label: 'Espalda', degrees: trDeg },
            { label: 'Giro', degrees: twDeg },
            { label: 'Hombro', degrees: shR },
            { label: 'Rodilla', degrees: knDeg },
          ],
        },
      ];
    }

    case MethodId.NIOSH: {
      const d = tab.payloads[MethodId.NIOSH];
      const orig = buildLiftPoseFromGeometry(
        d.vOriginCm,
        d.hOriginCm,
        d.asymmetryOriginDeg,
        d.loadWeightKg,
        'origin',
      );
      const dest = buildLiftPoseFromGeometry(
        d.vDestCm,
        d.evaluateDestination ? d.hDestCm : d.hOriginCm,
        d.evaluateDestination ? d.asymmetryDestDeg : 0,
        d.loadWeightKg,
        'dest',
      );

      return [
        {
          idSuffix: 'niosh-dual-3d',
          title: `Réplica Avatar 3D · Toma de Carga (Origen) y Destino · L = ${d.loadWeightKg} kg`,
          caption: `Gemelo Digital 3D NIOSH: Toma de Carga (H=${d.hOriginCm} cm, V=${d.vOriginCm} cm, Tronco ${orig.trunkDeg}°, Rodilla ${orig.kneeDeg}°) → Destino (H=${d.evaluateDestination ? d.hDestCm : d.hOriginCm} cm, V=${d.vDestCm} cm, Tronco ${dest.trunkDeg}°, Hombro ${dest.shoulderDeg}°)`,
          widthPx: 920,
          heightPx: 520,
          panels: [
            {
              subTitle: `1. Toma de Carga (Origen: H=${d.hOriginCm} cm · V=${d.vOriginCm} cm)`,
              scoreBadge: `A=${d.asymmetryOriginDeg}° · ${d.loadWeightKg} kg`,
              focusZone: 'full_body',
              cameraPreset: d.asymmetryOriginDeg >= 20 ? 'isometric' : 'sagittal_right',
              pose: orig.pose,
              angleArcs: [
                { joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: `Tronco ${orig.trunkDeg}°` },
                { joint: 'kneeR', refType: 'vertical_down', toJoint: 'ankleR', label: `Rodilla ${orig.kneeDeg}°` },
              ],
            },
            {
              subTitle: `2. Destino de Carga (H=${d.evaluateDestination ? d.hDestCm : d.hOriginCm} cm · V=${d.vDestCm} cm)`,
              scoreBadge: `D=${Math.abs(d.vDestCm - d.vOriginCm)} cm · A=${d.evaluateDestination ? d.asymmetryDestDeg : 0}°`,
              focusZone: 'full_body',
              cameraPreset: d.asymmetryDestDeg >= 20 ? 'isometric' : 'sagittal_right',
              pose: dest.pose,
              angleArcs: [
                { joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: `Tronco ${dest.trunkDeg}°` },
                { joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: `Hombro ${dest.shoulderDeg}°` },
              ],
            },
          ],
          angleSummary: [
            { label: 'Tronco Origen', degrees: orig.trunkDeg },
            { label: 'Rodilla Origen', degrees: orig.kneeDeg },
            { label: 'Tronco Destino', degrees: dest.trunkDeg },
            { label: 'Hombro Destino', degrees: dest.shoulderDeg },
          ],
        },
      ];
    }

    case MethodId.LMC_295: {
      const d = tab.payloads[MethodId.LMC_295];
      const hApprox =
        d.horizontalZone === 'proximo_30' ? 26 : d.horizontalZone === 'intermedio_30_60' ? 45 : 68;
      const orig = buildLiftPoseFromGeometry(
        d.originHeightCm,
        hApprox,
        d.asymmetryOver30Deg ? 35 : 0,
        d.actualWeightKg,
        'origin',
      );
      const dest = buildLiftPoseFromGeometry(
        d.destHeightCm,
        hApprox,
        0,
        d.actualWeightKg,
        'dest',
      );
      return [
        {
          idSuffix: 'lmc295-dual-3d',
          title: `Réplica Avatar 3D · LMC Res. 295/03 (${d.actualWeightKg} kg)`,
          caption: `Réplica Avatar 3D LMC Res. 295/03 · Toma en V=${d.originHeightCm} cm (Tronco ${orig.trunkDeg}°) → Destino en V=${d.destHeightCm} cm (Hombro ${dest.shoulderDeg}°), H≈${hApprox} cm`,
          widthPx: 920,
          heightPx: 520,
          panels: [
            {
              subTitle: `Toma de Carga (Origen V=${d.originHeightCm} cm · H≈${hApprox} cm)`,
              scoreBadge: `${d.actualWeightKg} kg`,
              focusZone: 'full_body',
              cameraPreset: d.asymmetryOver30Deg ? 'isometric' : 'sagittal_right',
              pose: orig.pose,
              angleArcs: [
                { joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: `Tronco ${orig.trunkDeg}°` },
                { joint: 'kneeR', refType: 'vertical_down', toJoint: 'ankleR', label: `Rodilla ${orig.kneeDeg}°` },
              ],
            },
            {
              subTitle: `Destino de Carga (V=${d.destHeightCm} cm)`,
              scoreBadge: `ΔV=${Math.abs(d.destHeightCm - d.originHeightCm)} cm`,
              focusZone: 'full_body',
              cameraPreset: 'sagittal_right',
              pose: dest.pose,
              angleArcs: [
                { joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: `Hombro ${dest.shoulderDeg}°` },
              ],
            },
          ],
          angleSummary: [
            { label: 'Tronco Origen', degrees: orig.trunkDeg },
            { label: 'Rodilla Origen', degrees: orig.kneeDeg },
            { label: 'Hombro Destino', degrees: dest.shoulderDeg },
          ],
        },
      ];
    }

    case MethodId.SNOOK: {
      const d = tab.payloads[MethodId.SNOOK];
      const isPushPull = d.operationType === 'empuje' || d.operationType === 'traccion';
      const shDeg = isPushPull
        ? d.handHeightZone === 'hombros'
          ? 82
          : d.handHeightZone === 'codo'
            ? 48
            : 28
        : d.liftHeightZone === 'sobre_cabeza'
          ? 122
          : d.liftHeightZone === 'hombros'
            ? 78
            : 40;
      const trDeg = isPushPull ? 16 : d.liftHeightZone === 'rodillas_o_inferior' ? 38 : 10;
      const elbDeg = isPushPull ? 54 : 66;
      const knDeg = d.liftHeightZone === 'rodillas_o_inferior' && !isPushPull ? 58 : 16;

      const pose = makeNeutralPose({
        stanceMode: isPushPull ? 'walking' : 'standing',
        prop:
          d.operationType === 'empuje'
            ? 'cart_push_dynamo'
            : d.operationType === 'traccion'
              ? 'cart_pull_dynamo'
              : 'box_load',
        trunkFlexionDeg: trDeg,
        shoulderRFlexionDeg: shDeg,
        shoulderLFlexionDeg: shDeg,
        elbowRFlexionDeg: elbDeg,
        elbowLFlexionDeg: elbDeg,
        hipRFlexionDeg: Math.round(knDeg * 0.65),
        kneeRFlexionDeg: knDeg,
        hipLFlexionDeg: isPushPull ? -8 : Math.round(knDeg * 0.65),
        kneeLFlexionDeg: isPushPull ? 10 : knDeg,
      });

      return [
        {
          idSuffix: 'snook-3d',
          title: `Réplica Avatar 3D · Snook y Ciriello (${d.operationType.toUpperCase()})`,
          caption: `Réplica Avatar 3D Psicofísica Snook (${d.operationType}) · Tronco ${trDeg}°, Hombro ${shDeg}°, Codo ${elbDeg}°`,
          widthPx: 680,
          heightPx: 520,
          panels: [
            {
              subTitle: `Operación: ${d.operationType} · Población ${d.population}`,
              scoreBadge: isPushPull ? `Fi=${d.actualInitialForceN} N` : `L=${d.actualWeightKg} kg`,
              focusZone: 'full_body',
              cameraPreset: 'sagittal_right',
              pose,
              angleArcs: [
                { joint: 'l5s1', refType: 'vertical_up', toJoint: 'c7', label: `Tronco ${trDeg}°` },
                { joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: `Hombro ${shDeg}°` },
              ],
            },
          ],
          angleSummary: [
            { label: 'Tronco', degrees: trDeg },
            { label: 'Hombro', degrees: shDeg },
            { label: 'Codo', degrees: elbDeg },
          ],
        },
      ];
    }

    case MethodId.OCRA_COMPLETO:
    case MethodId.OCRA_CHECKLIST:
    case MethodId.JSI:
    case MethodId.NAM_295: {
      let shDeg = 46;
      let elbDeg = 82;
      let wrDeg = 18;
      let badgeText = 'Ciclo Repetitivo EESS';

      if (tab.method === MethodId.OCRA_CHECKLIST) {
        const d = tab.payloads[MethodId.OCRA_CHECKLIST];
        shDeg = d.right.shoulderScore >= 12 ? 92 : d.right.shoulderScore >= 2 ? 78 : 34;
        elbDeg = d.right.elbowScore >= 4 ? 108 : 82;
        wrDeg = d.right.wristScore >= 4 ? 34 : d.right.wristScore >= 2 ? 20 : 6;
        badgeText = `OCRA Check List · Hombro ${shDeg}° · Muñeca ${wrDeg}°`;
      } else if (tab.method === MethodId.OCRA_COMPLETO) {
        const d = tab.payloads[MethodId.OCRA_COMPLETO];
        const apm = Math.round((d.actionsPerCycle / Math.max(1, d.cycleDurationSec)) * 60);
        shDeg = d.fpPosture <= 0.7 ? 84 : 38;
        elbDeg = d.fpPosture <= 0.7 ? 102 : 84;
        wrDeg = d.fpPosture <= 0.5 ? 36 : d.fpPosture <= 0.85 ? 20 : 6;
        badgeText = `${apm} acc/min · Ciclo ${d.cycleDurationSec}s`;
      } else if (tab.method === MethodId.JSI) {
        const d = tab.payloads[MethodId.JSI];
        shDeg = 32;
        elbDeg = 86;
        wrDeg = d.pmWristPosture === 1 ? 0 : d.pmWristPosture === 2 ? 8 : d.pmWristPosture === 3 ? 18 : d.pmWristPosture === 4 ? 32 : 44;
        badgeText = `JSI · Muñeca ${wrDeg}° · IE=${d.ieIntensity}`;
      } else {
        const d = tab.payloads[MethodId.NAM_295];
        shDeg = 34;
        elbDeg = 85;
        wrDeg = d.prolongedAwkwardWrist ? 28 : 8;
        badgeText = `NAM Res. 295/03 · Borg ${d.right.borgPeakForce}`;
      }

      const pose = makeNeutralPose({
        stanceMode: 'standing',
        prop: 'work_desk_support',
        trunkFlexionDeg: 10,
        neckFlexionDeg: 14,
        shoulderRFlexionDeg: shDeg,
        shoulderLFlexionDeg: Math.round(shDeg * 0.75),
        shoulderRAbductionDeg: shDeg >= 75 ? 24 : 10,
        elbowRFlexionDeg: elbDeg,
        elbowLFlexionDeg: 80,
        wristRFlexionDeg: wrDeg,
        wristRDeviationDeg: wrDeg >= 20 ? 12 : 0,
        handGripMode: 'pinch',
      });

      return [
        {
          idSuffix: `${tab.method.toLowerCase()}-3d`,
          title: `Réplica Avatar 3D · Movimientos Repetitivos (${tab.method})`,
          caption: `Réplica Avatar 3D Miembro Superior (${tab.method}) · Hombro ${shDeg}°, Codo ${elbDeg}°, Muñeca ${wrDeg}°`,
          widthPx: 680,
          heightPx: 520,
          panels: [
            {
              subTitle: `Cinemática EESS · Hombro ${shDeg}° · Codo ${elbDeg}° · Muñeca ${wrDeg}°`,
              scoreBadge: badgeText,
              focusZone: 'full_body',
              cameraPreset: 'sagittal_right',
              pose,
              angleArcs: [
                { joint: 'shoulderR', refType: 'trunk_axis', toJoint: 'elbowR', label: `Hombro ${shDeg}°` },
                { joint: 'elbowR', refType: 'segment', parentJoint: 'shoulderR', toJoint: 'wristR', label: `Codo ${elbDeg}°` },
                { joint: 'wristR', refType: 'horizontal', toJoint: 'handR', label: `Muñeca ${wrDeg}°` },
              ],
            },
          ],
          angleSummary: [
            { label: 'Hombro', degrees: shDeg },
            { label: 'Codo', degrees: elbDeg },
            { label: 'Muñeca', degrees: wrDeg },
          ],
        },
      ];
    }

    default:
      return [];
  }
}

export async function renderMethodAvatarStudyPhotos(tab: StudyTab): Promise<StudyPhoto[]> {
  if (!isBiomechanicalVisualMethod(tab.method) || typeof document === 'undefined') {
    return [];
  }
  const sheetSpecs = buildMethodAvatarSheetSpecs(tab);
  if (sheetSpecs.length === 0) return [];

  await ensureAvatarGlbLoaded();
  const out: StudyPhoto[] = [];

  for (const sheet of sheetSpecs) {
    const canvas = document.createElement('canvas');
    const isMulti = sheet.panels.length >= 2;
    const figSpec: BookFigureFileSpec = {
      id: `report-${tab.id}-${sheet.idSuffix}`,
      figureNumber: '3D',
      fileName: `${sheet.idSuffix}.jpg`,
      chapter: 4,
      chapterTitle: tab.method,
      title: sheet.title,
      bookDescription: sheet.caption,
      bodiesRule: isMulti ? '2' : '1',
      widthPx: sheet.widthPx,
      heightPx: sheet.heightPx,
      renderMode: isMulti ? '3d_dual' : '3d_single',
      panels: sheet.panels,
    };

    renderBookFigureToCanvas(figSpec, canvas, DEFAULT_ORBIT_OVERRIDE, 2, {
      preferSynthetic3D: true,
    });

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    const annotations: AngleAnnotation[] = sheet.angleSummary.map((item, idx) => ({
      id: `auto-ann-${idx}`,
      label: item.label,
      p1: { x: 0.2, y: 0.2 },
      vertex: { x: 0.5, y: 0.5 },
      p2: { x: 0.8, y: 0.5 },
      degrees: Math.round(item.degrees),
    }));

    out.push({
      id: `avatar-3d-auto-${tab.id}-${sheet.idSuffix}`,
      name: sheet.title,
      dataUrl,
      annotatedDataUrl: dataUrl,
      caption: sheet.caption,
      annotations,
    });
  }

  return out;
}

export async function renderSinglePanelAvatarJpeg(
  panel: Panel3DSpec,
  bannerTitle: string,
  metricsFooter: string,
  widthPx = 640,
  heightPx = 500,
): Promise<string> {
  await ensureAvatarGlbLoaded();
  const rawCanvas = document.createElement('canvas');
  renderInteractivePose3DToCanvas(
    panel,
    rawCanvas,
    widthPx,
    heightPx - 58,
    DEFAULT_ORBIT_OVERRIDE,
    2,
  );

  const outCanvas = document.createElement('canvas');
  outCanvas.width = widthPx;
  outCanvas.height = heightPx;
  const ctx = outCanvas.getContext('2d');
  if (!ctx) return rawCanvas.toDataURL('image/jpeg', 0.88);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, widthPx, heightPx);

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, widthPx, 30);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(bannerTitle, 12, 15);

  ctx.drawImage(rawCanvas, 0, 30, widthPx, heightPx - 58);

  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, heightPx - 28, widthPx, 28);
  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(0, heightPx - 28);
  ctx.lineTo(widthPx, heightPx - 28);
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 11px "IBM Plex Mono", monospace';
  ctx.fillText(metricsFooter, 12, heightPx - 14);

  return outCanvas.toDataURL('image/jpeg', 0.88);
}

export async function renderAnnotatedOperatorFrameJpeg(
  sourceDataUrl: string,
  bannerTitle: string,
  metricBadges: string[],
): Promise<string> {
  if (!sourceDataUrl || typeof document === 'undefined') return sourceDataUrl;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const targetW = 680;
      const ratio = img.naturalHeight > 0 && img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : 0.62;
      const bodyH = Math.max(300, Math.min(460, Math.round(targetW * ratio)));
      const totalH = bodyH + 62;

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = totalH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(sourceDataUrl);
        return;
      }

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, targetW, totalH);
      ctx.drawImage(img, 0, 30, targetW, bodyH);

      // Header bar
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, targetW, 30);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 12px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(bannerTitle, 12, 15);

      // Footer metrics strip
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 30 + bodyH, targetW, 32);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 11px "IBM Plex Mono", monospace';
      ctx.fillText(metricBadges.join('  |  '), 12, 30 + bodyH + 16);

      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => resolve(sourceDataUrl);
    img.src = sourceDataUrl;
  });
}

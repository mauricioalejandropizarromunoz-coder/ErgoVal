import { JointKey, Panel3DSpec } from '../types/figurePlan';
import { sanitizeManualImageText } from './realisticHumanRig';

const DEG2RAD = Math.PI / 180;

export type MethodZeroRef =
  | 'vertical_up'
  | 'vertical_down'
  | 'trunk_up'
  | 'trunk_down'
  | 'humerus_down'
  | 'forearm_distal'
  | 'femur_distal'
  | 'shank_neutral_foot'
  | 'frontal_lateral_r'
  | 'frontal_up';

export interface MethodSectorWedge {
  joint: JointKey;
  zeroRef: MethodZeroRef;
  /** Lower threshold angle in degrees (anatomical sign convention) */
  minDeg: number;
  /** Upper threshold angle in degrees (anatomical sign convention) */
  maxDeg: number;
  /** Optional boundary box at minDeg ray (e.g. '45°', '60°', '-20°') */
  minTag?: string;
  /** Optional boundary box at maxDeg ray (e.g. '90°', '100°', '20°') */
  maxTag?: string;
  /** Optional tag centered on the sector bisector (e.g. '>90°', '<60°', '>100°') */
  midTag?: string;
  /** Multiplier relative to default panel sector radius */
  radiusScale?: number;
  /** True when the active posture sits in this sector (richer blue); false for secondary valid zone */
  isSecondaryZone?: boolean;
}

export interface PanelMethodSpec {
  sectors: MethodSectorWedge[];
  /** Draw dashed 0° anatomical reference line from the joint */
  showZeroRefLine?: boolean;
  /** Optional active segment ray & arc annotation */
  activeArc?: {
    joint: JointKey;
    zeroRef: MethodZeroRef;
    toJoint?: JointKey;
    fallbackDeg?: number;
    label: string;
    radiusScale?: number;
  };
  /** Explicit method score callout box (e.g. '3 ptos · 45°–90°') */
  scoreCallout?: string;
  /** Draw horizontal shoulder-height reference line (OWAS arms) */
  showShoulderLevelLine?: boolean;
  /** Draw sagittal body midline (RULA forearm crossing midline) */
  showSagittalMidline?: boolean;
}

interface PlacedBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Computes the 2D screen reference angle (in radians) and the 2D sign (+1 = clockwise, -1 = counter-clockwise)
 * for positive anatomical flexion/deviation of each joint reference mode.
 */
export function resolveZeroRefAngle2D(
  zeroRef: MethodZeroRef,
  pts: Record<JointKey, { x: number; y: number }>,
): { baseRad: number; dirSign: 1 | -1 } {
  switch (zeroRef) {
    case 'vertical_up':
      return { baseRad: -Math.PI / 2, dirSign: 1 };

    case 'vertical_down':
      return { baseRad: Math.PI / 2, dirSign: -1 };

    case 'trunk_up': {
      const dx = pts.c7.x - pts.l5s1.x;
      const dy = pts.c7.y - pts.l5s1.y;
      if (Math.hypot(dx, dy) > 4) {
        return { baseRad: Math.atan2(dy, dx), dirSign: 1 };
      }
      return { baseRad: -Math.PI / 2, dirSign: 1 };
    }

    case 'trunk_down': {
      const dx = pts.l5s1.x - pts.c7.x;
      const dy = pts.l5s1.y - pts.c7.y;
      if (Math.hypot(dx, dy) > 4) {
        return { baseRad: Math.atan2(dy, dx), dirSign: -1 };
      }
      return { baseRad: Math.PI / 2, dirSign: -1 };
    }

    case 'humerus_down': {
      const dx = pts.elbowR.x - pts.shoulderR.x;
      const dy = pts.elbowR.y - pts.shoulderR.y;
      if (Math.hypot(dx, dy) > 4) {
        return { baseRad: Math.atan2(dy, dx), dirSign: -1 };
      }
      return { baseRad: Math.PI / 2, dirSign: -1 };
    }

    case 'forearm_distal': {
      const dx = pts.wristR.x - pts.elbowR.x;
      const dy = pts.wristR.y - pts.elbowR.y;
      if (Math.hypot(dx, dy) > 4) {
        return { baseRad: Math.atan2(dy, dx), dirSign: 1 };
      }
      return { baseRad: 0, dirSign: 1 };
    }

    case 'femur_distal': {
      const dx = pts.kneeR.x - pts.hipR.x;
      const dy = pts.kneeR.y - pts.hipR.y;
      if (Math.hypot(dx, dy) > 4) {
        return { baseRad: Math.atan2(dy, dx), dirSign: 1 };
      }
      return { baseRad: Math.PI / 2, dirSign: 1 };
    }

    case 'shank_neutral_foot': {
      const dx = pts.ankleR.x - pts.kneeR.x;
      const dy = pts.ankleR.y - pts.kneeR.y;
      const shankRad = Math.hypot(dx, dy) > 4 ? Math.atan2(dy, dx) : Math.PI / 2;
      return { baseRad: shankRad - Math.PI / 2, dirSign: -1 };
    }

    case 'frontal_lateral_r':
      // In frontal view, person's right arm is on screen-left; 0° = down (+π/2), abduction moves toward π (clockwise = +1)
      return { baseRad: Math.PI / 2, dirSign: 1 };

    case 'frontal_up':
      return { baseRad: -Math.PI / 2, dirSign: -1 };
  }
}

function normalizeSignedDiff(startRad: number, endRad: number): number {
  let diff = endRad - startRad;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/**
 * Canonical ergonomic method angular sectors & score brackets for every 3D figure in BOOK_FIGURE_CATALOG.
 * Ensures every figure shows the exact method threshold angles and score bracket from the manual.
 */
export function getCatalogPanelMethodSpec(
  figId: string,
  panelIdx: number,
): PanelMethodSpec | null {
  switch (figId) {
    // --- FIG 4.1: Medición oblicua incorrecta vs sagital verdadera magnitud ---
    case 'fig-4-01':
      if (panelIdx === 0) {
        return {
          sectors: [],
          showZeroRefLine: true,
          activeArc: {
            joint: 'shoulderR',
            zeroRef: 'trunk_down',
            toJoint: 'elbowR',
            label: 'α ap. ≠ 55° real',
          },
          scoreCallout: 'Toma oblicua (error)',
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'shoulderR',
            zeroRef: 'trunk_down',
            minDeg: 45,
            maxDeg: 90,
            minTag: '45°',
            maxTag: '90°',
          },
        ],
        activeArc: {
          joint: 'shoulderR',
          zeroRef: 'trunk_down',
          toJoint: 'elbowR',
          label: 'α = 55° (3 ptos)',
        },
      };

    // --- FIG 4.4a: RULA Brazo 1 punto y 2 puntos ---
    case 'fig-4-04a':
      if (panelIdx === 0) {
        return {
          showZeroRefLine: true,
          sectors: [
            {
              joint: 'shoulderR',
              zeroRef: 'trunk_down',
              minDeg: -20,
              maxDeg: 20,
              minTag: '−20°',
              maxTag: '20°',
            },
          ],
          activeArc: {
            joint: 'shoulderR',
            zeroRef: 'trunk_down',
            toJoint: 'elbowR',
            label: '1 pto: −20° a 20°',
            radiusScale: 0.62,
          },
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'shoulderR',
            zeroRef: 'trunk_down',
            minDeg: 20,
            maxDeg: 45,
            minTag: '20°',
            maxTag: '45°',
          },
          {
            joint: 'shoulderR',
            zeroRef: 'trunk_down',
            minDeg: -45,
            maxDeg: -20,
            midTag: '<−20°',
            isSecondaryZone: true,
          },
        ],
        activeArc: {
          joint: 'shoulderR',
          zeroRef: 'trunk_down',
          toJoint: 'elbowR',
          label: '2 ptos: 20°–45°',
          radiusScale: 0.62,
        },
      };

    // --- FIG 4.4b: RULA Brazo 3 puntos y 4 puntos ---
    case 'fig-4-04b':
      if (panelIdx === 0) {
        return {
          showZeroRefLine: true,
          sectors: [
            {
              joint: 'shoulderR',
              zeroRef: 'trunk_down',
              minDeg: 45,
              maxDeg: 90,
              minTag: '45°',
              maxTag: '90°',
            },
          ],
          activeArc: {
            joint: 'shoulderR',
            zeroRef: 'trunk_down',
            toJoint: 'elbowR',
            label: '3 ptos: 45°–90°',
            radiusScale: 0.62,
          },
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'shoulderR',
            zeroRef: 'trunk_down',
            minDeg: 90,
            maxDeg: 145,
            minTag: '90°',
            midTag: '>90°',
          },
        ],
        activeArc: {
          joint: 'shoulderR',
          zeroRef: 'trunk_down',
          toJoint: 'elbowR',
          label: '4 ptos: >90°',
          radiusScale: 0.62,
        },
      };

    // --- FIG 4.5: Eje de referencia del brazo respecto al tronco inclinado ---
    case 'fig-4-05':
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'shoulderR',
            zeroRef: 'trunk_down',
            minDeg: 0,
            maxDeg: 45,
            minTag: '0° tronco',
            maxTag: '45°',
          },
        ],
        activeArc: {
          joint: 'shoulderR',
          zeroRef: 'trunk_down',
          toJoint: 'elbowR',
          label: 'α = 40° (2 ptos)',
          radiusScale: 0.65,
        },
      };

    // --- FIG 4.6a: Modificadores brazo (+1 elevación, +1 abducción) ---
    case 'fig-4-06a':
      if (panelIdx === 0) {
        return {
          sectors: [],
          showShoulderLevelLine: true,
          scoreCallout: 'Hombro elevado (+1 pto)',
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'shoulderR',
            zeroRef: 'frontal_lateral_r',
            minDeg: 15,
            maxDeg: 75,
            midTag: 'Abd.',
          },
        ],
        activeArc: {
          joint: 'shoulderR',
          zeroRef: 'frontal_lateral_r',
          toJoint: 'elbowR',
          label: 'Abducido (+1 pto)',
          radiusScale: 0.65,
        },
      };

    // --- FIG 4.6b: Brazo con apoyo (-1 pto) ---
    case 'fig-4-06b':
      return {
        sectors: [
          {
            joint: 'shoulderR',
            zeroRef: 'trunk_down',
            minDeg: 20,
            maxDeg: 45,
            isSecondaryZone: true,
          },
        ],
        scoreCallout: 'Brazo apoyado (−1 pto)',
      };

    // --- FIG 4.7 & FIG 4.23: Antebrazo en RULA y REBA (1 pto: 60°–100° | 2 ptos: <60° o >100°) ---
    case 'fig-4-07':
    case 'fig-4-23':
      if (panelIdx === 0) {
        return {
          showZeroRefLine: true,
          sectors: [
            {
              joint: 'elbowR',
              zeroRef: 'humerus_down',
              minDeg: 60,
              maxDeg: 100,
              minTag: '60°',
              maxTag: '100°',
            },
          ],
          activeArc: {
            joint: 'elbowR',
            zeroRef: 'humerus_down',
            toJoint: 'wristR',
            label: '1 pto: 60°–100°',
            radiusScale: 0.60,
          },
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'elbowR',
            zeroRef: 'humerus_down',
            minDeg: 100,
            maxDeg: 152,
            midTag: '>100°',
            isSecondaryZone: figId === 'fig-4-23',
          },
          {
            joint: 'elbowR',
            zeroRef: 'humerus_down',
            minDeg: 0,
            maxDeg: 60,
            midTag: '<60°',
            isSecondaryZone: figId === 'fig-4-07',
          },
        ],
        activeArc: {
          joint: 'elbowR',
          zeroRef: 'humerus_down',
          toJoint: 'wristR',
          label: '2 ptos: <60° o >100°',
          radiusScale: 0.58,
        },
      };

    // --- FIG 4.8: Referencia de medición del antebrazo (prolongación del brazo) ---
    case 'fig-4-08':
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'elbowR',
            zeroRef: 'humerus_down',
            minDeg: 60,
            maxDeg: 100,
            minTag: '60°',
            maxTag: '100°',
          },
        ],
        activeArc: {
          joint: 'elbowR',
          zeroRef: 'humerus_down',
          toJoint: 'wristR',
          label: 'α = 85° (1 pto)',
          radiusScale: 0.62,
        },
      };

    // --- FIG 4.9: Modificadores antebrazo (+1 cruza línea media / proyección externa) ---
    case 'fig-4-09':
      if (panelIdx === 0) {
        return {
          sectors: [],
          showSagittalMidline: true,
          scoreCallout: 'Cruza línea media (+1 pto)',
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'elbowR',
            zeroRef: 'frontal_lateral_r',
            minDeg: 12,
            maxDeg: 60,
          },
        ],
        activeArc: {
          joint: 'elbowR',
          zeroRef: 'frontal_lateral_r',
          toJoint: 'wristR',
          label: 'Proy. exterior (+1 pto)',
          radiusScale: 0.65,
        },
      };

    // --- FIG 4.10a: Muñeca en RULA (1 pto: 0° neutra | 2 ptos: 0°–15° flex./ext.) ---
    case 'fig-4-10a':
      if (panelIdx === 0) {
        return {
          showZeroRefLine: true,
          sectors: [
            {
              joint: 'wristR',
              zeroRef: 'forearm_distal',
              minDeg: -4,
              maxDeg: 4,
              midTag: '0°',
            },
          ],
          scoreCallout: '1 pto: Neutra (0°)',
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'wristR',
            zeroRef: 'forearm_distal',
            minDeg: 0,
            maxDeg: 15,
            maxTag: '15°',
          },
          {
            joint: 'wristR',
            zeroRef: 'forearm_distal',
            minDeg: -15,
            maxDeg: 0,
            minTag: '−15°',
            isSecondaryZone: true,
          },
        ],
        activeArc: {
          joint: 'wristR',
          zeroRef: 'forearm_distal',
          toJoint: 'handR',
          label: '2 ptos: 0°–15°',
          radiusScale: 0.64,
        },
      };

    // --- FIG 4.10b: Muñeca en RULA (3 ptos: >15° flexión o extensión) ---
    case 'fig-4-10b':
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'wristR',
            zeroRef: 'forearm_distal',
            minDeg: 15,
            maxDeg: 52,
            minTag: '15°',
            midTag: '>15°',
          },
          {
            joint: 'wristR',
            zeroRef: 'forearm_distal',
            minDeg: -46,
            maxDeg: -15,
            maxTag: '−15°',
            midTag: '<−15°',
            isSecondaryZone: true,
          },
        ],
        activeArc: {
          joint: 'wristR',
          zeroRef: 'forearm_distal',
          toJoint: 'handR',
          label: '3 ptos: >15°',
          radiusScale: 0.62,
        },
      };

    // --- FIG 4.11: Desviación radial y cubital (+1 pto) ---
    case 'fig-4-11':
      if (panelIdx === 0) {
        return {
          showZeroRefLine: true,
          sectors: [
            {
              joint: 'wristR',
              zeroRef: 'forearm_distal',
              minDeg: -30,
              maxDeg: 0,
              minTag: 'Radial',
              maxTag: '0°',
            },
          ],
          activeArc: {
            joint: 'wristR',
            zeroRef: 'forearm_distal',
            toJoint: 'handR',
            label: 'Desv. radial (+1 pto)',
            radiusScale: 0.65,
          },
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'wristR',
            zeroRef: 'forearm_distal',
            minDeg: 0,
            maxDeg: 32,
            minTag: '0°',
            maxTag: 'Cubital',
          },
        ],
        activeArc: {
          joint: 'wristR',
          zeroRef: 'forearm_distal',
          toJoint: 'handR',
          label: 'Desv. cubital (+1 pto)',
          radiusScale: 0.65,
        },
      };

    // --- FIG 4.12: Giro de muñeca (pronosupinación) ---
    case 'fig-4-12':
      return {
        sectors: [],
        scoreCallout:
          panelIdx === 0 ? '1 pto: Giro rango medio' : '2 ptos: Giro extremo (~90°)',
      };

    // --- FIG 4.13a: Cuello en RULA (1 pto: 0°–10° | 2 ptos: 10°–20°) ---
    case 'fig-4-13a':
      if (panelIdx === 0) {
        return {
          showZeroRefLine: true,
          sectors: [
            {
              joint: 'c7',
              zeroRef: 'trunk_up',
              minDeg: 0,
              maxDeg: 10,
              minTag: '0°',
              maxTag: '10°',
            },
          ],
          activeArc: {
            joint: 'c7',
            zeroRef: 'trunk_up',
            toJoint: 'head',
            label: '1 pto: 0°–10°',
            radiusScale: 0.62,
          },
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'c7',
            zeroRef: 'trunk_up',
            minDeg: 10,
            maxDeg: 20,
            minTag: '10°',
            maxTag: '20°',
          },
        ],
        activeArc: {
          joint: 'c7',
          zeroRef: 'trunk_up',
          toJoint: 'head',
          label: '2 ptos: 10°–20°',
          radiusScale: 0.62,
        },
      };

    // --- FIG 4.13b: Cuello en RULA (3 ptos: >20° | 4 ptos: Extensión <0°) ---
    case 'fig-4-13b':
      if (panelIdx === 0) {
        return {
          showZeroRefLine: true,
          sectors: [
            {
              joint: 'c7',
              zeroRef: 'trunk_up',
              minDeg: 20,
              maxDeg: 52,
              minTag: '20°',
              midTag: '>20°',
            },
          ],
          activeArc: {
            joint: 'c7',
            zeroRef: 'trunk_up',
            toJoint: 'head',
            label: '3 ptos: >20°',
            radiusScale: 0.62,
          },
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'c7',
            zeroRef: 'trunk_up',
            minDeg: -35,
            maxDeg: 0,
            maxTag: '0°',
            midTag: 'Ext.',
          },
        ],
        activeArc: {
          joint: 'c7',
          zeroRef: 'trunk_up',
          toJoint: 'head',
          label: '4 ptos: Extensión',
          radiusScale: 0.62,
        },
      };

    // --- FIG 4.14: Modificadores cuello (+1 rotación, +1 inclinación lateral) ---
    case 'fig-4-14':
      if (panelIdx === 0) {
        return {
          sectors: [],
          scoreCallout: 'Rotación cervical (+1 pto)',
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'c7',
            zeroRef: 'frontal_up',
            minDeg: 0,
            maxDeg: 32,
            minTag: '0°',
          },
        ],
        activeArc: {
          joint: 'c7',
          zeroRef: 'frontal_up',
          toJoint: 'head',
          label: 'Inclinación lat. (+1 pto)',
          radiusScale: 0.64,
        },
      };

    // --- FIG 4.15a: Tronco en RULA (1 pto: sentado apoyado | 2 ptos: 0°–20°) ---
    case 'fig-4-15a':
      if (panelIdx === 0) {
        return {
          showZeroRefLine: true,
          sectors: [
            {
              joint: 'hipR',
              zeroRef: 'vertical_up',
              minDeg: 0,
              maxDeg: 90,
              minTag: '0°',
              maxTag: '≥90°',
              radiusScale: 0.72,
            },
          ],
          scoreCallout: '1 pto: Sentado apoyado (≥90°)',
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'l5s1',
            zeroRef: 'vertical_up',
            minDeg: 0,
            maxDeg: 20,
            minTag: '0°',
            maxTag: '20°',
          },
        ],
        activeArc: {
          joint: 'l5s1',
          zeroRef: 'vertical_up',
          toJoint: 'c7',
          label: '2 ptos: 0°–20°',
          radiusScale: 0.64,
        },
      };

    // --- FIG 4.15b: Tronco en RULA (3 ptos: 20°–60° | 4 ptos: >60°) ---
    case 'fig-4-15b':
      if (panelIdx === 0) {
        return {
          showZeroRefLine: true,
          sectors: [
            {
              joint: 'l5s1',
              zeroRef: 'vertical_up',
              minDeg: 20,
              maxDeg: 60,
              minTag: '20°',
              maxTag: '60°',
            },
          ],
          activeArc: {
            joint: 'l5s1',
            zeroRef: 'vertical_up',
            toJoint: 'c7',
            label: '3 ptos: 20°–60°',
            radiusScale: 0.64,
          },
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'l5s1',
            zeroRef: 'vertical_up',
            minDeg: 60,
            maxDeg: 92,
            minTag: '60°',
            midTag: '>60°',
          },
        ],
        activeArc: {
          joint: 'l5s1',
          zeroRef: 'vertical_up',
          toJoint: 'c7',
          label: '4 ptos: >60°',
          radiusScale: 0.64,
        },
      };

    // --- FIG 4.16: Modificadores tronco (+1 torsión, +1 inclinación lateral) ---
    case 'fig-4-16':
      if (panelIdx === 0) {
        return {
          sectors: [],
          scoreCallout: 'Torsión axial (+1 pto)',
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'l5s1',
            zeroRef: 'frontal_up',
            minDeg: 0,
            maxDeg: 30,
            minTag: '0°',
          },
        ],
        activeArc: {
          joint: 'l5s1',
          zeroRef: 'frontal_up',
          toJoint: 'c7',
          label: 'Inclinación lat. (+1 pto)',
          radiusScale: 0.65,
        },
      };

    // --- FIG 4.17: Piernas en RULA ---
    case 'fig-4-17':
      return {
        sectors: [],
        scoreCallout:
          panelIdx === 0
            ? '1 pto: Apoyo bilateral equilibrado'
            : '2 ptos: Apoyo unipodal / inestable',
      };

    // --- FIG 4.19a: Tronco en REBA (1 pto: 0° erguido | 2 ptos: 0°–20° flex. o ext.) ---
    case 'fig-4-19a':
      if (panelIdx === 0) {
        return {
          showZeroRefLine: true,
          sectors: [
            {
              joint: 'l5s1',
              zeroRef: 'vertical_up',
              minDeg: -3,
              maxDeg: 3,
              midTag: '0°',
            },
          ],
          scoreCallout: '1 pto: Erguido (0°)',
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'l5s1',
            zeroRef: 'vertical_up',
            minDeg: 0,
            maxDeg: 20,
            maxTag: '20°',
          },
          {
            joint: 'l5s1',
            zeroRef: 'vertical_up',
            minDeg: -20,
            maxDeg: 0,
            minTag: '−20°',
            isSecondaryZone: true,
          },
        ],
        activeArc: {
          joint: 'l5s1',
          zeroRef: 'vertical_up',
          toJoint: 'c7',
          label: '2 ptos: 0°–20° flex./ext.',
          radiusScale: 0.64,
        },
      };

    // --- FIG 4.19b: Tronco en REBA (3 ptos: 20°–60° o ext >20° | 4 ptos: >60°) ---
    case 'fig-4-19b':
      if (panelIdx === 0) {
        return {
          showZeroRefLine: true,
          sectors: [
            {
              joint: 'l5s1',
              zeroRef: 'vertical_up',
              minDeg: 20,
              maxDeg: 60,
              minTag: '20°',
              maxTag: '60°',
            },
            {
              joint: 'l5s1',
              zeroRef: 'vertical_up',
              minDeg: -38,
              maxDeg: -20,
              midTag: 'Ext.>20°',
              isSecondaryZone: true,
            },
          ],
          activeArc: {
            joint: 'l5s1',
            zeroRef: 'vertical_up',
            toJoint: 'c7',
            label: '3 ptos: 20°–60° / ext.>20°',
            radiusScale: 0.64,
          },
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'l5s1',
            zeroRef: 'vertical_up',
            minDeg: 60,
            maxDeg: 92,
            minTag: '60°',
            midTag: '>60°',
          },
        ],
        activeArc: {
          joint: 'l5s1',
          zeroRef: 'vertical_up',
          toJoint: 'c7',
          label: '4 ptos: >60°',
          radiusScale: 0.64,
        },
      };

    // --- FIG 4.20: Cuello en REBA (1 pto: 0°–20° | 2 ptos: >20° o extensión) ---
    case 'fig-4-20':
      if (panelIdx === 0) {
        return {
          showZeroRefLine: true,
          sectors: [
            {
              joint: 'c7',
              zeroRef: 'trunk_up',
              minDeg: 0,
              maxDeg: 20,
              minTag: '0°',
              maxTag: '20°',
            },
          ],
          activeArc: {
            joint: 'c7',
            zeroRef: 'trunk_up',
            toJoint: 'head',
            label: '1 pto: 0°–20°',
            radiusScale: 0.62,
          },
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'c7',
            zeroRef: 'trunk_up',
            minDeg: 20,
            maxDeg: 52,
            minTag: '20°',
            midTag: '>20°',
          },
          {
            joint: 'c7',
            zeroRef: 'trunk_up',
            minDeg: -32,
            maxDeg: 0,
            midTag: 'Ext.',
            isSecondaryZone: true,
          },
        ],
        activeArc: {
          joint: 'c7',
          zeroRef: 'trunk_up',
          toJoint: 'head',
          label: '2 ptos: >20° o ext.',
          radiusScale: 0.62,
        },
      };

    // --- FIG 4.21a: Piernas en REBA (1 pto bilateral <30° | 2 ptos + 1 por flexión 30°–60°) ---
    case 'fig-4-21a':
      if (panelIdx === 0) {
        return {
          showZeroRefLine: true,
          sectors: [
            {
              joint: 'kneeR',
              zeroRef: 'femur_distal',
              minDeg: 0,
              maxDeg: 30,
              minTag: '0°',
              maxTag: '30°',
              radiusScale: 0.72,
            },
          ],
          scoreCallout: '1 pto: Bilateral (<30°)',
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'kneeR',
            zeroRef: 'femur_distal',
            minDeg: 30,
            maxDeg: 60,
            minTag: '30°',
            maxTag: '60°',
            radiusScale: 0.78,
          },
        ],
        activeArc: {
          joint: 'kneeR',
          zeroRef: 'femur_distal',
          toJoint: 'ankleR',
          label: '2 ptos + 1 (30°–60°)',
          radiusScale: 0.56,
        },
      };

    // --- FIG 4.21b: Piernas en REBA (+2 por flexión >60° / cuclillas / arrodillado) ---
    case 'fig-4-21b':
      if (panelIdx === 0) {
        return {
          showZeroRefLine: true,
          sectors: [
            {
              joint: 'kneeR',
              zeroRef: 'femur_distal',
              minDeg: 60,
              maxDeg: 112,
              minTag: '60°',
              midTag: '>60°',
              radiusScale: 0.78,
            },
          ],
          activeArc: {
            joint: 'kneeR',
            zeroRef: 'femur_distal',
            toJoint: 'ankleR',
            label: '+2 ptos: >60° (3–4 ptos)',
            radiusScale: 0.56,
          },
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'kneeR',
            zeroRef: 'femur_distal',
            minDeg: 60,
            maxDeg: 105,
            minTag: '60°',
            radiusScale: 0.72,
          },
        ],
        scoreCallout: 'De rodillas (+2 ptos)',
      };

    // --- FIG 4.22a & 4.22b: Brazo en REBA ---
    case 'fig-4-22a':
      if (panelIdx === 0) {
        return {
          showZeroRefLine: true,
          sectors: [
            {
              joint: 'shoulderR',
              zeroRef: 'trunk_down',
              minDeg: -20,
              maxDeg: 20,
              minTag: '−20°',
              maxTag: '20°',
            },
          ],
          activeArc: {
            joint: 'shoulderR',
            zeroRef: 'trunk_down',
            toJoint: 'elbowR',
            label: '1 pto: −20° a 20°',
            radiusScale: 0.62,
          },
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'shoulderR',
            zeroRef: 'trunk_down',
            minDeg: 20,
            maxDeg: 45,
            minTag: '20°',
            maxTag: '45°',
          },
          {
            joint: 'shoulderR',
            zeroRef: 'trunk_down',
            minDeg: -45,
            maxDeg: -20,
            midTag: '<−20°',
            isSecondaryZone: true,
          },
        ],
        activeArc: {
          joint: 'shoulderR',
          zeroRef: 'trunk_down',
          toJoint: 'elbowR',
          label: '2 ptos: 20°–45° / ext.>20°',
          radiusScale: 0.62,
        },
      };

    case 'fig-4-22b':
      if (panelIdx === 0) {
        return {
          showZeroRefLine: true,
          sectors: [
            {
              joint: 'shoulderR',
              zeroRef: 'trunk_down',
              minDeg: 45,
              maxDeg: 90,
              minTag: '45°',
              maxTag: '90°',
            },
          ],
          activeArc: {
            joint: 'shoulderR',
            zeroRef: 'trunk_down',
            toJoint: 'elbowR',
            label: '3 ptos: 45°–90°',
            radiusScale: 0.62,
          },
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'shoulderR',
            zeroRef: 'trunk_down',
            minDeg: 90,
            maxDeg: 145,
            minTag: '90°',
            midTag: '>90°',
          },
        ],
        activeArc: {
          joint: 'shoulderR',
          zeroRef: 'trunk_down',
          toJoint: 'elbowR',
          label: '4 ptos: >90°',
          radiusScale: 0.62,
        },
      };

    // --- FIG 4.24: Muñeca en REBA (1 pto: 0°–15° | 2 ptos: >15° +1 desv./giro) ---
    case 'fig-4-24':
      if (panelIdx === 0) {
        return {
          showZeroRefLine: true,
          sectors: [
            {
              joint: 'wristR',
              zeroRef: 'forearm_distal',
              minDeg: -15,
              maxDeg: 15,
              minTag: '−15°',
              maxTag: '15°',
            },
          ],
          activeArc: {
            joint: 'wristR',
            zeroRef: 'forearm_distal',
            toJoint: 'handR',
            label: '1 pto: 0°–15°',
            radiusScale: 0.64,
          },
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'wristR',
            zeroRef: 'forearm_distal',
            minDeg: -50,
            maxDeg: -15,
            maxTag: '−15°',
            midTag: '>15° ext.',
          },
          {
            joint: 'wristR',
            zeroRef: 'forearm_distal',
            minDeg: 15,
            maxDeg: 48,
            minTag: '15°',
            isSecondaryZone: true,
          },
        ],
        activeArc: {
          joint: 'wristR',
          zeroRef: 'forearm_distal',
          toJoint: 'handR',
          label: '2 ptos: >15° (+1 desv.)',
          radiusScale: 0.64,
        },
      };

    // --- OWAS Espalda: Fig 4.27a & 4.27b ---
    case 'fig-4-27a':
      if (panelIdx === 0) {
        return {
          showZeroRefLine: true,
          sectors: [
            {
              joint: 'l5s1',
              zeroRef: 'vertical_up',
              minDeg: 0,
              maxDeg: 20,
              minTag: '0°',
              maxTag: '20°',
            },
          ],
          scoreCallout: 'Código 1: Espalda recta (<20°)',
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'l5s1',
            zeroRef: 'vertical_up',
            minDeg: 20,
            maxDeg: 75,
            minTag: '20°',
            midTag: '≥20°',
          },
        ],
        activeArc: {
          joint: 'l5s1',
          zeroRef: 'vertical_up',
          toJoint: 'c7',
          label: 'Código 2: Flexión ≥20°',
          radiusScale: 0.64,
        },
      };

    case 'fig-4-27b':
      return {
        sectors: [],
        scoreCallout:
          panelIdx === 0
            ? 'Código 3: Giro o incl. ≥20°'
            : 'Código 4: Flexión + Giro (≥20°)',
      };

    // --- OWAS Brazos: Fig 4.28a & 4.28b ---
    case 'fig-4-28a':
      if (panelIdx === 0) {
        return {
          sectors: [],
          showShoulderLevelLine: true,
          scoreCallout: 'Código 1: 2 brazos < hombros',
        };
      }
      return {
        showShoulderLevelLine: true,
        sectors: [
          {
            joint: 'shoulderR',
            zeroRef: 'frontal_lateral_r',
            minDeg: 90,
            maxDeg: 155,
            minTag: '90°',
          },
        ],
        scoreCallout: 'Código 2: 1 brazo ≥ hombro',
      };

    case 'fig-4-28b':
      return {
        showShoulderLevelLine: true,
        sectors: [
          {
            joint: 'shoulderR',
            zeroRef: 'frontal_lateral_r',
            minDeg: 90,
            maxDeg: 155,
            minTag: '90°',
          },
        ],
        scoreCallout: 'Código 3: 2 brazos ≥ hombros',
      };

    // --- OWAS Piernas: Fig 4.29a..d ---
    case 'fig-4-29a':
      return {
        sectors: [],
        scoreCallout:
          panelIdx === 0 ? 'Código 1: Sentado' : 'Código 2: De pie (2 piernas rectas)',
      };

    case 'fig-4-29b':
      if (panelIdx === 0) {
        return {
          sectors: [],
          scoreCallout: 'Código 3: 1 pierna recta',
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'kneeR',
            zeroRef: 'femur_distal',
            minDeg: 30,
            maxDeg: 95,
            minTag: '30°',
            radiusScale: 0.74,
          },
        ],
        activeArc: {
          joint: 'kneeR',
          zeroRef: 'femur_distal',
          toJoint: 'ankleR',
          label: 'Código 4: 2 piernas flex.',
          radiusScale: 0.56,
        },
      };

    case 'fig-4-29c':
      if (panelIdx === 0) {
        return {
          showZeroRefLine: true,
          sectors: [
            {
              joint: 'kneeR',
              zeroRef: 'femur_distal',
              minDeg: 30,
              maxDeg: 85,
              minTag: '30°',
              radiusScale: 0.74,
            },
          ],
          activeArc: {
            joint: 'kneeR',
            zeroRef: 'femur_distal',
            toJoint: 'ankleR',
            label: 'Código 5: 1 pierna flex.',
            radiusScale: 0.56,
          },
        };
      }
      return {
        sectors: [],
        scoreCallout: 'Código 6: Arrodillado',
      };

    case 'fig-4-29d':
      return {
        sectors: [],
        scoreCallout: 'Código 7: Caminando',
      };

    // --- CAPÍTULO 5: NIOSH / L5-S1 ---
    case 'fig-5-01':
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'l5s1',
            zeroRef: 'vertical_up',
            minDeg: 0,
            maxDeg: 45,
            minTag: '0°',
            maxTag: '45°',
          },
        ],
        activeArc: {
          joint: 'l5s1',
          zeroRef: 'vertical_up',
          toJoint: 'c7',
          label: 'α = 45° (Lím. 3,4 kN L5/S1)',
          radiusScale: 0.62,
        },
      };

    // --- CAPÍTULO 6: OCRA ---
    case 'fig-6-03a':
      if (panelIdx === 0) {
        return {
          showZeroRefLine: true,
          sectors: [
            {
              joint: 'shoulderR',
              zeroRef: 'trunk_down',
              minDeg: 80,
              maxDeg: 135,
              minTag: '80°',
              midTag: '>80°',
            },
          ],
          activeArc: {
            joint: 'shoulderR',
            zeroRef: 'trunk_down',
            toJoint: 'elbowR',
            label: 'OCRA Hombro >80°',
            radiusScale: 0.62,
          },
        };
      }
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'elbowR',
            zeroRef: 'humerus_down',
            minDeg: 60,
            maxDeg: 130,
            minTag: '60°',
            midTag: '>60°',
          },
        ],
        activeArc: {
          joint: 'elbowR',
          zeroRef: 'humerus_down',
          toJoint: 'wristR',
          label: 'OCRA Codo >60°',
          radiusScale: 0.62,
        },
      };

    case 'fig-6-03b':
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'wristR',
            zeroRef: 'forearm_distal',
            minDeg: 45,
            maxDeg: 68,
            minTag: '45°',
            midTag: '>45°',
          },
        ],
        activeArc: {
          joint: 'wristR',
          zeroRef: 'forearm_distal',
          toJoint: 'handR',
          label: 'OCRA Muñeca >45° + Pinza',
          radiusScale: 0.62,
        },
      };

    // --- CAPÍTULOS 11–13: CASOS DE ESTUDIO CON ÁNGULOS Y PUNTUACIONES DEL MÉTODO ---
    case 'fig-11-01':
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'shoulderR',
            zeroRef: 'trunk_down',
            minDeg: 45,
            maxDeg: 90,
            minTag: '45°',
            maxTag: '90°',
            radiusScale: 0.75,
          },
          {
            joint: 'elbowR',
            zeroRef: 'humerus_down',
            minDeg: 0,
            maxDeg: 60,
            maxTag: '60°',
            radiusScale: 0.68,
            isSecondaryZone: true,
          },
        ],
        activeArc: {
          joint: 'shoulderR',
          zeroRef: 'trunk_down',
          toJoint: 'elbowR',
          label: 'Brazo 68° (3 ptos) · Antebr. <60° (2)',
          radiusScale: 0.56,
        },
      };

    case 'fig-11-02':
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'l5s1',
            zeroRef: 'vertical_up',
            minDeg: 60,
            maxDeg: 90,
            minTag: '60°',
            midTag: '>60°',
            radiusScale: 0.78,
          },
          {
            joint: 'shoulderR',
            zeroRef: 'trunk_down',
            minDeg: 45,
            maxDeg: 90,
            radiusScale: 0.65,
            isSecondaryZone: true,
          },
        ],
        activeArc: {
          joint: 'l5s1',
          zeroRef: 'vertical_up',
          toJoint: 'c7',
          label: 'Tronco 68° (4 ptos) · RULA = 7',
          radiusScale: 0.56,
        },
      };

    case 'fig-11-03b':
      return {
        showShoulderLevelLine: true,
        sectors: [
          {
            joint: 'shoulderR',
            zeroRef: 'trunk_down',
            minDeg: 90,
            maxDeg: 130,
            minTag: '90°',
          },
        ],
        scoreCallout: 'Límite: no superar hombros (90°)',
      };

    case 'fig-11-04':
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'shoulderR',
            zeroRef: 'trunk_down',
            minDeg: 45,
            maxDeg: 90,
            minTag: '45°',
            maxTag: '90°',
            radiusScale: 0.72,
          },
          {
            joint: 'kneeR',
            zeroRef: 'femur_distal',
            minDeg: 30,
            maxDeg: 60,
            radiusScale: 0.68,
            isSecondaryZone: true,
          },
        ],
        activeArc: {
          joint: 'shoulderR',
          zeroRef: 'trunk_down',
          toJoint: 'elbowR',
          label: 'Brazo 62° (3) · Rodilla 36° (+1)',
          radiusScale: 0.55,
        },
      };

    case 'fig-12-03':
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'l5s1',
            zeroRef: 'vertical_up',
            minDeg: 20,
            maxDeg: 60,
            minTag: '20°',
            maxTag: '60°',
            radiusScale: 0.76,
          },
          {
            joint: 'shoulderR',
            zeroRef: 'trunk_down',
            minDeg: 45,
            maxDeg: 90,
            radiusScale: 0.66,
            isSecondaryZone: true,
          },
        ],
        activeArc: {
          joint: 'l5s1',
          zeroRef: 'vertical_up',
          toJoint: 'c7',
          label: 'Tronco 54° (3) · Brazo 68° (3)',
          radiusScale: 0.56,
        },
      };

    case 'fig-12-05':
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'l5s1',
            zeroRef: 'vertical_up',
            minDeg: 60,
            maxDeg: 92,
            minTag: '60°',
            midTag: '>60°',
            radiusScale: 0.76,
          },
        ],
        activeArc: {
          joint: 'l5s1',
          zeroRef: 'vertical_up',
          toJoint: 'c7',
          label: 'Tronco 74° (4 ptos) · Rodilla ~0°',
          radiusScale: 0.56,
        },
      };

    case 'fig-12-07':
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'c7',
            zeroRef: 'trunk_up',
            minDeg: 20,
            maxDeg: 48,
            minTag: '20°',
            midTag: '>20°',
            radiusScale: 0.72,
          },
          {
            joint: 'shoulderR',
            zeroRef: 'trunk_down',
            minDeg: 20,
            maxDeg: 45,
            radiusScale: 0.68,
            isSecondaryZone: true,
          },
        ],
        activeArc: {
          joint: 'c7',
          zeroRef: 'trunk_up',
          toJoint: 'head',
          label: 'Cuello 26° (3) · Brazo 36° (2)',
          radiusScale: 0.55,
        },
      };

    case 'fig-12-08':
      return {
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'l5s1',
            zeroRef: 'vertical_up',
            minDeg: 20,
            maxDeg: 60,
            minTag: '20°',
            maxTag: '60°',
            radiusScale: 0.74,
          },
        ],
        activeArc: {
          joint: 'l5s1',
          zeroRef: 'vertical_up',
          toJoint: 'c7',
          label: 'Tronco 44° · IL = 1,07',
          radiusScale: 0.56,
        },
      };

    case 'fig-12-09':
      return {
        showShoulderLevelLine: true,
        showZeroRefLine: true,
        sectors: [
          {
            joint: 'shoulderR',
            zeroRef: 'trunk_down',
            minDeg: 90,
            maxDeg: 140,
            minTag: '90°',
            midTag: '>90°',
          },
        ],
        activeArc: {
          joint: 'shoulderR',
          zeroRef: 'trunk_down',
          toJoint: 'elbowR',
          label: 'Brazo 122° (>90°: 4 ptos)',
          radiusScale: 0.58,
        },
      };

    default:
      return null;
  }
}

/**
 * Infers the exact RULA/REBA method threshold bracket and score for Comparative A/B or Custom angles.
 */
export function inferComparativeMethodBracket(
  param: 'cervical' | 'trunk' | 'shoulder' | 'elbow' | 'wrist' | 'knee',
  angleDeg: number,
): {
  joint: JointKey;
  zeroRef: MethodZeroRef;
  minDeg: number;
  maxDeg: number;
  rangeLabel: string;
  scoreLabel: string;
} {
  switch (param) {
    case 'cervical':
      if (angleDeg < 0) {
        return {
          joint: 'c7',
          zeroRef: 'trunk_up',
          minDeg: Math.min(-32, angleDeg - 6),
          maxDeg: 0,
          rangeLabel: '<0° (Extensión)',
          scoreLabel: 'RULA: 4 ptos · REBA: 2 ptos',
        };
      }
      if (angleDeg <= 10) {
        return {
          joint: 'c7',
          zeroRef: 'trunk_up',
          minDeg: 0,
          maxDeg: 10,
          rangeLabel: '0°–10°',
          scoreLabel: 'RULA: 1 pto · REBA: 1 pto',
        };
      }
      if (angleDeg <= 20) {
        return {
          joint: 'c7',
          zeroRef: 'trunk_up',
          minDeg: 10,
          maxDeg: 20,
          rangeLabel: '10°–20°',
          scoreLabel: 'RULA: 2 ptos · REBA: 1 pto',
        };
      }
      return {
        joint: 'c7',
        zeroRef: 'trunk_up',
        minDeg: 20,
        maxDeg: Math.max(48, angleDeg + 8),
        rangeLabel: '>20°',
        scoreLabel: 'RULA: 3 ptos · REBA: 2 ptos',
      };

    case 'trunk':
      if (angleDeg < 0) {
        return {
          joint: 'l5s1',
          zeroRef: 'vertical_up',
          minDeg: Math.min(-25, angleDeg - 5),
          maxDeg: 0,
          rangeLabel: 'Extensión (<0°)',
          scoreLabel: Math.abs(angleDeg) <= 20 ? 'REBA: 2 ptos' : 'REBA: 3 ptos',
        };
      }
      if (angleDeg <= 2) {
        return {
          joint: 'l5s1',
          zeroRef: 'vertical_up',
          minDeg: 0,
          maxDeg: 10,
          rangeLabel: '0° (Erguido)',
          scoreLabel: 'REBA: 1 pto · OWAS: Cód. 1',
        };
      }
      if (angleDeg <= 20) {
        return {
          joint: 'l5s1',
          zeroRef: 'vertical_up',
          minDeg: 0,
          maxDeg: 20,
          rangeLabel: '0°–20°',
          scoreLabel: 'RULA/REBA: 2 ptos · OWAS: Cód. 1',
        };
      }
      if (angleDeg <= 60) {
        return {
          joint: 'l5s1',
          zeroRef: 'vertical_up',
          minDeg: 20,
          maxDeg: 60,
          rangeLabel: '20°–60°',
          scoreLabel: 'RULA/REBA: 3 ptos · OWAS: Cód. 2',
        };
      }
      return {
        joint: 'l5s1',
        zeroRef: 'vertical_up',
        minDeg: 60,
        maxDeg: Math.max(88, angleDeg + 8),
        rangeLabel: '>60°',
        scoreLabel: 'RULA/REBA: 4 ptos · OWAS: Cód. 2',
      };

    case 'shoulder':
      if (angleDeg < -20) {
        return {
          joint: 'shoulderR',
          zeroRef: 'trunk_down',
          minDeg: Math.min(-45, angleDeg - 6),
          maxDeg: -20,
          rangeLabel: 'Ext. >20°',
          scoreLabel: 'RULA/REBA: 2 ptos',
        };
      }
      if (angleDeg <= 20) {
        return {
          joint: 'shoulderR',
          zeroRef: 'trunk_down',
          minDeg: -20,
          maxDeg: 20,
          rangeLabel: '−20° a 20°',
          scoreLabel: 'RULA/REBA: 1 pto',
        };
      }
      if (angleDeg <= 45) {
        return {
          joint: 'shoulderR',
          zeroRef: 'trunk_down',
          minDeg: 20,
          maxDeg: 45,
          rangeLabel: '20°–45°',
          scoreLabel: 'RULA/REBA: 2 ptos',
        };
      }
      if (angleDeg <= 90) {
        return {
          joint: 'shoulderR',
          zeroRef: 'trunk_down',
          minDeg: 45,
          maxDeg: 90,
          rangeLabel: '45°–90°',
          scoreLabel: 'RULA/REBA: 3 ptos',
        };
      }
      return {
        joint: 'shoulderR',
        zeroRef: 'trunk_down',
        minDeg: 90,
        maxDeg: Math.max(135, angleDeg + 10),
        rangeLabel: '>90°',
        scoreLabel: 'RULA/REBA: 4 ptos · OWAS ≥ hombro',
      };

    case 'elbow':
      if (angleDeg >= 60 && angleDeg <= 100) {
        return {
          joint: 'elbowR',
          zeroRef: 'humerus_down',
          minDeg: 60,
          maxDeg: 100,
          rangeLabel: '60°–100°',
          scoreLabel: 'RULA/REBA: 1 pto',
        };
      }
      if (angleDeg < 60) {
        return {
          joint: 'elbowR',
          zeroRef: 'humerus_down',
          minDeg: 0,
          maxDeg: 60,
          rangeLabel: '<60°',
          scoreLabel: 'RULA/REBA: 2 ptos',
        };
      }
      return {
        joint: 'elbowR',
        zeroRef: 'humerus_down',
        minDeg: 100,
        maxDeg: Math.max(145, angleDeg + 8),
        rangeLabel: '>100°',
        scoreLabel: 'RULA/REBA: 2 ptos',
      };

    case 'wrist':
      if (Math.abs(angleDeg) < 2) {
        return {
          joint: 'wristR',
          zeroRef: 'forearm_distal',
          minDeg: -5,
          maxDeg: 5,
          rangeLabel: '0° (Neutra)',
          scoreLabel: 'RULA: 1 pto · REBA: 1 pto',
        };
      }
      if (Math.abs(angleDeg) <= 15) {
        return {
          joint: 'wristR',
          zeroRef: 'forearm_distal',
          minDeg: angleDeg >= 0 ? 0 : -15,
          maxDeg: angleDeg >= 0 ? 15 : 0,
          rangeLabel: '0°–15°',
          scoreLabel: 'RULA: 2 ptos · REBA: 1 pto',
        };
      }
      return {
        joint: 'wristR',
        zeroRef: 'forearm_distal',
        minDeg: angleDeg >= 0 ? 15 : Math.min(-45, angleDeg - 6),
        maxDeg: angleDeg >= 0 ? Math.max(45, angleDeg + 6) : -15,
        rangeLabel: '>15°',
        scoreLabel: 'RULA: 3 ptos · REBA: 2 ptos',
      };

    case 'knee':
      if (angleDeg < 30) {
        return {
          joint: 'kneeR',
          zeroRef: 'femur_distal',
          minDeg: 0,
          maxDeg: 30,
          rangeLabel: '<30°',
          scoreLabel: 'REBA Piernas: +0 ptos',
        };
      }
      if (angleDeg <= 60) {
        return {
          joint: 'kneeR',
          zeroRef: 'femur_distal',
          minDeg: 30,
          maxDeg: 60,
          rangeLabel: '30°–60°',
          scoreLabel: 'REBA Piernas: +1 pto',
        };
      }
      return {
        joint: 'kneeR',
        zeroRef: 'femur_distal',
        minDeg: 60,
        maxDeg: Math.max(105, angleDeg + 8),
        rangeLabel: '>60°',
        scoreLabel: 'REBA Piernas: +2 ptos · OWAS Cód. 4',
      };
  }
}

function boxesOverlap(a: PlacedBox, b: PlacedBox, margin = 4): boolean {
  return !(
    a.x2 + margin < b.x1 ||
    a.x1 - margin > b.x2 ||
    a.y2 + margin < b.y1 ||
    a.y1 - margin > b.y2
  );
}

/**
 * Draws a crisp rectangular white box with #090d16 black border and non-overlapping placement.
 */
export function drawCollisionFreeManualTag(
  ctx: CanvasRenderingContext2D,
  rawText: string,
  targetX: number,
  targetY: number,
  bounds: { x: number; y: number; w: number; h: number },
  placedBoxes: PlacedBox[],
  font = '700 11.5px "Plus Jakarta Sans", "Inter", system-ui, sans-serif',
  padX = 7,
  padY = 4,
): PlacedBox | null {
  const text = sanitizeManualImageText(rawText) || rawText.trim();
  if (!text) return null;

  ctx.save();
  ctx.font = font;
  const tw = Math.ceil(ctx.measureText(text).width) + padX * 2;
  const th = Math.ceil(13 + padY * 2);

  const clampX = (x: number) =>
    Math.round(Math.max(bounds.x + tw / 2 + 4, Math.min(bounds.x + bounds.w - tw / 2 - 4, x)));
  const clampY = (y: number) =>
    Math.round(Math.max(bounds.y + th / 2 + 4, Math.min(bounds.y + bounds.h - th / 2 - 4, y)));

  const candidateOffsets = [
    [0, 0],
    [0, -24],
    [0, 24],
    [28, -14],
    [-28, -14],
    [28, 14],
    [-28, 14],
    [0, -44],
    [0, 44],
  ];

  let chosenX = clampX(targetX);
  let chosenY = clampY(targetY);
  let chosenBox: PlacedBox = {
    x1: chosenX - tw / 2,
    y1: chosenY - th / 2,
    x2: chosenX + tw / 2,
    y2: chosenY + th / 2,
  };

  for (const [ox, oy] of candidateOffsets) {
    const cx = clampX(targetX + ox);
    const cy = clampY(targetY + oy);
    const cand: PlacedBox = {
      x1: cx - tw / 2,
      y1: cy - th / 2,
      x2: cx + tw / 2,
      y2: cy + th / 2,
    };
    if (!placedBoxes.some((pb) => boxesOverlap(cand, pb, 3))) {
      chosenX = cx;
      chosenY = cy;
      chosenBox = cand;
      break;
    }
  }

  placedBoxes.push(chosenBox);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(chosenBox.x1, chosenBox.y1, tw, th);
  ctx.strokeStyle = '#090d16';
  ctx.lineWidth = 1.6;
  ctx.strokeRect(chosenBox.x1, chosenBox.y1, tw, th);

  ctx.fillStyle = '#090d16';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, chosenX, chosenY + 0.5);
  ctx.restore();

  return chosenBox;
}

/**
 * Renders the complete method angular threshold sectors, reference axes, active segment arc,
 * boundary degree boxes, and method score callout onto a 2D panel viewport.
 */
export function drawPanelMethodOverlay(
  ctx: CanvasRenderingContext2D,
  methodSpec: PanelMethodSpec,
  panel: Panel3DSpec,
  pts: Record<JointKey, { x: number; y: number }>,
  bounds: { x: number; y: number; w: number; h: number },
  placedBoxes: PlacedBox[] = [],
): PlacedBox[] {
  const baseSectorR = Math.max(46, Math.min(82, Math.min(bounds.w, bounds.h) * 0.24));

  // 1. Optional OWAS horizontal shoulder-level threshold line
  if (methodSpec.showShoulderLevelLine && pts.shoulderR) {
    const sy = Math.min(pts.shoulderR.y, pts.shoulderL?.y ?? pts.shoulderR.y);
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(bounds.x + 12, sy);
    ctx.lineTo(bounds.x + bounds.w - 12, sy);
    ctx.stroke();
    ctx.restore();

    drawCollisionFreeManualTag(
      ctx,
      'Nivel hombros (90°)',
      bounds.x + bounds.w - 72,
      sy - 14,
      bounds,
      placedBoxes,
      '700 10.5px "Plus Jakarta Sans", system-ui, sans-serif',
      6,
      3,
    );
  }

  // 2. Optional sagittal midline reference (RULA forearm crossing midline)
  if (methodSpec.showSagittalMidline && pts.c7 && pts.pelvis) {
    const midX = (pts.c7.x + pts.pelvis.x) * 0.5;
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(midX, bounds.y + 10);
    ctx.lineTo(midX, bounds.y + bounds.h - 10);
    ctx.stroke();
    ctx.restore();
  }

  // 3. Draw dashed 0° anatomical reference rays for evaluated joints
  if (methodSpec.showZeroRefLine) {
    const drawnRefKeys = new Set<string>();
    for (const sec of methodSpec.sectors) {
      const key = `${sec.joint}:${sec.zeroRef}`;
      if (drawnRefKeys.has(key)) continue;
      drawnRefKeys.add(key);

      const origin = pts[sec.joint];
      if (!origin) continue;
      const { baseRad } = resolveZeroRefAngle2D(sec.zeroRef, pts);
      const r = baseSectorR * (sec.radiusScale ?? 1) + 16;

      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(origin.x + Math.cos(baseRad) * r, origin.y + Math.sin(baseRad) * r);
      ctx.stroke();
      ctx.restore();
    }
  }

  // 4. Draw semi-transparent blue method threshold sectors with crisp #090d16 black outlines
  for (const sec of methodSpec.sectors) {
    const origin = pts[sec.joint];
    if (!origin) continue;

    const { baseRad, dirSign } = resolveZeroRefAngle2D(sec.zeroRef, pts);
    const radMin = baseRad + dirSign * sec.minDeg * DEG2RAD;
    const radMax = baseRad + dirSign * sec.maxDeg * DEG2RAD;
    const startRad = Math.min(radMin, radMax);
    const endRad = Math.max(radMin, radMax);
    const r = baseSectorR * (sec.radiusScale ?? 1);

    ctx.save();
    const grad = ctx.createRadialGradient(origin.x, origin.y, 3, origin.x, origin.y, r);
    if (sec.isSecondaryZone) {
      grad.addColorStop(0, 'rgba(96, 165, 250, 0.32)');
      grad.addColorStop(1, 'rgba(147, 197, 253, 0.24)');
    } else {
      grad.addColorStop(0, 'rgba(59, 130, 246, 0.50)');
      grad.addColorStop(1, 'rgba(96, 165, 250, 0.38)');
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.arc(origin.x, origin.y, r, startRad, endRad, false);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = sec.isSecondaryZone ? 1.35 : 1.75;
    ctx.stroke();
    ctx.restore();

    if (sec.minTag) {
      drawCollisionFreeManualTag(
        ctx,
        sec.minTag,
        origin.x + Math.cos(radMin) * (r + 18),
        origin.y + Math.sin(radMin) * (r + 16),
        bounds,
        placedBoxes,
        '800 11px "Plus Jakarta Sans", system-ui, sans-serif',
        5,
        3,
      );
    }
    if (sec.maxTag) {
      drawCollisionFreeManualTag(
        ctx,
        sec.maxTag,
        origin.x + Math.cos(radMax) * (r + 18),
        origin.y + Math.sin(radMax) * (r + 16),
        bounds,
        placedBoxes,
        '800 11px "Plus Jakarta Sans", system-ui, sans-serif',
        5,
        3,
      );
    }
    if (sec.midTag) {
      const midRad = (startRad + endRad) * 0.5;
      drawCollisionFreeManualTag(
        ctx,
        sec.midTag,
        origin.x + Math.cos(midRad) * (r + 20),
        origin.y + Math.sin(midRad) * (r + 16),
        bounds,
        placedBoxes,
        '800 11px "Plus Jakarta Sans", system-ui, sans-serif',
        5,
        3,
      );
    }
  }

  // 5. Draw active segment ray + inner measurement arc + double arrowheads + callout box
  if (methodSpec.activeArc) {
    const aSpec = methodSpec.activeArc;
    const origin = pts[aSpec.joint];
    if (origin) {
      const { baseRad, dirSign } = resolveZeroRefAngle2D(aSpec.zeroRef, pts);
      let segRad = baseRad + dirSign * (aSpec.fallbackDeg ?? 25) * DEG2RAD;
      if (aSpec.toJoint && pts[aSpec.toJoint]) {
        const tgt = pts[aSpec.toJoint];
        if (Math.hypot(tgt.x - origin.x, tgt.y - origin.y) > 5) {
          segRad = Math.atan2(tgt.y - origin.y, tgt.x - origin.x);
        }
      }

      const diff = normalizeSignedDiff(baseRad, segRad);
      const effDiff = Math.abs(diff) < 0.08 ? (dirSign >= 0 ? 0.14 : -0.14) : diff;
      const endRad = baseRad + effDiff;
      const arcR = baseSectorR * (aSpec.radiusScale ?? 0.62);
      const rayLen = baseSectorR + 12;

      ctx.save();
      // Active segment ray
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(origin.x + Math.cos(endRad) * rayLen, origin.y + Math.sin(endRad) * rayLen);
      ctx.stroke();

      // White halo + crisp black measurement arc
      ctx.strokeStyle = 'rgba(255,255,255,0.88)';
      ctx.lineWidth = 3.8;
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, arcR, baseRad, endRad, effDiff < 0);
      ctx.stroke();

      ctx.strokeStyle = '#090d16';
      ctx.fillStyle = '#090d16';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, arcR, baseRad, endRad, effDiff < 0);
      ctx.stroke();

      // Arrowhead at active ray end
      const ex = origin.x + Math.cos(endRad) * arcR;
      const ey = origin.y + Math.sin(endRad) * arcR;
      const tangent = endRad + (effDiff >= 0 ? Math.PI / 2 : -Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - 7.5 * Math.cos(tangent - 0.44), ey - 7.5 * Math.sin(tangent - 0.44));
      ctx.lineTo(ex - 7.5 * Math.cos(tangent + 0.44), ey - 7.5 * Math.sin(tangent + 0.44));
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      const midRad = baseRad + effDiff * 0.5;
      const calloutDist = baseSectorR + 30;
      drawCollisionFreeManualTag(
        ctx,
        aSpec.label,
        origin.x + Math.cos(midRad) * calloutDist,
        origin.y + Math.sin(midRad) * calloutDist,
        bounds,
        placedBoxes,
        '700 11.5px "Plus Jakarta Sans", "Inter", system-ui, sans-serif',
        8,
        4,
      );
    }
  }

  // 6. Joint pivot pins on all measured joints
  const pinJoints = new Set<JointKey>();
  methodSpec.sectors.forEach((s) => pinJoints.add(s.joint));
  if (methodSpec.activeArc) pinJoints.add(methodSpec.activeArc.joint);
  pinJoints.forEach((jk) => {
    const p = pts[jk];
    if (!p) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4.0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#090d16';
    ctx.stroke();
    ctx.restore();
  });

  // 7. Optional standalone score callout box
  if (methodSpec.scoreCallout) {
    const defaultY =
      panel.focusZone === 'wrist_hand' || panel.focusZone === 'ankle_foot'
        ? bounds.y + 22
        : bounds.y + bounds.h - 22;
    drawCollisionFreeManualTag(
      ctx,
      methodSpec.scoreCallout,
      bounds.x + bounds.w * 0.5,
      defaultY,
      bounds,
      placedBoxes,
      '700 11.5px "Plus Jakarta Sans", "Inter", system-ui, sans-serif',
      8,
      4,
    );
  }

  return placedBoxes;
}

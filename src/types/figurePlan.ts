export type FocusZone =
  | 'wrist_hand'
  | 'elbow_forearm'
  | 'shoulder_arm'
  | 'neck_cervical'
  | 'lumbar_l5s1'
  | 'trunk_pelvis'
  | 'legs_knees'
  | 'ankle_foot'
  | 'full_body';

export type CameraPreset =
  | 'sagittal_right'
  | 'sagittal_left'
  | 'frontal'
  | 'dorsal'
  | 'top'
  | 'isometric'
  | 'perspective_oblique';

export type JointKey =
  | 'pelvis'
  | 'l5s1'
  | 't12'
  | 'c7'
  | 'head'
  | 'shoulderR'
  | 'elbowR'
  | 'wristR'
  | 'handR'
  | 'shoulderL'
  | 'elbowL'
  | 'wristL'
  | 'handL'
  | 'hipR'
  | 'kneeR'
  | 'ankleR'
  | 'footR'
  | 'hipL'
  | 'kneeL'
  | 'ankleL'
  | 'footL';

export type ScenePropType =
  | 'none'
  | 'chair'
  | 'work_desk_support'
  | 'box_load'
  | 'electrical_panel'
  | 'trench_shovel'
  | 'iron_tamper_low'
  | 'iron_tamper_high'
  | 'crane_levers'
  | 'office_desk_corner_monitor'
  | 'office_desk_lateral'
  | 'loading_dock_van'
  | 'bin_to_cart'
  | 'floor_pouches'
  | 'cart_push_dynamo'
  | 'cart_pull_dynamo'
  | 'high_scanner_desk'
  | 'pallet_cooler'
  | 'cold_room_high_shelf'
  | 'bus_driver_seat'
  | 'conveyor_veg_line'
  | 'hopper_sack_pour'
  | 'pallet_jack_rack';

export interface PosturePose3D {
  trunkFlexionDeg: number; // + forward flexion, - extension
  trunkLateralDeg: number; // + right lateral bend
  trunkTwistDeg: number; // + axial twist
  neckFlexionDeg: number; // + forward flexion relative to trunk, - extension
  neckLateralDeg: number;
  neckTwistDeg: number;
  shoulderRFlexionDeg: number; // + forward flexion, - extension
  shoulderRAbductionDeg: number; // + lateral abduction
  shoulderRRotationDeg?: number; // Rotación humeral diedra (-90° interna .. +90° externa)
  shoulderRElevated?: boolean;
  shoulderLFlexionDeg: number;
  shoulderLAbductionDeg: number;
  shoulderLRotationDeg?: number; // Rotación humeral izquierda (-90° .. +90°)
  elbowRFlexionDeg: number; // 0 = straight arm, 90 = right angle
  elbowLFlexionDeg: number;
  forearmRPronationDeg: number; // 0 = neutral, +80 pronation, -80 supination
  forearmLPronationDeg?: number;
  forearmRCrossMidline?: boolean;
  wristRFlexionDeg: number; // + palmar flexion, - dorsal extension
  wristRDeviationDeg: number; // + ulnar, - radial
  wristLFlexionDeg?: number;
  wristLDeviationDeg?: number;
  hipRFlexionDeg: number; // 0 = standing straight, 90 = seated
  kneeRFlexionDeg: number; // 0 = straight, 90 = 90° bend
  ankleRDorsiflexionDeg: number; // + dorsiflexion, - plantarflexion
  toeRExtensionDeg?: number; // Articulación MTF dedos del pie ISO 7250-1: + extensión despegue (+52°), - flexión garra (-42°)
  hipLFlexionDeg: number;
  kneeLFlexionDeg: number;
  ankleLDorsiflexionDeg: number;
  toeLExtensionDeg?: number;
  stanceMode?: 'standing' | 'seated' | 'kneeling' | 'squatting' | 'one_leg' | 'walking';
  prop?: ScenePropType;
  loadKg?: number;
  highlightGroup?: 'none' | 'rula_groups' | 'sagittal_split' | 'l5s1_disc';
  handGripMode?: 'open' | 'relaxed' | 'pinch' | 'power_grip' | 'box_cradle';
  handLGripMode?: 'open' | 'relaxed' | 'pinch' | 'power_grip' | 'box_cradle';
  handRGripMode?: 'open' | 'relaxed' | 'pinch' | 'power_grip' | 'box_cradle';
  /** Desplazamiento y orientación espacial del operario en el estudio (metros / grados) para tareas dinámicas y movimiento libre */
  rootOffsetX?: number;
  rootOffsetZ?: number;
  rootYawDeg?: number;
  /** Regulación libre en 3D de objetos / mobiliario de escena (mesa de apoyo, pisón de tierra, pala, cajas, silla, etc.) */
  propOffsetX?: number;
  propOffsetY?: number;
  propOffsetZ?: number;
  propRotYDeg?: number;
  propScale?: number;
  /** Estado de acoplamiento de la carga respecto al mobiliario fijo en secuencias humanizadas */
  loadDetachedPhase?: 'origin_rest' | 'carried' | 'dest_rest';
}

export interface AngleArcAnnotation {
  joint: JointKey;
  /** Reference direction in 2D screen angle (deg, 0=right, 90=down, -90=up) or second joint */
  refType: 'vertical_down' | 'vertical_up' | 'horizontal' | 'trunk_axis' | 'forearm_axis' | 'segment' | 'internal_segment';
  toJoint?: JointKey;
  parentJoint?: JointKey;
  label: string; // e.g., "α = 20°–45°" or "38°"
  radiusPx?: number;
  sweepHintDeg?: number;
}

export interface ForceVectorAnnotation {
  atJoint: JointKey;
  dx: number; // normalized 2D screen vector direction
  dy: number;
  lengthPx?: number;
  label: string; // e.g., "F = 18 kgf" or "Fc (L5/S1)"
  color?: 'blue' | 'slate';
}

export interface DimensionAnnotation {
  fromJoint?: JointKey;
  toJoint?: JointKey;
  customBox?: { x1: number; y1: number; x2: number; y2: number }; // 0..1 normalized panel coords
  label: string;
  axis: 'horizontal' | 'vertical' | 'oblique';
}

export interface Panel3DSpec {
  subTitle: string;
  scoreBadge?: string;
  focusZone: FocusZone;
  cameraPreset: CameraPreset;
  pose: PosturePose3D;
  orbitOverride?: {
    azimuthDeg: number;
    elevationDeg: number;
    zoom: number;
  };
  angleArcs?: AngleArcAnnotation[];
  forceVectors?: ForceVectorAnnotation[];
  dimensions?: DimensionAnnotation[];
  noteBottom?: string;
}

export type DiagramVariantId =
  | 'fig_1_01_redesign_cycle'
  | 'fig_4_18_rula_flow'
  | 'fig_4_25_reba_flow'
  | 'fig_4_26_owas_table'
  | 'fig_4_30_owas_loads'
  | 'fig_5_03_niosh_d_a'
  | 'fig_5_04_niosh_couplings'
  | 'fig_6_01_ocra_structure'
  | 'fig_6_02_ocra_actions'
  | 'fig_6_04_jsi_wrists'
  | 'fig_7_01_fanger_vars'
  | 'fig_7_02_pmv_ppd_real'
  | 'fig_7_03_wbgt_sensors'
  | 'fig_8_02_hand_arm_axes'
  | 'fig_9_01_protocol_relation'
  | 'fig_10_01_eval_cycle'
  | 'fig_10_02_priority_criteria'
  | 'fig_11_06_nam_chart'
  | 'fig_12_01_logistics_pmv_real'
  | 'fig_12_02_dock_step'
  | 'fig_12_04_niosh_heights'
  | 'fig_13_01_seat_dimensions'
  | 'fig_13_03_vib_z_spectrum_real'
  | 'fig_13_04_vib_ha_spectrum_real';

export interface BookFigureFileSpec {
  id: string;
  figureNumber: string; // e.g., "4.4"
  subPart?: string; // e.g., "a", "b"
  fileName: string; // e.g., "fig-4-04a.png"
  chapter: number;
  chapterTitle: string;
  title: string;
  bookDescription: string;
  bodiesRule: '1' | '2' | 'diagrama';
  widthPx: number;
  heightPx: number;
  isExistingRealChart?: boolean;
  isAnonymousCaseSchema?: boolean; // Cap. 11–13 rule
  renderMode: '3d_single' | '3d_dual' | 'diagram' | 'real_chart';
  panels?: Panel3DSpec[];
  diagramId?: DiagramVariantId;
  assignedPhotoUrl?: string;
}

export interface RenderedPngResult {
  blob: Blob;
  dataUrl: string;
  sizeBytes: number;
  width: number;
  height: number;
}

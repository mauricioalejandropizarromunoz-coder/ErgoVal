import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { PosturePose3D } from "../types/figurePlan";
import { makeNeutralPose } from "./figurePlanCatalog";

let poseLandmarker: PoseLandmarker | null = null;

export async function initMediaPipeMoCap(): Promise<void> {
  if (poseLandmarker) return;
  const vision = await FilesetResolver.forVisionTasks(
    "https://jsdelivr.net"
  );
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://googleapis.com",
      delegate: "GPU"
    },
    runningMode: "VIDEO"
  });
}

function calcularAngulo3D(A: any, B: any, C: any): number {
  const v1 = { x: A.x - B.x, y: A.y - B.y, z: A.z - B.z };
  const v2 = { x: C.x - B.x, y: C.y - B.y, z: C.z - B.z };
  const dotProduct = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const mag1 = Math.sqrt(v1.x**2 + v1.y**2 + v1.z**2);
  const mag2 = Math.sqrt(v2.x**2 + v2.y**2 + v2.z**2);
  return (Math.acos(dotProduct / (mag1 * mag2)) * 180) / Math.PI;
}

export async function trackVideoFrames(videoElement: HTMLVideoElement): Promise<{
  posesPorFrame: PosturePose3D[];
  peorPoseREBA: PosturePose3D;
}> {
  if (!poseLandmarker) await initMediaPipeMoCap();

  const posesPorFrame: PosturePose3D[] = [];
  const fps = 30; 
  const totalFrames = Math.floor(videoElement.duration * fps);
  let maxFlexionTronco = 0;
  let peorPoseREBA: PosturePose3D = makeNeutralPose();

  for (let i = 0; i < totalFrames; i++) {
    videoElement.currentTime = i / fps;
    await new Promise((resolve) => (videoElement.onseeked = resolve));

    const timestamp = performance.now();
    const result = poseLandmarker!.detectForVideo(videoElement, timestamp);

    if (result.worldLandmarks && result.worldLandmarks.length > 0) {
      const landmarks = result.worldLandmarks; 

      const hombroR = landmarks[12];
      const caderaR = landmarks[24];
      const rodillaR = landmarks[26];
      const codoR = landmarks[14];
      const muñecaR = landmarks[16];

      const anguloTroncoReal = calcularAngulo3D(hombroR, caderaR, rodillaR);
      const anguloBrazoReal = calcularAngulo3D(caderaR, hombroR, codoR);
      const anguloCodoReal = calcularAngulo3D(hombroR, codoR, muñecaR);

      const poseFrame = makeNeutralPose({
        trunkFlexionDeg: Math.round(anguloTroncoReal - 180), 
        shoulderRFlexionDeg: Math.round(180 - anguloBrazoReal),
        elbowRFlexionDeg: Math.round(anguloCodoReal),
        stanceMode: 'standing'
      });

      posesPorFrame.push(poseFrame);

      if (Math.abs(poseFrame.trunkFlexionDeg) > Math.abs(maxFlexionTronco)) {
        maxFlexionTronco = poseFrame.trunkFlexionDeg;
        peorPoseREBA = poseFrame;
      }
    }
  }

  return { posesPorFrame, peorPoseREBA };
}

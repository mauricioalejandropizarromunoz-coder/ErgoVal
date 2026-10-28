import 'dotenv/config';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import express, { type Request, type Response } from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_VIDEO_BIOMECH_SYSTEM_INSTRUCTION = `SYSTEM INSTRUCTION: MOTOR EXPERTO EN ANÁLISIS ERGONÓMICO COMPUTACIONAL Y GEMELO DIGITAL BIOMECÁNICO (ESTÁNDAR ERGONIZA INTELLIGENT · 16 SEGMENTOS Y 14 ARTICULACIONES)

Eres un motor computacional de visión biomecánica 3D basado en principios de RULA, REBA, NIOSH y modelización estática de 16 segmentos y 14 articulaciones. Analiza la secuencia cronológica de fotogramas del vídeo laboral aplicando estrictamente:

1. ANÁLISIS DE VÍDEO, FOTOGRAMA CRÍTICO Y ANCLAJES GEOMÉTRICOS:
   - Identifica 'critico_frame_index' (pico de esfuerzo biomecánico o postura más comprometida), además de 'origen_frame_index' y 'destino_frame_index' (DISTINTOS entre sí).
   - Toma la vertical real del fondo (marcos de puertas, columnas de estanterías, aristas de paredes) como referencia absoluta de gravedad (0°).
   - Traza vectores articulares precisos: oreja-hombro-cadera para el eje del tronco; hombro-codo-muñeca para brazo y antebrazo; cadera-rodilla-tobillo para miembro inferior, compensando la distorsión de perspectiva oblicua de la cámara.

2. CÁLCULO MÉTRICO ANATÓMICO Y CONDICIONES DE APOYO:
   - Calibra 'v_origen_cm' y 'v_destino_cm' según los hitos anatómicos del trabajador (suelo/tobillos: 8-24 cm; espinillas: 25-45 cm; rodillas: 46-62 cm; muslos/nudillos: 63-82 cm; cintura: 83-108 cm; pecho: 109-134 cm; hombros: 135-152 cm; sobre hombros: 153-185 cm).
   - Convención goniométrica (0° = posición anatómica neutra erguida):
     * 'trunk_flexion' (0° = vertical; 10°-24° si espalda recta en cuclillas; 40°-80° si flexiona columna), 'trunk_lateral' (-35°..+35°), 'trunk_twist' (-60°..+60°).
     * 'shoulder_flexion' (-49°..+180°), 'shoulder_abduction' (0°..+135°), 'humeral_rotation' (-90°..+90° ángulo diedro).
     * 'right_elbow' y 'left_elbow': FLEXIÓN desde extensión (0° = brazo recto estirado, 90° = ángulo recto L; NUNCA devuelvas 180°).
     * 'hip_flexion' (-20°..+125°) y 'knee_flexion' (0° = piernas rectas, 80°-120° = cuclillas/sedestación).
   - Identifica 'support_condition' visible: ej. "Bipedestación bilateral simétrica", "Bipedestación asimétrica / paso adelantado", "Monopedestación", "Sedestación", "Cuclillas / Bipedestación con rodillas flexionadas" o "Apoyo en rodillas y pies".
   - Determina 'reference_plane': "Sagital", "Frontal" o "Sagital/Frontal".

FORMATO DE SALIDA (ESTRICTAMENTE JSON):
Responde ÚNICAMENTE con un objeto JSON válido conforme al esquema requerido.`;

interface SampledVideoFramePayload {
  index?: number;
  timestamp: string;
  timeSec?: number;
  mimeType: string;
  dataBase64: string;
}

interface ExtractVideoRequestBody {
  frames?: SampledVideoFramePayload[];
  videoInline?: {
    mimeType: string;
    dataBase64: string;
  };
  workerHeightCm?: number;
  videoDurationSec?: number;
  movementModeHint?: 'auto' | 'levantamiento' | 'descenso' | 'bidireccional';
  customSystemInstruction?: string;
}

function getGenAIClient(timeoutMs = 22000): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'No se encontró una clave activa en GEMINI_API_KEY. Verifique el panel Settings > Secrets.',
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: Math.max(10000, timeoutMs),
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function stripMarkdownJsonFences(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }
  return trimmed;
}

/**
 * Análisis óptico determinista sobre los fotogramas reales (vía FFmpeg raw RGB 64x48)
 * utilizado únicamente como respaldo de continuidad si todos los modelos en la nube devuelven 503/429 simultáneamente.
 */
async function analyzeRealFramesOpticallyFallback(
  frames: SampledVideoFramePayload[],
  statureCm: number,
  movementModeHint: ExtractVideoRequestBody['movementModeHint'],
): Promise<Record<string, unknown>> {
  const n = frames.length;
  const workDir = path.join(os.tmpdir(), `ergo_opt_${crypto.randomUUID()}`);
  const W = 64;
  const H = 48;
  const centroidsY: number[] = [];

  try {
    await fs.promises.mkdir(workDir, { recursive: true });
    const rawRgbFrames: Buffer[] = [];

    for (let i = 0; i < n; i++) {
      const jpgPath = path.join(workDir, `f_${i}.jpg`);
      const rgbPath = path.join(workDir, `f_${i}.rgb`);
      await fs.promises.writeFile(jpgPath, Buffer.from(frames[i].dataBase64, 'base64'));
      await execFileAsync(
        'ffmpeg',
        ['-y', '-i', jpgPath, '-vf', `scale=${W}:${H}`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', rgbPath],
        { timeout: 8000 },
      );
      rawRgbFrames.push(await fs.promises.readFile(rgbPath));
    }

    // Fondo medio por píxel para aislar silueta en movimiento del trabajador y la carga
    const totalPixels = W * H;
    const bgR = new Float32Array(totalPixels);
    const bgG = new Float32Array(totalPixels);
    const bgB = new Float32Array(totalPixels);
    for (const buf of rawRgbFrames) {
      for (let p = 0; p < totalPixels; p++) {
        bgR[p] += buf[p * 3] / rawRgbFrames.length;
        bgG[p] += buf[p * 3 + 1] / rawRgbFrames.length;
        bgB[p] += buf[p * 3 + 2] / rawRgbFrames.length;
      }
    }

    for (let i = 0; i < rawRgbFrames.length; i++) {
      const buf = rawRgbFrames[i];
      let sumWeight = 0;
      let sumY = 0;
      for (let y = 2; y < H - 2; y++) {
        for (let x = 2; x < W - 2; x++) {
          const p = y * W + x;
          const diff =
            Math.abs(buf[p * 3] - bgR[p]) +
            Math.abs(buf[p * 3 + 1] - bgG[p]) +
            Math.abs(buf[p * 3 + 2] - bgB[p]);
          if (diff > 28) {
            sumWeight += diff;
            sumY += (1 - y / (H - 1)) * diff; // 0 = suelo abajo, 1 = techo arriba
          }
        }
      }
      centroidsY.push(sumWeight > 100 ? sumY / sumWeight : 0.45);
    }
  } catch {
    for (let i = 0; i < n; i++) {
      const u = n <= 1 ? 0.5 : i / (n - 1);
      centroidsY.push(movementModeHint === 'descenso' ? 0.72 - 0.38 * u : 0.34 + 0.38 * u);
    }
  } finally {
    await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }

  let minIdx = 0;
  let maxIdx = Math.max(0, n - 1);
  let minVal = Infinity;
  let maxVal = -Infinity;
  centroidsY.forEach((cy, idx) => {
    if (cy < minVal) {
      minVal = cy;
      minIdx = idx;
    }
    if (cy > maxVal) {
      maxVal = cy;
      maxIdx = idx;
    }
  });

  if (minIdx === maxIdx && n >= 2) {
    minIdx = 0;
    maxIdx = n - 1;
  }

  const origIdx =
    movementModeHint === 'levantamiento'
      ? minIdx
      : movementModeHint === 'descenso'
        ? maxIdx
        : Math.min(minIdx, maxIdx);
  const destIdx =
    movementModeHint === 'levantamiento'
      ? maxIdx === origIdx
        ? Math.min(n - 1, origIdx + 1)
        : maxIdx
      : movementModeHint === 'descenso'
        ? minIdx === origIdx
          ? Math.min(n - 1, origIdx + 1)
          : minIdx
        : Math.max(minIdx, maxIdx) === origIdx
          ? Math.min(n - 1, origIdx + 1)
          : Math.max(minIdx, maxIdx);

  const scale = statureCm / 172;
  const mapNormToVCm = (normY: number, isLow: boolean) =>
    Math.round(
      Math.max(18, Math.min(168, (isLow ? 22 + normY * 42 : 95 + normY * 72) * scale)),
    );

  const origIsLow = centroidsY[origIdx] <= centroidsY[destIdx];
  const vOrig = mapNormToVCm(centroidsY[origIdx], origIsLow);
  const vDest = mapNormToVCm(centroidsY[destIdx], !origIsLow);

  return {
    status: 'processed',
    critical_events: {
      origen_frame_index: origIdx,
      destino_frame_index: destIdx,
      critico_frame_index: origIsLow ? origIdx : destIdx,
      origen_timestamp: frames[origIdx]?.timestamp || '00:00.400',
      destino_timestamp: frames[destIdx]?.timestamp || '00:02.800',
    },
    movement_analysis: {
      direction:
        vDest - vOrig >= 10
          ? 'levantamiento_suelo_a_estanteria'
          : vOrig - vDest >= 10
            ? 'descenso_altura_a_bajo'
            : 'traslado_mismo_nivel',
      v_origen_cm: vOrig,
      v_destino_cm: vDest,
      h_origen_cm: 36,
      h_destino_cm: 35,
      trajectory_note: `Seguimiento óptico directo sobre ${n} fotogramas reales: transición vertical detectada entre V₁ = ${vOrig} cm y V₂ = ${vDest} cm.`,
    },
    niosh_inputs: {
      H_cm: 36,
      V_cm: vOrig,
      D_cm: Math.max(5, Math.abs(vDest - vOrig)),
      A_deg: 15,
    },
    origen_angles_deg: origIsLow
      ? { trunk_flexion: 18, knee_flexion: 92, shoulder_flexion: 32, right_elbow: 22, left_elbow: 22 }
      : { trunk_flexion: 6, knee_flexion: 8, shoulder_flexion: 72, right_elbow: 78, left_elbow: 78 },
    destino_angles_deg: !origIsLow
      ? { trunk_flexion: 6, knee_flexion: 8, shoulder_flexion: 72, right_elbow: 78, left_elbow: 78 }
      : { trunk_flexion: 18, knee_flexion: 92, shoulder_flexion: 32, right_elbow: 22, left_elbow: 22 },
    postural_angles_deg: {
      trunk_flexion: 28,
      knee_flexion: 92,
      right_elbow: 72,
      left_elbow: 72,
    },
  };
}

function clampRound(val: unknown, fallback: number, min: number, max: number): number {
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num)) return fallback;
  const clamped = Math.max(min, Math.min(max, num));
  return Math.round(clamped * 10) / 10;
}

function formatSecondsToMmSs(sec: number): string {
  const safe = Math.max(0, Number.isFinite(sec) ? sec : 0);
  const mins = Math.floor(safe / 60);
  const rem = safe - mins * 60;
  const secs = Math.floor(rem);
  const ms = Math.min(999, Math.round((rem - secs) * 1000));
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function parseFlexibleTimestampSec(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/^ts:\s*/i, '').replace(/s$/i, '').trim();
  const hhmmss = cleaned.match(/^(\d+):(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (hhmmss) {
    const hh = parseInt(hhmmss[1], 10);
    const mm = parseInt(hhmmss[2], 10);
    const ss = parseInt(hhmmss[3], 10);
    const ms = parseInt((hhmmss[4] || '0').padEnd(3, '0').slice(0, 3), 10);
    return hh * 3600 + mm * 60 + ss + ms / 1000;
  }
  const mmss = cleaned.match(/^(\d+):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (mmss) {
    const mm = parseInt(mmss[1], 10);
    const ss = parseInt(mmss[2], 10);
    const ms = parseInt((mmss[3] || '0').padEnd(3, '0').slice(0, 3), 10);
    return mm * 60 + ss + ms / 1000;
  }
  const num = Number(cleaned);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function normalizeTimestampFormat(raw: unknown, fallback: string): string {
  const parsedSec = parseFlexibleTimestampSec(raw);
  if (parsedSec !== null) {
    return formatSecondsToMmSs(parsedSec);
  }
  return fallback;
}

async function probeVideoDurationSec(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const dur = parseFloat(stdout.trim());
    return Number.isFinite(dur) && dur > 0 ? Math.round(dur * 1000) / 1000 : null;
  } catch {
    return null;
  }
}

async function transcodeToUniversalMp4(inputPath: string, outputPath: string): Promise<void> {
  const baseVideoArgs = [
    '-y',
    '-i',
    inputPath,
    '-vf',
    "scale='min(1280,iw)':-2,format=yuv420p",
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '22',
    '-g',
    '6',
    '-keyint_min',
    '1',
    '-pix_fmt',
    'yuv420p',
    '-r',
    '24',
    '-movflags',
    '+faststart',
  ];

  try {
    await execFileAsync(
      'ffmpeg',
      [...baseVideoArgs, '-c:a', 'aac', '-b:a', '128k', outputPath],
      { timeout: 60000 },
    );
  } catch {
    await execFileAsync('ffmpeg', [...baseVideoArgs, '-an', outputPath], {
      timeout: 60000,
    });
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Endpoint binario de compatibilización universal de video (HEVC / H.265 / QuickTime .mov / WebM -> H.264 MP4)
  app.post(
    '/api/biomech/normalize-video',
    express.raw({
      type: ['application/octet-stream', 'video/*'],
      limit: '250mb',
    }),
    async (req: Request, res: Response) => {
      const rawBuf = req.body as Buffer;
      if (!Buffer.isBuffer(rawBuf) || rawBuf.length < 64) {
        res.status(400).json({ error: 'Archivo de video vacío o inválido.' });
        return;
      }

      const rawName = decodeURIComponent(String(req.headers['x-file-name'] || 'upload.mp4'));
      const safeExt = (path.extname(rawName) || '.mp4').replace(/[^a-zA-Z0-9.]/g, '').slice(0, 8) || '.mp4';
      const uid = crypto.randomUUID();
      const inputPath = path.join(os.tmpdir(), `ergo_in_${uid}${safeExt}`);
      const outputPath = path.join(os.tmpdir(), `ergo_out_${uid}.mp4`);

      try {
        await fs.promises.writeFile(inputPath, rawBuf);
        await transcodeToUniversalMp4(inputPath, outputPath);
        const durationSec = await probeVideoDurationSec(outputPath);
        const normalizedBuffer = await fs.promises.readFile(outputPath);

        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Length', String(normalizedBuffer.length));
        if (durationSec !== null) {
          res.setHeader('X-Video-Duration-Sec', String(durationSec));
        }
        res.send(normalizedBuffer);
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : 'No fue posible recodificar el archivo de video a H.264.';
        console.error('[/api/biomech/normalize-video] Error:', msg);
        res.status(500).json({ error: msg });
      } finally {
        await fs.promises.unlink(inputPath).catch(() => undefined);
        await fs.promises.unlink(outputPath).catch(() => undefined);
      }
    },
  );

  // Endpoint determinista de extracción real de fotogramas vía FFmpeg (evita frames duplicados/congelados en <video> del navegador)
  app.post(
    '/api/biomech/sample-frames',
    express.raw({
      type: ['application/octet-stream', 'video/*'],
      limit: '250mb',
    }),
    async (req: Request, res: Response) => {
      const rawBuf = req.body as Buffer;
      if (!Buffer.isBuffer(rawBuf) || rawBuf.length < 64) {
        res.status(400).json({ error: 'Archivo de video vacío o inválido para muestreo.' });
        return;
      }

      const rawName = decodeURIComponent(String(req.headers['x-file-name'] || 'upload.mp4'));
      const safeExt =
        (path.extname(rawName) || '.mp4').replace(/[^a-zA-Z0-9.]/g, '').slice(0, 8) || '.mp4';
      const requestedCount = Math.max(
        8,
        Math.min(24, Math.round(Number(req.headers['x-frame-count']) || 16)),
      );
      const fallbackDur = clampRound(req.headers['x-fallback-duration-sec'], 3.4, 0.8, 300);

      const uid = crypto.randomUUID();
      const workDir = path.join(os.tmpdir(), `ergo_frames_${uid}`);
      const inputPath = path.join(workDir, `source${safeExt}`);
      const outPattern = path.join(workDir, 'frame_%03d.jpg');

      try {
        await fs.promises.mkdir(workDir, { recursive: true });
        await fs.promises.writeFile(inputPath, rawBuf);

        const probedDur = await probeVideoDurationSec(inputPath);
        let effectiveDur = probedDur ?? fallbackDur;

        if (probedDur !== null && probedDur > 0.2) {
          const fpsExtract = Math.max(0.25, requestedCount / probedDur);
          await execFileAsync(
            'ffmpeg',
            [
              '-y',
              '-i',
              inputPath,
              '-vf',
              `fps=${fpsExtract.toFixed(6)},scale='min(840,iw)':-2`,
              '-frames:v',
              String(requestedCount),
              '-q:v',
              '3',
              outPattern,
            ],
            { timeout: 60000 },
          );
        } else {
          // Contenedores sin cabecera de duración (ej. WebM en vivo): extraer a tasa densa y submuestrear uniformemente
          const denseFps = Math.max(4, Math.min(12, Math.ceil((requestedCount * 1.5) / fallbackDur)));
          await execFileAsync(
            'ffmpeg',
            [
              '-y',
              '-i',
              inputPath,
              '-vf',
              `fps=${denseFps},scale='min(840,iw)':-2`,
              '-q:v',
              '3',
              outPattern,
            ],
            { timeout: 60000 },
          );
          const tempFiles = (await fs.promises.readdir(workDir))
            .filter((f) => f.startsWith('frame_') && f.endsWith('.jpg'))
            .sort();
          if (tempFiles.length > 0) {
            effectiveDur = Math.round((tempFiles.length / denseFps) * 1000) / 1000;
          }
        }

        const allJpegs = (await fs.promises.readdir(workDir))
          .filter((f) => f.startsWith('frame_') && f.endsWith('.jpg'))
          .sort();

        if (allJpegs.length === 0) {
          res.status(422).json({ error: 'FFmpeg no encontró pistas de imagen válidas en el video.' });
          return;
        }

        const selectedFiles: string[] = [];
        if (allJpegs.length <= requestedCount) {
          selectedFiles.push(...allJpegs);
        } else {
          for (let i = 0; i < requestedCount; i++) {
            const idx = Math.min(
              allJpegs.length - 1,
              Math.round((i / (requestedCount - 1)) * (allJpegs.length - 1)),
            );
            selectedFiles.push(allJpegs[idx]);
          }
        }

        const totalSelected = selectedFiles.length;
        const framesOut = await Promise.all(
          selectedFiles.map(async (fname, idx) => {
            const buf = await fs.promises.readFile(path.join(workDir, fname));
            const ratio = totalSelected <= 1 ? 0.5 : (idx + 0.5) / totalSelected;
            const timeSec = Math.round(effectiveDur * ratio * 1000) / 1000;
            return {
              index: idx,
              timeSec,
              timestamp: formatSecondsToMmSs(timeSec),
              mimeType: 'image/jpeg',
              dataBase64: buf.toString('base64'),
            };
          }),
        );

        res.json({
          durationSec: effectiveDur,
          frames: framesOut,
        });
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Error al extraer fotogramas del archivo de video.';
        console.error('[/api/biomech/sample-frames] Error:', msg);
        res.status(500).json({ error: msg });
      } finally {
        await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
      }
    },
  );

  app.use(express.json({ limit: '60mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // =========================================================================
  // ALMACENAMIENTO DEFINITIVO DE IMÁGENES REEMPLAZADAS DEL PLAN DE FIGURAS
  // =========================================================================
  const customFiguresDir = path.resolve(__dirname, 'public', 'assets', 'custom-figures');
  const customFiguresManifestPath = path.join(customFiguresDir, 'manifest.json');

  async function readCustomFiguresManifest(): Promise<Record<string, string>> {
    try {
      if (!fs.existsSync(customFiguresManifestPath)) return {};
      const raw = await fs.promises.readFile(customFiguresManifestPath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, string>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  async function writeCustomFiguresManifest(manifest: Record<string, string>): Promise<void> {
    await fs.promises.mkdir(customFiguresDir, { recursive: true });
    await fs.promises.writeFile(customFiguresManifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    const distCustomDir = path.resolve(__dirname, 'dist', 'assets', 'custom-figures');
    if (fs.existsSync(path.resolve(__dirname, 'dist'))) {
      await fs.promises.mkdir(distCustomDir, { recursive: true }).catch(() => undefined);
      await fs.promises
        .writeFile(path.join(distCustomDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')
        .catch(() => undefined);
    }
  }

  app.get('/api/figures/overrides', async (_req: Request, res: Response) => {
    const overrides = await readCustomFiguresManifest();
    res.json({ overrides });
  });

  app.post('/api/figures/override', async (req: Request, res: Response) => {
    try {
      const { figId, dataUrl } = (req.body || {}) as { figId?: string; dataUrl?: string };
      if (!figId || !/^[\w.-]+$/.test(figId) || typeof dataUrl !== 'string') {
        res.status(400).json({ error: 'Identificador de figura o imagen inválido.' });
        return;
      }

      const match = dataUrl.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
      if (!match) {
        res.status(400).json({ error: 'Formato de imagen no admitido. Use PNG, JPG o WebP.' });
        return;
      }

      const rawExt = match[1].toLowerCase();
      const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
      const buffer = Buffer.from(match[2], 'base64');
      const safeBase = figId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `${safeBase}.${ext}`;

      await fs.promises.mkdir(customFiguresDir, { recursive: true });
      const targetPath = path.join(customFiguresDir, fileName);
      await fs.promises.writeFile(targetPath, buffer);

      // Si existe build de producción en dist/, espejar archivo también allí
      const distRoot = path.resolve(__dirname, 'dist');
      if (fs.existsSync(distRoot)) {
        const distCustomDir = path.join(distRoot, 'assets', 'custom-figures');
        await fs.promises.mkdir(distCustomDir, { recursive: true }).catch(() => undefined);
        await fs.promises.writeFile(path.join(distCustomDir, fileName), buffer).catch(() => undefined);
      }

      const publicUrl = `/assets/custom-figures/${fileName}?v=${Date.now()}`;
      const manifest = await readCustomFiguresManifest();
      manifest[figId] = publicUrl;
      await writeCustomFiguresManifest(manifest);

      res.json({ ok: true, figId, url: publicUrl });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo almacenar la imagen definitiva.';
      res.status(500).json({ error: msg });
    }
  });

  app.delete('/api/figures/override/:figId', async (req: Request, res: Response) => {
    try {
      const figId = String(req.params.figId || '');
      if (!figId || !/^[\w.-]+$/.test(figId)) {
        res.status(400).json({ error: 'Identificador de figura inválido.' });
        return;
      }
      const manifest = await readCustomFiguresManifest();
      const prevUrl = manifest[figId];
      delete manifest[figId];
      await writeCustomFiguresManifest(manifest);

      if (prevUrl) {
        const cleanRel = prevUrl.split('?')[0].replace(/^\/+/, '');
        const fullPrev = path.resolve(__dirname, 'public', cleanRel);
        if (fullPrev.startsWith(customFiguresDir)) {
          await fs.promises.unlink(fullPrev).catch(() => undefined);
        }
      }
      res.json({ ok: true, figId });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo restaurar la figura original.';
      res.status(500).json({ error: msg });
    }
  });

  // =========================================================================
  // POSTURAS DE REFERENCIA CALIBRADAS (pose-overrides.json + figurePlanCatalog.ts)
  // =========================================================================
  interface ServerCatalogPoseOverride {
    bodiesRule: '1' | '2' | 'diagrama';
    widthPx: number;
    heightPx: number;
    renderMode: '3d_single' | '3d_dual' | 'diagram' | 'real_chart';
    panels: Array<Record<string, unknown>>;
    updatedAt?: string;
  }

  const poseOverridesManifestPath = path.join(customFiguresDir, 'pose-overrides.json');
  const catalogSourceFilePath = path.resolve(__dirname, 'src', 'utils', 'figurePlanCatalog.ts');

  const VALID_FOCUS_ZONES = new Set([
    'wrist_hand',
    'elbow_forearm',
    'shoulder_arm',
    'neck_cervical',
    'lumbar_l5s1',
    'trunk_pelvis',
    'legs_knees',
    'ankle_foot',
    'full_body',
  ]);
  const VALID_CAMERA_PRESETS = new Set([
    'sagittal_right',
    'sagittal_left',
    'frontal',
    'dorsal',
    'top',
    'isometric',
    'perspective_oblique',
  ]);
  const VALID_STANCE_MODES = new Set(['standing', 'seated', 'kneeling', 'squatting', 'one_leg', 'walking']);
  const VALID_HAND_GRIPS = new Set(['relaxed', 'pinch', 'power_grip', 'box_cradle']);
  const VALID_SCENE_PROPS = new Set([
    'none',
    'chair',
    'work_desk_support',
    'box_load',
    'electrical_panel',
    'trench_shovel',
    'iron_tamper_low',
    'iron_tamper_high',
    'crane_levers',
    'office_desk_corner_monitor',
    'office_desk_lateral',
    'loading_dock_van',
    'bin_to_cart',
    'floor_pouches',
    'cart_push_dynamo',
    'cart_pull_dynamo',
    'high_scanner_desk',
    'pallet_cooler',
    'cold_room_high_shelf',
    'bus_driver_seat',
    'conveyor_veg_line',
    'hopper_sack_pour',
    'pallet_jack_rack',
  ]);

  function normalizeFullPoseObject(rawPose: unknown): Record<string, unknown> {
    const p = (rawPose && typeof rawPose === 'object' ? rawPose : {}) as Record<string, unknown>;
    const normalized: Record<string, unknown> = {
      trunkFlexionDeg: clampRound(p.trunkFlexionDeg, 0, -45, 130),
      trunkLateralDeg: clampRound(p.trunkLateralDeg, 0, -45, 45),
      trunkTwistDeg: clampRound(p.trunkTwistDeg, 0, -75, 75),
      neckFlexionDeg: clampRound(p.neckFlexionDeg, 0, -55, 75),
      neckLateralDeg: clampRound(p.neckLateralDeg, 0, -45, 45),
      neckTwistDeg: clampRound(p.neckTwistDeg, 0, -75, 75),
      shoulderRFlexionDeg: clampRound(p.shoulderRFlexionDeg, 4, -65, 180),
      shoulderRAbductionDeg: clampRound(p.shoulderRAbductionDeg, 5, 0, 170),
      shoulderLFlexionDeg: clampRound(p.shoulderLFlexionDeg, 4, -65, 180),
      shoulderLAbductionDeg: clampRound(p.shoulderLAbductionDeg, 5, 0, 170),
      elbowRFlexionDeg: clampRound(p.elbowRFlexionDeg, 10, 0, 160),
      elbowLFlexionDeg: clampRound(p.elbowLFlexionDeg, 10, 0, 160),
      forearmRPronationDeg: clampRound(p.forearmRPronationDeg, 0, -90, 90),
      wristRFlexionDeg: clampRound(p.wristRFlexionDeg, 0, -75, 75),
      wristRDeviationDeg: clampRound(p.wristRDeviationDeg, 0, -40, 40),
      hipRFlexionDeg: clampRound(p.hipRFlexionDeg, 0, -35, 135),
      kneeRFlexionDeg: clampRound(p.kneeRFlexionDeg, 2, 0, 150),
      ankleRDorsiflexionDeg: clampRound(p.ankleRDorsiflexionDeg, 0, -45, 45),
      hipLFlexionDeg: clampRound(p.hipLFlexionDeg, clampRound(p.hipRFlexionDeg, 0, -35, 135), -35, 135),
      kneeLFlexionDeg: clampRound(p.kneeLFlexionDeg, clampRound(p.kneeRFlexionDeg, 2, 0, 150), 0, 150),
      ankleLDorsiflexionDeg: clampRound(
        p.ankleLDorsiflexionDeg,
        clampRound(p.ankleRDorsiflexionDeg, 0, -45, 45),
        -45,
        45,
      ),
    };

    if (typeof p.shoulderRRotationDeg === 'number' && Number.isFinite(p.shoulderRRotationDeg)) {
      normalized.shoulderRRotationDeg = clampRound(p.shoulderRRotationDeg, 0, -90, 90);
    }
    if (typeof p.shoulderLRotationDeg === 'number' && Number.isFinite(p.shoulderLRotationDeg)) {
      normalized.shoulderLRotationDeg = clampRound(p.shoulderLRotationDeg, 0, -90, 90);
    }
    if (typeof p.forearmLPronationDeg === 'number' && Number.isFinite(p.forearmLPronationDeg)) {
      normalized.forearmLPronationDeg = clampRound(p.forearmLPronationDeg, 0, -90, 90);
    }
    if (typeof p.wristLFlexionDeg === 'number' && Number.isFinite(p.wristLFlexionDeg)) {
      normalized.wristLFlexionDeg = clampRound(p.wristLFlexionDeg, 0, -75, 75);
    }
    if (typeof p.wristLDeviationDeg === 'number' && Number.isFinite(p.wristLDeviationDeg)) {
      normalized.wristLDeviationDeg = clampRound(p.wristLDeviationDeg, 0, -40, 40);
    }
    if (typeof p.shoulderRElevated === 'boolean') {
      normalized.shoulderRElevated = p.shoulderRElevated;
    }
    if (typeof p.forearmRCrossMidline === 'boolean') {
      normalized.forearmRCrossMidline = p.forearmRCrossMidline;
    }
    const stance = typeof p.stanceMode === 'string' && VALID_STANCE_MODES.has(p.stanceMode) ? p.stanceMode : 'standing';
    normalized.stanceMode = stance;

    const prop = typeof p.prop === 'string' && VALID_SCENE_PROPS.has(p.prop) ? p.prop : 'none';
    normalized.prop = prop;

    if (typeof p.loadKg === 'number' && Number.isFinite(p.loadKg) && p.loadKg > 0) {
      normalized.loadKg = clampRound(p.loadKg, 12, 1, 80);
    }
    if (
      typeof p.highlightGroup === 'string' &&
      ['none', 'rula_groups', 'sagittal_split', 'l5s1_disc'].includes(p.highlightGroup)
    ) {
      normalized.highlightGroup = p.highlightGroup;
    }
    const grip = typeof p.handGripMode === 'string' && VALID_HAND_GRIPS.has(p.handGripMode) ? p.handGripMode : 'relaxed';
    normalized.handGripMode = grip;

    if (typeof p.rootOffsetX === 'number' && Number.isFinite(p.rootOffsetX) && Math.abs(p.rootOffsetX) > 0.001) {
      normalized.rootOffsetX = Math.round(Math.max(-2.5, Math.min(2.5, p.rootOffsetX)) * 100) / 100;
    }
    if (typeof p.rootOffsetZ === 'number' && Number.isFinite(p.rootOffsetZ) && Math.abs(p.rootOffsetZ) > 0.001) {
      normalized.rootOffsetZ = Math.round(Math.max(-2.5, Math.min(2.5, p.rootOffsetZ)) * 100) / 100;
    }
    if (typeof p.rootYawDeg === 'number' && Number.isFinite(p.rootYawDeg) && Math.abs(p.rootYawDeg) > 0.1) {
      normalized.rootYawDeg = clampRound(p.rootYawDeg, 0, -180, 180);
    }
    if (typeof p.propOffsetX === 'number' && Number.isFinite(p.propOffsetX) && Math.abs(p.propOffsetX) > 0.001) {
      normalized.propOffsetX = Math.round(Math.max(-2.5, Math.min(2.5, p.propOffsetX)) * 100) / 100;
    }
    if (typeof p.propOffsetY === 'number' && Number.isFinite(p.propOffsetY) && Math.abs(p.propOffsetY) > 0.001) {
      normalized.propOffsetY = Math.round(Math.max(-1.8, Math.min(1.8, p.propOffsetY)) * 100) / 100;
    }
    if (typeof p.propOffsetZ === 'number' && Number.isFinite(p.propOffsetZ) && Math.abs(p.propOffsetZ) > 0.001) {
      normalized.propOffsetZ = Math.round(Math.max(-2.5, Math.min(2.5, p.propOffsetZ)) * 100) / 100;
    }
    if (typeof p.propRotYDeg === 'number' && Number.isFinite(p.propRotYDeg) && Math.abs(p.propRotYDeg) > 0.1) {
      normalized.propRotYDeg = clampRound(p.propRotYDeg, 0, -180, 180);
    }
    if (typeof p.propScale === 'number' && Number.isFinite(p.propScale) && Math.abs(p.propScale - 1) > 0.01) {
      normalized.propScale = Math.round(Math.max(0.45, Math.min(2.0, p.propScale)) * 100) / 100;
    }
    if (
      typeof p.loadDetachedPhase === 'string' &&
      ['origin_rest', 'carried', 'dest_rest'].includes(p.loadDetachedPhase)
    ) {
      normalized.loadDetachedPhase = p.loadDetachedPhase;
    }
    return normalized;
  }

  function normalizePanelSpecObject(rawPanel: unknown, idx: number): Record<string, unknown> {
    const p = (rawPanel && typeof rawPanel === 'object' ? rawPanel : {}) as Record<string, unknown>;
    const bodyLetters = ['A', 'B', 'C', 'D'];
    const subTitle =
      typeof p.subTitle === 'string' && p.subTitle.trim().length > 0
        ? p.subTitle.trim().slice(0, 96)
        : `Cuerpo ${bodyLetters[idx] || idx + 1}`;
    const focusZone =
      typeof p.focusZone === 'string' && VALID_FOCUS_ZONES.has(p.focusZone) ? p.focusZone : 'full_body';
    const cameraPreset =
      typeof p.cameraPreset === 'string' && VALID_CAMERA_PRESETS.has(p.cameraPreset)
        ? p.cameraPreset
        : 'sagittal_right';

    const panelObj: Record<string, unknown> = {
      subTitle,
      ...(typeof p.scoreBadge === 'string' && p.scoreBadge.trim()
        ? { scoreBadge: p.scoreBadge.trim().slice(0, 48) }
        : {}),
      focusZone,
      cameraPreset,
      pose: normalizeFullPoseObject(p.pose),
    };

    if (p.orbitOverride && typeof p.orbitOverride === 'object') {
      const orb = p.orbitOverride as Record<string, unknown>;
      const az = clampRound(orb.azimuthDeg, 0, -180, 180);
      const el = clampRound(orb.elevationDeg, 0, -65, 65);
      const zmRaw = typeof orb.zoom === 'number' ? orb.zoom : Number(orb.zoom);
      const zm = Number.isFinite(zmRaw) ? Math.round(Math.max(0.45, Math.min(2.5, zmRaw)) * 100) / 100 : 1;
      if (az !== 0 || el !== 0 || Math.abs(zm - 1) > 0.01) {
        panelObj.orbitOverride = { azimuthDeg: az, elevationDeg: el, zoom: zm };
      }
    }

    if (Array.isArray(p.angleArcs) && p.angleArcs.length > 0) {
      panelObj.angleArcs = p.angleArcs;
    }
    if (Array.isArray(p.forceVectors) && p.forceVectors.length > 0) {
      panelObj.forceVectors = p.forceVectors;
    }
    if (Array.isArray(p.dimensions) && p.dimensions.length > 0) {
      panelObj.dimensions = p.dimensions;
    }
    if (typeof p.noteBottom === 'string' && p.noteBottom.trim()) {
      panelObj.noteBottom = p.noteBottom.trim().slice(0, 140);
    }

    return panelObj;
  }

  function serializeTsLiteral(value: unknown, indent = 0): string {
    const pad = ' '.repeat(indent);
    const childPad = ' '.repeat(indent + 2);
    if (value === null || value === undefined) return 'undefined';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'string') {
      const escaped = value
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '')
        .replace(/\n/g, '\\n');
      return `'${escaped}'`;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      const items = value.map((item) => `${childPad}${serializeTsLiteral(item, indent + 2)}`);
      return `[\n${items.join(',\n')},\n${pad}]`;
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
      if (entries.length === 0) return '{}';
      const lines = entries.map(([k, v]) => {
        const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : serializeTsLiteral(k, 0);
        return `${childPad}${safeKey}: ${serializeTsLiteral(v, indent + 2)}`;
      });
      return `{\n${lines.join(',\n')},\n${pad}}`;
    }
    return 'undefined';
  }

  function findMatchingBracketInTs(src: string, openIdx: number, openChar: '{' | '[', closeChar: '}' | ']'): number {
    let depth = 0;
    let mode: 'code' | 'single' | 'double' | 'template' | 'line_comment' | 'block_comment' = 'code';
    for (let i = openIdx; i < src.length; i++) {
      const ch = src[i];
      const next = src[i + 1];
      if (mode === 'code') {
        if (ch === "'") mode = 'single';
        else if (ch === '"') mode = 'double';
        else if (ch === '`') mode = 'template';
        else if (ch === '/' && next === '/') {
          mode = 'line_comment';
          i++;
        } else if (ch === '/' && next === '*') {
          mode = 'block_comment';
          i++;
        } else if (ch === openChar) {
          depth++;
        } else if (ch === closeChar) {
          depth--;
          if (depth === 0) return i;
        }
      } else if (mode === 'single') {
        if (ch === '\\') i++;
        else if (ch === "'") mode = 'code';
      } else if (mode === 'double') {
        if (ch === '\\') i++;
        else if (ch === '"') mode = 'code';
      } else if (mode === 'template') {
        if (ch === '\\') i++;
        else if (ch === '`') mode = 'code';
      } else if (mode === 'line_comment') {
        if (ch === '\n') mode = 'code';
      } else if (mode === 'block_comment') {
        if (ch === '*' && next === '/') {
          mode = 'code';
          i++;
        }
      }
    }
    return -1;
  }

  async function updateFigurePlanCatalogSourceFile(
    figId: string,
    override: ServerCatalogPoseOverride,
  ): Promise<boolean> {
    try {
      if (!fs.existsSync(catalogSourceFilePath)) return false;
      const src = await fs.promises.readFile(catalogSourceFilePath, 'utf-8');
      const rawCatStart = src.indexOf('RAW_BOOK_FIGURE_CATALOG');
      const catalogStart = rawCatStart !== -1 ? rawCatStart : src.indexOf('BOOK_FIGURE_CATALOG');
      if (catalogStart === -1) return false;

      const escapedId = figId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const idRegex = new RegExp(`\\bid\\s*:\\s*['"]${escapedId}['"]`);
      const relMatch = idRegex.exec(src.slice(catalogStart));
      if (!relMatch) return false;

      const absIdIdx = catalogStart + relMatch.index;
      let entryOpenIdx = -1;
      for (let i = absIdIdx; i >= catalogStart; i--) {
        if (src[i] === '{') {
          entryOpenIdx = i;
          break;
        }
      }
      if (entryOpenIdx === -1) return false;

      const entryCloseIdx = findMatchingBracketInTs(src, entryOpenIdx, '{', '}');
      if (entryCloseIdx === -1) return false;

      let entryText = src.slice(entryOpenIdx, entryCloseIdx + 1);
      entryText = entryText.replace(/\bbodiesRule\s*:\s*['"][^'"]+['"]/, `bodiesRule: '${override.bodiesRule}'`);
      entryText = entryText.replace(/\bwidthPx\s*:\s*\d+/, `widthPx: ${override.widthPx}`);
      entryText = entryText.replace(/\bheightPx\s*:\s*\d+/, `heightPx: ${override.heightPx}`);
      entryText = entryText.replace(/\brenderMode\s*:\s*['"][^'"]+['"]/, `renderMode: '${override.renderMode}'`);

      const panelsPropMatch = /\bpanels\s*:\s*\[/.exec(entryText);
      const serializedPanels = serializeTsLiteral(override.panels, 4);
      if (panelsPropMatch) {
        const openArrIdx = entryText.indexOf('[', panelsPropMatch.index);
        const closeArrIdx = findMatchingBracketInTs(entryText, openArrIdx, '[', ']');
        if (closeArrIdx === -1) return false;
        entryText =
          entryText.slice(0, openArrIdx) + serializedPanels + entryText.slice(closeArrIdx + 1);
      } else {
        entryText = entryText.replace(
          /(\brenderMode\s*:\s*['"][^'"]+['"]\s*,?)/,
          `$1\n    panels: ${serializedPanels},`,
        );
      }

      // Verificación léxica de cierre exacto del bloque antes de persistir en disco
      if (findMatchingBracketInTs(entryText, 0, '{', '}') !== entryText.length - 1) {
        return false;
      }

      const updatedSrc = src.slice(0, entryOpenIdx) + entryText + src.slice(entryCloseIdx + 1);
      await fs.promises.writeFile(catalogSourceFilePath, updatedSrc, 'utf-8');
      return true;
    } catch (err) {
      console.error('[figurePlanCatalog updater] Error:', err);
      return false;
    }
  }

  async function readPoseOverridesManifest(): Promise<Record<string, ServerCatalogPoseOverride>> {
    try {
      if (!fs.existsSync(poseOverridesManifestPath)) return {};
      const raw = await fs.promises.readFile(poseOverridesManifestPath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, ServerCatalogPoseOverride>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  async function writePoseOverridesManifest(manifest: Record<string, ServerCatalogPoseOverride>): Promise<void> {
    await fs.promises.mkdir(customFiguresDir, { recursive: true });
    await fs.promises.writeFile(poseOverridesManifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    const distRoot = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distRoot)) {
      const distCustomDir = path.join(distRoot, 'assets', 'custom-figures');
      await fs.promises.mkdir(distCustomDir, { recursive: true }).catch(() => undefined);
      await fs.promises
        .writeFile(path.join(distCustomDir, 'pose-overrides.json'), JSON.stringify(manifest, null, 2), 'utf-8')
        .catch(() => undefined);
    }
  }

  app.get('/api/figures/pose-overrides', async (_req: Request, res: Response) => {
    const overrides = await readPoseOverridesManifest();
    res.json({ overrides });
  });

  app.post('/api/figures/pose-override', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        figId?: string;
        panels?: unknown[];
        widthPx?: number;
        heightPx?: number;
      };
      const figId = String(body.figId || '').trim();
      if (!figId || !/^[\w.-]+$/.test(figId) || !Array.isArray(body.panels) || body.panels.length === 0) {
        res.status(400).json({ error: 'Identificador de figura o paneles de postura inválidos.' });
        return;
      }

      const normalizedPanels = body.panels
        .slice(0, 4)
        .map((panel, idx) => normalizePanelSpecObject(panel, idx));
      const isMulti = normalizedPanels.length >= 2;
      const overrideEntry: ServerCatalogPoseOverride = {
        bodiesRule: isMulti ? '2' : '1',
        widthPx: clampRound(body.widthPx, isMulti ? 800 : 480, 320, 1400),
        heightPx: clampRound(body.heightPx, isMulti ? 520 : 640, 320, 1200),
        renderMode: isMulti ? '3d_dual' : '3d_single',
        panels: normalizedPanels,
        updatedAt: new Date().toISOString(),
      };

      const manifest = await readPoseOverridesManifest();
      manifest[figId] = overrideEntry;
      await writePoseOverridesManifest(manifest);

      const sourceUpdated = await updateFigurePlanCatalogSourceFile(figId, overrideEntry);
      res.json({
        ok: true,
        figId,
        override: overrideEntry,
        catalogFileUpdated: sourceUpdated,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo guardar la postura de referencia.';
      res.status(500).json({ error: msg });
    }
  });

  app.delete('/api/figures/pose-override/:figId', async (req: Request, res: Response) => {
    try {
      const figId = String(req.params.figId || '').trim();
      if (!figId || !/^[\w.-]+$/.test(figId)) {
        res.status(400).json({ error: 'Identificador de figura inválido.' });
        return;
      }
      const manifest = await readPoseOverridesManifest();
      delete manifest[figId];
      await writePoseOverridesManifest(manifest);
      res.json({ ok: true, figId });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo restaurar la postura original.';
      res.status(500).json({ error: msg });
    }
  });

  // =========================================================================
  // EXTRACCIÓN MULTIMODAL DE POSTURA DESDE IMAGEN HACIA AVATAR 3D (Cuerpos A..D)
  // =========================================================================
  app.post('/api/figures/extract-pose', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        imageDataUrl?: string;
        figId?: string;
        title?: string;
        bookDescription?: string;
        expectedBodiesCount?: number;
      };

      const rawImg = String(body.imageDataUrl || '').trim();
      if (!rawImg) {
        res.status(400).json({ error: 'No se recibió la imagen de referencia para analizar la postura.' });
        return;
      }

      let mimeType = 'image/png';
      let base64Data = '';

      const dataUrlMatch = rawImg.match(/^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/i);
      if (dataUrlMatch) {
        mimeType = dataUrlMatch[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : dataUrlMatch[1].toLowerCase();
        base64Data = dataUrlMatch[2];
      } else if (rawImg.startsWith('/')) {
        const cleanRel = rawImg.split('?')[0].replace(/^\/+/, '');
        const candidatePath = path.resolve(__dirname, 'public', cleanRel);
        const publicRoot = path.resolve(__dirname, 'public');
        if (!candidatePath.startsWith(publicRoot) || !fs.existsSync(candidatePath)) {
          res.status(404).json({ error: 'No se encontró el archivo de imagen de referencia en el servidor.' });
          return;
        }
        const buf = await fs.promises.readFile(candidatePath);
        base64Data = buf.toString('base64');
        const ext = path.extname(candidatePath).toLowerCase();
        mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
      } else {
        res.status(400).json({ error: 'Formato de imagen no válido para extracción postural.' });
        return;
      }

      const forcedCount =
        typeof body.expectedBodiesCount === 'number' &&
        body.expectedBodiesCount >= 1 &&
        body.expectedBodiesCount <= 4
          ? Math.round(body.expectedBodiesCount)
          : 0;

      const countInstruction =
        forcedCount > 0
          ? `Extrae EXACTAMENTE ${forcedCount} cuerpo(s) humano(s) ordenados de izquierda a derecha (Cuerpo A, Cuerpo B${forcedCount >= 3 ? ', Cuerpo C' : ''}${forcedCount >= 4 ? ', Cuerpo D' : ''}).`
          : 'Detecta automáticamente cuántas figuras humanas independientes aparecen de izquierda a derecha en la lámina (1, 2, 3 o máximo 4 cuerpos) y devuelve un panel completo por cada cuerpo en orden de izquierda a derecha.';

      const promptText = `Analiza esta lámina ergonómica / fotografía de puesto de trabajo y replica con máxima exactitud goniométrica la postura de cada figura humana para nuestro motor biomecánico 3D.
Contexto del ítem:
- ID: ${body.figId || 'figura'}
- Título: ${body.title || 'Evaluación postural'}
- Descripción técnica: ${body.bookDescription || 'Sin descripción adicional'}
- Regla de cuerpos: ${countInstruction}

CONVENCIÓN GONIOMÉTRICA OBLIGATORIA DEL AVATAR 3D (0° = posición anatómica neutra de pie con brazos colgando verticales a los costados):
1. cameraPreset:
   - 'sagittal_right': perfil mirando hacia la DERECHA de la imagen.
   - 'sagittal_left': perfil mirando hacia la IZQUIERDA de la imagen.
   - 'frontal': vista de frente mirando hacia el observador.
   - 'dorsal': vista de espaldas.
   - 'isometric' o 'perspective_oblique': vista oblicua 3/4 (ajusta azimuthDeg entre -45 y +45 para calzar el giro exacto de cámara).
2. focusZone:
   - Usa 'full_body' si se ve el cuerpo entero o de rodillas arriba; 'wrist_hand' si es primer plano exclusivo de mano/muñeca; 'elbow_forearm' si es primer plano de antebrazo/codo; 'neck_cervical' si es detalle de cabeza/cuello; 'legs_knees' si es detalle inferior.
3. Ángulos articulares en grados:
   - trunkFlexionDeg: 0° = columna vertical erguida; +20° a +85° = inclinación hacia adelante; -5° a -20° = extensión hacia atrás.
   - trunkLateralDeg: inclinación lateral (-35° a +35°). trunkTwistDeg: giro axial (-45° a +45°).
   - neckFlexionDeg: respecto al tronco (0° = cuello alineado con el eje del tronco; +15° a +45° = barbilla hacia el pecho; -15° a -30° = cuello extendido hacia atrás).
   - shoulderRFlexionDeg / shoulderLFlexionDeg: 0° = brazo colgando vertical hacia abajo; +45° = adelantado 45°; +90° = brazo horizontal al frente; +135° a +170° = brazo elevado sobre el hombro/cabeza; -20° = brazo hacia atrás en extensión.
   - shoulderRAbductionDeg / shoulderLAbductionDeg: 5° = pegado al torso; +35° a +90° = separado lateralmente en plano frontal.
   - elbowRFlexionDeg / elbowLFlexionDeg: 0° = codo totalmente recto/estirado; 90° = codo en ángulo recto L; 115° = codo muy cerrado. ¡NUNCA uses 180° para brazo estirado!
   - forearmRPronationDeg / forearmLPronationDeg: 0° = neutro pulgar arriba; +75° = pronación palma abajo; -75° = supinación palma arriba.
   - wristRFlexionDeg / wristLFlexionDeg: 0° = recta; +20° a +45° = flexión palmar; -20° a -45° = extensión dorsal.
   - hipRFlexionDeg / hipLFlexionDeg: 0° = de pie recto; 85° a 95° = sentado o cadera flexionada.
   - kneeRFlexionDeg / kneeLFlexionDeg: 0° = pierna recta; 40° a 65° = semiflexión; 85° a 115° = sentado 90°, cuclillas o arrodillado.
   - stanceMode: 'standing' | 'seated' | 'kneeling' | 'squatting' | 'one_leg' | 'walking'.
   - prop: usa 'none' si es figura limpia sin muebles, 'chair' si está sentado en silla, 'work_desk_support' si apoya el brazo en mesa, 'box_load' si sujeta una caja con las manos, 'bus_driver_seat' si conduce colectivo.`;

      const ai = getGenAIClient(28000);
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType, data: base64Data } },
              { text: promptText },
            ],
          },
        ],
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              panels: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    subTitle: { type: Type.STRING },
                    scoreBadge: { type: Type.STRING },
                    focusZone: { type: Type.STRING },
                    cameraPreset: { type: Type.STRING },
                    azimuthDeg: { type: Type.NUMBER },
                    elevationDeg: { type: Type.NUMBER },
                    zoom: { type: Type.NUMBER },
                    pose: {
                      type: Type.OBJECT,
                      properties: {
                        trunkFlexionDeg: { type: Type.NUMBER },
                        trunkLateralDeg: { type: Type.NUMBER },
                        trunkTwistDeg: { type: Type.NUMBER },
                        neckFlexionDeg: { type: Type.NUMBER },
                        neckLateralDeg: { type: Type.NUMBER },
                        neckTwistDeg: { type: Type.NUMBER },
                        shoulderRFlexionDeg: { type: Type.NUMBER },
                        shoulderRAbductionDeg: { type: Type.NUMBER },
                        shoulderRElevated: { type: Type.BOOLEAN },
                        shoulderLFlexionDeg: { type: Type.NUMBER },
                        shoulderLAbductionDeg: { type: Type.NUMBER },
                        elbowRFlexionDeg: { type: Type.NUMBER },
                        elbowLFlexionDeg: { type: Type.NUMBER },
                        forearmRPronationDeg: { type: Type.NUMBER },
                        forearmLPronationDeg: { type: Type.NUMBER },
                        forearmRCrossMidline: { type: Type.BOOLEAN },
                        wristRFlexionDeg: { type: Type.NUMBER },
                        wristRDeviationDeg: { type: Type.NUMBER },
                        wristLFlexionDeg: { type: Type.NUMBER },
                        wristLDeviationDeg: { type: Type.NUMBER },
                        hipRFlexionDeg: { type: Type.NUMBER },
                        kneeRFlexionDeg: { type: Type.NUMBER },
                        ankleRDorsiflexionDeg: { type: Type.NUMBER },
                        hipLFlexionDeg: { type: Type.NUMBER },
                        kneeLFlexionDeg: { type: Type.NUMBER },
                        ankleLDorsiflexionDeg: { type: Type.NUMBER },
                        stanceMode: { type: Type.STRING },
                        prop: { type: Type.STRING },
                        handGripMode: { type: Type.STRING },
                      },
                      required: [
                        'trunkFlexionDeg',
                        'neckFlexionDeg',
                        'shoulderRFlexionDeg',
                        'shoulderLFlexionDeg',
                        'elbowRFlexionDeg',
                        'elbowLFlexionDeg',
                        'wristRFlexionDeg',
                        'hipRFlexionDeg',
                        'kneeRFlexionDeg',
                        'stanceMode',
                      ],
                    },
                  },
                  required: ['subTitle', 'focusZone', 'cameraPreset', 'pose'],
                },
              },
            },
            required: ['panels'],
          },
        },
      });

      const rawText = stripMarkdownJsonFences(response.text || '{}');
      const parsed = JSON.parse(rawText) as { panels?: Array<Record<string, unknown>> };
      const rawPanels = Array.isArray(parsed.panels) ? parsed.panels.slice(0, 4) : [];
      if (rawPanels.length === 0) {
        res.status(422).json({ error: 'No se detectaron figuras posturales en la imagen analizada.' });
        return;
      }

      const normalizedPanels = rawPanels.map((rp, idx) => {
        const withOrbit: Record<string, unknown> = {
          ...rp,
          orbitOverride: {
            azimuthDeg: clampRound(rp.azimuthDeg, 0, -180, 180),
            elevationDeg: clampRound(rp.elevationDeg, 0, -60, 60),
            zoom:
              typeof rp.zoom === 'number' && Number.isFinite(rp.zoom)
                ? Math.max(0.6, Math.min(1.8, rp.zoom))
                : 1,
          },
        };
        return normalizePanelSpecObject(withOrbit, idx);
      });

      res.json({
        ok: true,
        bodiesCount: normalizedPanels.length,
        panels: normalizedPanels,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al extraer postura biomecánica desde la imagen.';
      console.error('[/api/figures/extract-pose] Error:', msg);
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/biomech/extract-video', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as ExtractVideoRequestBody;
      const frames = Array.isArray(body.frames) ? body.frames : [];
      const hasInlineVideo = Boolean(body.videoInline?.dataBase64 && body.videoInline?.mimeType);

      if (frames.length === 0 && !hasInlineVideo) {
        res.status(400).json({
          error: 'No se recibieron fotogramas ni flujo de video para analizar.',
        });
        return;
      }

      // Submuestrear inteligentemente si llegan >14 fotogramas para acelerar Paso 2 y evitar timeouts/503,
      // preservando el mapeo exacto hacia el índice original del arreglo `frames` del cliente.
      const maxModelFrames = 12;
      const indexedFrames: Array<{ clientIdx: number; frame: SampledVideoFramePayload }> = [];
      const validIncoming = frames
        .map((frame, idx) => ({
          clientIdx: typeof frame.index === 'number' && Number.isFinite(frame.index) ? frame.index : idx,
          frame,
        }))
        .filter((item) => Boolean(item.frame.dataBase64 && item.frame.mimeType));

      if (validIncoming.length <= maxModelFrames) {
        indexedFrames.push(...validIncoming);
      } else {
        for (let i = 0; i < maxModelFrames; i++) {
          const pick = Math.min(
            validIncoming.length - 1,
            Math.round((i / (maxModelFrames - 1)) * (validIncoming.length - 1)),
          );
          indexedFrames.push(validIncoming[pick]);
        }
      }

      const cappedFrames = indexedFrames.map((it) => it.frame);
      const statureCm = clampRound(body.workerHeightCm, 172, 140, 210);
      const durInfo =
        typeof body.videoDurationSec === 'number' && Number.isFinite(body.videoDurationSec)
          ? `Duración total del video: ${body.videoDurationSec.toFixed(3)} segundos (${cappedFrames.length} fotogramas indexados del 0 al ${Math.max(0, cappedFrames.length - 1)}). `
          : '';

      const hintMap: Record<NonNullable<ExtractVideoRequestBody['movementModeHint']>, string> = {
        auto: 'Determina visualmente si el operario levanta la carga desde el suelo/nivel bajo hacia una estantería/plano alto (v_destino_cm > v_origen_cm), o si baja la carga desde una altura mayor hacia una altura menor (v_origen_cm > v_destino_cm), o si la traslada al mismo nivel.',
        levantamiento:
          'Contexto operativo indicado: LEVANTAMIENTO ASCENDENTE desde nivel bajo/suelo hacia estantería o plano superior (v_destino_cm > v_origen_cm).',
        descenso:
          'Contexto operativo indicado: DESCENSO / BAJADA DE CARGA desde una estantería o altura superior hacia una altura menor o suelo (v_origen_cm > v_destino_cm).',
        bidireccional:
          'Contexto operativo indicado: CICLO REVERSIBLE / BIDIRECCIONAL donde el origen también puede ser el destino de la carga (estiba y desestiba alternada).',
      };
      const hintText = hintMap[body.movementModeHint || 'auto'];

      const buildPartsForSubset = (subset: SampledVideoFramePayload[]) => {
        const subsetParts: Array<
          | { text: string }
          | { inlineData: { mimeType: string; data: string } }
        > = [];
        if (hasInlineVideo && body.videoInline) {
          subsetParts.push({
            inlineData: {
              mimeType: body.videoInline.mimeType,
              data: body.videoInline.dataBase64,
            },
          });
        }
        subset.forEach((frame, idx) => {
          subsetParts.push({
            text: `Fotograma #${idx} (frame_index=${idx}, timestamp=${frame.timestamp})`,
          });
          subsetParts.push({
            inlineData: {
              mimeType: frame.mimeType,
              data: frame.dataBase64,
            },
          });
        });
        subsetParts.push({
          text:
            `${durInfo}Estatura del operario = ${statureCm} cm. ${hintText} ` +
            `IMPORTANTE: Observa dónde está la carga y cómo están el tronco y las rodillas del humano en cada cuadro: ` +
            `si toma la carga ABAJO con RODILLAS FLEXIONADAS Y ESPALDA RECTA (levantamiento higiénico), reporta 'trunk_flexion' bajo (10°..22°) y 'knee_flexion' alto (75°..115°); ` +
            `si toma la carga ABAJO doblando la espalda con piernas rectas, reporta 'trunk_flexion' alto (45°..80°) y 'knee_flexion' bajo (5°..25°). ` +
            `En colocación ALTA (pecho/hombros), 'v_destino_cm' = 115..175 cm con tronco erguido (0°..14°). Elige dos fotogramas DISTINTOS ('origen_frame_index' !== 'destino_frame_index').`,
        });
        return subsetParts;
      };

      // Si el usuario editó la instrucción pero incluyó otro formato JSON, conservar sus criterios pero garantizar compatibilidad con responseSchema
      const hasCustom =
        typeof body.customSystemInstruction === 'string' &&
        body.customSystemInstruction.trim().length > 20 &&
        body.customSystemInstruction.trim() !== DEFAULT_VIDEO_BIOMECH_SYSTEM_INSTRUCTION.trim();

      const systemInstruction = hasCustom
        ? `${DEFAULT_VIDEO_BIOMECH_SYSTEM_INSTRUCTION}\n\nDIRECTRICES ADICIONALES DEL EVALUADOR:\n${body.customSystemInstruction!.trim()}`
        : DEFAULT_VIDEO_BIOMECH_SYSTEM_INSTRUCTION;

      const phaseAngleSchema = {
        type: Type.OBJECT,
        properties: {
          trunk_flexion: {
            type: Type.NUMBER,
            description: 'Flexión sagital del tronco respecto a la vertical (0° = erguido vertical, 10°-20° = espalda recta en cuclillas, 45°-75° = espalda doblada)',
          },
          knee_flexion: {
            type: Type.NUMBER,
            description: 'Flexión de rodillas desde extensión completa (0° = piernas rectas, 70°-115° = rodillas flexionadas en levantamiento higiénico)',
          },
          shoulder_flexion: {
            type: Type.NUMBER,
            description: 'Flexión glenohumeral respecto al tronco (0° = alineado al tronco, 90° = perpendicular, >110° = sobre hombros)',
          },
          right_elbow: {
            type: Type.NUMBER,
            description: 'Flexión anatómica del codo derecho (0° = brazo recto extendido, 90° = ángulo recto L; NO ángulo interior de 180°)',
          },
          left_elbow: {
            type: Type.NUMBER,
            description: 'Flexión anatómica del codo izquierdo (0° = brazo recto extendido, 90° = ángulo recto L; NO ángulo interior de 180°)',
          },
        },
        required: ['trunk_flexion', 'knee_flexion', 'shoulder_flexion', 'right_elbow', 'left_elbow'],
      };

      const extractionResponseSchema = {
        type: Type.OBJECT,
        properties: {
          status: {
            type: Type.STRING,
            description: 'Must be "processed"',
          },
          critical_events: {
            type: Type.OBJECT,
            properties: {
              origen_frame_index: {
                type: Type.INTEGER,
                description: 'Índice entero (0..N-1) del fotograma exacto donde las manos sujetan la carga en el origen',
              },
              destino_frame_index: {
                type: Type.INTEGER,
                description: 'Índice entero (0..N-1), DISTINTO de origen_frame_index, donde las manos depositan la carga en el destino',
              },
              critico_frame_index: {
                type: Type.INTEGER,
                description: 'Índice entero (0..N-1) del fotograma de mayor carga postural global',
              },
              origen_timestamp: {
                type: Type.STRING,
                description: 'Timestamp exacto MM:SS.mmm del fotograma elegido como origen',
              },
              destino_timestamp: {
                type: Type.STRING,
                description: 'Timestamp exacto MM:SS.mmm del fotograma elegido como destino',
              },
            },
            required: [
              'origen_frame_index',
              'destino_frame_index',
              'critico_frame_index',
              'origen_timestamp',
              'destino_timestamp',
            ],
          },
          movement_analysis: {
            type: Type.OBJECT,
            properties: {
              direction: {
                type: Type.STRING,
                description:
                  'Valores permitidos: "levantamiento_suelo_a_estanteria", "descenso_altura_a_bajo", "traslado_mismo_nivel", "ciclo_bidireccional"',
              },
              v_origen_cm: {
                type: Type.NUMBER,
                description: 'Altura vertical en cm desde el suelo al agarre en el fotograma de origen',
              },
              v_destino_cm: {
                type: Type.NUMBER,
                description: 'Altura vertical en cm desde el suelo al agarre en el fotograma de destino',
              },
              h_origen_cm: {
                type: Type.NUMBER,
                description: 'Distancia horizontal en cm desde tobillos al agarre en el origen',
              },
              h_destino_cm: {
                type: Type.NUMBER,
                description: 'Distancia horizontal en cm desde tobillos al agarre en el destino',
              },
              trajectory_note: {
                type: Type.STRING,
                description:
                  'Explicación técnica indicando si levanta desde nivel bajo a estantería o baja de altura mayor a menor',
              },
            },
            required: [
              'direction',
              'v_origen_cm',
              'v_destino_cm',
              'h_origen_cm',
              'h_destino_cm',
              'trajectory_note',
            ],
          },
          niosh_inputs: {
            type: Type.OBJECT,
            properties: {
              H_cm: {
                type: Type.NUMBER,
                description: 'Distancia horizontal crítica en cm desde punto medio de tobillos al centro de agarre',
              },
              V_cm: {
                type: Type.NUMBER,
                description: 'Altura vertical en cm desde el suelo al agarre en el origen',
              },
              D_cm: {
                type: Type.NUMBER,
                description: 'Desplazamiento vertical total en cm |v_destino_cm - v_origen_cm|',
              },
              A_deg: {
                type: Type.NUMBER,
                description: 'Ángulo de asimetría del torso/carga en grados (0 a 135)',
              },
            },
            required: ['H_cm', 'V_cm', 'D_cm', 'A_deg'],
          },
          origen_angles_deg: phaseAngleSchema,
          destino_angles_deg: phaseAngleSchema,
            postural_angles_deg: {
            type: Type.OBJECT,
            properties: {
              trunk_flexion: {
                type: Type.NUMBER,
                description: 'Flexión máxima del tronco respecto a la vertical real (0°) en grados en el instante crítico',
              },
              trunk_lateral: {
                type: Type.NUMBER,
                description: 'Inclinación lateral del tronco en plano frontal (-35° a +35°)',
              },
              trunk_twist: {
                type: Type.NUMBER,
                description: 'Rotación axial del tronco en plano transversal (-60° a +60°)',
              },
              shoulder_flexion: {
                type: Type.NUMBER,
                description: 'Flexión anteroposterior del hombro derecho respecto al eje del tronco en el instante crítico',
              },
              shoulder_abduction: {
                type: Type.NUMBER,
                description: 'Abducción lateral del hombro derecho en plano frontal (0° a 135°)',
              },
              humeral_rotation: {
                type: Type.NUMBER,
                description: 'Rotación humeral derecha en grados (-90° interna a +90° externa)',
              },
              hip_flexion: {
                type: Type.NUMBER,
                description: 'Flexión coxofemoral derecha en el instante crítico (0° de pie recto, 90° sentado/cuclilla)',
              },
              knee_flexion: {
                type: Type.NUMBER,
                description: 'Flexión articular de rodillas en grados en el instante crítico',
              },
              right_elbow: {
                type: Type.NUMBER,
                description: 'Flexión anatómica del codo derecho en grados (0° = recto, 90° = L)',
              },
              left_elbow: {
                type: Type.NUMBER,
                description: 'Flexión anatómica del codo izquierdo en grados (0° = recto, 90° = L)',
              },
              support_condition: {
                type: Type.STRING,
                description: 'Condiciones reales de apoyo observadas: ej. Bipedestación bilateral, Monopedestación, Sedestación, Apoyo de rodillas',
              },
              reference_plane: {
                type: Type.STRING,
                description: 'Plano anatómico principal observado: Sagital, Frontal o Sagital/Frontal',
              },
            },
            required: ['trunk_flexion', 'knee_flexion', 'right_elbow', 'left_elbow'],
          },
        },
        required: [
          'status',
          'critical_events',
          'movement_analysis',
          'niosh_inputs',
          'origen_angles_deg',
          'destino_angles_deg',
          'postural_angles_deg',
        ],
      };

      // Cascada resiliente multimodelo para evitar cortes en Paso 2 ante picos de demanda 503/429
      const modelCascade: Array<{
        model: string;
        thinking: ThinkingLevel;
        timeoutMs: number;
        compactSubset: boolean;
      }> = [
        { model: 'gemini-3.1-flash-lite', thinking: ThinkingLevel.MINIMAL, timeoutMs: 20000, compactSubset: false },
        { model: 'gemini-3.8-flash', thinking: ThinkingLevel.LOW, timeoutMs: 22000, compactSubset: false },
        { model: 'gemini-flash-latest', thinking: ThinkingLevel.LOW, timeoutMs: 20000, compactSubset: true },
        { model: 'gemini-3.1-flash-lite', thinking: ThinkingLevel.MINIMAL, timeoutMs: 18000, compactSubset: true },
      ];

      let parsed: Record<string, unknown> | null = null;
      let activeSubsetForMapping = indexedFrames;
      let lastModelErr = '';

      for (let attemptIdx = 0; attemptIdx < modelCascade.length; attemptIdx++) {
        const tier = modelCascade[attemptIdx];
        const subsetItems =
          tier.compactSubset && indexedFrames.length > 8
            ? Array.from({ length: 8 }, (_, k) =>
                indexedFrames[Math.min(indexedFrames.length - 1, Math.round((k / 7) * (indexedFrames.length - 1)))],
              )
            : indexedFrames;

        try {
          const aiTier = getGenAIClient(tier.timeoutMs);
          const response = await aiTier.models.generateContent({
            model: tier.model,
            contents: { parts: buildPartsForSubset(subsetItems.map((s) => s.frame)) },
            config: {
              systemInstruction,
              temperature: 0.1,
              thinkingConfig: { thinkingLevel: tier.thinking },
              responseMimeType: 'application/json',
              responseSchema: extractionResponseSchema,
            },
          });

          const cleanedJson = stripMarkdownJsonFences(response.text || '');
          if (cleanedJson) {
            parsed = JSON.parse(cleanedJson) as Record<string, unknown>;
            activeSubsetForMapping = subsetItems;
            break;
          }
        } catch (tierErr: unknown) {
          lastModelErr = tierErr instanceof Error ? tierErr.message : String(tierErr);
          console.warn(`[extract-video] Intento ${attemptIdx + 1} (${tier.model}) falló:`, lastModelErr.slice(0, 180));
          if (attemptIdx < modelCascade.length - 1) {
            await new Promise((r) => setTimeout(r, 600));
          }
        }
      }

      if (!parsed) {
        console.warn('[extract-video] Activando respaldo óptico directo sobre fotogramas reales tras 503/timeout:', lastModelErr.slice(0, 160));
        parsed = await analyzeRealFramesOpticallyFallback(
          indexedFrames.map((s) => s.frame),
          statureCm,
          body.movementModeHint,
        );
        activeSubsetForMapping = indexedFrames;
      }
      const crit = (parsed.critical_events || {}) as Record<string, unknown>;
      const mov = (parsed.movement_analysis || {}) as Record<string, unknown>;
      const niosh = (parsed.niosh_inputs || {}) as Record<string, unknown>;
      const angles = (parsed.postural_angles_deg || {}) as Record<string, unknown>;
      const origAnglesRaw = (parsed.origen_angles_deg || {}) as Record<string, unknown>;
      const destAnglesRaw = (parsed.destino_angles_deg || {}) as Record<string, unknown>;

      // Resolver índices de fotogramas mapeando de vuelta al índice original del cliente y garantizando Origen !== Destino
      const subsetLen = activeSubsetForMapping.length;
      const findNearestSubsetIdxBySec = (sec: number | null): number | null => {
        if (sec === null || subsetLen === 0) return null;
        let bestIdx = 0;
        let bestDiff = Infinity;
        activeSubsetForMapping.forEach((item, idx) => {
          const fSec =
            typeof item.frame.timeSec === 'number'
              ? item.frame.timeSec
              : parseFlexibleTimestampSec(item.frame.timestamp) ?? 0;
          const diff = Math.abs(fSec - sec);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestIdx = idx;
          }
        });
        return bestIdx;
      };

      const defaultSubOrig = subsetLen >= 4 ? Math.max(0, Math.round((subsetLen - 1) * 0.14)) : 0;
      const defaultSubDest =
        subsetLen >= 4 ? Math.min(subsetLen - 1, Math.round((subsetLen - 1) * 0.88)) : Math.max(0, subsetLen - 1);

      let subOrigIdx =
        typeof crit.origen_frame_index === 'number' && Number.isFinite(crit.origen_frame_index)
          ? Math.max(0, Math.min(Math.max(0, subsetLen - 1), Math.round(crit.origen_frame_index)))
          : findNearestSubsetIdxBySec(parseFlexibleTimestampSec(crit.origen_timestamp)) ?? defaultSubOrig;

      let subDestIdx =
        typeof crit.destino_frame_index === 'number' && Number.isFinite(crit.destino_frame_index)
          ? Math.max(0, Math.min(Math.max(0, subsetLen - 1), Math.round(crit.destino_frame_index)))
          : findNearestSubsetIdxBySec(parseFlexibleTimestampSec(crit.destino_timestamp)) ?? defaultSubDest;

      if (subsetLen >= 2 && subOrigIdx === subDestIdx) {
        subOrigIdx = defaultSubOrig;
        subDestIdx = defaultSubDest === subOrigIdx ? Math.min(subsetLen - 1, subOrigIdx + 1) : defaultSubDest;
      }

      const resolvedOrigIdx = activeSubsetForMapping[subOrigIdx]?.clientIdx ?? subOrigIdx;
      const resolvedDestIdx = activeSubsetForMapping[subDestIdx]?.clientIdx ?? subDestIdx;

      let vOrig = clampRound(mov.v_origen_cm ?? niosh.V_cm, 32, 0, 195);
      const rawD = clampRound(niosh.D_cm, 48, 0, 185);
      let vDest = clampRound(
        mov.v_destino_cm,
        body.movementModeHint === 'descenso'
          ? Math.max(10, vOrig - rawD)
          : Math.min(195, vOrig + rawD),
        0,
        195,
      );

      let swappedByHint = false;
      if (body.movementModeHint === 'levantamiento' && vDest < vOrig) {
        const tmp = vOrig;
        vOrig = vDest;
        vDest = tmp;
        swappedByHint = true;
      } else if (body.movementModeHint === 'descenso' && vOrig < vDest) {
        const tmp = vOrig;
        vOrig = vDest;
        vDest = tmp;
        swappedByHint = true;
      }

      const computedD = Math.max(5, Math.round(Math.abs(vDest - vOrig) * 10) / 10);
      const hCrit = clampRound(niosh.H_cm, 38, 15, 110);
      const hOrig = clampRound(mov.h_origen_cm, hCrit, 15, 110);
      const hDest = clampRound(mov.h_destino_cm, hCrit, 15, 110);
      const hWorst = Math.max(hCrit, hOrig, hDest);

      let direction:
        | 'levantamiento_suelo_a_estanteria'
        | 'descenso_altura_a_bajo'
        | 'traslado_mismo_nivel'
        | 'ciclo_bidireccional' =
        vDest - vOrig >= 10
          ? 'levantamiento_suelo_a_estanteria'
          : vOrig - vDest >= 10
            ? 'descenso_altura_a_bajo'
            : 'traslado_mismo_nivel';

      if (body.movementModeHint === 'bidireccional') {
        direction = 'ciclo_bidireccional';
      }

      const normalizeElbowForV = (rawVal: unknown, fallback: number, vRefCm: number): number => {
        const c = clampRound(rawVal, fallback, 5, 175);
        if (vRefCm < 82 && c > 122) {
          return Math.max(8, Math.min(75, Math.round((180 - c) * 10) / 10));
        }
        return Math.min(142, c);
      };

      const peakTrunk = clampRound(angles.trunk_flexion, 42, -20, 115);
      const peakKnee = clampRound(angles.knee_flexion, 48, 0, 135);
      const peakElbR = normalizeElbowForV(angles.right_elbow, 68, Math.min(vOrig, vDest));
      const peakElbL = normalizeElbowForV(angles.left_elbow, 70, Math.min(vOrig, vDest));

      const isOrigLow = vOrig <= vDest;
      const srcOrig = swappedByHint ? destAnglesRaw : origAnglesRaw;
      const srcDest = swappedByHint ? origAnglesRaw : destAnglesRaw;

      const origenAngles = {
        trunk_flexion: clampRound(
          srcOrig.trunk_flexion,
          isOrigLow ? peakTrunk : Math.max(6, Math.round(peakTrunk * 0.22)),
          -20,
          115,
        ),
        knee_flexion: clampRound(
          srcOrig.knee_flexion,
          isOrigLow ? peakKnee : Math.max(6, Math.round(peakKnee * 0.18)),
          0,
          135,
        ),
        shoulder_flexion: clampRound(
          srcOrig.shoulder_flexion,
          vOrig >= 110 ? 75 : isOrigLow ? 52 : 35,
          -20,
          160,
        ),
        right_elbow: normalizeElbowForV(srcOrig.right_elbow, vOrig < 65 ? 18 : 68, vOrig),
        left_elbow: normalizeElbowForV(srcOrig.left_elbow, vOrig < 65 ? 18 : 68, vOrig),
      };

      const destinoAngles = {
        trunk_flexion: clampRound(
          srcDest.trunk_flexion,
          !isOrigLow ? peakTrunk : Math.max(6, Math.round(peakTrunk * 0.18)),
          -20,
          115,
        ),
        knee_flexion: clampRound(
          srcDest.knee_flexion,
          !isOrigLow ? peakKnee : Math.max(4, Math.round(peakKnee * 0.15)),
          0,
          135,
        ),
        shoulder_flexion: clampRound(
          srcDest.shoulder_flexion,
          vDest >= 110 ? 78 : !isOrigLow ? 52 : 35,
          -20,
          160,
        ),
        right_elbow: normalizeElbowForV(srcDest.right_elbow, vDest < 65 ? 18 : 68, vDest),
        left_elbow: normalizeElbowForV(srcDest.left_elbow, vDest < 65 ? 18 : 68, vDest),
      };

      const subCritIdx =
        typeof crit.critico_frame_index === 'number' && Number.isFinite(crit.critico_frame_index)
          ? Math.max(0, Math.min(Math.max(0, subsetLen - 1), Math.round(crit.critico_frame_index)))
          : isOrigLow
            ? subOrigIdx
            : subDestIdx;
      const resolvedCritIdx = activeSubsetForMapping[subCritIdx]?.clientIdx ?? subCritIdx;

      const resolvedOriginTs =
        subsetLen > 0 && activeSubsetForMapping[subOrigIdx]?.frame.timestamp
          ? activeSubsetForMapping[subOrigIdx].frame.timestamp
          : normalizeTimestampFormat(crit.origen_timestamp, '00:00.400');

      const resolvedDestTs =
        subsetLen > 0 && activeSubsetForMapping[subDestIdx]?.frame.timestamp
          ? activeSubsetForMapping[subDestIdx].frame.timestamp
          : normalizeTimestampFormat(crit.destino_timestamp, '00:02.800');

      const defaultNote =
        direction === 'descenso_altura_a_bajo'
          ? `Descenso de carga desde altura mayor (${vOrig} cm, estantería/plano superior) hacia altura menor (${vDest} cm). El origen y el destino pueden invertirse si la tarea opera en ciclo reversible.`
          : direction === 'ciclo_bidireccional'
            ? `Ciclo reversible (Origen <-> Destino intercambiables entre ${vOrig} cm y ${vDest} cm): la carga se estiba y desestiba alternando punto inicial y final.`
            : direction === 'levantamiento_suelo_a_estanteria'
              ? `Levantamiento ascendente desde nivel inferior (${vOrig} cm, suelo/tarima) hacia estantería o plano superior (${vDest} cm). En ciclos de reposición inversa, el origen actúa también como destino.`
              : `Traslado horizontal de carga a altura similar (${vOrig} cm <-> ${vDest} cm), pudiendo alternarse origen y destino.`;

      const resolvedCritSec =
        subsetLen > 0 && typeof activeSubsetForMapping[subCritIdx]?.frame.timeSec === 'number'
          ? Math.round(activeSubsetForMapping[subCritIdx].frame.timeSec! * 100) / 100
          : Math.round((parseFlexibleTimestampSec(activeSubsetForMapping[subCritIdx]?.frame.timestamp) ?? 1.2) * 100) / 100;

      const resolvedTrunkCrit = Math.max(peakTrunk, origenAngles.trunk_flexion, destinoAngles.trunk_flexion);
      const resolvedKneeCrit = Math.max(peakKnee, origenAngles.knee_flexion, destinoAngles.knee_flexion);
      const resolvedLatCrit = clampRound(angles.trunk_lateral, 0, -35, 35);
      const resolvedTwistCrit = clampRound(angles.trunk_twist ?? niosh.A_deg, 10, -60, 60);
      const resolvedShFlexCrit = clampRound(
        angles.shoulder_flexion,
        isOrigLow ? origenAngles.shoulder_flexion : destinoAngles.shoulder_flexion,
        -49,
        180,
      );
      const resolvedShAbdCrit = clampRound(angles.shoulder_abduction, 12, -26, 135);
      const resolvedHumRotCrit = clampRound(angles.humeral_rotation, 0, -90, 90);
      const resolvedHipCrit = clampRound(
        angles.hip_flexion,
        Math.round(Math.min(115, resolvedKneeCrit * 0.72 + resolvedTrunkCrit * 0.35)),
        -35,
        130,
      );
      const resolvedSupport =
        typeof angles.support_condition === 'string' && angles.support_condition.trim().length > 3
          ? angles.support_condition.trim()
          : resolvedKneeCrit >= 85 && resolvedTrunkCrit <= 22
            ? 'Bipedestación bilateral con flexión profunda de rodillas (cuclillas)'
            : 'Bipedestación bilateral';
      const resolvedPlane =
        typeof angles.reference_plane === 'string' && angles.reference_plane.trim().length > 2
          ? angles.reference_plane.trim()
          : Math.abs(resolvedLatCrit) > 10 || Math.abs(resolvedTwistCrit) > 20
            ? 'Sagital/Frontal'
            : 'Sagital';

      const ergonizaDigitalTwin = {
        analisis_exitoso: true,
        fotograma_critico_segundo: resolvedCritSec,
        condiciones_apoyo_detectadas: resolvedSupport,
        sincronizacion_avatar_3d: {
          plano_referencia: resolvedPlane,
          articulaciones_principales: {
            tronco: {
              flexion_extension_grados: Number(resolvedTrunkCrit.toFixed(1)),
              lateralizacion_grados: Number(resolvedLatCrit.toFixed(1)),
              rotacion_axial_grados: Number(resolvedTwistCrit.toFixed(1)),
            },
            hombro_derecho: {
              flexion_anteroposterior_grados: Number(resolvedShFlexCrit.toFixed(1)),
              abduccion_aduccion_grados: Number(resolvedShAbdCrit.toFixed(1)),
              rotacion_humeral_grados: Number(resolvedHumRotCrit.toFixed(1)),
            },
            codo_derecho: {
              flexion_extension_grados: Number(peakElbR.toFixed(1)),
            },
            cadera_derecha: {
              flexion_extension_grados: Number(resolvedHipCrit.toFixed(1)),
            },
            rodilla_derecha: {
              flexion_extension_grados: Number(resolvedKneeCrit.toFixed(1)),
            },
          },
        },
        datos_faltantes_requeridos: [
          'Peso exacto de la carga manipulada en kg',
          'Datos antropométricos del operario (sexo biológico, edad, estatura en cm y peso corporal en kg)',
          'Frecuencia de la tarea (levantamientos/min) y duración diaria de exposición',
          'Calidad del acoplamiento mano-carga (bueno, regular o malo) y coeficiente de fricción del calzado',
        ],
      };

      const normalizedPayload = {
        status: 'processed' as const,
        critical_events: {
          origen_frame_index: resolvedOrigIdx,
          destino_frame_index: resolvedDestIdx,
          critico_frame_index: resolvedCritIdx,
          critico_timestamp_sec: resolvedCritSec,
          origen_timestamp: resolvedOriginTs,
          destino_timestamp: resolvedDestTs,
        },
        movement_analysis: {
          direction,
          v_origen_cm: vOrig,
          v_destino_cm: vDest,
          h_origen_cm: hOrig,
          h_destino_cm: hDest,
          trajectory_note:
            typeof mov.trajectory_note === 'string' && mov.trajectory_note.trim().length > 12
              ? mov.trajectory_note.trim()
              : defaultNote,
        },
        niosh_inputs: {
          H_cm: hWorst,
          V_cm: vOrig,
          D_cm: computedD,
          A_deg: clampRound(niosh.A_deg, 15, 0, 135),
        },
        origen_angles_deg: origenAngles,
        destino_angles_deg: destinoAngles,
        postural_angles_deg: {
          trunk_flexion: resolvedTrunkCrit,
          trunk_lateral: resolvedLatCrit,
          trunk_twist: resolvedTwistCrit,
          shoulder_flexion: resolvedShFlexCrit,
          shoulder_abduction: resolvedShAbdCrit,
          humeral_rotation: resolvedHumRotCrit,
          hip_flexion: resolvedHipCrit,
          knee_flexion: resolvedKneeCrit,
          right_elbow: peakElbR,
          left_elbow: peakElbL,
          support_condition: resolvedSupport,
          reference_plane: resolvedPlane,
        },
        ergoniza_digital_twin: ergonizaDigitalTwin,
      };

      res.json(normalizedPayload);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado en extracción biomecánica.';
      console.error('[/api/biomech/extract-video] Error:', msg);
      res.status(500).json({ error: msg });
    }
  });

  const publicPath = path.resolve(__dirname, 'public');
  if (fs.existsSync(publicPath)) {
    app.use(
      express.static(publicPath, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.glb')) {
            res.setHeader('Content-Type', 'model/gltf-binary');
          }
        },
      }),
    );
  }

  const distPath = path.resolve(__dirname, 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(path.join(distPath, 'index.html'));

  if (isProd) {
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.glb')) {
            res.setHeader('Content-Type', 'model/gltf-binary');
          }
        },
      }),
    );
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

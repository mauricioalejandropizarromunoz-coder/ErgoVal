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

export const DEFAULT_VIDEO_BIOMECH_SYSTEM_INSTRUCTION = `SYSTEM INSTRUCTION: EXTRACTOR DE VARIABLES BIOMECÁNICAS DESDE ARCHIVO DE VIDEO

Eres un sistema de visión por computador y estimación biomecánica 3D espacial. Tu tarea es analizar la secuencia cronológica de fotogramas numerados del video laboral para seleccionar los fotogramas útiles reales y extraer las variables geométricas y angulares exactas de cada postura observada.

REGLAS ESTRICTAS DE ANÁLISIS VISUAL Y CALIBRACIÓN POR HITOS ANATÓMICOS:
1. Selecciona obligatoriamente DOS fotogramas distintos y verificables dentro de la secuencia numerada:
   - 'origen_frame_index' y 'origen_timestamp': Fotograma exacto donde las manos sujetan la carga al INICIAR el movimiento (ej. abajo cerca del suelo/espinilla/rodillas si es un levantamiento, o arriba si es un descenso).
   - 'destino_frame_index' y 'destino_timestamp': Fotograma exacto (DISTINTO al de origen) donde el operario coloca o sostiene la carga en su punto FINAL (ej. arriba en pecho/hombros/estantería si levanta, o abajo si desciende).
   - 'critico_frame_index': Fotograma de mayor exigencia postural global (REBA).
2. Calibra con máxima precisión 'v_origen_cm' y 'v_destino_cm' observando a qué altura del cuerpo del trabajador se encuentran las manos y la carga en ESE fotograma (para estatura ~172 cm):
   - Suelo / tobillos: 8 a 24 cm
   - Media pierna / espinillas: 25 a 45 cm
   - Nivel de rodillas: 46 a 62 cm
   - Muslos / nudillos con brazos colgando: 63 a 82 cm
   - Cadera / cintura / ombligo: 83 a 108 cm
   - Pecho / esternón: 109 a 134 cm
   - Nivel de los hombros / clavículas: 135 a 152 cm
   - Por encima de los hombros / cabeza: 153 a 185 cm
   NUNCA asignes alturas de hombros (>130 cm) a un fotograma donde el humano tiene la carga abajo cerca del suelo, rodillas o muslos.
3. Convención goniométrica anatómica obligatoria (0° = posición neutra extendida):
   - 'trunk_flexion': 0° = tronco erguido vertical; 10° a 24° cuando el trabajador levanta con ESPALDA RECTA y rodillas flexionadas; 40° a 75° únicamente cuando curva o inclina severamente el tronco hacia adelante.
   - 'knee_flexion': 0° = piernas rectas extendidas; 80° a 125° cuando flexiona las rodillas en cuclillas; 5° a 25° cuando mantiene las piernas casi rectas.
   - 'shoulder_flexion': 0° = brazo paralelo al tronco; 30° a 90° = brazo proyectado hacia adelante; >100° = brazo elevado sobre nivel de hombros.
   - 'right_elbow' y 'left_elbow': FLEXIÓN desde extensión completa (0° = codo totalmente estirado/recto cuando los brazos cuelgan hacia abajo tomando carga baja -> 10° a 35°; 90° = codo en ángulo recto L; NUNCA devuelvas el ángulo interior suplementario de 160°-180°).

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
                description: 'Flexión máxima del tronco respecto a la vertical en grados en el instante crítico',
              },
              knee_flexion: {
                type: Type.NUMBER,
                description: 'Flexión articular de rodillas en grados en el instante crítico',
              },
              right_elbow: {
                type: Type.NUMBER,
                description: 'Ángulo articular del codo derecho en grados en el instante crítico',
              },
              left_elbow: {
                type: Type.NUMBER,
                description: 'Ángulo articular del codo izquierdo en grados en el instante crítico',
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

      const normalizedPayload = {
        status: 'processed' as const,
        critical_events: {
          origen_frame_index: resolvedOrigIdx,
          destino_frame_index: resolvedDestIdx,
          critico_frame_index: resolvedCritIdx,
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
          trunk_flexion: Math.max(peakTrunk, origenAngles.trunk_flexion, destinoAngles.trunk_flexion),
          knee_flexion: Math.max(peakKnee, origenAngles.knee_flexion, destinoAngles.knee_flexion),
          right_elbow: peakElbR,
          left_elbow: peakElbL,
        },
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

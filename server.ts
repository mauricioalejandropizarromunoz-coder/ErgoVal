import 'dotenv/config';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import express, { type Request, type Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_VIDEO_BIOMECH_SYSTEM_INSTRUCTION = `SYSTEM INSTRUCTION: EXTRACTOR DE VARIABLES BIOMECÁNICAS DESDE ARCHIVO DE VIDEO

Eres un sistema de visión por computador y estimación biomecánica 3D espacial. Tu tarea es analizar el video adjunto correspondiente a una tarea laboral de manipulación manual de cargas (levantamiento hacia estantería/mesa, descenso de carga desde altura mayor hacia altura menor, o traslado reversible) para extraer las variables geométricas y angulares necesarias como inputs para un software ergonómico externo.

REGLAS DE ANÁLISIS DE VIDEO:
1. No calcules multiplicadores, no apliques fórmulas normativas ni generes reportes de riesgo ergonómico. Tu objetivo es únicamente la extracción biomecánica y cinemática de datos desde el canal de video.
2. Analiza la secuencia temporal e identifica los timestamps exactos de los momentos críticos y el sentido real del desplazamiento vertical:
   - 'origen_timestamp': Momento exacto en que las manos sujetan la carga e inician la maniobra (puede ubicarse en el suelo/tarima si se levanta hacia una estantería, o en una estantería/plano alto si se baja la carga hacia una altura menor).
   - 'destino_timestamp': Momento exacto en que la carga llega a su punto final de deposición o colocación.
   - Ten en cuenta que en ciclos operativos reversibles (estiba y desestiba), el punto de origen puede actuar también como destino de la carga (y viceversa), por lo que debes reportar tanto 'v_origen_cm' como 'v_destino_cm' además de 'H_cm', 'V_cm' y 'D_cm'.
3. Estima las posiciones tridimensionales del esqueleto del operario (tomando como referencias la base de soporte en tobillos, el centro de masa de las muñecas, la zona lumbar L5/S1 y la columna C7) para calcular:
   - H (Distancia horizontal máxima o crítica en cm desde la proyección de la base de soporte en tobillos al agarre, además de h_origen_cm y h_destino_cm).
   - V (Distancia vertical en cm desde el suelo al agarre en el origen V_cm = v_origen_cm, y altura final en destino v_destino_cm).
   - D (Desplazamiento vertical total en cm |v_destino_cm - v_origen_cm|).
   - A (Ángulo de asimetría del torso/carga en grados).
   - Clasificación cinemática del movimiento ('levantamiento_suelo_a_estanteria' si v_destino_cm > v_origen_cm, 'descenso_altura_a_bajo' si v_origen_cm > v_destino_cm, o 'traslado_mismo_nivel').
   - Flexión articular de tronco, rodillas y codos en grados para el instante de mayor exigencia postural.

FORMATO DE SALIDA (ESTRICTAMENTE JSON):
Responde ÚNICAMENTE con el siguiente objeto JSON sin ningún texto adicional fuera del bloque:

{
  "status": "processed",
  "critical_events": {
    "origen_timestamp": "00:00.000",
    "destino_timestamp": "00:00.000"
  },
  "movement_analysis": {
    "direction": "levantamiento_suelo_a_estanteria",
    "v_origen_cm": 0.0,
    "v_destino_cm": 0.0,
    "h_origen_cm": 0.0,
    "h_destino_cm": 0.0,
    "trajectory_note": "Descripción concisa indicando si levanta desde nivel bajo a estantería o si baja desde altura mayor a menor, aclarando intercambiabilidad origen-destino."
  },
  "niosh_inputs": {
    "H_cm": 0.0,
    "V_cm": 0.0,
    "D_cm": 0.0,
    "A_deg": 0.0
  },
  "postural_angles_deg": {
    "trunk_flexion": 0.0,
    "knee_flexion": 0.0,
    "right_elbow": 0.0,
    "left_elbow": 0.0
  }
}`;

interface SampledVideoFramePayload {
  timestamp: string;
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

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'No se encontró una clave activa en GEMINI_API_KEY. Verifique el panel Settings > Secrets.',
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function clampRound(val: unknown, fallback: number, min: number, max: number): number {
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num)) return fallback;
  const clamped = Math.max(min, Math.min(max, num));
  return Math.round(clamped * 10) / 10;
}

function normalizeTimestampFormat(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (/^\d{2}:\d{2}\.\d{3}$/.test(trimmed)) return trimmed;
  const secMatch = trimmed.match(/^(\d+):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (secMatch) {
    const mm = secMatch[1].padStart(2, '0');
    const ss = secMatch[2].padStart(2, '0');
    const ms = (secMatch[3] || '000').padEnd(3, '0').slice(0, 3);
    return `${mm}:${ss}.${ms}`;
  }
  const floatSec = Number(trimmed);
  if (Number.isFinite(floatSec) && floatSec >= 0) {
    const mins = Math.floor(floatSec / 60);
    const rem = floatSec - mins * 60;
    const secs = Math.floor(rem);
    const ms = Math.round((rem - secs) * 1000);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
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
    '23',
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
    // Fallback without audio stream if source audio codec is absent or non-standard
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

      const ai = getGenAIClient();
      const parts: Array<
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      > = [];

      if (hasInlineVideo && body.videoInline) {
        parts.push({
          inlineData: {
            mimeType: body.videoInline.mimeType,
            data: body.videoInline.dataBase64,
          },
        });
      }

      for (const frame of frames.slice(0, 28)) {
        if (!frame.dataBase64 || !frame.mimeType) continue;
        parts.push({
          text: `Fotograma temporal exacto: ${frame.timestamp}`,
        });
        parts.push({
          inlineData: {
            mimeType: frame.mimeType,
            data: frame.dataBase64,
          },
        });
      }

      const statureCm = clampRound(body.workerHeightCm, 172, 140, 210);
      const durInfo =
        typeof body.videoDurationSec === 'number' && Number.isFinite(body.videoDurationSec)
          ? `Duración total del video: ${body.videoDurationSec.toFixed(3)} segundos. `
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

      parts.push({
        text: `${durInfo}Referencia antropométrica para conversión métrica espacial a centímetros: estatura del operario = ${statureCm} cm. ${hintText} Analiza la secuencia cronológica y devuelve estrictamente el objeto JSON solicitado con timestamps MM:SS.mmm, alturas en origen y destino, e interpretación del sentido de manipulación.`,
      });

      const systemInstruction =
        typeof body.customSystemInstruction === 'string' && body.customSystemInstruction.trim().length > 20
          ? body.customSystemInstruction.trim()
          : DEFAULT_VIDEO_BIOMECH_SYSTEM_INSTRUCTION;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: { parts },
        config: {
          systemInstruction,
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              status: {
                type: Type.STRING,
                description: 'Must be "processed"',
              },
              critical_events: {
                type: Type.OBJECT,
                properties: {
                  origen_timestamp: {
                    type: Type.STRING,
                    description: 'Timestamp exacto MM:SS.mmm donde las manos sujetan la carga e inician el traslado (en suelo o en estantería alta según sentido)',
                  },
                  destino_timestamp: {
                    type: Type.STRING,
                    description: 'Timestamp exacto MM:SS.mmm de deposición o colocación final de la carga',
                  },
                },
                required: ['origen_timestamp', 'destino_timestamp'],
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
                    description: 'Altura vertical en cm desde el suelo al agarre en el instante de origen',
                  },
                  v_destino_cm: {
                    type: Type.NUMBER,
                    description: 'Altura vertical en cm desde el suelo al agarre en el instante de destino',
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
                      'Explicación técnica indicando si levanta desde nivel bajo a estantería o baja de altura mayor a menor, aclarando que origen y destino pueden invertirse en ciclos reversibles',
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
              postural_angles_deg: {
                type: Type.OBJECT,
                properties: {
                  trunk_flexion: {
                    type: Type.NUMBER,
                    description: 'Flexión máxima del tronco respecto a la vertical en grados',
                  },
                  knee_flexion: {
                    type: Type.NUMBER,
                    description: 'Flexión articular de rodillas en grados',
                  },
                  right_elbow: {
                    type: Type.NUMBER,
                    description: 'Ángulo articular del codo derecho en grados',
                  },
                  left_elbow: {
                    type: Type.NUMBER,
                    description: 'Ángulo articular del codo izquierdo en grados',
                  },
                },
                required: ['trunk_flexion', 'knee_flexion', 'right_elbow', 'left_elbow'],
              },
            },
            required: ['status', 'critical_events', 'movement_analysis', 'niosh_inputs', 'postural_angles_deg'],
          },
        },
      });

      const rawText = (response.text || '').trim();
      if (!rawText) {
        res.status(502).json({
          error: 'El motor de visión no devolvió datos estructurados para este video.',
        });
        return;
      }

      const parsed = JSON.parse(rawText) as Record<string, unknown>;
      const crit = (parsed.critical_events || {}) as Record<string, unknown>;
      const mov = (parsed.movement_analysis || {}) as Record<string, unknown>;
      const niosh = (parsed.niosh_inputs || {}) as Record<string, unknown>;
      const angles = (parsed.postural_angles_deg || {}) as Record<string, unknown>;

      const fallbackOrigin = frames[Math.min(2, Math.max(0, frames.length - 1))]?.timestamp || '00:00.500';
      const fallbackDest = frames[Math.max(0, frames.length - 2)]?.timestamp || '00:02.500';

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

      if (body.movementModeHint === 'levantamiento' && vDest < vOrig) {
        const tmp = vOrig;
        vOrig = vDest;
        vDest = tmp;
      } else if (body.movementModeHint === 'descenso' && vOrig < vDest) {
        const tmp = vOrig;
        vOrig = vDest;
        vDest = tmp;
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

      const defaultNote =
        direction === 'descenso_altura_a_bajo'
          ? `Descenso de carga desde altura mayor (${vOrig} cm, ej. estantería) hacia altura menor (${vDest} cm). El origen y el destino pueden invertirse si la tarea opera en ciclo reversible.`
          : direction === 'ciclo_bidireccional'
            ? `Ciclo reversible (Origen ↔ Destino intercambiables entre ${vOrig} cm y ${vDest} cm): la carga se estiba y desestiba alternando punto inicial y final.`
            : direction === 'levantamiento_suelo_a_estanteria'
              ? `Levantamiento ascendente desde nivel inferior (${vOrig} cm, ej. suelo/tarima) hacia estantería o plano superior (${vDest} cm). En ciclos de reposición inversa, el origen actúa también como destino.`
              : `Traslado horizontal de carga a altura similar (${vOrig} cm ↔ ${vDest} cm), pudiendo alternarse origen y destino.`;

      const normalizedPayload = {
        status: 'processed' as const,
        critical_events: {
          origen_timestamp: normalizeTimestampFormat(crit.origen_timestamp, fallbackOrigin),
          destino_timestamp: normalizeTimestampFormat(crit.destino_timestamp, fallbackDest),
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
        postural_angles_deg: {
          trunk_flexion: clampRound(angles.trunk_flexion, 42, -20, 115),
          knee_flexion: clampRound(angles.knee_flexion, 48, 0, 135),
          right_elbow: clampRound(angles.right_elbow, 82, 5, 160),
          left_elbow: clampRound(angles.left_elbow, 84, 5, 160),
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

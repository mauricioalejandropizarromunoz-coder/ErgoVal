export const config = {
  maxDuration: 60,
};

const MODEL = 'gemini-1.5-flash';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ error: 'JSON inválido' }); }
  }

  const {
    frames = [],
    workerHeightCm = 172,
    videoDurationSec = 10,
    movementModeHint = 'auto',
  } = body || {};

  if (!frames.length) return res.status(400).json({ error: 'Sin fotogramas' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Falta GEMINI_API_KEY en Vercel' });

  // Tomar solo 4 fotogramas clave (inicio, medio, final) para máxima velocidad
  const count = frames.length;
  const indices = [0, Math.floor(count * 0.33), Math.floor(count * 0.66), count - 1];
  const selectedFrames = [...new Set(indices)].map((i) => frames[i]).filter(Boolean);

  const parts = selectedFrames.map((f) => ({
    inline_data: {
      mime_type: f.mimeType || 'image/jpeg',
      data: f.dataBase64,
    },
  }));

  parts.push({
    text: `Analiza esta maniobra ergonómica (Estatura: ${workerHeightCm}cm, Duración: ${videoDurationSec}s).
Devuelve estrictamente este JSON:
{
  "status": "processed",
  "critical_events": {
    "origen_timestamp": "${selectedFrames[0]?.timestamp || '00:00.500'}",
    "destino_timestamp": "${selectedFrames[selectedFrames.length - 1]?.timestamp || '00:03.000'}"
  },
  "movement_analysis": {
    "direction": "levantamiento_suelo_a_estanteria",
    "v_origen_cm": 30.0,
    "v_destino_cm": 110.0,
    "h_origen_cm": 35.0,
    "h_destino_cm": 40.0,
    "trajectory_note": "Movimiento vertical de carga"
  },
  "niosh_inputs": {
    "H_cm": 35.0,
    "V_cm": 30.0,
    "D_cm": 80.0,
    "A_deg": 10.0
  },
  "postural_angles_deg": {
    "trunk_flexion": 40.0,
    "knee_flexion": 35.0,
    "right_elbow": 75.0,
    "left_elbow": 75.0
  }
}`,
  });

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({
        error: `Error Gemini: ${data?.error?.message || JSON.stringify(data)}`,
      });
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return res.status(500).json({ error: 'Sin respuesta de IA' });
    }

    const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return res.status(200).json(JSON.parse(clean));
  } catch (err) {
    return res.status(500).json({ error: `Fallo: ${err.message}` });
  }
}

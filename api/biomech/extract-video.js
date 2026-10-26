const MODEL = 'gemini-2.0-flash';

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
    customSystemInstruction = '',
  } = body || {};

  if (!frames.length) return res.status(400).json({ error: 'Sin fotogramas' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Falta GEMINI_API_KEY en Vercel' });

  // Reducir fotogramas a máximo 8 para evitar superar el límite de tamaño en Vercel/Gemini
  const step = Math.max(1, Math.floor(frames.length / 8));
  const selectedFrames = frames.filter((_, idx) => idx % step === 0).slice(0, 8);

  const parts = selectedFrames.map((f) => ({
    inline_data: {
      mime_type: f.mimeType || 'image/jpeg',
      data: f.dataBase64,
    },
  }));

  parts.push({
    text: `Analiza la tarea ergonómica en estos fotogramas.
Estatura operario: ${workerHeightCm} cm. Duración video: ${videoDurationSec} s. Sentido: ${movementModeHint}.
Devuelve obligatoriamente un JSON válido con esta estructura exacta:
{
  "status": "processed",
  "critical_events": {
    "origen_timestamp": "00:01.000",
    "destino_timestamp": "00:03.000"
  },
  "movement_analysis": {
    "direction": "levantamiento_suelo_a_estanteria",
    "v_origen_cm": 35.0,
    "v_destino_cm": 115.0,
    "h_origen_cm": 30.0,
    "h_destino_cm": 40.0,
    "trajectory_note": "Levantamiento desde cota baja hacia plano medio-alto"
  },
  "niosh_inputs": {
    "H_cm": 35.0,
    "V_cm": 35.0,
    "D_cm": 80.0,
    "A_deg": 15.0
  },
  "postural_angles_deg": {
    "trunk_flexion": 45.0,
    "knee_flexion": 40.0,
    "right_elbow": 80.0,
    "left_elbow": 80.0
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
            responseMimeType: 'application/json', // Fuerza salida JSON estricta
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
      return res.status(500).json({ error: 'Gemini devolvió respuesta vacía', raw: data });
    }

    // Limpieza segura del JSON
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({
      error: `Fallo procesando JSON: ${err.message}`,
    });
  }
}

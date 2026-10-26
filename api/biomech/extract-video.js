const MODEL = 'gemini-2.0-flash';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  let body = req.body;
  if (typeof body === 'string') body = JSON.parse(body);

  const { frames = [], workerHeightCm = 172, videoDurationSec = 10, movementModeHint = 'auto', customSystemInstruction = '' } = body;
  if (!frames.length) return res.status(400).json({ error: 'Sin fotogramas' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Falta GEMINI_API_KEY en Vercel' });

  const sysPrompt = customSystemInstruction || 'Extrae variables biomecanicas de fotogramas laborales. Responde SOLO con JSON.';

  try {
    const parts = frames.map(f => ({
      inlineData: { mimeType: f.mimeType || 'image/jpeg', data: f.dataBase64 }
    }));
    parts.push({ text: `Estatura: ${workerHeightCm}cm, Duracion: ${videoDurationSec}s, Modo: ${movementModeHint}. Responde SOLO con JSON.` });

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sysPrompt }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
      })
    });

    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    const match = text.match(/\{[\s\S]*\}/);
    return res.status(200).json(JSON.parse(match[0]));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

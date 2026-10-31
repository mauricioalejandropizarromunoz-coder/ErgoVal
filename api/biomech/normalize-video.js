export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-File-Name');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  // En entornos Vercel Serverless (sin binarios ffmpeg nativos del sistema),
  // notificamos que la decodificación se ejecuta directamente en el cliente mediante el decodificador HTML5/WASM del navegador.
  return res.status(200).json({
    status: 'client_fallback',
    clientDecodeRequired: true,
    mp4Base64: null,
    message: 'Decodificación directa en navegador activa para entornos serverless.',
  });
}

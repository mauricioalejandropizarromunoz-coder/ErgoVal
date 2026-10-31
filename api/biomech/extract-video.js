import { GoogleGenAI, ThinkingLevel } from '@google/genai';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const {
    postural_angles_deg = null,
    niosh_inputs = null,
    movement_analysis = null,
    critical_events = null,
    frames = null,
  } = body || {};

  const trunkFlex = Number(postural_angles_deg?.trunk_flexion ?? 18);
  const kneeFlex = Number(postural_angles_deg?.knee_flexion ?? 12);
  const rightElbow = Number(postural_angles_deg?.right_elbow ?? 65);
  const leftElbow = Number(postural_angles_deg?.left_elbow ?? 62);

  const ergonizaFallback = {
    analisis_exitoso: true,
    fotograma_critico_segundo: 1.2,
    condiciones_apoyo_detectadas: 'Bipedestación bilateral',
    sincronizacion_avatar_3d: {
      plano_referencia: 'Sagital',
      articulaciones_principales: {
        tronco: {
          flexion_extension_grados: trunkFlex,
          lateralizacion_grados: 0.0,
          rotacion_axial_grados: Number(niosh_inputs?.A_deg ?? 8),
        },
        hombro_derecho: {
          flexion_anteroposterior_grados: Number(postural_angles_deg?.right_shoulder ?? 38.0),
          abduccion_aduccion_grados: 10.0,
          rotacion_humeral_grados: 0.0,
        },
        codo_derecho: {
          flexion_extension_grados: rightElbow,
        },
        cadera_derecha: {
          flexion_extension_grados: Math.round(kneeFlex * 0.72 * 10) / 10,
        },
        rodilla_derecha: {
          flexion_extension_grados: kneeFlex,
        },
      },
    },
    datos_faltantes_requeridos: [
      'Peso exacto de la carga manipulada en kg',
      'Datos antropométricos del operario (sexo, edad, estatura, masa corporal y complexión)',
      'Frecuencia de levantamiento (acciones/min) y duración de exposición diaria',
      'Calidad del acoplamiento mano-objeto (bueno, regular o malo)',
    ],
  };

  const dynamicFallbackResult = {
    status: 'processed',
    isServerFallback: true,
    critical_events: critical_events || {
      origen_frame_index: 0,
      destino_frame_index: Math.max(1, Array.isArray(frames) ? frames.length - 1 : 1),
      critico_frame_index: 0,
      origen_timestamp: '00:00.400',
      destino_timestamp: '00:02.400',
    },
    movement_analysis: movement_analysis || {
      direction: 'levantamiento_suelo_a_estanteria',
      v_origen_cm: 72.0,
      v_destino_cm: 108.0,
      h_origen_cm: 36.0,
      h_destino_cm: 40.0,
      trajectory_note: 'Procesamiento biomecánico cinemático local en navegador.',
    },
    niosh_inputs: niosh_inputs || { H_cm: 36.0, V_cm: 72.0, D_cm: 36.0, A_deg: 8.0 },
    postural_angles_deg: {
      trunk_flexion: trunkFlex,
      knee_flexion: kneeFlex,
      right_elbow: rightElbow,
      left_elbow: leftElbow,
    },
    ergoniza_digital_twin: ergonizaFallback,
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || (!postural_angles_deg && (!Array.isArray(frames) || frames.length === 0))) {
    return res.status(200).json(dynamicFallbackResult);
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        timeout: 12000,
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Valida y calibra biomecánicamente estos datos extraídos de vídeo laboral (Tronco=${trunkFlex}°, Rodilla=${kneeFlex}°, CodoDer=${rightElbow}°, CodoIzq=${leftElbow}°, H=${niosh_inputs?.H_cm || 36}cm, V=${niosh_inputs?.V_cm || 72}cm, A=${niosh_inputs?.A_deg || 8}°) y devuelve JSON compatible con Ergoniza Intelligent respetando los ángulos medidos.`,
      config: {
        temperature: 0.1,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
      },
    });

    const rawText = (response.text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
    if (rawText) {
      const parsed = JSON.parse(rawText);
      return res.status(200).json({
        ...dynamicFallbackResult,
        ...parsed,
        isServerFallback: false,
        ergoniza_digital_twin: parsed.ergoniza_digital_twin || ergonizaFallback,
      });
    }
  } catch {
    // Fallback determinista inmediato
  }

  return res.status(200).json(dynamicFallbackResult);
}

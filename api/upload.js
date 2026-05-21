const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

async function callAnthropic(extractedText) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  const maxSnippet = extractedText.slice(0, 30000);
  const systemPrompt = `
Eres un extractor de información de comparendos/multas de tránsito en Colombia.
Tu tarea es convertir texto OCR/PDF en datos estructurados.
Responde SOLO JSON válido (sin markdown, sin explicación).

Reglas:
- Si un campo no aparece, usa null.
- Monedas en COP como entero sin símbolos (ej: 572600).
- Conserva fechas y horas tal como aparezcan.
- No inventes datos.
- Incluye validación de totales.

Esquema exacto de salida:
{
  "documento": {
    "tipo_documento": "estado_cuenta|comparendo|otro",
    "fecha_expedicion": "string|null",
    "cedula": "string|null"
  },
  "multas": [
    {
      "numero_multa": "string|null",
      "fecha": "string|null",
      "hora": "string|null",
      "ciudad_o_secretaria": "string|null",
      "codigo_infraccion": "string|null",
      "estado": "string|null",
      "valor_cop": 0
    }
  ],
  "totales": {
    "cantidad_multas": 0,
    "total_reportado_cop": 0,
    "suma_items_cop": 0,
    "coincide_total": true
  },
  "resumen_ejecutivo": "string",
  "alertas": ["string"]
}
`;

  const body = {
    model,
    max_tokens: 800,
    temperature: 0.1,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Aquí está el texto extraído del PDF de la multa:\n\n${maxSnippet}`
      }
    ]
  };

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Anthropic error: ${resp.status} ${txt}`);
  }

  const j = await resp.json();
  const raw = j?.content?.[0]?.text || null;
  if (!raw) return null;

  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.stringify(JSON.parse(cleaned), null, 2);
  } catch {
    return cleaned;
  }
}

async function callHuggingFace(extractedText) {
  const token = process.env.HUGGINGFACE_HUB_TOKEN;
  if (!token) return null;
  const model = process.env.HUGGINGFACE_MODEL || 'gpt2';
  const url = `https://api-inference.huggingface.co/models/${model}`;
  const maxSnippet = extractedText.slice(0, 30000);
  const payload = {
    inputs: `Resume y analiza esta multa de tránsito (3-5 líneas resumen, infracciones detectadas, pasos recomendados):\n\n${maxSnippet}`,
    parameters: { max_new_tokens: 500, temperature: 0.2 }
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Hugging Face Inference error: ${resp.status} ${txt}`);
  }

  const j = await resp.json();
  // HF can return an array of generated outputs or an object
  if (Array.isArray(j) && j.length > 0) {
    if (typeof j[0] === 'string') return j[0];
    if (j[0].generated_text) return j[0].generated_text;
  }
  if (j.generated_text) return j.generated_text;
  if (j.error) throw new Error(j.error);
  return JSON.stringify(j);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { filename, data } = req.body;
    if (!filename || !data) return res.status(400).json({ error: 'Missing filename or data' });

    const buffer = Buffer.from(data, 'base64');
    const tmpDir = '/tmp';
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const filePath = path.join(tmpDir, `${Date.now()}-${filename}`);
    fs.writeFileSync(filePath, buffer);

    // Extract text from PDF
    let extractedText = '';
    try {
      const parsed = await pdf(buffer);
      extractedText = parsed.text || '';
    } catch (e) {
      extractedText = '';
    }

    // If Anthropic key present, call model
    let modelResponse = null;
    try {
      modelResponse = await callAnthropic(extractedText);
    } catch (err) {
      modelResponse = `Model call failed: ${err.message}`;
    }

    return res.status(200).json({ ok: true, path: filePath, extractedText: extractedText.slice(0, 20000), modelResponse });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

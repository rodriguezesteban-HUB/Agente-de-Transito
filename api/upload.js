const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

async function callAnthropic(extractedText) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest';
  const maxSnippet = extractedText.slice(0, 30000);
  const systemPrompt = `Eres un asistente formal que resume y analiza multas de tránsito. Devuelve: 1) Resumen ejecutivo (3-5 líneas). 2) Posibles infracciones detectadas. 3) Siguientes pasos recomendados (legales y prácticos). Sé claro y directo.`;

  const body = {
    model,
    max_tokens: 800,
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
  return j?.content?.[0]?.text || null;
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

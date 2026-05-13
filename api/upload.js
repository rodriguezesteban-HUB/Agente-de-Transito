const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

async function callOpenAI(extractedText) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const maxSnippet = extractedText.slice(0, 30000); // safety cap
  const systemPrompt = `Eres un asistente formal que resume y analiza multas de tránsito. Devuelve: 1) Resumen ejecutivo (3-5 líneas). 2) Posibles infracciones detectadas. 3) Siguientes pasos recomendados (legales y prácticos). Sé claro y directo.`;

  const body = {
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Aquí está el texto extraído del PDF de la multa:\n\n${maxSnippet}` }
    ],
    temperature: 0.2,
    max_tokens: 800
  };

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`OpenAI error: ${resp.status} ${txt}`);
  }

  const j = await resp.json();
  return j?.choices?.[0]?.message?.content || null;
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

    // If OpenAI key present, call model
    let modelResponse = null;
    try {
      modelResponse = await callOpenAI(extractedText);
    } catch (err) {
      modelResponse = `Model call failed: ${err.message}`;
    }

    return res.status(200).json({ ok: true, path: filePath, extractedText: extractedText.slice(0, 20000), modelResponse });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

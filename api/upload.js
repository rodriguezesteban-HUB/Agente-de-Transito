const fs = require('fs');
const path = require('path');

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

    return res.status(200).json({ ok: true, path: filePath });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

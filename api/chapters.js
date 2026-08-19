const { chapters } = require('./_meio');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=180');
  try {
    const { slug, page } = req.query;
    if (!slug) return res.status(400).json({ error: 'Slug required' });
    res.json(await chapters(slug, parseInt(page)||1));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const { detail } = require('./_meio');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300');
  try {
    const { slug } = req.query;
    if (!slug) return res.status(400).json({ error: 'Slug required' });
    res.json(await detail(slug));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

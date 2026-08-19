const { chapter } = require('./_meio');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600');
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL required' });
    res.json(await chapter(url));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

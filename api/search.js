const { search } = require('./_meio');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60');
  try {
    const q = req.query.q || '';
    if (!q) return res.status(400).json({ error: 'Query required' });
    res.json(await search(q));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

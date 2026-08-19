const { hover } = require('./_meio');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300');
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'ID required' });
    res.json(await hover(id));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

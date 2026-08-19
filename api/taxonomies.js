const { taxonomies } = require('./_meio');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');
  try { res.json(await taxonomies()); }
  catch (e) { res.status(500).json({ error: e.message }); }
};

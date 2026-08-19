const { getGenres } = require('./_fuyu');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');
  try { res.json(await getGenres()); }
  catch (e) { res.status(500).json({ error: e.message }); }
};

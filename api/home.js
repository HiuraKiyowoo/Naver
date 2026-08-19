const { home } = require('./_meio');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=120');
  try { res.json(await home()); }
  catch (e) { res.status(500).json({ error: e.message }); }
};

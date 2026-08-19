const { getTags } = require('./_fuyu');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');
  try {
    const page = parseInt(req.query.page) || 1;
    res.json(await getTags(page, 100));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const { archive } = require('./_meio');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=180');
  try {
    const { page, orderby, kind, slug } = req.query;
    res.json(await archive({ page: parseInt(page)||1, orderby, kind, slug }));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

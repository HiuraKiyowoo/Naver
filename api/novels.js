const { listNovels } = require('./_fuyu');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300');
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 20;
    res.json(await listNovels(page, perPage));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

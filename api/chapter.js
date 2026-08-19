const { chapter, chapters } = require('./_meio');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const { url, slug, page } = req.query;
    if (url) {
      res.setHeader('Cache-Control', 's-maxage=600');
      return res.json(await chapter(url));
    }
    if (slug) {
      res.setHeader('Cache-Control', 's-maxage=180');
      return res.json(await chapters(slug, parseInt(page) || 1));
    }
    return res.status(400).json({ error: 'url or slug required' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

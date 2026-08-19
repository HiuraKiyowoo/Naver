const { readingNav } = require('./_meio');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const { manga, chapter, volume } = req.query;
    if (!manga || !chapter) return res.status(400).json({ error: 'manga and chapter required' });
    res.json(await readingNav(manga, chapter, parseInt(volume)||0));
  } catch (e) { res.status(500).json({ error: e.message }); }
};

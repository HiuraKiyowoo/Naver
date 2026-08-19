// ============================================================
// API CLIENT — semua request ke Vercel Functions
// ============================================================
const B = '/api';

async function get(ep, params = {}) {
  const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v != null && v !== ''))).toString();
  const res = await fetch(`${B}${ep}${q ? `?${q}` : ''}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const getHome       = ()                      => get('/home');
export const getArchive    = (opts = {})             => get('/archive', opts);
export const search        = (q)                     => get('/search', { q });
export const getTaxonomies = ()                      => get('/taxonomies');
export const getDetail     = (slug)                  => get('/detail', { slug });
export const getChapters   = (slug, page = 1)        => get('/chapter', { slug, page });
export const getChapter    = (url)                   => get('/chapter', { url });
export const getHover      = (id)                    => get('/hover', { id });
export const getReadingNav = (manga, chapter, volume)=> get('/reading-nav', { manga, chapter, volume });

// ============================================================
// FUYU NOVEL SCRAPER — shared helper untuk semua Vercel Functions
// ============================================================
const axios   = require('axios');
const cheerio = require('cheerio');

const BASE = 'https://fuyu-novel.my.id';
const WP   = `${BASE}/wp-json/wp/v2`;
const AJAX = `${BASE}/wp-admin/admin-ajax.php`;

const http = axios.create({
  timeout: 15000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NaverNovel/1.0)' }
});

// ── Helpers ───────────────────────────────────────────────────
function cleanText(v) {
  return String(v ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

function cleanImg(src) {
  if (!src) return null;
  const proxy = src.match(/^https?:\/\/i\d?\.wp\.com\/(.+)$/i);
  if (proxy) return `https://${proxy[1].split('?')[0]}`;
  try { const u = new URL(src); u.search = ''; return u.toString().replace('http://', 'https://'); } catch { return src; }
}

function stripHtml(html) {
  if (!html) return null;
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
}

function extractCover(contentHtml) {
  if (!contentHtml) return null;
  const $ = cheerio.load(contentHtml);
  const src = $('img').first().attr('src');
  return cleanImg(src);
}

// ── API Functions ─────────────────────────────────────────────

async function search(query) {
  const { data } = await http.post(AJAX,
    new URLSearchParams({ action: 'ts_ac_do_search', ts_ac_query: query }).toString(),
    { headers: { 'content-type': 'application/x-www-form-urlencoded' } }
  );
  const groups = Array.isArray(data?.series) ? data.series : [];
  return groups.flatMap(g => g?.all || []).map(n => ({
    id:     parseInt(n.ID) || null,
    title:  cleanText(n.post_title),
    cover:  cleanImg(n.post_image),
    genres: cleanText(n.post_genres),
    type:   cleanText(n.post_type),
    status: cleanText(n.post_status),
    url:    n.post_link || null,
  })).filter(i => i.title);
}

async function getLatest(page = 1, perPage = 20) {
  const { data: posts } = await http.get(`${WP}/posts`, {
    params: { per_page: perPage, page, orderby: 'modified', order: 'desc', _fields: 'id,title,link,date,modified,categories,content' }
  });
  const rows = Array.isArray(posts) ? posts : [];
  const catIds = [...new Set(rows.flatMap(p => p.categories || []))];
  let catMap = {};
  if (catIds.length) {
    const { data: cats } = await http.get(`${WP}/categories`, { params: { include: catIds.join(','), per_page: 100 } });
    catMap = Object.fromEntries((cats || []).map(c => [c.id, { id: c.id, title: c.name, slug: c.slug }]));
  }
  return rows.map(p => ({
    id: p.id, title: stripHtml(p.title?.rendered),
    url: p.link, date: p.date, modified: p.modified,
    premium: Boolean(p.content?.protected),
    novel: catMap[p.categories?.[0]] || null,
  }));
}

async function listNovels(page = 1, perPage = 20) {
  const { data } = await http.get(`${WP}/categories`, {
    params: { per_page: perPage, page, hide_empty: true, orderby: 'count', order: 'desc' }
  });
  // Fetch cover dari post pertama tiap novel
  const novels = (data || []).map(c => ({ id: c.id, title: c.name, slug: c.slug, count: c.count }));

  // Fetch cover parallel (max 5 sekaligus)
  const withCover = await Promise.all(novels.map(async n => {
    try {
      const { data: posts } = await http.get(`${WP}/posts`, {
        params: { categories: n.id, per_page: 1, orderby: 'date', order: 'asc', _fields: 'content' }
      });
      const cover = extractCover(posts?.[0]?.content?.rendered);
      return { ...n, cover };
    } catch { return { ...n, cover: null }; }
  }));

  return withCover;
}

async function getGenres() {
  const { data: html } = await http.get(`${BASE}/genre/`);
  const $ = cheerio.load(html);
  const genres = [];
  $('a[href*="/genre/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (href === `${BASE}/genre/` || href === '/genre/') return;
    const text = $(el).text().trim();
    const match = text.match(/^(.+?)(\d+)$/);
    if (match) {
      const slug = href.split('/genre/')[1]?.replace(/\/$/, '');
      if (slug) genres.push({ name: match[1].trim(), count: parseInt(match[2]), slug });
    }
  });
  return [...new Map(genres.map(g => [g.slug, g])).values()];
}

async function getTags(page = 1, perPage = 100) {
  const { data } = await http.get(`${WP}/tags`, {
    params: { per_page: perPage, page, hide_empty: true, orderby: 'count', order: 'desc' }
  });
  return (data || []).map(t => ({ id: t.id, title: t.name, slug: t.slug, count: t.count }));
}

async function novelsByGenre(slug, page = 1) {
  const path = page > 1 ? `/genre/${slug}/page/${page}/` : `/genre/${slug}/`;
  const { data: html } = await http.get(`${BASE}${path}`);
  return parseListPage(html);
}

async function novelsByTag(slug, page = 1) {
  const path = page > 1 ? `/tag/${slug}/page/${page}/` : `/tag/${slug}/`;
  const { data: html } = await http.get(`${BASE}${path}`);
  return parseListPage(html);
}

async function getDetail(categoryId) {
  const [{ data: cat }, { data: posts }] = await Promise.all([
    http.get(`${WP}/categories/${categoryId}`),
    http.get(`${WP}/posts`, {
      params: { categories: categoryId, per_page: 100, orderby: 'date', order: 'asc', _fields: 'id,title,link,date,content' }
    })
  ]);
  const list = Array.isArray(posts) ? posts : [];
  const cover = extractCover(list[0]?.content?.rendered);
  return {
    id: cat.id, title: cat.name, slug: cat.slug, cover,
    totalChapters: cat.count,
    chapters: list.map(p => ({
      id: p.id, title: stripHtml(p.title?.rendered),
      url: p.link, date: p.date, premium: Boolean(p.content?.protected),
    }))
  };
}

async function getChapter(postId) {
  const { data } = await http.get(`${WP}/posts/${postId}`, { params: { _fields: 'id,title,content,link,date,categories' } });
  const base = { id: data.id, title: stripHtml(data.title?.rendered), url: data.link, date: data.date, categories: data.categories || [] };
  if (data.content?.protected) return { ...base, premium: true, content: null };
  const $ = cheerio.load(data.content?.rendered || '');
  $('script, style, .adsbygoogle').remove();
  const paras = $('p.wp-block-paragraph, p').map((_, el) => cleanText($(el).text())).get().filter(Boolean);
  return { ...base, premium: false, content: paras.join('\n\n') || null };
}

// ── Page parsers ──────────────────────────────────────────────
function parseListPage(html) {
  const $ = cheerio.load(html);
  const novels = [];

  // Format maindet (series list page)
  $('.listupd article.maindet').each((_, el) => {
    const a = $(el).find('a.tip').first();
    const img = $(el).find('img').first();
    const title = cleanText(a.attr('title') || img.attr('alt'));
    const url = a.attr('href') || null;
    const id = parseInt(a.attr('rel')) || null;
    const cover = cleanImg(img.attr('src'));
    const score = cleanText($(el).find('.numscore').text());
    const synopsis = cleanText($(el).find('.contexcerpt').text());
    const latestChap = cleanText($(el).find('.nchapter').text());
    const genres = $(el).find('.mdgenre a').map((_, g) => cleanText($(g).text())?.replace(/^#\s*/, '')).get().filter(Boolean);
    if (title && url) novels.push({ id, title, cover, url, score, synopsis, latestChap, genres });
  });

  // Format bs/bsx (tag/genre page)
  if (!novels.length) {
    $('a.series[href*="/series/"]').each((_, a) => {
      const img = $(a).find('img').first();
      const title = cleanText($(a).attr('title') || img.attr('alt') || $(a).text());
      const url = $(a).attr('href') || null;
      const id = parseInt($(a).attr('rel')) || null;
      const cover = cleanImg(img.attr('src'));
      if (title && url && !novels.find(n => n.url === url)) {
        novels.push({ id, title, cover, url });
      }
    });
  }

  const hasNext = !!$('a.next, a[rel="next"], .next a').length;
  const hasPrev = !!$('a.prev, a[rel="prev"], .prev a').length;
  return { novels, pagination: { hasNext, hasPrev } };
}

module.exports = { search, getLatest, listNovels, getGenres, getTags, novelsByGenre, novelsByTag, getDetail, getChapter };

const WP   = '/api/wp-json/wp/v2';
const AJAX = '/api/wp-admin/admin-ajax.php';

async function get(url, params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetch(`${url}${q ? `?${q}` : ''}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Search ────────────────────────────────────────────────────
export async function search(query) {
  const data = await post(AJAX, { action: 'ts_ac_do_search', ts_ac_query: query });
  const groups = Array.isArray(data?.series) ? data.series : [];
  return groups.flatMap(g => g?.all || []).map(n => ({
    id:     parseInt(n.ID) || null,
    title:  n.post_title || null,
    cover:  cleanImg(n.post_image),
    genres: n.post_genres || null,
    type:   n.post_type || null,
    status: n.post_status || null,
    url:    n.post_link || null,
  }));
}

// ── Latest update chapters ────────────────────────────────────
export async function getLatest(page = 1, perPage = 20) {
  const posts = await get(`${WP}/posts`, {
    per_page: perPage, page,
    orderby: 'modified', order: 'desc',
    _fields: 'id,title,link,date,modified,categories,content',
  });
  const rows = Array.isArray(posts) ? posts : [];
  const catIds = [...new Set(rows.flatMap(p => p.categories || []))];
  let catMap = {};
  if (catIds.length) {
    const cats = await get(`${WP}/categories`, { include: catIds.join(','), per_page: 100 });
    catMap = Object.fromEntries((cats || []).map(c => [c.id, { id: c.id, title: c.name, slug: c.slug, url: c.link }]));
  }
  return rows.map(p => ({
    id: p.id, title: stripHtml(p.title?.rendered),
    url: p.link, date: p.date, modified: p.modified,
    premium: Boolean(p.content?.protected),
    novel: catMap[p.categories?.[0]] || null,
  }));
}

// ── List novels via API ───────────────────────────────────────
export async function listNovels(page = 1, perPage = 20) {
  const data = await get(`${WP}/categories`, {
    per_page: perPage, page, hide_empty: true, orderby: 'count', order: 'desc',
  });
  return (data || []).map(c => ({ id: c.id, title: c.name, slug: c.slug, count: c.count, url: c.link }));
}

// ── Series list dengan filter scraping ───────────────────────
export async function seriesList(opts = {}, page = 1) {
  const { genre = [], type = [], status = '', order = 'update' } = opts;
  const params = new URLSearchParams();
  [].concat(genre).filter(Boolean).forEach(g => params.append('genre[]', g));
  [].concat(type).filter(Boolean).forEach(t => params.append('type[]', t));
  if (status) params.set('status', status);
  if (order)  params.set('order', order);
  const path = page > 1 ? `/series/page/${page}/` : '/series/';
  const res  = await fetch(`/api${path}?${params}`);
  const html = await res.text();
  return parseSeriesPage(html);
}

// ── Tags ──────────────────────────────────────────────────────
export async function getTags(page = 1, perPage = 100) {
  const data = await get(`${WP}/tags`, {
    per_page: perPage, page, hide_empty: true, orderby: 'count', order: 'desc',
  });
  return (data || []).map(t => ({ id: t.id, title: t.name, slug: t.slug, count: t.count }));
}

// ── Genres (scraping dari halaman genre) ─────────────────────
export async function getGenres() {
  const res  = await fetch('/api/genre/');
  const html = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const genres = [];
  doc.querySelectorAll('a[href*="/genre/"]').forEach(el => {
    const href = el.href || el.getAttribute('href') || '';
    if (href === 'https://fuyu-novel.my.id/genre/' || href === '/genre/') return;
    const text = el.textContent.trim();
    const match = text.match(/^(.+?)(\d+)$/);
    if (match) {
      const slug = href.split('/genre/')[1]?.replace(/\/$/, '');
      if (slug) genres.push({ name: match[1].trim(), count: parseInt(match[2]), slug });
    }
  });
  return genres;
}

// ── Novels by tag slug (scraping) ────────────────────────────
export async function novelsByTag(tagSlug, page = 1) {
  const path = page > 1 ? `/tag/${tagSlug}/page/${page}/` : `/tag/${tagSlug}/`;
  const res  = await fetch(`/api${path}`);
  const html = await res.text();
  return parseSeriesPage(html);
}

// ── Novels by genre slug (scraping) ──────────────────────────
export async function novelsByGenre(genreSlug, page = 1) {
  const path = page > 1 ? `/genre/${genreSlug}/page/${page}/` : `/genre/${genreSlug}/`;
  const res  = await fetch(`/api${path}`);
  const html = await res.text();
  return parseTagGenrePage(html);
}

// ── Detail novel ──────────────────────────────────────────────
export async function getDetail(categoryId) {
  const [cat, posts] = await Promise.all([
    get(`${WP}/categories/${categoryId}`),
    get(`${WP}/posts`, {
      categories: categoryId, per_page: 100,
      orderby: 'date', order: 'asc',
      _fields: 'id,title,link,date,content',
    }),
  ]);
  const list = Array.isArray(posts) ? posts : [];
  let cover = null;
  if (list.length) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(list[0]?.content?.rendered || '', 'text/html');
    const img = doc.querySelector('img');
    if (img) cover = cleanImg(img.src);
  }
  return {
    id: cat.id, title: cat.name, slug: cat.slug, url: cat.link, cover,
    totalChapters: cat.count,
    chapters: list.map(p => ({
      id: p.id, title: stripHtml(p.title?.rendered),
      url: p.link, date: p.date, premium: Boolean(p.content?.protected),
    })),
  };
}

// ── Chapter content ───────────────────────────────────────────
export async function getChapter(postId) {
  const data = await get(`${WP}/posts/${postId}`, { _fields: 'id,title,content,link,date' });
  const base = { id: data.id, title: stripHtml(data.title?.rendered), url: data.link, date: data.date };
  if (data.content?.protected) return { ...base, premium: true, content: null };
  const parser = new DOMParser();
  const doc = parser.parseFromString(data.content?.rendered || '', 'text/html');
  doc.querySelectorAll('script, style, .adsbygoogle').forEach(el => el.remove());
  const paras = [...doc.querySelectorAll('p.wp-block-paragraph, p')]
    .map(el => el.textContent.trim()).filter(Boolean);
  return { ...base, premium: false, content: paras.join('\n\n') || null };
}

// ── Helpers ───────────────────────────────────────────────────
export function cleanImg(src) {
  if (!src) return null;
  const proxy = src.match(/^https?:\/\/i\d?\.wp\.com\/(.+)$/i);
  if (proxy) return `https://${proxy[1].split('?')[0]}`;
  try { const u = new URL(src); u.search = ''; return u.toString().replace('http://', 'https://'); } catch { return src; }
}

function stripHtml(html) {
  if (!html) return null;
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
}

function parseSeriesPage(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const novels = [];
  doc.querySelectorAll('.listupd article.maindet').forEach(el => {
    const a      = el.querySelector('a.tip');
    const img    = el.querySelector('img');
    const title  = a?.getAttribute('title') || img?.getAttribute('alt') || null;
    const href   = a?.getAttribute('href') || null;
    const id     = parseInt(a?.getAttribute('rel')) || null;
    const cover  = cleanImg(img?.src);
    const score  = el.querySelector('.numscore')?.textContent.trim() || null;
    const synopsis  = el.querySelector('.contexcerpt')?.textContent.trim() || null;
    const latestChap = el.querySelector('.nchapter')?.textContent.trim() || null;
    const genres = [...el.querySelectorAll('.mdgenre a')].map(g => g.textContent.trim().replace(/^#\s*/, ''));
    if (title && href) novels.push({ id, title, cover, url: href, score, synopsis, latestChap, genres });
  });
  const hasNext = !!doc.querySelector('a.next, a[rel="next"]');
  const hasPrev = !!doc.querySelector('a.prev, a[rel="prev"]');
  return { novels, pagination: { hasNext, hasPrev } };
}

function parseTagGenrePage(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const novels = [];

  // Coba selector series list
  doc.querySelectorAll('a.series[href*="/series/"]').forEach(a => {
    const img   = a.querySelector('img') || a.closest('.bs, .bsx, li')?.querySelector('img');
    const title = a.getAttribute('title') || img?.getAttribute('alt') || a.textContent.trim() || null;
    const href  = a.getAttribute('href') || null;
    const id    = parseInt(a.getAttribute('rel')) || null;
    const cover = cleanImg(img?.src);
    if (title && href && !novels.find(n => n.url === href)) {
      novels.push({ id, title, cover, url: href });
    }
  });

  // Fallback: maindet
  if (!novels.length) return parseSeriesPage(html);

  const hasNext = !!doc.querySelector('a.next, a[rel="next"], .next');
  const hasPrev = !!doc.querySelector('a.prev, a[rel="prev"], .prev');
  return { novels, pagination: { hasNext, hasPrev } };
}

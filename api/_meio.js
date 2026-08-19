'use strict';
const axios = require('axios');

const BASE = process.env.MEIO_BASE_URL || 'https://meionovels.com';
const AJAX = `${BASE}/wp-admin/admin-ajax.php`;

const http = axios.create({
  timeout: 20000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': BASE
  }
});

// ── Text helpers ──────────────────────────────────────────────
function cleanText(v) {
  return String(v ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim() || null;
}

function decodeEntities(v) {
  return String(v ?? '')
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#([0-9]+);?/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/&hellip;/g,'…').replace(/&mdash;/g,'—').replace(/&ndash;/g,'–');
}

function text(v) { return decodeEntities(cleanText(v)); }

function attr(tag, name) {
  const m = String(tag ?? '').match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return m ? decodeEntities(m[1]) : null;
}

function firstMatch(src, re, g = 1) {
  const m = String(src ?? '').match(re);
  return m ? m[g] : null;
}

function allMatches(src, re, g = 1) {
  const out = [], r = re.global ? re : new RegExp(re.source, re.flags + 'g');
  let m; while ((m = r.exec(String(src ?? '')))) out.push(m[g]);
  return out;
}

function safeUrl(v, base = BASE) {
  if (!v) return null;
  try { const u = new URL(v, base); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; }
}

function slugFromUrl(v) {
  try { return new URL(v).pathname.split('/').filter(Boolean).at(-1) || null; } catch { return null; }
}

function toInt(v) { const n = parseInt(String(v ?? '').replace(/[^0-9-]/g,''), 10); return isFinite(n) ? n : null; }
function toFloat(v) { const n = parseFloat(String(v ?? '').replace(',','.')); return isFinite(n) ? n : null; }

function imageFromBlock(block) {
  const tag = firstMatch(block, /<img\b[^>]*>/i, 0);
  if (!tag) return null;
  return safeUrl(attr(tag,'data-src') || attr(tag,'data-lazy-src') || attr(tag,'src'));
}

function extractLinks(html) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m; while ((m = re.exec(String(html ?? '')))) {
    const url = safeUrl(m[1]);
    const title = text(m[2]);
    if (url && title) out.push({ title, url, slug: slugFromUrl(url) });
  }
  return out;
}

function elementBlocks(html, tag, cls = null) {
  const src = String(html ?? '');
  const openRe = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
  const blocks = [];
  let m;
  while ((m = openRe.exec(src))) {
    if (cls && !(attr(m[0],'class') || '').includes(cls)) continue;
    const tokenRe = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
    tokenRe.lastIndex = m.index;
    let depth = 0, token, end = null;
    while ((token = tokenRe.exec(src))) {
      if (/^<\//.test(token[0])) depth--;
      else if (!/\/\s*>$/.test(token[0])) depth++;
      if (depth === 0) { end = tokenRe.lastIndex; break; }
    }
    if (end) { blocks.push(src.slice(m.index, end)); openRe.lastIndex = end; }
  }
  return blocks;
}

function parsePagination(html) {
  const block = firstMatch(html, /<(?:div|nav|ul)\b[^>]*class=["'][^"']*(?:wp-pagenavi|pagination)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|nav|ul)>/i) || '';
  const next = safeUrl(firstMatch(block, /<a\b[^>]*rel=["']next["'][^>]*href=["']([^"']+)["']/i) || firstMatch(block, /<a\b[^>]*class=["'][^"']*next[^"']*["'][^>]*href=["']([^"']+)["']/i));
  const prev = safeUrl(firstMatch(block, /<a\b[^>]*rel=["']prev[^"']*["'][^>]*href=["']([^"']+)["']/i) || firstMatch(block, /<a\b[^>]*class=["'][^"']*prev[^"']*["'][^>]*href=["']([^"']+)["']/i));
  return { hasNext: !!next, hasPrev: !!prev, next, prev };
}

function parseCard(block) {
  const id = toInt(firstMatch(block, /data-post-id=["'](\d+)["']/i) || firstMatch(block, /id=["']manga-item-(\d+)["']/i));
  const anchor = firstMatch(block, /<div\b[^>]*class=["'][^"']*item-thumb[^"']*["'][^>]*>[\s\S]*?(<a\b[^>]*>)/i, 1) || firstMatch(block, /(<a\b[^>]*href=["'][^"']*\/novel\/[^"']*["'][^>]*>)/i, 1) || '';
  const url = safeUrl(attr(anchor, 'href'));
  const titleRaw = firstMatch(block, /<div\b[^>]*class=["'][^"']*post-title[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) || firstMatch(block, /<h[1-6]\b[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i) || attr(anchor,'title') || '';
  const title = text(titleRaw);
  const type = text(firstMatch(block, /<span\b[^>]*class=["'][^"']*manga-type[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) || '');
  const rating = toFloat(firstMatch(block, /class=["'][^"']*total_votes[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));
  const cover = imageFromBlock(block);
  const chapters = [];
  const cr = /<span\b[^>]*class=["'][^"']*chapter[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let cm; while ((cm = cr.exec(block))) chapters.push({ title: text(cm[2]), url: safeUrl(cm[1]) });
  return { id, slug: slugFromUrl(url), title: title || null, url, cover, type: type || null, rating, latestChapters: chapters };
}

function parseCards(html) {
  const blocks = elementBlocks(html, 'div', 'page-item-detail');
  const seen = new Set();
  return blocks.map(b => parseCard(b)).filter(x => {
    const key = x.id || x.url;
    if (!x.title || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function parseField(html, label) {
  const re = new RegExp(`<div\\b[^>]*class=["'][^"']*post-content_item[^"']*["'][^>]*>[\\s\\S]*?<h5[^>]*>\\s*${label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*<\\/h5>[\\s\\S]*?<div\\b[^>]*class=["'][^"']*summary-content[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`, 'i');
  return text(firstMatch(html, re) || '');
}

function parseFieldLinks(html, label) {
  const re = new RegExp(`<div\\b[^>]*class=["'][^"']*post-content_item[^"']*["'][^>]*>[\\s\\S]*?<h5[^>]*>\\s*${label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*<\\/h5>[\\s\\S]*?<div\\b[^>]*class=["'][^"']*summary-content[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`, 'i');
  return extractLinks(firstMatch(html, re) || '');
}

function parseSummary(html) {
  const block = firstMatch(html, /<div\b[^>]*class=["'][^"']*summary__content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) || '';
  const paragraphs = allMatches(block, /<p\b[^>]*>([\s\S]*?)<\/p>/gi).map(text).filter(Boolean);
  return { text: text(block), paragraphs };
}

function parseDetail(html, url) {
  const id = toInt(firstMatch(html, /class=["']post-(\d+)\b/i) || firstMatch(html, /data-id=["'](\d+)["']/i));
  const title = text(firstMatch(html, /<div\b[^>]*class=["'][^"']*profile-manga[^"']*["'][^>]*>[\s\S]*?<div\b[^>]*class=["'][^"']*post-title[^"']*["'][^>]*>[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/i) || firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || '');
  const coverTag = firstMatch(html, /<div\b[^>]*class=["'][^"']*summary_image[^"']*["'][^>]*>[\s\S]*?(<img\b[^>]*>)/i, 1) || '';
  const cover = safeUrl(attr(coverTag,'data-src') || attr(coverTag,'data-lazy-src') || attr(coverTag,'src'));
  const rating = toFloat(firstMatch(html, /id=["']averagerate["'][^>]*>([\s\S]*?)<\//i));
  const ratingCount = toInt(firstMatch(html, /id=["']countrate["'][^>]*>([\s\S]*?)<\//i));
  const firstChapterTag = firstMatch(html, /<a\b(?=[^>]*\bid=["']btn-read-last["'])[^>]*>/i, 0) || '';
  const lastChapterTag = firstMatch(html, /<a\b(?=[^>]*\bid=["']btn-read-first["'])[^>]*>/i, 0) || '';
  return {
    id, slug: slugFromUrl(url), title: title || null, url: safeUrl(url),
    cover, rating, ratingCount,
    alternative: parseField(html, 'Alternative') || null,
    authors: parseFieldLinks(html, 'Author\\(s\\)'),
    artists: parseFieldLinks(html, 'Artist\\(s\\)'),
    genres: parseFieldLinks(html, 'Genre\\(s\\)'),
    tags: parseFieldLinks(html, 'Tag\\(s\\)'),
    type: parseField(html, 'Type') || null,
    status: parseField(html, 'Status') || null,
    release: parseField(html, 'Release') || null,
    chapterCount: toInt(parseField(html, 'Chapters')),
    summary: parseSummary(html),
    firstChapter: safeUrl(attr(firstChapterTag,'href')),
    lastChapter: safeUrl(attr(lastChapterTag,'href')),
    chapterEndpoint: `${String(url).replace(/\/+$/,'')}/ajax/chapters/`
  };
}

function parseChapterList(html, page = 1) {
  const chapters = [];
  const seen = new Set();
  const re = /<li\b[^>]*class=["'][^"']*\bwp-manga-chapter\b[^"']*["'][^>]*>[\s\S]*?<\/li>/gi;
  let m; while ((m = re.exec(html))) {
    const block = m[0];
    const aTag = firstMatch(block, /(<a\b[^>]*href=["'][^"']*["'][^>]*>)/i, 1) || '';
    const url = safeUrl(attr(aTag,'href'));
    const title = text(firstMatch(block, /<a\b[^>]*>([\s\S]*?)<\/a>/i) || '');
    const date = text(firstMatch(block, /class=["'][^"']*(?:post-on|chapter-release-date)[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) || '');
    const slug = slugFromUrl(url);
    const num = toInt(firstMatch(title, /(?:chapter|ch\.?)\s*([0-9]+)/i));
    const key = url || title;
    if (url && !seen.has(key)) { seen.add(key); chapters.push({ number: num, title: title || null, slug, url, date: date || null }); }
  }
  return { page, chapters, count: chapters.length, pagination: parsePagination(html) };
}

function parseReader(html, url) {
  const heading = text(firstMatch(html, /id=["']chapter-heading["'][^>]*>([\s\S]*?)<\/h[1-6]>/i) || firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || '');
  const navHead = firstMatch(html, /<[^>]+\bid=["']manga-reading-nav-head["'][^>]*>/i, 0) || '';
  const cur = firstMatch(html, /<input\b[^>]*\bid=["']wp-manga-current-chap["'][^>]*>/i, 0) || '';
  const chapter = attr(navHead,'data-chapter') || attr(cur,'value') || slugFromUrl(url);
  const mangaId = toInt(attr(navHead,'data-id') || firstMatch(html, /var\s+manga\s*=\s*\{[\s\S]*?"manga_id"\s*:\s*"?(\d+)/i));
  const chapterId = toInt(attr(cur,'data-id'));
  const readingBlocks = elementBlocks(html, 'div', 'reading-content');
  const readingBlock = readingBlocks[0] || '';
  const paragraphs = allMatches(readingBlock, /<p\b[^>]*>([\s\S]*?)<\/p>/gi).map(text).filter(Boolean);
  const content = paragraphs.length ? paragraphs.join('\n\n') : text(readingBlock);
  const prev = safeUrl(firstMatch(html, /<div\b[^>]*class=["'][^"']*nav-previous[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["']/i));
  const next = safeUrl(firstMatch(html, /<div\b[^>]*class=["'][^"']*nav-next[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["']/i));
  const novelUrl = safeUrl(firstMatch(html, /<a\b[^>]*class=["'][^"']*back-to-manga[^"']*["'][^>]*href=["']([^"']+)["']/i) || firstMatch(html, /<li\b[^>]*class=["'][^"']*active[^"']*["'][^>]*>[\s\S]*?<\/li>[\s\S]*?<li[^>]*>\s*<a\b[^>]*href=["']([^"']*\/novel\/[^"']+)["']/i));
  return { url: safeUrl(url), title: heading || null, chapter, chapterId, mangaId, content: content || null, paragraphs, previous: prev, next, novelUrl };
}

function parseHover(html) {
  const id = toInt(firstMatch(html, /id=["']manga-hover-(\d+)["']/i));
  const url = safeUrl(firstMatch(html, /<a\b[^>]*href=["']([^"']+)["'][^>]*title=/i));
  const title = text(firstMatch(html, /<div\b[^>]*class=["'][^"']*post-title[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) || '');
  const rating = toFloat(firstMatch(html, /class=["'][^"']*total_votes[^"']*["'][^>]*>([\s\S]*?)<\//i));
  const getItem = (name) => text(firstMatch(html, new RegExp(`class=["'][^"']*item_${name}[^"']*["'][\\s\\S]*?summary-content[^>]*>([\\s\\S]*?)<\\/div>`, 'i')) || '');
  const linksIn = (name) => extractLinks(firstMatch(html, new RegExp(`class=["'][^"']*item_${name}[^"']*["'][\\s\\S]*?summary-content[^>]*>([\\s\\S]*?)<\\/div>`, 'i')) || '');
  return { id, title: title || null, url, cover: imageFromBlock(html), rating, alternative: getItem('alternative') || null, authors: linksIn('authors'), artists: linksIn('artists'), genres: linksIn('genres'), tags: linksIn('tags'), summary: getItem('summary') || null };
}

// ── API Functions ─────────────────────────────────────────────

async function home() {
  const { data: html } = await http.get(`${BASE}/`);
  const items = parseCards(html);
  const title = text(firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || '');
  const headings = [...new Set(allMatches(html, /<(?:h1|h2|h3)\b[^>]*>([\s\S]*?)<\/h[123]>/gi).map(text).filter(x => x && x.length < 100))];
  return { title, headings, items, count: items.length };
}

async function archive(opts = {}) {
  const { page = 1, orderby = null, kind = null, slug = null } = opts;
  let path = '/novel/';
  if (kind && slug) {
    const prefix = { genre: 'novel-genre', tag: 'novel-tag', author: 'novel-author', release: 'novel-release' }[kind] || `novel-${kind}`;
    path = `/${prefix}/${slug}/`;
  }
  const params = {};
  if (page > 1) params.page = page;
  if (orderby) params.m_orderby = orderby;
  const url = `${BASE}${path}`;
  const { data: html } = await http.get(url, { params });
  const items = parseCards(html);
  const pageTitle = text(firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || '');
  return { url, page, orderby, title: pageTitle || null, items, count: items.length, pagination: parsePagination(html) };
}

async function search(keyword) {
  const { data } = await http.post(AJAX, new URLSearchParams({ action: 'wp-manga-search-manga', title: keyword }).toString(), { headers: { 'content-type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' } });
  const items = (Array.isArray(data?.data) ? data.data : []).map(n => ({ title: text(n?.title), url: safeUrl(n?.url), slug: slugFromUrl(n?.url), type: n?.type || null, cover: null })).filter(x => x.title);
  return { keyword, count: items.length, items };
}

async function taxonomies() {
  const { data: html } = await http.get(`${BASE}/`);
  const links = extractLinks(html);
  const result = { genres: [], tags: [], authors: [], releases: [] };
  const map = { 'novel-genre': 'genres', 'novel-tag': 'tags', 'novel-author': 'authors', 'novel-release': 'releases' };
  for (const link of links) {
    try {
      const path = new URL(link.url).pathname;
      const m = path.match(/^\/(novel-genre|novel-tag|novel-author|novel-release)\/([^/]+)\/?$/i);
      if (!m) continue;
      const key = map[m[1].toLowerCase()];
      if (key && !result[key].find(x => x.url === link.url)) result[key].push({ name: link.title, slug: decodeURIComponent(m[2]), url: link.url });
    } catch {}
  }
  return result;
}

async function detail(slugOrUrl) {
  const url = /^https?:\/\//i.test(slugOrUrl) ? slugOrUrl : `${BASE}/novel/${slugOrUrl}/`;
  const { data: html } = await http.get(url);
  return parseDetail(html, url);
}

async function chapters(slugOrUrl, page = 1) {
  const base = /^https?:\/\//i.test(slugOrUrl) ? slugOrUrl : `${BASE}/novel/${slugOrUrl}/`;
  const endpoint = `${base.replace(/\/+$/,'')}/ajax/chapters/?t=${page}`;
  const { data: html } = await http.post(endpoint, '', { headers: { 'X-Requested-With': 'XMLHttpRequest', 'content-type': 'application/x-www-form-urlencoded' } });
  return { novelUrl: base, ...parseChapterList(html, page) };
}

async function chapter(url) {
  const { data: html } = await http.get(url);
  return parseReader(html, url);
}

async function hover(postId) {
  const { data: html } = await http.post(AJAX, new URLSearchParams({ action: 'madara_hover_load_post', postid: postId }).toString(), { headers: { 'content-type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' } });
  return parseHover(typeof html === 'string' ? html : '');
}

async function readingNav(mangaId, chapterSlug, volumeId = 0) {
  const { data: html } = await http.post(AJAX, new URLSearchParams({ action: 'manga_get_reading_nav', manga: mangaId, chapter: chapterSlug, volume_id: volumeId, style: '', type: 'content' }).toString(), { headers: { 'content-type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' } });
  const options = [];
  const re = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
  let m; while ((m = re.exec(typeof html === 'string' ? html : ''))) {
    const a = {};
    const ar = /([:\w-]+)\s*=\s*["']([^"']*)["']/g;
    let am; while ((am = ar.exec(m[1]))) a[am[1]] = decodeEntities(am[2]);
    options.push({ value: a.value || null, title: text(m[2]), redirect: safeUrl(a['data-redirect']), navigation: a['data-navigation'] || null });
  }
  return { mangaId, chapter: chapterSlug, volumeId, options };
}

module.exports = { home, archive, search, taxonomies, detail, chapters, chapter, hover, readingNav };

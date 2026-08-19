'use strict';

const DEFAULT_BASE_URL = process.env.MEIO_BASE_URL || 'https://meionovels.com';
const DEFAULT_TIMEOUT_MS = Number(process.env.MEIO_TIMEOUT_MS || 20000);
const DEFAULT_USER_AGENT = process.env.MEIO_USER_AGENT || 'meionovels-api-client/1.0';

class ApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ApiError';
    Object.assign(this, details);
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function toInt(value, fallback = null) {
  const n = Number.parseInt(String(value ?? '').replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toFloat(value, fallback = null) {
  const n = Number.parseFloat(String(value ?? '').replace(',', '.').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<\/div\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeEntities(value) {
  let text = String(value ?? '');
  const named = {
    amp: '&', apos: "'", gt: '>', lt: '<', quot: '"', nbsp: '\u00a0',
    hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
    laquo: '«', raquo: '»', copy: '©', reg: '®', trade: '™', bull: '•', middot: '·'
  };
  text = text.replace(/&#x([0-9a-f]+);?/gi, (_, hex) => {
    const n = Number.parseInt(hex, 16);
    return Number.isFinite(n) ? String.fromCodePoint(n) : _;
  });
  text = text.replace(/&#([0-9]+);?/g, (_, dec) => {
    const n = Number.parseInt(dec, 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : _;
  });
  text = text.replace(/&([a-z][a-z0-9]+);/gi, (all, key) => named[key.toLowerCase()] ?? all);
  return text;
}

function text(value) {
  return decodeEntities(cleanText(value));
}

function normalizeEmpty(value) {
  if (Array.isArray(value)) return value.map(normalizeEmpty);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeEmpty(item)]));
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

function normalizeResponse(value) {
  const normalized = normalizeEmpty(value);
  if (Array.isArray(normalized)) return normalized.map(normalizeResponse);
  if (!normalized || typeof normalized !== 'object') return normalized;
  const out = Object.fromEntries(Object.entries(normalized).map(([key, item]) => [key, normalizeResponse(item)]));
  if (out.url && !out.permalink) out.permalink = out.url;
  if (out.cover && !out.cover_resolved) out.cover_resolved = out.cover;
  if (out.image && !out.image_resolved) out.image_resolved = out.image;
  if (out.content && !out.contentText) out.contentText = text(out.content);
  return out;
}

function attr(tag, name) {
  const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*["']([^"']*)["']`, 'i');
  const m = String(tag ?? '').match(re);
  return m ? decodeEntities(m[1]) : null;
}

function attrs(tag) {
  const out = {};
  const re = /([:\w-]+)\s*=\s*["']([^"']*)["']/g;
  let m;
  while ((m = re.exec(String(tag ?? '')))) out[m[1]] = decodeEntities(m[2]);
  return out;
}

function absUrl(value, base) {
  if (!value) return null;
  try { return new URL(value, base).href; } catch { return String(value); }
}

function safeUrl(value, base) {
  const url = absUrl(value, base);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return parsed.href;
  } catch { return null; }
}

function unique(values) {
  return [...new Set(asArray(values).filter(Boolean))];
}

function slugFromUrl(value) {
  if (!value) return null;
  try {
    const parts = new URL(value).pathname.split('/').filter(Boolean);
    return parts.at(-1) || null;
  } catch {
    return String(value).split('/').filter(Boolean).at(-1) || null;
  }
}

function elementBlocks(html, tagName, className = null) {
  const source = String(html ?? '');
  const openRe = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  const blocks = [];
  let match;
  while ((match = openRe.exec(source))) {
    const openTag = match[0];
    if (className && !new RegExp(`(?:^|\\s)${className}(?:\\s|$)`, 'i').test(attr(openTag, 'class') || '')) continue;
    const start = match.index;
    const tokenRe = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
    tokenRe.lastIndex = start;
    let depth = 0;
    let token;
    let end = null;
    while ((token = tokenRe.exec(source))) {
      if (/^<\//.test(token[0])) depth -= 1;
      else if (!/\/\s*>$/.test(token[0])) depth += 1;
      if (depth === 0) { end = tokenRe.lastIndex; break; }
    }
    if (end != null) {
      blocks.push(source.slice(start, end));
      openRe.lastIndex = end;
    }
  }
  return blocks;
}

function firstMatch(source, regex, group = 1) {
  const m = String(source ?? '').match(regex);
  return m ? m[group] : null;
}

function allMatches(source, regex, group = 1) {
  const out = [];
  const re = regex.global ? regex : new RegExp(regex.source, `${regex.flags}g`);
  let m;
  while ((m = re.exec(String(source ?? '')))) out.push(m[group]);
  return out;
}

function extractLinks(html, base, options = {}) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html ?? '')))) {
    const href = safeUrl(m[1], base);
    const label = text(m[2]);
    if (!href || (!label && !options.includeEmpty)) continue;
    out.push({ title: label, url: href });
  }
  return out;
}

function imageFromBlock(block, base) {
  const tag = firstMatch(block, /<img\b[^>]*>/i, 0);
  if (!tag) return null;
  return safeUrl(attr(tag, 'data-src') || attr(tag, 'data-lazy-src') || attr(tag, 'src'), base);
}

function parseCard(block, base) {
  const id = toInt(attr(firstMatch(block, /<div\b[^>]*class=["'][^"']*item-thumb[^"']*["'][^>]*>/i, 0) || '', 'data-post-id') || firstMatch(block, /id=["']manga-item-(\d+)["']/i));
  const anchor = firstMatch(block, /<div\b[^>]*class=["'][^"']*item-thumb[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*>/i, 0) || firstMatch(block, /<a\b[^>]*>/i, 0) || '';
  const url = safeUrl(attr(anchor, 'href'), base);
  const title = text(firstMatch(block, /<div\b[^>]*class=["'][^"']*post-title[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i) || firstMatch(block, /<h[1-6]\b[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i) || attr(anchor, 'title') || '');
  const type = text(firstMatch(block, /<span\b[^>]*class=["'][^"']*manga-type[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) || '');
  const rating = toFloat(firstMatch(block, /class=["'][^"']*total_votes[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));
  const chapters = [];
  const chapterRe = /<span\b[^>]*class=["'][^"']*chapter[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let cm;
  while ((cm = chapterRe.exec(block))) chapters.push({ title: text(cm[2]), url: safeUrl(cm[1], base) });
  return {
    id,
    slug: slugFromUrl(url),
    title: title || null,
    url,
    image: imageFromBlock(block, base),
    type: type || null,
    rating,
    latestChapters: chapters
  };
}

function parseCards(html, base) {
  const blocks = elementBlocks(html, 'div', 'page-item-detail');
  const cards = blocks.map((b) => parseCard(b, base)).filter((x) => x.title || x.url);
  const seen = new Set();
  return cards.filter((x) => {
    const key = x.id || x.url || x.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseSections(html, base) {
  const cards = parseCards(html, base);
  const grouped = new Map();
  for (const card of cards) {
    const key = 'catalog';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(card);
  }
  const headings = unique(allMatches(html, /<(?:h1|h2|h3|h4|h5)\b[^>]*>([\s\S]*?)<\/h[1-5]>/gi).map(text).filter((x) => x && x.length < 100));
  return {
    sections: [...grouped.entries()].map(([name, items]) => ({ name, title: name, items })),
    headings,
    items: cards
  };
}

function parsePagination(html, base) {
  const block = firstMatch(html, /<(?:div|nav|ul)\b[^>]*class=["'][^"']*(?:wp-pagenavi|pagination)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|nav|ul)>/i) || '';
  const links = extractLinks(block, base, { includeEmpty: true });
  const pages = unique(links.map((x) => x.url).filter((url) => /(?:[?&](?:paged|page)=\d+|\/page\/\d+\/?$)/i.test(url)));
  const next = safeUrl(firstMatch(block, /<a\b[^>]*rel=["']next["'][^>]*href=["']([^"']+)["']/i) || firstMatch(block, /<a\b[^>]*class=["'][^"']*(?:next|nextpostslink)["'][^>]*href=["']([^"']+)["']/i), base);
  const prev = safeUrl(firstMatch(block, /<a\b[^>]*rel=["']prev(?:ious)?["'][^>]*href=["']([^"']+)["']/i) || firstMatch(block, /<a\b[^>]*class=["'][^"']*(?:prev|previous)["'][^>]*href=["']([^"']+)["']/i), base);
  return { pages, next, previous: prev };
}

function parseField(detailHtml, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<div\\b[^>]*class=["'][^"']*post-content_item[^"']*["'][^>]*>[\\s\\S]*?<h5[^>]*>\\s*${escaped}\\s*<\\/h5>[\\s\\S]*?<div\\b[^>]*class=["'][^"']*summary-content[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`, 'i');
  return text(firstMatch(detailHtml, re) || '');
}

function parseFieldLinks(detailHtml, label, base) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<div\\b[^>]*class=["'][^"']*post-content_item[^"']*["'][^>]*>[\\s\\S]*?<h5[^>]*>\\s*${escaped}\\s*<\\/h5>[\\s\\S]*?<div\\b[^>]*class=["'][^"']*summary-content[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`, 'i');
  return extractLinks(firstMatch(detailHtml, re) || '', base);
}

function parseSummary(detailHtml) {
  const block = firstMatch(detailHtml, /<div\b[^>]*class=["'][^"']*summary__content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) || '';
  const paragraphs = allMatches(block, /<p\b[^>]*>([\s\S]*?)<\/p>/gi).map(text).filter(Boolean);
  return { text: text(block), paragraphs };
}

function parseChapterLink(linkHtml, base, version = null) {
  const tag = firstMatch(linkHtml, /<a\b[^>]*>/i, 0) || '';
  const url = safeUrl(attr(tag, 'href'), base);
  const title = text(firstMatch(linkHtml, /<a\b[^>]*>([\s\S]*?)<\/a>/i) || '');
  const date = text(firstMatch(linkHtml, /class=["'][^"']*(?:post-on|chapter-release-date)[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) || '');
  const slug = slugFromUrl(url);
  const n = toInt(firstMatch(title, /(?:chapter|chapitre)\s*([0-9]+)/i));
  return { number: n, title: title || null, slug, url, version: version || null, date: date || null };
}

function parseChapterList(html, base, page = 1) {
  const chapters = [];
  const versions = [];
  const parentBlocks = elementBlocks(html, 'li', 'parent');
  const chapterRe = /<li\b[^>]*class=["'][^"']*\bwp-manga-chapter\b[^"']*["'][^>]*>[\s\S]*?<\/li>/gi;
  for (const parent of parentBlocks) {
    const versionTitle = text(firstMatch(parent, /<a\b[^>]*class=["'][^"']*\bhas-child\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i) || '');
    const chapterBlocks = allMatches(parent, chapterRe, 0);
    const local = [];
    for (const block of chapterBlocks) {
      const ch = parseChapterLink(block, base, versionTitle || null);
      if (ch.url) { local.push(ch); chapters.push(ch); }
    }
    versions.push({ name: versionTitle || null, chapters: local });
  }
  if (!chapters.length) {
    for (const block of allMatches(html, chapterRe, 0)) {
      const ch = parseChapterLink(block, base, null);
      if (ch.url) chapters.push(ch);
    }
  }
  const pagination = parsePagination(html, base);
  return { page, versions, chapters, count: chapters.length, pagination };
}

function parseDetail(detailHtml, url, base) {
  const postId = toInt(firstMatch(detailHtml, /class=["']post-(\d+)\b/i) || firstMatch(detailHtml, /data-id=["'](\d+)["']/i));
  const title = text(firstMatch(detailHtml, /<div\b[^>]*class=["'][^"']*profile-manga[^"']*["'][^>]*>[\s\S]*?<div\b[^>]*class=["'][^"']*post-title[^"']*["'][^>]*>[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/i) || firstMatch(detailHtml, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || '');
  const coverTag = firstMatch(detailHtml, /<div\b[^>]*class=["'][^"']*summary_image[^"']*["'][^>]*>[\s\S]*?<img\b[^>]*>/i, 0) || '';
  const cover = safeUrl(attr(coverTag, 'data-src') || attr(coverTag, 'data-lazy-src') || attr(coverTag, 'src'), base);
  const rating = toFloat(firstMatch(detailHtml, /id=["']averagerate["'][^>]*>([\s\S]*?)<\//i) || firstMatch(detailHtml, /class=["'][^"']*post-total-rating[^"']*["'][\s\S]*?class=["'][^"']*total_votes[^"']*["'][^>]*>([\s\S]*?)<\//i));
  const ratingCount = toInt(firstMatch(detailHtml, /id=["']countrate["'][^>]*>([\s\S]*?)<\//i));
  const rank = parseField(detailHtml, 'Rank');
  const monthlyViews = toInt(firstMatch(rank, /([0-9][0-9,]*)\s+monthly views?/i));
  const bookmarkText = text(firstMatch(detailHtml, /<div\b[^>]*class=["'][^"']*\badd-bookmark\b[^"']*["'][\s\S]*?<span\b[^>]*>([\s\S]*?Users bookmarked[\s\S]*?)<\/span>/i) || '');
  const bookmarkCount = toInt(firstMatch(bookmarkText, /([0-9][0-9,]*)/));
  const firstChapterTag = firstMatch(detailHtml, /<a\b(?=[^>]*\bid=["']btn-read-last["'])[^>]*>/i, 0) || '';
  const lastChapterTag = firstMatch(detailHtml, /<a\b(?=[^>]*\bid=["']btn-read-first["'])[^>]*>/i, 0) || '';
  const firstChapter = safeUrl(attr(firstChapterTag, 'href'), base);
  const lastChapter = safeUrl(attr(lastChapterTag, 'href'), base);
  const chapterCount = toInt(parseField(detailHtml, 'Chapters'));
  const authors = parseFieldLinks(detailHtml, 'Author(s)', base);
  const artists = parseFieldLinks(detailHtml, 'Artist(s)', base);
  const genres = parseFieldLinks(detailHtml, 'Genre(s)', base);
  const tags = parseFieldLinks(detailHtml, 'Tag(s)', base);
  const summary = parseSummary(detailHtml);
  const type = parseField(detailHtml, 'Type');
  const release = parseFieldLinks(detailHtml, 'Release', base);
  const status = parseField(detailHtml, 'Status');
  return {
    id: postId,
    slug: slugFromUrl(url),
    title: title || null,
    url: safeUrl(url, base),
    cover,
    rating,
    ratingCount,
    rank: rank || null,
    monthlyViews,
    alternative: parseField(detailHtml, 'Alternative') || null,
    authors,
    artists,
    genres,
    tags,
    type: type || null,
    release,
    status: status || null,
    chapterCount,
    bookmarkCount,
    summary,
    firstChapter,
    lastChapter,
    chapters: [],
    chapterEndpoint: safeUrl(`${url.replace(/\/+$/, '')}/ajax/chapters/?t=1`, base),
    raw: {
      hasSummary: Boolean(summary.text),
      hasChapterHolder: /id=["']manga-chapters-holder["']/i.test(detailHtml),
      source: 'html-public'
    }
  };
}

function parseReader(html, url, base) {
  const heading = text(firstMatch(html, /id=["']chapter-heading["'][^>]*>([\s\S]*?)<\/h[1-6]>/i) || firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || '');
  const navHeader = firstMatch(html, /<[^>]+\bid=["']manga-reading-nav-head["'][^>]*>/i, 0) || '';
  const current = firstMatch(html, /<input\b[^>]*\bid=["']wp-manga-current-chap["'][^>]*>/i, 0) || '';
  const chapter = attr(navHeader, 'data-chapter') || attr(current, 'value') || slugFromUrl(url);
  const mangaId = toInt(attr(navHeader, 'data-id') || firstMatch(html, /var\s+manga\s*=\s*\{[\s\S]*?"manga_id"\s*:\s*"?(\d+)/i));
  const chapterId = toInt(attr(current, 'data-id'));
  const volumeId = toInt(firstMatch(html, /class=["'][^"']*chapter-selection[^"']*["'][^>]*data-vol=["'](\d+)["']/i));
  const readingCandidates = elementBlocks(html, 'div', 'reading-content');
  const readingBlock = readingCandidates.find((block) => /id=["']wp-manga-current-chap["']/i.test(block)) || readingCandidates[0] || '';
  const contentHtml = readingBlock.replace(/<input\b[^>]*>/gi, '').trim();
  const paragraphs = allMatches(readingBlock, /<p\b[^>]*>([\s\S]*?)<\/p>/gi).map(text).filter(Boolean);
  const content = paragraphs.length ? paragraphs.join('\n\n') : text(readingBlock);
  const prev = safeUrl(firstMatch(html, /<div\b[^>]*class=["'][^"']*nav-previous[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["']/i), base);
  const next = safeUrl(firstMatch(html, /<div\b[^>]*class=["'][^"']*nav-next[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["']/i), base);
  const title = text(firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || '');
  const wrapperTag = firstMatch(html, /<div\b[^>]*class=["'][^"']*\breading-content-wrap\b[^"']*["'][^>]*>/i, 0) || '';
  const siteUrl = safeUrl(attr(wrapperTag, 'data-site-url'), base);
  return {
    url: safeUrl(url, base),
    title: heading || title || null,
    chapter,
    chapterId,
    mangaId,
    volumeId,
    content,
    paragraphs,
    contentHtml,
    previous: prev,
    next,
    siteUrl,
    raw: { source: 'html-public', hasReadingContent: Boolean(readingBlock) }
  };
}

function parseHover(html, base) {
  const postId = toInt(firstMatch(html, /id=["']manga-hover-(\d+)["']/i));
  const url = safeUrl(firstMatch(html, /<a\b[^>]*href=["']([^"']+)["'][^>]*title=/i), base);
  const title = text(firstMatch(html, /<div\b[^>]*class=["'][^"']*post-title[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) || '');
  const rating = toFloat(firstMatch(html, /class=["'][^"']*total_votes[^"']*["'][^>]*>([\s\S]*?)<\//i));
  const getItem = (name) => text(firstMatch(html, new RegExp(`class=["'][^"']*item_${name}[^"']*["'][\\s\\S]*?summary-content[^>]*>([\\s\\S]*?)<\\/div>`, 'i')) || '');
  const linksIn = (name) => extractLinks(firstMatch(html, new RegExp(`class=["'][^"']*item_${name}[^"']*["'][\\s\\S]*?summary-content[^>]*>([\\s\\S]*?)<\\/div>`, 'i')) || '', base);
  const summary = getItem('summary');
  return {
    id: postId,
    title: title || null,
    url,
    image: imageFromBlock(html, base),
    rating,
    rank: getItem('rank') || null,
    alternative: getItem('alternative') || null,
    authors: linksIn('authors'),
    artists: linksIn('artists'),
    genres: linksIn('genres'),
    tags: linksIn('tags'),
    summary: summary || null,
    raw: { source: 'ajax-html' }
  };
}

function taxonomyPrefix(kind) {
  const key = String(kind || '').toLowerCase();
  if (key === 'genre' || key === 'genres') return 'novel-genre';
  if (key === 'tag' || key === 'tags') return 'novel-tag';
  if (key === 'author' || key === 'authors') return 'novel-author';
  if (key === 'release' || key === 'releases') return 'novel-release';
  throw new ApiError(`Taxonomy tidak dikenal: ${kind}`);
}

class MeionovelsClient {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
    this.userAgent = options.userAgent || DEFAULT_USER_AGENT;
    this.ajaxUrl = `${this.baseUrl}/wp-admin/admin-ajax.php`;
  }

  url(pathOrUrl, params = null) {
    const u = new URL(pathOrUrl, `${this.baseUrl}/`);
    if (params) for (const [key, value] of Object.entries(params)) if (value != null && value !== '') u.searchParams.set(key, value);
    return u.href;
  }

  async request(pathOrUrl, options = {}) {
    const url = this.url(pathOrUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers = {
      'User-Agent': this.userAgent,
      'Accept': options.accept || 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'Referer': `${this.baseUrl}/`,
      ...(options.headers || {})
    };
    try {
      const response = await fetch(url, { ...options, headers, signal: controller.signal });
      const body = await response.text();
      if (!response.ok) {
        throw new ApiError(`HTTP ${response.status} ${response.statusText}`.trim(), { status: response.status, url, bodyPreview: body.slice(0, 500) });
      }
      return { url, status: response.status, contentType: response.headers.get('content-type'), body };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error?.name === 'AbortError') throw new ApiError(`Timeout setelah ${this.timeoutMs} ms`, { url });
      throw new ApiError(error?.message || String(error), { url });
    } finally {
      clearTimeout(timer);
    }
  }

  async html(pathOrUrl, options = {}) {
    return (await this.request(pathOrUrl, { ...options, accept: 'text/html,application/xhtml+xml' })).body;
  }

  async form(pathOrUrl, data, options = {}) {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(data || {})) {
      if (value == null) continue;
      if (Array.isArray(value)) value.forEach((v) => body.append(key, String(v)));
      else body.set(key, String(value));
    }
    return this.request(pathOrUrl, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', ...(options.headers || {}) },
      ...options
    });
  }

  async ajaxJson(data) {
    const response = await this.form(this.ajaxUrl, data, { accept: 'application/json,text/plain;q=0.9' });
    try { return JSON.parse(response.body); } catch (error) { throw new ApiError('AJAX response bukan JSON yang valid', { url: response.url }); }
  }

  async ajaxHtml(data) {
    return (await this.form(this.ajaxUrl, data, { accept: 'text/html,application/xhtml+xml' })).body;
  }

  async home() {
    const html = await this.html('/');
    const parsed = parseSections(html, this.baseUrl);
    return normalizeResponse({ ok: true, url: this.url('/'), title: text(firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || ''), ...parsed });
  }

  async archive(options = {}) {
    const page = Math.max(1, toInt(options.page, 1));
    const orderby = options.orderby || null;
    let path = options.path || '/novel/';
    if (options.kind && options.slug) path = `/${taxonomyPrefix(options.kind)}/${encodeURIComponent(options.slug)}/`;
    const params = {};
    if (page > 1) params.page = page;
    if (orderby) params.m_orderby = orderby;
    const url = this.url(path, params);
    const html = await this.html(url);
    return normalizeResponse({ ok: true, url, page, orderby, title: text(firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || ''), items: parseCards(html, this.baseUrl), pagination: parsePagination(html, this.baseUrl) });
  }

  async browse(options = {}) { return this.archive(options); }

  async search(keyword, options = {}) {
    const q = String(keyword || options.keyword || '').trim();
    if (!q) throw new ApiError('Keyword search wajib diisi');
    const data = await this.ajaxJson({ action: 'wp-manga-search-manga', title: q });
    const items = asArray(data?.data).map((item) => ({ title: text(item?.title), url: safeUrl(item?.url, this.baseUrl), slug: slugFromUrl(item?.url), type: item?.type || null })).filter((x) => x.title || x.url);
    return normalizeResponse({ ok: data?.success !== false, keyword: q, count: items.length, items });
  }

  async searchPage(keyword, options = {}) {
    const q = String(keyword || options.keyword || '').trim();
    if (!q) throw new ApiError('Keyword search wajib diisi');
    const url = this.url('/', { s: q, post_type: 'wp-manga' });
    const html = await this.html(url);
    return normalizeResponse({ ok: true, keyword: q, url, items: parseCards(html, this.baseUrl), pagination: parsePagination(html, this.baseUrl) });
  }

  async taxonomy(kind, slug, options = {}) {
    if (!slug) throw new ApiError('Slug taxonomy wajib diisi');
    return this.archive({ ...options, kind, slug });
  }

  async taxonomies() {
    const html = await this.html('/');
    const links = extractLinks(html, this.baseUrl);
    const result = { genres: [], tags: [], authors: [], releases: [] };
    for (const link of links) {
      try {
        const path = new URL(link.url).pathname;
        const m = path.match(/^\/(novel-genre|novel-tag|novel-author|novel-release)\/([^/]+)\/?$/i);
        if (!m) continue;
        const key = { 'novel-genre': 'genres', 'novel-tag': 'tags', 'novel-author': 'authors', 'novel-release': 'releases' }[m[1].toLowerCase()];
        if (key) result[key].push({ name: link.title, slug: decodeURIComponent(m[2]), url: link.url });
      } catch {}
    }
    for (const key of Object.keys(result)) {
      const seen = new Set();
      result[key] = result[key].filter((x) => { if (seen.has(x.url)) return false; seen.add(x.url); return true; });
    }
    return { ok: true, ...result };
  }

  async genres() { const data = await this.taxonomies(); return { ok: true, genres: data.genres }; }
  async tags() { const data = await this.taxonomies(); return { ok: true, tags: data.tags }; }
  async authors() { const data = await this.taxonomies(); return { ok: true, authors: data.authors }; }

  async detail(target, options = {}) {
    const input = target || options.url || options.slug;
    if (!input) throw new ApiError('URL atau slug novel wajib diisi');
    const url = /^https?:\/\//i.test(input) ? safeUrl(input, this.baseUrl) : this.url(`/novel/${String(input).replace(/^\/+|\/+$/g, '')}/`);
    const html = await this.html(url);
    const detail = parseDetail(html, url, this.baseUrl);
    if (options.chapters || options.includeChapters) {
      const chapters = await this.chapters(url, { page: options.page || 1 });
      detail.chapters = chapters.chapters;
      detail.chapterPages = chapters.pagination;
      detail.chapterVersions = chapters.versions;
    }
    return normalizeResponse({ ok: true, ...detail });
  }

  async chapters(target, options = {}) {
    const input = target || options.url || options.slug;
    if (!input) throw new ApiError('URL atau slug novel wajib diisi');
    const detailUrl = /^https?:\/\//i.test(input) ? safeUrl(input, this.baseUrl) : this.url(`/novel/${String(input).replace(/^\/+|\/+$/g, '')}/`);
    const page = Math.max(1, toInt(options.page, 1));
    const endpoint = `${detailUrl.replace(/\/+$/, '')}/ajax/chapters/?t=${page}`;
    const html = await this.html(endpoint, { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    return normalizeResponse({ ok: true, novelUrl: detailUrl, endpoint, ...parseChapterList(html, this.baseUrl, page) });
  }

  async allChapters(target, options = {}) {
    const maxPages = Math.max(1, Math.min(100, toInt(options.maxPages, 100)));
    const firstPage = Math.max(1, toInt(options.page, 1));
    const pages = [];
    const seen = new Set();
    let page = firstPage;
    for (let i = 0; i < maxPages; i += 1) {
      const result = await this.chapters(target, { page });
      pages.push(result);
      let added = 0;
      for (const chapter of result.chapters) {
        const key = chapter.url || `${chapter.version}:${chapter.title}`;
        if (!seen.has(key)) { seen.add(key); added += 1; }
      }
      if (result.count === 0 || added === 0) break;
      if (!result.pagination.next && result.pagination.pages.length === 0) break;
      page += 1;
    }
    const chapters = pages.flatMap((p) => p.chapters);
    const uniqueChapters = chapters.filter((x, index, all) => {
      const key = x.url || `${x.version}:${x.title}`;
      return all.findIndex((y) => (y.url || `${y.version}:${y.title}`) === key) === index;
    });
    return normalizeResponse({ ok: true, novelUrl: pages[0]?.novelUrl || null, pagesFetched: pages.length, count: uniqueChapters.length, chapters: uniqueChapters });
  }

  async chapter(target, options = {}) {
    const input = target || options.url;
    if (!input) throw new ApiError('URL chapter wajib diisi');
    const url = safeUrl(input, this.baseUrl);
    const html = await this.html(url);
    return normalizeResponse({ ok: true, ...parseReader(html, url, this.baseUrl) });
  }

  async read(target, options = {}) { return this.chapter(target, options); }

  async readingNav(options = {}) {
    const manga = options.manga || options.mangaId;
    const chapter = options.chapter || 'chapter-1';
    if (!manga) throw new ApiError('manga/post ID wajib diisi');
    const html = await this.ajaxHtml({ action: 'manga_get_reading_nav', manga, chapter, volume_id: options.volumeId || options.volume_id || 0, style: options.style || '', type: options.type || 'content' });
    const optionsList = [];
    const re = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
    let m;
    while ((m = re.exec(html))) {
      const a = attrs(m[1]);
      optionsList.push({ value: a.value || null, title: text(m[2]), redirect: safeUrl(a['data-redirect'], this.baseUrl), navigation: a['data-navigation'] || null, limit: toInt(a['data-limit']) });
    }
    return normalizeResponse({ ok: true, manga: toInt(manga, manga), chapter, count: optionsList.length, options: optionsList });
  }

  async hover(postId, options = {}) {
    const id = postId || options.postid || options.postId;
    if (!id) throw new ApiError('postid wajib diisi');
    const html = await this.ajaxHtml({ action: 'madara_hover_load_post', postid: id });
    return normalizeResponse({ ok: true, ...parseHover(html, this.baseUrl) });
  }
}

const client = new MeionovelsClient();

module.exports = {
  ApiError,
  MeionovelsClient,
  home: (...a) => client.home(...a),
  archive: (...a) => client.archive(...a),
  browse: (...a) => client.browse(...a),
  search: (...a) => client.search(...a),
  searchPage: (...a) => client.searchPage(...a),
  taxonomy: (...a) => client.taxonomy(...a),
  taxonomies: (...a) => client.taxonomies(...a),
  genres: (...a) => client.genres(...a),
  tags: (...a) => client.tags(...a),
  authors: (...a) => client.authors(...a),
  detail: (...a) => client.detail(...a),
  chapters: (...a) => client.chapters(...a),
  allChapters: (...a) => client.allChapters(...a),
  chapter: (...a) => client.chapter(...a),
  read: (...a) => client.read(...a),
  readingNav: (...a) => client.readingNav(...a),
  hover: (...a) => client.hover(...a)
};




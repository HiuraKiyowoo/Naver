import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { getDetail, getChapters } from '../lib/api';

const Shimmer = () => <div className="absolute inset-0 w-[200%] animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" style={{transform:'translate3d(-100%,0,0) skewX(-20deg)'}} />;
const slugOf = (url) => { try { return new URL(url).pathname.split("/").filter(Boolean).pop() || url; } catch { return url; } };

const Novel = () => {
  const { slug } = useParams();
  const navigate  = useNavigate();
  const [novel,    setNovel]    = useState(null);
  const [chapters, setChapters] = useState([]);
  const [chapPage, setChapPage] = useState(1);
  const [chapPag,  setChapPag]  = useState({});
  const [isLoading,   setIsLoading]   = useState(true);
  const [loadingChap, setLoadingChap] = useState(false);
  const [search,   setSearch]   = useState('');
  const [tab,      setTab]      = useState('info');

  useEffect(() => {
    window.scrollTo(0, 0);
    setIsLoading(true);
    getDetail(slug)
      .then(setNovel)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [slug]);

  useEffect(() => {
    if (tab !== 'chapters') return;
    setLoadingChap(true);
    getChapters(slug, chapPage)
      .then(data => { setChapters(prev => chapPage === 1 ? data.chapters : [...prev, ...data.chapters]); setChapPag(data.pagination || {}); })
      .catch(() => {})
      .finally(() => setLoadingChap(false));
  }, [slug, chapPage, tab]);

  const filtered = chapters.filter(ch => !search || ch.title?.toLowerCase().includes(search.toLowerCase()));

  if (isLoading) return (
    <div className="min-h-screen bg-[#0a0a0c] text-white">
      <Navbar />
      <div className="pt-24 max-w-3xl mx-auto px-6 pb-24">
        <div className="w-full h-64 bg-[#16161a] rounded-2xl relative overflow-hidden mb-6"><Shimmer /></div>
        <div className="w-2/3 h-8 bg-[#16161a] rounded mb-3 relative overflow-hidden"><Shimmer /></div>
      </div>
    </div>
  );

  if (!novel) return (
    <div className="min-h-screen bg-[#0a0a0c] text-white flex items-center justify-center">
      <p className="text-white/40 font-bold">Novel tidak ditemukan</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0c] font-nunito text-white pb-24">
      <style>{`@keyframes shimmer{0%{transform:translate3d(-100%,0,0) skewX(-20deg)}100%{transform:translate3d(200%,0,0) skewX(-20deg)}} body,html{background-color:#0a0a0c!important;margin:0;padding:0} .chap-scroll::-webkit-scrollbar{width:4px} .chap-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:4px}`}</style>
      <Navbar />

      <div className="pt-20 max-w-3xl mx-auto px-4 md:px-6">
        {/* Cover + Info Card */}
        <div className="relative bg-[#16161a] rounded-2xl border border-white/5 overflow-hidden mb-6 shadow-2xl">
          {novel.cover && (
            <div className="absolute inset-0">
              <img src={novel.cover} className="w-full h-full object-cover blur-xl opacity-20" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#16161a] via-[#16161a]/70 to-transparent" />
            </div>
          )}
          <div className="relative z-10 p-6 flex flex-col md:flex-row gap-5 items-center md:items-start">
            {novel.cover && <img src={novel.cover} className="w-28 md:w-40 aspect-[3/4.2] object-cover rounded-xl shadow-2xl shrink-0" />}
            <div className="flex flex-col flex-1 text-center md:text-left gap-2">
              {novel.type && <span className="text-[#F6CF80] text-[9px] font-black uppercase tracking-widest">{novel.type}</span>}
              <h1 className="text-xl md:text-2xl font-black text-white leading-tight">{novel.title}</h1>
              {novel.alternative && <p className="text-white/40 text-xs font-medium italic">{novel.alternative}</p>}
              <div className="flex flex-wrap gap-1.5 justify-center md:justify-start">
                {novel.status && <span className={`text-[8px] font-black px-2 py-0.5 rounded-sm uppercase ${novel.status.toLowerCase().includes('ongoing') ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/60'}`}>{novel.status}</span>}
                {novel.rating && <span className="text-[8px] font-black px-2 py-0.5 rounded-sm bg-[#F6CF80]/20 text-[#F6CF80]">★ {novel.rating} ({novel.ratingCount || 0} votes)</span>}
                {novel.chapterCount && <span className="text-[8px] font-black px-2 py-0.5 rounded-sm bg-white/10 text-white/60">{novel.chapterCount} Chapter</span>}
              </div>
              {novel.authors?.length > 0 && <p className="text-white/40 text-[10px] font-bold">Author: {novel.authors.map(a => a.title).join(', ')}</p>}
              {novel.release?.length > 0 && <p className="text-white/30 text-[10px] font-bold">Release: {novel.release.map(r => r.title).join(", ")}</p>}
              <div className="flex gap-2 justify-center md:justify-start mt-2 flex-wrap">
                {novel.firstChapter && (
                  <button onClick={() => navigate(`/read?url=${encodeURIComponent(novel.firstChapter)}`)} className="h-9 px-5 bg-[#F6CF80] hover:bg-[#ebd59b] text-black rounded-lg font-black text-xs flex items-center gap-2 transition-colors">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    Baca Pertama
                  </button>
                )}
                {novel.lastChapter && (
                  <button onClick={() => navigate(`/read?url=${encodeURIComponent(novel.lastChapter)}`)} className="h-9 px-5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg font-black text-xs transition-colors">
                    Bab Terbaru
                  </button>
                )}
                <button onClick={() => { setTab('chapters'); }} className="h-9 px-5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg font-black text-xs transition-colors">
                  Chapter List
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          {['info','chapters'].map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-5 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${tab === t ? 'bg-[#F6CF80] text-black' : 'bg-white/5 border border-white/10 text-white/50 hover:text-white'}`}>
              {t === 'info' ? 'Info' : 'Chapters'}
            </button>
          ))}
        </div>

        {/* Info Tab */}
        {tab === 'info' && (
          <div className="flex flex-col gap-4">
            {/* Summary */}
            {novel.summary?.text && (
              <div className="bg-[#16161a] rounded-2xl border border-white/5 p-5">
                <h3 className="text-white font-black text-sm uppercase mb-3">Sinopsis</h3>
                <p className="text-white/60 text-sm leading-relaxed">{novel.summary.text}</p>
              </div>
            )}
            {/* Genres */}
            {novel.genres?.length > 0 && (
              <div className="bg-[#16161a] rounded-2xl border border-white/5 p-5">
                <h3 className="text-white font-black text-sm uppercase mb-3">Genre</h3>
                <div className="flex flex-wrap gap-2">
                  {novel.genres.map(g => (
                    <button key={g.url} onClick={() => navigate(`/browse?tab=genre&slug=${slugOf(g.url)}`)} className="px-3 py-1.5 bg-white/5 border border-white/10 text-white/60 text-[10px] font-bold rounded-lg hover:border-[#F6CF80]/40 hover:text-[#F6CF80] transition-all">
                      {g.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Tags */}
            {novel.tags?.length > 0 && (
              <div className="bg-[#16161a] rounded-2xl border border-white/5 p-5">
                <h3 className="text-white font-black text-sm uppercase mb-3">Tag</h3>
                <div className="flex flex-wrap gap-2">
                  {novel.tags.map(t => (
                    <button key={t.url} onClick={() => navigate(`/browse?tab=tag&slug=${slugOf(t.url)}`)} className="px-3 py-1.5 bg-white/5 border border-white/10 text-white/50 text-[10px] font-bold rounded-lg hover:border-white/30 hover:text-white transition-all">
                      #{t.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Authors */}
            {novel.authors?.length > 0 && (
              <div className="bg-[#16161a] rounded-2xl border border-white/5 p-5">
                <h3 className="text-white font-black text-sm uppercase mb-3">Author</h3>
                <div className="flex flex-wrap gap-2">
                  {novel.authors.map(a => (
                    <button key={a.url} onClick={() => navigate(`/browse?tab=author&slug=${slugOf(a.url)}`)} className="px-3 py-1.5 bg-white/5 border border-white/10 text-white/60 text-[10px] font-bold rounded-lg hover:border-[#F6CF80]/40 hover:text-[#F6CF80] transition-all">
                      {a.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Chapters Tab */}
        {tab === 'chapters' && (
          <div className="bg-[#16161a] rounded-2xl border border-white/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-black text-sm uppercase">Daftar Chapter</h3>
              <span className="text-white/30 text-[10px] font-bold">{chapters.length} loaded</span>
            </div>
            <input type="text" placeholder="Cari chapter..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-[#0a0a0c] border border-white/10 rounded-lg px-4 py-2.5 text-white text-xs font-bold placeholder-white/20 outline-none focus:border-[#F6CF80]/50 mb-4 transition-colors" />
            <div className="flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto chap-scroll pr-1">
              {filtered.map((ch, i) => (
                <button key={ch.url || i} onClick={() => navigate(`/read?url=${encodeURIComponent(ch.url)}`)} className="flex items-center justify-between w-full px-4 py-3 rounded-xl bg-[#0a0a0c] border border-white/5 hover:border-[#F6CF80]/40 hover:bg-[#F6CF80]/5 text-left transition-all group">
                  <div className="flex flex-col">
                    <span className="text-white text-xs font-bold line-clamp-1 group-hover:text-[#F6CF80] transition-colors">{ch.title}</span>
                    {ch.date && <span className="text-white/30 text-[9px] font-bold mt-0.5">{ch.date}</span>}
                  </div>
                  <svg className="w-4 h-4 text-white/20 group-hover:text-[#F6CF80] transition-colors shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                </button>
              ))}
              {filtered.length === 0 && !loadingChap && <p className="text-white/30 text-xs font-bold text-center py-8">Tidak ada chapter</p>}
              {loadingChap && <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-[#F6CF80]/30 border-t-[#F6CF80] rounded-full animate-spin" /></div>}
            </div>
            {chapPag.hasNext && !loadingChap && (
              <button onClick={() => setChapPage(p => p + 1)} className="w-full mt-4 py-3 bg-white/5 border border-white/10 text-white font-black text-xs rounded-xl hover:bg-white/10 transition-all">
                Load More
              </button>
            )}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default Novel;

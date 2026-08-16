import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { getDetail } from '../lib/api';

const Shimmer = () => <div className="absolute top-0 bottom-0 left-0 w-[150%] animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent z-10" style={{ transform: 'translate3d(-100%,0,0) skewX(-20deg)' }} />;

const Series = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [novel, setNovel]     = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch]   = useState('');

  useEffect(() => {
    window.scrollTo(0, 0);
    setIsLoading(true);
    getDetail(id).then(setNovel).catch(() => {}).finally(() => setIsLoading(false));
  }, [id]);

  const filtered = novel?.chapters?.filter(ch =>
    ch.title.toLowerCase().includes(search.toLowerCase())
  ) || [];

  if (isLoading) return (
    <div className="min-h-screen bg-[#0a0a0c] text-white">
      <Navbar />
      <div className="pt-24 max-w-3xl mx-auto px-6 pb-24">
        <div className="w-full h-64 bg-[#16161a] rounded-xl relative overflow-hidden mb-6"><Shimmer /></div>
        <div className="w-2/3 h-8 bg-[#16161a] rounded mb-3 relative overflow-hidden"><Shimmer /></div>
        <div className="w-1/2 h-4 bg-[#16161a] rounded relative overflow-hidden"><Shimmer /></div>
      </div>
    </div>
  );

  if (!novel) return (
    <div className="min-h-screen bg-[#0a0a0c] text-white flex items-center justify-center">
      <p className="text-white/40 font-bold">Novel tidak ditemukan</p>
    </div>
  );

  const firstChapter = novel.chapters?.[0];
  const lastChapter  = novel.chapters?.[novel.chapters.length - 1];

  return (
    <div className="min-h-screen bg-[#0a0a0c] font-nunito text-white pb-24">
      <style>{`
        @keyframes shimmer { 0%{transform:translate3d(-100%,0,0) skewX(-20deg)} 100%{transform:translate3d(200%,0,0) skewX(-20deg)} }
        body,html{background-color:#0a0a0c!important;color:white;margin:0;padding:0}
        .chap-scroll::-webkit-scrollbar{width:4px} .chap-scroll::-webkit-scrollbar-track{background:transparent} .chap-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:4px}
      `}</style>
      <Navbar />

      <div className="pt-20 max-w-3xl mx-auto px-4 md:px-6">
        {/* Cover + Info */}
        <div className="relative bg-[#16161a] rounded-2xl border border-white/5 overflow-hidden mb-6 shadow-2xl">
          {novel.cover && (
            <div className="absolute inset-0">
              <img src={novel.cover} className="w-full h-full object-cover blur-md opacity-20" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#16161a] via-[#16161a]/80 to-transparent" />
            </div>
          )}
          <div className="relative z-10 p-6 flex flex-col md:flex-row gap-6 items-center md:items-start">
            {novel.cover && (
              <img src={novel.cover} className="w-32 md:w-44 aspect-[3/4.2] object-cover rounded-xl shadow-2xl shrink-0" />
            )}
            <div className="flex flex-col flex-1 text-center md:text-left">
              <h1 className="text-xl md:text-2xl font-black text-white mb-3 leading-tight">{novel.title}</h1>
              <div className="flex flex-wrap gap-2 justify-center md:justify-start mb-4">
                <span className="bg-[#F6CF80] text-black text-[9px] px-2.5 py-1 rounded-sm font-black uppercase">{novel.totalChapters} Chapter</span>
              </div>
              <div className="flex gap-3 justify-center md:justify-start flex-wrap">
                {firstChapter && (
                  <button onClick={() => navigate(`/read/${firstChapter.id}`)} className="h-9 px-5 bg-[#F6CF80] hover:bg-[#ebd59b] text-black rounded-lg font-black text-xs flex items-center gap-2 transition-colors">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
                    Chapter Pertama
                  </button>
                )}
                {lastChapter && (
                  <button onClick={() => navigate(`/read/${lastChapter.id}`)} className="h-9 px-5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg font-black text-xs flex items-center gap-2 transition-colors">
                    Chapter Terbaru
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Chapter list */}
        <div className="bg-[#16161a] rounded-2xl border border-white/5 p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-black uppercase text-sm tracking-wider">Daftar Chapter</h2>
            <span className="text-white/40 text-[10px] font-bold">{novel.totalChapters} chapter</span>
          </div>
          {/* Search chapter */}
          <input
            type="text"
            placeholder="Cari chapter..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#0a0a0c] border border-white/10 rounded-lg px-4 py-2.5 text-white text-xs font-bold placeholder-white/20 outline-none focus:border-[#F6CF80]/50 mb-4 transition-colors"
          />
          <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto chap-scroll pr-1">
            {filtered.map(ch => (
              <button
                key={ch.id}
                onClick={() => navigate(`/read/${ch.id}`)}
                className="flex items-center justify-between w-full px-4 py-3 rounded-xl bg-[#0a0a0c] border border-white/5 hover:border-[#F6CF80]/40 hover:bg-[#F6CF80]/5 text-left transition-all group"
              >
                <div className="flex flex-col">
                  <span className="text-white text-xs font-bold line-clamp-1 group-hover:text-[#F6CF80] transition-colors">{ch.title}</span>
                  {ch.date && <span className="text-white/30 text-[9px] font-bold mt-0.5">{new Date(ch.date).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })}</span>}
                </div>
                {ch.premium
                  ? <span className="text-[#F6CF80] text-[8px] font-black px-1.5 py-0.5 border border-[#F6CF80]/30 rounded-sm shrink-0">PREMIUM</span>
                  : <svg className="w-4 h-4 text-white/20 group-hover:text-[#F6CF80] transition-colors shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                }
              </button>
            ))}
            {filtered.length === 0 && <p className="text-white/30 text-xs font-bold text-center py-8">Tidak ada chapter ditemukan</p>}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Series;

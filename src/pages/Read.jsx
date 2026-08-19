import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getChapter } from '../lib/api';

const Read = () => {
  const [searchParams] = useSearchParams();
  const chapterUrl = searchParams.get('url');
  const navigate   = useNavigate();

  const [chapter,  setChapter]  = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fontSize, setFontSize] = useState(() => parseInt(localStorage.getItem('meio_fontsize') || '16'));
  const [showNav,  setShowNav]  = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    if (!chapterUrl) return;
    window.scrollTo(0, 0);
    setIsLoading(true);
    setChapter(null);
    getChapter(chapterUrl)
      .then(ch => { setChapter(ch); document.title = `${ch.title || 'Chapter'} - Naver Novel`; })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [chapterUrl]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setShowNav(y < lastScrollY.current || y < 100);
      lastScrollY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const changeFontSize = (delta) => {
    const next = Math.min(22, Math.max(13, fontSize + delta));
    setFontSize(next);
    localStorage.setItem('meio_fontsize', next);
  };

  const goTo = (url) => url && navigate(`/read?url=${encodeURIComponent(url)}`);

  return (
    <div className="min-h-screen bg-[#0e0e10] font-nunito text-white pb-32">
      <style>{`body,html{background-color:#0e0e10!important;color:white;margin:0;padding:0}`}</style>

      {/* Top bar */}
      <div className={`fixed top-0 inset-x-0 z-50 transition-transform duration-300 ${showNav ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="bg-[#0e0e10]/95 border-b border-white/5 px-4 py-3 flex items-center gap-3">
          <button onClick={() => chapter?.novelUrl ? navigate(`/novel/${chapter.novelUrl.split('/novel/')[1]?.replace(/\/+$/,'')}`) : navigate(-1)} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/5 border border-white/10 hover:bg-[#F6CF80] hover:text-black hover:border-[#F6CF80] transition-colors shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-xs line-clamp-1">{chapter?.title || '...'}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => changeFontSize(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white text-xs font-black">A-</button>
            <button onClick={() => changeFontSize(1)}  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white text-sm font-black">A+</button>
          </div>
        </div>
      </div>

      <div className="pt-16 max-w-2xl mx-auto px-5 md:px-8">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-10 h-10 border-2 border-[#F6CF80]/30 border-t-[#F6CF80] rounded-full animate-spin" />
            <p className="text-white/30 text-xs font-bold">Memuat chapter...</p>
          </div>
        ) : !chapter ? (
          <div className="flex flex-col items-center justify-center py-32">
            <p className="text-white/40 font-bold">Chapter tidak ditemukan</p>
            <button onClick={() => navigate(-1)} className="mt-4 px-5 py-2 bg-white/5 border border-white/10 text-white rounded-lg font-black text-xs">Kembali</button>
          </div>
        ) : (
          <>
            {/* Title */}
            <div className="py-8 border-b border-white/5 mb-8">
              <h1 className="text-xl md:text-2xl font-black text-white leading-tight">{chapter.title}</h1>
            </div>

            {/* Content */}
            {chapter.content ? (
              <div style={{ fontSize: `${fontSize}px` }}>
                {chapter.content.split('\n\n').map((para, i) => (
                  <p key={i} className="text-white/80 leading-relaxed mb-5">{para}</p>
                ))}
              </div>
            ) : (
              <p className="text-white/30 italic text-center py-16">Konten tidak tersedia atau memerlukan akses khusus.</p>
            )}

            {/* Navigation */}
            <div className="mt-12 flex gap-3">
              <button onClick={() => goTo(chapter.previous)} disabled={!chapter.previous} className="flex-1 flex items-center justify-center gap-2 border border-white/20 py-3 rounded-xl transition-all disabled:opacity-30 text-white hover:bg-white/5">
                <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                <span className="text-xs font-black">Sebelumnya</span>
              </button>
              <button onClick={() => chapter?.novelUrl ? navigate(`/novel/${chapter.novelUrl.split('/novel/')[1]?.replace(/\/+$/,'')}`) : navigate(-1)} className="w-12 flex items-center justify-center bg-white/5 border border-white/20 rounded-xl hover:bg-white/10">
                <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
              </button>
              <button onClick={() => goTo(chapter.next)} disabled={!chapter.next} className="flex-1 flex items-center justify-center gap-2 border border-[#F6CF80]/40 py-3 rounded-xl transition-all disabled:opacity-30 text-[#F6CF80] hover:bg-[#F6CF80]/10">
                <span className="text-xs font-black">Selanjutnya</span>
                <svg className="w-4 h-4 text-[#F6CF80]/50" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Read;

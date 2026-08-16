import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getChapter, getDetail } from '../lib/api';

const Read = () => {
  const { postId } = useParams();
  const navigate   = useNavigate();
  const [chapter, setChapter]   = useState(null);
  const [novel,   setNovel]     = useState(null);
  const [chapters, setChapters] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fontSize, setFontSize] = useState(() => parseInt(localStorage.getItem('fuyu_fontsize') || '16'));
  const [showNav, setShowNav]   = useState(true);
  const lastScrollY = useRef(0);
  const topRef = useRef(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    setIsLoading(true);
    setChapter(null);
    getChapter(postId)
      .then(async ch => {
        setChapter(ch);
        document.title = `${ch.title} - Fuyu Novel`;
        // Cari novel dari categories
        const res = await fetch(`/api/wp-json/wp/v2/posts/${postId}?_fields=categories`).then(r => r.json());
        const catId = res?.categories?.[0];
        if (catId) {
          const detail = await getDetail(catId);
          setNovel(detail);
          setChapters(detail.chapters || []);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [postId]);

  // Hide/show nav on scroll
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
    localStorage.setItem('fuyu_fontsize', next);
  };

  const currentIdx = chapters.findIndex(ch => ch.id === parseInt(postId));
  const prevChapter = currentIdx > 0 ? chapters[currentIdx - 1] : null;
  const nextChapter = currentIdx < chapters.length - 1 ? chapters[currentIdx + 1] : null;

  return (
    <div className="min-h-screen bg-[#0e0e10] font-nunito text-white pb-32">
      <style>{`
        body,html{background-color:#0e0e10!important;color:white;margin:0;padding:0}
        .prose p { margin-bottom: 1.25em; line-height: 1.85; }
      `}</style>

      {/* Top bar */}
      <div className={`fixed top-0 inset-x-0 z-50 transition-transform duration-300 ${showNav ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="bg-[#0e0e10]/95 border-b border-white/5 px-4 py-3 flex items-center gap-3">
          <button onClick={() => novel ? navigate(`/novel/${novel.id}`) : navigate(-1)} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/5 border border-white/10 hover:bg-[#F6CF80] hover:text-black hover:border-[#F6CF80] transition-colors shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
          </button>
          <div className="flex-1 min-w-0">
            {novel && <p className="text-white/40 text-[9px] font-bold uppercase tracking-widest line-clamp-1">{novel.title}</p>}
            <p className="text-white font-bold text-xs line-clamp-1">{chapter?.title || '...'}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => changeFontSize(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white text-xs font-black transition-colors">A-</button>
            <button onClick={() => changeFontSize(1)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white text-sm font-black transition-colors">A+</button>
          </div>
        </div>
      </div>

      <div ref={topRef} className="pt-16 max-w-2xl mx-auto px-5 md:px-8">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-10 h-10 border-2 border-[#F6CF80]/30 border-t-[#F6CF80] rounded-full animate-spin" />
            <p className="text-white/30 text-xs font-bold">Memuat chapter...</p>
          </div>
        ) : !chapter ? (
          <div className="flex flex-col items-center justify-center py-32">
            <p className="text-white/40 font-bold">Chapter tidak ditemukan</p>
          </div>
        ) : chapter.premium ? (
          <div className="flex flex-col items-center justify-center py-32 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[#F6CF80]/10 flex items-center justify-center border border-[#F6CF80]/20">
              <svg className="w-8 h-8 text-[#F6CF80]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/></svg>
            </div>
            <div>
              <h2 className="text-white font-black text-lg mb-2">Konten Premium</h2>
              <p className="text-white/40 text-sm font-medium">Chapter ini hanya tersedia untuk supporter Fuyu Novel di Trakteer.</p>
            </div>
            <a href="https://trakteer.id/fuyunovel" target="_blank" rel="noopener noreferrer" className="mt-2 px-6 py-3 bg-[#F6CF80] text-black rounded-xl font-black text-sm hover:bg-[#ebd59b] transition-colors">
              Dukung di Trakteer
            </a>
          </div>
        ) : (
          <>
            {/* Title */}
            <div className="py-8 border-b border-white/5 mb-8">
              {novel && <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest mb-2">{novel.title}</p>}
              <h1 className="text-xl md:text-2xl font-black text-white leading-tight">{chapter.title}</h1>
              {chapter.date && <p className="text-white/30 text-[10px] font-bold mt-2">{new Date(chapter.date).toLocaleDateString('id-ID', { year:'numeric', month:'long', day:'numeric' })}</p>}
            </div>

            {/* Content */}
            <div className="prose prose-invert max-w-none" style={{ fontSize: `${fontSize}px` }}>
              {chapter.content
                ? chapter.content.split('\n\n').map((para, i) => (
                    <p key={i} className="text-white/80 leading-relaxed mb-5">{para}</p>
                  ))
                : <p className="text-white/30 italic">Konten tidak tersedia.</p>
              }
            </div>
          </>
        )}

        {/* Navigation */}
        {!isLoading && chapter && (
          <div className="mt-12 flex flex-col gap-3">
            <div className="flex gap-3">
              <button
                onClick={() => prevChapter && navigate(`/read/${prevChapter.id}`)}
                disabled={!prevChapter}
                className="flex-1 flex items-center justify-center gap-2 bg-transparent hover:bg-white/5 border border-white/20 py-3 rounded-xl transition-all disabled:opacity-30 text-white"
              >
                <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                <span className="text-xs font-black">Sebelumnya</span>
              </button>
              <button
                onClick={() => novel && navigate(`/novel/${novel.id}`)}
                className="w-12 flex items-center justify-center bg-white/5 border border-white/20 rounded-xl transition-all hover:bg-white/10"
              >
                <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
              </button>
              <button
                onClick={() => nextChapter && navigate(`/read/${nextChapter.id}`)}
                disabled={!nextChapter}
                className="flex-1 flex items-center justify-center gap-2 bg-transparent hover:bg-[#F6CF80]/10 border border-[#F6CF80]/40 py-3 rounded-xl transition-all disabled:opacity-30 text-[#F6CF80]"
              >
                <span className="text-xs font-black">Selanjutnya</span>
                <svg className="w-4 h-4 text-[#F6CF80]/50" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
              </button>
            </div>

            {/* Chapter list preview */}
            {chapters.length > 0 && (
              <div className="bg-[#16161a] rounded-2xl border border-white/5 p-4 mt-4">
                <p className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-3">Chapter Lainnya</p>
                <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                  {chapters.slice(Math.max(0, currentIdx - 3), currentIdx + 6).map(ch => (
                    <button key={ch.id} onClick={() => navigate(`/read/${ch.id}`)} className={`text-left px-3 py-2 rounded-lg text-xs font-bold transition-all ${ch.id === parseInt(postId) ? 'bg-[#F6CF80] text-black' : 'text-white/50 hover:bg-white/5 hover:text-white'}`}>
                      {ch.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Read;

import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { search, getTags, getLatest } from '../lib/api';

const Shimmer = () => <div className="absolute top-0 bottom-0 left-0 w-[150%] animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent z-10" style={{ transform: 'translate3d(-100%,0,0) skewX(-20deg)' }} />;
const CardSkeleton = () => (
  <div className="w-full flex flex-col gap-2">
    <div className="aspect-[3/4.5] bg-[#16161a] rounded-sm relative overflow-hidden shadow-xl"><Shimmer /></div>
    <div className="w-3/4 h-2.5 bg-[#16161a] rounded-sm relative overflow-hidden"><Shimmer /></div>
  </div>
);

const Explore = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const navigate = useNavigate();

  const [tags,    setTags]    = useState([]);
  const [selTag,  setSelTag]  = useState(null);
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getTags().then(setTags).catch(() => {});
  }, []);

  useEffect(() => {
    setResults([]);
    setIsLoading(true);
    (async () => {
      try {
        if (query) {
          setResults(await search(query));
        } else {
          // Default: latest update
          const latest = await getLatest(1, 40);
          // Deduplicate by novel id
          const seen = new Set();
          const novels = [];
          for (const ch of latest) {
            if (ch.novel && !seen.has(ch.novel.id)) {
              seen.add(ch.novel.id);
              novels.push({ ...ch.novel, latestChapter: ch.title });
            }
          }
          setResults(novels);
        }
      } catch { setResults([]); }
      setIsLoading(false);
    })();
  }, [query, selTag]);

  return (
    <div className="min-h-screen bg-[#0a0a0c] font-nunito selection:bg-[#F6CF80] selection:text-black pb-24">
      <style>{`
        @keyframes shimmer { 0%{transform:translate3d(-100%,0,0) skewX(-20deg)} 100%{transform:translate3d(200%,0,0) skewX(-20deg)} }
        body,html{background-color:#0a0a0c!important;color:white;margin:0;padding:0}
        .no-scrollbar::-webkit-scrollbar{display:none}
      `}</style>
      <Navbar />
      <div className="pt-24 max-w-7xl mx-auto px-6">

        {/* Tags filter */}
        {!query && tags.length > 0 && (
          <div className="mb-8">
            <h2 className="text-white font-black uppercase mb-3 text-sm tracking-wide">Filter Tag</h2>
            <div className="flex overflow-x-auto gap-2 pb-2 no-scrollbar">
              <button onClick={() => setSelTag(null)} className={`px-4 py-2 text-[10px] whitespace-nowrap font-bold rounded-xl transition-colors ${!selTag ? 'bg-[#F6CF80] text-black' : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white'}`}>
                Semua
              </button>
              {tags.map(t => (
                <button key={t.id} onClick={() => setSelTag(t.slug === selTag ? null : t.slug)} className={`px-4 py-2 text-[10px] whitespace-nowrap font-bold rounded-xl transition-colors ${selTag === t.slug ? 'bg-[#F6CF80] text-black' : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white'}`}>
                  {t.title} <span className="opacity-50">({t.count})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {query && (
          <div className="mb-8">
            <h2 className="text-white/40 text-xs font-bold uppercase tracking-widest">Hasil untuk:</h2>
            <span className="text-[#F6CF80] text-2xl font-black uppercase tracking-tighter line-clamp-1">"{query}"</span>
          </div>
        )}

        <div className="grid grid-cols-[repeat(auto-fill,minmax(95px,1fr))] gap-3 px-2">
          {isLoading ? [...Array(18)].map((_, i) => <CardSkeleton key={i} />) :
            results.map((item, i) => (
              <div key={item.id || i} onClick={() => navigate(`/novel/${item.id}`)} className="w-full flex flex-col gap-2 group cursor-pointer active:scale-95 transition-all">
                <div className="relative aspect-[3/4.5] overflow-hidden bg-[#16161a] rounded-sm shadow-xl">
                  {item.cover
                    ? <img src={item.cover} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                    : <div className="w-full h-full flex items-center justify-center text-white/10 text-3xl font-black">{item.title?.[0]}</div>
                  }
                </div>
                <h3 className="text-[9px] font-bold text-white/60 line-clamp-1 group-hover:text-[#F6CF80] transition-colors">{item.title}</h3>
              </div>
            ))
          }
        </div>

        {!isLoading && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-white/40 font-bold text-sm tracking-wide">Tidak ditemukan</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Explore;

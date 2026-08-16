import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getGenres, getTags, novelsByGenre, novelsByTag } from '../lib/api';

const Shimmer = () => <div className="absolute top-0 bottom-0 left-0 w-[150%] animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent z-10" style={{ transform: 'translate3d(-100%,0,0) skewX(-20deg)' }} />;

const CardSkeleton = () => (
  <div className="w-full flex flex-col gap-2">
    <div className="aspect-[3/4.5] bg-[#16161a] rounded-sm relative overflow-hidden"><Shimmer /></div>
    <div className="w-3/4 h-2.5 bg-[#16161a] rounded-sm relative overflow-hidden"><Shimmer /></div>
  </div>
);

const Browse = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab     = searchParams.get('tab') || 'genre';
  const selSlug = searchParams.get('slug') || null;
  const page    = parseInt(searchParams.get('page') || '1');

  const [genres,   setGenres]   = useState([]);
  const [tags,     setTags]     = useState([]);
  const [novels,   setNovels]   = useState([]);
  const [pagination, setPagination] = useState({ hasNext: false, hasPrev: false });
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingMeta, setIsLoadingMeta] = useState(true);

  // Load genres & tags
  useEffect(() => {
    setIsLoadingMeta(true);
    Promise.all([getGenres(), getTags()])
      .then(([g, t]) => { setGenres(g); setTags(t); })
      .catch(() => {})
      .finally(() => setIsLoadingMeta(false));
  }, []);

  // Load novels ketika slug/tab/page berubah
  useEffect(() => {
    if (!selSlug) { setNovels([]); return; }
    setIsLoadingList(true);
    setNovels([]);
    const fn = tab === 'genre' ? novelsByGenre : novelsByTag;
    fn(selSlug, page)
      .then(res => { setNovels(res.novels || []); setPagination(res.pagination || {}); })
      .catch(() => setNovels([]))
      .finally(() => setIsLoadingList(false));
  }, [selSlug, tab, page]);

  const setTab = (t) => setSearchParams({ tab: t });
  const selectSlug = (slug) => setSearchParams({ tab, slug, page: '1' });
  const changePage = (p) => setSearchParams({ tab, slug: selSlug, page: String(p) });

  const items = tab === 'genre' ? genres : tags;
  const selItem = items.find(i => i.slug === selSlug);

  return (
    <div className="min-h-screen bg-[#0a0a0c] font-nunito text-white pb-24">
      <style>{`
        @keyframes shimmer { 0%{transform:translate3d(-100%,0,0) skewX(-20deg)} 100%{transform:translate3d(200%,0,0) skewX(-20deg)} }
        body,html{background-color:#0a0a0c!important;color:white;margin:0;padding:0}
        .no-scrollbar::-webkit-scrollbar{display:none}
      `}</style>
      <Navbar />

      <div className="pt-24 max-w-7xl mx-auto px-6">

        {/* Tab Genre / Tag */}
        <div className="flex gap-2 mb-6">
          {['genre', 'tag'].map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-5 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${tab === t ? 'bg-[#F6CF80] text-black' : 'bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10'}`}>
              {t === 'genre' ? 'Genre' : 'Tag'}
            </button>
          ))}
        </div>

        {/* Grid genre/tag */}
        {isLoadingMeta ? (
          <div className="flex flex-wrap gap-2 mb-8">
            {[...Array(12)].map((_, i) => <div key={i} className="h-8 w-24 bg-[#16161a] rounded-xl relative overflow-hidden"><Shimmer /></div>)}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 mb-8">
            {items.map(item => (
              <button
                key={item.slug}
                onClick={() => selectSlug(item.slug === selSlug ? null : item.slug)}
                className={`px-4 py-2 text-[10px] font-bold rounded-xl transition-all whitespace-nowrap ${selSlug === item.slug ? 'bg-[#F6CF80] text-black shadow-lg shadow-[#F6CF80]/20' : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white'}`}
              >
                {item.name || item.title}
                <span className={`ml-1.5 ${selSlug === item.slug ? 'text-black/50' : 'text-white/20'}`}>({item.count})</span>
              </button>
            ))}
          </div>
        )}

        {/* Hasil novel */}
        {selSlug && (
          <>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-white font-black text-base uppercase tracking-tight">{selItem?.name || selItem?.title}</h2>
                <span className="text-white/30 text-[10px] font-bold uppercase tracking-widest">{selItem?.count} novel</span>
              </div>
              {page > 1 && (
                <span className="text-white/30 text-[10px] font-bold">Halaman {page}</span>
              )}
            </div>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(95px,1fr))] gap-3 px-2">
              {isLoadingList
                ? [...Array(12)].map((_, i) => <CardSkeleton key={i} />)
                : novels.map((novel, i) => (
                    <div
                      key={novel.id || i}
                      onClick={() => navigate(`/novel/${novel.id}`)}
                      className="w-full flex flex-col gap-2 group cursor-pointer active:scale-95 transition-all duration-300"
                    >
                      <div className="relative aspect-[3/4.5] overflow-hidden bg-[#16161a] rounded-sm shadow-xl">
                        {novel.cover
                          ? <img src={novel.cover} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                          : <div className="w-full h-full flex items-center justify-center text-white/10 text-3xl font-black">{novel.title?.[0]}</div>
                        }
                        {novel.score && <div className="absolute top-1 left-1 bg-black/60 text-[#F6CF80] text-[8px] font-black px-1.5 py-0.5 rounded-sm">★ {novel.score}</div>}
                      </div>
                      <h3 className="text-[9px] font-bold text-white/60 line-clamp-1 group-hover:text-[#F6CF80] transition-colors">{novel.title}</h3>
                    </div>
                  ))
              }
            </div>

            {!isLoadingList && novels.length === 0 && (
              <div className="py-24 text-center">
                <p className="text-white/30 font-bold text-sm">Tidak ada novel ditemukan</p>
              </div>
            )}

            {/* Pagination */}
            {!isLoadingList && (pagination.hasNext || pagination.hasPrev) && (
              <div className="flex justify-center gap-3 mt-10">
                <button
                  onClick={() => changePage(page - 1)}
                  disabled={!pagination.hasPrev}
                  className="px-5 py-2.5 bg-[#16161a] border border-white/10 text-white font-black text-xs rounded-xl disabled:opacity-30 hover:border-white/30 transition-all"
                >
                  ← Sebelumnya
                </button>
                <span className="px-5 py-2.5 bg-[#F6CF80] text-black font-black text-xs rounded-xl">
                  {page}
                </span>
                <button
                  onClick={() => changePage(page + 1)}
                  disabled={!pagination.hasNext}
                  className="px-5 py-2.5 bg-[#16161a] border border-white/10 text-white font-black text-xs rounded-xl disabled:opacity-30 hover:border-white/30 transition-all"
                >
                  Selanjutnya →
                </button>
              </div>
            )}
          </>
        )}

        {!selSlug && !isLoadingMeta && (
          <div className="py-16 text-center">
            <p className="text-white/20 font-bold text-sm">Pilih {tab === 'genre' ? 'genre' : 'tag'} di atas untuk melihat novel</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Browse;

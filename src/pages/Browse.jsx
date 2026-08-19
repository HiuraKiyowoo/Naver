import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getTaxonomies, getArchive } from '../lib/api';

const Shimmer = () => <div className="absolute inset-0 w-[200%] animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" style={{transform:'translate3d(-100%,0,0) skewX(-20deg)'}} />;
const CardSkeleton = () => (
  <div className="w-full flex flex-col gap-2">
    <div className="aspect-[3/4.5] bg-[#16161a] rounded-sm relative overflow-hidden"><Shimmer /></div>
    <div className="w-3/4 h-2.5 bg-[#16161a] rounded-sm relative overflow-hidden"><Shimmer /></div>
  </div>
);

const TABS = [
  { key: 'genre',  label: 'Genre' },
  { key: 'tag',    label: 'Tag' },
  { key: 'author', label: 'Author' },
];

const Browse = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab     = searchParams.get('tab') || 'genre';
  const selSlug = searchParams.get('slug') || null;
  const page    = parseInt(searchParams.get('page') || '1');

  const [taxData,  setTaxData]  = useState({ genres: [], tags: [], authors: [] });
  const [novels,   setNovels]   = useState([]);
  const [pagination, setPagination] = useState({});
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingList, setLoadingList] = useState(false);

  useEffect(() => {
    getTaxonomies().then(setTaxData).catch(() => {}).finally(() => setLoadingMeta(false));
  }, []);

  useEffect(() => {
    if (!selSlug) { setNovels([]); return; }
    setLoadingList(true);
    setNovels([]);
    getArchive({ kind: tab, slug: selSlug, page })
      .then(data => { setNovels(data.items || []); setPagination(data.pagination || {}); })
      .catch(() => setNovels([]))
      .finally(() => setLoadingList(false));
  }, [tab, selSlug, page]);

  const items = tab === 'genre' ? taxData.genres : tab === 'tag' ? taxData.tags : taxData.authors;
  const selItem = items.find(i => i.slug === selSlug);

  const setTab  = (t)  => setSearchParams({ tab: t });
  const setSel  = (s)  => setSearchParams({ tab, slug: s === selSlug ? '' : s, page: '1' });
  const setPage = (p)  => setSearchParams({ tab, slug: selSlug, page: String(p) });

  return (
    <div className="min-h-screen bg-[#0a0a0c] font-nunito text-white pb-24">
      <style>{`@keyframes shimmer{0%{transform:translate3d(-100%,0,0) skewX(-20deg)}100%{transform:translate3d(200%,0,0) skewX(-20deg)}} body,html{background-color:#0a0a0c!important;margin:0;padding:0}`}</style>
      <Navbar />
      <div className="pt-24 max-w-7xl mx-auto px-6">

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-5 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${tab === t.key ? 'bg-[#F6CF80] text-black' : 'bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Items grid */}
        {loadingMeta ? (
          <div className="flex flex-wrap gap-2 mb-8">{[...Array(12)].map((_, i) => <div key={i} className="h-8 w-24 bg-[#16161a] rounded-xl relative overflow-hidden"><Shimmer /></div>)}</div>
        ) : (
          <div className="flex flex-wrap gap-2 mb-8">
            {items.map(item => (
              <button key={item.slug} onClick={() => setSel(item.slug)} className={`px-4 py-2 text-[10px] font-bold rounded-xl transition-all whitespace-nowrap ${selSlug === item.slug ? 'bg-[#F6CF80] text-black shadow-lg shadow-[#F6CF80]/20' : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white'}`}>
                {item.name}
              </button>
            ))}
            {items.length === 0 && <p className="text-white/20 text-xs font-bold py-4">Tidak ada data</p>}
          </div>
        )}

        {/* Novel results */}
        {selSlug && (
          <>
            <div className="mb-5">
              <h2 className="text-white font-black text-base uppercase">{selItem?.name}</h2>
              {page > 1 && <span className="text-white/30 text-[10px] font-bold">Halaman {page}</span>}
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(95px,1fr))] gap-3 px-2">
              {loadingList ? [...Array(12)].map((_, i) => <CardSkeleton key={i} />) :
                novels.map((novel, i) => (
                  <div key={novel.slug || i} onClick={() => navigate(`/novel/${novel.slug}`)} className="w-full flex flex-col gap-2 group cursor-pointer active:scale-95 transition-all">
                    <div className="relative aspect-[3/4.5] overflow-hidden bg-[#16161a] rounded-sm shadow-xl">
                      {novel.cover
                        ? <img src={novel.cover} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
                        : <div className="w-full h-full flex items-center justify-center text-white/10 text-3xl font-black">{novel.title?.[0]}</div>
                      }
                      {novel.rating && <div className="absolute top-1 right-1 bg-[#F6CF80] text-black text-[7px] font-black px-1 py-0.5 rounded-sm">★{novel.rating}</div>}
                    </div>
                    <h3 className="text-[9px] font-bold text-white/60 line-clamp-2 group-hover:text-[#F6CF80] transition-colors leading-tight">{novel.title}</h3>
                  </div>
                ))
              }
            </div>
            {!loadingList && novels.length === 0 && <div className="py-16 text-center"><p className="text-white/30 font-bold text-sm">Tidak ada novel</p></div>}
            {!loadingList && (pagination.hasNext || pagination.hasPrev) && (
              <div className="flex justify-center gap-3 mt-10">
                <button onClick={() => setPage(page-1)} disabled={!pagination.hasPrev} className="px-5 py-2.5 bg-[#16161a] border border-white/10 text-white font-black text-xs rounded-xl disabled:opacity-30 hover:border-white/30 transition-all">← Sebelumnya</button>
                <span className="px-5 py-2.5 bg-[#F6CF80] text-black font-black text-xs rounded-xl">{page}</span>
                <button onClick={() => setPage(page+1)} disabled={!pagination.hasNext} className="px-5 py-2.5 bg-[#16161a] border border-white/10 text-white font-black text-xs rounded-xl disabled:opacity-30 hover:border-white/30 transition-all">Selanjutnya →</button>
              </div>
            )}
          </>
        )}

        {!selSlug && !loadingMeta && (
          <div className="py-16 text-center"><p className="text-white/20 font-bold text-sm">Pilih {tab} di atas untuk melihat novel</p></div>
        )}
      </div>
    </div>
  );
};

export default Browse;

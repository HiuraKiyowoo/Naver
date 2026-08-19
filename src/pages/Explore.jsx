import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { search, getArchive } from '../lib/api';

const Shimmer = () => <div className="absolute inset-0 w-[200%] animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" style={{transform:'translate3d(-100%,0,0) skewX(-20deg)'}} />;
const CardSkeleton = () => (
  <div className="w-full flex flex-col gap-2">
    <div className="aspect-[3/4.5] bg-[#16161a] rounded-sm relative overflow-hidden"><Shimmer /></div>
    <div className="w-3/4 h-2.5 bg-[#16161a] rounded-sm relative overflow-hidden"><Shimmer /></div>
  </div>
);

const ORDERS = [
  { label: 'Terbaru', value: 'latest' },
  { label: 'Rating', value: 'rating' },
  { label: 'Views', value: 'views' },
  { label: 'A-Z', value: 'alphabet' },
  { label: 'Baru', value: 'new-manga' },
];

const Explore = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const query   = searchParams.get('q') || '';
  const orderby = searchParams.get('order') || 'latest';
  const page    = parseInt(searchParams.get('page') || '1');
  const navigate = useNavigate();

  const [results,  setResults]  = useState([]);
  const [pagination, setPagination] = useState({});
  const [isLoading, setIsLoading]   = useState(true);

  useEffect(() => {
    setIsLoading(true);
    setResults([]);
    (async () => {
      try {
        if (query) {
          const data = await search(query);
          setResults(data.items || []);
          setPagination({});
        } else {
          const data = await getArchive({ orderby, page });
          setResults(data.items || []);
          setPagination(data.pagination || {});
        }
      } catch { setResults([]); }
      setIsLoading(false);
    })();
  }, [query, orderby, page]);

  const setOrder = (v) => setSearchParams({ order: v, page: '1' });
  const setPage  = (p) => setSearchParams({ order: orderby, page: String(p) });

  return (
    <div className="min-h-screen bg-[#0a0a0c] font-nunito text-white pb-24">
      <style>{`@keyframes shimmer{0%{transform:translate3d(-100%,0,0) skewX(-20deg)}100%{transform:translate3d(200%,0,0) skewX(-20deg)}} body,html{background-color:#0a0a0c!important;margin:0;padding:0}`}</style>
      <Navbar />
      <div className="pt-24 max-w-7xl mx-auto px-6">

        {!query && (
          <div className="flex flex-wrap gap-2 mb-6">
            {ORDERS.map(o => (
              <button key={o.value} onClick={() => setOrder(o.value)} className={`px-4 py-2 text-[10px] font-black rounded-xl uppercase tracking-widest transition-all ${orderby === o.value ? 'bg-[#F6CF80] text-black' : 'bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10'}`}>
                {o.label}
              </button>
            ))}
          </div>
        )}

        {query && (
          <div className="mb-6">
            <p className="text-white/40 text-xs font-bold uppercase tracking-widest">Hasil untuk</p>
            <h2 className="text-[#F6CF80] text-2xl font-black line-clamp-1">"{query}"</h2>
          </div>
        )}

        <div className="grid grid-cols-[repeat(auto-fill,minmax(95px,1fr))] gap-3 px-2">
          {isLoading ? [...Array(18)].map((_, i) => <CardSkeleton key={i} />) :
            results.map((item, i) => (
              <div key={item.slug || i} onClick={() => navigate(`/novel/${item.slug}`)} className="w-full flex flex-col gap-2 group cursor-pointer active:scale-95 transition-all">
                <div className="relative aspect-[3/4.5] overflow-hidden bg-[#16161a] rounded-sm shadow-xl">
                  {item.cover
                    ? <img src={item.cover} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
                    : <div className="w-full h-full flex items-center justify-center text-white/10 text-3xl font-black">{item.title?.[0]}</div>
                  }
                  {item.rating && <div className="absolute top-1 right-1 bg-[#F6CF80] text-black text-[7px] font-black px-1 py-0.5 rounded-sm">★{item.rating}</div>}
                </div>
                <h3 className="text-[9px] font-bold text-white/60 line-clamp-2 group-hover:text-[#F6CF80] transition-colors leading-tight">{item.title}</h3>
              </div>
            ))
          }
        </div>

        {!isLoading && results.length === 0 && (
          <div className="py-24 text-center"><p className="text-white/30 font-bold text-sm">Tidak ada hasil</p></div>
        )}

        {!isLoading && !query && (pagination.hasNext || pagination.hasPrev) && (
          <div className="flex justify-center gap-3 mt-10">
            <button onClick={() => setPage(page - 1)} disabled={!pagination.hasPrev} className="px-5 py-2.5 bg-[#16161a] border border-white/10 text-white font-black text-xs rounded-xl disabled:opacity-30 hover:border-white/30 transition-all">← Sebelumnya</button>
            <span className="px-5 py-2.5 bg-[#F6CF80] text-black font-black text-xs rounded-xl">{page}</span>
            <button onClick={() => setPage(page + 1)} disabled={!pagination.hasNext} className="px-5 py-2.5 bg-[#16161a] border border-white/10 text-white font-black text-xs rounded-xl disabled:opacity-30 hover:border-white/30 transition-all">Selanjutnya →</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Explore;

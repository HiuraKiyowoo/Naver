import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { getLatest, listNovels } from '../lib/api';

const Shimmer = () => <div className="absolute top-0 bottom-0 left-0 w-[150%] animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent z-10" style={{ transform: 'translate3d(-100%,0,0) skewX(-20deg)' }} />;
const CardSkeleton = () => (
  <div className="min-w-[105px] flex flex-col gap-2">
    <div className="aspect-[3/4.5] bg-[#16161a] rounded-sm relative overflow-hidden shadow-xl"><Shimmer /></div>
    <div className="w-3/4 h-2.5 bg-[#16161a] rounded-sm relative overflow-hidden"><Shimmer /></div>
  </div>
);

const Home = () => {
  const navigate = useNavigate();
  const [latest,  setLatest]  = useState([]);
  const [novels,  setNovels]  = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const latestRef = useRef(null);
  const novelRef  = useRef(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    (async () => {
      setIsLoading(true);
      try {
        const [l, n] = await Promise.all([getLatest(1, 20), listNovels(1, 20)]);
        setLatest(l);
        setNovels(n);
      } catch {}
      setIsLoading(false);
    })();
  }, []);

  const scroll = (ref, dir) => ref.current?.scrollBy({ left: dir === 'left' ? -300 : 300, behavior: 'smooth' });

  // Novel unik dari latest (untuk hero)
  const heroNovels = [...new Map(latest.filter(l => l.novel).map(l => [l.novel.id, l.novel])).values()].slice(0, 6);
  const [heroIdx, setHeroIdx] = useState(0);

  useEffect(() => {
    if (heroNovels.length > 1) {
      const iv = setInterval(() => setHeroIdx(p => (p + 1) % heroNovels.length), 5000);
      return () => clearInterval(iv);
    }
  }, [heroNovels.length]);

  const hero = heroNovels[heroIdx];

  return (
    <div className="min-h-screen bg-[#0a0a0c] font-nunito selection:bg-[#F6CF80] selection:text-black pb-24 text-white">
      <style>{`
        @keyframes shimmer { 0%{transform:translate3d(-100%,0,0) skewX(-20deg)} 100%{transform:translate3d(200%,0,0) skewX(-20deg)} }
        body,html{background-color:#0a0a0c!important;color:white;margin:0;padding:0;overscroll-behavior-y:none}
        .custom-scrollbar::-webkit-scrollbar{height:4px} .custom-scrollbar::-webkit-scrollbar-track{background:transparent} .custom-scrollbar::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:10px}
      `}</style>

      <Navbar />

      {/* Hero */}
      <header className="relative w-full aspect-[16/10] md:aspect-video min-h-[280px] md:max-h-[500px] overflow-hidden bg-[#0f0f12]">
        {isLoading || !hero ? (
          <div className="w-full h-full bg-[#16161a] relative overflow-hidden"><Shimmer /></div>
        ) : (
          <div key={hero.id} className="w-full h-full relative">
            {hero.cover && <img src={hero.cover} className="w-full h-full object-cover opacity-50" />}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0c] via-[#0a0a0c]/40 to-transparent" />
            <div className="absolute bottom-6 left-6 md:bottom-12 md:left-12 flex items-end gap-4 z-10 w-[calc(100%-48px)] max-w-4xl">
              {hero.cover && <img src={hero.cover} className="w-20 md:w-36 aspect-[3/4.2] object-cover rounded-md shadow-2xl shrink-0" />}
              <div className="flex flex-col gap-1 mb-1">
                <h2 className="text-base md:text-2xl font-black text-white leading-tight line-clamp-2">{hero.title}</h2>
                <button onClick={() => navigate(`/novel/${hero.id}`)} className="mt-2 h-8 px-5 bg-[#F6CF80] hover:bg-[#ebd59b] text-black rounded font-black text-[10px] flex items-center gap-1.5 w-fit transition-colors">
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
                  Baca
                </button>
              </div>
            </div>
            {/* Dot indicators */}
            <div className="absolute bottom-4 right-6 flex gap-1.5 z-10">
              {heroNovels.map((_, i) => (
                <button key={i} onClick={() => setHeroIdx(i)} className={`w-1.5 h-1.5 rounded-full transition-all ${i === heroIdx ? 'bg-[#F6CF80] w-4' : 'bg-white/30'}`} />
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Latest Update */}
      <section className="max-w-7xl mx-auto px-6 mt-10">
        <div className="flex items-center justify-between mb-4 px-2">
          <div className="flex flex-col">
            <h2 className="text-lg font-black text-white uppercase leading-none tracking-tight">Update Terbaru</h2>
            <span className="text-[10px] text-white/40 mt-1 font-bold uppercase tracking-widest">Chapter paling baru</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => scroll(latestRef, 'left')} className="w-8 h-8 flex items-center justify-center bg-white/5 border border-white/10 rounded-full hover:bg-white/20 transition-colors"><svg className="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 19l-7-7 7-7"/></svg></button>
            <button onClick={() => scroll(latestRef, 'right')} className="w-8 h-8 flex items-center justify-center bg-white/5 border border-white/10 rounded-full hover:bg-white/20 transition-colors"><svg className="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 5l7 7-7 7"/></svg></button>
          </div>
        </div>
        <div ref={latestRef} className="flex overflow-x-auto gap-3 pb-4 custom-scrollbar snap-x px-2">
          {isLoading ? [...Array(10)].map((_, i) => <CardSkeleton key={i} />) :
            latest.map((ch, i) => (
              <div key={ch.id} onClick={() => navigate(`/read/${ch.id}`)} className="min-w-[105px] w-[105px] group cursor-pointer snap-start active:scale-95 flex flex-col gap-2">
                <div className="relative aspect-[3/4.5] overflow-hidden bg-[#16161a] rounded-sm shadow-xl">
                  {ch.novel?.id && <NovCover catId={ch.novel.id} />}
                  {ch.premium && <div className="absolute top-1 right-1 bg-[#F6CF80] text-black text-[7px] font-black px-1 py-0.5 rounded-sm">PREMIUM</div>}
                </div>
                <div className="flex flex-col gap-0.5">
                  <h3 className="text-[9px] font-bold text-white/60 line-clamp-1 group-hover:text-[#F6CF80] transition-colors">{ch.novel?.title || ch.title}</h3>
                  <span className="text-[8px] text-white/30 font-bold line-clamp-1">{ch.title}</span>
                </div>
              </div>
            ))
          }
        </div>
      </section>

      {/* Novel List */}
      <section className="max-w-7xl mx-auto px-6 mt-10">
        <div className="flex items-center justify-between mb-4 px-2">
          <div className="flex flex-col">
            <h2 className="text-lg font-black text-white uppercase leading-none tracking-tight">Semua Novel</h2>
            <span className="text-[10px] text-white/40 mt-1 font-bold uppercase tracking-widest">Urut chapter terbanyak</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => scroll(novelRef, 'left')} className="w-8 h-8 flex items-center justify-center bg-white/5 border border-white/10 rounded-full hover:bg-white/20 transition-colors"><svg className="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 19l-7-7 7-7"/></svg></button>
            <button onClick={() => scroll(novelRef, 'right')} className="w-8 h-8 flex items-center justify-center bg-white/5 border border-white/10 rounded-full hover:bg-white/20 transition-colors"><svg className="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 5l7 7-7 7"/></svg></button>
          </div>
        </div>
        <div ref={novelRef} className="flex overflow-x-auto gap-3 pb-4 custom-scrollbar snap-x px-2">
          {isLoading ? [...Array(10)].map((_, i) => <CardSkeleton key={i} />) :
            novels.map((n, i) => (
              <div key={n.id} onClick={() => navigate(`/novel/${n.id}`)} className="min-w-[105px] w-[105px] group cursor-pointer snap-start active:scale-95 flex flex-col gap-2">
                <div className="relative aspect-[3/4.5] overflow-hidden bg-[#16161a] rounded-sm shadow-xl">
                  <NovCover catId={n.id} />
                  <div className="absolute bottom-1 right-1 bg-black/60 text-white/80 text-[7px] font-black px-1 py-0.5 rounded-sm">{n.count} ch</div>
                </div>
                <h3 className="text-[9px] font-bold text-white/60 line-clamp-1 group-hover:text-[#F6CF80] transition-colors">{n.title}</h3>
              </div>
            ))
          }
        </div>
      </section>

      <Footer />
    </div>
  );
};

// Lazy load cover dari category id
const coverCache = {};
const NovCover = ({ catId }) => {
  const [src, setSrc] = useState(coverCache[catId] || null);
  useEffect(() => {
    if (coverCache[catId]) { setSrc(coverCache[catId]); return; }
    fetch(`/api/wp-json/wp/v2/posts?categories=${catId}&per_page=1&orderby=date&order=asc&_fields=content`)
      .then(r => r.json())
      .then(posts => {
        const html = posts?.[0]?.content?.rendered || '';
        const match = html.match(/src="([^"]+)"/);
        if (match) {
          const clean = match[1].replace(/i\d?\.wp\.com\//, '').split('?')[0].replace('http://', 'https://');
          coverCache[catId] = clean;
          setSrc(clean);
        }
      }).catch(() => {});
  }, [catId]);
  return src ? <img src={src} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" /> : null;
};

export default Home;

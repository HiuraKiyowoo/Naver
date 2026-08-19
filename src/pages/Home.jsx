import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { getHome, getArchive } from '../lib/api';

const Shimmer = () => <div className="absolute inset-0 w-[200%] animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" style={{transform:'translate3d(-100%,0,0) skewX(-20deg)'}} />;
const CardSkeleton = () => (
  <div className="min-w-[105px] flex flex-col gap-2">
    <div className="aspect-[3/4.5] bg-[#16161a] rounded-sm relative overflow-hidden"><Shimmer /></div>
    <div className="w-3/4 h-2.5 bg-[#16161a] rounded-sm relative overflow-hidden"><Shimmer /></div>
  </div>
);

const NovelCard = ({ item, onClick }) => (
  <div onClick={onClick} className="min-w-[105px] w-[105px] group cursor-pointer snap-start active:scale-95 flex flex-col gap-2">
    <div className="relative aspect-[3/4.5] overflow-hidden bg-[#16161a] rounded-sm shadow-xl">
      {item.image
        ? <img src={item.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
        : <div className="w-full h-full flex items-center justify-center text-white/10 text-2xl font-black">{item.title?.[0]}</div>
      }
      {item.type && <div className="absolute top-1 left-1 bg-black/70 text-white/80 text-[7px] font-black px-1 py-0.5 rounded-sm">{item.type}</div>}
      {item.rating && <div className="absolute top-1 right-1 bg-[#F6CF80] text-black text-[7px] font-black px-1 py-0.5 rounded-sm">★{item.rating}</div>}
    </div>
    <h3 className="text-[9px] font-bold text-white/60 line-clamp-2 group-hover:text-[#F6CF80] transition-colors leading-tight">{item.title}</h3>
  </div>
);

const Home = () => {
  const navigate = useNavigate();
  const [home,     setHome]     = useState(null);
  const [latest,   setLatest]   = useState([]);
  const [popular,  setPopular]  = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [heroIdx,  setHeroIdx]  = useState(0);
  const homeRef   = useRef(null);
  const latestRef = useRef(null);
  const popularRef= useRef(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    (async () => {
      setIsLoading(true);
      try {
        const [h, l, p] = await Promise.all([
          getHome(),
          getArchive({ orderby: 'latest', page: 1 }),
          getArchive({ orderby: 'views', page: 1 }),
        ]);
        setHome(h);
        setLatest(l.items || []);
        setPopular(p.items || []);
      } catch {}
      setIsLoading(false);
    })();
  }, []);

  const heroItems = (home?.items || []).filter(i => i.image).slice(0, 6);

  useEffect(() => {
    if (heroItems.length > 1) {
      const iv = setInterval(() => setHeroIdx(p => (p + 1) % heroItems.length), 5000);
      return () => clearInterval(iv);
    }
  }, [heroItems.length]);

  const hero = heroItems[heroIdx];
  const scroll = (ref, dir) => ref.current?.scrollBy({ left: dir === 'left' ? -300 : 300, behavior: 'smooth' });

  const Section = ({ label, sub, refEl, items }) => (
    <section className="max-w-7xl mx-auto px-6 mt-10">
      <div className="flex items-center justify-between mb-4 px-2">
        <div>
          <h2 className="text-lg font-black text-white uppercase leading-none tracking-tight">{label}</h2>
          {sub && <span className="text-[10px] text-white/40 mt-1 font-bold uppercase tracking-widest">{sub}</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => scroll(refEl, 'left')} className="w-8 h-8 flex items-center justify-center bg-white/5 border border-white/10 rounded-full hover:bg-white/20 transition-colors">
            <svg className="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 19l-7-7 7-7"/></svg>
          </button>
          <button onClick={() => scroll(refEl, 'right')} className="w-8 h-8 flex items-center justify-center bg-white/5 border border-white/10 rounded-full hover:bg-white/20 transition-colors">
            <svg className="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>
      <div ref={refEl} className="flex overflow-x-auto gap-3 pb-4 snap-x px-2" style={{scrollbarWidth:'none'}}>
        {isLoading
          ? [...Array(8)].map((_, i) => <CardSkeleton key={i} />)
          : items.map((item, i) => (
              <NovelCard key={item.slug || i} item={item} onClick={() => navigate(`/novel/${item.slug}`)} />
            ))
        }
      </div>
    </section>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0c] font-nunito text-white pb-24">
      <style>{`
        @keyframes shimmer{0%{transform:translate3d(-100%,0,0) skewX(-20deg)}100%{transform:translate3d(200%,0,0) skewX(-20deg)}}
        body,html{background-color:#0a0a0c!important;color:white;margin:0;padding:0;overscroll-behavior-y:none}
      `}</style>
      <Navbar />

      {/* Hero */}
      <header className="relative w-full min-h-[300px] md:max-h-[520px] overflow-hidden bg-[#0f0f12]" style={{aspectRatio:'16/10'}}>
        {isLoading || !hero ? (
          <div className="w-full h-full bg-[#16161a] relative overflow-hidden"><Shimmer /></div>
        ) : (
          <div key={hero.slug} className="w-full h-full relative">
            <img src={hero.image} className="w-full h-full object-cover opacity-40" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0c] via-[#0a0a0c]/50 to-transparent" />
            <div className="absolute bottom-6 left-6 md:bottom-12 md:left-12 flex items-end gap-4 z-10 max-w-2xl">
              <img src={hero.image} className="w-20 md:w-32 aspect-[3/4.2] object-cover rounded-md shadow-2xl shrink-0" />
              <div className="flex flex-col gap-1 mb-1">
                {hero.type && <span className="text-[#F6CF80] text-[9px] font-black uppercase tracking-widest">{hero.type}</span>}
                <h2 className="text-base md:text-2xl font-black text-white leading-tight line-clamp-2">{hero.title}</h2>
                {hero.rating && <span className="text-white/50 text-xs font-bold">★ {hero.rating}</span>}
                <div className="flex gap-2 mt-2">
                  <button onClick={() => navigate(`/novel/${hero.slug}`)} className="h-8 px-5 bg-[#F6CF80] hover:bg-[#ebd59b] text-black rounded font-black text-[10px] flex items-center gap-1.5 transition-colors">
                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
                    Detail
                  </button>
                </div>
              </div>
            </div>
            <div className="absolute bottom-4 right-6 flex gap-1.5 z-10">
              {heroItems.map((_, i) => (
                <button key={i} onClick={() => setHeroIdx(i)} className={`h-1.5 rounded-full transition-all ${i === heroIdx ? 'bg-[#F6CF80] w-4' : 'bg-white/30 w-1.5'}`} />
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Sections */}
      <Section label="Update Terbaru"  sub="Baru diupdate"        refEl={latestRef}  items={latest} />
      <Section label="Populer"         sub="Most viewed"          refEl={popularRef} items={popular} />
      <Section label="Semua Novel"     sub="From homepage"        refEl={homeRef}    items={home?.items || []} />

      <Footer />
    </div>
  );
};

export default Home;

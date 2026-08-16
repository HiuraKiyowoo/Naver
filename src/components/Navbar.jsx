import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { search } from '../lib/api';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [query, setQuery]               = useState('');
  const [liveResults, setLiveResults]   = useState([]);
  const [isLiveLoading, setIsLiveLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isSearchOpen) setTimeout(() => inputRef.current?.focus(), 300);
    else { setQuery(''); setLiveResults([]); }
  }, [isSearchOpen]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (query.length > 2) {
        setIsLiveLoading(true);
        try { setLiveResults(await search(query)); } catch { setLiveResults([]); }
        setIsLiveLoading(false);
      } else setLiveResults([]);
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) { navigate(`/explore?q=${encodeURIComponent(query)}`); setIsSearchOpen(false); }
  };

  const navLinks = [
    {
      path: '/home', label: 'Home',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
    },
    {
      path: '/explore', label: 'Explore',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
    },
    {
      path: '/browse', label: 'Browse',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h7"/>
    },
    {
      path: '/history', label: 'History',
      icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
    },
  ];

  const activeIndex = navLinks.findIndex(l => location.pathname.startsWith(l.path));
  const notchPos = activeIndex >= 0
    ? `${activeIndex * (100 / navLinks.length) + (100 / navLinks.length / 2)}%`
    : '50%';

  return (
    <>
      <style>{`
        @keyframes slideDown { from{opacity:0;transform:translateY(-10px) scaleY(.95)} to{opacity:1;transform:translateY(0) scaleY(1)} }
        .notch-nav{position:relative;height:70px;background:rgba(10,10,12,.95);border:1px solid rgba(255,255,255,.08);border-radius:32px;display:flex;align-items:flex-end;justify-content:space-around;box-shadow:0 8px 32px rgba(0,0,0,.4);padding-bottom:8px}
        .notch-nav::before{content:'';position:absolute;top:-1px;left:${notchPos};transform:translateX(-50%);width:60px;height:30px;background:rgba(10,10,12,.95);border-radius:0 0 50% 50%/0 0 100% 100%;border:1px solid rgba(255,255,255,.08);border-top:none;transition:left .5s cubic-bezier(.34,1.56,.64,1);z-index:0}
        .notch-item{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;cursor:pointer;flex:1;height:100%;padding-bottom:6px;z-index:1}
        .notch-icon{width:40px;height:40px;display:flex;align-items:center;justify-content:center;border-radius:14px;transition:all .5s cubic-bezier(.34,1.56,.64,1);margin-bottom:2px}
        .notch-icon.active{background:#F6CF80;transform:translateY(-14px) scale(1.1);box-shadow:0 8px 24px rgba(246,207,128,.35);border-radius:16px}
        .notch-label{font-size:8px;font-weight:800;opacity:0;transform:translateY(6px);position:absolute;bottom:8px;transition:all .3s ease}
        .notch-label.active{opacity:1;transform:translateY(0);color:#F6CF80}
        .custom-scrollbar::-webkit-scrollbar{width:4px} .custom-scrollbar::-webkit-scrollbar-track{background:transparent} .custom-scrollbar::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:4px}
      `}</style>

      {/* Top Bar */}
      <nav className="fixed top-2 inset-x-4 z-[100] max-w-7xl mx-auto">
        <div className="bg-black/60 h-16 px-6 rounded-2xl flex items-center justify-between border border-white/5 shadow-lg relative overflow-hidden">
          <div className="flex items-center shrink-0 z-10 gap-1 cursor-pointer" onClick={() => navigate('/home')}>
            <span className="text-[#F6CF80] font-black text-lg tracking-tight">Fuyu</span>
            <span className="text-white font-black text-lg tracking-tight">Novel</span>
          </div>
          <button onClick={() => setIsSearchOpen(true)} className="w-9 h-9 bg-white/5 rounded-full flex items-center justify-center text-white border border-white/10 hover:bg-[#F6CF80] hover:text-black hover:border-[#F6CF80] transition-colors z-10">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </button>

          {/* Search overlay */}
          <div className={`absolute inset-0 bg-[#16161a] z-20 flex items-center px-4 transition-all duration-300 ${isSearchOpen ? 'opacity-100' : 'opacity-0 translate-x-8 pointer-events-none'}`}>
            <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-3">
              <button type="submit" className="text-[#F6CF80] shrink-0 p-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              </button>
              <input ref={inputRef} type="text" className="flex-1 bg-transparent text-white text-sm outline-none font-bold placeholder-white/30" placeholder="Cari novel..." value={query} onChange={e => setQuery(e.target.value)} />
              <button type="button" onClick={() => setIsSearchOpen(false)} className="text-white/40 hover:text-white p-2 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </form>
          </div>
        </div>

        {/* Live search results */}
        {isSearchOpen && query.length > 2 && (
          <div className="absolute top-20 left-4 right-4 md:right-0 md:w-96 bg-[#16161a] border border-white/10 rounded-2xl shadow-2xl z-[110] max-h-[60vh] overflow-y-auto custom-scrollbar origin-top animate-[slideDown_.2s_ease-out]">
            {isLiveLoading ? (
              <div className="p-6 text-center text-[#F6CF80] text-xs font-bold">mencari...</div>
            ) : liveResults.length > 0 ? liveResults.map(r => (
              <div key={r.id} onClick={() => { navigate(`/novel/${r.id}`); setIsSearchOpen(false); }} className="flex items-center gap-4 p-3 hover:bg-white/5 cursor-pointer border-b border-white/5 transition-colors">
                {r.cover && <img src={r.cover} className="w-10 aspect-[3/4.5] object-cover rounded-md shadow-md" />}
                <div className="flex flex-col">
                  <span className="text-white font-bold text-xs line-clamp-1">{r.title}</span>
                  <span className="text-white/40 text-[9px] font-bold mt-1">{r.type} · {r.status}</span>
                </div>
              </div>
            )) : (
              <div className="p-6 text-center text-white/40 text-xs font-bold">novel tidak ditemukan</div>
            )}
          </div>
        )}
      </nav>

      {/* Bottom Nav */}
      <div className="fixed bottom-4 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-md z-[90]">
        <div className="notch-nav">
          {navLinks.map(link => {
            const isActive = location.pathname.startsWith(link.path);
            return (
              <div key={link.path} className="notch-item" onPointerDown={() => navigate(link.path)}>
                <div className={`notch-icon ${isActive ? 'active' : ''}`}>
                  <svg className="w-5 h-5" fill="none" stroke={isActive ? '#0a0a0c' : 'rgba(255,255,255,0.5)'} strokeWidth="2.5" viewBox="0 0 24 24">{link.icon}</svg>
                </div>
                <span className={`notch-label ${isActive ? 'active' : ''}`}>{link.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

export default Navbar;

import React from 'react';
import { useNavigate } from 'react-router-dom';

const Welcome = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#0a0a0c] font-nunito flex flex-col items-center justify-center px-6 text-white text-center">
      <style>{`body,html{background-color:#0a0a0c!important;margin:0;padding:0}`}</style>
      <div className="mb-8">
        <span className="text-[#F6CF80] font-black text-5xl tracking-tight">Fuyu</span>
        <span className="text-white font-black text-5xl tracking-tight">Novel</span>
      </div>
      <p className="text-white/50 text-sm font-medium mb-10 max-w-xs leading-relaxed">
        Baca Light Novel & Web Novel Bahasa Indonesia secara gratis.
      </p>
      <button onClick={() => navigate('/home')} className="px-8 py-4 bg-[#F6CF80] hover:bg-[#ebd59b] text-black rounded-2xl font-black text-sm tracking-wide transition-colors shadow-[0_10px_30px_rgba(246,207,128,0.3)]">
        Mulai Baca
      </button>
    </div>
  );
};

export default Welcome;

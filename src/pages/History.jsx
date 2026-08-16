import React from 'react';
import Navbar from '../components/Navbar';

const History = () => (
  <div className="min-h-screen bg-[#0a0a0c] font-nunito text-white">
    <style>{`body,html{background-color:#0a0a0c!important;color:white;margin:0;padding:0}`}</style>
    <Navbar />
    <div className="pt-32 flex flex-col items-center justify-center px-6 text-center">
      <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6 border border-white/10">
        <svg className="w-10 h-10 text-white/20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      </div>
      <h2 className="text-white font-black text-2xl mb-3 tracking-tight">Eitss, belum bisa!</h2>
      <p className="text-white/40 text-sm font-medium max-w-xs leading-relaxed">
        Fitur riwayat baca masih dalam tahap pengembangan. Sabar ya! 😖
      </p>
    </div>
  </div>
);

export default History;

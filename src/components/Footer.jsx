import React from 'react';
const Footer = () => (
  <footer className="max-w-7xl mx-auto px-6 mt-16 mb-4 border-t border-white/5 pt-8">
    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-1">
        <span className="text-[#F6CF80] font-black text-lg">Naver</span>
        <span className="text-white font-black text-lg">Novel</span>
      </div>
      <p className="text-white/20 text-[10px] font-bold text-center">
        Konten dari <a href="https://meionovels.com" target="_blank" rel="noopener noreferrer" className="text-[#F6CF80]/60 hover:text-[#F6CF80] transition-colors">meionovels.com</a>
      </p>
    </div>
  </footer>
);
export default Footer;

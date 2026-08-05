'use client';

import Image from 'next/image';

export default function BuiltOnStellar() {
  return (
    <section className="relative w-full h-[700px] bg-transparent overflow-hidden flex items-center">
      
      {/* ARTWORK (last.png) */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        
        {/* last.png (contains both planet and logo) */}
        {/* Occupies right ~65%, anchored bottom right */}
        <div className="absolute bottom-[-5%] right-[-5%] w-[65%] h-[110%] md:w-[70%] md:h-[120%] z-10">
          <Image
            src="/images/last.png"
            alt="Built on Stellar Artwork"
            fill
            className="object-contain object-right-bottom"
            priority
          />
        </div>

        {/* Subtle gradient overlay to ensure left text readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-[#050505]/60 to-transparent z-15" />
        
      </div>

      {/* LEFT CONTENT AREA */}
      <div className="relative z-20 container flex flex-col">
        <div className="w-full md:w-[40%] flex flex-col">
          
          <span className="block text-[12px] font-medium uppercase tracking-[0.28em] text-nova-accent mb-6">
            BUILT ON STELLAR
          </span>
          
          <h2 className="font-sans font-medium text-white text-[72px] leading-[0.95] tracking-tight mb-8">
            Built on<br />
            Stellar<br />
            Soroban
          </h2>

          <p className="text-[18px] leading-[1.8] text-nova-muted mb-12 max-w-md">
            Secure. Scalable. Decentralized.<br />
            Powering the future of autonomous rate infrastructure on Stellar.
          </p>

          <div>
            <a href="https://developers.stellar.org/docs/learn/fundamentals" target="_blank" rel="noopener noreferrer" className="group flex items-center gap-2 text-white text-[15px] font-medium transition-colors duration-300 hover:text-nova-accent bg-transparent border-none w-fit">
              Explore Soroban
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="transition-transform duration-300 group-hover:translate-x-[4px]"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </a>
          </div>

        </div>
      </div>
    </section>
  );
}

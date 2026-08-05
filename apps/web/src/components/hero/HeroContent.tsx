'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

export function HeroContent() {
  return (
    <div className="relative z-20 flex max-w-[540px] flex-col justify-center">
      <motion.span
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="mb-8 text-[12px] font-medium uppercase tracking-[0.28em] text-[#3ECF8E]"
      >
        + AUTONOMOUS YIELD INFRASTRUCTURE
      </motion.span>
      
      <motion.h1
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
  className="mb-8 leading-[0.94] tracking-[-0.05em]"
>
  <span className="block text-[82px] font-bold text-nova-text">
    Fixed yield.
  </span>

  <span className="block text-[82px] font-bold text-nova-text">
    On-chain.
  </span>

  <span className="mt-1 block font-serif text-[74px] italic font-normal text-nova-text">
    Automated.
  </span>
</motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
        className="mb-10 max-w-[430px] text-[18px] leading-[1.8] font-normal text-nova-muted"
      >
        Novaire is the tokenized yield layer on Stellar.<br />
        Lock, earn, and automate yield with intelligent strategies and on-chain execution.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.4 }}
        className="mt-2 flex items-center gap-8"
      >
        <Link href="/app" className="w-full sm:w-auto px-7 py-3 bg-transparent text-white/90 text-[15px] font-medium transition-colors duration-300 ease-out hover:text-nova-accent flex items-center justify-center gap-2">
          Launch App
        </Link>
        <a href="https://stellar.org/" target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto group px-7 py-3 bg-transparent text-[#A1A1AA] text-[15px] font-medium transition-colors duration-300 ease-out hover:text-nova-accent flex items-center justify-center gap-2">
          Explore Ecosystem
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="transition-transform duration-300 group-hover:translate-x-[4px]"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </a>
      </motion.div>
    </div>
  );
}

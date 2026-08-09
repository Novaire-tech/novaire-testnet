'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';

export default function FinalCTA() {
  const prefersReducedMotion = useReducedMotion();

  const riseUp = (delay: number) => ({
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.4 },
    transition: {
      duration: prefersReducedMotion ? 0 : 0.8,
      ease: 'easeOut' as const,
      delay: prefersReducedMotion ? 0 : delay,
    },
  });

  return (
    <section className="relative w-full px-4 pt-[100px] pb-[100px] md:px-5 md:pt-[110px] lg:px-6 lg:pt-[120px]">
      <motion.div {...riseUp(0)} className="relative mx-auto w-[85%] max-w-[1400px]">
        <div className="relative h-[450px] w-full overflow-hidden rounded-[32px] md:h-[480px] lg:h-[520px]">
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            controls={false}
            className="h-full w-full object-cover"
          >
            <source src="/videos/cta-banner.mp4" type="video/mp4" />
          </video>

          {/* Dark gradient confined to the left 35-40% so only that zone is darkened */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-[40%] bg-gradient-to-r from-black/70 via-black/35 to-transparent" />

          {/* Text overlay — left side, vertically centered */}
          <div className="absolute inset-y-0 left-[8%] flex max-w-[380px] items-center">
            <div className="text-left">
              <h2 className="font-editorial italic font-bold text-[#E7E2CE] text-[36px] leading-[1.05] tracking-[-0.02em] sm:text-[44px] md:text-[56px] lg:text-[64px] xl:text-[72px]">
                The Future of
                <br />
                Yield Starts Here.
              </h2>

              <div className="mt-5">
                <p className="font-poppins text-[22px] font-normal leading-[1.6] text-[#F5F5F5]">
                  Split principal.
                </p>
                <p className="font-poppins text-[22px] font-normal leading-[1.6] text-[#F5F5F5]">
                  Trade future yield.
                </p>
                <p className="font-poppins text-[22px] font-normal leading-[1.6] text-[#F5F5F5]">
                  Redeem seamlessly.
                </p>
              </div>

              <div className="mt-7">
                <Link
                  href="/app"
                  className="group inline-flex h-[56px] items-center gap-2 rounded-full border border-white/[0.18] bg-white/[0.10] px-8 font-poppins text-[16px] font-medium text-white backdrop-blur-[18px] transition-all duration-300 ease-out hover:-translate-y-[2px] hover:border-white/30 hover:bg-white/[0.16]"
                >
                  Get Early Access
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="transition-transform duration-300 ease-out group-hover:translate-x-1"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

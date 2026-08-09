'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { FAQItem } from './FAQItem';

const FIRST_ROW = [
  {
    index: '01',
    question: 'What are PT & YT?',
    answer:
      'PT is your principal. YT is your future yield.\n\nTwo assets, two strategies, one underlying position.',
  },
  {
    index: '02',
    question: 'Can I lock in a yield?',
    answer:
      'Buy PT at the market price and hold it to maturity.\n\nThe difference between its price and redemption value creates the implied yield.',
  },
  {
    index: '03',
    question: 'What is Implied APY?',
    answer:
      "It's the yield the current PT price implies until maturity.\n\nThink of it as the market's price tag on future yield.",
  },
];

const SECOND_ROW = [
  {
    index: '04',
    question: 'Can yield be traded like an asset?',
    answer:
      "That's the idea behind YT.\n\nYou can take exposure to future yield without owning the entire principal.",
  },
  {
    index: '05',
    question: 'What happens when the market expects higher yields?',
    answer:
      'PT and YT prices react to changing expectations.\n\nThe market continuously discovers what future yield is worth.',
  },
  {
    index: '06',
    question: 'Why separate principal from yield?',
    answer:
      'Because different investors want different things.\n\nPT targets principal exposure; YT targets future yield exposure.',
  },
];

export function FAQ() {
  const prefersReducedMotion = useReducedMotion();

  const riseUp = (delay = 0) => ({
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.3 },
    transition: {
      duration: prefersReducedMotion ? 0 : 0.8,
      ease: 'easeOut' as const,
      delay: prefersReducedMotion ? 0 : delay,
    },
  });

  return (
    <section className="w-full bg-[#e7e2ce] py-[100px] md:py-[120px]">
      <div className="mx-auto w-full max-w-[1500px] px-6 md:px-10">
        <motion.div {...riseUp(0)}>
          <h2 className="font-editorial italic font-normal text-[40px] leading-[1.05] tracking-[-0.02em] text-[#112a46] sm:text-[52px] md:text-[64px]">
            Frequently Asked Questions
          </h2>
          <p className="mt-5 max-w-[500px] font-poppins text-[17px] font-normal leading-[1.6] text-[rgba(17,42,70,0.75)] sm:text-[19px] md:text-[20px]">
            Everything you need to know about principal, yield, and how Novaire brings them to market.
          </p>
        </motion.div>

        {/* Row 1: image left, FAQs right */}
        <div className="mt-16 flex flex-col gap-8 md:mt-20 lg:flex-row lg:items-stretch lg:gap-14">
          <motion.div
            {...riseUp(0.1)}
            className="relative aspect-[4/3] w-full max-w-[420px] overflow-hidden rounded-[28px] border border-[rgba(17,42,70,0.1)] lg:aspect-auto lg:h-auto lg:w-[380px] lg:max-w-none lg:flex-shrink-0 lg:self-stretch"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/faq-1.png"
              alt="Novaire orbiting principal and yield"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </motion.div>

          <motion.div {...riseUp(0.2)} className="flex flex-1 flex-col justify-between gap-4 lg:w-full lg:max-w-none">
            {FIRST_ROW.map((item) => (
              <FAQItem key={item.index} {...item} />
            ))}
          </motion.div>
        </div>

        {/* Row 2: FAQs left, image right (mirrored) */}
        <div className="mt-10 flex flex-col gap-8 md:mt-14 lg:flex-row lg:items-stretch lg:gap-14">
          <motion.div
            {...riseUp(0.1)}
            className="order-2 flex flex-1 flex-col justify-between gap-4 lg:order-1 lg:w-full lg:max-w-none"
          >
            {SECOND_ROW.map((item) => (
              <FAQItem key={item.index} {...item} />
            ))}
          </motion.div>

          <motion.div
            {...riseUp(0.2)}
            className="order-1 relative aspect-[4/3] w-full max-w-[420px] overflow-hidden rounded-[28px] border border-[rgba(17,42,70,0.1)] lg:order-2 lg:aspect-auto lg:h-auto lg:w-[380px] lg:max-w-none lg:flex-shrink-0 lg:self-stretch"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/faq-2.png"
              alt="Novaire coin monument"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

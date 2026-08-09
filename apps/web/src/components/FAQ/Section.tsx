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

const FOURTH_ITEM = {
  index: '04',
  question: 'Can yield be traded like an asset?',
  answer:
    "That's the idea behind YT.\n\nYou can take exposure to future yield without owning the entire principal.",
};

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
    <section className="w-full bg-[#e7e2ce] pb-[100px] pt-[40px] md:pb-[120px] md:pt-[56px]">
      <div className="mx-auto w-full max-w-[1500px] px-6 md:px-10">
        <motion.div {...riseUp(0)}>
          <h2 className="font-editorial italic font-normal text-[40px] leading-[1.05] tracking-[-0.02em] text-[#112a46] sm:text-[52px] md:text-[64px]">
            Frequently Asked Questions
          </h2>
          <p className="mt-5 max-w-[500px] font-poppins text-[17px] font-normal leading-[1.6] text-[rgba(17,42,70,0.75)] sm:text-[19px] md:text-[20px]">
            Everything you need to know about principal, yield, and how Novaire brings them to market.
          </p>
        </motion.div>

        {/* Image left, FAQs right */}
        <div className="mt-16 flex flex-col gap-8 md:mt-20 lg:flex-row lg:items-stretch lg:gap-14">
          <motion.div
            {...riseUp(0.1)}
            className="relative aspect-[4/3] w-full max-w-[470px] overflow-hidden rounded-[28px] border border-[rgba(17,42,70,0.1)] lg:aspect-auto lg:h-auto lg:w-[430px] lg:max-w-none lg:flex-shrink-0 lg:self-stretch"
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
            <FAQItem {...FOURTH_ITEM} />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

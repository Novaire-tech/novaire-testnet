'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { WorkflowCard, type WorkflowCardProps } from './WorkflowCard';

// Placeholder set — replace each entry's image/video/title/description later
// without touching the layout.
const cards: WorkflowCardProps[] = [
  {
    image: '/images/workflow-deposit.png',
    title: 'Start With One Deposit',
    description:
      'Deposit a supported yield-bearing asset into Novaire to unlock a new layer of flexibility without changing how your assets work.',
  },
  {
    image: '/images/workflow-split.png',
    title: 'Separate Principal from Yield',
    description:
      'Novaire tokenizes your position into Principal and Yield tokens, allowing each side of the asset to be managed independently.',
    imageLift: 2,
    flowPaths: true,
  },
  {
    video: '/videos/workflow-strategy.mp4',
    title: 'Build Your Own Strategy',
    description:
      'Trade principal or future yield independently, capture market opportunities, or simply hold until maturity—the choice is yours.',
  },
  {
    image: '/images/workflow-settle.png',
    title: 'Settle at Maturity',
    description:
      "When the epoch ends, redeem your position seamlessly and realize the value you've built throughout the lifecycle.",
    centerImage: true,
    centerImageOffsetY: 38,
  },
];

export function HowNovaireWorks() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="w-full bg-[#e7e2ce] pt-[68px] pb-[140px]">
      <div className="mx-auto w-full max-w-[1500px] px-6 md:px-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.8, ease: 'easeOut' }}
          className="text-left"
        >
          <h2 className="font-editorial italic font-normal text-[40px] leading-[1.05] tracking-[-0.02em] text-[#112a46] sm:text-[52px] md:text-[64px] lg:text-[72px]">
            How Novaire Works
          </h2>
          <p className="mt-5 max-w-[500px] font-poppins text-[17px] font-normal leading-[1.6] text-[rgba(17,42,70,0.75)] sm:text-[19px] md:text-[20px]">
            Understand how Novaire transforms yield into flexible financial positions.
          </p>
        </motion.div>

        <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 md:mt-14">
          {cards.map((card, index) => (
            <WorkflowCard key={index} index={index} {...card} />
          ))}
        </div>
      </div>
    </section>
  );
}

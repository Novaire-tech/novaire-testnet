"use client";

import React, { memo, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
// Reusing the project's existing framer-motion dependency — "motion" is the same
// library published under its newer name, so this avoids installing a duplicate.
import { useMotionValue, animate, motion } from "framer-motion";
import useMeasure from "react-use-measure";

export type Logo = {
  /** Path to an SVG/image asset. Omit to render `alt` as a text wordmark instead. */
  src?: string;
  alt: string;
  width?: number;
  height?: number;
};

type InfiniteSliderProps = {
  children: React.ReactNode;
  gap?: number;
  duration?: number;
  durationOnHover?: number;
  direction?: "horizontal" | "vertical";
  reverse?: boolean;
  className?: string;
};

const InfiniteSlider = memo(function InfiniteSlider({
  children,
  gap = 16,
  duration = 25,
  durationOnHover,
  direction = "horizontal",
  reverse = false,
  className,
}: InfiniteSliderProps) {
  const [currentDuration, setCurrentDuration] = useState(duration);
  const [ref, { width, height }] = useMeasure();
  const translation = useMotionValue(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const size = direction === "horizontal" ? width : height;
    const contentSize = size + gap;
    const from = reverse ? -contentSize / 2 : 0;
    const to = reverse ? 0 : -contentSize / 2;

    let controls;

    if (isTransitioning) {
      controls = animate(translation, [translation.get(), to], {
        ease: "linear",
        duration:
          currentDuration * Math.abs((translation.get() - to) / contentSize),
        onComplete: () => {
          setIsTransitioning(false);
          setKey((prev) => prev + 1);
        },
      });
    } else {
      controls = animate(translation, [from, to], {
        ease: "linear",
        duration: currentDuration,
        repeat: Infinity,
        repeatType: "loop",
        repeatDelay: 0,
        onRepeat: () => translation.set(from),
      });
    }

    return controls?.stop;
  }, [
    key,
    translation,
    currentDuration,
    width,
    height,
    gap,
    isTransitioning,
    direction,
    reverse,
  ]);

  const hoverProps = durationOnHover
    ? {
        onHoverStart: () => {
          setIsTransitioning(true);
          setCurrentDuration(durationOnHover);
        },
        onHoverEnd: () => {
          setIsTransitioning(true);
          setCurrentDuration(duration);
        },
      }
    : {};

  return (
    <div className={cn("overflow-hidden", className)}>
      <motion.div
        ref={ref}
        className="flex w-max items-center"
        style={{
          ...(direction === "horizontal"
            ? { x: translation }
            : { y: translation }),
          gap: `${gap}px`,
          flexDirection: direction === "horizontal" ? "row" : "column",
        }}
        {...hoverProps}
      >
        {children}
        {children}
      </motion.div>
    </div>
  );
});

const LogoImage = memo(function LogoImage({ logo }: { logo: Logo }) {
  // Real assets get forced to a single ivory tone (brightness(0) invert(1)) so every
  // logo reads as one consistent, understated mark rather than a multicolor sponsor
  // strip — the same technique used for the Novaire wordmark in the navbar.
  if (logo.src) {
    return (
      <img
        alt={logo.alt}
        src={logo.src}
        width={logo.width ?? "auto"}
        height={logo.height ?? "auto"}
        loading="lazy"
        className="pointer-events-none h-[32px] w-auto select-none opacity-70 transition-[opacity,transform] duration-[250ms] ease-out [filter:brightness(0)_invert(1)] group-hover/logo:scale-[1.08] group-hover/logo:opacity-100 sm:h-[37px] md:h-[41px]"
      />
    );
  }

  // No verified official asset for this one — a clean text wordmark instead of a
  // fabricated/approximate brand mark.
  return (
    <span className="pointer-events-none select-none whitespace-nowrap font-poppins text-[17px] font-medium tracking-[0.02em] text-[#F5F4F0]/70 transition-[opacity,transform] duration-[250ms] ease-out group-hover/logo:scale-[1.08] group-hover/logo:text-[#F5F4F0] sm:text-[18px] md:text-[19px]">
      {logo.alt}
    </span>
  );
});

export const LogoMarquee = memo(function LogoMarquee({
  logos,
  className,
}: {
  logos: Logo[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1500px] overflow-hidden py-4 [-webkit-mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)] [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]",
        className,
      )}
    >
      <InfiniteSlider gap={72} reverse duration={95} durationOnHover={40}>
        {[...logos, ...logos].map((logo, i) => (
          <div key={`${logo.alt}-${i}`} className="group/logo flex items-center justify-center">
            <LogoImage logo={logo} />
          </div>
        ))}
      </InfiniteSlider>
    </div>
  );
});

LogoMarquee.displayName = "LogoMarquee";
export default LogoMarquee;

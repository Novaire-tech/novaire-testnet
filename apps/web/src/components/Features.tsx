"use client";

import Image from "next/image";
import React from "react";

interface FeatureProps {
  href: string;
  imageSrc: string;
  altText: string;
}

function FeatureCard({ href, imageSrc, altText }: FeatureProps) {
  return (
    <a 
      href={href} 
      className="relative block w-full aspect-[4/3] cursor-pointer rounded-[24px] overflow-hidden transform transition-transform duration-300 ease-out hover:scale-[1.04] hover:-translate-y-2 group"
    >
      {/* Box shadow is applied below the image for subtle glow */}
      <div className="absolute inset-0 transition-shadow duration-300 ease-out group-hover:shadow-[0_20px_40px_rgba(62,207,142,0.3)] pointer-events-none rounded-[24px] z-10" />
      
      {/* 
        The image takes up exactly 100% of the parent aspect-[4/3] box 
        pointer-events-none ensures it doesn't block the <a> click/hover 
      */}
      <Image 
        src={imageSrc} 
        alt={altText}
        fill
        sizes="(max-width: 768px) 100vw, 33vw"
        className="object-cover pointer-events-none"
        priority
      />
    </a>
  );
}

export default function Features() {
  return (
    <section className="ways-section py-20 relative z-20">
      <div className="container">
        <span className="section-label reveal">ONE PROTOCOL</span>
        <h2 className="section-heading reveal">
          Multiple ways<br />
          <span className="playfair">to earn.</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
          <FeatureCard 
            href="/docs#principal-tokens"
            imageSrc="/images/yield.png"
            altText="Lock Fixed Yield - Deposit PT tokens and secure your return upfront with confidence."
          />
          <FeatureCard 
            href="/docs#yield-tokens"
            imageSrc="/images/variableyieldv2.png"
            altText="Earn Variable Yield - Hold YT tokens and capture the upside of future yield."
          />
          <FeatureCard 
            href="/docs#automation-features"
            imageSrc="/images/automation.png"
            altText="Automate Everything - Smart Accounts execute, rollover, and compound automatically so you don't have to."
          />
        </div>
      </div>
    </section>
  );
}

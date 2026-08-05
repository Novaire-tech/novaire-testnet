'use client';
import { useEffect, useRef } from 'react';

export default function Stats() {
  const statsRef = useRef<HTMLDivElement>(null);
  const hasAnimatedStats = useRef(false);

  useEffect(() => {
    const animateValue = (obj: HTMLElement, start: number, end: number, duration: number, isFloat: boolean, prefix = '', suffix = '', useComma = false) => {
      let startTimestamp: number | null = null;
      const step = (timestamp: number) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        
        let current: number | string = progress * (end - start) + start;
        if (isFloat) {
          current = current.toFixed(1);
        } else {
          current = Math.floor(current);
          if (useComma) {
            current = current.toLocaleString('en-US');
          }
        }
        
        obj.innerHTML = prefix + current + suffix;
        if (progress < 1) {
          window.requestAnimationFrame(step);
        } else {
          let finalVal: number | string = end;
          if (isFloat) finalVal = end.toFixed(1);
          else if (useComma) finalVal = Math.floor(end).toLocaleString('en-US');
          obj.innerHTML = prefix + finalVal + suffix;
        }
      };
      window.requestAnimationFrame(step);
    };

    const statsObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !hasAnimatedStats.current) {
        hasAnimatedStats.current = true;
        const statNumbers = document.querySelectorAll('.stat-number[data-target]');
        statNumbers.forEach((statObj) => {
          const target = parseFloat(statObj.getAttribute('data-target') || '0');
          const isFloat = target % 1 !== 0;
          const prefix = statObj.getAttribute('data-prefix') || '';
          const suffix = statObj.getAttribute('data-suffix') || '';
          const useComma = statObj.getAttribute('data-format') === 'comma';
          
          animateValue(statObj as HTMLElement, 0, target, 2000, isFloat, prefix, suffix, useComma);
        });
      }
    }, { threshold: 0.5 });

    if (statsRef.current) {
      statsObserver.observe(statsRef.current);
    }
    return () => statsObserver.disconnect();
  }, []);

  return (
    <section className="relative z-30 -mt-[820px] pb-12">
      <div className="container reveal" id="stats" ref={statsRef}>
        <div className="flex h-[116px] w-full max-w-[860px] items-center justify-between rounded-[16px] border border-nova-border bg-[#0B0B0B] px-[56px] shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          
          <div className="flex flex-col items-start justify-center">
            <div className="stat-number font-serif text-[44px] leading-none tracking-tight text-nova-accent" data-target="7">0</div>
            <div className="mt-2 text-[15px] font-medium text-[#A1A1AA]">Core Contracts</div>
          </div>
          
          <div className="h-[48px] w-[1px] bg-white/10"></div>
          
          <div className="flex flex-col items-start justify-center">
            <div className="stat-number font-serif text-[44px] leading-none tracking-tight text-nova-accent" data-target="100" data-suffix="+">0</div>
            <div className="mt-2 text-[15px] font-medium text-[#A1A1AA]">Test Cases</div>
          </div>
          
          <div className="h-[48px] w-[1px] bg-white/10"></div>
          
          <div className="flex flex-col items-start justify-center">
            <div className="stat-number font-serif text-[44px] leading-none tracking-tight text-nova-accent" data-target="3">0</div>
            <div className="mt-2 text-[15px] font-medium text-[#A1A1AA]">Protocol Layers</div>
          </div>
          
          <div className="h-[48px] w-[1px] bg-white/10"></div>
          
          <div className="flex flex-col items-start justify-center">
            <div className="font-serif text-[44px] leading-none tracking-tight text-nova-accent">PT &bull; YT</div>
            <div className="mt-2 text-[15px] font-medium text-[#A1A1AA]">Yield Primitive</div>
          </div>
          
        </div>
      </div>
    </section>
  );
}

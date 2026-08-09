'use client';

import { useEffect } from 'react';
import Navbar from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { HowNovaireWorks } from "@/components/HowNovaireWorks/Section";
import { TechMarquee } from "@/components/TechMarquee";
import Workflow from "@/components/Workflow";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";

export default function Home() {
  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: '0px',
      threshold: 0.15
    };

    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    const revealElements = document.querySelectorAll('.reveal');
    revealElements.forEach(el => revealObserver.observe(el));

    return () => {
      revealObserver.disconnect();
    };
  }, []);

  return (
    <>
      <Navbar />
      <Hero />
      <Workflow />
      <HowNovaireWorks />
      <TechMarquee />
      <FinalCTA />
      <Footer />
    </>
  );
}

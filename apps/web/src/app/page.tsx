'use client';

import { useEffect } from 'react';
import Navbar from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import Stats from "@/components/Stats";
import Features from "@/components/Features";
import Workflow from "@/components/Workflow";
import Ecosystem from "@/components/Ecosystem";
import BuiltOnStellar from "@/components/BuiltOnStellar";
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
      <Stats />
      <Features />
      <Workflow />
      <Ecosystem />
      <BuiltOnStellar />
      <Footer />
    </>
  );
}

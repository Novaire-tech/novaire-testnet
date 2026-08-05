"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";

export default function NavHeader() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          } else if (activeSection === entry.target.id) {
            setActiveSection("");
          }
        });
      },
      { rootMargin: "-100px 0px -60% 0px" }
    );

    const section = document.getElementById("how-it-works");
    if (section) observer.observe(section);

    return () => observer.disconnect();
  }, [activeSection]);

  const handleScrollToHowItWorks = (e: React.MouseEvent) => {
    e.preventDefault();
    const element = document.getElementById("how-it-works");
    if (element) {
      const headerOffset = 100;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
      setIsMobileMenuOpen(false);
    }
  };

  return (
    <>
      <nav className="absolute top-0 left-0 z-50 w-full font-sans bg-transparent border-b border-transparent">
        <div className="max-w-[1440px] mx-auto h-[88px] px-8 md:px-12 xl:px-16 flex items-center justify-between">
          
          {/* Left: Logo */}
          <div className="flex-1 flex items-center z-50">
            <Link
              href="/"
              className="flex items-center transition-opacity hover:opacity-80"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <Image
                src="/images/logos-v2.png"
                alt="Novaire"
                width={240}
                height={48}
                priority
                className="h-[34px] md:h-[38px] w-auto object-contain"
              />
            </Link>
          </div>

          {/* Center spacing empty block */}
          <div className="hidden md:flex flex-1"></div>

          {/* Right: Navigation Links & Actions */}
          <div className="flex-1 flex items-center justify-end gap-6 z-50">
            <ul className="hidden md:flex items-center justify-center gap-6 mr-2">
              <Tab 
                isActive={activeSection === "how-it-works"}
                onClick={handleScrollToHowItWorks}
              >
                How It Works
              </Tab>
              <Tab href="https://stellar.org/" external>
                Ecosystem
              </Tab>
              <Tab href="/docs">
                Docs
              </Tab>
            </ul>
            <Link
              href="/app"
              className="hidden md:inline-flex items-center justify-center px-6 py-3 rounded-full border border-[rgba(255,255,255,0.12)] bg-transparent text-white text-[14px] font-medium transition-all duration-[250ms] ease-out hover:bg-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.22)] whitespace-nowrap"
            >
              Launch App ↗
            </Link>

            {/* Hamburger Toggle */}
            <button
              className="md:hidden text-nova-text focus:outline-none transition-transform active:scale-95 p-2"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle mobile menu"
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Fullscreen Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="fixed inset-0 z-40 bg-nova-bg flex flex-col pt-[100px] px-8 pb-12 font-sans"
          >
            <div className="flex flex-col gap-6 items-start flex-1 overflow-y-auto">
              {[
                { label: 'How It Works', id: 'how-it-works' },
                { label: 'Ecosystem', href: 'https://stellar.org/', external: true },
                { label: 'Docs', href: '/docs' }
              ].map((item, idx) => (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 + 0.1, duration: 0.3 }}
                  key={item.label}
                  className="w-full"
                >
                  {item.id === 'how-it-works' ? (
                    <a
                      href={`#${item.id}`}
                      onClick={handleScrollToHowItWorks}
                      className={`text-[24px] font-medium transition-colors duration-200 block py-2 ${
                        activeSection === item.id ? 'text-white' : 'text-[#B8B8B8] hover:text-nova-text'
                      }`}
                    >
                      {item.label}
                    </a>
                  ) : item.href ? (
                    item.external ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#B8B8B8] hover:text-nova-text text-[24px] font-medium transition-colors duration-200 block py-2"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        {item.label}
                      </a>
                    ) : (
                      <Link
                        href={item.href}
                        className="text-[#B8B8B8] hover:text-nova-text text-[24px] font-medium transition-colors duration-200 block py-2"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        {item.label}
                      </Link>
                    )
                  ) : (
                    <Link
                      href="#"
                      className="text-[#B8B8B8] hover:text-nova-text text-[24px] font-medium transition-colors duration-200 block py-2"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      {item.label}
                    </Link>
                  )}
                </motion.div>
              ))}
            </div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.3 }}
              className="w-full mt-auto"
            >
              <Link
                href="/app"
                className="flex items-center justify-center w-full px-6 py-3 rounded-full border border-[rgba(255,255,255,0.12)] bg-transparent text-white text-[16px] font-medium transition-all duration-[250ms] ease-out hover:bg-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.22)] whitespace-nowrap"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Launch App ↗
              </Link>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

const Tab = ({
  children,
  isActive,
  onClick,
  href,
  external
}: {
  children: React.ReactNode;
  isActive?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  href?: string;
  external?: boolean;
}) => {
  const innerContent = (
    <>
      <div 
        className={`absolute inset-0 w-full h-full rounded-full border transition-all duration-300 ease-out pointer-events-none backdrop-blur-[8px] ${
          isActive 
            ? 'opacity-100 scale-100 bg-[#0F5E3A]/80 border-nova-accent/20' 
            : 'border-transparent opacity-0 scale-[0.97] group-hover:opacity-100 group-hover:scale-100 group-hover:bg-[#0F5E3A]/80 group-hover:border-nova-accent/20'
        }`} 
      />
      <span className="relative z-10">{children}</span>
    </>
  );

  const className = `relative group block cursor-pointer px-[18px] py-[10px] text-[14px] font-medium transition-colors duration-300 ${
    isActive ? 'text-white' : 'text-[#B8B8B8] hover:text-white'
  }`;

  if (href) {
    if (external) {
      return (
        <li className="list-none">
          <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick as any} className={className}>
            {innerContent}
          </a>
        </li>
      );
    }
    return (
      <li className="list-none">
        <Link href={href} onClick={onClick as any} className={className}>
          {innerContent}
        </Link>
      </li>
    );
  }

  return (
    <li onClick={onClick as any} className={className}>
      {innerContent}
    </li>
  );
};

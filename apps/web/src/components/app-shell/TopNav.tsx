'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Bell, Settings } from 'lucide-react';
import { SettingsDropdown } from './SettingsDropdown';
import { NotificationCenter } from '../notifications/NotificationCenter';
import { useNotifications } from '../../hooks/useNotifications';

const TOP_LINKS = [
  { label: 'Dashboard', href: '/app' },
  { label: 'Portfolio', href: '/app/portfolio' },
  { label: 'Vaults', href: '/app/vaults' },
  { label: 'Automation', href: '/app/automation' },
  { label: 'Analytics', href: '/app/analytics' },
  { label: 'Resources', href: '/docs' },
];

export function TopNav() {
  const pathname = usePathname();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const { unreadCount } = useNotifications();

  useEffect(() => {
    const handleOpen = () => setIsSettingsOpen(true);
    window.addEventListener('novaire:open_settings', handleOpen);
    return () => window.removeEventListener('novaire:open_settings', handleOpen);
  }, []);

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1, ease: 'easeOut' }}
      className="flex h-[68px] w-full shrink-0 items-center justify-between border-b border-white/10 bg-[#0A0A0A] px-6"
    >
      {/* Left: Wordmark & Links */}
      <div className="flex h-full items-center gap-8">
        <Image 
          src="/images/logos-v2.png" 
          alt="Novaire" 
          width={180} 
          height={36} 
          className="h-[36px] w-auto object-contain"
        />
        
        <nav className="hidden h-full md:flex items-center gap-6">
          {TOP_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative flex h-full items-center text-[14px] font-medium transition-colors ${
                  isActive ? 'text-[#F5F5F2]' : 'text-[#8E8E8E] hover:text-[#F5F5F2]'
                }`}
              >
                {link.label}
                {isActive && (
                  <motion.div
                    layoutId="activeTopNavIndicator"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#3ECF8E]"
                    transition={{ duration: 0.2 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Notification & Settings */}
        <div className="relative">
          <motion.button 
            whileHover={{ scale: 1.05 }}
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-[#8E8E8E] transition-all hover:border-white/10 hover:bg-[#111111] hover:text-[#F5F5F2]"
          >
            <Bell className="h-[18px] w-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 flex h-2 w-2 items-center justify-center rounded-full bg-[#3ECF8E] text-[10px] font-bold text-black ring-2 ring-[#0A0A0A]">
              </span>
            )}
          </motion.button>
          
          <NotificationCenter 
            isOpen={isNotificationsOpen} 
            onClose={() => setIsNotificationsOpen(false)} 
          />
        </div>
        
        <div className="relative">
          <motion.button 
            whileHover={{ scale: 1.05 }}
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-[#8E8E8E] transition-all hover:border-white/10 hover:bg-[#111111] hover:text-[#F5F5F2]"
          >
            <Settings className="h-[18px] w-[18px]" />
          </motion.button>
          <SettingsDropdown 
            isOpen={isSettingsOpen} 
            onClose={() => setIsSettingsOpen(false)} 
          />
        </div>

        {/* Stellar Network Icon */}
        <button 
          className="ml-1 flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.03)] transition-all duration-200 hover:border-[#3ECF8E] hover:bg-[rgba(255,255,255,0.08)]"
        >
          <Image 
            src="/images/stellar.svg" 
            alt="Stellar" 
            width={20} 
            height={20} 
            className="h-[18px] w-[18px] object-contain brightness-0 invert opacity-90"
          />
        </button>
      </div>
    </motion.header>
  );
}

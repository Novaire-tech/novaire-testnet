'use client';

import { useTheme } from '@/providers/ThemeProvider';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Return a placeholder of the same size to prevent layout shift
    return <div className="h-9 w-9" />;
  }

  return (
    <button
      onClick={toggleTheme}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-nova-muted transition-all hover:border-nova-border hover:bg-nova-surface hover:text-nova-text dark:hover:border-nova-border dark:hover:bg-nova-surface dark:hover:text-nova-text hover:border-black/10 hover:bg-black/5 hover:text-black"
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? (
        <Moon className="h-[18px] w-[18px]" strokeWidth={1.5} />
      ) : (
        <Sun className="h-[18px] w-[18px]" strokeWidth={1.5} />
      )}
    </button>
  );
}

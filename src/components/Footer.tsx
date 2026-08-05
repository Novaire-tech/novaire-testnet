import Image from 'next/image';

export default function Footer() {
  return (
    <footer className="bg-[#0D0D0D] border-t border-nova-border py-10 md:py-20">
      <div className="container mx-auto px-8 md:px-16 lg:px-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-10">
          <div>
            <div className="flex items-center gap-2 text-[13px] font-semibold tracking-[0.15em] text-white">
              <Image 
                src="/images/logos-v2.png" 
                alt="Novaire" 
                width={160} 
                height={32} 
                className="h-[32px] w-auto object-contain"
              />
            </div>
            <div className="mt-3 text-[13px] leading-[1.6] text-nova-muted max-w-[200px]">
              The Autonomous Yield Layer for Stellar and Soroban.
            </div>
            <div className="mt-5 flex gap-4">
              <a href="#" className="w-[18px] h-[18px] text-nova-muted hover:text-white transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/></svg>
              </a>
              <a href="#" className="w-[18px] h-[18px] text-nova-muted hover:text-white transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
              </a>
              <a href="#" className="w-[18px] h-[18px] text-nova-muted hover:text-white transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              </a>
            </div>
          </div>
          <div className="flex flex-col">
            <div className="mb-5 text-[11px] uppercase tracking-[0.12em] text-nova-muted">Products</div>
            <a href="#" className="mt-3 block text-[13px] text-nova-muted transition-colors hover:text-white">Yield Vaults</a>
            <a href="#" className="mt-3 block text-[13px] text-nova-muted transition-colors hover:text-white">PT / YT Tokens</a>
            <a href="#" className="mt-3 block text-[13px] text-nova-muted transition-colors hover:text-white">Smart Accounts</a>
            <a href="#" className="mt-3 block text-[13px] text-nova-muted transition-colors hover:text-white">Analytics</a>
          </div>
          <div className="flex flex-col">
            <div className="mb-5 text-[11px] uppercase tracking-[0.12em] text-nova-muted">Developers</div>
            <a href="#" className="mt-3 block text-[13px] text-nova-muted transition-colors hover:text-white">Documentation</a>
            <a href="#" className="mt-3 block text-[13px] text-nova-muted transition-colors hover:text-white">Github</a>
            <a href="#" className="mt-3 block text-[13px] text-nova-muted transition-colors hover:text-white">Smart Contracts</a>
            <a href="#" className="mt-3 block text-[13px] text-nova-muted transition-colors hover:text-white">Bug Bounty</a>
          </div>
          <div className="flex flex-col">
            <div className="mb-5 text-[11px] uppercase tracking-[0.12em] text-nova-muted">Company</div>
            <a href="#" className="mt-3 block text-[13px] text-nova-muted transition-colors hover:text-white">About</a>
            <a href="#" className="mt-3 block text-[13px] text-nova-muted transition-colors hover:text-white">Blog</a>
            <a href="#" className="mt-3 block text-[13px] text-nova-muted transition-colors hover:text-white">Careers</a>
            <a href="#" className="mt-3 block text-[13px] text-nova-muted transition-colors hover:text-white">Brand Assets</a>
          </div>
        </div>
        <div className="mt-[60px] flex flex-col md:flex-row justify-between border-t border-nova-border pt-6 text-[12px] text-nova-muted gap-4 md:gap-0">
          <div>© 2026 X7710 Labs. All rights reserved.</div>
          <div className="flex gap-6">
            <a href="#" className="transition-colors hover:text-white">Privacy Policy</a>
            <a href="#" className="transition-colors hover:text-white">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

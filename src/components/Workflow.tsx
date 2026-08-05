export default function Workflow() {
  return (
    <section className="how-section" id="how-it-works">
      <div className="container">
        <div className="how-header reveal flex flex-col md:flex-row justify-between md:items-end items-start mb-[80px] gap-6 md:gap-0">
          <div>
            <span className="section-label">HOW IT WORKS</span>
            <h2 className="section-heading" style={{ marginBottom: 0 }}>
              Simple by design.<br />
              <span className="playfair">Powerful by default.</span>
            </h2>
          </div>
        </div>
        <div className="relative flex flex-col md:flex-row justify-between gap-10 md:gap-4 reveal w-full">
          <div className="hidden md:block absolute top-[28px] left-[10%] right-[10%] h-[1px] border-t border-dashed border-nova-border z-[1]"></div>
          
          <div className="step group relative cursor-pointer pb-4">
            <div className="step-icon transition-colors duration-[250ms] ease-out group-hover:!text-[#3ECF8E]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
            </div>
            <div className="step-num transition-colors duration-[250ms] ease-out group-hover:!text-[#3ECF8E]">01</div>
            <div className="step-title w-fit relative transition-colors duration-[250ms] ease-out group-hover:!text-[#3ECF8E]">
              Deposit
              <span className="absolute left-0 -bottom-2 h-[2px] w-0 bg-[#3ECF8E] transition-all duration-300 group-hover:w-full z-10"></span>
            </div>
            <div className="step-desc">Deposit assets into our Yield Vaults.</div>
          </div>

          <div className="step group relative cursor-pointer pb-4">
            <div className="step-icon transition-colors duration-[250ms] ease-out group-hover:!text-[#3ECF8E]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                <line x1="12" y1="22.08" x2="12" y2="12"></line>
              </svg>
            </div>
            <div className="step-num transition-colors duration-[250ms] ease-out group-hover:!text-[#3ECF8E]">02</div>
            <div className="step-title w-fit relative transition-colors duration-[250ms] ease-out group-hover:!text-[#3ECF8E]">
              Tokenize
              <span className="absolute left-0 -bottom-2 h-[2px] w-0 bg-[#3ECF8E] transition-all duration-300 group-hover:w-full z-10"></span>
            </div>
            <div className="step-desc">Assets are tokenized into PT and YT.</div>
          </div>

          <div className="step group relative cursor-pointer pb-4">
            <div className="step-icon transition-colors duration-[250ms] ease-out group-hover:!text-[#3ECF8E]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <div className="step-num transition-colors duration-[250ms] ease-out group-hover:!text-[#3ECF8E]">03</div>
            <div className="step-title w-fit relative transition-colors duration-[250ms] ease-out group-hover:!text-[#3ECF8E]">
              Earn
              <span className="absolute left-0 -bottom-2 h-[2px] w-0 bg-[#3ECF8E] transition-all duration-300 group-hover:w-full z-10"></span>
            </div>
            <div className="step-desc">Hold PT for fixed yield or YT for variable returns.</div>
          </div>

          <div className="step group relative cursor-pointer pb-4">
            <div className="step-icon transition-colors duration-[250ms] ease-out group-hover:!text-[#3ECF8E]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </div>
            <div className="step-num transition-colors duration-[250ms] ease-out group-hover:!text-[#3ECF8E]">04</div>
            <div className="step-title w-fit relative transition-colors duration-[250ms] ease-out group-hover:!text-[#3ECF8E]">
              Automate
              <span className="absolute left-0 -bottom-2 h-[2px] w-0 bg-[#3ECF8E] transition-all duration-300 group-hover:w-full z-10"></span>
            </div>
            <div className="step-desc">Smart Accounts auto-roll your positions at maturity.</div>
          </div>
        </div>
      </div>
    </section>
  );
}

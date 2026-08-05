export default function Ecosystem() {
  const partners = [
    'STELLAR',
    'SOROBAN',
    'AQUARIUS',
    'BLEND',
    'FREIGHTER'
  ];

  return (
    <>
      <section className="ecosystem-section" id="ecosystem">
        <div className="container">
          <div className="eco-header reveal md:gap-x-24 lg:gap-x-32">
            <div className="eco-left">
              <span className="section-label">BUILT FOR THE ECOSYSTEM</span>
              <h2 className="section-heading" style={{ marginBottom: 0 }}>
                Composability.<br />
                Liquidity. <span className="playfair">Growth.</span>
              </h2>
            </div>
            <div className="eco-right">
              Novaire is designed to be the yield infrastructure primitive for the entire Stellar ecosystem.
            </div>
          </div>
          
          <div className="w-full mt-16 bg-[var(--charcoal)] border border-nova-border rounded-lg h-[64px] overflow-hidden reveal relative group">
            <div className="flex items-center h-full w-full">
              <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused]">
                {/* 
                  Render two identical sets to create a seamless infinite loop. 
                  The animation translates exactly -50%, which aligns the start of the second set 
                  perfectly with the start of the first.
                */}
                {[...partners, ...partners].map((name, index) => (
                  <span 
                    key={`${name}-${index}`}
                    className="text-white/75 hover:text-nova-accent transition-colors duration-[250ms] ease-in-out cursor-default uppercase shrink-0"
                    style={{
                      fontFamily: "'Antic Didone', serif",
                      fontSize: "20px",
                      fontWeight: 400,
                      letterSpacing: "0.08em",
                      marginRight: "140px"
                    }}
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

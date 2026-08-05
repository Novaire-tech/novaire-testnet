import { HeroContent } from "./hero/HeroContent";
import { HeroVisual } from "./hero/HeroVisual";

export function Hero() {
  return (
    <section className="relative w-full overflow-visible bg-transparent pt-[160px]">

      <div className="container mx-auto grid grid-cols-12 relative z-10">

        <div className="col-span-5 z-20">
          <HeroContent />
        </div>

        {/* Added pointer-events-none to prevent the 1350px tall visual from intercepting clicks below it */}
        <div className="col-span-7 relative overflow-visible pointer-events-none">
          <HeroVisual />
        </div>

      </div>
    </section>
  );
}
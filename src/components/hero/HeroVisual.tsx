import Image from 'next/image';

export function HeroVisual() {
  return (
    <div className="relative flex h-full w-full items-center justify-end overflow-visible -translate-y-[400px] pointer-events-none">

      {/* Emerald Glow */}
      <div
        className="absolute right-[-20px] top-1/2 h-[900px] w-[900px] -translate-y-1/2 rounded-full blur-[180px] opacity-40"
        style={{
          background:
            "radial-gradient(circle, rgba(62,207,142,.10) 0%, rgba(62,207,142,.05) 45%, transparent 75%)",
        }}
      />

      <div className="relative h-[1350px] w-[1350px] translate-x-[20px]">

        <Image
          src="/images/hero-artwork-v2.png"
          alt="Novaire Hero"
          fill
          priority
          sizes="60vw"
          className="object-contain object-center pointer-events-none select-none z-[2]"
        />

      </div>
    </div>
  );
}

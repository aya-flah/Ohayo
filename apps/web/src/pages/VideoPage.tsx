import { useEffect } from 'react';
import { LangPicker } from '../components/LangPicker';

/** Public watch page for the demo video: one player, nothing else in the way. */
export default function VideoPage() {
  useEffect(() => {
    const prev = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', 'dark');
    const title = document.title;
    document.title = 'Sonae Zitoun · Demo video';
    return () => {
      document.title = title;
      if (prev) document.documentElement.setAttribute('data-theme', prev);
    };
  }, []);

  return (
    <div className="min-h-dvh text-ink" style={{ background: 'radial-gradient(120% 80% at 70% 0%, #1c3d60 0%, #0f2033 50%, #070d17 100%)' }}>
      <div className="mx-auto flex max-w-[1100px] flex-col px-4 pb-10 md:px-8" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <header className="flex items-center justify-between gap-3">
          <a href="/" className="glass glass-edge flex min-w-0 items-center gap-2.5 rounded-full p-1.5 pr-4" aria-label="Open the Sonae prototype">
            <span lang="ja" className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] font-jp text-[18px] font-extrabold text-white" style={{ background: 'linear-gradient(145deg, var(--water), var(--water-deep))' }}>
              備
            </span>
            <span className="whitespace-nowrap text-[15px] font-extrabold text-white">
              Sonae <span className="font-semibold text-white/60">Zitoun</span>
            </span>
          </a>
          <LangPicker size={44} tone="white" />
        </header>

        <h1 className="mt-8 text-[26px] leading-tight font-extrabold text-white md:text-[36px]">The full tour in 3 minutes</h1>
        <p className="mt-2 max-w-[640px] text-[15px] leading-relaxed text-white/70 md:text-[16px]">
          Every feature of the prototype: the daily margine plan, the 3D olive region and process, the AI lab reader and assistant, accounts and season plans, the blockchain ledger, and the site in Arabic and Japanese.
        </p>

        <div className="mt-6 overflow-hidden rounded-[22px] border border-white/10 bg-black shadow-[0_30px_80px_-30px_rgba(58,160,232,.45)]">
          <video className="block aspect-video w-full" src="/video/sonae-zitoun-tour.mp4" poster="/video/sonae-zitoun-tour.jpg" controls playsInline preload="metadata">
            Your browser can't play this video. <a href="/video/sonae-zitoun-tour.mp4">Download it</a>.
          </video>
        </div>

        <div className="mt-5 flex flex-wrap gap-2.5">
          <a className="btn btn-primary" href="/">
            Try the live prototype
          </a>
          <a className="btn" href="/3d">
            Open the 3D process
          </a>
          <a className="btn btn-quiet" href="/video/sonae-zitoun-tour.mp4" download>
            Download the video
          </a>
        </div>
        <p className="mt-4 text-[13px] text-white/50">2:58 · no sound · recorded on the working prototype, with real Sepolia transactions.</p>
      </div>
    </div>
  );
}

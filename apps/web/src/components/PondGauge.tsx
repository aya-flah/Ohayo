import { motion } from 'motion/react';
import { AnimatedNumber, EASE } from './ui';

/** A margine pond as a liquid column: brown margine, a coral brim line, the level rolling like a meter. */
export function PondGauge({ name, town, m3, capacity, compact = false }: { name: string; town?: string; m3: number; capacity: number; compact?: boolean }) {
  const share = Math.max(0, Math.min(1, m3 / capacity));
  const hot = share >= 0.9;
  const warm = share >= 0.75;
  const tone = hot ? 'var(--cut)' : warm ? 'var(--solar)' : 'var(--margine)';
  return (
    <div className="flex items-end gap-3">
      <div className={`relative overflow-hidden rounded-[14px] border border-line bg-surface ${compact ? 'h-20 w-9' : 'h-28 w-12'}`} role="img" aria-label={`${name} pond ${Math.round(share * 100)}% full`}>
        <motion.div
          className="absolute inset-x-0 bottom-0"
          style={{ background: 'linear-gradient(180deg, color-mix(in oklab, var(--margine) 85%, #000) 0%, #2a1a0e 100%)' }}
          initial={{ height: 0 }}
          animate={{ height: `${share * 100}%` }}
          transition={{ duration: 0.8, ease: EASE }}
        >
          <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: tone, boxShadow: `0 0 10px ${tone}` }} />
        </motion.div>
        <span className="absolute inset-x-0 top-[10%] border-t border-dashed" style={{ borderColor: 'color-mix(in oklab, var(--cut) 70%, transparent)' }} title="90% brim" />
      </div>
      <div className="min-w-0 pb-0.5">
        <div className="truncate text-[14px] font-bold">{name}</div>
        {town && <div className="truncate text-[12.5px] text-ink-3">{town}</div>}
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-[22px] leading-none font-extrabold" style={{ color: tone }}>
            <AnimatedNumber value={share * 100} />%
          </span>
        </div>
        <div className="num text-[12.5px] text-ink-2">
          <AnimatedNumber value={m3} /> / {capacity.toLocaleString('en-US')} m³
        </div>
      </div>
    </div>
  );
}

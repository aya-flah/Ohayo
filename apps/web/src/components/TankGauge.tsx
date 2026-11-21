import { fmt } from '../lib/format';

interface Props {
  levelM3: number;
  capacityM3: number;
  reserveM3: number;
  timeLabel: string;
  pump: 'solar' | 'grid' | 'diesel' | 'off';
  gridOn: boolean;
}

const PUMP_WORDS = { solar: 'Pumping on sun', grid: 'Pumping on grid', diesel: 'Pumping on diesel', off: 'Pump off' } as const;

/** The tank itself: water rises and falls with the timeline cursor. */
export function TankGauge({ levelM3, capacityM3, reserveM3, timeLabel, pump, gridOn }: Props) {
  const share = Math.max(0, Math.min(1, levelM3 / capacityM3));
  const reserveShare = reserveM3 / capacityM3;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-[232px] w-[112px]" aria-hidden>
        <div className="absolute inset-0 overflow-hidden rounded-[22px] border-2 border-water bg-surface-2">
          <div
            className="absolute inset-x-0 bottom-0 h-full origin-bottom bg-gradient-to-b from-water to-[color-mix(in_oklch,var(--water)_70%,var(--accent-strong))]"
            style={{ transform: `scaleY(${share})`, transition: 'transform var(--motion-300) var(--ease-out)' }}
          />
          <div className="absolute inset-x-0 border-t border-dashed border-ink-3" style={{ bottom: `${reserveShare * 100}%` }} />
        </div>
        <div className="absolute -right-2 top-3 h-2 w-2 rounded-full" style={{ background: gridOn ? 'var(--ok)' : 'var(--cut)' }} />
      </div>
      <div className="text-center">
        <div className="font-display text-[34px] leading-none font-extrabold num">{fmt(levelM3)} m³</div>
        <div className="mt-1 text-[13px] text-ink-2 num">
          {fmt(share * 100)}% full, {timeLabel}
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5 text-[12.5px]">
        <span
          className="rounded-full px-2.5 py-1"
          style={{
            background: pump === 'solar' ? 'var(--solar-soft)' : pump === 'off' ? 'var(--surface-2)' : 'var(--accent-soft)',
            color: 'var(--ink)',
          }}
        >
          {PUMP_WORDS[pump]}
        </span>
        <span className="rounded-full px-2.5 py-1" style={{ background: gridOn ? 'var(--ok-soft)' : 'var(--cut-soft)', color: gridOn ? 'var(--ink)' : 'var(--cut)' }}>
          {gridOn ? 'Grid on' : 'STEG cut'}
        </span>
      </div>
    </div>
  );
}

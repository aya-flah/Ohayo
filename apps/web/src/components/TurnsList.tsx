import { motion } from 'motion/react';
import { toMs, type Plan, type PlanInput, type Turn } from '@sonae/shared';
import { clock, dayLabel, fmt } from '../lib/format';
import { IconMessage } from './Icons';

interface Props {
  plan: Plan;
  input: PlanInput;
  onSms: (turn: Turn) => void;
}

/** Bansui turns, grouped by day, in the order the water flows. */
export function TurnsList({ plan, input, onSms }: Props) {
  const groups = new Map<string, Turn[]>();
  for (const t of plan.turns) {
    const key = dayLabel(t.start, input.now);
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return (
    <div className="space-y-7">
      {[...groups.entries()].map(([day, turns]) => (
        <section key={day}>
          <h3 className="mb-2.5 flex items-baseline justify-between">
            <span className="font-display text-[19px] font-extrabold">{day}</span>
            <span className="text-[13px] text-ink-2 num">
              {turns.length} turns, {fmt(turns.reduce((a, t) => a + t.volumeM3, 0))} m³
            </span>
          </h3>
          <ol className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-surface">
            {turns.map((t, k) => {
              const farmer = input.farmers.find((f) => f.id === t.farmerId);
              const plot = input.plots.find((p) => p.id === t.plotId);
              const minutes = Math.round((toMs(t.end) - toMs(t.start)) / 60_000);
              return (
                <motion.li layout="position" key={`${t.plotId}-${t.start}`} className="grid grid-cols-[2.2rem_1fr_auto] items-start gap-3 px-4 py-3.5">
                  <span className="pt-0.5 font-display text-[17px] font-extrabold text-accent num">{k + 1}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2.5">
                      <span className="font-medium num">
                        {clock(t.start)} to {clock(t.end)}
                      </span>
                      <span className="text-ink-2">
                        {farmer?.name}, {plot?.name}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[13px] leading-snug text-ink-2">
                      {t.reason} <span className="num">{fmt(t.volumeM3)} m³ over {minutes} min.</span>
                    </p>
                  </div>
                  <button className="btn btn-quiet px-2.5 py-1.5 text-[13px]" onClick={() => onSms(t)} aria-label={`Preview the SMS for ${farmer?.name ?? 'this farmer'}`}>
                    <IconMessage width={16} height={16} />
                    SMS
                  </button>
                </motion.li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

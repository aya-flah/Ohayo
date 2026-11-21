import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { turnSms } from '@sonae/engine';
import { toMs, type PlanInput, type Turn } from '@sonae/shared';
import { IconClose } from './Icons';
import { tap } from '../lib/device';

interface Props {
  turn: Turn | null;
  input: PlanInput;
  onClose: () => void;
}

/** The farmer's view: one plain SMS in Derja on a basic phone. */
export function PhoneSms({ turn, input, onClose }: Props) {
  const [script, setScript] = useState<'latin' | 'arabic'>('latin');
  const farmer = turn ? input.farmers.find((f) => f.id === turn.farmerId) : undefined;
  const plot = turn ? input.plots.find((p) => p.id === turn.plotId) : undefined;

  useEffect(() => {
    if (farmer) setScript(farmer.smsScript);
  }, [farmer]);

  useEffect(() => {
    if (!turn) return;
    tap('light');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turn, onClose]);

  const text = turn && plot ? turnSms(turn, plot, toMs(input.now), script) : '';
  const perSms = script === 'latin' ? 160 : 70;

  return (
    <AnimatePresence>
      {turn && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-4 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] } }}
          exit={{ opacity: 0, transition: { duration: 0.15, ease: [0.7, 0, 0.84, 0] } }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`SMS to ${farmer?.name ?? 'farmer'}`}
            className="w-full max-w-[340px]"
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1, transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] } }}
            exit={{ y: 8, opacity: 0, transition: { duration: 0.15, ease: [0.7, 0, 0.84, 0] } }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-[34px] border-[10px] border-stone-900 bg-stone-900 shadow-2xl">
              <div className="overflow-hidden rounded-[24px] bg-[#f4f6f8] text-stone-950">
                <div className="flex items-center justify-between bg-white px-4 py-3">
                  <div>
                    <div className="text-[13px] font-bold">GDA Sidi Ali</div>
                    <div className="text-[11px] text-stone-500">SMS to {farmer?.name}, {farmer?.phone}</div>
                  </div>
                  <button className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100" onClick={onClose} aria-label="Close">
                    <IconClose width={18} height={18} />
                  </button>
                </div>
                <div className="min-h-[220px] px-4 py-5">
                  <motion.p
                    key={script}
                    dir={script === 'arabic' ? 'rtl' : 'ltr'}
                    className="max-w-[85%] rounded-[18px] rounded-bl-[6px] bg-white px-3.5 py-2.5 text-[15px] leading-snug shadow-sm"
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } }}
                  >
                    {text}
                  </motion.p>
                  <p className="mt-3 text-[11.5px] text-stone-500 num">
                    {text.length} of {perSms} characters, 1 SMS{script === 'arabic' ? ' (Arabic script fits 70)' : ''}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-3 flex justify-center gap-2">
              <button className={`btn ${script === 'latin' ? 'btn-primary' : 'btn-quiet bg-surface'}`} onClick={() => setScript('latin')}>
                Derja, Latin letters
              </button>
              <button className={`btn ${script === 'arabic' ? 'btn-primary' : 'btn-quiet bg-surface'}`} onClick={() => setScript('arabic')}>
                عربي
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

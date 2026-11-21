import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { localHour, toMs, toTunisISO, HOUR, type Outage } from '@sonae/shared';
import { useOnline } from '../lib/device';
import { IconClose } from './Icons';

const API = import.meta.env.VITE_API_URL as string | undefined;

/** "2026-07-21T10:00" (Tunis time, as typed) from a timestamp. */
function toInput(ms: number) {
  return toTunisISO(ms).slice(0, 16);
}

interface Props {
  open: boolean;
  nowIso: string;
  onClose: () => void;
  onAdd: (o: Outage) => void;
}

/** Add a STEG cut by hand, or let Claude read the STEG notice. */
export function OutageDialog({ open, nowIso, onClose, onAdd }: Props) {
  const online = useOnline();
  const nowMs = toMs(nowIso);
  const tomorrow10 = nowMs - localHour(nowMs) * HOUR + 34 * HOUR;
  const [start, setStart] = useState(toInput(tomorrow10));
  const [end, setEnd] = useState(toInput(tomorrow10 + 6 * HOUR));
  const [notice, setNotice] = useState('');
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const readNotice = async () => {
    if (!API) return;
    setReading(true);
    setMessage(null);
    try {
      const res = await fetch(`${API}/ai/notice`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: notice, today: nowIso.slice(0, 10) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `API answered ${res.status}`);
      if (data.found && data.start && data.end) {
        setStart(toInput(toMs(data.start)));
        setEnd(toInput(toMs(data.end)));
        setMessage(`Read: ${data.summary}`);
      } else {
        setMessage('No cut found in that text. Enter the times by hand.');
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not read the notice.');
    } finally {
      setReading(false);
    }
  };

  const save = () => {
    const s = `${start}:00+01:00`;
    const e = `${end}:00+01:00`;
    if (toMs(e) <= toMs(s)) {
      setMessage('The cut must end after it starts.');
      return;
    }
    onAdd({ id: `cut-${Date.now()}`, start: s, end: e, source: notice ? 'steg-notice' : 'manual' });
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
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
            aria-labelledby="cut-title"
            className="card w-full max-w-[460px] p-6"
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1, transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] } }}
            exit={{ y: 8, opacity: 0, transition: { duration: 0.15, ease: [0.7, 0, 0.84, 0] } }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 id="cut-title" className="font-display text-[22px] font-extrabold">
                Add a STEG cut
              </h2>
              <button className="rounded-full p-1.5 text-ink-2 hover:bg-surface-2" onClick={onClose} aria-label="Close">
                <IconClose />
              </button>
            </div>
            <p className="mt-1 text-[13.5px] text-ink-2">Sonae re-plans at once: it fills the tank before the cut and keeps the grid out of it.</p>

            <label className="label mt-5" htmlFor="notice">
              Paste a STEG notice (Arabic or French)
            </label>
            <textarea id="notice" className="field min-h-[84px]" value={notice} onChange={(e) => setNotice(e.target.value)} placeholder="انقطاع التيار الكهربائي يوم ... من الساعة 10 إلى 16 ..." />
            <button className="btn btn-quiet mt-2" disabled={!API || !online || !notice.trim() || reading} onClick={readNotice}>
              {reading ? 'Reading…' : 'Read it with Claude'}
            </button>
            {(!API || !online) && <p className="mt-1.5 text-[12.5px] text-ink-3">{!online ? 'Offline: enter the times by hand.' : 'Set VITE_API_URL to use the notice reader.'}</p>}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="cut-start">
                  Starts (Tunis time)
                </label>
                <input id="cut-start" type="datetime-local" className="field num" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="cut-end">
                  Ends
                </label>
                <input id="cut-end" type="datetime-local" className="field num" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            {message && <p className="mt-3 text-[13px] text-ink-2">{message}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button className="btn btn-quiet" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={save}>
                Add cut and re-plan
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

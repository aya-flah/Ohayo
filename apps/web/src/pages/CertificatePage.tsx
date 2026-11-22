import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { createPublicClient, fallback, http, type Address } from 'viem';
import { sepolia } from 'viem/chains';
import QRCode from 'qrcode';
import { zitounAbi, zitounFor, SEPOLIA_ID } from '../web3/config';
import { fmt } from '../lib/format';

/**
 * The Zero-Spill certificate as a document: read from Sepolia, laid out as an A4 landscape
 * certificate, and printable to PDF. The QR printed on a bottle opens this page.
 */

interface Cert {
  mill: Address;
  batchRef: `0x${string}`;
  litres: number;
  declaredM3: bigint;
  deliveredM3: bigint;
  loads: number;
  issuedAt: bigint;
}

const client = createPublicClient({ chain: sepolia, transport: fallback([http('https://ethereum-sepolia-rpc.publicnode.com'), http()]) });
const CONTRACT = zitounFor(SEPOLIA_ID)!;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const batchName = (hash: string): string | undefined => {
  try {
    return (JSON.parse(localStorage.getItem('sonae-cert-batches') ?? '{}') as Record<string, string>)[hash];
  } catch {
    return undefined;
  }
};
// "Maasra El Amel" reads better as "Maâsra El Amel" on a formal document.
const prettyMill = (n: string) => n.replace(/^Maasra\b/i, 'Maâsra');

const W = 1123; // A4 landscape at 96 dpi
const H = 794;

/** An olive sprig drawn in strokes: the certificate's corner ornament. */
function Sprig({ className, flip = false }: { className?: string; flip?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 160 160" fill="none" aria-hidden style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M12 148 C 50 110, 82 72, 150 14" stroke="#6b7f3a" strokeWidth="2.2" strokeLinecap="round" />
      {[
        [34, 124, -38],
        [52, 104, 18],
        [66, 92, -42],
        [84, 74, 14],
        [98, 60, -46],
        [116, 44, 10],
        [128, 32, -50],
      ].map(([x, y, r], i) => (
        <ellipse key={i} cx={x} cy={y} rx="15" ry="5.2" transform={`rotate(${r} ${x} ${y})`} fill={i % 2 ? '#8ea35a' : '#6b7f3a'} opacity={0.85} />
      ))}
      <circle cx="74" cy="88" r="5" fill="#2f3b18" />
      <circle cx="108" cy="56" r="4.4" fill="#2f3b18" />
    </svg>
  );
}

export default function CertificatePage() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const [cert, setCert] = useState<Cert | null>(null);
  const [mill, setMill] = useState<string>('');
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading');
  const [qr, setQr] = useState('');
  const [scale, setScale] = useState(1);
  const stage = useRef<HTMLDivElement>(null);
  const verifyUrl = `${window.location.origin}/certificate/${id}`;

  useEffect(() => {
    const prev = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', 'dark');
    const title = document.title;
    document.title = `Zero-Spill certificate #${id} · Sonae Zitoun`;
    return () => {
      document.title = title;
      if (prev) document.documentElement.setAttribute('data-theme', prev);
    };
  }, [id]);

  useEffect(() => {
    if (!Number.isInteger(id) || id < 1) {
      setState('missing');
      return;
    }
    let live = true;
    (async () => {
      try {
        const list = (await client.readContract({ address: CONTRACT, abi: zitounAbi, functionName: 'getCertificates', args: [BigInt(id), 1n] })) as Cert[];
        const c = list[0];
        if (!live) return;
        if (!c || c.mill === '0x0000000000000000000000000000000000000000') {
          setState('missing');
          return;
        }
        const stats = (await client.readContract({ address: CONTRACT, abi: zitounAbi, functionName: 'millStats', args: [c.mill] })) as readonly [string, boolean, bigint, bigint, number, number];
        if (!live) return;
        setCert(c);
        setMill(prettyMill(stats[0] || 'Registered mill'));
        setState('ok');
      } catch {
        if (live) setState('error');
      }
    })();
    QRCode.toDataURL(verifyUrl, { margin: 1, width: 360, errorCorrectionLevel: 'M', color: { dark: '#1f2a12', light: '#fffdf6' } }).then((u) => live && setQr(u));
    return () => {
      live = false;
    };
  }, [id, verifyUrl]);

  // Fit the A4 sheet to the screen width (phones included); print uses the real size.
  useLayoutEffect(() => {
    const fit = () => {
      const w = stage.current?.clientWidth ?? W;
      setScale(Math.min(1, w / W));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [state]);

  const issued = cert ? new Date(Number(cert.issuedAt) * 1000) : null;
  const dateText = issued?.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const name = cert ? batchName(cert.batchRef) : undefined;

  return (
    <div className="cert-page min-h-dvh text-ink" style={{ background: 'radial-gradient(120% 80% at 70% 0%, #1c3d60 0%, #0f2033 50%, #070d17 100%)' }}>
      <style>{`
        @page { size: A4 landscape; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .cert-page { background: #fff !important; min-height: 0 !important; }
          .cert-chrome { display: none !important; }
          .cert-stage { padding: 0 !important; }
          .cert-scale { transform: none !important; width: ${W}px !important; height: ${H}px !important; }
          .cert-sheet { box-shadow: none !important; border-radius: 0 !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .cert-serif { font-family: "Shippori Mincho B1", "Noto Serif JP", Georgia, serif; }
      `}</style>

      <header className="cert-chrome mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-4 pt-4 md:px-6" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <a href="/" className="glass glass-edge flex items-center gap-2.5 rounded-full p-1.5 pr-4" aria-label="Open the Sonae prototype">
          <span lang="ja" className="grid h-9 w-9 place-items-center rounded-[12px] font-jp text-[18px] font-extrabold text-white" style={{ background: 'linear-gradient(145deg, var(--water), var(--water-deep))' }}>
            備
          </span>
          <span className="whitespace-nowrap text-[15px] font-extrabold text-white">
            Sonae <span className="font-semibold text-white/60">Zitoun</span>
          </span>
        </a>
        {state === 'ok' && (
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => window.print()}>
              Download PDF
            </button>
            <a className="btn" href={`/yui?cert=${id}`}>
              Open in the ledger
            </a>
          </div>
        )}
      </header>

      <div ref={stage} className="cert-stage mx-auto max-w-[1180px] px-3 py-5 md:px-6 md:py-8">
        {state === 'loading' && <p className="cert-chrome py-24 text-center text-[16px] font-semibold text-white/70">Reading certificate #{id} from Sepolia…</p>}
        {(state === 'missing' || state === 'error') && (
          <div className="cert-chrome glass glass-edge mx-auto max-w-[520px] rounded-[24px] p-6 text-white">
            <h1 className="text-[20px] font-extrabold">{state === 'missing' ? `No certificate #${idParam ?? ''} on the ledger` : 'The blockchain could not be reached'}</h1>
            <p className="mt-2 text-[14.5px] text-white/70">{state === 'missing' ? 'This number was never issued, so this oil has no Zero-Spill certificate.' : 'Check the connection and reload the page.'}</p>
          </div>
        )}

        {state === 'ok' && cert && (
          <div style={{ height: H * scale }}>
            <div className="cert-scale origin-top-left" style={{ width: W, height: H, transform: `scale(${scale})` }}>
              <article className="cert-sheet relative h-full w-full overflow-hidden rounded-[10px] text-[#26301a] shadow-[0_40px_120px_-30px_rgba(0,0,0,.7)]" style={{ background: 'radial-gradient(120% 90% at 50% 0%, #fffdf6 0%, #fbf6e8 60%, #f3ead2 100%)' }}>
                {/* Frames */}
                <div className="absolute inset-[18px] rounded-[6px] border-[3px] border-[#6b7f3a]" />
                <div className="absolute inset-[28px] rounded-[4px] border border-[#b7a26a]" />
                <div className="absolute inset-[34px] rounded-[3px] border border-dashed border-[#c9b98a]/70" />
                <Sprig className="absolute left-[30px] top-[30px] h-[150px] w-[150px] opacity-80" flip />
                <Sprig className="absolute right-[30px] top-[30px] h-[150px] w-[150px] opacity-80" />
                <Sprig className="absolute bottom-[30px] left-[30px] h-[120px] w-[120px] rotate-180 opacity-50" />
                <Sprig className="absolute bottom-[30px] right-[30px] h-[120px] w-[120px] rotate-180 opacity-50" flip />
                {/* Watermark */}
                <div lang="ja" className="pointer-events-none absolute inset-0 grid place-items-center font-jp text-[420px] font-extrabold leading-none text-[#6b7f3a]/[0.05]">
                  備
                </div>

                <div className="relative flex h-full flex-col items-center px-[120px] pt-[62px] text-center">
                  {/* Brand */}
                  <div className="flex items-center gap-3">
                    <span lang="ja" className="grid h-[46px] w-[46px] place-items-center rounded-[13px] font-jp text-[24px] font-extrabold text-white" style={{ background: 'linear-gradient(145deg, #2f8fd6, #1b4d7e)' }}>
                      備
                    </span>
                    <span className="text-left leading-tight">
                      <span className="block text-[20px] font-extrabold tracking-tight text-[#1c2a3a]">
                        Sonae <span className="font-semibold text-[#5b6b7b]">Zitoun</span>
                      </span>
                      <span className="block text-[11.5px] font-semibold tracking-[0.18em] text-[#7a8a5a]">OLIVE WASTE, TRACED</span>
                    </span>
                  </div>

                  <p className="mt-6 text-[13px] font-bold tracking-[0.32em] text-[#8a6a2b]">CERTIFICATE · N° {String(id).padStart(4, '0')}</p>
                  <h1 className="cert-serif mt-2 text-[58px] leading-none font-extrabold text-[#2f3b18]">Zero-Spill Certificate</h1>
                  <p className="mt-2 text-[15px] font-semibold text-[#6b7f3a]">Clean olive oil, proven on the blockchain</p>

                  <p className="mt-7 text-[15px] text-[#5a5a48]">This certifies that the olive mill</p>
                  <p className="cert-serif mt-1 text-[44px] leading-tight font-extrabold text-[#1c2a3a]">{mill}</p>
                  <div className="mt-1 h-[2px] w-[420px] bg-gradient-to-r from-transparent via-[#b7a26a] to-transparent" />
                  <p className="mt-4 max-w-[760px] text-[16.5px] leading-relaxed text-[#3d4630]">
                    produced <b>{fmt(cert.litres)} litres of olive oil</b>
                    {name ? (
                      <>
                        {' '}
                        (batch <b>{name}</b>)
                      </>
                    ) : null}{' '}
                    while sending its margine only to approved olive groves, under the legal limit of each grove, with every load confirmed on arrival and <b>no load lost</b>.
                  </p>

                  {/* Figures */}
                  <div className="mt-6 grid w-full max-w-[780px] grid-cols-4 overflow-hidden rounded-[14px] border border-[#d9cba0] bg-white/55">
                    {[
                      [`${fmt(Number(cert.deliveredM3))} m³`, 'margine confirmed on groves'],
                      [`${cert.loads}`, 'traced tanker loads'],
                      ['0', 'lost loads'],
                      [`${fmt(Number(cert.declaredM3))} m³`, 'margine declared'],
                    ].map(([v, l], i) => (
                      <div key={l} className={`px-3 py-3 ${i ? 'border-l border-[#e3d7b2]' : ''}`}>
                        <div className={`text-[24px] font-extrabold ${i === 2 ? 'text-[#2e7d4f]' : 'text-[#1c2a3a]'}`}>{v}</div>
                        <div className="mt-0.5 text-[11.5px] font-semibold text-[#7a7458]">{l}</div>
                      </div>
                    ))}
                  </div>

                  {/* Footer: seal, details, QR */}
                  <div className="mt-auto mb-[54px] flex w-full items-end justify-between gap-6 text-left">
                    <div className="flex items-center gap-4">
                      <div className="relative grid h-[104px] w-[104px] place-items-center rounded-full border-[3px] border-[#2e7d4f] text-[#2e7d4f]" style={{ background: 'radial-gradient(circle, #f1f8ec 0%, #e3f0da 100%)' }}>
                        <div className="absolute inset-[6px] rounded-full border border-dashed border-[#2e7d4f]/60" />
                        <div className="text-center leading-tight">
                          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto" aria-hidden>
                            <path d="M5 12.5l4.2 4.2L19 7" />
                          </svg>
                          <div className="mt-0.5 text-[10px] font-extrabold tracking-[0.12em]">VERIFIED</div>
                          <div className="text-[8.5px] font-bold tracking-[0.1em]">ON CHAIN</div>
                        </div>
                      </div>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11.5px] text-[#5a5a48]">
                        <dt className="font-bold text-[#3d4630]">Issued</dt>
                        <dd>{dateText}</dd>
                        <dt className="font-bold text-[#3d4630]">Mill wallet</dt>
                        <dd className="font-mono">{short(cert.mill)}</dd>
                        <dt className="font-bold text-[#3d4630]">Batch fingerprint</dt>
                        <dd className="font-mono">{short(cert.batchRef)}</dd>
                        <dt className="font-bold text-[#3d4630]">Ledger</dt>
                        <dd className="font-mono">ZitounLedger {short(CONTRACT)} · Ethereum Sepolia</dd>
                      </dl>
                    </div>
                    <div className="flex items-end gap-3">
                      <div className="text-right text-[11.5px] leading-snug text-[#5a5a48]">
                        <div className="text-[13px] font-extrabold text-[#2f3b18]">Scan to verify</div>
                        <div>No account needed.</div>
                        <div className="font-mono text-[10.5px]">{verifyUrl.replace(/^https?:\/\//, '')}</div>
                      </div>
                      {qr && <img src={qr} alt={`QR code to verify certificate ${id}`} className="h-[112px] w-[112px] rounded-[8px] border border-[#d9cba0] bg-[#fffdf6] p-1" />}
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>
        )}

        {state === 'ok' && (
          <p className="cert-chrome mt-5 text-center text-[13px] text-white/55">
            Read live from the ZitounLedger contract on Ethereum Sepolia. Nobody, not even Sonae, can change this record.{' '}
            <a className="underline" href={`https://sepolia.etherscan.io/address/${CONTRACT}`} target="_blank" rel="noreferrer">
              View the contract
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

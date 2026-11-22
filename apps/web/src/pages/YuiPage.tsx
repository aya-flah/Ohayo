import { useMemo, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, useAccount, useConnect, useDisconnect, useReadContract, useSwitchChain, useWriteContract } from 'wagmi';
import { waitForTransactionReceipt } from 'wagmi/actions';
import { keccak256, toHex, type Address } from 'viem';
import { wagmiConfig, zitounAbi, zitounFor, tndFromWei, SEPOLIA_ID } from '../web3/config';
import { IconLeaf, IconLock, IconSun } from '../components/Icons';
import { fmt } from '../lib/format';
import { EASE, GlassCard, PageHeader, Pill, Rise, Stagger } from '../components/ui';
import { tap, useOnline } from '../lib/device';

const queryClient = new QueryClient();

interface Grove {
  farmer: Address;
  areaHa10: number;
  capM3: number;
  appliedM3: number;
  reservedM3: number;
  active: boolean;
  name: string;
}
interface Load {
  mill: Address;
  groveId: number;
  m3: number;
  dispatchedAt: bigint;
  deliveredAt: bigint;
  status: number;
  labHash: `0x${string}`;
  fee: bigint;
}
interface Lot {
  mill: Address;
  kg: bigint;
  remainingKg: bigint;
  pricePerTonne: bigint;
  active: boolean;
}
interface GOrder {
  lotId: bigint;
  buyer: Address;
  kg: bigint;
  amount: bigint;
  deadline: bigint;
  status: number;
}
interface Certificate {
  mill: Address;
  batchRef: `0x${string}`;
  litres: number;
  declaredM3: bigint;
  deliveredM3: bigint;
  loads: number;
  issuedAt: bigint;
}

const ROLE = {
  regulator: keccak256(toHex('REGULATOR_ROLE')),
  mill: keccak256(toHex('MILL_ROLE')),
  oracle: keccak256(toHex('ORACLE_ROLE')),
};
const ZERO = '0x0000000000000000000000000000000000000000' as Address;
const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const when = (s: bigint) => (s > 0n ? new Date(Number(s) * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const LOAD_STATUS = ['', 'On the road', 'Delivered', 'Expired'] as const;
const ORDER_STATUS = ['', 'Paid into escrow', 'Delivered, paid', 'Refunded'] as const;

export default function YuiPage() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <Yui />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

function Steps() {
  const steps = [
    { t: 'Dispatch', d: 'The maâsra records each tanker load: which grove, how many m³, the lab reading. It pays Sonae 0.5 TND per m³.', c: 'var(--margine)' },
    { t: 'Confirm', d: "The farmer, or the tanker's GPS and flow meter, confirms the load reached the grove. The contract refuses anything over the grove's legal cap.", c: 'var(--olive)' },
    { t: 'Certify', d: 'A mill with every load traced and none lost can certify a batch of oil as made without polluting.', c: 'var(--ok)' },
    { t: 'Verify', d: 'An inspector or an olive-oil buyer checks a certificate here, with no account and no middleman.', c: 'var(--water)' },
  ];
  return (
    <div className="relative grid gap-3 md:grid-cols-4">
      <div className="pointer-events-none absolute left-[12%] right-[12%] top-[27px] hidden h-px bg-[var(--line)] md:block" />
      <motion.span className="pointer-events-none absolute top-[24px] hidden h-[7px] w-[7px] rounded-full md:block" style={{ background: 'var(--margine)', boxShadow: '0 0 14px var(--margine)' }} animate={{ left: ['12%', '88%'] }} transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.6 }} />
      {steps.map((s, i) => (
        <Rise key={s.t} className="relative">
          <div className="relative z-[1] grid h-[54px] w-[54px] place-items-center rounded-full border text-[18px] font-extrabold" style={{ color: s.c, borderColor: `color-mix(in oklab, ${s.c} 45%, transparent)`, background: `color-mix(in oklab, ${s.c} 14%, var(--surface))` }}>
            {i + 1}
          </div>
          <div className="mt-3 text-[16px] font-bold">{s.t}</div>
          <p className="mt-1 text-[14px] leading-snug text-ink-2">{s.d}</p>
        </Rise>
      ))}
    </div>
  );
}

function Note({ children, tone = 'water' }: { children: ReactNode; tone?: 'water' | 'warn' }) {
  return <div className={`rounded-[16px] border px-4 py-3 text-[14.5px] ${tone === 'warn' ? 'border-[color-mix(in_oklab,var(--solar)_35%,transparent)] bg-solar-soft' : 'border-[color-mix(in_oklab,var(--water)_35%,transparent)] bg-accent-soft'}`}>{children}</div>;
}

function Yui() {
  const online = useOnline();
  const { address, chainId: walletChain, isConnected } = useAccount();
  const { connect, connectors, status: connectStatus, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const hasWallet = typeof window !== 'undefined' && 'ethereum' in window;

  // Reads come straight from Sepolia, wallet or not: anyone can audit the passport.
  const chainId = walletChain && zitounFor(walletChain) ? walletChain : SEPOLIA_ID;
  const contract = zitounFor(chainId);
  const onRightChain = isConnected && walletChain === chainId;
  const base = { address: contract ?? undefined, abi: zitounAbi, chainId: chainId as typeof SEPOLIA_ID, query: { enabled: !!contract, refetchInterval: 10_000 } } as const;
  const grovesQ = useReadContract({ ...base, functionName: 'getGroves', args: [1n, 100n] });
  const loadsQ = useReadContract({ ...base, functionName: 'getLoads', args: [1n, 300n] });
  const lotsQ = useReadContract({ ...base, functionName: 'getLots', args: [1n, 100n] });
  const ordersQ = useReadContract({ ...base, functionName: 'getOrders', args: [1n, 200n] });
  const certsQ = useReadContract({ ...base, functionName: 'getCertificates', args: [1n, 100n] });
  const feeQ = useReadContract({ ...base, functionName: 'feePerM3' });
  const windowQ = useReadContract({ ...base, functionName: 'deliveryWindow' });
  const me = address ?? ZERO;
  const roleQ = (role: `0x${string}`) => ({ ...base, functionName: 'hasRole' as const, args: [role, me] as const, query: { enabled: !!contract && !!address } });
  const isRegulator = useReadContract(roleQ(ROLE.regulator)).data === true;
  const isMill = useReadContract(roleQ(ROLE.mill)).data === true;
  const isOracle = useReadContract(roleQ(ROLE.oracle)).data === true;
  const creditsQ = useReadContract({ ...base, functionName: 'credits', args: [me], query: { enabled: !!contract && !!address, refetchInterval: 10_000 } });
  const statsQ = useReadContract({ ...base, functionName: 'millStats', args: [me], query: { enabled: !!contract && isMill } });

  const groves = ((grovesQ.data as Grove[] | undefined) ?? []).map((g, i) => ({ id: i + 1, g }));
  const loads = ((loadsQ.data as Load[] | undefined) ?? []).map((l, i) => ({ id: i + 1, l })).reverse();
  const lots = ((lotsQ.data as Lot[] | undefined) ?? []).map((l, i) => ({ id: i + 1, l }));
  const orders = ((ordersQ.data as GOrder[] | undefined) ?? []).map((o, i) => ({ id: i + 1, o })).reverse();
  const certs = ((certsQ.data as Certificate[] | undefined) ?? []).map((c, i) => ({ id: i + 1, c })).reverse();
  const fee = (feeQ.data as bigint | undefined) ?? 0n;
  const windowS = Number((windowQ.data as bigint | undefined) ?? 172800n);
  const credits = (creditsQ.data as bigint | undefined) ?? 0n;
  const stats = statsQ.data as readonly [string, boolean, bigint, bigint, number, number] | undefined;
  const myGroves = groves.filter(({ g }) => same(g.farmer, address));
  const now = BigInt(Math.floor(Date.now() / 1000));

  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [groveId, setGroveId] = useState(1);
  const [m3, setM3] = useState(15);
  const [lab, setLab] = useState('pH 4.9 · K 4.1 g/L · pond reading 23 Nov');
  const [buyLot, setBuyLot] = useState<number | null>(null);
  const [buyT, setBuyT] = useState(5);
  const [batch, setBatch] = useState('EVOO-2026-017');
  const [litres, setLitres] = useState(5000);
  const [verifyId, setVerifyId] = useState('');

  const refetch = () => [grovesQ, loadsQ, lotsQ, ordersQ, certsQ, creditsQ, statsQ].forEach((q) => q.refetch());
  const run = async (label: string, fn: () => Promise<`0x${string}`>) => {
    setBusy(label);
    setToast(null);
    try {
      const hash = await fn();
      setToast(`${label}: waiting for the block…`);
      await waitForTransactionReceipt(wagmiConfig, { hash, chainId: chainId as typeof SEPOLIA_ID });
      setToast(`${label}: done.`);
      tap('medium');
      refetch();
    } catch (e) {
      const msg = e instanceof Error ? ((e as { shortMessage?: string }).shortMessage ?? e.message.split('\n')[0]) : 'Transaction failed';
      setToast(`${label} failed: ${msg}`);
    } finally {
      setBusy(null);
    }
  };
  const write = (functionName: string, args: readonly unknown[], value?: bigint) =>
    writeContractAsync({ address: contract!, abi: zitounAbi, functionName, args, value, chainId: chainId as typeof SEPOLIA_ID } as Parameters<typeof writeContractAsync>[0]);

  const selGrove = groves.find((x) => x.id === groveId)?.g;
  const room = selGrove ? selGrove.capM3 - selGrove.appliedM3 - selGrove.reservedM3 : 0;
  const delivered = loads.filter(({ l }) => l.status === 2).reduce((s, { l }) => s + l.m3, 0);
  const onRoad = loads.filter(({ l }) => l.status === 1).length;
  const verified = useMemo(() => {
    const id = Number(verifyId);
    return Number.isInteger(id) && id > 0 ? certs.find((c) => c.id === id) : undefined;
  }, [verifyId, certs]);

  return (
    <Stagger className="flex flex-col gap-6">
      <PageHeader
        kanji="結"
        eyebrow="Yui · the margine passport on Sepolia"
        title={
          <>
            Every load of margine, traced <span className="text-gradient-water">from mill to grove</span>
          </>
        }
        aside={
          contract && (
            <div className="flex flex-col items-start gap-1.5 lg:items-end">
              <a className="chip" href={`https://sepolia.etherscan.io/address/${contract}`} target="_blank" rel="noreferrer">
                <span className="dot" style={{ color: 'var(--ok)' }} />
                <span className="num text-ink">ZitounLedger {short(contract)}</span>
              </a>
              <a className="text-[13px] text-ink-3 underline-offset-2 hover:underline" href={`https://repo.sourcify.dev/${chainId}/${contract}`} target="_blank" rel="noreferrer">
                Source verified on Sourcify
              </a>
            </div>
          )
        }
      >
        Mills are responsible for their margine, inspectors can&apos;t follow every tanker, and exporters can&apos;t prove their oil was made cleanly. Yui (結, the village tradition of tying efforts together) puts each load on a public record that no mill, farmer or official can quietly edit.
      </PageHeader>

      <GlassCard className="p-5 md:p-7">
        <Steps />
      </GlassCard>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { l: 'Groves registered', v: groves.length, c: 'var(--olive)' },
          { l: 'Loads recorded', v: loads.length, c: 'var(--margine)' },
          { l: 'm³ confirmed on groves', v: delivered, c: 'var(--ok)' },
          { l: 'Oil certificates', v: certs.length, c: 'var(--water)' },
        ].map((s) => (
          <Rise key={s.l} className="rounded-[18px] border border-line bg-surface px-4 py-3.5">
            <div className="text-[13px] font-semibold text-ink-2">{s.l}</div>
            <div className="num mt-1 text-[26px] font-extrabold" style={{ color: s.c }}>
              {grovesQ.isLoading ? '…' : fmt(s.v)}
            </div>
          </Rise>
        ))}
      </div>

      <GlassCard className="p-5 md:p-6">
        {!isConnected ? (
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-[19px] font-extrabold">Connect a test wallet to act</h2>
              <p className="mt-1 max-w-[620px] text-[14.5px] text-ink-2">
                Reading needs nothing: everything on this page comes from Sepolia. To dispatch, confirm, buy or certify, connect MetaMask on the Sepolia test network. Test ETH has no value.
              </p>
            </div>
            {hasWallet ? (
              <button className="btn btn-primary" disabled={!online || connectStatus === 'pending'} onClick={() => connect({ connector: connectors[0]!, chainId: SEPOLIA_ID })}>
                {connectStatus === 'pending' ? 'Waiting for MetaMask…' : 'Connect MetaMask'}
              </button>
            ) : (
              <a className="btn btn-primary" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
                Install MetaMask
              </a>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="num text-[18px] font-extrabold">{short(address)}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {isRegulator && <Pill tone="water">Regulator (CRDA)</Pill>}
                {isMill && <Pill tone="solar">Mill</Pill>}
                {isOracle && <Pill tone="ok">Tanker meter (oracle)</Pill>}
                {myGroves.length > 0 && <Pill tone="ok">Farmer · {myGroves.length} groves</Pill>}
                {!isRegulator && !isMill && !isOracle && myGroves.length === 0 && <Pill tone="ink">Buyer or visitor</Pill>}
              </div>
              {isMill && stats && (
                <p className="mt-2 text-[14px] text-ink-2">
                  Your mill: <b className="num text-ink">{fmt(Number(stats[2]))} m³</b> declared, <b className="num text-ink">{fmt(Number(stats[3]))} m³</b> confirmed on groves, {stats[4]} loads, <b style={{ color: stats[5] > 0 ? 'var(--cut)' : 'var(--ok)' }}>{stats[5]} expired</b>.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!onRightChain && (
                <button className="btn btn-primary" disabled={switching} onClick={() => switchChain({ chainId: SEPOLIA_ID })}>
                  Switch to Sepolia
                </button>
              )}
              {credits > 0n && (
                <button className="btn btn-quiet" disabled={!!busy} onClick={() => run('Withdraw', () => write('withdraw', []))}>
                  Withdraw {fmt(tndFromWei(credits), 2)} TND
                </button>
              )}
              <button className="btn btn-quiet" onClick={() => disconnect()}>
                Disconnect
              </button>
            </div>
          </div>
        )}
        {connectError && <p className="mt-3 text-[14px]" style={{ color: 'var(--cut)' }}>{connectError.message.split('\n')[0]}</p>}
        <AnimatePresence>
          {toast && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3" role="status">
              <Note tone={toast.includes('failed') ? 'warn' : 'water'}>{toast}</Note>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <GlassCard className="p-5 md:p-6">
            <h2 className="flex items-center gap-2 text-[19px] font-extrabold">
              <span style={{ color: 'var(--olive)' }}>
                <IconLeaf width={19} height={19} />
              </span>
              Groves approved by the regulator
            </h2>
            <p className="mt-1 text-[14.5px] text-ink-2">Each grove&apos;s season cap (50 m³/ha) lives in the contract. Loads on the road count against it.</p>
            <ul className="mt-3 flex flex-col gap-2">
              {grovesQ.isLoading && <li className="text-[14px] text-ink-3">Reading Sepolia…</li>}
              {groves.map(({ id, g }) => {
                const used = (g.appliedM3 / g.capM3) * 100;
                const res = (g.reservedM3 / g.capM3) * 100;
                return (
                  <li key={id} className="rounded-[14px] border border-line bg-surface px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[14.5px] font-semibold">
                        #{id} {g.name}
                      </span>
                      <span className="num shrink-0 text-[12.5px] text-ink-2">
                        {fmt(g.appliedM3)}
                        {g.reservedM3 > 0 && ` +${fmt(g.reservedM3)}`} / {fmt(g.capM3)} m³
                      </span>
                    </div>
                    <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
                      <motion.div style={{ background: 'var(--olive)' }} initial={{ width: 0 }} animate={{ width: `${used}%` }} transition={{ duration: 0.6, ease: EASE }} />
                      <motion.div style={{ background: 'var(--margine)' }} initial={{ width: 0 }} animate={{ width: `${res}%` }} transition={{ duration: 0.6, ease: EASE }} />
                    </div>
                    <div className="mt-1 text-[12px] text-ink-3">
                      Owner {short(g.farmer)}
                      {same(g.farmer, address) ? ' (you)' : ''}
                    </div>
                  </li>
                );
              })}
            </ul>

            {isMill && onRightChain && groves.length > 0 && (
              <div className="mt-5 border-t border-line pt-5">
                <h3 className="text-[16px] font-bold">Dispatch a tanker load</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="grove">Grove</label>
                    <select id="grove" className="field" value={groveId} onChange={(e) => setGroveId(Number(e.target.value))}>
                      {groves.map(({ id, g }) => (
                        <option key={id} value={id}>
                          #{id} {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="m3">Margine</label>
                    <div className="relative">
                      <input id="m3" type="number" className="field num pr-14" min={1} max={40} value={m3} onChange={(e) => setM3(Math.max(1, Math.round(Number(e.target.value))))} />
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-ink-3">m³</span>
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="lab">Lab or pond reading (stored as a hash)</label>
                    <input id="lab" className="field" value={lab} onChange={(e) => setLab(e.target.value)} />
                  </div>
                </div>
                <p className="mt-2 text-[13.5px] text-ink-2">
                  Room left on this grove: <b className="num text-ink">{fmt(room)} m³</b>. Sonae&apos;s fee: <b className="num text-ink">{fmt(tndFromWei(fee * BigInt(m3)), 2)} TND</b>, held until the farmer confirms.
                </p>
                <button className="btn btn-primary mt-3" disabled={!!busy || m3 > room} onClick={() => run('Dispatch', () => write('dispatch', [BigInt(groveId), m3, keccak256(toHex(lab))], fee * BigInt(m3)))}>
                  {m3 > room ? 'Over the grove’s cap' : busy === 'Dispatch' ? 'Dispatching…' : `Dispatch ${m3} m³`}
                </button>
              </div>
            )}
          </GlassCard>

          <GlassCard className="p-5 md:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[19px] font-extrabold">Loads</h2>
              <span className="text-[13.5px] text-ink-2">
                {onRoad} on the road · confirm within {Math.round(windowS / 3600)} h or it expires
              </span>
            </div>
            <ul className="mt-3 flex flex-col gap-2">
              {loads.length === 0 && <li className="text-[14px] text-ink-3">No load yet. A mill dispatches the first one above.</li>}
              {loads.map(({ id, l }) => {
                const g = groves.find((x) => x.id === l.groveId)?.g;
                const canConfirm = l.status === 1 && (same(g?.farmer, address) || isOracle) && onRightChain && now <= l.dispatchedAt + BigInt(windowS);
                const canExpire = l.status === 1 && onRightChain && now > l.dispatchedAt + BigInt(windowS);
                return (
                  <li key={id} className="flex flex-wrap items-center gap-3 rounded-[14px] border border-line bg-surface px-3 py-2.5">
                    <span className="num grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12.5px] font-bold" style={{ background: 'var(--margine-soft)', color: 'var(--margine)' }}>
                      #{id}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold">
                        {l.m3} m³ → {g?.name ?? `grove #${l.groveId}`}
                      </span>
                      <span className="block text-[12.5px] text-ink-3">
                        {short(l.mill)} · {when(l.dispatchedAt)}
                        {l.deliveredAt > 0n && ` · confirmed ${when(l.deliveredAt)}`}
                      </span>
                    </span>
                    <Pill tone={l.status === 2 ? 'ok' : l.status === 3 ? 'cut' : 'solar'}>{LOAD_STATUS[l.status]}</Pill>
                    {canConfirm && (
                      <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => run(`Confirm load #${id}`, () => write('confirmDelivery', [BigInt(id)]))}>
                        Confirm
                      </button>
                    )}
                    {canExpire && (
                      <button className="btn btn-quiet btn-sm" disabled={!!busy} onClick={() => run(`Expire load #${id}`, () => write('expire', [BigInt(id)]))}>
                        Mark expired
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </GlassCard>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <GlassCard className="p-5 md:p-6">
            <h2 className="flex items-center gap-2 text-[19px] font-extrabold">
              <span style={{ color: 'var(--solar)' }}>
                <IconSun width={19} height={19} />
              </span>
              Grignon market
            </h2>
            <p className="mt-1 text-[14.5px] text-ink-2">A hammam, bakery or kiln pays into escrow; the mill is paid when the buyer confirms the delivery. Buy from a second MetaMask account: a mill can&apos;t buy its own grignon.</p>
            <ul className="mt-3 flex flex-col gap-2">
              {lots.filter(({ l }) => l.active).length === 0 && <li className="text-[14px] text-ink-3">No grignon for sale right now.</li>}
              {lots
                .filter(({ l }) => l.active)
                .map(({ id, l }) => (
                  <li key={id} className="rounded-[14px] border border-line bg-surface px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[14.5px] font-semibold">
                        Lot #{id} · {fmt(Number(l.remainingKg) / 1000, 1)} t left
                      </span>
                      <span className="num text-[14px] font-bold" style={{ color: 'var(--solar)' }}>
                        {fmt(tndFromWei(l.pricePerTonne))} TND/t
                      </span>
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-ink-3">Mill {short(l.mill)}</div>
                    {isConnected && onRightChain && !same(l.mill, address) && (
                      <button className="btn btn-quiet btn-sm mt-2" onClick={() => setBuyLot(id)}>
                        <IconLock width={15} height={15} /> Buy with escrow
                      </button>
                    )}
                  </li>
                ))}
            </ul>
            <AnimatePresence>
              {buyLot !== null && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  {(() => {
                    const lot = lots.find((x) => x.id === buyLot)?.l;
                    if (!lot) return null;
                    const kg = BigInt(Math.round(buyT * 1000));
                    const cost = (lot.pricePerTonne * kg) / 1000n;
                    return (
                      <div className="mt-3 rounded-[16px] border border-line bg-surface p-3.5">
                        <label className="label" htmlFor="tonnes">Tonnes from lot #{buyLot}</label>
                        <input id="tonnes" type="number" className="field num" min={0.5} step={0.5} value={buyT} onChange={(e) => setBuyT(Math.max(0.5, Number(e.target.value)))} />
                        <p className="mt-2 text-[13.5px] text-ink-2">
                          You pay <b className="num text-ink">{fmt(tndFromWei(cost), 2)} TND</b> into the contract. It stays locked until you confirm the grignon arrived; after 2 days without delivery you can take it back.
                        </p>
                        <div className="mt-3 flex gap-2">
                          <button className="btn btn-quiet btn-sm" onClick={() => setBuyLot(null)}>
                            Cancel
                          </button>
                          <button className="btn btn-primary btn-sm" disabled={!!busy || kg > lot.remainingKg} onClick={() => run('Buy grignon', () => write('buyGrignon', [BigInt(buyLot), kg], cost)).then(() => setBuyLot(null))}>
                            <IconLock width={15} height={15} /> Pay into escrow
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </motion.div>
              )}
            </AnimatePresence>
            {orders.length > 0 && (
              <ul className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
                {orders.map(({ id, o }) => {
                  const mine = same(o.buyer, address);
                  return (
                    <li key={id} className="flex flex-wrap items-center gap-2 text-[14px]">
                      <span className="min-w-0 flex-1">
                        Order #{id}: {fmt(Number(o.kg) / 1000, 1)} t for <span className="num">{fmt(tndFromWei(o.amount), 2)} TND</span> by {short(o.buyer)}
                      </span>
                      <Pill tone={o.status === 2 ? 'ok' : o.status === 3 ? 'cut' : 'solar'}>{ORDER_STATUS[o.status]}</Pill>
                      {o.status === 1 && (mine || isOracle) && onRightChain && (
                        <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => run(`Confirm order #${id}`, () => write('confirmGrignon', [BigInt(id)]))}>
                          Delivered
                        </button>
                      )}
                      {o.status === 1 && mine && onRightChain && now > o.deadline && (
                        <button className="btn btn-quiet btn-sm" disabled={!!busy} onClick={() => run(`Refund order #${id}`, () => write('refundGrignon', [BigInt(id)]))}>
                          Refund me
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </GlassCard>

          <GlassCard className="p-5 md:p-6">
            <h2 className="text-[19px] font-extrabold">Clean-oil certificates</h2>
            <p className="mt-1 text-[14.5px] text-ink-2">Printed as a QR code on the bottle. The contract only issues one if the mill has confirmed loads and no load ever went missing.</p>
            {isMill && onRightChain && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="batch">Oil batch</label>
                  <input id="batch" className="field" value={batch} onChange={(e) => setBatch(e.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor="litres">Litres</label>
                  <input id="litres" type="number" className="field num" min={1} value={litres} onChange={(e) => setLitres(Math.max(1, Math.round(Number(e.target.value))))} />
                </div>
                <button className="btn btn-primary sm:col-span-2" disabled={!!busy || !batch} onClick={() => run('Certify batch', () => write('issueCertificate', [keccak256(toHex(batch)), litres]))}>
                  Certify this batch
                </button>
              </div>
            )}
            <div className="mt-4">
              <label className="label" htmlFor="verify">Verify a certificate number</label>
              <input id="verify" inputMode="numeric" className="field num" placeholder="e.g. 1" value={verifyId} onChange={(e) => setVerifyId(e.target.value.replace(/\D/g, ''))} />
              {verifyId && (
                <div className="mt-2">
                  {verified ? (
                    <Note>
                      <b>Certificate #{verified.id} is genuine.</b> Mill {short(verified.c.mill)}, {fmt(verified.c.litres)} L, issued {when(verified.c.issuedAt)}. At that moment: {fmt(Number(verified.c.deliveredM3))} m³ of margine confirmed on approved groves in {verified.c.loads} loads, out of {fmt(Number(verified.c.declaredM3))} m³ declared, and no lost load.
                    </Note>
                  ) : (
                    <Note tone="warn">No certificate #{verifyId} on this contract.</Note>
                  )}
                </div>
              )}
            </div>
            {certs.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5 text-[13.5px] text-ink-2">
                {certs.slice(0, 5).map(({ id, c }) => (
                  <li key={id}>
                    #{id} · {fmt(c.litres)} L · {short(c.mill)} · {when(c.issuedAt)}
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          <Note>
            In real use the regulator would be the CRDA or the ANPE, each mill and farmer would have their own wallet, and the oracle would be the tanker&apos;s GPS and flow meter. For the demo, the deployer wallet plays the regulator, the mill and the meter.
          </Note>
        </div>
      </div>
    </Stagger>
  );
}

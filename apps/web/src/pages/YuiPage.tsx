import { useMemo, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, useAccount, useConnect, useDisconnect, useReadContract, useSwitchChain, useWriteContract } from 'wagmi';
import { waitForTransactionReceipt } from 'wagmi/actions';
import { formatEther, keccak256, parseEther, toHex, type Address } from 'viem';
import { wagmiConfig, exchangeAbi, deploymentFor, TND_PER_ETH, SEPOLIA_ID } from '../web3/config';
import { IconDrop, IconLock, IconSun } from '../components/Icons';
import { fmt } from '../lib/format';
import { tap, useOnline } from '../lib/device';

const queryClient = new QueryClient();

interface Offer {
  seller: Address;
  resource: number;
  quantity: bigint;
  remaining: bigint;
  pricePerUnit: bigint;
  expiresAt: bigint;
  active: boolean;
  meta: string;
}
interface Order {
  offerId: bigint;
  buyer: Address;
  quantity: bigint;
  delivered: bigint;
  amount: bigint;
  deliverBy: bigint;
  status: number;
}

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
const toTnd = (wei: bigint) => Number(formatEther(wei)) * TND_PER_ETH;
const qty = (resource: number, n: bigint) => {
  const v = Number(n);
  if (resource === 0) return v >= 1000 ? `${fmt(v / 1000, 1)} m³` : `${fmt(v)} L`;
  return v >= 1000 ? `${fmt(v / 1000, 1)} kWh` : `${fmt(v)} Wh`;
};
const unit = (resource: number) => (resource === 0 ? 'litre' : 'Wh');
const ORACLE_ROLE = keccak256(toHex('ORACLE_ROLE'));
const STATUS = ['Paid into escrow', 'Delivered, released', 'Refunded'] as const;

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
    { t: 'List', d: 'A farmer with spare water or midday solar posts an offer and a price.' },
    { t: 'Pay', d: 'The buyer pays with MetaMask. The money is locked in the contract, not sent yet.' },
    { t: 'Deliver', d: "The node's meter measures the litres, or the buyer confirms they arrived." },
    { t: 'Release', d: 'The seller is paid for what was delivered. Nothing delivered in time: the buyer is refunded.' },
  ];
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((s, i) => (
        <li key={s.t} className="border-t-2 border-ok pt-3" style={{ borderColor: ['var(--ok)', 'var(--water)', 'var(--accent-strong)', 'var(--solar)'][i] }}>
          <div className="font-display text-[17px] font-extrabold">
            {i + 1}. {s.t}
          </div>
          <p className="mt-1 text-[13.5px] leading-snug text-ink-2">{s.d}</p>
        </li>
      ))}
    </ol>
  );
}

function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return <div className={`rounded-[12px] px-4 py-3 text-[14px] ${tone === 'warn' ? 'bg-solar-soft' : 'bg-accent-soft'}`}>{children}</div>;
}

function Yui() {
  const online = useOnline();
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, status: connectStatus, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const deployment = deploymentFor(chainId);
  const hasWallet = typeof window !== 'undefined' && 'ethereum' in window;
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [buyOffer, setBuyOffer] = useState<{ id: number; offer: Offer } | null>(null);
  const [lockOpen, setLockOpen] = useState(true);

  const enabled = !!deployment;
  const offersQ = useReadContract({ address: deployment?.exchange, abi: exchangeAbi, functionName: 'getOffers', args: [1n, 100n], chainId, query: { enabled, refetchInterval: 8000 } });
  const ordersQ = useReadContract({ address: deployment?.exchange, abi: exchangeAbi, functionName: 'getOrders', args: [1n, 200n], chainId, query: { enabled, refetchInterval: 8000 } });
  const creditsQ = useReadContract({ address: deployment?.exchange, abi: exchangeAbi, functionName: 'credits', args: [address ?? '0x0000000000000000000000000000000000000000'], chainId, query: { enabled: enabled && !!address, refetchInterval: 8000 } });
  const oracleQ = useReadContract({ address: deployment?.exchange, abi: exchangeAbi, functionName: 'hasRole', args: [ORACLE_ROLE, address ?? '0x0000000000000000000000000000000000000000'], chainId, query: { enabled: enabled && !!address } });

  const offers = ((offersQ.data as Offer[] | undefined) ?? []).map((o, i) => ({ id: i + 1, offer: o }));
  const orders = ((ordersQ.data as Order[] | undefined) ?? []).map((o, i) => ({ id: i + 1, order: o }));
  const now = BigInt(Math.floor(Date.now() / 1000));
  const openOffers = offers.filter(({ offer }) => offer.active && offer.expiresAt > now && offer.remaining > 0n);
  const mine = address?.toLowerCase();
  const myOrders = orders.filter(({ order }) => {
    const offer = offers.find((o) => BigInt(o.id) === order.offerId)?.offer;
    return order.buyer.toLowerCase() === mine || offer?.seller.toLowerCase() === mine || oracleQ.data === true;
  });
  const credits = (creditsQ.data as bigint | undefined) ?? 0n;

  const run = async (label: string, fn: () => Promise<`0x${string}`>) => {
    setBusy(label);
    setToast(null);
    try {
      const hash = await fn();
      setToast(`${label}: waiting for the block…`);
      await waitForTransactionReceipt(wagmiConfig, { hash, chainId });
      setToast(`${label}: done.`);
      tap('medium');
      offersQ.refetch();
      ordersQ.refetch();
      creditsQ.refetch();
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : 'Transaction failed';
      setToast(`${label} failed: ${msg}`);
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="max-w-[700px]">
        <h1 className="font-display text-[30px] leading-tight font-extrabold md:text-[38px]">
          Yui: neighbours share water and energy <span lang="ja" className="text-accent-strong">結</span>
        </h1>
        <p className="mt-2 text-[15.5px] leading-relaxed text-ink-2">
          Yui is the Japanese village tradition of neighbours helping each other with farm work. Here, spare water and midday solar change hands with no middleman: the contract holds the money until the meter confirms delivery.
        </p>
      </div>

      <section className="mt-6">
        <Steps />
      </section>

      {/* Wallet */}
      <section className="card mt-7 flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        {!isConnected ? (
          <>
            <div>
              <h2 className="font-display text-[19px] font-extrabold">Connect a test wallet</h2>
              <p className="mt-1 text-[13.5px] text-ink-2">Use MetaMask on the Sepolia test network. Test ETH has no value; never use a real wallet for the demo.</p>
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
          </>
        ) : (
          <>
            <div>
              <h2 className="font-display text-[19px] font-extrabold num">{short(address)}</h2>
              <p className="mt-1 text-[13.5px] text-ink-2">
                {chainId === SEPOLIA_ID ? 'Sepolia test network' : chainId === 31337 ? 'Local Hardhat network' : `Network ${chainId}`}
                {oracleQ.data === true && ' · this wallet is the GDA meter oracle'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {credits > 0n && (
                <button className="btn btn-primary" disabled={!!busy} onClick={() => run('Withdraw', () => writeContractAsync({ address: deployment!.exchange, abi: exchangeAbi, functionName: 'withdraw', args: [] }))}>
                  Withdraw {fmt(toTnd(credits), 2)} TND
                </button>
              )}
              {chainId !== SEPOLIA_ID && chainId !== 31337 && (
                <button className="btn btn-primary" disabled={switching} onClick={() => switchChain({ chainId: SEPOLIA_ID })}>
                  Switch to Sepolia
                </button>
              )}
              <button className="btn btn-quiet" onClick={() => disconnect()}>
                Disconnect
              </button>
            </div>
          </>
        )}
      </section>
      {connectError && <p className="mt-2 text-[13px] text-danger">{connectError.message.split('\n')[0]}</p>}
      {isConnected && !deployment && (
        <div className="mt-4">
          <Notice tone="warn">
            The Yui contract is not deployed on this network yet. Deploy it with <code className="font-mono text-[13px]">npm run contracts:deploy:sepolia</code> (or <code className="font-mono text-[13px]">contracts:deploy:local</code> with a local Hardhat node), then rebuild the site.
          </Notice>
        </div>
      )}
      <AnimatePresence>
        {toast && (
          <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.2 } }} exit={{ opacity: 0, transition: { duration: 0.15 } }} className="mt-3 text-[13.5px] text-ink" role="status">
            {toast}
          </motion.p>
        )}
      </AnimatePresence>

      {deployment && isConnected && (
        <div className="mt-7 grid gap-7 lg:grid-cols-[1fr_360px]">
          <section>
            <h2 className="font-display text-[22px] font-extrabold">Offers near you</h2>
            {openOffers.length === 0 ? (
              <p className="mt-3 text-[14px] text-ink-2">No open offers yet. Post the first one with the form.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-surface">
                {openOffers.map(({ id, offer }) => {
                  const Icon = offer.resource === 0 ? IconDrop : IconSun;
                  const priceTnd = toTnd(offer.pricePerUnit);
                  const isMine = offer.seller.toLowerCase() === mine;
                  return (
                    <li key={id} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 px-4 py-3.5">
                      <span className="grid h-10 w-10 place-items-center rounded-full" style={{ background: offer.resource === 0 ? 'var(--accent-soft)' : 'var(--solar-soft)', color: offer.resource === 0 ? 'var(--water)' : 'var(--solar)' }}>
                        <Icon />
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium">
                          {qty(offer.resource, offer.remaining)} of {offer.resource === 0 ? 'water' : 'solar energy'}
                        </div>
                        <div className="text-[13px] text-ink-2 num">
                          {fmt(priceTnd, 4)} TND per {unit(offer.resource)} · {short(offer.seller)}
                          {offer.meta ? ` · ${offer.meta}` : ''}
                        </div>
                      </div>
                      {isMine ? (
                        <button className="btn btn-quiet text-[13px]" disabled={!!busy} onClick={() => run('Cancel offer', () => writeContractAsync({ address: deployment.exchange, abi: exchangeAbi, functionName: 'cancelOffer', args: [BigInt(id)] }))}>
                          Cancel
                        </button>
                      ) : (
                        <button className="btn btn-primary text-[13px]" onClick={() => { setBuyOffer({ id, offer }); setLockOpen(true); }}>
                          Buy
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <h2 className="mt-8 font-display text-[22px] font-extrabold">Your trades</h2>
            {myOrders.length === 0 ? (
              <p className="mt-3 text-[14px] text-ink-2">Trades you buy or sell appear here with their escrow status.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {myOrders.map(({ id, order }) => (
                  <OrderRow key={id} id={id} order={order} offer={offers.find((o) => BigInt(o.id) === order.offerId)?.offer} me={mine} isOracle={oracleQ.data === true} busy={!!busy} now={now} run={run} exchange={deployment.exchange} writeContractAsync={writeContractAsync} />
                ))}
              </ul>
            )}
          </section>

          <SellForm busy={!!busy} onSell={(resource, quantity, priceTnd, hours, meta) => {
            const priceWei = parseEther((priceTnd / TND_PER_ETH).toFixed(18));
            const expires = BigInt(Math.floor(Date.now() / 1000) + hours * 3600);
            return run('Post offer', () => writeContractAsync({ address: deployment.exchange, abi: exchangeAbi, functionName: 'listOffer', args: [resource, BigInt(quantity), priceWei, expires, meta] }));
          }} />
        </div>
      )}

      <BuyDialog
        target={buyOffer}
        lockOpen={lockOpen}
        busy={!!busy}
        onClose={() => setBuyOffer(null)}
        onBuy={async (amount) => {
          if (!buyOffer || !deployment) return;
          const cost = amount * buyOffer.offer.pricePerUnit;
          const ok = await run('Pay into escrow', () => writeContractAsync({ address: deployment.exchange, abi: exchangeAbi, functionName: 'buy', args: [BigInt(buyOffer.id), amount], value: cost }));
          if (ok) {
            setLockOpen(false);
            setTimeout(() => setBuyOffer(null), 1400);
          }
        }}
      />

      <p className="mt-10 max-w-[700px] text-[12.5px] leading-relaxed text-ink-3">
        Selling electricity between private people needs regulatory approval in Tunisia, and sharing water turns needs the GDA's approval, so Yui runs on the Sepolia test network. TND figures use a fixed demo rate of {fmt(TND_PER_ETH)} TND per test ETH.
      </p>
    </div>
  );
}

function SellForm({ busy, onSell }: { busy: boolean; onSell: (resource: number, quantity: number, priceTnd: number, hours: number, meta: string) => Promise<boolean> }) {
  const [resource, setResource] = useState(0);
  const [quantity, setQuantity] = useState(5000);
  const [price, setPrice] = useState(0.002);
  const [hours, setHours] = useState(48);
  const [meta, setMeta] = useState('GDA Sidi Ali, plot 4');
  const totalTnd = quantity * price;
  return (
    <section className="card h-fit p-5">
      <h2 className="font-display text-[20px] font-extrabold">Share what you have spare</h2>
      <div className="mt-4 inline-flex rounded-[11px] border border-line p-1" role="radiogroup" aria-label="What to sell">
        {['Water', 'Solar energy'].map((label, i) => (
          <button key={label} role="radio" aria-checked={resource === i} onClick={() => { setResource(i); setQuantity(i === 0 ? 5000 : 3000); setPrice(i === 0 ? 0.002 : 0.0003); }} className={`rounded-[8px] px-3 py-1.5 text-[13.5px] transition-colors duration-150 ${resource === i ? 'bg-accent-strong text-on-accent' : 'text-ink-2'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        <div>
          <label className="label" htmlFor="sell-qty">Quantity ({resource === 0 ? 'litres' : 'Wh'})</label>
          <input id="sell-qty" type="number" min={1} className="field num" value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.floor(Number(e.target.value))))} />
        </div>
        <div>
          <label className="label" htmlFor="sell-price">Price per {resource === 0 ? 'litre' : 'Wh'} (TND)</label>
          <input id="sell-price" type="number" min={0.00001} step={0.0001} className="field num" value={price} onChange={(e) => setPrice(Math.max(0.00001, Number(e.target.value)))} />
        </div>
        <div>
          <label className="label" htmlFor="sell-hours">Offer stays open for (hours)</label>
          <input id="sell-hours" type="number" min={1} max={336} className="field num" value={hours} onChange={(e) => setHours(Math.min(336, Math.max(1, Math.floor(Number(e.target.value)))))} />
        </div>
        <div>
          <label className="label" htmlFor="sell-meta">Note for buyers</label>
          <input id="sell-meta" maxLength={120} className="field" value={meta} onChange={(e) => setMeta(e.target.value)} />
        </div>
      </div>
      <p className="mt-3 text-[13px] text-ink-2 num">Worth {fmt(totalTnd, 2)} TND in total if it all sells.</p>
      <button className="btn btn-primary mt-4 w-full justify-center" disabled={busy} onClick={() => onSell(resource, quantity, price, hours, meta)}>
        Post the offer
      </button>
    </section>
  );
}

function BuyDialog({ target, lockOpen, busy, onClose, onBuy }: { target: { id: number; offer: Offer } | null; lockOpen: boolean; busy: boolean; onClose: () => void; onBuy: (amount: bigint) => void }) {
  const [amount, setAmount] = useState(1000);
  const max = target ? Number(target.offer.remaining) : 0;
  const n = BigInt(Math.max(1, Math.min(max, amount)));
  const cost = target ? n * target.offer.pricePerUnit : 0n;
  return (
    <AnimatePresence>
      {target && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-4 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.2 } }} exit={{ opacity: 0, transition: { duration: 0.15 } }} onClick={onClose}>
          <motion.div role="dialog" aria-modal="true" aria-labelledby="buy-title" className="card w-full max-w-[440px] p-6" initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1, transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] } }} exit={{ y: 8, opacity: 0, transition: { duration: 0.15 } }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent-strong">
                <IconLock open={lockOpen} width={24} height={24} />
              </span>
              <h2 id="buy-title" className="font-display text-[21px] font-extrabold">
                {lockOpen ? 'Pay into escrow' : 'Locked in escrow'}
              </h2>
            </div>
            <label className="label mt-5" htmlFor="buy-qty">How much ({target.offer.resource === 0 ? 'litres' : 'Wh'}), up to {fmt(max)}</label>
            <input id="buy-qty" type="number" min={1} max={max} className="field num" value={amount} onChange={(e) => setAmount(Math.floor(Number(e.target.value)))} />
            <div className="mt-4 rounded-[12px] bg-surface-2 p-4 text-[14px] leading-relaxed">
              You pay <strong className="num">{fmt(toTnd(cost), 3)} TND</strong> ({formatEther(cost)} test ETH). The contract keeps it until the meter confirms delivery or you confirm yourself. If nothing arrives within 2 days, you can take it all back.
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn btn-quiet" onClick={onClose}>Not now</button>
              <button className="btn btn-primary" disabled={busy || !lockOpen} onClick={() => onBuy(n)}>
                {busy ? 'Confirm in MetaMask…' : lockOpen ? 'Pay into escrow' : 'Paid'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function OrderRow(props: {
  id: number;
  order: Order;
  offer?: Offer;
  me?: string;
  isOracle: boolean;
  busy: boolean;
  now: bigint;
  exchange: Address;
  run: (label: string, fn: () => Promise<`0x${string}`>) => Promise<boolean>;
  writeContractAsync: ReturnType<typeof useWriteContract>['writeContractAsync'];
}) {
  const { id, order, offer, me, isOracle, busy, now, exchange, run, writeContractAsync } = props;
  const [measured, setMeasured] = useState(Number(order.quantity));
  const isBuyer = order.buyer.toLowerCase() === me;
  const escrowed = order.status === 0;
  const resource = offer?.resource ?? 0;
  const canRefund = isBuyer && escrowed && now >= order.deliverBy;
  const deadline = useMemo(() => new Date(Number(order.deliverBy) * 1000).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }), [order.deliverBy]);
  return (
    <li className="card flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 place-items-center rounded-full ${escrowed ? 'bg-accent-soft text-accent-strong' : 'bg-ok-soft text-ok'}`}>
          <IconLock open={!escrowed} />
        </span>
        <div>
          <div className="font-medium">
            {qty(resource, order.quantity)} {isBuyer ? 'bought' : 'sold'} · {fmt(toTnd(order.amount), 3)} TND
          </div>
          <div className="text-[13px] text-ink-2">
            {STATUS[order.status] ?? 'Unknown'}
            {escrowed ? `, deliver by ${deadline}` : order.status === 1 ? `, ${qty(resource, order.delivered)} delivered` : ''}
          </div>
        </div>
      </div>
      {escrowed && (
        <div className="flex flex-wrap items-center gap-2">
          {isOracle && (
            <>
              <input type="number" aria-label="Measured quantity" className="field w-28 num" value={measured} min={0} max={Number(order.quantity)} onChange={(e) => setMeasured(Math.max(0, Math.min(Number(order.quantity), Math.floor(Number(e.target.value)))))} />
              <button className="btn btn-quiet text-[13px]" disabled={busy} onClick={() => run('Meter confirms delivery', () => writeContractAsync({ address: exchange, abi: exchangeAbi, functionName: 'confirmDelivery', args: [BigInt(id), BigInt(measured)] }))}>
                Meter confirms
              </button>
            </>
          )}
          {isBuyer && (
            <button className="btn btn-primary text-[13px]" disabled={busy} onClick={() => run('Confirm delivery', () => writeContractAsync({ address: exchange, abi: exchangeAbi, functionName: 'confirmDelivery', args: [BigInt(id), order.quantity] }))}>
              It arrived
            </button>
          )}
          {canRefund && (
            <button className="btn btn-quiet text-[13px]" disabled={busy} onClick={() => run('Refund', () => writeContractAsync({ address: exchange, abi: exchangeAbi, functionName: 'refund', args: [BigInt(id)] }))}>
              Take my money back
            </button>
          )}
        </div>
      )}
    </li>
  );
}

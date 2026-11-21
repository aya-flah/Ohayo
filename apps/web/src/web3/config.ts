import { createConfig, fallback, http } from 'wagmi';
import { hardhat, sepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';
import type { Abi, Address } from 'viem';
import bundle from './sonae-contracts.json';

const sepoliaRpc = import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined;

export const wagmiConfig = createConfig({
  chains: [sepolia, hardhat],
  connectors: [injected()],
  transports: {
    // Reads go through these RPCs even when MetaMask is connected (MetaMask only signs),
    // so try a fast public node first and fall back to viem's default one.
    [sepolia.id]: fallback([
      ...(sepoliaRpc ? [http(sepoliaRpc)] : []),
      http('https://ethereum-sepolia-rpc.publicnode.com'),
      http(),
    ]),
    [hardhat.id]: http('http://127.0.0.1:8545'),
  },
});

export const exchangeAbi = bundle.exchangeAbi as Abi;
export const ledgerAbi = bundle.ledgerAbi as Abi;

/** Deployed addresses per chain id, written by `npm run contracts:deploy:*`. */
export function deploymentFor(chainId: number | undefined): { exchange: Address; ledger: Address } | null {
  if (!chainId) return null;
  const d = (bundle.chains as Record<string, { exchange: string; ledger: string }>)[String(chainId)];
  return d ? { exchange: d.exchange as Address, ledger: d.ledger as Address } : null;
}

export const TND_PER_ETH = Number(import.meta.env.VITE_TND_PER_ETH ?? 10000);
export const SEPOLIA_ID = sepolia.id;

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWalletClient, createPublicClient, http, type Address, type Hex, type Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hardhat, sepolia } from 'viem/chains';

/**
 * The Yui delivery oracle: the server's wallet holds ORACLE_ROLE and confirms
 * the litres (or Wh) the Sonae Node measured. The key lives only in apps/api/.env.
 */
const here = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(here, '..', '..', 'web', 'src', 'web3', 'sonae-contracts.json');

function bundle(): { chains: Record<string, { exchange: string }>; exchangeAbi: Abi } | null {
  if (!existsSync(BUNDLE)) return null;
  return JSON.parse(readFileSync(BUNDLE, 'utf8'));
}

export function oracleReady(): boolean {
  const b = bundle();
  const chain = process.env.CHAIN === 'localhost' ? hardhat : sepolia;
  return !!process.env.ORACLE_PRIVATE_KEY && !!b?.chains[String(chain.id)];
}

export async function confirmDelivery(orderId: number, measured: number): Promise<Hex> {
  const b = bundle();
  const chain = process.env.CHAIN === 'localhost' ? hardhat : sepolia;
  const deployment = b?.chains[String(chain.id)];
  const key = process.env.ORACLE_PRIVATE_KEY as Hex | undefined;
  if (!b || !deployment) throw new Error(`No Yui deployment for ${chain.name}. Deploy the contracts first.`);
  if (!key) throw new Error('ORACLE_PRIVATE_KEY is not set in apps/api/.env.');
  const transport = http(chain.id === sepolia.id ? process.env.SEPOLIA_RPC_URL : 'http://127.0.0.1:8545');
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain, transport });
  const reader = createPublicClient({ chain, transport });
  const hash = await wallet.writeContract({
    address: deployment.exchange as Address,
    abi: b.exchangeAbi,
    functionName: 'confirmDelivery',
    args: [BigInt(orderId), BigInt(Math.max(0, Math.floor(measured)))],
  });
  await reader.waitForTransactionReceipt({ hash });
  return hash;
}

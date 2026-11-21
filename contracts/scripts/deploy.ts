import { ethers, network, artifacts } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys SonaeExchange and LedgerAnchor, then writes:
 *  - contracts/deployments/<network>.json
 *  - apps/web/src/web3/sonae-contracts.json (addresses per chain + ABIs) for the website
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer account. Set DEPLOYER_PRIVATE_KEY in contracts/.env for Sepolia.");
  const oracle = process.env.ORACLE_ADDRESS && ethers.isAddress(process.env.ORACLE_ADDRESS) ? process.env.ORACLE_ADDRESS : deployer.address;
  const { chainId } = await ethers.provider.getNetwork();

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deploying to ${network.name} (chain ${chainId}) from ${deployer.address} (${ethers.formatEther(balance)} ETH)`);
  if (balance === 0n) throw new Error(`${deployer.address} has no ETH on ${network.name}. Get test ETH from a faucet first.`);

  const exchange = await ethers.deployContract("SonaeExchange", [deployer.address, oracle]);
  await exchange.waitForDeployment();
  const ledger = await ethers.deployContract("LedgerAnchor", [deployer.address, oracle]);
  await ledger.waitForDeployment();
  const block = await ethers.provider.getBlockNumber();

  const record = {
    network: network.name,
    chainId: Number(chainId),
    exchange: await exchange.getAddress(),
    ledger: await ledger.getAddress(),
    exchangeTx: exchange.deploymentTransaction()?.hash ?? null,
    ledgerTx: ledger.deploymentTransaction()?.hash ?? null,
    deployer: deployer.address,
    oracle,
    block,
    deployedAt: new Date().toISOString(),
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${network.name}.json`), JSON.stringify(record, null, 2));
  console.log("SonaeExchange:", record.exchange);
  console.log("LedgerAnchor: ", record.ledger);
  if (record.chainId === 11155111) {
    console.log(`Etherscan: https://sepolia.etherscan.io/address/${record.exchange}`);
    console.log(`           https://sepolia.etherscan.io/address/${record.ledger}`);
  }

  await writeWebBundle();
}

/** Merge every deployment we know about into one file the website imports. */
export async function writeWebBundle() {
  const depDir = path.join(__dirname, "..", "deployments");
  const chains: Record<string, { exchange: string; ledger: string; block: number }> = {};
  if (fs.existsSync(depDir)) {
    for (const f of fs.readdirSync(depDir).filter((x) => x.endsWith(".json"))) {
      const d = JSON.parse(fs.readFileSync(path.join(depDir, f), "utf8"));
      chains[String(d.chainId)] = { exchange: d.exchange, ledger: d.ledger, block: d.block };
    }
  }
  const exchangeAbi = (await artifacts.readArtifact("SonaeExchange")).abi;
  const ledgerAbi = (await artifacts.readArtifact("LedgerAnchor")).abi;
  const out = path.join(__dirname, "..", "..", "apps", "web", "src", "web3", "sonae-contracts.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ chains, exchangeAbi, ledgerAbi }, null, 2));
  console.log("Wrote", path.relative(process.cwd(), out));
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}

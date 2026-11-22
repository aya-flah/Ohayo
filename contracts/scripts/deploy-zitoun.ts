import { ethers, network, artifacts } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys ZitounLedger and sets up the demo region so the Yui page has something to show:
 *  - the deployer is admin, regulator (CRDA), treasury and, unless ORACLE_ADDRESS is set, the oracle;
 *  - the deployer is registered as the mill "Maasra El Amel" (so one MetaMask account can run the demo);
 *  - the six demo groves allowed to receive margine are registered, owned by FARMER_ADDRESS
 *    (default: the deployer), each with a season cap of 50 m³ per hectare;
 *  - one lot of grignon is listed.
 * Writes contracts/deployments/zitoun-<network>.json and apps/web/src/web3/zitoun-contract.json.
 */

// Demo exchange rate shown in the app: 10,000 TND per test ETH.
const TND = (tnd: number) => ethers.parseEther((tnd / 10_000).toFixed(12));
const FEE_PER_M3 = TND(0.5); // Sonae's fee: 0.5 TND per m³
const GRIGNON_PER_TONNE = TND(60); // 60 TND per tonne of grignon
const CAP_PER_HA = 50;

const GROVES: Array<[string, number]> = [
  ["Hedi Ben Ali", 12],
  ["Salma Trabelsi", 8],
  ["Mongi Karray", 15],
  ["Ridha Masmoudi", 10],
  ["Amel Chaabane", 14],
  ["Leila Gargouri", 11],
];

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer account. Set DEPLOYER_PRIVATE_KEY in contracts/.env for Sepolia.");
  const oracle = process.env.ORACLE_ADDRESS && ethers.isAddress(process.env.ORACLE_ADDRESS) ? process.env.ORACLE_ADDRESS : deployer.address;
  const farmer = process.env.FARMER_ADDRESS && ethers.isAddress(process.env.FARMER_ADDRESS) ? process.env.FARMER_ADDRESS : deployer.address;
  const { chainId } = await ethers.provider.getNetwork();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deploying ZitounLedger to ${network.name} (chain ${chainId}) from ${deployer.address} (${ethers.formatEther(balance)} ETH)`);
  if (balance === 0n) throw new Error(`${deployer.address} has no ETH on ${network.name}.`);

  const z = await ethers.deployContract("ZitounLedger", [deployer.address, oracle, deployer.address, FEE_PER_M3]);
  await z.waitForDeployment();
  const address = await z.getAddress();
  const deployTx = z.deploymentTransaction()?.hash ?? null;
  console.log("ZitounLedger:", address);

  const wait = async (p: Promise<{ wait: () => Promise<unknown> }>, label: string) => {
    const tx = await p;
    await tx.wait();
    console.log("  ✓", label);
  };
  await wait(z.registerMill(deployer.address, "Maasra El Amel, Sakiet Ezzit"), "mill registered");
  for (const [name, ha] of GROVES) {
    await wait(z.registerGrove(farmer, ha * 10, ha * CAP_PER_HA, `${name}, ${ha} ha`), `grove ${name}`);
  }
  await wait(z.declareMargine(1050), "1,050 m³ in the pond declared");
  await wait(z.listGrignon(30_000, GRIGNON_PER_TONNE), "30 t of grignon listed");
  const block = await ethers.provider.getBlockNumber();

  const record = {
    network: network.name,
    chainId: Number(chainId),
    address,
    deployTx,
    deployer: deployer.address,
    oracle,
    farmer,
    feePerM3Wei: FEE_PER_M3.toString(),
    grignonPerTonneWei: GRIGNON_PER_TONNE.toString(),
    block,
    deployedAt: new Date().toISOString(),
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `zitoun-${network.name}.json`), JSON.stringify(record, null, 2));

  // Merge every Zitoun deployment into the website bundle.
  const chains: Record<string, { address: string; block: number }> = {};
  for (const f of fs.readdirSync(dir).filter((x) => x.startsWith("zitoun-") && x.endsWith(".json"))) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    chains[String(d.chainId)] = { address: d.address, block: d.block };
  }
  const abi = (await artifacts.readArtifact("ZitounLedger")).abi;
  const out = path.join(__dirname, "..", "..", "apps", "web", "src", "web3", "zitoun-contract.json");
  fs.writeFileSync(out, JSON.stringify({ chains, abi }, null, 2));
  console.log("Wrote", path.relative(process.cwd(), out));
  if (Number(chainId) === 11155111) console.log(`Etherscan: https://sepolia.etherscan.io/address/${address}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

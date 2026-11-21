import hre, { artifacts, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Publishes the source of both deployed contracts so anyone can read what they do:
 *  - on Sourcify (API v2), always: no account or key needed;
 *  - on Etherscan too, when ETHERSCAN_API_KEY is set in contracts/.env.
 * The Hardhat plugin's own Sourcify support still calls the removed v1 API, so we call v2 directly.
 */
const SOURCIFY = "https://sourcify.dev/server";
const HEADERS = { "Content-Type": "application/json", "User-Agent": "sonae-contracts-verify/0.1" };

async function main() {
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) throw new Error(`No deployment record for ${network.name}. Deploy first.`);
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  const targets = [
    { name: "SonaeExchange", address: d.exchange as string, tx: d.exchangeTx as string | undefined },
    { name: "LedgerAnchor", address: d.ledger as string, tx: d.ledgerTx as string | undefined },
  ];

  for (const t of targets) {
    const fqn = `contracts/${t.name}.sol:${t.name}`;
    console.log(`\n${t.name} at ${t.address}`);

    try {
      await sourcify(d.chainId, t.address, fqn, t.tx);
    } catch (e) {
      console.warn(`  Sourcify: not verified (${(e as Error).message})`);
      process.exitCode = 1;
    }

    if (process.env.ETHERSCAN_API_KEY) {
      try {
        await hre.run("verify:verify", { address: t.address, contract: fqn, constructorArguments: [d.deployer, d.oracle] });
      } catch (e) {
        console.warn(`  Etherscan: not verified (${(e as Error).message})`);
        process.exitCode = 1;
      }
    }
  }
  if (!process.env.ETHERSCAN_API_KEY) {
    console.log("\nEtherscan skipped: add a free ETHERSCAN_API_KEY to contracts/.env and run this again to verify there too.");
  }
}

async function sourcify(chainId: number, address: string, fqn: string, creationTx?: string) {
  const existing = await fetch(`${SOURCIFY}/v2/contract/${chainId}/${address}`, { headers: HEADERS });
  if (existing.ok) {
    const body = (await existing.json()) as { match?: string | null };
    if (body.match) {
      console.log(`  Sourcify: already verified (${body.match})  https://repo.sourcify.dev/${chainId}/${address}`);
      return;
    }
  }

  const build = await artifacts.getBuildInfo(fqn);
  if (!build) throw new Error(`no build info for ${fqn}; run npx hardhat compile`);
  const res = await fetch(`${SOURCIFY}/v2/verify/${chainId}/${address}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      stdJsonInput: build.input,
      compilerVersion: build.solcLongVersion,
      contractIdentifier: fqn,
      ...(creationTx ? { creationTransactionHash: creationTx } : {}),
    }),
  });
  const started = (await res.json()) as { verificationId?: string; customCode?: string; message?: string };
  if (res.status === 409) {
    console.log(`  Sourcify: already verified  https://repo.sourcify.dev/${chainId}/${address}`);
    return;
  }
  if (!res.ok || !started.verificationId) throw new Error(`${res.status} ${started.customCode ?? ""} ${started.message ?? ""}`.trim());

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const job = (await (await fetch(`${SOURCIFY}/v2/verify/${started.verificationId}`, { headers: HEADERS })).json()) as {
      isJobCompleted: boolean;
      contract?: { match?: string | null; runtimeMatch?: string | null; creationMatch?: string | null };
      error?: { customCode?: string; message?: string };
    };
    if (!job.isJobCompleted) continue;
    if (job.error) throw new Error(`${job.error.customCode ?? ""} ${job.error.message ?? ""}`.trim());
    console.log(
      `  Sourcify: verified (${job.contract?.match ?? "match"}; runtime ${job.contract?.runtimeMatch ?? "?"}, creation ${job.contract?.creationMatch ?? "?"})`,
    );
    console.log(`  Source:   https://repo.sourcify.dev/${chainId}/${address}`);
    return;
  }
  throw new Error("timed out waiting for the verification job");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

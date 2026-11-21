import { ethers, network } from "hardhat";

/** Prints the deployer address and its balance on the chosen network. It never prints the key. */
async function main() {
  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error(`No account for ${network.name}. Put DEPLOYER_PRIVATE_KEY in contracts/.env.`);
  const { chainId } = await ethers.provider.getNetwork();
  const balance = await ethers.provider.getBalance(signer.address);
  const sent = await ethers.provider.getTransactionCount(signer.address);
  console.log(`network  ${network.name} (chain ${chainId})`);
  console.log(`account  ${signer.address}`);
  console.log(`balance  ${ethers.formatEther(balance)} ETH`);
  console.log(`sent txs ${sent}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

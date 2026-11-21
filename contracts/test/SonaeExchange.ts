import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";

const WATER = 0;
const ENERGY = 1;
const PRICE = ethers.parseUnits("1", "gwei"); // wei per litre, test value

async function deployFixture() {
  const [admin, oracle, ali, sami, stranger] = await ethers.getSigners();
  const exchange = await ethers.deployContract("SonaeExchange", [admin.address, oracle.address]);
  const ledger = await ethers.deployContract("LedgerAnchor", [admin.address, oracle.address]);
  const inADay = BigInt((await time.latest()) + 86_400);
  return { exchange, ledger, admin, oracle, ali, sami, stranger, inADay };
}

async function listedFixture() {
  const f = await deployFixture();
  await f.exchange.connect(f.ali).listOffer(WATER, 5_000, PRICE, f.inADay, "GDA Sidi Ali, plot 4");
  return f;
}

describe("SonaeExchange (Yui)", () => {
  it("lists, escrows, releases on the buyer's confirmation, and pays out on withdraw", async () => {
    const { exchange, ali, sami } = await loadFixture(listedFixture);
    const cost = 5_000n * PRICE;
    await expect(exchange.connect(sami).buy(1, 5_000, { value: cost }))
      .to.emit(exchange, "Purchased")
      .withArgs(1, 1, sami.address, 5_000, cost, (v: bigint) => v > 0n);
    expect(await ethers.provider.getBalance(await exchange.getAddress())).to.equal(cost);
    expect((await exchange.offers(1)).active).to.equal(false);

    await expect(exchange.connect(sami).confirmDelivery(1, 0)).to.emit(exchange, "Delivered").withArgs(1, 5_000, cost, 0, false);
    expect(await exchange.credits(ali.address)).to.equal(cost);
    await expect(exchange.connect(ali).withdraw()).to.changeEtherBalances([ali, exchange], [cost, -cost]);
  });

  it("rejects a payment that is not the exact price", async () => {
    const { exchange, sami } = await loadFixture(listedFixture);
    await expect(exchange.connect(sami).buy(1, 100, { value: PRICE }))
      .to.be.revertedWithCustomError(exchange, "WrongPayment")
      .withArgs(100n * PRICE, PRICE);
  });

  it("pays the seller pro rata when the oracle measures a partial delivery", async () => {
    const { exchange, oracle, ali, sami } = await loadFixture(listedFixture);
    const cost = 4_000n * PRICE;
    await exchange.connect(sami).buy(1, 4_000, { value: cost });
    await exchange.connect(oracle).confirmDelivery(1, 3_000);
    expect(await exchange.credits(ali.address)).to.equal(3_000n * PRICE);
    expect(await exchange.credits(sami.address)).to.equal(1_000n * PRICE);
    expect((await exchange.orders(1)).delivered).to.equal(3_000);
  });

  it("refunds the buyer after the deadline, and not before", async () => {
    const { exchange, sami } = await loadFixture(listedFixture);
    const cost = 1_000n * PRICE;
    await exchange.connect(sami).buy(1, 1_000, { value: cost });
    await expect(exchange.connect(sami).refund(1)).to.be.revertedWithCustomError(exchange, "TooEarly");
    await time.increase(2 * 86_400 + 1);
    await expect(exchange.connect(sami).refund(1)).to.emit(exchange, "Refunded").withArgs(1, cost);
    expect(await exchange.credits(sami.address)).to.equal(cost);
    await expect(exchange.connect(sami).confirmDelivery(1, 0)).to.be.revertedWithCustomError(exchange, "NotEscrowed");
  });

  it("lets only the buyer or the oracle confirm", async () => {
    const { exchange, sami, stranger, ali } = await loadFixture(listedFixture);
    await exchange.connect(sami).buy(1, 10, { value: 10n * PRICE });
    await expect(exchange.connect(stranger).confirmDelivery(1, 10)).to.be.revertedWithCustomError(exchange, "NotAllowed");
    await expect(exchange.connect(ali).confirmDelivery(1, 10)).to.be.revertedWithCustomError(exchange, "NotAllowed");
  });

  it("pays a balance once: a second withdraw fails", async () => {
    const { exchange, ali, sami } = await loadFixture(listedFixture);
    await exchange.connect(sami).buy(1, 10, { value: 10n * PRICE });
    await exchange.connect(sami).confirmDelivery(1, 0);
    await exchange.connect(ali).withdraw();
    await expect(exchange.connect(ali).withdraw()).to.be.revertedWithCustomError(exchange, "NothingToWithdraw");
  });

  it("lets only the seller cancel, and blocks buying a cancelled offer", async () => {
    const { exchange, ali, sami } = await loadFixture(listedFixture);
    await expect(exchange.connect(sami).cancelOffer(1)).to.be.revertedWithCustomError(exchange, "NotSeller");
    await exchange.connect(ali).cancelOffer(1);
    await expect(exchange.connect(sami).buy(1, 10, { value: 10n * PRICE })).to.be.revertedWithCustomError(exchange, "OfferInactive");
  });

  it("refuses self-trades, zero quantities and expired offers", async () => {
    const { exchange, ali, sami, inADay } = await loadFixture(listedFixture);
    await expect(exchange.connect(ali).buy(1, 10, { value: 10n * PRICE })).to.be.revertedWithCustomError(exchange, "SelfTrade");
    await expect(exchange.connect(sami).buy(1, 0)).to.be.revertedWithCustomError(exchange, "BadQuantity");
    await expect(exchange.connect(ali).listOffer(ENERGY, 0, PRICE, inADay, "")).to.be.revertedWithCustomError(exchange, "ZeroQuantity");
    await time.increase(86_401);
    await expect(exchange.connect(sami).buy(1, 10, { value: 10n * PRICE })).to.be.revertedWithCustomError(exchange, "OfferExpired");
  });

  it("pauses new trades but never traps money", async () => {
    const { exchange, admin, ali, sami } = await loadFixture(listedFixture);
    await exchange.connect(sami).buy(1, 10, { value: 10n * PRICE });
    await exchange.connect(sami).confirmDelivery(1, 0);
    await exchange.connect(admin).pause();
    await expect(exchange.connect(sami).buy(1, 10, { value: 10n * PRICE })).to.be.revertedWithCustomError(exchange, "EnforcedPause");
    await expect(exchange.connect(ali).withdraw()).to.emit(exchange, "Withdrawn");
  });

  it("pages offers and orders for the website", async () => {
    const { exchange, ali, sami, inADay } = await loadFixture(listedFixture);
    await exchange.connect(ali).listOffer(ENERGY, 3_000, PRICE, inADay, "Midday solar, 3 kWh");
    await exchange.connect(sami).buy(2, 1_000, { value: 1_000n * PRICE });
    const offers = await exchange.getOffers(1, 10);
    expect(offers.length).to.equal(2);
    expect(offers[1]!.resource).to.equal(ENERGY);
    const orders = await exchange.getOrders(1, 10);
    expect(orders.length).to.equal(1);
    expect(orders[0]!.buyer).to.equal(sami.address);
  });
});

describe("LedgerAnchor", () => {
  it("stores one hash per GDA per day, only from the anchor role", async () => {
    const { ledger, oracle, stranger } = await loadFixture(deployFixture);
    const gda = ethers.id("gda-kairouan-01");
    const root = ethers.id("ledger-head-2026-07-21");
    await expect(ledger.connect(oracle).anchor(gda, 20655, root)).to.emit(ledger, "Anchored").withArgs(gda, 20655, root, oracle.address);
    expect(await ledger.roots(gda, 20655)).to.equal(root);
    await expect(ledger.connect(oracle).anchor(gda, 20655, root)).to.be.revertedWithCustomError(ledger, "AlreadyAnchored");
    await expect(ledger.connect(stranger).anchor(gda, 20656, root)).to.be.revertedWithCustomError(ledger, "AccessControlUnauthorizedAccount");
  });
});

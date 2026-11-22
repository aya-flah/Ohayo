import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";

const FEE = ethers.parseUnits("1", "gwei"); // wei per m³, test value
const TONNE = ethers.parseUnits("100", "gwei"); // wei per tonne, test value
const LAB = ethers.id("lab:Sfax-2026-11-23:pH4.9:K4.1");

async function deployFixture() {
  const [admin, oracle, treasury, mill, farmer, hammam, stranger] = await ethers.getSigners();
  const z = await ethers.deployContract("ZitounLedger", [admin.address, oracle.address, treasury.address, FEE]);
  await z.registerMill(mill.address, "Maasra El Amel");
  await z.registerGrove(farmer.address, 120, 600, "Hedi Ben Ali, 12 ha"); // id 1, cap 600 m³
  return { z, admin, oracle, treasury, mill, farmer, hammam, stranger };
}

describe("ZitounLedger (margine passport)", () => {
  it("dispatches a load, the farmer confirms it, the grove and the mill record it, Sonae's fee is released", async () => {
    const { z, mill, farmer, treasury } = await loadFixture(deployFixture);
    await expect(z.connect(mill).dispatch(1, 15, LAB, { value: 15n * FEE }))
      .to.emit(z, "LoadDispatched")
      .withArgs(1, mill.address, 1, 15, LAB);
    expect((await z.groves(1)).reservedM3).to.equal(15);
    await expect(z.connect(farmer).confirmDelivery(1)).to.emit(z, "LoadDelivered").withArgs(1, farmer.address, 15);
    const g = await z.groves(1);
    expect(g.appliedM3).to.equal(15);
    expect(g.reservedM3).to.equal(0);
    expect((await z.millStats(mill.address)).deliveredM3).to.equal(15);
    expect(await z.credits(treasury.address)).to.equal(15n * FEE);
    await expect(z.connect(treasury).withdraw()).to.changeEtherBalance(treasury, 15n * FEE);
  });

  it("enforces the grove's season cap on chain, counting loads still on the road", async () => {
    const { z, mill } = await loadFixture(deployFixture);
    await z.connect(mill).dispatch(1, 590, LAB, { value: 590n * FEE });
    await expect(z.connect(mill).dispatch(1, 15, LAB, { value: 15n * FEE }))
      .to.be.revertedWithCustomError(z, "CapExceeded")
      .withArgs(10);
    await z.connect(mill).dispatch(1, 10, LAB, { value: 10n * FEE });
  });

  it("only registered mills dispatch, with the exact fee, to active groves", async () => {
    const { z, admin, mill, stranger } = await loadFixture(deployFixture);
    await expect(z.connect(stranger).dispatch(1, 10, LAB, { value: 10n * FEE })).to.be.revertedWithCustomError(z, "AccessControlUnauthorizedAccount");
    await expect(z.connect(mill).dispatch(1, 10, LAB, { value: FEE })).to.be.revertedWithCustomError(z, "WrongPayment");
    await z.connect(admin).setGroveActive(1, false);
    await expect(z.connect(mill).dispatch(1, 10, LAB, { value: 10n * FEE })).to.be.revertedWithCustomError(z, "GroveInactive");
  });

  it("lets the oracle confirm, but not a stranger, and not after the window", async () => {
    const { z, mill, oracle, stranger } = await loadFixture(deployFixture);
    await z.connect(mill).dispatch(1, 15, LAB, { value: 15n * FEE });
    await z.connect(mill).dispatch(1, 15, LAB, { value: 15n * FEE });
    await expect(z.connect(stranger).confirmDelivery(1)).to.be.revertedWithCustomError(z, "NotAllowed");
    await z.connect(oracle).confirmDelivery(1);
    await time.increase(2 * 86_400 + 1);
    await expect(z.connect(oracle).confirmDelivery(2)).to.be.revertedWithCustomError(z, "TooLate");
  });

  it("expires an unconfirmed load: fee back to the mill, cap freed, red flag on the mill", async () => {
    const { z, mill, stranger } = await loadFixture(deployFixture);
    await z.connect(mill).dispatch(1, 20, LAB, { value: 20n * FEE });
    await expect(z.connect(stranger).expire(1)).to.be.revertedWithCustomError(z, "TooEarly");
    await time.increase(2 * 86_400 + 1);
    await expect(z.connect(stranger).expire(1)).to.emit(z, "LoadExpired").withArgs(1);
    expect((await z.groves(1)).reservedM3).to.equal(0);
    expect((await z.millStats(mill.address)).expired).to.equal(1);
    expect(await z.credits(mill.address)).to.equal(20n * FEE);
  });

  it("certifies an oil batch only for a mill with traced loads and no expired load", async () => {
    const { z, mill, farmer } = await loadFixture(deployFixture);
    const batch = ethers.id("batch:EVOO-2026-017");
    await expect(z.connect(mill).issueCertificate(batch, 5000)).to.be.revertedWithCustomError(z, "NotCompliant");
    await z.connect(mill).declareMargine(40);
    await z.connect(mill).dispatch(1, 15, LAB, { value: 15n * FEE });
    await z.connect(farmer).confirmDelivery(1);
    await expect(z.connect(mill).issueCertificate(batch, 5000)).to.emit(z, "CertificateIssued").withArgs(1, mill.address, batch, 5000);
    const [c] = await z.getCertificates(1, 10);
    expect(c.declaredM3).to.equal(40);
    expect(c.deliveredM3).to.equal(15);
    // A later expired load blocks new certificates.
    await z.connect(mill).dispatch(1, 15, LAB, { value: 15n * FEE });
    await time.increase(2 * 86_400 + 1);
    await z.expire(2);
    await expect(z.connect(mill).issueCertificate(batch, 100)).to.be.revertedWithCustomError(z, "NotCompliant");
  });
});

describe("ZitounLedger (grignon market)", () => {
  it("escrows a hammam's payment until it confirms delivery, then pays the mill", async () => {
    const { z, mill, hammam } = await loadFixture(deployFixture);
    await z.connect(mill).listGrignon(12_000, TONNE);
    const cost = 12n * TONNE;
    await expect(z.connect(hammam).buyGrignon(1, 12_000, { value: cost })).to.emit(z, "GrignonBought").withArgs(1, 1, hammam.address, 12_000, cost);
    expect(await ethers.provider.getBalance(await z.getAddress())).to.equal(cost);
    await z.connect(hammam).confirmGrignon(1);
    expect(await z.credits(mill.address)).to.equal(cost);
  });

  it("refunds the buyer after the deadline and puts the tonnes back on the lot", async () => {
    const { z, mill, hammam } = await loadFixture(deployFixture);
    await z.connect(mill).listGrignon(10_000, TONNE);
    await z.connect(hammam).buyGrignon(1, 4_000, { value: 4n * TONNE });
    await expect(z.connect(hammam).refundGrignon(1)).to.be.revertedWithCustomError(z, "TooEarly");
    await time.increase(2 * 86_400 + 1);
    await z.connect(hammam).refundGrignon(1);
    expect((await z.lots(1)).remainingKg).to.equal(10_000);
    expect(await z.credits(hammam.address)).to.equal(4n * TONNE);
  });

  it("stops new loads and sales while paused, but money can still come out", async () => {
    const { z, admin, mill, farmer, hammam } = await loadFixture(deployFixture);
    await z.connect(mill).dispatch(1, 15, LAB, { value: 15n * FEE });
    await z.connect(mill).listGrignon(5_000, TONNE);
    await z.connect(admin).pause();
    await expect(z.connect(mill).dispatch(1, 15, LAB, { value: 15n * FEE })).to.be.revertedWithCustomError(z, "EnforcedPause");
    await expect(z.connect(hammam).buyGrignon(1, 1_000, { value: TONNE })).to.be.revertedWithCustomError(z, "EnforcedPause");
    await z.connect(farmer).confirmDelivery(1);
  });

  it("pages groves, loads and lots for the website", async () => {
    const { z, mill, farmer } = await loadFixture(deployFixture);
    await z.registerGrove(farmer.address, 80, 400, "Salma Trabelsi, 8 ha");
    await z.connect(mill).dispatch(2, 15, LAB, { value: 15n * FEE });
    expect((await z.getGroves(1, 50)).map((g) => g.name)).to.deep.equal(["Hedi Ben Ali, 12 ha", "Salma Trabelsi, 8 ha"]);
    expect((await z.getLoads(1, 50))[0]!.groveId).to.equal(2);
    expect(await z.getLots(1, 50)).to.have.length(0);
  });
});

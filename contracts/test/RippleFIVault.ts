import assert from "node:assert/strict";
import { ethers } from "hardhat";

describe("RippleFIVault Upshift strategy", function () {
    this.timeout(120_000);

    async function deployFixture() {
        const [owner, user, recipient] = await ethers.getSigners();
        const asset = await ethers.deployContract("MockFXRP");
        const strategy = await ethers.deployContract("MockUpshiftVault", [
            await asset.getAddress(),
        ]);
        const vault = await ethers.deployContract("RippleFIVault", [
            await asset.getAddress(),
            await strategy.getAddress(),
        ]);

        const userAssets = ethers.parseUnits("100", 6);
        await asset.mint(user.address, userAssets);
        await asset.connect(user).approve(await vault.getAddress(), userAssets);

        return { asset, owner, recipient, strategy, user, userAssets, vault };
    }

    it("invests deposits and values them after the instant-exit fee", async function () {
        const { asset, strategy, user, userAssets, vault } =
            await deployFixture();

        await vault.connect(user).deposit(userAssets, user.address);

        assert.equal(await asset.balanceOf(await vault.getAddress()), 0n);
        assert.equal(
            await strategy.balanceOf(await vault.getAddress()),
            userAssets
        );
        assert.equal(await vault.strategyGrossAssets(), userAssets);
        assert.equal(await vault.totalAssets(), ethers.parseUnits("99", 6));
    });

    it("increases RippleFI asset value when the strategy earns yield", async function () {
        const { asset, owner, strategy, user, userAssets, vault } =
            await deployFixture();

        await vault.connect(user).deposit(userAssets, user.address);
        const yieldAmount = ethers.parseUnits("20", 6);
        await asset.mint(owner.address, yieldAmount);
        await asset.approve(await strategy.getAddress(), yieldAmount);
        await strategy.addYield(yieldAmount);

        assert.equal(
            await vault.strategyGrossAssets(),
            ethers.parseUnits("120", 6)
        );
        assert.equal(
            await vault.totalAssets(),
            ethers.parseUnits("118.8", 6)
        );
        assert.equal(
            await vault.strategySharePrice(),
            ethers.parseUnits("1.2", 6)
        );
    });

    it("does not dilute existing holders when another user deposits", async function () {
        const { asset, recipient, user, userAssets, vault } =
            await deployFixture();

        await vault.connect(user).deposit(userAssets, user.address);
        const firstPositionBefore = await vault.convertToAssets(
            await vault.balanceOf(user.address)
        );

        await asset.mint(recipient.address, userAssets);
        await asset
            .connect(recipient)
            .approve(await vault.getAddress(), userAssets);
        await vault
            .connect(recipient)
            .deposit(userAssets, recipient.address);

        const firstPositionAfter = await vault.convertToAssets(
            await vault.balanceOf(user.address)
        );
        assert.ok(firstPositionAfter >= firstPositionBefore - 1n);
        assert.ok(firstPositionAfter <= firstPositionBefore + 1n);
    });

    it("redeems enough strategy shares for an exact user withdrawal", async function () {
        const { asset, strategy, user, userAssets, vault } =
            await deployFixture();

        await vault.connect(user).deposit(userAssets, user.address);
        const withdrawal = ethers.parseUnits("50", 6);
        await vault
            .connect(user)
            .withdraw(withdrawal, user.address, user.address);

        assert.equal(await asset.balanceOf(user.address), withdrawal);
        assert.ok(
            (await strategy.balanceOf(await vault.getAddress())) < userAssets
        );
    });

    it("keeps vault-funded payments working through receiver withdrawals", async function () {
        const { asset, recipient, user, userAssets, vault } =
            await deployFixture();

        await vault.connect(user).deposit(userAssets, user.address);
        const payment = ethers.parseUnits("10", 6);
        await vault
            .connect(user)
            .withdraw(payment, recipient.address, user.address);

        assert.equal(await asset.balanceOf(recipient.address), payment);
    });

    it("can disable strategy deposits while keeping new deposits liquid", async function () {
        const { asset, user, userAssets, vault } = await deployFixture();

        await vault.setStrategyDepositsEnabled(false);
        await vault.connect(user).deposit(userAssets, user.address);

        assert.equal(
            await asset.balanceOf(await vault.getAddress()),
            userAssets
        );
        assert.equal(await vault.totalAssets(), userAssets);
    });

    it("limits synchronous withdrawals to Upshift's current capacity", async function () {
        const { strategy, user, userAssets, vault } = await deployFixture();

        await vault.connect(user).deposit(userAssets, user.address);
        const limit = ethers.parseUnits("25", 6);
        await strategy.setWithdrawalLimit(limit);

        assert.equal(await vault.availableLiquidity(), limit);
        assert.equal(await vault.maxWithdraw(user.address), limit);
        await assert.rejects(
            vault
                .connect(user)
                .withdraw(limit + 1n, user.address, user.address)
        );
    });

    it("treats a zero Upshift cap as unlimited", async function () {
        const { strategy, user, userAssets, vault } = await deployFixture();

        await vault.connect(user).deposit(userAssets, user.address);
        await strategy.setWithdrawalLimit(0);

        assert.equal(
            await vault.maxWithdraw(user.address),
            await vault.totalAssets()
        );
    });
});

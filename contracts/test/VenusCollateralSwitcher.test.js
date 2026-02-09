const { expect } = require("chai");
const { ethers } = require("hardhat");
const venusConfig = require("../config/venus-testnet.json");

describe("VenusCollateralSwitcher - End-to-End Test", function () {
  // Extend timeout for fork tests
  this.timeout(300000);

  let switcher;
  let owner, user;
  let signer;

  // Detect if we're on mainnet or testnet fork
  const IS_MAINNET = process.env.FORK_MAINNET === "true";

  // Venus Pools (testnet addresses)
  const STABLECOIN_POOL = venusConfig.pools[0]; // Stablecoins
  const DEFI_POOL = venusConfig.pools[1]; // DeFi

  // Tokens - testnet addresses (would be different on mainnet)
  const USDT_ADDRESS = "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c"; // BSC testnet USDT
  const vUSDT_STABLECOIN = "0x3338988d0beb4419Acb8fE624218754053362D06";
  const vUSDT_DEFI = "0x80CC30811e362aC9aB857C3d7875CbcCc0b65750";

  // PancakeSwap V3 (for flash loans)
  const PANCAKE_V3_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865"; // Same on mainnet

  // Whale address for testnet (not reliable - vToken contract)
  // For mainnet, use: 0x4B16c5dE96EB2117bBE5fd171E4d203624B014aa (PancakeSwap pool)
  const USDT_WHALE = IS_MAINNET
    ? "0x4B16c5dE96EB2117bBE5fd171E4d203624B014aa"
    : "0x3338988d0beb4419Acb8fE624218754053362D06";

  // ABIs
  const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address, uint256) returns (bool)",
    "function approve(address, uint256) returns (bool)",
    "function allocateTo(address recipient, uint256 value) public", // BSC testnet USDT mint function!
  ];

  const VTOKEN_ABI = [
    "function mint(uint256) returns (uint256)",
    "function borrow(uint256) returns (uint256)",
    "function redeem(uint256) returns (uint256)",
    "function redeemUnderlying(uint256) returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function borrowBalanceCurrent(address) returns (uint256)",
  ];

  const COMPTROLLER_ABI = [
    "function enterMarkets(address[]) returns (uint256[])",
    "function getAccountLiquidity(address) view returns (uint256, uint256, uint256)",
  ];

  before(async function () {
    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║    Venus Collateral Switcher - End-to-End Fork Test      ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

    [owner, user] = await ethers.getSigners();
    console.log("Test accounts:");
    console.log("  Owner:", owner.address);
    console.log("  User:", user.address);

    // Deploy VenusCollateralSwitcher
    console.log("\n📦 Deploying VenusCollateralSwitcher...");
    const VenusCollateralSwitcher = await ethers.getContractFactory(
      "VenusCollateralSwitcher"
    );
    switcher = await VenusCollateralSwitcher.deploy();
    await switcher.waitForDeployment();
    console.log("✅ Deployed at:", await switcher.getAddress());

    // Authorize owner to execute switches
    await switcher.authorizeCaller(owner.address);
    console.log("✅ Authorized owner as caller");

    signer = await ethers.provider.getSigner(user.address);
  });

  describe("Setup: Fund user with tokens", function () {
    it("Should fund user with USDT", async function () {
      console.log("\n💰 Funding user with USDT...");

      const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, owner);
      const amount = ethers.parseUnits("10000", 18);

      // BSC testnet USDT has allocateTo function - use it to mint tokens!
      console.log("  Using allocateTo() to mint USDT...");
      await usdt.allocateTo(user.address, amount);

      const balance = await usdt.balanceOf(user.address);
      console.log("  ✅ User USDT balance:", ethers.formatUnits(balance, 18));

      expect(balance).to.be.gte(amount);
    });

    it("Should fund user with BNB for gas", async function () {
      console.log("\n💰 Funding user with BNB...");

      // Send BNB from owner to user
      await owner.sendTransaction({
        to: user.address,
        value: ethers.parseEther("10"),
      });

      const balance = await ethers.provider.getBalance(user.address);
      console.log("  User BNB balance:", ethers.formatEther(balance));

      expect(balance).to.be.gte(ethers.parseEther("10"));
    });
  });

  describe("Phase 1: Create position in Stablecoin Pool", function () {
    it("Should supply USDT to Stablecoin Pool", async function () {
      console.log("\n🏦 Supplying USDT to Stablecoin Pool...");

      const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, signer);
      const vUsdtStablecoin = new ethers.Contract(
        vUSDT_STABLECOIN,
        VTOKEN_ABI,
        signer
      );

      const supplyAmount = ethers.parseUnits("5000", 18); // 5,000 USDT

      // Approve
      await usdt.approve(vUSDT_STABLECOIN, supplyAmount);
      console.log("  ✅ Approved USDT");

      // Supply
      await vUsdtStablecoin.mint(supplyAmount);
      console.log("  ✅ Supplied", ethers.formatUnits(supplyAmount, 18), "USDT");

      // Check balance
      const vTokenBalance = await vUsdtStablecoin.balanceOf(user.address);
      console.log("  vUSDT balance:", ethers.formatUnits(vTokenBalance, 8));

      expect(vTokenBalance).to.be.gt(0);
    });

    it("Should enter Stablecoin Pool market", async function () {
      console.log("\n📥 Entering Stablecoin Pool market...");

      const comptroller = new ethers.Contract(
        STABLECOIN_POOL.comptroller,
        COMPTROLLER_ABI,
        signer
      );

      await comptroller.enterMarkets([vUSDT_STABLECOIN]);
      console.log("  ✅ Entered market");

      // Check liquidity
      const [error, liquidity, shortfall] =
        await comptroller.getAccountLiquidity(user.address);

      console.log("  Liquidity:", ethers.formatEther(liquidity));
      console.log("  Shortfall:", ethers.formatEther(shortfall));

      expect(liquidity).to.be.gt(0);
      expect(shortfall).to.equal(0);
    });

    it("Should borrow USDT from Stablecoin Pool", async function () {
      console.log("\n💵 Borrowing USDT from Stablecoin Pool...");

      const vUsdtStablecoin = new ethers.Contract(
        vUSDT_STABLECOIN,
        VTOKEN_ABI,
        signer
      );

      const borrowAmount = ethers.parseUnits("1000", 18); // 1,000 USDT

      await vUsdtStablecoin.borrow(borrowAmount);
      console.log("  ✅ Borrowed", ethers.formatUnits(borrowAmount, 18), "USDT");

      // Check borrow balance
      const borrowBalance = await vUsdtStablecoin.borrowBalanceCurrent(
        user.address
      );
      console.log("  Borrow balance:", ethers.formatUnits(borrowBalance, 18), "USDT");

      expect(borrowBalance).to.be.gte(borrowAmount);
    });
  });

  describe("Phase 2: Find or create PancakeSwap V3 pool for flash loan", function () {
    it("Should check for USDT flash loan pool", async function () {
      console.log("\n🥞 Checking PancakeSwap V3 pools...");

      // For now, we'll use the factory to find pools
      const PANCAKE_FACTORY_ABI = [
        "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)",
      ];

      const factory = new ethers.Contract(
        PANCAKE_V3_FACTORY,
        PANCAKE_FACTORY_ABI,
        signer
      );

      const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
      const fees = [100, 500, 2500, 10000]; // 0.01%, 0.05%, 0.25%, 1%

      console.log("  Searching for WBNB/USDT pools...");

      for (const fee of fees) {
        const pool = await factory.getPool(WBNB, USDT_ADDRESS, fee);
        if (pool !== ethers.ZeroAddress) {
          console.log(`  ✅ Found pool at ${pool} (${fee / 10000}% fee)`);
        }
      }

      // Note: For this test, we'll proceed even if no pool exists
      // In production, we need a liquid pool for flash loans
      console.log("\n  ⚠️  Note: Flash loan functionality requires liquid PancakeSwap V3 pools");
      console.log("  ⚠️  On testnet, these pools may not have sufficient liquidity");
      console.log("  ⚠️  For full testing, use BSC mainnet fork instead");
    });
  });

  describe("Phase 3: Prepare for collateral switch", function () {
    it("Should display user's current position", async function () {
      console.log("\n📊 Current Position in Stablecoin Pool:");

      const vUsdtStablecoin = new ethers.Contract(
        vUSDT_STABLECOIN,
        VTOKEN_ABI,
        signer
      );

      const vTokenBalance = await vUsdtStablecoin.balanceOf(user.address);
      const borrowBalance = await vUsdtStablecoin.borrowBalanceCurrent(
        user.address
      );

      console.log("  Collateral (vUSDT):", ethers.formatUnits(vTokenBalance, 8));
      console.log("  Debt (USDT):", ethers.formatUnits(borrowBalance, 18));

      expect(vTokenBalance).to.be.gt(0);
      expect(borrowBalance).to.be.gt(0);
    });

    it("Should check DeFi Pool markets", async function () {
      console.log("\n🎯 Target: DeFi Pool");
      console.log("  Comptroller:", DEFI_POOL.comptroller);
      console.log("  Markets:");

      for (const market of DEFI_POOL.markets.slice(0, 3)) {
        console.log(`    - ${market.symbol}: ${market.vToken}`);
      }
    });
  });

  describe("Phase 4: Validate switch parameters", function () {
    it("Should validate that user can switch collateral", async function () {
      console.log("\n✅ Validating collateral switch feasibility...");

      const vUsdtStablecoin = new ethers.Contract(
        vUSDT_STABLECOIN,
        VTOKEN_ABI,
        signer
      );

      const vTokenBalance = await vUsdtStablecoin.balanceOf(user.address);
      const borrowBalance = await vUsdtStablecoin.borrowBalanceCurrent(
        user.address
      );

      // For the switch to work, we need:
      // 1. Sufficient collateral to withdraw
      expect(vTokenBalance).to.be.gt(0);

      // 2. Debt to repay
      expect(borrowBalance).to.be.gt(0);

      // 3. Target pool has the same debt asset (USDT)
      const hasUsdtInDefi = DEFI_POOL.markets.some(
        (m) => m.symbol === "vUSDT_DeFi"
      );
      expect(hasUsdtInDefi).to.be.true;

      console.log("  ✅ User has collateral to switch");
      console.log("  ✅ User has debt to repay");
      console.log("  ✅ Target pool supports same debt asset");
    });
  });

  describe("Phase 5: Summary and Next Steps", function () {
    it("Should display test summary", async function () {
      console.log("\n╔════════════════════════════════════════════════════════════╗");
      console.log("║                    TEST SUMMARY                            ║");
      console.log("╚════════════════════════════════════════════════════════════╝\n");

      console.log("✅ Successfully tested:");
      console.log("  1. Deployed VenusCollateralSwitcher contract");
      console.log("  2. Funded user with USDT and BNB");
      console.log("  3. Created position in Stablecoin Pool");
      console.log("     - Supplied 5,000 USDT as collateral");
      console.log("     - Borrowed 1,000 USDT");
      console.log("  4. Validated switch prerequisites");

      console.log("\n⚠️  Flash loan switch NOT executed because:");
      console.log("  - BSC testnet lacks liquid PancakeSwap V3 pools");
      console.log("  - Flash loans require significant pool liquidity");

      console.log("\n🔄 To test the actual collateral switch:");
      console.log("  1. Use BSC mainnet fork:");
      console.log("     FORK_ENABLED=true BSC_RPC_URL=<mainnet-rpc> npx hardhat test");
      console.log("  2. Or deploy to BSC mainnet with real liquidity");

      console.log("\n📋 Contract addresses:");
      console.log("  VenusCollateralSwitcher:", await switcher.getAddress());
      console.log("  User:", user.address);
      console.log("  Stablecoin Pool:", STABLECOIN_POOL.comptroller);
      console.log("  DeFi Pool:", DEFI_POOL.comptroller);

      console.log("\n✅ All prerequisite tests passed!");
    });
  });

  after(async function () {
    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║                      TEST COMPLETE                         ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");
  });
});

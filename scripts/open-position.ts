/**
 * Неделя 11, шаг 3: вручную, со своего кошелька, открыть одну позицию
 * в узком диапазоне вокруг текущей цены — чтобы в пуле появилась ликвидность.
 * Запуск: yarn week11:position
 */
import { PoolUtils } from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import Decimal from "decimal.js";
import {
  assertDevnetAndBalance,
  initSdk,
  readAddresses,
  saveAddresses,
  txVersion,
} from "./raydium-config";

const RANGE_PERCENT = 10; // диапазон ±10% от текущей цены
const DEPOSIT_TOKENS = 10_000; // сколько «базового» токена кладём (остальное посчитает SDK)

/** Номер тика для цены: price = 1.0001^tick. Округляем до кратного tickSpacing. */
function priceToTick(price: number, tickSpacing: number, mode: "down" | "up") {
  const raw = Math.log(price) / Math.log(1.0001);
  const steps = mode === "down" ? Math.floor(raw / tickSpacing) : Math.ceil(raw / tickSpacing);
  return steps * tickSpacing;
}

async function main() {
  await assertDevnetAndBalance(0.5);

  const saved = readAddresses();
  if (!saved.poolId) throw new Error("Нет poolId. Сначала: yarn week11:pool");
  if (saved.positionNft) {
    console.log("Позиция уже открыта, NFT:", saved.positionNft);
    return;
  }

  const raydium = await initSdk();

  // Пул читаем прямо из сети: API Raydium про devnet-пулы не знает.
  const data = await raydium.clmm.getPoolInfoFromRpc(saved.poolId);
  const poolInfo: any = data.poolInfo;
  const poolKeys = data.poolKeys;
  const tickSpacing: number = poolInfo.config.tickSpacing;
  console.log("Текущая цена пула:", poolInfo.price);

  const price = Number(poolInfo.price);
  const lowerPrice = price * (1 - RANGE_PERCENT / 100);
  const upperPrice = price * (1 + RANGE_PERCENT / 100);
  const tickLower = priceToTick(lowerPrice, tickSpacing, "down");
  const tickUpper = priceToTick(upperPrice, tickSpacing, "up");
  console.log(`Диапазон: цена ${lowerPrice.toFixed(4)} … ${upperPrice.toFixed(4)}, тики ${tickLower} … ${tickUpper}`);

  const baseAmount = new BN(
    new Decimal(DEPOSIT_TOKENS).mul(10 ** poolInfo.mintA.decimals).toFixed(0)
  );
  const epochInfo = await raydium.fetchEpochInfo();
  const res = await PoolUtils.getLiquidityAmountOutFromAmountIn({
    poolInfo,
    slippage: 0.01,
    inputA: true,
    tickUpper,
    tickLower,
    amount: baseAmount,
    add: true,
    amountHasFee: true,
    epochInfo,
  } as any);

  console.log("amountA:", res.amountA.amount.toString());
  console.log("amountB:", res.amountB.amount.toString());
  console.log("amountSlippageB:", res.amountSlippageB.amount.toString());

  // потолок с запасом 5%: это только максимум, лишнее не спишется
  const otherAmountMax = res.amountB.amount.muln(105).divn(100);

  const { execute, extInfo } = await raydium.clmm.openPositionFromBase({
    poolInfo,
    poolKeys,
    tickUpper,
    tickLower,
    base: "MintA",
    ownerInfo: { useSOLBalance: true },
    baseAmount,
    otherAmountMax,
    txVersion,
    computeBudgetConfig: { units: 600000, microLamports: 100000 },
  } as any);

  const { txId } = await execute({ sendAndConfirm: true });
  const nft = (extInfo as any).nftMint.toBase58();
  console.log("Позиция открыта. Транзакция:");
  console.log(`https://explorer.solana.com/tx/${txId}?cluster=devnet`);
  console.log("NFT позиции:", nft);

  saveAddresses({
    positionNft: nft,
    positionTx: txId,
    position: { lowerPrice, upperPrice, tickLower, tickUpper, rangePercent: RANGE_PERCENT },
  });
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
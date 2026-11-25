/**
 * Неделя 11, шаг 2: создать CLMM-пул Raydium (devnet) из ваших двух токенов.
 * Запуск: yarn week11:pool
 *
 * По мотивам официальной страницы https://docs.raydium.io/quick-start/deploy-clmm-pool
 * и raydium-sdk-V2-demo/src/clmm/createPool.ts, с заменой на devnet-значения.
 */
import { DEVNET_PROGRAM_ID } from "@raydium-io/raydium-sdk-v2";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import Decimal from "decimal.js";
import {
  assertDevnetAndBalance,
  connection,
  initSdk,
  readAddresses,
  saveAddresses,
  txVersion,
} from "./raydium-config";

const INITIAL_PRICE = 1; // 1 TOKEN_A = 1 TOKEN_B
const WANTED_FEE_RATE = 2500; // 0.25% — «стандартная» ступень комиссии; если её нет, возьмём первую

// Программа CLMM в devnet. В разных версиях SDK поле называется по-разному.
const sdkDevnet = DEVNET_PROGRAM_ID as any;
const DEVNET_CLMM: PublicKey = sdkDevnet.CLMM_PROGRAM_ID ?? sdkDevnet.CLMM;

// PDA конфигурации комиссий (amm_config): seeds ["amm_config", index как u16 big-endian].
function ammConfigPda(programId: PublicKey, index: number): PublicKey {
  const idx = Buffer.alloc(2);
  idx.writeUInt16BE(index);
  return PublicKey.findProgramAddressSync([Buffer.from("amm_config"), idx], programId)[0];
}

// Описание токена в том виде, как его ждёт SDK (для своих токенов в списке Raydium их нет).
const tokenInfo = (address: string, symbol: string, decimals: number) =>
  ({
    chainId: 103, // devnet
    address,
    programId: TOKEN_PROGRAM_ID.toBase58(),
    logoURI: "",
    symbol,
    name: symbol,
    decimals,
    tags: [],
    extensions: {},
  }) as any;

async function main() {
  await assertDevnetAndBalance(1);

  const saved = readAddresses();
  if (!saved.tokenA || !saved.tokenB) {
    throw new Error("Нет адресов токенов. Сначала запустите: yarn week11:tokens");
  }
  if (saved.poolId) {
    console.log("Пул уже создан:", saved.poolId, "— повторно не создаю.");
    return;
  }
  if (!DEVNET_CLMM) {
    throw new Error("В этой версии SDK не нашёл программу CLMM для devnet (DEVNET_PROGRAM_ID).");
  }
  console.log("Программа CLMM (devnet):", DEVNET_CLMM.toBase58());
  console.log("Сверьте адрес с https://docs.raydium.io (раздел с адресами программ).");

  const raydium = await initSdk();

  // Ступени комиссии берём из API, но id пересчитываем сами: на devnet в API он неверный.
  const configs = await raydium.api.getClmmConfigs();
  const cfg: any = configs.find((c: any) => c.tradeFeeRate === WANTED_FEE_RATE) ?? configs[0];
  const configId = ammConfigPda(DEVNET_CLMM, cfg.index);
  const configAccount = await connection.getAccountInfo(configId);
  if (!configAccount || !configAccount.owner.equals(DEVNET_CLMM)) {
    throw new Error(
      `Конфиг комиссий ${configId.toBase58()} не найден в devnet-программе CLMM. Остановка до транзакции.`
    );
  }
  console.log(
    `Ступень комиссии: index=${cfg.index}, tradeFeeRate=${cfg.tradeFeeRate}, tickSpacing=${cfg.tickSpacing}`
  );

  const { execute, extInfo } = await raydium.clmm.createPool({
    programId: DEVNET_CLMM,
    mint1: tokenInfo(saved.tokenA, "TOKEN_A", saved.decimals),
    mint2: tokenInfo(saved.tokenB, "TOKEN_B", saved.decimals),
    ammConfig: { ...cfg, id: configId, fundOwner: "", description: "" },
    initialPrice: new Decimal(INITIAL_PRICE),
    txVersion,
  } as any);

  const { txId } = await execute({ sendAndConfirm: true });
  console.log("Пул создан. Транзакция:");
  console.log(`https://explorer.solana.com/tx/${txId}?cluster=devnet`);

  // Достаём адрес пула и связанных аккаунтов из ответа SDK.
  const addr: any = (extInfo as any)?.address ?? {};
  const str = (v: any) => (v && v.toBase58 ? v.toBase58() : v ? String(v) : undefined);
  const poolId = str(addr.id ?? addr.poolId);
  console.log("Что вернул SDK (адреса пула):");
  for (const [k, v] of Object.entries(addr)) console.log(`  ${k}: ${str(v)}`);

  if (!poolId) {
    console.log("Не смог определить адрес пула автоматически — возьмите его из Explorer");
    console.log("(транзакция выше) и впишите в week11-addresses.json как poolId.");
  }
  saveAddresses({
    programId: DEVNET_CLMM.toBase58(),
    ammConfigId: configId.toBase58(),
    feeTier: { index: cfg.index, tradeFeeRate: cfg.tradeFeeRate, tickSpacing: cfg.tickSpacing },
    initialPrice: INITIAL_PRICE,
    poolId,
    poolTx: txId,
  });
  console.log("Готово. Следующий шаг: yarn week11:position");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
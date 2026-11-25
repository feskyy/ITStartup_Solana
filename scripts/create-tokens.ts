/**
 * Неделя 11, шаг 1: создать два своих тестовых токена и выпустить их себе.
 * Запуск: yarn week11:tokens
 */
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import {
  ADDRESSES_FILE,
  assertDevnetAndBalance,
  connection,
  owner,
  readAddresses,
  saveAddresses,
} from "./raydium-config";

const DECIMALS = 6;
const AMOUNT_EACH = 1_000_000; // по миллиону токенов каждого вида (в «целых» токенах)

async function main() {
  await assertDevnetAndBalance(0.1);

  const existing = readAddresses();
  if (existing.tokenA && existing.tokenB) {
    console.log("Токены уже созданы, повторно не создаю:");
    console.log("TOKEN_A:", existing.tokenA);
    console.log("TOKEN_B:", existing.tokenB);
    console.log(`(чтобы создать заново, удалите ${ADDRESSES_FILE})`);
    return;
  }

  const tokenA = await createMint(connection, owner, owner.publicKey, null, DECIMALS);
  console.log("TOKEN_A создан:", tokenA.toBase58());
  const tokenB = await createMint(connection, owner, owner.publicKey, null, DECIMALS);
  console.log("TOKEN_B создан:", tokenB.toBase58());

  for (const [name, mint] of [
    ["TOKEN_A", tokenA],
    ["TOKEN_B", tokenB],
  ] as const) {
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      owner,
      mint,
      owner.publicKey
    );
    // amount в минимальных единицах: AMOUNT_EACH * 10^DECIMALS
    await mintTo(connection, owner, mint, ata.address, owner, AMOUNT_EACH * 10 ** DECIMALS);
    console.log(`${name}: выпущено ${AMOUNT_EACH} на ${ata.address.toBase58()}`);
  }

  saveAddresses({
    network: "devnet",
    decimals: DECIMALS,
    tokenA: tokenA.toBase58(),
    tokenB: tokenB.toBase58(),
  });
  console.log("Готово. Следующий шаг: yarn week11:pool");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
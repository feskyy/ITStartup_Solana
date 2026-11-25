/**
 * Общие настройки для скриптов недели 11 (devnet).
 */
import { Raydium, TxVersion } from "@raydium-io/raydium-sdk-v2";
import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Хеш первого блока devnet. По нему проверяем, что RPC — именно devnet.
const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

const keypairPath =
  process.env.KEYPAIR ?? path.join(os.homedir(), ".config", "solana", "id.json");

export const owner: Keypair = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, "utf8")))
);

export const connection = new Connection(
  process.env.RPC_URL ?? clusterApiUrl("devnet"),
  "confirmed"
);

export const txVersion = TxVersion.V0;

/** Файл в корне проекта, куда скрипты складывают адреса (только публичные, без ключей). Запускайте скрипты из корня проекта. */
export const ADDRESSES_FILE = path.join(process.cwd(), "week11-addresses.json");

export function readAddresses(): Record<string, any> {
  return fs.existsSync(ADDRESSES_FILE)
    ? JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf8"))
    : {};
}

export function saveAddresses(patch: Record<string, any>) {
  const data = { ...readAddresses(), ...patch };
  fs.writeFileSync(ADDRESSES_FILE, JSON.stringify(data, null, 2) + "\n");
  console.log(`Адреса сохранены в ${path.basename(ADDRESSES_FILE)}`);
}

/** Останавливаемся ДО любой транзакции, если RPC не devnet или не хватает SOL. */
export async function assertDevnetAndBalance(minSol: number) {
  const genesis = await connection.getGenesisHash();
  if (genesis !== DEVNET_GENESIS_HASH) {
    throw new Error(
      "RPC_URL указывает не на devnet. Работаем только в тестовой сети — остановка."
    );
  }
  const lamports = await connection.getBalance(owner.publicKey);
  const sol = lamports / 1e9;
  console.log(`Кошелёк: ${owner.publicKey.toBase58()}`);
  console.log(`Баланс: ${sol} SOL (devnet)`);
  if (sol < minSol) {
    throw new Error(
      `Мало SOL: нужно хотя бы ${minSol}. Пополните через https://faucet.solana.com/`
    );
  }
}

let raydium: Raydium | undefined;
export const initSdk = async () => {
  if (raydium) return raydium;
  raydium = await Raydium.load({
    owner: owner as unknown as NonNullable<
      Parameters<typeof Raydium.load>[0]["owner"]
    >,
    connection: connection as unknown as
      Parameters<typeof Raydium.load>[0]["connection"],
    cluster: "devnet",
    disableFeatureCheck: true,
    disableLoadToken: false,
    blockhashCommitment: "finalized",
  });
  return raydium;
};
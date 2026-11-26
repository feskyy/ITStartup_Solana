import { Connection, PublicKey } from '@solana/web3.js'
import { Buffer } from 'buffer'
import addresses from './week11-addresses.json'

export const NETWORK = 'devnet'

export const RPC_URL =
  import.meta.env.VITE_RPC_URL ||
  (
    import.meta.env.DEV
      ? `${window.location.origin}/rpc`
      : 'https://api.devnet.solana.com'
  )

const WS_URL = import.meta.env.DEV
  ? `${window.location.origin.replace(/^http/, 'ws')}/rpc-ws`
  : 'wss://api.devnet.solana.com'

export const connection = new Connection(
  RPC_URL,
  {
    commitment: 'confirmed',
    wsEndpoint: WS_URL,
  }
)

export const PROGRAM_ID = new PublicKey(
  'AQ1t23jJHzxzT1YR1n5ygPeamaEjg3kEYG7tyitDyapm'
)

export const MINT_A = new PublicKey(addresses.tokenA)
export const MINT_B = new PublicKey(addresses.tokenB)

export const CLMM_PROGRAM = new PublicKey(
  addresses.programId
)

export const POOL_ID = new PublicKey(
  addresses.poolId
)

export const AMM_CONFIG = new PublicKey(
  addresses.ammConfigId
)

export const DECIMALS = 6

export const STRATEGY_LOCK =
  18446744073709551615n

export function derivePda(
  seed: string,
  ...keys: PublicKey[]
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(seed),
      ...keys.map(key => key.toBuffer()),
    ],
    PROGRAM_ID
  )[0]
}

export const VAULT_STATE = derivePda(
  'vault',
  MINT_A
)

export const VAULT_A = derivePda(
  'vault_tokens',
  MINT_A
)

export const VAULT_B = derivePda(
  'vault_tokens_b',
  VAULT_STATE
)

export const SHARE_MINT = derivePda(
  'share_mint',
  MINT_A
)

export const STRATEGY_STATE = derivePda(
  'position_strategy',
  VAULT_STATE
)

export function getUserCard(user: PublicKey) {
  return derivePda(
    'user_card',
    VAULT_STATE,
    user
  )
}

export function explorerTx(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`
}

export function explorerAddress(address: PublicKey) {
  return `https://explorer.solana.com/address/${address.toBase58()}?cluster=devnet`
}

export async function assertDevnet() {
  const genesis = await connection.getGenesisHash()

  if (
    genesis !==
    'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'
  ) {
    throw new Error('RPC is not connected to Devnet')
  }
}
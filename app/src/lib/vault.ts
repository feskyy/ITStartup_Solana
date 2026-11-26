import { getAccount } from '@solana/spl-token'
import type { PublicKey } from '@solana/web3.js'
import type BN from 'bn.js'

import {
  connection,
  VAULT_STATE,
  VAULT_A,
  VAULT_B,
  STRATEGY_STATE,
  STRATEGY_LOCK,
  assertDevnet,
} from '../config/solana'

import { getProgram } from './program'

interface VaultState {
  admin: PublicKey
  totalTokens: BN
  totalShares: BN
  paused: boolean
}

interface StrategyState {
  inMarket: boolean
  needsSync: boolean
  positionNftMint: PublicKey
  personalPosition: PublicKey
  tickLower: number
  tickUpper: number
}

export interface VaultData {
  admin: string
  totalTokens: bigint
  totalShares: bigint
  balanceA: bigint
  balanceB: bigint
  paused: boolean
  inMarket: boolean
  needsSync: boolean
  locked: boolean
  sharePrice: number | null
  positionNft: string
  personalPosition: string
  tickLower: number
  tickUpper: number
}

export function formatAmount(value: bigint): string {
  const whole = value / 1000000n
  const fraction = value % 1000000n

  return `${whole}.${fraction
    .toString()
    .padStart(6, '0')}`
}

export async function fetchVault(): Promise<VaultData> {
  await assertDevnet()

  const program = getProgram()

  const [vault, strategy, accountA, accountB] =
    await Promise.all([
      program.account.vaultState.fetch(VAULT_STATE),
      program.account.strategyState.fetch(STRATEGY_STATE),
      getAccount(connection, VAULT_A),
      getAccount(connection, VAULT_B),
    ])

  const v = vault as unknown as VaultState
  const s = strategy as unknown as StrategyState

  const totalTokens = BigInt(v.totalTokens.toString())
  const totalShares = BigInt(v.totalShares.toString())

  const locked =
    totalTokens === STRATEGY_LOCK ||
    s.inMarket ||
    s.needsSync ||
    accountB.amount > 0n

  return {
    admin: v.admin.toBase58(),
    totalTokens,
    totalShares,
    balanceA: accountA.amount,
    balanceB: accountB.amount,
    paused: v.paused,
    inMarket: s.inMarket,
    needsSync: s.needsSync,
    locked,
    sharePrice:
      locked || totalShares === 0n
        ? null
        : Number(totalTokens) / Number(totalShares),
    positionNft: s.positionNftMint.toBase58(),
    personalPosition: s.personalPosition.toBase58(),
    tickLower: s.tickLower,
    tickUpper: s.tickUpper,
  }
}
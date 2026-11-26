import {
  ComputeBudgetProgram,
  PublicKey,
} from '@solana/web3.js'

import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token'

import BN from 'bn.js'

import type { PhantomProvider } from '../types/wallet'

import {
  connection,
  VAULT_STATE,
  VAULT_A,
  VAULT_B,
  STRATEGY_STATE,
  MINT_A,
  MINT_B,
  CLMM_PROGRAM,
  AMM_CONFIG,
  POOL_ID,
} from '../config/solana'

import { getProgram } from './program'
import { fetchVault } from './vault'
import { getSwapQuote } from './raydium'
import { sendTransaction } from './transactions'

const MEMO_PROGRAM = new PublicKey(
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
)

const MAX_U64 = 18446744073709551615n

// Проверяем полномочия администратора.
export async function requireAdmin(
  user: PublicKey
) {
  const vault = await fetchVault()

  if (vault.admin !== user.toBase58()) {
    throw new Error('Administrator access required')
  }

  const sol = await connection.getBalance(user)

  if (sol < 50_000_000) {
    throw new Error(
      'Administrator needs at least 0.05 SOL'
    )
  }

  return vault
}

// Обмен Token A -> Token B или Token B -> Token A.
export async function swapTokens(
  provider: PhantomProvider,
  user: PublicKey,
  amount: bigint,
  aToB: boolean,
  slippageBps = 100,
  onSubmitted?: (signature: string) => void,
  approvedMinimumOut?: bigint
): Promise<string> {
  const vault = await requireAdmin(user)

  if (vault.inMarket) {
    throw new Error(
      'Close the LP position before swapping'
    )
  }

  if (aToB && vault.needsSync) {
    throw new Error(
      'Complete reverse swap and sync the vault first'
    )
  }

  const available = aToB
    ? vault.balanceA
    : vault.balanceB

  if (
    amount <= 0n ||
    amount > available ||
    amount > MAX_U64
  ) {
    throw new Error('Insufficient vault balance')
  }

  // Проверяем ранее подтверждённый минимум.
  if (
    approvedMinimumOut !== undefined &&
    (
      approvedMinimumOut <= 0n ||
      approvedMinimumOut > MAX_U64
    )
  ) {
    throw new Error('Invalid approved minimum output')
  }

  // Получаем актуальные данные пула и tick arrays.
  const quote = await getSwapQuote(
    user,
    amount,
    aToB,
    slippageBps
  )

  const currentExpectedOut = BigInt(
    quote.expectedOut.toString()
  )

  const currentMinimumOut = BigInt(
    quote.minimumOut.toString()
  )

  // Не позволяем новой котировке уменьшить
  // ранее показанный администратору минимум.
  const protectedMinimumOut =
    approvedMinimumOut !== undefined &&
    approvedMinimumOut > currentMinimumOut
      ? approvedMinimumOut
      : currentMinimumOut

  // Если цена существенно изменилась,
  // не отправляем заведомо невыгодную транзакцию.
  if (currentExpectedOut < protectedMinimumOut) {
    throw new Error(
      'Pool price changed. Please get a new quote.'
    )
  }

  if (
    protectedMinimumOut <= 0n ||
    protectedMinimumOut > MAX_U64
  ) {
    throw new Error('Invalid protected minimum output')
  }

  console.log('[ADMIN SWAP]', {
    amountIn: amount.toString(),
    direction: aToB ? 'A -> B' : 'B -> A',
    expectedOut: currentExpectedOut.toString(),
    currentMinimumOut: currentMinimumOut.toString(),
    approvedMinimumOut:
      approvedMinimumOut?.toString(),
    protectedMinimumOut:
      protectedMinimumOut.toString(),
  })

  const program = getProgram()

  const instruction = await program.methods
    .swap(
      quote.amountIn,
      new BN(protectedMinimumOut.toString()),
      aToB
    )
    .accountsStrict({
      strategyState: STRATEGY_STATE,
      admin: user,

      vaultState: VAULT_STATE,
      vaultA: VAULT_A,
      vaultB: VAULT_B,

      mintA: MINT_A,
      mintB: MINT_B,

      clmmProgram: CLMM_PROGRAM,
      ammConfig: AMM_CONFIG,

      poolState: POOL_ID,

      poolVaultA: quote.poolVaultA,
      poolVaultB: quote.poolVaultB,

      observationState: quote.observation,

      tokenProgram: TOKEN_PROGRAM_ID,
      tokenProgram2022: TOKEN_2022_PROGRAM_ID,
      memoProgram: MEMO_PROGRAM,
    })
    .remainingAccounts(
      quote.remainingAccounts.map(pubkey => ({
        pubkey,
        isSigner: false,
        isWritable: true,
      }))
    )
    .instruction()

  return sendTransaction(
    provider,
    user,
    [
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 600_000,
      }),
      instruction,
    ],
    onSubmitted
  )
}

// Обмен всего оставшегося Token B обратно в Token A.
export async function reverseSwapAll(
  provider: PhantomProvider,
  user: PublicKey,
  slippageBps = 100,
  onSubmitted?: (signature: string) => void
): Promise<string> {
  const vault = await requireAdmin(user)

  if (vault.balanceB === 0n) {
    throw new Error('Vault has no Token B')
  }

  return swapTokens(
    provider,
    user,
    vault.balanceB,
    false,
    slippageBps,
    onSubmitted
  )
}

// Синхронизация бухгалтерского учёта Vault.
export async function syncVault(
  provider: PhantomProvider,
  user: PublicKey,
  onSubmitted?: (signature: string) => void
): Promise<string> {
  const vault = await requireAdmin(user)

  if (vault.inMarket) {
    throw new Error(
      'Close the position before syncing'
    )
  }

  if (!vault.needsSync) {
    throw new Error(
      'Vault is already synchronized'
    )
  }

  if (vault.balanceB !== 0n) {
    throw new Error(
      'Convert all Token B back to Token A first'
    )
  }

  const program = getProgram()

  const instruction = await program.methods
    .syncVault()
    .accountsStrict({
      admin: user,
      vaultState: VAULT_STATE,
      strategyState: STRATEGY_STATE,
      vaultA: VAULT_A,
      vaultB: VAULT_B,
      clmmProgram: CLMM_PROGRAM,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction()

  return sendTransaction(
    provider,
    user,
    [instruction],
    onSubmitted
  )
}
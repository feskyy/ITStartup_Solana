import { BN } from '@coral-xyz/anchor'

import {
  SystemProgram,
} from '@solana/web3.js'

import type {
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js'

import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
} from '@solana/spl-token'

import type { PhantomProvider } from '../types/wallet'

import {
  VAULT_STATE,
  VAULT_A,
  MINT_A,
  SHARE_MINT,
} from '../config/solana'

import { getProgram } from './program'
import { fetchVault } from './vault'
import { fetchUser, getUserAccounts } from './user'
import { sendTransaction } from './transactions'

import {
  estimateShares,
  estimateWithdrawal,
} from './amounts'

const U64_MAX = 18446744073709551615n

function validateAmount(amount: bigint) {
  if (amount <= 0n || amount > U64_MAX) {
    throw new Error('Invalid amount')
  }
}

export async function depositTokens(
  provider: PhantomProvider,
  user: PublicKey,
  amount: bigint,
  onSubmitted?: (signature: string) => void
): Promise<string> {
  validateAmount(amount)

  const [vault, userData] = await Promise.all([
    fetchVault(),
    fetchUser(user),
  ])

  if (vault.locked) {
    throw new Error('Vault strategy is locked')
  }

  if (vault.paused) {
    throw new Error('Vault deposits are paused')
  }

  if (amount > userData.tokenA) {
    throw new Error('Insufficient Token A balance')
  }

  const expectedShares = estimateShares(
    amount,
    vault.totalTokens,
    vault.totalShares
  )

  if (expectedShares === 0n) {
    throw new Error('Deposit amount is too small')
  }

  const program = getProgram()
  const accounts = getUserAccounts(user)

  const instructions: TransactionInstruction[] = []

  // Создаём User Card при первом депозите.
  if (!userData.hasUserCard) {
    const createCard = await program.methods
      .createUserCard()
      .accountsStrict({
        vaultState: VAULT_STATE,
        userCard: accounts.userCard,
        user,
        systemProgram: SystemProgram.programId,
      })
      .instruction()

    instructions.push(createCard)
  }

  // Создаём ATA для share-токенов.
  // Если аккаунт уже существует, ошибки не будет.
  instructions.push(
    createAssociatedTokenAccountIdempotentInstruction(
      user,
      accounts.shares,
      user,
      SHARE_MINT
    )
  )

  // Основная инструкция Deposit.
  const deposit = await program.methods
    .deposit(new BN(amount.toString()))
    .accountsStrict({
      vaultState: VAULT_STATE,
      userCard: accounts.userCard,
      vaultTokenAccount: VAULT_A,
      shareMint: SHARE_MINT,
      userTokenAccount: accounts.tokenA,
      userShareAccount: accounts.shares,
      user,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction()

  instructions.push(deposit)

  return sendTransaction(
    provider,
    user,
    instructions,
    onSubmitted
  )
}

export async function withdrawTokens(
  provider: PhantomProvider,
  user: PublicKey,
  shares: bigint,
  onSubmitted?: (signature: string) => void
): Promise<string> {
  validateAmount(shares)

  const [vault, userData] = await Promise.all([
    fetchVault(),
    fetchUser(user),
  ])

  if (vault.locked) {
    throw new Error('Vault strategy is locked')
  }

  if (!userData.hasUserCard) {
    throw new Error('User Card is not initialized')
  }

  if (shares > userData.shares) {
    throw new Error('Insufficient share balance')
  }

  const expectedTokens = estimateWithdrawal(
    shares,
    vault.totalTokens,
    vault.totalShares
  )

  if (expectedTokens === 0n) {
    throw new Error('Withdrawal amount is too small')
  }

  const program = getProgram()
  const accounts = getUserAccounts(user)

  const instructions: TransactionInstruction[] = []

  // Проверяем наличие ATA для получения Token A.
  instructions.push(
    createAssociatedTokenAccountIdempotentInstruction(
      user,
      accounts.tokenA,
      user,
      MINT_A
    )
  )

  const withdraw = await program.methods
    .withdraw(new BN(shares.toString()))
    .accountsStrict({
      vaultState: VAULT_STATE,
      userCard: accounts.userCard,
      vaultTokenAccount: VAULT_A,
      shareMint: SHARE_MINT,
      userTokenAccount: accounts.tokenA,
      userShareAccount: accounts.shares,
      user,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction()

  instructions.push(withdraw)

  return sendTransaction(
    provider,
    user,
    instructions,
    onSubmitted
  )
}
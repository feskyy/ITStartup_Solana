import {
  getAccount,
  getAssociatedTokenAddressSync,
  TokenAccountNotFoundError,
} from '@solana/spl-token'

import type { PublicKey } from '@solana/web3.js'

import {
  connection,
  MINT_A,
  MINT_B,
  SHARE_MINT,
  getUserCard,
} from '../config/solana'

export interface UserData {
  sol: bigint
  tokenA: bigint
  tokenB: bigint
  shares: bigint
  hasUserCard: boolean
}

export function getUserAccounts(user: PublicKey) {
  return {
    tokenA: getAssociatedTokenAddressSync(
      MINT_A,
      user
    ),

    tokenB: getAssociatedTokenAddressSync(
      MINT_B,
      user
    ),

    shares: getAssociatedTokenAddressSync(
      SHARE_MINT,
      user
    ),

    userCard: getUserCard(user),
  }
}

async function readTokenBalance(
  address: PublicKey
): Promise<bigint> {
  try {
    const account = await getAccount(
      connection,
      address
    )

    return account.amount
  } catch (error) {
    if (error instanceof TokenAccountNotFoundError) {
      return 0n
    }

    throw error
  }
}

export async function fetchUser(
  user: PublicKey
): Promise<UserData> {
  const accounts = getUserAccounts(user)

  const [sol, tokenA, tokenB, shares, card] =
    await Promise.all([
      connection.getBalance(user),
      readTokenBalance(accounts.tokenA),
      readTokenBalance(accounts.tokenB),
      readTokenBalance(accounts.shares),
      connection.getAccountInfo(accounts.userCard),
    ])

  return {
    sol: BigInt(sol),
    tokenA,
    tokenB,
    shares,
    hasUserCard: card !== null,
  }
}
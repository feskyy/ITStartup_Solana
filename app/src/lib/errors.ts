export function getErrorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : String(error)

  const text = message.toLowerCase()

  if (
    text.includes('user rejected') ||
    text.includes('user declined') ||
    text.includes('4001')
  ) {
    return 'Transaction was rejected in Phantom'
  }

  if (
    text.includes('strategylocked') ||
    text.includes('strategy is locked') ||
    text.includes('0x1779')
  ) {
    return 'Funds are in strategy. Try again after rebalancing.'
  }

  if (
    text.includes('vaultpaused') ||
    text.includes('deposits are paused')
  ) {
    return 'Deposits are temporarily paused'
  }

  if (text.includes('insufficientshares')) {
    return 'Insufficient share tokens'
  }

  if (text.includes('insufficient funds')) {
    return 'Insufficient balance for the transaction'
  }

  if (text.includes('shares too small')) {
    return 'Deposit amount is too small'
  }

  if (text.includes('failed to fetch')) {
    return 'Unable to connect to Solana RPC'
  }

  if (
    text.includes('block height exceeded') ||
    text.includes('blockhash not found') ||
    text.includes('expired')
  ) {
    return 'Confirmation failed or expired. Check Explorer before retrying.'
  }

  return message
}
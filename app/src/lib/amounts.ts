export const TOKEN_SCALE = 1_000_000n

const U64_MAX = 18_446_744_073_709_551_615n

export function parseAmount(input: string): bigint {
  const value = input.trim().replace(',', '.')

  if (!/^\d+(\.\d{1,6})?$/.test(value)) {
    throw new Error('Enter a valid amount (max 6 decimals)')
  }

  const [whole, fraction = ''] = value.split('.')

  const amount =
    BigInt(whole) * TOKEN_SCALE +
    BigInt(fraction.padEnd(6, '0'))

  if (amount <= 0n) {
    throw new Error('Amount must be greater than zero')
  }

  if (amount > U64_MAX) {
    throw new Error('Amount is too large')
  }

  return amount
}

export function formatUnits(
  amount: bigint,
  decimals = 6
): string {
  const scale = 10n ** BigInt(decimals)

  const whole = amount / scale
  const fraction = amount % scale

  return `${whole}.${fraction
    .toString()
    .padStart(decimals, '0')}`
}

export function estimateShares(
  amount: bigint,
  totalTokens: bigint,
  totalShares: bigint
): bigint {
  if (totalShares === 0n) {
    return amount
  }

  if (totalTokens === 0n) {
    throw new Error('Invalid vault accounting')
  }

  return (amount * totalShares) / totalTokens
}

export function estimateWithdrawal(
  shares: bigint,
  totalTokens: bigint,
  totalShares: bigint
): bigint {
  if (totalShares === 0n) {
    return 0n
  }

  return (shares * totalTokens) / totalShares
}
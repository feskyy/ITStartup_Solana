
import * as sdk from '@raydium-io/raydium-sdk-v2'

import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  ComputeBudgetProgram,
} from '@solana/web3.js'

import type { AccountMeta } from '@solana/web3.js'

import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
} from '@solana/spl-token'

import BN from 'bn.js'
import Decimal from 'decimal.js'
import { Buffer } from 'buffer'

import {
  connection,
  assertDevnet,
  CLMM_PROGRAM,
  POOL_ID,
  VAULT_STATE,
  VAULT_A,
  VAULT_B,
  STRATEGY_STATE,
} from '../config/solana'

import type { PhantomProvider } from '../types/wallet'

import { getProgram } from './program'
import { fetchVault } from './vault'
import { fetchRaydiumPool } from './raydium'
import { sendTransaction } from './transactions'

const api: any = sdk

const METADATA_PROGRAM = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
)

const MEMO_PROGRAM = new PublicKey(
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
)

const meta = (
  pubkey: PublicKey,
  isWritable = false,
  isSigner = false
): AccountMeta => ({
  pubkey,
  isWritable,
  isSigner,
})

const raw = (value: bigint | BN): BN =>
  new BN(value.toString())

const minBN = (a: BN, b: BN): BN =>
  a.lt(b) ? a : b

// Максимальная сумма с учётом slippage 1%.
const maxSlip = (amount: BN): BN =>
  amount.muln(101).addn(99).divn(100)

// Минимальная сумма с учётом slippage 1%.
const minSlip = (amount: BN): BN =>
  amount.muln(99).divn(100)

function commonAccounts(admin: PublicKey) {
  return {
    admin,
    vaultState: VAULT_STATE,
    strategyState: STRATEGY_STATE,
    vaultA: VAULT_A,
    vaultB: VAULT_B,
    clmmProgram: CLMM_PROGRAM,
    tokenProgram: TOKEN_PROGRAM_ID,
  }
}

// Проверка прав администратора.
async function assertAdmin(admin: PublicKey) {
  await assertDevnet()

  const vault = await fetchVault()

  if (vault.admin !== admin.toBase58()) {
    throw new Error('Administrator access required')
  }

  return vault
}

// Получение актуального состояния пула.
async function getPositionContext(admin: PublicKey) {
  const pool = await fetchRaydiumPool(admin)

  const info = pool.data.poolInfo

  const mint0 = pool.poolMintA
  const mint1 = pool.poolMintB

  const vault0 = pool.normalOrder
    ? VAULT_A
    : VAULT_B

  const vault1 = pool.normalOrder
    ? VAULT_B
    : VAULT_A

  const poolVault0 = new PublicKey(
    pool.data.poolKeys.vault.A
  )

  const poolVault1 = new PublicKey(
    pool.data.poolKeys.vault.B
  )

  const bitmap = api.getPdaExBitmapAccount(
    CLMM_PROGRAM,
    POOL_ID
  ).publicKey

  const bitmapInfo =
    await connection.getAccountInfo(bitmap)

  const bitmapMeta: AccountMeta[] = bitmapInfo
    ? [meta(bitmap, true)]
    : []

  const sqrtPrice = api.TickUtil.priceToSqrtPriceX64(
    new Decimal(info.price),
    info.mintA.decimals,
    info.mintB.decimals
  )

  return {
    price: pool.price,
    spacing: pool.tickSpacing,
    normalOrder: pool.normalOrder,
    mint0,
    mint1,
    vault0,
    vault1,
    poolVault0,
    poolVault1,
    bitmapMeta,
    sqrtPrice,
  }
}

type PositionContext = Awaited<
  ReturnType<typeof getPositionContext>
>

// Определение tick arrays и PDA позиции.
function getRangeAccounts(
  context: PositionContext,
  lower: number,
  upper: number
) {
  const lowerStart =
    api.TickArrayUtil.getTickArrayStartIndex(
      lower,
      context.spacing
    )

  const upperStart =
    api.TickArrayUtil.getTickArrayStartIndex(
      upper,
      context.spacing
    )

  const tickArrayLower =
    api.getPdaTickArrayAddress(
      CLMM_PROGRAM,
      POOL_ID,
      lowerStart
    ).publicKey

  const tickArrayUpper =
    api.getPdaTickArrayAddress(
      CLMM_PROGRAM,
      POOL_ID,
      upperStart
    ).publicKey

  const protocolPosition =
    api.getPdaProtocolPositionAddress(
      CLMM_PROGRAM,
      POOL_ID,
      lower,
      upper
    ).publicKey

  const sqrtLower =
    api.TickUtil.getSqrtPriceAtTick(lower)

  const sqrtUpper =
    api.TickUtil.getSqrtPriceAtTick(upper)

  return {
    lowerStart,
    upperStart,
    tickArrayLower,
    tickArrayUpper,
    protocolPosition,
    sqrtLower,
    sqrtUpper,
  }
}

export interface PositionQuote {
  price: number
  lowerPrice: number
  upperPrice: number
  tickLower: number
  tickUpper: number
  liquidity: BN
  amountA: bigint
  amountB: bigint
  maximumA: bigint
  maximumB: bigint
}

// Расчёт параметров открытия позиции.
async function calculatePosition(
  admin: PublicKey,
  lowerPrice: number,
  upperPrice: number,
  maxTokenA: bigint,
  maxTokenB: bigint
) {
  const vault = await assertAdmin(admin)

  if (vault.inMarket) {
    throw new Error('Position is already open')
  }

  if (vault.needsSync) {
    throw new Error('Vault synchronization required')
  }

  if (vault.paused) {
    throw new Error('Vault is paused')
  }

  if (vault.totalShares === 0n) {
    throw new Error('Vault has no shares')
  }

  if (
    !Number.isFinite(lowerPrice) ||
    !Number.isFinite(upperPrice) ||
    lowerPrice <= 0 ||
    upperPrice <= lowerPrice
  ) {
    throw new Error('Invalid price range')
  }

  if (
    maxTokenA <= 0n ||
    maxTokenB <= 0n ||
    maxTokenA > vault.balanceA ||
    maxTokenB > vault.balanceB
  ) {
    throw new Error('Insufficient vault token balance')
  }

  const context = await getPositionContext(admin)

  if (
    lowerPrice >= context.price ||
    upperPrice <= context.price
  ) {
    throw new Error(
      'Price range must contain the current pool price'
    )
  }

  const tickLower =
    Math.floor(
      Math.log(lowerPrice) /
      Math.log(1.0001) /
      context.spacing
    ) * context.spacing

  const tickUpper =
    Math.ceil(
      Math.log(upperPrice) /
      Math.log(1.0001) /
      context.spacing
    ) * context.spacing

  if (
    tickLower < -443636 ||
    tickUpper > 443636 ||
    tickLower >= tickUpper
  ) {
    throw new Error('Invalid Raydium tick range')
  }

  const range = getRangeAccounts(
    context,
    tickLower,
    tickUpper
  )

  const balance0 = raw(
    (await getAccount(connection, context.vault0)).amount
  )

  const balance1 = raw(
    (await getAccount(connection, context.vault1)).amount
  )

  const cap0 = raw(
    context.normalOrder ? maxTokenA : maxTokenB
  )

  const cap1 = raw(
    context.normalOrder ? maxTokenB : maxTokenA
  )

  const available0 = minBN(cap0, balance0)
  const available1 = minBN(cap1, balance1)

  // Оставляем запас 2% для расчёта ликвидности.
  const liquidity =
    api.LiquidityMathUtil.getLiquidityFromAmounts(
      context.sqrtPrice,
      range.sqrtLower,
      range.sqrtUpper,
      available0.muln(98).divn(100),
      available1.muln(98).divn(100)
    )

  const amounts =
    api.LiquidityMathUtil.getAmountsForLiquidity(
      context.sqrtPrice,
      range.sqrtLower,
      range.sqrtUpper,
      liquidity,
      true
    )

  const max0 = maxSlip(amounts.amountA)
  const max1 = maxSlip(amounts.amountB)

  if (
    liquidity.isZero() ||
    max0.isZero() ||
    max1.isZero() ||
    max0.gt(available0) ||
    max1.gt(available1)
  ) {
    throw new Error(
      'Insufficient tokens or invalid liquidity range'
    )
  }

  const quote: PositionQuote = {
    price: context.price,

    lowerPrice: Math.pow(1.0001, tickLower),
    upperPrice: Math.pow(1.0001, tickUpper),

    tickLower,
    tickUpper,
    liquidity,

    amountA: BigInt(
      (
        context.normalOrder
          ? amounts.amountA
          : amounts.amountB
      ).toString()
    ),

    amountB: BigInt(
      (
        context.normalOrder
          ? amounts.amountB
          : amounts.amountA
      ).toString()
    ),

    maximumA: BigInt(
      (context.normalOrder ? max0 : max1).toString()
    ),

    maximumB: BigInt(
      (context.normalOrder ? max1 : max0).toString()
    ),
  }

  return {
    context,
    range,
    quote,
    max0,
    max1,
  }
}

// Получение котировки без транзакции.
export async function getPositionQuote(
  admin: PublicKey,
  lowerPrice: number,
  upperPrice: number,
  maxTokenA: bigint,
  maxTokenB: bigint
): Promise<PositionQuote> {
  const result = await calculatePosition(
    admin,
    lowerPrice,
    upperPrice,
    maxTokenA,
    maxTokenB
  )

  return result.quote
}

// OPEN POSITION
export async function openPosition(
  provider: PhantomProvider,
  admin: PublicKey,
  lowerPrice: number,
  upperPrice: number,
  maxTokenA: bigint,
  maxTokenB: bigint,
  onSubmitted?: (signature: string) => void
): Promise<string> {
  const {
    context,
    range,
    quote,
    max0,
    max1,
  } = await calculatePosition(
    admin,
    lowerPrice,
    upperPrice,
    maxTokenA,
    maxTokenB
  )

  const program = getProgram()

  // Временный ключ NFT Mint.
  const nft = Keypair.generate()

  // NFT будет принадлежать Vault PDA.
  const nftAta = getAssociatedTokenAddressSync(
    nft.publicKey,
    VAULT_STATE,
    true
  )

  const personalPosition =
    api.getPdaPersonalPositionAddress(
      CLMM_PROGRAM,
      nft.publicKey
    ).publicKey

  const metadataAccount =
    PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        METADATA_PROGRAM.toBuffer(),
        nft.publicKey.toBuffer(),
      ],
      METADATA_PROGRAM
    )[0]

  // Порядок аккаунтов соответствует Week 13.
  const remainingAccounts: AccountMeta[] = [
    meta(admin, true, true),
    meta(VAULT_STATE),
    meta(nft.publicKey, true, true),
    meta(nftAta, true),
    meta(metadataAccount, true),
    meta(POOL_ID, true),
    meta(range.protocolPosition),
    meta(range.tickArrayLower, true),
    meta(range.tickArrayUpper, true),
    meta(personalPosition, true),
    meta(context.vault0, true),
    meta(context.vault1, true),
    meta(context.poolVault0, true),
    meta(context.poolVault1, true),
    meta(SYSVAR_RENT_PUBKEY),
    meta(SystemProgram.programId),
    meta(TOKEN_PROGRAM_ID),
    meta(ASSOCIATED_TOKEN_PROGRAM_ID),
    meta(METADATA_PROGRAM),
    meta(TOKEN_2022_PROGRAM_ID),
    meta(context.mint0),
    meta(context.mint1),
    ...context.bitmapMeta,
  ]

  const instruction = await program.methods
    .openPosition({
      tickLower: quote.tickLower,
      tickUpper: quote.tickUpper,
      tickArrayLowerStart: range.lowerStart,
      tickArrayUpperStart: range.upperStart,
      liquidity: quote.liquidity,
      amountMaxA: max0,
      amountMaxB: max1,
    })
    .accountsStrict(commonAccounts(admin))
    .remainingAccounts(remainingAccounts)
    .instruction()

  console.log('[OPEN POSITION]', {
    nft: nft.publicKey.toBase58(),
    personalPosition: personalPosition.toBase58(),
    tickLower: quote.tickLower,
    tickUpper: quote.tickUpper,
    liquidity: quote.liquidity.toString(),
    max0: max0.toString(),
    max1: max1.toString(),
  })

  const signature = await sendTransaction(
    provider,
    admin,
    [
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 1000000,
      }),
      instruction,
    ],
    onSubmitted,
    [nft]
  )

  // Проверяем NFT после подтверждения.
  // Ошибка чтения RPC не отменяет успешную транзакцию.
  try {
    const account = await getAccount(
      connection,
      nftAta
    )

    if (
      !account.owner.equals(VAULT_STATE) ||
      account.amount !== 1n
    ) {
      console.error('[NFT] Ownership verification failed')
    } else {
      console.log('[NFT VERIFIED]', {
        owner: account.owner.toBase58(),
        amount: account.amount.toString(),
      })
    }
  } catch (error) {
    console.warn('[NFT VERIFICATION]', error)
  }

  return signature
}

// Подготовка аккаунтов существующей позиции.
async function getExistingPosition(
  admin: PublicKey,
  closing: boolean
) {
  const vault = await assertAdmin(admin)

  if (!vault.inMarket) {
    throw new Error('No open position')
  }

  const program = getProgram()

  const state =
    await program.account.strategyState.fetch(
      STRATEGY_STATE
    )

  if (!state.inMarket) {
    throw new Error('Position is not open')
  }

  const context = await getPositionContext(admin)

  const range = getRangeAccounts(
    context,
    state.tickLower,
    state.tickUpper
  )

  const nft = new PublicKey(
    state.positionNftMint
  )

  const personal = new PublicKey(
    state.personalPosition
  )

  const nftAta = getAssociatedTokenAddressSync(
    nft,
    VAULT_STATE,
    true
  )

  const nftAccount = await getAccount(
    connection,
    nftAta
  )

  if (
    !nftAccount.owner.equals(VAULT_STATE) ||
    nftAccount.amount !== 1n
  ) {
    throw new Error('Invalid position NFT ownership')
  }

  const positionAccount =
    await connection.getAccountInfo(personal)

  if (
    !positionAccount ||
    !positionAccount.owner.equals(CLMM_PROGRAM)
  ) {
    throw new Error('Missing Raydium position')
  }

  const decoded =
    api.PersonalPositionLayout.decode(
      positionAccount.data
    )

  const liquidity = new BN(
    decoded.liquidity.toString()
  )

  const remainingAccounts: AccountMeta[] = [
    meta(VAULT_STATE),
    meta(nftAta, closing),
    meta(personal, true),
    meta(POOL_ID, true),
    meta(range.protocolPosition),
    meta(context.poolVault0, true),
    meta(context.poolVault1, true),
    meta(range.tickArrayLower, true),
    meta(range.tickArrayUpper, true),
    meta(context.vault0, true),
    meta(context.vault1, true),
    meta(TOKEN_PROGRAM_ID),
    meta(TOKEN_2022_PROGRAM_ID),
    meta(MEMO_PROGRAM),
    meta(context.mint0),
    meta(context.mint1),
    ...context.bitmapMeta,
  ]

  return {
    program,
    context,
    range,
    nft,
    liquidity,
    remainingAccounts,
  }
}

// COLLECT FEES
export async function collectFees(
  provider: PhantomProvider,
  admin: PublicKey,
  onSubmitted?: (signature: string) => void
): Promise<string> {
  const {
    program,
    remainingAccounts,
  } = await getExistingPosition(admin, false)

  const instruction = await program.methods
    .collectFees()
    .accountsStrict(commonAccounts(admin))
    .remainingAccounts(remainingAccounts)
    .instruction()

  return sendTransaction(
    provider,
    admin,
    [
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 1000000,
      }),
      instruction,
    ],
    onSubmitted
  )
}

// CLOSE POSITION
export async function closePosition(
  provider: PhantomProvider,
  admin: PublicKey,
  onSubmitted?: (signature: string) => void
): Promise<string> {
  const {
    program,
    context,
    range,
    nft,
    liquidity,
    remainingAccounts,
  } = await getExistingPosition(admin, true)

  if (liquidity.isZero()) {
    throw new Error('Position has no liquidity')
  }

  const amounts =
    api.LiquidityMathUtil.getAmountsForLiquidity(
      context.sqrtPrice,
      range.sqrtLower,
      range.sqrtUpper,
      liquidity,
      false
    )

  const min0 = minSlip(amounts.amountA)
  const min1 = minSlip(amounts.amountB)

  if (min0.isZero() && min1.isZero()) {
    throw new Error('Invalid minimum withdrawal amounts')
  }

  const instruction = await program.methods
    .closePosition(min0, min1)
    .accountsStrict(commonAccounts(admin))
    .remainingAccounts([
      ...remainingAccounts,
      meta(nft, true),
      meta(SystemProgram.programId),
    ])
    .instruction()

  console.log('[CLOSE POSITION]', {
    liquidity: liquidity.toString(),
    minimum0: min0.toString(),
    minimum1: min1.toString(),
  })

  return sendTransaction(
    provider,
    admin,
    [
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 1000000,
      }),
      instruction,
    ],
    onSubmitted
  )
}

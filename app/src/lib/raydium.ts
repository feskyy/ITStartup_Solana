import * as sdk from '@raydium-io/raydium-sdk-v2'

import { PublicKey } from '@solana/web3.js'
import BN from 'bn.js'

import {
  connection,
  assertDevnet,
  CLMM_PROGRAM,
  POOL_ID,
  MINT_A,
  MINT_B,
} from '../config/solana'

import addresses from '../config/week11-addresses.json'

const api: any = sdk

const pk = (value: any) => new PublicKey(value)

let raydium: sdk.Raydium | undefined
let currentOwner: string | undefined

// Подключение SDK без загрузки приватного ключа.
export async function initRaydium(
  owner: PublicKey
): Promise<sdk.Raydium> {
  await assertDevnet()

  const ownerAddress = owner.toBase58()

  if (raydium && currentOwner === ownerAddress) {
    return raydium
  }

  raydium = await sdk.Raydium.load({
    owner: owner as unknown as NonNullable<
      Parameters<typeof sdk.Raydium.load>[0]['owner']
    >,

    connection: connection as unknown as
      Parameters<typeof sdk.Raydium.load>[0]['connection'],

    cluster: 'devnet',
    disableFeatureCheck: true,
    disableLoadToken: true,
    blockhashCommitment: 'finalized',
  })

  currentOwner = ownerAddress

  return raydium
}

// Получение актуальных данных существующего CLMM-пула.
export async function fetchRaydiumPool(
  owner: PublicKey
) {
  const ray = await initRaydium(owner)

  const data = await ray.clmm.getPoolInfoFromRpc(
    POOL_ID.toBase58()
  )

  const poolMintA = pk(data.poolInfo.mintA.address)
  const poolMintB = pk(data.poolInfo.mintB.address)

  const normalOrder = poolMintA.equals(MINT_A)

  if (
    !poolMintA.equals(normalOrder ? MINT_A : MINT_B) ||
    !poolMintB.equals(normalOrder ? MINT_B : MINT_A)
  ) {
    throw new Error('Pool mint mismatch')
  }

  const price = Number(data.poolInfo.price)

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('Invalid pool price')
  }

  return {
    ray,
    data,
    price,
    poolMintA,
    poolMintB,
    normalOrder,

    poolVaultA: pk(
      data.poolKeys.vault[normalOrder ? 'A' : 'B']
    ),

    poolVaultB: pk(
      data.poolKeys.vault[normalOrder ? 'B' : 'A']
    ),

    tickSpacing: Number(addresses.feeTier.tickSpacing),
  }
}

export interface SwapQuote {
  amountIn: BN
  expectedOut: BN
  minimumOut: BN

  aToB: boolean
  price: number

  poolVaultA: PublicKey
  poolVaultB: PublicKey

  observation: PublicKey
  remainingAccounts: PublicKey[]
}

// Преобразование результата SDK в целое число.
function raw(value: any): BN {
  return new BN(
    (
      value?.amount?.raw ??
      value?.raw ??
      value?.amount ??
      value
    ).toString()
  )
}

// Расчёт обмена без отправки транзакции.
export async function getSwapQuote(
  owner: PublicKey,
  amountIn: bigint,
  aToB: boolean,
  slippageBps = 100
): Promise<SwapQuote> {
  if (
    amountIn <= 0n ||
    amountIn > 18446744073709551615n
  ) {
    throw new Error('Invalid swap amount')
  }

  if (
    !Number.isInteger(slippageBps) ||
    slippageBps < 1 ||
    slippageBps > 500
  ) {
    throw new Error('Slippage must be between 0.01% and 5%')
  }

  const pool = await fetchRaydiumPool(owner)

  const { ray, data } = pool

  const inputMint = aToB ? MINT_A : MINT_B

  const zeroForOne =
    pool.poolMintA.equals(inputMint)

  const input = new BN(amountIn.toString())

  let expectedOut: BN
  let remainingAccounts: PublicKey[]
  let observation: PublicKey

  // Основной способ расчёта из Week 12.
  if (
    typeof (ray.clmm as any).getSwapPoolInfo === 'function' &&
    typeof api.swapInternal === 'function'
  ) {
    const quote = await (
      ray.clmm as any
    ).getSwapPoolInfo(
      POOL_ID.toBase58(),
      zeroForOne
    )

    const bitmap = api.getPdaExBitmapAccount(
      CLMM_PROGRAM,
      POOL_ID
    ).publicKey

    const bitmapInfo =
      await connection.getAccountInfo(bitmap)

    if (!bitmapInfo) {
      throw new Error('Missing CLMM bitmap extension')
    }

    const result = api.swapInternal({
      programId: CLMM_PROGRAM,
      poolId: POOL_ID,

      poolInfo: quote.rpcData,
      tickArrays: quote.tickArrays,
      configInfo: quote.configInfo,

      tickarrayBitmapExtension:
        api.TickArrayBitmapExtensionLayout.decode(
          bitmapInfo.data
        ),

      amountSpecified: input,
      sqrtPriceLimitX64: new BN(0),

      zeroForOne,
      isBaseInput: true,

      blockTimestamp: Math.floor(Date.now() / 1000),

      includeExtraTickArrays: true,
    })

    expectedOut = raw(result.amountCalculated).abs()

    remainingAccounts = result.accounts.map(pk)

    observation = pk(quote.rpcData.observationId)
  } else {
    // Альтернативный способ расчёта из Week 12.
    const computePool = data.computePoolInfo

    const quote =
      await api.PoolUtils.computeAmountOutFormat({
        poolInfo: computePool,

        tickarrayBitmapExtension:
          computePool.exBitmapInfo,

        tickArrayCache:
          data.tickData[POOL_ID.toBase58()],

        amountIn: input,

        tokenOut: zeroForOne
          ? data.poolInfo.mintB
          : data.poolInfo.mintA,

        slippage: slippageBps / 10000,

        epochInfo: await ray.fetchEpochInfo(),

        blockTimestamp: Math.floor(Date.now() / 1000),
      })

    expectedOut = raw(quote.amountOut)

    remainingAccounts =
      quote.remainingAccounts.map(pk)

    observation = pk(computePool.observationId)
  }

  // Минимальное количество токенов с учётом slippage.
  const minimumOut = expectedOut
    .muln(10000 - slippageBps)
    .divn(10000)

  if (
    expectedOut.isZero() ||
    expectedOut.isNeg() ||
    minimumOut.isZero()
  ) {
    throw new Error('Invalid swap output')
  }

  return {
    amountIn: input,
    expectedOut,
    minimumOut,

    aToB,
    price: pool.price,

    poolVaultA: pool.poolVaultA,
    poolVaultB: pool.poolVaultB,

    observation,
    remainingAccounts,
  }
}
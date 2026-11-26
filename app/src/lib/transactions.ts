import {
  Transaction,
  VersionedTransaction,
  ComputeBudgetProgram,
} from '@solana/web3.js'

import type {
  Keypair,
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js'

import type { PhantomProvider } from '../types/wallet'

import {
  connection,
  assertDevnet,
} from '../config/solana'

// Приоритетная комиссия для Devnet.
const COMPUTE_UNIT_PRICE = 1000

// Проверяем, задана ли стоимость Compute Unit.
function hasComputeUnitPrice(
  instructions: TransactionInstruction[]
): boolean {
  return instructions.some(
    instruction =>
      instruction.programId.equals(
        ComputeBudgetProgram.programId
      ) &&
      instruction.data[0] === 3
  )
}

// Диагностика инструкций транзакции.
// Приватные ключи и подписи не выводятся.
function describeInstructions(
  instructions: TransactionInstruction[]
) {
  return instructions.map((instruction, index) => ({
    index,
    programId: instruction.programId.toBase58(),
    data: instruction.data.toString('hex'),
    accounts: instruction.keys.map(key => ({
      publicKey: key.pubkey.toBase58(),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
  }))
}

export async function sendTransaction(
  provider: PhantomProvider,
  user: PublicKey,
  instructions: TransactionInstruction[],
  onSubmitted?: (signature: string) => void,
  additionalSigners: Keypair[] = []
): Promise<string> {
  try {
    console.log('[TX 1] Checking Devnet')

    await assertDevnet()

    if (!provider.isConnected || !provider.publicKey) {
      throw new Error('Connect Phantom first')
    }

    if (!provider.publicKey.equals(user)) {
      throw new Error('Wallet account has changed')
    }

    if (instructions.length === 0) {
      throw new Error('Transaction has no instructions')
    }

    console.log('[TX 2] Wallet verified')

    const latest =
      await connection.getLatestBlockhashAndContext(
        'finalized'
      )

    const {
      blockhash,
      lastValidBlockHeight,
    } = latest.value

    console.log('[TX 3] Blockhash received:', blockhash)
    console.log('RPC slot:', latest.context.slot)
    console.log('Last valid height:', lastValidBlockHeight)

    // Создаём отдельный массив инструкций,
    // чтобы не изменять исходный массив.
    const preparedInstructions = [...instructions]

    // Явно задаём приоритетную комиссию.
    // Если она уже задана, повторно не добавляем.
    if (!hasComputeUnitPrice(preparedInstructions)) {
      preparedInstructions.unshift(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: COMPUTE_UNIT_PRICE,
        })
      )

      console.log(
        '[TX BUDGET] Compute unit price:',
        COMPUTE_UNIT_PRICE
      )
    }

    const transaction = new Transaction({
      feePayer: user,
      blockhash,
      lastValidBlockHeight,
    })

    transaction.add(...preparedInstructions)

    console.log(
      '[TX 4] Instructions:',
      preparedInstructions.length
    )

    // Дополнительные подписи, например NFT Mint.
    if (additionalSigners.length > 0) {
      transaction.partialSign(...additionalSigners)

      console.log(
        '[TX EXTRA] Additional signers:',
        additionalSigners.map(
          signer => signer.publicKey.toBase58()
        )
      )
    }

    // Сохраняем исходное сообщение и инструкции
    // до передачи транзакции в Phantom.
    const originalMessage =
      transaction.serializeMessage()

    const originalInstructions =
      describeInstructions(transaction.instructions)

    // Симуляция того же сообщения без проверки подписей.
    // VersionedTransaction поддерживает и legacy Message.
    const simulationTransaction = new VersionedTransaction(
      transaction.compileMessage()
    )

    console.log('[TX SIM] Simulating before Phantom')

    const simulation = await connection.simulateTransaction(
      simulationTransaction,
      {
        sigVerify: false,
        replaceRecentBlockhash: false,
        commitment: 'finalized',
        minContextSlot: latest.context.slot,
      }
    )

    console.log('[TX SIM] Error:', simulation.value.err)
    console.log('[TX SIM] Units:', simulation.value.unitsConsumed)
    console.log('[TX SIM] Logs:', simulation.value.logs?.join('\n'))

    if (simulation.value.err) {
      throw new Error(
        `Simulation failed: ${JSON.stringify(simulation.value.err)}`
      )
    }

    console.log('[TX SIM] Success')
    console.log('[TX 5] Waiting for Phantom signature')

    let timer: ReturnType<typeof setTimeout> | undefined
    const signed = await Promise.race([
      provider.signTransaction(transaction),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(
            'Phantom signature timeout. Cancel the pending wallet request before retrying.'
          ))
        }, 60_000)
      }),
    ]).finally(() => {
      if (timer !== undefined) clearTimeout(timer)
    })

    console.log(
      '[TX 6] Phantom returned transaction'
    )

    // Проверяем плательщика комиссии.
    if (!signed.feePayer?.equals(user)) {
      throw new Error(
        'Transaction fee payer was changed'
      )
    }

    // Проверяем Blockhash.
    if (signed.recentBlockhash !== blockhash) {
      throw new Error(
        'Transaction blockhash was changed'
      )
    }

    // Не разрешаем незапланированное изменение
    // сообщения транзакции.
    if (
      !signed.serializeMessage().equals(originalMessage)
    ) {
      console.error(
        '[TX ORIGINAL INSTRUCTIONS]',
        originalInstructions
      )

      console.error(
        '[TX RETURNED INSTRUCTIONS]',
        describeInstructions(signed.instructions)
      )

      console.error(
        '[TX ORIGINAL MESSAGE]',
        originalMessage.toString('hex')
      )

      console.error(
        '[TX RETURNED MESSAGE]',
        signed.serializeMessage().toString('hex')
      )

      throw new Error(
        'Transaction message was changed by wallet'
      )
    }

    // Восстанавливаем дополнительные подписи,
    // только если сообщение осталось неизменным.
    if (additionalSigners.length > 0) {
      signed.partialSign(...additionalSigners)
    }

    // Проверяем все необходимые подписи.
    if (!signed.verifySignatures()) {
      throw new Error(
        'Transaction signature is invalid'
      )
    }

    console.log('[TX 7] All signatures verified')

    const validity =
      await connection.isBlockhashValid(
        blockhash,
        {
          commitment: 'finalized',
          minContextSlot: latest.context.slot,
        }
      )

    console.log(
      'Blockhash valid:',
      validity.value
    )

    if (!validity.value) {
      throw new Error(
        'Blockhash expired. Please sign a new transaction.'
      )
    }

    console.log(
      '[TX 8] Sending transaction to RPC'
    )

    const signature =
      await connection.sendRawTransaction(
        signed.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: 'finalized',
          minContextSlot: latest.context.slot,
          maxRetries: 3,
        }
      )

    console.log('[TX 9] Transaction submitted')
    console.log('Signature:', signature)

    onSubmitted?.(signature)

    console.log(
      '[TX 10] Waiting for confirmation'
    )

    const confirmation =
      await connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        'confirmed'
      )

    console.log(
      '[TX 11] Confirmation:',
      confirmation
    )

    if (confirmation.value.err) {
      throw new Error(
        `Transaction failed: ${JSON.stringify(
          confirmation.value.err
        )}`
      )
    }

    console.log(
      '[TX 12] Transaction successful'
    )

    return signature

  } catch (error) {
    console.error('[TX ERROR]', error)
    throw error
  }
}

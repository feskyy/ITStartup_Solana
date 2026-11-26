import { useState } from 'react'
import { ArrowLeftRight, RefreshCw } from 'lucide-react'

import type { PublicKey } from '@solana/web3.js'
import type { PhantomProvider } from '../types/wallet'
import type { VaultData } from '../lib/vault'

import {
  swapTokens,
  reverseSwapAll,
  syncVault,
} from '../lib/adminActions'

import { getSwapQuote } from '../lib/raydium'
import { parseAmount } from '../lib/amounts'
import { formatAmount } from '../lib/vault'
import { explorerTx } from '../config/solana'
import { getErrorMessage } from '../lib/errors'

interface Props {
  provider: PhantomProvider
  publicKey: PublicKey
  vault: VaultData
  onSuccess: () => Promise<void>
}

type Phase =
  | 'idle'
  | 'quoting'
  | 'signing'
  | 'confirming'
  | 'success'
  | 'error'

interface QuotePreview {
  amountIn: bigint
  expected: bigint
  minimum: bigint
  price: number
  aToB: boolean
  slippageBps: number
}

export default function AdminSwap({
  provider,
  publicKey,
  vault,
  onSuccess,
}: Props) {
  const [aToB, setAToB] = useState(true)
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState(100)

  const [quote, setQuote] =
    useState<QuotePreview | null>(null)

  const [phase, setPhase] =
    useState<Phase>('idle')

  const [signature, setSignature] = useState('')
  const [error, setError] = useState('')

  const busy =
    phase === 'quoting' ||
    phase === 'signing' ||
    phase === 'confirming'

  const available = aToB
    ? vault.balanceA
    : vault.balanceB

  const inputToken = aToB
    ? 'Token A'
    : 'Token B'

  const outputToken = aToB
    ? 'Token B'
    : 'Token A'

  const swapBlocked =
    vault.inMarket ||
    (aToB && vault.needsSync)

  function readAmount(): bigint {
    const value = parseAmount(amount)

    if (
      value === null ||
      value <= 0n ||
      value > available
    ) {
      throw new Error('Invalid swap amount')
    }

    return value
  }

  function clearQuote() {
    setQuote(null)
  }

  function handleSubmitted(sig: string) {
    setSignature(sig)
    setPhase('confirming')
  }

  // Получение котировки без транзакции.
  async function preview() {
    if (busy || swapBlocked) return

    setError('')
    setQuote(null)
    setSignature('')
    setPhase('quoting')

    try {
      const value = readAmount()

      const result = await getSwapQuote(
        publicKey,
        value,
        aToB,
        slippage
      )

      setQuote({
        amountIn: value,

        expected: BigInt(
          result.expectedOut.toString()
        ),

        minimum: BigInt(
          result.minimumOut.toString()
        ),

        price: result.price,

        aToB,
        slippageBps: slippage,
      })

      setPhase('idle')
    } catch (err) {
      setError(getErrorMessage(err))
      setPhase('error')
    }
  }

  // Выполнение административной операции.
  async function execute(
    action: 'swap' | 'reverse' | 'sync'
  ) {
    if (busy) return

    setError('')
    setSignature('')
    setPhase('signing')

    try {
      let sig: string

      if (action === 'swap') {
        if (swapBlocked) {
          throw new Error('Swap is currently blocked')
        }

        if (!quote) {
          throw new Error('Get a quote first')
        }

        const value = readAmount()

        console.log('[SWAP VALIDATION]', {
          quotedAmount: quote.amountIn.toString(),
          currentAmount: value.toString(),
          quotedAmountType: typeof quote.amountIn,
          currentAmountType: typeof value,
          quotedDirection: quote.aToB,
          currentDirection: aToB,
          quotedSlippage: quote.slippageBps,
          currentSlippage: slippage,
          quotedSlippageType: typeof quote.slippageBps,
          currentSlippageType: typeof slippage,
          amountMatches: quote.amountIn === value,
          directionMatches: quote.aToB === aToB,
          slippageMatches: quote.slippageBps === slippage,
        })

        // совпадают с полученной котировкой.
        if (
          quote.amountIn !== value ||
          quote.aToB !== aToB ||
          quote.slippageBps !== slippage
        ) {
          throw new Error(
            'Swap parameters changed. Get a new quote.'
          )
        }

        sig = await swapTokens(
          provider,
          publicKey,
          value,
          aToB,
          slippage,
          handleSubmitted,
          quote.minimum
        )
      } else if (action === 'reverse') {
        sig = await reverseSwapAll(
          provider,
          publicKey,
          slippage,
          handleSubmitted
        )
      } else {
        sig = await syncVault(
          provider,
          publicKey,
          handleSubmitted
        )
      }

      setSignature(sig)
      setPhase('success')
      setAmount('')
      setQuote(null)

    } catch (err) {
      setError(getErrorMessage(err))
      setPhase('error')
      setQuote(null)
      return
    }

    // Обновление данных после транзакции.
    try {
      await onSuccess()
    } catch (err) {
      console.error('Refresh failed:', err)
    }
  }

  return (
    <section className="panel admin-panel">
      <div className="admin-heading">
        <ArrowLeftRight size={22} />

        <div>
          <h2>Swap Tokens</h2>
          <p>Raydium CLMM</p>
        </div>
      </div>

      {vault.inMarket && (
        <p className="admin-warning">
          Close the LP position before swapping.
        </p>
      )}

      {vault.needsSync && (
        <p className="admin-warning">
          Reverse swap and synchronization required.
        </p>
      )}

      <fieldset
        className="admin-fieldset"
        disabled={busy}
      >
        <div className="admin-direction">
          <button
            type="button"
            className={
              aToB
                ? 'admin-direction-active'
                : 'admin-direction-inactive'
            }
            onClick={() => {
              setAToB(true)
              setAmount('')
              clearQuote()
            }}
          >
            Token A → Token B
          </button>

          <button
            type="button"
            className={
              !aToB
                ? 'admin-direction-active'
                : 'admin-direction-inactive'
            }
            onClick={() => {
              setAToB(false)
              setAmount('')
              clearQuote()
            }}
          >
            Token B → Token A
          </button>
        </div>

        <div className="admin-label">
          <span>Amount to swap</span>

          <span>
            Available: {formatAmount(available)}
          </span>
        </div>

        <div className="admin-input-row">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={event => {
              setAmount(event.target.value)
              clearQuote()
            }}
          />

          <span>{inputToken}</span>

          <button
            type="button"
            onClick={() => {
              setAmount(formatAmount(available))
              clearQuote()
            }}
          >
            MAX
          </button>
        </div>

        <label className="admin-label">
          Slippage tolerance
        </label>

        <select
          className="admin-select"
          value={slippage}
          onChange={event => {
            setSlippage(Number(event.target.value))
            clearQuote()
          }}
        >
          <option value={50}>0.5%</option>
          <option value={100}>1%</option>
          <option value={200}>2%</option>
          <option value={500}>5%</option>
        </select>

        {quote && (
          <div className="admin-quote">
            <div>
              <span>Expected receive</span>

              <strong>
                {formatAmount(quote.expected)}
                {' '}{outputToken}
              </strong>
            </div>

            <div>
              <span>Minimum receive</span>

              <strong>
                {formatAmount(quote.minimum)}
                {' '}{outputToken}
              </strong>
            </div>

            <div>
              <span>Pool price</span>

              <strong>
                {quote.price.toFixed(8)}
              </strong>
            </div>

            <p className="admin-description">
              Slippage protection is enabled.
              The transaction cannot receive less
              than the displayed minimum.
            </p>
          </div>
        )}

        <div className="admin-buttons">
          <button
            type="button"
            className="admin-secondary"
            disabled={
              busy ||
              swapBlocked ||
              !amount
            }
            onClick={() => void preview()}
          >
            Get Quote
          </button>

          <button
            type="button"
            disabled={
              busy ||
              swapBlocked ||
              !quote
            }
            onClick={() => void execute('swap')}
          >
            Execute Swap
          </button>
        </div>

        <div className="admin-divider" />

        <h3>Strategy Recovery</h3>

        <p className="admin-description">
          Return all Token B to Token A before
          synchronizing the vault.
        </p>

        <button
          type="button"
          className="admin-secondary admin-full"
          disabled={
            busy ||
            vault.inMarket ||
            vault.balanceB === 0n
          }
          onClick={() => void execute('reverse')}
        >
          Reverse Swap All
        </button>

        <button
          type="button"
          className="admin-full"
          disabled={
            busy ||
            vault.inMarket ||
            !vault.needsSync ||
            vault.balanceB !== 0n
          }
          onClick={() => void execute('sync')}
        >
          <RefreshCw size={16} />
          Sync Vault
        </button>
      </fieldset>

      {phase === 'quoting' && (
        <p className="admin-description">
          Calculating Raydium quote...
        </p>
      )}

      {phase === 'signing' && (
        <p className="admin-description">
          Preparing transaction. Confirm in Phantom.
        </p>
      )}

      {phase === 'confirming' && (
        <p className="admin-description">
          Waiting for Solana confirmation...
        </p>
      )}

      {(phase === 'success' || phase === 'error') && (
        <div
          className={
            phase === 'success'
              ? 'admin-success'
              : 'admin-error'
          }
        >
          <p>
            {phase === 'success'
              ? 'Transaction confirmed successfully!'
              : error}
          </p>
        </div>
      )}

      {signature && (
        <a
          className="admin-explorer"
          href={explorerTx(signature)}
          target="_blank"
          rel="noreferrer"
        >
          View transaction on Solana Explorer ↗
        </a>
      )}
    </section>
  )
}
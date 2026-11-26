
import { useState } from 'react'

import {
  Layers,
  Plus,
  Coins,
  XCircle,
} from 'lucide-react'

import { PublicKey } from '@solana/web3.js'
import type { PhantomProvider } from '../types/wallet'
import type { VaultData } from '../lib/vault'

import {
  getPositionQuote,
  openPosition,
  collectFees,
  closePosition,
} from '../lib/positionActions'

import type {
  PositionQuote,
} from '../lib/positionActions'

import { parseAmount } from '../lib/amounts'
import { formatAmount } from '../lib/vault'
import { getErrorMessage } from '../lib/errors'

import {
  explorerTx,
  explorerAddress,
} from '../config/solana'

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

type Action =
  | 'open'
  | 'collect'
  | 'close'

interface PositionPreview {
  quote: PositionQuote
  lower: number
  upper: number
  maxA: bigint
  maxB: bigint
}

export default function AdminPosition({
  provider,
  publicKey,
  vault,
  onSuccess,
}: Props) {
  const [lowerPrice, setLowerPrice] =
    useState('0.90')

  const [upperPrice, setUpperPrice] =
    useState('1.10')

  const [amountA, setAmountA] = useState('')
  const [amountB, setAmountB] = useState('')

  const [preview, setPreview] =
    useState<PositionPreview | null>(null)

  const [phase, setPhase] =
    useState<Phase>('idle')

  const [action, setAction] =
    useState<Action | null>(null)

  const [signature, setSignature] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const busy =
    phase === 'quoting' ||
    phase === 'signing' ||
    phase === 'confirming'

  const openBlocked =
    vault.inMarket ||
    vault.needsSync ||
    vault.paused ||
    vault.totalShares === 0n ||
    vault.balanceA === 0n ||
    vault.balanceB === 0n

  function clearPreview() {
    setPreview(null)
  }

  function readParameters() {
    const lower = Number(
      lowerPrice.trim().replace(',', '.')
    )

    const upper = Number(
      upperPrice.trim().replace(',', '.')
    )

    const maxA = parseAmount(amountA)
    const maxB = parseAmount(amountB)

    if (
      !Number.isFinite(lower) ||
      !Number.isFinite(upper) ||
      lower <= 0 ||
      upper <= lower
    ) {
      throw new Error('Invalid price range')
    }

    if (
      maxA === null ||
      maxB === null ||
      maxA <= 0n ||
      maxB <= 0n
    ) {
      throw new Error('Enter valid token amounts')
    }

    if (
      maxA > vault.balanceA ||
      maxB > vault.balanceB
    ) {
      throw new Error('Insufficient vault balance')
    }

    return {
      lower,
      upper,
      maxA,
      maxB,
    }
  }

  function handleSubmitted(sig: string) {
    setSignature(sig)
    setPhase('confirming')
  }

  async function calculate() {
    if (busy || openBlocked) return

    setError('')
    setSuccess('')
    setSignature('')
    setPreview(null)
    setPhase('quoting')

    try {
      const params = readParameters()

      const quote = await getPositionQuote(
        publicKey,
        params.lower,
        params.upper,
        params.maxA,
        params.maxB
      )

      setPreview({
        quote,
        ...params,
      })

      console.log('[POSITION QUOTE]', {
        lowerPrice: quote.lowerPrice,
        upperPrice: quote.upperPrice,
        tickLower: quote.tickLower,
        tickUpper: quote.tickUpper,
        liquidity: quote.liquidity.toString(),
        amountA: quote.amountA.toString(),
        amountB: quote.amountB.toString(),
        maximumA: quote.maximumA.toString(),
        maximumB: quote.maximumB.toString(),
      })

      setPhase('idle')

    } catch (err) {
      setError(getErrorMessage(err))
      setPhase('error')
    }
  }

  async function execute(
    nextAction: Action
  ) {
    if (busy) return

    setError('')
    setSuccess('')
    setSignature('')
    setAction(nextAction)
    setPhase('signing')

    try {
      let sig: string

      if (nextAction === 'open') {
        if (openBlocked) {
          throw new Error(
            'Opening a position is currently blocked'
          )
        }

        if (!preview) {
          throw new Error(
            'Calculate the position first'
          )
        }

        const params = readParameters()

        if (
          preview.lower !== params.lower ||
          preview.upper !== params.upper ||
          preview.maxA !== params.maxA ||
          preview.maxB !== params.maxB
        ) {
          throw new Error(
            'Parameters changed. Calculate again.'
          )
        }

        sig = await openPosition(
          provider,
          publicKey,
          params.lower,
          params.upper,
          preview.quote.maximumA,
          preview.quote.maximumB,
          handleSubmitted
        )

        setSuccess(
          'Position opened successfully!'
        )

      } else if (nextAction === 'collect') {
        if (!vault.inMarket) {
          throw new Error('No open position')
        }

        sig = await collectFees(
          provider,
          publicKey,
          handleSubmitted
        )

        setSuccess(
          'Fee collection transaction confirmed!'
        )

      } else {
        if (!vault.inMarket) {
          throw new Error('No open position')
        }

        sig = await closePosition(
          provider,
          publicKey,
          handleSubmitted
        )

        setSuccess(
          'Position closed successfully!'
        )
      }

      setSignature(sig)
      setPhase('success')
      setPreview(null)

      if (nextAction === 'open') {
        setAmountA('')
        setAmountB('')
      }

    } catch (err) {
      setError(getErrorMessage(err))
      setPhase('error')
      setPreview(null)
      return
    }

    try {
      await onSuccess()
    } catch (err) {
      console.error(
        '[POSITION REFRESH ERROR]',
        err
      )
    }
  }

  return (
    <section className="panel admin-panel">
      <div className="admin-heading">
        <Layers size={24} />

        <div>
          <h2>Liquidity Position</h2>

          <p>
            Raydium CLMM Position Management
          </p>
        </div>
      </div>

      <div className="position-status-grid">
        <article className="position-stat">
          <p>Position Status</p>

          <strong>
            {vault.inMarket ? 'Open' : 'Closed'}
          </strong>
        </article>

        <article className="position-stat">
          <p>Accounting</p>

          <strong>
            {vault.needsSync
              ? 'Needs sync'
              : 'Synced'}
          </strong>
        </article>
      </div>

      {vault.inMarket && (
        <div className="position-details">
          <h3>Active Position</h3>

          <div className="position-detail-row">
            <span>Lower tick</span>
            <strong>{vault.tickLower}</strong>
          </div>

          <div className="position-detail-row">
            <span>Upper tick</span>
            <strong>{vault.tickUpper}</strong>
          </div>

          <div className="position-detail-row">
            <span>Lower price</span>

            <strong>
              {Math.pow(
                1.0001,
                vault.tickLower
              ).toFixed(6)}
            </strong>
          </div>

          <div className="position-detail-row">
            <span>Upper price</span>

            <strong>
              {Math.pow(
                1.0001,
                vault.tickUpper
              ).toFixed(6)}
            </strong>
          </div>

          <p className="admin-description">
            Position NFT
          </p>

          <code className="position-address">
            {vault.positionNft}
          </code>

          <a
            href={explorerAddress(
              new PublicKey(vault.positionNft)
            )}
            target="_blank"
            rel="noreferrer"
            className="admin-explorer"
          >
            View Position NFT ↗
          </a>

          <p className="admin-description">
            Personal Position Account
          </p>

          <code className="position-address">
            {vault.personalPosition}
          </code>

          <a
            href={explorerAddress(
              new PublicKey(vault.personalPosition)
            )}
            target="_blank"
            rel="noreferrer"
            className="admin-explorer"
          >
            View Raydium Position ↗
          </a>
        </div>
      )}

      {vault.inMarket && (
        <p className="admin-warning">
          Liquidity is currently in the market.
          Deposits and withdrawals are locked.
        </p>
      )}

      {!vault.inMarket && vault.needsSync && (
        <p className="admin-warning">
          Complete the reverse swap and synchronize
          the vault before opening a new position.
        </p>
      )}

      {!vault.inMarket &&
        !vault.needsSync &&
        vault.balanceB === 0n && (
          <p className="admin-warning">
            Swap Token A to Token B before opening
            a liquidity position.
          </p>
      )}

      {vault.paused && (
        <p className="admin-warning">
          The vault is paused.
        </p>
      )}

      <fieldset
        className="admin-fieldset"
        disabled={busy}
      >
        {!vault.inMarket && (
          <>
            <div className="admin-divider" />

            <h3>Open New Position</h3>

            <p className="admin-description">
              Set the price range and maximum
              token amounts for the CLMM position.
            </p>

            <div className="position-range-grid">
              <div>
                <label className="admin-label">
                  Lower price
                </label>

                <div className="admin-input-row">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={lowerPrice}
                    disabled={openBlocked}
                    onChange={event => {
                      setLowerPrice(
                        event.target.value
                      )
                      clearPreview()
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="admin-label">
                  Upper price
                </label>

                <div className="admin-input-row">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={upperPrice}
                    disabled={openBlocked}
                    onChange={event => {
                      setUpperPrice(
                        event.target.value
                      )
                      clearPreview()
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="admin-label">
              <span>Maximum Token A</span>

              <span>
                Available:{' '}
                {formatAmount(vault.balanceA)}
              </span>
            </div>

            <div className="admin-input-row">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amountA}
                disabled={openBlocked}
                onChange={event => {
                  setAmountA(event.target.value)
                  clearPreview()
                }}
              />

              <span>Token A</span>

              <button
                type="button"
                disabled={openBlocked}
                onClick={() => {
                  setAmountA(
                    formatAmount(vault.balanceA)
                  )
                  clearPreview()
                }}
              >
                MAX
              </button>
            </div>

            <div className="admin-label">
              <span>Maximum Token B</span>

              <span>
                Available:{' '}
                {formatAmount(vault.balanceB)}
              </span>
            </div>

            <div className="admin-input-row">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amountB}
                disabled={openBlocked}
                onChange={event => {
                  setAmountB(event.target.value)
                  clearPreview()
                }}
              />

              <span>Token B</span>

              <button
                type="button"
                disabled={openBlocked}
                onClick={() => {
                  setAmountB(
                    formatAmount(vault.balanceB)
                  )
                  clearPreview()
                }}
              >
                MAX
              </button>
            </div>

            {preview && (
              <div className="admin-quote">
                <div>
                  <span>Current pool price</span>

                  <strong>
                    {preview.quote.price.toFixed(8)}
                  </strong>
                </div>

                <div>
                  <span>Actual lower price</span>

                  <strong>
                    {preview.quote.lowerPrice
                      .toFixed(6)}
                  </strong>
                </div>

                <div>
                  <span>Actual upper price</span>

                  <strong>
                    {preview.quote.upperPrice
                      .toFixed(6)}
                  </strong>
                </div>

                <div>
                  <span>Lower tick</span>

                  <strong>
                    {preview.quote.tickLower}
                  </strong>
                </div>

                <div>
                  <span>Upper tick</span>

                  <strong>
                    {preview.quote.tickUpper}
                  </strong>
                </div>

                <div>
                  <span>Estimated Token A</span>

                  <strong>
                    {formatAmount(
                      preview.quote.amountA
                    )}
                  </strong>
                </div>

                <div>
                  <span>Estimated Token B</span>

                  <strong>
                    {formatAmount(
                      preview.quote.amountB
                    )}
                  </strong>
                </div>

                <div>
                  <span>Maximum Token A</span>

                  <strong>
                    {formatAmount(
                      preview.quote.maximumA
                    )}
                  </strong>
                </div>

                <div>
                  <span>Maximum Token B</span>

                  <strong>
                    {formatAmount(
                      preview.quote.maximumB
                    )}
                  </strong>
                </div>

                <div>
                  <span>Estimated liquidity</span>

                  <strong>
                    {preview.quote.liquidity
                      .toString()}
                  </strong>
                </div>

                <p className="admin-description">
                  Slippage tolerance: 1%.
                  The NFT will belong to the Vault PDA.
                  Final liquidity is recalculated
                  within the displayed token limits.
                </p>
              </div>
            )}

            <button
              type="button"
              className="admin-secondary admin-full"
              disabled={
                busy ||
                openBlocked ||
                !amountA ||
                !amountB
              }
              onClick={() => void calculate()}
            >
              Calculate Position
            </button>

            <button
              type="button"
              className="admin-full"
              disabled={
                busy ||
                openBlocked ||
                !preview
              }
              onClick={() => void execute('open')}
            >
              <Plus size={17} />
              Open Position
            </button>
          </>
        )}

        <div className="admin-divider" />

        <h3>Manage Position</h3>

        <p className="admin-description">
          Collect trading fees or return liquidity
          from Raydium to the vault.
        </p>

        <button
          type="button"
          className="admin-secondary admin-full"
          disabled={busy || !vault.inMarket}
          onClick={() => void execute('collect')}
        >
          <Coins size={17} />
          Collect Fees
        </button>

        <button
          type="button"
          className="position-close admin-full"
          disabled={busy || !vault.inMarket}
          onClick={() => void execute('close')}
        >
          <XCircle size={17} />
          Close Position
        </button>
      </fieldset>

      {phase === 'quoting' && (
        <p className="admin-description">
          Calculating liquidity position...
        </p>
      )}

      {phase === 'signing' && (
        <p className="admin-description">
          Preparing {action} transaction.
          Confirm in Phantom.
        </p>
      )}

      {phase === 'confirming' && (
        <p className="admin-description">
          Waiting for Solana confirmation...
        </p>
      )}

      {phase === 'success' && (
        <div className="admin-success">
          <p>{success}</p>
        </div>
      )}

      {phase === 'error' && (
        <div className="admin-error">
          <p>{error}</p>
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

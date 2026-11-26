import { useState } from 'react'

import type { PublicKey } from '@solana/web3.js'
import type { PhantomProvider } from '../types/wallet'
import type { VaultData } from '../lib/vault'
import type { UserData } from '../lib/user'

import {
  parseAmount,
  formatUnits,
  estimateShares,
  estimateWithdrawal,
} from '../lib/amounts'

import {
  depositTokens,
  withdrawTokens,
} from '../lib/userActions'

import { getErrorMessage } from '../lib/errors'

import TransactionStatus from './TransactionStatus'

import type {
  TransactionPhase,
} from './TransactionStatus'

interface Props {
  provider: PhantomProvider
  publicKey: PublicKey
  vault: VaultData
  user: UserData
  onSuccess: () => Promise<void>
}

export default function VaultActions({
  provider,
  publicKey,
  vault,
  user,
  onSuccess,
}: Props) {
  const [mode, setMode] =
    useState<'deposit' | 'withdraw'>('deposit')

  const [amount, setAmount] = useState('')

  const [phase, setPhase] =
    useState<TransactionPhase>('idle')

  const [signature, setSignature] = useState('')
  const [error, setError] = useState('')

  const busy =
    phase === 'signing' ||
    phase === 'confirming'

  const balance =
    mode === 'deposit'
      ? user.tokenA
      : user.shares

  const blocked =
    vault.locked ||
    (mode === 'deposit' && vault.paused)

  let estimate: bigint | null = null
  let valid = false

  if (!blocked) {
    try {
      const units = parseAmount(amount)

      estimate =
        mode === 'deposit'
          ? estimateShares(
              units,
              vault.totalTokens,
              vault.totalShares
            )
          : estimateWithdrawal(
              units,
              vault.totalTokens,
              vault.totalShares
            )

      valid =
        units <= balance &&
        estimate > 0n &&
        (
          mode === 'deposit' ||
          user.hasUserCard
        )
    } catch {
      estimate = null
    }
  }

  async function submit() {
    if (busy || blocked || !valid) {
      return
    }

    setError('')
    setSignature('')
    setPhase('signing')

    try {
      const units = parseAmount(amount)

      const onSubmitted = (tx: string) => {
        setSignature(tx)
        setPhase('confirming')
      }

      const tx =
        mode === 'deposit'
          ? await depositTokens(
              provider,
              publicKey,
              units,
              onSubmitted
            )
          : await withdrawTokens(
              provider,
              publicKey,
              units,
              onSubmitted
            )

      setSignature(tx)
      setPhase('success')
      setAmount('')
    } catch (err) {
      setError(getErrorMessage(err))
      setPhase('error')
      return
    }

    // Обновляем данные после подтверждения.
    // Ошибка обновления не отменяет успешную транзакцию.
    try {
      await onSuccess()
    } catch {
      console.warn('Refresh balances manually')
    }
  }

  return (
    <section className="panel vault-actions">
      <h2>Manage Vault</h2>

      <div className="action-tabs">
        <button
          className={
            mode === 'deposit' ? 'selected' : ''
          }
          disabled={busy}
          onClick={() => {
            setMode('deposit')
            setAmount('')
          }}
        >
          Deposit
        </button>

        <button
          className={
            mode === 'withdraw' ? 'selected' : ''
          }
          disabled={busy}
          onClick={() => {
            setMode('withdraw')
            setAmount('')
          }}
        >
          Withdraw
        </button>
      </div>

      {blocked && (
        <p className="error">
          {vault.locked
            ? 'Vault strategy is currently locked'
            : 'Deposits are paused'}
        </p>
      )}

      <div className="amount-label">
        <label htmlFor="vault-amount">
          {mode === 'deposit'
            ? 'Amount to deposit'
            : 'Shares to withdraw'}
        </label>

        <span>
          Balance: {formatUnits(balance)}
        </span>
      </div>

      <div className="amount-input">
        <input
          id="vault-amount"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          disabled={busy || blocked}
          onChange={event =>
            setAmount(event.target.value)
          }
        />

        <span>
          {mode === 'deposit'
            ? 'Token A'
            : 'Shares'}
        </span>

        <button
          disabled={busy || blocked}
          onClick={() =>
            setAmount(formatUnits(balance))
          }
        >
          MAX
        </button>
      </div>

      <div className="estimate-row">
        <span>Estimated receive</span>

        <strong>
          {estimate === null
            ? '—'
            : formatUnits(estimate)}

          {' '}

          {mode === 'deposit'
            ? 'Shares'
            : 'Token A'}
        </strong>
      </div>

      {mode === 'deposit' && !user.hasUserCard && (
        <p className="action-note">
          Your User Card will be created automatically
          with the first deposit.
        </p>
      )}

      <button
        className="submit-action"
        disabled={
          busy ||
          blocked ||
          !valid
        }
        onClick={() => void submit()}
      >
        {busy
          ? 'Processing...'
          : mode === 'deposit'
            ? 'Deposit Token A'
            : 'Withdraw Token A'}
      </button>

      <p className="action-note">
        Secure transaction signing via Phantom
      </p>

      <TransactionStatus
        phase={phase}
        signature={signature}
        error={error}
      />
    </section>
  )
}

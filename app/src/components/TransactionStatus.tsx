import { explorerTx } from '../config/solana'

export type TransactionPhase =
  | 'idle'
  | 'signing'
  | 'confirming'
  | 'success'
  | 'error'

interface Props {
  phase: TransactionPhase
  signature: string
  error: string
}

export default function TransactionStatus({
  phase,
  signature,
  error,
}: Props) {
  if (phase === 'idle') {
    return null
  }

  return (
    <div
      className={`transaction-status tx-${phase}`}
      role="status"
    >
      {phase === 'signing' && (
        <p>Preparing transaction. Confirm in Phantom.</p>
      )}

      {phase === 'confirming' && (
        <p>Waiting for Solana confirmation...</p>
      )}

      {phase === 'success' && (
        <p>Transaction confirmed successfully!</p>
      )}

      {phase === 'error' && (
        <p>{error}</p>
      )}

      {signature && (
        <a
          href={explorerTx(signature)}
          target="_blank"
          rel="noreferrer"
        >
          View transaction on Solana Explorer ↗
        </a>
      )}
    </div>
  )
}

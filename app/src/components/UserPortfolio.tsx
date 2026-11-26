import type { UserData } from '../lib/user'
import { formatUnits } from '../lib/amounts'

interface Props {
  data: UserData | null
  loading: boolean
  error: string
  onRefresh: () => void
}

export default function UserPortfolio({
  data,
  loading,
  error,
  onRefresh,
}: Props) {
  return (
    <section>
      <div className="section-header">
        <h2>My Portfolio</h2>

        <button
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <p className="error">{error}</p>
      )}

      <div className="stats">
        <article className="panel">
          <p>SOL Balance</p>
          <h2>
            {data
              ? formatUnits(data.sol, 9)
              : '—'}
          </h2>
        </article>

        <article className="panel">
          <p>My Token A</p>
          <h2>
            {data
              ? formatUnits(data.tokenA)
              : '—'}
          </h2>
        </article>

        <article className="panel">
          <p>My Token B</p>
          <h2>
            {data
              ? formatUnits(data.tokenB)
              : '—'}
          </h2>
        </article>

        <article className="panel">
          <p>My Shares</p>
          <h2>
            {data
              ? formatUnits(data.shares)
              : '—'}
          </h2>
        </article>
      </div>

      {data && (
        <div className="panel">
          <p>
            User Card:{' '}
            {data.hasUserCard
              ? 'Initialized'
              : 'Not initialized'}
          </p>
        </div>
      )}
    </section>
  )
}
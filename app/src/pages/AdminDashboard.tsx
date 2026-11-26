
import { ShieldCheck } from 'lucide-react'

import type { PublicKey } from '@solana/web3.js'
import type { PhantomProvider } from '../types/wallet'
import type { VaultData } from '../lib/vault'

import AdminSwap from '../components/AdminSwap'
import AdminPosition from '../components/AdminPosition'

import { formatAmount } from '../lib/vault'

interface Props {
  provider: PhantomProvider
  publicKey: PublicKey
  vault: VaultData
  onSuccess: () => Promise<void>
}

export default function AdminDashboard({
  provider,
  publicKey,
  vault,
  onSuccess,
}: Props) {
  const isAdmin =
    publicKey.toBase58() === vault.admin

  if (!isAdmin) {
    return null
  }

  return (
    <section className="admin-dashboard">
      <div className="admin-dashboard-header">
        <div className="admin-heading">
          <ShieldCheck size={28} />

          <div>
            <h2>Admin Dashboard</h2>

            <p>
              Raydium CLMM Strategy Management
            </p>
          </div>
        </div>

        <span className="admin-role">
          Administrator
        </span>
      </div>

      <div className="admin-stats">
        <article className="panel">
          <p>Available Token A</p>
          <h2>{formatAmount(vault.balanceA)}</h2>
        </article>

        <article className="panel">
          <p>Available Token B</p>
          <h2>{formatAmount(vault.balanceB)}</h2>
        </article>

        <article className="panel">
          <p>LP Position</p>

          <h2>
            {vault.inMarket ? 'Open' : 'Closed'}
          </h2>
        </article>

        <article className="panel">
          <p>Accounting</p>

          <h2>
            {vault.needsSync
              ? 'Needs Sync'
              : 'Synced'}
          </h2>
        </article>
      </div>

      {/* Swap and strategy recovery */}
      <AdminSwap
        provider={provider}
        publicKey={publicKey}
        vault={vault}
        onSuccess={onSuccess}
      />

      {/* Liquidity position management */}
      <AdminPosition
        provider={provider}
        publicKey={publicKey}
        vault={vault}
        onSuccess={onSuccess}
      />
    </section>
  )
}

import { useEffect, useState } from 'react'

import VaultActions from './components/VaultActions'
import UserPortfolio from './components/UserPortfolio'
import AdminDashboard from './pages/AdminDashboard'

import { useWallet } from './hooks/useWallet'
import { useUser } from './hooks/useUser'

import {
  fetchVault,
  formatAmount,
} from './lib/vault'

import type { VaultData } from './lib/vault'

import {
  VAULT_STATE,
  explorerAddress,
} from './config/solana'

import './App.css'

function App() {
  const wallet = useWallet()
  const user = useUser(wallet.publicKey)

  const [vault, setVault] = useState<VaultData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Получение актуального состояния Vault
  async function refresh() {
    setLoading(true)
    setError('')

    try {
      setVault(await fetchVault())
    } catch (err) {
      setError(
        err instanceof Error ? err.message : String(err)
      )
    } finally {
      setLoading(false)
    }
  }

  // Обновление данных после успешной транзакции
  async function refreshAll() {
    await Promise.all([
      refresh(),
      user.refresh(),
    ])
  }

  // Загрузка данных при открытии приложения
  useEffect(() => {
    void refresh()
  }, [])

  // Проверка роли подключённого кошелька
  const isAdmin =
    !!vault &&
    wallet.publicKey?.toBase58() === vault.admin

  return (
    <main className="container">

      {/* Header */}
      <header>
        <div>
          <span className="network">
            SOLANA DEVNET
          </span>

          <h1>Solana Vault</h1>

          <p>Raydium CLMM Strategy</p>
        </div>

        <button
          onClick={
            wallet.connected
              ? wallet.disconnect
              : wallet.connect
          }
          disabled={wallet.connecting}
        >
          {wallet.connecting
            ? 'Connecting...'
            : wallet.connected
              ? 'Disconnect'
              : 'Connect Phantom'}
        </button>
      </header>

      {/* Connected wallet */}
      {wallet.publicKey && (
        <section className="panel">
          <p>Connected wallet</p>

          <code>
            {wallet.publicKey.toBase58()}
          </code>

          <p>
            Role: {
              !vault
                ? 'Checking...'
                : isAdmin
                  ? 'Administrator'
                  : 'User'
            }
          </p>
        </section>
      )}

      {/* User portfolio */}
      {wallet.connected && (
        <UserPortfolio
          data={user.data}
          loading={user.loading}
          error={user.error}
          onRefresh={user.refresh}
        />
      )}

            {/* Deposit and Withdraw */}
      {wallet.publicKey &&
        wallet.provider &&
        vault &&
        user.data && (
          <VaultActions
            key={`user-actions-${wallet.publicKey.toBase58()}`}
            provider={wallet.provider}
            publicKey={wallet.publicKey}
            vault={vault}
            user={user.data}
            onSuccess={refreshAll}
          />
        )}

      {/* Administrator dashboard */}
      {isAdmin &&
        wallet.publicKey &&
        wallet.provider &&
        vault && (
          <AdminDashboard
            key={`admin-dashboard-${wallet.publicKey.toBase58()}`}
            provider={wallet.provider}
            publicKey={wallet.publicKey}
            vault={vault}
            onSuccess={refreshAll}
          />
        )}

      {/* Wallet errors */}
      {wallet.error && (
        <p className="error">
          {wallet.error}
        </p>
      )}

      {/* Vault errors */}
      {error && (
        <p className="error">
          {error}
        </p>
      )}

      {/* Vault overview header */}
      <div className="section-header">
        <h2>Vault Overview</h2>

        <button
          onClick={refresh}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Vault statistics */}
      {vault && (
        <>
          <section className="stats">

            <article className="panel">
              <p>Vault Token A</p>

              <h2>
                {formatAmount(vault.balanceA)}
              </h2>
            </article>

            <article className="panel">
              <p>Vault Token B</p>

              <h2>
                {formatAmount(vault.balanceB)}
              </h2>
            </article>

            <article className="panel">
              <p>Total Shares</p>

              <h2>
                {formatAmount(vault.totalShares)}
              </h2>
            </article>

            <article className="panel">
              <p>Share Price</p>

              <h2>
                {vault.sharePrice === null
                  ? 'Unavailable'
                  : vault.sharePrice.toFixed(6)}
              </h2>
            </article>

          </section>

          {/* Strategy status */}
          <section className="panel">
            <h2>Strategy Status</h2>

            <p>
              Vault: {
                vault.paused
                  ? 'Paused'
                  : 'Active'
              }
            </p>

            <p>
              LP Position: {
                vault.inMarket
                  ? 'Open'
                  : 'Closed'
              }
            </p>

            <p>
              Accounting: {
                vault.needsSync
                  ? 'Needs sync'
                  : 'Synced'
              }
            </p>

            <p>
              Strategy lock: {
                vault.locked
                  ? 'Locked'
                  : 'Unlocked'
              }
            </p>

            <a
              href={explorerAddress(VAULT_STATE)}
              target="_blank"
              rel="noreferrer"
            >
              View Vault on Solana Explorer
            </a>
          </section>
        </>
      )}
    </main>
  )
}

export default App
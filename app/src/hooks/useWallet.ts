import { useEffect, useState } from 'react'
import type { PublicKey } from '@solana/web3.js'
import type { PhantomProvider } from '../types/wallet'

export function useWallet() {
  const [publicKey, setPublicKey] =
    useState<PublicKey | null>(null)

  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  const provider: PhantomProvider | undefined =
    window.phantom?.solana

  useEffect(() => {
    if (!provider?.isPhantom) return

    const onConnect = (key?: PublicKey | null) => {
      setPublicKey(key ?? provider.publicKey)
    }

    const onDisconnect = () => {
      setPublicKey(null)
    }

    const onAccountChanged = (key?: PublicKey | null) => {
      setPublicKey(key ?? null)
    }

    provider.on('connect', onConnect)
    provider.on('disconnect', onDisconnect)
    provider.on('accountChanged', onAccountChanged)

    provider
      .connect({ onlyIfTrusted: true })
      .then(result => setPublicKey(result.publicKey))
      .catch(() => {})

    return () => {
      provider.removeListener('connect', onConnect)
      provider.removeListener('disconnect', onDisconnect)
      provider.removeListener(
        'accountChanged',
        onAccountChanged
      )
    }
  }, [provider])

  async function connect() {
    setError('')

    if (!provider?.isPhantom) {
      setError('Phantom wallet is not installed')
      return
    }

    setConnecting(true)

    try {
      const result = await provider.connect()
      setPublicKey(result.publicKey)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : String(err)
      )
    } finally {
      setConnecting(false)
    }
  }

  async function disconnect() {
    try {
      await provider?.disconnect()
      setPublicKey(null)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : String(err)
      )
    }
  }

  return {
    provider,
    publicKey,
    connected: publicKey !== null,
    connecting,
    error,
    connect,
    disconnect,
  }
}
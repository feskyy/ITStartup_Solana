import {
  useCallback,
  useEffect,
  useState,
} from 'react'

import type { PublicKey } from '@solana/web3.js'

import {
  fetchUser,
} from '../lib/user'

import type { UserData } from '../lib/user'

export function useUser(publicKey: PublicKey | null) {
  const [data, setData] =
    useState<UserData | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!publicKey) {
      setData(null)
      return
    }

    setLoading(true)
    setError('')

    try {
      setData(await fetchUser(publicKey))
    } catch (err) {
      setData(null)

      setError(
        err instanceof Error
          ? err.message
          : String(err)
      )
    } finally {
      setLoading(false)
    }
  }, [publicKey])

  useEffect(() => {
    setData(null)
    void refresh()
  }, [refresh])

  return {
    data,
    loading,
    error,
    refresh,
  }
}
import type {
  PublicKey,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js'

export interface PhantomProvider {
  isPhantom: boolean
  isConnected: boolean
  publicKey: PublicKey | null

  connect(options?: {
    onlyIfTrusted?: boolean
  }): Promise<{
    publicKey: PublicKey
  }>

  disconnect(): Promise<void>

  signTransaction<
    T extends Transaction | VersionedTransaction
  >(transaction: T): Promise<T>

  signAllTransactions<
    T extends Transaction | VersionedTransaction
  >(transactions: T[]): Promise<T[]>

  on(
    event: 'connect' | 'disconnect' | 'accountChanged',
    handler: (key?: PublicKey | null) => void
  ): void

  removeListener(
    event: 'connect' | 'disconnect' | 'accountChanged',
    handler: (key?: PublicKey | null) => void
  ): void
}

declare global {
  interface Window {
    phantom?: {
      solana?: PhantomProvider
    }
  }
}
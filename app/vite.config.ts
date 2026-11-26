import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],

  resolve: {
    dedupe: ['@solana/web3.js', 'bn.js'],
  },

  server: {
    host: '0.0.0.0',
    port: 5173,

    proxy: {
      '^/rpc-ws(?:/|$)': {
        target: 'wss://api.devnet.solana.com',
        ws: true,
        changeOrigin: true,
        secure: true,
        rewrite: (path) =>
          path.replace(/^\/rpc-ws/, '') || '/',
      },

      '^/rpc(?:/|$)': {
        target: 'https://api.devnet.solana.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) =>
          path.replace(/^\/rpc/, '') || '/',
      },
    },
  },
})
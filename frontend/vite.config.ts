import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: '@', replacement: src('./src') },
      // React Router 7 only exports its development build; its own Vite plugin swaps in the
      // production build for `vite build`. We use the library without that plugin, so do the same.
      ...(command === 'build'
        ? [
            { find: /^react-router$/, replacement: src('./node_modules/react-router/dist/production/index.mjs') },
            { find: /^react-router\/dom$/, replacement: src('./node_modules/react-router/dist/production/dom-export.mjs') },
          ]
        : []),
    ],
  },
}))

import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url))

const THEME = '#1e3a5f'
const BACKGROUND = '#f3f5f8'

/**
 * Vendor chunks shared by every role. Libraries used only by lazy screens (charts, tables,
 * forms, drag-and-drop, QR scanning) are left out so they stay with the screens that need them.
 */
function vendorChunk(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined
  if (/node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/.test(id)) return 'react'
  if (/node_modules[\\/](@radix-ui|@floating-ui|react-remove-scroll|react-remove-scroll-bar|react-style-singleton|use-callback-ref|use-sidecar|aria-hidden)[\\/]/.test(id)) return 'radix'
  if (/node_modules[\\/]@tanstack[\\/](react-query|query-core)[\\/]/.test(id)) return 'query'
  if (/node_modules[\\/]date-fns[\\/]/.test(id)) return 'date-fns'
  return undefined
}

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Ask before activating a new version, so nobody loses a half-filled form mid-shift.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'FactoryOps CMMS',
        short_name: 'FactoryOps',
        description: 'Maintenance management for manufacturing: report breakdowns, run work orders, plan maintenance.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: THEME,
        background_color: BACKGROUND,
        categories: ['business', 'productivity', 'utilities'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell and every screen are precached, so the app opens without a connection.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // API responses are never cached by the service worker: they are per-user and must be fresh.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
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
  build: {
    rollupOptions: { output: { manualChunks: vendorChunk } },
  },
}))

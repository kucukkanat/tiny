import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Relative base: the app is static files, servable from any path.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // main.tsx registers instead, so a new build reloads rather than sitting
      // behind the old one until the next visit.
      injectRegister: null,
      manifest: {
        name: 'tiny',
        short_name: 'tiny',
        display: 'standalone',
        background_color: '#0a0a0a',
        theme_color: '#0a0a0a',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
      workbox: {
        // Shiki ships a grammar per language and Mermaid a renderer per diagram
        // type — some 380 chunks the app fetches only when a message actually
        // contains one. Precaching them charged every first visit 13 MB on a
        // phone. Precache the shell; cache a chunk the first time it's wanted.
        globPatterns: ['**/*.{html,css,svg,woff2,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'script',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'scripts' },
          },
        ],
      },
    }),
  ],
})

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { SHARED, importmap } from './src/sdk/shared'

/**
 * The map has to be in the HTML before the first module is fetched, so it can't
 * be added from JavaScript, and it points at different files in dev and in a
 * build — which is why it's generated here rather than written into index.html.
 */
const sharedLibraries = (): Plugin => ({
  name: 'tiny-importmap',
  transformIndexHtml: {
    // Post, because the shims' hashed names are only known once the bundle is
    // generated. `head-prepend` still puts the map ahead of the module script,
    // which is the one thing that has to be true.
    order: 'post',
    handler: (_html, ctx) => [
      {
        tag: 'script',
        attrs: { type: 'importmap' },
        injectTo: 'head-prepend',
        children: JSON.stringify(
          importmap((entry) => {
            if (ctx.server) return `/src/sdk/${entry}.ts`
            const chunk = Object.values(ctx.bundle ?? {}).find(
              (one) => one.type === 'chunk' && one.name === `sdk/${entry}`,
            )
            if (!chunk) throw new Error(`No chunk emitted for sdk/${entry}`)
            return `./${chunk.fileName}`
          }),
          null,
          2,
        ),
      },
    ],
  },
})

// Relative base: the app is static files, servable from any path.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    sharedLibraries(),
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
            // Extension URLs are the user's, and a reload adds another. Without
            // a bound this grows for as long as the app is installed.
            options: {
              cacheName: 'scripts',
              expiration: { maxEntries: 60, purgeOnQuotaError: true },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rolldownOptions: {
      // Vite drops an entry's unused exports by default, which would leave every
      // one of these shims exporting nothing at all.
      preserveEntrySignatures: 'allow-extension',
      input: {
        index: 'index.html',
        ...Object.fromEntries(
          Object.values(SHARED).map((file) => [`sdk/${file}`, `src/sdk/${file}.ts`]),
        ),
      },
    },
  },
})

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
    order: 'pre',
    handler: (_html, ctx) => [
      {
        tag: 'script',
        attrs: { type: 'importmap' },
        injectTo: 'head-prepend',
        children: JSON.stringify(importmap(ctx.server !== undefined), null, 2),
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
        //
        // `assets/sdk/*.js` is the exception, and has to be: those names carry
        // no hash, so stale-while-revalidate would hand an extension the last
        // deploy's React while the app runs this one's. Three small files,
        // revised with index.html, and scoped so the 305 shiki chunks stay out.
        globPatterns: ['**/*.{html,css,svg,woff2,webmanifest}', 'assets/sdk/*.js'],
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
      output: {
        // The shims are named in the import map, so their names can't move.
        entryFileNames: (chunk: { name: string }) =>
          chunk.name.startsWith('sdk/') ? 'assets/[name].js' : 'assets/[name]-[hash].js',
      },
    },
  },
})

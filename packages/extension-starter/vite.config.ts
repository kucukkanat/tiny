import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * One ES module, with everything the app already has left out of it. Those
 * names are resolved by the import map in the page — bundling our own copy of
 * React would give this extension a second one, and its hooks would throw.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // The app is what serves this, so it lands in the app's build.
    outDir: '../app/dist/extensions',
    emptyOutDir: false,
    cssCodeSplit: false,
    lib: {
      entry: 'src/index.tsx',
      formats: ['es'],
      fileName: () => 'starter.js',
    },
    rolldownOptions: {
      external: [/^react($|\/)/, 'react-router', 'zod', 'ai'],
    },
  },
})

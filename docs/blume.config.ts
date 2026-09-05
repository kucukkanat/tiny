import { defineConfig } from 'blume'

export default defineConfig({
  title: 'tiny',
  description:
    'A browser-only PWA: a thin shell that hosts plugins built into the bundle and extensions installed at runtime.',

  github: { owner: 'kucukkanat', repo: 'tiny', dir: 'packages/docs' },

  theme: { accent: 'blue', mode: 'dark' },

  content: { root: 'docs' },

  ai: { llmsTxt: true },
})

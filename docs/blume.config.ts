import { defineConfig } from 'blume'

export default defineConfig({
  title: 'tiny',
  description:
    'A browser-only PWA: a thin shell and extensions, some shipped in the bundle and the rest installed at runtime.',

  github: { owner: 'kucukkanat', repo: 'tiny', dir: 'packages/docs' },

  theme: { accent: 'blue', mode: 'dark' },

  content: { root: 'docs' },

  ai: { llmsTxt: true },
})

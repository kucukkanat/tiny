import type { KnipConfig } from 'knip'

/**
 * Knip walks from every entry file to everything it reaches; what it never
 * reaches is dead. Three things here are reachable in ways it can't see on its
 * own, and each is taught rather than ignored — an ignore hides the next one.
 */
export default {
  // Only Tailwind reads CSS, so knip skips it, and with it the one place
  // `@tiny/ui` is depended on from an extension and everything `globals.css`
  // pulls in. Hand it the specifiers as imports, and nothing else.
  compilers: {
    css: (text: string) =>
      [...text.matchAll(/@(?:import|reference)\s+([^;]+);/g)]
        .map(([, specifier]) => `import ${specifier}`)
        .join('\n'),
  },
  workspaces: {
    'packages/app': {
      // The shims are rollup inputs named in `vite.config.ts`, reached from an
      // import map generated at build time, so no file imports them.
      entry: ['src/sdk/*.ts'],
      project: ['src/**/*.{ts,tsx,css}', '*.{ts,mjs}'],
    },
    // Its stylesheet is where `@tiny/ui` is depended on, and `project` has to
    // match the file before the compiler above is given it.
    'packages/extension-starter': { project: ['src/**/*.{ts,tsx,css}', '*.ts'] },
    // A wildcard `exports` per directory makes every component an entry, and
    // entries are exempt from the unused-export check by default — which would
    // exempt the whole package. This is what makes `packages/ui` answerable.
    'packages/ui': { project: ['src/**/*.{ts,tsx,css}'], includeEntryExports: true },
  },
} satisfies KnipConfig

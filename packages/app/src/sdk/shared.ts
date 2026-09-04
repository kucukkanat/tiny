/**
 * The bare specifiers an extension may import, and the module that answers each.
 * A library only earns a place here if a second copy would break — React and the
 * router carry context, zod is free, and the SDK's `tool()` is what types an
 * extension's own tools.
 */
export const SHARED = {
  react: 'react',
  'react/jsx-runtime': 'jsx-runtime',
  'react-router': 'react-router',
  zod: 'zod',
  ai: 'ai',
} as const

/** Where the browser should look, which is not the same place twice. */
export const importmap = (dev: boolean) => ({
  imports: Object.fromEntries(
    Object.entries(SHARED).map(([specifier, file]) => [
      specifier,
      dev ? `/src/sdk/${file}.ts` : `./assets/sdk/${file}.js`,
    ]),
  ),
})

/**
 * The bare specifiers an extension may import, and the module that answers each.
 * A library only earns a place here if a second copy would break — React and the
 * router carry context, zod is what keeps a `.describe()` meaning the same thing
 * on both sides, and the SDK's `tool()` is what types an extension's own tools.
 */
export const SHARED = {
  react: 'react',
  'react/jsx-runtime': 'jsx-runtime',
  'react-router': 'react-router',
  zod: 'zod',
  ai: 'ai',
} as const

/**
 * Where the browser should look, which is not the same place twice. The built
 * files are hashed like everything else — the map is what names them, and it
 * ships inside `index.html`, which is revisioned. Fixed names would mean the
 * service worker could hand an extension last deploy's shim pointing at a chunk
 * this one no longer has.
 */
export const importmap = (fileOf: (entry: string) => string) => ({
  imports: Object.fromEntries(
    Object.entries(SHARED).map(([specifier, entry]) => [specifier, fileOf(entry)]),
  ),
})

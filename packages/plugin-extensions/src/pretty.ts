/**
 * Prettier, fetched on the first press rather than shipped: it is 171 kB
 * gzipped, which nobody who never presses the button should pay for. Same deal
 * as the editor itself in `rich.ts`.
 *
 * `babel` is the parser and not `acorn` or `meriyah` because it is the one that
 * reads JSX, which is what you are writing here.
 */
export const prettify = async (source: string): Promise<string> => {
  const [{ format }, babel, estree] = await Promise.all([
    import('prettier/standalone'),
    import('prettier/plugins/babel'),
    import('prettier/plugins/estree'),
  ])
  // The repo's own settings, so what you write here comes out looking like
  // what ships in it.
  return format(source, {
    parser: 'babel',
    semi: false,
    singleQuote: true,
    printWidth: 90,
    plugins: [babel, estree],
  })
}

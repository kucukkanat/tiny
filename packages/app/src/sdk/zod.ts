// Free: plugin-tools already hands the whole of zod to `new Function`, so all of
// it is in the bundle either way. `export *` rather than `export { z }`, because
// `import * as z from 'zod'` is zod's own documented spelling and a `z`-only
// shim would leave `z.object` undefined under it.
export * from 'zod'

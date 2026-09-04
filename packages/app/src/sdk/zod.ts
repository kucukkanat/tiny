// One zod, so a schema an extension writes means the same thing the app's own
// do. It is not free: `export *` under `preserveEntrySignatures` keeps the whole
// library, which is why it sits in this shim and not in the entry chunk — the
// app pays for the members it uses, and only an extension fetches the rest.
export * from 'zod'

import { cp } from "node:fs/promises";
import tailwind from "bun-plugin-tailwind";

const root = new URL("..", import.meta.url).pathname;

const result = await Bun.build({
  entrypoints: [`${root}index.html`],
  outdir: `${root}dist`,
  plugins: [tailwind],
  minify: true,
  // pi-ai loads each provider's SDK through a dynamic import; splitting keeps it
  // out of the initial payload until the first request is sent.
  splitting: true,
  define: { "process.env.NODE_ENV": '"production"' },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// The service worker must live at the root so its scope covers the whole app,
// and the manifest (hash-copied by the bundler) references icon.svg by name.
await cp(`${root}public/sw.js`, `${root}dist/sw.js`);
await cp(`${root}public/icon.svg`, `${root}dist/icon.svg`);
console.log(`Built ${result.outputs.length} files → apps/chat/dist`);

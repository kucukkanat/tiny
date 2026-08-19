import { cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { build as buildDocs } from "../apps/docs/src/build.ts";

/**
 * Assembles what GitHub Pages serves: the documentation at the root and the
 * chat app under `/app/`.
 *
 * Both halves are built by their own unmodified build, then placed. The app is
 * copied rather than built in place because every URL it emits is relative —
 * assets, the manifest, the service worker and the hash router all work at any
 * depth — so mounting it under a sub-path needs no configuration at all.
 */
const root = join(import.meta.dir, "..");
const out = join(root, "dist");

// The 404 page is the only file that cannot use a relative URL; the deployed
// base path is a repository sub-path, so it has to be told.
const baseFlag = process.argv.find((argument) => argument.startsWith("--base="));
const base = baseFlag?.slice("--base=".length) ?? "/";

await rm(out, { recursive: true, force: true });

const pages = await buildDocs(out, base);
console.log(`Docs: ${pages.length} pages → dist/`);

const chat = Bun.spawnSync(["bun", "run", "--filter", "@tiny/chat", "build"], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
});
if (chat.exitCode !== 0) process.exit(chat.exitCode ?? 1);

await cp(join(root, "apps", "chat", "dist"), join(out, "app"), { recursive: true });
console.log(`App: apps/chat/dist → dist/app/`);
console.log(`Site assembled at dist/ (base ${base})`);

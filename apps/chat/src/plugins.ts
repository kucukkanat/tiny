import type { IdentifiedPlugin } from "@tiny/plugin";
import { fileSystem } from "@tiny/plugin-fs";
import { humanInTheLoop } from "@tiny/plugin-hitl";
import { pluginManager } from "@tiny/plugin-manager";
import { settings } from "@tiny/plugin-settings";
import { approvalLog, streamTrace, usageLogger } from "@tiny/plugin-trace";
import * as tinyUi from "@tiny/ui";
import { ovhcloud } from "./ovhcloudProvider.ts";
import { pollinations } from "./pollinationsProvider.ts";

/**
 * The plugins this app runs, in order — the whole of its plugin configuration.
 * `IdentifiedPlugin` so the compiler insists each declares the id that
 * namespaces its storage. `@tiny/plugin-prompt` rewrites requests, so it is
 * deliberately not listed; add it on purpose.
 */
export const plugins: readonly IdentifiedPlugin[] = [
  usageLogger(),
  streamTrace(),
  // Hears the gate below over `tiny.events`, so order and presence are free.
  approvalLog(),
  settings(),
  // Two free, keyless OpenAI-compatible endpoints, wired in for testing that
  // path — see the provider files next to this one for where they came from.
  pollinations(),
  ovhcloud(),
  // Ask before the model runs a tool. OPFS reads are free; everything else
  // asks, including tools installed later through `pluginManager`.
  humanInTheLoop({
    allow: ["fs_list", "fs_read"],
    labels: { fs_write: "Write File", fs_edit: "Edit File", fs_delete: "Delete" },
  }),
  // Filesystem tools for the model, sandboxed to this origin's OPFS.
  fileSystem(),
  // Runtime installs. Declares `after: ["*"]` itself; `modules` is what an
  // installed plugin may `import` by name, on top of `react` and `@tiny/plugin`.
  pluginManager({ modules: { "@tiny/ui": tinyUi } }),
];

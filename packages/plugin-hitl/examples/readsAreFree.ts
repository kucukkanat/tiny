import type { Plugin } from "@tiny/plugin";
import { humanInTheLoop } from "@tiny/plugin-hitl";

/**
 * Reading is cheap and reversible; writing is neither. Naming the safe tools is
 * usually all the policy an app needs.
 */
export const plugins: readonly Plugin[] = [
  humanInTheLoop({
    allow: ["fs_list", "fs_read"],
    deny: ["fs_delete"],
    labels: { fs_write: "Write File", fs_edit: "Edit File" },
  }),
];

import type { Plugin } from "@tiny/plugin";
import { humanInTheLoop } from "@tiny/plugin-hitl";

/**
 * `decide` is the only rule that sees the arguments, so it is where a policy
 * about *what* a tool is being asked to do belongs — pi's `protected-paths`
 * shape, as a configuration rather than a second plugin.
 */
export const plugins: readonly Plugin[] = [
  humanInTheLoop({
    decide: ({ toolName, input }) => {
      if (!toolName.startsWith("fs_")) return undefined;
      const path = String(input.path ?? "");
      if (path.startsWith("/scratch/")) return "allow";
      if (path.includes("/.env")) return "deny";
      return "ask";
    },
    denyReason: "That path is off limits — pick somewhere under /scratch.",
  }),
];

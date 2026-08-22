import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";
import { approvalDecided } from "@tiny/plugin-hitl";

/** How a decision reads in the log — the user's answer, or a rule standing in. */
const because = { user: "asked", policy: "by policy", remembered: "remembered", "no-ui": "no UI" };

/**
 * Record every tool call `@tiny/plugin-hitl` settles, and how. Safe without the
 * approval plugin installed: a channel with no publisher is silent.
 */
export const approvalLog = (log: (message: string) => void = console.info): IdentifiedPlugin =>
  definePlugin("approvalLog", { needs: [] }, (tiny) => {
    tiny.events.on(approvalDecided, ({ toolName, approved, by, reason }) => {
      const outcome = approved ? "allowed" : "blocked";
      const note = reason === undefined || reason === "" ? "" : ` — ${reason}`;
      log(`[approval] ${toolName} ${outcome} (${because[by]})${note}`);
    });
  });

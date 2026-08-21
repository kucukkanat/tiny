import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";
import { approvalDecided } from "@tiny/plugin-hitl";

/** How a decision reads in the log — the user's answer, or a rule standing in. */
const because = { user: "asked", policy: "by policy", remembered: "remembered", "no-ui": "no UI" };

/**
 * Record every tool call `@tiny/plugin-hitl` settles, and how.
 *
 * The one plugin here that observes another plugin rather than the request, and
 * the reason `tiny.events` exists: `@tiny/plugin-hitl` publishes what it
 * decided, this subscribes, and neither knows anything else about the other.
 * The import is `approvalDecided` and nothing more — a channel, which carries
 * the payload's type so the handler below is checked against what the publisher
 * actually sends rather than against a guess.
 *
 * It is safe to leave on without the approval plugin installed: a channel with
 * no publisher is silent, so this logs nothing and costs nothing.
 */
export const approvalLog = (log: (message: string) => void = console.info): IdentifiedPlugin =>
  definePlugin("approvalLog", (tiny) => {
    tiny.events.on(approvalDecided, ({ toolName, approved, by, reason }) => {
      const outcome = approved ? "allowed" : "blocked";
      const note = reason === undefined || reason === "" ? "" : ` — ${reason}`;
      log(`[approval] ${toolName} ${outcome} (${because[by]})${note}`);
    });
  });

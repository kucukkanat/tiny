import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";

/**
 * Summarise pi's raw event stream during development; events are counted, not
 * logged, and the whole extension is a no-op in production.
 */
export const streamTrace = (log: (message: string) => void = console.debug): IdentifiedPlugin =>
  definePlugin("streamTrace", { needs: [] }, (tiny) => {
    if (process.env.NODE_ENV === "production") return;

    const counts = new Map<string, number>();
    const count = (type: string): void => {
      counts.set(type, (counts.get(type) ?? 0) + 1);
    };

    tiny.on("message_start", () => counts.clear());
    tiny.on("message_update", (event) => count(event.assistantMessageEvent.type));
    tiny.on("message_end", () => {
      count("done");
      log(`[trace] ${[...counts].map(([type, n]) => `${type}×${n}`).join(" ")}`);
    });
  });

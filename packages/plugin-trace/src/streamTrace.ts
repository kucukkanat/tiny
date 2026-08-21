import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";

/**
 * Summarise pi's raw event stream during development — useful when a provider
 * emits something this app does not yet render.
 *
 * `message_update` carries pi's token-level `assistantMessageEvent`, which is
 * counted rather than logged so a long reply cannot flood the console. The
 * whole extension is a no-op in production (`process.env.NODE_ENV` is inlined
 * by the bundler).
 */
export const streamTrace = (log: (message: string) => void = console.debug): IdentifiedPlugin =>
  definePlugin("streamTrace", { needs: [] }, (tiny) => {
    if (process.env.NODE_ENV === "production") return;

    // One extension instance serves every request, so the tally resets on start.
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

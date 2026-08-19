import type { Extension, ExtensionAPI } from "@tiny/ai";

/**
 * Summarise pi's raw event stream during development — useful when a provider
 * emits something this app does not yet render.
 *
 * `message_update` carries pi's token-level `assistantMessageEvent`, which is
 * counted rather than logged so a long reply cannot flood the console. The
 * whole extension is a no-op in production (`process.env.NODE_ENV` is inlined
 * by the bundler).
 */
export const streamTrace =
  (log: (message: string) => void = console.debug): Extension =>
  (pi: ExtensionAPI) => {
    if (process.env.NODE_ENV === "production") return;

    // One extension instance serves every request, so the tally resets on start.
    const counts = new Map<string, number>();
    const count = (type: string): void => {
      counts.set(type, (counts.get(type) ?? 0) + 1);
    };

    pi.on("message_start", () => counts.clear());
    pi.on("message_update", (event) => count(event.assistantMessageEvent.type));
    pi.on("message_end", () => {
      count("done");
      log(`[trace] ${[...counts].map(([type, n]) => `${type}×${n}`).join(" ")}`);
    });
  };

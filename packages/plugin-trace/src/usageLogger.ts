import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";

/**
 * Report token usage once a reply completes. Cost is reported only when the
 * endpoint actually priced the call (`endpointModel` sets every rate to zero).
 */
export const usageLogger = (log: (message: string) => void = console.info): IdentifiedPlugin =>
  definePlugin("usageLogger", { needs: [] }, (tiny) => {
    tiny.on("message_end", (event) => {
      const { input, output, totalTokens, cost } = event.message.usage;
      const price = cost.total > 0 ? ` · $${cost.total.toFixed(4)}` : "";
      log(`[usage] ${input} in + ${output} out = ${totalTokens} tokens${price}`);
    });
  });

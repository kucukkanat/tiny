import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";

/**
 * Report token usage once a reply completes — pi carries it on the finalized
 * message handed to `message_end`.
 *
 * The same message carries `usage.cost`, but a bring-your-own endpoint
 * publishes no price table (`endpointModel` sets every rate to zero), so cost
 * is reported only when the endpoint actually priced the call.
 */
export const usageLogger = (log: (message: string) => void = console.info): IdentifiedPlugin =>
  definePlugin("usageLogger", (tiny) => {
    tiny.on("message_end", (event) => {
      const { input, output, totalTokens, cost } = event.message.usage;
      const price = cost.total > 0 ? ` · $${cost.total.toFixed(4)}` : "";
      log(`[usage] ${input} in + ${output} out = ${totalTokens} tokens${price}`);
    });
  });

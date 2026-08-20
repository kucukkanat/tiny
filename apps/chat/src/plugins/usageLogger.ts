import type { Extension, ExtensionAPI } from "@tiny/ai";

/**
 * Report token usage once a reply completes — pi carries it on the finalized
 * message handed to `message_end`.
 *
 * The same message carries `usage.cost`, but a bring-your-own endpoint
 * publishes no price table (`endpointModel` sets every rate to zero), so cost
 * is reported only when the endpoint actually priced the call.
 */
export const usageLogger = (log: (message: string) => void = console.info): Extension =>
  function usageLogger(pi: ExtensionAPI) {
    pi.on("message_end", (event) => {
      const { input, output, totalTokens, cost } = event.message.usage;
      const price = cost.total > 0 ? ` · $${cost.total.toFixed(4)}` : "";
      log(`[usage] ${input} in + ${output} out = ${totalTokens} tokens${price}`);
    });
  };

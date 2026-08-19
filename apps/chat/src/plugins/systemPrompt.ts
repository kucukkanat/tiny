import type { Extension, ExtensionAPI } from "@tiny/ai";

/**
 * Give every request an app-level system prompt.
 *
 * A prompt already carried by the conversation wins, so a per-chat instruction
 * is never silently overridden by the app-wide default. pi chains this event,
 * so `event.systemPrompt` already reflects any earlier extension.
 */
export const systemPrompt =
  (text: string): Extension =>
  (pi: ExtensionAPI) => {
    pi.on("before_agent_start", (event) =>
      event.systemPrompt === "" ? { systemPrompt: text } : undefined,
    );
  };

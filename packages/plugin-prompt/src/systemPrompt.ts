import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";

/**
 * Give every request an app-level system prompt.
 *
 * A prompt already carried by the conversation wins, so a per-chat instruction
 * is never silently overridden by the app-wide default. pi chains this event,
 * so `event.systemPrompt` already reflects any earlier extension.
 */
export const systemPrompt = (text: string): IdentifiedPlugin =>
  definePlugin("systemPrompt", { needs: [] }, (tiny) => {
    tiny.on("before_agent_start", (event) =>
      event.systemPrompt === "" ? { systemPrompt: text } : undefined,
    );
  });

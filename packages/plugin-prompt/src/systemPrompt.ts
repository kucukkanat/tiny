import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";

/**
 * Give every request an app-level system prompt; a prompt already carried by
 * the conversation wins.
 */
export const systemPrompt = (text: string): IdentifiedPlugin =>
  definePlugin("systemPrompt", { needs: [] }, (tiny) => {
    tiny.on("before_agent_start", (event) =>
      event.systemPrompt === "" ? { systemPrompt: text } : undefined,
    );
  });

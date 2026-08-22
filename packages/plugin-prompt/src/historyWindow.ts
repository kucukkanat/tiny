import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";

/**
 * Replay only the last `turns` messages of the request; the system prompt and
 * the conversation on disk are untouched.
 */
export const historyWindow = (turns: number): IdentifiedPlugin =>
  definePlugin("historyWindow", { needs: [] }, (tiny) => {
    tiny.on("context", (event) =>
      event.messages.length <= turns ? undefined : { messages: event.messages.slice(-turns) },
    );
  });

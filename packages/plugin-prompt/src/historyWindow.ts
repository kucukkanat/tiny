import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";

/**
 * Replay only the last `turns` messages so a long thread cannot grow the
 * request without bound.
 *
 * The system prompt is not part of `event.messages` — pi keeps it beside the
 * turns — so it always survives the trim. Older turns are dropped from the
 * *request* only; the conversation on disk is untouched.
 */
export const historyWindow = (turns: number): IdentifiedPlugin =>
  definePlugin("historyWindow", { needs: [] }, (tiny) => {
    tiny.on("context", (event) =>
      event.messages.length <= turns ? undefined : { messages: event.messages.slice(-turns) },
    );
  });

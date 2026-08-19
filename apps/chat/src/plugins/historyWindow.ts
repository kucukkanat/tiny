import type { Extension, ExtensionAPI } from "@tiny/ai";

/**
 * Replay only the last `turns` messages so a long thread cannot grow the
 * request without bound.
 *
 * The system prompt is not part of `event.messages` — pi keeps it beside the
 * turns — so it always survives the trim. Older turns are dropped from the
 * *request* only; the conversation on disk is untouched.
 */
export const historyWindow =
  (turns: number): Extension =>
  (pi: ExtensionAPI) => {
    pi.on("context", (event) =>
      event.messages.length <= turns ? undefined : { messages: event.messages.slice(-turns) },
    );
  };

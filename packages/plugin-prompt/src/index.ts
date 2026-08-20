/**
 * Plugins that change what the model is sent.
 *
 * Kept apart from `@tiny/plugin-trace` for exactly that reason: these two
 * rewrite the request, so turning one on changes every reply. Opt in
 * deliberately, one at a time.
 */
export { historyWindow } from "./historyWindow.ts";
export { systemPrompt } from "./systemPrompt.ts";

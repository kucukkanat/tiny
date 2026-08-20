/**
 * Plugins that watch a request and change nothing about it.
 *
 * That is the whole boundary of this package, and why it is separate from
 * `@tiny/plugin-prompt`: everything here is safe to leave on, because neither
 * plugin can alter what the model is sent or what the app renders.
 */
export { streamTrace } from "./streamTrace.ts";
export { usageLogger } from "./usageLogger.ts";

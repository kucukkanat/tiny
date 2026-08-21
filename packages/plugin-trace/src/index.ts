/**
 * Plugins that watch a request and change nothing about it.
 *
 * That is the whole boundary of this package, and why it is separate from
 * `@tiny/plugin-prompt`: everything here is safe to leave on, because nothing
 * here can alter what the model is sent or what the app renders.
 *
 * `approvalLog` watches another plugin rather than the request — the one place
 * in this repo where plugins compose over `tiny.events` — and is safe to leave
 * on for the same reason, and also when the plugin it listens to is absent.
 */
export { approvalLog } from "./approvalLog.ts";
export { streamTrace } from "./streamTrace.ts";
export { usageLogger } from "./usageLogger.ts";

import { defineChannel } from "@tiny/plugin";

/**
 * What this plugin publishes when a tool call is settled.
 *
 * `remembered` distinguishes the answer the user gave from the one their earlier
 * answer gave for them: an audit of what the model was allowed to do wants both,
 * and telling them apart afterwards is impossible.
 */
export type ApprovalDecided = {
  readonly toolName: string;
  readonly approved: boolean;
  /** How it was settled — the difference between consent and a standing rule. */
  readonly by: "user" | "policy" | "remembered" | "no-ui";
  /** Present when the call was blocked; what the model was told. */
  readonly reason?: string | undefined;
};

/**
 * Announced on `tiny.events` for every tool call this plugin settles.
 *
 * Exported so a subscriber imports the contract rather than guessing a string
 * and a shape — see `@tiny/plugin-trace`'s `approvalLog`, which is written
 * against this and knows nothing else about this package. Nothing here requires
 * that plugin to exist, or this one: a channel with no publisher is silent, and
 * one with no subscriber is a no-op.
 */
export const approvalDecided = defineChannel<ApprovalDecided>("hitl.approval.decided");

import { defineChannel } from "@tiny/plugin";

/** What this plugin publishes when a tool call is settled. */
export type ApprovalDecided = {
  readonly toolName: string;
  readonly approved: boolean;
  /** How it was settled — the difference between consent and a standing rule. */
  readonly by: "user" | "policy" | "remembered" | "no-ui";
  /** Present when the call was blocked; what the model was told. */
  readonly reason?: string | undefined;
};

/** Announced on `tiny.events` for every tool call this plugin settles. */
export const approvalDecided = defineChannel<ApprovalDecided>("hitl.approval.decided");

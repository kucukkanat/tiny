import type { IdentifiedPlugin, PluginEventContext, PluginStorage } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";
import { type ApprovalDecided, approvalDecided } from "./channel.ts";
import { inlineApproval, type Verdict } from "./inlineApproval.tsx";
import { createPendingStore } from "./pending.ts";
import {
  decideCall,
  type PendingCall,
  type Policy,
  type Remembered,
  withDecision,
  withoutDecision,
} from "./policy.ts";

export type { ApprovalDecided } from "./channel.ts";
export { approvalDecided } from "./channel.ts";
export type { Verdict } from "./inlineApproval.tsx";
export type { Decision, PendingCall, Policy, Remembered } from "./policy.ts";
export { decideCall, withDecision, withoutDecision } from "./policy.ts";

export type HitlOptions = Policy & {
  /** Sent to the model when a call is denied without a reason of its own. */
  readonly denyReason?: string | undefined;
  /** Display names, so the prompt can say "Write File" rather than `fs_write`. */
  readonly labels?: Readonly<Record<string, string>> | undefined;
  /** The command that lists what the user chose to remember. Defaults to `approvals`. */
  readonly command?: string | undefined;
  /** Set false to drop the "always for this tool" box, so every call is asked. */
  readonly remember?: boolean | undefined;
};

const STORED = "remembered";
const DEFAULT_DENIED = "The user declined this tool call.";
const NO_UI = "Blocked: there is no UI to ask the user for approval.";

const stored = (storage: PluginStorage): Remembered => storage.get<Remembered>(STORED) ?? {};

/**
 * Ask the user before the model runs a tool. Built on pi's `tool_call` event;
 * a denied call becomes an error result the model reads, not the end of the turn.
 */
export const humanInTheLoop = (options: HitlOptions = {}): IdentifiedPlugin =>
  definePlugin("humanInTheLoop", { needs: [] }, (tiny) => {
    const store = createPendingStore();
    tiny.contribute("message.pending", inlineApproval(store));

    const ask = (ctx: PluginEventContext, call: PendingCall): Promise<Verdict | undefined> =>
      store.ask(
        {
          call,
          label: options.labels?.[call.toolName],
          rememberLabel: options.remember === false ? undefined : `Always for ${call.toolName}`,
        },
        // Without the signal, stopping a reply would leave the card up.
        ctx.signal,
      );

    // Every outcome is announced, not just the ones a user answered — an audit needs both.
    const settle = (decided: ApprovalDecided) => {
      tiny.events.emit(approvalDecided, decided);
      return decided.approved ? undefined : { block: true, reason: decided.reason ?? "" };
    };

    tiny.on("tool_call", async (event, ctx) => {
      const call: PendingCall = { toolName: event.toolName, input: event.input };
      const remembered = stored(ctx.storage);
      const decision = decideCall(options, remembered, call);
      const by = remembered[call.toolName] === undefined ? "policy" : "remembered";
      if (decision === "allow") return settle({ toolName: call.toolName, approved: true, by });
      if (decision === "deny")
        return settle({
          toolName: call.toolName,
          approved: false,
          by,
          reason: options.denyReason ?? DEFAULT_DENIED,
        });

      // With no one to ask, the safe answer is no.
      if (!ctx.hasUI)
        return settle({ toolName: call.toolName, approved: false, by: "no-ui", reason: NO_UI });

      const verdict = await ask(ctx, call);
      if (verdict?.remember === true)
        ctx.storage.set(
          STORED,
          withDecision(stored(ctx.storage), call.toolName, verdict.approved ? "allow" : "deny"),
        );
      // A dismissed card is a refusal, not a pass — an unanswered gate counts as blocked.
      if (verdict?.approved === true)
        return settle({ toolName: call.toolName, approved: true, by: "user" });
      return settle({
        toolName: call.toolName,
        approved: false,
        by: "user",
        reason: verdict?.reason ?? options.denyReason ?? DEFAULT_DENIED,
      });
    });

    tiny.registerCommand(options.command ?? "approvals", {
      description: "Review the tool approvals you chose to remember",
      handler: async (_args, ctx) => {
        const current = stored(ctx.storage);
        const entries = Object.entries(current);
        if (entries.length === 0) {
          ctx.ui.notify("Nothing remembered — every tool still asks.", "info");
          return;
        }
        const forgetAll = "Forget all";
        const chosen = await ctx.ui.select("Remembered approvals — pick one to forget", [
          ...entries.map(([name, decision]) => `${decision} ${name}`),
          forgetAll,
        ]);
        if (chosen === undefined) return;
        if (chosen === forgetAll) {
          ctx.storage.set(STORED, {});
          ctx.ui.notify("Every tool will ask again.", "info");
          return;
        }
        const name = chosen.slice(chosen.indexOf(" ") + 1);
        ctx.storage.set(STORED, withoutDecision(stored(ctx.storage), name));
        ctx.ui.notify(`${name} will ask again.`, "info");
      },
    });
  });

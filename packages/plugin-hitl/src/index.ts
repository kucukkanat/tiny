import type { IdentifiedPlugin, PluginEventContext, PluginStorage } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";
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
 * Ask the user before the model runs a tool.
 *
 * Built on pi's `tool_call` event, which fires after the arguments are final and
 * before anything runs, and whose `{ block, reason }` result turns a refusal into
 * an error result the model reads — so a denied call steers the model rather
 * than ending the turn.
 *
 * ```ts
 * export const plugins = [humanInTheLoop({ allow: ["fs_read"] })];
 * ```
 */
export const humanInTheLoop = (options: HitlOptions = {}): IdentifiedPlugin =>
  definePlugin("humanInTheLoop", (tiny) => {
    // The question lives here rather than in a dialog: the card is contributed
    // into the reply, and this is what the two halves talk through.
    const store = createPendingStore();
    tiny.contribute("message.pending", inlineApproval(store));

    const ask = (ctx: PluginEventContext, call: PendingCall): Promise<Verdict | undefined> =>
      store.ask(
        {
          call,
          label: options.labels?.[call.toolName],
          rememberLabel: options.remember === false ? undefined : `Always for ${call.toolName}`,
        },
        // Without the signal, stopping a reply would leave the card up with
        // nothing left to approve.
        ctx.signal,
      );

    tiny.on("tool_call", async (event, ctx) => {
      const call: PendingCall = { toolName: event.toolName, input: event.input };
      const decision = decideCall(options, stored(ctx.storage), call);
      if (decision === "allow") return undefined;
      if (decision === "deny") return { block: true, reason: options.denyReason ?? DEFAULT_DENIED };

      // pi's gates all make this check: with no one to ask, the safe answer is no.
      if (!ctx.hasUI) return { block: true, reason: NO_UI };

      const verdict = await ask(ctx, call);
      if (verdict?.remember === true)
        ctx.storage.set(
          STORED,
          withDecision(stored(ctx.storage), call.toolName, verdict.approved ? "allow" : "deny"),
        );
      // A dismissed card is a refusal, not a pass: the only safe reading of
      // "the user closed the dialog" is that they did not agree.
      if (verdict?.approved === true) return undefined;
      return { block: true, reason: verdict?.reason ?? options.denyReason ?? DEFAULT_DENIED };
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

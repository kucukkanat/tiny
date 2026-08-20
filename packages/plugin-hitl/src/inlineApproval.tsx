import { ApprovalCard, type ApprovalOption } from "@tiny/ui";
import { useSyncExternalStore } from "react";
import type { PendingStore } from "./pending.ts";

/** What the user chose. Dismissing the card returns nothing at all, which denies. */
export type Verdict = {
  readonly approved: boolean;
  /** Keep this answer for every later call to the same tool. */
  readonly remember: boolean;
  /** Sent to the model in place of the tool's result when denied. */
  readonly reason?: string;
};

const OPTIONS: readonly ApprovalOption[] = [
  { id: "approve", label: "Run it" },
  { id: "deny", label: "Don't run it", tone: "danger" },
];

/**
 * The approval, rendered into the reply it belongs to.
 *
 * Contributed to `message.pending`, so it appears under the tool line that is
 * waiting and disappears the moment it is answered — the tool row it sits above
 * then says what happened, which is the record worth keeping.
 */
export const inlineApproval = (store: PendingStore) =>
  function InlineApproval() {
    const pending = useSyncExternalStore(store.subscribe, store.get, store.get);
    if (pending === undefined) return null;

    return (
      <ApprovalCard
        question={`Run ${pending.label ?? pending.call.toolName}?`}
        detail={
          <pre className="max-h-40 overflow-auto rounded-control bg-field p-2 font-mono text-xs leading-[1.5] text-ink-2">
            {JSON.stringify(pending.call.input, null, 2)}
          </pre>
        }
        options={OPTIONS}
        notePlaceholder="Or tell the model what to do instead…"
        rememberLabel={pending.rememberLabel}
        onSubmit={({ optionId, note, remember }) =>
          pending.settle({
            approved: optionId === "approve",
            remember,
            ...(note === "" ? {} : { reason: note }),
          })
        }
        // Dismissing is a refusal, not a pass: the only safe reading of "the
        // user closed the question" is that they did not agree to it.
        onDismiss={() => pending.settle(undefined)}
      />
    );
  };

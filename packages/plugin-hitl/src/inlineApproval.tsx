import { useStore } from "@tiny/plugin";
import { ApprovalCard, type ApprovalOption } from "@tiny/ui";
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

/** The approval card, contributed to `message.pending` in the reply it belongs to. */
export const inlineApproval = (store: PendingStore) =>
  function InlineApproval() {
    const pending = useStore(store);
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
        // Dismissing is a refusal, not a pass — an unanswered gate counts as blocked.
        onDismiss={() => pending.settle(undefined)}
      />
    );
  };

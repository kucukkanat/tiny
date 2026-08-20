import { ApprovalCard } from "@tiny/ui";
import { useState } from "react";

/** Asks before the agent writes, then reports what was decided. */
export function ApprovalCardExample() {
  const [outcome, setOutcome] = useState<string | undefined>(undefined);

  if (outcome !== undefined) return <p className="text-base text-ink-2">{outcome}</p>;

  return (
    <ApprovalCard
      question="Run Write File?"
      detail={
        <pre className="rounded-control bg-field p-2 font-mono text-xs text-ink-2">
          {JSON.stringify({ path: "/notes/hello.md", content: "hi" }, null, 2)}
        </pre>
      }
      options={[
        { id: "approve", label: "Run it" },
        { id: "deny", label: "Don't run it", tone: "danger" },
      ]}
      notePlaceholder="Or tell the model what to do instead…"
      rememberLabel="Always for fs_write"
      onSubmit={({ optionId, note, remember }) =>
        setOutcome(
          `${optionId}${note === "" ? "" : ` — "${note}"`}${remember ? " (remembered)" : ""}`,
        )
      }
      onDismiss={() => setOutcome("dismissed, which denies")}
    />
  );
}

import { type ReactNode, useState } from "react";

/* Approval card: the question an agent asks before it acts, inline in the reply.
 * Choosing an option arms the arrow rather than sending — a mis-click must not spend money. */

export type ApprovalOption = {
  readonly id: string;
  readonly label: string;
  /** Renders in red. For the choice that refuses. */
  readonly tone?: "default" | "danger" | undefined;
};

export type ApprovalOutcome = {
  readonly optionId: string;
  /** Whatever was typed in the free-text row; empty when it was left alone. */
  readonly note: string;
  readonly remember: boolean;
};

const row =
  "-mx-1.5 flex items-center gap-2 rounded-control px-1.5 py-1 text-left transition-colors duration-100 hover:bg-hover";

export function ApprovalCard({
  question,
  detail,
  options,
  notePlaceholder = "Type something…",
  rememberLabel,
  onSubmit,
  onDismiss,
}: {
  question: string;
  /** Shown under the question — the arguments, usually. */
  detail?: ReactNode;
  options: readonly ApprovalOption[];
  notePlaceholder?: string;
  /** Omit to hide the checkbox entirely. */
  rememberLabel?: string | undefined;
  onSubmit: (outcome: ApprovalOutcome) => void;
  onDismiss?: (() => void) | undefined;
}) {
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const [note, setNote] = useState("");
  const [remember, setRemember] = useState(false);

  const chosen = options.find((option) => option.id === picked);
  const ready = chosen !== undefined;
  const danger = chosen?.tone === "danger";

  return (
    <div
      className="w-full max-w-80 overflow-hidden rounded-card bg-surface shadow-card"
      data-testid="approval-card"
      style={{ animation: "fade-up 350ms var(--ease-out-strong) both" }}
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          <span className="text-base font-medium text-ink">{question}</span>
          {onDismiss !== undefined && (
            <button
              type="button"
              aria-label="Dismiss"
              data-testid="approval-dismiss"
              onClick={onDismiss}
              className="flex size-6 shrink-0 items-center justify-center rounded-[5px] text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {detail !== undefined && <div className="mt-2">{detail}</div>}

        <div className="mt-2 flex flex-col gap-0.5">
          {options.map((option) => {
            const on = option.id === picked;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={on}
                data-testid={`approval-option-${option.id}`}
                onClick={() => setPicked(option.id)}
                className={row}
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${
                    on
                      ? option.tone === "danger"
                        ? "bg-red"
                        : "bg-ink"
                      : "shadow-[inset_0_0_0_1.5px_var(--line-strong)]"
                  }`}
                >
                  <span
                    className="size-1.5 rounded-full bg-canvas transition-transform duration-200"
                    style={{ transform: on ? "scale(1)" : "scale(0)" }}
                  />
                </span>
                <span
                  className={`text-base transition-colors duration-200 ${
                    on ? (option.tone === "danger" ? "text-red" : "text-ink") : "text-ink-2"
                  }`}
                >
                  {option.label}
                </span>
              </button>
            );
          })}

          {/* The free-text row sits among the options: another way to answer. */}
          <label className="-mx-1.5 flex items-center gap-2 rounded-control px-1.5 py-1 transition-colors duration-100 focus-within:bg-hover hover:bg-hover">
            <span aria-hidden className="size-4 shrink-0" />
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={notePlaceholder}
              aria-label="Note"
              data-testid="approval-note"
              className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
            />
          </label>
        </div>
      </div>

      <div className="flex items-center justify-between px-3 pb-3">
        {rememberLabel === undefined ? (
          <span />
        ) : (
          <button
            type="button"
            aria-pressed={remember}
            data-testid="approval-remember"
            onClick={() => setRemember((current) => !current)}
            className={`${row} text-ink-2`}
          >
            <span
              className={`flex size-4 shrink-0 items-center justify-center rounded-[5px] transition-colors duration-200 ${
                remember
                  ? "bg-ink text-canvas"
                  : "text-transparent shadow-[inset_0_0_0_1.5px_var(--line-strong)]"
              }`}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </span>
            <span className="text-smd">{rememberLabel}</span>
          </button>
        )}

        <button
          type="button"
          aria-label="Send"
          data-testid="approval-send"
          disabled={!ready}
          onClick={() => {
            if (chosen === undefined) return;
            onSubmit({ optionId: chosen.id, note: note.trim(), remember });
          }}
          className="-mr-0.5 flex size-7 items-center justify-center rounded-[8px] transition-[background-color,color,transform] duration-200 enabled:active:scale-[0.96]"
          style={{
            background: ready ? (danger ? "var(--red)" : "var(--ink)") : "var(--field)",
            color: ready ? "var(--surface)" : "var(--ink-3)",
            boxShadow: ready ? "inset 0 1px 0 rgba(255,255,255,0.14)" : "var(--shadow-hairline)",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

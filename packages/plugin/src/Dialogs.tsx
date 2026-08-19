import { useEffect, useRef, useState } from "react";
import type { NotifyLevel } from "./types.ts";

/** A pending `ctx.ui.*` dialog, mirroring RPC's id-keyed request/response. */
export type DialogRequest =
  | { kind: "select"; id: string; title: string; options: readonly string[] }
  | { kind: "confirm"; id: string; title: string; message: string }
  | { kind: "input"; id: string; title: string; placeholder: string | undefined }
  | { kind: "editor"; id: string; title: string; prefill: string | undefined }
  | { kind: "custom"; id: string; render: (done: (value: unknown) => void) => React.ReactNode };

export type Toast = { readonly id: string; readonly message: string; readonly type: NotifyLevel };

const overlay =
  "fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 backdrop-blur-[2px]";
const card = "w-full max-w-sm rounded-card bg-surface p-4 shadow-overlay";
const title = "text-[13.5px] font-semibold text-ink";
const body = "mt-1 text-[12.5px] leading-[1.5] text-ink-2";
const field =
  "mt-3 h-8 w-full rounded-control bg-field px-2.5 text-[13px] text-ink shadow-hairline outline-none placeholder:text-ink-3 focus:shadow-[0_0_0_1px_var(--line-strong)]";
const row = "mt-4 flex justify-end gap-2";
const btn = "h-8 rounded-control px-3 text-[12.5px] font-medium";
const primary = `${btn} bg-accent text-accent-ink`;
const ghost = `${btn} text-ink-2 hover:bg-hover`;

/** Escape always cancels, matching pi's dialogs. */
function useEscape(onCancel: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel]);
}

export function Dialog({
  request,
  onResolve,
  onCancel,
}: {
  request: DialogRequest;
  onResolve: (value: unknown) => void;
  onCancel: () => void;
}) {
  useEscape(onCancel);

  if (request.kind === "custom")
    return (
      <div className={overlay} data-testid="plugin-dialog" role="dialog" aria-modal="true">
        {request.render(onResolve)}
      </div>
    );

  return (
    <div className={overlay} data-testid="plugin-dialog" role="dialog" aria-modal="true">
      <div className={card}>
        <p className={title}>{request.title}</p>

        {request.kind === "confirm" && (
          <>
            <p className={body}>{request.message}</p>
            <div className={row}>
              <button type="button" className={ghost} onClick={onCancel} data-testid="dialog-no">
                No
              </button>
              <button
                type="button"
                className={primary}
                onClick={() => onResolve(true)}
                data-testid="dialog-yes"
              >
                Yes
              </button>
            </div>
          </>
        )}

        {request.kind === "select" && (
          <div className="mt-3 flex flex-col gap-1">
            {request.options.map((option) => (
              <button
                key={option}
                type="button"
                data-testid={`dialog-option-${option}`}
                className="h-8 rounded-control px-2 text-left text-[12.5px] text-ink hover:bg-hover"
                onClick={() => onResolve(option)}
              >
                {option}
              </button>
            ))}
          </div>
        )}

        {(request.kind === "input" || request.kind === "editor") && (
          <TextPrompt request={request} onResolve={onResolve} onCancel={onCancel} />
        )}
      </div>
    </div>
  );
}

function TextPrompt({
  request,
  onResolve,
  onCancel,
}: {
  request: Extract<DialogRequest, { kind: "input" | "editor" }>;
  onResolve: (value: unknown) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(request.kind === "editor" ? (request.prefill ?? "") : "");
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  return (
    <>
      {request.kind === "input" ? (
        <input
          ref={ref as React.RefObject<HTMLInputElement>}
          className={field}
          value={value}
          placeholder={request.placeholder ?? ""}
          data-testid="dialog-input"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onResolve(value);
          }}
        />
      ) : (
        <textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          className={`${field} h-32 resize-none py-2`}
          value={value}
          data-testid="dialog-editor"
          onChange={(event) => setValue(event.target.value)}
        />
      )}
      <div className={row}>
        <button type="button" className={ghost} onClick={onCancel} data-testid="dialog-cancel">
          Cancel
        </button>
        <button
          type="button"
          className={primary}
          onClick={() => onResolve(value)}
          data-testid="dialog-ok"
        >
          OK
        </button>
      </div>
    </>
  );
}

const toastTone: Record<NotifyLevel, string> = {
  info: "text-ink",
  warning: "text-orange",
  error: "text-red",
};

export function Toasts({ toasts }: { toasts: readonly Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
      {toasts.map((toast) => (
        <output
          key={toast.id}
          data-testid="plugin-toast"
          className={`rounded-control bg-surface px-3 py-1.5 text-[12.5px] shadow-overlay ${toastTone[toast.type]}`}
          style={{ animation: "fade-up 200ms var(--ease-out-strong) both" }}
        >
          {toast.message}
        </output>
      ))}
    </div>
  );
}

import { Fragment, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GlideMenu } from "./GlideMenu.tsx";

function Icon({ children, size = 15 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/**
 * One entry in the model picker. `group` heads a section, so models coming from
 * different endpoints stay told apart when several are configured.
 */
export type ModelOption = {
  readonly value: string;
  readonly label: string;
  readonly group?: string | undefined;
};

/* The Beautiful UI composer, pared down to its essentials: an autosizing
 * textarea, a model picker that opens upward, and a tactile send button that
 * doubles as stop while a reply streams. Enter sends, Shift+Enter breaks. */
export function PromptBar({
  onSend,
  busy,
  onStop,
  models,
  model,
  onModelChange,
  placeholder = "Write a message…",
  disabled = false,
  actions,
  text,
  onTextChange,
}: {
  onSend: (text: string) => void;
  busy: boolean;
  onStop: () => void;
  models: readonly ModelOption[];
  model: string;
  onModelChange: (model: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Rendered beside the model picker; the app fills this with a plugin slot. */
  actions?: ReactNode;
  /** The draft. Controlled: this component owns no copy of it. */
  text: string;
  onTextChange: (text: string) => void;
}) {
  const draft = text;
  // `model` is an option value, which need not be the name worth showing.
  const selectedLabel = models.find((option) => option.value === model)?.label ?? "Choose model";

  const [modelOpen, setModelOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: draft drives scrollHeight, which the DOM owns
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    input.style.height = "0px";
    const height = Math.min(Math.max(input.scrollHeight, 28), 160);
    input.style.height = `${height}px`;
    input.style.overflowY = input.scrollHeight > 160 ? "auto" : "hidden";
  }, [draft]);

  useEffect(() => {
    if (!modelOpen) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-promptbar]") === null)
        setModelOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [modelOpen]);

  const canSend = !disabled && !busy && draft.trim().length > 0;
  const send = () => {
    if (!canSend) return;
    onSend(draft.trim());
    onTextChange("");
  };

  return (
    <div data-promptbar className="relative">
      {modelOpen && (
        <div
          className="absolute bottom-full left-0 z-10 mb-2 max-h-64 w-64 overflow-y-auto rounded-card bg-surface p-1 shadow-raised"
          style={{
            animation: "pop-in 180ms var(--ease-out-strong) both",
            transformOrigin: "bottom left",
          }}
        >
          <GlideMenu
            className="flex flex-col gap-px"
            highlightClassName="inset-x-0 rounded-[6px] bg-hover"
          >
            {models.map((option, index) => (
              <Fragment key={option.value}>
                {/* A heading only where the group actually changes, so a single
                    ungrouped endpoint renders exactly as it always did. */}
                {option.group !== undefined && option.group !== models[index - 1]?.group && (
                  <div className="px-2 pt-1.5 pb-0.5 text-2xs font-semibold tracking-wide text-ink-3 uppercase">
                    {option.group}
                  </div>
                )}
                <button
                  data-row
                  type="button"
                  onClick={() => {
                    onModelChange(option.value);
                    setModelOpen(false);
                    inputRef.current?.focus();
                  }}
                  className="relative z-10 flex h-7.5 w-full items-center gap-2 rounded-[6px] px-2 text-left"
                >
                  <span className="min-w-0 flex-1 truncate text-smd font-medium text-ink">
                    {option.label}
                  </span>
                  <span
                    className={`shrink-0 text-ink ${option.value === model ? "" : "invisible"}`}
                  >
                    <Icon size={13}>
                      <path d="M20 6L9 17l-5-5" />
                    </Icon>
                  </span>
                </button>
              </Fragment>
            ))}
            {models.length === 0 && (
              <div className="flex h-9 items-center px-2 text-sm text-ink-3">
                No models — check settings
              </div>
            )}
          </GlideMenu>
        </div>
      )}

      <div className="flex flex-col gap-1.5 rounded-[14px] border border-line bg-surface p-1.5 shadow-card transition-[border-color] duration-150 focus-within:border-line-strong">
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          disabled={disabled}
          onChange={(event) => onTextChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              send();
            }
          }}
          placeholder={placeholder}
          aria-label="Prompt"
          className="min-h-7 w-full resize-none bg-transparent px-1 py-[5px] text-base leading-[18px] text-ink outline-none [overflow-wrap:anywhere] placeholder:text-ink-3"
        />
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              aria-expanded={modelOpen}
              aria-label="Choose model"
              onClick={() => setModelOpen((current) => !current)}
              className="flex h-7 items-center gap-1 rounded-control px-1.5 text-sm font-medium text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
            >
              {selectedLabel}
              <span className="text-ink-3">
                <Icon size={11}>
                  <path d="M6 9l6 6 6-6" />
                </Icon>
              </span>
            </button>
            {actions}
          </div>
          {busy ? (
            <button
              type="button"
              aria-label="Stop"
              onClick={onStop}
              className="flex size-7 items-center justify-center rounded-control bg-ink text-surface transition-transform duration-200 active:scale-[0.94]"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                <rect width="10" height="10" rx="2" fill="currentColor" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              aria-label="Send"
              disabled={!canSend}
              onClick={send}
              className="flex size-7 items-center justify-center rounded-control transition-[background-color,color,transform] duration-200 enabled:active:scale-[0.94]"
              style={{
                background: canSend ? "var(--ink)" : "var(--line-strong)",
                color: canSend ? "var(--surface)" : "var(--ink-2)",
              }}
            >
              <Icon size={16}>
                <path d="M12 19V5M5 12l7-7 7 7" />
              </Icon>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

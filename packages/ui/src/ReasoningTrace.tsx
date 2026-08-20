import { useState } from "react";
import { ShimmerLabel } from "./Loader.tsx";

/* Expandable reasoning trace: shimmering "Thinking" while the model reasons,
 * settling into "Thought for Ns" that stays expandable. Auto-expands while
 * working; the reader can toggle it any time. */
export function ReasoningTrace({
  working,
  seconds,
  text,
}: {
  working: boolean;
  seconds: number;
  text: string;
}) {
  const [manualExpanded, setManualExpanded] = useState<boolean | undefined>(undefined);
  const expanded = manualExpanded ?? working;

  return (
    <div className="flex w-full flex-col">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setManualExpanded((current) => !(current ?? working))}
        className="-mx-1.5 flex w-fit items-center gap-2 rounded-control px-1.5 py-1 transition-colors duration-100 hover:bg-hover-2"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          aria-hidden
          fill={working ? "var(--ink-2)" : "var(--ink-3)"}
        >
          <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
        </svg>
        {working ? (
          <ShimmerLabel>Thinking</ShimmerLabel>
        ) : (
          <span
            className="whitespace-nowrap text-base font-medium text-ink-2"
            style={{ animation: "fade-in 350ms ease-out both" }}
          >
            {seconds > 0 ? `Thought for ${seconds}s` : "Thought"}
          </span>
        )}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          aria-hidden
          fill="none"
          stroke="var(--ink-3)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform duration-300"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-400"
        style={{
          gridTemplateRows: expanded ? "1fr" : "0fr",
          opacity: expanded ? 1 : 0,
          transitionTimingFunction: "var(--ease-out-strong)",
        }}
      >
        <div className="overflow-hidden">
          <div className="relative mt-1 ml-[5px] pl-4">
            <span aria-hidden className="absolute top-0 bottom-1 left-[3px] w-px bg-line" />
            <p className="whitespace-pre-wrap py-1 text-smd leading-relaxed text-ink-2">{text}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

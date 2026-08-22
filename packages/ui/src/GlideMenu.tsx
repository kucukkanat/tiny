import { type PointerEvent, type ReactNode, useRef, useState } from "react";

/* A single highlight that glides to the hovered `[data-row]` child. */
export function GlideMenu({
  children,
  className = "",
  highlightClassName = "inset-x-0 rounded-control bg-hover-2",
}: {
  children: ReactNode;
  className?: string;
  highlightClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);

  const move = (event: PointerEvent) => {
    if (!(event.target instanceof Element)) return;
    const row = event.target.closest("[data-row]");
    if (row instanceof HTMLElement && ref.current?.contains(row))
      setBox({ top: row.offsetTop, height: row.offsetHeight });
  };

  return (
    <div
      ref={ref}
      className={`relative ${className}`}
      onPointerMove={move}
      onPointerLeave={() => setBox(null)}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute ${highlightClassName}`}
        style={{
          top: box?.top ?? 0,
          height: box?.height ?? 0,
          opacity: box ? 1 : 0,
          transition:
            "top 220ms var(--ease-out-strong), height 220ms var(--ease-out-strong), opacity 150ms ease",
        }}
      />
      {children}
    </div>
  );
}

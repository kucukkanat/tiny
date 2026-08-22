import { useEffect, useState } from "react";

/* Pixel-grid loader: a wavefront sweeps a 3×3 grid beside a shimmer label and timer. */

const DELAYS = Array.from({ length: 9 }, (_, i) => {
  const row = Math.floor(i / 3);
  const column = i % 3;
  return (column + Math.abs(row - 1)) * 90;
});

function useElapsed(): string {
  const [deciseconds, setDeciseconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setDeciseconds((d) => d + 1), 100);
    return () => clearInterval(timer);
  }, []);
  const total = deciseconds / 10;
  if (total < 60) return `${total.toFixed(1)}s`;
  return `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`;
}

export function ShimmerLabel({ children }: { children: string }) {
  return (
    <span
      className="bg-clip-text text-base font-medium text-transparent"
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--ink-3) 35%, var(--ink) 50%, var(--ink-3) 65%)",
        backgroundSize: "200% 100%",
        animation: "shimmer-text 1.4s linear infinite",
      }}
    >
      {children}
    </span>
  );
}

export function Loader({ label = "Thinking" }: { label?: string }) {
  const elapsed = useElapsed();
  return (
    <div role="status" className="flex w-fit items-center gap-2.5">
      <span aria-hidden className="grid shrink-0 grid-cols-[repeat(3,4px)] gap-[1.5px]">
        {DELAYS.map((delay, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: static 9-cell grid, position is the identity
            key={index}
            className="size-[4px] rounded-[1px] bg-ink"
            style={{
              opacity: 0.15,
              animation: `pixel-on 650ms ease-in-out ${delay}ms infinite`,
            }}
          />
        ))}
      </span>
      <ShimmerLabel>{label}</ShimmerLabel>
      <span className="font-mono text-sm text-ink-3 tabular-nums">{elapsed}</span>
    </div>
  );
}

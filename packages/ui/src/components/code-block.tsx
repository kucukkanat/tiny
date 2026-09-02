import { useCopy } from '@tiny/ui/hooks/use-copy'
import { CheckIcon, CopyIcon } from 'lucide-react'

/** A listing with a name on it, numbers down the side, and a copy button. */
export function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, copy] = useCopy()

  return (
    <div
      className="rounded-card bg-surface shadow-card overflow-hidden"
      data-testid={`code-${label.toLowerCase()}`}
    >
      <div className="border-line flex h-9 items-center gap-2 border-b px-3 text-xs">
        <span className="text-ink truncate font-mono">{label}</span>
        <button
          type="button"
          aria-label={`Copy ${label.toLowerCase()}`}
          data-testid={`code-copy-${label.toLowerCase()}`}
          className="text-ink-3 hover:bg-hover hover:text-ink rounded-chip ml-auto flex h-6 shrink-0 items-center gap-1 px-1.5 font-medium transition-colors"
          onClick={() => copy(code)}
        >
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="text-ink-2 relative py-2 font-mono text-xs leading-[1.65]">
        {/* One rule down the gutter, drawn behind the lines rather than per row. */}
        <span
          aria-hidden
          className="bg-line pointer-events-none absolute inset-y-0 left-8 w-px"
        />
        {code.split('\n').map((line, number) => (
          <div key={number} className="grid grid-cols-[2rem_minmax(0,1fr)] items-start">
            <span className="text-ink-3 shrink-0 text-center text-[11px] select-none">
              {number + 1}
            </span>
            <code className="pr-3 pl-2 break-words whitespace-pre-wrap">{line}</code>
          </div>
        ))}
      </div>
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { Icon } from './Icon'

/** Beautiful UI's composer: auto-growing prompt, model picker, send / stop. */
export function PromptBar({
  value,
  onChange,
  onSubmit,
  onStop,
  busy = false,
  placeholder = 'Ask anything…',
  models = [],
  model = '',
  onModelChange,
  autoFocus,
}: {
  value: string
  onChange(next: string): void
  onSubmit(): void
  onStop?(): void
  busy?: boolean
  placeholder?: string
  models?: string[]
  model?: string
  onModelChange?(next: string): void
  autoFocus?: boolean
}) {
  const textarea = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textarea.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [value])

  const canSend = value.trim().length > 0 && !busy

  return (
    <div className="flex flex-col gap-2.5 rounded-[22px] border border-line bg-surface p-3 shadow-card transition-colors focus-within:border-line-strong">
      <textarea
        ref={textarea}
        rows={1}
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        aria-label="Prompt"
        data-testid="prompt-input"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (canSend) onSubmit()
          }
        }}
        className="max-h-[200px] min-h-[52px] w-full resize-none bg-transparent px-1 py-1 text-[15px] leading-5 text-ink outline-none [overflow-wrap:anywhere] placeholder:text-ink-3 sm:text-[14px]"
      />
      <div className="flex items-center gap-2">
        <select
          value={model}
          disabled={models.length === 0}
          aria-label="Model"
          data-testid="prompt-model"
          onChange={(e) => onModelChange?.(e.target.value)}
          className="h-8 min-w-0 max-w-[55%] shrink truncate rounded-control bg-transparent px-1.5 text-[12.5px] font-medium text-ink-2 outline-none transition-colors hover:bg-hover disabled:opacity-50"
        >
          {models.length === 0 && <option value="">No model</option>}
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <span className="flex-1" />
        {busy && onStop ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop"
            data-testid="prompt-stop"
            className="flex size-10 items-center justify-center rounded-control bg-field text-ink transition-transform active:scale-[0.94] sm:size-8"
          >
            <Icon name="stop" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSend}
            aria-label="Send"
            data-testid="prompt-send"
            className="flex size-10 items-center justify-center rounded-control bg-accent text-white transition-[background-color,transform] duration-200 enabled:active:scale-[0.94] disabled:bg-line-strong disabled:text-ink-2 sm:size-8"
          >
            <Icon name="send" />
          </button>
        )}
      </div>
    </div>
  )
}

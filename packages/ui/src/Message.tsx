/** A user turn (bubble) or an assistant turn (plain block), as Beautiful UI renders them. */
export function Message({ role, children }: { role: 'user' | 'assistant'; children: string }) {
  if (role === 'user') {
    return (
      <div className="flex justify-end pl-8" data-testid="message-user">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-xl bg-field px-3 py-2 text-[15px] leading-[1.45] text-ink sm:text-[14px]">
          {children}
        </div>
      </div>
    )
  }
  return (
    <div
      data-testid="message-assistant"
      className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink [animation:fade-up_400ms_var(--ease-out-strong)_both] sm:text-[14px]"
    >
      {children}
    </div>
  )
}

/** Shown between sending a prompt and the first token arriving. */
export function Thinking() {
  return (
    <p className="shimmer text-[14px] font-medium" data-testid="thinking">
      Thinking…
    </p>
  )
}

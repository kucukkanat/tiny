import { Button } from '@tiny/ui/components/button'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { answerQuestion, useQuestions, type Question } from './ask'

/** Whatever a tool that called `ask` is still waiting for. Chat renders this. */
export function ToolQuestions() {
  const questions = useQuestions()
  const [at, setAt] = useState(0)
  // One card at a time, so answering the first doesn't move the second under
  // your thumb. The index survives an answer; it just can't outrun the list.
  const index = Math.min(at, questions.length - 1)
  const question = questions[index]

  return question ? (
    <Approval
      key={question.id}
      question={question}
      index={index}
      count={questions.length}
      onMove={setAt}
    />
  ) : null
}

function Approval({
  question: { id, question, options },
  index,
  count,
  onMove,
}: {
  question: Question
  index: number
  count: number
  onMove: (index: number) => void
}) {
  const [answer, setAnswer] = useState('')

  return (
    <form
      className="rounded-card bg-surface shadow-card flex flex-col"
      data-testid="tool-question"
      onSubmit={(event) => {
        event.preventDefault()
        answerQuestion(id, answer)
      }}
    >
      <div className="flex flex-col gap-2.5 p-3.5">
        <p className="text-ink text-sm font-medium">{question}</p>

        <div className="flex flex-col gap-1">
          {options.map((option, choice) => (
            <button
              key={option}
              type="button"
              aria-pressed={answer === option}
              data-testid={`tool-option-${choice}`}
              className="rounded-control hover:bg-hover flex items-center gap-2 py-1.5 pr-2 pl-1 text-left transition-colors"
              onClick={() => setAnswer(option)}
            >
              <span
                className={`flex size-4 shrink-0 items-center justify-center rounded-full transition-colors ${
                  answer === option
                    ? 'bg-brand'
                    : 'shadow-[inset_0_0_0_1.5px_var(--line-strong)]'
                }`}
              >
                <span
                  className={`bg-surface size-1.5 rounded-full transition-transform ${
                    answer === option ? 'scale-100' : 'scale-0'
                  }`}
                />
              </span>
              <span
                className={`text-sm leading-none ${answer === option ? 'text-ink' : 'text-ink-2'}`}
              >
                {option}
              </span>
            </button>
          ))}

          <input
            autoFocus={options.length === 0}
            data-testid="tool-answer"
            autoComplete="off"
            aria-label="Your answer"
            placeholder={options.length > 0 ? 'Something else…' : 'Type your answer'}
            className="text-ink placeholder:text-ink-3 h-9 min-w-0 bg-transparent pl-1 text-sm outline-none"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
          />
        </div>
      </div>

      <div className="border-line flex items-center justify-between gap-3 border-t px-3 py-2">
        <div className="text-ink-3 flex items-center gap-1">
          {count > 1 && (
            <>
              <Pager
                label="Previous question"
                testid="tool-previous"
                icon={<ChevronLeftIcon className="size-4" />}
                disabled={index === 0}
                onClick={() => onMove(index - 1)}
              />
              <span className="text-xs font-medium tabular-nums">
                {index + 1} / {count}
              </span>
              <Pager
                label="Next question"
                testid="tool-next"
                icon={<ChevronRightIcon className="size-4" />}
                disabled={index === count - 1}
                onClick={() => onMove(index + 1)}
              />
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Skipping still answers — a tool left awaiting `ask` never returns. */}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="tool-skip"
            className="rounded-full"
            onClick={() => answerQuestion(id, '')}
          >
            Skip
          </Button>
          <Button
            type="submit"
            size="sm"
            data-testid="tool-continue"
            className="rounded-full"
            disabled={answer.trim().length === 0}
          >
            Continue
          </Button>
        </div>
      </div>
    </form>
  )
}

const Pager = ({
  label,
  testid,
  icon,
  disabled,
  onClick,
}: {
  label: string
  testid: string
  icon: ReactNode
  disabled: boolean
  onClick: () => void
}) => (
  <button
    type="button"
    aria-label={label}
    data-testid={testid}
    disabled={disabled}
    onClick={onClick}
    className="enabled:hover:text-ink flex size-6 items-center justify-center rounded-[5px] transition-colors disabled:opacity-30"
  >
    {icon}
  </button>
)

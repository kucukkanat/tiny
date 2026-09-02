import { Button } from '@tiny/ui/components/button'
import { Input } from '@tiny/ui/components/input'
import { useState } from 'react'
import { answerQuestion, useQuestions, type Question } from './ask'

/** Whatever a tool that called `ask` is still waiting for. Chat renders this. */
export function ToolQuestions() {
  const questions = useQuestions()

  return (
    <>
      {questions.map((question) => (
        <Answer key={question.id} {...question} />
      ))}
    </>
  )
}

function Answer({ id, question }: Question) {
  const [answer, setAnswer] = useState('')

  return (
    <form
      className="border-line bg-inset rounded-card flex flex-col gap-2 border p-3"
      data-testid="tool-question"
      onSubmit={(event) => {
        event.preventDefault()
        answerQuestion(id, answer)
      }}
    >
      <p className="text-sm">{question}</p>
      <div className="flex items-stretch gap-2">
        <Input
          autoFocus
          data-testid="tool-answer"
          autoComplete="off"
          className="h-control flex-1"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
        />
        <Button
          type="submit"
          data-testid="tool-answer-send"
          className="h-control px-4"
          disabled={answer.trim().length === 0}
        >
          Answer
        </Button>
      </div>
    </form>
  )
}

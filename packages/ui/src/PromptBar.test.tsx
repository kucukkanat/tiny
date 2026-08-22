import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PromptBar } from './PromptBar'

const setup = (props: Partial<Parameters<typeof PromptBar>[0]> = {}) => {
  const onSubmit = vi.fn()
  const onChange = vi.fn()
  render(<PromptBar value="hi" onChange={onChange} onSubmit={onSubmit} {...props} />)
  return { onSubmit, onChange }
}

describe('PromptBar', () => {
  it('sends on Enter', async () => {
    const { onSubmit } = setup()
    await userEvent.type(screen.getByTestId('prompt-input'), '{Enter}')
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('makes a newline on Shift+Enter', async () => {
    const { onSubmit, onChange } = setup()
    await userEvent.type(screen.getByTestId('prompt-input'), '{Shift>}{Enter}{/Shift}')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledWith('hi\n')
  })

  it('will not send blank prompts', async () => {
    const { onSubmit } = setup({ value: '   ' })
    expect(screen.getByTestId('prompt-send')).toBeDisabled()
    await userEvent.type(screen.getByTestId('prompt-input'), '{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('offers stop instead of send while a reply is streaming', () => {
    setup({ busy: true, onStop: vi.fn() })
    expect(screen.getByTestId('prompt-stop')).toBeInTheDocument()
    expect(screen.queryByTestId('prompt-send')).not.toBeInTheDocument()
  })

  it('lists the models it was given', () => {
    setup({ models: ['a', 'b'], model: 'b', onModelChange: vi.fn() })
    expect(screen.getByTestId('prompt-model')).toHaveValue('b')
  })
})

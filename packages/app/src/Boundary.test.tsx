import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Boundary } from './Boundary'

const Explode = (): never => {
  throw new Error('the reply blew up')
}

afterEach(() => vi.restoreAllMocks())

describe('Boundary', () => {
  it('passes children through when nothing is wrong', () => {
    render(
      <Boundary>
        <p>all fine</p>
      </Boundary>,
    )
    expect(screen.getByText('all fine')).toBeInTheDocument()
  })

  it('shows the failure instead of an empty page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <Boundary>
        <Explode />
      </Boundary>,
    )
    expect(screen.getByTestId('crash')).toHaveTextContent('the reply blew up')
    expect(screen.getByTestId('crash-reload')).toBeInTheDocument()
  })
})

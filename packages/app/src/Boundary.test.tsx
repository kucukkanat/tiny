import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('shows the stack, so a report names the code and not a minified letter', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <Boundary>
        <Explode />
      </Boundary>,
    )
    expect(screen.getByText(/Explode/)).toBeInTheDocument()
  })

  it('drops a stale service worker and its caches before reloading', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const unregister = vi.fn().mockResolvedValue(true)
    const del = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: async () => [{ unregister }] } })
    vi.stubGlobal('caches', { keys: async () => ['precache-v1'], delete: del })
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })

    render(
      <Boundary>
        <Explode />
      </Boundary>,
    )
    await userEvent.click(screen.getByTestId('crash-reload'))

    expect(unregister).toHaveBeenCalled()
    expect(del).toHaveBeenCalledWith('precache-v1')
    expect(reload).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

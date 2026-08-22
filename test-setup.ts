/// <reference types="bun" />
import { GlobalRegistrator } from '@happy-dom/global-registrator'

// HashRouter needs a real URL to parse; happy-dom defaults to about:blank.
GlobalRegistrator.register({ url: 'http://localhost/' })

const { cleanup } = await import('@testing-library/react')
const { afterEach, beforeEach } = await import('bun:test')

// Testing Library only auto-cleans when afterEach is a global, and under bun it isn't.
afterEach(cleanup)
beforeEach(() => {
  localStorage.clear()
  window.location.hash = ''
})

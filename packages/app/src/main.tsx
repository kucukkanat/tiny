import '@tiny/ui/globals.css'
import { applyTheme, readTheme, watchSystemTheme } from '@tiny/ui/lib/theme'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'

const root = document.getElementById('root')
if (!root) throw new Error('#root missing from index.html')

// index.html ships dark; this is the one place a stored choice overrides it.
applyTheme(readTheme())
watchSystemTheme()

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

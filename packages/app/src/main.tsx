import '@tiny/ui/globals.css'
import { applyTheme, readTheme, watchSystemTheme } from '@tiny/ui/lib/theme'
import { StrictMode } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { createRoot } from 'react-dom/client'
import { App } from './app'

const root = document.getElementById('root')
if (!root) throw new Error('#root missing from index.html')

// index.html ships dark; this is the one place a stored choice overrides it.
applyTheme(readTheme())
watchSystemTheme()

// Without this the worker installs a new build but leaves the tab on the old one.
registerSW({ immediate: true })

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

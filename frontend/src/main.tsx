import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { captureInstallPrompt } from './features/pwa/browser'
// Self-hosted font: works offline and sends no visitor data to a font CDN
import '@fontsource-variable/inter/index.css'
import './styles/globals.css'

captureInstallPrompt()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
